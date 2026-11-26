#!/usr/bin/env node
// test-slot-ledger-held — B-f276 gap row «slot-ledger-gap» (主开发 r4989 / r4993, lane bl-mail): THE SLOT LEDGER UNDER THE STORE-READ LAW.
// data/slot-transitions.jsonl says which credential slot a reading or a rejection belongs to (money attribution). A failed read of it
// (not ENOENT) was read as «no move recorded» and kept as the file's rows, so every reader attributed on a guess. Now a failed read
// HOLDS the ledger: its three doors refuse BY NAME, and every reader fails CLOSED on the money roads. The unreadable file is made by a
// PLACED refusal of the read call (fs.readFileSync and fs.promises.readFile answer EIO for the ledger's files). Each leg reads red at
// the base 0a1d537f9:
//   ① THE DOOR: all() / slotAt() / transitionsFor() refuse by name (ELEDGERHELD) on a live file or a shard that cannot be read;
//      nothing of that read is kept; a file that is not there stays «no row» (ENOENT); a record while held still APPENDS.
//   ② THE MONEY ROADS (the real engine over a real pool): a READING while held is filed NOWHERE (no member's numbers move), said
//      once with a number, naming the ledger and no account; a REJECTION and its limit BANNER mark NO account (r5109 M1); the WALLED
//      TURN's END is its own verdict — never «refuted», the conversation met its wall on its member, no line names an account (M2).
//   ③ THE VENDOR: a panel ask of the member while held asks NOTHING (no get_usage written to the conversation), and the skip says
//      the ledger's sentence.
//   ④ THE LIFT: once the ledger reads whole again (its own ladder, off the loop) nothing is attributed late — the numbers filed
//      nowhere stay nowhere — and the lift starts NO ask by itself; the first ask after it is an ordinary one.
//   ⑤ THE CALLERS (a static census, 主开发 r4993 (a)): every call of the three doors in src/ sits in a function that answers the held
//      refusal by its one helper (isLedgerHeld); a caller that does not is red BY NAME. RED: a copy with one handler removed.
// Run: node scripts/test-slot-ledger-held.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const { ok, report } = checker();
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-slotheld-'));
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
let dirN = 0; const dir = (tag) => { const d = path.join(ROOT, `${tag}-${++dirN}`); fs.mkdirSync(d, { recursive: true }); return d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BOUND_MS = 5000;   // a fact not seen within it is a HARNESS line, never a pass
const until = async (fact, ms = BOUND_MS) => { const t = Date.now() + ms; while (!fact() && Date.now() < t) await sleep(5); return !!fact(); };

// THE PLACED REFUSAL: the read call answers EIO for the ledger's files (the live file and every archived shard) while `refuse` says so
const isLedgerFile = (p) => /(^|[\\/])slot-transitions(-\d+)?\.jsonl$/.test(String(p));
let refuse = null;
const eio = () => Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO', errno: -5, syscall: 'read' });
const origRFS = fs.readFileSync, origRF = fs.promises.readFile;
fs.readFileSync = function (p, ...a) { if (refuse && refuse(p)) throw eio(); return origRFS.call(this, p, ...a); };
fs.promises.readFile = function (p, ...a) { if (refuse && refuse(p)) return Promise.reject(eio()); return origRF.call(this, p, ...a); };
const ledgerOnly = (p) => isLedgerFile(p);
const liveOnly = (p) => /(^|[\\/])slot-transitions\.jsonl$/.test(String(p));

const LEDGER = require(path.join(REPO, 'src/slot-transitions.js'));
const { SlotTransitions } = LEDGER;
const heldCode = LEDGER.LEDGER_HELD || 'ELEDGERHELD';
const asks = (fn) => { try { return { v: fn(), err: null }; } catch (e) { return { v: null, err: e }; } };
const isHeld = (e) => !!(e && e.code === heldCode);
if (LEDGER._ledgerTestSeam) LEDGER._ledgerTestSeam({ rungs: [15, 30, 60] });   // the hold's ladder on a short stated pace here (the hub's: 1 s … 5 min)

console.log('① the door: a failed read HOLDS the ledger — its three doors refuse by name');
{
  const D = dir('door');
  const W = new SlotTransitions({ dataDir: D });
  W.record({ sessionId: 's1', poolId: 'p', from: 'a', to: 'b', at: 1000 });
  W._cache = null;   // the next read reads the file
  refuse = liveOnly;
  const a = asks(() => W.all()), s = asks(() => W.slotAt('s1', 2000)), t = asks(() => W.transitionsFor('s1'));
  const appended = asks(() => W.record({ sessionId: 's1', poolId: 'p', from: 'b', to: 'c', at: 3000 }));
  refuse = null;
  const lines = origRFS(path.join(D, 'slot-transitions.jsonl'), 'utf8').split('\n').filter(Boolean).length;
  ok(isHeld(a.err) && isHeld(s.err) && isHeld(t.err), `① all(), slotAt() and transitionsFor() REFUSE BY NAME while the live file cannot be read (${a.err ? a.err.code : 'answered ' + JSON.stringify(a.v)}) — never «no row»`, { all: a.err ? a.err.code : a.v, slotAt: s.err ? s.err.code : s.v });
  ok(lines === 2, `① a record while held still APPENDS (append-only, nothing written over): ${lines} lines on disk`, { lines, appended: appended.err ? appended.err.code : !!appended.v });
  const E = dir('door-absent');
  const R = new SlotTransitions({ dataDir: E });
  const none = asks(() => R.all());
  ok(!none.err && Array.isArray(none.v) && none.v.length === 0, '① a ledger that is NOT THERE (ENOENT) stays «no row» — not held', none.err ? none.err.code : none.v);
  const S = dir('door-shard'); fs.mkdirSync(path.join(S, 'archive'), { recursive: true });
  fs.writeFileSync(path.join(S, 'archive', 'slot-transitions-20261101.jsonl'), JSON.stringify({ sessionId: 's9', poolId: 'p', from: 'x', to: 'y', at: 5 }) + '\n');
  fs.writeFileSync(path.join(S, 'slot-transitions.jsonl'), JSON.stringify({ sessionId: 's9', poolId: 'p', from: 'y', to: 'z', at: 9 }) + '\n');
  refuse = (p) => /slot-transitions-\d+\.jsonl$/.test(String(p));
  const sh = asks(() => new SlotTransitions({ dataDir: S }).all());
  refuse = null;
  ok(isHeld(sh.err), '① an archived SHARD that cannot be read holds the ledger too (a part of the history is not «no move»)', sh.err ? sh.err.code : sh.v);
}

console.log('② the money roads: a reading filed nowhere, a rejection on no account — ③ the vendor asked nothing — ④ the lift');
const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const world = () => {
  const root = dir('world'), dataDir = path.join(root, 'data');
  const am = new AccountManager({ dataDir });
  const login = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r', expiresAt: Date.now() + 36e5, subscriptionType: 'max' } }), { mode: 0o600 });
  const A = am.createSubscription({ name: 'Member A' }).id; login(A);
  const B = am.createSubscription({ name: 'Member B' }).id; login(B);
  const P = am.createPool({ name: 'Pool' }).id;
  am.setPoolTarget(P, A); am.updatePool(P, { hot: true }); am.get(P).auto = false; am._save();
  const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
  const nowS = Math.floor(Date.now() / 1000), R5 = nowS + 2 * 3600, R7 = nowS + 3 * 86400;
  for (const id of [A, B]) fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: 0.1, resetsAt: R5 }, sevenDay: { utilization: 0.3, resetsAt: R7 } }));
  const sessions = new Map();
  const eng = engMod.create({
    app: { get() { }, post() { }, put() { }, delete() { }, patch() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
    wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
    serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
    recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null,
  });
  const written = [];
  const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'w-held', claudeSessionId: 'c-held', _accountId: P, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), name: 'work', pty: { write(x) { written.push(String(x)); } } };
  sessions.set(s._webuiId, s);
  am.ensureSessionPoolLink(P, s._webuiId, B, { why: 'spawn' });
  { const rows = am.slotTransitions.all(); const last = rows[rows.length - 1]; if (last) s._readingShadowEndedAt = last.at; }   // its spawn's lag shadow ended (a reading came): the ordinary state, so an ask follows its own rule
  const caches = () => Object.fromEntries([A, B].map((id) => [id, origRFS(path.join(cacheDir, id + '.json'), 'utf8')]));
  const getUsageAsks = () => written.filter((w) => w.includes('get_usage')).length;
  return { am, eng, s, A, B, P, R5, R7, caches, getUsageAsks, written };
};
const quietLog = () => { const said = [], o = { log: console.log, warn: console.warn }; console.log = (...a) => said.push(a.join(' ')); console.warn = (...a) => said.push(a.join(' ')); return { said, done: () => { console.log = o.log; console.warn = o.warn; } }; };
{
  const w = world();
  await sleep(3); w.s._lastRequestOutAt = Date.now(); await sleep(3);   // a request of this hub's life went out (on B)
  const before = w.caches(), asks0 = w.getUsageAsks();
  // the ledger can no longer be read (its kept rows dropped: the next read reads the file)
  refuse = ledgerOnly; w.eng.slotTransitions._cache = null;
  const q = quietLog();
  const events = []; const origEvent = global.__vsEvent; global.__vsEvent = (name, v) => { events.push(String(name)); try { origEvent && origEvent(name, v); } catch { } };
  let threw = null;
  try {
    for (let i = 0; i < 3; i++) w.eng.recordRateLimitEvent(w.s, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.77, resets_at: w.R7, resetsAt: w.R7 } });
    w.eng.recordRateLimitEvent(w.s, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', utilization: 1, resets_at: w.R5, resetsAt: w.R5 } });
    w.eng.markLimitBanner(w.s, "You've reached your 5-hour limit");   // r5109 M1: the banner of the same rejection
    w.eng.noteTurnEnd(w.s);   // r5109 M2: the walled turn's end
  } catch (e) { threw = e; }
  const probe = await Promise.race([w.eng.probeUsageForAccountKey(w.B, { detailed: true }), sleep(50).then(() => 'pending')]);
  q.done(); global.__vsEvent = origEvent;
  const allNamed = q.said.filter((l) => l.includes(w.A) || l.includes(w.B) || /Member [AB]/.test(l));
  const metWall = !!(w.eng._sessionWalls && w.eng._sessionWalls.get(w.s._webuiId) && w.eng._sessionWalls.get(w.s._webuiId).has(w.B));
  const during = w.caches(), asksHeld = w.getUsageAsks() - asks0;
  const ledgerSaid = q.said.filter((l) => l.includes('slot-transitions.jsonl'));
  const namesAccount = ledgerSaid.some((l) => l.includes(w.A) || l.includes(w.B) || /Member [AB]/.test(l));
  const skipWhy = probe && probe !== 'pending' && Array.isArray(probe.skipped) ? probe.skipped.map((x) => x.why).join(' | ') : '';
  ok(!threw, `② no refusal reaches the producer as an uncaught throw (${threw ? threw.message : 'none'})`);
  ok(during[w.A] === before[w.A] && during[w.B] === before[w.B], '② while held a READING is filed NOWHERE, a REJECTION and its BANNER on NO account, and the walled turn\'s end marks none: neither member\'s numbers moved', { changed: [w.A, w.B].filter((id) => during[id] !== before[id]) });
  ok(!allNamed.length, `② no line of the held time names an account (the reading, the rejection, the banner, the turn\'s end): ${JSON.stringify(allNamed.slice(0, 2))}`, allNamed);
  ok(metWall && !events.includes('wall-refuted'), `② THE TURN's END under the hold is its own verdict: the conversation met its wall on its member (noted: ${metWall}, so no continue is armed there) and no refutation was told (${events.filter((e) => /wall/.test(e)).join(', ') || 'no wall event'})`, { metWall, events });
  ok(ledgerSaid.length >= 1 && !namesAccount && ledgerSaid.some((l) => /\b\d+\b/.test(l)), `② it is SAID naming the ledger (slot-transitions.jsonl), with a number, never an account: ${JSON.stringify(ledgerSaid.slice(0, 2))}`, ledgerSaid);
  ok(asksHeld === 0 && /slot-transitions\.jsonl/.test(skipWhy), `③ THE VENDOR: a panel ask of the member while held asks NOTHING (${asksHeld} get_usage written) and its skip says the ledger's sentence («${skipWhy.slice(0, 160)}»)`, { asksHeld, skipWhy });
  // ④ THE LIFT: the read is refused no more; the ledger reads itself whole again on its own ladder (off the loop)
  refuse = null;
  const lifted = await until(() => { try { return Array.isArray(w.eng.slotTransitions.all()); } catch { return false; } });
  await sleep(100);
  const after = w.caches(), asksLift = w.getUsageAsks() - asks0;
  ok(lifted && after[w.A] === before[w.A] && after[w.B] === before[w.B], `④ THE LIFT (${lifted}): nothing is attributed late — the readings filed nowhere stay nowhere`, { changed: [w.A, w.B].filter((id) => after[id] !== before[id]) });
  ok(asksLift === 0, `④ the lift starts NO ask by itself (${asksLift} get_usage written since the hold began)`);
  w.eng.probeUsageForAccountKey(w.B).catch(() => { });
  ok(w.getUsageAsks() - asks0 === 1, `④ the first ask after the lift is an ordinary one: ${w.getUsageAsks() - asks0} get_usage written`);
}

