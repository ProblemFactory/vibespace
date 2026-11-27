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
//   ⑤ THE CALLERS (a static census, 主开发 r4993 (a)): every call of the three doors in src/ and server.js (r5188) sits in a function
//      that answers the held refusal by its one helper (isLedgerHeld); a caller that does not is red BY NAME. RED: a copy with one
//      handler removed, and a door planted into a copy of server.js's text.
// THE REQUIRED FOLLOW (主开发 r5188), each red at 5b42f5226:
//   ⑥ THE TURN's START ends the turn before's held mark (claude's init through the brain's one opener; codex task_started; ACP
//      prompt_start — never a backlog's): a turn the wrapper's death ended (no result record) no longer silences the next turn's wall.
//   ⑥b (主开发 r5371) the device feed ahead of the parse: a device-first start never clears the mark, so the parse's end of the
//      turn before is the held verdict on it (the order where the parse's own copies were dropped late and its result read live).
//   ⑦ the banner asks «the ledger is held now» of a POOLED conversation only: a login of its own is marked by its banner.
//   ⑧ THE CODEX WALL ROAD: an unstamped codex process whose held member is unknown because the ledger is held — its refusal is filed
//      nowhere (it never stamps a request-out instant, so the release filed it on the link), the turn's mark is set, no switch is
//      asked, no account is rung; and the round's two small lines name the ledger (the held member's line, the press's second branch).
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
  return { am, eng, s, A, B, P, R5, R7, caches, getUsageAsks, written, sessions, cacheDir };
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
  const reaches = (src) => /slot-transitions\.js|SlotTransitions|slotTransitions|\btransitions\s*\.\s*(all|slotAt|transitionsFor)\s*\(/.test(src);
  const WALKED = [...walk('src'), 'server.js'];   // r5188: the hub's own wiring too (server.js builds the stores it hands out)
  const FILES = WALKED.filter((f) => f !== 'src/slot-transitions.js' && reaches(read(f)));
  const texts = Object.fromEntries(FILES.map((f) => [f, read(f)]));
  const rows = census(texts);
  const bad = rows.filter((r) => !r.listed || !r.handled);
  ok(rows.length >= 6 && !bad.length, `⑤ CENSUS: ${rows.length} calls of the three doors, each in a listed function that answers the held refusal (isLedgerHeld) — unhandled: ${bad.map((r) => `${r.file} ${r.fn} (${r.door})`).join('; ') || 'none'}`, bad);
  const E = texts['src/server/usage-pool-engine.js'], at = E.indexOf('function requestSlotFor('), h = at < 0 ? -1 : E.indexOf('isLedgerHeld(', at);
  const cut = { ...texts, 'src/server/usage-pool-engine.js': h < 0 ? E : E.slice(0, h) + 'isLedgerHeldGone(' + E.slice(h + 'isLedgerHeld('.length) };   // requestSlotFor's own handler removed
  const redBad = census(cut).filter((r) => !r.listed || !r.handled);
  ok(redBad.length >= 1, `⑤ RED: a copy whose first handler is removed is named by the census: ${redBad.map((r) => `${r.file} ${r.fn}`).join('; ')}`, redBad);
  const planted = read('server.js') + '\nfunction plantedDoor() {\n  return slotTransitions.all();\n}\n';   // a door called in server.js with no handler (its own function, on its own lines)
  const srvBad = reaches(planted) ? census({ 'server.js': planted }).filter((r) => r.file === 'server.js' && (!r.listed || !r.handled)) : [];
  ok(WALKED.includes('server.js') && srvBad.length >= 1, `⑤ r5188: the walk reads server.js too (${WALKED.length} files walked) — a door planted into a copy of its text is named: ${srvBad.map((r) => `${r.file} ${r.fn}`).join('; ') || 'none'}`, srvBad);
}

