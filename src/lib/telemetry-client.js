// events carry the CLIENT bundle's baked version — the server otherwise
// stamps ITS OWN, which hid the stale-tab fleet incident (old bundle looked
// current in every telemetry event)
import { BUILD_VERSION } from './build-version.js';
// Client-side telemetry: catches what today's audits kept finding the hard
// way — silent boot crashes, runtime exceptions in long-running tabs — plus a
// few coarse feature events so rollout iteration has usage signal.
//
// PRIVACY: events carry names/stacks only, never content. Everything goes to
// THIS instance's own server (data/telemetry/); central forwarding is a
// server-side opt-in. `installTelemetry()` must run BEFORE the App constructor
// so a boot crash is captured (the class of bug that shipped in 2.82.0's first
// build would have been visible immediately).
const QUEUE = [];
let flushTimer = null;
let seq = 0;
const SESSION_START = Date.now();

// SURVIVABLE SEND (2.340.1): the update-window freezes are exactly when the
// server is DOWN — beacon/fetch failures silently dropped the one telemetry
// window we care about. Failed batches park in localStorage (cap 200) and
// drain on the next boot; pagehide still uses best-effort beacon.
const PENDING_KEY = 'vsTelemetryPending';
function parkFailed(events) {
  try {
    const cur = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    const next = cur.concat(events).slice(-200);
    localStorage.setItem(PENDING_KEY, JSON.stringify(next));
  } catch { }
}
export function drainParked() {
  try {
    const cur = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    if (!cur.length) return;
    localStorage.removeItem(PENDING_KEY);
    send(cur.map((e) => ({ ...e, parked: true })));
  } catch { }
}
function send(events, { beacon = false } = {}) {
  try {
    const body = JSON.stringify({ events });
    if (beacon && navigator.sendBeacon) { navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' })); return; }
    fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .then((r) => { if (!r.ok) parkFailed(events); })
      .catch(() => parkFailed(events));
  } catch { }
}

function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!QUEUE.length) return;
  send(QUEUE.splice(0));
}

// Numeric metric — its own budget (periodic samples would eat the error cap).
let metricSeq = 0;
export function metric(name, value) {
  if (!Number.isFinite(value) || metricSeq >= 500) return;
  metricSeq++;
  QUEUE.push({ kind: 'metric', name, value: Math.round(value * 10) / 10, version: BUILD_VERSION, t: Date.now() });
  if (QUEUE.length >= 10) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, 15000);
}

export function track(kind, name, detail, stack) {
  // Bound the queue and rate: a hot error loop must not DoS the server —
  // cap 60 events per page session, identical-name errors capped at 5.
  if (seq >= 60) return;
  if (kind === 'error') {
    const same = QUEUE.filter((e) => e.name === name).length + (track._sent?.[name] || 0);
    if (same >= 5) return;
    (track._sent = track._sent || {})[name] = same + 1;
  }
  seq++;
  QUEUE.push({ kind, name, detail, stack, ua: navigator.userAgent, version: BUILD_VERSION, t: Date.now() });
  if (QUEUE.length >= 10) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, 15000);
}

