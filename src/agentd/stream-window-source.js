'use strict';
/**
 * THE WINDOW SOURCE — ONE application window of the paired Windows machine as the stream's picture (DEVICE: inside agentd;
 * design q-041 r3 §1/§3 P2w, lane stream-p2w-build; the measured facts: lane stream-p2w-capture-probe). The PURE parts are
 * src/stream-plan.js (planWindow, the helper's build recipe, frame head and lines) and src/stream-window.js (the window's
 * shape, the held verdict, the input shift); this file builds the helper, spawns, pipes and counts. Part A's source
 * interface (src/agentd/stream-host.js), plus `relative` / `bounds()` (the input's origin is the window's LIVE place):
 *   { kind: 'window', origin: {0, 0}, relative: true, bounds(), window, fps, start(onAccessUnit, onEnd), stop(),
 *     requestKeyframe(), setTargetKbps(kbps), stats() }
 *
 * THE HELPER (tools/vibespace-wgc/vibespace-wgc.cs — Windows.Graphics.Capture by HWND): built HERE with the machine's own
 *   C# 5 compiler at the agent's first boot of a version (and at first use) into %LOCALAPPDATA%\vibespace\helpers\, re-built
 *   when its source changes (the stamp file holds the source's digest); a build that fails = `helper_missing` with the
 *   recipe. `facts` lists the machine's windows (the picker), `restore` brings a minimized one back without the focus.
 * THE ROAD: the helper's frames (a head per frame — its size; a size change recreates WGC's pool and the ENCODER restarts at
 *   the new size, opening with a key frame) → BGRA into ffmpeg (BT.709 limited → NV12 → the encoder ladder) → FLV → access
 *   units. FP16 (asked, on an HDR display) → THE table in the mapper worker → NV12 → the encoder. The helper writes the
 *   newest picture at the plan's rate (the last one again while nothing changes); a frame the encoder cannot take yet is
 *   dropped here, never queued.
 * HELD, BY NAME (the session lives on, the stats say why nothing moves): `window_minimized` (WGC stops — no frame, no
 *   error — while the window is minimized; 「还原它」 = the `stream-windows` op's restore), `window_covered_idle` (a covered
 *   Chromium window stopped painting). ENDS, BY NAME: `window_gone` (closed — the helper says so, or it ends 3),
 *   `helper_missing` (no helper / it cannot start), `helper_exited` (it died — its last stderr line logged), `encoder_exited`,
 *   `capture_failed`. Never minimized, hidden, moved or raised by us.
 * STOP, BY NAME (lane stream-window-fixes): stop(why) closes the helper's and the encoder's stdin first — the helper disposes its
 *   capture session (the window is released, its `end` line) and exits 0, ffmpeg flushes and exits — and kills what is still
 *   running after STOP_GRACE_MS; the log line names why (the person's × = `closed`, 停止串流 = `stopped`, the picker's 停止,
 *   the viewer gone) with each exit and the time it took. Both are plain children: an agent that dies closes their stdin too.
 * THE RATE (lane stream-window-fixes): werift's estimate is min(send, receive) of OUR packets — noise around what we sent — so
 *   each sample is kept with what the source sent (its access units' bytes) and src/stream-plan.js THE RATE (rateFollower — the
 *   Mac's source keeps the same) judges the median of the last 2 s: an echo changes nothing, a shortfall that holds 2 s steps
 *   down — never under the window's floor (kbpsFloor, at each new size) — and the rate climbs back after 20 s without one. The intra-refresh road (plan.refresh)
 *   has no periodic key frame: a viewer's ask (PLI) restarts the encoder — its first picture is a key frame — at most every
 *   KEY_GAP_MS.
 */
const crypto = require('crypto');
const SP = require('../stream-plan.js');
const SW = require('../stream-window.js');

const RUN_MS = 20000;
const HELD_TICK_MS = 250;
const STOP_GRACE_MS = 1000;
const KEY_GAP_MS = 2000;
const TAIL = 3;
const named = (code, error) => ({ ok: false, code, error });
/** This agent's own window capability — the verdict's id + platform checks, asked here again (never the hub's word alone). */
const OWN_CAPS = Object.freeze([SW.WINDOW_CAPABILITY]);
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);

/** The helper's C# source as shipped: src/agentd/wgc-helper-source.js — tools/vibespace-wgc/vibespace-wgc.cs as TEXT, generated
 *  by scripts/wgc-helper-embed.mjs (int304: the Mac helper's way, src/agentd/mac-helper-source.js — a plain module, so every
 *  esbuild of the agent carries it with no loader flag). */
