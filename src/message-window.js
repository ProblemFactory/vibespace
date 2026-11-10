'use strict';
// MESSAGE WINDOW — the ordered card list every chat normalizer keeps, spelled
// ONCE (dc-twins, rv-harnesses M10). The claude / codex / acp managers were
// three copies of the same window arithmetic (23 methods, `_nextId` identical
// in all three, no shared base); each now extends this class and keeps ONLY
// its normalization: how a record becomes cards (`_feedRecord`), what a
// history rebuild closes (`_finishHistory`), its record key and its search
// text. The window side here never reads a harness id.
//
// Ids are content-derived (R0, three-tier design): `_currentRk` = the record
// key the subclass stamps before it mints cards, so a rebuild reproduces the
// same ids; `seq` only names creates outside any record context.
const { sliceTextWindow } = require('./text-window.js'); // PURE: the attach slab counted in text cards (perf lane A)
const { turnPreviewOf, COMPACT_PREVIEW, personRow } = require('./assistant-note.js'); // PURE (B-40f8): THE preview of a user turn (+ who wrote a row)
const { placeOf } = require('./queue-chips.js'); // PURE (lane midturn-order): where a queue chip's bubble is drawn
const { queueDroppedOf, putbackNotice } = require('./queue-putback.js'); // PURE (lane stop-refills-composer): Stop's put-back record + its toast facts

const asArray = (v) => (Array.isArray(v) ? v : []);
// lane cli-self-measure (ruling R8 — the founding requirement, 2026-03-22 item 7: an ordinary Claude Code update needs no
// update of VibeSpace): a record kind a build ADDED is counted ONCE per process per build through the local telemetry road —
// `cli-record-kind` for a build this release has no record table for (an ordinary update: the quiet chip, nothing else), or
// `cli-record-surprise` for a build it DOES register (a real surprise: the chip's hover says so). Never a card in the chat.
const _kindsCounted = new Set();
const registeredClaude = (v) => { try { return require('./record-shape.js').SCHEMA_CLI_VERSIONS.includes(String(v)); } catch { return false; } };

