'use strict';
// THE HANDED RECORDS, THE HUB's SIDE — the ONE DRAWER of «Not delivered» (row B-5a4d, its root — 主开发 r3160's unit 1, the roads page).
// A frame the person handed to a running turn has ONE record in `<buffers>/handed/<conversation id>.json`, written by the wrapper alone
// (data/bin/chat-wrapper.js: its copy, the CLI it was handed to, its state; settled at the CLI's exit). Every road to a next wrapper
// mints a new hub id and the exit teardown removes that id's files, so the record is named by the CONVERSATION (the id the CLI resumes
// by) and the hub's HISTORY READ draws it: the stopped conversation's read-only view, an attach after a Resume, a rebuild after a hub
// restart. This module only reads.
//   warm(ids)       OFF THE LOOP, bounded: each id's file is read into a small cache — the read has FOUR replies: none (no file) ·
//                   ok · refused (the read failed, or the file is past its bound) · torn (bytes not the records' shape); a refused or
//                   torn read draws nothing and is said ONCE. Awaited where the transcript itself is warmed (the claude harness's
//                   store.warmTranscript, before the attach's rebuild and the history read).
//   recordsFor(ids) SYNCHRONOUS, from the cache only (never a read on the loop): the records of the conversation's CURRENT id and every
//                   earlier id of its chain, merged by the record's own id (a state only moves forward). An id not yet warmed draws
//                   nothing in this build and is warmed for the next.
//   drawnFor(recs)  the records to draw, as the wrapper's own copy lines: an UNDELIVERED one marked `undelivered` («Not delivered»);
//                   one still HANDED marked `unconfirmed` («Not confirmed» — its CLI died with no word: the remote and paired limit, or
//                   a wrapper killed before it could settle) — except one a LIVE wrapper still holds (handed at or after that live
//                   session's start: a frame in flight is never called unconfirmed).
const fs = require('fs');
const path = require('path');

const DIRNAME = 'handed';
const FILE_MAX = 8 * 1024 * 1024;
const CACHE_MAX = 400;
const WARM_MS = 2000;
const RANK = { handed: 0, undelivered: 1, landed: 2, 'own-turn': 2, kept: 2 };   // r3282: as the wrapper's — a word of the CLI or the person beats a proven absence
// = server.js BUFFERS_DIR (the wrapper's buffers' folder) — ONLY in the hub's own process: a suite or a tool that builds a history reads
// no records unless it names its own folder (`dir`), so nothing outside its scratch is ever read for it
const HUB_MAIN = (() => { try { return !!require.main && require.main.filename === path.join(__dirname, '..', 'server.js'); } catch { return false; } })();
const DEFAULT_DIR = HUB_MAIN ? path.join(__dirname, '..', 'data', 'session-buffers') : null;
const cache = new Map();      // file → { kind, records: Map }
const inflight = new Map();   // file → the read in flight
const said = new Set();

const safeName = (id) => String(id || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160);
const fileOf = (dir, id) => ((dir || DEFAULT_DIR) ? path.join(dir || DEFAULT_DIR, DIRNAME, safeName(id) + '.json') : null);
const rankOf = (r) => (r && Object.prototype.hasOwnProperty.call(RANK, r.state) ? RANK[r.state] : 0);
const sayOnce = (key, words) => { if (said.has(key)) return; said.add(key); if (said.size > 1000) said.clear(); try { console.warn(`[handed] ${words}`); } catch { } };
const idsOf = (ids) => [...new Set((Array.isArray(ids) ? ids : [ids]).filter((x) => typeof x === 'string' && x))];

