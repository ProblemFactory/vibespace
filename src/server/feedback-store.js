'use strict';
// AGENT FEEDBACK — THE STORE (lane agent-feedback; the model is src/feedback-model.js). data/feedback.json holds the ring
// ({ v, records, dropped, syncVersion }), written whole through writeJsonAtomic (tmp + rename) BEFORE the route answers —
// a report the agent was told "sent" survives any crash. Every change is mirrored into the `feedback` StateSync store
// (key = record id, value = the public row) so every open client redraws live (the multi-client law); the mirror is
// SERVER-OWNED: a client's state-set into it is refused (src/ws-handler.js reads `clientWrites`), its version is persisted
// here so it only ever grows across restarts (a client never sees a rollback). flush() writes a change a failed write left
// behind — server.js's shutdown / crash belts call it through the mirror like every SyncStore. ORCH tier.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const M = require('../feedback-model.js');
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

function create({ dataDir, wss = { clients: new Set() }, now = () => Date.now(), log = () => { } }) {
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
    return { ok: true, report: M.publicRow(f.record), duplicate: f.duplicate, chars: M.chars(v.value.text) };
  };
  /** the owner's open / handled — THE one call (the owner's PATCH and the maintainer's feedback.handled); `version` /
   *  `note`: the release that shipped the fix and a line about it (lane feedback-handled-verb) */
  api.setStatus = (id, status, { by = 'owner', version = null, note = null } = {}) => {
    const i = state.records.findIndex((r) => r.id === id);
    if (i < 0) return { ok: false, code: 'not_found', error: `no report ${String(id).slice(0, 40)}` };
    const s = M.setStatus(state.records[i], status, { by, now: now(), version, note });
    if (!s.ok) return s;
    state.records[i] = s.record;
    sync.set(id, M.publicRow(s.record));
    if (!save()) return { ok: false, code: 'write_failed', error: 'the change could not be written on the server — try again in a minute' };
    return { ok: true, report: M.publicRow(s.record) };
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
  });
  return {
    'feedback.handled': (args, { caller }) => {
      const r = store.setStatus(args.id, 'handled', { by: caller.name || caller.sessionKey || caller.conversationId, version: args.version, note: args.note });
      return r.ok ? { ok: true, id: r.report.id, status: r.report.status, version: r.report.handledVersion, by: r.report.handledBy } : { ok: false, code: r.code, why: r.error };
    },
    'feedback.list': () => {
      const open = store.list().reports.filter((r) => r.status !== 'handled');
      return { ok: true, open: open.length, reports: open.map(agentRow) };
    },
  };
}

module.exports = { create, automationVerbs };
