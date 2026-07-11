/**
 * Agent-facing routes — extracted verbatim from server.js (2.92.0 split).
 * Everything the vibespace-* CLI tools and the harness hooks talk to:
 * user-todo (vibespace-ask), session-status (vibespace-status), the context
 * injection endpoints (task-context / prompt-context, incl. the user preamble
 * + per-turn extras), the stop-check nudge arbiter, and the vibespace-task
 * plan/progress endpoints. Injection ORDER + SIZE are load-bearing — read the
 * CLAUDE.md notes on renderContext/persisted-output before touching payloads.
 */
const path = require('path');
const crypto = require('crypto');

function setupAgentRoutes({ app, activeSessions, tasks, sessionStatus, SessionStatusManager, userTodos, sessionStatusKey, serverSetting, scheduleCtxSync, remoteCtxBaseFor }) {
app.post('/api/agent/user-todo', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
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
  const key = sessionStatusKey(found, foundId);
  // migrate an early webui:<id> record once the real backend id exists
  if (!key.startsWith('webui:')) sessionStatus.rekey(`webui:${foundId}`, key);
  const { state, urgency, reason, detail, clear, show } = req.body || {};
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
  if (!groups.length) { res.status(403).json({ error: 'this session is not in any Task Group' }); return null; }
  const want = String(req.query?.group || req.body?.group || '').trim();
  if (want) {
    const g = groups.find((x) => x.id === want);
    if (!g) { res.status(403).json({ error: `this session does not belong to Task Group ${want}` }); return null; }
    return g.id;
  }
  if (groups.length === 1) return groups[0].id;
  res.status(400).json({ error: `this session belongs to ${groups.length} Task Groups — pass --group <id> (one of: ${groups.map((g) => g.id).join(', ')})` });
  return null;
}

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

const SESSION_TOOLS_INTRO = [
  '<vibespace-session-tools>',
  'This session is running inside VibeSpace. Report your OWN status so the user can see it on their session board — use the `vibespace-status` command (already on your PATH):',
  '  vibespace-status <working|needs-input|blocked|review|done> [--urgency low|normal|high|urgent] [--reason "why"]',
  '  vibespace-status show   (or run it with no arguments) — prints usage + your current status',
  'Keep it honest and current: `working` while making progress; `blocked` or `needs-input` (with a higher urgency) the moment you are stuck or waiting on the user; `review` when you want them to look; `done` when this piece of work is finished.',
  'Whenever you ask the user ANYTHING — a question in chat, or ending a turn waiting on their decision/input/review — ALSO file it on their global inbox with `vibespace-ask`. They are often NOT watching this window; the inbox is how they find waiting questions across all sessions:',
  '  vibespace-ask "question or decision needed" [--detail "context + your recommendation"] [--urgency low|normal|high|urgent]',
  '  vibespace-ask list  /  vibespace-ask resolve <id|text>',
  'The MOMENT the user answers (in chat or anywhere), resolve the item YOURSELF with `vibespace-ask resolve` — never leave answered items for them to tick. Not for your own working steps — those belong in your normal todo list.',
  'The inbox item is a NOTIFICATION MIRROR, not the message itself: everything you file (the question, options, your recommendation) must ALSO appear IN FULL in your chat reply — never say something only in the inbox (the user reads and copies from chat; inbox rows are hard to read at length).',
  'When your reply references files you created or discuss (audio, images, reports, code, HTML…), write their ABSOLUTE paths — the chat UI turns absolute paths into clickable links that open in the right viewer (audio plays, images preview, HTML renders). Bare filenames or project-relative paths may not resolve.',
  '(If this session is later linked to a VibeSpace task, you will also get `vibespace-task` for task-level progress/plan/status — you have no task right now, so it is not active yet.)',
  '</vibespace-session-tools>',
].join('\n');

// SessionStart hook payload (context injection): rendered task state + context
// folder file index + the rules. Fires + injects for Claude (terminal + chat).
// SCOPED to the session's OWN context task — the ?taskId= query is ignored so a
// token can never read another task's context. Records the task version the
// session has now "seen" so UserPromptSubmit only RE-injects on later changes.
app.get('/api/agent/task-context', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  try {
    const [s, id] = hit;
    const key = sessionStatusKey(s, id);
    const groups = tasks.groupsForSession({ sessionKey: key, cwd: s.cwd, initialGroupId: s._initialGroupId });
    const injectGroups = groups.filter((g) => g.injectContext !== false); // P6: per-group context toggle
    let context = '';
    if (injectGroups.length) {
      // Remote sessions read the auto-synced copy — translate file paths
      context = tasks.renderMultiContext(injectGroups.map((g) => g.id), { ctxBaseFor: remoteCtxBaseFor(s) });
      // Only Claude injects the SessionStart output; codex runs the command but
      // ignores it, so don't mark groups "seen" for codex (that would starve its
      // UserPromptSubmit delivery).
      if (context && s.backend !== 'codex') {
        s._groupSeenAt = s._groupSeenAt || {};
        s._ctxSig = s._ctxSig || {};
        for (const g of injectGroups) {
          s._groupSeenAt[g.id] = g.contentUpdatedAt || g.updatedAt;
          if (g.contextDir) s._ctxSig[g.id] = tasks.contextDirSignature(g.contextDir);
        }
      }
    } else if (s.backend !== 'codex' && !s._toolsIntroSeen) {
      // No INJECTABLE group (none at all, or every belonged group has
      // injectContext off): still teach vibespace-status once — the baseline
      // intro carries no group content, and an agent that never learns the
      // tool can't self-report.
      // In no group: still teach the agent to report its status (baseline), once.
      // codex ignores SessionStart output, so it gets this via prompt-context.
      context = SESSION_TOOLS_INTRO;
      s._toolsIntroSeen = true;
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
  try {
    const [s, id] = hit;
    const key = sessionStatusKey(s, id);
    const parts = [];
    const groups = tasks.groupsForSession({ sessionKey: key, cwd: s.cwd, initialGroupId: s._initialGroupId });
    const injectGroups = groups.filter((g) => g.injectContext !== false); // P6: per-group context toggle
    if (injectGroups.length) {
      s._groupSeenAt = s._groupSeenAt || {};
      s._ctxSig = s._ctxSig || {};
      const multi = injectGroups.length > 1;
      const ctxBaseFor = remoteCtxBaseFor(s); // remote → translated file paths
      for (const g of injectGroups) {
        const seenAt = s._groupSeenAt[g.id];
        const firstTime = seenAt === undefined;
        // User-written contextDir files don't bump updatedAt — a signature diff
        // (path/size/mtime of the indexed files) is how we notice them.
        const sig = g.contextDir ? tasks.contextDirSignature(g.contextDir) : '';
        const hadSig = s._ctxSig[g.id] !== undefined;
        const ctxChanged = hadSig && s._ctxSig[g.id] !== sig;
        // Gate on CONTENT changes only (title/objective/checklist/activity/
        // contextDir) — cosmetic edits (color, toggles, binds) bump updatedAt
        // but must not re-inject the whole group to every member.
        const contentAt = g.contentUpdatedAt || g.updatedAt;
        const metaChanged = contentAt > (seenAt || 0);
        if (firstTime || metaChanged || ctxChanged) {
          const wasSeen = !firstTime; // seen before → this is an UPDATE, not first delivery
          const ctx = tasks.renderContext(g.id, { multi, ctxBase: ctxBaseFor ? ctxBaseFor(g.id) : null });
          if (ctx) {
            parts.push(wasSeen
              ? `The Task Group below was UPDATED since you last saw it — this is the current state (supersedes any earlier copy).\n\n${ctx}`
              : ctx);
            s._groupSeenAt[g.id] = contentAt;
            s._ctxSig[g.id] = sig;
          }
        } else if (!hadSig && g.contextDir) {
          // Meta already seen (e.g. claude's SessionStart set _groupSeenAt) but
          // no contextDir baseline recorded yet — set it now WITHOUT re-injecting.
          s._ctxSig[g.id] = sig;
        }
      }
    } else if (!s._toolsIntroSeen) {
      // No injectable group → baseline tools intro once (see task-context note).
      // In no group: deliver the baseline tools intro on the FIRST prompt (covers
      // codex — its app-server runs the hook but ignores SessionStart output).
      parts.push(SESSION_TOOLS_INTRO);
      s._toolsIntroSeen = true;
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
      const std = perTurnReminderEnabled()
        ? `Tools on PATH: vibespace-status <state> — keep your board state honest · vibespace-ask "q" — MIRROR every chat question onto their inbox (the FULL content still goes in your chat reply — the inbox is only the notification), and resolve <id|text> the moment they answer · vibespace-task ${multi ? '--group <id> ' : ''}progress "summary" — log finished work. Run any with no args for usage.`
        : '';
      // User extra rides at the TOP of the reminder block (per-hook custom,
      // 2.88.0); it delivers even with the standard reminder toggled off.
      const body = [extra, std].filter(Boolean).join('\n');
      if (body) outParts.push(`<vibespace-reminder>${body}</vibespace-reminder>`);
    }
    res.json({ success: true, context: outParts.join('\n\n') });
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
    if (!stopNudgeEnabled()) return res.json({ block: false });
    const [s, id] = hit;
    const now = Date.now();
    // Both thresholds user-configurable (2.89.0) — clamped to sane bounds so a
    // typo can't turn the nudge into a per-stop tax or disable it silently
    // (use the on/off toggle for that).
    const staleMin = Math.min(240, Math.max(1, Number(serverSetting('agents.stopNudgeStaleMinutes')) || 10));
    const cooldownMin = Math.min(720, Math.max(2, Number(serverSetting('agents.stopNudgeCooldownMinutes')) || 30));
    if (s._lastStopNudge && now - s._lastStopNudge < cooldownMin * 60 * 1000) return res.json({ block: false });
    const key = sessionStatusKey(s, id);
    const rec = sessionStatus.get(key) || sessionStatus.get(`webui:${id}`);
    if (rec && rec.at && now - rec.at < staleMin * 60 * 1000) return res.json({ block: false });
    s._lastStopNudge = now;
    // Per-hook custom text (2.88.0): user extra rides at the top of the nudge.
    const extra = customExtra('agents.stopNudgeExtra', 500);
    res.json({
      block: true,
      reason: (extra ? extra + '\n' : '') + 'VibeSpace bookkeeping before you stop (your board state is stale): (1) set your CURRENT state — vibespace-status <working|needs-input|blocked|review|done> --reason "one line" (done if this piece of work is finished; needs-input/review if you are waiting on the user); (2) if you asked the user anything this turn or are waiting on them, MIRROR it — vibespace-ask "question" (the full content must already be in your chat reply; the inbox only notifies) — and vibespace-ask resolve anything they already answered; (3) if you completed meaningful work, log it — vibespace-task progress "summary". Then stop again.',
    });
  } catch { res.json({ block: false }); }
});
function stopNudgeEnabled() {
  try { return serverSetting('agents.stopBookkeepingNudge') !== false; } catch { return true; }
}
function perTurnReminderEnabled() {
  try { return serverSetting('agents.perTurnToolReminder') !== false; } catch { return true; }
}
// ── vibespace-task agent endpoints (P3): validated task-level writes,
// SCOPED to the session's own context task (VIBESPACE_TASK_ID at spawn) —
// an agent cannot touch arbitrary tasks. All writes flow through TaskManager,
// so TASK.md regenerates and tasks-updated broadcasts automatically. ──
app.get('/api/agent/task', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  const gid = resolveAgentGroup(hit, req, res);
  if (!gid) return;
  try {
    const t = tasks.get(gid);
    res.json({ success: true, task: { id: t.id, title: t.title, archived: !!t.archived, objective: t.objective, plan: t.plan, progress: (t.progress || []).slice(-10), contextDir: t.contextDir } });
  } catch (e) { res.status(404).json({ error: e.message }); }
});
app.post('/api/agent/task-progress', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  const gid = resolveAgentGroup(hit, req, res);
  if (!gid) return;
  try {
    const t = tasks.addProgress(gid, { note: req.body?.note, detail: req.body?.detail, session: sessionStatusKey(hit[0], hit[1]) });
    res.json({ success: true, progress: t.progress.slice(-3) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// (Removed /api/agent/task-status — a Task Group has no status. A session
// reports its own state via /api/agent/session-status (vibespace-status).)
app.post('/api/agent/task-plan', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  const gid = resolveAgentGroup(hit, req, res);
  if (!gid) return;
  try {
    const t = tasks.get(gid);
    const plan = (t.plan || []).map(p => ({ ...p }));
    const { check, uncheck, add, detail } = req.body || {};
    if (typeof add === 'string' && add.trim()) {
      plan.push({ text: add.trim(), done: false, ...(typeof detail === 'string' && detail.trim() ? { detail: detail.trim() } : {}), addedBy: sessionStatusKey(hit[0], hit[1]), addedAt: Date.now() });
    } else if (check !== undefined || uncheck !== undefined) {
      const ref = check !== undefined ? check : uncheck;
      const done = check !== undefined;
      // by 1-based index or unique substring
      let idx = -1;
      const n = Number(ref);
      if (Number.isInteger(n) && n >= 1 && n <= plan.length) idx = n - 1;
      else {
        const matches = plan.map((p, i) => [p, i]).filter(([p]) => p.text.includes(String(ref)));
        if (matches.length === 1) idx = matches[0][1];
        else return res.status(400).json({ error: matches.length ? 'ambiguous step — use its number' : 'no matching plan step' });
      }
      plan[idx].done = done;
      // P5: record who ticked it / when (loose, informational — never enforced).
      if (done) { plan[idx].by = sessionStatusKey(hit[0], hit[1]); plan[idx].doneAt = Date.now(); }
      else { delete plan[idx].by; delete plan[idx].doneAt; }
    } else {
      return res.status(400).json({ error: 'need add, check, or uncheck' });
    }
    const updated = tasks.update(gid, { plan });
    res.json({ success: true, plan: updated.plan });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// ── Hook install management (Manage Agents dialog — auto-registers at boot,
// this surfaces status + one-click repair/remove for non-engineers) ──
}

module.exports = { setupAgentRoutes };
