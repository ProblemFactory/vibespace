'use strict';
// THE TASK GROUPS' WIRING — everything server.js did for Task Groups, MOVED WHOLE out of it by the «make room» unit
// (主开发 2026-11-17 22:33Z: the next train carries every taken unit at once and server.js sat 14 lines under its line cap;
// «the cap means code moves out»). NO BEHAVIOUR CHANGE: server.js calls these three at the block's three OLD places, so the
// start-up effects keep their order (the sysinfo and incident wiring between them stays in server.js); the names other code
// reads (tasks, taskFanout, convOps, scheduleCtxSync, remoteCtxBaseFor) stay server.js names, bound where they were bound;
// every require runs inside its call — and where it ran, but ONE: require('../ctx-sync') loads two requires later than it
// did (server.js keeps src/machine-probes and src/rate-limit-capture.js at their place, just before the ctxSync call), and
// that is inert: none of the three runs code at load beyond requires already loaded (fs, path, crypto, mount-door,
// cli-caps). A name server.js defines LATER is handed in as a getter, so a call made before it exists throws where it
// threw — inside the same try.
//   createStore  — the store (src/task-groups.js TaskGroupManager; data/task-groups.json is AUTHORITATIVE) with its onChange
//                  re-judges, and THE broadcast (src/server/task-fanout.js)            (server.js 2.369.407 lines 660–687)
//   mountRoutes  — /api/tasks … (list · create · patch · delete · bind / unbind · progress · export / import) and the
//                  Context table's routes (src/server/task-context-routes.js)            (734–783)
//   ctxSync      — the remote context-folder auto-sync, its 60 s timer and the path translation  (785–792, 795–863)

