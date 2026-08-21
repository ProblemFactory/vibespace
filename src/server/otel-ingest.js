'use strict';
// Local OTLP TRUTH receiver (2.361.0, B-345b 终案) — the CLI's built-in
// OpenTelemetry export is the ONLY channel that NAMES the billing org per
// request (JSONL/statusline/rate_limit_event carry values, never identity).
// Local claude sessions get OTEL_* env at spawn (ws-create r6Env) pointing
// here; every `claude_code.api_request` event arrives with organization.id +
// request_id (the ledger's rid) + tokens + cost. Zero vendor calls: the CLI
// pushes to us over loopback (§ban-safety compatible by construction).
//
// Why: pool hot-switches do NOT take effect in a RUNNING CLI (mtime-gated
// credential cache re-reads only on new process/expiry — forensically ≥25min
// stale; 558 mid-session switches / $7.9k post-switch burn in 12 days), so
// link-intent attribution mis-books storm spend in both directions, poisoning
// per-org odometers AND the dead-reckoning learning set (the -30~-49% burst
// under-estimate). This module turns observation into attribution:
//   ① truthLookup(rid) — consumed by UsageHistory.scan at BAKE time, so
//      ledger events get the OBSERVED org, not the configured one;
//   ② corrective attribution records — when the observed org differs from
//      the session's current attribution, recordAttribution({sid, trueAcct})
//      lands so every non-rid consumer (statusline cache routing, billing
//      badges, anchors) converges within one entry;
//   ③ raw append-only stash (data/usage-history/otel-truth.ndjson) — models
//      re-derivable offline forever, same principle as the anchors store.
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
  const lastTruthAcct = new Map(); // sid → last written (truth→walk) pair (dedup)
  let unknownOrgs = new Map();  // orgUuid → count (surfaced, never silently dropped)
  // Arrival counters (2.367.1): "did the CLI export at all" is a DIFFERENT
  // question from "did we keep anything", and the CI gate needs to tell them
  // apart — the chat E2E's OTel assertion failed on every GitHub Actions push
  // from 2.361.0 on, and with only a kept-count there was no way to know
  // whether the runner's CLI exported nothing or our parser dropped it.
  const arrivals = { posts: 0, rejected: 0, records: 0, kept: 0, events: {} };

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
    let corrections = 0;
    for (const rec of records) {
      if (!rec.rid || !rec.orgUuid) continue;
      const dup = truth.has(rec.rid);
      const { known, acct } = resolveOrg(rec.orgUuid, rec.email);
      if (!known) {
        const n = (unknownOrgs.get(rec.orgUuid) || 0) + 1;
        unknownOrgs.set(rec.orgUuid, n);
        if (n === 1) console.warn('[otel] api_request from UNKNOWN org', rec.orgUuid, '(no usage-cache orgUuid / email match — refresh ⟳ once to teach it)');
      } else if (!dup) {
        remember(rec.rid, acct);
      }
      if (!dup) {
        try {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.appendFileSync(file, JSON.stringify({ ...rec, acct: known ? acct : undefined, acctKnown: known }) + '\n');
        } catch { }
        global.__vsMetric?.('otel-truth-req', 1);
      }
      // Corrective attribution: observed org ≠ the session's current
      // attribution → append a truth-driven record so the by-time join
      // (_acctAt) routes everything AFTER this instant correctly. The entry
      // ts is bumped past the sid's newest attribution entry so a late-
      // flushed observation still DOMINATES the walk going forward (an older
      // ts would sit behind the hot-switch link-intent entry and change
      // nothing). The marker is set ONLY on a real write (review-caught:
      // arming it on agreement suppressed the canonical agree→hot-switch→
      // stale sequence — the exact incident this module exists for); after a
      // write the walk itself agrees, so the marker only dedups late
      // out-of-order re-observations of the same acct.
      if (known && rec.sid) {
        try {
          const uh = getUsageHistory?.();
          if (uh) {
            const now = rec.ts || Date.now();
            const cur = uh.attribAt(rec.sid, now);
            // Dedup key = the (truth→walk) TRANSITION pair, not the truth acct
            // alone — an acct-only marker re-suppresses the next hot-switch
            // (truth B written against walk A, later switch to C leaves the
            // stale CLI on B: pair B→C must still write).
            const pair = (acct || '') + '→' + (cur.acct || '');
            if ((cur.acct || null) !== (acct || null) && lastTruthAcct.get(rec.sid) !== pair) {
              uh.recordAttribution({ sid: rec.sid, acct, pool: cur.pool || null, ts: Math.max(now, (cur.lastTs || 0) + 1) });
              lastTruthAcct.set(rec.sid, pair);
              corrections++;
              global.__vsMetric?.('otel-truth-correction', 1);
            }
          }
        } catch { }
      }
    }
    return { kept: records.length, corrections, seen };
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
        if (out.corrections) console.log(`[otel] ${out.corrections} attribution correction(s) from truth stream`);
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
    // rid → accountId|null; undefined = no truth (bake falls back to the
    // attribution walk). Consumed by UsageHistory.scan at bake time.
    truthLookup(rid) { return rid && truth.has(rid) ? truth.get(rid) : undefined; },
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
