'use strict';
// EXIT ROUTES + REMOTE-FS SINGLETONS (decomposition #10): the vibespace-exit
// agent routes (on-demand egress via a machine's SOCKS/run), the machine's
// "Who can use it" (lane-pairing ⑥: two lists, the ask answer, the audit),
// plus the RemoteFs and ssh-key singletons that were declared alongside them.
// ORCH tier.
const fs = require('fs');
const path = require('path');
const { sameToken } = require('../pairing-token.js'); // B-8dda
const { spawn } = require('child_process');

const { mk } = require('./lazy.js');
const DAU = require('../device-audit.js'); // lane device-act-audit: a cookie request's subject + the audit store's reader

function create({ app, rootDir, AGENT_BIN_DIR, activeSessions, auth, wss, WS_OPEN,
  bcastAll, integrationEnabled, unpairDialDevice, hosts,
  getExitProxy, getMounts, getPortForwards, getTasks = null }) {
  const exitProxy = mk(getExitProxy);
  const mounts = mk(getMounts);
  const portForwards = mk(getPortForwards);
// ── EXIT ROUTES (lane-pairing ⑥): the agent's vibespace-exit (vsst_ — a live conversation only) and the user's
// "Who can use it" (cookie). Thin: every decision is PURE src/exit-reach.js through the ExitProxyManager. ──
const E = require('../exit-reach.js');
const bearerOf = (req) => String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '') || String((req.body && req.body.token) || '');
const { personVerdict } = require('../routes/vault.js');   // lane wake-approve-card r3: THE person verdict (the hub-act ask's door — one verdict, never a local copy)
const { isAnyBearer } = require('../routes/vault.js');   // B-ee0a's take: THE one rule that spots a carried credential (a Bearer, a body token, ?token= / ?vsst=) — never a local copy
/** The live conversation behind a vsst_ token → [webuiId, session] | null. */
function exitAgentEntry(req) {
  const token = bearerOf(req);
  if (!token || !token.startsWith('vsst_')) return null;
  for (const [id, s] of activeSessions) if (sameToken(token, s.agentToken)) return [id, s];
  return null;
}
function exitAgentSession(req) { const e = exitAgentEntry(req); return e ? e[1] : null; }
/** vsst_ only: a Background Work job token (jbt_) is refused BY NAME — a job's owner lineage never inherits an exit. */
function agentOr401(req, res) {
  const token = bearerOf(req);
  if (token.startsWith('jbt_')) { res.status(401).json({ error: E.refusalText('session_token_required'), code: 'session_token_required' }); return null; }
  const e = exitAgentEntry(req);
  if (!e) { res.status(401).json({ error: 'missing or unknown session token', code: 'session_token_required' }); return null; }
  return e;
}
/** B-48a4 cure: A PERSON'S ACT ON A MACHINE IS ON DISK BEFORE THE ANSWER (hosts.json is the store writer's since B-48a4 U2 — the
 *  writeFileSync that threw into the route is gone). Not durable ⇒ 503 `not_durable` with the writer's words: the change is kept and
 *  the writer keeps trying, so the person knows a restart before it lands would lose it. → true when it answered */
async function notDurable(res) {
  if (typeof hosts.persisted !== 'function' || await hosts.persisted()) return false;   // a hosts without a store (a suite's stand-in) answers as before
  const w = (typeof hosts.whyNotDurable === 'function' && hosts.whyNotDurable()) || {};
  res.status(503).json({ error: `the change is kept, but hosts.json is not on disk yet (${w.why === 'queued' ? `queued behind ${w.ahead || 'other'} write(s)` : w.code || w.why || 'the storage did not answer'}) — the hub keeps trying; a restart before it lands would lose it`, code: 'not_durable' });
  return true;
}
const STATUS = { 'hosts-unread': 503, not_granted: 403, excepted: 403, ask_denied: 403, ask_changed: 409, ask_expired: 403, ask_unfiled: 409, groups_unreadable: 409, fork_pending: 409, ask_pending: 409, no_machine: 404, no_exits: 404, ambiguous: 400, offline: 503, run_failed: 502, spawn_failed: 502, bad_command: 400, unknown_shape: 409, conversation_gone: 410, remote_session: 409,
  // lane exit-transfer: pull / push refusals
  too_big: 413, not_a_file: 409, local_path_refused: 403, exists: 409, hash_mismatch: 502, transfer_failed: 502, bad_path: 400, target_busy: 409,
  // lane device-allow-flags: the machine's OWN allow list refused it (the sentence names the flag + the re-run)
  op_not_allowed: 403 };
