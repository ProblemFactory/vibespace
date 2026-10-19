#!/usr/bin/env node
// lane machine-app-crop (owner 2026-10-11 "都做吧" — route ② of B-bb0b): ONE app of a paired Windows / macOS machine as its
// own window. FAST, in-process:
//   §1 the Windows look's dump (EnumWindows rows + DWM extended frame bounds + the process table) → the rectangle: DWM wins
//      over GetWindowRect, the virtual screen's origin (a left monitor at x < 0), a look that is not DPI-aware (logical
//      metrics × dpi/96)        §2 a Mac's look = its SCREEN HELPER's facts (lane mac-window-list-helper) → the same dump: the
//      MAIN display's points, the owner's name when the title is hidden, the bundle id; `ps -o lstart=` → the starts
//   §3 which window is the launched app's: its lineage (start "" blender: cmd.exe → blender.exe), its start time (macOS
//      open -a: launchd's child), a window new since the first look, the largest of equals; none ⇒ null
//   §4 the answers: found / gone / none; the watcher's sameAnswer        §5 the crop + the pointer: pane → machine at the
//      fit scale (Retina points → pixels), outside ⇒ dropped, a drag held at the edge (+ RED controls)
//   §6 the device runner over a fake spawn: finds on the 2nd look, follows two moves (≥ 100 ms apart, the last never
//      dropped), gone ends it; none at the wait; the pin's scripts (topmost / not; a Mac activates, never "unpins")
//   §6b a Mac's look over a FAKE helper (`mac`): ONE facts run at a time, nothing spawned under node; found by its owner's
//      start; followed every 500 ms; off screen (app alive, no Accessibility) vs gone; refused BY NAME (vibespace-screen);
//      the pin = ps (the app runs) + LaunchServices `open -b <bundle>` (+ RED controls)
//   §7 the capability gate: an old agent is never asked (host_needs_daemon, no request) + RED control (a gate-less copy sends it)
//   §8 the hub: one pinned window per machine, closing / an idle page ends the watch (the device undoes the pin), a pin the
//      hub could not undo is REPORTED; the window type is not persisted        §9 the run's launch report (the plain run
//      stays byte for byte) + "the line names a GUI app"
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MW = require(path.join(repo, 'src/machine-window.js'));
const MD = require(path.join(repo, 'src/machine-desktop-model.js'));
const MUT = mutantCopies('mwin', repo);
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 700) : '')); } };
const J = (o) => JSON.stringify(o);
const cut = (src, from, to) => { if (!src.includes(from)) throw new Error('anchor moved: ' + from); return src.replace(from, to); };
const mwSrc = fs.readFileSync(path.join(repo, 'src/machine-window.js'), 'utf8');

// ── fixtures: what the looks print ────────────────────────────────────────────────────────────────────────────────
const WIN_SCREEN = { t: 'screen', x: -1920, y: 0, w: 3840, h: 1080, dpi: 144, aware: 1 };
const winRow = (hwnd, pid, title, wr, fb, extra = {}) => J({ t: 'win', hwnd, pid, title, vis: 1, min: 0, wr, fb, ...extra });
const PM = winRow(65802, 7420, 'Program Manager', [-1920, 0, 1920, 1080], [-1920, 0, 1920, 1080]);
const EXPLORER = winRow(131200, 7420, 'Downloads', [-1800, 100, -1000, 700], [-1793, 100, -1007, 693]);
const BLENDER = winRow(131330, 9012, 'Blender', [93, 40, 1707, 1047], [100, 40, 1700, 1040]);
const SPLASH = winRow(131331, 9012, '', [500, 400, 530, 420], null);
const PROCS = ['p 4 0 0', 'p 7420 700 1791600000000', 'p 9000 7420 1791700000000', 'p 9012 9000 1791700000500'];
const winLook = (rows, procs = PROCS) => [J(WIN_SCREEN), ...rows, ...procs, 'end 1791700001000'].join('\r\n') + '\r\n';

console.log('§1 the Windows look → the rectangle (DWM bounds, the virtual screen, DPI)');
{
  const [d] = MW.parseDumps(winLook([PM, EXPLORER, BLENDER, SPLASH, '{"t":"win", broken', 'garbage line']));
  ok(d && d.wins.length === 4 && d.procs.get(9012).ppid === 9000 && d.at === 1791700001000, 'one dump: 4 rows (a malformed line skipped), the process table, the look\'s clock', d && { wins: d.wins.length, at: d.at });
  const scr = MW.screenOf('win32', d.screen);
  ok(scr.x === -1920 && scr.w === 3840 && scr.scale === 1.5, 'the virtual screen (two monitors, the left one at x = -1920) at 150 % (dpi 144)', scr);
  const r = MW.rectOf('win32', JSON.parse(BLENDER), scr);
  ok(J(r) === J({ x: 2020, y: 40, w: 1600, h: 1000 }), 'the DWM extended frame bounds win over GetWindowRect (no invisible 7 px border), relative to the virtual screen\'s origin', r);
  ok(J(MW.rectOf('win32', JSON.parse(SPLASH), scr)) === J({ x: 2420, y: 400, w: 30, h: 20 }), 'no DWM bounds ⇒ GetWindowRect (already physical: the look is DPI-aware)');
  const logical = MW.screenOf('win32', { ...WIN_SCREEN, x: -1280, w: 2560, h: 720, aware: 0 });
  ok(logical.x === -1920 && logical.w === 3840 && logical.h === 1080 && !logical.aware, 'a look that could not become DPI-aware read LOGICAL metrics: scaled up by dpi/96', logical);
  ok(J(MW.rectOf('win32', { wr: [66, 26, 1133, 693] }, logical)) === J({ x: 2019, y: 39, w: 1601, h: 1001 }) && J(MW.rectOf('win32', JSON.parse(BLENDER), logical)) === J(r), 'its GetWindowRect is scaled too; its DWM bounds (always physical) are not');
  ok(MW.rectOf('win32', { wr: [5, 5, 5, 9] }, scr) === null && MW.rectOf('win32', { wr: 'x' }, scr) === null, 'an empty / malformed rectangle is no rectangle');
}

