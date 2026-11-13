'use strict';
/**
 * A FILE A PERSON DROPPED INTO A CONVERSATION WHOSE FOLDER IS TEMPORARY LIVES AS LONG AS THE CONVERSATION (lane
 * chat-attachments-persist, the cut — 主开发 2026-11-13 08:54Z; the reader's list 13:41Z). data/chat-attachments/<the hub's
 * conversation id>/files/:
 *   · WRITTEN by the upload route (src/routes/files.js: chat.uploadDir unset + a temporary cwd) and by the Antigravity
 *     wrapper (data/bin/agy-wrapper.js: its pasted pictures, in its own process) — each as a temp file in the folder
 *     (`.<name>.<pid>-<8 hex>.vs-tmp`, the writer's own shape), then LINKED to a name nobody holds (an existing file is
 *     never overwritten: «a (1).png»), then the temp is unlinked.
 *   · THE LINK `<conv>/conversation.json` {v, conv, backend, tx}: which conversation the folder belongs to — written at the
 *     upload and refreshed whenever the store sees the folder while the hub still lists its conversation (through the
 *     store writer: temp + rename on its own thread). It outlives the hub's session record: a terminated conversation's
 *     record goes, its transcript stays, and the link still names it.
 *   · «A CONVERSATION THAT NO LONGER EXISTS» is PROVEN, never guessed: the hub lists it nowhere (no live session, no
 *     session record in any form — <id>.json, .json.orphan, .json.stopped), AND its link names a transcript the harness's
 *     own locate PROVES absent (a locate that is proof, answering «no transcript here»). A folder with no link at all names
 *     no conversation and is offered too. Anything unknown (a harness whose locate is no proof, a link without a
 *     transcript id, a worker that cannot answer) KEEPS the files. Settings' Remove door names the count and the size
 *     BEFORE it acts and acts only on exactly those.
 *   · CONVERGES AT START: a temp file of the writer's own shape older than a minute (a write a crash cut short) is removed —
 *     the only rule there is; a name a person chose is never touched, whatever it ends with.
 *   · NO BOUND (主开发's ruling a).
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
const TMP_RE = /^\..+\.\d+-[0-9a-f]{8}\.vs-tmp$/;   // the writer's own temp shape — never a name a person chose
const TMP_AGE_MS = 60000;
const LINK_FILE = 'conversation.json';
const convOk = (c) => typeof c === 'string' && CONV_RE.test(c) && !c.includes('..');
const isTemp = (file) => TMP_RE.test(path.basename(String(file)));
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

/** THE LINK: which conversation a folder belongs to ({backend, tx} — tx = its transcript id when known), through the store
 *  writer (temp + rename on its own thread). → the file, or null for a bad id. */
