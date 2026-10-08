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
const { timedSync } = require('./timed-sync.js'); // PURE: the store-write clock (design 011 lane 1, store-timing)
const { applyClear, CLEARED_TEXT } = require('./record-clear'); // PURE: "Clear content…" (2026-09-28) — this store holds the door (clearHistory)

// A Task (= a session) has one of these states; `done` = this piece of work is
// finished (the "岗位/Task Group" itself has no status — only archive).
const STATES = ['working', 'needs-input', 'blocked', 'review', 'done'];
const URGENCIES = ['low', 'normal', 'high', 'urgent'];
const MAX_ENTRIES = 500;

class SessionStatusManager {
  constructor({ dataDir, onChange, onWriteError = null }) {
    this._file = path.join(dataDir, 'session-status.json');
    this._onChange = onChange || (() => {});
    this._onWriteError = typeof onWriteError === 'function' ? onWriteError : null; // lane-dead-bridge: a failed background write is NAMED (src/server/fd-gauge.js), never a crash
    this._writeFailures = 0;
    this._state = { statuses: {} };
    this._writeTimer = null; this._dirty = false; this._lastWritten = null;
    try {
      this._state = timedSync('session-status.read', () => JSON.parse(fs.readFileSync(this._file, 'utf-8')));
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
    if (!this._writeTimer) this._writeTimer = setTimeout(() => { this._writeTimer = null; this._flushFromTimer(); }, 500);
  }

  // THE DEBOUNCED WRITE MAY NOT THROW (lane-dead-bridge, 2026-09-30 12:03:17):
  // this timer's bare writeFileSync met `EMFILE` — relayed by the workspace's
  // FUSE daemon, not raised by this process — and the throw became
  // `uncaughtException` → exit(1): the whole server died for one status file.
  // A failed write keeps the state DIRTY (nothing is lost in memory), retries
  // with a backoff (1 s, 2 s … 60 s) and is REPORTED through onWriteError,
  // which names who ran out. The exit-path flush() keeps its throw — its
  // callers already guard it.
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
    if (json === this._lastWritten) { this._dirty = false; return; } // no real change → skip write
    const tmp = this._file + '.tmp';
    timedSync('session-status.write', () => { fs.writeFileSync(tmp, json); fs.renameSync(tmp, this._file); });
    this._lastWritten = json;
    this._dirty = false;
  }

  // Synchronous flush for process exit (SIGINT/SIGTERM), like SyncStore/layouts.
  flush() { if (this._writeTimer) { clearTimeout(this._writeTimer); this._writeTimer = null; } this._flush(); }

  // `extra` rides the broadcast beside the statuses: a history clear names what it touched (`cleared: [{key, ats}]` —
  // ids only) because the statuses map it sends may be EXACTLY what every client already holds (a cleared entry that is
  // not the current status) and a client's change guard would drop it (lane-redact verify r5: the sidebar's expanded
  // card kept the cleared words for good)
  _notify(extra = null) { try { this._onChange(this.snapshot(), extra); } catch { } }

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

