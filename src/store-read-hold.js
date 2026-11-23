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
//   THE LIVE HOLDS AS A LIST: holds() — one read-only list of every hold alive ({ file, code, since, torn, copy, held }; a lift from
//     torn bytes stays listed with held false and its copy's name until the store stops: the person is told where the copy is) and
//     readAgainOf(file) — a read again of one of them (the family's one notice reads them).
//   A TORN LIFT SAYS SO: onLift's facts carry setAside, and torn() answers { copy, since, at } for that run (the store's words).
const fs = require('fs');
const path = require('path');
const SR = require('./store-read.js');
const COPY_LOOK = 20;   // the newest copies of torn bytes compared at a keep (more beside one store are a person's to clear)
const CEILING = 4;      // round wom600meg (2): the helper's reads in flight across ALL stores (the hub's file pool is shared)
let active = 0;         // …the reads (with their copies) in flight now, every store's
const LIVE = new Set(); // every hold made and not stopped (holds() reads their facts)

function create({ file, valid = () => true, aside, words, code, log = () => { }, onLift = null, now = Date.now } = {}) {
  if (!file || typeof aside !== 'function' || typeof words !== 'function' || !code) throw new Error('store-read-hold: file, aside, words and code are required');
  const name = path.basename(file);
  let held = null, tries = 0, timer = null, busy = false, missingAt = 0, stopped = false, saveSaid = false, tornLift = null;
  const prefix = path.basename(aside(''));   // the copies' common head (`<file>.corrupt-`)
  const onErr = (e) => { log(`${name}: a read again failed: ${(e && e.message) || e}`); arm(); };
  function arm() {
    if (stopped || !held || timer) return;
    timer = setTimeout(() => { timer = null; again().catch(onErr); }, SR.retryDelay(++tries));
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
      try { await fs.promises.writeFile(to, buf, { flag: 'wx', mode: 0o600 }); return path.basename(to); } catch (e) { if (!e || e.code !== 'EEXIST') return null; }
    }
    return null;
  }
  /** THE START: store-read's answer of the caller's one read → 'data' | 'missing' | 'held' */
  function start(a) {
    if (a && (a.state === 'data' || a.state === 'missing')) return a.state;
    const torn = !!a && a.state === 'corrupt';
    held = { code: torn ? 'torn bytes' : String((a && a.code) || 'unreadable'), why: (a && a.why) || null, since: now(), torn };
    log(torn ? `${name} did not parse (${held.why}) — held while its bytes are copied aside; then it starts empty`
      : `${name} could not be read (${held.code}) — held: nothing is written over it, changes to it are refused, and it is read again off the main loop`);
    if (torn) Promise.resolve().then(again).catch(onErr); else arm();   // torn: the copy at once (off the loop); failed: the ladder
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
      if (a.state === 'unreadable') { held.code = String(a.code || 'unreadable'); missingAt = 0; return false; }
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
    return true;
  }
  const facts = () => (held ? { file: name, code: held.code, since: held.since } : null);
  /** the refusal BY NAME (503, the caller's code) — `what` the change refused */
  const refusal = (what) => Object.assign(new Error(`${what}: ${words(facts())}`), { code, status: 503 });
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
    stop() { stopped = true; LIVE.delete(H); if (timer) { clearTimeout(timer); timer = null; } },
    file,
    /** (the list's row — holds() below) */
    _entry: () => (held ? { file: name, code: held.code, since: held.since, torn: !!held.torn, copy: null, held: true }
      : tornLift ? { file: name, code: 'torn bytes', since: tornLift.since, torn: true, copy: tornLift.copy, held: false } : null),
  };
  LIVE.add(H);
  return H;
}

/** THE LIVE HOLDS (round wom600meg (3)): every hold alive, and every lift from torn bytes of this run (held: false, its copy named) —
 *  a frozen list of frozen rows; nothing here acts */
function holds() { const out = []; for (const h of LIVE) { const e = h._entry(); if (e) out.push(Object.freeze(e)); } return Object.freeze(out); }
/** a read again of ONE held store, by its file's base name → true when it lifted (false: not held, not found, or its turn not come) */
async function readAgainOf(fileName) { for (const h of LIVE) if (path.basename(h.file) === String(fileName) && h.held()) return h.again(); return false; }

module.exports = { create, holds, readAgainOf, CEILING };
