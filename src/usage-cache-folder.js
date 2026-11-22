'use strict';
/**
 * THE USAGE-CACHE FOLDER'S ONE READER OFF THE LOOP (B-360d part 3 U3, 主开发 r1459).
 *
 * data/usage-cache holds one reading file per identity (the hub's write path and another process — the shipped statusline
 * — both write it). Three roads read the WHOLE folder: the identity groups (the 60-s anchor sweep, resolveIdentity after its
 * 30-s memo), the 30-s ingestion, and the ingestion at every GET /api/usage. Each was a readdir and a whole read of every file,
 * on the loop, on the data share. Now ONE reader per folder reads it with fs.promises and its REPLY is kept:
 *  - ONE CLOCK: the ingestion runs when a refresh brings its reply (`onReply`); usage-routes' 30-s pass (after the sign-in facts'
 *    confirmation, B-360d's accounts-list cure) asks `tick()` — a refresh, or the held state said when one has not replied; the request and
 *    the sweep each ask `fresh()` — a reply from a refresh that STARTED after the ask (bounded by `waitMs`), so a reading another
 *    process wrote reaches them no later than before.
 *  - every other reader (the groups through `via`) reads the kept reply: at most one refresh older than the folder.
 *  - THE HUB'S OWN WRITE replaces its entry at once (src/usage-cache-write.js atomicWrite → `noteWritten`), also during a read
 *    in flight (it stands over what that read saw).
 *  - A REFRESH THAT FAILS (the folder not replying, or answering an error) keeps the last reply and SAYS its age: `state()`
 *    answers { asOf, ageMs, held, since, error } — a held read is never an empty one. A refresh that has not replied is never
 *    stacked: at most one is in flight.
 *  - THE BOOT: the folder's first fill, at the reader's making, is ONE synchronous pass (the boot already read the folder
 *    synchronously before its first turn: the ingestion at setupUsage) — so the boot's first answers have the readings.
 * `via` has run-reads' shape (readdir / readText) and serves only this folder's `.json` names: every reader of the folder
 * filters on that suffix (sidecars are read one by one by their own roads).
 */
const fs = require('fs');
const path = require('path');

const EVERY_MS = 30000;
const WAIT_MS = 2000;
const readers = new Map();   // the folder (resolved) → its one reader

/** of two texts of one reading file, the LATER reading (its fetchedAt); a text that does not parse loses to one that does; a tie keeps `own` */
function laterOf(read, own) {
  if (typeof read !== 'string') return own;
  const at = (t) => { try { const v = JSON.parse(t); return v && typeof v.fetchedAt === 'number' ? v.fetchedAt : -Infinity; } catch { return -Infinity; } };
  return at(read) > at(own) ? read : own;
}
const enoent = (p) => Object.assign(new Error(`ENOENT: not in the usage folder's reply, '${p}'`), { code: 'ENOENT' });

