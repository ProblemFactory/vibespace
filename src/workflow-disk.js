'use strict';
// PURE (imports nothing; CJS so the server, the bundle and node tests share it):
// THE RUN DIR IS THE TRUTH WHEN THE STREAM IS GONE (2026-09-26, owner: a
// workflow window titled with its run name, chip 运行中, "11 个 agent · 10
// 完成 · 运行中…", eleven rows reading "(agent)" under one phase whose title
// claimed that labels only appear when the run finishes — for a run whose
// newest file was two days old).
//
// A dynamic-workflow run leaves, beside its agents' transcripts, two kinds of
// file this module reads (MEASURED over 495 local run dirs, CLI 2.1.201 → 2.1.281):
//   • `journal.jsonl` — `launched` {type} (≥ 2.1.267), `started`
//     {type, key, agentId, label, phase} (label + phase since 2.1.267; before:
//     {type, key, agentId} only), `result` {type, key, agentId, result},
//     `failed` {type, key, agentId} (never beside a result for the same agent;
//     the terminal snapshot calls those agents `error`);
//   • `agent-<id>.meta.json` — {agentType, spawnDepth, …} always, plus
//     {description = the label, workflowPhase = the phase title,
//     requestShape, requestNonInteractive} since 2.1.267 and `model` on many
//     agents (since 2.1.226 on some).
// The journal's first-seen phase order matched the terminal snapshot's phase
// index order in 136 of 137 labelled runs; the journal's phase string equalled
// the snapshot's phaseTitle for 692 of 692 agents.
//
// So the labels and the phases were ON DISK the whole time and the old
// skeleton (routes/sessions.js liveWorkflowFromParts) wrote `label: ''`, one
// phase titled with a sentence that was never true for this CLI, and
// `status: 'running'` unconditionally — a run that stalled two days ago read
// as running forever. parseRunDir builds the same view shape /api/workflow
// returns, with the labels/phases/model from the journal + meta files and a
// LIVENESS verdict from the run's own mtimes:
//   running — a FRESH live stream tree exists (this server holds the launching
//             session's task_progress tree and its newest record is younger
//             than STALL_MS — treeAlive), or the newest file of the run is
//             younger than STALL_MS; `unknown` mtimes (a host whose stat
//             answered nothing, or no host clock) keep "running" — no evidence
//             either way;
//   stalled — no FRESH live tree, no terminal snapshot, and no file written for
//             STALL_MS: `{lastActivityAt, unfinished}` names what never
//             finished. A stalled run is NEVER "running".
// The terminal snapshot (`workflows/wf_<runId>.json`) is not read here — a
// snapshot present is the route's terminal path, unchanged; `snapshotPresent`
// only reaches parseRunDir when the run is going again after it (a resume
// under the same runId) and marks the view `resumed`.

/** No file of the run written for this long (and no fresh live tree, and no
 *  terminal snapshot) ⇒ the run is stalled. Ten minutes: a single long tool
 *  call inside an agent writes nothing to its transcript until it returns. */
const STALL_MS = 10 * 60 * 1000;

// Journal retry chains (2.181.1, real confusion report): the harness
// re-spawns an agent whose API stream aborted — SAME journal `key`, NEW
// agentId. Every non-newest attempt of a key without its own result is a
// DEAD superseded attempt (its transcript dead-ends in "[Request
// interrupted by user]") — label it instead of showing a bare interrupt.
// MOVED VERBATIM from routes/sessions.js (2026-09-26); `failed` and `info`
// are ADDITIVE — they never change started / done / superseded.
function journalAttemptsFromText(text) {
  const started = new Set(), done = new Set();
  const keyOf = new Map(), lastAttempt = new Map();
  const failed = new Set(), info = new Map();
  for (const line of String(text || '').split('\n')) {
    const t = line.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch { continue; }
    if (!o || !o.agentId) continue;
    if (o.type === 'started') {
      started.add(o.agentId);
      if (o.key) { keyOf.set(o.agentId, o.key); lastAttempt.set(o.key, o.agentId); }
      if (!info.has(o.agentId)) info.set(o.agentId, { label: typeof o.label === 'string' ? o.label : null, phase: typeof o.phase === 'string' ? o.phase : null });
    } else if (o.type === 'result') done.add(o.agentId);
    else if (o.type === 'failed') failed.add(o.agentId);
  }
  const superseded = new Set();
  for (const [id, k] of keyOf) { if (!done.has(id) && lastAttempt.get(k) !== id) superseded.add(id); }
  return { started, done, superseded, failed, info };
}

