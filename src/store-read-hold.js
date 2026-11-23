'use strict';
// THE STORE-READ HOLD (B-f276 family unit 1, lane bl-jobs — 主开发 r2930): the store-read law (src/store-read.js) for a store that
// keeps its OWN state and its own save — mounts.json (src/mounts.js), mount-tokens.json (src/webdav.js), plugins.json
// (src/plugins.js). The release read ANY failure of their read as «nothing stored» and the next ordinary save wrote over the file.
// The caller reads at its start (its one sync read, as before), answers it through SR.storeAnswer in its own file, and hands it here:
//   data        → 'data': the caller loads the value
//   missing     → 'missing': the caller starts empty, as before
//   corrupt     → torn bytes: HELD while their copy is made OFF the loop — `aside(mark)` is the caller's dated name for it; a copy
//                 of THE SAME BYTES already beside the store (an earlier start met the same torn file) IS their copy and none is made
//                 (kept aside ONCE per content — compared byte for byte, never a digest written under data/); copied ⇒ lifted as
//                 EMPTY; no place for the copy ⇒ the hold stands (the live file is their only copy)
//   unreadable  → HELD: no value; the caller refuses every change by name (`refuse(what)`), its save writes nothing (`writable()`);
// HELD, the file is read again OFF the loop on store-read's ladder (30 s doubling to 5 min — one timer, never a storm), ONE read in
// flight, only the newest try lifts; a «missing» right after a failed read is read once more (a storage coming back answers ENOENT
// first). LIFTED: onLift(value | null, facts) — the caller loads the value (null: empty) and does what its start skipped. Nothing
// is written while held, so a START while held reads the same file again: the hold stands until a read answers.
// ROUND wom600meg (主开发 r3029 — additions only, the interface the stores use does not move):
//   ONE IN FLIGHT is the read AND its copy: a keep whose folder listing or stat hangs after a read answered holds the store's turn —
//     the next tick starts no second read (never two pool threads a store, never two copies of one content).
//   THE FAMILY'S CEILING on the hub's shared file pool: at most CEILING (4) of these reads in flight across EVERY store — a store over
//     it keeps its ladder armed and waits its turn (twenty stores on a data folder that hangs hold four threads, never twenty).
//     FOUR HUNG READS HOLD THEIR SLOTS UNTIL A RESTART (round w9jhivwdo (1)): every store of ONE storage hangs alike, so nothing is
//     lost; a store on a SECOND storage that answers would starve behind them — no such store exists today (all of them live in the
//     data folder): the lane that adds one gives it its own ceiling. PAST THE CEILING the order is whichever store's timer fires
//     first (round w9jhivwdo (2)) — no queue, no priority.
//   THE LIVE HOLDS AS A LIST: holds() — one read-only list of every hold alive ({ key, file, code, since, torn, copy, held }; a lift
//     from torn bytes stays listed with held false and its copy's name until the store stops: the person is told where the copy is)
//     and readAgainOf(key | row | base name) — a read again of one of them (the family's one notice reads them). A store is matched
//     by its FULL PATH inside (its row's opaque `key`); the rows hand out the BASE name only; a base name two held stores share in
//     two folders matches neither (round w9jhivwdo (3)). A hold's code is the error's own CODE or NAME, clamped — never its message,
//     which may hold a path (round w9jhivwdo (4)).
//   A TORN LIFT SAYS SO: onLift's facts carry setAside, and torn() answers { copy, since, at } for that run (the store's words).
const fs = require('fs');
const path = require('path');
const SR = require('./store-read.js');
const NO_LINK = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV']);   // a hard link the FILESYSTEM refuses (not a name there)
/** THE COPY WRITTEN WHOLE (主开发 r3144): under a PART name (hidden — `.<name>.part`, never a copy's prefix: no reader lists it),
 *  0600 from its first byte, synced, then put in place by an exclusive hard link only when whole (a filesystem with no links: an
 *  exclusive copy, removed if it fails part-way — it is ours). A write or a sync that fails removes the part and fails the keep:
 *  no short file is ever left at a copy's name. → { ok } | { error } */
