'use strict';
// THE SLOT-TRANSITION LEDGER (2026-09-07, readings-by-slot part 2).
//
// A pooled conversation's billing identity is a SYMLINK, and a symlink has no
// history: `poolCurrentFor()` can only ever answer "where does it point NOW".
// Every attribution question that arrives LATE — a reading whose fetchedAt is
// two minutes old, a ledger event baked by a scan that ran after the switch,
// a migration asked to clean up last week — therefore had no way to answer
// "which member was this conversation on AT THAT MOMENT", and the code filled
// the gap with the only durable identity it had: the org the CLI cached at
// SPAWN (OTel `organization.id`). That is the misattribution this ledger
// removes at the root: every re-point of a credential link appends a line, so
// the past is a lookup instead of an inference.
//
// Shape (append-only NDJSON, data/slot-transitions.jsonl):
//   {"sessionId":"sess-…","poolId":"pool-…","from":"sub-a","to":"sub-b",
//    "at":1788…, "why":"per-session-switch"}
//   sessionId null = the POOL DEFAULT link moved (it decides for every session
//   that has no link of its own).
//
// BOUNDED, archive-never-destroy: past MAX lines the oldest half is MOVED to
// data/archive/slot-transitions-<YYYYMMDD>.jsonl (appended, never deleted — the
// migration and any future re-attribution read it), live file keeps the tail.
const fs = require('fs');
const path = require('path');
const MR = require('./migration-reads.js'); // MG1 (r2929): strict only inside a migration's run (every other reader keeps its answer)
const FC = require('./fd-close.js');   // B-574d (r5072): the trim's synced replace — the tree's one door (this module is no device bundle input)
const _saidTrim = new Set();
/** the trim's own words, said ONCE a run each (a trim that fails is tried again at the next record: said once, never a line a record) */
const sayTrim = (line) => { if (_saidTrim.has(line)) return; _saidTrim.add(line); try { console.warn(`[slots] ${line}`); } catch { } };

const MAX_LINES = 20000;      // ≈2.4MB at ~120B/line; a busy pool writes a few hundred a day
const DEDUP_MS = 60000;       // an identical consecutive (session → to) inside a minute is one fact

