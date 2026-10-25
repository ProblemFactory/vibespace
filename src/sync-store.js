/**
 * SyncStore — unified versioned state sync with diff broadcast.
 *
 * Each store tracks ops with monotonic versions. On reconnect, clients request
 * ops since their last version to avoid full-state reload.
 * Future multi-user ready via optional namespace prefix on keys.
 */

const fs = require('fs');
const path = require('path');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// THE SENDER'S NAME on a broadcast (`from`, lane statesync-last-arrival): one id per socket, minted here — a client's
// own text is never an identity. A hub write (no socket) carries none.
const _senders = new WeakMap();
let _senderSeq = 0;
function senderOf(ws) {
  if (!ws || typeof ws !== 'object') return undefined;
  let id = _senders.get(ws);
  if (!id) { id = 'c' + (++_senderSeq).toString(36); _senders.set(ws, id); }
  return id;
}

class SyncStore {
  /**
   * @param {string} name - Store name (e.g. 'drafts', 'settings')
   * @param {string} filePath - Path to backing JSON file
   * @param {object} wss - WebSocketServer instance for broadcasting
   * @param {object} [opts]
   * @param {number} [opts.saveDelay=2000] - Debounce delay for disk persistence
   * @param {number} [opts.maxOps=500] - Max ops in ring buffer
   * @param {boolean} [opts.clientWrites=true] - false: a SERVER-OWNED mirror — a client's `state-set` is refused
   *   (src/ws-handler.js); with filePath null the owner module persists (lane agent-feedback: src/server/feedback-store.js)
   */
  constructor(name, filePath, wss, { saveDelay = 2000, maxOps = 500, clientWrites = true } = {}) {
    this.name = name;
    this.filePath = filePath;
    this.wss = wss;
    this.saveDelay = saveDelay;
    this.maxOps = maxOps;
    this.version = 0;
    this.ops = []; // ring buffer: [{version, op:'set'|'delete', key, value?}]
    this.data = {};
    this._saveTimer = null;
    this.clientWrites = clientWrites !== false;
    if (this.filePath) this._load();
  }

  _load() {
    ensureDir(path.dirname(this.filePath));
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      this.data = raw.data || {};
      this.version = raw.version || 0;
    } catch { this.data = {}; this.version = 0; }
  }

  _scheduleSave() {
    if (!this.filePath) return; // a mirror: its owner persists
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this.flush(); }, this.saveDelay);
  }

  /** Synchronous save — called on debounce fire and on server shutdown
   *  (SIGINT/SIGTERM exit immediately; without this, changes made within
   *  saveDelay of a restart were lost). Atomic via tmp+rename. */
  flush() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    if (!this.filePath) return;
    try {
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: this.version, data: this.data }, null, 2));
      fs.renameSync(tmp, this.filePath);
    } catch {}
  }

  _pushOp(op) {
    this.ops.push(op);
    if (this.ops.length > this.maxOps) this.ops = this.ops.slice(-this.maxOps);
  }

  // A client's write (senderWs = its socket, basedOn = the store version it had seen) is ANSWERED: `state-ack` tells the
  // sender the version its set produced, and the broadcast names the sender (`from`) and its `basedOn`. The client's
  // arrival rule (src/sync-arrival.js) needs the ack: a remote op the server ordered BEFORE the client's own set never
  // lands over it (B-cede — before, two devices setting one key within a round trip each took the other's last).
  // `extra` = a SERVER write's own stamp riding the op (lane stop-refills-composer: Stop's put-back carries `prepended`,
  // the prefix's length — the clients land it as a prefix over their live box, src/queue-putback.js). A client's
  // `state-set` passes none. The op rides the ring whole, so a reconnecting client's replay keeps the stamp.
  set(key, value, senderWs, basedOn, extra) {
    this.version++;
    this.data[key] = value;
    const op = { version: this.version, op: 'set', key, value, ...this._stamp(senderWs, basedOn), ...(extra && typeof extra === 'object' ? extra : {}) };
    this._pushOp(op);
    this._scheduleSave();
    this._broadcast(op, senderWs);
    this._ack(key, senderWs);
  }

  delete(key, senderWs, basedOn) {
    if (!(key in this.data)) { this._ack(key, senderWs); return; } // nothing to delete — still answered (the store's version), so the sender's set never waits
    this.version++;
    delete this.data[key];
    const op = { version: this.version, op: 'delete', key, ...this._stamp(senderWs, basedOn) };
    this._pushOp(op);
    this._scheduleSave();
    this._broadcast(op, senderWs);
    this._ack(key, senderWs);
  }

  _stamp(senderWs, basedOn) {
    const out = {};
    const from = senderOf(senderWs);
    if (from) out.from = from;
    if (Number.isSafeInteger(basedOn) && basedOn >= 0) out.basedOn = basedOn;
    return out;
  }

  _ack(key, senderWs) {
    if (!senderWs || senderWs.readyState !== 1) return;
    try { senderWs.send(JSON.stringify({ type: 'state-ack', store: this.name, key, version: this.version })); } catch {}
  }

  get(key) { return this.data[key]; }
  getAll() { return this.data; }
  getSnapshot() { return { version: this.version, data: { ...this.data } }; }

  getOpsSince(sinceVersion) {
    // Client claims a FUTURE version ⇒ this store was rolled back (SIGKILL/OOM
    // lost the 2s-debounced save; only SIGINT/SIGTERM flush). The old empty-ops
    // answer left that client silently believing it was in sync while holding
    // data the server lost — hand it the full snapshot instead; the client's
    // rollback branch (StateSync._applySnapshot) re-pushes its newer keys.
    if (sinceVersion > this.version) return { full: this.data, version: this.version };
    if (sinceVersion >= this.version) return { ops: [], version: this.version };
    const idx = this.ops.findIndex(o => o.version > sinceVersion);
    if (idx >= 0 && this.ops[idx].version === sinceVersion + 1) {
      return { ops: this.ops.slice(idx), version: this.version };
    }
    return { full: this.data, version: this.version };
  }

  _broadcast(op, senderWs) {
    const msg = JSON.stringify({ type: 'state-sync', store: this.name, ...op });
    this.wss.clients.forEach(client => {
      if (client !== senderWs && client.readyState === 1) { try { client.send(msg); } catch {} }
    });
  }
}

module.exports = { SyncStore };
