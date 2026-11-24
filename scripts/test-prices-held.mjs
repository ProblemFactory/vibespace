#!/usr/bin/env node
// test-prices-held — row B-f276's family, its third form, rank 5 (主开发 r3145 unit 2 + r3181, lane bl-ci): THE PERSON's EDITED
// PRICES. data/usage-history/pricing.json (the person's edited tier prices, per-account discounts and tier overrides) under the
// store-read law through src/store-read-hold.js. The release read ANY failure as «none», and the START ITSELF wrote the defaults
// back over the file. FAST, in-process; MADE-UP prices in a scratch data folder of each part's own; nothing outside it.
// THE REFUSAL IS PLACED: fs.readFileSync / fs.promises.readFile answer EIO for that ONE path (never a mount, never a mode change).
//   ① THE STORE: a failed read at the start writes NOTHING (the file byte for byte) and HOLDS (503 prices_unread): a save of the
//      prices is refused by name; the table the export reads is null (never the defaults passed off as the person's); a price row
//      shown to a person (the bulk resume's preview) is null — «not priced»; the roads no person reads as theirs keep pricing at
//      VibeSpace's defaults (r3181 (a)); a START while held holds again; the read again LIFTS with no restart and the person's
//      prices price at once; torn bytes are kept aside ONCE (0600), then the defaults are written as on a first start and the
//      copy is named.
//   ② THE ANCHORS (r3181 (1)): while held no NEW quota anchor is recorded (its cost since the last reading would be a dollar figure
//      at the defaults, stored for good); the anchors it has stand.
//   ③ THE DOORS: the prices editor's read and save, the usage answer, the config export and import say the hold by name (source
//      reads of the routes: their own code paths, each beside its leg below); the page words the hold and the torn lift (zh, ja).
//   ④ RED CONTROL: the store with its hold cut writes the defaults over the unread file at the start (the release's shape).
// At the release (the base of this row) the law's legs are RED: that is the harm, as the release has it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 500) : '')); } };
const RAW = fs.readFileSync;
const onDisk = (f) => { try { return RAW.call(fs, f, 'utf8'); } catch { return null; } };
const refuse = (file) => {
  const rf = fs.readFileSync, rp = fs.promises.readFile, eio = () => Object.assign(new Error(`EIO: i/o error, read '${path.basename(file)}' (placed)`), { code: 'EIO', errno: -5 });
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === file) throw eio(); return rf.call(fs, p, ...a); };
  fs.promises.readFile = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === file) return Promise.reject(eio()); return rp.call(fs.promises, p, ...a); };
  return () => { fs.readFileSync = rf; fs.promises.readFile = rp; };
};
const mutant = (rel, edits) => {
  const file = path.join(REPO, rel); let src = RAW.call(fs, file, 'utf8');
  for (const [a, b] of edits) { if (!src.includes(a)) return null; src = src.split(a).join(b); }
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports;
};
const codeOf = (fn) => { try { fn(); return null; } catch (e) { return { code: e && e.code, status: e && e.status, message: String((e && e.message) || '') }; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(20); } return !!fn(); };
const HOLD = require('../src/store-read-hold.js');
const CODE = 'prices_unread';
const UH = require('../src/usage-history.js');
const root = scratch('prices-held');
let n = 0;
const dirOf = (tag) => { const d = path.join(root, `${tag}-${++n}`); fs.mkdirSync(path.join(d, 'usage-history'), { recursive: true, mode: 0o700 }); return d; };
// MADE-UP edited prices: Opus at a person's own rate, a discount on a made-up API key account
const MINE = () => ({ version: 2, tiers: { ...UH.DEFAULT_PRICING, opus: { input: 1, output: 2, cacheWrite5m: 3, cacheWrite1h: 4, cacheRead: 0.25 } }, accounts: { 'made-up-key': { discount: 0.5 } } });
const plant = (d) => { const f = path.join(d, 'usage-history', 'pricing.json'); fs.writeFileSync(f, JSON.stringify(MINE(), null, 2), { mode: 0o600 }); return f; };
const make = (d, X = UH) => new X.UsageHistory({ dataDir: d, homeDir: d });
const EV = { model: 'claude-opus-4-8', acct: null, ts: Date.now(), i: 1e6, o: 0, cw5: 0, cw1: 0, cr: 0 };
const atDefault = UH.DEFAULT_PRICING.opus.input, atMine = MINE().tiers.opus.input;
const stopOf = (uh) => { try { uh && uh._pricingHold && uh._pricingHold.stop(); } catch { } };

