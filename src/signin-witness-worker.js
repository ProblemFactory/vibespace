'use strict';
/**
 * THE SIGN-IN WITNESS's NETWORK-HOME WORKER (B-dc3f (1), 主开发 r2780 (2) H1, round wom600meg's must, r3030) — a script of its own:
 * the «signin-witness» pool server.js builds for the plain form runs it. EVERY touch of a network home's witness copy happens
 * HERE, on this worker's own thread (sync fs: a hung mount holds this thread only; the pool's deadline ends it) — never on the
 * hub's loop. Ops (`path` = the home rung's folder, `root` = the root's digest; this worker adds the MACHINE's):
 *   netRead({path, root, maxBytes}) — the copy keyed by the root AND this machine (r3030 (b): two machines installed at one path
 *     on one network home never read each other's); none there ⇒ the OLDER shape (the root alone) read once as this machine's
 *     → {file, text, shape} | {file, unread} (not a plain file, larger than the bound: r3030 (c)) | {file, none: true}
 *     | {file, code} (the read failed: the copy NAMED with its code — EACCES holds it, ESTALE / EIO… is silence: netAnswerOf)
 *   netWrite({path, root, content, uid}) — the one writer's rung law (r3030 (a)): the folder made 0700 and judged (a symlink, not
 *     a folder, another uid's or open to others ⇒ refused by name), the file 0600 through a temp file renamed over it (the temp
 *     removed on a failure); an older-shape copy removed once the machine's is there (the update: read once, then rewritten)
 *   netRemove({path, root}) — both shapes removed; nothing there is no error
 * An fs error rides with its code (ENOENT, EACCES, ESTALE…); the caller sorts it (src/signin-witness.js netAnswerOf).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parentPort, isMainThread } = require('worker_threads');
const LI = require('./local-index.js');

const nameOf = (root, machine) => `signin-${root}${machine ? '-' + machine : ''}.json`;
let MACHINE = null;
/** THIS MACHINE's key: the digest of its machine id (stable across reboots; never the host name, which may change) — none ⇒ '' */
function machineKey() {
  if (MACHINE !== null) return MACHINE;
  for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
    try { const t = fs.readFileSync(f, 'utf-8').trim(); if (/^[0-9a-f]{16,64}$/i.test(t)) return (MACHINE = crypto.createHash('sha256').update(t).digest('hex').slice(0, 12)); } catch { /* the next */ }
  }
  return (MACHINE = '');
}
const filesOf = (dir, root) => { const m = machineKey(); return m ? [path.join(dir, nameOf(root, m)), path.join(dir, nameOf(root, ''))] : [path.join(dir, nameOf(root, ''))]; };

const OPS = {
  netRead({ path: dir, root, maxBytes = 4096 }) {
    const files = filesOf(dir, root);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let st;
      const failed = (e) => ({ result: { file, code: String((e && e.code) || 'EUNKNOWN'), message: String((e && e.message) || e).slice(0, 200) } });
      try { st = fs.lstatSync(file); } catch (e) { if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) continue; return failed(e); }
      if (!st.isFile()) return { result: { file, unread: 'it is not a plain file' } };
      if (st.size > maxBytes) return { result: { file, unread: `it is larger than ${maxBytes} bytes` } };
      let text; try { text = fs.readFileSync(file, 'utf-8'); } catch (e) { return failed(e); }
      return { result: { file, text, shape: i === 0 && files.length === 2 ? 'machine' : 'older' } };
    }
    return { result: { file: files[0], none: true } };
  },
  netWrite({ path: dir, root, content, uid = null }) {
    const [file, older] = filesOf(dir, root);
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
    if (older) { try { fs.unlinkSync(older); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; } }
    return { result: { file } };
  },
  netRemove({ path: dir, root }) {
    const files = filesOf(dir, root);
    for (const f of files) { try { fs.unlinkSync(f); } catch (e) { if (!e || (e.code !== 'ENOENT' && e.code !== 'ENOTDIR')) throw e; } }
    return { result: { files } };
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

module.exports = { runOp, machineKey, nameOf };
