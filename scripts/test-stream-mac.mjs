#!/usr/bin/env node
// THE MAC'S STREAM (lane stream-p3m-build — design q-041 r3 §1/§3 P3m; the measured facts: lane stream-p3m-probe): a paired
// Mac's whole display or ONE window through its screen helper (tools/vibespace-screen — ScreenCaptureKit + VideoToolbox +
// CGEvent), spawned DISCLAIMED at a FIXED path. The helper here is a FAKE (scripts/fixtures/stream/mac-fakes.mjs: a Node
// script answering facts / capture / input from shapes); the REAL agent source (src/agentd/stream-mac.js), injector
// (src/input-inject.js) and daemon (data/bin/vibespace-agentd.js) drive it.
//   §1 PURE — the darwin plan table (the size ladder 1440p60 / 4K30, a window at its own pixels, every refusal by name), the
//      facts parser, the disclaimed-spawn plan (argv + the flag), the fixed path, the on-box build's argvs, the window source
//      shape (the seam with lane stream-p2w-build), the input mapping (picture pixel → global point, virtual key codes), the
//      live bitrate rule, the rung verdicts (an older Mac agent ⇒ agent_too_old; Windows unchanged)
//   §2 the helper's source rides the bundle verbatim (src/agentd/mac-helper-source.js = tools/…swift; VERSION = its sha) and
//      carries the probe's laws (disclaim, sRGB, NSApplication before a window filter, the key / bitrate never set from the
//      output callback)
//   §3 THE HELPER'S PLACE: ready at the shipped version (nothing run); none + no compiler ⇒ no_helper (the trampoline is never
//      run); the hub's pushed prebuilt is put in place; a compiler ⇒ built (both slices at once, then lipo, codesign); a
//      REPLACED helper that held its grant ⇒ regrant until the facts see the grant again; never rebuilt at the same version
//   §4 THE SOURCE end to end over the fake: facts; the display's pictures = THE fixture byte for byte; the argv it ran; a key
//      on the SAME request (`key` on stdin); the bitrate LIVE (`bps`, once a second at most); the numbers; the input target;
//      a window (its id, its pid, a move); endings BY NAME (window_minimized, display_gone, capture_exited); refusals BY NAME
//      (screen_permission + its Settings link + ONE row-adding run, helper_changed_regrant, no_helper with what the hub needs)
//   §5 THE INJECTOR on a Mac: `P <pid>` once per target, keys as virtual key codes, the pointer in global points, no
//      Accessibility ⇒ accessibility_permission, no helper ⇒ no_helper
//   §6 A REAL Mac-shaped daemon: the hello-ack names stream-mac + stream-window; stream-facts answers the Mac's facts; a screen
//      offer plays THE fixture to a werift stand-in; the data channel's key + click reach the helper's input in points; an
//      older Mac agent (no stream-mac) is never asked (agent_too_old); a Mac with no helper and no compiler gets the HUB's
//      prebuilt over the device link (src/server/desktop-webrtc.js) and the offer is asked once more
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, endDaemonsOf } from './scratch.mjs';
import { flvBytes } from './fixtures/stream/screen-fakes.mjs';
import { writeFakeMacHelper, helperLog, MAC_FACTS } from './fixtures/stream/mac-fakes.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const T0 = Date.now();
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(25); } return false; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const SM = require(path.join(REPO, 'src/stream-model.js'));
const H = require(path.join(REPO, 'src/stream-h264.js'));
const I = require(path.join(REPO, 'src/input-inject.js'));
const MAC = require(path.join(REPO, 'src/agentd/stream-mac.js'));
const SRC = require(path.join(REPO, 'src/agentd/mac-helper-source.js'));
const FIXTURE = path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264');
const AUS = H.accessUnits(H.splitNalus(fs.readFileSync(FIXTURE)));
const K0 = AUS.findIndex((a) => a.key);
const homes = [];
const home = (n) => { const h = scratchHome(n, fs, ['.vibespace']); homes.push(h); return h; };
const cleanups = [];
process.on('exit', () => { for (const f of cleanups) { try { f(); } catch { } } for (const h of homes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch { } } });
const flvFile = (h) => { const f = path.join(h, 'desk.flv'); fs.writeFileSync(f, flvBytes(AUS.slice(K0), 30)); return f; };
const facts = (over = {}) => ({ platform: 'darwin', helper: { state: 'ready', bin: '/Users/u/.vibespace/helpers/vibespace-screen', regrant: false }, tcc: { screen: 'granted', accessibility: 'granted' }, ...SP.parseMacFacts(JSON.stringify({ t: 'facts', ...MAC_FACTS, tcc: { screen: 'granted' } })), ...over });

