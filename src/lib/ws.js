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
      if (wasConnected) this._notifyState(false);
      setTimeout(() => this.connect(), 2000);
    };
    this.ws.onerror = () => {};
  }
  get connected() { return this._connected; }
  send(d) { const m = JSON.stringify(d); this.ws?.readyState === 1 ? this.ws.send(m) : this.pending.push(m); }
  on(sid, h) { if (!this.handlers.has(sid)) this.handlers.set(sid, []); this.handlers.get(sid).push(h); }
  off(sid) { this.handlers.delete(sid); }
  onGlobal(h) { this.globalHandlers.push(h); }
  offGlobal(h) { const i = this.globalHandlers.indexOf(h); if (i >= 0) this.globalHandlers.splice(i, 1); }
  onStateChange(h) { this._stateListeners.push(h); }
  offStateChange(h) { const i = this._stateListeners.indexOf(h); if (i >= 0) this._stateListeners.splice(i, 1); }
  _notifyState(connected) { for (const h of this._stateListeners) h(connected); }
}

export { WsManager };
