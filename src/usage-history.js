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
const EH = require('./server/exit-hook.js'); // THE exit hook: a fold worker asleep in a read is never joined (lane usage-fold-worker-exit-hook)
const LD = require('./usage-ledger-dedup.js'); // a shard's sampled shape + the streaming dedup (lane ledger-dedup-law, B-7f9e)

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
// F1 THE LEDGER LAW (a re-emission costs zero bytes): the ingest's own rid index per shard — the `h:` rids it holds, read
// once (streaming; inline while the unread part is ≤ INGEST_IX_INLINE_BYTES, else a step per turn while the batch waits),
// kept current by every append. F4 THE GROWTH ALARM: a shard over SHAPE_MAX_BYTES, or whose sampled rows / unique rids is
// over SHAPE_MAX_RATIO (from SHAPE_RATIO_MIN_BYTES — a small file costs nothing), PAUSES the host that ingests into it.
const INGEST_IX_INLINE_BYTES = 8 * WARM_SLICE_BYTES;
const SHAPE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const SHAPE_MAX_RATIO = 2;
const SHAPE_RATIO_MIN_BYTES = 64 * 1024 * 1024;
const SHAPE_RESAMPLE_BYTES = 64 * 1024 * 1024, SHAPE_RESAMPLE_MS = 10 * 60e3; // a shard's sampled shape is read again past either
const DUP_LOG_MS = 10 * 60e3; // the ingest's duplicates line: once per host per this, with the counts since the last line
const REMEDY_RETRY_MS = 10 * 60e3, REMEDY_RETRY_MAX_MS = 6 * 3600e3; // r2: a paused shard's dedup that did not bring it back in shape runs again at a later pause past this (doubling per try)
// r3: EVERY state a paused shard's remedy can be in — the notice (src/server/ledger-shape-notice.js D_NOW) and the Usage
// window (src/lib/usage-ledger-note.js) each have a row for every one (test-ledger-whole-law ⑨ walks this list)
const REMEDY_STATES = Object.freeze(['running', 'judging', 'failed', 'not-rewritten', 'insufficient', 'proven-over', 'ids', 'none']);
// r4: A PAUSE IS A FACT ABOUT ONE SHARD (host × month), never about a host — the batch is split by month at the ingest; a
// month out of shape is HELD beside the ledger (`_held/<month>~<host>.<seq>.ndjson`: the rows as they would be appended)
// and ingested IN ORDER through the ingest's own law once it is back in shape; every other month ingests as usual and the
// hub's copy of the device cursor moves past the whole batch — nothing is refused whole. Bounded: ≤ HOLD_MAX_BYTES per
// host × month, in segments of ≤ HOLD_SEG_BYTES; past the bound the OLDEST segment goes and every row it held is COUNTED
// (`dropped`: the notice and the Usage window say how many; a marker line keeps the count across a restart).
// r5: that count is a SET, never an increment — the dropped segments' ids (`s<seq>` → the rows it held) and the rows a batch
// alone past the bound lost (`c<seq>@<offset>` → how many); every marker line carries the WHOLE set and is written BEFORE
// the segments it names are unlinked, so a crash between the two leaves a segment the read-back drops WITHOUT counting it
// again (an increment replayed after such a crash said 24 dropped for 20 sent, and called 4 recorded rows «never recorded»)
// r6: the set is a set of ROWS — the dropped rows' rids, never a position (r5 keyed a cut by `c<seq>@<offset>` and a
// segment by its seq: a window over the bound RE-SENT by an older daemon was held again while its old entry still counted
// it — 30 → 45 → … → 125 «never recorded» for 30 sent). It lives beside the hold (`<month>~<host>.<gen>.dropped`: lines
// `{"gone":[rid…]}` / `{"back":[rid…]}`, appended BEFORE the rows and the unlinks, compacted by a rename); a re-sent row
// the set holds is held again only where the append fits without dropping another (it then leaves the set — recorded
// after all), else it stays dropped, counted once and never re-written. A hold's GENERATION is in its segments' numbers
// (gen × HOLD_GEN_SPAN + i) and minted only once the previous hold of the month drained — a drained hold whose unlinks
// failed (EBUSY on the NFS data dir) is a stale generation: its files are unlinked at the read-back, never read, and never
// name the new hold's rows (r5 restarted the numbers at 0: the stale set dropped the new segments at the read-back).
// r7: THE DISK NEVER SAYS «DROPPED» ABOUT A ROW MEMORY STILL HOLDS — an append's order is the rows, then the set's lines
// naming only what the rows' append confirmed (`gone`, `back`, `below`: every segment numbered under it is done), then
// the unlinks; an append that throws (ENOSPC, EDQUOT, EMFILE — a part of it may have landed) is cut back to the length
// it had, and the hold is as it was on disk AND in memory (r6 wrote the set first: a rows append that threw left a set
// naming live, acked segments, and a restart deleted them as «dropped»; a torn set line glued the next one to it). A
// drained row leaves the segment it was read from and the bound counts UNDRAINED bytes (r6 counted a draining segment's
// recorded rows as dropped when a harvest pushed it out mid-drain). What is done is RECORDED before its files can be left
// behind — `below` when a drained segment's unlink fails, `retired` before a hold's last unlink — so a read-back unlinks
// them unread whether or not a newer generation exists (r6 told a stale generation only by a newer one). A listing of
// `_held/` that fails (EIO) is no empty disk: the month's batch waits, unacked, never a hold minted on the live one.
// r8: A RECORD OUTLIVES EVERY FILE IT DESCRIBES — a set file (its `retired`, its `below`) is swept only once no file of its
// generation is left (r7 swept a retired generation's record at boot while its segments stayed: the next restart read them
// back as a live hold). DEDUP AND THE DRAIN CURSOR ARE TWO THINGS — a segment keeps every rid until it is unlinked (the
// duplicate check), the drain's progress is its cursor (`at`, `done`, and `below` written before each drained segment's
// unlink) — r7 pruned drained rids and a re-send mid-drain was held twice, pushing out undrained acked rows. A DROPPED COUNT
// IS A FACT OF THE SET FILE AND IS ALWAYS SAID — a hold ends (`retired`) only once the notice that says its count is on
// disk; a generation read back with a count and nothing live says it; a re-word never loses it; a row the month's index
// holds is never held, and the count a hold ends with is filtered against the index the drain loads. The listing of
// `_held/` that FAILED is a STATE with a backoff (said once, retried on a timer, the answer's `retryAfter`), and a month
// that needs no hold never waits for it. THE LOOP LAW: the hold's every file call past its listing runs on its async road.
const HOLD_MAX_BYTES = 64 * 1024 * 1024, HOLD_SEG_BYTES = 16 * 1024 * 1024;
const HOLD_NAME_RE = /^(events-\d{4}-\d{2})~([A-Za-z0-9_-]+)\.(\d+)\.ndjson$/;
const HOLD_DROP_RE = /^(events-\d{4}-\d{2})~([A-Za-z0-9_-]+)\.(\d+)\.dropped$/; // r6: a hold generation's dropped set
const HOLD_DROP_TMP_RE = /^(events-\d{4}-\d{2})~([A-Za-z0-9_-]+)\.(\d+)\.dropped\.tmp$/; // r7: a compaction killed before its rename (swept at the listing)
// r6: a hold's segments are numbered gen × 10⁶ + i. r7: a rotation past a generation's last number is REFUSED, loudly
// (`HOLD_SEQ_BOUND`) — never read back as the next generation's; unreachable: a segment closes only when the next append
// does not fit, so two neighbours hold > 16 MiB and 10⁶ of them are ≥ 8 TB through ONE machine × month
const HOLD_GEN_SPAN = 1e6, HOLD_SEQ_BOUND = 'hold-seq-bound';
// r10: the newest generation a hold may be (gen × 10⁶ + i stays a safe integer, written in digits) — a name or a stored item
// past it is not ours (acceptance r9: a forged «1e15» minted segment names in exponent form the listing never read back)
const HOLD_GEN_MAX = 1e9;
// r8: the hold's async road — a file call waiting past HOLD_SLOW_MS is said (again every HOLD_SLOW_AGAIN_MS); a batch whose
// hold jobs run past HOLD_ANSWER_MS is answered unacked (`hold-slow`); a hold with HOLD_QUEUE_MAX jobs waiting refuses the
// next at once (`hold-busy`); a listing that failed is tried again after HOLD_LIST_RETRY_MS, doubling to HOLD_LIST_RETRY_MAX_MS
const HOLD_SLOW_MS = 10e3, HOLD_SLOW_AGAIN_MS = 60e3, HOLD_ANSWER_MS = 30e3, HOLD_QUEUE_MAX = 8, HOLD_LIST_RETRY_MS = 5e3, HOLD_LIST_RETRY_MAX_MS = 60e3;
const holdGenOf = (seq) => Math.floor(Number(seq) / HOLD_GEN_SPAN);
const DROP_LINE_RIDS = 4096, DROP_COMPACT_MIN = 64 * 1024; // r6: rids per set line (≪ a MiB line); the set file rewritten past 4× its set (≥ 64 KiB)
const dropLines = (tag, rids) => { let out = ''; for (let i = 0; i < rids.length; i += DROP_LINE_RIDS) out += JSON.stringify({ [tag]: rids.slice(i, i + DROP_LINE_RIDS) }) + '\n'; return out; };
// r7: the bytes the set takes as its compacted lines (its compaction's bound is 4× that — r6 took 4× the FILE read back)
const dropBytesOf = (set) => { let n = 0; for (const r of set) n += r.length + 3; return n + 12 * Math.ceil(set.size / DROP_LINE_RIDS); };
// r7: a held row is a WHOLE line — the drain's own test, at the read-back too (a line torn by a crash mid-append is no row)
const rowStart = (buf, a, b) => { while (a < b && buf[a] === 0) a++; return buf[a] === 0x7b && buf[b - 1] === 0x7d ? a : -1; };
// a host id in a file name, reversibly: [A-Za-z0-9-] kept, every other byte `_` + its two hex digits
const holdHostKey = (host) => Array.from(Buffer.from(String(host), 'utf8')).map((b) => (b < 128 && /[A-Za-z0-9-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '_' + b.toString(16).padStart(2, '0'))).join('');
const holdHostOf = (key) => { const out = []; for (let i = 0; i < key.length; i++) { if (key[i] === '_') { out.push(parseInt(key.slice(i + 1, i + 3), 16)); i += 2; } else out.push(key.charCodeAt(i)); } return Buffer.from(out).toString('utf8'); };
const NO_HOLD = Object.freeze({ segs: Object.freeze([]), gone: new Set(), none: true }); // a month with nothing held (no record kept)
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
    scanBudgetBytes = SCAN_BUDGET_BYTES, scanYield = () => new Promise((r) => setImmediate(() => setImmediate(r))), paused = () => false }) {
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
    this.reloadEvents = () => { this._rebuildInWorker('a reload after a repair'); if (this._index) this._index.recover(); }; // …and the index re-checks its shard marks (B-748f: rebuilt in the worker, the old cache serving until the swap)
    this._pricing = this._loadPricing();
    this._scanning = false;
    this._lastScan = 0;
    // lane ledger-dedup-law: F1's per-shard rid index, F4's sampled shapes + paused shards (r4: host × month), the dedup jobs
    // in flight, the holds of the paused months (r4), F2's hub-kept device cursors (one file per machine beside the ledger),
    // the duplicates journal's per-host counts
    this._ingestIx = new Map(); this._shapes = new Map(); this._pausedShards = new Map(); this._proven = new Map(); this._dedupJobs = new Map(); this._remedies = new Map(); this._judging = new Map(); this._judgeKick = new Map();
    this._holds = new Map(); this._heldList = null; this._holdGens = new Map(); this._dropFiles = new Map(); // r6: the newest hold generation of each (month, host); the set files listed
    this._diskFiles = new Set(); this._listFail = null; this._listing = null; this._inflight = new Set(); // r8: the segment files on disk; the listing's failure state; the hold road's promises in flight
    this._readFail = new Map(); this._lines = new Map(); // r9: each hold's failed read-back (its state, `_readFailed`); a line many batches meet, said once a minute
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
      // lane ci-351-reds (2026-10-24): the hourly prune's stat pass — one stat per cursor, 8 587 on the measured boot = a
      // 105 ms tick, 243–268 ms on the hosted runners — runs HERE in CURSOR_SLICE_MS slices through the walk's own yield,
      // before the commit point (the reload check below covers its turns too); its drops land AT the commit, as before
      const deadFacts = Date.now() - (this._cursorsPrunedAt || 0) >= CURSOR_PRUNE_MS ? await this._deadCursorsSliced(walk.cursors) : undefined;
      if (this._cursors !== cursorsAtStart) return { added: 0, filesTouched, dropped: 'cursors-reloaded' };
      this._cursors = walk.cursors;

      // THE ONE COMMIT POINT — synchronous, so no reader interleaves between
      // the shard appends and the cursor write
      for (const [shard, lines] of Object.entries(shardBuffers)) {
        if (lines.length) { const text = lines.join('\n') + '\n'; timedSync('usage-shards.write', () => fs.appendFileSync(shard, text)); this._pushIndex(shard, text); if (this._evCache) this._evCache.checkedAt = 0; } // our own append ⇒ next _loadEvents re-checks (2.369.36 throttle)
      }
      this._writeCursors(deadFacts);
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
  /** The parsed batch (its rows by month) → the answer — r8: a promise when a month of it goes to a hold (its jobs run on the
   *  hold's async road and are awaited, ≤ HOLD_ANSWER_MS) or waits for a hold being read back; the answer itself otherwise.
   *  r9: A MONTH THAT NEEDS NO HOLD NEVER WAITS — the months that go are appended NOW, before any wait (r8 deferred the whole
   *  batch while one month's hold was read back, and a read-back that failed was started again at every try: every month
   *  answered `deferred`, 0 of 6 November batches recorded); a month whose hold is being read back waits for it, bounded
   *  (HOLD_ANSWER_MS ⇒ `hold-slow`; HOLD_QUEUE_MAX batches waiting ⇒ `hold-busy` at once); one whose read-back FAILED answers
   *  `holdFailed` with its code and `retryAfter` (the read-back's own timer reads it again — never an ingest). */
  _ingestBatch(hostId, hostName, shardBuffers, added, { cursors = null, since = null } = {}) {
    const b = { hostId, hostName, shardBuffers, added, cursors, since, appended: 0, duplicates: 0, lastTs: 0, lastRid: null, held: false, jobs: [], holdFailed: [], retry: [], waits: [] };
    const deferred = this._ingestPass(b, Object.keys(shardBuffers), true);
    if (deferred) { this._unwait(b.waits); return deferred; } // a big shard's index still loading in steps — nothing appended, the device keeps the batch (r10: its waits undone — r9 leaked `waiting`, the hold refused `hold-busy` for ever after 8)
    if (b.waits.length) {
      const waited = b.waits.map((w) => w.shard);
      return this._track(this._loadsBounded(b.waits).then(() => { this._ingestPass(b, waited, false); return Promise.all(b.jobs); }).then((r) => this._ingestEnd(b, r)));
    }
    return b.jobs.length ? this._track(Promise.all(b.jobs).then((r) => this._ingestEnd(b, r))) : this._ingestEnd(b, []);
  }
  /** r9: one pass of a batch over some of its months (`first`: the batch's own; else the months that waited for their hold's
   *  read-back) — each judged, then held or appended → a `deferred` answer (the first pass only: a big shard's index still
   *  loading) | null. */
  _ingestPass(b, shards, first) {
    const { hostId, hostName, shardBuffers } = b, go = [], hold = [];
    // F4, r4: THE BATCH SPLIT BY MONTH — a month out of shape is never appended to nor streamed for its index: its rows are
    // HELD (its hold, in order) and that month paused and said; a month back in shape drains its hold first (these rows
    // then queued in the hold behind it); every other month ingests as usual
    for (const shard of shards) {
      const v = this._shapeVerdict(shard), paused = this._pausedShards.has(this._pauseKey(hostId, shard));
      // r7 (e5): a hold listing that FAILS (EIO) is no empty disk — r8: a month that needs its hold (out of shape, paused)
      // waits, unacked (`holdFailed` + `retryAfter`), until the listing's own retry works; one in shape and not paused needs
      // no hold — it goes (r7 refused every month of the batch, the in-shape November too). r9: a hold whose read-back
      // FAILED is the same state — that hold's own (`_readFailed`)
      let h; try { h = this._holdOf(shard, hostId); } catch (e) { if (v.ok && !paused) go.push(shard); else this._holdFailedOf(b, shard, e); continue; }
      if (!h) {
        // r9: a hold being read back — this month waits for it (bounded); past the bound, or with too many batches waiting
        // already, it is answered unacked (the device keeps its rows)
        const r = this._holds.get(this._holdKey(shard, hostId));
        if (!first || !r) this._holdFailedOf(b, shard, { code: 'hold-slow' });
        else if (r.waiting + r.pending >= (this.holdQueueMax || HOLD_QUEUE_MAX)) this._holdFailedOf(b, shard, { code: 'hold-busy' });
        else { r.waiting++; const until = Date.now() + (this.holdAnswerMs || HOLD_ANSWER_MS); r.waitEnds.push(until); b.waits.push({ shard, h: r, until }); }
        continue;
      }
      if (v.ok && this._holdBusy(h)) { if (paused) this._resume(hostId, shard); else this._drainHold(h); h = this._holdOf(shard, hostId) || h; }
      if (!v.ok || this._holdBusy(h)) hold.push({ shard, v }); else go.push(shard);
    }
    // F1 — every appended shard's rid index ready (a big one loads in steps; the batch waits, the device keeps it — r9: a month
    // that waited for its hold meets it as that month's answer: the rest of the batch is appended already)
    for (const shard of [...go]) if (!this._ingestIndex(shard)) { if (first) return { added: 0, appended: 0, duplicates: 0, deferred: 'ledger-index-loading', retryAfter: 1, ack: false }; go.splice(go.indexOf(shard), 1); this._holdFailedOf(b, shard, { code: 'ledger-index-loading' }); }
    // r8: the held months' rows go on their hold's road (r5: a hold that could not be written is THAT month's — its notice,
    // the answer's `holdFailed` — never stamped on the batch's other months); r8 (residual 3): the month's rid index, when it
    // is in memory, tells the rows the ledger already has
    if (hold.length) b.held = true;
    for (const { shard, v } of hold) {
      let h; try { h = this._holdOf(shard, hostId, true); } catch (e) { b.jobs.push(Promise.resolve({ shard, v, e })); continue; }
      const ix = this._ingestIx.get(shard), use = ix && !ix.loading && !ix.over ? ix : null;
      const job = this._holdRows(h, shardBuffers[shard], hostName, { ix: use, checked: !!(use && use.ino && v.size != null && use.size === v.size) }).then((r) => ({ shard, v, r }), (e) => ({ shard, v, e }));
      b.jobs.push(this._bounded(job, { shard, v }));
    }
    if (first) {
      // r4: this machine's other paused months judged again at its every ingest (a month split by hand, a bound raised, a
      // dedup that ended) — a month with no new rows is never left paused for want of a batch; r5: a month whose drain failed
      // is tried again here (any month's batch of the machine), and one out of shape again is a shape pause again
      for (const rec of this._pausedOf(hostId)) {
        const shard = this._shardPath(rec.shard);
        if (shardBuffers[shard]) continue;
        let v; try { v = this._shapeVerdict(shard); } catch { continue; }
        if (v.ok) this._resume(hostId, shard); else if (rec.drain) this._pause(hostId, hostName || rec.hostName, shard, v);
      }
      // r9: a hold whose count could not be put on disk at its end (the notice store refused its write: `unsaid`) is said
      // again at its machine's every ingest (r8 wrote `unsaid` and never read it)
      for (const h of [...this._holds.values()]) if (h.unsaid && h.host === String(hostId)) this._sayUnsaid(h);
    }
    const a = this._appendRemote(shardBuffers, go);
    b.appended += a.appended; b.duplicates += a.duplicates; if (a.lastRid && a.lastTs >= b.lastTs) { b.lastTs = a.lastTs; b.lastRid = a.lastRid; }
    // r8 (e5's stuck pause): a month in shape whose pause holds nothing resumes at its first ingest that recorded it (a pause
    // with no hold — its write refused, its listing failed at boot — was never resumed while the month took rows)
    for (const shard of go) if (this._pausedShards.has(this._pauseKey(hostId, shard))) this._resume(hostId, shard);
    return null;
  }
  /** r9: a month of the batch that is not acked → its entry (its code; a failed listing or read-back also tells the answer
   *  when it is tried again — `retryAfter`). */
  _holdFailedOf(b, shard, e) {
    const f = { month: path.basename(shard).slice(7, 14), shard: path.basename(shard), error: (e && e.code) || String((e && e.message) || e).slice(0, 80) };
    b.holdFailed.push(f);
    const key = this._holdKey(shard, b.hostId);
    let ra = this._retryAfter(key);
    // r10: EVERY DEFERRED ANSWER CARRIES ITS retryAfter (r9: only a failed read-back's or listing's did — the 9th batch got
    // `hold-busy` and nothing to pace by): `hold-slow` — the bound itself; `hold-busy` — what is left of the bound of the
    // first batch waiting; an index still loading — the next second
    if (f.error === 'hold-slow') ra = Math.max(ra, Math.ceil((this.holdAnswerMs || HOLD_ANSWER_MS) / 1000));
    else if (f.error === 'hold-busy') ra = Math.max(ra, this._busyFor(this._holds.get(key)));
    else if (f.error === 'ledger-index-loading') ra = Math.max(ra, 1);
    if (ra) b.retry.push(ra);
    return f;
  }
  /** r10: seconds until a hold refusing more batches (`hold-busy`) has room — its first waiting batch's bound ends (none
   *  waiting: its writes queued — one bound). */
  _busyFor(h) {
    const ends = (h && h.waitEnds) || [], left = ends.length ? Math.min(...ends) - Date.now() : this.holdAnswerMs || HOLD_ANSWER_MS;
    return Math.max(1, Math.ceil(left / 1000));
  }
  /** r10: batches no longer waiting for a hold's read-back (answered, or the batch deferred whole). */
  _unwait(waits) { for (const w of waits) { w.h.waiting--; const i = w.h.waitEnds.indexOf(w.until); if (i >= 0) w.h.waitEnds.splice(i, 1); } waits.length = 0; }
  /** r9: the batch's answer once its holds answered (`results` = [{shard, v, r | e}]). */
  _ingestEnd(b, results) {
    const { hostId, hostName } = b;
    let held = 0, heldDup = 0; const paused = [];
    for (const { shard, v, r, e } of results) {
      let holdError = null;
      if (e) { const f = this._holdFailedOf(b, shard, e); holdError = f.error; this._sayAgain(`held\n${hostId}\n${f.shard}\n${holdError}`, (n) => `[usage] the rows of ${f.shard} from ${hostName || hostId} could not be held (${holdError}) — this batch is not acked: its device sends it again${n ? ` (${n} more batch(es) since the last such line)` : ''}`); }
      else { held += r.held; heldDup += r.duplicates; }
      if (!v.ok) paused.push(this._pause(hostId, hostName, shard, v, holdError));
    }
    const duplicates = b.duplicates + heldDup, holdFailed = b.holdFailed;
    if (duplicates) this._noteDuplicates(hostId, b.appended, duplicates);
    const retryAfter = holdFailed.length && b.retry.length ? Math.max(...b.retry) : 0;
    const answer = { added: b.appended, appended: b.appended, duplicates, ...(b.held ? { held } : {}), ...(paused.length ? { paused: paused[0], pausedMonths: paused } : {}), ...(holdFailed.length ? { holdFailed } : {}), ...(retryAfter ? { retryAfter } : {}) };
    answer.ack = ackOf(answer);
    // F2 — r5: THE ACK commits the hub's copy of the device cursor (every row appended or held beside the ledger)
    if (b.cursors && typeof b.cursors === 'object' && answer.ack) this._writeHostCursor(hostId, { cursors: b.cursors, since: b.since || 'hub', lastTs: b.lastTs || null, lastRid: b.lastRid, events: b.added });
    return answer;
  }
  /** r9: the read-backs a batch waits for, BOUNDED (HOLD_ANSWER_MS — a disk that does not answer: the batch answered
   *  `hold-slow`, the read-back running on; r8 waited for it with no bound and no line) → Promise (settled either way). */
  _loadsBounded(waits) {
    let t = null;
    const late = new Promise((resolve) => { t = setTimeout(resolve, this.holdAnswerMs || HOLD_ANSWER_MS); t.unref?.(); });
    return Promise.race([Promise.all(waits.map((w) => Promise.resolve(w.h.loading).catch(() => { }))), late]).finally(() => { clearTimeout(t); this._unwait(waits.slice()); });
  }
  /** r9: ONE line for a state many batches meet (r8: a stalled hold said 127 identical lines in one millisecond) — said, then
   *  at most once a minute, with how many met it since. r10: A COUNT IS SAID EVEN WHEN ITS KEY NEVER COMES BACK — the
   *  window's count is flushed at its end (one timer per key, bounded with the keys; r9 said it only with the key's next
   *  line: 7 hold-slow batches per machine stayed unsaid). → true when the line was said now (the caller acts), false when
   *  only counted. */
  _sayAgain(key, words) {
    const now = Date.now(), s = this._lines.get(key), win = this.sayAgainMs || HOLD_SLOW_AGAIN_MS;
    if (s && now - s.at < win) {
      s.n++; s.words = words;
      if (!s.timer) { s.timer = setTimeout(() => this._sayFlush(key), Math.max(0, s.at + win - now)); s.timer.unref?.(); }
      return false;
    }
    if (s && s.timer) clearTimeout(s.timer);
    console.warn(words(s ? s.n : 0));
    this._lines.set(key, { at: now, n: 0, words, timer: null });
    if (this._lines.size > 256) { const old = this._lines.keys().next().value; this._sayFlush(old); this._lines.delete(old); }
    return true;
  }
  /** r10: a window's count said at its end (or when its key leaves the bounded map). */
  _sayFlush(key) {
    const s = this._lines.get(key); if (!s) return;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (!s.n) return;
    console.warn(s.words(s.n)); s.at = Date.now(); s.n = 0;
  }
  /** r8: a hold job's answer, BOUNDED — past HOLD_ANSWER_MS its batch is answered unacked (`hold-slow`: the device keeps it);
   *  the job runs on (what it lands is in memory and on disk; the device's re-send of it is a duplicate). */
  _bounded(job, { shard, v }) {
    let t = null;
    const late = new Promise((resolve) => { t = setTimeout(() => resolve({ shard, v, e: Object.assign(new Error('the hold\'s disk did not answer'), { code: 'hold-slow' }) }), this.holdAnswerMs || HOLD_ANSWER_MS); t.unref?.(); });
    return Promise.race([job, late]).finally(() => clearTimeout(t));
  }
  /** F1's append (the ingest's and a drained hold's — r4): rows a shard's rid index (or this call) already has are
   *  duplicates, the rest appended in their order and the index told → {appended, duplicates, lastTs, lastRid}. Every
   *  shard's index is current (the caller checked `_ingestIndex`). */
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

  // ── F1 THE INGEST'S RID INDEX (lane ledger-dedup-law) ───────────────────────────────────────────────────────────────────
  // Why not `ledgerKnowsId`: the ledger cache holds only the hot rows' ids in a Set — a cold row is a hash whose every hit
  // costs a disk read, and the cache may be mid-warm or stale (a false "new" there would append the window again). This
  // index holds exactly what the ingest needs: the `h:` (remote) rids of one shard (a remote rid never equals a local one),
  // read once — the unread part inline when it is ≤ INGEST_IX_INLINE_BYTES, else a step per loop turn while the batch is
  // deferred — and kept current by every append (ours directly; anyone else's by reading the shard's new bytes). A shard
  // rewritten under it (another inode, or shorter) is read again. Bounded: past LD.MAX_IDS ids the shard is out of shape.
  /** true = the index of `shard` is current (an empty one when the shard does not exist yet); false = loading in steps. */
  _ingestIndex(shard) {
    let st = null; try { st = fs.statSync(shard); } catch { }
    let ix = this._ingestIx.get(shard);
    if (!st) { if (!ix || ix.ino) this._ingestIx.set(shard, { ino: 0, size: 0, rids: new Set(), loading: null, over: false }); return true; }
    if (ix && !ix.loading && ((ix.ino && ix.ino !== st.ino) || st.size < ix.size)) ix = null; // rewritten: read it again
    if (!ix) { ix = { ino: st.ino, size: 0, rids: new Set(), loading: null, over: false }; this._ingestIx.set(shard, ix); }
    if (!ix.ino) ix.ino = st.ino;
    if (ix.loading) return false;
    if (st.size === ix.size) return true;
    if (st.size - ix.size <= (this.ingestIndexInlineBytes || INGEST_IX_INLINE_BYTES)) { ix.size = this._readRids(shard, ix, ix.size, st.size); return true; }
    const gen = (function* (self) { while (ix.size < st.size) { const end = self._readRids(shard, ix, ix.size, st.size, WARM_SLICE_BYTES); if (end === ix.size) break; ix.size = end; yield; } })(this);
    ix.loading = LD.runStepped(gen, { sliceMs: 20 }).catch((e) => { console.warn(`[usage] the ingest index of ${path.basename(shard)} could not be read: ${(e && e.message) || e} — read again at the next ingest`); this._ingestIx.delete(shard); })
      .finally(() => { ix.loading = null; });
    return false;
  }
  /** The `h:` rids of [from, to) of a shard into `ix` (≤ `limit` bytes read) → the place after the last whole line. */
  _readRids(shard, ix, from, to, limit = Infinity) {
    return LD.eachLine(shard, from, to, (buf, a, b) => {
      const rid = LD.ridAt(buf, a, b);
      if (rid && rid.startsWith('h:') && !ix.over) { ix.rows = (ix.rows || 0) + 1; ix.rids.add(rid); if (ix.rids.size > LD.MAX_IDS) ix.over = true; }
    }, { limit });
  }
  /** Resolves when no index is loading in steps (a suite; a caller that wants the batch it was deferred for in). */
  ingestIndexSettled() { return Promise.all([...this._ingestIx.values()].map((ix) => ix.loading || null).filter(Boolean)).then(() => { }); }
  _noteDuplicates(hostId, appended, duplicates) {
    const d = this._dupLog.get(hostId) || { at: 0, appended: 0, duplicates: 0, calls: 0 };
    d.appended += appended; d.duplicates += duplicates; d.calls++;
    const now = Date.now();
    if (now - d.at >= DUP_LOG_MS) {
      console.log(`[usage] ingest ${hostId}: ${d.appended} appended, ${d.duplicates} duplicate(s) not written (already in the ledger) over ${d.calls} batch(es)`);
      d.at = now; d.appended = 0; d.duplicates = 0; d.calls = 0;
    }
    this._dupLog.set(hostId, d);
  }

  // ── F4 THE GROWTH ALARM (lane ledger-dedup-law) ─────────────────────────────────────────────────────────────────────────
  _shapeMaxBytes() { return this.shapeMaxBytes || SHAPE_MAX_BYTES; }
  _shapeRatioMinBytes() { return this.shapeRatioMinBytes != null ? this.shapeRatioMinBytes : SHAPE_RATIO_MIN_BYTES; }
  /** Is a shard in shape for an append? → {ok: true} | {ok: false, why: 'size' | 'ratio' | 'ids', size, ratio, shard, exact?,
   *  proven?, judging?}. The size is a stat per ingest; the ratio is the ingest index's own count once it read the shard
   *  (every `h:` row against the distinct ones — r2: a sample of windows, head to tail, cannot see a repeat that lies far
   *  from its first copy, and the incident's re-sent windows are exactly that), before it LD.shapeOf's sample (16 windows
   *  from the head to the tail, ≤ 16 MiB read), read again only past SHAPE_RESAMPLE_BYTES of growth or SHAPE_RESAMPLE_MS.
   *  r3: a shard over the bound is out of shape even when a dedup pass proved it free of repeats (`proven` — keyed by the
   *  inode the pass read, `_isProven`: a file rewritten since is unproven and gets its dedup); a pause the INDEX judged
   *  before a restart (`_judging`, restorePause) is judged by the index again, never by the sample (`judging` until it is
   *  read — after the ledger loads). */
  _shapeVerdict(shard) {
    let st; try { st = fs.statSync(shard); } catch { this._judging.delete(shard); return { ok: true }; }
    const ix = this._ingestIx.get(shard), j = this._judging.get(shard);
    if (j && j.ino == null) j.ino = st.ino; // the file the boot found (restorePause judges at once)
    // the ids bound and the size are exact rules of their own: either one judging it out ends a «judging» wait
    if (ix && ix.over && ix.ino === st.ino) { this._judging.delete(shard); return { ok: false, why: 'ids', size: st.size, ratio: null, shard, exact: true }; }
    if (st.size > this._shapeMaxBytes()) { this._judging.delete(shard); return { ok: false, why: 'size', size: st.size, ratio: (this._shapes.get(shard) || {}).ratio ?? null, shard, proven: this._isProven(shard, st) }; }
    if (j && j.ino !== st.ino) this._judging.delete(shard); // rewritten since: judged afresh, like any file
    else if (j) {
      if (!(ix && !ix.loading && ix.ino === st.ino && ix.size > 0)) { this._judgeByIndex(shard); return { ok: false, why: j.why, size: st.size, ratio: j.ratio, shard, exact: true, judging: true }; }
      this._judging.delete(shard); // the index read it: its count judges below
    }
    if (st.size < this._shapeRatioMinBytes()) return { ok: true, size: st.size };
    if (ix && !ix.loading && ix.ino === st.ino && ix.size > 0 && ix.rids.size) {
      const ratio = (ix.rows || 0) / ix.rids.size;
      if (ratio > SHAPE_MAX_RATIO) return { ok: false, why: 'ratio', size: st.size, ratio, shard, exact: true };
    }
    let s = this._shapes.get(shard);
    if (!s || s.ino !== st.ino || Math.abs(st.size - s.size) >= SHAPE_RESAMPLE_BYTES || (st.size !== s.size && Date.now() - s.at >= SHAPE_RESAMPLE_MS)) {
      try { s = { ...LD.shapeOf(shard), at: Date.now() }; } catch { return { ok: true, size: st.size }; }
      this._shapes.set(shard, s);
    }
    if (s.ratio != null && s.ratio > SHAPE_MAX_RATIO) return { ok: false, why: 'ratio', size: st.size, ratio: s.ratio, shard, hosts: s.hosts };
    return { ok: true, size: st.size, ratio: s.ratio };
  }
  /** Pause ONE month of a host's ingest (r4: host × month — its other months record as usual; this month's rows are held
   *  until its shard is back in shape) → the paused record ({…, month, held, dropped, holdMax}; `held` null while a big
   *  hold is still being read). A pause is said (one line + `onShape`) when it starts, when its remedy starts, when the
   *  remedy ends without the shard back in shape and when its held / dropped counts move — the notice says what HAPPENED
   *  (r2), never a promise. THE REMEDY = the shard's streaming dedup (`_remedy`). */
  _pause(hostId, hostName, shard, v, holdError = null) {
    const key = this._pauseKey(hostId, shard), prev = this._pausedShards.get(key), now = Date.now(), base = path.basename(shard);
    const ratio = v.ratio == null || !Number.isFinite(Number(v.ratio)) ? null : Math.round(Number(v.ratio) * 10) / 10;
    let h; try { h = this._holdOf(shard, hostId); } catch { h = null; } // r7: a listing that fails counts nothing (said «counting»)
    // r8: a hold not read yet (or a listing that failed) counts NOTHING — `dropped` null, never 0 (the notice keeps the count
    // it said: r7 re-worded it to «0 held» and lost its «Past the bound» line); `unchecked`: its dropped rows may be in the
    // ledger (held while the month's index was not in memory, or read back after a restart)
    const rec = { host: hostId, hostName: hostName || (prev && prev.hostName) || hostId, shard: base, month: base.slice(7, 14), size: v.size, ratio, why: v.why, exact: !!v.exact, since: prev ? prev.since : now, lastAt: now, held: h ? this._heldCount(h) : null, dropped: h ? this._droppedOf(h) : (prev && prev.dropped != null ? prev.dropped : null), unchecked: h ? !!h.unchecked : !!(prev && prev.unchecked), gen: h && !h.none ? h.gen : (prev && prev.gen != null ? prev.gen : null), holdMax: this._holdMax(), ...(holdError ? { holdError } : {}), remedy: null, drain: null };
    this._pausedShards.set(key, rec);
    const first = !prev;
    const started = this._remedy(shard, v);
    rec.remedy = this._remedyOf(shard);
    // r3: said again when what it says changes (the rule, the remedy's state) — e.g. «judging» → the index's verdict; r4:
    // and the counts it says (held, dropped)
    const changed = !first && (prev.why !== rec.why || !prev.remedy || prev.remedy.state !== rec.remedy.state || prev.held !== rec.held || prev.dropped !== rec.dropped || prev.holdError !== rec.holdError || !!prev.drain || prev.hostName !== rec.hostName);
    if (first) console.warn(`[usage] ${rec.shard} is out of shape (${(rec.size / 2 ** 30).toFixed(2)} GiB${rec.ratio ? `, ~${rec.ratio}× its distinct rows` : ''}) — the usage of ${rec.hostName} for ${rec.month} is HELD beside it until it is back in shape (≤ ${Math.round(rec.holdMax / 2 ** 20)} MiB, then recorded in order; its other months are recorded as usual)${started ? '; removing the repeated rows now' : v.judging ? '; judged again by its index after the ledger loads' : ''}`);
    if (first || started || changed) this._emitShape({ kind: 'paused', ...rec });
    return { ...rec };
  }
  _pauseKey(hostId, shard) { return `${hostId}\n${path.basename(shard)}`; }
  /** The paused months of one machine (r4). */
  _pausedOf(hostId) { return [...this._pausedShards.values()].filter((r) => r.host === hostId); }

  // ── r4 THE HOLD of a paused month (host × month, beside the ledger) ────────────────────────────────────────────────────
  // r8 THE LOOP LAW: every file call of a hold past its first listing — its read-back, its rows' and its set's appends, a
  // cut back, the compaction, the records, the unlinks — runs on the hold's ASYNC road (fs.promises: libuv's pool, never
  // the main thread), ONE job at a time per hold (`_holdJob`: an append, a drain's step, the end — each sees what the one
  // before it left on disk and in memory); the ingest awaits its months' jobs (its answer is a promise then), bounded: a
  // job still running past HOLD_ANSWER_MS answers its batch unacked (`hold-slow`), and a file call waiting past
  // HOLD_SLOW_MS is SAID while it waits. What stays synchronous, and why: the ONE listing per process (at its first use,
  // like every store's load — a directory of a few names per held month), the ledger's own appends (`_appendRemote`
  // — the in-shape road, a drained slice of ≤ 1 MiB) and the ingest index's reads — the ledger's, not the hold's.
  _holdMax() { return this.holdMaxBytes || HOLD_MAX_BYTES; }
  _holdFile(h, seq) { return path.join(this.heldDir, `${h.key}.${seq}.ndjson`); }
  _dropFile(key, gen) { return path.join(this.heldDir, `${key}.${gen}.dropped`); }
  /** The holds on disk not yet read back (`_held/`) → Map(key → [seq]). r6: every generation a file names is seen
   *  (`_holdGens` — the next hold of that month is a newer one, even when an old file could not be unlinked). r7: a
   *  listing that FAILS (EIO, not ENOENT) throws — an empty disk is a fact, never a guess. r8: the listing is read once,
   *  at its first use (`_listHeldNow`); one that failed is a STATE (`_listFail`): this throws its error until a retry on
   *  its own timer works — never a readdir per ingest. */
  _heldOnDisk() {
    if (this._heldList) return this._heldList;
    if (this._listFail) throw this._listFail.error;
    return this._listHeldNow();
  }
  /** The names of `_held/` → the listing (the segments not read back, the set files, the generations seen; a
   *  `.dropped.tmp` — a compaction killed before its rename, the old file whole — swept). r9: A SET FILE IS LISTED ON ITS
   *  OWN — a generation is a set file with or without segments: a key whose every segment was drained and unlinked is in
   *  the listing too (an empty list of segments), read back and said (r8 listed segments only: a drained generation's
   *  count — its set, no segment left — was never read back, the boot re-worded its notice to «0 dropped» and swept the
   *  set: 33 rows said nowhere). */
  _listOf(names) {
    const m = new Map();
    for (const n of names) {
      let x = HOLD_NAME_RE.exec(n);
      if (x && !(Number.isSafeInteger(Number(x[3])) && holdGenOf(x[3]) <= HOLD_GEN_MAX)) continue; // r10: not a name of ours (past HOLD_GEN_MAX): never read, never unlinked
      if (x) { const k = `${x[1]}~${x[2]}`; if (!m.has(k)) m.set(k, []); m.get(k).push(Number(x[3])); this._holdGenSeen(k, holdGenOf(x[3])); this._diskFiles.add(path.join(this.heldDir, n)); continue; }
      x = HOLD_DROP_RE.exec(n);
      if (x && !(Number.isSafeInteger(Number(x[3])) && Number(x[3]) <= HOLD_GEN_MAX)) continue;
      if (x) { const k = `${x[1]}~${x[2]}`; if (!m.has(k)) m.set(k, []); if (!this._dropFiles.has(k)) this._dropFiles.set(k, []); if (!this._dropFiles.get(k).includes(Number(x[3]))) this._dropFiles.get(k).push(Number(x[3])); this._holdGenSeen(k, Number(x[3])); continue; }
      if (HOLD_DROP_TMP_RE.test(n)) this._track(this._heldUnlink(path.join(this.heldDir, n)));
    }
    return m;
  }
  /** r8: the listing — synchronous, ONCE per process (a directory of a few names per held month, like every store's
   *  load): a failure becomes the listing's state, retried on the async road (`_listHeld`). */
  _listHeldNow() {
    let names = [];
    try { names = fs.readdirSync(this.heldDir); } catch (e) { if (!e || e.code !== 'ENOENT') { this._listFailed(e); throw e; } }
    return (this._heldList = this._listOf(names));
  }
  /** r8: a retry of the listing, on the async road (one in flight) → the listing. */
  _listHeld() {
    if (this._heldList) return Promise.resolve(this._heldList);
    if (!this._listing) {
      if (this._listFail) this._listFail.retrying = true; // r9: `holdListFailed` says a retry is in flight
      this._listing = this._track(this._holdIO('listing', this.heldDir, fs.promises.readdir(this.heldDir)).catch((e) => { if (e && e.code === 'ENOENT') return []; throw e; }).then((names) => {
        this._listing = null;
        this._heldList = this._listOf(names);
        if (this._listFail) this._listBack();
        return this._heldList;
      }, (e) => { this._listing = null; this._listFailed(e); throw e; }));
    }
    return this._listing;
  }
  /** r8: THE LISTING FAILED — a state of the instance, said ONCE (a journal line, a For-you notice: `hold-list`), retried on
   *  its own timer (HOLD_LIST_RETRY_MS, doubling to HOLD_LIST_RETRY_MAX_MS), never per ingest (r7: a readdir and a warn line
   *  per month per batch — an 84-min outage ≈ 10³ of each per machine); a month that needs its hold waits, unacked, told
   *  `retryAfter`; one in shape and not paused needs none and goes. */
  _listFailed(e) {
    const prev = this._listFail, now = Date.now(), tries = (prev ? prev.tries : 0) + 1;
    const wait = Math.min(this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS, (this.holdListRetryMs || HOLD_LIST_RETRY_MS) * 2 ** (tries - 1));
    const code = String((e && e.code) || (e && e.message) || e).slice(0, 40);
    if (prev && prev.timer) clearTimeout(prev.timer);
    const f = { error: e, code, since: prev ? prev.since : now, tries, nextAt: now + wait, nextWait: Math.min(this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS, wait * 2), retrying: false, timer: null };
    f.timer = setTimeout(() => { if (this._listFail === f) this._listHeld().catch(() => { }); }, wait); f.timer.unref?.();
    this._listFail = f;
    if (prev) return;
    console.warn(`[usage] the held months (data/usage-history/_held) could not be listed (${code}) — a month that needs its hold waits, unacked (its machine sends it again), until a listing works; listed again in ${Math.round(wait / 1000)} s, then less often (every ${Math.round((this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS) / 1000)} s at most)`);
    this._emitShape({ kind: 'hold-list', state: 'failed', code, since: f.since });
  }
  _listBack() {
    const f = this._listFail; this._listFail = null; if (f.timer) clearTimeout(f.timer);
    console.log(`[usage] the held months are listed again (${f.code} for ${Math.round((Date.now() - f.since) / 1000)} s, ${f.tries} tr${f.tries === 1 ? 'y' : 'ies'}) — every hold is read back`);
    this._emitShape({ kind: 'hold-list', state: 'ok', code: f.code, since: f.since });
    setImmediate(() => { try { this.restoreHolds(); } catch (e) { console.warn(`[usage] the holds could not be read back: ${(e && e.message) || e}`); } });
  }
  /** r8: the listing's failure state (the notice's reconcile; the Usage window) → {code, since, tries, retryAfter, retrying}
   *  | null. r9: `retrying` — its retry is in flight now (r8 said the old state, and `retryAfter: 1`, for as long as a slow
   *  retry waited). */
  holdListFailed() { const f = this._listFail; return f ? { code: f.code, since: f.since, tries: f.tries, retryAfter: this._retryAfter(), retrying: !!f.retrying } : null; }
  /** r8: seconds until a failed listing — r9: or the read-back of the hold `key` — is tried again (the answer's
   *  `retryAfter`; 0 = neither is failing). A retry in flight answers the wait the next one would have. */
  _retryAfter(key = null) {
    const now = Date.now(), waits = [this._listFail, key ? this._readFail.get(key) : null].filter(Boolean).map((f) => (f.retrying ? f.nextWait : f.nextAt - now));
    return waits.length ? Math.max(1, Math.ceil(Math.max(...waits) / 1000)) : 0;
  }
  /** r9: A HOLD'S READ-BACK THAT FAILED (EACCES, EIO …) — a state of that hold, like the listing's: said ONCE (a journal line,
   *  the For-you notice `hold-read` naming the file), read again on its own timer (HOLD_LIST_RETRY_MS doubling to
   *  …_MAX_MS), never at an ingest (r8 started a new read-back at every try of every batch and answered every month of it
   *  `deferred` — 2 warn lines a batch, 0 of 6 November batches recorded); while it fails `_holdOf` throws its error: a
   *  month that needs that hold answers `holdFailed` + `retryAfter`, one in shape and not paused goes. */
  _readFailed(key, shard, host, e) {
    const prev = this._readFail.get(key), now = Date.now(), tries = (prev ? prev.tries : 0) + 1;
    const wait = Math.min(this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS, (this.holdListRetryMs || HOLD_LIST_RETRY_MS) * 2 ** (tries - 1));
    const code = String((e && e.code) || (e && e.message) || e).slice(0, 40), file = path.basename(String((e && e.path) || key));
    if (prev && prev.timer) clearTimeout(prev.timer);
    const f = { error: e, code, file, shard, host: String(host), since: prev ? prev.since : now, tries, nextAt: now + wait, nextWait: Math.min(this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS, wait * 2), retrying: false, timer: null };
    f.timer = setTimeout(() => { if (this._readFail.get(key) !== f) return; f.retrying = true; try { this._holdOf(shard, host); } catch { } }, wait); f.timer.unref?.();
    this._readFail.set(key, f);
    if (prev) return;
    const base = path.basename(shard);
    console.warn(`[usage] the hold ${key} could not be read (${code}: ${file}) — ${base.slice(7, 14)} of ${host} waits, unacked (its machine sends it again) unless its file is in shape; every other month is recorded; read again in ${Math.round(wait / 1000)} s, then less often (every ${Math.round((this.holdListRetryMaxMs || HOLD_LIST_RETRY_MAX_MS) / 1000)} s at most)`);
    this._emitShape({ kind: 'hold-read', state: 'failed', host: String(host), hostName: String(host), shard: base, month: base.slice(7, 14), file, code, since: f.since });
  }
  /** r9: the read-back that failed works now — its state gone, its notice closed. r10: A NOTICE CLOSES WHEN WHAT IT NAMES IS
   *  READ — across a restart too: EVERY read-back that works says so (`hold-read` ok), whether or not this process saw it
   *  fail (r9 said it only after its own failure: a notice filed before a restart read «cannot be read» for ever while
   *  its month was acked); the notice closes its item by its key, and a key with no item costs a lookup. */
  _readBack(key, h = null) {
    const f = this._readFail.get(key);
    if (f) {
      this._readFail.delete(key); if (f.timer) clearTimeout(f.timer);
      console.log(`[usage] the hold ${key} is read again (${f.code} for ${Math.round((Date.now() - f.since) / 1000)} s, ${f.tries} tr${f.tries === 1 ? 'y' : 'ies'})`);
    }
    const base = f ? path.basename(f.shard) : h ? h.base + '.ndjson' : null;
    if (!base) return;
    this._emitShape({ kind: 'hold-read', state: 'ok', host: f ? f.host : h.host, shard: base, month: base.slice(7, 14), file: f ? f.file : null, code: f ? f.code : null, since: f ? f.since : null });
  }
  /** r10: the read-back of (host, file) settled, either way → Promise (now, when none is in flight) — the notice's reconcile
   *  judges its item after it, never at the instant it started it. */
  holdReadSettled(host, shardName) { const h = this._holds.get(this._holdKey(this._shardPath(shardName), host)); return h && h.loading ? h.loading.then(() => { }, () => { }) : Promise.resolve(); }
  /** r9: is the hold of (host, file) still to be read (its read-back failing, in flight, or listed)? (the notice's reconcile) */
  holdReadPending(host, shardName) { const k = this._holdKey(this._shardPath(shardName), host), h = this._holds.get(k); if (this._readFail.has(k) || (h && h.loading)) return true; try { return this._heldOnDisk().has(k); } catch { return true; } }
  _holdGenSeen(key, gen) { if (!(this._holdGens.get(key) >= gen)) this._holdGens.set(key, gen); }
  /** r9: a generation a notice names (ledger-shape-notice's `wire`, every item it holds) — the next hold of that month is a
   *  newer one, even when no file of it is left on disk (a restart minted generation 0 again, and the item read the new
   *  hold's count as the same generation's: the ended hold's «36» lost when the month's next hold re-worded it). */
  holdGenSeen(host, shardName, gen) { const g = Number(gen); if (host && shardName && Number.isSafeInteger(g) && g >= 0 && g <= HOLD_GEN_MAX) this._holdGenSeen(this._holdKey(this._shardPath(String(shardName)), host), g); }
  /** r6: a NEW hold of (month, host) — a generation newer than any this process or its disk has seen. */
  _holdGenNext(key) { this._heldOnDisk(); const g = this._holdGens.has(key) ? this._holdGens.get(key) + 1 : 0; this._holdGens.set(key, g); return g; }
  /** r6: the set files of the hold's key other than its own generation's — a stale hold's — unlinked (an error leaves them).
   *  r8: A RECORD OUTLIVES EVERY FILE IT DESCRIBES — never the set of a generation one of whose segment files is still on
   *  disk (`_diskFiles`: the listing, our own appends, our unlinks — r7 passed an empty «stuck» set here and in
   *  restoreHolds, and unlinked a retired generation's record while its segments stayed: a later restart read them back
   *  as a live hold of rows the ledger had). r10: NOTHING IS UNLINKED UNREAD — each older set is read first (oldest first)
   *  and its count, unless its end retired it (said then), SAID — an older generation's count is its notice's «Earlier»
   *  line — and only once it is on disk does the file go (r9 deleted it unread: with two set files at a boot the older
   *  one's 33 was said only if an item already named it); a set that cannot be read, or whose count the notice store
   *  refused, stays for the next start. A job of the hold's road. */
  async _dropStale(h) {
    const key = h.key, gens = this._dropFiles.get(key) || [];
    if (!gens.length) return;
    const left = new Set();
    for (const p of this._diskFiles) { const x = HOLD_NAME_RE.exec(path.basename(p)); if (x && `${x[1]}~${x[2]}` === key) left.add(holdGenOf(x[3])); }
    const base = h.base + '.ndjson';
    for (const g of gens.filter((x) => x !== h.gen && !left.has(x)).sort((a, b) => a - b)) {
      const df = this._dropFile(key, g);
      let st; try { st = await this._readSet(df); } catch (e) { console.warn(`[usage] the hold ${key}: the set of its generation ${g} could not be read (${(e && e.code) || (e && e.message) || e}: ${path.basename(df)}) — kept, read again at the next start`); continue; }
      const n = st.retired ? 0 : st.gone.size;
      if (n && this._emitShape({ kind: 'dropped', host: h.host, hostName: h.hostName || h.host, shard: base, month: base.slice(7, 14), dropped: n, gen: g, unchecked: !st.checked, holdMax: this._holdMax() }) === false) continue;
      if (await this._heldUnlink(df)) this._dropFiles.set(key, (this._dropFiles.get(key) || []).filter((x) => x !== g));
    }
  }
  /** r10: a generation's set file read → {gone, retired, checked, below, end, lineEnd} — the read-back's own parse (`gone`
   *  adds, `back` removes, in their order; `checked`: the last `checked` record came after the last `gone` line). */
  async _readSet(df, gone = new Set()) {
    const r = { gone, retired: false, checked: false, below: 0 };
    const s = await LD.eachLineAsync(df, 0, (buf, a, b) => {
      try {
        const j = JSON.parse(buf.toString('utf8', a, b));
        if (Array.isArray(j && j.gone)) { for (const x of j.gone) r.gone.add(String(x)); r.checked = false; }
        else if (Array.isArray(j && j.back)) for (const x of j.back) r.gone.delete(String(x));
        else if (j && Number.isFinite(j.below)) r.below = Math.max(r.below, j.below);
        else if (j && j.retired != null) r.retired = true;
        else if (j && Number.isFinite(j.checked)) r.checked = true;
      } catch { } // a line torn mid-append (a crash, or a cut that failed too) is no line
    }, { io: this._ioOf('read-back') });
    return { ...r, end: s.end, lineEnd: s.lineEnd };
  }
  /** The hold of (shard, host) → its record | NO_HOLD (nothing held; `create` makes the record) | null (a hold on disk is
   *  being read back — `.loading` on the record; the caller waits for it). A hold on disk is read back ONCE, on the async
   *  road (r8: r7 read ≤ 8 MiB inline): its rows' rids (a re-sent row is held once), counts and the dropped set (its
   *  generation's set file). r6 (R1): the hold's generation is its newest segment's — an OLDER one's segment is a
   *  drained hold's file whose unlink failed: unlinked, never read, never counted. r7: the newest generation itself may
   *  be done — `retired` (r8: honoured only when its `below` covers every one of its segments): its files unlinked
   *  unread, nothing held. Throws when the listing failed (the caller's batch waits) — r9: and while its own read-back
   *  fails (`_readFailed`: retried on its timer, never here). r9: a generation is its newest file's — a segment's or a
   *  set file's (a drained generation: its set alone). */
  _holdOf(shard, host, create = false) {
    const key = this._holdKey(shard, host);
    let h = this._holds.get(key);
    if (h) return h.loading ? null : h;
    const rf = this._readFail.get(key);
    if (rf && !rf.retrying) throw rf.error;
    const onDisk = this._heldOnDisk().get(key);
    if (!onDisk && !create) return NO_HOLD;
    const listed = (onDisk || []).slice().sort((a, b) => a - b);
    this._heldOnDisk().delete(key);
    const top = Math.max(listed.length ? holdGenOf(listed[listed.length - 1]) : -1, ...(onDisk ? this._dropFiles.get(key) || [] : []));
    const gen = top >= 0 ? top : this._holdGenNext(key);
    const seqs = listed.filter((q) => holdGenOf(q) === gen), old = listed.filter((q) => holdGenOf(q) !== gen);
    h = { key, gen, base: path.basename(shard, '.ndjson'), host: String(host), hostName: null, segs: [], nextSeq: gen * HOLD_GEN_SPAN, gone: new Set(), goneBytes: 0, goneTorn: false, below: 0, retired: false, stale: false, unchecked: false, unsaid: false, compactAt: DROP_COMPACT_MIN, loading: null, draining: null, ending: null, io: Promise.resolve(), pending: 0, waiting: 0, waitEnds: [], step: null };
    this._holds.set(key, h);
    if (!onDisk) { this._holdJob(h, () => this._dropStale(h)); return h; }
    h.loading = this._holdJob(h, async () => {
      for (const q of old) await this._heldUnlink(path.join(this.heldDir, `${key}.${q}.ndjson`));
      await this._dropStale(h); // r10: an older generation's set read and its count said before it goes — before this one's
      await this._holdLoad(h, seqs); // r9: a set-only generation too (its count)
    }).then(() => {
      h.loading = null;
      this._readBack(key, h);
      if (this._holds.get(key) !== h) return;
      if (h.retired) { this._holds.delete(key); return; }
      this._afterHoldLoad(h);
    }, (e) => {
      h.loading = null;
      if (this._holds.get(key) === h) this._holds.delete(key);
      if (this._heldList) this._heldList.set(key, listed); // still on disk, unread — r9: read again by its own timer
      this._readFailed(key, shard, host, e);
    });
    return null;
  }
  _holdKey(shard, host) { return `${path.basename(shard, '.ndjson')}~${holdHostKey(host)}`; }
  /** Is anything of (shard, host) held — in memory or on disk, not yet read back? (r5: a resume waits for it) */
  _holdsAny(shard, host) { const k = this._holdKey(shard, host), h = this._holds.get(k); if (h) return !!(h.loading || this._holdBusy(h)); try { return this._heldOnDisk().has(k); } catch { return true; } } // r7: a listing that fails — held, as far as anyone knows
  /** The dropped count — the SET's size (r6: the dropped ROWS, each rid once — however often it was re-sent or dropped). */
  _droppedOf(h) { return (h && h.gone && h.gone.size) || 0; }
  /** r8: the count a hold ENDS with — its set less every row the month's index holds (the drain loads it; a row the hold
   *  could not check when it took it — read back after a restart, held while the index was not in memory — may be in the
   *  ledger after all: residual 3 counted 8 recorded rows «never recorded»). */
  _droppedFinal(h, shard) {
    if (!h || h.none) return 0;
    const ix = this._ingestIx.get(shard);
    if (ix && !ix.loading && !ix.over && ix.ino) {
      const back = [...h.gone].filter((r) => ix.rids.has(r)), was = h.unchecked;
      for (const r of back) h.gone.delete(r);
      h.unchecked = false;
      // r9: WHAT THE INDEX TOLD IS A RECORD — the rows it found leave the set on disk too (`back`), and the set is `checked`
      // (the rest are not in the ledger), one job before the end's own: a restart reads back the count the end said (c2:
      // a restart with the index not in memory re-said 8 recorded rows «never recorded»)
      if (back.length || (was && h.gone.size)) this._holdJob(h, () => this._holdMark(h, dropLines('back', back) + JSON.stringify({ checked: h.gone.size }) + '\n'));
    }
    return this._droppedOf(h);
  }
  /** r8: a hold being read back — the generation's set first (`gone` adds, `back` removes — in their order; `below`: every
   *  segment numbered under it is done; `retired`: the whole generation is), then each live segment's rows. On the async
   *  road: a slice per read (≤ LD.STEP_BYTES), the loop free between them. */
  async _holdLoad(h, seqs) {
    const df = this._dropFile(h.key, h.gen);
    const s = await this._readSet(df, h.gone), checked = s.checked; // r9: `checked` — every dropped row checked (r10: `_readSet`, the one parse)
    h.below = Math.max(h.below, s.below); if (s.retired) h.retired = true;
    h.goneBytes = s.end; h.goneTorn = s.end > s.lineEnd; // a crash mid-append: the next line starts on a line of its own
    const live = seqs.filter((q) => q >= h.below);
    // r8: a `retired` line is honoured only when `below` covers every segment of the generation (nothing live is left: its
    // end wrote `below` before each drained segment's unlink) — else it is no record of ours: the generation reads back
    // LIVE (r7 honoured it blindly: an injected line deleted 12 held + 8 dropped rows, 0/20 recorded)
    if (h.retired && live.length) { console.warn(`[usage] the hold ${h.key}: its set says «retired» while ${live.length} of its segment(s) are past its \`below\` (${h.below}) — not a record its end wrote; read back as a live hold`); h.retired = false; }
    // r7: a RETIRED generation (its end recorded; an unlink failed — EBUSY): every file of it unlinked unread, nothing held,
    // nothing counted (its count was said before it retired); r8: its set stays while one of its segments does
    if (h.retired) {
      let all = true;
      for (const seq of seqs) all = (await this._holdUnlink(h, seq)) && all;
      if (all) await this._heldUnlink(df);
      h.gone.clear();
      return;
    }
    for (const seq of seqs) {
      h.nextSeq = Math.max(h.nextSeq, seq + 1);
      // r7: a segment under `below` is DONE — dropped (its rows are in the set) or drained (its rows are in the ledger):
      // unlinked unread, never counted, never drained
      if (seq < h.below) { await this._holdUnlink(h, seq); continue; }
      const seg = { seq, rows: 0, bytes: 0, at: 0, rids: new Set(), done: new Set(), torn: false, sealed: false };
      const r = await LD.eachLineAsync(this._holdFile(h, seq), 0, (buf, a, b) => {
        const x = rowStart(buf, a, b); // r7: a torn line is no row
        const rid = x < 0 ? null : LD.ridAt(buf, x, b);
        if (rid) { seg.rows++; seg.rids.add(rid); }
      }, { io: this._ioOf('read-back') });
      seg.bytes = r.end; seg.torn = r.end > r.lineEnd;
      if (seg.rids.size) h.segs.push(seg); else await this._holdUnlink(h, seq); // r7: no whole row — nothing to hold or drain
    }
    h.nextSeq = Math.max(h.nextSeq, h.below); // a number `below` names is never used again
    if (!h.segs.length) {
      // r7: a generation read back with NO live row and nothing dropped is done — retired silently. r8: one whose set still
      // counts dropped rows was never retired — its count may never have reached the owner (its notice in the store's
      // debounce at a crash): it is KEPT (empty), said and ended by `_afterHoldLoad`
      if (!h.gone.size) { h.retired = true; if (!h.stale) await this._heldUnlink(df); }
      h.unchecked = h.gone.size > 0 && !checked; // r9: a count the end checked (its `checked` record) is said as checked
      return;
    }
    // a row in a live segment is HELD (it will be recorded), never in the set — r7: whatever a line said (a crash between
    // the rows and their `back` line); the segments the set dropped are the ones `below` names, never guessed from rows
    for (const seg of h.segs) for (const r of seg.rids) h.gone.delete(r);
    h.unchecked = true; // rows read back: nobody checked them against the ledger in this process (r8: «may already be recorded»)
    h.compactAt = Math.max(DROP_COMPACT_MIN, 4 * dropBytesOf(h.gone)); // r7: 4× the set (r6: 4× the file — a file 31× its set was kept)
  }
  _holdBusy(h) { return !!(h && (h.draining || h.segs.length || h.pending)); }
  _heldCount(h) { return h.segs.reduce((a, s) => a + s.rows, 0); }
  /** r8: ONE job on a hold's road — after every job queued before it (whatever it ended with) → its promise. */
  _holdJob(h, fn) {
    const p = h.io.then(fn);
    h.io = p.then(() => { }, () => { });
    return this._track(p);
  }
  /** r8: a promise the hold's road has in flight (`holdsSettled` waits for every one). */
  _track(p) {
    this._inflight.add(p);
    const off = () => { this._inflight.delete(p); };
    p.then(off, off);
    return p;
  }
  /** r8: every job of every hold, the listing, the drains and the ingests awaiting them — settled (a suite; a caller that
   *  wants what it asked for on disk). */
  async holdsSettled() {
    for (let i = 0; i < 10000 && this._inflight.size; i++) await Promise.allSettled([...this._inflight]);
  }
  /** r8: a file call of the hold's road, SAID while it waits (HOLD_SLOW_MS — the main thread is free to say it; r7's
   *  timedSync recorded a call only once it returned, and a hung one never). r9: EVERY WAIT IS BOUNDED AND SAID — every
   *  call of the road past its one listing goes through here (the read-back's opens and reads, the drain's, the unlinks,
   *  the stats, the cuts, the renames, the listing's retry; r8 wrapped the appends and the compaction only: a hung
   *  read-back was silent, and its batch waited with no bound — `_loadsBounded` now). */
  _holdIO(what, file, p) {
    const t0 = Date.now();
    let t = null;
    const say = () => { const ms = Date.now() - t0; console.warn(`[usage] the hold's ${what} of ${path.basename(file)} has waited ${ms < 10e3 ? (ms / 1000).toFixed(1) : Math.round(ms / 1000)} s — the disk of the data folder is not answering; its batch waits, unacked`); t = setTimeout(say, HOLD_SLOW_AGAIN_MS); t.unref?.(); };
    t = setTimeout(say, this.holdSlowMs || HOLD_SLOW_MS); t.unref?.();
    return p.finally(() => clearTimeout(t));
  }
  /** r9: LD.eachLineAsync's `io` — each of its file calls through `_holdIO`. */
  _ioOf(what) { return (file, p) => this._holdIO(what, file, p); }
  /** Rows of a paused month into its hold: a row the hold already has is a duplicate (an older daemon re-sends its window),
   *  so is one the month's rid index holds (r8 — residual 3: the ledger has it; consulted when the index is in memory), the
   *  rest appended in their order → Promise({held, duplicates}). r6: a re-sent row the hold DROPPED that stays dropped (no
   *  room without dropping another) is one too — the set already counts it. r8: a job of the hold's road; a hold that
   *  ended before its turn hands the rows to the month's next hold. A hold with HOLD_QUEUE_MAX jobs waiting refuses at
   *  once (`hold-busy`, unacked: the device keeps the rows) — a stalled disk never queues a machine's every batch. */
  _holdRows(h, rows, hostName, opts = {}) {
    if (h.pending >= (this.holdQueueMax || HOLD_QUEUE_MAX)) return Promise.reject(Object.assign(new Error(`the hold ${h.key} has too many writes waiting`), { code: 'hold-busy' }));
    h.pending++;
    const once = () => this._holdJob(h, async () => {
      let r = null;
      try {
        if (this._holds.get(h.key) !== h) { const cur = this._holdOf(this._shardPath(h.base + '.ndjson'), h.host, true); if (cur && cur !== h) return (r = await this._holdRows(cur, rows, hostName, opts)); }
        if (hostName) h.hostName = hostName;
        return (r = await this._holdAppend(h, rows, opts));
      } finally { if (!(r && r.wait)) h.pending--; } // r10: a write that waits for the drain's next step stays pending (the drain goes on for it)
    });
    // r10: the wait is OFF the hold's road (a job that waited on it would hold up the very step it waits for)
    return this._track((async () => { for (;;) { const r = await once(); if (!(r && r.wait)) return r; await r.wait; } })());
  }
  /** r10: the drain's next step (or its end) → Promise — what an append that would push out a row not drained yet waits for. */
  _nextStep(h) { if (!h.step) { let res; const p = new Promise((r) => { res = r; }); h.step = { p, res }; } return h.step.p; }
  _stepped(h) { const st = h.step; if (st) { h.step = null; st.res(); } }
  /** One append to a hold, BOUNDED: a batch alone past the bound keeps its newest rows; a segment past HOLD_SEG_BYTES starts
   *  the next; past the bound the oldest segments go — every row dropped COUNTED and said in one line. r5: the count is the
   *  dropped SET — r6: the dropped ROWS' rids (`h.gone`), never a position. A re-sent row the set holds is held again only
   *  when every row of the append fits without dropping another (it leaves the set: recorded after all); else it stays
   *  dropped — counted once, never re-written. r7 THE ORDER: the rows, then the set's lines (`gone` / `back` and `below` —
   *  the first segment kept) naming only what the rows' append confirmed, then the unlinks; an append that throws is cut
   *  back and the hold is as it was, on disk and in memory (a set line that cannot be written cuts the rows back too). The
   *  bound counts UNDRAINED bytes (`at`, the drain's cursor); r8: DEDUP AND THE DRAIN CURSOR ARE TWO THINGS — a segment
   *  keeps every rid until it is unlinked (r7 pruned a drained row from `rids`, which is also the duplicate check: a
   *  re-send mid-drain was held twice and pushed out undrained acked rows — 12 of 16 recorded); a pushed-out segment's
   *  dropped rows are its rows NOT DRAINED (`done`). An unverified cut (the truncate and the stat both failed) SEALS its
   *  segment: the next rows go to a new one until a stat re-establishes its length. → {held, duplicates, again}. */
  async _holdAppend(h, rows, { ix = null, checked = false } = {}) {
    const kept = [], seen = new Set(); let duplicates = 0;
    for (const e of rows) {
      if (seen.has(e.rid) || h.segs.some((s) => s.rids.has(e.rid)) || (ix && ix.rids.has(e.rid))) { duplicates++; continue; }
      seen.add(e.rid); kept.push(e);
    }
    if (!kept.length) return { held: 0, duplicates, again: 0 };
    if (!checked) h.unchecked = true;
    const max = this._holdMax(), segMax = Math.min(max, this.holdSegBytes || HOLD_SEG_BYTES);
    const lenOf = (e) => Buffer.byteLength(e.line) + 1, leftOf = (s) => s.bytes - s.at, total0 = h.segs.reduce((a, s) => a + leftOf(s), 0);
    const back = kept.filter((e) => h.gone.has(e.rid));
    const fits = !back.length || total0 + kept.reduce((a, e) => a + lenOf(e), 0) <= max;
    const take = fits ? kept : kept.filter((e) => !h.gone.has(e.rid)), again = kept.length - take.length;
    if (!take.length) return { held: 0, duplicates: duplicates + again, again };
    const len = take.map(lenOf);
    let bytes = len.reduce((a, b) => a + b, 0), cut = 0;
    while (bytes > max && cut < take.length) bytes -= len[cut++]; // a batch alone over the bound: its oldest rows go
    let last = h.segs[h.segs.length - 1];
    if (last && last.sealed) { const n = await this._heldSize(this._holdFile(h, last.seq)); if (n >= 0) { last.bytes = Math.max(n, last.at); last.torn = true; last.sealed = false; } } // r8: its length known again
    const fresh = !last || last.sealed || (last.bytes && last.bytes + bytes > segMax);
    if (fresh && holdGenOf(h.nextSeq) !== h.gen) { // r7 (unreachable — see HOLD_SEQ_BOUND): never numbered as the next generation's
      console.warn(`[usage] the hold ${h.key} would rotate past its generation's ${HOLD_GEN_SPAN} segment numbers — refused (${HOLD_SEQ_BOUND}): this batch is not acked`);
      throw Object.assign(new Error(`the hold ${h.key} is past its generation's segment numbers`), { code: HOLD_SEQ_BOUND });
    }
    const seg = fresh ? { seq: h.nextSeq, rows: 0, bytes: 0, at: 0, rids: new Set(), done: new Set(), torn: false, sealed: false } : last;
    const segs = fresh ? [...h.segs, seg] : h.segs, gone = [];
    for (let total = segs.reduce((a, s) => a + leftOf(s), 0); segs.length - gone.length > 1 && total + bytes > max;) { const old = segs[gone.length]; gone.push(old); total -= leftOf(old); }
    // r10: A ROW THAT FITS IS NEVER PUSHED OUT BY THE ROWS THAT ARRIVED WITH THE DRAIN — while the hold drains (its month back
    // in shape) rows that would push out a segment not drained yet wait for the drain's next step, which empties the hold
    // a slice per loop turn: the bound drops only what a hold that does not drain cannot keep (r4–r9: the batch that
    // started the drain was appended before its first step — 15 held rows dropped, 3 of 18 recorded; a drain that fails
    // or ends lets it go at once, the bound judged then)
    if (h.draining && gone.some((g) => g.rids.size > g.done.size)) return { wait: this._nextStep(h) };
    const keep = cut ? take.slice(cut) : take;
    // the rows dropped: this batch's oldest past the bound + the pushed-out segments' rows NOT DRAINED (r8: `done`, the
    // drain's own record — never by shrinking `rids`)
    const dropRids = [...take.slice(0, cut).map((e) => e.rid), ...gone.flatMap((g) => [...g.rids].filter((r) => !g.done.has(r)))], backRids = fits ? back.map((e) => e.rid) : [];
    const below = gone.length ? segs[gone.length].seq : 0; // r7: every segment numbered under it is done (its rows in the set)
    const setText = dropRids.length || backRids.length || below ? (h.goneTorn ? '\n' : '') + dropLines('gone', dropRids) + dropLines('back', backRids) + (below ? JSON.stringify({ below }) + '\n' : '') : '';
    const text = keep.length ? (seg.torn ? '\n' : '') + keep.map((e) => e.line).join('\n') + '\n' : '';
    await this._holdIO('folder', this.heldDir, fs.promises.mkdir(this.heldDir, { recursive: true }));
    // r7 THE ORDER — the rows first: one that throws is cut back, the hold as it was (disk and memory)
    const file = this._holdFile(h, seg.seq);
    if (text) {
      if (fresh) this._diskFiles.add(file);
      const f = await this._holdWrite(file, text, seg.bytes);
      if (f) { this._holdTorn(h, seg, fresh, f.at); throw f.error; }
    }
    // … then the set's lines, naming only what the rows' append confirmed: one that throws is cut back and the rows with it
    // (rows that cannot be cut back are on disk whole — then they are held, and nothing is dropped)
    if (setText) {
      const f = await this._holdWrite(this._dropFile(h.key, h.gen), setText, h.goneBytes);
      if (f) {
        this._goneTorn(h, f.at);
        const at = text ? await this._holdCut(file, seg.bytes) : seg.bytes;
        if (at !== seg.bytes) { if (fresh) { h.segs.push(seg); h.nextSeq++; } seg.torn = at !== seg.bytes + Buffer.byteLength(text); seg.sealed = at < 0; seg.bytes = at < 0 ? seg.bytes + Buffer.byteLength(text) : at; seg.rows += keep.length; for (const e of keep) seg.rids.add(e.rid); for (const r of backRids) h.gone.delete(r); }
        throw f.error;
      }
      h.goneBytes += Buffer.byteLength(setText); h.goneTorn = false;
    }
    // … both landed: the memory …
    if (fresh && text) { h.segs.push(seg); h.nextSeq++; }
    if (text) { seg.torn = false; seg.bytes += Buffer.byteLength(text); seg.rows += keep.length; for (const e of keep) seg.rids.add(e.rid); }
    for (const r of dropRids) h.gone.add(r);
    for (const r of backRids) h.gone.delete(r);
    if (below) h.below = Math.max(h.below, below);
    // … and only now the files go (a crash before their unlink: `below` names them)
    for (const old of gone) { h.segs.splice(h.segs.indexOf(old), 1); await this._holdUnlink(h, old.seq); }
    if (h.goneBytes > h.compactAt) await this._dropCompact(h);
    if (dropRids.length) console.warn(`[usage] the rows of ${h.base} held for ${h.hostName || h.host} passed the hold's ${Math.round(max / 2 ** 20)} MiB: its ${dropRids.length} oldest held row(s) were dropped — ${this._droppedOf(h)} dropped so far, counted in its notice${h.unchecked ? ' (some may be in the ledger already: checked when the month is back in shape)' : ', never recorded'}`);
    return { held: keep.length, duplicates: duplicates + again, again };
  }
  /** r7: ONE append to a hold's file (a segment's rows, its generation's set lines) — whole or not at all: one that throws
   *  (ENOSPC, EDQUOT, EMFILE — a part of it may have landed) is cut back to the length it had (`before`). r8: on the
   *  async road. → null (landed) | {error, at} (`at`: its length now — `before`, else the real one: the cut failed too,
   *  see `_holdTorn`; −1: not even its length could be read). */
  async _holdWrite(file, text, before) {
    try { await this._holdIO('append', file, fs.promises.appendFile(file, text)); return null; } catch (error) { return { error, at: await this._holdCut(file, before) }; }
  }
  /** r7: a hold's file cut back to `before` bytes → its length now (`before`; the real one when the cut fails; −1 unknown).
   *  A file the append created (`before` 0) is unlinked — never an empty file left beside the hold. */
  async _holdCut(file, before) {
    try { if (before > 0 || !(await this._heldUnlink(file))) await this._holdIO('cut', file, fs.promises.truncate(file, before)); return before; }
    catch (e) { if (e && e.code === 'ENOENT') return 0; return this._heldSize(file); }
  }
  /** r8: a hold file's length (−1: unknown). */
  async _heldSize(file) { try { return (await this._holdIO('stat', file, fs.promises.stat(file))).size; } catch { return -1; } }
  /** r7: a segment an append left torn (its cut failed too) — known in-process: its next line on a line of its own, its
   *  length the real one, a fresh one's number used. r8: a length that could not be read SEALS it (r7 kept the old one,
   *  and a later cut back truncated rows an append between had landed and acked — 2 of 10 lost, counted nowhere). */
  _holdTorn(h, seg, fresh, at) {
    if (at === seg.bytes) return;
    seg.torn = true;
    if (at < 0) seg.sealed = true; else if (at > seg.bytes) seg.bytes = at;
    if (fresh) { h.segs.push(seg); h.nextSeq++; }
  }
  /** r7: the set file an append left torn (its cut failed too): its next line on a line of its own, and the set rewritten
   *  whole (from memory) at the next append — the fragment's whole lines never read back as the set's. */
  _goneTorn(h, at) {
    if (at === h.goneBytes) return;
    h.goneTorn = true; if (at > h.goneBytes) h.goneBytes = at;
    h.compactAt = 0;
  }
  /** r7: one RECORD line in the generation's set file (`below`, `retired`; r9: or the lines themselves — `back` + `checked`)
   *  → whether it landed. */
  async _holdMark(h, line) {
    const text = (h.goneTorn ? '\n' : '') + (typeof line === 'string' ? line : JSON.stringify(line) + '\n');
    const f = await this._holdWrite(this._dropFile(h.key, h.gen), text, h.goneBytes);
    if (f) { this._goneTorn(h, f.at); return false; }
    h.goneBytes += Buffer.byteLength(text); h.goneTorn = false;
    if (line && line.below) h.below = Math.max(h.below, line.below);
    return true;
  }
  /** r6: the set file rewritten as the set (tmp + rename) once its lines pass 4× it — an error leaves the old one (valid).
   *  r7: `below` rides it; 4× from growth alone rewrites it at 64 KiB, 256 KiB, 1 MiB, … (≈ 1.33× its final size in all).
   *  r8: on the async road (r7 wrote the whole set — uncapped — on the main thread). */
  async _dropCompact(h) {
    const f = this._dropFile(h.key, h.gen), text = dropLines('gone', [...h.gone]) + (h.below ? JSON.stringify({ below: h.below }) + '\n' : '');
    try {
      if (!text) { if (await this._heldUnlink(f)) h.goneBytes = 0; }
      else { await this._holdIO('compaction', f, fs.promises.writeFile(f + '.tmp', text)); await this._holdIO('compaction', f, fs.promises.rename(f + '.tmp', f)); h.goneBytes = Buffer.byteLength(text); }
      h.goneTorn = false;
    } catch { await this._heldUnlink(f + '.tmp'); }
    h.compactAt = Math.max(DROP_COMPACT_MIN, 4 * h.goneBytes);
  }
  /** r8: THE END of a hold — every row of it recorded or dropped: its count SAID first (`said`: the notice store has it on
   *  disk — `_resumed` / `_sayDropped`), then its `retired` record (a generation with a file on disk — r7), then its set's
   *  unlink (r7 wrote `retired` while the notice carrying the count sat in the store's 500 ms debounce: a restart read
   *  nothing back and said nothing — 33 drops never said). A count not said keeps the hold, empty, its set on disk: the
   *  month's next episode continues it, a read-back says it again. One job of the hold's road. → Promise(ended) | null. */
  _holdEnd(h, said = true) {
    if (!h || h.none) return null;
    if (!said) { h.unsaid = true; return null; } // r9: said again at its machine's every ingest (`_sayUnsaid`) and, after a restart, by its read-back (its set)
    if (h.ending) return h.ending;
    const p = h.ending = this._holdJob(h, async () => {
      if (h.segs.length || h.pending > 0) return false; // rows arrived meanwhile: not over
      if (h.goneBytes || h.stale || h.goneTorn) await this._holdMark(h, { retired: h.gen });
      if (!h.stale) await this._heldUnlink(this._dropFile(h.key, h.gen));
      if (this._holds.get(h.key) === h) this._holds.delete(h.key);
      return true;
    }).finally(() => { if (h.ending === p) h.ending = null; });
    return p;
  }
  /** r8: a count said where no pause carries it (a hold drained at boot with no open notice; one read back with nothing
   *  live) — the notice files one when it holds none that says it (`dropped`) → whether it is said (on disk). */
  _sayDropped(h, dropped) {
    if (!dropped) return true;
    const base = h.base + '.ndjson';
    return this._emitShape({ kind: 'dropped', host: h.host, hostName: h.hostName || h.host, shard: base, month: base.slice(7, 14), dropped, gen: h.gen, unchecked: !!h.unchecked, holdMax: this._holdMax() }) !== false;
  }
  /** r7: ONE unlink of a hold's file → whether it is gone (an error — EBUSY on the NFS data dir — leaves it: `stale`). */
  async _heldUnlink(p) { try { await this._holdIO('unlink', p, fs.promises.unlink(p)); this._diskFiles.delete(p); return true; } catch (e) { if (e && e.code === 'ENOENT') { this._diskFiles.delete(p); return true; } return false; } }
  async _holdUnlink(h, seq) { const done = await this._heldUnlink(this._holdFile(h, seq)); if (!done) h.stale = true; return done; }
  /** r4: a month back in shape — its held rows ingested IN ORDER (the oldest segment first) through the ingest's own law (the
   *  shard's rid index: a row the ledger already holds costs zero bytes), a slice at a time. One drain per hold; a failed
   *  append leaves the rest held. r5: its end (`_drained`) is what ends the month's pause; its failure (`_drainFailed`)
   *  keeps it, `drain-failed`, tried again at the machine's every ingest and at a restart. r8: every step a job of the
   *  hold's road (r7 drained a hold ≤ 8 MiB inline) — the rows the month gets meanwhile queued in the hold behind it.
   *  r9: a hold with nothing held left and a count goes this road too (r8 ended it at once): the month's index is loaded
   *  first, so its count is judged against the ledger — never «never recorded» for rows a restart could not check.
   *  → its promise | null. */
  _drainHold(h) {
    if (!h || h.none || h.loading) return null;
    if (h.draining) return h.draining;
    h.unsaid = false;
    const shard = this._shardPath(h.base + '.ndjson'), sum = { rows: 0, appended: 0, duplicates: 0 };
    h.draining = this._track((async () => {
      for (let waits = 0; ;) {
        await new Promise((r) => setImmediate(r)); // a slice per loop turn — the first one too (`draining` is set before any work)
        if (!this._ingestIndex(shard)) { if (++waits > 3) throw new Error('the month\'s index could not be read'); const ix = this._ingestIx.get(shard); await (ix && ix.loading); continue; }
        const more = await this._holdJob(h, () => this._drainStep(h, shard, sum));
        this._stepped(h); // r10: an append waiting for room tries again (before the next step: its job is queued first)
        if (!more) break;
      }
      h.draining = null; this._stepped(h);
      this._drained(h, sum);
      return sum;
    })().catch((e) => { h.draining = null; this._stepped(h); this._drainFailed(h, e); return sum; }));
    return h.draining;
  }
  /** One slice of a drain (≤ WARM_SLICE_BYTES of the oldest segment) → true while there is more. r8 (residual 1): a segment
   *  read to its end is RECORDED done (`below`) BEFORE its unlink, in the same job — r7 left a loop turn between its last
   *  slice and its unlink and wrote `below` only when the unlink failed: a crash there read its recorded rows back as
   *  held, and a drop counted them «never recorded». */
  async _drainStep(h, shard, sum) {
    const seg = h.segs[0];
    if (!seg) return h.pending > 0;
    const rows = [];
    const r = await LD.eachLineAsync(this._holdFile(h, seg.seq), seg.at, (buf, a, b) => {
      const x = rowStart(buf, a, b); // a line torn by a crash mid-append is no row
      const rid = x < 0 ? null : LD.ridAt(buf, x, b);
      if (rid) rows.push({ rid, line: buf.toString('utf8', x, b) });
    }, { limit: WARM_SLICE_BYTES, io: this._ioOf('drain') });
    if (rows.length) {
      const a = this._appendRemote({ [shard]: rows }, [shard]); sum.rows += rows.length; sum.appended += a.appended; sum.duplicates += a.duplicates; seg.rows = Math.max(0, seg.rows - rows.length);
      for (const x of rows) seg.done.add(x.rid); // r8: the drain's own record — `rids` stays whole (the duplicate check)
    }
    if (!r.eof && r.end > seg.at) { seg.at = r.end; return true; }
    seg.at = Math.max(seg.at, r.end);
    // read to its end: every row of it is in the ledger — its end recorded, then its file unlinked
    await this._holdMark(h, { below: seg.seq + 1 });
    h.segs.splice(h.segs.indexOf(seg), 1);
    await this._holdUnlink(h, seg.seq);
    return h.segs.length > 0 || h.pending > 0;
  }
  /** A hold drained to its end — r5: and only NOW its month's pause ends (the shard judged again first: in shape ⇒ resumed,
   *  its notice closed with the count it ended with — r8: filtered against the index the drain loaded — then the hold
   *  ended; out of shape again ⇒ a shape pause, the hold (empty) going on with its count). A resume follows a drain, never
   *  precedes it. */
  _drained(h, sum) {
    if (h.segs.length || h.pending) return;
    const shard = this._shardPath(h.base + '.ndjson'), rec = this._pausedShards.get(this._pauseKey(h.host, shard));
    const dropped = this._droppedFinal(h, shard);
    if (sum.rows) console.log(`[usage] ${h.base}: the ${sum.rows} row(s) held for ${h.hostName || h.host} are in the ledger, in order — ${sum.appended} appended, ${sum.duplicates} it already held${dropped ? `; ${dropped} older held row(s) had been dropped past the hold's ${Math.round(this._holdMax() / 2 ** 20)} MiB` : ''}`);
    else if (dropped) console.log(`[usage] ${h.base}: the hold of ${h.hostName || h.host} ends with nothing left to record — ${dropped} held row(s) had been dropped past its ${Math.round(this._holdMax() / 2 ** 20)} MiB (said in its notice)`);
    if (!rec) { this._holdEnd(h, this._sayDropped(h, dropped)); return; }
    let v; try { v = this._shapeVerdict(shard); } catch { v = { ok: true }; }
    if (v.ok) this._holdEnd(h, this._resumed(h.host, shard, rec, { drained: sum.rows, dropped, gen: h.gen }));
    else this._pause(h.host, rec.hostName, shard, v);
  }
  /** r5: A DRAIN THAT FAILED (ENOSPC …) — the rest stays held and the month stays PAUSED, in state `drain-failed` (its own
   *  notice words and Usage-window row: «N held events could not be recorded: <code> — retrying»), tried again at every
   *  ingest of that machine (any month) and at a restart. Said when it starts and when its error or its counts move. */
  _drainFailed(h, e) {
    const code = String((e && e.code) || (e && e.message) || e).slice(0, 80);
    const shard = this._shardPath(h.base + '.ndjson'), key = this._pauseKey(h.host, shard), prev = this._pausedShards.get(key), now = Date.now();
    const base = path.basename(shard), ix = this._ingestIx.get(shard);
    const rec = { ...(prev || { host: h.host, shard: base, month: base.slice(7, 14), size: ix ? ix.size : 0, ratio: null, why: 'size', exact: false, since: now, remedy: { state: 'none' } }), hostName: h.hostName || (prev && prev.hostName) || h.host, lastAt: now, held: this._heldCount(h), dropped: this._droppedOf(h), unchecked: !!h.unchecked, gen: h.gen, holdMax: this._holdMax(), drain: { state: 'failed', code, tries: ((prev && prev.drain && prev.drain.tries) || 0) + 1, at: now } };
    delete rec.holdError;
    this._pausedShards.set(key, rec);
    if (prev && prev.drain && prev.drain.state === 'failed' && prev.drain.code === code && prev.held === rec.held && prev.dropped === rec.dropped) return;
    console.warn(`[usage] the ${rec.held} row(s) of ${base} held for ${rec.hostName} could not be recorded (${code}) — they stay held and ${rec.month} stays paused; tried again at the machine's next harvest and at a restart`);
    this._emitShape({ kind: 'paused', ...rec });
  }
  /** r9: a hold whose count its end could not put on disk (`unsaid`) — said again: its month in shape ⇒ its end again (the
   *  drain's road: the index, the count, the notice, the end); out of shape ⇒ it goes on (its next pause says it). */
  _sayUnsaid(h) {
    if (!h.unsaid || h.ending || h.loading || h.draining || this._holdBusy(h)) return;
    let v; try { v = this._shapeVerdict(this._shardPath(h.base + '.ndjson')); } catch { return; }
    if (!v.ok) return;
    // r10: tried again at most once a minute — through `_sayAgain`'s window (r9 re-sent the event at every ingest while the
    // store refused writes: 4 a life, a wire line each)
    if (!this._sayAgain(`unsaid\n${h.key}`, (n) => `[usage] ${h.base}: the ${this._droppedOf(h)} dropped row(s) of ${h.hostName || h.host}'s hold are not on disk in their notice yet (the store refused the write) — tried again at most once a minute${n ? ` (${n} more ingest(s) since the last try)` : ''}`)) return;
    this._drainHold(h);
  }
  /** A hold read back (a restart, an ingest's first touch): its month in shape ⇒ drained (its pause, if any, resumed); out
   *  of shape ⇒ that month paused and said with its counts (a hold with no notice gets its one). r8: a hold read back
   *  with nothing live and a count (never retired: its count may never have reached the owner) — said (`dropped`) and,
   *  its month in shape, ended. */
  _afterHoldLoad(h) {
    if (h.retired) { if (this._holds.get(h.key) === h) this._holds.delete(h.key); return; } // r7: a retired generation — nothing held, nothing said
    const shard = this._shardPath(h.base + '.ndjson'), rec = this._pausedShards.get(this._pauseKey(h.host, shard));
    let v; try { v = this._shapeVerdict(shard); } catch { return; }
    if (v.ok) { if (rec) this._resume(h.host, shard); else this._drainHold(h); }
    else if (rec || h.segs.length) this._pause(h.host, (rec && rec.hostName) || h.hostName, shard, v);
    else this._sayDropped(h, this._droppedOf(h));
  }
  /** Boot (r4): every hold on disk read back and judged (`_afterHoldLoad`, once its read-back ends — r8: on the async road)
   *  → how many; then (r5) a month the boot kept paused for its hold (restorePause) whose hold is read is resumed. r9: no
   *  sweep of set files (r6–r8 unlinked a set whose hold had no segment left — the drained generation's count, never
   *  said): a set file IS a generation (`_listOf`), read back like any — a retired or empty one unlinked by its read-back,
   *  one with a count said, then ended; an older generation's set goes with `_dropStale` (its count said before a newer
   *  generation could be minted). */
  restoreHolds() {
    let n = 0, keys;
    // r7: a listing that fails (EIO) reads nothing back now — r8: its retry reads every hold back (`_listBack`)
    try { keys = [...this._heldOnDisk().keys()]; } catch (e) { return 0; }
    const loads = [];
    for (const key of keys) {
      const x = /^(events-\d{4}-\d{2})~([A-Za-z0-9_-]+)$/.exec(key);
      if (!x) continue;
      n++;
      const shard = this._shardPath(x[1] + '.ndjson'), host = holdHostOf(x[2]);
      let h; try { h = this._holdOf(shard, host); } catch { continue; } // r9: its read-back failing — its own timer reads it
      const r = h === null ? this._holds.get(this._holdKey(shard, host)) : null;
      if (r && r.loading) loads.push(r.loading); else if (h && !h.none) this._afterHoldLoad(h);
    }
    this._track(Promise.allSettled(loads).then(() => {
      for (const rec of [...this._pausedShards.values()]) if (rec.drain && rec.drain.state === 'pending') this._resume(rec.host, this._shardPath(rec.shard));
    }));
    return n;
  }
  /** The holds now (a suite; the Usage window reads them through `ingestPaused`) → [{shard, host, held, dropped, bytes}]. */
  holdsNow() { return [...this._holds.values()].map((h) => ({ shard: h.base + '.ndjson', host: h.host, held: this._heldCount(h), dropped: this._droppedOf(h), bytes: h.segs.reduce((a, s) => a + s.bytes, 0), loading: !!h.loading, draining: !!h.draining })); }
  /** THE REMEDY of a paused shard (r2): its streaming dedup — one in flight; one that did not bring the shard back in shape
   *  (failed, not rewritten, still out of shape) runs again at a LATER pause once its backoff passed (REMEDY_RETRY_MS,
   *  doubling per try, ≤ REMEDY_RETRY_MAX_MS). r3: a dedup is a remedy for REPEATED rows only — a shard over the bound that
   *  a pass proved free of them (`proven-over`) and a month with more distinct rows than the index keeps (`ids`) get none:
   *  the remedy STOPS and says so (`_remedyStops`), never a dedup loop; a pause «judging» by the index waits for it. → true
   *  when it started a run. */
  _remedy(shard, v) {
    if (v.judging) return false;
    if (v.why === 'ids') { this._remedyStops(shard, 'ids', v); return false; }
    if (v.why === 'size' && v.proven) { this._remedyStops(shard, 'proven-over', v); return false; }
    if (this._dedupJobs.has(shard)) return false;
    const r = this._remedies.get(shard);
    if (r && !r.stopped && Date.now() < r.nextAt) return false;
    this.dedupShard(shard, { why: r ? `the growth alarm, try ${r.tries + 1}` : 'the growth alarm' }).catch(() => { });
    return true;
  }
  /** A paused shard's remedy as the notice and the Usage window say it: {state: one of REMEDY_STATES, tries, nextAt (null
   *  once it stopped), stopped?, …the last outcome (code, error, removed, after, verdict)}. */
  _remedyOf(shard) {
    shard = this._shardPath(shard);
    if (this._dedupJobs.has(shard)) return { state: 'running' };
    if (this._judging.has(shard)) return { state: 'judging' };
    const r = this._remedies.get(shard);
    return r ? { ...r.last, state: r.last.outcome, tries: r.tries, nextAt: r.stopped ? null : r.nextAt, ...(r.stopped ? { stopped: true } : {}) } : { state: 'none' };
  }
  /** Has a dedup pass proved THIS file (the inode it read) free of repeated rows? The one notion `_shapeVerdict` and
   *  `_remedy` share (r3: the inode-blind check left a file rewritten since paused with no remedy for the process's life). */
  _isProven(shard, st) {
    const p = this._proven.get(shard);
    return !!(p && st && p.ino === st.ino);
  }
  /** r3: THE REMEDY STOPS — nothing VibeSpace does brings the shard back in shape (no repeated rows to remove): the state
   *  kept (`proven-over` | `ids`), no retry, one line. → true when it is new. */
  _remedyStops(shard, outcome, v) {
    const prev = this._remedies.get(shard);
    if (prev && prev.stopped && prev.last.outcome === outcome) return false;
    this._remedies.set(shard, { tries: prev ? prev.tries : 0, nextAt: Infinity, stopped: true, last: { outcome, after: v.size == null ? null : v.size, at: Date.now() } });
    const held = [...this._pausedShards.values()].filter((x) => x.shard === path.basename(shard)).map((h) => h.hostName);
    console.warn(`[usage] ${path.basename(shard)}: ${outcome === 'ids' ? `the month holds more distinct rows than the ingest index keeps (${LD.MAX_IDS})` : `${((v.size || 0) / 2 ** 30).toFixed(2)} GiB and already free of repeated rows`} — removing rows cannot bring it back in shape, so VibeSpace stops trying; the usage of ${held.join(', ') || 'its machines'} for this month stays held (the month's file needs splitting or its bound raising, by hand)`);
    return true;
  }
  /** r3: judge a «judging» shard by its index — read once the ledger is warm (a step per turn, the ingest's own loader),
   *  then every paused host of the shard judged again (`_rejudge`). One read in flight per shard. */
  _judgeByIndex(shard) {
    if (this._judgeKick.has(shard)) return;
    const p = this.whenWarm().then(() => { if (this._ingestIndex(shard)) return null; const ix = this._ingestIx.get(shard); return ix && ix.loading; })
      .then(() => { this._judgeKick.delete(shard); this._rejudge(shard); }, (e) => { this._judgeKick.delete(shard); console.warn(`[usage] ${path.basename(shard)} could not be judged by its index: ${(e && e.message) || e} — judged again at the next ingest`); });
    this._judgeKick.set(shard, p);
  }
  /** Every paused host of a shard judged again now: in shape ⇒ resumed (its notice closes), else paused by the verdict. */
  _rejudge(shard) {
    const base = path.basename(shard);
    for (const rec of [...this._pausedShards.values()]) {
      if (rec.shard !== base) continue;
      let v; try { v = this._shapeVerdict(shard); } catch { continue; }
      if (v.ok) this._resume(rec.host, shard); else this._pause(rec.host, rec.hostName, shard, v);
    }
  }
  /** A remedy that ended without its shard back in shape: the outcome kept, the next try past the backoff, every paused host
   *  of the shard said again (its notice re-worded in place). `err` = the run threw (ENOSPC, EACCES …). */
  _remedyMissed(shard, r, err = null) {
    shard = this._shardPath(shard);
    const base = path.basename(shard), held = [...this._pausedShards.values()].filter((x) => x.shard === base && !x.drain);
    if (!held.length) { this._remedies.delete(shard); return; }
    let v; try { v = this._shapeVerdict(shard); } catch { v = { ok: false }; }
    // r3: the run proved there is nothing left to remove (over the bound with no repeats; more distinct rows than the index
    // keeps) ⇒ the remedy stops, said once — never retried
    if (!err && !(r && r.why) && !v.ok && (v.why === 'ids' || (v.why === 'size' && v.proven))) {
      this._remedyStops(shard, v.why === 'ids' ? 'ids' : 'proven-over', v);
      for (const h of held) { const was = h.remedy && h.remedy.state; h.size = v.size; h.why = v.why; h.remedy = this._remedyOf(shard); if (was !== h.remedy.state) this._emitShape({ kind: 'paused', ...h }); }
      return;
    }
    const prev = this._remedies.get(shard), tries = (prev && !prev.stopped ? prev.tries : 0) + 1, now = Date.now();
    const last = err ? { outcome: 'failed', code: (err && err.code) || null, error: String((err && err.message) || err).slice(0, 200) }
      : r && r.why ? { outcome: 'not-rewritten', code: null, error: String(r.why).slice(0, 200) }
      : { outcome: 'insufficient', removed: r ? r.removed : 0, after: v.size == null ? null : v.size, verdict: v.why || null, ratio: v.ratio == null ? null : Math.round(v.ratio * 10) / 10 };
    const base0 = this.remedyRetryMs != null ? this.remedyRetryMs : REMEDY_RETRY_MS;
    const backoff = Math.min(this.remedyRetryMaxMs || REMEDY_RETRY_MAX_MS, base0 * 2 ** (tries - 1));
    this._remedies.set(shard, { tries, nextAt: now + backoff, last: { ...last, at: now } });
    const said = last.outcome === 'failed' ? `removing its repeated rows failed (${last.code || last.error})` : last.outcome === 'not-rewritten' ? `it was not rewritten (${last.error})` : `it is still out of shape after the dedup (${((v.size || 0) / 2 ** 30).toFixed(2)} GiB${v.ratio ? `, ~${Math.round(v.ratio * 10) / 10}×` : ''})`;
    console.warn(`[usage] ${base}: ${said} — the usage of ${held.map((h) => h.hostName).join(', ')} stays paused; tried again at a pause after ${Math.round(backoff / 60e3)} min`);
    for (const h of held) { if (!v.ok && v.size != null) { h.size = v.size; h.why = v.why; h.ratio = v.ratio == null ? null : Math.round(v.ratio * 10) / 10; } h.remedy = this._remedyOf(shard); this._emitShape({ kind: 'paused', ...h }); }
  }
  /** Boot (r2): a pause said before a restart (its notice still open), judged again now → the paused record (out of shape:
   *  the host paused again, its ONE notice kept and re-worded in place) or null (in shape: the notice closes). r3: judged
   *  by THE RULE THAT OPENED IT (`why`, `exact`) — a pause the index judged (an exact ratio, the ids bound) waits for the
   *  index (`judging`, read after the ledger loads): the sample cannot see what the index counted, so it never closes it. */
  restorePause(hostId, hostName, shardName, { why = null, exact = false, ratio = null } = {}) {
    if (!hostId || !shardName || !/^events-\d{4}-\d{2}\.ndjson$/.test(path.basename(String(shardName)))) return null;
    const shard = this._shardPath(shardName);
    if (why === 'ids' || (why === 'ratio' && exact)) this._judging.set(shard, { ino: null, why, ratio: Number(ratio) || null }); // its inode: the verdict's own stat below
    let v; try { v = this._shapeVerdict(shard); } catch { v = { ok: true }; }
    if (!v.ok) return this._pause(hostId, hostName, shard, v);
    // r5: in shape again, but the month's hold is still there — the pause stays, QUIETLY (its notice as it was), until the
    // hold is drained (`restoreHolds` → `_afterHoldLoad` → `_resume`): a resume follows a drain, never precedes it
    if (!this._holdsAny(shard, hostId)) return null;
    const key = this._pauseKey(hostId, shard), base = path.basename(shard), now = Date.now();
    const rec = this._pausedShards.get(key) || { host: hostId, hostName: hostName || hostId, shard: base, month: base.slice(7, 14), size: v.size || 0, ratio: Number(ratio) || null, why: why || 'size', exact: !!exact, since: now, lastAt: now, held: null, dropped: null, holdMax: this._holdMax(), remedy: { state: 'none' }, drain: { state: 'pending' } }; // r8: counts unknown until its hold is read
    this._pausedShards.set(key, rec);
    return { ...rec };
  }
  /** One month of a host back in shape (r4: per shard). r5: THE DRAIN FIRST — a month with rows held is drained (in order),
   *  and its pause ends only when the drain has (`_drained` → `_resumed`); while it runs the month stays paused
   *  (`drain: {state: 'draining'}`, the rows it gets meanwhile queued behind), a failed one keeps it (`_drainFailed`). A
   *  big hold still being read waits for its read (`_afterHoldLoad`). */
  _resume(hostId, shard) {
    const key = this._pauseKey(hostId, shard), rec = this._pausedShards.get(key);
    if (!rec) return;
    let h; try { h = this._holdOf(this._shardPath(rec.shard), hostId); } catch { return; } // r7: its hold unknown (a listing failed) — it stays paused
    if (!h) return;
    if (this._holdBusy(h) || (!h.none && h.gone.size)) { // r9: nothing held but a count — said through the drain's road (the index first)
      this._drainHold(h);
      const now = this._pausedShards.get(key);
      if (now && h.draining && (!now.drain || now.drain.state !== 'failed')) now.drain = { ...(now.drain || {}), state: 'draining' };
      return;
    }
    // r6: nothing left to drain (a crash survivor dropped at the read-back was its last segment) — r8: its count said (the
    // notice on disk), then the hold ended
    const dropped = h.none ? rec.dropped || 0 : this._droppedFinal(h, this._shardPath(rec.shard));
    this._holdEnd(h, this._resumed(hostId, shard, rec, { drained: 0, dropped, gen: h.none ? null : h.gen }));
  }
  /** The pause of a month that is back in shape with nothing held: gone, said once, its notice closed ('resumed') → r8:
   *  whether its count is said (the notice store has it on disk — the hold's end waits for that). */
  _resumed(hostId, shard, rec, { drained = 0, dropped = 0, gen = null } = {}) {
    const key = this._pauseKey(hostId, shard);
    if (this._pausedShards.get(key) !== rec) return true;
    this._pausedShards.delete(key);
    if (![...this._pausedShards.values()].some((x) => x.shard === rec.shard)) { this._remedies.delete(this._shardPath(rec.shard)); this._judging.delete(this._shardPath(rec.shard)); }
    console.log(`[usage] ${rec.shard} is back in shape — the usage of ${rec.hostName} for ${rec.month} is recorded again${drained ? `; its ${drained} held event(s) are in the ledger, in order` : ''}${dropped ? ` (${dropped} older held event(s) had been dropped past the hold's bound)` : ''}`);
    return this._emitShape({ kind: 'resumed', ...rec, held: 0, drained, dropped, gen, at: Date.now() }) !== false;
  }
  /** One event to `onShape` → what it answered (r8: false = a count it could not put on disk). */
  _emitShape(ev) { try { return this.onShape?.(ev); } catch { return false; } }
  /** The paused months — host × shard, r4 (the Usage panel's ledger note, /api/usage-stats `ingestPaused`). */
  ingestPaused() { return [...this._pausedShards.values()].map((r) => ({ ...r })); }

  /** THE STREAMING DEDUP of one shard (src/usage-ledger-dedup.js) on the loop in slices — the one door the boot migration
   *  and the growth alarm share: one job per shard in flight (a second ask joins it). After a rewrite the ledger cache
   *  rebuilds off the loop (the new inode), the index re-reads its marks, the ingest index and the shape are read again,
   *  and every paused host of that shard is re-judged. → the job's result (LD.dedupSteps). */
  dedupShard(file, { why = 'asked', archiveDir = path.join(path.dirname(this.dir), 'archive'), sliceMs = LD.SLICE_MS } = {}) {
    file = this._shardPath(file);
    const key = file;
    if (this._dedupJobs.has(key)) return this._dedupJobs.get(key);
    const t0 = Date.now();
    const p = LD.runStepped(LD.dedupSteps(file, { archiveDir }), { sliceMs }).then((r) => {
      this._dedupJobs.delete(key);
      console.log(`[usage] ledger dedup ${r.shard} (${why}): ${r.before} → ${r.after} B, ${r.removed} repeated row(s) removed of ${r.rows}${r.archived ? `, ${r.archived} differing cop(ies) archived` : ''}${r.why ? ` — not rewritten: ${r.why}` : ''} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      this._afterDedup(file, r);
      this._emitShape({ kind: 'dedup', shard: r.shard, before: r.before, after: r.after, removed: r.removed, renamed: r.renamed, why: r.why || null });
      return r;
    }, (e) => {
      this._dedupJobs.delete(key);
      console.warn(`[usage] ledger dedup of ${path.basename(file)} failed (${why}): ${(e && e.message) || e} — the shard is left as it was`);
      this._remedyMissed(file, null, e); // r2: a paused host's notice says what happened (never only this line)
      throw e;
    }).finally(() => { this._dedupJobs.delete(key); });
    this._dedupJobs.set(key, p);
    return p;
  }
  _afterDedup(file, r) {
    const shard = this._shardPath(file);
    if (r.renamed) { this._ingestIx.delete(shard); this._shapes.delete(shard); this.reloadEvents(); }
    // the file the pass leaves holds no repeated row (nothing to remove, or a rewrite that kept no differing copy) — proven,
    // for THIS inode (r3: a rewrite proves the new file; a later rewrite by anyone else is unproven again)
    if (!r.why && (r.removed === 0 || (r.renamed && !r.keptDiffering))) { try { this._proven.set(shard, { ino: fs.statSync(shard).ino }); } catch { } }
    for (const rec of [...this._pausedShards.values()]) {
      if (rec.shard !== path.basename(shard)) continue;
      if (this._shapeVerdict(shard).ok) this._resume(rec.host, shard);
    }
    // r2: still paused after the run ⇒ the notice says what happened (not rewritten / still out of shape), retried later
    if ([...this._pausedShards.values()].some((x) => x.shard === path.basename(shard) && !x.drain)) this._remedyMissed(shard, r); else this._remedies.delete(shard);
  }
  /** A shard's path as the ingest keys it (`_shardFor`'s spelling: this.dir + the name). */
  _shardPath(file) { return path.join(this.dir, path.basename(file)); }

  // ── F2 THE HUB-KEPT DEVICE CURSOR (lane ledger-dedup-law) ──────────────────────────────────────────────────────────────
  // The usage harvest read a machine's events since its cursor, then wrote the cursor back ON THE DEVICE — a `files` act the
  // hub-act gate held for the owner on a cluster instance; nobody answered, so every harvest re-sent the whole window. The
  // hub keeps the cursor now: `_host-cursors/<host>.json` beside the ledger = the device walker's own cursor map (per-file
  // byte offsets) as of the last batch the hub made durable + the newest ts / rid it held. Written by ingestRemoteEvents
  // after the appends; read by src/hosts.js harvestUsage, which hands it to the device's usage scan.
  _hostCursorFile(hostId) { return path.join(this.hostCursorsDir, String(hostId).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) + '.json'); }
  /** The hub's copy of a machine's usage cursor → {v, host, cursors, since, lastTs, lastRid, events, at} | null. */
  hostCursorOf(hostId) {
    if (this._hostCursors.has(hostId)) return this._hostCursors.get(hostId);
    let rec = null;
    try { const j = JSON.parse(fs.readFileSync(this._hostCursorFile(hostId), 'utf-8')); if (j && j.v === 1 && j.cursors && typeof j.cursors === 'object') rec = j; } catch { }
    this._hostCursors.set(hostId, rec);
    return rec;
  }
  _writeHostCursor(hostId, { cursors, since, lastTs, lastRid, events }) {
    const prev = this.hostCursorOf(hostId);
    const rec = { v: 1, host: String(hostId), cursors, since, lastTs: lastTs || (prev && prev.lastTs) || null, lastRid: lastRid || (prev && prev.lastRid) || null, events, at: Date.now() };
    timedSync('usage-host-cursors.write', () => { fs.mkdirSync(this.hostCursorsDir, { recursive: true }); this._writeAtomic(this._hostCursorFile(hostId), JSON.stringify(rec)); });
    this._hostCursors.set(hostId, rec);
    return rec;
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
  _writeCursors(deadFacts) {   // deadFacts: the walk's sliced prune pass (undefined = not run ⇒ the hourly sync prune when due)
    const now = Date.now();
    if (deadFacts !== undefined) { this._cursorsPrunedAt = now; this._dropDeadCursors(deadFacts); }
    else if (now - (this._cursorsPrunedAt || 0) >= CURSOR_PRUNE_MS) { this._cursorsPrunedAt = now; this._pruneDeadCursors(); }
    const json = JSON.stringify(this._cursors);
    if (json === this._cursorsJson) return false;
    timedSync('usage-cursors.write', () => this._writeAtomic(this.cursorsFile, json));   // store-timing's row; its site = this function since usage-index-shadow L0
    this._cursorsJson = json;
    return true;
  }
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
  /** THE LOAD PASS (one implementation, two drivers): `_loadEvents` runs it to the end in one call; `warmStepped` hands
   *  the loop back at every `yield` — after each `chunkBytes` slice of a shard (each slice lands whole: its lines taken,
   *  the shard's place + append-proof moved past them) and between the heavy settle / sort steps. */
  *_loadSteps(chunkBytes = Infinity, trimBatch = TRIM_BATCH_ROWS) {
    const stepped = chunkBytes !== Infinity;
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
  /** The warm still loading past the takeover bound → {bytesLeft, at}, else null. A sync reader meanwhile answers from the
   *  rows loaded so far — so (lane ledger-dedup-law r2, NO MONEY DECISION FROM A PARTIAL LEDGER) costBetweenMulti says
   *  `partial` and memoizes nothing, the estimator learns and writes no rate and answers no estimate, and the pool engine's
   *  anchor sweep waits for the warm while its automatic decision is skipped (usage-estimator `wholeLedgerGate`). */
  ledgerLoading() { const left = this._pendingLeft(); return left > this._takeoverMax() ? { ...this._evCache.loading } : null; }
  _takeoverMax() { return this.takeoverMaxBytes || TAKEOVER_MAX_BYTES; }
  /** The bytes a pending warm has left (re-read at most once a second — the estimator calls a sync reader per anchor pair). */
  _pendingLeft() {
    const c = this._evCache;
    if (!c || !c.pending) return 0;
    if (!c.loading || Date.now() - c.loading.at >= 1000) c.loading = { bytesLeft: this._unreadBytes(), at: Date.now() };
    return c.loading.bytesLeft;
  }
  /** Resolves when the stepped boot warm (if any) has ended. Never rejects. */
  warmSettled() { return this._warmP ? this._warmP.then(() => { }, () => { }) : Promise.resolve(); }
  /** THE WHOLE LEDGER (lane ledger-dedup-law r2): resolves at once when a reader may load what is left in its own tick, else
   *  when the stepped warm ends — a warm that a reload restarted is the same warm. Never rejects. */
  whenWarm() { return this._waitBigWarm() || Promise.resolve(); }
  /** An async reader's wait: the warm has more left than a takeover may parse ⇒ wait for it, else nothing. */
  _waitBigWarm() { return this._pendingLeft() > this._takeoverMax() ? this.warmSettled() : null; }
  /** The hot rows' ts order (stable on equal ts) — `_sortedEvents` and the load pass's eager sort. */
  _sortHot(c) { c.sorted = c.events.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)); c.sortedLen = c.events.length; }
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
      const next = await this._stageBuilt(res.built);
      this._swapCache(next);
      this._rbFail = null;
      console.log(`[usage] the ledger cache was rebuilt in the fold worker (${job.why}${job.asks > 1 ? `; ${job.asks - 1} more ask(s) joined it` : ''}): ${next.events.length + next.cold.n} rows in ${((Date.now() - t0) / 1000).toFixed(1)} s — the previous cache served meanwhile`);
    } catch (e) {
      const n = (this._rbFail ? this._rbFail.n : 0) + 1, wait = Math.min(REBUILD_RETRY_MAX_MS, REBUILD_RETRY_MS * 2 ** (n - 1)), why = (e && e.message) || String(e);
      this._rbFail = { n, retryAt: Date.now() + wait, err: Object.assign(new Error(`the usage ledger could not be rebuilt after ${job.why} (${why}) — the previous figures keep serving; it tries again in ${Math.round(wait / 1000)} s`), { code: 'REBUILD' }) };
      console.warn(`[usage] the ledger cache rebuild failed (${job.why}): ${why} — the previous cache keeps serving; next try in ${Math.round(wait / 1000)} s`);
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
      built: { buf, chunks, sizes, locs, hrh, perm, hotBytes: c.hotBytes, cold: cold.parts, consumed: [...c.consumed], marks, srcWm: [...c.srcWm], cutoff: c.cutoff, shards: c.shards, overWarned: !!c.overWarned },
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
    return { consumed: new Map(b.consumed), marks, events, sizes, locs, hrh, hotBytes: b.hotBytes, rids, mids, srcWm: new Map(b.srcWm), checkedAt: 0, cold: CB.ColdSlab.fromParts(b.cold), cutoff: b.cutoff, walking: 0, shards: b.shards, shardIx: new Map(b.shards.map((f, i) => [f, i])), sorted, sortedLen: events.length, overWarned: b.overWarned, whole: true };
  }
  /** THE SWAP: ONE assignment — a reader sees the previous cache or the rebuilt one, each whole — and a new generation for
   *  the cost memos (usage-anchors keys on ledgerGen). The appends since the worker read come in the next pass (checkedAt 0). */
  _swapCache(next) { next.checkedAt = 0; this._evCache = next; this.ledgerGen = (this.ledgerGen || 0) + 1; }

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

module.exports = { UsageHistory, DEFAULT_PRICING, PRICE_ROW_FIELDS, SUPERSEDED_DEFAULTS, priceAt, REMEDY_STATES, ackOf };
