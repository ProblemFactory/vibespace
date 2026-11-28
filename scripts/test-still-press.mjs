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
import { STILL_MOVERS, stillVerdict, landingVerdict, stillLookSource, stillPresser, realClickMeasureSource, realClicker, armProbeSource, armStep, lostWords, pageSceneSource, sceneWords, SCENE_BOUNDS } from './scratch.mjs';
import vm from 'node:vm';
import { SUITES } from './ci.mjs';
const t0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };

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
for (const [name, good, r] of lands(landingVerdict)) ok(verdictOf(good), `${name} ⇒ ${r.ok ? 'landed' : `MISSED — «${r.why}»`}`, r);

console.log('③ the page half');
const src = stillLookSource('#refresh-live-dialog .btn-create'), srcJs = stillLookSource("JS:[...document.querySelectorAll('.context-menu-item')].find((n) => /x/.test(n.textContent))");
let compiles = true; try { new Function(src); new Function(srcJs); } catch (e) { compiles = String(e); }
ok(compiles === true, 'the look compiles — by selector and by a JS: expression', compiles);
ok(gateOf(src.includes('document.querySelector("#refresh-live-dialog .btn-create")')) && verdictOf(srcJs.includes("[...document.querySelectorAll('.context-menu-item')]")), 'it names its target by the selector, or evaluates the JS: expression');
ok(gateOf(/a\.effect\.target\.contains\(e\)/.test(src)) && gateOf(/playState === 'running'/.test(src)) && verdictOf(/elementFromPoint\(x, y\)/.test(src)), 'a mover is any RUNNING animation whose effect target CONTAINS the target (an ancestor\'s slide counts); the point is read by elementFromPoint');
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
  ok(gateOf(wrapped.found) && wrapped.hits === true && wrapped.x === 255 && wrapped.y === 110, 'A WRAPPED TARGET is aimed at its FIRST line fragment — the point is on the link, so it is pressed, never «covered»', wrapped);
  const centre = lookOn(stillLookSource('.fy-link').replace("fr && fr.length > 1 && fr[0].width > 0 && fr[0].height > 0 ? fr[0] : q", 'q'));
  ok(centre.hits === false && centre.under === 'div.ut-text', 'RED CONTROL: aimed at its bounding box\'s centre (the look before) the wrapped link reads «covered» by its own paragraph', centre);
}
const MOVES = ['margin-left', 'left', 'top', 'transform', 'translate', 'width', 'height', 'padding-left', 'inset'], STAYS = ['opacity', 'color', 'background-color', 'box-shadow', 'outline-color', 'border-color', 'visibility'];
ok(gateOf(MOVES.every((p) => STILL_MOVERS.test(p))) && verdictOf(STAYS.every((p) => !STILL_MOVERS.test(p))), `STILL_MOVERS moves a box (${MOVES.join(', ')}) — a fade or a colour does not (${STAYS.join(', ')})`, { moves: MOVES.filter((p) => !STILL_MOVERS.test(p)), stays: STAYS.filter((p) => STILL_MOVERS.test(p)) });
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
ok(missed.r === false && verdictOf(/MISSED — the press landed on button\.btn-cancel/.test(missed.logs.join('\n'))), 'a press that lands on 取消 is a named MISS, never a silent one', missed.logs);
const touched = await drive([LOOK(852), LOOK(852)], MINE, { touch: true });
ok(touched.r === true && touched.sent.join() === 'touchStart,touchEnd', 'a touch press: touchStart / touchEnd at the still point', touched.sent);
{
  const pts = []; let i = 0;
  const press = stillPresser({ evalJs: async (s) => (s.startsWith('window.__vsStillSeen') ? ROW390 : s.includes('__vsStillSeen = {') ? true : [LOOK(852), LOOK(852)][Math.min(i++, 1)]), cdp: async (m, p) => { if (p.type === 'mousePressed') pts.push([p.x, p.y]); return {}; }, log: () => {}, sleep: async () => {} });
  const r = await press('#refresh-live-dialog .btn-create', { aim: async () => ({ x: 811, y: 564 }) });
  ok(r === false && pts.length === 1 && pts[0].join() === '811,564' && verdictOf(/landed on button\.btn-cancel/.test(press.last.landed.why)), 'the aim hook presses the point it hands back (a RED control\'s stale aim) — and the landing still judges it', { pts, landed: press.last.landed });
}