console.log(`[${((Date.now() - T0) / 1000).toFixed(1)} s] ` + '§1 PURE — the Mac\'s plan, facts, spawn, build, window shape, input, verdicts');
{
  const f = SP.parseMacFacts('noise\n' + JSON.stringify({ t: 'facts', version: 'vs-x', disclaimed: true, ...MAC_FACTS, tcc: { screen: 'granted', accessibility: 'bogus' } }) + '\n');
  ok(f.ok && f.displays.length === 2 && f.displays[0].id === '3' && f.displays[0].pw === 3840 && f.displays[0].scale === 2 && f.displays[0].main && f.windows.length === 2 && f.windows[0].id === '4242' && f.windows[1].minimized === true && f.tcc.screen === 'granted' && f.tcc.accessibility === 'unknown' && f.disclaimed === true, 'parseMacFacts: displays (points + pixels + scale), windows (ids as strings, minimized), TCC (an unknown word ⇒ unknown)', f);
  ok(SP.parseMacFacts('nothing').code === 'bad_output', 'no facts line ⇒ bad_output');
  const m = SP.planScreen(facts());
  ok(m.ok && m.mode === 'videotoolbox' && m.kind === 'display' && m.display.id === '3' && m.w === 2560 && m.h === 1440 && m.fps === 60 && m.rung === '1440p60' && m.white === null && m.encoder.label === 'VideoToolbox' && same(m.origin, { x: 0, y: 0 }) && same(m.args, ['capture', '--display', '3', '--fps', '60', '--size', '2560x1440', '--kbps', '8000']), 'planScreen\'s darwin branch: the main 4K display → 1440p60 (SCK scales it; 4K60 is out of reach), VideoToolbox, no mapping road, the helper\'s argv', m);
  ok(SP.planScreen(facts(), { display: '2', kbps: 5000 }).args.join(' ') === 'capture --display 2 --fps 60 --size 2560x1440 --kbps 5000' && SP.planScreen(facts(), { quality: 'full' }).rung === '4k30' && SP.planScreen(facts(), { quality: 'full' }).fps === 30 && SP.planScreen(facts(), { quality: 'full' }).w === 3840, 'a display by id at its rate; quality full = native 4K at 30 fps (18.7 ms a frame, measured)');
  const small = SP.planScreen(facts({ displays: [{ id: '5', x: 0, y: 0, w: 1440, h: 900, pw: 2880, ph: 1800, scale: 2, main: true }] }));
  const mid = SP.planScreen(facts({ displays: [{ id: '5', x: 0, y: 0, w: 1280, h: 800, pw: 2560, ph: 1600, scale: 2, main: true }] }));
  ok(small.rung === '1440p60' && small.w === 2304 && small.h === 1440 && mid.rung === 'native60' && mid.w === 2560 && mid.h === 1600 && mid.fps === 60, 'the ladder keeps the aspect (2880×1800 → 2304×1440) and a display that fits 2560×1600 streams native at 60', { small, mid });
  const w = SP.planScreen(facts(), { window: '4242' });
  ok(w.ok && w.kind === 'window' && w.display.id === '2' && w.w === 1312 && w.h === 844 && w.rung === 'native60' && same(w.args, ['capture', '--window', '4242', '--fps', '60', '--size', '1312x844', '--kbps', '8000']), 'a window: its own pixels (656×422 pt on the 2× display it sits on → 1312×844, title bar included) at 60', w);
  ok(same(w.window, { kind: 'window', id: '4242', title: 'notes.txt', app: 'TextEdit', bounds: { x: -3356, y: 212, w: 1312, h: 844 }, display: '2', dpi: 192, minimized: false }), 'THE window source shape (the seam with lane stream-p2w-build): bounds in PHYSICAL pixels, dpi 192 on a 2× Mac, its display', w.window);
  const R = (fx, o) => SP.planScreen(fx, o);
  ok(R(facts(), { window: '4343' }).code === 'window_minimized' && R(facts(), { window: '9' }).code === 'window_gone' && R(facts(), { display: '9' }).code === 'display_gone' && R(facts({ displays: [] })).code === 'display_gone', 'refused by name: a minimized window (it sends no picture — restore it), a window or display that is gone');
  const deny = R(facts({ tcc: { screen: 'denied', accessibility: 'granted' } })), regrant = R(facts({ tcc: { screen: 'denied' }, helper: { state: 'ready', bin: '/x', regrant: true } })), none = R(facts({ helper: { state: 'missing', code: 'no_helper', error: 'no compiler' } }));
  ok(deny.code === 'screen_permission' && deny.settings === SP.MAC_SETTINGS.screen && /Screen & System Audio Recording/.test(deny.error) && regrant.code === 'helper_changed_regrant' && /off and on/.test(regrant.error) && none.code === 'no_helper' && none.error === 'no compiler' && R({ platform: 'darwin' }).code === 'no_helper', 'Screen Recording off ⇒ screen_permission naming the pane + its link; a replaced helper ⇒ helper_changed_regrant; no helper ⇒ no_helper (its own sentence)', { deny, regrant, none });
  ok(R({ platform: 'linux' }).code === 'not_windows' && SP.planScreen({ platform: 'win32', ffmpeg: null, displays: [] }).code === 'no_ffmpeg', 'every other platform keeps its road: Linux not_windows, Windows its ffmpeg verdicts');
  const P = SP.macHelperPaths('/Users/u/');
  ok(P.bin === '/Users/u/.vibespace/helpers/vibespace-screen' && P.version === P.bin + '.version' && P.state === P.bin + '.state.json' && P.incoming('vs-1') === P.bin + '-vs-1', 'THE FIXED PATH: ~/.vibespace/helpers/vibespace-screen, its version and state beside it, a pushed prebuilt named by its version', P);
  const sp = SP.macHelperSpawn(P.bin, 'capture', ['--display', 3]);
  ok(sp.file === P.bin && sp.disclaim === true && same(sp.args, ['--disclaim', 'capture', '--display', '3']), 'THE DISCLAIMED SPAWN (PURE): the fixed path, `--disclaim` FIRST (the helper re-spawns itself with responsibility disclaimed — Node cannot set it), the flag on the plan', sp);
  const b = SP.macBuildPlan({ swiftc: '/usr/bin/swiftc', src: '/d/s.swift', dir: '/d', out: '/d/o' });
  ok(same(b.slices.map((s) => s.args), [['-O', '-target', 'arm64-apple-macos15.0', '-o', '/d/vibespace-screen-arm64', '/d/s.swift'], ['-O', '-target', 'x86_64-apple-macos15.0', '-o', '/d/vibespace-screen-x86_64', '/d/s.swift']]) && same(b.after.map((s) => [s.file, ...s.args]), [['/usr/bin/lipo', '-create', '-output', '/d/o', '/d/vibespace-screen-arm64', '/d/vibespace-screen-x86_64'], ['/usr/bin/codesign', '-s', '-', '-f', '/d/o']]), 'the on-box build: both slices at macOS 15 (the box\'s own default would be its OS), lipo, ONE ad-hoc signature', b);
  ok(SP.macHelperSourceFile('vs-1', 'print(1)') === 'let HELPER_VERSION = "vs-1"\nprint(1)', 'the ONE file swiftc compiles = the version line + the source');
  const t = SP.macInputTarget({ w: 2560, h: 1440, frame: { x: -1920, y: 0, w: 1920, h: 1080 }, pid: 0 });
  ok(same(t, { pid: 0, wid: 0, ox: -1920, oy: 0, sx: 0.75, sy: 0.75 }) && same(SP.macInputTarget({ w: 1312, h: 844, frame: { x: 1, y: 2, w: 656, h: 422 }, pid: 777, window: 4242 }), { pid: 777, wid: 4242, ox: 1, oy: 2, sx: 0.5, sy: 0.5 }) && same(SP.macPoint(t, 1280, 720), { x: -960, y: 540 }) && same(SP.macPoint(null, 10.123, 5), { x: 10.12, y: 5 }) && SP.macInputTarget({ w: 0 }) === null, 'the input target: a 2560-px picture of a 1920-pt display ⇒ 0.75 pt a pixel from its origin (a picture pixel → the Mac\'s global point)', t);
  const kd = (o) => SP.macKbpsDecision({ current: 8000, cap: 8000, lastAt: 0, ...o });
  ok(kd({ target: 4000, now: 1500 }).kbps === 4000 && !kd({ target: 4000, now: 500 }).change && !kd({ target: 7400, now: 5000 }).change && kd({ target: 7000, now: 5000 }).kbps === 7000 && kd({ target: 99000, now: 5000, current: 4000 }).kbps === 8000, 'the bitrate follows LIVE: once a second at most, a ≥ 10 % move, never over the cap');
  const c = ['stream-offer', 'input-events', 'stream-facts', 'stream-screen'], V = (o) => SM.streamRungVerdict({ desktop: true, ...o });
  ok(V({ capabilities: c, platform: 'darwin' }).code === 'agent_too_old' && V({ capabilities: [...c, 'stream-mac'], platform: 'darwin' }).source === 'screen' && V({ capabilities: [...c, 'stream-mac'], platform: 'darwin', want: 'window' }).code === 'agent_too_old' && V({ capabilities: [...c, 'stream-mac', 'stream-window'], platform: 'darwin', want: 'window' }).source === 'window', 'the rung: an older Mac agent (it already says stream-screen) ⇒ agent_too_old; stream-mac ⇒ the screen; ONE window needs stream-window too');
  ok(V({ capabilities: c, platform: 'win32' }).source === 'screen' && V({ capabilities: c, platform: 'win32', want: 'window' }).code === 'no_window_source' && V({ capabilities: c.slice(0, 2), platform: 'win32' }).code === 'no_screen_source' && V({ capabilities: [...c, 'stream-mac'], platform: 'darwin', fakeSource: '/f.h264' }).source === 'fake' && SM.STREAM_SOURCES.includes('window'), 'Windows unchanged (screen; no window source here); a fake source still wins; STREAM_SOURCES takes window');
  ok(same(SM.streamSourceOf({ kind: 'window', id: 4242 }), { kind: 'window', id: '4242' }) && same(SM.streamSourceOf({ kind: 'display', id: '\\\\.\\DISPLAY2' }), { kind: 'display', id: '\\\\.\\DISPLAY2' }) && SM.streamSourceOf({ kind: 'window', id: 'a b' }) === null && SM.streamSourceOf({ kind: 'tab', id: '1' }) === null && SM.streamSourceOf(null) === null, 'the page\'s choice of source: a window or a display by id; anything else is no choice');
  const MM = require(path.join(REPO, 'src/lib/modifier-map.js'));
  ok(MM.primaryModifierMap({ viewer: 'windows', host: 'darwin' }).control === 'meta' && MM.primaryModifierMap({ viewer: 'linux', host: 'darwin' }).control === 'meta' && MM.primaryModifierMap({ viewer: 'mac', host: 'darwin' }).meta === 'meta' && MM.primaryModifierMap({ viewer: 'mac', host: 'darwin' }).control === 'control', 'a Mac host (the start answer\'s platform `darwin`): a Windows / Linux viewer\'s Ctrl reaches it as ⌘; a Mac viewer\'s keys as pressed (THE modifier table, src/lib/modifier-map.js)');
  const mc = (ev, tg) => I.macCommandsOf(ev, tg);
  const tg = { pid: 77, ox: 100, oy: 50, sx: 0.5, sy: 0.5 };
  ok(same(mc({ t: 'kd', c: 'KeyA' }).lines, ['K 0 0']) && same(mc({ t: 'ku', c: 'MetaLeft' }).lines, ['K 55 1']) && same(mc({ t: 'kd', c: 'ArrowUp' }).lines, ['K 126 0']) && same(mc({ t: 'md', x: 20, y: 10, b: 2 }, tg).lines, ['M 110 55', 'D 2']) && same(mc({ t: 'wh', x: 0, y: 0, dx: 0, dy: -120 }, tg).lines, ['M 100 50', 'W 0 -120']) && same(mc({ t: 'clip', text: 'hé' }).lines, ['C aMOp']) && mc({ t: 'kd', c: 'Pause' }).refused === 'unmapped_key' && same(mc({ t: 'ack', f: 1 }).lines, []), 'the Mac\'s command lines: virtual key codes (A 0, ⌘ 55, ↑ 126), the pointer in global points through the target, UTF-8 clipboard, Pause has no Mac key');
  const noMac = Object.keys(I.SCAN_CODES).filter((k) => !(k in I.MAC_KEYCODES)).sort();
  ok(new Set(Object.entries(I.MAC_KEYCODES).filter(([k]) => k !== 'Insert').map(([, v]) => v)).size === Object.keys(I.MAC_KEYCODES).length - 1 && same(noMac, ['Convert', 'F21', 'F22', 'F23', 'F24', 'KanaMode', 'NonConvert', 'PrintScreen', 'ScrollLock']), 'MAC_KEYCODES: every key the Windows table knows has its Mac key but the ones a Mac has none of (PrintScreen, ScrollLock, F21–F24, the PC JIS conversion keys — a Mac\'s かな / 英数 are Lang1 / Lang2); one code per key (Insert shares Help\'s)', noMac);
}

