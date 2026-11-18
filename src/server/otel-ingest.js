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
//   ③ raw append-only stash (data/usage-history/otel-truth.ndjson) — models
//      re-derivable offline forever, same principle as the anchors store.
//      UNCHANGED: the observation is still worth keeping, it is simply not
//      the key. Each row records the walk's slot beside the label
//      (`labelMatchesSlot` since 2026-09-30; rows before that say `agreed`).
//   ④ observedOrgFor(sid) — the corroboration query — RETIRED 2026-09-30
//      with the engine's corroborateReading(): the label corroborates nothing.
// Auth: loopback remoteAddress + persisted token header (x-vibespace-otel,
// threaded to sessions via OTEL_EXPORTER_OTLP_HEADERS on the PROCESS-ENV
// channel — never argv). The auth.js cookie middleware exempts /otel/* and
// THIS gate is the only door (same pattern as /svc per-mount auth).
const fs = require('fs');
const { timedSync } = require('../timed-sync.js'); // PURE: the store-write clock (design 011 lane 1, store-timing)
const path = require('path');
const crypto = require('crypto');
const { sameToken } = require('../pairing-token.js'); // B-8dda: the per-boot header is a secret too
const { parseOtlpLogs } = require('../otel-truth.js');
const { spawnOf } = require('../harnesses'); // the spawn.otelExport row: whose accounts OTel can name

const MAX_TRUTH = 60000;      // in-memory rid map cap (~a week of heavy storms)
const FILE_MAX = 12 * 1024 * 1024; // boot-time trim threshold for the stash
const KEEP_MS = 30 * 86400e3; // trim horizon
// boot-replay slice (lane ci-351-reds, 2026-10-24): a TIME bound — the 20 000-line count (B-1319: ~20 ms here) took 31 ms
// on the measured boot and its first slice rode the listen tick (the read resolves in a poll-phase callback; ONE
// setImmediate from there runs in that same loop iteration). Lines are taken until REPLAY_SLICE_MS of the real clock;
// the next slice is TWO immediates away (past the next timers phase).
const REPLAY_SLICE_MS = 20;
const nextTurn = () => new Promise((r) => setImmediate(() => setImmediate(r)));
const spillOf = new WeakMap(); // usage-cpu U4: a waited record → its line in the spill (a side table: the record itself carries no mark)
const NL = Buffer.from('\n');
const W = () => require('../store-writer.js').storeWriter(); // usage-cpu U4: the stash and the spill are written by THE STORE WRITER's thread

