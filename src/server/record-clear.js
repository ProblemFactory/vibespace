'use strict';
/**
 * THE CLEAR (ORCH, 2026-09-28 — the owner's "Clear content…"). ONE entry point
 * every caller goes through — the owner's two routes (src/routes/records-clear.js)
 * and the agent's own verbs (agent-routes: `vibespace-task progress-redact`,
 * `vibespace-ask clear`) — so the rule (PURE src/record-clear.js clearVerdict)
 * is asked of EVERY record right before its store's door, the journal line is
 * written once per store call, and a cascade (a cleared job's For-you items)
 * has one home.
 *
 *   clearMany(items, {caller}) — items = [{kind, id, groupId?, sessionKey?}]
 *     activity       groupId + id (a P- id or the entry's ms `at`)
 *     todo           id (ut-…)
 *     status         sessionKey + id (the history entry's ms `at`)
 *     job            id (jb-…) — a cron parent takes its runs; then the job's For-you items
 *     group-message  groupId + id (the record's vendorId)
 *   → {ok, cleared, already, unknown:[{kind, id}], refused:[{kind, id, code, why, status}], ambiguous:[…], archiveUnread?: true (B-20b6)}
 *
 * Items are grouped by STORE CONTAINER (one Task Group, one session key, one
 * agent group, all todos, all jobs) so a batch is ONE atomic write and ONE
 * broadcast per container, never one per record (the resolve-many rule).
 *
 * THE JOURNAL (the audit): one console line per container call —
 *   `[clear] <kind> <container> — <n> cleared by <owner|session key>: <ids>`
 * ids and counts only, never a word of what was cleared (the line is the
 * receipt that a clear happened; repeating the words would re-publish them
 * into journalctl / the opslog files). A group message also gets a row in the
 * channels audit log (groups-engine). Telemetry is not told.
 */
const RC = require('../record-clear.js');

const MAX_ITEMS = RC.MAX_ITEMS; // ONE number: the PURE module's (a client chunks a bigger batch by it)

