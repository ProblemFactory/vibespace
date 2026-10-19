'use strict';
/**
 * THE SCREEN SOURCE — the paired Windows machine's own desktop as the stream's picture (DEVICE: inside agentd; design q-041
 * r2 §2 采集/映射+编码 + §3 P1, lane stream-p1b-screen). What runs is decided by src/stream-plan.js (PURE); this file only
 * spawns, pipes and counts. Part A's source interface (src/agentd/stream-host.js):
 *   { kind: 'screen', origin, fps, start(onAccessUnit, onEnd), stop(), requestKeyframe(), setTargetKbps(kbps), stats() }
 *
 * TWO ROADS (planScreen picks by the display's HDR state):
 *   direct  an SDR display — DDA's 8-bit picture IS the screen: ONE ffmpeg, ddagrab → hwdownload → NV12 (BT.709) → the
 *           encoder → FLV on stdout
 *   mapped  an HDR display — DDA's 8-bit picture is clipped scRGB (the P0 calibration: «过曝», unusable): ffmpeg #1 hands the
 *           FP16 frames' raw bits (rgbaf16le, never a float `format=` conversion — swscale clamps them), THIS agent maps
 *           them (÷ white/80 → OETF through ONE 64 K table per white level, src/stream-plan.js nv12FromHalf) in a worker
 *           thread (the loop that holds the device links never maps a frame), ffmpeg #2 encodes the NV12 → FLV
 *   hdr     (lane stream-hdr-passthrough — q-041 r3 P4 road B) the page asked HDR, the display is in HDR and the machine has
 *           an AV1 10-bit encoder: the MAPPED road's capture, THE PQ MAPPING (FP16 scRGB → BT.2020 → PQ → P010, src/stream-plan.js
 *           p010FromHalf — absolute: the machine's own nits) in the same worker, av1_nvenc → IVF (src/stream-av1.js ivfReader →
 *           temporal units). The source is made BEFORE the browser answers, so it holds both plans: the host tells it the codec the
 *           answer took (`useCodec` — at `connected`, before start) and it runs the hdr plan for AV1, else the plan's `sdr` (mapped)
 *   Reading and mapping overlap (two frame buffers move between this thread and the worker); when both are full the
 *   capture's pipe is paused — ddagrab then hands the newest picture, so a slow mapper drops frames, never queues them.
 * TIMING: a mapped frame's clock is its first byte's arrival (ts90k for RTP; encodeMs = that → its access unit out of the
 *   encoder: map + encode + both pipes). The direct road's capture and encode happen inside ffmpeg: no per-picture clock
 *   (encodeMs null, said in stats as `timing: 'in-ffmpeg'`).
 * KEYFRAMES: ffmpeg's CLI cannot force an IDR on a running encoder — the GOP (2 s) bounds a keyframe request; the wait is
 *   measured (`keyWaitMs`). BITRATE: likewise fixed per process — src/stream-plan.js THE RATE (lane stream-mac-rate: the rule
 *   of every road — rateFollower, RATE_RULE) judges the estimate against what was sent and restarts the ENCODER only on a held
 *   shortfall, never under the display's floor (plan.floor); the new process opens with a key frame.
 * ONE STILL (lane desktop-handover — `desktop-grab`, the picture an agent the owner handed the desktop to reads): the source's
 *   still() runs ONE more capture of the same display for one frame — the direct road's 8-bit picture as ffmpeg's PNG, the
 *   mapped road's FP16 bits through THE table (src/stream-plan.js rgbFromHalf — the stream's own mapping) into a PNG written
 *   here; the display's own pixels, bounded (STILL_MS, the frame's exact size), its children windowsHide like every spawn.
 * ENDINGS, BY NAME (onEnd → the session's `ended`): `capture_exited` / `encoder_exited` (an ffmpeg died — its last stderr
 *   line is logged), `display_gone` (the capture died and the display is no longer in the facts), `capture_failed` (it could
 *   not start). The facts (`stream-facts`): the screens (DisplayConfig: HDR + SDR white level; DXGI: the output ddagrab
 *   opens) and the ffmpeg found (PATH → %LOCALAPPDATA%\vibespace\ffmpeg\bin → the probe folder), kept FACTS_MS.
 */
