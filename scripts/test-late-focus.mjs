#!/usr/bin/env node
// B-c87d — THE KEYBOARD STAYS WHERE THE PERSON LAST PUT IT (the coordinator's law, 2026-11-20). A conversation window that finished
// opening took the keyboard from the window the person clicked in the meantime: what they typed went, unseen, into the other
// conversation's composer. Now ONE pure verdict (src/lib/keyboard-yield.js lateFocusTakes) decides, ONE door asks it
// (src/lib/late-focus.js lateFocus / mayTakeKeys), and the person's acts are the page's own stamps (src/lib/utils.js lastPersonAct —
// the two capture listeners, no listener of the door's own). A late focus that lost the race is DROPPED, never queued.
//   §1 the verdict's table — and the base's rule (every late focus taken) refused by it
//   §2 where an act lands: insideWindow over a stand-in frame (its own content, its chrome, another tab's content in the same frame)
//   §3 THE DOOR, driven: the page's two capture listeners caught on a stand-in window, the REAL door over stand-in views: the common
//      road (the act that started the open), the race lost (a press, a key elsewhere), a press inside the opening window, a boot
//      restore, a replay, the predicate form
//   §4 THE CENSUS: every focus after an await in the page's code (src/lib, read by acorn: after an await in its own function, or in a
//      callback handed to then / finally / catch / setTimeout / requestAnimationFrame / queueMicrotask / a ws request) is through the
//      door or NAMED with its why; every door site stands by its words; a RED CONTROL per site kind (its door call planted back to a
//      bare focus — red at its file and line, or its pin red)
// The heavy twin: scripts/test-late-focus-chrome.mjs (a real page: a window opened, another clicked while it opens, typed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(repo, 'package.json'));
const acorn = require('acorn');
const { ok, report } = checker();
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const J = JSON.stringify;
const tick = () => new Promise((r) => setTimeout(r, 3));

// the page's two capture listeners, caught where utils.js registers them: a stand-in window BEFORE the first import of utils.js
const HANDLERS = {};
globalThis.window = { addEventListener: (type, fn) => { (HANDLERS[type] ||= []).push(fn); } };
const KY = await import('../src/lib/keyboard-yield.js');
const LF = await import('../src/lib/late-focus.js');
// …and a stand-in document only AFTER the imports (utils.js installs its tooltip at import when a document exists); the door reads
// it when it is called: no app dialog open, nothing focused
globalThis.document = { querySelectorAll: () => [], activeElement: null };

console.log('§1 the verdict (PURE keyboard-yield.js lateFocusTakes)');
const ROWS = [
  ['no act on the page yet: the window takes the keys', { since: 100, act: null }, 'take'],
  ['the act that STARTED the open lies before it: taken (the common road)', { since: 100, act: { at: 90, inside: false } }, 'take'],
  ['an act at the very instant the open began is not after it', { since: 100, act: { at: 100, inside: false } }, 'take'],
  ['a press into the opening window itself after it began: taken', { since: 100, act: { at: 120, inside: true } }, 'take'],
  ['a press or a key ELSEWHERE after the open began: dropped', { since: 100, act: { at: 120, inside: false } }, 'drop'],
  ['a boot restore (since = the page start) before the person acted: taken', { since: 0, act: null }, 'take'],
  ['a replay (since = the page start) after the person acted elsewhere on the page: dropped', { since: 0, act: { at: 5, inside: false } }, 'drop'],
  ['a missing start counts from the page start', { act: { at: 5, inside: false } }, 'drop'],
  ['an act without a time is no act', { since: 100, act: { at: Number.NaN, inside: false } }, 'take'],
];
const badRows = ROWS.filter(([, a, w]) => KY.lateFocusTakes(a) !== w).map(([n, a, w]) => `${n}: ${KY.lateFocusTakes(a)} (want ${w})`);
ok(badRows.length === 0, `the verdict's ${ROWS.length} rows: the keys stay where the person last put them (${ROWS.filter((r) => r[2] === 'drop').length} drops, ${ROWS.filter((r) => r[2] === 'take').length} takes)`, badRows);
const BASE_RULE = () => 'take';   // the base: a late focus took the keys whatever the person did since (only a dialog kept them)
const baseFails = ROWS.filter(([, a, w]) => BASE_RULE(a) !== w).map(([n]) => n);
ok(baseFails.length === 3, `CONTROL: the base's rule (every late focus taken) is refused by the table — ${baseFails.length} rows: ${baseFails.join(' · ')}`, baseFails);

