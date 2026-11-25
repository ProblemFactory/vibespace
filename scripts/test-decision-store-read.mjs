#!/usr/bin/env node
// THE PAID JUDGE's THREE FILES UNDER THE STORE-READ LAW (row B-f276's family, the store census's form 3 rank 6; 主开发 r3175; lane
// bl-loop-a). src/server/decision-engine.js reads data/decision-usage.json (the day's counter), decision-memo.json (its paid answers)
// and decision-journal.jsonl (every call — the boot raises the day's counter to the journal's sum, B-a85f) at its start. THE LAW:
// «not there» is told from «the read failed» and from «the bytes do not parse»; a counter (or the journal that rebuilds it) that
// could not be read is UNKNOWN, and unknown REFUSES a paid judgment by name (no reservation, no judgment) — never «zero spent»; a
// memo that could not be read refuses too (never pays again for answers already paid); nothing is written over a file that was not
// read; torn bytes are kept aside once; the person is told once; a read again lifts it.
// Every world is the REAL engine, the real integration store and plugin manager, and a stand-in vendor on the loopback that
// COUNTS its requests (no vendor is ever asked). A file that «cannot be read» is a PLACED refusal of the read calls for that one
// path (fs.readFileSync / fs.openSync / fs.promises.readFile answer EIO) — never a mount, never a mode change. The spend is made-up.
//   L1 the counter AND the journal unread, today over its budget ⇒ refused by name, NOTHING sent
//   L2 the memo unread, an answer it holds asked again ⇒ refused by name, nothing sent
//   L3 a TORN counter, the journal read ⇒ its bytes kept aside ONCE, today's spend from the journal, never «zero»
//   L4 the journal unread, the counter behind it (a stop before its write landed) ⇒ refused by name (never under-counted)
//   L5 nothing is written while held: the three files' bytes unchanged, no journal line appended
//   L6 the read again: the refusal gone ⇒ the real spend read ⇒ «daily-budget»
//   L7 the person is told ONCE
// THE CURE ROUND (主开发 r4121, round wf_e042a8ff — the money lens), each with its red on an anchored copy:
//   L8 MUST 1: the counter held at a start, the journal read (a killed call's reservation in it); the journal's reads placed as failing
//      AFTER the start, then the counter lifts ⇒ raised from the boot's own rows ⇒ «daily-budget», nothing sent, NO synchronous read of the
//      journal after the start (red: the lift reads the journal again and takes a failed read as no rows ⇒ sent); L8b the torn counter, alike
//   L9 MUST 2: the journal unread at a start, then «not there» ONCE, then the true file ⇒ refused until the true file is read, then raised
//      (red: «not there» lifts at once as an empty journal ⇒ sent)
//   L10 MUST 2: a read again that HANGS ⇒ the press answers by the bound, the hold says a read waits, its next try stays armed, a second
//      press starts no second read; the late answer lifts it (red: no bound ⇒ the press itself hangs)
//   L4b the journal lifting ALONE while the counter reads ⇒ raised from its rows (red: no raise at the journal's lift ⇒ sent)
//   L11 the drafter through the REAL ledger ⇒ refused «spend-unread» before its provider (red: the client's guard cut)
//   L12 the page: status() says the spend is NOT KNOWN where the figure stands, and the line never says a number
//   L13 the owner's Test answers the drafter card's sentence (never the bare code); L14 told ONCE a hold of the judge (red: a memo's lift
//      resets it); L15 the journal's hold is a row of the family's held list, and the list's press reaches it
// THE FOLLOW (主开发 r4201), two legs for what holds by construction: L16 the day turns while the counter is held ⇒ nothing of yesterday is
//   raised into today; L17 nothing is appended between the journal's two «not there» tries
// Run: node scripts/test-decision-store-read.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, endScratchAtExit, anchored } from './scratch.mjs';   // §113: the first import after node's own
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name + (extra !== undefined ? '\n      ' + JSON.stringify(extra).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const E = require(path.join(repo, 'src/server/decision-engine.js'));
const M = require(path.join(repo, 'src/decision-model.js'));
const S = require(path.join(repo, 'src/server/integration-store.js'));
const { PluginManager } = require(path.join(repo, 'src/plugins.js'));
const DP = require(path.join(repo, 'src/plugins/llm.js'));

// ── THE PLACED REFUSAL: the read calls for the paths in `placed` answer EIO (writes are never touched) ──
const placed = new Set();
const realRF = fs.readFileSync, realOpen = fs.openSync, realPRF = fs.promises.readFile;
const eio = (p) => Object.assign(new Error(`EIO: a placed read refusal, read '${p}'`), { code: 'EIO' });
// r4121: every SYNCHRONOUS read of a path is counted (syncReads: the lift must make none); `plans` queues one-shot answers of the
// off-loop read for a path — 'enoent' (a «not there» once) or 'hang' (held until the leg releases it with the file's real bytes)
const syncReads = new Map(), asyncReads = new Map(), plans = new Map(), hangs = [];
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
fs.readFileSync = function (p, ...a) { bump(syncReads, String(p)); if (placed.has(String(p))) throw eio(p); return realRF.call(this, p, ...a); };
fs.openSync = function (p, flags, ...a) { const rd = !/[wa+]/.test(String(flags == null ? 'r' : flags)); if (rd) bump(syncReads, String(p)); if (placed.has(String(p)) && rd) throw eio(p); return realOpen.call(this, p, flags, ...a); };
fs.promises.readFile = function (p, ...a) {
  const k = String(p); bump(asyncReads, k);
  const q = plans.get(k);
  if (q && q.length) {
    const act = q.shift();
    if (act === 'enoent') return Promise.reject(Object.assign(new Error(`ENOENT: a placed «not there», open '${p}'`), { code: 'ENOENT' }));
    if (act === 'hang') return new Promise((res, rej) => { hangs.push(() => realPRF.call(fs, p, ...a).then(res, rej)); });
  }
  if (placed.has(k)) return Promise.reject(eio(p));
  return realPRF.call(this, p, ...a);
};

// ── the stand-in vendor: counts every request, answers the openai dialect's decisions ──
let asked = 0;
const fake = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    asked++;
    let body = null; try { body = JSON.parse(b); } catch { }
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/v1/decisions' && body) return json(200, { answers: body.questions.map((q) => ({ type: 'predicate', name: q.name, probability: 0.8 })) });
    json(404, { error: 'no such route' });
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const BASE = { openai: `http://127.0.0.1:${fake.address().port}`, openrouter: `http://127.0.0.1:${fake.address().port}` };

const ROOT = scratch('decision-store-read'); fs.mkdirSync(ROOT, { recursive: true }); endScratchAtExit(ROOT);
const KEY = ['sk', 'stand', 'in', 'judge', '0001'].join('-');
const T = Date.UTC(2026, 10, 24, 12, 0, 0);
const DAY = M.dayOf(T, 0);
const RULE_Q = [{ type: 'predicate', name: 'invoice', instructions: 'Does it mention an invoice?' }];
const parts = (i) => ({ condition: 'mentions an invoice', body: `Invoice ${i} is attached.`, thread: ['Earlier: hello'] });
let seq = 0;
/** a world: its own data folder, integration store (the key set), plugin settings (the rules feature on, the daily budget) */
function world(tag, { budgetCents = 1, provider = 'openai' } = {}) {
  const dataDir = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(dataDir, { recursive: true });
  const store = S.create({ dataDir, env: {}, log: { warn() { }, log() { } } });
  store.setIntegration('llm', { provider, apiKey: KEY });
  let settingsObj = {};
  const settingsStore = { read: () => settingsObj, patch: (p) => { settingsObj = { ...settingsObj, ...p }; for (const [k, v] of Object.entries(settingsObj)) if (v === null) delete settingsObj[k]; } };
  const F = { usage: path.join(dataDir, 'decision-usage.json'), memo: path.join(dataDir, 'decision-memo.json'), journal: path.join(dataDir, 'decision-journal.jsonl') };
  const notices = [];
  const engine = (opts = {}, Mod = E) => {
    const e = Mod.create({ dataDir, integrations: store, baseUrlFor: BASE, now: () => T, tzOffset: () => 0, serverNotice: (id, text, o) => { notices.push({ id, text, o }); return 1; }, log: { warn() { } }, ...opts });
    const pm = new PluginManager({ dataDir, plugins: [DP], decisionEngine: e, settings: settingsStore });
    pm.setEnabled('llm', true); pm.setConfig('llm', { rules: true, dailyBudgetCents: budgetCents });
    return e;
  };
  return { dataDir, F, notices, engine };
}
const usageDoc = (usd) => JSON.stringify({ day: DAY, byUse: { rule: { calls: 3, inputTokens: 300, outputTokens: 6, usd } }, rate: {} });
const journalOf = (usd) => [1, 2, 3].map((i) => JSON.stringify({ at: T - 3600e3 + i, use: 'rule', outcome: 'ok', usd: usd / 3, inputTokens: 100, outputTokens: 2 })).join('\n') + '\n';
// the suite's OWN look at a file's bytes reads through the utf-8 road (node's own read, never through fs.openSync — the placed
// refusal answers that one, so a Buffer read of a held path would read nothing and call it «changed»)
const bytes = (f) => { try { return realRF.call(fs, f, 'utf8'); } catch { return null; } };
const judge = (e, i, memo) => e.judge('rule', parts(i), { questions: RULE_Q, memo: memo || { id: `x${i}`, rule: 'r1' } });
const W = () => require(path.join(repo, 'src/store-writer.js')).storeWriter();
/** wait on the store writer's OWN pending mark for these files (never a sleep): true once none is pending (bounded) */
const settled = async (files, ms = 3000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (!files.some((f) => W().pending(f))) return true; await sleep(10); } return false; };
const SRC = fs.readFileSync(path.join(repo, 'src/server/decision-engine.js'), 'utf8');
const MUT = mutantCopies('decision-store-read', repo);
const engineCopy = (pairs, tag, src = SRC) => MUT.load('src/server/decision-engine.js', pairs.reduce((t, [a, b]) => anchored(t, a, b, tag), src), tag);
// a killed call: its reservation on disk (0.05 USD, today), no result line — B-0248 counts it SPENT at its estimate
const killedJournal = () => JSON.stringify({ at: T - 600e3, use: 'rule', call: 'k1.1', outcome: 'reserved', reserved: 0.05, est: 2000 }) + '\n';
const TORN8 = '{"day":"' + DAY + '","byUse":{"rule":{"calls":3,"usd":0.0';
// the product lines each red copy edits (anchored: a moved line fails by name)
const KEPT_ROWS = '      const rows = bootRows; bootRows = null;\n';
const MISSING_ONCE = '        if (!jMissingAt) { jMissingAt = now(); return false; }   // «not there» right after an unread answer: read once more first\n';
const BOUND = '    const first = await Promise.race([p, new Promise((r) => { tm = setTimeout(() => r(SLOW), heldReadMs); if (tm.unref) tm.unref(); })]);\n';
const NO_JOURNAL_RAISE = '    else if (rebuildFromJournal(rows)) saveUsage();\n    for (const fn of [...jLifts])';
const MEMO_LIFT = '    onLift: (v) => { memoLoad(v); if (!anyHeld()) heldSaid = false; } });';
const within = (p, ms) => Promise.race([p.then((v) => ({ v })), sleep(ms).then(() => ({ hung: true }))]);

