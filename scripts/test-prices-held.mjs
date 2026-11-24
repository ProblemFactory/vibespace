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
//   ④ RED CONTROLS: the store with its hold cut writes the defaults over the unread file at the start (the release's shape); the
//      pure module with its held branch cut (costWords, the CSV) is red by name.
// At the release (the base of this row) the law's legs are RED: that is the harm, as the release has it.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
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
  ok(/const uh = new UsageHistory\(\{ dataDir, homeDir: path\.join\(dataDir, '\.no-home'\) \}\);\n(?:\s*\/\/[^\n]*\n)*\s*if \(uh\.pricesHeld && uh\.pricesHeld\(\)\) \{[^\n]*throw new Error\(/.test(bf), 'the ledger backfill\'s re-learn throws FIRST while the prices are held (before any estimator is made): its rates are never learned at the defaults', null);
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
