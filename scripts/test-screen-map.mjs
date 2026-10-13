#!/usr/bin/env node
// lane desktop-v2-entry (design q-030 §6 P0 seed TESTS): the PURE screen map + the -308 skimmer + the stats' timing table +
// the `display-facts` op over JXA / PowerShell FIXTURE outputs (never the owner's machines) + the build-time noVNC patch.
//   §1 screenMap truth table: Mac points ×2 · Mac sending points · Windows negative-coordinate secondary · union ≠ fb ⇒
//      unknown · single screen · -308 contradicting the OS table ⇒ the framebuffer's own wins · agreeing ⇒ the OS names ·
//      mixed Mac scales ⇒ unknown · no framebuffer
//   §2 rfbScreens (the payload bytes) · clientMessages (one send cut into types) · updateTimer (round trip + fps, idle trips out)
//   §3 the op: argv per platform, the scripts' shape, parseDisplayFacts over a Mac (bottom-left, flipped) and a Windows
//      (PowerShell 5's lone row as an object) fixture, readDisplayFacts with a fixture execFile, the agent / client / route wiring
//   §4 the noVNC patch: both anchors apply once on the bundled 1.7 rfb.js, ≤ 20 added lines, a drifted anchor is MISSING (the
//      build fails — never silently unpatched), the built public/novnc.js carries it
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const S = require(path.join(REPO, 'src/desktop-screens.js'));
const MW = require(path.join(REPO, 'src/machine-window.js'));
const P = require(path.join(REPO, 'src/novnc-patch.js'));
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 700) : '')); } };
const rects = (m) => m.displays.map((d) => `${d.n}:${d.name || '-'}@${d.rect.x},${d.rect.y},${d.rect.w}x${d.rect.h}${d.primary ? '*' : ''}`).join(' ');

console.log('§1 screenMap');
const mac2 = [{ id: 1, name: 'Built-in', x: 0, y: 0, w: 1440, h: 900, scale: 2, primary: true }, { id: 2, name: 'DELL', x: 1440, y: 0, w: 1440, h: 900, scale: 2 }];
let m = S.screenMap({ fb: { w: 5760, h: 1800 }, screens: mac2 });
ok(m.state === 'map' && m.source === 'os' && rects(m) === '1:Built-in@0,0,2880x1800* 2:DELL@2880,0,2880x1800', 'a Retina Mac sending PIXELS: its points ×2 fill the framebuffer', rects(m));
m = S.screenMap({ fb: { w: 2880, h: 900 }, screens: mac2 });
ok(m.state === 'map' && rects(m) === '1:Built-in@0,0,1440x900* 2:DELL@1440,0,1440x900', 'a Mac sending POINTS: the table as given fills the framebuffer (×1 tried first)', rects(m));
const win = [{ id: 'DISPLAY1', name: 'DISPLAY1', x: 0, y: 0, w: 1920, h: 1080, scale: 1, primary: true }, { id: 'DISPLAY2', name: 'DISPLAY2', x: -1280, y: 0, w: 1280, h: 1024, scale: 1 }];
m = S.screenMap({ fb: { w: 3200, h: 1080 }, screens: win });
ok(m.state === 'map' && rects(m) === '1:DISPLAY2@0,0,1280x1024 2:DISPLAY1@1280,0,1920x1080*' && m.displays[0].key === 'DISPLAY2', 'Windows with a secondary LEFT of the primary (negative x): moved to the framebuffer\'s origin, numbered left to right, keyed by id', rects(m));
m = S.screenMap({ fb: { w: 1920, h: 1080 }, screens: win });
ok(m.state === 'unknown' && m.why === 'bbox_mismatch' && m.displays.length === 0, 'the union ≠ the framebuffer ⇒ unknown (the whole screen — never a guess)', m);
m = S.screenMap({ fb: { w: 1920, h: 1080 }, screens: [win[0]] });
ok(m.state === 'single' && rects(m) === '1:DISPLAY1@0,0,1920x1080*', 'one screen: single (nothing to pick)', m);
const rfbT = [{ id: 7, x: 0, y: 0, w: 1600, h: 900 }, { id: 8, x: 1600, y: 0, w: 1600, h: 900 }];
m = S.screenMap({ fb: { w: 3200, h: 900 }, screens: [{ x: 0, y: 0, w: 1920, h: 900, name: 'A' }, { x: 1920, y: 0, w: 1280, h: 900, name: 'B' }], rfb: rfbT });
ok(m.state === 'map' && m.source === 'rfb' && m.why === 'os_disagrees' && rects(m) === '1:-@0,0,1600x900 2:-@1600,0,1600x900', 'a -308 table contradicting the OS table ⇒ the framebuffer\'s own rects win (no borrowed names)', m);
m = S.screenMap({ fb: { w: 3200, h: 900 }, screens: [{ id: 'L', x: 0, y: 0, w: 1600, h: 900, name: 'Left' }, { id: 'R', x: 1600, y: 0, w: 1600, h: 900, name: 'Right', primary: 1 }], rfb: rfbT });
ok(m.source === 'both' && rects(m) === '1:Left@0,0,1600x900 2:Right@1600,0,1600x900*', 'the two tables agree ⇒ the OS names on the framebuffer\'s places', m);
m = S.screenMap({ fb: { w: 3200, h: 900 }, rfb: rfbT });
ok(m.source === 'rfb' && m.why === null && m.displays.length === 2, 'the -308 table alone maps (an agent without display-facts)', m);
m = S.screenMap({ fb: { w: 3200, h: 900 }, rfb: [{ id: 1, x: 0, y: 0, w: 3200, h: 900 }] });
ok(m.state === 'unknown' && m.why === 'no_table', 'ONE -308 screen covering the framebuffer says nothing (most servers send exactly that)', m);
m = S.screenMap({ fb: { w: 4800, h: 1800 }, screens: [{ x: 0, y: 0, w: 1440, h: 900, scale: 2 }, { x: 1440, y: 0, w: 1920, h: 1080, scale: 1 }] });
ok(m.state === 'unknown', 'a Mac with MIXED scales (Retina + a 1× monitor): no single factor fits ⇒ unknown', m);
ok(S.screenMap({ screens: win }).why === 'no_framebuffer' && S.screenMap({ fb: { w: 10, h: 10 }, screens: [{ x: 'a' }, null, { x: 0, y: 0, w: 0, h: 5 }] }).why === 'no_table', 'no framebuffer / no usable OS row ⇒ unknown, by name');
ok(S.screenMap({ fb: { w: 1441, h: 900 }, screens: [mac2[0]] }).state === 'single' && S.screenMap({ fb: { w: 1444, h: 900 }, screens: [mac2[0]] }).state === 'unknown', `a bbox within ${S.FIT_TOL} px fits (rounding), beyond does not`);