// a Mac's screen-helper facts as src/agentd/stream-mac.js hands them (src/stream-plan.js parseMacFacts' shape; names invented)
const MAC_BASE = { ok: true, platform: 'darwin', tcc: { screen: 'granted', accessibility: 'denied' },
  displays: [{ id: '2', x: -1512, y: 0, w: 1512, h: 982, pw: 3024, ph: 1964, scale: 2, main: false, name: 'Side' }, { id: '1', x: 0, y: 0, w: 1512, h: 982, pw: 3024, ph: 1964, scale: 2, main: true, name: 'Built-in' }], windows: [] };
const macWin = (id, pid, app, [x, y, w, h], title = null) => ({ id: String(id), pid, app, bundle: `com.example.${app.toLowerCase()}`, title, x, y, w, h, onScreen: true, minimized: null });
const FINDER = macWin(4120, 512, 'Finder', [0, 25, 800, 500]);
const MBLENDER = macWin(4188, 8801, 'Blender', [120, 60, 1200, 800]);
const macFacts = (windows, more = {}) => ({ ...MAC_BASE, windows, ...more });
const STARTS = new Map([[512, 1791600000000], [8801, 1791700001000]]);
console.log('§2 a Mac\'s look = its screen helper\'s facts → points of the MAIN display; the owner\'s name when the title is hidden');
{
  const d = MW.macDumpOf(macFacts([FINDER, MBLENDER]), { starts: STARTS });
  const scr = MW.screenOf('darwin', d.screen);
  const row = d.wins.find((w) => w.id === 4188);
  ok(scr.x === 0 && scr.w === 1512 && scr.scale === 2 && J(MW.rectOf('darwin', row, scr)) === J({ x: 120, y: 60, w: 1200, h: 800 }), 'the window\'s bounds (points) are the rectangle, from the MAIN display\'s top-left (where CGWindowBounds start), its scale the scale', { scr, row });
  const side = MUT.load('src/machine-window.js', cut(mwSrc, 'const m = ds.find((d) => d && d.main) || ds[0] || null;', 'const m = ds[0] || null;'), 'firstdisplay');
  const ds = side.macDumpOf(macFacts([MBLENDER]));
  ok(J(side.rectOf('darwin', ds.wins[0], side.screenOf('darwin', ds.screen))) === J({ x: 1632, y: 60, w: 1200, h: 800 }), 'RED CONTROL: the first listed display (a side one at x = -1512) as the screen would put the crop 1512 points off');
  const a = MW.windowAnswer('darwin', d, row);
  ok(a.state === 'found' && a.windowId === 4188 && a.title === 'Blender' && a.pid === 8801 && a.bundle === 'com.example.blender' && J(a.screen) === J({ w: 1512, h: 982, scale: 2 }), 'no title in the facts ⇒ the answer names the app; it carries the bundle id (the pin\'s)', a);
  ok(d.procs.get(8801).start === 1791700001000 && d.procs.get(8801).ppid === 0 && d.wins.every((w) => w.vis === 1), 'the starts become the process rows (no lineage on a Mac); on-screen windows are visible rows');
  const off = MW.macDumpOf(macFacts([{ ...MBLENDER, onScreen: false, minimized: true }]));
  ok(off.wins[0].vis === 0 && off.wins[0].min === 1 && MW.windowAnswer('darwin', off, off.wins[0]).minimized === true, 'a minimized window the helper names (Accessibility) is a minimized answer');
  const st = MW.psStarts('  512 Sun Oct 18 15:28:32 2026\n 8801 Sun Oct  5 09:08:07 2026\nPID STARTED\n 77 garbage\n');
  ok(st.size === 2 && st.get(512) === Date.parse('Sun Oct 18 15:28:32 2026') && st.get(8801) === Date.parse('Sun Oct 5 09:08:07 2026'), '`ps -o pid= -o lstart=` (C locale) → each pid\'s start; a header or a stray line is no start', [...st]);
}