console.log('① THE STORE: pricing.json held on a failed read — the start writes nothing over it');
{
  const d = dirOf('held'); const f = plant(d); const before = onDisk(f);
  const undo = refuse(f);
  const uh = make(d);
  ok(onDisk(f) === before, 'a failed read at the START writes nothing: the person\'s edited prices are byte for byte what they were (the release wrote the defaults over them here)', { same: onDisk(f) === before });
  const h = typeof uh.pricesHeld === 'function' ? uh.pricesHeld() : null;
  ok(!!h && h.file === 'pricing.json' && typeof uh.pricesWords === 'function' && /prices/.test(String(uh.pricesWords())), 'the prices HOLD (their facts, their words)', h);
  const save = codeOf(() => uh.setPricing({ accounts: { 'made-up-key': { discount: 0.1 } } }));
  ok(!!save && save.code === CODE && save.status === 503 && onDisk(f) === before, 'a save of the prices is refused BY NAME (503 prices_unread) and nothing is written', save);
  const table = typeof uh.pricingTable === 'function' ? uh.pricingTable() : 'none';
  ok(table === null, 'the table the config export reads is null while held — never the defaults passed off as the person\'s', table && Object.keys(table));
  ok(uh.priceRowFor('claude-opus-4-8') === null, 'a price row a person is SHOWN (the bulk resume\'s preview) is null while held — «not priced», never a default price as theirs', uh.priceRowFor('claude-opus-4-8'));
  const c = uh._cost(EV);
  ok(Math.abs(c - atDefault) < 1e-9, 'the roads no person reads as theirs (the live estimate, the pool) keep pricing at VibeSpace\'s default prices while held (r3181 (a))', { cost: c, atDefault });
  const uh2 = make(d);   // the first start's hold stays alive: it is the one the read again lifts below
  ok(onDisk(f) === before && typeof uh2.pricesHeld === 'function' && !!uh2.pricesHeld(), 'a START while held holds again — nothing written', { same: onDisk(f) === before });
  stopOf(uh2);
  undo();
  const lifted = await HOLD.readAgainOf('pricing.json');
  ok(lifted === true && !(uh.pricesHeld && uh.pricesHeld()) && Math.abs(uh._cost(EV) - atMine) < 1e-9 && uh.pricingTable() && uh.pricingTable().accounts['made-up-key'].discount === 0.5, 'the read again LIFTS with no restart: the person\'s prices price at once and the table is theirs again', { lifted, cost: uh._cost(EV) });
  let saved = null; try { uh.setPricing({ accounts: { 'made-up-key-2': { discount: 0.2 } } }); saved = JSON.parse(onDisk(f)); } catch (e) { saved = { error: e.code }; }
  ok(!!saved && saved.tiers && saved.tiers.opus.input === atMine && saved.accounts['made-up-key'].discount === 0.5 && saved.accounts['made-up-key-2'].discount === 0.2, 'the next save keeps every edited price and adds the new one', saved);
  stopOf(uh);
}
{
  const d = dirOf('torn'); const f = path.join(d, 'usage-history', 'pricing.json'); const TORN = '{"version":2,"tiers":{"opus":{"input":1';
  fs.writeFileSync(f, TORN, { mode: 0o600 });
  const uh = make(d);
  await until(() => typeof uh.pricesTorn === 'function' && !!uh.pricesTorn());
  const copies = fs.readdirSync(path.dirname(f)).filter((x) => x.startsWith('pricing.json.corrupt-'));
  const t1 = typeof uh.pricesTorn === 'function' ? uh.pricesTorn() : null;
  ok(copies.length === 1 && onDisk(path.join(path.dirname(f), copies[0])) === TORN && (fs.statSync(path.join(path.dirname(f), copies[0])).mode & 0o777) === 0o600 && !!t1 && t1.copy === copies[0], 'torn bytes are kept aside ONCE (the same bytes, 0600) and named', { copies, torn: t1 });
  let back = null; try { back = JSON.parse(onDisk(f)); } catch { back = null; }
  ok(!!back && back.tiers && back.tiers.opus.input === atDefault && Math.abs(uh._cost(EV) - atDefault) < 1e-9, 'then the defaults are written as on a first start (r3181: never held until the person sets prices)', back && back.tiers && back.tiers.opus);
  stopOf(uh);
}

