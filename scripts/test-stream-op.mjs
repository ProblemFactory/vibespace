#!/usr/bin/env node
// THE STREAM OPS against REAL daemons (design q-041 r2 §2/§3 P1 + P1b, lane stream-p1a-transport) — the THREE-TOUCH rule,
// test-sysinfo-op's shape: the handlers in src/agentd/agentd.js (src/agentd/stream-host.js — werift; src/input-inject.js —
// THE injector), the capabilities in the hello-ack, the client's gated methods + its push branch (src/agentd/client.js).
// A werift peer in THIS process stands in for the browser (the page in Chrome is test-desktop-webrtc-chrome).
//   §1 the real bundle on this box: the offer is ICE-LITE with host candidates only (no STUN / TURN server is ever asked);
//      its candidates reach the watcher as `stream-ice` pushes (null = the last); the stand-in answers and the pictures that
//      arrive are THE fixture's access units, byte for byte, in order from its first key frame
//   §2 input: the data channel's events reach THE injector (the Linux stub's record) — a key, a press, the clipboard;
//      garbage refused by name; the `input-events` op feeds the SAME injector
//   §3 stream-stats: the reply (fps, frames) and the once-a-second push
//   §4 RE-ARM: the link dies — the media keeps flowing (it never rode the link) — the reconnect re-arms the session and its
//      pushes resume on the new link; stream-stop ends it (an `ended` push)
//   §5 THE WINDOWS SHAPE: a bundle copy whose hello and injector say win32 + a fixture powershell.exe on its PATH: the data
//      channel's key reaches THE resident script's stdin as its scan-code line; an elevated window in front ⇒ uipi_blocked
//      reaches the page's numbers by name
//   §6 THE RELAY: the hub's half (src/server/desktop-webrtc.js, relay-only) over the Windows-shaped daemon: the stand-in
//      connects through the hub's UDP port and the daemon's shims (the relay's counters move, the pictures arrive)
//   §7 THE CAPABILITY GATE: a copy without stream-offer / input-events is never asked (host_needs_daemon, NO request) —
//      CONTROL: asked past the gate it answers nothing (the request times out)
//   §8 THE SCREEN SOURCE (lane stream-p1b-screen): a Windows-shaped daemon whose ffmpeg.exe and PowerShell facts are fakes
//      (scripts/fixtures/stream/screen-fakes.mjs): stream-facts; the HDR primary's MAPPED road plays THE fixture byte for
//      byte; THE COLOUR GATE through the real daemon (the owner's FP16 calibration frame → the worker's mapping → the NV12
//      the encoder got: every patch ±1); the ffmpegs ran the plan's argvs; a PLI answered by the next key; capture /
//      encoder death and an unplugged display end the session BY NAME; an SDR primary = the direct road; x264 only = said;
//      no ffmpeg = no_ffmpeg naming where it looked; lane desktop-display-modes: the offer names the display streamed + the
//      machine's displays (their own names — the switcher's rows on Windows too), a display picked = that display's offer, and
//      THE PER-MACHINE CAP: two displays ⇒ three live streams (one per display + one), the fourth refused too_many_streams with
//      its count (live 3, cap 3, displays 2); a capture that dies at START (8007000e) is asked again twice before the session ends;
//      commit 2: an HDR display offered with `share: 2` (②) is mapped at every 2nd pixel (the encoder gets half the size, `scaled`)
//   §9 THE RATE on the screen road (lane stream-mac-rate — every road's rule, src/stream-plan.js rateFollower): an echo restarts
//      nothing; a shortfall that HOLDS 2 s restarts ONLY the encoder, once, at the display's floor (never under it; its first
//      picture a key frame); a quiet 20 s climbs +25 % (the same module in-process, an injected clock, the fake ffmpeg)
//   §2b THE HAND-OVER'S OPS (lane desktop-handover): `desktop-input` with the records the data channel just sent ⇒ THE injector
//      records the SAME command lines (one sink); refused records by index + name; `desktop-grab` ⇒ the fake source's still (a
//      PNG, its IHDR size); an unknown session ⇒ not_found; §7's old copy without desktop-grab / desktop-input is NEVER asked
//   §10 THE UDP LEG (lane stream-relay-udp): a daemon that DIALS this hub (Transport B) through a link stand-in that carries
//      2 Mbps (the owner's link delivered 1.3); a padded fixture at 30 fps / 8 Mbps; relay-only. The daemon's own UDP leg
//      carries every picture for 10 s with 0 RTP gaps and no growing lag; a forged PING and a stray DATA mid-run are dropped
//      and counted, the leg's address unchanged; its PINGs are answered (the keepalive) — RED CONTROL: the device-link path
//      alone (udpLeg: false) through the same link drops below 10 fps (the ratio pinned). A hub that never answers the leg ⇒
//      the device link from the first picture, the leg DOWN (no_echo) ≤ 2 s after the offer; answered again ⇒ the leg comes
//      back UP and carries it; silenced mid-run ⇒ the device link takes over within 2 s + 2 s and the pictures keep coming
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, scratchHome, endDaemonsOf } from './scratch.mjs';
import { writeFakeFfmpeg, factsLine, calibrationFrame, rgbAt } from './fixtures/stream/screen-fakes.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(50); } return false; };
const SM = require(path.join(REPO, 'src/stream-model.js'));
const H = require(path.join(REPO, 'src/stream-h264.js'));
const SP = require(path.join(REPO, 'src/stream-plan.js'));
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const w = require(path.join(REPO, 'node_modules/werift'));
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const FIXTURE = path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264');
const AUS = H.accessUnits(H.splitNalus(fs.readFileSync(FIXTURE)));
const homes = [scratchHome('sop-home', fs, ['.vibespace']), scratchHome('sop-win', fs, ['.vibespace', '.local/bin']), scratchHome('sop-old', fs, ['.vibespace'])];
const [home, homeWin, homeOld] = homes;
const copyDir = scratch('sop-bundle'); fs.mkdirSync(copyDir, { recursive: true });
const rootOf = (h) => path.join(h, 'agentd-root');
const devices = [], peers = [];
const cleanup = () => { for (const p of peers) { try { p.close(); } catch { } } for (const d of devices) { try { d.stop(); } catch { } } for (const h of homes) endDaemonsOf(rootOf(h)); for (const d of [...homes, copyDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);
function deviceOn(h, bundlePath = BUNDLE, env = {}) {
  process.env.HOME = h; process.env.VIBESPACE_AGENTD_ROOT = rootOf(h);
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const dataDir = path.join(h, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  const dm = new DeviceManager({ dataDir, bundlePath, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  devices.push(dm);
  return dm;
}
/** The browser's stand-in: a FULL ICE agent (the daemon is lite). Its STUN server is a dead loopback port — never a public one. */
function standIn() {
  const pc = new w.RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:9' }], iceStunGatherTimeout: 0.2, iceUseIpv6: false, codecs: { video: [new w.RTCRtpCodecParameters({ mimeType: SM.STREAM_CODEC.mimeType, clockRate: SM.STREAM_CODEC.clockRate, rtcpFeedback: SM.STREAM_CODEC.rtcpFeedback.map((f) => ({ ...f })), parameters: SM.STREAM_CODEC.fmtp })] } });
  peers.push(pc);
  const got = { rtp: [], dc: null };
  pc.onTrack.subscribe((t) => t.onReceiveRtp.subscribe((r) => { got.ssrc = r.header.ssrc; got.rtp.push({ ts: r.header.timestamp, marker: r.header.marker, payload: Buffer.from(r.payload), at: Date.now() }); }));
  pc.onDataChannel.subscribe((ch) => { got.dc = ch; });
  return { pc, got };
}
/** Received RTP → whole pictures (a marker closes one), depacketized. */
function pictures(rtp) {
  const out = []; let cur = [];
  for (const p of rtp) { cur.push(p.payload); if (p.marker) { out.push(H.depacketize(cur)); cur = []; } }
  return out;
}
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const CAP_LIST = /capabilities: \[([^\]]*)\]/;
const capsOf = (txt) => { const m = CAP_LIST.exec(txt); return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : null; };
ok(capsOf(bundleText).includes('"stream-offer"') && capsOf(bundleText).includes('"input-events"') && /stream-offer-result/.test(bundleText) && /function createStreamHost\(/.test(bundleText) && /function createInjector\(/.test(bundleText) && /RTCPeerConnection = class extends/.test(bundleText), 'data/bin/vibespace-agentd.js names both capabilities, answers stream-offer-result and bundles the stream host, THE injector and werift (run `npm run build:agentd` after a change)');

console.log('§1 the real daemon streams THE fixture');
const stub = path.join(home, 'input-stub.jsonl');
const dm = deviceOn(home, BUNDLE, { VIBESPACE_INPUT_STUB_FILE: stub });
const conn = await dm.connect();
delete process.env.VIBESPACE_INPUT_STUB_FILE;
ok(conn.info.capabilities.includes('stream-offer') && conn.info.capabilities.includes('input-events'), 'the hello-ack names stream-offer and input-events');
const pushes = [];
const b1 = standIn();
const off = await dm.streamOffer({ sourceKind: 'fake', sourceId: FIXTURE }, { onPush: (m) => { pushes.push(m); if (m.op === 'stream-ice' && m.candidate) b1.pc.addIceCandidate(m.candidate).catch(() => { }); } });
const sdp = (off.offer && off.offer.sdp) || '';
const candLines = sdp.split(/\r?\n/).filter((l) => l.startsWith('a=candidate:'));
ok(off.ok && /^s[a-z0-9]+$/.test(off.sid) && off.source.kind === 'fake' && /a=ice-lite/.test(sdp) && candLines.length > 0 && candLines.every((l) => / typ host /.test(l)) && /a=group:BUNDLE 0 1/.test(sdp) && /profile-level-id=42e01f/.test(sdp) && /packetization-mode=1/.test(sdp), `the offer: ICE-lite, BUNDLE, H.264 42e01f mode 1, ${candLines.length} host candidates and NOTHING server-reflexive (no STUN server asked)`, { code: off.code, cands: candLines.slice(0, 3) });
await b1.pc.setRemoteDescription(off.offer);
await b1.pc.setLocalDescription(await b1.pc.createAnswer());
const ans = await dm.streamAnswer(off.sid, { answer: { type: 'answer', sdp: b1.pc.localDescription.sdp } });
const t0 = Date.now();
const flowing = await until(() => pictures(b1.got.rtp).length >= 45, 10000);
const pics = pictures(b1.got.rtp);
const firstMs = b1.got.rtp.length ? b1.got.rtp[0].at - t0 : null;
const matches = pics.slice(0, 45).filter((p, i) => p.length === AUS[i].nalus.length && p.every((n, k) => Buffer.compare(n, AUS[i].nalus[k]) === 0)).length;
ok(ans.ok && flowing && matches === 45, `the answer applied; the first packet ${firstMs} ms later; the first 45 pictures are THE fixture's access units 0–44 byte for byte (key frame first)`, { ans, n: pics.length, matches });
const ice = pushes.filter((m) => m.op === 'stream-ice');
ok(ice.length >= 2 && ice[ice.length - 1].candidate === null && ice.slice(0, -1).every((m) => / typ host /.test(m.candidate.candidate)), `the candidates reached the watcher as ${ice.length} stream-ice pushes, the last null (the client's push branch)`, ice.map((m) => m.candidate && m.candidate.candidate).slice(0, 4));

console.log('§2 input through the data channel and the op');
{
  await until(() => b1.got.dc && b1.got.dc.readyState === 'open', 5000);
  const dc = b1.got.dc;
  for (const e of [{ t: 'kd', c: 'KeyA' }, { t: 'ku', c: 'KeyA' }, { t: 'md', x: 640, y: 360, b: 0 }, { t: 'mu', x: 640, y: 360, b: 0 }, { t: 'clip', text: 'hé' }, { t: 'wh', x: 1, y: 2, dx: 0, dy: -120 }]) dc.send(JSON.stringify(e));
  dc.send('not json');
  dc.send(JSON.stringify({ t: 'kd', c: 'Pause' }));
  const cmds = () => (fs.existsSync(stub) ? fs.readFileSync(stub, 'utf8').trim().split('\n').map((l) => JSON.parse(l).cmd) : []);
  await until(() => cmds().length >= 8, 5000);
  ok(JSON.stringify(cmds().slice(0, 8)) === JSON.stringify(['K 30 0 0', 'K 30 0 1', 'M 640 360', 'D 0', 'M 640 360', 'U 0', 'C aADpAA==', 'M 1 2']), 'the data channel\'s key, press and clipboard reached THE injector in order (the Linux stub\'s record: scan codes, absolute moves, base64 UTF-16LE text)', cmds());
  const st = await dm.streamStats(off.sid);
  ok(st.ok && st.stats.input.n >= 6 && st.stats.input.refused && st.stats.input.refused.code === 'unmapped_key', 'the session counts the events and names the last refusal (unmapped_key — the garbage before it was not_json)', st.stats.input);
  const op = await dm.inputEvents([{ t: 'kd', c: 'KeyB' }, { t: 'zz' }, { t: 'mv', x: 99999, y: 0 }]);
  ok(op.kind === 'stub' && op.n === 1 && JSON.stringify(op.refused.map((r) => [r.i, r.code])) === '[[1,"unknown_kind"],[2,"bad_x"]]' && cmds().includes('K 48 0 0'), 'the input-events op feeds the SAME injector (KeyB 0x30 recorded) and refuses the rest by index + name', op);
}

console.log('§2b the hand-over\'s ops: desktop-input into the SAME sink, desktop-grab');
{
  const cmds = () => (fs.existsSync(stub) ? fs.readFileSync(stub, 'utf8').trim().split('\n').map((l) => JSON.parse(l).cmd) : []);
  ok(conn.info.capabilities.includes('desktop-grab') && conn.info.capabilities.includes('desktop-input'), 'the hello-ack names desktop-grab and desktop-input');
  const before = cmds().length;
  const recs = [{ t: 'kd', c: 'KeyA' }, { t: 'ku', c: 'KeyA' }, { t: 'md', x: 640, y: 360, b: 0 }, { t: 'mu', x: 640, y: 360, b: 0 }, { t: 'clip', text: 'hé' }, { t: 'wh', x: 1, y: 2, dx: 0, dy: -120 }];
  const r = await dm.desktopInput(off.sid, recs);
  await until(() => cmds().length >= before + 8, 5000);
  ok(r.ok && r.n === 6 && JSON.stringify(cmds().slice(before, before + 8)) === JSON.stringify(cmds().slice(0, 8)), 'desktop-input with the records §2\'s data channel sent ⇒ THE injector recorded the SAME 8 command lines (one sink: the session\'s onInput)', { r, op: cmds().slice(before, before + 8) });
  const bad = await dm.desktopInput(off.sid, [{ t: 'ack', f: 1 }, { t: 'kd', c: 'Pause' }, { t: 'kd', c: 'KeyC' }]);
  ok(!bad.ok && JSON.stringify(bad.refused) === JSON.stringify([{ i: 0, code: 'not_an_act' }, { i: 1, code: 'unmapped_key' }]) && bad.n === 1, 'refused records by index + name (an ack is the page\'s; a key the table lacks), the rest lands', bad);
  const g = await dm.desktopGrab(off.sid);
  const png = Buffer.from(g.png64 || '', 'base64');
  ok(g.ok && g.w === 1280 && g.h === 720 && png.slice(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1280 && png.readUInt32BE(20) === 720 && g.road === 'fake', 'desktop-grab ⇒ the session\'s still: a 1280×720 PNG (its IHDR) over the device link', { ok: g.ok, w: g.w, h: g.h, bytes: png.length });
  ok((await dm.desktopGrab('snope')).code === 'not_found' && (await dm.desktopInput('snope', [])).code === 'not_found', 'an unknown session ⇒ not_found');
}

console.log('§3 the numbers');
{
  const st = await dm.streamStats(off.sid);
  const before = pushes.filter((m) => m.op === 'stream-stats').length;
  await sleep(2300);
  const after = pushes.filter((m) => m.op === 'stream-stats');
  ok(st.ok && st.state === 'connected' && st.stats.frames > 30 && st.stats.source === 'fake' && st.stats.encodeMs === null, 'stream-stats answers: connected, the frames sent, the source; encode ms null (a pre-encoded source spends none — part B reports it)', st);
  ok(after.length - before >= 2 && after[after.length - 1].stats.fps >= 20 && after[after.length - 1].stats.kbps > 0, `the once-a-second push: ${after.length - before} in 2.3 s, ${after[after.length - 1].stats.fps} fps, ${after[after.length - 1].stats.kbps} kbps`);
}

console.log('§4 a link blip: the media keeps flowing, the session is re-armed');
{
  const rtpAt = b1.got.rtp.length;
  dm._conn.mux.destroy();
  await sleep(400);
  const during = b1.got.rtp.length - rtpAt;
  ok(!dm._conn && during > 20, `the link is down (no connection) and the picture kept flowing over UDP: ${during} packets in 400 ms`);
  const n0 = pushes.length;
  await dm.connect();
  const rearmed = await until(() => pushes.slice(n0).some((m) => m.rearmed), 5000);
  const resumed = await until(() => pushes.slice(n0).filter((m) => m.op === 'stream-stats' && !m.rearmed).length >= 1, 3000);
  ok(rearmed && resumed, 'the reconnect re-armed it (stream-stats watch → this link owns its pushes) and the once-a-second pushes resumed', pushes.slice(n0).map((m) => m.op + (m.rearmed ? ':rearmed' : '')));
  const stop = await dm.streamStop(off.sid);
  const again = await dm.streamStats(off.sid);
  ok(stop.stopped && again.ok === false && again.code === 'not_found', 'stream-stop ends it; the session is gone (not_found)');
  b1.pc.close();
  dm.stop(); endDaemonsOf(rootOf(home));
}

console.log('§5 the Windows shape: THE resident script\'s protocol');
const HELLO = /(op: "hello-ack",[\s\S]{0,200}?)platform: process\.platform,/;
const INJ = /(createInjector\(\{\s*)platform: process\.platform,/;
const winText = bundleText.replace(HELLO, '$1platform: "win32",').replace(INJ, '$1platform: "win32",');
ok(winText !== bundleText && (winText.match(/platform: "win32"/g) || []).length === 2, 'the copy says win32 twice: the hello-ack and THE injector (found by content)');
const winBundle = path.join(copyDir, 'win', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(winBundle), { recursive: true }); fs.writeFileSync(winBundle, winText);
const psLog = path.join(homeWin, 'ps-lines.txt'), psArgs = path.join(homeWin, 'ps-args.txt'), elevated = path.join(homeWin, 'elevated');
fs.writeFileSync(path.join(homeWin, '.local/bin/powershell.exe'), `#!${process.execPath}
const fs = require('fs'); fs.writeFileSync(${JSON.stringify(psArgs)}, JSON.stringify(process.argv.slice(2)));
process.stdout.write('ready\\r\\n');
let buf = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); fs.appendFileSync(${JSON.stringify(psLog)}, l + '\\n'); process.stdout.write(((l[0] === 'D' || (l[0] === 'K' && l.endsWith(' 0'))) && fs.existsSync(${JSON.stringify(elevated)}) ? 'uipi' : 'ok') + '\\r\\n'); } });
`, { mode: 0o755 });
const dmw = deviceOn(homeWin, winBundle);
const cw = await dmw.connect();
const pushW = [];
const b2 = standIn();
const offW = await dmw.streamOffer({ sourceKind: 'fake', sourceId: FIXTURE }, { onPush: (m) => { pushW.push(m); if (m.op === 'stream-ice' && m.candidate) b2.pc.addIceCandidate(m.candidate).catch(() => { }); } });
await b2.pc.setRemoteDescription(offW.offer);
await b2.pc.setLocalDescription(await b2.pc.createAnswer());
await dmw.streamAnswer(offW.sid, { answer: { type: 'answer', sdp: b2.pc.localDescription.sdp } });
{
  await until(() => b2.got.dc && b2.got.dc.readyState === 'open', 8000);
  b2.got.dc.send(JSON.stringify({ t: 'kd', c: 'ArrowUp' }));
  b2.got.dc.send(JSON.stringify({ t: 'mv', x: 5, y: 6 }));
  const lines = () => (fs.existsSync(psLog) ? fs.readFileSync(psLog, 'utf8').trim().split('\n') : []);
  await until(() => lines().length >= 2, 15000);
  const args = fs.existsSync(psArgs) ? JSON.parse(fs.readFileSync(psArgs, 'utf8')) : [];
  const I = require(path.join(REPO, 'src/input-inject.js'));
  ok(cw.info.platform === 'win32' && JSON.stringify(lines().slice(0, 2)) === JSON.stringify(['K 72 1 0', 'M 5 6']) && Buffer.from(args[args.length - 1] || '', 'base64').toString('utf16le') === I.INPUT_PS, 'the key reached THE resident script\'s stdin as its scan-code line (ArrowUp = 0x48, extended), then the move — the script it runs is INPUT_PS verbatim', { lines: lines(), argc: args.length });
  fs.writeFileSync(elevated, '1');
  b2.got.dc.send(JSON.stringify({ t: 'md', x: 5, y: 6, b: 0 }));
  const named = await until(() => pushW.some((m) => m.op === 'stream-stats' && m.stats && m.stats.input && m.stats.input.refused && m.stats.input.refused.code === 'uipi_blocked'), 5000);
  ok(named && lines().includes('D 0'), 'an elevated window in front: the script answers `uipi` ⇒ uipi_blocked reaches the session\'s pushed numbers at once (the page names it)');
  fs.rmSync(elevated);
  await dmw.streamStop(offW.sid);
  b2.pc.close();
}

console.log('§6 the relay: the hub\'s UDP port ⇄ the device link ⇄ the daemon\'s shims');
{
  const hosts = { get: (h) => (h === 'win-a' ? { id: h, name: 'WIN' } : null), isLocal: (h) => !h || h === 'local', deviceBounded: async (h) => (h === 'win-a' ? dmw : null), connectedDevice: (h) => (h === 'win-a' ? dmw : null) };
  const access = ACC.create({ hosts, install: false, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: FIXTURE }), log: { log() { }, warn() { } } });
  const wr = DW.create({ access, direct: false, udpLeg: false, ips: () => ['127.0.0.1'], log: { log() { }, warn() { } } }); // the device link's half (§10 is the UDP leg)
  const s = await wr.start('win-a');
  const b3 = standIn();
  b3.pc.onIceCandidate.subscribe((c) => { if (c) wr.candidate(s.key, c.toJSON()).catch(() => { }); });
  await b3.pc.setRemoteDescription(s.offer);
  await b3.pc.setLocalDescription(await b3.pc.createAnswer());
  await wr.answer(s.key, b3.pc.localDescription.sdp);
  const up = await until(() => pictures(b3.got.rtp).length >= 20, 10000);
  const p = await wr.poll(s.key, 0, -1, 0);
  ok(s.take && !/ typ host /.test(s.offer.sdp) && up && p.relay && p.relay.up > 0 && p.relay.down > 20 && p.relay.dropped === 0, `relay-only: the offer holds only the hub's candidate; 20 pictures arrived through it (${p.relay && p.relay.up} datagrams up, ${p.relay && p.relay.down} down, none dropped)`, { take: s.take, code: s.code, relay: p.relay });
  await wr.stop(s.key);
  wr.shutdown();
  b3.pc.close();
  dmw.stop(); endDaemonsOf(rootOf(homeWin));
}

console.log('§7 the capability gate');
{
  const OLD_OUT = ['"stream-offer"', '"input-events"', '"desktop-grab"', '"desktop-input"']; // + lane desktop-handover's two ops
  const oldText = bundleText.replace(CAP_LIST, (all, inner) => `capabilities: [${inner.split(',').map((x) => x.trim()).filter((x) => x && !OLD_OUT.includes(x)).join(', ')}]`).replace('if (msg.op === "stream-offer") {', 'if (false) {');
  ok(capsOf(oldText).length === capsOf(bundleText).length - 4 && oldText.includes('if (false) {'), 'the old copy lacks the four capabilities (by content) and its handler');
  const oldBundle = path.join(copyDir, 'old', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(oldBundle), { recursive: true }); fs.writeFileSync(oldBundle, oldText);
  const dmo = deviceOn(homeOld, oldBundle);
  const co = await dmo.connect();
  const sent = [];
  const send0 = dmo._request.bind(dmo);
  dmo._request = (msg) => { sent.push(msg && msg.op); return send0(msg); };
  const e1 = await dmo.streamOffer({ sourceKind: 'fake', sourceId: FIXTURE }).then(() => null, (x) => x);
  const e2 = await dmo.inputEvents([{ t: 'kd', c: 'KeyA' }]).then(() => null, (x) => x);
  const e3 = await dmo.desktopGrab('s1').then(() => null, (x) => x);
  const e4 = await dmo.desktopInput('s1', [{ t: 'kd', c: 'KeyA' }]).then(() => null, (x) => x);
  ok(e1 && e1.code === 'host_needs_daemon' && e1.daemonVersion === co.info.daemonVersion && e2 && e2.code === 'host_needs_daemon' && e3 && e3.code === 'host_needs_daemon' && e4 && e4.code === 'host_needs_daemon' && sent.length === 0, 'an older agent is refused by the capability (host_needs_daemon + its version) — stream-offer, input-events, desktop-grab, desktop-input — and NO request went to it');
  const raw = await send0({ op: 'stream-offer', sid: 'sraw', sourceKind: 'fake', sourceId: FIXTURE, timeoutMs: 1500 }).then((r) => ({ answered: r }), (x) => ({ error: String(x && x.message) }));
  ok(!raw.answered && /time(?:d)? ?out/i.test(raw.error || ''), 'CONTROL: asked past the gate, the old agent answers NOTHING — the request ends on its own timeout (the 2.300.0 rule)', raw);
  dmo.stop(); endDaemonsOf(rootOf(homeOld));
}

console.log('§8 THE SCREEN SOURCE: a Windows-shaped daemon whose ffmpeg and PowerShell facts are fakes');
const homeScr = scratchHome('sop-scr', fs, ['.vibespace', '.local/bin']); homes.push(homeScr);
const binS = path.join(homeScr, '.local/bin');
const SCR = /(createScreen\(\{\s*)platform: process\.platform,/;
const scrText = winText.replace(SCR, '$1platform: "win32",');
ok(scrText !== winText && (scrText.match(/platform: "win32"/g) || []).length === 3 && /mapperServant\(wt\.parentPort\)/.test(scrText) && /stream-facts-result/.test(scrText), 'the copy says win32 three times: the hello-ack, THE injector, THE screen source (found by content); the bundle carries the mapper\'s worker branch and the facts op');
const scrBundle = path.join(copyDir, 'scr', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(scrBundle), { recursive: true }); fs.writeFileSync(scrBundle, scrText);
const D1 = { id: '\\\\.\\DISPLAY1', x: 0, y: 0, w: 1280, h: 720, primary: true, hdr: true, white: SP.CALIBRATION.white, adapter: 0, output: 0 };
const D2 = { id: '\\\\.\\DISPLAY2', x: 1280, y: 0, w: 1280, h: 720, primary: false, hdr: false, white: 1000, adapter: 0, output: 1 };
const factsFile = path.join(homeScr, 'facts.json'), psArgsS = path.join(homeScr, 'ps-args.json');
const setDisplays = (list) => fs.writeFileSync(factsFile, factsLine(list));
setDisplays([D1, D2]);
fs.writeFileSync(path.join(binS, 'powershell.exe'), `#!${process.execPath}
const fs = require('fs'); const a = process.argv.slice(2); const script = Buffer.from(a[a.length - 1] || '', 'base64').toString('utf16le');
if (/'stream-facts'/.test(script)) { fs.writeFileSync(${JSON.stringify(psArgsS)}, JSON.stringify(a)); process.stdout.write(fs.readFileSync(${JSON.stringify(factsFile)}, 'utf8') + '\\r\\n'); process.exit(0); }
process.stdout.write('ready\\r\\n'); process.stdin.on('data', () => process.stdout.write('ok\\r\\n'));
`, { mode: 0o755 });
const cal = calibrationFrame(1280, 720, SP.CALIBRATION.rows);
const rawFile = path.join(homeScr, 'cal.f16'), ffLog = path.join(homeScr, 'ffmpeg.log'), nv12File = path.join(homeScr, 'first.nv12'), dieCap = path.join(homeScr, 'die-capture'), dieEnc = path.join(homeScr, 'die-encoder');
fs.writeFileSync(rawFile, cal.buf);
const FF = writeFakeFfmpeg(binS, { log: ffLog, fixture: FIXTURE, raw: rawFile, nv12: nv12File, dieCapture: dieCap, dieEncoder: dieEnc, version: '7.1', encoders: ['h264_nvenc', 'libx264'] });
const ffRuns = () => (fs.existsSync(ffLog) ? fs.readFileSync(ffLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const dms = deviceOn(homeScr, scrBundle);
const cs = await dms.connect();
ok(cs.info.platform === 'win32' && JSON.stringify(cs.info.capabilities.slice(-10)) === JSON.stringify(['stream-offer', 'input-events', 'stream-facts', 'stream-screen', 'stream-mac', 'stream-window', 'stream-windows', 'settings-open', 'desktop-grab', 'desktop-input']), 'the hello-ack names stream-facts and stream-screen (after stream-offer / input-events; then lane stream-p3m-build\'s stream-mac / stream-window, then lane stream-p2w-build\'s stream-windows — the picker op\'s own word, int304; then lane stream-mac-stall\'s settings-open; then lane desktop-handover\'s desktop-grab / desktop-input)');
/** One screen session with a fresh stand-in: offer → answer. */
async function screenSession(pushArr) {
  const b = standIn();
  const off = await dms.streamOffer({ sourceKind: 'screen' }, { onPush: (m) => { pushArr.push(m); if (m.op === 'stream-ice' && m.candidate) b.pc.addIceCandidate(m.candidate).catch(() => { }); } });
  if (off.ok) { await b.pc.setRemoteDescription(off.offer); await b.pc.setLocalDescription(await b.pc.createAnswer()); await dms.streamAnswer(off.sid, { answer: { type: 'answer', sdp: b.pc.localDescription.sdp } }); }
  return { off, b };
}
const endedOf = (arr) => { const m = arr.find((x) => x.op === 'stream-stats' && x.ended); return m ? m.ended : null; };
{
  const f = await dms.streamFacts();
  const psA = fs.existsSync(psArgsS) ? JSON.parse(fs.readFileSync(psArgsS, 'utf8')) : [];
  ok(f.ok && f.platform === 'win32' && f.ffmpeg && f.ffmpeg.where === 'PATH' && f.ffmpeg.major === 7 && f.ffmpeg.ddagrab && JSON.stringify(f.ffmpeg.encoders) === '["h264_nvenc","libx264"]' && f.displays.length === 2 && f.displays[0].white === 2500 && f.displays[1].output === 1, 'stream-facts: the ffmpeg found on PATH (7.1, ddagrab, NVENC + x264) and both displays (HDR + SDR white 2500; DXGI output 1)', f);
  ok(f.primary && f.primary.mode === 'mapped' && f.primary.encoder === 'NVENC' && f.primary.white === 2500 && Buffer.from(psA[psA.length - 1] || '', 'base64').toString('utf16le') === SP.STREAM_FACTS_PS, 'the primary\'s plan rides the facts (mapped, NVENC, white 2500); the script the agent ran is STREAM_FACTS_PS verbatim', f.primary);
}
{
  const pushS = [];
  const { off, b } = await screenSession(pushS);
  ok(off.ok && off.source.kind === 'screen' && off.source.encoder === 'NVENC' && off.source.mode === 'mapped' && JSON.stringify(off.source.origin) === '{"x":0,"y":0}' && off.source.fps === 30, 'a screen offer: the source is the HDR primary on the mapped road, NVENC, its origin', off.source || off);
  const flowing = await until(() => pictures(b.got.rtp).length >= 40, 12000);
  const pics = pictures(b.got.rtp);
  const k0 = AUS.findIndex((a) => a.key);
  const matches = pics.slice(0, 40).filter((p, i) => { const a = AUS[k0 + i]; return p.length === a.nalus.length && p.every((n, k) => Buffer.compare(n, a.nalus[k]) === 0); }).length;
  ok(flowing && matches === 40, 'the encoder\'s pictures reach the browser byte for byte: THE fixture\'s access units from its first key frame (FLV → access units → RTP, SPS/PPS before the key)', { n: pics.length, matches });
  const nv = fs.existsSync(nv12File) ? fs.readFileSync(nv12File) : null;
  const bad = nv ? cal.patches.map((p) => ({ label: p.label, want: p.srgb, got: rgbAt(nv, 1280, 720, p.x, p.y) })).filter((r) => r.got.some((v, i) => Math.abs(v - r.want[i]) > 1)) : ['no frame'];
  ok(nv && nv.length === 1280 * 720 * 1.5 && bad.length === 0, 'THE COLOUR GATE through the real daemon: the owner\'s FP16 calibration frame → the agent\'s worker mapping → the NV12 its encoder got: all 17 patches within ±1 of what the window drew, the 10× white patch white', bad);
  const runs = ffRuns(), capRun = runs.find((a) => a.some((x) => /^ddagrab=/.test(x))), encRun = runs.find((a) => a.includes('pipe:0'));
  const plan = SP.planScreen({ platform: 'win32', ffmpeg: { path: 'x', major: 7, ddagrab: true, encoders: ['h264_nvenc'] }, displays: [D1] });
  ok(JSON.stringify(capRun) === JSON.stringify(SP.captureArgv(plan)) && JSON.stringify(encRun) === JSON.stringify(SP.encodeArgv(plan)), 'the two ffmpegs ran EXACTLY the plan\'s argvs (FP16 capture → raw bits; NV12 → NVENC → FLV)', { capRun, encRun });
  const st = await dms.streamStats(off.sid);
  const sc = st.stats && st.stats.screen;
  ok(st.ok && sc && sc.mode === 'mapped' && sc.encoder === 'NVENC' && sc.mapper === 'worker' && sc.white === 2500 && typeof sc.encodeMs === 'number' && sc.encodeMs >= 0 && st.stats.encodeMs === sc.encodeMs && sc.captured >= 40 && typeof sc.mapMs === 'number' && sc.keyWaitMs != null, `the numbers: mapped by the worker in ${sc && sc.mapMs} ms, encodeMs ${sc && sc.encodeMs} (capture → access unit), the first key ${sc && sc.keyWaitMs} ms after the ask`, sc);
  // a keyframe request (the browser's PLI) is answered by the next key frame — the GOP bounds it (ffmpeg's CLI cannot force one)
  const before = st.stats.keyRequests, answered = sc.keysAnswered;
  await b.pc.getTransceivers()[0].receiver.sendRtcpPLI(b.got.ssrc);
  const asked = await until(async () => { const s2 = await dms.streamStats(off.sid); return s2.stats.keyRequests > before && s2.stats.screen.keysAnswered > answered; }, 4000);
  const s3 = await dms.streamStats(off.sid);
  ok(answered === 1 && asked && s3.stats.screen.keyWaitMs <= 2500, `a PLI from the browser: counted, and answered by the next key frame ${s3.stats.screen.keyWaitMs} ms later (≤ the 2 s GOP — ffmpeg's CLI cannot force one)`, s3.stats.screen);
  // ffmpeg dies mid-stream ⇒ the session ends BY NAME (the page falls back to the VNC picture on `ended`)
  fs.writeFileSync(dieCap, '1');
  const ended = await until(() => endedOf(pushS), 6000);
  fs.rmSync(dieCap);
  ok(ended && endedOf(pushS) === 'capture_exited' && (await dms.streamStats(off.sid)).code === 'not_found', 'the capture ffmpeg dies (DXGI_ERROR_ACCESS_LOST) ⇒ the session ends as capture_exited, pushed to the watcher; the session is gone', endedOf(pushS));
  b.pc.close();
}
{
  const pushS = [];
  const { off, b } = await screenSession(pushS);
  await until(() => pictures(b.got.rtp).length >= 5, 8000);
  fs.writeFileSync(dieEnc, '1');
  await until(() => endedOf(pushS), 6000);
  fs.rmSync(dieEnc);
  ok(off.ok && endedOf(pushS) === 'encoder_exited', 'the encoder ffmpeg dies ⇒ encoder_exited', endedOf(pushS));
  b.pc.close();
}
{
  const pushS = [];
  const { off, b } = await screenSession(pushS);
  await until(() => pictures(b.got.rtp).length >= 5, 8000);
  setDisplays([{ ...D2, primary: true }]); // the HDR display is unplugged …
  fs.writeFileSync(dieCap, '1'); // … and its capture fails
  await until(() => endedOf(pushS), 8000);
  fs.rmSync(dieCap);
  ok(off.ok && endedOf(pushS) === 'display_gone', 'the display is unplugged under the capture ⇒ the facts are read again and say so: display_gone', endedOf(pushS));
  b.pc.close();
}
{
  // the SDR display is now the primary: the DIRECT road (one ffmpeg; DDA's 8-bit picture is exact)
  const n0 = ffRuns().length;
  const pushS = [];
  const { off, b } = await screenSession(pushS);
  const up = await until(() => pictures(b.got.rtp).length >= 20, 10000);
  const st = await dms.streamStats(off.sid);
  const runs = ffRuns().slice(n0).filter((a) => a.some((x) => /^ddagrab=/.test(x) || x === 'pipe:0'));
  ok(off.ok && off.source.mode === 'direct' && up && st.stats.screen.mode === 'direct' && st.stats.screen.timing === 'in-ffmpeg' && st.stats.screen.encodeMs === null && runs.length === 1 && runs[0].includes('ddagrab=output_idx=1:draw_mouse=0:framerate=30') && !runs[0].join(' ').includes('16bit'), 'an SDR primary: the direct road — ONE ffmpeg (8-bit DDA of output 1, no pointer painted — lane stream-cursor → NVENC), the pictures play, encodeMs null (timed inside ffmpeg)', { src: off.source, runs: runs.map((r) => r.join(' ')) });
  await dms.streamStop(off.sid);
  b.pc.close();
}
{
  // refused by name before anything starts
  setDisplays([D1, D2]);
  FF.set({ encoders: ['libx264'] });
  await dms.streamFacts({ force: true });
  const pushS = [];
  const { off, b } = await screenSession(pushS);
  ok(off.ok && off.source.encoder === 'x264' && (await dms.streamStats(off.sid)).stats.screen.note === 'no_hw_encoder', 'only x264 in the ffmpeg: the software rung is taken and SAID (no_hw_encoder)', off.source);
  await dms.streamStop(off.sid); b.pc.close();
  fs.renameSync(FF.exe, FF.exe + '.away');
  await dms.streamFacts({ force: true });
  const r = await dms.streamOffer({ sourceKind: 'screen' });
  fs.renameSync(FF.exe + '.away', FF.exe);
  ok(r.ok === false && r.code === 'no_ffmpeg' && /PATH/.test(r.error) && /LOCALAPPDATA/.test(r.error) && /vs-probe/.test(r.error), 'no ffmpeg on the machine ⇒ the offer is refused as no_ffmpeg, naming where it looked (the page shows the VNC picture)', r);
}
{
  // lane desktop-display-modes: THE SWITCHER's rows on Windows + THE PER-MACHINE CAP (two displays ⇒ a stream each + one = 3)
  FF.set({ encoders: ['h264_nvenc', 'libx264'] });
  setDisplays([{ ...D1, name: 'Desk 27' }, { ...D2, name: 'Side 32' }]);
  await dms.streamFacts({ force: true });
  const a = await dms.streamOffer({ sourceKind: 'screen' }), b2 = await dms.streamOffer({ sourceKind: 'screen', sourceId: D2.id });
  const rowsOf = (o) => (o.source && o.source.displays ? o.source.displays.map((d) => [d.id, d.name, d.primary, d.hdr, d.x, d.w, d.capturable]) : null);
  const want = [[D1.id, 'Desk 27', true, true, 0, 1280, true], [D2.id, 'Side 32', false, false, 1280, 1280, true]];
  ok(a.ok && a.source.display === D1.id && JSON.stringify(rowsOf(a)) === JSON.stringify(want), 'a Windows screen offer names the display streamed (the primary) and the machine\'s displays — their own names, primary, HDR, geometry, capturable (the strip\'s switcher on Windows too)', a.source || a);
  ok(b2.ok && b2.source.display === D2.id && b2.source.mode === 'direct' && JSON.stringify(rowsOf(b2)) === JSON.stringify(want), 'a display picked = THAT display\'s offer (the SDR one: the direct road), the same rows', b2.source || b2);
  const c3 = await dms.streamOffer({ sourceKind: 'screen' }), d4 = await dms.streamOffer({ sourceKind: 'screen', sourceId: D2.id });
  ok(c3.ok && d4.ok === false && d4.code === 'too_many_streams' && d4.live === 3 && d4.cap === 3 && d4.displays === 2 && /at most 3 — a stream per display \+ one, for its 2 displays/.test(d4.error), 'THE PER-MACHINE CAP: two displays ⇒ three live streams (a window per display + a phone); the fourth is refused too_many_streams, its count named (live 3 · cap 3 · 2 displays)', { c3: c3.ok, d4 });
  for (const o of [a, b2, c3]) if (o.ok) await dms.streamStop(o.sid);
  const again = await dms.streamOffer({ sourceKind: 'screen' });
  ok(again.ok, 'a stream stopped frees its place: the next start is taken', again.code || again.ok);
  if (again.ok) await dms.streamStop(again.sid);
}
{
  // lane desktop-display-modes: a capture that dies at START — the owner box's second display: ddagrab «Failed to create Direct3D
  // device (8007000e)» while the first streamed — is asked again (400 ms, 1.5 s) before the session ends by name
  const FAIL = path.join(homeScr, 'fail-capture');
  FF.set({ failCapture: FAIL });
  fs.writeFileSync(FAIL, '1');
  const pushA = [];
  const a = await screenSession(pushA);
  const plays = await until(() => pictures(a.b.got.rtp).length >= 10, 15000);
  const sa = a.off.ok ? await dms.streamStats(a.off.sid) : {};
  ok(a.off.ok && plays && sa.stats && sa.stats.screen.captureRetries === 1 && fs.readFileSync(FAIL, 'utf8') === '0' && !endedOf(pushA), 'a capture that could not start (8007000e) is asked again once and the stream plays (captureRetries 1)', sa.stats && sa.stats.screen);
  if (a.off.ok) await dms.streamStop(a.off.sid);
  a.b.pc.close();
  fs.writeFileSync(FAIL, '3');
  const pushB = [];
  const r = await screenSession(pushB);
  const ended = await until(() => endedOf(pushB), 12000);
  ok(r.off.ok && ended && endedOf(pushB) === 'capture_exited' && fs.readFileSync(FAIL, 'utf8') === '0', 'one that never starts: asked again twice, then the session ends capture_exited by name (the page shows why)', { ended: endedOf(pushB), left: fs.readFileSync(FAIL, 'utf8') });
  r.b.pc.close();
  FF.set({ failCapture: null });
}
{
  // lane desktop-display-modes commit 2 — ② ON THE HDR ROAD: a 2560×1440 HDR display offered with `share: 2` (two displays in one
  // window) is captured whole and mapped at every 2nd pixel: the encoder gets 1280×720, the offer says `scaled`; alone it is whole
  const D3 = { id: '\\\\.\\DISPLAY3', x: 0, y: 0, w: 2560, h: 1440, primary: true, hdr: true, white: SP.CALIBRATION.white, adapter: 0, output: 0, name: 'Wide 27' };
  const RAW2 = path.join(homeScr, 'wide.f16'); fs.writeFileSync(RAW2, Buffer.alloc(D3.w * D3.h * 8, 0x3c)); // FP16 frames of the wide display
  FF.set({ raw: RAW2 }); setDisplays([D3]); await dms.streamFacts({ force: true });
  const n0 = ffRuns().length;
  const b = standIn();
  const off = await dms.streamOffer({ sourceKind: 'screen', share: 2 }, { onPush: (m) => { if (m.op === 'stream-ice' && m.candidate) b.pc.addIceCandidate(m.candidate).catch(() => { }); } });
  if (off.ok) { await b.pc.setRemoteDescription(off.offer); await b.pc.setLocalDescription(await b.pc.createAnswer()); await dms.streamAnswer(off.sid, { answer: { type: 'answer', sdp: b.pc.localDescription.sdp } }); }
  const flows = await until(() => pictures(b.got.rtp).length >= 10, 15000);
  const st = off.ok ? await dms.streamStats(off.sid) : {};
  const runs = ffRuns().slice(n0), enc = runs.find((a) => a.includes('pipe:0')) || [], cap = runs.find((a) => a.some((x) => /^ddagrab=/.test(x))) || [];
  ok(off.ok && JSON.stringify(off.source.scaled) === JSON.stringify({ share: 2, step: 2, w: 1280, h: 720, from: { w: 2560, h: 1440 } }) && flows && enc[enc.indexOf('-video_size') + 1] === '1280x720' && cap.includes('hwdownload,format=rgbaf16le') && st.stats && st.stats.screen.step === 2 && st.stats.screen.w === 1280, 'shared by 2: the whole FP16 frame captured, mapped at every 2nd pixel — the encoder gets 1280×720, the offer says scaled {share 2, step 2, 1280×720 of 2560×1440}, the pictures flow', { scaled: off.source && off.source.scaled, video: enc[enc.indexOf('-video_size') + 1], step: st.stats && st.stats.screen.step });
  if (off.ok) await dms.streamStop(off.sid);
  b.pc.close();
  const whole = await dms.streamOffer({ sourceKind: 'screen' });
  ok(whole.ok && !whole.source.scaled, 'alone (no share): the whole picture, no `scaled`', whole.source || whole);
  if (whole.ok) await dms.streamStop(whole.sid);
  FF.set({ raw: rawFile }); setDisplays([D1, D2]); // the later sections read the same facts file
}
dms.stop(); endDaemonsOf(rootOf(homeScr));

console.log('§9 THE RATE on the screen road (lane stream-mac-rate): only a HELD shortfall restarts the encoder, never under the display\'s floor (in-process, the fake ffmpeg)');
{
  const SS = require(path.join(REPO, 'src/agentd/stream-screen.js'));
  FF.set({ encoders: ['h264_nvenc', 'libx264'] });
  const { spawn: sp, execFile: ef } = require('child_process');
  let clock = 1e9;
  const n0 = ffRuns().length;
  const scr = SS.createScreen({ platform: 'win32', spawn: sp, execFile: ef, env: { PATH: binS }, lookupEnv: { PATH: binS }, fs, makeWorker: null, now: () => clock });
  const src = await scr.source({}, { maxKbps: 8000 });
  const aus = [];
  src.start((au) => aus.push(au), () => { });
  await until(() => aus.length >= 5, 8000);
  const encs = () => ffRuns().slice(n0).filter((a) => a.includes('pipe:0')), rateOf = (a) => a[a.indexOf('-b:v') + 1];
  const est = (k) => { for (let i = 0; i < 5; i++) src.setTargetKbps(k); }; // 5 = the rule's minSamples
  const more = async (n = 3) => { const k = aus.length; await until(() => aus.length >= k + n, 8000); }; // pictures sent by the injected clock's new time
  est(1); // within 2 s of the start
  const early = { n: encs().length, why: src.stats().rate.why };
  clock += 2100; await more(); est(99999);
  const echo = { n: encs().length, why: src.stats().rate.why };
  clock += 2100; await more(); est(1);
  const held = { n: encs().length, why: src.stats().rate.why };
  clock += 2100; await more(); est(1);
  const k = aus.length;
  await until(() => aus.length >= k + 5, 8000);
  const st1 = src.stats(), runs1 = encs(), afterKey = aus.slice(k).findIndex((a) => a.key);
  ok(early.n === 1 && early.why === 'wait' && echo.n === 1 && echo.why === 'echo' && held.n === 1 && held.why === 'hold', 'within 2 s of the start the estimate waits; an echo (above what was sent) restarts nothing; a shortfall starts a hold — no restart yet', { early, echo, held });
  ok(runs1.length === 2 && rateOf(runs1[1]) === '2500k' && st1.kbps === 2500 && st1.floor === 2500 && st1.restarts === 1 && st1.mapper === 'inline' && afterKey === 0, 'held 2 s ⇒ ONE restart of the encoder alone, at the display\'s FLOOR (1280×720 @ 30 ⇒ 2500k — never the estimate\'s 1), its first picture a key frame', { encs: runs1.length, rate: rateOf(runs1[1] || []), st1: { kbps: st1.kbps, floor: st1.floor, restarts: st1.restarts, rate: st1.rate }, afterKey });
  clock += 6000; await more(); est(1);
  ok(encs().length === 2 && src.stats().kbps === 2500, 'more shortfall: nothing under the floor', { encs: encs().length });
  clock += 21000; await more(); est(99999);
  await until(() => encs().length >= 3, 5000); // the restarted encoder logs its argv as it starts
  const runs2 = encs();
  ok(runs2.length === 3 && rateOf(runs2[2]) === '3100k' && src.stats().kbps === 3100 && src.stats().rate.why === 'recover', 'a quiet 20 s (no shortfall) ⇒ +25 % toward the cap: the encoder restarts at 3100k', { encs: runs2.length, rate: rateOf(runs2[2] || []), st: src.stats().rate });
  src.stop();
  await sleep(200);
}

console.log('§10 THE UDP LEG: the daemon\'s own datagrams to the hub relay — the picture past a slow device link');
{
  const http = await import('node:http'); const net = await import('node:net'); const crypto = await import('node:crypto'); const dgram = await import('node:dgram');
  const { spawn } = await import('node:child_process');
  const { WebSocketServer } = require(path.join(REPO, 'node_modules/ws'));
  const homeLeg = scratchHome('sop-leg', fs, ['.vibespace']); homes.push(homeLeg);
  const rootL = rootOf(homeLeg);
  // the padded fixture: THE fixture's first 200 access units, each grown to 8 Mbps / 30 fps by one filler NAL (type 12 — a decoder skips it)
  const PER = Math.round((8000 * 1000) / 8 / 30), SC = Buffer.from([0, 0, 0, 1]), parts = [];
  for (const au of AUS.slice(0, 200)) {
    const have = au.nalus.reduce((a, n) => a + n.length + 4, 0);
    parts.push(Buffer.from([0, 0, 0, 1, 0x09, 0xf0])); for (const n of au.nalus) parts.push(SC, n);
    const f = Buffer.alloc(Math.max(2, PER - have - 10), 0xff); f[0] = 0x0c; f[f.length - 1] = 0x80; parts.push(SC, f);
  }
  const padded = path.join(homeLeg, 'padded-8mbps.h264'); fs.writeFileSync(padded, Buffer.concat(parts));
  // the daemon DIALS this hub (the server.js Transport B adapter) through a link stand-in carrying CAP kbps daemon → hub
  // (a token bucket; TCP backpressure past 128 KB queued — the link a real network gives the device link)
  const CAP = 2000;
  const version = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
  const inst = path.join(rootL, version); fs.mkdirSync(inst, { recursive: true });
  fs.writeFileSync(path.join(inst, 'agentd.js'), bundleText.replace(HELLO, '$1platform: "win32",'));
  fs.symlinkSync(inst, path.join(rootL, 'current'));
  const stateL = path.join(rootL, 'state'); fs.mkdirSync(stateL, { recursive: true, mode: 0o700 });
  const HT = 'vsht_leg' + crypto.randomBytes(6).toString('hex'), DT = 'vsdt_' + crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(path.join(stateL, 'token'), HT, { mode: 0o600 });
  const wss = new WebSocketServer({ noServer: true }); let linkStream = null;
  const hubHttp = http.createServer((q, r) => { r.writeHead(404); r.end(); });
  hubHttp.on('upgrade', (req, socket, head) => { if (req.headers['x-vibespace-dial-token'] !== DT) { socket.destroy(); return; } wss.handleUpgrade(req, socket, head, (ws) => {
    const Lst = { data: [], close: [], error: [] };
    ws.on('message', (d) => Lst.data.forEach((f) => f(Buffer.isBuffer(d) ? d : Buffer.from(d)))); ws.on('close', () => Lst.close.forEach((f) => f())); ws.on('error', () => Lst.error.forEach((f) => f()));
    linkStream = { write: (d) => { try { ws.send(d); return true; } catch { return false; } }, on: (ev, fn) => { Lst[ev]?.push(fn); }, destroy: () => { try { ws.close(); } catch { } } };
  }); });
  await new Promise((r) => hubHttp.listen(0, '127.0.0.1', r));
  const wsPort = hubHttp.address().port;
  const capped = net.createServer((c) => {
    const u = net.connect(wsPort, '127.0.0.1'); c.setNoDelay(true); u.setNoDelay(true);
    const q = []; let qb = 0, tokens = 0, last = Date.now();
    const t = setInterval(() => {
      const t1 = Date.now(); tokens = Math.min(tokens + ((t1 - last) * CAP) / 8, 16384); last = t1;
      while (q.length && tokens > 0) { let d = q[0]; if (d.length > tokens) { const n = Math.max(1, Math.floor(tokens)); q[0] = d.subarray(n); d = d.subarray(0, n); } else q.shift(); tokens -= d.length; qb -= d.length; u.write(d); }
      if (qb < 32768 && c.isPaused()) c.resume();
    }, 2);
    c.on('data', (d) => { q.push(d); qb += d.length; if (qb > 131072) c.pause(); });
    u.on('data', (d) => c.write(d)); c.on('close', () => { clearInterval(t); u.destroy(); }); u.on('close', () => c.destroy()); c.on('error', () => { }); u.on('error', () => { });
  });
  await new Promise((r) => capped.listen(0, '127.0.0.1', r));
  const daemonL = spawn(process.execPath, [path.join(rootL, 'current', 'agentd.js'), '--dial', `ws://127.0.0.1:${capped.address().port}/api/agentd-dial?device=leg`, '--dial-token', DT], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: homeLeg, VIBESPACE_AGENTD_ROOT: rootL } });
  daemonL.unref();
  await until(() => linkStream, 10000);
  const dmL = new DeviceManager({ dataDir: path.join(homeLeg, 'hub-data'), bundlePath: BUNDLE, version, nodeModules: path.join(REPO, 'node_modules'), log: () => { }, transport: { kind: 'stream', hostToken: HT, getStream: () => linkStream } });
  devices.push(dmL);
  const cl = await dmL.connect();
  ok(cl.info.platform === 'win32' && cl.info.capabilities.includes('stream-offer'), `a real daemon DIALED this hub through a ${CAP} kbps link stand-in (Windows-shaped hello)`);
  const hostsL = { get: (h) => ({ id: h, name: 'WIN' }), isLocal: () => false, deviceBounded: async () => dmL, connectedDevice: () => dmL };
  const accessOf = (src) => ACC.create({ hosts: hostsL, install: false, env: () => ({ VIBESPACE_STREAM_FAKE_SOURCE: src }), log: { log() { }, warn() { } } });
  /** One relayed session: relay-only hub, a stand-in browser; the pictures, RTP gaps and the picture's lag over `secs`. */
  async function relayedRun(opts, { src = padded, secs = 10, mid = null } = {}) {
    const wr = DW.create({ access: accessOf(src), direct: false, ips: () => ['127.0.0.1'], log: { log() { }, warn() { } }, ...opts });
    const t0 = Date.now();
    const s = await wr.start('win-l', { maxKbps: 20000 });
    const b = standIn();
    const seqs = [], marks = [];
    b.pc.onTrack.subscribe((tr) => tr.onReceiveRtp.subscribe((r) => { const at = Date.now(); seqs.push([at, r.header.sequenceNumber]); if (r.header.marker) marks.push([at, r.header.timestamp]); }));
    b.pc.onIceCandidate.subscribe((c) => { if (c) wr.candidate(s.key, c.toJSON()).catch(() => { }); });
    await b.pc.setRemoteDescription(s.offer); await b.pc.setLocalDescription(await b.pc.createAnswer());
    const tAns = Date.now();
    await wr.answer(s.key, b.pc.localDescription.sdp);
    await until(() => marks.length >= 10, 15000);
    const firstMs = marks.length ? marks[0][0] - tAns : null;
    if (!secs) return { wr, s, b, t0, seqs, marks, firstMs };
    await sleep(1500);
    const a = Date.now();
    if (mid) setTimeout(() => mid(wr, s).catch(() => { }), (secs * 1000) / 2);
    await sleep(secs * 1000);
    const z = Date.now();
    const win = seqs.filter(([at]) => at >= a && at <= z), mw = marks.filter(([at]) => at >= a && at <= z);
    let gaps = 0; for (let i = 1; i < win.length; i++) { const d = (win[i][1] - win[i - 1][1] + 65536) % 65536; if (d !== 1) gaps += d - 1; }
    const lag = mw.length > 1 ? Math.round((mw[mw.length - 1][0] - mw[0][0]) - ((mw[mw.length - 1][1] - mw[0][1] + 4294967296) % 4294967296) / 90) : null;
    const relay = (await wr.poll(s.key, 0, -1, 0)).relay;
    const agent = (await dmL.streamStats(s.sid)).stats;
    await wr.stop(s.key); wr.shutdown(); b.pc.close();
    return { fps: Math.round((mw.length * 10000) / (z - a)) / 10, gaps, lag, relay, agent, firstMs };
  }
  // RUN A: THE UDP LEG, past the 2 Mbps link — a forged PING and a stray DATA land mid-run
  let addrBefore = null;
  const A = await relayedRun({}, { mid: async (wr, s) => {
    const r0 = (await wr.poll(s.key, 0, -1, 0)).relay; addrBefore = r0.leg.addr;
    const x = dgram.createSocket('udp4'); await new Promise((r) => x.bind(0, '127.0.0.1', r));
    const fmac = (bb) => crypto.createHmac('sha256', crypto.randomBytes(32)).update(bb).digest().subarray(0, 16);
    x.send(Buffer.from(SM.legControl(SM.LEG.PING, { flags: SM.LEG.UP, counter: 99999, nonce: crypto.randomBytes(8), mac: fmac })), r0.port, '127.0.0.1');
    x.send(Buffer.from(SM.legData('127.0.0.1', 9, new Uint8Array([1, 2, 3]))), r0.port, '127.0.0.1');
    await sleep(100); x.close();
  } });
  ok(A.fps >= 29 && A.gaps === 0 && A.lag !== null && A.lag < 300, `THE UDP LEG: 30 fps of the 8 Mbps fixture for 10 s past a ${CAP} kbps device link — ${A.fps} fps, ${A.gaps} RTP gaps, the picture's lag moved ${A.lag} ms`, { fps: A.fps, gaps: A.gaps, lag: A.lag });
  ok(A.relay.via === 'udp' && A.relay.leg.down >= 0.99 * A.relay.down && A.agent.relay.via === 'udp' && A.agent.relay.leg.state === 'up', `the record: the hub forwards via the daemon's udp leg (${A.relay.leg.down} of ${A.relay.down} datagrams to the browser came over it), the daemon says via udp, its leg up`, { relay: A.relay, agentRelay: A.agent.relay });
  ok(A.relay.leg.forged >= 1 && A.relay.leg.stray >= 1 && addrBefore && A.relay.leg.addr === addrBefore && A.gaps === 0, 'a forged PING (another key) and a stray DATA mid-run: dropped and counted; the leg\'s address unchanged, not one RTP gap', A.relay.leg);
  ok(A.agent.relay.leg.pings >= 5 && A.agent.relay.leg.pongs >= A.agent.relay.leg.pings - 1, `the keepalive: the daemon PINGed ${A.agent.relay.leg.pings}× in the session (every 2 s while it carries the picture), ${A.agent.relay.leg.pongs} answered`, A.agent.relay.leg);
  // RUN B: RED CONTROL — the device-link path alone through the same link
  const Bc = await relayedRun({ udpLeg: false });
  ok(Bc.fps < 10 && Bc.relay.via === 'link' && Bc.relay.leg === null && A.fps / Math.max(0.1, Bc.fps) >= 3, `RED CONTROL: the device-link path alone through the same ${CAP} kbps link — ${Bc.fps} fps (lag +${Bc.lag} ms in 10 s); the leg carries ${(A.fps / Math.max(0.1, Bc.fps)).toFixed(1)}× the pictures`, { fps: Bc.fps, lag: Bc.lag, via: Bc.relay.via });
  // RUN C: a hub that never answers the leg ⇒ the device link from the first picture; answered ⇒ UP; silenced mid-run ⇒ the link again
  let mute = true;
  const C = await relayedRun({ legMute: () => mute }, { src: FIXTURE, secs: 0 });
  await sleep(2600);
  const stC = (await dmL.streamStats(C.s.sid)).stats;
  const pC = (await C.wr.poll(C.s.key, 0, -1, 0)).relay;
  ok(C.firstMs !== null && C.firstMs < 1500 && stC.relay.leg.state === 'down' && stC.relay.leg.why === 'no_echo' && stC.relay.leg.since - C.t0 <= 2600 && stC.relay.via === 'link' && pC.via === 'link' && pC.leg.addr === null && pC.leg.pings === 0, `a hub that never answers the leg: the first picture ${C.firstMs} ms after the answer (the device link carried it from the start); the leg DOWN (no_echo) ${stC.relay.leg.since - C.t0} ms after the offer`, { leg: stC.relay.leg, hub: pC });
  mute = false;
  const back = await until(async () => (await C.wr.poll(C.s.key, 0, -1, 0)).relay.via === 'udp', 7000);
  const nBack = C.marks.length; await sleep(1000);
  const stUp = (await dmL.streamStats(C.s.sid)).stats;
  ok(back && stUp.relay.leg.state === 'up' && C.marks.length - nBack >= 25, `answered again: the next re-ask (≤ 5 s) brings the leg UP and it carries the picture (${C.marks.length - nBack} pictures in the next second)`, stUp.relay.leg);
  mute = true;
  const tMute = Date.now();
  const fell = await until(async () => (await dmL.streamStats(C.s.sid)).stats.relay.via === 'link', 6000);
  const fellMs = Date.now() - tMute;
  await until(async () => (await C.wr.poll(C.s.key, 0, -1, 0)).relay.via === 'link', 2000);
  const nFell = C.marks.length; await sleep(1500);
  ok(fell && fellMs <= 4600 && C.marks.length - nFell >= 40, `silenced mid-run: the daemon's next PING goes unanswered — the device link within ${fellMs} ms (≤ 2 s + 2 s) and the pictures keep coming (${C.marks.length - nFell} in 1.5 s)`);
  await C.wr.stop(C.s.key); C.wr.shutdown(); C.b.pc.close();
  dmL.stop(); endDaemonsOf(rootL); capped.close(); hubHttp.close();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
