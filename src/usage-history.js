/**
 * UsageHistory — a PERMANENT, append-only ledger of per-request token usage,
 * mined from Claude Code's own JSONL transcripts (the same file for terminal
 * AND chat sessions, so coverage is mode-independent).
 *
 * WHY a separate ledger: the CLI's transcripts get rotated/deleted; this ledger
 * keeps the atomic facts forever so ANY future analysis is just a read. Each
 * line is one API REQUEST (deduped by requestId — a single request appears on
 * 2-3 JSONL records with identical usage; summing raw records double-counts).
 *
 * Incremental: per-file {offset,lastRid} cursor → only new bytes are parsed, so
 * scanning stays O(new data) even across hundreds of MB of history.
 *
 * Attribution: the JSONL basename is the immutable session id; session-meta maps
 * it to account/mode/host. cwd comes from the record itself.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { globalUsageKeyOf } = require('./backend-caps.js'); // PURE: the machine login's ledger key per harness
const { runUsageWalk } = require('./usage-walker.js');
const { timedSync } = require('./timed-sync.js'); // PURE: the store-write clock (design 011 lane 1, store-timing)
const CB = require('./cache-bounds.js'); // PURE: the ledger's hot window + byte ceiling + the cold columns (B-9428)
const { coldRows, readLineAt, readLineAtSync } = require('./usage-cold-walk.js'); // the ledger rows read where they live, verified (B-9428 r2/r3)
const { Worker } = require('worker_threads');
const { trackWorker } = require('./worker-memory.js');

// API-equivalent prices, USD per MILLION tokens. Subscription sessions don't
// actually cost this — it's shown as a reference ("what this would cost on the
// API"). Official Anthropic pricing per platform.claude.com/docs/.../pricing,
// as of 2026-07-09 (researched + cross-verified). Tier matched by substring of
// the model id, LONGEST key first — so every retired generation that a newer
// family key would also match carries its own exact key (Opus 4/4.1/3, Haiku
// 3/3.5, Mythos Preview below): without one it silently borrowed the newer
// generation's price. Editable at data/usage-history/pricing.json.
const DEFAULT_PRICING = {
  // Fable 5 — $10/$50 (2× Opus; Mythos-class). NOTE: Fable uses a newer tokenizer
  // (~30% more tokens per unit of English text), so effective $/word is higher.
  fable:  { input: 10, output: 50, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1.0 },
  // Fable 5.1 / Mythos 5.1 (2026-09): cache HITS are 0.025× base input = $0.25/MTok
  // (every other model is 0.1×). The matcher prefers the LONGEST key, so
  // 'claude-fable-5-1' lands here and 'claude-fable-5' stays on `fable`. On this
  // instance the stale $1 cache-read rate overstated seven days of Fable by 38 %
  // (the main session is cache-heavy) — the owner asked "is Opus really cheaper".
  'fable-5-1': { input: 10, output: 50, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 0.25 },
  // Mythos 5 / Mythos 5.1 (2026-09-22): the installed CLI 2.1.280's catalog prices
  // `claude-mythos-5` at `tier_10_50` and `claude-mythos-5-1` at
  // `tier_10_50_cache_read_0_25` — the SAME two tiers as Fable 5 / Fable 5.1 ($10/$50,
  // cache write 5m $12.5 / 1h $20, cache hit $1 vs $0.25). No key matched either id,
  // so both fell to `_default` ($3/$15 — a Mythos turn priced at under a third of its
  // list cost). Longest key wins: 'claude-mythos-5-1' lands on `mythos-5-1`,
  // 'claude-mythos-5' on `mythos`; the fable ids never contain either key.
  mythos: { input: 10, output: 50, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1.0 },
  // Mythos Preview (Glasswing, deprecated 2026-06-09): $25/$125 per
  // anthropic.com/glasswing (2026-10-02); no cache row is published — the cache
  // rates are the general 1.25× / 2× / 0.1× multipliers. 'mythos' alone priced it at $10/$50.
  'mythos-preview': { input: 25, output: 125, cacheWrite5m: 31.25, cacheWrite1h: 50, cacheRead: 2.5 },
  'mythos-5-1': { input: 10, output: 50, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 0.25 },
  // Opus 5.5 (2026-09-22): the installed CLI 2.1.280's model catalog prices
  // `claude-opus-5-5` at its tier `tier_4_20_cache_read_0_20` = $4/$20, cache
  // write 5m $5 / 1h $8, cache hit $0.20 — and 2.1.280 resolves the `opus` /
  // `opus[1m]` aliases to it. Without this key every Opus 5.5 turn fell to the
  // `opus` row below (+25 % on input/output, 2.5× on cache reads); on the one
  // measured result this row reproduces the CLI's own list cost exactly. Longest
  // key wins, so 'claude-opus-5-5[1m]' lands here while 'claude-opus-5' and
  // 'claude-opus-4-8' stay on `opus`.
  'opus-5-5': { input: 4, output: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2 },
  opus:   { input: 5,  output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },  // Opus 4.5–4.8 and Opus 5 (the catalog's tier_5_25)
  // Opus 4 / 4.1 / 3 (retired except on Bedrock / Google Cloud): $15/$75, the
  // CLI catalog's tier_15_75 for claude-opus-4-0 / -4-1; platform.claude.com
  // pricing 2026-10-02 (Opus 3's 1h write = the 2× rule). 'opus-4-2025' is the
  // dated Opus 4 id (claude-opus-4-20250514 — not claude-opus-4-5-2025…),
  // 'opus-4@' its Vertex spelling. Without them `opus` charged a third.
  'opus-4-1':    { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  'opus-4-0':    { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  'opus-4-2025': { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  'opus-4@':     { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  '3-opus':      { input: 15, output: 75, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5 },
  sonnet: { input: 3,  output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6,  cacheRead: 0.3 },  // Sonnet 4.x
  'sonnet-5': { input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 },  // Sonnet 5: the $2/$10 launch price became the standard price (the 2026-09-01 increase was cancelled)
  haiku:  { input: 1,  output: 5,  cacheWrite5m: 1.25, cacheWrite1h: 2,  cacheRead: 0.1 },
  // Haiku 3.5 = the catalog's haiku_35; Haiku 3 per anthropic.com/news/claude-3-family
  // + the prompt-caching post (its 1h write = the 2× rule). 'haiku' is Haiku 4.5.
  '3-5-haiku': { input: 0.8,  output: 4,    cacheWrite5m: 1,   cacheWrite1h: 1.6, cacheRead: 0.08 },
  '3-haiku':   { input: 0.25, output: 1.25, cacheWrite5m: 0.3, cacheWrite1h: 0.5, cacheRead: 0.03 },
  // OpenAI (codex). Every gpt-* row is judged against the DATED official table
  // in scripts/fixtures/openai-pricing.json (developers.openai.com/api/docs/pricing
  // + each model page, raw HTML fetched 2026-10-03T04:38Z; test-pricing-openai) —
  // the rows below were stale for weeks with nothing red (gpt-6-astra had no row
  // and fell to `_default` = Sonnet's price: ≈$13K under on this instance).
  // cacheRead = the cached-input rate. cacheWrite5m = the "cache writes" column
  // (GPT-5.6 and later bill writes at 1.25× input; 5.5 and older list none);
  // the walker still stores cw 0 for codex — no rollout here has reported one.
  // `long`: a request whose WHOLE prompt (uncached + cached + cache-write input)
  // exceeds `above` tokens is priced at these rates for ALL its tokens (OpenAI:
  // ">272K input tokens … 2x input and 1.5x output for the full request"); the
  // doubled cached rate is printed only for 6-astra / 5.6-sol, elsewhere it is
  // the "2x input" reading. `earlier`: the rates in force BEFORE a dated price
  // change, oldest first — an event older than an entry's `until` takes it.
  // Both are resolved in ONE place (priceAt) and the shape is closed
  // (PRICE_ROW_FIELDS, enforced by test-pricing-openai).
  'gpt-6-astra':   { input: 10,   output: 50,   cacheWrite5m: 12.5,  cacheWrite1h: 0, cacheRead: 1,     long: { above: 272000, input: 20, output: 75, cacheWrite5m: 25, cacheRead: 2 } },
  'gpt-6.1-sol':   { input: 2,    output: 10,   cacheWrite5m: 2.5,   cacheWrite1h: 0, cacheRead: 0.1,   long: { above: 272000, input: 4, output: 15, cacheWrite5m: 5, cacheRead: 0.2 } },
  'gpt-6-luna':    { input: 0.1,  output: 0.5,  cacheWrite5m: 0.125, cacheWrite1h: 0, cacheRead: 0.01,  long: { above: 272000, input: 0.2, output: 0.75, cacheWrite5m: 0.25, cacheRead: 0.02 } },
  // gpt-5.6-sol: the 2026-08-21 cut ($5/$30 → $4/$20, long requests too;
  // community.openai.com/t/…/1391726, posted 2026-08-21T19:41Z "starting
  // today"; promotional "at least through November 21, 2026" per its model
  // page — no end date is modelled, the next change is a new `earlier` entry).
  'gpt-5.6-sol':   { input: 4,    output: 20,   cacheWrite5m: 5,     cacheWrite1h: 0, cacheRead: 0.4,   long: { above: 272000, input: 8, output: 30, cacheWrite5m: 10, cacheRead: 0.8 },
    earlier: [{ until: '2026-08-21', input: 5, output: 30, cacheWrite5m: 6.25, cacheWrite1h: 0, cacheRead: 0.5, long: { above: 272000, input: 10, output: 45, cacheWrite5m: 12.5, cacheRead: 1 } }] },
  'gpt-5.6-terra': { input: 2,    output: 12,   cacheWrite5m: 2.5,   cacheWrite1h: 0, cacheRead: 0.2,   long: { above: 272000, input: 4, output: 18, cacheWrite5m: 5, cacheRead: 0.4 } },
  'gpt-5.6-luna':  { input: 0.2,  output: 1.2,  cacheWrite5m: 0.25,  cacheWrite1h: 0, cacheRead: 0.02,  long: { above: 272000, input: 0.4, output: 1.8, cacheWrite5m: 0.5, cacheRead: 0.04 } },
  'gpt-5.5':       { input: 5,    output: 30,   cacheWrite5m: 0,     cacheWrite1h: 0, cacheRead: 0.5,   long: { above: 272000, input: 10, output: 45, cacheRead: 1 } },
  'gpt-5.4-mini':  { input: 0.75, output: 4.5,  cacheWrite5m: 0,     cacheWrite1h: 0, cacheRead: 0.075 },
  'gpt-5.4':       { input: 2.5,  output: 15,   cacheWrite5m: 0,     cacheWrite1h: 0, cacheRead: 0.25,  long: { above: 272000, input: 5, output: 22.5, cacheRead: 0.5 } },
  'gpt-5.3':       { input: 1.75, output: 14,   cacheWrite5m: 0,     cacheWrite1h: 0, cacheRead: 0.175 },
  // the 2025-10 … 2026-02 codex models (they fell to `_default` = Sonnet's
  // $3/$15). 'gpt-5.1-codex' also covers gpt-5.1-codex-max (same price);
  // 'gpt-5-codex' is not inside 'gpt-5.1-codex' / 'gpt-5.2-codex'.
  'gpt-5.2-codex': { input: 1.75, output: 14,   cacheWrite5m: 0,     cacheWrite1h: 0, cacheRead: 0.175 },
  'gpt-5.1-codex': { input: 1.25, output: 10,   cacheWrite5m: 0,     cacheWrite1h: 0, cacheRead: 0.125 },
  'gpt-5-codex':   { input: 1.25, output: 10,   cacheWrite5m: 0,     cacheWrite1h: 0, cacheRead: 0.125 },
  _default: { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
};

// codex ids already named by _warnUnpriced in this process
const UNPRICED_WARNED = new Set();

// THE CLOSED SHAPE of a price row: the five rates, plus the optional `long`
// block (`above` + any of the rates) and the dated `earlier` list (`until` +
// the rates + its own `long`). Nothing else is read; test-pricing-openai holds
// every shipped row to it.
const RATE_FIELDS = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'];
const PRICE_ROW_FIELDS = { row: [...RATE_FIELDS, 'long', 'earlier'], long: ['above', ...RATE_FIELDS], earlier: ['until', ...RATE_FIELDS, 'long'] };

// The ONE resolver of that shape: the `earlier` entry the instant falls in
// (else the row itself), then its `long` rates when the request's WHOLE prompt
// is over `long.above` — a long block names what changes, the rest carry over.
// `ts` missing (live stdout paths) = now.
function priceAt(row, ts, prompt) {
  let r = row;
  if (Array.isArray(row.earlier) && row.earlier.length) {
    const t = Number.isFinite(ts) ? ts : Date.now();
    for (const e of row.earlier) if (t < Date.parse(e.until)) { r = e; break; }
  }
  const L = r.long;
  if (!L || !(prompt > L.above)) return r;
  return { input: L.input ?? r.input, output: L.output ?? r.output, cacheWrite5m: L.cacheWrite5m ?? r.cacheWrite5m, cacheWrite1h: L.cacheWrite1h ?? r.cacheWrite1h, cacheRead: L.cacheRead ?? r.cacheRead };
}

// Shipped rows a later release corrected. setPricing writes EVERY merged row
// to pricing.json, so on an instance whose owner ever saved the editor these
// rows sit on disk and the fill-missing-keys rule never replaces them. A stored
// row still EQUAL to an old shipped value was never edited — it takes the new
// default; an edited row is left alone.
const SUPERSEDED_DEFAULTS = {
  'gpt-5.6-sol':   [[5, 30, 0, 0, 0.5]],
  'gpt-5.6-terra': [[2.5, 15, 0, 0, 0.25]],
  'gpt-5.6-luna':  [[1, 6, 0, 0, 0.1]],
  'gpt-5.5':       [[5, 30, 0, 0, 0.5]],
  'gpt-5.4':       [[2.5, 15, 0, 0, 0.25]],
};

// THE PER-TICK BYTE BUDGET of the in-process ledger walk (2.369.167, perf
// lane ⑥): the loop is handed back after every MiB of consumed transcript —
// one MiB parses in single-digit ms, so no ws frame / heartbeat / attach waits
// behind a ledger scan again (a 200 MB catch-up used to hold the loop for the
// whole walk).
const SCAN_BUDGET_BYTES = 1024 * 1024;
const PROBE_BYTES = 64; // the append-only proof: the last bytes before a shard's old end (B-9428 r3)
function probeHolds(fp, at, probe) {
  if (!probe || !probe.length) return true;
  let fd; try { fd = fs.openSync(fp, 'r'); } catch { return false; }
  try { const b = Buffer.alloc(probe.length); return fs.readSync(fd, b, 0, b.length, at - probe.length) === b.length && b.equals(probe); } catch { return false; } finally { fs.closeSync(fd); }
}
const COLD_WORKER_HEAP_MB = 1536;
// Fold workers terminated but not exited (blocked in a sync read — the storage is not answering): r4, verify #2.
// Process-wide: while one is stuck no fold worker starts (they would STACK, +40 MB each, nobody told).
const STUCK = new Set(); // the cold fold's worker heap cap: one month of cold lines + the accumulator (B-9428 r2)
// L0 (design 011): how often the walk's writer looks for cursor keys whose
// transcript is gone — one stat per key (~45 ms for production's 37 024 keys,
// measured 2026-10-03), so at most hourly, and on the first walk after boot.
const CURSOR_PRUNE_MS = 3600 * 1000;

class UsageHistory {
  // resolveAccount(acctId) → { type:'subscription'|'api'|'codex-subscription', name, tail } | null
  // Lets the ledger BAKE which account (and its billing TYPE) each request used,
  // so subscription usage (plan quota) and API-key usage (real $) never mix, and
  // the label survives even if the account is later deleted.
  // scanBudgetBytes / scanYield (2.369.167, perf ⑥): the in-process walk
  // yields to `scanYield()` every `scanBudgetBytes` of consumed transcript
  // bytes (default 1 MiB / setImmediate). Injected only by the parity suite,
  // which holds the yield shut to prove no reader sees a half-walked ledger.
  constructor({ dataDir, homeDir = os.homedir(), resolveAccount = () => null,
    scanBudgetBytes = SCAN_BUDGET_BYTES, scanYield = () => new Promise(setImmediate), paused = () => false }) {
    this._scanBudgetBytes = scanBudgetBytes;
    this._scanYield = scanYield;
    // lane fuse-canary-notice (B-b327): `paused(roots)` = the mount-health gate (src/server/mount-health-watch.js) —
    // true while the mount under any of the walk's roots is wedged: a timed scan does not start, a walk in flight stops at
    // its next yield (cursors untouched, nothing appended: the next scan redoes it). A forced scan is never paused.
    this._paused = paused;
    this._scanPromise = null;
    this.dir = path.join(dataDir, 'usage-history');
    this.metaDir = path.join(dataDir, 'session-meta');
    this.projectsDir = path.join(homeDir, '.claude', 'projects');
    this.codexSessionsDir = path.join(process.env.CODEX_HOME || path.join(homeDir, '.codex'), 'sessions');
    this.cursorsFile = path.join(this.dir, '_cursors.json');
    this.pricingFile = path.join(this.dir, 'pricing.json');
    this.attribFile = path.join(this.dir, 'attribution.ndjson');
    this._resolveAccount = resolveAccount;
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch {}
    this._index = null; // the usage index's push (design 011 L1) — attached by its owner, src/server/usage-index.js
    this._cursors = timedSync('usage-cursors.read', () => this._loadCursors());
    // Re-read the cursor map from disk (2.369.85): a one-shot migration that
    // PURGES fixture rows also drops their cursors, but this object was built
    // (and loaded _cursors.json) BEFORE runLocalMigrations() ran, so the first
    // scan() wrote the stale in-memory map straight back over the purged file
    // — the migration is ledger-gated and never ran again (test-litter r3
    // verifier). Same shape as usage-routes' reloadRateLimitCache(): the
    // boot-time consumer re-reads after the repair instead of the repair
    // reaching into a live object.
    this.reloadCursors = () => { this._cursors = timedSync('usage-cursors.read', () => this._loadCursors()); };
    // …and the same for the EVENTS (2026-09-10). `_loadEvents` keeps a byte
    // watermark per shard and only reads the appended tail, so a migration
    // that REWRITES a shard in place (the origin backfill) is invisible to an
    // already-warm cache — and `_evCache.rids` would keep serving the
    // pre-migration objects for the life of the process. Boot re-reads after
    // runLocalMigrations, exactly like reloadCursors.
    this.reloadEvents = () => { this._evCache = null; if (this._index) this._index.recover(); }; // …and the index re-checks its shard marks
    this._pricing = this._loadPricing();
    this._scanning = false;
    this._lastScan = 0;
  }

  // ── Account attribution log (append-only, PERMANENT) ────────────────────────
  // VibeSpace appends {sid, acct, ts} whenever it spawns/resumes a session under
  // a known account + known claudeSessionId. A session RESUMED under a different
  // account is then attributed per-request by TIME (the account active when each
  // request happened), not just the latest — so switching accounts mid-session
  // never mixes the billing. session-meta's current accountId is the fallback.
  // `pool` (optional) tags the POOLED pseudo-account a request was billed
  // THROUGH — acct still holds the pool's REAL target at that time (so per-
  // account and the global sum stay correct with no double-count), pool is an
  // extra dimension so the Usage window can also show the total that flowed
  // through each pool.
  recordAttribution({ sid, acct, pool, ts }) {
    if (!sid) return;
    try { fs.appendFileSync(this.attribFile, JSON.stringify({ sid, acct: acct || null, pool: pool || null, ts: ts || Date.now() }) + '\n'); } catch {}
    this._attrib = null; // invalidate cache
  }
  _attribMap() {
    if (this._attrib) return this._attrib;
    const map = {};
    let data = ''; try { data = fs.readFileSync(this.attribFile, 'utf-8'); } catch {}
    for (const line of data.split('\n')) {
      if (!line) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (!e.sid) continue;
      (map[e.sid] = map[e.sid] || []).push({ ts: e.ts || 0, acct: e.acct || null, pool: e.pool || null });
    }
    for (const sid of Object.keys(map)) map[sid].sort((a, b) => a.ts - b.ts);
    this._attrib = map;
    return map;
  }
  // The account active for session `sid` at time `ts` — latest attribution entry
  // whose ts <= the request, else the meta fallback.
  _acctAt(sid, ts, attrib, metaAcct) {
    const list = attrib[sid];
    if (list && list.length) {
      // A global-login entry legitimately stores acct=null, so track WHETHER an
      // entry matched (found) separately from its value — otherwise a null match
      // followed by a later account switch would fall through to metaAcct and
      // mis-bill a global-login request to the later account.
      let found = false, chosen = null;
      for (const e of list) { if (e.ts <= ts) { found = true; chosen = e.acct; } else break; }
      if (found) return chosen;                 // exact account active at that time (may be null = global)
      // Request predates the first attribution entry. A small grace window
      // covers spawn-ordering skew (first request can land seconds before the
      // meta write). Anything older genuinely happened before this session was
      // ever bound to an account → global. Returning list[0].acct here billed
      // a week of pre-registration usage to a newly added subscription (the
      // initial ledger backfill ran AFTER the account was attached).
      return ts >= list[0].ts - 10 * 60 * 1000 ? list[0].acct : null;
    }
    return this._nonPoolAcct(metaAcct);
  }
  /** A POOLED pseudo-account is NEVER a spender in the account dimension —
   *  server.js states the invariant at the other site that reaches this
   *  decision ("an unresolvable pool target falls to GLOBAL, never to the pool
   *  id itself"), and this fallback is the second one (2026-09-07 r3,
   *  reproduced). session-meta's `accountId` is the SPAWN identity, which for
   *  a pooled session is the pool (ws-create `_accountId = spawnAccount.id`,
   *  and `resolveForSpawn` returns the pool's own id) — so falling back to it
   *  baked `acct:'pool-…', atype:'pooled'` onto ledger events, double-counting
   *  the pool against its own members and putting a thing that cannot hold
   *  credentials in the per-account totals.
   *
   *  Which MEMBER it was is deliberately not guessed here: this fallback only
   *  runs when the conversation has no attribution entry at all, which is
   *  exactly the case the repair could not resolve from the transition ledger
   *  either. Global (acct null) is the honest answer; the `pool` tag the event
   *  already carries keeps the per-pool total correct.
   *
   *  TWO LEGS ON PURPOSE: the injected `resolveAccount` (server.js) reports a
   *  CODEX pool as 'codex-subscription' — it maps `backend === 'codex'` to a
   *  single type before `a.type` is ever read — so the type test alone misses
   *  every codex pool. The id shape is minted in exactly one place
   *  (accounts.createPool, `'pool-' + randomBytes(6).hex`). */
  _nonPoolAcct(acct) { return this._poolIdOf(acct) ? null : (acct || null); }
  /** `acct` when it IS a pooled pseudo-account, else null. */
  _poolIdOf(acct) {
    if (!acct) return null;
    if (/^pool-[0-9a-f]{6,}$/i.test(String(acct))) return acct;
    try { if (this._resolveAccount && this._resolveAccount(acct)?.type === 'pooled') return acct; } catch { }
    return null;
  }
  // The POOLED pseudo-account (if any) active for session `sid` at time `ts` —
  // same by-time walk as _acctAt but returns the pool tag. Baked onto events so
  // the Usage window can show per-pool totals without a second attribution pass.
  _poolAt(sid, ts, attrib) {
    const list = attrib[sid];
    if (!list || !list.length) return null;
    let found = false, chosen = null;
    for (const e of list) { if (e.ts <= ts) { found = true; chosen = e.pool || null; } else break; }
    if (found) return chosen;
    return ts >= list[0].ts - 10 * 60 * 1000 ? (list[0].pool || null) : null;
  }

  // Public attribution view for one instant (OTel truth ingest compares the
  // observed org against this before writing a corrective record).
  attribAt(sid, ts) {
    const attrib = this._attribMap();
    const list = attrib[sid];
    return {
      acct: this._acctAt(sid, ts, attrib, null),
      pool: this._poolAt(sid, ts, attrib),
      // newest entry ts for the sid — corrective truth records bump past it
      // so a late-flushed observation still dominates the walk going forward
      lastTs: list && list.length ? list[list.length - 1].ts : 0,
    };
  }
  // Per-request identity override for the bake (2.361.0, B-345b): fn(rid) →
  // accountId|null (null = machine global login) | undefined (no answer →
  // fall back to the attribution walk).
  // NOTHING IS WIRED HERE since 2026-09-07 (server.js says why at the former
  // call site): the only source we ever had — OTel `organization.id` — names
  // the identity the CLI cached at SPAWN, not the token that authorized the
  // request, so the override booked a hot-switched session's spend to the
  // account it started on forever. The seam survives because a real
  // per-request identity channel would be strictly better than the walk; it
  // must arrive with evidence that it names the AUTHORIZING identity.
  setTruthLookup(fn) { this._truthLookup = typeof fn === 'function' ? fn : null; }

  _loadJson(f, fallback) { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return fallback; } }
  // Pricing schema v2: { version, tiers:{opus,sonnet,haiku,fable,_default}, accounts:{ <id>: {discount} | {tiers:{...}} } }.
  // Subscriptions use the default tiers (the "API-equivalent" reference). API-key
  // accounts can carry a per-account DISCOUNT (negotiated rate) or a full tier
  // override — because different keys really do bill at different rates.
  _loadPricing() {
    let p = this._loadJson(this.pricingFile, null);
    if (!p) {
      p = { version: 2, tiers: DEFAULT_PRICING, accounts: {} };
      // atomic like every other pricing write — a crash mid-write tears the
      // file and the next boot's _loadJson fallback silently recreates
      // defaults over user-edited rates
      try { this._writeAtomic(this.pricingFile, JSON.stringify(p, null, 2)); } catch {}
    } else if (!p.tiers) {
      // migrate the old FLAT {opus:{...},...} file to v2 in place
      p = { version: 2, tiers: p, accounts: {} };
      try { this._writeAtomic(this.pricingFile, JSON.stringify(p, null, 2)); } catch {}
    }
    if (!p.accounts) p.accounts = {};
    if (!p.tiers) p.tiers = DEFAULT_PRICING;
    // Newly-shipped default tiers (e.g. the gpt-* family) fill into an existing
    // on-disk pricing.json without clobbering the user's edited values.
    for (const [k, v] of Object.entries(DEFAULT_PRICING)) if (!p.tiers[k]) p.tiers[k] = v;
    for (const [k, olds] of Object.entries(SUPERSEDED_DEFAULTS)) {
      const row = p.tiers[k];
      if (row && !row.long && !row.earlier && olds.some((o) => RATE_FIELDS.every((f, j) => row[f] === o[j]))) p.tiers[k] = DEFAULT_PRICING[k];
    }
    return p;
  }
  _writeAtomic(f, data) { const t = f + '.tmp'; fs.writeFileSync(t, data); fs.renameSync(t, f); }
  _shardFor(ts) { const d = new Date(ts); return path.join(this.dir, `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`); }

  // Build claudeSessionId → {acct, mode, host, backend, name} from session-meta.
  // TTL-cached: data/ can live on network storage (real deployment: a FUSE NFS
  // mount where every readFileSync is a ~40ms round trip — 66 meta files took
  // 2.7s PER SCAN). Meta only affects labels/attribution of NEW events, so up
  // to 60s staleness is invisible.
  _metaMap() {
    if (this._metaMapCache && Date.now() - this._metaMapCache.at < 60000) return this._metaMapCache.map;
    const map = {};
    let files = [];
    try { files = fs.readdirSync(this.metaDir); } catch {}
    for (const fn of files) {
      if (!fn.endsWith('.json')) continue;
      let m; try { m = JSON.parse(fs.readFileSync(path.join(this.metaDir, fn), 'utf-8')); } catch { continue; }
      const sid = m.claudeSessionId || m.backendSessionId;
      if (!sid) continue;
      map[sid] = { acct: m.accountId || m._accountId || null, mode: m.mode || null, host: m.host || null, backend: m.backend || 'claude', name: m.name || null };
    }
    this._metaMapCache = { at: Date.now(), map };
    return map;
  }

  // Incrementally scan every transcript (Claude JSONLs + Codex rollouts),
  // appending new per-request events.
  // One-time repair of events baked with the old _acctAt fallback (which
  // attributed pre-binding history to the account's first attribution entry).
  // Only events whose sid HAS attribution entries are recomputed — for sids
  // without any, the baked value is the only record we have, leave it.
  // …UNLESS the readings repair EMPTIED that sid (2026-09-07 r2): when the
  // migration archives every attribution entry of a conversation, the baked
  // value is no longer "the only record we have", it is the record the
  // refuted rule wrote — and the sid is now missing from the map, so the
  // guard above would preserve it forever. reading-repair names those sids in
  // .attrib-emptied.json; for them `_acctAt` falls through to the session-meta
  // account, which is the un-refuted fallback the archive was meant to expose.
  _emptiedAttribSids() {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(this.dir, '.attrib-emptied.json'), 'utf-8'));
      return new Set(Array.isArray(raw) ? raw : []);
    } catch { return new Set(); }
  }
  _maybeRebakeAttribution() {
    const marker = path.join(this.dir, '.attrib-rebake-v1');
    try { if (fs.existsSync(marker)) return; } catch {}
    const attrib = this._attribMap();
    const emptied = this._emptiedAttribSids();
    const meta = this._metaMap();
    let shards = [];
    try { shards = fs.readdirSync(this.dir).filter((f) => /^events-\d{4}-\d{2}\.ndjson$/.test(f)); } catch {}
    let changed = 0;
    for (const fn of shards) {
      const fp = path.join(this.dir, fn);
      let data = ''; try { data = fs.readFileSync(fp, 'utf-8'); } catch { continue; }
      const out = [];
      let dirty = false;
      for (const line of data.split('\n')) {
        if (!line) continue;
        let e; try { e = JSON.parse(line); } catch { out.push(line); continue; }
        // A row the ledger-by-slot backfill re-keyed (B-f69c) is PROVEN by the
        // slot record that names it — possibly the transition ledger, which this
        // walk cannot read — so no re-bake generation may re-derive it.
        if (e.sid && !e.slotRekeyedBy && (attrib[e.sid] || emptied.has(e.sid))) {
          const acct = this._acctAt(e.sid, e.ts, attrib, meta[e.sid]?.acct);
          // remote-host events (atype 'host') are attributed at ingest — the
          // LOCAL attribution log knows nothing about remote sids and would
          // silently re-bucket them to global here (2.127.0)
          if (e.atype !== 'host' && (acct || null) !== (e.acct || null)) {
            const ainfo = acct ? (this._resolveAccount(acct) || null) : null;
            e.acct = acct || null;
            e.atype = ainfo ? ainfo.type : (acct ? 'unknown' : 'global');
            e.aname = ainfo ? (ainfo.name || null) : null;
            dirty = true; changed++;
            out.push(JSON.stringify(e));
            continue;
          }
        }
        out.push(line);
      }
      if (dirty) this._writeAtomic(fp, out.join('\n') + '\n');
    }
    if (changed) { this._evCache = null; if (this._index) this._index.recover(); } // sizes may match — force a clean reload (the index re-checks its marks)
    try { fs.writeFileSync(marker, JSON.stringify({ at: Date.now(), changed })); } catch {}
    if (changed) console.log(`[usage-history] re-attributed ${changed} events (pre-binding history → global)`);
  }

  /** ONE LOGICAL WALK, YIELDING (2.369.167, perf ⑥). Throttled (15 s) or
   *  already in flight ⇒ the SYNC `{skipped: true}` answer, exactly as before.
   *  Otherwise the walk runs as the walker's budgeted yielding form (the loop
   *  is handed back every `scanBudgetBytes`) and scan() returns its PROMISE of
   *  `{added, filesTouched}` — which is also what `scanSettled()` answers until
   *  the next scan starts. NO HALF LEDGER: nothing of a walk is visible before
   *  it settles — events are buffered and appended to the shards once, at the
   *  end, beside the cursor write — and a reader that must see the freshest
   *  ledger (the /api/usage-stats route, the pool odometer, the popup's rid
   *  lookups) calls scan() then AWAITS scanSettled(). The promise never
   *  rejects: a failed walk logs and answers `{added: 0, filesTouched: 0, error}`. */
  scan(force = false) {
    if (this._scanning) return { skipped: true };
    try { this._maybeRebakeAttribution(); } catch (e) { console.error('[usage-history] rebake failed:', e.message); }
    // The Usage window fires a request per filter/range change — each used to
    // redo the full transcript stat-sweep (+ meta/attrib reload). Throttle:
    // new events land at most ~15s late; the 3-min background rescan and the
    // in-memory event cache (below) make requests read-only in the common case.
    if (!force && this._lastScanAt && Date.now() - this._lastScanAt < 15000) return { skipped: true };
    if (!force && this._pausedNow()) return { skipped: true, paused: true };
    this._scanForced = !!force;
    this._lastScanAt = Date.now();
    this._scanning = true;
    this._scanPromise = this._walkAndAppend();
    return this._scanPromise;
  }

  /** The promise of the scan in flight, or of the last one (a reader awaits it
   *  before answering from the ledger — never a half-walked answer). */
  scanSettled() { return this._scanPromise || Promise.resolve({ added: 0, filesTouched: 0 }); }
  _pausedNow() { try { return !!this._paused([this.projectsDir, this.codexSessionsDir, this.dir]); } catch { return false; } }

  async _walkAndAppend() {
    let added = 0, filesTouched = 0;
    try {
      const meta = this._metaMap();
      this._lastMetaMap = meta; // reused by aggregate() for session-name labels
      const attrib = this._attribMap();
      const shardBuffers = {}; // shardPath → [lines]
      const push = (ev) => {
        const shard = this._shardFor(ev.ts);
        (shardBuffers[shard] = shardBuffers[shard] || []).push(JSON.stringify(ev));
        added++;
      };
      // ── ONE WALK (2.297.0, the twin-killer): the local ledger walk IS
      // src/usage-walker.js — the SAME module the device daemon runs for
      // remote machines (`usage-scan` op) and the shipped scanner mirrors for
      // checkout-less ssh hosts. Local invokes it IN-PROCESS with its own
      // cursor store injected (CS principle 2: shared implementation, not
      // mandatory socket transit). Enrichment (attribution / meta / pool /
      // account type) happens HERE because only the orchestrator holds those
      // maps — the walker stays a pure per-machine fact collector. Rotation
      // reset, byte cursors, subagent/workflow coverage, codex rollouts and
      // the rid/mid join fields are all the walker's single implementation
      // now; scripts/test-usage-walk-parity.mjs pins it against the shipped
      // scanner (the one remaining, documented copy).
      const cursorsAtStart = this._cursors;
      const walk = await runUsageWalk({
        projectsDir: this.projectsDir,
        codexSessionsDir: this.codexSessionsDir,
        cursors: cursorsAtStart,
        // the per-tick byte budget: the walk hands the loop back every MiB
        budgetBytes: this._scanBudgetBytes,
        onBudget: async () => { await this._scanYield(); if (!this._scanForced && this._pausedNow()) throw Object.assign(new Error('paused'), { paused: true }); },
        onEvent: (ev) => {
          const minfo = meta[ev.sid] || {};
          // A per-request identity override, when one is wired (see
          // setTruthLookup — nothing is, since 2026-09-07). The WALK is the
          // attribution: it resolves the credential link at record time and
          // every re-point of that link is recorded in
          // data/slot-transitions.jsonl. undefined = no override → walk.
          const tr = this._truthLookup ? this._truthLookup(ev.rid) : undefined;
          const acct = tr !== undefined ? tr : this._acctAt(ev.sid, ev.ts, attrib, minfo.acct);
          // `_nonPoolAcct` drops a pool id out of the ACCOUNT dimension; the
          // spend still flowed THROUGH that pool, so keep the tag rather than
          // losing it from the per-pool total (the walk has no attribution
          // entry to get it from — that is the same case).
          const pool = this._poolAt(ev.sid, ev.ts, attrib) || this._poolIdOf(minfo.acct);
          const ainfo = acct ? (this._resolveAccount(acct) || null) : null;
          push({
            rid: ev.rid,
            mid: ev.mid, // message.id join field (2.267.3, the est-2× incident)
            ts: ev.ts, sid: ev.sid,
            be: ev.be === 'codex' ? 'codex' : (minfo.backend || 'claude'),
            model: ev.model,
            effort: ev.effort, // codex reasoning effort (turn_context) — claude events carry none (undefined = not serialized)
            acct: acct || null,
            pool: pool || undefined, // billed THROUGH this pool (acct = its real target)
            atype: ainfo ? ainfo.type : (acct ? 'unknown' : 'global'),
            aname: ainfo ? (ainfo.name || null) : null,
            mode: minfo.mode || null,
            host: minfo.host || null,
            cwd: ev.cwd,
            // ORIGIN (2026-09-10): which KIND of transcript this request came
            // from, straight from the walk — the only place that knows, since
            // it is a fact about the FILE. cwd is already the parent project's
            // for an agent event; wcwd names the agent's own dir when it
            // differs (a git worktree), so "By project" stops listing every
            // throwaway worktree as a project of its own.
            wcwd: ev.wcwd,
            origin: ev.origin || 'main',
            wf: ev.wf, agent: ev.agent,
            i: ev.i, cw5: ev.cw5, cw1: ev.cw1, cr: ev.cr, o: ev.o,
            tier: ev.tier,
          });
        },
      });
      filesTouched = walk.filesTouched;
      // A repair re-read the cursor store WHILE this walk was parked at a
      // budget point (reloadCursors after a migration): the walk advanced the
      // map the repair replaced, so writing it back would resurrect what the
      // repair dropped (the 2.369.85 class). Drop this walk whole — the next
      // scan re-walks from the repaired cursors; nothing was appended yet.
      if (this._cursors !== cursorsAtStart) return { added: 0, filesTouched, dropped: 'cursors-reloaded' };
      this._cursors = walk.cursors;

      // THE ONE COMMIT POINT — synchronous, so no reader interleaves between
      // the shard appends and the cursor write
      for (const [shard, lines] of Object.entries(shardBuffers)) {
        if (lines.length) { const text = lines.join('\n') + '\n'; timedSync('usage-shards.write', () => fs.appendFileSync(shard, text)); this._pushIndex(shard, text); if (this._evCache) this._evCache.checkedAt = 0; } // our own append ⇒ next _loadEvents re-checks (2.369.36 throttle)
      }
      this._writeCursors();
      this._lastScan = Date.now();
    } catch (e) {
      if (e && e.paused) return { added: 0, filesTouched: 0, paused: true }; // the mount-health gate stopped it mid-walk
      console.error('[usage-history] scan failed:', e && e.message);
      return { added: 0, filesTouched, error: String((e && e.message) || e) };
    } finally { this._scanning = false; }
    return { added, filesTouched };
  }

  /** Remote-host events (2.127.0): ingest the NDJSON a host-side
   *  vibespace-usage-scan run returned. Attribution is baked per host
   *  (acct 'host-<id>', atype 'host') so remote usage NEVER mixes with local
   *  accounts; rid is namespaced per host and the read-time Set dedup absorbs
   *  re-emitted events (remote cursor loss / interrupted transfer). Appends to
   *  the SAME monthly shards, so aggregation/window filters just work. */
  ingestRemoteEvents(hostId, hostName, text) {
    let added = 0;
    const shardBuffers = {};
    for (const line of String(text || '').split('\n')) {
      if (!line.trim()) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (!e || !e.rid || !e.ts) continue;
      const ts = Number(e.ts) || Date.now();
      // ── PER-ACCOUNT attribution for remote events (2.294.0, R4 deliverable;
      // the owner's live complaint: a remote message's billing row could only
      // say "<host>'s machine login"). VibeSpace ALREADY knows which account
      // it spawned a remote session with — writeSessionMeta records it into
      // attribution.ndjson exactly like a local one — and the walker carries
      // the session id, so the by-time walk resolves the real account.
      // FALLBACK STAYS HONEST: a session VibeSpace did not spawn (an external
      // terminal on that machine, or one predating attribution) has no entry,
      // and those keep the host bucket rather than being invented into some
      // account. atype 'host' therefore now means "billed by that machine's
      // own login", which is what it always claimed. ──
      const attrib = this._attribMap();
      const resolved = e.sid ? this._acctAt(e.sid, ts, attrib, null) : null;
      const rinfo = resolved ? (this._resolveAccount(resolved) || null) : null;
      const rpool = e.sid ? this._poolAt(e.sid, ts, attrib) : null;
      const ev = {
        rid: `h:${hostId}:${e.rid}`,
        // JOIN-FIELD completeness (adversarial review): when the host
        // transcript record had no requestId the walker's rid FELL BACK to
        // msg.id and omitted mid — the namespaced 'h:<host>:msg_X' then
        // matched neither of _liveDelta's id sets, so that request counted
        // TWICE in the live odometer forever (the ring has no age-out).
        mid: e.mid || (/^msg_/.test(String(e.rid || '')) ? e.rid : undefined),
        ts,
        sid: e.sid || null,
        be: e.be === 'codex' ? 'codex' : 'claude', // v2 walkers emit codex rollout events too
        model: e.model || null,
        effort: e.effort || undefined, // codex per-turn effort (walker v3) — absent for claude
        acct: resolved || hostId, // host ids are already 'host-…' — distinct from acct-/sub-/cxs- account ids
        pool: rpool || undefined,
        atype: resolved ? (rinfo ? rinfo.type : 'unknown') : 'host',
        aname: resolved ? (rinfo ? (rinfo.name || null) : null) : (hostName || hostId),
        mode: null,
        host: hostId,
        cwd: e.cwd || null,
        // Origin fields ride in from the host-side walker (the shipped scanner
        // stamps them from 2026-09-10). A scanner too old to know them leaves
        // the event WITHOUT an origin rather than claiming 'main': a remote
        // machine that runs workflows is exactly where the agent split matters,
        // so inventing the answer here would be a lie about the busiest case.
        wcwd: e.wcwd || undefined,
        origin: e.origin || undefined,
        wf: e.wf || undefined, agent: e.agent || undefined,
        i: e.i || 0, cw5: e.cw5 || 0, cw1: e.cw1 || 0, cr: e.cr || 0, o: e.o || 0,
        tier: e.tier || null,
      };
      const shard = this._shardFor(ev.ts);
      (shardBuffers[shard] = shardBuffers[shard] || []).push(JSON.stringify(ev));
      added++;
    }
    for (const [shard, lines] of Object.entries(shardBuffers)) {
      if (lines.length) { const text = lines.join('\n') + '\n'; timedSync('usage-shards.write', () => fs.appendFileSync(shard, text)); this._pushIndex(shard, text); if (this._evCache) this._evCache.checkedAt = 0; } // our own append ⇒ next _loadEvents re-checks (2.369.36 throttle)
    }
    return { added };
  }

  /** The usage index (design 011 L1 — a SHADOW that feeds nothing) attaches
   *  here; its owner is src/server/usage-index.js. */
  setIndex(index) { this._index = index || null; }

  // THE PUSH (design 011 §2, the invariant "a query sees every append made
  // before it"): right after a commit point's synchronous append, the same
  // bytes go to the index worker's FIFO, so a query posted after this append
  // is answered after it. `offset` is where these bytes START in the shard;
  // the worker takes them only when that equals its mark (and the inode is the
  // one it marked), else it re-reads the shard from the mark. Never throws.
  _pushIndex(shard, text) {
    if (!this._index) return;
    try {
      const st = fs.statSync(shard);
      this._index.ingest(path.basename(shard), st.size - Buffer.byteLength(text), st.ino, text);
    } catch {}
  }

  // ── L0: the cursor store (design 011) ──────────────────────────────────────
  // `_cursors.json` was rewritten whole (6.7 MB) at EVERY walk. It is now
  // written only when its bytes would change — `_cursorsJson` is the text on
  // disk (JSON.stringify of a parsed file gives the file back: checked on
  // production's) — and keys whose transcript is gone are dropped by this
  // writer: 25 817 of production's 37 024 keys (70 %) named a file that no
  // longer exists (2026-10-03). A key is dropped only on PROOF: it lies under
  // one of the walk's two roots, that root is a readable directory, stat of
  // the key answers ENOENT while the key's OWN directory is there, and that
  // root still holds a live key — an unreadable root (ENOTCONN) drops nothing,
  // and neither does an unmounted FUSE root, whose EMPTY mount point answers
  // ENOENT for every key (verify r1: a dropped LIVE cursor re-walks its
  // transcript and appends every request again — one 1.1 GB transcript = 21 MB
  // of duplicate rows; read-time rid dedup hides them, the ledger still grows).
  // On production 25 000 of the 25 825 dead keys keep their directory.
  _loadCursors() {
    let text = null, obj = {};
    try { text = fs.readFileSync(this.cursorsFile, 'utf-8'); obj = JSON.parse(text) || {}; } catch { text = null; obj = {}; }
    this._cursorsJson = text;
    return obj;
  }
  _writeCursors() {
    const now = Date.now();
    if (now - (this._cursorsPrunedAt || 0) >= CURSOR_PRUNE_MS) { this._cursorsPrunedAt = now; this._pruneDeadCursors(); }
    const json = JSON.stringify(this._cursors);
    if (json === this._cursorsJson) return false;
    timedSync('usage-cursors.write', () => this._writeAtomic(this.cursorsFile, json));   // store-timing's row; its site = this function since usage-index-shadow L0
    this._cursorsJson = json;
    return true;
  }
  _pruneDeadCursors() {
    const roots = [this.projectsDir, this.codexSessionsDir].filter((r) => { try { return fs.statSync(r).isDirectory(); } catch { return false; } });
    if (!roots.length) return 0;
    const dirOk = new Map(), dead = [], live = new Set();
    for (const k of Object.keys(this._cursors)) {
      const r = roots.find((x) => k.startsWith(x + path.sep));
      if (!r) continue;
      try { fs.statSync(k); live.add(r); } catch (e) {
        if (!e || e.code !== 'ENOENT') continue;
        const d = path.dirname(k);
        if (!dirOk.has(d)) { let ok = false; try { ok = fs.statSync(d).isDirectory(); } catch { } dirOk.set(d, ok); }
        if (dirOk.get(d)) dead.push([k, r]);
      }
    }
    let dropped = 0;
    for (const [k, r] of dead) if (live.has(r)) { delete this._cursors[k]; dropped++; }
    return dropped;
  }

  // Feed a file's UNSCANNED bytes to onLine, in bounded chunks — a rollout can
  // exceed Node's max string length (real case: 1.9GB), so the file must never
  // be materialized whole. Only complete lines are consumed; a partial tail
  // waits for the next scan. CRITICAL (do not regress): cur.offset is a BYTE
  // position — advance by Buffer.byteLength of the consumed text, never by the
  // UTF-16 string length (CJK under-advances → records re-counted, totals
  // inflate). A chunk may end mid-UTF-8-sequence; everything up to the last
  // newline still decodes cleanly (continuation bytes can't be '\n'), and the
  // partial char is re-read from the byte-accurate offset next iteration.

  _tier(model) {
    // Data-driven: longest tier key that substring-matches the model id wins
    // ('gpt-5.6-sol' beats 'gpt-5.6…' prefixes; adding a tier in pricing.json
    // makes it match with no code change).
    const m = String(model || '').toLowerCase();
    if (!this._tierKeys || this._tierKeysFor !== this._pricing.tiers) {
      this._tierKeys = Object.keys(this._pricing.tiers).filter(k => k !== '_default').sort((a, b) => b.length - a.length);
      this._tierKeysFor = this._pricing.tiers;
      this._tierMemo = new Map(); // per-model result — substring matching per event was the aggregate hot spot
    }
    const hit = this._tierMemo.get(m);
    if (hit !== undefined) return hit;
    let out = '_default';
    for (const k of this._tierKeys) if (m.includes(k)) { out = k; break; }
    this._tierMemo.set(m, out);
    return out;
  }
  // The rate for a given account + tier, at instant `ts`, for a request whose
  // whole prompt is `prompt` tokens (priceAt): an account may override specific
  // tiers and/or carry a flat discount (0..1) — the discount scales whichever
  // dated / long rate applies; an override row without `long` is flat.
  // Subscriptions/global have no override → default tiers (the API-equivalent reference).
  _rateFor(acct, tier, ts, prompt) {
    const ov = acct ? this._pricing.accounts?.[acct] : null;
    const base = priceAt((ov?.tiers && ov.tiers[tier]) || this._pricing.tiers[tier] || this._pricing.tiers._default, ts, prompt);
    const disc = ov && typeof ov.discount === 'number' ? Math.max(0, Math.min(0.99, ov.discount)) : 0;
    if (!disc) return base;
    const f = 1 - disc;
    return { input: base.input * f, output: base.output * f, cacheWrite5m: base.cacheWrite5m * f, cacheWrite1h: base.cacheWrite1h * f, cacheRead: base.cacheRead * f };
  }
  // `prompt`: the WHOLE request's input (i + cr + cw5 + cw1) when a caller
  // prices ONE request in parts (the token-class splits) — the long-context
  // rule is decided on the request, never on the part, or the parts stop
  // adding up to the whole. Default: this event's own sum.
  _cost(ev, prompt) {
    const tier = this._tier(ev.model);
    if (tier === '_default' && ev.be === 'codex') this._warnUnpriced(ev.model);
    const p = this._rateFor(ev.acct, tier, ev.ts, prompt != null ? prompt : (ev.i || 0) + (ev.cr || 0) + (ev.cw5 || 0) + (ev.cw1 || 0));
    return (ev.i * p.input + ev.o * p.output + ev.cw5 * p.cacheWrite5m + ev.cw1 * p.cacheWrite1h + ev.cr * p.cacheRead) / 1e6;
  }
  // A codex model id with no key is priced at `_default` — Anthropic Sonnet's
  // rates. That is how gpt-6-astra went unpriced for a month: say it ONCE per
  // id per process (journal + a Diagnostics event), never silently. The set is
  // the MODULE's, not the instance's: a migration builds its own UsageHistory
  // (ledger-slot-backfill) beside the server's (verify r1).
  _warnUnpriced(model) {
    const id = String(model || '(no model id)').toLowerCase().slice(0, 80); // the matcher's own spelling
    if (UNPRICED_WARNED.has(id)) return;
    UNPRICED_WARNED.add(id);
    try { global.__vsEvent?.('usage-unpriced-model', 'codex:' + id); } catch { }
    console.warn(`[usage] codex model "${id}" has no price row — priced at the _default (Anthropic Sonnet) rates until a key is added to DEFAULT_PRICING or pricing.json (see Diagnostics)`);
  }
  /** Stable token for the EFFECTIVE price table (tiers + per-account overrides
   *  and discounts) — the VERSION half of any memo key over computed costs.
   *  A pricing edit changes every historical cost while the ledger is
   *  untouched, so a cost memo keyed only by ids+interval+event-count served
   *  pre-edit dollars forever (2.369.43; the anchors' interval memo is the one
   *  consumer). Recomputed only when `_pricing` is REPLACED — setPricing builds
   *  a NEW object, the same identity check `_tier` uses for its tier keys. */
  pricingToken() {
    if (this._priceTok && this._priceTokFor === this._pricing) return this._priceTok;
    let tok;
    try {
      tok = crypto.createHash('sha1').update(JSON.stringify([this._pricing?.tiers || null, this._pricing?.accounts || null])).digest('hex').slice(0, 12);
    } catch {
      tok = 'nohash-' + Date.now(); // unhashable table ⇒ a fresh token: never reuse another table's costs
    }
    this._priceTokFor = this._pricing;
    this._priceTok = tok;
    return tok;
  }

  // In-memory event cache — the "database" behind aggregate(). Shards are
  // append-only NDJSON, so after the first full load each call reads ONLY the
  // appended bytes of each shard (byte-offset per file, last-newline aligned —
  // BYTES not chars, same CJK lesson as the scan cursors). Dedup by rid happens
  // once at load time (the ledger can contain a duplicate rid if a crash hit
  // between a shard append and the cursor write). Without this, every Usage
  // window request re-read + re-parsed every shard (~seconds at 100k+ events).
  // B-9428 (the owner's heap snapshot: this cache was 406 MB of a 1.17 GB heap
  // — every row ever, parsed): `events` holds the HOT rows only (ts ≥ cutoff,
  // the window + byte ceiling of cache-bounds.js); an older row lives in
  // `cold` as the priced columns, and its other fields are streamed from the
  // shards by (shard, offset) (usage-cold-walk.js). rids/mids = the hot rows' ids; the cold rows' ids live
  // in the slab's sorted hash indexes (r2: dedup and ledgerKnowsId regardless of ts).
  _loadEvents() {
    if (!this._evCache) this.ledgerGen = (this.ledgerGen || 0) + 1; // a rebuilt cache = a new generation (cost memos keyed on it, r4)
    if (!this._evCache) this._evCache = { consumed: new Map(), marks: new Map(), events: [], sizes: [], locs: [], hrh: [], hotBytes: 0, rids: new Set(), mids: new Set(), srcWm: new Map(), checkedAt: 0, cold: new CB.ColdSlab(), cutoff: -Infinity, walking: 0, shards: [], shardIx: new Map() };
    const c = this._evCache;
    // inc-mtox23xw (2.369.36): this ran a readdir + a stat per shard on EVERY
    // call — and the estimator calls it once per anchor PAIR (thousands per
    // learn) → ~90 openat/s on the main thread. The ledger only grows through
    // scan() (which drops the cache), so a 1s re-check throttle loses nothing.
    if (Date.now() - (c.checkedAt || 0) < 1000) return c.events;
    c.checkedAt = Date.now();
    let files = [];
    try { files = fs.readdirSync(this.dir).filter(f => /^events-\d{4}-\d{2}\.ndjson$/.test(f)).sort(); } catch {}
    let seen = null, grew = false, cooled = false, added = 0;
    // r3 (verify #13): a shard the cache read that is GONE ⇒ rebuild (every place in it is stale)
    if (c.consumed.size) { const have = new Set(files); for (const fn of c.consumed.keys()) if (!have.has(fn)) { this._evCache = null; return this._loadEvents(); } }
    for (const fn of files) {
      const fp = path.join(this.dir, fn);
      let st; try { st = fs.statSync(fp); } catch { continue; }
      const consumed = c.consumed.get(fn) || 0, mark = c.marks.get(fn);
      // r3 (verify #10/#11): every (shard, offset) the cache holds is only good while the shard is the SAME
      // file grown by appends — another inode, a same-size rewrite (mtime moved, size not), or bytes before
      // the old end that changed (the append-only proof: the old last line's tail still at its old offset)
      // ⇒ rebuild from scratch. A shrink is a rewrite too (the 2026-09 rule).
      if (consumed && (st.size < consumed || (mark && (mark.ino !== st.ino || (st.size === consumed && mark.mtimeMs !== st.mtimeMs) || (st.size > consumed && !probeHolds(fp, consumed, mark.probe)))))) {
        this._evCache = null;
        return this._loadEvents();
      }
      if (st.size === consumed) continue;
      if (!seen) { // the first new bytes of this pass: slide the window (hourly, never under a walk), order the id indexes
        seen = new Set();
        if (!c.walking && (c.cutoff === -Infinity || Date.now() - this._ledgerWindowMs() > c.cutoff + 3600e3)) this._trimHot();
        for (const k of Object.keys(c.cold.idx)) c.cold.idx[k].settle();
      }
      let buf;
      const fd = fs.openSync(fp, 'r');
      try {
        buf = Buffer.alloc(st.size - consumed);
        fs.readSync(fd, buf, 0, buf.length, consumed);
      } finally { fs.closeSync(fd); }
      const lastNl = buf.lastIndexOf(10); // complete lines only — a concurrent append may be mid-write
      if (lastNl < 0) continue;
      let sh = c.shardIx.get(fn);
      if (sh === undefined) { sh = c.shards.length; c.shards.push(fn); c.shardIx.set(fn, sh); }
      for (let at = 0; at <= lastNl;) {
        const nl = buf.indexOf(10, at);
        if (nl > at) {
          const line = buf.toString('utf8', at, nl);
          let ev = null; try { ev = JSON.parse(line); } catch { }
          if (ev) { const r = this._take(c, ev, sh, consumed + at, nl - at + 1, seen, CB.idHash(line)); if (r === 1) { grew = true; added++; } else if (r === 2) cooled = true; }
        }
        at = nl + 1;
      }
      c.consumed.set(fn, consumed + lastNl + 1);
      c.marks.set(fn, { ino: st.ino, mtimeMs: st.mtimeMs, probe: Buffer.from(buf.subarray(Math.max(0, lastNl + 1 - PROBE_BYTES), lastNl + 1)) });
    }
    if (grew && c.hotBytes > this._ledgerHotMaxBytes()) this._trimHot();
    // a pass that loaded many cold rows (a boot, a rebuild after a rewrite) orders them NOW, inside the same
    // long load, not in the next query's walk planning (r3: a 13 M-row settle measured 5 s in a 30-day query)
    if (cooled && c.cold.n - c.cold.sortedN > Math.max(65536, c.cold.n >> 2)) { c.cold.settle(); for (const k of Object.keys(c.cold.idx)) c.cold.idx[k].settle(); }
    if (added > 65536) this._sortedEvents(); // …and the hot rows' ts order (a 110 k-row sort measured 130 ms in the next query)
    if ((cooled || grew) && !c.overWarned && c.cold.bytes() > this._coldMaxBytes()) { // the declared ceiling, said once (verify #2)
      c.overWarned = true;
      try { global.__vsEvent?.('usage-cold-over-ceiling', String(Math.round(c.cold.bytes() / CB.MB))); } catch { }
      console.warn(`[usage] the ledger's cold columns passed their ${Math.round(this._coldMaxBytes() / CB.MB)} MB ceiling (${Math.round(c.cold.bytes() / CB.MB)} MB, ${c.cold.n} rows) — kept: the money readers' numbers never drop a row`);
    }
    return c.events;
  }
  /** One parsed line → hot (1), cold (2) or dropped (0, a duplicate rid — the FIRST copy wins, whatever its
   *  ts; r3 verify #4/#15: a cold hash hit is a candidate, the rid STRING at its place decides). */
  _take(c, ev, sh, off, size, seen, lineHash = NaN) {
    if (ev.rid) {
      if (c.rids.has(ev.rid) || seen.has(ev.rid)) return 0;
      for (const loc of c.cold.idx.rid.findSorted(CB.idHash(ev.rid))) if (this._rowAt(c, loc)?.rid === ev.rid) return 0;
      seen.add(ev.rid);
    }
    // per-SOURCE watermark (offline-bias defense, 2.297.0): the newest
    // event timestamp we hold from each machine — 'local' for this one.
    // Free here (rides the incremental append walk); consumers ask
    // sourceWatermarks() to detect an ACTIVE source that has gone dark.
    const src = ev.host || 'local';
    if ((ev.ts || 0) > (c.srcWm.get(src) || 0)) c.srcWm.set(src, ev.ts);
    if (ev.ts < c.cutoff && CB.coldable(ev, sh, off)) { c.cold.push(ev, sh, off, lineHash); return 2; }
    if (ev.rid) c.rids.add(ev.rid);
    if (ev.mid) c.mids.add(ev.mid); // stream-side id space (live-odometer exclusion join)
    c.events.push(ev); c.sizes.push(size); c.locs.push(CB.locOf(sh, off)); c.hrh.push(lineHash); c.hotBytes += size; // hrh = the WHOLE line's hash (r4, verify #0)
    return 1;
  }
  /** The row at a place (sync, one ≤ 64 KB read) — only on a hash hit. */
  _rowAt(c, loc) {
    const line = readLineAtSync(path.join(this.dir, c.shards[Math.floor(loc / 4294967296)] || ''), loc % 4294967296);
    try { return line == null ? null : JSON.parse(line); } catch { return null; }
  }
  _ledgerWindowMs() { return this.ledgerWindowMs || CB.LEDGER_WINDOW_DAYS * CB.DAY_MS; }
  _ledgerHotMaxBytes() { return this.ledgerHotMaxBytes || CB.LEDGER_HOT_MAX_BYTES; }
  _coldMaxBytes() { return this.coldMaxBytes || CB.COLD_COLUMNS_MAX_BYTES; }
  /** Slide the hot cutoff (the window, the byte ceiling) and move the rows it passed into the cold columns
   *  in ts order (the load order on equal ts). Never while a walk holds the cutoff it started on. */
  _trimHot() {
    const c = this._evCache;
    if (!c || c.walking) return;
    const evs = c.events, tss = evs.map((e) => e.ts || 0);
    const cut = CB.ledgerCutoff({ nowMs: Date.now(), tss, sizes: c.sizes, windowMs: this._ledgerWindowMs(), maxBytes: this._ledgerHotMaxBytes(), prev: c.cutoff });
    c.cutoff = cut;
    const go = [];
    for (let i = 0; i < evs.length; i++) if (tss[i] < cut && !Number.isNaN(c.locs[i]) && CB.coldable(evs[i], Math.floor(c.locs[i] / 4294967296), c.locs[i] % 4294967296)) go.push(i);
    if (!go.length) return;
    go.sort((a, b) => (tss[a] - tss[b]) || (a - b));
    const drop = new Uint8Array(evs.length);
    for (const i of go) { const ev = evs[i]; c.cold.push(ev, Math.floor(c.locs[i] / 4294967296), c.locs[i] % 4294967296, c.hrh[i]); drop[i] = 1; if (ev.rid) c.rids.delete(ev.rid); if (ev.mid) c.mids.delete(ev.mid); }
    const ne = [], ns = [], nl = [], nh = [];
    let hb = 0;
    for (let i = 0; i < evs.length; i++) if (!drop[i]) { ne.push(evs[i]); ns.push(c.sizes[i]); nl.push(c.locs[i]); nh.push(c.hrh[i]); hb += c.sizes[i]; }
    c.events = ne; c.sizes = ns; c.locs = nl; c.hrh = nh; c.hotBytes = hb; c.sorted = null;
  }
  /** Does the ledger hold this request / message id? (the live odometer's exclusion join): the hot ids,
   *  then the cold rows' sorted hashes — whatever the caller's ts (r2, verify #14). */
  ledgerKnowsId(id) {
    const c = this._evCache;
    if (!c || !id) return false;
    if (c.rids.has(id) || c.mids.has(id)) return true;
    if (!c.cold.n) return false;
    for (const loc of c.cold.locs('rid', id)) if (this._rowAt(c, loc)?.rid === id) return true; // a hash hit is a candidate (verify #15)
    for (const loc of c.cold.locs('mid', id)) if (this._rowAt(c, loc)?.mid === id) return true;
    return false;
  }
  /** The bounded caches' census rows, each in its ceiling's unit (verify #4): the window in RAW line bytes
   *  (its heap cost is more — the parsed objects + the id sets), the cold columns as ArrayBuffers. */
  cacheCensus() {
    const c = this._evCache;
    return [
      CB.cacheRow('usage ledger window', { bytes: c ? c.hotBytes : 0, count: c ? c.events.length : 0, unit: 'rows', ceiling: this._ledgerHotMaxBytes(), kind: 'heap', basis: 'raw line bytes' }),
      CB.cacheRow('usage ledger cold columns', { bytes: c ? c.cold.bytes() : 0, count: c ? c.cold.n : 0, unit: 'rows', ceiling: this._coldMaxBytes(), kind: 'arraybuffers', basis: 'typed arrays' }),
      ...(STUCK.size ? [CB.cacheRow('usage fold workers stuck', { count: STUCK.size, unit: 'workers (storage not answering)' })] : []), // r4, verify #2
    ];
  }

  // THE COLD ROWS' FULL FIELDS (B-9428 r2): the slab's ordered positions in [from, to], cut into one group per
  // UTC month of ts; usage-cold-walk.js reads each row at its (shard, offset) — what the cache loaded, where it
  // lives, in its ts order.
  _coldWalk(from, to) {
    const c = this._evCache, s = c.cold;
    s.settle();
    const q0 = from ? s.lowerBound(from) : 0, q1 = to ? s.upperBound(to) : s.n;
    const groups = [];
    for (let a = q0; a < q1;) {
      const d = new Date(s.ts[a]);
      const b = Math.max(a + 1, Math.min(q1, s.lowerBound(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))));
      groups.push({ sh: s.sh.slice(a, b), off: s.off.slice(a, b), ts: s.ts.slice(a, b), rh: s.rh.slice(a, b) }); // what each place must hold (verified)
      a = b;
    }
    return { dir: this.dir, shards: c.shards.slice(), groups };
  }
  /** SYNC, every row in [from, to] with all its fields in ts order — the declared on-loop reader (a
   *  migration, a test; aggregate()). The server's route folds the cold part in a worker (aggregateAsync). */
  * _allRows(from, to) {
    this._loadEvents();
    const c = this._evCache;
    if (!c.cold.n || (from && from >= c.cutoff)) { yield* this._hotEvents(from, to); return; }
    yield* this._merged(coldRows(this._coldWalk(from, to)), from, to, this._sortedEvents());
  }
  /** The cold rows a lookup's hashes name, ONE line each read at its (shard, offset) (verify #6); the LAST
   *  match in load order — the old backwards search's answer. */
  async _coldFind(id, pred) {
    const c = this._evCache;
    if (!c || !c.cold.n) return null;
    let best = null, bestAt = -1;
    for (const loc of c.cold.candidates(id)) { // O(log n) on the hash index (verify #18), one line each
      let ev; try { ev = JSON.parse(await readLineAt(path.join(this.dir, c.shards[Math.floor(loc / 4294967296)]), loc % 4294967296)); } catch { continue; }
      if (ev && pred(ev) && loc > bestAt) { best = ev; bestAt = loc; }
    }
    return best;
  }
  /** The cold fold in a worker (usage-cold-worker.js): one per walk, terminated after; the main thread never
   *  parses a cold line for the route. */
  _foldInWorker(msg) {
    if (STUCK.size) return Promise.reject(Object.assign(new Error(`the usage ledger is not answering (storage) — ${STUCK.size} fold worker(s) stuck in a read; usage summaries resume when it returns`), { code: 'STUCK' }));
    return new Promise((resolve, reject) => {
      let w, settled = false, timer = null, exited = false;
      const file = this.coldWorkerFile || path.join(__dirname, 'usage-cold-worker.js');
      const capMb = this.coldWorkerHeapMb || COLD_WORKER_HEAP_MB; // the hard limit never under 64 MB: below ~16 MB V8 dies PROCESS-WIDE deserializing the isolate (measured)
      // execArgv [] (r3, verify #1/#12): a parent --max-old-space-size would otherwise replace resourceLimits
      try { w = new Worker(file, { execArgv: [], resourceLimits: { maxOldGenerationSizeMb: Math.max(64, capMb), maxYoungGenerationSizeMb: 32 } }); } catch (e) { reject(e); return; }
      trackWorker('usage-cold-fold', w); // the memory census (src/worker-memory.js)
      this._coldWalks = (this._coldWalks || 0) + 1;
      w.on('exit', () => { exited = true; if (STUCK.delete(w)) console.log(`[usage] a stuck fold worker exited — ${STUCK.size} still stuck${STUCK.size ? '' : '; usage summaries resume'}`); });
      // ONE worker at a time (r4): the request settles only after terminate() — awaited for its own deadline;
      // a worker still alive then is STUCK (counted, said once, no new worker until it exits)
      const end = async (fn, v) => {
        if (settled) return; settled = true; clearTimeout(timer);
        const tdl = this.coldTerminateDeadlineMs || CB.COLD_TERMINATE_DEADLINE_MS;
        await Promise.race([w.terminate().catch(() => { }), new Promise((r) => setTimeout(r, tdl).unref?.())]);
        if (!exited) { STUCK.add(w); console.warn(`[usage] a fold worker did not exit ${Math.round(tdl / 1000)} s after terminate (blocked in a read — the storage is not answering): ${STUCK.size} stuck; new usage summaries are refused until it exits`); }
        fn(v);
      };
      const deadline = this.coldFoldDeadlineMs || CB.COLD_FOLD_DEADLINE_MS;
      timer = setTimeout(() => end(reject, Object.assign(new Error(`the fold passed its ${Math.round(deadline / 1000)} s deadline and was stopped`), { code: 'DEADLINE' })), deadline);
      w.on('message', (m) => {
        if (m && m.ev === 'memory') return;
        if (m && m.ev === 'done') end(resolve, m);
        else if (m && m.ev === 'error') end(reject, Object.assign(new Error(m.error), { code: m.code || 'FOLD' }));
      });
      w.on('error', (e) => end(reject, Object.assign(new Error(e && e.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'the fold worker ran out of memory' : 'the fold worker failed: ' + (e && e.message)), { code: (e && e.code) || 'WORKER' })));
      w.on('exit', (code) => end(reject, Object.assign(new Error('the fold worker exited (' + code + ')'), { code: 'WORKER' })));
      w.postMessage({ op: 'fold', id: 1, capMb, rowBudget: this.coldRowBudget || CB.COLD_ROW_BUDGET, ...msg }, [...msg.walk.groups.flatMap((g) => [g.sh.buffer, g.off.buffer, g.ts.buffer, g.rh.buffer]), msg.hot.tss.buffer, msg.hot.locs.buffer, msg.hot.rh.buffer]);
    });
  }
  /** The worker folded with no account / session tables: name what it could not on the answer's rows,
   *  exactly as _aggRow would have (live?.name || the row's own, live?.tail, !live; the session's meta name). */
  _fixLabels(ans) {
    for (const r of ans.groups.account || []) if (r.deleted) { const live = this._resolveAccount(r.key); if (live) { if (live.name) r.name = live.name; r.tail = live.tail || null; r.deleted = false; } }
    for (const r of ans.groups.pool || []) if (r.deleted) { const p = this._resolveAccount(r.key); if (p) { r.name = p.name || r.key; r.deleted = false; } }
    for (const r of ans.groups.session || []) { const sm = this._lastMetaMap ? this._lastMetaMap[r.key] : null; r.name = sm?.name || null; }
  }

  // Pre-load the event cache (called once at boot so the first Usage window
  // open doesn't pay the full-ledger parse).
  warm() { try { this._loadEvents(); const c = this._evCache; c.cold.settle(); for (const k of Object.keys(c.cold.idx)) c.cold.idx[k].settle(); } catch {} } // B-9428: the cold columns ordered + right-sized now, not at the first query

  /** Per-source (per-machine) newest-event-timestamp map: {local: ts, <hostId>: ts}.
   *  The offline-bias defense reads this to tell "idle" from "dark": a source
   *  with RECENT events whose link is down is actively-consuming-but-invisible
   *  — the dangerous underestimate direction. */
  sourceWatermarks() {
    try { this._loadEvents(); } catch {}
    const out = {};
    for (const [k, v] of (this._evCache?.srcWm || new Map())) out[k] = v;
    return out;
  }

  // Which ledger event carries this requestId — the per-message meta popup's
  // "which account handled this?" (2.266.1, user request). Backwards search:
  // the asked-about message is almost always recent.
  async eventForRid(rid) {
    if (!rid) return null;
    try { this.scan(); } catch { } // throttled incremental — freshens just-streamed messages
    await this.scanSettled(); // the walk yields (perf ⑥): answer from the SETTLED ledger
    const evs = this._loadEvents();
    for (let i = evs.length - 1; i >= 0; i--) if (evs[i].rid === rid) return evs[i];
    const old = await this._coldFind(rid, (ev) => ev.rid === rid); // B-9428: a row older than the window
    if (old) return old;
    // REMOTE sessions (real report: every reply on a remote conversation
    // showed "not in the ledger yet"): the host harvest namespaces its rids
    // `h:<hostId>:<rid>`, so an exact match on the plain request id can never
    // find them. Suffix-match the namespaced form before giving up.
    const suf = ':' + rid;
    for (let i = evs.length - 1; i >= 0; i--) {
      const r = evs[i].rid;
      if (typeof r === 'string' && r.startsWith('h:') && r.endsWith(suf)) return evs[i];
    }
    return this._coldFind(rid, (ev) => typeof ev.rid === 'string' && ev.rid.startsWith('h:') && ev.rid.endsWith(suf));
  }

  /** Join by message.id — the id BOTH transports carry (the 2.267.3 rule).
   *  Live stdout records have NO requestId, so the popup's per-message
   *  billing lookup joins here: ev.mid (baked since 2.267.3), or ev.rid
   *  when the walker fell back to msg.id (records without requestId), or a
   *  host-namespaced rid ending in the mid. */
  async eventForMid(mid) {
    if (!mid) return null;
    try { this.scan(); } catch { }
    await this.scanSettled();
    const evs = this._loadEvents();
    const suf = ':' + mid;
    for (let i = evs.length - 1; i >= 0; i--) {
      const ev = evs[i];
      if (ev.mid === mid || ev.rid === mid) return ev;
      if (typeof ev.rid === 'string' && ev.rid.startsWith('h:') && ev.rid.endsWith(suf)) return ev;
    }
    return this._coldFind(mid, (ev) => ev.mid === mid || ev.rid === mid || (typeof ev.rid === 'string' && ev.rid.startsWith('h:') && ev.rid.endsWith(suf)));
  }

  /** Time-sorted view of the cache (rebuilt lazily when the event count
   *  changes — shards append in scan order, remote harvests interleave). */
  _sortedEvents() {
    const evs = this._loadEvents();
    const c = this._evCache;
    if (!c.sorted || c.sortedLen !== evs.length) { c.sorted = evs.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)); c.sortedLen = evs.length; }
    return c.sorted;
  }
  /** Number of cached events with ts <= t (binary search) — the memo VERSION
   *  for an interval ending at t: unchanged ⇒ no event can have entered it. */
  _evCountUpTo(t) {
    const arr = this._sortedEvents();
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if ((arr[mid].ts || 0) <= t) lo = mid + 1; else hi = mid; }
    return lo + this._evCache.cold.countUpTo(t);
  }
  // Yield UNIQUE events in [from,to] (epoch ms) from the in-memory cache.
  // O(log n + k) since 2.369.36 (inc-mtox23xw): the estimator walks this once
  // per anchor pair; a full-ledger scan per pair blocked the loop for 10-59s
  // (captured by Debugger.pause inside _events ← costBetweenMulti ← learnRates).
  /** Every row in [from, to] with ALL its fields, ts-ordered — the cold ones read at their (shard, offset)
   *  (SYNC: a migration, a test; the server reads through aggregateAsync). */
  rows(from, to) { return this._allRows(from, to); }
  // B-9428: a range that starts before the hot cutoff first yields the COLD rows as light rows carrying only
  // the priced columns (ts, i/o/cw5/cw1/cr, acct/be/host/atype/model) — every caller of _events reads only
  // those (test-cache-bounds' census); a reader needing other fields reads the rows (_allRows / the worker).
  * _events(from, to) {
    const arr = this._sortedEvents();
    const c = this._evCache;
    if (!c.cold.n || (from && from >= c.cutoff)) { yield* this._hotEvents(from, to, arr); return; }
    yield* this._merged(c.cold.rows(from, to), from, to, arr);
  }
  /** The cold sequence + the hot rows by ts. Every hot row the columns could hold is ≥ the cutoff, so only a
   *  row they cannot (coldable() false: a scanner never writes one) interleaves. */
  * _merged(cold, from, to, arr) {
    const it = this._hotEvents(from, to, arr);
    let h = it.next();
    for (const ev of cold) {
      while (!h.done && (h.value.ts || 0) <= ev.ts) { yield h.value; h = it.next(); }
      yield ev;
    }
    while (!h.done) { yield h.value; h = it.next(); }
  }
  * _hotEvents(from, to, arr = this._sortedEvents()) {
    let lo = 0;
    if (from) { let hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if ((arr[mid].ts || 0) < from) lo = mid + 1; else hi = mid; } }
    for (let i = lo; i < arr.length; i++) {
      const ev = arr[i];
      if (to && ev.ts > to) break;
      yield ev;
    }
  }

  _emptyBucket() { return { requests: 0, sessions: new Set(), input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0, cost: 0 }; }
  _add(b, ev) {
    b.requests++; b.sessions.add(ev.sid);
    b.input += ev.i; b.cacheWrite5m += ev.cw5; b.cacheWrite1h += ev.cw1; b.cacheRead += ev.cr; b.output += ev.o;
    b.cost += this._cost(ev);
  }
  _finalize(b) {
    const totalIn = b.input + b.cacheWrite5m + b.cacheWrite1h + b.cacheRead;
    return {
      requests: b.requests, sessions: b.sessions.size,
      input: b.input, cacheWrite5m: b.cacheWrite5m, cacheWrite1h: b.cacheWrite1h,
      cacheWrite: b.cacheWrite5m + b.cacheWrite1h, cacheRead: b.cacheRead, output: b.output,
      totalInput: totalIn, totalTokens: totalIn + b.output,
      cacheHitRatio: totalIn ? b.cacheRead / totalIn : 0,
      cost: b.cost,
    };
  }

  // The one flexible query the UI uses. groupBy is an array of dimension keys;
  // returns { totals, series(byDay), groups: { <dim>: [{key,...}] }, accounts }.
  // B-9428: the full rows of a range older than the hot cutoff are read at their (shard, offset) —
  // synchronously here (a migration, a test), folded in a worker through aggregateAsync (the route). One
  // accumulator, so the two answer the same buckets in the same order.
  aggregate(opts = {}) {
    for (let tries = 0; ; tries++) {
      try {
        const st = this._aggBegin(opts);
        for (const ev of this._allRows(opts.from, opts.to)) this._aggRow(st, ev);
        return this._aggEnd(st);
      } catch (e) { if (!(e && e.code === 'STALE') || tries >= 2) throw e; this._evCache = null; } // a rewritten shard: rebuild, read again
    }
  }
  /** The route's aggregate (r2/r3). A hot-only range folds the in-memory hot rows on the loop in yielding
   *  slices (no worker, no disk — verify #6). A range reaching the cold rows is SINGLE-FLIGHT per query and
   *  folds ONE at a time in usage-cold-worker.js: every row read at its place and verified, the answer AS-OF
   *  the walk's start (what the sync call answered at its instant). Never a fold of the ledger on the loop
   *  (verify #0/#9): a stale place ⇒ rebuild + re-run IN THE WORKER (≤ 3), then an error; a worker death /
   *  out-of-memory / the deadline ⇒ an error every waiter gets (verify #1/#2). The queue holds ≤ 4 distinct
   *  folds (a 5th is refused) and a request that went away leaves it (verify #14). */
  aggregateAsync(opts = {}, { signal = null } = {}) {
    this._loadEvents();
    const c = this._evCache;
    const hotOnly = !c.cold.n || (opts.from && opts.from >= c.cutoff);
    const key = JSON.stringify([opts.from || null, opts.to || null, opts.backend || null, opts.accounts ? [...opts.accounts].sort() : null, opts.hostFilter || null, opts.pivots || null]);
    if (!this._aggFlights) { this._aggFlights = new Map(); this._queued = 0; }
    const hit = this._aggFlights.get(key);
    if (hit) { hit.job.waiters++; this._onAbort(signal, hit.job); return hit.p; }
    const job = { waiters: 1, started: false, cancelled: false };
    let p;
    if (hotOnly) { job.started = true; p = this._hotFold(opts); }
    else {
      if (this._queued >= (this.coldQueueMax || CB.COLD_QUEUE_MAX)) return Promise.reject(Object.assign(new Error(`${this._queued} usage summaries are already waiting — retry in a moment`), { code: 'BUSY' }));
      this._queued++;
      p = (this._walkChain || Promise.resolve()).then(() => {
        this._queued--; job.started = true;
        if (job.cancelled) throw Object.assign(new Error('the request went away before its turn'), { code: 'ABORTED' });
        return this._aggregateWalk(opts, 0);
      });
      this._walkChain = p.then(() => { }, () => { }); // the queue's tail — never the answer (p.catch would hold it)
    }
    this._aggFlights.set(key, { p, job });
    this._onAbort(signal, job);
    const drop = () => { if (this._aggFlights.get(key)?.p === p) this._aggFlights.delete(key); };
    p.then(drop, drop);
    return p;
  }
  _onAbort(signal, job) {
    if (!signal) return;
    const go = () => { job.waiters--; if (job.waiters <= 0 && !job.started) job.cancelled = true; };
    if (signal.aborted) go(); else signal.addEventListener('abort', go, { once: true });
  }
  /** A hot-only range: the in-memory hot rows (a snapshot, as-of now) in slices that yield the loop. */
  async _hotFold(opts) {
    const st = this._aggBegin(opts);
    let k = 0;
    for (const ev of this._hotEvents(opts.from, opts.to, this._sortedEvents().slice())) {
      this._aggRow(st, ev);
      if (++k % 5000 === 0) await new Promise((r) => setImmediate(r));
    }
    return this._aggEnd(st);
  }
  async _aggregateWalk(opts, tries) {
    this._loadEvents();
    const c = this._evCache;
    if (!c.cold.n || (opts.from && opts.from >= c.cutoff)) return this._hotFold(opts);
    let res;
    c.walking++; // no slide while this walk's plan is out (its places stay its own)
    try {
      const h0 = c.events.length, tss = new Float64Array(h0), locs = new Float64Array(h0), rh = new Float64Array(h0), objs = {};
      for (let i = 0; i < h0; i++) { tss[i] = c.events[i].ts || 0; locs[i] = c.locs[i]; rh[i] = c.hrh[i]; if (Number.isNaN(locs[i])) objs[i] = c.events[i]; }
      const walk = this._coldWalk(opts.from, opts.to);
      var asOf = Date.now(); // the answer's instant: the plan (r4, verify #6 — the window says "as of" when it lags)
      const hook = this.walkHook; // test seam: an append / a slide / a rewrite lands mid-walk (every try)
      if (hook) await hook(tries);
      res = await this._foldInWorker({ pricing: this._pricing, query: { ...opts }, walk, hot: { tss, locs, rh, objs } });
    } catch (e) {
      if (e && e.code === 'STALE') { // a shard was rewritten under the plan: rebuild, re-run in the worker
        this._evCache = null;
        if (tries < 1) return this._aggregateWalk(opts, tries + 1); // r4 (verify #4): ONE rebuild per request, never a second loop reload
        throw Object.assign(new Error('the usage ledger was rewritten during the read twice (' + e.message + ') — retry'), { code: 'STALE' });
      }
      throw e;
    } finally { if (c.walking > 0) c.walking--; }
    const answer = res.answer;
    this._fixLabels(answer);
    answer.asOf = asOf;
    if (res.missing > 0) { // verify #13: a vanished shard — this answer says so, the cache rebuilds from the directory
      answer.partial = { missingRows: res.missing, shards: res.missingShards, why: 'a usage ledger shard vanished during the read' };
      console.warn(`[usage] ${res.missing} ledger rows were missing (${res.missingShards.join(', ')}) — answered without them; the cache rebuilds`);
      this._evCache = null;
    }
    return answer;
  }
  _aggBegin({ from = null, to = null, backend = null, accounts = null, hostFilter = null, pivots = null } = {}) {
    // `origin` (2026-09-10) = which KIND of transcript the request came from:
    // 'main' (the conversation itself), 'subagent', 'workflow', or 'unknown'
    // for a row nobody can name any more (the backfill migration's honest
    // answer for a transcript that is gone, and a remote scanner too old to
    // stamp it). It is a FIRST-CLASS dimension, so `session:origin` is an
    // ordinary pivot and the Usage window's session table is a pivot read.
    const dims = { day: {}, model: {}, account: {}, billing: {}, project: {}, mode: {}, host: {}, hour: {}, weekday: {}, session: {}, pool: {}, origin: {} };
    const dimMeta = {}; // dim → key → {name,type,...} extra labels
    // pivots = [[dimA, dimB], …] — 2-D crosses for the dashboard's split-series
    // panels (e.g. day×account = per-account daily token stacks). Cells carry
    // the same finalized bucket shape as group rows, so the client's metric
    // extraction works unchanged.
    const pivotPairs = (pivots || []).filter((p) => Array.isArray(p) && p.length === 2 && p[0] !== p[1] && p[0] in dims && p[1] in dims);
    const pivotAcc = pivotPairs.map(() => ({}));
    const totals = this._emptyBucket();
    return { backend, accounts, hostFilter, dims, dimMeta, pivotPairs, pivotAcc, totals, firstTs: null, lastTs: null };
  }
  _aggRow(st, ev) {
    const { backend, accounts, hostFilter, dims, dimMeta, pivotPairs, pivotAcc, totals } = st;
    {
      if (backend && ev.be !== backend) return;
      // The two CLIs' machine logins are DIFFERENT identities — separate buckets
      // ('__global__' = claude, '__global_codex__' = codex), else the account
      // dimension/filter conflates them.
      const acctKey = ev.acct || globalUsageKeyOf(ev.be);
      // accounts = Set of bucket keys (account ids / globals); the UI can pass
      // several at once (e.g. a named sub + its global when the machine login
      // IS that account) — the whole dashboard then shows one account.
      if (accounts && !accounts.has(acctKey)) return;
      // Device dimension (2.128.0): 'local' = this machine, else a host id —
      // a TOP-LEVEL filter over the whole view (hosts are devices, not accounts)
      if (hostFilter && (ev.host || 'local') !== hostFilter) return;
      this._add(totals, ev);
      if (st.firstTs == null || ev.ts < st.firstTs) st.firstTs = ev.ts;
      if (st.lastTs == null || ev.ts > st.lastTs) st.lastTs = ev.ts;
      const d = new Date(ev.ts);
      const keyOf = {
        day: d.toISOString().slice(0, 10),
        model: ev.model || 'unknown',
        account: acctKey,
        // billing = the coarse category, so subscription $ and API $ never merge
        billing: ev.atype === 'api' ? 'api-key' : ev.atype === 'subscription' ? 'subscription' : ev.atype === 'codex-subscription' ? 'chatgpt' : ev.atype === 'host' ? 'remote-host' : (ev.acct ? 'unknown-account' : (ev.be === 'codex' ? 'codex-cli-login' : 'cli-global-login')),
        project: ev.cwd || 'unknown',
        mode: ev.mode || 'unknown',
        host: ev.host || 'local',
        hour: String(d.getHours()),
        weekday: String(d.getDay()),
        session: ev.sid,
        pool: ev.pool || null, // only events billed THROUGH a pool have this
        origin: ev.origin || 'unknown', // absent = a row written before 2026-09-10 that the backfill could not name
      };
      for (const dim of Object.keys(dims)) {
        const k = keyOf[dim];
        // pool is sparse — a null key would collect every non-pooled event into
        // one bucket = the whole account, defeating the point. Skip those.
        if (dim === 'pool' && !k) continue;
        (dims[dim][k] = dims[dim][k] || this._emptyBucket());
        this._add(dims[dim][k], ev);
      }
      for (let i = 0; i < pivotPairs.length; i++) {
        const ka = keyOf[pivotPairs[i][0]], kb = keyOf[pivotPairs[i][1]];
        // Same sparse-pool guard as the 1-D dim loop: a null pool key on EITHER
        // axis would collect every non-pooled event into a phantom "null"
        // series aggregating all non-pool spend (dashboard split-series/pivot
        // panels put pool on an axis) — review-caught, do not drop.
        if ((pivotPairs[i][0] === 'pool' && !ka) || (pivotPairs[i][1] === 'pool' && !kb)) continue;
        const row = (pivotAcc[i][ka] = pivotAcc[i][ka] || {});
        this._add(row[kb] = row[kb] || this._emptyBucket(), ev);
      }
      // Freeze human labels for the account dimension (name + billing type +
      // backend, so the UI can badge accounts/models with the vendor logo).
      if (!dimMeta.account) dimMeta.account = {};
      if (!dimMeta.account[acctKey]) {
        const live = ev.acct ? this._resolveAccount(ev.acct) : null;
        dimMeta.account[acctKey] = {
          name: ev.acct ? (live?.name || ev.aname || ev.acct) : (ev.be === 'codex' ? 'Codex CLI login' : 'Claude CLI login'),
          type: ev.atype || (ev.acct ? 'unknown' : 'global'),
          be: ev.be || 'claude',
          tail: live?.tail || null,
          deleted: ev.acct ? !live : false,
        };
      }
      // Device labels (2.128.0): the host dim's rows carry the host's display
      // name so the window's Device chips need no extra lookup
      if (!dimMeta.host) dimMeta.host = { local: { name: 'local' } };
      const hostKey = ev.host || 'local';
      if (!dimMeta.host[hostKey]) dimMeta.host[hostKey] = { name: ev.aname || hostKey };
      if (!dimMeta.model) dimMeta.model = {};
      if (!dimMeta.model[keyOf.model]) dimMeta.model[keyOf.model] = { be: ev.be || 'claude' };
      // Pool labels: the pseudo-account's display name (resolves even after the
      // pool re-points, since the pool id is stable).
      if (ev.pool) {
        if (!dimMeta.pool) dimMeta.pool = {};
        if (!dimMeta.pool[ev.pool]) {
          const pinfo = this._resolveAccount(ev.pool);
          dimMeta.pool[ev.pool] = { name: pinfo?.name || ev.pool, be: ev.be || 'claude', deleted: !pinfo };
        }
      }
      // Session names from session-meta (VibeSpace-created sessions carry one;
      // foreign sessions fall back to the id in the UI).
      if (!dimMeta.session) dimMeta.session = {};
      if (!dimMeta.session[ev.sid]) {
        const sm = this._lastMetaMap ? this._lastMetaMap[ev.sid] : null;
        // `project` = the conversation's own cwd, so the session table can say
        // WHERE a session worked without a second lookup. Agent events already
        // carry the PARENT project's cwd, so any of a session's events answers
        // it — but a null one must not win, hence the fill-in below.
        dimMeta.session[ev.sid] = { name: sm?.name || null, be: ev.be || 'claude', project: ev.cwd || null };
      } else if (!dimMeta.session[ev.sid].project && ev.cwd) dimMeta.session[ev.sid].project = ev.cwd;
    }
  }
  _aggEnd({ dims, dimMeta, pivotPairs, pivotAcc, totals, firstTs, lastTs }) {
    const groupOut = {};
    // Sequential dims keep AXIS order (day = lexicographic/chronological,
    // hour/weekday = numeric) — cost-sorting them scrambled the hour axis in
    // the dashboard (real report: bars ordered 18,21,2,16,… instead of 0→23).
    // Categorical dims stay cost-sorted (the client top-Ns them).
    const SEQ_SORT = {
      day: (a, b) => (a.key < b.key ? -1 : 1),
      hour: (a, b) => Number(a.key) - Number(b.key),
      weekday: (a, b) => Number(a.key) - Number(b.key),
    };
    for (const dim of Object.keys(dims)) {
      groupOut[dim] = Object.entries(dims[dim])
        .map(([key, b]) => ({ key, ...(dimMeta[dim]?.[key] || {}), ...this._finalize(b) }))
        .sort(SEQ_SORT[dim] || ((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens));
    }
    const series = groupOut.day.slice().sort((a, b) => a.key < b.key ? -1 : 1);
    const pivotOut = {};
    pivotPairs.forEach((pair, i) => {
      pivotOut[pair.join(':')] = Object.entries(pivotAcc[i])
        .map(([key, cells]) => ({
          key,
          cells: Object.fromEntries(Object.entries(cells).map(([k2, b]) => [k2, this._finalize(b)])),
        }))
        .sort((a, b) => (a.key < b.key ? -1 : 1)); // lexicographic; client re-orders seq dims
    });
    return {
      totals: this._finalize(totals),
      range: { from: firstTs, to: lastTs },
      pricing: this._pricing,
      series,
      groups: groupOut,
      ...(pivotPairs.length ? { pivots: pivotOut } : {}),
    };
  }

  // Attach human names to account/session groups (server enriches with account
  // names + session names it knows).
  pricingTable() { return this._pricing; }
  // Accept a full v2 object OR a partial patch ({tiers?, accounts?}). Merges so a
  // UI editor can PATCH just one account's discount without resending everything.
  setPricing(patch) {
    if (!patch || typeof patch !== 'object') return this._pricing;
    const cur = this._pricing;
    const next = { version: 2, tiers: { ...cur.tiers, ...(patch.tiers || {}) }, accounts: { ...cur.accounts } };
    if (patch.accounts) {
      for (const [id, cfg] of Object.entries(patch.accounts)) {
        if (cfg == null) delete next.accounts[id];       // null clears an override
        else next.accounts[id] = cfg;
      }
    }
    this._pricing = next;
    this._writeAtomic(this.pricingFile, JSON.stringify(next, null, 2));
    return next;
  }
}

module.exports = { UsageHistory, DEFAULT_PRICING, PRICE_ROW_FIELDS, SUPERSEDED_DEFAULTS, priceAt };
