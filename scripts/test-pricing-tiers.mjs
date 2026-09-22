#!/usr/bin/env node
// test-pricing-tiers — the ledger's reference prices match the official table
// per MODEL VERSION, not per family: Fable 5.1 cache hits are 0.025× base
// ($0.25/MTok) while Fable 5 stays 0.1× ($1), Sonnet 5 is $2/$10. The matcher
// prefers the longest tier key, and an OLD on-disk pricing.json gains the new
// keys on load without clobbering edited rates.
//
// Opus 5.5 (2026-09-22, CLI 2.1.280 — `opus` / `opus[1m]` now resolve to
// `claude-opus-5-5`): its own tier `opus-5-5` = the binary catalog's
// `tier_4_20_cache_read_0_20` ($4/$20, cw 5m $5 / 1h $8, hit $0.20). §2 routes the
// four ids, prices a MEASURED result's modelUsage row (numbers only) against the
// CLI's own list cost, and a CONTROL prices the same row under the old `opus`
// tier (the overbilling the row ends). §3 is the BINARY ORACLE: the installed
// claude's catalog tier for each version the table names — STRICT locally,
// informational on the Actions mirror, SKIP with reason when no binary exists.
//
// Mythos 5 / 5.1 (2026-09-22): the catalog prices `claude-mythos-5` at `tier_10_50`
// and `claude-mythos-5-1` at `tier_10_50_cache_read_0_25` (Fable 5 / Fable 5.1's
// tiers); no key matched either id, so both fell to `_default` ($3/$15). §2b routes
// them to `mythos` / `mythos-5-1`, pins that the fable ids are undisturbed, and a
// NEGATIVE CONTROL removes the two rows from a copy of the table — the ids fall back
// to `_default`, so the rows are what routes them. §3's oracle names both ids.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { UsageHistory } = require(path.join(ROOT, 'src/usage-history.js'));
let pass = 0, fail = 0, skip = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + e : '')); } };
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
  delete old.tiers['fable-5-1']; delete old.tiers['sonnet-5']; delete old.tiers['opus-5-5']; delete old.tiers.mythos; delete old.tiers['mythos-5-1']; old.tiers.fable.cacheRead = 1.0; old.tiers.opus.output = 26; // an edited rate must survive
  fs.writeFileSync(f, JSON.stringify(old));
  const uh2 = mk();
  ok(uh2._pricing.tiers['fable-5-1']?.cacheRead === 0.25 && uh2._pricing.tiers['sonnet-5']?.input === 2, 'an old on-disk pricing.json gains the new keys on load');
  ok(uh2._pricing.tiers.opus.output === 26, '…without clobbering a user-edited rate');
  ok(uh2._tier('claude-fable-5-1') === 'fable-5-1', '…and Fable 5.1 requests price at the new tier from then on');
  // ── §2 Opus 5.5 ──────────────────────────────────────────────────────────
  console.log('§2 Opus 5.5 — its own tier, priced against the CLI\'s own cost');
  ok(tier('claude-opus-5-5') === 'opus-5-5' && tier('claude-opus-5-5[1m]') === 'opus-5-5', 'claude-opus-5-5 and claude-opus-5-5[1m] → the opus-5-5 tier');
  ok(tier('claude-opus-4-8') === 'opus' && tier('claude-opus-4-5') === 'opus' && tier('claude-opus-5') === 'opus', 'claude-opus-4-8 / -4-5 / claude-opus-5 stay on `opus`');
  const o55 = t['opus-5-5'];
  ok(o55 && o55.input === 4 && o55.output === 20 && o55.cacheWrite5m === 5 && o55.cacheWrite1h === 8 && o55.cacheRead === 0.2, 'opus-5-5 = tier_4_20_cache_read_0_20: $4/$20, cw 5m $5 / 1h $8, hit $0.20', JSON.stringify(o55));
  // ONE measured `result` record's modelUsage row for claude-opus-5-5[1m] (CLI 2.1.280,
  // costBasis "list"; this conversation's cache writes are all 1h — its usage block's
  // cache_creation carries ephemeral_1h only). Numbers only.
  const ROW = { inputTokens: 100, outputTokens: 41128, cacheReadInputTokens: 41282317, cacheCreationInputTokens: 1720042, costUSD: 22.83975939999999 };
  const ev = { model: 'claude-opus-5-5[1m]', acct: null, i: ROW.inputTokens, o: ROW.outputTokens, cw5: 0, cw1: ROW.cacheCreationInputTokens, cr: ROW.cacheReadInputTokens };
  const hand = (100 * 4 + 41128 * 20 + 1720042 * 8 + 41282317 * 0.2) / 1e6; // = 22.8397594
  const ours = uh._cost(ev);
  ok(Math.abs(ours - hand) < 1e-9, `the ledger cost equals the hand arithmetic ($${ours.toFixed(6)} = $${hand.toFixed(6)})`);
  const delta = (ours - ROW.costUSD) / ROW.costUSD;
  console.log(`    ledger $${ours.toFixed(6)} vs the CLI's own costUSD $${ROW.costUSD.toFixed(6)} — delta ${(delta * 100).toFixed(4)} %`);
  ok(Math.abs(delta) <= 0.01, 'within 1 % of the CLI\'s own list cost for the same row (no 1M-context surcharge on this model)', (delta * 100).toFixed(4) + ' %');
  // CONTROL — the same row under the old `opus` tier (what every Opus 5.5 turn cost before this row)
  const op = t.opus;
  const oldCost = (ev.i * op.input + ev.o * op.output + ev.cw1 * op.cacheWrite1h + ev.cr * op.cacheRead) / 1e6;
  ok(op.input / o55.input === 1.25 && op.output / o55.output === 1.25, 'control: the old `opus` tier is 25 % higher on input and output');
  ok(op.cacheRead / o55.cacheRead === 2.5, 'control: …and 2.5× on cache reads');
  ok(oldCost > ours * 1.5, `control: the old tier priced this row at $${oldCost.toFixed(4)} (+${(((oldCost / ours) - 1) * 100).toFixed(1)} % over the new tier) — the overbilling the row ends`);
  ok(uh2._pricing.tiers['opus-5-5']?.cacheRead === 0.2 && uh2._tier('claude-opus-5-5[1m]') === 'opus-5-5', 'an old on-disk pricing.json gains opus-5-5 on load, and Opus 5.5 routes to it');
  ok(uh.pricingToken() !== (() => { const o = JSON.parse(fs.readFileSync(f, 'utf8')); delete o.tiers['fable-5-1']; fs.writeFileSync(f, JSON.stringify(o)); return mk().pricingToken(); })(), 'the pricing token changes with the table, so memoised costs recompute');
  // ── §2b Mythos 5 / 5.1 ─────────────────────────────────────────────────────
  console.log('§2b Mythos 5 / 5.1 — the catalog\'s two Fable tiers, never `_default`');
  ok(tier('claude-mythos-5-1') === 'mythos-5-1' && tier('claude-mythos-5-1[1m]') === 'mythos-5-1', 'claude-mythos-5-1 (and [1m]) → the mythos-5-1 tier (longest key wins over `mythos`)');
  ok(tier('claude-mythos-5') === 'mythos' && tier('claude-mythos-5[1m]') === 'mythos', 'claude-mythos-5 (and [1m]) → the mythos tier');
  ok(tier('claude-fable-5-1') === 'fable-5-1' && tier('claude-fable-5') === 'fable' && tier('claude-fable-5-1[1m]') === 'fable-5-1', 'fable / fable-5-1 routing undisturbed by the new keys');
  const my = t.mythos, my51 = t['mythos-5-1'];
  ok(my && my.input === 10 && my.output === 50 && my.cacheWrite5m === 12.5 && my.cacheWrite1h === 20 && my.cacheRead === 1, 'mythos = tier_10_50: $10/$50, cw 5m $12.5 / 1h $20, hit $1', JSON.stringify(my));
  ok(my51 && my51.input === 10 && my51.output === 50 && my51.cacheWrite5m === 12.5 && my51.cacheWrite1h === 20 && my51.cacheRead === 0.25, 'mythos-5-1 = tier_10_50_cache_read_0_25: $10/$50, cw 5m $12.5 / 1h $20, hit $0.25', JSON.stringify(my51));
  ok(['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'].every((k) => my[k] === t.fable[k] && my51[k] === t['fable-5-1'][k]), 'the two mythos rows price exactly as fable / fable-5-1 (same catalog tiers)');
  // NEGATIVE CONTROL — the same matcher over a copy of the table WITHOUT the two rows
  const neg = mk();
  const noMythos = { ...neg._pricing.tiers }; delete noMythos.mythos; delete noMythos['mythos-5-1'];
  neg._pricing = { ...neg._pricing, tiers: noMythos };
  ok(neg._tier('claude-mythos-5-1') === '_default' && neg._tier('claude-mythos-5') === '_default', 'control: without the rows both mythos ids fall to `_default` ($3/$15) — the rows are what routes them', neg._tier('claude-mythos-5-1'));
  // (`_default`'s $0.30 cache hit is ABOVE Mythos 5.1's $0.25, so the underbilling is
  // input/output/cache-write: the event below is not cache-dominated on purpose)
  const mev = { model: 'claude-mythos-5-1', acct: null, i: 1000, o: 2000, cw5: 0, cw1: 3000, cr: 40000 };
  const myCost = uh._cost(mev), negCost = neg._cost(mev);
  ok(Math.abs(myCost - (1000 * 10 + 2000 * 50 + 3000 * 20 + 40000 * 0.25) / 1e6) < 1e-12, `a mythos-5-1 event costs the hand arithmetic ($${myCost.toFixed(6)})`);
  ok(negCost < myCost / 2, `control: \`_default\` priced the same event at $${negCost.toFixed(6)} (${((negCost / myCost) * 100).toFixed(1)} % of list) — the underbilling the rows end`);
  ok(uh2._pricing.tiers.mythos?.cacheRead === 1 && uh2._pricing.tiers['mythos-5-1']?.cacheRead === 0.25 && uh2._tier('claude-mythos-5-1') === 'mythos-5-1', 'an old on-disk pricing.json gains both mythos rows on load, and Mythos 5.1 routes to its row');
  // ── §3 the BINARY ORACLE ───────────────────────────────────────────────────
  console.log('§3 the binary oracle — the installed claude\'s catalog tier per version the table names');
  const findBinary = () => {
    const cands = [];
    for (const d of String(process.env.PATH || '').split(':')) if (d) cands.push(path.join(d, 'claude'));
    cands.push(path.join(os.homedir(), '.local/bin/claude'), path.join(os.homedir(), '.claude/local/claude'));
    for (const c of cands) { try { const real = fs.realpathSync(c); if (fs.statSync(real).isFile()) return real; } catch { } }
    return null;
  };
  const bin = findBinary();
  if (!bin) { skip++; console.log('  - SKIP binary oracle: no claude binary on PATH / ~/.local/bin (nothing installed to compare against)'); }
  else {
    const buf = fs.readFileSync(bin);
    const lenient = !!process.env.GITHUB_ACTIONS;
    const check = (c, m, e) => { if (c || !lenient) ok(c, m, e); else { skip++; console.log('  - SKIP (informational on the mirror) ' + m + ': ' + e); } };
    const tierOf = (id) => {
      const at = buf.indexOf(Buffer.from(`id:"${id}",family:`));
      if (at < 0) return null;
      const seg = buf.subarray(at, at + 2000).toString('latin1');
      const next = seg.indexOf('id:"claude-', 5);
      const m = seg.match(/pricing:"([a-z0-9_]+)"/);
      if (!m || (next > 0 && m.index > next)) return null;
      const d = buf.indexOf(Buffer.from(m[1] + ':{'));
      if (d < 0) return null;
      const body = buf.subarray(d, d + 400).toString('latin1').match(/:\{([^}]*)\}/);
      if (!body) return null;
      const r = {}; for (const kv of body[1].split(',')) { const [k, v] = kv.split(':'); r[k] = Number(v); }
      return { name: m[1], input: r.input, output: r.output, cacheWrite5m: r.cache_write_5m, cacheWrite1h: r.cache_write_1h, cacheRead: r.cache_read };
    };
    console.log(`  installed binary ${path.basename(bin)} (${lenient ? 'mirror: informational' : 'STRICT'})`);
    let seen = 0;
    for (const id of ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-5', 'claude-fable-5-1', 'claude-fable-5', 'claude-mythos-5-1', 'claude-mythos-5', 'claude-sonnet-5']) {
      const cat = tierOf(id);
      if (!cat) { console.log(`  - ${id}: not in this build's catalog (skipped)`); continue; }
      seen++;
      const ours = t[uh._tier(id)];
      const same = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'].every((k) => ours[k] === cat[k]);
      check(same, `${id} → our \`${uh._tier(id)}\` row = the catalog's ${cat.name}`, JSON.stringify({ ours, catalog: cat }));
    }
    check(seen >= 5, 'the oracle read the catalog (non-vacuous: ≥ 5 of the named ids found)', String(seen));
  }
} finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skip} skipped)` : `\nALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0);
