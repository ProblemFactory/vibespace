// Background Work wiring (2.342.0, docs/design-background-work.md).
// create(deps) factory: constructs the JobManager, exposes the user-facing
// REST surface (cookie-authed — the panel), and the deferred init/shutdown
// hooks server.js calls. Engine failure NEVER blocks boot (§5).
'use strict';
const WO = require('../write-origin.js');   // piece 7: the person's door for the grant (the strict page verdict)
/** a PERSON on THIS instance's own page: no bearer of any kind, and a browser that says it is on this page (src/routes/vault.js
 *  personVerdict's rule — a browser-less local write is no person here) */
const personHere = (req) => { const h = (req && req.headers) || {}; if (WO.pressBearer(h) || typeof (req.body && req.body.token) === 'string') return false; return WO.pageVerdict(h, WO.ownOriginOf(h, { encrypted: !!(req.socket && req.socket.encrypted) })).ok === true; };
const { JobManager } = require('../jobs.js');
const M = require('../job-model.js');
const SFW = require('../settings-file-words.js'); // B-8dcf item two (PURE): loaded with the module, never on a catch-up's pass (batch 21's cure)

// B-323e (lane bl-keys-misc, 主开发 r1351 (1)): THE JOBS LIST'S «outside the registry» rows (`systemctl --user list-units`,
// `crontab -l`) were two direct starts from the hub's main process at EVERY render of the Jobs list — every `jobs-updated`
// broadcast (every job change, unthrottled) while the sidebar's Jobs tab or a Background Work window is open, and every 30 s
// per open window. Now they ride the hub's starter (src/server/child-starter.js) and ONE answer stands ESCAPES_FRESH_MS for
// every page and every render; a read in flight is shared — a render, a page, a broadcast starts nothing of its own.
// r1381 (3): A NO-REPLY IS NEVER KEPT AS A REPLY — a read the starter did not answer (no answer, its bound, past ESCAPES_MAX) says so
// (`unread`: the page says «could not be read just now») and stamps nothing: the next read asks again. A PERSON'S REFRESH asks once,
// fresh (`fresh`), past the 30 s; a read in flight answers every ask. ESCAPES_MAX bounds what the loop parses of either answer.
const ESCAPES_FRESH_MS = 30000;
const ESCAPES_MAX = 256 * 1024;
// B-323e follow (主开发 r2030 (3c)): A NO-REPLY BACKS OFF — after a read with an unread part, no new read for ESCAPES_NO_REPLY_MS,
// doubled at each such read in a row up to ESCAPES_NO_REPLY_MAX_MS (a person's Refresh still reads at once); an unread part is
// served from the LAST read that answered it (`keptAt`: when), so the page keeps the list it had and says it was not read now
const ESCAPES_NO_REPLY_MS = 5000;
const ESCAPES_NO_REPLY_MAX_MS = 5 * 60 * 1000;
const ESCAPES_SYSTEMD = ['--user', 'list-units', '--type=service,timer', '--state=running,active', '--no-legend', '--plain'];
function escapesReader({ starter = () => require('./child-starter').childStarter(), now = () => Date.now(), freshMs = ESCAPES_FRESH_MS } = {}) {
  let last = null;   // { at (0 while in flight), p }
  let back = null;   // { at, waitMs, r } — the last read with an unread part (r2030): the next one waits
  const good = { systemd: null, crontab: null };   // part → { list, at }: the last read that ANSWERED it
  const keptOf = (r) => {
    if (!r.unread) return r;
    const out = { ...r }, at = [];
    for (const k of r.unread) if (good[k]) { out[k] = good[k].list; at.push(good[k].at); }
    return at.length ? { ...out, keptAt: Math.min(...at) } : out;
  };
  return function read({ fresh = false } = {}) {
    if (last && last.at === 0) return last.p;
    if (!fresh && last && now() - last.at < freshMs) return last.p;
    if (!fresh && back && now() - back.at < back.waitMs) return Promise.resolve(back.r);   // waiting after a no-reply: what was served then
    const one = last = { at: 0, p: null };
    const ask = (bin, args) => Promise.resolve().then(() => starter().run(bin, args, { timeoutMs: 5000, maxBuffer: ESCAPES_MAX, capture: true, envAdd: {} })).catch(() => null);
    const said = (r) => (!r || r.unknown || r.timedOut || r.overflow ? null : r.started === false ? '' : r.code === 0 ? String(r.stdout || '') : '');   // null = no reply; '' = none (no program, no crontab)
    one.p = (async () => {
      const out = { systemd: [], crontab: [] }, unread = [];
      const a = said(await ask('systemctl', ESCAPES_SYSTEMD));
      if (a === null) unread.push('systemd'); else out.systemd = a.split('\n').filter((l) => l.trim() && !/^(vibespace|dbus|pipewire|wireplumber|gvfs|xdg|gnome|tracker|at-spi|pulse)/.test(l.trim())).map((l) => l.trim().split(/\s+/)[0]).slice(0, 40);
      const b = said(await ask('crontab', ['-l']));
      if (b === null) unread.push('crontab'); else out.crontab = b.split('\n').filter((l) => l.trim() && !l.startsWith('#')).slice(0, 40);
      for (const k of ['systemd', 'crontab']) if (!unread.includes(k)) good[k] = { list: out[k], at: now() };
      return unread.length ? keptOf({ ...out, unread }) : out;
    })().catch(() => keptOf({ systemd: [], crontab: [], unread: ['systemd', 'crontab'] }));   // r2030 (3c): the read never rejects
    one.p.then((r) => {
      if (r.unread) { if (last === one) last = null; back = { at: now(), waitMs: Math.min(back ? back.waitMs * 2 : ESCAPES_NO_REPLY_MS, ESCAPES_NO_REPLY_MAX_MS), r }; }
      else { one.at = now(); back = null; }
    }).catch(() => { });
    return one.p;
  };
}