console.log('②b r5109 M2: a walled turn whose ONLY signal is a held rejection — its own verdict, never «refuted»');
{
  const w = world();
  await sleep(3); w.s._lastRequestOutAt = Date.now(); await sleep(3);
  const before = w.caches();
  refuse = ledgerOnly; w.eng.slotTransitions._cache = null;
  const q = quietLog();
  const events = []; const origEvent = global.__vsEvent; global.__vsEvent = (name, v) => { events.push(String(name)); try { origEvent && origEvent(name, v); } catch { } };
  let threw = null;
  try {
    w.eng.recordRateLimitEvent(w.s, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', utilization: 1, resets_at: w.R5, resetsAt: w.R5 } });
    w.eng.noteTurnEnd(w.s);
  } catch (e) { threw = e; }
  q.done(); global.__vsEvent = origEvent; refuse = null;
  const after = w.caches();
  const named = q.said.filter((l) => l.includes(w.A) || l.includes(w.B) || /Member [AB]/.test(l));
  const metWall = !!(w.eng._sessionWalls && w.eng._sessionWalls.get(w.s._webuiId) && w.eng._sessionWalls.get(w.s._webuiId).has(w.B));
  ok(!threw && after[w.A] === before[w.A] && after[w.B] === before[w.B] && !named.length && metWall && !events.includes('wall-refuted'),
    `②b the turn's end answers the hold as its own verdict: no member's numbers moved, no line names an account (${JSON.stringify(named.slice(0, 1))}), the conversation met its wall on its member (${metWall}: no continue armed there), no refutation told (${events.filter((e) => /wall/.test(e)).join(', ') || 'no wall event'})`, { threw: threw && threw.message, named, metWall, events });
}

console.log('⑤ the callers: every call of the three doors answers the held refusal by its one helper');
{
  const SITES = [   // [file, the function holding the call, what it answers while held]
    ['src/server/usage-pool-engine.js', 'function requestSlotFor(', 'held: the reading is filed nowhere'],
    ['src/server/usage-pool-engine.js', 'function lastRepointRow(', 'held: inside a shadow — no witness, no panel ask, falls held'],
    ['src/server/usage-pool-engine.js', 'function wallAttributionFor(', 'held: the rejection archived on no account'],
    ['src/accounts.js', '  noteDeviceRepoint(', 'held: the dedup cannot look — the row appends'],
    ['src/accounts.js', '  poolMemberOfSession(', 'held: origin unknown — nothing may spend'],
    ['src/ledger-slot-backfill.js', 'function backfillLedgerBySlot(', 'a migration: MG1 strict — held is «not run»'],
    ['src/reading-repair.js', 'function repairAttribution(', 'a migration: MG1 strict — held is «not run»'],
  ];
  const DOOR = /(?:slotTransitions|transitions|this\.slotTransitions)\s*\.\s*(all|slotAt|transitionsFor)\s*\(/g;
  const fnOf = (src, at) => { const i = src.lastIndexOf('\n', at); let j = i; while (j > 0) { const k = src.lastIndexOf('\n', j - 1); const ln = src.slice(k + 1, j); if (/^(async )?function [A-Za-z_$][\w$]*\(|^  (async )?[A-Za-z_$][\w$]*\([^)]*\) \{$|^  (async )?[A-Za-z_$][\w$]*\(\{/.test(ln)) return ln; j = k; } return null; };
  const census = (texts) => {
    const out = [];
    for (const [file, src] of Object.entries(texts)) {
      for (const m of src.matchAll(DOOR)) {
        const fn = fnOf(src, m.index) || '(top level)';
        const site = SITES.find(([f, head]) => f === file && fn.startsWith(head.trim()) || (f === file && fn.trim().startsWith(head.trim())));
        const start = Math.max(0, src.lastIndexOf(fn, m.index));
        const body = src.slice(start, m.index + 1500);   // the function's head to its call and the handling close after it
        const migration = site && /a migration/.test(site[2]);
        const handled = migration || /isLedgerHeld\(/.test(body);
        out.push({ file, fn: fn.trim().slice(0, 60), door: m[1], listed: !!site, handled });
      }
    }
    return out;
  };
  // r5109: every file of src/ that can reach the ledger's doors (it names the ledger's module or an instance of it), not a list of four
  const walk = (d, out = []) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) walk(r, out); else if (/\.js$/.test(e.name)) out.push(r); } return out; };
  const FILES = walk('src').filter((f) => f !== 'src/slot-transitions.js' && /slot-transitions\.js|SlotTransitions|slotTransitions|\btransitions\s*\.\s*(all|slotAt|transitionsFor)\s*\(/.test(read(f)));
  const texts = Object.fromEntries(FILES.map((f) => [f, read(f)]));
  const rows = census(texts);
  const bad = rows.filter((r) => !r.listed || !r.handled);
  ok(rows.length >= 6 && !bad.length, `⑤ CENSUS: ${rows.length} calls of the three doors, each in a listed function that answers the held refusal (isLedgerHeld) — unhandled: ${bad.map((r) => `${r.file} ${r.fn} (${r.door})`).join('; ') || 'none'}`, bad);
  const E = texts['src/server/usage-pool-engine.js'], at = E.indexOf('function requestSlotFor('), h = at < 0 ? -1 : E.indexOf('isLedgerHeld(', at);
  const cut = { ...texts, 'src/server/usage-pool-engine.js': h < 0 ? E : E.slice(0, h) + 'isLedgerHeldGone(' + E.slice(h + 'isLedgerHeld('.length) };   // requestSlotFor's own handler removed
  const redBad = census(cut).filter((r) => !r.listed || !r.handled);
  ok(redBad.length >= 1, `⑤ RED: a copy whose first handler is removed is named by the census: ${redBad.map((r) => `${r.file} ${r.fn}`).join('; ')}`, redBad);
}

report();
