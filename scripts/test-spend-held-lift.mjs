#!/usr/bin/env node
// B-ef83 unit 1 (主开发 r4320 / r4323): A TURN THE SPEND GATE COULD NOT JUDGE NEVER LOSES THE THING. The family «the gate could not
// judge» (src/spend-authorizer.js HELD_WHYS: the ledger's lock kept by another process — a restart's seconds — or unwritable /
// unreadable, the ledger or the settings unread) lifts by each hold's OWN event (spend-guard onGateFree); what such a refusal met is
// kept and asked ONCE at that lift: (iii) the park's entries (a parked frame, a paced wake, an ended conversation's wake), (iv) a
// first try's wake for a caller that parks, (i) a dispatch's compaction (never recorded «delivered»), (ii) an automation's
// once-grant released. Each hold is PLACED (a refusing stand-in authorizer and the guard's own lift event — never a second
// process, never load); every world is a scratch one, every name made up. The REDs are today's drops.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError('ok(!!()): the condition must be a boolean (write !!x), never ' + typeof c); if (typeof n !== 'string' || !n) throw new TypeError('ok(!!()): a name'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CD = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const SG = require(path.join(REPO, 'src/server/spend-guard.js'));
const SA = require(path.join(REPO, 'src/spend-authorizer.js'));
const PM = require(path.join(REPO, 'src/peer-messaging.js'));
const WD = require(path.join(REPO, 'src/server/worker-dispatch.js'));
const MUT = mutantCopies('spend-held-lift', REPO);
const copyOf = (rel, from, to, why) => { try { return require(MUT.write(rel, anchored(fs.readFileSync(path.join(REPO, rel), 'utf8'), from, to, why))); } catch (e) { return { err: String((e && e.message) || e).slice(0, 160) }; } };
const serveSock = (p) => { if (fs.existsSync(p)) return; const s = net.createServer((c) => c.destroy()); s.on('error', () => { }); s.listen(p); s.unref(); };
let seq = 0;
function rig(name, { dataDir = null, pid = process.pid, now0 = 1_700_000_000_000, Deliver = CD } = {}) {
  const dir = dataDir || path.join(scratchDir('shl'), name);
  fs.mkdirSync(dir, { recursive: true });
  const reg = path.join(dir, 'registry'); fs.mkdirSync(reg, { recursive: true });
  const cid = 'c0ffee00-0000-4000-8000-00000000' + String(seq++).padStart(4, '0');
  const sockPath = path.join(dir, 'inbox.sock');
  fs.writeFileSync(path.join(reg, `${pid}.json`), JSON.stringify({ pid, sessionId: cid, messagingSocketPath: sockPath, name: 'Owner', version: '2.1.281' }));
  serveSock(sockPath);
  const posts = [], ledger = [], releases = [], authorized = [], cards = [], logs = [], events = [];
  let answer = () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 });
  const session = { claudeSessionId: cid, backendSessionId: cid, mode: 'chat', backend: 'claude', name: 'Owner', _isStreaming: true };
  const sessions = new Map([['w1', session]]);
  // the manual clock: `now` is read by the park, timers fire when the test advances it
  let now = now0; const timers = [];
  const clock = { now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn, id: timers.length }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
  async function advance(ms) { const until = now + ms; while (true) { const due = timers.filter((t) => !t.dead && !t.fired && t.at <= until).sort((a, b) => a.at - b.at)[0]; if (!due) break; now = Math.max(now, due.at); due.fired = true; await due.fn(); await sleep(0); } now = until; }
  let holdSeq = 0, refuse = null, throwAuth = false;
  const deliver = Deliver.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined,
    peerMsg: { findPeer: (c) => PM.findPeer(c, reg), postToPeer: async (p, text, o) => { const r = await answer(p, text, o); if (r.ok) posts.push(text); return r; }, postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: (req) => { if (throwAuth) throw new Error('guard down'); authorized.push(req.reason); if (refuse) return { ok: false, why: refuse, detail: refuse + ' reached', retryAfter: 60000, identity: { key: 'acct', name: 'Work' }, limits: { perIdentityHour: 30 } }; return { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'h' + (++holdSeq), reason: req.reason }; },
    noteSpend: (rec) => ledger.push({ reason: rec.reason, hold: rec.hold }), releaseSpend: (rec) => releases.push(rec.hold),
    emitPeerCard: (c, card) => cards.push(card), log: (...a) => logs.push(a.join(' ')), retryClock: clock });
  deliver.onRetry((ev, c, entry, extra) => { events.push({ ev, cid: c, id: entry.id, extra }); if (ev === 'fell') return false; });
  return { dir, reg, cid, session, sessions, deliver, posts, ledger, releases, authorized, cards, logs, events, clock, advance, timers, setAnswer: (fn) => { answer = fn; }, setRefuse: (w) => { refuse = w; }, setThrow: (b) => { throwAuth = b; }, now: () => now, setNow: (t) => { now = t; }, pid, sockPath };   // setNow (verify r4): the wall clock steps
}