console.log('⑥ r5188 (1): THE TURN\'s START ends the turn before\'s held mark — a turn the wrapper\'s death ended (no result record) silences no REAL wall of the next');
{
  const w = world();
  const BR = require(path.join(REPO, 'src/server/session-brain.js'));
  BR.create({ engine: { noteTurnStart: w.eng.noteTurnStart }, applyTaskToolUpdate() { }, updateSessionTodos() { }, getUsageHistory: () => null });   // the ONE turn opener of both feeds, told the engine's turn start as server.js tells it
  let initN = 0;
  const init = (extra = {}) => BR.noteTurnOpener(w.s, { type: 'system', subtype: 'init', uuid: `init-${++initN}-${Date.now()}`, session_id: w.s.claudeSessionId, ...extra }, 'parse');
  const rejected = () => w.eng.recordRateLimitEvent(w.s, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', utilization: 1, resets_at: w.R5, resetsAt: w.R5 } });
  const q = quietLog();
  const events = []; const origEvent = global.__vsEvent; global.__vsEvent = (name, v) => { events.push(String(name)); try { origEvent && origEvent(name, v); } catch { } };
  let threw = null, planted = false, keptOnSub = false, lifted = false, opened = false, cleared = false, t2From = 0;
  try {
    init();   // turn 1 opens
    await sleep(3); w.s._lastRequestOutAt = Date.now(); await sleep(3);   // its request went out (on B)
    refuse = ledgerOnly; w.eng.slotTransitions._cache = null;
    rejected();   // its wall while the ledger cannot be read: the turn's held mark is set
    planted = !!w.s._turnLedgerHeld;   // WITNESS: the product read the placed refusal (its own mark is there)
    init({ parent_tool_use_id: 'toolu-sub' });   // a sub-agent's init inside that turn is no turn's start of the conversation
    keptOnSub = !!w.s._turnLedgerHeld;
    // …and the wrapper DIES: no result record, so noteTurnEnd never runs. The ledger reads again on its own ladder
    refuse = null;
    lifted = await until(() => { try { return Array.isArray(w.eng.slotTransitions.all()); } catch { return false; } });
    t2From = q.said.length;
    init();   // turn 2 opens (the next process's first turn)
    opened = w.s._turnLive === true;
    cleared = !w.s._turnLedgerHeld;
    await sleep(3); w.s._lastRequestOutAt = Date.now(); await sleep(3);
    rejected();   // turn 2's REAL wall, the ledger readable: its rejection, its banner, its end
    w.eng.markLimitBanner(w.s, "You've reached your 5-hour limit");
    w.eng.noteTurnEnd(w.s, { type: 'result', result: "You've reached your 5-hour limit" });
  } catch (e) { threw = e; }
  q.done(); global.__vsEvent = origEvent; refuse = null;
  const t2 = q.said.slice(t2From);
  const t2Ledger = t2.filter((l) => l.includes('slot-transitions.jsonl'));
  const judged = events.some((e) => e === 'wall-demote' || e === 'wall-demote-held' || e === 'wall-refuted');
  ok(!threw, `⑥ no throw reaches the caller (${threw ? threw.message : 'none'})`);
  if (!(planted && lifted && opened)) console.log(`  ⊘ SKIP ⑥ the turn's start — the plant was not read (the held mark set by turn 1's wall: ${planted}; the ledger read again: ${lifted}; turn 2's init taken by the opener: ${opened})`);
  else {
    ok(keptOnSub, '⑥ control: a SUB-AGENT\'s init inside the held turn leaves its mark (only the main thread\'s init starts a turn)');
    ok(cleared, '⑥ turn 2\'s START (its init, taken once by the brain\'s one opener) ends turn 1\'s held mark — turn 1 ended with no result record');
    ok(judged && !t2Ledger.length, `⑥ turn 2's REAL wall is judged on its member at its end (${events.filter((e) => /^wall-/.test(e)).join(', ') || 'no wall event'}), and nothing of turn 2 says the ledger is held (${JSON.stringify(t2Ledger.slice(0, 2))}) — RED at 5b42f5226: the carried mark silenced it`, { events, t2Ledger });
  }
  // THE OTHER TWO TURN STARTS: codex's task_started and an ACP prompt_start (the real consumers, the real engine) — a live one ends
  // the mark; a backlog's (a record an hour old, the attach's replay) never does
  const engOf = () => engMod.create({ app: { get() { }, post() { }, put() { }, delete() { }, patch() { }, use() { }, locals: {} }, rootDir: dir('cons'), USAGE_CACHE_DIR: path.join(dir('cons'), 'usage-cache'), activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => null, getHosts: () => null, getUsageHistory: () => null, recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null, getSessionMetaStore: () => ({ readSessionMeta: () => ({}), writeSessionMeta() { }, patchSessionMeta: () => Promise.resolve(true) }) });
  const consumerRun = (rel, backend, rec) => {
    const eng = engOf();
    const sx = { backend, mode: 'chat', _webuiId: 'w-' + backend, sockName: 'sock-' + backend, backendSessionId: 'th-' + backend, buffer: '', _turnLedgerHeld: { at: Date.now() - 3600e3 } };
    let feed = null; const pty = { onData: (cb) => { feed = cb; }, onExit() { }, write() { } };
    require(path.join(REPO, rel)).create({ engine: eng, noteHarnessModels() { }, deliverRef: null, permissionRulesRef: null }).attach(sx, sx._webuiId, pty, { feedLive() { }, broadcastToSession() { }, broadcastActiveSessions() { }, readSessionMeta: () => ({}), writeSessionMeta() { }, updateSessionTodos() { } });
    const line = (o) => feed && feed(JSON.stringify(o) + '\n');
    line(rec(new Date(Date.now() - 3600e3).toISOString(), 't-old'));   // the attach's replayed backlog: an hour old
    const keptLate = !!sx._turnLedgerHeld;
    line(rec(new Date().toISOString(), 't-new'));
    return { keptLate, clearedLive: !sx._turnLedgerHeld };
  };
  const qc = quietLog();
  let cx = null, ac = null, cthrew = null;
  try {
    cx = consumerRun('src/server/stdout/codex-events.js', 'codex', (ts, turn) => ({ type: 'event_msg', timestamp: ts, payload: { type: 'task_started', turn_id: turn } }));
    ac = consumerRun('src/server/stdout/acp-events.js', 'antigravity', (ts) => ({ ts, type: 'acp', kind: 'prompt_start' }));
  } catch (e) { cthrew = e; }
  qc.done();
  ok(!cthrew && !!cx && cx.keptLate && cx.clearedLive, `⑥ codex: a LIVE task_started ends the held mark, a backlog's (an hour old) leaves it — the real codex-events consumer (${cthrew ? cthrew.message : JSON.stringify(cx)})`, cx);
  ok(!cthrew && !!ac && ac.keptLate && ac.clearedLive, `⑥ ACP: a LIVE prompt_start ends the held mark, a backlog's (by its own stamp) leaves it — the real acp-events consumer (${cthrew ? cthrew.message : JSON.stringify(ac)})`, ac);
}

console.log('⑥b r5371: THE DEVICE FEED AHEAD OF THE PARSE — a device-first start never clears the held mark: the parse runs the turn before\'s end on it');
{
  const w = world();
  const BR = require(path.join(REPO, 'src/server/session-brain.js'));
  BR.create({ engine: { noteTurnStart: w.eng.noteTurnStart }, applyTaskToolUpdate() { }, updateSessionTodos() { }, getUsageHistory: () => null });
  const initRec = (n) => ({ type: 'system', subtype: 'init', uuid: `dinit-${n}-${Date.now()}`, session_id: w.s.claudeSessionId });
  const before = w.caches();
  const q = quietLog();
  const events = []; const origEvent = global.__vsEvent; global.__vsEvent = (name, v) => { events.push(String(name)); try { origEvent && origEvent(name, v); } catch { } };
  let threw = null, planted = false, opened = false, kept = false;
  const next = initRec(2);
  try {
    BR.noteTurnOpener(w.s, initRec(1), 'parse');   // turn N opens (the parse took its init first)
    await sleep(3); w.s._lastRequestOutAt = Date.now(); await sleep(3);   // its request went out (on B)
    refuse = ledgerOnly; w.eng.slotTransitions._cache = null;
    // turn N's wall while the ledger cannot be read, run off the DEVICE feed ahead of the parse (the engine's calls are the same for
    // either feed): its rejection and its banner — the turn's held mark is set
    w.eng.recordRateLimitEvent(w.s, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', utilization: 1, resets_at: w.R5, resetsAt: w.R5 } });
    w.eng.markLimitBanner(w.s, "You've reached your 5-hour limit");
    planted = !!w.s._turnLedgerHeld;   // WITNESS: the product read the placed refusal (its own mark is there)
    // THE STALL, PLACED (never load): the parse stops before turn N's result, and the device brings turn N+1's init first
    BR.noteTurnOpener(w.s, next, 'device');
    opened = w.s._turnLive === true;   // WITNESS: the opener took the device's init (turn N+1 runs by its records)
    kept = !!w.s._turnLedgerHeld;
    // the parse resumes at turn N's result, its own copies of the rejection and the banner dropped as late (r5371's order: none of
    // them sets the mark again), the result itself judged live
    w.eng.noteTurnEnd(w.s, { type: 'result', result: "You've reached your 5-hour limit" });
    BR.noteTurnOpener(w.s, next, 'parse');   // …then the parse's copy of turn N+1's init (the device took it first)
  } catch (e) { threw = e; }
  q.done(); global.__vsEvent = origEvent; refuse = null;
  const after = w.caches();
  const judged = events.filter((e) => e === 'wall-demote' || e === 'wall-demote-held' || e === 'wall-refuted');
  const heldVerdict = q.said.filter((l) => /a walled turn is not judged on any account — the slot ledger \(slot-transitions\.jsonl\)/.test(l));
  ok(!threw, `⑥b no throw reaches the caller (${threw ? threw.message : 'none'})`);
  if (!(planted && opened)) console.log(`  ⊘ SKIP ⑥b the device feed ahead of the parse — the plant was not read (the held mark set by turn N's wall: ${planted}; turn N+1's device init taken by the opener: ${opened})`);
  else {
    ok(kept, '⑥b turn N+1\'s DEVICE-first init, ahead of the parse\'s result of turn N, leaves the held mark (only an init the parse takes first clears it) — RED at a52bd1d9b: it cleared the mark');
    ok(heldVerdict.length === 1 && !judged.length && after[w.A] === before[w.A] && after[w.B] === before[w.B], `⑥b the parse's end of turn N is the held verdict on it: judged on no account (${JSON.stringify(heldVerdict.slice(0, 1))}), no demotion (${judged.join(', ') || 'no wall event'}), neither member's numbers moved — RED at a52bd1d9b: the banner's signal with no stated reset was judged «write» and the turn demoted Member B on a guess`, { judged, changed: [w.A, w.B].filter((id) => after[id] !== before[id]) });
  }
}

console.log('⑦ r5188 (2): the banner asks «the ledger is held now» of a POOLED conversation only — a login of its own is marked by its banner');
{
  const w = world();
  const C = w.am.createSubscription({ name: 'Member C' }).id;
  fs.writeFileSync(path.join(w.am.subDir(C), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + C, refreshToken: 'r', expiresAt: Date.now() + 36e5, subscriptionType: 'max' } }), { mode: 0o600 });
  fs.writeFileSync(path.join(w.cacheDir, C + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60000, source: 'cli-usage', fiveHour: { utilization: 0.1, resetsAt: w.R5 }, sevenDay: { utilization: 0.3, resetsAt: w.R7 } }));
  const own = { backend: 'claude', mode: 'chat', host: null, _webuiId: 'w-own', claudeSessionId: 'c-own', _accountId: C, _servedModel: 'claude-fable-5', _servedModelAt: Date.now(), name: 'own', pty: { write() { } } };
  w.sessions.set(own._webuiId, own);
  const cacheC = () => origRFS(path.join(w.cacheDir, C + '.json'), 'utf8');
  const beforeC = cacheC(), before = w.caches();
  refuse = ledgerOnly; w.eng.slotTransitions._cache = null;
  try { w.eng.slotTransitions.all(); } catch { }   // the ledger is HELD now (a read refused)
  const heldNow = !!(w.eng.slotTransitions.held && w.eng.slotTransitions.held());   // WITNESS: the hold the banner asks about is there
  const q = quietLog();
  let threw = null;
  try {
    w.eng.markLimitBanner(own, "You've reached your 5-hour limit");   // the conversation on a login of its own
    w.eng.markLimitBanner(w.s, "You've reached your 5-hour limit");   // control: the POOLED conversation, the same hold
  } catch (e) { threw = e; }
  q.done(); refuse = null;
  const afterC = cacheC(), after = w.caches();
  let fiveC = null; try { fiveC = JSON.parse(afterC).fiveHour || null; } catch { fiveC = null; }
  ok(!threw, `⑦ no throw reaches the caller (${threw ? threw.message : 'none'})`);
  if (!heldNow) console.log('  ⊘ SKIP ⑦ the banner under a hold — the plant was not read (the ledger did not answer held)');
  else {
    ok(afterC !== beforeC && !!fiveC && Number(fiveC.utilization) === 1 && !own._turnLedgerHeld, `⑦ a NON-POOLED conversation's banner while the ledger is held marks ITS login (Member C's 5-hour window: ${JSON.stringify(fiveC)}) and sets no held mark — RED at 5b42f5226: it lost the mark`, { fiveC, mark: own._turnLedgerHeld || null });
    ok(after[w.A] === before[w.A] && after[w.B] === before[w.B] && !!w.s._turnLedgerHeld, '⑦ control: the POOLED conversation\'s banner under the same hold marks no account (its turn\'s held mark set)', { changed: [w.A, w.B].filter((id) => after[id] !== before[id]) });
  }
}

