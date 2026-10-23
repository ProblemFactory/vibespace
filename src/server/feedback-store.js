'use strict';
// AGENT FEEDBACK — THE STORE (lane agent-feedback; the model is src/feedback-model.js). data/feedback.json holds the ring
// ({ v, records, dropped, syncVersion }), written whole through writeJsonAtomic (tmp + rename) BEFORE the route answers —
// a report the agent was told "sent" survives any crash. Every change is mirrored into the `feedback` StateSync store
// (key = record id, value = the public row) so every open client redraws live (the multi-client law); the mirror is
// SERVER-OWNED: a client's state-set into it is refused (src/ws-handler.js reads `clientWrites`), its version is persisted
// here so it only ever grows across restarts (a client never sees a rollback). flush() writes a change a failed write left
// behind — server.js's shutdown / crash belts call it through the mirror like every SyncStore. ORCH tier.
// THE FORWARD (lane feedback-forward; the rules src/feedback-forward-model.js): a NEW report (never a repeat's count bump)
// is handed to `onNew` once written — the origin's forwarder queues it for the maintainer hub (src/server/feedback-forward.js).
// On the hub, `receive` keeps a FORWARDED report beside the own ones with `origin {instance, id, version, key}` (key = the
// origin key's hash): its words are PEER text — another instance's agent wrote them — so they are stored through the belt
// (src/peer-text.js); the same origin's same report again is the record already made. A status change on a forwarded
// report stamps `markedAt` (strictly increasing) and `marks` answers that origin — and only it — the marks since its
// cursor; on the origin, `applyMarks` applies them to its OWN reports (the hub's note / name through the belt).
// THE ONE WHO FILED IT IS TOLD (lane fleet-feedback-marks): a status change that names a release — setStatus (the hub's
// feedback.handled, an instance's maintainer key) or an applied mark-back — hands `tell(notice, row)` the PURE
// handledNotice (its note belted: another agent's words); the wiring queues it for the filing conversation's next turn.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const M = require('../feedback-model.js');
const FF = require('../feedback-forward-model.js');   // lane feedback-forward: the forward's rules (PURE)
const PT = require('../peer-text.js');   // the belt: another agent's words toward an agent (feedback.list)
const { SyncStore } = require('../sync-store.js');

function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

/** The server-owned mirror: no file of its own (the store persists), refuses client writes, flushes its owner. */
class FeedbackSync extends SyncStore {
  constructor(wss, owner) { super('feedback', null, wss, { clientWrites: false }); this.owner = owner; }
  flush() { this.owner.flush(); }
}

