'use strict';
/**
 * THE DESIGN FOLDER ON ITS MACHINE (dc-twins, rv-server-core M1) — the Design window's folder reads and its one write,
 * spelled ONCE. The hub's design engine (src/server/design-engine.js) calls this module in-process for device #0
 * (this machine); a machine whose daemon serves the `design-fs` capability runs the SAME module there (src/agentd/
 * agentd.js — node fs only, so a Windows `fs-portable` agent reads a design folder too); only a daemon-less ssh host
 * (or a daemon older than the op) still gets the engine's ONE-command sh scripts, the fallback rung. Same idea as
 * src/sysinfo.js (2.314.0): one implementation, run where the folder lives; the host is a parameter, never a branch.
 *
 * The rules: readdir, then every needed file through an O_NOFOLLOW | O_NONBLOCK handle with fstat judged before the
 * read (a symlink is never followed out of the folder; a FIFO swapped in never parks a pool thread — design-cd-joint
 * r1); a linked user.json is SAID (`link: true`), never read; user.json is written as a fresh O_EXCL | O_NOFOLLOW temp
 * file beside it, then a rename (a rename replaces the NAME, never a file a link points at). Caps: M.LIMITS.
 * Imports: node builtins + the PURE design model / token check (both already bundled where the engine runs).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DOOR = require('./mount-door'); // B-afc4: the blocked-path door — asked BEFORE a user-path read
const M = require('./design-model.js');
const DT = require('./design-tokens.js');

const CAP = 'design-fs';            // the daemon capability (hello-ack) that says this module answers there
const ASSETS_PER_READ = 200;        // images read per folder read (the sh rung uses the same number)
const fsp = fs.promises;
const fail = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

/** The folder's read: readdir, then every needed file through an O_NOFOLLOW handle (fstat judged before the read). */
async function readFolder(dir) {
  if (DOOR.blocked(dir)) return fail('storage_blocked', DOOR.SENTENCE);   // B-afc4: refused by name, never read
  let ents;
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); }
  catch (e) { return e.code === 'ENOENT' ? fail('not_found', 'the folder does not exist') : e.code === 'ENOTDIR' ? fail('not_a_dir', 'that path is a file, not a folder') : fail('read_failed', `the folder could not be read (${e.code || e.message})`); }
  const names = ents.filter((e) => e.isFile()).map((e) => e.name);   // a symlink entry is not a file here: never followed
  const userOdd = ents.some((e) => e.name === M.USER_FILE && !e.isFile());   // lane design-tweaks: a linked user.json is said, never read
  const html = names.filter((n) => /\.html$/i.test(n));
  if (html.length > M.LIMITS.artboards) return fail('too_big', M.readCapsVerdict({ artboards: html.length }).why);
  const files = new Map();
  let total = 0;
  const take = async (name, cap) => {
    let fh = null;
    try {
      fh = await fsp.open(path.join(dir, name), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));   // a FIFO swapped in never parks a pool thread (design-cd-joint r1)
      const st = await fh.stat();
      if (!st.isFile()) return null;
      const rec = { name, size: st.size, mtime: Math.round(st.mtimeMs), bytes: null };
      if (st.size <= cap && total + st.size <= M.LIMITS.readBytes) { rec.bytes = await fh.readFile(); total += rec.bytes.length; }
      else if (st.size <= cap) rec.over = true;   // within its own cap, past the read's budget
      return rec;
    } catch { return null; } finally { if (fh) await fh.close().catch(() => { }); }
  };
  for (const n of [M.MANIFEST_FILE, M.USER_FILE, ...html.sort()]) {
    if ((n === M.MANIFEST_FILE || n === M.USER_FILE) && !names.includes(n)) continue;
    const rec = await take(n, M.LIMITS.artboardBytes);
    if (rec) files.set(n, rec);
  }
  if (userOdd) files.set(M.USER_FILE, { name: M.USER_FILE, size: 0, mtime: null, bytes: null, link: true });
  if (names.includes(DT.TOKENS_FILE)) { const rec = await take(DT.TOKENS_FILE, DT.TOKEN_LIMITS.tokensBytes); if (rec) files.set(DT.TOKENS_FILE, rec); }   // the token check
  // only the images the artboards use
  const want = new Set();
  for (const n of html) { const r = files.get(n); if (r && r.bytes) for (const a of M.assetRefsOf(r.bytes.toString('utf8'))) want.add(a); }
  const wanted = [...want];
  for (const a of wanted.slice(0, ASSETS_PER_READ)) {
    if (!names.includes(a)) continue;
    const rec = await take(a, M.LIMITS.assetBytes);
    if (rec) files.set(a, rec);
  }
  // past the per-read image cap: the file IS in the folder and is NOT read — its artboard is refused as the cap, by
  // name, never as "missing" (L4 B③: 300 images read "not in the design folder")
  for (const a of wanted.slice(ASSETS_PER_READ)) if (names.includes(a)) files.set(a, { name: a, size: 0, mtime: null, bytes: null, capped: true });
  return { ok: true, files, html: html.length };
}