function wgcSourceText() { return require('./wgc-helper-source.js').SOURCE; }

function createWindowSource({ platform = process.platform, spawn, execFile, env = process.env, lookupEnv = process.env, fs = require('fs'), log = () => { }, screenFacts = null, makeWorker = null, now = Date.now, sourceText = () => wgcSourceText(fs), helperPath = null } = {}) {
  const P = fs.promises;
  let built = null, building = null;
  const run = (file, args, { timeout = RUN_MS, maxBuffer = 4 << 20 } = {}) => new Promise((resolve) => {
    try { execFile(file, args, { env, windowsHide: true, timeout, maxBuffer, encoding: 'utf8' }, (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })); }
    catch (e) { resolve({ err: e, stdout: '', stderr: '' }); }
  });
  const notWindows = () => named('not_windows', `the window source captures a Windows window (this machine runs ${platform})`);

  /** The helper on this machine — built (or re-built: its source changed) when needed, one build at a time.
   *  → { ok, exe, built, ms, define } | { ok: false, code: 'helper_missing', error } */
  function helper({ force = false } = {}) {
    if (platform !== 'win32') return Promise.resolve(notWindows());
    if (helperPath) return Promise.resolve({ ok: true, exe: helperPath, built: false, ms: 0, define: null }); // the suites' fake helper
    if (!force && built && built.ok) return Promise.resolve(built);
    if (!building) building = buildHelper().then((r) => { built = r; building = null; return r; }, (e) => { building = null; return named('helper_missing', `the window helper could not be built (${(e && e.message) || e})`); });
    return building;
  }
  async function buildHelper() {
    const windir = lookupEnv.WINDIR || lookupEnv.SystemRoot || lookupEnv.windir || '';
    let winmd = [];
    try { winmd = await P.readdir(`${windir}\\System32\\WinMetadata`); } catch { winmd = []; }
    const text = sourceText();
    const plan = SP.wgcBuildPlan({ windir, localAppData: lookupEnv.LOCALAPPDATA || '', winmd, hash: crypto.createHash('sha256').update(text).digest('hex') });
    if (!plan.ok) return plan;
    try { if ((await P.readFile(plan.stampFile, 'utf8')).trim() === plan.stamp && (await P.stat(plan.exe)).isFile()) return { ok: true, exe: plan.exe, built: false, ms: 0, define: null }; } catch { /* not built yet */ }
    await P.mkdir(plan.dir, { recursive: true });
    await P.writeFile(plan.src, text);
    let last = '';
    for (const t of plan.tries) {
      const t0 = now();
      try { await P.unlink(plan.exe); } catch { /* none */ }
      const r = await run(plan.csc, t.argv, { timeout: SP.WGC_HELPER.buildMs });
      let ok = !r.err;
      if (ok) { try { ok = (await P.stat(plan.exe)).isFile(); } catch { ok = false; } }
      if (ok) {
        await P.writeFile(plan.stampFile, plan.stamp + '\n');
        log(`[stream] window helper built (${t.define || 'no defines'}) in ${now() - t0} ms: ${plan.exe}`);
        return { ok: true, exe: plan.exe, built: true, ms: now() - t0, define: t.define };
      }
      last = ((r.stdout + '\n' + r.stderr).split(/\r?\n/).map((l) => l.trim()).filter((l) => /error/i.test(l))[0] || (r.err && (r.err.code || r.err.message)) || 'no output').toString().slice(0, 300);
    }
    log(`[stream] window helper NOT built: ${last}`);
    return named('helper_missing', `the window helper did not build on this machine (${last}); the recipe: ${SP.WGC_RECIPE}`);
  }

  /** The helper's `facts` (all windows, or one) → { ok, rows } | a refusal; one window that closed = { ok, rows: [], gone }. */
  async function readFacts(hwnd = null) {
    const h = await helper();
    if (!h.ok) return h;
    const r = await run(h.exe, ['facts', ...(hwnd ? ['--hwnd', String(hwnd)] : [])]);
    const lines = r.stdout.split(/\r?\n/).map(SP.wgcLine).filter(Boolean);
    const err = lines.find((l) => l.ev === 'error');
    if (err) return named('facts_failed', `the window helper failed (${String(err.error || '').slice(0, 200)})`);
    if (!lines.some((l) => l.ev === 'facts' || l.ev === 'gone')) return named('facts_failed', `the window helper answered nothing (${(r.err && (r.err.code || r.err.message)) || r.stderr.trim().slice(0, 200) || 'no output'})`);
    return { ok: true, rows: lines.filter((l) => l.ev === 'window'), gone: lines.some((l) => l.ev === 'gone'), helper: { exe: h.exe, built: h.built, ms: h.ms } };
  }
  /** THE PICKER's list: this machine's application windows (src/stream-window.js windowPickRows). */
  async function windows() {
    if (platform !== 'win32') return notWindows();
    const f = await readFacts();
    if (!f.ok) return f;
    return { ok: true, platform, helper: f.helper, windows: SW.windowPickRows(f.rows) };
  }
  /** 「还原它」: a minimized window back, without the focus. → { ok, window } | a refusal */
  async function restore(id) {
    if (platform !== 'win32') return notWindows();
    const v = SW.windowSourceVerdict({ capabilities: OWN_CAPS, platform, window: id });
    if (!v.take) return named(v.code, v.why);
    const h = await helper();
    if (!h.ok) return h;
    const r = await run(h.exe, ['restore', '--hwnd', v.sourceId]);
    const l = r.stdout.split(/\r?\n/).map(SP.wgcLine).filter(Boolean);
    if (l.some((x) => x.ev === 'gone')) return named('window_gone', 'that window is not on the machine any more');
    const row = l.find((x) => x.ev === 'window');
    return row ? { ok: true, window: SW.windowSourceOf(row) } : named('restore_failed', `the window was not restored (${(r.err && (r.err.code || r.err.message)) || 'no answer'})`);
  }

  /** A session's source: the plan for that window, or its refusal by name. */
  async function source(msg = {}, { maxKbps = 8000 } = {}) {
    if (platform !== 'win32') return notWindows();
    const v = SW.windowSourceVerdict({ capabilities: OWN_CAPS, platform, window: msg.sourceId });
    if (!v.take) return named(v.code, v.why);
    const sf = screenFacts ? await screenFacts() : { ok: false };
    const f = await readFacts(v.sourceId);
    if (!f.ok) return f;
    if (f.gone || !f.rows.length) return named('window_gone', 'that window is not on the machine any more');
    const h = await helper();
    const plan = SP.planWindow({ platform, ffmpeg: sf && sf.ok ? sf.ffmpeg : null, displays: sf && sf.ok ? sf.displays : [], helper: h }, { window: SW.windowSourceOf(f.rows[0]), kbps: maxKbps, fp16: !!msg.fp16 });
    if (!plan.ok) return plan;
    return windowSource(plan, maxKbps, f.rows[0]);
  }

  function windowSource(plan, maxKbps, row) {
    const st = { frames: 0, fresh: 0, aus: 0, dropped: 0, restarts: 0, keyRestarts: 0, sizes: 0, keyWaitMs: null, keysAnswered: 0, encode: [], map: [], startedAt: null, helper: null, border: null, end: null, rate: null };
    const live = { bounds: { ...plan.window.bounds }, display: plan.window.display, dpi: plan.window.dpi, minimized: plan.window.minimized, covered: false, cls: (row && row.cls) || null };
    const rate = SP.rateFollower({ kbps: plan.kbps, cap: maxKbps, floor: plan.floor || 0, rule: SP.RATE_RULE }); // THE RATE (src/stream-plan.js)
    let onAu = null, onEnd = null, stopped = false, keyAskedAt = null, t0 = 0, lastTs = -1, lastFreshAt = 0, held = null, heldTimer = null;
    let cap = null, enc = null, encSize = null, encClock = [], encAus = 0, encAt = 0;
    const procs = new Set();
    const tail = [];
    const kill = (c) => { if (c && c.exitCode == null && !c.killed) { try { c.kill(); } catch { /* gone */ } } };
    function finish(code, why) {
      if (stopped) return;
      stopped = true;
      clearInterval(heldTimer);
      for (const c of procs) { c.asked = true; kill(c); }
      if (worker) { try { worker.terminate(); } catch { } worker = null; }
      log(`[stream] window source ended: ${code}${why ? ` (${why})` : ''}`);
      try { onEnd && onEnd(code); } catch { /* the host's */ }
    }
    // ── the encoder: one ffmpeg per frame size (and per bitrate) ──
    function startEncoder(w, h) {
      const c = spawn(plan.ffmpeg, SP.windowEncodeArgv(plan, { w, h, kbps: rate.kbps }), { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const etail = [];
      c.asked = false; c.role = 'encoder'; procs.add(c); enc = c; encSize = { w, h }; encAus = 0; encAt = now();
      const clock = encClock = [];
      c.stderr.on('data', (d) => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) { etail.push(l.trim().slice(0, 200)); if (etail.length > TAIL) etail.shift(); } });
      c.on('error', (e) => { procs.delete(c); if (!c.asked) finish('encoder_exited', `encoder: ${e && (e.code || e.message)}`); });
      c.on('exit', (code, sig) => { procs.delete(c); if (!c.asked && !stopped) finish('encoder_exited', `encoder exit ${code == null ? sig : code}${etail.length ? ': ' + etail[etail.length - 1] : ''}`); });
      c.stdin.on('error', () => { /* the encoder died: its exit says so */ });
      const r = SP.flvReader();
      c.stdout.on('data', (d) => {
        if (stopped || c.asked) return; // a retired encoder's last pictures: the new one opens with a key frame
        for (const ev of r.push(d)) {
          if (ev.type === 'bad') { finish('encoder_exited', ev.error); return; }
          const at = clock.shift();
          if (at != null) { st.encode.push(now() - at); if (st.encode.length > 30) st.encode.shift(); }
          const ts = Math.max(lastTs + 1, Math.round(((at != null ? at : now()) - t0) * 90));
          lastTs = ts; st.aus++; encAus++;
          rate.sent(ev.nalus.reduce((n, x) => n + x.length, 0), now());
          if (ev.key && keyAskedAt != null) { st.keyWaitMs = now() - keyAskedAt; st.keysAnswered++; keyAskedAt = null; }
          try { onAu({ nalus: ev.nalus.filter((n) => (n[0] & 0x1f) !== 9).map((n) => Buffer.from(n.buffer, n.byteOffset, n.length)), key: ev.key, ts90k: ts >>> 0 }); } catch { /* the host's */ }
        }
      });
    }
    function retireEncoder() { const old = enc; enc = null; encSize = null; if (old) { old.asked = true; kill(old); } }
    // frame buffers are reused (a few per size): a 4K window would otherwise allocate 800 MB a second
    let free = [], freeBytes = 0;
    const takeBuf = (bytes) => { if (bytes !== freeBytes) { free = []; freeBytes = bytes; } return free.pop() || Buffer.allocUnsafe(bytes); };
    const releaseBuf = (b) => { if (b.length === freeBytes && free.length < 3) free.push(b); };
    function writeEnc(buf, at, done = () => { }) {
      if (!enc || enc.asked || enc.stdin.destroyed || enc.stdin.writableLength > 0) { st.dropped++; done(); return false; } // the encoder is behind: the newest picture waits for the next tick
      encClock.push(at);
      enc.stdin.write(buf, () => done());
      return true;
    }
    // ── the FP16 road's mapper (THE table, in the agent's worker) ──
    let worker = null, mapping = false;
    if (plan.fmt === 'f16') {
      if (!makeWorker) return named('capture_failed', 'the FP16 window road needs the mapper worker');
      try {
        worker = makeWorker();
        worker.on('message', (m) => {
          if (!m || m.op !== 'mapped') { if (m && m.op === 'error') finish('capture_failed', `mapper: ${m.error}`); return; }
          mapping = false; st.map.push(m.ms); if (st.map.length > 30) st.map.shift();
          if (!stopped) writeEnc(Buffer.from(m.output), m.at || now());
        });
        worker.on('error', (e) => finish('capture_failed', `mapper: ${e && e.message}`));
        const l = SP.buildLut({ white: plan.white, knee: plan.tone.knee, peak: plan.tone.peak }).buffer;
        worker.postMessage({ op: 'lut', lut: l }, [l]);
      } catch (e) { return named('capture_failed', `no mapper worker (${(e && e.message) || e})`); }
    }
    // ── one whole frame from the helper ──
    function frameDone(head, buf, at) {
      if (head.fresh) { st.fresh++; lastFreshAt = now(); }
      st.frames++;
      if (!encSize || encSize.w !== head.w || encSize.h !== head.h) { // the window's size changed (or the first frame): the encoder restarts at it
        rate.setFloor(SP.kbpsFloor({ w: head.w, h: head.h, fps: plan.fps, cap: maxKbps })); // the rate floor follows the window's size
        if (encSize) { st.sizes++; log(`[stream] window source: ${encSize.w}×${encSize.h} → ${head.w}×${head.h} — the encoder restarts (${rate.kbps} kbps, floor ${rate.floor})`); }
        retireEncoder(); startEncoder(head.w, head.h);
      }
      if (plan.fmt !== 'f16') { writeEnc(buf, at, () => releaseBuf(buf)); return; }
      if (mapping || !worker || enc.stdin.writableLength > 0) { st.dropped++; releaseBuf(buf); return; }
      mapping = true;
      const input = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), output = new ArrayBuffer(SP.nv12Bytes(head.w, head.h));
      releaseBuf(buf);
      worker.postMessage({ op: 'map', input, output, w: head.w, h: head.h, at }, [input, output]);
    }
    // the helper's stdout: [head][rows] … — read into one buffer per frame (a size change is just the next head)
    let headBuf = Buffer.alloc(SP.WGC_HELPER.headBytes), headGot = 0, head = null, frame = null, got = 0, frameAt = 0;
    function onData(d) {
      let i = 0;
      while (i < d.length && !stopped) {
        if (!head) {
          const take = Math.min(SP.WGC_HELPER.headBytes - headGot, d.length - i);
          d.copy(headBuf, headGot, i, i + take); headGot += take; i += take;
          if (headGot < SP.WGC_HELPER.headBytes) return;
          const h = SP.wgcHead(headBuf, 0); headGot = 0;
          if (h.bad) { finish('helper_exited', h.bad); return; }
          head = h; frame = takeBuf(h.bytes); got = 0; frameAt = now();
        }
        const take = Math.min(head.bytes - got, d.length - i);
        d.copy(frame, got, i, i + take); got += take; i += take;
        if (got === head.bytes) { const h = head, f = frame; head = null; frame = null; frameDone(h, f, frameAt); }
      }
    }
    function onLine(e) {
      if (e.ev === 'window') {
        const b = SW.windowSourceOf({ hwnd: plan.window.id, frame: e.frame });
        if (b) live.bounds = b.bounds;
        if (e.display) live.display = e.display;
        if (e.dpi > 0) live.dpi = e.dpi;
        live.minimized = !!e.min; live.covered = !!e.covered;
      } else if (e.ev === 'open') { st.border = e.border === false ? 'off' : e.borderErr ? 'on' : null; if (e.cls) live.cls = e.cls; }
      else if (e.ev === 'stats') st.helper = { arrived: e.arrived, written: e.written, repeats: e.repeats, copyMs: e.copyP50, writeMs: e.writeP50 };
      else if (e.ev === 'gone') finish('window_gone', 'the window closed');
      else if (e.ev === 'end') st.end = { why: String(e.why || ''), code: e.code };
      else if (e.ev === 'error') { tail.push(String(e.error || '').slice(0, 200)); if (tail.length > TAIL) tail.shift(); }
    }
    function startHelper() {
      const c = spawn(plan.helper, SP.wgcCaptureArgv(plan), { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      c.asked = false; c.role = 'helper'; procs.add(c); cap = c;
      let rest = '';
      c.stderr.on('data', (d) => {
        const lines = (rest + String(d)).split(/\r?\n/); rest = lines.pop();
        for (const l of lines) { const e = SP.wgcLine(l); if (e) onLine(e); else if (l.trim()) { tail.push(l.trim().slice(0, 200)); if (tail.length > TAIL) tail.shift(); } }
      });
      c.stdout.on('data', onData);
      c.stdin.on('error', () => { });
      c.on('error', (e) => { procs.delete(c); if (!c.asked) finish('helper_missing', `the window helper did not start (${e && (e.code || e.message)})`); });
      c.on('exit', (code, sig) => {
        procs.delete(c);
        if (c.asked || stopped) return;
        finish(code === 3 ? 'window_gone' : 'helper_exited', `helper exit ${code == null ? sig : code}${tail.length ? ': ' + tail[tail.length - 1] : ''}`);
      });
    }
    function judgeHeld() {
      const h = SW.windowHeldVerdict({ minimized: live.minimized, covered: live.covered, cls: live.cls, freshAgoMs: now() - lastFreshAt });
      if (h === held) return;
      log(`[stream] window source: ${h ? `held — ${h}` : 'live again'}`);
      held = h;
    }

    return {
      ok: true, kind: SW.WINDOW_KIND, origin: plan.origin, relative: true, fps: plan.fps, mode: plan.mode, encoder: plan.encoder.label,
      window: { id: plan.window.id, title: plan.window.title, app: plan.window.app, w: plan.w, h: plan.h, dpi: plan.window.dpi, display: plan.window.display },
      bounds: () => live.bounds,
      start(onAccessUnit, onEnded) {
        if (onAu || stopped) return;
        onAu = onAccessUnit; onEnd = onEnded || null; t0 = now(); rate.begin(t0); st.startedAt = t0; lastFreshAt = t0;
        if (keyAskedAt == null) keyAskedAt = t0;
        try { startHelper(); } catch (e) { finish('helper_missing', String((e && e.message) || e)); return; }
        heldTimer = setInterval(judgeHeld, HELD_TICK_MS); heldTimer.unref?.();
        log(`[stream] window source: ${plan.mode}, window ${plan.window.id} ${plan.w}×${plan.h} @ ${plan.fps} fps (interval ${plan.interval} ms), ${plan.encoder.label} ${rate.kbps} kbps (floor ${rate.floor}), ${plan.refresh ? 'intra refresh' : `key frame every ${plan.gop} frames`}${plan.white ? `, white ${plan.white}` : ''}`);
      },
      /** The session ends (the host's stop — `why` = its name): stdin closed first (the helper releases the window and exits
       *  0, ffmpeg flushes), what still runs after STOP_GRACE_MS is killed; one log line names why, each exit and the time. */
      stop(why = 'stopped') {
        if (stopped) return;
        stopped = true; clearInterval(heldTimer);
        const t = now(), left = [...procs];
        for (const c of left) { c.asked = true; try { c.stdin && c.stdin.end(); } catch { /* gone */ } }
        const exits = left.map((c) => (c.exitCode != null || c.signalCode != null ? Promise.resolve(c.exitCode != null ? c.exitCode : c.signalCode) : new Promise((res) => c.once('exit', (code, sig) => res(code == null ? sig : code)))));
        const grace = setTimeout(() => { for (const c of left) kill(c); }, STOP_GRACE_MS); grace.unref?.();
        Promise.all(exits).then((codes) => {
          clearTimeout(grace);
          log(`[stream] window source ended: ${why} — ${left.map((c, i) => `${c.role || 'child'} exit ${codes[i]}`).join(', ') || 'nothing running'} in ${now() - t} ms${st.end ? ` (the helper released the window: ${st.end.why})` : ''}`);
        });
        if (worker) { try { worker.terminate(); } catch { } worker = null; }
      },
      requestKeyframe() {
        if (keyAskedAt == null) keyAskedAt = now();
        // the intra-refresh road has no periodic key frame: a viewer's ask restarts the encoder (its first picture is a key
        // frame) — not before the running encoder's first picture (that IS one), at most every KEY_GAP_MS
        if (!plan.refresh || stopped || !enc || !encSize || encAus === 0 || now() - encAt < KEY_GAP_MS) return;
        st.keyRestarts++;
        const { w, h } = encSize; retireEncoder(); startEncoder(w, h);
        log('[stream] window source: a key frame asked — the encoder restarted (the intra-refresh road has no periodic key frame)');
      },
      setTargetKbps(target) {
        if (!onAu || stopped) return;
        const d = rate.estimate(target, now());
        st.rate = rate.last;
        if (!d.change) return;
        st.restarts++;
        if (encSize) { const { w, h } = encSize; retireEncoder(); startEncoder(w, h); }
        log(`[stream] window source: encoder restarted at ${rate.kbps} kbps (${d.why}: the estimate's median ${Math.round(d.median)} kbps, floor ${rate.floor})`);
      },
      stats() {
        return {
          mode: plan.mode, encoder: plan.encoder.label, encoderId: plan.encoder.id, note: plan.note, kbps: rate.kbps, floor: rate.floor, rate: st.rate, refresh: plan.refresh ? 'intra' : 'gop', white: plan.white,
          w: encSize ? encSize.w : plan.w, h: encSize ? encSize.h : plan.h, held, border: st.border,
          window: { id: plan.window.id, title: plan.window.title, app: plan.window.app, bounds: { ...live.bounds }, display: live.display, dpi: live.dpi, minimized: live.minimized, covered: live.covered },
          encodeMs: median(st.encode), timing: 'agent', mapMs: median(st.map), captured: st.frames, fresh: st.fresh, aus: st.aus, dropped: st.dropped,
          restarts: st.restarts, keyRestarts: st.keyRestarts, sizes: st.sizes, keyWaitMs: st.keyWaitMs, keysAnswered: st.keysAnswered, helper: st.helper,
        };
      },
    };
  }

  return { helper, windows, restore, source };
}

module.exports = { createWindowSource, wgcSourceText };
