// THE LEDGER READERS' CENSUS (lane usage-walk-one-folder, 2.369.399 — the page page-ledger-readers.md, 主开发's GO 03:50Z).
// The usage ledger (<data>/usage-history/events-YYYY-MM.ndjson) can hold a request TWICE: the local commit refuses an id
// the ledger already holds (src/usage-history.js `knows`) but has no set for its own batch, so a transcript folder with
// two names (claude-home.js relinkLegacy's link, a move's alias) doubles the requests both names deliver in one walk.
// No number a person sees is wrong because every figure reads the in-memory cache, which keeps the FIRST row of each
// request id (`_take`). THIS CENSUS keeps that true: every reader of the rows is a row here with the door it reads
// through and its rule about a repeated id; a new reader is red until it says which.
//   READERS — the 21 readers of the page: { n, file, fn, door, rule, sees }.
//   SITES   — every scope (file «function») that NAMES the ledger's shards (the shard-name pattern /^events-…\.ndjson$/,
//             SHARD_RE, an `events-${…}.ndjson` path, `_shardFor`) → the reader it is, or why it is no reader; with its
//             site count (a moved count: classify the new site, then move the count).
//   CACHE   — every file that reaches into the cache's internals (`._evCache` / `._allRows`) → the reader it is (they
//             inherit the cache's first-wins rule).
// NOT FOLLOWED (said): a reader that reaches the shards through a name built from variables only (no pattern, no
// SHARD_RE, no _shardFor) — the fixtures of test-ledger-readers-census then show its number against the clean ledger only
// if it is one of the readers it drives.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { walk, scopeOf } from './sync-fs-census.mjs';
import { filesOf } from './loop-child-census.mjs';

export const DOORS = new Set(['cache', 'cache+ring', 'client', 'shards', 'shards-sampled', 'hold-files', 'ingest-index']);
export const RULES = {
  'inherits': 'reads the cache, which keeps the FIRST row of each request id (src/usage-history.js _take)',
  'first-wins': 'keeps the first row of each request id itself',
  'larger-wins': 'keeps the larger of two rows of one request id (and skips an id the ledger already holds)',
  'yes-no': 'answers whether the ledger holds an id — copies cannot change it',
  'alike': 'a one-shot migration that treats every copy of a row the same — only its own report counters count copies',
  'counts-copies': 'COUNTS copies ON PURPOSE — the growth alarm (rows / distinct ids over 2 from 64 MiB, a shard over 2 GiB)',
};
export const READERS = [
  { n: 1, file: 'src/usage-history.js', fn: 'aggregateAsync', door: 'cache', rule: 'inherits', sees: 'GET /api/usage-stats → the Usage window: totals, charts, sessions, splits' },
  { n: 2, file: 'src/lib/usage-window.js', fn: 'exportCsv', door: 'client', rule: 'inherits', sees: 'the Usage window\'s CSV export (built from #1\'s answer)' },
  { n: 3, file: 'src/usage-history.js', fn: 'eventForRid', door: 'cache', rule: 'inherits', sees: 'GET /api/usage-stats/rid-info → the message popup' },
  { n: 4, file: 'src/usage-anchors.js', fn: '_addRow', door: 'cache', rule: 'inherits', sees: 'the ledger cost between two times (costBetweenMulti)' },
  { n: 5, file: 'src/usage-estimator.js', fn: '_costFn', door: 'cache+ring', rule: 'larger-wins', sees: 'the estimate and burn → «est now», the burn-aware probe, the pool' },
  { n: 6, file: 'src/usage-anchors.js', fn: 'costBetweenMulti', door: 'cache', rule: 'inherits', sees: 'the pool engine\'s anchor costSince (src/server/usage-pool-engine.js) → the learned rates' },
  { n: 7, file: 'src/server/usage-pool-engine.js', fn: 'darkSources', door: 'cache', rule: 'inherits', sees: 'the dark-machine taint in the pool\'s pick (newest times, accounts)' },
  { n: 8, file: 'src/usage-history.js', fn: 'ledgerKnowsId', door: 'cache', rule: 'yes-no', sees: 'the live ring\'s exclusion; the local commit\'s filter' },
  { n: 9, file: 'src/usage-history.js', fn: 'cacheCensus', door: 'cache', rule: 'inherits', sees: 'the memory / Diagnostics census' },
  { n: 10, file: 'src/usage-index-worker.js', fn: 'recoverAll', door: 'shards', rule: 'first-wins', sees: 'the SQLite shadow index (rid PRIMARY KEY + INSERT OR IGNORE) → telemetry only' },
  { n: 11, file: 'src/usage-origin-backfill.js', fn: 'backfillUsageOrigin', door: 'shards', rule: 'alike', sees: 'stamps origin on every row (a migration)' },
  { n: 12, file: 'src/ledger-slot-backfill.js', fn: 'backfillLedgerBySlot', door: 'shards', rule: 'alike', sees: 're-keys or archives pooled rows (a migration)' },
  { n: 13, file: 'src/usage-history.js', fn: '_maybeRebakeAttribution', door: 'shards', rule: 'alike', sees: 're-attributes rows (once)' },
  { n: 14, file: 'src/fixture-ledger-purge.js', fn: 'purgeFixtureLedger', door: 'shards', rule: 'alike', sees: 'drops every test-fixture row (its notice counts copies of fixture rows)' },
  { n: 15, file: 'src/codex-fork-ledger-purge.js', fn: 'purgeCodexForkReplays', door: 'shards', rule: 'first-wins', sees: 'removes codex fork-replay rows' },
  { n: 16, file: 'src/usage-ledger-dedup.js', fn: 'dedupSteps', door: 'shards', rule: 'first-wins', sees: 'the dedup job / migration — its notice «N repeated rows removed» (true)' },
  { n: 17, file: 'src/usage-ledger-dedup.js', fn: 'shapeOf', door: 'shards-sampled', rule: 'counts-copies', sees: 'the growth alarm → the pause, its For-you notice, the Usage window\'s ledger note' },
  { n: 18, file: 'src/usage-hold-road.js', fn: '_readRids', door: 'shards', rule: 'first-wins', sees: 'the remote ingest\'s id index (a set of h: ids)' },
  { n: 19, file: 'src/usage-hold-road.js', fn: '_holdAppend', door: 'hold-files', rule: 'first-wins', sees: 'rows held for a paused month; the drain goes through #20' },
  { n: 20, file: 'src/usage-history.js', fn: '_appendRemote', door: 'ingest-index', rule: 'first-wins', sees: 'a remote machine\'s events (the ledger\'s ids AND the batch\'s own set)' },
  { n: 21, file: 'src/usage-history.js', fn: '_take', door: 'cache', rule: 'first-wins', sees: 'THE RULE every cache reader inherits: a row whose id the cache holds is dropped' },
];
// every scope that names the shards → the reader it is (n) or why it is no reader (a string); its site count
export const SITES = [
  ['src/codex-fork-ledger-purge.js «purgeCodexForkReplays»', 1, 15],
  ['src/fixture-ledger-purge.js «purgeFixtureLedger»', 1, 14],
  ['src/ledger-slot-backfill.js «backfillLedgerBySlot»', 1, 12],
  ['src/server/migrations.js «create > run»', 1, 16],
  ['src/telemetry.js «Telemetry._shard»', 1, 'not the ledger: telemetry\'s own events-YYYY-MM files in data/telemetry'],
  ['src/telemetry.js «Telemetry.summary»', 1, 'not the ledger: telemetry\'s own events-YYYY-MM files in data/telemetry'],
  ['src/usage-history.js «UsageHistory._loadSteps»', 1, 21],
  ['src/usage-history.js «UsageHistory._maybeRebakeAttribution»', 1, 13],
  ['src/usage-history.js «UsageHistory._unreadBytes»', 1, 'a bytes gauge (the warm\'s unread bytes): no row is read'],
  ['src/usage-history.js «UsageHistory._shardFor»', 1, 'the append path\'s file name: a writer, no reader'],
  ['src/usage-history.js «UsageHistory._walkAndAppend > push»', 1, 'the local commit (a writer): refuses an id the ledger holds (knows) — the same-batch copy is its gap, read-time dedup absorbs it'],
  ['src/usage-history.js «UsageHistory.ingestRemoteEvents»', 1, 20],
  ['src/usage-hold-road.js «UsageHoldRoad.restorePause»', 1, 'a paused shard\'s name checked: no row is read'],
  ['src/usage-index-model.js «<module>»', 4, 10],
  ['src/usage-index-worker.js «ingest»', 1, 10],
  ['src/usage-index-worker.js «recoverAll»', 1, 10],
  ['src/usage-ledger-dedup.js «<module>»', 4, 16],
  ['src/usage-origin-backfill.js «backfillUsageOrigin»', 1, 11],
];
// every file that reaches into the cache's internals → the reader it is (they inherit its first-wins rule)
export const CACHE = [['src/usage-history.js', 21], ['src/usage-anchors.js', 4], ['src/usage-estimator.js', 5], ['src/usage-hold-road.js', 19]];

