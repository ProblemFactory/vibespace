/**
 * UserTodoManager — the GLOBAL user-facing TODO list.
 *
 * Items are things an AGENT decided need the USER (a decision, missing input,
 * something to review) — the opposite direction of the agent's own TodoWrite
 * list. Each item belongs to one session (the user's "task"/活儿); the taskbar
 * panel merges every session's open items into one inbox and lets the user
 * jump to the owning session to handle it.
 *
 * Writers:
 * - The AGENT files/(un)resolves items via `vibespace-ask` (per-session vsst_
 *   token → POST /api/agent/user-todo, scoped to its own session).
 * - The USER resolves/dismisses/reopens from the panel (cookie-authed route).
 * - SERVER producers (spend guard, login watch, pool, jobs, channels, browser)
 *   file with their own keys. Every writer NAMES ITSELF: `origin` (B-328d) is a
 *   closed set of producers (src/inbox-origin.js) the Notices area groups by,
 *   declared at the add() call (test-user-todos-layout ⑪ is the census).
 *
 * Follows the SessionStatusManager persistence pattern: memory + broadcast are
 * synchronous, disk (data/user-todos.json) is debounced + content-compared,
 * flushed on exit. Keys are sessionKeys (backend:backendSessionId, or
 * webui:<serverId> before the id exists — re-keyed once known).
 */

const fs = require('fs');
const path = require('path');
const { timedSync } = require('./timed-sync.js'); // PURE: the store-write clock (design 011 lane 1, store-timing)
const crypto = require('crypto');
const { normalizeOptions, REPLY_MAX } = require('./inbox-reply.js'); // PURE: the option-chip rule the route, the CLI and the panel share (design-user-inbox-reply D3a)
const { normalizeOrigin } = require('./inbox-origin.js'); // PURE: the closed set of PRODUCERS an item names (B-328d) — the Notices area groups by it; a filing that names none is REFUSED (r2)
const { applyClear } = require('./record-clear.js'); // PURE: "Clear content…" (2026-09-28) — what a clear replaces; this store holds the door (clearItems)

/** `{text:{key,params}, detail?:[{key,params}…], source?:{key}}` → the same,
 *  clamped, or null; a shape that is not that throws by name. Params are
 *  strings/numbers only (they are interpolated into a sentence, never HTML). */
function normalizeI18n(x) {
  if (x == null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) throw new Error('i18n must be an object');
  const line = (l, what) => {
    if (!l || typeof l !== 'object' || typeof l.key !== 'string' || !l.key.trim()) throw new Error(`i18n.${what} needs a key`);
    const out = { key: l.key.slice(0, 400) };
    if (l.params != null) {
      if (typeof l.params !== 'object' || Array.isArray(l.params)) throw new Error(`i18n.${what}.params must be an object`);
      out.params = {};
      for (const [k, v] of Object.entries(l.params)) { if (typeof v === 'string') out.params[k] = v.slice(0, 600); else if (typeof v === 'number' && Number.isFinite(v)) out.params[k] = v; }
    }
    return out;
  };
  const out = { text: line(x.text, 'text') };
  if (x.detail != null) {
    if (!Array.isArray(x.detail)) throw new Error('i18n.detail must be an array of lines');
    out.detail = x.detail.slice(0, 12).map((l, i) => line(l, `detail[${i}]`));
  }
  if (x.source != null) out.source = { key: line(x.source, 'source').key };
  return out;
}

/** A producer's ACTION PAYLOAD (design-reset-credits §5, 2026-09-22): what the
 *  inbox button does when the user decides — `{type, …flat facts}`. Validated
 *  here like `i18n`: a kebab-case `type`, at most 12 flat fields of
 *  strings (≤ 200 chars) / finite numbers / booleans / null — never HTML,
 *  never a nested object (the CLIENT maps `type` to a verb it already owns;
 *  the payload only names WHICH session/account, never HOW). null = none. */
function normalizeAction(x) {
  if (x == null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) throw new Error('action must be an object');
  if (typeof x.type !== 'string' || !/^[a-z][a-z0-9-]{0,40}$/.test(x.type)) throw new Error('action.type must be a kebab-case name');
  const out = { type: x.type };
  let n = 0;
  for (const [k, v] of Object.entries(x)) {
    if (k === 'type') continue;
    if (++n > 12) throw new Error('action has too many fields (max 12)');
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(k)) throw new Error(`action.${k}: not a plain field name`);
    if (v === null || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error(`action.${k} must be finite`); out[k] = v; }
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
    else throw new Error(`action.${k} must be a string, number, boolean or null`);
  }
  return out;
}

