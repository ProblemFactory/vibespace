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
// Run: node scripts/test-decision-store-read.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, endScratchAtExit } from './scratch.mjs';   // §113: the first import after node's own

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
fs.readFileSync = function (p, ...a) { if (placed.has(String(p))) throw eio(p); return realRF.call(this, p, ...a); };
fs.openSync = function (p, flags, ...a) { if (placed.has(String(p)) && !/[wa+]/.test(String(flags == null ? 'r' : flags))) throw eio(p); return realOpen.call(this, p, flags, ...a); };
fs.promises.readFile = function (p, ...a) { if (placed.has(String(p))) return Promise.reject(eio(p)); return realPRF.call(this, p, ...a); };

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
function world(tag, { budgetCents = 1 } = {}) {
  const dataDir = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(dataDir, { recursive: true });
  const store = S.create({ dataDir, env: {}, log: { warn() { }, log() { } } });
  store.setIntegration('llm', { provider: 'openai', apiKey: KEY });
  let settingsObj = {};
  const settingsStore = { read: () => settingsObj, patch: (p) => { settingsObj = { ...settingsObj, ...p }; for (const [k, v] of Object.entries(settingsObj)) if (v === null) delete settingsObj[k]; } };
  const F = { usage: path.join(dataDir, 'decision-usage.json'), memo: path.join(dataDir, 'decision-memo.json'), journal: path.join(dataDir, 'decision-journal.jsonl') };
  const notices = [];
  const engine = () => {
    const e = E.create({ dataDir, integrations: store, baseUrlFor: BASE, now: () => T, tzOffset: () => 0, serverNotice: (id, text) => { notices.push({ id, text }); return 1; }, log: { warn() { } } });
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
  await sleep(150);
  const txt = (f) => { try { return realRF.call(fs, f, 'utf8'); } catch (e) { return `(${e.code})`; } };
  ok(bytes(w1.F.usage) === b1.usage && bytes(w1.F.journal) === b1.journal && !r1b.ok, 'while held: the counter\'s and the journal\'s bytes are unchanged — no write over them, no journal line appended for the refusals', { usage: bytes(w1.F.usage) === b1.usage, journal: bytes(w1.F.journal) === b1.journal, usageNow: txt(w1.F.usage).slice(0, 300), journalNow: txt(w1.F.journal).slice(-300) });
  console.log('— L7 the person told once');
  const told = w1.notices.filter((n) => /decision/.test(n.id) && /read/.test(n.text));
  ok(told.length === 1, `the person is told ONCE across ${2} refusals (${told.length} notice(s)): ${told[0] ? told[0].text.slice(0, 160) : 'none'}`, w1.notices);
  console.log('— L6 the read again lifts it: the real spend read');
  placed.delete(w1.F.usage); placed.delete(w1.F.journal);
  const lifted = typeof e1.readAgain === 'function' ? await e1.readAgain() : null;
  const r6 = await judge(e1, 3);
  ok(lifted !== null && !r6.ok && r6.why === 'daily-budget' && asked === n1, `the refusal gone, a read again (${lifted === null ? 'the engine has none' : 'read'}): the counter read is today's 0.05 USD ⇒ «${r6.why}», nothing sent`, r6);

  console.log('— L2 the memo unread: an answer already paid for');
  const w2 = world('l2', { budgetCents: 100 });
  const e2a = w2.engine(), n2a = asked;
  const paid = await judge(e2a, 7, { id: 'm7', rule: 'r1' });
  await sleep(50);
  const e2flush = w2.engine();   // a new engine in this process lands the paced memo write first (the engine's own rule)
  void e2flush;
  const hasMemo = (() => { try { return (JSON.parse(realRF.call(fs, w2.F.memo, 'utf8')).entries || []).length > 0; } catch { return false; } })();
  const bm = bytes(w2.F.memo);
  placed.add(w2.F.memo);
  const e2 = w2.engine(), n2 = asked;
  const r2 = await judge(e2, 7, { id: 'm7', rule: 'r1' });
  ok(paid.ok && asked === n2a + 1 && hasMemo && !r2.ok && r2.why === 'memo-unread' && asked === n2, `the memo holds the paid answer (asked ${n2a + 1 - n2a} once); its read placed as failing: the same ask is REFUSED by name («${r2.ok ? 'answered' : r2.why}»), never paid again (${asked - n2} asked)`, { paid: paid.ok, hasMemo, r2 });
  await sleep(150);
  ok(bytes(w2.F.memo) === bm, 'while the memo is held its bytes are unchanged (no write over the answers it holds)', { before: (bm || '').slice(0, 200), now: (bytes(w2.F.memo) || '').slice(0, 200) });
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

  console.log('— L4 the journal unread, the counter behind it (a stop before its write landed)');
  const w4 = world('l4');
  fs.writeFileSync(w4.F.usage, usageDoc(0.001)); fs.writeFileSync(w4.F.journal, journalOf(0.05));
  placed.add(w4.F.journal);
  const e4 = w4.engine(), n4 = asked;
  const r4 = await judge(e4, 11);
  ok(!r4.ok && r4.why === 'spend-unread' && asked === n4, `the journal cannot be read and the counter says 0.001 USD (under the budget): REFUSED by name («${r4.ok ? 'answered' : r4.why}») — never under-counted (${asked - n4} asked)`, r4);
  placed.delete(w4.F.journal);
} catch (e) { fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e)); }

fs.readFileSync = realRF; fs.openSync = realOpen; fs.promises.readFile = realPRF;
try { fake.close(); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
