'use strict';
// THE AGE SWEEP OF THE HANDED RECORDS (row B-5a4d, its root — 主开发 r3206 / r3247 / r3249, lane bl-keys-misc). A frame the person
// handed to a running turn has ONE record file per conversation, `<buffers>/handed/<conversation id>.json` (data/bin/chat-wrapper.js
// writes it, src/handed-records.js reads it). The tree has no road that deletes a claude conversation, so the files have no other
// remover: until this sweep they grew by one small file for each conversation that ever handed a frame. A file goes ONLY when all
// three hold:
//   · ITS CONVERSATION's TRANSCRIPT IS GONE from every place the hub looks — the ONE walk src/session-store.js claudeTranscriptIndex
//     (the person's projects tree and the remote-transcript cache: what findSessionJsonlPath looks at), read WHOLE: a walk that
//     failed, passed its bound or could not read the projects folder itself proves nothing, and nothing goes;
//   · NO CONVERSATION RECORD NAMES IT — no live session (its conversation id, its fork chain, its hub id) and no session record in
//     data/session-meta in ANY form (<sock>.json, .json.stopped, .json.orphan) whose bytes hold the id as a JSON string. A record
//     that could not be read counts as naming it: the record family's ONE verdict (src/server/session-meta-verdict.js) is ASKED —
//     while any record could not be read at all nothing goes, and keeps(id) for the rest — and a record the verdict holds unread is
//     never read a second time here. A record THIS sweep cannot read or parse, or a folder it cannot list, keeps every file;
//   · IT IS OLDER THAN THE WRAPPER FILES' SEVEN DAYS — by its own mtime (the wrapper writes it at each hand-over and each settle);
//     the cutoff is server.js's one number for both sweeps.
// With a conversation's file go its torn copy (`<id>.json-torn`) and a temp a killed write left (`<id>.json.<pid>.tmp`), each by its
// own age. A `hub-<hub id>.json` (a frame handed before the CLI announced an id: no later reader draws it) is named by its hub id —
// a live session of that id, or a record naming it, keeps it. Anything else in the folder is never touched, and a link or a folder
// is never followed. Each file is looked at again just before it goes (still the same file, its conversation still not live).
// Every removal is said (the count and the names), and every pass that keeps all for an unknown says why.
// A RECORD GOES ONLY ON A PROOF THAT COVERS THE PLACE ITS CONVERSATION's TRANSCRIPT LIVES (主开发 r3714): the index reads THIS machine's
// trees, so a file goes only when its frames say its conversation was THIS machine's — a frame handed to a CLI the wrapper ran itself
// (its `cli`: pid AND birth). A remote conversation's wrapper (data/bin/chat-wrapper.js REMOTE MODE: the CLI runs under a keeper on
// the paired machine) records no CLI (`cli: null`), and the hub's remote-transcript cache's silence proves nothing about the machine:
// such a file, or one whose frames cannot be read, is KEPT and counted (said). The bound that leaves: one small file a remote
// conversation that ever handed a frame. And when the hub's own environment names another configuration folder (CLAUDE_CONFIG_DIR not
// the home's `.claude`), the index (the home's own folder) covers nothing there: nothing goes, said.
// THE ONE WINDOW, said: between the second look (an lstat) and the removal (an unlink BY NAME) is one await; a rename into that name
// in it would be removed. For a file that goes the transcript is already gone everywhere this machine looks, so no CLI here can
// resume that conversation to write it again.
// Off the loop: fs.promises only — ONE pass, 30 s after the start, beside the aged wrapper-files sweep (server.js).
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const { DIRNAME, FILE_MAX } = require('../handed-records.js');

const AGE_MS = 7 * 86400000;                       // the wrapper files' age (server.js hands its own cutoff)
const FILE_RE = /^(.+?)\.json(-torn|\.\d+\.tmp)?$/;  // the wrapper's own names: <id>.json, its torn copy, its temp
const RECORD_RE = /^(.+)\.json(\.stopped|\.orphan)?$/;
const SAY_MAX = 12;                                 // the names said in one line

