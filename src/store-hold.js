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
// THE OWED WRITE (B-225b's second half, 主开发 r662): a write that FAILS while the store has its value (the storage refused it — never a
// refusal by name) is OWED: the caller's memory holds the truth, its `produce` makes the bytes again at every try, retried on the
// hold's OWN ladder (the silent rungs, then 30 s doubling to 5 min) — never dropped, never swallowed. SAID once past the silent rungs
// (onUnsaved: every page told — nothing is said for a failure the next rung cures; a person's PRESS says it at once), LIFTED when a
// write lands (onSaved, for a said one only). A flush at the stop that fails is the caller's journal line (owed() names it).
// THE WRITE OFF THE LOOP (lane bl-loop-b, B-0248 (c) — 主开发 r912; measured: at 500 ms a rename every write of these stores held the
// hub's loop 501 ms, before its own answer): a store handed a WRITER (create({ writer })) writes through owe(next, { name, bytes }) —
// `name` its row of src/timed-sync.js STORES, a literal at the call (test-architecture §72 reads it there): the change
// is the store's value AT ONCE — the PENDING state, so the next change builds on it (one queue a store: the store writer writes one
// version of a file at a time, each a later one) — and its bytes go to the store writer's thread, made on the main thread when the
// write is due (a burst of changes is ONE write). The main loop never waits on the storage. THE ANSWER waits for the LANDING:
// after(answer) — answer(true) once the version owed NOW is on disk, answer(false) when it failed or passed the writer's bound (the
// writer keeps it and writes it again). onLanded(value): the value that LANDED, told once a write — what a store tells its pages and
// hooks is never ahead of the disk, and is told before the answer. A store NOT THERE is born by the exclusive create AT THE CALL (R6:
// the appeared refusal needs the link, which the writer's rename cannot give) — once a file. A store with no writer writes at the
// call, as before (the settings, R11; the desktops are the writer's since B-0248 (a)).

const fs = require('fs');
const path = require('path');
const SR = require('./store-read.js');
const FDC = require('./fd-close.js');   // r5185: the hub's one set of «this file system does not do a sync» codes and their words

const NO_LINK = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV']);   // a link the FILESYSTEM refuses (not a file there)
const SILENT_RUNGS_MS = Object.freeze([1000, 2000, 4000, 8000]);   // ≈15 s of quick, silent reads again
const LADDER = Object.freeze({ firstMs: 30000, maxMs: 300000 });

/** a read's answer → the hold's kind */
function kindOf(a) {
  if (!a) return 'unreadable';
  if (a.state === 'corrupt') return 'damaged';
  const code = a.error && a.error.code;
  return code === 'EACCES' || code === 'EPERM' ? 'not-allowed' : 'unreadable';
}

