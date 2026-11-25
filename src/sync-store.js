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
//     reconnect's state-resync (resyncAnswer: `state-held`). Each page keeps what it holds; a fresh page starts empty AND held. A page
//     that reconnects still unread SAYS so (state-resync's `unread`), and a store that reads answers it with the full snapshot.
//   WHILE HELD THE HUB TAKES NOTHING FOR IT (主开发 r3654, the family's plain law): a page's set or delete is answered «held» by name
//     for that op (`state-held` with its key), changes nothing in memory and reaches no other page. THE PAGE OWNS WHAT IT HOLDS
//     UNSENT (src/lib/utils.js StateSync): text typed meanwhile stays on that page and is sent at the store's first snapshot.
//   THE HUB's OWN WRITER — Stop's put-back of queued messages into a draft (a person's words; 主开发 r3890, the shape's own law, no
//     exception on the hub): its words go to every OPEN page at once (`state-held-putback`), which lands them in front of its box and
//     keeps them as typed text; the hub keeps no copy of words a page was handed. Only with NO page open does the hub OWE them —
//     bounded (OWED_MAX), said in the journal (kept in memory only: a restart before the file reads loses them) — hands them to the
//     first page that connects while still held, and at the lift lays each on the ORDINARY put-back road AFTER the snapshot, so a
//     page's own edit meets it by the release's own rule (the door's belt, noted at its landing). No other hub-side writer of these
//     stores exists; one would be refused, said once.
//   AT THE LIFT the hub loads the file and sends ONE snapshot of it; written when torn bytes were set aside (or a put-back lands).
const OWED_MAX = 20;   // r3890 B: the put-backs owed while held with NO page open (each Stop's text capped by the put-back's own bound); past it the oldest leaves, said
// THE FLUSH OFF THE LOOP (lane lg-recovery, 主开发 r3321; B-0248's first row, /var/tmp/vibespace-lanes/bl-loop-b/b0248-page.md): the
// release rewrote the whole file through a rename ON THE MAIN THREAD 2 s after each burst of typing — the hub's loop held for the
// rename's whole delay (half a second a flush on slow storage, ~300 flushes in ten minutes of typing). Now every change hands the
// file to THE STORE WRITER (src/store-writer.js), by its own pattern:
//   · the bytes are made AT the write (`_bytes`, the latest state: a burst of typing is ONE write), on the writer's own thread (temp +
//     rename); the main loop never waits on the storage;
//   · a person's typing RANKS FIRST (`rank: 0`): at a stop it is written in the exit's first pass, before the stores that can be
//     re-derived;
//   · what an ack or an echo promised is durable as the release's was: written within `saveDelay` (2 s) of the first unsaved change
//     (the writer's pace), the release's trailing 2 s save at the most; an answered set never waited on the disk, before or now;
//   · a failed write is SAID (the writer's own line, and the store's once a failing run: what was typed stays in memory and the
//     writer tries again);
//   · the stop's and the crash handler's flush write what is owed: the writer's exit flush (server.js) — `flush()` writes nothing
//     on the loop;
//   · a HELD store's writer still refuses: nothing is asked while held, and its bytes refuse by name (EHELD) if ever asked.
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

/** rule (C)'s join of two texts, once each (r4106 1): the one that holds the other stands; else the hub's text, then the page's, with the
 *  put-back's separator unless the hub's text already ends with it */
