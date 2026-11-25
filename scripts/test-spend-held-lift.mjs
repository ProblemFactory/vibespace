#!/usr/bin/env node
// B-ef83 unit 1 (主开发 r4320 / r4323): A TURN THE SPEND GATE COULD NOT JUDGE NEVER LOSES THE THING. The family «the gate could not
// judge» (src/spend-authorizer.js HELD_WHYS: the ledger's lock kept by another process — a restart's seconds — or unwritable /
// unreadable, the ledger or the settings unread) lifts by each hold's OWN event (spend-guard onGateFree); what such a refusal met is
// kept and asked ONCE at that lift: (iii) the park's entries (a parked frame, a paced wake, an ended conversation's wake), (iv) a
// first try's wake for a caller that parks, (i) a dispatch's compaction (never recorded «delivered»), (ii) an automation's
// once-grant released. Each hold is PLACED (a refusing stand-in authorizer and the guard's own lift event — never a second
// process, never load); every world is a scratch one, every name made up. The REDs are today's drops.
// THE CURE (主开发 r4410): at the lift an owed compaction asks the sender's OWN pace first (law (b)); what waits on a lift for
// one conversation is bounded by the park's own cap (the oldest falls to the stash, as at the release) and a held first try costs
// one park write; the family is pinned to the authorizer; each lift site has its leg (the lock, the ledger read again, the
// settings' lift, the ladder road); the owed record stands before the send, in MEMORY ONLY (主开发 r4473: the REAL dispatch ledger
// says «delivered» at the post, as the release — a resend is a replay), and it has an age (60 min).
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));   // waitFor's poll step only
// r4410 (f) / r4340 law 1: every wait is ON THE FACT a leg judges; its generous bound fails by a NAMED harness line (never a verdict)
async function waitFor(pred, name, ms = 10_000) {
  const t0 = Date.now();
  for (;;) {
    let v = false; try { v = !!pred(); } catch { v = false; }
    if (v) return true;
    if (Date.now() - t0 > ms) { ok(false, `HARNESS: ${name} — not come within ${ms} ms (a harness expiry, not a verdict)`); return false; }
    await sleep(10);
  }
}
// the guard's lift listeners run AFTER its own call returns (r4410 (g)): one turn of the loop and they have run
const tick = () => new Promise((r) => setImmediate(r));
const CD = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const SG = require(path.join(REPO, 'src/server/spend-guard.js'));
const SA = require(path.join(REPO, 'src/spend-authorizer.js'));
const PM = require(path.join(REPO, 'src/peer-messaging.js'));
const WD = require(path.join(REPO, 'src/server/worker-dispatch.js'));
const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
// 主开发 r4473: the dispatch worlds drive the REAL dispatch ledger (the groups engine's dispatchLedger over its own store: its merge
// and its prune on every write) and, where a leg asks, the REAL pacer (pacerFor over the same store) — never a stand-in that replaces
const realEngine = (clock) => { const dir = path.join(scratchDir('shl-ge'), Math.random().toString(36).slice(2, 8)); fs.mkdirSync(dir, { recursive: true }); const quiet = { info() { }, warn() { }, log() { } }; const store = createChannelStore({ dir: path.join(dir, 'channels'), log: quiet }); return { store, eng: GE.create({ store, dataDir: dir, now: clock, paceClock: clock, log: quiet }) }; };
const MUT = mutantCopies('spend-held-lift', REPO);
const copyOf = (rel, from, to, why) => { try { return require(MUT.write(rel, anchored(fs.readFileSync(path.join(REPO, rel), 'utf8'), from, to, why))); } catch (e) { return { err: String((e && e.message) || e).slice(0, 160) }; } };
const copyOfAll = (rel, edits, why) => { try { let t = fs.readFileSync(path.join(REPO, rel), 'utf8'); for (const [a, b] of edits) t = anchored(t, a, b, why); return require(MUT.write(rel, t)); } catch (e) { return { err: String((e && e.message) || e).slice(0, 160) }; } };
const serveSock = (p) => { if (fs.existsSync(p)) return; const s = net.createServer((c) => c.destroy()); s.on('error', () => { }); s.listen(p); s.unref(); };
let seq = 0;
function rig(name, { dataDir = null, pid = process.pid, now0 = 1_700_000_000_000, Deliver = CD, auth = null } = {}) {   // auth: a REAL guard's authorize (the lift-site legs)
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
  async function advance(ms) { const until = now + ms; while (true) { const due = timers.filter((t) => !t.dead && !t.fired && t.at <= until).sort((a, b) => a.at - b.at)[0]; if (!due) break; now = Math.max(now, due.at); due.fired = true; await due.fn(); await tick(); } now = until; }
  let holdSeq = 0, refuse = null, throwAuth = false;
  const deliver = Deliver.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined,
    peerMsg: { findPeer: (c) => PM.findPeer(c, reg), postToPeer: async (p, text, o) => { const r = await answer(p, text, o); if (r.ok) posts.push(text); return r; }, postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: (req) => { if (throwAuth) throw new Error('guard down'); authorized.push(req.reason); if (auth) return auth(req); if (refuse) return { ok: false, why: refuse, detail: refuse + ' reached', retryAfter: 60000, identity: { key: 'acct', name: 'Work' }, limits: { perIdentityHour: 30 } }; return { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'h' + (++holdSeq), reason: req.reason }; },
    noteSpend: (rec) => ledger.push({ reason: rec.reason, hold: rec.hold }), releaseSpend: (rec) => releases.push(rec.hold),
    emitPeerCard: (c, card) => cards.push(card), log: (...a) => logs.push(a.join(' ')), retryClock: clock });
  deliver.onRetry((ev, c, entry, extra) => { events.push({ ev, cid: c, id: entry.id, extra }); if (ev === 'fell') return false; });
  return { dir, reg, cid, session, sessions, deliver, posts, ledger, releases, authorized, cards, logs, events, clock, advance, timers, setAnswer: (fn) => { answer = fn; }, setRefuse: (w) => { refuse = w; }, setThrow: (b) => { throwAuth = b; }, now: () => now, setNow: (t) => { now = t; }, pid, sockPath };   // setNow (verify r4): the wall clock steps
}

