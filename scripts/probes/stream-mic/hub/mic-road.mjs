// mic-road.mjs — VibeSpace lane stream-mic-wheel-probe (probe only; nothing in src/ calls it).
//
// THE VIEWER'S VOICE, browser → the agent's PCM, measured whole on ONE clock (this machine's): a real headless Chrome with a
// fake microphone (a WAV holding 1 kHz −20 dBFS tones at known times, `--use-file-for-fake-audio-capture`) answers our
// werift's offer (the agent's werift, 0.25) and sends its microphone back on the audio m-line (sendrecv) — Chrome's own Opus,
// with the processing a product page would ask for (echo cancellation ON by default here: the machine's speaker sound comes
// back to the viewer, and without AEC the viewer's microphone would feed it into the machine's virtual microphone). The agent
// side does what a product agent would: each RTP packet as it arrives → a live Ogg page → a STREAMING decoder (ffmpeg, the
// agent's own; low-delay flags) → s16le PCM, its 1 kHz onsets stamped as the PCM comes out. The page stamps the same tones
// where its own WebAudio graph first has them (MediaStreamSource → an AudioWorklet), so every tone gives:
//   page graph (≈ capture) → the RTP packet holding it at werift → its decoded PCM in the agent's hands
// The machine side (decoded PCM → the virtual cable → an app) is measured on the machine itself (win/app-leg.cjs voice/apps).
//
//   node mic-road.mjs [--secs 6] [--runs 3] [--aec 1|0] [--jitter MS]
// Env: WT = the repo (werift), CHROME, PIN_ADDR = the ONE local IPv4 werift binds (see the audio probe's THE PIN).
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
const CHROME = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SECS = Number(arg('secs', 6)), RUNS = Number(arg('runs', 3)), AEC = arg('aec', '1') !== '0', JITTER = Number(arg('jitter', 0));
const PIN = process.env.PIN_ADDR || (Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal && /^192\.168\./.test(a.address)) || {}).address || null;
const now = () => performance.timeOrigin + performance.now();
const r2 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 100) / 100);
const sleep = (ms) => new Promise((res) => setTimeout(res, Math.max(0, ms)));
const pct = (xs) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y), q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))]; return { n: a.length, p50: r2(q(0.5)), p95: r2(q(0.95)), min: r2(a[0]), max: r2(a[a.length - 1]) }; };

