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
 *   deliveryReasonWords(line, {t})      a Delivery-log line's reason in a person's words (a held answer: one sentence, B-ef83 unit 2)
 *   memoryChip(job, t) · memoryEndWords(job, t) · memorySourceWords(job, t) · memoryWords(mb) · memoryFieldValue(job) ·
 *   memorySetValue(job, typed) · memoryCapWords(cap, t) · memoryEffectiveWords(job, t) · nodeHeapWords(job, t) · budgetWords(job, t) ·
 *   budgetRefusalPersonWords(budget, t, {create}) · runLeftWords(run, t)
 *                                       the memory bound's chip, its named end / park, where it comes from (lane jobs-memory-bound);
 *                                       what a run's job left running (round 5)
 *   publishBlockedNote(job, t)          a service's publish the Ports list refused (held; the port a person's), the card's words (r3228)
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

/** The states a ✓ / "Mark all seen" can acknowledge (the same predicate the panel's
 *  row-expand ping used since design §13 rule 1c): a terminal ONE-SHOT the user
 *  has not seen. A service, a running job, an archived record or an already
 *  acknowledged one is never in the batch (2.369.121, owner: 批量已读). */
export const ACKABLE_STATES = Object.freeze(['failed', 'missed', 'unverified', 'interrupted', 'done']);
export function isAckable(j) {
  return !!j && (j.kind || 'task') === 'task' && !j.archived && ACKABLE_STATES.includes(j.state) && !(j.ack && j.ack.acked);
}
/** The ids a batch acknowledgement would change — nothing else is sent. */
export function ackableIds(jobs) { return (jobs || []).filter(isAckable).map((j) => j.id); }

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

/** A FAMILY'S FOLD KEY carries no words (lane-redact verify r6): the fold map is persisted in the server's user state
 *  (`jobsPanelFolds`), broadcast to every client and exported with the config — a family is a job's NAME, and a
 *  "Clear content…" of the job never reached a key spelled with it. The key is a digest of the family (FNV-1a, 32 bit):
 *  stable across renders and devices, the same for every job of the family, no word in it. */
export function familyKey(family) {
  let h = 0x811c9dc5;
  const s = String(family || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'f:' + h.toString(16).padStart(8, '0');
}
/** A fold key this build writes: a session key (`s:<id>` / `w:<id>` / `manual`) or `<session key>|f:<8 hex>` — an older
 *  build's `<session key>|<family>` holds a job's name and is dropped at load (verify r6). */
export const isFoldKey = (k) => /^(?:s:[^|]*|w:[^|]*|manual)(?:\|f:[0-9a-f]{8})?$/.test(String(k));

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
      sess = { key: sessionKey, label, groups: new Map(), latestAt: 0, count: 0, running: 0, awaiting: 0, failedUnacked: 0, ackable: [] };
      sessions.set(sessionKey, sess);
    }
    const family = familyOf(j.name);
    const gkey = sessionKey + '|' + familyKey(family); // a digest, never the name (the fold map is persisted and broadcast)
    let g = sess.groups.get(gkey);
    if (!g) { g = { key: gkey, sessionKey, family, jobs: [], count: 0, running: 0, awaiting: 0, failedUnacked: 0, failedAcked: 0, latestAt: 0 }; sess.groups.set(gkey, g); }
    g.jobs.push(j); g.count++; sess.count++;
    if (RUNNING.has(j.state)) { g.running++; sess.running++; }
    const a = attentionOf(j);
    if (a === 'awaiting') { g.awaiting++; sess.awaiting++; } else if (a === 'unacked-failure') { g.failedUnacked++; sess.failedUnacked++; } else if (a === 'acked-failure') g.failedAcked++;
    if (isAckable(j)) sess.ackable.push(j.id); // the session header's "Mark all seen" batch (2.369.121)
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
    // SESSION FOLD (2.369.121, owner: 按会话折叠): a whole session's rows fold
    // behind its header; expanded by default (today's look), the user's
    // persisted choice keyed by the session key applies after.
    const expandedSess = Object.prototype.hasOwnProperty.call(expanded || {}, sess.key) ? !!expanded[sess.key] : true;
    out.push({ key: sess.key, label: sess.label, groups, latestAt: sess.latestAt, count: sess.count, running: sess.running, awaiting: sess.awaiting, failedUnacked: sess.failedUnacked, ackable: sess.ackable, expanded: expandedSess, defaultExpanded: true });
  }
  return { sessions: out, groups: flat };
}

/** The persisted fold map must not outlive its groups: keep only the keys
 *  the current layout still holds (a stale key would grow user state without
 *  bound). Returns a NEW object. */