/** → { tasks, taskFanout } — `exitProxy`, `channelsWiring`, `sessionStatus`, `mounts` are getters (server.js defines them later) */
function createStore({ app, wss, WS_OPEN, activeSessions, grants, persistenceRouter, serverSetting, sessionStatusKey, dataDir, exitProxy, channelsWiring, sessionStatus, mounts, userTodos = () => null, hosts = () => null }) {
  // ── Task Groups (岗位; task system — docs/design-task-system.md + refactor) ──
  // data/task-groups.json is AUTHORITATIVE for everything the board renders (the
  // store migrates the legacy data/tasks.json forward once). The one-time legacy
  // Groups migration (sessionGroups/groupFolders) runs in the constructor.
  const { TaskGroupManager } = require('../task-groups');
  const tasks = new TaskGroupManager({
    dataDir: dataDir, grants, // lane grants-unify: a group's outside visibility is its row of the ONE grants store
    readUserState: () => persistenceRouter.readUserState(),
    getSetting: (k) => serverSetting(k), isPathShadowed: (p) => { let s = null; try { s = mounts().shadowedBy(p); } catch { s = null; } if (s) return s; try { return require('../machine-mounts.js').pullShadowOf(p, { writer: true }); } catch { return null; } }, mirrorFs: () => app.locals.safeFs || null, isLiveKey: (k) => { for (const [id, s] of activeSessions) { const sk = sessionStatusKey(s, id); if (sk === k || sk.endsWith(':' + k)) return true; } return false; }, // lane cli-call-timeouts: TASK.md is mirrored through SafeFs, off the store write; lane task-group-fanout: an archived conversation still RUNNING keeps its groups until it ends
    onChange: (ch) => {
      try { taskFanout.note(ch && ch.ids); } catch { } // lane task-group-fanout: THE broadcast = a coalesced DELTA of the groups this write named (src/server/task-fanout.js); the store never travels whole (GET /api/tasks only)
      try { exitProxy().rejudgeAll('task-groups'); } catch { } try { channelsWiring().rosterChanged(); } catch { } /* lane roster-per-pass: the live roster's Task Groups half moved */ // verify-r2: a group change is a revoke too — open exit connections judged NOW (exitProxy is built later: a boot-time change is a caught TDZ)
      try { require('./groups-hold.js').noteChange(); } catch { }   // the follow-owed unit: the read that lifts a hold runs what waited for it (a group's browser cap)
      // identity verify r4 (2026-09-28): a Task Group change re-judges every browser lease a list admits THROUGH a Task
      // Group — a conversation removed from the group (or whose group is deleted) loses the kept profile AT ONCE like a
      // narrowing (its tab closes, a mediated grant is revoked), not at its next command. The keeper singleton is null before install.
      try {
        const rj = require('./browser-keeper.js').keeper()?.rejudgeAll?.('task-groups-changed');
        // each detached conversation hears it at its next message (layer ②, zero billed turns) — the PATCH's own notice
        for (const d of (rj && rj.detached) || []) {
          const s = d.sessionId ? activeSessions.get(d.sessionId) : null;
          if (!s) continue;
          const label = (() => { try { return require('./browser-keeper.js').keeper()?.profile?.(d.profileId)?.label || ''; } catch { return ''; } })();
          try { sessionStatus().pushNotice(sessionStatusKey(s, d.sessionId), { ...require('../browser-profiles.js').profileChangeNotice({ was: label, now: '', by: 'user', handles: [] }), kind: 'browser-profile' }); } catch { /* optional */ }
        }
      } catch (e) { console.warn('[browser] the Task Group change re-judge failed — ' + (e && e.message)); }
    },
    // THE STORE HELD UNREAD (lane bl-windows 2026-11-18): task-groups.json could not be read — the person is told ONCE by a For-you
    // notice (origin server, «This machine»), lifted when the store reads again. `userTodos` is a getter: server.js builds the
    // For-you store later than this one, so a hold at the boot is said once it exists (the store tries again; a throw = not yet)
    // itemKey 'store': ONE item per (key, store) — a second held start finds the open one (user-todos' producer identity), never a second
    unreadNotice: {
      say: (w) => { const td = userTodos(); if (!td) return null; const it = td.add('task-groups-unread', { origin: 'server', kind: 'notice', urgency: 'high', by: 'system', sessionName: 'Task Groups', itemKey: 'store', text: w.text, detail: w.detail, i18n: w.i18n }); return it && it.id ? it.id : null; },
      lift: (id) => { const td = userTodos(); if (!td || !id) return; const open = td.idsWhere((i) => i.id === id && i.status === 'open'); if (open.length) td.setStatusMany(open, 'done', 'system'); }, // only an OPEN one (a person's dismissal stays theirs)
      closeOpen: () => { const td = userTodos(); if (!td) throw new Error('the For-you store is not up yet'); if (typeof td.isHeldUnread === 'function' && td.isHeldUnread()) { td.whenRead(() => { try { const ids = td.idsWhere((i) => i.sessionKey === 'task-groups-unread' && i.status === 'open'); if (ids.length) td.setStatusMany(ids, 'done', 'system'); } catch { } }, "the Task Groups store's stale notice"); return; }   /* B-44f3: For you held — its list reads empty: closed at its read */ const open = td.idsWhere((i) => i.sessionKey === 'task-groups-unread' && i.status === 'open'); if (open.length) td.setStatusMany(open, 'done', 'system'); },   // a held boot's notice, when a later start reads
    },
    hostRealOf: (hostId, cwd) => { const h = hosts(); if (h && !h.onRealCwdsMoved) h.onRealCwdsMoved = (pairs, hostId) => tasks.hostRealMoved(pairs, hostId); return h && typeof h.realCwdOf === 'function' ? h.realCwdOf(hostId, cwd) : null; },   // B-16d7: another machine's own real folder (its discovery's R fact); a moved one re-judges its groups
  });
  require('./groups-hold.js').setHeld(() => tasks.isHeldUnread());   // THE STORE HELD UNREAD (lane bl-windows): the hub's fact the roster doors hand their verdicts
  const taskFanout = require('./task-fanout.js').create({ list: () => tasks.list(), send: (json) => wss.clients.forEach((c) => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } }) }); // lane task-group-fanout: the ONE tasks-updated broadcaster ({epoch, base, seq} — a client off `base` re-fetches)
  // B-fcc7 (read 6): a TASK.md skipped while a machine's pull folder was away (isPathShadowed) is written once the pull is up again —
  // the cloud storages' mounts-updated does it for theirs
  require('../machine-mounts.js').onPullLive(() => { try { tasks.syncAllContextMd(); } catch { } });
  return { tasks, taskFanout };
}

/** the Task Groups' routes, mounted where server.js mounted them → { convOps } (server.js reads it later: the session list's notify
 *  point settles birth groups through it) */