console.log('§2 the skimmer and the timing table');
const u16 = (n) => [(n >> 8) & 255, n & 255], u32 = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const payload = Uint8Array.from([2, 0, 0, 0, ...u32(1), ...u16(0), ...u16(0), ...u16(1280), ...u16(800), ...u32(0), ...u32(0xdeadbeef), ...u16(1280), ...u16(0), ...u16(1280), ...u16(800), ...u32(1)]);
const sc = S.rfbScreens(payload);
ok(JSON.stringify(sc) === JSON.stringify([{ id: 1, x: 0, y: 0, w: 1280, h: 800, flags: 0 }, { id: 0xdeadbeef, x: 1280, y: 0, w: 1280, h: 800, flags: 1 }]), 'rfbScreens reads every screen rect of the -308 payload (noVNC 1.7 keeps only the first id)', sc);
ok(S.rfbScreens(payload.subarray(0, 20)) === null && S.rfbScreens(Uint8Array.from([0, 0, 0, 0])) === null && S.rfbScreens(null) === null, 'a short / empty / absent payload ⇒ null');
const send = Uint8Array.from([5, 1, 0, 10, 0, 20, 3, 1, 0, 0, 0, 0, 10, 0, 8, 0, 4, 1, 0, 0, 0, 0, 0, 97, 2, 0, 0, 2, 0, 0, 0, 0, 255, 255, 254, 204]);
ok(S.clientMessages(send).join() === '5,3,4,2', 'clientMessages cuts one send into pointer · update request · key · set-encodings', S.clientMessages(send));
ok(S.clientMessages(Uint8Array.from([3, 1, 0])).length === 0 && S.clientMessages(Uint8Array.from([5, 0, 0, 0, 0, 0, 77, 1])).join() === '5', 'a cut message or an unknown type stops the cut (never a guess)');
const tm = S.updateTimer();
for (const at of [0, 50, 110, 160, 5000, 5040]) tm.request(at);
const st = tm.stats(5100);
ok(st.roundTripMs === 50 && st.samples === 4 && st.fps === 2, 'updateTimer: request → next request is the update round trip (an idle 4.8 s gap is not latency); fps = requests in the last second', st);

