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
const FSC = require('fs').constants;
const path = require('path');
const os = require('os');

const SID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AGENT_SHAPE = /^[\w-]{1,128}$/;
// EVERY REFUSAL IS SAID TWICE (主开发 r3103 (4)): its English words (`refused`, the journal's and the API's) and its CODE with its
// values (`said`: { code, vars }) — the page words it through its own translation (src/lib/chat-view.js SUBAGENT_REFUSED, zh / ja)
/** the shape refusal of these ids — { text, said } — or null; pure, no file call */
function idsRefusalOf(claudeSessionId, agentId) {
  if (typeof claudeSessionId !== 'string' || !SID_SHAPE.test(claudeSessionId)) return { text: 'its conversation id is not one the CLI gives (a UUID)', said: { code: 'sid-shape' } };
  if (typeof agentId !== 'string' || !AGENT_SHAPE.test(agentId)) return { text: 'its agent id is not one the CLI gives (letters, digits, _ and -)', said: { code: 'agent-shape' } };
  return null;
}
/** why these ids are refused (not the shape the CLI gives them), or null — pure, no file call */
const idsRefusal = (claudeSessionId, agentId) => { const r = idsRefusalOf(claudeSessionId, agentId); return r ? r.text : null; };

const PLACE_MAX = 256;
const _places = new Map();   // `${conversation}\0${agent}` → the transcript's path, kept (the newest last, the oldest dropped)
const _stats = { finds: 0, aimed: 0, outside: 0, unanswered: 0, unfinished: 0, skipped: 0, indexed: 0, indexHit: 0, indexMiss: 0, first: 0, kept: 0, exact: 0, walked: 0, listings: 0, listingsShared: 0, missed: 0, reads: 0, shared: 0, refused: 0, inFlight: 0, maxInFlight: 0, waiting: 0, maxWaiting: 0 };
const stats = () => ({ ..._stats, places: _places.size, marked: _unanswered.size, walking: _walks.size, conversations: _convFolders.size });

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
// THE FIND'S BOUND (主开发 r2881; lane bl-machines-a's verification: a projects folder that stopped answering held the find for ever
// — the route never answered, the viewer said «Still loading» and waited; each such ask could hold one of the runtime's few file
// threads). Every file call of a find is a LOOK, counted by the folder it lands in (the projects root, or the project folder under
// it): ONE out a folder (a look waits for the one out there before it starts — never a second thread on a folder that hangs); the
// whole find answers by FIND_BOUND_MS, and past it the ask is REFUSED BY NAME («… did not answer within N s»), never silence; the
// look that did not answer keeps its folder MARKED until it returns, so a later find starts no look there (refused by name at
// once), and the first ask after it returned is served.
//   ITS WORDS TRUE (r2991 (a)): a folder is said not to answer only when a look there has been out half the bound or more — then
//   it is marked and the walk ends. A walk still going at the bound (every look answering, or waiting behind healthy ones: a large
//   projects folder on a slow home) is NOT cut: «the walk … did not finish», it goes on, and its answer is KEPT — a place found is
//   the next ask's kept place, a miss is the next ask's answer for MISS_KEPT_MS (the release answered in the end too). An ask of
//   the same thing while it goes on joins it. A marked PROJECT folder is skipped by a walk (as a folder with no such file); only
//   when nothing is found is the ask refused by its name. The projects root marked refuses at once.
const FIND_BOUND_MS = 10000;
const MISS_KEPT_MS = 60000;
const _walks = new Map();    // the ask → its walk, while it runs (asks of the same thing join it)
const _missedPast = new Map();   // the ask → when its walk, past a bound, ended finding nothing
let findBoundMs = FIND_BOUND_MS;   // a suite may set it (_setFindBoundForTest)
const _unanswered = new Map();   // folder → the look out there that did not answer within a find's bound (until it returns)
const _tail = new Map();         // folder → its last look (the next one there waits for it)
const STOP = Symbol('stop');
const stopOf = (why, said = null) => Object.assign(new Error(why), { [STOP]: true, said });
const isStop = (e) => !!(e && e[STOP]);
// a folder's words, said with their code: `s` = the bound (it did not answer within it), or null (a look there is still out)
function folderWords(key, root, s = null) {
  const name = path.basename(key);
  if (key === root) return s == null ? { text: 'the projects folder did not answer (a look there is still out)', said: { code: 'root-out' } }
    : { text: `the projects folder did not answer within ${s} s`, said: { code: 'root-late', vars: { s } } };
  return s == null ? { text: `the folder ${name} did not answer (a look there is still out)`, said: { code: 'folder-out', vars: { name } } }
    : { text: `the folder ${name} did not answer within ${s} s`, said: { code: 'folder-late', vars: { name, s } } };
}
function looker(root) {
  const ctx = { ended: false, out: null, waiting: null, skipped: null, judgeRoot: path.resolve(projectsRoot()), realProj: new Map() };
  const keyOf = (p) => { const rel = path.relative(root, p); if (!rel) return root; if (rel.split(path.sep)[0] === '..' || path.isAbsolute(rel)) return path.dirname(p); return path.join(root, rel.split(path.sep)[0]); };
  ctx.look = (p, fn) => {
    if (ctx.ended) return Promise.reject(stopOf('the find has ended'));
    const key = keyOf(p);
    if (_unanswered.has(key)) {
      if (key === root) { _stats.unanswered++; const w = folderWords(key, root); return Promise.reject(stopOf(w.text, w.said)); }
      _stats.skipped++; if (!ctx.skipped) ctx.skipped = key;   // a marked project folder: skipped, as one with no such file
      return Promise.reject(new Error('skipped'));
    }
    const prev = _tail.get(key);
    let lp = null;
    const run = () => { if (ctx.ended) throw stopOf('the find has ended'); ctx.waiting = null; ctx.out = { key, lp, at: Date.now() }; return fn(); };
    ctx.waiting = key;
    lp = prev ? prev.then(run, run) : Promise.resolve().then(run);
    _tail.set(key, lp);
    const done = () => { if (_tail.get(key) === lp) _tail.delete(key); if (ctx.out && ctx.out.lp === lp) ctx.out = null; };
    lp.then(done, done);
    return lp;
  };
  return ctx;
}

