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
    // THE NOTICE SLOT IS A QUEUE (agent browser P1, design §3.8 layer ②): a
    // file an older build wrote carries ONE fixed-shape `pendingNotice`; it is
    // lifted into `pendingNotices: [{kind:'status-override', …}]` once, here,
    // so every reader below sees one shape.
    for (const rec of Object.values(this._state.statuses)) {
      if (!rec || typeof rec !== 'object') continue;
      if (!Array.isArray(rec.pendingNotices)) rec.pendingNotices = [];
      if (rec.pendingNotice && typeof rec.pendingNotice === 'object') rec.pendingNotices.push({ kind: 'status-override', ...rec.pendingNotice });
      delete rec.pendingNotice;
    }
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

  // Status-change HISTORY per session (capped) — the expanded card shows this
  // timeline. Appended on every set/clear; entries are immutable snapshots.
  _logHistory(key, entry) {
    if (!this._state.history || typeof this._state.history !== 'object') this._state.history = {};
    const arr = this._state.history[key] || (this._state.history[key] = []);
    const last = arr[arr.length - 1];
    // Skip no-op repeats (agents re-assert the same state; a heartbeat isn't history)
    if (last && last.state === entry.state && last.urgency === entry.urgency && last.reason === entry.reason && last.setBy === entry.setBy) return;
    arr.push(entry);
    if (arr.length > 50) arr.splice(0, arr.length - 50);
  }

  history(key) { return this._state.history?.[key] || []; }

  /** A NON-STATUS timeline event (design-unknown-records, 2026-09-21): today the claude
   *  `vcs_state_changed` fact ({event:'vcs', kind, branch, at}). Appended to the same
   *  per-session history the Session Properties timeline reads, never a status write
   *  (the effective status is untouched, no pendingNotice, no broadcast — the
   *  active-sessions push that carries the fact re-renders the panel). */
  noteEvent(key, entry) {
    if (!key || !entry || typeof entry !== 'object' || typeof entry.event !== 'string') return;
    if (!this._state.history || typeof this._state.history !== 'object') this._state.history = {};
    const arr = this._state.history[key] || (this._state.history[key] = []);
    arr.push({ ...entry, setBy: 'agent', at: Number.isFinite(entry.at) ? entry.at : Date.now() });
    if (arr.length > 50) arr.splice(0, arr.length - 50);
    this._save();
  }

  _validate({ state, urgency, reason, detail }) {
    if (state != null && !STATES.includes(state)) throw new Error(`state must be one of ${STATES.join('/')}`);
    if (urgency != null && !URGENCIES.includes(urgency)) throw new Error(`urgency must be one of ${URGENCIES.join('/')}`);
    return {
      state: state ?? null,
      urgency: urgency ?? null,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 300) : null,
      // reason = the one-liner shown on chips/board; detail = optional full
      // context, surfaced in Session Properties / on demand only.
      detail: typeof detail === 'string' && detail.trim() ? detail.trim().slice(0, 2000) : null,
    };
  }

  setByAgent(key, fields) {
    const v = this._validate(fields);
    if (!v.state && !v.urgency && !v.reason && !v.detail) return this.clear(key, 'agent');
    const prev = this._state.statuses[key];
    this._state.statuses[key] = {
      ...v, setBy: 'agent', at: Date.now(),
      // undelivered notices survive an agent re-set (still worth telling)
      pendingNotices: prev?.pendingNotices || [],
    };
    this._logHistory(key, { ...v, setBy: 'agent', at: Date.now() });
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
      pendingNotices: [
        ...(prev?.pendingNotices || []),
        ...(overriding ? [{ kind: 'status-override', agent: { state: prev.state, urgency: prev.urgency, reason: prev.reason }, user: { state: v.state, urgency: v.urgency }, at: Date.now() }] : []),
      ],
    };
    this._logHistory(key, { ...v, setBy: 'user', at: Date.now() });
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
        pendingNotices: [...(prev.pendingNotices || []), { kind: 'status-override', agent: { state: prev.state, urgency: prev.urgency, reason: prev.reason }, user: null, at: Date.now() }],
      };
    } else if ((prev.pendingNotices || []).length) {
      // a record that still carries undelivered notices keeps them (an agent's
      // own clear must not eat a browser-profile notice queued for it)
      this._state.statuses[key] = { state: null, urgency: null, reason: null, setBy: by || 'user', at: Date.now(), pendingNotices: prev.pendingNotices };
    } else {
      delete this._state.statuses[key];
    }
    this._logHistory(key, { state: null, urgency: null, reason: null, setBy: by || 'user', at: Date.now(), cleared: true });
    this._save(); this._notify();
    return null;
  }

  // Move a webui:<id> placeholder record onto the real sessionKey once known.
  rekey(fromKey, toKey) {
    if (fromKey === toKey || !this._state.statuses[fromKey]) return;
    if (!this._state.statuses[toKey]) this._state.statuses[toKey] = this._state.statuses[fromKey];
    delete this._state.statuses[fromKey];
    const h = this._state.history?.[fromKey];
    if (h) {
      if (!this._state.history[toKey]) this._state.history[toKey] = h;
      else this._state.history[toKey] = [...h, ...this._state.history[toKey]].slice(-50);
      delete this._state.history[fromKey];
    }
    this._save(); this._notify();
  }

  // THE QUEUE OF TYPED NOTICES (agent browser P1, design §3.8 layer ②). One
  // slot used to hold ONE fixed-shape status-override notice, `renderNotice`
  // was hardcoded to its sentence and the sole injection site consumed one and
  // `break`-ed — so a second producer (a browser-profile change, a mid-task
  // pin) would have overwritten it or been overwritten by it: a silently
  // dropped <system-reminder> in a feature whose whole purpose is that a
  // notice is not silently dropped. Now every producer `pushNotice`s a
  // `{kind, …}`, the renderer dispatches on `kind` (an unknown kind is refused
  // LOUDLY at push time, never rendered as garbage), and the injection site
  // DRAINS. Zero billed turns: the text rides the user's own next message.
  pushNotice(key, notice) {
    const n = notice && typeof notice === 'object' ? notice : null;
    if (!n || !NOTICE_RENDERERS[n.kind]) throw new Error(`pushNotice: unknown notice kind ${JSON.stringify(n && n.kind)} (one of ${Object.keys(NOTICE_RENDERERS).join('/')})`);
    const rec = this._state.statuses[key] || (this._state.statuses[key] = { state: null, urgency: null, reason: null, setBy: null, at: Date.now(), pendingNotices: [] });
    if (!Array.isArray(rec.pendingNotices)) rec.pendingNotices = [];
    // BOUNDED: a producer that fires faster than the user types must not grow
    // the record without limit; the newest notices are the ones that describe
    // the present, so the oldest go first.
    rec.pendingNotices.push({ ...n, at: Number(n.at) || Date.now() });
    if (rec.pendingNotices.length > MAX_NOTICES) rec.pendingNotices.splice(0, rec.pendingNotices.length - MAX_NOTICES);
    this._save(); this._notify();
    return rec.pendingNotices.length;
  }

  /** What is queued for a key, without consuming it (a UI hint, a test). */
  pendingNotices(key) { return (this._state.statuses[key]?.pendingNotices || []).slice(); }

  // Pull (and clear) EVERY pending notice — called when the user sends their
  // next chat message; the caller renders each and appends them all.
  consumeNotices(key) {
    const rec = this._state.statuses[key];
    if (!rec || !Array.isArray(rec.pendingNotices) || !rec.pendingNotices.length) return [];
    const list = rec.pendingNotices;
    rec.pendingNotices = [];
    if (!rec.state && !rec.urgency && !rec.reason) delete this._state.statuses[key];
    this._save(); this._notify();
    return list;
  }

  /** The one renderer: dispatches on `kind`; a notice with no kind is the
   *  legacy status-override shape (files older builds wrote). */
  static renderNotice(notice) {
    const kind = notice && notice.kind ? String(notice.kind) : 'status-override';
    const r = NOTICE_RENDERERS[kind];
    return r ? r(notice) : '';
  }
  static renderNotices(list) { return (list || []).map((n) => SessionStatusManager.renderNotice(n)).filter(Boolean).join('\n'); }
  static get NOTICE_KINDS() { return Object.keys(NOTICE_RENDERERS); }
}

const MAX_NOTICES = 8;
function renderStatusOverride(notice) {
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
/** kind → renderer. `status-override` keeps today's text verbatim; the agent
 *  browser's `browser-profile` (§3.8 layer ②) and `browser-pin` (§3.2.5 path 3)
 *  render through the PURE model so the sentence is ONE spelling. */
const NOTICE_RENDERERS = Object.freeze({
  'status-override': renderStatusOverride,
  'browser-profile': (n) => require('./browser-profiles').renderProfileChangeNotice(n),
  'browser-pin': (n) => require('./browser-profiles').renderProfileChangeNotice({ ...n, by: n.by || 'user' }),
  // agent browser P3 (§4.3.1): the zero-spend twin of the handback announcement — rides the user's next message
  'browser-handback': (n) => require('./browser-takeover').renderHandbackNotice(n),
});

module.exports = { SessionStatusManager, SESSION_STATES: STATES, SESSION_URGENCIES: URGENCIES, NOTICE_KINDS: Object.keys(NOTICE_RENDERERS) };