console.log('④ MUTANTS — each RED by name');
// B-0d3e: the anchor judged BY NAME — a moved or doubled anchor is a red row naming it and the function (scripts/scratch.mjs);
// then null, and the mutant's own leg reds «(the anchor is gone)» too — nothing crashes
const mutate = (fn, from, to) => { const s = fn.toString(), n = s.split(from).length - 1; if (n !== 1) { ok(false, `ANCHOR (${fn.name} of scripts/scratch.mjs): ${JSON.stringify(from).slice(0, 100)} — found ${n} times in its source, one meant: the mutant builds nothing`); return null; } return new Function(`return (${s.replace(from, to)})`)(); };
const blindToMovers = mutate(stillVerdict, "if (Array.isArray(now.movers) && now.movers.length) return 'moving';", '');
const redV = blindToMovers ? table(blindToMovers).filter(([, got, want]) => got !== want).map(([name]) => name) : ['(the anchor is gone)'];
ok(redV.length === 1 && verdictOf(/^MID-SLIDE/.test(redV[0])), `MUTANT the verdict ignores a running mover ⇒ RED by name: «${redV[0]}»`, redV);
const downOnly = (() => { let s = landingVerdict.toString(); const a = 'if (seen.up && !seen.up.gone && !seen.up.mine)', b = 'if (!click) return { ok: true };'; if (!s.includes(a) || !s.includes(b)) return null; s = s.replace(a, 'if (false)').replace(b, 'return { ok: true };'); return new Function(`return (${s})`)(); })();
const redL = downOnly ? lands(downOnly).filter(([, good]) => !good).map(([name]) => name) : ['(the anchor is gone)'];
ok(redL.length === 4 && verdictOf(/^the \.373 row/.test(redL[0])), `MUTANT the landing reads the pointerdown only ⇒ RED by name: «${redL[0]}»`, redL);

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
  ok(!now['test-refresh-note-chrome'] && verdictOf(/stillPresser\(\{ evalJs: ev, cdp: S \}\)/.test(rn)), 'test-refresh-note-chrome presses only through THE still door (0 direct sites)', now['test-refresh-note-chrome']);
  const planted = judge(census((n) => (n === 'test-refresh-note-chrome' ? (readReal(n) || '') + "\nawait S('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1 });" : readReal(n))), LEDGER);
  ok(planted.grew.length === 1 && verdictOf(/^test-refresh-note-chrome: 1 direct site/.test(planted.grew[0])), 'RED CONTROL: a press planted in a door-only suite ⇒ named', planted.grew);
  const first = Object.keys(LEDGER)[0];
  const converted = judge(census((n) => (n === first ? (readReal(n) || '').replace(/['"]mousePressed['"]/g, "'pressed-by-the-door'").replace(/type:\s*['"]touchStart['"]/g, "type: 'door'") : readReal(n))), LEDGER);
  ok(converted.shrank.length === 1 && verdictOf(converted.shrank[0].startsWith(first + ': 0 now')), `RED CONTROL: a suite converted onto the door with its row unlowered ⇒ named (${first})`, converted.shrank);
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
  ok(gateOf(ra) && gateOf(ra.hits) && ra.x === 250 && ra.y === 320 && a.scrolls.join() === 'center' && a.ctx.window.__vsRealClickEl === a.el, 'the default is the door as it was: centred scroll, aimed at the centre, the element kept for the still look', { ra, scrolls: a.scrolls });
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
  ok(gateOf(rg) && gateOf(rg.hits) && rh === null, 'a target that starts with «(» is an EXPRESSION evaluated in the page; any other string is a selector (here it finds nothing)', { expr: rg, selector: rh });
  let threw = [];
  for (const o of [{ scroll: 'middle' }, { aimLeft: -1 }, { aimLeft: '40' }]) { try { realClickMeasureSource('.b', o); } catch (x) { threw.push(x.message.slice(0, 40)); } }
  ok(threw.length === 3, 'an unknown scroll or an aim that is no number ≥ 0 is refused by name', threw);
}

// ⑥b the DOOR itself over a scripted page (B-4f03, the read's should: the source legs alone let a realClicker that dropped its
// options, the aim's override or the once-a-call rule pass) — the evalJs answers by what each source asks
// the DOOR over a scripted page (⑥b, ⑦): the evalJs answers by what each source asks
const drive6 = async ({ measures, unders, uncover = null, opts = {}, arms = [{ marks: [] }], sleep = undefined, hidden = false, stamps = { stampDown: 1000, stampAfter: 1000 }, look = null }) => {
  const asked = [], sent = [], logs = [], asks = { hidden: 0 }, bad = [], armSrc = []; let m = 0, u = 0, a = 0;
  const LOOK = look || { found: true, rect: [100, 300, 300, 40], x: 250, y: 320, hits: true, under: 'button.b', disabled: false, movers: [] };
  const SEEN = { down: { mine: true, what: 'button.b' }, up: { mine: true, what: 'button.b' }, click: { mine: true, what: 'button.b' }, ...stamps };   // the target's own stamp at the press and after it (ARM_REAL)
  const evalJs = async (s) => {
    try { new vm.Script(s); } catch (x) { bad.push(`${x.message} — ${s.slice(0, 80)}`); }   // every page source the door sends COMPILES
    if (s.startsWith('window.__vsStillSeen')) return SEEN;
    if (s.includes('__vsStillSeen = {')) { armSrc.push(s); return true; }
    if (s.includes('const e = window.__vsRealClickEl; if (!e || !e.isConnected)')) return LOOK;
    if (s.includes('hit = document.elementFromPoint(') && s.includes('const e = window.__vsRealClickEl, hit')) return unders[Math.min(u++, unders.length - 1)];
    if (s.includes('const marks = []')) return arms[Math.min(a++, arms.length - 1)];   // the press arm's probe (⑦)
    if (s.includes("document.visibilityState === 'hidden'")) { asks.hidden++; return hidden; }   // the door asks whether the page is hidden
    asked.push(s); return measures[Math.min(m++, measures.length - 1)];
  };
  const RC = realClicker({ evalJs, cdp: async (meth, p) => { sent.push(meth === 'Page.bringToFront' ? 'front' : `${p.type}@${Math.round(p.x)},${Math.round(p.y)}`); }, log: (l) => logs.push(l), ...(sleep ? { sleep } : {}) });
  let n = 0;
  const r = await RC('.b', { ...opts, ...(uncover ? { uncover: async () => { n++; } } : {}) });
  return { r, asked, sent, logs, asks, uncovers: n, reaimed: RC.reaimed, armed: RC.armed, miss: RC.lastMiss, front: RC.front, bad, armSrc };
};
{
  const drive = drive6;
  const HIT = { x: 250, y: 320, hits: true, hit: 'BUTTON.b' }, COVERED = { x: 250, y: 320, hits: false, hit: 'DIV.global-toast' };
  const A = await drive({ measures: [HIT], unders: [{ hits: true }], opts: { scroll: 'nearest', aimLeft: 40 } });
  ok(A.r === true && gateOf(A.asked[0].includes("block: 'nearest'")) && gateOf(A.asked[0].includes('Math.min(q.width / 2, 40)')) && verdictOf(A.sent.includes('mousePressed@140,320')), 'the options REACH the page (the measure asks the nearest scroll and the aim) and the press lands at the aim from the still look\'s rect (140, 320), never its centre', A);
  const B = await drive({ measures: [HIT], unders: [{ hits: true }] });
  ok(B.r === true && gateOf(B.asked[0].includes("block: 'center'")) && verdictOf(B.sent.includes('mousePressed@250,320')), 'no option: the door as it was — the centred scroll, the press at the still look\'s centre', B);
  const C = await drive({ measures: [COVERED, HIT, HIT], unders: [{ hits: false, hit: 'DIV.global-toast' }, { hits: true }], uncover: true });
  ok(C.r === true && C.uncovers === 1 && C.asked.length === 3, 'uncover runs ONCE a call: covered at the measure it clears and measures again; covered again at the press it re-aims without a second clear', C);
  const D = await drive({ measures: [HIT, HIT], unders: [{ hits: false, hit: 'DIV.global-toast' }, { hits: true }], uncover: true });
  ok(D.r === true && D.uncovers === 1 && gateOf(D.reaimed) && D.reaimed.uncovered === true && verdictOf(D.logs.some((l) => /covered at press time by DIV\.global-toast — the suite's uncover ran once/.test(l))), 'covered at the press: the suite\'s uncover runs, the point is measured again, and the log says a cover was cleared (never «it moved»)', D);
  const E = await drive({ measures: [COVERED], unders: [{ hits: true }] });
  ok(E.r === false && E.sent.length === 0, 'covered and no uncover hook: no press, as before', E);
}

// ⑦ THE PRESS ARM, ASKED OF THE PRODUCT (the 2.369.413 checkpoint's hosted red: test-exit-access-ui's Allow pressed ~80 ms after
// the door was called counted for nothing; the ask expired 60 s later as fifteen red legs). The door reads EVERY arm mark the product
// keeps on the target and its ancestors and presses only once the latest is ARM_MS old — ARM_MS read from src/lib/press-arm.js here too
console.log('⑦ the press arm — the product\'s own marks, its ARM_MS, never a press inside it');
{
  const { ARM_MS } = await import(new URL('../src/lib/press-arm.js', import.meta.url).href);
  ok(gateOf(Number.isFinite(ARM_MS)) && ARM_MS > 0, `the product's ARM_MS is read from its module (${ARM_MS} ms)`);
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
  ok(gateOf(mk(pb, 'data-armed-at')) && mk(pb, 'data-armed-at').readyIn === 400 && JSON.stringify(armStep(pb, ARM_MS)) === JSON.stringify({ wait: 400 }), 'an Outbox card\'s data-armed-at (its ready time, the Date clock): the door waits until it passed', pb);
  ok(probe(el()).marks.length === 0, 'a plain control carries no mark: no wait');
  // the door itself on a scripted page and a scripted clock (no real waiting)
  const HIT = { x: 250, y: 320, hits: true, hit: 'BUTTON.b' };
  const clock = () => { const waits = []; return { waits, sleep: async (ms) => { waits.push(ms); } }; };
  const own = (age, since = 1000, extra = {}) => ({ mark: '_armSince', self: true, since, age, moved: false, ...extra });
  const c1 = clock(), A = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c1.sleep, arms: [{ marks: [own(ARM_MS - 300)] }, { marks: [own(ARM_MS + 30)] }, { marks: [own(ARM_MS + 60)] }] });
  ok(A.r === true && gateOf(A.armed) && A.armed.waitedMs === 330 && verdictOf(A.sent.includes('mousePressed@250,320')), `an armed control ${ARM_MS - 300} ms old: the door WAITS out the arm (${A.armed && A.armed.waitedMs} ms on the clock), proves the point again, then presses`, A);
  const c2 = clock(), B = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c2.sleep, arms: [{ marks: [own(99999, 1000, { moved: true })] }] });
  ok(B.r === false && !B.sent.includes('mousePressed@250,320') && verdictOf(/ARMED \(_armSince \(moved\)\).*STALE stamp.*no pass of the product read it again.*not pressed/.test(B.miss && B.miss.why)), 'a STALE stamp (it moved; no pass of the product read it again): NOT pressed — it fails BY NAME at the press, in words that point at the stamp, never at timing', B.miss);
  const c3 = clock(), C = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c3.sleep, arms: [{ marks: [own(ARM_MS + 100)] }], stamps: { stampDown: 1000, stampAfter: 1900 } });
  ok(C.r === false && gateOf(C.sent.includes('mousePressed@250,320')) && verdictOf(/RE-ARMED it at the press/.test(C.miss && C.miss.why)), 'a press at which the product re-stamped the target\'s OWN arm — read at the INSTANT of the press and right after its click: said by name, the press counted for nothing', C.miss);
  const c3b = clock(), C2 = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c3b.sleep, arms: [{ marks: [own(ARM_MS + 100)] }, { marks: [own(1, 1900)] }], stamps: { stampDown: 1000, stampAfter: 1000 } });
  ok(C2.r === true, 'a stamp a LATER row pass made (the element moved after the press — the probe a round trip later reads it younger) is NO re-arm: the press counted, the door says so', C2.miss);
  const c4 = clock(), D = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c4.sleep });
  ok(D.r === true && D.armed === null && c4.waits.join() === '40', 'an unarmed control: no arm wait at all — the scripted clock holds only the still look\'s one 40 ms pause', { armed: D.armed, waits: c4.waits });
  const c5 = clock(), E = await drive6({ measures: [HIT], unders: [{ hits: true }, { hits: false, hit: 'DIV.global-toast' }], sleep: c5.sleep, arms: [{ marks: [own(ARM_MS - 300)] }, { marks: [own(ARM_MS + 30)] }] });
  ok(E.r === false && !E.sent.includes('mousePressed@250,320') && verdictOf(/not under the pointer after the arm/.test(E.miss && E.miss.why)), 'the point no longer the target after the arm\'s wait: NOT pressed, said by name', E.miss);
  const c6 = clock(), F = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c6.sleep, hidden: true });
  const c7 = clock(), G = await drive6({ measures: [HIT], unders: [{ hits: true }], sleep: c7.sleep, hidden: false });
  ok(F.r === true && F.sent[0] === 'front' && G.r === true && !G.sent.includes('front'), 'the DOOR brings a HIDDEN page to the front before it measures (a background tab advances no animation); a visible page is left as the suite put it', { hidden: F.sent, visible: G.sent });
}

