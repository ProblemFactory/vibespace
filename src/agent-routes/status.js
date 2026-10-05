/**
 * AGENT ROUTES — THE STATUS / TODOS FAMILY (decoupling wave 2b, lane dc-seams-server, 2026-10-05; review
 * rv-server-core M8: setupAgentRoutes was one 2 133-line function holding 44 routes). POST /api/agent/user-todo (vibespace-ask),
 * GET/POST /api/session-status, POST /api/agent/session-status (vibespace-status) and its history.
 * MOVED VERBATIM out of src/agent-routes.js's setupAgentRoutes (same column, so `git diff
 * --color-moved` shows a move): the closure it lived in arrives as `c`; setupAgentRoutes calls
 * register(app, c) at the very spot the lines stood, so every route registers on the same app in
 * the same order.
 */
const { sameToken } = require('../pairing-token.js'); // B-8dda: every vsst_ lookup compares in constant time
const { liveForkPending } = require('../claude-lock-capture.js');

function register(app, c) {
const { activeSessions, sessionStatus, userTodos, sessionStatusKey, clearAsAgent, agentSession, toolOn, toolDisabled } = c;
app.post('/api/agent/user-todo', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  if (!toolOn('Ask')) return toolDisabled(res, 'vibespace-ask');
  const [s, id] = hit;
  // verify r5 (channel-withdraw): a BORROWED id (a pending fork) is not a key an item may be filed under — the item
  // stayed under the PARENT's key for good (nothing re-keys `claude:<parent>` to the fork's own id later) and the
  // owner's reply was typed into the parent. The placeholder key migrates to the fork's OWN key at its next ask.
  const key = liveForkPending(s) ? `webui:${id}` : sessionStatusKey(s, id);
  if (!key.startsWith('webui:')) userTodos.rekey(`webui:${id}`, key); // migrate early items once the real id exists
  const { add, list, resolve, show, clear } = req.body || {};
  try {
    if (list) return res.json({ success: true, sessionKey: key, items: userTodos.forSession([key, `webui:${id}`]) });
    // `vibespace-ask clear <id>` ("Clear content…", 2026-09-28): an item THIS session filed itself —
    // its words become the one cleared sentence; the owner clears anything from the For-you window
    if (clear) return clearAsAgent(hit, { kind: 'todo', id: String(clear) }, res);
    if (resolve) return res.json({ success: true, item: userTodos.resolveByAgent(key, resolve) });
    if (show) { const it = userTodos.getForSession([key, `webui:${id}`], String(show)); return it ? res.json({ success: true, item: it }) : res.status(404).json({ error: `no item ${String(show).slice(0, 40)} in this session` }); } // `vibespace-ask show <id>`: one item of THIS session whatever its status (a reply's quote cuts a long detail and points here)
    if (add && add.text) {
      const item = userTodos.add(key, { text: add.text, detail: add.detail, urgency: add.urgency, by: 'agent', origin: 'agent', sessionName: s.name || null, kind: add.kind || null, options: add.options == null ? null : add.options }); // kind: 'notice' = FYI only (vibespace-ask --notice); options = one-click answers (--options "A|B|C") — both validated by the store, a bad shape refused by name
      return res.json({ success: true, item });
    }
    res.status(400).json({ error: 'pass {add:{text,...}} | {list:true} | {resolve:"id or text"} | {show:"id"} | {clear:"id"}' });
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
  for (const [id, s] of activeSessions) { if (sameToken(token, s.agentToken)) { found = s; foundId = id; break; } }
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
// list of keys (backend:id + webui:<serverId> placeholder) — first hit wins;
// `key` names the one it came from (a "Clear content…" on an entry addresses
// the entry by that key and its `at`).
app.get('/api/session-status/history', (req, res) => {
  const keys = String(req.query.sessionKey || '').split(',').filter(Boolean);
  for (const k of keys) {
    const h = sessionStatus.history(k);
    if (h.length) return res.json({ history: h, key: k });
  }
  res.json({ history: [], key: keys[0] || null });
});
}

module.exports = { register };
