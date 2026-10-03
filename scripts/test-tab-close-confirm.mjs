#!/usr/bin/env node
// A WHOLE TAB GROUP CLOSES ONLY AFTER A QUESTION (B-a67c, 2026-10-02; the owner: "当窗口是tabbed或者side by side的时候，
// 注意点击整体的关闭要有个警告提示确认要关闭x个标签页吗，避免想关闭tab但点错"). Before it the frame's ✕ and the taskbar's
// "Close group" ended only tabs[0] — the host, usually NOT the tab on show — and nothing closed a whole group. Now every
// door that ends a whole group goes through ONE helper (tab-group.js requestCloseGroup → confirmCloseGroup, the house
// dialog), a tab's own ✕ and a lone window never ask, a programmatic close never asks. Fast, no browser:
//   §1 THE PURE VERDICT — src/lib/chain-layout.js closeAsks over scope × members × user (asks iff a person ends ≥ 2
//      windows at once) + groupCloseList (strip order: a split's left half then its right; the names the tabs show).
//   §2 THE ONE HELPER, RUN — the real requestCloseGroup body (read out of tab-group.js) over a fake window manager:
//      a lone window closes at once and is never asked; a group asks once with every name; Cancel keeps every tab;
//      the confirm closes exactly the named tabs still in the group, guests first, the host last; a second door
//      while the question is open shares it; a failed question is a Cancel; a vetoing member stays.
//   §3 THE DOOR CENSUS (grep-derived, comment-stripped src/lib) — (a) a close of every member of a chain (a close
//      verb inside a loop over a chain's members) exists ONLY inside requestCloseGroup, after the question; (b) every
//      user-close call (requestClose / requestCloseGroup) and every window-menu call (showWindowContextMenu) is a row
//      of DOORS with its scope — a new one is red until classified; each door's verdict through closeAsks; (c) the
//      group doors' wiring (the frame's ✕, the frame's menu, the taskbar group's menu, window.close on ctx.group);
//      (d) the dialog: house showConfirmDialog with the count, the names, Enter / Esc — no native confirm; zh + ja.
//   §4 NEGATIVE CONTROLS — patched copies (scripts/mutant-copy.mjs): a verdict that asks a lone window, one that asks
//      a programmatic close, a helper that closes on Cancel, one that closes the LIVE group (an unnamed tab), a
//      planted un-gated close-all loop, the frame's ✕ back on requestClose — each red where it must be.
// Chrome end to end: scripts/test-tab-close-confirm-ui.mjs (heavy).
// Run: node scripts/test-tab-close-confirm.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const J = JSON.stringify;

