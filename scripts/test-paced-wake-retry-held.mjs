#!/usr/bin/env node
// test-paced-wake-retry-held — test-paced-wake-retry's §B-f276 1a, MOVED VERBATIM (the coordinator's r2569, lane paced-wake-retry,
// 2026-11-22: the row stood at 13.6 s alone; each file now 9 s or less alone): lane bl-windows's held-wake legs (the
// coordinator's r596) — the producer says «held»: the wake is set aside before every road, walked through the real deliverer
// on a stand-in clock (three roads, held and lifted, each with its controls), with its 1b and 1c follows.
// Every moved line is the original's, unchanged and in order; the head is test-paced-wake-retry's own (its imports, fixtures
// and rig) but for the one helper a new suite takes (scripts/lib/check.mjs checker: test-ci-gate-tiers §7b) — each moved
// call keeps its words, its condition passing the census's own guarded coercion (verdictOf). No real CLI, no real vendor,
// no hub: a stub post over a manual clock.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker, verdictOf } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CK = checker();   // the one helper (scripts/lib/check.mjs); the moved calls keep their words: each condition passes verdictOf
const ok = (c, n, e) => CK.ok(verdictOf(c), n, e);
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
const leg = async (n, fn) => { try { await fn(); } catch (e) { CK.ok(false, `leg ${n} threw — ${(e && e.message) || e}`); } };
// two one-line helpers of the original that the held legs call, copied unchanged: §10's everyoneStopped, §12's between
const everyoneStopped = (R, keep) => { for (const [wid, s] of [...R.sessions]) if (s.claudeSessionId !== keep) R.sessions.delete(wid); };
const between = (src, a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i + a.length); return i < 0 || j < 0 ? '' : src.slice(i, j); };

