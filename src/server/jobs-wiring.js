// Background Work wiring (2.342.0, docs/design-background-work.md).
// create(deps) factory: constructs the JobManager, exposes the user-facing
// REST surface (cookie-authed — the panel), and the deferred init/shutdown
// hooks server.js calls. Engine failure NEVER blocks boot (§5).
'use strict';
const { execFile } = require('child_process');
const { JobManager } = require('../jobs.js');
const M = require('../job-model.js');
const peerMsg = require('../peer-messaging.js');
const fs = require('fs');
const path = require('path');

function create({ app, dataDir, broadcastAll, userTodos, log, serverSetting, taskGroups, activeSessions }) {
  const jm = new JobManager({
    dataDir,
    broadcast: (type, payload) => broadcastAll({ type, ...payload }),
    notifyUser: ({ text, urgency, jobId, jobName }) => {
      // sessionName = the JOB's name (owner roast 2.348.1: 'Background Work'
      // read like a phantom session); jobId lets the inbox row open the
      // interaction panel DIRECTLY instead of dumping the user in the window
      try { userTodos.add('jobs', { text, detail: jobId ? `Background job ${jobId}` : '', urgency: urgency || 'normal', by: 'agent', sessionName: jobName || 'background job', jobId }); } catch (e) { log('[jobs] notify failed:', e.message); }
    },
    log,
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
    peerReachable: (cid) => { try { return !!peerMsg.findPeer(cid); } catch { return false; } },
    deliverToConversation: async (cid, text) => {
      try {
        // lane 0 (EXPERIMENTAL, default OFF): the session's VibeSpace channel
        // — richer <channel source="vibespace"> framing when the session was
        // spawned with agents.vibespaceChannel on
        try {
          if (serverSetting('agents.vibespaceChannel') === true && activeSessions) {
            for (const [wid, s] of activeSessions) {
              if ((s.backendSessionId || s.claudeSessionId) !== cid) continue;
              const sock = path.join(dataDir, 'channel-socks', wid + '.sock');
              if (!fs.existsSync(sock)) continue;
              const rc = await peerMsg.postChannelEvent(sock, text, { kind: 'background_job' });
              if (rc.ok) return { ok: true, lane: 'channel', peerName: s.name || null };
            }
          }
        } catch (e) { log('[jobs] channel lane failed (falling through to peer inbox):', e.message); }
        // lane 1 (GA): the CLI's cross-session messaging inbox
        const peer = peerMsg.findPeer(cid);
        if (!peer) return { ok: false, reason: 'no live inbox for this conversation on this machine' };
        const r = await peerMsg.postToPeer(peer, text);
        if (!r.ok) { log(`[jobs] peer post to ${peer.socketPath} failed: ${r.reason}`); return { ok: false, reason: r.reason }; }
        return { ok: true, lane: 'message', peerName: peer.name || null };
      } catch (e) { log('[jobs] deliverToConversation threw:', e.message); return { ok: false, reason: e.message }; }
    },
  });

  const USER = { isUser: true, groups: new Set() };

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
    res.json({ jobs: [...jm.jobs.values()].map((j) => ({ ...enrichPublished(jm.snapshot(j), j), access: j.access, envKeys: Object.keys(j.cmd?.env || {}), envFrom: j.envFrom || [], runs: (j.runs || []).map((r) => ({ startedAt: r.startedAt, endedAt: r.endedAt || null, exit: r.exit ?? null, cause: r.cause || null, trigger: r.trigger })) })) });
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
    if (!job) return res.status(404).json({ error: 'no such job' });
    res.json({ job: { ...enrichPublished(jm.snapshot(job, { tail: Math.min(Number(req.query.tail) || 0, 1000) }), job), access: job.access, interaction: job.interaction, runs: job.runs } });
  });
  app.post('/api/jobs/:id/:act', (req, res) => {
    const job = jm.jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'no such job' });
    const act = req.params.act;
    try {
      let r;
      if (act === 'stop') r = jm.stop(job, { force: !!req.body?.force });
      else if (act === 'start') r = jm.start(job);
      else if (act === 'rm') r = jm.rm(job, { stop: !!req.body?.stop, orphan: !!req.body?.orphan });
      else if (act === 'answer') r = jm.answerPanel(job, req.body?.answers || {});
      else if (act === 'access') {
        for (const k of ['view', 'control']) if (req.body?.[k] && ['session', 'group', 'all'].includes(req.body[k])) job.access[k] = req.body[k];
        job.access.lockedBy = req.body?.lock === false ? null : req.body?.lock === true ? 'user' : job.access.lockedBy;
        if (['on', 'off', 'inherit'].includes(req.body?.notify)) job.notify = req.body.notify === 'inherit' ? undefined : req.body.notify; // per-job auto-notify override (2.344.2)
        jm._touch(job); jm._save();
        return res.json({ success: true, access: job.access, notify: job.notify || 'inherit' });
      }
      else return res.status(400).json({ error: `unknown action "${act}"` });
      if (r.error) return res.status(400).json({ error: r.error });
      res.json({ success: true, ...r });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // secrets: USER-UI ONLY writes (0600; values never returned — names only)
  app.get('/api/jobs-secrets', (req, res) => {
    try { res.json({ names: Object.keys(JSON.parse(fs.readFileSync(path.join(dataDir, 'job-secrets.json'), 'utf-8'))) }); }
    catch { res.json({ names: [] }); }
  });
  app.post('/api/jobs-secrets', (req, res) => {
    const { name, value, remove } = req.body || {};
    if (!name || !/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) return res.status(400).json({ error: 'name must be UPPER_SNAKE' });
    const file = path.join(dataDir, 'job-secrets.json');
    let store = {};
    try { store = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { }
    if (remove) delete store[name]; else store[name] = String(value || '');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
    fs.renameSync(tmp, file);
    try { fs.chmodSync(file, 0o600); } catch { }
    res.json({ success: true, names: Object.keys(store) });
  });
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

  const sweepChannelSocks = () => {
    try {
      const dir = path.join(dataDir, 'channel-socks');
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.sock')) continue;
        if (activeSessions && activeSessions.has(f.slice(0, -5))) continue;
        try { fs.unlinkSync(path.join(dir, f)); } catch { }
      }
    } catch { }
  };

  return {
    jm,
    getJobs: () => jm,
    initAfterListen: () => {
      try { jm.init(); } catch (e) { log('[jobs] init threw (isolated):', e.message); }
      // two passes: dtach re-attaches trickle in after boot
      const t1 = setTimeout(pushAcceptToLiveSessions, 5000);
      const t2 = setTimeout(() => { pushAcceptToLiveSessions(); sweepChannelSocks(); }, 60_000);
      t1.unref?.(); t2.unref?.();
    },
    shutdown: () => { try { jm.shutdown(); } catch { } },
  };
}

module.exports = { create };
