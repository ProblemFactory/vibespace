'use strict';
// THE DOC WINDOW'S RULES (lane doc-window, 2.369.215; docs/design-artifacts.zh.md §Doc window) — PURE, imports nothing,
// DOM-free. CJS like src/design-model.js: the hub (src/server/doc-engine.js) spells the comments line with it, the
// window (src/lib/doc-window.js + the lazy src/doc-editor-entry.js) judges with the SAME functions, and
// scripts/test-doc-model.mjs reads every table below.
//   · THE FIDELITY RULE (owner: never a silent rewrite of her or the agent's file): `rawReasons(source)` names what the
//     rich editor cannot carry even block by block (CRLF, a size past the cap — each with its WHY in `RAW_WHY`) ⇒ the
//     window opens RAW and says why. `patchBlocks` is the save: untouched blocks keep their lines byte-identical
//     (lane doc-editor-wheel). `fidelityVerdict(source, roundTripped)` = the whole-document compare (kept for callers).
//   · THE COMMENTS MESSAGE: `commentsText(path, items)` = `[Doc comments] <path>\n① "quoted…" — note\n② …` (a quote
//     ≤ 200 chars, a note ≤ 1000, ≤ 20 items, the whole ≤ 4 KB UTF-8); `commentsVerdict` refuses by name.
//   · THE EDIT NOTE: `editSummary(before, after)` = "+a −b lines; sections: <the headings whose section changed, ≤ 3>".
//   · THE CONFLICT TABLE: `conflictVerdict` (disk moved × unsaved edits × "Keep editing") and `saveVerdict` (the one ask
//     before a save over a newer disk version).

const LIMITS = Object.freeze({ quote: 200, note: 1000, items: 20, messageBytes: 4096, headings: 3, source: 1024 * 1024, pathChars: 400, lcsCells: 4e6 });
const DOC_EXT = /\.(md|markdown)$/i;
const isDocPath = (p) => typeof p === 'string' && DOC_EXT.test(p);

const utf8Len = (s) => { let n = 0; for (const ch of String(s)) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
const oneLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const clip = (s, n) => { const a = Array.from(s); return a.length > n ? a.slice(0, n - 1).join('') + '…' : s; };

// ── the fidelity rule ──
/** The lines outside fenced code blocks, with their index (a table or a tag inside a fence is code, not formatting). */
function proseLines(source) {
  const out = [];
  let fence = null;
  String(source).split('\n').forEach((line, i) => {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) { if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !line.slice(m[0].length).trim()) fence = null; return; }
    if (m) { fence = m[1]; return; }
    out.push({ line, i });
  });
  return out;
}
const RAW_RULES = [
  ['crlf', (s) => s.includes('\r')],
];
// THE WHY of each reason (lane doc-editor-wheel: the wheel carries tables, task lists, setext headings, footnotes,
// front matter and raw HTML as blocks — measured over scripts/fixtures/doc-wheel/ — so only these remain), plain words.
const RAW_WHY = Object.freeze({
  crlf: 'it uses Windows line endings (CRLF) — a rich save would rewrite every line ending',
  too_big: 'it is larger than 1 MB — too large for the rich editor',
  unparsed: 'the rich editor could not read it',
});
/** What the rich editor would not carry → the reason codes, in RAW_RULES order ([] = none). */
function rawReasons(source) {
  const s = String(source == null ? '' : source);
  if (utf8Len(s) > LIMITS.source) return ['too_big'];
  const prose = proseLines(s);
  return RAW_RULES.filter(([, fn]) => fn(s, prose)).map(([code]) => code);
}
const canon = (s) => String(s == null ? '' : s).replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
/** parse → serialize compared to the source (modulo trailing whitespace / the final newline) — plus rawReasons.
 *  → {ok:true} | {ok:false, code, line} (line = the first 1-based line that differs, 0 when a reason decided). */
function fidelityVerdict(source, roundTripped) {
  const why = rawReasons(source);
  if (why.length) return { ok: false, code: why[0], line: 0 };
  if (typeof roundTripped !== 'string') return { ok: false, code: 'unparsed', line: 0 };
  const a = canon(source).split('\n'), b = canon(roundTripped).split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return { ok: false, code: 'lossy', line: i + 1 };
  return { ok: true };
}
// ── block patching (lane doc-editor-wheel) ──
const blankLine = (x) => !/\S/.test(x);
/** THE SAVE THAT TOUCHES ONLY WHAT CHANGED: the source, its top-level blocks' line ranges (`maps`, [start, end) 0-based,
 *  in order) and the save plan in the new order — `{keep: k}` (block k untouched: its lines stay byte-identical) or
 *  `{text}` (an edited / new block's markdown). A block absent from the plan is deleted with its lines; a text takes the
 *  place of the deleted blocks it sits among, else goes in after the previous kept block; every line between blocks
 *  (blank lines, link definitions) stays; a blank line keeps new text apart from a neighbour.
 *  → {ok:true, text} | {ok:false, code: crlf | overlap | order | plan}. */