// THE JUDGE (r2865): a candidate is its REAL path when that is a file of THIS conversation's own subagents folder — else null,
// exactly as a missing file (a link leading out, a climb, another conversation's folder all answer alike).
// BELOW THE PROJECT FOLDER (r2991, the round's must): the candidate's own project folder — read from its shape, a direct child of
// the hub's projects root — may itself be a link to anywhere, and so may the projects root (the release allowed both: a project
// folder on other storage is a setup the usage walk knows). The judgement stands on THAT folder's real path: the file's real path
// must be exactly <its real path>/<this conversation>/subagents/[workflows/<one run>/]<the agent's file>.
const JUDGED_MAX = 512;
const _judged = new Set();   // the real paths this helper judged: readAgentTranscript reads no other (the newest last)
const judged = (real) => { _judged.delete(real); _judged.add(real); if (_judged.size > JUDGED_MAX) _judged.delete(_judged.values().next().value); return real; };
// the candidate's own project folder, read from its shape: <proj>/<sid>/subagents/<want> or <proj>/<sid>/subagents/workflows/<run>/<want>
function projectOf(p, sid, want) {
  if (path.basename(p) !== want) return null;
  let d = path.dirname(p);
  if (path.basename(path.dirname(d)) === 'workflows') d = path.dirname(path.dirname(d));
  if (path.basename(d) !== 'subagents' || path.basename(path.dirname(d)) !== sid) return null;
  return path.dirname(path.dirname(d));
}
async function insideOwn(p, real, sid, want, L, ctx) {
  const proj = projectOf(p, sid, want);
  if (!proj || path.dirname(proj) !== ctx.judgeRoot) return false;
  let realProj = ctx.realProj.get(proj);
  if (realProj === undefined) {
    try { realProj = await L(proj, () => fsp.realpath(proj)); } catch (e) { if (isStop(e)) throw e; realProj = null; }
    ctx.realProj.set(proj, realProj);
  }
  if (!realProj) return false;
  const own = path.join(realProj, sid, 'subagents');
  if (path.dirname(real) === own) return path.basename(real) === want;
  const rest = path.relative(own, real).split(path.sep);
  return rest.length === 3 && rest[0] === 'workflows' && rest[1] !== '..' && rest[2] === want;
}
async function placeOf(p, sid, want, L, ctx) {
  let real;
  try { real = await L(p, () => fsp.realpath(p)); if (!(await L(p, () => fsp.stat(real))).isFile()) return null; } catch (e) { if (isStop(e)) throw e; return null; }
  const inside = await insideOwn(p, real, sid, want, L, ctx);
  if (!inside) { _stats.outside++; return null; }
  return judged(real);
}
// a remote parent's copy, pulled by the hub into its own cache (hosts.fetchAgentJsonl, ids already shaped): named for this agent
async function pulledOf(p, want, L) {
  if (typeof p !== 'string' || path.basename(p) !== want) return null;
  try { const real = await L(p, () => fsp.realpath(p)); return path.basename(real) === want && (await L(p, () => fsp.stat(real))).isFile() ? judged(real) : null; } catch (e) { if (isStop(e)) throw e; return null; }
}
// THE CONVERSATION → PROJECT FOLDER INDEX (主开发 r2446 / r2736, settled with lane report-mark-on-ack): which project folder
// holds a conversation's own folder. Fed by the hub's workflow look as a BY-PRODUCT of the project folders' listings it makes
// anyway (src/routes/sessions.js — no read of its own), and by this helper's own finds; asked after the kept and exact places and
// before any walk: ONE known place instead of a walk of every project folder (a workflow's agents in another project folder: the
// first one's walk teaches the folder to the rest). A stale entry costs that one look, then the walk follows and corrects it.
// Bounded (CONV_INDEX_MAX, the least recent leaves first); a conversation id of the CLI's shape and one folder name only.
const CONV_INDEX_MAX = 4096;
const _convFolders = new Map();   // conversation id → its project folder's name (the newest last)
function noteConversationFolder(claudeSessionId, folder) {
  if (typeof claudeSessionId !== 'string' || !SID_SHAPE.test(claudeSessionId)) return false;
  if (typeof folder !== 'string' || !folder || folder === '.' || folder === '..' || folder.includes('/') || folder.includes(path.sep)) return false;
  _convFolders.delete(claudeSessionId); _convFolders.set(claudeSessionId, folder);
  if (_convFolders.size > CONV_INDEX_MAX) _convFolders.delete(_convFolders.keys().next().value);
  _stats.indexed++;
  return true;
}
/** the project folder the index knows for this conversation, or null */
const conversationFolderOf = (claudeSessionId) => _convFolders.get(claudeSessionId) || null;
const keep = (key, fp) => { _places.delete(key); _places.set(key, fp); if (_places.size > PLACE_MAX) _places.delete(_places.keys().next().value); return fp; };

