'use strict';
// PURE: THE KEPT COPY (row B-437e, the files tier — 主开发 r1247 (2) the shape, r1304 GO with five additions, r1327 the paired
// road; lane lg-rewind, 2026-11-21). THE LAW: «NOTHING OF A PERSON'S IS OVERWRITTEN OR REMOVED BY A REWIND WITHOUT A KEPT COPY».
// Before the files press, every file the CLI's dry run lists is KEPT on the machine its files are on — this hub: the
// hub's own kept folder (data/rewind-kept/<conversation>/<press>/ — beside the dropped files, never inside them); a paired machine:
// under the agent's own state there (~/.vibespace/agentd/rewind-kept/<conversation>/<press>/) — and the press goes ONLY when
// every copy is kept and read back. The outcome names where the copies are and offers ONE press, «put my files back as they
// were»: files only, the conversation untouched, and what stands there now is kept first (the law holds for it too).
//   BOUNDS (KEEP): 64 files, 32 MiB a file, 256 MiB a press, 1 GiB of kept copies a machine (r1327), 10 s a copy, 60 s all. A file
//   past a bound, unreadable, a folder or a device: «cannot keep a copy» (KEEP_WHY) — the confirm names it, the default falls to
//   «the conversation only», and a files press is refused with nothing put back. Nothing is removed early to make room.
//   LINKS (the round wqdnv452s's MUST, over r1304 (ii)): a listed path that IS a link is «cannot keep a copy: a link». A plain write
//   to a link's path lands in its TARGET (the CLI's rewind is read the same way — its binary not read), so the target's bytes would
//   be overwritten while a copy of the link holds none of them. This hub
//   knows a link by its own lstat; a paired machine by its agent's stat answer `link` (an lstat beside the stat) — an agent that
//   does not say it is «cannot keep a copy: upgrade the agent», and the read-back proves the kept copy is not a link either. A path
//   that is a folder or a device: «cannot keep a copy».
//   MODES (r1304 (iii)): the press folder 0700, each kept file 0600 whatever the original's, the original's mode recorded and
//   restored at a put-back — on THIS hub. On a paired machine the agent has no mode action: its mkdir and copy keep their own
//   modes, and the copies are private by the agent's root (~/.vibespace/agentd, made 0700 by the agent).
//   THE TOTAL and THE SWEEP are the MACHINE's: every conversation's press folders on it count toward the 1 GiB, and each keep
//   sweeps them all. A relative or `~` path is «cannot keep a copy» (it would be read against the hub's own folder).
//   THE READ-BACK: on this hub, each kept file's sha256 against the original's, read in the same pass; ON A PAIRED MACHINE by what
//   the existing actions say (r1327): the copy's own success and the kept file's size equal to the original's, both stats after
//   the copy — «checked by size (a paired machine)». A device action that hashes where the bytes are is the step that would make
//   it as strong (named in the kb; not built: it is a device update for a tier that ships dark).
//   LIFE (r1304 (v)): seven days, counted on the machine that holds the copies from the LATER of the mark's own time and the
//   folder's (a clock set back removes nothing early). The sweep removes ONLY a press folder carrying its own mark.
const MiB = 1024 * 1024;
const KEEP = Object.freeze({ maxFiles: 64, fileMax: 32 * MiB, pressMax: 256 * MiB, totalMax: 1024 * MiB, lifeMs: 7 * 24 * 3600 * 1000, copyMs: 10000, allMs: 60000 });
const MARK_KIND = 'vibespace-rewind-kept';
const MARK_FILE = '.vibespace-rewind-kept';
const MANIFEST_FILE = 'manifest.json';
const LINES_FILE = 'lines.json';   // U3: a conversation's kept lines (what was done to its files), beside its press folders
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
// a press's own folder name: `kp-` + the press time (base 36) + 8 hex — the sweep reads ONLY this shape
const PRESS_RE = /^kp-[0-9a-z]{6,12}-[0-9a-f]{8}$/;
// why a file «cannot keep a copy» (the confirm's words each); `kept-full`: the machine's kept copies are full — the oldest leave seven
// days after their press (no door removes them early: the row's remainder)
const KEEP_WHY = Object.freeze(['too-many', 'too-large', 'press-full', 'kept-full', 'unreadable', 'relative-path', 'link', 'folder', 'device', 'no-time', 'not-kept', 'agent-too-old', 'files-not-allowed', 'not-started']);
// a path the keep can name for sure: absolute (posix, or a drive). A relative or `~` path would be read against the HUB's own
// folder — never kept for the person's file
const isAbsPath = (p) => typeof p === 'string' && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p));
// what a put-back does to each path (named BEFORE it does it — r1304 (iv))
const PUT_BACK_ACTS = Object.freeze(['overwrite', 'create', 'remove', 'unchanged', 'refused']);

