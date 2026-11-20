'use strict';
// THE STORE HOLD (lane lg-store-writes, B-225b — 主开发's shape of 2026-11-20 04:37Z, R1–R13): ONE store's read, its hold and its
// ONE write, for the stores that hold what cannot be asked again (src/routes/persistence.js: layouts, the conversation list,
// bookmarks, custom themes, settings).
//
// THE READ (src/store-read.js, three answers): `data` is the value; `missing` WRITES NOTHING (the defaults live in the caller's
// memory, the file is born by the first real change through an EXCLUSIVE create — a file found there is read and adopted, the
// change refused by name); anything else HOLDS — and a held store HAS NO VALUE (R1): no document, no defaults under its name.
// THE KIND (R5): `unreadable` (the read failed and may answer later), `damaged` (bytes read whole that are not the store — they will
// not mend: the caller opens ONE door, a person's whole replace), `not-allowed` (a permission).
// THE LADDER (R7): quick SILENT reads again (about 15 s in all — a bad read shorter than that is a slower load, nothing said, no
// refusal that uses anything up: the hold's `rung` is 'silent'), then 30 s doubling to 5 min; one read in flight; off the loop.
// THE WRITE (R1, R10): one function, one flush, both refuse a store with no value BY NAME; every temp name carries the pid.
// A hold begins only at a START (R12): a failed RE-read of a store that has its value never replaces it — there is no re-read here.

const fs = require('fs');
const path = require('path');
const SR = require('./store-read.js');

const SILENT_RUNGS_MS = Object.freeze([1000, 2000, 4000, 8000]);   // ≈15 s of quick, silent reads again
const LADDER = Object.freeze({ firstMs: 30000, maxMs: 300000 });

/** a read's answer → the hold's kind */
function kindOf(a) {
  if (!a) return 'unreadable';
  if (a.state === 'corrupt') return 'damaged';
  const code = a.error && a.error.code;
  return code === 'EACCES' || code === 'EPERM' ? 'not-allowed' : 'unreadable';
}

/** a named refusal (an Error with the HTTP status and the hold's facts) */
function unreadError(file, held, what) {
  const words = `${what ? `${what} was refused: ` : ''}${path.basename(file)} could not be read (${held.kind}${held.code ? `, ${held.code}` : ''}) — nothing is written over it`;
  return Object.assign(new Error(words), { status: 503, code: 'store_unread', held: { file: path.basename(file), kind: held.kind, code: held.code || null, since: held.since, rung: held.rung } });
}

/**
 * create({ file, valid, parse, now, log, silentMs, ladder, onLift, onSaid, schedule })
 *   file      the store's path
 *   valid     the store's shape (store-read's `valid`)
 *   onLift    (value, was) — the hold lifted: the caller's lift is a CHANGE (its hooks run, its pages are told «read again»)
 *   onSaid    (held) — the hold outlasted the silent rungs: the caller says it (the banner, an episode's notice)
 */