export function installTelemetry() {
  setTimeout(drainParked, 3000); // failed batches from a server-restart window resend after boot
  window.addEventListener('error', (e) => {
    track('error', (e.error && e.error.message) || e.message || 'window.onerror',
      `${e.filename || ''}:${e.lineno || 0}`, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    track('error', (r && r.message) || String(r).slice(0, 120), 'unhandledrejection', r && r.stack);
  });
  window.addEventListener('pagehide', () => {
    track('event', 'page-session-end', String(Math.round((Date.now() - SESSION_START) / 1000)) + 's');
    // page is going away — fetch won't complete; beacon is the only channel
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (QUEUE.length) send(QUEUE.splice(0), { beacon: true });
  });
  track('boot', 'page-load');

  // ── Performance metrics (all passive, all names-and-numbers only) ──
  // Long tasks: the direct measure of UI jank. Aggregated per minute so a
  // stutter burst is one event, not fifty.
  try {
    let ltCount = 0, ltTotal = 0, ltMax = 0;
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { ltCount++; ltTotal += e.duration; ltMax = Math.max(ltMax, e.duration); }
    });
    po.observe({ entryTypes: ['longtask'] });
    setInterval(() => {
      if (!ltCount) return;
      metric('longtask-count-per-min', ltCount);
      metric('longtask-max-ms', ltMax);
      metric('longtask-total-ms-per-min', ltTotal);
      ltCount = 0; ltTotal = 0; ltMax = 0;
    }, 60000);
  } catch {}

  // Heap + DOM growth: the long-lived-tab leak signals (heap is Chrome-only).
  // First sample after the workspace settles, then every 10 minutes.
  const sampleFootprint = () => {
    try {
      if (performance.memory) metric('js-heap-mb', performance.memory.usedJSHeapSize / 1048576);
      metric('dom-nodes', document.getElementsByTagName('*').length);
      const app = window.app;
      if (app?.wm) metric('open-windows', app.wm.windows.size);
    } catch {}
  };
  setTimeout(sampleFootprint, 30000);
  setInterval(sampleFootprint, 600000);
}

// Boot duration — call from client.js once app.ready resolves (nav start → workspace restored).
// ── Main-thread stall watch (2.338.0, Windows freeze debugging) ──────────
// PerformanceObserver('longtask') sees every main-thread task >50ms. We keep
// a small ring of the BIG ones (≥400ms) and report each ≥1s stall as a
// metric with attribution: what the user was doing (focused element) and the
// last ws message types processed (window.__vsWsRing, maintained by ws.js).
// This is the instrument that separates "the browser/OS froze the page" from
// "our JS blocked the main thread" — the 45s suspend-wake detector reads the
// ring to tell the two apart.
const _longTasks = [];
export function recentLongTasks() { return _longTasks.slice(); }
try { window.__vsLongTasks = recentLongTasks; window.__vsScreenEvents = () => _screenEvents.slice(); } catch { }
// ── COMPOSITOR-STALL detector (2.339.4, the RTX-5090 verdict) ────────────
// rAF callbacks are driven by the compositor's vsync; timers are not. When a
// 1s timer observes the last rAF tick aging past 2s while the page is
// visible, the COMPOSITOR/GPU pipeline is stalled — the exact freeze shape
// the Windows incidents show (idle main thread, frozen OS cursor, zero
// longtasks). Records duration on recovery; ring feeds incident bundles.
const _compStalls = [];
export function recentCompositorStalls() { return _compStalls.slice(); }
// FREEZE LISTENERS (2.369.137, owner: Windows 上越用越卡, 切桌面/跨显示器拖窗口整机卡顿 —
// "想办法解决或者埋点识别问题"): the month's telemetry from that client said 54
// renderer freezes (timer AND rAF stopped) of which only 7 sat beside a long
// task — the rest are GPU / OS side, invisible to the main thread. A listener
// gets every freeze ≥ 1 s on recovery so the incident recorder can capture the
// scene AUTOMATICALLY (what happened in the seconds before, what the page held).
const _freezeListeners = [];
export function onRendererFreeze(fn) { if (typeof fn === 'function') _freezeListeners.push(fn); }
function notifyFreeze(f) { for (const fn of _freezeListeners) { try { fn(f); } catch { } } }
// SCREEN WATCH: a DPR change (a window dragged to a monitor with another
// scale) and a screen move are the owner's two named triggers — recorded as
// events with the numbers, and kept in a ring the snapshot carries.
const _screenEvents = [];
export function recentScreenEvents() { return _screenEvents.slice(); }
function noteScreen(kind, detail) {
  _screenEvents.push({ t: Date.now(), k: kind, ...detail });
  if (_screenEvents.length > 40) _screenEvents.shift();
  track('event', kind, JSON.stringify(detail).slice(0, 160));
}
export function installScreenWatch() {
  try {
    let dpr = window.devicePixelRatio;
    const arm = () => {
      try {
        const mq = matchMedia(`(resolution: ${dpr}dppx)`);
        const onChange = () => { const next = window.devicePixelRatio; if (next !== dpr) { noteScreen('dpr-change', { from: dpr, to: next, screen: `${screen.width}x${screen.height}` }); dpr = next; } try { mq.removeEventListener('change', onChange); } catch { } arm(); };
        mq.addEventListener('change', onChange);
      } catch { }
    };
    arm();
    let last = `${window.screenX},${window.screenY},${screen.width}x${screen.height},${screen.availLeft || 0},${screen.availTop || 0}`;
    setInterval(() => {
      try {
        const cur = `${window.screenX},${window.screenY},${screen.width}x${screen.height},${screen.availLeft || 0},${screen.availTop || 0}`;
        if (cur !== last) { noteScreen('screen-move', { from: last, to: cur, dpr: window.devicePixelRatio }); last = cur; }
      } catch { }
    }, 1000);
    document.addEventListener('visibilitychange', () => { _screenEvents.push({ t: Date.now(), k: 'visibility', v: document.visibilityState }); if (_screenEvents.length > 40) _screenEvents.shift(); });
  } catch { }
}
/** PURE: is a late 1 s tick a FREEZE, or a tab that was hidden / just returned?
 *  (2.369.141, owner: "没有实际卡顿但我切回标签页的时候突然提示抓取卡顿现场" —
 *  Chrome throttles a hidden tab's timers to once a minute, so the first tick
 *  after a return arrives 4–60 s late with `document.hidden` already false.)
 *  A gap counts only when the page was VISIBLE for the whole of it: the
 *  previous tick fired after the page last became visible, no hide happened
 *  since, the page is not hidden now, and it did not become visible within
 *  the last 3 s (the return spike). */
