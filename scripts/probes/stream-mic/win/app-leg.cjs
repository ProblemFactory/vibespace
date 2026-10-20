'use strict';
// app-leg.cjs — VibeSpace lane stream-mic-wheel-probe (probe only). Runs ON the Windows machine under the agent's own Node,
// next to vs-mic-probe.exe, app-listen.ps1 and ffmpeg, and times the virtual microphone's last step with ONE clock
// (Date.now / performance.timeOrigin = the precise system time, which vs-mic-probe and app-listen also read):
//
//   apps    <ffmpeg> <secs>        two OTHER programs record "CABLE Output" the way applications do — ffmpeg through
//                                  DirectShow (a third-party app) and a PowerShell waveIn (MME) client — while vs-mic-probe
//                                  plays our test tones into "CABLE Input": when did each app have each tone?
//   voice   <ffmpeg> <secs> <ogg>  the viewer's voice road on the machine: an Ogg Opus file (the browser's Opus, one packet a
//                                  page) written on its own clock → ffmpeg decode → vs-mic-probe `cable --stdin 1` → the
//                                  cable → read back from "CABLE Output": page written → decoded → in the cable.
// Output: one JSON line on stdout. Nothing is written to disk.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const HELPER = path.join(__dirname, 'vs-mic-probe.exe');
const now = () => performance.timeOrigin + performance.now();
const r2 = (x) => Math.round(x * 100) / 100;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** 1 kHz onsets over 2 ms blocks (the helpers' rule). push(x) → true at an onset (the block's first frame = `last`). */
function toneDetector(rate = 48000) {
  const n = Math.round(rate * 0.002), coeff = 2 * Math.cos(2 * Math.PI * 1000 / rate), hist = new Array(50).fill(0);
  let k = 0, s1 = 0, s2 = 0, hi = 0, frame = 0, blockStart = 0, last = -1e12, peak = 0;
  return {
    get frame() { return frame; }, get last() { return last; }, get peak() { return peak; },
    push(x) {
      if (k === 0) blockStart = frame;
      const s0 = x + coeff * s1 - s2; s2 = s1; s1 = s0; k++; frame++;
      if (k < n) return false;
      const amp = 2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / n; if (amp > peak) peak = amp;
      const base = Math.max(...hist); let hit = false;
      if (amp > 0.02 && amp > 3 * base && blockStart - last > n * 150) { last = blockStart; hit = true; }
      hist[hi] = amp; hi = (hi + 1) % hist.length; k = 0; s1 = s2 = 0;
      return hit;
    },
  };
}

function oggPages(buf) {
  const pages = []; let o = 0;
  while (o + 27 <= buf.length && buf.toString('latin1', o, o + 4) === 'OggS') {
    const nseg = buf[o + 26], segs = buf.subarray(o + 27, o + 27 + nseg), body = segs.reduce((a, b) => a + b, 0);
    pages.push({ granule: Number(buf.readBigInt64LE(o + 6)), page: buf.subarray(o, o + 27 + nseg + body) });
    o += 27 + nseg + body;
  }
  return pages;
}

function lastJson(text) { try { return JSON.parse(String(text).trim().split(/\r?\n/).filter(Boolean).pop()); } catch { return { ok: false, raw: String(text).slice(-300) }; } }
function run(cmd, args, input) {
  const p = spawn(cmd, args, { windowsHide: true });
  let out = '', err = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
  return { p, done: new Promise((res) => p.on('exit', (code) => res({ code, out, err }))) };
}

async function apps([ff, secs = '5']) {
  const S = Number(secs);
  // app 1: ffmpeg's DirectShow capture of the cable (what OBS / a recorder / most dshow apps do), PCM to us, onsets stamped here
  const det = toneDetector(); const ffOnsets = []; let carry = Buffer.alloc(0); let firstPcm = null; const ffStart = now();
  const ffp = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-f', 'dshow', '-audio_buffer_size', '10', '-i', 'audio=CABLE Output (VB-Audio Virtual Cable)',
    '-t', String(S), '-f', 's16le', '-ac', '1', '-ar', '48000', 'pipe:1'], { windowsHide: true });
  let ffErr = ''; ffp.stderr.on('data', (d) => { ffErr += d; });
  ffp.stdout.on('data', (d) => {
    const at = now(); if (firstPcm === null) firstPcm = at - ffStart;
    const b = carry.length ? Buffer.concat([carry, d]) : d, whole = b.length - (b.length % 2), frames = whole / 2;
    for (let i = 0; i < whole; i += 2) if (det.push(b.readInt16LE(i) / 32768)) ffOnsets.push(r2(at - (det.frame - det.last) / 48)); // the chunk landed at `at`; the onset sits that many frames before its end
    carry = b.subarray(whole); void frames;
  });
  const ffDone = new Promise((res) => ffp.on('exit', res));
  // app 2: a PowerShell waveIn (MME) client
  const ps = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'app-listen.ps1'), '-Secs', String(S), '-Match', 'CABLE Output']);
  await sleep(1800); // both apps recording (Add-Type compiles for ~1 s)
  // the agent's side: our tones into the cable's input; no capture of our own (the apps are the listeners)
  const h = run(HELPER, ['cable', '--secs', '2.5', '--render', 'CABLE Input', '--capture', '-', '--tone', '0.5,1.8']);
  const hr = await h.done; const [psr] = await Promise.all([ps.done, ffDone]);
  const helper = lastJson(hr.out), app2 = lastJson(psr.out);
  const written = (helper.tonesWritten || []).map((t) => t.writtenWall);
  const rows = written.map((w, i) => ({ written: w, ffmpegDshowMs: ffOnsets[i] != null ? r2(ffOnsets[i] - w) : null, waveInMs: app2.onsetsWall && app2.onsetsWall[i] != null ? r2(app2.onsetsWall[i] - w) : null }));
  return { ok: true, leg: 'apps', tones: rows, ffmpeg: { firstPcmMs: firstPcm && r2(firstPcm), peak: r2(det.peak), err: ffErr.slice(-300) }, waveIn: app2,
    helper: helper.ok ? { render: helper.render && helper.render.endpoint, bufferMs: helper.render && helper.render.bufferMs, underruns: helper.renderUnderruns } : helper };
}

