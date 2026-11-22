'use strict';
// A FINISHED AGENT'S TRANSCRIPT, FOUND AND READ OFF THE HUB'S LOOP (lane lg-recovery, 主开发 r2350 / r2374 — B-299b's law: no
// byte of a harness transcript is listed, read or split on the hub's main thread). Two callers, ONE road: the sub-agent viewer's
// WebSocket attach of `sub-agent-<id>` (src/ws-handler.js — what a person meets, at every open and every re-attach) and
// GET /api/subagent-messages (src/routes/sessions.js — the API reference's route). Measured before (step 1, the stand-in's round
// sizes): the route held the loop 24 ms – 1.7 s an ask, the attach 11 – 119 ms an open (a projects-root listing, a failed listing in
// every project folder, a whole read, split and parse), and a reconnect re-attaches every open window in one turn of the loop.
//   FIND (findAgentTranscript): the place KEPT for this conversation and agent (one stat), else the EXACT folder the cwd names
//     (one stat, then its workflows/<run>/), else every project folder — asynchronously (fs.promises), never a *Sync listing —
//     in the order the release's candidate list had (each folder's direct file, then its workflows); the place found is kept.
//   READ (readAgentTranscript): the transcript pool's paged parse (src/adapters/codex.js readJsonlBoundedParsedPagedAsync) on its
//     own slot ('subagent': a viewer's read never replaces a history read's snapshot) and WHOLE (the viewer showed every line;
//     the history reads' head + tail bound would hide a long agent's middle): the worker reads and parses, the main thread takes the
//     records a page at a time from a line offset, the loop free between pages. A pool that refuses (none on this process, its
//     heap bound, its lane busy, its workers down) is a REFUSAL by name — never a read on the loop.
//   THE RE-ATTACH STORM: ONE read at a time (the history lane is one worker; one snapshot slot), in the order asked, and asks of
//     the SAME file while its read waits or runs share that read — so a reconnect with N agent windows open makes one queue of
//     at most N distinct reads, each window acked at once (attach-ack) and keeping what it shows until its own answer.
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');

const PLACE_MAX = 256;
const _places = new Map();   // `${conversation}\0${agent}` → the transcript's path, kept (the newest last, the oldest dropped)
const _stats = { finds: 0, first: 0, kept: 0, exact: 0, walked: 0, missed: 0, reads: 0, shared: 0, refused: 0, inFlight: 0, maxInFlight: 0, waiting: 0, maxWaiting: 0 };
const stats = () => ({ ..._stats, places: _places.size });

const projectsRoot = () => path.join(os.homedir(), '.claude', 'projects');
const isFile = async (p) => { try { return (await fsp.stat(p)).isFile(); } catch { return false; } };
const keep = (key, fp) => { _places.delete(key); _places.set(key, fp); if (_places.size > PLACE_MAX) _places.delete(_places.keys().next().value); return fp; };

/** `<subDir>/workflows/<run>/agent-<id>.jsonl`, in the listing's order — or null */
async function inWorkflows(subDir, want) {
  let runs = [];
  try { runs = await fsp.readdir(path.join(subDir, 'workflows')); } catch { return null; }
  for (const run of runs) { const fp = path.join(subDir, 'workflows', run, want); if (await isFile(fp)) return fp; }
  return null;
}

/** Where a finished agent's transcript is: { fp, how: 'kept' | 'first' | 'exact' | 'walked' } or { fp: null }. `exactDir` = the
 *  conversation's folder the caller names (`<projects>/<cwd's folder>`), or null; `first` = paths the caller already holds (a
 *  remote parent's pulled copy), asked before anything. Never a synchronous call. */
