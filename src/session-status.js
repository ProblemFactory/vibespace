/**
 * SessionStatusManager — session-level state/urgency indicators
 * (task system follow-up: 直观观测 session 状态).
 *
 * Two writers, one record per session key:
 * - The AGENT sets its own status via the `vibespace-status` CLI (spawned into
 *   its env with VIBESPACE_API + VIBESPACE_SESSION_TOKEN) → POST
 *   /api/agent/session-status, authenticated by the per-session token only.
 * - The USER can overwrite (or clear) from the session card. Overwriting an
 *   agent-set status records a pendingNotice; the server appends it as a
 *   <system-reminder> to the user's NEXT chat message so the agent learns the
 *   user disagreed with its self-assessment (user-requested behavior).
 *
 * Effective value = the latest write (user wins until the agent re-assesses).
 * Stored in data/session-status.json keyed by sessionKey
 * (backend:backendSessionId, or webui:<serverId> before the id is known —
 * re-keyed on the agent's next call once the real id exists).
 */

const fs = require('fs');
const path = require('path');

// A Task (= a session) has one of these states; `done` = this piece of work is
// finished (the "岗位/Task Group" itself has no status — only archive).
const STATES = ['working', 'needs-input', 'blocked', 'review', 'done'];
const URGENCIES = ['low', 'normal', 'high', 'urgent'];
const MAX_ENTRIES = 500;

class SessionStatusManager {
  constructor({ dataDir, onChange }) {
    this._file = path.join(dataDir, 'session-status.json');
    this._onChange = onChange || (() => {});
    this._state = { statuses: {} };
    this._writeTimer = null; this._dirty = false; this._lastWritten = null;
    try {
      this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8'));
      if (!this._state || typeof this._state.statuses !== 'object') this._state = { statuses: {} };
      this._lastWritten = JSON.stringify(this._state, null, 2); // avoid a redundant first write
    } catch { /* fresh */ }
  }

  // In-memory state + broadcast are updated synchronously by the callers; disk
  // persistence is DEBOUNCED (single process → no cross-process race) and
  // content-compared, so a burst of status updates coalesces into one write
  // instead of a synchronous full-file writeFileSync per update. Flushed on exit.
  _save() {
    const keys = Object.keys(this._state.statuses);
    if (keys.length > MAX_ENTRIES) {
      keys.sort((a, b) => (this._state.statuses[a].at || 0) - (this._state.statuses[b].at || 0));
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete this._state.statuses[k];
    }
    this._dirty = true;
    if (!this._writeTimer) this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flush(); }, 500);
  }

  _flush() {
    if (!this._dirty) return;
    const json = JSON.stringify(this._state, null, 2);
    if (json === this._lastWritten) { this._dirty = false; return; } // no real change → skip write
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, this._file);
    this._lastWritten = json;
    this._dirty = false;
  }

  // Synchronous flush for process exit (SIGINT/SIGTERM), like SyncStore/layouts.
  flush() { if (this._writeTimer) { clearTimeout(this._writeTimer); this._writeTimer = null; } this._flush(); }

  _notify() { try { this._onChange(this.snapshot()); } catch { } }

  snapshot() { return this._state.statuses; }

  get(key) { return this._state.statuses[key] || null; }

  _validate({ state, urgency, reason }) {
    if (state != null && !STATES.includes(state)) throw new Error(`state must be one of ${STATES.join('/')}`);
    if (urgency != null && !URGENCIES.includes(urgency)) throw new Error(`urgency must be one of ${URGENCIES.join('/')}`);
    return {
      state: state ?? null,
      urgency: urgency ?? null,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 300) : null,
    };
  }

  setByAgent(key, fields) {
    const v = this._validate(fields);
    if (!v.state && !v.urgency && !v.reason) return this.clear(key, 'agent');
    const prev = this._state.statuses[key];
    this._state.statuses[key] = {
      ...v, setBy: 'agent', at: Date.now(),
      // an undelivered override notice survives an agent re-set (still worth telling)
      pendingNotice: prev?.pendingNotice || null,
    };
    this._save(); this._notify();
    return this._state.statuses[key];
  }

  setByUser(key, fields) {
    const v = this._validate(fields);
    const prev = this._state.statuses[key];
    const overriding = prev && prev.setBy === 'agent'
      && (prev.state !== v.state || prev.urgency !== v.urgency);
    if (!v.state && !v.urgency && !v.reason && !overriding) return this.clear(key, 'user');
    this._state.statuses[key] = {
      ...v, setBy: 'user', at: Date.now(),
      pendingNotice: overriding
        ? { agent: { state: prev.state, urgency: prev.urgency, reason: prev.reason }, user: { state: v.state, urgency: v.urgency }, at: Date.now() }
        : (prev?.pendingNotice || null),
    };
    this._save(); this._notify();
    return this._state.statuses[key];
  }

  clear(key, by) {
    const prev = this._state.statuses[key];
    if (!prev) return null;
    if (by === 'user' && prev.setBy === 'agent') {
      // clearing the agent's status is also an override worth mentioning
      this._state.statuses[key] = {
        state: null, urgency: null, reason: null, setBy: 'user', at: Date.now(),
        pendingNotice: { agent: { state: prev.state, urgency: prev.urgency, reason: prev.reason }, user: null, at: Date.now() },
      };
    } else {
      delete this._state.statuses[key];
    }
    this._save(); this._notify();
    return null;
  }

  // Move a webui:<id> placeholder record onto the real sessionKey once known.
  rekey(fromKey, toKey) {
    if (fromKey === toKey || !this._state.statuses[fromKey]) return;
    if (!this._state.statuses[toKey]) this._state.statuses[toKey] = this._state.statuses[fromKey];
    delete this._state.statuses[fromKey];
    this._save(); this._notify();
  }

  // Pull (and clear) the pending override notice — called when the user sends
  // their next chat message; the caller appends the rendered text to it.
  consumeNotice(key) {
    const rec = this._state.statuses[key];
    if (!rec?.pendingNotice) return null;
    const notice = rec.pendingNotice;
    rec.pendingNotice = null;
    if (!rec.state && !rec.urgency && !rec.reason) delete this._state.statuses[key];
    this._save(); this._notify();
    return notice;
  }

  static renderNotice(notice) {
    const fmt = (s) => s ? `state=${s.state || 'unset'}, urgency=${s.urgency || 'unset'}${s.reason ? `, reason="${s.reason}"` : ''}` : null;
    const agent = fmt(notice.agent);
    const user = fmt(notice.user);
    return '<system-reminder>\n'
      + (notice.user
        ? `The user manually changed this session's status indicator that you had set via vibespace-status.\nYours: ${agent}\nUser set: ${user}\n`
        : `The user cleared the status indicator you had set via vibespace-status (was: ${agent}).\n`)
      + 'Treat the user\'s setting as the correct assessment and calibrate your future vibespace-status updates to their preference. Do not change it back unless the situation genuinely changes.\n'
      + '</system-reminder>';
  }
}

module.exports = { SessionStatusManager, SESSION_STATES: STATES, SESSION_URGENCIES: URGENCIES };