// strip // and /* */ comments outside string / template literals (a pin a comment satisfies proves nothing).
// A regex literal is skipped whole when `/` follows an operator / keyword (src/lib carries a few).
function strip(s) {
  let out = '', i = 0, q = null, prev = '';
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (q) { out += c; if (c === '\\') { out += d ?? ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; i++; prev = c; continue; }
    if (c === '/' && d === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; }
    if (c === '/' && (/[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|in|of)$/.test(out.trimEnd()))) {
      let j = i + 1, cls = false;
      while (j < s.length && s[j] !== '\n') { const ch = s[j]; if (ch === '\\') { j += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; j++; }
      if (s[j] === '/') { j++; while (/[a-z]/i.test(s[j] || '')) j++; out += s.slice(i, j); i = j; prev = '/'; continue; }
    }
    out += c; if (!/\s/.test(c)) prev = c; i++;
  }
  return out;
}

// ── §1 THE PURE VERDICT ──
const CL_REL = 'src/lib/chain-layout.js';
function verdictRows(m) {
  const bad = []; let n = 0;
  for (const scope of ['group', 'tab', undefined, 'GROUP']) for (const members of [0, 1, 2, 3, 7, '2', NaN]) for (const user of [true, false, undefined, 1]) {
    n++;
    const want = user === true && scope === 'group' && Number(members) >= 2;
    const got = m.closeAsks({ scope, members, user });
    if (got !== want) bad.push({ scope, members, user, want, got });
  }
  if (m.closeAsks() !== false || m.closeAsks({}) !== false) bad.push('defaults ask');
  return { n, bad };
}
function listRows(m) {
  const bad = [];
  const titles = { h: 'Chat A', g1: 'Live view', g2: 'notes.md', g3: '' };
  const tOf = (id) => titles[id];
  const tabs = { tabs: ['h', 'g1', 'g2'], active: 1 };
  const r1 = m.groupCloseList(tabs, tOf);
  if (J(r1) !== J({ ids: ['h', 'g1', 'g2'], names: ['Chat A', 'Live view', 'notes.md'] })) bad.push({ row: 'tabs order', got: r1 });
  const ordered = { tabs: ['h', 'g1', 'g2'], active: 0, order: ['g2', 'h', 'g1'] };
  const r2 = m.groupCloseList(ordered, tOf);
  if (J(r2.ids) !== J(['g2', 'h', 'g1'])) bad.push({ row: 'a reordered strip names in ITS order', got: r2 });
  const split = { tabs: ['h', 'g1', 'g2'], active: 0, layout: 'split', split: { pair: ['h', 'g1'], ratio: 0.5, dir: 'row', left: ['h', 'g2'], right: ['g1'] } };
  const r3 = m.groupCloseList(split, tOf);
  if (J(r3.ids) !== J(['h', 'g2', 'g1'])) bad.push({ row: 'a split names its left half then its right', got: r3 });
  const r4 = m.groupCloseList({ tabs: ['h', 'g3', 'gx'], active: 0 }, (id) => { if (id === 'gx') throw new Error('x'); return titles[id]; });
  if (J(r4.names) !== J(['Chat A', 'g3', 'gx'])) bad.push({ row: 'a blank or throwing title names the id', got: r4 });
  const r5 = m.groupCloseList({ tabs: ['h', 'g1', 'gone'], active: 0 }, tOf, (id) => id !== 'gone');
  if (J(r5.ids) !== J(['h', 'g1'])) bad.push({ row: 'exists() drops an id with no window', got: r5 });
  const r6 = m.groupCloseList(null, tOf);
  if (J(r6) !== J({ ids: [], names: [] })) bad.push({ row: 'no chain ⇒ nothing', got: r6 });
  if (J(tabs) !== J({ tabs: ['h', 'g1', 'g2'], active: 1 })) bad.push('the chain was mutated');
  return { bad };
}

console.log('§1 the PURE verdict (src/lib/chain-layout.js closeAsks + groupCloseList)');
const CL = require(path.join(REPO, CL_REL));
{
  const v = verdictRows(CL);
  ok(v.bad.length === 0 && v.n === 112, `closeAsks: ${v.n} rows — asks iff a PERSON (user === true) ends a whole GROUP of ≥ 2 windows; a tab / a lone window / a programmatic close never`, v.bad.slice(0, 4));
  const l = listRows(CL);
  ok(l.bad.length === 0, 'groupCloseList: the strip order (tabs / a reordered strip / a split\'s left then right), the names the tabs show, a blank or throwing title ⇒ the id, exists() filters, the chain untouched', l.bad);
  const src = strip(read(CL_REL));
  ok(!/\brequire\(\s*['"](?!\.\.\/task-color-seq\.js)/.test(src) && !/\bimport\b/.test(src), 'chain-layout.js stays PURE (requires only the shared colour sequence)');
}

// ── §2 THE ONE HELPER, RUN ──
const TG_REL = 'src/lib/tab-group.js';
const methodOf = (src, sig) => { const a = src.indexOf(`\n  ${sig} {`); if (a < 0) return ''; const b = src.indexOf('\n  },\n', a); return b < 0 ? '' : src.slice(a + 1, b + 4); };
function helperFrom(tgSrc, model) {
  const body = methodOf(tgSrc, 'requestCloseGroup(id)');
  if (!body) return null;
  const obj = new Function('closeAsks', 'groupCloseList', '_groupCloseAsks', `return {\n${body}\n};`)(model.closeAsks, model.groupCloseList, new WeakMap());
  return obj.requestCloseGroup;
}
// a fake window manager: windows by id, chains as tab-group.js keeps them, requestClose = the ONE user-close door
function fakeWm(helper, { titles = {}, answer = true, veto = [] } = {}) {
  const wm = { windows: new Map(), asked: [], closed: [], log: [], answer };
  wm.add = (id, chain = null) => { wm.windows.set(id, { id, title: titles[id] ?? id, _tabChain: chain }); };
  wm.group = (ids, extra = {}) => { const chain = { tabs: [...ids], active: 0, layout: 'tabs', ...extra }; for (const id of ids) wm.add(id, chain); return chain; };
  wm.requestClose = (id) => {
    wm.log.push('close:' + id);
    if (veto.includes(id)) return false;
    const w = wm.windows.get(id); if (!w) return false;
    const ch = w._tabChain;
    if (ch) { ch.tabs.splice(ch.tabs.indexOf(id), 1); if (ch.tabs.length === 1) { const last = wm.windows.get(ch.tabs[0]); if (last) last._tabChain = null; } }
    wm.windows.delete(id); wm.closed.push(id);
    return true;
  };
  wm.confirmCloseGroup = (list) => { wm.log.push('ask'); wm.asked.push(J(list)); return typeof wm.answer === 'function' ? wm.answer(list) : Promise.resolve(wm.answer); };
  wm.requestCloseGroup = helper;
  return wm;
}
async function helperRows(helper) {
  const bad = [];
  const T = { h: 'Chat A', g1: 'Live view', g2: 'notes.md' };
  if (typeof helper !== 'function') return { bad: ['requestCloseGroup not found in tab-group.js'], n: 0 };
  let n = 0;
  const row = (name, cond, extra) => { n++; if (!cond) bad.push({ row: name, ...(extra || {}) }); };
  const cell = async (tag, fn) => { try { await fn(); } catch (e) { n++; bad.push({ row: tag + ' threw', err: String(e && e.message) }); } };
  await cell('B1', async () => { // B1 a lone window: its own close, at once (no await), never asked
    const wm = fakeWm(helper); wm.add('a');
    const p = wm.requestCloseGroup('a'); const syncLog = [...wm.log];
    const r = await p;
    row('B1 a lone window closes synchronously, unasked', J(syncLog) === J(['close:a']) && r === true && wm.asked.length === 0, { syncLog, r });
  });
  await cell('B2', async () => { // B2 a chain of one (a restored record) = a lone window
    const wm = fakeWm(helper); const ch = { tabs: ['a'], active: 0 }; wm.add('a', ch);
    const r = await wm.requestCloseGroup('a');
    row('B2 a one-tab chain is a lone window', r === true && wm.asked.length === 0 && J(wm.closed) === J(['a']), { log: wm.log });
  });
  await cell('B3', async () => { // B3 Cancel keeps every tab
    const wm = fakeWm(helper, { titles: T, answer: false }); wm.group(['h', 'g1', 'g2']);
    const syncLog = (wm.requestCloseGroup('h'), [...wm.log]);
    await new Promise((r) => setTimeout(r, 0));
    row('B3 a group asks first, in the click\'s own task, and Cancel keeps every tab', J(syncLog) === J(['ask']) && wm.closed.length === 0 && wm.windows.size === 3 && J(wm.asked) === J([J({ ids: ['h', 'g1', 'g2'], names: ['Chat A', 'Live view', 'notes.md'] })]), { syncLog, log: wm.log, asked: wm.asked });
  });
  await cell('B4', async () => { // B4 the confirm closes every named tab, the guests first, the host last
    const wm = fakeWm(helper, { titles: T, answer: true }); wm.group(['h', 'g1', 'g2']);
    const r = await wm.requestCloseGroup('g1');
    row('B4 the confirm (from any member) closes every tab, guests first, the host last, each through requestClose', r === true && J(wm.closed) === J(['g2', 'g1', 'h']) && wm.windows.size === 0, { closed: wm.closed, r });
  });
  await cell('B5', async () => { // B5 a split names its left half then its right
    const wm = fakeWm(helper, { titles: T, answer: false });
    wm.group(['h', 'g1', 'g2'], { layout: 'split', split: { pair: ['h', 'g1'], ratio: 0.5, dir: 'row', left: ['h', 'g2'], right: ['g1'] } });
    await wm.requestCloseGroup('h');
    row('B5 side by side: the question names the left half then the right', J(wm.asked) === J([J({ ids: ['h', 'g2', 'g1'], names: ['Chat A', 'notes.md', 'Live view'] })]), { asked: wm.asked });
  });
  await cell('B6', async () => { // B6 a tab that joined while the question was open was not named — it stays
    let release; const wm = fakeWm(helper, { titles: T, answer: () => new Promise((r) => { release = r; }) }); const ch = wm.group(['h', 'g1']);
    const p = wm.requestCloseGroup('h');
    wm.add('late', ch); ch.tabs.push('late');
    release(true); await p;
    row('B6 the confirm closes only what it NAMED (a tab that joined during the question stays)', J(wm.closed) === J(['g1', 'h']) && wm.windows.has('late'), { closed: wm.closed });
  });
  await cell('B7', async () => { // B7 a named tab closed elsewhere during the question is not closed twice
    let release; const wm = fakeWm(helper, { titles: T, answer: () => new Promise((r) => { release = r; }) }); wm.group(['h', 'g1', 'g2']);
    const p = wm.requestCloseGroup('h');
    wm.requestClose('g1'); wm.log.length = 0; wm.closed.length = 0;
    release(true); await p;
    row('B7 a named tab gone meanwhile is not closed again', J(wm.log) === J(['close:g2', 'close:h']), { log: wm.log });
  });
  await cell('B8', async () => { // B8 one question per group
    const rel = []; const wm = fakeWm(helper, { titles: T, answer: () => new Promise((r) => { rel.push(r); }) }); wm.group(['h', 'g1']);
    const p1 = wm.requestCloseGroup('h'), p2 = wm.requestCloseGroup('g1');
    for (const r of rel) r(false); const [r1, r2] = await Promise.all([p1, p2]);
    row('B8 a second door while the question is open shares it (asked once)', p1 === p2 && wm.asked.length === 1 && r1 === false && r2 === false, { asked: wm.asked.length });
    wm.answer = true; const r3 = await wm.requestCloseGroup('h');
    row('B8 …and once answered, the next door asks again', wm.asked.length === 2 && r3 === true && wm.windows.size === 0, { asked: wm.asked.length });
  });
  await cell('B9', async () => { // B9 a question that fails to open (throws / rejects) is a Cancel
    const warn = console.warn; console.warn = () => {};
    try {
      const wm = fakeWm(helper, { titles: T }); wm.group(['h', 'g1']);
      wm.confirmCloseGroup = () => { throw new Error('no dialog'); };
      const r1 = await wm.requestCloseGroup('h');
      wm.confirmCloseGroup = () => Promise.reject(new Error('no dialog'));
      const r2 = await wm.requestCloseGroup('h');
      row('B9 a question that throws or rejects closes nothing', r1 === false && r2 === false && wm.closed.length === 0, { closed: wm.closed });
    } finally { console.warn = warn; }
  });
  await cell('B10', async () => { // B10 a member that answers "not yet" (a desktop app asks its app) stays; the others close
    const wm = fakeWm(helper, { titles: T, answer: true, veto: ['g1'] }); wm.group(['h', 'g1', 'g2']);
    await wm.requestCloseGroup('h');
    row('B10 a vetoing member stays (its own answer), the rest close', J(wm.closed) === J(['g2', 'h']) && wm.windows.has('g1'), { closed: wm.closed });
  });
  await cell('B11', async () => { // B11 an unknown id does nothing
    const wm = fakeWm(helper); const r = await wm.requestCloseGroup('nope');
    row('B11 an unknown id: nothing, false', r === false && wm.log.length === 0);
  });
  return { bad, n };
}

console.log('§2 THE ONE HELPER, run (the real requestCloseGroup body over a fake window manager)');
const tgSrc = read(TG_REL);
{
  const h = await helperRows(helperFrom(tgSrc, CL));
  ok(h.n === 12 && h.bad.length === 0, `requestCloseGroup: ${h.n} rows — lone ⇒ at once, unasked; a group ⇒ asked once (the names, strip order), Cancel keeps all, the confirm closes exactly the named tabs (guests first, host last), shared question, a failed question = Cancel, a veto stays`, h.bad);
}

// ── §3 THE DOOR CENSUS ──
const LIB_DIR = path.join(REPO, 'src/lib');
const libFiles = () => fs.readdirSync(LIB_DIR).filter((f) => f.endsWith('.js') && !/^i18n-[a-z]+\.js$/.test(f)).map((f) => 'src/lib/' + f).sort();
const CLOSE_VERB = /\.(requestCloseGroup|requestClose|closeWindow|removeFromTabChain|_retireWindow)\(/g;
const CHAIN_ITER = /\btabs\b|visualTabOrder|groupCloseList|\.order\b|_tabChain|doomed/;
// the body of a loop that starts at `at` (just after its header): a { block } or one statement
function bodyAfter(code, at) {
  let i = at; while (/\s/.test(code[i] || '')) i++;
  if (code[i] === '{') return code.slice(i, matchClose(code, i) + 1);
  let depth = 0, j = i;
  for (; j < code.length; j++) { const c = code[j]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) { if (depth === 0) break; depth--; } else if (c === ';' && depth === 0) break; }
  return code.slice(i, j + 1);
}
function matchClose(code, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' }; const want = pairs[code[open]]; let depth = 0, q = null;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === code[open]) depth++; else if (c === want) { depth--; if (depth === 0) return i; }
  }
  return code.length - 1;
}
// the enclosing method / function name at a position (the nearest definition above it)
function enclosing(code, at) {
  const head = code.slice(0, at);
  const re = /(?:^|\n)\s*(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\([^)\n]*\)\s*\{/g;
  let m, name = null; while ((m = re.exec(head))) if (!/^(if|for|while|switch|catch|function)$/.test(m[1])) name = m[1];
  return name;
}
/** (a) every close verb inside a loop over a chain's members → [{file, fn, loop}] */
function closeAllSites(texts) {
  const out = [];
  for (const [file, raw] of Object.entries(texts)) {
    const code = strip(raw);
    const loops = /\bfor\s*\(|\.forEach\(/g; let m;
    while ((m = loops.exec(code))) {
      const open = m.index + m[0].length - 1;
      const close = matchClose(code, open);
      let header, body;
      if (m[0].startsWith('for')) { header = code.slice(open, close + 1); body = bodyAfter(code, close + 1); }
      else { const lineStart = code.lastIndexOf('\n', m.index) + 1; header = code.slice(Math.max(lineStart, m.index - 120), m.index); body = code.slice(open, close + 1); }
      if (!CHAIN_ITER.test(header)) continue;
      CLOSE_VERB.lastIndex = 0;
      if (!CLOSE_VERB.test(body)) continue;
      out.push({ file, fn: enclosing(code, m.index), loop: header.replace(/\s+/g, ' ').trim().slice(0, 80) });
    }
  }
  return out;
}
// (b) DOORS — every user-close call and every window-menu call in src/lib, by the line it sits on.
// scope: 'group' (ends every member — goes through requestCloseGroup / ctx.group) | 'tab' (ends one window) |
// 'gate' (the helper's own member closes) | 'def' (the definition). `re` matches the STRIPPED line.
const DOORS = [
  { file: 'src/lib/window.js', re: /\.win-close'\)\.onclick = \(e\) => \{ e\.stopPropagation\(\); this\.requestCloseGroup\(winInfo\.id\); \}/, scope: 'group', door: "the FRAME's ✕ (a lone window's own ✕: requestCloseGroup is requestClose there)" },
  { file: 'src/lib/window.js', re: /showWindowContextMenu\(this\._app, winInfo\.id, e\.clientX, e\.clientY, grouped \? \{ switchSubmenu: true, group: true, closeLabel: '\\u2715 ' \+ t\('Close group'\) \} : \{ switchSubmenu: true \}\)/, scope: 'group', door: "the FRAME's own menu (title bar outside a tab): Close group when chained" },
  { file: 'src/lib/taskbar.js', re: /run: \(c\) => \(c\.group \? c\.app\.wm\.requestCloseGroup\(c\.id\) : c\.app\.wm\.requestClose\(c\.id\)\)/, scope: 'group', door: 'the window menu\'s Close: ctx.group ⇒ the group gate, else one window' },
  { file: 'src/lib/taskbar.js', re: /showWindowContextMenu\(app, hostId, e\.clientX, e\.clientY, \{ closeLabel: '\\u2715 ' \+ t\('Close group'\), group: true \}\)/, scope: 'group', door: "the taskbar GROUP button's menu (Close group)" },
  { file: 'src/lib/taskbar.js', re: /showWindowContextMenu\(app, id, e\.clientX, e\.clientY\);/, scope: 'tab', door: 'a single taskbar button (a lone window)' },
  { file: 'src/lib/taskbar.js', re: /showWindowContextMenu\(app, tid, e\.clientX, e\.clientY, \{/, scope: 'tab', door: "a chooser ROW = that tab's own menu" },
  { file: 'src/lib/taskbar.js', re: /showWindowContextMenu\(app, id, e\.clientX, e\.clientY, \{/, scope: 'tab', door: 'a window-list row (one window)' },
  { file: 'src/lib/taskbar.js', re: /export function showWindowContextMenu\(/, scope: 'def', door: 'the menu itself' },
  { file: 'src/lib/tab-group.js', re: /closeBtn\.addEventListener\('click', \(e\) => \{ e\.stopPropagation\(\); this\.requestClose\(tabWinId\); \}\)/, scope: 'tab', door: "a TAB's own ✕" },
  { file: 'src/lib/tab-group.js', re: /showWindowContextMenu\(this\._app, tabWinId, e\.clientX, e\.clientY, \{ switchSubmenu: true \}\)/, scope: 'tab', door: "a TAB's own menu" },
  { file: 'src/lib/tab-group.js', re: /return Promise\.resolve\(this\.requestClose\(id\)\);/, scope: 'gate', door: 'the gate: a lone window is its own close' },
  { file: 'src/lib/tab-group.js', re: /for \(const tid of doomed\) if \(this\.windows\.has\(tid\)\) this\.requestClose\(tid\);/, scope: 'gate', door: 'the gate: each named member through the veto point, after the confirm' },
  { file: 'src/lib/command-mode.js', re: /wm\.requestClose\(wm\.activeWindowId\)/, scope: 'tab', door: 'Ctrl+\\ x / command mode w (the active TAB)' },
  { file: 'src/lib/mobile-nav.js', re: /if \(activeId\) app\.wm\.requestClose\(activeId\);/, scope: 'tab', door: "the phone nav's ✕ (the active tab)" },
  { file: 'src/lib/mobile-nav.js', re: /if \(wm\.requestClose\(win\.id\)\) item\.remove\(\);/, scope: 'tab', door: "a phone switcher row's ✕ (that window)" },
  { file: 'src/lib/mobile-nav.js', re: /showWindowContextMenu\(this\.app, win\.id, e\.clientX, e\.clientY, \{ onAction:/, scope: 'tab', door: "a phone switcher row's long-press menu (that window)" },
  { file: 'src/lib/session-props.js', re: /app\.wm\.requestClose\(winInfo\.id\); else app\.wm\.closeWindow\(winInfo\.id\);/, scope: 'tab', door: 'Esc in the properties window (itself)' },
];
const DOOR_CALL = /\.requestCloseGroup\(|\.requestClose\(|showWindowContextMenu\(/;
function doorCensus(texts) {
  const unlisted = [], used = new Map();
  for (const [file, raw] of Object.entries(texts)) {
    const lines = strip(raw).split('\n');
    lines.forEach((ln, i) => {
      if (!DOOR_CALL.test(ln) || /^\s*import\b/.test(ln) || /^\s*(requestCloseGroup|requestClose)\(id\) \{/.test(ln)) return;
      const hits = DOORS.filter((d) => d.file === file && d.re.test(ln));
      if (hits.length !== 1) { unlisted.push(`${file}:${i + 1}: ${ln.trim().slice(0, 110)}${hits.length > 1 ? ' (matches ' + hits.length + ' rows)' : ''}`); return; }
      used.set(hits[0], (used.get(hits[0]) || 0) + 1);
    });
  }
  const dead = DOORS.filter((d) => !used.has(d)).map((d) => `${d.file}: ${d.door}`);
  const twice = DOORS.filter((d) => (used.get(d) || 0) > 1).map((d) => `${d.file}: ${d.door} ×${used.get(d)}`);
  return { unlisted, dead, twice, n: [...used.values()].reduce((a, b) => a + b, 0) };
}
const libTexts = () => Object.fromEntries(libFiles().map((f) => [f, read(f)]));

console.log('§3 THE DOOR CENSUS (comment-stripped src/lib)');
const TEXTS = libTexts();
{
  const sites = closeAllSites(TEXTS);
  const gated = sites.filter((s) => s.file === TG_REL && s.fn === 'requestCloseGroup');
  const other = sites.filter((s) => !gated.includes(s));
  ok(gated.length === 1 && other.length === 0, `(a) a close of every member of a chain exists ONLY in tab-group.js requestCloseGroup (${Object.keys(TEXTS).length} files, ${sites.length} close-all loop(s))`, other.map((s) => `${s.file} ${s.fn}: ${s.loop}`));
  const g = methodOf(strip(tgSrc), 'requestCloseGroup(id)');
  const iAsk = g.indexOf('this.confirmCloseGroup(list)'), iGate = g.indexOf('if (go !== true) return false;'), iLoop = g.indexOf('for (const tid of doomed)');
  ok(iAsk > 0 && iGate > iAsk && iLoop > iGate && /closeAsks\(\{ scope: 'group', members: list\.ids\.length, user: true \}\)/.test(g), '(a) …and there, after the question: closeAsks decides, confirmCloseGroup asks, a non-true answer returns before the loop', { iAsk, iGate, iLoop });
  const d = doorCensus(TEXTS);
  ok(d.unlisted.length === 0, `(b) every user-close / window-menu call in src/lib is a classified DOOR (${d.n} calls, ${DOORS.length} rows) — a new one is red until its row says whether it ends a whole group`, d.unlisted);
  ok(d.dead.length === 0 && d.twice.length === 0, '(b) …and every row still matches exactly one call (a stale row is a hole)', [...d.dead, ...d.twice]);
  const doorBad = DOORS.filter((x) => x.scope === 'group' || x.scope === 'tab').filter((x) => CL.closeAsks({ scope: x.scope, members: 3, user: true }) !== (x.scope === 'group') || CL.closeAsks({ scope: x.scope, members: 1, user: true }) !== false || CL.closeAsks({ scope: x.scope, members: 3, user: false }) !== false);
  const groupDoors = DOORS.filter((x) => x.scope === 'group').map((x) => x.door.split(' (')[0]);
  ok(doorBad.length === 0 && groupDoors.length === 4, `(b) which close asks, per door: ${groupDoors.length} group doors ask for ≥ 2 tabs (${groupDoors.join(' · ')}); ${DOORS.filter((x) => x.scope === 'tab').length} tab / lone doors never; nothing asks a programmatic close`, doorBad.map((x) => x.door));
  const tb = strip(TEXTS['src/lib/taskbar.js']), wj = strip(TEXTS['src/lib/window.js']);
  ok(/export function showWindowContextMenu\(app, id, x, y, \{ closeLabel = null, onAction, switchSubmenu = false, group = false \} = \{\}\) \{/.test(tb) && /const ctx = \{ app, id, win, s: sess, switchSubmenu, closeLabel, group: !!group \};/.test(tb), '(c) showWindowContextMenu carries `group` into the menu ctx (window.close reads it)');
  ok(/const grouped = !!\(winInfo\._tabChain && winInfo\._tabChain\.tabs\.length >= 2\);/.test(wj), '(c) the frame\'s menu is a group menu exactly when the window heads a chain of ≥ 2');
  const conf = methodOf(strip(tgSrc), 'confirmCloseGroup({ names })');
  ok(/return showConfirmDialog\(\{ title: t\('Close \{n\} tabs\?', \{ n \}\), items: names, confirmText: t\('Close \{n\} tabs', \{ n \}\), danger: true \}\);/.test(conf) && /import \{[^}]*\bshowConfirmDialog\b[^}]*\} from '\.\/utils\.js';/.test(tgSrc), '(d) the question is the house dialog: "Close {n} tabs?", every name listed, "Close {n} tabs" / Cancel');
  const ut = strip(TEXTS['src/lib/utils.js']);
  const sc = ut.slice(ut.indexOf('export function showConfirmDialog('), ut.indexOf('\n}\n', ut.indexOf('export function showConfirmDialog(')));
  ok(/items = null \} = opts \|\| \{\};/.test(sc) && /ul\.className = 'dialog-list';/.test(sc) && /li\.textContent = x;/.test(sc) && /if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); done\(true\); \}/.test(sc) && /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); done\(false\); \}/.test(sc), '(d) showConfirmDialog lists `items` as text rows (never HTML); Enter = the confirm, Esc = Cancel');
  const native = ['src/lib/tab-group.js', 'src/lib/window.js', 'src/lib/taskbar.js'].filter((f) => /(^|[^.\w])(window\.)?confirm\(/.test(strip(TEXTS[f])));
  ok(native.length === 0, '(d) no native confirm() on the close path', native);
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok(/"Close \{n\} tabs\?": "关闭 \{n\} 个标签页？"/.test(zh) && /"Close \{n\} tabs": "关闭 \{n\} 个标签页"/.test(zh) && /"Close \{n\} tabs\?": "\{n\} 個のタブを閉じますか？"/.test(ja) && /"Close \{n\} tabs": "\{n\} 個のタブを閉じる"/.test(ja), '(d) zh + ja words for the question and its button');
  const css = read('public/style.css');
  ok(/\.dialog-list \{[^}]*max-height: 40vh;[^}]*overflow-y: auto;/.test(css), '(d) a long group\'s list scrolls inside the dialog (max-height 40vh)');
}

// ── §4 NEGATIVE CONTROLS ──
console.log('§4 negative controls (patched copies outside the tree)');
const M = mutantCopies('tab-close-confirm', REPO);
const patch = (src, find, repl) => { if (!src.includes(find)) throw new Error('control anchor gone: ' + find.slice(0, 60)); return src.replace(find, repl); };
{
  const clSrc = read(CL_REL);
  const lone = M.load(CL_REL, patch(clSrc, 'scope === \'group\' && Number(members) >= 2;', 'scope === \'group\' && Number(members) >= 1;'), 'asks-lone');
  const vl = verdictRows(lone);
  ok(vl.bad.length > 0 && vl.bad.every((b) => b.got === true && b.user === true && b.scope === 'group' && Number(b.members) === 1), `CONTROL verdict that asks a lone window ⇒ red exactly on the ${vl.bad.length} one-window group rows`, vl.bad.slice(0, 2));
  const prog = M.load(CL_REL, patch(clSrc, 'return user === true && scope', 'return scope'), 'asks-programmatic');
  const vp = verdictRows(prog);
  ok(vp.bad.length > 0 && vp.bad.every((b) => b.user !== true && b.got === true), `CONTROL verdict that asks a programmatic close ⇒ red exactly on the ${vp.bad.length} non-user rows`, vp.bad.slice(0, 2));
  const hl = await helperRows(helperFrom(tgSrc, lone));
  ok(hl.bad.length === 1 && /^B2 /.test(hl.bad[0].row), 'CONTROL …the helper over that verdict asks a chain of one (exactly B2 red)', hl.bad.map((b) => b.row));
}
{
  const onCancel = await helperRows(helperFrom(patch(tgSrc, '      if (go !== true) return false;\n', '\n'), CL));
  ok(onCancel.bad.some((b) => /^B3 /.test(b.row)) && onCancel.bad.some((b) => /^B9 /.test(b.row)), 'CONTROL a helper that closes whatever the answer ⇒ B3 (Cancel) and B9 (a failed question) red', onCancel.bad.map((b) => b.row));
  const live = await helperRows(helperFrom(patch(tgSrc, 'chain.tabs.filter((tid) => named.has(tid)).reverse()', '[...chain.tabs].reverse()'), CL));
  ok(live.bad.length === 1 && /^B6 /.test(live.bad[0].row), 'CONTROL a helper that closes the LIVE group (an unnamed tab too) ⇒ exactly B6 red', live.bad.map((b) => b.row));
  const shared = await helperRows(helperFrom(patch(tgSrc, '    if (open) return open;\n', '\n'), CL));
  ok(shared.bad.some((b) => /^B8 /.test(b.row)), 'CONTROL a helper that asks again while its question is open ⇒ B8 red', shared.bad.map((b) => b.row));
  const tbSrc = TEXTS['src/lib/taskbar.js'];
  const planted = { ...TEXTS, 'src/lib/taskbar.js': tbSrc + '\nfunction _closeGroupNow(app, chain) {\n  for (const tid of [...chain.tabs]) app.wm.requestClose(tid);\n}\n', 'src/lib/layout.js': TEXTS['src/lib/layout.js'] + '\nfunction _dropAll(wm, win) { win._tabChain.tabs.forEach((id) => wm.closeWindow(id)); }\n' };
  const ps = closeAllSites(planted).filter((s) => !(s.file === TG_REL && s.fn === 'requestCloseGroup'));
  ok(ps.length === 2 && ps.some((s) => s.fn === '_closeGroupNow') && ps.some((s) => s.fn === '_dropAll'), 'CONTROL a planted un-gated close-all (a for…of over chain.tabs; a tabs.forEach closeWindow) ⇒ (a) red at both', ps);
  const pd = doorCensus(planted);
  ok(pd.unlisted.length === 1 && /_closeGroupNow|requestClose\(tid\)/.test(pd.unlisted[0]), 'CONTROL …and the planted requestClose is an UNLISTED door ⇒ (b) red', pd.unlisted);
  const reverted = { ...TEXTS, 'src/lib/window.js': patch(TEXTS['src/lib/window.js'], 'this.requestCloseGroup(winInfo.id); };', 'this.requestClose(winInfo.id); };') };
  const rd = doorCensus(reverted);
  ok(rd.unlisted.length === 1 && rd.dead.length === 1 && /FRAME's ✕/.test(rd.dead[0]), "CONTROL the frame's ✕ back on requestClose (the pre-fix door) ⇒ (b) red: an unlisted call + the group row dead", [...rd.unlisted, ...rd.dead]);
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(r.pass, r.name, r.detail);
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
