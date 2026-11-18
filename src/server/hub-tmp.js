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
  return why ? { dir: null, why: `${why} — this hub never uses a temp folder that is not its own` } : { dir: path.join(root, purpose) };
}

/** A multer disk storage whose destination is this hub's own `purpose` folder; a refusal becomes the request's error BY NAME. */
function hubTmpStorage(multer, purpose, opts) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      hubTmpDir(purpose, opts).then((r) => (r.dir ? cb(null, r.dir) : cb(Object.assign(new Error(`${purpose}: ${r.why}`), { status: 500, code: 'hub_tmp_refused' }))), (e) => cb(e));
    },
  });
}

module.exports = { hubTmpRoot, ownVerdict, hubTmpDir, hubTmpStorage };
