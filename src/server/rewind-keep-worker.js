'use strict';
/**
 * THE KEPT COPY'S WORKER (row B-437e, the files tier — 主开发 r1247 (2), r1304; lane lg-rewind, 2026-11-21): this hub's side of
 * the kept copy, run ONLY on the «rewind-keep» SafeFs pool of src/server/rewind-kept-door.js — a storage that hangs ends this
 * worker at its deadline, never the hub's loop. The decisions are src/rewind-kept.js (PURE); here are only the file acts:
 *   facts      each listed path's lstat (never followed: a link says so by its mode and is never kept); absent / unreadable said
 *   open       the press folder (0700) and its own MARK (0600), written FIRST — a keep cut short leaves a folder the sweep may
 *              take after its seven days (never an unmarked one that would count forever)
 *   keepOne    ONE file into the press folder: its bytes read ONCE, hashed, written 0600 (never over an existing name), read back
 *              and hashed again; a path that is no longer a regular file is refused
 *   seal       the manifest (0600), written last by a temp name renamed over (never torn) — a press with no manifest is never put back
 *   list       the press folders of one conversation's kept folder: their marks, manifests, kept bytes and the folder's own time
 *   listAll    every conversation's press folders under data/rewind-kept (the 1 GiB and the sweep are the MACHINE's)
 *   removePress one press folder, only of the press shape AND carrying its own mark
 *   discard    a keep that failed: its press folder, only when it holds NO manifest (never sealed)
 *   dropTmp    a put-back's temp name left by a cut-short act (`<path>.<press>.vs-tmp` only)
 *   keptFacts  each kept copy's hash — the put-back's check that it is what the manifest says
 *   putOne     ONE path put back: the kept copy to a temp name beside it (the press id in it), its mode restored, then renamed
 *              over the path; a path that did not exist then is removed; the temp removed on any failure
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parentPort, isMainThread } = require('worker_threads');
const K = require('../rewind-kept.js');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const inPress = (dir) => typeof dir === 'string' && path.isAbsolute(dir) && K.PRESS_RE.test(path.basename(dir));

const OPS = {
  facts({ paths = [] } = {}) {
    return paths.map((p) => {
      try {
        const st = fs.lstatSync(p);
        return { path: p, mode: st.mode, size: st.size, mtimeMs: st.mtimeMs };   // an lstat: a link says so by its mode (never kept)
      } catch (e) { return e && e.code === 'ENOENT' ? { path: p, absent: true } : { path: p, error: String((e && e.code) || e) }; }
    });
  },
  open({ dir, mark } = {}) {
    if (!inPress(dir) || !mark || mark.press !== path.basename(dir)) throw Object.assign(new Error('not a press folder'), { code: 'EBADPRESS' });
    fs.mkdirSync(dir, { recursive: true, mode: K.DIR_MODE });
    fs.chmodSync(dir, K.DIR_MODE);
    fs.writeFileSync(path.join(dir, K.MARK_FILE), JSON.stringify(mark), { mode: K.FILE_MODE, flag: 'wx' });
    return { ok: true };
  },
  keepOne({ dir, row } = {}) {
    if (!inPress(dir) || !row || typeof row.path !== 'string') throw Object.assign(new Error('not a press folder'), { code: 'EBADPRESS' });
    fs.mkdirSync(dir, { recursive: true, mode: K.DIR_MODE });
    fs.chmodSync(dir, K.DIR_MODE);
    const dest = path.join(dir, K.keptName(row.n));
    const st = fs.lstatSync(row.path);   // still a file — a link put there since the plan is refused, never followed
    if (!st.isFile() || st.size > K.KEEP.fileMax) throw Object.assign(new Error('not a file within the bound'), { code: 'ENOTKEPT' });
    const buf = fs.readFileSync(row.path);
    fs.writeFileSync(dest, buf, { mode: K.FILE_MODE, flag: 'wx' });
    fs.chmodSync(dest, K.FILE_MODE);
    const back = fs.readFileSync(dest);
    return { ok: true, srcSha256: sha(buf), sha256: sha(back), size: back.length };
  },
  seal({ dir, manifest } = {}) {   // by a temp name renamed over (the round's should: a torn manifest left the press unreachable)
    if (!inPress(dir) || !fs.existsSync(path.join(dir, K.MARK_FILE))) throw Object.assign(new Error('not an open press folder'), { code: 'EBADPRESS' });
    const to = path.join(dir, K.MANIFEST_FILE), tmp = to + '.tmp';
    if (fs.existsSync(to)) throw Object.assign(new Error('sealed already'), { code: 'EEXIST' });
    fs.writeFileSync(tmp, JSON.stringify(manifest), { mode: K.FILE_MODE, flag: 'wx' });   // a temp a cut-short seal left: refused (the keep then discards its folder)
    const fd = fs.openSync(tmp, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }   // its bytes on disk BEFORE the name points at them (test-temp-rename-census)
    fs.renameSync(tmp, to);
    return { ok: true };
  },
  list({ root } = {}) {
    let names = [];
    try { names = fs.readdirSync(root); } catch (e) { if (e && e.code === 'ENOENT') return []; throw e; }
    return names.filter((n) => K.PRESS_RE.test(n)).map((name) => {
      const d = path.join(root, name);
      const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch { return null; } };
      let folderMtimeMs = null, kept = 0;
      try { folderMtimeMs = fs.lstatSync(d).mtimeMs; } catch { }
      try { for (const f of fs.readdirSync(d)) if (/^\d+\.bin$/.test(f)) { const st = fs.lstatSync(path.join(d, f)); if (st.isFile()) kept += st.size; } } catch { }
      return { name, mark: read(K.MARK_FILE), manifest: read(K.MANIFEST_FILE), folderMtimeMs, kept };
    });
  },
  listAll({ base, max = 5000 } = {}) {
    let convs = [];
    try { convs = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).slice(0, max); } catch (e) { if (e && e.code === 'ENOENT') return []; throw e; }
    const out = [];
    for (const c of convs) for (const e of OPS.list({ root: path.join(base, c.name) })) out.push({ ...e, conv: c.name });   // base = data/rewind-kept
    return out;
  },
  removePress({ root, name } = {}) {
    if (typeof name !== 'string' || !K.PRESS_RE.test(name)) return { ok: false, why: 'not-a-press' };
    const d = path.join(root, name);
    let mark = null;
    try { mark = JSON.parse(fs.readFileSync(path.join(d, K.MARK_FILE), 'utf8')); } catch { }
    if (!mark || mark.kind !== K.MARK_KIND || mark.press !== name) return { ok: false, why: 'no-mark' };
    fs.rmSync(d, { recursive: true, force: true });
    return { ok: true };
  },
  discard({ dir } = {}) {   // a keep that failed: its press folder, never sealed (no manifest), is removed — a sealed one never is
    if (!inPress(dir)) return { ok: false, why: 'not-a-press' };
    if (fs.existsSync(path.join(dir, K.MANIFEST_FILE))) return { ok: false, why: 'sealed' };
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true };
  },
  dropTmp({ file } = {}) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || !/\.kp-[0-9a-z]{6,12}-[0-9a-f]{8}\.vs-tmp$/.test(file)) return { ok: false, why: 'not-a-tmp' };
    try { fs.unlinkSync(file); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
    return { ok: true };
  },
  keptFacts({ dir, rows = [] } = {}) {
    const out = {};
    for (const r of rows) {
      const f = path.join(dir, K.keptName(r.n));
      try { if (r.kind !== 'absent') out[r.n] = { sha256: sha(fs.readFileSync(f)) }; } catch { out[r.n] = null; }
    }
    return out;
  },
  putOne({ dir, row, act, press } = {}) {
    if (!inPress(dir) || !row || typeof row.path !== 'string' || !K.PRESS_RE.test(String(press || ''))) throw Object.assign(new Error('not a press folder'), { code: 'EBADPRESS' });
    if (act === 'remove') { const st = fs.lstatSync(row.path); if (st.isDirectory()) throw Object.assign(new Error('a folder'), { code: 'EISDIR' }); fs.unlinkSync(row.path); return { ok: true }; }
    if (act !== 'overwrite' && act !== 'create') return { ok: true, skipped: act };
    const tmp = `${row.path}.${press}.vs-tmp`;
    try { fs.unlinkSync(tmp); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }   // a temp a cut-short act left goes FIRST
    try {
      fs.copyFileSync(path.join(dir, K.keptName(row.n)), tmp, fs.constants.COPYFILE_EXCL); fs.chmodSync(tmp, Number(row.mode) & 0o7777);
      const fd = fs.openSync(tmp, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }   // the person's bytes on disk BEFORE the name points at them; a failed sync fails the act
      fs.renameSync(tmp, row.path);
      return { ok: true };
    } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
  },
};

function runOp(op, payload = {}) {
  const fn = OPS[op];
  if (!fn) throw Object.assign(new Error('unknown rewind-keep op: ' + op), { code: 'EBADOP' });
  return { result: fn(payload) };
}

if (!isMainThread && parentPort) {
  const { answerMemory } = require('../worker-memory.js');
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
    const { id, op, payload } = msg || {};
    try { parentPort.postMessage({ id, ok: true, result: runOp(op, payload).result }); }
    catch (e) { parentPort.postMessage({ id, ok: false, error: { message: e.message, code: e.code } }); }
  });
}

module.exports = { runOp };