console.log(`[${((Date.now() - T0) / 1000).toFixed(1)} s] ` + '§2 the helper\'s source rides the bundle verbatim and carries the probe\'s laws');
{
  const swift = fs.readFileSync(path.join(REPO, 'tools/vibespace-screen/vibespace-screen.swift'), 'utf8');
  const sha = crypto.createHash('sha256').update(swift).digest('hex');
  ok(SRC.SOURCE === swift && SRC.SHA256 === sha && SRC.VERSION === 'vs-' + sha.slice(0, 12), `src/agentd/mac-helper-source.js IS tools/vibespace-screen/vibespace-screen.swift (VERSION ${SRC.VERSION} = its sha — run node scripts/mac-helper-embed.mjs after editing the Swift)`);
  const bundle = path.join(REPO, 'data/bin/vibespace-agentd.js');
  ok(fs.existsSync(bundle) && fs.readFileSync(bundle, 'utf8').includes(JSON.stringify(SRC.VERSION)), 'the built daemon carries that version (run `npm run build:agentd` after a change)');
  const cb = (/outputHandler|frameProperties: props, infoFlagsOut: nil\) \{([\s\S]*?)\n {6}\}/.exec(swift) || [])[1] || '';
  ok(/responsibility_spawnattrs_setdisclaim/.test(swift) && /A\.first == "--disclaim"/.test(swift) && /colorSpaceName = CGColorSpace\.sRGB/.test(swift) && /_ = NSApplication\.shared[^\n]*\n[\s\S]*?desktopIndependentWindow/.test(swift) && /kVTEncodeFrameOptionKey_ForceKeyFrame/.test(swift) && /EnableLowLatencyRateControl/.test(swift) && cb.length > 100 && !/VTSessionSetProperty/.test(cb) && /window_minimized/.test(swift) && /PRESS_GAP/.test(swift), 'the Swift keeps the laws: --disclaim → responsibility_spawnattrs_setdisclaim, sRGB, NSApplication before a window filter, a forced key + low-latency RC, NO VTSessionSetProperty inside the output callback (it deadlocks), minimized ⇒ window_minimized, the press gap', cb.length);
}