console.log('§3 which window is the launched app\'s');
{
  const [d1] = MW.parseDumps(winLook([PM, EXPLORER]));
  const [d2] = MW.parseDumps(winLook([PM, EXPLORER, BLENDER, SPLASH]));
  ok(MW.pickTrackedWindow('win32', d1, { pid: 9000, since: 1791700000000 }) === null, 'the app has no window yet ⇒ null (the look goes on)');
  ok(MW.pickTrackedWindow('win32', d2, { pid: 9000 })?.hwnd === 131330, 'start "" blender: cmd.exe (the launched pid) → blender.exe — its window, by lineage (the splash fragment is too small)');
  ok(MW.pickTrackedWindow('win32', d2, { pid: 4 })?.hwnd == null, 'another process\'s lineage ⇒ nothing (Explorer\'s window is never "the app")');
  const m1 = MW.macDumpOf(macFacts([FINDER, MBLENDER]), { starts: STARTS });
  ok(MW.pickTrackedWindow('darwin', m1, { pid: 30001, since: 1791700000000 })?.id === 4188, 'macOS open -a: launchd starts the app (no lineage) — the process STARTED after the run is its owner');
  ok(MW.pickTrackedWindow('darwin', m1, { pid: 30001, since: 1791700005000 }) === null, 'an app started before the run (minus 2 s slack) is not taken');
  const NEW = macWin(4200, 512, 'Finder', [200, 100, 900, 600], 'Report');
  const m2 = MW.macDumpOf(macFacts([FINDER, MBLENDER, NEW]), { starts: new Map([[512, 1791600000000], [8801, 1791600000000]]) });
  ok(MW.pickTrackedWindow('darwin', m2, { since: 1791700000000, firstIds: new Set([4120, 4188]) })?.id === 4200, 'an app that was already running opened a NEW window (not in the first look) ⇒ that window');
  const BIG = winRow(131400, 9012, 'Blender Preferences', [0, 0, 400, 300], [0, 0, 400, 300]);
  const [d3] = MW.parseDumps(winLook([BIG, BLENDER]));
  ok(MW.pickTrackedWindow('win32', d3, { pid: 9000 })?.hwnd === 131330, 'two windows of the app ⇒ the largest (its main window)');
  ok(MW.pickTrackedWindow('win32', d3, {}) === null, 'nothing to go by ⇒ null');
  const R = MUT.load('src/machine-window.js', cut(mwSrc, 'if (cur === pid) return true;', 'if (false) return true;'), 'nolineage');
  ok(R.pickTrackedWindow('win32', d2, { pid: 9000 }) === null, 'RED CONTROL: without the lineage walk the Windows app (a child of cmd.exe) is never found by its launched pid');
}

console.log('§4 the answers');
{
  const [d] = MW.parseDumps(winLook([BLENDER]));
  const a = MW.windowAnswer('win32', d, JSON.parse(BLENDER));
  ok(J(a) === J({ state: 'found', hwnd: 131330, screen: { w: 3840, h: 1080, scale: 1.5 }, pid: 9012, title: 'Blender', rect: { x: 2020, y: 40, w: 1600, h: 1000 }, minimized: false }), 'found: { hwnd, screen: {w,h,scale}, pid, title, rect: {x,y,w,h}, minimized }', a);
  ok(MW.windowAnswer('win32', d, { hwnd: 131330, gone: 1 }).state === 'gone' && MW.windowAnswer('win32', d, null).state === 'none', 'gone (the window closed) and none (no window appeared)');
  ok(MW.STATES.join() === 'found,gone,none,error', 'the four states');
  ok(MW.sameAnswer(a, { ...a }) && !MW.sameAnswer(a, { ...a, rect: { ...a.rect, x: 2021 } }) && !MW.sameAnswer(a, { ...a, title: 'Blender*' }) && !MW.sameAnswer(a, { ...a, minimized: true }), 'a watcher hears a move, a new title, a minimize — never the same answer twice');
  ok(MW.targetOf(a) === 131330 && MW.targetOf({ windowId: 4188 }) === 4188, 'the window an answer names (hwnd / window id)');
  ok(MW.trackRequest({ pid: 'x' }).code === 'bad-request' && MW.trackRequest({}).code === 'bad-request' && MW.trackRequest({ target: 5, findMs: 99999 }).waitMs === MW.TRACK_WAIT_MS, 'a request is judged: whole numbers, something to go by, the wait capped at 20 s');
}

