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
const fs = require('fs');
const path = require('path');
const SR = require('./store-read.js');
const COPY_LOOK = 20;   // the newest copies of torn bytes compared at a keep (more beside one store are a person's to clear)

function create({ file, valid = () => true, aside, words, code, log = () => { }, onLift = null, now = Date.now } = {}) {
  if (!file || typeof aside !== 'function' || typeof words !== 'function' || !code) throw new Error('store-read-hold: file, aside, words and code are required');
  const name = path.basename(file);
  let held = null, tries = 0, timer = null, inflight = null, seq = 0, missingAt = 0, stopped = false, saveSaid = false;
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
    held = { code: torn ? 'torn bytes' : String((a && a.code) || 'unreadable'), why: (a && a.why) || null, since: now() };
    log(torn ? `${name} did not parse (${held.why}) — held while its bytes are copied aside; then it starts empty`
      : `${name} could not be read (${held.code}) — held: nothing is written over it, changes to it are refused, and it is read again off the main loop`);
    if (torn) Promise.resolve().then(again).catch(onErr); else arm();   // torn: the copy at once (off the loop); failed: the ladder
    return 'held';
  }
  /** ONE read again, off the loop → true when the hold lifted */
  async function again() {
    if (!held || stopped) return false;
    arm();   // the next try armed FIRST: a try that meets one in flight, or a read that fails, never ends the tries
    if (inflight) return false;
    const mine = ++seq;
    inflight = fs.promises.readFile(file).then((buf) => ({ text: buf.toString('utf8'), buf }), (error) => ({ error }));
    const read = await inflight; inflight = null;
    if (!held || stopped || mine !== seq) return false;
    let a = SR.storeAnswer(read, { valid });
    if (a.state === 'unreadable') { held.code = String(a.code || 'unreadable'); missingAt = 0; return false; }
    if (a.state === 'missing' && !missingAt) { missingAt = now(); return false; }
    if (a.state === 'corrupt') {
      const kept = await keep(read.buf);
      if (!held || stopped || mine !== seq) return false;   // a newer try read meanwhile — its answer stands
      a = SR.afterSetAside(a, kept);
      if (a.state === 'unreadable') { held.code = 'torn bytes, not copied'; return false; }
    }
    const was = held; held = null; tries = 0; missingAt = 0; saveSaid = false;
    if (timer) { clearTimeout(timer); timer = null; }
    log(`${name} read again (held since ${new Date(was.since).toISOString()}, ${was.code}): ${a.state === 'data' ? 'its records are back' : a.setAside ? `torn bytes, kept aside as ${a.setAside} — it starts empty` : 'the file is gone — it starts empty'}`);
    try { onLift?.(a.state === 'data' ? a.value : null, { was, setAside: a.setAside || null }); } catch (e) { log(`${name}: its lift's hooks failed: ${(e && e.message) || e}`); }
    return true;
  }
  const facts = () => (held ? { file: name, code: held.code, since: held.since } : null);
  /** the refusal BY NAME (503, the caller's code) — `what` the change refused */
  const refusal = (what) => Object.assign(new Error(`${what}: ${words(facts())}`), { code, status: 503 });
  return {
    start, again, refusal, held: facts,
    /** a door's guard: throws the refusal while held */
    refuse(what) { if (held) throw refusal(what); },
    /** the words a person reads while held (null: not held) */
    words: () => (held ? words(facts()) : null),
    /** the caller's save asks it: false while held — nothing is written over the file (said ONCE a hold in the journal) */
    writable(what = 'a write') { if (!held) return true; if (!saveSaid) { saveSaid = true; log(`${what} to ${name} was refused: the file could not be read, and nothing is written over it until it reads`); } return false; },
    stop() { stopped = true; if (timer) { clearTimeout(timer); timer = null; } },
    file,
  };
}

module.exports = { create };