/** what the live sessions name: each one's hub id, its conversation id, its fork chain */
function liveNames(activeSessions) {
  const names = new Set();
  try {
    for (const [id, s] of activeSessions || []) {
      if (typeof id === 'string' && id) names.add(id);
      if (!s || typeof s !== 'object') continue;
      for (const x of [s.claudeSessionId, s.backendSessionId, s._forkSourceId, s.forkSourceId, ...(Array.isArray(s.forkedFrom) ? s.forkedFrom : [])]) if (typeof x === 'string' && x) names.add(x);
    }
  } catch { }
  return names;
}
const idOfName = (base) => (base.startsWith('hub-') ? base.slice(4) : base);   // a provisional file is named by its hub id
const same = (a, b) => !!(a && b && a.ino === b.ino && a.dev === b.dev && a.mtimeMs === b.mtimeMs && a.size === b.size);
/** a frame handed to a CLI the wrapper ran ITSELF — its pid AND its birth (a remote conversation's frame names none) */
const localCli = (r) => !!(r && r.cli && Number(r.cli.pid) > 1 && typeof r.cli.start === 'string' && r.cli.start);
/** WHERE a file's conversation lives, by its frames: true = this machine's · false = no CLI of this machine named · null = not readable.
 *  The conversation's main file (`<base>.json`) answers for its torn copy and its temp; else the file itself. One read a file. */
async function placeOf(dir, base, own, cache) {
  for (const f of [base + '.json', own]) {
    if (cache.has(f)) return cache.get(f);
    let text = null;
    try { const st = await fsp.stat(path.join(dir, f)); if (st.size > FILE_MAX) { cache.set(f, null); return null; } text = await fsp.readFile(path.join(dir, f), 'utf8'); }
    catch (e) { if (e && e.code === 'ENOENT') continue; cache.set(f, null); return null; }
    let v = null; try { const j = JSON.parse(text); v = !!(j && Array.isArray(j.frames) && j.frames.some(localCli)); } catch { v = null; }
    cache.set(f, v); return v;
  }
  return null;
}