async function readOne(file, fsp = fs.promises) {
  let st = null;
  try { st = await fsp.stat(file); } catch (e) { return e && e.code === 'ENOENT' ? { kind: 'none', records: new Map() } : { kind: 'refused', records: new Map(), why: (e && e.code) || 'read' }; }
  if (!st.isFile() || st.size > FILE_MAX) return { kind: 'refused', records: new Map(), why: st.isFile() ? `${st.size} bytes, past ${FILE_MAX}` : 'not a file' };
  let text = '';
  try { text = await fsp.readFile(file, 'utf8'); } catch (e) { return { kind: 'refused', records: new Map(), why: (e && e.code) || 'read' }; }
  let j = null; try { j = JSON.parse(text); } catch { j = null; }
  if (!j || typeof j !== 'object' || !Array.isArray(j.frames)) return { kind: 'torn', records: new Map() };
  const m = new Map();
  for (const r of j.frames) if (r && typeof r.msgId === 'string' && r.msgId) m.set(r.msgId, r);
  return { kind: 'ok', records: m };
}
/** Read the conversation's files off the loop (bounded); never throws. → the replies by id */
async function warm(ids, { dir = DEFAULT_DIR, boundMs = WARM_MS, fsp = fs.promises } = {}) {
  const want = (dir || DEFAULT_DIR) ? idsOf(ids) : [];
  const jobs = want.map((id) => {
    const file = fileOf(dir, id);
    if (inflight.has(file)) return inflight.get(file);
    const job = readOne(file, fsp).then((got) => {
      if (got.kind === 'refused') sayOnce('refused:' + file, `${path.basename(file)} could not be read (${got.why}) — its records are not drawn`);
      if (got.kind === 'torn') sayOnce('torn:' + file, `${path.basename(file)} is torn — its records are not drawn`);
      cache.delete(file); cache.set(file, got);
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return got;
    }).catch(() => null).finally(() => inflight.delete(file));
    inflight.set(file, job);
    return job;
  });
  let timer = null;
  const bound = new Promise((r) => { timer = setTimeout(r, boundMs); if (timer.unref) timer.unref(); });
  try { await Promise.race([Promise.all(jobs), bound]); } finally { clearTimeout(timer); }
  return want.map((id) => ({ id, kind: (cache.get(fileOf(dir, id)) || {}).kind || 'not-read' }));
}
/** From the cache only: the conversation's records (its current id and every earlier id), merged forward-only. */
function recordsFor(ids, { dir = DEFAULT_DIR } = {}) {
  const out = new Map();
  const cold = [];
  if (!(dir || DEFAULT_DIR)) return out;
  for (const id of idsOf(ids)) {
    const got = cache.get(fileOf(dir, id));
    if (!got) { cold.push(id); continue; }
    if (got.kind !== 'ok') continue;
    for (const [mid, r] of got.records) { const was = out.get(mid); if (!was || rankOf(r) > rankOf(was)) out.set(mid, r); }
  }
  if (cold.length) warm(cold, { dir }).catch(() => { });   // for the next build — never a read on this loop
  return out;
}
/** The records to draw (the wrapper's copy lines, marked) — `liveSince`: a live session's start (a frame it handed later is in flight). */
function drawnFor(records, { liveSince = 0 } = {}) {
  const out = [];
  for (const r of records.values()) {
    if (!r || typeof r.copy !== 'string' || !r.copy.trimStart().startsWith('{')) continue;
    let mark = null;
    if (r.state === 'undelivered') mark = 'undelivered';
    else if ((r.state === 'handed' || !Object.prototype.hasOwnProperty.call(RANK, r.state)) && !(liveSince && Number(r.at) >= liveSince)) mark = 'unconfirmed';   // an unknown state word reads as handed
    if (!mark) continue;
    let rec = null; try { rec = JSON.parse(r.copy); } catch { rec = null; }
    if (!rec || typeof rec !== 'object' || !rec.msgId) continue;
    rec[mark] = true;
    out.push({ at: Number(r.at) || Date.parse(rec.timestamp) || 0, rec });
  }
  return out.sort((x, y) => x.at - y.at);
}
/** Insert the drawn copies into a merged record list at their send time (after the last record dated at or before it). */
function insertDrawn(all, drawn) {
  if (!drawn.length) return all;
  const out = all.slice();
  for (const d of drawn) {
    // the history already holds this frame: a live ring's wrapper copy (webui_copy), or the hub's OWN send record of it (r4372: a copy
    // dated before that record drew a SECOND bubble — message-manager.js drops a later record by its msgId only after a send record,
    // and a paired machine's clock behind the hub's places the copy first; the chip is then the live ring's, as in the send-first order)
    if (out.some((m) => m && m.msgId === d.rec.msgId && (m.webui_copy || m._fromWebui))) continue;
    // before the first record dated AFTER its send; with none, at the end (its send time among the transcript's records)
    let at = out.findIndex((m) => { const t = Date.parse(m && m.timestamp); return !!t && t > d.at; });
    if (at < 0) at = out.length;
    out.splice(at, 0, d.rec);
  }
  return out;
}

module.exports = { DIRNAME, FILE_MAX, DEFAULT_DIR, fileOf, warm, recordsFor, drawnFor, insertDrawn, _cache: cache };