  /**
   * "CLEAR CONTENT…" — THE door for a status HISTORY entry (2026-09-28). An entry
   * has no id: it is named by (key, at). Each instant is looked up under `key`,
   * each entry of that instant asked `allow(entry)` (the caller's PURE
   * clearVerdict) and cleared IN PLACE (src/record-clear.js applyClear: the
   * reason becomes the ONE sentence, the detail goes; state, urgency, setBy, at
   * and position stay). The COPIES of those words go with it: the CURRENT record
   * (`statuses[key]` repeats the newest entry's reason/detail — the card chips,
   * the "Now" row and `vibespace-msg list` read it) when its reason OR its detail
   * still says what the cleared entry said, and a queued status-override notice that quotes it (it
   * would be injected into the agent's next turn). ONE save and ONE broadcast —
   * history itself is not in the broadcast; Session Properties refetches it on
   * every `session-status-updated`. Returns {cleared: [ats], already: [ats],
   * unknown: [ats], refused: [{at, code, why, status}]}.
   */
  clearHistory(key, ats, { by = 'owner', at = Date.now(), allow = null } = {}) {
    const out = { cleared: [], already: [], unknown: [], refused: [] };
    const arr = (this._state.history && this._state.history[key]) || [];
    const rec = this._state.statuses[key] || null;
    for (const want of new Set((Array.isArray(ats) ? ats : [ats]).map(Number))) {
      const hits = Number.isFinite(want) ? arr.filter((h) => h && Number(h.at) === want) : [];
      if (!hits.length) { out.unknown.push(want); continue; }
      let any = false, refused = null;
      for (const h of hits) {
        const v = allow ? allow(h) : { ok: true };
        if (!v || !v.ok) { refused = v || { code: 'not_yours' }; continue; }
        const oldReason = typeof h.reason === 'string' ? h.reason : '';
        const oldDetail = typeof h.detail === 'string' ? h.detail : '';
        const r = applyClear(h, { kind: 'status', by, at });
        if (!r.changed) continue;
        any = true;
        // the current record, when it still carries these words — its reason OR its detail
        // (verify r1: an entry set with `--detail` and no reason left the current record's
        // detail, the Session Properties "Now" row's expander, untouched)
        if (rec && ((oldReason && rec.reason === oldReason) || (oldDetail && rec.detail === oldDetail))) applyClear(rec, { kind: 'status', by, at });
        for (const n of (rec && Array.isArray(rec.pendingNotices) ? rec.pendingNotices : [])) {
          if (n && n.kind === 'status-override' && n.agent && oldReason && n.agent.reason === oldReason) n.agent.reason = CLEARED_TEXT;
        }
      }
      if (any) out.cleared.push(want);
      else if (refused) out.refused.push({ at: want, code: refused.code || 'not_yours', why: refused.why || '', status: refused.status || 403 });
      else out.already.push(want);
    }
    // ON DISK BEFORE THE OWNER IS TOLD (lane-redact verify r4, reproduced): `_save` here is a 500 ms debounce flushed on
    // SIGTERM only — a SIGKILL / OOM inside that window brought the reason back at the next boot after the route had
    // answered "cleared". A clear is one owner decision: ONE synchronous write (user-todos.js clearItems says the same).
    if (out.cleared.length) { this._save(); this.flush(); this._notify({ cleared: [{ key, ats: out.cleared.slice() }] }); }
    return out;
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
  // `replaceKind` (verify r1 A3/A6 of lane browser-stuck, 2026-09-28): a producer whose notices describe ONE present
  // state (a page dialog) keeps ONE pending notice per key — a page answered ten times in the live view queued ten
  // stale `browser-dialog` notices and the bound evicted the takeover notice the agent was owed (reproduced).
  pushNotice(key, notice, { replaceKind = false } = {}) {
    const n = notice && typeof notice === 'object' ? notice : null;
    if (!n || !NOTICE_RENDERERS[n.kind]) throw new Error(`pushNotice: unknown notice kind ${JSON.stringify(n && n.kind)} (one of ${Object.keys(NOTICE_RENDERERS).join('/')})`);
    const rec = this._state.statuses[key] || (this._state.statuses[key] = { state: null, urgency: null, reason: null, setBy: null, at: Date.now(), pendingNotices: [] });
    if (!Array.isArray(rec.pendingNotices)) rec.pendingNotices = [];
    if (replaceKind) rec.pendingNotices = rec.pendingNotices.filter((x) => !(x && x.kind === n.kind));
    // BOUNDED: a producer that fires faster than the user types must not grow
    // the record without limit; the newest notices are the ones that describe
    // the present, so the oldest go first.
    rec.pendingNotices.push({ ...n, at: Number(n.at) || Date.now() });
    if (rec.pendingNotices.length > MAX_NOTICES) rec.pendingNotices.splice(0, rec.pendingNotices.length - MAX_NOTICES);
    this._save(); this._notify();
    return rec.pendingNotices.length;
  }

  /** Withdraw the pending notices `pred` names (a notice about a state that ended before the agent's turn — a page dialog
   *  answered in the live view: its next verb says so instead). → how many went. */
  dropNotices(key, pred) {
    const rec = this._state.statuses[key];
    if (!rec || !Array.isArray(rec.pendingNotices) || !rec.pendingNotices.length || typeof pred !== 'function') return 0;
    const keep = rec.pendingNotices.filter((x) => { try { return !pred(x); } catch { return true; } });
    const n = rec.pendingNotices.length - keep.length;
    if (!n) return 0;
    rec.pendingNotices = keep;
    if (!keep.length && !rec.state && !rec.urgency && !rec.reason) delete this._state.statuses[key];
    this._save(); this._notify();
    return n;
  }

  /** What is queued for a key, without consuming it (a UI hint, a test). */
  pendingNotices(key) { return (this._state.statuses[key]?.pendingNotices || []).slice(); }

  // Pull (and clear) EVERY pending notice — called when the user sends their
  // next chat message; the caller renders each and appends them all.
  // `count` (channel-jump verify r7): consume only the OLDEST `count` — the injection takes the prefix that fits
  // whole under its cap and leaves the rest queued, so a notice is consumed exactly when it rides.
  consumeNotices(key, count = null) {
    const rec = this._state.statuses[key];
    if (!rec || !Array.isArray(rec.pendingNotices) || !rec.pendingNotices.length) return [];
    const n = count == null ? rec.pendingNotices.length : Math.max(0, Math.min(rec.pendingNotices.length, Math.floor(Number(count)) || 0));
    if (!n) return [];
    const list = rec.pendingNotices.slice(0, n);
    rec.pendingNotices = rec.pendingNotices.slice(n);
    if (!rec.pendingNotices.length && !rec.state && !rec.urgency && !rec.reason) delete this._state.statuses[key];
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
  // the owner's ruling (2026-09-27 — "告知agent发生了打断"): the takeover's zero-spend notice — what it interrupted, read at the agent's next turn
  'browser-takeover': (n) => require('./browser-takeover').renderTakeoverNotice(n),
  // lane browser-windows verify r5 ②: the user's drive of the browser ENDED — a `tab new` refused window_busy while he drove
  // can run now; free, at the agent's next turn (it was left to poll blindly before)
  'browser-window-free': (n) => require('./browser-windows').renderDriveEndedNotice(n),
  // lane browser-stuck (2026-09-28, rule 6): a page dialog opened while the agent ran no browser command — the ONE free
  // next-turn line (never a wake); its next verb says it again, by rule 2
  'browser-dialog': (n) => require('./browser-stuck').renderDialogNotice(n),
  // lane browser-propose (2026-09-30): an approved switch told for FREE — only when the ladder's stash could not take the
  // words (the proposal runner's one carrier otherwise); the words are browser-switch.approvedText's
  'browser-proposal': (n) => '<system-reminder>\n' + String((n && n.text) || '').slice(0, 1200) + '\n</system-reminder>',
  // lane hooks-create (2026-10-01): the registration that CREATED the hook file reached a session that started without
  // it — ONE free next-turn note (src/hooks-late.js); agent-routes drops it unread in any OTHER process (a resume)
  'hooks-late': (n) => require('./hooks-late').renderHooksLateNotice(n),
  // lane browser-resource-care (B-afeb): a Chrome this conversation started outside vibespace-browser (debugging port, no
  // keeper mark, under its process tree) — told once per launch burst, free, at its next turn; never killed
  'browser-own-chrome': (n) => require('./memory-pressure').renderOwnChromeNotice(n),
  // lane browser-admin 2a: the user's Change build… restarted a browser this conversation uses — the relaunch's own words
  // (browser-interrupt.relaunchText: what was interrupted, its tab reopened), free, at the agent's next turn
  'browser-relaunch': (n) => '<system-reminder>\n' + require('./browser-interrupt').relaunchText({ label: n && n.label, from: n && n.from, to: n && n.to, n: n && n.n, verbs: n && n.verbs, outcome: n && n.outcome }) + '\n</system-reminder>',
});

module.exports = { SessionStatusManager, NOTICE_KINDS: Object.keys(NOTICE_RENDERERS) };
