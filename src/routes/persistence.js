/**
 * Persistence API routes — layouts, bookmarks, custom themes, user state,
 * settings. All are file-backed JSON stores with WS broadcast.
 * (Session groups live inside user-state; the old /api/session-groups CRUD
 * routes were removed — they were unreachable and used a conflicting data
 * shape that normalizeUserState would have flattened to [].)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { listCodexThreads } = require('../codex-session-store');
const { desktopChanges } = require('../lib/desktop-record.js'); // PURE: a rollback point names the change that followed it (userW inc-mun7qjmw-iksh)
const { windowIds } = require('../lib/desktop-record.js'); // PURE (lane layout-stopped-window): one desktop restored alone takes its windows back from the others
const { namedTwinIn } = require('../lib/desktop-record.js'); // PURE (lane layout-stopped-window r3): the point that still names a nameless window's conversation
const { noteDupsLeft } = require('../lib/desktop-record.js'); // PURE (r4 K, inc-mw1ogdno-5jny): a desktop's dedup trace never names a window its record lists
const SH = require('../store-hold.js'); // B-225b (lane lg-store-writes): a store that could not be read has NO VALUE — its one read, hold and write
const UO = require('../user-state-ops.js'); // PURE (lane sidebar-echo-order, inc-mwbn2xp8-ks0b): user state by item, in the server's order (stateRev within a life, stateEpoch)
const { normalizeCustomThemes } = require('../custom-theme-normalize.js'); // PURE (lane cache-warmth-ramp r3): a value a theme derivation superseded is dropped at the store's ONE writer
const { personOnlyDoor } = require('./account-tails.js');   // B-ee0a: the no-vault export of credentials asks the person verdict first
const { RETIRED_SETTING_KEYS } = require('../retired-settings.js'); // PURE: the retired settings keys (B-df40 part 1) — one may LEAVE data/settings.json, never re-enter it

const router = express.Router();

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// (B-0248 (b), lane bl-loop-b: the module's own atomic writer is gone — its last callers, the rollback points, are THE STORE WRITER's;
// every store of this file writes through its hold — src/store-hold.js — whole bytes through a pid temp name and a rename)

// A LAYOUT RECORD KEEPS NO RECORD'S WORDS (lane-redact verify r5, reproduced in chrome). A window's title is DISPLAY —
// every client rebuilds it from its own store when the window replays from its openSpec — yet the record carries it to
// data/layouts.json, to every rollback point, to every other client (the relayed layout-sync frame, cached per desktop in
// DesktopManager._savedStates) and back out through GET /api/layouts. The Job input window's title names its job
// (`<job name> — needs your input`), and a job's name is a record's words ("Clear content…" clears it): a desktop record
// nobody re-saved after the clear (another desktop, a named layout) kept it on disk and served it. So a window whose
// title carries a record's words is kept in a layout record under its GENERIC title — at the ONE write choke point
// (writeLayouts: a layout-sync, a preset, a rollback restore, a config import) and at the first read of the file (what
// an older build wrote). `WORDLESS_TITLES` = openSpec action → the title a record keeps; the client census
// (test-record-clear-census §H) fails a window whose title reads a record's words without a row here. The table lives in
// PURE src/record-clear.js since verify r7 — the client's capture (layout.js captureState) reads the same one.
const { WORDLESS_TITLES } = require('../record-clear.js');
/** In place: every window record (an object with an `openSpec`) whose action is in WORDLESS_TITLES keeps that title.
 *  → how many titles it changed. Bounded depth; anything that is not a plain JSON tree is left alone. */
function wordlessTitles(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 16) return 0;
  let n = 0;
  if (Array.isArray(node)) { for (const x of node) n += wordlessTitles(x, depth + 1); return n; }
  const spec = node.openSpec;
  if (spec && typeof spec === 'object' && typeof spec.action === 'string' && Object.prototype.hasOwnProperty.call(WORDLESS_TITLES, spec.action)
    && typeof node.title === 'string' && node.title !== WORDLESS_TITLES[spec.action]) { node.title = WORDLESS_TITLES[spec.action]; n++; }
  for (const k of Object.keys(node)) if (k !== 'openSpec' && node[k] && typeof node[k] === 'object') n += wordlessTitles(node[k], depth + 1);
  return n;
}

// THE RING IS SPREAD OVER TIME (B-b05e — userW 2026-11-05: a phone wrote 17 rollback points in 2 minutes after a restart and
// every point of the last weeks was gone; the ring held the first 10 points ever written + 30 from the burst, and «Restore a
// previous layout» offered only damaged ones). A point is KEPT when it is one of the newest RING_KEEP.last writes, the OLDEST
// point of one of the newest RING_KEEP.hours hours that hold a point, the OLDEST point of one of the newest RING_KEEP.days
// days that hold a point (UTC buckets — the same answer in every zone), or `pinned` (the newest RING_KEEP.boots «before a
// restart» points: a person who restarts again after a bad restart still finds the point before the first one). Buckets
// count hours / days THAT HOLD A POINT, never the clock: a hub idle for a month keeps its spread, and a burst — however
// long — fills one hour of one day, so it never evicts a day. Time order is the stamp's, then the writer's sequence (a
// base-36 suffix of growing width); a name with no stamp is the oldest. At most 10 + 24 + 14 + 3 points.
const RING_KEEP = { last: 10, hours: 24, days: 14, boots: 3 };
/** layout-history file name → its write time (ms), from the ISO stamp the writer puts in it; NaN when it has none. */
function ringStampMs(name) {
  const m = /^layout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(String(name || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]) : NaN;
}
/** The writer's sequence suffix of a rollback point name (base 36) — the order inside one millisecond; -1 when it has none. */
function ringSeq(name) {
  const m = /Z-([0-9a-z]+)(?:\.restart)?(?:\.json)?$/.exec(String(name || ''));
  return m ? parseInt(m[1], 36) : -1;
}
/** PURE: rollback point names in time order (the stamp, then the writer's sequence; a name with no stamp first). */
function ringSort(names) {
  const at = (f) => { const t = ringStampMs(f); return Number.isFinite(t) ? t : -Infinity; };
  return [...new Set((names || []).map(String))].sort((a, b) => (at(a) - at(b)) || (ringSeq(a) - ringSeq(b)) || (a < b ? -1 : a > b ? 1 : 0));
}
/** PURE: the rollback point file names to KEEP (a Set) out of `names` (any order); `pinned` = a name or a list of names. */
function ringKeep(names, { pinned = null, last = RING_KEEP.last, hours = RING_KEEP.hours, days = RING_KEEP.days } = {}) {
  const all = ringSort(names);
  const newest = (a, n) => a.slice(Math.max(0, a.length - n)); // n = 0 keeps none (a bare slice(-0) is the whole list)
  const keep = new Set(newest(all.filter((f) => Number.isFinite(ringStampMs(f))), last));
  for (const p of [].concat(pinned || [])) if (all.includes(String(p))) keep.add(String(p));
  const firstOf = (span) => { const m = new Map(); for (const f of all) { const t = ringStampMs(f); if (!Number.isFinite(t)) continue; const k = Math.floor(t / span); if (!m.has(k)) m.set(k, f); } return [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]); };
  for (const f of newest(firstOf(3600000), hours)) keep.add(f);
  for (const f of newest(firstOf(86400000), days)) keep.add(f);
  return keep;
}

// ── B-225b's REMAINDER (lane login-request-card, 主开发 r1310 / r1318): WHAT THE NEXT START KNOWS OF THE LAST STOP ──
// Every layouts.json write carries a server-owned STAMP inside its own bytes — the LAST top-level name, `_vs` {run, seq, at, stop,
// sum, unnoted?} — so the stop's own flush (already there) says «stopped, all landed» (stop:true) with NO write added to the stop
// (law 3). The store's value in memory never holds it: readLayouts strips it, so no answer, export, broadcast or rollback point
// carries it (scripts/test-store-held-page §8's census of the roads). `sum` is the checksum of the bytes BEFORE the stamp: a file
// another reader rewrote and kept the name in (the release 2.369.414 keeps an unknown top-level name and writes it back verbatim)
// no longer matches it — such a stamp says NOTHING (silence), never a stale «not saved».
const STAMP = '_vs';
const STAMP_AT = ',\n  "' + STAMP + '": ';
const sumOf = (text) => require('crypto').createHash('sha1').update(text).digest('hex').slice(0, 16);
/** the bytes of `doc` with the stamp as their last name (PURE) */
function stampedBytes(doc, stamp) {
  const body = JSON.stringify(doc, null, 2);
  const tag = JSON.stringify({ ...stamp, sum: sumOf(body) });
  return body === '{}' ? `{\n  "${STAMP}": ${tag}\n}` : body.slice(0, -2) + STAMP_AT + tag + '\n}';
}
/** a read's stamp (PURE): `doc` as parsed, `text` its bytes → { stamp, trusted } — stamp null: the file carries none */
function stampOfRead(doc, text) {
  const st = doc && typeof doc === 'object' && doc[STAMP] && typeof doc[STAMP] === 'object' && !Array.isArray(doc[STAMP]) ? doc[STAMP] : null;
  if (!st) return { stamp: null, trusted: false };
  const at = typeof text === 'string' ? text.lastIndexOf(STAMP_AT) : -1;
  const body = at > 0 ? text.slice(0, at) + '\n}' : typeof text === 'string' && text.startsWith(`{\n  "${STAMP}": `) ? '{}' : null;   // (a doc whose only name is the stamp)
  return { stamp: st, trusted: body !== null && typeof st.sum === 'string' && sumOf(body) === st.sum };
}
/** PURE: the mark names exactly the stamp the file carries (its run's start, or its last landing) — the KNOWN test (r1387 (3)) */
function markNamesStamp(m, st) { return !!m && (m.base == null ? st == null : (!!st && m.base.run === st.run && Number(m.base.seq) === Number(st.seq))); }
/** THE START'S VERDICT ON THE LAST STOP (PURE, 主开发 r1318 — two strengths, not one; r1387 (3) the mark's base) → null | { kind: 'known', since, savedAt, cause } |
 *  { kind: 'maynot', savedAt }.
 *   KNOWN: the last run's own owed mark (`mark` {run, seq, since}: written when a write could not land) is of the SAME run as the
 *     file's stamp and NEWER than it — a write was owed and did not land. Said until a person notes it; carried in the next writes'
 *     stamp (`unnoted`) across a later restart.
 *   MAY NOT: the stamp says no clean stop (stop false) and no such mark — a kill, a power loss, or a run whose mark the disk refused
 *     after it had landed a write: said once and quietly, gone at this run's first landed write, never carried. A run that landed
 *     NOTHING and whose mark was refused too leaves the older run's clean stamp: nothing is told (no second storage could say it).
 *   Nothing: no stamp (a file this version never wrote), a stamp another reader kept (`trusted` false), a clean stop. */
function stopVerdict({ stamp, trusted, mark }) {
  if (stamp && !trusted) return null;   // another reader rewrote the bytes under the stamp: it says nothing
  const st = stamp || null, m = mark && typeof mark === 'object' && 'base' in mark ? mark : null;
  // KNOWN (主开发 r1387 (3)): the mark names the stamp its run STARTED FROM (the last landing it knew, the start's own stamp at first):
  // when the file still carries exactly that stamp, nothing that run owed ever landed — whatever the stamp's `stop` says (a run whose
  // every write was refused leaves the older run's clean stamp beside its mark); a base that no longer matches is a stale mark: silent
  if (m && markNamesStamp(m, st)) {
    // r1798 (2): a mark this run wrote over the last run's KNOWN loss nobody noted CARRIES it (`prior`): the earliest moment is told,
    // and a refusal outranks lateness — the older loss is never told with this run's time and cause
    const pr = m.prior && typeof m.prior === 'object' ? m.prior : null, own = Number(m.since) || null, old = pr ? Number(pr.since) || null : null;
    const late = m.code === 'queued' && (!pr || pr.cause === 'late');
    return { kind: 'known', since: old && (!own || old < own) ? old : own, savedAt: st ? Number(st.at) || null : null, cause: late ? 'late' : 'refused' };
  }
  if (!st) return null;
  const savedAt = Number(st.at) || null;
  const u = st.unnoted && typeof st.unnoted === 'object' ? st.unnoted : null;
  if (u && u.kind === 'known') return { kind: 'known', since: Number(u.since) || null, savedAt: Number(u.savedAt) || null, cause: u.cause === 'late' ? 'late' : 'refused' };
  if (st.stop !== true) return { kind: 'maynot', savedAt };
  return null;
}
/** A ROLLBACK POINT IS OFFERED ONLY WHEN IT CAN BE READ (PURE, r1310 law 1): its sidecar's facts `meta` (null: none read), and a stat of
 *  the point's own file (`size`, or `statCode` when the stat failed) → null (readable as far as is known) | the reason's code. A meta
 *  that names the point's byte count (`bytes`, since this unit) must meet it exactly: a torn or shortened point is not offered. */
function pointUnread(meta, { size = null, statCode = null } = {}) {
  if (statCode) return statCode;
  if (meta && Number.isFinite(meta.bytes) && size !== meta.bytes) return 'size';
  return null;
}