const PRE = /events-|SHARD_RE|_shardFor|_evCache|_allRows/;
const SHARD_PAT = /events-\\d\{4\}-\\d\{2\}\\\.ndjson/;
/** the census of a tree → { sites: Map('file «scope»' → count), cache: Set(file) } (patch: {rel: src} plants a control) */
export function scan(repo, { acorn = null, patch = {} } = {}) {
  const A = acorn || createRequire(path.join(repo, 'package.json'))('acorn');
  const files = [...new Set([...filesOf(repo).filter((f) => f.endsWith('.js')), ...Object.keys(patch)])].sort();
  const sites = new Map(), cache = new Set();
  for (const rel of files) {
    const src = Object.prototype.hasOwnProperty.call(patch, rel) ? patch[rel] : fs.readFileSync(path.join(repo, rel), 'utf8');
    if (!PRE.test(src)) continue;
    const code = src.replace(/^#!.*/, '');
    const o = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true };
    let ast; try { ast = A.parse(code, { ...o, sourceType: 'script' }); } catch { ast = A.parse(code, { ...o, sourceType: 'module', allowReturnOutsideFunction: false }); }
    walk(ast, (n, anc) => {
      let shard = false;
      if (n.type === 'Literal' && n.regex && SHARD_PAT.test(n.regex.pattern)) shard = true;
      else if (n.type === 'Identifier' && n.name === 'SHARD_RE') shard = true;
      else if (n.type === 'TemplateLiteral' && n.quasis.some((q) => /events-/.test(q.value.cooked || '')) && n.quasis.some((q) => /\.ndjson/.test(q.value.cooked || ''))) shard = true;
      else if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier' && n.property.name === '_shardFor') shard = true;
      if (shard) { const k = `${rel} «${scopeOf(anc, n)}»`; sites.set(k, (sites.get(k) || 0) + 1); }
      if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier' && (n.property.name === '_evCache' || n.property.name === '_allRows')) cache.add(rel);
    });
  }
  return { sites, cache, files: files.length };
}
