'use strict';
// win-leg.cjs — VibeSpace lane stream-audio-probe (probe only). Runs ON the Windows machine under the agent's own Node, next to
// vs-audio-probe.exe, and times the two machine-side audio roads with ONE clock (Date.now = the precise system time):
//
//   encode   <ffmpeg> <secs> <device|-> <app> <frameMs>
//            the SPEAKER road: vs-audio-probe `loop --pcm-out -` (WASAPI loopback, s16le 48 kHz stereo, our own test tones)
//            → this process (finds each tone's first sample as it passes) → ffmpeg libopus → RTP on a loopback UDP port →
//            this process again (the packet that holds the tone's first sample). Says: encoder delay, bitrate, packet sizes,
//            ffmpeg's CPU (-benchmark).
//   intercom <ffmpeg|-> <secs> <device|-> <ogg|->
//            the INTERCOM road (the viewer's voice on the machine's speakers): PCM (made here) or an Ogg Opus file (one packet a
//            page; decoded by ffmpeg) written in real time → vs-audio-probe `render` → the endpoint's mix (its loopback).
//
// Output: one JSON line on stdout. Nothing is written to disk.
const { spawn } = require('child_process');
const dgram = require('dgram');
const path = require('path');
const fs = require('fs');

const HELPER = path.join(__dirname, 'vs-audio-probe.exe');
const now = () => performance.timeOrigin + performance.now(); // the system's precise clock, sub-ms (the helper's: QPC-mapped)
const r2 = (x) => Math.round(x * 100) / 100;

/** 1 kHz onsets over 2 ms blocks (the helper's rule): > 0.02, > 3x the previous 100 ms, 300 ms apart. */
function toneDetector(rate = 48000) {
  const n = Math.round(rate * 0.002), coeff = 2 * Math.cos(2 * Math.PI * 1000 / rate), hist = new Array(50).fill(0);
  let k = 0, s1 = 0, s2 = 0, hi = 0, frame = 0, blockStart = 0, last = -1e12;
  const onsets = [];
  return {
    onsets,
    push(x) {
      if (k === 0) blockStart = frame;
      const s0 = x + coeff * s1 - s2; s2 = s1; s1 = s0; k++; frame++;
      if (k < n) return false;
      const amp = 2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / n;
      const base = Math.max(...hist); let hit = false;
      if (amp > 0.02 && amp > 3 * base && blockStart - last > n * 150) { onsets.push(blockStart); last = blockStart; hit = true; }
      hist[hi] = amp; hi = (hi + 1) % hist.length; k = 0; s1 = s2 = 0;
      return hit;
    },
  };
}

function pct(xs) {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y), q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  return { n: a.length, p50: r2(q(0.5)), p95: r2(q(0.95)), max: r2(a[a.length - 1]), min: r2(a[0]) };
}

function helperArgs(mode, secs, device, extra) {
  return [mode, '--secs', String(secs), ...(device && device !== '-' ? ['--device', device] : []), ...extra];
}