/** `<subDir>/workflows/<run>/agent-<id>.jsonl`, in the listing's order — { fp: its real path, cand: the place asked } or null */
async function inWorkflows(subDir, want, place, L) {
  let runs = [];
  try { runs = await L(subDir, () => fsp.readdir(path.join(subDir, 'workflows'))); } catch (e) { if (isStop(e)) throw e; return null; }
  for (const run of runs) { const cand = path.join(subDir, 'workflows', run, want), fp = await place(cand); if (fp) return { fp, cand }; }
  return null;
}

/** Where a finished agent's transcript is: { fp, how: 'kept' | 'first' | 'exact' | 'walked' } or { fp: null } — or
 *  { fp: null, refused, aimed: true } when the ids are not the CLI's shape (before any file call). `fp` is the REAL path, judged inside
 *  this conversation's own subagents folder (r2865). `exactDir` = the conversation's folder the caller names (`<projects>/<cwd's
 *  folder>`), or null; `first` = paths the caller already holds (a remote parent's pulled copy), asked before anything. The judge's
 *  root is the hub's own projects root, whatever `root` is walked. Never a synchronous call. BOUNDED (r2881): { fp: null, refused,
 *  unanswered: true } when a folder did not answer within findBoundMs (or a look there is still out). */
const markUnanswered = (out) => { _unanswered.set(out.key, out.lp); const clear = () => { if (_unanswered.get(out.key) === out.lp) _unanswered.delete(out.key); }; out.lp.then(clear, clear); };
async function findAgentTranscript(opts = {}) {
  _stats.finds++;
  const shape = idsRefusalOf(opts.claudeSessionId, opts.agentId);
  if (shape) { _stats.aimed++; return { fp: null, refused: shape.text, said: shape.said, aimed: true }; }
  const root = opts.root || projectsRoot();
  const ask = [opts.claudeSessionId, opts.agentId, opts.exactDir || '', root, opts.workflows !== false, !!opts.shared, ...(opts.first || [])].join('\0');
  let walk = _walks.get(ask);
  if (!walk) {
    const ctx = looker(root);
    ctx.ask = ask;
    walk = { ctx, past: false };
    walk.p = findWithin(opts, root, ctx).catch((e) => (isStop(e) ? { fp: null, refused: e.message, said: e.said || null, unanswered: true } : { fp: null }));
    _walks.set(ask, walk);
    const w = walk;
    w.p.then((r) => {
      if (_walks.get(ask) === w) _walks.delete(ask);
      if (w.past && r && !r.fp && !r.refused) { _missedPast.set(ask, Date.now()); while (_missedPast.size > PLACE_MAX) _missedPast.delete(_missedPast.keys().next().value); }
    });
  }
  let timer = null;
  const late = new Promise((res) => { timer = setTimeout(() => res(LATE), findBoundMs); });
  const got = await Promise.race([walk.p, late]);
  clearTimeout(timer);
  if (got !== LATE) return got;
  const out = walk.ctx.out;
  const stalled = !!out && Date.now() - out.at >= findBoundMs / 2;
  if (stalled) {   // a look out that long: its folder did not answer — marked, the walk ends
    walk.ctx.ended = true;
    if (_walks.get(ask) === walk) _walks.delete(ask);   // an ended walk is joined by no later ask: that one meets the mark at once
    markUnanswered(out);
    _stats.unanswered++;
    const w = folderWords(out.key, root, findBoundMs / 1000);
    return { fp: null, refused: w.text, said: w.said, unanswered: true };
  }
  walk.past = true;   // still going: not cut — it goes on, its answer kept for the next ask
  _stats.unfinished++;
  const s = findBoundMs / 1000;
  return { fp: null, refused: `the walk of the projects folder did not finish within ${s} s (it goes on: ask again)`, said: { code: 'walk-unfinished', vars: { s } }, unanswered: true };
}
async function findWithin({ claudeSessionId: sid, agentId, exactDir = null, first = [], workflows = true, shared = false }, root, ctx) {
  const want = `agent-${agentId}.jsonl`, key = `${sid}\0${agentId}`, L = ctx.look;
  for (const p of first) { const fp = await pulledOf(p, want, L); if (fp) { _stats.first++; return { fp, how: 'first' }; } }
  const place = (p) => placeOf(p, sid, want, L, ctx);   // the place KEPT is the one asked (judged again at each ask), never its real path
  const kept = _places.get(key);
  const keptFp = kept ? await place(kept) : null;
  if (keptFp) { _stats.kept++; return { fp: keptFp, how: 'kept' }; }
  if (kept) _places.delete(key);
  const exactSub = exactDir ? path.join(exactDir, sid, 'subagents') : null;
  if (exactSub) {
    const cand = path.join(exactSub, want), direct = await place(cand);
    if (direct) { _stats.exact++; keep(key, cand); noteConversationFolder(sid, path.basename(exactDir)); return { fp: direct, how: 'exact' }; }
    const wf = workflows ? await inWorkflows(exactSub, want, place, L) : null;
    if (wf) { _stats.exact++; keep(key, wf.cand); noteConversationFolder(sid, path.basename(exactDir)); return { fp: wf.fp, how: 'exact' }; }
  }
  // THE INDEX (r2446): the one project folder the look, or a find, saw this conversation in — asked before any walk
  const known = _convFolders.get(sid);
  if (known) {
    const sub = path.join(root, known, sid, 'subagents');
    if (sub !== exactSub) {
      const cand = path.join(sub, want), direct = await place(cand);
      if (direct) { _stats.indexHit++; keep(key, cand); return { fp: direct, how: 'indexed' }; }
      const wf = workflows ? await inWorkflows(sub, want, place, L) : null;
      if (wf) { _stats.indexHit++; keep(key, wf.cand); return { fp: wf.fp, how: 'indexed' }; }
      _stats.indexMiss++;   // stale, or this agent is not there: the walk follows
    }
  }
  // r3103 (1): the kept MISS is asked only AFTER the kept and exact places — a file written there since is found at once
  const missedAt = _missedPast.get(ctx.ask);
  if (missedAt !== undefined) { if (Date.now() - missedAt < MISS_KEPT_MS) return { fp: null }; _missedPast.delete(ctx.ask); }
  let dirs = [];
  // shared: the live watchers' road — the hub's one listing, at most once a second
  try { dirs = await L(root, () => (shared ? sharedListing(root) : fsp.readdir(root))); } catch (e) { if (isStop(e)) throw e; }
  for (const d of dirs) {
    const sub = path.join(root, d, sid, 'subagents');
    if (sub === exactSub) continue;
    const cand = path.join(sub, want), direct = await place(cand);
    if (direct) { _stats.walked++; keep(key, cand); noteConversationFolder(sid, d); return { fp: direct, how: 'walked' }; }
    const wf = workflows ? await inWorkflows(sub, want, place, L) : null;
    if (wf) { _stats.walked++; keep(key, wf.cand); noteConversationFolder(sid, d); return { fp: wf.fp, how: 'walked' }; }
  }
  _stats.missed++;
  // a folder skipped as marked may hold it: the ask is refused by THAT folder's name, never answered as missing
  if (ctx.skipped) { const w = folderWords(ctx.skipped, root); return { fp: null, refused: w.text, said: w.said, unanswered: true }; }
  return { fp: null };
}