function create(dir, { fsp = fs.promises, now = Date.now, everyMs = EVERY_MS, log = () => { }, fillSync = true } = {}) {
  const DIR = path.resolve(dir);
  let reply = null;                     // the last GOOD reply: { at, texts: Map(name → text) }
  let inflight = null, startedAt = 0, own = null;   // the refresh in flight, when it started, the hub's writes during it
  let next = null;                      // the refresh asked after the one in flight (fresh): shared by every asker
  let failed = null, heldSince = null;  // the last refresh that failed; since when the folder has not given a reply
  let timer = null, said = false;
  const listeners = new Set();
  const skipped = new Map();   // r2120 (3): a reading file that cannot be read now → said once an episode (cleared when it reads again)
  const skip = (n, e) => { const code = (e && e.code) || 'error'; if (!skipped.has(n)) { skipped.set(n, code); log(`[usage-folder] ${DIR}/${n}: cannot be read (${code}) — skipped; its readings are not in the reply until it reads again`); } };
  const readOk = (n) => { if (skipped.delete(n)) log(`[usage-folder] ${DIR}/${n}: reads again`); };
  const jsonOnly = (names) => names.filter((n) => typeof n === 'string' && n.endsWith('.json'));

  function land(texts, at) {
    reply = { at, texts }; failed = null; heldSince = null;
    if (said) { said = false; log(`[usage-folder] ${DIR}: the folder answers again`); }
    for (const fn of listeners) { try { fn(reply); } catch (e) { log(`[usage-folder] a reader of the reply threw: ${(e && e.message) || e}`); } }
    return reply;
  }
  function sayHeld(why) {
    if (heldSince == null) heldSince = failed ? failed.at : startedAt;
    if (said) return;
    said = true;
    const age = reply ? `${Math.round((now() - reply.at) / 1000)} s old` : 'none yet';
    log(`[usage-folder] ${DIR}: ${why} — the readings stand as last read (${age})`);
  }
  async function readOnce() {
    let all;
    try { all = await fsp.readdir(DIR); } catch (e) { if (e && e.code === 'ENOENT') return new Map(); throw e; }   // no folder yet (a fresh install): no readings, truthfully — not a held read
    const names = jsonOnly(all);
    for (const n of [...skipped.keys()]) if (!names.includes(n)) skipped.delete(n);   // r2249: a skipped file that is GONE ends its episode, silently — back and still unreadable, it is said again
    const texts = new Map();
    for (const n of names) {
      // a file that cannot be read now (removed after the list, unreadable, a folder named .json) is SKIPPED, as the release skipped it
      // (r1976 (b)): it never holds the other identities' readings; only the folder's own listing failing holds the reply
      try { texts.set(n, await fsp.readFile(path.join(DIR, n), 'utf8')); readOk(n); } catch (e) { if (!e || e.code !== 'ENOENT') skip(n, e); }
    }
    return texts;
  }
  function refresh() {
    if (inflight) return inflight;
    const at = startedAt = now(); own = new Map();
    const p = readOnce().then((texts) => {
      const mine = own; inflight = null; own = null;
      for (const [n, o] of mine) texts.set(n, o.replace ? o.text : laterOf(texts.get(n), o.text));   // the hub's own writes during the read stand over what it saw — unless the read saw a LATER reading (r1976 (g))
      return land(texts, at);
    }, (e) => {
      inflight = null; own = null;
      failed = { at: now(), code: (e && e.code) || 'error' };
      sayHeld(`a read failed (${failed.code})`);
      return reply;
    });
    inflight = p;
    return p;
  }
  /** a reply from a refresh that STARTED after this ask; past `waitMs` the kept reply (its state says how old). */
  function fresh({ waitMs = WAIT_MS } = {}) {
    if (inflight && now() - startedAt >= everyMs) { sayHeld('a read has not replied'); return Promise.resolve(reply); }   // r1976 (f): no chain on a hung read
    const p = !inflight ? refresh() : (next || (next = inflight.then(() => { next = null; return refresh(); })));
    if (!(waitMs > 0)) return p;
    return new Promise((resolve) => {
      const t = setTimeout(() => { if (inflight && now() - startedAt >= waitMs) sayHeld('a read has not replied'); resolve(reply); }, waitMs);
      if (t && t.unref) t.unref();
      p.then((r) => { clearTimeout(t); resolve(r); });
    });
  }
  function tick() {
    if (inflight) { if (now() - startedAt >= everyMs) sayHeld('a read has not replied'); return; }
    refresh();
  }
  function start() { if (!timer) { timer = setInterval(tick, everyMs); if (timer && timer.unref) timer.unref(); } return api; }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function noteWritten(name, text, { replace = false } = {}) {
    if (typeof name !== 'string' || !name.endsWith('.json') || typeof text !== 'string') return;
    if (reply) reply.texts.set(name, text);
    if (own) { const was = own.get(name); own.set(name, { text, replace: !!replace || !!(was && was.replace) }); }   // r2120 (1): a repair's replace stands over a read in flight; a reading keeps the later one — r2249: once a replace is noted in this read, a later own write for that name stands OUTRIGHT (the file holds its text)
  }
  function state() {
    const t = now();
    const hung = !!inflight && t - startedAt >= everyMs;
    const held = !!failed || hung;
    return { asOf: reply ? reply.at : null, ageMs: reply ? t - reply.at : null, held, since: held ? (heldSince != null ? heldSince : startedAt) : null, error: failed ? failed.code : (hung ? 'not-replying' : null) };
  }
  const via = {
    readdir(d) { if (path.resolve(d) !== DIR) throw enoent(d); return reply ? [...reply.texts.keys()] : []; },
    readText(file) {
      const f = path.resolve(file), n = path.basename(f);
      if (path.dirname(f) !== DIR || !reply || !reply.texts.has(n)) throw enoent(file);
      return reply.texts.get(n);
    },
  };
  const api = { dir: DIR, via, refresh, fresh, tick, start, stop, state, noteWritten, onReply(fn) { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); }, reply: () => reply };
  if (fillSync) {
    // THE BOOT'S ONE SYNCHRONOUS PASS (the boot read this folder synchronously before: the ingestion at setupUsage)
    try {
      const texts = new Map();
      for (const n of jsonOnly(fs.readdirSync(DIR))) { try { texts.set(n, fs.readFileSync(path.join(DIR, n), 'utf8')); } catch (e) { if (!e || e.code !== 'ENOENT') skip(n, e); } }   // r2120 (2): one unreadable file skipped at the boot too
      reply = { at: now(), texts };
    } catch (e) { if (e && e.code === 'ENOENT') reply = { at: now(), texts: new Map() }; else { failed = { at: now(), code: (e && e.code) || 'error' }; sayHeld(`the first read failed (${failed.code})`); } }
  }
  return api;
}
/** THE one reader of a folder (made at its first ask; `opts` apply then). */
function forDir(dir, opts) {
  const k = path.resolve(dir);
  let r = readers.get(k);
  if (!r) { r = create(k, opts); readers.set(k, r); }
  return r;
}
/** the write path's notice (src/usage-cache-write.js): a file the hub wrote replaces its entry in its folder's reply */
function noteWrittenFile(file, text, opts) {
  const r = readers.get(path.dirname(path.resolve(String(file))));
  if (r) r.noteWritten(path.basename(String(file)), text, opts);
}
try { require('./usage-cache-write.js').onWritten(noteWrittenFile); } catch { }

module.exports = { create, forDir, noteWrittenFile, laterOf, EVERY_MS, WAIT_MS };