async function voice([ff, secs = '5', ogg]) {
  // vs-mic-probe: stdin PCM → CABLE Input, and its own capture of CABLE Output (the in-cable stamp)
  const h = run(HELPER, ['cable', '--secs', String(Number(secs) + 0.8), '--render', 'CABLE Input', '--capture', 'CABLE Output', '--stdin', '1']);
  h.p.stdin.on('error', () => { }); // a helper that refused (its guards) closes stdin: its own answer says why
  let gone = false; h.done.then(() => { gone = true; });
  await sleep(300);
  if (gone) return { ok: false, leg: 'voice', helper: lastJson((await h.done).out) };
  const dec = spawn(ff, ['-hide_banner', '-loglevel', 'error', '-probesize', '32', '-analyzeduration', '0', '-fflags', 'nobuffer', '-flags', 'low_delay',
    '-f', 'ogg', '-i', 'pipe:0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'], { windowsHide: true });
  const det = toneDetector(); const decOnsets = []; let carry = Buffer.alloc(0);
  dec.stdout.on('data', (d) => {
    const at = now(); const b = carry.length ? Buffer.concat([carry, d]) : d, whole = b.length - (b.length % 4);
    for (let i = 0; i < whole; i += 4) if (det.push(b.readInt16LE(i) / 32768)) decOnsets.push(r2(at));
    carry = b.subarray(whole); h.p.stdin.write(b.subarray(0, whole));
  });
  const pages = oggPages(fs.readFileSync(ogg)); let preSkip = 312;
  { const head = pages[0] && pages[0].page; const i = head ? head.indexOf('OpusHead') : -1; if (i >= 0) preSkip = head.readUInt16LE(i + 10); }
  const toneGran = [1.0, 2.5].map((t) => Math.round(t * 48000)), written = [], marked = new Set(), t0 = now();
  for (const p of pages) {
    const mediaMs = p.granule > 0 ? (p.granule - preSkip) / 48 : 0, wait = t0 + mediaMs - now();
    if (wait > 0) await sleep(wait);
    toneGran.forEach((g, i) => { if (!marked.has(i) && p.granule - preSkip >= g) { marked.add(i); written[i] = r2(now()); } });
    dec.stdin.write(p.page);
  }
  dec.stdin.end(); await new Promise((res) => dec.on('exit', res)); h.p.stdin.end();
  const s = lastJson((await h.done).out);
  const arr = s.toneOnsetsArrivalWall || [], cap = s.toneOnsetsCaptureWall || [], seen = s.toneOnsetsSeenWall || [];
  return { ok: true, leg: 'voice', tones: written.map((w, i) => ({ written: w, decodedMs: decOnsets[i] != null ? r2(decOnsets[i] - w) : null, helperArrivalMs: arr[i] != null ? r2(arr[i] - w) : null,
    inCableCaptureStampMs: cap[i] != null ? r2(cap[i] - w) : null, inCableSeenMs: seen[i] != null ? r2(seen[i] - w) : null })),
    helper: s.ok ? { underruns: s.renderUnderruns, cpuPct: s.cpuPct, peak: s.tonePeakAmp, stdinBytes: s.stdinBytes, captureBufferMs: s.capture && s.capture.bufferMs } : s };
}

(async () => {
  const [mode, ...rest] = process.argv.slice(2);
  const out = mode === 'apps' ? await apps(rest) : mode === 'voice' ? await voice(rest) : { ok: false, error: 'usage: app-leg.cjs apps <ffmpeg> <secs> | voice <ffmpeg> <secs> <ogg>' };
  process.stdout.write(JSON.stringify(out) + '\n');
})().catch((e) => { process.stdout.write(JSON.stringify({ ok: false, error: String(e && e.stack || e) }) + '\n'); process.exitCode = 1; });
