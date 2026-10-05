'use strict';
// THE DOC WINDOW'S RULES (lane doc-window, 2.369.215; docs/design-artifacts.zh.md §Doc window) — PURE, imports nothing,
// DOM-free. CJS like src/design-model.js: the hub (src/server/doc-engine.js) spells the comments line with it, the
// window (src/lib/doc-window.js + the lazy src/doc-editor-entry.js) judges with the SAME functions, and
// scripts/test-doc-model.mjs reads every table below.
//   · THE FIDELITY RULE (owner: never a silent rewrite of her or the agent's file): `rawReasons(source)` names what the
//     rich editor does not carry (a table, raw HTML, a footnote, front matter, CRLF, a setext heading, a size past the
//     cap); `fidelityVerdict(source, roundTripped)` compares parse → serialize to the source modulo trailing
//     whitespace and the final newline. Either one ⇒ the window opens RAW and says why.
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
  ['front_matter', (s) => /^(---|\+\+\+)[ \t]*\n/.test(s)],
  ['table', (_s, prose) => prose.some(({ line }, k) => /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line) && k > 0 && /\|/.test(prose[k - 1].line))],
  ['html', (_s, prose) => prose.some(({ line }) => /<\/?[A-Za-z][A-Za-z0-9-]*(\s[^<>]*)?\/?>|<!--/.test(line.replace(/`[^`]*`/g, '')))],
  ['footnote', (_s, prose) => prose.some(({ line }) => /\[\^[^\]\s]+\]/.test(line))],
  ['setext', (_s, prose) => prose.some(({ line }, k) => k > 0 && /^ {0,3}(=+|-+)[ \t]*$/.test(line) && prose[k - 1].i === prose[k].i - 1 && prose[k - 1].line.trim() && !/^ {0,3}([-*+]|\d+[.)])\s/.test(prose[k - 1].line))],
];
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
  return { quote, note: Array.from(note).length > LIMITS.note ? Array.from(note).slice(0, LIMITS.note).join('') : note };
}
function commentsText(path, items) {
  const rows = (items || []).map(commentItem).filter(Boolean).map((c, i) => `${CIRCLED(i + 1)} ${c.quote ? `"${c.quote}" — ` : ''}${c.note.replace(/\n+/g, ' / ')}`);
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

module.exports = { LIMITS, isDocPath, utf8Len, rawReasons, fidelityVerdict, saveText, commentItem, commentsText, commentsVerdict, lineDelta, sectionsOf, editSummary, conflictVerdict, saveVerdict };
