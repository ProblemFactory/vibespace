import { metric } from './telemetry-client.js';

class WsManager {
  constructor() {
    this.ws = null; this.handlers = new Map(); this.globalHandlers = []; this.pending = [];
    this._connected = false;
    this._stateListeners = []; // {connected: bool} listeners
    this.connect();
  }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws.onopen = () => {
      this._connected = true;
      // Reconnect after an outage → record how long the client was cut off
      if (this._outageStart) { metric('ws-outage-ms', Date.now() - this._outageStart); this._outageStart = null; }
      this._notifyState(true);
      for (const m of this.pending) this.ws.send(m); this.pending = [];
    };
    this.ws.onmessage = (e) => {
      let d; try { d = JSON.parse(e.data); } catch { return; }
      // Isolate each handler: one throwing handler (a disposed ChatView, a stale
      // closure) must NOT abort delivery to every later handler — layout-sync,
      // settings-updated, editor-open etc. all ride these same lists.
      const call = (h) => { try { h(d); } catch (err) { console.error('[ws] handler error', err); } };
      if (d.sessionId) [...(this.handlers.get(d.sessionId) || [])].forEach(call);
      // Snapshot: one-time handlers self-remove via offGlobal during dispatch;
      // splicing the live array inside forEach skips the next handler.
      [...this.globalHandlers].forEach(call);
    };
    this.ws.onclose = () => {
      // Only notify on a real transition: while the server is down, each failed
      // 2s retry fires onclose again — without this guard every retry appended
      // another "Disconnected from server" marker to every chat window.
      const wasConnected = this._connected;
      this._connected = false;
      if (wasConnected) { this._outageStart = Date.now(); this._notifyState(false); }
      // Auth token revoked/expired? The WS upgrade gets rejected before open —
      // probe once per close and bounce to the login page instead of retrying
      // forever against a 401.
      fetch('/api/home').then(r => { if (r.status === 401) location.href = '/login'; }).catch(() => {});
      setTimeout(() => this.connect(), 2000);
    };
    this.ws.onerror = () => {};
  }
  get connected() { return this._connected; }
  send(d) { const m = JSON.stringify(d); this.ws?.readyState === 1 ? this.ws.send(m) : this.pending.push(m); }
  // One-time request/reply: sends `msg`, watches the global stream until
  // matchFn(m) returns truthy (reply consumed), then unhooks itself. Retires
  // the hand-rolled one-time-handler pattern (2026-07-03 review structural
  // recommendation) with its three recurring failure modes:
  // - isAlive() false (window closed before the reply) → self-cleanup, so the
  //   handler can't bind a session into a dead winInfo or leak forever.
  // - timeoutMs/onTimeout: watchdog fires ONCE but the handler stays armed —
  //   a late reply must still bind (matches the old watchdog semantics).
  // - resend: true → re-send the original msg on every ws reconnect while
  //   unanswered. A request written to a socket that died before answering
  //   dead-ended forever (the server restarted between request and reply and
  //   never saw it — blank-shell class); pending-flush in send() only covers
  //   messages queued while ALREADY disconnected. Callers opt in per the
  //   idempotency of their request.
  // Returns a cancel() for callers that need early teardown.
  request(msg, matchFn, { isAlive, timeoutMs, onTimeout, resend = false } = {}) {
    let done = false, timer = null;
    const cleanup = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      this.offGlobal(handler);
      this.offStateChange(stateH);
    };
    const handler = (m) => {
      if (done) return;
      if (isAlive && !isAlive()) { cleanup(); return; }
      // matchFn errors must not tear down the request — a throwing branch
      // mid-build would otherwise leave the window permanently half-bound.
      let matched = false;
      try { matched = !!matchFn(m); } catch (err) { console.error('[ws] request match error', err); }
      if (matched) cleanup();
    };
    const stateH = (connected) => {
      if (!connected || done || !resend) return;
      if (isAlive && !isAlive()) { cleanup(); return; }
      // Request made while disconnected → the original still sits in the
      // pending queue and onopen's flush (which runs AFTER state notify) will
      // deliver it — a resend here would double-send (double-spawn class).
      if (this.pending.includes(JSON.stringify(msg))) return;
      this.send(msg);
    };
    this.onGlobal(handler);
    this.onStateChange(stateH);
    if (timeoutMs) timer = setTimeout(() => { if (!done) onTimeout?.(); }, timeoutMs);
    this.send(msg);
    return cleanup;
  }
  on(sid, h) { if (!this.handlers.has(sid)) this.handlers.set(sid, []); this.handlers.get(sid).push(h); }
  off(sid) { this.handlers.delete(sid); }
  onGlobal(h) { this.globalHandlers.push(h); }
  offGlobal(h) { const i = this.globalHandlers.indexOf(h); if (i >= 0) this.globalHandlers.splice(i, 1); }
  onStateChange(h) { this._stateListeners.push(h); }
  offStateChange(h) { const i = this._stateListeners.indexOf(h); if (i >= 0) this._stateListeners.splice(i, 1); }
  _notifyState(connected) { for (const h of this._stateListeners) h(connected); }
}

export { WsManager };