export function pruneFolds(folds, layout) {
  const live = new Set([...(layout && layout.groups || []).map((g) => g.key), ...(layout && layout.sessions || []).map((s) => s.key)]); // group keys AND session keys (2.369.121)
  const out = {};
  for (const [k, v] of Object.entries(folds || {})) if (live.has(k)) out[k] = !!v;
  return out;
}

/** The held-notification sentence (5b ①): STRUCTURE in, the device's own
 *  words out. `digest` = the server's heldDigest ({total, byConversation});
 *  `cid` narrows it to one conversation (the chat status-bar chip). */
/** B-ef83 unit 2 (c) (主开发 r4606): a Delivery-log line's reason in a PERSON's words — a held answer (its journal line carries the
 *  verdict's code `heldWhy`, the agent-facing reason keeps it) reads the sentence, en / zh / ja by the device's own t(); else the
 *  line's own reason as before. → string */
export function deliveryReasonWords(line, { t } = {}) {
  const tr = typeof t === 'function' ? t : (s) => String(s);
  if (!line) return '';
  if (line.heldWhy) return tr('Not woken yet — VibeSpace could not judge its spending limits just now; it asks again once that clears');
  return line.reason ? String(line.reason) : '';
}
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
    const scope = reason && reason.capUnset === true ? tr('no limit is set for turns nobody typed — set a number')   // B-0a33 (3)
      : reason && reason.why === 'day-cap' ? tr('{who}’s daily ceiling{cap} reached', { who, cap: cap != null ? ` (${cap})` : '' })
      : reason && reason.why === 'instance-cap' ? tr('the instance ceiling{cap} reached', { cap: cap != null ? ` (${cap})` : '' })
      : tr('{who}’s hourly ceiling{cap} reached', { who, cap: cap != null ? ` (${cap})` : '' });
    why = scope + '; ' + tr('delivered with the conversation’s next prompt') + ' · ' + tr('Settings → Spending');
  } else if (kind === 'rate-floor') why = tr('the 30 s per-conversation floor is pacing them; delivered with the conversation’s next prompt');
  else if (kind === 'off') why = tr('auto-notify is off for this conversation');
  else if (kind === 'wrapper-no-steer') why = tr('this session’s agent predates notification steering, so a delivery now would queue a billed turn; delivered with the conversation’s next prompt') + ' · ' + tr('Restart this session to receive notifications without a billed turn');
  else if (kind === 'not-running') why = tr('the conversation was not running; delivered when it next resumes');
  else if (kind === 'machine-away') why = tr('the machine this conversation runs on cannot be reached; delivered when it replies');   // B-2566's remainder
  else if (kind === 'machine-unpaired') why = tr('its machine was unpaired while these waited; open the conversation to read them');   // r1277 (6): never «when it replies»; r1397 (6): true once paired again
  else if (kind === 'groups-unread') why = tr("VibeSpace cannot read its Task Groups right now — these wait for the Task Groups store; judged at the conversation’s next turn once it reads");   // THE STORE HELD UNREAD (lane bl-windows): its own words on the strip
  else if (kind === 'retrying') why = tr('the agent did not accept it at once; posted again when its turn ends');
  else if (kind === 'not-reachable') why = tr('the agent did not accept it (busy or unreachable); delivered with the conversation’s next prompt or a hand-over');
  else why = tr('the conversation has no live inbox right now; delivered when it next resumes');
  return `${head} — ${why}`;
}

// ── THE MEMORY BOUND (lane jobs-memory-bound, F6 of B-7f9e) — the card's words over the snapshot's facts: memoryMb (THE
// LADDER's answer for the next run) · memoryBound (the rung the latest run measured: {mb, by, why}) · run.cause (oom-bound /
// oom) · parkedFor. `t` is the device's translator, handed in (PURE). A size reads the same in every language.
export function memoryWords(mb) {
  const n = Math.max(0, Math.floor(Number(mb) || 0));
  return n < 1024 ? `${n} MB` : `${Math.round((n / 1024) * 10) / 10} GB`;
}
const runsNow = (j) => j.state === 'up' || j.state === 'starting' || j.state === 'awaiting-user'; // the run's own bound is the one in force
/** r3228 (round whu7689zw): a service's publish the Ports list REFUSED, in the card's words — the list held (unread: published by
 *  itself when it reads), or the port's row a person's (never taken) — '' otherwise. The card draws it (src/lib/jobs-panel.js). */
