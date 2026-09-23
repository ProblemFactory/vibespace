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
 *
 * Follows the SessionStatusManager persistence pattern: memory + broadcast are
 * synchronous, disk (data/user-todos.json) is debounced + content-compared,
 * flushed on exit. Keys are sessionKeys (backend:backendSessionId, or
 * webui:<serverId> before the id exists — re-keyed once known).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

const URGENCIES = ['low', 'normal', 'high', 'urgent'];
const KINDS = ['action', 'notice']; // 2.369.118: action = needs the user (default); notice = for their information (own section, grey count)
const STATUSES = ['open', 'done', 'dismissed'];
const MAX_OPEN_PER_SESSION = 20; // an agent looping on add must not flood the inbox
const MAX_ITEMS = 1000;          // total ledger cap — oldest RESOLVED pruned first
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
  constructor({ dataDir, onChange, expirySweepMs = EXPIRY_SWEEP_MS }) {
    this._file = path.join(dataDir, 'user-todos.json');
    this._onChange = onChange || (() => {});
    this._state = { items: [] };
    this._writeTimer = null; this._dirty = false; this._lastWritten = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(this._file, 'utf-8'));
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

  /** stop the expiry timer (suites, a migration's private manager) */
  stop() { if (this._expiryTimer) { clearInterval(this._expiryTimer); this._expiryTimer = null; } }

  /** Resolve every OPEN item whose `expiresAt` has passed — `resolvedBy:
   *  'expired'`, status 'done', the record kept (the ledger is history). An
   *  item WITHOUT `expiresAt` is never touched: expiry is a producer's
   *  declaration, never inferred from age or text. ONE save + ONE broadcast
   *  per sweep however many items went. @returns the count resolved */
  expireDue(now = Date.now()) {
    let n = 0;
    for (const it of this._state.items) {
      if (it.status !== 'open') continue;
      if (!(typeof it.expiresAt === 'number' && Number.isFinite(it.expiresAt)) || it.expiresAt > now) continue;
      it.status = 'done'; it.resolvedAt = now; it.resolvedBy = 'expired';
      n++;
    }
    if (n) { this._save(); this._notify(); }
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
    if (!this._writeTimer) this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flush(); }, 500);
  }

  _flush() {
    if (!this._dirty) return;
    const json = JSON.stringify(this._state, null, 2);
    if (json === this._lastWritten) { this._dirty = false; return; }
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, this._file);
    this._lastWritten = json;
    this._dirty = false;
  }

  flush() { if (this._writeTimer) { clearTimeout(this._writeTimer); this._writeTimer = null; } this._flush(); }

  _notify() { try { this._onChange(this.snapshot()); } catch { } }

  // Everything the UI needs: open items + a short tail of recently-resolved
  // ones (shown dimmed for context). Sorted urgent-first, then newest.
  snapshot() {
    const rank = (u) => URGENCIES.indexOf(u || 'normal');
    const open = this._state.items.filter((i) => i.status === 'open')
      .sort((a, b) => (rank(b.urgency) - rank(a.urgency)) || (b.createdAt - a.createdAt));
    const resolved = this._state.items.filter((i) => i.status !== 'open')
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0)).slice(0, 15);
    return { open, resolved };
  }

  forSession(keys) {
    const set = new Set(Array.isArray(keys) ? keys : [keys]);
    return this._state.items.filter((i) => set.has(i.sessionKey) && i.status === 'open');
  }

  get(id) { return this._state.items.find((i) => i.id === id) || null; }

  add(sessionKey, { text, detail, urgency, by = 'agent', sessionName = null, jobId = null, kind = null, i18n = null, expiresAt = null, action = null } = {}) {
    text = typeof text === 'string' ? text.trim().slice(0, 300) : '';
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
    if (urgency != null && !URGENCIES.includes(urgency)) throw new Error(`urgency must be one of ${URGENCIES.join('/')}`);
    // KIND (2.369.118, owner: spend notices are DISTRACTING beside real asks):
    // 'action' = the user must do something (default, every older item);
    // 'notice' = for their information only — its own section in the popup,
    // never in the red badge. A PRODUCER declares it; nothing infers it.
    if (kind != null && !KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join('/')}`);
    detail = typeof detail === 'string' && detail.trim() ? detail.trim().slice(0, 2000) : null;
    // Idempotent BY TEXT across ALL statuses: re-filing an open question
    // refreshes it; re-filing a RESOLVED/DISMISSED one REOPENS the same item
    // (same id). Minting a fresh id per re-file would let an add→resolve loop
    // (or re-asserting a text the user dismissed) spam every client with
    // "new item" toasts despite the open cap — a stable id keeps re-assertion
    // possible while making it quiet.
    const existing = this._state.items.find((i) => i.sessionKey === sessionKey && i.text === text);
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
      if (changed) { this._save(); this._notify(); }
      return { ...existing, existing: true };
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
      expiresAt, // ms epoch the item dies at (resolved 'expired' by expireDue), or null = lasting
      createdAt: Date.now(), resolvedAt: null, resolvedBy: null,
    };
    this._state.items.push(item);
    this._save(); this._notify();
    return item;
  }

  /** auto-resolve a job's open inbox items (2.350.0, owner report: "提交过了
   *  怎么不从inbox里消失" — answering an interaction panel must clear its
   *  needs-your-input entry). onlyAsk keeps completion/failure notices intact
   *  unless the whole job is being removed. */
  resolveByJob(jobId, { onlyAsk = true } = {}) {
    if (!jobId) return 0;
    let n = 0;
    for (const it of this._state.items) {
      if (it.status !== 'open' || it.jobId !== jobId) continue;
      if (onlyAsk && !/needs your input/.test(it.text)) continue;
      it.status = 'done'; it.resolvedAt = Date.now(); it.resolvedBy = 'agent';
      n++;
    }
    if (n) { this._save(); this._notify(); }
    return n;
  }

  // status: 'done' (handled) | 'dismissed' (not going to) | 'open' (reopen)
  setStatus(id, status, by = 'user') {
    if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join('/')}`);
    const item = this._state.items.find((i) => i.id === id);
    if (!item) throw new Error('item not found');
    item.status = status;
    // a reopen is the user saying it still matters: it no longer expires
    if (status === 'open') { item.resolvedAt = null; item.resolvedBy = null; item.expiresAt = null; }
    else { item.resolvedAt = Date.now(); item.resolvedBy = by; }
    this._save(); this._notify();
    return item;
  }

  // Agent-side resolve by id OR unique text substring (its own session only).
  resolveByAgent(sessionKey, ref) {
    ref = String(ref || '').trim();
    if (!ref) throw new Error('pass the item id or a unique text fragment');
    const mine = this._state.items.filter((i) => i.sessionKey === sessionKey && i.status === 'open');
    let hit = mine.find((i) => i.id === ref);
    if (!hit) {
      const matches = mine.filter((i) => i.text.toLowerCase().includes(ref.toLowerCase()));
      if (matches.length > 1) throw new Error(`"${ref}" matches ${matches.length} open items — be more specific or use the id`);
      hit = matches[0];
    }
    if (!hit) throw new Error(`no open item matching "${ref}" in this session`);
    return this.setStatus(hit.id, 'done', 'agent');
  }

  // Move webui:<id> placeholder items onto the real sessionKey once known.
  rekey(fromKey, toKey) {
    if (fromKey === toKey) return;
    let changed = false;
    for (const i of this._state.items) if (i.sessionKey === fromKey) { i.sessionKey = toKey; changed = true; }
    if (changed) { this._save(); this._notify(); }
  }
}

module.exports = { UserTodoManager, USER_TODO_URGENCIES: URGENCIES, EXPIRY_SWEEP_MS, validExpiry, normalizeAction };