async function writeWhole(to, buf, log = () => { }) {
  const part = path.join(path.dirname(to), '.' + path.basename(to) + '.part');
  let fh = null;
  try { fh = await fs.promises.open(part, 'wx', 0o600); await fh.writeFile(buf); await fh.sync(); }
  catch (e) {
    if (fh) { try { await fh.close(); } catch (e2) { log(`${path.basename(part)} did not close after its write failed (${(e2 && e2.code) || e2})`); } }
    await fs.promises.unlink(part).catch(() => { }); return { error: e };
  }
  try { await fh.close(); } catch (e) { await fs.promises.unlink(part).catch(() => { }); return { error: e }; }   // a close that fails fails the keep (its bytes may not be whole)
  try { await fs.promises.link(part, to); }
  catch (e) {
    if (!e || !NO_LINK.has(e.code)) { await fs.promises.unlink(part).catch(() => { }); return { error: e }; }
    try { await fs.promises.copyFile(part, to, fs.constants.COPYFILE_EXCL); }
    catch (e2) { if (!e2 || e2.code !== 'EEXIST') await fs.promises.unlink(to).catch(() => { }); await fs.promises.unlink(part).catch(() => { }); return { error: e2 }; }
  }
  await fs.promises.unlink(part).catch(() => { });
  return { ok: true };
}
const COPY_LOOK = 20;   // the newest copies of torn bytes compared at a keep (more beside one store are a person's to clear)
const CEILING = 4;      // round wom600meg (2): the helper's reads in flight across ALL stores (the hub's file pool is shared)
let active = 0;         // …the reads (with their copies) in flight now, every store's
let keys = 0;           // the opaque keys the list hands out (a hold's full path stays inside)
/** a read's answer → the hold's code: the error's own CODE or NAME (a word), never its message (which may name a path) */
function codeOf(a) {
  const e = a && a.error, c = e ? (e.code || e.name) : (a && a.code);   // (an answer with no error object: its own code, clamped the same)
  if (typeof c === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(c)) return c;
  return a && a.state === 'corrupt' ? 'torn bytes' : 'unreadable';
}
const LIVE = new Set(); // every hold made and not stopped (holds() reads their facts)
// B-f276 unit B (主开发 r3032, lane bl-phone-ui): THE SET's CHANGE — a hold begun, lifted or stopped tells its listeners (the family's ONE
// notice: src/server/held-lists.js broadcasts the list); a listener's throw never reaches a store
const CHANGE = new Set();
const changed = () => { for (const fn of [...CHANGE]) { try { fn(); } catch { /* a listener's own */ } } };
function onHoldsChange(fn) { if (typeof fn !== 'function') return () => {}; CHANGE.add(fn); return () => CHANGE.delete(fn); }