function create({ dataDir, PORT, getUsageHistory, identityGroups, listAccounts, serverSetting }) {
  // PERSISTED token (review-caught): dtach/pipe sessions survive server
  // restarts BY DESIGN — a per-boot random token would silently 403 every
  // surviving session's truth stream (precisely the long-lived stale-token
  // sessions this module exists for). Loopback + 0600 file perms gate it.
  const tokenFile = path.join(dataDir, 'usage-history', 'otel-token');
  let token;
  try { token = fs.readFileSync(tokenFile, 'utf-8').trim(); } catch { }
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    try { fs.mkdirSync(path.dirname(tokenFile), { recursive: true }); fs.writeFileSync(tokenFile, token, { mode: 0o600 }); } catch { }
  }
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
  // a write the writer never confirmed (its thread restarted and asked again) is OFFERED AGAIN with what came since — on a new
  // line (a torn tail never glues the next row to it; a line written twice is one rid twice: the replay keeps one)
  const produceStash = () => {
    const again = stashWriting, batch = (again || []).concat(stashOwed);
    stashOwed = [];
    if (!batch.length) { stashWriting = null; return null; }
    stashWriting = batch;
    return { append: (stashTorn || again ? '\n' : '') + batch.map((x) => x.line).join('') };
  };
  const stashWritten = (ok) => {
    const w = stashWriting; stashWriting = null;
    if (!w) return;
    if (!ok) { stashTorn = true; stashOwed = w.concat(stashOwed); return; }
    stashTorn = false;
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

  // Boot replay: the stash IS the persistence — bake-time overrides must
  // survive restarts or a reboot mid-race re-bakes with link-intent again.
  // OFF THE LOOP SINCE B-1319 (measured 2026-10-13: production's stash is 163 MB — every boot read it, parsed 353 k
  // lines and REWROTE it whole in main-module evaluation, the rewrite firing on size alone with nothing to trim; 0.5 s
  // in a lane on local disk): the bytes come through fs.promises, REPLAY_SLICE_MS slices of lines are taken, the trim rewrite
  // is written off the loop and only when it changes the file. A reader before the replay is done (ingest's dedupe,
  // observedOrgForRid) finishes it in its own tick — the map is never answered half-replayed.
  const replay = { buf: null, at: 0, cutoff: Date.now() - KEEP_MS, kept: [], keptBytes: 0, done: false };
  const replayTake = (untilMs = Infinity) => { // the next lines until the real clock passes `untilMs` (checked every 256); true when the stash is read to its end
    const b = replay.buf;
    for (let n = 0; replay.at < b.length; n++) {
      if ((n & 255) === 255 && performance.now() >= untilMs) break;
      let nl = b.indexOf(10, replay.at); if (nl < 0) nl = b.length;
      const a = replay.at; replay.at = nl + 1;
      if (nl === a) continue;
      try {
        const r = JSON.parse(b.toString('utf8', a, nl));
        if (!r.rid || (r.ts || 0) < replay.cutoff) continue;
        replay.kept.push(a, nl); replay.keptBytes += nl - a + 1;
        if (r.acctKnown) { truth.set(r.rid, r.acct ?? null); order.push(r.rid); }
      } catch { }
    }
    return replay.at >= b.length;
  };
  const replayEnd = () => { // the trim: over FILE_MAX and the kept lines are not the file as it is ⇒ rewrite, off the loop
    replay.done = true;
    const b = replay.buf, kept = replay.kept;
    replay.buf = null; replay.kept = [];
    if (b.length <= FILE_MAX || replay.keptBytes === b.length) return;
    const parts = []; for (let k = 0; k < kept.length; k += 2) parts.push(b.subarray(kept[k], kept[k + 1]), NL);
    fs.promises.writeFile(file + '.tmp', Buffer.concat(parts)).then(() => {
      let grew = true; try { grew = fs.statSync(file).size !== b.length; } catch { }
      if (grew || stashWriting || stashOwed.length) { fs.promises.unlink(file + '.tmp').catch(() => { }); return; } // an export appended meanwhile, or one owed / on the writer's thread (U4): the next boot trims
      timedSync('otel-truth.write', () => fs.renameSync(file + '.tmp', file)); // the same tick as the size check — no append between
    }).catch((e) => console.warn('[otel] truth stash trim failed:', e.message));
  };
  // THE DIAGNOSTIC ROAD ONLY (observedOrgForRid — no hub caller): it finishes the replay in its own tick; a post never does
  // (usage-cpu U4: the first OTLP post of every boot read the whole stash and parsed it on the loop — 4.4 s held)
  const finishReplay = () => {
    if (replay.done) return;
    if (!replay.buf) { try { replay.buf = fs.existsSync(file) ? timedSync('otel-truth.read', () => fs.readFileSync(file)) : Buffer.alloc(0); } catch (e) { replay.buf = Buffer.alloc(0); console.warn('[otel] truth stash load failed:', e.message); } }
    replayTake(); replayEnd(); drain();
  };
  // the posts that waited, in their order, once the map is whole; then the records a stopped hub left in the spill
  let leftover = null;
  const drain = () => {
    if (leftover) { const recs = leftover; leftover = null; try { take(recs, {}); } catch { } }
    while (waiting.length) { const w = waiting.shift(); let out; try { out = take(w.records, w.seen); } catch (e) { out = { kept: 0, disagreements: 0, seen: w.seen }; } w.resolve(out); }
  };
  const replayed = (async () => {
    let b = Buffer.alloc(0);
    try { // the records a stopped hub left waiting (U4) — read first: this boot's own spill is written only after
      const t = await fs.promises.readFile(spill, 'utf8'), recs = [], lines = [];
      for (const l of t.split('\n')) { if (!l) continue; try { const r = JSON.parse(l); spillOf.set(r, l + '\n'); recs.push(r); lines.push(l + '\n'); } catch { } }
      if (recs.length) { leftover = recs; spilled.unshift(...lines); }
      spillRead = true;
    } catch (e) {
      if (e && e.code === 'ENOENT') spillRead = true;
      else console.warn(`[otel] the waiting posts' file could not be read (${e && e.message}) — kept as it is; this boot's waiting posts are taken after the replay but not written beside it`);
    }
    if (spillRead && spilled.length) { writeSpill(); W().durable(spill).catch(() => { }); }
    try { b = await fs.promises.readFile(file); } catch (e) { if (e.code !== 'ENOENT') console.warn('[otel] truth stash load failed:', e.message); }
    if (replay.done) { drain(); return; }
    if (!replay.buf) replay.buf = b;
    await nextTurn();   // never on the tick the read resolved on
    while (!replay.done && !replayTake(performance.now() + REPLAY_SLICE_MS)) await nextTurn();
    if (!replay.done) replayEnd();
    drain();
  })().catch((e) => { // a replay that throws still ends: the waiting posts go on over the map as far as it was read, said once
    console.warn('[otel] truth stash replay failed:', (e && e.message) || e); replay.done = true; replay.buf = null; replay.kept = []; spillRead = true; drain();
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

  function remember(rid, acct) {
    if (truth.has(rid)) { truth.set(rid, acct); return; }
    truth.set(rid, acct);
    order.push(rid);
    if (order.length > MAX_TRUTH) { const drop = order.splice(0, order.length - MAX_TRUTH); for (const r of drop) truth.delete(r); }
  }

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
            if (attributed !== (acct || null)) { disagreements++; arrivals.labelDiffers++; }
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
    if (loop && sameToken(req.headers['x-vibespace-otel'], token)) return true;
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
      // usage-cpu U4 (the second read): the answer goes at once — the post's stash lines are owed to the store writer at ITS pace
      // (a stop writes them; a kill inside the pace loses them, where the release's append was on disk before the answer — said);
      // never an urgent write per post (the writer's one thread is shared with a person's acts), never a ½ s wait per post
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
        OTEL_EXPORTER_OTLP_HEADERS: 'x-vibespace-otel=' + token,
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
    observedOrgForRid(rid) { finishReplay(); return rid && truth.has(rid) ? truth.get(rid) : undefined; },
    /** The boot replay off the loop (B-1319): resolves when the stash is read (by it, or by a reader that finished it). */
    replayed,
    /** The newest api_request instant (ms) this conversation's CLI exported, or null (lane-dead-bridge's witness). */
    lastApiRequestAt(sid) { return (sid && lastApi.get(sid)) || null; },
    stats() { return { rids: truth.size, unknownOrgs: [...unknownOrgs.entries()], ...arrivals }; },
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
