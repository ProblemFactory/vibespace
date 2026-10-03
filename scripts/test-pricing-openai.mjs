#!/usr/bin/env node
// test-pricing-openai — every gpt-* row of the ledger's price table is judged
// against a DATED copy of OpenAI's official table (scripts/fixtures/openai-pricing.json,
// raw HTML of developers.openai.com/api/docs/pricing + the model pages, fetched
// 2026-10-03T04:38Z). test-pricing-tiers has done this for the Claude rows since
// 2.369.x; nothing judged the OpenAI rows, and the price check of 2026-10-02
// (wf_d2b3907b-2c5) found them weeks stale with nothing red: gpt-6-astra had no
// row at all (Sonnet's $3/$15 via `_default` — ≈ $13K under on the author's
// instance), gpt-5.6-sol missed its 2026-08-21 cut and the >272K rule, terra /
// luna kept their launch prices, four old codex models fell to `_default`.
//   §1 the JUDGE: each fixture model resolves to a row whose short, long and
//      dated rates equal the official ones; every gpt-* row is judged by some
//      fixture model. CONTROL: a planted wrong price is the one mismatch found.
//   §2 the CLOSED SHAPE (PRICE_ROW_FIELDS) of every shipped row; CONTROL: a typo key.
//   §3 the long-context rule prices the WHOLE request, decided on the request's
//      prompt — split parts still add up; CONTROL: a part priced alone.
//   §4 the dated rate: gpt-5.6-sol before / after the cut; no ts = now.
//   §5 a per-account discount scales the long + dated rates; an override row is flat.
//   §6 an untouched old shipped row on disk takes the new default; an edited one stays.
//   §7 an unpriced codex id warns ONCE (journal + Diagnostics event); claude ids do not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { UsageHistory, DEFAULT_PRICING, PRICE_ROW_FIELDS, priceAt } = require(path.join(ROOT, 'src/usage-history.js'));
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/openai-pricing.json'), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const dirs = [];
const mk = (pricing) => {
  const d = scratch('pricing-openai'); dirs.push(d);
  fs.mkdirSync(path.join(d, 'usage-history'), { recursive: true });
  if (pricing) fs.writeFileSync(path.join(d, 'usage-history', 'pricing.json'), JSON.stringify(pricing));
  return new UsageHistory({ dataDir: d, homeDir: d });
};
const RATES = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead'];
const near = (a, b) => Math.abs(a - b) < 1e-9;

// THE JUDGE — pure: (tiers, fixture) → mismatches. Effective rates through
// priceAt, so it judges what the cost function charges, not a field spelling.
function judge(tiers, fx) {
  const out = [];
  const keys = Object.keys(tiers).filter((k) => k !== '_default').sort((a, b) => b.length - a.length);
  const tierOf = (id) => keys.find((k) => id.toLowerCase().includes(k)) || '_default';
  const want = (m, L) => ({ input: (L || m).input, output: (L || m).output, cacheRead: (L || m).cached, cacheWrite5m: (L && L.cacheWrite != null ? L.cacheWrite : m.cacheWrite) ?? 0, cacheWrite1h: 0 });
  const cmp = (id, what, got, exp) => { for (const k of RATES) if (!near(got[k], exp[k])) out.push({ id, what, field: k, ours: got[k], official: exp[k] }); };
  const judged = new Set();
  const now = Date.parse(FX.fetchedAt);
  for (const [id, m] of Object.entries(fx.models)) {
    const key = tierOf(id); judged.add(key);
    if (key === '_default') { out.push({ id, what: 'no row (falls to _default)' }); continue; }
    const row = tiers[key];
    cmp(id, 'short', priceAt(row, now, 1000), want(m));
    cmp(id, 'long', priceAt(row, now, 400000), m.long ? want(m, m.long) : want(m));
    if (m.long) { cmp(id, 'at the threshold', priceAt(row, now, m.long.above), want(m)); if (!row.long || row.long.above !== m.long.above) out.push({ id, what: 'long.above', ours: row.long?.above, official: m.long.above }); }
    const dated = fx.dated[id] || [];
    if ((row.earlier || []).length !== dated.length) out.push({ id, what: 'dated entries', ours: (row.earlier || []).length, official: dated.length });
    for (const e of dated) {
      const before = Date.parse(e.until) - 1;
      cmp(id, `before ${e.until} short`, priceAt(row, before, 1000), want(e));
      cmp(id, `before ${e.until} long`, priceAt(row, before, 400000), e.long ? want(e, e.long) : want(e));
    }
  }
  for (const k of keys) if (/^gpt-/.test(k) && !judged.has(k)) out.push({ id: k, what: 'row judged by no official model' });
  return out;
}