export function publishBlockedNote(j, t) {
  // B-73c4: its public address is still up (the relay's removal not confirmed) — kept in Ports, where a person retries it; never an agent's to remove
  if (j && j.publishStillUp && !j.publishedUrl) return t('Its public address is still up — it is kept in Ports until the relay confirms its removal.');
  if (!j || !j.publish || j.publishedUrl) return '';
  if (j.publishState === 'held') return t('Not published yet: the list of forwards could not be read. It is published by itself when it reads.');
  if (j.publishState === 'refused' && j.publishRefusal === 'another-service') return t('Not published: port {port} is forwarded for another service that is still running. Stop that one, or give this service another port.', { port: (j.ports || [])[0] });   // r3287: the row is another live service's
  if (j.publishState === 'refused') return t('Not published: port {port} is already forwarded by hand in the Ports panel. Publish it there, or remove that forward and start the service again.', { port: (j.ports || [])[0] });
  return '';
}
/** «4 GB · cgroup» / «4 GB · rlimit» / «unbounded — this host cannot enforce a bound» — '' from a hub that says nothing; a
 *  bound a limit lowered says so (round 3), and WHICH limit (round 4 — the one that contains the job): «6 GB · rlimit · capped
 *  by the instance’s 8 GB limit» · «24 GB · cgroup · capped by the user slice’s 32 GB limit». A live run's are its own proof's. */
/** B-2c5c (4c), 主开发 r4564: a job that runs VibeSpace itself says what its memory bound does to VibeSpace — TRUE TO THE RUNG its latest
 *  run's bound record names (`memoryBound` {by, why}: a scope stopped whole only on the cgroup rung with OOMPolicy=stop; ONE process
 *  in a scope without it; each process's own limit on RLIMIT_DATA); the soft sentence when no record says; '' for none */
export function hubBoundNote(j, t, compact = false) {
  if (!j || !j.runsHub) return '';
  const b = j.memoryBound;
  // r4673: THE RUNG LAW's twin of src/job-model.js boundRungOf (this module imports nothing) — one law, held by test-hub-handed-drop ③'s
  // parity leg (the same records fed to both); a record with no finite size is 'unknown' in both
  const sized = !!b && typeof b.mb === 'number' && Number.isFinite(b.mb) && b.mb >= 1;   // = job-model's finiteMb(mb) > 0 (it floors)
  const rung = !b ? 'unknown' : (b.by === 'none' || b.mb === 0) ? 'none' : !sized ? 'unknown' : b.by === 'cgroup' ? (/OOMPolicy=stop/.test(String(b.why || '')) ? 'whole' : 'process') : b.by === 'rlimit-data' ? 'own' : 'unknown';
  if (rung === 'none') return '';
  if (compact) return rung === 'whole' ? t('Runs VibeSpace: its memory bound ends it whole.') : t('Runs VibeSpace: its memory bound can end it.');
  if (rung === 'whole') return t('This job runs VibeSpace itself: when VibeSpace and its conversations pass this memory bound, they all end together.');
  if (rung === 'process') return t('This job runs VibeSpace itself: past this memory bound the kernel stops one of its processes, which can be VibeSpace or a conversation.');
  if (rung === 'own') return t('This job runs VibeSpace itself: each of its processes has this memory bound as its own limit, and one that passes it gets no more memory — VibeSpace too.');
  return t('This job runs VibeSpace itself: its memory bound can end VibeSpace and the conversations it started.');
}
export function memoryChip(j, t) {
  if (!j || j.memoryMb === undefined || j.memoryMb === null) return '';
  const b = j.memoryBound, live = !!(b && b.mb && runsNow(j));
  if (!j.memoryMb && !live) return t('unbounded — set by the owner');
  if (b && b.by === 'none' && b.mb) return t('unbounded — this host cannot enforce a bound');
  if (b && b.by === 'cgroup' && !b.mb && runsNow(j)) return t('unbounded (the owner set 0) · in its own scope'); // round 5: never «0 MB · cgroup»
  const mb = live ? b.mb : j.memoryMb, cap = live ? b.cap : j.memoryCap;
  const capped = cap && cap.limitMb ? ` · ${memoryCapWords(cap, t)}` : '';
  return (b && b.by !== 'none' ? `${memoryWords(mb)} · ${b.by === 'cgroup' ? 'cgroup' : 'rlimit'}` : memoryWords(mb)) + capped;
}
/** the limit that lowered a bound, named (round 4): the instance (a container's own root), the user slice, or a cgroup by its
 *  name (the hub's own unit …) */