async function encode([ff, secs = '6', device = '-', app = 'lowdelay', frameMs = '20', variant = 'plain']) {
  const sock = dgram.createSocket('udp4');
  await new Promise((res) => sock.bind(0, '127.0.0.1', res));
  const port = sock.address().port, frame = 48 * Number(frameMs);
  const pkts = [];
  sock.on('message', (m) => {
    const at = now(); if (m.length < 12) return;
    const cc = m[0] & 15, x = (m[0] >> 4) & 1; let off = 12 + cc * 4;
    if (x) off += 4 + m.readUInt16BE(off + 2) * 4;
    pkts.push({ at, seq: m.readUInt16BE(2), ts: m.readUInt32BE(4), size: m.length - off, pt: m[1] & 127 });
  });
  // variant lowlat: no probing, no demux/mux buffering, every packet flushed at once
  // variant block: + the pipe read capped at 20 ms of PCM (-blocksize, the pipe protocol's own option)
  // variant wav: the same PCM behind a streaming WAV header — the wav demuxer's own max_size makes 10 ms packets (the raw
  // s16le demuxer reads ~4096 frames = 85 ms a packet, no option: the ~90 ms clumps measured with pipe AND udp input)
  const low = variant !== 'plain';
  const lowIn = low ? ['-fflags', 'nobuffer', '-probesize', '32', '-analyzeduration', '0', ...(variant === 'block' ? ['-blocksize', '3840'] : [])] : [];
  const inFmt = variant === 'wav' ? ['-f', 'wav', '-max_size', '1920', '-ignore_length', '1'] : ['-f', 's16le', '-ar', '48000', '-ac', '2'];
  const lowOut = low ? ['-flush_packets', '1', '-max_delay', '0', '-muxdelay', '0', '-muxpreload', '0'] : [];
  const ffArgs = ['-hide_banner', '-loglevel', 'info', '-benchmark', ...lowIn, ...inFmt, '-i', 'pipe:0',
    '-c:a', 'libopus', '-b:a', '64k', '-application', app, '-frame_duration', String(frameMs), ...lowOut, '-f', 'rtp', `rtp://127.0.0.1:${port}`];
  const f = spawn(ff, ffArgs, { windowsHide: true });
  if (variant === 'wav') f.stdin.write(wavHeader());
  let ffErr = '', ffOut = ''; f.stderr.on('data', (d) => { ffErr += d; }); f.stdout.on('data', (d) => { ffOut += d; });
  const h = spawn(HELPER, helperArgs('loop', secs, device, ['--keepalive', '1', '--tone', '1.5,3.5', '--pcm-out', '-']), { windowsHide: true });
  let hOut = '', hErr = ''; h.stdout.on('data', (d) => { hOut += d; }); h.stderr.on('data', (d) => { hErr += d; });
  // the helper's stdout is PCM; its JSON summary is stderr's last line
  const det = toneDetector(); let frames = 0, carry = Buffer.alloc(0); const onsetPass = []; const chunks = [];
  h.stdout.removeAllListeners('data');
  h.stdout.on('data', (d) => {
    const at = now(); chunks.push(d.length);
    const b = carry.length ? Buffer.concat([carry, d]) : d; const whole = b.length - (b.length % 4);
    for (let i = 0; i < whole; i += 4) { if (det.push(b.readInt16LE(i) / 32768)) onsetPass.push({ sample: det.onsets[det.onsets.length - 1], at }); frames++; }
    carry = b.subarray(whole);
    f.stdin.write(b.subarray(0, whole));
  });
  const hExit = new Promise((res) => h.on('exit', res));
  await hExit; f.stdin.end();
  await new Promise((res) => f.on('exit', res)); sock.close();
  const summary = (() => { const i = hErr.lastIndexOf('{"ok"'); try { return JSON.parse(hErr.slice(i).trim()); } catch { return null; } })();
  // the RTP packet holding each onset sample: by the size jump (pure silence around our tones on a quiet endpoint) and by
  // the index arithmetic (packet k covers input samples [k*frame - preSkip, (k+1)*frame - preSkip))
  const sizes = pkts.map((p) => p.size);
  const jumps = []; for (let i = 5; i < pkts.length; i++) { const prev = sizes.slice(i - 5, i); if (sizes[i] > 3 * Math.max(...prev) && sizes[i] > 20) jumps.push(i); }
  const lookup = (sample, preSkip) => Math.floor((sample + preSkip) / frame);
  const tones = onsetPass.map((o, i) => {
    const kSize = jumps.find((j) => Math.abs(j - lookup(o.sample, 120)) <= 2);
    const k = kSize != null ? kSize : lookup(o.sample, 120);
    const p = pkts[k];
    return { onsetSample: o.sample, passedAt: r2(o.at), packet: k, packetBySize: kSize ?? null, packetByIndex120: lookup(o.sample, 120), packetByIndex312: lookup(o.sample, 312),
      encodeMs: p ? r2(p.at - o.at) : null, written: summary && summary.tonesWritten && summary.tonesWritten[i] ? summary.tonesWritten[i].writtenWall : null,
      appWriteToPacketMs: p && summary && summary.tonesWritten && summary.tonesWritten[i] ? r2(p.at - summary.tonesWritten[i].writtenWall) : null,
      appWriteToCaptureSeenMs: summary && summary.toneOnsetsSeenWall && summary.tonesWritten && summary.tonesWritten[i] ? r2(summary.toneOnsetsSeenWall[i] - summary.tonesWritten[i].writtenWall) : null };
  });
  const dur = pkts.length > 1 ? (pkts[pkts.length - 1].at - pkts[0].at) / 1000 : 0, bytes = sizes.reduce((a, b) => a + b, 0);
  const gaps = []; for (let i = 1; i < pkts.length; i++) gaps.push(pkts[i].at - pkts[i - 1].at);
  const bench = (ffErr.match(/bench: [^\r\n]+/g) || []).slice(-2);
  const sdp = (ffOut.match(/a=rtpmap:[^\r\n]+/) || [null])[0];
  return { ok: true, leg: 'encode', app, frameMs: Number(frameMs), variant, device, sdp, packets: pkts.length, pcmFrames: frames, pcmChunkBytes: pct(chunks),
    payloadBytes: pct(sizes), kbpsPayload: dur ? r2(bytes * 8 / dur / 1000) : null, kbpsWithRtpUdpIp: dur ? r2((bytes + pkts.length * 40) * 8 / dur / 1000) : null,
    arrivalGapMs: pct(gaps), tones, ffmpegBench: bench, ffmpegTail: ffErr.split(/\r?\n/).filter((l) => /error|warn/i.test(l)).slice(-3),
    helper: summary ? { cpuPct: summary.cpuPct, packets: summary.packets, deliveryDelayMs: summary.deliveryDelayMs, endpoint: summary.loopback && summary.loopback.endpoint } : null };
}

