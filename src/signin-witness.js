'use strict';
/**
 * B-dc3f (1) — A DATA FOLDER THAT IS NOT THE ONE AT THE START (主开发 r1772 / r1784, shape A + the opt-in declaration C).
 *
 * The data folder is fixed at <root>/data and git TRACKS data/bin, so «the folder is missing» can only mean «this is not the
 * folder the sign-in was set in»: a mount point whose mount is not there yet, a link to nowhere, a moved or replaced folder.
 * Today each reads data/auth.json as missing: a new instance, every door open, and the first sign-in written lays a new
 * table where the real one will return. The evidence comes in TWO HALVES:
 *   · THE FOLDER's OWN ID, inside it — data/instance.json {v, id, createdAt}, written once (the first start that finds none),
 *     never rewritten, never removed by the hub, never carried by the config export (a whole folder copied keeps it);
 *   · THE WITNESS, outside it — signin-<digest(root)>.json in the person's CLI index place, on its PERSISTENT rungs only
 *     (the home rung, or the var-tmp rung when the home is a network mount; never the RAM rung, never a throwaway hub's own
 *     root): {v, root, dataDir, id, setAt} — a fact and the folder's path, never a credential, never an address.
 * THE HOLD (only when the sign-in file is truly missing): a data folder that is a link to nothing; a witness whose id the
 * folder does not hold (no id file, or another id); a witness that is THERE and cannot be read (主开发 r2152 (a): a missing one
 * is «none», every other read is a hold). A folder that MOVES with its id file is the same folder (never held). BOTH persistent
 * places are read at a start (r2152 (b)); every copy found is kept and refreshed where it can be written (r2269), and
 * the witness is written again at each start (r2152 (c)).
 * THE DECLARATION (opt-in, set nowhere by default): VIBESPACE_SIGNIN=required — no password set, no single sign-on ⇒ held.
 * The threat is a MISTAKE (a late mount, a moved path), never an attacker on the machine. PURE but for the start's reads
 * (`startFactsSync`, the same moment the shipped code reads data/auth.json) and the one writer (`writeWitness` /
 * `removeWitness`, through replaceShredding: atomic, 0600, never through a link).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const LI = require('./local-index.js');
const { replaceShredding } = require('./secret-file.js');

const V = 1;
const INSTANCE_FILE = 'instance.json';
const ID_RE = /^vi-[0-9a-f]{12}$/;
const { DECLARE_ENV } = require('./signin-table.js');   // the declaration's name — ONE spelling, in the table's shared law
const KINDS = Object.freeze(['folder', 'link', 'declared']);
/** the CLI index's own digest of a root (src/server/local-index.js digestOf): one witness per installed root */
const digestOf = (root) => crypto.createHash('sha256').update(String(root || '')).digest('hex').slice(0, 12);
const witnessFileOf = (root) => `signin-${digestOf(root)}.json`;
const isAbs = (p) => typeof p === 'string' && p.startsWith('/');

/** data/instance.json's text → {id, createdAt} | null (a damaged or foreign file is no id) */
function instanceOf(text) {
  let o = null;
  try { o = JSON.parse(String(text)); } catch { return null; }
  return o && typeof o === 'object' && !Array.isArray(o) && ID_RE.test(o.id) ? { id: o.id, createdAt: Number(o.createdAt) || null } : null;
}
function newInstance({ randomBytes = crypto.randomBytes, now = Date.now } = {}) { return { v: V, id: 'vi-' + randomBytes(6).toString('hex'), createdAt: now() }; }
/** the witness's text → its doc when it is THIS root's and THIS folder's, else null (another root's file is no witness here) */
function witnessOf(text, { root, dataDir } = {}) {
  let o = null;
  try { o = JSON.parse(String(text)); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== V || !ID_RE.test(o.id)) return null;
  if (o.root !== root || o.dataDir !== dataDir) return null;
  return { v: V, root: o.root, dataDir: o.dataDir, id: o.id, setAt: Number(o.setAt) || null };
}
/** the witness's doc: FOUR facts (and its version) — nothing else is ever written */
const witnessDoc = ({ root, dataDir, id, now = Date.now }) => ({ v: V, root, dataDir, id, setAt: now() });

/**
 * THE WITNESS's PLACE (law 4): the person's CLI index ladder (LI.indexPlaceOf — the one the CLI uses), its PERSISTENT rungs
 * only. A throwaway or test hub (`throwaway` = THE ONE TEST's answer, src/server/throwaway-root.js) takes its own-root rung there — inside its data
 * folder — so it keeps no witness and reads none of the person's place. → {dir, via, why} | {dir: null, why}
 */