function create({ file, valid = () => true, aside, words, code, log = () => { }, onLift = null, now = Date.now } = {}) {
  if (!file || typeof aside !== 'function' || typeof words !== 'function' || !code) throw new Error('store-read-hold: file, aside, words and code are required');
  const name = path.basename(file);
  let held = null, tries = 0, timer = null, busy = false, missingAt = 0, stopped = false, saveSaid = false, tornLift = null, nextAt = 0;   // nextAt: B-f276 unit B — the armed read again's due time (the family's notice says the next try)
  const prefix = path.basename(aside(''));   // the copies' common head (`<file>.corrupt-`)
  const onErr = (e) => { log(`${name}: a read again failed: ${(e && e.message) || e}`); arm(); };
  function arm() {
    if (stopped || !held || timer) return;
    const ms = SR.retryDelay(++tries);
    nextAt = now() + ms;
    timer = setTimeout(() => { timer = null; again().catch(onErr); }, ms);
    timer.unref?.();
  }
  /** the torn bytes' copy, OFF the loop. A copy of THESE bytes already beside the store (the same size, the same bytes — the newest
   *  COPY_LOOK copies are compared) IS their copy: nothing new is made. Else an exclusive create of the caller's dated name (0600 — a
   *  store may hold sealed secrets) → the copy's basename, or null (no place for it) */
  async function keep(buf) {
    const dir = path.dirname(file);
    let names = [];
    try { names = (await fs.promises.readdir(dir)).filter((n) => n.startsWith(prefix)).sort().slice(-COPY_LOOK); } catch { names = []; }
    for (const n of names.reverse()) {
      try { const p = path.join(dir, n); const st = await fs.promises.stat(p); if (st.isFile() && st.size === buf.length && (await fs.promises.readFile(p)).equals(buf)) return n; } catch { /* not this one */ }
    }
    for (let k = 0; k < 5; k++) {
      const to = aside(String(now()) + (k ? '-' + k : ''));
      const w = await writeWhole(to, buf, log);   // r3144: whole under a part name, synced, put in place only when whole
      if (w.ok) { const c = COPIES.get(file + '\n' + prefix); if (c) c.invalidate(); return path.basename(to); }   // (a copy added: its store's copies' answer read again)
      if (!w.error || w.error.code !== 'EEXIST') return null;
    }
    return null;
  }
  /** THE START: store-read's answer of the caller's one read → 'data' | 'missing' | 'held' */
  function start(a) {
    if (a && (a.state === 'data' || a.state === 'missing')) return a.state;
    const torn = !!a && a.state === 'corrupt';
    held = { code: torn ? 'torn bytes' : codeOf(a), why: (a && a.why) || null, since: now(), torn };
    log(torn ? `${name} did not parse (${held.why}) — held while its bytes are copied aside; then it starts empty`
      : `${name} could not be read (${held.code}) — held: nothing is written over it, changes to it are refused, and it is read again off the main loop`);
    if (torn) Promise.resolve().then(again).catch(onErr); else arm();   // torn: the copy at once (off the loop); failed: the ladder
    changed();   // B-f276 unit B: the family's notice hears the set change
    return 'held';
  }
  /** ONE read again, off the loop → true when the hold lifted. ONE in flight a store (the read AND its copy), at most CEILING across
   *  the family; a try that meets either waits for its next rung (armed first) */
  async function again() {
    if (!held || stopped) return false;
    arm();   // the next try armed FIRST: a try that meets one in flight, the ceiling, or a read that fails never ends the tries
    if (busy || active >= CEILING) return false;
    busy = true; active++;
    let a;
    try {
      const read = await fs.promises.readFile(file).then((buf) => ({ text: buf.toString('utf8'), buf }), (error) => ({ error }));
      if (!held || stopped) return false;
      a = SR.storeAnswer(read, { valid });
      if (a.state === 'unreadable') { held.code = codeOf(a); missingAt = 0; return false; }
      if (a.state === 'missing' && !missingAt) { missingAt = now(); return false; }
      if (a.state === 'corrupt') {
        held.torn = true;
        const kept = await keep(read.buf);
        if (!held || stopped) return false;
        a = SR.afterSetAside(a, kept);
        if (a.state === 'unreadable') { held.code = 'torn bytes, not copied'; return false; }
      }
    } finally { busy = false; active--; }
    const was = held; held = null; tries = 0; missingAt = 0; saveSaid = false;
    if (timer) { clearTimeout(timer); timer = null; }
    if (a.setAside) tornLift = { copy: a.setAside, since: was.since, at: now() };
    log(`${name} read again (held since ${new Date(was.since).toISOString()}, ${was.code}): ${a.state === 'data' ? 'its records are back' : a.setAside ? `torn bytes, kept aside as ${a.setAside} — it starts empty` : 'the file is gone — it starts empty'}`);
    try { onLift?.(a.state === 'data' ? a.value : null, { was, setAside: a.setAside || null }); } catch (e) { log(`${name}: its lift's hooks failed: ${(e && e.message) || e}`); }
    nextAt = 0; changed();   // B-f276 unit B: lifted — the notice hears it
    return true;
  }
  const facts = () => (held ? { file: name, code: held.code, since: held.since } : null);
  /** the refusal BY NAME (503, the caller's code) — `what` the change refused */
  const refusal = (what) => Object.assign(new Error(`${what}: ${words(facts())}`), { code, status: 503 });
  const key = 'h' + (++keys);
  const H = {
    start, again, refusal, held: facts,
    /** a lift from torn bytes in this run: { copy, since, at } (the copy's basename) — null when none */
    torn: () => (tornLift ? { ...tornLift } : null),
    /** a door's guard: throws the refusal while held */
    refuse(what) { if (held) throw refusal(what); },
    /** the words a person reads while held (null: not held) */
    words: () => (held ? words(facts()) : null),
    /** the caller's save asks it: false while held — nothing is written over the file (said ONCE a hold in the journal) */
    writable(what = 'a write') { if (!held) return true; if (!saveSaid) { saveSaid = true; log(`${what} to ${name} was refused: the file could not be read, and nothing is written over it until it reads`); } return false; },
    stop() { const listed = !!held || !!tornLift; stopped = true; LIVE.delete(H); if (timer) { clearTimeout(timer); timer = null; } if (listed) changed(); },
    file,
    /** (the list's row — holds() below) */
    _key: key,
    _entry: () => (held ? { key, file: name, code: held.code, since: held.since, torn: !!held.torn, copy: null, held: true, next: nextAt || null }
      : tornLift ? { key, file: name, code: 'torn bytes', since: tornLift.since, torn: true, copy: tornLift.copy, held: false } : null),
  };
  LIVE.add(H);
  return H;
}