// verify-r5 X1 (lane-pairing): the field that makes each of a producer's QUESTIONS its own item — a re-file matches an
// item carrying an `action` only when it carries the same action type AND the same identity (an agent's filing, which
// never carries an action, never merges into one). exit-proxy's asks: one item per ask (each is a different command;
// a reopened item answered the NEXT ask under the user's pointer). helper-ask is NOT here on purpose: a helper's
// parallel asks of one text SHARE one item by design (helper-asks.js re-points it — test-helper-ask ⑩)
/** A producer's CARD (design 009 §4, Layer 0 apps: an install proposal's view): the plain DATA a client draws the item
 *  from — structure, never words (the client words it with its own t()) and never markup. Validated like `action`:
 *  plain keys, strings ≤ 2 000 chars, finite numbers, booleans, null, arrays ≤ 64, depth ≤ 4, ≤ 24 KB as JSON; a value
 *  inside those bounds is kept EXACTLY (the card's Install sends a digest of what the client drew — src/app-card.js).
 *  A shape outside them THROWS by name. null = none. */
function normalizeCard(x) {
  if (x == null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) throw new Error('card must be an object');
  const walk = (v, depth, at) => {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error(`${at} must be finite`); return v; }
    if (typeof v === 'string') { if (v.length > 2000) throw new Error(`${at} is longer than 2000 characters`); return v; }
    if (depth >= 4) throw new Error(`${at} is nested too deep (max 4)`);
    if (Array.isArray(v)) { if (v.length > 64) throw new Error(`${at} has more than 64 entries`); return v.map((y, k) => walk(y, depth + 1, `${at}[${k}]`)); }
    if (typeof v !== 'object') throw new Error(`${at} must be plain data`);
    const out = {};
    let n = 0;
    for (const [k, y] of Object.entries(v)) {
      if (y === undefined) continue;
      if (++n > 32) throw new Error(`${at} has too many fields (max 32)`);
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(k)) throw new Error(`${at}.${k}: not a plain field name`);
      out[k] = walk(y, depth + 1, `${at}.${k}`);
    }
    return out;
  };
  const out = walk(x, 0, 'card');
  if (JSON.stringify(out).length > 24000) throw new Error('card is larger than 24 KB');
  return out;
}

const ACTION_IDENTITY = Object.freeze({ 'exit-run-ask': 'askId', 'browser-proposal': 'id', 'app-install': 'id', 'open-channel': 'key' }); // lane browser-propose: one item per proposal (each is a different switch); Layer 0 apps (verify-r1 F2): one item per app proposal — another proposal of the same words never re-points this one's Install; channel-names verify r1 F2: one item per CONVERSATION (two rooms of one name merged — the click opened the last filer's, deciding one retracted both)
const URGENCIES = ['low', 'normal', 'high', 'urgent'];
const KINDS = ['action', 'notice']; // 2.369.118: action = needs the user (default); notice = for their information (own section, grey count)
const STATUSES = ['open', 'done', 'dismissed'];
// THE SIZE OF AN ITEM (2026-09-27, the For-you window's verify round — the owner's
// complaint IS long agent messages, and the window reads them whole): a question up
// to TEXT_MAX chars, its detail up to DETAIL_MAX. add() cuts past them and SAYS SO
// on the record it RETURNS (`textCut` / `detailCut` = the cap it hit — never stored)
// so `vibespace-ask` can name the cut instead of dropping 3 000 characters silently
// (measured: a 5 000-char --detail printed "added" and kept 2 000). The snapshot every
// client receives (the broadcast and GET /api/user-todos) carries an OPEN item whole
// and a RESOLVED one as a DETAIL_PREVIEW-char preview + `detailTruncated: true`
// (previewOf), so history never grows the payload (250 resolved × 8 000 would be
// 2 MB per broadcast); GET /api/user-todos/:id serves one record whole.
const TEXT_MAX = 500;
const DETAIL_MAX = 8000;
const DETAIL_PREVIEW = 300;
/** A RESOLVED item as the snapshot carries it: a detail past DETAIL_PREVIEW becomes its
 *  first DETAIL_PREVIEW chars + `detailTruncated: true`; anything shorter (or no detail)
 *  is the record itself. Never mutates the stored item. */
function previewOf(item) {
  // a resolved CARD rides as its face only (its Details are history — GET /api/user-todos/:id has them whole)
  const card = item && item.card && item.card.details ? { ...item.card, details: null } : null;
  if (!item || typeof item.detail !== 'string' || item.detail.length <= DETAIL_PREVIEW) return card ? { ...item, card } : item;
  return { ...item, detail: item.detail.slice(0, DETAIL_PREVIEW), detailTruncated: true, ...(card ? { card } : {}) };
}
const MAX_OPEN_PER_SESSION = 20; // an agent looping on add must not flood the inbox
const MAX_ITEMS = 1000;          // total ledger cap — oldest RESOLVED pruned first
const RESOLVED_TAIL = 15;                    // the snapshot's resolved tail: always the newest 15…
const RESOLVED_RECENT_MS = 60 * 60 * 1000;   // …plus every item resolved within the last hour (an open popup's in-place rows, chunk 4)…
const RESOLVED_SNAPSHOT_MAX = 250;           // …never more than this (one resolve-many is ≤ 200 ids)
const EXPIRY_SWEEP_MS = 5 * 60 * 1000; // 2.369.152: how often an open item whose `expiresAt` passed is resolved 'expired'

