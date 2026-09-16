/**
 * jobs-layout.js — PURE (imports nothing, DOM-free): the Background Work
 * panel's TRIAGE arithmetic (docs/design-background-work.md §13, owner-
 * approved 2026-09-14). Like user-todos-layout.js, every decision the panel
 * used to make inline — twice, in two copies — lives here once:
 *
 *   attentionOf(job)                    'awaiting' | 'unacked-failure' | 'acked-failure' | null
 *   badgeCounts(jobs)                   the ONE counter the rail badge + both summaries read
 *   badgeText(counts)                   {text, tone} for the rail badge
 *   familyOf(name)                      the NAME FAMILY rule (a pure string function with a table test)
 *   foldTasks(tasks, {expanded, sessionNames})  owner session → name family → rows
 *   pruneFolds(folds, layout)           the persisted fold map, minus keys no group holds
 *   heldText(digest, {t})               the held-notification sentence, words by the device's own t()
 *
 * The client READS `job.ack` (the server computes it over the full record —
 * the snapshot's journal is truncated) and never derives acknowledgement.
 */

const ATTENTION_FAILED = new Set(['failed', 'missed', 'unverified']);
const RUNNING = new Set(['up', 'starting']);

/** What the badge counts a snapshot as. A parked SERVICE (state failed) can
 *  never be acknowledged — it needs a start — so it stays an unacked failure. */
export function attentionOf(j) {
  if (!j) return null;
  if (j.state === 'awaiting-user') return 'awaiting';
  if (!ATTENTION_FAILED.has(j.state)) return null;
  if ((j.kind || 'task') !== 'task') return 'unacked-failure';
  return j.ack && j.ack.acked ? 'acked-failure' : 'unacked-failure';
}

/** THE counter (rule 2): attention = awaiting-user + UNACKNOWLEDGED failures
 *  (red); acknowledged failures are a grey count; running is the calm number. */
export function badgeCounts(jobs) {
  const c = { attention: 0, awaiting: 0, unackedFailed: 0, ackedFailed: 0, failed: 0, running: 0, total: 0 };
  for (const j of jobs || []) {
    c.total++;
    if (RUNNING.has(j.state)) c.running++;
    const a = attentionOf(j);
    if (a === 'awaiting') c.awaiting++;
    else if (a === 'unacked-failure') c.unackedFailed++;
    else if (a === 'acked-failure') c.ackedFailed++;
  }
  c.failed = c.unackedFailed + c.ackedFailed;
  c.attention = c.awaiting + c.unackedFailed;
  return c;
}

/** The rail badge: red `N!` while anything is unacknowledged, amber `N?`
 *  while somebody is awaited, else the running count, else nothing. */
export function badgeText(c) {
  if (!c) return { text: '', tone: null };
  if (c.unackedFailed > 0) return { text: c.attention + '!', tone: 'danger' };
  if (c.awaiting > 0) return { text: c.awaiting + '?', tone: 'warn' };
  return { text: c.running ? String(c.running) : '', tone: null };
}

// ── the NAME FAMILY rule (rule 3) ────────────────────────────────────────
// Strip, until nothing changes: a trailing ` run` (the cron child's name),
// `-r<n>`, `-v<n>[.n…]`, `-<n>[.n…]` and a bare version tail `-<n>.<n>…`.
// A name that would strip to nothing keeps its original spelling.
const FAMILY_TAILS = [/\s+run$/i, /-r\d+$/i, /-v\d+(?:\.\d+)*$/i, /-\d+(?:\.\d+)*$/];
export function familyOf(name) {
  const orig = String(name || '').trim();
  let s = orig;
  for (let i = 0; i < 8; i++) {
    let next = s;
    for (const re of FAMILY_TAILS) next = next.replace(re, '');
    next = next.trim();
    if (next === s) break;
    s = next;
  }
  return s || orig;
}

const latestAt = (j) => Number((j.run && (j.run.endedAt || j.run.startedAt)) || j.createdAt || 0);
const shortId = (s) => String(s).slice(0, 8);

/** Rule 3. `tasks` = the one-shot snapshots (kind task) in API order;
 *  `expanded` = the user's persisted fold map {groupKey: bool}, applied AFTER
 *  the defaults; `sessionNames` = {conversationId|sessionId → display name}
 *  from the sidebar's own session map. Returns
 *  { sessions: [{key, label:{kind:'name'|'short'|'manual', text}, groups:[…]}], groups: [flat] }
 *  where a group is {key, sessionKey, family, jobs, count, running, awaiting,
 *  failedUnacked, failedAcked, latestAt, defaultExpanded, expanded}. */