function create({ dataDir, wss = { clients: new Set() }, now = () => Date.now(), log = () => { }, onNew = null, tell = null }) {
  const file = path.join(dataDir, 'feedback.json');
  let state = { v: 1, records: [], dropped: 0, syncVersion: 0 };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (raw && Array.isArray(raw.records)) state = { v: 1, records: raw.records.filter((r) => r && typeof r.id === 'string'), dropped: Number(raw.dropped) || 0, syncVersion: Number(raw.syncVersion) || 0 };
  } catch { /* none yet (ENOENT) or unreadable: an empty ring — the next report writes a whole file */ }
  let dirty = false;
  const lastPost = new Map();   // session id → the instant of its last accepted report (pacing; memory only)
  const api = {};
  const sync = new FeedbackSync(wss, api);
  sync.version = state.syncVersion;
  for (const r of state.records) sync.data[r.id] = M.publicRow(r);
  let lastMark = state.records.reduce((m, r) => Math.max(m, Number(r.markedAt) || 0), 0);
  const nextMark = () => (lastMark = Math.max(now(), lastMark + 1));   // strictly increasing: the origin's cursor never skips a tie
  const belt = (s, max, kind = 'line') => (s == null || s === '' ? null : PT.toAgentText(s, { kind, max }));
  /** lane fleet-feedback-marks: a mark naming a release → the filer's notice (never throws into the mark) */
  const told = (rec) => {
    const n = tell ? M.handledNotice(rec) : null;
    if (!n) return;
    try { tell({ ...n, note: belt(n.note, 2 * M.LIMITS.noteMax) }, M.publicRow(rec)); } catch (e) { log('[feedback] the filer of', rec.id, 'was not told:', e.message); }
  };

  const save = () => {
    state.syncVersion = sync.version;
    try { writeJsonAtomic(file, state); dirty = false; return true; }
    catch (e) { dirty = true; log('[feedback] data/feedback.json not written:', e.message); return false; }
  };
  const mintId = () => {
    for (;;) { const id = 'fb-' + crypto.randomBytes(5).toString('hex'); if (!state.records.some((r) => r.id === id)) return id; }
  };

  /** an agent's report. caller = the ROUTE's facts: { session: {id, name}, group, harness, instance } */
  api.report = (body, caller) => {
    const v = M.validate(body);
    if (!v.ok) return v;
    const sid = caller && caller.session && caller.session.id;
    const at = now();
    const paced = M.paceVerdict(sid ? lastPost.get(sid) : 0, at);
    if (paced) return { ok: false, ...paced };
    const rec = M.makeRecord(v.value, caller, { id: mintId(), now: at });
    const f = M.fold(state.records, rec, at);
    state.records = f.list;
    state.dropped += f.dropped.length;
    for (const id of f.dropped) sync.delete(id);
    sync.set(f.record.id, M.publicRow(f.record));
    if (!save()) return { ok: false, code: 'write_failed', error: 'the report could not be written on the server — try again in a minute' };
    if (sid) lastPost.set(sid, at);
    if (!f.duplicate && onNew) { try { onNew(M.publicRow(f.record)); } catch (e) { log('[feedback] the forward did not take report', f.record.id, e.message); } }
    return { ok: true, report: M.publicRow(f.record), duplicate: f.duplicate, chars: M.chars(v.value.text) };
  };
  /** the owner's open / handled — THE one call (the owner's PATCH and the maintainer's feedback.handled); `version` /
   *  `note`: the release that shipped the fix and a line about it (lane feedback-handled-verb) */
  api.setStatus = (id, status, { by = 'owner', version = null, note = null } = {}) => {
    const i = state.records.findIndex((r) => r.id === id);
    if (i < 0) return { ok: false, code: 'not_found', error: `no report ${String(id).slice(0, 40)}` };
    const s = M.setStatus(state.records[i], status, { by, now: now(), version, note });
    if (!s.ok) return s;
    if (s.record.origin) s.record.markedAt = nextMark();   // lane feedback-forward: the mark goes back when its origin next asks
    state.records[i] = s.record;
    sync.set(id, M.publicRow(s.record));
    if (!save()) return { ok: false, code: 'write_failed', error: 'the change could not be written on the server — try again in a minute' };
    told(s.record);
    return { ok: true, report: M.publicRow(s.record) };
  };
  /** THE HUB: a report another instance FORWARDED (POST /api/feedback/forward; `key` = its origin key's hash) → the record */
  api.receive = (body, { key } = {}) => {
    if (!FF.KEY_ID_RE.test(String(key || ''))) return { ok: false, code: 'origin_key_bad', error: 'the origin key is missing' };
    const at = now();
    const v = FF.validateForward(body, at);
    if (!v.ok) return v;
    const had = state.records.find((r) => r.origin && r.origin.key === key && r.origin.id === v.value.origin.id);
    if (had) return { ok: true, duplicate: true, report: M.publicRow(had) };
    // THE BELT: another instance's agent wrote these words (and its server named the rest) — peer text, stored inert
    const f = v.value.facts, N = 2 * M.LIMITS.name;
    const value = { text: belt(v.value.text, 2 * M.LIMITS.textMax, 'block'), about: belt(v.value.about, 2 * M.LIMITS.aboutMax) || '', kind: v.value.kind };
    const facts = { session: { id: f.session.id, name: belt(f.session.name, N) }, group: f.group ? { id: f.group.id, name: belt(f.group.name, N) } : null, harness: f.harness, instance: { name: belt(f.instance.name, N), version: f.instance.version } };
    const made = M.makeRecord(value, facts, { id: mintId(), now: at });
    const rec = { ...made, at: v.value.at, lastAt: at, count: v.value.count, reporters: [], origin: { instance: made.instance.name, id: v.value.origin.id, version: v.value.origin.version, key }, markedAt: null };
    const a = FF.admit(state.records, rec);
    state.records = a.list;
    state.dropped += a.dropped.length;
    for (const id of a.dropped) sync.delete(id);
    sync.set(rec.id, M.publicRow(rec));
    if (!save()) return { ok: false, code: 'write_failed', error: 'the report could not be written on the hub — the origin tries again' };
    return { ok: true, duplicate: false, report: M.publicRow(rec) };
  };
  /** THE HUB: the marks ONE origin may read — its own forwarded reports, marked after `since` */
  api.marks = (key, since) => FF.marksAnswer(state.records, key, since);
  /** THE ORIGIN: the maintainer's marks (src/server/feedback-forward.js's pull), each applied to the OWN report it names */
  api.applyMarks = (marks) => {
    let applied = 0;
    const done = [];
    for (const m of Array.isArray(marks) ? marks : []) {
      if (!m || typeof m !== 'object' || typeof m.id !== 'string') continue;
      const i = state.records.findIndex((r) => r.id === m.id && !r.origin);
      if (i < 0) continue;
      const a = FF.applyMark(state.records[i], { status: m.status, version: m.version, note: belt(m.note, 2 * M.LIMITS.noteMax), by: belt(m.by, 2 * M.LIMITS.name) }, now());
      if (!a.ok || !a.changed) continue;
      state.records[i] = a.record;
      sync.set(m.id, M.publicRow(a.record));
      applied++;
      done.push(a.record);
    }
    if (applied && !save()) return { ok: false, applied };
    for (const rec of done) told(rec);   // lane fleet-feedback-marks: the mark-back tells the filer, once written
    return { ok: true, applied };
  };
  /** every report, newest first, as the owner reads them */
  api.list = () => ({ reports: state.records.slice().sort(M.byNewest).map(M.publicRow), open: M.openCount(state.records), dropped: state.dropped });
  /** one session's own reports (ids: its conversation id and / or its live session id) */
  api.mine = (ids) => state.records.filter((r) => M.isMine(r, ids)).sort(M.byNewest).map(M.publicRow);
  api.flush = () => { if (dirty) save(); };
  api.sync = sync;
  api.file = file;
  return api;
}