function patchBlocks(source, maps, plan) {
  const src = String(source == null ? '' : source);
  if (src.includes('\r')) return { ok: false, code: 'crlf' };
  const tail = /\n*$/.exec(src)[0], body = src.slice(0, src.length - tail.length), L = body ? body.split('\n') : [];
  const B = (maps || []).map(([a, b]) => { a = Math.max(0, Math.min(a, L.length)); b = Math.max(a, Math.min(b, L.length)); while (b > a && blankLine(L[b - 1])) b--; return [a, b]; });
  for (let k = 1; k < B.length; k++) if (B[k][0] < B[k - 1][1]) return { ok: false, code: 'overlap' };
  const owner = new Array(L.length).fill(-1);
  B.forEach(([a, b], k) => { for (let i = a; i < b; i++) owner[i] = k; });
  const kept = new Set(), replaceAt = new Map(), insertAfter = new Map(); // -1 = before the first block
  let last = -1, pending = [];
  const flush = (upto) => { let gone = -1; for (let k = last + 1; k < upto && gone < 0; k++) gone = k; if (pending.length) (gone >= 0 ? replaceAt.set(gone, pending) : insertAfter.set(last, pending)); pending = []; };
  for (const p of plan || []) {
    if (p && Number.isInteger(p.keep)) { if (p.keep <= last || p.keep >= B.length) return { ok: false, code: 'order' }; flush(p.keep); kept.add(p.keep); last = p.keep; }
    else if (p && typeof p.text === 'string') pending.push(p.text.replace(/^\n+|\n+$/g, ''));
    else return { ok: false, code: 'plan' };
  }
  flush(B.length);
  const out = []; // {t} a line · {fresh: [lines]} new text · {cut} a deleted block
  const fresh = (texts) => { for (const x of texts) out.push({ fresh: x.split('\n') }); };
  if (insertAfter.has(-1)) fresh(insertAfter.get(-1));
  for (let i = 0; i < L.length;) {
    const k = owner[i];
    if (k < 0) { out.push({ t: L[i] }); i++; continue; }
    if (kept.has(k)) for (let j = B[k][0]; j < B[k][1]; j++) out.push({ t: L[j] });
    else if (replaceAt.has(k)) fresh(replaceAt.get(k));
    else out.push({ cut: 1 });
    i = B[k][1];
    if (insertAfter.has(k)) fresh(insertAfter.get(k));
  }
  // a deleted block: blank on both sides (or a document edge) ⇒ the blank run after it goes (before it at the end)
  const isB = (x) => x && x.t != null && blankLine(x.t);
  for (let i = 0; i < out.length; i++) {
    if (!out[i].cut) continue;
    let p = i - 1; while (p >= 0 && out[p].cut) p--;
    let n = i + 1; while (n < out.length && out[n].cut) n++;
    if (p < 0 || (n < out.length && isB(out[p]) && isB(out[n]))) for (let j = n; j < out.length && (out[j].cut || isB(out[j])); j++) out[j] = { cut: 1 };
    else if (n >= out.length) for (let j = p; j >= 0 && (out[j].cut || isB(out[j])); j--) out[j] = { cut: 1 };
  }
  const res = []; let gap = false;
  for (const x of out) {
    if (x.cut) continue;
    if (x.fresh) { if (res.length && !blankLine(res[res.length - 1])) res.push(''); res.push(...x.fresh); gap = true; continue; }
    if (gap && !blankLine(x.t)) res.push('');
    gap = false; res.push(x.t);
  }
  return { ok: true, text: res.join('\n') + tail };
}

/** The text a save writes: the serializer's output with ONE final newline (the source's own ending kept when it had none). */
function saveText(serialized, source) {
  const body = String(serialized).replace(/\n+$/, '');
  return /\n$/.test(String(source == null ? '\n' : source)) || !source ? body + '\n' : body;
}

// ── the comments message ──
const CIRCLED = (n) => (n >= 1 && n <= 20 ? String.fromCodePoint(0x245f + n) : `(${n})`);
/** One strip item → {quote, note} bounded (the quote one line ≤ 200, the note ≤ 1000) or null. */
function commentItem(x) {
  if (!x || typeof x !== 'object') return null;
  const quote = clip(oneLine(x.quote), LIMITS.quote);
  const note = String(x.note == null ? '' : x.note).trim();
  if (!note) return null;
  const line = Number.isInteger(x.line) && x.line > 0 ? x.line : 0; // the SOURCE line the selection maps to (0 = none)
  return { quote, ...(line ? { line } : {}), note: Array.from(note).length > LIMITS.note ? Array.from(note).slice(0, LIMITS.note).join('') : note };
}
function commentsText(path, items) {
  const rows = (items || []).map(commentItem).filter(Boolean).map((c, i) => `${CIRCLED(i + 1)} ${c.line ? `L${c.line} ` : ''}${c.quote ? `"${c.quote}" — ` : ''}${c.note.replace(/\n+/g, ' / ')}`);
  return `[Doc comments] ${clip(oneLine(path), LIMITS.pathChars)}\n${rows.join('\n')}`;
}
/** → {ok, text, count} | {ok:false, code: empty | too_many | too_long | bad_path, why}. */
function commentsVerdict(path, items) {
  if (!isDocPath(path) || !String(path).startsWith('/')) return { ok: false, code: 'bad_path', why: 'name the markdown file by its absolute path' };
  const list = Array.isArray(items) ? items.map(commentItem).filter(Boolean) : [];
  if (!list.length) return { ok: false, code: 'empty', why: 'no comment to send' };
  if (list.length > LIMITS.items) return { ok: false, code: 'too_many', why: `at most ${LIMITS.items} comments at once` };
  const text = commentsText(path, list);
  if (utf8Len(text) > LIMITS.messageBytes) return { ok: false, code: 'too_long', why: 'the comments are longer than 4 KB — send some of them first' };
  return { ok: true, text, count: list.length };
}