console.log('§2 where an act lands (late-focus.js insideWindow)');
class N {
  constructor(cls = '') { this.cls = cls; this.kids = []; this.parent = null; }
  add(...ks) { for (const k of ks) { k.parent = this; this.kids.push(k); } return this; }
  contains(x) { for (let n = x; n; n = n.parent) if (n === this) return true; return false; }
  querySelectorAll(sel) { const want = sel.replace(/^\./, ''), out = []; const walk = (n) => { for (const k of n.kids) { if (k.cls === want) out.push(k); walk(k); } }; walk(this); return out; }
}
const frame = new N('window'), title = new N('window-titlebar'), contA = new N('window-content'), contB = new N('window-content');
const inA = new N('chat-input'), inB = new N('chat-input'), outside = new N('sidebar');
frame.add(title, contA.add(inA), contB.add(inB));
const WA = { element: frame, content: contA }, WB = { element: frame, content: contB };
const where = [
  ['a press in its own content', LF.insideWindow(WA, inA), true],
  ['a press on its frame\'s title bar', LF.insideWindow(WA, title), true],
  ['a press in ANOTHER tab\'s content of the same frame', LF.insideWindow(WA, inB), false],
  ['…which is inside that other tab', LF.insideWindow(WB, inB), true],
  ['a press outside the frame (the sidebar)', LF.insideWindow(WA, outside), false],
  ['a part of a window given as { content }', LF.insideWindow({ content: contA }, inA), true],
  ['no window: nothing is inside', LF.insideWindow(null, inA), false],
];
const badWhere = where.filter(([, g, w]) => g !== w).map(([n, g]) => `${n}: ${g}`);
ok(badWhere.length === 0, `insideWindow's ${where.length} rows: a window's own content and chrome are inside; another tab's content in the same frame is elsewhere`, badWhere);

console.log('§3 THE DOOR, driven (the page\'s capture listeners on a stand-in window, the real door)');
ok((HANDLERS.pointerdown || []).length === 1 && (HANDLERS.keydown || []).length === 1, `the person's acts ride the page's two capture listeners (pointerdown ${(HANDLERS.pointerdown || []).length}, keydown ${(HANDLERS.keydown || []).length}) — the door adds none`);
const pressAt = (target) => HANDLERS.pointerdown.forEach((h) => h({ target }));
const keyAt = (target, key = 'x') => HANDLERS.keydown.forEach((h) => h({ target, key }));
const view = () => ({ n: 0, focus() { this.n++; } });
const sidebar = new N('session-row'), frameC = new N('window'), contC = new N('window-content'), composerC = new N('chat-input');
frameC.add(contC.add(composerC));
const WC = { element: frameC, content: contC };
const boot = view();
ok(LF.lateFocus(boot, { win: WC, since: LF.PAGE_START }) === true && boot.n === 1, 'a boot restore before the person acted on the page takes the keys (the start is the page\'s)');
pressAt(sidebar); await tick();
const t1 = LF.openClock(); const v1 = view(); await tick();
ok(LF.lateFocus(v1, { win: WC, since: t1 }) === true && v1.n === 1, 'THE COMMON ROAD: the press that started the open (a sidebar row), then nothing else — the new window gets the keys, as before');
const t2 = LF.openClock(); await tick(); pressAt(inA); const v2 = view();
ok(LF.lateFocus(v2, { win: WC, since: t2 }) === false && v2.n === 0, 'B-c87d: the open began, then the person PRESSED into another window\'s composer — the late focus is dropped, the keys stay there');
await tick();
ok(v2.n === 0, '…dropped, never queued: nothing focuses it later (the door keeps nothing)');
const t3 = LF.openClock(); await tick(); keyAt(inA); const v3 = view();
ok(LF.lateFocus(v3, { win: WC, since: t3 }) === false && v3.n === 0, 'the open began, then the person TYPED in another window — dropped');
const t4 = LF.openClock(); await tick(); pressAt(composerC); const v4 = view();
ok(LF.lateFocus(v4, { win: WC, since: t4 }) === true && v4.n === 1, 'the open began, then the person pressed INTO the opening window itself — taken');
const v5 = view();
ok(LF.lateFocus(v5, { win: WC, since: LF.PAGE_START }) === true && v5.n === 1, 'a replay whose last act was inside the window it focuses — taken');
pressAt(inA); const v6 = view();
ok(LF.lateFocus(v6, { win: WC, since: LF.PAGE_START }) === false && v6.n === 0, 'a replay (a remote apply, a boot restore) after the person acted elsewhere on the page — dropped');
const t7 = LF.openClock(); await tick(); pressAt(inA);
ok(LF.mayTakeKeys({ win: WC, since: t7 }) === false && LF.mayTakeKeys({ win: { element: frame, content: contA }, since: t7 }) === true, 'the predicate form (a view asking before it focuses itself, xpra-view\'s mayFocus): the same verdict');
ok(LF.lateFocus(null, { win: WC, since: 0 }) === false, 'no view: nothing focused, nothing thrown');

