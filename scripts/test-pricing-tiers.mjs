#!/usr/bin/env node
// test-pricing-tiers — the ledger's reference prices match the official table
// per MODEL VERSION, not per family: Fable 5.1 cache hits are 0.025× base
// ($0.25/MTok) while Fable 5 stays 0.1× ($1), Sonnet 5 is $2/$10. The matcher
// prefers the longest tier key, and an OLD on-disk pricing.json gains the new
// keys on load without clobbering edited rates.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { UsageHistory } = require(path.join(ROOT, 'src/usage-history.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const dir = scratch('pricing'); fs.mkdirSync(path.join(dir, 'usage-history'), { recursive: true });
const mk = () => new UsageHistory({ dataDir: dir, homeDir: dir });
try {
  const uh = mk();
  const tier = (m) => uh._tier(m);
  ok(tier('claude-fable-5-1') === 'fable-5-1', 'claude-fable-5-1 → the fable-5-1 tier (longest key wins)');
  ok(tier('claude-fable-5') === 'fable', 'claude-fable-5 → the fable tier (cache hits still $1)');
  ok(tier('claude-sonnet-5') === 'sonnet-5' && tier('claude-sonnet-4-6') === 'sonnet', 'sonnet-5 vs sonnet-4.x split');
  ok(tier('claude-opus-5') === 'opus' && tier('claude-haiku-4-5') === 'haiku', 'opus / haiku unchanged');
  const t = uh._pricing.tiers;
  ok(t['fable-5-1'].cacheRead === 0.25 && t.fable.cacheRead === 1.0 && t.opus.cacheRead === 0.5, 'official cache-hit rates: Fable 5.1 $0.25, Fable 5 $1, Opus 5 $0.50');
  ok(t['sonnet-5'].input === 2 && t['sonnet-5'].output === 10 && t['sonnet-5'].cacheRead === 0.2, 'Sonnet 5 $2/$10, cache hit $0.20');
  // an OLD v2 pricing.json without the new keys (what every instance has on disk today)
  const f = path.join(dir, 'usage-history', 'pricing.json');
  const old = JSON.parse(fs.readFileSync(f, 'utf8'));
  delete old.tiers['fable-5-1']; delete old.tiers['sonnet-5']; old.tiers.fable.cacheRead = 1.0; old.tiers.opus.output = 26; // an edited rate must survive
  fs.writeFileSync(f, JSON.stringify(old));
  const uh2 = mk();
  ok(uh2._pricing.tiers['fable-5-1']?.cacheRead === 0.25 && uh2._pricing.tiers['sonnet-5']?.input === 2, 'an old on-disk pricing.json gains the new keys on load');
  ok(uh2._pricing.tiers.opus.output === 26, '…without clobbering a user-edited rate');
  ok(uh2._tier('claude-fable-5-1') === 'fable-5-1', '…and Fable 5.1 requests price at the new tier from then on');
  ok(uh.pricingToken() !== (() => { const o = JSON.parse(fs.readFileSync(f, 'utf8')); delete o.tiers['fable-5-1']; fs.writeFileSync(f, JSON.stringify(o)); return mk().pricingToken(); })(), 'the pricing token changes with the table, so memoised costs recompute');
} finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
