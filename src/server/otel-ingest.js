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
const path = require('path');
const crypto = require('crypto');
const { parseOtlpLogs } = require('../otel-truth.js');

const MAX_TRUTH = 60000;      // in-memory rid map cap (~a week of heavy storms)
const FILE_MAX = 12 * 1024 * 1024; // boot-time trim threshold for the stash
const KEEP_MS = 30 * 86400e3; // trim horizon

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
  try {
    if (fs.existsSync(file)) {
      const cutoff = Date.now() - KEEP_MS;
      const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean);
      const kept = [];
      for (const l of lines) {
        try {
          const r = JSON.parse(l);
          if (!r.rid || (r.ts || 0) < cutoff) continue;
          kept.push(l);
          if (r.acctKnown) { truth.set(r.rid, r.acct ?? null); order.push(r.rid); }
        } catch { }
      }
      if (fs.statSync(file).size > FILE_MAX) {
        fs.writeFileSync(file + '.tmp', kept.join('\n') + (kept.length ? '\n' : ''));
        fs.renameSync(file + '.tmp', file);
      }
    }
  } catch (e) { console.warn('[otel] truth stash load failed:', e.message); }

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
        const a = (listAccounts?.() || []).find((x) => x.backend !== 'codex' && x.type !== 'pooled'
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

  function ingest(payload) {
    const { records, seen } = parseOtlpLogs(payload);
    let disagreements = 0;
    for (const rec of records) {
      noteApi(rec.sid, rec.ts || Date.now());   // the liveness witness first — before any row is dropped for its ledger fields
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
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.appendFileSync(file, JSON.stringify({ ...rec, acct: known ? acct : undefined, acctKnown: known,
            ...(attributed !== undefined ? { attributed, labelMatchesSlot: attributed === (acct || null) } : {}) }) + '\n');
          arrivals.stashed++;
        } catch { }
        global.__vsMetric?.('otel-truth-req', 1);
      }
    }
    return { kept: records.length, disagreements, seen };
  }

  // The ONLY gate for /otel/* (cookie middleware exempts the prefix): the
  // exporter runs on THIS machine (we spawned it with a 127.0.0.1 endpoint)
  // and carries the per-boot header token. Both must hold.
  function gate(req) {
    const a = req.socket?.remoteAddress || '';
    const loop = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
    if (loop && req.headers['x-vibespace-otel'] === token) return true;
    // A rejected LOOPBACK post is a broken truth stream (stale env after a
    // token file wipe) — say so once instead of dying silently.
    if (loop && ++gate403 === 1) console.warn('[otel] rejecting loopback OTLP posts (token mismatch) — a session is exporting with a stale token');
    global.__vsMetric?.('otel-403', 1);
    return false;
  }

  return {
    // POST /otel/v1/logs — the api_request events ride the LOGS signal.
    logs(req, res) {
      if (!gate(req)) { arrivals.rejected++; return res.status(403).json({ error: 'forbidden' }); }
      arrivals.posts++;
      try {
        const out = ingest(req.body || {});
        arrivals.kept += out.kept || 0;
        for (const [k, n] of Object.entries(out.seen || {})) arrivals.events[k] = (arrivals.events[k] || 0) + n;
        res.json({ partialSuccess: {} });
      } catch (e) { res.status(400).json({ error: e.message }); }
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
    observedOrgForRid(rid) { return rid && truth.has(rid) ? truth.get(rid) : undefined; },
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
