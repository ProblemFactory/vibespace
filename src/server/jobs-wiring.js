// Background Work wiring (2.342.0, docs/design-background-work.md).
// create(deps) factory: constructs the JobManager, exposes the user-facing
// REST surface (cookie-authed — the panel), and the deferred init/shutdown
// hooks server.js calls. Engine failure NEVER blocks boot (§5).
'use strict';
const { execFile } = require('child_process');
const { JobManager } = require('../jobs.js');
const M = require('../job-model.js');

function create({ app, dataDir, broadcastAll, userTodos, log, serverSetting, taskGroups, activeSessions, deliver, getTelemetry = () => null, onStash = () => {}, onRunEnded = () => {} }) {
  // THE FILER'S KEY (lane job-notify-user r5): this file is origin 'jobs''s one filer (src/inbox-origin.js FIELDS_FILERS) —
  // the store names it by its frame, and the key it hands here rides every filing (a caller with no frame needs it)
  let forYouKey = null;
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
    notifyUser: ({ words = null, text, detail, fact = null, urgency, jobId, jobName, ownerCid }) => {
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
        return { ok: true, id: (it && it.id) || null };
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
    log, getTelemetry, // optional: an archive write failure names itself (jobs-archive-write-failed)
    resolveJobAsk: (jobId, opts) => { try { return userTodos.resolveByJob(jobId, opts); } catch (e) { log('[jobs] inbox resolve failed:', e.message); return 0; } },
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
    // ONE delivery ladder for every conversation-bound message (2.362.0):
    // channel-socket → local CLI inbox → owning machine's daemon (peer-post
    // op) → the caller stashes on a miss. Shared with agent-to-agent
    // messaging via src/server/conversation-deliver.js.
    deliverToConversation: (cid, text, opts) => deliver.deliverToConversation(cid, text, opts),
    onRetry: (fn) => deliver.onRetry(fn),   // lane notify-retry: the park's parked / attempt / delivered / fell, booked by the engine
    // "Clear content…" (verify r3): the ladder's own stash is a derived copy of a job's words too
    redactStash: (match, scope) => (deliver && typeof deliver.redactStash === 'function' ? deliver.redactStash(match, scope) : 0),
    // TRIAGE ARCHIVE policy (design §13 rule 5): the two settings rows, read
    // live; an explicit 0 = never archive that class
    archivePolicy: () => ({ doneAfterHours: serverSetting('jobs.archiveDoneAfterHours'), failedAfterDays: serverSetting('jobs.archiveFailedAfterDays') }),
    // THE MEMORY BOUND's ladder inputs (lane jobs-memory-bound), read live per run: the owner's setting as STORED (undefined
    // while never set — the schema's 4096 is the ladder's last rung, not an owner's word) and the cluster's default (the
    // chart's `jobs.memoryMb` → env VIBESPACE_JOBS_MEMORY_MB)
    memoryCtx: () => ({ setting: serverSetting('jobs.memoryMb'), cluster: process.env.VIBESPACE_JOBS_MEMORY_MB }),
  });
  // "Clear content…" (verify r4): every entry the ladder stashes is judged by the jobs store at its write — a frame a
  // wrapper hands back after the clear names a cleared job by id and is held as the sentence (jobs.js judgeHeldEntry)
  if (deliver && typeof deliver.registerStashJudge === 'function') deliver.registerStashJudge((e) => jm.judgeHeldEntry(e));

  const USER = { isUser: true, groups: new Set() };
  const runsOf = (j) => (j.runs || []).map((r) => ({ startedAt: r.startedAt, endedAt: r.endedAt || null, exit: r.exit ?? null, cause: r.cause || null, trigger: r.trigger, lastLine: r.lastLine || '', memoryMb: r.memoryMb ?? null, memoryAskedMb: r.memoryAskedMb ?? null, memoryCap: r.memoryCap || null, memoryBound: r.memoryBound || null }));
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
  app.get('/api/jobs', (req, res) => {
    if (!jm.ready) return res.status(503).json({ error: jm.initError ? `jobs engine down: ${jm.initError}` : 'jobs engine starting' });
    // ?archived=1 = the archive list, SAME snapshot shape + archivedAt/archivedWhy
    // (triage §13 rule 5) — fetched by the panel only when the user asks
    if (req.query.archived) {
      return res.json({ archived: true, jobs: jm.archivedList().map((r) => ({ ...jm.snapshotArchived(r), access: r.access, ownerSession: ownerOf(r), runs: runsOf(r) })) });
    }
    res.json({
      jobs: [...jm.jobs.values()].map((j) => ({ ...enrichPublished(jm.snapshot(j), j), access: j.access, envKeys: Object.keys(j.cmd?.env || {}), envFrom: j.envFrom || [], ownerSession: ownerOf(j), runs: runsOf(j) })),
      archivedCount: jm.archivedCount(),
      held: jm.heldDigest(),
    });
  });
  // user-side create (the panel's ＋New — no vsst_ token in the browser)
  app.post('/api/jobs', (req, res) => {
    if (!jm.ready) return res.status(503).json({ error: 'jobs engine starting' });
    const b = req.body || {};
    const spec = { ...b, owner: { conversation: null, sessionId: null, sessionCreatedAt: 0, createdBy: 'user', groupsSnapshot: [] } };
    const r = jm.create(spec, USER);
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ success: true, job: r.job, renamed: r.renamed });
  });
  app.get('/api/jobs/:id', (req, res) => {
    const job = jm.jobs.get(req.params.id);
    const tail = Math.min(Number(req.query.tail) || 0, 1000);
    if (!job) {
      // READ-THROUGH to the archive (triage §13 rule 5): housekeeping must
      // never turn an id somebody holds into a 404
      const rec = jm.archivedById(req.params.id);
      if (rec) return res.json({ job: { ...jm.snapshotArchived(rec, { tail }), access: rec.access, interaction: rec.interaction, runs: rec.runs } });
      return res.status(404).json({ error: 'no such job' });
    }
    res.json({ job: { ...enrichPublished(jm.snapshot(job, { tail }), job), access: job.access, interaction: job.interaction, runs: job.runs } });
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
    res.json({ success: true, requested: ids.length, acked: acked.length, ids: acked });
  });
  app.post('/api/jobs/:id/:act', (req, res) => {
    const job = jm.jobs.get(req.params.id);
    const act = req.params.act;
    if (!job) {
      // an ARCHIVED record answers exactly two acts: ✕ (gone for good) and
      // the panel's expand ping (already acknowledged — a no-op that says so)
      const rec = jm.archivedById(req.params.id);
      if (!rec) return res.status(404).json({ error: 'no such job' });
      if (act === 'rm') { const r = jm.rmArchived(rec.id); return r.error ? res.status(400).json({ error: r.error }) : res.json({ success: true, ...r }); }
      if (act === 'seen') return res.json({ success: true, changed: false, ack: M.ackState(rec), archived: true });
      return res.status(400).json({ error: `job ${rec.id} is archived — only rm applies` });
    }
    try {
      let r;
      if (act === 'stop') r = jm.stop(job, { force: !!req.body?.force });
      else if (act === 'start') r = jm.start(job);
      else if (act === 'rm') r = jm.rm(job, { stop: !!req.body?.stop, orphan: !!req.body?.orphan });
      else if (act === 'answer') r = jm.answerPanel(job, req.body?.answers || {});
      else if (act === 'memory') r = jm.setMemory(job, req.body?.value ?? null, { byUser: true }); // lane jobs-memory-bound: the job's properties (0 = unbounded: the owner's call)
      // the user EXPANDED the row (triage §13 rule 1c): a terminal one-shot is
      // acknowledged by the person who opened it; anything else is a no-op
      else if (act === 'seen') { const changed = jm.markAck(job, 'user-opened'); if (changed) jm._save(); return res.json({ success: true, changed, ack: M.ackState(job) }); }
      else if (act === 'access') {
        for (const k of ['view', 'control']) if (req.body?.[k] && ['session', 'group', 'all'].includes(req.body[k])) job.access[k] = req.body[k];
        job.access.lockedBy = req.body?.lock === false ? null : req.body?.lock === true ? 'user' : job.access.lockedBy;
        if (['on', 'off', 'inherit'].includes(req.body?.notify)) job.notify = req.body.notify === 'inherit' ? undefined : req.body.notify; // per-job auto-notify override (2.344.2)
        jm._touch(job); jm._save();
        return res.json({ success: true, access: job.access, notify: job.notify || 'inherit' });
      }
      else return res.status(400).json({ error: `unknown action "${act}"` });
      if (r.error) return res.status(r.code === 'stale-panel' ? 409 : 400).json({ error: r.error, ...(r.code ? { code: r.code } : {}), ...(Number.isInteger(r.version) ? { version: r.version } : {}) }); // r6 D-F5: a refused answer is named (stale-panel / version-required)
      res.json({ success: true, ...r });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // lane job-secrets-retire: GET/POST /api/jobs-secrets (a plaintext data/job-secrets.json no client wrote) are gone —
  // a job's secret comes from the vault (job-model vetSpec refuses a named envFrom `envfrom_retired`)
  // read-only escape visibility: hand-rolled systemd/crontab jobs OUTSIDE the registry
  app.get('/api/jobs-escapes', (req, res) => {
    const out = { systemd: [], crontab: [] };
    execFile('systemctl', ['--user', 'list-units', '--type=service,timer', '--state=running,active', '--no-legend', '--plain'], { timeout: 5000 }, (e, so) => {
      if (!e && so) out.systemd = so.split('\n').filter((l) => l.trim() && !/^(vibespace|dbus|pipewire|wireplumber|gvfs|xdg|gnome|tracker|at-spi|pulse)/.test(l.trim())).map((l) => l.trim().split(/\s+/)[0]).slice(0, 40);
      execFile('crontab', ['-l'], { timeout: 5000 }, (e2, so2) => {
        if (!e2 && so2) out.crontab = so2.split('\n').filter((l) => l.trim() && !l.startsWith('#')).slice(0, 40);
        res.json(out);
      });
    });
  });

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
        try {
          s.pty.write(JSON.stringify({ type: 'control_request', request_id: `vs-csi-${++csiSeq}`, request: { subtype: 'apply_flag_settings', settings: { crossSessionInbound: 'accept' } } }) + '\n');
          s._csiAccepted = true;
        } catch (e) { log('[jobs] accept push failed for a session:', e.message); }
      }
    } catch (e) { log('[jobs] accept catch-up failed:', e.message); }
  };

  return {
    jm,
    getJobs: () => jm,
    initAfterListen: () => {
      try { jm.init(); } catch (e) { log('[jobs] init threw (isolated):', e.message); }
      // two passes: dtach re-attaches trickle in after boot
      const t1 = setTimeout(pushAcceptToLiveSessions, 5000);
      const t2 = setTimeout(pushAcceptToLiveSessions, 60_000);
      t1.unref?.(); t2.unref?.();
    },
    shutdown: () => { try { jm.shutdown(); } catch { } },
  };
}

module.exports = { create };