const AGENT_FILE_RE = /^agent-([0-9a-f]+)\.jsonl$/;
const AGENT_ID_RE = /^[0-9a-f]+$/;
const str = (v) => (typeof v === 'string' ? v : null);

/**
 * The disk view of a run with no terminal snapshot (or one being resumed).
 * @param {object} p
 * @param {string} [p.runId]
 * @param {string[]|string} [p.journalLines]  journal.jsonl as lines (or its text)
 * @param {Object<string, object>} [p.metas]  agentId → parsed agent-<id>.meta.json
 * @param {string[]} [p.agentFiles]          the run dir's file names
 * @param {string} [p.scriptName]            `<name>-<runId>.js` from workflows/scripts (the run's name)
 * @param {boolean} [p.snapshotPresent]      a terminal snapshot exists but the run is going again ⇒ `resumed`
 * @param {number} [p.newestMtime]           ms — the newest mtime of any file in the run dir (0 = unknown)
 * @param {number} [p.now]                   ms — the clock the mtimes were read against (the host's own for a remote run)
 * @param {boolean} [p.liveTree]             this server holds the run's live task_progress tree
 * @returns {object} the /api/workflow live view
 */
function parseRunDir({ runId = '', journalLines = [], metas = {}, agentFiles = [], scriptName = '', snapshotPresent = false, newestMtime = 0, now = 0, liveTree = false } = {}) {
  const text = Array.isArray(journalLines) ? journalLines.join('\n') : String(journalLines || '');
  const { started, done, superseded, failed, info } = journalAttemptsFromText(text);
  const metaOf = (id) => {
    const m = metas && typeof metas === 'object' && Object.prototype.hasOwnProperty.call(metas, id) ? metas[id] : null;
    return m && typeof m === 'object' ? m : null;
  };
  const files = new Set();
  for (const f of agentFiles || []) { const m = String(f).match(AGENT_FILE_RE); if (m) files.add(m[1]); }
  // first-seen order = spawn order: the journal's started lines, then a
  // transcript the journal has not named yet (a transcript can exist before
  // its started line lands), then an agent known only by its meta file
  const ids = [], seen = new Set();
  const add = (id) => { if (!seen.has(id)) { seen.add(id); ids.push(id); } };
  for (const id of started) add(id);
  for (const id of [...files].sort()) add(id);
  for (const id of Object.keys(metas && typeof metas === 'object' ? metas : {}).sort()) if (AGENT_ID_RE.test(id)) add(id);

  const agents = ids.map((id, i) => {
    const j = info.get(id) || {};
    const m = metaOf(id) || {};
    return {
      index: i,
      label: str(j.label) ?? str(m.description) ?? '',
      model: str(m.model) || '',
      // the journal's arithmetic (done / superseded / progress) exactly as before;
      // a `failed` record (additive) marks an agent that ended without a result
      state: done.has(id) ? 'done' : (superseded.has(id) ? 'superseded' : (failed.has(id) ? 'error' : 'progress')),
      agentId: id,
      phaseTitle: str(j.phase) ?? str(m.workflowPhase) ?? '',
      onDisk: files.has(id),
    };
  });

  // phases in first-seen order; an agent with no phase goes under ONE final
  // untitled phase — "Other" beside named phases, "Agents" when the run's
  // files name no phase at all (a CLI before 2.1.267)
  const phases = [], byTitle = new Map(), loose = [];
  for (const a of agents) {
    if (!a.phaseTitle) { loose.push(a); continue; }
    let p = byTitle.get(a.phaseTitle);
    if (!p) { p = { index: phases.length, title: a.phaseTitle, agents: [] }; byTitle.set(a.phaseTitle, p); phases.push(p); }
    p.agents.push(a);
  }
  if (loose.length) phases.push({ index: phases.length, title: phases.length ? 'Other' : 'Agents', untitled: true, agents: loose });

  // LIVENESS — a run with no result and no recent write is stalled, never running
  const known = Number.isFinite(newestMtime) && newestMtime > 0 && Number.isFinite(now) && now > 0;
  let status = 'running', liveness;
  if (liveTree) liveness = 'tree';
  else if (!known) liveness = 'unknown';
  else if (now - newestMtime < STALL_MS) liveness = 'recent';
  else { status = 'stalled'; liveness = 'stalled'; }
  const unfinished = agents.filter((a) => a.state === 'progress').map((a) => a.label || a.agentId);

  const suffix = `-${runId}.js`;
  const workflowName = scriptName && runId && scriptName.endsWith(suffix) ? scriptName.slice(0, -suffix.length) : 'Workflow';
  return {
    runId, workflowName, summary: '', status, live: true, liveness,
    ...(snapshotPresent ? { resumed: true } : {}),
    agentCount: agents.length, doneCount: agents.filter((a) => a.state === 'done').length,
    durationMs: 0, totalTokens: 0, totalToolCalls: 0,
    error: null, result: null, timestamp: null,
    // only a STALLED view carries a time — a running one must not change its
    // digest on every write (the window re-renders only on a changed run)
    stall: status === 'stalled' ? { lastActivityAt: newestMtime, unfinished } : null,
    phases,
  };
}

