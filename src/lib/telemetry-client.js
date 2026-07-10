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

function send(events) {
  try {
    const body = JSON.stringify({ events });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }));
    else fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {}
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
  QUEUE.push({ kind: 'metric', name, value: Math.round(value * 10) / 10 });
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
  QUEUE.push({ kind, name, detail, stack, ua: navigator.userAgent });
  if (QUEUE.length >= 10) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, 15000);
}

export function installTelemetry() {
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
    flush();
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
export function reportBootTime() {
  try {
    const ms = performance.now();
    if (ms > 0 && ms < 300000) metric('boot-to-ready-ms', ms);
  } catch {}
}
