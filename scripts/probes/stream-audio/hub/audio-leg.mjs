// audio-leg.mjs — VibeSpace lane stream-audio-probe (probe only; nothing in src/ calls it).
//
// THE WEBRTC AUDIO ROAD, hub side, a FAKE machine: our werift (the agent's, 0.25.0) offers what a machine stream would carry
// PLUS audio, and a real headless Chrome answers:
//   video   the fake H.264 desk (scripts/fixtures/stream/fake-desk-720p.h264) — audio rides BESIDE the picture
//   speaker an Opus Ogg (tones at known times) → RTP on an audio transceiver (sendrecv, ONE msid with the video)
//   dc      the SAME Opus frames over a data channel `audio` (unordered, no retransmits) → WebCodecs AudioDecoder →
//           an AudioWorklet player: the fallback road if werift could not packetize Opus
//   mic     Chrome's fake microphone (a WAV with tones) → the same audio m-line back → werift receives Opus RTP
// Every onset is stamped on ONE clock (this machine's): the packet send/arrival here, the page's AudioWorklet there.
//
//   node audio-leg.mjs [--secs 8] [--runs 1] [--jitter MS] [--dc-target-frames 960] [--no-video] [--no-mic] [--no-audio]
//                      [--dc-ordered] [--unmute] [--out result.json]
// Env: WT = the repo (default: this file's tree — werift, the fake H.264, src/stream-h264.js), CHROME = the browser,
//   PIN_ADDR = the ONE local IPv4 werift binds (default: the first 192.168.x — see THE PIN below), OFFER_ADDR / ANSWER_CANDS=udp4
//   (candidate filters, the bisect), CHROME_EXTRA (more flags), CHROME_LOG (Chrome's stderr to a file).
// THE PIN (measured 2026-10-19, Chrome 154 ↔ werift 0.25 on one multi-homed host): with every interface offered, Chrome
// nominated three pairs (tailnet first, LAN later) and moved to a LAN pair; werift's ICE-lite kept sending DTLS to the FIRST
// nominated pair (its flight-2 answer to 100.x while the ClientHello came from 192.168.x — udp-sendlog.mjs shows it), so the
// handshake never completed (both sides "connecting", Chrome retransmitting ClientHello). One local address ⇒ one pair.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WT = process.env.WT || path.resolve(HERE, '../../../..');
const require = createRequire(path.join(WT, 'package.json'));
const w = require('werift');
const H = require(path.join(WT, 'src/stream-h264.js'));
const CHROME = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SECS = Number(arg('secs', 8)), JITTER = Number(arg('jitter', 0)), DC_TARGET = Number(arg('dc-target-frames', 960)), RUNS = Number(arg('runs', 1));
const PIN = process.env.PIN_ADDR || (Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal && /^192\.168\./.test(a.address)) || {}).address || null;
const VIDEO = !process.argv.includes('--no-video'), OUT = arg('out', null), MIC = !process.argv.includes('--no-mic'), DC_ORDERED = process.argv.includes('--dc-ordered');
const now = () => performance.timeOrigin + performance.now();
const r2 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 100) / 100);
const sleep = (ms) => new Promise((res) => setTimeout(res, Math.max(0, ms)));
const pct = (xs) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y), q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))]; return { n: a.length, p50: r2(q(0.5)), p95: r2(q(0.95)), min: r2(a[0]), max: r2(a[a.length - 1]) }; };

// ── fixtures (made here with the hub's ffmpeg; tones = 200 ms of 1 kHz at -20 dBFS) ─────────────────────────────────────────
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-audio-leg-'));
const SPK_TONES = [1.0, 2.5, 4.0, 5.5], MIC_TONES = [1.0, 2.5];
const tonesExpr = (ts) => `0.1*sin(2*PI*1000*t)*(${ts.map((t) => `between(t\\,${t}\\,${t + 0.2})`).join('+')})`;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=${tonesExpr(SPK_TONES)}|${tonesExpr(SPK_TONES)}:s=48000:d=${SECS}`,
  '-c:a', 'libopus', '-b:a', '64k', '-frame_duration', '20', '-page_duration', '20000', path.join(FIX, 'speaker.ogg')]);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=${tonesExpr(MIC_TONES)}:s=48000:d=4`, '-c:a', 'pcm_s16le', path.join(FIX, 'mic.wav')]);