export function memoryCapWords(cap, t) {
  const size = memoryWords(cap && cap.limitMb), of = cap && cap.of;
  if (!of || of === 'instance') return t('capped by the instance’s {size} limit', { size });
  return of === 'user slice' ? t('capped by the user slice’s {size} limit', { size }) : t('capped by {name}’s {size} limit', { name: of, size });
}
/** BESIDE the properties field, read-only (round 4): the bound the next run gets and the limit that lowered the stored one —
 *  «effective 6 GB · the instance’s limit 8 GB»; '' when nothing lowers it (the field itself always shows what is STORED) */
export function memoryEffectiveWords(j, t) {
  const c = j && j.memoryCap;
  if (!c || !c.limitMb) return '';
  const size = memoryWords(c.limitMb);
  const lim = !c.of || c.of === 'instance' ? t('the instance’s limit {size}', { size }) : c.of === 'user slice' ? t('the user slice’s limit {size}', { size }) : t('{name}’s limit {size}', { name: c.of, size });
  return `${t('effective {size}', { size: memoryWords(j.memoryMb) })} · ${lim}`;
}
/** B-d73c: THE HEAP A JOB'S NODE GETS, beside the Memory bound (the snapshot's `nodeHeap`, src/job-model.js nodeHeapOf): a job
 *  that names its memory gives Node 75% of it; its own NODE_OPTIONS naming a heap win; a job that names none keeps Node's own
 *  default — said, with the door that changes it (this very field). '' when unbounded or from an older hub */
export function nodeHeapWords(j, t) {
  const h = j && j.nodeHeap;
  if (!h || !h.mb) return '';
  const size = memoryWords(h.mb);
  if (h.by === 'own') return t('If this job runs a Node program, its heap is {size} — set by the job’s own options', { size });
  if (h.by === 'bound') return t('If this job runs a Node program, its heap is {size} — 75% of the job’s bound', { size });
  if (h.by === 'node-default') return t('If this job runs a Node program, Node’s own default heap under this bound is about {size} — set the memory bound here to give it 75% of the bound', { size });
  return '';
}
/** B-b14a: THE BUDGET'S FACT beside the Memory bound and on the chip's title (the snapshot's `memoryBudget`: numbers only — a
 *  viewer may see none of the holders): the instance's budget for running jobs and what they use, or that it is not judged
 *  right now; '' on a machine with no limit (nothing changes there) */
export function budgetWords(j, t) {
  const b = j && j.memoryBudget;
  if (!b || !b.budgetMb) return '';
  if (b.unmeasured) return t('The instance’s memory budget for jobs: {budget} — not judged right now: the memory of {n} running job(s) could not be read', { budget: memoryWords(b.budgetMb), n: b.unmeasured });
  const fact = t('The instance’s memory budget for jobs: {budget} — {used} in use by {n} running job(s)', { budget: memoryWords(b.budgetMb), used: memoryWords(b.usedMb || 0), n: b.running || 0 });
  return b.askHalf ? `${fact} · ${t('This job names no memory: its start is judged at {ask}, half the budget', { ask: memoryWords(b.askMb) })}` : fact;   // r924: what this job's start is judged with
}
/** B-b14a: THE PERSON'S REFUSAL — a press of Start / Restart, or a create — every holder by name (the person sees every job),
 *  this job's bound and the recipe; `create`: nothing was created */
export function budgetRefusalPersonWords(b, t, { create = false } = {}) {
  const hs = Array.isArray(b && b.holders) ? b.holders : [];
  const holders = hs.slice(0, 4).map((h) => `${String(h.name || h.id).slice(0, 40)} ${memoryWords(h.mb)}`).join(', ') + (hs.length > 4 ? ', …' : '');   // each name bounded like the agent's (round wh9e7xe8i)
  const p = { budget: memoryWords(b.budgetMb), used: memoryWords(b.usedMb), n: hs.length, holders, asked: memoryWords(b.askedMb), room: memoryWords(b.roomMb) };
  const half = b.halved ? ' ' + t('This job names no memory: its start is judged at {ask}, half the budget — it would run under {bound}.', { ask: memoryWords(b.askedMb), bound: memoryWords(b.boundMb) }) : '';   // r924: what it was judged with
  if (create) return (b.roomMb >= 256 ? t('Not created: the instance’s memory budget for jobs is {budget}, and {used} of it is in use by {n} running job(s) ({holders}); this job asks {asked}. Stop one of them, or give this job a memory bound of {room} or less.', p) : t('Not created: the instance’s memory budget for jobs is {budget}, and {used} of it is in use by {n} running job(s) ({holders}); this job asks {asked}. Stop one of them first.', p)) + half;
  return (b.roomMb >= 256 ? t('Not started: the instance’s memory budget for jobs is {budget}, and {used} of it is in use by {n} running job(s) ({holders}); this job asks {asked}. Stop one of them, or lower this job’s memory bound to {room} or less.', p) : t('Not started: the instance’s memory budget for jobs is {budget}, and {used} of it is in use by {n} running job(s) ({holders}); this job asks {asked}. Stop one of them first.', p)) + half;
}
/** WHAT A RUN'S JOB LEFT RUNNING (round 5 — the ruling of 2026-10-27: a job's scope IS the job): a task's were stopped (by
 *  force past the grace), a service's kept while it runs — «left 1 running — stopped; to keep a daemon, run it as a service
 *  job»; round 6: what the engine stopped later says when (`cleared` — this device's clock: «left 1 running — stopped at
 *  14:05», never «kept» once they are gone), and a task's processes that left its group are said, not stopped — unless a STOP ended
 *  them (B-7ca1: `outside`, «· 1 of them outside its group»); '' when it left
 *  nothing */