class MessageWindow {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.seq = 0; // rebuild belt only — ids no longer derive from it (R0)
    this._rkCounts = new Map(); // record-key → messages minted from it (id suffix discriminator)
    this._currentRk = null;
    this.messages = [];
    this.messageIndex = new Map(); // id → NormalizedMessage
    this.listeners = [];
    this.turnIndex = 0;
    // THE DELIVERY ORDER (lane midturn-order — the owner, 2026-11-07: «你能不能确保chatview里的顺序就是事件的实际顺序»): the
    // list is the order of events AS THE AGENT LIVED THEM. A person's message the agent has not read yet is AFLOAT — the
    // trailing block of `messages`, in the order sent; every other card is placed ABOVE that block (`_place`), and each
    // message leaves it where its fate puts it (`_landFloat`). Server-side facts: the wire says only where a card goes
    // (a `create` op's `before`, a `move` op) — a live view and a rebuild apply the same rules to the same records.
    this._afloat = [];
    this._floatFacts = new Map(); // id → {ended: a turn ended since it was drawn, ride: it rode a tool result, rideBefore: the first card after that}
    this._landedFloats = new Set(); // ids that took their place — never afloat again
    this._floatSeq = new Map();     // id → the order it first went afloat (the order sent): the block is kept in it (r3 m12)
    this._floatSeqN = 0;
    this._live = true;            // moves are said as ops (a history conversion: false)
  }

  /** FNV-1a over a record's stable serialization → the `h:` record key every
   *  normalizer falls back to (deterministic for identical bytes). */
  static hashKey(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return 'h:' + h.toString(36) + ':' + str.length;
  }

  _nextId() {
    const rk = this._currentRk || ('s' + this.seq); // s-fallback: creates outside record context
    this.seq++;
    const n = this._rkCounts.get(rk) || 0;
    this._rkCounts.set(rk, n + 1);
    return `${this.sessionId}:${rk}${n ? '.' + n : ''}`;
  }

  onOp(fn) { this.listeners.push(fn); }
  offOp(fn) { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }
  _emit(op) {
    // THE DELIVERY ORDER (lane midturn-order): a card created ABOVE the afloat messages says so — `before` = the card it
    // goes before, `at` = its index in this list (the client inserts it there; without them a create is appended)
    if (op && op.op === 'create' && op.message && this._afloat.length && !op.before) {
      const i = this._indexNearEnd(op.message);
      if (i >= 0 && i < this.messages.length - 1) op = { ...op, before: this.messages[i + 1].id, at: i };
    }
    // lane parked-ask-inbox: an op carrying a permission (an ask opened / settled) is counted — feedLive tells the
    // For-you observer by it for a normalizer without the pending-asks level (codex / ACP)
    if (op && ((op.fields && op.fields.permission) || (op.op === 'create' && ((op.message && op.message.permission) || (op.msg && op.msg.permission))))) this._permOps = (this._permOps || 0) + 1;
    for (const fn of this.listeners) fn(op);
  }
  get permissionOpsVersion() { return this._permOps || 0; }

  /** THE KINDS OF RECORD THIS CONVERSATION'S HARNESS ADDED (lane door-healthy-chat — the naive studies' W1/C1: red «Unknown
   *  event» / «New fields on a known record» cards buried a person's answers). Such a record still becomes its notice message
   *  (history, the drift ledger and ⚙ Diagnostics read it) but the chat no longer draws it: this list feeds ONE quiet chip in
   *  the chat's status bar (→ ⚙ Diagnostics) — the update signal stays where the owner reads, out of the person's flow. One
   *  row per kind (`record` = a record type the normalizer does not know, `fields` = a known record that grew a field or a
   *  value), the newest CLI build beside it; a change is ONE meta op `record-kinds` (the attach payload carries the list).
   *  ≤ 50 kinds. */
  _noteAddedKind(kind, name, cli, emit) {
    const kinds = this._addedKinds || (this._addedKinds = new Map());
    const nm = String(name || '?').slice(0, 80);
    const key = kind + ':' + nm;
    const was = kinds.get(key);
    const ver = cli ? String(cli).slice(0, 40) : null;
    const claude = (this.harnessLabel || 'Claude Code') === 'Claude Code';
    const registered = !!ver && claude && registeredClaude(ver);
    const counted = `${this.harnessLabel || 'Claude Code'}|${ver || '-'}|${key}`;
    if (!_kindsCounted.has(counted) && _kindsCounted.size < 2000) { _kindsCounted.add(counted); try { global.__vsEvent?.(registered ? 'cli-record-surprise' : 'cli-record-kind', `${this.harnessLabel || 'Claude Code'} ${ver || '?'} · ${kind}:${nm}`.slice(0, 200)); } catch { } }
    if (was && (!ver || was.cli === ver)) return;
    if (!was && kinds.size >= 50) return;
    kinds.set(key, { kind, name: nm, cli: ver || (was && was.cli) || null, ...(registered ? { registered: true } : {}) });
    if (emit) this._emit({ op: 'meta', subtype: 'record-kinds', data: { kinds: this.addedKinds() } });
  }
  /** The kinds above, in the order first seen. */
  addedKinds() { return this._addedKinds ? [...this._addedKinds.values()] : []; }

  /** Get current message count */
  get total() { return this.messages.length; }
  /** Get message by ID */
  get(id) { return this.messageIndex.get(id); }
  /** Get last N messages */
  tail(n) { return this.messages.slice(-n); }
  /** THE ATTACH SLAB (perf lane A): the tail counted in TEXT cards, not
   *  records — src/text-window.js is the one rule. */
  tailWindow(opts) { return sliceTextWindow(this.messages, opts); }
  /** Get messages by offset+limit */
  slice(offset, limit) { return this.messages.slice(offset, offset + limit); }

  /** Turn boundaries for the minimap: [{turnIndex, startIdx, ts, role, preview?, isCompact?}] */
  turnMap() {
    const turns = [];
    let lastTurn = -1;
    for (let i = 0; i < this.messages.length; i++) {
      const m = this.messages[i];
      // A RETRACTED / rolled-back message is not a turn marker: the minimap
      // must never offer a jump to a turn the harness itself has taken back (§2.10).
      if (m.rewound) continue;
      const turnIndex = m.turnIndex ?? 0;
      if (turnIndex === lastTurn) continue;
      const entry = { turnIndex, startIdx: i, ts: m.ts, role: m.role };
      if (m.isCompact) { entry.isCompact = true; entry.preview = COMPACT_PREVIEW; }
      if (m.role === 'user') Object.assign(entry, turnPreviewOf(m)); // B-40f8: THE preview rule (a note says its sentence)
      turns.push(entry);
      lastTurn = turnIndex;
    }
    return turns;
  }

  /** Search messages by text query → [{index, id, type, preview}] */
  search(query) {
    const q = String(query || '').toLowerCase();
    if (!q) return [];
    const matches = [];
    for (let i = 0; i < this.messages.length; i++) {
      const text = this._extractText(this.messages[i]);
      if (text.toLowerCase().includes(q)) {
        matches.push({ index: i, id: this.messages[i].id, type: this.messages[i].role, preview: text.slice(0, 120) });
      }
    }
    return matches;
  }

  /** A card's searchable text (a normalizer whose blocks read differently overrides). */
  _extractText(msg) {
    return asArray(msg.content).map((b) => {
      if (b.type === 'text' || b.type === 'thinking' || b.type === 'system_info') return b.text || '';
      if (b.type === 'tool_call') return `${b.toolName || ''} ${JSON.stringify(b.input || {})}`;
      if (b.type === 'tool_result') return `${b.toolName || ''} ${b.output || ''}`;
      return '';
    }).join(' ');
  }

  /** The card fields after taskInfo, in the normalizer's wire order (each
   *  reads `fields[key] || null`); CARD_UUID stamps the record uuid after
   *  srcLine (claude's fork-from-here anchor). */
  static CARD_FIELDS = ['backendMeta', 'collapseKind', 'noticeKind'];
  static CARD_UUID = false;

  _create(fields) {
    const msg = {
      id: this._nextId(),
      role: fields.role,
      status: fields.status || 'complete',
      content: fields.content || [],
      ts: fields.ts || this._currentTs || Date.now(),
      srcLine: this._currentLine,
    };
    if (this.constructor.CARD_UUID) msg.uuid = this._currentUuid;
    Object.assign(msg, {
      turnIndex: fields.turnIndex ?? this.turnIndex,
      toolCallId: fields.toolCallId || null,
      toolName: fields.toolName || null,
      toolStatus: fields.toolStatus || null,
      permission: fields.permission || null,
      usage: fields.usage || null,
      taskInfo: fields.taskInfo || null,
    });
    for (const k of this.constructor.CARD_FIELDS) msg[k] = fields[k] || null;
    this._place(msg, { afloat: fields.afloat === true, startsTurn: fields.startsTurn === true });
    this.messageIndex.set(msg.id, msg);
    return msg;
  }

  // ── THE DELIVERY ORDER (lane midturn-order) ──
  /** Put a new card in the list. `afloat` = a person's message the agent has not read: it joins the trailing block. Every
   *  other card goes ABOVE that block — and a card that OPENS the next turn (`_opensTurn`) first lands what an ended turn
   *  left afloat (a kept message rides that turn's first request; a removed one never ran). `startsTurn` = the caller KNOWS
   *  this message starts a turn (a person's prompt the CLI took with no turn running): every float but a held one lands,
   *  whether or not the ended turn's result was seen. Every writer of a card calls this (the normalizers' placers too). → msg */
  _place(msg, { afloat = false, startsTurn = false } = {}) {
    const f = this._afloat;
    if (afloat) { this.messages.push(msg); f.push(msg); this._floatFacts.set(msg.id, {}); this._seqOf(msg); return msg; }
    if (f.length && this._opensTurn(msg)) {
      const landed = this._landEndedTurn(null, { any: startsTurn });
      // r2 m7: what this opener landed comes back afloat if the wrapper then HOLDS it (a send inside a Stop's window)
      if (landed.length) this._openedBy = { id: msg.id, landed };
    }
    if (!f.length) { this.messages.push(msg); return msg; }
    // r2 F3: a card placed ABOVE the block belongs to the running turn — never to the unread message's turn (the send ran
    // turnIndex++; a card made before the next turn starts would carry the message's index, and turnMap would open the
    // message's turn at that card: the person's message gone from the minimap / TOC)
    if (f.some((x) => x.turnIndex === msg.turnIndex)) { const prev = this.messages[this.messages.length - f.length - 1]; if (prev) msg.turnIndex = prev.turnIndex; }
    this.messages.splice(this.messages.length - f.length, 0, msg);
    for (const x of f) { const st = this._floatFacts.get(x.id); if (st && st.ride && !st.rideBefore) st.rideBefore = msg.id; }
    return msg;
  }
  /** Does this card open the next turn — the agent's own record (an assistant or tool card: the request that carried what
   *  was afloat was answered), or a message that starts a turn (the person's, a peer's, a notice)? Never the CLI's
   *  interrupt marker, a note, a picture attachment or a VibeSpace card (system). */
  _opensTurn(msg) {
    if (!msg) return false;
    if (msg.role === 'assistant' || msg.role === 'tool') return true;
    if (msg.role !== 'user') return false;
    const why = personRow(msg).why;
    return why !== 'interrupt' && why !== 'note' && why !== 'attachment';
  }
  /** The next turn opened: every afloat message an ENDED turn left (kept, removed, or one whose fate was never said) takes
   *  its place now, in order — never one still held in the queue (its own delivery says where it goes). */
  _landEndedTurn(except, { any = false } = {}) {
    const landed = [];
    for (const x of this._afloat.slice()) {
      if (x === except || x.queueState === 'queued') continue;
      const st = this._floatFacts.get(x.id);
      if (st && (st.ended || any) && this._landFloat(x)) landed.push(x);
    }
    return landed;
  }
  /** A message's fate put it in the conversation: it leaves the afloat block — where it rode a tool result when records came
   *  after that (a Stop's), else right above the messages still afloat. `opens` = it opens a turn of its own (it ran as
   *  one): what the ended turn left lands first. `ride` = its fate says the agent READ it (steered): only then do its ride
   *  facts place it (r2 M1: a frame that rode a tool result and was then named KEPT — the CLI still held it — never goes
   *  back above the stop's rows). → was it afloat */
  _landFloat(msg, { opens = false, ride: read = false } = {}) {
    if (!msg || !this._afloat.includes(msg)) return false;
    if (opens) this._landEndedTurn(msg);
    const f = this._afloat;
    f.splice(f.indexOf(msg), 1);
    const st = this._floatFacts.get(msg.id) || {};
    this._floatFacts.delete(msg.id);
    this._landedFloats.add(msg.id);
    const ride = read && st.rideBefore && this.messageIndex.has(st.rideBefore) && !f.some((x) => x.id === st.rideBefore) ? st.rideBefore : null;
    this._moveBefore(msg, ride || (f.length ? f[0].id : null));
    return true;
  }
  /** A chip state says the message is not read (yet): it joins the afloat block, below every card drawn since. Never a
   *  message that already took its place. */
  _floatMsg(msg) {
    if (!msg || this._afloat.includes(msg) || this._landedFloats.has(msg.id) || !this.messageIndex.has(msg.id)) return;
    // r2 m7: this message opened the next turn when it was drawn and landed what the ended turn left — the wrapper now says
    // it HOLDS it (a send inside a Stop's window), so no turn opened: those come back afloat, ahead of it, in order
    const back = this._openedBy && this._openedBy.id === msg.id ? this._openedBy.landed.filter((x) => this.messageIndex.has(x.id) && !this._afloat.includes(x)) : [];
    this._openedBy = null;
    // r3 m12: each goes back to ITS place in the block — the order sent (`_floatSeq`), never behind a message sent after it.
    // r4: NO OP when they already stand there — the block they make with the messages afloat, in the order sent, is the
    // list's tail as it is; else they go in from the NEWEST down (the newest to the end first), so a message already
    // above its place is never moved away and back (r3 sent a cancelling pair for every send held inside a Stop's window)
    const coming = [...back, msg];
    for (const x of coming) { this._landedFloats.delete(x.id); this._seqOf(x); this._floatFacts.set(x.id, x === msg ? {} : { ended: true }); }
    const block = [...this._afloat, ...coming].sort((a, b) => this._floatSeq.get(a.id) - this._floatSeq.get(b.id));
    if (block.every((x, i) => this.messages[this.messages.length - block.length + i] === x)) { this._afloat = block; return; }
    for (const x of coming.sort((a, b) => this._floatSeq.get(b.id) - this._floatSeq.get(a.id))) this._insertFloat(x);
  }
  /** The order a message first went afloat — given once, kept for a message that lands and comes back (r3 m12). */
  _seqOf(msg) {
    if (!this._floatSeq.has(msg.id)) { this._floatSeq.set(msg.id, ++this._floatSeqN); if (this._floatSeq.size > 512) this._floatSeq.delete(this._floatSeq.keys().next().value); }
    return this._floatSeq.get(msg.id);
  }
  /** Put a message into the afloat block at its place by the order sent: before the first afloat message sent after it
   *  (moved there — no op when it already stands there), else at the end. */
  _insertFloat(msg) {
    const seq = this._seqOf(msg);
    const after = this._afloat.find((y) => (this._floatSeq.get(y.id) || 0) > seq) || null;
    this._moveBefore(msg, after ? after.id : null);
    this._afloat.splice(after ? this._afloat.indexOf(after) : this._afloat.length, 0, msg);
  }
  /** THE ONE READER of a chip state's place (src/queue-chips.js `placeOf`): 'here' lands it (no state = it ran: a turn of
   *  its own opens with it), 'tail' / 'next-turn' keep it afloat. */
  _placeByChip(msg, state) {
    if (!msg) return;
    if (placeOf(state) === 'here') this._landFloat(msg, { opens: !state, ride: state === 'steered' });
    else this._floatMsg(msg);
  }
  /** A turn ended (its result): what is afloat now waits for the NEXT turn's first card at the latest. */
  _noteTurnEnded() { for (const st of this._floatFacts.values()) st.ended = true; }
  /** A tool result reached the CLI: a handed message rides the request built after it — read there unless a Stop says else. */
  _noteRide() {
    for (const x of this._afloat) {
      const st = this._floatFacts.get(x.id);
      if (st && x.queueState === 'handed') { st.ride = true; st.rideBefore = null; }
    }
  }
  /** Move a card before `beforeId` (null = the end) — said as ONE `move` op on a live feed: `from` = its index before the
   *  move, `to` = after it (the client moves it in place, shifts its window or re-reads — src/lib/chat-view.js). */
  _moveBefore(msg, beforeId) {
    const a = this._indexNearEnd(msg);
    if (a < 0) return;
    if ((a + 1 < this.messages.length ? this.messages[a + 1].id : null) === (beforeId || null)) return;
    this.messages.splice(a, 1);
    const b = beforeId ? this._indexNearEnd(this.messageIndex.get(beforeId)) : -1;
    if (b >= 0) this.messages.splice(b, 0, msg); else this.messages.push(msg);
    if (this._live) this._emit({ op: 'move', id: msg.id, before: b >= 0 ? beforeId : null, from: a, to: b >= 0 ? b : this.messages.length - 1, message: msg });
  }
  _indexNearEnd(msg) {
    if (!msg) return -1;
    for (let i = this.messages.length - 1; i >= 0; i--) if (this.messages[i] === msg) return i;
    return -1;
  }
  /** The last card placed — never an afloat message (a streaming text card is edited where it is). */
  _lastPlaced() { return this.messages[this.messages.length - 1 - this._afloat.length]; }
  /** Diagnostics / suites: the ids afloat now, in order. */
  afloatIds() { return this._afloat.map((m) => m.id); }

  /** ONE record into cards — `emit` = live (ops to listeners) vs a rebuild.
   *  Every normalizer declares its own (the record shapes are its business). */
  _feedRecord(record, emit) { throw new Error('a normalizer must declare _feedRecord (how a record becomes cards)'); }
  /** What a history rebuild closes after its last record (trailing streams). */
  _finishHistory() { this._finalizeStreaming(false); }
  _finalizeStreaming(emit) { }
  /** The console tag a skipped history record is logged under. */
  get _logTag() { return 'normalizer'; }

  /**
   * TIME-SLICED rebuild (2.369.16, userW inc-mtndq0vb): identical result to
   * convertHistory, but yields to the event loop every ~budgetMs so the
   * first attach of a multi-MB transcript no longer blocks the server.
   * Callers MUST hold live records back (session._rebuildQueue) while this
   * runs and replay them after. Per-record isolation: one bad record is
   * skipped, never the whole rebuild. `beforeRecord` (2026-09-27): the
   * browser-session cards interleave by time (normalizers.convertWithCards).
   */
  async convertHistoryAsync(records, { budgetMs = 25, onSlice, beforeRecord } = {}) {
    let sliceStart = Date.now(), done = 0;
    const wasLive = this._live;
    this._live = false; // a history conversion says no op (a move included)
    try { for (const record of records || []) {
      if (beforeRecord) { try { beforeRecord(record); } catch { } }
      try { this._feedRecord(record, false); }
      catch (e) { console.error(`[${this._logTag}] record skipped during history rebuild:`, e.message); }
      done++;
      if (Date.now() - sliceStart >= budgetMs) {
        try { onSlice?.(done); } catch { }
        await new Promise((r) => setImmediate(r));
        sliceStart = Date.now();
      }
    } } finally { this._live = wasLive; }
    this._finishHistory();
    return this.messages;
  }

  /** Process a single live record. Emits create/edit ops via listeners. */
  processLive(record) { this._feedRecord(record, true); }

  /** The queue chip on the bubble a queued message belongs to — false when there is no such bubble. A harness whose
   *  normalizer keeps the chip (codex / acp) overrides this; the base stamps nothing. */
  _stampQueueChip() { return false; }

  /** STOP PUT THE DROPPED QUEUE BACK (lane stop-refills-composer — src/queue-putback.js): ONE implementation for every
   *  harness. The wrapper's `queue_dropped` record (any of its envelopes — the subclass hands the raw record, the ONE
   *  extractor validates it) marks each put-back row's bubble 'removed' (already so on codex/acp from the per-item
   *  results — idempotent; it is what marks acp/agy's undispatched active prompt, whose chip had cleared when the drain
   *  shifted it) — or 'stopped' for a row that had started and was stopped (`started`, codex; it reached the agent, so
   *  'Removed' would be false — lane codex-interrupted-putback) — and, live only, emits ONE meta op the client turns
   *  into the toast. The draft itself is written by the
   *  server's door at the feedLive gate, never here; a history convert emits nothing. */
  _processQueueDropped(record, emit) {
    const d = queueDroppedOf(record);
    if (!d) return;
    for (const it of d.items) this._stampQueueChip(it.msgId, it.started ? 'stopped' : 'removed', emit);
    // claude (lane claude-steer-inject r2): the handed frames' chips come from THIS record — read, or kept by the CLI
    for (const id of d.landedIds || []) this._stampQueueChip(id, 'steered', emit);
    for (const id of d.keptIds || []) this._stampQueueChip(id, 'kept', emit);
    // ONE toast per Stop: the same record fed twice (the door's own idempotency key, bounded) says nothing new
    const seen = this._putbackToasted || (this._putbackToasted = []);
    if (seen.includes(d.dropId)) return;
    seen.push(d.dropId); if (seen.length > 32) seen.shift();
    const facts = putbackNotice(d);
    if (emit && (facts.n || facts.images || facts.others || facts.cut || facts.omitted || facts.kept || facts.landed)) this._emit({ op: 'meta', subtype: 'queue-putback', dropId: d.dropId, ...facts }); // nothing to say ⇒ no toast (started ⊆ n)
  }

  // Session-state reads the attach payload asks every normalizer for; a
  // normalizer that never publishes one answers the empty value.
  goalState() { return this._goalState || null; }
  queueState() { return this._queue || []; }
  queuePublished() { return !!this._queuePublished; }
  queueVerbsPublished() { return this._queueVerbs || null; }
}

module.exports = { MessageWindow };
