import { metric } from './telemetry-client.js';

// THE ATTACH CAPABILITY ADVERT (perf lane chunk D): every `attach` this client
// sends says it reads `seq` on `msg` frames, resumes by `sinceSeq` and answers
// `lagged` by re-attaching — the server cuts a stalled socket ONLY for a client
// that said so (an old client keeps today's unbounded delivery). One spelling,
// applied at the wire so no attach site can forget it (and `request`'s
// pending-dedup compares the same text `send` queued).
const ATTACH_CAPS = ['op-seq'];
const wireText = (d) => JSON.stringify(d && d.type === 'attach' && !d.caps ? { ...d, caps: ATTACH_CAPS } : d);

class WsManager {
  constructor() {
    this.ws = null; this.handlers = new Map(); this.globalHandlers = []; this.pending = [];
    this._connected = false;
    this._stateListeners = []; // {connected: bool} listeners
    // ATTACHES IN FLIGHT (perf r1): sessionId → when its attach was sent (or
    // queued), until its `attached`/`error` lands. The burst half of the slab
    // verdict (view-visibility.js attachSlab) reads the count; a drop clears it
    // (an unanswered attach on a dead socket is not in flight on the next one).
    this._attachInFlight = new Map();
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
      // tiny attribution ring for the long-task telemetry (what was being
      // processed when the main thread stalled) — cheap, 16 entries
      try { const r = (window.__vsWsRing = window.__vsWsRing || []); r.push(d.type + (d.op ? ':' + d.op : '')); if (r.length > 16) r.shift(); } catch { }
      // the ATTACH SLAB's cost on the wire (perf lane A: the slab is a text
      // window, not tail(50)) — frame length + record count, 32 entries; read by
      // test-chat-paging's first-paint legs and the incident capture
      // (+ chunk D: whether it carried a slab at all, and how many ops a held resume replayed)
      if ((d.type === 'attached' || d.type === 'error') && d.sessionId) this._attachInFlight.delete(d.sessionId);
      if (d.type === 'attached') { try { const r = (window.__vsAttachFrames = window.__vsAttachFrames || []); r.push({ sid: d.sessionId, len: e.data.length, n: Array.isArray(d.messages) ? d.messages.length : 0, slab: Array.isArray(d.messages), held: d.slab === 'held', replay: Array.isArray(d.replay) ? d.replay.length : 0, total: d.totalCount || 0, t: Date.now() }); if (r.length > 32) r.shift(); } catch { } }
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
      this._attachInFlight.clear();
      if (wasConnected) { this._outageStart = Date.now(); this._notifyState(false); }
      // Auth token revoked/expired? The WS upgrade gets rejected before open —
      // probe once per close and bounce to the login page instead of retrying
      // forever against a 401.
      fetch('/api/home').then(r => { if (r.status === 401) location.href = '/login'; }).catch(() => {});
      // 2 s + 0–1 s JITTER (2.369.119, the peer-system lesson): every open tab
      // reconnecting on the same fixed timer hits the server in lockstep after
      // an outage — 19 windows re-attaching in the same second was the
      // inc-mtndq0vb storm. Jitter decorrelates the clients; nothing else changes.
      setTimeout(() => this.connect(), 2000 + Math.floor(Math.random() * 1000));
    };
    this.ws.onerror = () => {};
  }
  get connected() { return this._connected; }
  send(d) {
    const m = wireText(d);
    if (d && d.type === 'attach' && d.sessionId) this._attachInFlight.set(d.sessionId, Date.now());
    this.ws?.readyState === 1 ? this.ws.send(m) : this.pending.push(m);
  }
  /** How many attaches this socket sent (or queued) that are not answered yet —
   *  an entry older than 15 s no longer counts (a slow rebuild is not a burst). */
  attachesInFlight(now = Date.now()) {
    let n = 0;
    for (const [sid, t] of this._attachInFlight) { if (now - t < 15000) n++; else this._attachInFlight.delete(sid); }
    return n;
  }
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
      if (this.pending.includes(wireText(msg))) return;
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
  // Returns ITS OWN unsubscribe. `off?.()` on the result of a subscribe call
  // is the idiom every teardown in this tree reaches for, and while this
  // returned `undefined` that idiom was a silent no-op: a CLOSED window kept
  // its handler, kept fetching and kept POSTing, holding its whole detached
  // DOM subtree alive. `offGlobal(h)` stays, and is what this calls.
  onGlobal(h) { this.globalHandlers.push(h); return () => this.offGlobal(h); }
  offGlobal(h) { const i = this.globalHandlers.indexOf(h); if (i >= 0) this.globalHandlers.splice(i, 1); }
  onStateChange(h) { this._stateListeners.push(h); }
  offStateChange(h) { const i = this._stateListeners.indexOf(h); if (i >= 0) this._stateListeners.splice(i, 1); }
  _notifyState(connected) { for (const h of this._stateListeners) h(connected); }
}

export { WsManager, ATTACH_CAPS, wireText };