const NOTIFY = (R) => R.deliver.deliverToConversation(R.cid, 'Background Work · nightly finished: 2 new rows', { fromName: 'Background Work · nightly', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-1' } } });
const onDisk = (R) => { try { return JSON.parse(fs.readFileSync(path.join(R.dir, 'msg-retry.json'), 'utf8'))[R.cid] || []; } catch { return []; } };
const lift = async (R, whys) => { SG.noteGateFree(whys); for (let i = 0; i < 4; i++) { await R.advance(0); await sleep(5); } };
const HELD = 'ledger-held-elsewhere';

console.log('§0 the family and the lift event');
{ ok(!!(SA.HELD_WHYS.join() === 'ledger-lock-unwritable,ledger-lock-unreadable,ledger-held-elsewhere,ledger-unreadable,settings-unread' && SA.isHeldWhy(HELD) && !SA.isHeldWhy('hour-cap') && !SA.isHeldWhy('day-cap') && !SA.isHeldWhy('switched-off')), 'the family «the gate could not judge»: the lock\'s three, the ledger unread, the settings unread — never a cap, a switch or a budget');
  const seen = []; const off = SG.onGateFree((x) => seen.push(x.whys.join()));
  SG.noteGateFree(['hour-cap']); SG.noteGateFree([HELD, 'day-cap']); off(); SG.noteGateFree([HELD]);
  ok(!!(seen.length === 1 && seen[0] === HELD), 'a lift names only the family\'s whys (a cap is never lifted), and a listener taken off hears nothing', JSON.stringify(seen)); }

console.log('§1 (iii) a parked frame the gate could not judge is KEPT, asked ONCE at the lift');
async function parkedHeld(Deliver = CD) {
  const R = rig('p1-' + Math.random().toString(36).slice(2, 6), { Deliver });
  await NOTIFY(R);   // a transient miss: parked, its hold on the entry
  R.setRefuse(HELD);
  await R.advance(4 * 60_000);   // the hold given back at its TTL; the next attempt asks the gate: held
  return R;
}
{ const R = await parkedHeld();
  const d = onDisk(R);
  ok(!!(R.deliver.retryCount(R.cid) === 1 && d.length === 1 && d[0].waitsLift && d[0].waitsLift.why === HELD && !R.events.some((e) => e.ev === 'fell') && R.events.some((e) => e.ev === 'held')), 'a parked frame whose re-ask meets the held gate is KEPT — marked on disk (waitsLift), never felled', JSON.stringify({ n: R.deliver.retryCount(R.cid), mark: d[0] && d[0].waitsLift, evs: R.events.map((e) => e.ev) }));
  const asked = R.authorized.length;
  await R.advance(3 * 3600_000);
  ok(!!(R.authorized.length === asked && R.deliver.retryCount(R.cid) === 1 && R.posts.length === 0), 'hours pass: no timer and no loop ask it while the hold stands; the park\'s bound does not fell it', JSON.stringify({ asked: R.authorized.length - asked, n: R.deliver.retryCount(R.cid) }));
  SG.noteGateFree(['ledger-unreadable']); await R.advance(0);
  ok(!!(R.authorized.length === asked), 'the lift of ANOTHER hold does not ask it (it waits for the lift of the hold that refused it)');
  R.setRefuse(null); R.setAnswer(async () => ({ ok: true, phase: 'written', elapsedMs: 12 }));
  await lift(R, [HELD]);
  ok(!!(R.authorized.length === asked + 1 && R.posts.length === 1 && R.ledger.length === 1 && R.deliver.retryCount(R.cid) === 0 && !R.events.some((e) => e.ev === 'fell')), 'at the lift: asked ONCE, counted ONCE, delivered — by its own road (the hours it was held never fell it at the bound)', JSON.stringify({ asked: R.authorized.length - asked, posts: R.posts.length, ledger: R.ledger.length, n: R.deliver.retryCount(R.cid), evs: R.events.map((e) => e.ev) }));
  await lift(R, [HELD]);
  ok(!!(R.authorized.length === asked + 1 && R.posts.length === 1), 'a second lift asks nothing again (nothing is asked twice)'); }
{ const R = await parkedHeld();
  R.setRefuse('ledger-unreadable');
  await lift(R, [HELD]);
  const d = onDisk(R);
  ok(!!(R.posts.length === 0 && d.length === 1 && d[0].waitsLift && d[0].waitsLift.why === 'ledger-unreadable'), 'refused held AGAIN at the lift (another hold of the family stands): owed to THAT hold\'s lift', JSON.stringify(d[0] && d[0].waitsLift));
  const asked = R.authorized.length;
  await lift(R, [HELD]);
  ok(!!(R.authorized.length === asked), '…the first hold\'s lift again asks nothing');
  R.setRefuse(null); R.setAnswer(async () => ({ ok: true, phase: 'written', elapsedMs: 12 }));
  await lift(R, ['ledger-unreadable']);
  ok(!!(R.posts.length === 1 && R.ledger.length === 1), '…and the second hold\'s lift asks it once: delivered, counted once'); }
{ const R = await parkedHeld();
  R.setRefuse('hour-cap');
  await lift(R, [HELD]);
  ok(!!(R.posts.length === 0 && R.deliver.retryCount(R.cid) === 0 && R.events.some((e) => e.ev === 'fell') && !onDisk(R).length), 'a CAP that refuses it at the lift refuses it as a cap: it falls, never owed again', JSON.stringify(R.events.map((e) => e.ev)));
  const R2 = rig('p1cap', {}); await NOTIFY(R2); R2.setRefuse('hour-cap'); await R2.advance(4 * 60_000);
  ok(!!(R2.deliver.retryCount(R2.cid) === 0 && R2.events.some((e) => e.ev === 'fell') && !R2.events.some((e) => e.ev === 'held')), 'a cap refusal is never owed (it falls as today)'); }
{ const RED = copyOf('src/server/conversation-deliver.js', "        if (SA.isHeldWhy(v.why)) { waitLift(shown, v.why); return; }   // B-ef83 unit 1: the gate could not judge — kept, asked at its lift\n", '', 'the park felling a held entry (today)');
  ok(!!(!RED.err), 'RED CONTROL built: the park\'s attempt with no held branch', RED.err);
  if (!RED.err) { const R = await parkedHeld(RED); ok(!!(R.deliver.retryCount(R.cid) === 0 && R.events.some((e) => e.ev === 'fell')), 'RED (today): the held refusal FELLS the parked frame — its wake is lost', JSON.stringify(R.events.map((e) => e.ev))); } }

console.log('§2 a restart in the middle: the park\'s file keeps the mark; the next start asks it once by its own road');
{ const R = await parkedHeld();
  R.deliver.closeRetries();
  const posts2 = [], auth2 = []; let refuse2 = HELD; let now2 = R.now(); const timers2 = [];
  const clock2 = { now: () => now2, setTimeout: (fn, ms) => { const t = { at: now2 + ms, fn }; timers2.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
  const run2 = async () => { for (let k = 0; k < 6; k++) { const due = timers2.filter((t) => !t.dead && !t.fired && t.at <= now2); if (!due.length) break; for (const t of due) { t.fired = true; await t.fn(); } await sleep(5); } };
  const D2 = CD.create({ dataDir: R.dir, activeSessions: R.sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, R.reg), postToPeer: async (p, text) => { posts2.push(text); return { ok: true, phase: 'written', elapsedMs: 9 }; }, postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: (req) => { auth2.push(req.reason); return refuse2 ? { ok: false, why: refuse2, detail: refuse2, retryAfter: 0 } : { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'k' + auth2.length, reason: req.reason }; },
    noteSpend: () => { }, releaseSpend: () => { }, emitPeerCard: () => { }, log: () => { }, retryClock: clock2 });
  await run2();
  const d = onDisk(R);
  ok(!!(auth2.length === 1 && posts2.length === 0 && d.length === 1 && d[0].waitsLift && d[0].waitsLift.why === HELD), 'the new start (held at its boot) asks the kept entry ONCE and marks it again for ITS lift', JSON.stringify({ asked: auth2.length, mark: d[0] && d[0].waitsLift }));
  refuse2 = null; SG.noteGateFree([HELD]); await run2();
  ok(!!(auth2.length === 2 && posts2.length === 1 && D2.retryCount(R.cid) === 0), '…and at its own lift: asked once more, delivered — the closed park of the old process asked nothing', JSON.stringify({ asked: auth2.length, posts2: posts2.length, oldPosts: R.posts.length }));
  ok(!!(R.posts.length === 0), '…the old process (closed) posted nothing'); try { D2.closeRetries(); } catch { } }

console.log('§3 (iv) a first try\'s wake the gate could not judge, for a caller that parks: PARKED by the same road');
async function firstHeld(Deliver = CD) { const R = rig('p4-' + Math.random().toString(36).slice(2, 6), { Deliver }); R.setRefuse(HELD); const r = await NOTIFY(R); return { R, r }; }
{ const { R, r } = await firstHeld();
  const d = onDisk(R);
  ok(!!(r.ok === false && r.parked === true && r.waitsLift === true && /not woken yet/.test(r.reason) && R.deliver.retryCount(R.cid) === 1 && d[0] && d[0].waitsLift && R.deliver.stashCount(R.cid) === 0), 'refused held at its first try ⇒ parked:true, kept for the lift — never stashed and lost; the caller is told «not woken yet … asked again when it lifts»', JSON.stringify({ r: { parked: r.parked, waitsLift: r.waitsLift, reason: r.reason }, n: R.deliver.retryCount(R.cid) }));
  R.setRefuse(null); R.setAnswer(async () => ({ ok: true, phase: 'written', elapsedMs: 9 }));
  await lift(R, [HELD]);
  ok(!!(R.posts.length === 1 && R.ledger.length === 1 && R.deliver.retryCount(R.cid) === 0), '…at the lift: woken once, counted once'); }
{ const R = rig('p4cap', {}); R.setRefuse('day-cap'); const r = await NOTIFY(R);
  ok(!!(r.ok === false && r.refused === 'spend' && !r.parked && R.deliver.retryCount(R.cid) === 0), 'a CAP at the first try is never parked for a lift (the caller stashes, as today)', JSON.stringify(r)); }
{ const RED = copyOf('src/server/conversation-deliver.js', "        if (SA.isHeldWhy(v.why) && opts.retry && typeof opts.retry === 'object') {", '        if (false) {', 'the first try with no held park (today)');
  ok(!!(!RED.err), 'RED CONTROL built: the first try with no held park', RED.err);
  if (!RED.err) { const { R, r } = await firstHeld(RED); ok(!!(!r.parked && r.refused === 'spend' && R.deliver.retryCount(R.cid) === 0), 'RED (today): refused held at its first try ⇒ NOT parked: the caller stashes the words and the wake is lost', JSON.stringify({ parked: !!r.parked })); } }

console.log('§4 (i) a dispatch\'s compaction the gate could not judge: OWED, never «delivered», asked ONCE at the lift');
function dispatchWorld(Mod = WD, { reported = 0 } = {}) {
  const FROM = 'aaaaaaaa-0000-4000-8000-0000000000a1', TO = 'bbbbbbbb-0000-4000-8000-0000000000b2';
  const ledgerMap = new Map(), ledger = { get: (k) => ledgerMap.get(k) || null, set: (k, v) => ledgerMap.set(k, v) };
  const rec = { id: 'rec-1', at: 1000, author: { id: FROM } }, wakes = [], typed = [], posts = [], asked = [];
  const member = { member: TO, reportedUpTo: reported };
  const ge = { dispatchLedger: ledger, reach: () => 'messageable', sharesGroup: () => true, findPair: () => ({ id: 'g-1', members: [member] }),
    sendToAgent: async (o) => { posts.push(o); return { ok: true, group: { id: 'g-1' }, message: rec, woke: [], refused: [], queued: [] }; },
    wake: async (gid, m, r, why) => { wakes.push({ gid, m, r: r && r.id, why }); return { ok: true }; } };
  const worker = { claudeSessionId: TO, backendSessionId: TO, mode: 'chat', backend: 'claude', name: 'Worker', _turnState: 'idle', pty: {} };   // a live chat (its pty)
  let refuse = null;
  const D = Mod.create({ activeSessions: new Map([['w-to', worker]]), getGroups: () => ge, getSendUserInput: () => (wid, text) => { typed.push(text); return { ok: true }; },
    authorizeSpend: (q) => { asked.push(q.reason); return refuse ? { ok: false, why: refuse, detail: refuse } : { ok: true, identity: { key: 'acct' }, hold: 'h' + asked.length }; },
    noteSpend: () => { }, releaseSpend: () => { }, log: () => { }, waitMs: 50, awaitEnd: async () => ({ ended: true, ms: 5 }) });
  return { D, ledgerMap, wakes, typed, posts, asked, member, rec, FROM, TO, worker, setRefuse: (w) => { refuse = w; } };
}
const dispatchHeld = async (Mod = WD, o = {}) => { const W = dispatchWorld(Mod, o); W.setRefuse(HELD); W.r = await W.D.dispatch({ from: W.FROM, target: { cid: W.TO, name: 'Worker' }, text: 'the brief', compactFirst: true }); W.entry = [...W.ledgerMap.values()][0] || null; return W; };
{ const W = await dispatchHeld();
  ok(!!(W.asked.join() === 'peer-compact' && W.posts.length === 1 && W.typed.length === 0 && W.entry && W.entry.owedCompact && W.entry.owedCompact.why === HELD && !W.entry.deliveredAt), 'refused held: the brief is posted (the free ride), the compaction is NOT made and the ledger keeps an OWED mark — never «delivered»', JSON.stringify({ r: W.r, asked: W.asked, posts: W.posts.length, entry: W.entry }));
  const again = await W.D.dispatch({ from: W.FROM, target: { cid: W.TO, name: 'Worker' }, text: 'the brief', compactFirst: true });
  ok(!!(again.ok && again.replay === true && W.posts.length === 1 && W.asked.length === 1), '…the same brief sent again meanwhile is a replay: nothing re-posted, nothing asked twice', JSON.stringify({ replay: again.replay, posts: W.posts.length }));
  W.setRefuse(null); SG.noteGateFree([HELD]); await sleep(60);
  const e2 = [...W.ledgerMap.values()][0];
  ok(!!(W.asked.length === 2 && W.typed.join() === '/compact' && W.wakes.length === 1 && W.wakes[0].r === 'rec-1' && e2 && e2.deliveredAt), 'at the lift: the compaction asked ONCE (the same authorization), made, then the worker woken for its brief by the groups engine\'s own wake; the ledger now says delivered', JSON.stringify({ asked: W.asked, typed: W.typed, wakes: W.wakes, entry: e2 })); }
{ const W = await dispatchHeld();
  W.worker._userInputAt = Date.now();   // its owner typed into it just now
  W.setRefuse(null); SG.noteGateFree([HELD]); await sleep(60);
  ok(!!(W.typed.length === 0 && W.wakes.length === 0), 'a worker its OWNER is using at the lift is never compacted (the dispatch\'s own rule): the owed compaction ends', JSON.stringify({ typed: W.typed, asked: W.asked })); }
{ const W = await dispatchHeld(WD, { reported: 5000 });
  W.setRefuse(null); SG.noteGateFree([HELD]); await sleep(60);
  ok(!!(W.typed.length === 0 && W.wakes.length === 0 && W.asked.length === 1), 'the brief rode a turn meanwhile (its report marker passed it): the owed compaction ENDS — no compaction, no wake for words that rode a turn', JSON.stringify({ typed: W.typed, wakes: W.wakes.length })); }
{ const W = await dispatchHeld();
  W.setRefuse('hour-cap'); SG.noteGateFree([HELD]); await sleep(60);
  const e3 = [...W.ledgerMap.values()][0] || null;
  ok(!!(W.typed.length === 0 && W.wakes.length === 0 && !!e3 && !!e3.deliveredAt), 'a CAP at the lift ends it as a cap (never owed again)', JSON.stringify({ e3, typed: W.typed.length })); }
{ const RED = copyOf('src/server/worker-dispatch.js', 'const owedHere = spend !== true && spend && spend.held && compactFirst === true;', 'const owedHere = false;', 'the held compaction recorded delivered (today)');
  ok(!!(!RED.err), 'RED CONTROL built: the dispatch recording a held compaction «delivered»', RED.err);
  if (!RED.err) { const W = await dispatchHeld(RED); W.setRefuse(null); SG.noteGateFree([HELD]); await sleep(60); const again = await W.D.dispatch({ from: W.FROM, target: { cid: W.TO, name: 'Worker' }, text: 'the brief', compactFirst: true });
    ok(!!(W.entry && W.entry.deliveredAt && W.typed.length === 0 && again.replay === true && W.typed.length === 0), 'RED (today): the held refusal writes «delivered» — the lift asks nothing and a re-dispatch replays «delivered»: the compaction is LOST', JSON.stringify({ entry: W.entry, typed: W.typed.length })); } }

console.log('§0b the guard says its OWN lift: the lock another process kept, taken');
{ const dir = path.join(scratchDir('shl-guard'), 'g1'); fs.mkdirSync(dir, { recursive: true });
  const lockFile = path.join(dir, 'spend-budget.lock');
  fs.writeFileSync(lockFile, JSON.stringify({ pid: 424242, host: 'another-machine.example.invalid', ident: null, at: Date.now() }));   // a keeper only its heartbeat can vouch for (a shared folder): PLACED, no second process
  const G = SG.create({ dataDir: dir, log: () => { }, schedule: () => null, unschedule: () => { } });
  const held = G.snapshot && G.snapshot().ledgerHeldBy;
  const seen = []; const off = SG.onGateFree((x) => seen.push(x.whys.join()));
  const took = G.lockAgain(Date.now() + 10 * 60_000);   // its silence measured by the guard's own first sight, past LOCK_STALE_MS
  off();
  ok(!!(!!held && took === true && seen.length === 1 && seen[0].includes(HELD) && seen[0].includes('ledger-lock-unwritable')), 'a boot held by another keeper ⇒ the lock taken when it is gone ⇒ the guard says the lock\'s holds lifted, ONCE', JSON.stringify({ held: !!held, took, seen })); }

console.log('§5 (ii) an automation\'s open the gate could not judge RELEASES its once-grant');
const ENG = require(path.join(REPO, 'src/server/automation-engine.js'));
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
async function autoWorld(Eng = ENG, bucket = HELD) {
  const dir = path.join(scratchDir('shl-auto'), Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dir, { recursive: true });
  const vault = VE.create({ dataDir: dir, kdf: { N: 1024, r: 8, p: 1 }, log: { log() { }, warn() { }, error() { } }, idleTimer: false, register: false });
  await vault.setup(['made', 'up', 'scratch', 'phrase'].join(' '), {});
  const clock = Date.UTC(2026, 10, 1, 12, 0);
  const userTodos = new UserTodoManager({ dataDir: dir, expirySweepMs: 3600e3, now: () => clock });
  const ran = [];
  const engine = Eng.create({ dataDir: dir, vault, userTodos, now: () => clock, verbs: { 'conversations.rename': () => { ran.push(1); return { ok: false, code: 'spend_refused', why: 'the spend gate refused', bucket, retryAfter: 0 }; } } });
  engine.mint({ name: 'opener', scopes: ['conversations.rename'], by: 'user' });
  const caller = { conversationId: 'conv-1', sessionKey: 'claude:conv-1', name: 'Worker one', live: true, groups: [] };
  const cards = () => (userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'automation-ask');
  const p = engine.use({ caller, verb: 'conversations.rename', args: { name: 'x' } });
  for (let i = 0; i < 100 && !cards().length; i++) await sleep(10);
  if (cards().length) engine.answer(cards()[0].action.askId, { answer: 'once' });
  const r = await p;
  const grants = ((engine.list().keys || [])[0] || {}).grants || [];
  return { r, grants, ran };
}
const onceLeft = (W) => W.grants.some((g) => g.mode === 'once' && !g.spentAt);
{ const W = await autoWorld();
  ok(!!(W.r.code === 'spend_refused' && W.r.bucket === HELD && W.ran.length === 1 && onceLeft(W)), 'refused held: the answer names the hold by its code (bucket) and the once-grant is RELEASED (there, unspent)', JSON.stringify({ code: W.r.code, bucket: W.r.bucket, grants: W.grants.map((g) => ({ mode: g.mode, spent: !!g.spentAt })) })); }
{ const W = await autoWorld(ENG, 'hour-cap');
  ok(!!(W.r.code === 'spend_refused' && W.ran.length === 1 && !onceLeft(W)), 'refused by a CAP: the once-grant stays spent (as today)', JSON.stringify(W.grants.map((g) => ({ mode: g.mode, spent: !!g.spentAt })))); }
{ const RED = copyOf('src/server/automation-engine.js', "const heldOnce = held && result && result.ok === false && result.code === 'spend_refused' && SA.isHeldWhy(result.bucket) ? { once: release() } : {};", 'const heldOnce = {};', 'the once-grant kept spent on a held refusal (today)');
  ok(!!(!RED.err), 'RED CONTROL built: the engine keeping a held refusal\'s once-grant spent', RED.err);
  if (!RED.err) { const W = await autoWorld(RED); ok(!!(W.ran.length === 1 && !onceLeft(W)), 'RED (today): a held refusal costs the owner the once-grant'); } }

console.log('§6 (iii) an ended conversation\'s owed wake the gate could not judge is KEPT');
async function endedHeld(Deliver = CD) {
  const R = rig('p6-' + Math.random().toString(36).slice(2, 6), { Deliver });
  const ended = 'dddddddd-0000-4000-8000-0000000000d6';   // no live session, no inbox: an ended conversation
  const W = { R, ended, asked: [], answer: { ok: false, outcome: 'refused', code: 'spend', why: 'the spend gate could not judge', spendWhy: HELD } };
  R.deliver.registerEndedWake(async (cid) => { W.asked.push(cid); return W.answer; });
  W.p = R.deliver.parkEndedWake(ended, { producer: 'test', spendReason: 'job-notification' });
  for (let i = 0; i < 4; i++) { await R.advance(0); await sleep(5); }
  W.disk = () => { try { return JSON.parse(fs.readFileSync(path.join(R.dir, 'msg-retry.json'), 'utf8'))[ended] || []; } catch { return []; } };
  return W;
}
{ const W = await endedHeld();
  const d = W.disk(), a = W.R.deliver.endedAnswerOf(W.ended);
  ok(!!(W.p && W.p.parked && W.asked.length === 1 && d.length === 1 && d[0].waitsLift && d[0].waitsLift.why === HELD && a && a.outcome === 'waits' && a.code === 'spend-held'), 'its probe refused held: the owed wake is KEPT (marked), the row says it waits (spend-held) — never ended', JSON.stringify({ p: W.p, asked: W.asked.length, mark: d[0] && d[0].waitsLift, a }));
  W.answer = { ok: true, outcome: 'delivered' };
  await lift(W.R, [HELD]);
  ok(!!(W.asked.length === 2 && !W.disk().length), '…at the lift: asked once more, delivered — the entry ends', JSON.stringify({ asked: W.asked.length, left: W.disk().length })); }
{ const RED = copyOf('src/server/conversation-deliver.js', "        if (r && r.outcome === 'refused' && r.code === 'spend' && SA.isHeldWhy(r.spendWhy)) {", '        if (false) {', 'the ended wake ending on a held refusal (today)');
  ok(!!(!RED.err), 'RED CONTROL built: the ended wake with no held branch', RED.err);
  if (!RED.err) { const W = await endedHeld(RED); ok(!!(W.asked.length === 1 && !W.disk().length), 'RED (today): the held refusal ENDS the owed wake — no wake ever comes'); } }

console.log('§7 (f) many owed wakes at ONE lift ride the pace: asked through its own road, never all at once');
{ const dir = path.join(scratchDir('shl-pace'), 'p7'); fs.mkdirSync(dir, { recursive: true });
  let now = 1_700_000_000_000; const timers = [];
  const clock = { now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
  const run = async (ms = 0) => { const until = now + ms; for (let k = 0; k < 40; k++) { const due = timers.filter((t) => !t.dead && !t.fired && t.at <= until).sort((a, b) => a.at - b.at)[0]; if (!due) break; now = Math.max(now, due.at); due.fired = true; await due.fn(); await sleep(2); } now = Math.max(now, until); };
  const posts = [], spendAsks = [], counted = []; let refuse = HELD, allowed = 99;
  const D = CD.create({ dataDir: dir, activeSessions: new Map(), serverSetting: () => undefined,
    peerMsg: { findPeer: (c) => ({ name: 'peer-' + c.slice(0, 4), socketPath: path.join(dir, c.slice(0, 8) + '.sock'), pid: process.pid }), postToPeer: async (p, text) => { posts.push(text); return { ok: true, phase: 'written', elapsedMs: 3 }; }, postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: (q) => { spendAsks.push(q.cid); return refuse ? { ok: false, why: refuse, detail: refuse, retryAfter: 0 } : { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'p' + spendAsks.length, reason: q.reason }; },
    noteSpend: (rec) => counted.push(rec.hold), releaseSpend: () => { }, emitPeerCard: () => { }, log: () => { }, retryClock: clock });
  D.registerOwedWake('test', { render: (cid) => ({ text: 'a wake for ' + cid.slice(0, 8), kind: 'peer', fromName: 'Tester' }) });
  D.registerWakePacer(() => Object.assign((cid) => (allowed-- > 0 ? true : { retryInMs: 30_000, reason: 'rate floor (stand-in)' }), { refund: () => { } }));
  const N = 6, cids = Array.from({ length: N }, (_, k) => `eeeeeeee-0000-4000-8000-00000000000${k}`);
  for (const c of cids) D.parkOwedWake(c, { producer: 'test', key: 'k', retryInMs: 1000, sender: 'ffffffff-0000-4000-8000-0000000000f0', reason: 'paced' });
  await run(2000);
  const marked = cids.filter((c) => { try { const q = JSON.parse(fs.readFileSync(path.join(dir, 'msg-retry.json'), 'utf8'))[c] || []; return q.length === 1 && q[0].waitsLift && q[0].waitsLift.why === HELD; } catch { return false; } });
  ok(!!(marked.length === N && posts.length === 0), `${N} owed wakes asked while the gate is held: every one KEPT for the lift, none posted`, JSON.stringify({ marked: marked.length, posts: posts.length, asks: spendAsks.length }));
  refuse = null; allowed = 1; const asks0 = spendAsks.length;
  SG.noteGateFree([HELD]); await run(0);
  ok(!!(posts.length === 1 && counted.length === 1 && spendAsks.length - asks0 === 1), `at ONE lift the ${N} go through the pace's own road: the pace lets ONE go (asked and counted once) and holds the rest — never ${N} turns in one instant`, JSON.stringify({ posts: posts.length, counted: counted.length, spendAsks: spendAsks.length - asks0 }));
  const left = cids.map((c) => { try { return (JSON.parse(fs.readFileSync(path.join(dir, 'msg-retry.json'), 'utf8'))[c] || [])[0] || null; } catch { return null; } }).filter(Boolean);
  ok(!!(left.length === N - 1 && left.every((e) => !e.waitsLift && Number(e.nextAt) > now)), '…the rest are owed to the PACE now (its own wait), no longer to the lift', JSON.stringify(left.map((e) => ({ lift: !!e.waitsLift, inMs: Number(e.nextAt) - now }))));
  try { D.closeRetries(); } catch { } }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