console.log('§3 the display-facts op');
ok(MW.displaysArgv('linux').code === 'not_desktop_machine' && MW.displaysArgv('darwin').argv[0] === '/usr/bin/osascript' && MW.displaysArgv('win32').argv[0] === 'powershell.exe', 'argv per platform (JXA on a Mac, encoded PowerShell on Windows, none elsewhere)');
ok(/NSScreen\.screens/.test(MW.MAC_DISPLAYS_JXA) && /backingScaleFactor/.test(MW.MAC_DISPLAYS_JXA) && /Screen\]::AllScreens/.test(MW.winDisplaysScript()) && /SetProcessDPIAware/.test(MW.winDisplaysScript()), 'the scripts read NSScreen.screens + backingScaleFactor / AllScreens after SetProcessDPIAware (physical pixels)');
const macOut = JSON.stringify({ t: 'displays', origin: 'bottom-left', rows: [{ id: 69733632, name: 'Built-in Retina Display', x: 0, y: 0, w: 1512, h: 982, scale: 2, primary: 1 }, { id: 2, name: 'DELL U2720Q', x: 1512, y: -98, w: 1920, h: 1080, scale: 1, primary: 0 }] }) + '\n';
const mac = MW.parseDisplayFacts('darwin', macOut);
ok(mac.ok && mac.displays.map((d) => `${d.name}@${d.x},${d.y}`).join('|') === 'Built-in Retina Display@0,0|DELL U2720Q@1512,0' && mac.displays[0].primary, 'a Mac fixture: bottom-left frames flipped against the primary (a taller monitor below the menu bar line lands at y 0)', mac);
const winOut = '#< CLIXML\r\n' + JSON.stringify({ t: 'displays', origin: 'top-left', aware: 1, rows: { id: '\\\\.\\DISPLAY1', name: '\\\\.\\DISPLAY1', x: 0, y: 0, w: 2560, h: 1440, scale: 1.5, primary: 1 } }) + '\r\n';
const w1 = MW.parseDisplayFacts('win32', winOut);
ok(w1.ok && w1.displays.length === 1 && w1.displays[0].name === 'DISPLAY1' && w1.displays[0].scale === 1.5, 'a Windows fixture: PowerShell 5\'s lone row as an object, the \\\\.\\ prefix dropped', w1);
ok(MW.parseDisplayFacts('win32', 'garbage\n{"t":"other"}').code === 'bad_output' && MW.parseDisplayFacts('darwin', '{"t":"displays","rows":[{"x":0}]}').code === 'bad_output', 'no table / no usable row ⇒ bad_output, by name');
const ran = [];
const fx = (out, err = null) => (file, argv, opts, cb) => { ran.push([file, opts.timeout]); setImmediate(() => cb(err, out, err ? 'denied' : '')); };
const r1 = await MW.readDisplayFacts({ platform: 'win32', execFile: fx(winOut), env: {} });
const r2 = await MW.readDisplayFacts({ platform: 'darwin', execFile: fx('', Object.assign(new Error('x'), { code: 1 })), env: {} });
const r3 = await MW.readDisplayFacts({ platform: 'linux', execFile: fx(''), env: {} });
ok(r1.ok && r2.code === 'displays_failed' && r2.error === 'denied' && r3.code === 'not_desktop_machine' && ran.length === 2 && ran[0][1] === MW.DISPLAYS_MS, 'readDisplayFacts: bounded (10 s), a failure named with its first stderr line, Linux never spawns', { r1, r2, r3, ran });
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const ad = read('src/agentd/agentd.js'), cl = read('src/agentd/client.js'), rt = read('src/routes/desktop-apps.js');
ok(/capabilities: \[[^\]]*'display-facts'\]/.test(ad) && /if \(msg\.op === 'display-facts'\)/.test(ad) && /m\.op === 'display-facts-result'/.test(cl) && /includes\?\.\('display-facts'\)\) \{ const e = new Error\('daemon lacks display-facts/.test(cl), 'the agent answers the op and says the capability; the client gates on it (an old agent is never asked) and routes the answer');
ok(/router\.get\('\/api\/desktop\/machine-desktop\/displays', async \(req, res\) => \{\n  if \(humanOnly\(req, res\)\) return;/.test(rt) && /router\.get\('\/api\/desktop\/machine-desktop\/link', async \(req, res\) => \{\n  if \(humanOnly\(req, res\)\) return;/.test(rt), 'both new routes are people-only first (human_only before anything is read)');

console.log('§4 the noVNC patch');
const rfbSrc = read('node_modules/@novnc/novnc/core/rfb.js');
const pr = P.patchRfb(rfbSrc);
ok(pr.ok && pr.applied.join() === 'crop,screens' && P.ADDED_LINES <= 20, `both anchors apply exactly once on the bundled noVNC; ${P.ADDED_LINES} added lines (≤ 20)`, pr.missing);
ok(/Disable viewport clipping if we are scaling/.test(rfbSrc) && /if \(i === 0\) \{\n\s+this\._screenID = this\._sock\.rQshift32\(\);/.test(rfbSrc) && /typeof urlOrChannel === "string"/.test(rfbSrc), 'the measured 1.7 facts the patch answers: clip is dropped while scaling; ExtendedDesktopSize keeps only screen 0; RFB takes a channel object');
const drift = P.patchRfb(rfbSrc.replace('const firstUpdate = !this._supportsSetDesktopSize;', 'const firstUpdate = !this._supportsSetDesktopSize ;'));
ok(!drift.ok && drift.missing.join() === 'screens', 'a drifted anchor is MISSING by name (scripts/build-novnc.mjs then fails the build)', drift);
ok(!P.patchRfb(pr.text).ok, 'applied twice: the anchors are gone (no double patch)');
const built = fs.existsSync(path.join(REPO, 'public/novnc.js')) ? read('public/novnc.js') : '';
ok(/vsCrop/.test(built) && /vsscreens/.test(built) && /node scripts\/build-novnc\.mjs/.test(read('package.json')), 'the built public/novnc.js carries the patch (the build script makes it)', built.length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