const NOTIFY = (R) => R.deliver.deliverToConversation(R.cid, 'Background Work · nightly finished: 2 new rows', { fromName: 'Background Work · nightly', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-1' } } });
const onDisk = (R) => { try { return JSON.parse(fs.readFileSync(path.join(R.dir, 'msg-retry.json'), 'utf8'))[R.cid] || []; } catch { return []; } };
const lift = async (R, whys) => { SG.noteGateFree(whys); await tick(); for (let i = 0; i < 4; i++) await R.advance(0); };   // the listeners' turn, then the park's own manual clock run to quiet
const HELD = 'ledger-held-elsewhere';

console.log('§0 the family and the lift event');
{ ok(!!(SA.HELD_WHYS.length === 5 && SA.isHeldWhy(HELD) && !SA.isHeldWhy('hour-cap') && !SA.isHeldWhy('day-cap') && !SA.isHeldWhy('switched-off') && !SA.isHeldWhy('reading-unread')), 'the family «the gate could not judge»: five reasons — never a cap, a switch or a budget (pinned to the authorizer in §0a, not to a literal)', JSON.stringify(SA.HELD_WHYS));
  const seen = []; const off = SG.onGateFree((x) => seen.push(x.whys.join()));
  SG.noteGateFree(['hour-cap']); SG.noteGateFree([HELD, 'day-cap']);
  const inside = seen.length;
  await tick();
  ok(!!(inside === 0 && seen.length === 1 && seen[0] === HELD), 'a lift names only the family\'s whys (a cap is never lifted); its listeners run AFTER the guard\'s own call returned, never inside it (r4410 (g))', JSON.stringify({ inside, seen }));
  SG.noteGateFree([HELD]); off(); await tick();
  ok(!!(seen.length === 1), 'a listener taken off before its turn hears nothing — not even a lift said just before (each create keeps its off handle for its close)', JSON.stringify(seen)); }

console.log('§0a (r4410 (a)) the family is pinned to the AUTHORIZER, not to a literal');
{ const ask = (ledger, limits) => SA.authorizeUnattendedSpend({ reason: 'job-notification', identity: { key: 'acct', name: 'Work' }, state: SA.emptyBudget(), ...(limits ? { limits } : {}), ledger, now: Date.now() });
  const facts = [{ lockUnwritable: true, error: 'EACCES' }, { lockUnreadable: true, error: 'EIO' }, { held: true, pid: 4242, host: 'another-machine.example.invalid' }, { unreadable: true, error: 'not JSON' }, { settingsUnread: true, code: 'EIO' }];
  const whys = facts.map((f) => ask(f).why);
  ok(!!(whys.every((w) => SA.isHeldWhy(w)) && new Set(whys).size === 5 && [...whys].sort().join() === [...SA.HELD_WHYS].sort().join()), 'each of the five ledger facts, run through the PURE authorizer, answers a reason of the family — the five, each once', JSON.stringify(whys));
  const free = ask(null), cap = ask(null, SA.budgetLimits((k) => (k === 'spend.unattendedPerIdentityHour' ? 0 : undefined)));
  const overage = SA.authorizeUnattendedSpend({ reason: 'job-notification', identity: { key: 'acct', name: 'Work' }, state: SA.emptyBudget(), overage: { inUse: 'yes' }, overagePolicy: 'refuse', ledger: null, now: Date.now() });
  ok(!!(free.ok === true && cap.ok === false && cap.why === 'hour-cap' && !SA.isHeldWhy(cap.why) && overage.ok === false && !SA.isHeldWhy(overage.why)), 'a free ledger is allowed; a cap\'s answer and a switch\'s answer (paid overage refused) are no reason of the family', JSON.stringify({ free: free.ok, cap: cap.why, overage: overage.why }));
  const heldBranch = (text) => [...String(text).matchAll(/if \(ledger && ledger\.(\w+)\) return no\('([a-z-]+)'/g)].map((m) => m[2]);
  const same = (a) => a.length === SA.HELD_WHYS.length && [...a].sort().join() === [...SA.HELD_WHYS].sort().join();
  const AS = fs.readFileSync(path.join(REPO, 'src/spend-authorizer.js'), 'utf8');
  ok(!!(same(heldBranch(AS))), 'the authorizer\'s held branch (`if (ledger && ledger.X) return no(…)`) names EXACTLY the family', JSON.stringify(heldBranch(AS)));
  const sixth = anchored(AS, "  if (ledger && ledger.unreadable) return no('ledger-unreadable'", "  if (ledger && ledger.mountGone) return no('ledger-mount-gone', 'a made-up sixth hold');\n  if (ledger && ledger.unreadable) return no('ledger-unreadable'", 'a sixth held reason');
  ok(!!(!same(heldBranch(sixth))), 'RED CONTROL: a sixth held reason added to the authorizer\'s branch (not to the list) turns this pin red', JSON.stringify(heldBranch(sixth))); }

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
  SG.noteGateFree(['ledger-unreadable']); await tick(); await R.advance(0);
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
  const run2 = async () => { for (let k = 0; k < 6; k++) { const due = timers2.filter((t) => !t.dead && !t.fired && t.at <= now2); if (!due.length) break; for (const t of due) { t.fired = true; await t.fn(); } await tick(); } };
  const D2 = CD.create({ dataDir: R.dir, activeSessions: R.sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, R.reg), postToPeer: async (p, text) => { posts2.push(text); return { ok: true, phase: 'written', elapsedMs: 9 }; }, postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: (req) => { auth2.push(req.reason); return refuse2 ? { ok: false, why: refuse2, detail: refuse2, retryAfter: 0 } : { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'k' + auth2.length, reason: req.reason }; },
    noteSpend: () => { }, releaseSpend: () => { }, emitPeerCard: () => { }, log: () => { }, retryClock: clock2 });
  await run2();
  const d = onDisk(R);
  ok(!!(auth2.length === 1 && posts2.length === 0 && d.length === 1 && d[0].waitsLift && d[0].waitsLift.why === HELD), 'the new start (held at its boot) asks the kept entry ONCE and marks it again for ITS lift', JSON.stringify({ asked: auth2.length, mark: d[0] && d[0].waitsLift }));
  refuse2 = null; SG.noteGateFree([HELD]); await tick(); await run2();
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
function paceOf({ perSender = 8, perTarget = 1 } = {}) {   // the sender's wake pace AS the groups engine's pacer answers (a stand-in): a grant reserves a stamp, a refund gives it back
  const P = { grants: [], refusals: [], refunds: [] };
  P.live = () => P.grants.filter((g) => !g.back).length;
  P.mayWake = Object.assign((cid) => {
    if (P.live() >= perSender) { P.refusals.push({ cid, rule: 'sender' }); return { reason: 'the sender\'s wake floor (stand-in)', rule: 'sender-floor' }; }
    if (P.grants.filter((g) => !g.back && g.cid === cid).length >= perTarget) { P.refusals.push({ cid, rule: 'target' }); return { reason: 'the worker\'s wake floor (stand-in)', rule: 'target-floor' }; }
    P.grants.push({ cid, back: false }); return true;
  }, { refund: (cid) => { const g = P.grants.find((x) => !x.back && x.cid === cid); if (g) { g.back = true; P.refunds.push(cid); } } });
  return P;
}
function dispatchWorld(Mod = WD, { reported = 0, workers = 1, sendGate = null, wakeAnswer = { ok: true }, clock = null, typing = null } = {}) {
  const FROM = 'aaaaaaaa-0000-4000-8000-0000000000a1';
  const TOs = Array.from({ length: workers }, (_, k) => 'bbbbbbbb-0000-4000-8000-0000000000' + String(k + 10));
  const E = realEngine(clock || (() => Date.now())), ledger = E.eng.dispatchLedger;   // THE REAL LEDGER (merge + prune)
  const rec = { id: 'rec-1', at: 1000, author: { id: FROM } }, wakes = [], typed = [], posts = [], asked = [], logs = [], releases = [];
  const members = TOs.map((m) => ({ member: m, reportedUpTo: reported }));
  const W = { E, ledger, wakes, typed, posts, asked, logs, releases, member: members[0], rec, FROM, TO: TOs[0], TOs, sending: 0 };
  W.entries = () => Object.values(((E.store.dispatch.live() || {}).entries) || {});
  W.keyOf = (k = 0, text = 'the brief') => WD.dispatchKey(FROM, TOs[k], text, '');
  const ge = { dispatchLedger: ledger, reach: () => 'messageable', sharesGroup: () => true, findPair: (a, b) => ({ id: 'g-1', members: members.filter((x) => x.member === b) }),
    sendToAgent: async (o) => { W.sending++; if (sendGate) await sendGate(o); posts.push(o); return { ok: true, group: { id: 'g-1' }, message: { ...rec, id: 'rec-' + posts.length }, woke: [], refused: [], queued: [] }; },
    wake: async (gid, m, r, why) => { wakes.push({ gid, m, r: r && r.id, why }); return wakeAnswer; } };
  const sessions = new Map(TOs.map((t, k) => ['w-' + k, { claudeSessionId: t, backendSessionId: t, mode: 'chat', backend: 'claude', name: 'Worker ' + k, _turnState: 'idle', pty: {} }]));   // live chats (their pty)
  W.worker = sessions.get('w-0');
  let refuse = null;
  W.setRefuse = (w) => { refuse = w; };
  W.make = () => Mod.create({ activeSessions: sessions, getGroups: () => ge, getSendUserInput: () => typing || ((wid, text) => { typed.push(text); return { ok: true }; }),
    authorizeSpend: (q) => { asked.push(q.reason); return refuse ? { ok: false, why: refuse, detail: refuse } : { ok: true, identity: { key: 'acct' }, hold: 'h' + asked.length }; },
    noteSpend: () => { }, releaseSpend: (q) => releases.push(q && q.hold), log: (...a) => logs.push(a.join(' ')), waitMs: 50, awaitEnd: async () => ({ ended: true, ms: 5 }), ...(clock ? { now: clock } : {}) });
  W.D = W.make();
  W.close = () => { try { if (W.D && typeof W.D.close === 'function') W.D.close(); } catch { } };
  return W;
}
const BRIEF = (W, k = 0, text = 'the brief', mayWake = null) => W.D.dispatch({ from: W.FROM, target: { cid: W.TOs[k], name: 'Worker ' + k }, text, compactFirst: true, ...(mayWake ? { mayWake } : {}) });
const dispatchHeld = async (Mod = WD, o = {}) => { const W = dispatchWorld(Mod, o); W.setRefuse(HELD); W.r = await BRIEF(W); W.entry = W.ledger.get(W.keyOf()); return W; };
const settledN = (W) => W.logs.filter((l) => /the owed compaction (ends|is held again)/.test(l)).length;
const liftD = async (W, n = 1, whys = [HELD]) => { SG.noteGateFree(whys); await tick(); return waitFor(() => settledN(W) >= n, `${n} owed compaction(s) settled at the lift`); };
{ const W = await dispatchHeld();
  ok(!!(W.asked.join() === 'peer-compact' && W.posts.length === 1 && W.typed.length === 0 && W.entry && W.entry.deliveredAt && !W.entry.owedCompact && W.D._owedCompactions.size === 1 && [...W.D._owedCompactions.values()][0].why === HELD), 'refused held: the brief is posted (the free ride), the compaction is NOT made; the REAL ledger says «delivered» as the release writes it, and the compaction is OWED in memory (r4473: no owed mark on disk)', JSON.stringify({ r: W.r, asked: W.asked, posts: W.posts.length, entry: W.entry }));
  const again = await W.D.dispatch({ from: W.FROM, target: { cid: W.TO, name: 'Worker' }, text: 'the brief', compactFirst: true });
  ok(!!(again.ok && again.replay === true && W.posts.length === 1 && W.asked.length === 1), '…the same brief sent again meanwhile is a replay: nothing re-posted, nothing asked twice', JSON.stringify({ replay: again.replay, posts: W.posts.length }));
  W.setRefuse(null); await liftD(W);
  const e2 = W.ledger.get(W.keyOf());
  ok(!!(W.asked.length === 2 && W.typed.join() === '/compact' && W.wakes.length === 1 && W.wakes[0].r === 'rec-1' && e2 && e2.deliveredAt), 'at the lift: the compaction asked ONCE (the same authorization), made, then the worker woken for its brief by the groups engine\'s own wake; the ledger\'s entry is still the post\'s (the owed road writes nothing)', JSON.stringify({ asked: W.asked, typed: W.typed, wakes: W.wakes, entry: e2 })); }
{ const W = await dispatchHeld();
  W.worker._userInputAt = Date.now();   // its owner typed into it just now
  W.setRefuse(null); await liftD(W);
  ok(!!(W.typed.length === 0 && W.wakes.length === 0), 'a worker its OWNER is using at the lift is never compacted (the dispatch\'s own rule): the owed compaction ends', JSON.stringify({ typed: W.typed, asked: W.asked })); }
{ const W = await dispatchHeld(WD, { reported: 5000 });
  W.setRefuse(null); await liftD(W);
  ok(!!(W.typed.length === 0 && W.wakes.length === 0 && W.asked.length === 1), 'the brief rode a turn meanwhile (its report marker passed it): the owed compaction ENDS — no compaction, no wake for words that rode a turn', JSON.stringify({ typed: W.typed, wakes: W.wakes.length })); }
{ const W = await dispatchHeld();
  W.setRefuse('hour-cap'); await liftD(W);
  const e3 = W.ledger.get(W.keyOf());
  ok(!!(W.typed.length === 0 && W.wakes.length === 0 && !!e3 && !!e3.deliveredAt), 'a CAP at the lift ends it as a cap (never owed again)', JSON.stringify({ e3, typed: W.typed.length })); }
{ const RED = copyOf('src/server/worker-dispatch.js', 'const owedHere = spend !== true && spend && spend.held && compactFirst === true;', 'const owedHere = false;', 'the held compaction recorded delivered (today)');
  ok(!!(!RED.err), 'RED CONTROL built: the dispatch keeping no owed record (the release)', RED.err);
  if (!RED.err) { const W = await dispatchHeld(RED); W.setRefuse(null); SG.noteGateFree([HELD]); await tick(); const again = await W.D.dispatch({ from: W.FROM, target: { cid: W.TO, name: 'Worker' }, text: 'the brief', compactFirst: true });
    ok(!!(W.entry && W.entry.deliveredAt && W.typed.length === 0 && again.replay === true && W.typed.length === 0), 'RED (the release): no owed record — the lift asks nothing and a re-dispatch replays «delivered»: the compaction is LOST', JSON.stringify({ entry: W.entry, typed: W.typed.length })); } }

console.log('§0b the guard says its OWN lift: the lock another process kept, taken');
{ const dir = path.join(scratchDir('shl-guard'), 'g1'); fs.mkdirSync(dir, { recursive: true });
  const lockFile = path.join(dir, 'spend-budget.lock');
  fs.writeFileSync(lockFile, JSON.stringify({ pid: 424242, host: 'another-machine.example.invalid', ident: null, at: Date.now() }));   // a keeper only its heartbeat can vouch for (a shared folder): PLACED, no second process
  const G = SG.create({ dataDir: dir, log: () => { }, schedule: () => null, unschedule: () => { } });
  const held = G.snapshot && G.snapshot().ledgerHeldBy;
  const seen = []; const off = SG.onGateFree((x) => seen.push(x.whys.join()));
  const took = G.lockAgain(Date.now() + 10 * 60_000);   // its silence measured by the guard's own first sight, past LOCK_STALE_MS
  const inside = seen.length;
  await tick(); off();
  ok(!!(!!held && took === true && inside === 0 && seen.length === 1 && seen[0].includes(HELD) && seen[0].includes('ledger-lock-unwritable')), 'a boot held by another keeper ⇒ the lock taken when it is gone ⇒ the guard says the lock\'s holds lifted, ONCE — after its own call returned', JSON.stringify({ held: !!held, took, inside, seen })); }

console.log('§0c (r4410 (b)) a lift site: the ledger READ AGAIN lifts what its hold kept — the real guard, end to end');
{ const dir = path.join(scratchDir('shl-recheck'), 'r1'); fs.mkdirSync(dir, { recursive: true });
  let text = '{ torn';   // PLACED: the guard's read seams answer a torn record, then a whole one — no file race, no clock
  const G = SG.create({ dataDir: dir, log: () => { }, schedule: () => null, unschedule: () => { }, readLedgerSync: () => text, readLedgerAsync: async () => text });
  const R = rig('lift-recheck', { auth: (req) => G.authorize({ reason: req.reason, identity: { key: 'acct', name: 'Work' }, hold: false }) });
  const r = await NOTIFY(R);
  const d = onDisk(R);
  ok(!!(r.parked === true && d.length === 1 && d[0].waitsLift && d[0].waitsLift.why === 'ledger-unreadable'), 'the real guard refuses while its record cannot be read (ledger-unreadable): the wake is parked, kept for THAT hold\'s lift', JSON.stringify({ r: { parked: r.parked, why: r.why }, mark: d[0] && d[0].waitsLift }));
  text = JSON.stringify({ v: 1, seq: 1, budget: SA.emptyBudget(), nudge: {} });
  R.setAnswer(async () => ({ ok: true, phase: 'written', elapsedMs: 7 }));
  const asked = R.authorized.length;
  const read = await G.recheckLedger();
  const inside = R.authorized.length - asked;
  await tick(); for (let i = 0; i < 4; i++) await R.advance(0);
  ok(!!(read === true && inside === 0 && R.authorized.length === asked + 1 && R.posts.length === 1 && R.deliver.retryCount(R.cid) === 0), 'the record reads again (recheckLedger) ⇒ the guard says its lift ⇒ the kept wake asked ONCE, after the guard\'s own call returned — allowed by the real guard, delivered', JSON.stringify({ read, inside, asked: R.authorized.length - asked, posts: R.posts.length, n: R.deliver.retryCount(R.cid) })); }

console.log('§0d (r4410 (b)) a lift site: the SETTINGS\' lift — the real guard, end to end');
{ const dir = path.join(scratchDir('shl-settings'), 's1'); fs.mkdirSync(dir, { recursive: true });
  const SETTINGS_HELD = Symbol.for('vibespace.settings-held');
  let hold = { kind: 'unreadable', code: 'EIO', rung: 'said' };   // PLACED: the persistence layer's own hold fact
  const G = SG.create({ dataDir: dir, log: () => { }, schedule: () => null, unschedule: () => { }, serverSetting: (k) => (k === SETTINGS_HELD ? hold : undefined) });
  const R = rig('lift-settings', { auth: (req) => G.authorize({ reason: req.reason, identity: { key: 'acct', name: 'Work' }, hold: false }) });
  const r = await NOTIFY(R);
  const d = onDisk(R);
  ok(!!(r.parked === true && d[0] && d[0].waitsLift && d[0].waitsLift.why === 'settings-unread'), 'the real guard refuses while the settings are held (settings-unread): the wake is kept for the settings\' lift', JSON.stringify({ why: r.why, mark: d[0] && d[0].waitsLift }));
  R.setAnswer(async () => ({ ok: true, phase: 'written', elapsedMs: 7 }));
  const asked = R.authorized.length;
  SG.noteLimitsWritten(null, { perIdentityHour: 30 });   // a settings write while STILL held
  await tick(); for (let i = 0; i < 4; i++) await R.advance(0);
  ok(!!(R.authorized.length === asked && R.posts.length === 0), 'a settings write while the hold stands lifts nothing');
  hold = null;
  SG.noteLimitsWritten(null, { perIdentityHour: 31 });   // the settings read again: persistence's settingsAgain says the limits moved
  const inside = R.authorized.length - asked;
  await tick(); for (let i = 0; i < 4; i++) await R.advance(0);
  ok(!!(inside === 0 && R.authorized.length === asked + 1 && R.posts.length === 1 && R.deliver.retryCount(R.cid) === 0), 'the settings read again ⇒ the guard says the settings\' lift ⇒ the kept wake asked ONCE (after the guard\'s own call returned), allowed and delivered', JSON.stringify({ inside, asked: R.authorized.length - asked, posts: R.posts.length })); }

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
  const engine = Eng.create({ dataDir: dir, vault, userTodos, now: () => clock, verbs: { 'conversations.rename': () => { ran.push(1); return { ok: false, code: 'spend_refused', why: 'spend budget: another VibeSpace process on this data folder (pid 4242 on another-machine.example.invalid) keeps the record of unattended turns', bucket, retryAfter: 0 }; } } });   // the gate's own detail, as production words it
  engine.mint({ name: 'opener', scopes: ['conversations.rename'], by: 'user' });
  const caller = { conversationId: 'conv-1', sessionKey: 'claude:conv-1', name: 'Worker one', live: true, groups: [] };
  const cards = () => (userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'automation-ask');
  const p = engine.use({ caller, verb: 'conversations.rename', args: { name: 'x' } });
  await waitFor(() => cards().length > 0, 'the automation ask card filed', 5000);
  if (cards().length) engine.answer(cards()[0].action.askId, { answer: 'once' });
  const r = await p;
  const grants = ((engine.list().keys || [])[0] || {}).grants || [];
  return { r, grants, ran };
}
const onceLeft = (W) => W.grants.some((g) => g.mode === 'once' && !g.spentAt);
{ const W = await autoWorld();
  ok(!!(W.r.code === 'spend_refused' && W.r.bucket === HELD && W.ran.length === 1 && onceLeft(W)), 'refused held: the answer names the hold by its code (bucket) and the once-grant is RELEASED (there, unspent)', JSON.stringify({ code: W.r.code, bucket: W.r.bucket, grants: W.grants.map((g) => ({ mode: g.mode, spent: !!g.spentAt })) })); }
{ const W = await autoWorld();
  ok(!!(typeof W.r.why === 'string' && W.r.why.includes(HELD) && !/4242|another-machine/.test(W.r.why)), 'the held 429 names the hold by its code — never another process\'s pid and host (r4410, said)', JSON.stringify(W.r.why)); }
{ const RED = copyOf('src/server/automation-engine.js', "'once' in heldOnce ? `the spend gate could not judge", "false ? `the spend gate could not judge", 'the held 429 carrying the gate\'s detail (the release)');
  ok(!!(!RED.err), 'RED CONTROL built: the held 429 carrying the gate\'s own detail', RED.err);
  if (!RED.err) { const W = await autoWorld(RED); ok(!!(/4242/.test(String(W.r.why))), 'RED (the release): the held 429 tells a key holder another process\'s pid and host', JSON.stringify(W.r.why)); } }
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
  for (let i = 0; i < 4; i++) await R.advance(0);
  await waitFor(() => W.asked.length >= 1, 'the ended wake\'s probe asked'); await tick();
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
  const run = async (ms = 0) => { const until = now + ms; for (let k = 0; k < 40; k++) { const due = timers.filter((t) => !t.dead && !t.fired && t.at <= until).sort((a, b) => a.at - b.at)[0]; if (!due) break; now = Math.max(now, due.at); due.fired = true; await due.fn(); await tick(); } now = Math.max(now, until); };
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
  SG.noteGateFree([HELD]); await tick(); await run(0);
  ok(!!(posts.length === 1 && counted.length === 1 && spendAsks.length - asks0 === 1), `at ONE lift the ${N} go through the pace's own road: the pace lets ONE go (asked and counted once) and holds the rest — never ${N} turns in one instant`, JSON.stringify({ posts: posts.length, counted: counted.length, spendAsks: spendAsks.length - asks0 }));
  const left = cids.map((c) => { try { return (JSON.parse(fs.readFileSync(path.join(dir, 'msg-retry.json'), 'utf8'))[c] || [])[0] || null; } catch { return null; } }).filter(Boolean);
  ok(!!(left.length === N - 1 && left.every((e) => !e.waitsLift && Number(e.nextAt) > now)), '…the rest are owed to the PACE now (its own wait), no longer to the lift', JSON.stringify(left.map((e) => ({ lift: !!e.waitsLift, inMs: Number(e.nextAt) - now }))));
  try { D.closeRetries(); } catch { } }

