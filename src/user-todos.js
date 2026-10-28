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
const belt = require('./agent-output-belt.js'); // lane agent-output-sinks: the sink belt — a For-you item's text / detail never carries a credential in the clear
const { applyClear } = require('./record-clear.js'); // PURE: "Clear content…" (2026-09-28) — what a clear replaces; this store holds the door (clearItems)

/** `{text:{key,params}, detail?:[{key,params}…], source?:{key}}` → the same,
 *  clamped, or null; a shape that is not that throws by name. Params are
 *  strings/numbers only (they are interpolated into a sentence, never HTML) —
 *  or WORDS, `{key}` (lane vault-key-row-compact: an i18n key the client says
 *  in its language before it fills the sentence — a verb's own words) — or an
 *  INSTANT, `{at}` (lane owner-press-attended: an epoch the client says in the
 *  VIEWER's zone; a time string the hub rendered is the hub's zone, unnamed). */
function normalizeI18n(x) {
  if (x == null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) throw new Error('i18n must be an object');
  const line = (l, what) => {
    if (!l || typeof l !== 'object' || typeof l.key !== 'string' || !l.key.trim()) throw new Error(`i18n.${what} needs a key`);
    const out = { key: l.key.slice(0, 400) };
    if (l.params != null) {
      if (typeof l.params !== 'object' || Array.isArray(l.params)) throw new Error(`i18n.${what}.params must be an object`);
      out.params = {};
      for (const [k, v] of Object.entries(l.params)) { if (typeof v === 'string') out.params[k] = v.slice(0, 600); else if (typeof v === 'number' && Number.isFinite(v)) out.params[k] = v; else if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.key === 'string' && v.key.trim()) out.params[k] = { key: v.key.slice(0, 400) }; else if (v && typeof v === 'object' && !Array.isArray(v) && Number.isFinite(v.at) && v.at > 0) out.params[k] = { at: v.at }; }
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

/** lane decision-inbox-rank (the LLM plugin's INBOX v2): the board's FACTS of an item as the store keeps them —
 *  {state, dated (≤ 40 characters of the item's own words, a date phrase), due, reasks, askedAt} — or null. Counts,
 *  kinds and times only: what the tray orders by without reading the item's text. */
const FACT_STATES = ['blocked', 'continued', 'finished', 'unknown'];
function normalizeFacts(f) {
  if (!f || typeof f !== 'object' || !FACT_STATES.includes(f.state)) return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { state: f.state, dated: typeof f.dated === 'string' && f.dated ? f.dated.slice(0, 40) : null, due: num(f.due), reasks: Math.max(0, Math.floor(num(f.reasks) || 0)), askedAt: num(f.askedAt) || 0 };
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

// THE DOOR (lane foryou-plugin-notices, owner 2026-10-19 on Dropline's 「建议加入词库」 rows: 「这个部分点击应该要自动跳转」): where a
// click on the item's BODY takes the owner — declared by the producer at filing, validated like `action`:
// `{kind, plugin, panel?, prefill?, done?}`. OPEN_KINDS is the closed set of doors the client owns a verb for
// ('plugin-settings' = the plugin's own sheet, else its settings row — src/lib/plugins-ui.js openPluginDoor); an unknown
// kind THROWS by name. `plugin` = the filing plugin's id (a plugin opens only its own door), `panel` a kebab word naming
// the part of the sheet, `prefill` ≤ 8 flat fields (strings ≤ 200, lists ≤ 32 of strings ≤ 100) the door starts with,
// `done` an English t() key saying what ✓ does (present ⇒ the plugin applies the prefill on the owner's ✓ and the ✓'s
// title says so; absent ⇒ ✓ marks it handled). null = no door (the jump to the item's session, as before).
const OPEN_KINDS = ['plugin-settings'];
const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{0,40}$/;
/** lane chat-needs-you-card: the CONVERSATION an item addresses when its producer files it under its own group key (a
 *  channel watch / access request under 'channels' names the asking agent's conversation) — a sessionKey
 *  (`backend:id` / `webui:id`), or null. The chat of that conversation draws the item as a card (src/foryou-actions.js). */
const ABOUT_RE = /^[a-z][a-z0-9-]{0,40}:[^\s]{1,200}$/;
const normalizeAbout = (x) => (typeof x === 'string' && ABOUT_RE.test(x) ? x : null);
const OPEN_FIELDS = ['kind', 'plugin', 'panel', 'prefill', 'done'];
function normalizeOpen(x, plugin) {
  if (x == null) return null;
  if (typeof x !== 'object' || Array.isArray(x)) throw new Error('open must be an object');
  if (!OPEN_KINDS.includes(x.kind)) throw new Error(`open.kind must be one of ${OPEN_KINDS.join('/')}`);
  for (const k of Object.keys(x)) if (!OPEN_FIELDS.includes(k)) throw new Error(`open.${k}: not a field of a door (${OPEN_FIELDS.join('/')})`);
  if (typeof x.plugin !== 'string' || !PLUGIN_ID_RE.test(x.plugin)) throw new Error('open.plugin must be a plugin id');
  if (x.plugin !== plugin) throw new Error(`open.plugin must be the filing plugin (${plugin || 'none — only a plugin\'s item has a door'})`);
  const out = { kind: x.kind, plugin: x.plugin };
  if (x.panel != null) {
    if (typeof x.panel !== 'string' || !PLUGIN_ID_RE.test(x.panel)) throw new Error('open.panel must be a kebab-case word');
    out.panel = x.panel;
  }
  if (x.prefill != null) {
    if (typeof x.prefill !== 'object' || Array.isArray(x.prefill)) throw new Error('open.prefill must be an object');
    const pf = {};
    let n = 0;
    for (const [k, v] of Object.entries(x.prefill)) {
      if (++n > 8) throw new Error('open.prefill has too many fields (max 8)');
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(k)) throw new Error(`open.prefill.${k}: not a plain field name`);
      if (typeof v === 'string') pf[k] = v.slice(0, 200);
      else if (Array.isArray(v) && v.length <= 32 && v.every((y) => typeof y === 'string')) pf[k] = v.map((y) => y.slice(0, 100));
      else throw new Error(`open.prefill.${k} must be a string or a list of ≤ 32 strings`);
    }
    out.prefill = pf;
  }
  if (x.done != null) {
    if (typeof x.done !== 'string' || !x.done.trim() || x.done.length > 200) throw new Error('open.done must be a sentence key (≤ 200 characters)');
    out.done = x.done;
  }
  return out;
}

// THE MERGE RULE (lane chat-needs-you-card, amendment 1): derived from THE For-you action registry — a row's `identity`
const { ACTION_IDENTITY } = require('./foryou-actions.js');
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
// ARTIFACTS (lane foryou-attachments, owner 2026-10-09): what the agent asks the owner to LOOK AT. The route's submit judge
// proved each one opens (src/server/artifact-registry.js judgeAsk); the store keeps only the SHAPE — ≤ ARTIFACTS_MAX rows
// of {kind: file|design|page, host, path|page, name, url?}; past the cap the rest is cut and the cut is NAMED on the
// returned record (`artifactsCut`, like the text/detail caps); a malformed row THROWS by name.
const ARTIFACTS_MAX = 8;
const ARTIFACT_KINDS = ['file', 'design', 'page'];
function normalizeArtifacts(list) {
  if (list == null) return { artifacts: null, cut: 0 };
  if (!Array.isArray(list)) throw new Error('artifacts must be a list');
  const out = list.slice(0, ARTIFACTS_MAX).map((a, k) => {
    if (!a || !ARTIFACT_KINDS.includes(a.kind)) throw new Error(`artifacts[${k}].kind must be one of ${ARTIFACT_KINDS.join('/')}`);
    const name = typeof a.name === 'string' ? a.name.slice(0, 200) : '';
    if (a.kind === 'page') {
      const page = String(a.page || '');
      if (!/^[\w-]{1,64}$/.test(page)) throw new Error(`artifacts[${k}].page is not a page id`);
      return { kind: 'page', host: '', page, name: name || page, url: '/p/' + page };
    }
    const p = String(a.path || '');
    if (!p.startsWith('/') || p.length > 4096) throw new Error(`artifacts[${k}].path must be an absolute path`);
    const host = typeof a.host === 'string' && a.host !== 'local' ? a.host.slice(0, 120) : '';
    return { kind: a.kind, host, path: p, name: name || p.replace(/\/+$/, '').split('/').pop() || p };
  });
  return { artifacts: out.length ? out : null, cut: list.length > ARTIFACTS_MAX ? ARTIFACTS_MAX : 0 };
}
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
   *  a migration or a suite that builds a private manager must not leave one)
   *  @param now THE store's clock (lane decision-inbox-clock): every stamp and every
   *  "has it passed" below reads `this._now()` — a suite hands the clock its
   *  engine runs on, so a filing's createdAt and the engine's `now` agree at any
   *  wall-clock time (test-decision-inbox's ONE CLOCK census: no other wall-clock read in the class);
   *  the default reads the global per call, so a suite that swaps it still steers the store */
  constructor({ dataDir, onChange, expirySweepMs = EXPIRY_SWEEP_MS, onWriteError = null, now = () => Date.now() }) {
    this._now = now;
    this._file = path.join(dataDir, 'user-todos.json');
    this._onChange = onChange || (() => {});
    this._onWriteError = typeof onWriteError === 'function' ? onWriteError : null; // lane-dead-bridge: session-status's twin — a failed background write is named, never a crash
    this._writeFailures = 0;
    this._statusListeners = []; // onStatus(fn): an item LEAVING 'open' by any door (verify-r2 ask-b), and (verify-r6 W2) a reopen
    this._pluginGate = null; // lane foryou-plugin-notices: setPluginGate(fn) — does plugin <id> declare 'reminders'? (the server's; null = shape rules only)
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
  // lane foryou-plugin-notices: `batch: true` = 「全部标为已看」 (setStatusMany) — a plugin whose ✓ APPLIES something (its
  // door's `done`) acts on ONE ✓ by the owner, never on a whole group marked seen
  _emitStatus(items, by, batch = false) {
    if (!this._statusListeners.length) return;
    for (const it of items) for (const fn of this._statusListeners) { try { fn(it, batch ? { status: it.status, by, batch: true } : { status: it.status, by }); } catch { } }
  }
  /** lane foryou-plugin-notices: THE CAPABILITY GATE of a plugin's reminder — `fn(pluginId)` → true when that plugin declares
   *  'reminders' (src/plugins/<id>.js `provides`; the wiring hands PluginManager's answer in). A filing by a plugin the gate
   *  refuses THROWS by name. */
  setPluginGate(fn) { this._pluginGate = typeof fn === 'function' ? fn : null; }

  /** Resolve every OPEN item whose `expiresAt` has passed — `resolvedBy:
   *  'expired'`, status 'done', the record kept (the ledger is history). An
   *  item WITHOUT `expiresAt` is never touched: expiry is a producer's
   *  declaration, never inferred from age or text. ONE save + ONE broadcast
   *  per sweep however many items went. @returns the count resolved */
  expireDue(now = this._now()) {
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
  reshapeItems(fn, now = this._now()) {
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
    const now = this._now();
    const resolved = this._state.items.filter((i) => i.status !== 'open')
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0))
      .filter((i, k) => k < RESOLVED_TAIL || (now - (i.resolvedAt || 0)) < RESOLVED_RECENT_MS)
      .slice(0, RESOLVED_SNAPSHOT_MAX);
    // a resolved item's detail rides as a PREVIEW (previewOf): the tail is history, and
    // 250 × 8 000 chars per broadcast is not a price every client pays for it
    // lane inbox-decision-group: the LLM plugin's tray sections ride the snapshot ONLY while its switch is on
    // (the engine's `grouping()`), so a switched-off tray receives today's payload byte for byte
    let grouping = null;
    try { grouping = this._grouping ? this._grouping() : null; } catch { grouping = null; }
    if (grouping) return { open, resolved: resolved.map(previewOf), grouping };
    return { open, resolved: resolved.map(previewOf) };
  }

  /** USE ④ (lane inbox-decision-group): the LLM plugin's door. `setGrouping(fn)` — what the snapshot says about the
   *  tray's sections (null = off); `openItems()` — the open items (copies); `setJudged(id, judged)` — writes the judge's
   *  verdict BESIDE an open item (`judged: {group: 'now'|'later'|null, p, at, v}`) and nothing else: the item's
   *  urgency is the agent's declaration and is never written here. → true when it wrote.
   *  lane decision-inbox-rank (INBOX v2): the verdict also keeps `why` (the chosen value), `facts` (normalizeFacts) and
   *  `sig` (what it was made under); `setFacts([[id, facts]…])` — the engine's pass writes each item's current facts
   *  into `judged.facts` (a `{group: null, v: 0}` stand-in before any verdict), only what changed, ONE broadcast. */
  setGrouping(fn) { this._grouping = typeof fn === 'function' ? fn : null; }
  openItems() { return this._state.items.filter((i) => i.status === 'open').map((i) => ({ ...i })); }
  setJudged(id, judged) {
    const it = this.get(id);
    if (!it || it.status !== 'open' || !judged || typeof judged !== 'object') return false;
    const group = judged.group === 'now' || judged.group === 'later' ? judged.group : null;
    const p = typeof judged.p === 'number' && Number.isFinite(judged.p) ? judged.p : null;
    it.judged = { group, p, at: Number(judged.at) || this._now(), v: Number(judged.v) || 1 };
    it.judged.why = typeof judged.why === 'string' && /^[a-z]{1,20}$/.test(judged.why) ? judged.why : null;
    it.judged.facts = normalizeFacts(judged.facts);
    it.judged.sig = typeof judged.sig === 'string' ? judged.sig.slice(0, 200) : null;
    this._save(); this._notify();
    return true;
  }
  setFacts(entries) {
    let changed = false;
    for (const [id, f] of Array.isArray(entries) ? entries : []) {
      const it = this.get(id), facts = normalizeFacts(f);
      if (!it || it.status !== 'open' || !facts) continue;
      const j = it.judged && typeof it.judged === 'object' ? it.judged : null;
      if (j && JSON.stringify(j.facts || null) === JSON.stringify(facts)) continue;
      it.judged = j ? { ...j, facts } : { group: null, p: null, at: 0, v: 0, why: null, facts, sig: null };
      changed = true;
    }
    if (changed) { this._save(); this._notify(); }
    return changed;
  }
  notify() { this._notify(); }

  forSession(keys) {
    const set = new Set(Array.isArray(keys) ? keys : [keys]);
    return this._state.items.filter((i) => set.has(i.sessionKey) && i.status === 'open');
  }

  get(id) { return this._state.items.find((i) => i.id === id) || null; }

  add(sessionKey, { text, detail, urgency, by = 'agent', sessionName = null, jobId = null, kind = null, i18n = null, expiresAt = null, action = null, options = null, origin = null, card = null, artifacts = null, cwd = null, hostId = null, openCap = null, plugin = null, open = null, about = null } = {}) {
    const _dataDir = path.dirname(this._file);   // agent-output-sinks: the belt finds the vault from here
    const rawText = typeof text === 'string' ? (origin === 'agent' ? belt.maskForSink(text.trim(), { dataDir: _dataDir }) : text.trim()) : '';   // agent-output-sinks: belt the AGENT's own ask (origin 'agent'), never a system producer's notice (vault / spend / channels / …)
    text = rawText.slice(0, TEXT_MAX);
    const textCut = rawText.length > TEXT_MAX ? TEXT_MAX : 0; // the cap it hit, named on the return
    // EXPIRY (2.369.152): optional; only a future ms epoch counts (validExpiry)
    expiresAt = validExpiry(expiresAt, this._now());
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
    const arts = normalizeArtifacts(artifacts); // lane foryou-attachments: vibespace-ask --artifact — ≤8 rows, the cut named, a bad shape THROWS by name
    artifacts = arts.artifacts;
    // WHERE ITS WORDS LIVE (lane foryou-attachments): the asking conversation's cwd + host — a path in the words opens
    // against them (resolution for OPENING only, never a spawn)
    cwd = typeof cwd === 'string' && cwd.startsWith('/') ? cwd.slice(0, 4096) : null;
    hostId = typeof hostId === 'string' && hostId && hostId !== 'local' ? hostId.slice(0, 120) : null;
    about = normalizeAbout(about); // lane chat-needs-you-card: the conversation it addresses (its chat draws the card), or null
    // ORIGIN (B-328d, 2026-09-24): WHO filed it — a closed set (src/inbox-origin.js).
    // REQUIRED (r2, fail closed): a caller naming none THROWS `origin required
    // (one of …)` and a value outside the set THROWS by name — either files
    // nothing. There is no default: the old `agent` default let a producer the
    // census could not see (an aliased store, `?.add`) file under Agents with
    // nothing red anywhere. Every caller declares at the call — the agent route
    // `agent`, each server producer its own, every fixture explicitly
    // (test-user-todos-layout ⑪ is the census beside this throw).
    origin = normalizeOrigin(origin);
    // A PLUGIN'S REMINDER (lane foryou-plugin-notices): origin 'plugin' names WHICH plugin (`plugin`, its id) and files under
    // that id — one tray section per plugin, pinned under urgent unless filed low (src/lib/user-todos-layout.js trayBand); the plugin must
    // DECLARE 'reminders' (the gate); `plugin` on any other origin is refused, and so is a door on an item that is no plugin's
    if (origin === 'plugin') {
      if (typeof plugin !== 'string' || !PLUGIN_ID_RE.test(plugin)) throw new Error("a plugin's item names its plugin (plugin: <id>)");
      if (sessionKey !== plugin) throw new Error(`a plugin files under its own id (${plugin}), not ${sessionKey}`);
      if (this._pluginGate && !this._pluginGate(plugin)) throw new Error(`plugin ${plugin} does not declare 'reminders' — it cannot file For-you items`);
    } else if (plugin != null) throw new Error("plugin: only a plugin's item names one (origin 'plugin')");
    open = normalizeOpen(open, origin === 'plugin' ? plugin : null);
    if (urgency != null && !URGENCIES.includes(urgency)) throw new Error(`urgency must be one of ${URGENCIES.join('/')}`);
    // KIND (2.369.118, owner: spend notices are DISTRACTING beside real asks):
    // 'action' = the user must do something (default, every older item);
    // 'notice' = for their information only — its own section in the popup,
    // never in the red badge. A PRODUCER declares it; nothing infers it.
    if (kind != null && !KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join('/')}`);
    const rawDetail = typeof detail === 'string' ? (origin === 'agent' ? belt.maskForSink(detail.trim(), { dataDir: _dataDir }) : detail.trim()) : '';   // agent-output-sinks: AGENT asks only
    detail = rawDetail ? rawDetail.slice(0, DETAIL_MAX) : null;
    const detailCut = rawDetail.length > DETAIL_MAX ? DETAIL_MAX : 0;
    // the cut is named on the RETURNED record only (the ledger never carries it)
    const named = (o) => (arts.cut ? { ...o, artifactsCut: arts.cut } : o); // lane foryou-attachments: the attachments' cap, named the same way
    const cut = (o) => (textCut || detailCut ? { ...named(o), ...(textCut ? { textCut } : {}), ...(detailCut ? { detailCut } : {}) } : named(o));
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
    // a SERVER producer whose open items its own domain bounds (one per account row) may raise the per-key cap; the agent
    // route never passes it (lane oat-identity-fix-r2, L1)
    const maxOpen = Number(openCap) > MAX_OPEN_PER_SESSION ? Math.min(Number(openCap), MAX_ITEMS) : MAX_OPEN_PER_SESSION;
    if (existing) {
      let changed = false;
      // lane decision-inbox-rank: an agent filing the SAME words (text, and the same detail or none) of an item still open
      // is a RE-ASK — counted (the tray's judge reads "re-asked N times"; the 48 h decay restarts at the last one); new
      // words are an edit (F2 below), and a server producer's periodic re-file is not an ask
      const reask = existing.status === 'open' && origin === 'agent' && (!detail || detail === existing.detail);
      if (existing.status !== 'open') {
        if (openCount >= maxOpen) throw new Error(`this session already has ${openCount} open items — resolve some before adding more`);
        existing.status = 'open'; existing.resolvedAt = null; existing.resolvedBy = null;
        existing.createdAt = this._now();
        // a re-file of a resolved item is a NEW filing: its own expiry or none
        // (the old one is past — kept, it would expire the item on the next sweep)
        existing.expiresAt = expiresAt;
        existing.reply = null; // a re-filed ask is a NEW question: the last reply answered the old filing
        delete existing.judged; // inbox-verify F2: …and the judge's verdict judged the old filing
        delete existing.reasks; delete existing.reaskedAt; // lane decision-inbox-rank: a new filing has no re-asks yet
        changed = true;
      } else if (expiresAt && existing.expiresAt != null && expiresAt > existing.expiresAt) {
        // an OPEN item merges to the LATER end; one with no expiresAt is lasting
        // (it never expires) and a re-file never shortens that
        existing.expiresAt = expiresAt; changed = true;
      }
      if (reask) { existing.reasks = (Number(existing.reasks) || 0) + 1; existing.reaskedAt = this._now(); changed = true; }
      if (detail && detail !== existing.detail) { existing.detail = detail; delete existing.judged; changed = true; } // F2: new words, no old verdict
      if (urgency && urgency !== existing.urgency) { existing.urgency = urgency; changed = true; }
      if (kind && kind !== existing.kind) { existing.kind = kind; changed = true; }
      if (i18n && JSON.stringify(i18n) !== JSON.stringify(existing.i18n || null)) { existing.i18n = i18n; changed = true; }
      if (action && JSON.stringify(action) !== JSON.stringify(existing.action || null)) { existing.action = action; changed = true; }
      if (card && JSON.stringify(card) !== JSON.stringify(existing.card || null)) { existing.card = card; changed = true; }
      if (options && JSON.stringify(options) !== JSON.stringify(existing.options || null)) { existing.options = options; changed = true; } // a re-file WITH options replaces them; one without keeps the old set
      if (artifacts && JSON.stringify(artifacts) !== JSON.stringify(existing.artifacts || null)) { existing.artifacts = artifacts; changed = true; } // lane foryou-attachments: the same rule as options
      if (cwd && cwd !== existing.cwd) { existing.cwd = cwd; changed = true; }
      if (hostId && hostId !== existing.hostId) { existing.hostId = hostId; changed = true; }
      if (about && about !== existing.about) { existing.about = about; changed = true; } // lane chat-needs-you-card
      if (open && JSON.stringify(open) !== JSON.stringify(existing.open || null)) { existing.open = open; changed = true; } // lane foryou-plugin-notices: the door follows the latest filing (its prefill)
      // a DECLARED origin is kept (the item's producer does not change on a re-file);
      // an item filed before the field existed takes the re-filer's declaration
      if (!existing.origin) { existing.origin = origin; changed = true; }
      if (changed) { this._save(); this._notify(); }
      return cut({ ...existing, existing: true });
    }
    if (openCount >= maxOpen) throw new Error(`this session already has ${openCount} open items — resolve some before adding more`);
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
      ...(artifacts ? { artifacts } : {}), // lane foryou-attachments: what the agent asks the owner to open (chips → the one artifact door)
      ...(cwd ? { cwd } : {}), ...(hostId ? { hostId } : {}), // where its words' paths resolve (the asker's cwd on its host)
      ...(about ? { about } : {}), // lane chat-needs-you-card: the conversation it ADDRESSES (filed under a group key) — its chat draws the card
      ...(origin === 'plugin' ? { plugin } : {}), ...(open ? { open } : {}), // lane foryou-plugin-notices: WHICH plugin, and where a click on the item opens
      reply: null, // {text, at} once the user replied from the inbox (resolveByReply)
      origin, // the PRODUCER (B-328d): spend|login|pool|jobs|channels|browser|agent — REQUIRED (r2), the Notices area groups by it
      createdAt: this._now(), resolvedAt: null, resolvedBy: null,
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
      it.status = 'done'; it.resolvedAt = this._now(); it.resolvedBy = 'agent';
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
    if (status === 'open') { item.resolvedAt = null; item.resolvedBy = null; item.expiresAt = null; if (!wasOpen) delete item.judged; } // F2: a reopen is judged again
    else { item.resolvedAt = this._now(); item.resolvedBy = by; }
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
    const now = this._now();
    for (const id of new Set(Array.isArray(ids) ? ids : [])) {
      const item = this._state.items.find((i) => i.id === id);
      if (!item) { unknown.push(id); continue; }
      const wasOpen = item.status === 'open';
      item.status = status;
      if (status === 'open') { item.resolvedAt = null; item.resolvedBy = null; item.expiresAt = null; if (!wasOpen) delete item.judged; } // F2: a reopen is judged again
      else { item.resolvedAt = now; item.resolvedBy = by; }
      changed.push(id);
      if (wasOpen && status !== 'open') went.push(item);
    }
    if (changed.length) { this._save(); this._notify(); this._emitStatus(went, by, true); }
    return { changed, unknown };
  }

  /** «Mark all read» on the notices (lane inbox-fyi-mark-all, the owner 2026-10-22: a notice asks nothing, so confirming
   *  them one by one is busywork). `read` true: every OPEN NOTICE among `ids` becomes done (resolvedBy `by`) — an id
   *  already resolved is left exactly as it is (`already`: the act is idempotent), an item that is not a notice is never
   *  touched (`refused`: an ask is answered on its own), an unknown id is reported. `read` false = THE UNDO: a notice
   *  this door resolved (done by `by`) comes back open AS IT WAS — its expiry and judgement kept, unlike a hand reopen;
   *  one another door resolved meanwhile (expired, withdrawn) stays resolved. ONE save + ONE broadcast however many
   *  went; the status listeners hear a batch. @returns {{changed: string[], already: string[], refused: string[], unknown: string[]}} */
  readNotices(ids, read = true, by = 'user') {
    const changed = [], already = [], refused = [], unknown = [], went = [];
    const now = this._now();
    for (const id of new Set(Array.isArray(ids) ? ids : [])) {
      const item = this._state.items.find((i) => i.id === id);
      if (!item) { unknown.push(id); continue; }
      if (item.kind !== 'notice') { refused.push(id); continue; }
      if (read ? item.status !== 'open' : !(item.status === 'done' && item.resolvedBy === by)) { already.push(id); continue; }
      if (read) { item.status = 'done'; item.resolvedAt = now; item.resolvedBy = by; }
      else { item.status = 'open'; item.resolvedAt = null; item.resolvedBy = null; }
      changed.push(id); went.push(item);
    }
    if (changed.length) { this._save(); this._notify(); this._emitStatus(went, by, true); }
    return { changed, already, refused, unknown };
  }

  /** A PRODUCER'S ANSWER to its own OPEN items (lane exit-item-heal): each id still open becomes done with
   *  `resolvedBy: by` and `resolvedFact` = the fact that answered it, which the client words (an unexpected-exit
   *  item's `{resumedAt}` ⇒ "running again (resumed 16:16)"). An item the user already resolved or dismissed is left
   *  exactly as it is. ONE save + ONE broadcast; the status listeners hear it as they hear setStatus.
   *  @returns the ids resolved */
  resolveAnswered(ids, by, fact = null) {
    const went = [], now = this._now();
    for (const id of new Set(Array.isArray(ids) ? ids : [])) {
      const item = this._state.items.find((i) => i.id === id);
      if (!item || item.status !== 'open') continue;
      item.status = 'done'; item.resolvedAt = now; item.resolvedBy = by;
      if (fact) item.resolvedFact = { ...fact };
      went.push(item);
    }
    if (went.length) { this._save(); this._notify(); this._emitStatus(went, by); }
    return went.map((i) => i.id);
  }

  /** The user REPLIED to this item from the inbox and the reply reached the
   *  session (src/routes/user-todos-reply.js calls this only after the send
   *  succeeded). An OPEN item becomes done with `resolvedBy:'reply'`; an item
   *  already resolved or dismissed keeps its status and `resolvedBy` (a reply
   *  is refused for delivery reasons only, never bookkeeping) — either way the
   *  reply is kept on it as `{text ≤4000, at}`. ONE save + ONE broadcast. */
  resolveByReply(id, text, now = this._now()) {
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
  clearItems(ids, { by = 'owner', at = this._now(), allow = null } = {}) {
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
    for (const i of this._state.items) {
      if (i.sessionKey === fromKey) { i.sessionKey = toKey; changed = true; }
      if (i.about === fromKey) { i.about = toKey; changed = true; } // lane chat-needs-you-card: the conversation it addresses moves with it
    }
    if (changed) { this._save(); this._notify(); }
  }
}

module.exports = { UserTodoManager, EXPIRY_SWEEP_MS, RESOLVED_TAIL, RESOLVED_RECENT_MS, RESOLVED_SNAPSHOT_MAX, TEXT_MAX, DETAIL_MAX, DETAIL_PREVIEW, ARTIFACTS_MAX, previewOf, validExpiry, normalizeAction, normalizeArtifacts };
