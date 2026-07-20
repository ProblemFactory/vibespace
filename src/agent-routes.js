/**
 * Agent-facing routes — extracted verbatim from server.js (2.92.0 split).
 * Everything the vibespace-* CLI tools and the harness hooks talk to:
 * user-todo (vibespace-ask), session-status (vibespace-status), the context
 * injection endpoints (task-context / prompt-context, incl. the user preamble
 * + per-turn extras), the stop-check nudge arbiter, and the vibespace-task
 * progress endpoints. Injection ORDER + SIZE are load-bearing — read the
 * CLAUDE.md notes on renderContext/persisted-output before touching payloads.
 */
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function setupAgentRoutes({ app, activeSessions, tasks, sessionStatus, SessionStatusManager, userTodos, sessionStatusKey, serverSetting, integrationEnabled, scheduleCtxSync, remoteCtxBaseFor, readUserState }) {
app.post('/api/agent/user-todo', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  if (!toolOn('Ask')) return toolDisabled(res, 'vibespace-ask');
  const [s, id] = hit;
  const key = sessionStatusKey(s, id);
  if (!key.startsWith('webui:')) userTodos.rekey(`webui:${id}`, key); // migrate early items once the real id exists
  const { add, list, resolve } = req.body || {};
  try {
    if (list) return res.json({ success: true, sessionKey: key, items: userTodos.forSession([key, `webui:${id}`]) });
    if (resolve) return res.json({ success: true, item: userTodos.resolveByAgent(key, resolve) });
    if (add && add.text) {
      const item = userTodos.add(key, { text: add.text, detail: add.detail, urgency: add.urgency, by: 'agent', sessionName: s.name || null });
      return res.json({ success: true, item });
    }
    res.status(400).json({ error: 'pass {add:{text,...}} | {list:true} | {resolve:"id or text"}' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/session-status', (req, res) => res.json({ statuses: sessionStatus.snapshot() }));
// User set/override/clear from the UI (cookie-authed like every route)
app.post('/api/session-status', (req, res) => {
  const { sessionKey, state, urgency, reason, clear } = req.body || {};
  if (!sessionKey || typeof sessionKey !== 'string') return res.status(400).json({ error: 'sessionKey required' });
  try {
    const rec = clear ? sessionStatus.clear(sessionKey, 'user') : sessionStatus.setByUser(sessionKey, { state, urgency, reason });
    res.json({ success: true, status: rec });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Agent endpoint — authenticated ONLY by the per-session token spawned into
// the agent's env (VIBESPACE_SESSION_TOKEN); exempt from cookie auth in
// auth.middleware. The token scopes writes to the agent's own session.
app.post('/api/agent/session-status', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
  if (!token || !token.startsWith('vsst_')) return res.status(401).json({ error: 'missing session token' });
  let found = null, foundId = null;
  for (const [id, s] of activeSessions) { if (s.agentToken === token) { found = s; foundId = id; break; } }
  if (!found) return res.status(401).json({ error: 'unknown session token' });
  if (!toolOn('Status')) return toolDisabled(res, 'vibespace-status');
  const key = sessionStatusKey(found, foundId);
  // migrate an early webui:<id> record once the real backend id exists
  if (!key.startsWith('webui:')) sessionStatus.rekey(`webui:${foundId}`, key);
  const { state, urgency, reason, detail, clear, show } = req.body || {};
  // Waiting states are USELESS on the board without a reason the user can act
  // on — reject them (the error text teaches the fix at the point of use).
  // Grace: a follow-up tweak (e.g. bumping --urgency) on a record that already
  // carries a reason for the SAME state passes without re-sending it.
  const WAITING = new Set(['blocked', 'needs-input', 'review']);
  if (!show && !clear && WAITING.has(state) && (!String(reason || '').trim() || !String(detail || '').trim())) {
    const existing = sessionStatus.get(key);
    const existingComplete = existing && existing.state === state
      && String(existing.reason || '').trim() && String(existing.detail || '').trim();
    if (!existingComplete) {
      return res.status(400).json({ error: `"${state}" needs BOTH a one-line --reason (what you're waiting on) AND --detail (full context: options, what you tried, your recommendation) — e.g. vibespace-status ${state} --reason "waiting for the API key" --detail "Deploy needs OPENAI_API_KEY; .env and 1Password checked, not there. Recommend the user paste it in chat." [--urgency high]. Then say it in chat and mirror it with vibespace-ask.` });
    }
  }
  try {
    const rec = show ? sessionStatus.get(key)
      : clear ? sessionStatus.clear(key, 'agent')
      : sessionStatus.setByAgent(key, { state, urgency, reason, detail });
    res.json({ success: true, sessionKey: key, status: rec });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Status-change history for the expanded card's timeline. Accepts a comma
// list of keys (backend:id + webui:<serverId> placeholder) — first hit wins.
app.get('/api/session-status/history', (req, res) => {
  const keys = String(req.query.sessionKey || '').split(',').filter(Boolean);
  for (const k of keys) {
    const h = sessionStatus.history(k);
    if (h.length) return res.json({ history: h });
  }
  res.json({ history: [] });
});
// Resolve the calling agent's session from its per-session bearer token.
// Returns [session, id] or replies 401/403 and returns null.
function agentSession(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
  if (!token || !token.startsWith('vsst_')) { res.status(401).json({ error: 'missing session token' }); return null; }
  for (const [id, s] of activeSessions) {
    if (s.agentToken === token) return [s, id];
  }
  res.status(401).json({ error: 'unknown session token' });
  return null;
}
// Resolve which Task Group a vibespace-task call targets. Belonging is LIVE-
// derived (groupsForSession — explicit tag / auto-include folder / spawned-into
// group), so a UI bind takes effect with no respawn. Isolation is ENFORCED: an
// explicit --group must be one this session belongs to. 0 groups → 403; >1
// without --group → 400 (agent must disambiguate). Returns a group id or null
// (and has already replied).
function resolveAgentGroup(hit, req, res) {
  const [s, id] = hit;
  const key = sessionStatusKey(s, id);
  const groups = tasks.groupsForSession({ sessionKey: key, cwd: s.cwd, initialGroupId: s._initialGroupId });
  const want = String(req.query?.group || req.body?.group || '').trim();
  if (want) {
    const g = groups.find((x) => x.id === want);
    if (g) return g.id;
    // A designated Group MANAGER may target ANY group by explicit --group
    // (2.152.0, user directive: manager scope = ALL groups, not belonging) —
    // so a manager can log progress / park backlog / read `show` anywhere.
    if (isManagerSession(key)) {
      try { tasks.get(want); return want; }
      catch { res.status(404).json({ error: `no Task Group ${want} (run \`vibespace-task group-list\`)` }); return null; }
    }
    res.status(403).json({ error: `this session does not belong to Task Group ${want}` });
    return null;
  }
  if (!groups.length) {
    res.status(403).json({ error: 'this session is not in any Task Group' + (isManagerSession(key) ? ' — as a Group manager, target one explicitly: --group <id> (see `vibespace-task group-list`)' : '') });
    return null;
  }
  if (groups.length === 1) return groups[0].id;
  res.status(400).json({ error: `this session belongs to ${groups.length} Task Groups — pass --group <id> (one of: ${groups.map((g) => g.id).join(', ')})` });
  return null;
}
// A designated GROUP MANAGER (2.132.0 double gate: global setting + the
// per-session Session-Properties toggle stored in user-state). Shared by the
// group-admin route, resolveAgentGroup's explicit-group bypass, and context
// injection (which teaches the manager its powers). Both reads are cached
// (serverSetting / persistence readUserState), so per-prompt calls are cheap.
// A webui:<id> key (backend id not yet adopted) is never a manager — the
// toggle is stored under the backend:backendSessionId form.
function isManagerSession(key) {
  if (!serverSetting('agents.allowGroupManagement')) return false;
  if (!key || key.startsWith('webui:')) return false;
  const us = (readUserState && readUserState()) || {};
  return ((us.sessionConfigs || {})[key] || {}).groupManager === true;
}
// Taught ONCE to a designated manager session (2.152.0, user directive: the
// manager must LEARN its powers in context — before this, nothing ever told
// the agent it was a manager). Discovery-layer style: trigger + copy-ready
// invocation per verb; details live in the CLI's own no-args usage.
const MANAGER_INTRO = [
  '<vibespace-group-manager>',
  'The user designated THIS session a Task Group MANAGER: you may organize ALL Task Groups on this VibeSpace — not just the ones this session belongs to. Every admin op is audited into that group\'s activity log under your session key.',
  'See every group (id, title, archived, session count) — always check before creating, to avoid duplicates:',
  '```',
  'vibespace-task group-list',
  '```',
  'Create or reconfigure a group:',
  '```',
  'vibespace-task group-create --title "..." [--objective "..."] [--context-dir ~/path] [--folder ~/path]',
  'vibespace-task group-update <id> [--title "..."] [--objective "..."] [--context-dir ~/path] [--archived true|false]',
  '```',
  'Bind / unbind a session (omitting --session means THIS session):',
  '```',
  'vibespace-task group-bind <id> [--session <backend:sessionId>]',
  'vibespace-task group-unbind <id> [--session <backend:sessionId>]',
  '```',
  'The regular verbs (show / progress / backlog-* …) also accept ANY group via `--group <id>` for you — belonging is not required.',
  'Limits: contextDir/folders must live under the user-allowlisted roots (setting agents.groupManagementRoots); there is NO group delete — destructive ops stay with the user.',
  '</vibespace-group-manager>',
].join('\n');

// Baseline tools intro for ANY VibeSpace-managed session (even without a task):
// teaches the agent to report its own status. Task-bound sessions get the full
// task context instead (which already includes both tools' usage).
// User-configured extra instructions injected at the TOP of hook deliveries
// (Manage Agents → Agent instructions). Delivered like group content: once per
// session, re-delivered when the text changes (seen-hash gate) — never per turn.
function customPreamble() {
  try {
    const v = String(serverSetting('agents.injectPreamble') || '').trim();
    return v ? v.slice(0, 4000) : '';
  } catch { return ''; }
}
// Per-surface extras (2.88.0): short user text prepended INSIDE the other two
// injection surfaces. Kept separate from the preamble — the per-turn one costs
// tokens EVERY prompt, so it gets its own (small) budget and its own field.
function customExtra(key, cap) {
  try {
    const v = String(serverSetting(key) || '').trim();
    return v ? v.slice(0, cap) : '';
  } catch { return ''; }
}
function preambleBlock(text) {
  return `<vibespace-user-instructions>\nThe VibeSpace user configured these standing instructions for every agent session — follow them alongside your other guidance:\n\n${text}\n</vibespace-user-instructions>`;
}
// Prepend the preamble to an outgoing delivery when unseen/changed; returns the
// (possibly unchanged) parts array. sessionObj carries the seen-hash.
function withPreamble(sessionObj, parts) {
  const text = customPreamble();
  if (!text) return parts;
  const hash = require('crypto').createHash('sha1').update(text).digest('hex').slice(0, 12);
  if (sessionObj._preambleSeen === hash) return parts;
  // Deliver with (or without) other content — the preamble alone still counts.
  sessionObj._preambleSeen = hash;
  return [preambleBlock(text), ...parts];
}

// Built per delivery since 2.211.0 — the per-feature Integration toggles are
// liveApply, and teaching a DISABLED tool (whose endpoint refuses) would
// train agents into dead ends. All-on output is byte-identical to the old
// static SESSION_TOOLS_INTRO. Returns '' when nothing session-level is
// enabled (status+ask both off) — the abs-path/exit advice alone isn't worth
// a delivery.
function sessionToolsIntro(T) {
  if (!T.status && !T.ask) return '';
  const L = ['<vibespace-session-tools>'];
  if (T.status) {
    L.push(
      'This session is running inside VibeSpace. Report your OWN status so the user can see it on their session board — use the `vibespace-status` command (already on your PATH):',
      '  vibespace-status <working|needs-input|blocked|review|done> [--urgency low|normal|high|urgent] [--reason "why"]',
      '  vibespace-status show   (or run it with no arguments) — prints usage + your current status',
      'Keep it honest and current: `working` while making progress; `blocked` or `needs-input` (with a higher urgency) the moment you are stuck or waiting on the user; `review` when you want them to look; `done` when this piece of work is finished.');
  } else {
    L.push('This session is running inside VibeSpace.');
  }
  if (T.ask) {
    L.push(
      'Whenever you ask the user ANYTHING — a question in chat, or ending a turn waiting on their decision/input/review — ALSO file it on their global inbox with `vibespace-ask`. They are often NOT watching this window; the inbox is how they find waiting questions across all sessions:',
      '  vibespace-ask "question or decision needed" [--detail "context + your recommendation"] [--urgency low|normal|high|urgent]',
      '  vibespace-ask list  /  vibespace-ask resolve <id|text>',
      'The MOMENT the user answers (in chat or anywhere), resolve the item YOURSELF with `vibespace-ask resolve` — never leave answered items for them to tick. Not for your own working steps — those belong in your normal todo list.',
      'The inbox item is a NOTIFICATION MIRROR, not the message itself: everything you file (the question, options, your recommendation) must ALSO appear IN FULL in your chat reply — never say something only in the inbox (the user reads and copies from chat; inbox rows are hard to read at length).');
  }
  L.push(
    'When your reply references files you created or discuss (audio, images, reports, code, HTML…), write their ABSOLUTE paths — the chat UI turns absolute paths into clickable links that open in the right viewer (audio plays, images preview, HTML renders). Bare filenames or project-relative paths may not resolve.',
    'If a request needs a DIFFERENT machine\'s network position (a region, an internal/VPN network, a fixed source IP), you can borrow a paired machine\'s network for that ONE command with `vibespace-exit` (default: go direct — only reach for an exit deliberately):',
    '  vibespace-exit list                     machines the user enabled as exits',
    '  eval "$(vibespace-exit use <machine>)"; curl https://ifconfig.me   (borrow its egress via SOCKS for proxy-aware TCP tools)',
    '  vibespace-exit run <machine> -- <cmd>   run the command ON that machine (universal: ICMP/UDP/proxy-unaware tools/its own DNS)',
    '  (SOCKS can\'t carry ping/UDP and needs a proxy-aware tool — when `use` won\'t work, `run` will. Nothing is available until the user enables a machine as an exit.)');
  if (T.task) L.push('(If this session is later linked to a VibeSpace task, you will also get `vibespace-task` for task-level progress/plan/status — you have no task right now, so it is not active yet.)');
  L.push('</vibespace-session-tools>');
  return L.join('\n');
}

// SessionStart hook payload (context injection): rendered task state + context
// folder file index + the rules. Fires + injects for Claude (terminal + chat).
// SCOPED to the session's OWN context task — the ?taskId= query is ignored so a
// token can never read another task's context. Records the task version the
// session has now "seen" so UserPromptSubmit only RE-injects on later changes.
app.get('/api/agent/task-context', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  // Integration master switch: empty delivery — covers sessions spawned BEFORE
  // the switch flipped off (their hook is still armed and keeps calling).
  if (!integrationOnMaster()) return res.json({ success: true, context: '' });
  try {
    const [s, id] = hit;
    const key = sessionStatusKey(s, id);
    const groups = tasks.groupsForSession({ sessionKey: key, cwd: s.cwd, initialGroupId: s._initialGroupId });
    // agents.contextInjection off (2.211.0) ⇒ no group content is injected at
    // all (falls through to the baseline tools intro) — the per-group
    // injectContext toggle stays the finer-grained instrument.
    const injectGroups = ctxInjectionOn() ? groups.filter((g) => g.injectContext !== false) : []; // P6: per-group context toggle
    let context = '';
    if (injectGroups.length) {
      // Remote sessions read the auto-synced copy — translate file paths
      context = tasks.renderMultiContext(injectGroups.map((g) => g.id), { ctxBaseFor: remoteCtxBaseFor(s), sessionKey: key, tools: enabledTools() });
      // Only Claude injects the SessionStart output; codex runs the command but
      // ignores it, so don't mark groups "seen" for codex (that would starve its
      // UserPromptSubmit delivery).
      if (context && s.backend !== 'codex') {
        s._groupSeenAt = s._groupSeenAt || {};
        s._ctxSig = s._ctxSig || {};
        s._groupSnap = s._groupSnap || {};
        for (const g of injectGroups) {
          s._groupSeenAt[g.id] = g.contentUpdatedAt || g.updatedAt;
          if (g.contextDir) s._ctxSig[g.id] = tasks.contextDirSignature(g.contextDir);
          // Snapshot what was just delivered — later updates diff against it
          // instead of re-injecting the whole group (2.113.0).
          s._groupSnap[g.id] = tasks.snapshotForDiff(g.id);
        }
      }
    } else if (s.backend !== 'codex' && !s._toolsIntroSeen) {
      // No INJECTABLE group (none at all, or every belonged group has
      // injectContext off): still teach vibespace-status once — the baseline
      // intro carries no group content, and an agent that never learns the
      // tool can't self-report.
      // In no group: still teach the agent to report its status (baseline), once.
      // codex ignores SessionStart output, so it gets this via prompt-context.
      context = sessionToolsIntro(enabledTools());
      if (context) s._toolsIntroSeen = true;
    }
    // Designated Group MANAGER: teach the admin verbs ONCE — whichever route
    // delivers first wins (s._mgrIntroSeen shared with prompt-context).
    if (s.backend !== 'codex' && !s._mgrIntroSeen && isManagerSession(key)) {
      context = context ? context + '\n\n' + MANAGER_INTRO : MANAGER_INTRO;
      s._mgrIntroSeen = true;
    }
    if (s.backend !== 'codex') { // codex ignores SessionStart output — don't burn the seen-gate
      const withPre = withPreamble(s, context ? [context] : []);
      context = withPre.length ? withPre.join('\n\n') : context;
    }
    res.json({ success: true, context });
  } catch (e) { res.status(404).json({ error: e.message }); }
});
// UserPromptSubmit hook payload — delivered through the harness's own prompt
// hook, NEVER by rewriting the user's message. Three things ride here:
//  1. Group context on the FIRST prompt when SessionStart didn't deliver it
//     (codex — it fires UserPromptSubmit but not SessionStart in app-server).
//  2. A per-group REFRESH whenever a Task Group this session belongs to changed
//     since the session last saw it — so any change (objective/plan/progress,
//     from the UI or another session's vibespace-task, or a new bind adding a
//     group) reaches the agent on its next turn. Gated per group on
//     updatedAt > _groupSeenAt[id] → no per-turn noise when nothing changed.
//  3. Any pending status-override notice (consumed once).
app.get('/api/agent/prompt-context', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  // Integration master switch (see task-context): no reminders, no group
  // context, no override notices — the turn reaches the CLI untouched.
  // Pending status-override notices are consumed AND DROPPED here: deferring
  // them would inject a stale days-old "your status was overridden" reminder
  // whenever the switch is re-enabled.
  if (!integrationOnMaster()) {
    try {
      const [s0, id0] = hit;
      for (const k of [sessionStatusKey(s0, id0), `webui:${id0}`]) sessionStatus.consumeNotice(k);
    } catch {}
    return res.json({ success: true, context: '' });
  }
  try {
    const [s, id] = hit;
    const key = sessionStatusKey(s, id);
    const parts = [];
    const toolFlags = enabledTools();
    const groups = tasks.groupsForSession({ sessionKey: key, cwd: s.cwd, initialGroupId: s._initialGroupId });
    // agents.contextInjection off ⇒ no group payloads/diffs (see task-context)
    const injectGroups = ctxInjectionOn() ? groups.filter((g) => g.injectContext !== false) : []; // P6: per-group context toggle
    if (injectGroups.length) {
      s._groupSeenAt = s._groupSeenAt || {};
      s._ctxSig = s._ctxSig || {};
      s._groupSnap = s._groupSnap || {};
      const multi = injectGroups.length > 1;
      const ctxBaseFor = remoteCtxBaseFor(s); // remote → translated file paths
      const firstGroups = [];   // never-delivered groups → full context below
      const changedDiffs = [];  // updated groups delivering as a DELTA
      const updatedFulls = [];  // updated groups needing a FULL re-delivery
      for (const g of injectGroups) {
        const seenAt = s._groupSeenAt[g.id];
        // User-written contextDir files don't bump updatedAt — a signature diff
        // (path/size/mtime of the indexed files) is how we notice them.
        const sig = g.contextDir ? tasks.contextDirSignature(g.contextDir) : '';
        const hadSig = s._ctxSig[g.id] !== undefined;
        const ctxChanged = hadSig && s._ctxSig[g.id] !== sig;
        // Gate on CONTENT changes only (title/objective/activity/
        // contextDir) — cosmetic edits (color, toggles, binds) bump updatedAt
        // but must not re-inject the whole group to every member.
        const contentAt = g.contentUpdatedAt || g.updatedAt;
        const metaChanged = contentAt > (seenAt || 0);
        if (seenAt === undefined) { firstGroups.push(g); continue; }
        if (metaChanged || ctxChanged) {
          // UPDATE, not first delivery — deliver only the DIFF vs the snapshot
          // from the last delivery (2.113.0, user request: the full re-inject
          // was several KB of repetition per change). No snapshot (older
          // session object / toggle off) or a STRUCTURAL change (contextDir)
          // → the old full "was UPDATED" payload.
          // Markers/snapshot advance at RENDER, not receipt — a delivery the
          // harness drops (hook 3s timeout) stays lost until the agent reads
          // `show --full`/TASK.md or the server restarts (ACCEPTED: same class
          // as the pre-existing seen-bump loss window; every diff carries the
          // full-state pointer as its self-heal, which the old full payloads
          // did not need but also did not have).
          const snap = s._groupSnap[g.id];
          const ctxBase = ctxBaseFor ? ctxBaseFor(g.id) : null;
          const changes = (injectDiffsEnabled() && snap)
            ? tasks.diffChanges(g.id, snap, { gid: multi ? `--group ${g.id} ` : '', ctxBase, oldSig: s._ctxSig[g.id] || '', newSig: sig, sessionKey: key })
            : null;
          if (changes) {
            // empty lines = a no-op edit (nothing the injection renders
            // changed) — say nothing, just advance the markers below.
            if (changes.lines.length) changedDiffs.push({ g, changes, ctxBase });
          } else {
            updatedFulls.push(g);
          }
          s._groupSeenAt[g.id] = contentAt;
          s._ctxSig[g.id] = sig;
          s._groupSnap[g.id] = tasks.snapshotForDiff(g.id);
        } else if (!hadSig && g.contextDir) {
          // Meta already seen (e.g. claude's SessionStart set _groupSeenAt) but
          // no contextDir baseline recorded yet — set it now WITHOUT re-injecting.
          s._ctxSig[g.id] = sig;
        }
        // Seen but no snapshot yet (session predates 2.113.0 in memory): leave
        // _groupSnap unset — the next change falls back to full delivery once,
        // which records the snapshot.
      }
      // ── Assemble the delivery: [manifest?] + ONE diff block + full blocks ──
      // N changed groups collapse into ONE combined <vibespace-task-update>
      // whose header ENUMERATES every changed group (user directive: stacked
      // per-group blocks + the ~2KB persisted-preview truncation could hide
      // the very fact that a second group changed).
      const diffBlock = !changedDiffs.length ? null
        : changedDiffs.length === 1
          ? tasks.renderDiffBlock(changedDiffs[0].g.id, changedDiffs[0].changes, { multi, ctxBase: changedDiffs[0].ctxBase })
          : tasks.renderContextDiffMulti(changedDiffs.map((x) => ({ id: x.g.id, changes: x.changes })));
      const fullBlocks = [];
      for (const g of updatedFulls) {
        const ctx = tasks.renderContext(g.id, { multi, ctxBase: ctxBaseFor ? ctxBaseFor(g.id) : null, sessionKey: key, tools: toolFlags });
        if (ctx) fullBlocks.push(`The Task Group below was UPDATED since you last saw it — this is the current state (supersedes any earlier copy).\n\n${ctx}`);
      }
      let newFullGroups = [];
      if (firstGroups.length) {
        // First delivery. ALL of the membership new (the codex first-prompt
        // path) → ONE layered multi-context (same format SessionStart uses)
        // instead of N full payloads each repeating the ~2.3KB tools section.
        // renderMultiContext states ABSOLUTE membership ("belongs to N Task
        // Groups"), so it is only used when it covers the WHOLE membership —
        // a subset call told a 3-group session it belongs to 2 (review-caught);
        // a partial set (group bound mid-session) renders per-group with the
        // count-free multi phrasing instead.
        const allNew = firstGroups.length === injectGroups.length;
        const fulls = (firstGroups.length > 1 && allNew)
          ? [tasks.renderMultiContext(firstGroups.map((g) => g.id), { ctxBaseFor, sessionKey: key, tools: toolFlags })].filter(Boolean)
          : firstGroups.map((g) => tasks.renderContext(g.id, { multi, ctxBase: ctxBaseFor ? ctxBaseFor(g.id) : null, sessionKey: key, tools: toolFlags })).filter(Boolean);
        if (fulls.length) {
          fullBlocks.push(...fulls);
          newFullGroups = firstGroups;
          for (const g of firstGroups) {
            s._groupSeenAt[g.id] = g.contentUpdatedAt || g.updatedAt;
            s._ctxSig[g.id] = g.contextDir ? tasks.contextDirSignature(g.contextDir) : '';
            s._groupSnap[g.id] = tasks.snapshotForDiff(g.id);
          }
        }
      }
      const blocks = [...(diffBlock ? [diffBlock] : []), ...fullBlocks];
      if (blocks.length > 1) {
        // MULTI-BLOCK delivery: Claude truncates an oversized persisted payload
        // to a ~2KB HEAD preview, so a plain one-after-the-other order can
        // erase every block after the first ENTIRELY (user directive). Head
        // MANIFEST names EVERY block + the rescue path (always inside any
        // preview); the small diff block goes first, big fulls last.
        const name = (g) => `"${g.title}" (${g.id})`;
        const kinds = [];
        if (diffBlock) kinds.push(`update diffs for: ${changedDiffs.map((x) => name(x.g)).join(', ')}`);
        if (updatedFulls.length) kinds.push(`FULL re-delivery of changed group(s): ${updatedFulls.map(name).join(', ')}`);
        if (newFullGroups.length) kinds.push(`the FULL context for group(s) NEW to this session: ${newFullGroups.map(name).join(', ')}`);
        parts.push(`<vibespace-delivery-note>This delivery contains, in order: ${kinds.join('; ')}. ${tasks._persistRescueLine()}</vibespace-delivery-note>`);
      }
      parts.push(...blocks);
    } else if (!s._toolsIntroSeen) {
      // No injectable group → baseline tools intro once (see task-context note).
      // In no group: deliver the baseline tools intro on the FIRST prompt (covers
      // codex — its app-server runs the hook but ignores SessionStart output).
      const intro = sessionToolsIntro(toolFlags);
      if (intro) { parts.push(intro); s._toolsIntroSeen = true; }
    }
    // Designated Group MANAGER: teach the admin verbs once (this route is
    // codex's ONLY delivery path; claude usually gets it via task-context).
    if (!s._mgrIntroSeen && isManagerSession(key)) {
      parts.push(MANAGER_INTRO);
      s._mgrIntroSeen = true;
    }
    // Oversize belt (2.113.0): full contexts + the mixed-delivery manifest
    // embed the persisted-output rescue line, lone diff blocks don't (each is
    // small) — but several parts can still cross Claude's ~10KB hook persist
    // threshold TOGETHER. If nothing in the payload teaches the rescue,
    // prepend it so a 2KB head preview always names the recovery path.
    if (parts.length && !parts.some((p) => p.includes('persisted-output')) && Buffer.byteLength(parts.join('\n\n'), 'utf-8') > 8000) {
      parts.unshift(tasks._persistRescueLine());
    }
    for (const k of [key, `webui:${id}`]) { // record may still be under webui:<id>
      const notice = sessionStatus.consumeNotice(k);
      if (notice) { parts.push(SessionStatusManager.renderNotice(notice)); break; }
    }
    // Remote session about to receive a fresh/updated context → make sure the
    // synced copy refreshes promptly too (busy-guard makes over-calling cheap).
    if (s.host && parts.length) scheduleCtxSync(s, id);
    // Per-turn micro-reminder (2.78.0, user request): when nothing bigger is
    // being delivered this prompt, a ~250-byte nudge keeps the tools present
    // in the agent's working context (the full rules injected at session start
    // scroll far behind on long sessions and usage decays). Gated by the
    // agents.perTurnToolReminder setting (default on).
    // User preamble rides on top of whatever this prompt delivers (or alone,
    // when newly set/changed) — codex's only delivery path is this route.
    const outParts = withPreamble(s, parts);
    const extra = customExtra('agents.perTurnExtra', 500);
    // "Per turn" means per turn: on prompts that already carry a bigger
    // delivery the extra still rides at the very top as its own block.
    if (outParts.length && extra) outParts.unshift(`<vibespace-reminder>${extra}</vibespace-reminder>`);
    if (!outParts.length) {
      const multi = injectGroups.length > 1;
      const mgrClause = isManagerSession(key) ? ' · you are a Group MANAGER: `vibespace-task group-list` + group-create/-update/-bind organize ALL groups (any verb takes --group <id>)' : '';
      // Per-feature toggles: the reminder lists only ENABLED tools (2.211.0).
      const segs = [];
      if (toolFlags.status) segs.push('vibespace-status <state> — keep your board state honest');
      if (toolFlags.ask) segs.push('vibespace-ask "q" — MIRROR every chat question onto their inbox (the FULL content still goes in your chat reply — the inbox is only the notification), and resolve <id|text> the moment they answer');
      if (toolFlags.task) segs.push(`vibespace-task ${multi ? '--group <id> ' : ''}progress "summary" — log finished work`);
      const std = perTurnReminderEnabled() && segs.length
        ? `Tools on PATH: ${segs.join(' · ')}${mgrClause}. Run any with no args for usage.`
        : '';
      // User extra rides at the TOP of the reminder block (per-hook custom,
      // 2.88.0); it delivers even with the standard reminder toggled off.
      const body = [extra, std].filter(Boolean).join('\n');
      if (body) outParts.push(`<vibespace-reminder>${body}</vibespace-reminder>`);
    }
    // ── Stay INLINE (verified 2026-07-13 by binary search) ──
    // Claude Code wraps a hook's additionalContext into a <persisted-output>
    // 2KB-preview + on-disk file at EXACTLY 10240 bytes = 10 KiB (10000 inline,
    // 10240 wrapped). Beyond that the agent must Read a file to see the full
    // context — exactly the 2.68.0 "never learned the tools" failure. Cap with
    // margin so the critical HEAD (tools/identity/objective — ordered
    // first) is always in-context; only the TAIL (oldest activity-log lines) is
    // dropped, and it's recoverable via `vibespace-task show --full`.
    let ctx = outParts.join('\n\n');
    const INLINE_CAP = 9600; // bytes; margin under the 10240 wrap threshold
    if (Buffer.byteLength(ctx, 'utf-8') > INLINE_CAP) {
      const ptr = `\n\n…[context trimmed to stay inline — run \`vibespace-task${injectGroups.length > 1 ? ' --group <id>' : ''} show --full\` for the rest]`;
      const room = INLINE_CAP - Buffer.byteLength(ptr, 'utf-8');
      let head = Buffer.from(ctx, 'utf-8').subarray(0, room).toString('utf-8');
      const nl = head.lastIndexOf('\n'); // clean cut at a line boundary (also avoids a split multibyte char)
      if (nl > room * 0.5) head = head.slice(0, nl);
      ctx = head + ptr;
    }
    res.json({ success: true, context: ctx });
  } catch (e) { res.json({ success: true, context: '' }); }
});
// Stop-time bookkeeping nudge (2.79.0): fired by the Stop hook (claude) and
// the codex wrapper's turn/completed. Returns block+reason ONLY when the
// session's board state is stale (no status update in 10 min) AND we haven't
// nudged in 30 min — one bounded bookkeeping mini-turn, not a per-stop tax.
app.get('/api/agent/stop-check', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  try {
    if (!integrationOnMaster() || !stopNudgeEnabled()) return res.json({ block: false });
    // The arbiter is keyed on STATUS staleness — with vibespace-status
    // disabled (2.211.0) there is nothing to keep fresh, so never nudge.
    const T = enabledTools();
    if (!T.status) return res.json({ block: false });
    const [s, id] = hit;
    const now = Date.now();
    // Both thresholds user-configurable (2.89.0) — clamped to sane bounds so a
    // typo can't accidentally disable the nudge (use the on/off toggle for
    // that). An EXPLICIT 0 (2.210.0, user request) means every-stop mode:
    // 0 staleness = the board is always considered stale, 0 cooldown = no
    // per-session rate limit. Note stop_hook_active still guards the loop —
    // the nudge's own follow-up mini-turn is never re-nudged, so even 0/0 is
    // one extra mini-turn per user turn, not an infinite chain.
    const clamp0 = (v, lo, hi, dflt) => (Number.isFinite(v) ? (v <= 0 ? 0 : Math.min(hi, Math.max(lo, v))) : dflt);
    const staleMin = clamp0(Number(serverSetting('agents.stopNudgeStaleMinutes')), 1, 240, 10);
    const cooldownMin = clamp0(Number(serverSetting('agents.stopNudgeCooldownMinutes')), 2, 720, 30);
    if (cooldownMin > 0 && s._lastStopNudge && now - s._lastStopNudge < cooldownMin * 60 * 1000) return res.json({ block: false });
    const key = sessionStatusKey(s, id);
    const rec = sessionStatus.get(key) || sessionStatus.get(`webui:${id}`);
    if (staleMin > 0 && rec && rec.at && now - rec.at < staleMin * 60 * 1000) return res.json({ block: false });
    s._lastStopNudge = now;
    // Per-hook custom text (2.88.0): user extra rides at the top of the nudge.
    const extra = customExtra('agents.stopNudgeExtra', 500);
    // Steps list only ENABLED tools (2.211.0) — status is guaranteed on here.
    const steps = ['set your CURRENT state — vibespace-status <working|needs-input|blocked|review|done> --reason "one line" (done if this piece of work is finished; needs-input/review if you are waiting on the user)'];
    if (T.ask) steps.push('if you asked the user anything this turn or are waiting on them, MIRROR it — vibespace-ask "question" (the full content must already be in your chat reply; the inbox only notifies) — and vibespace-ask resolve anything they already answered');
    if (T.task) steps.push('if you completed meaningful work, log it — vibespace-task progress "summary"');
    res.json({
      block: true,
      reason: (extra ? extra + '\n' : '') + 'VibeSpace bookkeeping before you stop (your board state is stale): ' + steps.map((t, i) => `(${i + 1}) ${t}`).join('; ') + '. Then stop again.',
    });
  } catch { res.json({ block: false }); }
});
// Integration master switch (agents.vibespaceIntegration, 2.190.0): OFF gates
// every model-visible CONTENT response — the three deliveries (task-context /
// prompt-context / stop-check) AND the GET /api/agent/task read (it returns
// the same steering substance: objective/backlog/activity) — so even sessions
// spawned while it was ON go pristine mid-flight. WRITE endpoints
// (status/ask/progress/backlog) stay live: an old session's reports keep
// landing on the board, they just stop being taught/injected/read back.
// The canonical predicate lives in server.js (threaded via deps); the inline
// fallback only serves harnesses that construct these routes without it.
function integrationOnMaster() {
  try {
    if (integrationEnabled) return !!integrationEnabled();
    return serverSetting('agents.vibespaceIntegration') !== false;
  } catch { return true; }
}
function stopNudgeEnabled() {
  try { return serverSetting('agents.stopBookkeepingNudge') !== false; } catch { return true; }
}
// Per-feature Integration toggles (2.211.0, user request: e.g. keep shared-
// context injection but withhold ask/progress). All default ON; consulted
// only while the master switch is ON. OFF ⇒ the feature is neither TAUGHT
// (intro/context/reminders omit it) nor SERVED (its write endpoints refuse
// with skip-and-continue guidance).
function toolOn(name) { // 'Status' | 'Ask' | 'Task'
  try { return serverSetting('agents.tool' + name) !== false; } catch { return true; }
}
function enabledTools() { return { status: toolOn('Status'), ask: toolOn('Ask'), task: toolOn('Task') }; }
function ctxInjectionOn() {
  try { return serverSetting('agents.contextInjection') !== false; } catch { return true; }
}
function toolDisabled(res, cmd) {
  res.status(403).json({ error: `${cmd} is disabled in this VibeSpace's settings (Integration section) — skip this reporting step and continue with your work; do not retry.` });
}
function perTurnReminderEnabled() {
  try { return serverSetting('agents.perTurnToolReminder') !== false; } catch { return true; }
}
function injectDiffsEnabled() {
  try { return serverSetting('agents.contextUpdateDiffs') !== false; } catch { return true; }
}
// ── vibespace-task agent endpoints (P3): validated task-level writes,
// SCOPED to the session's own context task (VIBESPACE_TASK_ID at spawn) —
// an agent cannot touch arbitrary tasks. All writes flow through TaskManager,
// so TASK.md regenerates and tasks-updated broadcasts automatically. ──
app.get('/api/agent/task', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  // Master switch: this READ returns the same steering substance the delivery
  // endpoints inject (objective/backlog/activity) — `vibespace-task show` from
  // a pre-toggle session must not bypass the pristine state through it.
  if (!integrationOnMaster()) return res.status(403).json({ error: 'VibeSpace integration is disabled (master switch)' });
  const gid = resolveAgentGroup(hit, req, res);
  if (!gid) return;
  try {
    const t = tasks.get(gid);
    // backlog: OPEN items only — that's what the CLI numbers for backlog-done
    // (the resolve route indexes the same open-items list)
    res.json({ success: true, task: { id: t.id, title: t.title, archived: !!t.archived, objective: t.objective, backlog: (t.backlog || []).filter((b) => b.status === 'open'), progress: (t.progress || []).slice(-10), contextDir: t.contextDir } });
  } catch (e) { res.status(404).json({ error: e.message }); }
});
app.post('/api/agent/task-progress', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  if (!toolOn('Task')) return toolDisabled(res, 'vibespace-task progress');
  const gid = resolveAgentGroup(hit, req, res);
  if (!gid) return;
  try {
    const t = tasks.addProgress(gid, { note: req.body?.note, detail: req.body?.detail, session: sessionStatusKey(hit[0], hit[1]) });
    res.json({ success: true, progress: t.progress.slice(-3) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// (Removed /api/agent/task-status — a Task Group has no status. A session
// reports its own state via /api/agent/session-status (vibespace-status).)
// (Removed /api/agent/task-plan — the group-level checklist was cut in
// 2.121.0. Old vibespace-task copies — e.g. on remote hosts — may still call
// it; answer 410 with guidance instead of a confusing 404.)
app.post('/api/agent/task-plan', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  res.status(410).json({ error: 'the Task Group checklist was removed — keep working steps in your own session todo list; log finished work with `vibespace-task progress "summary"`; park NON-immediate items (deferred decisions / future work) with `vibespace-task backlog-add "item"`' });
});
// Backlog (2.122.0; claim model 2.123.0): the group's parking lot for
// NON-immediate items — deferred user decisions, "later" work.
// add (auto-claims for the caller) / done / drop / claim / unclaim / show.
// Refs resolve by stable item id (B-xxxx — the user can copy one to ANY
// member agent), by 1-based index into the OPEN-items list (what
// `show`/`backlog` display), or by unique text substring.
app.post('/api/agent/task-backlog', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  if (!toolOn('Task')) return toolDisabled(res, 'vibespace-task backlog');
  const gid = resolveAgentGroup(hit, req, res);
  if (!gid) return;
  try {
    const t = tasks.get(gid);
    const backlog = (t.backlog || []).map((b) => ({ ...b, claimedBy: [...(b.claimedBy || [])] }));
    const { add, detail, done, drop, claim, unclaim, show, edit, text: newText } = req.body || {};
    const key = sessionStatusKey(hit[0], hit[1]);
    const findIdx = (ref, { openOnly = true } = {}) => {
      const pool = backlog.map((b, i) => [b, i]).filter(([b]) => !openOnly || b.status === 'open');
      if (typeof ref === 'string' && /^B-[0-9a-f]{4,8}$/i.test(ref.trim())) {
        const hitById = backlog.findIndex((b) => (b.id || '').toLowerCase() === ref.trim().toLowerCase());
        if (hitById >= 0) return hitById;
        return { err: `no backlog item with id ${ref.trim()}` };
      }
      const n = Number(ref);
      if (Number.isInteger(n) && n >= 1 && n <= pool.length) return pool[n - 1][1];
      const matches = pool.filter(([b]) => b.text.includes(String(ref)));
      if (matches.length === 1) return matches[0][1];
      return { err: matches.length ? 'ambiguous item — use its id or number from `vibespace-task backlog`' : 'no matching backlog item' };
    };
    if (typeof show === 'string' || typeof show === 'number') {
      const r = findIdx(show, { openOnly: false });
      if (typeof r !== 'number') return res.status(404).json({ error: r.err });
      return res.json({ success: true, item: backlog[r] }); // read-only — no update
    }
    let actedIdx = -1;      // claim/unclaim → echo the item + co-claimants back
    let alreadyMine = false; // idempotent re-claim
    if (typeof add === 'string' && add.trim()) {
      // parking auto-CLAIMS for the caller (user directive) — the parker is
      // the natural owner until it hands the item back
      backlog.push({ text: add.trim(), status: 'open', claimedBy: [key], ...(typeof detail === 'string' && detail.trim() ? { detail: detail.trim() } : {}), addedBy: key, addedAt: Date.now() });
    } else if (edit !== undefined) {
      // EDIT an existing item's text and/or detail in place (2.130.0) — the
      // id stays, so refs elsewhere survive and the diff surfaces as
      // "reworded" (id-matched), NOT a drop+new-id churn. At least one of
      // text/detail must be provided; empty text is rejected (an item needs a
      // one-line summary), empty detail ('' / '-') CLEARS the detail.
      const r = findIdx(edit, { openOnly: false });
      if (typeof r !== 'number') return res.status(400).json({ error: r.err });
      const hasText = typeof newText === 'string';
      const hasDetail = typeof detail === 'string';
      if (!hasText && !hasDetail) return res.status(400).json({ error: 'edit needs --text and/or --detail' });
      if (hasText) {
        if (!newText.trim()) return res.status(400).json({ error: 'item text cannot be empty' });
        backlog[r].text = newText.trim();
      }
      if (hasDetail) {
        const d = detail.trim();
        if (d === '' || d === '-') delete backlog[r].detail; else backlog[r].detail = d;
      }
      actedIdx = r;
    } else if (claim !== undefined || unclaim !== undefined) {
      const r = findIdx(claim !== undefined ? claim : unclaim);
      if (typeof r !== 'number') return res.status(400).json({ error: r.err });
      const b = backlog[r];
      if (claim !== undefined) {
        if (b.claimedBy.includes(key)) alreadyMine = true;
        else b.claimedBy.push(key);
      } else b.claimedBy = b.claimedBy.filter((k) => k !== key);
      actedIdx = r;
    } else if (done !== undefined || drop !== undefined) {
      const r = findIdx(done !== undefined ? done : drop);
      if (typeof r !== 'number') return res.status(400).json({ error: r.err });
      backlog[r].status = done !== undefined ? 'done' : 'dropped';
      backlog[r].resolvedBy = key;
      backlog[r].resolvedAt = Date.now();
    } else {
      return res.status(400).json({ error: 'need add, done, drop, claim, unclaim, or show' });
    }
    const updated = tasks.update(gid, { backlog });
    // claim ack carries the CO-CLAIMANTS (user directive: claiming must warn
    // when other sessions already hold the item, so agents coordinate)
    const acted = actedIdx >= 0 ? updated.backlog[actedIdx] : null;
    res.json({
      success: true,
      backlog: updated.backlog.filter((b) => b.status === 'open'),
      ...(acted ? { item: acted, others: (acted.claimedBy || []).filter((k) => k !== key), alreadyMine } : {}),
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Task Group ADMIN for designated MANAGER sessions (2.132.0, issue #21 —
// walter's majordomo/Jarvis flow: group create/update/bind is a routine
// agent-driven operation there). DOUBLE-GATED, both off by default:
//   1. setting agents.allowGroupManagement (user opt-in, Settings)
//   2. THIS session designated "Group manager" by the user (Session
//      Properties toggle → sessionConfigs[key].groupManager, user-state)
// Verbs mirror the UI's organize/present config ops — NO orchestration, no
// spawn, no delete (destructive stays user-only). contextDir/folders paths
// are restricted to allowlisted roots; every op is AUDITED into the group's
// activity log attributed to the calling session (visible on the board).
app.post('/api/agent/group-admin', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  const [s, id] = hit;
  const key = sessionStatusKey(s, id);
  try {
    if (!serverSetting('agents.allowGroupManagement')) {
      return res.status(403).json({ error: 'agent group management is disabled — the user can enable it (Settings → Integration → "Allow agents to manage Task Groups"), then designate this session as a Group manager in its Session Properties' });
    }
    if (!isManagerSession(key)) {
      return res.status(403).json({ error: 'this session is not a designated Group manager — ask the user to enable the "Group manager" toggle in this session\'s Properties (session key: ' + key + ')' });
    }
    // Path allowlist: contextDir/folders must resolve under a configured root
    // (an agent must not be able to point injection at arbitrary paths).
    const roots = String(serverSetting('agents.groupManagementRoots') || '~').split(',')
      .map((r) => r.trim()).filter(Boolean)
      .map((r) => path.resolve(r.replace(/^~(?=$|\/)/, os.homedir())));
    const checkPath = (p, what) => {
      const abs = path.resolve(String(p).replace(/^~(?=$|\/)/, os.homedir()));
      if (!roots.some((r) => abs === r || abs.startsWith(r.endsWith('/') ? r : r + '/'))) {
        throw new Error(`${what} must be under: ${roots.join(', ')} (setting agents.groupManagementRoots)`);
      }
      return abs;
    };
    const sanitizeFolders = (arr) => (Array.isArray(arr) ? arr : []).map((f) => ({
      path: checkPath(typeof f === 'string' ? f : f && f.path, 'folder'),
      recursive: typeof f === 'object' && f ? f.recursive !== false : true,
    }));
    const audit = (gid, note) => { try { tasks.addProgress(gid, { note, session: key }); } catch { } };
    const brief = (t) => ({ id: t.id, title: t.title, archived: !!t.archived, contextDir: t.contextDir || null, sessions: (t.sessions || []).length });
    const { create, update, bind, unbind, list } = req.body || {};
    if (list) return res.json({ success: true, groups: tasks.list().map(brief) });
    if (create && typeof create === 'object') {
      if (!create.title || !String(create.title).trim()) throw new Error('title required');
      const t = tasks.create({
        title: String(create.title),
        kind: 'task',
        objective: create.objective !== undefined ? String(create.objective) : undefined,
        contextDir: create.contextDir ? checkPath(create.contextDir, 'contextDir') : undefined,
        folders: create.folders !== undefined ? sanitizeFolders(create.folders) : undefined,
        color: create.color ? String(create.color) : undefined,
      });
      audit(t.id, '[group-admin] group created by manager agent');
      return res.json({ success: true, group: brief(tasks.get(t.id)) });
    }
    if (update && update.id) {
      const patch = {};
      if (update.title !== undefined) patch.title = String(update.title);
      if (update.objective !== undefined) patch.objective = String(update.objective);
      if (update.color !== undefined) patch.color = String(update.color);
      if (update.archived !== undefined) patch.archived = !!update.archived;
      if (update.contextDir !== undefined) patch.contextDir = update.contextDir ? checkPath(update.contextDir, 'contextDir') : null;
      if (update.folders !== undefined) patch.folders = sanitizeFolders(update.folders);
      if (!Object.keys(patch).length) throw new Error('nothing to update — send title/objective/contextDir/folders/color/archived');
      tasks.update(update.id, patch);
      audit(update.id, `[group-admin] ${Object.keys(patch).join('+')} updated by manager agent`);
      return res.json({ success: true, group: brief(tasks.get(update.id)) });
    }
    if (bind && bind.id) {
      const sk = String(bind.sessionKey || key);
      tasks.bind(bind.id, sk);
      audit(bind.id, `[group-admin] session ${sk} bound by manager agent`);
      return res.json({ success: true, group: brief(tasks.get(bind.id)) });
    }
    if (unbind && unbind.id) {
      const sk = String(unbind.sessionKey || key);
      tasks.unbind(unbind.id, sk);
      audit(unbind.id, `[group-admin] session ${sk} unbound by manager agent`);
      return res.json({ success: true, group: brief(tasks.get(unbind.id)) });
    }
    return res.status(400).json({ error: 'need create, update, bind, unbind, or list' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Hook install management (Manage Agents dialog — auto-registers at boot,
// this surfaces status + one-click repair/remove for non-engineers) ──
}

module.exports = { setupAgentRoutes };
