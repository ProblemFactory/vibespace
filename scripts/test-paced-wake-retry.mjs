#!/usr/bin/env node
// lane paced-wake-retry (2026-11-07, the owner: «目前 wake 的消息如果被节流排队了，节流时间到了会自动发出吗？… 那这样会不会导致我需要做
// 自动化任务从此卡住了？»): A WAKE THE PACE REFUSED IS A WAKE OWED, sent when the window ends, once; a stall is said.
//
//   §1 THE PURE RULES — paceVerdict answers the wait (the 30-s floor, the per-minute slot, the later of the two, exact to
//      the millisecond), the words say «paced — sent in N s», dispatchVerdict parks, dispatchRecord tells the truth.
//   §2 LAW 1 — the REAL groups engine + the REAL store + the REAL ladder and park over a stub inbox and a manual clock: an
//      idle target is woken once at the window's end; a target that turned first ⇒ the retry cancelled, no second post;
//      two paced wakes ⇒ ONE frame, one wake (same group, two senders, two groups); the per-minute slot; a retry the pace
//      refuses again ⇒ re-scheduled by the new wait; ONE authorization held across a transient miss; a spend refusal
//      falls, named; a remote target goes down the ladder; a restart keeps the debt and never the words.
//   §3 LAW 2 — the sender's words, the answer's door, the frame's heading, the normal peer card.
//   §4 LAW 3 — every retry refused ⇒ the fall is SAID (reason paced-out, the sender's free notice, the journal, the audit).
//   §5 LAW 4 — the transient park, the listing doors, the caller census.
//   §6 controls — a patched copy per rule is red.
//   §7 ROUND 2 (the acceptance's defects): a frame carries a report whole, a receipt rides one road, every owed entry is
//      bounded and said, the await line names the cause; each leg red on d8adadd95 by name.
//   §10 ROUND 5: the pace parks only a wake that could fire, one line per sender, one item for the owner, an awaited
//      reply reaches its asker; each leg red on 734e40d4d by name.
//   §11 ROUND 6: a fold keeps every fall's truth class, an item's cap never splits a character, a live target is never
//      «not running», the owner's item per group, an awaited reply on every road; each leg red on b42bda596 by name.
//   §12–§15 (rounds 7–10: each law in ONE function and its censuses, «reaches», the per-sender reading, the senders' coverage)
//      MOVED VERBATIM to scripts/test-paced-wake-retry-rounds.mjs, and §B-f276 1a (the held-wake legs, lane bl-windows) to
//      scripts/test-paced-wake-retry-held.mjs (the coordinator's r2569: each file 9 s or less alone).
//   §9 ROUND 4: the fall causes come from ONE list, one report in a frame after a missed post, no cliff in the boot's
//      rebase, the owner told when it holds the promise; each leg red on facb0bd20 by name.
//   §8 ROUND 3: what a frame does not carry is free for the turn it opens, a backlog is paced out from the boot, the
//      verdict is asked again at the frame, the attempts' trim keeps the posts; each leg red on 0091e5b0b by name.
// No real CLI, no real vendor, no hub: a stub post over a manual clock. Never bills.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const G = require(path.join(REPO, 'src/channel-groups.js'));
const M = require(path.join(REPO, 'src/dispatch-model.js'));
const GE0 = require(path.join(REPO, 'src/server/groups-engine.js'));
const DELIVER0 = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const WD = require(path.join(REPO, 'src/server/worker-dispatch.js'));
const PM = require(path.join(REPO, 'src/peer-messaging.js'));
const SPEND_GUARD = require(path.join(REPO, 'src/server/spend-guard.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
const ROOT = scratchDir('pwr');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const T0 = 1_790_000_000_000;
const cidOf = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, C, D, E, F, H, I, J, K] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(cidOf);
const NAMES = { [A]: 'alpha', [B]: 'beta', [C]: 'gamma', [D]: 'delta', [E]: 'eps', [F]: 'zeta', [H]: 'eta', [I]: 'theta', [J]: 'iota', [K]: 'kappa' };
for (let n = 11; n <= 34; n++) NAMES[cidOf(n)] = 'm' + n;   // the wide legs' members
let seq = 0;

/** the rig: the REAL engine, store, ladder and park; a stub inbox; ONE manual clock for the park, the pace and the records */
function rig(name, { refuse = new Set(), peerOf = null, post = null, guard = null, hosts = null, GE = GE0, DELIVER = DELIVER0, dir = null, shared = null, heldRetry = null } = {}) {
  const dataDir = dir || path.join(ROOT, name + '-' + (++seq));
  fs.mkdirSync(dataDir, { recursive: true });
  const c = shared || { now: T0, timers: [] };
  const retryClock = { now: () => c.now, setTimeout: (fn, ms) => { const t = { at: c.now + Math.max(0, ms), fn }; c.timers.push(t); return t; }, clearTimeout: (t) => { const i = c.timers.indexOf(t); if (i >= 0) c.timers.splice(i, 1); } };
  const sessions = new Map();
  const roster = Object.entries(NAMES).map(([cid, n]) => ({ cid, name: n, groups: ['tg1'], reachability: null }));
  for (const r of roster) sessions.set('w-' + r.name, { claudeSessionId: r.cid, backendSessionId: r.cid, name: r.name, mode: 'chat', backend: 'claude', _isStreaming: false, _turnStateSeen: true });
  const R = { c, dataDir, sessions, posts: [], cards: [], auths: [], notes: [], releases: [], logs: [], answers: [], refuse, hostPosts: [], audit: [] };
  const log = (...a) => R.logs.push(a.join(' '));
  const quiet = { info: log, warn: log, log };
  R.deliver = DELIVER.create({
    dataDir, activeSessions: sessions, serverSetting: () => undefined, retryClock, log, renderBatch: AR.renderMsgStash,
    peerMsg: {
      findPeer: peerOf || ((cid) => ({ name: cid, socketPath: '/dev/null' })),
      postToPeer: post || (async (peer, text) => { const a = R.answers.length ? R.answers.shift() : { ok: true, phase: 'written' }; const out = typeof a === 'function' ? await a(text) : a; if (out.ok) R.posts.push({ cid: peer.name, text }); return out; }),
      postChannelEvent: async () => ({ ok: false }),
    },
    getHosts: () => hosts, getConvIndex: () => (hosts ? { ownerHost: () => 'h1' } : null),
    emitPeerCard: (cid, card) => { R.cards.push({ cid, ...card }); return true; },
    authorizeSpend: (q) => { R.auths.push({ reason: q.reason, cid: q.cid }); if (guard) return guard.authorize(q); return refuse.has(q.cid) ? { ok: false, why: 'hour-cap', detail: 'hour cap reached', limits: { perIdentityHour: 1 } } : { ok: true, identity: { key: 'slot-1', name: 'Personal' }, hold: 'h' + R.auths.length }; },
    noteSpend: (q) => { R.notes.push(q); if (guard) guard.note(q); }, releaseSpend: (q) => { R.releases.push(q); if (guard) guard.release(q); },
  });
  R.store = createChannelStore({ dir: path.join(dataDir, 'channels'), log: quiet, ...(heldRetry ? { heldRetry } : {}) });
  R.todos = new UserTodoManager({ dataDir, now: () => c.now });
  R.eng = GE.create({ store: R.store, deliver: R.deliver, broadcast: () => { }, now: () => c.now, paceClock: () => c.now, roster: () => roster, groupSetting: () => 'none', log: quiet, userTodos: R.todos });
  R.settle = async () => { await R.deliver.settleRetries(2000); await sleep(1); await R.deliver.settleRetries(2000); };
  /** move the clock to `to`, firing every timer in its order */
  R.advanceTo = async (to) => {
    for (;;) {
      c.timers.sort((x, y) => x.at - y.at);
      const t = c.timers[0];
      if (!t || t.at > to) break;
      c.timers.shift();
      c.now = Math.max(c.now, t.at);
      t.fn();
      await R.settle();
    }
    c.now = to;
    await R.settle();
  };
  R.at = (ms) => R.advanceTo(T0 + ms);
  R.group = async (nm, by, members) => { const r = await R.eng.create({ by, name: nm, members, quiet: true }); if (!r.ok) throw new Error('create: ' + JSON.stringify(r)); return r.group.id; };
  R.say = (gid, from, text, extra = {}) => R.eng.post({ group: gid, from, text, mayWake: R.eng.pacerFor(from), ...extra });
  R.owed = (cid) => R.deliver.retryPeek(cid).filter((e) => e.held && e.held.why === 'paced');
  R.turn = async (cid) => { const rep = R.eng.reportsForTurn(cid, { budget: 4000 }); await R.eng.commitReports(cid, rep.marks); await R.settle(); return rep; };
  R.close = () => { try { R.deliver.closeRetries(); R.deliver.flush(); } catch { } try { R.store.close(); } catch { } };
  return R;
}

/** a leg that throws is a red line by name, never the end of the run (on the base's archive copy the doors do not exist) */
const leg = async (n, fn) => { try { await fn(); } catch (e) { fail++; console.error(`  ✗ leg ${n} threw — ${(e && e.message) || e}`); } };

/** about 1000 characters, its point at the very end (acceptance r1's measured shape) */
const longInstruction = (tag) => `@beta ${'step of the chain: read this whole line before you go on. '.repeat(16)}FINAL-INSTRUCTION-${tag}`;
/** D1's measured shape: a wake in group one, then two long messages in two more groups inside the window */
async function twoLongReports(R) {
  const g1 = await R.group('one', A, [B]);
  const g2 = await R.group('two', A, [B, C]);
  const g3 = await R.group('three', A, [B, D]);
  await R.at(100); await R.say(g1, A, '@beta one');
  await R.at(1100); await R.say(g2, A, longInstruction('TWO'));
  await R.at(2100); await R.say(g3, A, longInstruction('THREE'));
  await R.at(100000);
  const frame = R.posts[1] ? R.posts[1].text : '';
  const rep = await R.turn(B);
  return { frames: R.posts.length, frame, size: Buffer.byteLength(frame), finals: /FINAL-INSTRUCTION-TWO/.test(frame) && /FINAL-INSTRUCTION-THREE/.test(frame), owed: R.owed(B).length, report: rep.text };
}
/** D2's measured shape: the CLI takes the frame and the turn's hook drains while the post sits in its grace */
async function receiptMidPost(name, DELIVER = DELIVER0) {
  let R = null, drained = 0;
  const frames = [];
  R = rig(name, { DELIVER, post: async (peer, text) => { frames.push(text); if (/receipt words/.test(AR.drainStashUnderCap(R.deliver, B, 0, () => { }))) drained++; return { ok: true, phase: 'written' }; } });
  await R.at(100);
  R.deliver.stashFor(B, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt words', ref: 'p-1', held: { kind: 'notice', why: 'paced' } });
  R.deliver.parkOwedWake(B, { producer: 'stash-wake', key: 'p-1', retryInMs: 25000, spendReason: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', sender: G.OWNER, reason: 'paced', meta: { ref: 'p-1' } });
  await R.at(25100);
  const out = { frames: frames.length, frame: frames[0] || '', drained, words: frames.filter((f) => /receipt words/.test(f)).length + drained, cards: R.cards.filter((c) => /receipt words/.test(String(c.text))).length, left: R.deliver.stashEntries(B).length };
  R.close();
  return out;
}

/** P1's measured shape (leg 72's): 5 groups, 4 owed reports of about 4 KiB; the woken turn's hook lands inside the post's grace */
async function restRidesTheTurn(name, DELIVER = DELIVER0) {
  let R = null, carried = '';
  R = rig(name, { DELIVER, post: async (peer, text) => { R.posts.push({ cid: peer.name, text }); const rep = R.eng.reportsForTurn(B, { budget: 4000 }); carried += rep.text; await R.eng.commitReports(B, rep.marks); return { ok: true, phase: 'written' }; } });
  const gs = [];
  for (const n of ['one', 'two', 'three', 'four', 'five']) gs.push(await R.group(n, A, [B]));
  await R.at(100); await R.say(gs[0], A, '@beta first');
  let at = 1000;
  for (let i = 1; i < 5; i++) for (let k = 0; k < 5; k++) { at += 100; await R.at(at); await R.say(gs[i], A, `@beta ${'a long line of the instruction. '.repeat(24)} GROUP-${i}-LINE-${k}`); }
  await R.at(40000);
  const frame = R.posts[1] ? R.posts[1].text : '';
  const inFrame = [1, 2, 3, 4].filter((i) => frame.includes(`GROUP-${i}-LINE-4`));
  const rest = [1, 2, 3, 4].filter((i) => !inFrame.includes(i));
  await R.at(200000);
  const out = { posts: R.posts.length, auths: R.auths.length, frameShown: inFrame.length, rest, carried: rest.length > 0 && rest.every((i) => carried.includes(`GROUP-${i}-LINE-4`)), owed: R.owed(B).length };
  R.close();
  return out;
}
/** P2's measured shape: 19 targets (8 woken, 11 parked), the hub down 2 h */
async function backlogAfterDowntime(name, downMs = 2 * 3600_000) {
  const c = { now: T0, timers: [] };
  const R1 = rig(name, { shared: c });
  const members = Object.keys(NAMES).filter((cid) => cid !== A).slice(0, 19);
  const g = await R1.group('wide', A, members);
  let at = 100;
  for (const m of members) { at += 10; await R1.at(at); await R1.say(g, A, `@${NAMES[m]} go`); }
  const parked = members.reduce((n, m) => n + R1.owed(m).length, 0);
  R1.close();
  c.timers.length = 0;
  c.now = T0 + downMs;
  const boot = c.now;
  const R2 = rig(name + '-2', { shared: c, dir: R1.dataDir });
  await R2.advanceTo(boot + 59_000);
  const firstMinute = R2.posts.length;
  const stamps = (R2.store.pace.live().senders[A] || []).filter((v) => v >= boot && v < boot + 60_000).length;
  const said = R2.logs.some((l) => /waited through the downtime/.test(l));
  await R2.advanceTo(boot + 10 * 60_000);
  const out = { parked, firstMinute, stamps, said, finally: R2.posts.length, owed: members.reduce((n, m) => n + R2.owed(m).length, 0) };
  R2.close();
  return out;
}

/** P10's measured shape: a wake parked while its group's frame is on the wire, that post missing */
async function twinLeg(name, DELIVER = DELIVER0) {
  const R = rig(name, { DELIVER });
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta UNIQUE-TWO');
  R.answers.push(async () => { await R.say(g, A, '@beta UNIQUE-THREE'); return { ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 }; });
  await R.at(30100);
  const owed = R.owed(B);
  const before = R.posts.length;
  await R.at(200000);
  const frame = R.posts[before] ? R.posts[before].text : '';
  const count = (w) => frame.split(w).length - 1;
  const out = { owed: owed.length, senders: owed[0] ? owed[0].senders.length : 0, frames: R.posts.length - before, two: count('UNIQUE-TWO'), three: count('UNIQUE-THREE'), batch: /held for the wake pace:/.test(frame), left: R.owed(B).length, auths: R.auths.length, notes: R.notes.length };
  R.close();
  return out;
}

// ── §1 THE PURE RULES ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§1 the pure rules: the pace answers the wait');
await leg(1, async () => {
  const at = T0;
  const pair = G.paceGrant(G.emptyPace(), { sender: 's', member: 'm', at: at - 5000 }).state;
  const v = G.paceVerdict(pair, { sender: 's', member: 'm', at });
  ok(v.ok === false && v.why === 'pair' && v.retryInMs === 25000, '(a) the 30-s floor: 5 s after a wake the verdict answers 25 000 ms', v);
  ok(gateOf(/^paced — sent in 25 s/.test(v.reason)) && !/next turn/.test(v.reason), '(a) …and its words say «paced — sent in N s», never «next turn»', v.reason);
  ok(G.paceVerdict(pair, { sender: 's', member: 'm', at: at + v.retryInMs - 1 }).ok === false && G.paceVerdict(pair, { sender: 's', member: 'm', at: at + v.retryInMs }).ok === true, '(a) …exact: refused 1 ms before the instant it names, granted at it');
  let full = G.emptyPace();
  for (let i = 0; i < G.SENDER_WAKES; i++) full = G.paceGrant(full, { sender: 's', member: 'm' + i, at: at - 40000 + i * 100 }).state;
  const s = G.paceVerdict(full, { sender: 's', member: 'other', at });
  ok(s.ok === false && s.why === 'sender' && s.retryInMs === 20000, '(b) the per-minute slot: the oldest of 8 stamps 40 s ago ⇒ 20 000 ms', s);
  ok(gateOf(/^paced — sent in 20 s/.test(s.reason)) && verdictOf(/per sender per minute/.test(s.reason)), '(b) …the rule is named');
  ok(G.paceVerdict(full, { sender: 's', member: 'other', at: at + s.retryInMs }).ok === true, '(b) …granted at that instant');
  const both = G.paceVerdict(full, { sender: 's', member: 'm7', at: at - 40000 + 700 + 1000 });
  ok(both.ok === false && both.retryInMs === Math.max(29000, 60000 - 1700), '(c) both rules bind: the LATER of the two', both);
  ok(G.pacedWords(1) === 'paced — sent in 1 s' && G.pacedWords(25000) === 'paced — sent in 25 s' && G.pacedWords(25001) === 'paced — sent in 26 s', '(d) N rounds up, ≥ 1');
  ok(verdictOf(/next turn instead$/.test(G.unparkedReason('rate floor: x'))), '(d) the next-turn sentence survives ONLY for a wake nothing parked');
  ok(G.awaitState({ raw: { await: { until: at + 1 } } }, { heldAt: at, held: 'paced' }, at).paced === true && !G.awaitState({ raw: { await: { until: at + 1 } } }, { heldAt: at, held: 'rate-floor' }, at).paced, '(e) an awaited reply the pace holds reads «paced», a wake cap still reads «held»');

  const vd = (over) => M.dispatchVerdict({ callerKind: 'session', senderReach: 'messageable', targetKind: 'chat', targetState: 'idle', compactFirst: true, compactObserved: true, sharedGroup: true, ...over });
  const p = vd({ pacer: { reason: 'paced — sent in 25 s (rate floor)', retryInMs: 25000 } });
  ok(gateOf(p.ok) && p.steps.join() === 'park' && p.compact === 'skipped' && p.skip === 'paced' && p.retryInMs === 25000, '(f) the verdict: paced ⇒ PARK with retryInMs, no compaction', p);
  ok(gateOf(/sent in 25 s/.test(p.why)) && gateOf(/not compacted/.test(p.why)) && !/next turn/.test(p.why), '(f) …its words never say «rides the next turn»', p.why);
  ok(vd({ pacer: { reason: 'no pacer' } }).steps.join() === 'stash' && vd({ spend: { why: 'hour-cap', detail: 'hour cap' } }).steps.join() === 'stash', '(f) a refusal naming no wait, and the SPEND gate, still stash (the budget is the owner\'s dial)');
  const rec = M.dispatchRecord({ target: { cid: 'c', name: 'w' }, verdict: p, wake: { woke: false, reason: 'paced — sent in 25 s', paced: { retryInMs: 25000, retryAt: at + 25000 } } });
  ok(rec.wake.delivered === 'paced' && rec.wake.billed === false && rec.wake.retryInMs === 25000 && rec.wake.retryAt === at + 25000, '(g) the record: delivered «paced», not billed, when it goes', rec.wake);
  ok(verdictOf(/wake=paced/.test(M.journalLine({ from: 'f', record: rec }))), '(g) …and the journal line says so');
  const un = M.dispatchRecord({ target: { cid: 'c', name: 'w' }, verdict: p, wake: { woke: false, reason: 'rate floor — it reaches them on their next turn instead' } });
  ok(un.wake.delivered === 'next-turn' && !/sent in/.test(un.why), '(g) a verdict nothing parked never claims «sent in N s»', un);
});

// ── §2 LAW 1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§2 law 1: a paced wake is parked, sent when the window ends, once');
await leg(100, async () => { // THE OWNER'S RULE, pinned directly: a stub target that stays IDLE and never turns on its own, over a REAL inbox socket
  const sock = path.join(ROOT, 'stub-inbox.sock');
  const frames = [];
  const server = net.createServer((conn) => { let buf = ''; conn.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const f = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (f.type === 'user') frames.push(f.message.content); } }); });
  await new Promise((r) => server.listen(sock, r));
  const R = rig('idle', { peerOf: (cid) => ({ name: cid, socketPath: sock, key: 'k'.repeat(64) }), post: (peer, text) => PM.postToPeer(peer, text, { timeoutMs: 2000 }) });
  const g = await R.group('lane', A, [B]);
  await R.at(100);
  const r1 = await R.say(g, A, '@beta first');
  ok(r1.woke.length === 1 && frames.length === 1, 'THE RULE: the first wake opens a turn (the control)', frames.length);
  await R.at(5100);
  const r2 = await R.say(g, A, '@beta the chain goes on');
  ok(r2.refused[0].parked === true && verdictOf(/^paced — sent in 25 s/.test(r2.refused[0].reason)), 'THE RULE: the caller who asked for a wake is told «sent in N s»', r2.refused[0].reason);
  await R.at(30099);
  ok(frames.length === 1, 'THE RULE: …nothing before the window ends');
  const a0 = R.auths.length;
  await R.at(30100);
  ok(frames.length === 2 && verdictOf(/the chain goes on/.test(frames[1])), 'THE RULE: the idle target that never turned IS WOKEN — one frame on its real inbox = one turn opened', frames);
  ok(R.auths.length === a0 + 1 && R.notes.length === 2 && R.notes[1].hold === 'h' + R.auths.length && R.releases.length === 0, 'THE RULE: …one billed-wake authorization, converted (its own hold, nothing given back)', { auths: R.auths.length - a0, note: R.notes[1] && R.notes[1].hold, rel: R.releases });
  await R.at(2 * 3600_000);
  ok(frames.length === 2 && R.notes.length === 2 && R.owed(B).length === 0, 'THE RULE: …exactly once, however long it stays idle', frames.length);
  R.close();
  await new Promise((r) => server.close(r));
});
await leg(2, async () => { // (a) the owner's question
  const R = rig('a');
  const g = await R.group('lane', A, [B]);
  await R.at(100);
  const r1 = await R.say(g, A, '@beta first');
  ok(r1.woke.length === 1 && R.posts.length === 1, '(a) the first @ wakes (the control)');
  await R.at(5100);
  const r2 = await R.say(g, A, '@beta second, the chain goes on');
  const ref = r2.refused[0];
  ok(r2.woke.length === 0 && gateOf(ref) && ref.refused === 'rate-floor' && ref.parked === true && ref.retryInMs === 25000 && ref.retryAt === T0 + 30100, '(a) 5 s later: not woken, PARKED, the wait answered', r2.refused);
  const owed = R.owed(B);
  ok(owed.length === 1 && owed[0].held.why === 'paced' && owed[0].nextAt === T0 + 30100 && owed[0].producer === 'groups', '(a) …one entry in the park, held.why = paced, due at the window\'s end', owed);
  await R.at(30099);
  ok(R.posts.length === 1, '(a) 1 ms before the window ends: nothing posted');
  const auths0 = R.auths.length;
  await R.at(30100);
  ok(R.posts.length === 2 && R.posts[1].cid === B && verdictOf(/second, the chain goes on/.test(R.posts[1].text)), 'THE LAW (a): the idle target IS woken at the window\'s end, with the message', R.posts.map((p) => p.text.slice(0, 80)));
  ok(R.owed(B).length === 0, '(a) …the entry left the park');
  ok(R.auths.length === auths0 + 1 && R.auths[auths0].reason === 'peer-message' && R.notes.length === 2, '(a) …ONE authorization at that attempt, ONE charge (peer-message)', { auths: R.auths, notes: R.notes.length });
  const rep = await R.turn(B);
  ok(!rep.text, '(a) …the marker moved: the next turn is not handed it again', rep.text);
  await R.at(200000);
  ok(R.posts.length === 2, '(a) …and never a second post');
  const raw = R.store.auditTail({ limit: 100 }).filter((x) => x.kind === 'group-wake');
  ok(verdictOf(raw.some((x) => x.ok === true && /window ended/.test(x.reason || ''))), '(a) …the audit row says it landed');
  R.close();
});
await leg(3, async () => { // (b) a target that turned first
  const R = rig('b');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  ok(R.owed(B).length === 1, '(b) parked');
  const a0 = R.auths.length;
  await R.at(6000);
  const rep = await R.turn(B);
  ok(verdictOf(/two/.test(rep.text)), '(b) the target started a turn: the report carries the message, free', rep.text);
  ok(R.owed(B).length === 0 && R.deliver.retryPeek(B).length === 0, '(b) …the retry is cancelled at once (retryTake via prompt)');
  await R.at(200000);
  ok(R.posts.length === 1 && R.auths.length === a0, 'THE CONTRAST (b): the target turned first ⇒ the wake is cancelled — 0 extra wakes, the brief rode the turn', { posts: R.posts.length });
  R.close();
});
await leg(4, async () => { // (c) another sender's wake carried it first
  const R = rig('c');
  const g = await R.group('lane', A, [B, C]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(1100); await R.say(g, A, '@beta two');
  ok(R.owed(B).length === 1, '(c) parked');
  await R.at(2000);   // another SENDER's first wake of the same target: its report carries what the park owes
  const r = await R.say(g, C, '@beta from gamma');
  ok(r.woke.length === 1 && verdictOf(/two/.test(R.posts[1].text)), '(c) another sender wakes the same target, and its report carries the owed message', R.posts.map((p) => p.text.slice(0, 80)));
  ok(R.owed(B).length === 0, '(c) …the retry is cancelled at once (the marker moved)');
  await R.at(200000);
  const carried = R.posts.filter((p) => /two/.test(p.text)).length;
  ok(carried === 1 && R.posts.length === 2, '(c) …the parked message reached it exactly ONCE, no second wake', R.posts.map((p) => p.text.slice(0, 60)));
  R.close();
});
await leg(5, async () => { // (d) two paced wakes, one group
  const R = rig('d');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(2100); const r2 = await R.say(g, A, '@beta two');
  await R.at(3100); const r3 = await R.say(g, A, '@beta three');
  ok(gateOf(r2.refused[0].parked) && verdictOf(r3.refused[0].parked), '(d) both paced');
  ok(R.owed(B).length === 1 && R.owed(B)[0].meta.vids.length === 0, '(d) ONE entry');
  const a0 = R.auths.length;
  await R.at(100000);
  ok(R.posts.length === 2, 'THE LAW (d): two paced wakes ⇒ ONE frame', R.posts.length);
  ok(gateOf(/two/.test(R.posts[1].text)) && verdictOf(/three/.test(R.posts[1].text)), '(d) …carrying both messages', R.posts[1].text);
  ok(R.auths.length === a0 + 1 && R.notes.length === 2, '(d) …one wake billed');
  R.close();
});
await leg(6, async () => { // (e) two senders, one group
  const R = rig('e');
  const g = await R.group('lane', A, [B, C]);
  await R.at(100); await R.say(g, A, '@beta from alpha 1');
  await R.at(200); await R.say(g, C, '@beta from gamma 1');
  await R.at(5200); const a = await R.say(g, A, '@beta from alpha 2');
  await R.at(5300); const c = await R.say(g, C, '@beta from gamma 2');
  ok(gateOf(a.refused[0].parked) && verdictOf(c.refused[0].parked), '(e) both senders paced');
  ok(R.owed(B).length === 1 && R.owed(B)[0].senders.length === 2, '(e) ONE entry, both senders on it', R.owed(B));
  const before = R.posts.length;
  await R.at(100000);
  ok(R.posts.length === before + 1 && gateOf(/alpha 2/.test(R.posts[before].text)) && verdictOf(/gamma 2/.test(R.posts[before].text)), 'THE LAW (e): two senders ⇒ ONE frame, one wake', R.posts.slice(before));
  R.close();
});
await leg(7, async () => { // (f) two groups
  const R = rig('f');
  const g1 = await R.group('one', A, [B]);
  const g2 = await R.group('two', A, [B, C]);
  const g3 = await R.group('three', A, [B, D]);
  await R.at(100); await R.say(g1, A, '@beta in one');
  await R.at(1100); await R.say(g2, A, '@beta in two');
  await R.at(2100); await R.say(g3, A, '@beta in three');
  ok(R.owed(B).length === 2, '(f) two entries (one per group)');
  const a0 = R.auths.length, c0 = R.cards.length;
  await R.at(100000);
  ok(R.posts.length === 2, 'THE LAW (f): two groups ⇒ ONE frame, one wake', R.posts.map((p) => p.text.slice(0, 80)));
  ok(gateOf(/in two/.test(R.posts[1].text)) && verdictOf(/in three/.test(R.posts[1].text)), '(f) …both reports in it', R.posts[1].text);
  ok(verdictOf(/held for the wake pace/.test(R.posts[1].text)), '(f) …the frame\'s heading says VibeSpace held it for the pace', R.posts[1].text.slice(0, 200));
  ok(R.auths.length === a0 + 1, '(f) …one authorization');
  ok(R.cards.length === c0 + 1, '(f) …one card');
  ok(!(await R.turn(B)).text, '(f) …both markers moved');
  R.close();
});
await leg(8, async () => { // (g) the per-minute slot
  const R = rig('g');
  const members = [B, C, D, E, F, H, I, J, K];
  const g = await R.group('wide', A, members);
  const names = members.map((m) => NAMES[m]);
  for (let i = 0; i < 8; i++) { await R.at(100 + i * 100); await R.say(g, A, `@${names[i]} go`); }
  ok(R.posts.length === 8, '(g) eight wakes in a second go out');
  await R.at(5000);
  const r = await R.say(g, A, `@${names[8]} the ninth`);
  ok(r.refused[0].parked === true && r.refused[0].retryInMs === 55100, '(g) the ninth: parked, the wait = the oldest stamp\'s slot', r.refused);
  ok(verdictOf(/per sender per minute/.test(r.refused[0].reason)), '(g) …the rule named', r.refused[0].reason);
  await R.at(60099);
  ok(R.posts.length === 8, '(g) nothing before the slot opens');
  await R.at(60100);
  ok(R.posts.length === 9 && R.posts[8].cid === K, 'THE LAW (g): the slot opens ⇒ the ninth is woken', R.posts.length);
  const stamps = R.store.pace.live().senders[A].filter((x) => x === T0 + 60100);
  ok(stamps.length === 1, '(g) the retry took a pace slot itself: the ledger counts it', stamps);
  R.close();
});
await leg(9, async () => { // (h) the pace refuses AGAIN
  const R = rig('h');
  const members = [B, C, D, E, F, H, I, J];
  const g = await R.group('wide', A, members);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta owed');
  const others = members.slice(1).map((m) => NAMES[m]);
  for (let i = 0; i < 7; i++) { await R.at(10000 + i * 100); await R.say(g, A, `@${others[i]} go`); }
  ok(R.owed(B).length === 1 && R.posts.length === 8, '(h) the sender spent its minute while the wake waits');
  await R.at(30100);
  const e = R.owed(B)[0];
  ok(R.posts.length === 8 && gateOf(e) && e.nextAt === T0 + 60100 && e.attempts.length === 2 && e.attempts[1].phase === 'pace', 'THE LAW (h): the window ended, the pace refuses again ⇒ re-scheduled by the NEW wait (the slot), no post', e);
  await R.at(60099);
  ok(R.posts.length === 8 && R.owed(B)[0].attempts.length === 2, '(h) …and no attempt in between (never a tight loop)', R.owed(B)[0] && R.owed(B)[0].attempts.length);
  await R.at(60100);
  ok(R.posts.length === 9 && gateOf(/owed/.test(R.posts[8].text)) && R.owed(B).length === 0, '(h) …the slot opens: it goes', R.posts.length);
  R.close();
});
await leg(10, async () => { // (i) a turn end inside the window
  const R = rig('i');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  const session = R.sessions.get('w-beta');
  await R.at(10000);
  await R.deliver.noteTurnEnd(session); await R.settle();
  const e = R.owed(B)[0];
  ok(R.posts.length === 1 && gateOf(e) && e.nextAt === T0 + 30100, '(i) a turn END inside the window posts nothing: the floor holds it to the window\'s end', e);
  await R.at(30100);
  ok(R.posts.length === 2, '(i) …the window ends: it goes');
  await R.at(40000); await R.say(g, A, '@beta three');
  await R.at(70100);
  ok(R.posts.length === 3, '(i) a later paced wake parks and lands the same way');
  R.close();
});
await leg(11, async () => { // (j) ONE authorization HELD
  const R = rig('j');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  const a0 = R.auths.length;
  R.answers.push({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 });
  await R.at(30100);
  const e = R.owed(B)[0];
  ok(gateOf(e) && gateOf(e.charged) && gateOf(e.charged.hold) && R.auths.length === a0 + 1 && R.posts.length === 1, '(j) a transient miss at the retry: the authorization is HELD on the entry', e);
  ok(e.nextAt === T0 + 60100, '(j) …the existing backoff\'s first step (30 s)', e && e.nextAt);
  ok(R.releases.length === 0, '(j) …nothing given back yet');
  ok(!R.store.pace.live().pairs[A + '|' + B] || R.store.pace.live().pairs[A + '|' + B] < T0 + 30100, '(j) …the wake did not go out: the pair\'s floor went back', R.store.pace.live().pairs);
  await R.at(60100);
  ok(R.posts.length === 2 && R.auths.length === a0 + 1 && R.notes.length === 2, 'THE LAW (j): the retry converts the hold — never re-billed, ONE charge', { auths: R.auths.length - a0, notes: R.notes.length });
  ok(R.owed(B).length === 0, '(j) …landed');
  R.close();
});
await leg(12, async () => { // (k) past the hold's TTL it is re-judged, as today
  const R = rig('k');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  const a0 = R.auths.length;
  for (let i = 0; i < 4; i++) R.answers.push({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 });
  await R.at(600000);
  ok(R.posts.length === 2 && R.notes.length === 2 && R.auths.length >= a0 + 2 && R.releases.length === R.auths.length - a0 - 1, '(k) past the TTL the hold goes back and is re-judged; still ONE charge for the frame', { auths: R.auths.length - a0, rel: R.releases.length, notes: R.notes.length });
  R.close();
});
await leg(13, async () => { // (l) the SPEND gate at the retry
  const refuse = new Set();
  const R = rig('l', { refuse });
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  refuse.add(B);
  const n0 = R.notes.length;
  await R.at(30100);
  ok(R.posts.length === 1 && R.notes.length === n0 && R.owed(B).length === 0, 'THE LAW (l): a retry the SPEND gate refuses is not posted, not billed, and leaves the park');
  const notice = R.deliver.stashEntries(A).find((x) => /NOT sent/.test(x.text));
  ok(gateOf(notice) && gateOf(/spend-cap/.test(notice.text)) && verdictOf(/hour cap reached/.test(notice.text)), '(l) …the reason named to the sender', notice);
  ok(R.deliver.stashEntries(B).length === 0, '(l) …the target\'s stash holds no copy (the group log is the store — never twice)');
  ok(verdictOf(/two/.test((await R.turn(B)).text)), '(l) …the message rides its next report, free');
  R.close();
});
await leg(14, async () => { // (m) a remote target goes down the ladder
  const remote = [];
  const hosts = { get: () => ({}), deviceBounded: async () => ({ peerPost: async ({ cid, text }) => { remote.push({ cid, text }); return { ok: true, peerName: 'beta' }; } }), device: async () => { throw new Error('unbounded'); } };
  const R = rig('m', { peerOf: () => null, hosts });
  const g = await R.group('lane', A, [B]);
  await R.at(100); const r1 = await R.say(g, A, '@beta one');
  ok(r1.woke.length === 1 && remote.length === 1, '(m) the first wake went to the owning machine');
  await R.at(5100); await R.say(g, A, '@beta two');
  ok(R.owed(B).length === 1, '(m) parked');
  const a0 = R.auths.length;
  await R.at(30100);
  ok(remote.length === 2 && verdictOf(/two/.test(remote[1].text)), 'THE LAW (m): no local inbox ⇒ the ladder\'s own rung carries it (never «not running»)', remote.map((x) => x.text.slice(0, 40)));
  ok(R.auths.length === a0 + 1 && R.notes.length === 2 && R.owed(B).length === 0, '(m) …one authorization, one charge, left the park');
  ok(!(await R.turn(B)).text, '(m) …the marker moved');
  ok(verdictOf(R.cards.some((x) => x.group && x.group.via === 'wake' && /two/.test(x.text))), '(m) …the normal group card');
  R.close();
});
await leg(39, async () => { // (m2) a codex target: the wrapper's rpc rung
  const dataDir = path.join(ROOT, 'rpc');
  fs.mkdirSync(path.join(dataDir, 'session-buffers'), { recursive: true });
  const R = rig('m2', { dir: dataDir, peerOf: () => null });
  const frames = [];
  const S = R.sessions.get('w-beta');
  Object.assign(S, { backend: 'codex', host: null, socketPath: path.join(dataDir, 'sockets', 'cw-w-beta'), pty: { write: (x) => frames.push(JSON.parse(String(x))) } });
  delete S.claudeSessionId;
  fs.writeFileSync(path.join(dataDir, 'session-buffers', 'w-beta.json'), JSON.stringify({ pid: process.pid, startedAt: Date.now(), mode: 'chat', backend: 'codex', threadId: B, caps: { peerMessage: true } }));
  const g = await R.group('lane', A, [B]);
  await R.at(100); const r1 = await R.say(g, A, '@beta one');
  ok(r1.woke.length === 1 && frames.length === 1 && frames[0].type === 'peer-message', '(m2) the first wake goes down the wrapper\'s rung', frames.map((f) => f.type));
  await R.at(5100); await R.say(g, A, '@beta two');
  ok(R.owed(B).length === 1, '(m2) parked');
  const a0 = R.auths.length;
  await R.at(30100);
  ok(frames.length === 2 && frames[1].type === 'peer-message' && gateOf(/two/.test(frames[1].text)) && gateOf(frames[1].group) && frames[1].group.via === 'wake', 'THE LAW (m2): a codex target is woken by the wrapper\'s rung when the window ends (never «not running»)', frames.map((f) => String(f.text).slice(0, 50)));
  ok(R.auths.length === a0 + 1 && R.notes.length === 2 && R.owed(B).length === 0, '(m2) …one authorization, one charge, left the park');
  ok(!(await R.turn(B)).text, '(m2) …the marker moved');
  R.close();
});
await leg(40, async () => { // (n) a CLI restarting when the window ends: the session lives, the inbox does not, yet
  let live = true;
  const R = rig('n', { peerOf: (cid) => (live ? { name: cid, socketPath: '/dev/null' } : null) });
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  live = false;
  await R.at(30100);
  const e = R.owed(B)[0];
  ok(R.posts.length === 1 && gateOf(e) && e.nextAt === T0 + 60100 && !R.deliver.stashEntries(A).length, '(n) no inbox at this instant while the session lives: the wake stays owed, on the backoff, nothing said yet', e);
  live = true;
  await R.at(60100);
  ok(R.posts.length === 2 && gateOf(/two/.test(R.posts[1].text)) && R.owed(B).length === 0, '(n) …the CLI is back: the wake goes, once', R.posts.length);
  R.close();
});
await leg(41, async () => { // (n2) a conversation that is gone
  let live = true;
  const R = rig('n2', { peerOf: (cid) => (live ? { name: cid, socketPath: '/dev/null' } : null) });
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  live = false; R.sessions.delete('w-beta');
  await R.at(30100);
  ok(R.posts.length === 1 && R.owed(B).length === 0, '(n2) the conversation stopped: it cannot be woken, the entry falls');
  const notice = R.deliver.stashEntries(A).find((x) => /NOT sent/.test(x.text));
  ok(gateOf(notice) && verdictOf(/not-running/.test(notice.text)), '(n2) …and the sender is told', notice);
  ok(verdictOf(/two/.test((await R.turn(B)).text)), '(n2) …it reads it when it runs again');
  R.close();
});
await leg(42, async () => { // (n3) a live CLI gone for the whole bound
  let live = true;
  const R = rig('n3', { peerOf: (cid) => (live ? { name: cid, socketPath: '/dev/null' } : null) });
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  live = false;
  await R.at(70 * 60_000);
  ok(R.owed(B).length === 0 && verdictOf(R.deliver.stashEntries(A).some((x) => /paced-out/.test(x.text))), '(n3) a session with no inbox for the whole hour falls at the bound, said (paced-out)', R.deliver.stashEntries(A));
  R.close();
});
await leg(16, async () => { // (o) a restart keeps the debt, never the words
  const c = { now: T0, timers: [] };
  const R1 = rig('o', { shared: c });
  const g = await R1.group('lane', A, [B]);
  await R1.at(100); await R1.say(g, A, '@beta one');
  await R1.at(5100); await R1.say(g, A, '@beta the secret words');
  const file = fs.readFileSync(path.join(R1.dataDir, 'msg-retry.json'), 'utf-8');
  ok(gateOf(/"why":"paced"/.test(file)) && !/secret words/.test(file), '(o) the entry is on disk, the WORDS are not (the group log is the store — a clear reaches what the retry reads)', file.slice(0, 300));
  R1.close();
  c.timers.length = 0;
  c.now = T0 + 40000;
  // the boot's window: the park is up, the groups engine is not
  const log2 = [];
  const noEngine = DELIVER0.create({ dataDir: R1.dataDir, activeSessions: new Map(), serverSetting: () => undefined, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) }, retryClock: { now: () => c.now, setTimeout: (fn, ms) => { const t = { at: c.now + ms, fn }; c.timers.push(t); return t; }, clearTimeout: (t) => { const i = c.timers.indexOf(t); if (i >= 0) c.timers.splice(i, 1); } }, log: (...a) => log2.push(a.join(' ')) });
  const t = c.timers.shift(); if (t) t.fn();
  await noEngine.settleRetries(2000); await sleep(2);
  ok(noEngine.retryPeek(B).length === 1 && noEngine.stashEntries(B).length === 0, '(o) a sweep before the groups engine exists judges nothing (no fall, no stash)', log2.slice(-2));
  noEngine.closeRetries();
  c.timers.length = 0;
  const R2 = rig('o2', { shared: c, dir: R1.dataDir });
  ok(R2.owed(B).length === 1, '(o) the new process holds the debt');
  await R2.advanceTo(T0 + 200000);
  ok(R2.posts.length === 1 && gateOf(/secret words/.test(R2.posts[0].text)) && R2.owed(B).length === 0, 'THE LAW (o): after a restart the wake still goes, once, with the words read from the log', R2.posts.map((p) => p.text.slice(0, 80)));
  R2.close();
});
await leg(17, async () => { // (p) a process that died with the frame on the wire
  const c = { now: T0, timers: [] };
  const R1 = rig('p', { shared: c });
  const g = await R1.group('lane', A, [B]);
  await R1.at(100); await R1.say(g, A, '@beta one');
  await R1.at(5100); await R1.say(g, A, '@beta two');
  R1.answers.push(() => new Promise(() => { }));   // the post never answers: the process dies here
  c.timers.sort((x, y) => x.at - y.at); c.now = T0 + 30100; const t = c.timers.shift(); if (t) t.fn();
  await sleep(5);
  ok(verdictOf(/"inflight":/.test(fs.readFileSync(path.join(R1.dataDir, 'msg-retry.json'), 'utf-8'))), '(p) the stamp is on disk before the post');
  c.timers.length = 0;
  const R2 = rig('p2', { shared: c, dir: R1.dataDir });
  await R2.advanceTo(T0 + 200000);
  ok(R2.posts.length === 0, '(p) a frame that may have landed is never posted again', R2.posts);
  const notice = R2.deliver.stashEntries(A).find((x) => /may have been woken already/.test(x.text));
  ok(verdictOf(notice), '(p) …the sender hears it may have gone', R2.deliver.stashEntries(A));
  ok(verdictOf(/two/.test((await R2.turn(B)).text)), '(p) …the next report carries it (a possible repeat, never a loss)');
  R2.close();
});
await leg(18, async () => { // (q) what changes while it waits
  const R = rig('q');
  const g = await R.group('lane', A, [B, C]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  await R.at(6100); await R.say(g, C, 'a plain line from gamma');
  await R.at(30100);
  ok(R.posts.length === 2 && verdictOf(/plain line from gamma/.test(R.posts[1].text)), '(q) a later non-waking message rides the same frame (the report is rendered as the frame leaves)', R.posts[1].text);
  await R.at(40000); await R.say(g, A, '@beta muted soon');
  await R.eng.setNotify({ by: B, group: g, notify: 'mute' });
  await R.at(120000);
  ok(R.posts.length === 2 && R.owed(B).length === 0, '(q) the target muted the group while it waited: cancelled, no post');
  R.close();
});
await leg(19, async () => { // (r) the record clear reaches the words
  const R = rig('r');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); const r = await R.say(g, A, '@beta words that get cleared');
  const cl = await R.eng.clearMessages({ group: g, ids: [r.message.vendorId] });
  ok(gateOf(cl.ok) && cl.cleared.length === 1, '(r) the owner clears the message while its wake waits', cl);
  await R.at(30100);
  ok(!R.posts.some((p) => /words that get cleared/.test(p.text)), 'THE LAW (r): the retry cannot carry words a clear took', R.posts.map((p) => p.text.slice(0, 120)));
  R.close();
});
await leg(20, async () => { // (s) an awaited reply
  const R = rig('s');
  const g = await R.group('pair', A, [B]);
  await R.at(100); await R.say(g, B, '@alpha hello');   // B has just woken A: the pair's floor is on
  await R.at(1100); const q = await R.say(g, A, 'a question?', { awaitReply: true });
  await R.at(2100); const a = await R.say(g, B, 'the answer');
  ok(a.awaited.length === 1 && a.awaited[0].held === 'paced', '(s) the reply\'s wake of the asker is paced', a.awaited);
  const vid = q.message.vendorId;
  const entryOf = () => R.eng.get(g).awaits && R.eng.get(g).awaits[vid];
  ok(gateOf(entryOf()) && G.awaitState({ raw: q.message.raw }, entryOf(), R.c.now).paced === true, '(s) the record reads «paced», not «wake cap reached»', entryOf());
  ok(R.owed(A).length === 1 && verdictOf(R.owed(A)[0].meta.vids.includes(vid)), '(s) …parked, carrying the await');
  await R.at(30100);
  const frame = R.posts.filter((p) => p.cid === A).pop();
  ok(gateOf(frame) && gateOf(/\[await\]/.test(frame.text)) && gateOf(/the answer/.test(frame.text)) && verdictOf(/held this wake for the wake pace/.test(frame.text)), 'THE LAW (s): the asker IS woken by the reply when the window ends', frame && frame.text);
  ok(G.awaitState({ raw: q.message.raw }, entryOf(), R.c.now).state === 'woke', '(s) …the record reads «woke»', entryOf());
  R.close();
});
await leg(21, async () => { // (t) a paced dispatch
  const R = rig('t');
  const compacts = [];
  const worker = R.sessions.get('w-beta');
  worker.pty = { write() { } };
  const wd = WD.create({ activeSessions: R.sessions, getGroups: () => R.eng, getSendUserInput: () => (wid, text) => { compacts.push(text); return { ok: true }; }, authorizeSpend: (q) => { R.auths.push({ reason: q.reason, cid: q.cid }); return { ok: true, identity: { key: 'slot-1', name: 'Personal' }, hold: 'hd' }; }, noteSpend: (q) => R.notes.push(q), releaseSpend: (q) => R.releases.push(q), log: (...a) => R.logs.push(a.join(' ')), waitMs: 5, awaitEnd: async () => ({ ended: true, result: 'success' }) });
  const send = (text) => wd.dispatch({ from: A, fromKind: 'session', target: { cid: B, name: 'beta' }, text, compactFirst: true, mayWake: R.eng.pacerFor(A), consent: () => true });
  await R.at(100);
  const r1 = await send('brief one');
  ok(gateOf(r1.ok) && r1.record.wake.billed === true, '(t) the first dispatch wakes', r1.record && r1.record.wake);
  const c0 = compacts.length;
  await R.at(5100);
  const r2 = await send('brief two');
  ok(gateOf(r2.ok) && r2.record.wake.delivered === 'paced' && r2.record.wake.billed === false && r2.record.wake.retryInMs === 25000, '(t) the second inside the window: the record says «paced», with the wait', r2.record && r2.record.wake);
  ok(gateOf(/sent in 25 s/.test(r2.record.why)) && !/next turn/.test(r2.record.why), '(t) …the words', r2.record && r2.record.why);
  ok(compacts.length === c0 && r2.record.compacted === 'skipped', '(t) a refused wake never pays for a compaction', compacts);
  ok(R.owed(B).length === 1, '(t) …parked');
  await R.at(30100);
  ok(verdictOf(R.posts.some((p) => p.cid === B && /brief two/.test(p.text))), 'THE LAW (t): the brief goes when the window ends', R.posts.map((p) => p.text.slice(0, 60)));
  const replay = await send('brief two');
  ok(replay.replay === true, '(t) …a retry of the same brief is answered «already delivered»', replay);
  R.close();
});
await leg(22, async () => { // (u) the stash as an owed wake's store (a channel receipt, sign-in off)
  const R = rig('u');
  const park = (key) => R.deliver.parkOwedWake(B, { producer: 'stash-wake', key, retryInMs: 25000, spendReason: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', sender: G.OWNER, reason: 'paced', meta: { ref: key } });
  await R.at(100);
  R.deliver.stashFor(B, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt words', ref: 'p-1', held: { kind: 'notice', why: 'paced' } });
  const pk = park('p-1');
  ok(gateOf(pk) && gateOf(pk.parked) && R.deliver.stashEntries(B).length === 1, '(u) the receipt waits in the stash, the wake in the park');
  const a0 = R.auths.length;
  await R.at(25100);
  ok(R.posts.length === 1 && gateOf(/receipt words/.test(R.posts[0].text)) && verdictOf(/held this wake for the wake pace/.test(R.posts[0].text)), 'THE LAW (u): the wake goes when the window ends', R.posts);
  ok(R.deliver.stashEntries(B).length === 0 && R.auths[a0].reason === 'channel-receipt', '(u) …the stash entry left with it, ONE authorization under its own reason', R.auths);
  await R.at(30000);
  R.deliver.stashFor(B, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'second receipt', ref: 'p-2', held: { kind: 'notice', why: 'paced' } });
  park('p-2');
  const text = AR.drainStashUnderCap(R.deliver, B, 0, () => { });
  ok(verdictOf(/second receipt/.test(text)), '(u) a prompt drains the stash first');
  await R.at(100000);
  ok(R.posts.length === 1 && R.owed(B).length === 0, '(u) …the retry finds nothing owed: cancelled, no post');
  R.close();
});

// ── §3 LAW 2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§3 law 2: the sender is told the truth');
await leg(23, async () => {
  const R = rig('w2');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); const r = await R.say(g, A, '@beta two');
  const reason = r.refused[0].reason;
  ok(gateOf(/^paced — sent in 25 s/.test(reason)) && !/next turn/.test(reason), '(a) the engine\'s answer', reason);
  const ans = AR.msgSendAnswer({ group: { id: g, name: 'lane', pair: false }, pairCreated: false, woke: [], refused: r.refused, later: [] }).refused;
  ok(ans[0].parked === true && ans[0].retryInMs === 25000 && ans[0].retryAt === T0 + 30100 && ans[0].reason === reason, '(a) …through the route\'s door', ans);
  const audit = R.store.auditTail({ limit: 50 }).filter((x) => x.kind === 'group-wake' && x.refused === 'rate-floor');
  ok(audit.length === 1 && verdictOf(/paced — sent in/.test(audit[0].reason)), '(a) …the audit row', audit);
  await R.at(30100);
  ok(verdictOf(/^You were @mentioned \(VibeSpace held this wake for the wake pace\)/m.test(R.posts[1].text)), '(b) the frame says VibeSpace held it for the pace', R.posts[1].text);
  const card = R.cards[R.cards.length - 1];
  ok(gateOf(card) && gateOf(card.group) && card.group.via === 'wake' && card.group.id === g && gateOf(/two/.test(card.text)) && !/held/.test(card.text), '(c) the receiver\'s card is the NORMAL peer card', card);
  R.close();
  const noDoor = { deliverToConversation: async () => ({ ok: true, lane: 'message' }) };
  const dir = path.join(ROOT, 'nodoor'); fs.mkdirSync(dir, { recursive: true });
  const store = createChannelStore({ dir: path.join(dir, 'channels') });
  let t = T0;
  const roster = Object.entries(NAMES).map(([cid, n]) => ({ cid, name: n, groups: ['tg1'], reachability: null }));
  const eng = GE0.create({ store, deliver: noDoor, broadcast: () => { }, now: () => t, paceClock: () => t, roster: () => roster, groupSetting: () => 'none', log: { info() { }, warn() { }, log() { } } });
  const made = await eng.create({ by: A, name: 'x', members: [B], quiet: true });
  await eng.post({ group: made.group.id, from: A, text: '@beta one', mayWake: eng.pacerFor(A) });
  t += 1000;
  const un = await eng.post({ group: made.group.id, from: A, text: '@beta two', mayWake: eng.pacerFor(A) });
  ok(!un.refused[0].parked && verdictOf(/next turn instead$/.test(un.refused[0].reason)), '(d) a wake nothing parked says what is true: the next turn', un.refused);
  store.close();
  const words = fs.readFileSync(path.join(REPO, 'src/lib/channel-words.js'), 'utf-8');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf-8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf-8');
  for (const key of ['{n} wake(s) held by the wake pace — sent when the window ends', 'Reply held by the wake pace — sent when the window ends', 'The agent is not woken yet — the wake pace sends it in {n} s (sooner if it starts a turn first)', 'they were held for the wake pace — delivered now'])
    ok(gateOf(zh.includes(JSON.stringify(key) + ':')) && verdictOf(ja.includes(JSON.stringify(key) + ':')), `(e) zh + ja say: ${key.slice(0, 50)}…`);
  ok(verdictOf(/t\('\{n\} wake\(s\) held by the wake pace/.test(words)), '(e) …the owner\'s echo reads it');
  const VIEW = await import(path.join(REPO, 'src/lib/channel-groups-view.js'));
  const wc = VIEW.wakeCount({ woke: [{}], refused: [{ parked: true }, { refused: 'spend' }], later: [] });
  ok(wc.woke === 1 && wc.refused === 1 && wc.paced === 1, '(e) …the count never calls a parked wake refused', wc);
});

// ── §4 LAW 3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§4 law 3: a hard bound with a WAKE at the end of it; the only refusal is the owner\'s; a stall is said');
const refusing = (R, retryInMs, on = () => { }) => R.deliver.registerWakePacer((sender) => Object.assign(() => { on(); return { reason: 'r', rule: 'the rule', retryInMs }; }, { refund() { }, force: (m) => R.eng.pacerFor(sender).force(m) }));
await leg(50, async () => { // the pace refuses every retry for an hour
  const R = rig('x');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  let asked = 0;
  refusing(R, 5 * 60_000, () => { asked++; });
  await R.at(5100 + 59 * 60_000);
  ok(R.posts.length === 1 && R.owed(B).length === 1, '(a) 59 min of refusals: still owed, nothing sent');
  const a0 = R.auths.length;
  await R.at(5100 + 60 * 60_000);
  ok(R.posts.length === 2 && gateOf(/two/.test(R.posts[1].text)) && R.owed(B).length === 0, 'THE BOUND (a): at the hour the WAKE FIRES, whatever the pace says — never a silent drop', R.posts.length);
  ok(R.auths.length === a0 + 1 && R.notes.length === 2, '(a) …one authorization, one charge', { auths: R.auths.length - a0, notes: R.notes.length });
  ok(asked >= 10 && asked <= 13, `(a) …the pace's own schedule until then (asked ${asked} times), never a tight loop`, asked);
  ok(verdictOf(R.logs.some((l) => /reached the hard bound/.test(l))), '(a) …the journal says why it went past the pace');
  ok(R.store.pace.live().pairs[A + '|' + B] === R.c.now, '(a) …the ledger still counts it (the slot is stamped)', R.store.pace.live().pairs);
  ok(!R.deliver.stashEntries(A).length, '(a) …nothing to tell the sender: its promise was kept');
  await R.at(5 * 3600_000);
  ok(R.posts.length === 2, '(a) …exactly once');
  R.close();
});
await leg(51, async () => { // the attempt bound
  const R = rig('y');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  let asked = 0;
  refusing(R, 1000, () => { asked++; });
  await R.at(5100 + 25000 + 28000);
  ok(R.posts.length === 1 && R.owed(B).length === 1, '(b) 29 refusals on the schedule: still owed', asked);
  await R.at(5100 + 25000 + 31000);
  ok(R.posts.length === 2 && R.owed(B).length === 0 && asked === 30, 'THE BOUND (b): the attempt ceiling ends in a WAKE too, exactly once', { posts: R.posts.length, asked });
  R.close();
});
const turnEndLeg = async (name, opts = {}) => {
  const R = rig(name, opts);
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  let asked = 0;
  refusing(R, 5 * 60_000, () => { asked++; });
  const session = R.sessions.get('w-beta');
  await R.at(31000);   // past the 30-s floor, so every turn end really reaches the pace (acceptance r1: inside the floor this leg asked nothing)
  const a0 = asked;
  for (let i = 0; i < 40; i++) { await R.deliver.noteTurnEnd(session); await R.settle(); }
  const e = R.owed(B)[0];
  const out = { asked: asked - a0, posts: R.posts.length, attempts: e ? e.attempts.length : null, owed: R.owed(B).length };
  R.close();
  return out;
};
await leg(52, async () => { // a turn end's early looks are no retry of the schedule
  const o = await turnEndLeg('y2');
  ok(o.asked === 40, '(c) 40 turn ends past the floor really ask the pace', o);
  ok(o.posts === 1 && o.owed === 1, '(c) …and force nothing: a turn end\'s early look is no retry of the schedule', o);
  ok(o.attempts <= 30, '(c) …the file stays bounded', o);
});
await leg(53, async () => { // the frame never lands
  const R = rig('y3');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  for (let i = 0; i < 60; i++) R.answers.push({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 });
  await R.at(5100 + 59 * 60_000);
  ok(R.posts.length === 1 && R.owed(B).length === 1, '(d) a CLI that does not accept: the wake stays owed through the hour');
  await R.at(5100 + 61 * 60_000);
  ok(R.posts.length === 1 && R.owed(B).length === 0, '(d) …its last attempt is AT the bound, then it falls');
  const notice = R.deliver.stashEntries(A).find((x) => /paced-out/.test(x.text));
  ok(gateOf(notice) && notice.kind === 'notification' && gateOf(notice.held) && notice.held.kind === 'not-reachable' && notice.held.why === 'paced-out', 'THE STALL IS SAID (d): the sender\'s conversation gets a notice on the not-reachable road, reason paced-out', notice);
  ok(gateOf(notice) && gateOf(/beta/.test(notice.text)) && gateOf(/lane/.test(notice.text)) && verdictOf(/next turn/.test(notice.text)), '(d) …naming whom, where, and what happens now', notice && notice.text);
  ok(verdictOf(R.logs.some((l) => /paced-out/.test(l) && /\[groups\]/.test(l))), '(d) …the hub journal has the line', R.logs.slice(-3));
  ok(verdictOf(R.store.auditTail({ limit: 50 }).some((x) => x.kind === 'group-wake' && x.refused === 'paced-out')), '(d) …and the audit');
  ok(R.notes.length === 1, '(d) …nothing billed for frames that never landed');
  ok(verdictOf(/two/.test((await R.turn(B)).text)), '(d) …the message rides the target\'s next report');
  const heading = AR.drainStashUnderCap(R.deliver, A, 0, () => { });
  ok(gateOf(/paced-out/.test(heading)) && !/unreachable/.test(heading), '(d) the sender\'s next turn reads it, free, under the held heading (never «unreachable»)', heading);
  R.close();
});
const spendLeg = async (name, DELIVER = DELIVER0) => {
  const dataDir = path.join(ROOT, 'guard-' + name); fs.mkdirSync(dataDir, { recursive: true });
  const todos = [];
  const guard = SPEND_GUARD.create({ dataDir, serverSetting: (k) => ({ 'spend.unattendedPerIdentityHour': 1 })[k], identityOf: () => ({ key: 'slot-1', name: 'Personal' }), getUserTodos: () => ({ add: (key, item) => todos.push(item) }), log: () => { } });
  const R = rig(name, { guard, DELIVER });
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  const refusalsOf = () => todos.filter((t) => t.origin === 'spend' && /Refusal: hour-cap/.test(String(t.detail)));
  const before = refusalsOf().length;
  await R.at(5100); await R.say(g, A, '@beta two');
  const asked0 = R.auths.length;
  await R.at(30100);
  const out = { posts: R.posts.length, owed: R.owed(B).length, before, refusals: refusalsOf().length, asked: R.auths.length - asked0, detail: (refusalsOf()[0] || {}).detail || null, notice: R.deliver.stashEntries(A).find((x) => /NOT sent/.test(x.text)) || null, report: (await R.turn(B)).text };
  R.close();
  return out;
};
await leg(54, async () => { // the ONE outright refusal: the spend gate, through the REAL guard, said to the owner
  const o = await spendLeg('sp');
  ok(o.before === 0, '(e) the first wake spends the hour\'s one slot: no refusal yet (its «Used: 1 of 1» notice is no refusal)', o);
  ok(o.asked === 1 && o.posts === 1 && o.owed === 0, 'THE ONE REFUSAL (e): the owed wake ASKED the guard, was refused, and left the park unsent', { asked: o.asked, posts: o.posts, owed: o.owed });
  ok(o.refusals === 1 && gateOf(/Reason: peer-message/.test(o.detail)) && verdictOf(/Refusal: hour-cap/.test(o.detail)), 'THE ONE REFUSAL (e): …SAID TO THE OWNER — the guard\'s For-you REFUSAL item', o.detail);
  ok(gateOf(o.notice) && verdictOf(/spend-cap/.test(o.notice.text)), '(e) …and to the sender, on its next turn', o.notice);
  ok(verdictOf(/two/.test(o.report)), '(e) …the message rides the next report');
});
await leg(55, async () => { // a pace that asks 1 ms
  const R = rig('z');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  let asked = 0;
  refusing(R, 1, () => { asked++; });
  await R.at(40100);
  ok(asked <= 11, `(f) a pace answering 1 ms re-schedules no faster than a second (asked ${asked} times in 10 s)`, asked);
  R.close();
});
await leg(56, async () => { // a pace that throws
  const R = rig('z2');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  R.deliver.registerWakePacer(() => { throw new Error('store blocked'); });
  await R.at(40100);
  ok(R.posts.length === 1 && R.owed(B).length === 1 && verdictOf(R.logs.some((l) => /wake pace threw/.test(l))), '(g) a pace that THROWS holds the wake, said; it asks again', R.owed(B));
  await R.at(5100 + 61 * 60_000);
  ok(R.posts.length === 2 && R.owed(B).length === 0, '(g) …and even then the bound wakes it', R.posts.length);
  R.close();
});
await leg(57, async () => { // shutting down
  const R = rig('z3');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  R.deliver.closeRetries();
  await R.at(5100);
  const r = await R.say(g, A, '@beta two');
  ok(r.refused[0].parked === true && verdictOf(/"why":"paced"/.test(fs.readFileSync(path.join(R.dataDir, 'msg-retry.json'), 'utf-8'))), '(h) a wake paced while the hub shuts down is on disk: the next boot owes it', r.refused);
  R.close();
});

// ── §5 LAW 4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§5 law 4: nothing else moves');
await leg(28, async () => {
  const R = rig('l4');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  ok(R.deliver.retryEntries(B).length === 0, '(a) an owed wake is listed to NO drain and NO hand-over (it holds no words; the group strip counts its message once)');
  ok(AR.drainStashUnderCap(R.deliver, B, 0, () => { }) === '' && R.owed(B).length === 1, '(a) …a prompt\'s stash drain neither carries nor takes it');
  // a transient miss beside it keeps its own road
  R.answers.push({ ok: false, reason: 'timeout', phase: 'connect', transient: true });
  await R.at(31000);
  R.answers.length = 0;
  await R.at(100000);
  ok(R.posts.filter((p) => /two/.test(p.text)).length === 1, '(b) a transient miss on the frame retries by the same backoff, once');
  R.close();
  const T = rig('l4t');
  T.answers.push({ ok: false, reason: 'timeout', phase: 'connect', transient: true });
  await T.at(100);
  const r = await T.deliver.deliverToConversation(B, 'a job finished', { kind: 'notification', fromName: 'Background Work · x', spendReason: 'job-notification', retry: { producer: 'jobs', meta: {} } });
  ok(r.parked === true && r.retryAt === T0 + 30100, '(c) a transient first miss parks exactly as before (first step 30 s)', r);
  ok(T.deliver.retryEntries(B).length === 1 && T.deliver.retryEntries(B)[0].held.kind === 'retrying', '(c) …listed to the drains as before');
  await T.at(30100);
  ok(T.posts.length === 1 && T.notes.length === 1 && T.auths.length === 1, '(c) …lands on its retry, ONE authorization, no pace asked');
  T.close();
  // an owed wake rides a transient's frame: no pace, no second turn
  const Mx = rig('l4m');
  const g2 = await Mx.group('lane', A, [B]);
  await Mx.at(100); await Mx.say(g2, A, '@beta one');
  Mx.answers.push({ ok: false, reason: 'timeout', phase: 'connect', transient: true });
  await Mx.at(200);
  await Mx.deliver.deliverToConversation(B, 'a job finished', { kind: 'notification', fromName: 'Background Work · x', spendReason: 'job-notification', retry: { producer: 'jobs', meta: {} } });
  await Mx.at(300); await Mx.say(g2, A, '@beta two');
  const before = Mx.posts.length;
  await Mx.at(40000);
  ok(Mx.posts.length === before + 1 && gateOf(/a job finished/.test(Mx.posts[before].text)) && verdictOf(/two/.test(Mx.posts[before].text)), '(d) a parked transient and an owed wake share ONE frame', Mx.posts.slice(before));
  Mx.close();
  // the census: every caller of the pace
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : x.name.endsWith('.js') ? [path.join(d, x.name)] : []));
  const asks = {}, pacers = {};
  for (const f of [...walk(path.join(REPO, 'src')), path.join(REPO, 'server.js')]) {
    const rel = path.relative(REPO, f);
    if (rel.startsWith('src/lib/') || rel === 'src/channel-filter.js') continue;   // the client; channel-filter's own `mayWake` is a grant-admission helper, not the pace
    const code = fs.readFileSync(f, 'utf-8').split('\n').filter((l) => !/^\s*(\/?\*|\/\/)/.test(l)).join('\n');
    const n = (code.match(/\bmayWake\(/g) || []).length;
    const m = (code.match(/\bpacerFor\(/g) || []).length;
    if (n) asks[rel] = n;
    if (m) pacers[rel] = m;
  }
  ok(JSON.stringify(asks) === JSON.stringify({ 'src/server/channels-outbound.js': 2, 'src/server/groups-engine.js': 2, 'src/server/worker-dispatch.js': 2 }), '(e) THE CENSUS — the pace is asked at: wakeAll + awaitWakes (groups: parked), dispatch (parked via wakeAll), receiptPaceFor (parked, stash-wake) + wakeGate (a send it REFUSES: nothing moved, nothing owed, «send again»). A new asker is red', asks);
  ok(JSON.stringify(pacers) === JSON.stringify({ 'src/agent-routes.js': 1, 'src/routes/channels.js': 2, 'src/server/groups-engine.js': 2 }), '(e) …the pacer\'s makers: the agent routes, the owner\'s routes (sign-in off), the engine itself', pacers);
  const jobs = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf-8'), chan = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
  ok(!/pacerFor|parkOwedWake/.test(jobs) && verdictOf(/this\._stashNotif\(cid, job, ev, 'rate floor — queued for injection instead'/.test(jobs)), '(f) the jobs engine\'s 30-s floor is its own and unchanged (law 4)');
  ok(!/pacerFor|parkOwedWake/.test(chan) && verdictOf(/F\.paceVerdict\(paceWakes, t, F\.digestCap\(w\)\)/.test(chan)), '(f) a channel digest\'s wake answers to its daily cap (held on its own index), not to this pace');
  const SA = require(path.join(REPO, 'src/spend-authorizer.js'));
  ok(gateOf(SA.SPEND_REASONS['peer-message']) && verdictOf(SA.SPEND_REASONS['channel-receipt']), '(g) the retry bills under the reasons the authorizer already knows');
  ok(G.WAKE_FLOOR_MS === 30000 && G.SENDER_WAKES === 8, '(g) the pace rules: 30 s, 8 a minute');
});

// ── §6 CONTROLS ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§6 controls: a patched copy per rule is red');
await leg(29, async () => {
  const Ms = mutantCopies('pwr', REPO);
  const gePath = 'src/server/groups-engine.js', cdPath = 'src/server/conversation-deliver.js';
  const geSrc = fs.readFileSync(path.join(REPO, gePath), 'utf-8'), cdSrc = fs.readFileSync(path.join(REPO, cdPath), 'utf-8');
  const swap = (src, a, b) => { if (!src.includes(a)) throw new Error('control anchor moved: ' + a.slice(0, 60)); return editAnchor(src, a, b, "the text handed to swap()"); };
  const noVerdict = (src) => swap(swap(src, 'if (!stands.length) return {', 'if (false) return {'), 'nowWhy = stands[stands.length - 1].why;', 'nowWhy = (stands[stands.length - 1] || { why }).why;');   // the frame asks no verdict
  { // no park at all = 8b3fdb6ab's stash
    const GEm = Ms.load(gePath, swap(geSrc, "if (!pace || !(Number(pace.retryInMs) > 0) || !deliver || typeof deliver.parkOwedWake !== 'function') return null;", 'return null;'), 'no-park');
    const R = rig('c1', { GE: GEm });
    const g = await R.group('lane', A, [B]);
    await R.at(100); await R.say(g, A, '@beta one');
    await R.at(5100); await R.say(g, A, '@beta two');
    await R.at(600000);
    ok(R.posts.length === 1, '(i) CONTROL: without the park the idle target is NEVER woken — the owner\'s stall', R.posts.length);
    R.close();
  }
  { // a turn's report does not cancel
    const GEm = Ms.load(gePath, noVerdict(swap(swap(geSrc, '    settleOwed(gid, member);   // lane paced-wake-retry', '    // settleOwed(gid, member);'), "if (Number(m.reportedUpTo) >= Number(at)) return owedPastMarker(g, m, e);", '').replace('const j = sendersRide(g, m, e, Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : m.joinedAt - 1);', 'const j = { unread: [], handed: [1] };')), 'no-cancel');
    const R = rig('c2', { GE: GEm });
    const g = await R.group('lane', A, [B, C]);
    await R.at(100); await R.say(g, A, '@beta one');
    await R.at(5100); await R.say(g, A, '@beta two');
    await R.at(5500); await R.turn(B);
    await R.at(5600); await R.say(g, C, 'a later plain line');
    await R.at(200000);
    ok(R.posts.length === 2, '(ii) CONTROL: with no cancel a turned target is woken AGAIN — a second billed turn', R.posts.length);
    R.close();
  }
  { // the pace is not re-asked
    const CDm = Ms.load(cdPath, swap(cdSrc, 'if (all.every(isOwed)) {\n        const force = all.some(owedOverdue);', 'if (false) {\n        const force = all.some(owedOverdue);'), 'no-reask');
    const R = rig('c3', { DELIVER: CDm });
    const members = [B, C, D, E, F, H, I, J];
    const g = await R.group('wide', A, members);
    await R.at(100); await R.say(g, A, '@beta one');
    await R.at(5100); await R.say(g, A, '@beta owed');
    const others = members.slice(1).map((m) => NAMES[m]);
    for (let i = 0; i < 7; i++) { await R.at(10000 + i * 100); await R.say(g, A, `@${others[i]} go`); }
    await R.at(30100);
    ok(R.posts.length === 9, '(iii) CONTROL: with no pace at the retry the sender\'s minute is broken (a ninth wake inside it)', R.posts.length);
    R.close();
  }
  { // no merge
    const CDm = Ms.load(cdPath, swap(cdSrc, 'const same = (retry[cid] || []).find((x) => isOwed(x) && x.producer === producer && x.key === key && !x.inflight && !x.ho && !x.maybeDelivered);', 'const same = null;'), 'no-merge');
    const R = rig('c4', { DELIVER: CDm });
    const g = await R.group('lane', A, [B]);
    await R.at(100); await R.say(g, A, '@beta one');
    await R.at(2100); await R.say(g, A, '@beta two');
    await R.at(3100); await R.say(g, A, '@beta three');
    ok(R.owed(B).length === 2, '(iv) CONTROL: with no merge two paced wakes are two entries', R.owed(B).length);
    R.close();
  }
  { // the words stay on the entry
    const GEm = Ms.load(gePath, swap(geSrc, "text: `A wake VibeSpace held for the pace — vibespace-msg read ${gid}`,", "text: rec.text,"), 'words-on-entry');
    const R = rig('c5', { GE: GEm });
    const g = await R.group('lane', A, [B]);
    await R.at(100); await R.say(g, A, '@beta one');
    await R.at(5100); await R.say(g, A, '@beta the secret words');
    ok(verdictOf(/secret words/.test(fs.readFileSync(path.join(R.dataDir, 'msg-retry.json'), 'utf-8'))), '(v) CONTROL: the disk pin bites when an entry keeps the words');
    R.close();
  }
  { // listed to the drains
    const CDm = Ms.load(cdPath, swap(cdSrc, '!e.inflight && !e.maybeDelivered && !isOwed(e)).map(', '!e.inflight && !e.maybeDelivered).map('), 'listed');
    const R = rig('c6', { DELIVER: CDm });
    const g = await R.group('lane', A, [B]);
    await R.at(100); await R.say(g, A, '@beta one');
    await R.at(5100); await R.say(g, A, '@beta two');
    ok(R.deliver.retryEntries(B).length === 1, '(vi) CONTROL: listed to the drains it would ride a prompt as its pointer sentence, the report beside it');
    R.close();
  }
  { // the bound drops instead of waking
    const CDm = Ms.load(cdPath, swap(cdSrc, 'const force = all.some(owedOverdue);', 'const force = false;'), 'no-bound-wake');
    const R = rig('c8', { DELIVER: CDm });
    const g = await R.group('lane', A, [B]);
    await R.at(100); await R.say(g, A, '@beta one');
    await R.at(5100); await R.say(g, A, '@beta two');
    refusing(R, 5 * 60_000);
    await R.at(3 * 3600_000);
    ok(R.posts.length === 1, '(viii) CONTROL: with no wake at the bound a pace that keeps refusing starves the wake for ever', R.posts.length);
    R.close();
  }
  { // a turn end counts toward the 30
    const CDm = Ms.load(cdPath, swap(cdSrc, "if (why === 'timer') e.paceRefusals = ", 'e.paceRefusals = '), 'turn-end-counts');
    const o = await turnEndLeg('c9', { DELIVER: CDm });
    ok(o.posts === 2, '(ix) CONTROL: with a turn end counted toward the 30 a busy target forces the wake past the pace', o);
  }
  { // the owed wake dropped without asking the guard
    const CDm = Ms.load(cdPath, swap(cdSrc, "if (authorizeSpend && !charged) {\n      const session = localSessionFor(cid);\n      const prev = shown.find(", "if (all.some(isOwed)) { for (const e of shown) fellRetry(e, 'spend-cap', 'spend budget: dropped'); return; }\n    if (authorizeSpend && !charged) {\n      const session = localSessionFor(cid);\n      const prev = shown.find("), 'no-guard-ask');
    const o = await spendLeg('c10', CDm);
    ok(o.refusals === 0 && o.asked === 0, '(x) CONTROL: an owed wake dropped without asking the guard files no refusal: the owner-facing pin is red there', o);
  }
  { // a report cut to a line in a shared frame
    const CDm = Ms.load(cdPath, swap(cdSrc, '...(isOwed(e) ? { whole: true } : {}), _retry: e', '_retry: e'), 'line-cut');
    const R = rig('c11', { DELIVER: CDm });
    const out = await twoLongReports(R);
    ok(!out.finals, '(xi) CONTROL: rendered as a stash line the reports lose their final instructions', out);
    R.close();
  }
  { // the receipt not claimed
    const CDm = Ms.load(cdPath, swap(cdSrc, 'const release = claimStash(cid, [ent], `owed:${e.id}`);', 'const release = () => { };'), 'no-claim');
    const o = await receiptMidPost('c12', CDm);
    ok(o.drained === 1 && o.cards === 2, '(xii) CONTROL: unclaimed, the turn the frame opens drains the same receipt: twice, two cards', o);
  }
  { // the rest stays marked through the post
    const CDm = Ms.load(cdPath, swap(cdSrc, "for (const e of frame.rest) { const w = words.get(e); if (w) { words.delete(e); try { if (typeof w.release === 'function') w.release(); } catch { } } }", '/* the marks kept */'), 'rest-locked');
    const o = await restRidesTheTurn('c13', CDm);
    ok(o.posts === 3 && o.auths === 3 && !o.carried, '(xiii) CONTROL: with the rest marked through the post the woken turn carries nothing: a second billed wake', o);
  }
  { // the verdict not asked at the frame
    const GEm = Ms.load(gePath, noVerdict(geSrc), 'no-verdict');
    const R = rig('c14', { GE: GEm });
    const g = await R.group('lane', A, [B]);
    await R.eng.setNotify({ by: B, group: g, notify: 'always' });
    await R.at(100); await R.say(g, A, 'plain one');
    await R.at(5100); await R.say(g, A, 'plain two');
    await R.eng.setNotify({ by: B, group: g, notify: 'next-turn' });
    await R.at(100000);
    ok(R.posts.length === 2, '(xiv) CONTROL: with no verdict at the frame a next-turn member is woken and billed', R.posts.length);
    R.close();
  }
  { // the twins not folded
    const CDm = Ms.load(cdPath, swap(cdSrc, '    foldOwedTwins(cid);\n    let all = ', '    let all = ').replace('    foldOwedTwins(cid);\n    if (keep.length) rescheduleMany(keep.filter', '    if (keep.length) rescheduleMany(keep.filter'), 'no-fold');
    const o = await twinLeg('c15', CDm);
    ok(o.owed === 2 && o.two === 2 && o.three === 2, '(xv) CONTROL: unfolded, a missed post leaves two entries and the next frame carries the report twice', o);
  }
  { // the hour rebased only when it had ended
    ok(gateOf(cdSrc.includes('const boundStart = (e) => Math.max(Number(e.firstAt || 0), parkBootAt, Number(e.boundFrom || 0));')) && verdictOf(cdSrc.includes('const owedEnd = (e) => boundStart(e) + RETRY_MAX_MS;')), '(xvi) the boot\'s rebase is whole (and a held park file\'s lift rebases what it adopts — line 494\'s follow): no cliff by construction');
  }
  { // the fall is silent
    const GEm = Ms.load(gePath, swap(geSrc, '      notice: {\n', '      silent: {\n'), 'silent-fall');
    const R = rig('c7', { GE: GEm });
    const g = await R.group('lane', A, [B]);
    await R.at(100); await R.say(g, A, '@beta one');
    await R.at(5100); await R.say(g, A, '@beta two');
    for (let i = 0; i < 60; i++) R.answers.push({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 });
    await R.at(62 * 60_000);
    ok(R.owed(B).length === 0 && !R.deliver.stashEntries(A).some((x) => /paced-out/.test(x.text)), '(vii) CONTROL: without the notice the sender never hears', R.deliver.stashEntries(A));
    R.close();
  }
});

// ── §7 ROUND 2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§7 round 2: the acceptance\'s defects');
await leg(70, async () => { // D1: two long reports in one frame
  const R = rig('d1');
  const out = await twoLongReports(R);
  ok(out.frames === 2, 'D1: two owed reports share ONE frame', out);
  ok(verdictOf(out.finals), 'THE LAW D1: both reports arrive WHOLE: FINAL-INSTRUCTION-TWO and -THREE are in the posted frame', out);
  ok(out.size > 2000 && !/\(… clipped\)/.test(out.frame), 'D1: …the frame reads like the owed reports, no cut line', out.size);
  ok(out.owed === 0 && !out.report, 'D1: …nothing left owed, and the next report has nothing it lost', { owed: out.owed, report: out.report });
  ok(verdictOf(/held for the wake pace/.test(out.frame)), 'D1: …under the pace heading');
  R.close();
});
await leg(71, async () => { // D1: an owed report beside a parked jobs notice
  const R = rig('d1b');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  R.answers.push({ ok: false, reason: 'timeout', phase: 'connect', transient: true });
  await R.at(200);
  await R.deliver.deliverToConversation(B, 'a job finished', { kind: 'notification', fromName: 'Background Work · x', spendReason: 'job-notification', retry: { producer: 'jobs', meta: {} } });
  await R.at(300); await R.say(g, A, longInstruction('BESIDE'));
  const before = R.posts.length;
  await R.at(40000);
  const frame = R.posts[before] ? R.posts[before].text : '';
  ok(R.posts.length === before + 1 && gateOf(/a job finished/.test(frame)) && verdictOf(/FINAL-INSTRUCTION-BESIDE/.test(frame)), 'THE LAW D1: an owed report beside a parked jobs notice arrives WHOLE in the one frame', frame.slice(0, 200));
  ok(R.owed(B).length === 0 && !(await R.turn(B)).text, 'D1: …nothing owed, nothing lost');
  R.close();
});
await leg(72, async () => { // D1: more than the frame's bytes hold
  const R = rig('d1c');
  const names = ['one', 'two', 'three', 'four', 'five'];
  const gs = [];
  for (const n of names) gs.push(await R.group(n, A, [B]));
  await R.at(100); await R.say(gs[0], A, '@beta first');
  // five groups' reports of about 4 KiB each: the frame's 12 KiB holds the oldest few, what it leaves stays owed
  let at = 1000;
  for (let i = 1; i < 5; i++) for (let k = 0; k < 5; k++) { at += 100; await R.at(at); await R.say(gs[i], A, `@beta ${'a long line of the instruction. '.repeat(24)} GROUP-${i}-LINE-${k}`); }
  ok(R.owed(B).length === 4, 'D1: four owed reports', R.owed(B).length);
  await R.at(40000);
  const first = R.posts[1] ? R.posts[1].text : '';
  const inFirst = [1, 2, 3, 4].filter((i) => first.includes(`GROUP-${i}-LINE-4`));
  ok(inFirst.length >= 1 && inFirst.length < 4 && R.owed(B).length === 4 - inFirst.length, 'D1: the frame carries what fits, the rest stays OWED (its marker unmoved)', { inFirst, owed: R.owed(B).length, bytes: first.length });
  ok(verdictOf(/follow in the next message/.test(first)), 'D1: …and the cut says so', first.slice(-160));
  await R.at(40 * 60_000);
  const all = R.posts.map((p) => p.text).join('\n');
  ok(gateOf([1, 2, 3, 4].every((i) => all.includes(`GROUP-${i}-LINE-4`))) && R.owed(B).length === 0, 'THE LAW D1: every report reaches it in the end, none cut, none lost', R.posts.length);
  R.close();
});
await leg(73, async () => { // D2: the receipt rides one road
  const o = await receiptMidPost('d2');
  ok(o.frames === 1 && verdictOf(/receipt words/.test(o.frame)), 'D2: the wake carries the receipt', o);
  ok(o.drained === 0, 'THE LAW D2: the turn that frame opens drains NOTHING mid-post: the frame claimed it', o);
  ok(o.cards === 1 && o.words === 1, 'THE LAW D2: the words once, one card', o);
  ok(o.left === 0, 'D2: …and the stash is empty after the landing', o);
  // a post that fails gives the claim back
  let R = null;
  const seen = [];
  R = rig('d2b', { post: async () => { seen.push(R.deliver.stashEntries(B).filter((x) => !x.ho).length); return { ok: false, reason: 'timeout', phase: 'connect', transient: true }; } });
  await R.at(100);
  R.deliver.stashFor(B, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt words', ref: 'p-1', held: { kind: 'notice', why: 'paced' } });
  R.deliver.parkOwedWake(B, { producer: 'stash-wake', key: 'p-1', retryInMs: 25000, spendReason: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', sender: G.OWNER, reason: 'paced', meta: { ref: 'p-1' } });
  await R.at(25100);
  ok(seen[0] === 0, 'D2: claimed while the post is out', seen);
  ok(R.deliver.stashEntries(B).filter((x) => !x.ho).length === 1 && R.owed(B).length === 1, 'D2: a post that did not land gives it back: visible again, the wake still owed');
  ok(verdictOf(/receipt words/.test(AR.drainStashUnderCap(R.deliver, B, 0, () => { }))), 'D2: …a prompt can carry it');
  await R.at(200000);
  ok(R.owed(B).length === 0, 'D2: …then the retry finds nothing owed');
  R.close();
});
await leg(74, async () => { // D4: a producer that throws
  const R = rig('d4');
  await R.at(100);
  let renders = 0;
  R.deliver.registerOwedWake('boom', { render() { renders++; throw new Error('boom'); } });
  R.deliver.parkOwedWake(B, { producer: 'boom', key: 'k', retryInMs: 25000, spendReason: 'peer-message', kind: 'peer', sender: A, reason: 'paced', meta: {} });
  await R.at(59 * 60_000);
  ok(R.owed(B).length === 1 && renders <= 14, `D4: a render that throws waits on the backoff (${renders} renders in 59 min), not every 30 s`, renders);
  await R.at(100 + 61 * 60_000);
  ok(R.owed(B).length === 0, 'THE LAW D4: it falls within the bound');
  const notice = R.deliver.stashEntries(A).find((x) => /NOT sent/.test(x.text));
  ok(gateOf(notice) && gateOf(/paced-out/.test(notice.text)) && verdictOf(/boom/.test(notice.text)), 'THE LAW D4: the sender is told', notice);
  ok(verdictOf(R.logs.some((l) => /falls to the stash/.test(l) && /paced-out/.test(l))), 'D4: …and the journal');
  await R.at(6 * 3600_000);
  ok(renders <= 15, 'D4: …and it stops', renders);
  R.close();
});
await leg(75, async () => { // D4: the real groups producer, its log unreadable
  const R = rig('d4b');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  const real = R.store.readTail;
  R.store.readTail = () => { throw new Error('a torn log'); };
  await R.at(5100 + 61 * 60_000);
  R.store.readTail = real;
  ok(R.posts.length === 1 && R.owed(B).length === 0, 'D4: the groups producer\'s log unreadable for the hour: it falls');
  const notice = R.deliver.stashEntries(A).find((x) => /NOT sent/.test(x.text));
  ok(gateOf(notice) && gateOf(/beta/.test(notice.text)) && verdictOf(/paced-out/.test(notice.text)), 'D4: …said by the producer, in its own words', notice);
  ok(verdictOf(/two/.test((await R.turn(B)).text)), 'D4: …the marker never moved: the next report carries it');
  R.close();
});
await leg(76, async () => { // D4: a producer that never comes up
  const c = { now: T0, timers: [] };
  const R1 = rig('d4c', { shared: c });
  await R1.at(100);
  R1.deliver.registerOwedWake('gone-soon', { render: () => null });
  R1.deliver.parkOwedWake(B, { producer: 'gone-soon', key: 'k', retryInMs: 25000, spendReason: 'peer-message', kind: 'peer', sender: A, reason: 'paced', meta: {} });
  R1.close();
  c.timers.length = 0;
  const R2 = rig('d4c2', { shared: c, dir: R1.dataDir });
  await R2.advanceTo(T0 + 3000000);
  ok(R2.owed(B).length === 1, 'D4: a producer not registered yet is not judged in the boot\'s window', R2.owed(B).length);
  await R2.advanceTo(T0 + 3 * 3600_000);
  ok(R2.owed(B).length === 0 && verdictOf(R2.deliver.stashEntries(A).some((x) => /NOT sent/.test(x.text) && /never came up/.test(x.text))), 'THE LAW D4: a producer that never comes up in a whole hour falls, said', R2.deliver.stashEntries(A));
  R2.close();
});
await leg(77, async () => { // D8: the await line names the cause
  const rec = { raw: { await: { until: T0 + 1 } } };
  for (const c of G.AWAIT_FELL) {
    const st = G.awaitState(rec, { heldAt: T0, held: c }, T0);
    ok(st.state === 'held' && st.fell === c && !st.paced, `D8: a fall (${c}) reads as its own cause`, st);
  }
  ok(!G.awaitState(rec, { heldAt: T0, held: 'spend' }, T0).fell && !G.awaitState(rec, { heldAt: T0, held: 'rate-floor' }, T0).fell, 'D8: a real wake-cap refusal keeps its own words');
  const { pathToFileURL } = await import('node:url');
  const Wd = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-words.js')).href);
  const t = (k) => k;
  const words = (held) => Wd.awaitLineText(G.awaitState(rec, { heldAt: T0, held }, T0), { t });
  ok(gateOf(G.AWAIT_FELL.every((c) => !/wake cap/.test(words(c)))) && new Set(G.AWAIT_FELL.map(words)).size === G.AWAIT_FELL.length, 'THE LAW D8: each fall cause has its own words in the window, none says «wake cap»', G.AWAIT_FELL.map(words));
  ok(verdictOf(/wake cap/.test(words('spend'))), 'D8: …the cap still says cap');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf-8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf-8');
  ok(verdictOf(G.AWAIT_FELL.every((c) => zh.includes(JSON.stringify(words(c)) + ':') && ja.includes(JSON.stringify(words(c)) + ':'))), 'D8: …zh + ja');
  // the engine leaves the cause on the record
  const R = rig('d8');
  const g = await R.group('pair', A, [B]);
  await R.at(100); await R.say(g, B, '@alpha hello');
  await R.at(1100); const q = await R.say(g, A, 'a question?', { awaitReply: true });
  await R.at(2100); await R.say(g, B, 'the answer');
  for (let i = 0; i < 60; i++) R.answers.push({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 });
  await R.at(62 * 60_000 + 2100);
  const entry = R.eng.get(g).awaits[q.message.vendorId];
  ok(G.awaitState({ raw: q.message.raw }, entry, R.c.now).fell === 'paced-out', 'THE LAW D8: the asker\'s record reads the cause after its wake falls', entry);
  R.close();
});
await leg(78, async () => { // D3 + the receipt words
  const kb = fs.readFileSync(path.join(REPO, 'docs/kb-file-structure.md'), 'utf-8');
  const head = kb.slice(0, kb.indexOf('\n## ', kb.indexOf('## INDEX') + 10));
  const line = head.split('\n').find((l) => l.startsWith('scripts/test-paced-wake-retry.mjs'));
  ok(gateOf(line) && line.length <= 300, 'D3: the INDEX names this suite, ≤ 300 chars', line);
  const essay = kb.slice(kb.indexOf('### The wake owed'));
  ok(verdictOf(/test-paced-wake-retry/.test(essay.slice(0, essay.indexOf('\n### ', 10)))), 'D3: the essay names its gate');
});

// ── §8 ROUND 3 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§8 round 3: the second acceptance\'s findings');
await leg(80, async () => { // P1: the rest of a frame is free for the turn it opens (the hook lands inside the post's grace)
  const o = await restRidesTheTurn('p1');
  ok(o.frameShown >= 1 && o.frameShown < 4, 'P1: the frame carries what fits', o);
  ok(verdictOf(o.carried), 'THE LAW P1: the turn that frame opens CARRIES the rest: nothing it does not carry stays marked', o);
  ok(o.owed === 0, 'THE LAW P1: …the rest\'s retry is cancelled', o);
  ok(o.posts === 2 && o.auths === 2, 'THE LAW P1: 2 posts, 2 authorizations — no second billed wake', o);
});
await leg(81, async () => { // P1: a receipt beyond the frame's bound, the same
  let R = null, drained = '';
  R = rig('p1b', { post: async (peer, text) => { R.posts.push({ cid: peer.name, text }); drained += AR.drainStashUnderCap(R.deliver, B, 0, () => { }); return { ok: true, phase: 'written' }; } });
  const gs = [await R.group('one', A, [B]), await R.group('two', A, [B]), await R.group('three', A, [B]), await R.group('four', A, [B]), await R.group('five', A, [B])];
  await R.at(100); await R.say(gs[0], A, '@beta first');
  let at = 1000;
  for (let i = 1; i < 5; i++) for (let k = 0; k < 5; k++) { at += 100; await R.at(at); await R.say(gs[i], A, `@beta ${'a long line of the instruction. '.repeat(24)} GROUP-${i}-LINE-${k}`); }
  R.deliver.stashFor(B, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt beyond the bound', ref: 'p-9', held: { kind: 'notice', why: 'paced' } });
  R.deliver.parkOwedWake(B, { producer: 'stash-wake', key: 'p-9', retryInMs: 25000, spendReason: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', sender: A, reason: 'paced', meta: { ref: 'p-9' } });
  await R.at(40000);
  ok(verdictOf(/receipt beyond the bound/.test(drained)), 'THE LAW P1: a receipt beyond the frame\'s bound is unclaimed: the turn\'s drain carries it', { drained: drained.slice(0, 80), posts: R.posts.length });
  ok(R.deliver.stashEntries(B).length === 0, 'P1: …it left the stash');
  await R.at(40 * 60_000);
  ok(R.owed(B).length === 0 && !R.posts.some((x) => /receipt beyond the bound/.test(x.text)), 'P1: …once: its retry finds nothing owed, no frame ever carries it');
  R.close();
});
await leg(82, async () => { // P2
  const o = await backlogAfterDowntime('p2');
  ok(o.parked === 11, 'P2: 8 woken, 11 parked before the downtime', o);
  ok(o.firstMinute <= 8, 'THE LAW P2: after a two-hour downtime at most 8 go in the first minute: paced out FROM THE BOOT, never dumped', o);
  ok(o.stamps <= 8, 'THE LAW P2: …the ledger holds at most 8 of the sender\'s stamps in that minute', o);
  ok(verdictOf(o.said), 'P2: …said in the journal', o);
  ok(o.finally === 11 && o.owed === 0, 'THE LAW P2: …and every one of them goes in the minutes after', o);
});
await leg(83, async () => { // P3
  const R = rig('p3');
  const g = await R.group('lane', A, [B]);
  await R.eng.setNotify({ by: B, group: g, notify: 'always' });
  await R.at(100); const r1 = await R.say(g, A, 'plain one');
  ok(r1.woke.length === 1, 'P3: an always member is woken by a plain post');
  await R.at(5100); const r2 = await R.say(g, A, 'plain two');
  ok(gateOf(r2.refused[0]) && verdictOf(r2.refused[0].parked), 'P3: the next inside the window is parked');
  await R.eng.setNotify({ by: B, group: g, notify: 'next-turn' });
  await R.at(100000);
  ok(R.posts.length === 1, 'THE LAW P3: the member switched to next-turn: its CURRENT mode decides, no wake, nothing billed', R.posts.map((x) => x.text.slice(0, 120)));
  ok(R.owed(B).length === 0 && verdictOf(R.store.auditTail({ limit: 50 }).some((x) => x.kind === 'group-wake' && x.refused === 'mode-changed')), 'P3: …the entry left, the audit says why');
  const notice = R.deliver.stashEntries(A).find((x) => /NOT sent/.test(x.text));
  ok(gateOf(notice) && notice.kind === 'notification' && gateOf(notice.held) && notice.held.kind === 'not-reachable' && notice.held.why === 'paced-mode-changed', 'THE LAW P3: the sender holding «sent in N s» gets a FREE notice on its next turn: the promise became false, it is said', notice);
  ok(gateOf(notice) && gateOf(/mode-changed/.test(notice.text)) && gateOf(/notify mode is next-turn now/.test(notice.text)) && gateOf(/beta/.test(notice.text)) && verdictOf(/next turn/.test(notice.text)), 'P3: …it names whom, why (the mode no longer asks for a wake), and that the message rides its next turn', notice && notice.text);
  ok(R.notes.length === 1 && R.posts.length === 1, 'P3: …never billed: the sender was not woken for it', { notes: R.notes.length, posts: R.posts.length });
  ok(verdictOf(R.logs.some((l) => /\[groups\]/.test(l) && /mode-changed/.test(l))), 'P3: …the journal says it');
  ok(R.deliver.stashEntries(B).length === 0, 'P3: …no stashed copy for the member: the group log is the store');
  ok(verdictOf(/plain two/.test((await R.turn(B)).text)), 'P3: …the message rides its next turn');
  const heading = AR.drainStashUnderCap(R.deliver, A, 0, () => { });
  ok(gateOf(/mode-changed/.test(heading)) && !/unreachable/.test(heading), 'P3: …the sender reads it under the held heading, never «unreachable»', heading.slice(0, 160));
  R.close();
});
await leg(87, async () => { // P3: muted, or gone from the group: the same promise, the same notice
  const R = rig('p3d');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  await R.eng.setNotify({ by: B, group: g, notify: 'mute' });
  await R.at(100000);
  ok(R.posts.length === 1 && R.owed(B).length === 0, 'P3: the member muted the group: no wake');
  ok(verdictOf(R.deliver.stashEntries(A).some((x) => /NOT sent \(mode-changed\)/.test(x.text) && /notify mode is mute now/.test(x.text) && /will not reach them/.test(x.text) && !/next turn/.test(x.text))), 'THE LAW P3: …and the sender is told, truly: a muted member reads nothing next turn', R.deliver.stashEntries(A));
  R.close();
  const Mn = rig('p3m');
  const gm = await Mn.group('lane', A, [B]);
  await Mn.eng.setNotify({ by: B, group: gm, notify: 'always' });
  await Mn.at(100); await Mn.say(gm, A, 'plain one');
  await Mn.at(5100); await Mn.say(gm, A, 'plain two');
  await Mn.eng.setNotify({ by: B, group: gm, notify: 'mention' });
  await Mn.at(100000);
  ok(Mn.posts.length === 1 && verdictOf(Mn.deliver.stashEntries(A).some((x) => /notify mode is mention now/.test(x.text) && /will not reach them/.test(x.text))), 'P3: a member who switched to mention is handed only what @names it: said as that', Mn.deliver.stashEntries(A));
  Mn.close();
  const K2 = rig('p3e');
  const g2 = await K2.group('lane', A, [B, C]);
  await K2.at(100); await K2.say(g2, A, '@beta one');
  await K2.at(5100); await K2.say(g2, A, '@beta two');
  const left = await K2.eng.leave({ by: B, group: g2 });
  ok(gateOf(left) && verdictOf(left.ok), 'P3: the member leaves the group while the wake waits', left);
  await K2.at(100000);
  ok(K2.posts.length === 1 && K2.owed(B).length === 0, 'P3: …no wake');
  ok(verdictOf(K2.deliver.stashEntries(A).some((x) => /NOT sent \(left\)/.test(x.text) && /no longer in that group/.test(x.text) && /will not reach them/.test(x.text))), 'THE LAW P3: …and the sender is told', K2.deliver.stashEntries(A));
  K2.close();
});
await leg(84, async () => { // P3: an @ stands whatever the mode, and the lead tells the truth
  const R = rig('p3b');
  const g = await R.group('lane', A, [B]);
  await R.eng.setNotify({ by: B, group: g, notify: 'always' });
  await R.at(100); await R.say(g, A, 'plain one');
  await R.at(5100); await R.say(g, A, '@beta you, by name');
  await R.at(6100); await R.say(g, A, 'plain three');
  await R.eng.setNotify({ by: B, group: g, notify: 'next-turn' });
  await R.at(100000);
  ok(R.posts.length === 2 && verdictOf(/you, by name/.test(R.posts[1].text)), 'P3: an @ still owed stands: the wake fires', R.posts.length);
  ok(gateOf(R.posts[1]) && gateOf(/^You were @mentioned \(VibeSpace held/m.test(R.posts[1].text)) && !/notify mode in this group is "always"/.test(R.posts[1].text), 'THE LAW P3: …under a lead that tells the truth', R.posts[1] && R.posts[1].text.slice(0, 160));
  R.close();
  const K2 = rig('p3c');
  const g2 = await K2.group('lane', A, [B]);
  await K2.eng.setNotify({ by: B, group: g2, notify: 'always' });
  await K2.at(100); await K2.say(g2, A, 'plain one');
  await K2.at(5100); await K2.say(g2, A, 'plain two');
  await K2.at(100000);
  ok(K2.posts.length === 2 && verdictOf(/notify mode in this group is "always"/.test(K2.posts[1].text)), 'P3: CONTROL: a member still on always is woken, the lead says so', K2.posts.length);
  K2.close();
});
await leg(85, async () => { // P6
  const R = rig('p6');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  const e = R.deliver.owedEntries(B, 'groups')[0];
  for (let i = 0; i < 29; i++) e.attempts.push({ at: R.c.now, reason: 'timeout', phase: 'connect', busy: null, late: 0, why: 'timer' });
  refusing(R, 5 * 60_000);
  await R.at(31000);
  const session = R.sessions.get('w-beta');
  for (let i = 0; i < 6; i++) { await R.deliver.noteTurnEnd(session); await R.settle(); }
  const posts = e.attempts.filter((a) => a.phase !== 'pace').length;
  ok(posts === 29, 'THE LAW P6: the file\'s trim keeps every post row (the backoff and the post limit read them)', posts);
  ok(e.attempts.length <= 31, 'P6: …the file stays bounded', e.attempts.length);
  R.close();
});
await leg(86, async () => { // P5 + P4 pure words
  const P = require(path.join(REPO, 'src/channel-policy.js'));
  const t = (k, o) => k.replace(/\{(\w+)\}/g, (_, n) => String((o || {})[n]));
  const held = P.receiptPacedText({ state: 'sending', receiptChoicePaced: 'the rule', receiptPacedMs: 25000, held: { until: 1794000000000, vendor: 'lark' } }, { t });
  ok(gateOf(/the wake follows the send if it is still running/.test(held)) && !/next message/.test(held), 'THE LAW P5: on a held send the toast says the wake follows the send, with its condition', held);
  ok(verdictOf(/may have reached it/.test(P.receiptFateText(P.receiptFateOf({ receipt: { status: 'sent' }, draftedBy: { kind: 'agent', name: 'Worker' }, receiptDelivery: { stashed: true, at: 1, wakeFell: { at: 2, why: 'may-have-landed' } } }), { t }))), 'THE LAW P4: a may-have-landed fall reads as that on the card');
});

// ── §9 ROUND 4 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§9 round 4: the third acceptance\'s findings');
await leg(90, async () => { // P9: one list
  for (const [extra, want] of [[{ why: 'mode-changed', kind: 'not-reachable' }, 'mode-changed'], [{ why: 'left', kind: 'not-reachable' }, 'left'], [{ why: 'paced-out', kind: 'not-reachable' }, 'paced-out'], [{ kind: 'not-running' }, 'not-running'], [{ kind: 'spend-cap', why: 'hour-cap' }, 'spend-cap'], [{ kind: 'not-reachable', maybeDelivered: true }, 'may-have-landed'], [{ kind: 'something new' }, 'not-reachable'], [{}, 'not-reachable']]) ok(G.owedOutcome(extra) === want && verdictOf(G.AWAIT_FELL.includes(G.owedOutcome(extra))), `P9: ${JSON.stringify(extra)} ⇒ ${want}, always a row of the ONE list`, G.owedOutcome(extra));
  const eng = fs.readFileSync(path.join(REPO, 'src/server/groups-engine.js'), 'utf-8');
  const fellBody = eng.slice(eng.indexOf('function owedFell('), eng.indexOf('function tellOwnerOwedFell('));
  ok(gateOf(/const outcome = G\.owedOutcome\(extra\);/.test(fellBody)) && verdictOf(/patchAwaits\(gid, vids, \{ held: outcome \}\)/.test(fellBody)), 'THE LAW P9: owedFell writes only what the ONE list answers: a cause without a row cannot reach a record');
  const { pathToFileURL } = await import('node:url');
  const Wd = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-words.js')).href);
  const words = (held) => Wd.awaitLineText(G.awaitState({ raw: { await: { until: T0 + 1 } } }, { heldAt: T0, held }, T0), { t: (k) => k });
  ok(gateOf(G.AWAIT_FELL.every((c) => !/wake cap/.test(words(c)))) && new Set(G.AWAIT_FELL.map(words)).size === G.AWAIT_FELL.length, 'P9: every row of the list has its own words in the window', G.AWAIT_FELL.map(words));
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf-8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf-8');
  ok(verdictOf(G.AWAIT_FELL.every((c) => zh.includes(JSON.stringify(words(c)) + ':') && ja.includes(JSON.stringify(words(c)) + ':'))), 'P9: …zh + ja');
});
const awaitFallLeg = async (name, change) => {
  const R = rig(name);
  const g = await R.group('pair', A, [B, C]);
  await R.at(100); await R.say(g, B, '@alpha hello');
  await R.at(1100); const q = await R.say(g, A, 'a question?', { awaitReply: true });
  await R.at(2100); await R.say(g, B, 'the answer');
  ok(R.owed(A).length === 1, `P9 (${name}): the asker's wake is parked`);
  await change(R, g);
  await R.at(200000);
  const entry = R.eng.get(g).awaits[q.message.vendorId];
  const st = G.awaitState({ raw: q.message.raw }, entry, R.c.now);
  R.close();
  return { held: entry.held, st };
};
await leg(91, async () => { // P9: the probe
  const { pathToFileURL } = await import('node:url');
  const Wd = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-words.js')).href);
  const m = await awaitFallLeg('p9m', (R, g) => R.eng.setNotify({ by: A, group: g, notify: 'mute' }));
  ok(m.held === 'mode-changed' && m.st.fell === 'mode-changed', 'THE LAW P9: the asker muted: the record reads mode-changed', m);
  ok(verdictOf(/notify mode no longer asks for a wake/.test(Wd.awaitLineText(m.st, { t: (k) => k }))), 'THE LAW P9: …in the window, never «wake cap reached»', Wd.awaitLineText(m.st, { t: (k) => k }));
  const l = await awaitFallLeg('p9l', (R, g) => R.eng.leave({ by: A, group: g }));
  ok(l.held === 'left' && l.st.fell === 'left', 'THE LAW P9: the asker left: the record reads left', l);
  ok(verdictOf(/left the group/.test(Wd.awaitLineText(l.st, { t: (k) => k }))), 'THE LAW P9: …in the window, never «wake cap reached»', Wd.awaitLineText(l.st, { t: (k) => k }));
});
await leg(92, async () => { // P10
  const o = await twinLeg('p10');
  ok(o.owed === 1, 'THE LAW P10: a paced wake that arrived while its group\'s frame was on the wire, the post missed ⇒ ONE entry afterwards', o);
  ok(o.frames === 1 && o.two === 1 && o.three === 1 && !o.batch, 'THE LAW P10: the next frame carries the report ONCE, as a single-entry frame', o);
  ok(o.left === 0, 'P10: …nothing left owed', o);
  ok(o.notes === 2, 'P10: …one charge for the landed frame beside the first wake', o);
});
await leg(93, async () => { // P10: the frame landed: the newer wake is its own
  const R = rig('p10b');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta UNIQUE-TWO');
  R.answers.push(async () => { await R.say(g, A, '@beta UNIQUE-THREE'); return { ok: true, phase: 'written' }; });
  await R.at(30100);
  ok(R.owed(B).length === 1 && R.posts.length === 2, 'P10: a frame that LANDED keeps the newer wake its own (the frame carried the older words)', R.owed(B).length);
  await R.at(200000);
  const last = R.posts[R.posts.length - 1].text;
  ok(R.posts.length === 3 && gateOf(/UNIQUE-THREE/.test(last)) && !/UNIQUE-TWO/.test(last), 'P10: …it goes after the floor, carrying what the frame did not', last.slice(0, 200));
  R.close();
});
await leg(94, async () => { // P11
  for (const [label, ms] of [['59.5 min', 59.5 * 60_000], ['59.9 min', 59.9 * 60_000], ['50 min', 50 * 60_000], ['61 min', 61 * 60_000]]) {
    const o = await backlogAfterDowntime('p11-' + String(ms), ms);
    ok(o.firstMinute <= 8 && o.stamps <= 8, `THE LAW P11: a ${label} downtime: at most 8 in the first minute, no cliff at the hour`, o);
    ok(verdictOf(o.said), `P11: ${label}: said`, o);
    ok(o.finally === 11 && o.owed === 0, `P11: ${label}: all 11 within the pace`, o);
  }
});
await leg(95, async () => { // P12: the owner holds the promise
  const R = rig('p12');
  const g = await R.group('lane', A, [B]);
  const say = (text) => R.eng.post({ group: g, from: G.OWNER, text, mayWake: R.eng.pacerFor(G.OWNER) });
  await R.at(100); await say('@beta one');
  await R.at(5100); const r2 = await say('@beta two');
  ok(gateOf(r2.refused[0]) && verdictOf(r2.refused[0].parked), 'P12: sign-in off: the owner\'s second wake is parked', r2.refused);
  await R.eng.setNotify({ by: B, group: g, notify: 'mute' });
  await R.at(100000);
  const items = R.todos.snapshot().open.filter((i) => /was not woken in/.test(String(i.text)));
  ok(items.length === 1, 'THE LAW P12: the owner holds «sent when the window ends»: ONE For-you item through the real door when it falls', items.map((i) => i.text));
  const it = items[0];
  ok(gateOf(it) && gateOf(/beta was not woken in lane: its notify mode no longer asks for a wake/.test(it.text)) && gateOf(it.action) && it.action.type === 'open-channel' && it.action.convId === g, 'P12: …naming whom, where, why, opening the group', it);
  ok(gateOf(it) && gateOf(it.i18n) && it.i18n.text.key === '{member} was not woken in {group}: {why}' && it.i18n.text.params.why.key === 'its notify mode no longer asks for a wake', 'P12: …as an i18n key', it && it.i18n);
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf-8');
  ok(gateOf(it) && gateOf(zh.includes(JSON.stringify(it.i18n.text.key) + ':')) && gateOf(zh.includes(JSON.stringify(it.i18n.text.params.why.key) + ':')) && verdictOf(zh.includes(JSON.stringify(it.i18n.detail[0].key) + ':')), 'P12: …zh has every word of it');
  ok(verdictOf(/1 will not reach them: beta/.test(String(it && it.detail))), 'P12: …and says what is true about the message (a muted member reads nothing)', it && it.detail);
  ok(R.deliver.stashEntries(G.OWNER).length === 0, 'P12: …no stash queue under the owner\'s id');
  R.close();
});
await leg(96, async () => { // P12: an agent sender is not filed for, the spend's item stays the guard's
  const R = rig('p12b');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  await R.eng.setNotify({ by: B, group: g, notify: 'mute' });
  await R.at(100000);
  ok(gateOf(R.todos.snapshot().open.every((i) => !/woken in/.test(String(i.text)))) && verdictOf(R.deliver.stashEntries(A).some((x) => /NOT sent/.test(x.text))), 'P12: CONTROL: an agent sender hears it on its next turn, no For-you item');
  R.close();
  const refuse = new Set();
  const S = rig('p12c', { refuse });
  const g2 = await S.group('lane', A, [B]);
  const say = (text) => S.eng.post({ group: g2, from: G.OWNER, text, mayWake: S.eng.pacerFor(G.OWNER) });
  await S.at(100); await say('@beta one');
  await S.at(5100); await say('@beta two');
  refuse.add(B);
  await S.at(100000);
  ok(S.owed(B).length === 0 && verdictOf(S.todos.snapshot().open.every((i) => !/woken in/.test(String(i.text)))), 'P12: CONTROL: a spend refusal files no item here: the guard\'s is the owner\'s');
  S.close();
});

// ── §10 ROUND 5 ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§10 round 5: the fourth acceptance\'s findings');
const everyoneStopped = (R, keep) => { for (const [wid, s] of [...R.sessions]) if (s.claudeSessionId !== keep) R.sessions.delete(wid); };
await leg(100, async () => { // P13 (1): an agent's --wake to 30 stopped members, 10 receipts waiting
  const R = rig('p13a', { peerOf: () => null });
  const members = Object.keys(NAMES).filter((c) => c !== A).slice(0, 30);
  const g = await R.group('big', A, members);
  await R.at(100);
  for (let i = 0; i < 10; i++) R.deliver.stashFor(A, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: `receipt ${i}`, ref: `p-${i}`, held: { kind: 'notice', why: 'paced' } });
  everyoneStopped(R, A);
  const r = await R.say(g, A, 'everyone, wake', { wake: true });
  const parkedNow = members.reduce((n, m) => n + R.owed(m).length, 0);
  ok(parkedNow === 0, 'THE LAW P13: a target that is not running is NEVER parked', parkedNow);
  ok(gateOf(r.refused.every((x) => !x.parked)) && !r.refused.some((x) => /sent in/.test(x.reason)), 'THE LAW P13: …nobody is promised «sent in N s»', r.refused.slice(0, 2));
  ok(r.refused.filter((x) => /^not running — rides its next turn/.test(x.reason)).length === 22, 'P13: …the pace\'s refusals are answered at once with the truth', r.refused.slice(-1));
  await R.at(2 * 3600_000);
  const stash = R.deliver.stashEntries(A);
  ok(stash.filter((x) => /NOT sent/.test(x.text)).length === 0, 'THE LAW P13: no fall, no notice', stash.length);
  ok(stash.filter((x) => /^receipt \d/.test(x.text)).length === 10, 'THE LAW P13: all 10 real receipts kept', stash.length);
  R.close();
});
await leg(101, async () => { // P13 (2): the owner's wake of 31 stopped members
  const R = rig('p13b', { peerOf: () => null });
  const members = Object.keys(NAMES).filter((c) => c !== A).slice(0, 31);
  const g = await R.group('big', A, members);
  everyoneStopped(R, A);
  await R.at(100);
  const r = await R.eng.post({ group: g, from: G.OWNER, text: 'everyone, wake', wake: true, mayWake: R.eng.pacerFor(G.OWNER) });
  ok(verdictOf(r.refused.every((x) => !x.parked)), 'P13: the owner\'s wake of stopped members parks nothing', r.refused.length);
  await R.at(2 * 3600_000);
  ok(R.todos.snapshot().open.filter((i) => /woken in|wakes in/.test(String(i.text))).length === 0, 'THE LAW P13: no For-you flood: nothing fell, nothing filed', R.todos.snapshot().open.length);
  const next = R.todos.add('channels', { origin: 'channels', text: 'the next channels item', urgency: 'normal', by: 'agent', sessionName: 'Channels' });
  ok(gateOf(next) && verdictOf(next.id), 'P13: …the channels bucket still takes the next item');
  R.close();
});
const fallsFold = async (name, from) => {
  let live = true;
  const R = rig(name, { peerOf: (cid) => (live ? { name: cid, socketPath: '/dev/null' } : null) });
  const members = Object.keys(NAMES).filter((c) => c !== A).slice(0, 14);
  const g = await R.group('wide', A, members);
  let at = 100;
  const say = (text) => (from === G.OWNER ? R.eng.post({ group: g, from, text, mayWake: R.eng.pacerFor(from) }) : R.say(g, from, text));
  for (const m of members) { at += 10; await R.at(at); await say(`@${NAMES[m]} go`); }
  const parked = members.reduce((n, m) => n + R.owed(m).length, 0);
  live = false; everyoneStopped(R, A);
  await R.at(200000);
  return { R, parked, members };
};
await leg(102, async () => { // P13: running at the park, gone at the attempt: ONE line
  const { R, parked } = await fallsFold('p13c', A);
  ok(parked === 6, 'P13: 8 woken, 6 parked while the targets ran', parked);
  const notices = R.deliver.stashEntries(A).filter((x) => /NOT sent/.test(x.text));
  ok(notices.length === 1, 'THE LAW P13: six falls for one sender are ONE line in its stash', notices.map((x) => x.text.slice(0, 80)));
  const n = notices[0];
  ok(gateOf(n) && verdictOf(/^6 of your wakes were NOT sent \(not-running ×6\)/.test(n.text)), 'P13: …the count and the reasons counted', n && n.text);
  ok(gateOf(n) && gateOf(/\+1 more/.test(n.text)) && verdictOf(/next turn \(free\)/.test(n.text)), 'P13: …names bounded, the fate said', n && n.text);
  ok(gateOf(n) && n.kind === 'notification' && n.held.kind === 'not-reachable' && verdictOf(String(n.held.why).startsWith('paced')), 'P13: …on the not-reachable road, under the held heading', n && n.held);
  R.close();
});
await leg(103, async () => { // P13: the owner's falls: ONE item naming the count
  const { R, parked } = await fallsFold('p13d', G.OWNER);
  ok(parked === 6, 'P13: the owner: 6 parked', parked);
  const items = R.todos.snapshot().open.filter((i) => /woken in|wakes in/.test(String(i.text)));
  ok(items.length === 1, 'THE LAW P13: ONE For-you item, however many fell', items.map((i) => i.text));
  const it = items[0];
  ok(gateOf(it) && gateOf(/^6 of your wakes in wide were not sent: /.test(it.text)) && it.i18n.text.key === '{n} of your wakes in {group} were not sent: {members}' && it.i18n.text.params.n === 6, 'P13: …naming the count', it && it.text);
  ok(gateOf(it) && verdictOf(/6 — its conversation is not running/.test(String(it.detail))), 'P13: …the reasons counted', it && it.detail);
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf-8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf-8');
  ok(gateOf(it) && verdictOf([it.i18n.text.key, ...it.i18n.detail.map((l) => l.key)].every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':'))), 'P13: …zh + ja have every word of it');
  R.todos.setStatus(it.id, 'done', 'user');
  R.close();
});
await leg(104, async () => { // P14: an awaited reply to a mention-mode asker, paced
  const R = rig('p14');
  const g = await R.group('pair', A, [B]);
  await R.eng.setNotify({ by: A, group: g, notify: 'mention' });
  await R.at(100); await R.say(g, B, '@alpha first ping');
  await R.at(1000); const q = await R.say(g, A, 'a question?', { awaitReply: true });
  await R.at(5000); const a = await R.say(g, B, 'the answer, no at');
  ok(a.awaited.length === 1 && a.awaited[0].held === 'paced' && R.owed(A).length === 1, 'P14: the reply\'s wake is parked', a.awaited);
  await R.at(100000);
  const frame = R.posts.filter((p) => p.cid === A).pop();
  ok(gateOf(frame) && gateOf(/the answer, no at/.test(frame.text)) && verdictOf(/\[await\]/.test(frame.text)), 'THE LAW P14: the awaited reply REACHES the asker whatever its mode', frame && frame.text.slice(0, 200));
  const st = G.awaitState({ raw: q.message.raw }, R.eng.get(g).awaits[q.message.vendorId], R.c.now);
  ok(st.state === 'woke', 'P14: …the record reads «woke»', st);
  R.close();
});
await leg(105, async () => { // P14: the same on the unpaced road
  const R = rig('p14b');
  const g = await R.group('pair', A, [B]);
  await R.eng.setNotify({ by: A, group: g, notify: 'mention' });
  await R.at(1000); const q = await R.say(g, A, 'a question?', { awaitReply: true });
  await R.at(5000); await R.say(g, B, 'the answer, no at');
  const frame = R.posts.filter((p) => p.cid === A).pop();
  ok(gateOf(frame) && verdictOf(/the answer, no at/.test(frame.text)), 'P14: the unpaced road says the same: delivery never depends on the timing', R.posts);
  ok(G.awaitState({ raw: q.message.raw }, R.eng.get(g).awaits[q.message.vendorId], R.c.now).state === 'woke', 'P14: …«woke»');
  R.close();
});
const awaitTwin = async (name, DELIVER = DELIVER0) => {
  const R = rig(name, { DELIVER });
  const g = await R.group('pair', A, [B]);
  await R.at(100); await R.say(g, B, '@alpha hello');
  await R.at(1100); const q = await R.say(g, A, 'a question?', { awaitReply: true });
  await R.at(2100); await R.say(g, B, 'the answer');
  R.answers.push(async () => { await R.say(g, B, '@alpha a plain mention, on the wire'); return { ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 }; });
  await R.at(30100);
  const owed = R.owed(A)[0] || null;
  const before = R.posts.length;
  await R.at(200000);
  const frame = R.posts[before] ? R.posts[before].text : '';
  const out = { n: owed ? R.owed(A).length : 0, why: owed && owed.meta.why, vids: owed ? owed.meta.vids.length : 0, frame: frame.slice(0, 80), state: G.awaitState({ raw: q.message.raw }, R.eng.get(g).awaits[q.message.vendorId], R.c.now).state };
  R.close();
  return out;
};
await leg(106, async () => { // P15
  const o = await awaitTwin('p15');
  ok(o.why === 'await' && o.vids === 1, 'THE LAW P15: the fold keeps the await: why, its row', o);
  ok(gateOf(/^\[await\]/.test(o.frame)) && o.state === 'woke', 'THE LAW P15: the frame says [await], the record reads «woke»', o);
  const Ms2 = mutantCopies('pwr-p15', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
  const anchor = "first.meta = h && typeof h.merge === 'function' ? h.merge(first.meta, e.meta) : e.meta;";
  if (!src.includes(anchor)) throw new Error('control anchor moved: the fold');
  const CDm = Ms2.load('src/server/conversation-deliver.js', editAnchor(src, anchor, 'first.meta = e.meta;', "src/server/conversation-deliver.js"), 'no-merge-in-fold');
  const m = await awaitTwin('p15m', CDm);
  ok(m.why !== 'await' && !/^\[await\]/.test(m.frame) && m.state !== 'woke', '(xvii) CONTROL: without the producer\'s merge the frame says «@mentioned» and the record stays «held»', m);
});

// ── §11 ROUND 6 ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§11 round 6: the fifth acceptance\'s findings');
/** P16's measured shape: the server dies while beta's paced frame is on the wire; gamma's parked wake then falls not-running after the reboot */
const mayLandedFold = async (name, from) => {
  const c = { now: T0, timers: [] };
  const R1 = rig(name, { shared: c });
  const g = await R1.group('lane', A, [B, C]);
  const say = (t) => (from === G.OWNER ? R1.eng.post({ group: g, from, text: t, mayWake: R1.eng.pacerFor(from) }) : R1.say(g, from, t));
  await R1.at(100); await say('@beta @gamma one');
  await R1.at(5100); await say('@beta @gamma two');
  R1.answers.push(() => new Promise(() => { }));
  c.timers.sort((x, y) => x.at - y.at); c.now = T0 + 30100; const t = c.timers.shift(); if (t) t.fn();
  await sleep(5);
  c.timers.length = 0;
  const R2 = rig(name + '-2', { shared: c, dir: R1.dataDir, peerOf: (cid) => (cid === B ? { name: cid, socketPath: '/dev/null' } : null) });
  R2.sessions.delete('w-gamma');
  await R2.advanceTo(T0 + 200000);
  return R2;
};
await leg(110, async () => { // P16: the agent's line
  const R = await mayLandedFold('p16a', A);
  const notices = R.deliver.stashEntries(A).filter((x) => /wake/.test(x.text));
  ok(notices.length === 1, 'P16: one line for the two falls', notices.map((x) => x.text));
  const t = notices[0] ? notices[0].text : '';
  ok(gateOf(/1 of your wakes may have been woken already/.test(t)) && gateOf(/beta/.test(t)) && verdictOf(/Waking them again may start a second turn/.test(t)), 'THE LAW P16: the fold keeps the may-have-landed truth, in its own words', t);
  ok(gateOf(/1 of your wakes was NOT sent \(not-running ×1\): gamma/.test(t)) && !/NOT sent[^.]*may-have-landed/.test(t), 'THE LAW P16: …the sure miss is counted apart, never «NOT sent» about beta', t);
  ok(!/send again/.test(t) && verdictOf(/before you wake anyone again/.test(t)), 'THE LAW P16: «send again» is said only when every fall is a sure miss', t);
  R.close();
});
await leg(111, async () => { // P16: the owner's item
  const R = await mayLandedFold('p16b', G.OWNER);
  const items = R.todos.snapshot().open.filter((i) => /woken|not sent/.test(String(i.text)));
  ok(items.length === 1, 'P16: one item for the group', items.map((i) => i.text));
  const it = items[0];
  ok(gateOf(it) && verdictOf(/^1 of your wakes in lane may have been woken, 1 not sent: /.test(it.text)), 'THE LAW P16: the owner\'s title keeps both truths', it && it.text);
  ok(gateOf(it) && verdictOf(/may already have reached beta, so waking them again may start a second turn/.test(String(it.detail))), 'THE LAW P16: …and the warning stays', it && it.detail);
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf-8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf-8');
  ok(gateOf(it) && verdictOf([it.i18n.text.key, ...it.i18n.detail.map((l) => l.key)].every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':'))), 'P16: …zh + ja have every word of it', it && it.i18n);
  R.close();
});
await leg(112, async () => { // the line says which commands it spans
  let live = true;
  const R = rig('cmds', { peerOf: (cid) => (live ? { name: cid, socketPath: '/dev/null' } : null) });
  const g1 = await R.group('first', A, [B]);
  const g2 = await R.group('second', A, [C]);
  await R.at(100); await R.say(g1, A, '@beta one'); await R.say(g2, A, '@gamma one');
  await R.at(5100); await R.say(g1, A, '@beta two'); await R.say(g2, A, '@gamma two');
  live = false; everyoneStopped(R, A);
  await R.at(100000);
  const t = (R.deliver.stashEntries(A).find((x) => /NOT sent/.test(x.text)) || {}).text || '';
  ok(gateOf(/^2 of your wakes were NOT sent/.test(t)) && verdictOf(/They came from 2 of your messages, the newest in group "(first|second)"\./.test(t)), 'THE LAW (fold): the line says which commands it spans: the count + the newest', t);
  R.close();
});
await leg(113, async () => { // P17
  const { TEXT_MAX } = require(path.join(REPO, 'src/user-todos.js'));
  const R = rig('p17');
  const it = R.todos.add('channels', { origin: 'channels', text: 'short', urgency: 'normal', by: 'agent', sessionName: 'Channels' });
  const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  for (const before of [TEXT_MAX - 1, TEXT_MAX - 2, TEXT_MAX - 3]) {
    const r = R.todos.redrawItem((i) => i.id === it.id, { text: 'a'.repeat(before) + '😀' + 'b'.repeat(20), detail: 'd' });
    const now = R.todos.get(it.id).text;
    ok(gateOf(r.ok) && now.length <= TEXT_MAX && !lone.test(now), `THE LAW P17: an item's text cap never splits a character (an emoji at ${before})`, now.slice(-6));
  }
  const src = fs.readFileSync(path.join(REPO, 'src/user-todos.js'), 'utf-8');
  const body = src.slice(src.indexOf('  redrawItem(pred'), src.indexOf('  _save() {'));
  ok(gateOf(/it\.text = (clipText|clip)\(text\.trim\(\), TEXT_MAX\);/.test(body)) && !/it\.text = [^;]*\.slice\(/.test(body), 'P17: …through the file\'s own cut, not a new slice (`clipText` here; when artifacts-by-intent lands, its `clip`: the one-clip law wins)');
  R.close();
});
const liveNoLane = async (name, setup, words) => {
  const R = rig(name, { peerOf: () => null });
  const members = [B, C, D, E, F, H, I, J, K];
  const g = await R.group('wide', A, members);
  setup(R.sessions.get('w-beta'));
  for (const [wid, x] of [...R.sessions]) if (x.claudeSessionId !== A && x.claudeSessionId !== B) R.sessions.delete(wid);
  await R.at(100);
  const first = await R.say(g, A, '@beta granted');
  const others = [C, D, E, F, H, I, J].map((m) => NAMES[m]);
  for (let i = 0; i < 7; i++) { await R.at(200 + i * 10); await R.say(g, A, `@${others[i]} go`); }
  await R.at(40000);   // the pair's floor passed; the sender's minute is still spent
  const paced = await R.say(g, A, '@beta over the minute');
  const out = { first: first.refused[0] && first.refused[0].reason, paced: paced.refused[0] && paced.refused[0].reason, parked: paced.refused[0] && !!paced.refused[0].parked, owed: R.owed(B).length };
  R.close();
  return out;
};
await leg(114, async () => { // P18
  const o = await liveNoLane('p18a', (s) => { s.backend = 'opencode'; });
  ok(verdictOf(/running, but its agent takes no message mid-session/.test(o.first)), 'P18: a live stash-only target, the unpaced road: its true words', o.first);
  ok(verdictOf(/^this conversation is running, but its agent takes no message mid-session — rides its next turn \(rate floor/.test(o.paced)), 'THE LAW P18: the paced road says the same, never «not running»', o.paced);
  ok(!o.parked && o.owed === 0, 'P18: …and it is not parked: nothing could fire', o);
  const c = await liveNoLane('p18b', (s) => { s.backend = 'codex'; s.mode = 'terminal'; s.pty = { write() { } }; });
  ok(gateOf(/running in a terminal/.test(c.paced)) && !/^not running/.test(c.paced), 'THE LAW P18: a live codex terminal too', c.paced);
});
await leg(115, async () => { // P19: per group, naming the unreachable
  let live = true;
  const R = rig('p19', { peerOf: (cid) => (live ? { name: cid, socketPath: '/dev/null' } : null) });
  const g1 = await R.group('first', A, [B, C]);
  const g2 = await R.group('second', A, [D, E]);
  const say = (g, t) => R.eng.post({ group: g, from: G.OWNER, text: t, mayWake: R.eng.pacerFor(G.OWNER) });
  await R.at(100); await say(g1, '@beta @gamma one'); await say(g2, '@delta @eps one');
  await R.at(5100); await say(g1, '@beta @gamma two'); await say(g2, '@delta @eps two');
  await R.eng.leave({ by: D, group: g2 });
  live = false; everyoneStopped(R, A);
  await R.at(100000);
  const items = R.todos.snapshot().open.filter((i) => /wakes in|woken in/.test(String(i.text)));
  ok(items.length === 2, 'THE LAW P19: one item per group', items.map((i) => i.text));
  const first = items.find((i) => i.action.convId === g1), second = items.find((i) => i.action.convId === g2);
  ok(gateOf(first) && gateOf(/in first/.test(first.text)) && gateOf(second) && verdictOf(/in second/.test(second.text)), 'THE LAW P19: each names its group, and pressing it opens that group', items.map((i) => [i.text, i.action.convId]));
  ok(gateOf(second) && gateOf(/1 will not reach them: delta/.test(String(second.detail))) && verdictOf(/1 reach them on their next turn/.test(String(second.detail))), 'THE LAW P19: …and which message will never be read', second && second.detail);
  R.close();
});
await leg(116, async () => { // P19: the bucket stays bounded
  let live = true;
  const R = rig('p19b', { peerOf: (cid) => (live ? { name: cid, socketPath: '/dev/null' } : null) });
  const members = [B, C, D, E, F, H, I];
  const gs = [];
  for (let i = 0; i < members.length; i++) gs.push(await R.group('g' + i, A, [members[i]]));
  const say = (g, t) => R.eng.post({ group: g, from: G.OWNER, text: t, mayWake: R.eng.pacerFor(G.OWNER) });
  await R.at(100);
  for (let i = 0; i < members.length; i++) await say(gs[i], `@${NAMES[members[i]]} one`);
  await R.at(5100);
  for (let i = 0; i < members.length; i++) await say(gs[i], `@${NAMES[members[i]]} two`);
  live = false; everyoneStopped(R, A);
  await R.at(100000);
  const items = R.todos.snapshot().open.filter((i) => /wakes in|woken in/.test(String(i.text)));
  ok(items.length === 5, 'P19: seven groups fell: at most 5 items, the bucket is a person\'s attention', items.length);
  ok(verdictOf(items.some((i) => /More fell in other groups: g5 \(1\), g6 \(1\)/.test(String(i.detail)))), 'P19: …the newest names the others', items.map((i) => i.detail));
  R.close();
});
await leg(117, async () => { // P20 (a): the next-turn road
  let live = true;
  const R = rig('p20a', { peerOf: (cid) => (live ? { name: cid, socketPath: '/dev/null' } : null) });
  const g = await R.group('pair', A, [B]);
  await R.eng.setNotify({ by: A, group: g, notify: 'mention' });
  await R.at(1000); const q = await R.say(g, A, 'a question?', { awaitReply: true });
  live = false; R.sessions.delete('w-alpha');
  await R.at(5000); const a = await R.say(g, B, 'THE-ANSWER no at');
  ok(gateOf(a.awaited[0]) && a.awaited[0].held === 'not-running', 'P20: the asker stopped: the record says so', a.awaited);
  const rep = await R.turn(A);
  ok(verdictOf(/THE-ANSWER/.test(rep.text)), 'THE LAW P20: the awaited reply reaches a mention-mode asker on the NEXT-TURN road', rep.text);
  await sleep(2);
  const st = G.awaitState({ raw: q.message.raw }, R.eng.get(g).awaits[q.message.vendorId], R.c.now);
  ok(st.state === 'answered', 'P20: …and the record no longer says «held»', st);
  R.close();
  const K2 = rig('p20c');
  const g2 = await K2.group('pair', A, [B]);
  await K2.eng.setNotify({ by: A, group: g2, notify: 'mention' });
  await K2.at(1000); await K2.say(g2, B, 'not for alpha');
  ok(!/not for alpha/.test((await K2.turn(A)).text), 'P20: CONTROL: with no await a mention member is still handed only what @names it');
  K2.close();
});
await leg(118, async () => { // P20 (b): a stopped asker under the pace
  let live = true;
  const R = rig('p20b', { peerOf: (cid) => (live ? { name: cid, socketPath: '/dev/null' } : null) });
  const g = await R.group('pair', A, [B]);
  await R.at(100); await R.say(g, B, '@alpha hello');
  await R.at(1100); const q = await R.say(g, A, 'a question?', { awaitReply: true });
  live = false; R.sessions.delete('w-alpha');
  await R.at(2100); const a = await R.say(g, B, 'the answer');
  ok(gateOf(a.awaited[0]) && a.awaited[0].held === 'not-running' && R.owed(A).length === 0, 'P20: a stopped asker under the pace: not parked, the true cause on the record', a.awaited);
  const st = G.awaitState({ raw: q.message.raw }, R.eng.get(g).awaits[q.message.vendorId], R.c.now);
  const { pathToFileURL } = await import('node:url');
  const Wd = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-words.js')).href);
  const line = Wd.awaitLineText(st, { t: (k) => k });
  ok(gateOf(/was not running/.test(line)) && !/wake cap/.test(line), 'THE LAW P20: the line says «not running», never «wake cap reached»', line);
  R.close();
});
await leg(119, async () => { // the older words
  const words = fs.readFileSync(path.join(REPO, 'src/lib/channel-words.js'), 'utf-8');
  ok(gateOf(/\{n\} wake\(s\) not sent \(not billed — they get it next turn\)/.test(words)) && !/refused by the spend guard/.test(words), 'the owner\'s echo no longer blames the spend guard for a pace\'s or a stopped target\'s refusal');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
