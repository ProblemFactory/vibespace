'use strict';
// THE TWO BULK ACTS' DOORS (lane auto-resume-bulk, .349 — userW's fleet, 2026-10-23: dozens of conversations
// stopped on usage walls the same day, auto-resume was off, and nobody will open and resume them one by one).
//   GET  /api/sessions/stopped                 the plan the Settings row and the dialog show BEFORE anything runs: the
//                                              auto-resume counts, the stoppedBy set (who would be resumed, earliest
//                                              stop first; who is skipped and why) and the batch's expected COST
//   POST /api/sessions/auto-resume-all         {enabled} — «对所有会话开启自动继续» / «全部关闭» (the core's setEnabledAll:
//                                              the per-session setEnabled road, ONE list broadcast; the instance default
//                                              for NEW sessions is not touched)
//   POST /api/sessions/resume-stopped          {limit?, ids?} — «恢复所有因用量/过载停止的会话» (the core's resumeBatch:
//                                              ONE spend authorization for the batch, paced continues, walls skipped)
//   GET  /api/sessions/resume-stopped/:batchId  the batch as it goes (the dialog polls it until `done`)
//   POST /api/sessions/resume-stopped/:batchId/stop  THE STOP DOOR (U2 cure, law 3): nothing more is started — what the batch
//                                              has not reached is neither continued nor charged («stopped»); the person only
// OWNER COOKIE ONLY: every bearer is refused by name (pressBearer — vsst_ / jbt_ / vsak_; the branch refused only the first two). The automation-key verb table (src/automation-keys.js) does NOT
// get these two acts — its one spend identity (`automation:<keyId>`) bills the conversation a key OPENS, while a resume
// bills the session's OWN slot (fireIdentityFor), and no row defines how a key caller's batch maps onto those slots;
// adding one would be inventing a money road.
// THE COST is gathered here from facts the instance already holds — the conversation's live context size (its last
// main-thread record's usage, `_lastContext` — what its status bar shows), else the usage LEDGER (its last main-thread
// request = its context size and model); each member's ledger records in its current 5 h window; the usage CACHE
// (the member's 5 h utilization and reset) and the live PRICE table (usage-history priceRowFor) — and decided by PURE
// src/bulk-resume-cost.js. No vendor call.
const BC = require('../bulk-resume-cost.js');
const { bucketRemaining } = require('../account-pool-auto.js');
const { globalUsageKeyOf } = require('../backend-caps.js');

const { pressBearer, pressOf, pageVerdict, ownOriginOf } = require('../write-origin.js');   // EVERY bearer — an agent's vsst_ / jbt_ AND an automation key's vsak_; and a person's own page for the two acts
const LEDGER_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;  // a conversation's last request is looked for this far back
const ESTIMATE_TTL_MS = 30 * 1000;                     // the Settings row and the dialog may ask in a burst


