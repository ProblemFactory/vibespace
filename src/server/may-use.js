'use strict';
/**
 * WHAT A CONVERSATION MAY USE — ORCH (unit what-it-may-use, 2026-11-17; the owner: «话说现在似乎没办法根据对话看到它到底有
 * 什么channel之类的权限？»). ONE read for Session Properties' «What it may use» section: the conversation's FACTS (the keys the
 * doors name it by, its Task Groups, its machine, whether it has an agent at all) and every door's answer for them, shaped by
 * PURE src/may-use-model.js. This module judges NOTHING itself: each door answers through its own lister, beside its own
 * verdict (browser-keeper admitsFor, automation-engine mayUseFor, channels-engine mayUseFor, exit-proxy mayUseFor,
 * window-targets-engine mayUseFor, browser-logins mayUseFor, vault-use-grants mayUseFor; vault-job's PURE approvedBy over
 * the jobs it owns).
 *
 *  · ITS FACTS (cure r1, SHOULD a: a stopped conversation is read from the rows the sessions route KEPT — no sweep per read; a
 *    sweep only when it kept none, never while discovery is paused, then said: list_paused) — LIVE: the keys the live doors build (its conversation id — claude-lock-capture addressableId —, webui:<id>,
 *    its browser key), its groups by the Task Group store's groupsForSession({sessionKey, cwd, initialGroupIds}) (the
 *    crosswalk taskIdsFor uses). NOT LIVE: its STORED facts — the sessions list's own row for its key (its conversation id,
 *    folder, machine, mode), its browser key from the durable binding (data/browser-env/bindings.json), its groups by the
 *    same groupsForSession over its key and folder; never a webui key. The group store unreadable ⇒ `groupsUnreadable`:
 *    every group-dependent answer says «unknown», never «none».
 *  · ITS COST IS STATED AND BOUNDED (主开发's law): every door reads prepared rows and the resources' own lists — no walk of
 *    the channel conversations, no rule per conversation —; each part is timed (`ms`), and the whole answer is held under
 *    BUDGET_MS of the loop by scripts/test-may-use.mjs at the owner's size (200 000 channel conversation rows, a few hundred
 *    grants). A door that throws answers its part as unknown, named; the rest stands.
 *  · A PERSON'S VIEW: the route answers the owner's cookie only — an agent's (or a job's, or a key's) bearer is refused
 *    `human_only` by THE person verdict (src/routes/vault.js personVerdict), names and purposes only, never a value.
 *
 * create({...}) → { factsOf(key, {webuiId}), viewFor(key, {webuiId}), mount(app) }; GET /api/may-use?key=<sessionKey>[&webuiId=]
 */
const M = require('../may-use-model.js');
const VJ = require('../vault-job.js');
const BUDGET_MS = 50;
const str = (v) => (v === undefined || v === null ? '' : String(v));
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;

