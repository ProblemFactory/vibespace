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
// Run: node scripts/test-still-press.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STILL_MOVERS, stillVerdict, landingVerdict, stillLookSource, stillPresser } from './scratch.mjs';
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
  'test-agent-window-chrome': 1, 'test-agy-status-bar-chrome': 1, 'test-agy-subagent-chrome': 2, 'test-app-register-ui': 1,
  'test-apps-ui': 1, 'test-apps-witness-ui': 1, 'test-artifacts-chrome': 2, 'test-automation-keys-chrome': 2,
  'test-billing-badge-live': 1, 'test-boot-reload-ready': 2, 'test-browser-human': 2, 'test-browser-human-ui': 1,
  'test-browser-identity': 1, 'test-browser-live': 1, 'test-browser-live-fit': 5, 'test-browser-live-input': 4,
  'test-browser-live-ui': 2, 'test-browser-multiview': 2, 'test-browser-profiles-ui': 1, 'test-browser-propose-chrome': 1,
  'test-browser-replay-ui': 2, 'test-browser-resume-ui': 1, 'test-browser-takeover-queue-ui': 1, 'test-browser-who-ui': 1,
  'test-browser-windows': 3, 'test-browser-x-picture': 5, 'test-cache-warmth-chrome': 3, 'test-channel-edit-autosize': 2,
  'test-channel-jump': 1, 'test-channel-names-ui': 1, 'test-channel-outbox-window': 1, 'test-channel-threads-ui': 3,
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
  'test-inbox-reply-ui': 5, 'test-inbox-window-ui': 3, 'test-layout-placeholder-ui': 2, 'test-login-expiry': 1,
  'test-machine-app-chrome': 2, 'test-mobile-back-chrome': 2, 'test-mobile-gaps': 4, 'test-mobile-select': 4,
  'test-new-session-dialog': 1, 'test-office-desktop': 2, 'test-page-link-ui': 1, 'test-parked-ask-ui': 1,
  'test-path-field-chrome': 1, 'test-peer-card-fold-ui': 2, 'test-phone-composer-chrome': 1, 'test-phone-desktop-sync': 5,
  'test-phone-dock-chrome': 3, 'test-phone-refusal-wrap-chrome': 2, 'test-phone-resume-keeps-layout-ui': 4,
  'test-phone-titlebar-ui': 8, 'test-popover-frame-close': 2, 'test-queue-steer': 7, 'test-record-clear-client': 1,
  'test-record-clear-ui': 1, 'test-resume-account-chrome': 2, 'test-session-title-ui': 2, 'test-sidebar-scroll': 1,
  'test-split-close-resurrect': 1, 'test-split-restore-hidden': 1, 'test-split-ux': 16, 'test-stage-dragout-ui': 7,
  'test-tab-close-confirm-ui': 1, 'test-task-detail-chrome': 2, 'test-taskbar-group-ui': 5, 'test-terminal-zoom-select': 2,
  'test-title-chips-ui': 1, 'test-toast-pass-through': 2, 'test-toolbar-resize': 1, 'test-tray-voice-phone': 2,
  'test-ui-scale': 2, 'test-update-dialog': 2, 'test-vault-paste-chrome': 4, 'test-vault-use-grants-chrome': 1,
  'test-voice-chrome': 3, 'test-voice-follow-chrome': 2, 'test-voice-teach-chrome': 2, 'test-wake-approve-card-chrome': 1,
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

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass}) — ${Date.now() - t0} ms`);
process.exit(fail ? 1 : 0);
