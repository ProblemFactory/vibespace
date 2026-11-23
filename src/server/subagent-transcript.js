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
//   THE LIVE WATCHER'S FINDER (src/server/stdout/claude-stream-json.js startSubagentWatcher, the unit's commit 2; wholly here since
//     r2874 (2), no existence check on the loop): the kept place and the cwd's folder first, then through `shared`: the hub's ONE
//     listing of the projects root, asynchronous, at most once a second, every watcher's retries sharing it.
//   THE RE-ATTACH STORM: ONE read at a time (the history lane is one worker; one snapshot slot), in the order asked, and asks of
//     the SAME file while its read waits or runs share that read — so a reconnect with N agent windows open makes one queue of
//     at most N distinct reads, each window acked at once (attach-ack) and keeping what it shows until its own answer.
//   THE READ CANNOT BE AIMED (主开发 r2865; lane bl-machines-a's verification: an agent id holding parent steps returned ANOTHER
//     conversation's sub-agent words, or a file outside every conversation; a conversation id with a parent step opened another
//     conversation's folder; the answer's size told whether a file existed). Whatever a caller sends, this helper reads ONLY a
//     transcript inside that conversation's own subagents folder (its workflow runs included):
//     - the two ids have the shape the CLI gives them (the conversation a UUID; the agent letters, digits, `_` and `-`), else the
//       ask is REFUSED BY NAME before any file call (idsRefusal; the attach asks it before a remote pull too);
//     - a file found is judged by its REAL path (placeOf): <the real projects root>/<a folder>/<this conversation>/subagents/
//       [workflows/<a run>/]agent-<this id>.jsonl. A link that leads anywhere else is no place, and answers as a missing file does,
//       so nothing tells whether a file elsewhere exists. What is judged is what is read: the real path;
//     - the meta file beside it is read only when its real path is itself (a link is not read);
//     - readAgentTranscript reads only a path this helper judged: no third door can hand it one.
//     All of it on the helper's own road (fs.promises), nothing synchronous on the loop.
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');

const SID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AGENT_SHAPE = /^[\w-]{1,128}$/;
/** why these ids are refused (not the shape the CLI gives them), or null — pure, no file call */
function idsRefusal(claudeSessionId, agentId) {
  if (typeof claudeSessionId !== 'string' || !SID_SHAPE.test(claudeSessionId)) return 'its conversation id is not one the CLI gives (a UUID)';
  if (typeof agentId !== 'string' || !AGENT_SHAPE.test(agentId)) return 'its agent id is not one the CLI gives (letters, digits, _ and -)';
  return null;
}

const PLACE_MAX = 256;
const _places = new Map();   // `${conversation}\0${agent}` → the transcript's path, kept (the newest last, the oldest dropped)
const _stats = { finds: 0, aimed: 0, outside: 0, first: 0, kept: 0, exact: 0, walked: 0, listings: 0, listingsShared: 0, missed: 0, reads: 0, shared: 0, refused: 0, inFlight: 0, maxInFlight: 0, waiting: 0, maxWaiting: 0 };
const stats = () => ({ ..._stats, places: _places.size });