console.log('§8 (r4410 MUST 2) the waiting set is BOUNDED: forty held first tries to ONE conversation');
const NOTIFY_K = (R, k) => R.deliver.deliverToConversation(R.cid, `Background Work · nightly finished: row ${k}`, { fromName: 'Background Work · nightly', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-' + k } } });
const rowOf = (t) => { const m = /row (\d+)(?!\d)/.exec(String(t || '')); return m ? Number(m[1]) : null; };
const rows = (a, b) => Array.from({ length: b - a }, (_, i) => a + i).join();
function parkWrites(file) {   // the park file's SYNCHRONOUS writes, counted at the rename that makes each (writeRetryNow: tmp + renameSync)
  const real = fs.renameSync; let n = 0;
  fs.renameSync = function (a, b, ...rest) { if (String(b) === file) n++; return real.call(this, a, b, ...rest); };
  return { n: () => n, off: () => { fs.renameSync = real; } };
}
async function fortyTries(Deliver = CD, refuse = HELD) {
  const R = rig('m2-' + Math.random().toString(36).slice(2, 6), { Deliver });
  R.setRefuse(refuse);   // null: the release's own road — each first try a transient miss (the rig's answer), parked
  const w = parkWrites(path.join(R.dir, 'msg-retry.json')); const answers = [];
  try { for (let k = 0; k < 40; k++) { const r = await NOTIFY_K(R, k); answers.push({ k, parked: r.parked === true, there: !!(r.parked && onDisk(R).some((x) => x.id === r.id)) }); } } finally { w.off(); }
  return { R, answers, writes: w.n(), kept: onDisk(R), fell: R.events.filter((e) => e.ev === 'fell'), stash: R.deliver.stashPeek(R.cid).map((x) => rowOf(x.text)).sort((a, b) => a - b) };
}
const CAP = 30;   // conversation-deliver RETRY_CAP (= STASH_CAP)
{ const H = await fortyTries(CD, HELD), T = await fortyTries(CD, null);
  ok(!!(H.kept.length === CAP && H.R.deliver.retryCount(H.R.cid) === CAP && H.kept.every((e) => e.waitsLift && e.waitsLift.why === HELD) && H.kept.map((e) => rowOf(e.text)).join() === rows(10, 40)), `forty held first tries to ONE conversation leave no more than the park's cap (${CAP}) waiting — the newest thirty, each marked for the lift`, JSON.stringify({ kept: H.kept.length, rows: H.kept.map((e) => rowOf(e.text)) }));
  ok(!!(H.fell.length === 10 && H.fell.every((e) => e.extra && e.extra.evicted === true) && H.stash.join() === rows(0, 10)), 'past it the OLDEST waiting falls, as at the release: rows 0–9 fell (evicted), their words in the stash', JSON.stringify({ fell: H.fell.length, stash: H.stash }));
  ok(!!(H.answers.every((a) => a.parked && a.there)), 'every answer «parked» is TRUE when it is given: its entry is on disk at that moment (r4410 (e): never «parked» for an entry that fell at once)', JSON.stringify(H.answers.filter((a) => !(a.parked && a.there)).slice(0, 3)));
  ok(!!(T.kept.length === CAP && T.fell.length === 10 && H.writes <= T.writes), `the writes COUNTED: forty held first tries cost ${H.writes} synchronous park-file writes, the release's forty parked misses ${T.writes} — the mark rides the write that parks it`, JSON.stringify({ held: H.writes, release: T.writes })); }
{ const RED = copyOfAll('src/server/conversation-deliver.js', [
    ["waiting().find((x) => !x.waitsHeld));) {   // B-ef83 unit 1's cure (r4410 MUST 2)", "waiting().find((x) => !aside(x)));) {   // B-ef83 unit 1's cure (r4410 MUST 2)"],
    ["              saidLift([e], v.why);   // the mark rode parkRetry's one write: said, nothing written again", '              waitLift([e], v.why);']], "83fc0f481's road: the lift set unbounded, the mark a second write");
  ok(!!(!RED.err), 'RED CONTROL built: 83fc0f481\'s road (a wake waiting on the lift never the cap\'s victim; its mark a second write)', RED.err);
  if (!RED.err) { const H = await fortyTries(RED, HELD), T = await fortyTries(CD, null);
    ok(!!(H.kept.length === 40 && H.fell.length === 0 && H.writes > T.writes), 'RED (83fc0f481): forty held first tries keep FORTY waiting past the cap of thirty, and cost more writes than the release\'s forty parks', JSON.stringify({ kept: H.kept.length, writes: H.writes, release: T.writes })); } }

console.log('§9 (r4410 MUST 1, law (b)) THE SAME PACE: owed compactions at ONE lift ask the sender\'s OWN pace, before the spend gate');
async function owedMany(Mod, workers, briefs, o = {}) {
  const W = dispatchWorld(Mod, { workers, ...o }); W.pace = paceOf(); W.setRefuse(HELD);
  for (const [k, text] of briefs) await BRIEF(W, k, text, W.pace.mayWake);
  W.owed = W.D._owedCompactions.size;   // in memory (r4473)
  return W;
}
const nine = Array.from({ length: 9 }, (_, k) => [k, 'brief ' + k]);
{ const W = await owedMany(WD, 9, nine);
  ok(!!(W.owed === 9 && W.pace.grants.length === 9 && W.pace.live() === 0 && W.typed.length === 0), 'nine briefs from ONE sender refused held: nine compactions owed; each dispatch\'s pace grant given back (the brief rode free)', JSON.stringify({ owed: W.owed, grants: W.pace.grants.length, live: W.pace.live() }));
  W.setRefuse(null); const asks0 = W.asked.length;
  await liftD(W, 9);
  ok(!!(W.pace.refusals.length === 1 && W.pace.refusals[0].rule === 'sender' && W.asked.length - asks0 === 8 && W.typed.length === 8 && W.wakes.length === 8), 'at ONE lift the sender\'s OWN pace is asked first: it grants eight and refuses the ninth — the spend gate asked eight times, never nine; eight compactions, eight wakes', JSON.stringify({ refusals: W.pace.refusals, spendAsks: W.asked.length - asks0, typed: W.typed.length, wakes: W.wakes.length }));
  ok(!!(W.pace.live() === 8 && W.pace.refunds.length === 9), '…each grant is the reservation its wake spent: eight stamps stand, none given back after a wake', JSON.stringify({ live: W.pace.live(), refunds: W.pace.refunds.length }));
  ok(!!(W.D._owedCompactions.size === 0 && W.entries().length === 9 && W.entries().every((e) => e.deliveredAt && !e.owedCompact) && W.logs.filter((l) => /the wake pace said no/.test(l)).length === 1), '…the refused one ENDS (its brief rides the worker\'s next turn, said), never a retry of ours: nothing is owed after the lift', JSON.stringify({ left: W.D._owedCompactions.size }));
  const asks1 = W.asked.length; SG.noteGateFree([HELD]); await tick();
  ok(!!(W.asked.length === asks1 && W.typed.length === 8), '…a second lift asks nothing'); W.close(); }
{ const W = await owedMany(WD, 1, [[0, 'brief a'], [0, 'brief b']]);
  W.setRefuse(null); const asks0 = W.asked.length;
  await liftD(W, 2);
  ok(!!(W.owed === 2 && W.pace.refusals.length === 1 && W.pace.refusals[0].rule === 'target' && W.asked.length - asks0 === 1 && W.typed.length === 1 && W.wakes.length === 1), 'two owed to ONE worker at one lift: the pace refuses the second (the worker\'s own floor) before the spend gate — one compaction, one wake', JSON.stringify({ owed: W.owed, refusals: W.pace.refusals, spendAsks: W.asked.length - asks0, typed: W.typed.length })); W.close(); }
{ const W = await owedMany(WD, 1, [[0, 'brief c']], { wakeAnswer: { ok: false, reason: 'refused by its own gate' } });
  W.setRefuse(null);
  await liftD(W, 1);
  ok(!!(W.typed.length === 1 && W.wakes.length === 1 && W.pace.live() === 0), 'a grant is given back when nothing is sent: compacted, its wake refused ⇒ the reservation returns', JSON.stringify({ live: W.pace.live(), refunds: W.pace.refunds })); W.close(); }
{ const W = await owedMany(WD, 1, [[0, 'brief d']]);
  W.setRefuse('ledger-unreadable');
  await liftD(W, 1);
  ok(!!(W.typed.length === 0 && W.pace.live() === 0 && W.D._owedCompactions.size === 1), 'held AGAIN at the lift: the pace\'s grant is given back and the compaction stays owed to that hold\'s lift', JSON.stringify({ live: W.pace.live(), owed: W.D._owedCompactions.size })); W.close(); }
{ const RED = copyOf('src/server/worker-dispatch.js', '    const pace = pacer ? pacer(o.to) : true;', '    const pace = true;', 'the lift asking no pace (83fc0f481)');
  ok(!!(!RED.err), 'RED CONTROL built: the owed compaction asking no pace at the lift', RED.err);
  if (!RED.err) { const W = await owedMany(RED, 9, nine); W.setRefuse(null); await liftD(W, 9);
    ok(!!(W.typed.length === 9 && W.wakes.length === 9 && W.pace.refusals.length === 0), 'RED (83fc0f481): at one lift nine compactions and nine wakes go at once — the sender\'s pace never asked', JSON.stringify({ typed: W.typed.length, wakes: W.wakes.length })); W.close(); } }

{ const W = await owedMany(WD, 1, [[0, 'brief e']], { typing: () => { throw new Error('a made-up typing fault'); } });
  W.setRefuse(null);
  await liftD(W, 1);
  ok(!!(W.typed.length === 0 && W.wakes.length === 0 && W.releases.length === 1 && W.pace.live() === 0 && W.D._owedCompactions.size === 0), 'the typing path THROWS at the lift (the round\'s should): the hold released and the pace grant given back — the frame never left; no wake; the owed compaction ends, said', JSON.stringify({ releases: W.releases.length, live: W.pace.live() })); W.close(); }
console.log('§9b the REAL pacer\'s refund (the groups engine\'s pacerFor over its own store): attempted:true keeps the sender\'s minute, attempted:false returns it');
const paceOfStore = (W) => { const x = W.E.store.pace.live() || {}; return { pairs: x.pairs || {}, senders: x.senders || {} }; };
{ const W = dispatchWorld(WD, { wakeAnswer: { ok: false, reason: 'refused by its own gate' } }); const P = W.E.eng.pacerFor(W.FROM); W.setRefuse(HELD);
  await BRIEF(W, 0, 'brief r', P);
  const p0 = paceOfStore(W), pair = W.FROM + '|' + W.TO;
  ok(!!(!(pair in p0.pairs) && !(p0.senders[W.FROM] || []).length), 'the held dispatch\'s grant went back WHOLE (the dispatch\'s attempted:false): no pair stamp, no minute', JSON.stringify(p0));
  W.setRefuse(null); await liftD(W, 1);
  const p1 = paceOfStore(W);
  ok(!!(W.typed.length === 1 && W.wakes.length === 1 && !(pair in p1.pairs) && (p1.senders[W.FROM] || []).length === 1), 'at the lift: compacted, its wake refused ⇒ the real refund (attempted:true) gives the PAIR back and KEEPS the sender\'s minute (one stamp)', JSON.stringify(p1)); W.close(); }
{ const W = dispatchWorld(WD, {}); const P = W.E.eng.pacerFor(W.FROM); W.setRefuse(HELD);
  await BRIEF(W, 0, 'brief s', P);
  W.setRefuse('ledger-unreadable'); await liftD(W, 1);
  const p1 = paceOfStore(W), pair = W.FROM + '|' + W.TO;
  ok(!!(W.typed.length === 0 && !(pair in p1.pairs) && !(p1.senders[W.FROM] || []).length && W.D._owedCompactions.size === 1), 'held AGAIN at the lift: the real refund (attempted:false) gives back the pair AND the minute; still owed to that hold', JSON.stringify(p1)); W.close(); }
console.log('§10 (r4410 (c)) the owed record is honest across the SEND (memory only, 主开发 r4473)');
async function sendHeldWorld(Mod = WD) {
  let open; const gate = new Promise((r) => { open = r; });   // PLACED: the brief's send held open by the test, no clock
  const W = dispatchWorld(Mod, { sendGate: () => gate }); W.setRefuse(HELD);
  W.p = BRIEF(W); W.open = open;
  await waitFor(() => W.sending === 1, 'the brief on its way (its send held open)');
  return W;
}
{ const W = await sendHeldWorld();
  const rec0 = [...W.D._owedCompactions.values()][0] || null;
  ok(!!(W.posts.length === 0 && rec0 && rec0.pending === true && rec0.why === HELD && !W.ledger.get(W.keyOf())), 'the owed RECORD stands BEFORE the awaited send (in memory, pending) — and the ledger holds nothing for the brief until its post, as at the release', JSON.stringify({ pending: rec0 && rec0.pending, entry: W.ledger.get(W.keyOf()) }));
  W.setRefuse(null); SG.noteGateFree([HELD]); await tick();
  ok(!!(W.typed.length === 0 && W.D._owedCompactions.size === 1), 'a lift DURING the send asks nothing yet (no compaction before its brief is posted)');
  W.open(); const r = await W.p;
  await waitFor(() => settledN(W) >= 1, 'the owed compaction asked after the post');
  ok(!!(r.ok && W.posts.length === 1 && W.typed.join() === '/compact' && W.wakes.length === 1 && W.wakes[0].r === 'rec-1' && W.D._owedCompactions.size === 0), '…the lift during the send is KEPT: asked once the brief is posted — compacted, and the wake carries that brief', JSON.stringify({ typed: W.typed, wakes: W.wakes })); W.close(); }
{ const RED = copyOf('src/server/worker-dispatch.js', '      if (o.pending) { o.lifted = true; continue; }', '      if (o.pending) continue;', 'a lift during the send forgotten (83fc0f481: the mark came after the send)');
  ok(!!(!RED.err), 'RED CONTROL built: a lift during the send not kept', RED.err);
  if (!RED.err) { const W = await sendHeldWorld(RED); W.setRefuse(null); SG.noteGateFree([HELD]); await tick(); W.open(); await W.p; await tick();
    ok(!!(W.typed.length === 0 && W.D._owedCompactions.size === 1), 'RED (83fc0f481): the lift that came during the send is lost — the compaction waits for a lift that already passed', JSON.stringify({ typed: W.typed.length, owed: W.D._owedCompactions.size })); W.close(); } }
console.log('§10a (主开发 r4473) THE REAL DISPATCH LEDGER: an owed compaction is MEMORY ONLY — a resend of a held brief is a replay on every road');
async function twoHeld(Mod = WD) {
  const W = dispatchWorld(Mod, { workers: 2 }); W.setRefuse(HELD);
  W.a = await BRIEF(W, 0, 'brief A'); W.b = await BRIEF(W, 1, 'brief B');   // the second's write runs the real ledger's merge and prune
  return W;
}
{ const W = await twoHeld();
  const eA = W.ledger.get(W.keyOf(0, 'brief A')), eB = W.ledger.get(W.keyOf(1, 'brief B'));
  ok(!!(W.posts.length === 2 && eA && eA.deliveredAt && !eA.owedCompact && eB && eB.deliveredAt && W.D._owedCompactions.size === 2), 'two briefs refused held, the second written after the first: the REAL ledger keeps BOTH «delivered» (written as the release writes it, at the post) — no owed mark on disk; the two compactions owed in memory', JSON.stringify({ eA, eB, owed: W.D._owedCompactions.size }));
  const again = await BRIEF(W, 0, 'brief A');
  ok(!!(again.ok && again.replay === true && W.posts.length === 2 && W.typed.length === 0), 'a resend of the FIRST (a lost answer) before the lift is a replay: nothing posted again, nothing compacted', JSON.stringify({ replay: again.replay, posts: W.posts.length }));
  W.setRefuse(null); await liftD(W, 2);
  ok(!!(W.typed.length === 2 && W.wakes.length === 2), '…at the lift each owed compaction is asked once (its record in memory): two compactions, two wakes', JSON.stringify({ typed: W.typed.length, wakes: W.wakes.length }));
  const after = await BRIEF(W, 0, 'brief A');
  ok(!!(after.replay === true && W.posts.length === 2 && W.typed.length === 2), '…a resend after the lift: a replay, nothing asked twice'); W.close(); }
{ const W = await twoHeld();
  W.close(); W.setRefuse(null); W.D = W.make();   // a STOP during the hold: the records in memory go with the process; the ledger stays
  const a2 = await BRIEF(W, 0, 'brief A'), b2 = await BRIEF(W, 1, 'brief B');
  SG.noteGateFree([HELD]); await tick();
  ok(!!(a2.replay === true && b2.replay === true && W.posts.length === 2 && W.typed.length === 0 && W.wakes.length === 0), 'across a STOP during the hold: both resends are replays (nothing posted again); the compaction is lost and each brief rides its worker\'s next turn uncompacted — as at the release', JSON.stringify({ a2: a2.replay, b2: b2.replay, posts: W.posts.length, typed: W.typed.length })); W.close(); }
{ const RED = copyOf('src/server/worker-dispatch.js', '    if (ledger) { try { ledger.set(key, { from, to: cid, deliveredAt: now() }); } catch { } }   // the brief is in the worker\'s group: a retry is a replay\n    // B-ef83 unit 1 (i), 主开发 r4473',
    '    if (ledger) { try { ledger.set(key, owedHere ? { from, to: cid, owedCompact: { why: spend.held, since: now() } } : { from, to: cid, deliveredAt: now() }); } catch { } }\n    // B-ef83 unit 1 (i), 主开发 r4473', '9948c979c: an owed-only mark in the ledger');
  ok(!!(!RED.err), 'RED CONTROL built: 9948c979c\'s write (an owed-only mark, no «delivered»)', RED.err);
  if (!RED.err) { const W = await twoHeld(RED); const gone = !W.ledger.get(W.keyOf(0, 'brief A')); const again = await BRIEF(W, 0, 'brief A');
    ok(!!(gone && again.ok && again.replay !== true && W.posts.length === 3), 'RED (9948c979c): the REAL ledger drops the first brief\'s owed-only mark at the second\'s write — the resend of the first posts it to the worker a SECOND time', JSON.stringify({ gone, replay: again.replay, posts: W.posts.length })); W.close(); } }

console.log('§10b (r4410 (d)) an owed compaction has an AGE: past the park\'s own bound it ends');
async function agedWorld(Mod = WD) {
  let t = Date.now(); const W = await dispatchHeld(Mod, { clock: () => t });
  t += 61 * 60_000;   // PLACED: the world's own clock steps past the bound (sixty minutes from the brief)
  W.setRefuse(null); await liftD(W);
  return W;
}
{ const W = await agedWorld();
  ok(!!(W.typed.length === 0 && W.wakes.length === 0 && W.D._owedCompactions.size === 0 && W.logs.some((l) => /past its bound/.test(l))), 'an owed compaction past sixty minutes from its brief ENDS at the lift (no compaction, no wake for a brief an hour old), said', JSON.stringify({ typed: W.typed.length, log: W.logs.filter((l) => /owed compaction/.test(l)) })); W.close(); }
{ const RED = copyOf('src/server/worker-dispatch.js', '    if (now() - Number(o.since || 0) > OWED_COMPACT_MAX_MS) return end(', '    if (false) return end(', 'an owed compaction with no age (83fc0f481)');
  ok(!!(!RED.err), 'RED CONTROL built: the owed compaction with no age', RED.err);
  if (!RED.err) { const W = await agedWorld(RED); ok(!!(W.typed.length === 1 && W.wakes.length === 1), 'RED (83fc0f481): an hour-old owed compaction is still made and the worker woken', JSON.stringify({ typed: W.typed.length })); W.close(); } }

console.log('§11 (r4410 (b)) a lift site: the LADDER road\'s held branch (an owed wake for a conversation another machine runs)');
async function ladderHeld(Deliver = CD) {
  const dir = path.join(scratchDir('shl-ladder'), Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dir, { recursive: true });
  let now = 1_700_000_000_000; const timers = [];
  const clock = { now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
  const run = async (ms = 0) => { const until = now + ms; for (let k = 0; k < 40; k++) { const due = timers.filter((t) => !t.dead && !t.fired && t.at <= until).sort((a, b) => a.at - b.at)[0]; if (!due) break; now = Math.max(now, due.at); due.fired = true; await due.fn(); await tick(); } now = Math.max(now, until); };
  const L = { asks: [], events: [], refuse: HELD, cid: 'abababab-0000-4000-8000-0000000000ab' };
  const D = Deliver.create({ dataDir: dir, activeSessions: new Map(), serverSetting: () => undefined,
    getHosts: () => ({ held: () => false, get: (hid) => ({ id: hid, name: 'Made-up machine' }) }), getConvIndex: () => ({ ownerHost: () => 'host-made-up' }),
    peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false, reason: 'no inbox here' }), postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: (q) => { L.asks.push(q.reason); return L.refuse ? { ok: false, why: L.refuse, detail: L.refuse + ' reached', retryAfter: 0 } : { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'l' + L.asks.length, reason: q.reason }; },
    noteSpend: () => { }, releaseSpend: () => { }, emitPeerCard: () => { }, log: () => { }, retryClock: clock });
  D.onRetry((ev, c, entry, extra) => { L.events.push({ ev, extra }); if (ev === 'fell') return false; });
  D.registerOwedWake('test', { render: (cid) => ({ text: 'a wake for ' + cid.slice(0, 8), kind: 'peer', fromName: 'Tester' }) });
  D.parkOwedWake(L.cid, { producer: 'test', key: 'k', retryInMs: 1000, sender: 'ffffffff-0000-4000-8000-0000000000f0', reason: 'paced' });
  await run(2000);
  L.disk = () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'msg-retry.json'), 'utf8'))[L.cid] || []; } catch { return []; } };
  Object.assign(L, { D, run });
  return L;
}
{ const L = await ladderHeld();
  const d = L.disk();
  ok(!!(L.asks.length === 1 && d.length === 1 && d[0].waitsLift && d[0].waitsLift.why === HELD && !L.events.some((e) => e.ev === 'fell')), 'an owed wake down the LADDER road (no inbox here, its machine another) meets the held gate: KEPT, marked for the lift — never felled as a cap', JSON.stringify({ asks: L.asks.length, mark: d[0] && d[0].waitsLift, evs: L.events.map((e) => e.ev) }));
  L.refuse = 'hour-cap';
  SG.noteGateFree([HELD]); await tick(); await L.run(0);
  ok(!!(L.asks.length === 2 && !L.disk().length && L.events.some((e) => e.ev === 'fell' && e.extra && e.extra.kind === 'spend-cap')), '…at the lift asked ONCE more by the same road; a cap there refuses it as a cap (it falls, never owed again)', JSON.stringify({ asks: L.asks.length, evs: L.events.map((e) => e.ev + ':' + ((e.extra && e.extra.kind) || '')) }));
  try { L.D.closeRetries(); } catch { } }
{ const RED = copyOf('src/server/conversation-deliver.js', "      if (r && r.refused === 'spend' && SA.isHeldWhy(r.why)) { waitLift(shown, r.why); return; }   // B-ef83 unit 1: the gate could not judge — kept, asked at its lift\n", '', 'the ladder road felling a held wake (today)');
  ok(!!(!RED.err), 'RED CONTROL built: the ladder road with no held branch', RED.err);
  if (!RED.err) { const L = await ladderHeld(RED); ok(!!(!L.disk().length && L.events.some((e) => e.ev === 'fell')), 'RED (today): the held refusal FELLS the owed wake down the ladder road — its wake is lost', JSON.stringify(L.events.map((e) => e.ev))); try { L.D.closeRetries(); } catch { } } }

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