function oggPackets(buf) {
  const out = []; let o = 0, pending = [];
  while (o + 27 <= buf.length && buf.toString('latin1', o, o + 4) === 'OggS') {
    const nseg = buf[o + 26], lace = buf.subarray(o + 27, o + 27 + nseg), granule = Number(buf.readBigInt64LE(o + 6));
    let p = o + 27 + nseg;
    for (const l of lace) { pending.push(buf.subarray(p, p + l)); p += l; if (l < 255) { out.push({ data: Buffer.concat(pending), granule }); pending = []; } }
    o = p;
  }
  return out;
}
const spk = oggPackets(fs.readFileSync(path.join(FIX, 'speaker.ogg')));
const head = spk.shift(); spk.shift(); // OpusHead, OpusTags
const PRESKIP = head.data.readUInt16LE(10);
// the packet holding each tone's first sample: packet k covers decoded samples [k*960 - preSkip, (k+1)*960 - preSkip)
const toneIdx = SPK_TONES.map((t) => Math.floor((Math.round(t * 48000) + PRESKIP) / 960));

// ── a minimal Ogg Opus writer (the received mic packets → ffmpeg decodes them here) ────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; } return t; })();
function oggPage(serial, seq, granule, flags, packet) {
  const lace = []; let n = packet.length; while (n >= 255) { lace.push(255); n -= 255; } lace.push(n);
  const h = Buffer.alloc(27 + lace.length); h.write('OggS', 0); h[4] = 0; h[5] = flags; h.writeBigInt64LE(BigInt(granule), 6); h.writeUInt32LE(serial, 14); h.writeUInt32LE(seq, 18); h[26] = lace.length; Buffer.from(lace).copy(h, 27);
  const page = Buffer.concat([h, packet]); let c = 0; for (const b of page) c = ((c << 8) ^ CRC[((c >>> 24) ^ b) & 255]) >>> 0; page.writeUInt32LE(c, 22); return page;
}
function oggOpus(packets, channels = 2) {
  const head = Buffer.alloc(19); head.write('OpusHead', 0); head[8] = 1; head[9] = channels; head.writeUInt16LE(0, 10); head.writeUInt32LE(48000, 12);
  const tags = Buffer.concat([Buffer.from('OpusTags'), Buffer.from([4, 0, 0, 0]), Buffer.from('lane'), Buffer.alloc(4)]);
  const pages = [oggPage(1, 0, 0, 2, head), oggPage(1, 1, 0, 0, tags)];
  packets.forEach((p, i) => pages.push(oggPage(1, i + 2, p.granule, i === packets.length - 1 ? 4 : 0, p.data)));
  return Buffer.concat(pages);
}
function toneOnsets(pcmS16, channels) { // the same 1 kHz rule as the worklet, over decoded s16le
  const n = 96, coeff = 2 * Math.cos(2 * Math.PI * 1000 / 48000), hist = new Array(50).fill(0); let k = 0, s1 = 0, s2 = 0, hi = 0, start = 0, last = -1e12; const on = [];
  for (let f = 0; f * 2 * channels < pcmS16.length; f++) {
    const x = pcmS16.readInt16LE(f * 2 * channels) / 32768; if (k === 0) start = f;
    const s0 = x + coeff * s1 - s2; s2 = s1; s1 = s0; k++;
    if (k < n) continue;
    const amp = 2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / n, base = Math.max(...hist);
    if (amp > 0.02 && amp > 3 * base && start - last > n * 150) { on.push(start); last = start; }
    hist[hi] = amp; hi = (hi + 1) % 50; k = 0; s1 = s2 = 0;
  }
  return on;
}