console.log(`[${((Date.now() - T0) / 1000).toFixed(1)} s] ` + '§3 THE HELPER\'S PLACE — fixed path, version, prebuilt, build, regrant');
const fakeExec = (cfg) => {
  const events = [];
  const ef = (file, args, opts, cb) => {
    events.push(['start', path.basename(file), [...args]]);
    setTimeout(() => {
      events.push(['done', path.basename(file)]);
      if (file === '/usr/bin/xcode-select') return cfg.devDir ? cb(null, cfg.devDir + '\n', '') : cb(Object.assign(new Error('exit 2'), { code: 2 }), '', 'xcode-select: error: unable to get active developer directory');
      if (file === '/usr/bin/swiftc') { if (cfg.swiftFail) return cb(Object.assign(new Error('exit 1'), { code: 1 }), '', 'vibespace-screen.swift:9:1: error: boom'); fs.writeFileSync(args[args.indexOf('-o') + 1], 'slice'); return cb(null, '', ''); }
      if (file === '/usr/bin/lipo') { fs.writeFileSync(args[args.indexOf('-output') + 1], '#!/bin/sh\necho built\n'); return cb(null, '', ''); }
      if (file === '/usr/bin/codesign') return cb(null, '', '');
      cb(new Error('unexpected ' + file), '', '');
    }, cfg.delay || 5);
  };
  return { ef, events };
};
{
  const h1 = home('smac-h1'), P1 = SP.macHelperPaths(h1);
  fs.mkdirSync(P1.dir, { recursive: true }); fs.writeFileSync(P1.bin, 'x', { mode: 0o755 }); fs.writeFileSync(P1.version, SRC.VERSION);
  const x1 = fakeExec({});
  const r1 = await MAC.createMacHelper({ execFile: x1.ef, fs, home: h1 }).ensure();
  ok(r1.state === 'ready' && r1.bin === P1.bin && x1.events.length === 0, 'the version file says the shipped version ⇒ ready, NOTHING run (no compiler asked, no rebuild)', { r1, ev: x1.events });

  const h2 = home('smac-h2');
  const x2 = fakeExec({});
  const r2 = await MAC.createMacHelper({ execFile: x2.ef, fs, home: h2 }).ensure();
  ok(r2.state === 'missing' && r2.code === 'no_helper' && r2.canBuild === false && /xcode-select --install/.test(r2.error) && /data\/bin\/helpers/.test(r2.error) && r2.version === SRC.VERSION && r2.dir === SP.macHelperPaths(h2).dir && same(x2.events.filter((e) => e[0] === 'start').map((e) => e[1]), ['xcode-select']), 'no helper and no compiler ⇒ no_helper naming both recipes (the dir + version a hub push needs); only `xcode-select -p` ran — never the swiftc trampoline (it opens an install dialog on the owner\'s screen)', { r2, ev: x2.events });

  const h3 = home('smac-h3'), P3 = SP.macHelperPaths(h3);
  fs.mkdirSync(P3.dir, { recursive: true }); fs.writeFileSync(P3.incoming(SRC.VERSION), '#!/bin/sh\n');
  const r3 = await MAC.createMacHelper({ execFile: fakeExec({}).ef, fs, home: h3 }).ensure();
  ok(r3.state === 'ready' && r3.how === 'prebuilt' && fs.readFileSync(P3.version, 'utf8') === SRC.VERSION && (fs.statSync(P3.bin).mode & 0o111) && !fs.existsSync(P3.incoming(SRC.VERSION)), 'the hub\'s pushed prebuilt (vibespace-screen-<version>) is put in place: executable, its version written', r3);

  const h4 = home('smac-h4'), P4 = SP.macHelperPaths(h4), dev = path.join(h4, 'CLT');
  fs.mkdirSync(path.join(dev, 'usr/bin'), { recursive: true }); fs.writeFileSync(path.join(dev, 'usr/bin/swiftc'), '');
  const x4 = fakeExec({ devDir: dev, delay: 40 });
  const H4 = MAC.createMacHelper({ execFile: x4.ef, fs, home: h4 });
  const [r4, r4b] = await Promise.all([H4.ensure(), H4.ensure()]);
  const starts = x4.events.filter((e) => e[0] === 'start').map((e) => e[1]), order = x4.events.map((e) => e[0] + ':' + e[1]);
  const sw = x4.events.filter((e) => e[0] === 'start' && e[1] === 'swiftc').map((e) => e[2]);
  ok(r4.state === 'ready' && r4.how === 'built' && r4 === r4b && same(starts, ['xcode-select', 'swiftc', 'swiftc', 'lipo', 'codesign']) && order.indexOf('start:swiftc') < order.indexOf('done:swiftc') && order.lastIndexOf('start:swiftc') < order.indexOf('done:swiftc') && order.indexOf('start:lipo') > order.lastIndexOf('done:swiftc'), 'a compiler ⇒ BUILT here: both slices at once (the second starts before the first ends), then lipo, then codesign; two asks share one build', order);
  ok(sw.length === 2 && sw[0].join(' ').includes('arm64-apple-macos15.0') && sw[1].join(' ').includes('x86_64-apple-macos15.0') && fs.readFileSync(P4.version, 'utf8') === SRC.VERSION && !fs.readdirSync(P4.dir).some((f) => f.startsWith('.build-')), 'the slices are macOS 15 arm64 + x86_64; the version written; the build dir removed', sw);

  const h5 = home('smac-h5'), P5 = SP.macHelperPaths(h5);
  fs.mkdirSync(P5.dir, { recursive: true }); fs.writeFileSync(P5.bin, 'old'); fs.writeFileSync(P5.version, 'vs-old'); fs.writeFileSync(P5.state, JSON.stringify({ version: 'vs-old', granted: true }));
  fs.writeFileSync(P5.incoming(SRC.VERSION), '#!/bin/sh\n');
  const H5 = MAC.createMacHelper({ execFile: fakeExec({}).ef, fs, home: h5 });
  const r5 = await H5.ensure();
  ok(r5.state === 'ready' && r5.regrant === true && r5.have === SRC.VERSION, 'a REPLACED helper whose old version held its Screen Recording grant ⇒ regrant (an ad-hoc grant is path + cdhash: the new binary is a new client)', r5);
  H5.sawTcc('denied');
  const r5b = await H5.ensure();
  H5.sawTcc('granted');
  const r5c = await H5.ensure();
  ok(r5b.regrant === true && r5c.regrant === false && r5c.granted === true, 'regrant holds until the facts see the grant again, then clears');
  const h6 = home('smac-h6'), P6 = SP.macHelperPaths(h6);
  fs.mkdirSync(P6.dir, { recursive: true }); fs.writeFileSync(P6.bin, 'old'); fs.writeFileSync(P6.version, 'vs-old'); fs.writeFileSync(P6.state, JSON.stringify({ version: 'vs-old', granted: false }));
  fs.writeFileSync(P6.incoming(SRC.VERSION), '#!/bin/sh\n');
  ok((await MAC.createMacHelper({ execFile: fakeExec({}).ef, fs, home: h6 }).ensure()).regrant === false, 'a replaced helper that was never granted is a first grant (screen_permission), not a regrant');
  const h7 = home('smac-h7'), dev7 = path.join(h7, 'CLT');
  fs.mkdirSync(path.join(dev7, 'usr/bin'), { recursive: true }); fs.writeFileSync(path.join(dev7, 'usr/bin/swiftc'), '');
  const r7 = await MAC.createMacHelper({ execFile: fakeExec({ devDir: dev7, swiftFail: true }).ef, fs, home: h7 }).ensure();
  ok(r7.state === 'missing' && r7.code === 'no_helper' && /error: boom/.test(r7.error) && r7.canBuild === true && !fs.existsSync(SP.macHelperPaths(h7).version), 'a build that fails ⇒ no_helper with the compiler\'s error line; no version written', r7);
}

