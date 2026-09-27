#!/usr/bin/env node
// LANE S4 — THE LIVE VIEW FITS ITS PANE (fast). Naive-user study 2 (2026-09-26,
// all three testers): "实况画面只占窗格上面一截" — the picture used the top 40–60 %
// of the pane, black below (the page rendered at the stream's fixed viewport);
// "手机上的实况窗口" — 390 wide: the page at desktop width shrunk into a ~260 px
// strip, a 20 px "Pricing" link, no pinch, no auto-open, the only entrance an
// off-screen chip; and a live view that "stays blank white while the URL bar
// shows the new page".
//
//   ① the PURE rules (src/browser-fit.js) — pane → viewport (CSS px, never device
//      px; the aspect kept at a bound; the headed floor), THE RULE for several
//      viewers (the holder's pane while somebody drives, else the largest
//      visible; hidden ones never vote), the verdict (agent-set ⇒ letterbox,
//      `force` takes it back, the restore), OUR mirror vs the AGENT's over the
//      MEASURED 0.38.1 shapes (scripts/fixtures/browser-stream/fit-0.38.1.json),
//      the headed floor read off the picture, the chip's kinds, the picture
//      clocks (2 s waiting, 10 s none, a stale picture after a navigation), the
//      pinch transform — a tap maps through it (the transformed rect into the
//      ONE pointer conversion, brute-forced);
//      + the trailing edge of the frame gate (src/browser-stream.js frameGateWait);
//   ② the REAL bridge (src/server/browser-stream.js) on a real http server over a
//      FAKE upstream speaking the measured mirror, a stub keeper: the rule end to
//      end (two viewers, a hidden one, a takeover), our set never reaches a viewer
//      and never flags agent-set, an agent's set is letterboxed until `force`, a
//      late viewer is replayed the fit, the headed floor re-fit, the restore after
//      the grace (and a return inside it cancels it), THE TRAILING FRAME (a static
//      page's final paint reaches a viewer the gate refused it to — the blank
//      white picture), the FRESH FRAME after a navigation no frame followed and on
//      a viewer's `refresh` (rate-limited);
//   ③ the REAL keeper's `setViewportFor` routing with a stub runtime — a view never
//      starts a browser (a stopped / absent / inactive one is refused with NO CLI
//      call), a running one gets `set viewport W H` under its own pairs; the CDP
//      `captureFrame` over a fake endpoint (+ the keeper's `freshFrameFor`);
//   ④ WIRING PINS on the client (the pane is the canvas's CSS box, reported on
//      hello + a ResizeObserver; the pointer reads the transformed rect; the phone
//      auto-opens through autoOpenOnPhone; the phone chip is sticky);
//   ⑤ PATCHED-COPY CONTROLS (scripts/mutant-copy.mjs): the device-px pane, the
//      holder-blind rule, the bridge without the trailing frame, without its own-
//      mirror recognition, without the fresh frame — each turns its leg red.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIT = require('../src/browser-fit.js');
const S = require('../src/browser-stream.js');
const BS = require('../src/server/browser-stream.js');
const { WebSocket, WebSocketServer } = require('ws');
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/browser-stream/fit-0.38.1.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 700) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const ROOT = scratch('browser-fit');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const cleanups = [];
process.on('exit', () => { for (const f of cleanups) { try { f(); } catch { } } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const M = mutantCopies('browser-fit', REPO);

/** A minimal JPEG head of W×H (the SOF is all jpegSize reads) + a comment carrying `tag` (frames are told apart by it). */
function jpegOf(w, h, tag = '') {
  const t = Buffer.from(String(tag));
  const bytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xfe, 0x00, t.length + 2, ...t, 0xff, 0xd9];
  return Buffer.from(bytes).toString('base64');
}

// ═══ ① PURE ═══════════════════════════════════════════════════════════════
console.log('— ① the PURE rules (src/browser-fit.js) over the measured 0.38.1 shapes');
{
  // the measurement the rules stand on
  const fr = FIX.frames;
  ok(fr.default.frame[0] === 1280 && fr.default.frame[1] === 577 && fr.default.metadata[1] === 720, `measured: before any set the headless frame is ${fr.default.frame.join('×')} under a ${fr.default.metadata.join('×')} claim (lane J's fact, again)`);
  ok(fr['set viewport 700 900'].frames.every((f) => f[0] === 700 && f[1] === 900) && fr['set viewport 700 900'].metadata.join() === '700,900', 'measured: `set viewport 700 900` ⇒ every frame 700×900 and the metadata 700×900 — the frame IS the page once a viewport is set');
  ok(fr['set viewport 390 844 2'].page.dpr === 2 && fr['set viewport 390 844 2'].frames.every((f) => f[0] === 390 && f[1] === 844), 'measured: a device scale factor of 2 leaves the frame at the CSS size (390×844 under a page at DPR 2) — the fit asks for factor 1');
  ok(FIX.deviceScaleFactor['static page, set 700 900 2'].framesWithin4500ms === 0 && FIX.deviceScaleFactor['static page, set 700 900 1'].framesWithin4500ms === 1, 'measured: a factor change on a static page produced NO frame (the blank picture), a factor-1 change one');
  ok(FIX.headed['set viewport'].find((r) => r.set[0] === 390).frame.join() === '390,593' && FIX.headed['set viewport'].find((r) => r.set[0] === 500).frame.join() === '500,800', 'measured: headed, 390×760 comes back 390×593 (scaled) and 500×800 exact — the floor HEADED_MIN_W');
  ok(FIX.hashNav.upstreamFramesWithin3s === 0 && FIX.hashNav.records.length === 1 && FIX.hashNav.records[0].type === 'url', 'measured: a hash navigation sends ONE url record and no frame (the view could not tell "same pixels" from "no picture")');
  ok(FIT.FIT_SCALE === 1 && FIT.HEADED_MIN_W === 500 && FIT.WAIT_PICTURE_MS === 2000 && FIT.NO_PICTURE_MS === 10000, 'the constants: factor 1, the headed floor 500, the picture clocks 2 s / 10 s');

  // pane → viewport
  const pv = (w, h, o = {}) => FIT.paneViewport({ width: w, height: h, ...o });
  ok(pv(700, 900).width === 700 && pv(700, 900).height === 900 && pv(700, 900).drawScale === 1 && pv(700, 900).scale === 1, 'a 700×900 pane asks for a 700×900 page, drawn at net zoom 1, factor 1');
  ok(pv(390, 760, { dpr: 3 }).width === 390 && pv(390, 760, { dpr: 3 }).height === 760, 'DPR-aware = CSS px: a DPR-3 phone pane 390×760 asks for a 390-wide page (never 1170)');
  { const a = pv(200, 150); ok(a.width === 240 && a.height === 180 && Math.abs(a.drawScale - 200 / 240) < 1e-9 && a.bounded, `a pane under the floor keeps its ASPECT (200×150 ⇒ ${a.width}×${a.height}, drawn ×${a.drawScale.toFixed(3)} — it fills the pane, never a band)`); }
  { const a = pv(390, 760, { floorW: 500 }); ok(a.width === 500 && a.height === Math.round(760 * 500 / 390) && Math.abs(a.drawScale * 500 - 390) < 1e-6, `the headed floor: 390×760 ⇒ ${a.width}×${a.height} (the pane's aspect, drawn ×${a.drawScale.toFixed(2)})`); }
  { const a = pv(5000, 3000); ok(a.width === 3840 && a.height === 2304, `a pane past the ceiling scales down with its aspect (5000×3000 ⇒ ${a.width}×${a.height})`); }
  ok(pv(0, 100) === null && pv(NaN, 5) === null, 'no size ⇒ no viewport');

  // THE RULE
  const f = (viewerId, w, h, visible = true) => ({ viewerId, width: w, height: h, visible });
  const two = [f(1, 700, 900), f(2, 1000, 700)];
  ok(FIT.fitTarget({ fits: two }).viewerId === 2 && FIT.fitTarget({ fits: two }).rule === 'largest', 'two watchers: the LARGEST pane by area rules (1000×700 > 700×900)');
  ok(FIT.fitTarget({ fits: two, mode: 'takeover', holder: 1 }).viewerId === 1 && FIT.fitTarget({ fits: two, mode: 'takeover', holder: 1 }).rule === 'holder', 'somebody drives: the HOLDER\'s pane rules (their clicks land on the page at their size)');
  ok(FIT.fitTarget({ fits: [f(1, 700, 900), f(2, 1000, 700, false)] }).viewerId === 1, 'a HIDDEN viewer never votes (another desktop, a background tab, a minimized window)');
  ok(FIT.fitTarget({ fits: [f(1, 700, 900), f(2, 1000, 700, false)], mode: 'takeover', holder: 2 }).viewerId === 1, 'a hidden holder does not rule either — the visible pane does');
  ok(FIT.fitTarget({ fits: [f(3, 800, 600), f(2, 600, 800)] }).viewerId === 2, 'a tie in area ⇒ the earliest viewer');
  ok(FIT.fitTarget({ fits: [f(1, 700, 900, false)] }) === null && FIT.fitTarget({}) === null, 'nobody visible ⇒ no ruling');

  // the verdict
  const V = (o) => FIT.fitVerdict({ fits: [f(1, 700, 900)], ready: true, baseline: { width: 1280, height: 577 }, ...o });
  ok(V({}).act === 'set' && V({}).width === 700 && V({}).height === 900 && V({}).viewerId === 1, 'a visible pane, nothing applied ⇒ set 700×900');
  ok(V({ applied: { width: 701, height: 899 } }).act === 'keep' && V({ applied: { width: 710, height: 900 } }).act === 'set', `within ${FIT.FIT_SLACK_PX} px of the applied size ⇒ keep (a sub-pixel wobble never re-fits); 10 px off ⇒ set`);
  ok(V({ agent: { width: 800, height: 600 } }).act === 'letterbox' && V({ agent: { width: 800, height: 600 }, force: true }).act === 'set', 'the AGENT chose the size ⇒ letterbox (never overridden); the user\'s `force` ⇒ set');
  ok(V({ fits: [], applied: { width: 700, height: 900 } }).act === 'restore' && V({ fits: [], applied: { width: 700, height: 900 } }).width === 1280 && V({ fits: [] }).act === 'keep', 'nobody visible with a fit applied ⇒ restore to the baseline (1280×577); nothing applied ⇒ keep');
  ok(V({ ready: false }).act === 'wait', 'no baseline yet (no picture / reading) ⇒ wait');
  ok(V({ floorW: 500, fits: [f(1, 390, 760)] }).width === 500, 'the floor rides the verdict');
  ok(JSON.stringify(FIT.viewportArgv({ width: 700.4, height: 899.6 })) === JSON.stringify(['set', 'viewport', '700', '900']) && FIT.viewportArgv({ width: 0, height: 1 }) === null, 'the argv: `set viewport W H` (no factor), integers');

  // the report
  ok(JSON.stringify(FIT.fitReport({ type: 'fit', width: 699.6, height: 900.2, dpr: 3, visible: true })) === JSON.stringify({ width: 700, height: 900, dpr: 3, visible: true, force: false }) && FIT.fitReport({ width: -1, height: 5 }) === null && FIT.fitReport({ width: 5e5, height: 5 }) === null && FIT.fitReport({ width: 10, height: 10, dpr: 99 }).dpr === 1, 'a viewer\'s report is sanitized (rounded, bounded, dpr kept for the record)');

  // OUR mirror vs the AGENT's — the measured records
  const m7 = FIX.mirror['set viewport 700 900'];
  const [launchCmd, launchRes, vpCmd, vpRes] = m7;
  ok(launchCmd.action === 'launch' && vpCmd.action === 'viewport' && vpCmd.params.width === 700 && vpRes.id === vpCmd.id, 'the fixture\'s mirror: launch command/result, then the viewport command/result (same id)');
  const pend = { width: 700, height: 900, at: 1000, inFlight: true, id: null };
  ok(FIT.ownViewportRecord(launchCmd, pend, 1100).own && FIT.ownViewportRecord(launchRes, pend, 1100).own, 'the launch pair that opens OUR call is ours (while it is in flight)');
  const o = FIT.ownViewportRecord(vpCmd, pend, 1100);
  ok(o.own && o.learnId === vpCmd.id, 'OUR viewport command is recognised by the size we asked for, and its id is learned');
  const pend2 = { ...pend, id: vpCmd.id };
  ok(FIT.ownViewportRecord(vpRes, pend2, 1100).own && !FIT.ownViewportRecord(launchCmd, pend2, 1100).own, 'its result by the id; once the id is known, a later launch pair is somebody else\'s');
  ok(!FIT.ownViewportRecord({ ...vpCmd, params: { ...vpCmd.params, width: 800 } }, pend, 1100).own && !FIT.ownViewportRecord(vpCmd, pend, 1000 + FIT.OWN_WINDOW_MS + 1).own && !FIT.ownViewportRecord(FIX.mirror['set viewport 390 844 2'][2], { width: 390, height: 844, at: 0, inFlight: true }, 10).own, 'another size, a stale ask, a factor-2 set are NOT ours');
  const ag = FIT.agentViewportOf(vpCmd);
  ok(ag && ag.kind === 'viewport' && ag.width === 700 && ag.height === 900 && ag.scale === 1, 'an agent\'s `set viewport` is read off the command mirror');
  const dev = FIX.mirror['set device iPhone 12'];
  const agd = FIT.agentViewportOf(dev.find((r) => r.type === 'command' && r.action === 'device'));
  const dsz = FIT.deviceSizeOf(dev.find((r) => r.type === 'result' && r.action === 'device'));
  ok(agd && agd.kind === 'device' && agd.device === 'iPhone 12' && dsz && dsz.width === 390 && dsz.height === 844 && dsz.scale === 3, 'an agent\'s `set device "iPhone 12"` is a flag too; its result names 390×844 @3 (measured)');
  ok(FIT.agentViewportOf(launchCmd) === null && FIT.agentViewportOf({ type: 'command', action: 'click' }) === null && FIT.agentViewportOf(vpRes) === null, 'anything else is not a viewport choice');

  // the headed floor, off the picture
  ok(FIT.fitHonored({ fit: { width: 700, height: 900 }, picture: { width: 700, height: 900 } }) === 'exact' && FIT.fitHonored({ fit: { width: 390, height: 760 }, picture: { width: 390, height: 593 } }) === 'scaled' && FIT.fitHonored({ fit: { width: 700, height: 900 }, picture: { width: 1280, height: 577 } }) === 'other' && FIT.fitHonored({ fit: { width: 700, height: 900 }, picture: { width: 700, height: 600 } }) === 'other', 'fitHonored: exact / scaled (the measured headed 390×593) / other (an old frame, a wide page)');

  // the chip
  const chip = (fit, you = 1) => FIT.fitChipState({ fit, you });
  ok(!chip({ state: 'fitted', width: 700, height: 900, viewerId: 1 }).show, 'fitted to THIS pane ⇒ no chip (a fitted page needs no words)');
  ok(chip({ state: 'fitted', width: 1000, height: 700, viewerId: 2, rule: 'largest' }).kind === 'other', 'fitted to ANOTHER pane ⇒ "sized for another window"');
  ok(chip({ state: 'agent', width: 800, height: 600 }).kind === 'agent' && chip({ state: 'agent', width: 800, height: 600 }).act === 'force', 'the agent chose ⇒ its size + the act that takes it back');
  ok(chip({ state: 'fitted', width: 500, height: 974, viewerId: 1, floor: 500, drawScale: 0.78 }).kind === 'floor' && chip({ state: 'unavailable', width: 1280, height: 577, error: 'x' }).kind === 'unavailable' && !chip(null).show && !chip({ state: 'restored', width: 1, height: 1 }).show, 'the headed floor and a failure are said; nothing / restored are silent');

  // the picture clocks
  const P = (o) => FIT.pictureState({ connected: true, now: 100000, ...o });
  ok(P({ frames: 0, openAt: 99000 }).state === 'ok' && P({ frames: 0, openAt: 97500 }).state === 'waiting' && P({ frames: 0, openAt: 89000 }).state === 'none', 'no frame since the stream opened: ok < 2 s, waiting, none ≥ 10 s');
  ok(P({ frames: 3, lastFrameAt: 90000, navAt: 97000 }).state === 'waiting' && P({ frames: 3, lastFrameAt: 90000, navAt: 97000 }).stale && P({ frames: 3, lastFrameAt: 90000, navAt: 89000 }).state === 'ok' && P({ frames: 3, lastFrameAt: 80000, navAt: 85000 }).state === 'none', 'a navigation no frame followed: the picture is STALE — waiting at 2 s, none at 10 s; a frame after it ⇒ ok');
  ok(FIT.pictureState({ connected: false, frames: 0, openAt: 1, now: 1e9 }).state === 'ok', 'disconnected ⇒ the clocks say nothing (the connection has its own words)');

  // the pinch
  const box = { width: 390, height: 760 };
  const z1 = FIT.zoomAt(FIT.ZOOM_NONE, 2, 100, 200, box);
  ok(z1.s === 2 && Math.abs(z1.tx - (100 - 100 * 2)) < 1e-9 && Math.abs(z1.ty - (200 - 200 * 2)) < 1e-9, 'zoomAt keeps the point under the finger (100,200) where it was');
  ok(FIT.zoomClamp({ s: 9, tx: 50, ty: -99999 }, box).s === FIT.ZOOM_MAX && FIT.zoomClamp({ s: 9, tx: 50, ty: -99999 }, box).tx === 0 && FIT.zoomClamp({ s: 9, tx: 50, ty: -99999 }, box).ty === 760 * (1 - 4) && FIT.zoomClamp({ s: 0.2, tx: -5, ty: -5 }, box).s === 1 && FIT.zoomClamp({ s: 0.2, tx: -5, ty: -5 }, box).tx === 0, 'zoomClamp: 1..4 and the picture always covers its box');
  const zp = FIT.pinchStep(FIT.ZOOM_NONE, { x: 150, y: 300 }, { x: 250, y: 300 }, { x: 100, y: 300 }, { x: 300, y: 300 }, box);
  ok(zp.s === 2 && Math.abs(zp.tx - (200 - 200 * 2)) < 1e-9, 'a pinch spreading 100 → 200 px zooms 2× about its midpoint');
  const zpan = FIT.panStep(z1, -30, 40, box);
  ok(Math.abs(zpan.tx - (z1.tx - 30)) < 1e-9 && Math.abs(zpan.ty - (z1.ty + 40)) < 1e-9 && FIT.panStep(z1, 9999, 9999, box).tx === 0, 'a pan moves a zoomed picture, clamped at its edges');
  // a TAP maps through the transform: brute force — content point (cx,cy) of the untransformed picture is drawn at
  // rect.left + tx + cx·s; the ONE pointer conversion over the transformed rect gives the page point of (cx,cy)
  let worst = 0;
  const rect = { left: 12, top: 60, width: 390, height: 760 };
  for (const z of [FIT.ZOOM_NONE, z1, zp, FIT.zoomAt(z1, 1.7, 300, 50, box), FIT.zoomAt(FIT.ZOOM_NONE, 1.5, 120, 500, box), FIT.zoomAt(FIT.ZOOM_NONE, 3, 300, 700, box)]) { // verify r1: ×1.5 and ×3 too
    const zr = FIT.zoomedRect(rect, z);
    for (const [cx, cy] of [[10, 10], [195, 380], [389, 759], [100, 700]]) {
      const want = S.pointerToDevice({ clientX: rect.left + cx, clientY: rect.top + cy, elRect: rect, frameW: 390, frameH: 760, align: 'top' });
      const got = S.pointerToDevice({ clientX: rect.left + z.tx + cx * z.s, clientY: rect.top + z.ty + cy * z.s, elRect: zr, frameW: 390, frameH: 760, align: 'top' });
      if (!want || !got) { worst = Infinity; continue; }
      worst = Math.max(worst, Math.hypot(want.x - got.x, want.y - got.y));
    }
  }
  ok(worst <= 1, `a tap maps THROUGH the pinch transform: the transformed rect into the one pointer conversion lands on the same page point at 1×/2×/pinched/1.7×/1.5×/3× (worst ${worst} px)`);
  ok(FIT.transformCss(FIT.ZOOM_NONE) === '' && /^translate\(-100px, -200px\) scale\(2\)$/.test(FIT.transformCss(z1)), 'transformCss: nothing at 1×, translate+scale (origin top-left) when zoomed');

  // the trailing edge of the gate
  ok(S.frameGateWait({ maxFps: 15, lastFrameAt: 1000, bufferedAmount: 0 }, 1020) === 47 && S.frameGateWait({ maxFps: 15, lastFrameAt: 1000, bufferedAmount: 0 }, 1100) === 0 && S.frameGateWait({ maxFps: 15, lastFrameAt: 0, bufferedAmount: 5e6 }, 5) === null, 'frameGateWait: the ms until the gate opens (47 of a 66.7 ms gap), 0 when open, null while the buffer holds it');
  ok(S.viewerMessageVerdict({ type: 'fit', width: 1, height: 1 }).kind === 'fit' && S.viewerMessageVerdict({ type: 'refresh' }).kind === 'refresh' && S.hello({}).protocol.view.join(',') === 'fit,refresh' && S.hello({}).protocol.control.join(',') === 'takeover,handback,confirm,pass', 'the view verbs are their own kinds (never forwarded); the hello names them beside the control verbs');
}

// ── ⑤a PURE controls ──
{
  const src = fs.readFileSync(path.join(REPO, 'src/browser-fit.js'), 'utf8');
  const A1 = '  const W = Math.round(w * k), H = Math.round(h * k);\n';
  ok(src.includes(A1), 'control setup: paneViewport\'s one rounding line is found');
  const devPx = M.load('src/browser-fit.js', src.replace(A1, '  const d = posNum(dpr) || 1; const W = Math.round(w * k * d), H = Math.round(h * k * d);\n'), 'device-px');
  ok(devPx.paneViewport({ width: 390, height: 760, dpr: 3 }).width === 1170, 'NEGATIVE CONTROL: a pane measured in DEVICE px (the patched copy) asks a DPR-3 phone for a 1170-wide page — the desktop layout shrunk into the phone, the study\'s strip (the ① leg is red on it)');
  const A2 = "  if (mode === 'takeover' && holder !== null && holder !== undefined) {\n";
  ok(src.includes(A2), 'control setup: the holder rule is found');
  const noHolder = M.load('src/browser-fit.js', src.replace(A2, "  if (false) {\n"), 'no-holder');
  ok(noHolder.fitTarget({ fits: [{ viewerId: 1, width: 700, height: 900, visible: true }, { viewerId: 2, width: 1000, height: 700, visible: true }], mode: 'takeover', holder: 1 }).viewerId === 2, 'NEGATIVE CONTROL: without the holder rule the larger watcher resizes the page under the driver (the ① holder leg is red on it)');
}

// ═══ ② THE REAL BRIDGE over a fake upstream ═══════════════════════════════
console.log('— ② the real bridge: the rule end to end, our mirror vs the agent\'s, the trailing frame, the fresh frame, the restore');
/** The fake stream server: the measured mirror on every set, a frame of the page's size after it. */
async function fakeUpstream() {
  const port = await freePort();
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  const wss = new WebSocketServer({ server: srv });
  const clients = new Set();
  const U = { port, page: { w: 1280, h: 577 }, headed: false, seq: 0, clients, sent: [] };
  U.emit = (o) => { const t = JSON.stringify(o); U.sent.push(o); for (const c of clients) if (c.readyState === 1) c.send(t); };
  U.frame = (tag = 'f') => { const h = U.headed && U.page.w < 500 ? Math.round(U.page.h * 0.78) : U.page.h; U.emit({ type: 'frame', seq: ++U.seq, data: jpegOf(U.page.w, h, tag + U.seq), metadata: { deviceWidth: U.page.w, deviceHeight: U.page.h, timestamp: 0 } }); };
  let rid = 1000;
  /** What the real daemon mirrors for ONE `set viewport` CLI call (fixture order), then the repaint. */
  U.mirrorSet = (w, h, { agent = false } = {}) => {
    const lid = 'r' + (++rid), vid = 'r' + (++rid);
    U.emit({ type: 'command', action: 'launch', id: lid, params: { action: 'launch', id: lid }, timestamp: 0 });
    U.emit({ type: 'result', action: 'launch', id: lid, success: false, data: { launched: true }, timestamp: 0 });
    U.emit({ type: 'command', action: 'viewport', id: vid, params: { action: 'viewport', width: w, height: h, id: vid }, timestamp: 0 });
    U.emit({ type: 'result', action: 'viewport', id: vid, success: false, data: { width: w, height: h }, timestamp: 0 });
    U.page = { w, h };
    setTimeout(() => U.frame(agent ? 'agent' : 'fit'), 15);
  };
  wss.on('connection', (ws) => {
    clients.add(ws); ws.on('close', () => clients.delete(ws));
    ws.send(JSON.stringify({ type: 'status', connected: true, screencasting: true, viewportWidth: 1280, viewportHeight: 720 }));
    ws.send(JSON.stringify({ type: 'tabs', tabs: [{ tabId: 't1', active: true, url: 'https://a.test/', title: 'a' }] }));
    ws.send(JSON.stringify({ type: 'url', url: 'https://a.test/' }));
    setTimeout(() => U.frame('open'), 10);
  });
  await new Promise((r) => srv.listen(port, '127.0.0.1', r));
  U.close = () => new Promise((r) => { for (const c of clients) { try { c.terminate(); } catch { } } wss.close(); srv.close(() => r()); });
  return U;
}
/** A stub keeper over the fake upstream (records every set / fresh ask). */
function stubKeeper(U, { fresh = true } = {}) {
  const calls = { set: [], fresh: [], viewport: 0 };
  const k = {
    setFor: () => ({ attachments: [] }), list: () => ({ profiles: [] }),
    streamPortFor: async () => ({ ok: true, port: U.port }),
    viewportFor: async () => { calls.viewport++; return { ok: true, clientWidth: U.page.w, clientHeight: U.page.h }; },
    setViewportFor: async (target, { width, height }) => { calls.set.push([width, height]); await sleep(5); U.mirrorSet(width, height); await sleep(5); return { ok: true }; },
  };
  if (fresh) k.freshFrameFor = async () => { calls.fresh.push(Date.now()); return { ok: true, data: jpegOf(U.page.w, U.page.h, 'fresh' + calls.fresh.length), clientWidth: U.page.w, clientHeight: U.page.h }; };
  return { k, calls };
}
async function bridgeOn(BSmod, keeper) {
  const activeSessions = new Map([['s1', { _browserKey: 'bk-0000000a', _browserEnv: ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a'] }]]);
  const logs = [];
  const bridge = BSmod.create({ keeper, activeSessions, requestAuthed: () => true, log: { warn: (m) => logs.push(m), log: (m) => logs.push(m) } });
  const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
  srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
  const P = await freePort(); await new Promise((r) => srv.listen(P, '127.0.0.1', r));
  const close = () => new Promise((r) => { bridge.shutdown(); srv.close(() => r()); });
  return { bridge, P, logs, close };
}
function viewer(P, q = 'session=s1') {
  const ws = new WebSocket(`ws://127.0.0.1:${P}${S.STREAM_PATH}?${q}`);
  const V = { ws, msgs: [], frames: [], you: null };
  ws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } m._at = Date.now(); if (m.type === 'frame') V.frames.push(m); else V.msgs.push(m); if (m.type === 'hello') V.you = m.you; });
  V.send = (o) => ws.send(JSON.stringify(o));
  V.fits = () => V.msgs.filter((m) => m.type === 'fit');
  V.lastFit = () => V.fits().at(-1) || null;
  V.ready = () => until(() => V.you !== null && V.frames.length >= 1, 5000);
  V.close = () => new Promise((r) => { if (ws.readyState === 3) return r(); ws.once('close', r); ws.close(); });
  return V;
}
const tagOf = (fr) => { const b = Buffer.from(fr.data, 'base64'); const i = b.indexOf(Buffer.from([0xff, 0xfe])); return i < 0 ? '' : b.slice(i + 4, b.length - 2).toString(); };

{
  const U = await fakeUpstream(); cleanups.push(() => U.close());
  const { k, calls } = stubKeeper(U);
  const B = await bridgeOn(BS, k);
  const A = viewer(B.P);
  ok(await A.ready(), 'viewer A: hello + the first frame');
  A.send({ type: 'fit', width: 700, height: 900, dpr: 2, visible: true });
  await until(() => calls.set.some((c) => c[0] === 700 && c[1] === 900), 3000);
  await until(() => A.lastFit() && A.lastFit().state === 'fitted', 2000);
  ok(calls.set.length === 1 && calls.set[0].join() === '700,900', `A's pane 700×900 ⇒ the keeper sets the page to 700×900 (one set: ${JSON.stringify(calls.set)})`);
  ok(A.lastFit() && A.lastFit().width === 700 && A.lastFit().viewerId === A.you && A.lastFit().rule === 'largest', 'every viewer is told: fitted 700×900 for A\'s pane', JSON.stringify(A.lastFit()));
  await until(() => A.frames.some((f) => S.jpegSize(f.data).width === 700), 2000);
  ok(A.frames.some((f) => { const z = S.jpegSize(f.data); return z.width === 700 && z.height === 900; }), 'the next picture A receives IS 700×900 (the pane)');
  ok(!A.msgs.some((m) => (m.type === 'command' || m.type === 'result') && (m.action === 'viewport' || m.action === 'launch')), 'OUR set\'s mirror (launch pair + viewport pair) never reaches a viewer (it would light "Running a command")');
  ok(B.bridge.stats()[0].own >= 4 && !A.fits().some((x) => x.state === 'agent'), `…and never flags the page agent-set (${B.bridge.stats()[0].own} own records dropped)`);
  // B: larger — the largest rules
  const Bv = viewer(B.P);
  ok(await Bv.ready(), 'viewer B joins');
  ok(Bv.fits().length >= 1 && Bv.fits()[0].state === 'fitted' && Bv.fits()[0].width === 700, 'a LATE viewer is replayed the fit (whose pane, what size)');
  Bv.send({ type: 'fit', width: 1000, height: 700, dpr: 1, visible: true });
  await until(() => calls.set.at(-1).join() === '1000,700', 3000);
  await until(() => A.lastFit() && A.lastFit().viewerId === Bv.you, 1500);
  ok(calls.set.at(-1).join() === '1000,700' && A.lastFit().viewerId === Bv.you && A.lastFit().rule === 'largest', 'B\'s larger pane (1000×700) rules — A is told the page follows ANOTHER pane (its chip says so)', JSON.stringify({ calls: calls.set, fit: A.lastFit() }));
  ok(FIT.fitChipState({ fit: A.lastFit(), you: A.you }).kind === 'other' && !FIT.fitChipState({ fit: Bv.lastFit(), you: Bv.you }).show, '…A\'s chip: "sized for another window"; B\'s: nothing');
  Bv.send({ type: 'fit', width: 1000, height: 700, dpr: 1, visible: false });
  await until(() => calls.set.at(-1).join() === '700,900', 3000);
  ok(calls.set.at(-1).join() === '700,900', 'B goes HIDDEN ⇒ it no longer votes: back to A\'s 700×900');
  // a takeover: the holder rules
  A.send({ type: 'takeover' });
  await until(() => A.msgs.some((m) => m.type === 'mode' && m.mine), 2000);
  Bv.send({ type: 'fit', width: 1000, height: 700, dpr: 1, visible: true });
  await sleep(700);
  ok(calls.set.at(-1).join() === '700,900', 'A DRIVES: B visible and larger again, the page stays A\'s 700×900 (the holder\'s pane rules)', JSON.stringify(calls.set));
  A.send({ type: 'handback' });
  await until(() => calls.set.at(-1).join() === '1000,700', 3000);
  ok(calls.set.at(-1).join() === '1000,700', '…A hands back ⇒ the largest visible pane (B) rules again');
  // the AGENT sets its own size
  U.mirrorSet(800, 600, { agent: true });
  await until(() => A.lastFit() && A.lastFit().state === 'agent', 2000);
  ok(A.lastFit().state === 'agent' && A.lastFit().width === 800 && Bv.lastFit().state === 'agent', 'the AGENT\'s `set viewport 800 600` (not ours) ⇒ every viewer is told the agent chose 800×600', JSON.stringify(A.lastFit()));
  ok(A.msgs.some((m) => m.type === 'command' && m.action === 'viewport' && m.params.width === 800), '…and the agent\'s own command reaches the viewers (it is the agent\'s act)');
  const n0 = calls.set.length;
  A.send({ type: 'fit', width: 720, height: 900, dpr: 2, visible: true });
  Bv.send({ type: 'fit', width: 1010, height: 700, dpr: 1, visible: true });
  await sleep(700);
  ok(calls.set.length === n0, 'panes that change while the agent owns the size never override it (the view letterboxes)');
  Bv.send({ type: 'fit', width: 1010, height: 700, dpr: 1, visible: true, force: true });
  await until(() => calls.set.length > n0, 3000);
  await until(() => A.lastFit() && A.lastFit().state === 'fitted', 2000);
  ok(calls.set.at(-1).join() === '1010,700' && A.lastFit().state === 'fitted' && B.logs.some((l) => /set aside/.test(l)), '`force` (the user\'s "Fit the page to the window") takes it back: set 1010×700, fitted, the journal says the agent\'s size was set aside', JSON.stringify({ calls: calls.set.slice(-2), fit: A.lastFit() }));
  // the restore — everybody leaves, then the grace; a return inside the grace cancels it
  await A.close(); await Bv.close();
  await sleep(1500);
  const C = viewer(B.P); await C.ready();
  C.send({ type: 'fit', width: 1010, height: 700, dpr: 1, visible: true });
  await sleep(FIT.RESTORE_AFTER_MS);
  ok(!calls.set.some((c) => c.join() === '1280,577'), 'a viewer that comes back inside the grace (a reload) cancels the restore — the page never bounces');
  // integration 2.369.192 (a fast-tier red, 1 run in 5): the restore's set is RECORDED before its ~10 ms fake call returns and
  // the journal line is written after it — a 50 ms poll could land between them; and the server arms the grace when it SEES
  // the close, which can be before the client's close() resolves. So: the clock starts before the close (the true lower
  // bound), and the wait is for the restore's own journal line (its completion), never the first sight of the set
  const tLeft = Date.now();
  await C.close();
  await until(() => calls.set.at(-1).join() === '1280,577' && B.logs.some((l) => /back to its own 1280×577/.test(l)), FIT.RESTORE_AFTER_MS + 3000, 50);
  ok(calls.set.at(-1).join() === '1280,577' && Date.now() - tLeft >= FIT.RESTORE_AFTER_MS - 50 && B.logs.some((l) => /back to its own 1280×577/.test(l)), `nobody watches for ${FIT.RESTORE_AFTER_MS} ms ⇒ the page goes back to its own 1280×577 (the size before the first fit)`, JSON.stringify(calls.set.slice(-3)));
  await B.close(); await U.close();
}
// THE HEADED FLOOR — a window that cannot be that narrow comes back scaled; the bridge re-fits at 500
{
  const U = await fakeUpstream(); U.headed = true; cleanups.push(() => U.close());
  const { k, calls } = stubKeeper(U);
  const B = await bridgeOn(BS, k);
  const P = viewer(B.P); await P.ready();
  P.send({ type: 'fit', width: 390, height: 760, dpr: 3, visible: true });
  await until(() => calls.set.some((c) => c[0] === 500), 4000);
  const want = FIT.paneViewport({ width: 390, height: 760, floorW: 500 });
  ok(calls.set[0].join() === '390,760' && calls.set.at(-1).join() === `${want.width},${want.height}`, `headed: 390×760 came back 390×593 ⇒ re-fitted at the floor ${want.width}×${want.height} (the pane's aspect)`, JSON.stringify(calls.set));
  await until(() => P.lastFit() && P.lastFit().floor === 500, 2000);
  ok(FIT.fitChipState({ fit: P.lastFit(), you: P.you }).kind === 'floor', 'the phone\'s chip says the page is the browser\'s narrowest, scaled to fit', JSON.stringify(P.lastFit()));
  await P.close(); await B.close(); await U.close();
}
// A SIZE THAT FAILED is not asked again for 30 s (each ask is a CLI spawn); a NEW relay's first picture re-checks the size
{
  const U = await fakeUpstream(); cleanups.push(() => U.close());
  let failNext = true;
  const calls = { set: [] };
  const k = {
    setFor: () => ({ attachments: [] }), list: () => ({ profiles: [] }), streamPortFor: async () => ({ ok: true, port: U.port }),
    viewportFor: async () => ({ ok: true, clientWidth: U.page.w, clientHeight: U.page.h }),
    setViewportFor: async (t, { width, height }) => { calls.set.push([width, height]); if (failNext) return { ok: false, code: 'viewport_failed', error: 'fake: unknown verb set' }; U.mirrorSet(width, height); await sleep(5); return { ok: true }; },
  };
  const B = await bridgeOn(BS, k);
  const V = viewer(B.P); await V.ready();
  V.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true });
  await until(() => V.lastFit() && V.lastFit().state === 'unavailable', 3000);
  ok(V.lastFit() && V.lastFit().state === 'unavailable' && /unknown verb/.test(V.lastFit().error) && V.lastFit().width === 1280, `a set the keeper could not make is SAID to every viewer (unavailable, the page's own ${V.lastFit() && V.lastFit().width}×${V.lastFit() && V.lastFit().height}, the reason) — the view's chip speaks`, JSON.stringify(V.lastFit()));
  V.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: false }); await sleep(100);
  V.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true }); await sleep(700);
  ok(calls.set.length === 1, `the same size that just failed is not asked again (${calls.set.length} ask(s) — each is a CLI spawn)`);
  failNext = false;
  V.send({ type: 'fit', width: 720, height: 900, dpr: 1, visible: true });
  await until(() => calls.set.length === 2 && V.lastFit() && V.lastFit().state === 'fitted', 3000);
  ok(calls.set.at(-1).join() === '720,900' && V.lastFit().state === 'fitted', 'a NEW size is asked (and fitted)');
  await V.close(); await B.close(); await U.close();
  const re = await restartLeg(BS);
  ok(re.setAgain, 'a NEW relay whose first picture is not the size we set (the browser started again at its own size) ⇒ the same pane is SET again, never "kept"', JSON.stringify(re));
}
/** The browser starts again at its own size: fitted, the relay ends, a new relay's first picture is 1280×577, the same pane reports. */
async function restartLeg(BSmod) {
  const U = await fakeUpstream(); cleanups.push(() => U.close());
  const { k, calls } = stubKeeper(U);
  const B = await bridgeOn(BSmod, k);
  const V = viewer(B.P); await V.ready();
  V.send({ type: 'fit', width: 720, height: 900, dpr: 1, visible: true });
  await until(() => calls.set.length === 1, 3000);
  await sleep(200);
  await V.close();
  await sleep(300);
  U.page = { w: 1280, h: 577 }; // the daemon's browser came back at its own size
  const V2 = viewer(B.P); await V2.ready();
  const n0 = calls.set.length;
  V2.send({ type: 'fit', width: 720, height: 900, dpr: 1, visible: true });
  await until(() => calls.set.length > n0, 3000);
  const r = { setAgain: calls.set.length > n0 && calls.set.at(-1).join() === '720,900', calls: calls.set };
  await V2.close(); await B.close(); await U.close();
  return r;
}
// THE TRAILING FRAME + THE FRESH FRAME — the blank-white picture
async function trailingLeg(BSmod, label) {
  const U = await fakeUpstream(); cleanups.push(() => U.close());
  const { k } = stubKeeper(U);
  const B = await bridgeOn(BSmod, k);
  const V = viewer(B.P); await V.ready();
  await sleep(200); // the gate is open again
  U.emit({ type: 'frame', seq: 90, data: jpegOf(1280, 577, 'white'), metadata: {} });
  await sleep(18);
  U.emit({ type: 'frame', seq: 91, data: jpegOf(1280, 577, 'painted'), metadata: {} });
  await sleep(400); // then the page sits still
  const last = V.frames.at(-1);
  await V.close(); await B.close(); await U.close();
  return { last: last ? tagOf(last) : null, got: V.frames.map(tagOf) };
}
async function freshLeg(BSmod) {
  const U = await fakeUpstream(); cleanups.push(() => U.close());
  const { k, calls } = stubKeeper(U);
  const B = await bridgeOn(BSmod, k);
  const V = viewer(B.P); await V.ready();
  await sleep(150);
  const n0 = V.frames.length;
  U.emit({ type: 'url', url: 'https://a.test/#sec2' }); // a hash navigation: no frame follows (measured)
  await until(() => V.frames.length > n0, FIT.FRESH_FRAME_MS + 1500);
  const f = V.frames.slice(n0)[0] || null;
  const r = { calls: calls.fresh.length, fresh: f ? f.metadata && f.metadata.fresh : null, tag: f ? tagOf(f) : null };
  // a navigation a frame DID follow asks nothing
  U.emit({ type: 'url', url: 'https://a.test/b' }); await sleep(60); U.frame('nav'); await sleep(FIT.FRESH_FRAME_MS + 300);
  r.afterFramed = calls.fresh.length;
  // a viewer's refresh: answered once per REFRESH_EVERY_MS
  V.send({ type: 'refresh' }); V.send({ type: 'refresh' }); await sleep(300);
  r.afterRefresh = calls.fresh.length;
  await V.close(); await B.close(); await U.close();
  return r;
}
{
  const t = await trailingLeg(BS);
  ok(t.last === 'painted', `THE TRAILING FRAME: two paints 18 ms apart then stillness — the viewer's last picture is the page's LAST paint ("${t.last}"; received ${t.got.join(', ')})`);
  const f = await freshLeg(BS);
  ok(f.calls === 1 && f.fresh === 'navigation' && /^fresh1/.test(f.tag), `THE FRESH FRAME: a navigation no frame followed ⇒ after ${FIT.FRESH_FRAME_MS} ms the bridge asks the page for one and every viewer gets it (fresh:"${f.fresh}")`, JSON.stringify(f));
  ok(f.afterFramed === 1, 'a navigation the stream DID paint asks nothing');
  ok(f.afterRefresh === 2, `a viewer's \`refresh\` is answered — twice in a row ⇒ ONE capture (at most one per ${FIT.REFRESH_EVERY_MS} ms)`, JSON.stringify(f));
}

