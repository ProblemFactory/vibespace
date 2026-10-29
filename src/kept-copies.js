'use strict';
// THE KEPT COPIES (lane claude-steer-inject r5 → r6) — a claude chat wrapper's restart copy of a person's mid-turn frame
// (`webui_copy`, data/bin/chat-wrapper.js) names its pictures — and a text block over TEXT_MIN — as files KEPT beside the
// wrapper's buffer, never their bytes. This module is the ONE place that names, writes, reads and judges those files: the
// wrapper writes through `keepBlock`, boot-restore preloads them OFF the event loop (`preload`, async + bounded), and
// src/session-store.js resolves a copy line from that preload with no fs call at all (`resolveRecord`).
//
// A REFERENCE OPENS ONLY ITS OWN SESSION'S FILE (acceptance r6): the reference carries the file's sha and extension and
// NOTHING ELSE — the folder is always `<buffersDir>/<the session id the store holds>.img`, never read from the record
// (r5's `file: '<id>.img/<sha>.png'` let a forged `OTHER.img/<sha>.png` draw another session's picture). Any other shape
// is refused: a placeholder plus one log line naming the refusal. A kept block is written by the wrapper's copy line
// ALONE: a client-built one is refused at the input road (src/adapters/claude-code.js formatChatInput) and stripped by
// the wrapper (`keepBlock`) — a peer or an agent cannot mint one.
// THE COPY LINE'S TRUE BOUND: ~233 B + ~135 B per picture (+ 400 chars of a long text's head) — never «< 1 KB at any
// size» (40 pictures ⇒ ~5.5 KB). The kept bytes of a session are capped (CAP_BYTES): past it the OLDEST files go, and
// their copies draw the placeholder.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SHA_RE = /^[0-9a-f]{32}$/;
const EXT_RE = /^(png|jpg|gif|webp|bin|txt)$/;
const KEPT_EXT = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' });
const TEXT_MIN = 8 * 1024;          // a text block longer than this is kept as a file too
const READ_MAX = 32 * 1024 * 1024;  // one kept file read back at most (bigger ⇒ the placeholder)
const CAP_BYTES = 64 * 1024 * 1024; // one session's kept bytes at most (the oldest files evicted past it)
const PRELOAD_MS = 3000;            // the restore's read-back of one session's files at most

/** The kept folder of a session — derived from its buffer path / the id the store holds, never from a record. */
const keptDirOf = (buffersDir, id) => path.join(buffersDir, String(id) + '.img');
const keptDirOfBuffer = (bufferFile) => (/\.buf$/.test(bufferFile) ? bufferFile.slice(0, -4) : bufferFile) + '.img';
/** A reference's own shape: {sha, ext} (+ media_type / bytes / chars) — nothing that names a path. */
const refOk = (ref) => !!(ref && typeof ref.sha === 'string' && SHA_RE.test(ref.sha) && typeof ref.ext === 'string' && EXT_RE.test(ref.ext) && !('file' in ref));
const nameOf = (ref) => ref.sha + '.' + ref.ext;
/** The reference a block carries (an image's `source`, a long text's `kept`), or null. */
const refOfBlock = (b) => (b && b.type === 'image' && b.source && b.source.type === 'kept' ? b.source : (b && b.type === 'text' && b.kept && typeof b.kept === 'object' ? b.kept : null));
const isKeptBlock = (b) => !!refOfBlock(b);

/** Write `bytes` into `dir` under its sha (once); returns the reference's {sha, ext} or null (a failed write). */
function writeKept(dir, bytes, ext, log) {
  const sha = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  try {
    const file = path.join(dir, sha + '.' + ext);
    if (!fs.existsSync(file)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, bytes); }
    return { sha, ext };
  } catch (e) { if (log) log(`kept file not written (${e.message}) — the copy names it unkept`); return null; }
}
/** THE WRAPPER'S SIDE: one block of a person's frame as the copy line names it. A picture's bytes / a long text go into
 *  `dir`; a block that ALREADY carries a kept reference came from a client (only this function mints one) — stripped. */
function keepBlock(b, dir, log) {
  if (isKeptBlock(b)) { if (log) log('a client-built kept reference in a frame was stripped (only the wrapper writes one)'); return { type: 'text', text: '[a picture reference was refused]' }; }
  if (b && b.type === 'image' && b.source && b.source.type === 'base64' && typeof b.source.data === 'string') {
    const mt = typeof b.source.media_type === 'string' && b.source.media_type ? b.source.media_type : 'image/png';
    const bytes = Buffer.from(b.source.data, 'base64');
    const ref = writeKept(dir, bytes, KEPT_EXT[mt] || 'bin', log);
    return { type: 'image', source: { type: 'kept', media_type: mt, bytes: bytes.length, ...(ref || { unkept: true }) } };
  }
  if (b && b.type === 'text' && typeof b.text === 'string' && b.text.length > TEXT_MIN) {
    const ref = writeKept(dir, Buffer.from(b.text, 'utf8'), 'txt', log);
    return { type: 'text', text: b.text.slice(0, 400) + '…', kept: { chars: b.text.length, ...(ref || { unkept: true }) } };
  }
  return b;
}
/** The file names a copy line's text references (the wrapper's trim / rewrite judge them without parsing the line). */
const REF_IN_LINE_RE = /"sha":"([0-9a-f]{32})","ext":"(png|jpg|gif|webp|bin|txt)"/g;
const namesIn = (text) => [...String(text).matchAll(REF_IN_LINE_RE)].map((m) => m[1] + '.' + m[2]);
/** THE RING'S PIN (r6): of the pending copies' lines, those the trim cut (`gone`) and the kept ring (`still`) no longer holds
 *  — the wrapper writes them again at the head, so a frame the CLI has not witnessed keeps its copy through any burst. */
