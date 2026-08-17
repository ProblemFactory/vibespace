// Background Work wiring (2.342.0, docs/design-background-work.md).
// create(deps) factory: constructs the JobManager, exposes the user-facing
// REST surface (cookie-authed — the panel), and the deferred init/shutdown
// hooks server.js calls. Engine failure NEVER blocks boot (§5).
'use strict';
const { execFile } = require('child_process');
const { JobManager } = require('../jobs.js');
const M = require('../job-model.js');
const fs = require('fs');
const path = require('path');

function create({ app, dataDir, broadcastAll, userTodos, log }) {
  const jm = new JobManager({
    dataDir,
    broadcast: (type, payload) => broadcastAll({ type, ...payload }),
    notifyUser: ({ text, urgency, jobId }) => {
      try { userTodos.add('jobs', { text, detail: jobId ? `Background job ${jobId} — open the Background Work window` : '', urgency: urgency || 'normal', by: 'agent', sessionName: 'Background Work' }); } catch (e) { log('[jobs] notify failed:', e.message); }
    },
    log,
  });

  const USER = { isUser: true, groups: new Set() };

  // ── user REST (cookie-authed): the panel sees and controls everything ──
  app.get('/api/jobs', (req, res) => {
    if (!jm.ready) return res.status(503).json({ error: jm.initError ? `jobs engine down: ${jm.initError}` : 'jobs engine starting' });
    res.json({ jobs: [...jm.jobs.values()].map((j) => ({ ...jm.snapshot(j), access: j.access, envKeys: Object.keys(j.cmd?.env || {}), envFrom: j.envFrom || [], runs: (j.runs || []).map((r) => ({ startedAt: r.startedAt, endedAt: r.endedAt || null, exit: r.exit ?? null, cause: r.cause || null, trigger: r.trigger })) })) });
  });
  app.get('/api/jobs/:id', (req, res) => {
    const job = jm.jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'no such job' });
    res.json({ job: { ...jm.snapshot(job, { tail: Math.min(Number(req.query.tail) || 0, 1000) }), access: job.access, interaction: job.interaction, runs: job.runs } });
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
        jm._touch(job); jm._save();
        return res.json({ success: true, access: job.access });
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

  return {
    jm,
    getJobs: () => jm,
    initAfterListen: () => { try { jm.init(); } catch (e) { log('[jobs] init threw (isolated):', e.message); } },
    shutdown: () => { try { jm.shutdown(); } catch { } },
  };
}

module.exports = { create };