// ═══ ⑤b BRIDGE CONTROLS (patched copies) ══════════════════════════════════
console.log('— ⑤ the bridge controls: each fix removed in a patched copy turns its leg red');
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
  const T1 = '      else { v.dropped++; relay.stats.dropped++; armTrail(relay, v); }\n';
  ok(src.includes(T1), 'control setup: the trailing arm is found');
  const noTrail = M.load('src/server/browser-stream.js', src.replace(T1, '      else { v.dropped++; relay.stats.dropped++; }\n'), 'no-trail');
  const t0 = await trailingLeg(noTrail);
  ok(t0.last === 'white' && t0.got.includes('white'), `NEGATIVE CONTROL: without the trailing frame the viewer keeps the FIRST paint for good ("${t0.last}") — the study's blank-white picture under a URL that says loaded`);
  const T2 = '      const own = FIT.ownViewportRecord(msg, p, t);\n'; // verify r1 (continuation): the pending + prevOwn slots share the one recognition
  ok(src.includes(T2), 'control setup: the own-mirror recognition is found');
  const noOwn = M.load('src/server/browser-stream.js', src.replace(T2, '      const own = { own: false };\n'), 'no-own');
  {
    const U = await fakeUpstream(); cleanups.push(() => U.close());
    const { k, calls } = stubKeeper(U);
    const B = await bridgeOn(noOwn, k);
    const A = viewer(B.P); await A.ready();
    A.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true });
    await until(() => calls.set.length >= 1, 3000); await sleep(400);
    A.send({ type: 'fit', width: 720, height: 900, dpr: 1, visible: true }); await sleep(700);
    ok(A.msgs.some((m) => m.type === 'command' && m.action === 'viewport') && A.fits().some((x) => x.state === 'agent') && calls.set.length <= 2 && !calls.set.some((c) => c[0] === 720), 'NEGATIVE CONTROL: without the own-mirror recognition our OWN set reaches the viewer and is read as the AGENT\'s — the next pane change is letterboxed and never fitted (verify r1: the mutant also "puts back" the size it took for the agent\'s, once)', JSON.stringify({ fits: A.fits().map((x) => x.state), calls: calls.set }));
    await A.close(); await B.close(); await U.close();
  }
  const T4 = "          if (f && f.applied && FIT.fitHonored({ fit: f.applied, picture: sz }) !== 'exact') { f.applied = null; f.failed = null; persistFit(f); }\n";
  ok(src.includes(T4), 'control setup: the new relay\'s first-picture check is found');
  const noRecheck = M.load('src/server/browser-stream.js', src.replace(T4, ''), 'no-recheck');
  const r0 = await restartLeg(noRecheck);
  ok(!r0.setAgain, 'NEGATIVE CONTROL: without the first-picture check the bridge believes its old size still holds — the restarted browser stays at 1280×577 under a 720×900 pane (the band again)', JSON.stringify(r0));
  const T3 = "    relay.freshTimer = setTimeout(() => { relay.freshTimer = null; if (relay.lastUpFrameAt < relay.navAt) captureFresh(relay, 'navigation'); }, FIT.FRESH_FRAME_MS);\n";
  ok(src.includes(T3), 'control setup: the fresh-frame timer is found');
  const noFresh = M.load('src/server/browser-stream.js', src.replace(T3, '    relay.freshTimer = setTimeout(() => { relay.freshTimer = null; }, FIT.FRESH_FRAME_MS);\n'), 'no-fresh');
  const f0 = await freshLeg(noFresh);
  ok(f0.calls === 0 && f0.fresh === null, 'NEGATIVE CONTROL: without the fresh frame a hash navigation leaves the viewer with no picture of it (0 captures, no frame)', JSON.stringify(f0));
}