function create({ file, valid = () => true, parse = JSON.parse, now = Date.now, log = console, silentMs = SILENT_RUNGS_MS, ladder = LADDER, onLift = null, onSaid = null, schedule = null } = {}) {
  if (!file) throw new Error('store-hold: file is required');
  let value;                 // the document (undefined: none — held, or not read yet)
  let held = null;           // { kind, code, why, since, rung }
  let missing = false;
  let tries = 0, timer = null, inflight = null, stopped = false;
  const later = schedule || ((fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; });
  const answerOf = (read) => SR.storeAnswer(read, { parse, valid });

  /** THE READ AT THE START (sync — a start reads its stores before it serves). → 'data' | 'missing' | 'held' */
  function readAtStart() {
    let read; try { read = { text: fs.readFileSync(file, 'utf8') }; } catch (error) { read = { error }; }
    const a = answerOf(read);
    if (a.state === 'data') { value = a.value; missing = false; return 'data'; }
    if (a.state === 'missing') { missing = true; return 'missing'; }
    held = { kind: kindOf(a), code: a.code || null, why: a.why || null, since: now(), rung: 'silent' };
    tries = 0; arm();
    return 'held';
  }
  function arm() {
    if (stopped || !held || timer) return;
    const ms = tries < silentMs.length ? silentMs[tries] : SR.retryDelay(tries - silentMs.length + 1, ladder);
    timer = later(() => { timer = null; readAgain().catch((e) => { log.warn?.(`[store-hold] ${path.basename(file)}: a read again failed: ${(e && e.message) || e}`); arm(); }); }, ms);
  }
  /** ONE read again, OFF the loop, one in flight → true when the hold lifted */
  async function readAgain() {
    if (!held || inflight) return false;
    inflight = fs.promises.readFile(file, 'utf8').then((text) => ({ text }), (error) => ({ error }));
    const read = await inflight; inflight = null;
    if (!held || stopped) return false;
    tries++;
    const a = answerOf(read);
    if (a.state === 'data') {
      const was = held; held = null; value = a.value; missing = false; tries = 0;
      try { onLift?.(value, was); } catch (e) { log.warn?.(`[store-hold] ${path.basename(file)}: its lift's hooks failed: ${(e && e.message) || e}`); }
      return true;
    }
    // still held: a file GONE since the hold stays held (the next START judges a truly absent file); the kind follows the read
    if (a.state !== 'missing') { held.kind = kindOf(a); held.code = a.code || null; held.why = a.why || null; }
    if (held.rung === 'silent' && tries >= silentMs.length) { held.rung = 'said'; try { onSaid?.({ ...held }); } catch { /* said by the caller */ } }
    arm();
    return false;
  }

  /** the value, or the refusal by name (R2: a held read answers the refusal and nothing else) */
  function answer(what = null) { if (held) throw unreadError(file, held, what); return value; }
  /** refuse by name while held (a door's guard) */
  function refuseIfHeld(what) { if (held) throw unreadError(file, held, what); }

  /** THE ONE WRITE (R1, R10): refuses a store with no value BY NAME; whole bytes, a pid temp name, then the rename — or, for a store
   *  that read `missing`, an EXCLUSIVE create (R6: a file found there is read and adopted, the change refused by name). → true */
  function write(next, text) {
    if (held) throw unreadError(file, held, 'this change');
    const bytes = typeof text === 'string' ? text : JSON.stringify(next, null, 2);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, bytes);
    if (missing) {
      try { fs.linkSync(tmp, file); }
      catch (e) {
        try { fs.unlinkSync(tmp); } catch { /* gone */ }
        if (e && e.code === 'EEXIST') {   // a file arrived where the read found none (a late mount): adopted, never written over
          missing = false; value = undefined;
          let read; try { read = { text: fs.readFileSync(file, 'utf8') }; } catch (error) { read = { error }; }
          const a = answerOf(read);
          if (a.state === 'data') value = a.value; else { held = { kind: kindOf(a), code: a.code || null, why: a.why || null, since: now(), rung: 'silent' }; tries = 0; arm(); }
          throw Object.assign(new Error(`${path.basename(file)} appeared since the start — it is read and kept; this change was not made`), { status: 409, code: 'store_appeared' });
        }
        throw e;
      }
      try { fs.unlinkSync(tmp); } catch { /* the link stands */ }
      missing = false;
    } else fs.renameSync(tmp, file);
    value = next;
    return true;
  }
  /** the caller's in-memory value after a change it will write (the copy in memory is the truth while it exists — R12) */
  function set(next) { if (held) throw unreadError(file, held, 'this change'); value = next; }
  function stop() { stopped = true; if (timer) { (schedule ? null : clearTimeout(timer)); timer = null; } }

  return {
    readAtStart, readAgain, answer, refuseIfHeld, write, set, stop,
    held: () => (held ? { file: path.basename(file), kind: held.kind, code: held.code, since: held.since, rung: held.rung } : null),
    isMissing: () => missing, file,
  };
}

module.exports = { create, kindOf, unreadError, SILENT_RUNGS_MS, LADDER };