/** An `expiresAt` a producer may stamp: a finite ms epoch in the FUTURE, else
 *  null (ignored — a past or garbage instant must never make an item die on
 *  arrival, nor throw a producer's filing away). */
function validExpiry(x, now = Date.now()) {
  const n = typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) && n > now ? n : null;
}

class UserTodoManager {
  /** @param expirySweepMs how often expireDue() runs (0 = never on a timer —
   *  a migration or a suite that builds a private manager must not leave one) */
  constructor({ dataDir, onChange, expirySweepMs = EXPIRY_SWEEP_MS, onWriteError = null }) {
    this._file = path.join(dataDir, 'user-todos.json');
    this._onChange = onChange || (() => {});
    this._onWriteError = typeof onWriteError === 'function' ? onWriteError : null; // lane-dead-bridge: session-status's twin — a failed background write is named, never a crash
    this._writeFailures = 0;
    this._statusListeners = []; // onStatus(fn): an item LEAVING 'open' by any door (verify-r2 ask-b), and (verify-r6 W2) a reopen
    this._state = { items: [] };
    this._writeTimer = null; this._dirty = false; this._lastWritten = null;
    try {
      const parsed = timedSync('user-todos.read', () => JSON.parse(fs.readFileSync(this._file, 'utf-8')));
      if (parsed && Array.isArray(parsed.items)) this._state = parsed;
      this._lastWritten = JSON.stringify(this._state, null, 2);
    } catch { /* fresh */ }
    // EXPIRY (2.369.152, "SPEND NOTICES LIVED FOREVER AS ACTIONS"): a notice
    // about a WINDOW (this hour's / today's unattended-turn budget, a 6 h
    // refusal) carries the window's end as `expiresAt` and dies with it. The
    // store owns the clock: once after load (an item that expired while the
    // server was down goes at boot, not 5 min later) and on an unref'd
    // interval — the store's OWN timer, because server.js has no shared sweep
    // cadence other stores hook into (each keeper runs its own).
    this._expiryTimer = null;
    this.expireDue();
    if (expirySweepMs > 0) {
      this._expiryTimer = setInterval(() => { try { this.expireDue(); } catch { } }, expirySweepMs);
      if (this._expiryTimer.unref) this._expiryTimer.unref();
    }
  }

  /** The manager's last act (suites, a migration's private manager): the
   *  expiry timer cleared AND a pending debounced write flushed NOW (r2: the
   *  500 ms write timer outlived stop() and fired into a data dir its owner had
   *  already removed — ENOENT from a timer nobody could catch). */
  stop() {
    if (this._expiryTimer) { clearInterval(this._expiryTimer); this._expiryTimer = null; }
    this.flush();
  }

  /** THE ITEM'S END IS ONE EVENT (verify-r2 ask-b, lane-pairing): a producer whose item STANDS FOR a pending
   *  question of its own (the exit's "ask me each time") subscribes here and settles its side the moment the item
   *  leaves 'open' by ANY door — the ✓ on the row, "Mark all seen", a reply, the agent's own `vibespace-ask done`,
   *  the expiry sweep. Before: the item was done while the ask kept waiting its 60 s, and the ask id could still be
   *  ALLOWED afterwards — two states for one question. `fn(item, {status, by})`, called after the save + broadcast;
   *  a throwing listener is contained. Returns an unsubscribe. */
  onStatus(fn) { if (typeof fn === 'function') this._statusListeners.push(fn); return () => { this._statusListeners = this._statusListeners.filter((f) => f !== fn); }; }
  _emitStatus(items, by) {
    if (!this._statusListeners.length) return;
    for (const it of items) for (const fn of this._statusListeners) { try { fn(it, { status: it.status, by }); } catch { } }
  }

  /** Resolve every OPEN item whose `expiresAt` has passed — `resolvedBy:
   *  'expired'`, status 'done', the record kept (the ledger is history). An
   *  item WITHOUT `expiresAt` is never touched: expiry is a producer's
   *  declaration, never inferred from age or text. ONE save + ONE broadcast
   *  per sweep however many items went. @returns the count resolved */
  expireDue(now = Date.now()) {
    let n = 0;
    const went = [];
    for (const it of this._state.items) {
      if (it.status !== 'open') continue;
      if (!(typeof it.expiresAt === 'number' && Number.isFinite(it.expiresAt)) || it.expiresAt > now) continue;
      it.status = 'done'; it.resolvedAt = now; it.resolvedBy = 'expired';
      n++; went.push(it);
    }
    if (n) { this._save(); this._notify(); this._emitStatus(went, 'expired'); }
    return n;
  }