/** PURE: a JANK STORM — frames that keep coming but slowly (2.369.143, the owner's
 *  live reproduction: a ~14 s stall he felt, timers late by 1–3 s per tick and
 *  frames every 1–2 s — under both freeze detectors' thresholds). Over the last
 *  `windowMs` of frame intervals (ms): a storm when the slow frames (≥ slowMs)
 *  together cover ≥ `coverMs` — the page was "alive" but unusable. */
export function jankStormVerdict(intervals, { now, visibleSince = 0, windowMs = 20000, slowMs = 500, coverMs = 6000 } = {}) {
  let covered = 0, slow = 0, worst = 0;
  for (const f of intervals) {
    if (!f || now - f.t > windowMs) continue;
    // A TAB RETURN IS NOT A FRAME (inc-mudv05ja-n5rv): an interval that began
    // before the page last became visible spans the hidden period — the 13.3 s
    // "storm" the auto incident captured was one such return, read 3 s later.
    if (frameGapIsReturn({ now: f.t, gap: f.gap, visibleSince })) continue;
    if (f.gap >= slowMs) { covered += f.gap; slow++; if (f.gap > worst) worst = f.gap; }
  }
  return { storm: covered >= coverMs, coveredMs: covered, slowFrames: slow, worstMs: worst };
}
/** PURE (inc-mudv05ja-n5rv): is a rAF interval a RETURN rather than a frame?
 *  On a tab return the first frame's interval spans the hidden period and
 *  `document.hidden` is already false, so a `!hidden` gate lets it through.
 *  An interval whose START (now − gap) precedes the last visibility return
 *  (`visibleSince`), or during which the page went hidden (`hiddenAt` after
 *  its start), measured the tab being away — never the renderer. */