/** A streaming WAV header: s16le stereo 48 kHz, the sizes "unknown" (0xFFFFFFFF; ffmpeg -ignore_length 1). */
function wavHeader() {
  const b = Buffer.alloc(44); b.write('RIFF', 0); b.writeUInt32LE(0xFFFFFFFF, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(48000, 24); b.writeUInt32LE(192000, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(0xFFFFFFFF, 40); return b;
}

/** s16le stereo 48 kHz: silence with 200 ms 1 kHz tones at -20 dBFS at the given seconds. */
function tonePcm(secs, at) {
  const n = Math.round(secs * 48000), b = Buffer.alloc(n * 4), len = 9600, ramp = 96;
  for (const t of at) {
    const s0 = Math.round(t * 48000);
    for (let k = 0; k < len && s0 + k < n; k++) {
      const g = Math.min(1, Math.min(k, len - k) / ramp), v = Math.round(32767 * 0.1 * g * Math.sin(2 * Math.PI * 1000 * k / 48000));
      b.writeInt16LE(v, (s0 + k) * 4); b.writeInt16LE(v, (s0 + k) * 4 + 2);
    }
  }
  return b;
}

/** Ogg pages → { granule, packetsEnd, page } (one packet a page: ffmpeg -page_duration 20000). */
function oggPages(buf) {
  const pages = []; let o = 0;
  while (o + 27 <= buf.length && buf.toString('latin1', o, o + 4) === 'OggS') {
    const nseg = buf[o + 26], segs = buf.subarray(o + 27, o + 27 + nseg), body = segs.reduce((a, b) => a + b, 0);
    const granule = Number(buf.readBigInt64LE(o + 6)), end = o + 27 + nseg + body;
    pages.push({ granule, page: buf.subarray(o, end), body });
    o = end;
  }
  return pages;
}

async function intercom([ff = '-', secs = '5', device = '-', ogg = '-']) {
  const h = spawn(HELPER, helperArgs('render', Number(secs) + 0.5, device, ['--loopback', '1']), { windowsHide: true });
  let hOut = ''; h.stdout.on('data', (d) => { hOut += d; }); h.stderr.on('data', () => { });
  const hExit = new Promise((res) => h.on('exit', res));
  await new Promise((res) => setTimeout(res, 300)); // the helper's render + loopback streams up
  const written = []; let dec = null; const decDet = toneDetector(); const decOnsets = []; let decCarry = Buffer.alloc(0);
  if (ogg === '-') {
    // PCM straight in, 20 ms chunks on a real-time schedule; the chunk holding each tone's first sample is stamped
    const pcm = tonePcm(Number(secs), [1.0, 2.5]), chunk = 3840, t0 = now();
    const onsetChunks = new Set([1.0, 2.5].map((t) => Math.floor(Math.round(t * 48000) * 4 / chunk)));
    for (let i = 0; i * chunk < pcm.length; i++) {
      const due = t0 + i * 20, wait = due - now(); if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      if (onsetChunks.has(i)) written.push(r2(now()));
      h.stdin.write(pcm.subarray(i * chunk, (i + 1) * chunk));
    }
  } else {
    // Ogg Opus pages on their granule clock → ffmpeg (decode) → here (the decoded onset stamped) → the helper
    const pages = oggPages(fs.readFileSync(ogg));
    dec = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-benchmark', '-probesize', '32', '-analyzeduration', '0', '-fflags', 'nobuffer', '-flags', 'low_delay',
      '-f', 'ogg', '-i', 'pipe:0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'], { windowsHide: true });
    let decErr = ''; dec.stderr.on('data', (d) => { decErr += d; });
    dec.stdout.on('data', (d) => {
      const at = now(); const b = decCarry.length ? Buffer.concat([decCarry, d]) : d; const whole = b.length - (b.length % 4);
      for (let i = 0; i < whole; i += 4) if (decDet.push(b.readInt16LE(i) / 32768)) decOnsets.push(r2(at));
      decCarry = b.subarray(whole); h.stdin.write(b.subarray(0, whole));
    });
    const t0 = now(); const toneGran = [1.0, 2.5].map((t) => Math.round(t * 48000));
    let preSkip = 312; { const head = pages[0] && pages[0].page; const i = head ? head.indexOf('OpusHead') : -1; if (i >= 0) preSkip = head.readUInt16LE(i + 10); }
    const marked = new Set();
    for (const p of pages) {
      const mediaMs = p.granule > 0 ? (p.granule - preSkip) / 48 : 0, wait = t0 + mediaMs - now();
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
      toneGran.forEach((g, i) => { if (!marked.has(i) && p.granule - preSkip >= g) { marked.add(i); written[i] = r2(now()); } });
      dec.stdin.write(p.page);
    }
    dec.stdin.end(); await new Promise((res) => dec.on('exit', res));
    dec.err = decErr;
  }
  h.stdin.end(); await hExit;
  let summary = null; try { summary = JSON.parse(hOut.trim().split(/\r?\n/).pop()); } catch { }
  const arr = summary ? summary.toneOnsetsArrivalWall || [] : [], seen = summary ? summary.toneOnsetsSeenWall || [] : [], lb = summary ? summary.toneOnsetsLoopbackWall || [] : [];
  const tones = written.map((w, i) => ({ written: w, decodedOutMs: decOnsets[i] != null ? r2(decOnsets[i] - w) : null, arrivalMs: arr[i] != null ? r2(arr[i] - w) : null,
    seenInMixMs: seen[i] != null ? r2(seen[i] - w) : null, presentationStampMs: lb[i] != null ? r2(lb[i] - w) : null }));
  return { ok: true, leg: 'intercom', input: ogg === '-' ? 'pcm' : 'ogg-opus', device, tones, decodeBench: dec && dec.err ? (dec.err.match(/bench: [^\r\n]+/g) || []).slice(-1) : null,
    helper: summary ? { cpuPct: summary.cpuPct, renderUnderruns: summary.renderUnderruns, render: summary.render && { bufferMs: summary.render.bufferMs, endpoint: summary.render.endpoint }, stdinBytes: summary.stdinBytes } : hOut.slice(-300) };
}