try {
  // ── §1 ──
  console.log(`§1 every gpt-* row = the official table fetched ${FX.fetchedAt}`);
  const uh = mk();
  const T = uh._pricing.tiers;
  const bad = judge(T, FX);
  ok(bad.length === 0, `all ${Object.keys(FX.models).length} official models price exactly as the table (short, >272K, before each dated change); every gpt-* row judged`, bad.slice(0, 6));
  for (const id of ['gpt-6-astra', 'gpt-5.1-codex-max', 'gpt-5-codex', 'gpt-5.2-codex', 'gpt-5.3-codex']) ok(uh._tier(id) !== '_default', `${id} has a row (→ \`${uh._tier(id)}\`), never Sonnet's \`_default\``);
  ok(uh._tier('gpt-5.1-codex-max') === 'gpt-5.1-codex' && uh._tier('gpt-5-codex') === 'gpt-5-codex' && uh._tier('gpt-5.6-luna') === 'gpt-5.6-luna' && uh._tier('gpt-6-luna') === 'gpt-6-luna', 'longest key: -max shares gpt-5.1-codex; gpt-5-codex / gpt-6-luna are not swallowed by a neighbour');
  {
    const planted = JSON.parse(JSON.stringify(DEFAULT_PRICING));
    planted['gpt-6-astra'].long.output = 50; // the classic slip: the short rate copied into the long block
    const got = judge(planted, FX);
    ok(got.length === 1 && got[0].id === 'gpt-6-astra' && got[0].what === 'long' && got[0].field === 'output', 'CONTROL: a planted wrong price (astra long output $50 for $75) is the ONE mismatch the judge reports', got);
    const missing = JSON.parse(JSON.stringify(DEFAULT_PRICING)); delete missing['gpt-6-astra'];
    ok(judge(missing, FX).some((x) => x.id === 'gpt-6-astra' && /_default/.test(x.what)), 'CONTROL: the base table\'s miss (no astra row) is reported as a fall to _default');
    const extra = { ...JSON.parse(JSON.stringify(DEFAULT_PRICING)), 'gpt-9-test': { input: 1, output: 1, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.1 } };
    ok(judge(extra, FX).some((x) => x.id === 'gpt-9-test'), 'CONTROL: a gpt-* row no official model judges is reported (a new row must arrive with its fixture line)');
  }

  // ── §2 ──
  console.log('§2 the closed row shape');
  const shapeErrs = (rows) => {
    const e = [];
    for (const [k, r] of Object.entries(rows)) {
      for (const f of Object.keys(r)) if (!PRICE_ROW_FIELDS.row.includes(f)) e.push(`${k}.${f}`);
      for (const f of RATES) if (typeof r[f] !== 'number' || !(r[f] >= 0)) e.push(`${k}.${f} not a rate`);
      const longOk = (L, where) => { if (!L) return; for (const f of Object.keys(L)) if (!PRICE_ROW_FIELDS.long.includes(f)) e.push(`${where}.long.${f}`); if (!(L.above > 0)) e.push(`${where}.long.above`); };
      longOk(r.long, k);
      if (r.earlier !== undefined) {
        if (!Array.isArray(r.earlier)) e.push(`${k}.earlier not a list`);
        let prev = -Infinity;
        for (const [i, x] of (r.earlier || []).entries()) {
          for (const f of Object.keys(x)) if (!PRICE_ROW_FIELDS.earlier.includes(f)) e.push(`${k}.earlier[${i}].${f}`);
          const t = Date.parse(x.until); if (!(t > prev)) e.push(`${k}.earlier[${i}].until not ascending / unparseable`); prev = t;
          longOk(x.long, `${k}.earlier[${i}]`);
        }
      }
    }
    return e;
  };
  ok(shapeErrs(DEFAULT_PRICING).length === 0, `every shipped row (${Object.keys(DEFAULT_PRICING).length}) uses only the closed fields`, shapeErrs(DEFAULT_PRICING));
  const typo = JSON.parse(JSON.stringify(DEFAULT_PRICING)); typo['gpt-5.5'].lnog = typo['gpt-5.5'].long; delete typo['gpt-5.5'].long;
  typo['gpt-5.6-sol'].earlier[0].until = 'soon';
  const te = shapeErrs(typo);
  ok(te.includes('gpt-5.5.lnog') && te.some((x) => /gpt-5\.6-sol\.earlier\[0\]\.until/.test(x)), 'CONTROL: a misspelt block (`lnog`, silently flat) and an unparseable `until` are named', te);

  // ── §3 ──
  console.log('§3 >272K prices the whole request, decided on the request');
  const ev = (o) => ({ be: 'codex', model: 'gpt-6-astra', acct: null, ts: Date.parse('2026-09-20T00:00:00Z'), i: 0, o: 0, cw5: 0, cw1: 0, cr: 0, ...o });
  const big = ev({ i: 10000, cr: 300000, o: 1000 });
  ok(near(uh._cost(big), (10000 * 20 + 300000 * 2 + 1000 * 75) / 1e6), 'i 10K + cached 300K > 272K: every token at the long rates ($20 / $2 / $75)', uh._cost(big));
  const edge = ev({ i: 2000, cr: 270000, o: 1000 });
  ok(near(uh._cost(edge), (2000 * 10 + 270000 * 1 + 1000 * 50) / 1e6), 'exactly 272,000 prompt tokens is NOT over: short rates', uh._cost(edge));
  const whole = big.i + big.cr;
  const parts = uh._cost({ ...big, i: 0, o: 0, cr: 0 }, whole) + uh._cost({ ...big, i: 0, o: 0, cw5: 0, cw1: 0 }, whole) + uh._cost({ ...big, cr: 0 }, whole);
  ok(near(parts, uh._cost(big)), 'the token-class split (cw / cr / rest) priced with the WHOLE prompt adds up to the request', [parts, uh._cost(big)]);
  const mixed = ev({ i: 100000, cr: 200000, o: 0 });
  ok(near(uh._cost({ ...mixed, i: 0 }), 200000 * 1 / 1e6) && near(uh._cost({ ...mixed, i: 0 }, 300000), 200000 * 2 / 1e6), 'CONTROL: the 200K cached part of a 300K request priced ALONE takes the SHORT rate ($1) — with the request\'s prompt the long one ($2): the reason _cost takes `prompt`');
  ok(near(uh._cost({ ...big, model: 'gpt-5.4-mini' }), (10000 * 0.75 + 300000 * 0.075 + 1000 * 4.5) / 1e6), 'a row without `long` stays flat at any size');

  // ── §4 ──
  console.log('§4 gpt-5.6-sol: the 2026-08-21 cut is a dated rate');
  const sol = (ts, o) => uh._cost({ ...ev({ model: 'gpt-5.6-sol', ts }), ...o });
  const short = { i: 1000, cr: 9000, o: 100 }, long = { i: 1000, cr: 300000, o: 100 };
  ok(near(sol(Date.parse('2026-08-20T23:59:59Z'), short), (1000 * 5 + 9000 * 0.5 + 100 * 30) / 1e6), 'a row from 2026-08-20 keeps the old $5 / $0.50 / $30');
  ok(near(sol(Date.parse('2026-08-21T00:00:00Z'), short), (1000 * 4 + 9000 * 0.4 + 100 * 20) / 1e6), 'from 2026-08-21 00:00 UTC: $4 / $0.40 / $20');
  ok(near(sol(Date.parse('2026-08-01T00:00:00Z'), long), (1000 * 10 + 300000 * 1 + 100 * 45) / 1e6) && near(sol(Date.parse('2026-09-01T00:00:00Z'), long), (1000 * 8 + 300000 * 0.8 + 100 * 30) / 1e6), 'long requests: $10 / $1 / $45 before the cut, $8 / $0.80 / $30 after');
  ok(near(uh._cost({ ...ev({ model: 'gpt-5.6-sol' }), ...short, ts: undefined }), (1000 * 4 + 9000 * 0.4 + 100 * 20) / 1e6), 'no ts (the live stdout paths) = now = the current price');
  ok(near(uh._cost({ ...big, ts: Date.parse('2026-01-01T00:00:00Z') }), uh._cost(big)), 'a row without `earlier` is the same at any date');

  // ── §5 ──
  console.log('§5 per-account pricing over the new shapes');
  const uhD = mk({ version: 2, tiers: {}, accounts: { 'acct-d': { discount: 0.5 }, 'acct-o': { tiers: { 'gpt-6-astra': { input: 1, output: 2, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.1 } } } } });
  ok(near(uhD._cost({ ...big, acct: 'acct-d' }), uh._cost(big) / 2), 'a 50 % discount halves the LONG rate (the discount scales whichever rate applies)');
  ok(near(uhD._cost({ ...ev({ model: 'gpt-5.6-sol', ts: Date.parse('2026-08-01T00:00:00Z') }), ...short, acct: 'acct-d' }), sol(Date.parse('2026-08-01T00:00:00Z'), short) / 2), '…and the DATED pre-cut rate');
  ok(near(uhD._cost({ ...big, acct: 'acct-o' }), (10000 * 1 + 300000 * 0.1 + 1000 * 2) / 1e6), 'an account\'s own override row without `long` is flat — never the shipped row\'s long block');

  // ── §6 ──
  console.log('§6 an untouched old shipped row on disk takes the corrected default');
  const OLD = { 'gpt-5.6-sol': { input: 5, output: 30, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.5 }, 'gpt-5.6-luna': { input: 1, output: 6, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.1 }, 'gpt-5.6-terra': { input: 3, output: 15, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0.25 } };
  const uhS = mk({ version: 2, tiers: OLD, accounts: {} });
  ok(uhS._pricing.tiers['gpt-5.6-sol'] === DEFAULT_PRICING['gpt-5.6-sol'] && uhS._pricing.tiers['gpt-5.6-luna'] === DEFAULT_PRICING['gpt-5.6-luna'], 'a stored row EQUAL to the old shipped value (the editor saves every row) is replaced by the new default');
  ok(uhS._pricing.tiers['gpt-5.6-terra'].input === 3 && !uhS._pricing.tiers['gpt-5.6-terra'].long, 'an EDITED row (terra input $3) is left exactly as the owner set it');
  ok(uhS._pricing.tiers['gpt-6-astra'] === DEFAULT_PRICING['gpt-6-astra'], 'a new key fills in as before');

  // ── §7 ──
  console.log('§7 an unpriced codex id warns once — never silently Sonnet');
  const warns = [], events = [];
  const ow = console.warn; const oe = global.__vsEvent;
  console.warn = (m) => warns.push(String(m)); global.__vsEvent = (n, d) => events.push([n, d]);
  try {
    const uhW = mk();
    uhW._cost(ev({ model: 'gpt-7-nova', i: 10 })); uhW._cost(ev({ model: 'gpt-7-nova', i: 20 })); uhW._cost(ev({ model: 'GPT-7-NOVA', i: 5 }));
    uhW._cost(ev({ model: 'gpt-6-astra', i: 10 })); uhW._cost({ ...ev({ i: 10 }), be: 'claude', model: 'claude-zz-9' });
    ok(warns.length === 1 && /gpt-7-nova/.test(warns[0]) && /_default/.test(warns[0]), 'ONE journal line for the unknown codex id across three events', warns);
    ok(events.length === 1 && events[0][0] === 'usage-unpriced-model' && events[0][1] === 'codex:gpt-7-nova', 'ONE Diagnostics event (usage-unpriced-model, codex:<id>)', events);
    uhW._cost(ev({ model: null, i: 1 })); uhW._cost(ev({ model: null, i: 2 }));
    ok(warns.length === 2 && /no model id/.test(warns[1]), 'a codex row with NO model id is named once too', warns);
    mk()._cost(ev({ model: 'gpt-7-nova', i: 7 })); // a second instance in the same process (a migration builds one)
    ok(warns.length === 2, 'once per id per PROCESS: a second UsageHistory does not name gpt-7-nova again (verify r1)', warns);
  } finally { console.warn = ow; global.__vsEvent = oe; }
} finally { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