/** ONE pass → { removed: [file names], kept: n, unknown: why | null } */
async function sweep({ buffersDir, metaDir, cutoff = Date.now() - AGE_MS, configDir = process.env.CLAUDE_CONFIG_DIR || '', homeConfig = path.join(os.homedir(), '.claude'), activeSessions = new Map(), verdict = require('./session-meta-verdict.js'), transcripts = () => require('../session-store.js').claudeTranscriptIndex(), log = (m) => console.log('[handed] ' + m) } = {}) {
  const out = { removed: [], kept: 0, unknown: null, notHere: 0 };
  if (!buffersDir || !metaDir) return out;
  const dir = path.join(buffersDir, DIRNAME);
  let names;
  try { names = await fsp.readdir(dir); } catch (e) {
    if (!(e && e.code === 'ENOENT')) { out.unknown = `the records folder could not be listed (${(e && e.code) || (e && e.message)})`; log(`the age sweep removed nothing: ${out.unknown}`); }
    return out;
  }
  // 1. the AGED files of the wrapper's own names — by their own age, regular files only
  const aged = [];
  for (const name of names) {
    const m = FILE_RE.exec(name);
    if (!m) continue;
    let st = null; try { st = await fsp.lstat(path.join(dir, name)); } catch { continue; }
    if (!st.isFile()) continue;
    if (st.mtimeMs > cutoff) { out.kept++; continue; }
    aged.push({ name, base: m[1], id: idOfName(m[1]), st });
  }
  if (!aged.length) return out;
  const keepAll = (why) => { out.unknown = why; out.kept += aged.length; log(`the age sweep removed nothing (${aged.length} file(s) past the age): ${why}`); return out; };
  // 2. THE RECORDS THAT NAME IT — the verdict first (a record that could not be read names everything), the live sessions, then
  //    every record form on disk (one read each; a record the verdict holds unread is never read here)
  if (configDir && path.resolve(configDir) !== path.resolve(homeConfig)) return keepAll('the hub\'s environment names another configuration folder (CLAUDE_CONFIG_DIR) — the transcript index reads the home\'s own, so its silence covers nothing there');
  if (verdict.anyUnreadable()) return keepAll('a conversation\'s record could not be read — it may name any of them (src/server/session-meta-verdict.js)');
  // 2a. WHERE ITS CONVERSATION LIVES (r3714): only a file whose frames name a CLI this machine ran can be proven gone here
  const cache = new Map(), here = [];
  for (const a of aged) { if ((await placeOf(dir, a.base, a.name, cache)) === true) here.push(a); else out.notHere++; }
  if (out.notHere) log(`the age sweep kept ${out.notHere} file(s) past the age whose conversation is not provably this machine's (a remote conversation, or frames that cannot be read) — the remote-transcript cache's silence is no proof`);
  const live = liveNames(activeSessions);
  const want = new Set();
  for (const a of here) if (!live.has(a.id) && !verdict.keeps(a.id)) want.add(a.id);
  const named = new Set();
  if (want.size) {
    let recs;
    try { recs = await fsp.readdir(metaDir); } catch (e) { if (e && e.code === 'ENOENT') recs = []; else return keepAll(`the conversations' records could not be listed (${(e && e.code) || (e && e.message)})`); }
    for (const f of recs) {
      const m = RECORD_RE.exec(f);
      if (!m) continue;
      if (!m[2] && verdict.isMarked(m[1])) continue;   // held unread by the verdict: asked above, never read a second time
      let text;
      try { text = await fsp.readFile(path.join(metaDir, f), 'utf8'); JSON.parse(text); }
      catch (e) { if (e && e.code === 'ENOENT') continue; return keepAll(`the record ${f} could not be read here (${(e && e.code) || 'it does not parse'}) — it may name any of them`); }
      for (const id of want) if (!named.has(id) && text.includes(JSON.stringify(id))) named.add(id);
      if (named.size === want.size) break;
    }
  }
  const left = here.filter((a) => want.has(a.id) && !named.has(a.id));
  if (!left.length) { out.kept += aged.length; return out; }
  // 3. THE TRANSCRIPTS — read whole, or nothing goes
  let index = null;
  try { index = await transcripts(); } catch (e) { return keepAll(`the transcripts could not be read (${(e && e.code) || 'the walk threw'})`); }   // a code, never a message (it can carry a path)
  if (!index || index.ok !== true || index.topReadable !== true) return keepAll(`the transcripts were not read whole (${!index ? 'no answer' : index.ok !== true ? 'a folder failed or the walk passed its bound' : 'the projects folder itself was not read'}) — an absent one proves nothing`);
  for (const a of left) {
    if (index.has(a.id)) { out.kept++; continue; }
    // looked at again just before it goes: the same file (no write since), its conversation still not live
    let now = null; try { now = await fsp.lstat(path.join(dir, a.name)); } catch { continue; }
    if (!same(a.st, now) || liveNames(activeSessions).has(a.id)) { out.kept++; continue; }
    try { await fsp.unlink(path.join(dir, a.name)); out.removed.push(a.name); }
    catch (e) { out.kept++; if (!(e && e.code === 'ENOENT')) log(`${a.name} could not be removed (${(e && e.code) || (e && e.message)})`); }
  }
  out.kept += aged.length - left.length;
  if (out.removed.length) log(`the age sweep removed ${out.removed.length} record file(s) — no transcript anywhere the hub looks, no record names them, older than the age: ${out.removed.slice(0, SAY_MAX).join(', ')}${out.removed.length > SAY_MAX ? ` and ${out.removed.length - SAY_MAX} more` : ''}`);
  return out;
}

module.exports = { sweep, liveNames, AGE_MS, FILE_RE, RECORD_RE };
