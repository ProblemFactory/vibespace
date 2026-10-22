#!/usr/bin/env node
// lane stream-p1a-transport HEAVY (design q-041 r2 §2/§3 P1 + P1b — owner 2026-10-16 「一起做」): a paired Windows machine's
// desktop as a WebRTC STREAM in the machine desktop window, end to end on this box. The REAL agentd bundle runs Windows-shaped
// (its hello and THE injector say win32; a fixture powershell.exe on its PATH is the resident SendInput script — it logs every
// stdin line and answers `ok`, or `uipi` while an "elevated window" flag file exists); its fake source loops THE fixture
// (scripts/fixtures/stream/fake-desk-720p.h264 — a frame number in a binary band). The hub half: the real access layer + the
// routes (src/server/desktop-webrtc.js made by them) + the ONE picture bridge for the VNC fallback, whose machine side is a
// stub RFB server. The page: the real src/lib/machine-desktop.js + stream-view.js + vnc-view.js in headless Chrome (zh):
//   ① the window opens STREAMING: a <video> where the canvas was, the strip reads 串流 · N ms · N fps + 往返 · 抖动 · fps · 解码 · kbps
//      ⓟ lane stream-cursor — THE POINTER IS YOURS: over the playing <video> (the topmost element at its centre) the computed
//      cursor is the page's arrow (default), even under a pane that says none — RED CONTROL: the video without the rule
//      inherits that none; the chip's title says 指针是你的
//   ② the picture PLAYS: the band read off the <video> twice advances (a screenshot pair)       stream-1.png, stream-2.png
//   ③ the stats strip: fps > 0, decode ms, kbps — and the agent's own numbers in the chip's title
//   ④ input over the data channel into THE resident script: a click at the picture's centre = M 640 360 · D 0 · U 0; a key = its
//      scan code; a Mac viewer's ⌘ = the machine's Ctrl (K 29 0 0) — RED CONTROL: the door without THE table sends K 91 1 0
//   ⑤ UIPI: an elevated window in front ⇒ the strip names it (the press never reached it)
//   ⑥ NEVER SILENT (lane stream-fallback-never-silent): the machine ends the PLAYING stream ⇒ 「串流中断：…——正在重新连接…」 and the
//     same stream again (no VNC); ended again ⇒ 「重试」 「显示 VNC 画面」, nothing by itself; the press ⇒ the VNC picture signs in
//     and draws  fallback.png
//      ⓟ this stub sends no pointer of its own (a Mac's Screen Sharing showed none — lane stream-cursor): the canvas shows YOUR
//      arrow (default), never noVNC's none; the chip's title says 指针是你的
//   ⑦ relay-only — lane stream-relay-udp: the daemon's own UDP leg carries it, the strip says 经 hub 中转 · UDP; the copy's
//      firewall drops its self-probe ⇒ the strip says 机器防火墙挡住直连，经 hub 中转 with the owner's admin line to copy (the
//      netsh rule for its node.exe; the toast says where to paste it) — never on the direct path (①); the notice sits AHEAD of
//      the numbers, its copy button wholly in the strip's view (the topmost element at its centre) — RED CONTROL (lane
//      stream-relay-udp-ci): the old order (after the numbers) in a narrow window puts the button past the strip's edge and a
//      click at its centre copies nothing, THE order in the same window copies (lane ci-339-reds: the window MEASURED — THE
//      strip's own content + 24 px, a font fact; a fixed 900 px broke once the strip gained 「麦克风」); a hub that offers no leg
//      ⇒ 经设备链路 (the relay over the device link)                                                          relay.png, relay-link.png
//   ⑧ a hub with no fake source and a machine with no ffmpeg: its screen source is refused (no_ffmpeg) ⇒ the VNC picture at
//      once, NO note (the chip's title says why: 需要 ffmpeg ≥ 7（含 ddagrab 与 NVENC）…)
//   ⑨ phone 375×667: it plays in the same shell, the strip is ONE row (scrolled to its numbers), a TAP is a click on the machine   phone.png, phone-stats.png
//   ⑩ THE MACHINE'S OWN SCREEN (lane stream-p1b-screen): a fake ffmpeg.exe + PowerShell facts (an HDR primary, SDR white
//      200 nits): the HDR road plays, the strip reads NVENC · 编码 N ms, the chip's title says the HDR was mapped on the
//      machine; the capture ffmpeg dies ⇒ 串流停了（机器的屏幕采集停了）and the VNC picture signs in and draws   screen.png, screen-fallback.png
//   ⑭ THE HAND-OVER (lane desktop-handover): the strip's 「交给 agent」 (only while the stream plays) → the one-holder picker →
//      「Alpha 正在操作」; the agent's still (desktop-grab through the REAL bundle: the fake source's 1280×720 PNG) and its click at
//      the still's centre reach THE resident script as the owner's click did in ④ (M 640 360 · D 0 · U 0 — the same sink); its
//      pointer shows over the picture, labelled Alpha; the owner's own click on the picture PAUSES it (已暂停——你在操作 + 「继续交给它」;
//      the agent's next verb ⇒ window_paused, nothing sent); 「继续交给它」 resumes; the owner's wheel pauses it too; 「收回」 ends it
//      (desktop_not_handed); handed again, the window's × ends it (window_closed)                                      handover.png, handover-paused.png
//   ⑪ ONE WINDOW as the stream (lane stream-window-fixes — the owner's first real use): the agent's REAL window source (a fake
//      csc "builds" a fake vibespace-wgc whose window is titled 中文窗口 🎨 测试) in the real src/lib/machine-app.js window: the
//      title intact, THE stats row of the whole screen's window (往返 · 抖动 · fps · 解码 · kbps · NVENC · 编码); no 「还原它」 while
//      live (and the measured cause: a hidden .file-tool-btn computes display:flex); minimized on the machine ⇒ the row
//      窗口在…上被最小化了——串流暂停 + 「还原它」, which asks the helper to restore THAT window, then goes when live again; the
//      picker marks the window 正在串流 with 「停止」; 「停止串流」, the picker's 「停止」 and the window's × each end the session on
//      the hub AND the machine's helper (by name, in the agent's log); a viewer that vanishes (its tab gone, no word) ends it
//      within 5 s — RED CONTROL: a hub that never acts on the closed poll still streams at 6 s       window-*.png
//   ⑯ 「HDR 直通」 (lane stream-hdr-passthrough — a mocked HDR viewer: (dynamic-range: high) + decodingInfo; the agent's screen source
//      with av1_nvenc and THE AV1 fixtures): no switch on an SDR screen, for a software-only AV1 decoder, or for a machine without
//      an AV1 encoder; shown and OFF for an HDR screen + hardware AV1 + a machine that can; THE FALLBACK for real — the press asks
//      HDR, this Chrome's dav1d refuses 10-bit, 2 s later 「HDR 直通已回退：浏览器无法解码」, the session ends hdr_undecodable, the
//      SDR picture plays, the switch is off; CONTROL — the 8-bit AV1 stream through the same road decodes (· HDR on the summary);
//      the details' codec AV1 + 「HDR」 row; an SDR screen ⇒ SDR, back ⇒ HDR; remembered per machine (a new window starts in HDR)
//                                                                              hdr-switch.png, hdr-fallback.png, hdr-details.png
// PNGs when `--shots <dir>`.
//   ⑫ a Mac's strip (lane stream-mac-stall): over a STREAM the switcher lists the Mac's displays (its offer's rows, left to right,
//      the streamed one pressed, no 全部); a pick restarts the stream ON that display; 「打开系统设置」 opens the pane ON the Mac
//      (POST settings-open — the toast says so), the link copied only when the agent predates it      mac-switcher.png, mac-tcc-door.png
//   ⑩ also (lane stream-mac-rate): the chip's title says what the machine DECIDED — 机器以 N kbps 编码——这个大小的屏幕不会低于 F
//      kbps — N and F the agent's own numbers (THE RATE: the screen's floor, 1280×720 @ 30 ⇒ 2500)
//   lane stream-stats-popup: the numbers sentence LEFT the strip — every leg above reads it off the chip's title (the summary's
//      tooltip); ⑦'s RED CONTROL puts a sentence of its length back AHEAD of the notice (/fwlast); ⑨ taps the summary instead
//   ⑭ THE DETAILS · THE PIN · TRUE FULL SCREEN: the strip is ONE summary + its chart glyph (before: /prelane — the pre-lane
//      strip, the sentence back in it); its click = the details popup (data-popover): the table + three inked charts, a hover
//      reads a second; 「钉住」 ⇒ a panel in the picture's top-right that outlives the popup, dragged to bottom-left and
//      remembered; 「全屏」 ⇒ the picture is 100 % of the screen, the strip a pill (grip · summary · 退出全屏 · ⋯ — the ⋯ and the
//      details inside the full-screen element), hidden 3 s after the pointer rests, back on a move, dragged to bottom-right
//      and remembered on reopen; 「退出全屏」 / the browser's exit put the bar back — RED CONTROL: the pre-lane full screen keeps
//      the bar over the picture (< 100 %)                        strip-before.png, strip-after.png, details.png, pinned.png, fullscreen.png, …
//   ⑮ a phone (touch): a tap on the summary = the details inside the 375 px screen; in full screen the pill hides, a tap in the
//      middle is the machine's (the pill stays away), a tap in the pill's corner wakes it and never reaches the machine
//   ⑬ THE ESTIMATE (lane stream-mac-rate — werift 0.25's send-side estimate counts ~one packet a picture: the owner's 300 kbps):
//      THE fixture padded to ~3 Mbps (a filler NAL a picture — 11 packets each) through the real agent bundle to this Chrome:
//      the agent's estimate (its own transport-cc reading) stays within 0.7–2.5 × what it sent — werift's would read ~1/11
//   ⑲ THE MICROPHONE ALLOWED (lane werift-lite-multihomed — backlog B-c7d7: a person who pressed 「麦克风」 once; Chrome remembers
//      it per origin and then offers EVERY adapter of the computer as a host candidate, not one mDNS name): granted to this origin
//      BEFORE the window opens, the stream PLAYS; the browser read the agent's offer as ICE-lite (its own copy of the offer says
//      a=ice-lite at the session level) and the picture arrives on the pair the BROWSER selected (it moves its pair as more pairs
//      pass — the agent follows, its log says so) — RED CONTROL: the agent's offer and pair handling as werift writes them
//      (a=ice-lite inside the media sections only — the browser drops it — and the first nomination kept for good) stays black
//      on a computer whose browser offers ≥ 2 addresses (one address: said, not judged — the black stream needs two)
//      NEVER SILENT before a picture: an agent that answers no check ⇒ at the connect budget (STREAM_LIMITS.connectMs) the strip
//      says 串流中断：没能及时连上——正在重新连接… (leg ⑥'s words) — RED CONTROL: the window before this lane still says only
//      串流 · 连接中… at that moment (it spoke at the 45 s fallback)
//   ⑳ THE SOUND 「声音」 (lane speaker-passthrough-v1 — backlog B-aec9; the machine's audio is the FAKE loopback of the microphone
//      helper — scripts/fixtures/stream/mic-fakes.mjs — through the agent's REAL ffmpeg): every stream carries the sound's track in
//      the picture's MediaStream (one <video>); OFF by default — nothing runs on the machine, the <video> muted; the press = the
//      <video> unmuted in that click + ONE loopback on the machine ⇒ Chrome receives the Opus and hears the tone (its audio level);
//      Chrome got RTCP sender reports on BOTH tracks (its lip-sync); THE RATE: the agent tells the picture the estimate less the
//      sound's 80 kbps; the second press ⇒ muted, the machine's capture ended; ON is remembered per machine (a new window starts
//      it); a RESTORED window (a layout replay) says 「点一下开声音」 and captures nothing until a press — RED CONTROL: a toggle
//      that ignores `restored` starts it by itself; the microphone and the sound on together ⇒ ONE sendrecv m-line, both roads
//      live; a phone: the same strip                                     sound-off.png, sound-on.png, sound-tap.png, phone-sound.png
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, scratch, endDaemonsOf, ONBOARDED_SOURCE } from './scratch.mjs';
import { writeFakeFfmpeg, factsLine, calibrationFrame } from './fixtures/stream/screen-fakes.mjs';
import { writeFakeWgc, writeFakeCsc } from './fixtures/stream/window-fakes.mjs';
import { writeFakeMic, winFacts, toneRatio, writeFakeDecoder, pcmPages, realFfmpeg } from './fixtures/stream/mic-fakes.mjs'; // lane stream-mic-road ⑰: the machine's microphone, a fake sink
import { writeFakeEncoder, hasOpusFfmpeg } from './fixtures/stream/sound-fakes.mjs'; // lane speaker-passthrough-v1 ⑳: a box without ffmpeg (the Actions runner) encodes with the fake
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const NOVNC = path.join(REPO, 'public/novnc.js');
const FIXTURE = path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264');
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : process.env.VS_UI_SHOTS_DIR ? path.join(process.env.VS_UI_SHOTS_DIR, 'webrtc-chrome') : null; })(); // VS_UI_SHOTS_DIR: the Actions mirror's kept PNGs (ci.yml)
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const f of [BUNDLE, NOVNC, FIXTURE]) if (!fs.existsSync(f)) { ok(false, `${path.relative(REPO, f)} exists (npm run build first)`); process.exit(1); }

// ── the scratch device: Windows-shaped, THE resident script = a fixture powershell.exe ───────────────────────────────
const root = scratch('webrtc-chrome');
fs.mkdirSync(root, { recursive: true });
const realHome = process.env.HOME;
const rootOf = (h) => path.join(h, 'agentd-root');
let chrome = null, srv = null, vnc = null, dm = null;
const home = path.join(root, 'win');
const cleanup = () => {
  try { dm && dm.stop(); } catch { /* gone */ }
  try { endDaemonsOf(rootOf(home)); } catch { /* gone */ } // every daemon of this root (the pid file alone missed the device process — it outlived the suite)
  try { chrome && process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome && chrome.kill('SIGKILL'); } catch { /* gone */ } }
  try { srv && srv.close(); } catch { /* gone */ }
  try { vnc && vnc.server.close(); } catch { /* gone */ }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.mkdirSync(path.join(home, '.local/bin'), { recursive: true });