const projectsRoot = () => path.join(os.homedir(), '.claude', 'projects');
// THE HUB'S ONE LISTING of the projects root for the live watchers' finder (commit 2, 主开发 r2374): asynchronous, shared, at most
// once a second — every agent a workflow starts retries its finder while its file is not there yet; each try listed the root again
const LISTING_MAX_AGE_MS = 1000;
let listingMaxAgeMs = LISTING_MAX_AGE_MS;   // a suite may set it (_setListingMaxAgeForTest): the listing is read again after it
let _listing = null;   // { root, at, p }
function sharedListing(root) {
  const now = Date.now();
  if (_listing && _listing.root === root && now - _listing.at < listingMaxAgeMs) { _stats.listingsShared++; return _listing.p; }
  _stats.listings++;
  const p = fsp.readdir(root).catch(() => []);
  _listing = { root, at: now, p };
  return p;
}
// THE JUDGE (r2865): a candidate is its REAL path when that is a file at <real root>/<a folder>/<sid>/subagents/[workflows/<a run>/]
// <want> — else null, exactly as a missing file (a link leading out, a climb, another conversation's folder all answer alike)
const JUDGED_MAX = 512;
const _judged = new Set();   // the real paths this helper judged: readAgentTranscript reads no other (the newest last)
const judged = (real) => { _judged.delete(real); _judged.add(real); if (_judged.size > JUDGED_MAX) _judged.delete(_judged.values().next().value); return real; };
async function placeOf(p, realRoot, sid, want) {
  let real;
  try { real = await fsp.realpath(p); if (!(await fsp.stat(real)).isFile()) return null; } catch { return null; }
  const rel = realRoot ? path.relative(realRoot, real) : '';
  const parts = rel && !path.isAbsolute(rel) ? rel.split(path.sep) : [];
  const inside = parts.length > 0 && parts[0] !== '..' && parts[1] === sid && parts[2] === 'subagents'
    && ((parts.length === 4 && parts[3] === want) || (parts.length === 6 && parts[3] === 'workflows' && parts[5] === want));
  if (!inside) { _stats.outside++; return null; }
  return judged(real);
}
// a remote parent's copy, pulled by the hub into its own cache (hosts.fetchAgentJsonl, ids already shaped): named for this agent
async function pulledOf(p, want) {
  if (typeof p !== 'string' || path.basename(p) !== want) return null;
  try { const real = await fsp.realpath(p); return path.basename(real) === want && (await fsp.stat(real)).isFile() ? judged(real) : null; } catch { return null; }
}
const keep = (key, fp) => { _places.delete(key); _places.set(key, fp); if (_places.size > PLACE_MAX) _places.delete(_places.keys().next().value); return fp; };

/** `<subDir>/workflows/<run>/agent-<id>.jsonl`, in the listing's order — or null */
async function inWorkflows(subDir, want, place) {
  let runs = [];
  try { runs = await fsp.readdir(path.join(subDir, 'workflows')); } catch { return null; }
  for (const run of runs) { const fp = await place(path.join(subDir, 'workflows', run, want)); if (fp) return fp; }
  return null;
}

/** Where a finished agent's transcript is: { fp, how: 'kept' | 'first' | 'exact' | 'walked' } or { fp: null } — or
 *  { fp: null, refused, aimed: true } when the ids are not the CLI's shape (before any file call). `fp` is the REAL path, judged inside
 *  this conversation's own subagents folder (r2865). `exactDir` = the conversation's folder the caller names (`<projects>/<cwd's
 *  folder>`), or null; `first` = paths the caller already holds (a remote parent's pulled copy), asked before anything. The judge's
 *  root is the hub's own projects root, whatever `root` is walked. Never a synchronous call. */
async function findAgentTranscript({ claudeSessionId, agentId, exactDir = null, first = [], root = projectsRoot(), workflows = true, shared = false } = {}) {
  _stats.finds++;
  const refused = idsRefusal(claudeSessionId, agentId);
  if (refused) { _stats.aimed++; return { fp: null, refused, aimed: true }; }
  const sid = claudeSessionId, want = `agent-${agentId}.jsonl`, key = `${sid}\0${agentId}`;
  for (const p of first) { const fp = await pulledOf(p, want); if (fp) { _stats.first++; return { fp, how: 'first' }; } }
  let realRoot = null;
  try { realRoot = await fsp.realpath(projectsRoot()); } catch { }
  const place = (p) => placeOf(p, realRoot, sid, want);
  const kept = _places.get(key);
  const keptFp = kept ? await place(kept) : null;
  if (keptFp) { _stats.kept++; return { fp: keptFp, how: 'kept' }; }
  if (kept) _places.delete(key);
  const exactSub = exactDir ? path.join(exactDir, sid, 'subagents') : null;
  if (exactSub) {
    const direct = await place(path.join(exactSub, want));
    if (direct) { _stats.exact++; return { fp: keep(key, direct), how: 'exact' }; }
    const wf = workflows ? await inWorkflows(exactSub, want, place) : null;
    if (wf) { _stats.exact++; return { fp: keep(key, wf), how: 'exact' }; }
  }
  let dirs = [];
  if (shared) dirs = await sharedListing(root);   // the live watchers' road: the hub's one listing, at most once a second
  else try { dirs = await fsp.readdir(root); } catch { }
  for (const d of dirs) {
    const sub = path.join(root, d, sid, 'subagents');
    if (sub === exactSub) continue;
    const direct = await place(path.join(sub, want));
    if (direct) { _stats.walked++; return { fp: keep(key, direct), how: 'walked' }; }
    const wf = workflows ? await inWorkflows(sub, want, place) : null;
    if (wf) { _stats.walked++; return { fp: keep(key, wf), how: 'walked' }; }
  }
  _stats.missed++;
  return { fp: null };
}

