#!/usr/bin/env node
// THE STILL PRESS (B-8b8c, lane dialog-press) — the PURE half of scripts/scratch.mjs's still-press door, fast tier.
// MEASURED (the .390 mirror's red, test-refresh-note-chrome, reproduced on the box with the suite's own road): a form drawn
// 21–30 ms after the suite's own sidebar toggle rides #main-wrapper's 0.2 s margin-left slide WITH the whole workspace; 确定's
// centre read during the slide was 取消 when the press arrived (the .390 row), or the mousedown hit 确定 and the release came
// after it slid — the click on their common ancestor, the footer (the .373 row). The dialog never moved inside its window.
//   ① stillVerdict — a press only on a target that is the element at its point, enabled, the same rect on two looks, and no
//      running transition / animation that can move it (on it or an ancestor): gone · disabled · moving · covered · press
//   ② landingVerdict — where the press landed (pointerdown, click): both mirror rows are named misses
//   ③ the page half compiles, reads the movers by effect TARGET (an ancestor's slide counts) and only box-moving properties
//   ④ MUTANTS (each RED by name): a verdict that ignores a running mover · a landing check that reads the pointerdown only
//   ⑤ THE CENSUS — every HEAVY suite (ci.mjs's rows) that presses by coordinates outside THE still door (a literal
//      'mousePressed' / a touchStart dispatch): a RATCHET — the frozen ledger of direct sites per suite may only shrink; a new
//      or a grown one is RED by name, one that moved onto the door lowers its row (RED controls: a planted press, a converted suite)
//   ⑥ B-4f03 — realClicker's options: the measure source over a stand-in page (each scroll mode, the aim, the expression, the
//      refusals) and the door driven over a scripted page (the options reach the page, the press at the aim, uncover once a call)
//   ⑦ the press arm — the product's own mark (armProbeSource), its ARM_MS from src/lib/press-arm.js, armStep; the door waits it out
//      on a scripted clock, refuses by name what never ages, and says a press the product re-armed
// Run: node scripts/test-still-press.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STILL_MOVERS, stillVerdict, landingVerdict, stillLookSource, stillPresser, realClickMeasureSource, realClicker, armProbeSource, armStep } from './scratch.mjs';
import vm from 'node:vm';
import { SUITES } from './ci.mjs';
const t0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };

// the measured frames (m2, logs/m2/b8-rate1-try0.json): 确定 54 × 29, the workspace sliding under it
const LOOK = (x, extra = {}) => ({ found: true, rect: [x, 550.3, 54, 29], x: x + 27, y: 564.8, hits: true, under: 'button.btn-create', disabled: false, movers: [], ...extra });
const SLIDE = ['margin-left@div#main-wrapper'];
const CASES = [
  ['no target', null, { found: false }, 'gone'],
  ['a target with no box (display:none)', null, LOOK(0, { rect: [0, 0, 0, 0] }), 'gone'],
  ['disabled (an emptied note)', LOOK(852), LOOK(852, { disabled: true }), 'disabled'],
  ['the first look — no earlier look to compare', null, LOOK(784.6), 'moving'],
  ['MID-SLIDE: the same rect twice, but #main-wrapper\'s margin-left transition runs (the measured frame t30 → t39)', LOOK(759.2), LOOK(759.2, { movers: SLIDE }), 'moving'],
  ['the rect moved since the last look (784.6 → 825.2, the measured one-frame jump)', LOOK(784.6), LOOK(825.2), 'moving'],
  ['a sub-pixel wobble (0.3 px) is still', LOOK(852), LOOK(852.3), 'press'],
  ['covered (another element at its point)', LOOK(852), LOOK(852, { hits: false, under: 'div.dialog-overlay' }), 'covered'],
  ['still, at its point, enabled', LOOK(852), LOOK(852), 'press'],
];

console.log('① stillVerdict — press only a STILL target');
const table = (verdict) => CASES.map(([name, prev, now, want]) => [name, verdict(prev, now), want]);
for (const [name, got, want] of table(stillVerdict)) ok(got === want, `${name} ⇒ ${want}`, { got });