function placeOf({ root, home = '', uid = null, mountinfo = '', xdgRuntimeDir = '', varTmp = undefined, throwaway = false, lstat = null, readlink = null, facts = null } = {}) {   // varTmp: the ladder's own default
  if (throwaway) return { dir: null, why: `a ${throwaway} hub keeps no sign-in witness and reads none of the person's place` };
  const p = LI.indexPlaceOf({ home, uid, mountinfo, xdgRuntimeDir, varTmp, own: null, lstat, readlink, facts });
  if (!p.dir) return { dir: null, why: p.why };
  if (p.via !== 'home' && p.via !== 'var-tmp') return { dir: null, why: `the only place left is ${p.dir} (${p.via}): it does not outlive a restart, so no witness is kept` };
  return { dir: p.dir, via: p.via, why: p.why };
}

/**
 * THE PLACES READ at a start (主开发 r2152 (b)): the ladder's two persistent rungs, each asked on its own, so a witness written in
 * one is found from the other (a home mount late at this start, a rung refused then allowed). The ladder's own judgement of each:
 * a rung that lands on a network mount or loops is never read; for a READ a folder open to others is still the person's own
 * (a symlink someone made, another uid's folder: never read). A throwaway hub reads none. → [dir]
 */
function readPlacesOf({ home = '', uid = null, mountinfo = '', varTmp = undefined, throwaway = false, lstat = null, readlink = null, facts = null } = {}) {
  if (throwaway) return [];
  const readFacts = typeof facts === 'function' ? (p) => { const f = facts(p); return f && f.exists && Number.isInteger(f.mode) ? { ...f, mode: f.mode & ~0o077 } : f; } : facts;
  const ask = (h) => LI.indexPlaceOf({ home: h, uid, mountinfo, xdgRuntimeDir: '', varTmp, own: null, lstat, readlink, facts: readFacts });
  const out = [], h = ask(home), v = ask('');
  if (h.dir && h.via === 'home') out.push(h.dir);
  if (v.dir && v.via === 'var-tmp') out.push(v.dir);
  return out;
}
/** ONE witness file read (主开发 r2152 (a)): nothing there ⇒ null («none»); THERE and unreadable (a read error, a text that is
 *  not this root's folder's witness) ⇒ {file, unread} — it holds, never «none»; else {file, doc} */
function witnessAt(file, { root, dataDir }) {
  let text;
  try { text = fs.readFileSync(file, 'utf-8'); } catch (e) { return e && (e.code === 'ENOENT' || e.code === 'ENOTDIR') ? null : { file, unread: `it cannot be read (${(e && e.code) || 'an error'})` }; }
  const doc = witnessOf(text, { root, dataDir });
  return doc ? { file, doc } : { file, unread: 'its text is not this folder\'s witness' };
}

/**
 * THE VERDICT (PURE). `auth` = 'present' | 'missing' (truly: nothing at the path) | 'held' (the shipped hold);
 * `dataLink` = 'dangling' | null; `instance` = {id} | null; `found` = the witness files read ([{file, doc} | {file, unread}],
 * both places) — or, for a PURE ask, `witness` = this root's doc | null.
 * → {hold: null | {kind, why, files, unread?}}: `files` = every witness file there, so the act that leaves a hold names them
 * ALL (主开发 r2152: a link hold with a witness is left by deleting the witness too). Only a truly missing sign-in file can be
 * held here: a file that is there decides by itself.
 */
function verdictOf({ auth = 'present', dataLink = null, instance = null, witness = null, found = null, dataDir = '' } = {}) {
  if (auth !== 'missing') return { hold: null };
  const all = Array.isArray(found) ? found : (witness ? [{ file: null, doc: witness }] : []);
  const files = all.map((w) => w.file).filter(Boolean);
  if (dataLink === 'dangling') return { hold: { kind: 'link', why: `the data folder ${dataDir} is a link to a place that is not there`, files } };
  const unread = all.find((w) => w.unread);
  if (unread) return { hold: { kind: 'folder', unread: true, why: `the sign-in witness ${unread.file} is there but ${unread.unread}, so it cannot be known whether the data folder ${dataDir} is the one its sign-in was set in`, files } };
  const other = all.find((w) => w.doc && (!instance || instance.id !== w.doc.id));
  if (other) {
    return { hold: { kind: 'folder', why: `the data folder ${dataDir} is not the one this instance's sign-in was set in (${instance ? `it holds the id ${instance.id}, the sign-in was set in ${other.doc.id}` : `it holds no id; the sign-in was set in ${other.doc.id}`})`, files } };
  }
  return { hold: null };
}
/** THE DECLARATION (opt-in): `VIBESPACE_SIGNIN=required` and no password, no env password, no single sign-on ⇒ held */
const declaredOf = (env) => !!env && String(env[DECLARE_ENV] || '').trim().toLowerCase() === 'required';

