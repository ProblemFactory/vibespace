'use strict';
/**
 * APPS ROUTES (Layer 0 of docs/design-app-persistence.zh.md §3.1). Thin: the decisions are the engine's
 * (src/server/apps-engine.js) and the machine's (src/app-serve.js via the `app-*` ops); a route maps a code to a status.
 *
 * THE USER'S DOOR — cookie-authed, HUMAN-ONLY: an agent's session / job token (`Bearer vsst_` / `jbt_`) is refused 403
 * `agent_forbidden` on every route here (an install is the user's act; an agent proposes through /api/agent/apps/*).
 *   GET  /api/apps?host=                      the machine's apps: entries + rows, the replay decision, the drift
 *                                             tripwire, updates + last refreshed, open proposals, helpers
 *   GET  /api/apps/search?host=&q=            apt-cache search on that machine (plain words)
 *   POST /api/apps/plan {host, request | proposalId}   THE PLAN the install dialog shows (+ `digest`)
 *   POST /api/apps/install {host, request | proposalId, planDigest}   the run, NDJSON like /api/desktop/install:
 *                                             `{reattached}` · `{log}` lines · ONE `{done, …}` or `{error, code, plan?}`
 *   POST /api/apps/proposals/:id/reject       Not now (the agent is told on its next turn)
 *   GET  /api/apps/icon?host=&row=            THE icon of a catalog row: image/png | image/svg+xml, nosniff, an SVG
 *                                             sandboxed by CSP (an <img> never runs it; a navigation cannot either)
 *   GET  /api/apps/helper-prompt?host=&q=     "Let an agent help…": the first prompt of the temporary helper session
 *   POST /api/apps/helpers {host, sessionId, request}   mark that session as the helper (not a standing conversation)
 *   DELETE /api/apps/helpers/:sessionId
 * THE AGENT'S FACE — Bearer `vsst_` (auth-exempt under /api/agent/), NOTHING executes:
 *   GET  /api/agent/apps?host=                its machine's apps (entries + rows) + its own proposals
 *   GET  /api/agent/apps/search?host=&q=
 *   POST /api/agent/apps/plan {host, request}       a plan, nothing proposed
 *   POST /api/agent/apps/proposals {host, request, why}   PROPOSE (install / remove / a package source) → one For-you item
 *   GET  /api/agent/apps/proposals/:id?wait=<s>&since=<state>   its own proposal; `wait` ≤ 100 s, repeatable
 *   GET  /api/agent/apps/status?host=          replay / drift / updates in one line each
 *   POST /api/agent/apps/user-kind {kind, name, why}   record a USER-LEVEL tool the agent installed as the user (`add`)
 * `host` = '' / 'local' = this machine; a paired machine by id (its daemon must name `app-install`). Every failure
 * answers `{error, code}` — fetchJson never throws, so a 200-with-nothing would be a silent failure.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const A = require('../app-manifest.js');
const { liveForkPending, addressableId } = require('../claude-lock-capture.js');
const { toAgentText } = require('../peer-text.js');
const { sameToken } = require('../pairing-token.js'); // B-8dda (lane agent-cli-fixes): a raw secret is compared in constant time
// THE belt on what a PACKAGE wrote (apt's summaries, a .desktop Name, apt's error lines) on its way to an agent: a source
// the user approved is still a third party's words — one inert line each (test-peer-text-census declares the CLI on it)
const pkgWords = (v, max = 300) => (v == null ? v : toAgentText(String(v), { kind: 'line', max }));
/** verify-r1 F3: a PLAN or a PROPOSAL handed to an agent carries words a package source wrote in many fields (apt's origin
 *  column = a source's Release Origin/Label/Suite, the closure's versions, apt's unmet lines, a .desktop Name in a done
 *  proposal's rows, the summary's origins) — EVERY string goes through the belt (ours are plain words: unchanged by it),
 *  so a field added later is belted by construction. Bounded: depth 6, 400 entries per list. */