let _chain = Promise.resolve();
const _sharing = new Map();   // the file → its read's promise, while it waits or runs
/** The transcript's records, read and parsed by the transcript pool in pages — { records, meta } or { refused: why }. ONE read at a
 *  time; asks of the same file while its read waits or runs share it. `meta` = the agent's .meta.json beside it (read async). */
// THE META READ'S BOUND (r2594 (3)): the agent's small .meta.json is read inside the ONE chain — a read that never returns would hold
// every later sub-agent read of the hub with no word; past this bound the read is REFUSED by name (the pool has its own: 60 s a call)
const META_BOUND_MS = 2000;
const LATE = Symbol('late');
function readAgentTranscript(fp, { reader = null, metaRead = null, metaBoundMs = META_BOUND_MS } = {}) {
  // r2865: ONLY a path this helper judged (findAgentTranscript's answer) — a third door cannot hand it another
  if (!_judged.has(fp)) { _stats.refused++; return Promise.resolve({ refused: 'not a transcript this helper found' }); }
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
      let meta = {}, timer = null;
      const metaPath = fp.replace(/\.jsonl$/, '.meta.json');
      // r2865: the meta file is read only when its real path is itself (fp is already real): a link beside it is not read
      const text = await Promise.race([
        fsp.realpath(metaPath).then((r) => (r === metaPath ? (metaRead || ((p) => fsp.readFile(p, 'utf-8')))(metaPath) : null)).catch(() => null),
        new Promise((res) => { timer = setTimeout(() => res(LATE), metaBoundMs); }),
      ]);
      clearTimeout(timer);
      if (text === LATE) { _stats.refused++; return { refused: `its meta file (${path.basename(metaPath)}) did not answer within ${metaBoundMs / 1000} s` }; }
      if (typeof text === 'string') try { meta = JSON.parse(text); } catch { }
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
  if (!found.fp) return found.aimed ? { fp: null, refused: found.refused, aimed: true } : { fp: null };
  const got = await readAgentTranscript(found.fp, opts);
  return got.refused ? { fp: found.fp, refused: got.refused } : { fp: found.fp, how: found.how, records: got.records, meta: got.meta };
}

/** the place kept for this conversation and agent (the live watcher asks it before its one stat of the cwd's folder), or null */
const keptPlace = (claudeSessionId, agentId) => _places.get(`${claudeSessionId}\0${agentId}`) || null;

function _resetForTest() { _places.clear(); _judged.clear(); _sharing.clear(); _chain = Promise.resolve(); _listing = null; listingMaxAgeMs = LISTING_MAX_AGE_MS; for (const k of Object.keys(_stats)) _stats[k] = 0; }
const _setListingMaxAgeForTest = (ms) => { listingMaxAgeMs = ms; };

module.exports = { findAgentTranscript, readAgentTranscript, agentTranscript, idsRefusal, keptPlace, stats, PLACE_MAX, LISTING_MAX_AGE_MS, META_BOUND_MS, _resetForTest, _setListingMaxAgeForTest };