console.log('② landingVerdict — where the press landed');
const at = (mine, what) => ({ mine, what });
const ROW390 = { down: at(false, 'button.btn-cancel'), click: at(false, 'button.btn-cancel') };   // m1: the .390 mirror's row
const ROW373 = { down: at(true, 'button.btn-create'), up: at(false, 'div.dialog-footer'), click: { mine: false, anc: true, what: 'div.dialog-footer' } };   // m2 rate-1 try 0: the .373 row
const LANDS = [
  ['no pointerdown reached the page', null, {}, false, /no pointerdown/],
  ['the .390 row: pressed 取消 (the slide moved 确定 away before the press)', ROW390, {}, false, /landed on button\.btn-cancel/],
  ['the .373 row: pressed 确定, released after it slid ⇒ the click on the footer', ROW373, {}, false, /released over div\.dialog-footer — the target moved/],
  ['a POINTER CAPTURE by an ancestor (a title bar\'s drag): pressed and released over the target, the click retargeted to the title bar', { down: at(true, 'span.chat-title'), up: at(true, 'span.chat-title'), click: { mine: false, anc: true, what: 'div.window-titlebar' } }, {}, true, null],
  ['…an ancestor\'s click with the release NOT over the target is still a miss', { down: at(true, 'span.chat-title'), up: at(false, 'div.window-titlebar'), click: { mine: false, anc: true, what: 'div.window-titlebar' } }, {}, false, /released over div\.window-titlebar/],
  ['a target that left the page on its press (a menu item): its release is not judged', { down: at(true, 'div.context-menu-item'), up: { gone: true }, click: null }, { click: 'any' }, true, null],
  ['pressed and clicked 确定', { down: at(true, 'button.btn-create'), click: at(true, 'button.btn-create') }, {}, true, null],
  ['a target that acts on its pointerdown (click: false): the pointerdown alone', { down: at(true, 'div.context-menu-item'), click: null }, { click: false }, true, null],
  ['…but a click owed and none came', { down: at(true, 'button.btn-create'), click: null }, {}, false, /no click followed/],
  ['realClicker\'s mode (click: \'any\'): no click owed — the pointerdown on the target lands', { down: at(true, 'div.cn-line'), click: null }, { click: 'any' }, true, null],
  ['…but a click that came went elsewhere (the .373 row) is still a miss', ROW373, { click: 'any' }, false, /released over div\.dialog-footer/],
];
const lands = (lv) => LANDS.map(([name, seen, o, want, why]) => { const r = lv(seen, o); return [name, r.ok === want && (!why || why.test(r.why || '')), r]; });
for (const [name, good, r] of lands(landingVerdict)) ok(good, `${name} ⇒ ${r.ok ? 'landed' : `MISSED — «${r.why}»`}`, r);

