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
//
// Retired generations (2.369.203, price check wf_d2b3907b-2c5): an id that only an
// OLD model carries must never borrow a newer generation's price through the
// longest-key rule — Opus 4 / 4.1 / 3 landed on `opus` ($5/$25, a third of their
// $15/$75), Haiku 3.5 / 3 on `haiku` (Haiku 4.5's $1/$5), Mythos Preview on
// `mythos` ($10/$50 vs $25/$125). §2c routes every spelling to its exact key, pins
// that the current ids did not move, and a CONTROL drops the rows from a copy of
// the table (they fall back to the newer key). §3's oracle names
// claude-opus-4-0 / -4-1 and claude-3-5-haiku (the catalog's tier_15_75 / haiku_35).
//
// Fable 5.2 / Mythos 5.2 (2026-11-09, lane fable-52-cli-321): $8/$40, cw 5m $10 / 1h $16, hit $0.20 — the public table
// (claude.com/pricing + platform.claude.com/docs/en/about-claude/pricing, read that day) and CLI 2.1.321's catalog tier
// `tier_8_40_cache_read_0_20`. §2d routes the ids (and their [1m] form) to their own rows; a CONTROL prices the same event
// on a table without them (`fable` = Fable 5's rates — what a 5.2 turn cost on f5e087bb5). §4 is THE MODEL-ID CENSUS:
// every table that names a Fable model by id (the price rows, the picker's full ids in src/server/cli-env.js, the family /
// cap lane, the model lock's compare and the status bar's twin, the /model echo) carries every Fable member any of them
// names — a table that lacks one FAILS, by table and id (controls: a member dropped from one table; a member planted in one).
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
  // ── §2d Fable 5.2 / Mythos 5.2 ──────────────────────────────────────────────
  console.log('§2d Fable 5.2 / Mythos 5.2 — their own rows ($8/$40, hit $0.20), never Fable 5\'s');
  ok(tier('claude-fable-5-2') === 'fable-5-2' && tier('claude-fable-5-2[1m]') === 'fable-5-2', 'claude-fable-5-2 (and [1m]) → the fable-5-2 tier (longest key wins over `fable`)', tier('claude-fable-5-2'));
  ok(tier('claude-mythos-5-2') === 'mythos-5-2' && tier('claude-mythos-5-2[1m]') === 'mythos-5-2', 'claude-mythos-5-2 (and [1m]) → the mythos-5-2 tier', tier('claude-mythos-5-2'));
  ok(tier('claude-fable-5-1') === 'fable-5-1' && tier('claude-fable-5') === 'fable' && tier('claude-mythos-5-1') === 'mythos-5-1' && tier('claude-mythos-5') === 'mythos', '5-1 and 5 keep their rows');
  const f52 = t['fable-5-2'], m52 = t['mythos-5-2'];
  ok(f52 && f52.input === 8 && f52.output === 40 && f52.cacheWrite5m === 10 && f52.cacheWrite1h === 16 && f52.cacheRead === 0.2, 'fable-5-2 = the published price: $8/$40, cw 5m $10 / 1h $16, hit $0.20 (0.025× base)', JSON.stringify(f52));
  ok(m52 && ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'].every((k) => m52[k] === f52[k]), 'mythos-5-2 prices exactly as fable-5-2 (the same published row, the same catalog tier)', JSON.stringify(m52));
  const ev52 = { model: 'claude-fable-5-2[1m]', acct: null, i: 1000, o: 2000, cw5: 3000, cw1: 4000, cr: 50000 };
  const hand52 = (1000 * 8 + 2000 * 40 + 3000 * 10 + 4000 * 16 + 50000 * 0.2) / 1e6;
  ok(Math.abs(uh._cost(ev52) - hand52) < 1e-12, `a Fable 5.2 [1m] event costs the hand arithmetic ($${hand52.toFixed(6)})`, uh._cost(ev52));
  {
    const neg52 = mk(); const no52 = { ...neg52._pricing.tiers }; delete no52['fable-5-2']; delete no52['mythos-5-2'];
    neg52._pricing = { ...neg52._pricing, tiers: no52 };
    const c52 = neg52._cost(ev52);
    ok(neg52._tier('claude-fable-5-2') === 'fable' && neg52._tier('claude-mythos-5-2') === 'mythos' && c52 > hand52 * 1.2, `control: without the rows (f5e087bb5) claude-fable-5-2 lands on \`fable\` (Fable 5) and the same event costs $${c52.toFixed(6)} (+${(((c52 / hand52) - 1) * 100).toFixed(1)} % over list) — cache hits 5×`, neg52._tier('claude-fable-5-2'));
  }
  ok(uh2._pricing.tiers['fable-5-2']?.cacheRead === 0.2 && uh2._pricing.tiers['mythos-5-2']?.input === 8 && uh2._tier('claude-fable-5-2') === 'fable-5-2', 'an old on-disk pricing.json gains both 5-2 rows on load, and Fable 5.2 routes to its row');
  // ── §2e Sonnet 5.5 / Haiku 5.5 (r2) ─────────────────────────────────────────
  console.log('§2e Sonnet 5.5 / Haiku 5.5 — their own rows; Haiku 5.5 priced by prompt length');
  ok(tier('claude-sonnet-5-5') === 'sonnet-5-5' && tier('claude-sonnet-5-5[1m]') === 'sonnet-5-5' && tier('claude-sonnet-5') === 'sonnet-5', 'claude-sonnet-5-5 (and [1m]) → sonnet-5-5; claude-sonnet-5 keeps sonnet-5', tier('claude-sonnet-5-5'));
  ok(tier('claude-haiku-5-5') === 'haiku-5-5' && tier('claude-haiku-4-5-20251001') === 'haiku', 'claude-haiku-5-5 → haiku-5-5; Haiku 4.5 keeps `haiku`', tier('claude-haiku-5-5'));
  {
    const short = { model: 'claude-haiku-5-5', acct: null, i: 20000, o: 3000, cw5: 10000, cw1: 0, cr: 60000 };          // prompt 90 000 ⇒ the base rates
    const long = { ...short, i: 30000 };                                                                                  // prompt 100 000… plus one:
    const longer = { ...short, i: 30001 };                                                                                // 100 001 ⇒ the long rates, for ALL tokens
    const at = (e, r) => (e.i * r.input + e.o * r.output + e.cw5 * r.cacheWrite5m + e.cw1 * r.cacheWrite1h + e.cr * r.cacheRead) / 1e6;
    const base = { input: 0.1, output: 0.5, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01 }, over = { input: 0.5, output: 2.5, cacheWrite5m: 0.625, cacheWrite1h: 1, cacheRead: 0.05 };
    ok(Math.abs(uh._cost(short) - at(short, base)) < 1e-12 && Math.abs(uh._cost(long) - at(long, base)) < 1e-12 && Math.abs(uh._cost(longer) - at(longer, over)) < 1e-12, 'Haiku 5.5: a prompt of 90 000 and of exactly 100 000 tokens at $0.10 / $0.50; 100 001 at $0.50 / $2.50 for every token (the public «over 100,000»)', [uh._cost(short), uh._cost(long), uh._cost(longer)]);
    const neg = mk(); const tiersNo = { ...neg._pricing.tiers }; delete tiersNo['haiku-5-5']; delete tiersNo['sonnet-5-5']; neg._pricing = { ...neg._pricing, tiers: tiersNo };
    ok(neg._tier('claude-haiku-5-5') === 'haiku' && neg._cost(short) > uh._cost(short) * 9 && neg._tier('claude-sonnet-5-5') === 'sonnet-5' && tiersNo['sonnet-5'].cacheRead === 2 * t['sonnet-5-5'].cacheRead, 'CONTROL: without the rows (.387) Haiku 5.5 lands on Haiku 4.5 (×' + (neg._cost(short) / uh._cost(short)).toFixed(1) + ' on this event) and Sonnet 5.5 on Sonnet 5 (cache hits 2×)', neg._tier('claude-haiku-5-5'));
  }
  ok(uh2._pricing.tiers['haiku-5-5']?.long?.above === 100000 && uh2._pricing.tiers['sonnet-5-5']?.cacheRead === 0.1 && uh2._tier('claude-haiku-5-5') === 'haiku-5-5', 'an old on-disk pricing.json gains both rows on load (the long block whole)');
  // ── §2c retired generations get their own rows ──────────────────────────────
  console.log('§2c retired ids never borrow a newer generation\'s price');
  const RETIRED = {
    'claude-opus-4-20250514': 'opus-4-2025', 'claude-opus-4-0': 'opus-4-0', 'claude-opus-4-1': 'opus-4-1', 'claude-opus-4-1-20250805': 'opus-4-1',
    'us.anthropic.claude-opus-4-20250514-v1:0': 'opus-4-2025', 'claude-opus-4@20250514': 'opus-4@', 'claude-opus-4-1@20250805': 'opus-4-1', 'claude-3-opus-20240229': '3-opus',
    'claude-3-5-haiku-20241022': '3-5-haiku', 'claude-3-5-haiku@20241022': '3-5-haiku', 'claude-3-haiku-20240307': '3-haiku', 'claude-mythos-preview': 'mythos-preview',
  };
  for (const [id, key] of Object.entries(RETIRED)) ok(uh._tier(id) === key, `${id} → \`${key}\``, uh._tier(id));
  const CURRENT = { 'claude-opus-4-5-20251101': 'opus', 'claude-opus-4-6': 'opus', 'claude-opus-4-8': 'opus', 'claude-opus-5': 'opus', 'claude-opus-4-5@20251101': 'opus', 'claude-haiku-4-5-20251001': 'haiku', 'claude-mythos-5': 'mythos', 'claude-mythos-5-1': 'mythos-5-1' };
  for (const [id, key] of Object.entries(CURRENT)) ok(uh._tier(id) === key, `${id} stays on \`${key}\``, uh._tier(id));
  ok(t['opus-4-1'].input === 15 && t['opus-4-1'].output === 75 && t['3-5-haiku'].input === 0.8 && t['3-haiku'].output === 1.25 && t['mythos-preview'].input === 25, 'the rows carry the retired list prices ($15/$75, $0.80/$4, $0.25/$1.25, $25/$125)');
  {
    const cdir = scratch('pricing-retired'); fs.mkdirSync(path.join(cdir, 'usage-history'), { recursive: true });
    const tiers = { ...t }; for (const k of new Set(Object.values(RETIRED))) delete tiers[k];
    fs.writeFileSync(path.join(cdir, 'usage-history', 'pricing.json'), JSON.stringify({ version: 2, tiers, accounts: {} }));
    const neg = new UsageHistory({ dataDir: cdir, homeDir: cdir });
    neg._pricing.tiers = tiers; // the load fills missing DEFAULT keys — the control is the table WITHOUT them
    ok(neg._tier('claude-opus-4-1') === 'opus' && neg._tier('claude-3-5-haiku-20241022') === 'haiku' && neg._tier('claude-mythos-preview') === 'mythos', 'control: without the rows the retired ids land on the NEWER generation\'s key — the rows are what routes them', [neg._tier('claude-opus-4-1'), neg._tier('claude-3-5-haiku-20241022'), neg._tier('claude-mythos-preview')].join(','));
    try { fs.rmSync(cdir, { recursive: true, force: true }); } catch { }
  }

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
      // r2: a tier may nest its long-prompt block (haiku_55: `long_prompt:{above_prompt_tokens:1e5,…}`) — read the top level and
      // the nested block apart (the old flat split let the nested rates overwrite the top-level ones)
      const txt = buf.subarray(d, d + 600).toString('latin1'), open = txt.indexOf('{');
      let depth = 0, end = -1; for (let i = open; i < txt.length; i++) { if (txt[i] === '{') depth++; else if (txt[i] === '}' && --depth === 0) { end = i; break; } }
      if (open < 0 || end < 0) return null;
      let inner = txt.slice(open + 1, end), nested = null;
      const lp = /long_prompt:\{([^}]*)\}/.exec(inner);
      if (lp) { nested = {}; for (const kv of lp[1].split(',')) { const [k, v] = kv.split(':'); nested[k] = Number(v); } inner = inner.replace(lp[0], ''); }
      const r = {}; for (const kv of inner.split(',')) { const [k, v] = kv.split(':'); if (k) r[k] = Number(v); }
      const long = nested ? { above: nested.above_prompt_tokens, input: nested.input, output: nested.output, cacheWrite5m: nested.cache_write_5m, cacheWrite1h: nested.cache_write_1h, cacheRead: nested.cache_read } : undefined;
      return { name: m[1], input: r.input, output: r.output, cacheWrite5m: r.cache_write_5m, cacheWrite1h: r.cache_write_1h, cacheRead: r.cache_read, ...(long ? { long } : {}) };
    };
    console.log(`  installed binary ${path.basename(bin)} (${lenient ? 'mirror: informational' : 'STRICT'})`);
    let seen = 0;
    for (const id of ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-5', 'claude-fable-5-2', 'claude-mythos-5-2', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-haiku-4-5', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-fable-5-1', 'claude-fable-5', 'claude-mythos-5-1', 'claude-mythos-5', 'claude-sonnet-5', 'claude-opus-4-1', 'claude-opus-4-0', 'claude-3-5-haiku']) {
      const cat = tierOf(id);
      if (!cat) { console.log(`  - ${id}: not in this build's catalog (skipped)`); continue; }
      seen++;
      const ours = t[uh._tier(id)];
      const same = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'].every((k) => ours[k] === cat[k]) && JSON.stringify(ours.long || null) === JSON.stringify(cat.long || null);
      check(same, `${id} → our \`${uh._tier(id)}\` row = the catalog's ${cat.name}`, JSON.stringify({ ours, catalog: cat }));
    }
    check(seen >= 5, 'the oracle read the catalog (non-vacuous: ≥ 5 of the named ids found)', String(seen));
  }

  // ── §4 THE MODEL-ID CENSUS — every family, every table that names a model by id, held to the PUBLIC table ──
  // r2 (lane fable-52-cli-321 follow-up): the Fable-only census widened to every family. The authority is
  // scripts/fixtures/anthropic-pricing.json (the dated public table, 2026-11-09 — as scripts/fixtures/openai-pricing.json is for
  // gpt-*). A MEMBER is a current id of that table that some id table names by its OWN entry (a price key that is the point
  // release — `sonnet-5-5`, or a family key standing for exactly one id: `fable` = Fable 5, `mythos` = Mythos 5 — or a picker row).
  console.log('§4 the model-id census — every family: each table carries every member any of them names, each priced at the public table');
  const rd = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const { familyOfModel, familyOfScopedBucket, projectCacheForFamily } = require(path.join(ROOT, 'src/model-family.js'));
  const { parseSetModelEcho } = require(path.join(ROOT, 'src/model-echo.js'));
  const PUB = JSON.parse(rd('scripts/fixtures/anthropic-pricing.json'));
  // the picker's full ids: the CLAUDE_KNOWN_MODELS literal (cli-env is a factory over the whole hub — read, never booted)
  const knownBlock = (/const CLAUDE_KNOWN_MODELS = \[([\s\S]*?)\n\];/.exec(rd('src/server/cli-env.js')) || [])[1] || '';
  const labelIds = [...knownBlock.matchAll(/\{ id: '([^']+)', label: '([^']+)' \}/g)].map((m) => ({ id: m[1], label: m[2] }));
  // the model lock's compare (usage-pool-engine, inside the engine's closure) and the status bar's twin (chat-status-bar, module-private)
  const fnText = (src, head) => { const at = src.indexOf(head); if (at < 0) return null; const end = src.indexOf('\n}\n', at); return end < 0 ? null : src.slice(at, end + 2); };
  const lockText = fnText(rd('src/server/usage-pool-engine.js'), 'function modelsMatch(a, b) {');
  const lockMatch = lockText ? new Function(lockText + '\nreturn modelsMatch;')() : null;
  const sbSrc = rd('src/lib/chat-status-bar.js');
  const sbLines = sbSrc.split('\n').filter((l) => l.startsWith('const modelCore = ') || l.startsWith('const sameModel = '));
  const barMatch = sbLines.length === 2 ? new Function(sbLines.join('\n') + '\nreturn sameModel;')() : null;
  ok(labelIds.length >= 8 && !!lockMatch && !!barMatch && PUB.fetchedAt === '2026-11-09' && PUB.models.length >= 20, 'the census reads its tables: the picker list (' + labelIds.length + ' ids), the lock\'s modelsMatch, the status bar\'s sameModel, the public table (' + PUB.models.length + ' rows, read ' + PUB.fetchedAt + ')', JSON.stringify({ labels: labelIds.length, lock: !!lockMatch, bar: !!barMatch, pub: PUB.models.length }));
  const RATES = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'];
  const familyOfId = (id) => (/^claude-(fable|mythos|opus|sonnet|haiku)-/.exec(id) || [])[1] || null;
  const CAP_FAMILY = { fable: 'fable', mythos: 'fable', opus: 'opus', sonnet: 'sonnet', haiku: 'haiku' };   // model-family.js: Mythos rides the Fable cap
  const ONE_ID_KEY = { fable: 'claude-fable-5', mythos: 'claude-mythos-5' };   // a family key that stands for exactly one id
  /** THE CENSUS: tables in, the gaps out ([] = every table carries every member). PURE over its inputs, so the controls feed it copies. */
  function modelCensus({ tiers, labels, pub = PUB, lock = lockMatch, bar = barMatch, family = familyOfModel, echo = parseSetModelEcho }) {
    const uhx = mk(); uhx._pricing = { ...uhx._pricing, tiers };
    const gaps = [];
    const pubRow = new Map(); for (const r of pub.models) for (const id of r.ids) pubRow.set(id, r);
    const current = new Set(pub.models.filter((r) => !r.retired).flatMap((r) => r.ids));
    // (a) the PRICE table: every public id (current AND retired) resolves to a row equal to the public one, [1m] too; the long tier too
    for (const r of pub.models) for (const id of r.ids) for (const v of [id, id + '[1m]']) {
      const k = uhx._tier(v), row = tiers[k] || {};
      const same = RATES.every((f) => row[f] === r[f]) && JSON.stringify(row.long ? { above: row.long.above, ...Object.fromEntries(RATES.map((f) => [f, row.long[f]])) } : null) === JSON.stringify(r.long ? { above: r.long.above, ...Object.fromEntries(RATES.map((f) => [f, r.long[f]])) } : null);
      if (!same) gaps.push(`price: ${v} → \`${k}\` is not the public ${r.name} (${r.input}/${r.output}, hit ${r.cacheRead}${r.long ? ', over ' + r.long.above + ' tokens ' + r.long.input + '/' + r.long.output : ''})`);
    }
    // (b) the MEMBERS: the current ids some table names by its OWN entry
    const fromPrice = Object.keys(tiers).map((k) => (ONE_ID_KEY[k] || 'claude-' + k)).filter((id) => current.has(id));
    const fromLabels = labels.map((l) => l.id).filter((id) => current.has(id));
    const members = [...new Set([...fromPrice, ...fromLabels])].sort();
    // a picker row names a model the public table does not list ⇒ nothing to price it by
    for (const l of labels) if (familyOfId(l.id) && !pubRow.has(l.id.replace(/\[1m\]$/, ''))) gaps.push(`picker: ${l.id} is in no public row`);
    // (c) the PICKER carries every member of every family it names
    const pickerFams = new Set(labels.map((l) => familyOfId(l.id)).filter(Boolean));
    for (const id of members) if (pickerFams.has(familyOfId(id)) && !labels.some((l) => l.id === id)) gaps.push(`picker: no full id ${id}`);
    // (d) family / cap lane / lock / status bar / echo, per member
    const BUCKETS = [{ name: 'Fable', pct: 40 }, { name: 'Opus', pct: 90 }, { name: 'Sonnet', pct: 70 }];
    for (const id of members) {
      const F = familyOfId(id), cap = CAP_FAMILY[F];
      if (family(id) !== cap || family(id + '[1m]') !== cap) gaps.push(`family: ${id} → ${family(id)} (want ${cap})`);
      const proj = projectCacheForFamily({ fiveHour: 1, sevenDay: 2, scopedWeekly: BUCKETS }, family(id));
      const want = BUCKETS.filter((b) => familyOfScopedBucket(b.name) === cap).map((b) => b.name).join();
      if (proj.scopedWeekly.map((b) => b.name).join() !== want) gaps.push(`cap lane: ${id} sees ${proj.scopedWeekly.map((b) => b.name).join() || 'none'} (want ${want || 'none'})`);
      for (const [name, f] of [['lock', lock], ['status bar', bar]]) {
        if (!(f(id, id) && f(id, id + '[1m]') && f(F, id) && f(F + '[1m]', id + '[1m]'))) gaps.push(`${name}: ${id} is not itself / its [1m] / the ${F} alias`);
        for (const other of members) if (other !== id && familyOfId(other) === F && other.split('-').length === id.split('-').length && f(id, other)) gaps.push(`${name}: ${id} matches ${other}`);
      }
      const e = echo('<local-command-stdout>Set model to `' + F + '[1m] (' + id + ')`</local-command-stdout>', { envelope: 'required' }), e2 = echo('Set model to ' + id);
      if (!(e && e.id === id && e2 && e2.alias === id)) gaps.push(`echo: ${id} not read back`);
    }
    return { members, gaps };
  }
  const real = modelCensus({ tiers: t, labels: labelIds });
  ok(real.members.join() === 'claude-fable-5,claude-fable-5-1,claude-fable-5-2,claude-haiku-4-5-20251001,claude-haiku-5-5,claude-mythos-5,claude-mythos-5-1,claude-mythos-5-2,claude-opus-5,claude-opus-5-5,claude-sonnet-5,claude-sonnet-5-5', 'the members the tables name (computed from the tables, never listed here): Fable 5 / 5.1 / 5.2, Mythos 5 / 5.1 / 5.2, Opus 5 / 5.5, Sonnet 5 / 5.5, Haiku 4.5 / 5.5', real.members.join());
  ok(real.gaps.length === 0, 'EVERY public id (current and retired, [1m] too) is priced at its public row, long tier included; the picker carries every member of every family it names; each member: the right family + cap lane, the lock and the status bar (itself, [1m], its alias — never a sibling), the /model echo', real.gaps.join(' · '));
  ok(labelIds.find((l) => l.id === 'claude-fable-5-2')?.label === 'Fable 5.2' && labelIds.find((l) => l.id === 'claude-fable-5-1')?.label === 'Fable 5.1' && labelIds.find((l) => l.id === 'claude-sonnet-5-5')?.label === 'Sonnet 5.5' && labelIds.find((l) => l.id === 'claude-haiku-5-5')?.label === 'Haiku 5.5' && labelIds.find((l) => l.id === 'claude-opus-5-5')?.label === 'Opus 5.5', 'the picker labels them as the CLI catalog\'s display_name («Fable 5.1», «Fable 5.2», «Opus 5.5», «Sonnet 5.5», «Haiku 5.5»)');
  // CONTROLS: the census FAILS by table and id
  const noLabel = modelCensus({ tiers: t, labels: labelIds.filter((l) => l.id !== 'claude-fable-5-2') });
  ok(noLabel.gaps.join() === 'picker: no full id claude-fable-5-2', 'CONTROL: the picker list without Fable 5.2 ⇒ exactly «picker: no full id claude-fable-5-2»', noLabel.gaps.join(' · '));
  const noRow = { ...t }; delete noRow['fable-5-2'];
  const noPrice = modelCensus({ tiers: noRow, labels: labelIds });
  ok(noPrice.gaps.length === 2 && noPrice.gaps.every((g) => g.startsWith('price: claude-fable-5-2') && g.includes('`fable`')), 'CONTROL: the price table without fable-5-2 ⇒ both spellings named, landing on `fable` (Fable 5), not the public Fable 5.2 — and 5.2 stops being a member the picker must carry (the table names it no more)', noPrice.gaps.join(' · '));
  const pub53 = { ...PUB, models: [...PUB.models, { name: 'Claude Fable 5.3', ids: ['claude-fable-5-3'], input: 8, cacheWrite5m: 10, cacheWrite1h: 16, cacheRead: 0.2, output: 40 }] };
  const planted = modelCensus({ tiers: { ...t, 'fable-5-3': { ...t['fable-5-2'] } }, labels: labelIds, pub: pub53 });
  ok(planted.members.includes('claude-fable-5-3') && planted.gaps.join() === 'picker: no full id claude-fable-5-3', 'CONTROL: a new point release published and priced by its own key, but no picker row ⇒ the picker FAILS — «one table lacks a family member the others have»', planted.gaps.join(' · '));
  const pubOnly = modelCensus({ tiers: t, labels: labelIds, pub: pub53 });
  ok(pubOnly.gaps.length === 2 && pubOnly.gaps.every((g) => g.startsWith('price: claude-fable-5-3')), 'CONTROL: the same release published with NO row anywhere ⇒ the price table fails it (Fable 5\'s family row is not its public price)', pubOnly.gaps.join(' · '));
  const wrongFam = modelCensus({ tiers: t, labels: labelIds, family: (m) => (String(m).includes('fable-5-2') ? null : familyOfModel(m)) });
  ok(wrongFam.gaps.some((g) => g.startsWith('family: claude-fable-5-2')) && wrongFam.gaps.some((g) => g.startsWith('cap lane: claude-fable-5-2')), 'CONTROL: a family rule keyed on point releases (5-2 unknown) ⇒ the family AND the cap lane gaps named', wrongFam.gaps.join(' · '));
  {
    // the f5e087bb5 tables (before the hotfix) and the .387 hotfix's (Fable rows only): red BY NAME on what each lacked
    const hot = { ...t }; delete hot['sonnet-5-5']; delete hot['haiku-5-5'];
    const hotLabels = labelIds.filter((l) => !['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].includes(l.id));
    const g387 = modelCensus({ tiers: hot, labels: hotLabels }).gaps;
    ok(g387.some((g) => g.startsWith('price: claude-sonnet-5-5 → `sonnet-5`')) && g387.some((g) => g.startsWith('price: claude-haiku-5-5 → `haiku`')) && g387.includes('picker: no full id claude-opus-5-5') && !g387.some((g) => /fable/.test(g)), 'CONTROL (the .387 hotfix tables): Sonnet 5.5 priced as Sonnet 5, Haiku 5.5 as Haiku 4.5, no Opus 5.5 picker row — the Fable family already whole', g387.join(' · '));
    const base = { ...hot }; delete base['fable-5-2']; delete base['mythos-5-2'];
    const g386 = modelCensus({ tiers: base, labels: hotLabels.filter((l) => !/^claude-fable-5-[12]/.test(l.id)) }).gaps;
    ok(g386.some((g) => g.startsWith('price: claude-fable-5-2 → `fable`')) && g386.includes('picker: no full id claude-fable-5-1'), 'CONTROL (the f5e087bb5 tables): …and Fable 5.2 priced as Fable 5, no Fable 5.1 picker row', g386.filter((g) => /fable/.test(g)).join(' · '));
  }

  // ── §5 THE UNKNOWN-ID ROAD (law 4) ──────────────────────────────────────────
  // What an id NO table names gets — f5e087bb5's lot for claude-fable-5-2, and the next point release's on this tree. Every reader survives
  // it: no throw, a number in the Usage window (the FAMILY row's price — Fable 5's — until a row lands), the Fable cap lane, alias-tolerant
  // lock / status bar, the /model echo, and the picker's Custom… (the subscription provider takes any claude- id: a menu, not a fence).
  console.log('§5 the unknown-id road — an id no table names: no throw, the family row, the Fable lane, the picker takes it');
  const MP = require(path.join(ROOT, 'src/model-providers.js'));
  const CAT = JSON.parse(rd('scripts/fixtures/provider-models/catalogs.json'));
  const sub = MP.withListed(MP.presetOf('pv-anthropic-subscription'), [...CAT.harness.claude, ...labelIds.filter((l) => !CAT.harness.claude.some((c) => c.id === l.id))]);
  const NEXT = 'claude-fable-5-3';
  const evN = { model: NEXT + '[1m]', acct: null, i: 1000, o: 2000, cw5: 0, cw1: 0, cr: 40000 };
  ok(tier(NEXT) === 'fable' && tier(NEXT + '[1m]') === 'fable' && Math.abs(uh._cost(evN) - (1000 * 10 + 2000 * 50 + 40000 * 1) / 1e6) < 1e-12, 'a Fable id no table names prices on the family row `fable` (Fable 5\'s rates: $10/$50, hit $1) — never `_default`, never a throw: the Usage window shows a number, not a gap', tier(NEXT));
  ok(tier('claude-zephyr-1') === '_default' && Number.isFinite(uh._cost({ ...evN, model: 'claude-zephyr-1' })), '…an id of a family no row names lands on `_default` ($3/$15) — a number, no throw (only a codex id is said in the journal)');
  ok(familyOfModel(NEXT) === 'fable' && familyOfModel(NEXT + '[1m]') === 'fable' && familyOfModel('claude-zephyr-1') === null, '…the Fable family (the Fable cap lane the 5h / 7d windows and the Fable weekly cap ride); an unknown FAMILY is null = no projection, every cap counts (fail closed)');
  ok(lockMatch('fable', NEXT) && lockMatch(NEXT, NEXT + '[1m]') && !lockMatch('claude-fable-5-2', NEXT) && barMatch('fable[1m]', NEXT) && !barMatch('claude-fable-5-2', NEXT), '…the lock and the status bar take it alias-tolerant (the fable alias, [1m]) and never as its sibling 5-2');
  const echoN = parseSetModelEcho('<local-command-stdout>Set model to `fable[1m] (' + NEXT + '[1m])`</local-command-stdout>', { envelope: 'required' });
  ok(!!echoN && echoN.alias === 'fable[1m]' && echoN.id === NEXT + '[1m]', '…the /model echo reads it back whole', echoN);
  const baseSub = MP.withListed(MP.presetOf('pv-anthropic-subscription'), CAT.harness.claude);   // the f5e087bb5 claude list (no Fable 5.1 / 5.2 rows)
  ok(MP.resolveModel(sub, NEXT) === NEXT && MP.resolveModel(sub, NEXT + '[1m]') === NEXT + '[1m]', '…the picker\'s Custom… on the subscription provider sends a bare id no row names as typed (any claude- id), and its [1m] form too (the harness runs `<id>[1m]` itself — lane cli-update-needs-nothing R4; until .389 the open branch tested the WHOLE typed id against the kind\'s pattern and refused it)', [MP.resolveModel(sub, NEXT), MP.resolveModel(sub, NEXT + '[1m]')]);
  ok(MP.resolveModel(sub, 'claude-fable-5-2[1m]') === 'claude-fable-5-2[1m]' && MP.resolveModel(sub, 'claude-fable-5-2') === 'claude-fable-5-2', '…on this tree claude-fable-5-2 AND claude-fable-5-2[1m] resolve to their own rows', [MP.resolveModel(sub, 'claude-fable-5-2'), MP.resolveModel(sub, 'claude-fable-5-2[1m]')]);
  // THE CONTROL IS REAL (acceptance r2, small 5): the SAME forward predicate asked of a patched copy of model-providers whose
  // open branch is the .388 line (the WHOLE typed id against the kind's pattern) — it must refuse the [1m] form there
  {
    const mpSrc = fs.readFileSync(path.join(ROOT, 'src/model-providers.js'), 'utf8');
    const NEW_LINE = "return open && k && k.idPattern.test(want.replace(/\\[1m\\]$/i, '')) ? want : null;", OLD_LINE = 'return open && k && k.idPattern.test(want) ? want : null;';
    const cdir = scratch('pricing-mp388'); fs.mkdirSync(cdir, { recursive: true });
    fs.writeFileSync(path.join(cdir, 'model-providers.js'), mpSrc.replace(NEW_LINE, OLD_LINE));
    const MP388 = require(path.join(cdir, 'model-providers.js'));
    const sub388 = MP388.withListed(MP388.presetOf('pv-anthropic-subscription'), CAT.harness.claude);
    ok(mpSrc.includes(NEW_LINE) && MP388.resolveModel(sub388, NEXT) === NEXT && MP388.resolveModel(sub388, NEXT + '[1m]') === null, 'CONTROL (a patched copy with the .388 open branch, the f5e087bb5 list): the forward predicate FAILS there — the bare id went through, the [1m] form was REFUSED (a conversation could pick a new model only bare, which an older CLI ran at its unknown-model 200k window)', [MP388.resolveModel(sub388, NEXT), MP388.resolveModel(sub388, NEXT + '[1m]')]);
  }
  ok(sub.models.some((m) => m.id === 'claude-fable-5-2' && m.label === 'Fable 5.2') && sub.models.some((m) => m.id === 'claude-fable-5-2[1m]' && m.label === 'Fable 5.2 [1m]' && m.context === 1000000), '…and on this tree Fable 5.2 is a ROW of the claude list (src/server/cli-env.js), bare and [1m] — the [1m] row carries the 1M context', sub.models.filter((m) => /fable/.test(m.id)).map((m) => [m.id, m.context]));
  const subNo1m = MP.withListed(MP.presetOf('pv-anthropic-subscription'), [...CAT.harness.claude, ...labelIds.filter((l) => l.id !== 'claude-fable-5-2[1m]' && !CAT.harness.claude.some((c) => c.id === l.id))]);
  ok(MP.resolveModel(subNo1m, 'claude-fable-5-2[1m]') === 'claude-fable-5-2', 'CONTROL: the list with the bare 5.2 row and no [1m] row resolves a typed claude-fable-5-2[1m] to the bare id — the [1m] dropped, so on 2.1.319 the CLI would run 5.2 with its unknown-model 200k window — the reason the [1m] row exists', MP.resolveModel(subNo1m, 'claude-fable-5-2[1m]'));
} finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skip} skipped)` : `\nALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0);
