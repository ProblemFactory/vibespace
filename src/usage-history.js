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
const v8 = require('v8');
const { trackWorker } = require('./worker-memory.js');
const CP = require('./catalog-pricing.js'); // PURE: the price table's three sources — shipped, the installed Claude Code's catalog, the person (lane cli-update-needs-nothing)
const EH = require('./server/exit-hook.js'); // THE exit hook: a fold worker asleep in a read is never joined (lane usage-fold-worker-exit-hook)

// API-equivalent prices, USD per MILLION tokens. Subscription sessions don't
// actually cost this — it's shown as a reference ("what this would cost on the
// API"). Official Anthropic pricing per platform.claude.com/docs/.../pricing,
// as of 2026-07-09 (researched + cross-verified). Tier matched by substring of
// the model id, LONGEST key first — so every retired generation that a newer
// family key would also match carries its own exact key (Opus 4/4.1/3, Haiku
// 3/3.5, Mythos Preview below): without one it silently borrowed the newer
// generation's price. Editable at data/usage-history/pricing.json.
// round 4 (true words 6): a re-walk over a COLD ledger reads the tails of the shards it appends to — at least 256 KB, twice
// what it appends, at most 4 MB a shard (the rows a killed walk appended are the last ones)
const TAIL_DEDUP_MIN = 256 * 1024, TAIL_DEDUP_MAX = 4 * 1024 * 1024;
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
  // Fable 5.2 / Mythos 5.2 (2026-11-09, lane fable-52-cli-321): $8/$40, cache write 5m $10 / 1h $16, cache hit $0.20
  // (0.025× base) — claude.com/pricing and platform.claude.com/docs/en/about-claude/pricing read 2026-11-09, the
  // same as CLI 2.1.321's catalog tier `tier_8_40_cache_read_0_20`. Without these keys 'claude-fable-5-2' matched
  // only `fable` (Fable 5: +25 % on input / output / cache writes, 5× on cache hits) and 'claude-mythos-5-2' only
  // `mythos`. Longest key wins: '…-5-2' and '…-5-2[1m]' land here, 5-1 and 5 keep theirs. Fast mode (2×, $16/$80)
  // is NOT priced: the ledger keeps no `usage.speed` (the CLI writes it on every transcript usage block).
  'fable-5-2': { input: 8, output: 40, cacheWrite5m: 10, cacheWrite1h: 16, cacheRead: 0.2 },
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
  'mythos-5-2': { input: 8, output: 40, cacheWrite5m: 10, cacheWrite1h: 16, cacheRead: 0.2 },   // Fable 5.2's tier (above)
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

// THE INSTALLED CLAUDE CODE'S OWN PRICES (lane cli-update-needs-nothing, ruling R3): src/server/cli-model-catalog.js reads
// the binary's catalog and hands its rows here (setCatalogPricing); every live instance's effective table = the table on
// disk ⊕ that layer (src/catalog-pricing.js: the person first; an own shipped row vs the catalog by the newer of the CLI's
// BUILD_TIME and SHIPPED_PRICES_CHECKED, a tie to the shipped row; a family / default fallback yields to the catalog).
// SHIPPED_PRICES_CHECKED = the day DEFAULT_PRICING was last checked against the public price page.
const SHIPPED_PRICES_CHECKED = '2026-11-09';
let CATALOG_PRICES = null;
// B2 (acceptance r2): a disagreement is said when it comes to EXIST — at the read, at boot, at the person's save: every
// recomputation hands its list to the hub's catalog module (said once each there; nothing here keeps a memory)
let ON_DISAGREE = null, PRICE_IDS = 0;
function onPriceDisagreements(fn) { ON_DISAGREE = typeof fn === 'function' ? fn : null; }
const PRICED = new Set(); // WeakRefs of the live instances (a migration builds its own beside the server's)
function setCatalogPricing(layer) {
  CATALOG_PRICES = layer && layer.rows ? layer : null;
  let said = null;
  for (const ref of [...PRICED]) {
    const h = ref.deref();
    if (!h) { PRICED.delete(ref); continue; }
    h._pricing = h._withCatalog(h._pricingFile || h._pricing);
    if (said === null) said = h._priceDisagreements || [];
  }
  return said || [];
}

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
const WARM_SLICE_BYTES = SCAN_BUDGET_BYTES; // the boot warm's slice (B-1319): the same MiB a walk tick takes
const TRIM_BATCH_ROWS = 16384; // …and its window slide, rows moved cold per step (~17 ms here)
const PROBE_BYTES = 64; // the append-only proof: the last bytes before a shard's old end (B-9428 r3)
// lane ledger-dedup-law (B-7f9e) — the latent twin of the 23.8 GiB shard: the SYNC load read a shard's whole unread tail in
// ONE Buffer.alloc(to - from) (a first load of a 24 GiB tail = 24 GB), and a reader that took the stepped warm over parsed
// the rest in its own tick. The sync path now reads the same MiB slices the warm does (it still never yields); no ledger row
// is near a MiB, so bytes with no newline within LINE_MAX_BYTES are no row (skipped, said once per shard); a reader finishes
// a pending warm itself only while ≤ TAKEOVER_MAX_BYTES are left (≈ 8 steps: inside the boot law's 250 ms) — past it the
// async readers wait for the warm and the sync ones answer from the rows loaded so far, naming it (`ledgerLoading()`).
const TAIL_STEP_BYTES = WARM_SLICE_BYTES;
const LINE_MAX_BYTES = TAIL_STEP_BYTES;
const TAKEOVER_MAX_BYTES = 8 * WARM_SLICE_BYTES;
// r3: EVERY state a paused shard's remedy can be in — the notice (src/server/ledger-shape-notice.js D_NOW) and the Usage
// window (src/lib/usage-ledger-note.js) each have a row for every one (test-ledger-whole-law ⑨ walks this list)
const REMEDY_STATES = Object.freeze(['running', 'judging', 'failed', 'not-rewritten', 'insufficient', 'proven-over', 'ids', 'none']);
/** THE ACK (r5) — ONE verdict for every road that commits a device's cursor: the live push's ack (server.js
 *  `hosts.onUsageEvents`) and the harvest's hub-kept cursor (`ingestRemoteEvents`). A batch is acked when EVERY row of it is
 *  durable — appended, one the ledger or its hold already had, or HELD beside its month's file: a pause alone never
 *  withholds it (r4's answer said `paused` whenever ANY month was out of shape, and the push road acked only without it —
 *  the incident's re-send loop on the main road). Never acked: a batch deferred (an index or a hold still loading — the
 *  device keeps it, bounded by the deferral) or one with a month whose hold could not be written (`holdFailed` names the
 *  months; the device sends the batch again, the rest of it costs zero bytes). PURE. */
function ackOf(r) { return !!(r && typeof r === 'object' && !r.deferred && !r.error && !(Array.isArray(r.holdFailed) && r.holdFailed.length)); }
function probeHolds(fp, at, probe) {
  if (!probe || !probe.length) return true;
  let fd; try { fd = fs.openSync(fp, 'r'); } catch { return false; }
  try { const b = Buffer.alloc(probe.length); return fs.readSync(fd, b, 0, b.length, at - probe.length) === b.length && b.equals(probe); } catch { return false; } finally { fs.closeSync(fd); }
}
function readBytesSync(fp, a, b) { const out = Buffer.alloc(Math.max(0, b - a)); let fd; try { fd = fs.openSync(fp, 'r'); fs.readSync(fd, out, 0, out.length, a); } catch { } finally { if (fd !== undefined) fs.closeSync(fd); } return out; }
const COLD_WORKER_HEAP_MB = 1536;
// Fold workers terminated but not exited (blocked in a sync read — the storage is not answering): r4, verify #2.
// Process-wide: while one is stuck no fold worker starts (they would STACK, +40 MB each, nobody told).
const STUCK = new Set(); // the cold fold's worker heap cap: one month of cold lines + the accumulator (B-9428 r2)
// Every fold worker not yet exited → its thread's id (/proc/self/task; null where /proc named none). process.exit()
// JOINS worker threads, and one asleep in a read is never joined: the restart waited for an external SIGKILL. At the
// join — after every 'exit' listener, so the stores' flushes keep their order — the in-flight ones are terminated (the
// join's own first step; a fold that is merely busy leaves in ms) and all get EH.EXIT_BOUND_MS to leave; past it the
// process ends without them (lane usage-fold-worker-exit-hook, src/server/exit-hook.js).
const LIVE = new Map();
function foldJoinJudge() {
  if (!LIVE.size) return null;
  for (const w of LIVE.keys()) if (!STUCK.has(w)) { try { w.terminate().catch(() => { }); } catch { } }
  const live = [...LIVE].map(([w, tid]) => ({ tid, stuck: STUCK.has(w) }));
  const n = EH.unjoinable(live, EH.threadsLeft(live.map((x) => x.tid).filter(Boolean))).length;
  return n ? `[usage] ${n} stuck fold worker(s) cannot be joined — exiting without them` : null;
}
// THE LEDGER REBUILD OFF THE LOOP (B-748f, the never-block law): a rebuild parses the whole ledger in the fold worker;
// its hot rows and ids come back as v8-serialized chunks of this many rows, ONE chunk deserialized per loop turn
// (~2 ms a chunk of 485 B rows measured here) while the previous cache keeps serving.
const HOT_CHUNK_ROWS = 2048;
// A failed rebuild keeps the previous cache and tries again no sooner than this, doubling to the cap — an
// out-of-memory or stuck worker would otherwise respawn on every reader's pass.
const REBUILD_RETRY_MS = 60e3, REBUILD_RETRY_MAX_MS = 15 * 60e3;
// L0 (design 011): how often the walk's writer looks for cursor keys whose
// transcript is gone — one stat per key (~45 ms for production's 37 024 keys,
// measured 2026-10-03), so at most hourly, and on the first walk after boot.
const CURSOR_PRUNE_MS = 3600 * 1000;
const CURSOR_SLICE_MS = 20;   // lane ci-351-reds: the walk's prune pass hands the loop back after this much of the real clock