/** Setup persistence routes. Requires { dataDir, wss, WS_OPEN, getSyncStore, activeSessions, auth } context. */
function setup({ dataDir, wss, WS_OPEN, getSyncStore, activeSessions, auth, getHosts, getMounts, getTasks, getAccounts, getUsageHistory, onSettingsWrite, onUserStateWrite = () => {}, getExitProxy = () => null, userStateClock = () => Date.now(), userStateMono = () => performance.now(), writer = null }) {   // (lane sidebar-echo-order r7: the facts' clock — a test's virtual one)
  const broadcast = (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(client => {
      if (client.readyState === WS_OPEN) { try { client.send(json); } catch {} }
    });
  };
  // lane sidebar-echo-order r12: a frame whose text is made by `make` (the user state's, read off its file's one stringify) — made
  // only when a client is there to take it
  const broadcastText = (make) => {
    let json = null;
    wss.clients.forEach(client => {
      if (client.readyState === WS_OPEN) { if (json === null) json = make(); try { client.send(json); } catch {} }
    });
  };

  /** B-225b: a store's refusal BY NAME — held ⇒ 503 store_unread {held: file, kind, code, since, rung} (R2: never a 200 with the
   *  defaults); a file that appeared since the start ⇒ 409 store_appeared. → true when answered */
  const storeRefused = (res, e) => {
    if (!e || (e.code !== 'store_unread' && e.code !== 'store_appeared')) return false;
    res.status(e.status || 503).json({ error: e.message, code: e.code, ...(e.held ? { held: e.held } : {}) });
    return true;
  };
  /** a route whose store may be held: its refusal answered by name, anything else thrown as before */
  const asideOf = new WeakMap();   // an import's request → the damaged stores it set aside (B-225b)
  const guarded = (fn) => function (req, res, next) {
    let r;
    try { r = fn.call(this, req, res, next); } catch (e) { if (storeRefused(res, e)) return undefined; throw e; }
    if (r && typeof r.then === 'function') return r.catch((e) => { if (!storeRefused(res, e)) throw e; });
    return r;
  };
  // B-0248 (c) (lane bl-loop-b, 主开发 r912): the conversation list, the bookmarks and the custom themes are written by THE STORE WRITER
  // (src/store-writer.js — its own thread does the temp + rename; a suite may hand its own) through their holds' owe()
  // (src/store-hold.js «THE WRITE OFF THE LOOP»): a change is the store's value at once (the next change builds on it), its pages and
  // hooks are told at its LANDING, and every door that changes one ANSWERS AFTER the landing, as when the write held the loop
  const storeW = () => writer || require('../store-writer.js').storeWriter();
  /** a door's answer when its act is not on disk yet (its write failed or passed the writer's bound): 503 BY NAME — the writer keeps
   *  the change and writes it again (a page keeps its acts pending and sends them again: each is held as its own duplicate) */
  const notOnDisk = (res, hold, extra = {}) => {
    const w = hold.notDurable() || {};
    const why = w.code ? ` (${w.code})` : w.why === 'queued' ? ' in time (its write is still queued)' : '';
    return res.status(503).json({ error: `not on disk yet: ${path.basename(hold.file)} could not be written${why} — the change is kept and written again`, code: 'not-durable', why: w.why || null, ...extra });
  };
  /** an answer made on the landing's road may be made INSIDE the hub's exit flush: unencoded (the store writer's identityAtExit —
   *  compression() is asynchronous and the exit comes first), as every route answering on durable()'s road does */
  const exitSafe = (res) => { try { require('../store-writer.js').identityAtExit(res); } catch { /* no writer module: nothing to mark */ } };
  /** a door's answer AFTER its store's landing: `ok200()` once on disk, else 503 not-durable by name */
  const answerAfter = (hold, res, ok200) => hold.after((ok) => { exitSafe(res); if (ok) ok200(); else notOnDisk(res, hold); });
  /** ONE answer after the landing of every hold in `holds` (an import spans stores; a hold, or any { file, after(cb) }) → answer([files not on disk]) */
  const afterAll = (holds, answer) => {
    let n = holds.length; const bad = [];
    if (!n) { answer(bad); return; }
    for (const h of holds) h.after((ok) => { if (!ok) bad.push(path.basename(h.file)); if (--n === 0) answer(bad); });
  };
  /** the stores' word to every page (R7 — the page's ONE banner reads it): a hold SAID past its silent rungs, and its LIFT */
  const storeWord = (type, facts) => broadcastText(() => JSON.stringify({ type, ...facts }));

  // ── Layout/Preset Persistence (cached in memory) ──
  const LAYOUTS_FILE = path.join(dataDir, 'layouts.json');
  let _layoutsCache = null;
  // B-225b's REMAINDER (login-request-card, 主开发 r1318) — THE LAST STOP, TOLD AT THE NEXT START. This run's stamp (stampedBytes above):
  // its id, the writes' sequence; the OWED MARK (layouts.owed.json {run, seq, since}): written OFF the loop when a layouts write could
  // not land (the hold's onOwedBegin), removed off the loop when the episode is over — never on the stop (law 3), and judged by its run
  // and seq against the file's stamp, never by its presence alone. The mark of the LAST run is read once, off the loop, from here.
  const RUN = `${Date.now().toString(36)}-${process.pid.toString(36)}-${require('crypto').randomBytes(3).toString('hex')}`;
  const OWED_MARK = path.join(dataDir, 'layouts.owed.json');
  let _vsSeq = 0;
  let _stopFact = null;          // the start's verdict (stopVerdict): null | { kind: 'known' | 'maynot', since?, savedAt }
  let _stopJudged = false;       // the verdict is made once — at the first read that HAS the file's bytes (a held start: at its lift)
  let _landedThisRun = false;    // a layouts write of THIS run landed: a «may not» goes by itself (r1318 (b))
  let _oldMarkGone = false;      // the last run's mark removed (off the loop) after this run's first landing
  // the last run's mark, read ONCE off the loop: { state: 'absent' } | { state: 'read', mark } | { state: 'unknown', code } (r1387 (7): a
  // mark that cannot be READ is «unknown», said in the journal — never taken as absent, never turned into «may not» by itself)
  const _markAtStart = fs.promises.readFile(OWED_MARK, 'utf8').then((t) => { try { return { state: 'read', mark: JSON.parse(t) }; } catch { return { state: 'unknown', code: 'not JSON' }; } },
    (e) => (e && e.code === 'ENOENT' ? { state: 'absent' } : { state: 'unknown', code: (e && e.code) || 'unreadable' }));
  let _mark = null;              // this run's mark: { run, seq, since, base, code, written, trying }
  let _lastLanded = null;        // the stamp of the last desktops write that LANDED, as far as this run knows ({run, seq}; the start's own at first)
  let _producedSeq = 0;          // the seq of the bytes the writer took last (its producer is called right before its write)
  // r2338 (2): the press's clear (layoutsLanded) reads _producedSeq as the seq of the bytes that just LANDED. That is true only while
  // the writer has ONE write in flight a file (it calls the next producer once the write before is done). A writer that ever sent
  // two at once would credit the landing of the earlier bytes to the later ones.
  let _markJudged = false;       // the last run's mark has been JUDGED (read and weighed) — only then may this run remove it
  let _judgedSeq = 0;            // r1595 (a): the last seq of bytes made BEFORE the verdict (they carry no `unnoted`)
  let _oldKnown = null;          // r1595 (a): the last run's mark when it IS the KNOWN verdict — it follows this run's landings of such bytes
  let _startUnnoted = null;      // a KNOWN loss the start's own stamp carries: bytes made before the verdict carry it on (its road's (a))
  let _pressPending = null;      // r1798 (1)/(2): a loss the person noted whose note has not landed yet — it is still the loss to carry
  let _pressSeq = 0;             // r2254: the seq of the press's own bytes — a landing of those (or later) bytes records the note
  let _judgedResolve = null;
  const _stopJudgedP = new Promise((r) => { _judgedResolve = r; });
  let _markChain = Promise.resolve();
  const stopWord = () => (_stopFact ? { file: 'layouts.json', ..._stopFact } : null);
  /** the episode's mark, written OFF the loop (a temp, then the rename); a failure is the journal's line and is tried again at the next
   *  failed flush — a stop before it lands is told «may not» at the next start (r1318 (b)) */
  function writeMark(m = _mark, live = () => _mark === m) {   // (r1595 (a): also the last run's KNOWN mark, followed — the ONE writer of the mark)
    if (!m || m.written || m.trying) return;
    m.trying = true;
    _markChain = _markChain.then(async () => {
      if (!live()) { m.trying = false; return; }   // the episode is over already
      const markTmp = `${OWED_MARK}.${process.pid}.tmp`;
      try {
        await fs.promises.writeFile(markTmp, JSON.stringify({ run: m.run, seq: m.seq, since: m.since, base: m.base, code: m.code, ...(m.prior ? { prior: m.prior } : {}) }));
        await fs.promises.rename(markTmp, OWED_MARK);
        m.written = true;
        if (!live()) await fs.promises.unlink(OWED_MARK).catch(() => {});   // over while it was written: the removal is the last word
      } catch (e) {
        await fs.promises.unlink(markTmp).catch(() => {});
        console.warn(`[layouts] the owed mark could not be written (${(e && e.code) || (e && e.message) || e}) — a stop before the desktops are written is told «may not have been saved» at the next start`);
      }
      m.trying = false;
    });
  }
  /** the owed episode is over (landed, or ended by name): its mark removed OFF the loop (a removal that fails is harmless — judged by run
   *  and seq) */
  function markOver() {
    if (!_mark) return;
    _mark = null;
    // r1798 (2): this run's episode wrote its mark over the last run's KNOWN mark that was following this run's landings — its end
    // (landed, or ended by name) puts that mark back on the file's stamp, never only removes it (a kill would read «may not» or nothing)
    if (_oldKnown && !_oldMarkGone && _markJudged) { followOld(_lastLanded ? { run: _lastLanded.run, seq: _lastLanded.seq } : null); return; }
    _markChain = _markChain.then(() => fs.promises.unlink(OWED_MARK).catch(() => {}));
  }
  /** THE VERDICT, once the file's stamp is known (the first read with bytes) and the last run's mark is read (off the loop): every page
   *  told (a page that connects later asks GET /api/stores/held) */
  function judgeStop(st) {
    if (_stopJudged) return;
    _stopJudged = true;
    _markAtStart.then((r) => {
      if (r.state === 'unknown') console.warn(`[layouts] the last run's owed mark could not be read (${r.code}) — whether its last desktop changes landed is UNKNOWN from the mark; the file's own stamp is judged alone`);
      const mk = r.state === 'read' && r.mark && r.mark.run !== RUN ? r.mark : null;   // (the round's note) this run's own mark is never the last run's
      const v = stopVerdict({ ...st, mark: mk });
      _markJudged = true; _judgedSeq = _vsSeq;
      _oldKnown = v && v.kind === 'known' && markNamesStamp(mk, (st && st.trusted && st.stamp) || null) ? mk : null;
      if (_landedThisRun) oldMarkAfterLanding();   // a landing came first: judged only now
      if (_mark && v && v.kind === 'known' && !_mark.prior) { _mark = { ..._mark, prior: { since: v.since, cause: v.cause }, written: false, trying: false }; writeMark(); }   // r1798 (2): an episode begun before the verdict
      if (v && !(v.kind === 'maynot' && _landedThisRun)) {   // (b) goes by itself at this run's first landing — even one before the verdict
        _stopFact = v;
        const when = (ms) => (ms ? new Date(ms).toISOString() : 'an unknown time');
        if (v.kind === 'known') console.warn(`[layouts] at the last stop, the desktop changes made since ${when(v.since)} had NOT reached the disk (${v.cause === 'late' ? 'not taken in time' : 'refused'}; the owed mark names the stamp the file still holds) — every page is told until a person notes it`);
        else console.warn(`[layouts] the last stop was not a clean stop (the file's stamp says so, no owed mark): desktop changes made after ${when(v.savedAt)} may not have been saved — told once, quietly`);
        storeWord('store-stop-unsaved', stopWord());
      }
      _judgedResolve?.(_stopFact);
    });
  }

  // B-225b (cut 3 — R1, R2, R6, R10, R12): THE DESKTOPS' HOLD. A layouts.json the START could not read (a read that failed, bytes that
  // are not a layout) is HELD and has NO VALUE: GET /api/layouts and every layout door answer 503 store_unread by name, the ws doors
  // answer `layout-held`, and nothing writes over it (writeLayouts and the flush refuse). The release read it as the EMPTY layout:
  // a page then made «Desktop 1», and the hub wrote it over the person's desktops. NOT THERE writes nothing at the read; the first
  // change creates it exclusively. A failed RE-read never replaces the copy in memory (there is no re-read: the copy is the truth).
  let _layoutsRead = false;
  const LAYOUTS_EMPTY = () => ({ current: null, autoSave: null, saved: {}, customGrids: [] });
  let _doorsWaiting = 0;   // doors past their bound whose change still waits to be handed: no landing lifts their mark (the cure's read, its MUST)
  /** an owed write's words by its code (the second fresh read's should): a write only QUEUED past the writer's bound is said as queued */
  const unsavedHow = (o) => (o && o.code === 'queued' ? 'its write is still queued behind the storage' : (o && o.code) || 'write failed');
  const layoutsHold = SH.create({
    file: LAYOUTS_FILE,
    valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
    onLift: () => layoutsAgain('its hold lifted'),
    writer: storeW,   // B-0248 (a) (lane bl-loop-b): the desktops' write is the STORE WRITER's — flushLayouts' owe
    liftWaits: () => _doorsWaiting > 0,   // a door's change past its bound not handed yet: a landing now is an OLDER write's — the mark stays
    // B-225b's SECOND HALF (主开发 r662): a write the storage refused is OWED — kept, retried on the hold's own ladder; past the silent
    // rungs EVERY page is told (one client's failing save is every client's fact), lifted when a write lands
    onUnsaved: (u) => { console.warn(`[layouts] ${u.file} cannot be written (${unsavedHow(u)}) since ${new Date(u.since).toISOString()} — the desktops in memory are NOT on disk; written again by the ladder`); storeWord('store-unsaved', u); },
    onSaved: (u) => { console.log(`[layouts] ${u.file} is written again — the desktops kept since ${new Date(u.since).toISOString()} are on disk`); storeWord('store-saved', { file: u.file }); },
    onOwedRefused: (e) => { if (e && e.code === 'store_appeared') layoutsAgain('a file appeared where the start found none'); },
    // B-225b's remainder: an owed episode's MARK (written off the loop at its first failure, removed when it is over)
    onOwedBegin: (o) => { _mark = { run: RUN, seq: _vsSeq, since: (o && o.since) || Date.now(), base: _lastLanded ? { ..._lastLanded } : null, code: (o && o.code) || null, prior: priorLoss(), written: false, trying: false }; writeMark(); },   // (r1798 (2): it carries the last run's loss nobody noted)
    onOwedOver: (o) => { markOver(); if (o && o.landed) { _lastLanded = { run: RUN, seq: _producedSeq }; layoutsLanded(); } },   // (the ladder's landing tells no onLanded: its stamp is the base all the same)
    // r1387 (1): EVERY landing of the desktops — an autosave nobody waits on too (landLayouts keeps no waiter for it) — is told here
    onLanded: () => { _lastLanded = { run: RUN, seq: _producedSeq }; layoutsLanded(); },
    onSaid: (h) => { console.warn(`[layouts] ${h.file} still cannot be read (${h.kind}${h.code ? `, ${h.code}` : ''}) — the desktops are HELD: nothing is written over them, their doors refuse by name until it reads`); storeWord('store-held', h); },
  });
  /** the desktops read again WHOLE (the hold lifted, or a file appeared where the start found none): every page told */
  let _layoutsGen = 0;   // B-0248 (a): a read again WHOLE (lift, appeared) ends every flush still waiting: its change was not made
  function layoutsAgain(why) {
    _layoutsGen++;
    try { layoutsHold.owedEnd(`read again whole (${why})`); } catch { /* the hold's */ }   // every waiting flush ends (its generation): nothing it owed is owed now
    if (_layoutsSaveTimer) { clearTimeout(_layoutsSaveTimer); _layoutsSaveTimer = null; }
    _layoutsCache = null; _lastGood = null; _lastShape = null;
    try { readLayouts(); } catch (e) { console.warn(`[layouts] the desktops could not be read again (${why}): ${(e && e.message) || e}`); return; }
    console.log(`[layouts] the desktops are read again (${why})`);
    storeWord('store-lifted', { file: 'layouts.json', why });
  }

  // lane conversation-facts: `preread` = the file's text the list read OFF the loop (layoutsAsync) — the same parse and checks,
  // no sync read and no mkdir; '' (a file that could not be read) parses to the empty record as before
  function readLayouts(preread) {
    if (_layoutsCache) return _layoutsCache;
    // (B-225b: ONE start read, through the hold — the flag only AFTER it returned: a folder check that throws (a stale or dead data
    // mount) IS that read's failure, a hold on the ladder, never «read and empty» — round wyzvr7567's MUST 1)
    if (!_layoutsRead) { let pre = preread; if (pre === undefined) { try { ensureDir(dataDir); } catch (e) { pre = { error: e }; } } layoutsHold.readAtStart(pre); _layoutsRead = true; }
    const doc = layoutsHold.answer();   // R2: HELD ⇒ store_unread by name — never the empty layout under its name
    const text = layoutsHold.takeText();
    // B-225b's remainder: the stamp is read ONCE (the first read with the file's bytes) and STRIPPED — the value never holds it
    if (doc && typeof doc === 'object' && Object.prototype.hasOwnProperty.call(doc, STAMP)) {
      const st = stampOfRead(doc, text);
      delete doc[STAMP];
      if (!_stopJudged && text != null) {
        if (st.stamp && st.trusted) { _lastLanded = { run: st.stamp.run, seq: st.stamp.seq }; const u = st.stamp.unnoted; _startUnnoted = u && typeof u === 'object' && u.kind === 'known' ? { ...u } : null; }
        judgeStop(st);
      }
    } else if (!_stopJudged && (text != null || doc === undefined)) judgeStop({ stamp: null, trusted: false });   // no stamp (an older build's file) or no file: a mark may still name it
    _layoutsCache = doc === undefined ? LAYOUTS_EMPTY() : doc;   // NOT THERE (R6): the empty layout in memory, nothing written
    // what an older build wrote: a Job input window's title naming its job (the next flush writes the generic title)
    if (wordlessTitles(_layoutsCache)) { if (_layoutsSaveTimer) clearTimeout(_layoutsSaveTimer); _layoutsSaveTimer = setTimeout(flushLayouts, 500); }
    // …and a dedup trace naming a window its desktop's record lists (r4 K — tracesTrue below)
    if (tracesTrue(_layoutsCache)) { if (_layoutsSaveTimer) clearTimeout(_layoutsSaveTimer); _layoutsSaveTimer = setTimeout(flushLayouts, 500); }
    return _layoutsCache;
  }

  // Disk write is debounced: layout-sync WS messages arrive on every window
  // change from every client — a sync full-file write per message was a steady
  // event-loop hot path. The in-memory cache is authoritative between flushes.
  let _layoutsSaveTimer = null;
  /** the restore door's answer when its write did not land (B-225b's second half): BY NAME — never «restored» over a write the storage
   *  refused; the restore stands in memory (every page shows it) and is written by the hold's ladder */
  const restoreUnsaved = () => { const o = layoutsHold.owed() || {}; return { error: `restored here, but NOT saved: layouts.json ${o.code === 'queued' ? 'is not on disk yet (its write is still queued behind the storage)' : `could not be written (${unsavedHow(o)})`} — the restore is kept in memory and written again by itself; a restart before it lands brings back the older desktops`, code: 'store_unsaved', unsaved: { file: 'layouts.json', code: o.code || null, since: o.since || null } }; };
  /** a restore whose write ended BY NAME (a saved layouts.json appeared since the start — read and kept, the restore dropped): the
   *  store's own appeared refusal, never «kept in memory and written again» (round wg2vawd0o) */
  const restoreDropped = () => ({ error: 'the restore was not made: layouts.json appeared since VibeSpace started — it was read and kept; restore again', code: 'store_appeared' });
  /** the layout-restored broadcast with the unsaved fact riding it: the restoring page says the refusal, never «restored» */
  const toldUnsaved = (told) => { const o = layoutsHold.owed() || {}; const w = JSON.parse(told); return JSON.stringify({ ...w, unsaved: { file: 'layouts.json', code: o.code || null, since: o.since || null } }); };
  /** → true when the desktops are on disk. A write the storage refuses is OWED (the hold keeps trying, says it past the silent rungs,
   *  lifts at the landing — B-225b's second half); `press` = a person's act (said at once); `stop` = the exit's last flush (a failure
   *  there is the journal's line, by the store's name: the next start reads the older file) */
  // B-0248 (a)+(b) (lane bl-loop-b, 主开发 r912 — measured: at 500 ms a rename, a window moved held the hub's loop 501 ms, a window
  // closed 1002 ms in ONE turn — the rollback point's two files — then 501 ms): THE DESKTOPS' WRITE IS THE STORE WRITER'S. The 500 ms
  // debounce above stays the release's own (a hub that dies loses no more of a person's last window moves than the release does:
  // the changes of the last 500 ms of quiet, plus the write's own time on the storage); when it fires the bytes go to the writer
  // as an ACT (urgent: its next turn) — the loop never waits. R10 BY LANDING: every rollback point owed is handed first and the
  // layouts.json write is handed only once they LANDED (a point that failed is said, as the release did, and the write goes on).
  // `answer(landed)` — the restore doors' and the import's: true once on disk; false not on disk (owed: the writer writes it again,
  // its words said past the silent rungs, at once for a press) or ended BY NAME (held, a file that appeared: nothing kept)
  // ONE WAITING COPY OF THE DESKTOPS A MARK (the second fresh read's small): flushes in a row that wait for the SAME points (window
  // moves while a point is in flight on a stalled storage) share ONE waiting flush — the newest bytes take the older's place, every
  // answer told at its landing; so a stalled point holds one copy of the desktops for each mark, never one for each flush
  let _layoutsWaiting = null;   // the newest flush still waiting for its points: { upTo, gen, doc, text, press, stop, answers }
  let _autosaveWaiting = false;   // ONE durable wait for the autosaves nobody waits on (below)
  // (4) A DOOR'S ANSWER WITHIN ITS BOUND (主开发 r1353): a flush that carries an answer (both restores, the import) is answered within
  // the writer's own bound (its durable bound: 60 s, or the one a writer states) — past it «not taken in time»: the store marked owed
  // and QUEUED first (its words, at once for a press), then the answer false. The flush is KEPT: it still lands after its point, and
  // that landing lifts the mark (the hold's onSaved: every page told it landed). Unref'd: a stop never waits on it
  const boundMs = () => { const w = storeW(); return w && Number.isFinite(w.durableMs) && w.durableMs > 0 ? w.durableMs : 60000; };   // the writer's durableMs, exported beside its grace (60 s: a writer that hands none)
  /** THE ONE BOUND's clock: the writer's own (`onBound(fn, what)` — a suite's stand-in fires it by hand: an injected clock), else a
   *  timer of the writer's bound, unref'd (a stop never waits on it) → its cancel */
  function onBound(fn, what) {
    const w = storeW();
    if (w && typeof w.onBound === 'function') return w.onBound(fn, what);
    const t = setTimeout(fn, boundMs());
    if (t && typeof t.unref === 'function') t.unref();
    return () => clearTimeout(t);
  }
  function boundedAnswer(answer, press, gen) {
    let told = false, waiting = false, handed = false;
    const cancel = onBound(() => {
      if (told) return; told = true;
      // a change a read again WHOLE dropped meanwhile is owed by nobody: answered false unmarked — its door says «dropped» (409)
      if (gen === _layoutsGen) {
        try { layoutsHold.owedQueued({ press }); } catch { /* the hold's */ }
        if (!handed) { waiting = true; _doorsWaiting++; }   // until its flush is handed, no landing lifts the mark (an older write's)
      }
      try { answer(false); } catch (e) { console.warn('[layouts] a flush answer failed:', (e && e.message) || e); }
    }, 'door');
    const once = (ok) => { if (told) return; told = true; cancel(); answer(ok); };
    once.handed = () => { handed = true; if (waiting) { waiting = false; _doorsWaiting--; } };   // landLayouts, on every road, BEFORE its owe
    return once;
  }
  function flushLayouts({ press = false, stop = false } = {}, answer = null) {
    if (_layoutsSaveTimer) { clearTimeout(_layoutsSaveTimer); _layoutsSaveTimer = null; }
    if (stop) _layoutsStopping = true;   // (5): from here a point's write tried in the exit's pass hands the desktops in the round after it
    if (answer) answer = boundedAnswer(answer, press, _layoutsGen);
    // THE BYTES ARE MADE NOW (the fresh read's MUST): the desktops as they stand at THIS flush — every rollback point handed so far
    // preserves an older state, and lands before them; a point made after this flush is a LATER change's, and the flush that writes
    // past it waits for it in its turn (the cache is edited IN PLACE by the socket's apply: bytes made late would hold that change)
    const gen = _layoutsGen, doc = _layoutsCache;
    // B-225b's remainder: the bytes carry this run's STAMP (stampedBytes) — the stop's own flush says stop:true; a KNOWN loss not yet
    // noted by a person rides it (`unnoted`) so a second restart still says it (r1318 (a)); a «may not» is never carried (r1318 (b))
    // r1595 (6): the carried fact keeps its CAUSE (a write only late stays «late» at a second restart); before the verdict is made, the
    // start's own carried loss rides on (bytes made then cannot know the verdict — r1595 (a)'s road for a loss carried in the stamp)
    const unnoted = !_markJudged ? _startUnnoted : _stopFact && _stopFact.kind === 'known' ? { kind: 'known', since: _stopFact.since, savedAt: _stopFact.savedAt, cause: _stopFact.cause } : null;
    const seq = ++_vsSeq, text = doc ? stampedBytes(doc, { run: RUN, seq, at: Date.now(), stop: !!stop, ...(unnoted ? { unnoted } : {}) }) : null;
    const upTo = handPointsOwed();   // (the points' callbacks are the writer's answer road: at the hub's stop they run inside its exit flush)
    const q = _layoutsWaiting;
    if (q && q.upTo === upTo && q.gen === gen) { q.doc = doc; q.text = text; q.seq = seq; q.press = q.press || press; q.stop = q.stop || stop; if (answer) q.answers.push(answer); return; }
    const f = { upTo, gen, doc, text, seq, press, stop, answers: answer ? [answer] : [] };
    if (!pointsLeftUpTo(upTo)) { landLayouts(f); return; }
    _layoutsWaiting = f;
    _pointsWaiters.push({ upTo, cb: () => { if (_layoutsWaiting === f) _layoutsWaiting = null; landLayouts(f); }, ok: true });
  }
  /** a flush whose points have landed: its desktops to the hold's ONE write (the store writer's road), every answer told at the landing */
  function landLayouts(f) {
    const done = (ok) => { for (const a of f.answers) { try { a(ok); } catch (e) { console.warn('[layouts] a flush answer failed:', (e && e.message) || e); } } };
    for (const a of f.answers) if (a && typeof a.handed === 'function') a.handed();   // a door past its bound: its change is handed now (or ended)
    if (f.gen !== _layoutsGen) return done(false);   // read again WHOLE meanwhile (a file appeared, a hold lifted): this change was not made
    if (!f.doc) return done(true);
    try { layoutsHold.owe(f.doc, { name: 'layouts.write', bytes: () => { _producedSeq = f.seq; return f.text; } }); }
    catch (e) { if (e && e.code === 'store_appeared') layoutsAgain('a file appeared where the start found none'); return done(false); }   // a refusal BY NAME (held, not read, appeared): nothing written
    // (a write the STORAGE refuses is never thrown here: a store NOT THERE whose exclusive create is refused is KEPT on the hold's own
    // ladder by its owe — B-225b's second half — and the answer below reads it as owed: not on disk, said at once for a press)
    if (!f.answers.length && !f.stop) {   // an autosave nobody waits on: ONE durable wait at a time (never one a flush) — at its bound the store
      // is owed «queued», silently and dated, so the stop's journal line names the first change not on disk (the cure's read, its small)
      if (_autosaveWaiting) return;
      _autosaveWaiting = true;
      layoutsHold.after(() => { _autosaveWaiting = false; });
      return;
    }
    layoutsHold.after((landed) => {
      if (!landed && f.stop) { const o = layoutsHold.owed(); console.error(`[layouts] layouts.json could NOT be written at the stop (${unsavedHow(o)}) — the desktops changed since ${o ? new Date(o.since).toISOString() : 'this flush'} are not on disk: the next start reads the older file`); }
      if (landed) layoutsLanded();
      else if (_mark && !_mark.written) writeMark();   // the mark that could not be written is tried again at each flush not on disk (off the loop)
      done(landed);
    }, { press: f.press });
  }
  /** a layouts write of THIS run landed (the flush's, or the hold's ladder — onOwedOver): a «may not» goes by itself (r1318 (b): every
   *  page told), the last run's mark is removed off the loop (its verdict is made; a KNOWN loss rides this run's stamp from here) */
  function layoutsLanded() {
    _landedThisRun = true;
    // r2254 (the must): the press's note LANDED — those bytes, or later ones (they carry no loss either): the loss is no longer this run's to carry
    if (_pressPending && _producedSeq >= _pressSeq) _pressPending = null;
    if (_stopFact && _stopFact.kind === 'maynot') { _stopFact = null; storeWord('store-stop-over', { file: 'layouts.json', why: 'written' }); }
    oldMarkAfterLanding();   // (r1387 (7): never a mark not yet judged)
  }
  /** the last run's KNOWN mark, written again on `base` (the file's stamp now) by the mark's one writer, off the loop */
  function followOld(base) {
    const m = { run: _oldKnown.run, seq: _oldKnown.seq, since: _oldKnown.since, code: _oldKnown.code, base, ...(_oldKnown.prior ? { prior: _oldKnown.prior } : {}), written: false, trying: false };
    _oldKnown = m;
    writeMark(m, () => _oldKnown === m && !_oldMarkGone && !_mark);
  }
  /** r1798 (2): the last run's KNOWN loss nobody noted, for this run's own mark to carry ({since, cause}), or null */
  function priorLoss() { const f = _stopFact && _stopFact.kind === 'known' ? _stopFact : _pressPending; return f ? { since: f.since, cause: f.cause } : null; }
  /** r1595 (a): the last run's mark after a landing of THIS run. Bytes made AFTER the verdict carry a KNOWN loss (`unnoted`): the mark
   *  goes. Bytes made BEFORE it carry none: a KNOWN loss's mark FOLLOWS that landing (its base is the file's stamp now — kept as it
   *  was, it would name a stamp the file no longer has and read «may not»), written off the loop by the mark's one writer, so a kill
   *  before the next landing still reads KNOWN. Any other verdict: the mark goes. */
  function oldMarkAfterLanding() {
    if (_oldMarkGone || !_markJudged || _mark) return;
    if (_oldKnown && _producedSeq <= _judgedSeq && _lastLanded && _lastLanded.run === RUN) { followOld({ run: _lastLanded.run, seq: _lastLanded.seq }); return; }
    _oldMarkGone = true; _oldKnown = null; _markChain = _markChain.then(() => fs.promises.unlink(OWED_MARK).catch(() => {}));
  }
  // ── LAYOUT HISTORY (2.296.0, after a bug flattened a user's whole desktop
  // layout and the only good copy was gone). Layouts are the one piece of
  // state a bug can destroy in a way no transcript recovers: sessions survive,
  // but WHERE they lived is unrecoverable. Every write passes through here, so
  // this is the one place a rollback point can exist.
  //
  // Snapshot the PREVIOUS state (the about-to-be-replaced one) whenever the
  // desktop→window SHAPE changes — geometry drags and z-order churn are
  // deliberately ignored, or a drag would evict every useful restore point in
  // seconds. A destructive write therefore always leaves the last good shape
  // on disk. Bounded and spread over time (ringKeep above — B-b05e), tiny JSON.
  const HISTORY_DIR = path.join(dataDir, 'layout-history');
  // shape = per-desktop sorted window ids. Catches windows moving between
  // desktops, disappearing, or a desktop being emptied — the damage classes.
  // CRITICAL (adversarial review, verified against a real production
  // layouts.json): PERSISTED windows carry `winId`, not `id` — `id` exists
  // only on in-memory window objects. Reading `w.id` made every shape
  // signature EMPTY, so NO rollback point would ever be written for a window
  // change: the feature would have been silently dead in production while its
  // tests passed on a fixture that used `id`. Same tolerant read the restore
  // path already uses (src/lib/layout.js:108, :229).
  const winKey = (w) => w?.winId || w?.id;
  function layoutShape(data) {
    if (!data) return '';
    const parts = [];
    for (const [dk, v] of Object.entries(data.desktops || {})) {
      const ids = ((v?.autoSave || {}).windows || []).map(winKey).filter(Boolean).sort();
      parts.push(dk + ':' + ids.join(','));
    }
    const top = ((data.autoSave || {}).windows || []).map(winKey).filter(Boolean).sort();
    if (top.length) parts.push('_top:' + top.join(','));
    return parts.sort().join('|');
  }
  function layoutSummary(data) {
    const perDesktop = {};
    for (const [dk, v] of Object.entries(data?.desktops || {})) {
      // Desktop names are NOT unique (both creation sites use `Desktop N` with
      // no uniqueness check after a delete, and rename accepts anything), so
      // keying by name alone dropped a whole desktop's row AND under-counted
      // totalWindows in the picker and in incident bundles.
      let key = (data.desktopMeta || []).find((m) => m.id === dk)?.name || dk;
      if (key in perDesktop) key += ` (${dk.slice(-4)})`;
      perDesktop[key] = ((v?.autoSave || {}).windows || []).length;
    }
    // Instances that never created a virtual desktop keep their windows in the
    // LEGACY top-level autoSave — summarizing only `desktops` reported "0
    // windows" for them, which makes every rollback point look worthless
    // exactly where the user has no desktops to reason about (caught live).
    const top = ((data?.autoSave || {}).windows || []).length;
    if (top) perDesktop[''] = top;
    return perDesktop;
  }
  let _lastShape = null;
  // WHAT THE RING SAW (lane layout-stale-record-sync — the owner's 2026-10-22 loss read «工作 5 → 0» with no writer and no
  // refusal on record): the ws layout-sync handler notes each write (`wrote` — the desktop, the writer's viewport, its
  // evidence by reason, its base) and each refusal (`refused` — stale / shrink-without-close / cross-layer) here through
  // writeLayouts.note; the next rollback point's meta carries the write that made it (`writer`) and the refusals since
  // the last point (`refused`, ≤ 20). A restore's point names the restore.
  const _ringNotes = { writer: null, refused: [] };
  function noteLayout(entry) {
    if (!entry || typeof entry !== 'object') return;
    const e = { ...entry, at: Date.now() };
    if (entry.refused) { _ringNotes.refused.push(e); if (_ringNotes.refused.length > 20) _ringNotes.refused.splice(0, _ringNotes.refused.length - 20); }
    else _ringNotes.writer = e;
  }
  let _histSeq = 0;
  // «BEFORE THIS RESTART» (B-b05e): the first point this process writes holds the layout as the restart found it (the first
  // write's previous state is what is ON DISK); its FILE NAME says so (`layout-<stamp>-<seq>.restart.json`, its meta too). The
  // newest RING_KEEP.boots such points are PINNED — read off the names the prune lists anyway (the cure of the batch-4 verdict: a
  // first prune that read every meta synchronously held the main loop where data/ is a network mount) — no burst pushes one out,
  // and a second restart after a bad one keeps the point before the first. The rollback dialog names exactly those.
  let _bootPending = true;
  // CRITICAL (adversarial review): readLayouts() hands out the LIVE cache
  // object and EVERY production caller mutates it in place before calling
  // writeLayouts (ws layout-sync, desktop create/delete/rename/reorder,
  // /api/layouts-autosave …). Snapshotting `_layoutsCache` therefore captured
  // the ALREADY-DAMAGED state — the feature would have stored exactly the
  // thing it exists to undo. Keep a DETACHED copy of the last written state
  // instead. (The first test passed only because it always handed writeLayouts
  // a fresh object — a shape production never uses; the test now mirrors the
  // real read-modify-write pattern.)
  let _lastGood = null;
  // `next` = the layout about to REPLACE prev (absent for the forced restore snapshot): the point also names what
  // changed after it — per desktop whose window set changed, [name, before, after] ("HR 3 → 1") — so a user looking
  // for the state before a loss finds the row the loss FOLLOWS (userW inc-mun7qjmw-iksh: every row read "44
  // windows — …", the damage was in none of them)
  function snapshotLayout(prev, nextShape, next = null, notes = null) {
    try {
      // No detached copy yet (first write after boot, or a restore issued
      // before anything read layouts): fall back to what is ON DISK — that IS
      // the previous state, and skipping here silently drops the very first
      // change after every restart, which is when a layout bug is most likely
      // to strike (a restart is the usual remedy someone tries first).
      if (!prev) {
        try { prev = JSON.parse(fs.readFileSync(LAYOUTS_FILE, 'utf-8')); } catch { return; }
        if (prev && typeof prev === 'object') delete prev[STAMP];   // B-225b's remainder: the stamp is no part of a layout (nor of a point)
      }
      const prevShape = layoutShape(prev);
      if (prevShape === nextShape) return;         // shape unchanged — nothing to preserve
      if (!prevShape) return;                      // nothing meaningful yet (boot)
      // Persist OFF the write path: writeLayouts runs per layout-sync message
      // per client — the 500ms debounce right above exists precisely because a
      // sync write there was a hot path. Only the shape compare (µs) stays
      // inline; mkdir/stringify/write/prune ride a setImmediate over a
      // DETACHED copy, so a later mutation of the caller's object cannot reach
      // the snapshot either.
      let change = null;
      try { change = next ? desktopChanges(prev, next) : null; } catch { change = null; } // computed NOW — the caller mutates `next` in place later
      const snap = detach(prev);
      if (!snap) return;
      const restart = _bootPending; _bootPending = false; // this process's first point (above)
      const seen = {}; // what the ring saw (above): the write that made this point and the refusals since the last one
      if (notes && notes.writer) seen.writer = notes.writer;
      if (notes && Array.isArray(notes.refused) && notes.refused.length) seen.refused = notes.refused.splice(0);
      wordlessTitles(snap); // a rollback point is a layout record too (the disk belt above may read what an older build wrote)
      // B-225b R10: OWED, in order — B-0248 (b): handed to THE STORE WRITER at the next turn, or by the layouts.json flush BEFORE it
      // hands its own write (whichever first); that write follows the point's LANDING (within one bound: handPoint). The job makes the
      // point's bytes (main thread, as the release's job did) and hands nothing itself: handPointsOwed does
      _pointsOwed.push(() => {
        const before = layoutSummary(snap);
        // UNIQUE filename: ISO stamps have millisecond resolution and a burst
        // of shape changes (what a mass-resume storm produces) lands inside
        // one millisecond — a bare timestamp silently OVERWROTE the older
        // entry, destroying the pre-damage state precisely in the incident
        // this feature exists for.
        const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + (_histSeq++).toString(36);
        const total = Object.values(before).reduce((a, b) => a + b, 0);
        const at = Date.now();
        const file = `layout-${stamp}${restart ? '.restart' : ''}.json`; // the restart's point is named so (the prune reads no meta)
        const head = { at, summary: before, totalWindows: total, change, ...seen };
        // whole bytes through the writer's pid temp + rename — a torn rollback point fails exactly when it is finally needed; the
        // tiny sidecar header (the panic-button path lists without parsing 40 whole layouts) lands AFTER its point
        const pointText = JSON.stringify({ ...head, layouts: snap }, null, 2);
        // + the point's own byte count in its header (B-225b's remainder P5: a point that does not read whole is never offered)
        return { pointFile: path.join(HISTORY_DIR, file), pointText, metaFile: path.join(HISTORY_DIR, file.replace(/\.json$/, '.meta.json')), metaText: JSON.stringify({ ...head, bytes: Buffer.byteLength(pointText) }, null, 2) };
      });
      setImmediate(handPointsOwed);   // (the round's small: the next turn's hand-off keeps no waiter of its own)
    } catch {}
  }
  /** the owed rollback points, handed in the order they were made (each its own try — one that fails never holds the next) */
  const _pointsOwed = [];
  /** B-0248 (b): every owed rollback point handed to the store writer — its file, then its header once the point LANDED — and
   *  `cb(allLanded)` once each landed or failed (a point that failed is said once, as the release said it, and the layouts.json write
   *  goes on: the release never held the desktops' write behind a failed point). Nothing owed ⇒ cb at once. The callbacks ride the
   *  writer's answer road (never a promise's .then: at the hub's stop they run inside its exit flush, its later rounds) */
  //  A FLUSH WAITS FOR THE POINTS HANDED UP TO ITS OWN CALL (a sequence mark — the fresh read's should): a point handed later is a later
  //  change's, its own flush waits for it; so shape changes in a row never starve the desktops' write
  //  WITHIN ONE BOUND (主开发 r1353, the one design): a point only LATE (past the writer's own «queued» bound) no longer holds the
  //  desktops — it stays handed and lands when it can, its header after it; the flushes that waited for it are handed now
  let _pointSeq = 0;
  const _pointsOutIds = new Set();
  const _pointsLate = new Set();   // handed, not landed, past the bound (or tried at the stop): they hold no flush
  const _pointsWaiters = [];   // { upTo, cb, ok }
  let _layoutsStopping = false;   // the hub's stop flush ran: a point's write tried in the exit's pass releases the desktops
  const pointsLeftUpTo = (upTo) => { for (const id of _pointsOutIds) if (id <= upTo && !_pointsLate.has(id)) return true; return false; };
  /** every rollback point owed, handed to the writer now (in order) → the sequence mark of the last one handed */
  function handPointsOwed() {
    for (const job of _pointsOwed.splice(0)) {
      let p = null;
      try { p = job(); } catch (e) { pointFailed(e, _pointSeq); }   // (no id of its own: every point handed from here on has a higher one)
      if (p) { const id = ++_pointSeq; _pointsOutIds.add(id); handPoint(p, (ok) => pointDone(id, ok), () => pointLate(id)); }
    }
    return _pointSeq;
  }
  /** the flushes whose points (up to their marks) are all landed, refused or late: handed now, in the order they waited */
  function pointsRelease(failedId = null) {
    const ready = [];
    for (let k = 0; k < _pointsWaiters.length; k++) {
      const w = _pointsWaiters[k];
      if (failedId != null && failedId <= w.upTo) w.ok = false;
      if (!pointsLeftUpTo(w.upTo)) { ready.push(w); _pointsWaiters.splice(k--, 1); }
    }
    for (const w of ready) { try { w.cb(w.ok); } catch (e) { console.warn('[layout-history] a wait for the points failed:', (e && e.message) || e); } }
  }
  function pointDone(id, ok) {
    _pointsOutIds.delete(id); _pointsLate.delete(id);
    if (!ok && _pointsEp) _pointsEp.lastRefused = Math.max(_pointsEp.lastRefused, id);   // r1387 (5): the REFUSED point's own id — a point handed after it clears the episode
    if (ok) pointLanded(id);   // B-225b's remainder: a landing with nothing refused (and nothing still late) since ends the points' episode
    if (!_pointsOutIds.size) pruneHistory().catch(() => {});
    pointsRelease(ok ? null : id);
  }
  /** a point that no longer holds the desktops: past the writer's bound (still handed: it lands when it can), or tried at the stop */
  function pointLate(id) {
    if (!_pointsOutIds.has(id) || _pointsLate.has(id)) return;
    _pointsLate.add(id);
    if (!_layoutsStopping) pointsLateSaid();   // B-225b's remainder (r1353 (2)): the points' episode SAID, in the «queued» words
    pointsRelease();
  }
  /** ONE rollback point to the store writer (its folder made by the writer when missing): the point's whole bytes, then — at its
   *  landing — its header; each act's bytes let go once on disk (the writer keeps its entry, never the layouts in it). A point the
   *  storage REFUSES is let go (the release dropped a failed point: its bytes are never kept for the process's life) and said once;
   *  one only still QUEUED past the writer's bound is LATE: `late()` hands the desktops that waited for it, and it is waited for
   *  again — it lands when it can, its header after it. Once the writer is exiting nothing is waited for again (its last pass is the
   *  last write: after it a durable answers at once) */
  function handPoint(p, done, late) {
    const w = storeW();
    let point = p.pointText, head = p.metaText;
    // ONE BOUND PER POINT (the cure's read, its should): the point AND its header, counted from the hand-off — the header never gets a
    // fresh bound of its own (two bounds would hold the desktops twice as long); past it the point is late
    const unbound = onBound(() => late(), 'point');
    const end = (ok) => { unbound(); done(ok); };
    const settle = (file, ok, then) => {
      if (_layoutsStopping) late();   // (5) AT A STOP: its write was tried in the exit's pass, landed or not — the desktops go in the round after it
      if (ok) { then(); return; }
      const why = w.whyNotDurable ? w.whyNotDurable(file) : null;
      // only QUEUED past the writer's bound: late, and waited for again — unless the writer answers «not on disk» AT ONCE (its exit's
      // last pass is over: nothing writes it any more). Only the hub's stop flush means exiting — the signal's note (exitStartedAt)
      // comes earlier, while the writer still writes (the cure's read, its should)
      if (why && why.why === 'queued' && !_layoutsStopping) {
        late();
        let inCall = true, overAtOnce = false;
        w.durable(file, { answer: (ok2) => { if (inCall && !ok2) { overAtOnce = true; return; } settle(file, ok2, then); } });
        inCall = false;
        if (!overAtOnce) return;
      }
      try { w.forget(file); } catch { /* the writer's */ }
      pointFailed(why); end(false);
    };
    w.dirty(p.pointFile, { name: 'layout-points.write', rank: 0, urgent: true, makeDir: true, produce: () => point, onWritten: (ok) => { if (ok) point = null; } });
    w.durable(p.pointFile, { answer: (ok) => settle(p.pointFile, ok, () => {
      w.dirty(p.metaFile, { name: 'layout-points.write', rank: 0, urgent: true, makeDir: true, produce: () => head, onWritten: (ok2) => { if (ok2) head = null; } });
      w.durable(p.metaFile, { answer: (ok2) => settle(p.metaFile, ok2, () => end(true)) });
    }) });
  }
  // B-225b's REMAINDER (login-request-card, 主开发 r1310 / r1353 (2)(3)) — THE ROLLBACK POINTS' EPISODE, SAID. The release (and B-0248's
  // first form) said a failed point ONCE PER PROCESS in the journal and no page knew the protection had stopped. A point the storage
  // REFUSES is let go (B-0248's way) and COUNTED (`lost`); a point only LATE past the writer's bound is not lost (the desktops go on
  // without waiting for it — B-0248's cure — and it lands when it can): either way the EPISODE is said ONCE to every page in the store
  // family's word (`store-unsaved` {file: 'layout-history', code ('queued' for a late one), lost}; GET /api/stores/held carries it for
  // a page that connects later), and cleared by `store-saved` when a point lands with nothing refused or late since.
  let _pointsEp = null;   // { code, since, lost, lastRefused }
  const pointsWord = () => (_pointsEp ? { file: 'layout-history', code: _pointsEp.code, since: _pointsEp.since, rung: 'said', lost: _pointsEp.lost } : null);
  // r1387 (2): once an episode means once a STATE — a change of its code (late → refused) or of its lost count is told when it changes,
  // coalesced to one word a turn (never a storm)
  let _pointsRetell = false;
  function retellPoints() {
    if (_pointsRetell) return;
    _pointsRetell = true;
    setImmediate(() => { _pointsRetell = false; if (_pointsEp) storeWord('store-unsaved', pointsWord()); });
  }
  function pointsEpisode(code, lost, refusedId = null) {
    const refused = code !== 'queued';
    // the journal: the release's own line at an episode's FIRST REFUSAL (once — a late point is not a failure), and a late start said as late
    if (refused && (!_pointsEp || _pointsEp.code === 'queued')) console.warn(`[layout-history] snapshot FAILED — rollback points are not being written: ${code} (every page is told)`);
    if (!_pointsEp) {
      _pointsEp = { code, since: Date.now(), lost, lastRefused: refusedId || 0 };
      if (!refused) console.warn('[layout-history] a rollback point was not taken by the storage in time — rollback points are not saved yet (every page is told)');
      storeWord('store-unsaved', pointsWord());
      return;
    }
    const was = `${_pointsEp.code}|${_pointsEp.lost}`;
    _pointsEp.lost += lost;
    if (refusedId) _pointsEp.lastRefused = Math.max(_pointsEp.lastRefused, refusedId);
    if (refused) _pointsEp.code = code;   // a refusal outranks lateness in the words
    if (`${_pointsEp.code}|${_pointsEp.lost}` !== was) retellPoints();
  }
  /** a point the storage REFUSED (or whose job threw): let go, counted, the episode said */
  function pointFailed(why, refusedId = null) { pointsEpisode((why && (why.code || (why.why !== 'queued' && why.why))) || 'write failed', 1, refusedId); }
  /** a point only LATE past the writer's bound (B-0248's cure: pointLate hands the desktops that waited for it): said, nothing lost */
  function pointsLateSaid() { pointsEpisode('queued', 0); }
  /** a point LANDED: the episode is over when nothing refused or late came after it */
  function pointLanded(id) {
    if (!_pointsEp || id <= _pointsEp.lastRefused || _pointsLate.size) return;   // nothing refused since, nothing still late
    const was = _pointsEp; _pointsEp = null;
    console.log(`[layout-history] rollback points are saved again (not since ${new Date(was.since).toISOString()}${was.lost ? `; ${was.lost} could not be saved and are lost` : ''})`);
    storeWord('store-saved', { file: 'layout-history' });
  }

  // TIERED retention (adversarial review): a flat newest-40 ring is exactly
  // wrong for this feature's motivating case — a mass-resume storm produces
  // dozens of shape changes in seconds and would evict every PRE-storm point,
  // i.e. the only ones worth having. The oldest-10 tier that followed kept the
  // FIRST points ever written and let a burst evict every day since (B-b05e):
  // the keep is spread over time now (ringKeep) + this boot's point pinned.
  // OFF THE LOOP (the cure of the batch-4 verdict: data/ is a network mount on the owner's hub, where a synchronous call holds the
  // main loop): the listing and the unlinks are fs.promises — the main loop waits on none of them; two prunes that overlap unlink
  // the same file once (the other's ENOENT is swallowed). The restarts' points are known by NAME — no meta is read here.
  async function pruneHistory() {
    let names;
    try { names = await fs.promises.readdir(HISTORY_DIR); } catch { return; }
    const files = names.filter((f) => /^layout-.*\.json$/.test(f) && !f.endsWith('.meta.json')).sort();
    const boots = ringSort(files.filter((f) => f.endsWith('.restart.json'))); // the restarts' points, by NAME — no meta read here
    const keep = ringKeep(files, { pinned: boots.slice(-RING_KEEP.boots) });
    for (const f of files) {
      if (keep.has(f)) continue;
      await fs.promises.unlink(path.join(HISTORY_DIR, f)).catch(() => {});
      await fs.promises.unlink(path.join(HISTORY_DIR, f.replace(/\.json$/, '.meta.json'))).catch(() => {});
      // B-0248 (b): the point's two files are gone by their owner's word — the store writer lets their entries go (never a wait)
      try { const w = storeW(); w.forget(path.join(HISTORY_DIR, f)); w.forget(path.join(HISTORY_DIR, f.replace(/\.json$/, '.meta.json'))); } catch { /* no writer here */ }
    }
  }
  const detach = (o) => { try { return structuredClone(o); } catch { try { return JSON.parse(JSON.stringify(o)); } catch { return null; } } };
  /** THE TRACE IS A FACT ABOUT THE RECORD (r4 K, inc-mw1ogdno-5jny — the r3 acceptance: the one-desktop restore spread the current
   *  `desktops[id]` and its dedup trace with it, so the restored record listed a copy the trace still named, and another page's
   *  keep undid a person's close of it): every road that writes layouts.json comes through here — the layout-sync write, the
   *  restore of one desktop or all, an import, a preset — and no desktop's `dupsLeft` leaves it naming a window that desktop's
   *  record lists (PURE noteDupsLeft's own rule: a listed id is forgotten); the first read of the file too (what an older build
   *  wrote). IN PLACE, like the titles above. → how many desktops' traces it changed. */
  function tracesTrue(data) {
    let n = 0;
    for (const v of Object.values((data && data.desktops) || {})) {
      if (!v || typeof v !== 'object' || v.dupsLeft === undefined) continue;
      const t = noteDupsLeft(v.dupsLeft, { listed: (v.autoSave && Array.isArray(v.autoSave.windows)) ? v.autoSave.windows : [] });
      if (JSON.stringify(t) !== JSON.stringify(v.dupsLeft)) n++;
      if (t.length) v.dupsLeft = t; else delete v.dupsLeft;
    }
    return n;
  }
  function writeLayouts(data) {
    if (!_layoutsRead) readLayouts();   // the start read first (a store never read is no store — MUST 1): held ⇒ refused by name
    layoutsHold.refuseIfHeld('this layout change');   // B-225b R1: the desktops HELD — nothing replaces them (a preset, a restore, an import)
    if (data && typeof data === 'object') delete data[STAMP];   // B-225b's remainder: a stamp is the hub's own, never a layout's (an import of a file that held one)
    // THE CHOKE POINT keeps no record's words in a window title (above) — IN PLACE: the ws layout-sync handler relays
    // the SAME window objects it hands here, so the frame other clients receive carries the generic title too
    tracesTrue(data);
    wordlessTitles(data);
    try {
      const nextShape = layoutShape(data);
      const writer = _ringNotes.writer; _ringNotes.writer = null; // this write's own note (a write with none — a preset, an import — names nobody)
      snapshotLayout(_lastGood, nextShape, data, { writer, refused: _ringNotes.refused });   // the DETACHED previous state, never the live cache (+ what replaces it, for the row's "what changed")
      _lastShape = nextShape;
      _lastGood = detach(data);
    } catch {}
    _layoutsCache = data;
    if (_layoutsSaveTimer) clearTimeout(_layoutsSaveTimer);
    _layoutsSaveTimer = setTimeout(flushLayouts, 500);
  }
  /** A rollback row's summary key (layoutSummary's: the desktop's name, `name (abcd)` for a repeated one) → the desktop id. */
  function desktopIdOfKey(data, key) {
    const seen = new Set();
    for (const [dk] of Object.entries(data?.desktops || {})) {
      let k = (data.desktopMeta || []).find((m) => m.id === dk)?.name || dk;
      if (seen.has(k)) k += ` (${dk.slice(-4)})`;
      seen.add(k);
      if (k === key) return dk;
    }
    return null;
  }
  /** one list row (the sidecar's facts, or the point's own when the sidecar is gone) — B-225b's remainder P5: `unread` (a code) when the
   *  point's own file does not read whole as far as its stat tells (pointUnread): listed, NEVER offered (no restore door on the page; the
   *  restore door refuses it by name) */
  const historyRowOf = (f, m, named, unread = null) => ({ id: f, at: m.at, summary: m.summary, totalWindows: m.totalWindows, change: m.change || null, ...(m.writer ? { writer: m.writer } : {}), ...(m.refused ? { refused: m.refused } : {}), ...(named.has(f) ? { restart: true } : {}), ...(unread ? { unread } : {}) });
  const historyFilesOf = (names) => names.filter((f) => /^layout-.*\.json$/.test(f) && !f.endsWith('.meta.json'));
  // the dialog says «before a restart» by the PIN's own rule (B-b05e cure 3): the newest RING_KEEP.boots `.restart.json`
  // NAMES in ring order (stamp, then sequence) — the very points pruneHistory keeps; no meta speaks for it
  const bootsNamed = (files) => new Set(ringSort(files.filter((f) => f.endsWith('.restart.json'))).slice(-RING_KEEP.boots));
  /** the list, SYNC — for the hub's own readers (the incident bundle, the suites): the sidecars only (no stat — nothing sync is added to
   *  the loop; the PAGE's list below reads OFF the loop and checks each point, and the restore door refuses an unread point by name) */
  function listLayoutHistory() {
    try {
      const files = historyFilesOf(fs.readdirSync(HISTORY_DIR));
      const named = bootsNamed(files);
      return files.sort().reverse()
        .map((f) => {
          // header from the tiny sidecar; the full snapshot (a whole
          // layouts.json each) is read only when actually restoring
          try {
            const m = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f.replace(/\.json$/, '.meta.json')), 'utf-8'));
            return historyRowOf(f, m, named);
          } catch {}
          try {
            const j = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf-8'));
            return historyRowOf(f, j, named);
          } catch { return null; } // unparseable → omit, never a 1970/0-window row
        }).filter(Boolean);
    } catch { return []; }
  }
  /** THE PAGE'S LIST, OFF THE LOOP (B-225b's remainder — ALSO CURED: the release read the folder and every sidecar synchronously on the
   *  hub's loop at each open of the dialog): the same rows as listLayoutHistory */
  async function listLayoutHistoryAsync() {
    let names;
    try { names = await fs.promises.readdir(HISTORY_DIR); } catch { return []; }
    const files = historyFilesOf(names).sort().reverse();
    const named = bootsNamed(files);
    const rows = await Promise.all(files.map(async (f) => {
      try {
        const m = JSON.parse(await fs.promises.readFile(path.join(HISTORY_DIR, f.replace(/\.json$/, '.meta.json')), 'utf-8'));
        let size = null, statCode = null;
        try { size = (await fs.promises.stat(path.join(HISTORY_DIR, f))).size; } catch (e) { statCode = (e && e.code) || 'unreadable'; }
        return historyRowOf(f, m, named, pointUnread(m, { size, statCode }));
      } catch {}
      try { return historyRowOf(f, JSON.parse(await fs.promises.readFile(path.join(HISTORY_DIR, f), 'utf-8')), named); }
      catch { return null; } // unparseable → omit, never a 1970/0-window row
    }));
    return rows.filter(Boolean);
  }

  router.get('/api/layouts', (req, res) => res.json(readLayouts()));

  router.post('/api/layouts/:name', (req, res) => {
    const data = readLayouts();
    data.saved[req.params.name] = { ...req.body, updatedAt: Date.now() };
    writeLayouts(data);
    res.json({ success: true });
  });

  router.delete('/api/layouts/:name', (req, res) => {
    const data = readLayouts();
    delete data.saved[req.params.name];
    if (data.current === req.params.name) data.current = null;
    writeLayouts(data);
    res.json({ success: true });
  });

  router.post('/api/layouts-active', (req, res) => {
    const data = readLayouts();
    data.current = req.body.name || null;
    writeLayouts(data);
    res.json({ success: true });
  });

  router.post('/api/custom-grids', (req, res) => {
    const { rows, cols } = req.body;
    if (!rows || !cols) return res.status(400).json({ error: 'rows and cols required' });
    const data = readLayouts();
    if (!data.customGrids) data.customGrids = [];
    if (!data.customGrids.some(g => g.rows === rows && g.cols === cols)) {
      data.customGrids.push({ rows, cols });
      writeLayouts(data);
    }
    res.json({ success: true, customGrids: data.customGrids });
  });

  router.delete('/api/custom-grids', (req, res) => {
    const { rows, cols } = req.body;
    const data = readLayouts();
    if (!data.customGrids) data.customGrids = [];
    data.customGrids = data.customGrids.filter(g => !(g.rows === rows && g.cols === cols));
    writeLayouts(data);
    res.json({ success: true, customGrids: data.customGrids });
  });

  // (the phone's own `autoSaveMobile` slot is gone — lane phone-arrangement-local, §6b guard 10: nobody posted it, a phone
  // writes membership into the desktop's record over layout-sync and keeps its window on show locally; a stored slot is
  // simply never read, and the next write of layouts.json drops it below)
  // B-46fc part 2: A PAGE THAT LEAVES WITH ITS SOCKET NOT OPEN hands its queued layout save here (fetch keepalive at pagehide / hidden) —
  // the frame the socket would have carried, through the ONE «apply a layout save» (src/server/layout-sync-door.js → ws-handler's
  // applyLayoutSync: every guard the socket's save meets). Bounded (256 KB, refused by name); the answer = what the socket would have heard.
  // its round (wgk4tnn0w): the 256 KB bound holds BEFORE the body is parsed — the route reads its own body (server.js skips its 50 MB
  // parser for the paths `ownsBody` names, below), refused past it by name
  const layoutSyncBody = (() => { const parse = express.json({ limit: require('../server/layout-sync-door.js').MAX_BYTES }); return (req, res, next) => parse(req, res, (err) => {
    if (!err) return next();
    if (err.type === 'entity.too.large' || err.status === 413) return res.status(413).json({ error: require('../server/layout-sync-door.js').sizeVerdict(Number(req.headers['content-length']) || Infinity), code: 'too-large' });
    return res.status(err.status && err.status < 500 ? err.status : 400).json({ error: `the body could not be read (${err.type || err.message})`, code: 'malformed' });
  }); })();
  router.use('/api/layout-sync', layoutSyncBody);
  const layoutSyncLayer = router.stack[router.stack.length - 1];
  router.post('/api/layout-sync', (req, res) => {
    const door = require('../server/layout-sync-door.js');
    const r = door.apply(req.body);
    if (r.status !== 200) return res.status(r.status).json({ error: r.error });
    res.json({ ok: true, answers: r.answers });
  });
  router.post('/api/layouts-autosave', (req, res) => {
    const data = readLayouts();
    if (req.body?.deviceType === 'mobile') return res.status(410).json({ error: 'no mobile slot: a phone saves over layout-sync' });
    data.autoSave = { ...req.body, updatedAt: Date.now() };
    delete data.autoSaveMobile;
    writeLayouts(data);
    res.json({ success: true });
  });

  // Layout rollback points. A layout-destroying bug is otherwise
  // unrecoverable (see LAYOUT HISTORY above) — this is what turns a support
  // incident into one click.
  /** A desktop id → its rollback row's summary key in `data` (desktopIdOfKey's inverse: the name, `name (abcd)` repeated). */
  function keyOfDesktopId(data, desktopId) {
    const seen = new Set();
    for (const [dk] of Object.entries(data?.desktops || {})) {
      let k = (data.desktopMeta || []).find((m) => m.id === dk)?.name || dk;
      if (seen.has(k)) k += ` (${dk.slice(-4)})`;
      seen.add(k);
      if (dk === desktopId) return k;
    }
    return null;
  }
  /** THE WAY BACK for a window that names no conversation (lane layout-stopped-window r3 — the «Session unavailable» tile's
   *  «Restore a previous layout…»): the NEWEST point whose record of that desktop holds a named entry for the window's slot
   *  (PURE namedTwinIn), read newest first OFF the loop (a point is a whole layouts.json); {id, desk: the row's key, at} or null. */
  async function namedPointFor(entries, desktopId, entry) {
    for (const e of entries) {
      let saved = null;
      try { saved = JSON.parse(await fs.promises.readFile(path.join(HISTORY_DIR, e.id), 'utf-8')); } catch { continue; }
      const list = saved?.layouts?.desktops?.[desktopId]?.autoSave?.windows;
      if (!Array.isArray(list) || !namedTwinIn(list, entry)) continue;
      const desk = keyOfDesktopId(saved.layouts, desktopId);
      if (desk != null && e.summary && Object.prototype.hasOwnProperty.call(e.summary, desk)) return { id: e.id, desk, at: e.at };
    }
    return null;
  }
  // `?desktop=<id>&win=&type=&title=&cwd=&name=` (a tile's slot) adds `pick` — the point to select (r3); bare = the list as before
  router.get('/api/layout-history', async (req, res) => {
    const entries = await listLayoutHistoryAsync();   // B-225b's remainder: off the loop
    const q = req.query || {};
    if (typeof q.desktop !== 'string' || !q.desktop) return res.json({ entries });
    const entry = { type: q.type === 'terminal' ? 'terminal' : 'chat', winId: String(q.win || ''), title: String(q.title || ''), cwd: String(q.cwd || ''), ...(q.name ? { openSpec: { name: String(q.name) } } : {}) };
    let pick = null;
    try { pick = await namedPointFor(entries.filter((e) => !e.unread), q.desktop, entry); } catch { pick = null; }   // an unread point is never picked
    res.json({ entries, pick });
  });
  router.post('/api/layout-history/:id/restore', (req, res) => {
    const id = String(req.params.id || '');
    if (!/^layout-[\w.-]+\.json$/.test(id)) return res.status(400).json({ error: 'bad id' });
    let saved;
    // B-225b's remainder P5: a point that cannot be read is refused BY NAME (`point_unread`, with why) — never «not found» for a point
    // the list showed; its bytes are left as they are
    let text;
    try { text = fs.readFileSync(path.join(HISTORY_DIR, id), 'utf-8'); }
    catch (e) { const why = (e && e.code) || 'unreadable'; return res.status(why === 'ENOENT' ? 404 : 503).json({ error: `this rollback point could not be read (${why}) — nothing was restored; pick another`, code: 'point_unread', why }); }
    try { saved = JSON.parse(text); }
    catch { return res.status(409).json({ error: 'this rollback point is damaged (it does not read whole) — nothing was restored; pick another', code: 'point_unread', why: 'damaged' }); }
    if (!saved?.layouts) return res.status(400).json({ error: 'entry has no layout' });
    // ONE DESKTOP (lane layout-stopped-window — the owner's 个人 lost seven windows while 工作 and 研究 had moved on): the body's
    // `desktop` (a row's summary key — the desktop's name, `name (abcd)` for a repeated one) or `desktopId` restores that
    // desktop's record ALONE — the point's windows there, stamped now; every other desktop stays as it is NOW, minus a window
    // the point holds on this one (it moves back); a desktop deleted since comes back under its name. Undoable like the rest.
    const want = req.body && typeof req.body === 'object' ? req.body : {};
    // lane phone-dock-restore r2: the asker's id for this restore, echoed in the broadcast — that page says its own restore once
    const told = JSON.stringify({ type: 'layout-restored', ...(typeof want.rid === 'string' && /^[\w-]{1,64}$/.test(want.rid) ? { rid: want.rid } : {}) });
    if (want.desktop != null || want.desktopId != null) {
      const only = typeof want.desktopId === 'string' && want.desktopId ? want.desktopId : desktopIdOfKey(saved.layouts, String(want.desktop));
      const rec = only ? saved.layouts.desktops?.[only]?.autoSave : null;
      if (!rec || typeof rec !== 'object') return res.status(404).json({ error: 'that desktop is not in this rollback point' });
      readLayouts();
      if (!_lastGood) _lastGood = detach(_layoutsCache);
      snapshotLayout(_lastGood, '\u0000force-' + Date.now(), null, { writer: { via: 'restore', from: id, desktop: only, at: Date.now() }, refused: _ringNotes.refused });
      const doc = readLayouts();
      const now = Date.now();
      const back = new Set(windowIds(rec));
      for (const [dk, v] of Object.entries(doc.desktops || {})) {
        if (dk === only || !v || !v.autoSave || !Array.isArray(v.autoSave.windows)) continue;
        if (!v.autoSave.windows.some((w) => back.has(String(w && (w.winId || w.id))))) continue;
        v.autoSave = { ...v.autoSave, windows: v.autoSave.windows.filter((w) => !back.has(String(w && (w.winId || w.id)))), updatedAt: Math.max(now, (Number(v.autoSave.updatedAt) || 0) + 1) };
      }
      if (!doc.desktops) doc.desktops = {};
      doc.desktops[only] = { ...(doc.desktops[only] || {}), autoSave: { ...detach(rec), updatedAt: Math.max(now, (Number(doc.desktops[only]?.autoSave?.updatedAt) || 0) + 1) } };
      if (Array.isArray(doc.desktopMeta) && !doc.desktopMeta.some((d) => d && d.id === only)) {
        const m = (saved.layouts.desktopMeta || []).find((d) => d && d.id === only);
        doc.desktopMeta.push(m ? { ...m } : { id: only, name: only });
      }
      noteLayout({ via: 'restore', from: id, desktop: only });
      writeLayouts(doc);
      // B-225b's second half: a restore that did not land never looks landed — B-0248 (a): its answer and its word wait for the landing
      flushLayouts({ press: true }, (landed) => {
        exitSafe(res);
        if (!landed && !layoutsHold.owed()) return res.status(409).json(restoreDropped());   // (round wg2vawd0o) ended by name: nothing kept
        try {
          const word = landed ? told : toldUnsaved(told);
          wss?.clients?.forEach((c) => { if (c.readyState === WS_OPEN) { try { c.send(word); } catch {} } });
        } catch {}
        if (!landed) return res.status(503).json(restoreUnsaved());
        return res.json({ success: true, desktopId: only, windows: back.size, restoredFrom: saved.at });
      });
      return;
    }
    // B-225b R5: the desktops DAMAGED (bytes that are not a layout) — the WHOLE restore is the person's whole replace: the damaged
    // bytes set aside under a dated name first, then the point lands as the store's first write (a one-desktop restore stays refused)
    if (!damagedReplace(req, res, 'layouts')) return;
    // Warm the cache first: a restore issued before anything else read layouts
    // (server restarted while the tab stayed open — the usual sequence right
    // after a layout bug) left _lastGood null, so no rollback point was
    // written and the pre-restore layout was destroyed. The dialog PROMISES
    // this is undoable; make that true. (snapshotLayout also reads from disk
    // as a belt, so both halves are covered.)
    readLayouts();
    if (!_lastGood) _lastGood = detach(_layoutsCache);
    // FORCE a rollback point: a restore whose window SHAPE happens to match the
    // current one (reachable via a move-and-move-back round trip) would skip
    // the shape gate while still overwriting `saved` presets, customGrids and
    // all geometry — silently, on an action whose dialog promises it is
    // undoable. The restore is the one write that must never be gated.
    snapshotLayout(_lastGood, '\u0000force-' + Date.now(), null, { writer: { via: 'restore', from: id, at: Date.now() }, refused: _ringNotes.refused });
    // A RESTORE OUTRANKS EVERY LIVE CLIENT (lane layout-stale-record-sync, the owner's «我刚才点了恢复布局也没正确恢复»): the
    // point's records carry the stamps of THEIR time — older than every record a page has seen since — so each record is
    // stamped NOW (above the one it replaces): a page that missed the restore (asleep, its socket down) writes from an
    // older base and the staleness gate (ws-handler) refuses it — it adopts the restored record instead of writing over it
    const restoredAt = Date.now();
    const cur = _layoutsCache || {};
    for (const [dk, v] of Object.entries(saved.layouts.desktops || {})) {
      if (v && v.autoSave && typeof v.autoSave === 'object') v.autoSave.updatedAt = Math.max(restoredAt, (Number(cur.desktops?.[dk]?.autoSave?.updatedAt) || 0) + 1);
    }
    if (saved.layouts.autoSave && typeof saved.layouts.autoSave === 'object') saved.layouts.autoSave.updatedAt = Math.max(restoredAt, (Number(cur.autoSave?.updatedAt) || 0) + 1);
    // the CURRENT state becomes a rollback point too — restoring is itself
    // undoable, so a mis-click can never be the end of the story
    noteLayout({ via: 'restore', from: id }); // the restore's own write names it (its point's `writer`)
    writeLayouts(saved.layouts);
    // B-225b's second half: a restore that did not land never looks landed — B-0248 (a): its answer and its word wait for the landing
    flushLayouts({ press: true }, (landed) => {
      exitSafe(res);
      if (!landed && !layoutsHold.owed()) return res.status(409).json(restoreDropped());   // (round wg2vawd0o) ended by name: nothing kept
      // BROADCAST (adversarial review): every other layout mutation broadcasts;
      // this one did not. Another open tab keeps its pre-restore state and the
      // next window change there writes that desktop's OLD window set straight
      // back — the user watches the restore succeed and the layout re-flatten
      // seconds later, with nothing in any log. Tell every client to reload,
      // exactly what the restoring client does.
      try {
        const word = landed ? told : toldUnsaved(told);
        wss?.clients?.forEach((c) => { if (c.readyState === WS_OPEN) { try { c.send(word); } catch {} } });
      } catch {}
      if (!landed) return res.status(503).json(restoreUnsaved());
      res.json({ success: true, summary: saved.summary, restoredFrom: saved.at });
    });
  });

  // Expose for server.js to use directly
  router.listLayoutHistory = listLayoutHistory;
  router.listLayoutHistoryAsync = listLayoutHistoryAsync;
  router.layoutsMarkSettled = () => _markChain;
  router.layoutsStopJudged = () => _stopJudgedP;   // the start's verdict, once the last run's mark is read and weighed (a suite waits on the EFFECT)   // B-225b's remainder: the owed mark's writes and removals, in order (a suite waits on what happened)
  router.readLayouts = readLayouts;
  router.layoutsCached = () => _layoutsCache; // lane conversation-facts: the in-memory copy only (null before the first read) — the list never reads the file
  // lane conversation-facts (主开发 2026-11-17): before any page has opened since the boot (the fleet's normal case) the list reads
  // the layout ONCE, asynchronously, off the loop; readLayouts fills its own cache from that text, so no later read is sync
  let _layoutsLoading = null, _layoutsErr = null;
  router.layoutsError = () => (_layoutsCache ? null : _layoutsErr); // the last failed read's error code (cleared by a read that lands)
  router.layoutsAsync = () => {
    if (_layoutsCache) return Promise.resolve(_layoutsCache);
    if (!_layoutsLoading) {
      // ONLY «no such file» is the empty layout; any other error leaves the cache UNTOUCHED (a page opened later must never receive
      // an empty layout its autosave would write over the person's desktops) and rejects — the list says it could not be read, with the code
      // B-225b: the read off the loop is the hold's START read (its three answers) — held ⇒ rejected by name, the cache untouched.
      // While HELD, an ask reads again NOW (the hold's one read off the loop): a read that lands lifts it and the cache is the file's
      const read = _layoutsRead && layoutsHold.held() ? layoutsHold.readAgain().then(() => undefined)
        : fs.promises.readFile(LAYOUTS_FILE, 'utf-8').then((text) => ({ text }), (error) => ({ error }));
      _layoutsLoading = read
        .then((r) => { const v = readLayouts(r); _layoutsErr = null; return v; })
        .catch((e) => { _layoutsErr = (e && e.held && (e.held.code || e.held.kind)) || (e && e.code) || 'unreadable'; throw e; })
        .finally(() => { _layoutsLoading = null; });
    }
    return _layoutsLoading;
  };
  router.writeLayouts = writeLayouts;
  writeLayouts.note = noteLayout; // the ws handler's notes for the ring (a property: the ws ctx contract hands writeLayouts alone)
  router.flushLayouts = flushLayouts;
  router.readUserState = () => userStateOut(); // TaskGroupManager one-time Groups migration; every reader outside the store (B-0248 (c): what LANDED)
  router.readLayouts = () => readLayouts(); // the manager design's piece 4: the resume verb names the desktop of a conversation's row — READ ONLY (the live cache)
  // lane peer-card-sender (③): ONE custom name set from the server (ws rename-session — an agent or a script renaming a
  // session) through the same store + broadcast the sidebar's own rename PATCHes; an unchanged name writes nothing
  router.setCustomName = (key, name) => {
    const k = String(key || ''), v = String(name == null ? '' : name).trim();
    if (!k || !k.includes(':')) return false;
    const cur = readUserState();
    const names = { ...(cur.customNames || {}) };
    if ((names[k] || '') === v) return false;
    if (v) names[k] = v; else delete names[k];
    writeUserState({ ...cur, customNames: names });
    return true;
  };
  /** r1054 (7): THE NAME'S LANDING, for the rename verb — a promise: true once the list ON DISK holds `name` for `key` (at once when
   *  it already does), false when the write that carries it failed or passed the writer's bound (kept, written again) */
  //   (r1092's law: at once only when the landed list, the write in flight and the pending list all hold that name — a rename BACK to
  //   the landed name while another name is owed waits for its own write's landing)
  router.nameLanded = (key, name) => {
    const k = String(key || ''), v = String(name == null ? '' : name).trim();
    const nameIn = (st) => ((st && st.customNames) || {})[k] || '';
    let agree = false;
    try { const inFlight = userStateHold.inFlight(); agree = nameIn(userStateOut()) === v && nameIn(readUserState()) === v && (inFlight === undefined || nameIn(inFlight) === v); } catch { agree = false; }
    return agree ? Promise.resolve(true) : landedOf(userStateHold);
  };
  /** r1092: an UN-ARCHIVE OWED — the landed list holds the conversation, the pending one does not (the person's un-archive is not saved
   *  yet): the wake's refusal says so, so that a person whose page shows it un-archived learns why a result waits */
  router.unarchiveOwed = (key) => {
    const k = String(key || ''); if (!k) return false;
    const bare = k.includes(':') ? k.slice(k.indexOf(':') + 1) : k;
    const holds = (st) => Array.isArray(st && st.archivedSessions) && st.archivedSessions.some((x) => String(x) === k || String(x) === bare);
    try { return holds(userStateOut()) && !holds(readUserState()); } catch { return false; }
  };

  // lane conversations-archive-verb: ONE archive from the server (the automation verb conversations.archive) through the same
  // store + broadcast the sidebar's own 归档 PATCHes — `archivedSessions` holds `<backend>:<conversation id>` keys (older
  // entries a bare id); a key already there writes nothing and says so
  router.archiveSession = (key) => {
    const k = String(key || '');
    if (!k || !k.includes(':')) return { ok: false, code: 'bad_args', why: 'an archive key is <backend>:<conversation id>' };
    try {
      const cur = readUserState();   // (the PENDING list: the change is built on it)
      const list = Array.isArray(cur.archivedSessions) ? cur.archivedSessions : [];
      const bare = k.slice(k.indexOf(':') + 1);
      const holds = (l) => Array.isArray(l) && l.some((x) => String(x) === k || String(x) === bare);
      // r1092, THE LAW WHOLE: A DOOR THAT TELLS ANYONE «DONE» ANSWERS AT ONCE ONLY WHEN WHAT IS ON DISK AND WHAT IS OWED AGREE THAT IT IS
      // DONE — the landed list, the write in flight (or failed and owed) and the pending list all hold it ⇒ already, at once (an
      // unrelated write failing changes none of the three: still at once); the pending list holds it and another does not ⇒ its own
      // archive is owed: told at that landing; the pending list does NOT hold it (an un-archive owed, or never archived) ⇒ WRITTEN
      if (holds(list)) {
        const inFlight = userStateHold.inFlight();
        if (holds(userStateOut().archivedSessions) && (inFlight === undefined || holds(inFlight && inFlight.archivedSessions))) return { ok: true, already: true, landed: Promise.resolve(true) };
        return { ok: true, already: false, landed: landedOf(userStateHold) };
      }
      writeUserState({ ...cur, archivedSessions: [...list, k] });
    } catch (e) { if (e && (e.code === 'store_unread' || e.code === 'store_appeared')) return { ok: false, code: e.code, why: e.message }; throw e; }   // B-225b: by name
    // B-0248 (c): `landed` — a promise of the LANDING (true on disk; false: not yet, kept and written again) — the archive verb tells
    // its caller «archived» only after it (an agent told so never asks again)
    return { ok: true, already: false, landed: landedOf(userStateHold) };
  };
  /** a hold's landing as a promise (true: what it owes now is on disk) — for a caller that is not a door */
  function landedOf(hold) { return new Promise((resolve) => hold.after(resolve)); }

  // the manager design (piece 4's verbs, piece 7's deliveries): ONE read of the archived list — the state in memory (the
  // cache archiveSession writes through), never a file read per ask; an older entry is a bare id, so either form answers.
  // B-0248 (c), r1053's MUST — A READER THAT ACTS FOR NOBODY FAILS CLOSED IN BOTH DIRECTIONS: «archived» when EITHER the pending list
  // or the landed list holds the conversation (a pending archive stops the wake of a job's result at once; a pending un-archive
  // still refuses until it lands); held ⇒ UNKNOWN. The wake of an ended conversation and the resume verb ask it
  router.isArchived = (key) => {
    const k = String(key || '');
    if (!k) return false;
    let pending, landed;
    try { pending = readUserState(); landed = userStateOut(); }
    catch (e) { if (e && e.code === 'store_unread') return null; throw e; }   // B-225b R3: UNKNOWN while the list is held — a door that acts for nobody refuses on it by name
    const bare = k.includes(':') ? k.slice(k.indexOf(':') + 1) : k;
    const holds = (st) => Array.isArray(st && st.archivedSessions) && st.archivedSessions.some((x) => String(x) === k || String(x) === bare);
    return holds(pending) || holds(landed);
  };
  // r1053 (1): THE READERS THAT CHOOSE WHAT A TURN IS BILLED TO OR RUNS ON read the PENDING list — a conversation's account, its
  // config, its backend, the moment a person changed them (the wake's configAccountOf and endedKeyOf, the inbox's reopen); a power
  // gate asks both lists (src/agent-routes.js isManagerSession: a manager only while BOTH say so)
  router.readUserStatePending = () => readUserState();

  // ── Bookmarks ──
  const BOOKMARKS_FILE = path.join(dataDir, 'bookmarks.json');
  // B-225b (cut 3 — R1, R2, R6, R12): the bookmarks are READ ONCE at the start, through the hold, and kept (the release read the file
  // at every GET — a read that failed mid-run served the four defaults, and the next save wrote them over the person's list); HELD ⇒
  // no value: the GET and the save answer 503 store_unread by name. NOT THERE ⇒ the four defaults in memory, nothing written
  let _bookmarksCache = null, _bookmarksRead = false;
  let _bookmarksLanded = null;   // B-0248 (c): what LANDED — the list any reader outside the store is handed (the cache is the pending one)
  const bookmarksHold = SH.create({
    file: BOOKMARKS_FILE,
    valid: (v) => Array.isArray(v),
    writer: storeW,   // B-0248 (c): off the loop (writeBookmarks' owe); every page told at the landing
    onLanded: (v) => { _bookmarksLanded = v; broadcast({ type: 'bookmarks-updated', bookmarks: v }); },
    onLift: (v) => { _bookmarksCache = v; console.log('[bookmarks] the bookmarks are read again (its hold lifted)'); storeWord('store-lifted', { file: 'bookmarks.json', why: 'its hold lifted' }); broadcast({ type: 'bookmarks-updated', bookmarks: v }); },
    onSaid: (h) => { console.warn(`[bookmarks] ${h.file} still cannot be read (${h.kind}${h.code ? `, ${h.code}` : ''}) — the bookmarks are HELD: nothing is written over them`); storeWord('store-held', h); },
  });
  const BOOKMARKS_DEFAULT = () => {
    const home = os.homedir();
    return [
      { label: 'Home', path: home },
      { label: 'Desktop', path: path.join(home, 'Desktop') },
      { label: 'Downloads', path: path.join(home, 'Downloads') },
      { label: 'Documents', path: path.join(home, 'Documents') },
    ];
  };
  function readBookmarks() {
    if (_bookmarksCache) return _bookmarksCache;
    if (!_bookmarksRead) { let pre; try { ensureDir(dataDir); } catch (e) { pre = { error: e }; } bookmarksHold.readAtStart(pre); _bookmarksRead = true; }   // (the flag after the start read: MUST 1)
    const v = bookmarksHold.answer();   // R2: HELD ⇒ store_unread by name
    bookmarksHold.takeText();
    _bookmarksCache = v === undefined ? BOOKMARKS_DEFAULT() : v;
    _bookmarksLanded = _bookmarksCache;
    return _bookmarksCache;
  }
  /** B-0248 (c): WHAT LEAVES THE STORE IS WHAT LANDED — the GET, the export (the doors build on the pending list) */
  const bookmarksOut = () => { const v = readBookmarks(); return _bookmarksLanded || v; };
  function writeBookmarks(data) {
    if (!_bookmarksRead) readBookmarks();   // the start read first (MUST 1): held ⇒ refused by name
    // R1: refuses a held list by name; NOT THERE ⇒ created exclusively (at the call); else the STORE WRITER's (B-0248 (c)), told at its landing
    try { bookmarksHold.owe(data, { name: 'bookmarks.write', bytes: (v) => JSON.stringify(v, null, 2) }); }
    catch (e) { if (e && e.code === 'store_appeared') { _bookmarksCache = null; try { broadcast({ type: 'bookmarks-updated', bookmarks: readBookmarks() }); } catch { /* said by the read */ } } throw e; }
    _bookmarksCache = data;
  }

  router.get('/api/bookmarks', guarded((req, res) => res.json(bookmarksOut())));

  router.post('/api/bookmarks', guarded((req, res) => {
    const bookmarks = req.body;
    if (!Array.isArray(bookmarks)) return res.status(400).json({ error: 'Expected array' });
    writeBookmarks(bookmarks);   // (every page is told at the landing — the hold's onLanded — before this answer)
    answerAfter(bookmarksHold, res, () => res.json({ success: true }));
  }));

  // ── Custom Themes ──
  const CUSTOM_THEMES_FILE = path.join(dataDir, 'custom-themes.json');
  let _customThemesCache = null, _customThemesRead = false;
  let _customThemesLanded = null;   // B-0248 (c): what LANDED — the set any reader outside the store is handed
  // B-225b (cut 3 — R1, R2, R6): a custom-themes.json the START could not read is HELD — no value: the GET and every save answer 503
  // store_unread by name, nothing is written over it (the release served «no themes», and the next save wrote the one theme over the
  // person's set). NOT THERE ⇒ no themes in memory, nothing written
  const themesHold = SH.create({
    file: CUSTOM_THEMES_FILE,
    valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
    writer: storeW,   // B-0248 (c): off the loop (writeCustomThemes' owe); every page told at the landing
    onLanded: (v) => { _customThemesLanded = v; broadcast({ type: 'custom-themes-updated', themes: v }); },
    onLift: (v) => { _customThemesCache = v; console.log('[themes] the custom themes are read again (its hold lifted)'); storeWord('store-lifted', { file: 'custom-themes.json', why: 'its hold lifted' }); broadcast({ type: 'custom-themes-updated', themes: v }); },
    onSaid: (h) => { console.warn(`[themes] ${h.file} still cannot be read (${h.kind}${h.code ? `, ${h.code}` : ''}) — the custom themes are HELD: nothing is written over them`); storeWord('store-held', h); },
  });

  function readCustomThemes() {
    if (_customThemesCache) return _customThemesCache;
    if (!_customThemesRead) { themesHold.readAtStart(); _customThemesRead = true; }
    const v = themesHold.answer();   // R2: HELD ⇒ store_unread by name
    themesHold.takeText();
    _customThemesCache = v === undefined ? {} : v;
    _customThemesLanded = _customThemesCache;
    return _customThemesCache;
  }
  /** B-0248 (c): WHAT LEAVES THE STORE IS WHAT LANDED — the GET, the export */
  const themesOut = () => { const v = readCustomThemes(); return _customThemesLanded || v; };

  function writeCustomThemes(data) {
    if (!_customThemesRead) readCustomThemes();   // the start read first (MUST 1): held ⇒ refused by name
    // q-059 r5 (lane cache-warmth-ramp r3): the ONE writer of the store — the POST save, the delete, the config import — drops a
    // value the warmth derivation SUPERSEDED (a bundle exported on .374, an old tab's save) with the same PURE rule the one-shot
    // boot migration ran over what was already on disk
    data = normalizeCustomThemes(data).doc;
    // R1: refuses a held set by name; NOT THERE ⇒ created exclusively at the call (a file that appeared: adopted); else the STORE
    // WRITER's (B-0248 (c)) — every page told at its landing (the hold's onLanded), never ahead of the disk
    try { themesHold.owe(data, { name: 'custom-themes.write', bytes: (v) => JSON.stringify(v, null, 2) }); }
    catch (e) { if (e && e.code === 'store_appeared') { _customThemesCache = null; try { broadcast({ type: 'custom-themes-updated', themes: readCustomThemes() }); } catch { /* said by the read */ } } throw e; }
    _customThemesCache = data;
  }

  router.get('/api/custom-themes', (req, res) => res.json(themesOut()));

  router.post('/api/custom-themes', (req, res) => {
    const { name, css, terminal } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
    if (!css || typeof css !== 'object') return res.status(400).json({ error: 'css object required' });
    if (name.length > 50) return res.status(400).json({ error: 'Name too long (max 50)' });
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) return res.status(400).json({ error: 'Name must be alphanumeric' });
    const builtIn = ['dark', 'light', 'dracula', 'nord', 'solarized', 'monokai'];
    if (builtIn.includes(name.toLowerCase())) return res.status(400).json({ error: 'Cannot overwrite built-in theme' });
    if (JSON.stringify(req.body).length > 100000) return res.status(413).json({ error: 'Theme data too large' });
    // Reject non-custom-property keys and values with CSS-breaking chars — a
    // malicious key/value would inject CSS onto every client at load (themes are
    // broadcast). Defense in depth with the client-side sanitizer in themes.js.
    for (const [k, v] of Object.entries(css)) {
      if (!/^--[\w-]+$/.test(k)) return res.status(400).json({ error: `Invalid CSS variable name: ${k}` });
      if (/[{}<;]/.test(String(v))) return res.status(400).json({ error: `Invalid value for ${k}` });
    }
    // B-0248 (c): a COPY — the set in memory is the PENDING one, whose earlier version may be landing now: an edit in place would make
    // that landing tell every page a theme the file does not hold (the fresh read's MUST)
    const data = { ...readCustomThemes() };
    data[name] = { css, terminal: terminal || {} };
    writeCustomThemes(data);
    answerAfter(themesHold, res, () => res.json({ success: true }));   // B-0248 (c): the answer after the landing
  });

  router.delete('/api/custom-themes/:name', (req, res) => {
    const data = { ...readCustomThemes() };   // (a COPY — above)
    if (!data[req.params.name]) return res.status(404).json({ error: 'Theme not found' });
    delete data[req.params.name];
    writeCustomThemes(data);
    answerAfter(themesHold, res, () => res.json({ success: true }));   // B-0248 (c): the answer after the landing
  });

  // ── Sync Store snapshots ──
  router.get('/api/sync/:store', (req, res) => {
    const store = getSyncStore(req.params.store);
    if (!store) return res.status(404).json({ error: 'Unknown store' });
    // lane lg-recovery (主开发 r3262 / r3271, law (a)): the store's own answer — HELD by name (503, no data) while its file is
    // unread, never «nothing at version 0» (the page starts empty AND held, and keeps what it holds)
    const ans = store.snapshotAnswer();
    res.status(ans.status).json(ans.body);
  });

  // ── User State ──
  const USER_STATE_FILE = path.join(dataDir, 'user-state.json');
  // B-225b (lane lg-store-writes — 主开发's shape of 2026-11-20 04:37Z, R1–R3, R6, R12): THE CONVERSATION LIST'S HOLD (src/store-hold.js).
  // A read that FAILED, or bytes that are not the list, is HELD and has NO VALUE: no door serves its defaults (R2 — 503 store_unread,
  // by name), nothing writes over it (R1 — its one write refuses), the readers inside the hub get UNKNOWN (R3 — isArchived answers
  // null and the doors that act for nobody refuse on it by name). A list NOT THERE writes nothing: the defaults live in memory and the
  // first real change CREATES the file exclusively (R6 — a file that appeared since is read and adopted, the change refused by name).
  // A hold begins only at the START (R12): once read, the copy in memory is the list. THE LIFT IS A CHANGE (userStateAgain).
  let _userStateRead = false;
  const userStateHold = SH.create({
    file: USER_STATE_FILE,
    valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
    onLift: () => userStateAgain('its hold lifted'),
    // B-0248 (c) (lane bl-loop-b): THE STORE WRITER's — a write that held the loop for its rename before its own answer. At the
    // LANDING (once a write — a burst of changes is one): every page told the state that landed, then the write hook (the archived
    // list the groups judge) — never ahead of the disk; a write that changed no state (its facts alone, the read's own rewrite) tells nothing
    writer: storeW,   // (writeUserStateFile's owe; the start read's own rewrite stays at the call)
    onLanded: (st) => { _userStateLandedSt = st; userStateLanded(st); },
    onSaid: (h) => { console.warn(`[user-state] ${h.file} still cannot be read (${h.kind}${h.code ? `, ${h.code}` : ''}) — the conversation list is HELD: nothing is written over it, its doors refuse by name until it reads`); storeWord('store-held', h); },
  });
  // lane sidebar-echo-order (inc-mwbn2xp8-ks0b): user state BY ITEM, IN THE SERVER'S ORDER — the ops (src/user-state-ops.js, PURE,
  // shared with the page), the write counter `stateRev` and the server's LIFE `stateEpoch` (round 2, law 3: one id per process
  // start — the counter orders states within one life; a restore of an older file, a LOWER counter, always restarts the hub,
  // so a page that meets another life takes its state whatever its number). Never data: never exported, never taken.
  // the life's start comes first (round 6: a page orders lives by it) and is never behind the hub's clock mark (round 8: a clock
  // stepped back across a restart still starts a LATER life — the mark rides in the file)
  let _userStateEpoch = null;
  const userStateEpoch = () => _userStateEpoch || (readUserState(), _userStateEpoch = 'ep' + Math.floor(Math.max(Date.now(), _userStateClockMark)).toString(36) + '-' + require('crypto').randomBytes(6).toString('base64url'));
  // THE FACTS (round 7): one per SLOT a write changed in the last week — when, by which page and act (UO.factStore); the
  // later act wins, as on master, and an act made before another writer's change to its slot is dropped. Kept in
  // user-state.json as `stateFacts`, in the SAME atomic write as the state and stateRev; out of the GET, the broadcast and
  // the export; a fact older than UO.MAX_ACT_AGE_MS is dropped AT A WRITE (never on the read path).
  const _userStateFacts = UO.factStore();
  let _userStateReadOnlySaid = false;   // the normalizer's rewrite refused by the disk: said once (C2)
  // THE HUB'S CLOCK, HIGH-WATER (round 8): never behind a time this hub already gave — a wall clock stepped back is read as the mark
  // plus the MONOTONIC time since, until the wall catches up (a carried act's age still dates it right); persisted with the facts
  // (UO.CLOCK_KEY), so a restart starts at or after it
  let _userStateClockMark = 0, _userStateMarkMono = null;
  const userStateNow = () => {
    let t, m;
    try { t = Math.floor(Number(userStateClock())); } catch { t = NaN; }
    if (!Number.isFinite(t)) t = Date.now();
    try { m = Number(userStateMono()); } catch { m = NaN; }
    const run = Number.isFinite(m) && _userStateMarkMono != null ? _userStateClockMark + Math.max(0, m - _userStateMarkMono) : _userStateClockMark;   // (round 9: the fractions carried — a floored delta per call ran slow)
    _userStateClockMark = Math.max(t, run);
    if (Number.isFinite(m)) _userStateMarkMono = m;
    return Math.floor(_userStateClockMark);
  };
  /** user-state.json's text: the state as JSON.stringify writes it (compact — round 12), the hub's clock mark and the facts last — the
   *  facts' part from the store's kept fragments with `draft`'s changes laid over (round 8: a write ENCODES only what it changed; it still JOINS every kept fact — O(facts), round 13) */
  // round 12, LAW A — ONE STRINGIFY A WRITE: master stringifies a write's whole state twice, pretty for its file and compact for its
  // broadcast; here user-state.json is written COMPACT and the broadcast's state is the same text (the file without the server's facts
  // and clock mark, with the life after it) — one pass where master makes two; the frame is byte for byte what wireOf would give
  const userStateTexts = (st, draft = null) => {
    const { [UO.FACTS_KEY]: _f, [UO.CLOCK_KEY]: clock, ...body } = st || {};
    const text = JSON.stringify(body), empty = text === '{}', head = text.slice(0, -1);   // (head: the body without its closing brace)
    const more = clock === undefined ? [] : [`${JSON.stringify(UO.CLOCK_KEY)}:${JSON.stringify(clock)}`];   // (the hub's clock mark last)
    if (_userStateFacts.size || (draft && draft.changes.size)) more.push(`${JSON.stringify(UO.FACTS_KEY)}:${_userStateFacts.text(draft)}`);
    // the file in two PARTS (the writer writes one, then appends the other — never joined): the body, then the members after it
    const parts = !more.length ? [text] : [head, more.map((m, i) => (empty && i === 0 ? '' : ',') + m).join('') + '}'];
    return { parts, wire: () => `${head}${empty ? '' : ','}${JSON.stringify(UO.EPOCH_KEY)}:${JSON.stringify(userStateEpoch())}}` };
  };
  const userStateParts = (st, draft = null) => userStateTexts(st, draft).parts;
  // B-0248 (c): the bytes are made when the write is DUE (the writer's produce — the LATEST state), so the facts a write changed ride
  // them two ways: laid over the store's when the bytes are made inside the call (`_stDraft` — the exclusive create, or a write the
  // writer starts at once), committed to the store right after the call otherwise. Each state's texts are kept by the state (a
  // WeakMap): its broadcast at the landing is the same one stringify as its file (round 12, LAW A)
  let _stDraft = null;
  const _stTextsOf = new WeakMap();
  const userStateBytes = (st) => { const t = userStateTexts(st, _stDraft); _stTextsOf.set(st, t); return t.parts; };
  let _userStateToldRev = 0;   // the last state the pages were told (a landing with no new state tells nothing)
  let _userStateLandedSt = null;   // what LANDED — the list every reader OUTSIDE the store is handed (userStateOut); the cache is the pending one
  function userStateLanded(st) {
    const rev = UO.revOf(st);
    if (rev <= _userStateToldRev) return;
    _userStateToldRev = rev;
    const t = _stTextsOf.get(st);
    broadcastText(() => `{"type":"user-state-updated","state":${t ? t.wire() : JSON.stringify(wireOf(st))}}`);   // (= wireOf(st), read off the file's one stringify — round 12)
    // lane pair-group-fate: the ONE write of the sidebar's archived list — a conversation archived here ends its groups' waits (at
    // its landing: what the groups judge is on disk)
    try { onUserStateWrite(st); } catch (e) { console.warn('[user-state] write hook failed:', e && e.message); }
  }
  /** user-state.json's change — the ONE call both writers make (a state, or the facts alone). B-225b: THROUGH THE HOLD — it refuses a
   *  held list by name (R1), creates a list NOT THERE exclusively at the call (R6: a file that appeared since is adopted and every page
   *  told, this change refused by name — 409 store_appeared); B-0248 (c): else the store writer's, its answer the hold's after() (a declaration: test-architecture §72 reads its row's name in its body) */
  function writeUserStateFile(st, draft) {
    _stDraft = draft;
    // accepted: THE PENDING STATE — the next write builds on it — and only what this write changed of the facts, the next act judged
    // against them; before anything is told (the write hook reads this copy). A refusal by name throws first: nothing moves
    try { return userStateHold.owe(st, { name: 'user-state.write', bytes: userStateBytes, accepted: () => { _userStateCache = st; _userStateFacts.commit(draft); } }); }
    catch (e) { if (e && e.code === 'store_appeared') userStateAgain('a file appeared where the start found none'); throw e; }
    finally { _stDraft = null; }
  }
  const userStateText = (st, draft = null) => userStateParts(st, draft).join('');
  /** what a client is told: the store minus the server's facts, plus the server's life */
  const wireOf = (st) => { const { [UO.FACTS_KEY]: _f, [UO.CLOCK_KEY]: _c, ...rest } = st || {}; return { ...rest, [UO.EPOCH_KEY]: userStateEpoch() }; };
  let _userStateCache = null;
  const USER_STATE_DEFAULT = {
    stateVersion: 2,
    starredSessions: [],
    archivedSessions: [],
    archivedFolders: [],
    customNames: {},
    sessionModes: {},
    sessionConfigs: {},
    sessionGroups: {},
    groupFolders: {},
  };

  const CLAUDE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function buildKnownSessionKeyMap() {
    const map = new Map();
    const add = (legacyId, sessionKey) => {
      if (!legacyId || !sessionKey) return;
      if (!map.has(legacyId)) map.set(legacyId, sessionKey);
    };

    for (const [id, session] of activeSessions || []) {
      const backend = session.backend || 'claude';
      const backendSessionId = session.backendSessionId || session.claudeSessionId || null;
      const sessionKey = backendSessionId ? `${backend}:${backendSessionId}` : '';
      const webuiSessionId = id || null;
      add(session.backendSessionId, sessionKey);
      add(session.claudeSessionId, sessionKey);
      add(webuiSessionId, sessionKey);
      add(webuiSessionId ? `${backend}:${webuiSessionId}` : '', sessionKey);
    }

    for (const session of listCodexThreads({ activeSessions })) {
      add(session.sessionId, session.sessionKey || `codex:${session.backendSessionId || session.sessionId}`);
      add(session.backendSessionId, session.sessionKey || `codex:${session.backendSessionId || session.sessionId}`);
    }

    return map;
  }

  function migrateLegacySessionRef(rawKey, knownSessionKeys) {
    const key = String(rawKey || '');
    if (!key) return '';
    if (knownSessionKeys?.has(key)) return knownSessionKeys.get(key);
    if (key.includes(':')) return key;
    if (CLAUDE_UUID_RE.test(key)) return `claude:${key}`;
    return key;
  }

  function migrateStateArray(items, knownSessionKeys) {
    const next = [];
    const seen = new Set();
    for (const raw of Array.isArray(items) ? items : []) {
      const mapped = migrateLegacySessionRef(raw, knownSessionKeys);
      if (!mapped || seen.has(mapped)) continue;
      seen.add(mapped);
      next.push(mapped);
    }
    return next;
  }

  function migrateStateMap(map, knownSessionKeys) {
    const next = {};
    for (const [rawKey, value] of Object.entries(map || {})) {
      const mapped = migrateLegacySessionRef(rawKey, knownSessionKeys);
      if (!mapped || Object.hasOwn(next, mapped)) continue;
      next[mapped] = value;
    }
    return next;
  }

  // True if any session ref still uses a legacy un-prefixed id (no "backend:" prefix)
  function _hasLegacyRefs(source) {
    const refs = [
      ...(Array.isArray(source.starredSessions) ? source.starredSessions : []),
      ...(Array.isArray(source.archivedSessions) ? source.archivedSessions : []),
      ...Object.keys(source.customNames || {}),
      ...Object.keys(source.sessionModes || {}),
      ...Object.keys(source.sessionConfigs || {}),
      ...Object.values(source.sessionGroups || {}).flat(),
    ];
    return refs.some((r) => typeof r === 'string' && r && !r.includes(':'));
  }

  // The keys this normaliser REBUILDS (session-ref migration). Every OTHER
  // top-level key is carried through VERBATIM (2026-09-14): user-state is the
  // merge-only home the B-b87b belt promised to per-feature preferences —
  // `desktopAppRecents` (2.369.96) and `desktopAppAdvancedOpen` PATCH here —
  // and this function used to return a literal of exactly the session keys,
  // so every such key was dropped on the very write that carried it (measured
  // in headless chrome: PATCH {desktopAppAdvancedOpen:true} ⇒ GET never
  // carried it; the launcher's Recent list never survived a reload).
  const USER_STATE_MIGRATED_KEYS = new Set(Object.keys(USER_STATE_DEFAULT));

  function normalizeUserState(data) {
    const source = data && typeof data === 'object' ? data : {};
    // buildKnownSessionKeyMap walks the entire ~/.codex/sessions tree — only
    // pay that on writes that actually contain legacy refs to migrate.
    // (migrateLegacySessionRef passes prefixed keys through untouched, so an
    // empty map is equivalent when no legacy refs exist.)
    const knownSessionKeys = _hasLegacyRefs(source) ? buildKnownSessionKeyMap() : new Map();
    const sessionGroups = {};
    for (const [groupName, sessionRefs] of Object.entries(source.sessionGroups && typeof source.sessionGroups === 'object' ? source.sessionGroups : {})) {
      sessionGroups[groupName] = migrateStateArray(sessionRefs, knownSessionKeys);
    }
    const extras = {};
    for (const [k, v] of Object.entries(source)) if (!USER_STATE_MIGRATED_KEYS.has(k) && !UO.SERVER_KEYS.includes(k) && !UO.WIRE_KEYS.includes(k) && v !== undefined) extras[k] = v;   // stateRev / stateEpoch / stateBatches are the server's; a request's own keys (batches, born, seq) a .392 hub stored as top-level junk are dropped (lane sidebar-echo-order r6)
    return {
      ...extras,
      stateVersion: 2,
      starredSessions: migrateStateArray(source.starredSessions, knownSessionKeys),
      archivedSessions: migrateStateArray(source.archivedSessions, knownSessionKeys),
      // folder keys, not session refs — no legacy migration needed
      archivedFolders: Array.isArray(source.archivedFolders) ? source.archivedFolders.filter((x) => typeof x === 'string' && x) : [],
      customNames: migrateStateMap(source.customNames && typeof source.customNames === 'object' ? source.customNames : {}, knownSessionKeys),
      sessionModes: migrateStateMap(source.sessionModes && typeof source.sessionModes === 'object' ? source.sessionModes : {}, knownSessionKeys),
      sessionConfigs: migrateStateMap(source.sessionConfigs && typeof source.sessionConfigs === 'object' ? source.sessionConfigs : {}, knownSessionKeys),
      sessionGroups,
      groupFolders: source.groupFolders && typeof source.groupFolders === 'object' ? source.groupFolders : {},
    };
  }

  /** the facts alone (a request whose applied ops decided slots without changing a value): no new rev, no broadcast, no hook — a
   *  restart must still know which act decided them */
  function writeUserFacts(draft, now) {
    const next = { ...readUserState(), [UO.CLOCK_KEY]: now };
    _userStateFacts.sweep(draft, now);
    writeUserStateFile(next, draft);   // (the cache and the facts move in its `accepted`)
  }

  function readUserState() {
    if (_userStateCache) return _userStateCache;
    ensureDir(dataDir);
    // lane sidebar-echo-order r7, C2 — NOTHING ON THE READ PATH REPLACES WHAT WAS READ: a state read whole is the state served; the
    // normalizer's own rewrite (legacy refs, a stored junk key) is tried on its own and, should the disk refuse it, said once — never
    // the default served for a write that failed (a hub booting on a full disk or a read-only data dir served an empty sidebar,
    // and the next write persisted it)
    // B-225b: THROUGH THE HOLD — read once at the start; a HELD list answers the refusal by name (store_unread) and nothing else (R2:
    // never the defaults under its name — the release served them and the next write saved them over the person's list)
    if (!_userStateRead) { userStateHold.readAtStart(); _userStateRead = true; }
    const parsed = userStateHold.answer();
    const rawText = userStateHold.takeText();
    if (parsed === undefined) { _userStateCache = { ...USER_STATE_DEFAULT }; _userStateLandedSt = _userStateCache; return _userStateCache; }   // NOT THERE (R6): the defaults in memory, nothing written
    _userStateCache = normalizeUserState(parsed);
    if (UO.revOf(parsed)) _userStateCache[UO.REV_KEY] = UO.revOf(parsed);   // the counter survives a restart (the file holds it)
    const mark = Number(parsed[UO.CLOCK_KEY]);
    if (Number.isSafeInteger(mark) && mark > 0) { _userStateCache[UO.CLOCK_KEY] = mark; if (mark > _userStateClockMark) _userStateClockMark = mark; }   // the hub's clock mark survives too
    _userStateFacts.load(parsed[UO.FACTS_KEY]);   // as read (pruned only at a write)
    _userStateToldRev = UO.revOf(_userStateCache);   // the pages are told from the state read on
    _userStateLandedSt = _userStateCache;
    if (rawText != null && userStateText(_userStateCache) !== String(rawText).trim()) {
      // B-0248 (c): THE READ'S OWN REWRITE STAYS AT THE CALL (the queued-write class): the boot's one-time migrations read
      // user-state.json FROM DISK after this start read (src/server/migrations.js — the archived list leaves its groups, recorded as
      // done once), so the file they read is the one this read made — never one still owed to the writer
      try { userStateHold.write(_userStateCache, userStateText(_userStateCache)); }
      catch (e) { if (!_userStateReadOnlySaid) { _userStateReadOnlySaid = true; console.warn('[user-state] the normalized state could not be written back — it is served as read:', (e && (e.code || e.message)) || e); } }
    }
    try { userStateHold.set(_userStateCache); } catch { /* not held here */ }   // (the hold keeps the list in memory, never a second copy of what was read)
    return _userStateCache;
  }

  /** B-0248 (c): WHAT LEAVES THE STORE IS WHAT LANDED — the readers outside the list's own doors that only SHOW or COUNT it (the
   *  router's readUserState: the groups' liveness and signature, the owner's facts, the names; the GET; the export) are handed the
   *  state ON DISK. (The release's cache moved in the same synchronous step as its write, so it had one state; here the doors' state
   *  runs ahead of the disk by the write in flight.) Two kinds read otherwise (r1053): isArchived — a gate that acts for nobody —
   *  reads BOTH lists and fails closed; the readers that choose what a turn is billed to or runs on read the PENDING one
   *  (readUserStatePending). The doors build the next change on the PENDING one */
  function userStateOut() { const st = readUserState(); return _userStateLandedSt || st; }
  /** the list read again WHOLE (its hold lifted, or a file appeared where the start found none): a NEW life — every page takes it
   *  whatever its number (the life's rule) — and the write hook runs on it (the archived list the groups judge). R11's «the lift is a change» */
  function userStateAgain(why) {
    _userStateCache = null; _userStateEpoch = null; _userStateLandedSt = null;
    let st;
    try { st = readUserState(); } catch (e) { console.warn(`[user-state] the list could not be read again (${why}): ${(e && e.message) || e}`); return; }
    console.log(`[user-state] the conversation list is read again (${why})`);
    storeWord('store-lifted', { file: 'user-state.json', why });
    broadcastText(() => `{"type":"user-state-updated","state":${JSON.stringify(wireOf(st))}}`);
    try { onUserStateWrite(st); } catch (e) { console.warn('[user-state] write hook failed:', e && e.message); }
  }

  function writeUserState(data, { facts = null, decided = null, writer = null, omits = false, whole = false, maxMoves = Infinity } = {}) {
    const prev = _userStateCache || readUserState();
    // lane sidebar-echo-order («once» is on disk before it is said): the next state and its FACTS are ONE write; a write REFUSED (held,
    // a file that appeared, a full disk at the exclusive create) changes nothing here, and its caller says so. B-0248 (c): the change
    // is the PENDING state once handed to the writer — the next write builds on it (one queue a store) — and the door answers after
    // its LANDING (the hold's after()); a write that fails there stays owed (the writer writes it again) and the door says so by name.
    // THE ONE PLACE every writer moves the facts (round 7): each slot whose value this write changes — by a page's op (`writers`),
    // or by a whole-key writer (an old page, desktop-app-prefs, a restore, the server's own archive / rename: no page)
    const next = normalizeUserState(data);
    next[UO.REV_KEY] = UO.revOf(prev) + 1;   // EVERY write gets the next number — whatever the body said
    const now = userStateNow();
    next[UO.CLOCK_KEY] = now;
    // the facts move for the keys this write REPLACED (a merge / applyOps keeps the others' references) — the diff costs the keys it
    // changed; the file's facts text still joins every kept fact (O(facts) — the kb's Limits row)
    const after = { ...prev };
    for (const k of UO.KEYS) if (!data || data[k] !== prev[k]) after[k] = next[k];
    const draft = facts || _userStateFacts.draft();
    // (round 10, MUST 3: `omits` = an old page's whole key — what it lacks is its ignorance; every other writer is an act at its time)
    UO.moveFacts(draft, prev, after, now, decided || new Set(), writer, undefined, omits, whole ? UO.KEYS : null, maxMoves);   // (an import decides every key whole, at its time)
    _userStateFacts.sweep(draft, now);   // a fact older than a week is dropped HERE, at most hourly (no op old enough to need it is applied)
    writeUserStateFile(next, draft);   // a refusal by name throws here, nothing moved; else the cache (THE PENDING STATE) and the facts
    // move in its `accepted` — and every page is told the state, and the write hook runs, at the LANDING (userStateLanded)
  }

  // round 9: THE HUB'S CLOCK MARK IS TAKEN AT BOOT — the state (and its mark) read and the clock taken once, before the routes serve
  // anything: a wall step back before the first write still runs on from the previous life's mark (a GET anchors nothing)
  try { userStateEpoch(); userStateNow(); } catch (e) { console.warn('[user-state] the state could not be read at boot:', (e && e.message) || e); }
  // rounds 12–13, LAW C at the ONE door this release added: the ops door reads its own body under its own bound (MAX_BODY_BYTES, the
  // page's splitter's number) — body-parser counting the bytes it reads (a chunked body, a gzip body by what it inflates to) — and refuses
  // past it by name before the handler. server.js skips its 50 MB parser for exactly the paths THIS parser's layer matches: the router's
  // own compiled match (any letter case, a trailing slash), never a second expression (round 13: server.js's own regex missed
  // '/api/user-state/batches/' and '/API/USER-STATE/BATCHES', and a 41 MB ops request landed). Master's roads — the whole-key doors, the
  // import — keep master's parser and take what master takes
  const userStateBody = (limit) => { const parse = express.json({ limit }); return (req, res, next) => parse(req, res, (err) => {
    if (!err) return next();
    if (err.type === 'entity.too.large' || err.status === 413) return res.status(413).json({ error: `the body is past ${limit} B (as read)`, code: 'too-large' });
    return res.status(err.status && err.status < 500 ? err.status : 400).json({ error: `the body could not be read (${err.type || err.message})`, code: 'malformed' });
  }); };
  router.use('/api/user-state/batches', userStateBody(UO.MAX_BODY_BYTES));
  { const layer = router.stack[router.stack.length - 1]; router.ownsBody = (p) => layer.regexp.test(p) || layoutSyncLayer.regexp.test(p); }   // (the parsers' own layers: user-state's, and B-46fc's layout-sync)
  router.get('/api/user-state', (req, res) => {   // lane sidebar-echo-order: + stateEpoch, − stateBatches
    let st; try { st = userStateOut(); } catch (e) { if (storeRefused(res, e)) return; throw e; }   // B-0248 (c): what LANDED
    res.json(wireOf(st));
  });

  router.post('/api/user-state', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Expected object' });
    // (an older page before its first fetch POSTs its whole copy — round 10: its gaps are no acts. MASTER'S ROAD (round 13): it takes
    // what master takes — no bound master does not have; past MAX_WHOLE_MOVES changed items the write is ONE record a key naming the items it changed — round 14)
    try { writeUserState(data, { omits: true, maxMoves: UO.MAX_WHOLE_MOVES }); } catch (e) {
      if (storeRefused(res, e)) return;
      return res.status(503).json({ error: `not saved: the server could not write its state (${(e && (e.code || e.message)) || 'write failed'})` });
    }
    const rev = UO.revOf(_userStateCache);   // THIS write's number (a later write may land with it)
    answerAfter(userStateHold, res, () => res.json({ success: true, rev, epoch: userStateEpoch() }));   // B-0248 (c): after the landing
  });

  // Merge-only write (B-b87b clobber belt): user-state is full-doc
  // last-write-wins with 10+ unguarded mutation sites — a tab acting on a
  // STALE mirror (open all day, missed broadcasts) used to clobber every key
  // it never touched (stars, renames, configs from other tabs). The client
  // now sends only the top-level keys its mutation CHANGED; unchanged keys
  // can no longer travel, so a stale tab's damage is bounded to the key it
  // actually edited (same-key races stay last-write-wins, the documented
  // residual until a rev protocol lands).
  // lane sidebar-echo-order (the owner's incident inc-mwbn2xp8-ks0b): TWO DOORS. PATCH /api/user-state takes WHOLE top-level
  // keys, as before (an old page, desktop-app-prefs, the panels' folds) — merged, last write wins per key. PATCH
  // /api/user-state/batches (round 6, MUST 3) takes what the person CHANGED — ops per item (and per member / per field) — as
  // {batches: [{batch, age, ops}, …]}: every batch the page has not seen confirmed, oldest first, under its own ids, each with its
  // age. A server without this door answers 404 — to this page a failure like any other (round 7, C1). Every answer names the
  // `rev` and the server's life `epoch`.
  router.patch('/api/user-state', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Expected object' });
    if (UO.WIRE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(data, k)) || Object.prototype.hasOwnProperty.call(data, 'ops'))
      return res.status(400).json({ error: 'ops go to PATCH /api/user-state/batches — this door takes whole top-level keys' });
    // MASTER'S ROAD (round 13): an older page's whole key takes what master takes — no bound master does not have; past MAX_WHOLE_MOVES
    // changed items the write is ONE record a key naming the items it changed (round 14 — never a refusal)
    try { writeUserState({ ...readUserState(), ...data }, { omits: true, maxMoves: UO.MAX_WHOLE_MOVES }); } catch (e) { if (storeRefused(res, e)) return; return res.status(503).json({ error: `not saved: the server could not write its state (${(e && (e.code || e.message)) || 'write failed'})` }); }
    const rev = UO.revOf(_userStateCache);   // THIS write's number (a later write may land with it)
    answerAfter(userStateHold, res, () => res.json({ success: true, rev, epoch: userStateEpoch() }));   // B-0248 (c): after the landing
  });
  // THE OPS DOOR: each op judged against its slot's fact — THE LATER ACT WINS (round 7): applied when no other writer changed the
  // slot after the act was made (its age), its own page's next act; held as its own duplicate; superseded otherwise. An act older
  // than a week is not applied. BOUNDED: a body ≤ UO.MAX_BODY_BYTES; a batch ≤ UO.MAX_OPS_PER_BATCH ops (a batch past it, or with
  // a bad op, is refused on its own). The state and its facts are ONE write, answered after it.
  router.patch('/api/user-state/batches', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Expected object', code: 'malformed' });
    const { batches, ...whole } = data;
    // B-0248 (c): EVERY answer of this door waits for what the list owes NOW — a re-sent batch held as its own duplicate is answered
    // only once the write that applied it landed (an answer at once would confirm an act the disk does not hold yet)
    const answer = (extra = {}) => { const rev = UO.revOf(_userStateCache || readUserState()); answerAfter(userStateHold, res, () => res.json({ success: true, rev, epoch: userStateEpoch(), ...extra })); };
    if (Object.keys(whole).length) return res.status(400).json({ error: `whole top-level keys beside batches (${Object.keys(whole).slice(0, 4).join(', ')}) — whole keys go to PATCH /api/user-state`, code: 'malformed' });
    // (its body is read at most MAX_BODY_BYTES at its parser, below — round 12, law C: a header no longer decides it)
    const r = UO.parseRequest(batches);
    if (r.error) return res.status(400).json({ error: r.error, code: r.code || 'malformed' });   // (round 9: a CODE the page words in the person's language)
    let cur;   // the facts are loaded WITH the state — the first request of a new process may be a re-send
    try { cur = readUserState(); } catch (e) { if (storeRefused(res, e)) return; throw e; }   // B-225b R4: held ⇒ refused by name, the page keeps its acts pending
    const now = userStateNow();
    // round 7: THE LATER ACT WINS — each op judged against its slot's fact by the act's age (UO.judgeRequest)
    const j = UO.judgeRequest(_userStateFacts.draft(), r.page, r.list, cur, now);
    const next = j.ops.length ? UO.applyOps(cur, j.ops) : cur;
    // the state and its facts ONE write, answered after it — a write that fails moves neither, and is said by name
    const lastB = r.list[r.list.length - 1];
    const last = lastB ? { page: r.page, counter: lastB.seq, t: Math.floor(Math.min(now - lastB.age, now)) } : null;   // (round 8: the act's time)
    try {
      if (UO.changedKeys(cur, next).length) writeUserState(next, { facts: j.facts, decided: j.decided, writer: last });
      else if (j.decided.size) writeUserFacts(j.facts, now);
    }
    catch (e) { if (storeRefused(res, e)) return; return res.status(503).json({ error: `not saved: the server could not write its state (${(e && (e.code || e.message)) || 'write failed'}) — nothing was applied` }); }
    const of = (k) => j.verdicts.filter((v) => v.verdict === k).map((v) => v.id);
    const named = (k) => j.verdicts.filter((v) => v.verdict === k).map((v) => ({ batch: v.id, error: v.problem, code: v.code || null }));
    answer({ applied: of('applied'), held: of('held'), superseded: of('superseded'), old: named('old'), refused: named('refused'), dropped: j.verdicts.filter((v) => v.dropped && v.dropped.length).map((v) => ({ batch: v.id, ops: v.dropped })) });
  });

  // ── Settings ──
  const SETTINGS_FILE = path.join(dataDir, 'settings.json');
  let _settingsCache = null;
  // B-225b (cut 4 — R1, R2, R3, R11): THE SETTINGS' HOLD. settings.json stays synchronous (written at the call) and is read ONCE at
  // the start through its hold. HELD (a read that failed, bytes that are not the settings) ⇒ NO VALUE: GET /api/settings and every
  // save answer 503 store_unread by name, nothing is written over it (the release read it as {} and the next save of the Settings
  // page wrote its defaults over the person's — the spending caps included). Readers inside the hub get every row on its DEFAULT,
  // handed as a FROZEN object that is not the cache (R3), carrying the hold under SETTINGS_HELD: the owner's rows' readers (the spend
  // guard, the judge) ask it and answer NOT NOW — a refusal that uses nothing up (R11). THE LIFT IS A SETTINGS CHANGE (settingsAgain).
  const SETTINGS_HELD = Symbol.for('vibespace.settings-held');   // (server.js serverSetting(key) hands any key through: serverSetting(SETTINGS_HELD))
  let _settingsRead = false;
  const settingsHold = SH.create({
    file: SETTINGS_FILE,
    valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
    onLift: () => settingsAgain('its hold lifted'),
    onSaid: (h) => { console.warn(`[settings] ${h.file} still cannot be read (${h.kind}${h.code ? `, ${h.code}` : ''}) — the settings are HELD: every row runs on its default, nothing unattended spends, nothing is written over them`); storeWord('store-held', h); },
  });
  /** while HELD: every row on its default — a frozen object that is NOT the cache, the hold's facts under SETTINGS_HELD */
  // (round wyzvr7567's MUST 2: the rows that guard money, a safety ask, a vendor call or a write to a person's own file take their
  // STRICT side in the held view — src/settings-held-strict.js; every other row runs on its default)
  const heldSettingsView = (h) => Object.freeze(Object.defineProperty({ ...require('../settings-held-strict.js').strictValues() }, SETTINGS_HELD, { value: Object.freeze({ ...h }), enumerable: false }));

  function readSettings() {
    if (_settingsCache) return _settingsCache;
    if (!_settingsRead) { let pre; try { ensureDir(dataDir); } catch (e) { pre = { error: e }; } settingsHold.readAtStart(pre); _settingsRead = true; }   // (the flag after the start read: MUST 1 — a dead data mount holds the settings, the spend guard refuses)
    const h = settingsHold.held();
    if (h) return heldSettingsView(h);
    const v = settingsHold.answer();
    settingsHold.takeText();
    _settingsCache = v === undefined ? {} : v;   // NOT THERE (R6): no row stored, nothing written
    try { settingsHold.set(_settingsCache); } catch { /* not held here */ }
    return _settingsCache;
  }
  /** R11: THE LIFT IS A SETTINGS CHANGE — the read, the setting holds' OWED returns (each its own write, with its hooks), the write's
   *  hooks, then spend: every waiting unattended turn is judged again against the real caps (noteLimitsWritten with no «before») */
  const _settingsLiftHooks = [];
  router.onSettingsLift = (fn) => { if (typeof fn === 'function') _settingsLiftHooks.push(fn); };
  function settingsAgain(why, { afterWrite = false } = {}) {   // afterWrite: the caller's own write ran the write hooks (the import): not again
    _settingsCache = null;
    try { readSettings(); } catch (e) { console.warn(`[settings] the settings could not be read again (${why}): ${(e && e.message) || e}`); return; }
    if (settingsHold.held()) return;   // still HELD: no lift — no owed return is tried, nothing is said lifted (its own ladder reads it)
    console.log(`[settings] the settings are read again (${why})`);
    for (const fn of _settingsLiftHooks) { try { fn(); } catch (e) { console.warn('[settings] a lift hook failed:', e && e.message); } }
    const data = readSettings(), spend = spendOf(data);
    // (主开发 r552) afterWrite: the caller's write already broadcast the settings and ran the write hooks — run them ONCE (every stored
    // spawn row pushed to the running conversations once); the lift's own re-judge of the waiting turns still runs (no «before»)
    if (!afterWrite) {
      broadcast({ type: 'settings-updated', settings: data, ...(spend ? { spend } : {}) });
      try { onSettingsWrite?.(data, {}); } catch (e) { console.warn('[settings] change callback failed:', e.message); }
    }
    try { require('../server/spend-guard.js').noteLimitsWritten(null, spend); } catch { }
    storeWord('store-lifted', { file: 'settings.json', why });
  }

  // lane owner-press-attended r2: THE IN-FORCE SPEND NUMBERS RIDE THE WRITE — the POST's echo AND the settings-updated
  // broadcast carry the SAME `spend` (budgetLimits over what the server now holds, a CAP_MAX clamp included — the 2.309.0
  // cache law: the invalidation pushes the RESULT), so every tab's «in force now» has ONE source (a tab kept saying its
  // own last echo, 50, after another device raised the cap to 100)
  // B-0a33 (3) (the follow-up ruling; the cure, 主开发 04:23Z): a PERSON'S «nothing» for a spending CAP stores nothing — never the
  // default — on EVERY door of a person: the page's POST (the whole file — the Settings page saves this way), the config import's
  // settings part and a PATCH. Stored BLANK (no number: refused, said), never a null an internal patch could read as «the row's
  // default». The internal door (patchSettings) drops only a null it CARRIES (setting-holds' return to an absent «before»): a cap's
  // stored blank or null it does not carry stays as it is
  const SPEND_CAP_KEYS = new Set(require('../spend-authorizer.js').CAP_SETTING_KEYS);
  const blankCaps = (d) => { if (d && typeof d === 'object') for (const k of SPEND_CAP_KEYS) if (Object.prototype.hasOwnProperty.call(d, k) && d[k] === null) d[k] = ''; return d; };
  function spendOf(data) { try { return require('../spend-authorizer.js').budgetLimits((k) => (data || {})[k]); } catch { return null; } }
  function writeSettings(data, out = null) {   // `out` (B-ddf3 unit 2, r1518): the caller's OWN object, handed the CLI-config landing
    readSettings();
    settingsHold.refuseIfHeld('this settings change');   // B-225b R1: the settings HELD — nothing is written over them
    ensureDir(dataDir);
    const prev = readSettings(); // capture BEFORE the cache swap (for the change callback)
    // settings-prune verify r1: a RETIRED key may leave the file (the boot migration archives it, then strips) but never
    // re-enter it — a tab loaded before the update POSTs its whole `_values` (refetch never deletes a key), which wrote
    // the stripped keys back for good (the migration never re-runs). Kept only while the file still holds it.
    const back = RETIRED_SETTING_KEYS.filter((k) => Object.hasOwn(data, k) && !(prev && Object.hasOwn(prev, k)));
    if (back.length) { data = { ...data }; for (const k of back) delete data[k]; }
    _settingsCache = data;
    try { settingsHold.write(data); }   // the hold's ONE write: the pid temp, then the rename (NOT THERE ⇒ created exclusively)
    catch (e) { if (e && e.code === 'store_appeared') settingsAgain('a file appeared where the start found none'); throw e; }
    const spend = spendOf(data);
    broadcast({ type: 'settings-updated', settings: data, ...(spend ? { spend } : {}) });
    // Server-side change hook (2.190.0): the ONLY settings key with a server
    // side effect is the Integration master switch — everything else is read
    // lazily via readSettings. Never let a callback failure break the write.
    try { const landing = onSettingsWrite?.(data, prev) || null; if (out) out.landing = landing; } catch (e) { console.warn('[settings] change callback failed:', e.message); }
    try { require('../server/spend-guard.js').noteLimitsWritten(spendOf(prev), spend); } catch { }   // B-0a33 (2): waiting frames re-judged at once
    return spend;
  }
  // B-ddf3 unit 2 line 1 (the coordinator's r1407 (b)): the settings answer waits for the CLI config's LANDING on this machine, or
  // says by name that it did not land (src/server/landing-answer.js). The landing rides the route's OWN call (writeSettings' `out`),
  // never a module-wide variable another writer could leave behind (r1518)
  const answerAtLanding = (res, body, landing) => require('../server/landing-answer.js').answerAtLanding(res, body, landing || null);

  // Server-side settings accessor: /api/settings persists HERE
  // (data/settings.json) — NOT in the 'settings' SyncStore (settings-sync.json,
  // a dormant migration target). Server code must read via this, never via
  // getSyncStore('settings') (that store is empty — a real bug class: 9 server
  // reads silently saw defaults regardless of what the user configured).
  router.readSettings = readSettings;
  /** settings-prune verify r1: a boot migration may rewrite data/settings.json AFTER something read it into the cache —
   *  server.js drops the cache once they ran, so GET (and the next save) start from what the file now holds. */
  router.reloadSettings = () => {
    // B-225b R12: a re-read REPLACES the copy only with the settings it READ — a read that fails, or bytes that are not the settings,
    // keep the copy in memory (said); a held store is read again by its own hold
    if (settingsHold.held()) return;
    let v;
    try { v = SH.readNow(SETTINGS_FILE, { valid: (x) => !!x && typeof x === 'object' && !Array.isArray(x), what: 'reading the settings again' }); }
    catch (e) { console.warn(`[settings] the settings could not be read again after the migrations — the copy in memory is kept: ${(e && e.message) || e}`); return; }
    if (v === undefined) return;
    _settingsCache = v; _settingsRead = true; try { settingsHold.adoptRead(v); } catch { /* held since: its own ladder reads it */ }   // (the file is THERE now: a start read «missing» no longer makes the next write an exclusive create that meets it)
  };
  router.settingsHeld = () => { if (!_settingsRead) { try { readSettings(); } catch { /* the hold says it */ } } return settingsHold.held(); };   // (asked before any read: the START read first — never «no hold» for settings never read, MUST 1)
  /** lane browser-propose: a SERVER act that writes a setting the user approved — the PATCH route's own merge through the ONE writer (atomic file, `settings-updated` broadcast to every client). */
  router.patchSettings = (patch) => {
    if (!patch || typeof patch !== 'object') throw new Error('patchSettings: expected an object');
    const merged = { ...readSettings(), ...patch };
    for (const [k, v] of Object.entries(merged)) { if (v === null && (!SPEND_CAP_KEYS.has(k) || Object.prototype.hasOwnProperty.call(patch, k))) delete merged[k]; }   // the internal door: a null it CARRIES is the row's DEFAULT (setting-holds' return to an absent «before»); a cap's stored null it does not carry stays
    writeSettings(merged);
    return true;
  };

  router.get('/api/settings', (req, res) => { readSettings(); settingsHold.refuseIfHeld(); res.json(readSettings()); });   // B-225b R2: held ⇒ 503 by name (never the defaults)
  // lane engine-spi-egress L1b (V3): a browser engine's PROGRAM and SITE LIST rows are the owner's — a request carrying a bearer (an
  // agent, a job, an automation key) never writes them, sign-in on or off (src/browser-engines.js ENGINE_OWNER_ROW_RE). r2: ONE
  // verdict for EVERY bearer write road (PATCH, the whole-file POST, a config import's settings section): the file the write would
  // LEAVE against the one stored — a bearer may neither set, change nor drop an engine row (a whole-file POST that simply omits
  // them would erase them); the rows carried verbatim are no change. Nothing is written when it refuses.
  const engineRowsTouched = (req, next) => {
    if (!require('../write-origin.js').pressBearer(req.headers)) return [];
    const RE = require('../browser-engines.js').ENGINE_OWNER_ROW_RE;
    const cur = readSettings() || {}, nxt = next && typeof next === 'object' ? next : {};
    const keys = new Set([...Object.keys(cur), ...Object.keys(nxt)].filter((k) => RE.test(k)));
    return [...keys].filter((k) => Object.hasOwn(cur, k) !== Object.hasOwn(nxt, k) || JSON.stringify(cur[k]) !== JSON.stringify(nxt[k]));
  };
  // the exit check (the owner 2026-11-17): the check address is written by a PERSON only, with its own rules (https only, no login,
  // no private literal — src/browser-exit.js checkUrlVerdict); an agent's refused write says who sets it and where (the recipe)
  const EXIT = require('../browser-exit.js');
  // 主开发 17:04Z: a PERSON's address the verdict refuses is SET ASIDE (the stored one kept) and said in the answer (`refused`, by key) —
  // the rest of the save lands: one refused row never blocks another row's save. An agent's write is refused whole (below).
  const setAsideExitUrl = (req, next) => {
    if (!next || typeof next !== 'object' || require('../write-origin.js').pressBearer(req.headers)) return null;
    const cur = readSettings() || {}, was = cur[EXIT.EXIT_URL_KEY], now = next[EXIT.EXIT_URL_KEY];
    if (JSON.stringify(was) === JSON.stringify(now)) return null;
    const v = EXIT.checkUrlVerdict(now);
    if (v.ok) return null;
    if (was === undefined) delete next[EXIT.EXIT_URL_KEY]; else next[EXIT.EXIT_URL_KEY] = was;
    return { [EXIT.EXIT_URL_KEY]: { code: v.code, error: v.error } };
  };
  const refuseExitUrl = (req, res, next) => {
    const cur = readSettings() || {}, nxt = next && typeof next === 'object' ? next : {};
    const was = cur[EXIT.EXIT_URL_KEY], now = nxt[EXIT.EXIT_URL_KEY];
    if (JSON.stringify(was) === JSON.stringify(now)) return false;
    if (require('../write-origin.js').pressBearer(req.headers)) { res.status(403).json({ error: `${EXIT.EXIT_URL_KEY}: the exit check address is set by a person — in «Check the exit…» on a browser profile, or in Settings › Agent browser; an agent's token cannot set, change or drop it — nothing was written`, code: 'exit_url_owner_only' }); return true; }
    const v = EXIT.checkUrlVerdict(now);
    if (!v.ok) { res.status(400).json({ error: `${EXIT.EXIT_URL_KEY}: ${v.error}`, code: v.code }); return true; }
    return false;
  };
  const refuseEngineRows = (req, res, next) => { if (refuseExitUrl(req, res, next)) return true; const hit = engineRowsTouched(req, next); if (!hit.length) return false; res.status(403).json({ error: `${hit.slice(0, 3).join(', ')}: the program a browser engine runs and the sites it may reach are the owner's to set (Settings, signed in) — a bearer token (an agent, a job, an automation key) cannot set, change or drop them; nothing was written`, code: 'engine_row_owner_only' }); return true; };

  // lane setting-doors pick 0 (主开发 2026-11-14; MEASURED on a scratch hub with sign-in OFF: a conversation's shell wrote the day ceiling
  // by four roads — no header at all, forged browser headers, the whole-file POST, its own token). THE MODEL: the spending ceilings
  // guard against a loop and against an agent that helps itself when it is blocked — accident and eagerness, not a determined
  // adversary. So a spend.* row (the money gate's ceilings, its notice percent, overage turns) changes ONLY from the owner's page,
  // on every write road (PATCH, the whole-file POST, a config import's settings section), sign-in on or off, judged over the file
  // the write would LEAVE (an omitted row = dropped): (a) a request carrying a bearer (an agent, a job, an automation key) is
  // refused by name; (b1) a write with NO browser mark (the strict page verdict: Sec-Fetch-Site same-origin, or an Origin that is
  // this instance's own) is refused too — after it an agent changes a ceiling only by KNOWINGLY dressing its request as the owner's
  // browser, and the refusal it met has told it whose press that is. Nothing is written when it refuses; the refusal names the
  // rule, the row and the row's own link. (A program running as the hub's own user can still edit data/settings.json — it takes
  // effect at the next restart; no route closes that: the box's boundary is the user.)
  // f4 (主开发 11:10Z): every row Settings › Spending draws is the owner's press only — the judge's daily dollar cap joins as ONE row
  const SPEND_OWNER_ROW_RE = /^spend\./, SPEND_OWNER_ROWS = Object.freeze(['plugin.llm.dailyBudgetUsd']);
  const isSpendRow = (k) => SPEND_OWNER_ROW_RE.test(k) || SPEND_OWNER_ROWS.includes(k);
  const spendWriteWhy = (req) => require('../write-origin.js').ownerPageWhy(req);   // null = the owner's page
  const spendRowsTouched = (req, next) => {
    if (!spendWriteWhy(req)) return [];
    const cur = readSettings() || {}, nxt = next && typeof next === 'object' ? next : {};
    // B-0a33 cure 2: a cap's stored null and blank are the SAME «nothing» — a credentialed write that re-sends an old null (now stored
    // blank) changed no row, and is never refused for it
    const nothing = (k, v) => SPEND_CAP_KEYS.has(k) && (v === null || v === '');
    const same = (k) => Object.hasOwn(cur, k) === Object.hasOwn(nxt, k) && (JSON.stringify(cur[k]) === JSON.stringify(nxt[k]) || (nothing(k, cur[k]) && nothing(k, nxt[k])));
    return [...new Set([...Object.keys(cur), ...Object.keys(nxt)])].filter((k) => isSpendRow(k) && !same(k));
  };
  const SPEND_REFUSED_BY = { bearer: 'a request carrying a bearer token (an agent, a job, an automation key)', 'no-browser': 'a request with no mark of the owner\'s page (neither Sec-Fetch-Site nor this instance\'s own Origin)' };
  const refuseSpendRows = (req, res, next) => {
    const hit = spendRowsTouched(req, next); if (!hit.length) return false;
    // f2: the door is a REAL row — the first refused key that is one, else the key is said to be no setting and the limits' first row named
    const rows = [...Object.values(require('../spend-authorizer.js').SPEND_ROW_KEYS), ...SPEND_OWNER_ROWS], row = hit.find((k) => rows.includes(k));
    const why = spendWriteWhy(req), door = `vibespace://settings/${row || rows[0]}`, noRow = row ? '' : ` («${hit[0]}» is no setting)`;
    res.status(403).json({ error: `${hit.slice(0, 3).join(', ')}: the limits on turns nobody typed and the judge's daily dollar cap change only by the owner's press on the owner's own page (Settings › Spending — ${door})${noRow}; ${SPEND_REFUSED_BY[why] || `a request whose page is not this instance's (${why})`} cannot set, change or drop them, sign-in on or off; nothing was written. Ask the owner with vibespace-ask and give that link`, code: 'spend_row_owner_only', why, rows: hit, door });
    return true;
  };

  router.post('/api/settings', (req, res) => {
    readSettings(); settingsHold.refuseIfHeld('this settings change');   // B-225b R1/R2: held ⇒ 503 by name, before any row is judged
    const data = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Expected object' });
    blankCaps(data);   // B-0a33 cure: the Settings page's cleared cap field (null) is stored BLANK — refused and said, never the default
    const refused = setAsideExitUrl(req, data); // the exit check: a person's refused address set aside, said — the rest lands
    if (refuseEngineRows(req, res, data)) return; // lane engine-spi-egress L1b (V3) — r2: the whole file it would leave (an omitted row = dropped)
    if (refuseSpendRows(req, res, data)) return; // lane setting-doors pick 0: the spending rows are the owner's press
    // lane owner-press-attended: the save ECHOES what the server now USES for the spend ceiling — the spend guard reads
    // `budgetLimits(serverSetting)` over this very cache on its next check (a clamp at CAP_MAX included), so the Settings
    // row says the live number, not the typed one; r2: the broadcast carries the same `spend` (writeSettings)
    const out = {}, spend = writeSettings(data, out);
    answerAtLanding(res, { success: true, ...(spend ? { spend } : {}), ...(refused ? { refused } : {}) }, out.landing);
  });

  router.patch('/api/settings', (req, res) => {
    readSettings(); settingsHold.refuseIfHeld('this settings change');   // B-225b R1/R2: held ⇒ 503 by name
    const current = readSettings();
    const patch = req.body;
    if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'Expected object' });
    const merged = { ...current, ...blankCaps({ ...patch }) };   // B-0a33 (3): a cap the patch sets to nothing is stored blank (refused, said)
    for (const [k, v] of Object.entries(merged)) { if (v === null && !SPEND_CAP_KEYS.has(k)) delete merged[k]; }   // the cure: a cap's stored null the patch does not carry is never rewritten nor dropped — a patch of another row touches no spend row
    const refused = setAsideExitUrl(req, merged); // the exit check: a person's refused address set aside, said — the rest lands
    if (refuseEngineRows(req, res, merged)) return; // lane engine-spi-egress L1b (V3) — r2: the file the patch would leave
    if (refuseSpendRows(req, res, merged)) return; // lane setting-doors pick 0: the spending rows are the owner's press
    const out = {}; writeSettings(merged, out);
    answerAtLanding(res, { success: true, ...(refused ? { refused } : {}) }, out.landing);
  });

  // ── Config export / import (whole-instance transfer) ──
  // Non-sensitive sections travel as plaintext JSON; sensitive items
  // (VibeSpace password record, agent CLI credentials) are OPT-IN and always
  // AES-256-GCM-encrypted under a user passphrase (scrypt KDF). The sensitive
  // manifest lives OUTSIDE the ciphertext so the import dialog can list what's
  // inside without the passphrase. Login tokens are never exported.
  const crypto = require('crypto');
  const CLAUDE_CREDS = path.join(os.homedir(), '.claude', '.credentials.json');
  const CODEX_CREDS = path.join(os.homedir(), '.codex', 'auth.json');

  function encryptSensitive(obj, passphrase) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(String(passphrase), salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
    return {
      cipher: 'aes-256-gcm', kdf: 'scrypt',
      salt: salt.toString('base64'), iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64'),
    };
  }

  function decryptSensitive(enc, passphrase) {
    const key = crypto.scryptSync(String(passphrase), Buffer.from(enc.salt, 'base64'), 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(enc.data, 'base64')), decipher.final()]);
    return JSON.parse(out.toString('utf8'));
  }

  const readFileJson = (fp) => { try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return null; } };

  // ── B-225b (cut 5 — R5, R8): THE STORES BY SECTION — each its hold, its own read (a read asks the start's read) and its read again ──
  const STORE_SECTIONS = {
    settings: { hold: settingsHold, read: () => readSettings(), again: (why) => settingsAgain(why) },
    customThemes: { hold: themesHold, read: () => readCustomThemes(), again: (why) => { _customThemesCache = null; let v = {}; try { v = readCustomThemes(); } catch { } storeWord('store-lifted', { file: 'custom-themes.json', why }); broadcast({ type: 'custom-themes-updated', themes: v }); } },
    layouts: { hold: layoutsHold, read: () => readLayouts(), again: (why) => layoutsAgain(why) },
    userState: { hold: userStateHold, read: () => readUserState(), again: (why) => userStateAgain(why) },
    bookmarks: { hold: bookmarksHold, read: () => readBookmarks(), again: (why) => { _bookmarksCache = null; let v = []; try { v = readBookmarks(); } catch { } storeWord('store-lifted', { file: 'bookmarks.json', why }); broadcast({ type: 'bookmarks-updated', bookmarks: v }); } },
  };
  /** the HELD stores among `names` — each asked its read first (a request may be the start's first read) → [{ section, file, kind, code, since, rung }] */
  const heldSections = (names) => {
    const out = [];
    for (const n of names || []) { const st = STORE_SECTIONS[n]; if (!st) continue; try { st.read(); } catch { /* the hold says it */ } const h = st.hold.held(); if (h) out.push({ section: n, ...h }); }
    return out;
  };
  /** R5 — THE DAMAGED DOOR: a person's own WHOLE replace of a store held as `damaged` sets its bytes ASIDE (a dated name) first; the
   *  replace then lands as the store's first write. A bearer (an agent, a job, a key) never replaces a damaged store. → true to go on */
  const damagedReplace = (req, res, section) => {
    const h = STORE_SECTIONS[section].hold.held();
    if (!h || h.kind !== 'damaged') return true;   // not damaged: the door's own refusal (held) or its plain road (read)
    // THE TREE'S ONE VERDICT for a write from the owner's page (src/write-origin.js ownerPageWhy — round wyzvr7567's cure 2): no
    // bearer AND the strict page verdict, so a header-less script is no person either (it would set the person's bytes aside)
    const why = require('../write-origin.js').ownerPageWhy(req);
    if (why) { res.status(403).json({ error: `only the person, on this VibeSpace page, replaces ${h.file} — it could not be read (damaged)`, code: 'store_person_only', why, held: h }); return false; }
    try { const aside = STORE_SECTIONS[section].hold.setAside(); console.warn(`[persistence] ${h.file} was damaged — set aside as ${path.basename(aside)} for a person's whole replace`); }
    catch (e) { res.status(500).json({ error: `${h.file} could not be set aside (${(e && (e.code || e.message)) || e}) — nothing was replaced`, code: 'store_set_aside_failed' }); return false; }
    return true;
  };
  // R7 — THE PAGE'S ONE FACE reads the holds here: the boot and every reconnect (a word said while a page was away never arrives)
  router.get('/api/stores/held', (req, res) => {
    // + B-225b's second half: the stores whose owed write is SAID (past its silent rungs, or a press) — `unsaved`, beside the holds
    res.json({ held: heldSections(Object.keys(STORE_SECTIONS)), unsaved: [...Object.values(STORE_SECTIONS).map((s) => (typeof s.hold.owed === 'function' ? s.hold.owed() : null)).filter((u) => u && u.rung === 'said'), ...(pointsWord() ? [pointsWord()] : [])], stop: stopWord() });   // + B-225b's remainder: the rollback points' episode (in `unsaved`, by its own file name) and the last stop's verdict (`stop`)   // [{ section, file, kind, code, since, rung }] — a page says only those past their silent rungs
  });
  // B-225b's remainder (r1318 (a)): a PERSON notes the last stop's loss — «Understood» on the strip, every page told; a KNOWN loss then
  // rides no further write. Only the person, on this page (the tree's one verdict: an agent's bearer never dismisses the person's notice)
  router.post('/api/stores/layouts.json/stop-noted', async (req, res) => {
    const why = require('../write-origin.js').ownerPageWhy(req);
    if (why) return res.status(403).json({ error: 'only the person, on this VibeSpace page, notes what the last stop lost', code: 'store_person_only', why });
    const was = _stopFact;
    _stopFact = null;
    if (was) { console.log(`[layouts] the last stop's notice (${was.kind}) was noted by the person`); storeWord('store-stop-over', { file: 'layouts.json', why: 'noted' }); }
    // r1595 (b): the note LANDS — a kill after the press never tells it again. r1798 (1): the press is told the truth: the reply waits for
    // that write (within the door's bound); a store held unread, or a write that did not land, answers `recorded: false` (it is told
    // again at the next start — right; the person's page says so)
    let recorded = true;
    if (was && was.kind === 'known') {
      // r2338 (2): _pressSeq is the number the press's own flush takes (++_vsSeq). It is set even when no flush follows (the store held
      // unread, no copy in memory). That is right only because the NEXT flush takes that number, and its bytes, made after the press,
      // carry no unnoted loss: their landing may clear it
      _pressPending = was; _pressSeq = _vsSeq + 1;   // (a refused note's write begins an episode: its mark carries this loss, never this run's time for it)
      recorded = !_layoutsRead || !_layoutsCache ? false : await new Promise((resolve) => { try { flushLayouts({ press: true }, (ok) => resolve(ok === true)); } catch { resolve(false); } });
      if (recorded && _pressPending === was) _pressPending = null;
      if (!recorded) console.warn('[layouts] the person noted the last stop\'s loss, but the note could not be written yet — it is told again at the next start');
    }
    res.json({ success: true, noted: !!was, recorded });
  });
  // the person's choice of an EMPTY store for a damaged one (R5, beside the rollback point and the import): set aside, then read again
  router.post('/api/stores/:file/empty', (req, res) => {
    const section = Object.keys(STORE_SECTIONS).find((k) => path.basename(STORE_SECTIONS[k].hold.file) === String(req.params.file || ''));
    if (!section) return res.status(404).json({ error: 'no such store', code: 'not_found' });
    heldSections([section]);
    const h = STORE_SECTIONS[section].hold.held();
    if (!h || h.kind !== 'damaged') return res.status(409).json({ error: `${req.params.file} is not damaged — only a store that could not be read as itself starts empty here`, code: 'store_not_damaged', ...(h ? { held: h } : {}) });
    if (!damagedReplace(req, res, section)) return;
    STORE_SECTIONS[section].again('set aside — it starts empty');
    res.json({ success: true, file: h.file, empty: true });
  });

  // What's available to export + entry counts for the dialog
  router.get('/api/config/export-info', (req, res) => {
    // B-225b R8: a HELD store's section says it could not be read (`unread`, its hold) — never «0», never the defaults' count
    const heldOf = new Map(heldSections(Object.keys(STORE_SECTIONS)).map((h) => [h.section, h]));
    const unread = (n) => ({ unread: true, held: heldOf.get(n) });
    const settings = heldOf.has('settings') ? {} : readSettings();
    const themes = heldOf.has('customThemes') ? {} : themesOut();
    const layouts = heldOf.has('layouts') ? {} : readLayouts();
    const state = heldOf.has('userState') ? {} : userStateOut();
    const bookmarks = heldOf.has('bookmarks') ? [] : bookmarksOut();
    res.json({
      sections: {
        settings: heldOf.has('settings') ? unread('settings') : { count: Object.keys(settings).length },
        customThemes: heldOf.has('customThemes') ? unread('customThemes') : { count: Object.keys(themes || {}).length },
        layouts: heldOf.has('layouts') ? unread('layouts') : { count: Object.keys(layouts?.layouts || {}).length + (layouts?.autoSave ? 1 : 0), desktops: (layouts?.desktopMeta || []).length },
        userState: heldOf.has('userState') ? unread('userState') : {
          count: Object.keys(state?.customNames || {}).length + Object.keys(state?.starredSessions || {}).length
            + Object.keys(state?.archivedSessions || {}).length + Object.keys(state?.archivedFolders || {}).length
            + Object.keys(state?.sessionGroups || {}).length + Object.keys(state?.sessionConfigs || {}).length,
          groups: Object.keys(state?.sessionGroups || {}).length,
        },
        bookmarks: heldOf.has('bookmarks') ? unread('bookmarks') : { count: (bookmarks || []).length },
        tasks: { count: (getTasks?.()?.list?.() || []).length, ...(getTasks?.()?.unreadState?.() ? { unread: true } : {}) },   // THE STORE HELD UNREAD (lane bl-windows): never «0 groups» for a store that cannot be read
        pricing: (() => {
          if (getUsageHistory?.()?.pricesHeld?.()) return { unread: true };   // r3145 unit 2: the person's prices HELD — never «0 prices»
          const p = getUsageHistory?.()?.pricingTable?.() || {};
          return { count: Object.keys(p.tiers || {}).length + Object.keys(p.accounts || {}).length };
        })(),
      },
      sensitive: {
        vsPassword: !!auth?.enabled && !auth?.signinInInterface,   // the piped form: the record is the interface's (the separation's B3b follow)
        claudeCreds: fs.existsSync(CLAUDE_CREDS),
        codexCreds: fs.existsSync(CODEX_CREDS),
        hosts: (getHosts?.()?.list?.() || []).length, hostsUnread: (getHosts?.()?.held?.() && getHosts().unreadWords()) || null,   // the B-f276 remainder (H15): a held list is no «no hosts»
        mounts: (getMounts?.()?.list?.() || []).length, mountsUnread: (getMounts?.()?.unreadWords?.()) || null,   // B-f276 family unit 1: a held storage list is no «no mounts»
        accounts: (getAccounts?.()?.list?.()?.accounts || []).length,
        secondPassword: (() => { const g = req.app && req.app.locals ? req.app.locals.vaultGate : null; return !!g && g.state() !== 'not_set_up'; })(), // lane vault-contents-window r2: the dialog asks for it
      },
    });
  });

  router.post('/api/config/export', (req, res) => (async () => {   // async (lane vault-contents-window r2: the second password's derive) — a throw still answers 500
    const { sections = [], includeSensitive = [], passphrase, clientPrefs } = req.body || {};
    { const held = Array.isArray(sections) && sections.includes('tasks') ? getTasks?.()?.unreadRefusal?.('a backup of Task Groups') : null; if (held) return res.status(503).json({ error: held, code: 'TASK_GROUPS_UNREAD' }); }   // THE STORE HELD UNREAD (lane bl-windows): never a backup that silently holds no groups
    const secondPassword = req.body ? req.body.secondPassword : undefined;   // lane vault-contents-window r2: taken off the request at once
    if (req.body) delete req.body.secondPassword;
    // the B-f276 remainder (its read r1, N3): a backup asked to carry the machines while hosts.json is HELD would leave them out in silence
    const hostsHeld = includeSensitive.includes('hosts') && getHosts?.()?.unreadWords?.();
    if (hostsHeld) return res.status(503).json({ error: `the export asks for the machines: ${hostsHeld}`, code: 'hosts-unread' });
    // B-f276 family unit 1: …and the storage while mounts.json is HELD (a backup carrying none would read as a person with no storage)
    const storageHeld = includeSensitive.includes('mounts') && getMounts?.()?.unreadWords?.();
    if (storageHeld) return res.status(503).json({ error: `the export asks for the storage: ${storageHeld}`, code: 'storage_unread' });
    // B-225b R8: every named section's hold asked FIRST — a held store refuses the export WHOLE by name (a backup that leaves it out,
    // or carries its defaults, would read as an empty one and be imported over the person's)
    // B-f276's family (主开发 r3145 unit 2): the person's prices HELD — an export naming them is refused WHOLE by name (a backup carrying
    // the defaults would read as the person's prices and be imported over them)
    if (Array.isArray(sections) && sections.includes('pricing') && getUsageHistory?.()?.pricesHeld?.()) return res.status(503).json({ error: `the export asks for the prices: ${getUsageHistory().pricesWords()}`, code: 'prices_unread' });
    { const hs = heldSections(Array.isArray(sections) ? sections : []); if (hs.length) return res.status(503).json({ error: `the export was refused: ${hs.map((h) => h.file).join(', ')} could not be read — nothing was exported`, code: 'store_unread', held: hs }); }
    const file = {
      app: 'vibespace-config', version: 1,
      exportedAt: new Date().toISOString(),
      sections: {},
    };
    const take = (name, fn) => { if (sections.includes(name)) file.sections[name] = fn(); };
    take('settings', readSettings);
    take('customThemes', themesOut);   // B-0248 (c): what LANDED (the three stores the writer writes)
    take('layouts', readLayouts);
    take('userState', () => UO.personKeys(userStateOut()));   // lane sidebar-echo-order: stateRev / stateBatches are the server's, never exported
    take('bookmarks', bookmarksOut);
    take('tasks', () => getTasks?.()?.exportBundle?.() || null);
    take('pricing', () => getUsageHistory?.()?.pricingTable?.() || null);
    if (sections.includes('clientPrefs') && clientPrefs && typeof clientPrefs === 'object') {
      file.sections.clientPrefs = clientPrefs;
    }
    if (includeSensitive.length) {
      if (!passphrase || String(passphrase).length < 4) {
        return res.status(400).json({ error: 'A passphrase (≥4 chars) is required to export sensitive items' });
      }
      // lane vault-contents-window r2 (verify r1): a set-up vault lets credentials leave only with the SECOND PASSWORD at the
      // call (the engine's confirm — the unlock's pace, audited `vault-export-sensitive`); the export's shape is unchanged
      const gate = req.app && req.app.locals ? req.app.locals.vaultGate : null;
      if (gate && gate.state() !== 'not_set_up') {
        const c = await gate.confirm(req, secondPassword, 'vault-export-sensitive');
        if (!c.ok) return res.status(gate.statusOf(c.code)).json({ error: gate.refusalOf(c.code), code: c.code, ...(c.retryInMs ? { retryInMs: c.retryInMs } : {}) });
      } else if (!personOnlyDoor(req, res)) return;   // B-ee0a: NO VAULT — whole credentials leave only to a person on this page
      const sens = {};
      if (includeSensitive.includes('vsPassword')) {
        const rec = auth?.exportPasswordRecord?.();
        if (rec) sens.vsPassword = rec;
      }
      if (includeSensitive.includes('claudeCreds')) {
        const c = readFileJson(CLAUDE_CREDS);
        if (c) sens.claudeCreds = c;
      }
      if (includeSensitive.includes('codexCreds')) {
        const c = readFileJson(CODEX_CREDS);
        if (c) sens.codexCreds = c;
      }
      if (includeSensitive.includes('hosts')) {
        const b = getHosts?.()?.exportBundle?.();
        // lane grants-unify: a machine's two exit lists live in the grants store — they ride the bundle as its rows
        if (b?.hosts?.length) { const lists = getExitProxy?.()?.exportLists?.(b.hosts.map((h) => h.id)); if (Array.isArray(lists)) b.grants = lists; sens.hosts = b; }
      }
      if (includeSensitive.includes('mounts')) {
        const b = getMounts?.()?.exportBundle?.();
        if (b?.mounts?.length || b?.shares?.length || b?.myStorage) sens.mounts = b;
      }
      if (includeSensitive.includes('accounts')) {
        // Named billing accounts: API keys decrypted out of the machine-local
        // store + each subscription's creds-dir files. Plaintext ONLY inside
        // this passphrase-encrypted blob.
        const b = getAccounts?.()?.exportBundle?.();
        if (b?.accounts?.length) sens.accounts = b;
      }
      if (Object.keys(sens).length) {
        file.sensitive = { manifest: Object.keys(sens), ...encryptSensitive(sens, passphrase) };
      }
    }
    const name = `vibespace-config-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.json(file);
  })().catch((e) => { if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) }); }));

  router.post('/api/config/import', (req, res) => {
    const { file, sections: sectionsAsked = [], includeSensitive: sensitiveAsked = [], passphrase } = req.body || {};
    if (!file || file.app !== 'vibespace-config' || typeof file.sections !== 'object') {
      return res.status(400).json({ error: 'Not a VibeSpace config file' });
    }
    // lane engine-spi-egress L1b r3: the section lists read ONCE — a name ⇒ [name], a list of names as it is, anything else refused by
    // name — and every reader below (the bearer's guard, apply(), the sensitive items) reads THIS value: one body shape, one truth
    // (a string `"settings"` passed `.includes('settings')` in apply() while the guard asked Array.isArray and skipped)
    const namesOf = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null);
    const sections = namesOf(sectionsAsked), includeSensitive = namesOf(sensitiveAsked);
    if (!sections || !includeSensitive) return res.status(400).json({ error: `${!sections ? 'sections' : 'includeSensitive'} must be a section name or a list of section names`, code: 'import_sections_invalid' });
    // lane engine-spi-egress L1b r2 (V3): a bearer's import whose settings section would set, change or drop an engine's program / site
    // list row is refused WHOLE — all or nothing: no section of it is applied
    if (sections.includes('settings') && file.sections.settings && typeof file.sections.settings === 'object') blankCaps(file.sections.settings);   // B-0a33 cure: an imported cap of nothing is stored blank too
    if (sections.includes('settings') && file.sections.settings && typeof file.sections.settings === 'object' && refuseEngineRows(req, res, file.sections.settings)) return;
    if (sections.includes('settings') && file.sections.settings && typeof file.sections.settings === 'object' && refuseSpendRows(req, res, file.sections.settings)) return; // lane setting-doors pick 0: all or nothing, as the engine rows
    { const held = sections.includes('tasks') && file.sections.tasks !== undefined ? getTasks?.()?.unreadRefusal?.('an import of Task Groups') : null; if (held) return res.status(503).json({ error: held, code: 'TASK_GROUPS_UNREAD' }); }   // THE STORE HELD UNREAD: refused WHOLE before any section is applied
    { const busy = sections.includes('tasks') && file.sections.tasks !== undefined ? getTasks?.()?.archiveBusy?.() : null; if (busy) { const code = busy.code || 'EVSARCHIVEBUSY'; return res.status(code === 'EVSARCHIVEFAILING' ? 503 : 409).json({ error: String(busy.message || busy), code }); } }   // B-0248 step 3 (c) (r2104): an Activity-log append still on its way past its bound refuses the import WHOLE, before any section is applied
    // B-ee0a (its delta read): an import that brings credentials in is the person's — refused WHOLE before any section is written
    if (includeSensitive.length && file.sensitive && !personOnlyDoor(req, res)) return;
    // B-225b R8 + R5: every named section's hold asked FIRST — a held store that may answer later (unreadable, not allowed) refuses
    // the import WHOLE by name; a DAMAGED one is the person's whole replace: its bytes set aside under a dated name, then the section
    // lands as the store's first write
    const setAsideSaid = []; asideOf.set(req, setAsideSaid);   // (a later throw names them — the wrapper below)
    // r3145 unit 2: an import naming the prices while they are HELD is refused WHOLE before anything is written (no half import; the save
    // would be refused at its turn anyway)
    if ([].concat(sections).includes('pricing') && file.sections.pricing !== undefined && getUsageHistory?.()?.pricesHeld?.()) return res.status(503).json({ error: `the import was refused: ${getUsageHistory().pricesWords()} — nothing was imported`, code: 'prices_unread' });
    { const hs = heldSections([].concat(sections).filter((n) => file.sections[n] !== undefined)), later = hs.filter((h) => h.kind !== 'damaged');   // ([].concat: the list as read, whatever its shape — a copy that reads it two ways still fails by ITS law)
      if (later.length) return res.status(503).json({ error: `the import was refused: ${later.map((h) => h.file).join(', ')} could not be read — nothing was imported`, code: 'store_unread', held: later });
      for (const h of hs) { if (!damagedReplace(req, res, h.section)) return; setAsideSaid.push(h.file); } }
    const applied = [], held = [];   // held: a section a HELD store refused by its code (the page words it in the reader's language)
    // B-0248 (c): the sections this import wrote through the STORE WRITER — every answer below waits for their landing
    // (+ B-0248 (a): the desktops — a person's import is an act: its layouts flushed now and landed, never «imported» on the debounce)
    const layoutsLanding = { file: LAYOUTS_FILE, after: (cb) => flushLayouts({ press: true }, cb) };
    // (+ B-574d unit 1: the accounts section — accounts.json is written by the store writer; the import answers after its landing)
    let accountsLanding = null, accountsUnlanded = null;   // r3977 (1): the accounts section's failed synchronous landing (undone in memory: nothing of it kept)
    const movedOf = () => [['customThemes', themesHold], ['layouts', layoutsLanding], ['userState', userStateHold], ['bookmarks', bookmarksHold]].filter(([n]) => applied.includes(n)).map(([, h]) => h).concat(accountsLanding ? [accountsLanding] : []);
    const apply = (name, fn) => {
      if (!sections.includes(name) || file.sections[name] === undefined) return;
      fn(file.sections[name]);
      applied.push(name);
    };
    apply('settings', (d) => { if (d && typeof d === 'object') writeSettings(d); });
    // B-225b (round wyzvr7567's cure 4): an import that REPLACED damaged settings ended their hold — that IS the lift: the setting
    // holds' owed returns are judged against what was imported and land (or end), the waiting spend is judged again, every page told
    if (setAsideSaid.includes('settings.json')) settingsAgain('a person\'s import replaced the damaged settings', { afterWrite: true });
    apply('customThemes', (d) => { if (d && typeof d === 'object') { writeCustomThemes(d); } });
    apply('layouts', (d) => { if (d && typeof d === 'object') writeLayouts(d); });
    apply('userState', (d) => { if (d && typeof d === 'object') writeUserState(d, { whole: true }); });   // lane sidebar-echo-order r10: a person's import is an ACT at its time — an act made before it, re-sent after, does not land over it
    apply('bookmarks', (d) => { if (Array.isArray(d)) writeBookmarks(d); });   // (every page told at its landing — the hold's onLanded)
    // lane lg-store-writes, the census cure ((b)): the groups not on disk at the bound stop the import before the other stores — said
    try { apply('tasks', (d) => { if (d && typeof d === 'object') getTasks?.()?.importBundle?.(d, { bearer: !!require('../write-origin.js').pressBearer(req.headers) }); }); }   // lane lg-group-parents: a bearer's import brings no lineage
    catch (e) { if (e && e.code === 'EVSNOTONDISK') return afterAll(movedOf(), (bad) => { exitSafe(res); res.status(503).json({ error: e.message, applied, notOnDisk: true, ...(bad.length ? { storesNotOnDisk: bad } : {}) }); }); if (e && (e.code === 'EVSARCHIVEBUSY' || e.code === 'EVSARCHIVEFAILING')) return afterAll(movedOf(), (bad) => { exitSafe(res); res.status(e.code === 'EVSARCHIVEFAILING' ? 503 : 409).json({ error: `${e.code === 'EVSARCHIVEFAILING' ? "the Activity log's archive write keeps failing" : "the Activity log's storage is still writing"} — the Task Groups were not imported${applied.length ? `; already applied: ${applied.join(', ')}` : ''}`, code: e.code, applied, ...(bad.length ? { storesNotOnDisk: bad } : {}) }); }); throw e; }   // (the belt behind the whole refusal above: what was applied is named)   // B-0248 (c): told once the stores written before it landed
    let pricingSkipped = [];
    apply('pricing', (d) => { if (d && typeof d === 'object') { const uh = getUsageHistory?.(); uh?.setPricing?.(d); pricingSkipped = uh?.lastCatalogSkips?.() || []; } });
    // lane cli-update-needs-nothing: a row the export marked as Claude Code's own price is not imported as yours — said here, by key
    if (pricingSkipped.length) { const i = applied.indexOf('pricing'); if (i >= 0) applied[i] = `pricing (not imported as yours — the export marked these as Claude Code's own prices: ${pricingSkipped.slice(0, 20).join(', ')}${pricingSkipped.length > 20 ? ` and ${pricingSkipped.length - 20} more` : ''}; type them in the price editor to keep them)`; }
    // clientPrefs are applied by the CLIENT (localStorage) — echo them back
    const clientPrefs = sections.includes('clientPrefs') ? file.sections.clientPrefs : undefined;
    if (clientPrefs) applied.push('clientPrefs');

    if (includeSensitive.length && file.sensitive) {   // (the person was asked above, before any section was written — B-ee0a)
      let sens;
      try { sens = decryptSensitive(file.sensitive, passphrase); }
      catch { return afterAll(movedOf(), () => { exitSafe(res); res.status(400).json({ error: 'Wrong passphrase (or corrupted file)' }); }); }   // B-0248 (c): after the sections written before it landed
      if (includeSensitive.includes('claudeCreds') && sens.claudeCreds) {
        ensureDir(path.dirname(CLAUDE_CREDS));
        fs.writeFileSync(CLAUDE_CREDS, JSON.stringify(sens.claudeCreds), { mode: 0o600 });
        applied.push('claudeCreds');
      }
      if (includeSensitive.includes('codexCreds') && sens.codexCreds) {
        ensureDir(path.dirname(CODEX_CREDS));
        fs.writeFileSync(CODEX_CREDS, JSON.stringify(sens.codexCreds), { mode: 0o600 });
        applied.push('codexCreds');
      }
      if (includeSensitive.includes('hosts') && sens.hosts) {
        // a passphrase-protected key can't be unlocked unattended — importBundle
        // skips it and says so; `applied` is the user-visible channel (same
        // shape as 'vsPassword: skipped (SSO configured)'), never a silent drop
        const r = getHosts?.()?.importBundle?.(sens.hosts);
        // lane grants-unify: the machines' exit lists → the ONE grants store (the bundle's rows, or an older bundle's
        // records mapped); a refused write is SAID (never a machine silently open to nobody / to more than it was)
        const lists = r && r.skipped ? null : getExitProxy?.()?.importLists?.(sens.hosts, { by: 'import' });   // the B-f276 remainder: no exit lists for machines not imported
        const warn = [...(r?.warnings || []), ...(lists && !lists.ok ? [`who can use the machines was not imported: ${lists.error || lists.code}`] : [])];
        if (r && r.code === 'hosts-unread') held.push(r.code); else applied.push(warn.length ? 'hosts (' + warn.join('; ') + ')' : 'hosts');
      }
      if (includeSensitive.includes('mounts') && sens.mounts) {
        let r = null; try { getMounts?.()?.importBundle?.(sens.mounts); } catch (e) { if (e && e.code === 'storage_unread') r = e; else throw e; }   // B-f276 family unit 1: held — not imported, said
        if (r) held.push(r.code); else applied.push('mounts');
      }
      if (includeSensitive.includes('accounts') && sens.accounts) {
        let r = null, rh = null; try { r = getAccounts?.()?.importBundle?.(sens.accounts); } catch (e) { if (e && e.code === 'accounts_unread') rh = e; else if (e && e.code === 'not-durable') accountsUnlanded = e; else throw e; }   // r3977 (1): a failed landing of the accounts section is SAID (the import goes on; the answer names it and every section applied)   // the B-f276 family (r3129 (3)): held — not imported, said by name
        if (rh) held.push(rh.code); else if (!accountsUnlanded) applied.push(`accounts (${r?.imported ?? 0} imported, ${r?.skipped ?? 0} skipped)`);
        const A0 = rh ? null : getAccounts?.();
        // r3763 required 3: on the writer's OWN answer road (persisted(answer)) — an answer made there goes out inside the exit's flush too
        if (A0 && Number(r?.imported) > 0 && typeof A0.persisted === 'function') accountsLanding = { file: 'accounts.json', after: (cb) => { let said = false; const once = (ok) => { if (said) return; said = true; cb(ok !== false); }; try { const p = A0.persisted(once); if (p && typeof p.then === 'function') p.then(once, () => once(false)); } catch { once(false); } } };
      }
      if (includeSensitive.includes('vsPassword') && sens.vsPassword && auth && auth.signinInInterface) {
        // the piped form (the separation's B3b follow): the sign-in table is the interface's — refused BY NAME, before it could throw
        applied.push('vsPassword: skipped (signin-in-interface: set the password on the sign-in page)');
      } else if (includeSensitive.includes('vsPassword') && sens.vsPassword && auth && auth.ssoEnabled) {
        // SSO configured → a local password is redundant (login goes through
        // the IdP); ignore the imported record instead of silently applying it.
        applied.push('vsPassword: skipped (SSO configured)');
      } else if (includeSensitive.includes('vsPassword') && sens.vsPassword && auth) {
        // enables auth + revokes all tokens; keep THIS caller logged in
        auth.importPasswordRecord(sens.vsPassword);
        const token = auth.issueToken(req.headers['user-agent']);
        const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? ' Secure;' : '';
        res.setHeader('Set-Cookie', `vs_token=${token}; HttpOnly; Path=/; Max-Age=${180 * 24 * 3600}; SameSite=Lax;${secure}`);
        applied.push('vsPassword');
      }
    }
    // B-0248 (c): the import answers once every store it wrote through the writer has LANDED — a section not on disk yet is named (503,
    // kept and written again), never «imported»
    afterAll(movedOf(), (bad) => {
      exitSafe(res);
      if (accountsUnlanded) return res.status(503).json({ error: `the accounts section was not imported: ${accountsUnlanded.message}${bad.length ? `; not on disk yet: ${bad.join(', ')} — kept and written again` : ''}`, code: 'not-durable', applied, notOnDisk: ['accounts.json', ...bad], notImported: ['accounts'] });   // r3977 (1): said by name, with every section that WAS applied
      if (bad.length) return res.status(503).json({ error: `not on disk yet: ${bad.join(', ')} could not be written — the import is kept and written again`, code: 'not-durable', applied, notOnDisk: bad });
      res.json({ success: true, applied, clientPrefs, ...(held.length ? { held } : {}), ...(setAsideSaid.length ? { setAside: setAsideSaid } : {}) });   // held: the sections a held machines list refused; setAside: the damaged stores this import replaced (B-225b)
    });
  });

  // B-225b: EVERY door of the desktops and the custom themes answers a held store BY NAME (503 store_unread) — its handlers wrapped
  // once, here, by path (the conversation list's and the bookmarks' doors say it in their own handlers)
  for (const layer of router.stack) if (layer.route && /^\/api\/(layouts|layouts-active|layouts-autosave|layout-sync|custom-grids|layout-history|custom-themes|settings)(\/|$)/.test(layer.route.path)) for (const l of layer.route.stack) l.handle = guarded(l.handle);
  // B-225b: an import that STOPS after it set a damaged store's bytes aside says so — the person's bytes are under a dated name, kept
  // whole, and the store now starts empty: never a bare failure that leaves them looking for their file
  for (const layer of router.stack) if (layer.route && layer.route.path === '/api/config/import') for (const l of layer.route.stack) {
    const fn = l.handle;
    l.handle = function (req, res, next) {
      try { return fn.call(this, req, res, next); }
      catch (e) {
        const aside = asideOf.get(req) || [];
        if (!aside.length || res.headersSent) throw e;
        res.status((e && e.status) || 500).json({ error: `the import stopped (${(e && (e.code || e.message)) || e}) — ${aside.join(', ')} had been set aside under a dated name first (kept whole, nothing deleted)`, code: (e && e.code) || 'import_failed', setAside: aside });
        return undefined;
      }
    };
  }
  return router;
}

module.exports = { router, setup, wordlessTitles, WORDLESS_TITLES, ringKeep, ringStampMs, ringSeq, ringSort, RING_KEEP, stampedBytes, stampOfRead, stopVerdict, pointUnread, STAMP };
