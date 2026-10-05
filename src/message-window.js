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
const { turnPreviewOf, COMPACT_PREVIEW } = require('./assistant-note.js'); // PURE (B-40f8): THE preview of a user turn

const asArray = (v) => (Array.isArray(v) ? v : []);

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
  _emit(op) { for (const fn of this.listeners) fn(op); }

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
    this.messages.push(msg);
    this.messageIndex.set(msg.id, msg);
    return msg;
  }

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
    for (const record of records || []) {
      if (beforeRecord) { try { beforeRecord(record); } catch { } }
      try { this._feedRecord(record, false); }
      catch (e) { console.error(`[${this._logTag}] record skipped during history rebuild:`, e.message); }
      done++;
      if (Date.now() - sliceStart >= budgetMs) {
        try { onSlice?.(done); } catch { }
        await new Promise((r) => setImmediate(r));
        sliceStart = Date.now();
      }
    }
    this._finishHistory();
    return this.messages;
  }

  /** Process a single live record. Emits create/edit ops via listeners. */
  processLive(record) { this._feedRecord(record, true); }

  // Session-state reads the attach payload asks every normalizer for; a
  // normalizer that never publishes one answers the empty value.
  goalState() { return this._goalState || null; }
  queueState() { return this._queue || []; }
  queuePublished() { return !!this._queuePublished; }
  queueVerbsPublished() { return this._queueVerbs || null; }
}

module.exports = { MessageWindow };
