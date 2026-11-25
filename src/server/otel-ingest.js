'use strict';
// Local OTLP TRUTH receiver (2.361.0, B-345b 终案) — the CLI's built-in
// OpenTelemetry export is the ONLY channel that NAMES the billing org per
// request (JSONL/statusline/rate_limit_event carry values, never identity).
// Local claude sessions get OTEL_* env at spawn (ws-create r6Env) pointing
// here; every `claude_code.api_request` event arrives with organization.id +
// request_id (the ledger's rid) + tokens + cost. Zero vendor calls: the CLI
// pushes to us over loopback (§ban-safety compatible by construction).
//
// The original "why" (kept as the record of a refuted claim, per the
// never-delete-the-record rule): "pool hot-switches do NOT take effect in a
// RUNNING CLI (mtime-gated credential cache re-reads only on new process/
// expiry — forensically ≥25min stale)". That forensic was itself made WITH
// this channel: the ≥25min staleness is how long the CLI keeps REPORTING its
// spawn-time org, not how long it keeps BILLING it. What this module does
// now:
// ── 2026-09-30: THE ORG IS A MACHINE-WIDE LABEL (lane-hot-switch) ──────────
// Measured (scripts/fixtures/claude-cred-read-2.1.281.json): `organization.id`
// is ~/.claude.json's oauthAccount.organizationUuid as the process read it at
// start — the SAME value whichever token the process holds, rewritten machine-
// wide by the next claude process that refetches its own profile (every 24 h).
// Nothing reads it as a member any more: the engine's corroboration, witness
// veto and "observed on X while linked to Y" lines are retired, and the stash
// row's comparison is named for what it is (`labelMatchesSlot`, a coincidence
// metric — it was `agreed`, which read as identity). The requests, tokens and
// cost per rid stay worth keeping; the org on them is the label.
// ── 2026-09-07: THE OBSERVATION IS CORROBORATION, NEVER ATTRIBUTION ────────
// The module's founding premise was "organization.id names the org that
// AUTHORIZED this request". The owner's post-mortem refuted it twice: it is
// the identity the CLI cached in its config dir at SPAWN, and the credential
// file IS re-read on an mtime bump — which is exactly what a pool re-point
// does. 2.369.66 moved BLOCKING off it; this change moves VALUES off it too,
// so the module no longer attributes ANYTHING:
//   ① truthLookup(rid) — REFUTED AND UNWIRED. It overrode the by-time
//      attribution walk at ledger BAKE time with the spawn-time org, so a
//      hot-switched session's spend was booked to the account it started on
//      for the rest of its life. The rid map is kept as a read-only
//      diagnostic (observedOrgForRid) and the seam it fed is deliberately
//      left unwired in server.js; the walk (which reads the slot-transition
//      trail through recordAttribution) is the attribution again.
//   ② corrective attribution records — REFUTED AND REMOVED. They wrote the
//      observed org into attribution.ndjson, i.e. taught every non-rid
//      consumer the same wrong answer permanently. Now the disagreement is
//      COUNTED and LOGGED (noteDisagreement) and nothing else.
//   ③ raw append-only stash (data/usage-history/otel-truth.ndjson) — the
//      observation is still worth keeping, it is simply not the key. WHAT IS
//      KEPT (row B-360d, 主开发 r738): until the migrations' ledger records the
//      ledger backfill as run, the WHOLE file (that migration reads every old
//      row); once recorded, the newest 60 000 known-org lines inside 30 days
//      (~2.4 days at the owner's ~25 000 lines a day) and every unknown-org
//      line inside 30 days — an older request is no longer in it. Each row records the walk's slot beside the label
//      (`labelMatchesSlot` since 2026-09-30; rows before that say `agreed`).
//   ④ observedOrgFor(sid) — the corroboration query — RETIRED 2026-09-30
//      with the engine's corroborateReading(): the label corroborates nothing.
// Auth: loopback remoteAddress + persisted token header (x-vibespace-otel,
// threaded to sessions via OTEL_EXPORTER_OTLP_HEADERS on the PROCESS-ENV
// channel — never argv). The auth.js cookie middleware exempts /otel/* and
// THIS gate is the only door (same pattern as /svc per-mount auth).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sameToken } = require('../pairing-token.js'); // B-8dda: the per-boot header is a secret too
const SR = require('../store-read.js'); // B-f276 family unit 2: the sign-in value's read — not there / unreadable / torn told apart
const { parseOtlpLogs } = require('../otel-truth.js');
const { eachLine } = require('../ndjson-lines.js'); // row B-360d: the spill and the stash read by their lines in bounded reads (one descriptor each)
const { spawnOf } = require('../harnesses'); // the spawn.otelExport row: whose accounts OTel can name