// ═══ ③ THE KEEPER's routing (a view never starts a browser) + the CDP capture ═══
console.log('— ③ the keeper: setViewportFor never starts a browser; captureFrame over a fake CDP endpoint');
{
  const K = require('../src/server/browser-keeper.js');
  const F = require('../src/browser-facts.js');
  const D = path.join(ROOT, 'keeper'); fs.mkdirSync(path.join(D, 'data'), { recursive: true }); fs.mkdirSync(path.join(D, 'home'), { recursive: true });
  const execs = []; let infoActive = false;
  const rt = {
    info: async () => ({ ok: true, active: infoActive, pid: infoActive ? 1 : null }),
    launch: async () => ({ ok: false, error: 'not in this suite' }), cdpUrl: async () => ({ ok: false, url: null }), closeAll: async () => ({ ok: true }),
    streamStatus: async () => ({ ok: false, json: null }), streamEnable: async () => ({ ok: false, json: null }), streamPort: async () => ({ ok: false, error: 'x' }),
    exec: async (ns, argv, opts) => { execs.push({ ns, argv, opts }); return { ok: true, json: { success: true, data: {} } }; },
    cmd: 'agent-browser',
  };
  const keeper = K.create({ dataDir: path.join(D, 'data'), homeDir: path.join(D, 'home'), env: () => ({ PATH: '/usr/bin:/bin', HOME: path.join(D, 'home') }), runtime: rt, facts: F.createBrowserFacts({ env: { PATH: '/usr/bin:/bin' } }), log: { log() { }, warn() { }, error() { } }, install: false, tickMs: 3600e3 });
  cleanups.push(() => keeper.shutdown());
  const KEY = 'bk-0000c0de';
  const pairs = [`AGENT_BROWSER_SESSION=vs-${KEY}`, `AGENT_BROWSER_NAMESPACE=vs-${KEY}`, 'AGENT_BROWSER_IDLE_TIMEOUT_MS=600000'];
  const tgt = { ok: true, kind: 'ephemeral', ns: 'vs-' + KEY, sessionName: 'vs-' + KEY, envPairs: pairs };
  let r = await keeper.setViewportFor(tgt, { width: 700, height: 900 });
  ok(!r.ok && r.code === 'browser_stopped' && execs.length === 0, 'a conversation with no browser record and no daemon (`session info` inactive) ⇒ refused, NO CLI call (a `set` under its pairs would launch one)', JSON.stringify(r));
  infoActive = true;
  r = await keeper.setViewportFor(tgt, { width: 700, height: 900 });
  ok(r.ok && execs.length === 1 && execs[0].ns === null && execs[0].argv.join(' ') === 'set viewport 700 900' && execs[0].opts.extraEnv.AGENT_BROWSER_SESSION === 'vs-' + KEY, 'a daemon that runs under the pairs (no record of ours) ⇒ `set viewport 700 900` under exactly those pairs', JSON.stringify(execs));
  // a MANAGED ephemeral record: ready ⇒ set; stopped ⇒ refused with no call
  keeper.reshapeStore((reg) => {
    reg.profiles.push({ id: 'bp-0000e0e1', label: '(ephemeral) s', ephemeral: true, owner: { kind: 'conversation', id: KEY }, dir: path.join(D, 'eph'), createdAt: 1 });
    reg.browsers['bp-0000e0e1'] = { state: 'ready', envPairs: pairs, pid: 1, startedAt: 1 };
  });
  infoActive = false;
  r = await keeper.setViewportFor(tgt, { width: 710, height: 900 });
  ok(r.ok && execs.length === 2 && execs[1].argv.join(' ') === 'set viewport 710 900', 'a MANAGED ephemeral that is ready ⇒ set under its pairs (no extra `session info`)', JSON.stringify(execs.slice(-1)));
  keeper.reshapeStore((reg) => { reg.browsers['bp-0000e0e1'].state = 'stopped'; });
  r = await keeper.setViewportFor(tgt, { width: 720, height: 900 });
  ok(!r.ok && r.code === 'browser_stopped' && execs.length === 2, 'a managed ephemeral that is STOPPED ⇒ refused with NO call (a view never starts a browser)');
  r = await keeper.setViewportFor({ ok: true, kind: 'attachment', profileId: 'bp-0000abcd', sessionName: 'vs-' + KEY }, { width: 700, height: 900 });
  ok(!r.ok && execs.length === 2, 'an attachment with no such profile / no running browser ⇒ refused, no call');
  ok((await keeper.setViewportFor(tgt, { width: 0, height: 900 })).code === 'bad-request', 'no size ⇒ bad-request');
  // the CDP capture
  const VP = require('../src/server/browser-viewport.js');
  const port = await freePort();
  const asked = [];
  const JPG = jpegOf(700, 900, 'captured');
  const hsrv = http.createServer((req, res) => {
    if (req.url === '/json/list') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify([{ id: 'NT', type: 'page', url: 'chrome://newtab/', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/NT` }, { id: 'P1', type: 'page', url: 'https://x.test/page', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/P1` }])); return; }
    res.statusCode = 404; res.end();
  });
  const wss = new WebSocketServer({ server: hsrv });
  wss.on('connection', (ws, req) => { ws.on('message', (d) => { const m = JSON.parse(d); asked.push({ path: req.url, method: m.method, params: m.params }); if (m.method === 'Page.getLayoutMetrics') ws.send(JSON.stringify({ id: m.id, result: { cssLayoutViewport: { clientWidth: 700, clientHeight: 900 } } })); else if (m.method === 'Page.captureScreenshot') ws.send(JSON.stringify({ id: m.id, result: { data: JPG } })); else ws.send(JSON.stringify({ id: m.id, error: { message: 'nope' } })); }); });
  await new Promise((rr) => hsrv.listen(port, '127.0.0.1', rr)); cleanups.push(() => { wss.close(); hsrv.close(); });
  const c = await VP.captureFrame(`ws://127.0.0.1:${port}/devtools/browser/abc`, { activeUrl: 'https://x.test/page' });
  ok(c.ok && c.data === JPG && c.clientWidth === 700 && c.clientHeight === 900 && c.targetId === 'P1' && asked.map((a) => a.method).join() === 'Page.getLayoutMetrics,Page.captureScreenshot' && asked.every((a) => a.path === '/devtools/page/P1') && asked[1].params.format === 'jpeg', 'captureFrame: the ACTIVE page\'s socket, its layout metrics then ONE jpeg captureScreenshot, over one socket', JSON.stringify({ c: { ...c, data: c.data && c.data.length }, asked }));
  const dead = await VP.captureFrame(`ws://127.0.0.1:${await freePort()}/devtools/browser/x`, { timeoutMs: 800 });
  ok(!dead.ok && typeof dead.error === 'string', 'an endpoint that answers nothing ⇒ {ok:false}, bounded, never a throw');
  keeper.reshapeStore((reg) => {
    reg.profiles.push({ id: 'bp-0000f00d', label: 'Work', dir: path.join(D, 'work'), createdAt: 1, provider: 'chromium' });
    reg.browsers['bp-0000f00d'] = { state: 'ready', cdpUrl: `ws://127.0.0.1:${port}/devtools/browser/abc`, pid: 1, startedAt: 1 };
  });
  const kf = await keeper.freshFrameFor({ ok: true, kind: 'attachment', profileId: 'bp-0000f00d' }, { activeUrl: 'https://x.test/page' });
  ok(kf.ok && kf.data === JPG, 'the keeper\'s freshFrameFor resolves an attachment\'s endpoint off its record and captures (the raw endpoint never leaves the server)', JSON.stringify({ ...kf, data: kf.data && kf.data.length }));
}