let _chain = Promise.resolve();
const _sharing = new Map();   // the file → its read's promise, while it waits or runs
/** The transcript's records, read and parsed by the transcript pool in pages — { records, meta } or { refused: why }. ONE read at a
 *  time; asks of the same file while its read waits or runs share it. `meta` = the agent's .meta.json beside it (read async). */
// THE META READ'S BOUND (r2594 (3)): the agent's small .meta.json is read inside the ONE chain — a read that never returns would hold
// every later sub-agent read of the hub with no word; past this bound the read is REFUSED by name (the pool has its own: 60 s a call)
const META_BOUND_MS = 2000;
// r2991 (c): the meta file is read by the path that was judged — through a handle opened with no link followed at its last part
async function readJudged(p) {
  const fh = await fsp.open(p, FSC.O_RDONLY | (FSC.O_NOFOLLOW || 0));
  try { return await fh.readFile('utf-8'); } finally { await fh.close().catch((e) => console.warn(`[subagent] a meta file's close failed (${path.basename(p)}): ${(e && e.message) || e}`)); }
}
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
        fsp.realpath(metaPath).then((r) => (r === metaPath ? (metaRead || readJudged)(metaPath) : null)).catch(() => null),
        new Promise((res) => { timer = setTimeout(() => res(LATE), metaBoundMs); }),
      ]);
      clearTimeout(timer);
      if (text === LATE) { _stats.refused++; const file = path.basename(metaPath), s = metaBoundMs / 1000; return { refused: `its meta file (${file}) did not answer within ${s} s`, said: { code: 'meta-late', vars: { file, s } } }; }
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
  if (!found.fp) return found.aimed || found.unanswered ? { fp: null, refused: found.refused, said: found.said || null, aimed: !!found.aimed, unanswered: !!found.unanswered } : { fp: null };
  const got = await readAgentTranscript(found.fp, opts);
  return got.refused ? { fp: found.fp, refused: got.refused, said: got.said || null } : { fp: found.fp, how: found.how, records: got.records, meta: got.meta };
}

/** the place kept for this conversation and agent (the one asked, judged again at each ask), or null */
const keptPlace = (claudeSessionId, agentId) => _places.get(`${claudeSessionId}\0${agentId}`) || null;

function _resetForTest() { _places.clear(); _judged.clear(); _convFolders.clear(); _unanswered.clear(); _tail.clear(); _walks.clear(); _missedPast.clear(); findBoundMs = FIND_BOUND_MS; _sharing.clear(); _chain = Promise.resolve(); _listing = null; listingMaxAgeMs = LISTING_MAX_AGE_MS; for (const k of Object.keys(_stats)) _stats[k] = 0; }
const _setListingMaxAgeForTest = (ms) => { listingMaxAgeMs = ms; };
const _setFindBoundForTest = (ms) => { findBoundMs = ms; };

module.exports = { findAgentTranscript, readAgentTranscript, agentTranscript, idsRefusal, idsRefusalOf, noteConversationFolder, conversationFolderOf, CONV_INDEX_MAX, keptPlace, stats, PLACE_MAX, LISTING_MAX_AGE_MS, META_BOUND_MS, FIND_BOUND_MS, MISS_KEPT_MS, _resetForTest, _setListingMaxAgeForTest, _setFindBoundForTest };