// ⑧ THE DOOR SAYS WHAT IT SAW (lane bl-tests-e, the .413 facts unit — the hosted run's «a real click on 显示输出»: «covered at press
// time by DIV.», «measured again at (0, 0)», and ten red legs nobody could place). A cover is named by its tag, id, classes and box,
// never an empty class; a ZERO box is NOT LAID OUT — with the ancestor that hides it and the window it sits in, on show or why not —
// never «covered», never aimed at its (0, 0); the door says when it brings a page to the front. The page half runs here over a
// stand-in DOM in the PRODUCT'S shape (public/index.html: #main-wrapper holds #workspace, the taskbar and the For-you popup; a tab
// group's guest content lives in its host's element — src/lib/tab-group.js), the door over a scripted page (drive6).
console.log('⑧ the door says what it saw — a cover by its element, a zero box NOT LAID OUT, the page brought to the front said');
{
  const world = () => {
    const own = new Map();
    const mk = (tag, { id = '', cls = '', rect = [0, 0, 0, 0], parent = null, style = {}, extra = {} } = {}) => {
      const n = { nodeType: 1, tagName: tag.toUpperCase(), id, className: cls, parentElement: parent, isConnected: true, ...extra,
        getBoundingClientRect: () => ({ left: rect[0], top: rect[1], width: rect[2], height: rect[3], right: rect[0] + rect[2], bottom: rect[1] + rect[3] }),
        contains: (o) => { for (let k = o; k; k = k.parentElement) if (k === n) return true; return false; },
        closest: (sel) => { for (let k = n; k; k = k.parentElement) if ((' ' + k.className + ' ').includes(' ' + sel.replace(/^\./, '') + ' ')) return k; return null; },
        classList: { contains: (c) => (' ' + cls + ' ').includes(' ' + c + ' ') }, scrollIntoView: () => { } };
      own.set(n, style); return n;
    };
    // computed style: display / content-visibility are the element's own; visibility INHERITS (as a browser's does)
    const getComputedStyle = (n) => { const o = own.get(n) || {}; let v = o.visibility; for (let k = n.parentElement; !v && k; k = k.parentElement) v = (own.get(k) || {}).visibility; return { display: o.display || 'block', contentVisibility: o.contentVisibility || 'visible', visibility: v || 'visible' }; };
    const body = mk('body', { rect: [0, 0, 1280, 820] }), main = mk('div', { id: 'main-wrapper', rect: [0, 0, 1280, 820], parent: body });
    const taskbar = mk('footer', { id: 'taskbar', rect: [0, 0, 1280, 40], parent: main }), corner = mk('div', { rect: [0, 0, 200, 40], parent: taskbar });
    const ws = mk('main', { id: 'workspace', rect: [0, 40, 1280, 780], parent: main });
    // win-1 ON SHOW (the For-you popup over its middle); win-2 MINIMIZED (display: none — the hosted shape); win-3 on another desktop;
    // win-5 + win-6 a TAB GROUP: win-6's content lives in win-5's element (its own element display: none), win-5's own content a hidden tab
    const w1 = mk('div', { cls: 'window window-active', rect: [100, 60, 700, 500], parent: ws }), c1 = mk('div', { cls: 'window-content', rect: [100, 90, 700, 470], parent: w1 });
    const b1 = mk('summary', { rect: [120, 300, 80, 20], parent: c1 });
    const det1 = mk('details', { cls: 'chat-exit-out-full', rect: [120, 340, 300, 20], parent: c1, extra: { open: false } }), sum1 = mk('summary', { rect: [120, 340, 300, 20], parent: det1 }), all1 = mk('pre', { cls: 'chat-exit-out-all', parent: det1 });
    const hold = mk('div', { cls: 'hold', rect: [120, 400, 300, 40], parent: c1, style: { visibility: 'hidden' } }), vis = mk('button', { cls: 'v', rect: [120, 400, 80, 20], parent: hold, style: { visibility: 'visible' } });
    const w2 = mk('div', { cls: 'window', parent: ws, style: { display: 'none' } }), c2 = mk('div', { cls: 'window-content', parent: w2 });
    const card2 = mk('div', { cls: 'chat-vs-notice', parent: c2 }), det2 = mk('details', { cls: 'chat-exit-out-full', parent: card2, extra: { open: false } }), b2 = mk('summary', { parent: det2 });
    const w3 = mk('div', { cls: 'window', rect: [200, 80, 600, 400], parent: ws, style: { visibility: 'hidden', contentVisibility: 'hidden' } }), c3 = mk('div', { cls: 'window-content', rect: [200, 110, 600, 370], parent: w3 });
    const b3 = mk('summary', { rect: [220, 300, 80, 20], parent: c3 });
    const w5 = mk('div', { cls: 'window', rect: [850, 60, 400, 300], parent: ws }), c5 = mk('div', { cls: 'window-content tab-hidden', parent: w5, style: { display: 'none' } });
    const w6 = mk('div', { cls: 'window', parent: ws, style: { display: 'none' } }), c6 = mk('div', { cls: 'window-content', rect: [850, 90, 400, 270], parent: w5 }), b6 = mk('button', { cls: 'go', rect: [870, 200, 60, 20], parent: c6 });
    const pop = mk('div', { id: 'user-todos-popup', cls: 'ut-popup', rect: [100, 280, 420, 300], parent: main }), item = mk('div', { cls: 'ut-item', rect: [110, 290, 400, 60], parent: pop });
    const toasts = mk('div', { id: 'global-toasts', rect: [900, 700, 360, 60], parent: body }), toast = mk('div', { cls: 'global-toast', rect: [900, 700, 360, 60], parent: toasts });
    const chain = { tabs: ['win-5', 'win-6'] };
    const wins = new Map([['win-1', { id: 'win-1', type: 'chat', title: 'proj1', element: w1, content: c1 }], ['win-2', { id: 'win-2', type: 'chat', title: 'proj2', element: w2, content: c2, isMinimized: true }], ['win-3', { id: 'win-3', type: 'chat', title: 'proj3', element: w3, content: c3, _hiddenByDesktop: true }],
      ['win-5', { id: 'win-5', type: 'chat', title: 'proj5', element: w5, content: c5, _tabChain: chain }], ['win-6', { id: 'win-6', type: 'chat', title: 'proj6', element: w6, content: c6, _tabChain: chain }]]);
    const app = { wm: { windows: wins }, sessions: new Map([['win-1', { sessionId: 'sid-1' }], ['win-2', { sessionId: 'sid-2' }], ['win-3', { sessionId: 'sid-3' }], ['win-6', { sessionId: 'sid-6' }]]), desktopManager: { activeDesktopId: 'd-1' } };
    const run = (src, { target = null, under = null, stack = [], open = [] } = {}) => new vm.Script(src).runInNewContext({ app, getComputedStyle, innerWidth: 1280, innerHeight: 820, window: {}, THE_EL: target,
      document: { body, visibilityState: 'visible', hasFocus: () => true, querySelector: () => null, querySelectorAll: () => open, elementFromPoint: () => under, elementsFromPoint: (x, y) => (typeof stack === 'function' ? stack(x, y) : stack) } });
    return { run, mk, main, corner, ws, b1, b2, b3, b6, c1, c6, all1, vis, item, pop, toast };
  };
  const W8 = world();
  const M = (target, under, o = {}) => W8.run(realClickMeasureSource('(THE_EL)', o), { target, under });
  // the hosted shape: the card's summary in a MINIMIZED window — a zero box; the page's corner under its (0, 0)
  const zero = M(W8.b2, W8.corner, { scroll: 'nearest', aimLeft: 40 });
  const zw = lostWords(zero);
  ok(gateOf(zero) && zero.hits === false && zero.laid === false && zero.size === '0×0' && zero.hiddenBy === 'div.window [0,0 0×0] (display: none)' && gateOf(zero.win) && zero.win.id === 'win-2' && zero.win.conv === 'sid-2' && zero.win.onShow === false
    && gateOf(/^NOT LAID OUT \(0×0\) — hidden by div\.window \[0,0 0×0\] \(display: none\) — in window win-2 \(chat, «proj2», conversation sid-2 \[0,0 0×0\]\), on show: no — minimized, hidden by div\.window/.test(zw)) && !/covered/.test(zw),
    'a ZERO box is NOT LAID OUT: the ancestor that hides it (display: none) and the window it sits in — its conversation, on show: no and why — never «covered»', { zero, zw });
  ok(zero.hit === 'div [0,0 200×40] (no id, no class — inside footer#taskbar)', 'what stood under its point is named by its box and its nearest named ancestor — never an empty class («DIV.»)', zero.hit);
  // a real cover: the For-you popup's row over a laid-out target in a window on show
  const cw = lostWords(M(W8.b1, W8.item));
  ok(cw === 'covered by div.ut-item [110,290 400×60] — in window win-1 (chat, «proj1», conversation sid-1 [100,90 700×470]), on show: yes',
    'a COVER is named by its tag, classes and box, with the target\'s window on show', cw);
  // hidden, not covered: a window on another desktop (visibility: hidden starts AT the window; its content inherits it)
  const hid = M(W8.b3, W8.ws), hw = lostWords(hid);
  ok(hid.laid === true && gateOf(/^HIDDEN by div\.window \[200,80 600×400\] \(content-visibility: hidden, visibility: hidden\) — in window win-3 \(chat, «proj3», conversation sid-3 \[200,110 600×370\]\), on show: no — on another desktop, hidden by div\.window/.test(hw)) && verdictOf(/under its point: main#workspace \[0,40 1280×780\]$/.test(hw)),
    'a target with a box under a hidden window is HIDDEN by the element where the hiding STARTS (never its inheriting content, never «covered»)', hw);
  // the read's must: a TAB of a group is judged by the group's frame, as the product's own hider is (its own element is display: none)
  const tabw = lostWords(M(W8.b6, W8.item));
  ok(tabw === 'covered by div.ut-item [110,290 400×60] — in window win-6 (chat, «proj6», conversation sid-6, a tab of win-5 [850,90 400×270]), on show: yes',
    'a window shown as a TAB (its content in its host\'s element, its own element display: none) is ON SHOW — never «hidden by its own element»', tabw);
  // the read's should: a closed <details> hides all but its summary — named, never «an empty box»
  const fold = lostWords(M(W8.all1, W8.corner));
  ok(verdictOf(/^NOT LAID OUT \(0×0\) — hidden by details\.chat-exit-out-full \[120,340 300×20\] \(a closed details: only its summary is drawn\) — in window win-1/.test(fold)), 'a target inside a CLOSED details is hidden by that details, by name', fold);
  ok(verdictOf(/^covered by div \[0,0 200×40\]/.test(lostWords(M(W8.vis, W8.corner)))), 'a visible descendant of a visibility: hidden ancestor is drawn: never «hidden by» that ancestor', lostWords(M(W8.vis, W8.corner)));
  ok(lostWords({ gone: 'it left the document' }) === 'it left the page (it left the document)' && lostWords(null) === 'nothing measured (no such element on the page)'
    && verdictOf(/^NOT LAID OUT \(0×0\) — the page could not say what hides it \(boom\)/.test(lostWords({ laid: false, size: '0×0', sayErr: 'boom' }))), 'a target that left the page, none at all, or a zero box the page could not explain — each says so (a zero box stays NOT LAID OUT)');
  // the scene: each window's conversation, on show or why not, what stands over it; what is open over the page
  const sc = W8.run(pageSceneSource({ names: { 'sid-1': 'conversation 1' } }), { stack: (x) => (x < 800 ? [W8.item, W8.pop, W8.c1] : [W8.c6]), open: [W8.pop, W8.toast] });
  const sw = sceneWords(sc);
  ok(sw.length === 7 && sw[0] === 'page: visible, focused · 1280×820 · desktop d-1 · 5 window(s)'
    && sw[1] === 'window win-1 chat «proj1» conversation sid-1 (conversation 1) — ON SHOW [100,90 700×470], active · over its middle: div#user-todos-popup.ut-popup [100,280 420×300]'
    && gateOf(/^window win-2 chat «proj2» conversation sid-2 — NOT on show: minimized, hidden by div\.window \[0,0 0×0\] \(display: none\), not laid out$/.test(sw[2]))
    && gateOf(/^window win-3 chat «proj3» conversation sid-3 — NOT on show: on another desktop, hidden by div\.window/.test(sw[3]))
    && sw[4] === 'window win-5 chat «proj5» — NOT on show: a hidden tab, hidden by div.window-content.tab-hidden [0,0 0×0] (display: none), not laid out'
    && sw[5] === 'window win-6 chat «proj6» conversation sid-6 (a tab of win-5) — ON SHOW [850,90 400×270] · nothing over its middle'
    && sw[6] === 'open over the page: div#user-todos-popup.ut-popup [100,280 420×300] · div.global-toast [900,700 360×60]',
    'the PAGE AS IT STANDS: which conversation each chat window shows (a tab by its group), which are on show (or every reason not), what stands over a shown one — the popup itself, never #main-wrapper that holds it — and what is open over the page', sw);
  // the words are BOUNDED (the coordinator's 04:30Z follow-up — any suite may print a scene): a title, each named element, the windows, the open list
  const B = SCENE_BOUNDS, longT = 'T'.repeat(300), el = (i) => `div.x${i} [0,0 10×10]`;
  const big = { page: 'visible, focused', size: '1280×820', desktop: 'd-1', open: Array.from({ length: 20 }, (_, i) => el(i)),
    windows: Array.from({ length: 15 }, (_, i) => ({ id: 'w' + i, type: 'chat', title: longT, conv: null, onShow: true, box: '[0,0 1×1]', active: false, why: [], over: Array.from({ length: 6 }, (_, j) => el(j)) })) };
  const bw = sceneWords(big), w0 = bw[1];
  ok(bw.length === 1 + B.windows + 1 + 1 && gateOf(w0.includes('«' + 'T'.repeat(B.title - 1) + '…»')) && !w0.includes('T'.repeat(B.title)) && gateOf(w0.endsWith(`${el(3)} · 2 more`))
    && bw[1 + B.windows] === `${15 - B.windows} more window(s)` && bw[bw.length - 1] === `open over the page: ${Array.from({ length: B.open }, (_, i) => el(i)).join(' · ')} · ${20 - B.open} more`
    && verdictOf(/«T{79}…»/.test(lostWords({ laid: false, size: '0×0', hiddenBy: null, win: { id: 'w', type: 'chat', title: longT, onShow: true, why: [] } }))),
    `a scene's words are BOUNDED: a title at ${B.title} characters (the cut said «…»), ${B.windows} windows, ${B.over} elements over one, ${B.open} open things — the rest counted, never printed (the door's own sentence too)`, bw.map((l) => l.length));
  // …counted from the PAGE's own counts (the follow-up read's should: the page lists at most 40 open things and 12 over a window, and
  // says how many there were), each named element cut at its own bound, no whole-line cut that could eat a «more»
  const counted = sceneWords({ page: 'visible', size: '1280×820', desktop: null, open: ['x'.repeat(300), ...Array.from({ length: 39 }, (_, i) => el(i))], openCount: 100,
    windows: [{ id: 'w', type: 'chat', title: 't', onShow: true, box: '[0,0 1×1]', why: [], over: Array.from({ length: 12 }, (_, j) => el(j)), overCount: 30 }] });
  const openLine = counted[counted.length - 1];
  ok(gateOf(openLine.startsWith('open over the page: ' + 'x'.repeat(B.item - 1) + '… · ')) && gateOf(openLine.endsWith(' · 94 more')) && verdictOf(counted[1].endsWith(`${el(3)} · 26 more`)),
    `«N more» is the page's own count (100 open, 40 listed ⇒ «94 more»; 30 over a window, 12 listed ⇒ «26 more»); each element cut at ${B.item} characters`, counted);
  // the read's should: the PAGE half counts what it stops listing (15 distinct elements over win-1, 12 listed; 45 open things, 40 listed)
  const many = (n, tag) => Array.from({ length: n }, (_, i) => W8.mk('div', { cls: tag + i, rect: [10 * i, 0, 10, 10], parent: W8.main }));
  const fifteen = many(15, 'f'), fortyFive = many(45, 'o');
  const sc2 = W8.run(pageSceneSource(), { stack: (x) => (x < 800 ? [...fifteen, W8.c1] : [W8.c6]), open: fortyFive }), sw2 = sceneWords(sc2);
  ok(sc2.windows[0].overCount === 15 && sc2.windows[0].over.length === 12 && sc2.openCount === 45 && sc2.open.length === 40 && gateOf(sw2[1].endsWith('· 11 more')) && verdictOf(sw2[sw2.length - 1].endsWith('· 39 more')),
    'the PAGE half counts what it stops listing — 15 over a window (12 listed), 45 open things (40 listed) — and the words say «11 more», «39 more»', { over: [sc2.windows[0].overCount, sc2.windows[0].over.length], open: [sc2.openCount, sc2.open.length] });
  ok(sceneWords({ error: 'x' })[0] === '(the page could not be read: x)' && W8.run(pageSceneSource(), { stack: [], open: [] }).windows.length === 5, 'a page that cannot be read says so; the scene reads the window manager\'s windows');
}
{
  // the door itself, scripted: a zero box at the press, at the first measure, at the still look; the hidden page said
  const NLO = { hits: false, hit: 'div [0,0 200×40] (no id, no class — inside footer#taskbar)', laid: false, size: '0×0', hiddenBy: 'div.window [0,0 0×0] (display: none)', win: { id: 'win-2', type: 'chat', title: 'proj2', conv: 'sid-2', onShow: false, why: ['minimized'], box: '[0,0 0×0]' } };
  const HIT = { x: 250, y: 320, hits: true, hit: 'button.b [100,300 300×40]' }, HIT2 = { x: 260, y: 330, hits: true, hit: 'button.b [110,310 300×40]' };
  const TOAST = { x: 260, y: 330, hits: false, hit: 'div.global-toast [200,310 300×60]', laid: true, hiddenBy: null, win: null };
  const A = await drive6({ measures: [HIT, { x: 0, y: 0, ...NLO }], unders: [NLO], uncover: true });
  ok(A.r === false && A.uncovers === 0 && !A.sent.some((x) => x.startsWith('mousePressed')) && gateOf(/^NOT LAID OUT \(0×0\) — hidden by div\.window .* — seen at the press and once more$/.test(A.miss && A.miss.why))
    && A.logs.length === 1 && gateOf(/: NOT LAID OUT \(0×0\) .* — seen at the press and once more — not pressed$/.test(A.logs[0])) && !A.logs.some((l) => /covered/.test(l)),
    'NOT LAID OUT at the press: no uncover, looked at once more, failed BY NAME in one line — never «covered»', A);
  const B = await drive6({ measures: [HIT, HIT2], unders: [NLO, { hits: true }], uncover: true });
  ok(B.r === true && B.uncovers === 0 && gateOf(B.reaimed) && B.reaimed.notLaidOut === true && gateOf(B.sent.includes('mousePressed@260,330')) && verdictOf(/NOT LAID OUT \(0×0\) .* — seen at the press; laid out again at \(260, 330\) — re-aimed once/.test(B.logs.join('\n'))),
    'a zero box that lays out again on the one more look: pressed where it now is, the line says it (the door\'s one re-aim, as for a move)', B);
  const B2 = await drive6({ measures: [HIT, TOAST, HIT2], unders: [NLO, { hits: true }], uncover: true });
  ok(B2.r === true && B2.uncovers === 1 && gateOf(B2.reaimed) && B2.reaimed.uncovered === true && gateOf(B2.sent.includes('mousePressed@260,330')) && verdictOf(/seen at the press \(on that look covered by div\.global-toast \[200,310 300×60\] — in no window — the suite's uncover ran once\); laid out again at \(260, 330\)/.test(B2.logs.join('\n'))),
    'the read\'s must: laid out on that look but COVERED there — the suite\'s uncover runs once (as the old door\'s did) and the press is made; the cover is said', B2.logs);
  const B3 = await drive6({ measures: [HIT, TOAST], unders: [NLO] });
  ok(B3.r === false && gateOf(/— seen at the press; on one more look \(260, 330\) — still not under its point: covered by div\.global-toast \[200,310 300×60\]/.test(B3.miss && B3.miss.why)) && !/once more/.test(B3.miss && B3.miss.why) && gateOf(B3.miss.again) && B3.miss.again.hit === TOAST.hit,
    'laid out on that look and covered, no uncover hook: not pressed — the second look\'s cover NAMED (never «not laid out … once more»), its facts kept (`lastMiss.again`)', B3.miss);
  const C = await drive6({ measures: [{ x: 0, y: 0, ...NLO }], unders: [{ hits: true }], uncover: true });
  ok(C.r === false && C.uncovers === 0 && C.sent.length === 0 && C.asked.length === 2 && verdictOf(/^NOT LAID OUT \(0×0\)/.test(C.miss && C.miss.why)), 'NOT LAID OUT at the first measure: looked at once more (as the uncover\'s second measure gave it before), no uncover, no press — `lastMiss.why` names it', { miss: C.miss, measures: C.asked.length });
  const C2 = await drive6({ measures: [{ x: 0, y: 0, ...NLO }, HIT], unders: [{ hits: true }], uncover: true });
  ok(C2.r === true && C2.uncovers === 0 && verdictOf(C2.sent.includes('mousePressed@250,320')), 'a zero box at the first measure that lays out on the second look is pressed (a single-call suite keeps the recovery it had)', C2.sent);
  const D = await drive6({ measures: [HIT, { x: 0, y: 0, ...NLO }], unders: [NLO], look: { found: true, rect: [0, 0, 0, 0], x: 0, y: 0, hits: false, under: 'div', disabled: false, movers: [] } });
  ok(D.r === false && gateOf(D.sent.includes('mouseMoved@250,320')) && !D.sent.some((x) => /@0,0$/.test(x)) && verdictOf(/NOT LAID OUT/.test(D.miss && D.miss.why)),
    'a still look with NO box is never the aim (its centre is the page\'s corner, (0, 0)): the pointer stays at the measured point and the press loop names it', D.sent);
  const E = await drive6({ measures: [HIT], unders: [{ hits: true }], hidden: true }), F = await drive6({ measures: [HIT], unders: [{ hits: true }] });
  ok(E.r === true && E.front === true && gateOf(E.logs.some((l) => /the page was HIDDEN \(another page in front\) — the door brought it to the front \(Page\.bringToFront\)/.test(l))) && F.front === false && !F.logs.some((l) => /front/.test(l)),
    'the door SAYS when it changes which page is in front (`realClick.front`, a line); a visible page: no line', { hidden: E.logs, visible: F.logs });
  const G = await drive6({ measures: [HIT, HIT2], unders: [{ hits: false, hit: 'div.ut-item [110,290 400×60]', laid: true, hiddenBy: null, win: { id: 'win-1', onShow: true, why: [] } }, { hits: true }], uncover: true });
  ok(G.r === true && G.uncovers === 1 && verdictOf(/covered at press time by div\.ut-item \[110,290 400×60\] — the suite's uncover ran once; measured again: \(260, 330\)/.test(G.logs.join('\n'))), 'a real cover at the press: named by its element and box, the uncover runs once, the point measured again', G.logs);
  const H = await drive6({ measures: [HIT, HIT2], unders: [{ hits: false, hit: 'main#workspace [0,40 1280×780]', laid: true, hiddenBy: 'div.window [200,80 600×400] (visibility: hidden)', win: null }, { hits: true }] });
  ok(H.r === true && gateOf(H.logs.some((l) => /HIDDEN at press time — HIDDEN by div\.window .* the pointer was over main#workspace/.test(l))) && !H.logs.some((l) => /it moved/.test(l)), 'the read\'s should: a target HIDDEN with a box at the press and no uncover hook is said HIDDEN — never «it moved»', H.logs);
  ok(!A.armSrc.length && B.armSrc.length === 1 && !B.armSrc[0].includes('getBoundingClientRect') && verdictOf(B.armSrc[0].includes('const desc = (n) => (n && n.tagName ? named(n) : null)')), 'the press instant\'s listeners name what they saw WITHOUT reading a box (no layout flush before the product\'s handlers)', B.armSrc.map((x) => x.length));
  const all = [A, B, B2, B3, C, C2, D, E, F, G, H].flatMap((x) => x.bad);
  ok(all.length === 0 && A.asked.length >= 1, 'every page source the door sent COMPILES (vm) — measure, under, still look, arm probe, landing', all);
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass}) — ${Date.now() - t0} ms`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