/**
 * THE AUTOMATION VERBS (lane feedback-handled-verb — the owner 2026-10-20: 「你处理过的 agent 反馈你怎么不进行标记呢？」;
 * src/server/automation-engine.js `verbs`). The maintainer conversation ships the fixes but had no door to mark the reports:
 * a conversation the owner GRANTED a key holding these verbs now has one. The grant, the first-use card, the vault and the
 * audit are the engine's — nothing here judges who may call.
 *   feedback.handled  the OWNER's own act through THE SAME store call PATCH /api/feedback/:id makes (`store.setStatus`):
 *                     the release that shipped the fix and the note stamped, `by` = the calling conversation's name — the
 *                     sheet says «handled in 2.369.NNN by <name>»; the StateSync mirror and data/feedback.json follow as
 *                     for the owner's click
 *   feedback.list     the OPEN reports with their ids. Their words are OTHER agents' (a report, its about, the reporting
 *                     conversation's and its Task Group's names), so every piece leaves through the belt (src/peer-text.js:
 *                     the text a block, the rest pieces) — the reporters list never leaves (publicRow drops it)
 */
function automationVerbs({ store }) {
  const piece = (v, max) => (v == null || v === '' ? null : PT.toAgentText(v, { kind: 'line', max }));
  // the bounds in UTF-16 units: a stored field is ≤ its LIMITS in characters (a character may be two units)
  const agentRow = (r) => ({
    id: r.id, at: r.at, lastAt: r.lastAt, kind: r.kind, count: r.count, harness: r.harness,
    about: piece(r.about, 2 * M.LIMITS.aboutMax) || '', text: PT.toAgentText(r.text, { kind: 'block', max: 2 * M.LIMITS.textMax }),
    session: { id: r.session.id, name: piece(r.session.name, 2 * M.LIMITS.name) },
    group: r.group ? { id: r.group.id, name: piece(r.group.name, 2 * M.LIMITS.name) } : null,
    instance: { name: piece(r.instance.name, 2 * M.LIMITS.name), version: piece(r.instance.version, 2 * M.LIMITS.name) },
    origin: r.origin ? piece(r.origin.instance, 2 * M.LIMITS.name) : null,   // lane feedback-forward: forwarded from that instance
  });
  return {
    'feedback.handled': (args, { caller }) => {
      // lane fleet-feedback-marks: the maintainer key (no conversation) marks as THE MAINTAINERS — the sheet words it
      const r = store.setStatus(args.id, 'handled', { by: caller.maintainer ? M.MAINTAINER_BY : caller.name || caller.sessionKey || caller.conversationId, version: args.version, note: args.note });
      // lane feedback-forward: a FORWARDED report's mark goes back to its origin on that instance's next pull (≤ 6 h)
      return r.ok ? { ok: true, id: r.report.id, status: r.report.status, version: r.report.handledVersion, by: r.report.handledBy, ...(r.report.origin ? { markBack: piece(r.report.origin.instance, 2 * M.LIMITS.name) } : {}) } : { ok: false, code: r.code, why: r.error };
    },
    'feedback.list': () => {
      const open = store.list().reports.filter((r) => r.status !== 'handled');
      return { ok: true, open: open.length, reports: open.map(agentRow) };
    },
  };
}

module.exports = { create, automationVerbs };