// ═══ ④ CLIENT WIRING PINS ════════════════════════════════════════════════
console.log('— ④ the client wiring: the pane reported, the transformed rect, the phone\'s auto-open and its sticky chip');
{
  const live = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/function paneNow\(\) \{ const r = canvas\.getBoundingClientRect\(\);/.test(live) && !/paneNow[^\n]*devicePixelRatio/.test(live), 'the pane is the canvas\'s box off getBoundingClientRect (CSS px at net zoom 1) — never multiplied by devicePixelRatio');
  ok(/st\.fitSent = null; reportFit\(\); renderFit\(\);/.test(live) && /new ResizeObserver\(\(\) => \{ scheduleReport\(\);/.test(live) && /cro\.observe\(canvas\)/.test(live), 'the pane is reported on every hello and on every settled resize of the canvas');
  ok(/document\.addEventListener\('visibilitychange', scheduleReport,/.test(live) && /const vis = allowed && onScreen\(\) && p\.width >= 1 && p\.height >= 1;/.test(live), 'a hidden view reports itself hidden (it never votes)');
  ok(/const allowed = app\.settings\?\.get\('browser\.fitPageToView'\) !== false;/.test(live) && /app\.settings\?\.on\?\.\('browser\.fitPageToView', onFitSetting\)/.test(live), '`browser.fitPageToView` off: the view never votes (it says it is gone — the page goes back after the grace), live-applied');
  const schema = fs.readFileSync(path.join(REPO, 'src/lib/settings-schema.js'), 'utf8');
  ok(/'browser\.fitPageToView': \{\n[^]*?type: 'boolean', default: true,/.test(schema), 'the setting exists, default ON (the pre-S4 view is one switch away)');
  ok(/return pointerToDevice\(\{ clientX: ev\.clientX, clientY: ev\.clientY, elRect: rectOf\(img\),/.test(live) && /img\.style\.transform = transformCss\(st\.zoom\);/.test(live) && /img\.style\.transformOrigin = '0 0';/.test(live), 'the pinch is a transform on the picture (origin top-left) and the pointer reads the img\'s rect — the TRANSFORMED rect, so taps map through the zoom');
  ok(/if \(driving\(\)\) \{\n\s+\/\/ takeover: the FIRST finger is the page's[^\n]*\n\s+if \(st\.touches\.size >= 1\) \{ st\.touches\.set\(e\.pointerId, \{ refused: true \}\); pinchHint\(\); return true; \}/.test(live), 'in takeover a second finger is refused with a hint (never forwarded)');
  ok(/if \(app\.isMobile\) return autoOpenOnPhone\(app, prev, digest\);/.test(live) && /export function autoOpenOnPhone\(app, prev, digest\)/.test(live) && /if \(!onScreen\) continue;/.test(live) && /app\.goToWinId\?\.\(w\.id\); toast\(\);/.test(live), 'the PHONE auto-opens the live view (only for the conversation on screen), focused full-screen through goToWinId, with "Back to the chat"');
  ok(/if \(!st\.refreshSent\) \{ st\.refreshSent = true; send\(\{ type: 'refresh' \}\); \}/.test(live) && /t\('Waiting for a picture of the new page…'\)/.test(live) && /t\('No picture came in 10 s/.test(live), 'the picture clocks: a refresh asked once, "Waiting for a picture…" at 2 s, "No picture came in 10 s" + Reconnect');
  ok(/fit: 3, backend: 4/.test(live) && /bar\.append\(modeBadge, takeBtn, handBtn, kbdChip, echoEl, bindBtn, urlEl, openBtn, viewersEl, recEl, fitChip,/.test(live), 'the fit chip is a bar item folding at priority 3 (lane I\'s fold)');
  const css = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8');
  const phone = css.slice(css.indexOf('@media (max-width: 768px) {\n  .chat-status-bar { flex-wrap: nowrap; overflow-x: auto;'));
  ok(/\.chat-status-bar > \.chat-status-browser \{ position: sticky; left: 0; right: 0; z-index: 2; background: var\(--bg-taskbar\); max-width: 46vw;/.test(phone.slice(0, 2500)), 'the phone\'s "Agent browser" chip is sticky at both edges of the swipe bar (never scrolled off-screen), opaque, cut to fit');
  const bar = fs.readFileSync(path.join(REPO, 'src/lib/chat-status-bar.js'), 'utf8');
  ok(/<span class="chat-status-browser-text">\$\{escHtml\(face \+ String\(shown \|\| ''\)\)\}<\/span>/.test(bar), 'the chip\'s words sit in their own span (the ellipsis target), escHtml kept');
  const st = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  ok(/\.browser-live-canvas \{ touch-action: none; \}/.test(st) && /\.browser-live\.picture-stale \.browser-live-img \{/.test(st), 'the canvas takes the phone\'s pinch (touch-action none); a stale picture is dimmed');
}

// ═══ ⑤ VERIFY r1 (2026-09-26): two viewport sets in flight are judged by the daemon's ORDER; the restore waits for the
//     turn; the agent's choice + the baseline survive a server restart (a note on the browser record); a desktop switch
//     stops the vote; the pinch at 1.5× / 3× ═══
console.log('— ⑤ verify r1: the order-judged outcome of our own set, the deferred restore, the persisted note, the hider observer');
{
  // PURE
  ok(JSON.stringify(FIT.viewportArgv({ device: 'iPhone 12' })) === JSON.stringify(['set', 'device', 'iPhone 12']) && JSON.stringify(FIT.viewportArgv({ width: 390, height: 844, scale: 2 })) === JSON.stringify(['set', 'viewport', '390', '844', '2']) && JSON.stringify(FIT.viewportArgv({ width: 700, height: 900, scale: 1 })) === JSON.stringify(['set', 'viewport', '700', '900']), 'viewportArgv puts an AGENT choice back too: its factor only when > 1, `set device NAME`');
  ok(JSON.stringify(FIT.agentSetArgs({ kind: 'device', device: 'iPhone 12', width: 390, height: 844, scale: 3 })) === JSON.stringify({ device: 'iPhone 12' }) && JSON.stringify(FIT.agentSetArgs({ kind: 'viewport', width: 800, height: 600, scale: 1 })) === JSON.stringify({ width: 800, height: 600, scale: 1 }) && FIT.agentSetArgs(null) === null, 'agentSetArgs: a device by name, a viewport by size (+ factor)');
  const outcomes = [
    [{ ok: false, pending: { seq: 3 }, agent: null }, 'failed'], [{ ok: true, pending: { seq: 3 }, agent: null }, 'fitted'],
    [{ ok: true, pending: { seq: 3 }, agent: { seq: 7 } }, 'agent-stands'], [{ ok: true, pending: { seq: 7 }, agent: { seq: 3 } }, 'agent-overridden'],
    [{ ok: true, pending: { seq: null }, agent: { seq: 3 } }, 'agent-overridden'], [{ ok: true, pending: null, agent: { seq: 3 } }, 'agent-overridden'], [{ ok: true, pending: { seq: 3 }, agent: { seq: null } }, 'agent-overridden'],
  ];
  ok(outcomes.every(([i, w]) => FIT.ownSetOutcome(i) === w), 'ownSetOutcome: by ORDER — the agent\'s mirror after ours ⇒ stands; ours after (or ours not yet mirrored / unknown) ⇒ overridden (put back); no agent ⇒ fitted; refused ⇒ failed', JSON.stringify(outcomes.map(([i, w]) => [FIT.ownSetOutcome(i), w])));
  ok(FIT.restoreDeferred('running') && FIT.restoreDeferred('waiting') && !FIT.restoreDeferred('idle') && !FIT.restoreDeferred(null) && !FIT.restoreDeferred(undefined), 'restoreDeferred: a KNOWN running / paused-on-the-user turn waits; idle or unknown restores on the clock');
  const note = FIT.fitNoteOf({ agent: { kind: 'viewport', width: 800, height: 600, scale: 1, id: 'r1', seq: 9, at: 5 }, applied: { width: 700, height: 900, viewerId: 3, rule: 'largest', at: 1 }, baseline: { width: 1280, height: 577 }, floorW: 500 });
  ok(JSON.stringify(note) === JSON.stringify({ agent: { kind: 'viewport', width: 800, height: 600, scale: 1, device: null, at: 5 }, applied: { width: 700, height: 900 }, baseline: { width: 1280, height: 577 }, floorW: 500 }), 'fitNoteOf: the note carries the agent choice / applied / baseline / floor and nothing transient (no id, no seq, no viewer)', JSON.stringify(note));
  const back = FIT.fitStateFromNote(note);
  ok(back.agent && back.agent.width === 800 && back.agent.seq === null && back.agent.id === null && back.applied.width === 700 && back.baseline.height === 577 && back.floorW === 500 && FIT.fitStateFromNote(null) === null && FIT.fitStateFromNote({ agent: { kind: 'device' } }).agent === null, 'fitStateFromNote: the state back (seq/id unknown), a nameless device is no choice, no note ⇒ null');
  // our own mirror recognition now takes a factor and a device
  const pendD = { device: 'iPhone 12', at: 1000, inFlight: true, id: null };
  ok(FIT.ownViewportRecord({ type: 'command', action: 'device', id: 'r9', params: { action: 'device', device: 'iPhone 12' } }, pendD, 1100).own && !FIT.ownViewportRecord({ type: 'command', action: 'device', id: 'r9', params: { action: 'device', device: 'Pixel 5' } }, pendD, 1100).own && !FIT.ownViewportRecord({ type: 'command', action: 'viewport', id: 'r9', params: { action: 'viewport', width: 390, height: 844 } }, pendD, 1100).own, 'a pending `set device NAME` (the agent\'s choice put back) is OUR mirror by the name, nothing else is');
  const pendS = { width: 390, height: 844, scale: 2, at: 1000, inFlight: true, id: null };
  ok(FIT.ownViewportRecord(FIX.mirror['set viewport 390 844 2'][2], pendS, 1100).own && !FIT.ownViewportRecord(FIX.mirror['set viewport 390 844 2'][2], { ...pendS, scale: 1 }, 1100).own && !FIT.ownViewportRecord(FIX.mirror['set viewport 390 844 2'][2], { width: 390, height: 844, at: 1000, inFlight: true, id: null }, 1100).own, 'a pending set WITH a factor is ours only at that factor (the fixture\'s measured `set viewport 390 844 2` mirror)');

  // the bridge: the two orders of the race, judged by the daemon's order
  const raceLeg = async (BSmod, order) => {
    const U = await fakeUpstream(); cleanups.push(() => U.close());
    let calls = 0;
    const { k, calls: c } = stubKeeper(U);
    k.setViewportFor = async (target, { width, height, scale, device }) => { c.set.push(device ? ['device', device] : [width, height]); calls++; if (calls === 1) { await sleep(5); if (order === 'agent-first') { U.mirrorSet(800, 600, { agent: true }); await sleep(5); U.mirrorSet(width, height); } else { U.mirrorSet(width, height); await sleep(5); U.mirrorSet(800, 600, { agent: true }); } await sleep(50); return { ok: true }; } await sleep(5); U.mirrorSet(width, height); await sleep(5); return { ok: true }; };
    const B = await bridgeOn(BSmod, k);
    const A = viewer(B.P); await A.ready();
    A.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true });
    await until(() => c.set.length >= 1, 3000); await sleep(700);
    const st = B.bridge.stats()[0].fit;
    A.send({ type: 'fit', width: 650, height: 800, dpr: 1, visible: true }); await sleep(600); // a later pane change
    const out = { page: { ...U.page }, sets: c.set.slice(), last: A.lastFit() && [A.lastFit().state, A.lastFit().width, A.lastFit().height], agent: st.agent && [st.agent.width, st.agent.height], applied: st.applied && [st.applied.width, st.applied.height], fits: A.fits().map((x) => x.state) };
    await A.close(); await B.close(); await U.close();
    return out;
  };
  const r1 = await raceLeg(BS, 'agent-first');
  ok(r1.page.w === 800 && r1.page.h === 600 && r1.sets.length === 2 && r1.sets[1].join() === '800,600' && r1.applied === null && r1.last[0] === 'agent' && r1.last[1] === 800, `THE RACE, ours landing AFTER the agent's \`set viewport 800 600\`: the bridge sees ours was mirrored later and PUTS THE AGENT'S BACK (sets ${JSON.stringify(r1.sets)}, page ${r1.page.w}×${r1.page.h}, last "${r1.last && r1.last.join('×')}"); a later pane change never overrides it`, JSON.stringify(r1));
  const r2 = await raceLeg(BS, 'ours-first');
  ok(r2.page.w === 800 && r2.sets.length === 1 && r2.applied === null && r2.last[0] === 'agent' && r2.last[1] === 800 && !r2.fits.includes('fitted'), `THE RACE, the agent's landing AFTER ours: nothing of ours applies and no viewer is ever told "fitted" over the agent's page (fits ${JSON.stringify(r2.fits)}, sets ${r2.sets.length}, last "${r2.last && r2.last.join('×')}")`, JSON.stringify(r2));

  // the restore waits for a KNOWN running turn
  const turnLeg = async (BSmod) => {
    const U = await fakeUpstream(); cleanups.push(() => U.close());
    const { k, calls } = stubKeeper(U);
    const sess = { mode: 'chat', _isStreaming: true, _turnState: 'running', _browserKey: 'bk-0000000a', _browserEnv: ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a'] };
    const activeSessions = new Map([['s1', sess]]);
    const logs = [];
    const bridge = BSmod.create({ keeper: k, activeSessions, requestAuthed: () => true, log: { warn: (m) => logs.push(m), log: (m) => logs.push(m) } });
    const srv = http.createServer((_q, res) => { res.statusCode = 404; res.end(); });
    srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head));
    const P = await freePort(); await new Promise((r) => srv.listen(P, '127.0.0.1', r));
    const A = viewer(P); await A.ready();
    A.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true });
    await until(() => A.lastFit() && A.lastFit().state === 'fitted', 3000);
    A.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: false });
    await sleep(FIT.RESTORE_AFTER_MS + 1500);
    const midTurn = calls.set.slice();
    sess._isStreaming = false; sess._turnState = 'idle';
    await until(() => calls.set.length >= 2, FIT.RESTORE_AFTER_MS + 2000, 100);
    const out = { midTurn, after: calls.set.slice(), said: logs.some((l) => /mid-turn/.test(l)), last: A.lastFit() && A.lastFit().state };
    await A.close(); bridge.shutdown(); await new Promise((r) => srv.close(() => r())); await U.close();
    return out;
  };
  const tl = await turnLeg(BS);
  ok(tl.midTurn.length === 1 && tl.said, `nobody watching MID-TURN (a chat session, _isStreaming): the restore WAITS (sets ${JSON.stringify(tl.midTurn)}; the journal says so once)`, JSON.stringify(tl));
  ok(tl.after.length === 2 && tl.after[1].join() === '1280,577' && tl.last === 'restored', `…and the turn ending releases it: the page goes back (sets ${JSON.stringify(tl.after)})`, JSON.stringify(tl));

  // the persisted note: a NEW bridge (a server restart) over the same keeper still knows the agent chose the size and the baseline
  const noteLeg = async (BSmod) => {
    const U = await fakeUpstream(); cleanups.push(() => U.close());
    const { k, calls } = stubKeeper(U);
    const rec = { viewport: null };
    k.viewportNoteFor = () => (rec.viewport ? { ...rec.viewport } : null);
    k.noteViewport = (t, n) => { rec.viewport = n ? { ...n } : null; return true; };
    const B1 = await bridgeOn(BSmod, k);
    const A = viewer(B1.P); await A.ready();
    A.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true });
    await until(() => A.lastFit() && A.lastFit().state === 'fitted', 3000);
    const noteFitted = rec.viewport && JSON.parse(JSON.stringify(rec.viewport));
    U.mirrorSet(800, 600, { agent: true }); await sleep(300);
    const noteAgent = rec.viewport && JSON.parse(JSON.stringify(rec.viewport));
    await A.close(); await B1.close(); // "the server restarts" — the bridge's memory is gone, the keeper's record is not
    const B2 = await bridgeOn(BSmod, k);
    const Bv = viewer(B2.P); await Bv.ready();
    Bv.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true }); await sleep(800);
    const afterRestart = { sets: calls.set.slice(), last: Bv.lastFit() && [Bv.lastFit().state, Bv.lastFit().width], agent: B2.bridge.stats()[0].fit.agent };
    await Bv.close(); await B2.close();
    // the note is STALE: the browser came back at its own size (a relaunch) — the first picture forgets the agent's choice and the fit proceeds
    U.page = { w: 1280, h: 577 };
    const B3 = await bridgeOn(BSmod, k);
    const Cv = viewer(B3.P); await Cv.ready();
    Cv.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true });
    await until(() => Cv.lastFit() && Cv.lastFit().state === 'fitted', 4000);
    const stale = { sets: calls.set.slice(afterRestart.sets.length), last: Cv.lastFit() && [Cv.lastFit().state, Cv.lastFit().width], note: rec.viewport };
    await Cv.close(); await B3.close(); await U.close();
    return { noteFitted, noteAgent, afterRestart, stale };
  };
  const nl = await noteLeg(BS);
  ok(nl.noteFitted && nl.noteFitted.applied && nl.noteFitted.applied.width === 700 && nl.noteFitted.baseline && nl.noteFitted.baseline.width === 1280 && nl.noteFitted.agent === null, 'the keeper\'s note after our fit: applied 700×900, baseline 1280×577, no agent choice', JSON.stringify(nl.noteFitted));
  ok(nl.noteAgent && nl.noteAgent.agent && nl.noteAgent.agent.width === 800 && nl.noteAgent.applied === null, 'the note after the agent\'s `set viewport 800 600`: the agent choice, nothing of ours applied', JSON.stringify(nl.noteAgent));
  ok(nl.afterRestart.sets.length === 1 && nl.afterRestart.last[0] === 'agent' && nl.afterRestart.last[1] === 800 && nl.afterRestart.agent && nl.afterRestart.agent.width === 800, `A NEW BRIDGE (a server restart) over the same keeper: the first viewer's pane is LETTERBOXED under "Agent's size 800×600", never fitted over it (sets ${nl.afterRestart.sets.length})`, JSON.stringify(nl.afterRestart));
  ok(nl.stale.sets.length === 1 && nl.stale.sets[0].join() === '700,900' && nl.stale.last[0] === 'fitted' && nl.stale.note && nl.stale.note.agent === null, `a STALE note (the browser came back at its own 1280×577): the first picture forgets the agent's 800×600 and the pane is fitted (sets ${JSON.stringify(nl.stale.sets)}, note.agent ${JSON.stringify(nl.stale.note && nl.stale.note.agent)})`, JSON.stringify(nl.stale));

  // the real keeper's note lives on the browser record and is written without a roster notify
  {
    const K = require('../src/server/browser-keeper.js');
    const dir = path.join(ROOT, 'keeper-note'); fs.mkdirSync(dir, { recursive: true });
    let notifies = 0;
    const kp = K.create({ dataDir: dir, homeDir: dir, env: () => ({}), broadcast: () => { notifies++; }, log: { log() { }, warn() { } } });
    const eph = kp.list().profiles.length; // nothing yet
    ok(kp.viewportNoteFor({ ok: true, kind: 'ephemeral', ns: 'vs-bk-nobody', envPairs: ['AGENT_BROWSER_SESSION=vs-bk-nobody'] }) === null && kp.noteViewport({ ok: true, kind: 'ephemeral', ns: 'vs-bk-nobody' }, { agent: null }) === false, `no browser record ⇒ no note, and nothing written (${eph} profiles)`);
    ok(typeof kp.setViewportFor === 'function' && typeof kp.noteViewport === 'function' && typeof kp.viewportNoteFor === 'function', 'the keeper exposes setViewportFor / noteViewport / viewportNoteFor');
    ok(notifies === 0, 'a note is never a roster broadcast');
  }

  // the client: the hiders that write the element's style (a desktop switch, the stage) re-report the pane
  const live = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/const mo = new MutationObserver\(scheduleReport\); mo\.observe\(winInfo\.element, \{ attributes: true, attributeFilter: \['style', 'class'\] \}\);/.test(live) && /'abort', \(\) => mo\.disconnect\(\)/.test(live), 'a desktop switch (visibility:hidden written on the window element — no resize, no visibilitychange) re-reports the pane: a MutationObserver on the element\'s style/class, released with the window');
  const st2 = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  ok(/@media \(max-width: 768px\) \{\n  \.window\.tab-split\.window-active \{ display: flex !important; \}/.test(st2) && !/\n  \.window\.tab-split \{ display: flex !important; \}/.test(st2), 'the phone displays only the ACTIVE split host (unscoped, every split host was displayed and the active window flowed below it — a second browsing conversation\'s live view opened off the screen)');
  const dm = fs.readFileSync(path.join(REPO, 'src/lib/desktop-manager.js'), 'utf8');
  ok(/_hideWin\(win\) \{\n\s+win\._hiddenByDesktop = true;\n\s+win\.element\.style\.visibility = 'hidden';/.test(dm), 'control fact: the desktop manager hides a window by writing visibility:hidden on its element (the observer\'s trigger)');

  // NEGATIVE CONTROLS (patched copies): no order judgement ⇒ the agent's explicit size is overridden and announced "fitted"; no deferral ⇒ the restore lands mid-turn
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
  const T5 = "    const outcome = FIT.ownSetOutcome({ ok: !!(r && r.ok), pending: fs.pending || fs.ownDone, agent: fs.agent });\n";
  ok(src.includes(T5), 'control setup: the order-judged outcome is found');
  const noOutcome = M.load('src/server/browser-stream.js', src.replace(T5, "    const outcome = r && r.ok ? 'fitted' : 'failed';\n"), 'no-outcome');
  const c1 = await raceLeg(noOutcome, 'agent-first');
  ok(c1.page.w === 700 && c1.sets.length === 1 && c1.applied && c1.applied[0] === 700, `NEGATIVE CONTROL: without the order judgement our fit that landed after the agent's \`set viewport 800 600\` OVERRIDES it for good — the page is ${c1.page.w}×${c1.page.h}, the bridge holds applied ${JSON.stringify(c1.applied)} beside agent ${JSON.stringify(c1.agent)}`, JSON.stringify(c1));
  const T6 = "      if (FIT.restoreDeferred(turn)) {";
  ok(src.includes(T6), 'control setup: the deferred restore is found');
  const noDefer = M.load('src/server/browser-stream.js', src.replace(T6, "      if (false) {"), 'no-defer');
  const c2 = await turnLeg(noDefer);
  ok(c2.midTurn.length === 2 && c2.midTurn[1].join() === '1280,577', `NEGATIVE CONTROL: without the deferral the restore lands MID-TURN (sets ${JSON.stringify(c2.midTurn)}) — the page reflows under the agent's feet`, JSON.stringify(c2));
}

// ═══ ⑥ VERIFY r1 (continuation): the order judged when the mirrors land AFTER our CLI call returned; a size the page did
//     not take is said (LOW 8); a note's agent choice on a headed floor survives the first picture ═══
console.log('— ⑥ verify r1 (continuation): late mirrors, a size the page did not take, the headed agent choice');
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-stream.js'), 'utf8');
  /** late-both: the agent's mirror then ours land ~60 ms AFTER our call returned (the return saw no agent: "fitted");
   *  late-ours: the agent's mirror lands before the return, ours ~80 ms after it (the return set ours aside for a put-back).
   *  The daemon's order is kept by the fake: the put-back's mirror always follows ours. */
  const lateLeg = async (BSmod, mode) => {
    const U = await fakeUpstream(); cleanups.push(() => U.close());
    const { k, calls: c } = stubKeeper(U);
    let n = 0, late = Promise.resolve();
    k.setViewportFor = async (target, { width, height, device }) => {
      c.set.push(device ? ['device', device] : [width, height]); n++;
      if (n === 1) {
        if (mode === 'late-both') { late = sleep(60).then(() => { U.mirrorSet(800, 600, { agent: true }); U.mirrorSet(width, height); }); await sleep(5); }
        else { U.mirrorSet(800, 600, { agent: true }); late = sleep(80).then(() => U.mirrorSet(width, height)); await sleep(30); }
        return { ok: true };
      }
      await late; await sleep(5); U.mirrorSet(width, height); await sleep(5); return { ok: true };
    };
    const B = await bridgeOn(BSmod, k);
    const A = viewer(B.P); await A.ready();
    A.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true });
    await until(() => c.set.length >= 1, 3000); await sleep(900);
    const st = B.bridge.stats()[0].fit;
    A.send({ type: 'fit', width: 650, height: 800, dpr: 1, visible: true }); await sleep(600); // a later pane change
    const out = { page: { ...U.page }, sets: c.set.slice(), last: A.lastFit() && [A.lastFit().state, A.lastFit().width, A.lastFit().height], agent: st.agent && [st.agent.width, st.agent.height], applied: st.applied && [st.applied.width, st.applied.height], logs: B.logs.filter((l) => /putting the agent/.test(l)).length };
    await A.close(); await B.close(); await U.close();
    return out;
  };
  const good = (o) => o.page.w === 800 && o.page.h === 600 && o.sets.length === 2 && o.sets[1].join() === '800,600' && o.agent && o.agent.join() === '800,600' && o.applied === null && o.last && o.last[0] === 'agent' && o.last[1] === 800;
  const l1 = await lateLeg(BS, 'late-both');
  ok(good(l1), `LATE MIRRORS (both land after our call returned, the agent's first): judged when ours lands — the agent's put back (sets ${JSON.stringify(l1.sets)}, page ${l1.page.w}×${l1.page.h}, bridge agent ${JSON.stringify(l1.agent)}, last "${l1.last && l1.last.join('×')}")`, JSON.stringify(l1));
  const l2 = await lateLeg(BS, 'late-ours');
  ok(good(l2), `LATE MIRROR OF OURS (the agent's landed before the return, ours after the put-back began): ours is still OURS — never read as the agent's 700×900 (bridge agent ${JSON.stringify(l2.agent)}, page ${l2.page.w}×${l2.page.h})`, JSON.stringify(l2));

  // LOW 8: the set "succeeds" and is mirrored but the page keeps its own size ⇒ said once as unavailable, not re-asked
  const notTakenLeg = async (BSmod) => {
    const U = await fakeUpstream(); cleanups.push(() => U.close());
    const { k, calls } = stubKeeper(U);
    k.setViewportFor = async (target, { width, height }) => { calls.set.push([width, height]); const keep = { ...U.page }; U.mirrorSet(width, height); U.page = keep; await sleep(5); return { ok: true }; };
    const B = await bridgeOn(BSmod, k);
    const A = viewer(B.P); await A.ready();
    const tick = setInterval(() => U.frame('tick'), 100);
    A.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true });
    await until(() => A.lastFit() && A.lastFit().state === 'unavailable', 7000, 50);
    A.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: false }); await sleep(150);
    A.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true }); await sleep(900); // the same pane again: not re-asked
    clearInterval(tick);
    const st = B.bridge.stats()[0].fit;
    const out = { sets: calls.set.slice(), fits: A.fits().map((x) => x.state), last: A.lastFit() && { state: A.lastFit().state, code: A.lastFit().code, w: A.lastFit().width, error: A.lastFit().error }, applied: st.applied };
    await A.close(); await B.close(); await U.close();
    return out;
  };
  const nt = await notTakenLeg(BS);
  ok(nt.fits.includes('unavailable') && nt.fits.filter((x) => x === 'unavailable').length === 1 && nt.applied === null && nt.sets.length === 1 && nt.fits.at(-1) === 'unavailable' && /did not take/.test((nt.last && nt.last.error) || ''), `a size the page did NOT take (the picture stays 1280×577 after a "successful" 700×900): said ONCE as unavailable (${JSON.stringify(nt.last)}), the bridge stops believing it (applied ${JSON.stringify(nt.applied)}), not re-asked (${nt.sets.length} set)`, JSON.stringify(nt));

  // the headed floor: a note's agent choice narrower than 500 px comes back SCALED on the first picture — still the agent's
  const headedLeg = async (BSmod) => {
    const U = await fakeUpstream(); cleanups.push(() => U.close());
    U.headed = true; U.page = { w: 390, h: 844 };
    const { k, calls } = stubKeeper(U);
    let note = FIT.fitNoteOf({ agent: { kind: 'viewport', width: 390, height: 844, scale: 1, at: 1 }, baseline: { width: 1241, height: 1252 } });
    k.viewportNoteFor = () => (note ? { ...note } : null); k.noteViewport = (t, x) => { note = x ? { ...x } : null; return true; };
    const B = await bridgeOn(BSmod, k);
    const V = viewer(B.P); await V.ready();
    V.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true }); await sleep(2300);
    const st = B.bridge.stats()[0].fit;
    const out = { sets: calls.set.slice(), agent: st.agent && [st.agent.width, st.agent.height], last: V.lastFit() && V.lastFit().state, noteAgent: note && note.agent && note.agent.width };
    await V.close(); await B.close(); await U.close();
    return out;
  };
  const hl = await headedLeg(BS);
  ok(hl.sets.length === 0 && hl.agent && hl.agent.join() === '390,844' && hl.last === 'agent' && hl.noteAgent === 390, `a noted agent choice of 390×844 on a HEADED browser (the first picture 390×658, the floor's scaling): still the agent's — letterboxed, never fitted over (sets ${hl.sets.length})`, JSON.stringify(hl));

  // the REAL keeper with a browser record: the note lands on the record (ephemeral by its browser key, an attachment by its
  // profile id), on disk, never broadcast — and a NEW keeper over the same data dir (a server restart) reads it back
  {
    const K = require('../src/server/browser-keeper.js');
    const dir = path.join(ROOT, 'keeper-note-rec'); fs.mkdirSync(dir, { recursive: true });
    const recOf = (id, extra = {}) => ({ profileId: id, ns: 'vs-x', pid: null, state: 'ready', startedAt: 1, endedAt: null, ...extra });
    fs.writeFileSync(path.join(dir, 'browser-profiles.json'), JSON.stringify({ version: 1,
      profiles: [{ id: 'bp-0000000b', label: '(ephemeral) s1', ephemeral: true, owner: { kind: 'conversation', id: 'bk-0000000b' }, createdAt: 1 }, { id: 'bp-0000000c', label: 'Work', createdAt: 1 }],
      browsers: { 'bp-0000000b': recOf('bp-0000000b', { ephemeral: true }), 'bp-0000000c': recOf('bp-0000000c') } }));
    let notifies = 0;
    const mk = () => K.create({ dataDir: dir, homeDir: dir, env: () => ({}), broadcast: () => { notifies++; }, log: { log() { }, warn() { } } });
    const k1 = mk();
    const tE = { ok: true, kind: 'ephemeral', ns: 'vs-bk-0000000b', sessionName: 'vs-bk-0000000b', envPairs: [] };
    const tA = { ok: true, kind: 'attachment', profileId: 'bp-0000000c', ns: 'vs-bp-0000000c' };
    const nE = FIT.fitNoteOf({ agent: { kind: 'viewport', width: 800, height: 600, scale: 1, at: 7 }, baseline: { width: 1280, height: 577 } });
    const nA = FIT.fitNoteOf({ applied: { width: 700, height: 900 }, baseline: { width: 1280, height: 577 }, floorW: 500 });
    const w1 = k1.noteViewport(tE, nE), w2 = k1.noteViewport(tA, nA);
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'browser-profiles.json'), 'utf8'));
    const k2 = mk(); // "the server restarts"
    const rE = k2.viewportNoteFor(tE), rA = k2.viewportNoteFor(tA);
    ok(w1 && w2 && disk.browsers['bp-0000000b'].viewport && disk.browsers['bp-0000000b'].viewport.agent.width === 800 && disk.browsers['bp-0000000c'].viewport.applied.width === 700 && notifies === 0, `the real keeper writes the note ON the browser record (ephemeral by its browser key, an attachment by its profile id), to disk, with no roster broadcast (${notifies})`, JSON.stringify(disk.browsers));
    ok(rE && rE.agent && rE.agent.width === 800 && rA && rA.applied && rA.applied.width === 700 && rA.floorW === 500 && JSON.stringify(FIT.fitStateFromNote(rE).agent && FIT.fitStateFromNote(rE).agent.width) === '800', 'a NEW keeper over the same data dir (a server restart) reads both notes back — the bridge seeds the agent choice and the floor from them', JSON.stringify({ rE, rA }));
  }

  // F6: OUR resize is in the action trace — the recorder's tap gets ONE `viewer-fit` pair (traced as kind 'viewport'),
  // never our raw `viewport` mirror; the viewers never see it (no "Running a command")
  const T_ = require('../src/browser-trace.js');
  const traceLeg = async (BSmod) => {
    const U = await fakeUpstream(); cleanups.push(() => U.close());
    const { k } = stubKeeper(U);
    const B = await bridgeOn(BSmod, k);
    const got = [];
    const tp = await B.bridge.tap('s1', '', (m) => { if (m && (m.type === 'command' || m.type === 'result')) got.push(m); });
    const A = viewer(B.P); await A.ready();
    A.send({ type: 'fit', width: 700, height: 900, dpr: 1, visible: true });
    await until(() => A.lastFit() && A.lastFit().state === 'fitted', 3000); await sleep(200);
    U.mirrorSet(800, 600, { agent: true }); await sleep(300); // the agent's own set: a raw `viewport` pair (an observation, untraced)
    const traced = got.filter((m) => m.type === 'command' && T_.isTracedCommand(m));
    const entry = traced[0] ? T_.entryFor({ id: 'tr-000000000001', at: 1, command: traced[0], result: got.find((m) => m.type === 'result' && m.id === traced[0].id) || null, position: T_.positionOf({ kind: T_.classifyAction(traced[0].action), params: traced[0].params }) }) : null;
    const out = { traced: traced.map((m) => [m.action, m.params]), ownRaw: got.filter((m) => m.action === 'viewport' && m.params && m.params.width === 700).length, viewerSaw: A.msgs.filter((m) => m.type === 'command' && (m.action === 'viewer-fit' || (m.action === 'viewport' && m.params && m.params.width === 700))).length, entry: entry && { kind: entry.kind, text: entry.text, ok: entry.ok, label: T_.timelineLabel(entry), pos: T_.positionText(entry.position) } };
    try { tp && tp.untap && tp.untap(); } catch { }
    await A.close(); await B.close(); await U.close();
    return out;
  };
  const tr = await traceLeg(BS);
  ok(tr.traced.length === 1 && tr.traced[0][0] === 'viewer-fit' && tr.traced[0][1].width === 700 && tr.traced[0][1].why === 'fit' && tr.ownRaw === 0 && tr.viewerSaw === 0 && tr.entry && tr.entry.kind === 'viewport' && tr.entry.ok === true && tr.entry.text === 'live view: set viewport 700 900 (fit)' && tr.entry.label === 'viewer-fit 700×900', `F6: the live view's resize is ONE traced row for the recorder ("${tr.entry && tr.entry.text}", kind ${tr.entry && tr.entry.kind}, label "${tr.entry && tr.entry.label}") — never our raw mirror, never a viewer's command; the agent's own \`viewport\` stays an untraced observation`, JSON.stringify(tr));
  ok(T_.classifyAction('viewport') === null && T_.classifyAction('viewer-fit') === 'viewport' && T_.positionText(T_.positionOf({ kind: 'viewport', params: { device: 'iPhone 12', why: 'put-back' } })) === 'iPhone 12' && /set device iPhone 12 \(put-back\)/.test(T_.commandText('viewer-fit', { device: 'iPhone 12', why: 'put-back' })), 'the trace table: `viewer-fit` → kind viewport (a device put back names the device); the daemon\'s own `viewport` verb stays an observation');
  const tv = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(/if \(k === 'viewport'\) return t\('page size'\);/.test(tv) && /"page size": "/.test(zh) && /"page size": "/.test(ja), 'the trace view words the kind ("page size", zh + ja)');

  // NEGATIVE CONTROLS (patched copies)
  const T7 = 'if (!p.inFlight && !p.putBack) lateJudge(relay, fs);';
  const T8 = "for (const slot of ['pending', 'prevOwn']) {";
  const T9 = "if (h === 'other' && fs && fs.applied && !fs.agent";
  const T10 = "FIT.fitHonored({ fit: f.agent, picture: sz }) === 'other') {";
  ok([T7, T8, T9, T10].every((x) => src.split(x).length === 2), 'control setup: the late judgement, the prevOwn slot, the not-taken verdict and the headed-agent rule are each found once');
  const c7 = await lateLeg(M.load('src/server/browser-stream.js', src.replace(T7, ''), 'no-late-judge'), 'late-both');
  ok(!good(c7) && c7.page.w === 700 && c7.agent && c7.agent.join() === '800,600', `NEGATIVE CONTROL: without the late judgement our fit that landed after the agent's overrides it for good — page ${c7.page.w}×${c7.page.h} while the bridge says agent ${JSON.stringify(c7.agent)}`, JSON.stringify(c7));
  const c8 = await lateLeg(M.load('src/server/browser-stream.js', src.replace(T8, "for (const slot of ['pending']) {"), 'no-prev-own'), 'late-ours');
  ok(!good(c8) && c8.agent && c8.agent.join() === '700,900', `NEGATIVE CONTROL: without prevOwn our own late 700×900 mirror is read as the AGENT's choice (bridge agent ${JSON.stringify(c8.agent)} over a ${c8.page.w}×${c8.page.h} page)`, JSON.stringify(c8));
  const c9 = await notTakenLeg(M.load('src/server/browser-stream.js', src.replace(T9, 'if (false && ' + T9.slice(4)), 'no-not-taken'));
  ok(!c9.fits.includes('unavailable') && c9.applied && c9.applied.width === 700, `NEGATIVE CONTROL: without the not-taken verdict the bridge keeps believing 700×900 over a 1280×577 page, silently (applied ${JSON.stringify(c9.applied && [c9.applied.width, c9.applied.height])}, fits ${JSON.stringify(c9.fits)})`, JSON.stringify(c9));
  const T11 = 'tapOwnSet(relay, p, msg); // F6';
  ok(src.split(T11).length === 2, 'control setup: the F6 tap of our own resize is found once');
  const c11 = await traceLeg(M.load('src/server/browser-stream.js', src.replace(T11, '// F6'), 'no-trace-row'));
  ok(c11.traced.length === 0 && c11.ownRaw === 0, `NEGATIVE CONTROL: without the F6 tap the resize never reaches the trace (${c11.traced.length} traced rows) — the agent's clicks before and after it look alike`, JSON.stringify(c11));
  const c10 = await headedLeg(M.load('src/server/browser-stream.js', src.replace(T10, "FIT.fitHonored({ fit: f.agent, picture: sz }) !== 'exact') {"), 'agent-exact-only'));
  ok(c10.sets.length >= 1 && c10.agent === null, `NEGATIVE CONTROL: forgetting any agent choice that is not EXACTLY on the first picture drops a headed 390×844 and fits over it (sets ${JSON.stringify(c10.sets)})`, JSON.stringify(c10));
}

for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 13, label: 'browser-fit controls: ' })) ok(c.pass, c.name, c.detail);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