console.log('§5 the crop and the pointer');
{
  const L = MW.cropLayout({ pane: { w: 800, h: 500 }, fb: { w: 3840, h: 1080 }, screen: { w: 3840, h: 1080 }, rect: { x: 2020, y: 40, w: 1600, h: 1000 } });
  ok(L.s === 0.5 && J(L.box) === J({ left: 0, top: 0, w: 800, h: 500 }) && J(L.stage) === J({ left: -1010, top: -20, w: 1920, h: 540 }), 'TightVNC sends the virtual screen in physical pixels (k = 1): the app fits the pane at ½ and the whole picture is shifted by its origin', L);
  ok(J(MW.paneToMachine(L, 400, 250)) === J({ x: 2820, y: 540 }), 'a click at the pane\'s centre lands at the app\'s centre on the machine (origin + offset ÷ scale)');
  ok(J(MW.paneToMachine(L, 0, 0)) === J({ x: 2020, y: 40 }) && J(MW.paneToMachine(L, 799.9, 499.9)) === J({ x: 3619, y: 1039 }), 'the corners map to the app\'s own corners, never past them');
  ok(MW.paneToMachine(L, -1, 10) === null && MW.paneToMachine(L, 800, 10) === null && MW.paneToMachine(L, 10, 500) === null, 'outside the crop ⇒ null (dropped, never sent)');
  const R = MW.cropLayout({ pane: { w: 390, h: 600 }, fb: { w: 3024, h: 1964 }, screen: { w: 1512, h: 982 }, rect: { x: 120, y: 60, w: 1200, h: 800 } });
  ok(R.k === 2 && J(R.src) === J({ x: 240, y: 120, w: 2400, h: 1600 }) && R.box.w === 390 && R.box.top === 170, 'a Retina Mac: points × (framebuffer ÷ screen width) = pixels; a phone pane letterboxes the app (centred)', R);
  ok(J(MW.paneToMachine(R, 195, 300)) === J({ x: 1440, y: 920 }) && MW.paneToMachine(R, 195, 100) === null, 'the phone: the centre of the crop lands at the app\'s centre; the letterbox above it sends nothing');
  ok(J(MW.clampToBox(L, 900, -20)) === J({ x: 799.999, y: 0 }), 'a drag that leaves the crop is held at its edge');
  ok(MW.cropLayout({ pane: { w: 800, h: 500 }, fb: { w: 3840, h: 1080 }, screen: { w: 3840, h: 1080 }, rect: { x: 4000, y: 40, w: 300, h: 300 } }) === null, 'a window off the shared screen ⇒ no crop (the pane says so)');
  const C = MUT.load('src/machine-window.js', cut(mwSrc, 'const k = screen && screen.w > 0 ? fb.w / screen.w : 1;', 'const k = 1;'), 'nok');
  ok(J(MW.paneToMachine(C.cropLayout({ pane: { w: 390, h: 600 }, fb: { w: 3024, h: 1964 }, screen: { w: 1512, h: 982 }, rect: { x: 120, y: 60, w: 1200, h: 800 } }), 195, 300)) !== J({ x: 1440, y: 920 }), 'RED CONTROL: a crop that ignores points vs pixels sends the Retina click to the wrong place');
  const O = MUT.load('src/machine-window.js', cut(mwSrc, 'if (!(bx >= 0 && by >= 0 && bx < L.box.w && by < L.box.h)) return null;', ''), 'noedge');
  ok(O.paneToMachine(L, -1, 10) !== null, 'RED CONTROL: without the edge rule a pointer outside the crop would reach the machine');
}