const PS_LOG = path.join(root, 'ps-lines.txt'), ELEVATED = path.join(root, 'elevated'), FACTS = path.join(root, 'stream-facts.json');
fs.writeFileSync(FACTS, factsLine([{ id: '\\\\.\\DISPLAY1', x: 0, y: 0, w: 1280, h: 720, primary: true, hdr: true, white: 2500, adapter: 0, output: 0 }])); // ⑧ ⑩: the machine's screen facts (an HDR primary, SDR white 200 nits)
fs.writeFileSync(path.join(home, '.local/bin/powershell.exe'), `#!${process.execPath}
const fs = require('fs'); { const a = process.argv.slice(2), sc = Buffer.from(a[a.length - 1] || '', 'base64').toString('utf16le'); if (/'stream-facts'/.test(sc)) { process.stdout.write(fs.readFileSync(${JSON.stringify(FACTS)}, 'utf8') + '\\r\\n'); process.exit(0); }
  if (/VsQos/.test(sc)) { const ids = ((/foreach \\(\\$id in @\\(([\\d,]+)\\)\\)/.exec(sc) || [])[1] || '').split(',').map(Number); process.stdout.write(JSON.stringify({ t: 'unthrottle', rows: ids.map((pid) => ({ pid, ok: true, err: 0 })) }) + '\\r\\n'); process.exit(0); } } // ⑯: the HDR road's power-throttling opt-out
process.stdout.write('ready\\r\\n');
let buf = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); fs.appendFileSync(${JSON.stringify(PS_LOG)}, l + '\\n'); process.stdout.write(((l[0] === 'D' || (l[0] === 'K' && l.endsWith(' 0'))) && fs.existsSync(${JSON.stringify(ELEVATED)}) ? 'uipi' : 'ok') + '\\r\\n'); } });
`, { mode: 0o755 });
const psLines = () => (fs.existsSync(PS_LOG) ? fs.readFileSync(PS_LOG, 'utf8').trim().split('\n').filter(Boolean) : []);
// ⑪ (lane stream-window-fixes): the machine's window helper — %WINDIR% with its WinMetadata and the in-box csc (one Linux file name
// each: the agent joins Windows paths with backslashes), a csc that "builds" the fake vibespace-wgc into %LOCALAPPDATA%
const CJK = '中文窗口 🎨 测试', WPID = path.join(root, 'wgc.pid'), WLOG = path.join(root, 'wgc.log');
const WROW = { hwnd: '657982', pid: 4242, cls: 'WindowsForms10.Window.8.app.0.1', title: CJK, exe: 'C:\\Program Files\\Lightroom\\Lightroom.exe', visible: true, min: false, cloaked: 0, tool: false, owner: '0', frame: [100, 80, 740, 440], dpi: 96, display: '\\\\.\\DISPLAY1', elevated: false, capturable: true };
const WCAP = { w: 640, h: 360, frame: WROW.frame, dpi: 96, pidFile: WPID, script: [] };
const wgc = writeFakeWgc(path.join(root, 'wgc'), { log: WLOG, windows: [WROW], capture: WCAP });
const WINDIR = path.join(root, 'windows'), LAD = path.join(root, 'lad');
fs.mkdirSync(`${WINDIR}\\System32\\WinMetadata`, { recursive: true });
for (const f of ['Windows.Foundation.winmd', 'Windows.Graphics.winmd']) fs.writeFileSync(path.join(`${WINDIR}\\System32\\WinMetadata`, f), '');
writeFakeCsc(`${WINDIR}\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe`, { helper: wgc.exe });
const wgcLines = () => (fs.existsSync(WLOG) ? fs.readFileSync(WLOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/;
const INJ = /(createInjector\(\{\s*)platform: process\.platform,/;
const SCR = /(createScreen\(\{\s*)platform: process\.platform,/;
const WSRC = /(createWindowSource\(\{\s*)platform: process\.platform,/; // ⑪: THE window source, Windows-shaped
ok(HELLO.test(bundleText) && INJ.test(bundleText) && SCR.test(bundleText) && WSRC.test(bundleText) && /"stream-offer"/.test(bundleText) && /"stream-screen"/.test(bundleText), 'the bundle carries the hello-ack platform, THE injector\'s, THE screen source\'s and the stream-offer / stream-screen capabilities (the copy patches exactly those)');
fs.mkdirSync(path.join(root, 'bundle'), { recursive: true });
// lane stream-relay-udp: the copy's firewall drops its self-probe (no probe datagram is heard ⇒ directInbound blocked) and it names
// a Windows node.exe (the page builds the owner's admin line from it)
const PROBE = 'const i = tokens.findIndex((tk) => tk.equals(m));', PROGRAM = 'program: process.platform === "win32" ? process.execPath : null';
const NODE_EXE = 'C:\\Users\\owner\\AppData\\Local\\vibespace\\node\\node.exe';
ok(bundleText.split(PROBE).length === 2 && bundleText.split(PROGRAM).length === 2, 'the bundle carries the self-probe\'s receive line and the stream host\'s program (the copy patches exactly those)');
// ⑲ (lane werift-lite-multihomed): BASE_ICE = the agent's offer and pair handling as werift writes them (the offer's SDP unchanged,
// no pair followed — the RED CONTROL); DEAF_ICE = the agent answers no check at all (ICE never connects — the strip at the budget)
const BASE_ICE = path.join(root, 'base-ice'), DEAF_ICE = path.join(root, 'deaf-ice');
const LITE = 'SM.liteSessionSdp(', FOLLOW = 'if (!msg || !Array.isArray(msg.attributesKeys) || !msg.attributesKeys.includes("USE-CANDIDATE")) return true;';
ok(bundleText.split(LITE).length === 3 && bundleText.split(FOLLOW).length === 2, 'the bundle carries the two offers\' session-level a=ice-lite and THE BROWSER\'S CHOICE (the copy patches exactly those)');
fs.writeFileSync(path.join(root, 'bundle', 'vibespace-agentd.js'), bundleText.replace(HELLO, '$1platform: "win32",').replace(INJ, '$1platform: "win32",').replace(SCR, '$1platform: "win32",').replace(WSRC, '$1platform: "win32",').replace(PROBE, 'const i = -1;').replace(PROGRAM, `program: ${JSON.stringify(NODE_EXE)}`)
  .split(LITE).join(`(require("fs").existsSync(${JSON.stringify(BASE_ICE)}) ? String : SM.liteSessionSdp)(`)
  .replace(FOLLOW, `if (require("fs").existsSync(${JSON.stringify(DEAF_ICE)})) return false; if (require("fs").existsSync(${JSON.stringify(BASE_ICE)})) return true; ${FOLLOW}`));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const MM = require(path.join(REPO, 'src/mic-model.js'));
const MIC = writeFakeMic(path.join(root, 'mic')); // ⑰: the agent's microphone helper — a fake sink (src/desktop-mic.js's seam)
// lane ci-339-reds: a box with NO ffmpeg (the Actions runner) — the agent's decoder is the fake one, first on its PATH (each
// Ogg page's number as its PCM); ⑰'s tone check is then skipped BY NAME (it needs a real decoder)
const PATH0 = process.env.PATH || '', REAL_FF = realFfmpeg(PATH0), DEC = REAL_FF ? null : writeFakeDecoder(path.join(root, 'decoder'));
if (DEC) process.env.PATH = DEC.dir + path.delimiter + PATH0;
process.env.HOME = home; process.env.VIBESPACE_AGENTD_ROOT = rootOf(home); process.env.WINDIR = WINDIR; process.env.LOCALAPPDATA = LAD; process.env.VIBESPACE_MIC_HELPER = MIC.exe; // ⑪: the helper's build recipe reads these
const SOUND_FAKE = !hasOpusFfmpeg() || process.env.VS_SOUND_FAKE_FFMPEG === '1'; // ⑳: no ffmpeg with libopus here ⇒ the sound's encoder is the fake (the committed tone as RTP)
if (SOUND_FAKE) process.env.VIBESPACE_SOUND_FFMPEG = writeFakeEncoder(path.join(root, 'encoder')).exe;
const dataDir = path.join(home, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
dm = new DeviceManager({ dataDir, bundlePath: path.join(root, 'bundle', 'vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
try { await dm.connect(); } finally { process.env.HOME = realHome; delete process.env.VIBESPACE_AGENTD_ROOT; delete process.env.WINDIR; delete process.env.LOCALAPPDATA; delete process.env.VIBESPACE_MIC_HELPER; delete process.env.VIBESPACE_SOUND_FFMPEG; process.env.PATH = PATH0; }
ok(dm.status().info.platform === 'win32' && dm.status().info.capabilities.includes('stream-offer'), 'a real agent, Windows-shaped, says stream-offer');

// ── the machine's VNC server for the fallback: a stub RFB 3.8, VNC-password sign-in, one 1280×720 green frame ─────────
const FW = 1280, FH = 720, GREEN = [40, 150, 70];
const frame = (() => { const px = Buffer.alloc(FW * FH * 4); for (let i = 0; i < FW * FH; i++) { px[i * 4] = GREEN[0]; px[i * 4 + 1] = GREEN[1]; px[i * 4 + 2] = GREEN[2]; } return px; })();
function stubVnc() {
  const seen = { sessions: 0, authed: 0 };
  const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
  const rect = (x, y, w, h, enc) => { const b = Buffer.alloc(12); b.writeUInt16BE(x, 0); b.writeUInt16BE(y, 2); b.writeUInt16BE(w, 4); b.writeUInt16BE(h, 6); b.writeInt32BE(enc, 8); return b; };
  const server = net.createServer((sock) => {
    const c = { stage: 0, buf: Buffer.alloc(0), full: false };
    sock.on('error', () => { });
    sock.write('RFB 003.008\n');
    sock.on('data', (d) => {
      c.buf = Buffer.concat([c.buf, d]);
      for (;;) {
        const b = c.buf;
        if (c.stage === 0) { if (b.length < 12) return; c.buf = b.subarray(12); c.stage = 1; sock.write(Buffer.from([1, 2])); continue; }
        if (c.stage === 1) { if (b.length < 1) return; c.buf = b.subarray(1); c.stage = 10; sock.write(crypto.randomBytes(16)); continue; }
        if (c.stage === 10) { if (b.length < 16) return; c.buf = b.subarray(16); c.stage = 2; seen.authed++; sock.write(Buffer.from([0, 0, 0, 0])); continue; }
        if (c.stage === 2) { if (b.length < 1) return; c.buf = b.subarray(1); c.stage = 3; seen.sessions++; const name = Buffer.from('WIN-DESK1'); sock.write(Buffer.concat([u16(FW), u16(FH), Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 0, 8, 16, 0, 0, 0]), u32(name.length), name])); continue; }
        if (!b.length) return;
        const t = b[0];
        const need = t === 0 ? 20 : t === 2 ? (b.length >= 4 ? 4 + 4 * b.readUInt16BE(2) : 1e9) : t === 3 ? 10 : t === 4 ? 8 : t === 5 ? 6 : t === 6 ? (b.length >= 8 ? 8 + Math.abs(b.readInt32BE(4)) : 1e9) : t === 150 ? 10 : t === 251 ? (b.length >= 8 ? 8 + 16 * b[6] : 1e9) : 1;
        if (b.length < need) return;
        if (t === 3 && !c.full) { c.full = true; sock.write(Buffer.concat([Buffer.from([0, 0]), u16(1), rect(0, 0, FW, FH, 0), frame])); }
        c.buf = b.subarray(need);
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, seen })));
}
vnc = await stubVnc();

// ── the hub: the real access layer + routes (+ the stream module they make) + the ONE picture bridge ───────────────────
const quiet = { log() { }, warn() { } };
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
const hosts = { list: () => [{ id: 'win-a', name: 'WIN-DESK1', transport: 'dial' }], linkState: () => 'online', connectedDevice: (id) => (id === 'win-a' ? dm : null), get: (id) => (id === 'win-a' ? { id, name: 'WIN-DESK1' } : null), isLocal: (id) => id === 'local', deviceBounded: async (id) => (id === 'win-a' ? dm : null) };
const access = ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }) });
const DS = require(path.join(REPO, 'src/server/desktop-stream.js'));
const bridge = DS.create({ auth: { requestAuthed: () => true }, log: quiet, pingMs: 5000, resolveTarget: (id) => access.machineDesktopTarget(id), forwardPort: (h, p) => access.forwardPort(h, p) });
const express = require(path.join(REPO, 'node_modules/express'));
const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
const BASE = { access, stream: bridge, vnc: { status: async () => ({ available: true, running: false }) } };
R.setup({ ...BASE });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = `import { openMachineDesktop } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-desktop.js'))};
import { openWindowStream, openWindowPicker } from ${JSON.stringify(path.join(REPO, 'src/lib/machine-app.js'))};
let n = 0;
const wm = { windows: new Map(), revealWindow() {},
  createWindow({ title, type }) {
    const id = 'w' + (++n); const el = document.createElement('div'); el.className = 'vs-win'; el.dataset.type = type;
    el.style.cssText = window.__winCss; const bar = document.createElement('div'); bar.className = 'vs-win-title'; bar.textContent = title;
    bar.style.cssText = 'flex:0 0 auto;padding:6px 10px;font-size:13px;font-weight:600;border-bottom:1px solid var(--border)';
    const content = document.createElement('div'); content.style.cssText = 'flex:1 1 auto;min-height:0;position:relative;display:flex;flex-direction:column';
    el.append(bar, content); document.body.append(el);
    const w = { id, element: el, content, title, type }; wm.windows.set(id, w); return w; },
  closeWindow(id) { const w = wm.windows.get(id); if (!w) return; wm.windows.delete(id); w.onClose && w.onClose(); w.element.remove(); },
  setTitle(id, t) { const w = wm.windows.get(id); if (w) w.element.querySelector('.vs-win-title').textContent = t; }, resizeWindowTo() {},
};
const app = { wm, _hideWelcome() {}, sidebar: { _webuiSessions: [], _tasks: [] } }; // ⑭: the roster the hand-over's picker reads
window.__app = app;
window.__open = (m, o) => { openMachineDesktop(app, m, o || {}); return true; }; // ⑳: o = { syncId } — a RESTORED window (a layout replay)
window.__openWin = (m, row) => { openWindowStream(app, m, row); return true; }; // ⑪
window.__picker = (m) => { openWindowPicker(app, m, {}); return true; };
window.__closeAll = () => { for (const id of [...wm.windows.keys()]) wm.closeWindow(id); };
// the binary band (16 cells × 80 px at y 640–700 of the 1280×720 picture), read off the <video>
window.__band = () => { const v = document.querySelector('.vs-win .stream-video'); if (!v || !v.videoWidth) return null; const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; const g = c.getContext('2d'); g.drawImage(v, 0, 0); let k = 0; for (let b = 0; b < 16; b++) { const d = g.getImageData(b * 80 + 40, 670, 1, 1).data; k = k * 2 + (d[0] > 128 ? 1 : 0); } return k; };`;
// ④'s RED control: the door WITHOUT THE table (a modifier key is sent as pressed — a Mac's ⌘ stays the Windows key)
const MOVE = '  const moved = modifierKeyOf({ key: e && e.key, code: e && e.code }, map);\n';
const noTable = { name: 'no-table', setup(b) { b.onLoad({ filter: /stream-input\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(MOVE)) throw new Error('the door\'s table line moved'); return { contents: src.replace(MOVE, '  const moved = null;\n'), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page.js'), loader: { '.css': 'empty' }, logLevel: 'error' });
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-notable.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [noTable] });
// ⑦'s RED control (lane stream-relay-udp-ci; lane stream-stats-popup): a numbers sentence of its length put back AHEAD of the
// firewall notice (the strip before the relay-udp-ci fix — the numbers left the strip in lane stream-stats-popup)
const FW_ORDER = '  strip.append(fwEl, tccEl, noteEl);\n'; // + lane stream-p3m-build's Mac permission notice (tccEl, hidden off a Mac — int304)
const NUM_LOOK = 'flex:0 0 auto;padding:1px 7px;border-radius:9px;background:var(--bg-input);color:var(--text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap'; // the pre-lane .desktop-strip-stream rule
const fwLast = { name: 'fw-last', setup(b) { b.onLoad({ filter: /machine-desktop\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(FW_ORDER)) throw new Error('the strip\'s order line moved'); return { contents: src.replace(FW_ORDER, `  const longNum = document.createElement('span'); longNum.className = 'desktop-strip-stream'; longNum.style.cssText = '${NUM_LOOK}'; longNum.textContent = '往返 12 ms · 抖动 3 ms · 30 fps · 解码 1.5 ms · 5400 kbps · 经 hub 中转 · UDP';\n  strip.append(longNum, fwEl, tccEl, noteEl);\n`), loader: 'js' }; }); } };
// ⑭'s BEFORE (lane stream-stats-popup): the pre-lane strip — the live numbers sentence back after the notices, in its old look —
// and the pre-lane full screen (no pill: the strip stays a bar over the picture)
const PRE_DRAW = "    const { playing, page: p, agent: a, words } = stats.draw(stream); // the firewall notice + the details' series (src/lib/stream-stats.js)\n", PRE_FULL = 'pill.sync(); ';
const preLane = { name: 'pre-lane', setup(b) { b.onLoad({ filter: /machine-desktop\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); for (const x of [FW_ORDER, PRE_DRAW, PRE_FULL]) if (!src.includes(x)) throw new Error('the pre-lane anchor moved: ' + x.trim()); return { contents: src.replace(FW_ORDER, `  const preNum = document.createElement('span'); preNum.className = 'desktop-strip-stream'; preNum.hidden = true; preNum.style.cssText = '${NUM_LOOK}';\n  strip.append(fwEl, tccEl, preNum, noteEl);\n`).replace(PRE_DRAW, PRE_DRAW + '    preNum.textContent = words; preNum.hidden = !playing;\n').replace(PRE_FULL, ''), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-fwlast.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [fwLast] });
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-prelane.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [preLane] });
// ⑭'s reopened-pin RED CONTROL (lane mirror-315-webrtc-pin): the details' pre-fix placement — moved above a bottom anchor one
// frame AFTER they first showed (two rAFs), once (no resize watch): the frame the .315 mirror's 钉住 press aimed at
const PIN_PLACE = "    requestAnimationFrame(above);\n    if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => { if (me.isConnected) above(); else ro.disconnect(); }); ro.observe(me); } // after createPopover's own (its viewport clamp first)\n";
const prePin = { name: 'pre-pin', setup(b) { b.onLoad({ filter: /stream-stats\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(PIN_PLACE)) throw new Error('the details\' placement lines moved'); return { contents: src.replace(PIN_PLACE, '    requestAnimationFrame(() => requestAnimationFrame(above));\n'), loader: 'js' }; }); } };
// ⑰'s RED control (lane stream-mic-road): the toggle's dispose WITHOUT its close verdict (the microphone outlives its window)
const MIC_DISPOSE = "    dispose() { if (disposed) return; run(micStep(st, { type: 'close' })); disposed = true;";
const micLeak = { name: 'mic-leak', setup(b) { b.onLoad({ filter: /stream-mic-strip\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(MIC_DISPOSE)) throw new Error('the toggle\'s dispose line moved'); return { contents: src.replace(MIC_DISPOSE, '    dispose() { if (disposed) return; disposed = true;'), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-micleak.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [micLeak] });
// ⑳'s RED control (lane speaker-passthrough-v1): the toggle that forgets a window was RESTORED (it would unmute it by itself)
const SOUND_RESTORED = 'restored: restored && !pressed, activated: !!activated()';
const soundRestore = { name: 'sound-restore', setup(b) { b.onLoad({ filter: /stream-mic-strip\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(SOUND_RESTORED)) throw new Error('the toggle\'s restored line moved'); return { contents: src.replace(SOUND_RESTORED, 'restored: false, activated: !!activated()'), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-soundrestore.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [soundRestore] });
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-prepin.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [prePin] });
// ⑲'s NEVER SILENT RED CONTROL (lane werift-lite-multihomed): the window before the lane — its connect-budget words gone
const SLOW_SAID = "        if (state === 'restarting' && code === 'timeout' && v === stream) { slowSaid = true; note(t('Stream interrupted: {why} — reconnecting…', { why: streamWords('connect_timeout') })); }\n";
const preSilent = { name: 'pre-silent', setup(b) { b.onLoad({ filter: /machine-desktop\.js$/ }, (a) => { const src = fs.readFileSync(a.path, 'utf8'); if (!src.includes(SLOW_SAID)) throw new Error('the connect-budget words\' line moved'); return { contents: src.replace(SLOW_SAID, ''), loader: 'js' }; }); } };
await esbuild.build({ stdin: { contents: entry, resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(root, 'page-presilent.js'), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [preSilent] });
const app = express(); app.use(express.json());
app.use(R.router);
const CSS = ['style', 'viewers', 'chat', 'fonts'].filter((n) => fs.existsSync(path.join(REPO, `public/${n}.css`)));
for (const n of CSS) app.get(`/${n}.css`, (q, s) => s.type('text/css').send(fs.readFileSync(path.join(REPO, `public/${n}.css`))));
app.get('/page.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page.js'))));
app.get('/page-notable.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-notable.js'))));
app.get('/page-fwlast.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-fwlast.js'))));
app.get('/page-prelane.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-prelane.js'))));
app.get('/page-prepin.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-prepin.js'))));
app.get('/page-micleak.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-micleak.js'))));
app.get('/novnc.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(NOVNC)));
const HTML = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((n) => `<link rel="stylesheet" href="/${n}.css">`).join('')}<style>body{margin:0;background:var(--bg-root);height:100vh;overflow:hidden}</style></head><body><script src="/page.js"></script></body></html>`;
app.get('/', (q, s) => s.type('text/html').send(HTML));
app.get('/notable', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-notable.js')));
app.get('/fwlast', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-fwlast.js')));
app.get('/prelane', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-prelane.js')));
app.get('/prepin', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-prepin.js')));
app.get('/page-presilent.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-presilent.js'))));
app.get('/presilent', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-presilent.js')));
app.get('/micleak', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-micleak.js')));
app.get('/page-soundrestore.js', (q, s) => s.type('text/javascript').send(fs.readFileSync(path.join(root, 'page-soundrestore.js')))); // ⑳'s RED control
app.get('/soundrestore', (q, s) => s.type('text/html').send(HTML.replace('/page.js', '/page-soundrestore.js')));
const PORT = await freePort();
srv = http.createServer(app);
srv.on('upgrade', (req, socket, head) => bridge.handleUpgrade(req, socket, head, bridge.upgradeId(new URL(req.url, 'http://x').pathname)));
await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));

// ── Chrome: a scratch profile, a private HOME / XDG_RUNTIME_DIR, no display (headless) ──────────────────────────────
const CDP_PORT = await freePort();
const chromeHome = path.join(root, 'chrome-home'), chromeRun = path.join(root, 'chrome-run');
fs.mkdirSync(chromeHome, { recursive: true }); fs.mkdirSync(chromeRun, { recursive: true, mode: 0o700 });
const cenv = { ...process.env, HOME: chromeHome, XDG_RUNTIME_DIR: chromeRun }; delete cenv.DISPLAY; delete cenv.WAYLAND_DISPLAY;
// ⑰ (lane stream-mic-road): Chrome's fake microphone — 3 s of a 1 kHz tone at −20 dBFS, 48 kHz mono s16le (Chrome loops it)
const MIC_WAV = path.join(root, 'mic-tone.wav');
{ const n = 48000 * 3, d = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(3277 * Math.sin(2 * Math.PI * 1000 * i / 48000)), i * 2); const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(48000, 24); h.writeUInt32LE(96000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(d.length, 40); fs.writeFileSync(MIC_WAV, Buffer.concat([h, d])); }
chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${path.join(root, 'chrome-profile')}`, '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${MIC_WAV}`, 'about:blank'], { stdio: 'ignore', env: cenv, detached: true }); // ⑰: Chrome's fake microphone = a 1 kHz tone WAV. NEVER --use-fake-ui-for-media-stream: a page holding the microphone permission makes Chrome gather on every adapter, and a new stream to werift's ICE-lite agent then never connects on a multi-homed box (measured on base c1aba74c) — ⑰ grants it only once its stream plays, and resets it
const WebSocket = require(path.join(REPO, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
// ⑯ (lane stream-hdr-passthrough): a mocked HDR viewer — headless Chrome has no HDR screen; `screen` = (dynamic-range: high), switchable
// later (window.__hdrScreen(v) fires the media query's change, as moving the window to another screen does); `decoder` = the
// decodingInfo answer for WebRTC AV1 PQ (window.__hdrDecoder)
const HDR_MOCK = (screen, decoder) => `(() => { const mq = { matches: ${!!screen}, media: '(dynamic-range: high)', ls: [], addEventListener(t, f) { if (t === 'change') mq.ls.push(f); }, removeEventListener(t, f) { mq.ls = mq.ls.filter((x) => x !== f); }, addListener() {}, removeListener() {}, onchange: null };
  const real = window.matchMedia.bind(window); window.matchMedia = (q) => (q === '(dynamic-range: high)' ? mq : real(q));
  window.__hdrScreen = (v) => { mq.matches = !!v; for (const f of [...mq.ls]) f({ matches: mq.matches, media: mq.media }); return true; };
  window.__hdrDecoder = ${JSON.stringify(decoder)};
  const mc = navigator.mediaCapabilities; if (mc) { const di = mc.decodingInfo.bind(mc); mc.decodingInfo = async (c) => (c && c.type === 'webrtc' && /av1/i.test((c.video && c.video.contentType) || '') ? { ...window.__hdrDecoder } : di(c)); } })();`;
// ⑲ (lane werift-lite-multihomed): every RTCPeerConnection the page makes, kept — with the candidates it gathered
const PC_HOOK = `(() => { const R = window.RTCPeerConnection; if (!R) return; window.__pcs = []; const W = function (...a) { const pc = new R(...a); window.__pcs.push(pc); pc.__cands = []; pc.addEventListener('icecandidate', (e) => { if (e.candidate) pc.__cands.push(e.candidate.candidate); }); return pc; }; W.prototype = R.prototype; Object.setPrototypeOf(W, R); window.RTCPeerConnection = W; })();`;
async function page(w, h, winCss, { at = '/', mac = false, touch = false, hdr = null, pcs = false } = {}) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  // ⑰: every getUserMedia the page makes is counted and its tracks kept (were they asked? are they stopped?)
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const md = navigator.mediaDevices; window.__gum = 0; window.__micTracks = []; if (!md || !md.getUserMedia) return; const g = md.getUserMedia.bind(md); md.getUserMedia = async (c) => { window.__gum++; const s = await g(c); for (const t of s.getAudioTracks()) window.__micTracks.push(t); return s; }; })();" });
  if (hdr) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: HDR_MOCK(hdr.screen, hdr.decoder) });
  if (pcs) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: PC_HOOK });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); } catch {} window.__winCss = ${JSON.stringify(winCss)};${mac ? " Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'macOS' }, configurable: true });" : ''}` });
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  if (touch) await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const until = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); } return false; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}${at}` }); await sleep(300); await until('typeof window.__open === "function"', 10000);
  const mouse = async (type, x, y, buttons = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const click = async (x, y) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0); };
  const tap = async (x, y) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await sleep(60); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const key = async (k, code, vk, type = 'both') => { if (type !== 'up') await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk }); if (type !== 'down') await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
  const shot = async (file, sel) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const r = sel ? await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`) : [0, 0, w, h];
    if (!r) return; // the element a red leg did not get: the leg's ✗ says so, the shot never throws it into a crash
    const pic = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r[0] - 6), y: Math.max(0, r[1] - 6), width: Math.min(r[2] + 12, w), height: Math.min(r[3] + 12, h), scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`    (PNG ${path.join(SHOTS, file)})`);
  };
  return { cdp, ev, until, click, tap, key, shot, close: async () => { await ev('window.__closeAll()').catch(() => { }); await sleep(300); ws.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tg.id}`).catch(() => { }); },
    vanish: async () => { ws.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tg.id}`).catch(() => { }); } }; // ⑪: the tab gone, the page says nothing
}
const WIN = '.vs-win[data-type="machine-desktop"]';
const M = { hostId: 'win-a', label: 'WIN-DESK1', setup: 'win32', code: 'desktop_ready', auth: 'password' };
const DESK = 'position:fixed;left:30px;top:30px;width:1100px;height:700px;display:flex;flex-direction:column;background:var(--bg-window);border:1px solid var(--border);box-shadow:0 6px 24px rgba(0,0,0,.25);border-radius:8px;overflow:hidden;z-index:5';
const PHONE = 'position:fixed;left:0;top:0;width:375px;height:667px;display:flex;flex-direction:column;background:var(--bg-window);overflow:hidden;z-index:5';
const playing = (p) => p.until(`(() => { const v = document.querySelector('${WIN} .stream-video'); return !!v && v.videoWidth === 1280 && v.currentTime > 0.2 && window.__band() !== null; })()`, 20000);
// lane stream-stats-popup: the numbers sentence left the strip — it rides the summary's (the chip's) title
const NUMS = (sel) => `((((document.querySelector('${sel}') || {}).title || '').split('\\n').find((l) => /^往返 /.test(l))) || '')`;
const NUM = NUMS(`${WIN} .desktop-strip-status`);
const stripText = (p) => p.ev(`(() => { const q = (s) => { const e = document.querySelector('${WIN} ' + s); return e && !e.hidden ? e.textContent : null; }; return { chip: q('.desktop-strip-status'), stream: ${NUM} || null, note: q('.desktop-strip-note'), fw: q('.desktop-strip-firewall'), fwCopy: q('.desktop-strip-fw-copy'), fwTitle: (document.querySelector('${WIN} .desktop-strip-firewall') || {}).title || '', title: (document.querySelector('${WIN} .desktop-strip-status') || {}).title || '' }; })()`);
const centre = (p) => p.ev(`(() => { const b = document.querySelector('${WIN} .stream-video').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`);
const sessions = async () => (await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/machine-desktop/stream/facts?host=win-a`)).json()).sessions || [];
const linesSince = (n) => psLines().slice(n);
// ⑦: the firewall notice's copy button — where it is (ahead of the numbers? wholly inside the strip's visible box? the topmost
// element at its centre?), then a click at its centre with the page's clipboard stubbed
const FW_RULE = `netsh advfirewall firewall add rule name="VibeSpace agent" dir=in action=allow program="${NODE_EXE}" protocol=UDP`;
async function fwCopyAt(p) {
  const up = await p.until(`(() => { const e = document.querySelector('${WIN} .desktop-strip-firewall'); return !!e && !e.hidden; })()`, 8000);
  const sf = await stripText(p);
  await p.ev(`Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true })`);
  const reach = await p.ev(`(() => { const r = (s) => document.querySelector('${WIN} ' + s).getBoundingClientRect(); const s = r('.desktop-strip'), b = r('.desktop-strip-fw-copy'); const ahead = document.querySelector('${WIN} .desktop-strip > .desktop-strip-stream'); const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2), hit = document.elementFromPoint(x, y); return { x, y, ahead: ahead ? Math.round(ahead.getBoundingClientRect().width) : 0, inView: b.left >= s.left && b.right <= s.right, hit: !!(hit && hit.closest('.desktop-strip-fw-copy')), strip: [s.left, s.right].map(Math.round), button: [b.left, b.right].map(Math.round) }; })()`);
  await p.click(reach.x, reach.y);
  const copied = await p.until('window.__copied !== undefined', 3000) ? await p.ev('window.__copied') : null;
  const toast = await p.ev(`(document.getElementById('global-toasts') || {}).textContent || ''`);
  return { up, reach, copied, toast, sf };
}