/**
 * Does the launching session's stream tree prove the run alive RIGHT NOW?
 * (lane Q verify, 2026-09-26) — the `liveTree` input of parseRunDir.
 *   • the tree exists and the stream has not CLOSED the task: status running, or
 *     `finished` by the level set (`closedBy:'level'` — a GUESS by the
 *     normalizer's own comment; only a task_updated / a notification / a
 *     completion is the harness's verdict);
 *   • and the task's newest record is FRESH: `aliveAt` (message-manager: now on
 *     the live stream, the record's own arrival on a post-restart replay, absent
 *     for a history conversion) younger than STALL_MS. A tree holds no clock of
 *     its own — without this, the persisted records replayed after every restart
 *     re-proved a run that stalled days ago "running" for as long as they sat in
 *     the 40-task ring.
 * Trade-off (named in kb-file-structure.md): a run whose agents AND tree are
 * both quiet for STALL_MS (one long tool call, no heartbeat) reads Stalled until
 * its next record or file write — the files' own rule, and self-healing.
 * @param {{status?:string, closedBy?:string, workflow?:object, aliveAt?:number}|null} ti  the normalizer's taskInfo for the run
 * @param {number} now  ms, the SAME clock that stamped aliveAt (this server's)
 */
function treeAlive(ti, now) {
  if (!ti || typeof ti !== 'object' || !ti.workflow) return false;
  const open = !ti.status || ti.status === 'running' || (ti.status === 'finished' && ti.closedBy === 'level');
  const at = Number(ti.aliveAt);
  return open && Number.isFinite(at) && at > 0 && Number.isFinite(now) && now - at < STALL_MS;
}

/**
 * Which note (and rail) a live view carries in the View Workflow window —
 * THE STALL FIRST (lane Q verify, 2026-09-26): a stalled view can still carry a
 * merged stream tree (the launching session holds one the stream closed, or one
 * too old to prove anything) and its sentence must agree with the Stalled chip.
 * @param {{live?:boolean, status?:string, liveTree?:boolean}|null} view  a /api/workflow view
 * @returns {'stalled'|'tree'|'files'|null}  null for a terminal (snapshot) view
 */
function liveNoteKind(view) {
  if (!view || !view.live) return null;
  if (view.status === 'stalled') return 'stalled';
  return view.liveTree ? 'tree' : 'files';
}

/** "just now" / "12 min ago" / "3 h ago" / "2 d ago" in the device's words (`t` injected). */
function agoWords(ms, t) {
  const m = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
  if (m < 1) return t('just now');
  if (m < 60) return t('{n} min ago', { n: m });
  if (m < 1440) return t('{n} h ago', { n: Math.round(m / 60) });
  return t('{n} d ago', { n: Math.round(m / 1440) });
}

/**
 * THE words of a stalled run — the window's chip + meta line AND the chat
 * card's chip read this ONE function, so the two surfaces cannot disagree.
 * @param {{status?:string, stall?:{lastActivityAt?:number, unfinished?:string[]}|null}|null} view  a /api/workflow view (or the card's verdict)
 * @param {{t:Function, now:number}} ctx
 * @returns {{label:string, detail:string, unfinished:string[]}|null}  null unless the view is stalled
 */
function stallWords(view, { t, now } = {}) {
  if (!view || view.status !== 'stalled' || typeof t !== 'function') return null;
  const st = view.stall || {};
  const unfinished = Array.isArray(st.unfinished) ? st.unfinished : [];
  const n = unfinished.length;
  const ago = Number.isFinite(st.lastActivityAt) && st.lastActivityAt > 0 && Number.isFinite(now) ? agoWords(now - st.lastActivityAt, t) : '';
  const detail = ago
    ? (n ? t('Last activity {ago}; {n} unfinished agent(s)', { ago, n }) : t('Last activity {ago}', { ago }))
    : (n ? t('{n} unfinished agent(s)', { n }) : '');
  return { label: t('Stalled'), detail, unfinished };
}

module.exports = { STALL_MS, journalAttemptsFromText, parseRunDir, treeAlive, liveNoteKind, agoWords, stallWords };