/** rtpgaps: ffmpeg's own real-time sine (-re lavfi, no pipe) → libopus → RTP here — is the clumping on ffmpeg's input side? */
async function rtpgaps([ff, secs = '3', frameMs = '20', input = 'lavfi']) {
  const sock = dgram.createSocket('udp4'); await new Promise((res) => sock.bind(0, '127.0.0.1', res));
  const at = []; sock.on('message', () => at.push(now()));
  let src = ['-re', '-f', 'lavfi', '-i', `sine=frequency=1000:sample_rate=48000:duration=${secs}`];
  let feeder = null;
  if (input === 'udp') { // PCM datagrams from here (10 ms each, real time) into ffmpeg's udp input
    const inPort = 20000 + Math.floor(Math.random() * 20000);
    src = ['-fflags', 'nobuffer', '-probesize', '32', '-analyzeduration', '0', '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', `udp://127.0.0.1:${inPort}?overrun_nonfatal=1&fifo_size=50000`];
    feeder = { port: inPort };
  }
  const f = spawn(ff, ['-hide_banner', '-loglevel', 'error', ...src, '-c:a', 'libopus', '-b:a', '64k', '-application', 'lowdelay', '-frame_duration', frameMs,
    '-flush_packets', '1', '-f', 'rtp', `rtp://127.0.0.1:${sock.address().port}`], { windowsHide: true });
  let err = ''; f.stderr.on('data', (d) => { err += d; });
  if (feeder) {
    const out = dgram.createSocket('udp4'); const pcm = tonePcm(Number(secs), [1.0]); const t0 = now() + 300;
    for (let i = 0; i * 1920 < pcm.length; i++) { const w = t0 + i * 10 - now(); if (w > 0) await new Promise((res) => setTimeout(res, w)); out.send(pcm.subarray(i * 1920, (i + 1) * 1920), feeder.port, '127.0.0.1'); }
    out.close(); setTimeout(() => f.kill(), 500);
  }
  await new Promise((res) => f.on('exit', res)); sock.close();
  const gaps = []; for (let i = 1; i < at.length; i++) gaps.push(at[i] - at[i - 1]);
  return { ok: true, leg: 'rtpgaps', input, frameMs: Number(frameMs), packets: at.length, gapMs: pct(gaps), err: err.slice(-200) };
}

(async () => {
  const [mode, ...rest] = process.argv.slice(2);
  const out = mode === 'encode' ? await encode(rest) : mode === 'intercom' ? await intercom(rest) : mode === 'rtpgaps' ? await rtpgaps(rest) : { ok: false, error: 'usage: win-leg.cjs encode|intercom …' };
  process.stdout.write(JSON.stringify(out) + '\n');
})().catch((e) => { process.stdout.write(JSON.stringify({ ok: false, error: String(e && e.stack || e) }) + '\n'); process.exitCode = 1; });