// the fake microphone: 200 ms of 1 kHz at −20 dBFS at 1.0 / 2.5 / 4.0 s of a 5 s file (Chrome loops it)
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mic-road-'));
const MIC_TONES = [1.0, 2.5, 4.0];
const tonesExpr = (ts) => `0.1*sin(2*PI*1000*t)*(${ts.map((t) => `between(t\\,${t}\\,${t + 0.2})`).join('+')})`;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc=${tonesExpr(MIC_TONES)}:s=48000:d=5`, '-c:a', 'pcm_s16le', path.join(FIX, 'mic.wav')]);

// ── a minimal Ogg Opus writer: one page per packet, as a product agent would feed its streaming decoder ──
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; } return t; })();
function oggPage(serial, seq, granule, flags, packet) {
  const lace = []; let n = packet.length; while (n >= 255) { lace.push(255); n -= 255; } lace.push(n);
  const h = Buffer.alloc(27 + lace.length); h.write('OggS', 0); h[4] = 0; h[5] = flags; h.writeBigInt64LE(BigInt(granule), 6); h.writeUInt32LE(serial, 14); h.writeUInt32LE(seq, 18); h[26] = lace.length; Buffer.from(lace).copy(h, 27);
  const page = Buffer.concat([h, packet]); let c = 0; for (const b of page) c = ((c << 8) ^ CRC[((c >>> 24) ^ b) & 255]) >>> 0; page.writeUInt32LE(c, 22); return page;
}
function oggHead(channels = 2) {
  const head = Buffer.alloc(19); head.write('OpusHead', 0); head[8] = 1; head[9] = channels; head.writeUInt16LE(0, 10); head.writeUInt32LE(48000, 12);
  const tags = Buffer.concat([Buffer.from('OpusTags'), Buffer.from([4, 0, 0, 0]), Buffer.from('lane'), Buffer.alloc(4)]);
  return [oggPage(1, 0, 0, 2, head), oggPage(1, 1, 0, 0, tags)];
}
/** 1 kHz onsets over 2 ms blocks (the page worklet's rule). push(x) → true at an onset; `last` = its first frame. */
function detector() {
  const n = 96, coeff = 2 * Math.cos(2 * Math.PI * 1000 / 48000), hist = new Array(50).fill(0);
  let k = 0, s1 = 0, s2 = 0, hi = 0, frame = 0, start = 0, last = -1e12, peak = 0;
  return {
    get frame() { return frame; }, get last() { return last; }, get peak() { return peak; },
    push(x) {
      if (k === 0) start = frame;
      const s0 = x + coeff * s1 - s2; s2 = s1; s1 = s0; k++; frame++;
      if (k < n) return false;
      const amp = 2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / n; if (amp > peak) peak = amp;
      const base = Math.max(...hist); let hit = false;
      if (amp > 0.02 && amp > 3 * base && start - last > n * 150) { last = start; hit = true; }
      hist[hi] = amp; hi = (hi + 1) % 50; k = 0; s1 = s2 = 0;
      return hit;
    },
  };
}

// ── the page (served here) + Chrome over CDP ──
const PAGE = `<!doctype html><meta charset="utf-8"><title>mic-road</title><script>
const W = () => performance.timeOrigin + performance.now();
window.__mic = []; window.__log = []; let ctx = null;
const WORKLET = \`class Onset extends AudioWorkletProcessor { constructor() { super(); this.n = Math.round(sampleRate * 0.002); this.c = 2 * Math.cos(2 * Math.PI * 1000 / sampleRate); this.k = 0; this.s1 = 0; this.s2 = 0; this.h = new Float32Array(50); this.hi = 0; this.last = -1e12; this.st = 0; }
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (!ch) return true;
    for (let i = 0; i < ch.length; i++) { const f = currentFrame + i; if (this.k === 0) this.st = f; const s0 = ch[i] + this.c * this.s1 - this.s2; this.s2 = this.s1; this.s1 = s0; this.k++;
      if (this.k < this.n) continue; const amp = 2 * Math.sqrt(Math.max(0, this.s1 * this.s1 + this.s2 * this.s2 - this.c * this.s1 * this.s2)) / this.n; let b = 0; for (const x of this.h) b = Math.max(b, x);
      if (amp > 0.02 && amp > 3 * b && this.st - this.last > this.n * 150) { this.last = this.st; this.port.postMessage({ amp }); }
      this.h[this.hi] = amp; this.hi = (this.hi + 1) % 50; this.k = 0; this.s1 = this.s2 = 0; }
    return true; } }
registerProcessor('onset', Onset);\`;
window.run = async ({ offer, aec }) => {
  if (!ctx) { ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' }); await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))); }
  if (ctx.state !== 'running') await ctx.resume();
  const pc = window.pc = new RTCPeerConnection({ iceServers: [] });
  const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: aec, noiseSuppression: aec, autoGainControl: aec } });
  const track = ms.getAudioTracks()[0];
  const node = new AudioWorkletNode(ctx, 'onset'); node.port.onmessage = (e) => window.__mic.push({ seenWall: W(), amp: e.data.amp }); node.connect(ctx.destination);
  const src = ctx.createMediaStreamSource(ms); src.connect(node);
  window.__end = () => { try { track.stop(); src.disconnect(); node.disconnect(); node.port.onmessage = null; } catch { } };   // one run's graph only: the next run's onsets are its own
  window.__log.push({ settings: track.getSettings() });
  await pc.setRemoteDescription(offer);
  const tr = pc.getTransceivers().find((t) => t.receiver.track && t.receiver.track.kind === 'audio');
  tr.direction = 'sendrecv'; await tr.sender.replaceTrack(track);
  await pc.setLocalDescription(await pc.createAnswer());
  return pc.localDescription.sdp;
};
window.collect = async () => { const st = await window.pc.getStats(); let out = null; st.forEach((r) => { if (r.type === 'outbound-rtp' && r.kind === 'audio') out = { packetsSent: r.packetsSent, bytesSent: r.bytesSent, targetBitrate: r.targetBitrate }; });
  const codec = []; st.forEach((r) => { if (r.type === 'codec' && /opus/i.test(r.mimeType || '')) codec.push(r.sdpFmtpLine); }); return { mic: window.__mic, log: window.__log, out, codec }; };
</script>`;
const srv = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); });
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const cdpPort = 20000 + Math.floor(Math.random() * 20000), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mic-road-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox', `--user-data-dir=${prof}`,
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${path.join(FIX, 'mic.wav')}`, `http://127.0.0.1:${srv.address().port}/`], { stdio: 'ignore' });
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
    codecs: { audio: [w.useOPUS()] }, iceLite: true, iceServers: [], bundlePolicy: 'max-bundle', iceUseIpv6: false,
    ...(PIN ? { iceInterfaceAddresses: { udp4: PIN }, iceFilterCandidatePair: (pair) => { const r = pair.remoteCandidate || {}; return (r.host || r.address) === PIN; } } : {}),
  });
  pc.addTransceiver(new w.MediaStreamTrack({ kind: 'audio' }), { direction: 'sendrecv' }).sender.streamId = 'machine';
  // THE AGENT'S SIDE: each packet as it arrives → its Ogg page → ffmpeg (streaming, low delay) → PCM → onsets stamped on output
  const dec = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-probesize', '32', '-analyzeduration', '0', '-fflags', 'nobuffer', '-flags', 'low_delay',
    '-f', 'ogg', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '48000', 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let decErr = ''; dec.stderr.on('data', (d) => { decErr += d; }); dec.stdin.on('error', () => { });
  const det = detector(); const decOnsets = []; let carry = Buffer.alloc(0), firstPcmAt = null, pcmFrames = 0;
  dec.stdout.on('data', (d) => {
    const at = now(); if (firstPcmAt === null) firstPcmAt = at;
    const b = carry.length ? Buffer.concat([carry, d]) : d, whole = b.length - (b.length % 2);
    for (let i = 0; i < whole; i += 2) if (det.push(b.readInt16LE(i) / 32768)) decOnsets.push({ at: r2(at - (det.frame - det.last) / 48), seen: r2(at) });
    pcmFrames += whole / 2; carry = b.subarray(whole);
  });
  const rx = []; let ts0 = null, seqPage = 2, decStarted = false;
  pc.onTrack.subscribe((t) => {
    const track = t.track || t; if (track.kind !== 'audio') return;
    track.onReceiveRtp.subscribe((rtp) => {
      const at = now(), ts = rtp.header.timestamp >>> 0, payload = Buffer.from(rtp.payload);
      if (ts0 === null) ts0 = ts;
      const rel = (ts - ts0) >>> 0; rx.push({ at, rel, bytes: payload.length });
      const write = () => { if (!decStarted) { decStarted = true; for (const p of oggHead(2)) dec.stdin.write(p); } dec.stdin.write(oggPage(1, seqPage++, rel + 960, 0, payload)); };
      if (JITTER) setTimeout(write, Math.random() * JITTER); else write();
    });
  });
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((res) => { if (pc.iceGatheringState === 'complete') res(); pc.iceGatheringStateChange.subscribe((g) => g === 'complete' && res()); setTimeout(res, 2000); });
  const answer = await evaluate(`run(${JSON.stringify({ offer: { type: 'offer', sdp: pc.localDescription.sdp }, aec: AEC })})`);
  await pc.setRemoteDescription({ type: 'answer', sdp: answer });
  const t0c = now();
  await new Promise((res) => { if (pc.connectionState === 'connected') res(); pc.connectionStateChange.subscribe((s) => s === 'connected' && res()); setTimeout(res, 8000); });
  const connectMs = now() - t0c;
  await sleep(SECS * 1000);
  const page = await evaluate('collect()');
  try { dec.stdin.end(); } catch { }
  await Promise.race([new Promise((res) => dec.on('exit', res)), sleep(2000)]);
  try { dec.kill('SIGKILL'); } catch { }
  // pair: each page onset → the decoded onset within (−50, +600) ms after it; the RTP packet holding that sample → its arrival
  const tones = page.mic.map((p) => {
    const d = decOnsets.find((x) => x.at > p.seenWall - 50 && x.at < p.seenWall + 600);
    if (!d) return { pageWall: r2(p.seenWall), decoded: null };
    // the packet whose samples hold the decoded onset: decoded frame index ≈ rel timestamp (one 48 kHz clock)
    return { pageWall: r2(p.seenWall), pageToDecodedSampleMs: r2(d.at - p.seenWall), pageToDecodedInHandMs: r2(d.seen - p.seenWall) };
  });
  const gaps = rx.slice(1).map((x, i) => x.at - rx[i].at);
  const out = { run: runNo, connectMs: r2(connectMs), aec: AEC, jitterMs: JITTER, settings: (page.log.find((l) => l.settings) || {}).settings, codec: page.codec, chromeOut: page.out,
    packets: rx.length, arrivalGapMs: pct(gaps), payloadBytes: pct(rx.map((x) => x.bytes)), kbps: rx.length > 1 ? r2(rx.reduce((a, x) => a + x.bytes, 0) * 8 / ((rx[rx.length - 1].at - rx[0].at) / 1000) / 1000) : null,
    firstPcmAfterFirstPacketMs: firstPcmAt && rx.length ? r2(firstPcmAt - rx[0].at) : null, pcmSeconds: r2(pcmFrames / 48000), decodedPeak: r2(det.peak),
    pageOnsets: page.mic.length, decodedOnsets: decOnsets.length, tones, decoderErr: decErr.slice(-200) };
  await evaluate('window.__end && window.__end(), window.pc.close(), window.__mic = [], true');
  await pc.close();
  return out;
}

const results = [];
try { for (let r = 1; r <= RUNS; r++) results.push(await oneRun(r)); }
finally {
  try { ws.close(); } catch { } srv.close();
  const gone = new Promise((res) => { if (chrome.exitCode !== null || chrome.signalCode) res(); else chrome.once('exit', res); });
  chrome.kill('SIGKILL'); await Promise.race([gone, sleep(5000)]);
  fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(FIX, { recursive: true, force: true });
}
const all = results.flatMap((r) => r.tones.filter((t) => t.pageToDecodedSampleMs != null));
process.stdout.write(JSON.stringify({ ok: true, werift: JSON.parse(fs.readFileSync(path.join(WT, 'node_modules/werift/package.json'), 'utf8')).version, pin: PIN,
  summary: { tones: all.length, pageToDecodedSampleMs: pct(all.map((t) => t.pageToDecodedSampleMs)), pageToDecodedInHandMs: pct(all.map((t) => t.pageToDecodedInHandMs)) }, results }, null, 1) + '\n');
process.exit(0);
