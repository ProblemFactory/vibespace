#!/usr/bin/env node
// test-voice-focus — lane voice-follows-focus (the owner 2026-10-21: 「我发现还是有些输入框不能用 drop line，比如说编辑或者拒绝
// Agent 要发的消息」; his standing rule 2026-10-13: 「每个输入框都做一下 Dropline」): DICTATION IS A PROPERTY OF FOCUS. The PURE
// half of src/lib/voice-input.js followFocus — src/voice-focus.js — tabled, and THE CENSUS of every text-taking element the
// client makes, judged by that ONE predicate (never a hand list: the sixteen hand-wired boxes were the fence the owner fell
// through).
//   ① dictationTarget: every editable text field is a target; the exclusions are the predicate's (secret, terminal,
//      disabled, read-only, opted-out, hidden, not-text, not-editable) — each row, the order, every why named
//   ② followPlace: the microphone stands OUTSIDE the field (never over it, never over the keyboard-yield strip or a
//      neighbour it is told to keep clear of), inside the view, the first side that fits; a sweep of 4 000 seeded
//      fields never puts it on the field (only a field that fills the view takes it in its corner)
//   ③ followFacts: a followed field's context = its label + the dialog's title or the card's words, ≤ 600 chars
//   ④ THE CENSUS (grep-derived; exported for test-voice-follow-chrome): every createElement / element-helper call that
//      makes an input or a textarea under src/lib (the helpers are DERIVED: a function that hands its first parameter
//      to createElement) and every <input / <textarea in markup — its static facts (type, autocomplete, readonly,
//      disabled, data-no-dictation, an inline or class style that hides it) judged by dictationTarget, printed by
//      verdict (`--all`: every site on its own line); anchors prove the read is not vacuous (the vault's passwords secret, the Outbox reject box and the
//      theme editor's name a target, the live view's keyboard proxy and the copy helpers hidden, …)
//   ⑤ RED controls: planted sites (a password, a one-time code, data-no-dictation, a read-only box, a checkbox, a plain
//      input through a helper the census must derive) each judged as the predicate says; a predicate MUTANT that forgets
//      type=password turns the vault's password a target ⇒ RED; a census that reads comments would count the comment
//      plants ⇒ RED
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const F = require(path.join(REPO, 'src/voice-focus.js'));

// ── THE CENSUS (exported) ──
/** comments out, line numbers kept (a block comment becomes blanks; a line comment after code too) */
export const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:\\'"`])\/\/.*$/gm, (m, a) => a + ' '.repeat(m.length - a.length));
/** the element helpers: `createElement` and every function under src/lib that hands its FIRST parameter to createElement */
export function creatorsOf(files) {
  const names = new Set(['createElement']);
  const DEF = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\s*)?\(\s*([A-Za-z_$][\w$]*))/g;
  for (const src of Object.values(files)) {
    for (const m of src.matchAll(DEF)) {
      const name = m[1] || m[3], param = m[2] || m[4];
      if (new RegExp(String.raw`createElement\(\s*${param.replace(/\$/g, '\\$')}\b`).test(src.slice(m.index, m.index + 400))) names.add(name);
    }
  }
  return names;
}
const firstArg = (t, i) => { let d = 0, q = null, j = i; for (; j < t.length; j++) { const c = t[j]; if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; } if (c === '\'' || c === '"' || c === '`') q = c; else if (c === '(' || c === '[' || c === '{') d++; else if (c === ')' || c === ']' || c === '}') { if (d === 0) break; d--; } else if (c === ',' && d === 0) break; } return t.slice(i, j); };
const lit = (s) => [...String(s).matchAll(/'([^'\\]*)'|"([^"\\]*)"/g)].map((m) => m[1] ?? m[2]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HIDES = /(?:^|[;\s{])(?:opacity\s*:\s*0(?![.\d])|left\s*:\s*-\d{3,}|top\s*:\s*-\d{3,})/;
const TINY = /width\s*:\s*[01]px[\s\S]*height\s*:\s*[01]px|height\s*:\s*[01]px[\s\S]*width\s*:\s*[01]px/;
/** the classes whose own rule (the class is the selector's last compound) hides the element */
export function hidingClasses(css) {
  const out = new Set();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2];
    if (!HIDES.test(body) && !TINY.test(body)) continue;
    for (const sel of m[1].split(',')) { const c = /\.([\w-]+)\s*$/.exec(sel.trim()); if (c && !/[:[]/.test(sel.trim().split(/\s+/).pop())) out.add(c[1]); }
  }
  return out;
}
/** the facts one site states about its element: from the call's own arguments / the tag's attributes, then up to 40
 *  lines of `NAME.x = …` / `NAME.setAttribute(…)` until NAME is made again */