const JOIN_SEP = '\n\n';   // src/queue-putback.js PUTBACK_SEP
function joinText(saved, typed) {
  if (saved === typed || saved.includes(typed)) return saved;
  if (typed.includes(saved)) return typed;
  return saved === '' || saved.endsWith(JOIN_SEP) ? saved + typed : saved + JOIN_SEP + typed;
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
   * @param {object} [opts.writer] - the store writer (a suite's own; default the process's src/store-writer.js storeWriter())
   */
  constructor(name, filePath, wss, { saveDelay = 2000, maxOps = 500, clientWrites = true, writer = null } = {}) {
    this.name = name;
    this.filePath = filePath;
    this.wss = wss;
    this.saveDelay = saveDelay;
    this.maxOps = maxOps;
    this.version = 0;
    this.ops = []; // ring buffer: [{version, op:'set'|'delete', key, value?}]
    this.data = {};
    this._writerOpt = writer;
    this._failSaid = false;
    this.clientWrites = clientWrites !== false;
    // LAW (E) (r4040): the keys WRITTEN or CLEARED in this life of the hub (since its start or its lift) — a page's restore of one
    // is refused; in memory, small, gone at a restart (a new life has no writes yet). Every store has it, a mirror with no file too
    this._lifeWrites = new Set();
    // the follow (r4106 1, r4180 2): key → the text that stood UNDER the put-back's words when first laid, for the keys written in this
    // life ONLY by the hub's own put-back lays — a page's restore JOINS them
    this._lifeLaid = new Map();
    if (this.filePath) this._load();
  }

  _load() {
    ensureDir(path.dirname(this.filePath));
    const file = this.filePath, base = path.basename(file);
    this._heldCode = HELD_CODES[this.name] || `${this.name}_unread`;   // the store's code, said to every page while held
    this._hold = HOLD.create({
      file, valid: STORE_SHAPE, code: this._heldCode, aside: (mark) => file + '.corrupt-' + mark,
      words: (h) => `${LIST_WORDS[this.name] || base} could not be read (${h.code}); VibeSpace reads ${base} again every few minutes. Nothing is written over it${this.name === 'drafts' ? ', and what is typed meanwhile stays on the open pages until it reads' : '; changes made meanwhile are not kept'}.`,
      log: (m) => console.warn('[sync] ' + m),
      onLift: (v, facts) => this._lifted(v, facts),
    });
    let read; try { read = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: STORE_SHAPE });
    const st = this._hold.start(a);
    if (st === 'data') { this.data = a.value.data || {}; this.version = a.value.version || 0; } else { this.data = {}; this.version = 0; }
    this._owed = null;   // [{ key, prefix, onLanded }]: Stop's put-backs while held with NO page open (r3890 B), in order
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
    if (h) { const owed = this._handOwed(); return { status: 503, body: { error: this._hold.words(), code: h.code, held: true, store: this.name, ...(owed.length ? { putbacks: owed } : {}) } }; }
    return { status: 200, body: this.getSnapshot() };
  }

  /** A RECONNECT's answer (state-resync) → the messages for that page: HELD — never a snapshot while held; a page that says it holds
   *  the store as UNREAD gets the full snapshot (r3654 3: «no ops» would leave it unread for good); else the missed ops or the full
   *  snapshot, as before */
  resyncAnswer(sinceVersion, { unread = false } = {}) {
    if (this.held()) return [{ type: 'state-held', store: this.name, code: this._heldCode }, ...this._handOwed().map((o) => ({ type: 'state-held-putback', store: this.name, code: this._heldCode, ...o }))];
    // r3972: a page still unread holds a version of before the lift — after a FRESH lift that version is of the old counter, said
    if (unread) return [{ type: 'state-snapshot', store: this.name, data: this.data, version: this.version, ...(this._freshLife ? { fresh: true } : {}) }];
    const result = this.getOpsSince(sinceVersion);
    if (result.full) return [{ type: 'state-snapshot', store: this.name, data: result.full, version: result.version }];
    return result.ops.map((op) => ({ type: 'state-sync', store: this.name, ...op }));
  }

  /** THE LIFT (src/store-read-hold.js onLift): the file's units, as read — the hub took nothing while held; ONE snapshot of them to
   *  every page; then each OWED put-back on the ordinary put-back road, after it (r3890 B); written when torn bytes were set aside */
  _lifted(v, facts) {
    const fileData = v && v.data && typeof v.data === 'object' && !Array.isArray(v.data) ? v.data : {};
    this.data = { ...fileData };
    this.version = v && Number.isSafeInteger(v.version) ? v.version : 0;
    this.ops = [];
    const owed = this._owed || []; this._owed = null;
    if (facts && facts.setAside) { this.version++; this._scheduleSave(); }   // torn bytes now kept aside: the file is written whole
    this._lifeWrites = new Set(); this._lifeLaid = new Map();   // law (E): a lift begins a life — nothing is written in it yet (the owed put-backs below are its first writes)
    // `fresh`: no data came from the file (gone, or torn and set aside) — its counter began again: no page's last version is this one (r3972);
    // kept for this process, so a page still unread that missed this snapshot is told the same at its resync
    this._freshLife = !(v && v.data);
    const msg = JSON.stringify({ type: 'state-snapshot', store: this.name, data: this.data, version: this.version, lifted: true, ...(this._freshLife ? { fresh: true } : {}), ...(facts && facts.setAside ? { setAside: facts.setAside } : {}) });
    this.wss.clients.forEach((client) => { if (client.readyState === 1) { try { client.send(msg); } catch { } } });
    this._layOwed(owed);
  }

  /** each owed put-back, in order, as the release lays one: in front of the draft now, broadcast with its `prepended` to every page
   *  (each lands the prefix in front of its live box), and `onLanded(version)` for the door's belt */
  _layOwed(owed) {
    for (const o of owed) {
      const cur = typeof this.data[o.key] === 'string' ? this.data[o.key] : '';
      this.set(o.key, o.prefix + cur, null, undefined, { prepended: o.prefix.length });
      if (o.onLanded) { try { o.onLanded(this.version); } catch { } }
    }
    if (owed.length) console.warn(`[sync] ${path.basename(this.filePath)}: ${owed.length} put-back(s) of queued messages kept while it could not be read — laid on their drafts now, after its snapshot`);
  }

  /** STOP's PUT-BACK WHILE HELD (r3890): the words go to every OPEN page at once — each lands them in front of its box and keeps them
   *  as typed text, so the hub keeps NO copy; with no page open they are OWED (bounded, said: in memory only), handed to the first
   *  page that connects while still held, else laid after the lift's snapshot. → 'handed' | 'owed' */
  heldPutBack(key, prefix, { onLanded } = {}) {
    const base = path.basename(this.filePath);
    const open = [...this.wss.clients].filter((c) => c && c.readyState === 1);
    if (open.length) {
      const msg = JSON.stringify({ type: 'state-held-putback', store: this.name, code: this._heldCode, key, prefix });
      for (const c of open) { try { c.send(msg); } catch { } }
      return 'handed';
    }
    if (!this._owed) this._owed = [];
    this._owed.push({ key, prefix, onLanded: typeof onLanded === 'function' ? onLanded : null });
    if (this._owed.length > OWED_MAX) { this._owed.shift(); console.warn(`[sync] ${base}: more than ${OWED_MAX} put-backs owed while it cannot be read — the oldest is dropped`); }
    console.warn(`[sync] ${base}: a put-back of queued messages is kept in MEMORY ONLY (no page is open, and the file cannot be read): ${this._owed.length} owed; a restart before it reads loses them`);
    return 'owed';
  }
  /** a page connecting while held takes the owed put-backs; the hub's copy leaves (r3890 B) → [{ key, prefix }] */
  _handOwed() {
    const owed = this._owed || []; this._owed = null;
    return owed.map((o) => ({ key: o.key, prefix: o.prefix }));
  }

  /** WHILE HELD THE HUB TAKES NOTHING (r3654): a page's op is answered «held» by name (its key), nothing changes, nobody else hears it;
   *  the hub's own put-back (no socket, its `prepended` prefix) goes the held put-back's road (heldPutBack). Any other hub write is
   *  refused, said once */
  _whileHeld(key, senderWs, value, extra) {
    if (senderWs) {
      if (senderWs.readyState === 1) { try { senderWs.send(JSON.stringify({ type: 'state-held', store: this.name, code: this._heldCode, key })); } catch { } }
      return;
    }
    const n = extra && Number.isSafeInteger(extra.prepended) ? extra.prepended : 0;
    if (typeof value === 'string' && n > 0) { this.heldPutBack(key, value.slice(0, n)); return; }
    if (!this._hubRefusedSaid) { this._hubRefusedSaid = true; console.warn(`[sync] a hub write to ${path.basename(this.filePath)} was refused: the file could not be read, and nothing is taken for it until it reads`); }
  }

  _writer() { return this._writerOpt || require('./store-writer.js').storeWriter(); }

  /** A CHANGE's write (r3321): handed to the store writer — its bytes made at the write, on its own thread; a person's typing first
   *  at a stop (rank 0); due within saveDelay of the first unsaved change. Held: nothing is asked (the hub takes nothing while held;
   *  the lift asks when a put-back joins or torn bytes were set aside) */
  _scheduleSave() {
    if (!this.filePath) return; // a mirror: its owner persists
    if (this._hold && this._hold.held()) return;
    this._writer().dirty(this.filePath, { name: 'sync-store.write', rank: 0, debounceMs: this.saveDelay, produce: () => this._bytes(), onWritten: (ok, e) => this._written(ok, e) });
  }

  /** the bytes, made at the write — a held store's writer still refuses, by name (never the held, empty state over the file) */
  _bytes() {
    if (this._hold && !this._hold.writable(`a save of ${this.name}`)) throw Object.assign(new Error(`${path.basename(this.filePath)} is held (its read failed): nothing is written over it until it reads`), { code: 'EHELD' });
    return JSON.stringify({ version: this.version, data: this.data }, null, 2);
  }

  /** a failed write is SAID once a failing run (the writer says each attempt in its own line, and tries again); its end is said */
  _written(ok, e) {
    const base = path.basename(this.filePath);
    if (!ok) {
      if (!this._failSaid) { this._failSaid = true; console.warn(`[sync] ${base} could not be written (${(e && (e.code || e.message)) || 'failed'}): what was typed is kept in memory, and the store writer tries the write again`); }
      return;
    }
    if (this._failSaid) { this._failSaid = false; console.warn(`[sync] ${base} is written again`); }
  }

  /** THE STOP's FLUSH (server.js: the stop and the crash handler) — what is owed is the writer's: its exit flush writes it (rank 0
   *  first), on its thread, waited for. Nothing is written here on the loop. Held: refused, said once (src/store-read-hold.js) */
  flush() {
    if (!this.filePath) return;
    if (this._hold && !this._hold.writable(`a save of ${this.name}`)) return;
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
    if (this._hold && this._hold.held()) { this._whileHeld(key, senderWs, value, extra); return; }
    // a put-back's lay (its `prepended`) on a key nothing else wrote in this life keeps the key's restore a JOIN (r4106 1); any other write ends that
    const laid = !!(extra && Number.isSafeInteger(extra.prepended) && extra.prepended > 0);
    if (laid && (!this._lifeWrites.has(key) || this._lifeLaid.has(key))) { if (!this._lifeLaid.has(key)) this._lifeLaid.set(key, typeof this.data[key] === 'string' ? this.data[key] : ''); }
    else this._lifeLaid.delete(key);
    this._lifeWrites.add(key);
    this.version++;
    this.data[key] = value;
    const op = { version: this.version, op: 'set', key, value, ...this._stamp(senderWs, basedOn), ...(extra && typeof extra === 'object' ? extra : {}) };
    this._pushOp(op);
    this._scheduleSave();
    this._broadcast(op, senderWs);
    this._ack(key, senderWs);
  }

  delete(key, senderWs, basedOn) {
    if (this._hold && this._hold.held()) { this._whileHeld(key, senderWs); return; }
    this._lifeWrites.add(key); this._lifeLaid.delete(key);   // a clear is a write of the key (law (E)): a page's later restore of it is refused
    if (!(key in this.data)) { this._ack(key, senderWs); return; } // nothing to delete — still answered (the store's version), so the sender's set never waits
    this.version++;
    delete this.data[key];
    const op = { version: this.version, op: 'delete', key, ...this._stamp(senderWs, basedOn) };
    this._pushOp(op);
    this._scheduleSave();
    this._broadcast(op, senderWs);
    this._ack(key, senderWs);
  }

  /** LAW (E) (r4040), A RESTORE NEVER BEATS A WRITE, AND THE HUB DECIDES: a page's rollback re-push arrives as a RESTORE. It is
   *  applied only to a key nothing has written or cleared in this life of the hub (decided here, at its arrival, never by the page's
   *  view), and an applied restore is a write (a second page's restore of the key is refused). A refused one is answered
   *  `state-restore-refused { store, key, version, value? }`, so that page takes the hub's value; a restore never carries absence */
  restore(key, value, senderWs, basedOn) {
    if (this._hold && this._hold.held()) { this._whileHeld(key, senderWs, value); return 'held'; }
    if (value != null && value !== '' && !this._lifeWrites.has(key)) { this.set(key, value, senderWs, basedOn); return 'applied'; }
    // THE FOLLOW (r4106 1): a key written in this life only by the hub's own put-back lays — the put-back's words and the page's
    // earlier draft BOTH STAND, joined as rule (C) joins text (the words in front, as a put-back lands); the join is the hub's own write,
    // told to every page (a second page's restore of the key is then refused), and this page is answered with the joined value
    if (typeof value === 'string' && value !== '' && this._lifeLaid.has(key) && typeof this.data[key] === 'string') {
      // the hub knows what stood under the put-back's words (r4180 2): a page's draft that HOLDS it is that text's newer form — the
      // words, then the page's draft, ONCE (a lift at a lower version: the file's older draft is not written twice)
      const cur = this.data[key], under = this._lifeLaid.get(key) || '';
      const joined = value.includes(cur) ? value : cur.includes(value) ? cur
        : (cur.endsWith(under) && value.includes(under)) ? cur.slice(0, cur.length - under.length) + value : joinText(cur, value);
      if (joined !== this.data[key]) this.set(key, joined, null);
      if (senderWs && senderWs.readyState === 1) { try { senderWs.send(JSON.stringify({ type: 'state-restore-refused', store: this.name, key, version: this.version, value: this.data[key], joined: true })); } catch { } }
      return 'joined';
    }
    if (senderWs && senderWs.readyState === 1) {
      try { senderWs.send(JSON.stringify({ type: 'state-restore-refused', store: this.name, key, version: this.version, ...(key in this.data ? { value: this.data[key] } : {}) })); } catch { }
    }
    return 'refused';
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