try {
  console.log('— L1 the counter AND the journal unread at a start, today already over its budget');
  const w1 = world('l1');
  fs.writeFileSync(w1.F.usage, usageDoc(0.05)); fs.writeFileSync(w1.F.journal, journalOf(0.05));
  const b1 = { usage: bytes(w1.F.usage), journal: bytes(w1.F.journal) };
  placed.add(w1.F.usage); placed.add(w1.F.journal);
  const e1 = w1.engine(), n1 = asked;
  const r1 = await judge(e1, 1), r1b = await judge(e1, 2);
  ok(!r1.ok && r1.why === 'spend-unread' && asked === n1, `the day's spend cannot be read (the counter and the journal): the paid judgment is REFUSED by name («${r1.why}»), nothing sent to the vendor (${asked - n1} asked)`, r1);
  console.log('— L5 nothing written while held');
  const quiet5 = await settled([w1.F.usage, w1.F.journal]);   // r4121 (d): the writer's own mark, never a sleep
  const txt = (f) => { try { return realRF.call(fs, f, 'utf8'); } catch (e) { return `(${e.code})`; } };
  ok(quiet5 && bytes(w1.F.usage) === b1.usage && bytes(w1.F.journal) === b1.journal && !r1b.ok, 'while held (nothing pending at the store writer): the counter\'s and the journal\'s bytes are unchanged — no write over them, no journal line appended for the refusals', { usage: bytes(w1.F.usage) === b1.usage, journal: bytes(w1.F.journal) === b1.journal, usageNow: txt(w1.F.usage).slice(0, 300), journalNow: txt(w1.F.journal).slice(-300) });
  console.log('— L7 the person told once');
  const told = w1.notices.filter((n) => /decision/.test(n.id) && /read/.test(n.text));
  ok(told.length === 1, `the person is told ONCE across ${2} refusals (${told.length} notice(s)): ${told[0] ? told[0].text.slice(0, 160) : 'none'}`, w1.notices);
  console.log('— L6 the read again lifts it: the real spend read');
  placed.delete(w1.F.usage); placed.delete(w1.F.journal);
  const lifted = typeof e1.readAgain === 'function' ? await e1.readAgain() : null;
  const r6 = await judge(e1, 3);
  ok(lifted !== null && lifted.spend === false && !r6.ok && r6.why === 'daily-budget' && asked === n1, `the refusal gone, a read again (${lifted === null ? 'the engine has none' : `spend known: ${lifted.spend === false}`}): the counter read is today's 0.05 USD ⇒ «${r6.why}», nothing sent`, r6);

  console.log('— L2 the memo unread: an answer already paid for');
  const w2 = world('l2', { budgetCents: 100 });
  const e2a = w2.engine(), n2a = asked;
  const paid = await judge(e2a, 7, { id: 'm7', rule: 'r1' });
  await settled([w2.F.memo]);   // the paced memo write handed to the writer (its own mark, never a sleep)
  const e2flush = w2.engine();   // a new engine in this process lands the paced memo write first (the engine's own rule)
  void e2flush;
  const hasMemo = (() => { try { return (JSON.parse(realRF.call(fs, w2.F.memo, 'utf8')).entries || []).length > 0; } catch { return false; } })();
  const bm = bytes(w2.F.memo);
  placed.add(w2.F.memo);
  const e2 = w2.engine(), n2 = asked;
  const r2 = await judge(e2, 7, { id: 'm7', rule: 'r1' });
  ok(paid.ok && asked === n2a + 1 && hasMemo && !r2.ok && r2.why === 'memo-unread' && asked === n2, `the memo holds the paid answer (asked ${n2a + 1 - n2a} once); its read placed as failing: the same ask is REFUSED by name («${r2.ok ? 'answered' : r2.why}»), never paid again (${asked - n2} asked)`, { paid: paid.ok, hasMemo, r2 });
  const quiet2 = await settled([w2.F.memo]);
  ok(quiet2 && bytes(w2.F.memo) === bm, 'while the memo is held its bytes are unchanged (nothing pending at the store writer, no write over the answers it holds)', { before: (bm || '').slice(0, 200), now: (bytes(w2.F.memo) || '').slice(0, 200) });
  placed.delete(w2.F.memo);

  console.log('— L3 a TORN counter, the journal read');
  const w3 = world('l3');
  const TORN = '{"day":"' + DAY + '","byUse":{"rule":{"calls":3,"usd":0.0';
  fs.writeFileSync(w3.F.usage, TORN); fs.writeFileSync(w3.F.journal, journalOf(0.05));
  const e3 = w3.engine(), n3 = asked;
  for (const end = Date.now() + 5000; !fs.readdirSync(w3.dataDir).some((f) => f.startsWith('decision-usage.json.corrupt-')) && Date.now() < end;) await sleep(20);
  const copies = fs.readdirSync(w3.dataDir).filter((f) => f.startsWith('decision-usage.json.corrupt-'));
  const kept = copies.length === 1 && realRF.call(fs, path.join(w3.dataDir, copies[0]), 'utf8') === TORN;
  const r3 = await judge(e3, 9);
  ok(kept && !r3.ok && r3.why === 'daily-budget' && asked === n3, `torn bytes KEPT ASIDE once (${copies.length} copy, the same bytes: ${kept}); today's spend from the journal (0.05 USD) ⇒ «${r3.ok ? 'answered' : r3.why}», never «zero spent» (${asked - n3} asked)`, { copies, r3 });

  console.log('— L4 the journal unread, the counter behind it (a stop before its write landed); L4b it lifts ALONE while the counter reads');
  const run4 = async (Mod, tag) => {
    const w = world(tag);
    fs.writeFileSync(w.F.usage, usageDoc(0.001)); fs.writeFileSync(w.F.journal, journalOf(0.05));
    placed.add(w.F.journal);
    const e = w.engine({}, Mod), n = asked;
    const r = await judge(e, 11);
    placed.delete(w.F.journal);
    await e.readAgain();
    const rb = await judge(e, 12);
    return { held: r.ok ? 'answered' : r.why, lifted: rb.ok ? 'answered' : rb.why, asked: asked - n };
  };
  const g4 = await run4(E, 'l4'), r4 = await run4(engineCopy([[NO_JOURNAL_RAISE, '    for (const fn of [...jLifts])']], 'no-journal-raise'), 'l4r');
  ok(g4.held === 'spend-unread' && g4.asked === 0, `the journal cannot be read and the counter says 0.001 USD (under the budget): REFUSED by name («${g4.held}») — never under-counted (${g4.asked} asked)`, g4);
  ok(g4.lifted === 'daily-budget' && g4.asked === 0, `L4b: the journal read again ALONE (the counter readable): the counter raised to the journal's 0.05 USD ⇒ «${g4.lifted}», nothing sent`, g4);
  ok(r4.lifted === 'answered' && r4.asked === 1, `RED: no raise at the journal's lift ⇒ the judgment is SENT on the short counter («${r4.lifted}», ${r4.asked} asked)`, r4);

  console.log('— L8 MUST 1 (r4121): the counter held at a start, the journal read; its reads placed as failing AFTER the start; the counter lifts');
  const run8 = async (Mod, tag, torn = false) => {
    const w = world(tag);
    fs.writeFileSync(w.F.usage, torn ? TORN8 : usageDoc(0.001)); fs.writeFileSync(w.F.journal, killedJournal());
    if (!torn) placed.add(w.F.usage);
    const e = w.engine({}, Mod);
    placed.add(w.F.journal);   // from here on every read of the journal fails (the same flaky storage) — the boot's own read is done
    const s0 = syncReads.get(w.F.journal) || 0, n = asked;
    if (torn) { for (const end = Date.now() + 5000; e.status().today.unknown && Date.now() < end;) await sleep(10); }   // its bytes kept aside, lifted
    else { placed.delete(w.F.usage); await e.readAgain(); }
    const r = await judge(e, torn ? 23 : 21);
    const out = { r: r.ok ? 'answered' : r.why, asked: asked - n, sync: (syncReads.get(w.F.journal) || 0) - s0, unknown: !!e.status().today.unknown };
    placed.delete(w.F.journal);
    return out;
  };
  const SECOND = engineCopy([[KEPT_ROWS, '      const rows = (() => { const r = journalRead(); return r.rows || []; })(); bootRows = null;\n']], 'second-read');
  const g8 = await run8(E, 'l8'), r8 = await run8(SECOND, 'l8r');
  ok(g8.r === 'daily-budget' && g8.asked === 0 && g8.sync === 0, `the counter (0.001 USD) lifts while the journal's reads fail: raised from the boot's OWN rows (a killed call's 0.05 USD reservation) ⇒ «${g8.r}», nothing sent, ${g8.sync} synchronous read(s) of the journal after the start`, g8);
  ok(r8.asked === 1 && r8.sync >= 1, `RED: the lift reads the journal again (synchronously) and takes the failed read as no rows ⇒ SENT on the short counter («${r8.r}», ${r8.asked} asked, ${r8.sync} synchronous read(s))`, r8);
  const g8b = await run8(E, 'l8b', true), r8b = await run8(SECOND, 'l8br', true);
  ok(g8b.r === 'daily-budget' && g8b.asked === 0 && g8b.sync === 0 && !g8b.unknown, `L8b a TORN counter lifts (its bytes kept aside) while the journal's reads fail: raised from the boot's rows ⇒ «${g8b.r}», never a day started at zero (${g8b.asked} asked, ${g8b.sync} synchronous read(s))`, g8b);
  ok(r8b.asked === 1, `RED: the torn counter's lift reads the journal again ⇒ the day starts at ZERO and the judgment is sent («${r8b.r}», ${r8b.asked} asked)`, r8b);

  console.log('— L9 MUST 2 (r4121): the journal unread at a start, then «not there» ONCE, then the true file');
  const run9 = async (Mod, tag) => {
    const w = world(tag);
    fs.writeFileSync(w.F.usage, usageDoc(0.001)); fs.writeFileSync(w.F.journal, journalOf(0.05));
    placed.add(w.F.journal);
    const e = w.engine({}, Mod), n = asked;
    placed.delete(w.F.journal); plans.set(w.F.journal, ['enoent']);
    await e.readAgain();
    const rA = await judge(e, 31);
    await e.readAgain();   // the true file now
    const rB = await judge(e, 32);
    plans.delete(w.F.journal);
    return { first: rA.ok ? 'answered' : rA.why, then: rB.ok ? 'answered' : rB.why, asked: asked - n };
  };
  const g9 = await run9(E, 'l9'), r9 = await run9(engineCopy([[MISSING_ONCE, '']], 'missing-once'), 'l9r');
  ok(g9.first === 'spend-unread' && g9.then === 'daily-budget' && g9.asked === 0, `a «not there» right after the unread answer only arms the next try (still «${g9.first}»); the true file read next ⇒ raised ⇒ «${g9.then}», nothing sent`, g9);
  ok(r9.first === 'answered' && r9.asked >= 1, `RED: «not there» lifts at once as an EMPTY journal ⇒ nothing raised, the judgment SENT («${r9.first}», ${r9.asked} asked)`, r9);

  console.log('— L10 MUST 2 (r4121): a read again that HANGS');
  const run10 = async (Mod, tag) => {
    const w = world(tag);
    fs.writeFileSync(w.F.usage, usageDoc(0.001)); fs.writeFileSync(w.F.journal, journalOf(0.05));
    placed.add(w.F.journal);
    const e = w.engine({ heldReadMs: 80 }, Mod), n = asked;
    placed.delete(w.F.journal); plans.set(w.F.journal, ['hang']);
    const a0 = asyncReads.get(w.F.journal) || 0;
    const press = await within(e.readAgain(), 600);
    const f = e.heldRow.facts(), u = e.status().today.unknown;   // the read that waits is said where the figure stands (r4201: the list carries since and next)
    const press2 = await within(e.readAgain(), 600);
    const reads = (asyncReads.get(w.F.journal) || 0) - a0;
    const before = await judge(e, 41);
    while (hangs.length) hangs.shift()();   // the hung read answers now, with the file's real bytes
    for (const end = Date.now() + 3000; e.heldRow.facts() && Date.now() < end;) await sleep(10);
    const after = await judge(e, 42);
    plans.delete(w.F.journal);
    return { press: press.hung ? 'hung' : 'answered', waiting: !!(u && u.waiting), next: !!(f && f.next > T), press2: press2.hung ? 'hung' : 'answered', reads, before: before.ok ? 'answered' : before.why, after: after.ok ? 'answered' : after.why, asked: asked - n };
  };
  const g10 = await run10(E, 'l10'), r10 = await run10(engineCopy([[BOUND, '    const first = await p;\n']], 'no-bound'), 'l10r');
  ok(g10.press === 'answered' && g10.waiting && g10.next && g10.press2 === 'answered' && g10.reads === 1 && g10.before === 'spend-unread' && g10.after === 'daily-budget' && g10.asked === 0,
    `the press answers by the bound; the hold SAYS a read waits (${g10.waiting}) and its next try stays armed (${g10.next}); a second press starts no second read (${g10.reads} read); still «${g10.before}»; the late answer lifts it ⇒ «${g10.after}»`, g10);
  ok(r10.press === 'hung', `RED: no bound ⇒ the press itself hangs with the read (${r10.press})`, r10);

  console.log('— L11 the drafter through the REAL ledger');
  const TMC = fs.readFileSync(path.join(repo, 'src/server/text-model-client.js'), 'utf8');
  const GUARD = TMC.split('\n').find((l) => l.startsWith("    { const sh = typeof ledger.storesUnread === 'function' ? ledger.storesUnread() : null;"));
  const tmcPath = MUT.write('src/server/text-model-client.js', anchored(TMC, GUARD + '\n', '', 'tmc-no-guard'), 'tmc-no-guard', { name: 'tmc-no-guard' });
  const run11 = async (Mod, tag) => {
    const w = world(tag, { provider: 'openrouter' });
    fs.writeFileSync(w.F.usage, usageDoc(0.001)); fs.writeFileSync(w.F.journal, journalOf(0.001));
    placed.add(w.F.usage);
    const e = w.engine({}, Mod), n = asked;
    const r = await e.textModel.complete({ use: 'learn', messages: [{ role: 'user', content: 'Draft one line.' }], est: 0.0001 });
    placed.delete(w.F.usage);
    return { why: r.ok ? 'answered' : r.why, asked: asked - n };
  };
  const g11 = await run11(E, 'l11'), r11 = await run11(engineCopy([["require('./text-model-client.js')", `require(${JSON.stringify(tmcPath)})`]], 'engine-tmc-no-guard'), 'l11r');
  ok(g11.why === 'spend-unread' && g11.asked === 0, `the drafter (the engine's own text-model client, the real ledger) with the counter held: refused «${g11.why}» before its provider (${g11.asked} asked)`, g11);
  ok(r11.why !== 'spend-unread', `RED: the client's guard cut ⇒ the drafter is not refused for the unknown spend («${r11.why}», ${r11.asked} asked)`, r11);

  console.log('— L12 the page: the spend NOT KNOWN where the figure stands');
  const w12 = world('l12'); fs.writeFileSync(w12.F.usage, usageDoc(0.001)); placed.add(w12.F.usage);
  const st12 = w12.engine().status(); placed.delete(w12.F.usage);
  const L12 = M.decisionTodayLine(st12.today, 0.01, { on: true }), K12 = M.decisionTodayLine({ ...st12.today, unknown: undefined }, 0.01, { on: true });
  ok(!!st12.today.unknown && st12.today.unknown.why === 'spend-unread' && st12.today.unknown.file === 'decision-usage.json' && L12.unknown === true && L12.spentUsd === null && /not known/.test(L12.text) && /not known/.test(L12.short) && /not known/.test(L12.month),
    `status() says the day's spend is NOT KNOWN (${st12.today.unknown && st12.today.unknown.file}) and the line says so, never a figure: «${L12.text}»`, { unknown: st12.today.unknown, L12 });
  ok(K12.spentUsd === 0 && !K12.unknown, 'CONTROL: the same day without the mark draws a figure — the line reads the mark', K12);

  console.log('— L13 the owner\'s Test answers the drafter card\'s sentence');
  const LC = fs.readFileSync(path.join(repo, 'src/lib/learn-card.js'), 'utf8'), IW = fs.readFileSync(path.join(repo, 'src/lib/integrations-window.js'), 'utf8');
  const cardQ = (LC.match(/'spend-unread': t\('((?:[^'\\]|\\.)*)'\)/) || [])[1] || null, card = cardQ && cardQ.replace(/\\'/g, "'");
  const w13 = world('l13'); fs.writeFileSync(w13.F.usage, usageDoc(0.001)); fs.writeFileSync(w13.F.memo, JSON.stringify({ entries: [] }));
  placed.add(w13.F.usage);
  const t13a = await w13.engine().testRunner(); placed.delete(w13.F.usage); placed.add(w13.F.memo);
  const t13b = await w13.engine().testRunner(); placed.delete(w13.F.memo);
  const memoQ = String(t13b.error || '').replace(/'/g, "\\'"), memoWorded = IW.includes("t('" + memoQ + "')");
  ok(!!card && t13a.ok === false && t13a.error === card && IW.includes(`t('${cardQ}')`) && t13b.ok === false && /saved answers could not be read/.test(t13b.error || '') && memoWorded,
    `the Test with the counter held answers the drafter card's sentence («${t13a.error}»), with the memo held its own («${t13b.error}»), each worded in the Test window — never a bare code`, { t13a, t13b });

  console.log('— L14 told ONCE a hold of the judge');
  const run14 = async (Mod, tag) => {
    const w = world(tag); fs.writeFileSync(w.F.usage, usageDoc(0.001)); fs.writeFileSync(w.F.memo, JSON.stringify({ entries: [] }));
    placed.add(w.F.usage); placed.add(w.F.memo);
    const e = w.engine({}, Mod);
    await judge(e, 51);
    placed.delete(w.F.memo); await e.readAgain();   // the memo lifts; the counter is still held
    const r = await judge(e, 52);
    placed.delete(w.F.usage);
    const n0 = w.notices.find((x) => x.id === 'decision-unread');
    return { told: w.notices.filter((x) => x.id === 'decision-unread').length, r: r.ok ? 'answered' : r.why, i18n: !!(n0 && n0.o && n0.o.i18n && n0.o.i18n.key === n0.text), text: n0 ? n0.text : null };
  };
  const ZH = fs.readFileSync(path.join(repo, 'src/lib/i18n-zh.js'), 'utf8'), JA = fs.readFileSync(path.join(repo, 'src/lib/i18n-ja.js'), 'utf8');
  const g14 = await run14(E, 'l14'), r14 = await run14(engineCopy([[MEMO_LIFT, '    onLift: (v) => { memoLoad(v); heldSaid = false; } });']], 'memo-resets'), 'l14r');
  ok(g14.told === 1 && g14.r === 'spend-unread' && g14.i18n && ZH.includes(JSON.stringify(g14.text) + ':') && JA.includes(JSON.stringify(g14.text) + ':'), `the memo lifts while the counter is still held: the person is NOT told again (${g14.told} notice, still «${g14.r}»); the notice carries its i18n form, zh and ja in the dictionaries`, g14);
  ok(r14.told === 2, `RED: a memo's lift resets the mark ⇒ told twice (${r14.told})`, r14);

  console.log('— L15 the journal\'s hold is a row of the family\'s held list');
  const HL = require(path.join(repo, 'src/server/held-lists.js'));
  const w15 = world('l15'); fs.writeFileSync(w15.F.usage, usageDoc(0.001)); fs.writeFileSync(w15.F.journal, journalOf(0.05)); placed.add(w15.F.journal);
  const e15 = w15.engine();
  const hl = HL.create({ hold: { holds: () => [], readAgainOf: async () => false, onHoldsChange: () => () => { } }, older: [e15.heldRow] });
  const l0 = hl.list(); placed.delete(w15.F.journal);
  const pr = await hl.readAgain(); const l1 = hl.list(); hl.stop();
  const WIRE = fs.readFileSync(path.join(repo, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(l0.length === 1 && l0[0].what === 'decision-journal.jsonl' && l0[0].readAgain === true && pr.ok === true && l1.length === 0 && WIRE.includes('    decisionEngine.heldRow,'),
    `the journal held is ONE row of the list («${l0[0] && l0[0].what}», read again: ${l0[0] && l0[0].readAgain}); the list's press reads it again and the row is gone (${l1.length} left); the hub's list is wired with it`, { l0, pr: pr.ok, l1 });
  console.log('— L16 the day turns while the counter is held (r4201)');
  {
    let clock = T;
    const w = world('l16'); fs.writeFileSync(w.F.usage, usageDoc(0.001)); fs.writeFileSync(w.F.journal, killedJournal());
    placed.add(w.F.usage);
    const e = w.engine({ now: () => clock });
    clock = T + 24 * 3600e3;   // past midnight (the zone is UTC here): a new day while the counter is held
    placed.delete(w.F.usage); await e.readAgain();
    const st = e.status().today, n = asked;
    const r = await judge(e, 61);
    ok(st.day === M.dayOf(clock, 0) && st.day !== DAY && ((st.total && st.total.usd) || 0) === 0 && !st.unknown && r.ok && asked === n + 1,
      `the counter lifts on a NEW day: yesterday's killed reservation (0.05 USD) is not raised into today (${st.day}: ${((st.total && st.total.usd) || 0)} USD spent), so today's judgment is sent (${asked - n} asked)`, { day: st.day, total: st.total, r });
  }

  console.log('— L17 nothing is appended between the journal\'s two «not there» tries (r4201)');
  {
    const w = world('l17'); fs.writeFileSync(w.F.usage, usageDoc(0.001)); fs.writeFileSync(w.F.journal, journalOf(0.05));
    placed.add(w.F.journal);
    const e = w.engine(), n = asked;
    placed.delete(w.F.journal); plans.set(w.F.journal, ['enoent']);
    const before = bytes(w.F.journal);
    await e.readAgain();   // the first «not there»: only the next try is armed
    const r1 = await judge(e, 71), r2 = await judge(e, 72);   // refusals: each would journal a line were the journal not held
    const quiet17 = await settled([w.F.journal]);
    const between = bytes(w.F.journal);
    await e.readAgain();   // the true file
    const r3 = await judge(e, 73);
    plans.delete(w.F.journal);
    ok(quiet17 && between === before && r1.why === 'spend-unread' && r2.why === 'spend-unread' && r3.why === 'daily-budget' && asked === n,
      `between the two «not there» tries the refusals append NOTHING (the journal's bytes unchanged, nothing pending at the store writer); the true file read next ⇒ «${r3.ok ? 'answered' : r3.why}»`, { quiet17, same: between === before, r1, r2, r3 });
  }
} catch (e) { fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e)); }

fs.readFileSync = realRF; fs.openSync = realOpen; fs.promises.readFile = realPRF;
try { fake.close(); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