function inertDeep(v, depth = 0) {
  if (typeof v === 'string') return pkgWords(v, 300);
  if (v == null || typeof v !== 'object' || depth > 6) return typeof v === 'object' ? null : v;
  if (Array.isArray(v)) return v.slice(0, 400).map((x) => inertDeep(x, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = inertDeep(x, depth + 1);
  return out;
}
const router = express.Router();

let ctx = null;
function setup(deps) { ctx = deps; }

const LOCAL = new Set(['', 'local']);
const HOST_RE = /^[A-Za-z0-9._-]{1,80}$/;
const STATUS = {
  'bad-request': 400, bad_name: 400, bad_source: 400, 'unsupported-host': 400,
  agent_forbidden: 403, 'not-yours': 403,
  'not-found': 404, not_found: 404,
  busy: 409, plan_changed: 409, proposal_state: 409, no_sudo: 409, no_apt: 409, conflict: 409, removes: 409, needs_snap: 409, disk: 409, shared: 409, nothing: 409, not_run: 409, refused: 409, not_recorded: 409, host_needs_daemon: 409, no_conversation: 409, not_filed: 409,
  host_unavailable: 503, install_link_lost: 503, install_timeout: 504,
};
function fail(res, e) {
  const code = (e && e.code) || null;
  res.status(STATUS[code] || 500).json({ error: String((e && e.message) || e), code, ...(e && e.plan ? { plan: e.plan } : {}) });
}
function hostParam(req, res, src = req.method === 'GET' ? req.query : req.body) {
  const h = src && src.host != null ? String(src.host) : '';
  if (LOCAL.has(h)) return 'local';
  if (!HOST_RE.test(h)) { res.status(400).json({ error: `bad host ${JSON.stringify(h.slice(0, 40))}`, code: 'bad-request' }); return null; }
  return h;
}
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
/** Every user route: the engine, and never an agent's token (an install is the user's act). */
function userGate(req, res) {
  if (isAgentBearer(req)) { res.status(403).json({ error: 'installing an app is the user\'s act — an agent proposes with vibespace-app install', code: 'agent_forbidden' }); return null; }
  if (!ctx || !ctx.engine) { res.status(503).json({ error: 'apps are not available in this process', code: 'host_unavailable' }); return null; }
  return ctx.engine;
}

router.get('/api/apps', async (req, res) => {
  const engine = userGate(req, res); if (!engine) return;
  const host = hostParam(req, res); if (!host) return;
  try { res.json(await engine.status(host)); } catch (e) { fail(res, e); }
});
router.get('/api/apps/search', async (req, res) => {
  const engine = userGate(req, res); if (!engine) return;
  const host = hostParam(req, res); if (!host) return;
  try { res.json(await engine.search(host, String(req.query.q || ''))); } catch (e) { fail(res, e); }
});
router.post('/api/apps/plan', async (req, res) => {
  const engine = userGate(req, res); if (!engine) return;
  const b = req.body || {};
  try {
    if (b.proposalId) return res.json(await engine.planProposal(String(b.proposalId)));
    const host = hostParam(req, res); if (!host) return;
    res.json(await engine.plan(host, b.request));
  } catch (e) { fail(res, e); }
});
router.post('/api/apps/install', async (req, res) => {
  const engine = userGate(req, res); if (!engine) return;
  const b = req.body || {};
  const host = b.proposalId ? ((engine.get(String(b.proposalId)) || {}).host || 'local') : hostParam(req, res);
  if (!host) return;
  if (b.proposalId && !engine.get(String(b.proposalId))) return fail(res, { code: 'not-found', message: `no proposal ${String(b.proposalId).slice(0, 40)}` });
  // ONE install per machine — asked BEFORE the stream starts (a busy machine answers 409, like /api/desktop/install)
  const busy = ctx.access && typeof ctx.access.installBusy === 'function' ? ctx.access.installBusy(host) : null;
  if (busy) return fail(res, { code: 'busy', message: `an install is already running on that machine (started ${new Date(busy.since).toISOString()}) — wait for it to finish, then try again` });
  res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  const line = (o) => { try { res.write(JSON.stringify(o) + '\n'); } catch { /* the dialog closed */ } };
  let carry = '';
  const onData = (d) => { carry += Buffer.isBuffer(d) ? d.toString('utf8') : String(d); const parts = carry.split(/\r?\n/); carry = parts.pop(); for (const p of parts) line({ log: p.slice(0, 2000) }); if (carry.length > 4000) { line({ log: carry.slice(0, 2000) }); carry = ''; } };
  try {
    const out = await engine.run({ host, request: b.proposalId ? null : b.request, proposalId: b.proposalId ? String(b.proposalId) : null, expectDigest: typeof b.planDigest === 'string' && b.planDigest ? b.planDigest.slice(0, 64) : null, by: { kind: 'user' }, onData, onReattach: (o) => line({ reattached: true, pid: o && o.pid, since: o && o.since }) });
    if (carry) { line({ log: carry }); carry = ''; }
    line(out);
  } catch (e) {
    if (carry) line({ log: carry });
    line({ error: String((e && e.message) || e), code: (e && e.code) || 'install_failed', ...(e && e.plan ? { plan: e.plan } : {}), ...(e && e.digest ? { digest: e.digest } : {}) });
  } finally { try { res.end(); } catch { /* gone */ } }
});
router.post('/api/apps/proposals/:id/reject', (req, res) => {
  const engine = userGate(req, res); if (!engine) return;
  try { res.json({ ok: true, proposal: engine.reject(String(req.params.id), { by: 'user' }) }); } catch (e) { fail(res, e); }
});
/** THE icon: the row's icon resolved on its machine (PNG / SVG under /usr/share), served as an IMAGE — nosniff, and an
 *  SVG under a CSP sandbox so opening its URL directly cannot run a script in VibeSpace's origin. */
router.get('/api/apps/icon', async (req, res) => {
  const engine = userGate(req, res); if (!engine) return;
  const host = hostParam(req, res); if (!host) return;
  const rowId = String(req.query.row || '');
  if (!/^app\.[a-z0-9._-]{1,60}$/.test(rowId)) return res.status(400).json({ error: 'bad row', code: 'bad-request' });
  try {
    const st = await engine.status(host);
    const row = (st.rows || []).find((r) => r.id === rowId);
    if (!row || !row.icon) return res.status(404).json({ error: 'no icon', code: 'not-found' });
    let bytes = null, type = null;
    for (const c of A.iconCandidates(row.icon)) {
      try {
        if (host === 'local') { const s = await fs.promises.stat(c); if (s.isFile() && s.size <= 1024 * 1024) bytes = await fs.promises.readFile(c); }
        else if (ctx.access && typeof ctx.access.readFile === 'function') bytes = await ctx.access.readFile(host, c, 1024 * 1024);
      } catch { bytes = null; }
      if (bytes) { type = c.endsWith('.svg') ? 'image/svg+xml' : 'image/png'; break; }
    }
    if (!bytes) return res.status(404).json({ error: 'no icon file', code: 'not-found' });
    res.set({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
    res.end(bytes);
  } catch (e) { fail(res, e); }
});
router.get('/api/apps/helper-prompt', async (req, res) => {
  const engine = userGate(req, res); if (!engine) return;
  const host = hostParam(req, res); if (!host) return;
  try { res.json({ prompt: await helperPrompt(engine, host, String(req.query.q || '').slice(0, 1000)) }); } catch (e) { fail(res, e); }
});
router.post('/api/apps/helpers', (req, res) => {
  const engine = userGate(req, res); if (!engine) return;
  const host = hostParam(req, res); if (!host) return;
  try { res.json({ ok: true, helper: engine.addHelper({ host, sessionId: String((req.body || {}).sessionId || ''), request: String((req.body || {}).request || '') }) }); } catch (e) { fail(res, e); }
});
router.delete('/api/apps/helpers/:sessionId', (req, res) => {
  const engine = userGate(req, res); if (!engine) return;
  engine.dropHelper(String(req.params.sessionId)); res.json({ ok: true });
});

/** The helper's FIRST PROMPT: the user's request + the whole apps manual + this machine's facts (distro, installed apps,
 *  free space) — everything the one job needs, so no standing conversation carries a line of it (D3). */
async function helperPrompt(engine, host, request) {
  let manual = '';
  try { manual = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'agent', 'apps-manual.md'), 'utf8'); } catch { manual = '(the apps manual could not be read — run: vibespace-docs apps)'; }
  let st = null;
  try { st = await engine.status(host); } catch { st = null; }
  const facts = st && st.facts ? st.facts : null;
  const apps = st ? (st.manifest && st.manifest.entries || []).map((e) => `${e.id} (${e.packages.join(' ')})`).join(', ') || 'none yet' : 'unknown';
  return [
    'You are a temporary helper: the user opened you from Desktop apps → "Let an agent help…" to install an app on a machine. This is your only job; say "done" when it is installed (or when you have explained why it cannot be).',
    '',
    `The user's request: ${request || '(none typed — ask them what they want to install)'}`,
    '',
    `The machine${host === 'local' ? ' (this machine)' : ` (${host})`}: ${facts ? `${facts.prettyName || facts.distro || 'Linux'}${facts.codename ? ` (${facts.codename})` : ''}, ${facts.arch || '?'}; free space: system ${A.fmtBytes(facts.rootFree)}, home ${A.fmtBytes(facts.homeFree)}; passwordless sudo: ${facts.sudo || facts.root ? 'yes' : 'no'}` : 'its facts could not be read'}.`,
    `Apps already installed through VibeSpace there: ${apps}.`,
    '',
    'You can only PROPOSE — the user approves in the For you tray (or in the Desktop apps dialog). Use vibespace-app (its manual follows). Never run `sudo apt` yourself: an install outside VibeSpace is lost when the machine is rebuilt.',
    '',
    '--- the apps manual (vibespace-docs apps) ---',
    manual,
  ].join('\n');
}

// ── THE AGENT'S FACE ─────────────────────────────────────────────────────────────────────────────────────────────
function agentCaller(req, res) {
  const token = String((req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (req.body && req.body.token) || '');
  if (!token.startsWith('vsst_')) { res.status(401).json({ error: 'missing session token (a Background Work job token cannot use vibespace-app)', code: 'unauthorized' }); return null; }
  const sessions = ctx && typeof ctx.activeSessions === 'function' ? ctx.activeSessions() : null;
  for (const [id, s] of sessions || []) {
    if (s && sameToken(token, s.agentToken)) {
      const cid = s.claudeSessionId || s.backendSessionId || null;
      const pending = cid && liveForkPending(s);
      return { session: s, sessionId: id, name: s.name || s.webuiName || null, conversation: cid && !pending ? addressableId(s) : null, borrowed: pending ? 'this session is a fork that has not announced its own conversation id yet — wait a moment and repeat the command' : !cid ? 'this session has no conversation id yet — try again after its first turn' : null, sessionKey: ctx.sessionStatusKey ? ctx.sessionStatusKey(s, id) : null, host: s.hostId || s.host || 'local' };
    }
  }
  res.status(401).json({ error: 'unknown session token', code: 'unauthorized' });
  return null;
}
function agentGate(req, res) {
  if (!ctx || !ctx.engine) { res.status(503).json({ error: 'apps are not available in this process', code: 'host_unavailable' }); return null; }
  const who = agentCaller(req, res); if (!who) return null;
  return { engine: ctx.engine, who };
}
const agentHost = (req, who) => { const h = req.method === 'GET' ? req.query.host : (req.body || {}).host; return h == null || h === '' ? (who.host || 'local') : String(h); };
router.get('/api/agent/apps', async (req, res) => {
  const g = agentGate(req, res); if (!g) return;
  const host = agentHost(req, g.who); if (!LOCAL.has(host) && !HOST_RE.test(host)) return fail(res, { code: 'bad-request', message: 'bad host' });
  try {
    const st = await g.engine.status(host);
    const entries = (st.manifest && st.manifest.entries || []).map((e) => ({ id: e.id, kind: e.kind, packages: e.packages, rows: (st.rows || []).filter((r) => r.app === e.id).map((r) => ({ id: r.id, label: pkgWords(r.label, 120) })), by: e.by && e.by.kind, addedAt: e.addedAt }));
    res.json({ host, entries, proposals: g.who.conversation ? inertDeep(g.engine.proposalsOf(g.who.conversation)) : [], replay: st.replay && st.replay.decision, drift: st.drift && st.drift.drift ? { added: st.drift.added.map((x) => x.package) } : null, updates: st.updates ? st.updates.count : null, refreshedAt: st.refreshedAt || null });
  } catch (e) { fail(res, e); }
});
router.get('/api/agent/apps/search', async (req, res) => {
  const g = agentGate(req, res); if (!g) return;
  try { const r = await g.engine.search(agentHost(req, g.who), String(req.query.q || '')); res.json({ ...r, results: (r.results || []).map((x) => ({ ...x, summary: pkgWords(x.summary, 200) })) }); } catch (e) { fail(res, e); }
});
router.post('/api/agent/apps/plan', async (req, res) => {
  const g = agentGate(req, res); if (!g) return;
  try { const r = await g.engine.plan(agentHost(req, g.who), (req.body || {}).request, { agent: true }); res.json({ host: r.host, plan: inertDeep({ ...r.plan, argv: undefined, staged: undefined }) }); } catch (e) { fail(res, e); }
});
router.post('/api/agent/apps/proposals', async (req, res) => {
  const g = agentGate(req, res); if (!g) return;
  if (g.who.borrowed) return fail(res, { code: 'no_conversation', message: g.who.borrowed });
  const b = req.body || {};
  try {
    const p = await g.engine.propose({ host: agentHost(req, g.who), request: b.request, why: String(b.why || '').slice(0, 500), by: { kind: 'agent', sessionId: g.who.sessionId, conversation: g.who.conversation, name: g.who.name, sessionKey: g.who.sessionKey } });
    res.json({ ok: true, proposal: inertDeep(p), text: g.engine.outcomeText(p.id) });
  } catch (e) { fail(res, e); }
});
router.get('/api/agent/apps/proposals/:id', async (req, res) => {
  const g = agentGate(req, res); if (!g) return;
  const id = String(req.params.id);
  const p = g.engine.get(id);
  if (!p) return fail(res, { code: 'not-found', message: `no proposal ${id}` });
  if (!g.who.conversation || p.by.conversation !== g.who.conversation) return fail(res, { code: 'not-yours', message: `${id} is another conversation's proposal` });
  const ms = Math.max(0, Math.min(100, Number(req.query.wait) || 0)) * 1000;
  try { res.json(inertDeep(await g.engine.wait(id, { ms, since: req.query.since ? String(req.query.since) : null, conversation: g.who.conversation }))); } catch (e) { fail(res, e); }
});
/** `vibespace-app add --kind uv|npm|appimage` — the tool is ALREADY installed by the agent as the user (its own CLI card
 *  held that); this only records it (who, why). Nothing here executes. */
router.post('/api/agent/apps/user-kind', async (req, res) => {
  const g = agentGate(req, res); if (!g) return;
  const b = req.body || {};
  const kind = String(b.kind || '');
  if (!['uv-tool', 'npm', 'appimage'].includes(kind)) return fail(res, { code: 'bad-request', message: 'kind must be uv-tool / npm / appimage' });
  try { res.json({ ok: true, ...(await g.engine.recordUserKind(agentHost(req, g.who), { kind, name: String(b.name || ''), why: String(b.why || '').slice(0, 500), by: { kind: 'agent', conversation: g.who.conversation, name: g.who.name } })) }); } catch (e) { fail(res, e); }
});
router.get('/api/agent/apps/status', async (req, res) => {
  const g = agentGate(req, res); if (!g) return;
  try {
    const st = await g.engine.status(agentHost(req, g.who));
    res.json({ host: st.host, apps: (st.manifest && st.manifest.entries || []).length, replay: st.replay && st.replay.decision, replaying: !!st.replaying, drift: st.drift && st.drift.drift ? st.drift.added.map((x) => x.package) : [], updates: st.updates ? st.updates.count : null, refreshedAt: st.refreshedAt || null });
  } catch (e) { fail(res, e); }
});

module.exports = { router, setup, STATUS, helperPrompt };