// THE LEDGER FILE's ONE IN-PROCESS STATE (B-360d remainder, 主开发 r1231 / r2850). The hub writes the ledger through one instance
// (src/accounts.js) and reads it through another (src/server/usage-pool-engine.js), and the reader asked the file a synchronous
// stat at EVERY call to learn of the writer's appends — one stat a stream record on a pooled conversation: on a slow share a
// 200-record turn held the loop twelve seconds. Now every instance of ONE FILE (keyed by its resolved path: two spellings of one
// path are one file; another ledger, a suite's, has its own) shares ONE state: the rows read, kept exactly as a read of the file
// would give them. A write of the hub lands in them in the writer's own step, so the reader's NEXT read holds it with nothing
// between, and a read answers from memory — no stat, no read. The file is read only when no rows are kept: the first read, after
// a trim, after a write that failed, or after the backstop found the file changed.
// THE BACKSTOP is for a writer OUTSIDE the hub — none exists today (every writer in src/ is the hub's; a migration writes before
// any read). It never holds the loop and adds no timer: a read that finds its last look older than LOOK_EVERY_MS serves its rows
// NOW and starts ONE look OFF the loop (fs.promises.stat; at most one out a file — a look that never answers starts no second
// one); a look that finds the file's size not the one the kept rows were read at — or its mtime moved since the previous look —
// drops the rows for the next read. So an outside edit is seen within the bound plus one look (a same-size rewrite right after a
// write of the hub, before the next look has named the file's time, is the one shape it cannot tell), and a share that stops
// answering holds nothing.
// THE CLAIM, EXACTLY (round wuq1b1trm, 主开发 r2940): NO synchronous file ask on a record's READ road. The WRITE road reads the live
// file whole at its trim check only when its line count is not known or has passed the bound (B-0248 step 2 unit 5, _maybeTrim below). A whole read of the live file AND every
// shard happens at the first read, after a trim, after a write that failed and after the backstop found the file changed. The
// kept rows hold every shard's rows for the life of the process, and the per-file map is never emptied (one ledger per hub; a
// suite's folders are a handful) — fine for a hub. A look that never returns keeps its file's look out for good: the backstop is
// OFF for that file from then on (said for whoever adds a writer outside the hub). The rows handed out are READ-ONLY: a frozen
// array of frozen rows, and a write replaces the array (copy on write), so an array a caller holds never changes under it and a
// caller's own sort, push or edit throws instead of changing what the next reader gets.
const LOOK_EVERY_MS = 10 * 1000;
// THE STORE-READ LAW (B-f276 gap row «slot-ledger-gap», 主开发 r4989 / r4993): a read of the live file, a shard or the archive folder
// that FAILS (anything but «not there») HOLDS the ledger — it is never «no move recorded». While held its three doors (all, slotAt,
// transitionsFor) refuse BY NAME (code LEDGER_HELD; every caller answers it by isLedgerHeld and fails CLOSED on the money roads), a
// record still APPENDS (append-only: nothing written over), the trim never runs, and the ledger reads itself again OFF the loop on
// the store hold's ladder (silent rungs, then 30 s doubling to 5 min; one read out) — never a synchronous read a call. Its one
// line, said once past the silent rungs, names the ledger and never an account. Inside a migration MG1's strict road is unchanged.
const LEDGER_HELD = 'ELEDGERHELD';
const SILENT_RUNGS_MS = [1000, 2000, 4000, 8000], LADDER_FIRST_MS = 30000, LADDER_MAX_MS = 300000;
const isLedgerHeld = (e) => !!(e && e.code === LEDGER_HELD);
const heldError = (h) => Object.assign(new Error(`the slot ledger (slot-transitions.jsonl) could not be read (${h.code}) — it is held: no move is read from it until it reads again`), { code: LEDGER_HELD, held: { ...h } });
const _files = new Map();     // resolved file path → { rows, bytes, clean, seen, lookAt, lookOut, gen }
const _test = {};             // the suite's seam (test-slot-ledger-reads): a clock, the look's stat
const lookNow = () => (_test.now ? _test.now() : Date.now());
function fileState(file) {
  const k = path.resolve(file);
  let st = _files.get(k);
  if (!st) { st = { rows: null, bytes: -1, clean: true, seen: null, lookAt: 0, lookOut: false, gen: 0, lines: null, held: null, tries: 0, timer: null, readOut: false }; _files.set(k, st); }
  return st;
}