const path = require('path');
const SP = require('../stream-plan.js');
const AV1 = require('../stream-av1.js'); // lane stream-hdr-passthrough: the HDR road's IVF → temporal units

const FACTS_MS = 30000;      // a facts answer is reused this long (a refused offer re-reads them: `force`)
// lane desktop-display-modes (measured on the owner's box): with one 4K HDR display streaming, the SECOND display's capture died
// at once — ddagrab «Failed to create Direct3D device (8007000e)» — in every leg, never when the same capture was asked again by
// hand ⇒ a capture that ends before its first picture is asked again, after these waits, before the session ends by name
const CAPTURE_RETRY_MS = Object.freeze([400, 1500]);
const RUN_MS = 15000;        // one facts child (PowerShell, an ffmpeg -version) at most
const TAIL = 3;              // stderr lines kept per ffmpeg
const named = (code, error) => ({ ok: false, code, error });
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);
const STILL_MS = 10000;     // one still's capture at most (a display that hands no frame: ddagrab waits for one)
const STILL_PNG_MAX = 48 * 1024 * 1024;

/** THE screen source of this machine — a Mac's is src/agentd/stream-mac.js (lane stream-p3m-build: its helper, the same
 *  `{ facts, source }` and source interface); every other platform's is the one below (Windows; elsewhere not_windows). */
