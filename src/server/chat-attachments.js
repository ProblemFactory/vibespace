'use strict';
/**
 * A FILE A PERSON DROPPED INTO A CONVERSATION WHOSE FOLDER IS TEMPORARY LIVES WITH THE CONVERSATION (lane
 * chat-attachments-persist, the cut — 主开发 2026-11-13 08:54Z). data/chat-attachments/<the hub's conversation id>/files/:
 *   · WRITTEN by the upload route (src/routes/files.js: chat.uploadDir unset + a temporary cwd) and by the Antigravity
 *     wrapper (data/bin/agy-wrapper.js: its pasted pictures, in its own process) — each as a temp file in the folder, then
 *     LINKED to a name nobody holds (an existing file is never overwritten: «a (1).png»), then the temp is unlinked.
 *   · CONVERGES AT START: a temp file older than a minute (a write a crash cut short) is removed — the only rule there is.
 *   · NO BOUND (主开发's ruling a). Settings › Chat SAYS what is kept (`usage`) and, apart, what belongs to conversations that
 *     no longer exist — one the hub lists nowhere: no session record of it, live or kept (an archived conversation and one on
 *     a machine that is offline now keep theirs) — with a Remove door that names the count and the size BEFORE it acts
 *     (`orphans`, then `removeOrphans` with exactly what was named).
 *   · A picture a message SHOWS is not here: it is read from the record it came in (src/transcript-picture.js, the route
 *     src/routes/chat-attachments.js).
 * NEVER a client string as a path: a conversation id must match CONV_RE; a name is confined to its folder. fs.promises only.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const CONV_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TMP_SUFFIX = '.vs-tmp';
const TMP_AGE_MS = 60000;
const convOk = (c) => typeof c === 'string' && CONV_RE.test(c) && !c.includes('..');
const tmpNameOf = (name) => `.${path.basename(String(name)).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64)}.${process.pid}-${crypto.randomBytes(4).toString('hex')}${TMP_SUFFIX}`;

/**
 * Put the file `src` into `dir` as `name` — or, when that name is held, «name (1).ext», «name (2).ext»… — as a temp file in
 * the same folder LINKED to the free name (a link never replaces a file: EEXIST ⇒ the next name), then the temp unlinked.
 * `name` may hold a folder upload's sub-path («shots/a.png»); it must stay inside `dir`. → the name it got.
 */
async function placeFile(src, dir, name) {
  const root = path.resolve(dir), rel = String(name || '');
  const want = path.resolve(root, rel);
  if (!rel || want === root || !want.startsWith(root + path.sep)) throw new Error(`Invalid file name: ${rel}`);
  const sub = path.dirname(want);
  await fsp.mkdir(sub, { recursive: true, mode: 0o700 });
  const tmp = path.join(sub, tmpNameOf(rel));
  await fsp.copyFile(src, tmp);
  try {
    await fsp.chmod(tmp, 0o600).catch(() => { });
    const leaf = path.basename(want), dot = leaf.lastIndexOf('.');
    const stem = dot > 0 ? leaf.slice(0, dot) : leaf, ext = dot > 0 ? leaf.slice(dot) : '';
    for (let n = 0; n < 1000; n++) {
      const cand = n ? `${stem} (${n})${ext}` : leaf;
      try { await fsp.link(tmp, path.join(sub, cand)); return path.relative(root, path.join(sub, cand)).split(path.sep).join('/'); } catch (e) { if (!e || e.code !== 'EEXIST') throw e; }
    }
    throw new Error(`Too many files named ${leaf}`);
  } finally { await fsp.unlink(tmp).catch(() => { }); }
}

/** every file under `dir` (recursive) → [{file, size, mtimeMs}] — off the loop */
async function walk(dir) {
  const out = [];
  let ents = [];
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile()) { try { const st = await fsp.stat(p); out.push({ file: p, size: st.size, mtimeMs: st.mtimeMs }); } catch { } }
  }
  return out;
}

/**
 * The store over `root` (data/chat-attachments). `knownIds()` → a Set of every conversation id the hub lists (its session
 * records, live and kept; the server wires it).
 */
function create({ root, knownIds = async () => new Set(), log = console, now = Date.now } = {}) {
  if (!root) throw new Error('chat-attachments: root is required');
  const convDirs = async () => { try { return (await fsp.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory() && convOk(d.name)).map((d) => d.name); } catch { return []; } };
  /** at start: temp files a crash left (older than a minute: a write still running is younger) → removed */
  async function sweepTemps() {
    let removed = 0;
    for (const f of await walk(root)) {
      if (!f.file.endsWith(TMP_SUFFIX) || now() - f.mtimeMs < TMP_AGE_MS) continue;
      try { await fsp.unlink(f.file); removed++; } catch { }
    }
    if (removed) log.log?.(`[chat-attachments] removed ${removed} unfinished file${removed === 1 ? '' : 's'} a stop left behind`);
    return removed;
  }
  const countOf = (files) => { const real = files.filter((f) => !f.file.endsWith(TMP_SUFFIX)); return { files: real.length, bytes: real.reduce((a, f) => a + f.size, 0) }; };
  /** what is kept: {files, bytes, conversations} — the files a person dropped, in every conversation's files/ */
  async function usage() {
    let files = 0, bytes = 0, conversations = 0;
    for (const c of await convDirs()) {
      const n = countOf(await walk(path.join(root, c, 'files')));
      if (n.files) { files += n.files; bytes += n.bytes; conversations++; }
    }
    return { files, bytes, conversations };
  }
  /** the folders of conversations the hub lists nowhere: {conversations, files, bytes, ids} */
  async function orphans() {
    const known = await knownIds();
    const ids = (await convDirs()).filter((c) => !(known && known.has(c)));
    let files = 0, bytes = 0;
    for (const c of ids) { const n = countOf(await walk(path.join(root, c))); files += n.files; bytes += n.bytes; }
    return { conversations: ids.length, files, bytes, ids };
  }
  /** the Remove door: acts only on exactly what it named ({files, bytes} as `orphans` answered); else {changed} */
  async function removeOrphans({ files, bytes } = {}) {
    const o = await orphans();
    if (o.files !== Number(files) || o.bytes !== Number(bytes)) return { changed: true, now: { conversations: o.conversations, files: o.files, bytes: o.bytes } };
    let removed = 0;
    for (const c of o.ids) { try { await fsp.rm(path.join(root, c), { recursive: true, force: true }); removed++; } catch { } }
    log.log?.(`[chat-attachments] removed the files of ${removed} conversation${removed === 1 ? '' : 's'} that no longer exist (${o.files} files, ${o.bytes} bytes)`);
    return { removed, files: o.files, bytes: o.bytes };
  }
  /** a delete road's door (VibeSpace has none today; an archive is a flag): the conversation's folder goes */
  function removeConversation(conv) {
    if (!convOk(conv)) return Promise.resolve(false);
    return fsp.rm(path.join(root, conv), { recursive: true, force: true }).then(() => true, () => false);
  }
  return { root, sweepTemps, usage, orphans, removeOrphans, removeConversation };
}

module.exports = { create, placeFile, convOk, CONV_RE, TMP_SUFFIX, TMP_AGE_MS };