console.log('§4 THE CENSUS: every focus after an await in the page\'s code');
const LATE_CB = new Set(['then', 'finally', 'catch', 'setTimeout', 'requestAnimationFrame', 'queueMicrotask', 'request', 'onGlobal']);
const PARSED = new Map();   // file → { src, out }: a plant re-reads only the file it changes (the census runs once per control)
const lateFocusesOf = (file, src) => {
  const hit = PARSED.get(file); if (hit && hit.src === src) return hit.out;
  const out = lateFocusesRead(src); PARSED.set(file, { src, out }); return out;
};
const lateFocusesRead = (src) => {
  let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); } catch (e) { return { parseError: e.message, calls: [] }; }
  const calls = [];
  const walk = (node, ctx) => {
    if (!node || typeof node.type !== 'string') return;
    let c = ctx;
    if (/Function/.test(node.type)) c = { awaitAt: -1, lateCb: !!ctx.passLate, passLate: false };
    if (node.type === 'AwaitExpression' && (c.awaitAt < 0 || node.start < c.awaitAt)) c.awaitAt = node.start;
    if (node.type === 'CallExpression') {
      const ce = node.callee, name = ce.type === 'MemberExpression' ? ce.property && ce.property.name : ce.name;
      if (name === 'focus' && ce.type === 'MemberExpression' && (c.lateCb || (c.awaitAt >= 0 && c.awaitAt < node.start))) calls.push({ line: node.loc.start.line, text: src.slice(node.start, node.end).replace(/\s+/g, ' ') });
      walk(ce, c);
      for (const a of node.arguments) walk(a, { ...c, passLate: LATE_CB.has(name) && /Function/.test(a.type) });
      return;
    }
    for (const k of Object.keys(node)) { if (k === 'loc') continue; const v = node[k]; if (Array.isArray(v)) v.forEach((x) => walk(x, c)); else if (v && typeof v.type === 'string') walk(v, c); }
  };
  walk(ast, { awaitAt: -1, lateCb: false, passLate: false });
  return { calls };
};
// the files where a composer, a terminal or a view that takes typing lives, or a window opens: each late focus there is named BY ITS
// WORDS with its why; anywhere else a late focus is a dialog's, a form's or a panel's own field, named BY ITS FILE with its why
const CLASS_FILES = new Set(['src/lib/session-lifecycle.js', 'src/lib/app.js', 'src/lib/chat-view.js', 'src/lib/chat-input.js', 'src/lib/chat-renderers.js', 'src/lib/chat-status-bar.js', 'src/lib/chat-minimap.js',
  'src/lib/terminal.js', 'src/lib/external-editor.js', 'src/lib/desktop-app-window.js', 'src/lib/xpra-view.js', 'src/lib/vnc-view.js', 'src/lib/internal-link-ui.js', 'src/lib/taskbar.js', 'src/lib/command-mode.js',
  'src/lib/window.js', 'src/lib/tab-group.js', 'src/lib/desktop-manager.js', 'src/lib/layout.js', 'src/lib/design-window.js', 'src/lib/channel-thread-pane.js', 'src/lib/doc-window-ui.js',
  'src/lib/browser-live-window.js', 'src/lib/browser-replay-window.js', 'src/lib/machine-desktop.js', 'src/lib/search-window.js', 'src/lib/inbox-window.js']);