function writeLink(root, conv, of = {}, writer = null) {
  if (!convOk(conv)) return null;
  const file = path.join(root, conv, LINK_FILE);
  const backend = of && typeof of.backend === 'string' && of.backend ? of.backend : null, tx = of && typeof of.tx === 'string' && CONV_RE.test(of.tx) ? of.tx : null;
  const link = { v: 1, conv, backend, tx };
  const w = writer ? writer() : require('../store-writer.js').storeWriter();
  w.dirty(file, { name: 'chat-attachments-link.write', mode: 0o600, produce: () => JSON.stringify(link) });
  return file;
}
async function readLink(root, conv) {
  try { const j = JSON.parse(await fsp.readFile(path.join(root, conv, LINK_FILE), 'utf8')); return j && typeof j === 'object' ? j : null; } catch { return null; }
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
 * The store over `root` (data/chat-attachments). The server wires what the hub knows:
 *   knownIds() → a Set of every conversation id the hub lists (live sessions + session records in every form);
 *   linkOf(conv) → {backend, tx} of a conversation the hub lists (its live session or its record), or null;
 *   located(backend, tx) → true (its transcript is here) | false (its harness's locate PROVES it is not) | null (unknown).
 */
function create({ root, knownIds = async () => new Set(), linkOf = async () => null, located = async () => null, log = console, now = Date.now, writer } = {}) {
  if (!root) throw new Error('chat-attachments: root is required');
  const W = writer ? () => writer : undefined;
  const convDirs = async () => { try { return (await fsp.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory() && convOk(d.name)).map((d) => d.name); } catch { return []; } };
  /** a folder the hub still lists: its link refreshed while the hub can still say which conversation it is */
  async function refresh(conv) {
    let l = null; try { l = await linkOf(conv); } catch { l = null; }
    if (!l || (!l.backend && !l.tx)) return;
    const cur = await readLink(root, conv);
    if (!cur || cur.backend !== (l.backend || null) || (l.tx && cur.tx !== l.tx)) writeLink(root, conv, { backend: l.backend || null, tx: l.tx || (cur && cur.tx) || null }, W);
  }
  /** at start: the writer's own temp files a crash left (older than a minute: a write still running is younger) → removed;
   *  every folder the hub lists gets its link */
  async function sweepTemps() {
    let removed = 0;
    for (const f of await walk(root)) {
      if (!isTemp(f.file) || now() - f.mtimeMs < TMP_AGE_MS) continue;
      try { await fsp.unlink(f.file); removed++; } catch { }
    }
    if (removed) log.log?.(`[chat-attachments] removed ${removed} unfinished file${removed === 1 ? '' : 's'} a stop left behind`);
    const known = await knownIds().catch(() => new Set());
    for (const c of await convDirs()) if (known && known.has(c)) await refresh(c);
    return removed;
  }
  const isPersonFile = (f) => !isTemp(f.file) && path.basename(f.file) !== LINK_FILE;
  const countOf = (files) => { const real = files.filter(isPersonFile); return { files: real.length, bytes: real.reduce((a, f) => a + f.size, 0) }; };
  /** what is kept: {files, bytes, conversations} — the files a person dropped, in every conversation's files/ */
  async function usage() {
    let files = 0, bytes = 0, conversations = 0;
    for (const c of await convDirs()) {
      const n = countOf(await walk(path.join(root, c, 'files')));
      if (n.files) { files += n.files; bytes += n.bytes; conversations++; }
    }
    return { files, bytes, conversations };
  }
  /** is `conv`'s conversation PROVEN gone? (listed nowhere, and its link's transcript proven absent — or no link at all) */
  async function provenGone(conv, known) {
    if (known && known.has(conv)) { await refresh(conv); return false; }
    const l = await readLink(root, conv);
    if (!l) return true;                                   // no link: nobody names this folder
    if (!l.backend || !l.tx) return false;                 // a link that names no transcript: unknown ⇒ kept
    let here = null; try { here = await located(l.backend, l.tx); } catch { here = null; }
    return here === false;                                 // only a locate that PROVES absence
  }
  /** the folders of conversations proven gone: {conversations, files, bytes, ids} */
  async function orphans() {
    const known = await knownIds();
    const ids = [];
    for (const c of await convDirs()) if (await provenGone(c, known)) ids.push(c);
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
  return { root, sweepTemps, usage, orphans, removeOrphans, removeConversation, refresh };
}

/**
 * WHAT THE HUB KNOWS about a conversation id — the three questions `create` asks, from the hub's own state:
 *   knownIds: its live sessions + every session record in data/session-meta, in EVERY form (<id>.json, a keeper's
 *     <id>.json.orphan, a restart's <id>.json.stopped — an archived conversation is a flag in its .json);
 *   linkOf: which conversation an id is ({backend, tx}) — its live session, else its record;
 *   located: does a transcript exist — `locate(backend, tx)` (the transcript worker's `locate`: true / false only where the
 *     harness's locate is proof / null = unknown).
 */
const RECORD_RE = /^(.+)\.json(?:\.orphan|\.stopped)?$/;
const RECORD_FORMS = ['.json', '.json.stopped', '.json.orphan'];
function hubKnowledge({ activeSessions = new Map(), metaDir, locate = async () => null } = {}) {
  const linkOfSession = (s) => ({ backend: (s && s.backend) || 'claude', tx: (s && (s.backendSessionId || s.claudeSessionId)) || null });
  return {
    knownIds: async () => {
      const ids = new Set(activeSessions.keys());
      try { for (const f of await fsp.readdir(metaDir)) { const m = RECORD_RE.exec(f); if (m) ids.add(m[1]); } } catch { }
      return ids;
    },
    linkOf: async (conv) => {
      if (!convOk(conv)) return null;
      const live = activeSessions.get(conv);
      if (live) return linkOfSession(live);
      for (const ext of RECORD_FORMS) { try { return linkOfSession(JSON.parse(await fsp.readFile(path.join(metaDir, conv + ext), 'utf8'))); } catch { } }
      return null;
    },
    located: async (backend, tx) => { try { const r = await locate(backend, tx); return r === true ? true : r === false ? false : null; } catch { return null; } },
  };
}

module.exports = { create, hubKnowledge, placeFile, writeLink, readLink, isTemp, convOk, CONV_RE, TMP_SUFFIX, TMP_RE, TMP_AGE_MS, LINK_FILE, RECORD_RE };
