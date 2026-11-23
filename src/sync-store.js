/**
 * SyncStore — unified versioned state sync with diff broadcast.
 *
 * Each store tracks ops with monotonic versions. On reconnect, clients request
 * ops since their last version to avoid full-state reload.
 * Future multi-user ready via optional namespace prefix on keys.
 */

const fs = require('fs');
const path = require('path');
const SR = require('./store-read.js');
const HOLD = require('./store-read-hold.js');

// THE ONE READ UNDER THE STORE-READ LAW (lane lg-recovery, 主开发 r3262 / r3271; the store census's item 2). The release read a
// failed or torn file as «nothing at version 0», and every stop, crash and 2 s save wrote that over drafts.json, stage-sync.json,
// uploads-sync.json (and settings-sync.json, which shares the read): a person's unsent chat and document drafts, the Stage layout,
// the upload history gone. Now (src/store-read-hold.js):
//   HELD — nothing is written over the file (the 2 s save, the stop's flush, the crash handler's flush all ask `writable()`); it is
//     read again OFF the loop on the law's ladder; torn bytes are kept aside once, then it lifts with what was typed.
//   THE PAGES (law (a)) — both doors answer HELD, never a snapshot: GET /api/sync/:store (snapshotAnswer: 503 by name, no data) and a
//     reconnect's state-resync (resyncAnswer: `state-held`). Each page keeps what it holds; a fresh page starts empty AND held.
//   TYPING WHILE HELD (law (b)) — the store works IN MEMORY (the same sets, broadcasts and acks), and an OVERLAY keeps every unit (a
//     key: one conversation's draft, one document's comments, one upload row, one Stage key) changed while held: its value, or its
//     deletion. AT THE LIFT: the file's value, each unit of the overlay taking its held value (a deletion stays deleted), every other
//     unit kept; ONE snapshot to every page, its version above every version a page named while held (no page takes its rollback
//     branch over the merged truth); the store is written only then.
//   A STOP WHILE STILL HELD (r3271, C2): the overlay is not written anywhere. The page that typed still holds the text, and its own
//     law (src/lib/utils.js StateSync) sends it again at the lift; lost only when VibeSpace restarts first AND that page was closed.
const HELD_CODES = { drafts: 'drafts_unread', stage: 'stage_unread', uploads: 'uploads_unread', settings: 'settings_unread' };
const STORE_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && (v.data === undefined || (!!v.data && typeof v.data === 'object' && !Array.isArray(v.data)));
const LIST_WORDS = { drafts: 'your saved drafts', stage: 'the Stage layout', uploads: 'the list of recent uploads', settings: 'the synced settings' };

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
    const file = this.filePath, base = path.basename(file);
    this._heldCode = HELD_CODES[this.name] || `${this.name}_unread`;   // the store's code, said to every page while held
    this._hold = HOLD.create({
      file, valid: STORE_SHAPE, code: this._heldCode, aside: (mark) => file + '.corrupt-' + mark,
      words: (h) => `${LIST_WORDS[this.name] || base} could not be read (${h.code}); VibeSpace reads ${base} again every few minutes. Nothing is written over it, and what is typed meanwhile is kept and joins it when it reads.`,
      log: (m) => console.warn('[sync] ' + m),
      onLift: (v, facts) => this._lifted(v, facts),
    });
    let read; try { read = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: STORE_SHAPE });
    const st = this._hold.start(a);
    if (st === 'data') { this.data = a.value.data || {}; this.version = a.value.version || 0; } else { this.data = {}; this.version = 0; }
    this._overlay = st === 'held' ? new Map() : null;   // unit → { value } | { deleted: true }, while held
    this._namedMax = 0;                                // the highest version a page named while held
  }

  /** while the file is unread: { store, code (the store's: drafts_unread…), cause (the read's own: EIO, torn bytes…), file, since } —
   *  null when it reads (or a mirror with no file) */
  held() {
    const f = this._hold ? this._hold.held() : null;
    return f ? { store: this.name, code: this._heldCode, cause: f.code, file: f.file, since: f.since } : null;
  }

  /** THE FIRST LOAD's answer (GET /api/sync/:store) → { status, body }: HELD by name (503, no data) — never «nothing at version 0» */
  snapshotAnswer() {
    const h = this.held();
    if (h) return { status: 503, body: { error: this._hold.words(), code: h.code, held: true, store: this.name } };
    return { status: 200, body: this.getSnapshot() };
  }

  /** A RECONNECT's answer (state-resync) → the messages for that page: HELD (the version it named is kept for the lift) — never a
   *  snapshot while held; else the missed ops or the full snapshot, as before */
  resyncAnswer(sinceVersion) {
    if (this.held()) {
      if (Number.isSafeInteger(sinceVersion) && sinceVersion > this._namedMax) this._namedMax = sinceVersion;
      return [{ type: 'state-held', store: this.name, code: this._heldCode }];
    }
    const result = this.getOpsSince(sinceVersion);
    if (result.full) return [{ type: 'state-snapshot', store: this.name, data: result.full, version: result.version }];
    return result.ops.map((op) => ({ type: 'state-sync', store: this.name, ...op }));
  }

  /** THE LIFT (src/store-read-hold.js onLift): the file's units, each unit changed while held taking its held value, every other
   *  unit kept; ONE snapshot to every page above every version named; written now */
  _lifted(v, facts) {
    const fileData = v && v.data && typeof v.data === 'object' && !Array.isArray(v.data) ? v.data : {};
    const fileVersion = v && Number.isSafeInteger(v.version) ? v.version : 0;
    const merged = { ...fileData };
    for (const [key, u] of this._overlay || []) { if (u.deleted) delete merged[key]; else merged[key] = u.value; }
    this.data = merged;
    this.version = Math.max(fileVersion, this._namedMax || 0, this.version) + 1;
    this.ops = [];   // the snapshot is the new base: no op of the held run is replayed over it
    this._overlay = null; this._namedMax = 0;
    this._scheduleSave();
    const msg = JSON.stringify({ type: 'state-snapshot', store: this.name, data: this.data, version: this.version, lifted: true, ...(facts && facts.setAside ? { setAside: facts.setAside } : {}) });
    this.wss.clients.forEach((client) => { if (client.readyState === 1) { try { client.send(msg); } catch { } } });
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
    if (this._hold && !this._hold.writable(`a save of ${this.name}`)) return;   // held: nothing is written over the unread file
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
    if (this._overlay) this._overlay.set(key, { value });   // held: the unit changed meanwhile (law (b))
    const op = { version: this.version, op: 'set', key, value, ...this._stamp(senderWs, basedOn), ...(extra && typeof extra === 'object' ? extra : {}) };
    this._pushOp(op);
    this._scheduleSave();
    this._broadcast(op, senderWs);
    this._ack(key, senderWs);
  }

  delete(key, senderWs, basedOn) {
    // held: the unread file may hold the key — the deletion is KEPT for the lift (a draft sent while held stays deleted)
    if (!(key in this.data) && !this._overlay) { this._ack(key, senderWs); return; } // nothing to delete — still answered (the store's version), so the sender's set never waits
    this.version++;
    delete this.data[key];
    if (this._overlay) this._overlay.set(key, { deleted: true });
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
