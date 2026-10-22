#!/usr/bin/env node
// THE MACHINE'S SOUND against a REAL daemon (lane speaker-passthrough-v1, backlog B-aec9 — the THREE-TOUCH rule, test-sysinfo-op's
// shape, test-stream-mic-op its template): the `stream-audio` handler in src/agentd/agentd.js (src/agentd/stream-host.js + the
// SHARED src/desktop-sound.js), the capability in the hello-ack, the client's gated streamAudio + its id-keyed routing set; and
// the stream's audio m-line CARRYING the machine's sound. The machine's audio is a FAKE loopback: VIBESPACE_MIC_HELPER names a
// script standing in for the microphone helper — its `loopback` verb writes a 1 kHz (left) / 1.5 kHz (right) tone at real-time
// pace; the agent's REAL ffmpeg (libopus) encodes it; a werift peer in THIS process stands in for the browser. A Mac's road runs
// in-process over the FAKE screen helper (scripts/fixtures/stream/mac-fakes.mjs — `audio on` / `audio off`, real Opus packets).
//   §0 the helpers' sources: the generated modules are current; the Windows `loopback` verb (loopback of the RENDER endpoint + its
//      silent keep-alive, nothing named on argv or env, never a microphone); the Mac helper's capturesAudio on the SAME SCStream
//   §1 the op by id (`stream-audio-result`), the hello-ack word, the bundle carries the module
//   §2 THE WINDOWS ROAD: an offer asked `audio` carries a SENDONLY Opus m-line with the picture's msid; OFF = nothing runs, no
//      packet; the press = ONE `loopback` (nothing on argv) → Opus RTP at the stand-in (the tone, left AND right); off = the
//      helper's stdin closed, no packet; THE CLOCK across off → on (one sequence, the timestamp moves by the gap, marked);
//      RTCP SR on BOTH tracks (lip-sync); the default speaker changed ⇒ a fresh run; the stream's end ends it
//   §3 refusals by name: a stream not asked `audio` (no_audio), an unknown session (not_found), a machine that cannot send its
//      sound (no m=audio); in-process: no ffmpeg, no helper, not a Windows machine; THE SENDER IS PINNED (a stray datagram dropped)
//   §4 THE MAC ROAD (in-process): `audio on` on the session's own helper → its FLV audio tags → the stand-in, byte for byte;
//      `audio off`; THE WAY BACK: a live switch the helper refuses ⇒ the same capture started again with --audio, the picture on;
//      asked before the picture started (a remembered 「声音」 at the answer) ⇒ told to the helper when it starts
//   §5 THE CAPABILITY GATE: an older copy without stream-audio is never asked (host_needs_daemon, NO request); its offer carries
//      no `audio` and no m=audio — CONTROL: asked past the gate it answers nothing (the 2.300.0 rule)
//   §6 THE HUB (src/server/desktop-webrtc.js over this daemon): start({audio}) → the offer's `audio`; sound(key, on) → the agent's op
// A BOX WITHOUT ffmpeg (the Actions runner — measured, its 2.369.339 run): the encoder is the FAKE (scripts/fixtures/stream/
// sound-fakes.mjs — VIBESPACE_SOUND_FFMPEG: the committed Opus tone as RTP) and the two legs about the REAL encoder (its pacing, the
// helper's own PCM decoded) SKIP BY NAME; every other leg runs. VS_SOUND_FAKE_FFMPEG=1 forces the fake on a box that has ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import dgram from 'node:dgram';
import { execFileSync, spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, endDaemonsOf } from './scratch.mjs';
import { moduleText, readTexts } from './mic-helper-embed.mjs';
import { writeFakeMic } from './fixtures/stream/mic-fakes.mjs';
import { writeFakeMacHelper, helperLog, MAC_FACTS } from './fixtures/stream/mac-fakes.mjs';
import { flvBytes } from './fixtures/stream/screen-fakes.mjs';
import { writeFakeEncoder, hasOpusFfmpeg, tonePackets } from './fixtures/stream/sound-fakes.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(40); } return false; };
const SM = require(path.join(REPO, 'src/stream-model.js'));
const SND = require(path.join(REPO, 'src/sound-model.js'));
const DSOUND = require(path.join(REPO, 'src/desktop-sound.js'));
const DMIC = require(path.join(REPO, 'src/desktop-mic.js'));
const HOST = require(path.join(REPO, 'src/agentd/stream-host.js'));
const MAC = require(path.join(REPO, 'src/agentd/stream-mac.js'));
const MSRC = require(path.join(REPO, 'src/agentd/mac-helper-source.js'));
const DW = require(path.join(REPO, 'src/server/desktop-webrtc.js'));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const w = require(path.join(REPO, 'node_modules/werift'));
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const FIXTURE = path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264');
const homes = [scratchHome('sso-home', fs, ['.vibespace']), scratchHome('sso-old', fs, ['.vibespace']), scratchHome('sso-bare', fs, ['.vibespace']), scratchHome('sso-mac', fs, ['.vibespace'])];
const [home, homeOld, homeBare, homeMac] = homes;
const work = scratch('sso-work'); fs.mkdirSync(work, { recursive: true });
const rootOf = (h) => path.join(h, 'agentd-root');
const devices = [], peers = [], closers = [];
const cleanup = () => { for (const c of closers) { try { c(); } catch { } } for (const p of peers) { try { p.close(); } catch { } } for (const d of devices) { try { d.stop(); } catch { } } for (const h of homes) endDaemonsOf(rootOf(h)); for (const d of [...homes, work]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);

const FK = writeFakeMic(path.join(work, 'fake')); // THE FAKE LOOPBACK (and the microphone helper's other verbs)
const REAL_FF = hasOpusFfmpeg() && process.env.VS_SOUND_FAKE_FFMPEG !== '1';
const FE = writeFakeEncoder(path.join(work, 'encoder'));
const FF = REAL_FF ? 'ffmpeg' : FE.exe; // the encoder the in-process legs name
const ENC = REAL_FF ? {} : { VIBESPACE_SOUND_FFMPEG: FE.exe }; // the daemon's
const skip = (n) => console.log(`  - SKIP (no ffmpeg with libopus on this box — the fake encoder sends the committed tone): ${n}`);
console.log(REAL_FF ? '  (the REAL ffmpeg encodes)' : '  (the FAKE encoder: VIBESPACE_SOUND_FFMPEG — scripts/fixtures/stream/sound-fakes.mjs)');
function deviceOn(h, bundlePath = BUNDLE, env = {}) {
  const keep = { HOME: process.env.HOME, VIBESPACE_AGENTD_ROOT: process.env.VIBESPACE_AGENTD_ROOT, VIBESPACE_MIC_HELPER: process.env.VIBESPACE_MIC_HELPER, VIBESPACE_SOUND_FFMPEG: process.env.VIBESPACE_SOUND_FFMPEG };
  process.env.HOME = h; process.env.VIBESPACE_AGENTD_ROOT = rootOf(h); delete process.env.VIBESPACE_MIC_HELPER; delete process.env.VIBESPACE_SOUND_FFMPEG;
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const dataDir = path.join(h, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  const dm = new DeviceManager({ dataDir, bundlePath, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  devices.push(dm);
  const p = dm.connect().finally(() => { for (const [k, v] of Object.entries(keep)) { if (v == null) delete process.env[k]; else process.env[k] = v; } });
  return { dm, ready: p };
}
/** The browser's stand-in: a FULL ICE agent with Opus; it answers the sound's m-line RECVONLY and records every audio packet + RTCP. */
function standIn() {
  const pc = new w.RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:9' }], iceStunGatherTimeout: 0.2, iceUseIpv6: false, codecs: { video: [SM.STREAM_CODEC].map((C) => new w.RTCRtpCodecParameters({ mimeType: C.mimeType, clockRate: C.clockRate, rtcpFeedback: C.rtcpFeedback.map((f) => ({ ...f })), parameters: C.fmtp })), audio: [w.useOPUS()] } });
  peers.push(pc);
  return pc;
}
async function soundStream(offerOf, answerTo, { audio = true } = {}) {
  const pushes = [], rtp = [], vrtp = [], rtcp = [];
  const pc = standIn();
  const off = await offerOf({ sourceKind: 'fake', sourceId: FIXTURE, ...(audio ? { audio: true } : {}) }, (m) => { pushes.push(m); if (m.op === 'stream-ice' && m.candidate) pc.addIceCandidate(m.candidate).catch(() => { }); });
  pc.onTrack.subscribe((t) => t.onReceiveRtp.subscribe((r) => (t.kind === 'audio' ? rtp : vrtp).push({ at: Date.now(), seq: r.header.sequenceNumber, ts: r.header.timestamp >>> 0, marker: r.header.marker, pt: r.header.payloadType, payload: Buffer.from(r.payload) })));
  await pc.setRemoteDescription(off.offer);
  const tr = pc.getTransceivers().find((t) => t.kind === 'audio') || null;
  if (tr) tr.setDirection('recvonly');
  for (const t of pc.getTransceivers()) { try { t.receiver.onRtcp.subscribe((p) => rtcp.push({ kind: t.kind, type: p.type })); } catch { /* no rtcp hook */ } }
  await pc.setLocalDescription(await pc.createAnswer());
  const ans = await answerTo(off, pc.localDescription.sdp);
  const connected = await until(() => pc.connectionState === 'connected', 10000);
  const stats = () => { const s = [...pushes].reverse().find((m) => m.op === 'stream-stats' && m.stats); return s ? s.stats : null; };
  return { off, pc, tr, ans, connected, rtp, vrtp, rtcp, pushes, stats };
}
const viaDevice = (dm) => [(p, onPush) => dm.streamOffer(p, { onPush }), (off, sdp) => dm.streamAnswer(off.sid, { answer: { type: 'answer', sdp } })];
const sectionOf = (sdp, kind) => { const parts = String(sdp).split(/\r?\n(?=m=)/); return parts.find((x) => x.startsWith(`m=${kind}`)) || ''; };
const msidOf = (sec) => ((/a=msid:(\S+)/.exec(sec) || [])[1]) || null;
/** Received Opus packets → s16le stereo PCM (the agent's own Ogg pager + this box's ffmpeg). */
function decode(pkts) {
  const pages = [...DMIC.oggOpusHead(2)];
  let g = 0; pkts.forEach((p, i) => { g += SND.opusSamples(p) || 960; pages.push(DMIC.oggPage(1, i + 2, g, i === pkts.length - 1 ? 4 : 0, p)); });
  return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'ogg', '-i', 'pipe:0', '-f', 's16le', '-ac', '2', '-ar', '48000', 'pipe:1'], { input: Buffer.concat(pages), maxBuffer: 64 << 20 });
}
/** Goertzel energy of `f` in channel `ch` (0 = left, 1 = right) of s16le stereo PCM, against `ref`. */
function ratio(pcm, ch, f, ref) {
  const n = Math.floor(pcm.length / 4);
  const g = (fr) => { const c = 2 * Math.cos(2 * Math.PI * fr / 48000); let s1 = 0, s2 = 0; for (let k = 0; k < n; k++) { const s0 = pcm.readInt16LE(k * 4 + ch * 2) / 32768 + c * s1 - s2; s2 = s1; s1 = s0; } return s1 * s1 + s2 * s2 - c * s1 * s2; };
  return g(f) / Math.max(1e-9, g(ref));
}
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const CAP_LIST = /capabilities: \[([^\]]*)\]/;
const capsOf = (txt) => { const m = CAP_LIST.exec(txt); return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : null; };

console.log('§0 the helpers\' sources');
{
  ok(fs.readFileSync(path.join(REPO, 'src/mic-helper-source.js'), 'utf8') === moduleText(readTexts()), 'src/mic-helper-source.js is the generated text of tools/vibespace-mic/ (node scripts/mic-helper-embed.mjs after editing them)');
  const WIN = require(path.join(REPO, 'src/mic-helper-source.js')).WIN;
  const lb = WIN.slice(WIN.indexOf('static int Loopback()'), WIN.indexOf('/// setdefault:'));
  ok(/cmd == "loopback"\) return Loopback\(\)/.test(WIN) && lb.length > 500 && /GetDefaultAudioEndpoint\(0, 0, out dev\)/.test(lb) && /0x00020000 \| 0x00040000 \| AUTOCONVERT/.test(lb) && /IAudioCaptureClient/.test(lb), 'the Windows helper\'s `loopback` verb: WASAPI LOOPBACK (0x00020000, event-driven, AUTOCONVERTPCM → 48 kHz float stereo) of the default RENDER endpoint (flow 0)');
  ok((lb.match(/ReleaseBuffer\((kaFrames|want), 2\)/g) || []).length === 2 && /Initialize\(0, 0x00040000 \| AUTOCONVERT, 400000/.test(lb), 'beside it a SILENT render stream on the same endpoint (AUDCLNT_BUFFERFLAGS_SILENT) — the keep-alive without which a quiet machine delivers nothing (the probe\'s leg 1b)');
  ok(!/GetEnvironmentVariable|args\[1\]|GetDefaultAudioEndpoint\(1/.test(lb) && /OpenStandardOutput/.test(lb) && /OpenStandardInput/.test(lb), 'it reads nothing from env or argv, never the CAPTURE flow (no microphone); PCM to stdout, it ends when stdin closes');
  const SWIFT = fs.readFileSync(path.join(REPO, 'tools/vibespace-screen/vibespace-screen.swift'), 'utf8');
  ok(MSRC.SOURCE === SWIFT && MSRC.VERSION === 'vs-' + MSRC.SHA256.slice(0, 12) && MSRC.VERSION !== 'vs-054d5cc35456', `the Mac's screen helper rides the bundle verbatim; its VERSION moved (vs-054d5cc35456 → ${MSRC.VERSION}) — the owner switches Screen Recording on once more for it (helper_changed_regrant)`);
  ok(/c\.capturesAudio = on/.test(SWIFT) && /s\.updateConfiguration\(c\)/.test(SWIFT) && /addStreamOutput\(self, type: \.audio/.test(SWIFT) && (SWIFT.match(/SCStream\(filter:/g) || []).length === 1 && /excludesCurrentProcessAudio = true/.test(SWIFT), 'the Mac: capturesAudio on the SAME SCStream (updateConfiguration — one SCStream in the helper), its own process excluded');
  ok(/mFormatID: kAudioFormatOpus, mFormatFlags: 0, mBytesPerPacket: 0, mFramesPerPacket: 960/.test(SWIFT) && /conv\.bitRate = 64000/.test(SWIFT) && /Data\(\[0x91\]\) \+ Data\("Opus"\.utf8\)/.test(SWIFT) && /A\.contains\("--audio"\)/.test(SWIFT) && /p\.first == "audio", p\.count > 1/.test(SWIFT) && !/AVCaptureDevice|kAudioDevicePropertyScopeInput/.test(SWIFT), 'AudioToolbox Opus 20 ms 64 kbps → FLV audio tags (0x91 \'Opus\'); `audio on|off` on stdin, `--audio` from the start; no microphone anywhere');
}

console.log('§1 the op: by id, the hello-ack word, the module in the bundle');
const { dm, ready } = deviceOn(home, BUNDLE, { VIBESPACE_MIC_HELPER: FK.exe, ...ENC });
const conn = await ready;
{
  const caps = conn.info.capabilities;
  ok(caps.includes('stream-audio') && caps.indexOf('stream-audio') === caps.length - 1 && caps.indexOf('stream-mic') === caps.length - 2, 'the hello-ack names stream-audio (after stream-mic)', caps.slice(-3));
  ok(/op: "stream-audio-result"/.test(bundleText) && /function createSound\(/.test(bundleText) && /hc = r\.helper = spawn\(h\.exe, \["loopback"\]/.test(bundleText), 'the bundle answers stream-audio-result and carries src/desktop-sound.js (npm run build:agentd after a change)');
  const client = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  ok(/m\.op === 'stream-audio-result'/.test(client) && /async streamAudio\(sid, \{ on = false \} = \{\}\) \{\s*const conn = await this\.connect\(\);\s*if \(!conn\.info\?\.capabilities\?\.includes\?\.\(SOUND_CAPABILITY\)\)/.test(client), 'THREE-TOUCH: stream-audio-result is in the client\'s id-keyed routing set; the method is capability-gated');
  const raw = await dm._request({ op: 'stream-audio', sid: 'nope', on: true, timeoutMs: 5000 });
  ok(raw && raw.result && raw.result.ok === false && raw.result.code === 'not_found', 'a raw request is answered BY ID (not a timeout): an unknown session is not_found', raw);
}

console.log('§2 THE WINDOWS ROAD: the loopback → the agent\'s ffmpeg → Opus → the stream\'s track');
const S = await soundStream(...viaDevice(dm));
{
  const asec = sectionOf(S.off.offer.sdp, 'audio'), vsec = sectionOf(S.off.offer.sdp, 'video');
  ok(S.off.ok && S.off.audio === true && /a=sendonly/.test(asec) && /a=rtpmap:\d+ opus\/48000\/2/i.test(asec) && /a=group:BUNDLE 0 1 2|a=group:BUNDLE/.test(S.off.offer.sdp), 'a stream asked `audio` offers an Opus 48 kHz stereo m-line the agent SENDS on (sendonly — no microphone asked), in the one BUNDLE', asec.split(/\r?\n/).filter((l) => /^(m=|a=rtpmap|a=send|a=recv|a=msid)/.test(l)));
  ok(msidOf(asec) === SND.SOUND.streamId && msidOf(vsec) === SND.SOUND.streamId, `the sound and the picture share ONE msid (${SND.SOUND.streamId}) — one MediaStream: the page's <video> carries both`, { a: msidOf(asec), v: msidOf(vsec) });
  ok(S.connected && await until(() => S.vrtp.length > 10, 5000), 'the stand-in answered it recvonly, connected, and the picture plays');
  await sleep(1500);
  ok(FK.loopbacks().length === 0 && S.rtp.length === 0 && S.stats() && S.stats().audio && S.stats().audio.state === 'off', 'OFF (the default): nothing runs on the machine — no loopback, no keep-alive, no Opus — and no packet', { runs: FK.loopbacks().length, rtp: S.rtp.length, audio: S.stats() && S.stats().audio });
  const t0 = Date.now();
  const on = await dm.streamAudio(S.off.sid, { on: true });
  const tookMs = Date.now() - t0;
  ok(on && on.ok === true && on.on === true && on.endpoint === 'Speakers (Sound Blaster X3)', `the press (stream-audio on) ⇒ started in ${tookMs} ms, the endpoint said`, on);
  const runs = FK.loopbacks();
  ok(runs.length === 1 && JSON.stringify(runs[0].argv) === '["loopback"]' && runs[0].device === null, 'ONE loopback run, its argv the verb alone (no name rides argv or env)', runs);
  const got = await until(() => S.rtp.length >= 75, 6000);
  const pt = Number((/a=rtpmap:(\d+) opus/i.exec(sectionOf(S.off.offer.sdp, 'audio')) || [])[1]);
  ok(got && S.rtp.every((p) => p.pt === pt), `Opus RTP reaches the stand-in on the m-line's payload type (${pt}): ${S.rtp.length} packets`);
  const gaps = S.rtp.slice(5).map((p, i) => p.at - S.rtp[i + 4].at).sort((a, b) => a - b), p50 = gaps[gaps.length >> 1], p95 = gaps[Math.floor(gaps.length * 0.95)];
  if (REAL_FF) ok(p50 >= 10 && p50 <= 30 && p95 <= 80, `paced like the probe's leg 1h (arrival gaps p50 ${p50} ms, p95 ${p95} ms — one 20 ms packet at a time, not the raw demuxer's clumps)`);
  else skip(`the real encoder's pacing (the fake's: p50 ${p50} ms, p95 ${p95} ms)`);
  if (REAL_FF) {
    const pcm = decode(S.rtp.slice(10).map((p) => p.payload));
    const left = ratio(pcm, 0, 1000, 3000), right = ratio(pcm, 1, 1500, 3000), cross = ratio(pcm, 0, 1500, 3000);
    ok(pcm.length > 48000 * 4 && left > 100 && right > 100 && cross < left / 10, `THE SOUND made it: decoded, the machine's 1 kHz on the LEFT (${left.toFixed(0)}× the 3 kHz energy) and 1.5 kHz on the RIGHT (${right.toFixed(0)}×) — stereo kept`, { bytes: pcm.length, left, right, cross });
  } else {
    skip('the helper\'s own PCM decoded at the far end (it needs a decoder)');
    const T = tonePackets(), i0 = T.findIndex((p) => p.equals(S.rtp[3].payload));
    ok(i0 >= 0 && S.rtp.slice(3, 30).every((r, k) => r.payload.equals(T[(i0 + k) % T.length])) && FE.runs().length === 1 && FE.runs()[0].argv.join(' ') === SND.soundEncoderArgs(Number(/:(\d+)\?/.exec(FE.runs()[0].argv.at(-1))[1])).join(' '), 'THE ENCODER\'S packets reach the stand-in byte for byte (the fake replays the committed tone); it was run with the product\'s argv (soundEncoderArgs)', FE.runs());
  }
  const st = S.stats() && S.stats().audio;
  ok(st && st.state === 'live' && st.road === 'loopback' && st.packets > 40 && st.sent > 40 && st.stray === 0 && st.kbps > 20 && st.endpoint === 'Speakers (Sound Blaster X3)', 'the stream\'s numbers say it: live, the loopback road, its packets / kbps, nothing stray', st);
  const nOn = S.rtp.length, last1 = S.rtp[S.rtp.length - 1];
  const off = await dm.streamAudio(S.off.sid, { on: false });
  ok(off && off.ok && off.on === false && off.was === true, 'the second press (stream-audio off) ⇒ off', off);
  const closed = await until(() => FK.loopbackEnded(1), 4000);
  await sleep(600);
  const after = S.rtp.length - nOn;
  ok(closed && after <= 5 && S.stats().audio.state === 'off', `off ⇒ the helper's stdin closed (its keep-alive and loopback with it), no more packets (${after} in flight)`);
  await sleep(1500);
  const lastOff = S.rtp[S.rtp.length - 1];
  const on2 = await dm.streamAudio(S.off.sid, { on: true });
  await until(() => S.rtp.length > S.rtp.indexOf(lastOff) + 10, 6000);
  const first2 = S.rtp[S.rtp.indexOf(lastOff) + 1];
  const wallGap = first2 ? first2.at - lastOff.at : 0, tsGap = first2 ? ((first2.ts - lastOff.ts) >>> 0) / 48 : 0;
  ok(on2.ok && first2 && first2.seq === ((lastOff.seq + 1) & 0xffff) && first2.marker === true && Math.abs(tsGap - wallGap) <= 80, `THE CLOCK across off → on: the SAME sequence goes on (${lastOff.seq} → ${first2 && first2.seq}), the first packet is marked, its timestamp moved by the wall-clock gap (${tsGap.toFixed(0)} ms of samples for ${wallGap} ms)`, { lastOff: lastOff && { seq: lastOff.seq, ts: lastOff.ts }, first2: first2 && { seq: first2.seq, ts: first2.ts, marker: first2.marker } });
  void last1;
  const srA = S.rtcp.filter((x) => x.kind === 'audio' && x.type === 200).length, srV = S.rtcp.filter((x) => x.kind === 'video' && x.type === 200).length;
  ok(srA >= 2 && srV >= 2, `RTCP sender reports on BOTH tracks (audio ${srA}, video ${srV}) — werift sends them; the browser's lip-sync of one MediaStream rides them`);
  FK.speakerGoes();
  await dm.streamAudio(S.off.sid, { on: false }); await until(() => FK.loopbackEnded(2), 4000);
  await dm.streamAudio(S.off.sid, { on: true });
  const n3 = FK.loopbacks().length;
  const fresh = await until(() => FK.loopbacks().length === n3 + 1, 6000);
  const n4 = S.rtp.length;
  const back = await until(() => { const a = S.stats() && S.stats().audio; return a && a.restarts === 1 && a.state === 'live' && S.rtp.length > n4 + 20; }, 5000); // the numbers ride the once-a-second push
  const st3 = S.stats().audio;
  ok(fresh && back, 'the default speaker went away (the helper ended device_lost) ⇒ a FRESH capture on the new default — the sound goes on', { fresh, st3 });
  const nAll = FK.loopbacks().length;
  await dm.streamStop(S.off.sid, { why: 'closed' });
  ok(await until(() => FK.loopbackEnded(nAll), 4000), 'the stream\'s end ends the capture (the helper\'s stdin closed)');
}

console.log('§3 refusals by name');
{
  const N = await soundStream(...viaDevice(dm), { audio: false });
  const r = await dm.streamAudio(N.off.sid, { on: true });
  ok(N.off.ok && !('audio' in N.off) && !/m=audio/.test(N.off.offer.sdp) && r.ok === false && r.code === 'no_audio', 'a stream NOT asked `audio` (an older page) has no m=audio; its 「声音」 is refused no_audio — nothing captured', r);
  await dm.streamStop(N.off.sid);
  const nf = await dm.streamAudio('s-gone', { on: true });
  ok(nf.ok === false && nf.code === 'not_found', 'an ended session ⇒ not_found', nf);
  // a machine that cannot send its sound (Linux, no helper fake): asked `audio`, it offers none
  const B = deviceOn(homeBare, BUNDLE); await B.ready;
  const bs = await B.dm.streamOffer({ sourceKind: 'fake', sourceId: FIXTURE, audio: true });
  const br = await B.dm.streamAudio(bs.sid, { on: true });
  ok(bs.ok && !('audio' in bs) && !/m=audio/.test(bs.offer.sdp) && br.code === 'no_audio', 'a machine that cannot send its sound (this Linux box, no helper) offers no sound track when asked — said no_audio, never a dead toggle', { audio: bs.audio, code: br.code });
  await B.dm.streamStop(bs.sid); B.dm.stop(); endDaemonsOf(rootOf(homeBare));
  // in-process: the module's own refusals
  const mk = (o) => DSOUND.createSound({ platform: 'win32', spawn, env: process.env, helper: async () => ({ ok: true, exe: FK.exe }), ffmpegPath: async () => FF, ...o });
  const r1 = await mk({ ffmpegPath: async () => null }).capture('a', () => { }).start();
  const r2 = await mk({ helper: async () => ({ ok: false, code: 'helper_missing', error: 'csc said no' }) }).capture('b', () => { }).start();
  const r3 = await mk({ platform: 'linux' }).capture('c', () => { }).start();
  ok(r1.code === 'no_ffmpeg' && r2.code === 'helper_missing' && /csc said no/.test(r2.error) && r3.code === 'sound_unsupported' && mk({ platform: 'darwin' }).can() === false && mk({ platform: 'linux', fake: true }).can() === true, 'in-process: no ffmpeg ⇒ no_ffmpeg; the helper not built ⇒ helper_missing (its words); not Windows ⇒ sound_unsupported (a Mac\'s sound is its screen source\'s)', { r1, r2, r3 });
  // THE SENDER IS PINNED: a datagram from another socket on this box never reaches the track
  let sock = null; const wrapped = { createSocket: (t) => { sock = dgram.createSocket(t); return sock; } };
  const got = [];
  const cap = mk({ dgram: wrapped }).capture('d', (p) => got.push(p));
  const rs = await cap.start();
  await until(() => got.length > 5, 4000);
  const stray = dgram.createSocket('udp4');
  const fake = Buffer.concat([Buffer.from([0x80, 0x60, 0, 1, 0, 0, 0, 1, 0x12, 0x34, 0x56, 0x78]), Buffer.from([0xfc, 1, 2, 3])]);
  await new Promise((res) => stray.send(fake, sock.address().port, '127.0.0.1', res));
  await sleep(300);
  const st = cap.stats(); cap.stop('test'); stray.close();
  ok(rs.ok && st.stray === 1 && !got.some((p) => p.payload.length === 4 && p.payload[0] === 0xfc && p.payload[1] === 1), 'THE SENDER IS PINNED: ffmpeg\'s first datagram names its port + SSRC; a stray datagram from another socket of this box is dropped and counted, never sent', { stray: st.stray });
}

console.log('§4 THE MAC ROAD (in-process, the fake screen helper): capturesAudio on the session\'s own SCStream');
{
  // real Opus packets for the fake helper to send: the committed tone (u32LE-framed — no ffmpeg needed)
  const PK = tonePackets(), framed = path.join(work, 'mac-tone.frames'); // the fake screen helper reads u32LE-framed packets
  fs.writeFileSync(framed, Buffer.concat(PK.map((p) => { const h = Buffer.alloc(4); h.writeUInt32LE(p.length); return Buffer.concat([h, p]); })));
  const H264 = require(path.join(REPO, 'src/stream-h264.js'));
  const AUS = H264.accessUnits(H264.splitNalus(fs.readFileSync(FIXTURE))), FLV = path.join(homeMac, 'desk.flv');
  fs.writeFileSync(FLV, flvBytes(AUS.slice(AUS.findIndex((a) => a.key)), 30));
  const logM = path.join(homeMac, 'helper.log');
  const FM = writeFakeMacHelper(homeMac, { pace: 60, version: MSRC.VERSION, facts: MAC_FACTS, tcc: { screen: 'granted', accessibility: 'granted' }, log: logM, flv: FLV, opus: framed, displayFrame: { x: 0, y: 0, w: 1920, h: 1080 } });
  const scr = MAC.createMacScreen({ spawn, execFile, env: { HOME: homeMac, PATH: process.env.PATH }, fs, log: () => { } });
  const host = HOST.createStreamHost({ log: () => { }, screen: (msg, o) => scr.source(msg, o), sound: () => ({ can: () => false }) });
  closers.push(() => host.stopAll('test'));
  const link = { control: (m) => link.on && link.on(m) };
  const viaHost = [(p, onPush) => { link.on = onPush; return host.offer({ ...p, sid: 'mac1', sourceKind: 'screen', sourceId: null }, link).then((r) => { host.replied('mac1'); return r; }); }, (off, sdp) => host.answer({ sid: off.sid, answer: { sdp } })];
  const M = await soundStream(...viaHost);
  ok(M.off.ok && M.off.audio === true && /a=sendonly/.test(sectionOf(M.off.offer.sdp, 'audio')) && msidOf(sectionOf(M.off.offer.sdp, 'audio')) === SND.SOUND.streamId && M.connected && await until(() => M.vrtp.length > 5, 6000), 'a Mac\'s screen source carries `audio` ⇒ its offer has the sound track (the sound factory says it cannot — the SOURCE\'s own road), the picture plays');
  await sleep(600);
  const ctl = () => helperLog(logM).filter((l) => l.ctl).map((l) => l.ctl);
  ok(M.rtp.length === 0 && !ctl().includes('audio on'), 'OFF: the helper was never told `audio on`; no packet');
  const on = await host.audio({ sid: 'mac1', on: true });
  ok(on.ok && ctl().includes('audio on') && await until(() => M.rtp.length >= 20, 4000), 'the press ⇒ `audio on` on THIS session\'s helper (the same SCStream: no second capture); its packets reach the stand-in', { on, ctl: ctl() });
  const firstIdx = PK.findIndex((p) => p.equals(M.rtp[0].payload));
  ok(firstIdx >= 0 && M.rtp.slice(0, 15).every((r, k) => r.payload.equals(PK[(firstIdx + k) % PK.length])), 'the helper\'s Opus packets arrive byte for byte, in order (FLV audio tags → SP.flvReader → the track)');
  const st = host.stats({ sid: 'mac1' }).stats.audio;
  ok(st.state === 'live' && st.road === 'sck' && st.packets >= 20 && st.relaunched === false, 'the numbers: live on the SCK road', st);
  const off = await host.audio({ sid: 'mac1', on: false });
  const n0 = M.rtp.length; await sleep(500);
  ok(off.ok && ctl().includes('audio off') && M.rtp.length - n0 <= 3, '`audio off` ⇒ the helper stops encoding, no more packets', { off, more: M.rtp.length - n0 });
  // THE WAY BACK: the helper refuses the LIVE switch (macOS' updateConfiguration said no) ⇒ the same capture again with --audio
  FM.set({ audioRefuse: true });
  host.stop('mac1', 'test');
  await sleep(300);
  const caps0 = helperLog(logM).filter((l) => l.argv && l.argv.includes('capture')).length;
  const M2 = await soundStream(...viaHost);
  await until(() => M2.vrtp.length > 5, 6000);
  const on2 = await host.audio({ sid: 'mac1', on: true });
  const argvs = helperLog(logM).filter((l) => l.argv && l.argv.includes('capture')).slice(caps0).map((l) => l.argv);
  const vBefore = M2.vrtp.length;
  ok(on2.ok && argvs.length === 2 && !argvs[0].includes('--audio') && argvs[1].includes('--audio') && await until(() => M2.rtp.length >= 15, 4000), 'THE WAY BACK: a live switch the helper refused ⇒ the SAME session\'s capture started again with --audio — the sound arrives', { on2, argvs });
  ok(await until(() => M2.vrtp.length > vBefore + 20, 4000) && host.stats({ sid: 'mac1' }).stats.audio.relaunched === true, 'and the picture plays on (its new helper\'s pictures reach the stand-in); the numbers say relaunched');
  host.stop('mac1', 'test');
  // ASKED BEFORE THE PICTURE STARTED (a remembered 「声音」 turns on at the answer, before ICE connects): told to the helper when it starts
  FM.set({ audioRefuse: false });
  await sleep(300);
  let early = null;
  const M3 = await soundStream((p, onPush) => viaHost[0](p, onPush).then((r) => { early = host.audio({ sid: 'mac1', on: true }); return r; }), viaHost[1]);
  const e3 = await early;
  ok(e3 && e3.ok === true && await until(() => M3.rtp.length >= 15, 6000), 'a sound asked BEFORE the picture started (the page\'s remembered 「声音」 at its answer) waits for the helper, then plays — never a refusal', e3);
  host.stop('mac1', 'test');
}

console.log('§5 THE CAPABILITY GATE');
{
  const oldText = bundleText.replace(CAP_LIST, (all, inner) => `capabilities: [${inner.split(',').map((x) => x.trim()).filter((x) => x && x !== '"stream-audio"').join(', ')}]`).replace('if (msg.op === "stream-audio") {', 'if (false) {').replace('if (msg.audio === true) {', 'if (false) {');
  ok(capsOf(oldText).length === capsOf(bundleText).length - 1 && oldText.split('if (false) {').length === bundleText.split('if (false) {').length + 2, 'the old copy lacks stream-audio (by content), its handler and the sound\'s track');
  const oldBundle = path.join(work, 'old', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(oldBundle), { recursive: true }); fs.writeFileSync(oldBundle, oldText);
  const O = deviceOn(homeOld, oldBundle, { VIBESPACE_MIC_HELPER: FK.exe, ...ENC });
  const co = await O.ready;
  const sent = [];
  const send0 = O.dm._request.bind(O.dm);
  O.dm._request = (msg) => { sent.push(msg); return send0(msg); };
  const e1 = await O.dm.streamAudio('x', { on: true }).then(() => null, (x) => x);
  ok(e1 && e1.code === 'host_needs_daemon' && e1.daemonVersion === co.info.daemonVersion && sent.length === 0, 'an older agent is refused by the capability (host_needs_daemon + its version) — NO request went to it');
  const s = await O.dm.streamOffer({ sourceKind: 'fake', sourceId: FIXTURE, audio: true });
  ok(s.ok && sent.length === 1 && sent[0].op === 'stream-offer' && !('audio' in sent[0]) && !/m=audio/.test(s.offer.sdp), 'its stream is offered WITHOUT asking `audio` (the hub never sends it to an older agent) — no m=audio, the picture as before');
  await O.dm.streamStop(s.sid);
  const raw = await send0({ op: 'stream-audio', sid: s.sid, on: true, timeoutMs: 1500 }).then((r) => ({ answered: r }), (x) => ({ error: String(x && x.message) }));
  ok(!raw.answered && /time(?:d)? ?out/i.test(raw.error || ''), 'CONTROL: asked past the gate, the old agent answers NOTHING — the request ends on its own timeout (the 2.300.0 rule)', raw);
  O.dm.stop(); endDaemonsOf(rootOf(homeOld));
}

console.log('§6 THE HUB (src/server/desktop-webrtc.js over this daemon)');
{
  const access = { streamRung: async () => ({ take: true, dm, source: 'fake', sourceId: FIXTURE, platform: 'win32' }) };
  const wr = DW.create({ access, log: { log() { }, warn() { } }, relay: false, udpLeg: false, sweepMs: 60000 });
  closers.push(() => wr.shutdown());
  const r = await wr.start('win-a', { audio: true });
  ok(r.take === true && r.audio === true && /m=audio/.test(r.offer.sdp), 'start({audio}) ⇒ the agent offered the sound\'s track (the answer says audio: true)', { take: r.take, audio: r.audio });
  const pc = standIn(), rtp = [];
  pc.onTrack.subscribe((t) => { if (t.kind === 'audio') t.onReceiveRtp.subscribe(() => rtp.push(1)); });
  await pc.setRemoteDescription(r.offer);
  pc.getTransceivers().find((t) => t.kind === 'audio').setDirection('recvonly');
  await pc.setLocalDescription(await pc.createAnswer());
  await wr.answer(r.key, pc.localDescription.sdp);
  (async () => { let n = 0, seq = -1; while (!wr.facts('win-a').every((x) => x.ended)) { const p = await wr.poll(r.key, n, seq, 1000); if (!p || p.ended) break; for (const c of p.cands || []) if (c) pc.addIceCandidate(c).catch(() => { }); n = p.n; seq = p.seq; } })();
  await until(() => pc.connectionState === 'connected', 10000);
  const nRuns = FK.loopbacks().length;
  const on = await wr.sound(r.key, true);
  ok(on.ok === true && on.on === true && await until(() => rtp.length > 20, 6000) && FK.loopbacks().length === nRuns + 1, 'sound(key, true) ⇒ the agent\'s stream-audio: one capture, the packets flow', on);
  const off = await wr.sound(r.key, false);
  ok(off.ok === true && off.on === false && await until(() => FK.loopbackEnded(nRuns + 1), 4000), 'sound(key, false) ⇒ it ends on the machine');
  await wr.stop(r.key, 'closed');
  const gone = await wr.sound(r.key, true).then(() => null, (e) => e);
  ok(gone && gone.code === 'not_found', 'a stopped stream ⇒ not_found by name');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