class SlotTransitions {
  constructor({ dataDir, max = MAX_LINES } = {}) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'slot-transitions.jsonl');
    this.archiveDir = path.join(dataDir, 'archive');
    this.max = max;
    this._last = new Map();     // key → {to, at} (dedup, memory only)
    this._st = fileState(this.file);   // THE FILE's one in-process state, shared by every instance of this file
  }
  /** the rows kept for this file (null = the next read reads the file); assigning null drops them — a suite that edits the file
   *  behind the ledger's back says so this way. all() hands out THE ONE KEPT ARRAY, READ-ONLY: frozen, its rows frozen, replaced
   *  (never changed) by a write — a caller that wants its own order or its own rows copies them */
  get _cache() { return this._st.rows ? { rows: this._st.rows } : null; }
  set _cache(v) { if (v == null) { this._st.rows = null; this._st.lines = null; this._st.gen++; } }

  /** The dedup key is the LINK, not the session (2026-09-07 r3, reproduced).
   *  A session key (`sess-<seq>-<ms>`) is globally unique and a conversation
   *  belongs to exactly one pool, so a session row needs nothing more — but
   *  every POOL DEFAULT shared the single bucket `__default__`, and a member
   *  can belong to several pools (this instance's pool has `members:null` =
   *  every subscription). Two pools re-pointing their defaults to the SAME
   *  member inside DEDUP_MS therefore dropped the second row, and `slotAt`
   *  — which filters by poolId when reading — then answered that pool with
   *  its previous, now-wrong default: a confidently wrong answer out of a
   *  ledger whose whole contract is "unknown, never agreement". */
  _key(sessionId, poolId) { return sessionId || ('__default__:' + (poolId || '')); }

  /** Append one transition. Returns the written row, or null when it was a
   *  duplicate of the previous one for the same link inside DEDUP_MS.
   *  A SAME-TARGET re-point IS recorded (it is evidence that the link was
   *  confirmed on `to` at that instant — the 740 "re-point, same target"
   *  lines in the fire-loop journal were the only trace anyone had). */
  record({ sessionId = null, poolId = null, from = null, to = null, at = Date.now(), why = null } = {}) {
    if (!to) return null;
    const k = this._key(sessionId, poolId);
    const prev = this._last.get(k);
    // A REPEAT is the same target with no NEW `from` (r4, reproduced): a row
    // whose `from` is neither the previous row's `to` nor unknown says the link
    // was somewhere else in between — a re-point this ledger never saw — and
    // dropping it as "same target inside a minute" erased the only evidence of
    // that gap (the held-member rule reads the disagreement as unknown).
    if (prev && prev.to === to && at - prev.at < DEDUP_MS && (!from || from === prev.to)) return null;
    const row = { sessionId: sessionId || null, poolId: poolId || null, from: from || null, to, at, ...(why ? { why: String(why).slice(0, 40) } : {}) };
    const st = this._st, line = JSON.stringify(row) + '\n';
    const counted = st.lines; st.lines = null;   // the trim check's count (below): not known while the append is out — a write that fails leaves it so
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.appendFileSync(this.file, line);
    } catch { st.rows = null; st.gen++; return null; }   // a write that FAILED (a part of it may have landed): the next read reads the file
    if (counted != null) st.lines = counted + 1;   // …landed: one line more
    this._last.set(k, { to, at });
    // THE WRITE LANDS IN THE KEPT ROWS in this step, exactly as a read would give them (the line parsed back; a row whose `at` is
    // not finite is one a read drops; the order is the read's stable sort by `at`). Only on a file whose last line was whole: a
    // line glued onto a partial one is read as the file holds it, so then the next read reads the file
    st.gen++; st.seen = null;
    if (st.rows && st.clean) {
      const back = JSON.parse(line);
      if (back && back.to && Number.isFinite(back.at)) {
        const next = st.rows.concat([Object.freeze(back)]);   // copy on write: an array a caller holds never changes under it
        if (next.length > 1 && next[next.length - 2].at > back.at) next.sort((a, b) => a.at - b.at);
        st.rows = Object.freeze(next);
      }
      st.bytes = Math.max(0, st.bytes) + Buffer.byteLength(line);
    } else st.rows = null;
    this._maybeTrim();
    return row;
  }

  /** Every recorded transition, oldest first — the LIVE file plus every
   *  archived shard (the migration must not go blind at a rotation). */
  all() {
    const st = this._st;
    if (st.held) throw heldError(st.held);   // HELD: refused by name, never a synchronous read a call (its ladder reads it again off the loop)
    if (st.rows) { this._lookMaybe(); return st.rows; }   // from memory: no stat, no read (the backstop's look is off the loop)
    const rows = [];
    let bytes = -1, clean = true, lines = null, failed = null;
    const eat = (fp, live = false) => {
      let buf; try { buf = fs.readFileSync(fp); } catch (e) { MR.absentOr(e, fp); if (!failed && e && e.code !== 'ENOENT') failed = { file: path.basename(fp), code: e.code || 'EREAD' }; return; }   // MG1: inside a migration an unread record = not run; outside, a failed read HOLDS (below)
      // the live file's size is its BYTES before decoding — the backstop compares it with the size on disk (a byte that is no
      // valid text, left by a hand, decodes to more bytes and would make them differ for ever)
      if (live) { bytes = buf.length; clean = !buf.length || buf[buf.length - 1] === 0x0a; }
      const txt = buf.toString('utf-8');
      if (live) lines = 0;
      for (const line of txt.split('\n')) {
        if (!line) continue;
        if (live) lines++;
        try { const r = JSON.parse(line); if (r && r.to && Number.isFinite(r.at)) rows.push(r); } catch { }
      }
    };
    try {
      for (const f of fs.readdirSync(this.archiveDir)) {
        if (/^slot-transitions-\d+\.jsonl$/.test(f)) eat(path.join(this.archiveDir, f));
      }
    } catch (e) { if (e && e.code === MR.CODE) throw e; MR.absentOr(e, this.archiveDir); if (!failed && e && e.code !== 'ENOENT') failed = { file: 'archive', code: e.code || 'EREAD' }; }
    eat(this.file, true);
    if (failed) { this._hold(failed); throw heldError(st.held); }
    rows.sort((a, b) => a.at - b.at);
    for (const r of rows) Object.freeze(r);
    st.rows = Object.freeze(rows); st.bytes = bytes; st.clean = clean; st.lines = lines; st.seen = null; st.lookAt = lookNow(); st.gen++;
    return rows;
  }

  /** is the ledger HELD now (a read failed and has not read again) — asked without a read (the banner's road, r5109) */
  held() { return !!this._st.held; }
  /** HOLD the ledger (a read that failed): nothing of that read kept; the ladder armed */
  _hold(failed) {
    const st = this._st;
    st.rows = null; st.lines = null; st.gen++;
    if (!st.held) { st.held = { ...failed, since: lookNow() }; st.tries = 0; }
    this._armReadAgain();
  }
  _armReadAgain() {
    const st = this._st;
    if (!st.held || st.timer || st.readOut) return;
    const rungs = _test.rungs || SILENT_RUNGS_MS;
    const ms = st.tries < rungs.length ? rungs[st.tries] : Math.min(LADDER_MAX_MS, LADDER_FIRST_MS * 2 ** Math.min(6, st.tries - rungs.length));
    st.timer = setTimeout(() => { st.timer = null; this._readAgain(); }, ms);
    if (st.timer.unref) st.timer.unref();
  }
  /** ONE read again OFF the loop (fs.promises): the archive folder, every shard, the live file — whole, or held still */
  async _readAgain() {
    const st = this._st;
    if (!st.held || st.readOut) return;
    st.readOut = true;
    const gen = st.gen;
    try {
      const texts = [];
      let names = [];
      try { names = await fs.promises.readdir(this.archiveDir); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
      for (const f of names) if (/^slot-transitions-\d+\.jsonl$/.test(f)) { try { texts.push([await fs.promises.readFile(path.join(this.archiveDir, f)), false]); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; } }
      let live = null;
      try { live = await fs.promises.readFile(this.file); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }
      if (st.gen !== gen) return;   // r5109: an append landed while this read was out — its rows are discarded, read again on the next rung
      const rows = [];
      for (const [buf] of texts) for (const line of buf.toString('utf-8').split('\n')) { if (!line) continue; try { const r = JSON.parse(line); if (r && r.to && Number.isFinite(r.at)) rows.push(r); } catch { } }
      let lines = 0;
      if (live) for (const line of live.toString('utf-8').split('\n')) { if (!line) continue; lines++; try { const r = JSON.parse(line); if (r && r.to && Number.isFinite(r.at)) rows.push(r); } catch { } }
      rows.sort((a, b) => a.at - b.at);
      for (const r of rows) Object.freeze(r);
      const was = st.held;
      st.held = null; st.tries = 0;
      st.rows = Object.freeze(rows); st.bytes = live ? live.length : -1; st.clean = !live || !live.length || live[live.length - 1] === 0x0a; st.lines = live ? lines : 0; st.seen = null; st.lookAt = lookNow(); st.gen++;
      if (was && was.said) console.warn('[pool] the slot ledger (slot-transitions.jsonl) reads again — its moves are read from it again; what was filed nowhere while it was held stays nowhere');
    } catch (e) {
      st.tries++;
      if (st.held) { st.held.code = (e && e.code) || st.held.code; const rungs = _test.rungs || SILENT_RUNGS_MS; if (!st.held.said && st.tries >= rungs.length) { st.held.said = true; console.warn(`[pool] the slot ledger (slot-transitions.jsonl) could not be read (${st.held.code}) — it is held: readings of pooled conversations are filed nowhere, rejections are marked on no account and no panel is asked until it reads again (${st.tries} reads tried)`); } }
    } finally { st.readOut = false; this._armReadAgain(); }
  }
  /** THE BACKSTOP's look (above): off the loop, at most one out a file, started by a read whose last look is older than the bound */
  _lookMaybe() {
    const st = this._st, t = lookNow();
    if (st.lookOut || t - st.lookAt < LOOK_EVERY_MS) return;
    st.lookOut = true; st.lookAt = t;
    const gen = st.gen;
    const said = (size, mtimeMs) => {
      if (st.gen !== gen || !st.rows) return;   // the hub wrote (or the rows were dropped) while the look was out: its answer is old
      if (size !== st.bytes || (st.seen != null && mtimeMs !== st.seen)) { st.rows = null; st.lines = null; st.gen++; return; }   // changed outside the hub
      st.seen = mtimeMs;
    };
    Promise.resolve().then(() => (_test.stat ? _test.stat(this.file) : fs.promises.stat(this.file)))   // the census counts this reader site
      .then((s) => said(s.size, s.mtimeMs), (e) => { if (e && e.code === 'ENOENT') said(-1, null); })
      .finally(() => { st.lookOut = false; });
  }

  /** The member a conversation's link pointed at at time `at`: its own latest
   *  transition at or before that instant, else the POOL DEFAULT's latest one
   *  (a session with no link of its own bills through the default), else null
   *  — "we have no record", which callers must treat as unknown, NEVER as
   *  agreement.
   *
   *  `sessionId` may be a STRING or an ARRAY of keys that all name the same
   *  conversation (2026-09-07 r3): the ledger is keyed by the WEBUI session
   *  key while the attribution log is keyed by the CLAUDE conversation id, and
   *  one conversation can be carried by several webui sessions over its life
   *  (every resume/fork mints a new `sess-<seq>-<ms>`). The caller that owns
   *  the translation passes every candidate; the latest matching row wins,
   *  which is the session that was actually live at `at`.
   *
   *  `ownLinkUnknown` (2026-09-07 r3, reproduced): TRUE when a session was
   *  NAMED but only the pool default answered. The default is the right answer
   *  for a session that has no link of its own — and we cannot tell that apart
   *  from "it had one and we have no row for it" (every row before this
   *  release, and every row whose webui key we could not resolve). A caller
   *  that is about to REWRITE a stored fact must treat that as unknown; a
   *  caller that only wants the pool's current default (sessionId null) never
   *  sees the flag, because that is exactly the question the default answers. */
  slotAt(sessionId, at, { poolId = null } = {}) {
    const keys = Array.isArray(sessionId) ? sessionId.filter(Boolean) : (sessionId ? [sessionId] : []);
    const named = new Set(keys);
    let own = null, dflt = null;
    for (const r of this.all()) {
      if (r.at > at) break;
      if (poolId && r.poolId && r.poolId !== poolId) continue;
      if (r.sessionId && named.has(r.sessionId)) own = r;
      else if (!r.sessionId) dflt = r;
    }
    const hit = own || dflt;
    if (!hit) return null;
    return {
      id: hit.to, at: hit.at, scope: own ? 'session' : 'default', why: hit.why || null,
      ...(!own && named.size ? { ownLinkUnknown: true } : {}),
    };
  }

  /** Every transition of one conversation (oldest first) — the migration walks
   *  these to place a reading between two re-points. */
  transitionsFor(sessionId) { return this.all().filter((r) => r.sessionId === sessionId); }

  /** B-0248 step 2 unit 5 (lane bl-loop-b, 主开发 r4147): the release read the live file WHOLE here at EVERY record (up to about 2.4 MB on
   *  the loop at each pool re-point: the page bl-loop-b/b0248-page.md). The live file's line count is now kept in the file's one state
   *  (every instance of the file shares it): learned at a whole read (all(), or here when not known), one more a line appended, and
   *  dropped wherever the kept rows are (a failed write, a trim, a change seen outside the hub, a suite's drop). For the hub's own writes
   *  it is never below the file's count (a line glued onto a partial last one counts one more), so their trim is never missed. A writer
   *  outside the hub is seen by the backstop's look (above), which drops it — while rows are kept (the look runs from a read that
   *  answers from memory); with none kept, the next whole read (all()) learns the file's count. So another writer's lines can make
   *  the trim late by those lines, never wrong: the cut judges the lines it read. The file is read whole only when
   *  the count is not known or has passed the bound, and the cut judges the lines it read, never the count */
  _maybeTrim() {
    const st = this._st;
    if (st.held) return;   // held: nothing is moved between files until the ledger reads again
    if (st.lines != null && st.lines <= this.max) return;
    let txt; try { txt = fs.readFileSync(this.file, 'utf-8'); } catch { st.lines = null; return; }
    const lines = txt.split('\n').filter(Boolean);
    st.lines = lines.length;
    if (lines.length <= this.max) return;
    const cut = Math.floor(lines.length / 2);
    try {
      fs.mkdirSync(this.archiveDir, { recursive: true });
      // APPEND, and one shard per UTC day: two trims inside the same
      // millisecond used to share a Date.now() filename and the second
      // OVERWROTE the first — an archive that silently loses what it was
      // created to preserve is worse than no archive.
      const out = path.join(this.archiveDir, `slot-transitions-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.jsonl`);
      // B-574d «usage-readings» (主开发 r5072, lane lg-group-parents): THE TRIM IS SYNCED ON BOTH SIDES, the archive first. The half it
      // cuts is appended to the day's shard and SYNCED there before the live file loses it (a power cut must never leave the live
      // file trimmed while the archive lacks the half it keeps); then the kept half replaces the live file through the tree's one door
      // (src/fd-close.js renameSynced: synced before its name). A failed write, sync or close on either side is a failed trim: nothing
      // is cut (the live file keeps every line; a half already appended is appended again by the next trim — a line twice in the
      // archive, never a line lost), said once. Synchronous by the rate rule (主开发 r4957): a save the code bounds to a rare event
      // (past MAX_LINES). Only a file system with no sync at all lands, said once.
      // 主开发 r5124: THE HALF STARTS WITH A LINE BREAK. An append that failed part-way (a short write on a full disk, a power cut
      // before the sync) leaves a torn tail with no line break; without one in front, the next trim's first row is glued to that
      // tail, the reader drops the glued line, and the replace cuts that row from the live file: in neither. The readers skip the
      // empty line. A trim that keeps failing AFTER its append landed appends the half again at each record past the bound: rows
      // twice in the archive, the same slot at every time (the reader sorts; the same rows give the same answer).
      const half = Buffer.from('\n' + lines.slice(0, cut).join('\n') + '\n');
      const fd = fs.openSync(out, 'a');
      let failed = null;
      try {
        for (let o = 0; o < half.length;) { const n = fs.writeSync(fd, half, o, half.length - o); if (!(n > 0)) throw Object.assign(new Error('a short write'), { code: 'ESHORT' }); o += n; }
        try { fs.fsyncSync(fd); } catch (e) { if (!FC.SYNC_UNSUPPORTED.has(e && e.code)) throw e; sayTrim(FC.syncUnsupportedWords('the slot ledger\'s archive', e.code)); }
      } catch (e) { failed = e; }
      try { fs.closeSync(fd); } catch (e) { if (!failed) failed = e; }   // a close that fails after the write: its bytes may not be there — a failed write
      if (failed) throw failed;
      FC.renameSynced(this.file + '.tmp', this.file, lines.slice(cut).join('\n') + '\n', { where: 'slot-transitions.jsonl', say: sayTrim });
    } catch (e) { sayTrim(`the slot ledger's trim did not happen (${(e && e.code) || (e && e.message) || e}) — the live file keeps every line; the next record tries again`); }
    st.lines = null;   // …and its count is learned again
    this._st.rows = null; this._st.gen++;   // a trim (whole or failed half-way) moved rows between files: the next read reads them
  }
}

module.exports = { SlotTransitions, MAX_LINES, DEDUP_MS, LOOK_EVERY_MS, LEDGER_HELD, isLedgerHeld, _ledgerTestSeam: (o) => { for (const k of Object.keys(_test)) delete _test[k]; Object.assign(_test, o || {}); } };