  /** THE store's door for a one-shot reshaping (src/server/migrations.js):
   *  `fn(item, now)` mutates an item in place and returns true when it did.
   *  The migration goes through the LIVE manager because it runs long after
   *  server.js built it — a second writer on data/user-todos.json would be
   *  overwritten by this manager's next save. ONE save + ONE broadcast.
   *  @returns the number of items `fn` changed */
  reshapeItems(fn, now = Date.now()) {
    let n = 0;
    for (const it of this._state.items) { if (fn(it, now)) n++; }
    if (n) { this._save(); this._notify(); }
    return n;
  }

  _save() {
    // Prune: drop oldest resolved items past the cap (open items never pruned).
    if (this._state.items.length > MAX_ITEMS) {
      const resolved = this._state.items.filter((i) => i.status !== 'open')
        .sort((a, b) => (a.resolvedAt || a.createdAt || 0) - (b.resolvedAt || b.createdAt || 0));
      const drop = new Set(resolved.slice(0, this._state.items.length - MAX_ITEMS).map((i) => i.id));
      if (drop.size) this._state.items = this._state.items.filter((i) => !drop.has(i.id));
    }
    this._dirty = true;
    if (!this._writeTimer) this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flushFromTimer(); }, 500);
  }

  // THE DEBOUNCED WRITE MAY NOT THROW — the twin of session-status.js's
  // (lane-dead-bridge: that one's bare writeFileSync met a relayed EMFILE at
  // 12:03:17 and killed the server). Dirty kept, backoff retry, reported.
  _flushFromTimer() {
    try { this._flush(); this._writeFailures = 0; }
    catch (e) {
      this._writeFailures++;
      this._dirty = true;
      const retryMs = Math.min(60000, 1000 * 2 ** Math.min(6, this._writeFailures - 1));
      if (!this._writeTimer) { this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flushFromTimer(); }, retryMs); this._writeTimer.unref?.(); }
      try { this._onWriteError?.(e, this._file + '.tmp', { failures: this._writeFailures, retryMs }); } catch { }
    }
  }

  _flush() {
    if (!this._dirty) return;
    const json = JSON.stringify(this._state, null, 2);
    if (json === this._lastWritten) { this._dirty = false; return; }
    const tmp = this._file + '.tmp';
    timedSync('user-todos.write', () => { fs.writeFileSync(tmp, json); fs.renameSync(tmp, this._file); });
    this._lastWritten = json;
    this._dirty = false;
  }

  flush() { if (this._writeTimer) { clearTimeout(this._writeTimer); this._writeTimer = null; } this._flush(); }

  _notify() { try { this._onChange(this.snapshot()); } catch { } }

  // Everything the UI needs: open items + a short tail of recently-resolved
  // ones (shown dimmed for context). Sorted urgent-first, then DECISIONS
  // first (an item with option chips is answerable in one click — design-user-
  // inbox-reply D3f, every client agrees because the store sorts), then newest.
  snapshot() {
    const rank = (u) => URGENCIES.indexOf(u || 'normal');
    const hasOpts = (i) => (Array.isArray(i.options) && i.options.length ? 1 : 0);
    const open = this._state.items.filter((i) => i.status === 'open')
      .sort((a, b) => (rank(b.urgency) - rank(a.urgency)) || (hasOpts(b) - hasOpts(a)) || (b.createdAt - a.createdAt));
    // The resolved tail: the newest 15 (the popup's "Recently resolved" shows 6)
    // PLUS everything resolved in the last hour, ≤ 250 (chunk 4): an OPEN popup
    // keeps a row resolved while it was open in its slot only while the row is
    // still in the snapshot (nextLayout drops ids the store no longer lists) —
    // with a flat 15, "Mark all seen" on a 30-ask group made 15 struck rows
    // vanish from under the pointer (test-inbox-reply-ui ⑮ caught it).
    const now = Date.now();
    const resolved = this._state.items.filter((i) => i.status !== 'open')
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0))
      .filter((i, k) => k < RESOLVED_TAIL || (now - (i.resolvedAt || 0)) < RESOLVED_RECENT_MS)
      .slice(0, RESOLVED_SNAPSHOT_MAX);
    // a resolved item's detail rides as a PREVIEW (previewOf): the tail is history, and
    // 250 × 8 000 chars per broadcast is not a price every client pays for it
    return { open, resolved: resolved.map(previewOf) };
  }

  forSession(keys) {
    const set = new Set(Array.isArray(keys) ? keys : [keys]);
    return this._state.items.filter((i) => set.has(i.sessionKey) && i.status === 'open');
  }

  get(id) { return this._state.items.find((i) => i.id === id) || null; }

  add(sessionKey, { text, detail, urgency, by = 'agent', sessionName = null, jobId = null, kind = null, i18n = null, expiresAt = null, action = null, options = null, origin = null, card = null } = {}) {
    const rawText = typeof text === 'string' ? text.trim() : '';
    text = rawText.slice(0, TEXT_MAX);
    const textCut = rawText.length > TEXT_MAX ? TEXT_MAX : 0; // the cap it hit, named on the return
    // EXPIRY (2.369.152): optional; only a future ms epoch counts (validExpiry)
    expiresAt = validExpiry(expiresAt);
    if (!text) throw new Error('text required');
    // WORDS AS STRUCTURE (a3 i18n, 2026-09-21): a server-side producer may
    // file, beside its English `text`/`detail` (the dedupe key and the agent
    // CLI's contract, unchanged), the same sentences as `{key, params}` the
    // CLIENT words with its own t() — `text`, `detail` LINES and the `source`
    // name — so a zh/ja inbox does not read "Channels: Proposals awaiting
    // approval in …". Validated here; a malformed shape is refused by name.
    i18n = normalizeI18n(i18n);
    action = normalizeAction(action); // a server producer's decision payload (reset credit, §5), or null
    card = normalizeCard(card); // a server producer's view of the item (design 009: an app install's one card), or null
    options = normalizeOptions(options); // option chips (vibespace-ask --options "A|B|C"): ≤6 distinct labels ≤40 chars, else THROWS by name — or null
    // ORIGIN (B-328d, 2026-09-24): WHO filed it — a closed set (src/inbox-origin.js).
    // REQUIRED (r2, fail closed): a caller naming none THROWS `origin required
    // (one of …)` and a value outside the set THROWS by name — either files
    // nothing. There is no default: the old `agent` default let a producer the
    // census could not see (an aliased store, `?.add`) file under Agents with
    // nothing red anywhere. Every caller declares at the call — the agent route
    // `agent`, each server producer its own, every fixture explicitly
    // (test-user-todos-layout ⑪ is the census beside this throw).
    origin = normalizeOrigin(origin);
    if (urgency != null && !URGENCIES.includes(urgency)) throw new Error(`urgency must be one of ${URGENCIES.join('/')}`);
    // KIND (2.369.118, owner: spend notices are DISTRACTING beside real asks):
    // 'action' = the user must do something (default, every older item);
    // 'notice' = for their information only — its own section in the popup,
    // never in the red badge. A PRODUCER declares it; nothing infers it.
    if (kind != null && !KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join('/')}`);
    const rawDetail = typeof detail === 'string' ? detail.trim() : '';
    detail = rawDetail ? rawDetail.slice(0, DETAIL_MAX) : null;
    const detailCut = rawDetail.length > DETAIL_MAX ? DETAIL_MAX : 0;
    // the cut is named on the RETURNED record only (the ledger never carries it)
    const cut = (o) => (textCut || detailCut ? { ...o, ...(textCut ? { textCut } : {}), ...(detailCut ? { detailCut } : {}) } : o);
    // Idempotent BY TEXT across ALL statuses: re-filing an open question
    // refreshes it; re-filing a RESOLVED/DISMISSED one REOPENS the same item
    // (same id). Minting a fresh id per re-file would let an add→resolve loop
    // (or re-asserting a text the user dismissed) spam every client with
    // "new item" toasts despite the open cap — a stable id keeps re-assertion
    // possible while making it quiet.
    // (a CLEARED item's text is the one sentence every cleared item shares — never a re-file's match)
    // verify-r5 X1: A PRODUCER'S QUESTION IS NOBODY ELSE'S ITEM. The match was (sessionKey, text) alone, so an agent's
    // `vibespace-ask "<the exit ask's own text>" --detail "echo hello"` MERGED into exit-proxy's "run this command on
    // <machine>?" item and replaced its detail — the command the row and the For-you window show above Allow (r4 F4) —
    // while Allow ran the stored one (reproduced with a real click: the user read `echo hello`, the device ran the
    // payload); and exit-proxy's next ask of the same (conversation, machine) REOPENED the same item with a new askId
    // under the user's pointer (a press aimed at the first command answered the second). An item carrying an `action`
    // is matched only by a re-file of the same action type and the same identity (ACTION_IDENTITY); a filing with no
    // action never merges into one (it is filed beside it, without the producer's buttons)
    const sameFiling = (i) => {
      if (!i.action !== !action) return false;
      if (!action) return true;
      if (i.action.type !== action.type) return false;
      const idKey = ACTION_IDENTITY[action.type];
      return !idKey || i.action[idKey] === action[idKey];
    };
    const existing = this._state.items.find((i) => i.sessionKey === sessionKey && i.text === text && sameFiling(i) && !i.clearedAt);
    const openCount = this._state.items.filter((i) => i.sessionKey === sessionKey && i.status === 'open').length;
    if (existing) {
      let changed = false;
      if (existing.status !== 'open') {
        if (openCount >= MAX_OPEN_PER_SESSION) throw new Error(`this session already has ${openCount} open items — resolve some before adding more`);
        existing.status = 'open'; existing.resolvedAt = null; existing.resolvedBy = null;
        existing.createdAt = Date.now();
        // a re-file of a resolved item is a NEW filing: its own expiry or none
        // (the old one is past — kept, it would expire the item on the next sweep)
        existing.expiresAt = expiresAt;
        existing.reply = null; // a re-filed ask is a NEW question: the last reply answered the old filing
        changed = true;
      } else if (expiresAt && existing.expiresAt != null && expiresAt > existing.expiresAt) {
        // an OPEN item merges to the LATER end; one with no expiresAt is lasting
        // (it never expires) and a re-file never shortens that
        existing.expiresAt = expiresAt; changed = true;
      }
      if (detail && detail !== existing.detail) { existing.detail = detail; changed = true; }
      if (urgency && urgency !== existing.urgency) { existing.urgency = urgency; changed = true; }
      if (kind && kind !== existing.kind) { existing.kind = kind; changed = true; }
      if (i18n && JSON.stringify(i18n) !== JSON.stringify(existing.i18n || null)) { existing.i18n = i18n; changed = true; }
      if (action && JSON.stringify(action) !== JSON.stringify(existing.action || null)) { existing.action = action; changed = true; }
      if (card && JSON.stringify(card) !== JSON.stringify(existing.card || null)) { existing.card = card; changed = true; }
      if (options && JSON.stringify(options) !== JSON.stringify(existing.options || null)) { existing.options = options; changed = true; } // a re-file WITH options replaces them; one without keeps the old set
      // a DECLARED origin is kept (the item's producer does not change on a re-file);
      // an item filed before the field existed takes the re-filer's declaration
      if (!existing.origin) { existing.origin = origin; changed = true; }
      if (changed) { this._save(); this._notify(); }
      return cut({ ...existing, existing: true });
    }
    if (openCount >= MAX_OPEN_PER_SESSION) throw new Error(`this session already has ${openCount} open items — resolve some before adding more`);
    const item = {
      id: 'ut-' + crypto.randomBytes(5).toString('hex'),
      sessionKey, text, detail,
      urgency: urgency || 'normal',
      kind: kind || 'action',
      status: 'open', by,
      sessionName: sessionName || null, // display fallback frozen at file time
      jobId: jobId || null, // Background Work origin (2.348.1): lets the inbox jump STRAIGHT to the job's panel
      i18n, // the words as structure, or null (an agent's own item is its own words)
      action, // what the item's button does ({type, …facts}), or null — a server producer's only
      ...(card ? { card } : {}), // design 009: the producer's VIEW the client draws the item from (an app install's one card)
      expiresAt, // ms epoch the item dies at (resolved 'expired' by expireDue), or null = lasting
      options, // the one-click answers (≤6 labels), or null — a chip's reply IS its label (design-user-inbox-reply D3a)
      reply: null, // {text, at} once the user replied from the inbox (resolveByReply)
      origin, // the PRODUCER (B-328d): spend|login|pool|jobs|channels|browser|agent — REQUIRED (r2), the Notices area groups by it
      createdAt: Date.now(), resolvedAt: null, resolvedBy: null,
    };
    this._state.items.push(item);
    this._save(); this._notify();
    return cut(item);
  }

  /** auto-resolve a job's open inbox items (2.350.0, owner report: "提交过了
   *  怎么不从inbox里消失" — answering an interaction panel must clear its
   *  needs-your-input entry). onlyAsk keeps completion/failure notices intact
   *  unless the whole job is being removed. */
  resolveByJob(jobId, { onlyAsk = true } = {}) {
    if (!jobId) return 0;
    let n = 0;
    const went = [];
    for (const it of this._state.items) {
      if (it.status !== 'open' || it.jobId !== jobId) continue;
      // the ask is told apart by its words — a CLEARED item has none (verify r3: an answered / expired /
      // withdrawn panel must still close the job's cleared ask item, else it stays open with the sentence)
      if (onlyAsk && !it.clearedAt && !/needs your input/.test(it.text)) continue;
      it.status = 'done'; it.resolvedAt = Date.now(); it.resolvedBy = 'agent';
      n++; went.push(it);
    }
    if (n) { this._save(); this._notify(); this._emitStatus(went, 'agent'); }
    return n;
  }

  // status: 'done' (handled) | 'dismissed' (not going to) | 'open' (reopen)
  /** A producer's card moved (design 009: an install proposal's state — installing, done, failed, a new plan): the
   *  item's `card` replaced, nothing else (its status stays the producer's setStatus). A CLEARED item keeps nothing
   *  (Clear content… dropped its card). → true when it changed. */
  setCard(id, card) {
    const it = this.get(id);
    if (!it || it.clearedAt) return false;
    const c = normalizeCard(card);
    if (JSON.stringify(c) === JSON.stringify(it.card || null)) return false;
    if (c) it.card = c; else delete it.card;
    this._save(); this._notify();
    return true;
  }

  setStatus(id, status, by = 'user') {
    if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join('/')}`);
    const item = this._state.items.find((i) => i.id === id);
    if (!item) throw new Error('item not found');
    const wasOpen = item.status === 'open';
    item.status = status;
    // a reopen is the user saying it still matters: it no longer expires
    if (status === 'open') { item.resolvedAt = null; item.resolvedBy = null; item.expiresAt = null; }
    else { item.resolvedAt = Date.now(); item.resolvedBy = by; }
    this._save(); this._notify();
    if (wasOpen && status !== 'open') this._emitStatus([item], by);
    // verify-r6 W2: a REOPEN is said too — a producer whose question is over (an exit ask answered / expired) closes it
    // again at once instead of leaving dead buttons open until the next boot
    else if (!wasOpen && status === 'open') this._emitStatus([item], by);
    return item;
  }

  /** THE BATCH of setStatus (design-user-inbox-reply §4 d, chunk 4: "Mark all
   *  seen" on a group head — POST /api/user-todos/resolve-many). Every KNOWN id
   *  gets `status` with setStatus's exact semantics (an already-resolved one is
   *  re-stamped: a done item becomes dismissed); an unknown id is reported BY ID,
   *  never a throw — the rest of the batch still applies. ONE save + ONE
   *  broadcast for the whole batch (N setStatus calls would push N snapshots to
   *  every client). An invalid status throws by name before anything changes.
   *  @returns {{changed: string[], unknown: string[]}} */
  setStatusMany(ids, status, by = 'user') {
    if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join('/')}`);
    const changed = [], unknown = [], went = [];
    const now = Date.now();
    for (const id of new Set(Array.isArray(ids) ? ids : [])) {
      const item = this._state.items.find((i) => i.id === id);
      if (!item) { unknown.push(id); continue; }
      const wasOpen = item.status === 'open';
      item.status = status;
      if (status === 'open') { item.resolvedAt = null; item.resolvedBy = null; item.expiresAt = null; }
      else { item.resolvedAt = now; item.resolvedBy = by; }
      changed.push(id);
      if (wasOpen && status !== 'open') went.push(item);
    }
    if (changed.length) { this._save(); this._notify(); this._emitStatus(went, by); }
    return { changed, unknown };
  }

  /** The user REPLIED to this item from the inbox and the reply reached the
   *  session (src/routes/user-todos-reply.js calls this only after the send
   *  succeeded). An OPEN item becomes done with `resolvedBy:'reply'`; an item
   *  already resolved or dismissed keeps its status and `resolvedBy` (a reply
   *  is refused for delivery reasons only, never bookkeeping) — either way the
   *  reply is kept on it as `{text ≤4000, at}`. ONE save + ONE broadcast. */
  resolveByReply(id, text, now = Date.now()) {
    const item = this._state.items.find((i) => i.id === id);
    if (!item) throw new Error('item not found');
    item.reply = { text: String(text == null ? '' : text).slice(0, REPLY_MAX), at: now };
    const wasOpen = item.status === 'open';
    if (wasOpen) { item.status = 'done'; item.resolvedAt = now; item.resolvedBy = 'reply'; }
    this._save(); this._notify();
    if (wasOpen) this._emitStatus([item], 'reply');
    return item;
  }

  /** One item of the caller's OWN session, whatever its status (`vibespace-ask
   *  show <id>`: the reply quote cuts a long detail and points here). */
  getForSession(keys, id) {
    const set = new Set(Array.isArray(keys) ? keys : [keys]);
    const it = this._state.items.find((i) => i.id === id);
    return it && set.has(it.sessionKey) ? it : null;
  }

  // Agent-side resolve by id OR unique text substring (its own session only).
  // An id of an item of this session that is ALREADY resolved (the user
  // replied from the inbox, or ticked it) is an idempotent no-op answering
  // the item as it is — the agent was told to resolve on an answer, and the
  // reply WAS the answer.
  resolveByAgent(sessionKey, ref) {
    ref = String(ref || '').trim();
    if (!ref) throw new Error('pass the item id or a unique text fragment');
    const done = this._state.items.find((i) => i.id === ref && i.sessionKey === sessionKey && i.status !== 'open');
    if (done) return done;
    const mine = this._state.items.filter((i) => i.sessionKey === sessionKey && i.status === 'open');
    let hit = mine.find((i) => i.id === ref);
    // verify-r5 X4 (lane-pairing): an item carrying a producer's `action` is a question VibeSpace put to the USER on the
    // agent's behalf (an exit ask's Allow / Deny) — the agent resolving it settled the ask "denied", and the chat card
    // told the user "you denied it" while the CLI told the agent "the user did not allow" (reproduced). Not the agent's
    // to resolve: by id it is refused by name; a text fragment never matches one
    if (hit && hit.action) throw Object.assign(new Error(`${hit.id} is a question VibeSpace asked the user for you — the user answers it with its own buttons; an agent cannot resolve it (to withdraw it, stop the command that is waiting for the answer)`), { code: 'not_agents' });
    if (!hit) {
      const matches = mine.filter((i) => !i.clearedAt && !i.action && i.text.toLowerCase().includes(ref.toLowerCase())); // a cleared item answers to its id only
      if (matches.length > 1) throw new Error(`"${ref}" matches ${matches.length} open items — be more specific or use the id`);
      hit = matches[0];
    }
    if (!hit) throw new Error(`no open item matching "${ref}" in this session`);
    return this.setStatus(hit.id, 'done', 'agent');
  }

  /**
   * "CLEAR CONTENT…" — THE door for For-you items (2026-09-28). Each id is asked
   * `allow(item)` (the caller's PURE clearVerdict) and cleared IN PLACE through
   * src/record-clear.js applyClear: the title becomes the ONE sentence; the
   * detail, the structured words (`i18n` — a client prefers them over `text`, so
   * keeping them would keep the old words on screen), the option chips and the
   * reply go; a Background-Work item's label (the job's name in `sessionName`)
   * goes too. Status, identity, times, session, origin and a producer's action
   * stay. The resolved PREVIEW is derived per snapshot (previewOf), so the ONE
   * save + ONE broadcast rewrites every client's copy — including a whole
   * detail a client kept (restoreDetails restores only into an item still
   * `detailTruncated`, which a cleared item never is). Returns
   * {cleared: [ids], already: [ids], unknown: [ids], refused: [{id, code, why, status}]}.
   */
  clearItems(ids, { by = 'owner', at = Date.now(), allow = null } = {}) {
    const out = { cleared: [], already: [], unknown: [], refused: [] };
    for (const id of new Set(Array.isArray(ids) ? ids : [ids])) {
      const item = this._state.items.find((i) => i.id === id);
      if (!item) { out.unknown.push(String(id)); continue; }
      const v = allow ? allow(item) : { ok: true };
      if (!v || !v.ok) { out.refused.push({ id: item.id, code: (v && v.code) || 'not_yours', why: (v && v.why) || '', status: (v && v.status) || 403 }); continue; }
      const r = applyClear(item, { kind: 'todo', by, at });
      (r.changed ? out.cleared : out.already).push(item.id);
    }
    // ON DISK BEFORE THE OWNER IS TOLD (lane-redact verify r4, reproduced): this store's `_save` is a 500 ms debounce
    // and the exit flush runs on SIGTERM only — a SIGKILL / OOM inside that window brought the words back at the next
    // boot after the route had answered "cleared" and the dialog had said "cannot be undone". A clear is one owner
    // decision, rare, and small: ONE synchronous write (the stash's own rule, 2026-09-27 verify r3/r5).
    if (out.cleared.length) { this._save(); this.flush(); this._notify(); }
    return out;
  }

  /** The ids of every item `pred` selects (a cleared JOB's items: `jobId` in the set). */
  idsWhere(pred) { return this._state.items.filter((i) => { try { return !!pred(i); } catch { return false; } }).map((i) => i.id); }

  // Move webui:<id> placeholder items onto the real sessionKey once known.
  rekey(fromKey, toKey) {
    if (fromKey === toKey) return;
    let changed = false;
    for (const i of this._state.items) if (i.sessionKey === fromKey) { i.sessionKey = toKey; changed = true; }
    if (changed) { this._save(); this._notify(); }
  }
}

module.exports = { UserTodoManager, USER_TODO_URGENCIES: URGENCIES, EXPIRY_SWEEP_MS, RESOLVED_TAIL, RESOLVED_RECENT_MS, RESOLVED_SNAPSHOT_MAX, TEXT_MAX, DETAIL_MAX, DETAIL_PREVIEW, previewOf, validExpiry, normalizeAction };