// ── the page server + Chrome over CDP ──────────────────────────────────────────────────────────────────────────────────────
const srv = http.createServer((req, res) => {
  const f = req.url === '/worklet.js' ? 'worklet.js' : 'page.html';
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(fs.readFileSync(path.join(HERE, f)));
});
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const cdpPort = 20000 + Math.floor(Math.random() * 20000), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-audio-chrome-'));
// --mute-audio: nothing reaches the hub's speakers (the graph still runs on Chrome's output clock)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox', `--user-data-dir=${prof}`,
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${path.join(FIX, 'mic.wav')}`, ...(process.env.CHROME_EXTRA ? process.env.CHROME_EXTRA.split(' ') : []), `http://127.0.0.1:${srv.address().port}/`], { stdio: process.env.CHROME_LOG ? ['ignore', 'ignore', fs.openSync(process.env.CHROME_LOG, 'w')] : 'ignore' });
let target = null;
for (let i = 0; i < 100 && !target; i++) { await sleep(100); try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find((t) => t.type === 'page'); } catch { } }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((res) => ws.addEventListener('open', res));
let cdpId = 0; const pending = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const cdp = (method, params) => new Promise((res) => { const id = ++cdpId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
for (let i = 0; i < 50; i++) { if (await evaluate('typeof window.run === "function"')) break; await sleep(100); }

async function oneRun(runNo) {
  const pc = new w.RTCPeerConnection({
    codecs: { audio: [w.useOPUS()], video: [w.useH264()] },
    iceLite: true, iceServers: [], bundlePolicy: 'max-bundle', iceUseIpv6: false,
    // ONE path on this multi-homed hub (measured: werift ICE-lite keeps sending DTLS to the FIRST pair the browser nominated —
    // the tailnet one — after Chrome 154 moved to a LAN pair, so the handshake never completed): werift on PIN_ADDR only,
    // and only pairs whose far end is that same address
    ...(PIN ? { iceInterfaceAddresses: { udp4: PIN }, iceFilterCandidatePair: (pair) => { const r = pair.remoteCandidate || {}; return (r.host || r.address) === PIN; } } : {}),
  });
  const atrack = new w.MediaStreamTrack({ kind: 'audio' });
  if (!process.argv.includes('--no-audio')) { const atr = pc.addTransceiver(atrack, { direction: 'sendrecv' }); atr.sender.streamId = 'machine'; }
  let vtrack = null;
  if (VIDEO) { vtrack = new w.MediaStreamTrack({ kind: 'video' }); const vtr = pc.addTransceiver(vtrack, { direction: 'sendonly' }); vtr.sender.streamId = 'machine'; }
  const dc = pc.createDataChannel('audio', DC_ORDERED ? { ordered: true } : { ordered: false, maxRetransmits: 0 });
  const mic = [];
  pc.onTrack.subscribe((t) => { const track = t.track || t; if (track.kind !== 'audio') return; track.onReceiveRtp.subscribe((rtp) => mic.push({ at: now(), ts: rtp.header.timestamp >>> 0, seq: rtp.header.sequenceNumber, data: Buffer.from(rtp.payload) })); });
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((res) => { if (pc.iceGatheringState === 'complete') res(); pc.iceGatheringStateChange.subscribe((g) => g === 'complete' && res()); setTimeout(res, 2000); });
  // OFFER_ADDR=<ip>: only werift's host candidates on that address go to the browser (one path on a multi-homed hub)
  const offerSdp = process.env.OFFER_ADDR ? pc.localDescription.sdp.split('\r\n').filter((l) => !/^a=candidate:/.test(l) || l.includes(` ${process.env.OFFER_ADDR} `)).join('\r\n') : pc.localDescription.sdp;
  const answer = await evaluate(`run(${JSON.stringify({ offer: { type: 'offer', sdp: offerSdp }, mic: MIC, dcTargetFrames: DC_TARGET, unmute: process.argv.includes('--unmute') })})`);
  // ANSWER_CANDS=udp4: only the browser's UDP/IPv4 host candidates reach werift (TCP + IPv6 stripped)
  const answerSdp = process.env.ANSWER_CANDS === 'udp4' ? answer.split('\r\n').filter((l) => !/^a=candidate:/.test(l) || (/ udp /i.test(l) && !/ [0-9a-f]*:[0-9a-f:]+ \d+ typ/i.test(l))).join('\r\n') : answer;
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  const t0c = now();
  await new Promise((res) => { if (pc.connectionState === 'connected') res(); pc.connectionStateChange.subscribe((s) => s === 'connected' && res()); setTimeout(res, 8000); });
  const connectMs = now() - t0c;
  await new Promise((res) => { if (dc.readyState === 'open') res(); dc.stateChanged.subscribe((s) => s === 'open' && res()); setTimeout(res, 3000); });
  // the picture beside the sound
  let vstop = () => { };
  if (VIDEO) {
    const aus = H.accessUnits(H.splitNalus(fs.readFileSync(path.join(WT, 'scripts/fixtures/stream/fake-desk-720p.h264'))));
    let i = H.keyIndexAfter(aus, 0), n = 0, seq = 1;
    const tv = setInterval(() => { const au = aus[i]; for (const p of H.rtpPayloads(au.nalus)) { try { vtrack.writeRtp(new w.RtpPacket(new w.RtpHeader({ payloadType: 96, sequenceNumber: seq, timestamp: (n * 3000) >>> 0, marker: p.marker, ssrc: 1 }), Buffer.from(p.payload))); } catch { } seq = (seq + 1) & 0xffff; } i = (i + 1) % aus.length; n++; }, 1000 / 30);
    vstop = () => clearInterval(tv);
  }
  // the sound: packet k due at t0 + 20k (+ a jitter that keeps the order: a later packet never overtakes)
  await sleep(300);
  const t0 = now(); const sent = []; let lastDue = 0, seq = 1;
  for (let k = 0; k < spk.length; k++) {
    const due = Math.max(lastDue, t0 + k * 20 + (JITTER ? Math.random() * JITTER : 0)); lastDue = due;
    await sleep(due - now());
    const at = now(), ts = (k * 960) >>> 0, p = spk[k].data;
    atrack.writeRtp(new w.RtpPacket(new w.RtpHeader({ payloadType: 111, sequenceNumber: seq, timestamp: ts, marker: k === 0, ssrc: 2 }), p)); seq = (seq + 1) & 0xffff;
    const m = Buffer.alloc(4 + p.length); m.writeUInt32BE(ts, 0); p.copy(m, 4); try { dc.send(m); } catch { }
    sent.push(at);
  }
  await sleep(600);
  vstop();
  const res = await evaluate('collect()');
  // the microphone: the received Opus → Ogg → ffmpeg → PCM → its onsets → the packet that held each → its arrival here
  let micResult = null;
  if (mic.length) {
    const ts0 = mic[0].ts, pk = mic.map((m) => ({ ...m, rel: (m.ts - ts0) >>> 0 }));
    const ogg = oggOpus(pk.map((m) => ({ data: m.data, granule: m.rel + 960 })), 2);
    const oggPath = path.join(FIX, `mic-rx-${runNo}.ogg`); fs.writeFileSync(oggPath, ogg);
    const pcm = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', oggPath, '-f', 's16le', '-ac', '1', '-ar', '48000', 'pipe:1'], { maxBuffer: 64 << 20 });
    const on = toneOnsets(pcm, 1);
    const arrivals = on.map((s) => { const p = pk.find((m) => m.rel <= s && s < m.rel + 960) || pk.find((m) => m.rel > s); return p ? p.at : null; });
    const local = res.onsets.mic.map((o) => o.seenWall);
    // pair each received onset with the NEAREST page-side onset (signed: werift can hold the packet before the page's own
    // WebAudio graph shows the captured sample — the local MediaStreamSource path has its own buffering)
    const pairs = arrivals.map((a) => { if (a == null || !local.length) return null; const l = local.reduce((b, x) => (Math.abs(x - a) < Math.abs(b - a) ? x : b)); return Math.abs(a - l) < 700 ? r2(a - l) : null; }).filter((x) => x != null);
    const sizes = pk.map((m) => m.data.length), dur = (pk[pk.length - 1].at - pk[0].at) / 1000;
    micResult = { packets: pk.length, payloadBytes: pct(sizes), kbps: r2(sizes.reduce((a, b) => a + b, 0) * 8 / dur / 1000), onsetsDecoded: on.length, pageOnsets: local.length, captureToArrivalMs: pairs,
      decodedPeak: (() => { let m = 0; for (let i = 0; i < pcm.length; i += 2) m = Math.max(m, Math.abs(pcm.readInt16LE(i))); return r2(20 * Math.log10(m / 32768)); })() };
  }
  // the speaker: each tone's packet send → the page's onsets (seen = the worklet's message here; out = due at the output)
  const sendOf = toneIdx.map((k) => sent[k]);
  const pair = (list) => sendOf.map((s) => { const o = list.find((x) => x.seenWall >= s - 5 && x.seenWall < s + 1000); return o ? { seenMs: r2(o.seenWall - s), outMs: r2(o.outWall - s), amp: r2(o.amp) } : null; });
  const ib = res.stats.inbound || {};
  const out = {
    run: runNo, connectMs: r2(connectMs), ice: { werift: pc.connectionState, weriftIce: pc.iceConnectionState, chrome: res.stats.ice, offerCandidates: (offerSdp.match(/a=candidate[^\r\n]*/g) || []).length, answerCandidates: (answer.match(/a=candidate[^\r\n]*/g) || []).map((c) => c.split(' ').slice(4, 8).join(' ')) }, jitterMs: JITTER, video: VIDEO ? res.stats.video : null, sameStream: res.sameStream, tracks: res.log.filter((l) => l.track),
    offerAudio: (offerSdp.match(/m=audio[^\n]*\n(?:(?!m=)[^\n]*\n)*/) || [''])[0].split('\n').filter((l) => /rtpmap|fmtp|msid|sendrecv|recvonly|sendonly/.test(l)).slice(0, 6),
    answerAudio: (answer.match(/m=audio[^\n]*\n(?:(?!m=)[^\n]*\n)*/) || [''])[0].split('\n').filter((l) => /rtpmap:111|fmtp:111|sendrecv|recvonly|sendonly/.test(l)).slice(0, 4),
    ctx: res.ctx,
    rtc: { tones: pair(res.onsets.rtc), jitterBufferMs: ib.jitterBufferEmittedCount ? r2(1000 * ib.jitterBufferDelay / ib.jitterBufferEmittedCount) : null,
      jitterBufferTargetMs: ib.jitterBufferEmittedCount ? r2(1000 * ib.jitterBufferTargetDelay / ib.jitterBufferEmittedCount) : null,
      jitterBufferMinimumMs: ib.jitterBufferEmittedCount ? r2(1000 * ib.jitterBufferMinimumDelay / ib.jitterBufferEmittedCount) : null,
      packetsReceived: ib.packetsReceived, packetsLost: ib.packetsLost, concealedSamples: ib.concealedSamples, totalSamplesReceived: ib.totalSamplesReceived, codec: ib.codecId },
    dc: { tones: pair(res.onsets.dc), in: res.dc.in, decoded: res.dc.decoded, underruns: res.dc.under, targetFrames: DC_TARGET },
    mic: micResult, micSettings: (res.log.find((l) => l.micSettings) || {}).micSettings || null, pageLog: res.log.filter((l) => l.decoderError),
    sentPackets: sent.length, sendGapMs: pct(sent.slice(1).map((x, i) => x - sent[i])),
  };
  await evaluate('window.pc.close(), window.__onsets = { rtc: [], dc: [], mic: [] }, window.__log = [], window.__dc = { in: 0, decoded: 0, under: 0 }, true');
  await pc.close();
  return out;
}

const results = [];
try { for (let r = 1; r <= RUNS; r++) results.push(await oneRun(r)); }
finally {
  try { ws.close(); } catch { } srv.close();
  // the profile goes only after Chrome has exited (removing it beside a dying Chrome left 26 empty dirs behind)
  const gone = new Promise((res) => { if (chrome.exitCode !== null || chrome.signalCode) res(); else chrome.once('exit', res); });
  chrome.kill('SIGKILL'); await Promise.race([gone, sleep(5000)]);
  fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(FIX, { recursive: true, force: true });
}
const text = JSON.stringify({ ok: true, preSkip: PRESKIP, toneIdx, werift: JSON.parse(fs.readFileSync(path.join(WT, 'node_modules/werift/package.json'), 'utf8')).version, chrome: CHROME, results }, null, 1);
if (OUT) fs.writeFileSync(OUT, text);
process.stdout.write(text + '\n');
process.exit(0);
