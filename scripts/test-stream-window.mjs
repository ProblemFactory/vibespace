#!/usr/bin/env node
// ONE WINDOW AS THE STREAM'S PICTURE (lane stream-p2w-build, design q-041 r3 §3 P2w) — the window source's PURE shape
// (src/stream-window.js, shared with the Mac source), its plan (src/stream-plan.js planWindow + the helper's recipe / head /
// lines), the rung's window branch (src/stream-model.js), and THE REAL SOURCE (src/agentd/stream-window-source.js) driven end
// to end by a FAKE helper + a fake ffmpeg (scripts/fixtures/stream/window-fakes.mjs, screen-fakes.mjs):
//   §1 the shape: rows → windowSourceOf; the verdict (bad_window / agent_too_old / no_window_source / take); the picker's filter
//   §2 THE COORDINATE RULE: a view pixel → the window's pixel (videoToSource over windowViewSize's box) → the desktop
//      (windowInputOf: the live origin added, held inside) — DPI 100 / 150 / 175, a window on the second display (left of the
//      primary: negative x); the size rule (physical ÷ dpi/96, shrunk into the room, never grown)
//   §3 held, by name: minimized after WINDOW_GAP_MS without a new picture; a covered Chromium window idle; else null
//   §4 the plan: refusals by name, the BGRA road (interval by rate), FP16 only on an HDR display, the argvs; the helper's
//      build recipe (the define ladder, a union winmd), its frame head and lines
//   §5 the rung: `want: 'window'` asked (int304: the Mac's name) → the capability gate (an old agent: agent_too_old); the agent
//      client never ASKS a daemon without `stream-windows` (a .301–.303 agent already says stream-window without the op)
//   §6 THE HELPER BUILD (the real path, a fake csc): built once, the stamp keeps it, a changed source rebuilds, a refused
//      define steps down, no metadata = helper_missing with the recipe
//   §7 THE REAL SOURCE, end to end: facts → plan → start → access units; a size change restarts the encoder at the new size;
//      minimized ⇒ held window_minimized and back; closed ⇒ window_gone; a dead helper ⇒ helper_exited; stop ends nothing by
//      name; the picker list and restore through the same helper
//   §8 THE THREE TOUCHES: the hello-ack word, the op's handler + `op` on its reply, the client's routing set + gated method;
//      the stream host shifts a relative source's pointer events by its live bounds; the helper's text module IS the .cs
// lane stream-window-fixes (the owner's first real use — five field defects): §1 the held door (「还原它」 only with the
// minimized row); §4b THE RATE (the floor table, the owner's session replayed, the intra-refresh wave); §4c THE STATS ROW's
// facts (one component for both stream windows); §7 ⑥ a CJK + emoji title intact, ⑦ the stop BY NAME (stdin first, the
// helper's exit + release logged; a deaf helper killed after the grace), ⑧ the floor and the key-frame ask on the real
// source; §8 the end's name through client → agent → host → source, the helper's ASCII JSON, the routes; §9 THE HUB (the
// viewer gone ⇒ stopped in seconds; the picker's 停止; a stop's name reaches the machine)
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { writeFakeFfmpeg } from './fixtures/stream/screen-fakes.mjs';
import { writeFakeWgc, writeFakeCsc } from './fixtures/stream/window-fakes.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SW = require(path.join(REPO, 'src/stream-window.js'));
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const SM = require(path.join(REPO, 'src/stream-model.js'));
const WS = require(path.join(REPO, 'src/agentd/stream-window-source.js'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(20); } return !!f(); }
const ROW = { hwnd: '657982', pid: 4242, cls: 'WindowsForms10.Window.8.app.0.1', title: 'wgc pad', exe: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', visible: true, min: false, cloaked: 0, tool: false, owner: '0', frame: [312, 208, 1408, 996], dpi: 168, display: '\\\\.\\DISPLAY2', elevated: false, capturable: true };

console.log('§1 the shape, the verdict, the picker');
{
  const s = SW.windowSourceOf(ROW);
  ok(same(s, { kind: 'window', id: '657982', title: 'wgc pad', app: 'powershell', bounds: { x: 312, y: 208, w: 1096, h: 788 }, display: '\\\\.\\DISPLAY2', dpi: 168, minimized: false }), 'a helper row → { kind, id, title, app (the exe\'s name), bounds (the DWM frame), display, dpi, minimized }', s);
  ok(same(SW.windowSourceOf({ id: 7, bounds: { x: -3840, y: 0, w: 640, h: 480 }, title: 'x\u0007y', app: 'Calc', minimized: true }).bounds, { x: -3840, y: 0, w: 640, h: 480 }) && SW.windowSourceOf({ id: 7, bounds: { x: 0, y: 0, w: 1, h: 1 }, title: 'x\u0007y' }).title === 'x y', 'a {bounds} row (the Mac\'s shape) too; control characters in a title become spaces');
  ok([{ hwnd: '0', frame: [0, 0, 9, 9] }, { hwnd: 'abc', frame: [0, 0, 9, 9] }, { hwnd: '5', frame: null }, { hwnd: '5', frame: [9, 9, 1, 1] }, null].every((r) => SW.windowSourceOf(r) === null), 'no id, a non-numeric id, no rectangle, an empty rectangle ⇒ null');
  const v = (o) => SW.windowSourceVerdict({ capabilities: ['stream-offer', 'stream-window'], platform: 'win32', window: '657982', ...o });
  ok(v({}).take && v({}).source === 'window' && v({}).sourceId === '657982', 'a capable Windows agent + a window id ⇒ take, source window');
  ok(v({ window: 'x;rm' }).code === 'bad_window' && v({ window: '0' }).code === 'bad_window' && v({ window: null }).code === 'bad_window', 'a window id is a whole number ≥ 1 (bad_window)');
  ok(v({ capabilities: ['stream-offer', 'stream-screen'] }).code === 'agent_too_old', 'an agent without `stream-window` ⇒ agent_too_old (it is never asked)');
  ok(v({ platform: 'linux' }).code === 'no_window_source' && v({ platform: 'darwin' }).take && SW.windowSourceVerdict({ capabilities: ['stream-window'], platform: 'darwin', window: '9', platforms: ['win32'] }).code === 'no_window_source', 'a platform without a window source ⇒ no_window_source (darwin has one since int304: the Mac lane\'s SCK source)');
  const rows = [ROW, { ...ROW, hwnd: '2', title: 'cloaked', cloaked: 2 }, { ...ROW, hwnd: '3', title: 'tool', tool: true }, { ...ROW, hwnd: '4', title: 'owned', owner: '657982' },
    { ...ROW, hwnd: '5', title: 'tiny', frame: [0, 0, 24, 24] }, { ...ROW, hwnd: '6', title: 'mini', min: true, frame: [-32000, -32000, -31840, -31972] }, { ...ROW, hwnd: '7', title: 'refused', capturable: false },
    { ...ROW, hwnd: '8', title: '' }, { ...ROW, hwnd: '9', title: 'hidden', visible: false }, { ...ROW, hwnd: '10', title: 'Edge', cls: 'Chrome_WidgetWin_1', elevated: true }];
  const pick = SW.windowPickRows(rows);
  ok(same(pick.map((r) => r.title), ['wgc pad', 'mini', 'Edge']), 'the picker keeps an application\'s own windows (cloaked / tool / owned / tiny / refused / untitled / hidden dropped; minimized kept), in z-order', pick.map((r) => r.title));
  ok(pick[1].minimized === true && pick[2].elevated === true && pick[2].cls === 'Chrome_WidgetWin_1' && pick[0].pid === 4242, 'a row says minimized / elevated / its class / its pid');
  ok(same(SW.windowHeldDoor('window_minimized'), { row: 'minimized', restore: true }) && same(SW.windowHeldDoor('window_covered_idle'), { row: 'covered', restore: false }) && same(SW.windowHeldDoor(null), { row: null, restore: false }) && same(SW.windowHeldDoor('window_gone'), { row: null, restore: false }), 'THE HELD DOOR (lane stream-window-fixes): 「还原它」 ONLY with the minimized row and its sentence; covered says why with no door; live = nothing');
  const ma = fs.readFileSync(path.join(REPO, 'src/lib/machine-app.js'), 'utf8'), vcss = fs.readFileSync(path.join(REPO, 'public/viewers.css'), 'utf8');
  ok(/\.file-tool-btn \{[^}]*display: flex;/.test(vcss) && /heldRow\.style\.display = door\.row === 'minimized' \? 'flex' : 'none';/.test(ma) && /restoreBtn\.style\.display = door\.restore \? '' : 'none';/.test(ma) && !/restoreBtn\.hidden/.test(ma), 'the cause, measured: viewers.css\'s `.file-tool-btn { display: flex }` out-ranks `hidden` (the old button showed at all times) — the window shows the row by `display`, never the attribute');
}

console.log('§2 THE COORDINATE RULE (view → window → desktop) and the size rule');
{
  // a view pixel → the window's pixel: the page's own letterbox map (videoToSource, origin 0,0 for a window) over the box the
  // size rule gives; then the agent adds the window's live place (windowInputOf)
  const table = [
    { dpi: 96, bounds: { x: 100, y: 50, w: 1200, h: 800 }, view: { x: 600, y: 400 }, want: { x: 700, y: 450 } },
    { dpi: 144, bounds: { x: 100, y: 50, w: 1500, h: 900 }, view: { x: 500, y: 300 }, want: { x: 850, y: 500 } },
    { dpi: 168, bounds: { x: 312, y: 208, w: 1096, h: 788 }, view: { x: 313, y: 225 }, want: { x: 312 + 547, y: 208 + 393 } },
    { dpi: 168, bounds: { x: -3840 + 105, y: 70, w: 3480, h: 1914 }, view: { x: 1, y: 1 }, want: { x: -3735 + 1, y: 70 + 1 } },
  ];
  for (const r of table) {
    const box = SW.windowViewSize({ w: r.bounds.w, h: r.bounds.h, dpi: r.dpi }, { w: 10000, h: 10000 });
    const src = SM.videoToSource(r.view, { left: 0, top: 0, width: box.w, height: box.h }, { w: r.bounds.w, h: r.bounds.h }, { x: 0, y: 0 });
    const desk = SW.windowInputOf({ t: 'md', x: src.x, y: src.y, b: 0 }, r.bounds);
    ok(Math.abs(desk.x - r.want.x) <= 1 && Math.abs(desk.y - r.want.y) <= 1 && desk.b === 0, `DPI ${r.dpi} (${Math.round(r.dpi / 0.96)} %), the window at (${r.bounds.x}, ${r.bounds.y}): view (${r.view.x}, ${r.view.y}) of a ${box.w}×${box.h} box → desktop (${desk.x}, ${desk.y})`, { box, src, desk });
  }
  const b = { x: -3840, y: 0, w: 800, h: 600 };
  ok(same(SW.windowInputOf({ t: 'mv', x: 5000, y: -7 }, b), { t: 'mv', x: -3840 + 799, y: 0 }) && same(SW.windowInputOf({ t: 'wh', x: -1, y: 900, dx: 0, dy: 120 }, b), { t: 'wh', x: -3840, y: 599, dx: 0, dy: 120 }), 'a point outside the window is held at its edge (a press never lands beside it) — the second display\'s negative origin kept');
  ok(same(SW.windowInputOf({ t: 'kd', c: 'KeyA' }, b), { t: 'kd', c: 'KeyA' }) && same(SW.windowInputOf({ t: 'clip', text: 'x' }, b), { t: 'clip', text: 'x' }), 'keys and the clipboard pass unchanged');
  ok(same(SW.windowViewSize({ w: 1096, h: 788, dpi: 168 }, { w: 3000, h: 3000 }), { w: 626, h: 450, scale: 96 / 168 }), 'the size rule: 1096×788 at 175 % ⇒ 626×450 (its own size on its machine)');
  const s2 = SW.windowViewSize({ w: 3480, h: 1914, dpi: 96 }, { w: 1740, h: 2000 });
  ok(s2.w === 1740 && s2.h === 957 && SW.windowViewSize({ w: 400, h: 300, dpi: 96 }, { w: 2000, h: 2000 }).w === 400, 'shrunk into the room with the aspect kept; never grown', s2);
  ok(SW.windowViewSize({ w: 0, h: 5 }) === null, 'no picture yet ⇒ null');
}

console.log('§3 held, by name');
{
  const H = (o) => SW.windowHeldVerdict(o);
  ok(H({ minimized: true, freshAgoMs: 1200 }) === 'window_minimized' && H({ minimized: true, freshAgoMs: 400 }) === null, 'minimized + no new picture for WINDOW_GAP_MS ⇒ window_minimized (not before)');
  ok(H({ covered: true, cls: 'Chrome_WidgetWin_1', freshAgoMs: 2500 }) === 'window_covered_idle' && H({ covered: true, cls: 'Notepad', freshAgoMs: 9000 }) === null && H({ covered: false, cls: 'Chrome_WidgetWin_1', freshAgoMs: 9000 }) === null, 'a covered Chromium window idle ⇒ window_covered_idle; a covered GDI window stays live (WGC still has it); a still window is just still');
}

console.log('§4 the plan, the helper\'s recipe, head and lines');
{
  const facts = (o = {}) => ({ platform: 'win32', helper: { ok: true, exe: 'C:\\h\\vibespace-wgc.exe' }, ffmpeg: { path: 'C:\\ff\\ffmpeg.exe', encoders: ['h264_nvenc', 'libx264'] }, displays: [{ id: '\\\\.\\DISPLAY2', hdr: true, white: 2500 }, { id: '\\\\.\\DISPLAY1', hdr: false, white: null }], ...o });
  const win = SW.windowSourceOf({ ...ROW, frame: [312, 208, 1409, 997] });
  const p = SP.planWindow(facts(), { window: win });
  ok(p.ok && p.mode === 'window-bgra' && p.fmt === 'bgra' && p.w === 1096 && p.h === 788 && p.fps === 30 && p.interval === 33 && p.relative && same(p.origin, { x: 0, y: 0 }) && p.encoder.id === 'h264_nvenc', 'the BGRA road by default (exact SDR, no mapper): even size, 30 fps ⇒ MinUpdateInterval 33 ms, window pixels (origin 0,0)', p);
  ok(SP.planWindow(facts(), { window: win, fps: 60 }).interval === 16, '60 fps ⇒ 16 ms');
  const f16 = SP.planWindow(facts(), { window: win, fp16: true });
  ok(f16.mode === 'window-f16' && f16.white === 2500, 'FP16 asked, the window on an HDR display ⇒ the FP16 road with that display\'s white');
  const sdr = SP.planWindow(facts(), { window: { ...win, display: '\\\\.\\DISPLAY1' }, fp16: true });
  ok(sdr.mode === 'window-bgra' && sdr.note === 'fp16_sdr_display', 'FP16 asked on an SDR display ⇒ BGRA (exact there), said');
  ok(SP.planWindow(facts({ platform: 'darwin' }), { window: win }).code === 'not_windows' && SP.planWindow(facts({ helper: { ok: false, code: 'helper_missing', error: 'csc said no' } }), { window: win }).error === 'csc said no'
    && SP.planWindow(facts({ ffmpeg: null }), { window: win }).code === 'no_ffmpeg' && SP.planWindow(facts(), { window: null }).code === 'window_gone'
    && SP.planWindow(facts({ ffmpeg: { path: 'f', encoders: [] } }), { window: win }).code === 'no_encoder', 'refused by name: not_windows, helper_missing (its sentence), no_ffmpeg, window_gone, no_encoder');
  ok(same(SP.wgcCaptureArgv(p), ['capture', '--hwnd', '657982', '--fmt', 'bgra', '--fps', '30', '--interval', '33']), 'the helper\'s argv: capture, the window, the format, the rate, MinUpdateInterval');
  // lane stream-cursor: WGC's IsCursorCaptureEnabled defaults to true; the helper sets it from `--cursor` (default "0") and the
  // agent never passes it ⇒ no pointer in the frames (the viewer's own pointer IS the pointer)
  const wgcCs = fs.readFileSync(path.join(REPO, 'tools/vibespace-wgc/vibespace-wgc.cs'), 'utf8');
  ok(/Sess\.IsCursorCaptureEnabled = Arg\("--cursor", "0"\) == "1";/.test(wgcCs) && !SP.wgcCaptureArgv(p).includes('--cursor') && !SP.wgcCaptureArgv(f16).includes('--cursor'), 'no pointer in the frames: the helper turns WGC\'s cursor capture off unless --cursor 1, which the agent never passes');
  const ea = SP.windowEncodeArgv(p, { w: 640, h: 480 }).join(' ');
  ok(/-f rawvideo -pix_fmt bgra -video_size 640x480 -framerate 30 -i pipe:0 -vf scale=out_color_matrix=bt709:out_range=tv,format=nv12 -c:v h264_nvenc/.test(ea) && /-f flv/.test(ea) && !/ddagrab/.test(ea), 'BGRA → the direct road\'s own conversion (BT.709 limited, NV12) → the encoder → FLV, at the CURRENT size', ea);
  ok(/-pix_fmt nv12 -video_size 640x480/.test(SP.windowEncodeArgv(f16, { w: 640, h: 480 }).join(' ')) && !SP.windowEncodeArgv(f16).includes('-vf'), 'the FP16 road hands the agent\'s mapped NV12 (no float conversion in ffmpeg)');
  const bp = SP.wgcBuildPlan({ windir: 'C:\\Windows', localAppData: 'C:\\Users\\u\\AppData\\Local', winmd: ['Windows.Foundation.winmd', 'Windows.Graphics.winmd', 'notes.txt'], hash: 'ab'.repeat(32) });
  ok(bp.ok && bp.csc === 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe' && bp.exe === 'C:\\Users\\u\\AppData\\Local\\vibespace\\helpers\\vibespace-wgc.exe' && same(bp.tries.map((t) => t.define), ['MINUPDATE;BORDER', 'BORDER', '']), 'the recipe: the in-box csc, into %LOCALAPPDATA%\\vibespace\\helpers, defines stepping down', bp.tries.map((t) => t.define));
  const a0 = bp.tries[0].argv;
  ok(a0.filter((x) => x.startsWith('/r:')).length === 5 && a0.includes('/r:C:\\Windows\\System32\\WinMetadata\\Windows.Graphics.winmd') && !a0.some((x) => /notes\.txt/.test(x)) && a0.includes('/define:MINUPDATE;BORDER') && !bp.tries[2].argv.some((x) => x.startsWith('/define')), 'every split winmd + the three facades (nothing else in that folder)');
  ok(SP.wgcBuildPlan({ windir: 'C:\\W', localAppData: 'C:\\L', winmd: ['Windows.winmd', 'Windows.Foundation.winmd'] }).tries[0].argv.filter((x) => /WinMetadata/.test(x)).length === 1, 'a union Windows.winmd is used alone');
  const miss = SP.wgcBuildPlan({ windir: 'C:\\W', localAppData: 'C:\\L', winmd: [] });
  ok(!miss.ok && miss.code === 'helper_missing' && miss.error.includes('csc.exe') && miss.error.includes('WinMetadata'), 'no metadata ⇒ helper_missing WITH the recipe');
  const hd = Buffer.alloc(16); hd.write('VSWF', 0, 'latin1'); hd.writeUInt32LE(1096, 4); hd.writeUInt32LE(788, 8); hd.writeUInt16LE(1, 12); hd[14] = 4;
  ok(same(SP.wgcHead(hd), { w: 1096, h: 788, bpp: 4, fresh: true, bytes: 1096 * 788 * 4 }), 'a frame head → its size, fresh flag, bytes');
  const bad = Buffer.from(hd); bad[0] = 0x58; const huge = Buffer.from(hd); huge.writeUInt32LE(99999, 4); const bpp = Buffer.from(hd); bpp[14] = 3;
  ok(SP.wgcHead(bad).bad && SP.wgcHead(huge).bad && SP.wgcHead(bpp).bad, 'a head that is not ours / out of bounds ⇒ bad (the stream is lost)');
  ok(SP.wgcLine('{"ev":"size","w":2,"h":2}').ev === 'size' && SP.wgcLine('csc noise') === null && SP.wgcLine('{"x":1}') === null && SP.wgcLine('{bad') === null, 'a helper line → its event; anything else ⇒ null');
}

console.log('§4b THE WINDOW ROAD\'S RATE (lane stream-window-fixes — every road\'s since lane stream-mac-rate: SP.kbpsFloor / SP.rateDecision): the floor table, the owner\'s session replayed, the intra-refresh wave');
{
  const F = (w, h, fps = 30, cap = 8000) => SP.kbpsFloor({ w, h, fps, cap });
  ok(same([F(640, 480), F(1280, 800), F(1920, 1200), F(2560, 1600), F(2698, 2078)], [1000, 2500, 4000, 6000, 8000]), 'THE TABLE at 30 fps: ≤ 0.3 MP 1000 · ≤ 1 MP 2500 · ≤ 2.3 MP 4000 · ≤ 4.1 MP 6000 · larger (the owner\'s 2698×2078 Lightroom window) 8000 kbps');
  ok(F(1920, 1080, 60, 50000) === 6000 && F(1920, 1080, 45, 50000) === 5000 && F(2698, 2078, 60, 50000) === 12000, '60 fps ⇒ the 60 column; between, interpolated');
  ok(F(2698, 2078, 30, 5000) === 5000 && F(10, 10, 30, 8000) === 1000 && F(0, 0) >= SP.SCREEN_DEFAULTS.minKbps, 'never over the session\'s cap; a tiny window has the first row');
  const old = SP.kbpsDecision({ current: 8000, target: 280, cap: 8000, lastAt: 0, now: 5000 });
  const owner = SP.kbpsDecision({ current: 8000, target: 280, cap: 8000, lastAt: 0, now: 5000, floor: F(2698, 2078) });
  const pad = SP.kbpsDecision({ current: 8000, target: 280, cap: 8000, lastAt: 0, now: 5000, floor: F(2100, 1400) });
  ok(old.change && old.kbps === 300 && !owner.change && pad.change && pad.kbps === 6000, 'the owner\'s session replayed (8000 kbps; 5 s in, werift echoes a still window\'s trickle — 280): no floor ⇒ 300 kbps (what his agent logged); his window\'s floor ⇒ no change; a 2100×1400 window ⇒ 6000', { old, owner, pad });
  ok(SP.kbpsDecision({ current: 6000, target: 9000, cap: 8000, lastAt: 0, now: 6000, floor: 6000 }).kbps === 8000, 'kbpsDecision: an estimate above still climbs, to the cap');
  // THE RATE RULE: werift's samples judged against what the source SENT (the median of the last 2 s)
  const R = (o) => SP.rateDecision({ current: 8000, cap: 8000, floor: 6000, samples: [9800, 6200, 14000, 976, 10100, 8900, 12500], sentKbps: 7400, lastAt: 0, shortAt: 0, shortSince: 7000, now: 10000, ...o });
  ok(!R().change && R().why === 'echo' && R().median === 9800, 'lossless noise (the replayed samples of a real 7.4 Mbps stream: 976 … 14000, median 9800) ⇒ an echo: nothing changes — the old rule took the 976', R());
  const sf = R({ samples: [3000, 3400, 2900, 3100, 3300], sentKbps: 7400 });
  ok(sf.change && sf.kbps === 6000 && sf.why === 'shortfall' && R({ floor: 1000, samples: [3000, 3400, 2900, 3100, 3300] }).kbps === 3100, 'the median clearly under what was sent, for 2 s (a bottleneck: the link receives less — it drops or queues) ⇒ down to it, never under the floor', sf);
  const hd = R({ samples: [3000, 3400, 2900, 3100, 3300], shortSince: 0 });
  ok(!hd.change && hd.why === 'hold' && hd.shortSince === 10000 && !R({ samples: [3000, 3400, 2900, 3100, 3300], shortSince: 8500 }).change && R({ samples: [6000, 6100, 5900, 6050, 5950] }).why === 'echo', 'a shortfall must HOLD 2 s before it acts (a sampling dip — NVENC\'s refresh cycle swings the sent rate — does not); 0.8 × sent is still an echo (the line: 0.75)', hd);
  ok(!R({ current: 6000, samples: [7000, 7100, 7200, 6900, 7050], sentKbps: 9500 }).change, 'a shortfall never raises the rate (its median above the current rate)');
  ok(R({ samples: [3000, 3000, 3000, 3000] }).why === 'wait' && R({ sentKbps: 0 }).why === 'wait' && R({ lastAt: 9000 }).why === 'wait', 'fewer than 5 samples, nothing sent (a minimized window), or within 2 s of the last change ⇒ wait');
  ok(R().shortSince === 0, 'an echo ends a shortfall streak');
  const up = R({ current: 6000, lastAt: 0, shortAt: 0, now: 25000 });
  ok(up.change && up.kbps === 7500 && up.why === 'recover' && !R({ current: 6000, shortAt: 10000, now: 25000 }).change && !R({ current: 8000, now: 60000 }).change, '20 s with no shortfall below the cap ⇒ one 25 % step back up (7500); a recent shortfall holds it; at the cap nothing', up);
  const facts = { platform: 'win32', helper: { ok: true, exe: 'h.exe' }, ffmpeg: { path: 'f.exe', encoders: ['h264_nvenc'] }, displays: [] };
  const win = SW.windowSourceOf({ ...ROW, frame: [0, 0, 2698, 2078] });
  const pn = SP.planWindow(facts, { window: win });
  const argvOf = (encoders) => SP.windowEncodeArgv(SP.planWindow({ ...facts, ffmpeg: { path: 'f.exe', encoders } }, { window: win })).join(' ');
  ok(pn.refresh && pn.floor === 8000 && pn.kbps === 8000 && /-c:v h264_nvenc -preset p1 -tune ull -rc cbr -zerolatency 1 -delay 0 -rc-lookahead 0 -intra-refresh 1 -profile:v baseline -bf 0 -g 60 /.test(argvOf(['h264_nvenc'])), 'NVENC: the intra-refresh wave (-intra-refresh 1; -g 60 = its period), -rc-lookahead 0, -bf 0; the floor rides the plan', argvOf(['h264_nvenc']));
  ok(/-intra-refresh 1/.test(argvOf(['libx264'])) && !/-intra-refresh/.test(argvOf(['h264_amf'])) && !/-intra-refresh/.test(argvOf(['h264_qsv'])) && !SP.planWindow({ ...facts, ffmpeg: { path: 'f', encoders: ['h264_amf'] } }, { window: win }).refresh, 'x264 too (measured on the lane\'s box: one key frame in 180); AMF / Quick Sync keep the 2 s GOP (no machine of ours has one)');
  ok(!/-intra-refresh/.test(SP.directArgv({ display: { output: 0 }, fps: 30, kbps: 8000, gop: 60, encoder: SP.ENCODER_LADDER[0] }).join(' ')), 'the whole screen\'s road is unchanged');
}

console.log('§4c THE STATS ROW\'s facts (lane stream-window-fixes: one row for both stream windows)');
{
  const page = { rttMs: 4, jitterMs: 2, fps: 29, decodeMs: 1.5, kbps: 5400, path: 'relay' };
  const n = SM.streamNumbersOf(page, { screen: { encoder: 'NVENC', encodeMs: 9, kbps: 6000, floor: 6000 } }, 'udp');
  ok(same(n, { rtt: 4, jitter: 2, fps: 29, decode: 1.5, kbps: 5400, via: 'udp', encoder: 'NVENC', encodeMs: 9, rate: { kbps: 6000, floor: 6000 } }), 'the page\'s numbers + the relay path + the machine\'s encoder + a window\'s rate over its floor', n);
  ok(SM.streamNumbersOf(null) === null && SM.streamNumbersOf({ rttMs: NaN }, null, 'direct').rtt === null && SM.streamNumbersOf({}, null, 'direct').via === null && SM.streamNumbersOf({}, { screen: { encoder: 'x264' } }).rate === null, 'no numbers yet ⇒ null; a non-number ⇒ null (shown —); direct names no path; a screen source has no rate');
  const lib = fs.readFileSync(path.join(REPO, 'src/lib/stream-stats.js'), 'utf8'), md = fs.readFileSync(path.join(REPO, 'src/lib/machine-desktop.js'), 'utf8'), ma = fs.readFileSync(path.join(REPO, 'src/lib/machine-app.js'), 'utf8');
  ok(/import \{ createStreamStats \} from '\.\/stream-stats\.js'/.test(md) && /import \{ createStreamStats \} from '\.\/stream-stats\.js'/.test(ma) && /const stats = createStreamStats\(\{ machine, hostId: m\.hostId, summary: chip, frame: pane \}\);\n  const fwEl = stats\.firewall;/.test(md) && /statsRow\.append\(stats\.firewall\)/.test(ma) && /streamNumbersOf\(page, agent, via\)/.test(lib), 'ONE component: the whole screen\'s strip and a window\'s stream both mount src/lib/stream-stats.js (its numbers ride streamNumbersOf — lane stream-stats-popup: into each chip\'s title and the details, scripts/test-stream-stats.mjs §9)');
}

console.log('§5 the rung\'s window branch; the client never asks an old daemon');
{
  const caps = ['stream-offer', 'input-events', 'stream-facts', 'stream-screen'];
  ok(SM.STREAM_SOURCES.includes('window'), 'STREAM_SOURCES names window');
  const old = SM.streamRungVerdict({ capabilities: caps, desktop: true, platform: 'win32', want: 'window' });
  ok(!old.take && old.code === 'agent_too_old', 'an agent of the screen stream without `stream-window` ⇒ agent_too_old', old);
  const yes = SM.streamRungVerdict({ capabilities: [...caps, 'stream-window'], desktop: true, platform: 'win32', want: 'window', fakeSource: '/x.h264' });
  ok(yes.take && yes.source === 'window' && yes.sourceId === null && SM.streamSourceOf({ kind: 'window', id: '657982' }).id === '657982', 'with it ⇒ take, source window (a window asked wins over the instance\'s fake screen); the id is the page\'s (streamSourceOf — int304: the start body `source: {kind:\'window\', id}`)', yes);
  ok(SM.streamRungVerdict({ capabilities: ['stream-window'], desktop: true, platform: 'win32', want: 'window' }).code === 'agent_too_old', 'the rung\'s own needs first (no stream-offer ⇒ agent_too_old)');
  ok(SM.streamRungVerdict({ capabilities: [...caps, 'stream-window'], desktop: true, platform: 'linux', want: 'window' }).code === 'no_window_source', 'a platform with no window source ⇒ no_window_source');
  ok(SM.streamRungVerdict({ capabilities: [...caps, 'stream-window'], desktop: true, platform: 'win32' }).source === 'screen', 'no window asked ⇒ the screen, as before');
  const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
  const asked = [];
  const fake = (capabilities) => Object.assign(Object.create(DeviceManager.prototype), { connect: async () => ({ info: { capabilities, daemonVersion: '2.369.299' } }), _request: async (m) => { asked.push(m); return { result: { ok: true, windows: [] } }; } });
  let err = null; try { await fake(caps).streamWindows(); } catch (e) { err = e; }
  ok(err && err.code === 'host_needs_daemon' && err.daemonVersion === '2.369.299' && asked.length === 0, 'an old daemon: host_needs_daemon + its version, and NOTHING sent (an unknown op hangs)');
  let err2 = null; try { await fake([...caps, 'stream-mac', 'stream-window']).streamWindows(); } catch (e) { err2 = e; }
  ok(err2 && err2.code === 'host_needs_daemon' && asked.length === 0, 'a .301–.303 agent (stream-window, no stream-windows — it has no such op) is never asked either (int304)');
  const r = await fake([...caps, 'stream-window', 'stream-windows']).streamWindows({ restore: '42' });
  ok(r.ok && asked.length === 1 && asked[0].op === 'stream-windows' && asked[0].restore === '42', 'a capable daemon is asked `stream-windows` (restore carried)', asked);
}

console.log('§6 THE HELPER BUILD on the machine (the real path; a fake csc)');
{
  const root = scratch('stream-window-build');
  fs.mkdirSync(root, { recursive: true });
  // the agent builds Windows paths with backslashes: on this box each is ONE file name inside `root`
  const windir = path.join(root, 'win'), lad = path.join(root, 'lad');
  const wm = `${windir}\\System32\\WinMetadata`; // the agent lists THIS folder (readdir), so its files go inside it
  fs.mkdirSync(wm, { recursive: true });
  for (const f of ['Windows.Foundation.winmd', 'Windows.Graphics.winmd']) fs.writeFileSync(path.join(wm, f), '');
  const log = path.join(root, 'csc.log');
  const csc = writeFakeCsc(`${windir}\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe`, { log, refuse: 'MINUPDATE;BORDER' });
  let text = '// vibespace-wgc v1';
  const lines = [];
  const mk = () => WS.createWindowSource({ platform: 'win32', spawn: cp.spawn, execFile: cp.execFile, env: process.env, lookupEnv: { WINDIR: windir, LOCALAPPDATA: lad }, log: (l) => lines.push(l), sourceText: () => text });
  const h1 = await mk().helper();
  const calls = () => fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  ok(h1.ok && h1.built && h1.define === 'BORDER' && h1.exe === `${lad}\\vibespace\\helpers\\vibespace-wgc.exe` && fs.existsSync(h1.exe), 'built ON the machine into %LOCALAPPDATA%\\vibespace\\helpers — a refused define (no MinUpdateInterval) steps down to BORDER', h1);
  ok(calls().length === 2 && fs.readFileSync(`${lad}\\vibespace\\helpers\\vibespace-wgc.cs`, 'utf8') === text && /vibespace-wgc [0-9a-f]{16}/.test(fs.readFileSync(`${lad}\\vibespace\\helpers\\vibespace-wgc.stamp`, 'utf8')), 'the source written beside it, the stamp = its digest');
  const h2 = await mk().helper();
  ok(h2.ok && !h2.built && calls().length === 2, 'a second agent (a restart) finds it built: the stamp matches, csc is not run');
  text = '// vibespace-wgc v2';
  const h3 = await mk().helper();
  ok(h3.ok && h3.built && calls().length === 4, 'a changed helper source (an upgrade) rebuilds it');
  const s4 = WS.createWindowSource({ platform: 'win32', spawn: cp.spawn, execFile: cp.execFile, lookupEnv: { WINDIR: path.join(root, 'nowin'), LOCALAPPDATA: lad }, sourceText: () => text });
  const h4 = await s4.helper();
  const src4 = await s4.source({ sourceId: '657982' });
  ok(!h4.ok && h4.code === 'helper_missing' && /the recipe/.test(h4.error) && src4.code === 'helper_missing', 'no Windows metadata ⇒ helper_missing with the recipe — the session is refused by that name', h4);
  fs.writeFileSync(csc.cfgFile, JSON.stringify({ log, refuse: '' })); // every define refused? no: '' = the last try only
  ok(lines.some((l) => /window helper built \(BORDER\)/.test(l)), 'the build is logged with its define');
  ok((await WS.createWindowSource({ platform: 'linux' }).helper()).code === 'not_windows', 'off Windows ⇒ not_windows (nothing built)');
}

console.log('§7 THE REAL SOURCE, end to end (a fake helper, a fake ffmpeg)');
{
  const root = scratch('stream-window-src');
  const ffLog = path.join(root, 'ffmpeg.log'), wgcLog = path.join(root, 'wgc.log');
  const ff = writeFakeFfmpeg(path.join(root, 'ff'), { fixture: path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264'), log: ffLog, encoders: ['h264_nvenc'], nv12: path.join(root, 'first-frame.raw') });
  const W0 = { w: 320, h: 240, frame: [-3840 + 40, 30, -3840 + 360, 270], dpi: 96 };
  const wgc = writeFakeWgc(path.join(root, 'wgc'), { log: wgcLog, windows: [{ ...ROW, frame: W0.frame, dpi: 96 }, { ...ROW, hwnd: '77', title: 'Edge', cls: 'Chrome_WidgetWin_1' }, { ...ROW, hwnd: '78', title: 'a tool', tool: true }], capture: { ...W0, script: [] } });
  const logs = [];
  const mkSrc = () => WS.createWindowSource({ platform: 'win32', spawn: cp.spawn, execFile: cp.execFile, env: process.env, log: (l) => logs.push(l), helperPath: wgc.exe,
    screenFacts: async () => ({ ok: true, ffmpeg: { path: ff.exe, encoders: ['h264_nvenc'] }, displays: [{ id: '\\\\.\\DISPLAY1', hdr: false }] }) });
  const S = mkSrc();
  const list = await S.windows();
  ok(list.ok && same(list.windows.map((w) => w.id), ['657982', '77']), 'the picker\'s list = the helper\'s facts through windowPickRows (the tool window dropped)', list);
  const rs = await S.restore('657982');
  ok(rs.ok && rs.window.id === '657982' && rs.window.minimized === false && fs.readFileSync(wgcLog, 'utf8').includes('["restore","--hwnd","657982"]'), '「还原它」 = the helper\'s restore of that window');
  ok((await S.restore('nope')).code === 'bad_window' && (await S.restore('999')).code === 'window_gone', 'restore: a bad id is refused, a closed window says window_gone');
  ok((await S.source({ sourceId: '999' })).code === 'window_gone', 'a session for a window that closed ⇒ window_gone before anything starts');

  // ① start → access units; ② a size change restarts the encoder at the new size; ③ minimized ⇒ held, back ⇒ live
  wgc.set({ capture: { ...W0, script: [{ at: 700, size: { w: 400, h: 300 } }, { at: 1300, fresh: false, ev: { ev: 'window', min: true, frame: [-32000, -32000, -31840, -31972], display: '\\\\.\\DISPLAY1', dpi: 96, covered: false } }, { at: 3000, fresh: true, ev: { ev: 'window', min: false, frame: [-3840 + 40, 30, -3840 + 440, 330], display: '\\\\.\\DISPLAY1', dpi: 96, covered: false } }] } });
  const src = await S.source({ sourceId: '657982' });
  ok(src.ok && src.kind === 'window' && src.relative && same(src.origin, { x: 0, y: 0 }) && src.window.title === 'wgc pad' && src.mode === 'window-bgra', 'the source: kind window, relative (window pixels), its window\'s facts for the offer', src.window);
  ok(same(src.bounds(), { x: -3800, y: 30, w: 320, h: 240 }), 'its live bounds start at the facts\' frame (the second display: negative x)');
  const aus = [], ends = [];
  src.start((au) => aus.push(au), (code) => ends.push(code));
  ok(await until(() => aus.length >= 3), 'access units flow (helper → BGRA → encoder → FLV → units)', { aus: aus.length, logs });
  ok(aus[0].key && aus[0].nalus.some((n) => (n[0] & 0x1f) === 7), 'the first unit is a key frame with its SPS');
  ok(fs.statSync(path.join(root, 'first-frame.raw')).size === 320 * 240 * 4, 'the encoder was fed whole BGRA frames of the window\'s size (320×240×4)');
  ok(await until(() => src.stats().sizes === 1 && src.stats().w === 400), 'a size change ⇒ the encoder restarted at the new size', src.stats());
  const sizesOf = () => fs.readFileSync(ffLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((a) => a.includes('pipe:0')).map((a) => a[a.indexOf('-video_size') + 1]);
  await until(() => sizesOf().length >= 2, 1000); // the new encoder logs its argv as it starts
  ok(same(sizesOf(), ['320x240', '400x300']), 'one encoder per size: 320x240, then 400x300', sizesOf());
  const n0 = aus.length;
  ok(await until(() => aus.length > n0 + 2), 'units keep flowing after the restart');
  ok(await until(() => src.stats().held === 'window_minimized', 3000), 'minimized (no new picture for 1 s) ⇒ held window_minimized — the session lives on', src.stats());
  ok(src.stats().window.minimized === true && ends.length === 0, 'the stats say minimized; nothing ended');
  ok(await until(() => src.stats().held === null, 3000) && same(src.bounds(), { x: -3800, y: 30, w: 400, h: 300 }), 'restored ⇒ live again; the live bounds follow the window line', { b: src.bounds(), st: src.stats().held });
  ok(src.stats().fresh > 0 && src.stats().captured >= src.stats().fresh && src.stats().encoder === 'NVENC', 'the stats count frames, new pictures, the encoder');
  src.stop();
  await sleep(150);
  ok(ends.length === 0, 'stop ends nothing by name (the host stopped it)', ends);

  // ④ the window closes ⇒ window_gone; ⑤ the helper dies ⇒ helper_exited (its last line kept in the log)
  wgc.set({ capture: { ...W0, script: [{ at: 300, ev: { ev: 'gone', hwnd: '657982' }, exit: 3 }] } });
  const g = await mkSrc().source({ sourceId: '657982' }); const gEnds = [];
  g.start(() => { }, (c) => gEnds.push(c));
  ok(await until(() => gEnds.length > 0) && gEnds[0] === 'window_gone', 'the window closed ⇒ ended window_gone', gEnds);
  wgc.set({ capture: { ...W0, script: [{ at: 300, exit: 1, stderr: '{"ev":"error","mode":"capture","error":"0x887A0005 the device was removed"}' }] } });
  const d = await mkSrc().source({ sourceId: '657982' }); const dEnds = [];
  logs.length = 0;
  d.start(() => { }, (c) => dEnds.push(c));
  ok(await until(() => dEnds.length > 0) && dEnds[0] === 'helper_exited' && logs.some((l) => /helper exit 1: 0x887A0005/.test(l)), 'the helper died ⇒ ended helper_exited, its last error in the log', { dEnds, logs });
  const m = WS.createWindowSource({ platform: 'win32', spawn: cp.spawn, execFile: cp.execFile, helperPath: path.join(root, 'no-such-helper.exe'), screenFacts: async () => ({ ok: true, ffmpeg: { path: ff.exe, encoders: ['h264_nvenc'] }, displays: [] }) });
  ok((await m.source({ sourceId: '657982' })).code === 'facts_failed' && (await m.windows()).code === 'facts_failed', 'a helper that cannot run ⇒ refused by name (facts_failed), never a hang');

  // ⑥ lane stream-window-fixes: a CJK + emoji title intact (the helper's JSON is ASCII — \uXXXX, surrogate pairs too — read as UTF-8)
  const CJK = '中文窗口 🎨 测试';
  wgc.set({ windows: [{ ...ROW, title: CJK, frame: W0.frame, dpi: 96 }], capture: { ...W0, script: [] } });
  const lc = await mkSrc().windows();
  const sc = await mkSrc().source({ sourceId: '657982' });
  ok(lc.ok && lc.windows[0].title === CJK && sc.ok && sc.window.title === CJK, '⑥ a CJK + emoji title comes through the picker\'s list and the offer\'s window facts intact', { list: lc.windows && lc.windows[0] && lc.windows[0].title, offer: sc.window && sc.window.title });
  sc.stop('closed');

  // ⑦ the stop BY NAME: stdin first (the helper releases the window — its `end` line — and exits 0, the encoder flushes), one
  //    log line with each exit; a helper that never notices is killed after the grace
  const pidFile = path.join(root, 'wgc.pid');
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  wgc.set({ windows: [{ ...ROW, frame: W0.frame, dpi: 96 }], capture: { ...W0, pidFile, script: [] } });
  logs.length = 0;
  const s7 = await mkSrc().source({ sourceId: '657982' }); const a7 = [], e7 = [];
  s7.start((au) => a7.push(au), (code) => e7.push(code));
  await until(() => a7.length >= 2);
  const pid7 = Number(fs.readFileSync(pidFile, 'utf8'));
  s7.stop('closed');
  ok(await until(() => !alive(pid7), 3000), '⑦ stop: the helper is gone (its exit code below says it left on its own — it saw its stdin close — before the grace kill)');
  ok(await until(() => logs.some((l) => /window source ended: closed — helper exit 0, encoder exit 0 in \d+ ms \(the helper released the window: stdin\)/.test(l))), '⑦ ONE log line names the end (closed = the window\'s ×) with the helper\'s and the encoder\'s exits and the helper\'s release', logs.filter((l) => /ended/.test(l)));
  ok(e7.length === 0, '⑦ a stop by the host ends nothing by a name of its own (the host named it)', e7);
  wgc.set({ capture: { ...W0, pidFile, ignoreStdin: true, script: [] } });
  logs.length = 0;
  const s8 = await mkSrc().source({ sourceId: '657982' }); const a8 = [];
  s8.start((au) => a8.push(au), () => { });
  await until(() => a8.length >= 2);
  const pid8 = Number(fs.readFileSync(pidFile, 'utf8'));
  s8.stop('viewer_gone');
  ok(await until(() => !alive(pid8), 4000), '⑦ a helper that never notices its stdin is killed by the grace (STOP_GRACE_MS) — never an orphan');
  ok(await until(() => logs.some((l) => /window source ended: viewer_gone — helper exit SIGTERM, encoder exit 0 in \d+ ms/.test(l))), '⑦ …and the line says it had to be killed', logs.filter((l) => /ended/.test(l)));

  // ⑧ THE RATE on the real source: the intra-refresh wave on the encoder's argv; werift's low estimate never under the window's
  //    floor; a viewer's key-frame ask restarts the encoder (no periodic key frame), at most every 2 s
  let skew = 0;
  wgc.set({ capture: { ...W0, script: [], pace: 120 } }); // the plan stays 30 fps (the floor's); the fake writes 120 a second (lane fast-debt-clear)
  const s9 = await WS.createWindowSource({ platform: 'win32', spawn: cp.spawn, execFile: cp.execFile, env: process.env, log: (l) => logs.push(l), helperPath: wgc.exe, now: () => Date.now() + skew,
    screenFacts: async () => ({ ok: true, ffmpeg: { path: ff.exe, encoders: ['h264_nvenc'] }, displays: [{ id: '\\\\.\\DISPLAY1', hdr: false }] }) }).source({ sourceId: '657982' });
  fs.writeFileSync(ffLog, '');
  const a9 = [];
  s9.start((au) => a9.push(au), () => { });
  await until(() => a9.length >= 2);
  const encArgv = () => fs.readFileSync(ffLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.includes('pipe:0'));
  ok(encArgv()[0].join(' ').includes('-c:v h264_nvenc') && encArgv()[0].includes('-intra-refresh') && s9.stats().refresh === 'intra', '⑧ the window road\'s NVENC refreshes by an intra-refresh wave (no periodic key frame)', encArgv()[0]);
  ok(s9.stats().floor === 1000 && s9.stats().kbps === 8000, '⑧ a 320×240 window\'s floor (1000 at 30 fps); the start at the session\'s cap', s9.stats());
  // 40 units at the moved clock, then six samples: the rule weighs the BYTES sent inside its 2 s window, so 40 units weigh
  // what they weighed at 30 a second (the fixture's ~166 kbps over ~1.3 s) — paced at 120 they come in ~0.33 s (lane fast-debt-clear)
  const feed = async (kbps) => { const n0 = a9.length; await until(() => a9.length > n0 + 40, 4000); for (let i = 0; i < 6; i++) s9.setTargetKbps(kbps); };
  skew += 6000; await feed(1e6);
  ok(s9.stats().restarts === 0 && s9.stats().rate.why === 'echo', '⑧ samples at or above what was sent = werift\'s echo ⇒ nothing changes', s9.stats().rate);
  skew += 6000; await feed(50);
  ok(s9.stats().restarts === 0 && s9.stats().rate.why === 'hold', '⑧ a shortfall seen once holds (not yet 2 s)', s9.stats().rate);
  skew += 2100; await feed(50);
  ok(s9.stats().kbps === 1000 && s9.stats().restarts === 1 && logs.some((l) => /encoder restarted at 1000 kbps \(shortfall: the estimate's median 50 kbps, floor 1000\)/.test(l)), '⑧ samples far under what was sent (a real shortfall: 50 vs ~166 kbps) ⇒ the encoder restarts at the window\'s floor, 1000 — the old rule\'s minimum was 300', s9.stats());
  await until(() => encArgv().length >= 2);
  ok(encArgv().slice(-1)[0].join(' ').includes('-b:v 1000k'), '⑧ the restarted encoder runs at 1000k', encArgv().slice(-1)[0].join(' '));
  skew += 6000; await feed(20);
  ok(s9.stats().restarts === 1, '⑧ lower again: already at the floor — no restart');
  const n9 = a9.length; await until(() => a9.length > n9 + 1);
  skew += 3000; s9.requestKeyframe();
  const k9 = a9.length;
  ok(s9.stats().keyRestarts === 1, '⑧ a viewer\'s key-frame ask (PLI) restarts the encoder — its first picture is the key frame', s9.stats());
  await until(() => a9.length > k9);
  ok(a9[k9] && a9[k9].key, '⑧ the next access unit IS a key frame');
  s9.requestKeyframe();
  ok(s9.stats().keyRestarts === 1, '⑧ a second ask within 2 s restarts nothing');
  s9.stop('closed');
}

console.log('§8 THE THREE TOUCHES (the op) and the host\'s input shift');
{
  const ag = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8'), cl = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8'), host = fs.readFileSync(path.join(REPO, 'src/agentd/stream-host.js'), 'utf8');
  ok(/capabilities: \[[^\]]*'stream-screen', 'stream-mac', 'stream-window', 'stream-windows', 'settings-open', 'desktop-grab', 'desktop-input'\]/.test(ag), 'the hello-ack says stream-window, then the picker op\'s own stream-windows (int304), then 「打开系统设置」\'s settings-open (lane stream-mac-stall), then the hand-over\'s desktop-grab / desktop-input (lane desktop-handover)');
  ok(/if \(msg\.op === 'stream-windows'\) \{[\s\S]{0,600}op: 'stream-windows-result', id: msg\.id, result: r[\s\S]{0,200}op: 'stream-windows-result', id: msg\.id, error/.test(ag), 'the handler answers with `op` on its reply (result and error alike)');
  ok(/m\.op === 'stream-windows-result'/.test(cl) && /async streamWindows\([\s\S]{0,500}includes\?\.\('stream-windows'\)/.test(cl), 'the client routes the reply by id and gates its method on the capability');
  ok(/const windowsOf = \(\) => \{ const sc = streamScreenOf\(\); return typeof sc\.windows === 'function' \? sc : streamWindowOf\(\); \};/.test(ag) && /window: \(msg, o\) => windowsOf\(\)\.source\(msg, o\)/.test(ag) && /if \(msg\.op === 'stream-windows'\) \{\s*const sw = windowsOf\(\);/.test(ag) && /SOURCES = Object\.freeze\(\{[\s\S]{0,400}window: \(msg, o, f\) => \(f\.window \? f\.window\(msg, o\)/.test(host), 'the stream host takes the agent\'s window factory as the `window` kind, and the picker op asks the same one (int304: a Mac\'s screen source carries its windows; else the WGC source)');
  const WSRC = require(path.join(REPO, 'src/agentd/wgc-helper-source.js')), csText = fs.readFileSync(path.join(REPO, 'tools/vibespace-wgc/vibespace-wgc.cs'), 'utf8');
  ok(WSRC.SOURCE === csText && WSRC.SHA256 === require('crypto').createHash('sha256').update(csText).digest('hex') && WS.wgcSourceText() === csText && !/loader:\.cs=/.test(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')), 'src/agentd/wgc-helper-source.js IS tools/vibespace-wgc/vibespace-wgc.cs — a plain module in the agent bundle, no esbuild loader (int304: the Mac helper\'s way; run node scripts/wgc-helper-embed.mjs after editing the C#)');
  ok(/if \(s\.source && s\.source\.relative && typeof s\.source\.bounds === 'function'\) ev = SW\.windowInputOf\(ev, s\.source\.bounds\(\)\)/.test(host), 'a relative source\'s pointer events get its LIVE bounds (windowInputOf) before the injector');
  ok(/try \{ s\.source && s\.source\.stop\(why\); \}/.test(host) && /streamHost\.stop\(String\(msg\.sid \|\| ''\), \/\^\[a-z_\]\{1,40\}\$\/\.test\(String\(msg\.why \|\| ''\)\) \? msg\.why : 'stopped'\)/.test(ag) && /op: 'stream-stop', sid, \.\.\.\(why \? \{ why \} : \{\}\)/.test(cl), 'lane stream-window-fixes: the end\'s name rides the stop — the client\'s op carries `why`, the agent checks its shape, the host hands it to the source');
  ok(/c < 0x20 \|\| c > 0x7e\) b\.Append\("\\\\u"\)/.test(csText) && /new StreamWriter\(mode == "capture" \? Console\.OpenStandardError\(\) : Console\.OpenStandardOutput\(\), new UTF8Encoding\(false\)\)/.test(csText) && !/Log = Console\.(Out|Error)/.test(csText) && /S\("ev", "end"\)/.test(csText), 'the helper\'s JSON is ASCII (every character past 0x7E as \\uXXXX — no code page can garble it) through a UTF-8 writer without a BOM; capture says `end` as it releases the window');
  const routes = fs.readFileSync(path.join(REPO, 'src/routes/desktop-apps.js'), 'utf8');
  ok(/res\.on\('close', \(\) => \{ if \(!res\.writableFinished\) wr\.pollGone\(key\); \}\)/.test(routes) && /res\.json\(await wr\.stopWindow\(host, id, why\)\)/.test(routes) && /streaming: on\.has\(String\(w\.id\)\)/.test(routes), 'the routes: a long poll closed before its answer tells the hub (pollGone); stop by {host, window}; the list marks the windows a stream shows');
}

console.log('§9 THE HUB (lane stream-window-fixes): a stop names its end; the viewer gone ⇒ stopped in seconds; the picker\'s 停止');
{
  const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
  const calls = [];
  let n = 0;
  const dm = { streamOffer: async (p) => ({ ok: true, sid: 'sid-' + (++n), offer: { type: 'offer', sdp: 'v=0\r\n' }, source: { kind: 'window', origin: { x: 0, y: 0 }, window: { id: String(p.sourceId) } } }), streamStop: async (sid, o) => { calls.push([sid, o && o.why]); return { stopped: true }; } };
  const access = { streamRung: async (h, o) => ({ take: true, source: o && o.want === 'window' ? 'window' : 'screen', sourceId: null, dm, platform: 'win32' }) };
  const wr = DW.create({ access, log: { log() { }, warn() { } }, relay: false, goneMs: 150, ips: () => [] });
  const a = await wr.start('win-a', { source: { kind: 'window', id: '657982' } }), b = await wr.start('win-a', { source: { kind: 'window', id: '77' } }), c = await wr.start('win-a', { source: { kind: 'window', id: '657982' } });
  ok(a.take && b.take && c.take && same(wr.facts('win-a').map((s) => s.windowId), ['657982', '77', '657982']), 'each session records the window it shows (the start body\'s id — a Mac\'s too)');
  wr.pollGone(b.key);
  await sleep(60); await wr.poll(b.key, 0, 99, 0);
  await sleep(200);
  ok(wr.facts('win-a').some((s) => s.key === b.key), 'a poll closed unanswered, then a NEW poll inside goneMs (a reload, a proxy\'s cut) ⇒ it lives on');
  wr.pollGone(b.key);
  await until(() => !wr.facts('win-a').some((s) => s.key === b.key), 2000);
  ok(!wr.facts('win-a').some((s) => s.key === b.key) && calls.some(([sid, why]) => sid === b.sid && why === 'viewer_gone'), 'no new poll within goneMs (the tab closed, the browser quit) ⇒ stopped viewer_gone — the machine is told why', calls);
  const r = await wr.stopWindow('win-a', '657982');
  ok(r.sessions === 2 && r.stopped === 2 && wr.facts('win-a').length === 0 && calls.filter(([, why]) => why === 'stopped_in_list').length === 2, 'the picker\'s 停止 = every session of that window (whichever browser opened it), named stopped_in_list', { r, calls });
  const d = await wr.start('win-a', { source: { kind: 'window', id: '5' } });
  await wr.stop(d.key, 'stopped');
  ok(calls.some(([sid, why]) => sid === d.sid && why === 'stopped') && (await wr.stopWindow('win-a', '5')).sessions === 0, 'a page\'s stop names its end for the machine (停止串流 = stopped; the window\'s × = closed); a window nobody streams stops nothing');
  ok(SM.STREAM_LIMITS.goneMs === 3000, 'goneMs = 3 s: with the agent\'s stop (≤ 1 s grace) the machine ends the capture inside 5 s of the viewer going');
  wr.shutdown();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
