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
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
      const body = buf.subarray(d, d + 400).toString('latin1').match(/:\{([^}]*)\}/);
      if (!body) return null;
      const r = {}; for (const kv of body[1].split(',')) { const [k, v] = kv.split(':'); r[k] = Number(v); }
      return { name: m[1], input: r.input, output: r.output, cacheWrite5m: r.cache_write_5m, cacheWrite1h: r.cache_write_1h, cacheRead: r.cache_read };
    };
    console.log(`  installed binary ${path.basename(bin)} (${lenient ? 'mirror: informational' : 'STRICT'})`);
    let seen = 0;
    for (const id of ['claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-5', 'claude-fable-5-2', 'claude-mythos-5-2', 'claude-fable-5-1', 'claude-fable-5', 'claude-mythos-5-1', 'claude-mythos-5', 'claude-sonnet-5', 'claude-opus-4-1', 'claude-opus-4-0', 'claude-3-5-haiku']) {
      const cat = tierOf(id);
      if (!cat) { console.log(`  - ${id}: not in this build's catalog (skipped)`); continue; }
      seen++;
      const ours = t[uh._tier(id)];
      const same = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'].every((k) => ours[k] === cat[k]);
      check(same, `${id} → our \`${uh._tier(id)}\` row = the catalog's ${cat.name}`, JSON.stringify({ ours, catalog: cat }));
    }
    check(seen >= 5, 'the oracle read the catalog (non-vacuous: ≥ 5 of the named ids found)', String(seen));
  }

  // ── §4 THE MODEL-ID CENSUS — the Fable family across every table that names a model by id ──
  console.log('§4 the model-id census — every Fable member any table names is in EVERY table (a new model is a row, not a branch)');
  const rd = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const { familyOfModel, projectCacheForFamily } = require(path.join(ROOT, 'src/model-family.js'));
  const { parseSetModelEcho } = require(path.join(ROOT, 'src/model-echo.js'));
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
  ok(labelIds.length >= 4 && !!lockMatch && !!barMatch, 'the census reads its tables: the picker list (' + labelIds.length + ' ids), the lock\'s modelsMatch, the status bar\'s sameModel', JSON.stringify({ labels: labelIds.length, lock: !!lockMatch, bar: !!barMatch }));
  const FABLE_ID = /^claude-fable-\d+(-\d+)*$/;
  // a price key names a member when it IS one (`fable-5-2`); the bare family key is Fable 5's own row
  const memberOfKey = (k) => (k === 'fable' ? 'claude-fable-5' : /^fable-\d+(-\d+)*$/.test(k) ? 'claude-' + k : null);
  const ownKey = (id) => (id === 'claude-fable-5' ? 'fable' : id.replace(/^claude-/, ''));
  /** THE CENSUS: tables in, the gaps out ([] = every table carries every member). PURE over its inputs, so the controls feed it copies. */
  function fableCensus({ tiers, labels, lock, bar, family = familyOfModel, echo = parseSetModelEcho }) {
    const fromPrice = Object.keys(tiers).map(memberOfKey).filter(Boolean), fromLabels = labels.map((l) => l.id).filter((id) => FABLE_ID.test(id));
    const members = [...new Set([...fromPrice, ...fromLabels])].sort();
    const uhx = mk(); uhx._pricing = { ...uhx._pricing, tiers };
    const gaps = [];
    for (const id of members) {
      for (const v of [id, id + '[1m]']) if (uhx._tier(v) !== ownKey(id)) gaps.push(`price: ${v} → \`${uhx._tier(v)}\`, not its own row \`${ownKey(id)}\``);
      if (!labels.some((l) => l.id === id)) gaps.push(`picker: no full id ${id}`);
      if (family(id) !== 'fable' || family(id + '[1m]') !== 'fable') gaps.push(`family: ${id} → ${family(id)}`);
      const proj = projectCacheForFamily({ fiveHour: 1, sevenDay: 2, scopedWeekly: [{ name: 'Fable', pct: 40 }, { name: 'Opus', pct: 90 }] }, family(id));
      if (!(proj.scopedWeekly.length === 1 && proj.scopedWeekly[0].name === 'Fable')) gaps.push(`cap lane: ${id} does not see the Fable cap alone`);
      for (const [name, f] of [['lock', lock], ['status bar', bar]]) {
        if (!(f(id, id) && f(id, id + '[1m]') && f('fable', id) && f('fable[1m]', id + '[1m]'))) gaps.push(`${name}: ${id} is not itself / its [1m] / the fable alias`);
        for (const other of members) if (other !== id && other.split('-').length === id.split('-').length && f(id, other)) gaps.push(`${name}: ${id} matches ${other}`);
      }
      const e = echo('<local-command-stdout>Set model to `fable[1m] (' + id + ')`</local-command-stdout>', { envelope: 'required' }), e2 = echo('Set model to ' + id);
      if (!(e && e.id === id && e2 && e2.alias === id)) gaps.push(`echo: ${id} not read back`);
    }
    return { members, gaps };
  }
  const real = fableCensus({ tiers: t, labels: labelIds, lock: lockMatch, bar: barMatch });
  ok(real.members.join() === 'claude-fable-5,claude-fable-5-1,claude-fable-5-2', 'the Fable members the tables name are claude-fable-5, -5-1, -5-2 (computed from the tables, never listed here)', real.members.join());
  ok(real.gaps.length === 0, 'EVERY model-id table carries EVERY Fable member, and its [1m] form: own price row, a picker full id, the Fable family + cap lane, the lock and the status bar (itself, [1m], the alias — never a sibling), the /model echo', real.gaps.join(' · '));
  ok(labelIds.find((l) => l.id === 'claude-fable-5-2')?.label === 'Fable 5.2' && labelIds.find((l) => l.id === 'claude-fable-5-1')?.label === 'Fable 5.1', 'the picker labels them «Fable 5.1» / «Fable 5.2» (the CLI catalog\'s display_name)');
  // CONTROLS: the census FAILS by table and id
  const noLabel = fableCensus({ tiers: t, labels: labelIds.filter((l) => l.id !== 'claude-fable-5-2'), lock: lockMatch, bar: barMatch });
  ok(noLabel.gaps.join() === 'picker: no full id claude-fable-5-2', 'CONTROL: the picker list without Fable 5.2 ⇒ exactly «picker: no full id claude-fable-5-2»', noLabel.gaps.join(' · '));
  const noRow = { ...t }; delete noRow['fable-5-2'];
  const noPrice = fableCensus({ tiers: noRow, labels: labelIds, lock: lockMatch, bar: barMatch });
  ok(noPrice.gaps.length === 2 && noPrice.gaps.every((g) => g.startsWith('price: claude-fable-5-2') && g.includes('`fable`')), 'CONTROL: the price table without fable-5-2 ⇒ both spellings named, landing on `fable` (Fable 5)', noPrice.gaps.join(' · '));
  const planted = fableCensus({ tiers: { ...t, 'fable-5-3': { ...t['fable-5-2'] } }, labels: labelIds, lock: lockMatch, bar: barMatch });
  ok(planted.members.includes('claude-fable-5-3') && planted.gaps.join() === 'picker: no full id claude-fable-5-3', 'CONTROL: a member planted in ONE table (a fable-5-3 price row) ⇒ the picker that lacks it FAILS — «one table lacks a family member the others have»', planted.gaps.join(' · '));
  const base = fableCensus({ tiers: noRow, labels: labelIds.filter((l) => l.id === 'claude-fable-5' || !FABLE_ID.test(l.id)), lock: lockMatch, bar: barMatch });
  ok(base.members.join() === 'claude-fable-5,claude-fable-5-1' && base.gaps.join() === 'picker: no full id claude-fable-5-1', 'CONTROL: the f5e087bb5 tables (no 5-2 row, the picker with Fable 5 alone) ⇒ red on the 5.1 gap they already had — and 5.2 is in no table at all', base.gaps.join(' · '));
  const wrongFam = fableCensus({ tiers: t, labels: labelIds, lock: lockMatch, bar: barMatch, family: (m) => (String(m).includes('fable-5-2') ? null : familyOfModel(m)) });
  ok(wrongFam.gaps.some((g) => g.startsWith('family: claude-fable-5-2')) && wrongFam.gaps.some((g) => g.startsWith('cap lane: claude-fable-5-2')), 'CONTROL: a family rule keyed on point releases (5-2 unknown) ⇒ the family AND the cap lane gaps named', wrongFam.gaps.join(' · '));

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
    fs.writeFileSync(path.join(cdir, 'model-providers.js'), editAnchor(mpSrc, NEW_LINE, OLD_LINE, "src/model-providers.js"));
    const MP388 = require(path.join(cdir, 'model-providers.js'));
    const sub388 = MP388.withListed(MP388.presetOf('pv-anthropic-subscription'), CAT.harness.claude);
    ok(mpSrc.includes(NEW_LINE) && MP388.resolveModel(sub388, NEXT) === NEXT && MP388.resolveModel(sub388, NEXT + '[1m]') === null, 'CONTROL (a patched copy with the .388 open branch, the f5e087bb5 list): the forward predicate FAILS there — the bare id went through, the [1m] form was REFUSED (a conversation could pick a new model only bare, which an older CLI ran at its unknown-model 200k window)', [MP388.resolveModel(sub388, NEXT), MP388.resolveModel(sub388, NEXT + '[1m]')]);
  }
  ok(sub.models.some((m) => m.id === 'claude-fable-5-2' && m.label === 'Fable 5.2') && sub.models.some((m) => m.id === 'claude-fable-5-2[1m]' && m.label === 'Fable 5.2 [1m]' && m.context === 1000000), '…and on this tree Fable 5.2 is a ROW of the claude list (src/server/cli-env.js), bare and [1m] — the [1m] row carries the 1M context', sub.models.filter((m) => /fable/.test(m.id)).map((m) => [m.id, m.context]));
  const subNo1m = MP.withListed(MP.presetOf('pv-anthropic-subscription'), [...CAT.harness.claude, ...labelIds.filter((l) => l.id !== 'claude-fable-5-2[1m]' && !CAT.harness.claude.some((c) => c.id === l.id))]);
  ok(MP.resolveModel(subNo1m, 'claude-fable-5-2[1m]') === 'claude-fable-5-2', 'CONTROL: the list with the bare 5.2 row and no [1m] row resolves a typed claude-fable-5-2[1m] to the bare id — the [1m] dropped, so on 2.1.319 the CLI would run 5.2 with its unknown-model 200k window — the reason the [1m] row exists', MP.resolveModel(subNo1m, 'claude-fable-5-2[1m]'));
  // ── §6 THE UNKNOWN PRICE (lane lg-providers, B-d578 P1-b — the law agreed 2026-11-21) ─────────────────────────────────
  // A third-party provider's model (an account id `pv-…` that is not a built-in record) that NO row matches has NO price:
  // its tokens are counted apart (unpricedRequests / unpricedTokens on every bucket), its cost is never 0 and never
  // `_default`'s (Anthropic Sonnet's) rates; every sum that adds costs leaves it out and SAYS so; a row the person adds
  // makes it a cost. The index's second spelling (src/usage-index-model.js) counts it the same way.
  console.log('§6 the unknown price — a provider\'s model no row matches: tokens counted apart, never $0, never _default\'s rates');
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const { anchored } = await import('./scratch.mjs');
    const IM = require(path.join(ROOT, 'src/usage-index-model.js'));
    const UHSRC = fs.readFileSync(path.join(ROOT, 'src/usage-history.js'), 'utf8');
    const M6 = mutantCopies('pricing-unknown', ROOT);
    const PV = 'pv-example-router', QWEN = 'qwen3-coder-plus', SUB = 'sub-aaaa00000001';
    const d6 = scratch('pricing-unknown'); fs.mkdirSync(path.join(d6, 'usage-history'), { recursive: true });
    const DAY = 86400e3, noon = Math.floor(Date.now() / DAY) * DAY - 12 * 3600e3;
    const ev = (n, o) => ({ rid: 'req_p1b_' + n, mid: 'msg_p1b_' + n, ts: noon + n * 60e3, be: 'claude', mode: null, host: null, cwd: '/w/app', origin: 'main', cw1: 0, tier: 'standard', ...o });
    const ROWS = [
      ev(1, { sid: 'sess-p1', model: QWEN, acct: PV, atype: 'unknown', aname: null, i: 1000, o: 500, cw5: 300, cr: 2000 }),   // the provider's model no row matches
      ev(2, { sid: 'sess-p1', model: QWEN, acct: PV, atype: 'unknown', aname: null, i: 10, o: 40, cw5: 0, cr: 7000 }),
      ev(3, { sid: 'sess-p1', model: 'claude-sonnet-5', acct: PV, atype: 'unknown', aname: null, i: 100, o: 200, cw5: 0, cr: 0 }),   // the same provider, a model a row DOES match
      ev(4, { sid: 'sess-s1', model: 'mystery-model', acct: SUB, atype: 'subscription', aname: 'Account 1', i: 50, o: 60, cw5: 0, cr: 0 }),   // NOT a provider: _default as before
      ev(5, { sid: 'sess-b1', model: 'mystery-model', acct: 'pv-anthropic-api', atype: 'unknown', aname: null, i: 70, o: 80, cw5: 0, cr: 0 }),   // a BUILT-IN record's id: not a third party
      ev(6, { sid: 'sess-g1', model: 'claude-opus-5', acct: null, atype: 'global', aname: null, i: 5, o: 6, cw5: 0, cr: 900 }),
    ];
    const shard = path.join(d6, 'usage-history', `events-${new Date(noon).toISOString().slice(0, 7)}.ndjson`);
    fs.writeFileSync(shard, ROWS.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const warns = [], warnWas = console.warn;
    console.warn = (...a) => { warns.push(a.join(' ')); };
    let uh6, mem, memPv;
    try {
      uh6 = new UsageHistory({ dataDir: d6, homeDir: d6 });
      mem = uh6.aggregate({ pivots: [['day', 'account'], ['session', 'origin']] });
      uh6.aggregate({});   // a second fold: the warn is said ONCE per id
      memPv = uh6.aggregate({ accounts: new Set([SUB]) });
    } finally { console.warn = warnWas; }
    const tok = (r) => r.i + r.o + r.cw5 + r.cw1 + r.cr;
    const unk = ROWS.slice(0, 2), priced = ROWS.slice(2);
    const pricedUsd = priced.reduce((s, r) => s + uh6._cost(r), 0);
    const sonnetIfDefault = unk.reduce((s, r) => s + uh6._cost({ ...r, acct: SUB }), 0);   // what the old road priced them at (_default)
    // THE DECISION
    ok(uh6._tier(QWEN) === '_default' && uh6.priceUnknown(QWEN, PV) === true, `the decision: «${QWEN}» on the provider «${PV}» matches no row (tier _default) ⇒ its price is UNKNOWN`, [uh6._tier(QWEN), uh6.priceUnknown(QWEN, PV)]);
    ok(uh6.priceUnknown(QWEN, SUB) === false && uh6.priceUnknown(QWEN, null) === false && uh6.priceUnknown(QWEN, 'pv-anthropic-api') === false && uh6.priceUnknown(QWEN, 'pv-openai-chatgpt') === false && uh6.priceUnknown(QWEN, 'pv-Bad_Id') === false,
      '…and ONLY there: the same id on an account, on the machine login, on a BUILT-IN record (pv-anthropic-api, pv-openai-chatgpt) or on an id of no record\'s shape keeps the table\'s _default as before');
    ok(uh6.priceUnknown('claude-sonnet-5', PV) === false && uh6._cost(ROWS[2]) > 0, '…and the provider\'s model a row DOES match (claude-sonnet-5) is priced at that row', uh6._cost(ROWS[2]));
    ok(uh6._cost(ROWS[0]) === 0 && uh6._cost(ROWS[3]) > 0, '_cost of an unknown-price request is 0 in a sum (its part is counted apart); a non-provider\'s unknown model keeps _default\'s rates', [uh6._cost(ROWS[0]), uh6._cost(ROWS[3])]);
    ok(uh6.priceRowFor(QWEN, { acct: PV }) === null && uh6.priceRowFor('mystery-model').label === '_default' && uh6.priceRowFor(QWEN, { acct: SUB }).label === '_default', 'priceRowFor: NO row for the provider\'s unpriced model (the bulk resume says «not priced»); every other caller\'s row as before');
    {
      const BR = require(path.join(ROOT, 'src/bulk-resume-cost.js'));
      const est = BR.estimateBatch({ items: [{ id: 'a', at: 1, model: QWEN, contextTokens: 40000, member: { key: PV, name: 'Example' } }, { id: 'b', at: 2, model: 'claude-opus-5', contextTokens: 40000, member: { key: SUB, name: 'A' } }], priceOf: (m, it) => uh6.priceRowFor(m, { acct: it.member.key, prompt: it.contextTokens }) });
      ok(est.unpriced === 1 && est.usd > 0, '…and the bulk resume\'s estimate counts it «not priced» (1 of 2), its dollars the priced one\'s', { unpriced: est.unpriced, usd: est.usd });
    }
    // THE BUCKETS
    const T = mem.totals;
    ok(T.requests === 6 && T.unpricedRequests === 2 && T.unpricedTokens === unk.reduce((s, r) => s + tok(r), 0), 'the totals: 6 requests, 2 of them with an unknown price and their tokens counted apart', { requests: T.requests, unpricedRequests: T.unpricedRequests, unpricedTokens: T.unpricedTokens });
    ok(Math.abs(T.cost - pricedUsd) < 1e-12 && sonnetIfDefault > 0, `…and the cost is the PRICED part only ($${T.cost.toFixed(6)}) — never the $${sonnetIfDefault.toFixed(6)} the old road added at _default's (Sonnet's) rates`, { cost: T.cost, pricedUsd });
    const g = (dim, key) => (mem.groups[dim] || []).find((r) => r.key === key);
    const qRow = g('model', QWEN), aRow = g('account', PV), sRow = g('session', 'sess-p1'), bRow = g('billing', 'provider'), dRow = g('day', new Date(noon).toISOString().slice(0, 10));
    ok(qRow && qRow.cost === 0 && qRow.unpricedRequests === 2 && qRow.requests === 2, 'the model row: every request unknown (cost 0 = no priced part, unpricedRequests 2)', qRow);
    ok(aRow && aRow.unpricedRequests === 2 && Math.abs(aRow.cost - uh6._cost(ROWS[2])) < 1e-12 && sRow && sRow.unpricedRequests === 2 && dRow && dRow.unpricedRequests === 2, 'the account, the conversation and the day: their priced part + the unknown part beside it (a mixed sum)', { account: aRow && [aRow.cost, aRow.unpricedRequests], session: sRow && sRow.unpricedRequests, day: dRow && dRow.unpricedRequests });
    const uRow = g('billing', 'unknown-account');
    ok(bRow && bRow.requests === 3 && bRow.unpricedRequests === 2 && uRow && uRow.requests === 1, 'the billing row of a provider is «provider» (its 3 requests, the stored type «unknown» notwithstanding); the built-in record\'s id stays «unknown account» (1)', { provider: bRow, unknown: uRow && uRow.requests });
    ok(aRow && aRow.type === 'provider', 'the account row\'s type is «provider» (the page badges it), whatever type the row stored', aRow && aRow.type);
    const cell = (mem.pivots['day:account'] || [])[0]?.cells?.[PV];
    ok(cell && cell.unpricedRequests === 2, 'a pivot cell (day × account) carries the unknown part too', cell);
    ok(!('unpricedRequests' in memPv.totals) && !(memPv.groups.model || []).some((r) => 'unpricedRequests' in r), 'an answer with no provider\'s unknown part carries no new field (the answer of a hub with no provider is unchanged)', Object.keys(memPv.totals));
    // THE INDEX'S SECOND SPELLING
    const grouped = ROWS.map((r) => { const d = new Date(r.ts); return { sid: r.sid, model: r.model, acct: r.acct, be: r.be, atype: r.atype, cwd: r.cwd, mode: r.mode, host: r.host, pool: null, origin: r.origin, day: d.toISOString().slice(0, 10), hour: d.getHours(), weekday: d.getDay(), n: 1, i: r.i, cw5: r.cw5, cw1: r.cw1, cr: r.cr, o: r.o, lo: r.ts, hi: r.ts, ep: 0, lg: 0, pmax: r.i + r.cr + r.cw5 + r.cw1 }; });
    const folded = IM.foldAggregate(grouped, [['day', 'account'], ['session', 'origin']]);
    const costOf = (c) => uh6._cost(c, c.prompt), unknownOf = (c) => uh6.priceUnknown(c.model, c.acct);
    const same = IM.compareAggregates(mem, IM.finalizeAggregate(folded, costOf, unknownOf));
    ok(same.same && same.checked > 100, `the index's twin (keysOf + finalizeBucket, the ledger's priceUnknown per cell) answers the SAME buckets — billing «provider», the unknown part, every pivot cell (${same.checked} numbers compared)`, same.diffs);
    const ctl = IM.compareAggregates(mem, IM.finalizeAggregate(folded, costOf));
    ok(!ctl.same && ctl.diffs.some((d) => /unpricedRequests/.test(d.at)), 'CONTROL: the twin WITHOUT the unknown-price test reports the difference (the shadow check sees a one-sided edit)', ctl.diffs.slice(0, 2));
    // THE CONTROLS ON THE LEDGER (anchored: a moved product line fails by name)
    {
      const U1 = M6.load('src/usage-history.js', anchored(UHSRC, "    if (priced === null) { b.unpricedRequests++; b.unpricedTokens += (Number(ev.i) || 0) + (Number(ev.cw5) || 0) + (Number(ev.cw1) || 0) + (Number(ev.cr) || 0) + (Number(ev.o) || 0); }   // B-d578 P1-b: counted apart, never as $0\n    else b.cost += priced;\n", '    b.cost += priced || 0;\n', 'the bucket without its unknown part'), 'no-unknown-part');
      const t1 = new U1.UsageHistory({ dataDir: d6, homeDir: d6 }).aggregate({}).totals;
      ok(!(t1.unpricedRequests > 0) && Math.abs(t1.cost - pricedUsd) < 1e-12, 'CONTROL: a bucket that only adds a price drops the unknown part — the totals then read as the smaller bill (the leg above is what keeps it)', t1);
      const U2 = M6.load('src/usage-history.js', anchored(UHSRC, "    if (tier !== '_default' || !isThirdPartyAccount(acct)) return false;\n", '    return false;\n', 'the decision answers known'), 'no-decision');
      const t2 = new U2.UsageHistory({ dataDir: d6, homeDir: d6 }).aggregate({}).totals;
      ok(!(t2.unpricedRequests > 0) && Math.abs(t2.cost - (pricedUsd + sonnetIfDefault)) < 1e-12, 'CONTROL: without the decision the provider\'s model is priced at _default\'s (Sonnet\'s) rates — the wrong price the law ends', { cost: t2.cost, want: pricedUsd + sonnetIfDefault });
    }
    // THE TWO OTHER ROADS — the hot fold (an in-memory range, yielding slices) and the COLD WORKER (a range past the hot window,
    // folded in src/usage-cold-worker.js with no account resolver, model-providers.js required inside the worker) answer the same
    {
      const pick = (a) => ({ requests: a.totals.requests, cost: Math.round(a.totals.cost * 1e9) / 1e9, unpricedRequests: a.totals.unpricedRequests, unpricedTokens: a.totals.unpricedTokens, provider: (a.groups.billing || []).find((r) => r.key === 'provider')?.unpricedRequests, type: (a.groups.account || []).find((r) => r.key === PV)?.type, model: (a.groups.model || []).find((r) => r.key === QWEN)?.unpricedRequests });
      const want = JSON.stringify(pick(mem));
      const uhH = new UsageHistory({ dataDir: d6, homeDir: d6 });
      const hot = await uhH.aggregateAsync({});
      const uhC = new UsageHistory({ dataDir: d6, homeDir: d6 }); uhC.ledgerWindowMs = 3600e3;   // every row of this ledger is ≥ 12 h old ⇒ cold
      const cold = await uhC.aggregateAsync({});
      console.log('    judged roads: ' + JSON.stringify({ sync: pick(mem), hot: pick(hot), cold: pick(cold), coldRows: uhC._evCache && uhC._evCache.cold && uhC._evCache.cold.n }));
      ok(JSON.stringify(pick(hot)) === want, 'the HOT FOLD (aggregateAsync over the in-memory rows) answers the same unknown part, cost, billing row and type as the sync road', pick(hot));
      ok(uhC._evCache && uhC._evCache.cold && uhC._evCache.cold.n === ROWS.length && JSON.stringify(pick(cold)) === want, 'the COLD WORKER (every row past a 1 h window, folded in usage-cold-worker.js — no account resolver there) answers the same: the decision is the id\'s, model-providers loads inside the worker', pick(cold));
    }
    // THE WARN — once per id, in its own words (printed)
    const pw = warns.filter((w) => w.includes(`provider model "${QWEN}"`));
    console.log('    judged warn lines: ' + JSON.stringify(pw));
    ok(pw.length === 1 && /price is UNKNOWN/.test(pw[0]) && !/_default \(Anthropic Sonnet\) rates until/.test(pw[0]) && pw[0].includes(PV), 'the journal says it ONCE per id over two folds: the price is UNKNOWN (not «priced at _default»), with the provider\'s id', pw);
    // A ROW THE PERSON ADDS MAKES IT A COST
    {
      const { priceKeyOf } = await import(path.join(ROOT, 'src/lib/usage-cost-words.js'));
      const key = priceKeyOf('Qwen3-Coder-Plus');
      uh6.setPricing({ tiers: { [key]: { input: 1, output: 2, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 } } });
      const t3 = uh6.aggregate({}).totals;
      const want = pricedUsd + unk.reduce((s, r) => s + (r.i * 1 + r.o * 2 + r.cw5 * 1.25 + r.cr * 0.1) / 1e6, 0);
      ok(key === QWEN && uh6.priceUnknown(QWEN, PV) === false && !('unpricedRequests' in t3) && Math.abs(t3.cost - want) < 1e-12, `a price row the person adds (key «${key}» — the matcher's own spelling) makes it a cost from the next answer on`, { cost: t3.cost, want, unpriced: t3.unpricedRequests });
      const d7 = scratch('pricing-unknown-acct'); fs.mkdirSync(path.join(d7, 'usage-history'), { recursive: true });
      fs.copyFileSync(shard, path.join(d7, 'usage-history', path.basename(shard)));
      const uh7 = new UsageHistory({ dataDir: d7, homeDir: d7 });
      uh7.setPricing({ accounts: { [PV]: { discount: 0.2 } } });
      const disc = uh7.priceUnknown(QWEN, PV);
      uh7.setPricing({ accounts: { [PV]: { tiers: { _default: { input: 0.5, output: 1, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.05 } } } } });
      ok(disc === true && uh7.priceUnknown(QWEN, PV) === false && !('unpricedRequests' in uh7.aggregate({}).totals), '…or that provider\'s OWN row (its account\'s _default); a discount alone leaves it unknown (a part off an unknown price is unknown)', { discountOnly: disc });
    }
    // THE FOLLOW (r1131): THE PROVIDER ACCOUNT'S OWN ROW — «Add a price» writes accounts[<pv id>].tiers[<key>]: it prices that
    // provider's model and never the same id on a first-party sign-in (item 2)
    {
      const d8 = scratch('pricing-unknown-own'); fs.mkdirSync(path.join(d8, 'usage-history'), { recursive: true });
      fs.copyFileSync(shard, path.join(d8, 'usage-history', path.basename(shard)));
      const uh8 = new UsageHistory({ dataDir: d8, homeDir: d8 });
      const OWN = { input: 2, output: 8, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 };
      uh8.setPricing({ accounts: { [PV]: { tiers: { [QWEN]: OWN } } } });
      const t8 = uh8.aggregate({}).totals;
      const wantOwn = pricedUsd + unk.reduce((s, r) => s + (r.i * OWN.input + r.o * OWN.output + r.cw5 * OWN.cacheWrite5m + r.cr * OWN.cacheRead) / 1e6, 0);
      const subRow = uh8.priceRowFor(QWEN, { acct: SUB }), pvRow = uh8.priceRowFor(QWEN, { acct: PV });
      const subEv = { ...ROWS[0], acct: SUB, atype: 'subscription' };
      ok(uh8.priceUnknown(QWEN, PV) === false && !('unpricedRequests' in t8) && Math.abs(t8.cost - wantOwn) < 1e-12 && pvRow && pvRow.input === OWN.input,
        'the provider account\'s OWN row for the model (accounts[pv].tiers[key], what «Add a price» now writes) makes it a cost — that provider\'s rates', { cost: t8.cost, want: wantOwn });
      const D = uh8._pricing.tiers._default, subDefault = (subEv.i * D.input + subEv.o * D.output + subEv.cw5 * D.cacheWrite5m + subEv.cw1 * D.cacheWrite1h + subEv.cr * D.cacheRead) / 1e6;
      ok(subRow && subRow.label === '_default' && subRow.input === D.input && Math.abs(uh8._cost(subEv) - subDefault) < 1e-15,
        '…and the SAME model id on a first-party sign-in keeps its own price (the table\'s _default, as before) — the row re-prices nothing else', { sub: subRow && [subRow.label, subRow.input] });
      const keyOf2 = uh8._acctTier(PV, 'qwen3-coder-plus-0925'), none = uh8._acctTier(PV, 'deepseek-chat'), other = uh8._acctTier('pv-other', QWEN);
      ok(keyOf2 === QWEN && none === null && other === null, '…the matcher\'s own rule on that provider\'s rows only (the longest key the id contains; another provider never borrows it)', { keyOf2, none, other });
    }
    // THE RATE LAW (item 1, money): a rate that is not a plain number at or above 0 and under the ceiling is REFUSED BY NAME at
    // the route's own writer (setPricing — the gate) and nothing is written; the page's check is the same rule, first
    {
      const CPm = require(path.join(ROOT, 'src/catalog-pricing.js'));
      const R5 = (o) => ({ input: 1, output: 2, cacheWrite5m: 1, cacheWrite1h: 1, cacheRead: 0.1, ...o });
      const cases = { negative: { tiers: { m1: R5({ input: -3 }) } }, word: { tiers: { m1: R5({ output: 'abc' }) } }, absurd: { tiers: { m1: R5({ cacheRead: 1e12 }) } },
        nan: { tiers: { m1: R5({ input: NaN }) } }, ownRow: { accounts: { [PV]: { tiers: { m1: R5({ output: -0.5 }) } } } }, nested: { tiers: { m1: R5({ long: { above: 1000, input: -1, output: 2 } }) } } };
      const errs = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, CPm.rateErrors(v)]));
      console.log('    judged refusals: ' + JSON.stringify(errs));
      ok(Object.values(errs).every((e) => e.length === 1) && /below 0/.test(errs.negative[0]) && /not a number/.test(errs.word[0]) && /ceiling of 1000/.test(errs.absurd[0]) && /not a number/.test(errs.nan[0]) && /^accounts\.pv-example-router\.tiers\.m1\.output/.test(errs.ownRow[0]) && /\.long\.input/.test(errs.nested[0]),
        'rateErrors names each slip by its field: a negative, a word, an absurd 1e12, NaN, a provider account\'s own row, a nested long rate');
      ok(CPm.rateErrors({ tiers: { m1: R5({}), free: R5({ input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 }) }, accounts: { [PV]: { discount: 0.2 } } }).length === 0 && CPm.rateErrors({}).length === 0, '…and a good row, a free model\'s typed zeros and a discount alone pass');
      const d9 = scratch('pricing-unknown-law'); fs.mkdirSync(path.join(d9, 'usage-history'), { recursive: true });
      const uh9 = new UsageHistory({ dataDir: d9, homeDir: d9 });
      const pf = path.join(d9, 'usage-history', 'pricing.json'), before = JSON.stringify(uh9.pricingTable());
      const refused = Object.entries(cases).map(([k, v]) => { try { uh9.setPricing(v); return [k, 'WRITTEN']; } catch (e) { return [k, e.code]; } });
      const onDisk = fs.existsSync(pf) ? fs.readFileSync(pf, 'utf8') : '';
      ok(refused.every(([, c]) => c === 'rate-invalid') && JSON.stringify(uh9.pricingTable()) === before && !onDisk.includes('"m1"') && uh9._tier('m1') === '_default', 'setPricing (the route\'s writer — POST /api/usage-stats/pricing answers 400 with code rate-invalid) REFUSES every one by name and WRITES NOTHING (the table unchanged, no row m1 on disk)', refused);
      const U3 = M6.load('src/usage-history.js', anchored(fs.readFileSync(path.join(ROOT, 'src/usage-history.js'), 'utf8'), "    const bad = CP.rateErrors(patch);\n", '    const bad = [];\n', 'the rate law'), 'no-rate-law');
      const d10 = scratch('pricing-unknown-nolaw'); fs.mkdirSync(path.join(d10, 'usage-history'), { recursive: true });
      const u10 = new U3.UsageHistory({ dataDir: d10, homeDir: d10 });
      let wrote = null; try { u10.setPricing(cases.negative); wrote = u10._pricing.tiers.m1 && u10._pricing.tiers.m1.input; } catch (e) { wrote = 'refused ' + e.code; }
      ok(wrote === -3, 'CONTROL (the release\'s writer, the check cut): the negative rate is WRITTEN (-3 per million) — the leg above is what refuses it', wrote);
      const W2 = await import(path.join(ROOT, 'src/lib/usage-cost-words.js'));
      const rp = ['-3', 'abc', '1e12', '5000', String(CPm.RATE_CEILING), '999.99', '0', '2.5', '.5', ''].map((v) => [v, W2.rateProblem(v)]);
      ok(JSON.stringify(rp) === JSON.stringify([['-3', 'negative'], ['abc', 'not-a-number'], ['1e12', 'not-a-number'], ['5000', 'over-ceiling'], ['1000', 'over-ceiling'], ['999.99', null], ['0', null], ['2.5', null], ['.5', null], ['', 'not-a-number']]), 'the page asks the SAME rule first (rateProblem; its ceiling is the route\'s RATE_CEILING): a negative, a word, 1e12, over the ceiling refused; 0 (a free model) and a plain rate pass', rp);
    }
    // THE RULE LOADS model-providers ONLY WHEN A pv- ID IS MET (the fold worker's heap — test-cache-bounds-walks §30)
    {
      const { execFileSync } = await import('node:child_process');
      const probe = `const p=require(${JSON.stringify(path.join(ROOT, 'src/usage-history.js'))});const has=()=>Object.keys(require.cache).some(k=>k.endsWith('/src/model-providers.js'));const a=has();const {isThirdPartyAccount}=require(${JSON.stringify(path.join(ROOT, 'src/provider-ids.js'))});const v=isThirdPartyAccount('sub-1');const b=has();const w=isThirdPartyAccount('pv-example');console.log(JSON.stringify({a,b,c:has(),v,w}))`;
      let out = null; try { out = JSON.parse(execFileSync(process.execPath, ['-e', probe], { encoding: 'utf8', timeout: 20000, env: { ...process.env, VIBESPACE_SKIP_AGENT_HOOKS: '1' } }).trim().split('\n').pop()); } catch (e) { out = { error: String(e.message || e).slice(0, 200) }; }
      ok(out && out.a === false && out.b === false && out.c === true && out.v === false && out.w === true, 'src/provider-ids.js: requiring the ledger loads NO model-providers.js, nor does a non-provider id; the first pv- id loads it (and is judged a third party)', out);
    }
    // THE PAGE'S WORDS (src/lib/usage-cost-words.js, PURE) and the chat bar's (src/lib/chat-bar-words.js)
    {
      const W = await import(path.join(ROOT, 'src/lib/usage-cost-words.js'));
      const zh = (await import(path.join(ROOT, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(ROOT, 'src/lib/i18n-ja.js'))).default;
      const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
      const tEn = (s, p) => fill(s, p), fC = (n) => '$' + Number(n || 0).toFixed(2), fN = (n) => String(n);
      const whole = W.costWords(T, tEn, fC, fN), allU = W.costWords(qRow, tEn, fC, fN), none = W.costWords({ cost: 1.5, requests: 3 }, tEn, fC, fN);
      console.log('    judged words: ' + JSON.stringify([whole.text, whole.note, allU.text, none.text]));
      ok(none.text === '$1.50' && none.note === null && !none.unknown, 'a row with every request priced reads as before («$1.50», no note)');
      ok(whole.text === `${fC(T.cost)} + unknown` && /^Leaves out \d+ tokens whose price is unknown/.test(whole.note) && whole.note.includes(String(T.unpricedTokens)), 'a mixed sum reads «$x + unknown» and its note says what it leaves out (the tokens)', whole);
      ok(allU.text === 'price unknown' && !/\$/.test(allU.text) && /^Price unknown: /.test(allU.note), 'a row whose every request is unknown reads «price unknown» — never «$0.00»', allU);
      ok(JSON.stringify(W.unpricedModels(mem)) === JSON.stringify([{ model: QWEN, key: QWEN, acct: PV, tokens: qRow.unpricedTokens }]) && JSON.stringify(qRow.unpricedBy) === JSON.stringify([PV]) && !('unpricedBy' in (g('model', 'claude-sonnet-5') || {})), 'the «Add a price» rows are the answer\'s unpriced models, each with the provider account that ran it (the model row\'s unpricedBy — on no priced model)', { rows: W.unpricedModels(mem), by: qRow.unpricedBy });
      const two = { groups: { model: [{ key: 'GLM-4.6', unpricedRequests: 1, unpricedTokens: 10, requests: 1, unpricedBy: ['pv-a'] }, { key: 'glm-4.6', unpricedRequests: 2, unpricedTokens: 30, requests: 2, unpricedBy: ['pv-a'] }, { key: 'glm-4.6', unpricedRequests: 2, unpricedTokens: 30, requests: 2, unpricedBy: ['pv-a', 'pv-b'] }, { key: '   ', unpricedRequests: 1, unpricedTokens: 5, requests: 1, unpricedBy: ['pv-a'] }, { key: 'unknown', unpricedRequests: 1, unpricedTokens: 5, requests: 1, unpricedBy: ['pv-a'] }, { key: 'old-hub', unpricedRequests: 1, unpricedTokens: 5, requests: 1 }] } };
      ok(JSON.stringify(W.unpricedModels(two)) === JSON.stringify([{ model: 'GLM-4.6', key: 'glm-4.6', acct: 'pv-a', tokens: null }, { model: 'glm-4.6', key: 'glm-4.6', acct: 'pv-b', tokens: null }]), '…ONE row per (key, provider account) — two spellings of one id write one key; a model two providers ran is a row for each, its tokens not split («—»); never an empty key nor the nameless «unknown» row, nor a row of an answer that names no account', W.unpricedModels(two));
      const MODELS6 = ['glm-4.6', 'glm-4.6-air', 'claude-sonnet-5', 'my-glm-4.6-fork'];
      ok(JSON.stringify(W.alsoPrices('glm-4.6', MODELS6, ['sonnet', 'opus'])) === JSON.stringify(['glm-4.6-air', 'my-glm-4.6-fork']) && JSON.stringify(W.alsoPrices('glm-4.6', MODELS6, ['sonnet'], ['glm-4.6-air'])) === JSON.stringify(['my-glm-4.6-fork']) && W.alsoPrices('glm-4.6', ['glm-4.6-pro-max'], ['glm-4.6-pro']).length === 0 && JSON.stringify(W.alsoPrices('glm-4.6', ['claude-glm-4.6-sonnet'], ['sonnet'])) === JSON.stringify(['claude-glm-4.6-sonnet']) && W.alsoPrices('', MODELS6, []).length === 0,
        'a new row says which OTHER models it would price too (the longest key a model contains wins): glm-4.6 also prices glm-4.6-air and my-glm-4.6-fork, unless one has its own (longer) row; never a model a LONGER key holds (glm-4.6-pro keeps glm-4.6-pro-max), while a shorter one loses it (sonnet loses claude-glm-4.6-sonnet — said); an empty key prices nothing here', W.alsoPrices('glm-4.6', MODELS6, ['sonnet', 'opus']));
      const sp = W.sumParts([{ cost: 1, requests: 2 }, { cost: 0.5, requests: 3, unpricedRequests: 3, unpricedTokens: 900 }, null]);
      ok(sp.cost === 1.5 && sp.requests === 5 && sp.unpricedRequests === 3 && sp.unpricedTokens === 900 && W.costWords(sp, tEn, fC, fN).text === '$1.50 + unknown', 'an «Other» slice adds its rows\' unknown parts too (sumParts) and reads «$1.50 + unknown»', sp);
      const ranked = [{ key: 'a', cost: 9, requests: 1 }, { key: 'b', cost: 8, requests: 1 }, { key: 'c', cost: 7, requests: 1 }, { key: 'pv', cost: 0, requests: 4, unpricedRequests: 4, unpricedTokens: 4e7 }];
      const kept = W.keepUnpriced(ranked, 2).map((r) => r.key), keptW = W.keepUnpriced(ranked.map((r) => ({ key: r.key, raw: r })), 2).map((r) => r.key);
      ok(JSON.stringify(kept) === JSON.stringify(['a', 'b', 'pv']) && JSON.stringify(keptW) === JSON.stringify(['a', 'b', 'pv']) && W.keepUnpriced(ranked, 2, 0).length === 2, 'a top-N cut keeps a row with an unknown part in view (it sorts as $0 — never dropped as the smallest bill), a usage row or a wrapper with `raw`', { kept, keptW });
      const CB = await import(path.join(ROOT, 'src/lib/chat-bar-words.js'));
      const pvAuth = { source: 'api-other', name: 'Example', provider: true, accountId: PV };
      const chipW = CB.costChipWords(0.47, CB.costBasisOf(pvAuth), tEn);
      console.log('    judged chip: ' + JSON.stringify(chipW));
      ok(CB.costBasisOf(pvAuth) === 'provider' && chipW.text === 'This chat · see Usage for its cost' && !/\$/.test(chipW.text + chipW.title) && !/unknown/i.test(chipW.text + chipW.title) && chipW.tone === 'unknown', 'the chat bar: a provider conversation\'s chip shows no figure (the agent program\'s table does not know the provider\'s prices) and points to Usage — words true before and after a price row is added (r1131 item 5: no «unknown»; the chip reads no ledger)', chipW);
      ok(CB.costBasisOf({ source: 'api-other' }) === 'api' && /\$0\.47/.test(CB.costChipWords(0.47, 'api', tEn).text), 'CONTROL: an API key\'s conversation keeps its figure («billed per use»)');
      // every word a person reads, in zh and ja through the real dictionaries
      const lits = (rel) => [...fs.readFileSync(path.join(ROOT, rel), 'utf8').matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
      const CBK = ['This chat · see Usage for its cost', "This conversation runs on a third-party provider's model. The agent's program prices it with its own table, which does not know this provider's prices, so its figure is not shown here. Usage prices this conversation's tokens with your price table — and says there which part has no price row yet."];
      const UWK = ['Third-party provider (billed by the provider)', 'Add a price — models with no price row', 'provider', 'This row also prices: {models}', '…and {n} more models with no price row — add these first, the rest show next', 'Add a price for {model}: enter all five rates — type 0 where the provider charges nothing',
        'The row for {model} would also price {models} — give each its own row (the same rates are fine)', '% off (applies once the model has a price)', 'Add a price for {model}: «{value}» is not a rate — enter a number from 0 up to {max} (USD per million tokens)',
        "These models of a third-party provider match no row, so their cost is unknown and every total leaves them out. Enter that provider's own rates (USD per million tokens): the row is that provider's only — the same model on another account keeps its own price — and it re-prices this model's past usage too, since costs are computed when they are read."];
      const NEW = [...lits('src/lib/usage-cost-words.js'), ...CBK, ...UWK];
      const missing = NEW.filter((k) => !zh[k] || !ja[k]);
      ok(NEW.length >= 17 && !missing.length, `every new word is in zh AND ja (${NEW.length} keys)`, missing);
      const uwLits = lits('src/lib/usage-window.js');
      ok(CBK.every((k) => lits('src/lib/chat-bar-words.js').includes(k)) && UWK.every((k) => uwLits.includes(k)), '…and those keys are the very t() literals of the chat bar and the Usage window', UWK.filter((k) => !uwLits.includes(k)));
      ok(/使用状況/.test(ja[CBK[0]]) && /使用状況/.test(ja[CBK[1]]) && !/使用量/.test(ja[CBK[1]]) && /提供方/.test(zh.provider), '…the ja chip names the window by its own name (使用状況), the zh badge says 提供方 like every provider word');
    }
    // THE WIRING (each surface asks the one rule / the one words module)
    {
      const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const UW = src('src/lib/usage-window.js'), UD = src('src/lib/usage-dashboard.js'), CSB = src('src/lib/chat-status-bar.js'), SRV = src('server.js'), UH = src('src/usage-history.js'), UIM = src('src/usage-index-model.js');
      const wires = {
        'usage-window imports the words': UW.includes("import { costWords, unpricedOf, unpricedModels, priceKeyOf, keepUnpriced, alsoPrices, rateProblem, pricesTornWords, pricesHeldOf, usageCsvLines, pricesHeldInLists } from './usage-cost-words.js';"),   // + pricesTornWords (r3145 unit 2: the prices' torn lift said at the window's head) + pricesHeldOf, usageCsvLines (its round's musts: the one held reading, the CSV's lines)
        'the cost tile': UW.includes("tile(t('Est. API-equivalent cost'), escHtml(fmtRowCost(T)),"),
        'every bar row': UW.includes("const valStr = metric === 'cost' ? escHtml(fmtRowCost(r)) : fmtNum(r.totalTokens);"),
        'the trend note': UW.includes("const cw = metricKey === 'cost' ? costOfRow(d.totals || {}) : null;"),
        'the footer': UW.includes('(costOfRow(d.totals || {}).note ?'),
        'the billing row': UW.includes("'provider': { label: () => t('Third-party provider (billed by the provider)')"),
        'Add a price': UW.includes('const unpriced = unpricedModels(state.data).filter(m => !Object.prototype.hasOwnProperty.call(pricing.accounts?.[m.acct]?.tiers || {}, m.key));'),
        'the row is the provider account\'s own': UW.includes('(w.tiers || (w.tiers = {}))[m.key] = Object.fromEntries(rec.inputs.map(([fk, el]) => [fk, Number(el.value)]));'),
        'a bad rate is refused on the page': UW.includes("if (rec.bad) { showToast(t('Add a price for {model}: «{value}» is not a rate"),
        'the CSV column only when unknown': src('src/lib/usage-cost-words.js').includes('const anyUnknown = unpricedOf((d && d.totals) || {}) !== null;') && src('src/lib/usage-cost-words.js').includes("'estCost', ...(anyUnknown ? ['unpricedTokens'] : [])") && UW.includes('  const lines = usageCsvLines(d, t);'),   // the lines moved into the PURE module (r3145 unit 2's round: usageCsvLines)   // stale-pins: kept (re-pointed: the CSV lines live in src/lib/usage-cost-words.js, read there)
        'the route says which rate': src('src/server/account-usage-routes.js').includes("require('../usage-history.js').pricesSaveAnswer(e)") && src('src/usage-history.js').includes('  : { status: 400, body: { error: e && e.message, ...(e && e.code ? { code: e.code } : {}) } });'),   // B-574d (r5013 (b)): the route answers through pricesSaveAnswer (a disk refusal 500, a refused rate 400 with its code)
        'a half row is refused': UW.includes("if (typed && typed < rec.inputs.length) { showToast(t('Add a price for {model}: enter all five rates"),
        'a row pricing another unpriced model is refused': UW.includes("const orphan = typed ? rec.also.filter("),
        'the five rates or nothing': UW.includes('if (w && typed.length === rec.inputs.length && !rec.bad) '),
        'the discount keeps the account\'s rows': UW.includes('if (Number.isFinite(v) && v > 0) w.discount = Math.min(0.99, v / 100); else delete w.discount;'),
        'the session table keeps it in view': UW.includes("const rows = state.metric === 'cost' ? keepUnpriced(d.groups.session, opts.limit || 12)"),
        'the grouped lists keep it in view': UW.includes("const list = metric === 'cost' ? keepUnpriced(rows, opts.limit || 10)"),
        'dashboard top-N keeps it': UD.includes("rows = first === 'cost' ? keepUnpriced(rows, panel.topN || 8)") && UD.includes("rows = m.key === 'cost' ? keepUnpriced(rows, panel.topN || 8)"),
        'dashboard tooltips word their row': (UD.match(/raws: rows\.map\(\(r\) => r\.raw \|\| null\)/g) || []).length === 2 && UD.includes("const raw = m.key === 'cost' && raws ? raws[ctx.dataIndex] : null;"),
        'the donut\'s Other adds the unknown part': UD.includes('const restRaw = sumParts(rows.slice(7).map((r) => r.raw));'),
        'the split\'s points and Other word their cells': UD.includes('raws: rows.map((r) => r.cells[k] || null),') && UD.includes('raws: rows.map((r) => sumParts(rest.map((k) => r.cells[k]))),'),
        'the journal only on the main thread': src('src/usage-history.js').includes('if (isMainThread) { const seen = this._pvWarned'),
        'no bare fmtCost on a row': !/fmtCost\((?:r|c|T)\.cost\)/.test(UW),
        'the dashboard note (both routes)': (UD.match(/unpricedNote\(card, data, mlist\);/g) || []).length === 2,
        'the chat chip colour': CSB.includes("cw.tone === 'unknown' ? tierOrange"),
        'the hub names a provider\'s record': SRV.includes("return p ? { type: 'provider', name: p.label || id } : null; }"),
        'the cells fold asks priceUnknown': UH.includes("if (tier === '_default' && this.priceUnknown(model, acct, tier)) { this._sayUnpriced(model, acct); return CELL_UNPRICED; }") && UH.includes('this.priceUnknown(ev.model, ev.acct) ? (this._sayUnpriced(ev.model, ev.acct), CELL_UNPRICED)'),   // B-360d unit 1: the shadow index retired — the window's cells fold asks the one rule (a cell and an edge row)
        'the index twin asks the one rule': UIM.includes("billing: isThirdPartyAccount(r.acct) ? 'provider' :"),
      };
      const bad = Object.entries(wires).filter(([, v]) => !v).map(([k]) => k);
      ok(!bad.length, `the wiring: ${Object.keys(wires).length} surfaces read the unknown part through the one rule and the one words module`, bad);
    }
  }
} finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skip} skipped)` : `\nALL PASS (${pass}${skip ? `, ${skip} skipped` : ''})`);
process.exit(fail ? 1 : 0);