function create({ tasks = null, userTodos = null, sessionStatus = null, getJobs = () => null, getGroups = () => null, getChannels = () => null, log = (...a) => console.log(...a), now = () => Date.now() } = {}) {
  const byOf = (caller) => (caller && caller.role === 'owner' ? 'owner' : String((caller && caller.by) || 'agent'));
  const journal = (kind, container, ids, by) => {
    if (!ids.length) return;
    const shown = ids.slice(0, 20).join(', ') + (ids.length > 20 ? ` +${ids.length - 20} more` : '');
    try { log(`[clear] ${kind}${container ? ' ' + container : ''} — ${ids.length} cleared by ${by}: ${shown}`); } catch { }
  };
  const verdictFor = (kind, caller, key = null) => (record) => RC.clearVerdict({ kind, caller, record, key });

  /** Validate the request shape: [{kind, id, …}] (1..200). → null | a refusal. */
  function badShape(items) {
    if (!Array.isArray(items) || !items.length || !items.every((x) => x && typeof x === 'object' && typeof x.kind === 'string' && (typeof x.id === 'string' || Number.isFinite(x.id)) && String(x.id))) return RC.refuse('bad_items');
    if (items.length > MAX_ITEMS) return RC.refuse('too_many');
    return null;
  }

  /** THE CLEAR'S ANSWER WAITS FOR ITS STORES' FILES (lane lg-store-writes U4/U5, the cure): the stores a clear changed whose
   *  writes go through the store writer (the Task Groups', the jobs') — ONE wait for all of them at the end (never one per
   *  container, one after another: K groups cost K writes), on the writer's SYNCHRONOUS road: `answer(res)` runs inside the
   *  writer's settle, so a clear still waiting when the hub stops answers inside the exit's flush (server.js leaves in that
   *  run). A store not on disk inside its bound is SAID (logged, `notOnDisk` in the answer); the clear stays applied in memory. */
  function whenStored(touched, done) {
    const stores = [...touched].map((name) => [name, name === 'tasks' ? tasks : name === 'jobs' ? (getJobs && getJobs()) : null]).filter(([, st]) => st && typeof st.persisted === 'function');
    if (!stores.length) { done(true); return; }
    let n = stores.length; const left = [];
    for (const [name, st] of stores) {
      st.persisted((ok) => {
        if (!ok) left.push(name === 'tasks' ? 'the Task Groups\' store' : 'the jobs store');
        if (--n) return;
        if (left.length) log(`[clear] cleared in memory, ${left.join(' and ')} not on disk yet — the store writer retries`);
        done(!left.length);
      }, name === 'jobs' && touched.archiveSeq ? { archiveSeq: touched.archiveSeq } : undefined);   // B-0248 step 3: and the archive this clear wrote
    }
  }
  /** → a promise of the result; `answer(result)` (a route's) is called once, on the writer's synchronous road (whenStored) */
  async function clearMany(items, { caller, answer = null } = {}) {
    let res, touched;
    try { ({ res, touched } = await clearAll(items, { caller })); }
    catch (e) { if (answer) { try { answer({ ok: false, code: 'failed', why: e && e.message, status: 500 }); } catch { } } throw e; }
    return new Promise((resolve) => whenStored(touched, (saved) => {
      if (!saved && res.ok) res.notOnDisk = true;
      resolve(res);
      if (answer) { try { answer(res); } catch { } }
    }));
  }
  async function clearAll(items, { caller } = {}) {
    const touched = new Set();
    const bad = badShape(items);
    if (bad) return { res: bad, touched };
    // the caller is judged BEFORE any lookup (a job token never learns whether an id exists)
    const pre = RC.clearVerdict({ kind: 'activity', caller, record: {} });
    if (!pre.ok && (pre.code === 'no_caller' || pre.code === 'job_token')) return { res: pre, touched };
    const res = { ok: true, cleared: 0, already: 0, unknown: [], refused: [], ambiguous: [], ids: [] };
    const by = byOf(caller);
    const at = now();
    // group by container, keeping each item's kind
    const groups = new Map();
    for (const it of items) {
      if (!RC.RECORD_KINDS.includes(it.kind)) { res.refused.push({ kind: it.kind, id: String(it.id), ...pick(RC.refuse('bad_kind')) }); continue; }
      const container = it.kind === 'activity' || it.kind === 'group-message' ? String(it.groupId || '') : it.kind === 'status' ? String(it.sessionKey || '') : it.kind === 'channel-webhook' ? String(it.path || '') : '';
      const k = it.kind + '\u0000' + container;
      if (!groups.has(k)) groups.set(k, { kind: it.kind, container, ids: [] });
      groups.get(k).ids.push(String(it.id));
    }
    for (const { kind, container, ids } of groups.values()) {
      let r;
      try { r = await clearOne(kind, container, ids, { caller, by, at }); }
      catch (e) { log(`[clear] ${kind}${container ? ' ' + container : ''} — FAILED: ${e && e.message}`); r = { error: e && e.code === 'EVSARCHIVEBUSY' ? { ...RC.refuse('unavailable'), code: 'EVSARCHIVEBUSY', why: String(e.message) } : e && e.code === 'TASK_GROUPS_UNREAD' ? { ...RC.refuse('unavailable'), code: 'TASK_GROUPS_UNREAD', why: String(e.message) } : RC.refuse('failed'), cleared: [], already: [], unknown: [], refused: [] }; }   // THE STORE HELD UNREAD (lane bl-windows): the hold's words, never «failed»
      if (r.error) { for (const id of ids) res.refused.push({ kind, id, ...pick(r.error) }); continue; }
      res.cleared += r.cleared.length;
      res.already += r.already.length;
      if (r.store) touched.add(r.store);   // the U4/U5 cure: a store whose file the answer waits for — once, at the end (whenStored)
      if (r.archiveSeq) { touched.archiveSeq = Math.max(touched.archiveSeq || 0, r.archiveSeq); delete r.archiveSeq; }   // B-0248 step 3: the jobs' archive write this clear made
      res.ids.push(...r.cleared.map((id) => ({ kind, id: String(id) })));
      for (const id of r.unknown) res.unknown.push({ kind, id: String(id) });
      if (r.archiveUnread) res.archiveUnread = true;   // B-20b6: the job store could not reach its ARCHIVED records — their words were not cleared; said to the person
      for (const x of r.ambiguous || []) res.ambiguous.push({ kind, id: String(x), ...pick(RC.refuse('ambiguous')) });
      for (const x of r.refused) res.refused.push({ kind, id: String(x.id ?? x.at ?? x.ref), code: x.code, why: x.why || (RC.REFUSALS[x.code] || {}).why || '', status: x.status || (RC.REFUSALS[x.code] || {}).status || 403 });
      journal(kind, container, r.cleared.map(String), by);
      if (r.cascade) {
        res.cleared += r.cascade.cleared.length;
        res.ids.push(...r.cascade.cleared.map((id) => ({ kind: 'todo', id })));
        journal('todo', `(of ${kind} ${ids.slice(0, 3).join(', ')})`, r.cascade.cleared, by);
      }
    }
    return { res, touched };
  }
  const pick = (v) => ({ code: v.code, why: v.why, status: v.status });

  async function clearOne(kind, container, ids, { caller, by, at }) {
    if (kind === 'activity') {
      if (!tasks) return { error: RC.refuse('unavailable') };
      if (!container) return { error: RC.refuse('bad_items') };
      let r;
      try { r = tasks.clearProgress(container, ids, { by, at, allow: verdictFor('activity', caller) }); }
      catch (e) { if (/not found/.test(e.message)) return { error: RC.refuse('not_found') }; throw e; }
      // lane lg-store-writes U5: the answer waits until the cleared words are gone from the FILE (the store writer's write — the
      // loop never waits) — ONCE for every store the clear touched (clearMany's whenStored, the U4/U5 cure)
      return { ...r, store: 'tasks' };
    }
    if (kind === 'todo') {
      if (!userTodos) return { error: RC.refuse('unavailable') };
      if (userTodos.isHeldUnread?.()) return { error: RC.refuse('todos_unread') };   // B-44f3: held — refused by name (nothing was cleared)
      return userTodos.clearItems(ids, { by, at, allow: verdictFor('todo', caller) });
    }
    if (kind === 'status') {
      if (!sessionStatus) return { error: RC.refuse('unavailable') };
      if (!container) return { error: RC.refuse('bad_items') };
      return sessionStatus.clearHistory(container, ids.map(Number), { by, at, allow: verdictFor('status', caller, container) });
    }
    if (kind === 'job') {
      const jm = getJobs && getJobs();
      if (!jm || !jm.ready) return { error: jm && typeof jm.lockHeldWords === 'function' && jm.lockHeldWords() ? { ...RC.refuse('unavailable'), why: jm.lockHeldWords() } : RC.refuse('unavailable') };   // B-f276 (s1126, r5017): the lock's hold by name
      // B-44f3 (the verdict's M4): the cascade below clears the job's For-you items — while For you is held unread its list is empty
      // because it is unread, so the job would be cleared and its items (with its name) back at the read: the WHOLE clear waits
      if (userTodos && userTodos.isHeldUnread?.()) return { error: RC.refuse('todos_unread') };
      const r = jm.clearJobs(ids, { by, at, allow: verdictFor('job', caller) });
      if (r.error) { log(`[clear] job ${ids.join(', ')} — FAILED: ${r.error}`); return { error: RC.refuse('failed') }; }
      r.store = 'jobs';   // lane lg-store-writes U4/U5: the cleared job's words gone from the FILE before the answer — ONCE, at the end (clearMany's whenStored)
      // THE CASCADE: a job's For-you items carry its name ("<name> needs your input", "· via <name>",
      // the job's name in their label) — cleared through the For-you door under the same caller
      if (r.cleared.length && userTodos) {
        const gone = new Set(r.cleared);
        const tIds = userTodos.idsWhere((i) => i.jobId && gone.has(i.jobId));
        if (tIds.length) r.cascade = userTodos.clearItems(tIds, { by, at, allow: caller && caller.role === 'owner' ? null : verdictFor('todo', caller) });
      }
      return r;
    }
    if (kind === 'group-message') {
      const ge = getGroups && getGroups();
      if (!ge || typeof ge.clearMessages !== 'function') return { error: RC.refuse('unavailable') };
      if (!container) return { error: RC.refuse('bad_items') };
      const who = caller && caller.role === 'agent' ? (caller.conversationId || caller.by) : 'user';
      const r = await ge.clearMessages({ group: container, ids, by: who, at, allow: verdictFor('group-message', caller) });
      if (!r.ok) return { error: RC.refuse(r.code === 'not-found' ? 'not_found' : 'failed') };
      return r;
    }
    if (kind === 'channel-webhook') {
      // lane webhook-l1-server: a webhook caller's call (data/channels/msgs/webhook/<path>.ndjson) — the store's rewrite door
      const ch = getChannels && getChannels();
      if (!ch || !ch.store || typeof ch.store.rewriteRecords !== 'function') return { error: RC.refuse('unavailable') };
      if (!container) return { error: RC.refuse('bad_items') };
      const allow = verdictFor('channel-webhook', caller);
      const out = { cleared: [], already: [], unknown: [], refused: [] };
      const r = ch.store.rewriteRecords('webhook', container, ids, (rec) => {
        const v = allow ? allow(rec) : { ok: true };
        if (!v || !v.ok) { out.refused.push({ id: String(rec.vendorId), code: (v && v.code) || 'not_yours', why: (v && v.why) || '', status: (v && v.status) || 403 }); return null; }
        if (rec.clearedAt) { out.already.push(String(rec.vendorId)); return null; }
        out.cleared.push(String(rec.vendorId));
        return RC.clearedRecord(rec, { kind, by, at });
      });
      out.unknown = r.unknown;
      return out;
    }
    return { error: RC.refuse('bad_kind') };
  }

  /** ONE record: the single-item answer (a refusal by its own status); `answer` as clearMany's (the same synchronous road) */
  async function clear(item, { caller, answer = null } = {}) {
    const one = (r) => {
      if (!r.ok) return r;
      if (r.refused.length) { const x = r.refused[0]; return { ok: false, code: x.code, why: x.why, status: x.status }; }
      if (r.ambiguous.length) return { ok: false, ...pick(RC.refuse('ambiguous')) };
      if (r.unknown.length) return { ok: false, ...pick(RC.refuse(r.archiveUnread ? 'archive_unread' : 'not_found')) };   // B-20b6's smalls (1): an id only in a held archive is the archive's refusal
      return { ok: true, cleared: r.cleared, already: r.already, ids: r.ids, ...(r.notOnDisk ? { notOnDisk: true } : {}), ...(r.archiveUnread ? { archiveUnread: true } : {}) };
    };
    return one(await clearMany([item], { caller, answer: answer ? (r) => answer(one(r)) : null }));
  }

  return { clear, clearMany, MAX_ITEMS };
}

module.exports = { create, MAX_ITEMS };