console.log('\n§B-f276 1a (lane bl-windows, 主开发 r596; shape B — ONE door): THE PRODUCER SAYS «HELD» — the wake is set aside before every road');
await leg(148, async () => {
  const DSRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const MH = mutantCopies('paced-held-1a', REPO);
  // the ONE control of the door: the deliverer that never asks (the door's verdict cut) — every road below then runs over a held file
  const NO_DOOR = MH.load('src/server/conversation-deliver.js', anchored(DSRC, '      const h = heldWhy(e);\n', '      const h = null;\n', 'the door never asks'), 'door-never-asks');
  // …and the control of the LIFT (the read's should 4): a door that never lifts — the after-legs must catch a wake that waits for ever
  const NO_LIFT = MH.load('src/server/conversation-deliver.js', anchored(DSRC, '      if (!e.waitsHeld) continue;\n', '      continue;\n', 'the door never lifts'), 'door-never-lifts');
  /** ONE scene: a stand-in producer whose file is held parks a wake for B; `road` decides what B is at the attempts:
   *  live (reachable) · gone (not running: no inbox, no session) · noinbox (a live session whose CLI has no inbox now) */
  const heldRun = async (DL, tag, road) => {
    let reach = true, held = true;
    const R = rig(`held1a-${tag}`, { DELIVER: DL, peerOf: (cid) => (reach ? { name: cid, socketPath: '/dev/null' } : null) });
    const fell = [], rendered = [];
    R.deliver.registerOwedWake('stand-in', { render: () => { rendered.push(1); return { text: 'the stand-in wake', kind: 'notification', fromName: 'Stand-in' }; }, fell: (cid, e, x) => { fell.push(x || {}); return true; }, cancelled: () => { }, held: () => held });
    const parked = R.deliver.parkOwedWake(B, { producer: 'stand-in', key: 'k-1', retryInMs: 1000, spendReason: 'stand-in', kind: 'notification', fromName: 'Stand-in', sender: 'owner', reason: 'paced', meta: { k: 1 } });
    if (road !== 'live') reach = false;
    if (road === 'gone') everyoneStopped(R, A);
    const owed0 = R.owed(B)[0] || null, attempts0 = owed0 ? owed0.attempts.length : -1;
    const fileNow = () => { try { return fs.readFileSync(path.join(R.dataDir, 'msg-retry.json'), 'utf8'); } catch { return null; } };
    await R.at(3600e3);
    const bytes1h = fileNow();
    await R.at(3 * 3600e3);   // three hours: past the 60-min bound, every retry step and the attempts' bound
    const bytesSame = bytes1h !== null && fileNow() === bytes1h;
    const e = R.owed(B)[0] || null;
    const onDisk = (() => { try { return fs.readFileSync(path.join(R.dataDir, 'msg-retry.json'), 'utf8').includes('"waitsHeld"'); } catch { return false; } })();
    const during = { fell: fell.length, rendered: rendered.length, posts: R.posts.length, owed: R.owed(B).length, attempts: e ? e.attempts.length - attempts0 : null, marked: !!(e && e.waitsHeld), onDisk, setAsideSaid: R.logs.filter((l) => /set aside, held/.test(l)).length, bytesSame };
    held = false;
    if (road === 'noinbox') reach = true;   // its CLI is back
    await R.at(3 * 3600e3 + 15 * 60e3);
    const after = { fell: fell.length, rendered: rendered.length, posts: R.posts.length, owed: R.owed(B).length };
    R.close();
    return { parked: !!(parked && parked.parked !== false), during, after };
  };
  const live = await heldRun(DELIVER0, 'live', 'live'), gone = await heldRun(DELIVER0, 'gone', 'gone'), noin = await heldRun(DELIVER0, 'noinbox', 'noinbox');
  console.log(`    facts: live ${JSON.stringify(live)}\n           not running ${JSON.stringify(gone)}\n           no inbox ${JSON.stringify(noin)}`);
  ok(live.parked && live.during.rendered === 0 && live.during.posts === 0 && live.during.fell === 0 && live.during.owed === 1, 'B-f276 1a: a held producer\'s wake for a LIVE member — three hours past its bound: never rendered, never posted (no billed turn), never fallen; still owed', JSON.stringify(live));
  ok(live.during.marked && live.during.onDisk && live.during.attempts === 0 && live.during.setAsideSaid === 1 && live.during.bytesSame, 'B-f276 1a: …ONE mark on disk (waitsHeld), NO attempt row over three hours, said ONCE, msg-retry.json byte-identical from the first hour to the third (asked again in memory, never a write a minute)', JSON.stringify(live.during));
  ok(live.after.posts === 1 && live.after.fell === 0 && live.after.owed === 0, 'B-f276 1a: …the producer reads again: the wake is posted ONCE (its bound clock moved by the hold: no force)', JSON.stringify(live.after));
  ok(gone.parked && gone.during.fell === 0 && gone.during.posts === 0 && gone.during.owed === 1, 'B-f276 1a: a held producer\'s wake whose member is NOT RUNNING — the not-running fall road never sees it while held', JSON.stringify(gone));
  ok(gone.after.fell === 1 && gone.after.posts === 0 && gone.after.owed === 0, 'B-f276 1a: …the producer reads again: the not-running road falls it ONCE, said by the producer', JSON.stringify(gone.after));
  ok(noin.parked && noin.during.attempts === 0 && noin.during.fell === 0 && noin.during.posts === 0 && noin.during.owed === 1, 'B-f276 1a (the read\'s must 2): a held wake whose LIVE member has no inbox — no attempt counted, no fall, over three hours', JSON.stringify(noin));
  ok(noin.after.posts === 1 && noin.after.fell === 0, 'B-f276 1a: …the lift, its CLI back: posted ONCE', JSON.stringify(noin.after));
  const cl = await heldRun(NO_DOOR, 'c-live', 'live'), cg = await heldRun(NO_DOOR, 'c-gone', 'gone'), cn = await heldRun(NO_DOOR, 'c-noinbox', 'noinbox');
  ok(cl.during.posts > 0 || cl.during.rendered > 0, 'B-f276 1a CONTROL (the door never asks, in a copy): the held wake is rendered and posted over the held file — a billed turn — red', JSON.stringify(cl.during));
  ok(cg.during.fell > 0, 'B-f276 1a CONTROL: …the not-running road falls it while held — red', JSON.stringify(cg.during));
  ok(cn.during.attempts > 0 || cn.during.fell > 0, 'B-f276 1a CONTROL: …the no-inbox road counts attempts (and falls at the bound) while held — red', JSON.stringify(cn.during));
  const REMARK = MH.load('src/server/conversation-deliver.js', anchored(DSRC, '    if (e.waitsHeld) return false;\n', '    delete e.waitsHeld;\n', 'the mark set again at every ask'), 'remark-every-ask');
  const rm = await heldRun(REMARK, 'c-remark', 'live');
  ok(rm.during.setAsideSaid > 1 && !rm.during.bytesSame, 'B-f276 1a SAID-ONCE CONTROL (the mark set again at every ask, in a copy): msg-retry.json rewritten and the hold said every minute — red', JSON.stringify(rm.during));
  const ll = await heldRun(NO_LIFT, 'c-nolift', 'live'), lg = await heldRun(NO_LIFT, 'c-nolift-gone', 'gone');
  ok(ll.after.posts === 0 && ll.after.owed === 1 && lg.after.fell === 0, 'B-f276 1a LIFT CONTROL (a door that never lifts, in a copy): the wake waits for ever after the producer reads again — the after-legs above go red on it', JSON.stringify({ live: ll.after, gone: lg.after }));

  // THE DOOR'S RE-ASK IS ITS OWN (the fourth read's must): a held wake BESIDE a paced wake that is not held, two hours — the paced
  // wake's life (its pace asks, its post) is the SAME as alone: the held one's minute is never a whole attempt of the conversation
  const besideRun = async (DL, tag, { withHeld, throwing = false }) => {
    const R = rig(`held1a-beside-${tag}`, { DELIVER: DL });
    let asks = 0;
    R.deliver.registerWakePacer(() => { const m = () => { asks++; return { reason: 'paced', why: 'a floor', rule: 'pace', retryInMs: 600e3 }; }; m.force = () => ({ ok: true }); m.refund = () => { }; return m; });
    R.deliver.registerOwedWake('stand-in-w', { render: () => ({ text: 'the paced wake', kind: 'notification', fromName: 'Stand-in' }), fell: () => true, cancelled: () => { } });
    if (withHeld) {
      R.deliver.registerOwedWake('stand-in-h', { render: () => ({ text: 'the held wake', kind: 'notification', fromName: 'Stand-in' }), fell: () => true, cancelled: () => { }, held: () => { if (throwing) throw new Error('its store could not be read'); return true; } });
      R.deliver.parkOwedWake(B, { producer: 'stand-in-h', key: 'k-h', retryInMs: 1000, spendReason: 'stand-in', sender: A, reason: 'paced', meta: { k: 'h' } });
    }
    R.deliver.parkOwedWake(B, { producer: 'stand-in-w', key: 'k-w', retryInMs: 1000, spendReason: 'stand-in', sender: A, reason: 'paced', meta: { k: 'w' } });
    await R.at(40 * 60e3);
    const at40 = { asks, posts: R.posts.length };
    await R.at(2 * 3600e3);
    const out = { at40, asks, posts: R.posts.length };
    R.close();
    return out;
  };
  const alone = await besideRun(DELIVER0, 'alone', { withHeld: false }), beside = await besideRun(DELIVER0, 'beside', { withHeld: true });
  console.log(`    facts: a paced wake alone ${JSON.stringify(alone)} · beside a held wake ${JSON.stringify(beside)}`);
  ok(JSON.stringify(beside) === JSON.stringify(alone) && alone.at40.posts === 0, 'B-f276 1a (the fourth read\'s must): a held wake beside a paced one — the paced wake\'s pace asks and its post are EXACTLY as alone (never forced early, never asked once a minute)', JSON.stringify({ alone, beside }));
  const besideThrow = await besideRun(DELIVER0, 'beside-throw', { withHeld: true, throwing: true });
  ok(JSON.stringify(besideThrow) === JSON.stringify(alone), 'B-f276 1b (the 1a round\'s should): a held() that THROWS beside a paced wake — the paced wake\'s life is EXACTLY as alone (one producer\'s throw never stops another\'s)', JSON.stringify({ alone, besideThrow }));
  const DRAG = MH.load('src/server/conversation-deliver.js', anchored(DSRC, '      if (d.length && d.every(aside)) { asideHeld(cid); if (!dueOf(cid).some((e) => !aside(e))) continue; }\n', '', 'the held minute runs a whole attempt'), 'held-minute-drags');
  const bx = await besideRun(DRAG, 'drag', { withHeld: true });
  ok(bx.asks > alone.asks || bx.at40.posts > 0, 'B-f276 1a RE-ASK CONTROL (the held wake\'s minute runs a whole attempt, in a copy): the paced wake is asked every minute and forced early — red', JSON.stringify(bx));

  // A HOLD ACROSS A RESTART (the fifth read's should): the boot rebases the bound; the lift credits only the hold since the boot
  const restartRun = async (DL, tag) => {
    const c = { now: T0, timers: [] };
    let held = true;
    const hooks = { render: () => ({ text: 'the stand-in wake', kind: 'notification', fromName: 'Stand-in' }), fell: () => true, cancelled: () => { }, held: () => held };
    const R1 = rig(`held1a-restart-${tag}`, { DELIVER: DL, shared: c });
    R1.deliver.registerOwedWake('stand-in', hooks);
    R1.deliver.parkOwedWake(B, { producer: 'stand-in', key: 'k-r', retryInMs: 1000, spendReason: 'stand-in', sender: 'owner', reason: 'paced', meta: { k: 'r' } });
    await R1.at(30 * 60e3);
    R1.close();
    c.timers.length = 0;
    c.now = T0 + 90 * 60e3;   // an hour down
    const R2 = rig(`held1a-restart-${tag}-2`, { DELIVER: DL, shared: c, dir: R1.dataDir });
    R2.deliver.registerOwedWake('stand-in', hooks);
    await R2.advanceTo(T0 + 3 * 3600e3);
    const during = { posts: R2.posts.length, owed: R2.owed(B).length };
    held = false;
    await R2.advanceTo(T0 + 3 * 3600e3 + 15 * 60e3);
    const out = { during, posts: R2.posts.length, owed: R2.owed(B).length, wentBack: R2.logs.filter((l) => /the clock went back/.test(l)).length };
    R2.close();
    return out;
  };
  const rs = await restartRun(DELIVER0, 'head');
  console.log(`    facts: a hold across a restart ${JSON.stringify(rs)}`);
  ok(rs.during.posts === 0 && rs.during.owed === 1 && rs.posts === 1 && rs.owed === 0 && rs.wentBack === 0, 'B-f276 1a: a hold ACROSS A RESTART — never posted while held, posted ONCE at the lift, and no false «the clock went back» (the hold credited from the boot)', JSON.stringify(rs));
  const rsx = await restartRun(MH.load('src/server/conversation-deliver.js', anchored(DSRC, 'at - Math.max(Number(e.waitsHeld && e.waitsHeld.since) || at, parkBootAt));', 'at - (Number(e.waitsHeld && e.waitsHeld.since) || at));', 'the downtime credited twice'), 'restart-double-credit'), 'cut');
  ok(rsx.wentBack > 0, 'B-f276 1a RESTART CONTROL (the downtime credited twice, in a copy): the bound clock lands in the future — a false «the clock went back» — red', JSON.stringify(rsx));

  const swRun = async (DL, tag) => {
    const R = rig(`held1a-sw-${tag}`, { DELIVER: DL });
    let held = true;
    R.deliver.registerStashGate((cid, e) => (held && e && e.ref === 'rcpt-1' ? { keep: true } : null));
    R.deliver.stashFor(B, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'the kept receipt', ref: 'rcpt-1', about: { keys: ['held/c1'] } });
    R.deliver.parkOwedWake(B, { producer: 'stash-wake', key: 'rcpt-1', retryInMs: 1000, spendReason: 'stand-in', sender: 'owner', reason: 'paced', meta: { ref: 'rcpt-1' } });
    await R.at(2 * 3600e3);
    const during = { posts: R.posts.length, owed: R.owed(B).length };
    held = false;
    await R.at(2 * 3600e3 + 15 * 60e3);
    const out = { during, posts: R.posts.length, owed: R.owed(B).length };
    R.close();
    return out;
  };
  const sw = await swRun(DELIVER0, 'head');
  console.log(`    facts: the stash wake over a kept receipt ${JSON.stringify(sw)}`);
  ok(sw.during.posts === 0 && sw.during.owed === 1 && sw.posts === 1 && sw.owed === 0, 'B-f276 1b (the 1a round\'s should): the STASH WAKE over a receipt the gate keeps — never rendered, claimed, fallen or cancelled while kept; posted ONCE when the gate lets it out', JSON.stringify(sw));
  const swx = await swRun(MH.load('src/server/conversation-deliver.js', anchored(DSRC, "    held(cid, e) { const ref = e && e.meta && e.meta.ref; if (!ref || stashEntries(cid).some((x) => x && x.ref === ref)) return false; if (isHeld() && !(stash[cid] || []).some((x) => x && x.ref === ref)) return true;   /* r3663 (2): its entry may wait in the unread list — unknown is held, never «carried» */ return (stash[cid] || []).some((x) => x && x.ref === ref && isKept(cid, x)); },\n", '', 'the stash wake without its hook'), 'stash-wake-no-hook'), 'cut');
  ok(swx.posts === 0, 'B-f276 1b STASH-WAKE CONTROL (the stash wake without its held hook, in a copy): its render finds no receipt and CANCELS the wake while the receipt is kept — nothing goes at the lift — red', JSON.stringify(swx));

  // THE PARK'S CAP (the read's must 1): the door first — a held wake is never the victim, the cap's loop ends
  const capRun = async (DL, tag) => {
    let held = true;
    const R = rig(`held1a-cap-${tag}`, { DELIVER: DL });
    const fellH = [], fellN = [];
    R.deliver.registerOwedWake('stand-in-held', { render: () => ({ text: 'held words', kind: 'notification', fromName: 'Stand-in' }), fell: () => { fellH.push(1); return true; }, cancelled: () => { }, held: () => held });
    R.deliver.registerOwedWake('stand-in-free', { render: () => ({ text: 'free words', kind: 'notification', fromName: 'Stand-in' }), fell: () => { fellN.push(1); return true; }, cancelled: () => { } });
    R.deliver.parkOwedWake(B, { producer: 'stand-in-held', key: 'h-1', retryInMs: 600e3, spendReason: 'stand-in', sender: 'owner', reason: 'paced', meta: { k: 'h' } });
    for (let i = 0; i < R.deliver.RETRY_CAP; i++) R.deliver.parkOwedWake(B, { producer: 'stand-in-free', key: `n-${i}`, retryInMs: 600e3, spendReason: 'stand-in', sender: 'owner', reason: 'paced', meta: { k: i } });
    const out = { cap: R.deliver.RETRY_CAP, owed: R.owed(B).length, heldStays: R.owed(B).some((e) => e.producer === 'stand-in-held'), fellHeld: fellH.length, fellFree: fellN.length };
    R.close();
    return out;
  };
  const cp = await capRun(DELIVER0, 'head');
  console.log(`    facts: the park's cap with a held oldest wake ${JSON.stringify(cp)}`);
  ok(cp.heldStays && cp.fellHeld === 0 && cp.fellFree === 1 && cp.owed === cp.cap, 'B-f276 1a (the read\'s must 1): at the park\'s cap the held OLDEST wake is never the victim — the oldest NOT held falls (once), the loop ends', JSON.stringify(cp));
  const cpx = await capRun(NO_DOOR, 'cut');
  ok(cpx.fellHeld === 1 && !cpx.heldStays, 'B-f276 1a CAP CONTROL (the door never asks): the cap falls the held wake over its producer\'s held file — red', JSON.stringify(cpx));

  // A WAKE OWED TO AN ENDED CONVERSATION (the read's must 5): its producers are asked too — no resume (a billed turn) while held
  const endedRun = async (DL, tag) => {
    let held = true;
    const R = rig(`held1a-ended-${tag}`, { DELIVER: DL, peerOf: () => null });
    everyoneStopped(R, A);
    R.deliver.registerOwedWake('stand-in', { render: () => null, cancelled: () => { }, held: () => held });
    const line = [];
    R.deliver.registerEndedWake(async (cid) => { line.push(cid); return { outcome: 'delivered' }; });
    const p = R.deliver.parkEndedWake(B, { producer: 'stand-in', spendReason: 'stand-in', reason: 'done' });
    await R.at(3 * 3600e3);
    const during = { parked: !!(p && p.parked), line: line.length, owed: R.deliver.endedEntries(B).length };
    held = false;
    await R.at(3 * 3600e3 + 5 * 60e3);
    const after = { line: line.length, owed: R.deliver.endedEntries(B).length };
    R.close();
    return { during, after };
  };
  const en = await endedRun(DELIVER0, 'head');
  console.log(`    facts: an ended wake of a held producer ${JSON.stringify(en)}`);
  ok(en.during.parked && en.during.line === 0 && en.during.owed === 1, 'B-f276 1a (the read\'s must 5): a wake owed to an ENDED conversation whose producer is held — never handed to the resume line (no resume, no billed turn) over three hours; still owed', JSON.stringify(en.during));
  ok(en.after.line === 1 && en.after.owed === 0, 'B-f276 1a: …the lift: handed to the line ONCE', JSON.stringify(en.after));
  // r809 (1): ONE ended wake, TWO producers — A held (or its hook throwing), B not: the resume goes ahead for B (never held whole)
  const twoRun = async (DL, tag, { throws = false } = {}) => {
    let held = true;
    const R = rig(`held1a-two-${tag}`, { DELIVER: DL, peerOf: () => null });
    everyoneStopped(R, A);
    R.deliver.registerOwedWake('stand-in-a', { render: () => null, cancelled: () => { }, held: () => { if (throws) throw new Error('its store could not be read'); return held; } });
    R.deliver.registerOwedWake('stand-in-b', { render: () => null, cancelled: () => { }, held: () => false });
    const line = [];
    R.deliver.registerEndedWake(async (cid) => { line.push(cid); return { outcome: 'delivered' }; });
    R.deliver.parkEndedWake(B, { producer: 'stand-in-a', spendReason: 'stand-in', reason: 'a' });
    R.deliver.parkEndedWake(B, { producer: 'stand-in-b', spendReason: 'stand-in', reason: 'b' });   // the same wake: its producers merged
    await R.at(30 * 60e3);
    const out = { line: line.length, owed: R.deliver.endedEntries(B).length, producers: (R.deliver.endedEntries(B)[0] || {}).producers || null };
    R.close();
    return out;
  };
  const tw = await twoRun(DELIVER0, 'head'), tt = await twoRun(DELIVER0, 'throws', { throws: true });
  console.log(`    facts: one ended wake, two producers ${JSON.stringify({ held: tw, throws: tt })}`);
  ok(tw.line === 1 && tw.owed === 0 && tt.line === 1 && tt.owed === 0, 'B-f276 1b (主开发 r809 (1)): ONE ended wake, producer A held (or its hook THROWING), producer B not — the resume goes ahead for B, once', JSON.stringify({ tw, tt }));
  const twx = await twoRun(MH.load('src/server/conversation-deliver.js', anchored(DSRC, '    if (first && (!isEnded(e) || every)) return first;', '    if (first) return first;', 'any producer held holds the whole wake'), 'two-any-held'), 'cut');
  ok(twx.line === 0 && twx.owed === 1, 'B-f276 1b TWO-PRODUCERS CONTROL (any producer held holds the whole ended wake, as 1a): B\'s delivery never resumes it while A is held — red', JSON.stringify(twx));
  // a held() that answers a PROMISE (an async hook): unknown is held, said BY NAME (never a silent hold for ever)
  const pr = await (async () => {
    const R = rig('held1a-promise', { DELIVER: DELIVER0 });
    R.deliver.registerOwedWake('stand-in-async', { render: () => ({ text: 'w', kind: 'notification', fromName: 'S' }), fell: () => true, cancelled: () => { }, held: async () => false });
    R.deliver.parkOwedWake(B, { producer: 'stand-in-async', key: 'k-p', retryInMs: 1000, spendReason: 'stand-in', sender: 'owner', reason: 'paced', meta: { k: 'p' } });
    await R.at(10 * 60e3);
    const out = { posts: R.posts.length, said: R.logs.filter((l) => /answered held\(\) with a promise/.test(l)).length };
    R.close();
    return out;
  })();
  ok(pr.posts === 0 && pr.said === 1, 'B-f276 1b: a held() that answers a PROMISE is unknown = held — no post, said ONCE by name (never a truthy promise held for ever unsaid)', JSON.stringify(pr));
  // the boot window (the 1a round's should): an ENDED wake marked held by a producer that is NOT registered yet at the next start stays
  // aside for the boot's hour — never resumed before its producer can say; it registers (not held) ⇒ resumed once
  const bootRun = async (DL, tag) => {
    const c = { now: T0, timers: [] };
    let held = true;
    const R1 = rig(`held1a-boot-${tag}`, { DELIVER: DL, shared: c, peerOf: () => null });
    everyoneStopped(R1, A);
    R1.deliver.registerOwedWake('stand-in-late', { render: () => null, cancelled: () => { }, held: () => held });
    R1.deliver.registerEndedWake(async () => ({ outcome: 'delivered' }));
    R1.deliver.parkEndedWake(B, { producer: 'stand-in-late', spendReason: 'stand-in', reason: 'late' });
    await R1.at(5 * 60e3);
    R1.close(); c.timers.length = 0; c.now = T0 + 10 * 60e3;
    const R2 = rig(`held1a-boot-${tag}-2`, { DELIVER: DL, shared: c, dir: R1.dataDir, peerOf: () => null });
    everyoneStopped(R2, A);
    const line = [];
    R2.deliver.registerEndedWake(async (cid) => { line.push(cid); return { outcome: 'delivered' }; });   // the line comes up FIRST, its producer later
    await R2.advanceTo(T0 + 40 * 60e3);
    const before = line.length;
    held = false;
    R2.deliver.registerOwedWake('stand-in-late', { render: () => null, cancelled: () => { }, held: () => held });
    await R2.advanceTo(T0 + 45 * 60e3);
    const out = { before, after: line.length };
    R2.close();
    return out;
  };
  const bt = await bootRun(DELIVER0, 'head');
  ok(bt.before === 0 && bt.after === 1, 'B-f276 1b (the 1a round\'s should): at a start whose producer is NOT registered yet, its held ended wake stays aside (never resumed before it can say) — it registers, not held: resumed ONCE', JSON.stringify(bt));
  const btx = await bootRun(MH.load('src/server/conversation-deliver.js', anchored(DSRC, "      if ((e.waitsHeld.by && !owedProducers.has(e.waitsHeld.by)) || (e.waitsHeld.pace && typeof wakePacer !== 'function')) {", '      if (false) {', 'the boot window cut'), 'boot-window-cut'), 'cut');
  ok(btx.before > 0, 'B-f276 1b BOOT-WINDOW CONTROL (the mark lifts at once at the start, in a copy): the ended wake is resumed before its producer can say — red', JSON.stringify(btx));
  // B-f276 1c (主开发 r809 (2)): a mark the PACE said (its file held) survives a restart and stays until the pacer registers — never a
  // wake posted unpaced in the boot's window (the deliverer answers «no pacer» as no pace at all)
  const paceBootRun = async (DL, tag) => {
    const c = { now: T0, timers: [] };
    const stand = () => ({ render: () => ({ text: 'the paced wake', kind: 'notification', fromName: 'Stand-in' }), fell: () => true, cancelled: () => { } });
    const pacerOf = (held) => { const p = () => { const m = () => true; m.force = () => ({ ok: true }); m.refund = () => { }; return m; }; p.held = () => held; return p; };
    const R1 = rig(`held1c-paceboot-${tag}`, { DELIVER: DL, shared: c });
    R1.deliver.registerWakePacer(pacerOf(true));
    R1.deliver.registerOwedWake('stand-in-pace', stand());
    R1.deliver.parkOwedWake(B, { producer: 'stand-in-pace', key: 'k-pb', retryInMs: 1000, spendReason: 'stand-in', kind: 'notification', fromName: 'Stand-in', sender: A, reason: 'paced', meta: { k: 4 } });
    await R1.at(5 * 60e3);
    const marked = !!(R1.owed(B)[0] && R1.owed(B)[0].waitsHeld && R1.owed(B)[0].waitsHeld.pace);
    R1.close(); c.timers.length = 0; c.now = T0 + 10 * 60e3;
    const R2 = rig(`held1c-paceboot-${tag}-2`, { DELIVER: DL, shared: c, dir: R1.dataDir, GE: { create: () => ({ stop() { } }) } });   // no groups engine yet: no pacer registered (the window)
    R2.deliver.registerOwedWake('stand-in-pace', stand());   // the producer comes up FIRST, the pacer later
    await R2.advanceTo(T0 + 40 * 60e3);
    const before = R2.posts.length;
    R2.deliver.registerWakePacer(pacerOf(false));
    await R2.advanceTo(T0 + 45 * 60e3);
    const out = { marked, before, after: R2.posts.length };
    R2.close();
    return out;
  };
  const pb = await paceBootRun(DELIVER0, 'head');
  ok(pb.marked && pb.before === 0 && pb.after === 1, 'B-f276 1c (r809 (2)): a wake the PACE held survives a restart marked so, and stays aside until the pacer registers (never posted unpaced) — it registers, its file read: posted ONCE', JSON.stringify(pb));
  const pbx = await paceBootRun(MH.load('src/server/conversation-deliver.js', anchored(DSRC, "      if ((e.waitsHeld.by && !owedProducers.has(e.waitsHeld.by)) || (e.waitsHeld.pace && typeof wakePacer !== 'function')) {", '      if (e.waitsHeld.by && !owedProducers.has(e.waitsHeld.by)) {', 'the pace mark lifts at the start'), 'pace-boot-cut'), 'cut');   // stale-pins: kept — the cut's own text (the 1b form)
  ok(pbx.before > 0, 'B-f276 1c (r809 (2)) CONTROL (a pace mark lifts at the start, the 1b form): the wake is posted before its pacer can say — red', JSON.stringify(pbx));
  const enx = await endedRun(NO_DOOR, 'cut');
  ok(enx.during.line > 0, 'B-f276 1a ENDED CONTROL (the door never asks): the ended wake goes to the resume line over the held file — red', JSON.stringify(enx.during));
  const enl = await endedRun(NO_LIFT, 'nolift');
  ok(enl.after.line === 0 && enl.after.owed === 1, 'B-f276 1a ENDED LIFT CONTROL (a door that never lifts): never handed to the line after the lift — red', JSON.stringify(enl.after));

  // THE BOUND'S FORCE (the read's must 2 + its should): a pacer that REFUSES the force is no force — nothing is posted, and the wake
  // waits the pacer's own time (never re-forced every 30 s at a bound already passed, never a pace refusal)
  const forceRun = async (DL, tag, { forceWait = 600e3 } = {}) => {
    const R = rig(`held1a-force-${tag}`, { DELIVER: DL });
    let forced = 0;
    R.deliver.registerWakePacer(() => { const m = () => ({ reason: 'paced', why: 'a floor', rule: 'pace', retryInMs: 600e3 }); m.force = () => { forced++; return { ok: false, reason: 'paused', why: 'the pace file is held', retryInMs: forceWait }; }; m.refund = () => { }; return m; });
    R.deliver.registerOwedWake('stand-in-force', { render: () => ({ text: 'the forced wake', kind: 'notification', fromName: 'Stand-in' }), fell: () => true, cancelled: () => { } });
    R.deliver.parkOwedWake(B, { producer: 'stand-in-force', key: 'k-f', retryInMs: 1000, spendReason: 'stand-in', kind: 'notification', fromName: 'Stand-in', sender: A, reason: 'paced', meta: { k: 2 } });
    const fileNow = () => { try { return fs.readFileSync(path.join(R.dataDir, 'msg-retry.json'), 'utf8'); } catch { return null; } };
    await R.at(1.5 * 3600e3);
    const bytes = fileNow();
    await R.at(3 * 3600e3);
    const e = R.owed(B)[0] || null;
    const out = { forced, posts: R.posts.length, owed: R.owed(B).length, paceRefusals: e ? Number(e.paceRefusals) || 0 : null, belted: R.logs.filter((l) => /still due after the sweep/.test(l)).length, said: R.logs.filter((l) => /the pacer refused the force/.test(l)).length, wentBack: R.logs.filter((l) => /the clock went back/.test(l)).length, bytesSame: bytes !== null && fileNow() === bytes };
    R.close();
    return out;
  };
  const fr = await forceRun(DELIVER0, 'head');
  console.log(`    facts: a refused force over three hours ${JSON.stringify(fr)}`);
  ok(fr.forced > 0 && fr.posts === 0 && fr.owed === 1, 'B-f276 1a (the read\'s must 2): at the bound the force is asked and the pacer REFUSES it — nothing is posted (no billed turn over a held pace file)', JSON.stringify(fr));
  ok(fr.forced <= 18 && fr.belted === 0 && fr.said === 1, 'B-f276 1a (the reads\' must 2): …it waits the pacer\'s own 10 minutes between forces (≤ 18 in three hours), never the belt\'s 30 s — and the refusal is SAID ONCE (asked again in memory)', JSON.stringify(fr));
  const paceHeldRun = async (DL, tag) => {
    const R = rig(`held1a-pace-${tag}`, { DELIVER: DL });
    let asked = 0, forced = 0, held = true;
    const pacer = () => { const m = () => { asked++; return true; }; m.force = () => { forced++; return { ok: true }; }; m.refund = () => { }; return m; };
    pacer.held = () => held;
    R.deliver.registerWakePacer(pacer);
    R.deliver.registerOwedWake('stand-in-pace', { render: () => ({ text: 'the paced wake', kind: 'notification', fromName: 'Stand-in' }), fell: () => true, cancelled: () => { } });
    R.deliver.parkOwedWake(B, { producer: 'stand-in-pace', key: 'k-p', retryInMs: 1000, spendReason: 'stand-in', kind: 'notification', fromName: 'Stand-in', sender: A, reason: 'paced', meta: { k: 3 } });
    await R.at(3 * 3600e3);
    const during = { asked, forced, posts: R.posts.length, owed: R.owed(B).length };
    held = false;
    await R.at(3 * 3600e3 + 15 * 60e3);
    const after = { posts: R.posts.length, owed: R.owed(B).length };
    R.close();
    return { during, after };
  };
  const ph = await paceHeldRun(DELIVER0, 'head');
  console.log(`    facts: the pace's own file held ${JSON.stringify(ph)}`);
  ok(ph.during.asked === 0 && ph.during.forced === 0 && ph.during.posts === 0 && ph.during.owed === 1, 'B-f276 1a: the PACE\'s own file held (registerWakePacer\'s held) — three hours past the bound: no pace asked, no force, nothing posted; still owed', JSON.stringify(ph.during));
  ok(ph.after.posts === 1 && ph.after.owed === 0, 'B-f276 1a: …the pace reads again: posted ONCE', JSON.stringify(ph.after));
  const phx = await paceHeldRun(MH.load('src/server/conversation-deliver.js', anchored(DSRC, "    if (isOwed(e) && wakePacer && typeof wakePacer.held === 'function') {", "    if (false) {", 'the door never asks the pace'), 'pace-never-asked'), 'cut');
  ok(phx.during.forced > 0 || phx.during.posts > 0, 'B-f276 1a PACE CONTROL (the door never asks the pace, in a copy): the wake is forced past its bound over the held pace file — red', JSON.stringify(phx.during));
  const fl = await forceRun(DELIVER0, 'long', { forceWait: 700e3 });
  ok(fl.posts === 0 && fl.said === 1 && fl.wentBack === 0 && fl.bytesSame && fl.forced >= 12 && fl.forced <= 13, 'B-f276 1a (the fifth read\'s must): a pacer that asks for MORE than the longest step (700 s) — asked again at the 10-min step (12–13 forces in the two hours past the bound), no «the clock went back» line, msg-retry.json byte-identical from 1.5 h to 3 h', JSON.stringify(fl));
  const fso = await forceRun(MH.load('src/server/conversation-deliver.js', anchored(DSRC, '            const first = all.filter((e) => !e.forceRefusedAt);', '            const first = all;', 'said at every refusal'), 'force-said-every'), 'said-every');
  ok(fso.said > 1, 'B-f276 1b SAID-ONCE CONTROL (the refusal said at every ask, in a copy): the line and the write come at every refused force — red', JSON.stringify(fso));
  const flx = await forceRun(MH.load('src/server/conversation-deliver.js', anchored(DSRC, '            const step = Math.min(wait, RETRY_STEPS_MS[RETRY_STEPS_MS.length - 1]);', '            const step = wait;', 'the pacer\'s time unbounded'), 'force-step-unbounded'), 'long-cut', { forceWait: 700e3 });
  ok(flx.wentBack > 0 || !flx.bytesSame, 'B-f276 1a FORCE-STEP CONTROL (the pacer\'s time unbounded, in a copy): repairClock pulls it back — a write and a false «clock went back» line each ask — red', JSON.stringify(flx));
  const cf = await forceRun(MH.load('src/server/conversation-deliver.js', anchored(DSRC, "if (fr && typeof fr === 'object' && fr.ok === false) return { ok: false, forceRefused: true,", 'if (false) return { ok: false, forceRefused: true,', 'the force answer ignored'), 'force-answer-ignored'), 'cut');
  ok(cf.posts > 0, 'B-f276 1a FORCE CONTROL (the force\'s answer ignored, as before): the wake is posted past a refused force — a billed turn — red', JSON.stringify(cf));
  const cc = await forceRun(MH.load('src/server/conversation-deliver.js', anchored(DSRC, '          if (p.forceRefused) {\n', '          if (false) {\n', 'the refused force clamped to the bound'), 'force-clamped'), 'clamp');
  ok(cc.forced > 18 || cc.belted > 0, 'B-f276 1a FORCE CONTROL (the refused force clamped to the passed bound, as shape A): re-forced on the belt\'s 30 s — red', JSON.stringify(cc));
});

