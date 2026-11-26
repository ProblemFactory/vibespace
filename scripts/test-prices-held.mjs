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
//      prices price at once; torn bytes are kept aside ONCE (0600), then the defaults price from memory and the copy is named.
//      THE LIFT WRITES NOTHING (round wf_b6ee29e5 must 5): no fs.writeFileSync / renameSync of pricing.json at any lift (the
//      person's table, a file gone, torn bytes) — the next save writes it.
//   ② THE ANCHORS (r3181 (1)): while held no NEW quota anchor is recorded (its cost since the last reading would be a dollar figure
//      at the defaults, stored for good); the anchors it has stand.
//   ③ THE DOORS: the prices editor's read and save, the usage answer, the config export and import say the hold by name (source
//      reads of the routes: their own code paths, each beside its leg below); the page words the hold and the torn lift (zh, ja).
//      THE PAGE (round wf_b6ee29e5 musts 1–4), BY BEHAVIOUR over the PURE module (src/lib/usage-cost-words.js): a cost held reads
//      «prices not known»; the CSV's lines while held carry no dollar cell and say it; the one held reading of the answer. PINS on
//      every wire of the window and the dashboard (the editor, the trend, the bars, the export, the save toast, the head notice).
//      The estimator writes no fit to rates.json while held; the export dialog's held row.
//   ⑤ THE FOLLOW (主开发 r3837 + r4125): the prices are asked after their hold has SETTLED ONCE (never on a word of the helper's): a torn
//      READ of a whole file → the person's prices, a torn FILE → the defaults by the helper's own lift (the backfill's pass finishes), a
//      file that cannot be read → held; the estimator writes nothing meanwhile; the old word test's red control;
//      the page FOLLOWS the hold — the family's REAL list (src/server/held-lists.js) read by the page's pure predicate while held and
//      after the lift, a copy reading a field the hub's rows lack red; pins: the window's listener, the ranking by tokens, the typed note.
//   ④ RED CONTROLS: the store with its hold cut writes the defaults over the unread file at the start (the release's shape); the
//      pure module with its held branch cut (costWords, the CSV) is red by name.
// At the release (the base of this row) the law's legs are RED: that is the harm, as the release has it.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const Module = require('node:module');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 500) : '')); } };
const RAW = fs.readFileSync;
// r3748 must 5: every SYNC write of a pricing.json (or its .tmp) is counted — a lift must add none
const SYNC_W = []; { const wf = fs.writeFileSync, rn = fs.renameSync; fs.writeFileSync = function (f, ...a) { if (typeof f === 'string' && /pricing\.json(\.tmp)?$/.test(f)) SYNC_W.push(f); return wf.call(fs, f, ...a); }; fs.renameSync = function (a1, b1) { if (typeof b1 === 'string' && /pricing\.json$/.test(b1)) SYNC_W.push(b1); return rn.call(fs, a1, b1); }; }
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
  const w0 = SYNC_W.length;
  const lifted = await HOLD.readAgainOf('pricing.json');
  const liftWrites = SYNC_W.length - w0;
  ok(lifted === true && !(uh.pricesHeld && uh.pricesHeld()) && Math.abs(uh._cost(EV) - atMine) < 1e-9 && uh.pricingTable() && uh.pricingTable().accounts['made-up-key'].discount === 0.5, 'the read again LIFTS with no restart: the person\'s prices price at once and the table is theirs again', { lifted, cost: uh._cost(EV) });
  ok(liftWrites === 0 && onDisk(f) === before, 'the lift WRITES NOTHING on the loop (no sync write of pricing.json; the file byte for byte) — r3748 must 5', { liftWrites });
  let saved = null; try { uh.setPricing({ accounts: { 'made-up-key-2': { discount: 0.2 } } }); saved = JSON.parse(onDisk(f)); } catch (e) { saved = { error: e.code }; }
  ok(!!saved && saved.tiers && saved.tiers.opus.input === atMine && saved.accounts['made-up-key'].discount === 0.5 && saved.accounts['made-up-key-2'].discount === 0.2, 'the next save keeps every edited price and adds the new one', saved);
  stopOf(uh);
}
{
  const d = dirOf('torn'); const f = path.join(d, 'usage-history', 'pricing.json'); const TORN = '{"version":2,"tiers":{"opus":{"input":1';
  fs.writeFileSync(f, TORN, { mode: 0o600 });
  const w0 = SYNC_W.length;
  const uh = make(d);
  await until(() => typeof uh.pricesTorn === 'function' && !!uh.pricesTorn());
  const copies = fs.readdirSync(path.dirname(f)).filter((x) => x.startsWith('pricing.json.corrupt-'));
  const t1 = typeof uh.pricesTorn === 'function' ? uh.pricesTorn() : null;
  ok(copies.length === 1 && onDisk(path.join(path.dirname(f), copies[0])) === TORN && (fs.statSync(path.join(path.dirname(f), copies[0])).mode & 0o777) === 0o600 && !!t1 && t1.copy === copies[0], 'torn bytes are kept aside ONCE (the same bytes, 0600) and named', { copies, torn: t1 });
  ok(!(uh.pricesHeld && uh.pricesHeld()) && Math.abs(uh._cost(EV) - atDefault) < 1e-9 && SYNC_W.length === w0 && onDisk(f) === TORN, 'then the defaults price from memory (r3181: never held until the person sets prices) and the lift writes NOTHING (r3748 must 5: the torn bytes stay the file until the next save)', { syncWrites: SYNC_W.length - w0, file: onDisk(f) === TORN ? 'the torn bytes' : 'changed' });
  let saved = null; try { uh.setPricing({ accounts: { 'made-up-key': { discount: 0.5 } } }); saved = JSON.parse(onDisk(f)); } catch (e) { saved = { error: e.code }; }
  ok(!!saved && saved.tiers && saved.tiers.opus.input === atDefault && saved.accounts['made-up-key'].discount === 0.5, 'the person\'s next save writes the whole file (the defaults with their edit)', saved && saved.accounts);
  stopOf(uh);
}
{
  // a file GONE while held: the read again meets «not there» twice and lifts at the defaults — nothing written; the next start writes
  // the first-start file (the constructor's own road, as the release)
  const d = dirOf('gone'); const f = plant(d);
  const undo = refuse(f);
  const uh = make(d);
  undo(); fs.unlinkSync(f);
  const w0 = SYNC_W.length;
  const first = await HOLD.readAgainOf('pricing.json'); const second = first || await HOLD.readAgainOf('pricing.json');
  ok(second === true && !(uh.pricesHeld && uh.pricesHeld()) && SYNC_W.length === w0 && onDisk(f) === null && Math.abs(uh._cost(EV) - atDefault) < 1e-9, 'a file gone while held lifts at the defaults after «not there» twice — and the lift writes NOTHING (r3748 must 5)', { first, second, syncWrites: SYNC_W.length - w0, file: onDisk(f) });
  stopOf(uh);
  const uh2 = make(d);
  let fresh = null; try { fresh = JSON.parse(onDisk(f)); } catch { fresh = null; }
  ok(!!fresh && fresh.tiers && fresh.tiers.opus.input === atDefault, 'the next start writes the first-start file (the constructor, as the release)', fresh && fresh.tiers && fresh.tiers.opus);
  stopOf(uh2);
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

console.log('③b THE PAGE (round wf_b6ee29e5 musts 1–4): the held branch BY BEHAVIOUR over the PURE module, and a pin on every wire');
const CW_FILE = path.join(REPO, 'src/lib/usage-cost-words.js');
const tE = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? String(v[k]) : `{${k}}`));
const fC = (n) => '$' + Number(n).toFixed(2), fN = (n) => String(n);
const HELD_ANSWER = { prices: { held: { file: 'pricing.json', code: 'EIO', since: 1 }, torn: null, lifted: null }, totals: { cost: 12.3, requests: 2 }, groups: { model: [{ key: 'claude-opus-4-8', name: '', type: '', requests: 2, sessions: 1, input: 10, cacheWrite: 0, cacheRead: 0, output: 5, totalTokens: 15, cost: 12.3 }] } };
const FREE_ANSWER = { ...HELD_ANSWER, prices: null };
const RELEASE_HEAD = 'dimension,key,name,type,requests,sessions,input,cacheWrite,cacheRead,output,totalTokens,estCost';
const pageLaw = (W) => {
  const out = {};
  try {
    out.heldCost = W.costWords({ cost: 12.3, requests: 2 }, tE, fC, fN, { pricesHeld: true }).text;
    out.freeCost = W.costWords({ cost: 12.3, requests: 2 }, tE, fC, fN).text;
    out.heldOf = [W.pricesHeldOf(HELD_ANSWER), W.pricesHeldOf(FREE_ANSWER), W.pricesHeldOf({ prices: { held: null, torn: { copy: 'x' } } }), W.pricesHeldOf(null)];
    out.heldCsv = W.usageCsvLines(HELD_ANSWER, tE); out.freeCsv = W.usageCsvLines(FREE_ANSWER, tE);
  } catch (e) { out.error = String(e && e.message); }
  out.ok = {
    cost: out.heldCost === 'prices not known' && /12\.30/.test(String(out.freeCost)),
    heldOf: JSON.stringify(out.heldOf) === '[true,false,false,false]',
    csvHeld: !!out.heldCsv && out.heldCsv[0] === RELEASE_HEAD + ',prices' && out.heldCsv.slice(1).every((l) => l.split(',')[11] === '' && l.endsWith(',prices not known')) && !out.heldCsv.some((l) => /12\.3/.test(l)),
    csvFree: !!out.freeCsv && out.freeCsv[0] === RELEASE_HEAD && out.freeCsv[1].split(',')[11] === '12.3000',
  };
  return out;
};
const importCopy = async (src, tag) => { const f = path.join(root, `cw-${tag}.mjs`); fs.writeFileSync(f, src); return import(pathToFileURL(f).href); };
{
  const W = await import(pathToFileURL(CW_FILE).href);
  const law = pageLaw(W);
  ok(law.ok.cost, 'BEHAVIOUR: a cost while held reads «prices not known»; without the option the same row is its figure', { held: law.heldCost, free: law.freeCost });
  ok(law.ok.heldOf, 'BEHAVIOUR: the ONE held reading of the answer (pricesHeldOf): held only by `prices.held` — a torn lift or no facts is not held', law.heldOf);
  ok(law.ok.csvHeld, 'BEHAVIOUR (must 1): the CSV while held has NO dollar cell — every estCost empty, a `prices` column says «prices not known» on each row; its tokens stay', law.heldCsv);
  ok(law.ok.csvFree, 'BEHAVIOUR: not held, the CSV is the release\'s file exactly (its header, its estCost figure)', law.freeCsv);
  // RED CONTROLS over copies of the pure module: each held branch cut is red by name
  const src = RAW.call(fs, CW_FILE, 'utf8');
  const cutCost = src.includes('  if (pricesHeld) return { text: t("prices not known")') ? src.replace('  if (pricesHeld) return { text: t("prices not known")', '  if (false) return { text: t("prices not known")') : null;
  const cutCsv = src.includes('  const held = pricesHeldOf(d);\n') ? src.replace('  const held = pricesHeldOf(d);\n', '  const held = false;\n') : null;
  const c1 = cutCost ? pageLaw(await importCopy(cutCost, 'cut-cost')) : null, c2 = cutCsv ? pageLaw(await importCopy(cutCsv, 'cut-csv')) : null;
  ok(!!c1 && !c1.ok.cost && !!c2 && !c2.ok.csvHeld && c2.ok.csvFree, 'CONTROL: costWords with its held branch cut, and the CSV with its held reading cut, are each RED (the not-held file unchanged)', { cutCost: c1 && c1.ok, cutCsv: c2 && c2.ok });
}
{
  const win = onDisk(path.join(REPO, 'src/lib/usage-window.js')) || '', dash = onDisk(path.join(REPO, 'src/lib/usage-dashboard.js')) || '', app = onDisk(path.join(REPO, 'src/lib/app.js')) || '';
  const ed = win.slice(win.indexOf('function renderPricingEditor('), win.indexOf('  const pricing = (state.data && state.data.pricing)'));
  const tr = win.slice(win.indexOf('function renderTrend('), win.indexOf('function drawBars('));
  const wires = {
    costOfRow: win.includes('const costOfRow = (r) => costWords(r, t, fmtCost, fmtNum, { pricesHeld: PRICES_HELD });'),
    paint: win.includes('    PRICES_HELD = pricesHeldOf(state.data);\n'),
    head: /const said = pf && pf\.held \? heldWordsOf\(\{ code: 'prices_unread' \}\)/.test(win),
    editor: ed.includes('  if (pricesHeldOf(state.data)) {') && ed.includes("heldWordsOf({ code: 'prices_unread' })") && ed.includes('    return wrap;') && !ed.includes("t('Save')") && !ed.includes("createElement('input')"),
    trend: tr.indexOf("if (metricKey === 'cost' && PRICES_HELD)") > 0 && tr.indexOf("if (metricKey === 'cost' && PRICES_HELD)") < tr.indexOf("document.createElement('canvas')"),
    bars: win.includes("const barVal = (r, metric) => (r ? (metric === 'cost' && !PRICES_HELD ? r.cost : r.totalTokens) : 0) || 0;") && (win.match(/barVal\(/g) || []).length >= 5 && !/metric === 'cost' \? r\.cost : r\.totalTokens/.test(win),   // stale-pins: kept (an absence check: no bar of the window takes a cost length but through barVal)
    csv: win.includes('  const lines = usageCsvLines(d, t);\n') && !win.includes('r.cost.toFixed(4)'),   // stale-pins: kept (an absence check: the CSV cell is built in the pure module now, never in the window)
    toast: win.includes("r && r.code === 'prices_unread' ? heldWordsOf(r) :"),
    dashRow: dash.includes('const rowCost = (r) => costWords(r, t, fmtCost, fmtTok, { pricesHeld: PRICES_HELD }).text;'),
    dashPaint: (dash.match(/PRICES_HELD = pricesHeldOf\(data\);/g) || []).length === 2,
    dashPanel: dash.includes("if (PRICES_HELD && mlist.some((m) => m.key === 'cost')) {") && dash.includes("heldWordsOf({ code: 'prices_unread' })"),
    dashNote: dash.includes('costWords(data.totals, t, fmtCost, fmtTok, { pricesHeld: PRICES_HELD }).note'),
    exportRow: app.includes("s.pricing?.unread ? (() =>") && app.includes('Your edited prices cannot be read right now, so this backup leaves them out'),
  };
  ok(Object.values(wires).every(Boolean), 'PINS (must 4): every wire of the page asks the hold — the window\'s cost words, its paint, its head, the editor (no table, no Save), the trend (no bar, no dollar axis), every bar\'s length (tokens while held), the CSV, the save toast; the dashboard\'s row words, both paints, the cost panel, the totals note; the export dialog\'s held row', wires);
}
{
  // r3748 should: the estimator writes NO fit to rates.json while the prices are held (memory only), and does once they read
  const UE = require('../src/usage-estimator.js');
  const ad = path.join(root, 'anchors-held'); fs.mkdirSync(ad, { recursive: true, mode: 0o700 });
  let heldNow = true;
  const e = new UE.UsageEstimator({ anchorsDir: ad, usageHistory: { *_events() { }, _cost: () => 0, pricesHeld: () => (heldNow ? { file: 'pricing.json', code: 'EIO', since: 1 } : null) }, resolveIdentity: () => null, lagS: 0 });
  const rf = path.join(ad, 'rates.json');
  e._persistRates('acct:made-up-acct', [{ bucket: 'made-up' }], 1); e.flushRates();
  const whileHeld = onDisk(rf);
  heldNow = false; e._persistRates('acct:made-up-acct', [{ bucket: 'made-up' }], 1); e.flushRates();
  let after = null; try { after = JSON.parse(onDisk(rf)); } catch { after = null; }
  try { e.close(); } catch { }
  ok(whileHeld === null && !!after && !!after['acct:made-up-acct'], 'the estimator writes NO fit to rates.json while the prices are held (a fit at the defaults, memory only) — and writes it once they read', { whileHeld, after: after && Object.keys(after) });
  const bf = onDisk(path.join(REPO, 'src/ledger-slot-backfill.js')) || '';
  ok(/const relearnNow = \(\) => \{\n\s*if \(uh\.pricesHeld && uh\.pricesHeld\(\)\) \{[^\n]*throw new Error\(/.test(bf) && bf.indexOf('const relearnNow = () => {') < bf.indexOf('new UsageEstimator({ anchorsDir, usageHistory: uh'), 'the ledger backfill\'s re-learn throws FIRST while the prices are held (before any estimator is made): its rates are never learned at the defaults', null);
}

console.log('⑤ THE FOLLOW (主开发 r3837 + r4125): the prices asked after their hold settles once; the page follows the hold');
{
  // (2) r4125 (the helper's law, r3986, AS AT THE TRAIN's TIP): the prices are asked after their hold has SETTLED ONCE — never on a word of
  // the helper's. Three starts on the real helper: (i) a TORN READ of a whole file (the start's read and the helper's first read placed
  // torn; the helper's second look finds the file whole); (ii) a truly TORN FILE; (iii) a file that cannot be read.
  const UE = require('../src/usage-estimator.js');
  const TORN = '{"version":2,"tiers":{"opus":{"input":1';
  const tornOnce = (file, n) => {   // the first n reads of `file` answer torn bytes (the sync start read and the helper's first async read); the file stays whole
    const rf = fs.readFileSync, rp = fs.promises.readFile; let left = n;
    fs.readFileSync = function (q, ...x) { if (typeof q === 'string' && path.resolve(q) === file && left > 0) { left--; return x[0] ? TORN : Buffer.from(TORN); } return rf.call(fs, q, ...x); };
    fs.promises.readFile = function (q, ...x) { if (typeof q === 'string' && path.resolve(q) === file && left > 0) { left--; return Promise.resolve(x[0] ? TORN : Buffer.from(TORN)); } return rp.call(fs.promises, q, ...x); };
    return () => { fs.readFileSync = rf; fs.promises.readFile = rp; };
  };
  const persists = (uh, tag) => {   // the estimator's persist over THIS reader: written now? (memory only while held)
    const ad = path.join(root, 'anchors-' + tag); fs.mkdirSync(ad, { recursive: true, mode: 0o700 });
    const e = new UE.UsageEstimator({ anchorsDir: ad, usageHistory: uh, resolveIdentity: () => null, lagS: 0 });
    e._persistRates('acct:made-up-acct', [{ bucket: 'made-up' }], 1); e.flushRates();
    let w = null; try { w = JSON.parse(onDisk(path.join(ad, 'rates.json'))); } catch { w = null; }
    try { e.close(); } catch { }
    return !!(w && w['acct:made-up-acct']);
  };
  // (i) a torn READ of a whole file: the person's prices, after the settle — nothing at the defaults written meanwhile
  const d1 = dirOf('torn-read'); const f1 = plant(d1); const undo1 = tornOnce(f1, 2);
  const uh1 = make(d1);
  const word = uh1.pricesHeld && uh1.pricesHeld();   // what the helper's hold says at once
  const atStart1 = { settling: typeof uh1.pricesSettling === 'function' && uh1.pricesSettling(), persists: persists(uh1, 'i-start') };
  const settled1 = typeof uh1.pricesSettled === 'function' ? await uh1.pricesSettled({ boundMs: 5000 }) : 'none';
  undo1();
  const after1 = { held: uh1.pricesHeld(), cost: uh1._cost(EV), persists: persists(uh1, 'i-after'), file: onDisk(f1) === JSON.stringify(MINE(), null, 2) };
  stopOf(uh1);
  ok(!!word && atStart1.settling === true && atStart1.persists === false && settled1 === null && !after1.held && Math.abs(after1.cost - atMine) < 1e-9 && after1.persists === true && after1.file,
    '(i) a TORN READ of a WHOLE file: while the helper decides, nothing is written at the defaults (the estimator keeps its fit in memory); after the settle the prices are the PERSON\'s and the file is untouched', { word: word && word.code, atStart1, settled1, after1 });
  // RED CONTROL: the word test this follow had (a hold's code «torn bytes» read as «known: the defaults») — on scene (i) it says known while
  // the file is whole and its prices are the person's: the re-learn would have written default-priced rates for good
  ok(!!word && word.code === 'torn bytes' && Math.abs(atMine - atDefault) > 1e-9, 'CONTROL: on that scene the old word test (code «torn bytes» ⇒ the defaults, for certain) would have called the prices known at the DEFAULTS while the person\'s whole file holds other prices — red by its own facts', { code: word && word.code, mine: atMine, defaults: atDefault });
  // (ii) a truly TORN FILE: after the settle the helper's own confirmed lift (pricesTorn names the copy): the defaults, known — the pass finishes
  const d2 = dirOf('torn-file'); const f2 = path.join(d2, 'usage-history', 'pricing.json'); fs.writeFileSync(f2, TORN, { mode: 0o600 });
  const uh2 = make(d2);
  const atStart2 = { settling: uh2.pricesSettling && uh2.pricesSettling(), persists: persists(uh2, 'ii-start') };
  const settled2 = uh2.pricesSettled ? await uh2.pricesSettled({ boundMs: 5000 }) : 'none';
  const after2 = { held: uh2.pricesHeld(), torn: uh2.pricesTorn && uh2.pricesTorn(), cost: uh2._cost(EV), persists: persists(uh2, 'ii-after') };
  stopOf(uh2);
  ok(atStart2.settling === true && atStart2.persists === false && settled2 === null && !after2.held && !!after2.torn && !!after2.torn.copy && Math.abs(after2.cost - atDefault) < 1e-9 && after2.persists === true,
    '(ii) a truly TORN FILE: after the settle the helper\'s OWN confirmed lift (its copy named): the defaults are known, the estimator writes its fit, the pass can finish (the release threw at every start)', { atStart2, settled2, after2 });
  // (iii) a file that cannot be read: not «settling» (no wait), held — the re-learn waits for the next start, as before
  const d3 = dirOf('eio-start'); const f3 = plant(d3); const undo3 = refuse(f3);
  const uh3 = make(d3);
  const r3 = { settling: uh3.pricesSettling && uh3.pricesSettling(), held: uh3.pricesHeld(), persists: persists(uh3, 'iii') };
  let tries3 = 0; { const ag = uh3._pricingHold.again; uh3._pricingHold.again = (...a) => { tries3++; return ag(...a); }; }   // no wait = no read again asked
  const settled3 = uh3.pricesSettled ? await uh3.pricesSettled({ boundMs: 5000 }) : 'none';
  stopOf(uh3); undo3();
  ok(r3.settling === false && !!r3.held && r3.persists === false && !!settled3 && tries3 === 0, '(iii) a file that CANNOT be read: no wait (not a torn start: no read again asked), held — the estimator writes nothing and the re-learn waits for the next start', { r3, settled3: settled3 && settled3.code, tries3 });
  // the roads ask the settle, on the helper's FACTS: the backfill waits for it only on a torn start (a stepped pass), the migration answers
  // a stepped pass; the estimator asks HELD; the helper's facts this reads stay where they are (red when a fact goes)
  const bfs = onDisk(path.join(REPO, 'src/ledger-slot-backfill.js')) || '', mig = onDisk(path.join(REPO, 'src/server/migrations.js')) || '', est = onDisk(path.join(REPO, 'src/usage-estimator.js')) || '', hold = onDisk(path.join(REPO, 'src/store-read-hold.js')) || '';
  const roads = {
    backfillWaits: bfs.includes('if (uh.pricesSettling && uh.pricesSettling()) {') && bfs.includes('return uh.pricesSettled().then(() => { relearnNow(); return finishPass(); }') && bfs.includes('  return finishPass();'),
    migrationSteps: mig.includes("if (pass && typeof pass.then === 'function') return pass.then((rep) => said(rep));"),
    estimatorHeld: est.includes("if (uh && typeof uh.pricesHeld === 'function' && uh.pricesHeld()) return; }") && !est.includes('pricesUnknown'),
    noWord: !(onDisk(path.join(REPO, 'src/usage-history.js')) || '').includes("code !== 'torn bytes'"),
    helperFacts: hold.includes('start, again, refusal, held: facts,') && hold.includes('torn: () => (tornLift ? { ...tornLift } : null),'),
  };
  ok(Object.values(roads).every(Boolean), 'the roads ask the SETTLE on the helper\'s facts: the backfill waits only on a torn start (a stepped pass, its close after the re-learn), the migration answers a stepped pass, the estimator asks held, no word of the helper is read; the helper still offers again(), held() and torn()', roads);
}
{
  // (1) BY BEHAVIOUR: the family's REAL list (src/server/held-lists.js over the real helper) while the prices are held and after their
  // lift, read by the page's pure predicate — and a copy of it reading the wrong field (`file`, `held`: not in the hub's rows) is red
  const HL = require('../src/server/held-lists.js');
  const got = [];
  const hl = HL.create({ broadcast: (m) => got.push(m) });
  const d = dirOf('lists'); const f = plant(d); const undo = refuse(f);
  const uh = make(d);
  const heldList = hl.list();
  undo(); const lifted = await HOLD.readAgainOf('pricing.json');
  const afterList = hl.list();
  try { hl.stop(); } catch { } stopOf(uh);
  const W = await import(pathToFileURL(CW_FILE).href);
  const src = RAW.call(fs, CW_FILE, 'utf8');
  const cut = src.includes("(r) => !!r && r.what === 'pricing.json'") ? await importCopy(src.replace("(r) => !!r && r.what === 'pricing.json'", "(r) => !!r && r.file === 'pricing.json' && r.held"), 'wrong-field') : null;
  ok(typeof W.pricesHeldInLists === 'function' && W.pricesHeldInLists(heldList) === true && lifted === true && W.pricesHeldInLists(afterList) === false && !!cut && cut.pricesHeldInLists(heldList) === false,
    'BEHAVIOUR: the family\'s real list says the prices held while they are and not after the lift, as the page reads it; CONTROL: a reader of a field the hub\'s rows do not carry never sees the hold (red)', { held: heldList.map((r) => r.what), after: afterList.map((r) => r.what), lifted, broadcasts: got.length });
  // r4125's CHECK: the helper keeps a row for a LIFT FROM TORN BYTES (held false, its copy named): the hub's list never carries it (only held
  // rows: the line below), and the predicate reads a row's held mark anyway — after a torn lift the window does not load again at every push
  const hl2 = HL.create({ broadcast: () => { } });
  const dT = dirOf('lists-torn'); const fT = path.join(dT, 'usage-history', 'pricing.json'); fs.writeFileSync(fT, '{"version":2,"tiers":{"opus":{"input":1', { mode: 0o600 });
  const uhT = make(dT);
  await until(() => typeof uhT.pricesTorn === 'function' && !!uhT.pricesTorn());
  const tornRows = HOLD.holds().filter((r) => r.file === 'pricing.json'), hubAfterTorn = hl2.list();
  try { hl2.stop(); } catch { } stopOf(uhT);
  const hubSrc = onDisk(path.join(REPO, 'src/server/held-lists.js')) || '';
  ok(tornRows.some((r) => r.held === false && r.copy) && !W.pricesHeldInLists(hubAfterTorn) && !hubAfterTorn.some((r) => r.what === 'pricing.json') && W.pricesHeldInLists([{ what: 'pricing.json', held: false }]) === false && W.pricesHeldInLists([{ what: 'pricing.json' }]) === true && hubSrc.includes('for (const h of hold.holds()) if (h && h.held) out.push({'),
    'CHECK: after a TORN lift the helper keeps its not-held row (its copy named), the hub\'s list carries only held rows (its line), and the page\'s predicate ignores a row marked not held — no reload at every push', { tornRows: tornRows.map((r) => ({ held: r.held, copy: !!r.copy })), hub: hubAfterTorn.map((r) => r.what) });
}
{
  // (1) THE PAGE FOLLOWS THE HOLD, and the rest of r3837's list on the page (pins: no DOM leg)
  const win = onDisk(path.join(REPO, 'src/lib/usage-window.js')) || '';
  const zh = onDisk(path.join(REPO, 'src/lib/i18n-zh.js')) || '', ja = onDisk(path.join(REPO, 'src/lib/i18n-ja.js')) || '';
  const TYPED = 'What you typed in the editor was not saved — set your prices again once they read.';
  const f = {
    follows: win.includes("import { onHeldLists } from './held-lists.js';") && win.includes("const offHeld = onHeldLists((rows) => { if (closed || !state.data) return; if (pricesHeldInLists(rows) !== pricesHeldOf(state.data)) load(); });") && win.includes('winInfo.onClose = () => { offHeld(); prevClose2?.(); };'),
    rankGroup: win.includes("  if (metric === 'cost' && PRICES_HELD) rows = tokensFirst(rows);"),
    rankSessions: win.includes("if (state.metric === 'cost' && PRICES_HELD) d = { ...d, groups: { ...d.groups, session: tokensFirst(d.groups.session) } };"),
    typed: win.includes("wrap.addEventListener('input', () => { state.pricingTyped = true; });") && win.includes("if (state.pricingTyped) {") && win.includes(`t('${TYPED}')`),
    words: zh.includes(JSON.stringify(TYPED) + ':') && ja.includes(JSON.stringify(TYPED) + ':'),
  };
  ok(Object.values(f).every(Boolean), 'the page FOLLOWS the prices\' hold (the family\'s signal: a start or an end loads the window again, its listener gone at the close); while held a cost list is ranked by tokens (the grouped lists, the sessions); an editor typed in before a hold landed says it was not saved (zh, ja)', f);
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
// ⑥ B-574d «usage-ledger-repairs» (主开发 r4881 (3)): A PERSON'S SAVE THAT FAILED LEAVES MEMORY AS THE DISK IS. pricing.json is written
// through src/fd-close.js renameSynced; its temp's sync REFUSED (EIO, placed for that one temp): setPricing throws (the route's refusal),
// the next price read is the OLD table (the table and a cost), the file byte-identical, no temp; with the sync answering, the save lands
// and is read. RED (anchored copy): the base's lines — the new table taken into memory BEFORE the write
{
  const placedSync = (fn) => {
    const o = fs.openSync, sy = fs.fsyncSync, cl = fs.closeSync, fds = new Set();
    fs.openSync = function (p, ...a) { const fd = o.call(fs, p, ...a); if (String(p).endsWith(path.sep + 'pricing.json.tmp')) fds.add(fd); return fd; };
    fs.fsyncSync = function (fd) { if (fds.has(fd)) throw Object.assign(new Error('EIO: a placed answer of the sync'), { code: 'EIO' }); return sy.call(fs, fd); };
    fs.closeSync = function (fd) { fds.delete(fd); return cl.call(fs, fd); };   // a number is forgotten at its close
    try { return fn(); } finally { fs.openSync = o; fs.fsyncSync = sy; fs.closeSync = cl; }
  };
  const scene = (X, tag) => {
    const d = dirOf(tag); const f = plant(d); const before = onDisk(f);
    const uh = make(d, X);
    const was = JSON.stringify(uh.pricingTable()), cost0 = uh._cost(EV), dis0 = JSON.stringify(uh.priceDisagreements());
    const told = []; X.onPriceDisagreements((list) => told.push(list));   // the catalog's ear: a refused save tells it nothing
    let threw = null; placedSync(() => { try { uh.setPricing({ accounts: { 'made-up-key-9': { discount: 0.9 } } }); } catch (e) { threw = (e && e.code) || 'error'; } });
    const r = { threw, sameFile: onDisk(f) === before, noTemp: !fs.existsSync(f + '.tmp'), oldTable: JSON.stringify(uh.pricingTable()) === was, oldCost: Math.abs(uh._cost(EV) - cost0) < 1e-12, untold: told.length === 0, oldDisagreements: JSON.stringify(uh.priceDisagreements()) === dis0 };
    let landed = null; try { uh.setPricing({ accounts: { 'made-up-key-9': { discount: 0.9 } } }); landed = JSON.parse(onDisk(f)).accounts['made-up-key-9'].discount === 0.9 && uh.pricingTable().accounts['made-up-key-9'].discount === 0.9; } catch (e) { landed = (e && e.code) || 'error'; }
    r.landed = landed; r.toldOnLanding = told.length > 0;
    X.onPriceDisagreements(null);
    stopOf(uh);
    return r;
  };
  const R6 = scene(UH, 'save-refused');
  ok(R6.threw === 'EIO' && R6.sameFile && R6.noTemp && R6.oldTable && R6.oldCost && R6.untold && R6.oldDisagreements && R6.landed === true && R6.toldOnLanding,
    '⑥ B-574d (r4881 (3)): a prices save whose sync is REFUSED (EIO) answers the error and leaves memory as the disk is — the next price read is the OLD table (and an old cost), the catalog told NOTHING (its disagreements as they were), the file byte-identical, no temp; the save with the sync answering lands and is told', R6);
  const USRC = RAW.call(fs, path.join(REPO, 'src/usage-history.js'), 'utf8');
  const ORDER = "    this._writeAtomic(this.pricingFile, JSON.stringify(next, null, 2));\n    this._pricingFile = next;\n    this._pricing = this._withCatalog(next);\n";
  const BASE_ORDER = "    this._pricingFile = next;\n    this._pricing = this._withCatalog(next);\n    this._writeAtomic(this.pricingFile, JSON.stringify(next, null, 2));   // MUTANT: the base's order — memory first\n";
  const file6 = path.join(REPO, 'src/usage-history.js'), m6 = new Module(file6, null); m6.filename = file6; m6.paths = Module._nodeModulePaths(path.dirname(file6));
  m6._compile(anchored(USRC, ORDER, BASE_ORDER, 'the prices\' save takes the table once it landed'), file6);
  const RR = scene(m6.exports, 'save-refused-red');
  ok(RR.threw === 'EIO' && RR.sameFile && !RR.oldTable, 'RED CONTROL (anchored copy: the base\'s order — the new table in memory before the write): the refused save answers the error while the hub prices with the NEW table — ⑥ goes red', RR);
  // and the slice's first form (its own read, F4): the table merged WITH its report before the write — the refused save tells the catalog
  const PURE = "    CP.mergePricing(next, CATALOG_PRICES, { shipped: DEFAULT_PRICING, checked: SHIPPED_PRICES_CHECKED });\n";
  const file7 = path.join(REPO, 'src/usage-history.js'), m7 = new Module(file7, null); m7.filename = file7; m7.paths = Module._nodeModulePaths(path.dirname(file7));
  m7._compile(anchored(USRC, PURE, '    this._withCatalog(next);   // MUTANT: the report before the write\n', 'the pure merge before the write'), file7);
  const RT = scene(m7.exports, 'save-refused-told');
  ok(RT.threw === 'EIO' && !RT.untold, 'RED CONTROL (anchored copy: the table merged WITH its report before the write): the refused save tells the catalog a table that never landed — ⑥ goes red', RT);
  // (主开发 r5013 (b)) THE ANSWER: a save the disk refused at its temp's open (a real fs error: its syscall, its path in the message) answers 500
  // with words that carry NO path of the server; a refused rate stays 400 with its code. RED: the release's answer (400, the message whole)
  {
    const d = dirOf('save-answer'); plant(d); const uh = make(d);
    const o = fs.openSync; let err = null;
    fs.openSync = function (p, ...a) { if (String(p).endsWith(path.sep + 'pricing.json.tmp')) throw Object.assign(new Error(`EIO: i/o error, open '${p}'`), { code: 'EIO', syscall: 'open', path: String(p) }); return o.call(fs, p, ...a); };
    try { uh.setPricing({ accounts: { 'made-up-key-8': { discount: 0.8 } } }); } catch (e) { err = e; } finally { fs.openSync = o; }
    let rateErr = null; try { uh.setPricing({ tiers: { opus: { input: -1 } } }); } catch (e) { rateErr = e; }
    const A = UH.pricesSaveAnswer(err), B = UH.pricesSaveAnswer(rateErr);
    ok(!!err && A.status === 500 && A.body.code === 'prices_not_saved' && /EIO/.test(A.body.error) && !A.body.error.includes(d) && !A.body.error.includes('/') && B.status === 400 && B.body.code === (rateErr && rateErr.code),
      '⑥ B-574d (r5013 (b)): a prices save the DISK refused answers as the server\'s failure (500, prices_not_saved) and its words carry no path of the server; a refused rate stays the client\'s (400, its code)', { A, B: B.status });
    const file8 = path.join(REPO, 'src/usage-history.js'), m8 = new Module(file8, null); m8.filename = file8; m8.paths = Module._nodeModulePaths(path.dirname(file8));
    m8._compile(anchored(USRC, 'module.exports.pricesSaveAnswer = (e) => (e && e.syscall\n', 'module.exports.pricesSaveAnswer = (e) => (false   // MUTANT: the release\'s answer — every refusal the client\'s, the message whole\n', 'the disk\'s refusal the server\'s'), file8);
    const R5 = m8.exports.pricesSaveAnswer(err);
    ok(R5.status === 400 && String(R5.body.error).includes(d), 'RED CONTROL (anchored copy: the release\'s answer — every refusal the client\'s): a disk\'s refusal answers 400 with the server\'s path in its words — ⑥\'s answer goes red', R5.status);
    stopOf(uh);
  }
}
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