console.log('① – ⑥ desk 1280 px');
{
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  const canvas = await p.ev(`!!document.querySelector('${WIN} canvas')`);
  await p.until(`/解码 [\\d.]+ ms · \\d+ kbps$/.test(${NUM})`, 8000); // decode ms and kbps need a second getStats read
  const s1 = await stripText(p);
  ok(up && !canvas && /^串流 · \d+ ms · \d+ fps$/.test(s1.chip || '') && /^往返 \d+ ms · 抖动 \d+ ms · \d+ fps · 解码 [\d.]+ ms · \d+ kbps$/.test(s1.stream || '') && !s1.note && vnc.seen.sessions === 0, '① the window opens STREAMING: a <video> where the canvas was (no VNC session), the strip [串流 · N ms · N fps], its title 往返 · 抖动 · fps · 解码 · kbps', s1);
  // lane stream-cursor: the page's own arrow over the playing picture — and the RED CONTROL: a <video> without the class (no
  // rule) in the same pane inherits the pane's none
  const look = await p.ev(`(() => { const v = document.querySelector('${WIN} .stream-video'), b = v.getBoundingClientRect(), top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2), pane = v.parentElement;
    const own = getComputedStyle(v).cursor; pane.style.cursor = 'none'; const under = getComputedStyle(v).cursor;
    const bare = document.createElement('video'); pane.append(bare); const bareUnder = getComputedStyle(bare).cursor; bare.remove(); pane.style.cursor = '';
    return { own, under, bareUnder, top: top === v ? 'video' : top ? top.tagName.toLowerCase() + '.' + top.className : null }; })()`);
  ok(look.own === 'default' && look.under === 'default' && look.top === 'video', `① ⓟ the pointer is yours: over the playing <video> (the topmost element at its centre: ${look.top}) the computed cursor is the page's arrow (${look.own}), and still ${look.under} under a pane that says none`, look);
  ok(look.bareUnder === 'none', `① ⓟ RED CONTROL: a <video> without the rule under that pane inherits ${look.bareUnder} — the rule is what keeps the arrow`, look);
  const di1 = ((await sessions())[0]?.stats || {}).directInbound || {};
  ok(di1.verdict === 'blocked' && di1.program === NODE_EXE && !s1.fw, '① the machine\'s self-probe says blocked (its node.exe named) — yet a DIRECT pair plays here, so the strip says nothing about the firewall (only the hub relay\'s path carries that sentence)', { di1, fw: s1.fw });
  const b1 = await p.ev('window.__band()');
  await p.shot('stream-1.png', WIN);
  await sleep(700);
  const b2 = await p.ev('window.__band()');
  await p.shot('stream-2.png', WIN);
  const adv = (b2 - b1 + 300) % 300;
  ok(b1 !== null && b2 !== null && b1 < 300 && b2 < 300 && adv >= 8 && adv <= 40, `② the picture PLAYS: the band read off the <video> advanced ${b1} → ${b2} in 700 ms (THE fixture at 30 fps)`, { b1, b2 });
  await sleep(1200);
  const s2 = await stripText(p);
  const fps = Number((/· (\d+) fps ·/.exec(s2.stream || '') || [])[1]);
  ok(fps >= 15 && /解码 [\d.]+ ms/.test(s2.stream) && /\d+ kbps$/.test(s2.stream) && /发出 \d+ fps、\d+ kbps/.test(s2.title) && /指针是你的/.test(s2.title), `③ the numbers (the summary's title): ${fps} fps, decode ms, kbps; the agent's own numbers (sent fps, kbps) and 指针是你的 beside them`, s2);
  const [cx, cy] = await centre(p);
  const n0 = psLines().length;
  await p.click(cx, cy);
  await p.key('a', 'KeyA', 65);
  const got = await (async () => { for (let i = 0; i < 60; i++) { const l = linesSince(n0); if (l.includes('K 30 0 1')) return l; await sleep(100); } return linesSince(n0); })();
  const pt = got.filter((l) => /^M /.test(l))[0] || '';
  const [, mx, my] = pt.split(' ').map(Number);
  ok(Math.abs(mx - 640) <= 2 && Math.abs(my - 360) <= 2 && got.includes('D 0') && got.includes('U 0') && got.indexOf('D 0') < got.indexOf('U 0') && got.includes('K 30 0 0') && got.includes('K 30 0 1'), '④ a click at the picture\'s centre reached THE resident script as M 640 360 · D 0 · U 0 (over the data channel), the key A as its scan code down + up', got);
  fs.writeFileSync(ELEVATED, '1');
  await p.click(cx, cy);
  const uipi = await p.until(`/管理员窗口/.test((document.querySelector('${WIN} .desktop-strip-note') || {}).textContent || '')`, 5000);
  fs.rmSync(ELEVATED);
  ok(uipi, '⑤ an elevated window in front: the press never reached it and the strip names it (Windows 不让输入进管理员窗口…)');
  await p.shot('uipi.png', WIN);
  const sid = (await sessions())[0]?.sid;
  const raw = await dm._request({ op: 'stream-stop', sid, timeoutMs: 5000 }); // the MACHINE ends it (past the client's own stop, so its `ended` push is heard)
  const said = await p.until(`/串流中断：机器那边结束了它（stopped）——正在重新连接/.test((document.querySelector('${WIN} .desktop-strip-note') || {}).textContent || '')`, 10000);
  const back = (await p.until(`(() => { const v = document.querySelector('${WIN} .stream-video'); return !!v && v.currentTime > 0.2; })()`, 15000)) && (await sessions()).some((x) => !x.ended && x.sid !== sid);
  const quiet0 = !(await p.ev(`!!document.querySelector('#machine-desktop-signin')`)) && vnc.seen.authed === 0;
  ok(raw && raw.stopped && said && back && quiet0, '⑥ NEVER SILENT (lane stream-fallback-never-silent): the machine ends the PLAYING stream ⇒ the strip says 串流中断：机器那边结束了它（stopped）——正在重新连接…, the same stream again 1 s on — it plays; no VNC picture, no sign-in', { raw, said, back, quiet0, vnc: vnc.seen });
  const sid2 = (await sessions()).find((x) => !x.ended && x.sid !== sid)?.sid;
  await dm._request({ op: 'stream-stop', sid: sid2, timeoutMs: 5000 }); // … and again within the minute
  const ask = await p.until(`(() => { const s = document.querySelector('${WIN} .desktop-display-say'); return !!s && /串流中断：机器那边结束了它（stopped）/.test(s.textContent) && s.querySelectorAll('button').length === 2; })()`, 10000);
  await sleep(1500);
  const quiet1 = !(await p.ev(`!!document.querySelector('#machine-desktop-signin')`)) && vnc.seen.authed === 0 && !(await p.ev(`!!document.querySelector('${WIN} .stream-video')`));
  await p.ev(`document.querySelectorAll('${WIN} .desktop-display-say button')[1].click()`); // 「显示 VNC 画面」
  const asked = await p.until(`!!document.querySelector('#machine-desktop-signin input[type=password]')`, 15000);
  if (asked) await p.ev(`(() => { const f = document.querySelector('#machine-desktop-signin form'); f.querySelector('input[type=password]').value = 'pw'; f.requestSubmit(); })()`);
  const drawn = await p.until(`(() => { const cv = document.querySelector('${WIN} canvas'); if (!cv || cv.width !== 1280) return false; const d = cv.getContext('2d').getImageData(640, 360, 1, 1).data; return Math.abs(d[0] - 40) < 8 && Math.abs(d[1] - 150) < 8 && Math.abs(d[2] - 70) < 8; })()`, 15000);
  const s3 = await stripText(p);
  ok(ask && quiet1 && asked && drawn && vnc.seen.authed === 1 && /没有串流：机器那边结束了它（stopped）/.test(s3.title || ''), '⑥ ended again within the minute ⇒ 「串流中断：机器那边结束了它（stopped）」 with 「重试」 「显示 VNC 画面」 — nothing by itself; the press ⇒ the VNC picture signs in and draws (the chip says why: 没有串流：…)', { ask, quiet1, asked, drawn, s3, vnc: vnc.seen });
  const vc = await p.ev(`(() => { const cv = document.querySelector('${WIN} canvas'), b = cv.getBoundingClientRect(), top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { computed: getComputedStyle(cv).cursor, inline: cv.style.cursor, top: top === cv ? 'canvas' : top ? top.tagName.toLowerCase() : null }; })()`);
  const s6 = await stripText(p);
  ok(vc.computed === 'default' && vc.top === 'canvas' && /指针是你的/.test(s6.title || ''), `⑥ ⓟ the VNC picture with no pointer from the machine: the canvas shows YOUR arrow (${vc.computed}, inline ${vc.inline || '—'}), never noVNC's none; the chip's title says 指针是你的`, { vc, title: s6.title });
  await p.shot('fallback.png', WIN);
  await p.close();
}

console.log('④ a Mac viewer — and its RED CONTROL');
for (const [at, want, name] of [['/', 'K 29 0 0', 'the door through THE table: a Mac viewer\'s ⌘ (MetaLeft) reaches Windows as Ctrl (ControlLeft, scan 0x1d)'], ['/notable', 'K 91 1 0', 'RED CONTROL: the door WITHOUT the table sends the Windows key (scan 0x5b, extended) — the table is what moves it']]) {
  const p = await page(1280, 800, DESK, { at, mac: true });
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  await playing(p);
  const [cx, cy] = await centre(p);
  await p.click(cx, cy);
  await sleep(300);
  const n0 = psLines().length;
  await p.key('Meta', 'MetaLeft', 91, 'down');
  await p.key('Meta', 'MetaLeft', 91, 'up');
  const got = await (async () => { for (let i = 0; i < 40; i++) { const l = linesSince(n0).filter((x) => x.startsWith('K ')); if (l.length >= 2) return l; await sleep(100); } return linesSince(n0); })();
  ok(got[0] === want && got[1] === want.replace(/ 0$/, ' 1'), `④ ${name}`, got);
  await p.close();
}

console.log('⑦ relay-only ⑧ no source');
{
  const relayOnly = DW.create({ access, direct: false, log: quiet });
  R.setup({ ...BASE, webrtc: relayOnly });
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  const via = await p.until(`/经 hub 中转 · UDP$/.test(${NUM})`, 10000);
  // lane race-sweep (B-6b74, 1/4 at box load ~38): the numbers the VIEWER shows and the hub record's `path` are two effects — the
  // path lands when the viewer reports it (notePath) — so the record is read once IT says so, never right after the numbers
  const recordPath = async (hub) => { for (const t0 = Date.now(); Date.now() - t0 < 10000; await sleep(100)) { const r = hub.facts('win-a')[0]; if (r && r.path) return r; } return hub.facts('win-a')[0] || {}; };
  const f = await recordPath(relayOnly);
  ok(up && via && f.path === 'relay' && f.relay && f.relay.via === 'udp' && f.relay.leg.down > 0, '⑦ relay-only: the daemon\'s own UDP leg carries it — the numbers say 经 hub 中转 · UDP, the record says path relay, via udp', { up, via, path: f.path, relay: f.relay });
  const fw = await fwCopyAt(p);
  ok(fw.up && /^机器防火墙挡住直连，经 hub 中转/.test(fw.sf.fw || '') && fw.sf.fwCopy === '复制管理员命令' && fw.sf.fwTitle === FW_RULE && fw.reach.ahead === 0 && fw.reach.inView && fw.reach.hit && fw.copied === FW_RULE && /已复制，请粘贴到 WIN-DESK1 上以管理员身份打开的 PowerShell/.test(fw.toast), '⑦ the machine\'s firewall blocks the direct path: the strip says 机器防火墙挡住直连，经 hub 中转 (nothing long ahead of it — the numbers left the strip), its 复制管理员命令 in view (no sideways scroll), and it copies the netsh rule for its node.exe (the toast says where to paste it — VibeSpace never runs it)', fw);
  await p.shot('relay.png', WIN);
  // lane ci-339-reds: the RED control's narrow window is MEASURED — THE strip's own content (max-content) + 24 px — so the
  // shipped order fits by construction and a sentence of the numbers' length ahead of the notice cannot (a fixed 900 px held
  // until the strip gained 「麦克风」: in DejaVu, the runner's sans, THE order's copy button then sat 4 px past the edge)
  const fit = await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip'), w = s.getBoundingClientRect().width, o = s.style.width; s.style.width = 'max-content'; const need = s.getBoundingClientRect().width; s.style.width = o; return { w: Math.round(w), need: Math.ceil(need) }; })()`);
  await p.close();
  // RED CONTROL — a numbers sentence back AHEAD of the notice (the strip before lane stream-relay-udp-ci) in a narrow window: the
  // copy button is past the strip's edge and a click at its centre copies nothing; the shipped strip (the summary alone — lane
  // stream-stats-popup) in the same window copies (in DejaVu — the hosted runner's sans — the old order missed even in the
  // desk's 1100 px window: the .296 mirror red)
  const narrowW = 1100 - (fit.w - fit.need) + 24, narrow = DESK.replace('width:1100px', `width:${narrowW}px`), pair = {};
  for (const [name, at] of [['order', '/'], ['old', '/fwlast']]) {
    const pc = await page(1280, 800, narrow, { at });
    await pc.ev(`window.__open(${JSON.stringify(M)})`);
    await playing(pc);
    pair[name] = await fwCopyAt(pc);
    await pc.close();
  }
  ok(narrowW < 1100 && pair.order.reach.inView && pair.order.copied === FW_RULE && pair.old.up && pair.old.reach.ahead > 200 && !pair.old.reach.inView && !pair.old.reach.hit && pair.old.copied === null, '⑦ RED CONTROL: a numbers sentence (' + pair.old.reach.ahead + ' px) back ahead of the notice in a ' + narrowW + ' px window (THE strip\'s content ' + fit.need + ' px + 24, measured) — the copy button past the strip\'s edge, a click at its centre copies nothing; the shipped strip in the same window copies', { order: pair.order.reach, old: pair.old.reach, oldCopied: pair.old.copied });
  relayOnly.shutdown();
  const linkOnly = DW.create({ access, direct: false, udpLeg: false, log: quiet });
  R.setup({ ...BASE, webrtc: linkOnly });
  const pl = await page(1280, 800, DESK);
  await pl.ev(`window.__open(${JSON.stringify(M)})`);
  const upL = await playing(pl);
  const viaL = await pl.until(`/经设备链路$/.test(${NUM})`, 10000);
  const fl = await recordPath(linkOnly);
  ok(upL && viaL && fl.path === 'relay' && fl.relay && fl.relay.via === 'link' && fl.relay.leg === null, '⑦ a hub that offers no leg: the relay over the device link — the numbers say 经设备链路, the record via link', { upL, viaL, path: fl.path, relay: fl.relay });
  await pl.shot('relay-link.png', WIN);
  await pl.close();
  linkOnly.shutdown();
  const noSource = DW.create({ access: ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({}) }), log: quiet });
  R.setup({ ...BASE, webrtc: noSource });
  const q = await page(1280, 800, DESK);
  const before = vnc.seen.sessions;
  await q.ev(`window.__open(${JSON.stringify(M)})`);
  const asked = await q.until(`!!document.querySelector('#machine-desktop-signin input[type=password]')`, 15000);
  if (asked) await q.ev(`(() => { const f = document.querySelector('#machine-desktop-signin form'); f.querySelector('input[type=password]').value = 'pw'; f.requestSubmit(); })()`);
  await q.until(`!!document.querySelector('${WIN} canvas')`, 15000);
  await sleep(500);
  const s = await stripText(q);
  ok(asked && vnc.seen.sessions === before + 1 && !s.note && !(await q.ev(`!!document.querySelector('${WIN} .stream-video')`)) && /没有串流：需要 ffmpeg ≥ 7（含 ddagrab 与 NVENC）/.test(s.title), '⑧ a hub with no fake source, a machine with no ffmpeg (its screen source refused, no_ffmpeg): the rung is not taken ⇒ the VNC picture at once with NO note (the chip\'s title says why, in the page\'s words: 没有串流：需要 ffmpeg ≥ 7（含 ddagrab 与 NVENC）……)', s);
  await q.close();
  noSource.shutdown();
  R.setup({ ...BASE });
}

