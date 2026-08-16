// Incident capture ("panic button", 2.238.0 — the boss's timezone-gap fix):
// users hit problems while the admin sleeps, and by the time anyone looks the
// scene is gone. This module keeps ALWAYS-ON, bounded, in-memory ring buffers
// of the last ~minutes of client activity; the gear-menu "Report a problem"
// entry flushes them plus a full client-state snapshot to the server, which
// adds ITS OWN state and writes a bundle under data/incidents/<id>/. The user
// only has to relay the short incident id — the scene travels with it.
//
// PRIVACY RULES (do not regress): no typed TEXT is ever recorded (keydown
// entries keep only special-key names + a "typing" marker), ws entries keep
// type/sessionId/size only (never payload bodies), chat content is never
// captured (transcripts already live on disk — the bundle's timestamps point
// at them). The user-supplied note is the only free text.
import { t } from './i18n.js';
import { BUILD_VERSION } from './build-version.js';
import { showToast, fetchJson, copyText, createModalShell, escHtml } from './utils.js';

const CAP = { action: 500, ws: 700, console: 250, op: 300 };

function push(ring, cap, entry) {
  ring.push(entry);
  if (ring.length > cap) ring.splice(0, ring.length - cap);
}

// Compact element descriptor: enough to know WHAT was clicked, small enough
// to keep 500 of them. id > data-popover/class chain > tag.
function describeEl(el) {
  try {
    const parts = [];
    let n = el;
    for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) {
      let d = n.tagName.toLowerCase();
      if (n.id) { parts.push(d + '#' + n.id); break; }
      const cls = String(n.className || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      if (cls) d += '.' + cls;
      parts.push(d);
    }
    return parts.join('<');
  } catch { return '?'; }
}