function factsFrom({ tag, name, cls, attrs, lines, at, hiding }) {
  const f = { tag, type: tag === 'input' ? '' : '', autocomplete: '', readOnly: false, disabled: false, noDictation: false, hidden: false, dynamic: false, classes: [...cls] };
  if (attrs != null) {
    const a = (n) => { const m = new RegExp(String.raw`\b${n}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`, 'i').exec(attrs); return m ? (m[1] ?? m[2] ?? m[3]) : null; };
    const has = (n) => new RegExp(String.raw`(?:^|\s)${n}(?:[\s=>/]|$)`, 'i').test(attrs);
    if (tag === 'input') { const ty = a('type'); if (ty != null) { if (/\$\{/.test(ty)) f.dynamic = true; else f.type = ty.toLowerCase(); } }
    f.autocomplete = a('autocomplete') || '';
    f.readOnly = has('readonly'); f.disabled = /(?:^|\s)disabled(?:[\s=>/]|$)/i.test(attrs.replace(/\$\{[^}]*\}/g, ''));
    f.noDictation = has('data-no-dictation');
    const c = a('class'); if (c) for (const x of c.split(/\s+/)) if (x && !/\$/.test(x)) f.classes.push(x);
    const st = a('style') || ''; if (HIDES.test(';' + st) || TINY.test(st)) f.hidden = true;
  }
  if (name) {
    const N = esc(name);
    const remade = new RegExp(String.raw`(?:^|[^\w$.])${N}\s*=\s*[^=]`);
    const ty = new RegExp(String.raw`${N}\.type\s*=\s*([^;,)]+)|${N}\.setAttribute\(\s*'type'\s*,\s*([^)]+)\)`);
    for (let i = at; i < Math.min(lines.length, at + 40); i++) {
      let l = lines[i];
      if (i > at && remade.test(l)) break;
      if (i === at) { const k = l.search(new RegExp(String.raw`${N}\s*=`)); if (k > 0) l = l.slice(k); }
      const t = ty.exec(l);
      if (t && tag === 'input') { const v = (t[1] || t[2]).trim(); const q = lit(v); if (q.length === 1 && /^['"][^'"]*['"]$/.test(v)) f.type = q[0].toLowerCase(); else f.dynamic = true; }
      const ac = new RegExp(String.raw`${N}\.(?:autocomplete\s*=\s*|setAttribute\(\s*'autocomplete'\s*,\s*)'([^']*)'`).exec(l); if (ac) f.autocomplete = ac[1];
      if (new RegExp(String.raw`${N}\.readOnly\s*=\s*true|${N}\.setAttribute\(\s*'readonly'`).test(l)) f.readOnly = true;
      if (new RegExp(String.raw`${N}\.disabled\s*=\s*true\b`).test(l)) f.disabled = true;
      if (new RegExp(String.raw`${N}\.(?:dataset\.noDictation\s*=|setAttribute\(\s*'data-no-dictation')`).test(l)) f.noDictation = true;
      const cn = new RegExp(String.raw`${N}\.(?:className\s*=\s*|classList\.add\()([^;]+)`).exec(l); if (cn) for (const q of lit(cn[1])) f.classes.push(...q.split(/\s+/).filter(Boolean));
      const css = new RegExp(String.raw`${N}\.style\.(?:cssText\s*=\s*('[^']*'|"[^"]*"|\x60[^\x60]*\x60)|opacity\s*=\s*'0')`).exec(l);
      if (css && (css[1] === undefined || HIDES.test(';' + css[1].slice(1, -1)) || TINY.test(css[1]))) f.hidden = true;
    }
  }
  if (f.classes.some((c) => hiding.has(c))) f.hidden = true;
  return f;
}
/** files = {name: text} under src/lib; css = the app's stylesheets' text → [{file, line, tag, name, facts, verdict}] */
export function census(files, css = '', { judge = F.dictationTarget } = {}) {
  const code = Object.fromEntries(Object.entries(files).map(([f, t]) => [f, stripComments(t)]));
  const makers = creatorsOf(code), hiding = hidingClasses(stripComments(css));
  const CALL = new RegExp(String.raw`(?:^|[^\w$.])(${[...makers].map(esc).join('|')})\(`, 'g');
  const DOC_CALL = /document\.createElement\(/g;
  const rows = [];
  for (const [file, t] of Object.entries(code)) {
    const lines = t.split('\n');
    const lineAt = (i) => t.slice(0, i).split('\n').length - 1;
    const seen = new Set();
    for (const re of [CALL, DOC_CALL]) for (const m of t.matchAll(re)) {
      const open = m.index + m[0].length;
      if (seen.has(open)) continue;
      seen.add(open);
      const arg = firstArg(t, open);
      const tags = [...new Set(lit(arg).filter((x) => x === 'input' || x === 'textarea'))];
      if (!tags.length) continue;
      const at = lineAt(m.index);
      const before = t.slice(t.lastIndexOf('\n', m.index) + 1, m.index + (m[0].startsWith('document') ? 0 : 1));
      const nm = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*=\s*(?:document\.)?$/.exec(before.replace(/\s+$/, ' ').replace(/\s*$/, ''));
      const rest = t.slice(open + arg.length);
      const cls = /^\s*,\s*'([^']*)'/.exec(rest);
      for (const tag of tags) {
        const facts = factsFrom({ tag, name: nm ? nm[1] : null, cls: cls && m[1] !== 'createElement' && /^[\w\s-]*$/.test(cls[1]) ? cls[1].split(/\s+/).filter(Boolean) : [], attrs: null, lines, at, hiding });
        rows.push({ file, line: at + 1, tag, name: nm ? nm[1] : null, facts, verdict: judge(facts) });
      }
    }
    for (const m of t.matchAll(/<(input|textarea)\b([^>]*)>?/g)) {
      const at = lineAt(m.index);
      const facts = factsFrom({ tag: m[1], name: null, cls: [], attrs: m[2], lines, at, hiding });
      rows.push({ file, line: at + 1, tag: m[1], name: null, facts, verdict: judge(facts) });
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
export const libFiles = (repo = REPO) => Object.fromEntries(fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js')).sort().map((f) => [f, fs.readFileSync(path.join(repo, 'src/lib', f), 'utf8')]));
export const appCss = (repo = REPO) => ['style', 'chat'].map((n) => { try { return fs.readFileSync(path.join(repo, `public/${n}.css`), 'utf8'); } catch { return ''; } }).join('\n');
export const rowText = (r) => `${r.verdict.ok ? 'target  ' : r.verdict.why.padEnd(8)} ${r.file}:${r.line} ${r.tag}${r.tag === 'input' ? `[${r.facts.dynamic ? 'type at run time' : r.facts.type || 'text'}]` : ''}${r.name ? ' ' + r.name : ''}${r.facts.classes.length ? ' .' + r.facts.classes.slice(0, 2).join('.') : ''}`;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pass = 0, fail = 0;
  const ok = (cond, name, detail) => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : ''}`); }
  };
  const J = F.dictationTarget;

  console.log('① dictationTarget — every editable text field is a target; the exclusions are the predicate\'s');
  const box = { left: 100, top: 100, right: 400, bottom: 130, width: 300, height: 30 }, view = { width: 1280, height: 800 };
  const TABLE = [
    [{ tag: 'textarea', box, view }, 'target', 'a textarea'],
    [{ tag: 'input', type: '', box, view }, 'target', 'an input with no type'],
    ...['text', 'search', 'url', 'email', 'tel', 'TEXT'].map((type) => [{ tag: 'input', type, box, view }, 'target', `input type=${type}`]),
    [{ tag: 'input', type: 'text', autocomplete: 'off', box, view }, 'target', 'autocomplete=off is no secret'],
    [{ tag: 'input', type: 'text', autocomplete: 'username', box, view }, 'target', 'autocomplete=username is no secret'],
    [{ tag: 'div', editable: true, box, view }, 'target', 'a [contenteditable]'],
    [{ tag: 'input', type: 'password', box, view }, 'secret', 'type=password (the vault\'s unlock, its second password)'],
    [{ tag: 'input', type: 'password', disabled: true, readOnly: true }, 'secret', 'a password is a secret before it is disabled / read-only'],
    [{ tag: 'input', type: 'text', autocomplete: 'new-password', box, view }, 'secret', 'autocomplete=new-password on a text input'],
    [{ tag: 'input', type: 'text', autocomplete: 'current-password', box, view }, 'secret', 'autocomplete=current-password'],
    [{ tag: 'input', type: 'tel', autocomplete: 'one-time-code', box, view }, 'secret', 'autocomplete=one-time-code'],
    [{ tag: 'input', autocomplete: 'section-login NEW-PASSWORD', box, view }, 'secret', 'a token list holding new-password'],
    [{ tag: 'textarea', terminal: true, hidden: true }, 'terminal', 'xterm\'s helper textarea (named before it is hidden)'],
    [{ tag: 'textarea', disabled: true, box, view }, 'disabled', 'disabled'],
    [{ tag: 'input', readOnly: true, box, view }, 'read-only', 'read-only'],
    [{ tag: 'input', readOnly: true, noDictation: true, box, view }, 'read-only', 'read-only before opted-out'],
    [{ tag: 'textarea', noDictation: true, box, view }, 'opted-out', 'data-no-dictation (on the field or an ancestor)'],
    [{ tag: 'textarea', box: { ...box, width: 1, height: 1 }, view }, 'hidden', 'a 1×1 keyboard proxy'],
    [{ tag: 'textarea', box, view, opacity: 0 }, 'hidden', 'opacity 0'],
    [{ tag: 'textarea', box: { left: -9999, top: 0, right: -9699, bottom: 30, width: 300, height: 30 }, view }, 'hidden', 'an off-screen copy helper (left −9999)'],
    [{ tag: 'textarea', hidden: true }, 'hidden', 'hidden as the census reads it (a class / inline style)'],
    [{ tag: 'input', box: { left: 1270, top: 790, right: 1570, bottom: 820, width: 300, height: 30 }, view }, 'target', 'a box partly in the view is seen'],
    ...['checkbox', 'radio', 'number', 'date', 'range', 'color', 'file', 'hidden', 'submit'].map((type) => [{ tag: 'input', type, box, view }, 'not-text', `input type=${type}`]),
    [{ tag: 'div', box, view }, 'not-editable', 'a plain div'],
    [{ tag: 'button' }, 'not-editable', 'a button'],
    [null, 'not-editable', 'nothing'],
  ];
  const bad = TABLE.filter(([f, why]) => J(f).why !== why || J(f).ok !== (why === 'target')).map(([f, why, name]) => `${name}: ${JSON.stringify(J(f))} (want ${why})`);
  ok(bad.length === 0, `${TABLE.length} rows: targets (textarea, text-like inputs, contenteditable) and every exclusion as the predicate orders them`, bad);
  const whys = new Set(TABLE.map(([f]) => J(f).why));
  ok(F.WHY.every((w) => whys.has(w)) && [...whys].every((w) => F.WHY.includes(w)), `the table reaches every why the predicate can say (${F.WHY.join(', ')})`, [...whys]);
  ok(F.TEXT_TYPES.join() === ',text,search,url,email,tel' && F.SECRET_AUTOCOMPLETE.join() === 'one-time-code,current-password,new-password', 'the text types and the secret autocomplete tokens are the brief\'s');

  console.log('② followPlace — outside the field, inside the view, clear of the strip and the neighbours');
  const V = { left: 0, top: 0, right: 1280, bottom: 800 };
  const fld = { left: 200, top: 300, right: 600, bottom: 330 };
  const P = (o) => F.followPlace({ view: V, size: 28, gap: 4, ...o });
  const p1 = P({ field: fld });
  ok(p1.side === 'above-end' && p1.x === 572 && p1.y === 268 && p1.anchor === 'right', 'a field mid-view: above its trailing end, keeping its right edge (the capsule widens leftward)', p1);
  const btnAbove = { left: 540, top: 262, right: 640, bottom: 296 };
  const p2 = P({ field: fld, avoid: [btnAbove] });
  ok(p2.side === 'below-end' && p2.y === 334, 'a button above the trailing end (the card\'s Approve) ⇒ below it', p2);
  const p3 = P({ field: { left: 200, top: 10, right: 600, bottom: 40 } });
  ok(p3.side === 'below-end', 'no room above (the view\'s top) ⇒ below', p3);
  const strip = { left: 0, top: 716, right: 1280, bottom: 746 };
  const p4 = P({ field: { left: 200, top: 750, right: 600, bottom: 798 }, avoid: [strip] });
  ok(p4.side === 'after' && p4.x === 604, 'the keyboard-yield strip above and the view\'s bottom below ⇒ beside the field', p4);
  const p5 = P({ field: { left: 0, top: 0, right: 1280, bottom: 800 } });
  ok(p5.side === 'inside' && p5.x >= 0 && p5.y >= 0 && p5.x + 28 <= 1280 && p5.y + 28 <= 800, 'a field that fills the view: its own trailing corner (the one case on the field)', p5);
  const walls = [{ left: 0, top: 0, right: 1280, bottom: 299 }, { left: 0, top: 331, right: 1280, bottom: 800 }, { left: 0, top: 299, right: 199, bottom: 331 }, { left: 601, top: 299, right: 1280, bottom: 331 }];
  const p6 = P({ field: fld, avoid: walls });
  ok(p6.side === 'above-end' && p6.crowded === true, 'every side crowded ⇒ the first in the view that keeps off the field (said: crowded)', p6);
  ok(P({ field: { left: 1250, top: 400, right: 1280, bottom: 430 }, avoid: [{ left: 1200, top: 360, right: 1280, bottom: 398 }, { left: 1200, top: 432, right: 1280, bottom: 470 }] }).side === 'before', 'a narrow field at the right edge, above and below taken ⇒ before it');
  ok(F.followPlace({ field: fld }) === null && F.followPlace({ view: V }) === null && F.followCandidates({ field: { left: 1 } }).length === 0, 'no view or no field ⇒ nothing placed');
  // the sweep: 4 000 seeded fields + neighbours — never over the field (unless 'inside'), always inside the view
  let seed = 20261021, over = [], out = [];
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 4000; i++) {
    const w = 20 + rnd() * 1200, h = 18 + rnd() * 600, l = rnd() * (1280 - Math.min(w, 1279)), tp = rnd() * (800 - Math.min(h, 799));
    const field = { left: l, top: tp, right: Math.min(1280, l + w), bottom: Math.min(800, tp + h) };
    const avoid = Array.from({ length: Math.floor(rnd() * 5) }, () => { const ax = rnd() * 1280, ay = rnd() * 800; return { left: ax, top: ay, right: ax + 30 + rnd() * 200, bottom: ay + 20 + rnd() * 60 }; });
    const size = rnd() < 0.5 ? 28 : 40;
    const p = F.followPlace({ field, view: V, size, avoid });
    const r = { left: p.x, top: p.y, right: p.x + size, bottom: p.y + size };
    if (p.side !== 'inside' && r.left < field.right && field.left < r.right && r.top < field.bottom && field.top < r.bottom) over.push({ field, p });
    if (r.left < -0.001 || r.top < -0.001 || r.right > 1280.001 || r.bottom > 800.001) out.push({ field, p });
  }
  ok(over.length === 0 && out.length === 0, 'the sweep: 4 000 seeded fields and neighbours — the microphone never on the field, never outside the view', { over: over.slice(0, 2), out: out.slice(0, 2) });

  console.log('③ followFacts — the label + the dialog\'s title or the card\'s words, ≤ 600 chars');
  const f1 = F.followFacts({ label: 'Reason (the agent reads it)', near: 'Agent · wants to send:\n  The quarterly numbers are in — shall I post them?   Reject…  Approve' });
  ok(f1.title === 'Reason (the agent reads it)' && f1.text === 'Agent · wants to send: The quarterly numbers are in — shall I post them? Reject… Approve', 'a card\'s box: its label is the title, the card\'s words (whitespace folded) the text', f1);
  const f2 = F.followFacts({ label: 'Name', dialog: 'Rename the window', near: 'IGNORED card words' });
  ok(f2.title === 'Rename the window' && f2.text === 'Name', 'a dialog\'s box: the dialog\'s title, then the label — the card words are not read', f2);
  const f3 = F.followFacts({ label: 'x'.repeat(300), near: 'y'.repeat(5000) });
  ok(f3.title.length === 120 && f3.title.length + f3.text.length <= 600, `bounded: title ≤ 120, the whole ≤ 600 (${f3.title.length} + ${f3.text.length})`);
  ok(F.followFacts({ label: 'Same', dialog: 'Same' }).text === '' && F.followFacts({}).title === '' && F.followFacts({}).text === '', 'a label equal to the title is not said twice; nothing known ⇒ empty');

  console.log('④ THE CENSUS — every input / textarea the client makes under src/lib, judged by THE predicate');
  const FILES = libFiles(), CSS = appCss();
  const C = census(FILES, CSS);
  const by = {};
  for (const r of C) (by[r.verdict.why] = by[r.verdict.why] || []).push(r);
  ok(C.length >= 200, `the census sees the tree: ${C.length} sites in ${new Set(C.map((r) => r.file)).size} files (a vacuous grep would see none)`, C.length);
  ok(C.every((r) => F.WHY.includes(r.verdict.why)), 'every site is a target or an exclusion BY THE PREDICATE (no third answer)', C.filter((r) => !F.WHY.includes(r.verdict.why)).map(rowText));
  console.log(`    ${Object.entries(by).map(([w, rs]) => `${w} ${rs.length}`).join(' · ')}`);
  // every exclusion but not-text by its site; the targets and the not-text by file (--all: every site, one line each)
  const ALL = process.argv.includes('--all');
  for (const w of F.WHY) {
    const rs = by[w] || [];
    if (!rs.length) continue;
    if (ALL || (w !== 'target' && w !== 'not-text')) { for (const r of rs) console.log(`      ${rowText(r)}`); continue; }
    const per = {};
    for (const r of rs) per[r.file] = (per[r.file] || 0) + 1;
    console.log(`      ${w} by file: ${Object.entries(per).map(([f, n]) => `${f.replace(/\.js$/, '')} ${n}`).join(' · ')}`);
  }
  const find = (file, pred) => C.filter((r) => r.file === file && pred(r));
  const anchors = [
    ['vault-unlock.js', (r) => r.name === 'i' && r.facts.type === 'password', 'secret', 'the vault\'s unlock password'],
    ['vault-reveal.js', (r) => r.name === 'pw', 'secret', 'the vault\'s SECOND password'],
    ['channel-outbox.js', (r) => r.name === 'inp', 'target', 'the Outbox proposal\'s REJECT reason box (both, the reaction card\'s too)', 2],
    ['channel-outbox.js', (r) => r.name === 'editor', 'target', 'the Outbox proposal\'s EDIT box'],
    ['channel-api-card-view.js', (r) => r.name === 'why', 'target', 'the API proposal\'s reject reason'],
    ['chat-renderers.js', (r) => r.name === 'customInput', 'target', 'the chat question card\'s own answer'],
    ['theme-editor.js', (r) => r.name === 'nameInput', 'target', 'the theme editor\'s name'],
    ['utils.js', (r) => r.name === 'input' && r.tag === 'input', 'target', 'showInputDialog\'s one-line box'],
    ['browser-live-window.js', (r) => r.name === 'kbd', 'hidden', 'the live view\'s keyboard proxy (1×1, opacity 0)'],
    ['terminal.js', (r) => r.tag === 'textarea' && r.facts.hidden, 'hidden', 'the terminal\'s off-screen copy helper'],
    ['sidebar-mounts.js', (r) => r.tag === 'textarea' && r.facts.readOnly, 'read-only', 'a read-only link / token to copy', 5],
    ['mounts-dialog.js', (r) => r.facts.type === 'password', 'secret', 'a pasted secret (type=password)'],
    ['app.js', (r) => r.facts.type === 'password', 'secret', 'Backup & migrate\'s passphrases', 2],
    ['sidebar.js', (r) => r.facts.type === 'checkbox', 'not-text', 'the sidebar\'s filter checkboxes', 2],
    ['sidebar-mounts.js', (r) => r.tag === 'textarea' && r.facts.noDictation, 'opted-out', 'the SSH private key paste and the rclone.conf paste (data-no-dictation: credentials are never a dictation\'s context)', 2],
    ['channel-webhook.js', (r) => r.name === 'box', 'opted-out', 'the pairing-code paste (a credential)'],
  ];
  for (const [file, pred, why, name, min = 1] of anchors) {
    const rs = find(file, pred);
    ok(rs.length >= min && rs.every((r) => r.verdict.why === why), `anchor: ${name} — ${file} ⇒ ${why} (${rs.length} site${rs.length === 1 ? '' : 's'})`, rs.map(rowText));
  }
  ok((by.target || []).length >= 100, `most of what the client makes is a target (${(by.target || []).length}) — dictation follows the focus there`);

  console.log('⑤ RED controls — plants judged as the predicate says; a mutant predicate and a comment-reading census caught');
  const PLANT = `// a <textarea> in a comment, and document.createElement('input') in one too
/* <input type="text"> in a block comment */
const mkBox = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
export function plants() {
  const pw = document.createElement('input'); pw.type = 'password';
  const otp = document.createElement('input'); otp.type = 'text'; otp.autocomplete = 'one-time-code';
  const quiet = document.createElement('textarea'); quiet.dataset.noDictation = '1';
  const ro = document.createElement('textarea'); ro.readOnly = true;
  const tick = document.createElement('input'); tick.type = 'checkbox';
  const plain = mkBox('input', 'zz-plain');
  const ghost = document.createElement('textarea'); ghost.style.cssText = 'position:fixed;left:-9999px;top:0';
  return \`<input type="search" class="zz-find"><textarea readonly></textarea><input type="password" autocomplete="off">\`;
}
`;
  const R = census({ ...FILES, 'zz-plant.js': PLANT }, CSS).filter((r) => r.file === 'zz-plant.js');
  const want = { pw: 'secret', otp: 'secret', quiet: 'opted-out', ro: 'read-only', tick: 'not-text', plain: 'target', ghost: 'hidden' };
  const got = Object.fromEntries(R.filter((r) => r.name).map((r) => [r.name, r.verdict.why]));
  ok(Object.entries(want).every(([n, w]) => got[n] === w), 'planted calls: a password, a one-time code, data-no-dictation, read-only, a checkbox, an off-screen copy helper — and a plain input made through a helper the census DERIVED (mkBox)', got);
  const mk = R.filter((r) => !r.name).map((r) => `${r.tag}:${r.verdict.why}`);
  ok(mk.join() === 'input:target,textarea:read-only,input:secret', 'planted markup: a search box, a read-only textarea, a password', mk);
  ok(R.length === 10, `the comments' input / textarea are no sites (10 = 7 calls + 3 tags; got ${R.length})`, R.map(rowText));
  const MUT = (f) => (f && f.type === 'password' ? { ok: true, why: 'target' } : F.dictationTarget(f));
  const M = census(FILES, CSS, { judge: MUT });
  const mv = M.filter((r) => r.file === 'vault-reveal.js' && r.name === 'pw');
  ok(mv.length === 1 && mv[0].verdict.why === 'target', 'MUTANT: a predicate that forgets type=password makes the vault\'s second password a target — the anchor goes RED', mv.map(rowText));
  const raw = census({ 'zz-plant.js': PLANT.replace(/^\/\/ a <textarea>.*$/m, 'const s = `a <textarea> in a string`;') }, CSS);
  ok(raw.length === R.length + 1, 'CONTROL: the same words outside a comment ARE a site (the comment strip, not a blind spot)', raw.length);

  console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
  process.exit(fail ? 1 : 0);
}