function create({ app, dataDir, broadcastAll, userTodos, log, serverSetting, taskGroups, activeSessions, deliver, getTelemetry = () => null, onStash = () => {}, onRunEnded = () => {}, sessionStatusKey = null }) {
  // THE FILER'S KEY (lane job-notify-user r5): this file is origin 'jobs''s one filer (src/inbox-origin.js FIELDS_FILERS) —
  // the store names it by its frame, and the key it hands here rides every filing (a caller with no frame needs it)
  let forYouKey = null;
  const heldAway = new Map();   // B-2566 follow-up (2): ONE deferred away-failure filing a (owner, job, copy) while For you is held
  try { forYouKey = userTodos && typeof userTodos.filerKey === 'function' ? userTodos.filerKey('jobs') : null; } catch (e) { log('[jobs] the For-you store handed this wiring no key of its filer —', e.message); }
  const jm = new JobManager({
    dataDir,
    onService: (job) => require('./artifact-registry.js').noteService(job), // lane artifacts-services: a job that listens ⇒ its conversation's `service` row + card
    onRunEnded: (job, run) => onRunEnded(job, run), // lane jobs-browser: a run's end releases its browser lease (the keeper's releaseJob)
    onStash: (cid) => onStash(cid), // every stash write / drain — the conversation's `stash` session fact follows (the strip above its composer)
    // every jobs-updated carries the HELD digest (5b ①): one dirty signal, one
    // computation — the rail badge, the panel summary and every chat window's
    // status-bar chip read it off the same frame (`jm` is bound lazily: the
    // constructor never broadcasts)
    broadcast: (type, payload) => broadcastAll({ type, ...payload, held: jm.heldDigest() }),
    notifyUser: function notifyUser({ words = null, text, detail, fact = null, urgency, jobId, jobName, ownerCid, renewOnly = false }) {
      // ATTRIBUTION = the AGENT CONVERSATION that owns the job (owner verdict
      // 2.357.0: an ask hanging off a background-task entity is 反直觉 — the
      // user thinks in terms of the agent they were talking to, and 2.348.1's
      // job-name attribution still read as a phantom). Resolve ownerCid → the
      // live session so the item groups under that session in the inbox;
      // jobId still opens the answer surface directly. Dead/absent owner
      // falls back to the job-name attribution under the 'jobs' key.
      try {
        // canonical inbox key = sessionStatusKey's backend:cid form, so the
        // item lands in the SAME group as the owner conversation's own asks
        // (works for a live OR stopped owner — discovery still resolves it).
        // Owner backend isn't recorded on the job; 'claude' matches the key
        // fn's default (a codex-owned job falls back to the jobs bucket via
        // nameFor's sessionName). No cid (user-created job) → 'jobs' bucket.
        const sessKey = ownerCid ? `claude:${ownerCid}` : 'jobs';
        // B-2566: a RENEWAL (an away failure's later count) re-files only while its item is OPEN — an item a person closed this episode
        // stays closed (kept: no refusal, no journal line); with no item at all (a first filing For you refused) it is filed
        // B-2566 (its round, 5): For you HELD UNREAD — the away failure's filing WAITS for the read (as its close does), never lost: a one-shot
        // that fails once would otherwise never be said by name; the renewal's own check runs then, against the file
        // follow-up (2): ONE waiter a (owner, job, copy) — its latest words win, and it files as a FIRST filing if any deferred one was —
        // never a waiter a failure (an every-minute schedule while For you is held a day); (3) its landing is journalled on the job
        if (fact === 'away-failed' && userTodos.isHeldUnread?.() && typeof userTodos.whenRead === 'function') {
          const key = `${ownerCid || ''}\u0000${jobId || ''}\u0000${fact}`, prev = heldAway.get(key);
          heldAway.set(key, { words, text, detail, fact, urgency, jobId, jobName, ownerCid, renewOnly: prev ? prev.renewOnly && renewOnly : renewOnly });
          if (!prev) userTodos.whenRead(() => { const a = heldAway.get(key); heldAway.delete(key); if (!a) return; const v = notifyUser(a); try { jm.forYouAtRead(a.jobId, v, a.fact); } catch (e) { log('[jobs] the away-failure item\'s landing was not journalled —', e.message); } if (v && v.ok === false && !v.kept) log('[jobs] the away-failure item was not filed at the read —', v.why); }, 'the away-failure item');
          return { ok: false, held: true, why: 'For you could not be read just now — the item is filed when it reads' };
        }
        if (renewOnly && jobId && fact) {
          const mine = userTodos.idsWhere((i) => i.sessionKey === sessKey && i.jobId === jobId && i.jobFact === fact && !i.clearedAt).map((id) => userTodos.get(id)).filter(Boolean);
          if (mine.length && !mine.some((i) => i.status === 'open')) return { ok: false, kept: true, why: 'its For-you item was closed this episode — kept closed' };
        }
        let sessName = null;
        if (ownerCid && activeSessions) for (const s of activeSessions.values()) {
          if ((s.claudeSessionId || s.backendSessionId) === ownerCid) { sessName = s.name || null; break; }
        }
        // origin 'jobs' is an AGENT-FIELDS origin (src/inbox-origin.js, lane job-notify-user r3): the engine's sentence is a
        // TEMPLATE (`words` = {key, params}) whose fields are the agent's (the job's NAME, a notify cron's --text) — the
        // store belts each field on its own and fills the template, never the sentence; the group label is the owner
        // conversation's own name (the person's fact, whole) + the job's name (`jobName`, a field the store belts);
        // `fact` = which copy of the job it is (the resolver's key and the re-file match, never the words). r4: the SHAPE passes
        // THROUGH — a composed `text` / `detail` (a filing in the pre-r3 shape) reaches the store, which refuses it in its own
        // words («origin 'jobs' files its words as i18n {key, params}»); r3 dropped it and the store said «i18n.text needs a key»
        const it = userTodos.add(sessKey, {
          origin: 'jobs', // B-328d
          text, detail,
          i18n: words == null ? null : { text: words, ...(jobId ? { detail: [ownerCid && jobName ? { key: 'Background job {id} · via {name}', params: { id: jobId, name: jobName } } : { key: 'Background job {id}', params: { id: jobId } }] } : {}) },   // r4: the i18n-check road reads these literals (zh + ja required)
          urgency: urgency || 'normal', by: 'agent', jobId, jobFact: jobId ? fact : null, filerKey: forYouKey,
          sessionName: ownerCid && sessName ? sessName : null, jobName: jobName || (ownerCid && sessName ? 'job' : 'background job'),
        });
        return { ok: true, id: (it && it.id) || null, written: () => (typeof userTodos.whenWritten === 'function' ? userTodos.whenWritten() : Promise.resolve(true)) };   // lane job-logs-sweep r3 §6: «said» after the item is on disk
      } catch (e) {
        // THE STORE'S VERDICT, RETURNED (lane job-notify-user r2): the engine journals it — the Delivery log said
        // «user-inbox ✓» for a copy the store refused (an urgency outside its set, a conversation at its open cap)
        log('[jobs] notify failed:', e.message);
        return { ok: false, why: e && e.code === 'full' ? `For you is full (${e.open} open)` : String((e && e.message) || 'refused').slice(0, 200) };
      }
    },
    // B-dfb4: notifications to a conversation fell off the 30-entry stash cap — ONE For-you notice (≤ 1 per conversation
    // per hour, decided by the engine), filed under the owner conversation like notifyUser's asks, worded per device
    noticeDropped: ({ cid, n, cap, jobs, every = 0 }) => {
      // verify r1: the hour survives a restart — the store keeps when this notice was last FILED (`createdAt`: a first
      // filing or a reopen), open or resolved (the snapshot keeps every item resolved within the hour)
      const said = (() => { const s = userTodos.snapshot(); return [...s.open, ...s.resolved].find((i) => i.sessionKey === `claude:${cid}` && i.origin === 'jobs' && i.i18n && i.i18n.text && /^Background Work notifications for this conversation were dropped/.test(i.i18n.text.key)); })();
      if (said && every && Date.now() - (Number(said.createdAt) || 0) < every) return { recent: true, at: Number(said.createdAt) };
      let sessName = null;
      if (activeSessions) for (const s of activeSessions.values()) { if ((s.claudeSessionId || s.backendSessionId) === cid) { sessName = s.name || null; break; } }
      const names = (Array.isArray(jobs) ? jobs : []).map((x) => String(x).slice(0, 60)).join(', ');
      // lane job-notify-user r3: the words ARE the structure (an AGENT-FIELDS origin files no composed text — the store
      // fills the template; `jobs`, the job names the stash already carries belted, is a field belted on its own again)
      userTodos.add(`claude:${cid}`, {
        origin: 'jobs', kind: 'notice', urgency: 'low', by: 'agent', filerKey: forYouKey,
        sessionName: sessName ? `${sessName} · Background Work` : 'Background Work',
        i18n: {
          text: { key: 'Background Work notifications for this conversation were dropped — {cap} were already waiting, the most it keeps', params: { cap } },
          detail: [{ key: '{n} dropped, never delivered (from: {jobs}). The {cap} still waiting reach the agent with its next turn; the Background Work panel lists them.', params: { n, cap, jobs: names } }],
        },
      });
    },
    // B-6721: Background Work notices are WAITING because their conversation was not running — ONE For-you item per conversation
    // (its own itemKey), filed ONCE A WAITING EPISODE: an item filed since the oldest waiting notice came — open, or set aside by
    // the person — is left as it is (never reopened under them); the words name no job (nothing of a job lives in the item for
    // a «Clear content…» to miss — the Background Work panel lists them); closed by the agent once nothing owed a wake is left
    noticeWakeWaiting: function noticeWakeWaiting({ cid, since = 0 }) {
      // B-6721 meets B-44f3 (the move onto c72bbedd2): For you HELD UNREAD — nothing is filed into a store that cannot be read; the
      // item is filed AT THE READ if the conversation still owes a wake then (the engine notes it said, so its close finds it)
      if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => { const owes = (jm.wakeOwed(cid) || []).some((n) => n && n.held && n.held.kind !== 'rate-floor'); if (owes && noticeWakeWaiting({ cid, since })) jm.noteWakeSaid(cid); }, 'the «notices wait» item'); return null; }
      const key = `jobs-wake-waiting:${cid}`;
      const had = userTodos.idsWhere((i) => i.itemKey === key).map((id) => userTodos.get(id)).filter(Boolean);
      const same = had.find((i) => i.status === 'open' || Number(i.createdAt) >= Number(since));
      if (same) return same.id;
      let sessName = null;
      if (activeSessions) for (const s of activeSessions.values()) { if ((s.claudeSessionId || s.backendSessionId) === cid) { sessName = s.name || null; break; } }
      const it = userTodos.add(`claude:${cid}`, {
        origin: 'jobs', kind: 'notice', urgency: 'normal', by: 'agent', filerKey: forYouKey, itemKey: key,
        sessionName: sessName ? `${sessName} · Background Work` : 'Background Work',
        i18n: {
          text: { key: 'Background Work notices are waiting — this conversation was not running when they came' },
          detail: [{ key: 'VibeSpace hands them to the agent as soon as the conversation runs again — or open the conversation and send anything: they ride your message. The Background Work panel lists them.' }],
        },
      });
      return (it && it.id) || null;
    },
    // B-2566: the owner conversation received its notices — its away failures' items are over (done, by the agent: delivered)
    resolveAwayFailed: function resolveAwayFailed(jobId, cid) {
      if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => resolveAwayFailed(jobId, cid), 'the away-failure item\'s close'); return 0; }
      const ids = userTodos.idsWhere((i) => i.jobId === jobId && i.jobFact === 'away-failed' && i.status === 'open' && i.sessionKey === `claude:${cid}`);
      for (const id of ids) { try { userTodos.setStatus(id, 'done', 'agent'); } catch (e) { log('[jobs] For-you resolve failed:', e.message); } }
      return ids.length;
    },
    resolveWakeWaiting: function resolveWakeWaiting(cid) {
      // B-44f3's law here too: For you held unread — the close runs AT THE READ, if nothing is owed a wake then
      if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => { if (!(jm.wakeOwed(cid) || []).length) resolveWakeWaiting(cid); }, 'the «notices wait» item\'s close'); return 0; }
      const ids = userTodos.idsWhere((i) => i.itemKey === `jobs-wake-waiting:${cid}` && i.status === 'open');
      for (const id of ids) { try { userTodos.setStatus(id, 'done', 'agent'); } catch (e) { log('[jobs] For-you resolve failed:', e.message); } }
      return ids.length;
    },
    // B-2566's remainder (主开发 r1147 / r1149): WHAT WAITS FOR A PAIRED MACHINE THAT CANNOT BE REACHED — ONE For-you item a machine
    // (its own itemKey), never one a conversation or a job; its count grows in place while it is open. A person's close stands for the
    // outage: an item a person closed after this outage began (createdAt ≥ since) is kept closed. The words say what waits, why, and what a person
    // can do — open the machine; nothing to press (no button opens a laptop). Closed by the agent when the machine replies.
    noticeMachineAway: function noticeMachineAway({ hid, n, convs, since, wordless = null }) {
      if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => jm._machineAway(hid), 'the «results wait for a machine» item'); return null; }
      const key = `jobs-machine-away:${hid}`;
      const machine = (() => { try { return deliver.machineNameOf(hid); } catch { return String(hid); } })();
      const it = userTodos.add('jobs', {
        origin: 'jobs', kind: 'notice', urgency: 'normal', by: 'agent', filerKey: forYouKey, itemKey: key, hostId: hid, sessionName: 'Background Work',
        i18n: {
          // r1397 (1): a machine that cannot give its word says WHY (its agent is older / it has no device link), never «silent»
          text: wordless === 'agent_older' ? { key: '{n} Background Work result(s) for {convs} conversation(s) on {machine} go out without its word — its agent is older and cannot say whether they run', params: { n: String(n), convs: String(convs), machine } }
            : wordless === 'no_link' ? { key: '{n} Background Work result(s) for {convs} conversation(s) on {machine} go out without its word — whether they run cannot be asked of it', params: { n: String(n), convs: String(convs), machine } }
              : { key: '{n} Background Work result(s) wait for {convs} conversation(s) on {machine} — it has been silent since {since}', params: { n: String(n), convs: String(convs), machine, since: { at: Number(since) } } },
          detail: [wordless === 'agent_older' ? { key: 'They are handed over when each conversation can take them. Update VibeSpace’s device agent on {machine} so it can say whether its conversations run.', params: { machine } }
            : wordless === 'no_link' ? { key: 'They are handed over when each conversation can take them. Pair {machine} with VibeSpace’s device agent so it can say whether its conversations run.', params: { machine } }
              : { key: 'They are kept in order and go out by themselves when {machine} replies — nothing is lost or billed meanwhile. To let them through, open {machine} and keep VibeSpace’s device agent running there.', params: { machine } }],
        },
      });
      return (it && it.id) || null;
    },
    resolveMachineAway: function resolveMachineAway(hid) {
      if (userTodos.isHeldUnread?.()) { userTodos.whenRead(() => resolveMachineAway(hid), 'the «results wait for a machine» item\'s close'); return 0; }
      const ids = userTodos.idsWhere((i) => i.itemKey === `jobs-machine-away:${hid}` && i.status === 'open');
      for (const id of ids) { try { userTodos.setStatus(id, 'done', 'agent'); } catch (e) { log('[jobs] For-you resolve failed:', e.message); } }
      return ids.length;
    },
    /** the latest instant a PERSON closed machine `hid`'s item (never the agent's own close; a cleared one is gone) — 0 when none;
     *  null while the tray is held (the engine files nothing into a held store anyway) */
    machineAwayClosedAt: (hid) => { if (userTodos.isHeldUnread?.()) return null; let at = 0; for (const id of userTodos.idsWhere((i) => i.itemKey === `jobs-machine-away:${hid}`)) { const i = userTodos.get(id); if (i && i.status !== 'open' && i.resolvedBy !== 'agent' && !i.clearedAt) at = Math.max(at, Number(i.createdAt) || 0); } return at; },
    /** the machines an open «results wait» item names (an earlier run's too) — the engine asks once a run it could READ (null: held) */
    machineAwayOpen: () => { if (userTodos.isHeldUnread?.()) return null; return userTodos.idsWhere((i) => typeof i.itemKey === 'string' && i.itemKey.startsWith('jobs-machine-away:') && i.status === 'open').map((id) => String((userTodos.get(id) || {}).itemKey || '').slice('jobs-machine-away:'.length)).filter(Boolean); },
    ownerUnreachable: (cid) => { try { return deliver.unreachableOf(cid); } catch { return null; } },   // B-2566's remainder: the ladder's own verdict
    machineAwayOf: (hid) => { try { return deliver.machineAwayOf(hid); } catch { return null; } },   // r1277: away, or a held wake still owed the machine's word
    log, getTelemetry, // optional: an archive write failure names itself (jobs-archive-write-failed)
    // B-44f3: For you held unread — the close is refused by name; it runs again at the read (the ask's item never reopens over an answered panel)
    resolveJobAsk: (jobId, opts) => { try { return userTodos.resolveByJob(jobId, opts); } catch (e) { if (e && e.code === 'todos-unread' && typeof userTodos.whenRead === 'function') { userTodos.whenRead(() => { try { userTodos.resolveByJob(jobId, opts); } catch (e2) { log('[jobs] inbox resolve failed at the read:', e2.message); } }, "a job's answered ask"); log(`[jobs] ${jobId}: its For-you ask closes once For you reads its list`); return 0; } log('[jobs] inbox resolve failed:', e.message); return 0; } },
    // B-f276 cure r1: an engine notice whose cause is gone (a store read again) — resolved by the id its filing returned
    resolveNotice: (id) => { try { return userTodos.setStatus(id, 'done', 'agent'); } catch (e) { log('[jobs] For-you resolve failed:', e.message); return null; } },
    // ── owner auto-notify lanes (2.344.0, B-0bf4) ─────────────────────────
    // Global default: agents.jobNotify (ON unless the user turned it off).
    notifyGlobal: () => { try { return serverSetting('agents.jobNotify') !== false; } catch { return true; } },
    // Group tri-state over the job's ownership snapshot: any explicit OFF
    // wins (quietest interpretation of a conflict), else any explicit ON,
    // else inherit (null → global decides).
    groupNotifyFor: (job) => {
      try {
        const ids = (job.owner && job.owner.groupsSnapshot) || [];
        let sawOn = false;
        for (const gid of ids) {
          const g = taskGroups && taskGroups.get ? (() => { try { return taskGroups.get(gid); } catch { return null; } })() : null;
          if (!g) continue;
          if (g.jobNotify === false) return false;
          if (g.jobNotify === true) sawOn = true;
        }
        return sawOn ? true : null;
      } catch { return null; }
    },
    // Deliver via the CLI's own cross-session messaging inbox: find the LIVE
    // registered peer for the owner conversation's backend session id and
    // post the message. The CLI applies its own inbound controls/throttles —
    // we never bypass a hold. Any miss (no registry entry, dead pid, socket
    // error) reports {ok:false} so the engine stashes for resume injection.
    peerReachable: (cid) => { try { return deliver.peerReachable(cid); } catch { return false; } },
    liveForWake: (cid) => { try { return deliver.liveForWake(cid); } catch { return false; } },   // B-95fc (round w00h341sv): the park's own «live» — a conversation its machine said ended is not live
    // lane jobs-addressed-push r2/r3 (law C — PUSH ⊆ VIEW on every road): a conversation as a jobs caller NOW, judged by what
    // the server knows of it NOW. A LIVE record (the one claude-lock-capture addressableId names as its own) ⇒ its Task Groups
    // by THE membership function (the hook routes' jobsCaller reads the same) — `live: true`. No live record ⇒ what the group
    // store holds for the conversation's KEY (`<backend>:<cid>` — explicit membership; a folder's auto-join needs a cwd only a
    // live record has) — `live: false`: the engine tells it when that view is proven, else holds the line for the drain.
    viewerOf: (cid) => {
      try {
        if (!cid) return null;
        // THE STORE HELD UNREAD (lane bl-windows): its Task Groups UNKNOWN — a view of no record (`live: false`, so nothing is refused
        // as «in no group») MARKED held: the owner's lines are proven by its id; a line only a group could prove is KEPT and not
        // printed (jobs.js printableNow) until the lift judges it
        const { addressableId } = require('../claude-lock-capture.js');
        if (taskGroups && typeof taskGroups.unreadState === 'function' && taskGroups.unreadState()) {   // …with the live session's identity (an owner by session)
          if (activeSessions) for (const [id, s] of activeSessions) if (addressableId(s) === cid) return { live: false, held: true, conversationId: cid, sessionId: id, sessionCreatedAt: s.createdAt || 0, groups: new Set() };
          return { live: false, held: true, conversationId: cid, groups: new Set() };
        }
        if (activeSessions) for (const [id, s] of activeSessions) {
          if (addressableId(s) !== cid) continue;
          const groups = taskGroups && typeof sessionStatusKey === 'function' ? taskGroups.groupsForSession({ sessionKey: sessionStatusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }) : [];
          // B-55dc: an answer still being READ judges like no live record — the engine HOLDS the line ('unknown': kept for the
          // drain, never 'refused' / dropped) and the next push or drain asks again once the read landed
          return { live: !groups.unread, conversationId: cid, sessionId: id, sessionCreatedAt: s.createdAt || 0, groups: new Set(groups.map((g) => g.id)), ...(groups.unread ? { reading: true } : {}) };
        }
        const byKey = taskGroups && typeof taskGroups.list === 'function' ? taskGroups.list().filter((g) => !g.archived && (g.sessions || []).some((k) => typeof k === 'string' && k.endsWith(':' + cid))) : [];
        return { live: false, conversationId: cid, groups: new Set(byKey.map((g) => g.id)) };
      } catch { }
      return null;
    },
    // ONE delivery ladder for every conversation-bound message (2.362.0):
    // channel-socket → local CLI inbox → owning machine's daemon (peer-post
    // op) → the caller stashes on a miss. Shared with agent-to-agent
    // messaging via src/server/conversation-deliver.js.
    deliverToConversation: (cid, text, opts) => deliver.deliverToConversation(cid, text, opts),
    onRetry: (fn) => deliver.onRetry(fn),   // lane notify-retry: the park's parked / attempt / delivered / fell, booked by the engine
    // the manager design's piece 7: a result / reminder for an ENDED owner owes it ONE wake (a rung of the same park); how it ended decides at the line (src/server/delivery-wake.js)
    parkEndedWake: (cid, o) => (deliver && typeof deliver.parkEndedWake === 'function' ? deliver.parkEndedWake(cid, o) : { parked: false, why: 'no park' }),
    // "Clear content…" (verify r3): the ladder's own stash is a derived copy of a job's words too
    redactStash: (match, scope) => (deliver && typeof deliver.redactStash === 'function' ? deliver.redactStash(match, scope) : 0),
    // TRIAGE ARCHIVE policy (design §13 rule 5): the two settings rows, read
    // live; an explicit 0 = never archive that class
    archivePolicy: () => ({ doneAfterHours: serverSetting('jobs.archiveDoneAfterHours'), failedAfterDays: serverSetting('jobs.archiveFailedAfterDays') }),
    logsSweepOn: () => { try { return serverSetting('jobs.logsSweep') !== false; } catch { return true; } },   // lane job-logs-sweep r2: the clean-up's pause (the setting; default on)
    // THE MEMORY BOUND's ladder inputs (lane jobs-memory-bound), read live per run: the owner's setting as STORED (undefined
    // while never set — the schema's 4096 is the ladder's last rung, not an owner's word) and the cluster's default (the
    // chart's `jobs.memoryMb` → env VIBESPACE_JOBS_MEMORY_MB)
    memoryCtx: () => ({ setting: serverSetting('jobs.memoryMb'), cluster: process.env.VIBESPACE_JOBS_MEMORY_MB }),
    // B-460d: a job starts below the hub (nice +5 on its wrapper's spawn) while agents.lowerCpuPriority is on — read per start
    spawnPriority: () => require('./spawn-priority.js').priorityFor({ serverSetting, log: { warn: (l) => log(l) } }),
  });
  // "Clear content…" (verify r4): every entry the ladder stashes is judged by the jobs store at its write — a frame a
  // wrapper hands back after the clear names a cleared job by id and is held as the sentence (jobs.js judgeHeldEntry)
  if (deliver && typeof deliver.registerStashJudge === 'function') deliver.registerStashJudge((e) => jm.judgeHeldEntry(e));
  // lane jobs-addressed-push r4: the ladder asks the engine before ANY road delivers a parked jobs copy (turn end, timer, prompt
  // drain, hand-over) — a subscriber's copy is owed only while that subscriber may view the job NOW (jm.retryOwed)
  if (deliver && typeof deliver.registerRetryJudge === 'function') deliver.registerRetryJudge('jobs', (cid, e) => jm.retryOwed(cid, e));

  const USER = { isUser: true, groups: new Set() };
  // B-6c1a: a record whose runs is not a list (a hand-edited or damaged store) lists with no runs — never a list that throws
  const runsOf = (j) => (Array.isArray(j.runs) ? j.runs : []).filter((r) => r && typeof r === 'object').map((r) => ({ startedAt: r.startedAt, endedAt: r.endedAt || null, exit: r.exit ?? null, cause: r.cause || null, trigger: r.trigger, lastLine: r.lastLine || '', memoryMb: r.memoryMb ?? null, memoryAskedMb: r.memoryAskedMb ?? null, memoryCap: r.memoryCap || null, memoryBound: r.memoryBound || null }));
  // B-6c1a (its adversarial read r1): the DETAIL keeps whole run records (the panel's detail reads them) — a non-list or a null entry never reaches it
  const runsWhole = (j) => (Array.isArray(j.runs) ? j.runs : []).filter((r) => r && typeof r === 'object');
  // the panel's fold groups one-shots by OWNER SESSION (§13 rule 3): the
  // conversation lineage id + the webui session id ride the user list only
  const ownerOf = (j) => ({ conversationId: (j.owner && j.owner.conversation && j.owner.conversation.id) || null, sessionId: (j.owner && j.owner.sessionId) || null });

  // A service published EXTERNALLY (user hit publish on its port in the Ports
  // panel instead of creating with --publish) still shows the URL on its job
  // card (owner report 2.351.1: demo-ui's manual publish was invisible here).
  // Read-only enrichment of the serialized copy — job records are not touched.
  const enrichPublished = (snap, job) => {
    if (snap.publishedUrl || !job.ports || !job.ports.length) return snap;
    try {
      const fwds = (jm.d.getPorts && jm.d.getPorts().list && jm.d.getPorts().list()) || [];
      const hit = fwds.find((f) => f.hostId === '__local__' && f.publicUrl && job.ports.some((pt) => Number(pt) === Number(f.remotePort)));
      if (hit) return { ...snap, publishedUrl: hit.publicUrl, publishedExternally: true };
    } catch { }
    return snap;
  };

  // ── user REST (cookie-authed): the panel sees and controls everything ──
  // B-f276 cure r1: while jobs.json cannot be read — the words (the panel words its own from `code` + `why`), never an empty list
  // B-a08e (主开发 r1665, test-jobs-triage): EVERY job snapshot carries `vaultUses` (lane vault-job-approval: the card's «Uses from the
  // vault», the entries' Vault names — the person's view only): the live list, the archive list, a read by id live or archived — one
  // shape (an archived job's approvals left with it: its uses say «not approved»)
  const vaultUsesOf = (j) => (typeof jm.vaultUsesOf === 'function' ? jm.vaultUsesOf(j) : []);
  const unreadAnswer = () => ({ error: jm.unreadWords(), code: 'records-unread', why: (jm._unread.store && jm._unread.store.code) || 'unknown' });
  app.get('/api/jobs', (req, res) => {
    if (!jm.ready) return res.status(503).json({ error: jm.initError ? `jobs engine down: ${jm.initError}` : 'jobs engine starting' });
    if (jm._unread && jm._unread.store && req.query.archived !== '1') return res.status(503).json(unreadAnswer());   // B-f276 cure r1: an empty list says why
    // ?archived=1 = the archive list, SAME snapshot shape + archivedAt/archivedWhy
    // (triage §13 rule 5) — fetched by the panel only when the user asks
    if (req.query.archived) {
      return res.json({ archived: true, jobs: jm.archivedList().map((r) => ({ ...jm.snapshotArchived(r), access: r.access, ownerSession: ownerOf(r), runs: runsOf(r), vaultUses: vaultUsesOf(r) })) });   // vaultUses: B-a08e (主开发 r1665) — the archived card names the entries it used, as the live one does
    }
    res.json({
      jobs: [...jm.jobs.values()].map((j) => ({ ...enrichPublished(jm.snapshot(j), j), access: j.access, envKeys: Object.keys(j.cmd?.env || {}), envFrom: j.envFrom || [], ownerSession: ownerOf(j), runs: runsOf(j), vaultUses: vaultUsesOf(j) })),   // vaultUses: lane vault-job-approval — the card's «Uses from the vault» (the entries' Vault names: the person's view only)
      archivedCount: jm.archivedCount(),
      held: jm.heldDigest(),
    });
  });
  // B-360d unit 3 (the hub profile's rank 9): THE HELD DIGEST ALONE — a chat view's chip seed while the page keeps none yet
  // (src/lib/jobs-held.js: one ask a page, shared). The same digest every jobs-updated carries; never a job's snapshot (the list
  // above snapshots and enriches EVERY job on the loop). Before /api/jobs/:id, which would take «held» for an id.
  app.get('/api/jobs/held', (req, res) => {
    if (!jm.ready) return res.status(503).json({ error: jm.initError ? `jobs engine down: ${jm.initError}` : 'jobs engine starting' });
    res.json({ held: jm.heldDigest() });
  });
  // the manager design's piece 7: the rows the person's doors list (the Terminate confirm, the proposal card) — each registered
  // job or schedule the conversation OWNS that can still deliver (a cron's runs ride their parent's row; an ended one-shot
  // delivers nothing more), with its next fire and its STORED grant (PURE src/delivery-wake.js wakeChoiceRows). Read-only.
  app.get('/api/jobs-wake-grants', (req, res) => {
    if (!jm.ready) return res.status(503).json({ error: 'jobs engine starting' });
    // B-f276 family unit 2, the reader table (r3230): jobs.json HELD — its memory is empty because UNREAD, never «owns no job»
    if (jm._unread && jm._unread.store) return res.status(503).json({ error: jm.unreadWords('a conversation\'s jobs cannot be listed while the job records cannot be read'), code: 'records-unread' });
    const cid = String(req.query.conversation || '');
    if (!cid) return res.status(400).json({ error: 'conversation required' });
    const live = [...jm.jobs.values()].filter((j) => !j.cronParent && ownerOf(j).conversationId === cid && !M.isTerminal(j));
    res.json({ conversation: cid, rows: jm.wakeRowsOf(live) });
  });
  // user-side create (the panel's ＋New — no vsst_ token in the browser)
  app.post('/api/jobs', (req, res) => {
    if (!jm.ready) return res.status(503).json({ error: 'jobs engine starting' });
    const b = req.body || {};
    const spec = { ...b, owner: { conversation: null, sessionId: null, sessionCreatedAt: 0, createdBy: 'user', groupsSnapshot: [] } };
    const pressedAt = Date.now();   // B-91aa's remainder (r4591 (2)): the create's start is answered by the STARTER's answer — a failed start in today's words
    const r = jm.create(spec, USER);
    if (r.error) return res.status(400).json({ error: r.error, ...(r.code ? { code: r.code } : {}), ...(r.budget ? { budget: r.budget } : {}) });   // B-b14a: a create past the memory budget is named in the reader's language
    const reply = () => jm.persisted((saved) => { try { require('../store-writer.js').identityAtExit(res); res.json({ success: true, job: r.job, renamed: r.renamed, ...(saved ? {} : { notOnDisk: true }) }); } catch { } });   // lane lg-store-writes U4: the answer waits for the store, never the loop
    jm.startAnswer(jm.jobs.get(r.job.id), pressedAt).then((sa) => (sa && sa.error ? res.status(400).json({ error: sa.error }) : reply()));
  });
  app.get('/api/jobs/:id', (req, res) => {
    const job = jm.jobs.get(req.params.id);
    const tail = Math.min(Number(req.query.tail) || 0, 1000);
    if (!job) {
      // READ-THROUGH to the archive (triage §13 rule 5): housekeeping must
      // never turn an id somebody holds into a 404
      const rec = jm.archivedById(req.params.id);
      if (rec) return res.json({ job: { ...jm.snapshotArchived(rec, { tail }), access: rec.access, interaction: rec.interaction, runs: runsWhole(rec), vaultUses: vaultUsesOf(rec) } });
      return res.status(jm._unread && jm._unread.store ? 503 : 404).json(jm._unread && jm._unread.store ? unreadAnswer() : { error: 'no such job' });   // B-f276 cure r1: never «no such job» while the records are unread
    }
    res.json({ job: { ...enrichPublished(jm.snapshot(job, { tail }), job), access: job.access, interaction: job.interaction, runs: runsWhole(job), vaultUses: vaultUsesOf(job) } });
  });
  // BATCH ACKNOWLEDGE (2.369.121, owner: 批量已读): the panel's "Mark all seen"
  // sends every ackable id once; each terminal one-shot not yet seen is
  // acknowledged as user-opened (the same rule as the per-row ping), then ONE
  // save and ONE broadcast so every open panel + the badge repaint once.
  app.post('/api/jobs/seen', (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids required' });
    const acked = [];
    for (const id of ids) {
      const job = jm.jobs.get(id);
      if (!job) continue;
      if (jm.markAck(job, 'user-opened', undefined, { quiet: true })) acked.push(id);
    }
    if (acked.length) { jm._save(); try { jm.d.broadcast('jobs-updated', { acked }); } catch { } }
    // the moved2 census (its jobs pass): the answer waits for the store, as every act's (a kill first: the marks were never said done)
    jm.persisted((saved) => { try { require('../store-writer.js').identityAtExit(res); res.json({ success: true, requested: ids.length, acked: acked.length, ids: acked, ...(saved ? {} : { notOnDisk: true }) }); } catch { } });
  });
  app.post('/api/jobs/:id/:act', (req, res) => {
    const job = jm.jobs.get(req.params.id);
    const act = req.params.act;
    if (!job) {
      // an ARCHIVED record answers exactly two acts: ✕ (gone for good) and
      // the panel's expand ping (already acknowledged — a no-op that says so)
      const rec = jm.archivedById(req.params.id);
      if (!rec) return res.status(jm._unread && jm._unread.store ? 503 : 404).json(jm._unread && jm._unread.store ? unreadAnswer() : { error: 'no such job' });
      // lane job-logs-sweep: «gone for good» is said once its log dir is gone (removed off the main thread; ≤ 10 s, then `logsPending`)
      if (act === 'rm') { const r = jm.rmArchived(rec.id, (x) => { if (x.error) return res.status(x.notDurable ? 503 : 400).json({ error: x.error, ...(x.notDurable ? { code: 'not-durable' } : {}) }); if (jm.exiting && jm.exiting()) return res.json({ success: true, ok: true, logsPending: true }); return jm.logsGone(rec.id).then((v) => res.json({ success: true, ok: true, ...(v.gone ? {} : v.kept && v.kept !== 'pending' ? { logsKept: v.kept } : { logsPending: true }) })); }); if (r.error) return res.status(r.code === 'being-removed' || r.code === 'live' ? 409 : 400).json({ error: r.error, ...(r.code ? { code: r.code } : {}), ...(r.stopped ? { stopped: true } : {}) }); return; }   // B-0248 step 3: answered at the removal's LANDING   // round 2: what stays and why
      if (act === 'seen') return res.json({ success: true, changed: false, ack: M.ackState(rec), archived: true });
      return res.status(400).json({ error: `job ${rec.id} is archived — only rm applies` });
    }
    try {
      let r;
      const pressedAt = Date.now();   // B-91aa's remainder (r4591 (2)): a start press is answered by ITS start's answer
      if (act === 'stop') r = jm.stop(job, { force: !!req.body?.force });
      else if (act === 'start') r = jm.start(job, { caller: USER });   // B-b14a: the refusal is worded for its caller (the person views every job)
      else if (act === 'rm') r = jm.rm(job, { stop: !!req.body?.stop, orphan: !!req.body?.orphan });
      else if (act === 'answer') r = jm.answerPanel(job, req.body?.answers || {});
      else if (act === 'memory') r = jm.setMemory(job, req.body?.value ?? null, { byUser: true });   // lane jobs-memory-bound: the job's properties (0 = unbounded: the owner's call)
      // the manager design's piece 7: the person's grant «may wake its conversation when that conversation was ended on purpose» —
      // a PERSON on this instance's own page only (no bearer, the strict page verdict — the vault doors' personVerdict rule; no
      // press is minted: no turn starts here). An agent's token is refused by name (src/jobs.js setWakeGrant)
      else if (act === 'wake-grant') {   // THE ONE DOOR (src/jobs.js changeWakeGrants): answered once the change landed — not landed ⇒ 503 not_now, nothing changed
        return void jm.changeWakeGrants([{ job, grant: req.body?.grant === true }], { by: personHere(req) ? { kind: 'person', by: 'person' } : null }).then((a) => {
          const w = (a.rows || [])[0] || {};
          if (!a.ok || !w.ok) return res.status(a.code === 'wake_grant_person_only' ? 403 : (w.code || a.code) === 'not_now' ? 503 : (w.code || a.code) === 'busy' ? 409 : 400).json({ error: w.error || a.error || a.why, code: w.code || a.code, ...(w.behind || a.behind ? { behind: true } : {}) });   // busy: an earlier change of this grant still waits (the door's order); behind: nothing was tried
          const GF = require('../delivery-wake.js').GRANT_FIELD;
          res.json({ success: true, changed: !!w.changed, [GF]: w[GF] === true, wakeGrantBy: w.wakeGrantBy || null });
        }, (e) => res.status(500).json({ error: (e && e.message) || String(e), code: 'failed' }));
      }
      // the user EXPANDED the row (triage §13 rule 1c): a terminal one-shot is
      // acknowledged by the person who opened it; anything else is a no-op
      else if (act === 'seen') { const changed = jm.markAck(job, 'user-opened'); if (!changed) return res.json({ success: true, changed, ack: M.ackState(job) }); jm._save(); return void jm.persisted((saved) => { try { require('../store-writer.js').identityAtExit(res); res.json({ success: true, changed, ack: M.ackState(job), ...(saved ? {} : { notOnDisk: true }) }); } catch { } }); }   // the moved2 census: waits for the store
      else if (act === 'access') {
        for (const k of ['view', 'control']) if (req.body?.[k] && ['session', 'group', 'all'].includes(req.body[k])) job.access[k] = req.body[k];
        job.access.lockedBy = req.body?.lock === false ? null : req.body?.lock === true ? 'user' : job.access.lockedBy;
        if (['on', 'off', 'inherit'].includes(req.body?.notify)) job.notify = req.body.notify === 'inherit' ? undefined : req.body.notify; // per-job auto-notify override (2.344.2)
        jm._touch(job); jm._save();
        return void jm.persisted((saved) => { try { require('../store-writer.js').identityAtExit(res); res.json({ success: true, access: job.access, notify: job.notify || 'inherit', ...(saved ? {} : { notOnDisk: true }) }); } catch { } });   // an authority change: answered once on disk
      }
      else return res.status(400).json({ error: `unknown action "${act}"` });
      if (r.error) return res.status(r.code === 'stale-panel' ? 409 : 400).json({ error: r.error, ...(r.code ? { code: r.code } : {}), ...(r.stopped ? { stopped: true } : {}), ...(r.budget ? { budget: r.budget } : {}), ...(Number.isInteger(r.version) ? { version: r.version } : {}) }); // r6 D-F5: a refused answer is named (stale-panel / version-required)
      const reply = () => jm.persisted((saved) => { try { require('../store-writer.js').identityAtExit(res); res.json({ success: true, ...r, ...(saved ? {} : { notOnDisk: true, ...(act === 'rm' || act === 'answer' ? { code: 'finishes-on-landing' } : {}) }) }); } catch { } });   // the moved2 cure 2: a removal / an answer not landed finishes by itself at the landing (said by its code)   // lane lg-store-writes U4: the act's answer waits for the store (the loop never does); a write not landed is SAID
      if (act === 'start') return void jm.startAnswer(job, pressedAt).then((sa) => (sa && sa.error ? res.status(400).json({ error: sa.error }) : reply()));   // a failed start in today's words (never a silent «starting»)
      reply();
    } catch (e) { res.status(e && e.code === 'EVSNOTONDISK' ? 503 : 400).json({ error: e.message, ...(e && e.code === 'EVSNOTONDISK' ? { code: 'not-on-disk' } : {}) }); }   // a person's start refused because its run could not be saved first: worded on the page by its code (the moved2 cure 2)
  });
  // B-e3fe follow-up (主开发 04:02Z: THE HOLD IS NOT SILENT): an unreadable data/msg-queued.json is said in For you, with the person's
  // «Set it aside» — the ladder (deliver) holds the record, this wiring holds the For-you store and the app (server.js gains no line)
  require('./queued-file-for-you.js').create({ getUserTodos: () => userTodos, deliver, log });
  app.post('/api/queued-wakes/set-aside', async (req, res) => {
    const w = require('../write-origin.js').ownerPageWhy(req);   // a person's press: the owner's own page, never a bearer
    if (w) return res.status(403).json({ ok: false, error: `the record of waiting messages is set aside only by the owner's press on the owner's own page; ${w === 'bearer' ? 'a request carrying a bearer token' : 'a request with no mark of the owner\'s page'} cannot` });
    try { const r = deliver && typeof deliver.queuedSetAside === 'function' ? await deliver.queuedSetAside() : { ok: false, error: 'no delivery ladder' }; res.status(r.ok ? 200 : 500).json(r); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // lane job-secrets-retire: GET/POST /api/jobs-secrets (a plaintext data/job-secrets.json no client wrote) are gone —
  // a job's secret comes from the vault (job-model vetSpec refuses a named envFrom `envfrom_retired`)
  // read-only escape visibility: hand-rolled systemd/crontab jobs OUTSIDE the registry
  const readEscapes = escapesReader();
  app.get('/api/jobs-escapes', async (req, res) => { res.json(await readEscapes({ fresh: !!(req.query && req.query.fresh === '1') })); });   // ?fresh=1: a person's Refresh
  // Live-session catch-up (2.344.1): sessions spawned BEFORE 2.344.0 lack the
  // --settings crossSessionInbound accept, and dtach sessions survive updates
  // for weeks — their bypass-mode inbound would HOLD our notifications in a
  // dialog nobody watches (dropped after 5min, unrecoverable). Push the same
  // documented settings key over the chat control channel (apply_flag_settings
  // — the CLI's generic schema-valid settings merge; one stdin line, zero
  // inference). Local claude CHAT sessions only; terminal sessions can't take
  // control JSON (their notifications rely on the stash lane until respawn).
  let csiSeq = 0;
  const pushAcceptToLiveSessions = () => {
    try {
      if (serverSetting('agents.jobNotify') === false || !activeSessions) return;
      for (const [, s] of activeSessions) {
        if (!s.pty || s.mode !== 'chat' || (s.backend || 'claude') !== 'claude' || s.host) continue;
        if (s._csiAccepted) continue;
        if (SFW.fileGoverns(s, 'jobNotices')) continue;   // B-8dcf item two: the person's settings file governs it
        try {
          s.pty.write(JSON.stringify({ type: 'control_request', request_id: `vs-csi-${++csiSeq}`, request: { subtype: 'apply_flag_settings', settings: { crossSessionInbound: 'accept' } } }) + '\n');
          s._csiAccepted = true;
        } catch (e) { log('[jobs] accept push failed for a session:', e.message); }
      }
    } catch (e) { log('[jobs] accept catch-up failed:', e.message); }
  };

  /** THE GRANT'S IN-PROCESS DOOR for the cards (piece 7 — the proposals' card on the person's press, the END card's ticks): ONE ACT
   *  for the whole list through THE ONE DOOR (src/jobs.js changeWakeGrants — one landing, off the loop; not landed ⇒ every changed
   *  row back as it was, `not_now`). `changes` = [{ id, grant }], `by` = { kind: 'person' | 'key', by: the actor, name? } */
  const setWakeGrants = (changes, by) => jm.changeWakeGrants((Array.isArray(changes) ? changes : []).map((c) => ({ id: String((c && c.id) || ''), grant: !!(c && c.grant === true) })), { by });
  return {
    jm,
    setWakeGrants,
    // piece 7: lane login-request-card's OWN unit binds its proposal store's `proposeWakeGrant(caller, {rows, why})` here (the agent
    // route's `vibespace-job propose-wake` / `--propose-wake` call it through the engine); nothing binds it in this unit ⇒
    // proposal_door_not_ready by name
    setProposalDoor: (fn) => { jm.proposeWakeDoor = typeof fn === 'function' ? fn : null; },
    getJobs: () => jm,
    initAfterListen: () => {
      try { jm.init(); } catch (e) { log('[jobs] init threw (isolated):', e.message); }
      // B-2c5c (4c), 主开发 r4380: a VibeSpace started AS a background job lives under that job's memory bound — said ONCE, here, where
      // the job's record is read (the card and the job's notification already name a memory-bound end with its size)
      // r4564: the bound IN FORCE (the last run's own record, else the tree's one bound function) and its rung — never the raw asked figure
      // r4673: + the run's hub-main fact (the engine's one accessor, proven at init's adopt)
      try { const id = require('./throwaway-root.js').handedJobId(); if (id) { const job = jm.jobs && jm.jobs.get(id), run = job && Array.isArray(job.runs) ? job.runs[job.runs.length - 1] : null; log(M.startedInJobLine(id, job ? { label: jm.labelOf(job), mainIsHub: !!(run && typeof jm._hubMainOf === 'function' && jm._hubMainOf(run, null)), ...M.boundInForceOf(job, typeof jm._memoryCtx === 'function' ? jm._memoryCtx() : {}) } : null)); } } catch (e) { log('[jobs] the boot could not say which job holds this VibeSpace —', e && e.message); }
      // two passes: dtach re-attaches trickle in after boot
      const t1 = setTimeout(pushAcceptToLiveSessions, 5000);
      const t2 = setTimeout(pushAcceptToLiveSessions, 60_000);
      t1.unref?.(); t2.unref?.();
    },
    shutdown: () => { try { jm.shutdown(); } catch { } },
  };
}

module.exports = { create, escapesReader, ESCAPES_FRESH_MS, ESCAPES_MAX, ESCAPES_NO_REPLY_MS, ESCAPES_NO_REPLY_MAX_MS };