console.log('§6 the device runner (a fake spawn) and the pin');
{
  let clock = 1000;
  const timers = [];
  const setTimer = (f, ms) => { const t = { at: clock + ms, f }; timers.push(t); return t; };
  const clearTimer = (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };
  const advance = (ms) => { clock += ms; for (const t of timers.filter((x) => x.at <= clock)) { clearTimer(t); t.f(); } };
  const spawned = [];
  const spawn = (cmd, args) => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.killed = false; c.kill = () => { c.killed = true; }; c.cmd = cmd; c.args = args; spawned.push(c); return c; };
  const got = [];
  let ended = 0;
  const h = MW.runWindowTrack({ platform: 'win32', params: { pid: 9000, since: 1791700000000, watch: true }, spawn, env: {}, onAnswer: (a, first) => got.push({ a, first }), onEnd: () => { ended++; }, now: () => clock, setTimer, clearTimer });
  const decode = (c) => Buffer.from(c.args[c.args.length - 1], 'base64').toString('utf16le');
  ok(spawned.length === 1 && spawned[0].cmd === 'powershell.exe' && /\$target = \[IntPtr\]\[Int64\]0/.test(decode(spawned[0])) && /Get-CimInstance Win32_Process/.test(decode(spawned[0])) && /-gt 20000\) \{ exit 0 \}/.test(decode(spawned[0])), 'ONE PowerShell finds (every window + the process table), bounded at 20 s by itself');
  spawned[0].stdout.emit('data', winLook([PM, EXPLORER]));
  ok(got.length === 0, 'the first look has no app window: nothing answered yet');
  spawned[0].stdout.emit('data', winLook([PM, EXPLORER, BLENDER]).slice(0, 40));
  spawned[0].stdout.emit('data', winLook([PM, EXPLORER, BLENDER]).slice(40));
  ok(got.length === 1 && got[0].first && got[0].a.state === 'found' && got[0].a.hwnd === 131330 && spawned[0].killed, 'the second look (split across reads) finds it: the first answer; the finding look is stopped', got[0]);
  ok(spawned.length === 2 && /\$target = \[IntPtr\]\[Int64\]131330/.test(decode(spawned[1])) && !/Get-CimInstance/.test(decode(spawned[1])) && /Start-Sleep -Milliseconds 100/.test(decode(spawned[1])), 'then ONE lean look follows that window (no process table, every 100 ms)');
  const W = spawned[1];
  const moved = (x) => winLook([winRow(131330, 9012, 'Blender', [x, 40, x + 1600, 1040], [x, 40, x + 1600, 1040])], []);
  W.stdout.emit('data', moved(100)); // the same rectangle
  ok(got.length === 1, 'the same rectangle again: no push');
  advance(150); W.stdout.emit('data', moved(300));
  ok(got.length === 2 && !got[1].first && got[1].a.rect.x === 2220, 'a move ≥ 100 ms after the last push arrives at once');
  advance(20); W.stdout.emit('data', moved(400)); advance(20); W.stdout.emit('data', moved(500));
  ok(got.length === 2, 'two more moves within 100 ms wait');
  advance(60);
  ok(got.length === 3 && got[2].a.rect.x === 2420, 'then the LATEST of them arrives (never dropped, never both)');
  advance(200); W.stdout.emit('data', winLook([J({ t: 'win', hwnd: 131330, gone: 1 })], []));
  ok(got.length === 4 && got[3].a.state === 'gone' && ended === 1 && W.killed && h.stopped, 'the window closed ⇒ gone, the watch ends (its look stopped)');
  const none = []; spawned.length = 0;
  MW.runWindowTrack({ platform: 'win32', params: { since: 1791700000000, findMs: 3000 }, spawn, env: {}, onAnswer: (a) => none.push(a), now: () => clock, setTimer, clearTimer });
  ok(/-gt 3000\) \{ exit 0 \}/.test(decode(spawned[0])), 'the finding look carries its bound (findMs) into the script');
  spawned[0].emit('close', 0);
  ok(none.length === 1 && none[0].state === 'none', 'the look ended at its wait without a window ⇒ none');
  const bad = []; MW.runWindowTrack({ platform: 'linux', params: { pid: 1 }, spawn, env: {}, onAnswer: (a) => bad.push(a) });
  ok(bad[0].state === 'error' && bad[0].code === 'not_desktop_machine', 'a Linux machine is refused by name (its apps have their own windows)');
  const ran = [];
  const execFile = (cmd, args, o, cb) => { ran.push([cmd, args]); cb(null, 'ok\n', ''); };
  const on = await MW.pinWindow({ platform: 'win32', hwnd: 131330, on: true, execFile, env: {} });
  const ps = Buffer.from(ran[0][1][ran[0][1].length - 1], 'base64').toString('utf16le');
  ok(on.ok && on.pinned && /SetWindowPos\(\$h, \[IntPtr\]\(-1\), 0, 0, 0, 0, 0x0013\)/.test(ps) && /ShowWindow\(\$h, 9\)/.test(ps), 'Windows pin: HWND_TOPMOST after a restore when minimized (never moved, never activated)');
  await MW.pinWindow({ platform: 'win32', hwnd: 131330, on: false, execFile, env: {} });
  const ps2 = Buffer.from(ran[1][1][ran[1][1].length - 1], 'base64').toString('utf16le');
  ok(/\[IntPtr\]\(-2\)/.test(ps2) && !/ShowWindow\(\$h/.test(ps2), 'unpin: HWND_NOTOPMOST (no restore)');
  const n0 = ran.length; const off = await MW.pinWindow({ platform: 'darwin', pid: 8801, on: false, execFile, env: {} });
  ok(off.ok && ran.length === n0, 'a Mac has nothing to undo: no script runs');
  const gone = await MW.pinWindow({ platform: 'win32', hwnd: 5, on: true, execFile: (c, a, o, cb) => cb(Object.assign(new Error('x'), { code: 3 }), 'gone\n', ''), env: {} });
  ok(gone.ok && gone.state === 'gone', 'pinning a window that closed says gone (nothing to keep on top)');
}