function create({
  activeSessions = new Map(), sessionKeyOf = () => '', addressableId = () => null, storedRow = async () => null, groupsOf = () => [],
  groupName = (g) => (g && (g.title || g.name)) || str(g && g.id), noAgentOf = () => false, browserKeyOf = () => '', grants = null,
  doors = {}, log = () => { },
} = {}) {
  /** A live session for this key (its webui id when the page gave it, else the one whose status key it is). */
  function liveOf(key, webuiId) {
    if (webuiId && activeSessions.get(webuiId)) return { s: activeSessions.get(webuiId), id: webuiId };
    for (const [id, s] of activeSessions) { try { if (sessionKeyOf(s, id) === key) return { s, id }; } catch { } }
    return null;
  }
  async function factsOf(key, { webuiId = '' } = {}) {
    key = str(key);
    if (!key) return { ok: false, code: 'bad_key', error: 'which conversation? (key=<backend>:<id>)' };
    const t0 = process.hrtime.bigint();
    const live = liveOf(key, str(webuiId));
    let row = null, swept = false;
    if (!live) {
      // the sessions route's KEPT rows (a read — no sweep per read); a promise only when it kept none (the one sweep it would run)
      try { const r = storedRow(key); if (r && typeof r.then === 'function') { swept = true; row = await r; } else row = r; } catch (e) { log(`[may-use] the sessions list could not be read for ${key}: ${e && e.message}`); }
      if (row && row.paused) return { ok: false, code: 'list_paused', error: 'the session list is paused (a storage mount does not answer) — what is stored for this conversation cannot be read now' };
    }
    if (!live && !row) return { ok: false, code: 'not_found', error: 'no conversation with that key is live or listed' };
    const s = live ? live.s : row;
    const backend = str(s.backend) || str(key.split(':')[0]) || 'claude';
    const cid = live ? str(addressableId(s)) : str(row.backendSessionId || row.sessionId || key.slice(key.indexOf(':') + 1));
    const bk = live ? str(s._browserKey) : (() => { try { return str(browserKeyOf(cid)); } catch { return ''; } })();
    const conversationKeys = [...new Set([...(cid ? [cid] : []), ...(live ? [`webui:${live.id}`] : []), ...(bk ? [bk] : [])])];
    const sessionKeys = [...new Set([...(cid ? [`${backend}:${cid}`] : []), ...(live ? [`webui:${live.id}`] : [])])];
    let groups = [], groupsUnreadable = false;
    try {
      groups = (groupsOf({ sessionKey: key, cwd: s.cwd || '', initialGroupId: live ? s._initialGroupId : undefined, initialGroupIds: live ? s._initialGroupIds : undefined }) || [])
        .filter((g) => g && g.id).map((g) => ({ id: str(g.id), name: groupName(g) }));
    } catch (e) { groupsUnreadable = true; log(`[may-use] ${key}: the Task Group list could not be read (${e && e.message}) — group grants said «unknown»`); }
    return { ok: true, ms: swept ? null : ms(t0), swept, facts: { key, live: !!live, webuiId: live ? live.id : null, cid, browserKey: bk, conversationKeys, sessionKeys, groups, groupIds: groups.map((g) => g.id), groupsUnreadable,
      remote: !!(s.hostId || s.host), host: str(s.hostId || s.host) || null, noAgent: !!noAgentOf(backend), backend } };
  }

  /** Every door's answer for these facts, each part timed; a door that throws answers ONE unknown row naming itself. */
  function answersOf(f) {
    const answers = [], parts = {};
    let accounts = [];
    const doorFacts = { cid: f.cid, conversationKeys: f.conversationKeys, sessionKeys: f.sessionKeys, groupIds: f.groupIds, groupsUnreadable: f.groupsUnreadable };
    const part = (name, door, fn) => {
      const t0 = process.hrtime.bigint();
      try { const r = fn(); if (Array.isArray(r)) answers.push(...r); }
      catch (e) { log(`[may-use] the ${name} part failed: ${e && e.message}`); answers.push({ door, resource: '*', name: '', ok: false, code: 'unknown_shape' }); parts[name] = { ms: ms(t0), failed: true }; return; }
      parts[name] = { ms: ms(t0) };
    };
    const get = (k) => { const d = doors[k]; return typeof d === 'function' ? d() : d || null; };
    if (!f.noAgent) {
      part('channels', 'channel-reach', () => { const c = get('channels'); if (!c || typeof c.mayUseFor !== 'function') return []; const r = c.mayUseFor(doorFacts); accounts = r.accounts || []; return r.answers || []; });
      part('browser', 'browser-profile', () => { if (f.remote) return []; const k = get('browser'); return k && typeof k.admitsFor === 'function' ? k.admitsFor({ browserKey: f.browserKey, conversationKeys: f.conversationKeys, taskIds: f.groupIds, groupsUnreadable: f.groupsUnreadable }) : []; });
      part('logins', 'browser-login', () => { const l = get('logins'); return l && typeof l.mayUseFor === 'function' ? l.mayUseFor(doorFacts) : []; });
      part('vault', 'vault-use', () => { const v = get('vaultUse'); return v && typeof v.mayUseFor === 'function' ? v.mayUseFor(doorFacts) : []; });
      part('jobs', 'vault-job', () => vaultJobAnswers(f));
      part('keys', 'automation-key-use', () => { const a = get('automation'); return a && typeof a.mayUseFor === 'function' ? a.mayUseFor(doorFacts) : []; });
      part('exits', 'exit', () => { const x = get('exits'); return x && typeof x.mayUseFor === 'function' ? x.mayUseFor(doorFacts) : []; });
      part('windows', 'window', () => { const w = get('windows'); return w && typeof w.mayUseFor === 'function' ? w.mayUseFor(doorFacts) : []; });
    }
    return { answers, accounts, parts };
  }
  /** vault-job: the entries a Background Work job THIS conversation owns is approved to use at every start (vault-job.js
   *  approvedBy over the entry's rows — the door's own verdict). */
  function vaultJobAnswers(f) {
    const jm = typeof doors.jobs === 'function' ? doors.jobs() : doors.jobs;
    const st = typeof grants === 'function' ? grants() : grants;
    if (!jm || !jm.jobs || !st || !f.cid) return [];
    const owned = [...jm.jobs.values()].filter((j) => j && j.id && ((j.ownerSession && j.ownerSession.conversationId) || (j.owner && j.owner.conversation && j.owner.conversation.id)) === f.cid);
    if (!owned.length) return [];
    const out = [];
    for (const row of st.rowsOfDoor('vault-job')) {
      for (const j of owned) {
        if (!VJ.approvedBy([row], { keys: f.conversationKeys, jobIds: [j.id, j.cronParent].filter(Boolean).map(String) })) continue;
        const m = /^[^:]+:([^#]*)/.exec(str(row.resource));
        const label = str(typeof jm.labelOf === 'function' ? jm.labelOf(j) : j.id);   // THE job label accessor (test-architecture §93 — never the record's name raw)
        out.push({ door: 'vault-job', resource: `${row.resource}|${j.id}`, name: `${m ? m[1] : row.resource} · ${label}`, ok: true, via: 'conversation', detail: { job: label, jobId: str(j.id) } });
      }
    }
    return out;
  }
  async function viewFor(key, opts = {}) {
    const fr = await factsOf(key, opts);
    if (!fr.ok) return fr;
    const t0 = process.hrtime.bigint();
    const { answers, accounts, parts } = answersOf(fr.facts);
    const view = M.viewOf({ facts: fr.facts, answers, accounts });
    // the loop's hold = the facts' own lookup (a sweep's wait is the sessions route's, not this answer's) + every part
    const total = ms(t0) + (fr.ms || 0);
    if (total > BUDGET_MS) log(`[may-use] ${key}: the answer held the loop ${total.toFixed(1)} ms (budget ${BUDGET_MS}) — ${Object.entries(parts).map(([k, v]) => `${k} ${v.ms.toFixed(1)}`).join(', ')}`);
    return { ok: true, view, ms: { total, facts: fr.ms == null ? null : Math.round(fr.ms * 10) / 10, swept: fr.swept, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v.ms * 10) / 10])) } };
  }
  function mount(app, { personVerdict }) {
    app.get('/api/may-use', async (req, res) => {
      const pv = personVerdict(req);
      if (!pv.ok) return res.status(403).json({ ok: false, code: pv.code, error: pv.code === 'human_only' ? 'only a person reads what a conversation may use — an agent lists what it may use with its own tools' : 'this answers this instance\'s own page only' });
      try {
        const r = await viewFor(str(req.query && req.query.key), { webuiId: str(req.query && req.query.webuiId) });
        if (!r.ok) return res.status(r.code === 'not_found' ? 404 : r.code === 'list_paused' ? 409 : 400).json(r);
        res.json(r);
      } catch (e) { log(`[may-use] failed: ${e && e.message}`); res.status(500).json({ ok: false, code: 'failed', error: 'what it may use could not be read — try again' }); }
    });
  }
  return { factsOf, answersOf, viewFor, mount };
}

module.exports = { create, BUDGET_MS };