async function findAgentTranscript({ claudeSessionId, agentId, exactDir = null, first = [], root = projectsRoot() } = {}) {
  _stats.finds++;
  const sid = String(claudeSessionId || ''), want = `agent-${agentId}.jsonl`, key = `${sid}\0${agentId}`;
  for (const fp of first) if (fp && await isFile(fp)) { _stats.first++; return { fp, how: 'first' }; }
  const kept = _places.get(key);
  if (kept && await isFile(kept)) { _stats.kept++; return { fp: kept, how: 'kept' }; }
  if (kept) _places.delete(key);
  const exactSub = exactDir ? path.join(exactDir, sid, 'subagents') : null;
  if (exactSub) {
    const direct = path.join(exactSub, want);
    if (await isFile(direct)) { _stats.exact++; return { fp: keep(key, direct), how: 'exact' }; }
    const wf = await inWorkflows(exactSub, want);
    if (wf) { _stats.exact++; return { fp: keep(key, wf), how: 'exact' }; }
  }
  let dirs = [];
  try { dirs = await fsp.readdir(root); } catch { }
  for (const d of dirs) {
    const sub = path.join(root, d, sid, 'subagents');
    if (sub === exactSub) continue;
    const direct = path.join(sub, want);
    if (await isFile(direct)) { _stats.walked++; return { fp: keep(key, direct), how: 'walked' }; }
    const wf = await inWorkflows(sub, want);
    if (wf) { _stats.walked++; return { fp: keep(key, wf), how: 'walked' }; }
  }
  _stats.missed++;
  return { fp: null };
}

let _chain = Promise.resolve();
const _sharing = new Map();   // the file → its read's promise, while it waits or runs
/** The transcript's records, read and parsed by the transcript pool in pages — { records, meta } or { refused: why }. ONE read at a
 *  time; asks of the same file while its read waits or runs share it. `meta` = the agent's .meta.json beside it (read async). */
function readAgentTranscript(fp, { reader = null } = {}) {
  const same = _sharing.get(fp);
  if (same) { _stats.shared++; return same; }
  _stats.waiting++; _stats.maxWaiting = Math.max(_stats.maxWaiting, _stats.waiting);
  const run = async () => {
    _stats.waiting--; _stats.inFlight++; _stats.maxInFlight = Math.max(_stats.maxInFlight, _stats.inFlight);
    try {
      let why = null;
      const read = reader || require('../adapters/codex').readJsonlBoundedParsedPagedAsync;   // `reader`: a suite's seam
      // note: false — a refusal here says nothing of a conversation's history (as the artifact pass's helper read: row B-422c's word)
      const records = await read(fp, { tailOnly: false, whole: true, slot: 'subagent', note: false, onFail: (w) => { why = w; } });
      if (!Array.isArray(records)) { _stats.refused++; return { refused: why || 'the transcript pool did not answer' }; }
      _stats.reads++;
      let meta = {};
      try { meta = JSON.parse(await fsp.readFile(fp.replace(/\.jsonl$/, '.meta.json'), 'utf-8')); } catch { }
      return { records, meta };
    } finally { _stats.inFlight--; }
  };
  const p = _chain.then(run, run);
  _chain = p.then(() => { }, () => { });
  _sharing.set(fp, p);
  const drop = () => { if (_sharing.get(fp) === p) _sharing.delete(fp); };
  p.then(drop, drop);
  return p;
}

/** find + read, the one road both callers take → { fp, records, meta } | { fp: null } | { fp, refused } */
async function agentTranscript(opts = {}) {
  const found = await findAgentTranscript(opts);
  if (!found.fp) return { fp: null };
  const got = await readAgentTranscript(found.fp, opts);
  return got.refused ? { fp: found.fp, refused: got.refused } : { fp: found.fp, how: found.how, records: got.records, meta: got.meta };
}

function _resetForTest() { _places.clear(); _sharing.clear(); _chain = Promise.resolve(); for (const k of Object.keys(_stats)) _stats[k] = 0; }

module.exports = { findAgentTranscript, readAgentTranscript, agentTranscript, stats, PLACE_MAX, _resetForTest };