const NAMED = [   // [file, the call's words, why]
  ['src/lib/chat-renderers.js', 'input.focus()', 'the language picker\'s own search box, in the next task of the person\'s open'],
  ['src/lib/chat-status-bar.js', 'ta.focus()', 'the design-list popover\'s own box, in the next task of the person\'s open'],
  ['src/lib/chat-status-bar.js', 'input.focus()', 'the goal popover\'s own field, in the next task of the person\'s open'],
  ['src/lib/chat-minimap.js', 'filter.focus()', 'the minimap search\'s own filter, a frame after the person\'s open'],
  ['src/lib/taskbar.js', "rows[0])?.focus()", 'the group chooser\'s own rows (a popover), a frame after the person\'s open'],
  ['src/lib/design-window.js', 'name.focus()', 'the design window\'s own name field (its form), in the next task of the person\'s act'],
  ['src/lib/design-window.js', 'composer.ta.focus()', 'the comment box the person\'s pick just drew, in the next task of that pick'],
  ['src/lib/session-lifecycle.js', 'ta.focus()', 'the fork dialog\'s first-message box, in the next task of the person\'s open'],
  ['src/lib/doc-window-ui.js', 'S.ed.commands.focus()', 'the document editor taking back the keys its own link dialog borrowed (the person\'s answer in that dialog)'],
  ['src/lib/doc-window-ui.js', 'S.ed.chain().focus()', 'the same, for the link and the image the person\'s answer inserts'],
  ['src/lib/doc-window-ui.js', 'hrefIn.focus()', 'the link bar\'s own address field, in the next task of the person\'s open'],
  ['src/lib/doc-window-ui.js', 'f.contentWindow.focus()', 'the hidden print frame, for the print dialog the person asked for — not a typing target'],
  ['src/lib/doc-window-ui.js', 'ta.focus()', 'the comment box the person\'s press opened, in the next task of that press'],
  ['src/lib/machine-desktop.js', '(user || pass).focus()', 'the desktop\'s own sign-in form field, in the next task of the form\'s draw'],
  ['src/lib/browser-replay-window.js', 'root.focus(', 'the replay\'s own root for its playback keys, after its own load — not a typing target'],
  ['src/lib/search-window.js', 'box.focus()', 'the search window\'s own query box after its own act — a field of the window the person is in'],
  ['src/lib/inbox-window.js', 'list.focus(', 'the For-you window\'s own list after its load — a list takes no typing'],
];
const PAGE = new Map((function walk(d) { const out = []; for (const e of fs.readdirSync(path.join(repo, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) out.push(...walk(r)); else if (e.name.endsWith('.js') && !/^i18n-/.test(e.name)) out.push(r); } return out; })('src/lib').map((f) => [f, read(f)]));
const DIALOG_FILE_WHY = 'a dialog\'s, a form\'s or a panel\'s own field, focused in the next task of the person\'s own open of it (not a composer, a terminal or a view that takes typing)';
const census = (files) => {
  const r = { files: 0, late: 0, named: 0, byFile: 0, unnamed: [], parse: [] };
  for (const [f, s] of files) {
    if (f === 'src/lib/late-focus.js') continue;   // THE door's own focus
    const { calls, parseError } = lateFocusesOf(f, s);
    if (parseError) { r.parse.push(`${f}: ${parseError}`); continue; }
    if (!calls.length) continue;
    r.files++;
    for (const c of calls) {
      r.late++;
      if (CLASS_FILES.has(f)) { if (NAMED.some(([nf, words]) => nf === f && c.text.includes(words))) r.named++; else r.unnamed.push(`${f}:${c.line} ${c.text.slice(0, 70)}`); }
      else r.byFile++;
    }
  }
  return r;
};
const C0 = census(PAGE);
ok(C0.parse.length === 0, `the census reads every file of src/lib (${PAGE.size} files)`, C0.parse);
ok(C0.late > 50 && C0.unnamed.length === 0, `every focus after an await in the page's code is through the door or named: ${C0.late} late focuses in ${C0.files} files — ${C0.named} named by their words in the window, chat and terminal code, ${C0.byFile} elsewhere (${DIALOG_FILE_WHY})${C0.unnamed.length ? ` — NOT NAMED: ${C0.unnamed.join(' · ')}` : ''}`, C0.unnamed);
// THE DOOR'S SITES, each by its words (a site that loses its door call is red here even where the census cannot see it late)
const SITES = [   // [file, the words, how many, the kind]
  ['src/lib/session-lifecycle.js', 'lateFocus(chatView, { win: winInfo, since: openAt })', 2, 'a session answer (create, attach) — chat'],
  ['src/lib/session-lifecycle.js', 'lateFocus(term, { win: winInfo, since: openAt })', 3, 'a session answer (create, attach, the tmux view) — terminal'],
  ['src/lib/session-lifecycle.js', 'const openAt = syncId ? PAGE_START : openClock();', 1, 'the create\'s start (a replay: the page\'s)'],
  ['src/lib/session-lifecycle.js', 'const openAt = (syncId || machine) ? PAGE_START : openClock();', 1, 'the attach\'s start (a replay or a machine\'s restore: the page\'s)'],
  ['src/lib/session-lifecycle.js', 'const openAt = replay ? PAGE_START : openClock();', 1, 'the tmux view\'s start'],
  ['src/lib/session-lifecycle.js', 'if (replay) lateFocus(term, { win: this.wm.windows.get(winId), since: PAGE_START });', 1, 'a replay\'s focus of a standing window'],
  ['src/lib/chat-input.js', 'since: this._picAddAt });', 1, 'the composer after a picture\'s read'],
  ['src/lib/terminal.js', 'lateFocus({ focus: () => this.terminal.focus() }, { win: this.winInfo, since: at })', 3, 'the terminal after a paste\'s upload or clipboard read'],
  ['src/lib/external-editor.js', 'lateFocus({ focus: () => termSession.terminal.focus() }, { win: targetWinInfo, since: at })', 2, 'the terminal after the editor\'s close'],
  ['src/lib/external-editor.js', 'lateFocus(editorView, { win: targetWinInfo, since: openAt })', 1, 'the editor pane after its open'],
  ['src/lib/desktop-app-window.js', 'lateFocus(view, { win: winInfo, since: at })', 2, 'the app\'s view after a take-over\'s lease'],
  ['src/lib/desktop-app-window.js', 'mayTakeKeys({ win: winInfo, since: openAt })', 1, 'the app\'s picture on connect (xpra-view\'s mayFocus)'],
  ['src/lib/desktop-app-window.js', 'lateFocus(handle, { win: winInfo, since: satAt })', 1, 'a satellite window bound late'],
  ['src/lib/app.js', 'if (session && since !== undefined) lateFocus(session, { win, since });', 1, 'a go-to that lands after an await'],
  ['src/lib/internal-link-ui.js', 'app.goToWinId(w, { since: at })', 1, 'the link door\'s other-desktop go-to'],
  ['src/lib/channel-thread-pane.js', '{ win: { content: pane }, since: openAt }', 1, 'the thread pane\'s composer after its render'],
];
const siteCount = (files, [f, words]) => (files.get(f) || '').split(words).length - 1;
const badSites = SITES.filter((s) => siteCount(PAGE, s) !== s[2]).map((s) => `${s[0]} «${s[1].slice(0, 50)}» ×${siteCount(PAGE, s)} (want ${s[2]})`);
ok(badSites.length === 0, `the door's ${SITES.reduce((n, s) => n + s[2], 0)} sites in ${new Set(SITES.map((s) => s[0])).size} files, each by its words (${SITES.map((s) => s[3]).join(' · ')})`, badSites);
// RED CONTROLS, one per site kind: the door's call planted back to the base's bare focus
const plant = (f, from, to) => { const s = PAGE.get(f) || ''; if (s.split(from).length !== 2) return null; const m = new Map(PAGE); m.set(f, s.replace(from, to)); return { m, line: s.slice(0, s.indexOf(from)).split('\n').length }; };
const KINDS = [
  ['a session answer (the attach, chat)', 'src/lib/session-lifecycle.js', "lateFocus(chatView, { win: winInfo, since: openAt }); // B-c87d: the person's act elsewhere", "chatView.focus(); // B-c87d: the person's act elsewhere"],   // stale-pins: kept (the base's text, planted)
  ['the terminal after a paste\'s upload', 'src/lib/terminal.js', "lateFocus({ focus: () => this.terminal.focus() }, { win: this.winInfo, since: at });\n            setTimeout(() => { _pasteInFlight = false; }, 1000);", "this.terminal.focus();\n            setTimeout(() => { _pasteInFlight = false; }, 1000);"],   // stale-pins: kept (the base's text, planted)
  ['the terminal after the editor\'s close', 'src/lib/external-editor.js', "if (termSession) setTimeout(() => { termSession.fit(); lateFocus({ focus: () => termSession.terminal.focus() }, { win: targetWinInfo, since: at }); }, 150);", "if (termSession) setTimeout(() => { termSession.fit(); termSession.terminal.focus(); }, 150);"],   // stale-pins: kept (the base's text, planted)
  ['the app\'s view after a take-over', 'src/lib/desktop-app-window.js', "applyLease(r.lease); lateFocus(view, { win: winInfo, since: at });", "applyLease(r.lease); view?.focus();"],   // stale-pins: kept (the base's text, planted)
  ['the thread pane\'s composer after its render', 'src/lib/channel-thread-pane.js', "if (ta) lateFocus({ focus: () => ta.focus({ preventScroll: true }) }, { win: { content: pane }, since: openAt });", "if (ta) ta.focus({ preventScroll: true });"],   // stale-pins: kept (the base's text, planted)
];
const kindOut = KINDS.map(([kind, f, from, to]) => { const p = plant(f, from, to); if (!p) return { kind, gone: true }; const c = census(p.m); return { kind, f, line: p.line, red: c.unnamed.some((u) => u.startsWith(`${f}:${p.line} `)), unnamed: c.unnamed }; });
ok(kindOut.every((k) => !k.gone && k.red), `CONTROL: each site kind's door call planted back to a bare focus is red at its file and line — ${kindOut.map((k) => k.gone ? `${k.kind}: ITS ANCHOR IS GONE` : `${k.kind} (${k.f}:${k.line} ${k.red ? 'red' : 'NOT red'})`).join(' · ')}`, kindOut);
// the kinds the census cannot see late (a callback handed to a factory, a predicate, a go-to whose focus lies in app.js): their pins
const PIN_KINDS = [
  ['the composer after a picture\'s read', 'src/lib/chat-input.js', 'since: this._picAddAt });', 'this._textarea.focus(); },'],   // stale-pins: kept (the base's text, planted)
  ['the app\'s picture on connect', 'src/lib/desktop-app-window.js', ' && mayTakeKeys({ win: winInfo, since: openAt })', ''],   // stale-pins: kept (the base's text, planted)
  ['a replay\'s focus of a standing window', 'src/lib/session-lifecycle.js', 'if (replay) lateFocus(term, { win: this.wm.windows.get(winId), since: PAGE_START }); else term.focus();', 'term.focus();'],   // stale-pins: kept (the base's text, planted)
  ['the link door\'s other-desktop go-to', 'src/lib/internal-link-ui.js', 'app.goToWinId(w, { since: at })', 'app.goToWinId(w)'],   // stale-pins: kept (the base's text, planted)
];
const pinOut = PIN_KINDS.map(([kind, f, from, to]) => { const p = plant(f, from, to); if (!p) return { kind, gone: true }; const bad = SITES.filter((s) => siteCount(p.m, s) !== s[2]); return { kind, red: bad.length > 0 }; });
ok(pinOut.every((k) => !k.gone && k.red), `CONTROL: each kind the census cannot see late, its door call planted away — its site pin is red: ${pinOut.map((k) => `${k.kind} ${k.gone ? 'ITS ANCHOR IS GONE' : k.red ? 'red' : 'NOT red'}`).join(' · ')}`, pinOut);
// …and a NEW late focus of a composer in the chat code, not named — red by its file and line
const p9 = plant('src/lib/chat-input.js', '  _addImageAttachment(files) {\n', '  _addImageAttachment(files) {\n    Promise.resolve().then(() => this._textarea.focus());\n');
const c9 = p9 ? census(p9.m) : null;
ok(!!c9 && c9.unnamed.join() === `src/lib/chat-input.js:${p9.line + 1} this._textarea.focus()`, `CONTROL: a NEW late focus of the composer, unnamed — red at ${c9 ? c9.unnamed.join(' · ') : 'ITS ANCHOR IS GONE'}`, c9 && c9.unnamed);

report();