/** The Tweaks read and a write's base: design.json + user.json only (two O_NOFOLLOW reads). */
async function readMeta(dir) {
  const files = new Map();
  for (const n of [M.MANIFEST_FILE, M.USER_FILE]) {
    let fh = null;
    try {
      fh = await fsp.open(path.join(dir, n), (fs.constants.O_NOFOLLOW || 0) | fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0));   // a FIFO opens at once, refused below (design-cd-joint r1)
      const st = await fh.stat();
      if (!st.isFile()) { if (n === M.USER_FILE) files.set(n, { name: n, size: 0, mtime: null, bytes: null, link: true }); continue; }
      files.set(n, { name: n, size: st.size, mtime: Math.round(st.mtimeMs), bytes: st.size <= M.LIMITS.artboardBytes ? await fh.readFile() : null });
    } catch (e) {
      if (e.code === 'ELOOP' && n === M.USER_FILE) files.set(n, { name: n, size: 0, mtime: null, bytes: null, link: true });
      else if (e.code !== 'ENOENT') return fail('read_failed', `${n} could not be read (${e.code || e.message})`);
    } finally { if (fh) await fh.close().catch(() => { }); }
  }
  return { ok: true, files };
}

/** A design system's tokens.css, alone: never through a link; O_NONBLOCK — a FIFO named tokens.css opens at once and is
 *  refused below (a blocking open would park a libuv pool thread for good, design-cd-joint r1). → {ok, text} | refusal */
async function readTokens(dir) {
  let fh = null;
  try {
    fh = await fsp.open(path.join(dir, DT.TOKENS_FILE), (fs.constants.O_NOFOLLOW || 0) | fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0));
    const st = await fh.stat();
    if (!st.isFile()) return fail('no_tokens', 'the design system\'s tokens.css is not a plain file (a FIFO, a device or a folder) — its tokens must be a file of its own folder');
    if (st.size > DT.TOKEN_LIMITS.tokensBytes) return fail('bad_tokens', `the design system's tokens.css is over ${DT.TOKEN_LIMITS.tokensBytes / 1024} KB`);
    return { ok: true, text: (await fh.readFile()).toString('utf8') };
  } catch (e) {
    if (e.code === 'ENOENT') return fail('no_tokens', `the design system at ${dir} has no tokens.css — its agent writes one (custom properties: --accent, --radius, …)`);
    if (e.code === 'ELOOP') return fail('no_tokens', 'the design system\'s tokens.css is a link — its tokens must be a file of its own folder');
    return fail('read_failed', `the design system's tokens.css could not be read (${e.code || 'error'})`);
  } finally { if (fh) await fh.close().catch(() => { }); }
}

/** user.json: a fresh temp file beside it (O_EXCL | O_NOFOLLOW), then a rename. A user.json that is a link or not a
 *  plain file is refused by name. */
async function writeUser(dir, text) {
  const file = path.join(dir, M.USER_FILE);
  try {
    const st = await fsp.lstat(file);
    if (!st.isFile()) return fail('user_not_file', `${file} is ${st.isSymbolicLink() ? 'a link' : 'not a plain file'} — the user's tweak values are written only as a plain file inside the design folder (remove it, then try again)`);
  } catch (e) { if (e.code !== 'ENOENT') return fail('write_failed', `user.json could not be checked (${e.code || e.message})`); }
  const tmp = path.join(dir, `.user.json.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let fh = null;
  try {
    fh = await fsp.open(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o644);
    await fh.writeFile(String(text));
    await fh.close(); fh = null;
    await fsp.rename(tmp, file);
    let mtime = null;
    try { mtime = Math.round((await fsp.lstat(file)).mtimeMs); } catch { mtime = null; }
    return { ok: true, mtime };
  } catch (e) {
    if (fh) await fh.close().catch(() => { });
    await fsp.unlink(tmp).catch(() => { });
    return e.code === 'ENOENT' ? fail('not_found', 'the design folder does not exist') : fail('write_failed', `user.json could not be written (${e.code || e.message})`);
  }
}

const ACTIONS = Object.freeze({ read: readFolder, meta: readMeta, tokens: readTokens, 'write-user': (dir, p) => writeUser(dir, p.text) });
/** The one entry (the daemon op and device #0 alike): an action by name over an absolute folder. */
async function run(action, params = {}) {
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
  if (!fn) return fail('bad_action', `design-fs has no action ${JSON.stringify(String(action)).slice(0, 40)}`);
  const dir = typeof params.dir === 'string' && path.isAbsolute(params.dir) ? params.dir : null;
  if (!dir) return fail('bad_dir', 'name the design folder by its absolute path');
  return fn(dir, params);
}

/** A result across the daemon link (JSON): the files Map → rows, every Buffer → base64. */
function toWire(r) {
  if (!r || !(r.files instanceof Map)) return r;
  return { ...r, files: [...r.files.values()].map((f) => ({ ...f, bytes: f.bytes ? f.bytes.toString('base64') : null })) };
}
function fromWire(w) {
  if (!w || !Array.isArray(w.files)) return w;
  return { ...w, files: new Map(w.files.map((f) => [f.name, { ...f, bytes: typeof f.bytes === 'string' ? Buffer.from(f.bytes, 'base64') : null }])) };
}

module.exports = { CAP, ASSETS_PER_READ, run, toWire, fromWire };