const pinnedLines = (gone, still, pendingLines) => pendingLines.filter((l) => String(gone).includes(l + '\n') && !String(still).includes(l + '\n'));
/** The files a SETTLED copy's line names that no pending copy still names — the ones its settlement may delete. */
function namesToDrop(settledLine, pendingLines) {
  const keep = new Set(pendingLines.flatMap(namesIn));
  return namesIn(settledLine).filter((n) => !keep.has(n));
}
/** Delete the files of `names` (the frame they served was witnessed or dropped). */
function dropFiles(dir, names) { for (const n of names) { try { fs.unlinkSync(path.join(dir, n)); } catch { } } }
/** THE CAP: past CAP_BYTES in `dir`, the oldest files (by mtime) go; returns the names evicted. */
function capDir(dir, capBytes = CAP_BYTES) {
  let rows;
  try { rows = fs.readdirSync(dir).map((n) => { const st = fs.statSync(path.join(dir, n)); return { n, size: st.size, at: st.mtimeMs }; }); } catch { return []; }
  let total = rows.reduce((a, r) => a + r.size, 0);
  const gone = [];
  for (const r of rows.sort((a, b) => a.at - b.at)) {
    if (total <= capBytes) break;
    try { fs.unlinkSync(path.join(dir, r.n)); total -= r.size; gone.push(r.n); } catch { }
  }
  return gone;
}

/** THE STORE'S SIDE, OFF THE LOOP: every file a buffer's copy lines reference, read asynchronously (each ≤ READ_MAX, the
 *  whole read ≤ PRELOAD_MS) ⇒ Map(name → Buffer | null). The restore awaits it before its first history read. */
async function preload(buffersDir, id, buffer, { readMax = READ_MAX, timeoutMs = PRELOAD_MS } = {}) {
  const map = new Map();
  if (!buffersDir || !id || !buffer || !String(buffer).includes('"webui_copy"')) return map;
  const dir = keptDirOf(buffersDir, id);
  const names = [...new Set(namesIn(buffer))];
  const deadline = Date.now() + timeoutMs;
  for (const n of names) {
    if (Date.now() > deadline) { map.set(n, null); continue; }
    try {
      const st = await fs.promises.stat(path.join(dir, n));
      map.set(n, st.size <= readMax ? await fs.promises.readFile(path.join(dir, n)) : null);
    } catch { map.set(n, null); }
  }
  return map;
}
/** A copy line resolved from the preload — SYNC, no fs: a referenced file that is there becomes the block again; one that
 *  is not (gone, refused, never written, past the cap, not preloaded) stays a reference marked `gone`. */
function resolveRecord(rec, map, log) {
  const content = rec && rec.message && Array.isArray(rec.message.content) ? rec.message.content : null;
  if (!content || !content.some(isKeptBlock)) return rec;
  return { ...rec, message: { ...rec.message, content: content.map((b) => {
    const ref = refOfBlock(b);
    if (!ref) return b;
    let bytes = null;
    if (!refOk(ref)) { if (!ref.unkept && log) log(`a kept reference of another shape was refused (${JSON.stringify(ref).slice(0, 120)}) — only {sha, ext} in its own session's folder`); }
    else bytes = map && map.get(nameOf(ref)) || null;
    if (b.type === 'image') return bytes ? { type: 'image', source: { type: 'base64', media_type: ref.media_type || 'image/png', data: bytes.toString('base64') }, kept: true } : { type: 'image', source: { type: 'kept', media_type: ref.media_type || 'image/png', bytes: ref.bytes || 0, gone: true } };
    return bytes ? { type: 'text', text: bytes.toString('utf8') } : { ...b, kept: { chars: ref.chars || 0, gone: true } };
  }) } };
}

module.exports = { SHA_RE, EXT_RE, KEPT_EXT, TEXT_MIN, READ_MAX, CAP_BYTES, PRELOAD_MS, keptDirOf, keptDirOfBuffer, refOk, nameOf, refOfBlock, isKeptBlock, writeKept, keepBlock, namesIn, pinnedLines, namesToDrop, dropFiles, capDir, preload, resolveRecord };