console.log('⑨ phone 375×667');
{
  const p = await page(375, 667, PHONE, { touch: true });
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  await p.until(`/^往返 \\d+ ms/.test(${NUM})`, 8000);
  const row = await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip'); const kids = [...s.children].filter((e) => !e.hidden).map((e) => e.getBoundingClientRect()); const v = document.querySelector('${WIN} .stream-video').getBoundingClientRect(); return { h: Math.round(s.getBoundingClientRect().height), oneRow: Math.max(...kids.map((r) => r.top)) < Math.min(...kids.map((r) => r.bottom)), vw: Math.round(v.width) }; })()`);
  ok(up && row.oneRow && row.h <= 34 && row.vw === 375, '⑨ the phone plays it in the same shell, full width; the strip is ONE row (it scrolls sideways)', row);
  const [cx, cy] = await centre(p);
  const n0 = psLines().length;
  await p.tap(cx, cy);
  const got = await (async () => { for (let i = 0; i < 40; i++) { const l = linesSince(n0); if (l.includes('U 0')) return l; await sleep(100); } return linesSince(n0); })();
  const pt = got.find((l) => /^M /.test(l)) || '';
  const [, mx, my] = pt.split(' ').map(Number);
  ok(Math.abs(mx - 640) <= 4 && Math.abs(my - 360) <= 4 && got.includes('D 0') && got.includes('U 0'), '⑨ a TAP at the picture\'s centre is a click at the machine\'s 640 360 (touch → pointer events → the data channel)', got);
  await p.shot('phone.png');
  const scrolled = await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip'); s.scrollLeft = s.scrollWidth; const st = document.querySelector('${WIN} .desktop-strip-status').getBoundingClientRect(); return s.scrollLeft >= 0 && st.right <= 375 + 1 && st.left >= 0; })()`);
  ok(scrolled, '⑨ the strip scrolls sideways to its summary (串流 · N ms · N fps in view — its tap opens the numbers: ⑮)');
  await p.shot('phone-stats.png');
  await p.close();
}
console.log('⑫ a Mac\'s strip (lane stream-mac-stall): the stream\'s display switcher — 「打开系统设置」 on the Mac itself');
{
  // the page's fetch wrapped: the stream's start answer carries a Mac's displays (src/agentd/stream-mac.js — its helper's facts),
  // or a Screen Recording refusal; the hub's settings-open answer by mode (ok · an agent that predates the op)
  const WRAP = `(() => { window.__asked = []; const real = window.fetch.bind(window); const J = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
    window.fetch = async (u, o) => { const url = String(u); const body = o && typeof o.body === 'string' ? JSON.parse(o.body) : null;
      if (/\\/stream\\/start$/.test(url)) { window.__asked.push(body); if (window.__macMode !== 'displays') return J({ take: false, code: 'screen_permission', why: 'Screen Recording is off for vibespace-screen' });
        const j = await (await real(u, o)).json(); if (j.take) j.source = { ...j.source, display: body && body.source ? body.source.id : '3', displays: [{ id: '3', main: true, x: 0, y: 0, w: 1920, h: 1080, name: 'Studio 27 (2)' }, { id: '2', main: false, x: -1920, y: 0, w: 1920, h: 1080, name: 'Studio 27 (1)' }] }; return J(j); }
      if (/\\/settings-open$/.test(url)) { window.__asked.push(body); return J(window.__macMode === 'tcc-ok' ? { ok: true, pane: body.pane } : { ok: false, code: 'agent_too_old', error: 'the agent predates it' }); }
      return real(u, o); };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true }); return true; })()`;
  const MM = { ...M, label: 'Macbook', setup: 'darwin' };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let p = await page(1280, 800, DESK);
  await p.ev(WRAP); await p.ev(`window.__macMode = 'displays'`);
  await p.ev(`window.__open(${JSON.stringify(MM)})`);
  const up = await playing(p);
  const segOf = () => p.ev(`[...document.querySelectorAll('${WIN} .desktop-strip-displays:not([hidden]) .desktop-strip-seg')].map((b) => [b.textContent, b.dataset.key, b.getAttribute('aria-pressed'), b.title])`);
  const seg1 = await segOf();
  ok(up && same(seg1, [['1', '2', 'false', '1 · Studio 27 (1) · 1920×1080'], ['2', '3', 'true', '2 · Studio 27 (2) · 1920×1080'], ['全部显示器', '*', 'false', '全部一窗']]), '⑫ the STREAM draws the switcher: the Mac\'s two displays left to right (its offer\'s rows, each titled with its name and size), the streamed one pressed — lane desktop-display-modes: + 全部显示器 (all of them in this window, a stream each)', seg1);
  await p.shot('mac-switcher.png', WIN);
  await p.ev(`document.querySelector('${WIN} .desktop-strip-seg[data-key="2"]').click()`);
  const again = (await p.until(`window.__asked.length === 2`, 5000)) && (await playing(p));
  const asked = await p.ev('window.__asked');
  const seg2 = await segOf();
  ok(again && same(asked[1].source, { kind: 'display', id: '2' }) && !asked[0].source && seg2.length === 3 && seg2[0][2] === 'true' && seg2[1][2] === 'false', '⑫ a pick restarts the stream ON that display (start {source: {kind: display, id: 2}}) and it plays; the pick is pressed', { asked, seg2 });
  await p.ev("localStorage.removeItem('vibespace.desktopModes')"); // lane desktop-display-modes: the pick is remembered per machine — the later legs open the main display
  await p.close();
  for (const mode of ['tcc-ok', 'tcc-old']) {
    p = await page(1280, 800, DESK);
    await p.ev(WRAP); await p.ev(`window.__macMode = ${JSON.stringify(mode)}`);
    await p.ev(`window.__open(${JSON.stringify(MM)})`);
    const door = await p.until(`(() => { const e = document.querySelector('${WIN} .desktop-strip-tcc'); return !!e && !e.hidden; })()`, 10000);
    if (door) await p.ev(`document.querySelector('${WIN} .desktop-strip-tcc-open').click()`);
    await p.until(`/打开系统设置 ›|已复制/.test((document.getElementById('global-toasts') || {}).textContent || '')`, 5000);
    const r = await p.ev(`({ asked: window.__asked, copied: window.__copied || null, toast: (document.getElementById('global-toasts') || {}).textContent || '', words: document.querySelector('${WIN} .desktop-strip-tcc').textContent })`);
    if (mode === 'tcc-ok') {
      ok(door && same(r.asked[1], { host: 'win-a', pane: 'screen' }) && /已在 Macbook 上打开系统设置 › 录屏与系统录音/.test(r.toast) && r.copied === null, '⑫ 「打开系统设置」 opens the pane ON the Mac (POST settings-open {pane: screen}): 已在 Macbook 上打开系统设置 › 录屏与系统录音 — nothing copied', r);
      await p.shot('mac-tcc-door.png', WIN);
    } else ok(door && r.asked[1] && r.asked[1].pane === 'screen' && r.copied === 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture' && /已复制/.test(r.toast), '⑫ an agent that predates it (agent_too_old): the pane\'s link is copied, as before — the fallback only', r);
    await p.close();
  }
}
console.log('⑩ the machine\'s own screen: the HDR road, NVENC on the strip — and its capture dying');
{
  const SP = require(path.join(REPO, 'src/stream-plan.js'));
  const cal = calibrationFrame(1280, 720, SP.CALIBRATION.rows);
  const RAW = path.join(root, 'cal.f16'), DIE = path.join(root, 'die-capture');
  fs.writeFileSync(RAW, cal.buf);
  writeFakeFfmpeg(path.join(home, '.local/bin'), { log: path.join(root, 'ffmpeg.log'), fixture: FIXTURE, raw: RAW, dieCapture: DIE, version: '7.1', encoders: ['h264_nvenc', 'libx264'] });
  const screenHub = DW.create({ access: ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({}) }), log: quiet });
  R.setup({ ...BASE, webrtc: screenHub });
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  const nv = await p.until(`/ · NVENC · 编码 \\d+ ms$/.test(${NUM})`, 10000);
  const rated = await p.until(`/机器以 \\d+ kbps 编码——这个大小的屏幕不会低于 \\d+ kbps/.test((document.querySelector('${WIN} .desktop-strip-status') || {}).title || '')`, 8000);
  const s = await stripText(p);
  const f = screenHub.facts('win-a')[0] || {};
  const sc = (f.stats && f.stats.screen) || {}, said = /机器以 (\d+) kbps 编码——这个大小的屏幕不会低于 (\d+) kbps/.exec(s.title || '') || [];
  ok(rated && Number(said[1]) === sc.kbps && Number(said[2]) === sc.floor && sc.floor === 2500 && sc.kbps >= sc.floor, `⑩ the chip's title says what the machine decided: ${said[0]} — the agent's own kbps ${sc.kbps} and floor ${sc.floor} (1280×720 @ 30 ⇒ 2500: THE RATE)`, { said: said[0], sc: { kbps: sc.kbps, floor: sc.floor, rate: sc.rate } });
  ok(up && nv && /HDR 已在机器上映射（SDR 白点 200 nits）/.test(s.title) && f.source && f.source.kind === 'screen' && f.source.encoder === 'NVENC' && f.source.mode === 'mapped', '⑩ the machine\'s own screen (no fake source on the hub): the HDR road plays, the numbers read … · NVENC · 编码 N ms, the chip\'s title says HDR 已在机器上映射（SDR 白点 200 nits）', { s, src: f.source });
  await p.shot('screen.png', WIN);
  fs.writeFileSync(DIE, '1');
  const saidI = await p.until(`/串流中断：机器的屏幕采集一再中断——正在重新连接/.test((document.querySelector('${WIN} .desktop-strip-note') || {}).textContent || '')`, 15000);
  const ask = await p.until(`(() => { const s = document.querySelector('${WIN} .desktop-display-say'); return !!s && /串流中断/.test(s.textContent) && s.querySelectorAll('button').length === 2; })()`, 25000);
  const noSign = !(await p.ev(`!!document.querySelector('#machine-desktop-signin')`));
  fs.rmSync(DIE);
  await p.ev(`document.querySelectorAll('${WIN} .desktop-display-say button')[1].click()`); // 「显示 VNC 画面」
  const asked = await p.until(`!!document.querySelector('#machine-desktop-signin input[type=password]')`, 15000);
  if (asked) await p.ev(`(() => { const f = document.querySelector('#machine-desktop-signin form'); f.querySelector('input[type=password]').value = 'pw'; f.requestSubmit(); })()`);
  const drawn = await p.until(`(() => { const cv = document.querySelector('${WIN} canvas'); if (!cv || cv.width !== 1280) return false; const d = cv.getContext('2d').getImageData(640, 360, 1, 1).data; return Math.abs(d[0] - 40) < 8 && Math.abs(d[1] - 150) < 8 && Math.abs(d[2] - 70) < 8; })()`, 15000);
  ok(saidI && ask && noSign && drawn, '⑩ the capture ffmpeg keeps dying ⇒ in place on the machine twice, then capture_interrupted: 串流中断：机器的屏幕采集一再中断——正在重新连接…; the retry dies too ⇒ 「串流中断：…」 with 「重试」 「显示 VNC 画面」 (no sign-in by itself); the press ⇒ the VNC picture signs in and draws', { saidI, ask, noSign, asked, drawn });
  await p.shot('screen-fallback.png', WIN);
  await p.close();
  screenHub.shutdown();
  R.setup({ ...BASE });
}
console.log('⑯ 「HDR 直通」 (lane stream-hdr-passthrough): the switch only where it can work, remembered per machine; this Chrome refuses 10-bit ⇒ the fallback, said; the 8-bit control decodes');
{
  const SP = require(path.join(REPO, 'src/stream-plan.js'));
  const cal = calibrationFrame(1280, 720, SP.CALIBRATION.rows);
  const RAW = path.join(root, 'cal16.f16'); fs.writeFileSync(RAW, cal.buf);
  const AV1_10 = path.join(REPO, 'scripts/fixtures/stream/fake-desk-av1-10.ivf'), AV1_8 = path.join(REPO, 'scripts/fixtures/stream/fake-desk-av1-8.ivf');
  const FF = writeFakeFfmpeg(path.join(home, '.local/bin'), { log: path.join(root, 'ffmpeg16.log'), fixture: FIXTURE, raw: RAW, version: '7.1', encoders: ['h264_nvenc', 'av1_nvenc', 'libx264'], av1: AV1_10 });
  await dm.streamFacts({ force: true });
  const hub16 = DW.create({ access: ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({}) }), log: quiet });
  const stops = [], seen = []; const realStop = hub16.stop; hub16.stop = (k, why) => { stops.push(why); return realStop(k, why); };
  const watch = setInterval(() => { for (const f of hub16.facts('win-a')) if (f.source && !seen.some((x) => x.key === f.key)) seen.push({ key: f.key, mode: f.source.mode, hdr: f.source.hdr || null }); }, 100);
  R.setup({ ...BASE, webrtc: hub16 });
  const YES = { supported: true, smooth: true, powerEfficient: true }, LINUX = { supported: true, smooth: true, powerEfficient: false };
  const SW = `(() => { const b = document.querySelector('${WIN} .desktop-strip-hdr-pass'); return b ? { hidden: b.hidden, pressed: b.getAttribute('aria-pressed'), text: b.textContent, title: b.title } : null; })()`;
  const MEM = `localStorage.getItem('vibespace.streamHdr')`;
  const NOTE = `(() => { const e = document.querySelector('${WIN} .desktop-strip-note'); return e && !e.hidden ? e.textContent : null; })()`;
  const shown = async (opts) => { const p = await page(1280, 800, DESK, opts); await p.ev(`localStorage.removeItem('vibespace.streamHdr')`); await p.ev(`window.__open(${JSON.stringify(M)})`); const up = await playing(p); await sleep(400); return { p, up, sw: await p.ev(SW) }; };
  const a = await shown({});
  ok(a.up && a.sw && a.sw.hidden === true, '⑯ a screen that is not HDR (this headless Chrome: (dynamic-range: high) false): the machine CAN (its HDR display, av1_nvenc) but no 「HDR 直通」', a.sw);
  await a.p.close();
  const b = await shown({ hdr: { screen: true, decoder: LINUX } });
  ok(b.up && b.sw && b.sw.hidden === true, '⑯ an HDR screen whose browser decodes WebRTC AV1 only in software (supported, NOT power-efficient — the measured Linux Chrome, whose decoder refuses 10-bit): no switch', b.sw);
  await b.p.close();
  FF.set({ encoders: ['h264_nvenc', 'libx264'] }); await dm.streamFacts({ force: true });
  const c0 = await shown({ hdr: { screen: true, decoder: YES } });
  ok(c0.up && c0.sw && c0.sw.hidden === true, '⑯ an HDR viewer, a machine whose ffmpeg has no AV1 encoder (its offer says can: false): no switch', c0.sw);
  await c0.p.close();
  FF.set({ encoders: ['h264_nvenc', 'av1_nvenc', 'libx264'], av1: AV1_10 }); await dm.streamFacts({ force: true });
  const c = await shown({ hdr: { screen: true, decoder: YES } });
  const p = c.p;
  ok(c.up && c.sw && c.sw.hidden === false && c.sw.pressed === 'false' && c.sw.text === 'HDR 直通' && /AV1 10 位 PQ/.test(c.sw.title) && (await p.ev(MEM)) === null && seen.filter((x) => x.mode === 'hdr').length === 0,
    '⑯ an HDR screen + hardware AV1 (the owner\'s Edge) + a machine that can: 「HDR 直通」 on the strip, OFF (today\'s picture until the person turns it on)', c.sw);
  await p.shot('hdr-switch.png', WIN);
  // THE FALLBACK: this Chrome's WebRTC decoder (dav1d) refuses 10-bit — the press asks HDR, no frame is decoded, 2 s later SDR again, said
  const s0 = seen.length, stop0 = stops.length;
  await p.ev(`document.querySelector('${WIN} .desktop-strip-hdr-pass').click()`);
  const memOn = await p.ev(MEM);
  const said = await p.until(`${NOTE} === 'HDR 直通已回退：浏览器无法解码'`, 20000);
  const back = said && await p.until(`(() => { const v = document.querySelector('${WIN} .stream-video'); return !!v && v.videoWidth === 1280 && v.currentTime > 0.2 && window.__band() !== null; })()`, 20000);
  const b1 = back ? await p.ev('window.__band()') : null; await sleep(700); const b2 = back ? await p.ev('window.__band()') : null;
  const hdrS = seen.slice(s0).find((x) => x.mode === 'hdr'), sdrS = seen.slice(s0).filter((x) => x.mode === 'mapped');
  ok(memOn === '{"win-a":true}' && hdrS && JSON.stringify(hdrS.hdr) === '{"can":true,"on":true,"why":null}' && stops.slice(stop0).includes('hdr_undecodable') && said && back && b1 !== null && b2 !== null && b2 !== b1 && sdrS.length >= 1,
    `⑯ THE FALLBACK for real: the press remembers HDR for this machine and the agent sends AV1 10-bit (an hdr session); THIS Chrome decodes no frame of it (dav1d: 10-bit unhandled) ⇒ 2 s later the strip says 「HDR 直通已回退：浏览器无法解码」, the session ends hdr_undecodable and the SDR picture plays again (the band advances ${b1} → ${b2})`, { memOn, hdrS, stops: stops.slice(stop0), said, back, b1, b2 });
  ok((await p.ev(MEM)) === '{}' && (await p.ev(SW)).pressed === 'false', '⑯ … and the switch is OFF again (remembered off — the next window does not repeat the black 2 s)', await p.ev(SW));
  await p.shot('hdr-fallback.png', WIN);
  // THE CONTROL: the same road with an 8-bit AV1 stream — this Chrome decodes it, so the refusal above was the bit depth, never our packetizer
  FF.set({ av1: AV1_8 });
  const s1 = seen.length;
  await p.ev(`document.querySelector('${WIN} .desktop-strip-hdr-pass').click()`);
  const hdr8 = await p.until(`(() => { const v = document.querySelector('${WIN} .stream-video'); return !!v && v.videoWidth === 1280 && v.currentTime > 0.2 && window.__band() !== null && / · HDR$/.test((document.querySelector('${WIN} .desktop-strip-status') || {}).textContent || ''); })()`, 20000);
  const c1 = hdr8 ? await p.ev('window.__band()') : null; await sleep(1500); const c2 = hdr8 ? await p.ev('window.__band()') : null;
  ok(hdr8 && seen.slice(s1).some((x) => x.mode === 'hdr') && c1 !== null && c2 !== c1 && (await p.ev(NOTE)) === null && (await p.ev(SW)).pressed === 'true',
    `⑯ CONTROL: the same HDR road carrying an 8-bit AV1 stream DECODES in this Chrome (the band advances ${c1} → ${c2}, the summary ends · HDR, no fallback) — the aggregated-TU packetizer through Chrome's own depacketizer; the refusal was the bit depth`, { hdr8, c1, c2, note: await p.ev(NOTE) });
  await p.ev(`document.querySelector('${WIN} .desktop-strip-status').click()`);
  const tab = await p.until(`!!document.querySelector('.stream-stats-pop .stream-stats-table tr[data-k="hdr"]')`, 6000) ? await p.ev(`[...document.querySelectorAll('.stream-stats-pop .stream-stats-table tr')].map((tr) => [tr.dataset.k, tr.cells[0].textContent, tr.cells[1].textContent])`) : null;
  const rowHdr = tab && tab.find((r) => r[0] === 'hdr'), rowCodec = tab && tab.find((r) => r[0] === 'codec');
  ok(rowHdr && rowHdr[1] === 'HDR' && rowHdr[2] === '直通 · PQ 10 位 · BT.2020' && rowCodec && rowCodec[2] === 'AV1' && tab.findIndex((r) => r[0] === 'hdr') === tab.findIndex((r) => r[0] === 'codec') + 1, '⑯ the details: the codec row says AV1 and the 「HDR」 row right after it says 直通 · PQ 10 位 · BT.2020', tab);
  await p.shot('hdr-details.png', '.stream-stats-pop');
  await p.ev(`document.querySelector('${WIN} .desktop-strip-status').click()`);
  // the window moves to an SDR screen ⇒ the SDR picture (an SDR viewer tone-maps PQ: dim); back on the HDR screen ⇒ HDR again (remembered)
  const s2 = seen.length;
  await p.ev('window.__hdrScreen(false)');
  const sdrNow = await p.until(`(() => { const v = document.querySelector('${WIN} .stream-video'); const b = document.querySelector('${WIN} .desktop-strip-hdr-pass'); return !!v && v.videoWidth === 1280 && v.currentTime > 0.2 && b.hidden && !/ · HDR$/.test((document.querySelector('${WIN} .desktop-strip-status') || {}).textContent || ''); })()`, 20000);
  const s3 = seen.length;
  await p.ev('window.__hdrScreen(true)');
  const hdrAgain = await p.until(`(() => { const v = document.querySelector('${WIN} .stream-video'); const b = document.querySelector('${WIN} .desktop-strip-hdr-pass'); return !!v && v.currentTime > 0.2 && !b.hidden && b.getAttribute('aria-pressed') === 'true' && / · HDR$/.test((document.querySelector('${WIN} .desktop-strip-status') || {}).textContent || ''); })()`, 20000);
  ok(sdrNow && seen.slice(s2, s3).some((x) => x.mode === 'mapped') && hdrAgain && seen.slice(s3).some((x) => x.mode === 'hdr') && (await p.ev(MEM)) === '{"win-a":true}', '⑯ the window moves to an SDR screen ((dynamic-range: high) changes) ⇒ the stream restarts as the SDR picture and the switch hides; back on the HDR screen ⇒ HDR again (still remembered on)', { sdrNow, hdrAgain });
  await p.close();
  // REMEMBERED PER MACHINE: a new window of this machine starts in HDR at once (its first start asks hdr — no SDR stream first)
  const s4 = seen.length;
  const q = await page(1280, 800, DESK, { hdr: { screen: true, decoder: YES } });
  const memQ = await q.ev(MEM);
  await q.ev(`window.__open(${JSON.stringify(M)})`);
  const firstHdr = await q.until(`/ · HDR$/.test((document.querySelector('${WIN} .desktop-strip-status') || {}).textContent || '')`, 20000);
  const firsts = seen.slice(s4);
  ok(memQ === '{"win-a":true}' && firstHdr && firsts.length >= 1 && firsts[0].mode === 'hdr', '⑯ remembered per machine: a new window of the same machine asks HDR in its FIRST start (no SDR stream before it)', { memQ, firsts });
  await q.ev(`localStorage.removeItem('vibespace.streamHdr')`); // per-machine memory persists across this profile's pages — reset
  await q.close();
  clearInterval(watch);
  hub16.shutdown();
  R.setup({ ...BASE });
  FF.set({ encoders: ['h264_nvenc', 'libx264'], av1: null }); await dm.streamFacts({ force: true });
}
console.log('⑪ ONE WINDOW as the stream: the stats row, 「还原它」 only while minimized, and every way it ends on the machine');
{
  const WWIN = '.vs-win[data-type="machine-app"]';
  const ROW = { id: '657982', title: CJK, app: 'Lightroom', bounds: { x: 100, y: 80, w: 640, h: 360 }, dpi: 96 };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const untilN = async (f, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(100); } return !!f(); };
  const helperPid = () => (fs.existsSync(WPID) ? Number(fs.readFileSync(WPID, 'utf8')) : 0);
  const agentLog = () => { const f = path.join(rootOf(home), 'state', 'agentd.log'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; };
  const winHub = DW.create({ access: ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({}) }), log: quiet });
  R.setup({ ...BASE, webrtc: winHub });
  const MIN = { ev: 'window', min: true, frame: [-32000, -32000, -31840, -31972], display: '\\\\.\\DISPLAY1', dpi: 96, covered: false };
  const BACK = { ev: 'window', min: false, frame: WROW.frame, display: '\\\\.\\DISPLAY1', dpi: 96, covered: false };
  wgc.set({ capture: { ...WCAP, script: [{ at: 6000, fresh: false, ev: MIN }, { at: 13000, fresh: true, ev: BACK }] } });
  const p = await page(1280, 800, DESK);
  const plays = () => p.until(`(() => { const v = document.querySelector('${WWIN} .stream-video'); return !!v && v.videoWidth > 0 && v.currentTime > 0.2; })()`, 25000);
  const vis = `const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;`;
  const centreOf = (sel) => p.ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`);
  const sayText = () => p.ev(`(() => { const s = document.querySelector('${WWIN} .machine-app-say'); return s && getComputedStyle(s).display !== 'none' ? { text: s.firstChild.textContent, acts: [...s.querySelectorAll('button')].map((b) => b.textContent) } : null; })()`);
  await p.ev(`window.__openWin(${JSON.stringify(M)}, ${JSON.stringify(ROW)})`);
  const up = await plays();
  const WNUM = NUMS(`${WWIN} .machine-window-chip`);
  await p.until(`/ · NVENC · 编码 \\d+ ms$/.test(${WNUM})`, 10000);
  const s1 = await p.ev(`(() => { ${vis} const q = (sel) => document.querySelector('${WWIN} ' + sel); return { title: q('.vs-win-title').textContent, chip: q('.machine-window-chip').textContent, stats: ${WNUM}, statsShown: vis(q('.machine-window-stats')), glyph: q('.machine-window-chip').hasAttribute('data-chart'), held: vis(q('.machine-window-held')), restore: vis(q('.machine-window-restore')), stop: vis(q('.machine-window-stop')) ? q('.machine-window-stop').textContent : null }; })()`);
  ok(up && s1.title === `WIN-DESK1上的${CJK}` && /^串流 · \d+ ms · \d+ fps$/.test(s1.chip) && /^往返 \d+ ms · 抖动 \d+ ms · \d+ fps · 解码 [\d.]+ ms · \d+ kbps · NVENC · 编码 \d+ ms$/.test(s1.stats) && !s1.statsShown && s1.glyph, '⑪ the window stream plays, its title intact (CJK + emoji), with THE stats row of the whole screen\'s window: its chip the summary (+ the chart glyph), 往返 · 抖动 · fps · 解码 · kbps · NVENC · 编码 in its title; the row under it is the firewall notice alone (none on the direct path)', s1);
  // lane stream-stats-popup: the window stream's summary opens THE same details (one component)
  const wc = await centreOf(`${WWIN} .machine-window-chip`);
  await p.click(wc[0], wc[1]);
  const wpop = await p.until(`(() => { const d = document.querySelector('.stream-stats-pop'); return !!d && d.querySelectorAll('canvas.stream-chart-canvas').length === 3 && [...d.querySelectorAll('.stream-stats-table tr')].some((tr) => tr.dataset.k === 'encoder' && /NVENC · 编码 \\d+ ms/.test(tr.cells[1].textContent)); })()`, 4000);
  ok(wpop, '⑪ its summary\'s click opens THE details (the same component): three charts, the encoder row NVENC · 编码 N ms');
  await p.click(wc[0], wc[1]);
  ok(await p.until(`!document.querySelector('.stream-stats-pop')`, 2000), '⑪ a second click on the summary closes them');
  ok(!s1.held && !s1.restore && s1.stop === '停止串流', '⑪ live: no 「还原它」 (the held row is not shown); 「停止串流」 is', s1);
  const cause = await p.ev(`(() => { const b = document.createElement('button'); b.className = 'file-tool-btn'; b.hidden = true; document.body.append(b); const d = getComputedStyle(b).display; b.remove(); return d; })()`);
  ok(cause === 'flex', '⑪ the cause, measured in this page: a hidden .file-tool-btn computes display:flex (viewers.css out-ranks [hidden]) — the old bare 「还原它」 showed at all times', cause);
  await p.shot('window-live.png', WWIN);
  const minShown = await p.until(`(() => { ${vis} const r = document.querySelector('${WWIN} .machine-window-held'); return vis(r) && r.firstChild.textContent === '窗口在WIN-DESK1上被最小化了——串流暂停' && vis(document.querySelector('${WWIN} .machine-window-restore')); })()`, 15000);
  ok(minShown, '⑪ minimized on the machine ⇒ the row 窗口在WIN-DESK1上被最小化了——串流暂停 + 「还原它」 appear — only now');
  await p.shot('window-minimized.png', WWIN);
  const rb = await centreOf(`${WWIN} .machine-window-restore`);
  await p.click(rb[0], rb[1]);
  ok(await untilN(() => wgcLines().some((a) => a[0] === 'restore' && a[2] === '657982'), 6000), '⑪ 「还原它」 asks the machine\'s helper to restore THAT window', wgcLines().slice(-3));
  ok(await p.until(`getComputedStyle(document.querySelector('${WWIN} .machine-window-held')).display === 'none'`, 15000), '⑪ live again ⇒ the row goes');
  await p.ev(`window.__picker(${JSON.stringify(M)})`);
  const pick = await p.until(`(() => { const r = document.querySelector('.machine-window-picker .machine-window-row.is-streaming'); return !!r && r.textContent.includes('正在串流') && !!r.querySelector('.machine-window-row-stop'); })()`, 10000);
  ok(pick, '⑪ the picker marks the window a stream shows now — 正在串流 — with 「停止」');
  await p.shot('window-picker.png', '.machine-window-picker');
  await p.key('Escape', 'Escape', 27);
  // 停止串流: the session ends on the hub AND the helper on the machine; the window stays and says so
  const pid1 = helperPid();
  const sb = await centreOf(`${WWIN} .machine-window-stop`);
  await p.click(sb[0], sb[1]);
  const said1 = await p.until(`(() => { const s = document.querySelector('${WWIN} .machine-app-say'); return !!s && getComputedStyle(s).display !== 'none' && s.firstChild.textContent === '已停止串流“${CJK}”'; })()`, 8000) ? await sayText() : null;
  ok(said1 && said1.acts[0] === '重新串流' && await untilN(() => winHub.facts('win-a').length === 0, 4000) && pid1 > 0 && await untilN(() => !alive(pid1), 4000), '⑪ 「停止串流」 ⇒ the hub\'s session ends and the machine\'s helper exits; the window stays: 已停止串流“…” + 「重新串流」', { said1, pid1, sessions: winHub.facts('win-a').length });
  await p.shot('window-stopped.png', WWIN);
  ok(await untilN(() => /window source ended: stopped — helper exit 0, encoder exit 0/.test(agentLog()), 4000), '⑪ the agent\'s log names it: window source ended: stopped — helper exit 0, encoder exit 0');
  // 重新串流, then the picker's 停止 (any browser's session of that window)
  const ag = await centreOf(`${WWIN} .machine-app-say button`);
  await p.click(ag[0], ag[1]);
  ok(await plays(), '⑪ 「重新串流」 streams it again');
  const pid2 = helperPid();
  await p.ev(`window.__picker(${JSON.stringify(M)})`);
  await p.until(`!!document.querySelector('.machine-window-picker .machine-window-row-stop')`, 10000);
  const ps = await centreOf('.machine-window-picker .machine-window-row-stop');
  await p.click(ps[0], ps[1]);
  const said2 = await p.until(`(() => { const s = document.querySelector('${WWIN} .machine-app-say'); return !!s && getComputedStyle(s).display !== 'none' && s.firstChild.textContent === '已停止串流“${CJK}”'; })()`, 10000);
  const rowBack = await p.until(`(() => { const r = document.querySelector('.machine-window-picker .machine-window-row'); return !!r && !r.classList.contains('is-streaming') && r.textContent.includes('串流这个窗口'); })()`, 5000);
  ok(said2 && rowBack && pid2 !== pid1 && await untilN(() => !alive(pid2), 4000) && winHub.facts('win-a').length === 0 && /window source ended: stopped_in_list/.test(agentLog()), '⑪ the picker\'s 「停止」 ends that window\'s stream on the machine (stopped_in_list); the open window says 已停止串流, the row offers 串流这个窗口 again', { said2, rowBack, pid2 });
  await p.key('Escape', 'Escape', 27);
  // the window's ×
  // lane race-sweep (B-6b74, 3/3 on 2 cpus): the press on 「重新串流」 went to the picker the Escape was still closing — the
  // stream never came back (replays false) and the × had nothing to end. The press waits for ITS place: the button's centre
  // is the button (the Escape's last effect for this press), then it is pressed
  const SAY = `${WWIN} .machine-app-say button`;
  const sayReached = await p.until(`(() => { const e = document.querySelector(${JSON.stringify(SAY)}); if (!e) return false; const b = e.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!h && (h === e || e.contains(h)); })()`, 10000);
  const sayCover = sayReached ? null : await p.ev(`(() => { const e = document.querySelector(${JSON.stringify(SAY)}); if (!e) return { say: 'gone' }; const b = e.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); const c = (x) => x && String((x.className && (x.className.baseVal != null ? x.className.baseVal : x.className)) || x.tagName); return { at: [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)], w: Math.round(b.width), cover: c(h), coverUp: c(h && h.parentElement), picker: !!document.querySelector('.machine-window-picker'), active: c(document.activeElement) }; })()`);
  const ag2 = await centreOf(SAY);
  await p.click(ag2[0], ag2[1]);
  const replays = await plays();
  const pid3 = helperPid();
  const ended0 = (agentLog().match(/window source ended: [^\n]*/g) || []).length;
  await p.ev('window.__closeAll()');
  // lane race-sweep (B-6b74, 1/10 on 2 cpus): ONE wait, for the LAST EFFECT — the agent's "window source ended" line, written
  // only after every child's exit — then its causes read at once; the old three round waits (3 s / 4 s / 3 s, the same 10 s in
  // all) raced each step, and kill(pid, 0) still answers for a zombie
  const endedLine = () => (agentLog().match(/window source ended: [^\n]*/g) || []).slice(ended0)[0] || null;
  await untilN(() => !!endedLine(), 10000);
  const xState = { sayReached, sayCover, replays, pid3, ended: endedLine(), facts: winHub.facts('win-a').length, alive: alive(pid3) };
  ok(xState.replays && /^window source ended: closed — helper exit 0/.test(xState.ended || '') && xState.facts === 0 && !xState.alive, '⑪ the window\'s × ends the session and the helper on the machine (closed, in the agent\'s log)', xState);
  await p.close();
  // a viewer that vanishes: its tab gone, not a word — the closed long poll ⇒ stopped within 5 s
  const vanish = async (hub) => {
    R.setup({ ...BASE, webrtc: hub });
    const q = await page(1280, 800, DESK);
    await q.ev(`window.__openWin(${JSON.stringify(M)}, ${JSON.stringify(ROW)})`);
    const ok1 = await q.until(`(() => { const v = document.querySelector('${WWIN} .stream-video'); return !!v && v.videoWidth > 0 && v.currentTime > 0.2; })()`, 25000);
    const pid = helperPid(), t0 = Date.now();
    await q.vanish();
    const gone = await untilN(() => hub.facts('win-a').length === 0 && !alive(pid), 6000);
    return { ok1, gone, ms: Date.now() - t0, pid };
  };
  const v1 = await vanish(winHub);
  ok(v1.ok1 && v1.gone && v1.ms <= 5500 && /window source ended: viewer_gone/.test(agentLog()), `⑪ the viewer vanishes (its tab closed, no stop asked) ⇒ the hub stops it (viewer_gone) and the machine's helper exits — ${v1.ms} ms`, v1);
  const deaf = DW.create({ access: ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({}) }), log: quiet, goneMs: 600000 });
  const v2 = await vanish(deaf);
  ok(v2.ok1 && !v2.gone && deaf.facts('win-a').length === 1 && alive(v2.pid), '⑪ RED CONTROL: a hub that never acts on the closed poll (goneMs 10 min) still streams 6 s after the tab is gone — the idle sweep would wait 30 s', { v2, sessions: deaf.facts('win-a').length });
  deaf.shutdown();
  await untilN(() => !alive(v2.pid), 4000);
  winHub.shutdown();
  R.setup({ ...BASE });
}
console.log('⑬ THE ESTIMATE: the agent reads its own transport-cc — werift 0.25\'s counts ~one packet a picture');
{
  const H = require(path.join(REPO, 'src/stream-h264.js'));
  const AUS = H.accessUnits(H.splitNalus(fs.readFileSync(FIXTURE)));
  const PER = Math.round((3000 * 1000) / 8 / 30), SC = Buffer.from([0, 0, 0, 1]), parts = [];
  for (const au of AUS.slice(AUS.findIndex((a) => a.key))) { // each picture grown to ~3 Mbps at 30 fps by one filler NAL (type 12 — a decoder skips it)
    const have = au.nalus.reduce((a, n) => a + n.length + 4, 0);
    for (const n of au.nalus) parts.push(SC, n);
    const fill = Buffer.alloc(Math.max(2, PER - have - 4), 0xff); fill[0] = 0x0c; fill[fill.length - 1] = 0x80; parts.push(SC, fill);
  }
  const PADDED = path.join(root, 'padded-3mbps.h264'); fs.writeFileSync(PADDED, Buffer.concat(parts));
  const estHub = DW.create({ access: ACC.create({ hosts, install: false, log: quiet, vncPort: vnc.port, probeMs: 3000, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: PADDED }) }), log: quiet });
  R.setup({ ...BASE, webrtc: estHub });
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  const seen = [];
  for (let i = 0; i < 6; i++) { await sleep(1000); const st = (estHub.facts('win-a')[0] || {}).stats || {}; if (st.bweKbps != null && st.kbps > 0) seen.push([st.kbps, st.bweKbps]); }
  const tail = seen.slice(-3), fits = tail.length === 3 && tail.every(([k, b]) => k >= 2000 && b >= 0.7 * k && b <= 2.5 * k);
  ok(up && fits, `⑬ ~3 Mbps through the real agent bundle to this Chrome: the agent's estimate tracks what it sent (sent/estimated kbps: ${tail.map((x) => x.join('/')).join(', ')}) — werift's own would read ~1/11 (test-stream-plan §9's RED CONTROL)`, seen);
  await p.close();
  estHub.shutdown();
  R.setup({ ...BASE });
}
console.log('⑭ THE HAND-OVER (lane desktop-handover): the strip gives the stream to ONE conversation; its records reach THE resident script; the owner\'s input pauses it; 「收回」');
{
  const ENG = require(path.join(REPO, 'src/server/desktop-handover-engine.js'));
  const hoDir = path.join(root, 'ho-data'); fs.mkdirSync(hoDir, { recursive: true });
  const live = new Map([['w1', { backend: 'claude', claudeSessionId: 'cid-hand', name: 'Alpha', agentToken: 'vsst_hand' }]]);
  const ho = ENG.create({ dataDir: hoDir, activeSessions: live, tickMs: 0, log: quiet });
  const hoHub = DW.create({ access, log: quiet, handover: ho.hooks });
  R.setup({ ...BASE, webrtc: hoHub, handover: ho });
  const A = { sessionId: 'w1', session: live.get('w1') };
  const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || String(e.message); } };
  const HO = `${WIN} .desktop-strip-handover`;
  const shown = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; })()`;
  const textOf = (sel) => p.ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || null`);
  const press = async (sel) => { const [x, y] = await p.ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`); await p.click(x, y); };
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__app.sidebar._webuiSessions = [{ id: 'w1', claudeSessionId: 'cid-hand', name: 'Alpha', cwd: '/home/o/proj', backend: 'claude' }]`);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  const give = up && await p.until(shown(`${WIN} .desktop-strip-handover-give`), 8000);
  ok(up && give && (await textOf(`${WIN} .desktop-strip-handover-give`)) === '交给 agent' && !(await p.ev(shown(HO))), '⑭ while the stream plays the strip offers 「交给 agent」 (no lease yet)');
  await press(`${WIN} .desktop-strip-handover-give`);
  const dlg = await p.until(`!!document.querySelector('#machine-desktop-handover .pp-row[data-key="agent:cid-hand"]')`, 5000);
  await press('#machine-desktop-handover .pp-row[data-key="agent:cid-hand"]');
  await p.until(`!document.querySelector('#machine-desktop-handover .btn-create').disabled`, 3000);
  await press('#machine-desktop-handover .btn-create');
  const given = await p.until(`${shown(HO)} && /Alpha 正在操作/.test(document.querySelector('${WIN} .desktop-strip-handover-who').textContent)`, 5000);
  ok(dlg && given && !(await p.ev(shown(`${WIN} .desktop-strip-handover-give`))) && (ho.stateOf('win-a') || {}).input === 'agent', '⑭ the one-holder picker (a live conversation) → 交给它 ⇒ the strip reads 「Alpha 正在操作 · 收回」, the lease is on the hub', ho.stateOf('win-a'));
  const shot = await ho.screenshot('md-win-a', A);
  ok(shot.w === 1280 && shot.h === 720 && shot.png.readUInt32BE(16) === 1280 && shot.coords === 'display', '⑭ the agent\'s screenshot = desktop-grab through the REAL bundle (the fake source\'s 1280×720 PNG) — its size printed', { w: shot.w, h: shot.h, bytes: shot.png.length });
  const n0 = psLines().length;
  await ho.act('md-win-a', A, { verb: 'click', at: '640,360' });
  const got = await (async () => { for (let i = 0; i < 50; i++) { const l = linesSince(n0); if (l.includes('U 0')) return l; await sleep(100); } return linesSince(n0); })();
  ok(JSON.stringify(got.slice(0, 4)) === JSON.stringify(['M 640 360', 'M 640 360', 'D 0', 'M 640 360']) || (got.includes('M 640 360') && got.includes('D 0') && got.includes('U 0') && got.indexOf('D 0') < got.indexOf('U 0') && got.every((l) => !/^M /.test(l) || l === 'M 640 360')), '⑭ the agent\'s click at the still\'s centre reached THE resident script as ④\'s owner click did: M 640 360 · D 0 · U 0 (desktop-input → the session\'s own sink)', got);
  const dot = await p.until(`(() => { const c = document.querySelector('${WIN} .browser-live-agent-cursor'); if (!c || c.style.display === 'none') return false; const v = document.querySelector('${WIN} .stream-video').getBoundingClientRect(), b = c.getBoundingClientRect(); return Math.abs(b.left - (v.left + v.width / 2)) < 12 && Math.abs(b.top - (v.top + v.height / 2)) < 12 && /Alpha/.test(c.textContent); })()`, 5000);
  ok(dot, '⑭ the agent\'s pointer shows over the picture where it clicked, labelled Alpha (browser-live-window\'s labelled cursor)');
  await p.shot('handover.png', WIN);
  // the owner's own click on the picture pauses it
  const [cx, cy] = await centre(p);
  const n1 = psLines().length;
  await p.click(cx, cy - 100);
  const paused = await p.until(`/已暂停/.test(document.querySelector('${WIN} .desktop-strip-handover-who').textContent) && ${shown(`${WIN} .desktop-strip-handover-resume`)}`, 5000);
  await sleep(300);
  const n2 = psLines().length;
  const refused = await codeOf(() => ho.act('md-win-a', A, { verb: 'click', at: '10,10' }));
  await sleep(300);
  ok(paused && (ho.stateOf('win-a') || {}).input === 'user' && refused === 'window_paused' && psLines().length === n2 && linesSince(n1).includes('D 0'), '⑭ the owner\'s own click on the picture: it reaches the machine AND pauses the agent (已暂停——你在操作 + 「继续交给它」); the agent\'s next click ⇒ window_paused, nothing sent', { refused, state: ho.stateOf('win-a') });
  await p.shot('handover-paused.png', WIN);
  await press(`${WIN} .desktop-strip-handover-resume`);
  const resumed = await p.until(`/Alpha 正在操作/.test(document.querySelector('${WIN} .desktop-strip-handover-who').textContent)`, 5000);
  ok(resumed && (ho.stateOf('win-a') || {}).input === 'agent' && (await ho.act('md-win-a', A, { verb: 'key', chord: 'ctrl+s' })).ok, '⑭ 「继续交给它」 ⇒ Alpha drives again (its ctrl+s goes through)');
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 120 });
  const wheelPaused = await p.until(`/已暂停/.test(document.querySelector('${WIN} .desktop-strip-handover-who').textContent)`, 5000);
  ok(wheelPaused && (ho.stateOf('win-a') || {}).input === 'user', '⑭ the owner\'s wheel pauses it too');
  await press(`${WIN} .desktop-strip-handover-take`);
  const taken = await p.until(`${shown(`${WIN} .desktop-strip-handover-give`)} && !${shown(HO)}`, 5000);
  ok(taken && ho.stateOf('win-a') === null && await codeOf(() => ho.screenshot('md-win-a', A)) === 'desktop_not_handed', '⑭ 「收回」 ⇒ the strip offers 「交给 agent」 again; the agent\'s verbs ⇒ desktop_not_handed');
  const key = (await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/machine-desktop/stream/facts?host=win-a`)).json()).sessions[0].key;
  const again = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/machine-desktop/handover`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'win-a', key, principal: 'agent:cid-hand' }) })).json();
  const asAgent = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/machine-desktop/handover/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vsst_hand' }, body: JSON.stringify({ host: 'win-a' }) })).json();
  ok(again.ok && asAgent.code === 'human_only' && ho.stateOf('win-a') !== null, '⑭ handed again over the route; the agent\'s own token on the owner\'s revoke ⇒ human_only (the lease stays)');
  await p.close();
  await sleep(500);
  const ends = fs.readFileSync(path.join(hoDir, 'window-audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.verb === 'lease-end').map((l) => l.cause);
  ok(ho.stateOf('win-a') === null && JSON.stringify(ends) === JSON.stringify(['revoked', 'window_closed']), '⑭ the window\'s × ends it (window_closed) — the audit\'s lease ends: revoked, window_closed', ends);
  ho.shutdown(); hoHub.shutdown();
  R.setup({ ...BASE });
}
console.log('⑮ THE DETAILS · THE PIN · TRUE FULL SCREEN (lane stream-stats-popup)');
let SHOWN = null;
{
  const STRIP = `${WIN} .desktop-strip`, CONTENT = `${WIN} .desktop-machine-content`;
  SHOWN = `(() => { const d = document.querySelector('.stream-stats-pop'); return !!d && !!d.querySelector('canvas') && getComputedStyle(d).visibility === 'visible'; })()`; // createPopover lays it out at its first frame
  const at = (p, sel) => p.ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`);
  const press = async (p, sel) => { const [x, y] = await at(p, sel); await p.click(x, y); };
  const mouse = (p, type, x, y, buttons = 0) => p.cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const drag = async (p, [x0, y0], [x1, y1]) => { await mouse(p, 'mouseMoved', x0, y0); await mouse(p, 'mousePressed', x0, y0, 1); for (let k = 1; k <= 10; k++) { await mouse(p, 'mouseMoved', Math.round(x0 + ((x1 - x0) * k) / 10), Math.round(y0 + ((y1 - y0) * k) / 10), 1); await sleep(25); } await mouse(p, 'mouseReleased', x1, y1, 0); await sleep(150); };
  const stripFacts = (p) => p.ev(`(() => { const s = document.querySelector('${STRIP}'), c = s.querySelector('.desktop-strip-status'), r = s.getBoundingClientRect(); const kids = [...s.children].filter((e) => !e.hidden && getComputedStyle(e).display !== 'none'); const used = Math.round(kids.reduce((n, e) => n + e.getBoundingClientRect().width, 0) + 6 * Math.max(0, kids.length - 1)); return { h: Math.round(r.height), content: used, room: s.clientWidth, scrolls: s.scrollWidth > s.clientWidth + 1, numbers: !!s.querySelector('.desktop-strip-stream:not([hidden])'), chip: c.textContent, glyph: c.hasAttribute('data-chart'), glyphPx: Math.round(parseFloat(getComputedStyle(c, '::after').width) || 0) }; })()`);
  const fullFacts = (p) => p.ev(`(() => { const c = document.querySelector('${CONTENT}'), s = c.querySelector('.desktop-strip'), v = c.querySelector('.stream-video'); const vr = v.getBoundingClientRect(), sr = s.getBoundingClientRect(); const tag = (e) => e.classList.contains('desktop-strip-grip') ? 'grip' : e.classList.contains('desktop-strip-status') ? 'summary' : e.classList.contains('desktop-strip-full') ? 'exit' : e.classList.contains('desktop-strip-pill-more') ? 'more' : e.className; const shown = [...s.children].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(tag);
    return { full: document.fullscreenElement === c, vw: innerWidth, vh: innerHeight, video: [vr.left, vr.top, vr.width, vr.height].map(Math.round), pill: s.classList.contains('is-pill'), away: s.classList.contains('is-away'), opacity: getComputedStyle(s).opacity, pos: getComputedStyle(s).position, corner: s.dataset.corner || null, rect: [sr.left, sr.top, sr.right, sr.bottom].map(Math.round), shown, exit: c.querySelector('.desktop-strip-full').textContent }; })()`);
  const goFull = async (p) => { await press(p, `${WIN} .desktop-strip-full`); return p.until(`document.fullscreenElement === document.querySelector('${CONTENT}')`, 4000); };
  // BEFORE: the pre-lane strip (the numbers sentence in it) and its full screen (the strip stays a bar) — the RED CONTROL
  const pre = await page(1280, 800, DESK, { at: '/prelane' });
  await pre.ev(`window.__open(${JSON.stringify(M)})`);
  await playing(pre);
  await pre.until(`!!document.querySelector('${STRIP} .desktop-strip-stream:not([hidden])') && /kbps/.test(document.querySelector('${STRIP} .desktop-strip-stream').textContent)`, 8000);
  const before = await stripFacts(pre);
  await pre.shot('strip-before.png', STRIP);
  const preFull = await goFull(pre);
  await sleep(400);
  const fsPre = await fullFacts(pre);
  await pre.shot('fullscreen-before.png');
  await pre.ev('document.exitFullscreen().catch(() => {})');
  await pre.close();
  ok(preFull && fsPre.full && !fsPre.pill && fsPre.pos === 'static' && fsPre.video[3] < fsPre.vh && fsPre.video[1] >= before.h, `⑭ RED CONTROL: the pre-lane full screen keeps the strip as a bar over the picture — the picture ${fsPre.video[2]}×${fsPre.video[3]} of ${fsPre.vw}×${fsPre.vh} (${Math.round((100 * fsPre.video[3]) / fsPre.vh)} % of the height), starting ${fsPre.video[1]} px down`, fsPre);
  // AFTER
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  await p.until(`/kbps/.test(${NUM})`, 8000);
  await sleep(2500); // a few seconds in the series
  const after = await stripFacts(p);
  ok(up && before.numbers && !after.numbers && after.h === before.h && after.content < before.content && !after.scrolls && after.glyph && after.glyphPx === 12 && /^串流 · \d+ ms · \d+ fps$/.test(after.chip), `⑭ the strip shows ONE summary: 「${after.chip}」 + a 12 px chart glyph — the numbers sentence left it (the strip's content ${before.content} → ${after.content} px in ${after.room} px, height ${before.h} → ${after.h} px)`, { before, after });
  await p.shot('strip-after.png', STRIP);
  await press(p, `${WIN} .desktop-strip-status`);
  await p.until(SHOWN, 3000);
  await sleep(300);
  const POP = `(() => { const d = document.querySelector('.stream-stats-pop'); if (!d) return null; const r = d.getBoundingClientRect(); const cv = [...d.querySelectorAll('canvas.stream-chart-canvas')];
    const ink = (c) => { const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++; return n; };
    return { popover: d.dataset.popover === '1', rows: [...d.querySelectorAll('.stream-stats-table tr')].map((tr) => [tr.dataset.k, tr.cells[0].textContent, tr.cells[1].textContent]), kinds: [...d.querySelectorAll('.stream-chart')].map((c) => c.dataset.kind), names: [...d.querySelectorAll('.stream-chart-name')].map((e) => e.textContent), now: [...d.querySelectorAll('.stream-chart-now')].map((e) => e.textContent), max: [...d.querySelectorAll('.stream-chart-max')].map((e) => e.textContent), ink: cv.map(ink), size: cv.map((c) => [c.clientWidth, c.clientHeight]), box: [r.left, r.top, r.width, r.height].map(Math.round), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; })()`;
  const pop = await p.ev(POP);
  ok(pop && pop.popover && pop.kinds.join() === 'latency,loss,rate' && pop.names.join() === '延迟,丢包,带宽' && pop.ink.every((n) => n > 0) && pop.inView && /^\d+ ms/.test(pop.now[0]) && /^[\d.]+ %/.test(pop.now[1]) && /^\d+ kbps/.test(pop.now[2]) && pop.max[0].endsWith(' ms') && pop.max[2].endsWith(' kbps'), `⑭ the summary's click opens THE DETAILS (a createPopover — data-popover, so Esc and an outside press close it): three inked canvas charts 延迟 · 丢包 · 带宽 (${pop && pop.now.join(' | ')}; tops ${pop && pop.max.join(' / ')})`, pop);
  const row = (k) => ((pop && pop.rows.find((r) => r[0] === k)) || [])[2] || '';
  ok(pop.rows.slice(0, 5).map((r) => r[1]).join() === '往返,抖动,帧率,解码,接收' && /^\d+ ms$/.test(row('rtt')) && /^\d+ fps · 发出 \d+$/.test(row('fps')) && /^\d+ kbps · 发出 \d+$/.test(row('kbps')) && row('path') === '直连' && /H264/i.test(row('codec')) && row('size') === '1280×720' && /^丢包 \d+ · 丢帧 \d+$/.test(row('loss')), '⑭ the table: 往返 · 抖动 · 帧率 (发出) · 解码 · 接收 (发出) · 路径 直连 · 编解码器 H264 · 画面大小 1280×720 · 丢失 — the page\'s own numbers beside the agent\'s', pop.rows);
  await p.shot('details.png', '.stream-stats-pop');
  const lat = await p.ev(`(() => { const b = document.querySelector('.stream-stats-pop .stream-chart[data-kind="latency"] canvas').getBoundingClientRect(); return { x: b.right - 1, y: Math.round(b.top + b.height / 2), step: b.width / 119 }; })()`);
  await mouse(p, 'mouseMoved', lat.x, lat.y);
  await sleep(150);
  const readout = await p.ev(`document.querySelector('.stream-stats-pop .stream-chart[data-kind="latency"] .stream-chart-now').textContent`);
  await mouse(p, 'mouseMoved', lat.x - 2 * lat.step, lat.y);
  await sleep(150);
  const readout2 = await p.ev(`document.querySelector('.stream-stats-pop .stream-chart[data-kind="latency"] .stream-chart-now').textContent`);
  ok(/^现在 · \d+ ms ± \d+$/.test(readout) && /^2 秒前 · (\d+ ms ± \d+|无读数)$/.test(readout2), `⑭ a hover on a chart reads that second: 「${readout}」, two seconds left 「${readout2}」`, { readout, readout2 });
  // 钉住 ⇒ the panel in the picture's top-right corner; it outlives the popup
  await press(p, '.stream-stats-pop .stream-stats-pin');
  const PANEL = `(() => { const q = document.querySelector('${WIN} .stream-stats-panel'); if (!q) return null; const f = q.parentElement.getBoundingClientRect(), r = q.getBoundingClientRect(); return { corner: q.dataset.corner, gaps: { l: Math.round(r.left - f.left), t: Math.round(r.top - f.top), r: Math.round(f.right - r.right), b: Math.round(f.bottom - r.bottom) }, inPane: !!q.parentElement.querySelector('.stream-video'), popover: q.hasAttribute('data-popover'), charts: q.querySelectorAll('canvas.stream-chart-canvas').length, table: !!q.querySelector('table'), title: q.querySelector('.stream-stats-title').textContent, size: [Math.round(r.width), Math.round(r.height)], hash: [...q.querySelectorAll('canvas')].map((c) => { const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 3; i < px.length; i += 4) h = (h * 31 + px[i] * (i % 997)) % 1000000007; return h; }).join(':') }; })()`;
  const pinned = await p.until(`!document.querySelector('.stream-stats-pop') && !!document.querySelector('${WIN} .stream-stats-panel')`, 3000);
  const pf = await p.ev(PANEL);
  ok(pinned && pf.corner === 'tr' && pf.gaps.t === 10 && pf.gaps.r === 10 && pf.inPane && !pf.popover && pf.charts === 3 && !pf.table && /^\d+ ms · \d+ fps · \d+ kbps$/.test(pf.title), `⑭ 钉住: the details become a ${pf.size.join('×')} panel in the picture's top-right corner (10 px in) — three live charts under one line (${pf.title}), no data-popover (the Esc sweep leaves it)`, pf);
  await press(p, `${WIN} .desktop-strip-status`);
  const again = await p.until(SHOWN, 2000);
  await press(p, `${WIN} .vs-win-title`); // an outside press
  const closed = await p.until(`!document.querySelector('.stream-stats-pop')`, 2000);
  await sleep(2200);
  const pf2 = await p.ev(PANEL);
  ok(again && closed && pf2 && pf2.hash !== pf.hash, '⑭ the panel outlives the popup: the summary opens the popup again beside it, an outside press closes the popup, the panel stays — and its charts moved on (updated each second)', { again, closed, before: pf.hash, after: pf2 && pf2.hash });
  await p.shot('pinned.png', WIN);
  const head = await p.ev(`(() => { const b = document.querySelector('${WIN} .stream-stats-panel .stream-stats-head').getBoundingClientRect(), f = document.querySelector('${WIN} .stream-stats-panel').parentElement.getBoundingClientRect(); return { from: [Math.round(b.left + 30), Math.round(b.top + b.height / 2)], to: [Math.round(f.left + 160), Math.round(f.bottom - 60)] }; })()`);
  await drag(p, head.from, head.to);
  const pf3 = await p.ev(PANEL);
  const pinMem = await p.ev(`localStorage.getItem('vibespace.streamStatsPin')`);
  ok(pf3.corner === 'bl' && pf3.gaps.l === 10 && pf3.gaps.b === 10 && pinMem === '{"win-a":"bl"}', '⑭ dragged by its head toward the bottom-left, it drops IN that corner (10 px in) — remembered for this machine (vibespace.streamStatsPin)', { pf3, pinMem });
  // TRUE FULL SCREEN
  const fsOn = await goFull(p);
  await sleep(400);
  const fs1 = await fullFacts(p);
  ok(fsOn && fs1.pill && fs1.pos === 'absolute' && fs1.video.join() === `0,0,${fs1.vw},${fs1.vh}`, `⑭ TRUE full screen: the picture takes the whole screen — ${fs1.video[2]}×${fs1.video[3]} of ${fs1.vw}×${fs1.vh} = 100 % (no fixed strip)`, fs1);
  ok(fs1.shown.join() === 'grip,summary,exit,more' && fs1.exit === '退出全屏' && fs1.corner === 'tl' && fs1.rect[0] === 10 && fs1.rect[1] === 10 && !fs1.away, '⑭ the strip floats over it as a pill in the top-left: grip · 串流 · N ms · N fps · 退出全屏 · ⋯ (nothing else of the bar)', fs1);
  const pfFull = await p.ev(PANEL);
  ok(pfFull && pfFull.corner === 'bl' && pfFull.gaps.l === 10 && pfFull.gaps.b === 10, '⑭ the pinned panel rides along: the screen\'s bottom-left corner now', pfFull);
  await p.shot('fullscreen.png');
  await press(p, `${WIN} .desktop-strip-pill-more`);
  const menu = await p.ev(`(() => { const m = document.querySelector('.stream-pill-menu'); return m ? { inFull: document.fullscreenElement.contains(m), items: [...m.querySelectorAll('.stream-pill-menu-item')].map((b) => b.textContent), held: document.querySelector('${STRIP}').dataset.why } : null; })()`);
  ok(menu && menu.inFull && menu.items[0] === '串流详情' && menu.items.some((x) => /捕获快捷键$/.test(x)) && menu.held === 'menu', '⑭ ⋯ opens inside the full-screen element (a popup of the page behind would not show there): 串流详情 · (the displays) · 捕获快捷键 — and holds the pill up', menu);
  await p.until(`getComputedStyle(document.querySelector('.stream-pill-menu')).visibility === 'visible'`, 2000);
  await press(p, '.stream-pill-menu .stream-pill-menu-item');
  await p.until(SHOWN, 3000);
  const fpop = await p.ev(`(() => { const d = document.querySelector('.stream-stats-pop'); if (!d) return null; const r = d.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + 30); return { inFull: document.fullscreenElement.contains(d), hit: !!(hit && d.contains(hit)), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; })()`);
  ok(fpop && fpop.inFull && fpop.hit && fpop.inView, '⑭ 串流详情 shows the details over the picture (inside the full-screen element, the topmost element where it is)', fpop);
  await p.shot('fullscreen-details.png');
  await press(p, '.stream-stats-pop .stream-stats-x');
  await mouse(p, 'mouseMoved', 640, 520);
  const t0 = Date.now();
  const away = await p.until(`document.querySelector('${STRIP}').classList.contains('is-away')`, 6000);
  const restMs = Date.now() - t0;
  await sleep(350); // past its 0.15 s fade
  const fsAway = await fullFacts(p);
  ok(away && restMs >= 2500 && restMs <= 4500 && fsAway.opacity === '0', `⑭ the pointer rests: the pill fades ${restMs} ms later (3 s) — the picture alone`, { restMs, fsAway });
  await p.shot('fullscreen-away.png');
  await mouse(p, 'mouseMoved', 600, 500);
  const back = await p.until(`!document.querySelector('${STRIP}').classList.contains('is-away')`, 1000);
  ok(back, '⑭ a move brings it back');
  const gr = await at(p, `${STRIP} .desktop-strip-grip`);
  await drag(p, gr, [fs1.vw - 80, fs1.vh - 40]);
  const fs2 = await fullFacts(p);
  const pillMem = await p.ev(`localStorage.getItem('vibespace.streamPill')`);
  ok(fs2.corner === 'br' && fs2.rect[2] === fs2.vw - 10 && fs2.rect[3] === fs2.vh - 10 && pillMem === '{"win-a":"br"}', '⑭ dragged by its grip, the pill drops in the bottom-right corner (10 px in) — remembered for this machine (vibespace.streamPill)', { fs2, pillMem });
  await p.shot('fullscreen-br.png');
  await press(p, `${WIN} .desktop-strip-full`);
  const exited = await p.until(`!document.fullscreenElement`, 3000);
  await sleep(300);
  const ex = await p.ev(`(() => { const s = document.querySelector('${STRIP}'), v = document.querySelector('${WIN} .stream-video').getBoundingClientRect(); return { pill: s.classList.contains('is-pill'), pos: getComputedStyle(s).position, full: s.querySelector('.desktop-strip-full').textContent, grip: getComputedStyle(s.querySelector('.desktop-strip-grip')).display, more: getComputedStyle(s.querySelector('.desktop-strip-pill-more')).display, below: Math.round(v.top - s.getBoundingClientRect().bottom) }; })()`);
  ok(exited && !ex.pill && ex.pos === 'static' && ex.full === '⤢ 全屏' && ex.grip === 'none' && ex.more === 'none' && ex.below >= 0, '⑭ 「退出全屏」 leaves it: the strip is the window\'s bar again (⤢ 全屏; no grip, no ⋯), the picture under it', ex);
  // Esc: the browser's own (it exits full screen and fires fullscreenchange — the same door); measured: CDP's Esc never leaves
  // a headless Chrome's full screen, so the browser's exit is taken through the API when it did not
  await goFull(p);
  await p.key('Escape', 'Escape', 27);
  const escLeft = await p.until(`!document.fullscreenElement`, 1500);
  if (!escLeft) await p.ev('document.exitFullscreen().catch(() => {})');
  const exEsc = await p.until(`!document.fullscreenElement && !document.querySelector('${STRIP}').classList.contains('is-pill')`, 3000);
  ok(exEsc, `⑭ the browser's exit (Esc ${escLeft ? 'itself' : '— taken through the API: CDP\'s Esc never leaves headless full screen'}) puts the bar back the same way`, { escLeft });
  await press(p, `${WIN} .stream-stats-panel .stream-stats-x`);
  ok(await p.until(`!document.querySelector('${WIN} .stream-stats-panel')`, 2000), '⑭ the panel\'s × closes it');
  await p.close();
  // reopened: the pill's corner and the pin's corner come back. Lane mirror-315-webrtc-pin (the .315 mirror, both tries: pf4
  // null): 钉住 was pressed where the details had been painted ONE FRAME before they moved above the pill (or before the
  // table's first numbers grew them) ⇒ the press landed in the details, no panel. Every wait names the effect the next step
  // needs; the details' painted places are traced (a ResizeObserver made AFTER the details' own ⇒ it reads each frame's
  // final place, after their corrections) and the press's landing is printed
  const PIN_TRACE = `(() => { const tr = window.__pinTrace = { frames: [], press: null }, anchor = document.querySelector('${WIN} .desktop-strip-status');
    const look = (d) => { if (getComputedStyle(d).visibility !== 'visible') return; const r = d.getBoundingClientRect(), f = { top: Math.round(r.top), bottom: Math.round(r.bottom), anchorTop: Math.round(anchor.getBoundingClientRect().top) }, l = tr.frames[tr.frames.length - 1]; if (!l || l.top !== f.top || l.bottom !== f.bottom) tr.frames.push(f); };
    const mo = new MutationObserver(() => { const d = document.querySelector('.stream-stats-pop'); if (!d) return; mo.disconnect(); new ResizeObserver(() => look(d)).observe(d); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('pointerdown', (e) => { const pin = document.querySelector('.stream-stats-pop .stream-stats-pin'); if (tr.press || !pin) return; const q = pin.getBoundingClientRect(); tr.press = { at: [e.clientX, e.clientY], onPin: !!e.target.closest('.stream-stats-pin'), pin: [q.left, q.top, q.right, q.bottom].map(Math.round), hit: String(e.target.className || e.target.tagName).slice(0, 40) }; }, { capture: true });
    return true; })()`;
  const PIN_STILL = `new Promise((r) => { const q = () => { const b = document.querySelector('.stream-stats-pop .stream-stats-pin'); if (!b) return null; const x = b.getBoundingClientRect(); return x.left + ',' + x.top; }; const a = q(); requestAnimationFrame(() => requestAnimationFrame(() => r(a !== null && q() === a))); })`;
  // the stream's numbers ALL in = the rows ⑭'s first table showed: a fast reopen's table fills in two reads (0 → 5 → 9 rows —
  // measured: painted 386–762, then 298–762), each growing the details upward; a count (≥ 5) pressed 钉住 across the second
  const PIN_ROWS = ['rtt', 'jitter', 'fps', 'decode', 'kbps', 'path', 'codec', 'size', 'loss'];
  const reopenPin = async (q) => { // the pill up in its remembered corner → the summary pressed → the details shown, their numbers in, their place held
    await q.ev(`window.__open(${JSON.stringify(M)})`);
    await playing(q);
    await goFull(q);
    await q.until(`document.querySelector('${STRIP}').classList.contains('is-pill')`, 3000); // the fullscreenchange's own effect (pill.sync)
    const fs = await fullFacts(q);
    await q.ev(PIN_TRACE);
    await press(q, `${WIN} .desktop-strip-status`);
    const shown = await q.until(SHOWN, 3000);
    const filled = shown && await q.until(`(() => { const k = new Set([...document.querySelectorAll('.stream-stats-pop .stream-stats-table tr')].map((tr) => tr.dataset.k)); return ${JSON.stringify(PIN_ROWS)}.every((x) => k.has(x)); })()`, 8000);
    const held = filled && await q.until(PIN_STILL, 3000);
    return { fs, shown, filled, held, frames: await q.ev('window.__pinTrace.frames') };
  };
  const aboveAll = (r) => r.frames.length > 0 && r.frames.every((f) => Math.abs(f.bottom - (f.anchorTop - 2)) <= 1);
  const placesOf = (r) => r.frames.map((f) => `${f.top}–${f.bottom}`).join(' → ');
  const p2 = await page(1280, 800, DESK);
  const r3 = await reopenPin(p2), fs3 = r3.fs;
  ok(r3.shown && r3.filled && r3.held && aboveAll(r3), `⑭ the window reopened in full screen: the summary's details open ABOVE the bottom-right pill from the first frame they show, and grow upward when the table's numbers come — painted at ${placesOf(r3)}, each bottom 2 px over the summary (${r3.frames[0] && r3.frames[0].anchorTop})`, r3);
  await press(p2, '.stream-stats-pop .stream-stats-pin');
  const pinned4 = await p2.until(`!!document.querySelector('${WIN} .stream-stats-panel')`, 3000);
  const pf4 = await p2.ev(PANEL);
  const land = await p2.ev('window.__pinTrace.press');
  ok(fs3.full && fs3.corner === 'br' && fs3.rect[2] === fs3.vw - 10 && pinned4 && pf4 && pf4.corner === 'bl', '⑭ the window reopened: its full-screen pill comes back bottom-right, a new pin bottom-left — remembered per machine', { fs3, shown: r3.shown, filled: r3.filled, held: r3.held, land, pf4, pop: pf4 ? null : await p2.ev(`(() => { const d = document.querySelector('.stream-stats-pop'); if (!d) return null; const r = d.getBoundingClientRect(); return { visibility: getComputedStyle(d).visibility, box: [r.left, r.top, r.right, r.bottom].map(Math.round), away: document.querySelector('${STRIP}').classList.contains('is-away') }; })()`) });
  await p2.ev(`document.exitFullscreen().catch(() => {}); true`);
  await p2.close();
  // its RED CONTROL: the details' pre-fix placement (above the anchor one frame after they showed, once) — the place the
  // mirror's press aimed at is painted first, and the table's numbers clamp them down over the pill
  const p3 = await page(1280, 800, DESK, { at: '/prepin' });
  const r3c = await reopenPin(p3);
  ok(r3c.shown && r3c.filled && r3c.frames.length > 0 && !aboveAll(r3c), `⑭ RED CONTROL: the pre-fix placement paints the details at ${placesOf(r3c)} — a frame of them over the pill (its summary at ${r3c.frames[0] && r3c.frames[0].anchorTop}) before or after they move`, r3c);
  await p3.ev(`document.exitFullscreen().catch(() => {}); localStorage.removeItem('vibespace.streamPill'); localStorage.removeItem('vibespace.streamStatsPin'); true`); // this profile's memory reset for the legs after
  await p3.close();
}

console.log('⑮ a phone: the summary\'s tap, the pill under a finger');
{
  const p = await page(375, 667, PHONE, { touch: true });
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  await playing(p);
  await p.until(`/kbps/.test(${NUM})`, 8000);
  await sleep(1500);
  await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip'); s.scrollLeft = s.scrollWidth; return true; })()`);
  const [sx, sy] = await p.ev(`(() => { const b = document.querySelector('${WIN} .desktop-strip-status').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`);
  await p.tap(sx, sy);
  const pop = await p.until(SHOWN, 3000) && await p.ev(`(() => { const d = document.querySelector('.stream-stats-pop'), r = d.getBoundingClientRect(); return { box: [r.left, r.top, r.right, r.bottom].map(Math.round), charts: d.querySelectorAll('canvas').length, rows: d.querySelectorAll('tr').length }; })()`);
  ok(pop && pop.box[0] >= 0 && pop.box[2] <= 375 && pop.box[1] >= 0 && pop.box[3] <= 667 && pop.charts === 3 && pop.rows >= 7, `⑮ a TAP on the summary opens the details inside the 375 × 667 screen (${pop && pop.box.join(',')}) — the table and three charts`, pop);
  const [lx, ly] = await p.ev(`(() => { const b = document.querySelector('.stream-stats-pop .stream-chart[data-kind="rate"] canvas').getBoundingClientRect(); return [Math.floor(b.right - 1), Math.round(b.top + b.height / 2)]; })()`); // the newest second (a few rows only yet)
  await p.tap(lx, ly);
  await sleep(150);
  const tapRead = await p.ev(`document.querySelector('.stream-stats-pop .stream-chart[data-kind="rate"] .stream-chart-now').textContent`);
  ok(/^现在 · \d+ kbps/.test(tapRead), `⑮ a tap on a chart holds that second's readout: 「${tapRead}」`, tapRead);
  await p.shot('phone-details.png');
  await p.ev(`document.querySelector('.stream-stats-pop .stream-stats-x').click()`);
  await p.ev(`(() => { const s = document.querySelector('${WIN} .desktop-strip'); s.scrollLeft = 0; return true; })()`);
  const [fx, fy] = await p.ev(`(() => { const b = document.querySelector('${WIN} .desktop-strip-full').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`);
  await p.tap(fx, fy);
  const full = await p.until(`!!document.fullscreenElement && document.querySelector('${WIN} .desktop-strip').classList.contains('is-pill')`, 4000);
  const away = await p.until(`document.querySelector('${WIN} .desktop-strip').classList.contains('is-away')`, 6000);
  const n0 = psLines().length;
  await p.tap(187, 420); // the middle of the picture: the machine's
  const mid = await (async () => { for (let i = 0; i < 30; i++) { const l = linesSince(n0); if (l.includes('U 0')) return l; await sleep(100); } return linesSince(n0); })();
  const stillAway = await p.ev(`document.querySelector('${WIN} .desktop-strip').classList.contains('is-away')`);
  ok(full && away && mid.includes('D 0') && mid.includes('U 0') && stillAway, '⑮ in full screen the pill fades (no finger moved); a tap in the middle is a click on the machine (D 0 · U 0) and leaves the pill away', { full, away, mid, stillAway });
  const n1 = psLines().length;
  await p.tap(30, 40); // the pill's corner (top-left third)
  const woke = await p.until(`!document.querySelector('${WIN} .desktop-strip').classList.contains('is-away')`, 1000);
  await sleep(600);
  const corner = linesSince(n1).filter((l) => /^[DU] /.test(l));
  ok(woke && corner.length === 0, '⑮ a tap in the pill\'s corner wakes it — and never reaches the machine (no press, no release sent)', { woke, corner });
  await p.shot('phone-fullscreen.png');
  const reAway = await p.until(`document.querySelector('${WIN} .desktop-strip').classList.contains('is-away')`, 5000);
  ok(reAway, '⑮ …for 3 s, then it fades again');
  await p.ev('document.exitFullscreen().catch(() => {})');
  await p.close();
}
console.log('⑰ THE MICROPHONE (lane stream-mic-road): 「麦克风」 — Chrome\'s fake microphone over the m-line to the machine\'s virtual microphone');
{
  const MIC_BTN = `${WIN} .desktop-strip-mic`, ROAD = `${WIN} .desktop-strip-mic-road`;
  const nodeUntil = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(60); } return false; };
  const micForce = () => fetch(`http://127.0.0.1:${PORT}/api/desktop/machine-desktop/mic?host=win-a&force=1`).then((r) => r.json());
  MIC.setFacts(winFacts()); const f0 = await micForce();
  ok(f0.state && f0.state.state === 'installed' && f0.words.road === 'virtual', '⑰ the hub reads the machine\'s microphone (GET …/mic): VB-CABLE installed', f0.state);
  const micState = (p) => p.ev(`(() => { const b = document.querySelector('${MIC_BTN}'); if (!b) return null; const w = document.querySelector('${ROAD}'); const d = document.querySelector('${WIN} .desktop-strip-mic-install'); return { shown: !b.hidden, pressed: b.getAttribute('aria-pressed'), dot: !b.querySelector('.desktop-strip-mic-dot').hidden, label: b.textContent, words: w && !w.hidden ? w.textContent : null, door: !!d && !d.hidden, gum: window.__gum, tracks: (window.__micTracks || []).map((t) => t.readyState) }; })()`);
  const grant = (p) => p.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['audioCapture'] }); // the person's answer to Chrome's own prompt — once the stream plays (see the launch line)
  const ungrant = (p) => p.cdp('Browser.resetPermissions', {});
  const press = async (p) => { const at = await p.ev(`(() => { const b = document.querySelector('${MIC_BTN}').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`); await p.click(at[0], at[1]); };
  const p = await page(1280, 800, DESK);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  ok(await playing(p), '⑰ the stream plays');
  const shown = await p.until(`(() => { const b = document.querySelector('${MIC_BTN}'); return !!b && !b.hidden; })()`, 8000);
  const s0 = await micState(p);
  ok(shown && s0.pressed === 'false' && !s0.dot && s0.label.includes('麦克风') && s0.words === null && s0.gum === 0, '⑰ the stream offered the m-line ⇒ 「麦克风」 shows on the strip — OFF (no dot, no words) and the browser was NEVER asked', s0);
  const n0 = MIC.renders().length;
  await sleep(1200);
  ok(MIC.renders().length === n0, '⑰ nothing reaches the machine while it is off (no render started)');
  await p.shot('mic-off.png', `${WIN} .desktop-strip`);
  await grant(p);
  await press(p);
  const live = await p.until(`(() => { const b = document.querySelector('${MIC_BTN}'); return b.getAttribute('aria-pressed') === 'true' && !b.querySelector('.desktop-strip-mic-dot').hidden; })()`, 8000);
  const s1 = await micState(p);
  ok(live && s1.gum === 1 && s1.tracks.length === 1 && s1.tracks[0] === 'live', '⑰ a press asks the browser ONCE (its own prompt — granted) ⇒ live on the PLAYING stream (no renegotiation): aria-pressed and the RED DOT', s1);
  ok(await playing(p), '⑰ …and the picture plays on (the track joined the m-line by replaceTrack)');
  const dot = await p.ev(`(() => { const d = document.querySelector('${MIC_BTN} .desktop-strip-mic-dot'); const s = getComputedStyle(d); return { bg: s.backgroundColor, red: getComputedStyle(document.documentElement).getPropertyValue('--red').trim(), w: d.getBoundingClientRect().width }; })()`);
  ok(/^rgb\((\d+), (\d+), (\d+)\)$/.test(dot.bg) && Number(/^rgb\((\d+)/.exec(dot.bg)[1]) > 150 && Number(/, (\d+),/.exec(dot.bg)[1]) < 120 && dot.w >= 6, `⑰ the dot is red (the theme's --red ${dot.red || '(unset — its fallback)'}: ${dot.bg})`, dot);
  const started = await nodeUntil(() => MIC.renders().length === n0 + 1, 10000);
  const r1 = MIC.renders()[n0] || {};
  ok(started && r1.device === 'cab-in' && r1.speakers === false, '⑰ the machine started ONE render into «CABLE Input» (its id on the helper\'s env)', r1);
  const said = await p.until(`((document.querySelector('${ROAD}') || {}).textContent || '').includes('你的声音 → 本机应用的麦克风『CABLE Output (VB-Audio Virtual Cable)』')`, 8000);
  ok(said && !(await micState(p)).door, '⑰ the strip says where the voice goes: 「你的声音 → 本机应用的麦克风『CABLE Output (VB-Audio Virtual Cable)』」 (no install door)', (await micState(p)).words);
  await p.shot('mic-live.png', `${WIN} .desktop-strip`);
  await sleep(2500);
  await press(p);
  const off = await p.until(`(() => { const b = document.querySelector('${MIC_BTN}'); return b.getAttribute('aria-pressed') === 'false' && b.querySelector('.desktop-strip-mic-dot').hidden; })()`, 5000);
  const s2 = await micState(p);
  ok(off && s2.tracks.every((x) => x === 'ended') && s2.words === null, '⑰ a second press ⇒ OFF: no dot, no words, the browser\'s track STOPPED', s2);
  const closed = await nodeUntil(() => MIC.ended(n0 + 1), MM.MIC_LIMITS.idleMs + 5000);
  const pcm = MIC.binOf(n0 + 1), ratio = REAL_FF ? toneRatio(pcm) : 0, runs = REAL_FF ? [] : pcmPages(pcm);
  if (REAL_FF) ok(closed && pcm.length > 1.5 * 48000 * 4 && ratio > 20, `⑰ the machine's road ended on its own (no packet for ${MM.MIC_LIMITS.idleMs} ms); it got ${(pcm.length / 192000).toFixed(1)} s of PCM carrying Chrome's fake microphone (its 1 kHz tone: ${ratio.toFixed(0)}× the 3 kHz energy)`, { bytes: pcm.length, ratio });
  else { // lane ci-339-reds: no ffmpeg here — the fake decoder's PCM names the Ogg pages it got (the road, not the sound)
    ok(closed && pcm.length > 1.5 * 48000 * 4 && runs.length > 50 && runs.every((r, i) => r.seq === 2 + i && r.frames > 0), `⑰ the machine's road ended on its own (no packet for ${MM.MIC_LIMITS.idleMs} ms); it got ${(pcm.length / 192000).toFixed(1)} s of PCM through the FAKE decoder (no ffmpeg on this box): Chrome's Opus as Ogg pages 2…${runs.length + 1} in order, none lost`, { bytes: pcm.length, runs: runs.length, first: runs.slice(0, 3) });
    console.log('  SKIP ⑰ the 1 kHz tone in the machine\'s PCM: no ffmpeg on this box (its PATH searched) — the fake decoder carries page numbers, not sound; judged where ffmpeg is');
  }
  // a LOCK: the page hidden (a phone's lock, a minimized window) ⇒ off
  await press(p);
  await p.until(`document.querySelector('${MIC_BTN}').getAttribute('aria-pressed') === 'true'`, 8000);
  await p.ev(`Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); true`);
  const locked = await p.until(`document.querySelector('${MIC_BTN}').getAttribute('aria-pressed') === 'false'`, 3000);
  const s3 = await micState(p);
  ok(locked && s3.tracks.every((x) => x === 'ended') && !s3.dot, '⑰ the page hidden (a lock) ⇒ OFF, the track stopped', s3);
  await p.ev(`Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); true`);
  // THE WINDOW closes while live ⇒ the track stops with it
  await press(p);
  await p.until(`document.querySelector('${MIC_BTN}').getAttribute('aria-pressed') === 'true'`, 8000);
  await p.ev('window.__closeAll()'); await sleep(400);
  const s4 = await p.ev('(window.__micTracks || []).map((t) => t.readyState)');
  ok(s4.length === 3 && s4.every((x) => x === 'ended'), '⑰ the window closed while live ⇒ the track stopped with it', s4);
  // A RESTORED window never re-opens it: the page reloaded, the window opened again — the browser is never asked
  await p.cdp('Page.reload', { ignoreCache: true }); await sleep(400); await p.until('typeof window.__open === "function"', 10000);
  const nR = MIC.renders().length;
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  await p.until(`(() => { const b = document.querySelector('${MIC_BTN}'); return !!b && !b.hidden; })()`, 10000); await sleep(1500);
  const s5 = await micState(p);
  ok(s5 && s5.pressed === 'false' && !s5.dot && s5.gum === 0 && MIC.renders().length === nR, '⑰ a restored window starts the microphone OFF — the browser never asked, nothing sent (micStep\'s restore row; the origin STILL holds the permission)', s5);
  await p.ev('window.__closeAll()'); await ungrant(p); await sleep(300);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  ok(await playing(p), '⑰ (the permission reset: the next window plays — see the launch line for why it is held only while a stream plays)');
  // THE SPEAKERS ROAD: no virtual microphone ⇒ said every time it is in force, with the install door
  MIC.setFacts(winFacts({ cable: false })); await micForce();
  await grant(p);
  await press(p);
  const spk = await p.until(`((document.querySelector('${ROAD}') || {}).textContent || '').includes('对方电脑会从扬声器播放你的声音')`, 10000);
  const s6 = await micState(p);
  const r6 = MIC.renders()[MIC.renders().length - 1] || {};
  ok(spk && s6.door && r6.speakers === true && r6.device === null, '⑰ no virtual microphone ⇒ the strip says 「对方电脑会从扬声器播放你的声音」 with 「安装虚拟麦克风…」 beside it; the machine plays it on its speakers', { s6, r6 });
  await p.shot('mic-speakers.png', `${WIN} .desktop-strip`);
  // THE DOOR: 「安装虚拟麦克风…」 opens THE install dialog with the plan the agent's facts give (absent ⇒ VB-CABLE); Install POSTs it with
  // the page's language and the shown plan's digest (the answer stubbed here — the run itself is test-stream-mic-op §8's)
  await p.ev(`document.querySelector('${WIN} .desktop-strip-mic-install').click(); true`);
  const dlg = await p.until(`(() => { const d = document.querySelector('#desktop-install-dialog'); return !!d && /VB-CABLE/.test(d.querySelector('.desktop-install-facts')?.textContent || '') && /VBCABLE_Setup_x64\.exe/.test(d.querySelector('.desktop-install-pre')?.textContent || ''); })()`, 15000);
  const dtext = await p.ev(`document.querySelector('#desktop-install-dialog')?.textContent || ''`);
  ok(dlg && /安装虚拟麦克风/.test(dtext) && /vb-cable\.com/.test(dtext) && /Windows PowerShell/.test(dtext) && /b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb/.test(dtext), '⑰ the door opens THE install dialog: VB-CABLE donationware (vb-cable.com), its pinned SHA-256, the ONE UAC prompt, the commands', dtext.slice(0, 400));
  await p.ev(`(() => { const f = window.fetch; window.__installReq = null; window.fetch = async (u, o) => { if (String(u).startsWith('/api/desktop/install?')) { window.__installReq = { url: String(u), method: o && o.method, body: o && o.body }; return new Response(JSON.stringify({ done: true, what: 'virtual-mic', label: 'VB-CABLE', defaultsKept: true }) + '\\n', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }); } return f(u, o); }; return true; })()`);
  await p.ev(`document.querySelector('#desktop-install-dialog .desktop-install-actions .btn-create').click(); true`);
  const kept = await p.until(`/已保持你原来的默认扬声器和麦克风/.test(document.querySelector('#desktop-install-dialog .desktop-install-note')?.textContent || '')`, 8000);
  const req = await p.ev('window.__installReq');
  let body = null; try { body = JSON.parse(req && req.body); } catch { body = null; }
  ok(kept && req && req.method === 'POST' && /[?&]lang=zh(&|$)/.test(req.url) && body && body.what === 'virtual-mic' && body.host === 'win-a' && typeof body.planDigest === 'string' && body.planDigest.length > 8, '⑰ Install POSTs the shown plan (its digest) with the page\'s language; done ⇒ 「…已保持你原来的默认扬声器和麦克风」', { req, kept });
  await p.ev(`document.querySelector('#desktop-install-dialog .dialog-close')?.click(); document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); true`);
  await press(p);
  ok(MIC.setdefaults().length === 0, '⑰ no default device was ever changed by the stream');
  await ungrant(p);
  await p.close();
  MIC.setFacts(winFacts()); await micForce();
  // RED CONTROL: a toggle whose window close forgets the microphone (dispose without its `close` verdict) leaves the track LIVE
  const pl = await page(1280, 800, DESK, { at: '/micleak' });
  await pl.ev(`window.__open(${JSON.stringify(M)})`);
  await playing(pl);
  await pl.until(`(() => { const b = document.querySelector('${MIC_BTN}'); return !!b && !b.hidden; })()`, 8000);
  await grant(pl);
  await press(pl);
  await pl.until(`document.querySelector('${MIC_BTN}').getAttribute('aria-pressed') === 'true'`, 8000);
  await pl.ev('window.__closeAll()'); await sleep(400);
  const leak = await pl.ev('(window.__micTracks || []).map((t) => t.readyState)');
  ok(leak.length === 1 && leak[0] === 'live', '⑰ RED CONTROL: the toggle without its close verdict leaves the microphone LIVE after the window closed — the row above catches it', leak);
  await pl.ev('(window.__micTracks || []).forEach((t) => t.stop()); true');
  await ungrant(pl);
  await pl.close();
  // a PHONE: the same strip
  const ph = await page(375, 667, PHONE, { touch: true });
  await ph.ev(`window.__open(${JSON.stringify(M)})`);
  ok(await playing(ph), '⑰ phone 375: it plays');
  await ph.until(`(() => { const b = document.querySelector('${MIC_BTN}'); return !!b && !b.hidden; })()`, 8000);
  await ph.ev(`document.querySelector('${MIC_BTN}').scrollIntoView({ inline: 'center', block: 'nearest' }); true`); await sleep(200);
  const pat = await ph.ev(`(() => { const b = document.querySelector('${MIC_BTN}').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2), b.right <= innerWidth + 1 && b.left >= -1]; })()`);
  await grant(ph);
  await ph.tap(pat[0], pat[1]);
  const phLive = await ph.until(`document.querySelector('${MIC_BTN}').getAttribute('aria-pressed') === 'true'`, 8000);
  ok(pat[2] && phLive && (await micState(ph)).dot, '⑰ phone: 「麦克风」 is on the same strip (in view), a tap turns it on — the red dot', pat);
  await ph.shot('phone-mic.png', `${WIN} .desktop-strip`);
  await ungrant(ph);
  await ph.close();
}
console.log('⑱ backlog B-c7d7 (found by lane stream-mic-road, fixed by lane werift-lite-multihomed): a NEW stream while the origin holds the microphone permission PLAYS');
{
  // A check since int339 (it was INFORMATIONAL until the fix lane landed). Measured on base c1aba74c too (the permission alone, no
  // microphone code): Chrome then gathers on every adapter and, before lane werift-lite-multihomed, this ICE-lite agent never
  // connected on a computer with several adapters. The agent's ICE view is printed either way
  const p = await page(1280, 800, DESK);
  await p.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['audioCapture'] });
  const before = new Set((await sessions()).map((x) => x.key));
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const plays = await playing(p);
  await sleep(1500);
  const s = (await sessions()).find((x) => !before.has(x.key)) || null;
  const ice = s && s.stats ? s.stats.ice : null;
  ok(plays, `⑱ B-c7d7: a new stream with the microphone permission held plays (before lane werift-lite-multihomed: never, on a computer with several adapters) — the agent's ICE ${ice ? ice.state : '?'}, the browser's candidates as werift holds them: ${ice ? ice.remotes.length : 0}`, ice ? { state: ice.state, nominated: ice.nominated } : null);
  console.log(`  INFO ⑱ the agent's ICE: state ${ice ? ice.state : '?'}, nominated ${ice && ice.nominated ? `${ice.nominated.local} → ${ice.nominated.remote}` : 'none'}`);
  console.log(`  INFO ⑱ the browser's candidates as werift holds them (${ice ? ice.remotes.length : 0}): ${ice ? ice.remotes.join(' · ') : '?'}`);
  for (const pr of (ice && ice.pairs) || []) console.log(`  INFO ⑱ pair ${pr.local} → ${pr.remote}: ${pr.state}${pr.nominated ? ' NOMINATED' : ''}${pr.remoteNominated ? ' (the browser nominated)' : ''} rx ${pr.rx} tx ${pr.tx}`);
  await p.ev('window.__closeAll()'); await sleep(300);
  await p.cdp('Browser.resetPermissions', {});
  await p.close();
}
console.log('⑲ THE MICROPHONE ALLOWED (lane werift-lite-multihomed): the browser offers every adapter — the stream plays, on the pair the browser chose');
{
  // the browser target's CDP (a permission is the browser's, per origin) — ONE session for the whole leg: Chrome drops a
  // DevTools permission override when the session that set it detaches (measured: a grant from a closed session left the mDNS name)
  const bws = new WebSocket((await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl);
  await new Promise((r) => bws.on('open', r));
  let bseq = 0; const bpend = new Map();
  bws.on('message', (d) => { const x = JSON.parse(d); if (x.id && bpend.has(x.id)) { bpend.get(x.id)(x); bpend.delete(x.id); } });
  const browserCdp = (method, params = {}) => new Promise((r) => { const id = ++bseq; bpend.set(id, r); bws.send(JSON.stringify({ id, method, params })); });
  const ORIGIN = `http://127.0.0.1:${PORT}`;
  // the browser's facts: the host addresses it offered (an mDNS name counted apart), its OWN copy of the offer (a=ice-lite where?),
  // the pair it selected, how often it moved, the DTLS state and every pair's received bytes
  const ICE_FACTS = `(async () => { const pc = (window.__pcs || []).slice(-1)[0]; if (!pc) return null; const r = await pc.getStats(); let sel = null, changes = null, dtls = null; const rows = {};
    r.forEach((x) => { if (x.type === 'transport') { sel = x.selectedCandidatePairId || null; changes = x.selectedCandidatePairChanges; dtls = x.dtlsState; } if (x.type === 'candidate-pair') rows[x.id] = x.bytesReceived || 0; });
    const hosts = [...new Set(pc.__cands.filter((c) => / typ host/.test(c)).map((c) => c.split(' ')[4]))];
    const sdp = (pc.remoteDescription && pc.remoteDescription.sdp) || '', m = sdp.indexOf('\\nm=');
    return { hosts: hosts.filter((a) => !/\\.local$/.test(a)), mdns: hosts.filter((a) => /\\.local$/.test(a)).length, lite: m > 0 && /\\na=ice-lite\\r?\\n/.test(sdp.slice(0, m + 1)), sel, changes, dtls, rows }; })()`;
  const agentLogText = () => { const f = path.join(rootOf(home), 'state', 'agentd.log'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; };
  // the default origin first (no permission — the road every other leg takes): ONE mDNS name (never handed to werift) and a
  // peer-reflexive pair; the same road with the agent as werift alone (BASE_ICE) — the mDNS road as it was, and both times
  const road = async (base) => { if (base) fs.writeFileSync(BASE_ICE, '1'); const d = await page(1280, 800, DESK, { pcs: true }); const t = Date.now(); await d.ev(`window.__open(${JSON.stringify(M)})`); const up = await playing(d); const ms = Date.now() - t; const f = await d.ev(ICE_FACTS); await d.close(); fs.rmSync(BASE_ICE, { force: true }); return { up, ms, f }; };
  const r1 = await road(false), r0 = await road(true);
  ok(r1.up && r0.up && r1.f && r0.f && r1.f.hosts.length === 0 && r1.f.mdns === 1 && r0.f.mdns === 1 && r1.f.lite && !r0.f.lite, `⑲ the default origin (no microphone): the browser offers ONE mDNS name — it plays in ${r1.ms} ms, and in ${r0.ms} ms with the agent as werift alone: the mDNS road as before this lane`, { r1, r0 });
  const moves0 = (agentLogText().match(/the browser moved its pair: [^\n]*/g) || []).length;
  const g = await browserCdp('Browser.grantPermissions', { origin: ORIGIN, permissions: ['audioCapture'] }); // a person who pressed 「麦克风」 once
  const p = await page(1280, 800, DESK, { pcs: true });
  const t0 = Date.now();
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  const up = await playing(p);
  const ms = Date.now() - t0;
  await sleep(1000);
  const f1 = await p.ev(ICE_FACTS);
  await sleep(1500);
  const f2 = await p.ev(ICE_FACTS);
  const grew = Object.entries((f2 && f2.rows) || {}).map(([id, b]) => [id, b - (((f1 && f1.rows) || {})[id] || 0)]);
  const total = grew.reduce((n, [, d]) => n + d, 0), onSel = (grew.find(([id]) => f2 && id === f2.sel) || [null, 0])[1];
  const moves = (agentLogText().match(/the browser moved its pair: [^\n]*/g) || []).slice(moves0);
  const n = f2 ? f2.hosts.length : 0;
  console.log(`    (the browser offered ${n} host address${n === 1 ? '' : 'es'} + ${f2 ? f2.mdns : 0} mDNS name${f2 && f2.mdns === 1 ? '' : 's'}; it selected ${f2 ? f2.changes : '?'} pair${f2 && f2.changes === 1 ? '' : 's'} in turn; the agent followed ${moves.length}×${moves.length ? ': ' + moves.join(' · ') : ''})`);
  ok(!g.error && up && f2 && n >= 1 && f2.mdns === 0 && f2.lite && f2.dtls === 'connected', `⑲ the microphone allowed for this origin: the browser offers every adapter (${n} host address${n === 1 ? '' : 'es'}, no mDNS name) — and the stream PLAYS (${ms} ms); the browser's own copy of the offer says a=ice-lite at the SESSION level`, { g: g.error, up, f2 });
  ok(f2 && f2.sel && total > 0 && onSel >= 0.95 * total, `⑲ THE BROWSER'S CHOICE: the picture arrives on the pair the browser selected (${onSel} of ${total} bytes in 1.5 s)`, { grew, sel: f2 && f2.sel, moves });
  await p.close();
  // RED CONTROL: the agent as werift alone makes it — the same origin, the microphone still allowed
  fs.writeFileSync(BASE_ICE, '1');
  const q = await page(1280, 800, DESK, { pcs: true });
  await q.ev(`window.__open(${JSON.stringify(M)})`);
  const plays = await q.until(`(() => { const v = document.querySelector('${WIN} .stream-video'); return !!v && v.videoWidth === 1280 && v.currentTime > 0.2; })()`, 8000);
  const c = await q.ev(ICE_FACTS);
  const cn = c ? c.hosts.length : 0;
  if (cn >= 2) ok(!plays && c && !c.lite && c.dtls !== 'connected', `⑲ RED CONTROL — the offer as werift writes it (a=ice-lite inside the media sections only: the browser's copy has none) and its first nomination kept: with ${cn} addresses offered the stream stays BLACK for 8 s (DTLS ${c && c.dtls}) — every new stream, before this lane`, { plays, c });
  else console.log(`    (⑲ RED CONTROL not judged: this computer's browser offers ${cn} address — the black stream needs two; the stream ${plays ? 'played' : 'did not play'})`);
  await q.close();
  fs.rmSync(BASE_ICE, { force: true });
  await browserCdp('Browser.resetPermissions', {}); // the origin's default again (one mDNS name — the road every other leg takes)
  bws.close();
}

console.log('⑲ NEVER SILENT before a picture (lane werift-lite-multihomed): ICE that does not connect within the connect budget is said');
{
  fs.writeFileSync(DEAF_ICE, '1'); // the agent answers no check: ICE never connects
  const a = await page(1280, 800, DESK), b = await page(1280, 800, DESK, { at: '/presilent' });
  const t0 = Date.now();
  await Promise.all([a.ev(`window.__open(${JSON.stringify(M)})`), b.ev(`window.__open(${JSON.stringify(M)})`)]);
  const NOTE = `((document.querySelector('${WIN} .desktop-strip-note') || {}).hidden === false ? document.querySelector('${WIN} .desktop-strip-note').textContent : '')`;
  const said = await a.until(`/^串流中断：没能及时连上——正在重新连接…$/.test(${NOTE})`, 25000);
  const ms = Date.now() - t0;
  const sa = await stripText(a), sb = await stripText(b), nb = await b.ev(NOTE);
  ok(said && ms >= 14000 && /连接中/.test(sa.chip || '') && !(await a.ev(`!!document.querySelector('${WIN} .stream-video') && document.querySelector('${WIN} .stream-video').currentTime > 0`)), `⑲ an agent that answers no check: at the connect budget (${ms} ms) the strip says 「串流中断：没能及时连上——正在重新连接…」 (leg ⑥'s words; the view asks an ICE restart), still connecting, no picture`, { said, ms, sa });
  ok(!nb && /连接中/.test(sb.chip || ''), '⑲ RED CONTROL: the window before this lane says only 「串流 · 连接中…」 at that same moment — nothing about why (it spoke at the 45 s fallback)', { nb, sb });
  await a.close(); await b.close();
  fs.rmSync(DEAF_ICE, { force: true });
}
console.log('⑳ THE SOUND 「声音」 (lane speaker-passthrough-v1): the machine\'s sound beside its picture, in the same <video>');
{
  console.log(SOUND_FAKE ? '    (the machine\'s encoder is the FAKE — no ffmpeg with libopus here: it sends the committed −20 dBFS tone)' : '    (the machine\'s encoder is this box\'s ffmpeg)');
  const STM = require(path.join(REPO, 'src/stream-model.js'));
  const SND_BTN = `${WIN} .desktop-strip-sound`, TAP = `${WIN} .desktop-strip-sound-tap`;
  const nodeUntil = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(60); } return false; };
  const soundState = (p) => p.ev(`(async () => { const b = document.querySelector('${SND_BTN}'); if (!b) return null; const v = document.querySelector('${WIN} .stream-video'); const t = document.querySelector('${TAP}');
    const w = [...window.__app.wm.windows.values()].find((x) => x._streamView); const sv = w && w._streamView; const ms = v && v.srcObject; const pc = (window.__pcs || []).slice(-1)[0]; let rob = null, dirs = null;
    if (pc) { const r = await pc.getStats(); rob = { audio: 0, video: 0 }; r.forEach((x) => { if (x.type === 'remote-outbound-rtp') rob[x.kind] = (rob[x.kind] || 0) + 1; }); const a = (s) => { const m = /m=audio[\\s\\S]*?(?=\\r?\\nm=|$)/.exec(s || ''); return m ? (/a=(sendrecv|sendonly|recvonly|inactive)/.exec(m[0]) || [])[1] || null : null; }; dirs = { offer: a(pc.remoteDescription && pc.remoteDescription.sdp), answer: a(pc.localDescription && pc.localDescription.sdp) }; }
    return { shown: !b.hidden, pressed: b.getAttribute('aria-pressed'), label: b.textContent, title: b.title, tap: !!t && !t.hidden, tapText: t ? t.textContent : null, muted: v ? v.muted : null, audioTracks: ms ? ms.getAudioTracks().length : 0, videoTracks: ms ? ms.getVideoTracks().length : 0,
      page: sv && sv.stats() ? sv.stats().audio : null, agent: sv && sv.agent() ? { audio: sv.agent().audio, bwe: sv.agent().bweKbps } : null, rob, dirs, mem: localStorage.getItem('vibespace.streamSound') }; })()`);
  const pressAt = async (p, sel) => { await p.ev(`document.querySelector('${sel}').scrollIntoView({ inline: 'center', block: 'nearest' }); true`); const at = await p.ev(`(() => { const b = document.querySelector('${sel}').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`); await p.click(at[0], at[1]); };
  const runs = () => MIC.loopbacks().length;
  const p = await page(1280, 800, DESK, { pcs: true });
  await p.ev(`localStorage.removeItem('vibespace.streamSound'); true`);
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  ok(await playing(p), '⑳ the stream plays');
  await p.until(`(() => { const b = document.querySelector('${SND_BTN}'); return !!b && !b.hidden; })()`, 8000);
  const r0 = runs(); await sleep(1500);
  const s0 = await soundState(p);
  ok(s0 && s0.shown && s0.pressed === 'false' && s0.label.includes('声音') && !s0.tap && s0.muted === true && s0.audioTracks === 1 && s0.videoTracks === 1 && /不录制、不保存/.test(s0.title) && runs() === r0 && !(s0.page && s0.page.packets), '⑳ the stream carries the sound\'s track IN the picture\'s MediaStream (one <video>: 1 video + 1 audio track); 「声音」 shows OFF, its title says nothing is recorded or stored; the <video> muted; NOTHING runs on the machine (no loopback) and no packet comes', s0);
  await p.shot('sound-off.png', `${WIN} .desktop-strip`);
  await pressAt(p, SND_BTN);
  const on = await p.until(`(() => { const b = document.querySelector('${SND_BTN}'); const v = document.querySelector('${WIN} .stream-video'); return b.getAttribute('aria-pressed') === 'true' && b.classList.contains('is-on') && v && v.muted === false; })()`, 10000);
  const lb = MIC.loopbacks()[r0] || {};
  ok(on && runs() === r0 + 1 && JSON.stringify(lb.argv) === '["loopback"]', '⑳ the press ⇒ the <video> unmuted IN that click + ONE loopback on the machine (its argv the verb alone)', { on, lb });
  const heard = await p.until(`(async () => { const w = [...window.__app.wm.windows.values()].find((x) => x._streamView); const a = w && w._streamView.stats() && w._streamView.stats().audio; return !!a && a.packets > 60 && a.level > 0.02; })()`, 10000);
  const s1 = await soundState(p);
  ok(heard && s1.page.kbps > 20, `⑳ Chrome receives the machine's Opus and HEARS it: ${s1.page && s1.page.packets} packets, audio level ${s1.page && s1.page.level} (the −20 dBFS tone), ${s1.page && s1.page.kbps} kbps`, s1.page);
  const sr = await p.until(`(async () => { const pc = (window.__pcs || []).slice(-1)[0]; if (!pc) return false; const r = await pc.getStats(); let a = 0, v = 0; r.forEach((x) => { if (x.type === 'remote-outbound-rtp') { if (x.kind === 'audio') a++; else if (x.kind === 'video') v++; } }); return a > 0 && v > 0; })()`, 8000);
  ok(sr && s1.dirs && s1.dirs.offer === 'sendrecv', '⑳ Chrome holds the agent\'s RTCP sender reports for BOTH tracks (remote-outbound-rtp audio + video) — the lip-sync of one MediaStream rides them', s1.rob);
  const rate = await p.until(`(() => { const w = [...window.__app.wm.windows.values()].find((x) => x._streamView); const a = w && w._streamView.agent(); return !!a && a.bweKbps != null && a.audio && a.audio.videoKbps != null; })()`, 12000);
  const ag = (await soundState(p)).agent;
  const want = ag && ag.bwe != null ? STM.videoKbpsOf({ kbps: ag.bwe, maxKbps: STM.STREAM_LIMITS.maxKbpsDefault, audio: true, audioKbps: 80 }) : null;
  ok(rate && ag.audio.videoKbps === want && ag.audio.videoKbps <= ag.bwe && (ag.bwe - 80 < STM.STREAM_LIMITS.maxKbpsMin || ag.audio.videoKbps === Math.min(STM.STREAM_LIMITS.maxKbpsDefault, ag.bwe) - 80), `⑳ THE RATE: the agent tells the picture its estimate less the sound's 80 kbps — never more than the estimate, never under the floor because of the sound (estimate ${ag && ag.bwe} ⇒ ${ag && ag.audio && ag.audio.videoKbps})`, ag);
  ok(s1.mem === '{"win-a":true}' && s1.agent && s1.agent.audio && s1.agent.audio.state === 'live' && s1.agent.audio.road === 'loopback', '⑳ ON is remembered for THIS machine; the machine\'s numbers say live on the loopback road', { mem: s1.mem, audio: s1.agent && s1.agent.audio });
  await p.shot('sound-on.png', `${WIN} .desktop-strip`);
  await pressAt(p, SND_BTN);
  const offed = await p.until(`(() => { const b = document.querySelector('${SND_BTN}'); const v = document.querySelector('${WIN} .stream-video'); return b.getAttribute('aria-pressed') === 'false' && v.muted === true; })()`, 6000);
  const ended = await nodeUntil(() => MIC.loopbackEnded(r0 + 1), 5000);
  const pk1 = (await soundState(p)).page.packets; await sleep(1500); const pk2 = (await soundState(p)).page.packets;
  ok(offed && ended && pk2 - pk1 <= 5 && (await soundState(p)).mem === '{}', `⑳ the second press ⇒ muted, the machine's capture ENDED (its helper's stdin closed), no more packets (${pk2 - pk1}); remembered OFF`);
  // ON is remembered per machine: a NEW window of the machine (this page had the person's clicks) starts with its sound ON
  await pressAt(p, SND_BTN); await p.until(`document.querySelector('${SND_BTN}').getAttribute('aria-pressed') === 'true'`, 8000);
  await p.ev('window.__closeAll()'); await sleep(500);
  const r1 = runs();
  await p.ev(`window.__open(${JSON.stringify(M)})`);
  await playing(p);
  const again = await p.until(`(() => { const b = document.querySelector('${SND_BTN}'); const v = document.querySelector('${WIN} .stream-video'); return !!b && b.getAttribute('aria-pressed') === 'true' && v && v.muted === false; })()`, 10000);
  const flowing = await p.until(`(() => { const w = [...window.__app.wm.windows.values()].find((x) => x._streamView); const a = w && w._streamView.stats() && w._streamView.stats().audio; return !!a && a.packets > 20; })()`, 10000);
  ok(again && await nodeUntil(() => runs() === r1 + 1, 5000) && flowing, '⑳ remembered per machine: a NEW window of the same machine starts with its sound ON (no press — the page has the person\'s gesture) and the sound arrives', { again, flowing, st: await soundState(p) });
  // MICROPHONE + SOUND: ONE m-line, sendrecv — both roads live
  const grant = (q) => q.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['audioCapture'] });
  const nR = MIC.renders().length;
  await grant(p);
  await pressAt(p, `${WIN} .desktop-strip-mic`);
  const both = await p.until(`document.querySelector('${WIN} .desktop-strip-mic').getAttribute('aria-pressed') === 'true'`, 8000);
  const voice = await nodeUntil(() => MIC.renders().length === nR + 1, 10000);
  const pkA = ((await soundState(p)).page || {}).packets || 0; await sleep(1200);
  const s2 = await soundState(p);
  ok(both && voice && s2.dirs && s2.dirs.offer === 'sendrecv' && s2.dirs.answer === 'sendrecv' && s2.page && s2.page.packets > pkA + 30 && s2.pressed === 'true', '⑳ 「麦克风」 + 「声音」 together: ONE audio m-line, sendrecv both ways — the viewer\'s voice reaches the machine (a render started) while the machine\'s sound keeps arriving', { dirs: s2.dirs, voice, packets: [pkA, s2.page.packets] });
  await pressAt(p, `${WIN} .desktop-strip-mic`);
  await p.cdp('Browser.resetPermissions', {});
  await p.close();
  // A RESTORED window (a layout replay) never unmutes by itself — even on a page that had the person's gesture
  const restoredCase = async (at) => {
    const q = await page(1280, 800, DESK, { at, pcs: true });
    await q.click(5, 5); // the person's gesture on this page (sticky activation): only `restored` holds the sound back
    const rr = runs();
    await q.ev(`window.__open(${JSON.stringify(M)}, { syncId: 'w-restored' })`);
    const up = await playing(q);
    await q.until(`(() => { const b = document.querySelector('${SND_BTN}'); return !!b && !b.hidden; })()`, 8000); await sleep(1500);
    return { q, up, st: await soundState(q), started: runs() - rr };
  };
  const R = await restoredCase('/');
  ok(R.up && R.st.mem === '{"win-a":true}' && R.st.tap && R.st.tapText === '点一下开声音' && R.st.pressed === 'false' && R.st.muted === true && R.started === 0, '⑳ a RESTORED window of a machine whose sound is remembered ON: 「点一下开声音」, the <video> muted, NOTHING captured on the machine', { st: R.st, started: R.started });
  await R.q.shot('sound-tap.png', `${WIN} .desktop-strip`);
  const rr2 = runs();
  await pressAt(R.q, TAP);
  const tapped = await R.q.until(`(() => { const b = document.querySelector('${SND_BTN}'); const v = document.querySelector('${WIN} .stream-video'); const t = document.querySelector('${TAP}'); return b.getAttribute('aria-pressed') === 'true' && v.muted === false && t.hidden; })()`, 8000);
  ok(tapped && await nodeUntil(() => runs() === rr2 + 1, 5000), '⑳ a tap on 「点一下开声音」 ⇒ on: unmuted, ONE loopback on the machine');
  await R.q.close();
  const B = await restoredCase('/soundrestore');
  ok(B.up && B.started === 1 && B.st.pressed === 'true' && B.st.muted === false, '⑳ RED CONTROL: a toggle that ignores `restored` unmutes the restored window and starts the machine\'s capture BY ITSELF — the row above catches it', { st: B.st, started: B.started });
  await B.q.close();
  // a PHONE: the same strip
  const ph = await page(375, 667, PHONE, { touch: true });
  await ph.ev(`localStorage.removeItem('vibespace.streamSound'); true`);
  await ph.ev(`window.__open(${JSON.stringify(M)})`);
  ok(await playing(ph), '⑳ phone 375: it plays');
  await ph.until(`(() => { const b = document.querySelector('${SND_BTN}'); return !!b && !b.hidden; })()`, 8000);
  await ph.ev(`document.querySelector('${SND_BTN}').scrollIntoView({ inline: 'center', block: 'nearest' }); true`); await sleep(200);
  const pat = await ph.ev(`(() => { const b = document.querySelector('${SND_BTN}').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2), b.right <= innerWidth + 1 && b.left >= -1]; })()`);
  await ph.tap(pat[0], pat[1]);
  const phOn = await ph.until(`(() => { const b = document.querySelector('${SND_BTN}'); const v = document.querySelector('${WIN} .stream-video'); return b.getAttribute('aria-pressed') === 'true' && v.muted === false; })()`, 8000);
  ok(pat[2] && phOn, '⑳ phone: 「声音」 is on the same strip (in view); a tap turns it on, unmuted', pat);
  await ph.shot('phone-sound.png', `${WIN} .desktop-strip`);
  await ph.ev(`localStorage.removeItem('vibespace.streamSound'); true`);
  await ph.close();
}
ok((await sessions()).length === 0, 'every window closed ⇒ no stream session left on the hub');
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