export function frameGapIsReturn({ now, gap, visibleSince = 0, hiddenAt = 0 }) {
  const start = now - gap;
  if (visibleSince && start < visibleSince) return true;
  if (hiddenAt && hiddenAt > start) return true;
  return false;
}
const _frameGaps = [];   // {t, gap} for every frame that took ≥ 300 ms (a tab return excluded)
const _tickLags = [];    // {t, gap, hidden, visibleAgo} for every 1 s tick ≥ 1.5 s late
export function recentFrameGaps() { return _frameGaps.slice(); }
export function recentTickLags() { return _tickLags.slice(); }
try { window.__vsFrameGaps = recentFrameGaps; window.__vsTickLags = recentTickLags; } catch { }
export function selfGapIsFreeze({ tickGap, prevTick, now, hiddenNow, visibleSince, hiddenAt, minGapMs = 4000 }) {
  if (!(tickGap > minGapMs) || hiddenNow) return false;
  if (prevTick < visibleSince) return false;           // the gap started before the page came back
  if (hiddenAt > prevTick) return false;               // it went hidden during the gap
  if (now - visibleSince < 3000) return false;         // the return spike itself
  return true;
}
export function installCompositorStallWatch() {
  const t0 = Date.now();
  let lastRaf = t0;
  let stallStart = 0;
  let stormOpen = 0;
  // visibility state first: the rAF loop's return filter reads it
  let visibleSince = document.hidden ? 0 : t0, hiddenAt = document.hidden ? t0 : 0;
  try { document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = Date.now(); else visibleSince = Date.now(); }); } catch { }
  const loop = () => {
    const now = Date.now(); const gap = now - lastRaf; lastRaf = now;
    if (gap >= 300 && !document.hidden && !frameGapIsReturn({ now, gap, visibleSince, hiddenAt })) { _frameGaps.push({ t: now, gap }); if (_frameGaps.length > 200) _frameGaps.shift(); }
    requestAnimationFrame(loop);
  };
  try { requestAnimationFrame(loop); } catch { return; }
  let lastTick = Date.now();
  setInterval(() => {
    // SELF-GAP (2.340.3): if THIS 1s timer itself fired late by >3s, the whole
    // renderer (or the OS) was frozen — a case rAF-vs-timer cannot see (both
    // stop together) and the 45s suspend detector ignores. Covers the 5-45s
    // whole-freeze band. A hidden or just-returned tab is NOT a freeze (2.369.141).
    const tickNow = Date.now();
    const prevTick = lastTick;
    const tickGap = tickNow - prevTick; lastTick = tickNow;
    if (tickGap >= 1500) { _tickLags.push({ t: tickNow, gap: tickGap, hidden: !!document.hidden, visibleAgo: tickNow - visibleSince }); if (_tickLags.length > 120) _tickLags.shift(); }
    // JANK STORM (2.369.143): frames alive but slow — the freeze the owner feels
    // that neither the self-gap nor the rAF-dead arm can see. One event + one
    // capture per storm; the storm closes after 20 s without a slow frame.
    if (!document.hidden && tickNow - visibleSince >= 3000) {
      const v = jankStormVerdict(_frameGaps, { now: tickNow, visibleSince });
      if (v.storm && !stormOpen) {
        stormOpen = tickNow;
        metric('jank-storm-covered-s', Math.round(v.coveredMs / 100) / 10);
        track('event', 'jank-storm', `${Math.round(v.coveredMs / 1000)}s of slow frames in 20 s (${v.slowFrames} frames ≥ 500 ms, worst ${Math.round(v.worstMs)} ms; timers alive)`);
        notifyFreeze({ kind: 'jank', s: Math.round(v.coveredMs / 100) / 10, at: tickNow - 20000, longTasks: _longTasks.slice(-5), frames: v });
      } else if (stormOpen && !v.storm && tickNow - stormOpen > 20000) stormOpen = 0;
    }
    if (selfGapIsFreeze({ tickGap, prevTick, now: tickNow, hiddenNow: document.hidden, visibleSince, hiddenAt })) {
      metric('renderer-freeze-s', Math.round((tickGap - 1000) / 100) / 10);
      track('event', 'renderer-freeze', `${Math.round((tickGap - 1000) / 1000)}s (timer AND rAF stalled — whole renderer/system)`);
      notifyFreeze({ kind: 'renderer', s: Math.round((tickGap - 1000) / 100) / 10, at: tickNow - tickGap, longTasks: _longTasks.slice(-5) });
    }
    if (document.hidden || Date.now() - visibleSince < 3000) { lastRaf = Date.now(); stallStart = 0; return; } // hidden tabs legitimately stop rAF; a return spike is not a stall
    const age = Date.now() - lastRaf;
    if (age > 2000 && !stallStart) stallStart = lastRaf;
    if (age <= 2000 && stallStart) {
      const dur = Math.round((Date.now() - stallStart) / 1000 * 10) / 10;
      _compStalls.push({ at: stallStart, s: dur });
      if (_compStalls.length > 20) _compStalls.shift();
      metric('compositor-stall-s', dur);
      track('event', 'compositor-stall', `${dur}s (rAF dead, timers alive — GPU/driver side)`);
      notifyFreeze({ kind: 'compositor', s: dur, at: stallStart, longTasks: _longTasks.slice(-5) });
      stallStart = 0;
    }
  }, 1000);
}