console.log('③ the page half');
const src = stillLookSource('#refresh-live-dialog .btn-create'), srcJs = stillLookSource("JS:[...document.querySelectorAll('.context-menu-item')].find((n) => /x/.test(n.textContent))");
let compiles = true; try { new Function(src); new Function(srcJs); } catch (e) { compiles = String(e); }
ok(compiles === true, 'the look compiles — by selector and by a JS: expression', compiles);
ok(src.includes('document.querySelector("#refresh-live-dialog .btn-create")') && srcJs.includes("[...document.querySelectorAll('.context-menu-item')]"), 'it names its target by the selector, or evaluates the JS: expression');
ok(/a\.effect\.target\.contains\(e\)/.test(src) && /playState === 'running'/.test(src) && /elementFromPoint\(x, y\)/.test(src), 'a mover is any RUNNING animation whose effect target CONTAINS the target (an ancestor\'s slide counts); the point is read by elementFromPoint');
// A WRAPPED TARGET (an inline link over two lines — the UI train's hosted mirror, test-setting-links-chrome: «covered, under its point:
// div.ut-text»): the look aims at its FIRST line fragment, where the link is; its bounding box's centre is its paragraph
{
  const frag = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
  const lookOn = (source) => {
    const link = { tagName: 'SPAN', id: '', className: 'fy-link', isConnected: true, disabled: false, getAttribute: () => null,
      getBoundingClientRect: () => frag(10, 100, 300, 40), getClientRects: () => [frag(200, 100, 110, 20), frag(10, 120, 120, 20)], contains: (n) => n === link };
    const para = { tagName: 'DIV', id: '', className: 'ut-text', contains: (n) => n === para || n === link };
    // the page: only a point inside the link's two fragments is the link; the rest of the box is its paragraph
    const doc = { querySelector: () => link, getAnimations: () => [], elementFromPoint: (x, y) => ((x >= 200 && x <= 310 && y >= 100 && y <= 120) || (x >= 10 && x <= 130 && y >= 120 && y <= 140) ? link : para) };
    return new Function('document', `return ${source};`)(doc);
  };
  const wrapped = lookOn(stillLookSource('.fy-link'));
  ok(wrapped.found && wrapped.hits === true && wrapped.x === 255 && wrapped.y === 110, 'A WRAPPED TARGET is aimed at its FIRST line fragment — the point is on the link, so it is pressed, never «covered»', wrapped);
  const centre = lookOn(stillLookSource('.fy-link').replace("fr && fr.length > 1 && fr[0].width > 0 && fr[0].height > 0 ? fr[0] : q", 'q'));
  ok(centre.hits === false && centre.under === 'div.ut-text', 'RED CONTROL: aimed at its bounding box\'s centre (the look before) the wrapped link reads «covered» by its own paragraph', centre);
}
const MOVES = ['margin-left', 'left', 'top', 'transform', 'translate', 'width', 'height', 'padding-left', 'inset'], STAYS = ['opacity', 'color', 'background-color', 'box-shadow', 'outline-color', 'border-color', 'visibility'];
ok(MOVES.every((p) => STILL_MOVERS.test(p)) && STAYS.every((p) => !STILL_MOVERS.test(p)), `STILL_MOVERS moves a box (${MOVES.join(', ')}) — a fade or a colour does not (${STAYS.join(', ')})`, { moves: MOVES.filter((p) => !STILL_MOVERS.test(p)), stays: STAYS.filter((p) => STILL_MOVERS.test(p)) });
// the door's own loop over scripted looks: it waits out the slide, then presses once, and names a landing elsewhere
const drive = async (looks, seen, opts = {}) => {
  let i = 0; const sent = [], logs = [];
  const press = stillPresser({ evalJs: async (s) => (s.startsWith('window.__vsStillSeen') ? seen : s.includes('__vsStillSeen = {') ? true : looks[Math.min(i++, looks.length - 1)]), cdp: async (m, p) => { sent.push(p.type); return {}; }, log: (l) => logs.push(l), sleep: async () => {} });
  const r = await press('#refresh-live-dialog .btn-create', opts);
  return { r, looks: press.last.looks, sent, logs };
};
const MINE = { down: at(true, 'button.btn-create'), click: at(true, 'button.btn-create') };
const waited = await drive([LOOK(759.2, { movers: SLIDE }), LOOK(791.6, { movers: SLIDE }), LOOK(852), LOOK(852)], MINE);
ok(waited.r === true && waited.looks === 4 && waited.sent.join() === 'mouseMoved,mousePressed,mouseReleased', 'the door waits out the slide (two moving looks), presses ONCE on the still target', waited);
const missed = await drive([LOOK(852), LOOK(852)], ROW390);
ok(missed.r === false && /MISSED — the press landed on button\.btn-cancel/.test(missed.logs.join('\n')), 'a press that lands on 取消 is a named MISS, never a silent one', missed.logs);
const touched = await drive([LOOK(852), LOOK(852)], MINE, { touch: true });
ok(touched.r === true && touched.sent.join() === 'touchStart,touchEnd', 'a touch press: touchStart / touchEnd at the still point', touched.sent);
{
  const pts = []; let i = 0;
  const press = stillPresser({ evalJs: async (s) => (s.startsWith('window.__vsStillSeen') ? ROW390 : s.includes('__vsStillSeen = {') ? true : [LOOK(852), LOOK(852)][Math.min(i++, 1)]), cdp: async (m, p) => { if (p.type === 'mousePressed') pts.push([p.x, p.y]); return {}; }, log: () => {}, sleep: async () => {} });
  const r = await press('#refresh-live-dialog .btn-create', { aim: async () => ({ x: 811, y: 564 }) });
  ok(r === false && pts.length === 1 && pts[0].join() === '811,564' && /landed on button\.btn-cancel/.test(press.last.landed.why), 'the aim hook presses the point it hands back (a RED control\'s stale aim) — and the landing still judges it', { pts, landed: press.last.landed });
}

console.log('④ MUTANTS — each RED by name');
const mutate = (fn, from, to) => { const s = fn.toString(); if (!s.includes(from)) return null; return new Function(`return (${s.replace(from, to)})`)(); };
const blindToMovers = mutate(stillVerdict, "if (Array.isArray(now.movers) && now.movers.length) return 'moving';", '');
const redV = blindToMovers ? table(blindToMovers).filter(([, got, want]) => got !== want).map(([name]) => name) : ['(the anchor is gone)'];
ok(redV.length === 1 && /^MID-SLIDE/.test(redV[0]), `MUTANT the verdict ignores a running mover ⇒ RED by name: «${redV[0]}»`, redV);
const downOnly = (() => { let s = landingVerdict.toString(); const a = 'if (seen.up && !seen.up.gone && !seen.up.mine)', b = 'if (!click) return { ok: true };'; if (!s.includes(a) || !s.includes(b)) return null; s = s.replace(a, 'if (false)').replace(b, 'return { ok: true };'); return new Function(`return (${s})`)(); })();
const redL = downOnly ? lands(downOnly).filter(([, good]) => !good).map(([name]) => name) : ['(the anchor is gone)'];
ok(redL.length === 4 && /^the \.373 row/.test(redL[0]), `MUTANT the landing reads the pointerdown only ⇒ RED by name: «${redL[0]}»`, redL);