console.log('⑧ r5188 (3): the CODEX wall road under a hold — its refusal filed nowhere, the turn\'s mark set, no switch asked, no account rung; the smalls\' two lines');
{
  const cxWorld = () => {
    const root = dir('cx'), dataDir = path.join(root, 'data');
    const prevHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = path.join(root, 'shared-codex');
    let am = null, A = null, B = null, P = null;
    try {
      am = new AccountManager({ dataDir });
      // two DISTINCT identities (an id_token each, the real auth.json shape), as test-codex-pool's world builds them
      const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sub = (name) => {
        const { id } = am.createCodexSubscription({ name });
        const tag = name.replace(/\W+/g, '');
        const idTok = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ email: tag.toLowerCase() + '@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus', chatgpt_account_id: 'acct-' + tag } })}.sig`;
        fs.writeFileSync(path.join(am.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + tag, id_token: idTok } }));
        return id;
      };
      A = sub('Cx Alpha'); B = sub('Cx Beta');
      am.createPool({ name: 'CxPool', backend: 'codex' });
      P = am.list().accounts.find((a) => a.type === 'pooled' && a.backend === 'codex').id;
      am.setPoolTarget(P, A); am.updatePool(P, { auto: true });
    } finally { if (prevHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevHome; }
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const nowS = Math.floor(Date.now() / 1000);
    const cache = (u) => ({ fetchedAt: Date.now() - 60e3, source: 'codex-rate-limits', limitId: 'codex', fiveHour: { utilization: u, usedPercent: u * 100, windowMinutes: 300, resetsAt: nowS + 3600 }, sevenDay: { utilization: u, usedPercent: u * 100, windowMinutes: 10080, resetsAt: nowS + 3 * 86400 } });
    for (const id of [A, B]) fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify(cache(0.3)));   // equal: no pass moves anything
    const sessions = new Map();
    const eng = engMod.create({
      app: { get() { }, post() { }, put() { }, delete() { }, patch() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { },
      serverSetting: () => undefined, getAccounts: () => am, getHosts: () => null, getUsageHistory: () => null,
      recordUsageAttribution() { }, adapterRegistry: { get() { return null; } }, getAutoResume: () => null, getQuotaProbe: () => null,
    });
    const caches = () => Object.fromEntries([A, B].map((id) => [id, origRFS(path.join(cacheDir, id + '.json'), 'utf8')]));
    return { am, eng, A, B, P, sessions, caches, nowS };
  };
  const w = cxWorld();
  // THE PLANT FIRST: the ledger cannot be read before the conversation exists, so nothing names its held member before the hold —
  // an UNSTAMPED process (no spawn stamp: the pool default row before its start would name Cx Alpha), as a process older than the stamp
  refuse = ledgerOnly; w.eng.slotTransitions._cache = null;
  try { w.eng.slotTransitions.all(); } catch { }
  await sleep(3);
  const wrote = [];
  const s = { backend: 'codex', mode: 'chat', host: null, _webuiId: 'cx-held', backendSessionId: 'thread-held', _accountId: w.P, name: 'cx', createdAt: Date.now(), _isStreaming: true, _turnState: 'running', pty: { write(x) { wrote.push(String(x)); } } };
  let pm = null; try { pm = w.am.poolMemberOfSession(w.P, s); } catch { pm = null; }
  const readPlant = !!(pm && pm.origin === 'unknown' && pm.why === 'ledger-held');   // WITNESS: the product's own answer read the placed refusal
  w.sessions.set(s._webuiId, s);
  const passes = () => ((w.eng._poolDecisions && w.eng._poolDecisions.get(w.P)) || {}).pool || 0;
  const ring = (id) => (w.eng._wallRing.get(id) || []).length;
  const q = quietLog();
  const events = []; const origEvent = global.__vsEvent; global.__vsEvent = (name, v) => { events.push(String(name)); try { origEvent && origEvent(name, v); } catch { } };
  let threw = null, k = 0, used = 0, press = null, fromWall = 0;
  const before = w.caches(), ringBefore = [ring(w.A), ring(w.B)];
  try {
    const p0 = passes(); w.eng.maybePoolAutoSwitch(s); k = passes() - p0;   // WITNESS of the counter: what ONE ask of the pool counts here
    fromWall = q.said.length;
    const p1 = passes();
    w.eng.recordCodexQuotaSignal(s, { type: 'task_failed', codexErrorInfo: 'usage_limit_reached', resetsAt: w.nowS + 7200 });   // the codex wall (its task_failed IS the turn's end)
    used = passes() - p1;
    press = await w.eng.refreshCodexForPerson({ key: w.A });   // a person's ⟳ on the member the held conversation's pool lists
  } catch (e) { threw = e; }
  q.done(); global.__vsEvent = origEvent; refuse = null;
  const after = w.caches(), ringAfter = [ring(w.A), ring(w.B)];
  let cur = null; try { cur = w.am.poolCurrent(w.P); } catch { cur = null; }
  const named = q.said.slice(fromWall).filter((l) => /^\[(wall|usage|reset-credit|codex-quota)\]/.test(l) && (l.includes(w.A) || l.includes(w.B) || /Cx (Alpha|Beta)/.test(l)));   // the wall road's own lines
  const wallSaid = q.said.filter((l) => /a codex usage-limit wall is marked on no account — the slot ledger \(slot-transitions\.jsonl\) could not be read — no move is read from it until it reads again — the wall's road asks no switch$/.test(l));   // r5230: the words say only what the wall's road keeps (the turn's end keeps its own pass)
  const wrongCause = q.said.filter((l) => /no spawn stamp|started before the pool stamped/.test(l));
  const ledgerCause = q.said.filter((l) => /which login this process holds is not read — the slot ledger \(slot-transitions\.jsonl\)/.test(l));
  ok(!threw, `⑧ no throw reaches the caller (${threw ? threw.message : 'none'})`);
  if (!readPlant) console.log(`  ⊘ SKIP ⑧ the codex wall under a hold — the plant was not read (the conversation's held member answered ${JSON.stringify(pm)})`);
  else {
    ok(after[w.A] === before[w.A] && after[w.B] === before[w.B], '⑧ the codex wall\'s refusal is filed NOWHERE while its held member is unknown because the ledger is held — neither member\'s numbers moved (RED at 5b42f5226: written on the link, Cx Alpha)', { changed: [w.A, w.B].filter((id) => after[id] !== before[id]) });
    ok(ringAfter[0] === ringBefore[0] && ringAfter[1] === ringBefore[1], `⑧ no account is RUNG (ring ${JSON.stringify(ringBefore)} → ${JSON.stringify(ringAfter)}) — RED at 5b42f5226: the link's member`, { ringBefore, ringAfter });
    if (k < 1) console.log(`  ⊘ SKIP ⑧ no switch asked — the pool's pass counter counted nothing for one ask here (${k})`);
    else ok(used === k && cur === w.A, `⑧ no switch is asked: the pool's default stays Cx Alpha (${cur === w.A ? 'Cx Alpha' : cur === w.B ? 'Cx Beta' : cur}) and the road's pool passes (${used}) are the turn end's one (${k} an ask) — RED at 5b42f5226: the wall filed on the link read Cx Alpha spent, and the escape ladder's ask moved the default to Cx Beta (its 10 s gate then held the turn end's pass)`, { used, k, cur });
    ok(wallSaid.length === 1 && !named.length, `⑧ it is SAID once, naming the ledger and no account: ${JSON.stringify(wallSaid.slice(0, 1))}; lines naming an account: ${JSON.stringify(named.slice(0, 2))}`, { wallSaid, named });
    ok(!wrongCause.length && ledgerCause.length === 1, `⑧ the round's small: «which login this process holds» names the LEDGER as its cause (once), never «no spawn stamp … until it restarts»: ${JSON.stringify((wrongCause.length ? wrongCause : ledgerCause).slice(0, 1))}`, { wrongCause, ledgerCause });
    ok(!!press && press.code === 'holder_unknown' && /slot-transitions\.jsonl/.test(String(press.error)) && !wrote.some((x) => /codex-read-limits/.test(x)), `⑧ the round's small: a person's ⟳ on a member whose running conversation is held is refused naming the LEDGER (the press's second branch), and nothing is read: «${press && String(press.error).slice(0, 140)}»`, press);
  }
}

report();