const MAX_TRUTH = 60000;      // in-memory rid map cap — and the stash's kept known lines once the backfill ran: ~2.4 days at the owner's ~25 000 lines a day (r738)
const FILE_MAX = 12 * 1024 * 1024; // boot-time trim threshold for the stash
const KEEP_MS = 30 * 86400e3; // trim horizon
// row B-360d (主开发 r713 / r725 / r738): ONE read of the spill or the stash is at most READ_BYTES (src/ndjson-lines.js — a line
// carried across two reads, a turn after each); the trim's copy is the store writer's, in its own pieces
const READ_BYTES = 4 * 1024 * 1024;
// THE STASH'S OTHER READER: the ledger backfill migration reads EVERY old row (src/ledger-slot-backfill.js readOtelStash, the
// rows the OTel path billed from 2.361.0 to the 2026-09-07 law). Until the migrations' own ledger records it as run, the trim
// keeps the stash WHOLE (r738 Q1: never the 30-day cut before that migration has read its rows)
const BACKFILL_ID = '2026-09-backfill-ledger-by-slot';
const BACKFILL_LAW_MS = Date.UTC(2026, 8, 7);   // the rows it needs were billed before the 2026-09-07 attribution law
// boot-replay slice (lane ci-351-reds, 2026-10-24): a TIME bound — the 20 000-line count (B-1319: ~20 ms here) took 31 ms
// on the measured boot and its first slice rode the listen tick (the read resolves in a poll-phase callback; ONE
// setImmediate from there runs in that same loop iteration). Lines are taken until REPLAY_SLICE_MS of the real clock;
// the next slice is TWO immediates away (past the next timers phase).
const REPLAY_SLICE_MS = 20;
const nextTurn = () => new Promise((r) => setImmediate(() => setImmediate(r)));
const STASH_READ = { readBytes: READ_BYTES, maxLine: READ_BYTES, sliceMs: REPLAY_SLICE_MS, turn: nextTurn };
const spillOf = new WeakMap(); // usage-cpu U4: a waited record → its line in the spill (a side table: the record itself carries no mark)
const W = () => require('../store-writer.js').storeWriter(); // usage-cpu U4: the stash and the spill are written by THE STORE WRITER's thread
const STASH_DURABLE_MS = 4000; // the chain's cure: a post's answer waits at most this for its stash lines; past it «retry» — two waits + the 1 s Retry-After stay inside the exporter's own 10 s

