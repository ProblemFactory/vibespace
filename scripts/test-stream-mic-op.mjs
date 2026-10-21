#!/usr/bin/env node
// THE MICROPHONE ROAD against a REAL daemon (lane stream-mic-road, backlog B-7af0 — the THREE-TOUCH rule, test-sysinfo-op's
// shape): the `stream-mic` handler in src/agentd/agentd.js (src/desktop-mic.js — SHARED), the capability in the hello-ack, the
// client's gated streamMic + its id-keyed routing set; and the stream's audio m-line (src/agentd/stream-host.js) feeding the
// receiver. The machine's audio is a FAKE microphone sink: VIBESPACE_MIC_HELPER names a script standing in for the helper
// (its facts from a file it reads; `render` writes what it got to a file; `setdefault` rewrites its facts). A werift peer in
// THIS process stands in for the browser and sends REAL Opus (ffmpeg's libopus, a 1 kHz tone) on the m-line.
// lane ci-339-reds (the 2.369.339 runner: NO ffmpeg — spawnSync ffmpeg ENOENT): the agent's decoder is a FAKE `ffmpeg` first
// on its PATH (fixtures/stream/mic-fakes.mjs writeFakeDecoder: each Ogg page's number as its 20 ms of PCM — the road, in order,
// none lost); the tone through libopus is §2b, the box's own ffmpeg — SKIPPED BY NAME where there is none; the voice without
// an encoder = Opus-framed packets (framedVoice).
//   §0 the helpers' sources: the generated module is current (scripts/mic-helper-embed.mjs); what each helper reads
//   §1 the op: stream-mic-result by id, the facts + the PURE state; PARITY — the op's answer = the module run in-process
//   §2 THE WINDOWS ROAD: a stream asked `mic` offers an audio m-line (recvonly); the stand-in's Opus → live Ogg pages → ffmpeg →
//      s16le PCM into the helper's `render` with VS_MIC_DEVICE = «CABLE Input»'s id (the tone is in it); the stream's numbers say
//      where the voice IS going; no packet for 1.5 s ⇒ the helper's stdin closes; the next packet starts it again; a stream not
//      asked has no m=audio
//   §2b THE REAL DECODER: the same road through the box's own ffmpeg — the 1 kHz tone in the PCM (skipped by name without one)
//   §2c NO DECODER: a machine with no ffmpeg ⇒ the stream's numbers say no_ffmpeg by name (no helper started, the agent
//      answers on) — the RED control of the fake
//   §3 THE SPEAKERS ROAD: no cable ⇒ `render` with VS_MIC_SPEAKERS=1 (no default changed — setdefault never ran)
//   §4 THE MAC ROAD: a Mac-shaped fake ⇒ the helper gets the Opus packets themselves, length-framed, byte for byte
//   §5 THE DEFAULT PAIR: 「设为默认麦克风」 remembers what it replaced, 「改回」 puts it back; nothing to restore ⇒ by name
//   §6 NO ROAD: no cable and no speaker ⇒ said (no_target), no helper started
//   §7 THE CAPABILITY GATE: an older copy without stream-mic is never asked (host_needs_daemon, NO request); its offer carries
//      no `mic` and no m=audio — CONTROL: asked past the gate it answers nothing (the 2.300.0 rule)
//   §8 THE HUB (src/server/desktop-access.js over this daemon): micFacts / micDefault, the 「安装虚拟麦克风」 plan from the
//      `stream-mic` facts, its run's no_admin / no_password by name, done = the facts read again
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, endDaemonsOf } from './scratch.mjs';
import { moduleText, readTexts } from './mic-helper-embed.mjs';
import { writeFakeMic, winFacts, macFacts, toneRatio, writeFakeDecoder, pcmPages, realFfmpeg, framedVoice } from './fixtures/stream/mic-fakes.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return true; await sleep(40); } return false; };
const SM = require(path.join(REPO, 'src/stream-model.js'));
const MM = require(path.join(REPO, 'src/mic-model.js'));
const MD = require(path.join(REPO, 'src/mic-install.js'));
const DMIC = require(path.join(REPO, 'src/desktop-mic.js'));
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const w = require(path.join(REPO, 'node_modules/werift'));
const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const FIXTURE = path.join(REPO, 'scripts/fixtures/stream/fake-desk-720p.h264');
const homes = [scratchHome('smo-home', fs, ['.vibespace']), scratchHome('smo-old', fs, ['.vibespace']), scratchHome('smo-nodec', fs, ['.vibespace'])];
const [home, homeOld, homeNoDec] = homes;
const work = scratch('smo-work'); fs.mkdirSync(work, { recursive: true });
const rootOf = (h) => path.join(h, 'agentd-root');
const devices = [], peers = [];
const cleanup = () => { for (const p of peers) { try { p.close(); } catch { } } for (const d of devices) { try { d.stop(); } catch { } } for (const h of homes) endDaemonsOf(rootOf(h)); for (const d of [...homes, work]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);

// ── THE FAKE MICROPHONE SINK (scripts/fixtures/stream/mic-fakes.mjs): the helper's three commands, recording what the daemon handed it ──
const FK = writeFakeMic(path.join(work, 'fake'));
const FAKE = FK.exe, FD = FK.dir;
const { setFacts, renders, ended, binOf } = FK;
// lane ci-339-reds: THE FAKE DECODER, first on the scratch agents' PATH; the box's own ffmpeg (null on the Actions runner)
const PATH0 = process.env.PATH || '';
const DEC = writeFakeDecoder(path.join(work, 'decoder'));
const REAL_FF = realFfmpeg(PATH0, [DEC.dir]);

// ── THE VOICE: 1.2 s of a 1 kHz tone through libopus (20 ms frames, stereo), its packets read out of the Ogg pages ──
const OPUS = path.join(work, 'tone.opus');
if (REAL_FF) execFileSync(REAL_FF, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=1.2', '-ac', '2', '-c:a', 'libopus', '-b:a', '64k', '-frame_duration', '20', '-application', 'voip', '-f', 'ogg', OPUS]);
else console.log('  (no ffmpeg on this box — the voice is 60 Opus-FRAMED packets of 20 ms, seeded bytes, no encoder: the fake decoder and the Mac road read them; the tone is §2b\'s, skipped by name)');
function oggPackets(buf) {
  const out = []; let cur = []; let i = 0;
  while (i + 27 <= buf.length && buf.toString('latin1', i, i + 4) === 'OggS') {
    const nseg = buf[i + 26], lace = buf.subarray(i + 27, i + 27 + nseg); let p = i + 27 + nseg;
    for (const l of lace) { cur.push(buf.subarray(p, p + l)); p += l; if (l < 255) { out.push(Buffer.concat(cur)); cur = []; } }
    i = p;
  }
  return out;
}
const PACKETS = REAL_FF ? oggPackets(fs.readFileSync(OPUS)).slice(2) : framedVoice(60); // OpusHead + OpusTags first
function deviceOn(h, bundlePath = BUNDLE, env = {}) {
  process.env.HOME = h; process.env.VIBESPACE_AGENTD_ROOT = rootOf(h);
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const dataDir = path.join(h, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  const dm = new DeviceManager({ dataDir, bundlePath, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  devices.push(dm);
  return dm;
}
/** The browser's stand-in: a FULL ICE agent with Opus; it answers the microphone's m-line SENDONLY with a track (the page's way). */
function standIn() {
  const pc = new w.RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:9' }], iceStunGatherTimeout: 0.2, iceUseIpv6: false, codecs: { video: [SM.STREAM_CODEC].map((C) => new w.RTCRtpCodecParameters({ mimeType: C.mimeType, clockRate: C.clockRate, rtcpFeedback: C.rtcpFeedback.map((f) => ({ ...f })), parameters: C.fmtp })), audio: [w.useOPUS()] } });
  peers.push(pc);
  return pc;
}
async function micStream(dm, { mic = true } = {}) {
  const pushes = [];
  const pc = standIn();
  const off = await dm.streamOffer({ sourceKind: 'fake', sourceId: FIXTURE, ...(mic ? { mic: true } : {}) }, { onPush: (m) => { pushes.push(m); if (m.op === 'stream-ice' && m.candidate) pc.addIceCandidate(m.candidate).catch(() => { }); } });
  await pc.setRemoteDescription(off.offer);
  const tr = pc.getTransceivers().find((t) => t.kind === 'audio') || null;
  let track = null;
  if (tr) { tr.setDirection('sendonly'); track = new w.MediaStreamTrack({ kind: 'audio' }); await tr.sender.replaceTrack(track); }
  await pc.setLocalDescription(await pc.createAnswer());
  const ans = await dm.streamAnswer(off.sid, { answer: { type: 'answer', sdp: pc.localDescription.sdp } });
  const connected = await until(() => pc.connectionState === 'connected', 10000);
  const pt = tr ? ((tr.codecs || []).find((c) => /opus/i.test(c.mimeType)) || {}).payloadType || 111 : null;
  let seq = 1, ts = 4800;
  const send = async (pkts, gapMs = 20) => { for (const p of pkts) { track.writeRtp(new w.RtpPacket(new w.RtpHeader({ payloadType: pt, sequenceNumber: seq++ & 0xffff, timestamp: ts >>> 0, marker: false, ssrc: 0x51c0ffee }), p)); ts += 960; await sleep(gapMs); } };
  const micStats = () => { const s = [...pushes].reverse().find((m) => m.op === 'stream-stats' && m.stats); return s ? s.stats.mic : undefined; };
  return { off, pc, tr, ans, connected, send, pushes, micStats };
}

const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const CAP_LIST = /capabilities: \[([^\]]*)\]/;
const capsOf = (txt) => { const m = CAP_LIST.exec(txt); return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : null; };

console.log('§0 the helpers\' sources');
{
  ok(fs.readFileSync(path.join(REPO, 'src/mic-helper-source.js'), 'utf8') === moduleText(readTexts()), 'src/mic-helper-source.js is the generated text of tools/vibespace-mic/ (run node scripts/mic-helper-embed.mjs after editing them)');
  const S = require(path.join(REPO, 'src/mic-helper-source.js'));
  ok(/static int Main\(string\[\] args\)/.test(S.WIN) && /cmd == "facts"/.test(S.WIN) && /cmd == "render"/.test(S.WIN) && /cmd == "setdefault"/.test(S.WIN) && /GetEnvironmentVariable\("VS_MIC_DEVICE"\)/.test(S.WIN) && /GetEnvironmentVariable\("VS_MIC_SPEAKERS"\)/.test(S.WIN) && !/args\[1\]/.test(S.WIN), 'the Windows helper: facts / render / setdefault; its names come from the ENV (VS_MIC_DEVICE / VS_MIC_SPEAKERS), never argv');
  ok(/AUTOCONVERTPCM|0x80000000/.test(S.WIN) && /SetDefaultEndpoint/.test(S.WIN) && /f8679f50-850a-41cf-9c72-430f290290c8/.test(S.WIN) && !/Capture|IAudioCaptureClient/.test(S.WIN.replace(/flow == 0 \? "render" : "capture"/g, '')), 'it renders (shared mode, the engine converts) and sets the default capture endpoint (IPolicyConfig) — it never captures anything');
  ok(/case "render": exit\(render\(\)\)/.test(S.MAC) && /kAudioFormatOpus/.test(S.MAC) && /env\["VS_MIC_DEVICE"\]/.test(S.MAC) && /kAudioHardwarePropertyDefaultInputDevice/.test(S.MAC) && !/AVCaptureDevice|kAudioObjectPropertyScopeInput, &a, 0, nil, &size, &p\b/.test(S.MAC), 'the Mac helper: renders length-framed Opus (AudioToolbox decodes) to a device by UID from the ENV; it never reads a microphone (no TCC grant needed)');
  ok(/#define kDeviceUID "VibeSpaceMic_UID"/.test(S.PLUGIN_C) && /CFSTR\("VibeSpace Microphone"\)/.test(S.PLUGIN_C) && /<string>app\.vibespace\.audio\.mic<\/string>/.test(S.PLUGIN_PLIST) && /6C2F3A8E-1B7D-4E5A-9C0F-3D2B1A4E5F60/.test(S.PLUGIN_PLIST), 'the plug-in keeps the UID the owner\'s installed copy answers (VibeSpaceMic_UID), its name and its factory');
  ok(S.PLUGIN_C.split('\n').slice(10).join('\n') === fs.readFileSync(path.join(REPO, 'scripts/probes/stream-audio/mac/vsmic/vsmic.c'), 'utf8').split('\n').slice(fs.readFileSync(path.join(REPO, 'scripts/probes/stream-audio/mac/vsmic/vsmic.c'), 'utf8').split('\n').findIndex((l) => l.startsWith('#include'))).join('\n'), 'the plug-in\'s code IS the probe\'s measured build (only its head differs)');
}

console.log('§1 the op: the facts, by id, and PARITY with the module');
setFacts(winFacts());
const dm = deviceOn(home, BUNDLE, { VIBESPACE_MIC_HELPER: FAKE, PATH: DEC.dir + path.delimiter + PATH0 }); // lane ci-339-reds: the fake decoder first
const conn = await dm.connect();
delete process.env.VIBESPACE_MIC_HELPER; process.env.PATH = PATH0;
ok(conn.info.capabilities.includes('stream-mic') && capsOf(bundleText).includes('"stream-mic"') && /stream-mic-result/.test(bundleText) && /function createMic\(/.test(bundleText), 'the hello-ack names stream-mic; the bundle answers stream-mic-result and carries src/desktop-mic.js (run `npm run build:agentd` after a change)');
const f1 = await dm.streamMic();
ok(f1.ok && f1.platform === 'win32' && f1.state.state === 'installed' && f1.state.mic.name === 'CABLE Output (VB-Audio Virtual Cable)' && f1.state.render.id === 'cab-in' && f1.state.micIsDefault === false && f1.installedAt === null && f1.previous === null, 'stream-mic ⇒ the facts + the PURE verdict: VB-CABLE installed, the agent writes CABLE Input, apps pick CABLE Output', f1.state);
const local = DMIC.createMic({ platform: 'linux', spawn: require('child_process').spawn, execFile: require('child_process').execFile, env: { PATH: process.env.PATH, HOME: home }, lookupEnv: process.env, home, helperPath: FAKE });
const f1b = await local.facts();
ok(JSON.stringify({ e: f1.endpoints, d: f1.defaults, s: f1.state }) === JSON.stringify({ e: f1b.endpoints, d: f1b.defaults, s: f1b.state }), 'PARITY: the op\'s answer = src/desktop-mic.js run in-process over the same machine (one implementation where the facts live)');
const cli = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
ok(/m\.op === 'stream-mic-result'/.test(cli) && /daemon lacks stream-mic \(capabilities gate\)/.test(cli), 'THREE-TOUCH: stream-mic-result is in the client\'s id-keyed routing set; the method is capability-gated');

console.log('§2 THE WINDOWS ROAD: Opus → Ogg pages → ffmpeg (the fake decoder) → PCM → «CABLE Input»');
{
  const s0 = await micStream(dm);
  const sdp = s0.off.offer.sdp;
  ok(s0.off.ok && s0.off.mic === true && /m=audio [\s\S]*a=recvonly/.test(sdp) && /a=rtpmap:\d+ opus\/48000\/2/i.test(sdp) && /a=group:BUNDLE 0 1 2/.test(sdp), 'a stream asked `mic` offers an audio m-line the agent RECEIVES on (recvonly, Opus 48 kHz) inside the one BUNDLE', sdp.split(/\r?\n/).filter((l) => /^m=|recvonly|opus|BUNDLE/i.test(l)));
  ok(s0.ans.ok && s0.connected && s0.tr, 'the stand-in answered it SENDONLY and connected');
  ok(PACKETS.length >= 55, `the voice: ${PACKETS.length} Opus packets of 20 ms (${REAL_FF ? 'libopus' : 'framed — no encoder on this box'})`);
  await s0.send(PACKETS.slice(0, 50));
  const started = await until(() => renders().length === 1, 5000);
  const r1 = renders()[0] || {};
  ok(started && r1.device === 'cab-in' && r1.speakers === false && JSON.stringify(r1.argv) === '["render"]', 'the first packets started ONE render with VS_MIC_DEVICE = «CABLE Input»\'s id — the argv names nothing', r1);
  const live = await until(() => { const m = s0.micStats(); return m && m.state === 'live'; }, 4000);
  const ms = s0.micStats() || {};
  ok(live && ms.to === 'virtual' && ms.mic && ms.mic.name === 'CABLE Output (VB-Audio Virtual Cable)' && ms.device.name === 'CABLE Input (VB-Audio Virtual Cable)' && ms.packets > 0, 'the stream\'s numbers say where the voice IS going: the virtual microphone «CABLE Output» (the page says it)', ms);
  ok(await until(() => { const m = s0.micStats(); return m && m.packets === 50 && m.dropped === 0; }, 4000), 'every packet sent was counted, none dropped (50)', s0.micStats());
  const closed = await until(() => ended(1), MM.MIC_LIMITS.idleMs + 4000);
  const pcm = binOf(1), runs = pcmPages(pcm), dec = DEC.decodes()[0] || {};
  ok(closed && pcm.length === 50 * 960 * 4 && runs.length === 50 && runs.every((r, i) => r.seq === i + 2 && r.frames === 960) && dec.head && dec.tags && dec.packets === 50 && !dec.bad && JSON.stringify(dec.argv) === JSON.stringify(MM.DECODER_ARGS), `no packet for ${MM.MIC_LIMITS.idleMs} ms ⇒ the helper's stdin closed; it got ${(pcm.length / 4 / 48000).toFixed(2)} s of s16le 48 kHz stereo PCM — the decoder (the fake, asked with the receiver's own DECODER_ARGS) read OpusHead + OpusTags, then Ogg pages 2…51 IN ORDER, each packet's 20 ms reaching the helper (none lost)`, { bytes: pcm.length, runs: runs.slice(0, 4), dec: { ...dec, seqs: (dec.seqs || []).length } });
  const idle = await until(() => { const m = s0.micStats(); return m && m.state === 'idle' && m.ended && m.ended.why === 'idle'; }, 3000);
  ok(idle, 'the numbers say the road went idle (why: idle) — the stream itself plays on', s0.micStats());
  await s0.send(PACKETS.slice(0, 10));
  ok(await until(() => renders().length === 2, 5000) && renders()[1].device === 'cab-in', 'the next packet starts the road again (a second run)');
  await dm.streamStop(s0.off.sid, { why: 'closed' });
  ok(await until(() => ended(2), 4000), 'the stream\'s end ends the road (the helper\'s stdin closed)');
  s0.pc.close();
  const plain = await micStream(dm, { mic: false });
  ok(plain.off.ok && !/m=audio/.test(plain.off.offer.sdp) && plain.off.mic === undefined && !plain.tr, 'a stream NOT asked `mic` (an older page) has no m=audio at all');
  await dm.streamStop(plain.off.sid); plain.pc.close();
}

console.log('§2b THE REAL DECODER: the same road through the box\'s own ffmpeg (libopus) — the 1 kHz tone in the PCM');
if (!REAL_FF) console.log('  SKIP §2b the real decoder: no ffmpeg on this box (its PATH searched) — the tone through libopus is judged where there is one; §2 proved the road with the fake');
else {
  DEC.useReal(REAL_FF); // the fake hands its stdio to the real one
  const n0 = renders().length;
  const s = await micStream(dm);
  await s.send(PACKETS.slice(0, 50));
  const closed = await until(() => renders().length === n0 + 1 && ended(n0 + 1), MM.MIC_LIMITS.idleMs + 6000);
  const pcm = binOf(n0 + 1), ratio = toneRatio(pcm), dec = DEC.decodes().pop() || {};
  ok(closed && dec.real === REAL_FF && pcm.length >= 0.7 * 48000 * 4 && ratio > 50, `the real ffmpeg (${REAL_FF}) decoded the stand-in's libopus: the helper got ${(pcm.length / 4 / 48000).toFixed(2)} s of PCM with the 1 kHz tone in it (1 kHz / 3 kHz energy ${ratio.toFixed(0)}×)`, { bytes: pcm.length, ratio, real: dec.real });
  await dm.streamStop(s.off.sid); s.pc.close();
  DEC.useReal(null);
}

console.log('§2c NO DECODER: a machine with no ffmpeg ⇒ said by name — the RED control of the fake');
{
  // an agent whose PATH holds no ffmpeg at all (the fake's dir and every dir with one left out — the Actions runner's case)
  const noFf = [path.dirname(process.execPath), ...PATH0.split(path.delimiter).filter((d) => d && d !== DEC.dir && !realFfmpeg(d))].join(path.delimiter);
  const dmN = deviceOn(homeNoDec, BUNDLE, { VIBESPACE_MIC_HELPER: FAKE, PATH: noFf });
  await dmN.connect();
  delete process.env.VIBESPACE_MIC_HELPER; process.env.PATH = PATH0;
  setFacts(winFacts());
  const n0 = renders().length, d0 = DEC.decodes().length;
  const s = await micStream(dmN);
  await s.send(PACKETS.slice(0, 15));
  const said = await until(() => { const m = s.micStats(); return m && m.state === 'no_target' && m.code === 'no_ffmpeg'; }, 5000);
  const m = s.micStats() || {};
  await sleep(300);
  const again = await dmN.streamMic();
  ok(said && /no ffmpeg/.test(m.error || '') && renders().length === n0 && DEC.decodes().length === d0 && again.ok === true && s.pc.connectionState === 'connected', `no ffmpeg on the machine ⇒ the stream's numbers say no_ffmpeg («${m.error}») — the strip's words (MM.micRoadWords): no helper started, nothing decoded, the agent answers on and the picture plays`, { m, renders: renders().length - n0, decodes: DEC.decodes().length - d0, again: again.ok });
  const w = MM.micRoadWords(again.state, { state: m.state, code: m.code, to: m.to });
  ok(w.road === null && w.refused === 'no_ffmpeg' && /ffmpeg/.test(w.key) && w.params.dir === '%LOCALAPPDATA%\\vibespace\\ffmpeg\\bin', 'the strip says it by name (micRoadWords: the machine has no ffmpeg — where to put one), never the facts\' road (the virtual microphone it never reached)', w);
  await dmN.streamStop(s.off.sid); s.pc.close();
}

console.log('§3 THE SPEAKERS ROAD: no virtual microphone ⇒ the default speaker, said');
{
  setFacts(winFacts({ cable: false })); await dm.streamMic({ force: true });
  const n0 = renders().length;
  const s = await micStream(dm);
  await s.send(PACKETS.slice(0, 15));
  ok(await until(() => renders().length === n0 + 1, 5000), 'one render started');
  const r = renders()[n0];
  ok(r && r.speakers === true && r.device === null, 'render with VS_MIC_SPEAKERS=1 — the default speaker, no device named', r);
  ok(await until(() => { const m = s.micStats(); return m && m.state === 'live' && m.to === 'speakers' && m.device.name === 'Speakers (Sound Blaster X3)' && m.mic === null; }, 4000), 'the numbers say the speakers (the strip says 「对方电脑会从扬声器播放你的声音」)', s.micStats());
  ok(FK.setdefaults().length === 0, 'no default device was changed (setdefault never ran)');
  await dm.streamStop(s.off.sid); s.pc.close();
}

console.log('§4 THE MAC ROAD: the Opus packets themselves, length-framed');
{
  setFacts(macFacts()); const mf = await dm.streamMic({ force: true });
  ok(mf.ok && mf.platform === 'darwin' && mf.state.which === 'vibespace-mic' && mf.state.render.uid === 'VibeSpaceMic_UID', 'a Mac-shaped machine: «VibeSpace Microphone» installed (by its UID)', mf.state);
  const n0 = renders().length;
  const s = await micStream(dm);
  const sent = PACKETS.slice(0, 25);
  await s.send(sent);
  ok(await until(() => renders().length === n0 + 1, 5000) && renders()[n0].device === 'VibeSpaceMic_UID', 'render with VS_MIC_DEVICE = the plug-in\'s UID');
  await dm.streamStop(s.off.sid); s.pc.close();
  ok(await until(() => ended(n0 + 1), 4000), 'its stdin closed with the stream');
  const bin = binOf(n0 + 1), got = [];
  for (let i = 0; i + 4 <= bin.length;) { const len = bin.readUInt32LE(i); got.push(bin.subarray(i + 4, i + 4 + len)); i += 4 + len; }
  ok(got.length === sent.length && got.every((p, i) => Buffer.compare(p, sent[i]) === 0), `the helper got the ${sent.length} Opus packets byte for byte, each behind its u32 length (AudioToolbox decodes them there — no ffmpeg on a Mac)`, { got: got.length });
}

console.log('§5 THE DEFAULT PAIR');
{
  setFacts(winFacts()); await dm.streamMic({ force: true });
  const r1 = await dm.streamMic({ action: 'default', to: 'virtual', by: 'system:test-stream-mic-op' });
  ok(r1.ok && r1.to === 'virtual' && r1.device.name === 'CABLE Output (VB-Audio Virtual Cable)' && r1.facts.state.micIsDefault === true && r1.facts.previous && r1.facts.previous.id === 'mic-1', '「设为默认麦克风」: CABLE Output is the default microphone; the device remembers what it replaced', r1.facts && { st: r1.facts.state, prev: r1.facts.previous });
  ok(FK.setdefaults().pop() === 'cab-out' && JSON.parse(fs.readFileSync(path.join(home, '.vibespace', 'mic-default.json'), 'utf8')).previous.id === 'mic-1', 'the helper was handed CABLE Output\'s id on its env; ~/.vibespace/mic-default.json holds the previous one');
  const again = await dm.streamMic({ action: 'default', to: 'virtual', by: 'system:test-stream-mic-op' });
  ok(!again.ok && again.code === 'already_default', 'asked twice ⇒ already_default by name');
  const r2 = await dm.streamMic({ action: 'default', to: 'restore', by: 'system:test-stream-mic-op' });
  ok(r2.ok && r2.device.name === 'Mic (Sound Blaster X3)' && r2.facts.state.micIsDefault === false && r2.facts.previous === null && !fs.existsSync(path.join(home, '.vibespace', 'mic-default.json')), '「改回」: the owner\'s microphone is the default again; the record is gone');
  const r3 = await dm.streamMic({ action: 'default', to: 'restore', by: 'system:test-stream-mic-op' });
  ok(!r3.ok && r3.code === 'nothing_to_restore' && (await dm.streamMic({ action: 'default', to: 'bogus', by: 'system:test-stream-mic-op' })).code === 'bad_request', 'nothing to put back ⇒ nothing_to_restore; a bad `to` ⇒ bad_request');
}

console.log('§6 NO ROAD');
{
  setFacts(winFacts({ cable: false, speaker: false })); await dm.streamMic({ force: true });
  const n0 = renders().length;
  const s = await micStream(dm);
  await s.send(PACKETS.slice(0, 15));
  ok(await until(() => { const m = s.micStats(); return m && m.state === 'no_target' && m.code === 'no_target' && m.packets > 0; }, 4000) && renders().length === n0, 'no cable and no speaker ⇒ no_target, said in the numbers — no helper started', s.micStats());
  await dm.streamStop(s.off.sid); s.pc.close();
  setFacts(winFacts());
}

console.log('§7 THE CAPABILITY GATE');
{
  const oldText = bundleText.replace(CAP_LIST, (all, inner) => `capabilities: [${inner.split(',').map((x) => x.trim()).filter((x) => x && x !== '"stream-mic"').join(', ')}]`).replace('if (msg.op === "stream-mic") {', 'if (false) {').replace('const wantMic = msg.mic === true && typeof mic === "function";', 'const wantMic = false;');
  ok(capsOf(oldText).length === capsOf(bundleText).length - 1 && oldText.includes('const wantMic = false;'), 'the old copy lacks stream-mic (by content), its handler and the m-line');
  const oldBundle = path.join(work, 'old', 'vibespace-agentd.js'); fs.mkdirSync(path.dirname(oldBundle), { recursive: true }); fs.writeFileSync(oldBundle, oldText);
  const dmo = deviceOn(homeOld, oldBundle);
  const co = await dmo.connect();
  const sent = [];
  const send0 = dmo._request.bind(dmo);
  dmo._request = (msg) => { sent.push(msg); return send0(msg); };
  const e1 = await dmo.streamMic().then(() => null, (x) => x);
  ok(e1 && e1.code === 'host_needs_daemon' && e1.daemonVersion === co.info.daemonVersion && sent.length === 0, 'an older agent is refused by the capability (host_needs_daemon + its version) — NO request went to it');
  const s = await dmo.streamOffer({ sourceKind: 'fake', sourceId: FIXTURE, mic: true });
  ok(s.ok && sent.length === 1 && sent[0].op === 'stream-offer' && !('mic' in sent[0]) && !/m=audio/.test(s.offer.sdp), 'its stream is offered WITHOUT asking `mic` (the hub never sends it to an older agent) — no m=audio, the picture as before');
  await dmo.streamStop(s.sid);
  const raw = await send0({ op: 'stream-mic', action: 'facts', timeoutMs: 1500 }).then((r) => ({ answered: r }), (x) => ({ error: String(x && x.message) }));
  ok(!raw.answered && /time(?:d)? ?out/i.test(raw.error || ''), 'CONTROL: asked past the gate, the old agent answers NOTHING — the request ends on its own timeout (the 2.300.0 rule)', raw);
  dmo.stop(); endDaemonsOf(rootOf(homeOld));
}

console.log('§8 THE HUB: desktop-access over this daemon');
{
  const as = (platform, over = {}) => new Proxy(dm, { get(t, k) { if (k === 'status') return () => { const s = t.status(); return { ...s, info: s.info ? { ...s.info, platform } : s.info }; }; if (k in over) return over[k]; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const mk = (map) => ACC.create({ hosts: { get: (h) => (map[h] ? { id: h } : null), isLocal: () => false, deviceBounded: async (h) => map[h], list: () => Object.keys(map).map((id) => ({ id, name: id, transport: 'dial', online: true })), linkState: () => 'online', connectedDevice: (h) => map[h] || null }, install: false, log: { log: () => { }, warn: () => { } } });
  const acc = mk({ 'win-m': as('win32') });
  const mf = await acc.micFacts('win-m', { force: true });
  ok(mf.state.state === 'installed' && mf.doors.make === true && mf.doors.restore === false && mf.words.road === 'virtual', 'micFacts: the state, the 「设为默认麦克风」 door, the words — over the real agent');
  let loc = null; try { await acc.micFacts('local'); } catch (e) { loc = e; }
  ok(loc && loc.code === 'not_desktop_machine', 'this machine itself is refused by name');
  const md = await acc.micDefault('win-m', 'virtual');
  ok(md.state.micIsDefault === true && md.doors.restore === true, 'micDefault: the default moved, 「改回」 offered');
  await acc.micDefault('win-m', 'restore');
  setFacts(winFacts({ cable: false })); await dm.streamMic({ force: true });
  const pl = await acc.installPlan('win-m', 'virtual-mic');
  ok(pl.plan.ok && pl.plan.which === 'vbcable' && pl.digest && pl.mic && pl.mic.state.state === 'absent', 'the 「安装虚拟麦克风」 plan is planned from the agent\'s stream-mic facts (absent ⇒ VB-CABLE), with its digest');
  const accNo = mk({ 'win-m': as('win32', { runStream: async (cmd, args, o) => { o.onData?.(Buffer.from('Windows granted no administrator rights - nothing was installed\n')); return { code: MD.MIC_NO_ADMIN_EXIT }; } }) });
  let na = null; try { await accNo.installPackage('win-m', { what: 'virtual-mic', expectDigest: pl.digest }); } catch (e) { na = e; }
  ok(na && na.code === 'no_admin' && /Windows/.test(na.message) && na.plan && !accNo.installBusy('win-m'), 'nobody clicked Yes ⇒ no_admin by name, the plan handed back, the slot free', na && na.code);
  setFacts(macFacts()); await dm.streamMic({ force: true });
  setFacts({ ...macFacts(), devices: macFacts().devices.slice(0, 2) }); await dm.streamMic({ force: true });
  let envSeen = null;
  const accMac = mk({ 'mac-m': as('darwin', { runStream: async (cmd, args, o) => { envSeen = { cmd, args, env: o.env }; return { code: MD.MIC_NO_PASSWORD_EXIT }; } }) });
  const mpl = await accMac.installPlan('mac-m', 'virtual-mic', { lang: 'zh' });
  ok(mpl.plan.ok && mpl.plan.which === 'blackhole' && /no plug-in|fake helper/.test(mpl.plan.fallbackWhy || ''), 'a Mac whose plug-in was not staged ⇒ BlackHole 2ch (the reason said)', mpl.plan.fallbackWhy);
  let np = null; try { await accMac.installPackage('mac-m', { what: 'virtual-mic', expectDigest: mpl.digest, planOpts: { lang: 'zh' } }); } catch (e) { np = e; }
  ok(np && np.code === 'no_password' && envSeen && envSeen.cmd === '/bin/sh' && envSeen.env && envSeen.env.VS_MIC_WHAT === 'blackhole' && envSeen.env.VS_MIC_PROMPT === MD.MIC_PROMPTS.zh.blackhole && !JSON.stringify(envSeen.args).includes(envSeen.env.VS_MIC_PROMPT), 'the Mac\'s dialog withdrawn after its wait ⇒ no_password by name; every name rode the run\'s ENV (the prompt in the page\'s language), none its argv', np && np.code);
  setFacts(winFacts({ cable: false })); await dm.streamMic({ force: true });
  const accOk = mk({ 'win-m': as('win32', { runStream: async () => { setFacts(winFacts({ cable: true })); return { code: 0 }; } }) }); // the install puts the cable there
  const okPl = await accOk.installPlan('win-m', 'virtual-mic');
  const done = await accOk.installPackage('win-m', { what: 'virtual-mic', expectDigest: okPl.digest });
  ok(done.ok && done.after && done.after.state && done.after.state.state === 'installed', 'the install exits 0 ⇒ the machine\'s microphone facts are read again (installed — the route\'s done)', done.after && done.after.state);
}

dm.stop(); endDaemonsOf(rootOf(home));
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