await leg(149, async () => {
  // B-f276 1c FOLLOW (its round whfrsuwsp lens 3, 主开发 r1588 (1) — MONEY): a GROUP's wake parked while groups.json is held, the hold
  // lifted, is posted EXACTLY ONCE — never dropped, never twice (the real groups engine over its real store: the hold read off the file)
  const DSRC1 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
  const liftRun = async (DL, tag, { GE = GE0 } = {}) => {   // GE: the restarted hub's groups engine (its round wy3zr6ym5's control)
    const c = { now: T0, timers: [] };
    const R1 = rig(`held1c-glift-${tag}`, { shared: c, DELIVER: DL });
    const g = await R1.group('lift', A, [B]);
    await R1.at(100); await R1.say(g, A, '@beta one');   // woken at once
    await R1.at(5100); await R1.say(g, A, '@beta two');  // inside the pace: parked
    const parked = R1.owed(B).length;
    R1.close(); c.timers.length = 0;
    const gj = path.join(R1.dataDir, 'channels', 'groups.json');
    const good = fs.readFileSync(gj, 'utf8');
    fs.rmSync(gj); fs.mkdirSync(gj); fs.writeFileSync(path.join(gj, 'x'), 'x');   // the read of groups.json fails (EISDIR): held
    const R2 = rig(`held1c-glift-${tag}-2`, { shared: c, dir: R1.dataDir, DELIVER: DL, GE, heldRetry: { firstMs: 5, maxMs: 10 } });
    await R2.advanceTo(T0 + 40 * 60e3);   // far past the pace: held, so never posted, never fallen
    const during = { posts: R2.posts.length, owed: R2.owed(B).length, paused: !!R2.eng.pausedState() };
    fs.rmSync(gj, { recursive: true, force: true }); fs.writeFileSync(gj, good);
    let read = false; R2.store.whenRead(['groups.json'], () => { read = true; });
    const end = Date.now() + 5000; while (!read && Date.now() < end) await sleep(5);   // the bound is a red line, never the wait
    await R2.advanceTo(T0 + 80 * 60e3);
    const after = { read, posts: R2.posts.length, carried: R2.posts.filter((p) => /two/.test(p.text)).length, owed: R2.owed(B).length };
    await R2.advanceTo(T0 + 200 * 60e3);
    const later = R2.posts.length;
    R2.close();
    return { parked, during, after, later };
  };
  const gl = await liftRun(DELIVER0, 'head');
  ok(gl.parked === 1 && gl.during.posts === 0 && gl.during.owed === 1 && gl.during.paused, 'B-f276 1c follow (r1588 (1)): a group wake parked, then groups.json held across a restart — never posted while held, never fallen (still owed)', JSON.stringify(gl));
  ok(gl.after.read && gl.after.posts === 1 && gl.after.carried === 1 && gl.after.owed === 0 && gl.later === 1, 'B-f276 1c follow (r1588 (1)) MONEY: the hold lifts — the wake is posted EXACTLY ONCE (never dropped, never twice)', JSON.stringify(gl));
  const MHF = mutantCopies('paced-held-1cf', REPO);
  const glx = await liftRun(MHF.load('src/server/conversation-deliver.js', anchored(DSRC1, '      if (!e.waitsHeld) continue;\n', '      continue;\n', 'the door never lifts'), 'door-never-lifts-f'), 'cut');
  ok(glx.after.posts === 0, 'B-f276 1c follow (r1588 (1)) CONTROL (the door never lifts, in a copy): the wake is never posted after the lift (dropped) — red', JSON.stringify(glx));
  // its round wp3niroz5 (4): THE BILLED WAKE, NEVER TWICE — a copy whose lift road sends the wake's post twice (the lift and a retry meeting)
  const glt = await liftRun(MHF.load('src/server/conversation-deliver.js', anchored(DSRC1, '    try { r = await peerMsg.postToPeer(peer, frame.text); } catch (err) {', '    try { await peerMsg.postToPeer(peer, frame.text); r = await peerMsg.postToPeer(peer, frame.text); } catch (err) {', 'the lift road posts twice'), 'door-posts-twice'), 'twice');
  ok(glt.after.posts > 1 || glt.later > 1, 'its round wp3niroz5 (4) CONTROL (the lift road posts the wake twice, in a copy): the BILLED wake is posted twice and the leg\'s «exactly once» goes red — red', JSON.stringify(glt));
  // its round wy3zr6ym5 (主开发 r2285 (2)): THE MARK, CUT — the posted wake KEPT in the park after the lift. Alone it still posts once: the
  // landing moved the member's report marker, so the next pass's render answers «carried» (no post). Two marks in series, so the copy
  // cuts both: the wake kept, its marker not moved at the landing — the next pass posts the BILLED wake again
  const GSRC1 = fs.readFileSync(path.join(REPO, 'src/server/groups-engine.js'), 'utf8');
  const gkx = await liftRun(MHF.load('src/server/conversation-deliver.js', anchored(DSRC1, 'e.charged = null; e.retries = e.attempts.length; removeRetry(e); }', 'e.charged = null; e.retries = e.attempts.length; }', 'the posted wake kept in the park'), 'kept-in-park'), 'kept-cut', { GE: MHF.load('src/server/groups-engine.js', anchored(GSRC1, '        await markReported(gid, cid, rep.upTo);\n', '', 'the landing moves no marker'), 'landing-no-marker') });
  ok(gkx.after.posts > 1 || gkx.later > 1, 'its round wy3zr6ym5 (r2285 (2)) CONTROL (THE POSTED WAKE KEPT after the lift, its report\'s marker not moved at the landing, in a copy): the next pass posts the BILLED wake again — red', JSON.stringify(gkx));
});


CK.report();