export function installIncidentRecorder(app) {
  const rings = { action: [], ws: [], console: [], op: [] };
  const t0 = Date.now();

  // ── action ring: clicks + coarse keys + window lifecycle ──
  document.addEventListener('pointerdown', (e) => {
    push(rings.action, CAP.action, { t: Date.now(), k: 'ptr', el: describeEl(e.target), x: Math.round(e.clientX), y: Math.round(e.clientY) });
  }, { capture: true, passive: true });
  let lastTypeAt = 0;
  document.addEventListener('keydown', (e) => {
    const special = e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey;
    if (special) {
      push(rings.action, CAP.action, { t: Date.now(), k: 'key', key: (e.ctrlKey ? 'C-' : '') + (e.metaKey ? 'M-' : '') + (e.altKey ? 'A-' : '') + e.key, el: describeEl(e.target) });
    } else if (Date.now() - lastTypeAt > 3000) {
      lastTypeAt = Date.now(); // one "typing" marker per burst — never the text
      push(rings.action, CAP.action, { t: Date.now(), k: 'typing', el: describeEl(e.target) });
    }
  }, { capture: true, passive: true });

  // ── ws ring: message TYPES both directions (no payloads) ──
  try {
    const ws = app.ws;
    const origSend = ws.send.bind(ws);
    ws.send = (msg) => {
      try { push(rings.ws, CAP.ws, { t: Date.now(), d: '>', ty: msg?.type, sid: msg?.sessionId }); } catch {}
      return origSend(msg);
    };
    ws.onGlobal((msg) => {
      try {
        const e = { t: Date.now(), d: '<', ty: msg?.type, sid: msg?.sessionId };
        // tiny type-specific extracts that are pure diagnostics, never content
        if (msg?.type === 'error') { e.code = msg.code; e.msg = String(msg.message || '').slice(0, 120); }
        if (msg?.type === 'exited') { e.reason = msg.reason; }
        if (msg?.type === 'server-notice') { e.key = msg.key; }
        push(rings.ws, CAP.ws, e);
      } catch {}
    });
    ws.onStateChange?.((state) => push(rings.ws, CAP.ws, { t: Date.now(), d: '=', ty: 'ws-' + state }));
  } catch {}

  // ── semantic op breadcrumbs (2.296.0, the pool-collapse lesson) ──
  // Clicks and ws types could not answer "what MOVED these windows?": the
  // incident that flattened a whole layout left no trace of the desktop
  // reassignments at all, so the sequence had to be reconstructed by reading
  // code. Any module can now drop a typed breadcrumb for an operation that
  // RELOCATES OR REPLACES a window/session — the class where "what did the
  // app just do to my layout" is the whole question. Names + ids only, never
  // content (the privacy rule above is unchanged).
  const opRing = rings.op = [];
  window.__vsOp = (name, data) => {
    try { push(opRing, CAP.op, { t: Date.now(), op: String(name).slice(0, 40), ...(data || {}) }); } catch {}
  };

  // ── console ring: errors/warnings that scrolled away long ago ──
  for (const level of ['error', 'warn']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      try {
        push(rings.console, CAP.console, { t: Date.now(), l: level, m: args.map((a) => (a instanceof Error ? a.stack || a.message : String(a))).join(' ').slice(0, 400) });
      } catch {}
      orig(...args);
    };
  }
  window.addEventListener('error', (e) => {
    push(rings.console, CAP.console, { t: Date.now(), l: 'uncaught', m: String(e.message || '').slice(0, 400), src: `${e.filename || ''}:${e.lineno || 0}` });
  });
  window.addEventListener('unhandledrejection', (e) => {
    push(rings.console, CAP.console, { t: Date.now(), l: 'unhandled', m: String(e.reason?.message || e.reason || '').slice(0, 400) });
  });

  // ── full client-state snapshot at capture time ──
  const snapshot = () => {
    const out = { t: Date.now(), sinceLoadMs: Date.now() - t0, ua: navigator.userAgent, viewport: `${innerWidth}x${innerHeight}`, lang: document.documentElement.lang || '', gpu: window.__vsGpu || null };
    try { out.heapMB = Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576); } catch {}
    try {
      out.windows = [...app.wm.windows.values()].map((w) => ({
        id: w.id, type: w.type, title: w.titleSpan?.textContent?.slice(0, 60),
        desktop: w._desktopId, min: !!w.isMinimized, hiddenByDesktop: !!w._hiddenByDesktop, onStage: !!w._onStage,
        spec: w._openSpec ? { action: w._openSpec.action, backendSessionId: w._openSpec.backendSessionId, hostId: w._openSpec.hostId, cwd: w._openSpec.cwd } : null,
      }));
    } catch (e) { out.windows = 'failed: ' + e.message; }
    try {
      out.sessions = (app.sidebar?._allSessions || []).slice(0, 120).map((s) => ({
        id: s.sessionId, be: s.backend, st: s.status, host: s.host || null, webui: s.webuiId || null, name: (s.name || '').slice(0, 40),
      }));
    } catch (e) { out.sessions = 'failed: ' + e.message; }
    try { out.wsState = app.ws?.connected ? 'connected' : 'disconnected'; } catch {}
    try { out.activeDesktop = app.desktopManager?._activeId; } catch {}
    // Per-chat-window SCROLL TRACER tails (B-21bc, user request: reports must
    // carry them automatically — no dump hotkey the user has to remember).
    // The ring records every scroll-affecting op (coarse scroll moves with
    // pin state + time-since-user-wheel, paging/trim/fold compensations) —
    // positions and op tags only, never message content.
    try {
      const traces = {};
      for (const [winId, v] of app.sessions || []) {
        if (v?._traceRing?.length) traces[winId] = { sid: v.sessionId || null, tail: v._traceRing.slice(-200) };
      }
      if (Object.keys(traces).length) out.chatTraces = traces;
    } catch (e) { out.chatTraces = 'failed: ' + e.message; }
    return out;
  };

  // ── the capture flow ──
  app.captureIncident = async () => {
    const shell = createModalShell({ title: t('Report a problem (capture the scene)') });
    const body = shell.body;
    body.innerHTML = `
      <div class="usage-note" style="margin-bottom:8px">${escHtml(t('This freezes the whole scene — the last few minutes of UI activity (clicks, window events, errors; never any text you typed or message content), plus the live environment on this instance AND on every machine your sessions use: process tables, session state, lock files, transcript fingerprints. Capture this BEFORE you try to fix things yourself — afterwards the evidence is gone.'))}</div>
      <textarea class="dialog-input" rows="3" style="width:100%;box-sizing:border-box" placeholder="${escHtml(t('What went wrong? (optional but helpful)'))}"></textarea>`;
    const ta = body.querySelector('textarea');
    const btn = document.createElement('button');
    btn.className = 'btn-create';
    btn.textContent = t('Capture now');
    // createModalShell has NO .footer (2.239.1, the boss's "怎么提交"
    // screenshot: the button silently never rendered — shell.footer was
    // undefined and the appendChild threw). Build the actions row ourselves,
    // the same .dialog-actions convention every other dialog uses.
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    actions.appendChild(btn);
    body.appendChild(actions);
    btn.onclick = async () => {
      btn.disabled = true;
      const prevLabel = btn.textContent;
      btn.textContent = t('Capturing\u2026');
      const r = await fetchJson('/api/incident', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: ta.value.slice(0, 2000), rings, snapshot: snapshot(), version: BUILD_VERSION }),
      });
      if (!r?.id) {
        btn.disabled = false;
        btn.textContent = prevLabel;
        // Inline, not only a toast (2.240.0: the first field user clicked
        // mid-server-restart, the request died, and the toast went unseen —
        // the dialog just looked frozen)
        let errLine = body.querySelector('.inc-cap-err');
        if (!errLine) { errLine = document.createElement('div'); errLine.className = 'usage-warn inc-cap-err'; body.appendChild(errLine); }
        errLine.textContent = t('Capture failed ({err}) — the server may be busy or restarting. Try again in a moment.', { err: r?.error || 'no answer' });
        return;
      }
      // 2-minute follow-up flush: "it's happening right now" cases get the
      // aftermath appended to the same incident.
      setTimeout(async () => {
        try { await fetchJson(`/api/incident/${encodeURIComponent(r.id)}/append`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rings, snapshot: snapshot() }) }); } catch {}
      }, 120000);
      body.innerHTML = `
        <div style="text-align:center;padding:12px 4px">
          <div class="usage-section-title">${escHtml(t('Scene captured. Send this ID to the admin:'))}</div>
          <div class="mono" style="font-size:20px;font-weight:700;margin:10px 0;user-select:all">${escHtml(r.id)}</div>
          <div class="usage-note">${escHtml(t('The full environment is frozen (processes, session state, locks, transcript fingerprints — local and on every machine involved), so you can now troubleshoot freely: resuming, killing or restarting anything will NOT destroy the evidence. A follow-up snapshot of the next 2 minutes attaches automatically.'))}</div>
        </div>`;
      btn.textContent = t('Copy ID');
      btn.disabled = false;
      btn.onclick = () => { copyText(r.id); showToast(t('Copied')); };
    };
  };
}