// ── the edit note ──
/** Lines added / removed (an LCS over the changed middle; a middle too big for it counts by multiset). */
function lineDelta(before, after) {
  const a = String(before == null ? '' : before).split('\n'), b = String(after == null ? '' : after).split('\n');
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const x = a.slice(s, a.length - e), y = b.slice(s, b.length - e);
  let common = 0;
  if (x.length * y.length <= LIMITS.lcsCells) {
    let prev = new Int32Array(y.length + 1), cur = new Int32Array(y.length + 1);
    for (let i = 1; i <= x.length; i++) { for (let j = 1; j <= y.length; j++) cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); [prev, cur] = [cur, prev]; }
    common = prev[y.length];
  } else {
    const m = new Map(); for (const l of x) m.set(l, (m.get(l) || 0) + 1);
    for (const l of y) { const n = m.get(l) || 0; if (n) { common++; m.set(l, n - 1); } }
  }
  return { added: y.length - common, removed: x.length - common };
}
/** The document's sections: [{heading, body}] — the text before the first heading is heading '' (fences respected). */
function sectionsOf(text) {
  const out = [{ heading: '', body: [] }];
  const fenced = new Set(); { let fence = null; String(text).split('\n').forEach((line, i) => { const m = /^ {0,3}(`{3,}|~{3,})/.exec(line); if (fence) { fenced.add(i); if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null; } else if (m) { fenced.add(i); fence = m[1]; } }); }
  String(text).split('\n').forEach((line, i) => {
    const h = !fenced.has(i) && /^ {0,3}#{1,6}[ \t]+(.*?)[ \t#]*$/.exec(line);
    if (h) out.push({ heading: oneLine(h[1]) || '#', body: [] }); else out[out.length - 1].body.push(line);
  });
  return out.map((x) => ({ heading: x.heading, body: x.body.join('\n').replace(/\s+$/, '') }));
}
/** "+a −b lines; sections: H1, H2, H3 (+n more)" — the sections whose text changed, new, or gone (the top = "(top)"). */
function editSummary(before, after) {
  const d = lineDelta(before, after);
  const A = sectionsOf(before), B = sectionsOf(after);
  const key = (list) => { const seen = new Map(); return list.map((s) => { const n = (seen.get(s.heading) || 0) + 1; seen.set(s.heading, n); return { ...s, k: s.heading + '\u0001' + n }; }); };
  const ka = key(A), kb = key(B);
  const am = new Map(ka.map((s) => [s.k, s.body]));
  const bk = new Set(kb.map((s) => s.k));
  const changed = [];
  for (const s of kb) if (!am.has(s.k) || am.get(s.k) !== s.body) changed.push(s.heading || '(top)');
  for (const s of ka) if (!bk.has(s.k)) changed.push(s.heading || '(top)');
  const uniq = [...new Set(changed)];
  const shown = uniq.slice(0, LIMITS.headings).map((h) => clip(h, 80));
  const more = uniq.length - shown.length;
  return `+${d.added} −${d.removed} lines${shown.length ? `; sections: ${shown.join(', ')}${more ? ` (+${more} more)` : ''}` : ''}`;
}

// ── the conflict table ──
/** The disk moved under the window? → 'same' (nothing to do) | 'repaint' (no unsaved edits: repaint in place) |
 *  'bar' (unsaved edits: Reload | Keep editing) | 'kept' ("Keep editing" was chosen for this disk version). */
function conflictVerdict({ disk = 0, base = 0, dirty = false, kept = 0 } = {}) {
  if (!disk || disk <= base) return 'same';
  if (!dirty) return 'repaint';
  return kept && kept >= disk ? 'kept' : 'bar';
}
/** Before a save: the disk newer than what the window read ⇒ 'ask' once ("overwrite the agent's newer version?");
 *  `confirmed` = the disk version the user already said yes for. → 'write' | 'ask'. */
function saveVerdict({ disk = 0, base = 0, confirmed = 0 } = {}) {
  return disk && disk > base && !(confirmed && confirmed >= disk) ? 'ask' : 'write';
}

module.exports = { LIMITS, RAW_WHY, isDocPath, utf8Len, rawReasons, fidelityVerdict, patchBlocks, saveText, commentItem, commentsText, commentsVerdict, lineDelta, sectionsOf, editSummary, conflictVerdict, saveVerdict };