function mountRoutes({ app, tasks, taskFanout, activeSessions, sameToken, serverSetting, sessionStatusKey, spendGuard }) {
  // THE STORE HELD UNREAD (lane bl-windows): every Task Groups route but the list answers a held store BY NAME (503, TASK_GROUPS_UNREAD)
  // before it reads a group (never «not found» for a store that is held, not empty); the list answers none, with `unread` saying why
  app.use('/api/tasks', (req, res, next) => { const held = req.method === 'GET' && (req.path === '/' || req.path === '') ? null : tasks.unreadRefusal?.('this request'); if (held) return res.status(503).json({ error: held, code: 'TASK_GROUPS_UNREAD', unread: tasks.unreadState() }); next(); });
  app.get('/api/tasks', (req, res) => { const at = taskFanout.mark(); const unread = tasks.unreadState?.() || null; res.json({ tasks: tasks.list(), ...at, ...(unread ? { unread } : {}) }); }); require('./task-context-routes.js').mount(app, { tasks, serverSetting }); // lane task-group-context: the Context table's preview + path probe (no new line — the size ratchet)
  // lane lg-store-writes U5 (B-0248): an act's answer follows the STORE write (task-groups.json through the store writer — the
  // loop never waits); a write not landed is SAID in the answer (notOnDisk: the act stays applied in memory, the writer retries)
  // (the U4/U5 cure: on the writer's SYNCHRONOUS road — an answer still waiting when the hub stops goes out inside its exit flush)
  const onDisk = (res, body, notYet = null) => { if (typeof tasks.persisted !== 'function') { res.json(body); return; } tasks.persisted((saved) => { try { require('../store-writer.js').identityAtExit(res); res.json(saved ? body : { ...body, notOnDisk: true, ...(notYet || {}) }); } catch { } }); };
  app.post('/api/tasks', (req, res) => {
    try { onDisk(res, { success: true, task: tasks.create(req.body || {}, { bearer: !!require('../write-origin.js').pressBearer(req.headers) }) }); }
    catch (e) { res.status(e.code === 'parents_owner_only' ? 403 : 400).json({ error: e.message, ...(require('../task-groups.js').PARENT_REFUSALS.includes(e.code) ? { code: e.code } : {}) }); }
  });
  app.patch('/api/tasks/:id', (req, res) => {
    // B-0248 step 3 (r1436, the lost claim): a page's backlog change is ONE ROW (backlogRow / backlogAdd, src/task-groups.js backlogWithRow) —
    // a whole list from a page's copy would write an agent's claim, row or close that landed after it OUT of the store: refused by name
    // …but a page from before the update keeps what the person TYPED: its add (its copy + the one id-less row) is taken as that row
    if (req.body && req.body.backlog !== undefined) { const one = require('../task-groups.js').oldPageAdd(req.body); if (!one) return res.status(409).json({ error: 'this page is older than the hub — copy anything you typed, then reload the page (nothing was written: a backlog change is now sent one row at a time)', code: 'backlog_whole' }); req.body = { backlogAdd: one }; }
    // a row write's answer says the hub TOOK it as one row (`backlogRows`): a page newer than its hub (an older hub ignores the row keys
    // and answers 200) tells the person so and keeps what was typed
    const rowWrite = !!(req.body && (req.body.backlogRow !== undefined || req.body.backlogAdd !== undefined));
    try { onDisk(res, { success: true, task: tasks.update(req.params.id, req.body || {}, { bearer: !!require('../write-origin.js').pressBearer(req.headers) }), ...(rowWrite ? { backlogRows: 1 } : {}) }); }
    catch (e) { res.status(e.message === 'task not found' ? 404 : e.code === 'except_unnamed' || e.code === 'parents_stale' || e.code === 'backlog_row_gone' || e.code === 'backlog_row_moved' ? 409 : e.code === 'parents_owner_only' ? 403 : 400).json({ error: e.message, ...(e.code === 'except_unnamed' || require('../task-groups.js').PARENT_REFUSALS.includes(e.code) || require('../task-groups.js').BACKLOG_REFUSALS.includes(e.code) ? { code: e.code } : {}), ...(e.code === 'parents_stale' && Array.isArray(e.parents) ? { parents: e.parents } : {}) }); }   // lane held-except-doors: a 除了 left out unnamed · the chain's cure (E): + the parent refusals' code
  });
  app.delete('/api/tasks/:id', (req, res) => {
    try { tasks.remove(req.params.id); onDisk(res, { success: true }, { code: 'finishes-on-landing' }); }   // the moved2 cure 2: its Activity log and grant follow by themselves at the landing
    catch (e) { res.status(e && e.code === 'EVSARCHIVEBUSY' ? 409 : 404).json({ error: e.message, ...(e && e.code === 'EVSARCHIVEBUSY' ? { code: e.code } : {}) }); }   // B-0248 step 3 (c) follow: an archive append still on its way — refused by name, the group stays
  });
  // Granular tag ops (atomic server-side — concurrent clients can't clobber
  // each other's read-modify-write of the sessions array)
  const convOps = require('./conversation-ops.js'); convOps.provide({ tasks, spendGuard }); // lane automation-verbs: the conversation verbs' seams reach the task store + THE spend guard (an automation open is charged there)
  app.post('/api/tasks/:id/bind', (req, res) => {
    try { onDisk(res, { success: true, task: convOps.bindConversation({ sessionKey: req.body?.sessionKey }, req.params.id, { kind: 'human', actBy: require('../device-audit.js').byOfReq(req) }) }); }
    catch (e) { res.status(e.message === 'task not found' ? 404 : 400).json({ error: e.message }); }
  });
  app.post('/api/tasks/:id/unbind', (req, res) => {
    try { onDisk(res, { success: true, task: tasks.unbind(req.params.id, req.body?.sessionKey) }); }
    catch (e) { res.status(e.message === 'task not found' ? 404 : 400).json({ error: e.message }); }
  });
  app.post('/api/tasks/:id/progress', (req, res) => {
    try { onDisk(res, { success: true, task: tasks.addProgress(req.params.id, req.body || {}) }); }
    catch (e) { res.status(e.message === 'task not found' ? 404 : 400).json({ error: e.message }); }
  });
  // OLDER ACTIVITY (2.369.204): one page of a group's Activity log older than ?before=<ms> (≤ ?limit=200) — the live
  // list, then data/task-groups-archive/ — for the Task log window's scroll. The owner (cookie); an agent's token reads
  // only a group it belongs to (the vibespace-task scope), a job token none.
  const progressRead = new WeakSet();   // B-55dc: the requests whose membership read already ran
  app.get('/api/tasks/:id/progress', function progressRoute(req, res) {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (/^(vsst_|jbt_)/.test(bearer)) {
      const hit = bearer.startsWith('vsst_') ? [...activeSessions].find(([, s]) => sameToken(bearer, s.agentToken)) : null;
      // B-55dc THE DECIDING DOOR: «not a member» refuses an agent here — decided on a READ answer (awaited off the loop,
      // bounded), the route entered again once it settled
      if (hit && !progressRead.has(req) && typeof tasks.membershipRead === 'function') {
        const p = tasks.membershipRead({ sessionKey: sessionStatusKey(hit[1], hit[0]), cwd: hit[1].cwd, hostId: hit[1].host || null, initialGroupId: hit[1]._initialGroupId, initialGroupIds: hit[1]._initialGroupIds });
        if (p) { progressRead.add(req); p.then(() => progressRoute(req, res), () => progressRoute(req, res)); return; }
      }
      const mine = !!hit && tasks.groupsForSession({ sessionKey: sessionStatusKey(hit[1], hit[0]), cwd: hit[1].cwd, hostId: hit[1].host || null, initialGroupId: hit[1]._initialGroupId, initialGroupIds: hit[1]._initialGroupIds }).some((g) => g.id === req.params.id);
      if (!mine) return res.status(403).json({ error: 'this session does not belong to that Task Group', code: 'not_member' });
    }
    try { res.json({ success: true, ...tasks.readProgress(req.params.id, { before: req.query.before, limit: req.query.limit }) }); }
    catch (e) { res.status(e.message === 'task not found' ? 404 : 400).json({ error: e.message }); }
  });
  // P4 repo task files: export a task to a committable markdown file / import one.
  app.post('/api/tasks/:id/export', async (req, res) => {   // B-ddf3 (r4361): the export is written off the loop, its failure named
    try { res.json({ success: true, path: await tasks.exportToFile(req.params.id, req.body?.path) }); }
    catch (e) { res.status(e.message === 'task not found' ? 404 : 400).json({ error: e.message }); }
  });
  app.post('/api/tasks/import', (req, res) => {
    try { onDisk(res, { success: true, task: tasks.importFromFile(req.body?.path) }); }
    catch (e) { const ar = !!e && (e.code === 'EVSARCHIVEBUSY' || e.code === 'EVSARCHIVEFAILING'); res.status(ar ? (e.code === 'EVSARCHIVEFAILING' ? 503 : 409) : 400).json({ error: e.message, ...(ar ? { code: e.code } : {}) }); }   // r2292: the archive's owed write first — held (409) or failing (503), refused by name
  });
  return { convOps };
}