export function foldTasks(tasks, { expanded = {}, sessionNames = {} } = {}) {
  const sessions = new Map();
  for (const j of tasks || []) {
    const os = j.ownerSession || {};
    const cid = os.conversationId || null, sid = os.sessionId || null;
    const sessionKey = cid ? 's:' + cid : sid ? 'w:' + sid : 'manual';
    let sess = sessions.get(sessionKey);
    if (!sess) {
      const named = (cid && sessionNames[cid]) || (sid && sessionNames[sid]) || null;
      const label = named ? { kind: 'name', text: String(named) } : cid || sid ? { kind: 'short', text: shortId(cid || sid) } : { kind: 'manual', text: 'manual' };
      sess = { key: sessionKey, label, groups: new Map(), latestAt: 0 };
      sessions.set(sessionKey, sess);
    }
    const family = familyOf(j.name);
    const gkey = sessionKey + '|' + family;
    let g = sess.groups.get(gkey);
    if (!g) { g = { key: gkey, sessionKey, family, jobs: [], count: 0, running: 0, awaiting: 0, failedUnacked: 0, failedAcked: 0, latestAt: 0 }; sess.groups.set(gkey, g); }
    g.jobs.push(j); g.count++;
    if (RUNNING.has(j.state)) g.running++;
    const a = attentionOf(j);
    if (a === 'awaiting') g.awaiting++; else if (a === 'unacked-failure') g.failedUnacked++; else if (a === 'acked-failure') g.failedAcked++;
    const at = latestAt(j);
    if (at > g.latestAt) g.latestAt = at;
    if (at > sess.latestAt) sess.latestAt = at;
  }
  const out = [];
  const flat = [];
  for (const sess of [...sessions.values()].sort((a, b) => b.latestAt - a.latestAt)) {
    const groups = [...sess.groups.values()].sort((a, b) => b.latestAt - a.latestAt);
    for (const g of groups) {
      g.defaultExpanded = g.running > 0 || g.awaiting > 0 || g.failedUnacked > 0;
      g.expanded = Object.prototype.hasOwnProperty.call(expanded || {}, g.key) ? !!expanded[g.key] : g.defaultExpanded;
      flat.push(g);
    }
    out.push({ key: sess.key, label: sess.label, groups, latestAt: sess.latestAt });
  }
  return { sessions: out, groups: flat };
}

/** The persisted fold map must not outlive its groups: keep only the keys
 *  the current layout still holds (a stale key would grow user state without
 *  bound). Returns a NEW object. */
export function pruneFolds(folds, layout) {
  const live = new Set((layout && layout.groups || []).map((g) => g.key));
  const out = {};
  for (const [k, v] of Object.entries(folds || {})) if (live.has(k)) out[k] = !!v;
  return out;
}

/** The held-notification sentence (5b ①): STRUCTURE in, the device's own
 *  words out. `digest` = the server's heldDigest ({total, byConversation});
 *  `cid` narrows it to one conversation (the chat status-bar chip). */
export function heldText(digest, { t, cid = null } = {}) {
  const tr = typeof t === 'function' ? t : (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p && p[k] !== undefined ? p[k] : `{${k}}`));
  if (!digest) return '';
  let count = 0, reason = null;
  if (cid) { const e = digest.byConversation && digest.byConversation[cid]; if (!e) return ''; count = e.count; reason = e.reason; }
  else {
    count = Number(digest.total) || 0;
    // the most common kind across conversations names the sentence
    const tally = {};
    for (const e of Object.values(digest.byConversation || {})) for (const [k, n] of Object.entries(e.kinds || {})) tally[k] = (tally[k] || 0) + n;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    if (top) reason = Object.values(digest.byConversation || {}).map((e) => e.reason).find((r) => r && r.kind === top[0]) || { kind: top[0] };
  }
  if (!count) return '';
  const head = count === 1 ? tr('1 notification held') : tr('{n} notifications held', { n: count });
  const kind = (reason && reason.kind) || 'not-reachable';
  let why;
  if (kind === 'spend-cap') {
    const who = (reason && reason.identity) || tr('this account');
    const cap = reason && reason.cap != null ? reason.cap : null;
    const scope = reason && reason.why === 'day-cap' ? tr('{who}’s daily ceiling{cap} reached', { who, cap: cap != null ? ` (${cap})` : '' })
      : reason && reason.why === 'instance-cap' ? tr('the instance ceiling{cap} reached', { cap: cap != null ? ` (${cap})` : '' })
      : tr('{who}’s hourly ceiling{cap} reached', { who, cap: cap != null ? ` (${cap})` : '' });
    why = scope + '; ' + tr('delivered with the conversation’s next prompt') + ' · ' + tr('Settings → Spending');
  } else if (kind === 'rate-floor') why = tr('the 30 s per-conversation floor is pacing them; delivered with the conversation’s next prompt');
  else if (kind === 'off') why = tr('auto-notify is off for this conversation');
  else why = tr('the conversation has no live inbox right now; delivered when it next resumes');
  return `${head} — ${why}`;
}
