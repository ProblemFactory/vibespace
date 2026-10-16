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
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, scratchHome, endDaemonsOf } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(50); } return false; };
const SM = require(path.join(REPO, 'src/stream-model.js'));
const H = require(path.join(REPO, 'src/stream-h264.js'));
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
  pc.onTrack.subscribe((t) => t.onReceiveRtp.subscribe((r) => got.rtp.push({ ts: r.header.timestamp, marker: r.header.marker, payload: Buffer.from(r.payload), at: Date.now() })));
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
  const wr = DW.create({ access, direct: false, ips: () => ['127.0.0.1'], log: { log() { }, warn() { } } });
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
  const oldText = bundleText.replace(CAP_LIST, (all, inner) => `capabilities: [${inner.split(',').map((x) => x.trim()).filter((x) => x && x !== '"stream-offer"' && x !== '"input-events"').join(', ')}]`).replace('if (msg.op === "stream-offer") {', 'if (false) {');
  ok(capsOf(oldText).length === capsOf(bundleText).length - 2 && oldText.includes('if (false) {'), 'the old copy lacks both capabilities (by content) and its handler');
  const oldBundle = path.join(copyDir, 'old', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(oldBundle), { recursive: true }); fs.writeFileSync(oldBundle, oldText);
  const dmo = deviceOn(homeOld, oldBundle);
  const co = await dmo.connect();
  const sent = [];
  const send0 = dmo._request.bind(dmo);
  dmo._request = (msg) => { sent.push(msg && msg.op); return send0(msg); };
  const e1 = await dmo.streamOffer({ sourceKind: 'fake', sourceId: FIXTURE }).then(() => null, (x) => x);
  const e2 = await dmo.inputEvents([{ t: 'kd', c: 'KeyA' }]).then(() => null, (x) => x);
  ok(e1 && e1.code === 'host_needs_daemon' && e1.daemonVersion === co.info.daemonVersion && e2 && e2.code === 'host_needs_daemon' && sent.length === 0, 'an older agent is refused by the capability (host_needs_daemon + its version) and NO request went to it');
  const raw = await send0({ op: 'stream-offer', sid: 'sraw', sourceKind: 'fake', sourceId: FIXTURE, timeoutMs: 1500 }).then((r) => ({ answered: r }), (x) => ({ error: String(x && x.message) }));
  ok(!raw.answered && /time(?:d)? ?out/i.test(raw.error || ''), 'CONTROL: asked past the gate, the old agent answers NOTHING — the request ends on its own timeout (the 2.300.0 rule)', raw);
  dmo.stop(); endDaemonsOf(rootOf(homeOld));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
