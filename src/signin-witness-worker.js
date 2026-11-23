'use strict';
/**
 * THE SIGN-IN WITNESS's NETWORK-HOME WORKER (B-dc3f (1), 主开发 r2780 (2) H1, round wom600meg's must, r3030) — a script of its own:
 * the «signin-witness» pool server.js builds for the plain form runs it. EVERY touch of a network home's witness copy happens
 * HERE, on this worker's own thread (sync fs: a hung mount holds this thread only; the pool's deadline ends it) — never on the
 * hub's loop. Ops (`path` = the home rung's folder, `root` = the root's digest; this worker adds the MACHINE's):
 *   netRead({path, root, maxBytes}) — the copy keyed by the root AND this machine (r3030 (b): two machines installed at one path
 *     on one network home never read each other's). ONE NAME A MACHINE (round wefspq2j3): a machine with a machine id reads, writes
 *     and removes only `signin-<root>-<machine>.json`, never the root-only name — that is the name of a machine with NO readable
 *     machine id (two such machines share it: a limit, said in the kb); no release ever wrote a network copy, so no older copy waits
 *     for an update
 *     → {file, text, shape} | {file, unread} (not a plain file, larger than the bound: r3030 (c)) | {file, none: true}
 *     | {file, code} (the read failed: the copy NAMED with its code — EACCES holds it, ESTALE / EIO… is silence: netAnswerOf)
 *   netWrite({path, root, content, uid}) — the one writer's rung law (r3030 (a)): the folder made 0700 and judged (a symlink, not
 *     a folder, another uid's or open to others ⇒ refused by name), the file 0600 through a temp file renamed over it (the temp
 *     removed on a failure), the folder synced after the rename (best effort: some network filesystems refuse a folder's sync)
 *   netRemove({path, root}) — this machine's copy removed; nothing there is no error
 * An fs error rides with its code (ENOENT, EACCES, ESTALE…); the caller sorts it (src/signin-witness.js netAnswerOf).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parentPort, isMainThread } = require('worker_threads');
const LI = require('./local-index.js');

const nameOf = (root, machine) => `signin-${root}${machine ? '-' + machine : ''}.json`;
let MACHINE = null;
const MACHINE_FILES = ['/etc/machine-id', '/var/lib/dbus/machine-id'];
/** THIS MACHINE's key: the digest of its machine id (stable across reboots; never the host name, which may change) → {key} | {unknown}.
 *  ABSENT (no such file, or no id in it) is «none» (the next file, then '' — the root-only name); a read that FAILED (EACCES, EIO…) is
 *  UNKNOWN (主开发 r3351: never «none», which would look under the root-only name, find nothing and let an empty data folder open while
 *  this machine's own copy stands) — and is NOT kept: the next ask reads again. A key found, or none at all, is kept for the worker's life */
function machineFacts() {
  if (MACHINE !== null) return { key: MACHINE };
  for (const f of MACHINE_FILES) {
    let t;
    try { t = fs.readFileSync(f, 'utf-8'); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) continue; return { key: null, unknown: { file: f, code: String((e && e.code) || 'EUNKNOWN') } }; }
    t = String(t).trim();
    if (/^[0-9a-f]{16,64}$/i.test(t)) return { key: (MACHINE = crypto.createHash('sha256').update(t).digest('hex').slice(0, 12)) };
  }
  return { key: (MACHINE = '') };
}
/** the key, or '' (none — or, for a caller that only names files, unknown: every op below asks machineFacts itself) */
const machineKey = () => machineFacts().key || '';
/** an op on this machine's copy while its key is UNKNOWN: refused by name (never a write or a removal under a guessed name) */
const unknownError = (u) => Object.assign(new Error(`this machine's own id (${u.file}) could not be read (${u.code}), so its sign-in copy cannot be named`), { code: 'EMACHINEID' });
// this machine's ONE name in the home folder (round wefspq2j3: the root-only name is a machine-id-less machine's, never touched by one with
// an id): each op below names it from machineFacts — an UNKNOWN key names nothing (r3351)

const OPS = {
  netRead({ path: dir, root, maxBytes = 4096 }) {
    const m = machineFacts();
    if (m.unknown) return { result: { machineUnknown: m.unknown } };   // r3351: unknown is no answer (the hub asks again: the next look reads the id again)
    const file = path.join(dir, nameOf(root, m.key)), shape = m.key ? 'machine' : 'root';
    const failed = (e) => ({ result: { file, code: String((e && e.code) || 'EUNKNOWN'), message: String((e && e.message) || e).slice(0, 200) } });
    let st;
    try { st = fs.lstatSync(file); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return { result: { file, none: true } }; return failed(e); }
    if (!st.isFile()) return { result: { file, unread: 'it is not a plain file' } };
    if (st.size > maxBytes) return { result: { file, unread: `it is larger than ${maxBytes} bytes` } };
    let text; try { text = fs.readFileSync(file, 'utf-8'); } catch (e) { return failed(e); }
    return { result: { file, text, shape } };
  },
  netWrite({ path: dir, root, content, uid = null }) {
    const m = machineFacts();
    if (m.unknown) throw unknownError(m.unknown);
    const file = path.join(dir, nameOf(root, m.key));
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const st = fs.lstatSync(dir);
    const law = LI.rungFolderOf({ exists: true, symlink: st.isSymbolicLink(), dir: st.isDirectory(), uid: st.uid, mode: st.mode & 0o7777 }, { uid, dir });
    if (!law.ok) throw Object.assign(new Error(law.why), { code: 'EWITNESSFOLDER' });
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    try {
      const fd = fs.openSync(tmp, 'wx', 0o600);
      try { fs.writeSync(fd, String(content)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, file);
    } catch (e) { try { fs.unlinkSync(tmp); } catch { /* not made */ } throw e; }
    // the folder synced after the rename, best effort: some network filesystems refuse a folder's sync — the copy is renamed in all the same
    let d = null, note = null;
    try { d = fs.openSync(dir, 'r'); fs.fsyncSync(d); } catch (e) { note = `the folder was not synced (${(e && e.code) || e})`; }
    if (d !== null) { try { fs.closeSync(d); } catch (e) { note = `the folder's handle did not close (${(e && e.code) || e})`; } }
    return { result: { file, ...(note ? { note } : {}) } };
  },
  netRemove({ path: dir, root }) {
    const m = machineFacts();
    if (m.unknown) throw unknownError(m.unknown);
    const file = path.join(dir, nameOf(root, m.key));
    try { fs.unlinkSync(file); } catch (e) { if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR')) throw e; }
    return { result: { file } };
  },
};
function runOp(op, payload = {}) {
  const fn = OPS[op];
  if (!fn) throw new Error('unknown witness op: ' + op);
  return fn(payload || {});
}

if (!isMainThread && parentPort) {
  const { answerMemory } = require('./worker-memory.js');
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return;   // the memory census (src/worker-memory.js)
    const { id, op, payload } = msg || {};
    try { parentPort.postMessage({ id, ok: true, result: runOp(op, payload).result }); } catch (e) { parentPort.postMessage({ id, ok: false, error: { message: e && e.message, code: e && e.code } }); }
  });
}

module.exports = { runOp, machineKey, machineFacts, nameOf, MACHINE_FILES };