// GPU tier probe (2.339.3): the compositor-stall verdict needs to know WHAT
// is rasterizing — ANGLE/D3D11 (real GPU) vs SwiftShader (software = every
// raster storm lands on the CPU). One throwaway context at boot, cached.
export function gpuRenderer() {
  if (gpuRenderer._v !== undefined) return gpuRenderer._v;
  let v = null;
  try {
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) v = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    if (gl) { const lose = gl.getExtension('WEBGL_lose_context'); lose && lose.loseContext(); }
  } catch { }
  return (gpuRenderer._v = v);
}

export function installLongTaskWatch() {
  try {
    if (typeof PerformanceObserver === 'undefined') return;
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < 200) continue; // finer ring — freezes are often many medium tasks
        const rec = { at: Date.now(), ms: Math.round(e.duration) };
        _longTasks.push(rec);
        if (_longTasks.length > 40) _longTasks.shift();
        if (e.duration >= 1000) {
          let ctx = '';
          try {
            const ae = document.activeElement;
            ctx = (ae && ae !== document.body) ? `${ae.tagName.toLowerCase()}.${String(ae.className).split(' ')[0] || ''}` : 'none';
          } catch { }
          let ws = '';
          try { ws = (window.__vsWsRing || []).slice(-4).join(','); } catch { }
          metric('client-longtask-ms', Math.round(e.duration));
          track('event', 'client-longtask', `${Math.round(e.duration)}ms focus=${ctx} ws=${ws}`);
        }
      }
    });
    po.observe({ type: 'longtask', buffered: true });
  } catch { }
}

export function reportBootTime() {
  try {
    const ms = performance.now();
    if (ms > 0 && ms < 300000) metric('boot-to-ready-ms', ms);
  } catch {}
}

// ── TEMPORARY code-line overlap tracer (2.105.x, remove after diagnosis) ──
// Real report: in a chat code block a LONG line paints its wrapped
// continuation ON TOP of itself (Chrome/mac, persistent — scrolling away and
// back does not heal it). A fresh view-only rebuild of the same card measures
// clean, so the bad state depends on the live window's history. This scanner
// samples VISIBLE code lines every 10s and, when two sibling rows' rects
// overlap vertically (or a row paints taller than its layout box), ships ONE
// diagnostic event with the geometry + computed styles that matter
// (white-space, content-visibility/contain of the enclosing .chat-msg, wrap
// class, char length). Names/numbers only — never text content.
let overlapReports = 0;
