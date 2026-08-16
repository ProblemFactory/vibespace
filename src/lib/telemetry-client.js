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
  QUEUE.push({ kind: 'metric', name, value: Math.round(value * 10) / 10, version: BUILD_VERSION });
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
  QUEUE.push({ kind, name, detail, stack, ua: navigator.userAgent, version: BUILD_VERSION });
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
// ── COMPOSITOR-STALL detector (2.339.4, the RTX-5090 verdict) ────────────
// rAF callbacks are driven by the compositor's vsync; timers are not. When a
// 1s timer observes the last rAF tick aging past 2s while the page is
// visible, the COMPOSITOR/GPU pipeline is stalled — the exact freeze shape
// the Windows incidents show (idle main thread, frozen OS cursor, zero
// longtasks). Records duration on recovery; ring feeds incident bundles.
const _compStalls = [];
export function recentCompositorStalls() { return _compStalls.slice(); }
export function installCompositorStallWatch() {
  let lastRaf = Date.now();
  let stallStart = 0;
  const loop = () => { lastRaf = Date.now(); requestAnimationFrame(loop); };
  try { requestAnimationFrame(loop); } catch { return; }
  setInterval(() => {
    if (document.hidden) { lastRaf = Date.now(); stallStart = 0; return; } // hidden tabs legitimately stop rAF
    const age = Date.now() - lastRaf;
    if (age > 2000 && !stallStart) stallStart = lastRaf;
    if (age <= 2000 && stallStart) {
      const dur = Math.round((Date.now() - stallStart) / 1000 * 10) / 10;
      _compStalls.push({ at: stallStart, s: dur });
      if (_compStalls.length > 20) _compStalls.shift();
      metric('compositor-stall-s', dur);
      track('event', 'compositor-stall', `${dur}s (rAF dead, timers alive — GPU/driver side)`);
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