export function runLeftWords(run, t, stamp = null) {
  const l = run && run.left;
  if (!l || !(l.n > 0 || l.escaped > 0)) return '';
  // the instant in the page's one format (the panel hands in page-time's stampAt — this module imports nothing); the fallback
  // is for a PURE caller with no page
  // page-time: a PURE module's fallback when no stamp is handed in
  const hhmm = typeof stamp === 'function' ? stamp : (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const sh = l.short > 0 ? ` · ${t('{n} got less than the full grace', { n: l.short })}` : ''; // round 8: first seen after the stop
  if (l.cleared) return t('left {n} running — stopped at {time}', { n: l.n, time: hhmm(l.cleared) }) + sh;
  if (l.gone) return t('left {n} running — had already ended by {time}', { n: l.n, time: hhmm(l.gone) }); // round 7: nothing was stopped
  if (l.kept) return t('left {n} running — kept: the service’s until it stops or starts again', { n: l.n });
  const esc = l.escaped > 0 ? t('{n} left its group — not stopped; run it as a service job', { n: l.escaped }) : '';
  if (!(l.n > 0)) return esc;
  // round 7: the advice once — beside what left its group, the stopped ones are said plain
  const out = l.outside > 0 ? ` · ${t('{n} of them outside its group', { n: l.outside })}` : '';   // B-7ca1: a task's stop ended what left its group too
  if (esc) return `${l.force ? t('left {n} running — stopped by force', { n: l.n }) : t('left {n} running — stopped', { n: l.n })}${out}${sh} · ${esc}`;
  return (l.force ? t('left {n} running — stopped by force; to keep a daemon, run it as a service job', { n: l.n }) : t('left {n} running — stopped; to keep a daemon, run it as a service job', { n: l.n })) + out + sh;
}
/** the NAMED end the card says beside the state — the park first (it is why the job no longer runs) */
export function memoryEndWords(j, t) {
  if (!j) return '';
  if (j.parkedFor === 'memory') return t('parked: out of memory twice — raise its bound or fix the job');
  const c = j.run && j.run.cause;
  if (c === 'oom-bound') return t('stopped: used more than {size}', { size: memoryWords((j.memoryBound && j.memoryBound.mb) || j.run.memoryMb || j.memoryMb) });
  if (c === 'oom') return t('killed: the instance ran out of memory');
  return '';
}
/** the properties field: the job's OWN stored bound EXACTLY (acceptance round 2 — a rounded 0.1 GB written back changed it):
 *  a whole GB as «4G», anything else in MB («1536M», «1000M»), «0» = unbounded; '' when the job has none (the ladder's). The
 *  STORED value — the asked one — never the effective bound a cap lowered it to (round 4: a stored 16G showed «6G», a stored 0
 *  «6G», and typing 6G wrote nothing); the effective one stands beside it (memoryEffectiveWords) */
export function memoryFieldValue(j) {
  if (!j || j.memorySource !== 'job') return '';
  const mb = Math.max(0, Math.floor(Number(j.memoryAskedMb ?? j.memoryMb) || 0));
  return !mb ? '0' : mb % 1024 === 0 ? `${mb / 1024}G` : `${mb}M`;
}
/** Set: what to write — null when the field still says what is STORED (nothing changes, nothing is written — compared with
 *  the stored value only, never the effective one); '' = back to the ladder (`inherit`) */
export function memorySetValue(j, typed) {
  const v = String(typed == null ? '' : typed).trim();
  return v === memoryFieldValue(j) ? null : (v || 'inherit');
}
/** where the bound comes from, for the properties row */
export function memorySourceWords(j, t) {
  const s = j && j.memorySource;
  return s === 'job' ? t('its own') : s === 'setting' ? t('your setting') : s === 'cluster' ? t('the cluster’s default') : t('the default');
}