/**
 * THE START's FACTS — read once, beside the shipped read of data/auth.json: the folder (a link to nothing?), its id file, the
 * witness's place and the witness. `throwaway` = THE ONE TEST's answer (src/server/throwaway-root.js, asked by server.js at the
 * boot): UNSAID ⇒ throwaway (no witness read or written) — the person's place is touched only for a hub said to be installed.
 */
function startFactsSync({ dataDir, root = path.dirname(dataDir), home = os.homedir(), uid = typeof process.getuid === 'function' ? process.getuid() : null, env = process.env, mountinfo = null, xdgRuntimeDir = env.XDG_RUNTIME_DIR || '', varTmp = undefined, throwaway = 'unsaid' } = {}) {
  let dataLink = null;
  try { if (fs.lstatSync(dataDir).isSymbolicLink()) { try { fs.statSync(dataDir); } catch (e) { if (e && e.code === 'ENOENT') dataLink = 'dangling'; } } } catch { }
  let instance = null;
  try { instance = instanceOf(fs.readFileSync(path.join(dataDir, INSTANCE_FILE), 'utf-8')); } catch { instance = null; }
  const tw = throwaway;
  const mi = mountinfo != null ? mountinfo : (() => { try { return fs.readFileSync('/proc/self/mountinfo', 'utf-8'); } catch { return ''; } })();
  const lstat = (p) => { try { return { symlink: fs.lstatSync(p).isSymbolicLink() }; } catch (e) { if (e && e.code === 'ENOENT') return null; throw e; } };
  const facts = (p) => { try { const st = fs.lstatSync(p); return { exists: true, symlink: st.isSymbolicLink(), dir: st.isDirectory(), uid: st.uid, mode: st.mode & 0o7777 }; } catch { return { exists: false }; } };
  const ask = { root, home, uid, mountinfo: mi, xdgRuntimeDir, varTmp, throwaway: tw, lstat, readlink: (p) => fs.readlinkSync(p), facts };
  const place = placeOf(ask);
  const file = place.dir ? path.join(place.dir, witnessFileOf(root)) : null;   // where the one writer writes
  // r2152 (b): both read; r2436 (3): each copy says whether its folder takes a WRITE (the rung law, unmasked) — a folder the read
  // allows and the write refuses keeps its copy as it is (read, and named by the act), never rewritten nor warned about at each start
  const found = readPlacesOf(ask).map((d) => witnessAt(path.join(d, witnessFileOf(root)), { root, dataDir })).filter(Boolean)
    .map((w) => ({ ...w, writable: LI.rungFolderOf(facts(path.dirname(w.file)), { uid, dir: path.dirname(w.file) }).ok }));
  const own = found.find((w) => w.file === file && w.doc) || found.find((w) => w.doc);
  return { root, dataDir, dataLink, instance, throwaway: tw, place, file, witness: own ? own.doc : null, found, declared: declaredOf(env), uid };
}

/** data/instance.json, written ONCE (a start that finds none and is not held) → the id */
function ensureInstance(dataDir, current) {
  if (current && current.id) return current;
  const doc = newInstance();
  replaceShredding(path.join(dataDir, INSTANCE_FILE), JSON.stringify(doc));
  return { id: doc.id, createdAt: doc.createdAt };
}
/** THE ONE WRITER's two acts: the witness written (its 0700 folder made) or removed. Throws; the caller says it once. */
function writeWitness({ place, file, root, dataDir, id, uid = null }) {
  if (!place || !place.dir || !file || !id) return false;
  fs.mkdirSync(place.dir, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(place.dir);
  const law = LI.rungFolderOf({ exists: true, symlink: st.isSymbolicLink(), dir: st.isDirectory(), uid: st.uid, mode: st.mode & 0o7777 }, { uid, dir: place.dir });
  if (!law.ok) throw new Error(law.why);
  replaceShredding(file, JSON.stringify(witnessDoc({ root, dataDir, id })));
  return true;
}
function removeWitness({ file }) {
  if (!file) return false;
  try { fs.unlinkSync(file); return true; } catch (e) { if (e && e.code === 'ENOENT') return false; throw e; }
}

module.exports = { V, INSTANCE_FILE, ID_RE, DECLARE_ENV, KINDS, digestOf, witnessFileOf, instanceOf, newInstance, witnessOf, witnessDoc, placeOf, readPlacesOf, witnessAt, verdictOf, declaredOf, startFactsSync, ensureInstance, writeWitness, removeWitness };