console.log(`[${((Date.now() - T0) / 1000).toFixed(1)} s] ` + '§4 THE SOURCE end to end over the fake helper');
const hS = home('smac-src'), logS = path.join(hS, 'helper.log');
const FK = writeFakeMacHelper(hS, { version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted', accessibility: 'granted' }, log: logS, flv: flvFile(hS), displayFrame: { x: 0, y: 0, w: 1920, h: 1080 }, windowFrame: { x: -1678, y: 106, w: 656, h: 422 }, windowPid: 777, movedFrame: { x: -1600, y: 120, w: 656, h: 422 } });
const envS = { HOME: hS, PATH: process.env.PATH };
const logs = () => helperLog(logS);
let skew = 0; // the bitrate leg moves this clock a second on instead of waiting one out
const scr = MAC.createMacScreen({ spawn, execFile, env: envS, fs, log: () => { }, now: () => Date.now() + skew });
const run = async (msg, { want = 40, kbps = 8000 } = {}) => {
  const src = await scr.source(msg, { maxKbps: kbps });
  if (!src.ok) return { src, aus: [], ended: null };
  const out = { src, aus: [], ended: null };
  src.start((au) => out.aus.push(au), (code) => { out.ended = code; });
  await until(() => out.aus.length >= want || out.ended, 6000);
  return out;
};
{
  const f = await scr.facts();
  ok(f.ok && f.platform === 'darwin' && f.helper.state === 'ready' && f.helper.bin === FK.bin && f.helper.reports === SRC.VERSION && f.helper.disclaimed === true && f.displays.length === 2 && f.windows.length === 2 && f.tcc.screen === 'granted' && f.primary.mode === 'videotoolbox' && f.primary.rung === '1440p60' && f.primary.w === 2560, 'stream-facts on a Mac: the helper\'s own facts (run disclaimed), its state, the main display\'s plan', f.primary);
  ok(same(logs()[0].argv, ['--disclaim', 'facts']), 'the facts ran DISCLAIMED at the fixed path', logs()[0]);
  const r = await run({ sourceKind: 'screen' });
  const matches = r.aus.slice(0, 40).filter((au, i) => { const a = AUS[K0 + i]; return au.nalus.length === a.nalus.length && au.nalus.every((n, k) => Buffer.compare(n, a.nalus[k]) === 0); }).length;
  ok(r.src.ok && r.src.kind === 'screen' && r.src.encoder === 'VideoToolbox' && r.src.fps === 60 && matches === 40 && r.aus[0].key && r.aus.every((a, i) => !i || a.ts90k > r.aus[i - 1].ts90k), 'the display\'s pictures = THE fixture\'s access units byte for byte (FLV → SP.flvReader — no new parser), the first a key frame, the clock rising', { n: r.aus.length, matches, ended: r.ended });
  const cap = logs().find((l) => l.argv && l.argv[1] === 'capture');
  ok(cap && same(cap.argv, ['--disclaim', ...SP.planScreen(f).args]), 'the helper ran EXACTLY the plan\'s argv, disclaimed', cap);
  await until(() => r.src.inputTarget(), 2000);
  ok(same(r.src.inputTarget(), { pid: 0, wid: 0, ox: 0, oy: 0, sx: 0.75, sy: 0.75 }), 'the input target from the helper\'s `started` line: the frontmost app (pid 0), 0.75 pt a picture pixel', r.src.inputTarget());
  const st0 = r.src.stats();
  r.src.requestKeyframe();
  await until(() => r.src.stats().keysAnswered > st0.keysAnswered, 2000);
  const st1 = r.src.stats();
  ok(logs().some((l) => l.ctl === 'key') && st1.keysAnswered === st0.keysAnswered + 1 && st1.keyWaitMs <= 500, `a key frame on request: \`key\` on the helper's stdin, answered ${st1.keyWaitMs} ms later (the SAME frame on a Mac — no GOP to wait out)`, st1);
  skew += 1100;
  r.src.setTargetKbps(4000);
  r.src.setTargetKbps(4000);
  r.src.setTargetKbps(2000);
  await sleep(50);
  const ctl = logs().filter((l) => l.ctl && l.ctl.startsWith('bps')).map((l) => l.ctl);
  ok(same(ctl, ['bps 4000000']) && r.src.stats().kbps === 4000 && r.src.stats().rateChanges === 1, 'the bitrate LIVE: one `bps` line (no restart) — and nothing again within a second', ctl);
  await until(() => r.src.stats().encodeMs != null, 2000);
  const st2 = r.src.stats();
  ok(st2.mode === 'videotoolbox' && st2.encoder === 'VideoToolbox' && st2.encodeMs === 9.5 && st2.captureMs === 1.2 && st2.captured >= 10 && st2.timing === 'helper' && st2.kind === 'display' && st2.display === '3' && st2.white === null && st2.rung === '1440p60', 'the numbers: the helper\'s encode / capture ms and counts (the strip shows VideoToolbox · encode ms)', st2);
  r.src.stop();
  await sleep(150);
  ok(logs().some((l) => l.ctl === 'quit') && r.ended === null, 'stop: `quit` on stdin, and no ending reported (asked)');
}
{
  const r = await run({ sourceKind: 'window', sourceId: '4242' }, { want: 25 });
  const cap = logs().filter((l) => l.argv && l.argv[1] === 'capture').pop();
  ok(r.src.ok && same(cap.argv.slice(1, 4), ['capture', '--window', '4242']) && cap.argv.includes('1312x844') && same(r.src.window, SP.windowSourceOf(SP.parseMacFacts(JSON.stringify({ t: 'facts', ...MAC_FACTS })).windows[0], { id: '2', scale: 2 })), 'a window: --window <its id> at its own pixels; the source carries the window shape', { argv: cap && cap.argv, w: r.src.window });
  await until(() => r.src.inputTarget(), 2000);
  ok(same(r.src.inputTarget(), { pid: 777, wid: 4242, ox: -1678, oy: 106, sx: 0.5, sy: 0.5 }), 'its input target: the window\'s app (pid 777 — CGEventPostToPid when it is not in front), the window its keys must reach, its frame', r.src.inputTarget());
  FK.set({ moveAfter: 1 });
  r.src.stop();
  const r2 = await run({ sourceKind: 'window', sourceId: '4242' }, { want: 5 });
  await until(() => r2.src.inputTarget() && r2.src.inputTarget().ox === -1600, 2000);
  ok(same(r2.src.inputTarget(), { pid: 777, wid: 4242, ox: -1600, oy: 120, sx: 0.5, sy: 0.5 }), 'the window moved (a `frame` line): the target follows — the page keeps sending picture pixels', r2.src.inputTarget());
  r2.src.stop();
  FK.set({ moveAfter: 0, endAfter: 6, endCode: 'window_minimized' });
  const r3 = await run({ sourceKind: 'window', sourceId: '4242' }, { want: 99 });
  FK.set({ endCode: 'display_gone' });
  const r4 = await run({ sourceKind: 'screen' }, { want: 99 });
  FK.set({ endAfter: 0, dieAfter: 4 });
  const r5 = await run({ sourceKind: 'screen' }, { want: 99 });
  FK.set({ dieAfter: 0 });
  ok(r3.ended === 'window_minimized' && r3.aus.length >= 5 && r4.ended === 'display_gone' && r5.ended === 'capture_exited', 'endings BY NAME: the helper\'s own (window_minimized — restore it; display_gone), an exit with no end line = capture_exited', { r3: r3.ended, r4: r4.ended, r5: r5.ended });
}
{
  FK.set({ tcc: { screen: 'denied', accessibility: 'granted' } });
  await scr.facts({ force: true }); // (the switch turned off under a running stream ends it by the helper's own end line: screen_permission)
  const n0 = logs().length;
  const a = await scr.source({ sourceKind: 'screen' });
  await sleep(300);
  const b = await scr.source({ sourceKind: 'screen' });
  await sleep(300);
  const rows = logs().slice(n0).filter((l) => l.argv && l.argv.includes('--register-row'));
  ok(a.ok === false && a.code === 'screen_permission' && a.settings === SP.MAC_SETTINGS.screen && b.code === 'screen_permission' && rows.length === 1 && same(rows[0].argv, ['--disclaim', 'capture', '--display', '3', '--register-row']), 'Screen Recording off ⇒ screen_permission with the pane\'s link — and ONE disclaimed run that adds the helper\'s (off) row in Settings, never again for this version', { a, rows });
  FK.set({ tcc: { screen: 'granted', accessibility: 'granted' } });
}
{
  const hR = home('smac-regrant'), PR = SP.macHelperPaths(hR), logR = path.join(hR, 'h.log');
  const FR = writeFakeMacHelper(hR, { version: null, facts: MAC_FACTS, tcc: { screen: 'denied' }, log: logR, flv: flvFile(hR), displayFrame: { x: 0, y: 0, w: 1920, h: 1080 } });
  fs.renameSync(FR.bin, PR.incoming(SRC.VERSION)); fs.writeFileSync(PR.bin, 'old'); fs.writeFileSync(PR.version, 'vs-old'); fs.writeFileSync(PR.state, JSON.stringify({ version: 'vs-old', granted: true }));
  const sR = MAC.createMacScreen({ spawn, execFile, env: { HOME: hR, PATH: process.env.PATH }, fs });
  const a = await sR.source({ sourceKind: 'screen' });
  FR.set({ tcc: { screen: 'granted' } });
  const f2 = await sR.facts({ force: true });
  const b = await sR.source({ sourceKind: 'screen' });
  if (b.ok) b.stop();
  ok(a.code === 'helper_changed_regrant' && /off and on/.test(a.error) && f2.helper.regrant === false && b.ok, 'the agent replaced a GRANTED helper ⇒ helper_changed_regrant (turn it off and on); once the facts see the grant, the stream plays', { a, regrant: f2.helper && f2.helper.regrant });
  const hN = home('smac-none');
  const sN = MAC.createMacScreen({ spawn, execFile: fakeExec({}).ef, env: { HOME: hN, PATH: process.env.PATH }, fs });
  const n = await sN.source({ sourceKind: 'screen' });
  ok(n.ok === false && n.code === 'no_helper' && n.helper && n.helper.version === SRC.VERSION && n.helper.dir === SP.macHelperPaths(hN).dir, 'no helper and no compiler ⇒ no_helper carrying the dir + version a hub needs to push its prebuilt', n);
}

console.log(`[${((Date.now() - T0) / 1000).toFixed(1)} s] ` + '§5 THE INJECTOR on a Mac');
{
  const hI = home('smac-inj'), logI = path.join(hI, 'i.log');
  writeFakeMacHelper(hI, { version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted', accessibility: 'granted' }, log: logI });
  const helper = MAC.createMacHelper({ execFile, fs, home: hI });
  const inj = I.createInjector({ platform: 'darwin', spawn, env: { HOME: hI, PATH: process.env.PATH }, mac: () => helper });
  cleanups.push(() => inj.close());
  const tg = { pid: 77, wid: 4242, ox: 100, oy: 50, sx: 0.5, sy: 0.5 };
  const r1 = await inj.inject([{ t: 'kd', c: 'KeyA' }, { t: 'md', x: 20, y: 10, b: 0 }, { t: 'mu', x: 20, y: 10, b: 0 }], tg);
  const r2 = await inj.inject([{ t: 'ku', c: 'KeyA' }], tg);
  const r3 = await inj.inject([{ t: 'mv', x: 4, y: 4 }], { ...tg, pid: 0, wid: 0 });
  const r4 = await inj.inject([{ t: 'kd', c: 'Pause' }], null);
  const lines = helperLog(logI).filter((l) => l.input).map((l) => l.input);
  const argv = helperLog(logI).find((l) => l.argv).argv;
  ok(inj.kind === 'cgevent' && r1.ok && r1.n === 3 && r2.ok && r3.ok && same(argv, ['--disclaim', 'input']) && same(lines, ['P 77 4242', 'K 0 0', 'M 110 55', 'D 0', 'M 110 55', 'U 0', 'K 0 1', 'P 0', 'M 102 52']) && r4.refused[0].code === 'unmapped_key', 'THE injector on a Mac = the helper\'s `input`, disclaimed: `P <pid> <window>` once per target (the window its keys must reach), virtual key codes, the pointer in global points; a key with no Mac twin refused', { lines, argv, r4 });
  inj.close();
  const hA = home('smac-ax');
  writeFakeMacHelper(hA, { version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted', accessibility: 'denied' }, inputAnswer: 'ax_denied' });
  const injA = I.createInjector({ platform: 'darwin', spawn, env: { HOME: hA, PATH: process.env.PATH }, mac: () => MAC.createMacHelper({ execFile, fs, home: hA }) });
  const ra = await injA.inject([{ t: 'kd', c: 'KeyA' }], tg);
  injA.close();
  const injN = I.createInjector({ platform: 'darwin', spawn, env: {}, mac: () => MAC.createMacHelper({ execFile: fakeExec({}).ef, fs, home: home('smac-inj-none') }) });
  const rn = await injN.inject([{ t: 'kd', c: 'KeyA' }]);
  ok(ra.ok === false && ra.refused[0].code === 'accessibility_permission' && rn.code === 'no_helper' && rn.refused[0].code === 'no_helper', 'no Accessibility ⇒ accessibility_permission (macOS would drop them silently — the helper says ax_denied); no helper ⇒ no_helper', { ra, rn });
}

console.log(`[${((Date.now() - T0) / 1000).toFixed(1)} s] ` + '§6 a REAL Mac-shaped daemon');
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
const w = require(path.join(REPO, 'node_modules/werift'));
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/, INJ = /(createInjector\(\{\s*)platform: process\.platform,/, SCR = /(createScreen\(\{\s*)platform: process\.platform,/;
const macText = bundleText.replace(HELLO, '$1platform: "darwin",').replace(INJ, '$1platform: "darwin",').replace(SCR, '$1platform: "darwin",');
const darwins = (t) => (t.match(/platform: "darwin",/g) || []).length;
ok(darwins(macText) - darwins(bundleText) === 3 && /function createMacScreen\(/.test(macText) && /"stream-mac", "stream-window"/.test(macText), 'the copy says darwin three times (the hello-ack, THE injector, THE screen source — found by content); the bundle carries the Mac source and both capabilities');
const copyDir = scratch('smac-bundle'); fs.mkdirSync(copyDir, { recursive: true }); homes.push(copyDir);
const macBundle = path.join(copyDir, 'mac', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(macBundle), { recursive: true }); fs.writeFileSync(macBundle, macText);
const oldBundle = path.join(copyDir, 'old', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(oldBundle), { recursive: true }); fs.writeFileSync(oldBundle, macText.replace(', "stream-mac", "stream-window"', ''));
const devices = [], peers = [], daemonHomes = [];
const rootOf = (h) => path.join(h, 'agentd-root');
cleanups.push(() => { for (const p of peers) { try { p.close(); } catch { } } for (const d of devices) { try { d.stop(); } catch { } } for (const h of daemonHomes) endDaemonsOf(rootOf(h)); });
function deviceOn(h, bundlePath) {
  process.env.HOME = h; process.env.VIBESPACE_AGENTD_ROOT = rootOf(h); daemonHomes.push(h);
  const dataDir = path.join(h, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  const dm = new DeviceManager({ dataDir, bundlePath, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  devices.push(dm);
  return dm;
}
function standIn() {
  const pc = new w.RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:9' }], iceStunGatherTimeout: 0.2, iceUseIpv6: false, codecs: { video: [new w.RTCRtpCodecParameters({ mimeType: SM.STREAM_CODEC.mimeType, clockRate: SM.STREAM_CODEC.clockRate, rtcpFeedback: SM.STREAM_CODEC.rtcpFeedback.map((f) => ({ ...f })), parameters: SM.STREAM_CODEC.fmtp })] } });
  peers.push(pc);
  const got = { rtp: [], dc: null };
  pc.onTrack.subscribe((t) => t.onReceiveRtp.subscribe((r) => { got.rtp.push({ marker: r.header.marker, payload: Buffer.from(r.payload) }); }));
  pc.onDataChannel.subscribe((ch) => { got.dc = ch; });
  return { pc, got };
}
const pictures = (rtp) => { const out = []; let cur = []; for (const p of rtp) { cur.push(p.payload); if (p.marker) { out.push(H.depacketize(cur)); cur = []; } } return out; };
{
  const hD = home('smac-daemon'), logD = path.join(hD, 'd.log');
  writeFakeMacHelper(hD, { version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted', accessibility: 'granted' }, log: logD, flv: flvFile(hD), displayFrame: { x: 0, y: 0, w: 1920, h: 1080 } });
  const dm = deviceOn(hD, macBundle);
  const conn = await dm.connect();
  ok(conn.info.platform === 'darwin' && same(conn.info.capabilities.slice(-6), ['stream-offer', 'input-events', 'stream-facts', 'stream-screen', 'stream-mac', 'stream-window']), 'the hello-ack names stream-mac + stream-window (after stream-screen)', conn.info.capabilities.slice(-6));
  const v = SM.streamRungVerdict({ capabilities: conn.info.capabilities, desktop: true, platform: conn.info.platform });
  const f = await dm.streamFacts();
  ok(v.take && v.source === 'screen' && f.ok && f.platform === 'darwin' && f.helper.state === 'ready' && f.primary.rung === '1440p60' && f.windows.length === 2, 'the rung takes the Mac\'s screen; the stream-facts op answers the Mac\'s facts through its helper', f.primary);
  const pushes = [];
  const b = standIn();
  const off = await dm.streamOffer({ sourceKind: 'screen' }, { onPush: (m) => { pushes.push(m); if (m.op === 'stream-ice' && m.candidate) b.pc.addIceCandidate(m.candidate).catch(() => { }); } });
  if (off.ok) { await b.pc.setRemoteDescription(off.offer); await b.pc.setLocalDescription(await b.pc.createAnswer()); await dm.streamAnswer(off.sid, { answer: { type: 'answer', sdp: b.pc.localDescription.sdp } }); }
  const flowing = await until(() => pictures(b.got.rtp).length >= 30, 8000);
  const pics = pictures(b.got.rtp);
  const matches = pics.slice(0, 30).filter((p, i) => { const a = AUS[K0 + i]; return p.length === a.nalus.length && p.every((n, k) => Buffer.compare(n, a.nalus[k]) === 0); }).length;
  ok(off.ok && off.source.kind === 'screen' && off.source.encoder === 'VideoToolbox' && off.source.mode === 'videotoolbox' && off.source.fps === 60 && flowing && matches === 30, 'a screen offer on the Mac: VideoToolbox at 60; the browser gets THE fixture byte for byte (helper FLV → access units → RTP)', { src: off.source || off, n: pics.length, matches });
  await until(() => b.got.dc && b.got.dc.readyState === 'open', 4000);
  for (const e of [{ t: 'kd', c: 'KeyS' }, { t: 'ku', c: 'KeyS' }, { t: 'md', x: 1280, y: 720, b: 0 }, { t: 'mu', x: 1280, y: 720, b: 0 }]) b.got.dc.send(JSON.stringify(e));
  const inputs = () => helperLog(logD).filter((l) => l.input).map((l) => l.input);
  await until(() => inputs().length >= 7, 4000);
  ok(same(inputs().slice(0, 7), ['P 0', 'K 1 0', 'K 1 1', 'M 960 540', 'D 0', 'M 960 540', 'U 0']), 'the data channel\'s key + click reached the helper\'s input: the frontmost app, the virtual key code, the picture\'s centre in global points (×0.75)', inputs());
  const st = await dm.streamStats(off.sid);
  ok(st.ok && st.stats.screen && st.stats.screen.encoder === 'VideoToolbox' && st.stats.input.n >= 4, 'the session\'s numbers carry the Mac source\'s and the input count', st.stats && st.stats.screen);
  await dm.streamStop(off.sid);
  b.pc.close();

  const hO = home('smac-old');
  writeFakeMacHelper(hO, { version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted' } });
  const dmo = deviceOn(hO, oldBundle);
  const co = await dmo.connect();
  let asked = 0;
  const real = dmo.streamOffer.bind(dmo); dmo.streamOffer = (...a) => { asked++; return real(...a); };
  const vo = SM.streamRungVerdict({ capabilities: co.info.capabilities, desktop: true, platform: co.info.platform });
  const hub = DW.create({ access: { streamRung: async () => ({ ...vo, dm: dmo, platform: 'darwin' }) }, relay: false, udpLeg: false, log: { log: () => { }, warn: () => { } } });
  const so = await hub.start('host-old');
  ok(!co.info.capabilities.includes('stream-mac') && co.info.capabilities.includes('stream-screen') && so.take === false && so.code === 'agent_too_old' && asked === 0, 'THE CAPABILITY GATE: an older Mac agent (stream-screen, no stream-mac) ⇒ agent_too_old and it is NEVER asked', { so, asked });
  hub.shutdown?.(); dmo.stop(); endDaemonsOf(rootOf(hO));

  const hP = home('smac-push'), logP = path.join(hP, 'p.log'), PP = SP.macHelperPaths(hP), hubBin = path.join(hP, 'hub-helpers');
  const FP = writeFakeMacHelper(hP, { version: SRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted' }, log: logP, flv: flvFile(hP), displayFrame: { x: 0, y: 0, w: 1920, h: 1080 } });
  fs.mkdirSync(hubBin, { recursive: true }); fs.renameSync(FP.bin, path.join(hubBin, 'vibespace-screen')); fs.renameSync(FP.bin + '.version', path.join(hubBin, 'vibespace-screen.version'));
  const dmp = deviceOn(hP, macBundle);
  const cp = await dmp.connect();
  const vp = SM.streamRungVerdict({ capabilities: cp.info.capabilities, desktop: true, platform: cp.info.platform });
  const logs2 = [];
  const hub2 = DW.create({ access: { streamRung: async () => ({ ...vp, dm: dmp, platform: 'darwin' }) }, relay: false, udpLeg: false, helpersDir: hubBin, log: { log: (m) => logs2.push(m), warn: (m) => logs2.push(m) } });
  const sp = await hub2.start('host-push');
  ok(sp.take === true && sp.source && sp.source.encoder === 'VideoToolbox' && fs.readFileSync(PP.version, 'utf8') === SRC.VERSION && (fs.statSync(PP.bin).mode & 0o111) && logs2.some((m) => /pushed this hub's prebuilt/.test(m)), 'a Mac with no helper and no compiler: the offer said no_helper, the HUB pushed its prebuilt over the device link, the agent put it in place and the offer — asked once more — streams', { sp: { take: sp.take, code: sp.code, why: sp.why }, logs2 });
  fs.writeFileSync(path.join(hubBin, 'vibespace-screen.version'), 'vs-other');
  const r = await DW.pushMacHelper(dmp, { dir: PP.dir, version: SRC.VERSION }, hubBin);
  ok(r.ok === false && r.code === 'no_helper' && /vs-other/.test(r.error), 'a hub whose prebuilt is another version pushes nothing (an agent would never take it)', r);
  if (sp.key) await hub2.stop(sp.key, 'stopped').catch(() => { });
  hub2.shutdown?.();
}

console.log(`\n${fail ? '✗' : '✓'} test-stream-mac: ${pass} passed, ${fail} failed`);
setTimeout(() => process.exit(fail ? 1 : 0), 50);