// lane-exit-run-output E2: a spawn failure's answer carries the error, the interpreter, the platform and the shell's exit code (the CLI exits by it)
const agentFail = (res, e) => res.status(STATUS[e && e.code] || 400).json({ error: (e && e.message) || 'failed', code: (e && e.code) || 'failed', ...(e && e.grant ? { grant: e.grant } : {}), ...(e && e.has ? { has: e.has } : {}), ...(e && e.spawnError ? { spawnError: e.spawnError, interpreter: e.interpreter || null, platform: e.platform || null, exitCode: e.exitCode } : {}) });
app.get('/api/agent/exit', (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  try { res.json({ exits: exitProxy.listFor(e[1], e[0]) }); } catch (x) { agentFail(res, x); }   // the B-f276 remainder: a held list is 503 hosts-unread, never «no exits»
});
app.post('/api/agent/exit/use', async (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  try { res.json(await exitProxy.use(e[1], e[0], (req.body || {}).machine)); }
  catch (err) { agentFail(res, err); }
});
// RUN a command natively ON the exit machine (the universal fallback for ICMP/UDP/proxy-unaware tools + that
// machine's own DNS) — bounded by the daemon's 30 s cap (EXIT_RUN_TIMEOUT_MS), possibly waiting ≤ 60 s for the
// user's Allow first ("ask me each time").
// lane-exit-run-output E4: THIS conversation's own runs (never another's) — the agent's `vibespace-exit runs`
app.get('/api/agent/exit/runs', (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  try { res.json({ runs: exitProxy.runsFor(e[1], e[0], { machine: req.query.machine ? String(req.query.machine) : null, limit: Number(req.query.limit) || undefined }) }); }
  catch (err) { agentFail(res, err); }
});
app.post('/api/agent/exit/run', async (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  const { machine, cmd, argv } = req.body || {};
  // verify-r2 ask-a: the CLI's call ending (its process gone, its own timeout, the conversation killed) settles a
  // waiting ask — the answer would reach nobody and the command must not run for nobody
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  try { res.json(await exitProxy.run(e[1], e[0], machine, Array.isArray(argv) ? { argv } : cmd, { signal: ac.signal })); } // B-f169: the words, word for word
  catch (err) { agentFail(res, err); }
});
// lane exit-transfer (design 013 B): ONE file between this machine and a paired one, under the `run` grant, through the
// device's own file ops — never a shell, no 30 s cap (a transfer is not a run). PULL: the answer comes once the file landed
// on this machine's disk (the project / tmp / ~/Downloads fence is the manager's). The CLI's call ending gives up the ask
// and stops the transfer between windows (nothing is kept).
app.post('/api/agent/exit/pull', async (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  const { machine, remote, local, overwrite } = req.body || {};
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  try { res.json(await exitProxy.pull(e[1], e[0], machine, { remote, local, overwrite: overwrite === true, signal: ac.signal })); }
  catch (err) { agentFail(res, err); }
});
// PUSH: the request BODY is the file (application/octet-stream — the agent's own process reads it; the hub never opens a
// local path on an agent's behalf), the names ride the query. A refusal before the first byte is read answers at once and
// closes the connection (the CLI stops sending on the answer).
app.post('/api/agent/exit/push', async (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  const q = req.query || {};
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  try {
    res.json(await exitProxy.push(e[1], e[0], q.machine ? String(q.machine) : undefined, { remote: String(q.remote || ''), local: String(q.local || ''), size: Number(q.size), overwrite: q.overwrite === '1', source: req, signal: ac.signal }));
  } catch (err) { agentFail(res, err); try { if (!req.readableEnded) req.resume(); } catch { } } // the unread rest is drained; the CLI stops on the answer
});
// ── the user's side (cookie) ──
const COOKIE_STATUS = { 'hosts-unread': 503, 'not-found': 404, list_changed: 409, bad_mode: 400, bad_grant: 400, bad_principal: 400, empty_list: 400, too_many: 400, except_conflicts: 400, except_unnamed: 409, not_written: 500, store_unreadable: 409, 'session-gone': 410, human_only: 403, ask_unknown: 404, ask_settled: 409, ask_changed: 409, ask_expired: 410, conversation_gone: 410 };
const cookieFail = (res, e) => res.status(COOKIE_STATUS[e && e.code] || 400).json({ error: (e && e.message) || 'failed', code: (e && e.code) || 'failed', ...(e && e.added ? { added: e.added, removed: e.removed } : {}), ...(e && e.grant ? { grant: e.grant } : {}) });
app.get('/api/exits', (req, res) => res.json({ exits: exitProxy.list() }));
app.post('/api/hosts/:id/allow-exit', (req, res) => res.status(410).json({ error: 'use PATCH /api/hosts/:id/exit-access — exit access is two lists now', code: 'retired' }));
/** The live roster principalsNow reads names from (the sidebar's sessions + the Task Groups). */
const rosterNow = () => {
  const sessions = [];
  for (const [id, s] of activeSessions) sessions.push({ id, name: s.name || s.webuiName || '', backend: s.backend || 'claude', backendSessionId: s.backendSessionId || null, claudeSessionId: s.claudeSessionId || null });
  let groups = [];
  try { groups = (getTasks?.()?.list?.() || []).map((g) => ({ id: g.id, title: g.title, name: g.name, archived: !!g.archived })); } catch { groups = []; }
  return { sessions, groups };
};
app.get('/api/hosts/:id/exit-access', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'the user decides who can use a machine — an agent token may not read or change it', code: 'human_only' });
  try { res.json(exitProxy.view(req.params.id, { roster: rosterNow() })); }
  catch (e) { cookieFail(res, e); }
});
app.patch('/api/hosts/:id/exit-access', async (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'the user decides who can use a machine — an agent token may not read or change it', code: 'human_only' });
  if (hosts.unreadWords && hosts.unreadWords()) return res.status(503).json({ error: `changing a machine's exit access: ${hosts.unreadWords()}`, code: 'hosts-unread' });   // remainder of B-f276: refused BEFORE the grants store is written
  const b = req.body && typeof req.body === 'object' ? { ...req.body } : req.body;
  // a row picked LIVE names the session by its webui id ({kind:'session', session:'<id>'}): resolved HERE to its
  // conversation key — the grant model's ONE spelling (lane grants-unify): its own conversation id through addressableId,
  // a pending fork ⇒ its `webui:<id>` key, said in `resolved` — never trusted. The same for a member left out (`except`).
  const resolved = [];
  const live = (row) => {
    if (!row || row.kind !== 'session' || typeof row.session !== 'string') return row;
    const s = activeSessions.get(row.session);
    if (!s) throw Object.assign(new Error(`"${String(row.name || row.session).slice(0, 60)}" is not running any more — pick it again when it is`), { code: 'session-gone' });
    const key = exitProxy.conversationKeyOf(s, row.session);
    resolved.push({ session: row.session, key, forkPending: key.startsWith('webui:') && !!(s.claudeSessionId || s.backendSessionId) });
    return { kind: 'conversation', key };
  };
  // lane held-except-doors r2 (主开发's acceptance, MINOR 1): an exception STORED under a pending fork's `webui:<id>` key whose
  // fork now has its own id is RE-KEYED to it — a named rename through the ONE writer (PURE E.rekeyForkExcept), never a drop
  // (the page sends a kept exception by its stored key)
  const keyOfSession = (sid) => { const s = activeSessions.get(sid); return s ? exitProxy.conversationKeyOf(s, sid) : null; };
  try {
    for (const g of ['use', 'run']) {
      if (!b || !b[g] || typeof b[g] !== 'object') continue;
      if (Array.isArray(b[g].who)) b[g] = { ...b[g], who: b[g].who.map(live) };
      if (Array.isArray(b[g].except)) b[g] = E.rekeyForkExcept({ ...b[g], except: b[g].except.map(live) }, keyOfSession);
    }
    const out = await exitProxy.setAccess(req.params.id, b, { by: 'user' });
    if (await notDurable(res)) return;   // B-48a4 cure
    res.json({ ...out, resolved });
  } catch (e) { cookieFail(res, e); }
});
// lane-exit-run-output E4: THE OWNER's command history of one machine (the "Commands…" dialog) — cookie only, every
// conversation's runs there with their output heads; an agent token is refused by name (never another conversation's)
app.get('/api/hosts/:id/exit-runs', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'the machine\'s command history is the user\'s — an agent sees only its own (vibespace-exit runs)', code: 'human_only' });
  let h = null;
  if (hosts.held && hosts.held()) return res.status(503).json({ error: `the machine's command history: ${hosts.unreadWords()}`, code: 'hosts-unread' });   // the B-f276 remainder (H18): unknown, never «no such machine»
  try { h = hosts.get(req.params.id); } catch { }
  if (!h) return res.status(404).json({ error: 'no such machine', code: 'not-found' });
  const platform = h.dial && h.dial.lastAccept && typeof h.dial.lastAccept.platform === 'string' ? h.dial.lastAccept.platform : null;
  const lostE = typeof exitProxy.auditLost === 'function' ? exitProxy.auditLost() : null;   // B-f7a6: the exit audit's dropped lines — the Commands list says so
  res.json({ machine: { id: h.id, name: h.name || h.id, platform, interpreter: platform ? E.interpreterOf(platform) : null }, runs: exitProxy.runsOf(h.id, { limit: Number(req.query.limit) || undefined }), ...(lostE && lostE.total > 0 ? { lost: lostE } : {}) });
});
// lane device-act-audit (design q-042 D4): WHAT THE HUB DID ON A MACHINE — every act / code op it sent there, with who asked
// (src/device-audit.js — data/device-audit.jsonl). The OWNER's list of one machine (the Machines card's 「活动…」): cookie
// only, every subject's lines; an agent token is refused by name (an agent reads its OWN acts — vibespace-remote audit).
const DA = require('../device-acts.js');
const sinceOf = (q) => { if (q == null || q === '') return { at: null }; const ms = DAU.durationMs(q); return ms == null || ms <= 0 ? { bad: true } : { at: Date.now() - ms }; };
if (hosts.deviceAudit) hosts.deviceAudit.onLine = (rec) => { try { const row = DA.rowOf(rec); if (row) bcastAll({ type: 'device-audit', line: row }); } catch { } }; // the card patches its keyed rows in place
app.get('/api/hosts/:id/device-acts', (req, res) => {
  if (!hosts.deviceAudit) return res.status(503).json({ error: 'the device-act audit is not wired on this server', code: 'no_audit' });
  if (isAnyBearer(req)) return res.status(403).json({ error: 'what the hub did on a machine is the user\'s to read — an agent reads its own acts (vibespace-remote audit)', code: 'human_only' });
  let h = null;
  if (req.params.id !== 'local' && hosts.held && hosts.held()) return res.status(503).json({ error: `what the hub did on a machine: ${hosts.unreadWords()}`, code: 'hosts-unread' });   // the B-f276 remainder (H18)
  if (req.params.id === 'local') h = { id: 'local', name: 'this machine' }; else { try { h = hosts.get(req.params.id); } catch { } }
  if (!h) return res.status(404).json({ error: 'no such machine', code: 'not-found' });
  const q = req.query || {};
  const since = sinceOf(q.since);
  if (since.bad) return res.status(400).json({ error: 'since is a duration: 90s, 15m, 2h, 3d', code: 'bad_since' });
  const kind = DA.BY_KINDS.includes(q.kind) ? q.kind : null;
  const layer = q.layer === 'act' || q.layer === 'code' ? q.layer : null;
  const lost = typeof hosts.deviceAudit.lost === 'function' ? hosts.deviceAudit.lost() : null;   // B-f7a6: lines dropped since the hub started — the list says so
  res.json({ machine: { id: h.id, name: h.name || h.id }, acts: hosts.deviceAudit.tail({ hostId: h.id, kind, layer, since: since.at, limit: Number(q.limit) || undefined }), ...(lost && lost.total > 0 ? { lost } : {}) });
});
// THE AGENT's read (vibespace-remote audit): ONLY the acts `by` this conversation (its keys through window-reach's caller
// keys, like every exit verb); naming another subject is `human_only` — the owner reads every line on the card
app.get('/api/agent/remote/audit', (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  if (!hosts.deviceAudit) return res.status(503).json({ error: 'the device-act audit is not wired on this server', code: 'no_audit' });
  const R = require('../window-reach.js');
  const own = R.callerKeys(e[1], e[0]).map((k) => DA.byAgent(k)).filter(Boolean);
  const q = req.query || {};
  if (q.by && !own.includes(String(q.by))) return res.status(403).json({ error: `only the user reads the acts of another subject (${String(q.by).slice(0, 80)}) — the machine card's Activity… shows every line; you read your own`, code: 'human_only', you: own[0] || null });
  const since = sinceOf(q.since);
  if (since.bad) return res.status(400).json({ error: 'since is a duration: 90s, 15m, 2h, 3d', code: 'bad_since' });
  let hostId = null;
  if (q.machine) {
    if (hosts.held && hosts.held()) return res.status(503).json({ error: `the machine "${String(q.machine).slice(0, 80)}": ${hosts.unreadWords()}`, code: 'hosts-unread' });   // the B-f276 remainder (H24): unknown, never «no machine here»
    const m = String(q.machine).toLowerCase();
    const list = (() => { try { return hosts.list(); } catch { return []; } })();
    const hit = list.find((h) => h.id === q.machine) || list.find((h) => String(h.name || '').toLowerCase() === m) || null;
    if (!hit) return res.status(404).json({ error: `no machine "${String(q.machine).slice(0, 80)}" here`, code: 'no_machine' });
    hostId = hit.id;
  }
  // every machine-written byte (an argv head, a path, a machine name, an output head) through the peer-text belt on its way
  // to an agent — the rows are already judged (rowOf: bounded, re-redacted, folded); this is the agent door's own rule
  const PT = require('../peer-text.js');
  const acts = hosts.deviceAudit.tail({ hostId, bys: q.by ? [String(q.by)] : own, since: since.at, limit: Number(q.limit) || undefined })
    .map((r) => ({ ...r, machine: r.machine == null ? null : PT.toAgentText(r.machine, { kind: 'line', max: 80 }), summary: PT.toAgentText(r.summary || '', { kind: 'line', max: 400 }), outHead: r.outHead ? PT.toAgentText(r.outHead, { kind: 'block', max: 600 }) : '' }));
  res.json({ you: own[0] || null, acts });
});
app.get('/api/exits/audit', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'the exit audit is the user\'s', code: 'human_only' });
  res.json({ lines: exitProxy.auditTail({ hostId: req.query.host ? String(req.query.host) : null, limit: Number(req.query.limit) || 50 }) });
});
app.get('/api/exits/asks', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'only the user answers these', code: 'human_only' });
  res.json({ asks: exitProxy.listAsks() });
});
// "ask me each time" — a PERSON's answer. Cookie ONLY: any bearer (vsst_ / jbt_) is refused human_only — an agent
// never approves its own command.
app.post('/api/exits/asks/:askId', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'only the user answers this — an agent cannot approve its own command', code: 'human_only' });
  try { res.json(exitProxy.answerAsk(req.params.askId, { answer: (req.body || {}).answer, by: 'user' })); }
  catch (e) { cookieFail(res, e); }
});
// lane hub-act-ask (design q-042 D4): a hub act on a paired machine nobody clicked, held while its card is up — a PERSON's answer
// (once | always | deny). Cookie ONLY: any bearer (vsst_ / jbt_) is refused human_only (an agent never approves an act); who
// answered (the sign-in's handle) rides the act's audit line
app.get('/api/hub-acts/asks', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'only the user answers these', code: 'human_only' });
  res.json({ asks: hosts.hubActs ? hosts.hubActs.list() : [] });
});
// lane wake-approve-card r3: a hub-act ask is a `decide: 'person'` row — THE person verdict (src/routes/vault.js: any bearer ⇒
// human_only, not this page ⇒ cross_site) is asked BEFORE the asker answers; the answer carries its mark («allowed by you · 09:41»)
app.post('/api/hub-acts/asks/:askId', async (req, res) => {
  const who = personVerdict(req);
  if (!who.ok) return res.status(403).json({ error: who.code === 'human_only' ? 'only the user answers this — an agent cannot approve a hub act' : 'only this instance\'s own page answers this', code: who.code });
  if (!hosts.hubActs) return res.status(503).json({ error: 'hub-act asks are not wired on this server', code: 'no_asks' });
  try { res.json(await hosts.hubActs.answer(req.params.askId, { answer: (req.body || {}).answer, by: 'user', answeredBy: DAU.byOfReq(req), person: true })); }
  catch (e) { cookieFail(res, e); }
});
setTimeout(() => { try { hosts.sweepJsonlCache(); } catch {} }, 60000); // orphaned/stale remote-transcript cache
hosts.onReadAgain = () => bcastAll({ type: 'hosts-updated' });   // the B-f276 remainder (its read r1, S1): a held hosts.json read again — every page draws its machines again
const sshKey = require('../ssh-key'); // passphrase-protected private-key import
const { RemoteFs } = require('../remote-fs');
const remoteFs = new RemoteFs(hosts);
app.get('/api/hosts', (req, res) => {
  const k = hosts.keyInfo();
  // lane grants-unify: a machine's `exit` as the page reads it — its two lists from the ONE grants store (the record's
  // own `exit` keeps only ask / hub / lastRun; its pre-unify lists are never served)
  const list = hosts.list().map((h) => { if (!h || typeof h !== 'object') return h; let exit; try { exit = exitProxy.publicExit(h); } catch { exit = { mode: 'unknown' }; } return { ...h, exit }; });
  res.json({ hosts: list, key: { exists: k.exists, path: k.path, publicKey: k.publicKey }, ...(hosts.unreadWords && hosts.unreadWords() ? { unread: hosts.unreadWords() } : {}), ...(typeof hosts.tornCopy === 'function' && hosts.tornCopy() ? { torn: hosts.tornCopy() } : {}) });   // remainder of B-f276: why the list is empty while hosts.json is held; the MOVE: its torn lift's copy
});
app.post('/api/hosts', async (req, res) => {
  // A pasted key may be passphrase-protected: unlock it HERE (ssh-keygen -p,
  // src/ssh-key.js) and hand hosts.add() plaintext — add() must stay sync.
  // The passphrase is used for that one exec and is never stored, logged, or
  // put in argv; it exists only in this request body and the child's env.
  const b = { ...(req.body || {}) };
  try {
    let key = null;
    if (b.privateKey && String(b.privateKey).trim()) {
      key = await sshKey.prepareImportedKey(b.privateKey, b.keyPassphrase);
      b.privateKey = key.body;
    }
    delete b.keyPassphrase; // consumed here and nowhere else
    // verifier #3 («Add it again with a key…»): `replaces` names the ssh machine this record REPLACES — its name is no clash for the
    // new one, and it is removed only AFTER the new record is saved (a refused add leaves it as it was)
    let old = null;
    if (b.replaces) { try { old = hosts.get(String(b.replaces)); } catch { old = null; } }
    if (old && old.transport === 'dial') old = null;
    // B-2ca0 commit 2 (its read): a KEY FILE OF THIS SERVER the person named must be usable by BatchMode ssh — a passphrase is never
    // typed at a dial, so a protected key is refused here by code, not stored to fail every connect with a bare «Permission denied»
    if (b.transport !== 'dial' && b.keyPath && !(b.privateKey && String(b.privateKey).trim()) && String(b.keyPath) !== hosts.keyInfo().path) {
      b.keyPath = String(b.keyPath).replace(/^~(?=\/)/, require('os').homedir());
      const kv = await hosts.keyFileVerdict(b.keyPath);
      if (!kv.ok) throw Object.assign(new Error(kv.code === 'key-file-encrypted' ? 'that key file has a passphrase — ssh in BatchMode never types one' : kv.code === 'key-file-open' ? 'that key file is readable by others — ssh refuses such a key' : 'this server cannot use that key file (not readable here, or not a private key)'), { code: kv.code });
    }
    // B-2ca0: is the address an ALIAS of this hub's ssh config? Asked here (ssh -G: it connects to nothing), never taken from the body
    delete b.viaConfig;
    delete b.sshConfig;
    if (b.transport !== 'dial' && b.host) {
      const a = await hosts.resolveAlias(b.host).catch(() => null);
      const v = require('../hosts.js').configVerdict(a, b, require('os').homedir());   // B-2ca0: pure (its read 2: driven by a leg)
      if (v.refuse) throw Object.assign(new Error(v.refuse), v.code ? { code: v.code } : {});   // B-2ca0 follow-up: a port refusal carries its code (the page words it)
      b.user = v.user; b.port = v.port; if (v.viaConfig) { b.viaConfig = true; b.sshConfig = v.sshConfig; }
    }
    const id = hosts.add({ ...b, replaces: old ? old.id : null });
    if (old) { try { await removeHost(old); } catch (e) { console.warn('[hosts] the replaced machine stays — its removal failed:', e && e.message); } }   // the add stands
    bcastAll({ type: 'hosts-updated' });
    if (await notDurable(res)) return;   // B-48a4 cure
    res.json({ success: true, id, key: key && { type: key.type, fingerprint: key.fingerprint, wasEncrypted: key.wasEncrypted } });
  } catch (e) {
    // `code` drives the client's localized message (server prose is for logs
    // and non-browser callers)
    res.status(400).json({ error: e.message, code: e.code });
  }
});
// lane ui-needs-a-button (主开发 Q2, machines-1): THE PUBLIC KEY a person adds to an ssh machine that refused it — a READ (no key is made),
// the public half only, and the PERSON's door: THE person verdict (src/routes/vault.js personVerdict — any bearer ⇒ human_only, not
// this instance's own page ⇒ cross_site; reader follow-up #7: one verdict, never a local copy); the page words the code
app.get('/api/hosts/:id/public-key', async (req, res) => {
  const who = personVerdict(req);
  if (!who.ok) return res.status(403).json({ error: who.code === 'human_only' ? 'a machine\'s public key is shown to the person — an agent\'s token may not read it' : 'a machine\'s public key is shown only on this instance\'s own page', code: who.code });
  try { const r = await hosts.publicKeyOf(req.params.id); res.status(r.ok ? 200 : 404).json(r.ok ? { ok: true, keys: r.keys } : { ok: false, code: r.code }); }
  catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ error: e.message, ...(e && e.code === 'hosts-unread' ? { code: e.code } : {}) }); }   // the B-f276 remainder meets the public-key door: a held list keeps its 503 and name
});
app.post('/api/hosts/key', async (req, res) => {
  try { res.json({ success: true, key: await hosts.generateKey() }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/hosts/:id/test', async (req, res) => {
  try { res.json({ success: true, ...(await hosts.test(req.params.id, { by: DAU.byOfReq(req) })) }); }
  catch (e) { const held = !!e && e.status === 503; res.status(held ? 503 : 400).json({ error: e.message, ...(held && e.code ? { code: e.code } : e && e.code === 'host-key-changed' ? { code: e.code, fp: e.fp || null, pinned: !!e.pinned, ...(e.jump ? { jump: e.jump } : {}), ...(e.pinLine ? { pinLine: e.pinLine } : {}) } : e && e.code === 'host-key-name' ? { code: e.code } : {}) }); }   // a held machines list keeps its 503 and its name (bl-jobs, line 124); every other refusal 400 with its words — a changed key (or a pin that cannot be used) with its code and facts (lane lg-remote-hardening)
});
// lane lg-remote-hardening (B-7f0b, q-042 D6): a machine's ssh HOST-KEY PIN — read it (and, ?scan=1, what the machine shows
// now), pin the keys the person confirmed, unpin. The person's act only: an agent that could unpin could reopen the
// first-key trust, so any bearer is refused (human_only), as for «Who can use it».
const HKR = require('../host-keys.js');
const hostKeyHumanOnly = (req, res) => { if (!isAnyBearer(req)) return false; res.status(403).json({ error: 'the user pins a machine\'s host key — an agent token may not read or change it', code: 'human_only' }); return true; };
const hostKeyFail = (res, e) => res.status(e && e.code === 'human_only' ? 403 : e && (e.code === 'host-key-not-durable' || e.code === 'hosts-unread') ? 503 : 400).json({ error: (e && e.message) || 'failed', code: (e && e.code) || null, params: (e && e.params) || undefined });
app.get('/api/hosts/:id/host-keys', async (req, res) => {
  if (hostKeyHumanOnly(req, res)) return;
  try {
    const h = hosts.get(req.params.id);
    // r3431 (B-7f0b's remainder): a machine behind a JUMP HOST shows the hop's keys too, each scan said apart — a hop or a machine that
    // does not answer is said in words (seenWhy / seenJumpWhy), never a failed dialog (a changed pinned hop also stops the machine's scan)
    const hop = HKR.hopOf(h);
    let seen = null, seenWhy = null, seenJump = null, seenJumpWhy = null;
    if (req.query.scan) {
      try { seen = (await hosts.hostKeyScan(h.id)).map(({ type, fp }) => ({ type, fp })); } catch (e) { if (!hop) throw e; seen = []; seenWhy = (e && e.message) || 'no answer'; }
      if (hop) { try { seenJump = (await hosts.hopKeyScan(h.id)).map(({ type, fp }) => ({ type, fp })); } catch (e) { seenJump = []; seenJumpWhy = (e && e.message) || 'no answer'; } }
    }
    const pin = HKR.pinView(h);
    const match = seen && pin.hostKeys ? seen.some((k) => pin.hostKeys.some((p) => p.fp === k.fp)) : null;
    res.json({ ...pin, seen, match, ...(hop ? { seenWhy, seenJump, seenJumpWhy } : {}) });
  } catch (e) { hostKeyFail(res, e); }
});
// B-7f0b (the coordinator's r1220 (2)): ONE PRESS pins the key(s) this hub ALREADY trusts for the machine (its known_hosts line);
// none ⇒ host-key-not-known, and the page opens the Host key… dialog's scan-and-confirm
app.post('/api/hosts/:id/host-keys/known', async (req, res) => {
  if (hostKeyHumanOnly(req, res)) return;
  try { const v = await hosts.pinKnownHostKeys(req.params.id); bcastAll({ type: 'hosts-updated' }); res.json({ success: true, ...v }); }
  catch (e) { hostKeyFail(res, e); }
});
app.post('/api/hosts/:id/host-keys', async (req, res) => {
  if (hostKeyHumanOnly(req, res)) return;
  try { const v = await hosts.pinHostKeys(req.params.id, (req.body || {}).fps); bcastAll({ type: 'hosts-updated' }); res.json({ success: true, ...v }); }
  catch (e) { hostKeyFail(res, e); }
});
// lane lg-remote-hardening (B-7f0b, q-042 D3): forget a machine's pinned DEVICE key (its agent proves a key at the next hello
// and that one is pinned) — the person's act after a reinstall; an agent's bearer is refused like the ssh pin's
app.delete('/api/hosts/:id/device-key', async (req, res) => {
  if (hostKeyHumanOnly(req, res)) return;
  try { const v = hosts.forgetDeviceKey(req.params.id, { unproven: String((req.query && req.query.unproven) || '') === '1' }); bcastAll({ type: 'hosts-updated' }); if (await notDurable(res)) return; res.json({ success: true, ...v }); } // ?unproven=1 = «Let in without a key» — 主开发's hunt: the not-durable guard its siblings carry
  catch (e) { hostKeyFail(res, e); }
});
app.delete('/api/hosts/:id/host-keys', async (req, res) => {
  if (hostKeyHumanOnly(req, res)) return;
  try { const v = await hosts.unpinHostKeys(req.params.id); bcastAll({ type: 'hosts-updated' }); res.json({ success: true, ...v }); }
  catch (e) { hostKeyFail(res, e); }
});
app.get('/api/hosts/:id/sessions', async (req, res) => {
  try { res.json({ sessions: await hosts.discoverSessions(req.params.id, req.query.fresh ? { ttlMs: 0 } : {}) }); }
  catch (e) { res.status(400).json({ error: e.message, ...(e && typeof e.code === 'string' && /^discovery-/.test(e.code) ? { code: e.code } : {}) }); }   // B-5278 (r951): the device's own reply, by its code
});
/** ONE removal of a machine record — DELETE /api/hosts/:id, and a replaced machine once its new record is saved (POST /api/hosts
 *  `replaces`, verifier #3). */
async function removeHost(h) {
  // dial machine: removing the record IS the unpair (token hash lives on
  // it) — tear down mounts / token file / live stream first (B-f3e8).
  // ssh machines keep the OLD preserve-as-orphan semantics (review finding:
  // remove+re-add is the only way to edit a host's address/key, and the
  // confirm dialog promises nothing on the remote is touched — the orphan
  // rows remain manageable/unmountable).
  if (h.transport === 'dial') await unpairDialDevice(h.deviceId);
  // port-forwards are pure local plumbing (unlike mounts, which keep their
  // preserve-as-orphan semantics for ssh) — with the host record gone their
  // records become invisible, undeletable orphans (review finding)
  else { try { portForwards.onMachineUnpaired(h.id, { now: true }); } catch { } }   // r5036: a person's removal lands at once (port-forwards.json held: at its lift, on the writer)
  try { require('../routes/account-tails.js').forgetHostCliTail(h.id); } catch { }   // B-ee0a's take: its CLI key's kept tail leaves with it
  try { exitProxy.onMachineUnpaired(h.id); } catch { }
  hosts.remove(h.id);
}
app.delete('/api/hosts/:id', async (req, res) => {
  if (hosts.unreadWords && hosts.unreadWords()) return res.status(503).json({ error: `removing a machine: ${hosts.unreadWords()}`, code: 'hosts-unread' });   // remainder of B-f276: refused BEFORE its teardown
  try {
    await removeHost(hosts.get(req.params.id));
    bcastAll({ type: 'hosts-updated' });
    if (await notDurable(res)) return;   // B-48a4 cure
    res.json({ success: true });
  }
  catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ error: e.message, ...(e && (e.code === 'mounts-unread' || e.code === 'tokens_unread') ? { code: e.code } : {}) }); }   // the B-f276 remainder: a held store's refusal keeps its status (B-f276 family unit 1: the folder links' too)
});
// Bootstrap: progress streams to ALL clients over WS (host-bootstrap events);
// the HTTP response returns when the run completes.
app.post('/api/hosts/:id/bootstrap', async (req, res) => {
  const bcast = (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  };
  try {
    // NOTE: spread ev FIRST — its own `type` ('step'/'log'/'done') must not
    // clobber the outer message type the client filters on. `kind` carries
    // the event type instead.
    const steps = await hosts.bootstrap(req.params.id, (ev) => bcast({ ...ev, kind: ev.type, type: 'host-bootstrap', hostId: req.params.id }));
    res.json({ success: Object.values(steps).every(s => s === 'ok'), steps });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/hosts/bootstrap-steps', (req, res) => res.json({ steps: hosts.bootstrapSteps() }));
// Remote directory autocomplete (New Session dialog when a host is chosen) —
// mirrors /api/dir-complete but runs ls over ssh on the target.
// lane path-field: with `bases` / `q` / `probe` / `kind` (the path field asks) the answer is the machine's listing slice
// (hosts.dirSlice — one sh round trip there; the same listing /api/dir-complete builds here) + `self` + `took`.
const jsonList = (v) => { if (Array.isArray(v)) return v.map(String); if (typeof v !== 'string' || !v) return []; try { const a = JSON.parse(v); return Array.isArray(a) ? a.map(String) : []; } catch { return [v]; } };
const { refusalBody } = require('../hosts.js'); // «my-mac cannot be reached» as the path field's words (lane hub-dies-dead-ssh-host)
app.get('/api/hosts/:id/dir-complete', async (req, res) => {
  if (req.query.bases != null || req.query.q != null || req.query.probe != null || req.query.kind != null) {
    const ac = new AbortController(); if (typeof res.on === 'function') res.on('close', () => { if (!res.writableEnded) ac.abort(); });   // r1633 (1): a newer ask ends the late wait there
    try { return res.json(await hosts.dirSlice(req.params.id, { text: String(req.query.path || ''), bases: jsonList(req.query.bases), probe: jsonList(req.query.probe), q: String(req.query.q || ''), kind: String(req.query.kind || 'folder'), press: req.query.press === '1', late: req.query.late === '1' }, { by: DAU.byOfReq(req), signal: ac.signal })); }
    catch (e) { return res.json({ suggestions: [], error: String((e && e.message) || e).slice(0, 120), ...refusalBody(e) }); }
  }
  try { res.json({ suggestions: await hosts.dirComplete(req.params.id, req.query.path || '', { by: DAU.byOfReq(req) }) }); }
  catch (e) { res.json({ suggestions: [], ...(e && e.code === 'host-unreachable' ? { error: String(e.message).slice(0, 120), ...refusalBody(e) } : {}) }); }
});
// Recent working dirs seen on the host (from its Claude project dirs) — the
// "path list" the New Session dialog offers as chips for a remote host.
// Backend (CLI) status on a host — Manage Agents dialog when a host is chosen.
app.get('/api/hosts/:id/backend-status', async (req, res) => {
  try { const st = await hosts.backendStatus(req.params.id); const rc = require('./remote-cli.js').remoteCliOf(hosts); res.json(rc ? { ...st, cliWhere: rc.census(req.params.id) } : st); } // B-69ec: where THAT machine's login shell found each CLI (the creates' answers, no ask)
  catch (e) { res.status(400).json({ error: e.message }); }
});
// VibeSpace integration on a host (2.129.0, backlog B-34bb): the ~/.vibespace
// footprint remote sessions leave there — per-tool presence compared against
// the LOCAL copies by sha256 (`current`), remote hook registration, node
// availability, keeper session files — plus explicit install/refresh + remove.
// (A future remote session spawn re-installs by design; the UI says so.)
app.get('/api/hosts/:id/agent-tools', async (req, res) => {
  try {
    const st = await hosts.agentToolsStatus(req.params.id);
    const toolDir = AGENT_BIN_DIR;
    const crypto = require('crypto');
    for (const [n, t] of Object.entries(st.tools)) {
      let local = null;
      try { local = crypto.createHash('sha256').update(fs.readFileSync(path.join(toolDir, n))).digest('hex'); } catch { }
      t.current = !!(t.present && local && t.sha256 === local);
      delete t.sha256;
    }
    res.json(st);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/hosts/:id/agent-tools/install', async (req, res) => {
  // Same master-switch guard as the local /api/agent-hooks/install — the
  // remote twin must not silently contradict a pristine-CLI state either.
  if (!integrationEnabled()) return res.status(400).json({ error: 'VibeSpace integration is disabled (Settings → Integration → master switch). Enable it first.' });
  // r3064 (4): success = no refused or error receipt; else what did not land, by name
  try { const r = await hosts.installAgentTools(req.params.id, AGENT_BIN_DIR), bad = (r && r.notLanded) || []; res.json({ success: !bad.length, ...r, ...(bad.length ? { error: `not everything landed on that machine: ${bad.join('; ')}` } : {}) }); }
  catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ error: e.message, ...(e && e.status === 503 && e.code ? { code: e.code } : {}) }); }   // a held machines list keeps its 503 and its name
});
app.post('/api/hosts/:id/agent-tools/uninstall', async (req, res) => {
  // r3064: a strip that did not land answers so, by name (the tools are kept on that machine)
  try { const r = await hosts.uninstallAgentTools(req.params.id); res.json({ success: !(r && r.ok === false), ...r }); }
  catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ error: e.message, ...(e && e.status === 503 && e.code ? { code: e.code } : {}) }); }   // a held machines list keeps its 503 and its name
});
app.get('/api/hosts/:id/recent-cwds', async (req, res) => {
  // a paired ssh machine that cannot be reached is refused BY NAME before discovery spawns (lane hub-dies-dead-ssh-host)
  try { await hosts.refuseUnreachable(req.params.id); } catch (e) { return res.json({ cwds: [], recent: [], error: String((e && e.message) || e).slice(0, 120), ...refusalBody(e) }); }
  try {
    const sessions = await hosts.discoverSessions(req.params.id);
    const seen = [];
    for (const s of sessions) { if (s.cwd && !seen.includes(s.cwd)) seen.push(s.cwd); if (seen.length >= 8) break; }
    // lane path-field: COUNTS — how many conversations started in each folder there, and the newest (ms) — the path
    // field's ③ «最近» says «3 个会话 · 昨天» for a remote machine the same as here
    res.json({ cwds: seen, recent: require('../path-candidates.js').recentCounts(sessions) });
  } catch { res.json({ cwds: [], recent: [] }); }
});

  return { exitAgentSession, remoteFs, sshKey };
}
module.exports = { create };