/** → { syncRemoteGroupCtx, ctxGroupsOf, scheduleCtxSync, remoteCtxBaseFor } — and the 60 s timer started HERE, where server.js
 *  started it; `hosts` is a getter (server.js defines it later) */
function ctxSync({ tasks, hosts, activeSessions, integrationEnabled, serverNotice, sessionStatusKey }) {
  // ── Remote context-folder auto-sync ("mount"): a REMOTE session's belonged
  // groups with a contextDir get a live-synced copy at
  // <remoteHome>/.vibespace/ctx/<groupId> (bidirectional rsync, newer-wins, no
  // deletes, .vibespace excluded), and the injected file index is path-translated
  // to the remote copy (remoteCtxBase). Triggers: session spawn + a 60s timer
  // while any live remote session belongs to the group. Remote writes sync back
  // → the local signature changes → every member re-injects next turn. ──
  const { syncGroupCtx, FILE_CAP: CTX_FILE_CAP, MAX_FILES: MAX_CTX_FILES } = require('../ctx-sync');
  const _ctxSyncBusy = new Set(); // `${hostId}:${groupId}` in-flight guard
  const _ctxSkipNoticed = new Set(); // one honest notice per host:group:file per boot
  async function syncRemoteGroupCtx(h, g) {
    const key = `${h.id}:${g.id}`;
    if (_ctxSyncBusy.has(key)) return;
    _ctxSyncBusy.add(key);
    try {
      const home = await hosts().homeDir(h);
      if (!home) return;
      const rdir = `${home}/.vibespace/ctx/${g.id}`;
      // ONE implementation for every transport (src/ctx-sync.js, 2.277.0):
      // hashed newer-wins sync over the device link; ssh degrades to its legacy
      // rsync pair when the link is down. The old split (ssh=rsync uncapped,
      // dial=hashed with a SILENT 2MB/400-file cap) meant a 3MB context file
      // reached every ssh host and never reached a dial device, invisibly.
      await syncGroupCtx({
        hosts: hosts(), host: h, group: g, remoteDir: rdir,
        onSkip: (rel, why, size) => {
          const k = `${key}:${rel}:${why}`;
          if (_ctxSkipNoticed.has(k)) return;
          _ctxSkipNoticed.add(k);
          const msg = why === 'count'
            ? `Context folder for "${g.title || g.id}" has more than ${MAX_CTX_FILES} files — the rest won't sync to ${h.name}.`
            : `Context file ${rel} (${Math.round((size || 0) / 1024 / 1024)}MB) exceeds the ${Math.round(CTX_FILE_CAP / 1024 / 1024)}MB sync cap and won't reach ${h.name}.`;
          console.warn('[ctx-sync]', msg);
          try { serverNotice(`ctx-skip:${k}`, msg, { level: 2 }); } catch { }
        },
      });
    } catch (e) { console.warn('[ctx-sync]', h.name, g.id, e.message); }
    finally { _ctxSyncBusy.delete(key); }
  }
  // Groups a session belongs to that have a syncable context folder.
  function ctxGroupsOf(session, id) {
    if (!session.host) return [];
    return tasks.groupsForSession({ sessionKey: sessionStatusKey(session, id), cwd: session.cwd, hostId: session.host || null, initialGroupId: session._initialGroupId, initialGroupIds: session._initialGroupIds })
      .map((g) => tasks.view(g.id)).filter((g) => g.contextDir && g.injectContext !== false);   // lane task-group-context: the view's contextDir = the 记笔记 row
  }
  function scheduleCtxSync(session, id) {
    try {
      if (!session.host || !hosts()) return;
      let h; try { h = hosts().get(session.host); } catch { return; }
      for (const g of ctxGroupsOf(session, id)) syncRemoteGroupCtx(h, g);
    } catch { }
  }
  setInterval(() => {
    try {
      if (!integrationEnabled()) return; // master switch off ⇒ no ctx-folder pushes either
      const seen = new Set();
      for (const [id, s] of activeSessions) {
        if (!s.host) continue;
        let h; try { h = hosts().get(s.host); } catch { continue; }
        for (const g of ctxGroupsOf(s, id)) {
          const k = s.host + ':' + g.id;
          if (seen.has(k)) continue;
          seen.add(k);
          syncRemoteGroupCtx(h, g);
        }
      }
    } catch { }
  }, 60000);
  // Absolute remote path the injection should show for a group's context folder
  // (null → local session, keep local paths). Uses the cached remote home; if
  // the home isn't known yet (first contact) fall back to local paths this turn.
  function remoteCtxBaseFor(session) {
    if (!session.host || !hosts()) return null;
    const home = hosts()._homes?.get(session.host);
    if (!home) { try { hosts().homeDir(hosts().get(session.host)); } catch { } return null; } // warm the cache async
    return (gid) => `${home}/.vibespace/ctx/${gid}`;
  }
  return { syncRemoteGroupCtx, ctxGroupsOf, scheduleCtxSync, remoteCtxBaseFor };
}

module.exports = { createStore, mountRoutes, ctxSync };