// B1's ring: ARR_CAP entries of typed columns (8 × 6 + 4 × 4 = 64 bytes an entry ≈ 6.4 MB at 100 000), allocated at the
// first arrival after the first whole pass; a name (account key, account, backend, model) is interned once per cache.
// THE NAMES' CEILING (B r2): a table that reaches ARR_NAMES_MAX names RESTARTS the log — its names are dropped and `start`
// moves to the next sequence number, so every mark before it is no longer held (that slot walks, master's road); the
// sequence numbers go on rising (a mark is never re-used for another entry).
const BOOT_RETRY_MS = 5000, BOOT_RETRY_MAX_MS = 120000; // ledger-boot-load: a failed first load in the fold worker is tried again at the next ask after 5 s, 10 s … ≤ 2 min
// the follow-up (主开发 09:36Z): «bounded by the try» is something a person can sit through — a reader (a route, the scan, the
// gate's wait) waits for the try under way at most this, then is answered LOADING while the try goes on (a hung worker is
// otherwise bounded only by the fold deadline: ten minutes a try)
const BOOT_READER_WAIT_MS = 10000;
const ARR_CAP = 100000, ARR_NAMES_MAX = 4096;
const HOST_INDEX_KEEP_MS = 8 * 86400e3, HOST_INDEX_MAX_ROWS = 200000; // B2 r2: the dark-host index keeps 8 days (the question asks 7); past 200 000 rows (≈ 2.4 MB) it keeps the 8 days behind its newest row
function _logArrival(c, ev) {
  let L = c.arr;
  if (L && (L.names.key.length >= ARR_NAMES_MAX || L.names.acct.length >= ARR_NAMES_MAX || L.names.be.length >= ARR_NAMES_MAX || L.names.model.length >= ARR_NAMES_MAX)) {
    const full = Object.keys(L.names).filter((k) => L.names[k].length >= ARR_NAMES_MAX).join(', ');
    L.names = { key: [], acct: [], be: [], model: [] }; L.ids = { key: new Map(), acct: new Map(), be: new Map(), model: new Map() }; L.start = L.seq; L.restarts = (L.restarts || 0) + 1;
    if (L.restarts === 1) { // B r3: A STAND-DOWN IS SAID — once per ledger cache (the census counts the later ones)
      try { console.warn(`[usage] the arrival log restarted at its ${ARR_NAMES_MAX}-name ceiling (${full}) — an interval last asked before sequence ${L.seq} is walked again as before`); } catch { }
      try { global.__vsEvent?.('usage-arrival-log-restarted', full); } catch { }
    }
  }
  if (!L) {
    L = c.arr = { cap: ARR_CAP, seq: 0, start: 0, restarts: 0, ts: new Float64Array(ARR_CAP), tok: [0, 1, 2, 3, 4].map(() => new Float64Array(ARR_CAP)), key: new Int32Array(ARR_CAP), acct: new Int32Array(ARR_CAP), be: new Int32Array(ARR_CAP), model: new Int32Array(ARR_CAP),
      names: { key: [], acct: [], be: [], model: [] }, ids: { key: new Map(), acct: new Map(), be: new Map(), model: new Map() } };
  }
  const id = (k, v) => { const m = L.ids[k]; let x = m.get(v); if (x === undefined) { x = L.names[k].length; L.names[k].push(v); m.set(v, x); } return x; };
  const j = L.seq % L.cap;
  L.ts[j] = ev.ts || 0;
  const t = [ev.i, ev.o, ev.cw5, ev.cw1, ev.cr];
  for (let k = 0; k < 5; k++) L.tok[k][j] = t[k] === undefined ? NaN : t[k] === null ? 0 : t[k]; // an absent count prices as NaN, a null as 0 — as the walk's row does
  L.key[j] = id('key', ev.acct || globalUsageKeyOf(ev.be)); L.acct[j] = id('acct', ev.acct === undefined ? undefined : ev.acct); L.be[j] = id('be', ev.be); L.model[j] = id('model', ev.model);
  L.seq++;
}

