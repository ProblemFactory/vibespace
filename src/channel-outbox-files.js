'use strict';
/**
 * AN AGENT'S ATTACHMENTS ON DISK (design 005 §2.B, B-fd1f): the bytes an outbox proposal carries, under
 * `<channels dir>/outbox-files/<proposal id>/<n>` (folders 0700, files 0600). The engine owns every call:
 *  · `prepare(list)` — over the validated list: decode, sha256, the type sniffed from the bytes; nothing on disk
 *  · `stage(root, files)` — written SYNCHRONOUSLY into a fresh `.stage-*` folder (no await between the propose's last
 *    reach check and its record), `commit(root, stage, id)` renames it to the proposal's folder, `discard(stage)` takes
 *    a refused one back — a refused proposal leaves no file
 *  · `verify(root, id, metas)` — at the SEND: each stored file re-read and re-hashed; the adapter is handed THESE
 *    buffers (the bytes the person approved); a changed or missing file refuses the send by name
 *  · `remove(root, id)` / `sweep(root, proposals, now)` — retention: an unsent end (rejected / withdrawn / expired) at
 *    once, a sent / failed one KEEP_MS after it ended, a folder whose record is gone, a stage left by a crash
 * Every path is built from the engine's own proposal id and the index n — never from a name an agent wrote.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const P = require('./channel-policy.js');

const DIR = 'outbox-files';
const KEEP_MS = 7 * 24 * 3600 * 1000;
const STAGE_STALE_MS = 3600 * 1000;
const ID_RE = /^p-[a-z0-9]+-[a-z0-9]+$/;
const UNSENT_ENDS = Object.freeze(['rejected', 'withdrawn', 'expired']);
const KEPT_ENDS = Object.freeze(['sent', 'failed']);

const filesRoot = (root) => path.join(root, DIR);
function folderOf(root, id) {
  if (!ID_RE.test(String(id))) throw new Error(`not a proposal id: ${JSON.stringify(String(id).slice(0, 40))}`);
  return path.join(filesRoot(root), String(id));
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
/** `[{name, data: base64}]` (validated by P.attachmentsOf) → `[{n, name, bytes, sha256, mime, kind, data: Buffer}]` */
function prepare(list) {
  return (Array.isArray(list) ? list : []).map((a, n) => {
    const data = Buffer.from(String(a.data), 'base64');
    const t = P.sniffType(data);
    return { n, name: a.name, bytes: data.length, sha256: sha256(data), mime: t.mime, kind: t.kind, data };
  });
}
/** what the RECORD keeps of each file (no bytes) */
const metaOf = (files) => (Array.isArray(files) ? files : []).map(({ n, name, bytes, sha256: h, mime, kind }) => ({ n, name, bytes, sha256: h, mime, kind }));
function discard(dir) { if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone already */ } } }
function stage(root, files) {
  if (!Array.isArray(files) || !files.length) return null;
  fs.mkdirSync(filesRoot(root), { recursive: true, mode: 0o700 });
  const dir = fs.mkdtempSync(path.join(filesRoot(root), '.stage-'));
  try { for (const f of files) fs.writeFileSync(path.join(dir, String(f.n)), f.data, { mode: 0o600, flag: 'wx' }); }
  catch (err) { discard(dir); throw err; }
  return dir;
}
function commit(root, dir, id) { if (dir) fs.renameSync(dir, folderOf(root, id)); }
/** the stored file of attachment n, or null when it is no longer kept */
function fileOf(root, id, n) {
  if (!Number.isInteger(Number(n)) || Number(n) < 0) return null;
  let f;
  try { f = path.join(folderOf(root, id), String(Number(n))); } catch { return null; }
  try { return fs.statSync(f).isFile() ? f : null; } catch { return null; }
}
async function verify(root, id, metas) {
  const out = [];
  for (const m of Array.isArray(metas) ? metas : []) {
    const label = `attachment ${Number(m.n) + 1} (${JSON.stringify(String(m.name || '').slice(0, 80))})`;
    const f = fileOf(root, id, m.n);
    let data = null;
    if (f) { try { data = await fs.promises.readFile(f); } catch { data = null; } }
    if (!data) return { ok: false, n: m.n, why: `${label} is no longer stored` };
    const h = sha256(data);
    if (data.length !== Number(m.bytes) || h !== m.sha256) return { ok: false, n: m.n, why: `${label} is not the file that was approved (sha256 ${h.slice(0, 12)}…, approved ${String(m.sha256).slice(0, 12)}…)` };
    out.push({ name: m.name, mime: m.mime, kind: m.kind, bytes: data.length, sha256: h, data });
  }
  return { ok: true, files: out };
}
function remove(root, id) {
  let dir;
  try { dir = folderOf(root, id); } catch { return false; }
  if (!fs.existsSync(dir)) return false;
  discard(dir);
  return true;
}
const endedAt = (p) => { const h = Array.isArray(p.history) && p.history.length ? p.history[p.history.length - 1] : null; return Number(h && h.at) || Number(p.updatedAt) || 0; };
/** Retention, once a minute from the engine's tick: returns the ids of RECORDS whose files it removed. */
function sweep(root, proposals, now = Date.now()) {
  let names = [];
  try { names = fs.readdirSync(filesRoot(root)); } catch { return []; }
  const all = proposals && typeof proposals === 'object' ? proposals : {};
  const removed = [];
  for (const nm of names) {
    const full = path.join(filesRoot(root), nm);
    if (nm.startsWith('.stage-')) { try { if (now - fs.statSync(full).mtimeMs > STAGE_STALE_MS) discard(full); } catch { /* gone */ } continue; }
    const p = Object.prototype.hasOwnProperty.call(all, nm) ? all[nm] : null;
    const over = p && (UNSENT_ENDS.includes(p.state) || (KEPT_ENDS.includes(p.state) && now - endedAt(p) > KEEP_MS));
    if (!p || over) { discard(full); if (p) removed.push(nm); }
  }
  return removed;
}

module.exports = { DIR, KEEP_MS, STAGE_STALE_MS, UNSENT_ENDS, KEPT_ENDS, folderOf, prepare, metaOf, stage, commit, discard, fileOf, verify, remove, sweep };
