'use strict';
// THE HUB'S OWN TEMP FOLDERS (B-3767, lane bl-scratch, 2026-11-18). The hub wrote FIXED machine-wide folders under the temp
// folder (/tmp/claude-webui-uploads, <tmp>/vibespace-plugin-uploads, /tmp/claude-webui): on a machine where another user's
// hub had made them first, every upload of the second user failed with EACCES (the second test machine's proof run), and
// two hubs of one user shared each other's. THE LAW: every folder the hub makes under the temp folder is ITS OWN — keyed by
// its user and its data folder (`<tmp>/vibespace-<uid>-<8 hex of the data folder>/<purpose>`), made 0700, and judged before
// use (not a link, a folder, this user's, no group/other bits — sock-path.socketDirVerdict, the ONE folder verdict); where it
// cannot be made or used, the refusal says the path and why — never a silent failure. Two users' hubs never meet a name (the
// uid is in it); a name another user planted ON PURPOSE is refused, not worked around (the owner's rule: guard against
// mistakes, not a deliberate act). test-architecture §110 holds every other name the product makes there. Async only.
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const SOCK = require('../sock-path.js');

const myUid = () => (typeof process.getuid === 'function' ? process.getuid() : null);

/** PURE: this hub's folder under the temp root — the user and the data folder name it (two hubs never meet). */
function hubTmpRoot({ dataDir, tmpRoot = os.tmpdir(), uid = myUid() } = {}) {
  const key = crypto.createHash('sha256').update(path.resolve(String(dataDir || '.'))).digest('hex').slice(0, 8);
  return path.join(tmpRoot, `vibespace-${uid == null ? 'u' : uid}-${key}`);
}

/** PURE: may this process use the folder whose lstat is `st` as its own? → null (yes) | the reason it may not
 *  (src/sock-path.js socketDirVerdict: a directory, not a link, this uid's, no group/other bits). */
function ownVerdict(st, { uid = myUid() } = {}) {
  const v = SOCK.socketDirVerdict(st, uid);
  return v.ok ? null : String(v.why).split(' — a socket')[0]; // the verdict's socket aside is not this folder's
}

/** Make (if missing) and judge each folder of `chain`, outermost first → null (all ours) | the path and the reason. */
async function ownChain(chain, { uid, fs }) {
  for (const d of chain) {
    try { await fs.mkdir(d, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') return `${d} could not be made (${e.code || e.message})`; }
    let st = null; try { st = await fs.lstat(d); } catch (e) { return `${d} could not be read (${e.code || e.message})`; }
    const why = ownVerdict(st, { uid });
    if (why) return `${d}: ${why}`;
  }
  return null;
}
/** ORCH: make (if missing) and judge `<hubTmpRoot>/<purpose>` → { dir } | { dir: null, why } (the path and the reason). */
async function hubTmpDir(purpose, { dataDir, tmpRoot = os.tmpdir(), uid = myUid(), fs = fsp } = {}) {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(String(purpose))) throw new Error(`hub-tmp: bad purpose ${JSON.stringify(purpose)}`);
  const root = hubTmpRoot({ dataDir, tmpRoot, uid });
  const why = await ownChain([root, path.join(root, purpose)], { uid, fs });
  // B-3767 follow-up (主开发 11:37Z): the refusal names the way out, not only the path and the reason
  return why ? { dir: null, why: `${why} — this hub never uses a temp folder that is not its own (the way out: remove that folder if this hub did not make it, or start the hub with TMPDIR set to a private folder)` } : { dir: path.join(root, purpose) };
}

/** A multer disk storage whose destination is this hub's own `purpose` folder; a refusal becomes the request's error BY NAME. */
function hubTmpStorage(multer, purpose, opts) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      hubTmpDir(purpose, opts).then((r) => (r.dir ? cb(null, r.dir) : cb(Object.assign(new Error(`${purpose}: ${r.why}`), { status: 500, code: 'hub_tmp_refused' }))), (e) => cb(e));
    },
  });
}

/** The purposes this hub makes under its own root — the ones the sweep may judge (B-3767 unit 2, B-4371). */
const SWEPT_PURPOSES = Object.freeze(['uploads', 'editor', 'paste', 'plugin-uploads']);
/** ORCH (B-3767 unit 2, 主开发 11:40Z — B-4371): THE TREE'S AGE SWEEP OVER THE HUB'S OWN TEMP ROOT. A multer file of a hub killed
 *  mid-upload, an «open in editor» file whose tab closed without its delete, a paste nobody asked for again: each stayed until the
 *  temp folder itself was cleaned. The sweep stays INSIDE this hub's own root: the root and each purpose folder are judged first
 *  (ownVerdict — a folder that is not ours is skipped and said, never entered); in them a plain file (or a link, removed as a link,
 *  never followed) older than `maxAgeMs` is removed; anything else is kept. Never a name pattern over the shared temp folder.
 *  Async, at most `max` removals a pass. → { removed: [path], kept: n, refused: [why] } */
async function sweepHubTmp({ dataDir, tmpRoot = os.tmpdir(), uid = myUid(), fs = fsp, now = Date.now(), maxAgeMs = 24 * 3600 * 1000, max = 500 } = {}) {
  const root = hubTmpRoot({ dataDir, tmpRoot, uid });
  const out = { removed: [], kept: 0, refused: [] };
  const own = async (d) => { let st = null; try { st = await fs.lstat(d); } catch { return false; } const why = ownVerdict(st, { uid }); if (why) out.refused.push(`${d}: ${why}`); return !why; };
  if (!(await own(root))) return out;   // no root yet, or not ours: nothing of ours to sweep
  for (const purpose of SWEPT_PURPOSES) {
    const d = path.join(root, purpose);
    if (!(await own(d))) continue;
    let names = []; try { names = await fs.readdir(d); } catch { continue; }
    for (const n of names) {
      if (out.removed.length >= max) return out;
      const f = path.join(d, n);
      let st = null; try { st = await fs.lstat(f); } catch { continue; }
      if (!(st.isFile() || st.isSymbolicLink()) || now - st.mtimeMs < maxAgeMs) { out.kept++; continue; }
      try { await fs.unlink(f); out.removed.push(f); } catch { out.kept++; }
    }
  }
  return out;
}

module.exports = { hubTmpRoot, ownVerdict, hubTmpDir, hubTmpStorage, sweepHubTmp, SWEPT_PURPOSES };