class UsageHistory {
  // resolveAccount(acctId) → { type:'subscription'|'api'|'codex-subscription', name, tail } | null
  // Lets the ledger BAKE which account (and its billing TYPE) each request used,
  // so subscription usage (plan quota) and API-key usage (real $) never mix, and
  // the label survives even if the account is later deleted.
  // scanBudgetBytes / scanYield (2.369.167, perf ⑥): the in-process walk
  // yields to `scanYield()` every `scanBudgetBytes` of consumed transcript
  // bytes (default 1 MiB / two setImmediate hops — lane ci-351-reds: ONE immediate queued from a poll-phase callback
  // runs in that same loop iteration, no timer between; the second lands past the next timers phase). Injected only by the parity suite,
  // which holds the yield shut to prove no reader sees a half-walked ledger.
  constructor({ dataDir, homeDir = os.homedir(), resolveAccount = () => null,
    scanBudgetBytes = SCAN_BUDGET_BYTES, scanYield = () => new Promise((r) => setImmediate(() => setImmediate(r))), paused = () => false,
    firstLoadInWorker = false }) {
    this.firstLoadInWorker = !!firstLoadInWorker; // ledger-boot-load: the hub's ledger takes its first load in the fold worker
    holdRoadInstall(); // r11: the hold road (src/usage-hold-road.js) joins the prototype with the first instance — below the class
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
    this.reloadCursors = () => { this.settleCursors(); this._cursors = timedSync('usage-cursors.read', () => this._loadCursors()); };
    // …and the same for the EVENTS (2026-09-10). `_loadEvents` keeps a byte
    // watermark per shard and only reads the appended tail, so a migration
    // that REWRITES a shard in place (the origin backfill) is invisible to an
    // already-warm cache — and `_evCache.rids` would keep serving the
    // pre-migration objects for the life of the process. Boot re-reads after
    // runLocalMigrations, exactly like reloadCursors.
    this.reloadEvents = () => { this._rebuildInWorker('a reload after a repair'); if (this._index) this._index.recover(); }; // …and the index re-checks its shard marks (B-748f: rebuilt in the worker, the old cache serving until the swap)
    this._pricing = this._loadPricing();
    this._pricingFile = this._pricing; this._pricing = this._withCatalog(this._pricingFile); PRICED.add(new WeakRef(this)); // the effective table (lane cli-update-needs-nothing)
    this._scanning = false;
    this._lastScan = 0;
    // lane ledger-dedup-law: F1's per-shard rid index, F4's sampled shapes + paused shards (r4: host × month), the dedup jobs
    // in flight, the holds of the paused months (r4), F2's hub-kept device cursors (one file per machine beside the ledger),
    // the duplicates journal's per-host counts
    this._ingestIx = new Map(); this._shapes = new Map(); this._pausedShards = new Map(); this._proven = new Map(); this._dedupJobs = new Map(); this._remedies = new Map(); this._judging = new Map(); this._judgeKick = new Map();
    this._holds = new Map(); this._heldList = null; this._holdGens = new Map(); this._dropFiles = new Map(); // r6: the newest hold generation of each (month, host); the set files listed
    this._diskFiles = new Set(); this._listFail = null; this._listing = null; this._inflight = new Set(); // r8: the segment files on disk; the listing's failure state; the hold road's promises in flight
    this._readFail = new Map(); this._lines = new Map(); // r9: each hold's failed read-back (its state, `_readFailed`); a line many batches meet, said once a minute
    this._retries = new Map(); // r11: an act tried again at most once a window, on its own clock (`_retryPaced`)
    this._hostCursors = new Map(); this._dupLog = new Map();
    this.hostCursorsDir = path.join(this.dir, '_host-cursors');
    this.heldDir = path.join(this.dir, '_held');
    this.onShape = null; // (event) — {kind: 'paused' | 'resumed' | 'dedup', …}: server.js files / resolves the named notice
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
    if (changed) { this._rebuildInWorker('a re-attribution rewrote shards'); if (this._index) this._index.recover(); } // sizes may match — force a clean reload (the index re-checks its marks)
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
    this._scanning = true; this._lastReWalked = 0;
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
      // round 3 (smaller 5): THE RE-WALK AFTER A KILL RE-APPENDS NOTHING IT ALREADY APPENDED — a kill between the shard append
      // and the cursor write re-walks those rows (20 kills: 1 128 rows for 152 request ids, compounding). The ledger knows
      // every request id it holds once warm: the walk waits for the warm (its rows are in memory; the checks below re-run
      // after the wait) and the commit skips every row whose id the ledger already has
      // ledger-boot-load round 2 — NOTHING WAITS ON A LOAD THAT IS FAILING (a first load whose tries failed kept this walk pending
      // for good: every later scan() answered skipped, GET /api/usage-stats and the rid / mid lookups awaited scanSettled() and
      // never reached their LOADING answer, the hub's own turns were not added): on the hub's first load the walk waits for the
      // TRY under way only — between tries it goes on at once and its commit dedups by the shards' tails (the cold road below)
      if (typeof this.whenWarm === 'function' && this._evCache) { try { if (this._booting()) { const b = this._boot; if (b && b.job) await this._withinTry(b.job, () => null, b); } else await this.whenWarm(); } catch { } } // follow-up: a hung try is waited for until its deadline only (the try's start + BOOT_READER_WAIT_MS)
      // ROUND 4 (true words 6): ON A COLD LEDGER — the boot's own order: the walk runs BEFORE the warm — the rows a killed walk
      // appended (its cursor write lost) are the TAIL of their shards: each shard this walk appends to has its last bytes read
      // (fs.promises, ≤ TAIL_DEDUP_MAX) and a row whose request id is there is not appended again (20 kills: bounded)
      let tailRids = null;
      if (!this._evCache || (typeof this.ledgerLoading === 'function' && this.ledgerLoading())) {
        tailRids = new Set();
        for (const [shard, lines] of Object.entries(shardBuffers)) {
          if (!lines.length) continue;
          let fh = null;
          try {
            fh = await fs.promises.open(shard, 'r');
            const st = await fh.stat(), want = Math.min(TAIL_DEDUP_MAX, Math.max(TAIL_DEDUP_MIN, 2 * lines.reduce((a, l) => a + l.length + 1, 0))), n = Math.min(st.size, want);
            const b = Buffer.alloc(n); await fh.read(b, 0, n, st.size - n);
            for (const l of b.toString('utf8').split('\n')) { if (!l) continue; let rid = null; try { rid = JSON.parse(l).rid; } catch { rid = null; } if (rid) tailRids.add(rid); }
          } catch { } finally { try { if (fh) await fh.close(); } catch { } }
        }
      }
      // A repair re-read the cursor store WHILE this walk was parked at a
      // budget point (reloadCursors after a migration): the walk advanced the
      // map the repair replaced, so writing it back would resurrect what the
      // repair dropped (the 2.369.85 class). Drop this walk whole — the next
      // scan re-walks from the repaired cursors; nothing was appended yet.
      if (this._cursors !== cursorsAtStart) return { added: 0, filesTouched, dropped: 'cursors-reloaded' };
      // lane ci-351-reds (2026-10-24): the hourly prune's stat pass — one stat per cursor, 8 587 on the measured boot = a
      // 105 ms tick, 243–268 ms on the hosted runners — runs HERE in CURSOR_SLICE_MS slices through the walk's own yield,
      // before the commit point (the reload check below covers its turns too); its drops land AT the commit, as before
      const deadFacts = Date.now() - (this._cursorsPrunedAt || 0) >= CURSOR_PRUNE_MS ? await this._deadCursorsSliced(walk.cursors) : undefined;
      if (this._cursors !== cursorsAtStart) return { added: 0, filesTouched, dropped: 'cursors-reloaded' };

      // THE ONE COMMIT POINT — synchronous, so no reader interleaves between
      // the shard appends and the cursor write. B-6ded: the walk advanced its OWN copies of the cursors (src/usage-walker.js);
      // they become this ledger's map only below, once every row is in its shard — a walk the mount gate stopped, one that
      // threw, or an append that failed leaves `_cursors` as the walk found it, and the next walk re-reads those bytes
      let appendedNow = false, reAppended = 0;
      const knows = this._evCache && !(typeof this.ledgerLoading === 'function' && this.ledgerLoading()) ? (id) => this.ledgerKnowsId(id) : tailRids ? (id) => tailRids.has(id) : null;
      if (knows) for (const shard of Object.keys(shardBuffers)) shardBuffers[shard] = shardBuffers[shard].filter((l) => { let rid = null; try { rid = JSON.parse(l).rid; } catch { } if (rid && knows(rid)) { reAppended++; return false; } return true; });
      added -= reAppended;
      if (reAppended) console.log(`[usage-history] the walk met ${reAppended} request${reAppended === 1 ? '' : 's'} the ledger already holds (a re-walk after a lost cursor write${tailRids ? ' — the ledger cold: its shards\' tails read' : ''}) — not appended again`);
      this._lastReWalked = reAppended;
      for (const [shard, lines] of Object.entries(shardBuffers)) {
        if (lines.length) { appendedNow = true; const text = lines.join('\n') + '\n'; timedSync('usage-shards.write', () => fs.appendFileSync(shard, text)); this._pushIndex(shard, text); if (this._evCache) this._evCache.checkedAt = 0; } // our own append ⇒ next _loadEvents re-checks (2.369.36 throttle)
      }
      // round 2 (smaller 1): THE CURSOR FOLLOWS ITS APPEND IN ORDER — after rows were appended, the cursors are the writer's
      // NEXT write (never its pace): a kill between the two re-appends at most what one cursor write's time let through
      // (the readers' rid dedup absorbs those rows), never a window per kill
      this._cursors = walk.cursors;
      if (this._writeCursors(deadFacts) && appendedNow) { try { require('./store-writer.js').storeWriter().durable(this.cursorsFile).catch(() => { }); } catch { } }
      this._lastScan = Date.now();
    } catch (e) {
      if (e && e.paused) return { added: 0, filesTouched: 0, paused: true }; // the mount-health gate stopped it mid-walk (the cursors as it found them)
      console.error('[usage-history] scan failed:', e && e.message);
      return { added: 0, filesTouched, error: String((e && e.message) || e) };
    } finally { this._scanning = false; }
    return { added, filesTouched, reWalked: this._lastReWalked || 0 };
  }

  /** Remote-host events (2.127.0): ingest the NDJSON a host-side
   *  vibespace-usage-scan run returned. Attribution is baked per host
   *  (acct 'host-<id>', atype 'host') so remote usage NEVER mixes with local
   *  accounts; rid is namespaced per host. Appends to the SAME monthly shards,
   *  so aggregation/window filters just work.
   *  THE LEDGER LAW (lane ledger-dedup-law F1, B-7f9e): a re-emission costs ZERO bytes — an event whose rid the target
   *  shard already holds (the ingest's own rid index, `_ingestIndex`) or that the batch already carried is counted as a
   *  duplicate and never appended (the read-time dedup absorbed it, while a never-committed device cursor re-sent the same
   *  window at every harvest and the shard grew 23.8 GiB). → `{added, appended, duplicates, held?, paused?, pausedMonths?,
   *  holdFailed?, ack}` (`added` = `appended`, the callers' old field; r4: `held` = this batch's rows of a month out of
   *  shape, HELD beside the ledger — that month paused (`paused` = the first such month's record, `pausedMonths` every one,
   *  r5), every other month appended; r5: `holdFailed` = [{month, shard, error}] — a month whose hold could not be written;
   *  `ack` = `ackOf` of this answer) | `{…, deferred, ack: false}` (a big shard's index or a big hold still loading in steps
   *  — nothing appended; the device keeps the events). `cursors` (F2): the device cursor this batch was read from —
   *  committed beside the ledger AFTER the appends and the holds (the hub's durable ingest IS the commit) when the batch is
   *  ACKED (r5: the push road's verdict, the same function). Write order: hold → ledger → cursor — crash-safe (a crash
   *  between two re-sends rows that cost zero bytes), not fsync-durable (the project's appends never fsync). */
  ingestRemoteEvents(hostId, hostName, text, { cursors = null, since = null } = {}) {
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
      (shardBuffers[shard] = shardBuffers[shard] || []).push({ rid: ev.rid, ts: ev.ts, line: JSON.stringify(ev) });
      added++;
    }
    return this._ingestBatch(hostId, hostName, shardBuffers, added, { cursors, since });
  }
  _appendRemote(shardBuffers, shards) {
    let appended = 0, duplicates = 0, lastTs = 0, lastRid = null;
    const batch = new Set();
    for (const shard of shards) {
      const ix = this._ingestIx.get(shard), keep = [];
      for (const e of shardBuffers[shard]) {
        if (ix.rids.has(e.rid) || batch.has(e.rid)) { duplicates++; continue; }
        batch.add(e.rid); keep.push(e);
        if (e.ts >= lastTs) { lastTs = e.ts; lastRid = e.rid; }
      }
      if (!keep.length) continue;
      const text = keep.map((e) => e.line).join('\n') + '\n';
      timedSync('usage-shards.write', () => fs.appendFileSync(shard, text)); this._pushIndex(shard, text); if (this._evCache) this._evCache.checkedAt = 0; // our own append ⇒ next _loadEvents re-checks (2.369.36 throttle)
      for (const e of keep) ix.rids.add(e.rid); ix.rows = (ix.rows || 0) + keep.length; // the index knows what it appended (and where the shard ends now)
      try { const st = fs.statSync(shard); if (!ix.ino) ix.ino = st.ino; if (st.ino === ix.ino) ix.size = st.size; } catch { }
      appended += keep.length;
    }
    return { appended, duplicates, lastTs, lastRid };
  }

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
  _writeCursors(deadFacts) {   // deadFacts: the walk's sliced prune pass (undefined = not run ⇒ the hourly sync prune when due)
    const now = Date.now();
    if (deadFacts !== undefined) { this._cursorsPrunedAt = now; this._dropDeadCursors(deadFacts); }
    else if (now - (this._cursorsPrunedAt || 0) >= CURSOR_PRUNE_MS) { this._cursorsPrunedAt = now; this._pruneDeadCursors(); }
    const json = JSON.stringify(this._cursors);
    if (json === this._cursorsJson || json === this._cursorsOwed) return false;
    // lane hub-loop-stalls commit 2: the cursors reach the disk through THE STORE WRITER (its own thread; the owner's hub
    // held its loop on this rename twice ≥ 1 s in six hours) — the text the writer takes is the latest at its turn; a lost
    // last write costs a re-walk of the files past the written cursors (the ledger's dedup makes a re-walk idempotent)
    this._cursorsOwed = json;
    require('./store-writer.js').storeWriter().dirty(this.cursorsFile, { name: 'usage-cursors.write',   // store-timing's row (the writer records under it)
      produce: () => { const t = this._cursorsOwed; this._cursorsWriting = t; return t == null || t === this._cursorsJson ? null : t; },
      onWritten: (ok) => { if (ok) { this._cursorsJson = this._cursorsWriting; if (this._cursorsOwed === this._cursorsWriting) this._cursorsOwed = null; } } });
    return true;
  }
  /** the cursors written NOW, on this thread (a caller that reads the file next — a suite) */
  flushCursors() { try { require('./store-writer.js').storeWriter().flushSync([this.cursorsFile]); } catch { } }
  /** lane hub-loop-stalls commit 2: before anything OUTSIDE this object reads or rewrites _cursors.json (the boot's one-shot
   *  migrations, then reloadCursors): an owed write is dropped and a write in flight waited on — no older state lands after
   *  theirs; the walk re-derives what it held (the ledger's dedup makes the re-walk idempotent) */
  settleCursors() { try { require('./store-writer.js').storeWriter().forget(this.cursorsFile); } catch { } this._cursorsOwed = null; }
  _pruneDeadCursors() {   // the prune in one go (the hourly fallback, and a suite's seam): the same steps, driven straight through
    const steps = this._deadCursorSteps(this._cursors);
    let r; do { r = steps.next(); } while (!r.done);
    return this._dropDeadCursors(r.value);
  }
  /** THE PRUNE'S FACTS, one cursor key per step (a generator, like the walk: driven straight through by the sync form, in
   *  slices by the walk) → { dead: [[key, root]], live: Set<root> }, or null when no root is a readable directory. */
  *_deadCursorSteps(cursors) {
    const roots = [this.projectsDir, this.codexSessionsDir].filter((r) => { try { return fs.statSync(r).isDirectory(); } catch { return false; } });
    if (!roots.length) return null;
    const dirOk = new Map(), dead = [], live = new Set();
    for (const k of Object.keys(cursors)) {
      const r = roots.find((x) => k.startsWith(x + path.sep));
      if (!r) continue;
      try { fs.statSync(k); live.add(r); } catch (e) {
        if (!e || e.code !== 'ENOENT') continue;
        const d = path.dirname(k);
        if (!dirOk.has(d)) { let ok = false; try { ok = fs.statSync(d).isDirectory(); } catch { } dirOk.set(d, ok); }
        if (dirOk.get(d)) dead.push([k, r]);
      }
      yield;
    }
    return { dead, live };
  }
  async _deadCursorsSliced(cursors) {   // the steps in CURSOR_SLICE_MS slices (the real clock) across the walk's own yield
    const steps = this._deadCursorSteps(cursors);
    let at = performance.now();
    for (;;) {
      const r = steps.next();
      if (r.done) return r.value;
      if (performance.now() - at >= CURSOR_SLICE_MS) { if (typeof this._scanYield === 'function') await this._scanYield(); at = performance.now(); }
    }
  }
  _dropDeadCursors(facts) {   // a dead key goes only while its root still holds a live one (an emptied mount point drops nothing)
    if (!facts) return 0;
    let dropped = 0;
    for (const [k, r] of facts.dead) if (facts.live.has(r)) { delete this._cursors[k]; dropped++; }
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
  _rateFor(acct, tier, ts, prompt, model) {
    const ov = acct ? this._pricing.accounts?.[acct] : null;
    // an account's override of the row the model falls on WITHOUT the catalog shields THAT account's model (law B, lane cli-update-needs-nothing)
    const ovRow = ov?.tiers ? (ov.tiers[tier] || (model != null && this._pricing.sources?.[tier]?.from === 'catalog' ? ov.tiers[this._fileTier(model)] : undefined)) : undefined;
    const base = priceAt(ovRow || this._pricing.tiers[tier] || this._pricing.tiers._default, ts, prompt);
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
    const p = this._rateFor(ev.acct, tier, ev.ts, prompt != null ? prompt : (ev.i || 0) + (ev.cr || 0) + (ev.cw5 || 0) + (ev.cw1 || 0), ev.model);
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
    // ONE SNAPSHOT (usage-ledger-walk B r2, MUST 2): inside a pinned ask (_pinLoad) nothing loads again — its version, its
    // arrival mark and its sums are of the ledger as the pin's own load left it
    if (this._pinDepth > 0 && this._evCache) return this._evCache.events;
    // NO READER LOADS THE LEDGER IN ITS OWN TICK (lane ledger-boot-load — the owner's boot: the pool engine's first anchor sweep at
    // +20 s → the whole-ledger gate's prime() → the estimator's first count parsed and hashed all 717 MB in ONE tick, 12.2 s):
    // the hub's ledger (`firstLoadInWorker`) takes its FIRST load in the fold worker — the road a reload takes — and every reader
    // meanwhile answers from an empty cache that says «loading» (ledgerLoading ⇒ {booting}); no line is read on the loop.
    if (this._booting()) return this._bootLoad();
    // a reader during the stepped boot warm (B-1319, warmStepped): it takes the warm's pass over and finishes it HERE,
    // in its own tick — a money reader never answers from half a ledger. Lane ledger-dedup-law (the latent twin): only
    // while ≤ TAKEOVER_MAX_BYTES are left (≈ 8 steps, inside the boot law) — past it the warm keeps its pass, the async
    // readers wait for it (warmSettled) and a sync one answers from the rows loaded so far, named (`ledgerLoading()`)
    const p = this._evCache && this._evCache.pending;
    if (p) {
      if (this._pendingLeft() > this._takeoverMax()) return this._evCache.events;
      this._evCache.pending = null; for (let r = p.next(); !r.done; r = p.next());
    }
    const steps = this._loadSteps(); for (let r = steps.next(); !r.done; r = steps.next()); // chunkBytes Infinity: never yields
    return this._evCache.events;
  }
  /** An empty cache (the load pass fills it; the boot load's placeholder stays empty until the worker's cache is swapped in). */
  _newCache() { return { consumed: new Map(), marks: new Map(), events: [], sizes: [], locs: [], hrh: [], hotBytes: 0, rids: new Set(), mids: new Set(), srcWm: new Map(), hostAcct: new Map(), checkedAt: 0, cold: new CB.ColdSlab(), cutoff: -Infinity, walking: 0, shards: [], shardIx: new Map() }; }
  /** THE FIRST LOAD IN THE FOLD WORKER (lane ledger-boot-load): an empty placeholder cache marked `booting` (its generation new),
   *  and ONE rebuild job in the worker (usage-cold-worker.js parses and hashes every line off the loop; _stageBuilt hands the
   *  cache over a chunk a turn; _swapCache replaces the placeholder — its checkedAt 0, so the rows appended meanwhile are read
   *  from the worker's own marks, once). A worker that fails is said once by name and tried again at the next ask after a
   *  backoff — never a load on the loop. → the placeholder's (empty) rows */
  _bootLoad() {
    if (!this._evCache) {
      this.ledgerGen = (this.ledgerGen || 0) + 1;
      this._evCache = this._newCache(); this._evCache.booting = true; this._evCache.checkedAt = Infinity;
      this._evCache.loading = { booting: true, at: Date.now(), bytesLeft: this._unreadBytes() };
    }
    const b = this._boot || (this._boot = { at: Date.now(), tries: 0, fails: 0, retryAt: 0, job: null, tryP: null, err: null, done: null, landed: null, awaited: false, timer: null });
    if (!b.done) b.done = new Promise((r) => { b.landed = r; });
    if (!b.job && Date.now() >= b.retryAt) {
      b.tries++;
      this._rbFail = null; // the first load keeps its OWN backoff (5 s doubling ≤ 2 min; a reload's is 60 s ≤ 15 min)
      const t = this._requestRebuild('the first load');
      b.job = t.then(() => { this._boot = null; clearTimeout(b.timer); b.landed(); }, (e) => {
        b.job = null; b.fails++; b.err = String((e && (e.why || e.message)) || e).slice(0, 200); // the cause itself (the reload's sentence names a previous cache the boot has not)
        const wait = Math.min(BOOT_RETRY_MAX_MS, BOOT_RETRY_MS * 2 ** (b.fails - 1)); b.retryAt = Date.now() + wait;
        { const L = this._evCache && this._evCache.loading; if (L) { L.failed = b.err; L.fails = b.fails; L.nextTryAt = b.retryAt; } } // follow-up: ledgerLoading() carries the failure — the gate says it, with its cause
        if (b.fails === 1) { // SAID ONCE, by name — the tries after it are counted in the line that says it landed
          try { console.warn(`[usage] the ledger's first load in the fold worker failed (${b.err}) — the usage figures say «loading»; it is tried again after ${Math.round(wait / 1000)} s, then doubling to ≤ ${BOOT_RETRY_MAX_MS / 60e3} min — never parsed on the main loop`); } catch { }
          try { global.__vsEvent?.('usage-first-load-failed', b.err); } catch { }
        }
        if (b.awaited) this._bootRearm(b);
      });
      b.tryP = t.then(() => { }, () => { throw this._bootErr(b); }); b.tryP.catch(() => { }); // an async reader's wait: THIS try (after b.job's handler: b.err is set)
      if (b.nextR) { const r = b.nextR; b.next = null; b.nextR = null; this._withinTry(b.job, () => null).then(r); } // the waits for «the next try» end with this one (bounded)
      b.tryAt = Date.now();
    }
    return this._evCache.events;
  }
  /** The ledger's first load has not landed (the hub's ledger only — `firstLoadInWorker`). */
  _booting() { return !!this.firstLoadInWorker && (!this._evCache || !!this._evCache.booting); }
  /** A waiter (the anchor sweep's gate, the boot warm) is an ask still open: it asks again when the backoff ends. */
  _bootRearm(b) {
    if (b.job || b.timer || !b.fails || this._boot !== b) return;
    b.timer = setTimeout(() => { b.timer = null; if (this._boot !== b) return; b.retryAt = Math.min(b.retryAt, Date.now()); try { this._loadEvents(); } catch { } }, Math.max(0, b.retryAt - Date.now()));
    b.timer.unref?.();
  }
  _bootErr(b) {
    return Object.assign(new Error(`the usage ledger is still loading — its first load in the fold worker failed (${b.err}); it is tried again ${b.awaited ? 'in' : 'at the next ask after'} ${Math.max(0, Math.ceil((b.retryAt - Date.now()) / 1000))} s`), { code: 'LOADING', nextTryAt: b.retryAt });
  }
  /** A try still under way past BOOT_READER_WAIT_MS (follow-up): LOADING while it goes on — the time to ask again said. */
  _bootRunErr(b) {
    const next = Date.now() + (this.bootReaderWaitMs || BOOT_READER_WAIT_MS); // the window asks again then (answered at once while the try still runs past its deadline)
    return Object.assign(new Error(`the usage ledger is still loading — its first load in the fold worker has run ${Math.round((Date.now() - (b.tryAt || b.at)) / 1000)} s and goes on; ask again at ${new Date(next).toISOString().slice(11, 19)}Z`), { code: 'LOADING', nextTryAt: next, running: true });
  }
  /** A wait on a try, bounded (follow-up): `p` — or, once the bound passed, `onLate()` (the try goes on). With `b` (a READER: the
   *  scan, a route, a lookup) the bound is the TRY'S DEADLINE — its start + BOOT_READER_WAIT_MS — so the scan's wait and the
   *  reader's after it share ONE budget (round 2 of the follow-up: in series they held a request 20 s); without (the gate's
   *  wait, the next try's) it is BOOT_READER_WAIT_MS from now — a waiter that looks again is never answered at once (no spin). */
  _withinTry(p, onLate, b = null) {
    const wait = this.bootReaderWaitMs || BOOT_READER_WAIT_MS, left = b ? Math.max(0, (b.tryAt || b.at || Date.now()) + wait - Date.now()) : wait;
    let t = null; const late = new Promise((r) => { t = setTimeout(r, left); t.unref?.(); });
    return Promise.race([p.finally(() => clearTimeout(t)), late.then(onLate)]);
  }
  /** A PERSON'S RETRY (follow-up — the Usage window's Retry is attended): the first load is tried NOW, never after the
   *  unattended backoff (5 s doubling ≤ 2 min). → true when a try is under way. */
  retryBootLoad() {
    if (!this._booting()) return false;
    const b = this._boot; if (b && !b.job) { b.retryAt = Date.now(); if (b.timer) { clearTimeout(b.timer); b.timer = null; } } // the press REPLACES the re-arm timer (its failure arms the next at the doubled backoff)
    this._loadEvents();
    return !!(this._boot && this._boot.job);
  }
  /** A WAIT ON THE BOOT LOAD IS BOUNDED BY THE TRY (round 2 — this resolved only when a try LANDED, so a failing load kept every
   *  waiter for good): resolves when the try under way ends, landed or failed; inside a failed try's backoff, when the NEXT try
   *  ends (this wait is an open ask: that try starts when the backoff ends). Never rejects. A waiter that needs the ledger whole
   *  looks again (the whole-ledger gate re-reads ledgerLoading() and waits for the next try — one wait at a time). */
  bootLoadSettled() {
    const b = this._boot; if (!b || !b.done) return Promise.resolve();
    b.awaited = true;
    if (b.job) return this._withinTry(b.job, () => null); // never rejects: its two handlers return (follow-up: a hung try is waited for BOOT_READER_WAIT_MS at most)
    this._bootRearm(b);
    return b.next || (b.next = new Promise((r) => { b.nextR = r; }));
  }
  /** The boot warm's span (server.js's bootTrace): resolves when the first load LANDS — the boot's own one wait, not a reader's. */
  bootLoadLanded() { const b = this._boot; return b && b.done ? b.done : Promise.resolve(); }
  /** An ASYNC reader's wait (aggregateAsync, eventForRid/Mid): the try under way — or, inside a failed try's backoff, its
   *  failure at once (code LOADING: the route says the ledger is still loading; never an answer from the empty cache). */
  _bootWait() {
    this._loadEvents();
    const b = this._boot;
    return !b ? null : b.job ? this._withinTry(b.tryP, () => { throw this._bootRunErr(b); }, b) : Promise.reject(this._bootErr(b)); // follow-up: a hung try ⇒ LOADING at its deadline
  }
  /** THE LOAD PASS (one implementation, two drivers): `_loadEvents` runs it to the end in one call; `warmStepped` hands
   *  the loop back at every `yield` — after each `chunkBytes` slice of a shard (each slice lands whole: its lines taken,
   *  the shard's place + append-proof moved past them) and between the heavy settle / sort steps. */
  *_loadSteps(chunkBytes = Infinity, trimBatch = TRIM_BATCH_ROWS) {
    const stepped = chunkBytes !== Infinity;
    if (!this._evCache) this.ledgerGen = (this.ledgerGen || 0) + 1; // a rebuilt cache = a new generation (cost memos keyed on it, r4)
    if (!this._evCache) this._evCache = this._newCache();
    const c = this._evCache;
    // inc-mtox23xw (2.369.36): this ran a readdir + a stat per shard on EVERY
    // call — and the estimator calls it once per anchor PAIR (thousands per
    // learn) → ~90 openat/s on the main thread. The ledger only grows through
    // scan() (which drops the cache), so a 1s re-check throttle loses nothing.
    if (Date.now() - (c.checkedAt || 0) < 1000) return c.events;
    c.checkedAt = Date.now();
    let files = [];
    try { files = fs.readdirSync(this.dir).filter(f => /^events-\d{4}-\d{2}\.ndjson$/.test(f)).sort(); } catch {}
    const pass = { seen: null, grew: false, cooled: false, added: 0 };
    // r3 (verify #13): a shard the cache read that is GONE ⇒ rebuild (every place in it is stale)
    // B-748f: with a whole cache the WORKER rebuilds (this pass goes on over the other shards); none yet ⇒ the first load starts over
    if (c.consumed.size) { const have = new Set(files); for (const fn of c.consumed.keys()) if (!have.has(fn)) { if (this._rebuildInWorker(`a shard vanished (${fn})`, c)) break; yield* this._loadSteps(chunkBytes, trimBatch); return; } }
    for (const fn of files) {
      const fp = path.join(this.dir, fn);
      let st; try { st = fs.statSync(fp); } catch { continue; }
      const consumed = c.consumed.get(fn) || 0, mark = c.marks.get(fn);
      // r3 (verify #10/#11): every (shard, offset) the cache holds is only good while the shard is the SAME
      // file grown by appends — another inode, a same-size rewrite (mtime moved, size not), or bytes before
      // the old end that changed (the append-only proof: the old last line's tail still at its old offset)
      // ⇒ rebuild from scratch. A shrink is a rewrite too (the 2026-09 rule).
      if (consumed && (st.size < consumed || (mark && (mark.ino !== st.ino || (st.size === consumed && mark.mtimeMs !== st.mtimeMs) || (st.size > consumed && !probeHolds(fp, consumed, mark.probe)))))) {
        const why = `${fn} was rewritten (${st.size < consumed ? 'it shrank' : mark.ino !== st.ino ? 'another file' : st.size === consumed ? 'same size, a new mtime' : 'bytes before its old end changed'})`;
        if (this._rebuildInWorker(why, c)) continue; yield* this._loadSteps(chunkBytes, trimBatch); return; // B-748f: the worker rebuilds, this pass keeps the old rows of it; no whole cache yet ⇒ the first load starts over
      }
      if (st.size === consumed) continue;
      if (!pass.seen) { // the first new bytes of this pass: slide the window (hourly, never under a walk), order the id indexes
        pass.seen = new Set();
        if (!c.walking && (c.cutoff === -Infinity || Date.now() - this._ledgerWindowMs() > c.cutoff + 3600e3)) this._trimHot();
        for (const k of Object.keys(c.cold.idx)) c.cold.idx[k].settle();
      }
      // the shard's new bytes, a slice at a time on BOTH paths (lane ledger-dedup-law: the sync path read the whole tail in
      // one allocation — a 24 GiB first load = 24 GB): `chunkBytes` on the stepped warm, TAIL_STEP_BYTES on the sync one
      // (which still never yields). A slice with no whole line in it is a row longer than a slice (read once, its own
      // bytes, ≤ LINE_MAX_BYTES), an unfinished last row (it waits for its newline), or bytes that are no row at all
      // (no newline within LINE_MAX_BYTES: skipped, said once per shard)
      for (let from = consumed, step = stepped ? chunkBytes : TAIL_STEP_BYTES; from < st.size;) {
        const to = Math.min(st.size, from + step);
        let end = this._consumeRange(c, fn, fp, st, from, to, consumed, pass);
        if (end === from) {
          const nl = this._nextNewline(fp, to, Math.min(st.size, from + LINE_MAX_BYTES));
          if (nl >= 0) end = this._consumeRange(c, fn, fp, st, from, nl + 1, consumed, pass);
          else if (st.size - from > LINE_MAX_BYTES) end = this._skipRange(c, fn, fp, st, from, from + LINE_MAX_BYTES, consumed);
          if (end === from) break; // an unfinished last row (or bytes that moved under the read): the next pass reads on from here
        }
        from = end;
        if (stepped) yield;
      }
    }
    if (pass.grew && c.hotBytes > this._ledgerHotMaxBytes()) { if (stepped) { yield; yield* this._trimSteps(trimBatch); } else this._trimHot(); }
    // a pass that loaded many cold rows (a boot, a rebuild after a rewrite) orders them NOW, inside the same
    // long load, not in the next query's walk planning (r3: a 13 M-row settle measured 5 s in a 30-day query)
    if (pass.cooled && c.cold.n - c.cold.sortedN > Math.max(65536, c.cold.n >> 2)) { if (stepped) yield; c.cold.settle(); for (const k of Object.keys(c.cold.idx)) { if (stepped) yield; c.cold.idx[k].settle(); } }
    if (pass.added > 65536 && (!c.sorted || c.sortedLen !== c.events.length)) { if (stepped) yield; this._sortHot(c); } // …and the hot rows' ts order (a 110 k-row sort measured 130 ms in the next query)
    if ((pass.cooled || pass.grew) && !c.overWarned && c.cold.bytes() > this._coldMaxBytes()) { // the declared ceiling, said once (verify #2)
      c.overWarned = true;
      try { global.__vsEvent?.('usage-cold-over-ceiling', String(Math.round(c.cold.bytes() / CB.MB))); } catch { }
      console.warn(`[usage] the ledger's cold columns passed their ${Math.round(this._coldMaxBytes() / CB.MB)} MB ceiling (${Math.round(c.cold.bytes() / CB.MB)} MB, ${c.cold.n} rows) — kept: the money readers' numbers never drop a row`);
    }
    c.whole = true; // a pass ran to its end: from now on a rebuild keeps serving this cache (B-748f)
  }
  /** One slice [from, to) of a shard's new bytes: its complete lines taken, the shard's place + append-proof moved past
   *  them (the proof = the last PROBE_BYTES before the place, never reaching back before this pass's start — what one
   *  whole-tail read would have kept). Returns the new place; `from` when the slice holds no complete line. */
  _consumeRange(c, fn, fp, st, from, to, passFrom, pass) {
    let buf;
    const fd = fs.openSync(fp, 'r');
    try {
      buf = Buffer.alloc(to - from);
      fs.readSync(fd, buf, 0, buf.length, from);
    } finally { fs.closeSync(fd); }
    const lastNl = buf.lastIndexOf(10); // complete lines only — a concurrent append may be mid-write
    if (lastNl < 0) return from;
    let sh = c.shardIx.get(fn);
    if (sh === undefined) { sh = c.shards.length; c.shards.push(fn); c.shardIx.set(fn, sh); }
    for (let at = 0; at <= lastNl;) {
      const nl = buf.indexOf(10, at);
      while (at < nl && buf[at] === 0) at++; // a zero-filled gap (a sparse / crash-truncated tail) glued to a row's start
      if (nl > at) {
        const line = buf.toString('utf8', at, nl);
        let ev = null; try { ev = JSON.parse(line); } catch { }
        if (ev) { const r = this._take(c, ev, sh, from + at, nl - at + 1, pass.seen, CB.idHash(line)); if (r === 1) { pass.grew = true; pass.added++; } else if (r === 2) pass.cooled = true; }
      }
      at = nl + 1;
    }
    const end = from + lastNl + 1, p0 = Math.max(passFrom, end - PROBE_BYTES);
    c.consumed.set(fn, end);
    c.marks.set(fn, { ino: st.ino, mtimeMs: st.mtimeMs, probe: p0 >= from ? Buffer.from(buf.subarray(p0 - from, lastNl + 1)) : readBytesSync(fp, p0, end) });
    return end;
  }
  /** Bytes with no newline within LINE_MAX_BYTES (a sparse or zero-filled region — no ledger row is near a MiB): the shard's
   *  place + append-proof move past them unread, said once per shard. → the new place. */
  _skipRange(c, fn, fp, st, from, end, passFrom) {
    const p0 = Math.max(passFrom, end - PROBE_BYTES);
    c.consumed.set(fn, end);
    c.marks.set(fn, { ino: st.ino, mtimeMs: st.mtimeMs, probe: readBytesSync(fp, p0, end) });
    c.skipped = (c.skipped || 0) + (end - from);
    if (!c.skipSaid) c.skipSaid = new Set();
    if (!c.skipSaid.has(fn)) { c.skipSaid.add(fn); console.warn(`[usage] ${fn}: ${end - from} bytes at offset ${from} hold no ledger row (no line end within ${LINE_MAX_BYTES} bytes) — skipped; the rows around them are read`); }
    return end;
  }
  /** The first newline in [from, to) of a file, read a step at a time into ONE buffer (never the span at once); -1 = none. */
  _nextNewline(fp, from, to) {
    if (to <= from) return -1;
    const buf = Buffer.alloc(Math.min(TAIL_STEP_BYTES, to - from));
    let fd; try { fd = fs.openSync(fp, 'r'); } catch { return -1; }
    try {
      for (let pos = from; pos < to;) {
        const n = fs.readSync(fd, buf, 0, Math.min(buf.length, to - pos), pos);
        if (n <= 0) return -1;
        const i = buf.subarray(0, n).indexOf(10);
        if (i >= 0) return pos + i;
        pos += n;
      }
      return -1;
    } finally { fs.closeSync(fd); }
  }
  /** The ledger's bytes not loaded yet (every shard's size past its place) — the takeover's bound. Never throws. */
  _unreadBytes() {
    const c = this._evCache;
    let left = 0;
    try { for (const f of fs.readdirSync(this.dir)) { if (!/^events-\d{4}-\d{2}\.ndjson$/.test(f)) continue; try { left += Math.max(0, fs.statSync(path.join(this.dir, f)).size - ((c && c.consumed.get(f)) || 0)); } catch { } } } catch { }
    return left;
  }
  _takeoverMax() { return this.takeoverMaxBytes || TAKEOVER_MAX_BYTES; }
  /** The bytes a pending warm has left (re-read at most once a second — the estimator calls a sync reader per anchor pair). */
  _pendingLeft() {
    const c = this._evCache;
    if (!c || !c.pending) return 0;
    if (!c.loading || Date.now() - c.loading.at >= 1000) c.loading = { bytesLeft: this._unreadBytes(), at: Date.now() };
    return c.loading.bytesLeft;
  }
  /** The hot rows in ts order (a STABLE sort: equal ts keep their load order). INCREMENTAL (hotfix usage-ledger-walk ④ — a
   *  fresh hub spent whole seconds re-sorting every hot row because one row arrived): rows only ever APPEND to `events`
   *  between sorts (a trim or a rebuild replaces the array and drops `sorted`), so the new tail is sorted alone and appended
   *  — or merged, old first on equal ts — which is the same order the full stable sort gives. */
  _sortHot(c) {
    const ts = (e) => e.ts || 0;
    const old = c.sorted, n0 = c.sortedLen;
    if (old && c.sortedOf === c.events && n0 >= 0 && n0 <= c.events.length) {
      const add = c.events.slice(n0).sort((a, b) => ts(a) - ts(b));
      if (!add.length) c.sorted = old;
      else if (!old.length || ts(add[0]) >= ts(old[old.length - 1])) c.sorted = old.concat(add);
      else {
        const out = new Array(old.length + add.length);
        let i = 0, j = 0, k = 0;
        while (i < old.length && j < add.length) out[k++] = ts(add[j]) < ts(old[i]) ? add[j++] : old[i++];
        while (i < old.length) out[k++] = old[i++];
        while (j < add.length) out[k++] = add[j++];
        c.sorted = out;
      }
    } else c.sorted = c.events.slice().sort((a, b) => ts(a) - ts(b));
    c.sortedLen = c.events.length; c.sortedOf = c.events;
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
    // THE ARRIVAL LOG (hotfix usage-ledger-walk B1): after the first whole pass every row that counts (not a remote host's own
    // unresolved bucket) is logged in the order it ARRIVES — what an addition to a cost needs, never the row (a backfill of
    // old rows stays in the cold columns, not resident as objects) — so a cached interval learns which of ITS account's
    // rows arrived since it was last asked, whatever their ts (usage-anchors costBetweenMulti).
    if (c.whole && !(ev.host && ev.atype === 'host')) _logArrival(c, ev);
    if (c.hours && typeof c.hours.add === 'function') { try { c.hours.add(ev); } catch { c.hours = null; } } // B3: the hour sums keep up (usage-anchors installs them)
    // THE (HOST, ACCOUNT) INDEX (hotfix usage-ledger-walk B2): a remote host's RESOLVED rows (an account, not the host's own
    // bucket) by their ts — the dark-taint question («which accounts did a dark host spend in the last 7 days») answered by
    // binary search (hostAccountsIn), never a 7-day walk. Rows only arrive within a generation; a rewrite is a new cache.
    // KEPT 8 DAYS (B r2): a row older than the index's floor is not held (an ask reaching before the floor walks); every
    // resolved remote row moves the version, held or not. THE ROW CEILING (no host need ever go dark): past
    // HOST_INDEX_MAX_ROWS held rows the index keeps the 8 days behind its newest row (never past the clock); if those alone pass
    // it, the index stands down for this cache (its floor +∞: every ask walks, master's loop).
    if (ev.host && ev.acct && ev.atype !== 'host') {
      const t = ev.ts || 0;
      c.hostAcctVer = (c.hostAcctVer || 0) + 1;
      if (!(t < (c.hostAcctFloor ?? -Infinity))) {
        if (!c.hostAcct) c.hostAcct = new Map();
        let byA = c.hostAcct.get(ev.host); if (!byA) c.hostAcct.set(ev.host, byA = new Map());
        let l = byA.get(ev.acct); if (!l) byA.set(ev.acct, l = { ts: [], sorted: true });
        if (l.ts.length && t < l.ts[l.ts.length - 1]) l.sorted = false;
        l.ts.push(t);
        if (t > (c.hostAcctNewest ?? -Infinity)) c.hostAcctNewest = t;
        if (c.hostAcctRows === undefined) { c.hostAcctRows = 0; for (const m of c.hostAcct.values()) for (const x of m.values()) c.hostAcctRows += x.ts.length; } else c.hostAcctRows++;
        const max = this.hostIndexMaxRows || HOST_INDEX_MAX_ROWS;
        if (c.hostAcctRows > max) {
          this._hostIndexPrune(c, Math.min(c.hostAcctNewest, Date.now()) - 7 * 86400e3, true);
          let n = 0; for (const m of c.hostAcct.values()) for (const x of m.values()) n += x.ts.length;
          if (n > max) { // 8 days alone pass the ceiling: the index stands down (every ask walks) — said once (B r3)
            c.hostAcctDown = { at: Date.now(), rows: n }; c.hostAcct = new Map(); c.hostAcctFloor = Infinity;
            try { console.warn(`[usage] the dark-host index stood down at its ${max}-row ceiling (${n} resolved remote rows in 8 days) — a dark host's accounts are found by walking 7 days of the ledger, as before`); } catch { }
            try { global.__vsEvent?.('usage-dark-index-stood-down', String(n)); } catch { }
            n = 0;
          }
          c.hostAcctRows = n;
        }
      }
    }
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
  _trimHot() { const steps = this._trimSteps(); for (let r = steps.next(); !r.done; r = steps.next()); }
  /** …the same move, `batch` rows per step on the stepped warm (B-1319: one 209 k-row move measured 226 ms in a lane). Between
   *  steps a moved row is in the cold columns (found by id) and still in `events` — no reader sees that: every reader of the
   *  resident rows finishes the pass first (`_loadEvents`), the id join (`ledgerKnowsId`) finds the row in either place. */
  *_trimSteps(batch = Infinity) {
    const c = this._evCache;
    if (!c || c.walking) return;
    const evs = c.events, tss = evs.map((e) => e.ts || 0);
    const cut = CB.ledgerCutoff({ nowMs: Date.now(), tss, sizes: c.sizes, windowMs: this._ledgerWindowMs(), maxBytes: this._ledgerHotMaxBytes(), prev: c.cutoff });
    c.cutoff = cut;
    const go = [];
    for (let i = 0; i < evs.length; i++) { if (i && i % (batch * 4) === 0) yield; if (tss[i] < cut && !Number.isNaN(c.locs[i]) && CB.coldable(evs[i], Math.floor(c.locs[i] / 4294967296), c.locs[i] % 4294967296)) go.push(i); }
    if (!go.length) return;
    go.sort((a, b) => (tss[a] - tss[b]) || (a - b));
    const drop = new Uint8Array(evs.length);
    for (let k = 0; k < go.length; k++) {
      if (k && k % batch === 0) yield;
      const i = go[k], ev = evs[i]; c.cold.push(ev, Math.floor(c.locs[i] / 4294967296), c.locs[i] % 4294967296, c.hrh[i]); drop[i] = 1; if (ev.rid) c.rids.delete(ev.rid); if (ev.mid) c.mids.delete(ev.mid);
    }
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
      // hotfix usage-ledger-walk B (主开发's condition 3): every index the commit keeps, bounded and counted
      ...this._ledgerWalkCensus(c),
    ];
  }
  _ledgerWalkCensus(c) {
    const rows = [];
    const L = c && c.arr, arrBytes = L ? [L.ts, ...L.tok, L.key, L.acct, L.be, L.model].reduce((n, a) => n + a.byteLength, 0) : 0;
    let names = 0, nameBytes = 0; if (L) for (const k of Object.keys(L.names)) for (const v of L.names[k]) { names++; nameBytes += 136 + String(v).length; } // r3: measured ≈ 150 / 166 B for a 20- / 40-character name (the string, its Map entry, its slot)
    rows.push(CB.cacheRow('usage arrival log', { bytes: arrBytes + nameBytes, count: L ? Math.min(L.seq - (L.start || 0), L.cap) : 0, unit: 'rows', ceiling: ARR_CAP * 64 + 4 * ARR_NAMES_MAX * 128, kind: 'arraybuffers', basis: `typed columns, 64 bytes a row (allocated whole at the first arrival) + ${names} interned names at ≈ 136 bytes + 1 a character (measured) — each table's ceiling ${ARR_NAMES_MAX} names: at it the log restarts (an older mark walks)${L && L.restarts ? ` — RESTARTED ${L.restarts} time${L.restarts > 1 ? 's' : ''} (last at sequence ${L.start})` : ''}` }));
    const H = c && c.hours && c.hours.cells;
    const UAx = require('./usage-anchors.js'), down = c && c.hoursOver && typeof c.hoursOver === 'object' ? c.hoursOver : null;
    rows.push(CB.cacheRow('usage hour sums', { bytes: H ? H.bytes : 0, count: H ? H.blocks : 0, unit: '(account, UTC day) blocks of 24 hours', ceiling: UAx.HOURS_MAX_BYTES, kind: 'heap', basis: down ? `STOOD DOWN at ${(down.bytes / 1048576).toFixed(1)} MB (${down.blocks} day blocks) past the ${Math.round(UAx.HOURS_MAX_BYTES / 1048576)} MB ceiling — a long interval walks (master's road) until the ledger is rebuilt` : `${UAx.HOUR_BLOCK_BYTES} bytes a block (24 hours × 10 numbers + the array and its Map entry, measured) — at the ceiling the sums stand down for this ledger (a long interval walks, master's road)` }));
    let hostTs = 0; if (c && c.hostAcct) for (const byA of c.hostAcct.values()) for (const l of byA.values()) hostTs += l.ts.length;
    const hdown = c && c.hostAcctDown;
    rows.push(CB.cacheRow('usage dark-host index', { bytes: hostTs * 12, count: hostTs, unit: 'resolved remote rows', ceiling: HOST_INDEX_MAX_ROWS * 12, kind: 'heap', basis: hdown ? `STOOD DOWN at ${hdown.rows} rows (8 days alone past the ${HOST_INDEX_MAX_ROWS}-row ceiling) — a dark host's accounts are found by walking 7 days (master's loop)` : `≤ 12 bytes a row (counted at a growing array's 12; a pruned one measures 8.5) — kept ${HOST_INDEX_KEEP_MS / 86400e3} days behind its last ask (the dark-taint question asks 7), and past ${HOST_INDEX_MAX_ROWS} rows the ${HOST_INDEX_KEEP_MS / 86400e3} days behind its newest row (if those alone pass it, the index stands down): older rows dropped, an ask before the floor walks` }));
    try { const m = require('./usage-anchors.js').costMemoCensus(this); if (m) rows.push(CB.cacheRow('usage cost memo', m)); } catch { }
    return rows;
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
    if (this._evCache.stale) this._rebuildOnLoop(); // B-748f: a stale cache's places only STALE, and a sync reader cannot wait for the worker
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
    return this._inWorker({ op: 'fold', rowBudget: this.coldRowBudget || CB.COLD_ROW_BUDGET, ...msg }, [...msg.walk.groups.flatMap((g) => [g.sh.buffer, g.off.buffer, g.ts.buffer, g.rh.buffer]), msg.hot.tss.buffer, msg.hot.locs.buffer, msg.hot.rh.buffer]);
  }
  /** ONE fold-worker job at a time, whichever it is — a fold or the ledger rebuild (B-748f): the next spawns when the
   *  previous settled (its terminate() awaited). */
  _inWorker(msg, transfer) {
    const p = (this._workerTail || Promise.resolve()).then(() => this._spawnJob(msg, transfer));
    this._workerTail = p.then(() => { }, () => { });
    return p;
  }
  _spawnJob(msg, transfer) {
    if (STUCK.size) return Promise.reject(Object.assign(new Error(`the usage ledger is not answering (storage) — ${STUCK.size} fold worker(s) stuck in a read; usage summaries resume when it returns`), { code: 'STUCK' }));
    return new Promise((resolve, reject) => {
      let w, settled = false, timer = null, exited = false;
      const rb = msg.op === 'rebuild'; // the rebuild has its own seams: a fold stub (coldWorkerFile) knows no 'rebuild'
      const file = (rb ? this.rebuildWorkerFile : this.coldWorkerFile) || path.join(__dirname, 'usage-cold-worker.js');
      const capMb = (rb ? this.rebuildWorkerHeapMb : this.coldWorkerHeapMb) || COLD_WORKER_HEAP_MB; // the hard limit never under 64 MB: below ~16 MB V8 dies PROCESS-WIDE deserializing the isolate (measured)
      // …and a rebuild gets at least the MAIN thread's own heap limit: it builds what the on-loop rebuild built there (the pass's id set
      // holds every rid of the ledger) — a smaller cap would fail it forever on a big ledger
      const heapMb = rb && !this.rebuildWorkerHeapMb ? Math.max(capMb, Math.round(v8.getHeapStatistics().heap_size_limit / 1048576)) : capMb;
      // execArgv [] (r3, verify #1/#12): a parent --max-old-space-size would otherwise replace resourceLimits
      const threads = EH.threadsNow(); // the diff around the constructor names the worker's thread (the exit hook's judge)
      try { w = new Worker(file, { execArgv: [], resourceLimits: { maxOldGenerationSizeMb: Math.max(64, heapMb), maxYoungGenerationSizeMb: 32 } }); } catch (e) { reject(e); return; }
      LIVE.set(w, EH.threadAdded(threads)); EH.atJoin('usage-fold', foldJoinJudge);
      trackWorker(rb ? 'usage-ledger-rebuild' : 'usage-cold-fold', w); // the memory census (src/worker-memory.js)
      if (rb) this._rebuildWorkers = (this._rebuildWorkers || 0) + 1; else this._coldWalks = (this._coldWalks || 0) + 1;
      w.on('exit', () => { exited = true; LIVE.delete(w); if (STUCK.delete(w)) console.log(`[usage] a stuck fold worker exited — ${STUCK.size} still stuck${STUCK.size ? '' : '; usage summaries resume'}`); });
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
      w.postMessage({ id: 1, capMb, ...msg }, transfer);
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
  /** THE BOOT WARM OFF THE LOOP (B-1319, measured 2026-10-13: warm() parsed the whole ledger in ONE tick — 3.5 s on a
   *  production-shaped 400 MB ledger in a lane, the 7.45 s "main loop held" canary 8 s after a production boot). The same
   *  load pass (`_loadSteps`), `chunkBytes` per tick, the cold columns settled after it a step at a time; `next` hands the
   *  loop back between steps. A reader that comes during it (`_loadEvents`) finishes the pass itself while what is left is
   *  ≤ TAKEOVER_MAX_BYTES; a reload under it (a shard deduped or rewritten before the first whole load) RESTARTS it from the
   *  files as they are now, stepped (lane ledger-dedup-law r2); a cache another door replaced whole ends it. Resolves
   *  {slices, rows, restarts}; never rejects. */
  warmStepped({ chunkBytes = WARM_SLICE_BYTES, trimBatch = TRIM_BATCH_ROWS, next = (fn) => setImmediate(fn) } = {}) {
    if (this.firstLoadInWorker) { // ledger-boot-load: the boot's warm JOINS the first load in the fold worker (no slice parsed on the loop)
      this._loadEvents();
      return (this._warmP = this.bootLoadLanded().then(() => { const c = this._evCache; return { slices: 0, rows: c ? c.events.length + c.cold.n : 0, worker: true }; }));
    }
    return (this._warmP = new Promise((resolve) => {
      let gen = null, cur = null, slices = 0, phase = 'load', keys = null, restarts = 0;
      const done = () => { if (this._warmRestart === restart) this._warmRestart = null; if (cur && cur.pending === gen) cur.pending = null; const c = this._evCache; resolve({ slices, rows: c ? c.events.length + c.cold.n : 0, restarts }); };
      // lane ledger-dedup-law r2 (a dedup that ended mid-warm KILLED it — `_rebuildInWorker` nulled the half-built cache, this
      // warm saw it gone and ended, and the next reader parsed the whole ledger in its own tick): the door hands a reload under
      // this warm HERE — the half-built cache dropped, the pass started again from the files as they are now (its first slice
      // in this call, the rest a step per turn); the promise (whenWarm, every waiting reader) stays pending until it ends
      const restart = (why) => {
        try { if (gen) gen.return(); } catch { }
        restarts++; phase = 'load'; // the door dropped the half-built cache: the new pass makes its own
        gen = this._loadSteps(chunkBytes, trimBatch);
        const r = gen.next(); slices++;
        cur = this._evCache;
        if (cur && !r.done) cur.pending = gen;
        else if (cur) { phase = 'settle'; keys = ['', ...Object.keys(cur.cold.idx)]; }
        console.log(`[usage] the ledger's boot warm restarts (${why}) — stepped, from the files as they are now`);
      };
      this._warmRestart = restart;
      const step = () => {
        try {
          if (gen && this._evCache !== cur) { try { gen.return(); } catch { } return done(); }
          if (phase === 'load') {
            if (!gen) gen = this._loadSteps(chunkBytes, trimBatch);
            if (cur) cur.pending = null;
            const r = gen.next(); slices++;
            cur = this._evCache;
            if (!r.done) { cur.pending = gen; return next(step); }
            if (cur.pending === gen) cur.pending = null;
            phase = 'settle'; keys = ['', ...Object.keys(cur.cold.idx)]; return next(step); // warm()'s own settle, one column set per tick
          }
          const k = keys.shift(); slices++;
          if (k === '') cur.cold.settle(); else cur.cold.idx[k].settle();
          return keys.length ? next(step) : done();
        } catch { return done(); }
      };
      step();
    }));
  }

  // THE LEDGER REBUILD OFF THE LOOP (B-748f, the never-block law; memory-residency verify r3 #4): a rebuild parsed the whole
  // ledger in ONE loop turn — 5 s at 497 MB, 69 s at 4.9 GB measured — every time a shard was rewritten, shrank or
  // vanished, a walk read a stale place, or a repair asked for a reload. Now the parse runs in the fold worker (the same
  // file, one job at a time with the folds); the loop keeps serving the previous cache — stale but whole, never a
  // blank — stages the result a chunk per turn and swaps it in with ONE assignment. Asks during a rebuild join it; a
  // failed rebuild keeps the previous cache, says why in one line, and tries again after REBUILD_RETRY_MS (doubling).
  /** THE ONE DOOR every ledger re-parse goes through. true = the worker took it (the cache keeps serving); false = there
   *  is no whole cache to keep serving (the first load is still under way): dropped, the caller's pass starts over. */
  _rebuildInWorker(why, c = this._evCache) {
    if (!c) return false; // nothing loaded: the first load reads the ledger as it is
    if (c !== this._evCache) return true; // a rebuilt cache already replaced the one that was asked about
    if (!c.whole) { this._evCache = null; if (c.pending && this._warmRestart) this._warmRestart(why); return false; } // lane ledger-dedup-law r2: under the boot warm ⇒ the warm restarts (stepped), never a reader's full load
    if (!c.stale) c.stale = why;
    this._requestRebuild(why).catch(() => { }); // a failure is said once, by the job
    return true;
  }
  /** THE DECLARED ON-LOOP REBUILD — the sync full-row readers only (aggregate(), rows(): a migration, a test; no server
   *  caller — test-ledger-rebuild's census): they cannot wait for the worker, and a stale cache's places only STALE. */
  _rebuildOnLoop() { this._evCache = null; this._loadEvents(); }
  /** The rebuild in flight (an ask joins it), a new one, or — inside a failed one's retry wait — that failure again. */
  _requestRebuild(why) {
    if (this._rb) { this._rb.asks++; return this._rb.p; }
    if (this._rbFail && Date.now() < this._rbFail.retryAt) return Promise.reject(this._rbFail.err);
    const job = { why, asks: 1, p: null };
    this._rb = job;
    job.p = this._rebuildJob(job).finally(() => { if (this._rb === job) this._rb = null; });
    return job.p;
  }
  /** Resolves when no rebuild is in flight (a test; a reader that wants the rebuilt figures). Never rejects. */
  rebuildSettled() { return this._rb ? this._rb.p.then(() => { }, () => { }) : Promise.resolve(); }
  async _rebuildJob(job) {
    const t0 = Date.now();
    try {
      const res = await this._inWorker({ op: 'rebuild', dir: this.dir, windowMs: this._ledgerWindowMs(), hotMaxBytes: this._ledgerHotMaxBytes(), coldMaxBytes: this._coldMaxBytes() }, []);
      const t1 = Date.now(), next = await this._stageBuilt(res.built);
      this._swapCache(next);
      this._rbFail = null;
      const rows = next.events.length + next.cold.n, b = this._boot;
      if (b) { // the first load (lane ledger-boot-load): its cost said — the worker's wall time, the hand-over's
        this.firstLoadStats = { tries: b.tries, workerMs: t1 - t0, stageMs: Date.now() - t1, chunks: res.built.chunks.length, rows };
        console.log(`[usage] the ledger's first load ran in the fold worker${b.fails ? ` (try ${b.tries}; the failure said above)` : ''}: ${rows} rows read and hashed in ${((t1 - t0) / 1000).toFixed(1)} s off the loop, handed over in ${((Date.now() - t1) / 1000).toFixed(1)} s (${res.built.chunks.length} chunks, one a turn) — the usage figures said «loading» meanwhile`);
      } else console.log(`[usage] the ledger cache was rebuilt in the fold worker (${job.why}${job.asks > 1 ? `; ${job.asks - 1} more ask(s) joined it` : ''}): ${next.events.length + next.cold.n} rows in ${((Date.now() - t0) / 1000).toFixed(1)} s — the previous cache served meanwhile`);
    } catch (e) {
      const n = (this._rbFail ? this._rbFail.n : 0) + 1, wait = Math.min(REBUILD_RETRY_MAX_MS, REBUILD_RETRY_MS * 2 ** (n - 1)), why = (e && e.message) || String(e);
      this._rbFail = { n, retryAt: Date.now() + wait, err: Object.assign(new Error(`the usage ledger could not be rebuilt after ${job.why} (${why}) — the previous figures keep serving; it tries again in ${Math.round(wait / 1000)} s`), { code: 'REBUILD', why }) };
      if (!this._boot) console.warn(`[usage] the ledger cache rebuild failed (${job.why}): ${why} — the previous cache keeps serving; next try in ${Math.round(wait / 1000)} s`);
      throw this._rbFail.err;
    }
  }
  /** The worker's half (usage-cold-worker.js runs it on its own instance): the ONE load pass to its end + warm()'s settle
   *  + the hot rows' ts order (= _sortHot's stable sort), packed — the cold columns' ArrayBuffers moved whole, the hot rows
   *  and their ids v8-serialized in chunks of HOT_CHUNK_ROWS inside ONE transferred buffer. */
  _packWhole() {
    this._evCache = null; // the worker's own instance: its first load
    this._loadEvents();
    const c = this._evCache;
    c.cold.settle(); for (const k of Object.keys(c.cold.idx)) c.cold.idx[k].settle();
    const n = c.events.length, perm = new Uint32Array(n);
    for (let i = 0; i < n; i++) perm[i] = i;
    perm.sort((a, b) => ((c.events[a].ts || 0) - (c.events[b].ts || 0)) || (a - b));
    const parts = [], put = (k, arr) => { for (let a = 0; a < arr.length; a += HOT_CHUNK_ROWS) parts.push([k, v8.serialize(arr.slice(a, a + HOT_CHUNK_ROWS))]); };
    put('ev', c.events); put('rid', [...c.rids]); put('mid', [...c.mids]);
    const buf = new Uint8Array(parts.reduce((t, [, b]) => t + b.length, 0)), chunks = [];
    let at = 0;
    for (const [k, b] of parts) { buf.set(b, at); chunks.push({ k, at, len: b.length }); at += b.length; }
    const sizes = Float64Array.from(c.sizes), locs = Float64Array.from(c.locs), hrh = Float64Array.from(c.hrh), cold = c.cold.parts();
    const marks = [...c.marks].map(([f, m]) => [f, { ino: m.ino, mtimeMs: m.mtimeMs, probe: new Uint8Array(m.probe) }]);
    return {
      built: { buf, chunks, sizes, locs, hrh, perm, hotBytes: c.hotBytes, cold: cold.parts, consumed: [...c.consumed], marks, srcWm: [...c.srcWm], hostAcct: [...(c.hostAcct || new Map())].map(([h, m]) => [h, [...m].map(([a, l]) => [a, l.ts.slice()])]), hostAcctFloor: c.hostAcctFloor ?? null, hostAcctNewest: c.hostAcctNewest ?? null, cutoff: c.cutoff, shards: c.shards, overWarned: !!c.overWarned },
      transfer: [buf.buffer, sizes.buffer, locs.buffer, hrh.buffer, perm.buffer, ...cold.transfer],
    };
  }
  /** The loop's half: the built cache staged where no reader looks — a chunk of hot rows (or ids) per loop turn, the cold
   *  columns taken whole (moved, not copied). */
  async _stageBuilt(b) {
    const events = [], sizes = [], locs = [], hrh = [], rids = new Set(), mids = new Set();
    for (const ch of b.chunks) {
      const rows = v8.deserialize(Buffer.from(b.buf.buffer, b.buf.byteOffset + ch.at, ch.len));
      if (ch.k === 'ev') for (const ev of rows) { const i = events.length; events.push(ev); sizes.push(b.sizes[i]); locs.push(b.locs[i]); hrh.push(b.hrh[i]); }
      else { const ids = ch.k === 'rid' ? rids : mids; for (const id of rows) ids.add(id); }
      await new Promise((r) => setImmediate(r));
    }
    const sorted = new Array(events.length);
    for (let k = 0; k < sorted.length; k++) sorted[k] = events[b.perm[k]];
    const marks = new Map(b.marks.map(([f, m]) => [f, { ino: m.ino, mtimeMs: m.mtimeMs, probe: Buffer.from(m.probe.buffer, m.probe.byteOffset, m.probe.length) }]));
    return { consumed: new Map(b.consumed), marks, events, sizes, locs, hrh, hotBytes: b.hotBytes, rids, mids, srcWm: new Map(b.srcWm), hostAcct: new Map((b.hostAcct || []).map(([h, m]) => [h, new Map(m.map(([a, ts]) => [a, { ts, sorted: false }]))])), hostAcctFloor: b.hostAcctFloor ?? undefined, hostAcctNewest: b.hostAcctNewest ?? undefined, checkedAt: 0, cold: CB.ColdSlab.fromParts(b.cold), cutoff: b.cutoff, walking: 0, shards: b.shards, shardIx: new Map(b.shards.map((f, i) => [f, i])), sorted, sortedLen: events.length, overWarned: b.overWarned, whole: true };
  }
  /** THE SWAP: ONE assignment — a reader sees the previous cache or the rebuilt one, each whole — and a new generation for
   *  the cost memos (usage-anchors keys on ledgerGen). The appends since the worker read come in the next pass (checkedAt 0). */
  _swapCache(next) { next.checkedAt = 0; this._evCache = next; this.ledgerGen = (this.ledgerGen || 0) + 1; }

  /** B2 (hotfix usage-ledger-walk): the accounts a remote host in `hosts` spent on (a resolved row: an account, not the
   *  host's own bucket) with a ts in [since, to] — by binary search over the (host, account) index kept in _take; the same
   *  set as walking the rows (usage-pool-engine darkTaintedAccounts' old loop). `ver` = the index's version. KEPT 8 DAYS
   *  (B r2): an ask reaching before the index's floor walks the rows (the old loop, verbatim); after an ask the index drops
   *  what lies a day before its `since` (once a day — the 7-day question never reaches back there). */
  hostAccountsIn(hosts, since, to) {
    try { this._loadEvents(); } catch { }
    const c = this._evCache, accts = new Set();
    if (!c) return { accts, ver: 0 };
    if (since < (c.hostAcctFloor ?? -Infinity)) {
      const hs = new Set(hosts || []);
      for (const ev of this._events(since, to)) if (ev.host && hs.has(ev.host) && ev.acct && ev.atype !== 'host') accts.add(ev.acct);
      return { accts, ver: c.hostAcctVer || 0, walked: true };
    }
    if (!c.hostAcct) { this._hostIndexPrune(c, since); return { accts, ver: c.hostAcctVer || 0 }; }
    for (const h of hosts || []) {
      const byA = c.hostAcct.get(h); if (!byA) continue;
      for (const [acct, l] of byA) {
        if (accts.has(acct)) continue;
        if (!l.sorted) { l.ts.sort((x, y) => x - y); l.sorted = true; }
        let lo = 0, hi = l.ts.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (l.ts[m] < since) lo = m + 1; else hi = m; }
        if (lo < l.ts.length && l.ts[lo] <= to) accts.add(acct);
      }
    }
    this._hostIndexPrune(c, since);
    return { accts, ver: c.hostAcctVer || 0 };
  }
  _hostIndexPrune(c, since, full = false) {
    const cut = since - (HOST_INDEX_KEEP_MS - 7 * 86400e3);
    if (!(cut > (c.hostAcctFloor ?? -Infinity) + (full ? 0 : 86400e3))) return; // once a day of floor (the ceiling: whenever it moves)
    if (c.hostAcct) for (const [h, byA] of c.hostAcct) {
      for (const [a, l] of byA) {
        if (!l.sorted) { l.ts.sort((x, y) => x - y); l.sorted = true; }
        let lo = 0, hi = l.ts.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (l.ts[m] < cut) lo = m + 1; else hi = m; }
        if (lo === l.ts.length) byA.delete(a); else if (lo) l.ts = l.ts.slice(lo);
      }
      if (!byA.size) c.hostAcct.delete(h);
    }
    c.hostAcctFloor = cut; c.hostAcctRows = undefined; // recounted at the next held row
  }
  /** B1: the arrivals since sequence number `seq` (exclusive) as light rows { ts, key, i, o, cw5, cw1, cr, acct, be, model } —
   *  the fields _cost / _addRow read — in arrival order; null when the log no longer holds `seq` (it moved past it: the
   *  caller walks, master's road). `arrivalSeq()` = the number of rows logged in this generation so far. */
  arrivalSeq() { try { this._loadEvents(); } catch { } const L = this._evCache && this._evCache.arr; return L ? L.seq : 0; }
  /** ONE SNAPSHOT (B r2, MUST 2): one load now and none until the returned release is called — every read in between (the
   *  version, the arrival mark, the walk) is of the same ledger. Re-entrant; the release is idempotent. */
  _pinLoad() {
    this._loadEvents();
    this._pinDepth = (this._pinDepth || 0) + 1;
    let done = false;
    return () => { if (done) return; done = true; this._pinDepth--; };
  }
  /** B1 r2: the arrivals since `seq` (exclusive) of the account keys in `keys` with a ts in [from, to] — read from the
   *  columns, a light row built only for one that matches (the walk's fields); null when the log no longer holds `seq`. */
  arrivalsFor(seq, keys, from, to) {
    const L = this._evCache && this._evCache.arr;
    if (!L) return seq === 0 ? [] : null;
    if (seq < Math.max(L.start || 0, L.seq - L.cap) || seq > L.seq) return null;
    const want = []; for (const k of keys) { const x = L.ids.key.get(k); if (x !== undefined) want.push(x); }
    const out = [];
    if (!want.length) return out;
    const w0 = want[0], one = want.length === 1, lo = from == null ? -Infinity : from, hi = to == null ? Infinity : to;
    for (let q = seq; q < L.seq; q++) {
      const j = q % L.cap, t = L.ts[j];
      if (t < lo || t > hi) continue;
      const kx = L.key[j];
      if (one ? kx !== w0 : !want.includes(kx)) continue;
      out.push({ ts: t, key: L.names.key[kx], i: L.tok[0][j], o: L.tok[1][j], cw5: L.tok[2][j], cw1: L.tok[3][j], cr: L.tok[4][j], acct: L.names.acct[L.acct[j]], be: L.names.be[L.be[j]], model: L.names.model[L.model[j]] });
    }
    return out;
  }
  arrivalsSince(seq) {
    const L = this._evCache && this._evCache.arr;
    if (!L) return seq === 0 ? [] : (seq > 0 ? null : null);
    if (seq < Math.max(L.start || 0, L.seq - L.cap) || seq > L.seq) return null;
    const out = [];
    for (let q = seq; q < L.seq; q++) {
      const j = q % L.cap;
      out.push({ ts: L.ts[j], key: L.names.key[L.key[j]], i: L.tok[0][j], o: L.tok[1][j], cw5: L.tok[2][j], cw1: L.tok[3][j], cr: L.tok[4][j], acct: L.names.acct[L.acct[j]], be: L.names.be[L.be[j]], model: L.names.model[L.model[j]] });
    }
    return out;
  }
  /** The (host, account) index's version and this ledger's generation — a memo of hostAccountsIn holds while both stand. */
  hostAccountsVersion() { try { this._loadEvents(); } catch { } return `${this.ledgerGen || 0}:${(this._evCache && this._evCache.hostAcctVer) || 0}`; }
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
    await this._waitBigWarm(); // lane ledger-dedup-law: a big warm in flight is waited for, never taken over
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
    await this._waitBigWarm();
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
    if (!c.sorted || c.sortedLen !== evs.length) this._sortHot(c);
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
      } catch (e) { if (!(e && e.code === 'STALE') || tries >= 2) throw e; this._rebuildOnLoop(); } // a rewritten shard: rebuild, read again
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
    const big = this._waitBigWarm(); // lane ledger-dedup-law: never a half ledger, never a takeover past the bound — wait for the warm
    if (big) return big.then(() => this.aggregateAsync(opts, { signal }));
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
    if (this._evCache.stale) { await this._requestRebuild(this._evCache.stale); this._loadEvents(); } // B-748f: a stale cache's places only STALE — fold the rebuilt one
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
      if (e && e.code === 'STALE') { // a shard was rewritten under the plan: the worker rebuilds (B-748f), the re-run folds the rebuilt cache
        this._rebuildInWorker('a walk read a stale place (' + e.message + ')', c);
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
      this._rebuildInWorker(`a shard vanished during a walk (${res.missingShards.join(', ')})`, c);
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
  // THE TABLE AS A PERSON KEEPS IT (B3, acceptance r2): the disk rows only — shipped + what a person entered — as before the
  // catalog lane; the config export and its summary read this. The editor reads pricingView() (with the catalog + sources).
  pricingTable() { return this._pricingFile || this._pricing; }
  pricingView() { return this._pricing; }
  lastCatalogSkips() { return (this._lastCatalogSkips || []).slice(); }
  // the table on disk ⊕ the installed Claude Code's catalog layer (`sources` per key: shipped / catalog / you)
  _withCatalog(file) {
    const r = CP.mergePricing(file, CATALOG_PRICES, { shipped: DEFAULT_PRICING, checked: SHIPPED_PRICES_CHECKED });
    this._priceDisagreements = r.disagreements;
    // every recomputation reports, an EMPTY list too (a disagreement that ended leaves the hub's «said» set), by instance
    if (ON_DISAGREE) { try { ON_DISAGREE(r.disagreements, this._priceId || (this._priceId = ++PRICE_IDS)); } catch { } }
    return r.pricing;
  }
  priceDisagreements() { return (this._priceDisagreements || []).slice(); }
  _fileTier(model) {
    if (this._fileTierFor !== this._pricing) { this._fileTierFor = this._pricing; this._fileTierMemo = new Map(); }
    const m = String(model || '').toLowerCase();
    if (!this._fileTierMemo.has(m)) this._fileTierMemo.set(m, CP.fileTierOf(this._pricing, m));
    return this._fileTierMemo.get(m);
  }
  // Accept a full v2 object OR a partial patch ({tiers?, accounts?}). Merges so a
  // UI editor can PATCH just one account's discount without resending everything.
  setPricing(patch) {
    if (!patch || typeof patch !== 'object') return this._pricing;
    const cur = this._pricingFile || this._pricing; // the table on disk — a catalog row is never written to pricing.json
    const next = { version: 2, tiers: { ...cur.tiers, ...CP.personTiers(patch.tiers, this._pricing, cur, patch.sources) }, accounts: { ...cur.accounts } };
    this._lastCatalogSkips = CP.catalogSkips(patch.tiers, patch.sources); // said to the importer (persistence's summary)
    if (patch.accounts) {
      for (const [id, cfg] of Object.entries(patch.accounts)) {
        if (cfg == null) delete next.accounts[id];       // null clears an override
        else next.accounts[id] = cfg;
      }
    }
    this._pricingFile = next;
    this._pricing = this._withCatalog(next);
    this._writeAtomic(this.pricingFile, JSON.stringify(next, null, 2));
    return this._pricing;
  }
}

// THE HOLD ROAD JOINS THE PROTOTYPE WITH THE FIRST INSTANCE (lane ledger-dedup-law r11 — test-cache-bounds §30 flaked 13 of
// 34 at 3c8c0501: the usage fold worker requires this file, which had grown 1 666 → 3 006 lines with the hold road and
// required usage-ledger-dedup.js, and the worker's baseline heap grew 0.32 MB toward §30's 30 MB soft cap). The hold road's
// methods live in src/usage-hold-road.js (moved verbatim); the constructor puts them on UsageHistory.prototype the first
// time the process makes an instance. The fold worker never makes one (Object.create(UsageHistory.prototype): _aggRow,
// _packWhole — none of them reaches a road method), so it loads neither the road nor the dedup. A name the prototype
// already has is left as it is (one definition: scripts/test-ledger-dedup-law.mjs ⑧ pins that the two files share none, and
// that the worker loads neither file).
let holdRoadIn = false;
function holdRoadInstall() {
  if (holdRoadIn) return;
  holdRoadIn = true;
  const R = require('./usage-hold-road.js').UsageHoldRoad.prototype;
  for (const n of Object.getOwnPropertyNames(R)) if (n !== 'constructor' && !Object.prototype.hasOwnProperty.call(UsageHistory.prototype, n)) Object.defineProperty(UsageHistory.prototype, n, Object.getOwnPropertyDescriptor(R, n));
}


module.exports = { UsageHistory, DEFAULT_PRICING, PRICE_ROW_FIELDS, SUPERSEDED_DEFAULTS, priceAt, REMEDY_STATES, ackOf };
module.exports.setCatalogPricing = setCatalogPricing; // lane cli-update-needs-nothing: the installed Claude Code's price layer
module.exports.onPriceDisagreements = onPriceDisagreements;
module.exports.SHIPPED_PRICES_CHECKED = SHIPPED_PRICES_CHECKED;
// the module-level names the hold road (src/usage-hold-road.js) reads — internal, for that file only
module.exports.holdRoadScope = { timedSync, WARM_SLICE_BYTES, REMEDY_STATES, ackOf, LIVE };