function createScreen(opts = {}) {
  if ((opts.platform || process.platform) === 'darwin') return require('./stream-mac.js').createMacScreen(opts);
  return createWindowsScreen(opts);
}
function createWindowsScreen({ platform = process.platform, spawn, execFile, env = process.env, lookupEnv = process.env, fs = require('fs'), log = () => { }, makeWorker = null, now = Date.now } = {}) {
  let memo = null, inflight = null;
  const run = (file, args, maxBuffer = 1 << 20) => new Promise((resolve) => {
    try {
      execFile(file, args, { env, windowsHide: true, timeout: RUN_MS, maxBuffer, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
    } catch (e) { resolve({ err: e, stdout: '', stderr: '' }); }
  });
  async function findFfmpeg() {
    const looked = [], tried = new Set();
    // PATH = this process's own (Windows' is the real `Path` — spawnEnv's copy is colon-joined) and then the spawn env's (its
    // ~/.local/bin); the folders from this process's environment
    const PATH = [lookupEnv.PATH, env.PATH].filter(Boolean).join(path.delimiter);
    for (const c of SP.ffmpegCandidates({ platform, env: { PATH, LOCALAPPDATA: lookupEnv.LOCALAPPDATA, USERPROFILE: lookupEnv.USERPROFILE }, delim: path.delimiter, sep: path.sep })) {
      if (!looked.includes(c.where)) looked.push(c.where);
      if (tried.has(c.path)) continue;
      tried.add(c.path);
      let st = null; try { st = fs.statSync(c.path); } catch { continue; }
      if (!st.isFile()) continue;
      const [v, fl, en] = [await run(c.path, ['-hide_banner', '-version']), await run(c.path, ['-hide_banner', '-filters']), await run(c.path, ['-hide_banner', '-encoders'])];
      if (v.err && !v.stdout) continue;
      return { looked, ffmpeg: { path: c.path, where: c.where, ...SP.parseFfmpegFacts(v.stdout, fl.stdout, en.stdout) } };
    }
    return { looked, ffmpeg: null };
  }
  async function readFacts() {
    if (platform !== 'win32') return { ok: false, code: 'not_windows', platform, error: `the screen source captures a Windows desktop (this machine runs ${platform})` };
    const ps = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(SP.STREAM_FACTS_PS, 'utf16le').toString('base64')], 256 * 1024);
    const d = SP.parseStreamFacts(ps.stdout);
    const ff = await findFfmpeg();
    const facts = { ok: true, platform, at: now(), ffmpeg: ff.ffmpeg, looked: ff.looked, displays: d.ok ? d.displays : [], dxgi: d.ok ? d.dxgi : 0 };
    if (!d.ok) facts.displaysError = (ps.stderr.trim().split('\n')[0] || (ps.err && ps.err.message) || d.error).slice(0, 200);
    const p = SP.planScreen(facts);
    facts.primary = p.ok ? { mode: p.mode, encoder: p.encoder.label, note: p.note, display: p.display.id, w: p.w, h: p.h, white: p.white } : { code: p.code, error: p.error };
    return facts;
  }
  /** The machine's screen facts (memo FACTS_MS; one read at a time). */
  function facts({ force = false } = {}) {
    if (!force && memo && now() - memo.at < FACTS_MS) return Promise.resolve(memo);
    if (!inflight) inflight = readFacts().then((f) => { memo = f.ok ? f : null; inflight = null; return f; }, (e) => { inflight = null; return named('facts_failed', String((e && e.message) || e)); });
    return inflight;
  }

  /** A session's source: the plan from fresh-enough facts, or its refusal by name. */
  async function source(msg = {}, { maxKbps = 8000 } = {}) {
    if (msg.sourceKind === 'window') return named('no_window_source', 'this agent cannot stream one window of a Windows desktop yet');
    let f = await facts();
    const want = { display: msg.sourceId || null, kbps: maxKbps, share: Number(msg.share) || 1, hdr: msg.hdr === true }; // share: ② (lane desktop-display-modes); hdr: lane stream-hdr-passthrough
    let plan = f.ok ? SP.planScreen(f, want) : f;
    if (!plan.ok && f.ok && plan.code !== 'not_windows') { f = await facts({ force: true }); plan = f.ok ? SP.planScreen(f, want) : f; } // a refusal re-reads once (ffmpeg installed a minute ago, a display plugged in)
    if (!plan.ok) return plan;
    return plan.mode === 'hdr' ? hdrSource(plan, maxKbps, f) : screenSource(plan, maxKbps, f);
  }

  /** THE HDR ROAD's source (lane stream-hdr-passthrough): made before the browser answers, it holds both plans — `useCodec(mimeType)`
   *  (the host: the codec werift negotiated, at `connected`, before start) picks the hdr plan for AV1, else its `sdr` plan (the
   *  mapped road: a browser whose answer dropped AV1). The offer's facts are the hdr plan's (the same display, origin, size). */
  function hdrSource(plan, maxKbps, f) {
    const made = new Map();
    let chosen = null;
    const make = (c) => made.get(c) || made.set(c, screenSource(c === 'AV1' ? plan : plan.sdr, maxKbps, f)).get(c);
    const cur = () => make(chosen || 'H264');
    return {
      ...make('AV1'), offersAv1: true,
      useCodec(mime) { if (!chosen) chosen = /^video\/av1$/i.test(String(mime || '')) ? 'AV1' : 'H264'; return chosen; },
      start(onAccessUnit, onEnded) { if (!chosen) chosen = 'H264'; cur().start(onAccessUnit, onEnded); }, // never told: the SDR road
      stop(why) { for (const x of made.values()) x.stop(why); },
      still: () => make('H264').still(), // an agent reads the SDR picture (THE table of the mapped road)
      requestKeyframe: () => cur().requestKeyframe(),
      setTargetKbps: (k) => cur().setTargetKbps(k),
      stats: () => cur().stats(),
    };
  }

  /** ONE STILL of the plan's display (the header): → { ok, png, w, h, display, origin, road } | { ok: false, code, error } */
  function still(plan) {
    const mapped = plan.mode === 'mapped';
    const want = mapped ? plan.srcW * plan.srcH * 8 : STILL_PNG_MAX;
    return new Promise((resolve) => {
      let c, done = false, n = 0;
      const chunks = [], tail = [];
      const finish = (r) => { if (done) return; done = true; clearTimeout(timer); if (c && c.exitCode == null) { try { c.kill(); } catch { /* gone */ } } resolve(r); };
      const timer = setTimeout(() => finish(named('still_timeout', `the display handed no picture within ${STILL_MS / 1000} s`)), STILL_MS);
      try { c = spawn(plan.ffmpeg, mapped ? SP.stillHalfArgv(plan) : SP.stillArgv(plan), { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { finish(named('still_failed', `the capture could not start (${(e && (e.code || e.message)) || e})`)); return; }
      c.stdout.on('data', (d) => { n += d.length; if (n > want) { finish(named('still_failed', 'the capture handed more bytes than one picture')); return; } chunks.push(d); });
      c.stderr.on('data', (d) => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) { tail.push(l.trim().slice(0, 200)); if (tail.length > TAIL) tail.shift(); } });
      c.on('error', (e) => finish(named('still_failed', `the capture could not start (${(e && (e.code || e.message)) || e})`)));
      c.on('close', (code) => {
        if (done) return;
        const buf = Buffer.concat(chunks);
        if (code !== 0) { finish(named('still_failed', `the capture exited ${code}${tail.length ? ': ' + tail[tail.length - 1] : ''}`)); return; }
        let png = buf;
        if (mapped) {
          if (buf.length !== want) { finish(named('still_failed', `the capture handed ${buf.length} bytes, not one ${plan.srcW}×${plan.srcH} FP16 picture`)); return; }
          const lut = SP.buildLut({ white: plan.white, knee: plan.tone.knee, peak: plan.tone.peak });
          const rgb = SP.rgbFromHalf(new Uint16Array(buf.buffer, buf.byteOffset, buf.length >> 1), plan.srcW, plan.srcH, lut);
          png = Buffer.from(SP.pngOf(rgb, plan.srcW, plan.srcH, (b) => require('zlib').deflateSync(b, { level: 6 })));
        }
        const size = SP.pngSize(png);
        if (!size) { finish(named('still_failed', 'the capture handed no PNG')); return; }
        finish({ ok: true, png, w: size.w, h: size.h, display: plan.display.id, origin: plan.origin, road: plan.mode });
      });
    });
  }

  function screenSource(plan, maxKbps, f = {}) {
    const hdrRoad = plan.mode === 'hdr', mappedRoad = plan.mode === 'mapped' || hdrRoad; // lane stream-hdr-passthrough: the HDR road maps too
    const st = { frames: 0, aus: 0, dropped: 0, restarts: 0, keyWaitMs: null, keysAnswered: 0, encode: [], map: [], mapper: null, startedAt: null, rate: null };
    const rate = SP.rateFollower({ kbps: plan.kbps, cap: maxKbps, floor: plan.floor || 0, rule: SP.RATE_RULE }); // THE RATE (src/stream-plan.js)
    let onAu = null, onEnd = null, stopped = false, keyAskedAt = null, t0 = 0, lastTs = -1, capRetries = 0;
    const procs = new Set();
    const end = (c) => { if (c && c.exitCode == null && !c.killed) { try { c.kill(); } catch { /* gone */ } } };
    // lane stream-hdr-passthrough: WINDOWS POWER THROTTLING (src/stream-plan.js unthrottlePs — measured: a hidden agent's mapper 250–700
    // ms a 4K frame, 1–5 fps; opted out 79 ms, 13 fps): the HDR road opts this agent and each of its ffmpegs out, once each, the pids
    // of one start batched into one PowerShell (a restarted encoder / a re-asked capture: its new pid). The SDR roads: unchanged
    const qosDone = new Set();
    let qosWant = [], qosTimer = null;
    function unthrottle(pid) {
      if (!hdrRoad || platform !== 'win32' || !(pid > 0) || qosDone.has(pid)) return;
      qosDone.add(pid); qosWant.push(pid);
      if (!qosTimer) { qosTimer = setTimeout(flushQos, 100); qosTimer.unref?.(); }
    }
    function flushQos() {
      const list = qosWant; qosWant = []; qosTimer = null;
      if (!list.length || stopped) return;
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(SP.unthrottlePs(list), 'utf16le').toString('base64')]).then((r) => {
        const rows = SP.parseUnthrottle(r.stdout) || [];
        st.unthrottle = { asked: (st.unthrottle ? st.unthrottle.asked : 0) + list.length, ok: (st.unthrottle ? st.unthrottle.ok : 0) + rows.filter((x) => x.ok).length };
        log(`[stream] screen source: Windows power throttling off for ${list.join(', ')} — ${rows.length ? rows.map((x) => `${x.pid} ${x.ok ? 'ok' : `error ${x.err}`}`).join(', ') : 'no answer'}`);
      });
    }
    function finish(code, why) {
      if (stopped) return;
      stopped = true;
      for (const c of procs) end(c);
      teardownMapper(); clearTimeout(qosTimer);
      log(`[stream] screen source ended: ${code}${why ? ` (${why})` : ''}`);
      try { onEnd && onEnd(code); } catch { /* the host's */ }
    }
    /** ONE ffmpeg: its stderr tail kept, its unasked exit = the session's end by name. */
    function ffmpeg(args, role, { stdin = 'ignore' } = {}) {
      const c = spawn(plan.ffmpeg, args, { env, windowsHide: true, stdio: [stdin, 'pipe', 'pipe'] });
      const tail = [];
      c.asked = false;
      procs.add(c);
      unthrottle(c.pid); // lane stream-hdr-passthrough: the HDR road's ffmpegs (a no-op on every other road)
      c.stderr.on('data', (d) => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) { tail.push(l.trim().slice(0, 200)); if (tail.length > TAIL) tail.shift(); } });
      c.on('error', (e) => { procs.delete(c); if (!c.asked) finish('capture_failed', `${role}: ${e && (e.code || e.message)}`); });
      c.on('exit', (code, sig) => {
        procs.delete(c);
        if (c.asked || stopped) return;
        const why = `${role} exit ${code == null ? sig : code}${tail.length ? ': ' + tail[tail.length - 1] : ''}`;
        if (role === 'encoder') { finish('encoder_exited', why); return; }
        if (capRetries < CAPTURE_RETRY_MS.length && !(mappedRoad ? st.frames : st.aus)) { // it never gave a picture: asked again
          const wait = CAPTURE_RETRY_MS[capRetries++];
          st.captureRetries = capRetries;
          log(`[stream] screen source: the capture did not start (${why}) — asking again in ${wait} ms`);
          setTimeout(() => { if (!stopped) { if (mappedRoad) startCapture(); else startDirect(); } }, wait).unref?.();
          return;
        }
        facts({ force: true }).then((f) => finish(f.ok && !f.displays.some((x) => x.id === plan.display.id) ? 'display_gone' : 'capture_exited', why), () => finish('capture_exited', why));
      });
      if (c.stdin) c.stdin.on('error', () => { /* the encoder died: its exit says so */ });
      return c;
    }
    /** Access units out of an encoder's FLV (an H.264 road) or IVF (the HDR road's AV1 temporal units) → the host, in order, each once. */
    function readAus(c, clockOf) {
      const r = hdrRoad ? AV1.ivfReader() : SP.flvReader();
      c.stdout.on('data', (d) => {
        if (stopped || c.asked) return; // a retired encoder's last pictures: the new one opens with a key frame
        for (const ev of r.push(d)) {
          if (ev.type === 'bad') { finish('encoder_exited', ev.error); return; }
          const at = clockOf(ev);
          const ts = Math.max(lastTs + 1, Math.round((at - t0) * 90));
          lastTs = ts;
          st.aus++;
          rate.sent(ev.type === 'tu' ? ev.tu.length : ev.nalus.reduce((n, x) => n + x.length, 0), now());
          if (ev.key && keyAskedAt != null) { st.keyWaitMs = now() - keyAskedAt; st.keysAnswered++; keyAskedAt = null; }
          try {
            if (ev.type === 'tu') onAu({ tu: Buffer.from(ev.tu.buffer, ev.tu.byteOffset, ev.tu.length), key: ev.key, ts90k: ts >>> 0 });
            else onAu({ nalus: ev.nalus.filter((n) => (n[0] & 0x1f) !== 9).map((n) => Buffer.from(n.buffer, n.byteOffset, n.length)), key: ev.key, ts90k: ts >>> 0 });
          } catch { /* the host's */ }
        }
      });
    }

    // ── the DIRECT road: one ffmpeg ──
    let direct = null;
    function startDirect() {
      direct = ffmpeg(SP.directArgv(plan, rate.kbps), 'capture');
      readAus(direct, () => Math.max(now(), t0));
    }

    // ── the MAPPED road: capture → this agent's mapping → encoder ──
    const FB = plan.srcW * plan.srcH * 8, NB = hdrRoad ? SP.p010Bytes(plan.w, plan.h) : SP.nv12Bytes(plan.w, plan.h), STEP = plan.step || 1; // the capture's whole frame → the (maybe k-times smaller) picture
    const lut = plan.white && !hdrRoad ? SP.buildLut({ white: plan.white, knee: plan.tone.knee, peak: plan.tone.peak }) : null;
    let pqTables = null; // the HDR road's (inline mapping only — a worker builds its own: no 2.3 MB copy)
    let cap = null, enc = null, encClock = [], worker = null, busy = false, waiting = null, fill = null, fillU8 = null, filled = 0, fillAt = 0, carry = null, paused = false;
    const inFree = [], outFree = [];
    function setupMapper() {
      for (let k = 0; k < 2; k++) { inFree.push(new ArrayBuffer(FB)); outFree.push(new ArrayBuffer(NB)); }
      if (makeWorker) {
        try {
          worker = makeWorker();
          worker.on('message', (m) => { if (m && m.op === 'mapped') mapped(m.input, m.output, m.ms); else if (m && m.op === 'error') finish('capture_failed', `mapper: ${m.error}`); });
          worker.on('error', (e) => { log(`[stream] mapper worker failed (${e && e.message}) — mapping inline`); worker = null; });
          if (hdrRoad) worker.postMessage({ op: 'pq' });
          else { const l = lut.slice().buffer; worker.postMessage({ op: 'lut', lut: l }, [l]); }
          st.mapper = 'worker';
        } catch (e) { worker = null; log(`[stream] no mapper worker (${e && e.message}) — mapping inline`); }
      }
      if (!worker) st.mapper = 'inline';
    }
    function teardownMapper() { if (worker) { const w = worker; worker = null; try { w.terminate(); } catch { /* gone */ } } }
    function pump() {
      while (carry && carry.length && !stopped) {
        if (!fill) {
          fill = inFree.pop();
          if (!fill) { if (!paused) { paused = true; cap.stdout.pause(); } return; }
          fillU8 = new Uint8Array(fill); filled = 0; fillAt = now();
        }
        const take = Math.min(FB - filled, carry.length);
        fillU8.set(carry.subarray(0, take), filled); filled += take;
        carry = take < carry.length ? carry.subarray(take) : null;
        if (filled === FB) { const f = { buf: fill, at: fillAt }; fill = null; st.frames++; frameDone(f); }
      }
      if (paused && cap) { paused = false; cap.stdout.resume(); }
    }
    function frameDone(f) {
      if (!busy && outFree.length) { send(f); return; }
      if (waiting) { inFree.push(waiting.buf); st.dropped++; }
      waiting = f;
    }
    let mapping = null;
    function send(f) {
      busy = true;
      const out = outFree.pop();
      mapping = f;
      if (worker) { worker.postMessage({ op: 'map', road: hdrRoad ? 'p010' : 'nv12', input: f.buf, output: out, w: plan.srcW, h: plan.srcH, step: STEP }, [f.buf, out]); return; }
      const t = now();
      if (hdrRoad) SP.p010FromHalf(new Uint16Array(f.buf), plan.srcW, plan.srcH, pqTables || (pqTables = SP.buildPqTables()), new Uint16Array(out), STEP);
      else SP.nv12FromHalf(new Uint16Array(f.buf), plan.srcW, plan.srcH, lut, new Uint8Array(out), STEP);
      const ms = now() - t;
      setImmediate(() => mapped(f.buf, out, ms));
    }
    function mapped(input, output, ms) {
      if (stopped) return;
      const f = mapping; mapping = null; busy = false;
      st.map.push(ms); if (st.map.length > 30) st.map.shift();
      inFree.push(input);
      writeEnc(output, f.at);
      if (waiting && outFree.length) { const w = waiting; waiting = null; send(w); }
      pump();
    }
    function writeEnc(output, at) {
      if (!enc || enc.asked || !enc.stdin || enc.stdin.destroyed) { outFree.push(output); st.dropped++; return; }
      const clock = encClock;
      clock.push(at);
      enc.stdin.write(Buffer.from(output, 0, NB), () => {
        outFree.push(output);
        if (!busy && waiting && !stopped) { const w = waiting; waiting = null; send(w); }
      });
    }
    function startEncoder() {
      enc = ffmpeg(hdrRoad ? SP.hdrEncodeArgv(plan, rate.kbps) : SP.encodeArgv(plan, rate.kbps), 'encoder', { stdin: 'pipe' });
      const clock = encClock = [];
      readAus(enc, () => { const at = clock.shift(); if (at != null) { st.encode.push(now() - at); if (st.encode.length > 30) st.encode.shift(); } return at != null ? at : now(); });
    }
    function startMapped() {
      setupMapper();
      startEncoder();
      startCapture();
    }
    function startCapture() {
      carry = null; paused = false;
      if (fill) { inFree.push(fill); fill = null; filled = 0; } // a dead capture's partial frame is dropped
      const c = cap = ffmpeg(SP.captureArgv(plan), 'capture');
      c.stdout.on('data', (d) => { if (c !== cap) return; carry = carry ? Buffer.concat([carry, d]) : d; pump(); });
    }

    return {
      ok: true, kind: 'screen', origin: plan.origin, fps: plan.fps, mode: plan.mode, encoder: plan.encoder.label,
      hdr: plan.hdr || null, // lane stream-hdr-passthrough: the offer's word on the HDR road ({ can, on, why }) — the page's switch
      // lane desktop-display-modes: THE SWITCHER's rows on Windows too — the display streamed + the machine's displays (the facts this
      // plan read: their own names, sizes, HDR); a pick restarts the stream with `source: {kind: 'display', id}`
      display: plan.display.id, displays: SP.screenDisplayRows(f),
      // lane desktop-display-modes ②: a k-times smaller picture (the HDR road beside other displays) — the offer says so, and the
      // page's points (its picture's pixels + the origin) are scaled back to the display's before the injector
      ...(plan.scaled ? { scaled: plan.scaled, inputScale: { ox: plan.origin.x, oy: plan.origin.y, sx: plan.step, sy: plan.step } } : {}),
      start(onAccessUnit, onEnded) {
        if (onAu || stopped) return;
        onAu = onAccessUnit; onEnd = onEnded || null; t0 = now(); rate.begin(t0); st.startedAt = t0;
        unthrottle(process.pid); // lane stream-hdr-passthrough: this agent (its mapper's worker thread is this process's)
        if (keyAskedAt == null) keyAskedAt = t0;
        try { if (mappedRoad) startMapped(); else startDirect(); } catch (e) { finish('capture_failed', String((e && e.message) || e)); }
        log(`[stream] screen source: ${plan.mode}, ${plan.display.id} ${plan.w}×${plan.h} @ ${plan.fps} fps, ${plan.encoder.label} ${rate.kbps} kbps (floor ${rate.floor})${plan.white ? `, white ${plan.white}` : ''}${hdrRoad ? ', PQ 10-bit BT.2020 (passthrough)' : ''}`);
      },
      stop() { if (stopped) return; stopped = true; for (const c of procs) { c.asked = true; end(c); } teardownMapper(); clearTimeout(qosTimer); },
      still: () => still(plan), // lane desktop-handover: ONE still of this display (desktop-grab)
      requestKeyframe() { if (keyAskedAt == null) keyAskedAt = now(); },
      setTargetKbps(target) {
        if (!onAu || stopped) return;
        const d = rate.estimate(target, now());
        st.rate = rate.last;
        if (!d.change) return;
        st.restarts++;
        if (mappedRoad) { const old = enc; old.asked = true; end(old); startEncoder(); } else { const old = direct; old.asked = true; end(old); startDirect(); }
        log(`[stream] screen source: encoder restarted at ${rate.kbps} kbps (${d.why}: the estimate's median ${Math.round(d.median)} kbps, floor ${rate.floor})`);
      },
      stats() {
        return { mode: plan.mode, encoder: plan.encoder.label, encoderId: plan.encoder.id, note: plan.note, display: plan.display.id, w: plan.w, h: plan.h, step: plan.step || 1, white: plan.white, kbps: rate.kbps, floor: rate.floor, rate: st.rate,
          encodeMs: mappedRoad ? median(st.encode) : null, timing: mappedRoad ? 'agent' : 'in-ffmpeg', mapMs: median(st.map), mapper: st.mapper,
          hdr: hdrRoad ? { codec: 'AV1', bits: 10, transfer: 'pq', primaries: 'bt2020' } : null, // lane stream-hdr-passthrough: the details' 「HDR」 row
          unthrottle: st.unthrottle || null, // lane stream-hdr-passthrough: { asked, ok } — Windows power throttling turned off
          captured: st.frames, aus: st.aus, dropped: st.dropped, restarts: st.restarts, captureRetries: st.captureRetries || 0, keyWaitMs: st.keyWaitMs, keysAnswered: st.keysAnswered };
      },
    };
  }

  return { facts, source };
}

/** THE MAPPER WORKER's body (agentd.js runs it in its `stream-map` worker branch): the table once, then frames. */
function mapperServant(port) {
  let lut = null, pq = null;
  port.on('message', (m) => {
    try {
      if (m.op === 'lut') { lut = new Uint8Array(m.lut); return; }
      if (m.op === 'pq') { pq = SP.buildPqTables(); return; } // lane stream-hdr-passthrough: the HDR road's tables, built here
      if (m.op !== 'map' || (m.road === 'p010' ? !pq : !lut)) return;
      const t = Date.now();
      if (m.road === 'p010') SP.p010FromHalf(new Uint16Array(m.input), m.w, m.h, pq, new Uint16Array(m.output), m.step || 1);
      else SP.nv12FromHalf(new Uint16Array(m.input), m.w, m.h, lut, new Uint8Array(m.output), m.step || 1);
      port.postMessage({ op: 'mapped', input: m.input, output: m.output, ms: Date.now() - t }, [m.input, m.output]);
    } catch (e) { try { port.postMessage({ op: 'error', error: String((e && e.message) || e) }); } catch { /* gone */ } }
  });
}

module.exports = { createScreen, mapperServant, FACTS_MS };