/** ONE sync read of the file → store-read's input ({ text } | { error }) — the start's read and the read back of a file that appeared */
function readSync(file) { try { return { text: fs.readFileSync(file, 'utf8') }; } catch (error) { return { error }; } }

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
function create({ file, valid = () => true, parse = JSON.parse, now = Date.now, log = console, silentMs = SILENT_RUNGS_MS, ladder = LADDER, onLift = null, onSaid = null, onUnsaved = null, onSaved = null, onOwedRefused = null, onOwedBegin = null, onOwedOver = null, schedule = null, writer = null, onLanded = null, liftWaits = null } = {}) {
  if (!file) throw new Error('store-hold: file is required');
  /** the store writer (B-0248 (c)) — a function (the process's writer, made at the first use) or the writer itself; null: at the call */
  const W = () => (typeof writer === 'function' ? writer() : writer);
  let unsyncSaid = false;   // r5185: a file system that does not do a sync is said ONCE a store
  let value;                 // the document (undefined: none — held, or not read yet)
  let text = null;           // the bytes the value was read from, until the caller takes them once (takeText: its normalizer compares)
  let held = null;           // { kind, code, why, since, rung }
  let missing = false;
  let tries = 0, timer = null, inflight = null, stopped = false;
  let started = false;       // the START read returned (round wyzvr7567's MUST 1): before it, no read, write or set is answered
  const later = schedule || ((fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; });
  const answerOf = (read) => SR.storeAnswer(read, { parse, valid });

  /** THE READ AT THE START (sync — a start reads its stores before it serves; `pre` = the same read made off the loop by the caller,
   *  { text } | { error }). → 'data' | 'missing' | 'held' */
  function readAtStart(pre) {
    // A START READS WHAT THIS PROCESS STILL OWES (B-0248 (c), as the decision engine's): a store made again in the same process (a
    // suite's restart) lands the write the last one handed the writer BEFORE it reads — a hub's start owes nothing (no wait)
    let owedHere = false, leftHere = null;
    try {
      const w = W();
      if (w && typeof w.pending === 'function' && w.pending(file) && typeof w.flushSync === 'function') {
        owedHere = true;   // (r1092: set BEFORE the call — a flush that throws must not leave the old bytes read as the store's state)
        const r = w.flushSync([file]);
        leftHere = r && Array.isArray(r.left) ? (r.left.find((x) => x === file || (x && x.file === file)) || null) : null;
      }
    } catch (e) { if (owedHere) leftHere = { why: (e && e.message) || String(e) }; }
    // r1054 (8): A FILE THE FLUSH LEFT UNWRITTEN IS OLDER THAN THE STORE — its bytes are never taken as the store's state: HELD (no value,
    // every door refuses by name), read again off the loop only once this process owes it nothing (readAgain below)
    if (leftHere) {
      started = true;
      held = { kind: 'unreadable', code: 'EOWED', why: `this process still owes ${path.basename(file)} a write that did not land (${(leftHere && leftHere.why) || 'not written'}) — the file on disk is older than the store`, since: now(), rung: 'silent' };
      tries = 0; arm();
      return 'held';
    }
    const read = !owedHere && pre && (typeof pre.text === 'string' || pre.error) ? pre : readSync(file);
    const a = answerOf(read);
    started = true;   // (only once the read has an answer: a throw above leaves the store NOT READ — refused by name, read again next time)
    if (a.state === 'data') { value = a.value; text = read.text; missing = false; return 'data'; }
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
    // r1054 (8): a write this process still owes the file — its bytes on disk are older than the store: not read, held, the next rung
    { const w = W(); if (w && typeof w.pending === 'function' && w.pending(file)) { tries++; if (held.rung === 'silent' && tries >= silentMs.length) { held.rung = 'said'; const fileName = path.basename(file); try { onSaid?.({ file: fileName, ...held }); } catch { /* said by the caller */ } } arm(); return false; } }   // (the said word carries the file, as the read's own below)
    inflight = fs.promises.readFile(file, 'utf8').then((text) => ({ text }), (error) => ({ error }));
    const read = await inflight; inflight = null;
    if (!held || stopped) return false;
    tries++;
    const a = answerOf(read);
    if (a.state === 'data') {
      const was = held; held = null; value = a.value; text = read.text; missing = false; tries = 0;
      try { onLift?.(value, was); } catch (e) { log.warn?.(`[store-hold] ${path.basename(file)}: its lift's hooks failed: ${(e && e.message) || e}`); }
      return true;
    }
    // still held: a file GONE since the hold stays held (the next START judges a truly absent file); the kind follows the read
    if (a.state !== 'missing') { held.kind = kindOf(a); held.code = a.code || null; held.why = a.why || null; }
    if (held.rung === 'silent' && tries >= silentMs.length) { held.rung = 'said'; try { onSaid?.({ file: path.basename(file), ...held }); } catch { /* said by the caller */ } }   // the FILE rides the word (the page's strip names the store by it — the pictures found a word without it)
    arm();
    return false;
  }

  /** the value, or the refusal by name (R2: a held read answers the refusal and nothing else) */
  /** a store whose START read never ran is no store yet (MUST 1: a folder check that threw left a flag set and «read and empty»
   *  served): refused BY NAME, as a hold that cannot be read — never an empty value under the store's name */
  const NOT_READ = () => ({ kind: 'unreadable', code: 'not read', since: now(), rung: 'said' });
  function answer(what = null) { if (!started) throw unreadError(file, NOT_READ(), what); if (held) throw unreadError(file, held, what); return value; }
  /** refuse by name while held (a door's guard) */
  function refuseIfHeld(what) { if (!started) throw unreadError(file, NOT_READ(), what); if (held) throw unreadError(file, held, what); }

  /** THE ONE WRITE (R1, R10): refuses a store with no value BY NAME; whole bytes, a pid temp name, then the rename — or, for a store
   *  that read `missing`, an EXCLUSIVE create (R6: a file found there is read and adopted, the change refused by name). `bytes`: the
   *  text, or its PARTS in order (a large store's text is never joined — the conversation list's state and its facts), else the
   *  value's JSON. `sync` (r5185): the temp SYNCED before its name moves — the default; false ONLY for a machine caller's config call.
   *  → true */
  function write(next, bytes, { sync = true } = {}) {
    if (!started) throw unreadError(file, NOT_READ(), 'this change');
    if (held) throw unreadError(file, held, 'this change');
    const parts = Array.isArray(bytes) ? bytes : [typeof bytes === 'string' ? bytes : JSON.stringify(next, null, 2)];
    const tmp = `${file}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // r5185 (lane hub-loop-stalls, row B-574d — THE DIRECT DOOR's SYNC): the temp written WHOLE, then SYNCED ONCE before its name
    // moves (a person's press, the start, a rare road: a store's first create, the ladder's retry, a start read's own rewrite). A sync
    // that FAILS, or a close that fails after the writes (a network folder's deferred write error), is a FAILED WRITE: the temp
    // removed, thrown — the OLD file stands. A sync the file system does not do at all (src/fd-close.js SYNC_UNSUPPORTED) is said
    // once and the name moves (the hub's one set). `sync: false` — ONLY a machine caller's config call (a bearer on the plugins' old
    // config door, the coordinator's ruling r5185: a sync on the loop is for a person's press, the start or a rare save) — asks
    // none; its writes and its close are still judged
    let fd = fs.openSync(tmp, 'w'), failed = null;
    try {
      for (const part of parts) {
        const b = Buffer.isBuffer(part) ? part : Buffer.from(String(part));
        for (let o = 0; o < b.length;) { const n = fs.writeSync(fd, b, o, b.length - o); if (!(n > 0)) throw Object.assign(new Error('a short write'), { code: 'ESHORT' }); o += n; }
      }
      if (sync) { try { fs.fsyncSync(fd); } catch (e) { if (!FDC.SYNC_UNSUPPORTED.has(e && e.code)) throw e; if (!unsyncSaid) { unsyncSaid = true; log.warn?.(`[store-hold] ${FDC.syncUnsupportedWords(path.basename(file), e.code)}`); } } }
    } catch (e) { failed = e; }
    try { fs.closeSync(fd); } catch (e) { if (!failed) failed = e; }   // a close that fails after the writes: its bytes may not be there
    fd = null;
    if (failed) { try { fs.unlinkSync(tmp); } catch { /* gone already */ } throw failed; }
    if (missing) {
      /** a file arrived where the read found none (a late mount): READ and ADOPTED, never written over — this change refused by name */
      const appeared = () => {
        try { fs.unlinkSync(tmp); } catch { /* gone */ }
        missing = false; value = undefined;
        const read = readSync(file);
        const a = answerOf(read);
        if (a.state === 'data') { value = a.value; text = read.text; } else { held = { kind: kindOf(a), code: a.code || null, why: a.why || null, since: now(), rung: 'silent' }; tries = 0; arm(); }
        return Object.assign(new Error(`${path.basename(file)} appeared since the start — it is read and kept; this change was not made`), { status: 409, code: 'store_appeared' });
      };
      let linked = false;
      try { fs.linkSync(tmp, file); linked = true; }
      catch (e) {
        if (e && e.code === 'EEXIST') throw appeared();
        // A FILESYSTEM WITHOUT HARD LINKS (some mounts refuse a link by name): the rename after a last look — a file found there is
        // adopted all the same; only a file that arrives inside that instant is not seen (a create with no link has no exclusive door)
        if (!(e && NO_LINK.has(e.code))) { try { fs.unlinkSync(tmp); } catch { /* gone */ } throw e; }
        if (fs.existsSync(file)) throw appeared();
        try { fs.renameSync(tmp, file); } catch (e2) { try { fs.unlinkSync(tmp); } catch { /* gone */ } throw e2; }   // (a rename that fails leaves no temp)
      }
      if (linked) { try { fs.unlinkSync(tmp); } catch { /* the link stands */ } }
      missing = false;
    } else { try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { /* gone */ } throw e; } }   // r5185's round (wf_8f9d98c0): a rename that FAILS leaves no temp behind — the old file stands, the error thrown by its code
    value = next; text = null;
    return true;
  }
  // ── THE WRITE OFF THE LOOP (B-0248 (c), above) ──
  let producedValue, producedSeq = 0, toldSeq = 0;
  /** the value whose bytes LANDED, told ONCE a write (its pages, its hooks) — from the writer's landing, or the first answer it frees */
  function tell() {
    if (producedSeq <= toldSeq) return;
    toldSeq = producedSeq;
    try { onLanded?.(producedValue); } catch (e) { log.warn?.(`[store-hold] ${path.basename(file)}: its landing's hooks failed: ${(e && e.message) || e}`); }
  }
  /** THE CHANGE: `next` is the store's value now (the pending state); `bytes(value)` makes its bytes (a text, or its PARTS in order)
   *  when the write is due — for the LATEST value; `name` the writer's row; `accepted()` the caller's own commit (its cache, its facts),
   *  run once the change is taken and BEFORE anything is told of it (a hook told at the landing reads the caller's copy). Refuses a
   *  store with no value BY NAME (R1), synchronously, before anything moves. → true when it landed at the call (no writer, or the
   *  exclusive create of a store NOT THERE), false when the writer owes it — or, for a store that SAYS its owed words (`onUnsaved`),
   *  when the storage refused that write at the call: KEPT on the hold's own ladder (below) */
  function owe(next, { name, bytes: bytesOf, accepted = null } = {}) {
    if (!started) throw unreadError(file, NOT_READ(), 'this change');
    if (held) throw unreadError(file, held, 'this change');
    if (typeof bytesOf !== 'function') throw new Error(`store-hold: ${path.basename(file)}: owe() needs its bytes`);
    const w = W();
    if (w && !name) throw new Error(`store-hold: ${path.basename(file)}: a write handed to the store writer names its row (src/timed-sync.js STORES)`);
    // B-0248 (b), the fresh read: a store that says its owed words (the desktops) keeps a write AT THE CALL that the STORAGE refuses
    // (the exclusive create of a store NOT THERE, an EIO or a full disk; no writer) on its OWN ladder (flush: written again, said past
    // the silent rungs, at once for a press through after()) — never dropped; a refusal BY NAME throws as before. While that ladder
    // owes, the next change takes the same road (one road at a time: a later write never lands under an older one retried). A store
    // that says nothing throws to its door, which answers not-durable itself
    if (!w || missing || (onUnsaved && owed && owed.produce)) {
      const bytes = bytesOf(next);
      if (!onUnsaved) write(next, bytes);
      else if (!flush(() => [next, bytes])) { accepted?.(); return false; }
      producedValue = next; producedSeq++; try { accepted?.(); } finally { tell(); } return true;
    }
    value = next; text = null;
    accepted?.();   // (before the hand-off: a stand-in writer may make the bytes, land them and tell inside dirty())
    // urgent: an ACT — written at the writer's next turn, as durable() asks, whether or not a door waits on it (a rename over the
    // socket has no waiter; paced, a large list would wait its gap before any page is told)
    // THE PRODUCER HAS A SIDE EFFECT (r1053 (6)): it notes WHICH value its bytes are — the one told at their landing. Only the writer's
    // own write calls it; nothing may ask the writer what it owes for these files (its owed() read calls the producer and would
    // re-note a value whose bytes never land as the one to tell)
    w.dirty(file, { name, rank: 0, urgent: true, produce: () => { const v = value; const bytes = bytesOf(v); producedValue = v; producedSeq++; return bytes; }, onWritten: (ok, err) => { if (ok) { tell(); if (!(typeof w.pending === 'function' && w.pending(file))) landed(); } else failedAtWriter(err); } });   // (lifted only when nothing newer is owed: never a «saved» then «unsaved» flicker)
    return false;
  }
  /** THE ANSWER AFTER THE LANDING: `answer(ok)` once what the store owes NOW is on disk (true), or its write failed / passed the
   *  writer's bound (false — the writer keeps it and writes it again). Nothing owed ⇒ answered at once. The writer's `answer` road
   *  (never a promise's .then): an answer the hub's exit flush frees is sent inside that flush */
  function after(answer, { press = false } = {}) {
    // the hold's OWN ladder owes the store (a write at the call the storage refused, owe() above): NOT on disk — said at once for a press
    if (owed && owed.produce) { if (press && owed.rung !== 'said') say(); answer(false); return; }
    const w = W();
    if (!w) { answer(true); return; }
    w.durable(file, { answer: (ok) => { if (ok) tell(); else notOnDiskOwed(press); answer(ok); } });
  }
  /** B-0248 (b): THE OWED WORDS ON THE WRITER'S ROAD (B-225b's second half, for a store that says them — `onUnsaved`): a write the
   *  storage refused is the store writer's to write again (its own backoff: 1 s, 2 s, 4 s …); SAID once at its 4th refusal (the
   *  hold's silent rungs counted in tries — about 7 s on the writer's backoff), at once for a person's PRESS, LIFTED at the landing
   *  that leaves nothing newer owed (onSaved, a said one only). A store that says nothing (no onUnsaved) keeps none of this: its doors say not-durable themselves */
  function failedAtWriter(err) {
    if (!onUnsaved) return;
    const code = (err && err.code) || null, why = String((err && err.message) || err || 'write failed').slice(0, 200);
    if (!owed) { owed = { produce: null, code, why, since: now(), rung: 'silent', tries: 0 }; log.warn?.(`[store-hold] ${path.basename(file)} could not be written (${code || why}) — the change is kept in memory and the store writer writes it again`); begun(); }
    owed.tries++; owed.code = code || owed.code; owed.why = why;
    if (owed.rung === 'silent' && owed.tries >= silentMs.length) say();
  }
  /** an answer that is NOT on disk (failed, or past the writer's bound while queued): owed (its words), said at once for a press.
   *  `nd`: the caller's own verdict (a door's bound passed while its write still waits to be handed: queued) */
  function notOnDiskOwed(press, nd0 = null) {
    if (!onUnsaved) return;
    if (!owed) { const nd = nd0 || notDurable() || {}, queued = nd.why === 'queued'; owed = { produce: null, code: nd.code || (queued ? 'queued' : null), why: queued ? 'its write is still queued behind the storage' : (nd.why || 'not on disk'), since: now(), rung: 'silent', tries: 0 }; begun(); }   // (a write still QUEUED keeps the code «queued» — the page-facing fact — and is said as queued, never «could not be written»)
    if (press && owed.rung !== 'said') say();
  }
  /** why the store's last act is not on disk yet ({ why, code, ahead, lastMs }) — the door's 503 words — or null */
  const notDurable = () => { try { const w = W(); return w && typeof w.whyNotDurable === 'function' ? w.whyNotDurable(file) : null; } catch { return null; } };
  /** the caller's in-memory value after a change it will write (the copy in memory is the truth while it exists — R12) */
  function set(next) { if (!started) throw unreadError(file, NOT_READ(), 'this change'); if (held) throw unreadError(file, held, 'this change'); value = next; text = null; }
  /** a WHOLE read of the file made by the caller (a re-read after the migrations wrote it): the value as read — and the store is THERE
   *  now, so its next write replaces it, never an exclusive create that meets the file it read (a start read «missing», then a
   *  migration wrote it). Refused while held: a held store is read again by its own ladder */
  function adoptRead(v) { if (held) throw unreadError(file, held, 'this read'); started = true; value = v; text = null; missing = false; }
  /** the bytes of the last read, ONCE (null after) — a large store's text is not kept beside its value */
  function takeText() { const t = text; text = null; return t; }
  /** THE DAMAGED DOOR (R5): a store held as `damaged` (bytes read whole that are not the store — they will not mend) is set ASIDE under
   *  a dated name, once a person's whole replace asks; the store is then NOT THERE (its first write creates it exclusively). Only for
   *  `damaged`: an unreadable or not-allowed store may answer later, and nothing is moved over it. → the aside's path */
  function setAside(when = now()) {
    if (!held || held.kind !== 'damaged') throw Object.assign(new Error(`${path.basename(file)} is not damaged — only bytes that are not the store are set aside`), { status: 409, code: 'store_not_damaged' });
    const aside = `${file}.damaged-${new Date(when).toISOString().replace(/[:.]/g, '-')}`;
    fs.renameSync(file, aside);
    if (timer) { (schedule ? null : clearTimeout(timer)); timer = null; }
    held = null; missing = true; value = undefined; text = null; tries = 0;
    return aside;
  }
  // ── THE OWED WRITE ──
  let owed = null;           // { produce, code, why, since, rung, tries } — a write the storage refused, kept until one lands
  let owedTimer = null;
  const named = (e) => !!e && (e.code === 'store_unread' || e.code === 'store_appeared');   // a refusal BY NAME, never a storage failure
  // (the page-facing facts carry no `why`: the raw error names the temp path under the data folder — it stays in the hub's journal)
  const owedFacts = () => (owed ? { file: path.basename(file), code: owed.code, since: owed.since, rung: owed.rung } : null);
  /** ONE try of what `produce()` makes ([next, bytes], or null: nothing to write — never a landing) → { landed, nothing, error } */
  function tryWrite(produce) {
    try { const made = produce(); if (!made) return { landed: false, nothing: true }; write(made[0], made[1]); return { landed: true }; }
    catch (error) { return { landed: false, error }; }
  }
  /** B-225b's remainder (login-request-card, 主开发 r1353 (6)): an owed episode BEGINS (its first failure on any road — the hold's own
   *  ladder, the writer's refusal, an answer not on disk past the writer's bound) — the caller's mark that a change may not reach the disk */
  function begun() { try { onOwedBegin?.(owedFacts()); } catch { /* the caller's */ } }
  /** the owed chain ENDS without a landing (nothing to write any more, or a refusal by name): no «written again», no onSaved — its
   *  timer goes with it (round wg2vawd0o: one clearing on every road) */
  function endOwed(why) {
    if (!owed) return null;
    const was = owedFacts(); owed = null;
    try { onOwedOver?.({ landed: false, said: was.rung === 'said', since: was.since }); } catch { /* the caller's */ }
    if (owedTimer) { (schedule ? null : clearTimeout(owedTimer)); owedTimer = null; }
    log.warn?.(`[store-hold] ${path.basename(file)}: the owed write ends — ${why}`);
    return was;
  }
  function landed() {
    if (!owed) return;
    // B-0248 (r1353's cure, its read's MUST): the caller's own change past its bound still waits to be handed (`liftWaits`) — this
    // landing is an OLDER write's: the mark stays (a ladder's own landed bytes are let go: the next change goes to the writer)
    if (liftWaits && liftWaits()) { if (owed.produce) { owed.produce = null; if (owedTimer) { (schedule ? null : clearTimeout(owedTimer)); owedTimer = null; } } return; }
    const was = owed; owed = null;
    if (owedTimer) { (schedule ? null : clearTimeout(owedTimer)); owedTimer = null; }
    log.warn?.(`[store-hold] ${path.basename(file)} is written again — the change kept since ${new Date(was.since).toISOString()} landed`);
    if (was.rung === 'said') { try { onSaved?.({ file: path.basename(file), since: was.since }); } catch { /* said by the caller */ } }
    try { onOwedOver?.({ landed: true, said: was.rung === 'said', since: was.since }); } catch { /* the caller's */ }
  }
  function say() { owed.rung = 'said'; try { onUnsaved?.(owedFacts()); } catch { /* said by the caller */ } }
  function armOwed() {
    if (stopped || !owed || owedTimer) return;
    const n = owed.tries;
    const ms = n < silentMs.length ? silentMs[n] : SR.retryDelay(n - silentMs.length + 1, ladder);
    owedTimer = later(() => { owedTimer = null; owedAgain(); }, ms);
  }
  /** a rung of the owed write's ladder → true when it landed */
  function owedAgain() {
    if (!owed || stopped) return false;
    owed.tries++;
    const r = tryWrite(owed.produce);
    if (r.landed) { landed(); return true; }
    if (r.nothing) { endOwed('nothing to write any more (the store was read again)'); return false; }   // round wg2vawd0o: nothing written is no landing
    if (named(r.error)) {   // the store is held or adopted now: no change of the caller's lands over it — the owed write ends, said by name
      const was = endOwed((r.error && r.error.message) || String(r.error));
      try { onOwedRefused?.(r.error, was); } catch { /* the caller's */ }
      return false;
    }
    owed.code = (r.error && r.error.code) || owed.code; owed.why = String((r.error && r.error.message) || r.error).slice(0, 200);
    if (owed.rung === 'silent' && owed.tries >= silentMs.length) say();
    armOwed();
    return false;
  }
  /** THE FLUSH: the write of what `produce()` makes. A failure of the storage is OWED (kept, retried on the ladder — never thrown:
   *  the caller's memory keeps the change); a refusal BY NAME (held, not read, a file that appeared) throws as before. `press`: a
   *  person's act — its failure is said AT ONCE. → true when this write landed */
  function flush(produce, { press = false } = {}) {
    const r = tryWrite(produce);
    if (r.landed) { landed(); return true; }
    if (r.nothing) { endOwed('nothing to write any more'); return true; }   // nothing owed: no landing said, nothing kept
    if (named(r.error)) { endOwed((r.error && r.error.message) || String(r.error)); throw r.error; }   // the same clearing as the ladder's road
    const code = (r.error && r.error.code) || null, why = String((r.error && r.error.message) || r.error).slice(0, 200);
    if (!owed) { owed = { produce, code, why, since: now(), rung: 'silent', tries: 0 }; log.warn?.(`[store-hold] ${path.basename(file)} could not be written (${code || why}) — the change is kept in memory and written again`); begun(); }
    else { owed.produce = produce; owed.code = code || owed.code; owed.why = why; }
    if (press && owed.rung !== 'said') say();
    armOwed();
    return false;
  }
  /** B-f276 1c (主开发 r1143 (3)): setAside OFF THE LOOP — the same checks and the same dated name, the rename through fs.promises
   *  (a person's press on a file whose storage may be a mount). → Promise<the aside path> */
  async function setAsideAsync(when = now()) {
    if (!held || held.kind !== 'damaged') throw Object.assign(new Error(`${path.basename(file)} is not damaged — only bytes that are not the store are set aside`), { status: 409, code: 'store_not_damaged' });
    const aside = `${file}.damaged-${new Date(when).toISOString().replace(/[:.]/g, '-')}`;
    await fs.promises.rename(file, aside);
    if (timer) { (schedule ? null : clearTimeout(timer)); timer = null; }
    held = null; missing = true; value = undefined; text = null; tries = 0;
    return aside;
  }
  function stop() { stopped = true; if (timer) { (schedule ? null : clearTimeout(timer)); timer = null; } if (owedTimer) { (schedule ? null : clearTimeout(owedTimer)); owedTimer = null; } }

  return {
    readAtStart, readAgain, answer, refuseIfHeld, write, set, adoptRead, takeText, setAside, setAsideAsync, stop, flush, owedAgain, owe, after, notDurable,
    /** r1092: the value whose bytes the writer took and did NOT land yet (in flight, or failed and owed) — undefined when none */
    inFlight: () => (producedSeq > toldSeq ? producedValue : undefined),
    /** B-0248 (r1353 (4)): a door's own bound passed while its change still waits to be handed (behind a late rollback point): the
     *  store is owed and QUEUED (its words; at once for a press) — the landing that leaves nothing newer owed lifts it */
    owedQueued: ({ press = false } = {}) => notOnDiskOwed(press, { why: 'queued' }),
    /** the store read again WHOLE (a file that appeared, a lift): what it owed is owed no more — ended without a landing */
    owedEnd: (why) => { endOwed(why); },
    owed: owedFacts,   // the owed write's facts ({ file, code, why, since, rung }), or null
    held: () => (held ? { file: path.basename(file), kind: held.kind, code: held.code, since: held.since, rung: held.rung } : null),
    isMissing: () => missing, file,
  };
}

/** ONE read through the three answers, for a reader with no hold of its own (a boot migration — R9): the value; `undefined` when the
 *  file is not there; anything else THROWS by name (store_unread) — never the defaults (the migration runner records a plain return
 *  as applied for good, a throw runs again at the next start) */
function readNow(file, { valid = () => true, parse = JSON.parse, now = Date.now, what = null } = {}) {
  const read = readSync(file);
  const a = SR.storeAnswer(read, { parse, valid });
  if (a.state === 'data') return a.value;
  if (a.state === 'missing') return undefined;
  throw unreadError(file, { kind: kindOf(a), code: a.code || null, since: now(), rung: 'said' }, what);
}

module.exports = { create, readNow, kindOf, unreadError, SILENT_RUNGS_MS, LADDER };
