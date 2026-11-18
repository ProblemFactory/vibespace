#!/usr/bin/env node
// WHAT THE BULK RESUME WILL COST — SAID BEFORE THE CLICK (lane auto-resume-bulk, ADDENDUM 1, the owner 2026-10-23).
// Gate row `test-bulk-resume-cost`, fast, PURE + the ORCH gather over fakes. Every rule has a RED control: a patched
// copy of the real module (src/bulk-resume-cost.js imports nothing, so a copy in a scratch dir IS the module).
//   §1 windowRatio — tokens per 1 % from THIS window's records, counting cache writes + uncached input (the classes a
//      cold resume spends) and NOT cache reads; < MIN_PCT used or no counted token ⇒ no basis.  CONTROL: counting
//      cache reads makes the batch's share several times smaller (the understatement the rule exists to refuse)
//   §2 contextOf — the newest MAIN-thread request (subagents ignored), the status bar's own formula
//   §3 estimateBatch — the dollar SUM (the cache-WRITE price × cold tokens — input where the row has none — + the nominal output allowance), one line per member,
//      a member with no basis says so (never a made-up percent) while the dollars still show; no K cut (the owner's ruling
//      2026-11-18). CONTROL: the price read off the wrong field — a patched copy that turns a leg red
//   §4 the price ROW is the live table's (src/usage-history.js priceRowFor over DEFAULT_PRICING — no second table)
//   §5 the words, en + zh through the real dictionary («按本窗口实测 1 % ≈ 36 k tokens», «无法估算：本窗口还没有实测比例»,
//      «若现在全部恢复：≈ $… · ≈ 34 % 的 5 h 窗口», «全部恢复 (n)» — no «only the first K»: the owner's ruling 2026-11-18) + the zh/ja census
//   §6 the ORCH gather (src/server/bulk-resume-routes.js estimateFor) over a fake ledger / cache / sessions: a
//      conversation's context from ITS sid, a member's window from ITS acct since resetsAt − 5 h up to the reading,
//      an unresolved host bucket left out
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BC = require('../src/bulk-resume-cost.js');
let failed = 0, passed = 0;
const ok = (name, cond, extra) => {
  if (typeof name !== 'string') throw new Error('ok(name, cond): the name comes first — a swapped call');
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra !== undefined ? `\n    ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
};
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-bulk-cost-'));
let mutN = 0;
/** A patched copy of the real module (a needle that misses is an error, never a silently green control). */
function mutant(edits) {
  let src = read('src/bulk-resume-cost.js');
  for (const [from, to] of edits) { if (!src.includes(from)) return { err: 'needle missing: ' + from.slice(0, 60) }; src = src.split(from).join(to); }
  const f = path.join(tmp, `mut-${++mutN}.js`);
  fs.writeFileSync(f, src);
  return { mod: require(f) };
}
const OPUS = { label: 'opus', input: 5, output: 25, cacheWrite5m: 6.25, cacheRead: 0.5 };

// ── §1 THE RATIO ────────────────────────────────────────────────────────────
console.log('§1 windowRatio (this window\'s measured tokens per 1 %)');
const ROWS = [{ cw5: 200000, cw1: 40000, i: 120000, cr: 9000000, o: 30000 }];
{
  const r = BC.windowRatio({ rows: ROWS, pctNow: 10 });
  ok('1 % ≈ (cache writes + uncached input) ÷ % used: 360 k tokens / 10 % = 36 k', r && r.tokensPerPct === 36000 && r.tokens === 360000, r);
  ok('cache READS and output are NOT counted (the 5 h bucket weighs a read far below a write)', BC.windowRatio({ rows: [{ cr: 5e6, o: 1e5 }], pctNow: 10 }) === null);
  ok('a fresh window (< 1 % used) is no basis — never a ratio from noise', BC.windowRatio({ rows: ROWS, pctNow: 0.5 }) === null && BC.windowRatio({ rows: ROWS, pctNow: null }) === null);
  const m = mutant([['tokens += num(r.cw5) + num(r.cw1) + num(r.i);', 'tokens += num(r.cw5) + num(r.cw1) + num(r.i) + num(r.cr);']]);
  ok('CONTROL: the patch applies', !m.err, m.err);
  if (m.mod) {
    const real = BC.estimateBatch({ items: [{ id: 'a', at: 1, model: 'opus', contextTokens: 720000, member: { key: 'k' } }], priceOf: () => OPUS, members: { k: { pctNow: 10, ratio: BC.windowRatio({ rows: ROWS, pctNow: 10 }) } } });
    const bad = m.mod.estimateBatch({ items: [{ id: 'a', at: 1, model: 'opus', contextTokens: 720000, member: { key: 'k' } }], priceOf: () => OPUS, members: { k: { pctNow: 10, ratio: m.mod.windowRatio({ rows: ROWS, pctNow: 10 }) } } });
    ok('CONTROL: counting cache reads shrinks the batch\'s share ~26× (20 % → < 1 %) — the leg that pins the rule goes red under it', real.perMember[0].addPct === 20 && bad.perMember[0].addPct < 1, { real: real.perMember[0].addPct, bad: bad.perMember[0].addPct });
  }
}

// ── §2 CONTEXT ──────────────────────────────────────────────────────────────
console.log('§2 contextOf (the conversation\'s newest main-thread request)');
{
  const c = BC.contextOf([
    { ts: 100, origin: 'main', i: 10, cr: 500000, cw5: 1000, cw1: 0, model: 'claude-opus-5-5' },
    { ts: 300, origin: 'agent', i: 5, cr: 9e6, model: 'claude-haiku' },
    { ts: 200, origin: 'main', i: 20, cr: 610000, cw5: 2000, cw1: 0, model: 'claude-opus-5-5' },
  ]);
  ok('newest MAIN row wins (a subagent\'s later request is not the conversation\'s context)', c && c.ts === 200 && c.tokens === 612020 && c.model === 'claude-opus-5-5', c);
  ok('no main-thread row ⇒ unknown (null), never 0', BC.contextOf([{ ts: 1, origin: 'agent', i: 9 }]) === null && BC.contextOf([]) === null);
}

// ── §3 THE ESTIMATE ─────────────────────────────────────────────────────────
console.log('§3 estimateBatch (the sum, the members)');
const items = [
  { id: 'a', name: 'A', at: 10, model: 'claude-opus-5-5', contextTokens: 400000, member: { key: 'm1', name: 'Max A' } },
  { id: 'b', name: 'B', at: 30, model: 'claude-opus-5-5', contextTokens: 800000, member: { key: 'm1', name: 'Max A' } },
  { id: 'c', name: 'C', at: 20, model: 'claude-opus-5-5', contextTokens: 300000, member: { key: 'm2', name: 'Max B' } },
  { id: 'd', name: 'D', at: 40, model: 'claude-opus-5-5', contextTokens: null, member: { key: 'm3', name: 'Max C' } },
];
const members = { m1: { name: 'Max A', pctNow: 61, ratio: { tokensPerPct: 36000 } }, m2: { name: 'Max B', pctNow: 20, ratio: { tokensPerPct: 50000 } }, m3: { name: 'Max C', pctNow: null, ratio: null } };
const est = BC.estimateBatch({ items, priceOf: () => OPUS, members });
{
  const want = (1500000 * 6.25 + 4 * 2000 * 25) / 1e6;
  ok('DOLLARS = Σ cold tokens × the CACHE-WRITE price (what a cold resume is billed — the ledger prices it so) + the nominal output allowance per session', Math.abs(est.usd - want) < 1e-9 && est.coldTokens === 1500000 && est.outputAllowance === BC.OUTPUT_ALLOWANCE, { usd: est.usd, want });
  ok('an unknown context is counted as unknown (said), never guessed', est.unknownContext === 1);
  const m1 = est.perMember.find((m) => m.key === 'm1'), m2 = est.perMember.find((m) => m.key === 'm2'), m3 = est.perMember.find((m) => m.key === 'm3');
  ok('ONE line per member: Max A ≈ 33.3 % (1.2 M ÷ 36 k), 61 % ⇒ ~94.3 %', Math.abs(m1.addPct - 1200000 / 36000) < 1e-9 && Math.abs(m1.afterPct - (61 + 1200000 / 36000)) < 1e-9, m1);
  ok('…Max B ≈ 6 % (300 k ÷ 50 k), 20 % ⇒ 26 %', m2.addPct === 6 && m2.afterPct === 26, m2);
  ok('…Max C has NO basis: no percent at all (null), and it is listed as unconstrained', m3.addPct === null && m3.afterPct === null && est.unconstrained.includes('m3'), m3);
  ok('the order is EARLIEST STOP FIRST', est.order.join() === 'a,c,b,d', est.order);
  ok('an unpriced model costs 0 and is COUNTED as unpriced (said, never invented)', BC.estimateBatch({ items: items.slice(0, 1), priceOf: () => null, members }).unpriced === 1);
  const NOWRITE = { label: 'gpt', input: 2, output: 8, cacheRead: 0.2 };   // a vendor with no cache-write premium
  ok('a row with NO cache-write price is priced at its input rate', Math.abs(BC.estimateBatch({ items: items.slice(0, 1), priceOf: () => NOWRITE, members }).usd - (400000 * 2 + 2000 * 8) / 1e6) < 1e-9);
  ok('priceOf is asked per ITEM (its member\'s account and its context size choose the row)', (() => { const seen = []; BC.estimateBatch({ items: items.slice(0, 2), priceOf: (m, it) => { seen.push(it && it.member && it.member.key); return OPUS; }, members }); return seen.join() === 'm1,m1'; })());
  const mP = mutant([["const unit = row ? (num(row.cacheWrite5m) > 0 ? num(row.cacheWrite5m) : num(row.input)) : 0", 'const unit = row ? num(row.input) : 0']]);
  ok('CONTROL: the price patch applies', !mP.err, mP.err);
  if (mP.mod) ok('CONTROL: pricing the cold read at the INPUT rate (the branch\'s first form) turns the dollar leg red', Math.abs(mP.mod.estimateBatch({ items, priceOf: () => OPUS, members }).usd - want) > 1);
}

// ── §4 THE PRICE TABLE ──────────────────────────────────────────────────────
console.log('§4 the price row is the live table\'s (usage-history priceRowFor)');
{
  const { UsageHistory, DEFAULT_PRICING } = require('../src/usage-history.js');
  const uh = new UsageHistory({ dataDir: path.join(tmp, 'uh'), homeDir: tmp });
  const r = uh.priceRowFor('claude-opus-5-5');
  ok('claude-opus-5-5 ⇒ the table\'s own longest match (opus-5-5) and ITS input price', r.label === 'opus-5-5' && r.input === DEFAULT_PRICING['opus-5-5'].input && r.output === DEFAULT_PRICING['opus-5-5'].output, r);
  ok('an unknown model ⇒ the table\'s _default row (never a second table)', uh.priceRowFor('mystery-model').label === '_default');
  ok('the module holds NO price literal (the rows come in through priceOf)', !/\b(input|output)\s*:\s*\d/.test(read('src/bulk-resume-cost.js').replace(/^\s*\/\/.*$/gm, '')));
}

// ── §5 THE WORDS ────────────────────────────────────────────────────────────
console.log('§5 the words (en + zh through the real dictionary)');
const zh = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
const ja = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
const tZh = (s, p) => fill(zh[s] !== undefined ? zh[s] : s, p);
{
  const w = BC.costWords(est, null), z = BC.costWords(est, tZh);
  const usdW = est.usd >= 10 ? est.usd.toFixed(1) : est.usd.toFixed(2);
  ok('en dollars: «≈ $… at opus cache-write $6.25/M, 1.50 M cold tokens» (1.5 M × $6.25/M + 4 × 2000 × $25/M)', w.dollars === `≈ $${usdW} at opus cache-write $6.25/M, 1.50 M cold tokens`, w.dollars);
  ok('zh dollars name the cache-write price and the cold tokens', z.dollars === `≈ $${usdW}（按 opus 缓存写入价 $6.25/M，冷读 1.50 M tokens）`, z.dollars);
  ok('SEVERAL models ⇒ the sum alone (one model\'s price over a mixed sum is never named)', (() => { const mixed = BC.estimateBatch({ items: items.slice(0, 2), priceOf: (m, it) => (it.id === 'a' ? OPUS : { ...OPUS, label: 'sonnet' }), members }); return /^≈ \$[\d.]+ for 1\.20 M cold tokens$/.test(BC.costWords(mixed, null).dollars); })());
  ok('zh member line + its basis: «… 61 % ⇒ 之后约 94 %» / «按本窗口实测 1 % ≈ 36 k tokens»', /现在 61 % ⇒ 之后约 94 %/.test(z.members[0].line) && z.members[0].basis === '按本窗口实测 1 % ≈ 36 k tokens', z.members[0]);
  ok('zh no basis: «Max C：无法估算：本窗口还没有实测比例» — and no percent anywhere on that line', z.members[2].line === 'Max C：无法估算：本窗口还没有实测比例' && z.members[2].basis === null, z.members[2]);
  ok('zh passive line: «若现在全部恢复：≈ $… · ≈ 33 % 的 5 h 窗口» (the cache-write dollars, the largest member share)', z.passive === `若现在全部恢复：≈ $${usdW} · ≈ 33 % 的 5 h 窗口`, z.passive);
  ok('zh button: «全部恢复 (4)» — and no «only the first K» (the owner\'s ruling 2026-11-18: one press starts all N)', z.allButton === '全部恢复 (4)' && !('kButton' in z) && !('k' in est) && !('softBandPct' in est), z);
  ok('the machine\'s own login is NAMED in the person\'s words, never by its ledger key', BC.costWords(BC.estimateBatch({ items: [{ id: 'g', at: 1, model: 'opus', contextTokens: 1, member: { key: '__global__', name: '__global__' } }], priceOf: () => OPUS, members: {} }), tZh).members[0].line === '本机自己的登录：无法估算：本窗口还没有实测比例');
  ok('with no basis anywhere the passive line keeps the dollars and SAYS the share cannot be estimated', /cannot be estimated yet/.test(BC.costWords(BC.estimateBatch({ items: items.slice(3), priceOf: () => OPUS, members }), null).passive));
  ok('U2 cure: an item with no price is SAID («1 个会话的模型没有价格，未计入», the passive line «… · 1 个未定价») — never added as if it cost nothing in silence', (() => { const e = BC.estimateBatch({ items: items.slice(0, 2), priceOf: (m, it) => (it.id === 'a' ? OPUS : null), members }); const w = BC.costWords(e, tZh); return e.unpriced === 1 && w.unpriced === '1 个会话的模型没有价格，未计入' && / · 1 个未定价$/.test(w.passive); })(), JSON.stringify(BC.costWords(BC.estimateBatch({ items: items.slice(0, 2), priceOf: (m, it) => (it.id === 'a' ? OPUS : null), members }), tZh)));
  ok('U2 cure: every item priced ⇒ no such line', BC.costWords(BC.estimateBatch({ items: items.slice(0, 2), priceOf: () => OPUS, members }), null).unpriced === null);
  const miss = BC.WORD_KEYS.filter((k) => zh[k] === undefined || ja[k] === undefined);
  ok(`every word key (${BC.WORD_KEYS.length}) is in zh AND ja`, !miss.length, miss);
}

// ── §6 THE ORCH GATHER ──────────────────────────────────────────────────────
console.log('§6 the gather (bulk-resume-routes estimateFor over a fake ledger / cache / sessions)');
{
  const R = require('../src/server/bulk-resume-routes.js');
  const now = Date.now(), resetSec = Math.floor((now + 2 * 3600e3) / 1000), wStart = resetSec * 1000 - BC.FIVE_HOUR_MS;
  const events = [
    { ts: now - 60e3, sid: 'conv-a', origin: 'main', acct: 'm1', be: 'claude', model: 'claude-opus-5-5', i: 1000, cr: 399000, cw5: 0, cw1: 0 },
    { ts: now - 30e3, sid: 'conv-a', origin: 'agent', acct: 'm1', be: 'claude', model: 'claude-haiku', i: 5, cr: 9e6 },
    { ts: wStart + 60e3, sid: 'other', origin: 'main', acct: 'm1', be: 'claude', i: 100000, cw5: 260000, cr: 4e6 },
    { ts: wStart - 60e3, sid: 'other', origin: 'main', acct: 'm1', be: 'claude', i: 999999, cw5: 999999 },               // before the window
    { ts: wStart + 120e3, sid: 'other', origin: 'main', acct: 'm1', be: 'claude', host: 'h1', atype: 'host', cw5: 999999 }, // an unresolved host bucket
    { ts: wStart + 180e3, sid: 'x', origin: 'main', acct: 'm2', be: 'claude', cw5: 777777 },                            // another member
  ];
  const uh = { _events: function* (from, to) { for (const e of events) if (e.ts >= from && e.ts <= to) yield e; }, priceRowFor: () => OPUS };
  const sessions = new Map([['w-a', { claudeSessionId: 'conv-a', name: 'A' }]]);
  const rt = R.create({ activeSessions: sessions, getUsageHistory: () => uh, readCacheFor: (k) => (k === 'm1' ? { fiveHour: { utilization: 0.1, resetsAt: resetSec }, fetchedAt: now } : null), sessionModelFor: () => null });
  const e = rt.estimateFor([{ id: 'w-a', name: 'A', at: 1, identity: { key: 'm1', name: 'Max A' } }], now);
  ok('the conversation\'s context = ITS newest main request (400 k), its model the ledger\'s', e && e.coldTokens === 400000 && e.perModel[0].model === 'opus', e && { cold: e.coldTokens, m: e.perModel });
  ok('the member\'s ratio = ITS window rows only (after resetsAt − 5 h, no host bucket, no other member — its own conversations\' requests, subagents too, ARE in it): (360 000 + 1 000 + 5) / 10 %', e && e.perMember[0].basis && e.perMember[0].basis.tokensPerPct === 36100.5 && e.perMember[0].pctNow === 10, e && e.perMember[0]);
}

console.log(`\n${failed ? 'FAILED' : 'ALL PASS'} (${passed} passed, ${failed} failed)`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
