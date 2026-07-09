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

const URGENCIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['open', 'done', 'dismissed'];
const MAX_OPEN_PER_SESSION = 20; // an agent looping on add must not flood the inbox
const MAX_ITEMS = 1000;          // total ledger cap — oldest RESOLVED pruned first

class UserTodoManager {
  constructor({ dataDir, onChange }) {
    this._file = path.join(dataDir, 'user-todos.json');
    this._onChange = onChange || (() => {});
    this._state = { items: [] };
    this._writeTimer = null; this._dirty = false; this._lastWritten = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(this._file, 'utf-8'));
      if (parsed && Array.isArray(parsed.items)) this._state = parsed;
      this._lastWritten = JSON.stringify(this._state, null, 2);
    } catch { /* fresh */ }
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

  add(sessionKey, { text, detail, urgency, by = 'agent', sessionName = null } = {}) {
    text = typeof text === 'string' ? text.trim().slice(0, 300) : '';
    if (!text) throw new Error('text required');
    if (urgency != null && !URGENCIES.includes(urgency)) throw new Error(`urgency must be one of ${URGENCIES.join('/')}`);
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
        changed = true;
      }
      if (detail && detail !== existing.detail) { existing.detail = detail; changed = true; }
      if (urgency && urgency !== existing.urgency) { existing.urgency = urgency; changed = true; }
      if (changed) { this._save(); this._notify(); }
      return { ...existing, existing: true };
    }
    if (openCount >= MAX_OPEN_PER_SESSION) throw new Error(`this session already has ${openCount} open items — resolve some before adding more`);
    const item = {
      id: 'ut-' + crypto.randomBytes(5).toString('hex'),
      sessionKey, text, detail,
      urgency: urgency || 'normal',
      status: 'open', by,
      sessionName: sessionName || null, // display fallback frozen at file time
      createdAt: Date.now(), resolvedAt: null, resolvedBy: null,
    };
    this._state.items.push(item);
    this._save(); this._notify();
    return item;
  }

  // status: 'done' (handled) | 'dismissed' (not going to) | 'open' (reopen)
  setStatus(id, status, by = 'user') {
    if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join('/')}`);
    const item = this._state.items.find((i) => i.id === id);
    if (!item) throw new Error('item not found');
    item.status = status;
    if (status === 'open') { item.resolvedAt = null; item.resolvedBy = null; }
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

module.exports = { UserTodoManager, USER_TODO_URGENCIES: URGENCIES };