const TOKEN_READ_MS = 60_000; // B-f276 family unit 2: the sign-in value's read again is BOUNDED (the family's READ_MS): past it a read that waits is said
function create({ dataDir, PORT, getUsageHistory, identityGroups, listAccounts, serverSetting, tokenReadMs = TOKEN_READ_MS }) {
  // PERSISTED token (review-caught): dtach/pipe sessions survive server
  // restarts BY DESIGN — a per-boot random token would silently 403 every
  // surviving session's truth stream (precisely the long-lived stale-token
  // sessions this module exists for). Loopback + 0600 file perms gate it.
  const tokenFile = path.join(dataDir, 'usage-history', 'otel-token');
  // B-f276 family unit 2 (主开发 r3175 / r4244, lane bl-loop-a): THE SIGN-IN VALUE UNDER THE STORE-READ LAW. The release read ANY failure
  // of this file as «no value» and MINTED A NEW ONE OVER IT: every surviving session's exporter was refused from then on (its truth
  // stream lost until the session restarts). NOW (src/store-read.js) «not there» mints and writes one (a new instance, as before);
  // «the read failed» HOLDS the file: nothing is written over it; sessions started meanwhile carry THIS LIFE's own value (provisional:
  // in memory, never written over the file), and both are let in; the file is read again OFF the loop by the family's rules (the next
  // try armed first, ONE read in flight, a «not there» right after an unread answer believed only at a second, the read BOUNDED and
  // said as waiting, its late answer judged when it comes). A read that answers lets the file's value in (this life's stays let in);
  // a file not there twice takes this life's value as the file's; TORN bytes (not a value's shape — a verdict about the FILE: a second
  // look agrees; an empty file only on a second rung) are kept aside ONCE (0600, an exclusive name), then this life's value is the
  // file's. Its own small hold (the family's helper reads JSON); a row of the family's held list (tokenRow). The value is never said:
  // not in a log line, a list row or an answer. ITS LIMIT, said: a session started while the file is held keeps this life's value —
  // let in until the hub restarts, refused after it.
  const TOKEN_SHAPE = (v) => typeof v === 'string' && /^[\x21-\x7e]{16,256}$/.test(v);
  const parseToken = (t) => String(t).trim();
  const mintToken = () => crypto.randomBytes(16).toString('hex');
  const tokenLog = (l) => console.warn(`[otel] ${l}`);
  let token = null;        // the FILE's value (null: not known — the file is held)
  let provisional = null;  // this life's own value while the file is held (never written over it; the file's once it lifts as not there or torn)
  let tokenHeld = null;    // { code, since, torn } — the file could not be read (or its bytes are not a value)
  {
    let read;
    try { read = { text: fs.readFileSync(tokenFile, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { parse: parseToken, valid: TOKEN_SHAPE });
    if (a.state === 'data') token = a.value;
    else if (a.state === 'missing') {   // a new instance: minted and written before any session is handed it, as the release
      token = mintToken();
      try { fs.mkdirSync(path.dirname(tokenFile), { recursive: true }); fs.writeFileSync(tokenFile, token, { mode: 0o600 }); } catch { }
    } else {
      provisional = mintToken();
      tokenHeld = { code: a.state === 'corrupt' ? 'torn bytes' : SR.codeOf(a.error), since: Date.now(), torn: a.state === 'corrupt' };
      tokenLog(`otel-token ${a.state === 'corrupt' ? 'is not a sign-in value (torn bytes) — held while they are kept aside' : `could not be read (${tokenHeld.code}) — held: nothing is written over it, it is read again off the main loop`}; sessions started meanwhile carry this run's own value`);
    }
  }
  // THE SIGN-IN VALUE's READ AGAIN (its own small hold, the family's rules)
  let tTries = 0, tTimer = null, tBusy = false, tMissingAt = 0, tWaiting = 0, tWaitSaid = false, tNextAt = 0, tEmptyOnce = false;
  const tLifts = new Set();   // the held list's lift signal
  const SLOW = Symbol('a read past its bound');
  function tokenArm() {
    if (tTimer || !tokenHeld) return;
    const ms = SR.retryDelay(++tTries);
    tNextAt = Date.now() + ms;
    tTimer = setTimeout(() => { tTimer = null; tokenAgain().catch((e) => { tokenLog(`otel-token: a read again failed (${(e && e.message) || e})`); tokenArm(); }); }, ms);
    if (tTimer.unref) tTimer.unref();
  }
  /** ONE read again of the sign-in value, off the loop → true when its hold lifted */
  async function tokenAgain() {
    if (!tokenHeld) return false;
    tokenArm();   // the next try armed FIRST: a try that meets one in flight, a read that hangs, or a read that fails never ends the tries
    if (tBusy) return false;
    tBusy = true;
    const p = fs.promises.readFile(tokenFile).then((buf) => ({ text: buf.toString('utf8'), buf }), (error) => ({ error }));
    let tm = null;
    const first = await Promise.race([p, new Promise((r) => { tm = setTimeout(() => r(SLOW), tokenReadMs); if (tm.unref) tm.unref(); })]);
    clearTimeout(tm);
    if (first !== SLOW) return tokenJudge(first);
    tWaiting = Date.now();
    if (!tWaitSaid) { tWaitSaid = true; tokenLog(`otel-token: a read again has not answered in ${tokenReadMs / 1000} s — its answer is used the moment it comes; no second read starts meanwhile`); }
    p.then((late) => tokenJudge(late)).catch((e) => { tBusy = false; tokenLog(`otel-token: its late answer could not be judged (${(e && e.message) || e})`); });
    return false;
  }
  /** torn is a verdict about the FILE: a second look (its size and its bytes) agrees → the file's bytes, else null (a failed read) */
  async function tokenFileConfirms(buf) {
    try {
      if (!Buffer.isBuffer(buf)) return null;
      const st = await fs.promises.stat(tokenFile);
      if (!st.isFile() || st.size !== buf.length) return null;
      const again = await fs.promises.readFile(tokenFile);
      return again.length === st.size && again.equals(buf) ? again : null;
    } catch { return null; }
  }
  /** the torn bytes kept aside ONCE: 0600 from the first byte, an exclusive name (never over another copy) → its base name, or null */
  async function tokenKeepAside(buf) {
    for (let k = 0; k < 5; k++) {
      const to = `${tokenFile}.corrupt-${Date.now()}${k ? '-' + k : ''}`;
      try { await fs.promises.writeFile(to, buf, { mode: 0o600, flag: 'wx' }); return path.basename(to); }
      catch (e) { if (!e || e.code !== 'EEXIST') { await fs.promises.unlink(to).catch(() => { }); return null; } }   // a part of ours is never left at a copy's name
    }
    return null;
  }
  /** one read's answer (a try's, or a late one's) — lifts the hold, or keeps it; the read's turn ends here */
  async function tokenJudge(r) {
    let lifted = null;   // { value, write } — the file's value from now on
    try {
      tWaiting = 0;
      if (!tokenHeld) return false;
      const a = SR.storeAnswer(r, { parse: parseToken, valid: TOKEN_SHAPE });
      if (a.state === 'unreadable') { tokenHeld.code = SR.codeOf(a.error); tMissingAt = 0; tEmptyOnce = false; return false; }
      if (a.state === 'missing' && !tMissingAt) { tMissingAt = Date.now(); return false; }   // «not there» right after an unread answer: read once more first
      if (a.state === 'data') lifted = { value: a.value, write: false };
      else if (a.state === 'missing') lifted = { value: provisional, write: true };
      else {
        const fileBytes = await tokenFileConfirms(r.buf);
        if (!tokenHeld) return false;
        if (!fileBytes) { tokenHeld.code = 'a read unlike the file'; return false; }
        if (fileBytes.length === 0 && !tEmptyOnce) { tEmptyOnce = true; tokenHeld.code = 'empty, read once more'; return false; }
        const kept = await tokenKeepAside(fileBytes);
        if (!tokenHeld) return false;
        if (!kept) { tokenHeld.code = 'torn bytes, not copied'; return false; }   // the hold stands: the file is their only copy
        tokenHeld.copy = kept;
        lifted = { value: provisional, write: true };
      }
    } finally { if (!lifted) tBusy = false; }
    const was = tokenHeld;
    token = lifted.value; tokenHeld = null; tTries = 0; tMissingAt = 0; tWaitSaid = false; tNextAt = 0; tEmptyOnce = false; tBusy = false;
    if (tTimer) { clearTimeout(tTimer); tTimer = null; }
    if (lifted.write) {   // this life's value becomes the file's — through the store writer, 0600 (sessions started meanwhile already carry it)
      try { W().dirty(tokenFile, { name: 'otel-token.write', rank: 0, mode: 0o600, makeDir: true, produce: () => token }); }
      catch (e) { tokenLog(`otel-token: its value could not be handed to the store writer (${(e && e.message) || e}) — this run keeps it`); }
    }
    tokenLog(`otel-token read again (held since ${new Date(was.since).toISOString()}, ${was.code}): ${lifted.write ? (was.copy ? `its torn bytes kept aside as ${was.copy} — this run's value is the file's now` : 'not there twice — this run\'s value is the file\'s now') : 'the file\'s value is back — sessions started meanwhile keep this run\'s'}`);
    for (const fn of [...tLifts]) { try { fn(); } catch { /* a listener's own */ } }
    return true;
  }
  if (tokenHeld) { if (tokenHeld.torn) Promise.resolve().then(tokenAgain).catch((e) => { tokenLog(`otel-token: a read again failed (${(e && e.message) || e})`); tokenArm(); }); else tokenArm(); }
  /** the sign-in value's hold as the family's held list reads an older hold (src/server/held-lists.js `older`): facts, read again, lift */
  const tokenRow = Object.freeze({
    key: 'otel-token',
    facts: () => (tokenHeld ? { since: tokenHeld.since, next: tNextAt || null } : null),
    readAgain: () => tokenAgain(),
    onLift: (fn) => { if (typeof fn !== 'function') return false; tLifts.add(fn); return true; },
  });
  let gate403 = 0;
  const file = path.join(dataDir, 'usage-history', 'otel-truth.ndjson');
  // usage-cpu U4 — THE SPILL: a post that arrives before the replay ended WAITS for it (its dedupe reads the replayed map), and
  // while it waits its records are on disk HERE (through the store writer, written at once): a hub that stops before the
  // drain finds them at its next boot — the replay ingests them after the stash, by rid (one the drain already stashed is a
  // duplicate: nothing twice). A record leaves the spill once its stash line is on disk.
  const spill = path.join(dataDir, 'usage-history', 'otel-truth.pending.ndjson');
  const spilled = [];   // the JSON lines of the records waiting (or drained, their stash lines not on disk yet)
  const waiting = [];   // {records, seen, resolve} behind the replay, in arrival order
  const produceSpill = () => spilled.join('');
  let spillRead = false; // the last boot's spill is read before this boot writes one (its lines go first)
  const writeSpill = () => { if (spillRead) W().dirty(spill, { name: 'otel-truth-pending.write', produce: produceSpill, rank: 0, allowEmpty: true }); };
  // THE STASH'S APPENDS (usage-cpu U4, the coordinator's note: a mkdirSync + an appendFileSync per post on the main thread): the
  // lines go to the store writer's thread as ONE append per write; a failed append keeps its lines for the next one, which
  // starts on a new line (a torn tail never glues the next row to it — a blank line is skipped by the replay)
  let stashOwed = [], stashWriting = null, stashTorn = false;
  // THE TRIM IS A JOB OF THE STASH'S ONE WRITER (row B-360d, 主开发 r725 a — the release's trim was skipped whenever the file
  // grew during its write or a write was owed: on a busy hub, at every start). Owed at the replay's end, it is the store
  // writer's next job of this file: on the writer's THREAD the kept lines are copied in bounded pieces to a new file, then
  // what was appended after the replay read, then the appends owed with it, and the new file is renamed over the stash
  // (src/store-writer-worker.js rewriteJob) — in order with every append, so «the file grew meanwhile» cannot happen and
  // nothing is skipped. A failed trim leaves the stash whole as it was, said; the appends go on alone. A synchronous flush
  // (the exit) never rewrites the stash: the next start trims.
  // a FAILED trim is not a failing storage (its lines were never written — the job copies, then renames): until the next write
  // lands, a post whose line rode it is answered «retry», never 200 (the adversarial read's finding 1)
  let trimOwed = null, trimWriting = null, trimFailed = false;
  // a write the writer never confirmed (its thread restarted and asked again) is OFFERED AGAIN with what came since — on a new
  // line (a torn tail never glues the next row to it; a line written twice is one rid twice: the replay keeps one)
  const produceStash = (o) => {
    // a trim the writer never confirmed (its thread restarted and asks again): the rename may or may not have landed — said, the
    // re-offered lines go as an append on a new line (a line written twice is one rid twice: the replay keeps one)
    if (trimWriting) { console.warn('[otel] the stash\'s trim was not confirmed (the store writer\'s thread restarted) — the stash is the trimmed file or the old one, whole; the next start trims'); trimWriting = null; }
    const again = stashWriting, batch = (again || []).concat(stashOwed);
    stashOwed = [];
    const trim = trimOwed && !(o && o.sync) ? trimOwed : null;
    if (!batch.length && !trim) { stashWriting = null; return null; }
    stashWriting = batch;
    // the lines' lead: a new line after a torn tail (an append that failed, or a stash whose last line had none) or a re-offered
    // write; a REWRITE ends every kept line with its newline itself — its lines need one only after a re-offered write
    const lead = trim ? again : stashTorn || again;
    const text = batch.length ? (lead ? '\n' : '') + batch.map((x) => x.line).join('') : '';
    if (!trim) return { append: text };
    trimOwed = null; trimWriting = trim;
    return { rewrite: { ranges: trim.ranges, size: trim.size }, then: text, as: 'otel-truth.write' };
  };
  const stashWritten = (ok, err) => {
    const w = stashWriting; let t = trimWriting; stashWriting = null; trimWriting = null;
    // THE REWRITE LANDED, ITS DIRECTORY'S FSYNC DID NOT (主开发 r915 2): the trimmed file is in place and holds this job's lines — told
    // apart from a failed trim (never «stays whole»), its lines never owed again
    if (!ok && t && err && err.code === 'ERENAMEDNOSYNC') { console.warn(`[otel] the stash trimmed by its writer: ${t.size} → ${t.kept} bytes (+ this start's appends) — ${t.what}; but its directory's fsync failed (${err.message || err.code}): a power cut may bring the old file back`); ok = true; t = null; }
    if (t) {
      if (ok) console.log(`[otel] the stash trimmed by its writer: ${t.size} → ${t.kept} bytes (+ this start's appends) — ${t.what}`);
      else { trimFailed = true; console.warn(`[otel] the stash's trim FAILED (${(err && (err.code || err.message)) || 'an error'}) — the stash stays whole as it was; the next start trims it`); }
    }
    if (!w) return;
    if (!ok) { if (!t) stashTorn = true; stashOwed = w.concat(stashOwed); return; }   // a failed REWRITE left the file as it was: no torn tail
    stashTorn = false; trimFailed = false;
    const done = new Set(w.map((x) => x.spill).filter(Boolean));
    if (done.size) { for (let k = spilled.length - 1; k >= 0; k--) if (done.has(spilled[k])) spilled.splice(k, 1); writeSpill(); }
  };
  const stashLine = (line, spillLine) => { stashOwed.push({ line, spill: spillLine || null }); W().dirty(file, { name: 'otel-truth.append', produce: produceStash, onWritten: stashWritten, allowEmpty: true }); };
  const truth = new Map();      // rid → accountId|null (null = machine global login)
  const order = [];             // rid insertion order (cap pruning)
  let unknownOrgs = new Map();  // orgUuid → count (surfaced, never silently dropped)
  // Arrival counters (2.367.1): "did the CLI export at all" is a DIFFERENT
  // question from "did we keep anything", and the CI gate needs to tell them
  // apart — the chat E2E's OTel assertion failed on every GitHub Actions push
  // from 2.361.0 on, and with only a kept-count there was no way to know
  // whether the runner's CLI exported nothing or our parser dropped it.
  const arrivals = { posts: 0, rejected: 0, records: 0, kept: 0, stashed: 0, noRid: 0, noOrg: 0, labelDiffers: 0, events: {} };
  // THE CLI'S OWN LIVENESS WITNESS (lane-dead-bridge): the newest api_request
  // instant per conversation (session.id). Kept for EVERY parsed row — a row
  // with no request id or no org still proves the CLI worked — and read by the
  // dead-bridge watch: a session whose stdout delivered nothing for minutes
  // while its CLI kept calling the API has a dead bridge, not a quiet CLI.
  // Memory only (a restart forgets; the next export refills it); bounded.
  const lastApi = new Map();    // sid → ms
  const LAST_API_CAP = 2000;
  const noteApi = (sid, ts) => {
    if (!sid || !(ts > 0)) return;
    const prev = lastApi.get(sid);
    if (prev != null) { if (ts <= prev) return; lastApi.delete(sid); }
    lastApi.set(sid, ts);
    if (lastApi.size > LAST_API_CAP) lastApi.delete(lastApi.keys().next().value);
  };

  // THE BOOT REPLAY (row B-360d — 主开发 r713 / r725 / r738; before it B-1319, ci-351-reds, usage-cpu U4). The stash IS the
  // persistence of the rid map (a post's dedupe across restarts). On 2026-11-20 the owner's stash was 476 631 564 bytes
  // (1 019 053 lines over 43 days: its trim had not landed since 10-09, the file grew at every start); the release read it
  // into ONE buffer, kept every rid while it replayed and joined the kept lines in ONE turn. Now:
  //   · the spill, then the stash, each through ONE descriptor in bounded reads (src/ndjson-lines.js: READ_BYTES, a line
  //     carried across two reads, a turn after every read and between REPLAY_SLICE_MS slices of lines);
  //   · the map is CAPPED WHILE IT REPLAYS at the cap it has at its first take (MAX_TRUTH: the newest rids by the stash's order);
  //   · THE KEEP RULE follows the file's two readers: until the migrations' own ledger (data/migrations.json, read at the
  //     replay's end) records BACKFILL_ID as run, the stash is kept WHOLE, said once a start. Once it is recorded, a stash
  //     over FILE_MAX keeps the newest MAX_TRUTH known-org lines inside the 30-day horizon (what the map can hold) and every
  //     unknown-org line inside it (the only trace of a request billed to an account this hub does not know); the trim is
  //     owed to the stash's writer (produceStash) when that is not the file as it is;
  //   · a post before the replay ended WAITS for it (its records in the spill meanwhile): nothing answers the map half-replayed.
  const replay = { cutoff: Date.now() - KEEP_MS, done: false };
  let head = 0;   // order[head..] are the rids in the map, oldest first (compacted when the dead prefix reaches MAX_TRUTH)
  const replayRid = (rid, acct) => {
    if (truth.has(rid)) { truth.set(rid, acct); return; }   // a rid written twice keeps its first place, its last account (as remember() does)
    truth.set(rid, acct); order.push(rid);
    if (truth.size > MAX_TRUTH) { truth.delete(order[head++]); if (head >= MAX_TRUTH) { order.splice(0, head); head = 0; } }
  };
  // THE COUNT RULE's lines while it replays, as byte ranges of the file (each with its newline): the newest MAX_TRUTH known
  // ones inside the horizon (a ring) and every unknown-org one inside it (adjacent ones joined)
  let ring = new Float64Array(2 * MAX_TRUTH), unknownAt = [];   // released once the trim is decided
  let ringN = 0, unknownN = 0, oldestKnown = Infinity;
  const onStashLine = (buf, a, nl, at) => {
    const lastEnd = at + (nl - a);
    let r; try { r = JSON.parse(buf.toString('utf8', a, nl)); } catch { return; }
    if (r && r.acctKnown && r.ts > 0 && r.ts < oldestKnown) oldestKnown = r.ts;
    if (!r || !r.rid || (r.ts || 0) < replay.cutoff) return;
    if (r.acctKnown) { replayRid(r.rid, r.acct ?? null); const k = (ringN++ % MAX_TRUTH) * 2; ring[k] = at; ring[k + 1] = lastEnd + 1; return; }
    unknownN++;
    if (unknownAt.length && unknownAt[unknownAt.length - 1] === at) unknownAt[unknownAt.length - 1] = lastEnd + 1; else unknownAt.push(at, lastEnd + 1);
  };
  /** the count rule's kept lines in file order, adjacent ranges joined → {ranges, kept: their bytes} */
  const keptRanges = () => {
    const out = [], n = Math.min(ringN, MAX_TRUTH), first = ringN > MAX_TRUTH ? ringN % MAX_TRUTH : 0;
    let kept = 0, i = 0, j = 0;
    const put = (s, e) => { kept += e - s; if (out.length && out[out.length - 1] === s) out[out.length - 1] = e; else out.push(s, e); };
    while (i < n || j < unknownAt.length) {
      const k = ((first + i) % MAX_TRUTH) * 2;
      if (j >= unknownAt.length || (i < n && ring[k] < unknownAt[j])) { put(ring[k], ring[k + 1]); i++; } else { put(unknownAt[j], unknownAt[j + 1]); j += 2; }
    }
    return { ranges: Float64Array.from(out), kept };
  };
  /** the migrations' own ledger on the backfill → {ran, rows: the stash rows its report says it read (null: no report)} */
  const backfillRan = async () => {
    try {
      const L = JSON.parse(await fs.promises.readFile(path.join(dataDir, 'migrations.json'), 'utf8')), rep = L && L.reports && L.reports[BACKFILL_ID];
      return { ran: !!(L && L.applied && L.applied[BACKFILL_ID]), rows: rep && Number.isFinite(rep.stash) ? rep.stash : null };
    } catch { return { ran: false, rows: null }; }
  };
  /** the stash read to its end (`st`): the trim it owes its writer, by the keep rule */
  const oweTrim = (st, { ran, rows }) => {
    if (st.bytes <= FILE_MAX) return;
    // recorded as run with NO rows over a stash that holds known rows from before the law: the release's reader failed on it (its one
    // string past the runtime's longest) and answered «no stash» — those rows were never read: kept whole (the adversarial read's 6)
    if (ran && rows === 0 && oldestKnown < BACKFILL_LAW_MS) { console.log(`[otel] the stash is kept WHOLE (${st.bytes} bytes): the migration ${BACKFILL_ID} is recorded as run with 0 rows, yet the stash holds known rows from before 2026-09-07 (the oldest of ${new Date(oldestKnown).toISOString()}) — it never read them`); return; }
    if (!ran) { console.log(`[otel] the stash is kept WHOLE (${st.bytes} bytes): the migration ${BACKFILL_ID} is not recorded as run in data/migrations.json — it reads every old row; once it has run, the trim keeps the newest ${MAX_TRUTH} known lines inside 30 days`); return; }
    const { ranges, kept } = keptRanges();
    // A TRIM IS OWED ONLY WHEN IT DROPS AT LEAST WHAT IT KEEPS (主开发 r915 1): the count rule keeps ~28 MB, over FILE_MAX — without
    // this every start after the first trim would rewrite the whole kept stash on the writer's one thread (~100 ms on a fast disk,
    // seconds on a slow data folder, every other store's write behind it); with it a start reads at most about twice the kept set
    if (st.bytes - kept < kept) return;
    trimOwed = { ranges, size: st.bytes, kept, what: `kept the newest ${Math.min(ringN, MAX_TRUTH)} known lines inside 30 days and ${unknownN} unknown-org ones` };
    W().dirty(file, { name: 'otel-truth.write', produce: produceStash, onWritten: stashWritten, allowEmpty: true, urgent: true });   // at once, as the release's own write was (no pace to wait: a start's one rewrite)
  };
  // the posts that waited, in their order, once the map is whole; then the records a stopped hub left in the spill
  let leftover = null;
  const drain = () => {
    if (leftover) { const recs = leftover; leftover = null; try { take(recs, {}); } catch { } }
    while (waiting.length) { const w = waiting.shift(); let out; try { out = take(w.records, w.seen); } catch (e) { out = { kept: 0, disagreements: 0, seen: w.seen }; } w.resolve(out); }
  };
  const replayed = (async () => {
    try { // the records a stopped hub left waiting (U4) — read first: this boot's own spill is written only after
      const recs = [], lines = [], fh = await fs.promises.open(spill, 'r');
      try {
        await eachLine(fh, (buf, a, nl) => { const l = buf.toString('utf8', a, nl); try { const r = JSON.parse(l); if (r && typeof r === 'object') { spillOf.set(r, l + '\n'); recs.push(r); lines.push(l + '\n'); } } catch { } }, STASH_READ);
      } finally { await fh.close().catch((e) => console.warn(`[otel] the waiting posts' file did not close (${e && e.message})`)); }
      if (recs.length) { leftover = recs; const mine = spilled.splice(0); for (const l of lines) spilled.push(l); for (const l of mine) spilled.push(l); }   // its lines go first
      spillRead = true;
    } catch (e) {
      if (e && e.code === 'ENOENT') spillRead = true;
      else console.warn(`[otel] the waiting posts' file could not be read (${e && e.message}) — kept as it is; this boot's waiting posts are taken after the replay but not written beside it`);
    }
    if (spillRead && spilled.length) { writeSpill(); W().durable(spill).catch(() => { }); }
    let st = null, fh = null;
    try { fh = await fs.promises.open(file, 'r'); } catch (e) { if (e.code !== 'ENOENT') console.warn('[otel] truth stash load failed:', e.message); }
    if (fh) {
      try { st = await eachLine(fh, onStashLine, STASH_READ); }
      catch (e) { st = null; console.warn(`[otel] truth stash read failed (${e.message}) — the map holds what was read; the stash is not trimmed this start`); }
      finally { await fh.close().catch((e) => console.warn(`[otel] the stash's descriptor did not close after its replay (${e && e.message})`)); }
    }
    if (head) { order.splice(0, head); head = 0; }
    // a stash whose last byte is not a newline (a torn tail, or a line too long to read), or one whose read failed: the first append
    // starts on a new line, never glued to it
    if (fh && (!st || (st.bytes > 0 && st.last !== 10))) stashTorn = true;
    if (st && st.long) console.warn(`[otel] the stash holds ${st.long} line(s) longer than ${READ_BYTES} bytes — skipped whole (no record of ours is that long), and not kept by a trim`);
    if (st) oweTrim(st, await backfillRan());   // before the drain: the waiting posts' lines ride the trim's own job
    ring = null; unknownAt = null;
    replay.done = true;
    drain();
  })().catch((e) => { // a replay that throws still ends: the waiting posts go on over the map as far as it was read, said once
    console.warn('[otel] truth stash replay failed:', (e && e.message) || e); if (head) { order.splice(0, head); head = 0; } replay.done = true; spillRead = true; drain();
  });

  // organization.id → VibeSpace account id. Prefer a NAMED sub over the
  // '__global__' pseudo-id (survives machine-login switches); email fallback
  // mirrors ingestPassiveUsage's evidence order. Unknown orgs are counted and
  // logged once (the api_retry silent-drop lesson).
  function resolveOrg(orgUuid, email) {
    try {
      const groups = identityGroups?.();
      const g = groups?.get?.('org:' + orgUuid);
      if (g) {
        // '__global__' is a TRUTHY pseudo-id in identity groups (usage-pool-
        // engine pushes the literal string) — it must map to acct null here
        // (review-caught: find(Boolean) picked it, baking atype 'unknown' and
        // writing bogus corrective records for every global-login session).
        const named = (g.accountIds || []).find((id) => id && id !== '__global__');
        return { known: true, acct: named ?? null };
      }
      if (email) {
        // only a harness whose spawns EXPORT OTel (descriptor spawn.otelExport — claude) has accounts OTel can name
        const a = (listAccounts?.() || []).find((x) => spawnOf(x.backend || 'claude').otelExport === true && x.type !== 'pooled'
          && String(x.email || '').toLowerCase() === email);
        if (a) return { known: true, acct: a.id };
      }
    } catch { }
    return { known: false, acct: null };
  }

  // ONE insertion for the replay and every take (row B-360d): the cap held at every insert, the oldest by first insertion out,
  // O(1) — the release spliced the whole 60 000-row order at each new rid past the cap (a 2 000-record drain: ~120 M element
  // moves, one 296 ms turn measured at the replay's end over the placed 480 MB stash)
  function remember(rid, acct) { replayRid(rid, acct); }

  /** One OTLP payload → {kept, disagreements, seen}, or (before the replay ended) a promise of it: the post waits behind the
   *  replay, its records in the spill meanwhile. The liveness witness is noted at arrival either way. */
  function ingest(payload) {
    const { records, seen } = parseOtlpLogs(payload);
    for (const rec of records) noteApi(rec.sid, rec.ts || Date.now());   // the liveness witness first — before any row is dropped for its ledger fields
    if (replay.done) return take(records, seen);
    for (const rec of records) if (rec.rid && rec.orgUuid) { const l = JSON.stringify(rec) + '\n'; spillOf.set(rec, l); spilled.push(l); }
    writeSpill(); W().durable(spill).catch(() => { });
    return new Promise((resolve) => waiting.push({ records, seen, resolve }));
  }
  function take(records, seen) {
    let disagreements = 0;
    for (const rec of records) {
      const spillLine = spillOf.get(rec) || null; spillOf.delete(rec); // a waited record's line in the spill (it leaves once its stash line is on disk)
      // A parsed api_request that carries no request id or no organization.id
      // cannot join the ledger, so it is dropped — but SILENTLY dropping it
      // made a quiet truth channel undiagnosable (2.367.2: CI's personal-OAT
      // identity emits api_request WITHOUT organization.id, and the only
      // symptom was an empty stash).
      if (!rec.rid) { arrivals.noRid++; continue; }
      if (!rec.orgUuid) { arrivals.noOrg++; continue; }
      const dup = truth.has(rec.rid);
      const { known, acct } = resolveOrg(rec.orgUuid, rec.email);
      if (!known) {
        const n = (unknownOrgs.get(rec.orgUuid) || 0) + 1;
        unknownOrgs.set(rec.orgUuid, n);
        if (n === 1) console.warn('[otel] api_request from UNKNOWN org', rec.orgUuid, '(no usage-cache orgUuid / email match — refresh ⟳ once to teach it)');
      } else if (!dup) {
        remember(rec.rid, acct);
      }
      // THE WALK'S SLOT BESIDE THE LABEL (2026-09-07; renamed 2026-09-30). This
      // block once WROTE a corrective attribution record when the label and the
      // walk disagreed, then only logged it. The label is machine-wide, so the
      // "disagreement" was the normal state of every session not on the label's
      // member (84-99 % of rows) — the log line read as proof the process held
      // the wrong account. Now the row just records both, the comparison under
      // a name that says what it is, and one counter (stats().labelDiffers).
      let attributed; // undefined = we could not ask (no ledger / no sid)
      if (known && rec.sid) {
        try {
          const uh = getUsageHistory?.();
          if (uh) {
            const cur = uh.attribAt(rec.sid, rec.ts || Date.now());
            attributed = cur.acct || null;
            if (attributed !== (acct || null)) { disagreements++; if (!dup) arrivals.labelDiffers++; }   // a resent record (a retry after a 503) is the same rid: counted once
          }
        } catch { }
      }
      if (!dup) {
        try {
          stashLine(JSON.stringify({ ...rec, acct: known ? acct : undefined, acctKnown: known,
            ...(attributed !== undefined ? { attributed, labelMatchesSlot: attributed === (acct || null) } : {}) }) + '\n', spillLine);
          arrivals.stashed++;
        } catch { }
        global.__vsMetric?.('otel-truth-req', 1);
      } else if (spillLine) { const k = spilled.indexOf(spillLine); if (k >= 0) { spilled.splice(k, 1); writeSpill(); } } // a duplicate leaves the spill at once
    }
    return { kept: records.length, disagreements, seen };
  }

  // The ONLY gate for /otel/* (cookie middleware exempts the prefix): the
  // exporter runs on THIS machine (we spawned it with a 127.0.0.1 endpoint)
  // and carries the per-boot header token. Both must hold.
  function gate(req) {
    const a = req.socket?.remoteAddress || '';
    const loop = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
    if (loop && token && sameToken(req.headers['x-vibespace-otel'], token)) return true;
    if (loop && provisional && sameToken(req.headers['x-vibespace-otel'], provisional)) return true;   // B-f276 unit 2: this run's own value, the file held when it began
    // A rejected LOOPBACK post is a broken truth stream (stale env after a
    // token file wipe) — say so once instead of dying silently.
    if (loop && ++gate403 === 1) console.warn('[otel] rejecting loopback OTLP posts (token mismatch) — a session is exporting with a stale token');
    global.__vsMetric?.('otel-403', 1);
    return false;
  }

  return {
    // POST /otel/v1/logs — the api_request events ride the LOGS signal.
    // usage-cpu U4: the answer comes once the post's stash lines are on disk (the store writer's thread — the loop never waits),
    // and a post that came before the replay ended waits behind it (its records in the spill meanwhile)
    async logs(req, res) {
      if (!gate(req)) { arrivals.rejected++; return res.status(403).json({ error: 'forbidden' }); }
      arrivals.posts++;
      let out;
      try { out = await ingest(req.body || {}); } catch (e) { return res.status(400).json({ error: e.message }); }
      arrivals.kept += out.kept || 0;
      for (const [k, n] of Object.entries(out.seen || {})) arrivals.events[k] = (arrivals.events[k] || 0) + n;
      // the chain's cure (as if a must): THE STASH IS ON DISK BEFORE ITS ANSWER, as the release had it — a 200 tells the exporter
      // never to send these rows again, and they are the stash's record of the request (the backfill's, before it ran; then the
      // count rule's newest 60 000 known lines — B-360d). The
      // post's lines (and any a failed write still owes: a resend of a post told to retry) go by the store writer's URGENT road —
      // the loop never waits (a promise), the wait bounded (STASH_DURABLE_MS); a write that did not land in time answers 503
      // «retry» (the exporter sends the post again; a known org's rid is never stashed twice — an unknown org's row may be, and its
      // readers skip those rows), never a 200 for rows a kill could still lose. Its cost, said: a post marks the stash URGENT, so a
      // person's act waits behind up to the urgent stores ahead of it (the writer's alternation) while sessions export
      if (stashOwed.length || stashWriting) {
        let onDisk = false, why = null;
        try { onDisk = await W().durable(file, { timeoutMs: STASH_DURABLE_MS }); if (!onDisk) why = W().whyNotDurable(file); } catch { onDisk = false; }   // a writer that cannot be built: a 503, never a hung post
        // its TAKEN verdict: the two bounds side by side — the writer's back-off after a FAILED write is 1, 2, 4 … 60 s (store-pace
        // retryMs), the exporter retries inside its own ~10 s export timeout; from the fifth failure in a row the first outlasts the
        // second. During a FAILING storage a 503 buys nothing: every record of this post is already held (take() put it in the truth
        // map and owed its line to the stash) and its line lands with the writer's retry — answered 200 (a kill inside that outage
        // loses those lines, as the release's failed append did). A QUEUE (the writer healthy, busy) answers 503 «retry».
        if (!onDisk && trimFailed) return res.status(503).set('Retry-After', '1').json({ error: 'the usage truth stash is not on disk yet — send the post again' });   // a failed TRIM is not a failing storage: its lines were never written (B-360d)
        if (!onDisk && !(why && why.why === 'failed')) return res.status(503).set('Retry-After', '1').json({ error: 'the usage truth stash is not on disk yet — send the post again' });
      }
      res.json({ partialSuccess: {} });
    },
    // Metrics/traces are not consumed (exporter set to 'none'), but a tolerant
    // 200 keeps any misconfigured exporter from retry-spamming logs.
    ok(req, res) {
      if (!gate(req)) return res.status(403).json({ error: 'forbidden' });
      res.json({ partialSuccess: {} });
    },
    // Spawn env for LOCAL claude sessions (ws-create r6Env; null = feature
    // off). Logs-only export, 5s flush (beats the 15s scan throttle), token
    // in headers (process-env channel).
    envFor() {
      if (serverSetting?.('usage.otelTruth') === false) return null;
      return {
        CLAUDE_CODE_ENABLE_TELEMETRY: '1',
        OTEL_METRICS_EXPORTER: 'none',
        OTEL_LOGS_EXPORTER: 'otlp',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${PORT}/otel`,
        OTEL_EXPORTER_OTLP_HEADERS: 'x-vibespace-otel=' + (token || provisional),   // the file's value; while the file is held, this run's own (B-f276 unit 2)
        OTEL_LOGS_EXPORT_INTERVAL: '5000',
      };
    },
    /** rid → the OBSERVED (spawn-time) org, or undefined. DIAGNOSTIC ONLY
     *  since 2026-09-07 — deliberately NOT wired into UsageHistory's
     *  setTruthLookup any more (it overrode the by-time attribution walk with
     *  the identity the CLI cached at spawn). Renamed from `truthLookup` so
     *  that a caller re-introducing the old wiring has to say the new name,
     *  and so the source pin in scripts/test-readings-attribution.mjs can
     *  assert nobody passes it to a bake path. */
    async observedOrgForRid(rid) { await replayed; return rid && truth.has(rid) ? truth.get(rid) : undefined; },   // row B-360d: answered once the replay ended — the synchronous road that finished it in the caller's tick (a whole read and parse) is REMOVED
    /** The boot replay off the loop (B-1319; row B-360d): resolves when the stash is read to its end and the waiting posts taken. */
    replayed,
    /** The newest api_request instant (ms) this conversation's CLI exported, or null (lane-dead-bridge's witness). */
    lastApiRequestAt(sid) { return (sid && lastApi.get(sid)) || null; },
    stats() { return { rids: truth.size, unknownOrgs: [...unknownOrgs.entries()], ...arrivals, ...(tokenHeld ? { tokenHeld: { code: tokenHeld.code, since: tokenHeld.since, ...(tWaiting ? { waiting: tWaiting } : {}) } } : {}) }; },   // B-f276 unit 2: the sign-in value held (never its value)
    /** B-f276 family unit 2: the sign-in value's hold as a row of the family's held list, and its read again (a person's press, a suite) */
    tokenRow,
    readTokenAgain: () => tokenAgain(),
    /** All /otel routes + a read-only stats view. The stats endpoint exists so
     *  a test (or a human) can tell "the CLI exported nothing here" from "we
     *  dropped what it sent" — the distinction the CI gate needs. */
    registerRoutes(app) {
      app.post('/otel/v1/logs', this.logs);
      app.post('/otel/v1/metrics', this.ok);
      app.post('/otel/v1/traces', this.ok);
      app.get('/api/otel-stats', (req, res) => res.json(this.stats()));
    },
    _ingest: ingest, // test seam
  };
}

module.exports = { create };