console.log('② THE ANCHORS: no new quota anchor while the prices are held (its stored cost would be a default dollar figure)');
{
  const UE = require('../src/usage-estimator.js');
  let recorded = 0;
  const anchors = { lastAnchor: () => ({ fetchedAt: 1, source: 'statusline', fiveHour: { u: 10 } }), maybeRecord: () => { recorded++; return true; } };
  const estimator = { accountIdsFor: () => ['made-up-acct'], ratesFor: () => null, invalidate: () => { } };
  const group = { accountId: 'made-up-acct', accountIds: ['made-up-acct'], cache: { fetchedAt: 2, source: 'statusline', fiveHour: { utilization: 20, resetsAt: 9 } } };
  const run = (held) => { try { return UE.sweepAnchorGroup({ identityKey: 'acct:made-up-acct', group, anchors, estimator, costBetween: () => ({ total: 1, byFamily: {}, requests: 1 }), darkHosts: () => [], metric: () => { }, pricesHeld: () => held }); } catch (e) { return { error: String(e && e.message) }; } };
  const a = run(true);
  const r1 = recorded;
  const b = run(false);
  ok(r1 === 0 && !!a && a.recorded === false && a.held === true, 'while held the sweep records NO new anchor (the anchors it has stand) and says why', { a, recorded: r1 });
  ok(recorded === 1 && !!b && b.recorded === true, 'not held, the same sweep records its anchor as before', { b, recorded });
  const pool = onDisk(path.join(REPO, 'src/server/usage-pool-engine.js')) || '';
  ok(pool.includes('pricesHeld: () => !!(usageHistory && typeof usageHistory.pricesHeld === \'function\' && usageHistory.pricesHeld()),'), 'the pool engine\'s anchor sweep hands it the prices\' hold (the one recorder of anchors)');
}

console.log('③ THE DOORS: the editor, the usage answer, the export and the import say the hold');
{
  const routes = onDisk(path.join(REPO, 'src/server/account-usage-routes.js')) || '';
  const pers = onDisk(path.join(REPO, 'src/routes/persistence.js')) || '';
  ok(routes.includes("if (pricesHeldRefused(res)) return;") && (routes.match(/pricesHeldRefused\(res\)/g) || []).length >= 2 && routes.includes("const pf = usageHistory.pricesFacts ? usageHistory.pricesFacts() : null; if (pf) answer = { ...answer, prices: pf };"), 'the prices editor\'s read and save refuse BY NAME while held (503 prices_unread) and the usage answer carries the prices\' state (held / torn / lifted)');
  ok(/pricing: \(\(\) => \{\s*if \(getUsageHistory\?\.\(\)\?\.pricesHeld\?\.\(\)\) return \{ unread: true \};/.test(pers) && pers.includes("code: 'prices_unread'") && (pers.match(/getUsageHistory\?\.\(\)\?\.pricesHeld\?\.\(\)/g) || []).length >= 3, 'the config export\'s summary says the prices unread; the export and the import that name the prices are refused WHOLE by name before anything is written (a backup carrying the defaults would read as the person\'s)');
  const cw = onDisk(path.join(REPO, 'src/lib/usage-cost-words.js')) || '', utils = onDisk(path.join(REPO, 'src/lib/utils.js')) || '';
  const zh = onDisk(path.join(REPO, 'src/lib/i18n-zh.js')) || '', ja = onDisk(path.join(REPO, 'src/lib/i18n-ja.js')) || '';
  const keys = [...(cw + utils).matchAll(/t\("((?:VibeSpace cannot read your edited prices|Your prices file was damaged|prices not known)[^"]*)"/g)].map((m) => m[1]);
  ok(/prices_unread: \(\) => t\(/.test(utils) && /export function costWords\(r, t, fmtCost, fmtNum, \{ pricesHeld = false \} = \{\}\)/.test(cw) && keys.length >= 3 && keys.every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')) && !keys.some((k) => /restore/i.test(k)), 'the page words the hold (the family\'s ONE table: prices_unread), every cost while held reads «prices not known» (never a default figure as the person\'s), and the torn lift is said with where the bytes are kept — zh and ja; never «restore that copy»', keys);
}

console.log('④ RED CONTROL');
{
  const d = dirOf('control'); const f = plant(d); const before = onDisk(f);
  const undo = refuse(f);
  const X = mutant('src/usage-history.js', [["    const st = this._pricingHold.start(a0);\n", "    const st = a0.state === 'unreadable' ? 'missing' : this._pricingHold.start(a0);\n"]]);
  let uh = null; try { uh = X && make(d, X); } catch { uh = null; }
  ok(!!uh && onDisk(f) !== before && JSON.parse(onDisk(f)).tiers.opus.input === atDefault, 'CONTROL: with the hold cut, the start writes the defaults over the unread file — the person\'s edited prices gone (the release\'s shape)', { written: onDisk(f) !== before });
  stopOf(uh);
  undo();
}
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