console.log('§6b a Mac: the look is ITS SCREEN HELPER\'s facts (lane mac-window-list-helper — nothing under node reads the screen)');
{
  let clock = 5000;
  const timers = [];
  const setTimer = (f, ms) => { const t = { at: clock + ms, f }; timers.push(t); return t; };
  const clearTimer = (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  const advance = async (ms) => { clock += ms; for (const t of timers.filter((x) => x.at <= clock)) { clearTimer(t); t.f(); } await settle(); };
  const spawned = [];
  const spawn = (...a) => { spawned.push(a); throw new Error('a Mac look spawns nothing under node'); };
  const fake = (start) => {
    const s = { facts: start, alive: new Set([512, 8801]), runs: 0, starts: [] };
    s.mac = { facts: async () => { s.runs++; return s.facts; }, starts: async (pids) => { s.starts.push(pids); return new Map(pids.filter((p) => s.alive.has(p)).map((p) => [p, STARTS.get(p)])); } };
    return s;
  };
  const S = fake(macFacts([FINDER, MBLENDER]));
  const got = []; let ended = 0;
  const h = MW.runWindowTrack({ platform: 'darwin', params: { pid: 30001, since: 1791700000000, watch: true }, spawn, env: {}, mac: S.mac, onAnswer: (a, first) => got.push({ a, first }), onEnd: () => { ended++; }, now: () => clock, setTimer, clearTimer });
  await settle();
  ok(got.length === 1 && got[0].first && got[0].a.state === 'found' && got[0].a.windowId === 4188 && got[0].a.bundle === 'com.example.blender' && J(S.starts) === J([[512, 8801]]) && spawned.length === 0, 'the FIRST look (one helper facts run, nothing spawned under node) finds the app by its owner\'s start — though its window was there at that look', { got, starts: S.starts });
  ok(S.runs === 2, 'then the follow begins with one more facts run (the same answer is not pushed again)', S.runs);
  S.facts = macFacts([FINDER, { ...MBLENDER, x: 300 }]);
  await advance(MW.MAC_WATCH_POLL_MS - 1);
  ok(S.runs === 2 && got.length === 1, 'one run at a time: the next facts run waits its 500 ms');
  await advance(1);
  ok(S.runs === 3 && got.length === 2 && got[1].a.rect.x === 300 && J(S.starts) === J([[512, 8801]]), 'following: one facts run every 500 ms, a move arrives; no start is asked while following', got[1]);
  S.facts = macFacts([FINDER]);
  await advance(MW.MAC_WATCH_POLL_MS);
  ok(got.length === 3 && got[2].a.state === 'found' && got[2].a.minimized === true && got[2].a.rect.x === 300 && J(S.starts.at(-1)) === J([8801]), 'off the list while its app runs and Accessibility is off ⇒ OFF SCREEN (minimized, its last rectangle): the app\'s process asked, never assumed gone', got[2]);
  S.alive.delete(8801);
  await advance(MW.MAC_WATCH_POLL_MS);
  ok(got.length === 4 && got[3].a.state === 'gone' && ended === 1 && h.stopped, 'its app ended ⇒ gone, the watch ends');
  const n = S.runs; await advance(5000);
  ok(S.runs === n && timers.length === 0, 'an ended watch runs the helper no more (no timer left)');

  const A = fake(macFacts([FINDER, MBLENDER], { tcc: { screen: 'granted', accessibility: 'granted' } }));
  const ga = [];
  MW.runWindowTrack({ platform: 'darwin', params: { target: 4188, watch: true }, spawn, env: {}, mac: A.mac, onAnswer: (a) => ga.push(a), now: () => clock, setTimer, clearTimer });
  await settle(); A.facts = macFacts([FINDER], { tcc: { screen: 'granted', accessibility: 'granted' } });
  await advance(MW.MAC_WATCH_POLL_MS);
  ok(ga.length === 2 && ga[0].state === 'found' && ga[1].state === 'gone' && A.starts.length === 0, 'Accessibility on: the helper lists a minimized window itself, so a window missing from the facts is gone (no process asked)', ga);

  const R = MUT.load('src/machine-window.js', cut(mwSrc, 'if (fresh.length && req.since) {', 'if (false) {'), 'nostarts');
  const N = fake(macFacts([FINDER, MBLENDER]));
  const gn = [];
  R.runWindowTrack({ platform: 'darwin', params: { pid: 30001, since: 1791700000000, findMs: 1000 }, spawn, env: {}, mac: N.mac, onAnswer: (a) => gn.push(a), now: () => clock, setTimer, clearTimer });
  await settle(); for (let i = 0; i < 4; i++) await advance(MW.TRACK_POLL_MS);
  ok(gn.length === 1 && gn[0].state === 'none' && N.runs === 5, 'RED CONTROL: without the starts the app whose window was already there at the first look is never found (none at the wait, 5 runs in 1 s)', { gn, runs: N.runs });

  const refused = [];
  const off = { ok: false, code: 'screen_permission', error: 'Screen Recording is off for vibespace-screen — on the Mac: System Settings → …', settings: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture' };
  MW.runWindowTrack({ platform: 'darwin', params: { since: 1791700000000, watch: true }, spawn, env: {}, mac: { facts: async () => off }, onAnswer: (a) => refused.push(a), now: () => clock, setTimer, clearTimer });
  await settle();
  ok(refused.length === 1 && refused[0].state === 'error' && refused[0].code === 'screen_permission' && /vibespace-screen/.test(refused[0].error) && refused[0].settings === off.settings && spawned.length === 0, 'the helper without Screen Recording ⇒ refused BY NAME (vibespace-screen + its Settings pane) — never a look under node instead', refused);
  const noMac = [];
  MW.runWindowTrack({ platform: 'darwin', params: { since: 1791700000000 }, spawn, env: {}, onAnswer: (a) => noMac.push(a), now: () => clock, setTimer, clearTimer });
  ok(noMac.length === 1 && noMac[0].code === 'no_helper' && spawned.length === 0, 'no helper handed in ⇒ no_helper (nothing spawned)', noMac);
  ok(J(MW.trackArgv('darwin', {})) === J({ ok: true, argv: null }) && J(MW.displaysArgv('darwin')) === J({ ok: true, argv: null }), 'a Mac\'s look and screen table have NO argv: no child under node');

  const ran = [];
  const exM = (up) => (cmd, args, o, cb) => { ran.push([cmd, args]); cb(null, cmd === '/bin/ps' ? (up ? ' 8801\n' : '') : '', ''); };
  const pin = await MW.pinWindow({ platform: 'darwin', pid: 8801, bundle: 'com.example.blender', on: true, execFile: exM(true), env: {} });
  ok(pin.ok && !pin.pinned && pin.note === 'mac-activated' && J(ran) === J([['/bin/ps', ['-o', 'pid=', '-p', '8801']], ['/usr/bin/open', ['-b', 'com.example.blender']]]), 'a Mac pin: its app still runs (ps), then LaunchServices ACTIVATES it by bundle id (`open -b` — no osascript under node)', ran);
  ran.length = 0;
  const quit = await MW.pinWindow({ platform: 'darwin', pid: 8801, bundle: 'com.example.blender', on: true, execFile: exM(false), env: {} });
  ok(quit.ok && quit.state === 'gone' && ran.length === 1 && ran[0][0] === '/bin/ps', 'its app quit ⇒ gone, and `open` never runs (it would LAUNCH the app again)', ran);
  ran.length = 0;
  const nob = await MW.pinWindow({ platform: 'darwin', pid: 8801, bundle: null, on: true, execFile: exM(true), env: {} });
  const inj = await MW.pinWindow({ platform: 'darwin', pid: 8801, bundle: '-a /Applications/Other.app', on: true, execFile: exM(true), env: {} });
  ok(nob.code === 'no_bundle' && inj.code === 'no_bundle' && ran.length === 0, 'no bundle id (or a string that is not one) ⇒ refused by name, nothing runs');
}

console.log('§7 the capability gate: an old agent is never asked');
{
  const clientSrc = fs.readFileSync(path.join(repo, 'src/agentd/client.js'), 'utf8');
  const make = (Mod, caps) => { const dm = Object.create(Mod.DeviceManager.prototype); const sent = []; dm.connect = async () => ({ info: { capabilities: caps } }); dm._request = async (m) => { sent.push(m.op); return { result: { state: 'none' } }; }; return { dm, sent }; };
  const C = require(path.join(repo, 'src/agentd/client.js'));
  const old = make(C, ['desktop-serve']);
  let err = null; try { await old.dm.windowTrack({ pid: 1 }); } catch (e) { err = e; }
  ok(err && err.code === 'host_needs_daemon' && old.sent.length === 0, 'an agent without window-track: host_needs_daemon, and NO request (an unknown op would hang it)', { code: err && err.code, sent: old.sent });
  let perr = null; try { await old.dm.windowPin('w1', true, { by: 'system:test' }); } catch (e) { perr = e; }
  ok(perr && perr.code === 'host_needs_daemon' && old.sent.length === 0, 'the same for window-pin');
  const neu = make(C, ['window-track', 'window-pin']);
  const r = await neu.dm.windowTrack({ pid: 1 });
  ok(r.result.state === 'none' && neu.sent.join() === 'window-track', 'a current agent is asked');
  const gateless = MUT.load('src/agentd/client.js', cut(clientSrc, "if (!conn.info?.capabilities?.includes?.('window-track')) { const e = new Error('daemon lacks window-track", "if (false) { const e = new Error('daemon lacks window-track"), 'nogate');
  const g = make(gateless, ['desktop-serve']);
  await g.dm.windowTrack({ pid: 1 }).catch(() => { });
  ok(g.sent.join() === 'window-track', 'RED CONTROL: a client without the gate SENDS the op to the old agent (which would hang until its timeout)');
  const ad = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf8');
  ok(/capabilities: \[[^\]]*'window-track', 'window-pin'/.test(ad) && /if \(msg\.op === 'window-track'\)/.test(ad) && /if \(msg\.op === 'window-pin'\)/.test(ad) && /m\.op === 'window-track-result' \|\| m\.op === 'window-untrack-result' \|\| m\.op === 'window-pin-result'/.test(clientSrc) && /if \(m\.op === 'window-rect'\) \{[^\n]*\}[^\n]*\n\s+if \(m\.op === 'pool-orders-executed'\)/.test(clientSrc), 'three touches: the handlers, the hello-ack capabilities, the reply ops in the id-keyed set + the push branch BEFORE prevControl');
}

console.log('§8 the hub: one pin per machine, closing ends the watch, a pin left behind is reported');
{
  const MA = require(path.join(repo, 'src/server/machine-app.js'));
  const calls = [];
  let untrackFails = false;
  const dev = (platform) => ({ status: () => ({ connected: true, info: { platform } }), pushes: new Map(),
    async windowTrack(p, { onPush }) { calls.push(['track', p.pid ?? p.target]); const wid = 'w' + calls.length; this.pushes.set(wid, onPush); return { wid, result: { state: 'found', hwnd: 100 + calls.length, title: 'App ' + calls.length, rect: { x: 0, y: 0, w: 100, h: 100 }, screen: { w: 1000, h: 800, scale: 1 } } }; },
    async windowPin(wid, on) { calls.push(['pin', wid, on]); return { ok: true, pinned: on }; },
    async windowUntrack(wid) { calls.push(['untrack', wid]); if (untrackFails) throw new Error('device link lost'); return { stopped: true }; } });
  const devs = { w1: dev('win32'), l1: dev('linux') };
  let now = 0;
  const warns = [];
  const ma = MA.create({ access: { deviceOf: async (h) => devs[h] }, log: { log() { }, warn: (m) => warns.push(m) }, now: () => now, idleMs: 30000, sweepMs: 3600e3 });
  const a = await ma.track('w1', { pid: 10, since: 1791700000000 });
  const b = await ma.track('w1', { pid: 11, since: 1791700000000 });
  ok(a.key && b.key && a.answer.state === 'found', 'two app windows of one machine are followed');
  await ma.pin(a.key, true);
  const pb = await ma.pin(b.key, true);
  ok(J(calls.filter((c) => c[0] === 'pin')) === J([['pin', 'w1', true], ['pin', 'w1', false], ['pin', 'w2', true]]) && pb.pin.key === b.key, 'ONE screen: pinning the second unpins the first; every watch hears which window is on top', calls);
  const pa = await ma.poll(a.key, -1);
  ok(pa.pin && pa.pin.key === b.key && pa.pin.title === 'App 2', 'the first window\'s poll says the other is on top (by title)');
  ma.untrack(b.key); await new Promise((r) => setTimeout(r, 0));
  ok(calls.some((c) => c[0] === 'untrack' && c[1] === 'w2') && (await ma.poll(a.key, -1)).pin === null, 'closing a window ends its watch (the device undoes its pin) and the other window hears nothing is on top');
  devs.w1.pushes.get('w1')({ state: 'gone', hwnd: 102 });
  ok((await ma.poll(a.key, -1)).ended === true, 'the app closed on the machine: its watch is gone');
  const c = await ma.track('w1', { pid: 12 });
  await ma.pin(c.key, true);
  untrackFails = true;
  now += 31000; ma.untrack(c.key); await new Promise((r) => setTimeout(r, 0));
  ok(ma.pinsLeft('w1').length === 1 && ma.pinsLeft('w1')[0].title === c.answer.title && /may still be kept on top/.test(warns.join()), 'a pin the hub could not undo (the machine went away) is REPORTED — never forced', { left: ma.pinsLeft('w1'), warns });
  untrackFails = false;
  const d = await ma.track('w1', { pid: 13 });
  const ma2 = MA.create({ access: { deviceOf: async (h) => devs[h] }, log: { log() { }, warn() { } }, now: () => now, idleMs: 30000, sweepMs: 20 });
  const e = await ma2.track('w1', { pid: 14 });
  now += 31000; await new Promise((r) => setTimeout(r, 60));
  ok(ma2.list().length === 0 && calls.some((x) => x[0] === 'untrack' && x[1] === 'w' + (calls.findIndex((y) => y[0] === 'track' && y[1] === 14) + 1)), 'a page that stopped polling (closed without a word) ⇒ its watch is ended after 30 s', ma2.list());
  ma.shutdown(); ma2.shutdown(); void d; void e;
  let lin = null; try { await ma.track('l1', { pid: 1 }); } catch (x) { lin = x; }
  ok(lin && lin.code === 'not_desktop_machine', 'a Linux machine is refused by name');
  const wt = fs.readFileSync(path.join(repo, 'src/lib/machine-app.js'), 'utf8');
  ok(/registerWindowType\(\{ type: 'machine-app', label: 'Machine app', persist: false,/.test(wt) && /winInfo\.onClose = \(\) => \{[\s\S]{0,200}machine-app\/untrack/.test(wt), 'the window type is NOT persisted, and closing it ends the watch (the device undoes the pin)');
}

console.log('§9 the run\'s launch report; "the line names a GUI app"');
{
  for (const p of ['darwin', 'win32']) {
    const plain = MD.desktopRunPlan(p, 'start "" blender'), plain2 = MD.desktopRunPlan(p, 'start "" blender', { report: false });
    ok(J(plain) === J(plain2), `${p}: the plain "Run…" plan is byte for byte the one before`);
  }
  const mac = MD.desktopRunPlan('darwin', 'open -a Blender', { report: true });
  ok(mac.argv[2] === 'nohup /bin/sh -lc "$1" </dev/null >/dev/null 2>&1 & echo "vibespace-launched $! $(date +%s)000"' && mac.argv[4] === 'open -a Blender', 'darwin: the backgrounded pid ($!) + the machine\'s clock (the line stays the positional $1)');
  const win = Buffer.from(MD.desktopRunPlan('win32', 'start "" blender', { report: true }).argv.at(-1), 'base64').toString('utf16le');
  ok(/\$at = \[DateTimeOffset\]::Now\.ToUnixTimeMilliseconds\(\); \$p = Start-Process -FilePath \$env:ComSpec/.test(win) && /-PassThru; \[Console\]::Out\.WriteLine\('vibespace-launched ' \+ \$p\.Id \+ ' ' \+ \$at\)/.test(win), 'win32: Start-Process -PassThru — cmd.exe\'s pid + the machine\'s clock');
  ok(J(MW.parseLaunchReport('noise\nvibespace-launched 9000 1791700000000\n')) === J({ pid: 9000, at: 1791700000000 }) && MW.parseLaunchReport('vibespace-launched x 1') === null && MW.parseLaunchReport('') === null, 'the report is read back (anything else is no report)');
  ok(MW.namesGuiApp('darwin', 'open -a Blender') && MW.namesGuiApp('darwin', ' open -na "JASP"') && MW.namesGuiApp('win32', 'start "" "C:\\Program Files\\JASP\\JASP.exe"') && !MW.namesGuiApp('win32', 'echo hi') && !MW.namesGuiApp('darwin', 'say hi') && !MW.namesGuiApp('linux', 'open -a X'), '"Run as its own window…" is the default for a line that starts a GUI app by name');
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? ', ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0);