const pressIdOf = (now, hex8) => (typeof hex8 === 'string' && /^[0-9a-f]{8}$/.test(hex8) ? `kp-${Math.max(0, Math.floor(Number(now) || 0)).toString(36).padStart(6, '0')}-${hex8}` : null);
const keptName = (n) => `${n}.bin`;

/** a file's kind from its mode (S_IFMT): an lstat's (this hub) — or a stat that follows links (a paired machine, whose agent says
 *  `link` beside it) */
function kindOfMode(mode) {
  const t = Number(mode) & 0o170000;
  if (!Number.isFinite(Number(mode)) || t === 0) return 'unknown';
  return t === 0o100000 ? 'file' : t === 0o120000 ? 'link' : t === 0o040000 ? 'folder' : t === 0o020000 || t === 0o060000 ? 'device' : 'other';
}

/** THE PLAN of one keep, from each listed path's facts (in the dry run's order) → {ok, rows, bytes, refusals: [{path, why}]}.
 *  facts: {path, absent: true} | {path, error} | {path, mode, size, mtimeMs, isLink?}. `used`: the bytes of the kept copies already
 *  on that machine. `paired`: the facts are a stat that follows links, and `isLink` is the agent's own lstat (absent: an agent
 *  too old to say it) */
function keepPlanOf(facts, { used = 0, bounds = KEEP, paired = false } = {}) {
  const rows = [], refusals = [];
  let bytes = 0;
  const list = Array.isArray(facts) ? facts : [];
  if (list.length > bounds.maxFiles) refusals.push({ path: null, why: 'too-many' });
  list.slice(0, bounds.maxFiles).forEach((f, n) => {
    const path = f && typeof f.path === 'string' && f.path ? f.path : null;
    if (!path) { refusals.push({ path: null, why: 'unreadable' }); return; }
    if (!isAbsPath(path)) { refusals.push({ path, why: 'relative-path' }); return; }
    if (f.absent === true) { rows.push({ n, path, kind: 'absent', existed: false }); return; }
    if (f.error) { refusals.push({ path, why: 'unreadable' }); return; }
    if (paired && f.isLink === undefined) { refusals.push({ path, why: 'agent-too-old' }); return; }   // its agent cannot say a link
    if (paired && f.isLink !== false && f.isLink !== true) { refusals.push({ path, why: 'unreadable' }); return; }
    const kind = f.isLink === true ? 'link' : kindOfMode(f.mode);
    if (kind === 'link') { refusals.push({ path, why: 'link' }); return; }   // the rewind writes THROUGH it: no copy of a link keeps its bytes
    if (kind === 'folder') { refusals.push({ path, why: 'folder' }); return; }
    if (kind === 'device' || kind === 'other') { refusals.push({ path, why: 'device' }); return; }
    if (kind === 'unknown') { refusals.push({ path, why: 'unreadable' }); return; }
    const size = Number(f.size);
    if (!Number.isFinite(size) || size < 0) { refusals.push({ path, why: 'unreadable' }); return; }
    if (size > bounds.fileMax) { refusals.push({ path, why: 'too-large' }); return; }
    rows.push({ n, path, kind: paired ? 'not-known' : 'file', existed: true, size, mode: Number(f.mode) & 0o7777, mtimeMs: Number(f.mtimeMs) || 0 });
    bytes += size;
  });
  if (bytes > bounds.pressMax) refusals.push({ path: null, why: 'press-full' });
  if (Math.max(0, Number(used) || 0) + bytes > bounds.totalMax) refusals.push({ path: null, why: 'kept-full' });
  return { ok: refusals.length === 0, rows, bytes, refusals };
}

/** THE READ-BACK of a keep → {ok, refusals}: each row's copy as the machine reported it after the copy — this hub: `sha256`
 *  equal to `srcSha256` (read in the same pass); a paired machine: the copy succeeded, its `size` equals the original's
 *  `srcSize`, and NEITHER is a link (`isLink` / `srcIsLink` false: the agent's own lstat), all stated after the copy (r1327) */
function readBackOf(rows, back, { paired = false } = {}) {
  const refusals = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.kind === 'absent') continue;
    const b = back && back[r.n];
    let ok = false;
    if (b && b.ok === true) {
      if (paired) ok = Number.isFinite(b.size) && b.size === r.size && b.srcSize === r.size && b.isLink === false && b.srcIsLink === false;
      else ok = typeof b.sha256 === 'string' && /^[0-9a-f]{64}$/.test(b.sha256) && b.sha256 === b.srcSha256 && b.size === r.size;
    }
    if (!ok) refusals.push({ path: r.path, why: b && b.timedOut ? 'no-time' : b && b.notAllowed ? 'files-not-allowed' : 'not-kept' });
  }
  return { ok: refusals.length === 0, refusals };
}