function create({ activeSessions, pressesToday = null, getAutoResume = () => null, getUsageHistory = () => null, readCacheFor = () => null, sessionModelFor = () => null, log = () => { } }) {
  let cache = { sig: null, at: 0, est: null };

  /** The batch's expected cost for the plan's eligible rows (null = nothing to estimate). */
  function estimateFor(eligible, now = Date.now()) {
    if (!eligible || !eligible.length) return null;
    const sig = eligible.map((e) => `${e.id}|${e.at}|${e.identity ? e.identity.key : ''}`).join(',');
    if (cache.sig === sig && now - cache.at < ESTIMATE_TTL_MS) return cache.est;
    const uh = getUsageHistory();
    const convOf = new Map();       // conversation id → webui id
    const members = {};             // key → {name, pctNow, windowStart, upTo, rows: []}
    for (const e of eligible) {
      const s = activeSessions.get(e.id);
      const conv = s && (s.claudeSessionId || s.backendSessionId);
      if (conv) convOf.set(String(conv), e.id);
      const key = e.identity && e.identity.key;
      if (!key || members[key]) continue;
      let c = null;
      try { c = readCacheFor(key); } catch { c = null; }
      const fh = c && c.fiveHour;
      const rem = fh ? bucketRemaining(fh, Math.floor(now / 1000)) : null;
      const resetsAt = fh && Number(fh.resetsAt) > 0 ? Number(fh.resetsAt) * 1000 : 0;
      const open = resetsAt > now;
      members[key] = {
        name: e.identity.name || key,
        pctNow: rem === null ? null : Math.max(0, 100 - rem),
        windowStart: open ? resetsAt - BC.FIVE_HOUR_MS : 0,
        upTo: Number(c && c.fetchedAt) > 0 ? Math.min(now, Number(c.fetchedAt)) : now,
        rows: [],
      };
    }
    const convRows = new Map();
    if (uh && typeof uh._events === 'function') {
      try {
        for (const ev of uh._events(now - LEDGER_LOOKBACK_MS, now)) {
          if (!ev) continue;
          const wid = ev.sid ? convOf.get(String(ev.sid)) : null;
          if (wid) { const l = convRows.get(wid) || []; l.push(ev); convRows.set(wid, l); }
          // the member's window: the ledger keying costBetweenMulti uses (a machine login per harness), and never an
          // unresolved host bucket (another machine's own login is not this member)
          const acct = ev.acct || globalUsageKeyOf(ev.be);
          const m = members[acct];
          if (m && m.windowStart && ev.ts >= m.windowStart && ev.ts <= m.upTo && !(ev.host && ev.atype === 'host')) m.rows.push(ev);
        }
      } catch (err) { log('[bulk-resume] ledger read failed: ' + err.message); }
    }
    const items = eligible.map((e) => {
      const s = activeSessions.get(e.id);
      const live = s && s._lastContext && Number(s._lastContext.tokens) > 0 ? { tokens: Number(s._lastContext.tokens), model: s._lastContext.model || null } : null;
      const ctx = live || BC.contextOf(convRows.get(e.id) || []);
      let model = ctx && ctx.model;
      if (!model) { try { model = sessionModelFor(s) || (s && (s._servedModel || s._pickedModel || s._spawnModel)) || null; } catch { model = null; } }
      return { id: e.id, name: e.name, at: e.at, model, contextTokens: ctx ? ctx.tokens : null, member: e.identity || null };
    });
    const memberFacts = {};
    for (const [k, m] of Object.entries(members)) memberFacts[k] = { name: m.name, pctNow: m.pctNow, ratio: BC.windowRatio({ rows: m.rows, pctNow: m.pctNow }) };
    const est = BC.estimateBatch({
      items, members: memberFacts,
      priceOf: (model, it) => { try { return uh && typeof uh.priceRowFor === 'function' ? uh.priceRowFor(model, { acct: (it && it.member && it.member.key) || null, prompt: (it && Number(it.contextTokens)) || 0 }) : null; } catch { return null; } },
    });
    cache = { sig, at: now, est };
    return est;
  }

  function stopped(now = Date.now()) {
    const ar = getAutoResume();
    if (!ar || typeof ar.stoppedPlan !== 'function') return { ok: false, error: 'auto-continue is not running', code: 'not_running' };
    const plan = ar.stoppedPlan(now);
    let estimate = null;
    try { estimate = estimateFor(plan.eligible, now); } catch (e) { log('[bulk-resume] estimate failed: ' + e.message); }
    const pub = (e) => ({ id: e.id, name: e.name, kind: e.kind, at: e.at, member: e.identity ? { key: e.identity.key, name: e.identity.name } : null });
    return { ok: true, counts: ar.bulkCounts(), eligible: plan.eligible.map(pub), skipped: plan.skipped, total: plan.total, running: plan.running || null, estimate, overage: plan.overage || null, presses: (() => { try { return pressesToday ? pressesToday() : []; } catch { return []; } })() };   // (a): the presses of the day, for the spending view
  }

  function register(app) {
    const owner = (req, res) => {
      if (!pressBearer(req.headers || {})) return true;
      res.status(403).json({ error: 'the owner’s bulk act — never a bearer’s route (an agent or an automation key)', code: 'agent_forbidden' });
      return false;
    };
    // THE TWO ACTS need a person on THIS instance's own page (write-origin pageVerdict, as the vault's person doors): with
    // sign-in off every request passes the auth middleware, so a header-less local POST is not a person's press
    const person = (req, res) => {
      if (!owner(req, res)) return false;
      const h = req.headers || {};
      if (pageVerdict(h, ownOriginOf(h, { encrypted: !!(req.socket && req.socket.encrypted) })).ok) return true;
      res.status(403).json({ error: 'the bulk acts are pressed on this instance’s own page', code: 'not_a_page' });
      return false;
    };
    app.get('/api/sessions/stopped', (req, res) => {
      try { if (!owner(req, res)) return; const r = stopped(); res.status(r.ok ? 200 : 503).json(r); }
      catch (e) { res.status(500).json({ error: (e && e.message) || String(e) }); }
    });
    app.post('/api/sessions/auto-resume-all', (req, res) => {
      try {
        if (!person(req, res)) return;
        const b = req.body || {};
        if (typeof b.enabled !== 'boolean') return res.status(400).json({ error: '`enabled` must be true or false' });
        const ar = getAutoResume();
        if (!ar || typeof ar.setEnabledAll !== 'function') return res.status(503).json({ error: 'auto-continue is not running', code: 'not_running' });
        res.json({ ok: true, ...ar.setEnabledAll(b.enabled) });
      } catch (e) { res.status(500).json({ error: (e && e.message) || String(e) }); }
    });
    app.post('/api/sessions/resume-stopped', (req, res) => {
      try {
        // THE PERSON'S OWN PRESS (the owner's ruling 2026-11-18): every bearer refused FIRST, then the page — and the press
        // minted here rides the batch (attended: none counted; write-origin pressOf, test-spend-paths §2b derives this door)
        if (pressBearer(req.headers)) return res.status(403).json({ error: 'the owner’s bulk act — never a bearer’s route (an agent or an automation key)', code: 'agent_forbidden' });
        if (!person(req, res)) return;
        const b = req.body || {};
        const ar = getAutoResume();
        if (!ar || typeof ar.resumeBatch !== 'function') return res.status(503).json({ error: 'auto-continue is not running', code: 'not_running' });
        const limit = b.limit === undefined || b.limit === null ? null : Number(b.limit);
        if (limit !== null && !(Number.isInteger(limit) && limit >= 0)) return res.status(400).json({ error: '`limit` must be a whole number' });
        const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 2000) : null;
        const r = ar.resumeBatch({ limit, ids, pressed: pressOf(req) });
        if (r && r.ok === false && r.why === 'in-flight') return res.status(409).json({ ...r, error: 'a resume of the stopped sessions is already running', code: 'in_flight' });
        res.json(r);
      } catch (e) { res.status(500).json({ error: (e && e.message) || String(e) }); }
    });
    app.post('/api/sessions/resume-stopped/:batchId/stop', (req, res) => {
      try {
        if (!person(req, res)) return;
        const ar = getAutoResume();
        const r = ar && typeof ar.stopBatch === 'function' ? ar.stopBatch(String(req.params.batchId), 'the person (Stop)') : null;
        if (!r) return res.status(404).json({ error: 'no such batch' });
        res.json(r);
      } catch (e) { res.status(500).json({ error: (e && e.message) || String(e) }); }
    });
    app.get('/api/sessions/resume-stopped/:batchId', (req, res) => {
      try {
        if (!owner(req, res)) return;
        const ar = getAutoResume();
        const r = ar && typeof ar.batchStatus === 'function' ? ar.batchStatus(String(req.params.batchId)) : null;
        if (!r) return res.status(404).json({ error: 'no such batch' });
        res.json(r);
      } catch (e) { res.status(500).json({ error: (e && e.message) || String(e) }); }
    });
  }

  return { register, stopped, estimateFor };
}

module.exports = { create, LEDGER_LOOKBACK_MS, ESTIMATE_TTL_MS };