/** THE KEPT COPIES' QUESTION (主开发 r3115 (2) — the family's law: A REMOVER NEVER REMOVES WHAT A KEPT COPY OF TORN BYTES STILL
 *  NAMES). copiesOf({ file, prefix }) → { names(id), ready(), refresh() } for a store whose torn bytes are kept beside it under
 *  `prefix…` (the store's own set-aside name; a store not on this helper hands its own). `names(id)` answers from MEMORY — true when
 *  one of the newest COPY_LOOK copies holds the id as it is written in the file (a JSON string: `"<id>"`), false when none does;
 *  an id that cannot be judged (the copies not read yet, their folder or a copy did not answer) is NAMED (unknown keeps). The
 *  copies are read OFF THE LOOP — again when a copy is added here, and once a minute at most while asked (a copy a person cleared
 *  is seen then), ONE read in flight a store — so a remover's tick makes no read of its own. It holds across restarts with no mark
 *  to lose: a person ends it by pairing the thing again (its id then in the live list) or by clearing the copy. */
const COPIES = new Map();
const RELIST_MS = 60e3;
const COPY_MAX = 8 * 1024 * 1024;   // a copy bigger than this is not read whole — its store's every id is NAMED (unknown keeps)
/** the ids a copy holds — every JSON string in its bytes, read ONCE at the copy's read (round wxzvih2as: an ask is then a Set lookup,
 *  never a search of every copy's text on the loop) */
function idsOfText(text) {
  const out = new Set(), re = /"((?:[^"\\\n]|\\.){1,240})"/g;
  let m; while ((m = re.exec(text))) { try { out.add(JSON.parse('"' + m[1] + '"')); } catch { out.add(m[1]); } }
  return out;
}
function copiesOf({ file, prefix } = {}) {
  if (!file || !prefix) throw new Error('store-read-hold: copiesOf needs the file and its copies\' prefix');
  const keyOf = file + '\n' + prefix;
  if (COPIES.has(keyOf)) return COPIES.get(keyOf);
  const dir = path.dirname(file);
  let ids = null, failed = false, listedAt = 0, listed = null, inflight = null, againAfter = false;
  async function refresh() {
    if (inflight) { againAfter = true; return inflight; }   // a read asked while one is in flight (a copy made meanwhile): one more after it
    inflight = (async () => {
      try {
        const all = (await fs.promises.readdir(dir)).filter((n) => n.startsWith(prefix)).sort().slice(-COPY_LOOK);
        listedAt = Date.now();
        if (ids && !failed && listed && listed.join('\n') === all.join('\n')) return;   // the same copies: the answer stands
        const set = new Set();
        for (const n of all) {
          const p = path.join(dir, n);
          if ((await fs.promises.stat(p)).size > COPY_MAX) throw new Error(`${n} is over the copies' bound`);   // unknown keeps
          for (const x of idsOfText(await fs.promises.readFile(p, 'utf8'))) set.add(x);
        }
        ids = set; listed = all; failed = false;
      } catch { failed = true; listedAt = Date.now(); }
    })().finally(() => { inflight = null; if (againAfter) { againAfter = false; refresh().catch(() => { }); } });
    return inflight;
  }
  const C = {
    /** true: a kept copy names `id` — or it cannot be judged (unknown keeps); false: no kept copy names it */
    names(id) {
      if (!inflight && Date.now() - listedAt >= RELIST_MS) refresh().catch(() => { });
      if (!ids || failed) return true;
      return ids.has(String(id));
    },
    /** the copies were read (false: every id is named) */
    ready: () => !!ids && !failed,
    refresh,
    /** round wxzvih2as's MUST: THE ANSWER IS NEVER OLDER THAN THE NEWEST COPY THIS PROCESS MADE — a store that makes its own copy of
     *  torn bytes calls this right after: every id is NAMED until the copies are read again (off the loop) */
    invalidate() { ids = null; listed = null; listedAt = 0; refresh().catch(() => { }); },
    /** read the copies if they were never read (one listing at most — a caller that asks often never re-lists by itself) */
    warm() { if (!ids && !inflight) refresh().catch(() => { }); },
  };
  COPIES.set(keyOf, C);
  return C;
}

/** THE LIVE HOLDS (round wom600meg (3)): every hold alive, and every lift from torn bytes of this run (held: false, its copy named) —
 *  a frozen list of frozen rows; nothing here acts */
function holds() { const out = []; for (const h of LIVE) { const e = h._entry(); if (e) out.push(Object.freeze(e)); } return Object.freeze(out); }
/** a read again of ONE held store — by its row (or the row's key), else by a base name that ONE held store alone carries (two stores
 *  of one base name in two folders match neither) → true when it lifted (false: not held, not found, ambiguous, or its turn not come) */
async function readAgainOf(which) {
  const key = which && typeof which === 'object' ? which.key : String(which || '');
  for (const h of LIVE) if (h._key === key) return h.held() ? h.again() : false;
  const named = [...LIVE].filter((h) => path.basename(h.file) === key && h.held());
  return named.length === 1 ? named[0].again() : false;
}

module.exports = { create, holds, readAgainOf, onHoldsChange, copiesOf, CEILING };