/** the manifest a press folder holds: what stood at each path, and how its copy was checked */
function manifestOf({ conv, press, at, machine = null, paired = false, rows = [], back = {} } = {}) {
  return {
    v: 1, kind: MARK_KIND, conv: String(conv || ''), press, at, machine, check: paired ? 'size' : 'sha256',
    files: rows.map((r) => {
      const b = back[r.n] || {};
      const out = { n: r.n, path: r.path, kind: r.kind, existed: r.existed };
      if (r.kind === 'absent') return out;
      out.mode = r.mode; out.mtimeMs = r.mtimeMs;
      out.size = r.size;
      if (paired) { out.keptSize = b.size; out.keptMtimeMs = Number(b.mtimeMs) || 0; } else out.sha256 = b.sha256;
      return out;
    }),
  };
}
const markOf = ({ conv, press, at }) => ({ v: 1, kind: MARK_KIND, conv: String(conv || ''), press, at });
/** the bytes the kept copies on a machine hold, from their manifests (an unreadable manifest counts as the press bound: the
 *  bound is never under-counted) */
function usedOf(manifests, { bounds = KEEP } = {}) {
  return (Array.isArray(manifests) ? manifests : []).reduce((sum, m) => sum + (m && Array.isArray(m.files) ? m.files.reduce((s, f) => s + (Number(f.size) > 0 ? Number(f.size) : 0), 0) : bounds.pressMax), 0);
}

/** THE SWEEP (r1304 (v)) → the names to remove: ONLY a folder of the press shape whose mark is its own (this kind, its own press
 *  id) and whose age — counted on the machine that holds it, from the LATER of the mark's time and the folder's own time — is
 *  past the life. An unmarked, foreign or unreadable folder is never touched; a clock set back removes nothing early */
function sweepOf(entries, now, { lifeMs = KEEP.lifeMs } = {}) {
  return (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e.name === 'string' && PRESS_RE.test(e.name) && e.mark && e.mark.kind === MARK_KIND
    && e.mark.press === e.name && Number.isFinite(e.mark.at) && Number.isFinite(e.folderMtimeMs) && Number(now) - Math.max(e.mark.at, e.folderMtimeMs) > lifeMs).map((e) => e.name);
}

/** «PUT MY FILES BACK AS THEY WERE» — what it will do to each path, named BEFORE it does it (r1304 (iv)) → [{n, path, act, why}].
 *  `cur`: {path: what stands there now — {absent: true} | {error} | {mode, size, mtimeMs, isLink?}}; `kept`: {n: the kept copy's own
 *  facts now — this hub {sha256}; a paired machine {size, mtimeMs}}. A row whose kept copy no longer matches its manifest (this
 *  hub: its hash; a paired machine: its size and time) is REFUSED by name; a LINK standing at the path now is refused by name
 *  (`link`: a put-back must not write through it). FILES ONLY: nothing of the conversation */
function putBackPlanOf(manifest, cur = {}, kept = {}) {
  const paired = manifest && manifest.check === 'size';
  return (manifest && Array.isArray(manifest.files) ? manifest.files : []).map((r) => {
    const now = Object.prototype.hasOwnProperty.call(cur, r.path) ? cur[r.path] : null;
    const out = (act, why = null) => ({ n: r.n, path: r.path, act, why });
    if (!now || now.error) return out('refused', 'unreadable');
    if (r.existed === false) return out(now.absent ? 'unchanged' : 'remove');
    const k = kept[r.n];
    if (r.kind !== 'file' && r.kind !== 'not-known') return out('refused', 'kept-changed');   // a manifest row of no kept bytes
    if (paired) { if (!k || k.size !== r.keptSize || Number(k.mtimeMs) !== r.keptMtimeMs) return out('refused', 'kept-changed'); }
    else if (!k || k.sha256 !== r.sha256) return out('refused', 'kept-changed');
    if (now.absent) return out('create');
    // a paired machine (r1854): ONLY an explicit false passes as «not a link» — said true: a link; unsaid: an agent too old; unread
    if (paired && now.isLink !== false) return out('refused', now.isLink === true ? 'link' : now.isLink === undefined ? 'agent-too-old' : 'unreadable');
    const nowKind = now.isLink === true ? 'link' : kindOfMode(now.mode);
    if (nowKind === 'link') return out('refused', 'link');
    if (nowKind === 'folder' || nowKind === 'device' || nowKind === 'other') return out('refused', nowKind === 'folder' ? 'folder' : 'device');
    const same = now.size === r.size && Number(now.mtimeMs) === r.mtimeMs && (Number(now.mode) & 0o7777) === r.mode;
    return out(same ? 'unchanged' : 'overwrite');
  });
}

module.exports = { isAbsPath, KEEP, MARK_KIND, MARK_FILE, MANIFEST_FILE, LINES_FILE, DIR_MODE, FILE_MODE, PRESS_RE, KEEP_WHY, PUT_BACK_ACTS, pressIdOf, keptName, kindOfMode, keepPlanOf, readBackOf, manifestOf, markOf, usedOf, sweepOf, putBackPlanOf };