console.log('⑤ THE CENSUS — heavy suites that press by coordinates outside THE still door (a ratchet: the ledger may only shrink)');
{
  const DIR = path.dirname(fileURLToPath(import.meta.url));
  const sitesIn = (src) => (src.match(/['"]mousePressed['"]/g) || []).length + (src.match(/type:\s*['"]touchStart['"]/g) || []).length;
  // THE LEDGER (2026-11-10, lane dialog-press, B-8b8c — taken on 2.369.390 + this lane): direct coordinate-press sites per heavy suite —
  // each a named debt (its own press helper, no still gate, no landing check); a suite that moves its presses onto
  // stillPresser / realClicker lowers its row (to nothing). The shared doors in scripts/scratch.mjs are no suite.
  const LEDGER = {
  'test-agent-window-chrome': 1, 'test-agy-status-bar-chrome': 1, 'test-agy-subagent-chrome': 2,
  'test-artifacts-chrome': 2, 'test-automation-keys-chrome': 2,
  'test-billing-badge-live': 1, 'test-boot-reload-ready': 2, 'test-browser-human': 2, 'test-browser-human-ui': 1,
  'test-browser-identity': 1, 'test-browser-live': 1, 'test-browser-live-fit': 5, 'test-browser-live-input': 4,
  'test-browser-live-ui': 2, 'test-browser-multiview': 2, 'test-browser-profiles-ui': 1,
  'test-browser-replay-ui': 2, 'test-browser-resume-ui': 1, 'test-browser-takeover-queue-ui': 1, 'test-browser-who-ui': 1,
  'test-browser-windows': 3, 'test-browser-x-picture': 5, 'test-cache-warmth-chrome': 3, 'test-channel-edit-autosize': 2,
  'test-channel-jump': 1, 'test-channel-outbox-window': 1, 'test-channel-threads-ui': 3,
  'test-channel-window-render': 7, 'test-channels-aggregate-ui': 1, 'test-channels-e2e': 2, 'test-channels-groups-e2e': 1,
  'test-channels-panel-redraw': 2, 'test-chat-mermaid-chrome': 1, 'test-chat-needs-card-chrome': 4,
  'test-chat-needs-strip-chrome': 4, 'test-chat-proposal-card': 1, 'test-chat-scroll': 1, 'test-chat-send-landing': 1,
  'test-claude-wrapper-queue': 1, 'test-collab-live-counter': 1, 'test-decision-engine': 1, 'test-decision-rule': 1,
  'test-design-window': 6, 'test-desktop-app-fixed': 3, 'test-desktop-app-notify': 1, 'test-desktop-app-snap': 1,
  'test-desktop-app-window': 5, 'test-desktop-display-modes-chrome': 1, 'test-desktop-move': 7,
  'test-desktop-resume-paging': 4, 'test-desktop-small-chrome': 7, 'test-desktop-v2-chrome': 1,
  'test-desktop-v2-latency-chrome': 1, 'test-desktop-webrtc-chrome': 3, 'test-desktop-xpra-window-hidpi': 1,
  'test-desktop-xpra-window-open': 1, 'test-desktop-xpra-window-scale': 1, 'test-desktop-xpra-window-seamless': 6,
  'test-dialog-yield-chrome': 1, 'test-doc-window': 5, 'test-docx-viewer': 2, 'test-draft-focus-chrome': 1,
  'test-duo-layout': 2, 'test-exit-hop-chrome': 1, 'test-exit-late-chrome': 3, 'test-exit-slow-chrome': 3,
  'test-feedback-ui': 1, 'test-fold-ux': 2, 'test-foryou-honest-chrome': 2, 'test-gear-menu': 3, 'test-helper-ask-ui': 1,
  'test-inbox-reply-ui': 4, 'test-inbox-window-ui': 2, 'test-layout-placeholder-ui': 2, 'test-login-expiry': 1,
  'test-machine-app-chrome': 2, 'test-mobile-back-chrome': 2, 'test-mobile-gaps': 4, 'test-mobile-select': 4,
  'test-office-desktop': 2, 'test-page-link-ui': 1, 'test-parked-ask-ui': 1,
  'test-path-field-chrome': 1, 'test-peer-card-fold-ui': 2, 'test-phone-composer-chrome': 1, 'test-phone-desktop-sync': 5,
  'test-phone-dock-chrome': 3, 'test-phone-refusal-wrap-chrome': 2, 'test-phone-resume-keeps-layout-ui': 4,
  'test-phone-titlebar-ui': 8, 'test-popover-frame-close': 2, 'test-queue-steer': 7, 'test-record-clear-client': 1,
  'test-record-clear-ui': 1, 'test-resume-account-chrome': 2, 'test-session-title-ui': 2, 'test-sidebar-scroll': 1,
  'test-split-close-resurrect': 1, 'test-split-restore-hidden': 1, 'test-split-ux': 16, 'test-stage-dragout-ui': 7,
  'test-tab-close-confirm-ui': 1, 'test-task-detail-chrome': 2, 'test-taskbar-group-ui': 5, 'test-terminal-zoom-select': 2,
  'test-title-chips-ui': 1, 'test-toast-pass-through': 2, 'test-toolbar-resize': 1, 'test-tray-voice-phone': 2,
  'test-ui-scale': 2, 'test-update-dialog': 2, 'test-vault-paste-chrome': 3,
  'test-voice-chrome': 3, 'test-voice-follow-chrome': 2, 'test-voice-teach-chrome': 2,
  'test-webhook-section-place': 1, 'test-window-binding': 4, 'test-window-drag-ui': 3,
  };
  const census = (read) => { const now = {}; for (const n of SUITES.filter((s) => s.tier === 'heavy').map((s) => s.name)) { const src = read(n); if (src == null) continue; const k = sitesIn(src); if (k) now[n] = k; } return now; };
  const judge = (now, ledger) => ({ grew: Object.keys(now).filter((n) => now[n] > (ledger[n] || 0)).map((n) => `${n}: ${now[n]} direct site(s), its row ${ledger[n] || 'none'}`), shrank: Object.keys(ledger).filter((n) => (now[n] || 0) < ledger[n]).map((n) => `${n}: ${now[n] || 0} now, its row ${ledger[n]}`) });
  const readReal = (n) => { try { return fs.readFileSync(path.join(DIR, n + '.mjs'), 'utf8'); } catch { return null; } };
  const now = census(readReal), j = judge(now, LEDGER);
  const total = Object.values(now).reduce((a, b) => a + b, 0), owed = Object.values(LEDGER).reduce((a, b) => a + b, 0);
  console.log(`    (${Object.keys(now).length} heavy suites press by coordinates outside the door — ${total} direct sites; the ledger: ${Object.keys(LEDGER).length} rows, ${owed})`);
  ok(j.grew.length === 0, 'no heavy suite presses by coordinates outside THE still door beyond its ledger row (a new or a grown press goes through stillPresser / realClicker)', j.grew);
  ok(j.shrank.length === 0, 'the ledger is honest — a suite that moved its presses onto the door has its row lowered', j.shrank);
  const rn = readReal('test-refresh-note-chrome') || '';
  ok(!now['test-refresh-note-chrome'] && /stillPresser\(\{ evalJs: ev, cdp: S \}\)/.test(rn), 'test-refresh-note-chrome presses only through THE still door (0 direct sites)', now['test-refresh-note-chrome']);
  const planted = judge(census((n) => (n === 'test-refresh-note-chrome' ? (readReal(n) || '') + "\nawait S('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1 });" : readReal(n))), LEDGER);
  ok(planted.grew.length === 1 && /^test-refresh-note-chrome: 1 direct site/.test(planted.grew[0]), 'RED CONTROL: a press planted in a door-only suite ⇒ named', planted.grew);
  const first = Object.keys(LEDGER)[0];
  const converted = judge(census((n) => (n === first ? (readReal(n) || '').replace(/['"]mousePressed['"]/g, "'pressed-by-the-door'").replace(/type:\s*['"]touchStart['"]/g, "type: 'door'") : readReal(n))), LEDGER);
  ok(converted.shrank.length === 1 && converted.shrank[0].startsWith(first + ': 0 now'), `RED CONTROL: a suite converted onto the door with its row unlowered ⇒ named (${first})`, converted.shrank);
}

// ⑥ B-4f03 (lane bl-tests-e): realClicker's MEASURE — the three last copies' needs as options of the one door. The page half is a
// PURE source (scripts/scratch.mjs realClickMeasureSource), run here over a stand-in page (vm): which scroll it asks, where it aims
console.log('⑥ B-4f03: the door\'s measure — an EXPRESSION target, the three scroll modes, the aim in from the left');
{
  const page = (rect, { found = true, viaExpr = false } = {}) => {
    const scrolls = [], el = { tagName: 'BUTTON', className: 'x', scrollIntoView: (o) => scrolls.push(o.block), contains: () => false,
      getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }) };
    const ctx = { document: { querySelector: () => (found && !viaExpr ? el : null), elementFromPoint: () => el }, window: {}, innerHeight: 800, innerWidth: 1280, THE_EL: el };
    return { ctx, el, scrolls, run: (src) => new vm.Script(src).runInNewContext(ctx) };
  };
  const IN = { left: 100, top: 300, width: 300, height: 40 }, OUT = { left: 100, top: -30, width: 300, height: 40 };
  const BELOW = { left: 100, top: 780, width: 300, height: 40 }, RIGHT = { left: 1100, top: 300, width: 300, height: 40 };
  const a = page(IN), ra = a.run(realClickMeasureSource('.b'));
  ok(ra && ra.hits && ra.x === 250 && ra.y === 320 && a.scrolls.join() === 'center' && a.ctx.window.__vsRealClickEl === a.el, 'the default is the door as it was: centred scroll, aimed at the centre, the element kept for the still look', { ra, scrolls: a.scrolls });
  const b = page(IN); b.run(realClickMeasureSource('.b', { scroll: 'nearest' }));
  ok(b.scrolls.join() === 'nearest', 'scroll: \'nearest\' asks the least move (a row in a list)', b.scrolls);
  const c = page(IN); c.run(realClickMeasureSource('.b', { scroll: 'if-needed' }));
  const d = page(OUT); d.run(realClickMeasureSource('.b', { scroll: 'if-needed' }));
  const d2 = page(BELOW); d2.run(realClickMeasureSource('.b', { scroll: 'if-needed' }));
  const d3 = page(RIGHT); d3.run(realClickMeasureSource('.b', { scroll: 'if-needed' }));
  ok(c.scrolls.length === 0 && d.scrolls.join() === 'center' && d2.scrolls.join() === 'center' && d3.scrolls.join() === 'center', 'scroll: \'if-needed\' scrolls a target wholly in view NOT at all (a press that scrolls its own target moves it); one out past the top, the bottom or the right edge to the centre', { inView: c.scrolls, top: d.scrolls, bottom: d2.scrolls, right: d3.scrolls });
  const e = page(IN), re = e.run(realClickMeasureSource('.b', { aimLeft: 40 }));
  const f = page({ ...IN, width: 50 }), rf = f.run(realClickMeasureSource('.b', { aimLeft: 40 }));
  ok(re.x === 140 && rf.x === 125, 'aimLeft: 40 px in from the left edge; a target narrower than twice that is aimed at its centre', { wide: re.x, narrow: rf.x });
  const g = page(IN, { viaExpr: true }), rg = g.run(realClickMeasureSource('(THE_EL)'));
  const h = page(IN, { viaExpr: true }), rh = h.run(realClickMeasureSource('THE_EL'));
  ok(rg && rg.hits && rh === null, 'a target that starts with «(» is an EXPRESSION evaluated in the page; any other string is a selector (here it finds nothing)', { expr: rg, selector: rh });
  let threw = [];
  for (const o of [{ scroll: 'middle' }, { aimLeft: -1 }, { aimLeft: '40' }]) { try { realClickMeasureSource('.b', o); } catch (x) { threw.push(x.message.slice(0, 40)); } }
  ok(threw.length === 3, 'an unknown scroll or an aim that is no number ≥ 0 is refused by name', threw);
}

// ⑥b the DOOR itself over a scripted page (B-4f03, the read's should: the source legs alone let a realClicker that dropped its
// options, the aim's override or the once-a-call rule pass) — the evalJs answers by what each source asks
// the DOOR over a scripted page (⑥b, ⑦): the evalJs answers by what each source asks
const drive6 = async ({ measures, unders, uncover = null, opts = {}, arms = [{ marks: [] }], sleep = undefined, hidden = false, stamps = { stampDown: 1000, stampAfter: 1000 } }) => {
  const asked = [], sent = [], logs = [], asks = { hidden: 0 }; let m = 0, u = 0, a = 0;
  const LOOK = { found: true, rect: [100, 300, 300, 40], x: 250, y: 320, hits: true, under: 'button.b', disabled: false, movers: [] };
  const SEEN = { down: { mine: true, what: 'button.b' }, up: { mine: true, what: 'button.b' }, click: { mine: true, what: 'button.b' }, ...stamps };   // the target's own stamp at the press and after it (ARM_REAL)
  const evalJs = async (s) => {
    if (s.startsWith('window.__vsStillSeen')) return SEEN;
    if (s.includes('__vsStillSeen = {')) return true;
    if (s.includes('const e = window.__vsRealClickEl; if (!e || !e.isConnected)')) return LOOK;
    if (s.includes('hit = document.elementFromPoint(') && s.includes('const e = window.__vsRealClickEl, hit')) return unders[Math.min(u++, unders.length - 1)];
    if (s.includes('const marks = []')) return arms[Math.min(a++, arms.length - 1)];   // the press arm's probe (⑦)
    if (s.includes("document.visibilityState === 'hidden'")) { asks.hidden++; return hidden; }   // the door asks whether the page is hidden
    asked.push(s); return measures[Math.min(m++, measures.length - 1)];
  };
  const RC = realClicker({ evalJs, cdp: async (meth, p) => { sent.push(meth === 'Page.bringToFront' ? 'front' : `${p.type}@${Math.round(p.x)},${Math.round(p.y)}`); }, log: (l) => logs.push(l), ...(sleep ? { sleep } : {}) });
  let n = 0;
  const r = await RC('.b', { ...opts, ...(uncover ? { uncover: async () => { n++; } } : {}) });
  return { r, asked, sent, logs, asks, uncovers: n, reaimed: RC.reaimed, armed: RC.armed, miss: RC.lastMiss };
};
{
  const drive = drive6;
  const HIT = { x: 250, y: 320, hits: true, hit: 'BUTTON.b' }, COVERED = { x: 250, y: 320, hits: false, hit: 'DIV.global-toast' };
  const A = await drive({ measures: [HIT], unders: [{ hits: true }], opts: { scroll: 'nearest', aimLeft: 40 } });
  ok(A.r === true && A.asked[0].includes("block: 'nearest'") && A.asked[0].includes('Math.min(q.width / 2, 40)') && A.sent.includes('mousePressed@140,320'), 'the options REACH the page (the measure asks the nearest scroll and the aim) and the press lands at the aim from the still look\'s rect (140, 320), never its centre', A);
  const B = await drive({ measures: [HIT], unders: [{ hits: true }] });
  ok(B.r === true && B.asked[0].includes("block: 'center'") && B.sent.includes('mousePressed@250,320'), 'no option: the door as it was — the centred scroll, the press at the still look\'s centre', B);
  const C = await drive({ measures: [COVERED, HIT, HIT], unders: [{ hits: false, hit: 'DIV.global-toast' }, { hits: true }], uncover: true });
  ok(C.r === true && C.uncovers === 1 && C.asked.length === 3, 'uncover runs ONCE a call: covered at the measure it clears and measures again; covered again at the press it re-aims without a second clear', C);
  const D = await drive({ measures: [HIT, HIT], unders: [{ hits: false, hit: 'DIV.global-toast' }, { hits: true }], uncover: true });
  ok(D.r === true && D.uncovers === 1 && D.reaimed && D.reaimed.uncovered === true && D.logs.some((l) => /covered at press time by DIV\.global-toast — the suite's uncover ran once/.test(l)), 'covered at the press: the suite\'s uncover runs, the point is measured again, and the log says a cover was cleared (never «it moved»)', D);
  const E = await drive({ measures: [COVERED], unders: [{ hits: true }] });
  ok(E.r === false && E.sent.length === 0, 'covered and no uncover hook: no press, as before', E);
}

// ⑦ THE PRESS ARM, ASKED OF THE PRODUCT (the 2.369.413 checkpoint's hosted red: test-exit-access-ui's Allow pressed ~80 ms after
// the door was called counted for nothing; the ask expired 60 s later as fifteen red legs). The door reads EVERY arm mark the product
// keeps on the target and its ancestors and presses only once the latest is ARM_MS old — ARM_MS read from src/lib/press-arm.js here too
console.log('⑦ the press arm — the product\'s own marks, its ARM_MS, never a press inside it');
{
  const { ARM_MS } = await import(new URL('../src/lib/press-arm.js', import.meta.url).href);
  ok(Number.isFinite(ARM_MS) && ARM_MS > 0, `the product's ARM_MS is read from its module (${ARM_MS} ms)`);
  // the step, PURE: the LATEST mark decides
  const st = (marks) => JSON.stringify(armStep({ marks }, ARM_MS));
  ok(st([]) === '"press"' && st([{ age: ARM_MS + 1 }]) === '"press"' && st([{ age: ARM_MS - 300 }]) === JSON.stringify({ wait: 300 })
    && st([{ age: ARM_MS + 500 }, { age: ARM_MS - 200 }]) === JSON.stringify({ wait: 200 }) && st([{ age: 99999, moved: true }]) === JSON.stringify({ wait: ARM_MS, moved: true })
    && st([{ readyIn: 250 }]) === JSON.stringify({ wait: 250 }) && st([{ readyIn: -5 }, { age: ARM_MS + 9 }]) === '"press"' && st([{ age: NaN }]) === JSON.stringify({ wait: ARM_MS }),
    'armStep: no mark or every mark old ⇒ press; else the LATEST mark\'s rest (a button\'s own stamp AND its card\'s open both gate it); moved ⇒ a whole arm; a ready time ⇒ until it passed');
  // the probe over stand-in pages (vm): every mark on the chain, never a selector list
  const el = (o = {}) => ({ nodeType: 1, isConnected: true, parentElement: null, getBoundingClientRect: () => ({ top: 100 }), ...o });
  const probe = (target) => new vm.Script(armProbeSource()).runInNewContext({ window: { __vsRealClickEl: target }, performance: { now: () => 1500 }, Date: { now: () => 1000 } });
  const card = el({ _openedAt: 1300 }), btn = el({ _armSince: 1000, _armTop: 100, parentElement: card });
  const pc = probe(btn), mk = (p, k) => p.marks.find((m) => m.mark === k);
  ok(pc.marks.length === 2 && mk(pc, '_armSince').age === 500 && mk(pc, '_armSince').self === true && !mk(pc, '_armSince').moved && mk(pc, '_openedAt').age === 200 && JSON.stringify(armStep(pc, ARM_MS)) === JSON.stringify({ wait: ARM_MS - 200 }),
    'a button\'s own _armSince AND its card\'s younger _openedAt are both read — the door waits for the card (the later one), never presses into the card\'s arm', pc);
  const moved = probe(el({ _armSince: 1000, _armTop: 140 })), never = probe(el({ _armSince: 1000 }));
  ok(mk(moved, '_armSince').moved === true && mk(never, '_armSince').moved === true, 'a top that moved since the product read it, or NONE read at all (press-arm.js armAfterLayout re-arms both at the press), is «moved»', { moved, never });
  const outbox = el({ dataset: { armedAt: '1400' } }), pb = probe(el({ parentElement: outbox, dataset: {} }));
  ok(mk(pb, 'data-armed-at') && mk(pb, 'data-armed-at').readyIn === 400 && JSON.stringify(armStep(pb, ARM_MS)) === JSON.stringify({ wait: 400 }), 'an Outbox card\'s data-armed-at (its ready time, the Date clock): the door waits until it passed', pb);
  ok(probe(el()).marks.length === 0, 'a plain control carries no mark: no wait');
  // the door itself on a scripted page and a scripted clock (no real waiting)
  const HIT = { x: 250, y: 320, hits: true, hit: 'BUTTON.b' };
  const clock = () => { const waits = []; return { waits, sleep: async (ms) => { waits.push(ms); } }; };
  const own = (age, since = 1000, extra = {}) => ({ mark: '_armSince', self: true, since, age, moved: false, ...extra });
  const c1 = clock(), A = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c1.sleep, arms: [{ marks: [own(ARM_MS - 300)] }, { marks: [own(ARM_MS + 30)] }, { marks: [own(ARM_MS + 60)] }] });
  ok(A.r === true && A.armed && A.armed.waitedMs === 330 && A.sent.includes('mousePressed@250,320'), `an armed control ${ARM_MS - 300} ms old: the door WAITS out the arm (${A.armed && A.armed.waitedMs} ms on the clock), proves the point again, then presses`, A);
  const c2 = clock(), B = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c2.sleep, arms: [{ marks: [own(99999, 1000, { moved: true })] }] });
  ok(B.r === false && !B.sent.includes('mousePressed@250,320') && /ARMED \(_armSince \(moved\)\).*STALE stamp.*no pass of the product read it again.*not pressed/.test(B.miss && B.miss.why), 'a STALE stamp (it moved; no pass of the product read it again): NOT pressed — it fails BY NAME at the press, in words that point at the stamp, never at timing', B.miss);
  const c3 = clock(), C = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c3.sleep, arms: [{ marks: [own(ARM_MS + 100)] }], stamps: { stampDown: 1000, stampAfter: 1900 } });
  ok(C.r === false && C.sent.includes('mousePressed@250,320') && /RE-ARMED it at the press/.test(C.miss && C.miss.why), 'a press at which the product re-stamped the target\'s OWN arm — read at the INSTANT of the press and right after its click: said by name, the press counted for nothing', C.miss);
  const c3b = clock(), C2 = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c3b.sleep, arms: [{ marks: [own(ARM_MS + 100)] }, { marks: [own(1, 1900)] }], stamps: { stampDown: 1000, stampAfter: 1000 } });
  ok(C2.r === true, 'a stamp a LATER row pass made (the element moved after the press — the probe a round trip later reads it younger) is NO re-arm: the press counted, the door says so', C2.miss);
  const c4 = clock(), D = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c4.sleep });
  ok(D.r === true && D.armed === null && c4.waits.join() === '40', 'an unarmed control: no arm wait at all — the scripted clock holds only the still look\'s one 40 ms pause', { armed: D.armed, waits: c4.waits });
  const c5 = clock(), E = await drive6({ measures: [HIT], unders: [{ hits: true }, { hits: false, hit: 'DIV.global-toast' }], sleep: c5.sleep, arms: [{ marks: [own(ARM_MS - 300)] }, { marks: [own(ARM_MS + 30)] }] });
  ok(E.r === false && !E.sent.includes('mousePressed@250,320') && /not under the pointer after the arm/.test(E.miss && E.miss.why), 'the point no longer the target after the arm\'s wait: NOT pressed, said by name', E.miss);
  const c6 = clock(), F = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c6.sleep, hidden: true });
  const c7 = clock(), G = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c7.sleep, hidden: false });
  ok(F.r === true && F.sent[0] === 'front' && G.r === true && !G.sent.includes('front'), 'the DOOR brings a HIDDEN page to the front before it measures (a background tab advances no animation); a visible page is left as the suite put it', { hidden: F.sent, visible: G.sent });
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass}) — ${Date.now() - t0} ms`);
process.exit(fail ? 1 : 0);
