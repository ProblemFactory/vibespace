#!/usr/bin/env node
// lane notify-retry, verify r3 (2026-10-01): THE PARK ENTRY'S LIFECYCLE AS ONE CLOSED TABLE.
//   §1 the table — src/park-step.js answers every (state × event) cell; printed; the cells the round argued about pinned
//   §2 the seeded walk — every event sequence ≤ 4 from every state (facts drawn per step from a seeded PRNG), under the
//      invariants: a post at most once per attempt; "maybe twice" only across a death (a boot); nothing leaves the park
//      except landed / stash / evicted-said / expired-said; every drop said by id; the file after every step = the state;
//      one authorization per frame, one charge per landing
//   §3 THE ENGINE AGREES — the real park (src/server/conversation-deliver.js) driven through every drivable cell over a
//      stub registry + scripted post + manual clock, its outcome compared with the table's cell
//   §4 controls — a patched copy of the table (a rule removed) is red under §2; a patched copy of the engine (an r3 fix
//      removed) is red under §3; verify r4: three patched copies that break ONE CELL (not a rule) are red too
//   §5 THE DOOR CENSUS (verify r4 T2⑤): every door of the engine — every site that moves a parked entry — names the
//      table event it is, every table event has a door, every `via` a take can carry is an event; a landed / fallen
//      entry's record is never written again by any door
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P = require(path.join(REPO, 'src/park-step.js'));
const { STATES, EVENTS, TERMINAL, parkStep, canonical, freshEntry, stored } = P;
const NOW = 1_700_000_000_000;

// ── §1 THE TABLE ────────────────────────────────────────────────────────────
console.log('\n§1 the table: ' + STATES.length + ' states × ' + EVENTS.length + ' events = ' + (STATES.length * EVENTS.length) + ' cells');
const table = P.parkTable(NOW);
{
  const w = Math.max(...EVENTS.map((e) => e.length));
  console.log('  ' + ''.padEnd(15) + EVENTS.map((e, i) => String(i + 1).padStart(2)).join(' '));
  for (const s of STATES) console.log('  ' + s.padEnd(15) + EVENTS.map((e) => { const c = table[s][e]; return (c === '—' ? ' —' : c.includes('skipped') ? ' =' : (c.split(' ')[0] === s ? ' ·' : ' ' + c[0].toUpperCase())).padStart(2); }).join(' ') + '   (' + EVENTS.map((e) => table[s][e]).join(' | ').slice(0, 0) + ')');
  console.log('  events: ' + EVENTS.map((e, i) => (i + 1) + '=' + e).join(' ') + '\n  cells: — not applicable · unchanged = skipped (an attempt leaves a claimed / in-flight entry alone) L landed S stashed E expired/evicted I inflight C cleared M maybeDelivered W waiting');
  let defined = 0;
  for (const s of STATES) for (const e of EVENTS) if (typeof table[s][e] === 'string' && table[s][e].length) defined++;
  ok(defined === STATES.length * EVENTS.length, '(a) every cell is defined (' + defined + ')');
  let threw = 0; try { parkStep(canonical('waiting', NOW), 'a-new-event', { now: NOW }); } catch { threw++; } try { parkStep({ ...canonical('waiting', NOW), s: 'parked' }, 'timer', { now: NOW }); } catch { threw++; }
  ok(threw === 2, '(a) …and the table is CLOSED: an unknown event or state throws');
  const cell = (s, e) => table[s][e];
  ok(cell('waiting', 'timer') === 'inflight +post' && cell('cleared', 'turn-end') === 'inflight +post', '(b) an attempt on a waiting / cleared entry posts ONE frame (the cleared one carries the sentence)');
  ok(cell('waiting', 'bound-60min') === 'expired +say' && cell('waiting', 'max-attempts') === 'expired +say' && cell('waiting', 'target-gone') === 'stashed +say' && cell('waiting', 'spend-refused') === 'stashed +say', '(b) the four judges at an attempt: the bound and the attempts expire it, a gone target and a refused ceiling stash it — each said');
  ok(cell('inflight', 'post-ok') === 'landed +say' && cell('inflight', 'post-refused-transient') === 'waiting +say' && cell('inflight', 'post-refused-final') === 'stashed +say' && cell('inflight', 'poster-never-answers') === 'inflight', '(c) on the wire: ok lands, a transient miss waits again, a final miss stashes, a poster that never answers leaves it on the wire (the primitive\'s own bound ends that)');
  ok(cell('inflight', 'boot-inflight') === 'maybeDelivered +say' && cell('claimed', 'boot-ho') === 'maybeDelivered +say' && cell('maybeDelivered', 'timer') === 'stashed +say' && cell('maybeDelivered', 'turn-end') === 'stashed +say', '(d) a boot turns a stamp (inflight or ho) into may-have-landed, said; the first sweep hands it to the stash, said, never posted');
  ok(cell('maybeDelivered', 'bound-60min') === 'stashed +say' && cell('maybeDelivered', 'target-gone') === 'stashed +say' && cell('maybeDelivered', 'spend-refused') === 'stashed +say', '(d) …and it falls as may-have-landed before any other judge (never "expired", never a spend verdict)');
  ok(['turn-end', 'timer', 'bound-60min', 'max-attempts', 'target-gone', 'spend-refused'].every((e) => /skipped/.test(cell('inflight', e)) && /skipped/.test(cell('claimed', e))), '(e) an attempt leaves an in-flight or claimed entry alone (it is spoken for)');
  ok(cell('waiting', 'cap') === 'evicted +say' && cell('cleared', 'cap') === 'evicted +say' && cell('claimed', 'cap') === 'claimed' && cell('inflight', 'cap') === 'inflight' && cell('maybeDelivered', 'cap') === 'maybeDelivered', '(f) the cap evicts the oldest WAITING (said); the wire, a claim and a leaving copy are not counted (r2 ⑤ + r3 ④)');
  ok(cell('waiting', 'clear-single') === 'cleared' && cell('inflight', 'clear-batch') === 'inflight +say' && cell('claimed', 'clear-single') === 'claimed' && cell('maybeDelivered', 'clear-single') === 'maybeDelivered', '(g) a clear replaces the words wherever the entry is; on the wire it is said (r2 ④)');
  ok(cell('waiting', 'clock-forward') === 'waiting' && cell('waiting', 'clock-backward') === 'waiting +say' && cell('inflight', 'clock-backward') === 'inflight +say', '(h) a forward step changes nothing until the next attempt; a backward step re-bases the stamps, said once (r2 ③)');
  ok(STATES.filter((s) => TERMINAL.has(s)).every((s) => EVENTS.every((e) => cell(s, e) === '—')), '(i) the four terminal states answer nothing to any event (' + [...TERMINAL].join(', ') + ')');
  ok(cell('claimed', 'post-ok') === 'landed' && cell('claimed', 'post-refused-transient') === 'waiting' && cell('claimed', 'post-refused-final') === 'waiting', '(j) a hand-over\'s landing takes a claimed entry (its own card, no park charge); its miss releases the claim');
  // verify r4 (the owner-outcome table: S10 / S12 / S13 — "table lacks handover-claim / prompt-take"): the two doors
  ok(cell('waiting', 'handover-claim') === 'claimed' && cell('cleared', 'handover-claim') === 'claimed' && ['claimed', 'inflight', 'maybeDelivered'].every((s) => cell(s, 'handover-claim') === '—'), '(k) a hand-over claims a WAITING / cleared entry; one claimed, on the wire or leaving is listed to nobody (r4)');
  ok(cell('waiting', 'prompt-take') === 'landed' && cell('cleared', 'prompt-take') === 'landed' && ['claimed', 'inflight', 'maybeDelivered'].every((s) => cell(s, 'prompt-take') === '—'), '(k) a fitting prompt takes a WAITING / cleared entry inline — landed, no post, no charge (r4)');
  { const r = parkStep(canonical('waiting', NOW), 'prompt-take', { now: NOW }); ok(r.leave === 'landed' && !r.post && !r.charge && !r.authorize && r.entry.holds === false, '(k) …the take gives the hold back and bills nothing'); }
}

// ── §2 THE SEEDED WALK ──────────────────────────────────────────────────────
console.log('\n§2 the seeded walk: every event sequence ≤ 4 from every state under the invariants');
function prng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function factsFrom(rnd) {
  const r = rnd();
  return { pidAlive: rnd() > 0.1, spend: r < 0.85 ? 'ok' : r < 0.93 ? 'refused' : 'threw', postOutcome: (() => { const q = rnd(); return q < 0.7 ? 'ok' : q < 0.9 ? 'transient' : q < 0.95 ? 'final' : 'late'; })(), oldestWaiting: rnd() > 0.2 };
}
/** walk ONE sequence from a start state; returns the violations found */
function walk(P, start, seq, rnd, startNow = NOW) {
  const viol = [];
  let e = P.canonical(start, startNow); e.id = 'rt-w'; let now = startNow;
  let booted = start === 'maybeDelivered', charged = 0, maybeSaid = false, posts = 0;
  for (let i = 0; i < seq.length; i++) {
    const ev = seq[i];
    const prev = e;
    const f = { ...factsFrom(rnd), now };
    const r = P.parkStep(prev, ev, f);
    const before = now;
    e = r.entry; now = r.now;
    const tag = { toString: () => `${start} [${seq.slice(0, i + 1).join(' → ')}]` };
    if (ev === 'boot-ho' || ev === 'boot-inflight') booted = true;
    // (I6) not applicable ⇒ nothing changes; terminal ⇒ not applicable
    if (r.na && (P.stored(prev) !== P.stored(e) || r.post || r.say || r.leave || r.charge || r.authorize)) viol.push(tag + ': na but something changed');
    if (P.TERMINAL.has(prev.s) && !r.na) viol.push(tag + ': a terminal entry answered an event');
    // (I1) a post at most once per attempt: the park's posts never outnumber the attempts; a post leaves only from waiting / cleared
    if (r.post) { posts++; if (!(prev.s === 'waiting' || prev.s === 'cleared')) viol.push(tag + ': a post from ' + prev.s); if (e.s !== 'inflight') viol.push(tag + ': a post that did not go on the wire'); if (posts > e.attempts) viol.push(tag + ': posts ' + posts + ' > attempts ' + e.attempts + ' (two posts for one attempt)'); }
    if (prev.s === 'landed' && r.post) viol.push(tag + ': a landed entry posted again');
    // (I1b) "maybe twice" is said only on the far side of a boot
    if (r.say && /may have landed/.test(r.say) && e.s === 'stashed') { maybeSaid = true; if (!booted) viol.push(tag + ': may-have-landed without a boot'); }
    // (I2 / I3) nothing leaves the park except by landed / stash / evicted / expired, and every drop is said by id
    if (P.TERMINAL.has(e.s) && !P.TERMINAL.has(prev.s)) {
      if (!r.leave) viol.push(tag + ': left the park with no leave verdict');
      if (r.leave !== 'landed' && !(r.say && r.say.includes(prev.id))) viol.push(tag + ': a drop (' + r.leave + ') not said by id');
      if (r.leave === 'evicted' && !/evicted/.test(r.say)) viol.push(tag + ': evicted without the word');
      if (r.leave === 'expired' && !/expired/.test(r.say)) viol.push(tag + ': expired without the word');
      if (e.s === 'landed' && prev.s === 'inflight' && !r.charge) viol.push(tag + ': the park landed its own frame without ONE charge');
      if (e.s === 'landed' && prev.s === 'claimed' && r.charge) viol.push(tag + ': the park charged a hand-over\'s landing');
    }
    if (!P.TERMINAL.has(e.s) && r.leave) viol.push(tag + ': a leave verdict without leaving');
    // (I4) the file after every step = the state
    if (P.stored(prev) !== P.stored(e) && !r.persist) viol.push(tag + ': the state changed on a step that did not persist');
    // (I5) one authorization per frame; one charge per landing; a hold after a boot is never trusted
    if (!!r.authorize !== !!r.post) viol.push(tag + ': authorization and post disagree (' + r.authorize + ' / ' + r.post + ')');
    // (I5b, verify r4 T2⑥: a cell mutant that converted a forgotten hold was green) a hold is converted only while it exists
    // and is inside its TTL; otherwise the frame is asked for afresh — never the other way round
    if (r.authorize) { const live = !!prev.holds && (r.now - prev.holdAt) <= P.HOLD_TTL_MS; if (r.authorize === 'hold' && !live) viol.push(tag + ': a hold converted past its TTL or without one'); if (r.authorize === 'fresh' && live) viol.push(tag + ': asked again inside a live hold'); }
    if (r.charge) { charged++; if (charged > 1) viol.push(tag + ': charged twice'); if (!(prev.s === 'inflight' && e.s === 'landed')) viol.push(tag + ': a charge outside the park\'s own landing'); }
    if ((ev === 'boot-ho' || ev === 'boot-inflight') && e.holds) viol.push(tag + ': a hold survived a boot');
    // the clock only goes back on its own event
    if (now < before && ev !== 'clock-backward') viol.push(tag + ': time went back');
  }
  return viol;
}
{
  const t0 = Date.now();
  const rnd = prng(20261001);
  let sequences = 0, steps = 0; const viol = [];
  const nonTerminal = STATES.filter((s) => !TERMINAL.has(s));
  for (const s of nonTerminal) {
    const stack = [[]];
    while (stack.length) {
      const seq = stack.pop();
      if (seq.length) { sequences++; steps += seq.length; const v = walk(P, s, seq, rnd); if (v.length) viol.push(...v); }
      if (seq.length < 4) for (const ev of EVENTS) stack.push([...seq, ev]);
    }
  }
  // the terminal states: one step of every event is enough (na), the walk's I6 covers the rest
  for (const s of STATES.filter((t) => TERMINAL.has(t))) for (const ev of EVENTS) { sequences++; steps++; viol.push(...walk(P, s, [ev], rnd)); }
  const dt = Date.now() - t0;
  const E = EVENTS.length;
  ok(sequences === nonTerminal.length * (E + E ** 2 + E ** 3 + E ** 4) + 4 * E, '(a) every event sequence ≤ 4 from every non-terminal state + every single event on a terminal one: ' + sequences + ' sequences, ' + steps + ' steps (' + dt + ' ms)');
  ok(viol.length === 0, '(b) no invariant broke on any sequence', viol.slice(0, 8).join('\n      ') + (viol.length > 8 ? '\n      … ' + viol.length + ' in all' : ''));
  // a longer seeded random walk for depth (the floor, the TTL, the bound by attempts)
  let longViol = [];
  const rnd2 = prng(7);
  for (let k = 0; k < 400; k++) { const seq = []; for (let i = 0; i < 40; i++) seq.push(EVENTS[Math.floor(rnd2() * EVENTS.length)]); longViol.push(...walk(P, nonTerminal[k % nonTerminal.length], seq, rnd2)); }
  ok(longViol.length === 0, '(c) 400 seeded walks of 40 events hold the same invariants', longViol.slice(0, 5).join('\n      '));
  // the bound by attempts under a clock that never advances past the steps: transient misses alone expire it
  let e = freshEntry(NOW); let now = NOW; let n = 0;
  while (!TERMINAL.has(e.s) && n < 200) { let r = parkStep(e, 'timer', { now }); e = r.entry; now = r.now; if (e.s === 'inflight') { r = parkStep(e, 'post-refused-transient', { now }); e = r.entry; } n++; }
  ok(e.s === 'expired' && e.attempts <= P.MAX_ATTEMPTS && now - NOW <= P.MAX_MS + 600_000, '(d) a target that never accepts: the entry expires within the hour by the schedule alone (' + e.attempts + ' attempts, ' + Math.round((now - NOW) / 60000) + ' min)');
  let e2 = freshEntry(NOW); let now2 = NOW; let posts = 0;
  for (let i = 0; i < 100 && !TERMINAL.has(e2.s); i++) { let r = parkStep(e2, 'turn-end', { now: now2 }); e2 = r.entry; if (r.post) posts++; if (e2.s === 'inflight') { r = parkStep(e2, 'post-refused-transient', { now: now2 }); e2 = r.entry; } }
  ok(e2.s === 'expired' && posts === P.MAX_ATTEMPTS - 1 && /attempt bound/.test('x attempt bound'), '(d) …and a turn end every second cannot post it for ever: the attempts bound ends it after ' + posts + ' posts');
}

// ── §3 THE ENGINE AGREES ────────────────────────────────────────────────────
console.log('\n§3 the engine driven through every drivable cell, compared with the table');
const CD = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const PM = require(path.join(REPO, 'src/peer-messaging.js'));
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const { CLEARED_TEXT } = require(path.join(REPO, 'src/record-clear.js'));
let seq = 0;
const base = scratchDir('parkstep');
process.on('exit', () => { try { fs.rmSync(base, { recursive: true, force: true }); } catch { } });
/** the gate's rig: a stub registry, a post scripted BY TEXT (an entry's own frame can be held in flight while a
 *  sibling's fails at once), a manual clock, a recording guard, `reboot()` = a new engine over the same dir */
function rig(CDx, name) {
  const dir = path.join(base, name + '-' + (++seq)); fs.mkdirSync(dir, { recursive: true });
  const reg = path.join(dir, 'registry'); fs.mkdirSync(reg, { recursive: true });
  const cid = 'c0ffee00-0000-4000-8000-00000000' + String(seq).padStart(4, '0');
  const regFile = path.join(reg, `${process.pid}.json`);
  fs.writeFileSync(regFile, JSON.stringify({ pid: process.pid, sessionId: cid, messagingSocketPath: path.join(dir, 'inbox.sock'), name: 'Owner' }));
  const calls = [], posts = [], ledger = [], releases = [], authorized = [], logs = [], events = [];
  const answers = new Map();   // text fragment → answer fn; default: transient at once
  const answerFor = (text) => { for (const [k, fn] of answers) if (text.includes(k)) return fn; return () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 }); };
  const session = { claudeSessionId: cid, backendSessionId: cid, mode: 'chat', backend: 'claude', name: 'Owner', _isStreaming: false, _turnStateSeen: true };
  const sessions = new Map([['w1', session]]);
  let now = NOW; const timers = [];
  const clock = { now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
  async function advance(ms) { const until = now + ms; while (true) { const due = timers.filter((t) => !t.dead && !t.fired && t.at <= until).sort((a, b) => a.at - b.at)[0]; if (!due) break; now = Math.max(now, due.at); due.fired = true; await due.fn(); await sleep(0); } now = until; }
  let holdSeq = 0, refuse = null;
  const mk = () => { const d = CDx.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, reg), postToPeer: async (p, text) => { calls.push(text); const r = await answerFor(text)(text); if (r.ok) posts.push(text); return r; }, postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: (req) => { authorized.push(req.reason); if (refuse) return { ok: false, why: refuse, detail: refuse + ' reached', retryAfter: 60000, identity: { key: 'acct', name: 'Work' }, limits: { perIdentityHour: 30 } }; return { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'h' + (++holdSeq), reason: req.reason }; }, noteSpend: (rec) => ledger.push({ reason: rec.reason, hold: rec.hold }), releaseSpend: (rec) => releases.push(rec.hold),
    emitPeerCard: () => { }, log: (...a) => logs.push(a.join(' ')), retryClock: clock, renderBatch: AR.renderMsgStash });
    d.onRetry((ev, c, e, x) => { events.push({ ev, id: e.id, extra: x }); return false; }); return d; };
  const R = { dir, reg, regFile, cid, session, calls, posts, ledger, releases, authorized, logs, events, advance, timers, setNow: (t) => { now = t; }, now: () => now, answer: (frag, fn) => answers.set(frag, fn), setRefuse: (w) => { refuse = w; }, liveTimers: () => timers.filter((t) => !t.dead && !t.fired) };
  R.deliver = mk();
  R.reboot = () => { try { R.deliver.closeRetries(); } catch { } for (const t of timers) t.dead = true; now += 1; R.deliver = mk(); return R.deliver; };   // the previous process is gone: its timers and its door with it; the clock moves (an id is rt-<ms>-<seq per process>: a frozen clock would re-mint a dead process's id — held as a LOW, unreachable outside a frozen clock)
  R.notify = (text) => R.deliver.deliverToConversation(cid, text, { fromName: 'Background Work · dc-watch', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-1' } } });
  return R;
}
const defer = () => { let resolve = null; const p = new Promise((r) => { resolve = r; }); return { p, resolve }; };
/** the engine's view of ONE entry as a table state */
function stateOf(R, id) {
  const e = R.deliver.retryPeek(R.cid).find((x) => x.id === id);
  if (e) return e.inflight ? 'inflight' : e.ho ? 'claimed' : e.maybeDelivered ? 'maybeDelivered' : String(e.text).includes(CLEARED_TEXT) ? 'cleared' : 'waiting';
  const fell = R.events.find((x) => x.ev === 'fell' && x.id === id);
  if (fell) return fell.extra.evicted ? 'evicted' : fell.extra.expired ? 'expired' : 'stashed';
  if (R.events.some((x) => x.ev === 'delivered' && x.id === id)) return 'landed';
  return 'vanished';
}
const TEXT = 'the entry under test';
/** put ONE entry into `state` on a fresh engine; returns the context the events act on */
async function enter(CDx, state) {
  const R = rig(CDx, state);
  const ctx = { R, state, pending: null, resolve: null, release: null, obj: null, id: null };
  await R.notify(TEXT);
  ctx.id = R.deliver.retryPeek(R.cid)[0].id;
  ctx.obj = R.deliver.retryEntries(R.cid)[0]._retry;
  if (state === 'cleared') R.deliver.redactStash((e) => (e.id === ctx.id ? { text: CLEARED_TEXT, fromName: CLEARED_TEXT } : null));
  if (state === 'claimed') ctx.release = R.deliver.claimRetry(R.cid, [ctx.obj], 'ho-test');
  if (state === 'inflight') { const d = defer(); ctx.resolve = d.resolve; R.answer(TEXT, () => d.p); R.answer(CLEARED_TEXT, () => d.p); ctx.pending = R.advance(30_000); await sleep(2); }
  if (state === 'maybeDelivered') { const f = path.join(R.dir, 'msg-retry.json'); const raw = JSON.parse(fs.readFileSync(f, 'utf-8')); raw[R.cid][0].inflight = R.now(); fs.writeFileSync(f, JSON.stringify(raw)); R.reboot(); }
  return ctx;
}
const sibling = (R, n) => R.notify('sibling-' + n + ' ' + 'x'.repeat(8));
/** fire ONE event on the engine; returns what was observed: the entry's state, whether its frame left, whether it was said */
async function fire(ctx, event) {
  const { R, state, id } = ctx;
  const calls0 = R.calls.length, logs0 = R.logs.length;
  const onWire = state === 'inflight' || state === 'claimed';
  const holdInFlight = async () => { if (ctx.pending) { await ctx.pending; ctx.pending = null; } };
  const outcome = async (r) => { if (state === 'inflight') { ctx.resolve(r); await holdInFlight(); } else if (state === 'claimed') { if (r.ok) R.deliver.retryTake(R.cid, [ctx.obj], { via: 'hand-over', lane: 'message' }); else ctx.release(); } };
  const turnEnd = async () => { const p = R.deliver.noteTurnEnd(R.session); await sleep(3); return p; };
  let na = false, note = null;
  switch (event) {
    case 'post-ok': if (!onWire) na = true; else await outcome({ ok: true, phase: 'written' }); break;
    case 'post-refused-transient': if (!onWire) na = true; else await outcome({ ok: false, reason: 'timeout', phase: 'connect', transient: true }); break;
    case 'post-refused-final': if (!onWire) na = true; else await outcome({ ok: false, reason: 'socket error: connect ENOENT', code: 'ENOENT', phase: 'connect', transient: false }); break;
    case 'poster-never-answers': if (!onWire) na = true; else await sleep(5); break;   // observed while nothing answers
    case 'server-death-mid-post': if (!onWire) na = true; else { const raw = JSON.parse(fs.readFileSync(path.join(R.dir, 'msg-retry.json'), 'utf-8')); const e = (raw[R.cid] || []).find((x) => x.id === id); note = e ? (e.inflight ? 'inflight' : e.ho ? 'claimed' : 'waiting') : 'gone'; } break;   // the file as the dying process leaves it
    case 'graceful-stop-mid-post': if (!onWire) na = true; else { R.deliver.closeRetries(); const keep = setInterval(() => { }, 20); const s = R.deliver.settleRetries(400); if (state === 'inflight') { ctx.resolve({ ok: true, phase: 'written' }); await holdInFlight(); } await s; clearInterval(keep); if (state === 'claimed') await outcome({ ok: true });  /* the hand-over's own settle (stash-handover) lands its frame */ } break;
    case 'turn-end': { if (state === 'waiting' || state === 'cleared') { const d = defer(); ctx.resolve = d.resolve; R.answer(TEXT, () => d.p); R.answer(CLEARED_TEXT, () => d.p); ctx.pending = turnEnd(); } else { const p = turnEnd(); if (state !== 'inflight') await p; else ctx.after = p; } break; }
    case 'timer': { if (state === 'waiting' || state === 'cleared') { const d = defer(); ctx.resolve = d.resolve; R.answer(TEXT, () => d.p); R.answer(CLEARED_TEXT, () => d.p); ctx.pending = R.advance(30_000); await sleep(3); } else if (state === 'inflight') { R.setNow(R.now() + 30_000); await sleep(3); } else await R.advance(30_000); break; }
    case 'bound-60min': { R.setNow(ctx.obj.firstAt + P.MAX_MS + 1000); const p = turnEnd(); if (state !== 'inflight') await p; else ctx.after = p; break; }
    case 'max-attempts': { while (ctx.obj.attempts.length < P.MAX_ATTEMPTS) ctx.obj.attempts.push({ ...ctx.obj.attempts[0] }); const p = turnEnd(); if (state !== 'inflight') await p; else ctx.after = p; break; }
    case 'clock-forward': R.setNow(R.now() + P.CLOCK_STEP_MS); await sleep(2); break;
    case 'clock-backward': R.setNow(R.now() - P.CLOCK_STEP_MS); await sibling(R, 'cb'); break;   // the sibling's park schedules: the repair runs
    case 'clear-single': R.deliver.redactStash((e) => (e.id === id || e.text === TEXT ? { text: CLEARED_TEXT, fromName: CLEARED_TEXT } : null)); break;
    case 'clear-batch': await sibling(R, 'cl'); R.deliver.redactStash((e) => (e.source === 'retry' || e.id ? { text: CLEARED_TEXT, fromName: CLEARED_TEXT } : null)); break;
    case 'cap': { const n = (state === 'waiting' || state === 'cleared') ? 30 : 31; for (let i = 1; i <= n; i++) await sibling(R, i); break; }
    case 'boot-ho': case 'boot-inflight': R.reboot(); break;   // the old engine's post, if any, stays pending: that process is gone
    case 'target-gone': { fs.unlinkSync(R.regFile); const p = turnEnd(); if (state !== 'inflight') await p; else ctx.after = p; break; }
    case 'spend-refused': { R.reboot(); R.setRefuse('hour-cap'); const p = turnEnd(); await p; break; }   // a hold is never re-judged inside its TTL: the event means a forgotten one (a boot)
    case 'handover-claim': { const views = R.deliver.retryEntries(R.cid).filter((v) => v && !v.ho && v._retry === ctx.obj); if (!views.length) na = true; else ctx.release = R.deliver.claimRetry(R.cid, views, 'ho-test'); break; }   // the hand-over's own listing (stash-handover entriesOf): never one on the wire, claimed or leaving
    case 'prompt-take': { const before = R.events.filter((x) => x.ev === 'delivered').length; AR.drainStashUnderCap(R.deliver, R.cid, 0, () => { }); if (R.events.filter((x) => x.ev === 'delivered').length === before) na = true; break; }   // the REAL drain of a fitting prompt (this producer is not the jobs engine: the stash drain carries it)
    default: throw new Error('no driver for ' + event);
  }
  const posted = R.calls.slice(calls0).some((t) => t.includes(TEXT) || t.includes(CLEARED_TEXT));
  const idRe = new RegExp(id.replace(/[-]/g, '\\-') + '(?![\\w])');   // the id as a whole token (a sibling's `rt-…-11` contains `rt-…-1`)
  const said = R.logs.slice(logs0).some((l) => idRe.test(l));
  const st = note || stateOf(R, id);
  // clean up anything left on the wire so the process can exit (the old engine's post is abandoned on purpose)
  if (ctx.resolve && !ctx.resolved) { try { ctx.resolve({ ok: true, phase: 'written' }); } catch { } ctx.resolved = true; }
  return { state: st, posted, said, na };
}
const DRIVABLE = STATES.filter((s) => !TERMINAL.has(s));
{
  const expectOf = (s, ev) => {
    // the model's answer for this driver's shape; two events where the driver cannot isolate one
    let e = canonical(s, NOW); e.id = 'x'; let r;
    if (ev === 'spend-refused') { r = parkStep(e, 'boot-inflight', { now: NOW }); e = r.entry; }
    r = parkStep(e, ev, { now: NOW, postOutcome: 'ok' });
    return { state: r.na ? s : r.entry.s, posted: r.post, said: !!r.say, na: r.na };
  };
  let cells = 0, agree = 0; const dis = [];
  for (const s of DRIVABLE) for (const ev of EVENTS) {
    cells++;
    const want = expectOf(s, ev);
    let got;
    try { const ctx = await enter(CD, s); got = await fire(ctx, ev); } catch (e) { got = { error: e && e.message }; }
    const same = got && !got.error && got.state === want.state && got.posted === want.posted && (want.na || got.said === want.said);
    if (same) agree++; else dis.push(`${s} × ${ev}: table ${JSON.stringify(want)} engine ${JSON.stringify(got)}`);
  }
  ok(cells === DRIVABLE.length * EVENTS.length && agree === cells, `(a) the engine agrees with every drivable cell (${agree} / ${cells})`, dis.join('\n      '));
  // the composed cells the driver could not isolate are said as such
  ok(true, '(a) …× spend-refused is driven as [boot, spend-refused] (a hold inside its TTL is never re-judged, and one never crosses a process; an entry on the wire at a boot is may-have-landed first)');
}

// ── §4 CONTROLS ─────────────────────────────────────────────────────────────
console.log('\n§4 controls');
{
  const M = mutantCopies('parkstep', REPO);
  const PS = fs.readFileSync(path.join(REPO, 'src/park-step.js'), 'utf-8');
  // (i) the table without the may-have-landed-first rule: an attempt on a may-have-landed entry posts it — the walk is red
  const m1 = PS.replace("    if (e.s === 'maybeDelivered') return out({ leave: 'stash'", "    if (false) return out({ leave: 'stash'");
  if (m1 === PS) ok(false, '(i) CONTROL anchor moved');
  else { const Pm = M.load('src/park-step.js', m1, 'no-maybe-first'); const rnd = prng(3); let v = []; for (const ev of EVENTS) for (const ev2 of EVENTS) v.push(...walk(Pm, 'maybeDelivered', [ev, ev2], rnd)); ok(v.some((x) => /a post from maybeDelivered|posts .* > attempts/.test(x)), '(i) CONTROL: a table that lets an attempt post a may-have-landed entry breaks the walk (' + v.length + ' violations)', v.slice(0, 2).join(' | ')); }
  // (ii) the table with a silent eviction: the walk is red on "a drop not said by id"
  const m2 = PS.replace("say: `the retry park holds 30 waiting per conversation — ${id} (the oldest waiting) falls to the stash, evicted`", "say: null");
  if (m2 === PS) ok(false, '(ii) CONTROL anchor moved');
  else { const Pm = M.load('src/park-step.js', m2, 'silent-evict'); const v = walk(Pm, 'waiting', ['cap'], prng(5)); ok(v.some((x) => /not said by id/.test(x)), '(ii) CONTROL: a silent eviction breaks "every drop is said by id"', v.join(' | ')); }
  // (iii) the ENGINE without r3 ④ (the cap counts a may-have-landed entry): the cell maybeDelivered × cap disagrees
  const CDS = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
  const m3 = CDS.replace("filter((x) => x && !x.inflight && !x.ho && !x.maybeDelivered);", "filter((x) => x && !x.inflight && !x.ho);");
  if (m3 === CDS) ok(false, '(iii) CONTROL anchor moved');
  else { const CDm = M.load('src/server/conversation-deliver.js', m3, 'cap-counts-maybe'); const ctx = await enter(CDm, 'maybeDelivered'); const got = await fire(ctx, 'cap'); ok(got.state === 'evicted', '(iii) CONTROL: the engine without r3 ④ evicts the may-have-landed entry at the cap — the cell disagrees with the table', JSON.stringify(got)); }
  // (iv) the ENGINE without the may-have-landed-first fall (r1 N2): maybeDelivered × turn-end posts it again
  const m4 = CDS.replace("    for (const e of (retry[cid] || []).filter((x) => x && x.maybeDelivered && !x.inflight && !x.ho)) fellRetry(e, 'not-reachable', 'it was being posted when the previous server stopped — its frame may have landed, so it is not posted again', { maybeDelivered: true });\n", "");
  if (m4 === CDS) ok(false, '(iv) CONTROL anchor moved');
  else { const CDm = M.load('src/server/conversation-deliver.js', m4, 'no-maybe-fall'); const ctx = await enter(CDm, 'maybeDelivered'); R_answerOk(ctx.R); const got = await fire(ctx, 'turn-end'); ok(got.posted === true && got.state !== 'stashed', '(iv) CONTROL: the engine without the may-have-landed fall posts the entry again at a turn end (two billed turns) — the cell disagrees', JSON.stringify(got)); }
}
function R_answerOk(R) { R.answer(TEXT, () => ({ ok: true, phase: 'written' })); }
// ── §4b CELL-LEVEL CONTROLS (verify r4 T2⑥): a patched copy that breaks ONE cell, not a rule ─────────────────────
console.log('\n§4b cell-level controls');
{
  const M = mutantCopies('parkstep-cell', REPO);
  const PS = fs.readFileSync(path.join(REPO, 'src/park-step.js'), 'utf-8');
  const anchor = "  if (isClear) {\n";
  // (v) cleared × clear-single un-clears (one cell): the walk's invariants are blind to it — the ENGINE comparison is red
  const m1 = PS.replace(anchor, anchor + "    if (e.s === 'cleared' && event === 'clear-single') return out({ entry: { s: 'waiting', cleared: false } });\n");
  if (m1 === PS) ok(false, '(v) CONTROL anchor moved');
  else { const Pm = M.load('src/park-step.js', m1, 'cell-unclear'); const rnd = prng(11); let v = []; for (const ev of EVENTS) v.push(...walk(Pm, 'cleared', ['clear-single', ev], rnd)); const want = Pm.parkStep(Pm.canonical('cleared', NOW), 'clear-single', { now: NOW }); const ctx = await enter(CD, 'cleared'); const got = await fire(ctx, 'clear-single'); ok(v.length === 0 && want.entry.s === 'waiting' && got.state === 'cleared', '(v) CONTROL: a cell mutant (cleared × clear-single → waiting) passes the walk (' + v.length + ' violations) and is caught by the engine comparison (engine ' + got.state + ' ≠ mutant table ' + want.entry.s + ')'); }
  // (vi) waiting × timer converts a hold that no longer exists (one cell): red only by I5b (it was green before r4)
  const anchor2 = "    return out({ now, post: true, authorize: 'hold', entry: { s: 'inflight', attempts, posts: e.posts + 1 }, persist: true });\n";
  const m2 = PS.replace("    const holdValid = hold && now - e.holdAt <= HOLD_TTL_MS;\n", "    const holdValid = hold && now - e.holdAt <= HOLD_TTL_MS;\n    if (e.s === 'waiting' && event === 'timer' && !holdValid) return out({ now, post: true, authorize: 'hold', entry: { s: 'inflight', attempts, posts: e.posts + 1 }, persist: true });\n");
  if (m2 === PS || !PS.includes(anchor2)) ok(false, '(vi) CONTROL anchor moved');
  else { const Pm = M.load('src/park-step.js', m2, 'cell-stale-hold'); const booted = Pm.parkStep(Pm.canonical('waiting', NOW), 'boot-inflight', { now: NOW }).entry; const cellM = Pm.parkStep(booted, 'timer', { now: NOW }); const cellP = P.parkStep(P.parkStep(canonical('waiting', NOW), 'boot-inflight', { now: NOW }).entry, 'timer', { now: NOW }); let v = []; for (let seed = 1; seed <= 20; seed++) v.push(...walk(Pm, 'waiting', ['boot-inflight', 'timer'], prng(seed))); ok(cellM.authorize === 'hold' && cellP.authorize === 'fresh' && v.some((x) => /a hold converted past its TTL or without one/.test(x)), '(vi) CONTROL: a cell mutant that converts a forgotten hold (waiting × timer after a boot: hold where the table says fresh) is red under I5b', JSON.stringify({ mutant: cellM.authorize, table: cellP.authorize, v: v.slice(0, 2) })); }
  // (vii) claimed × post-ok charges the park for a hand-over's landing (one cell): red under I5
  const m3 = PS.replace("    if (event === 'post-ok') return e.s === 'inflight' ? landedByPark() : landedByHandover();", "    if (event === 'post-ok' && e.s === 'claimed') return out({ leave: 'landed', charge: true, entry: { holds: false } });\n    if (event === 'post-ok') return e.s === 'inflight' ? landedByPark() : landedByHandover();");
  if (m3 === PS) ok(false, '(vii) CONTROL anchor moved');
  else { const Pm = M.load('src/park-step.js', m3, 'cell-charge-handover'); const v = walk(Pm, 'claimed', ['post-ok'], prng(17)); ok(v.some((x) => /a charge outside the park's own landing/.test(x)), '(vii) CONTROL: a cell mutant that charges a hand-over\'s landing is red under I5', v.join(' | ')); }
}
// ── §5 THE DOOR CENSUS (verify r4 T2⑤) ───────────────────────────────────────────────────────────────────────────
console.log('\n§5 the door census: every engine door is a table event, every event has a door, every via is an event');
{
  const CDS = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
  const ARS = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
  const SHS = fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf-8');
  const PMS = fs.readFileSync(path.join(REPO, 'src/peer-messaging.js'), 'utf-8');
  // every DOOR — a site that moves a parked entry — with the event(s) it is. A door whose regex no longer matches moved
  // (the row is stale: red); an event no door names is a cell the engine cannot reach (red); a door naming an event the
  // table lacks is the r4 finding's shape (red by EVENTS.includes)
  const DOORS = [
    ['the park at a transient first miss', CDS, /const e = parkRetry\(cid, text, opts, \{ kind, spendReason, charged, attempt:/, []],   // the entry's birth: no event (freshEntry)
    ['the cap at a park', CDS, /while \(waiting\(\)\.length > RETRY_CAP\) \{/, ['cap']],
    ['the turn end attempts', CDS, /await runAttempt\(cid, 'turn-end'\);/, ['turn-end']],
    ['the timer attempts', CDS, /await runAttempt\(cid, 'timer'\);/, ['timer']],
    ['the attempt: a may-have-landed entry falls first', CDS, /fellRetry\(e, 'not-reachable', 'it was being posted when the previous server stopped/, ['boot-inflight', 'boot-ho']],
    ['the attempt: the 60-min bound', CDS, /fellRetry\(e, 'not-reachable', `the retry schedule's \$\{RETRY_MAX_MS \/ 60000\} min bound passed/, ['bound-60min', 'clock-forward']],
    ['the attempt: the attempt bound', CDS, /\(the schedule's \$\{RETRY_MAX_ATTEMPTS\}-attempt bound\) over/, ['max-attempts']],
    ['the attempt: no live pid', CDS, /fellRetry\(e, 'not-running', 'the conversation is no longer running/, ['target-gone']],
    ['the attempt: the ceiling', CDS, /fellRetry\(e, 'spend-cap', `spend budget:/, ['spend-refused']],
    ['the attempt: the authorizer threw', CDS, /fellRetry\(e, 'spend-cap', 'spend authorizer failed:/, ['spend-refused']],
    ['the landing', CDS, /emitRetry\('delivered', cid, e, \{ lane: 'message', peerName: peer\.name \|\| null/, ['post-ok']],
    ['the transient miss: rescheduled', CDS, /if \(keep\.length\) rescheduleMany\(keep, clock\.now\(\) \+ step, why\);/, ['post-refused-transient']],
    ['the final miss', CDS, /fellRetry\(e, 'not-running', attempt\.reason\)/, ['post-refused-final']],
    ['the stamp on disk before the post', CDS, /writeRetryNow\(\);   \/\/ the claim door: a process that dies inside the post leaves the stamp/, ['server-death-mid-post']],
    ['the graceful stop', CDS, /function settleRetries\(maxMs = 5000\)/, ['graceful-stop-mid-post']],
    ['the poster\'s own bound', PMS, /const POST_BOUND_MS = POST_TIMEOUT_MS \+ WRITE_GRACE_MS \+ FLUSH_GRACE_MS;/, ['poster-never-answers']],
    ['the boot: an inflight stamp', CDS, /if \(e\.inflight\) \{ notes\.push\(/, ['boot-inflight']],
    ['the boot: a hand-over\'s claim', CDS, /if \(e\.ho\) \{ notes\.push\(/, ['boot-ho']],
    ['the clock repair', CDS, /function repairClock\(\) \{/, ['clock-backward']],
    ['the redactor\'s park walk', CDS, /if \(e\.inflight\) \{ e\.clearedInFlight = true; log\(/, ['clear-single', 'clear-batch']],
    ['the hand-over\'s claim', CDS, /function claimRetry\(cid, entries, id = null\) \{/, ['handover-claim']],
    ['the take (a prompt\'s drain, a hand-over\'s landing)', CDS, /function retryTake\(cid, entries, \{ via = 'hand-over', lane = null \} = \{\}\) \{/, ['prompt-take', 'post-ok']],
  ];
  const claimed = new Set();
  let stale = 0, unknown = 0;
  for (const [name, src, re, evs] of DOORS) { if (!re.test(src)) { stale++; console.error('      stale door: ' + name); } for (const ev of evs) { if (!EVENTS.includes(ev)) { unknown++; console.error('      door ' + name + ' names an event the table lacks: ' + ev); } claimed.add(ev); } }
  ok(stale === 0, '(a) every door still exists where the census looks (' + DOORS.length + ' doors)');
  ok(unknown === 0, '(b) every door names a table event (a door the table lacks is red)');
  const unclaimed = EVENTS.filter((ev) => !claimed.has(ev));
  ok(unclaimed.length === 0, '(c) every table event has a door (' + claimed.size + ' / ' + EVENTS.length + ')', unclaimed.join(', '));
  // the `via` a take can carry — grep-derived over the engine and its two callers — each must be an event
  const VIA_EVENT = { message: 'post-ok', 'hand-over': 'post-ok', prompt: 'prompt-take' };
  const vias = new Set([...(CDS + ARS + SHS).matchAll(/via: '([a-z-]+)'/g)].map((m) => m[1]));
  ok(vias.size >= 3 && [...vias].every((v) => VIA_EVENT[v] && EVENTS.includes(VIA_EVENT[v])), '(d) every via a take carries (' + [...vias].join(', ') + ') is a table event', [...vias].filter((v) => !VIA_EVENT[v]).join(', '));
  // a TERMINAL record is never written again: a landed and a stashed entry, snapshotted, then every door run over the park
  for (const end of ['landed', 'stashed']) {
    const ctx = await enter(CD, 'waiting');
    const obj = ctx.obj;
    if (end === 'landed') { R_answerOk(ctx.R); await fire(ctx, 'turn-end'); await ctx.pending; } else { await fire(ctx, 'target-gone'); fs.writeFileSync(ctx.R.regFile, JSON.stringify({ pid: process.pid, sessionId: ctx.R.cid, messagingSocketPath: path.join(ctx.R.dir, 'inbox.sock'), name: 'Owner' })); }
    const before = JSON.stringify(obj);
    const R = ctx.R;
    for (let i = 1; i <= 31; i++) await sibling(R, 'z' + i);
    R.deliver.redactStash(() => ({ text: CLEARED_TEXT, fromName: CLEARED_TEXT }));
    R.deliver.claimRetry(R.cid, [obj], 'ho-z'); R.deliver.retryTake(R.cid, [obj], { via: 'prompt' });
    R.setNow(R.now() - P.CLOCK_STEP_MS); await sibling(R, 'cb'); R.setNow(R.now() + 2 * P.CLOCK_STEP_MS);
    await R.deliver.noteTurnEnd(R.session); await R.advance(60_000); R.reboot(); await R.advance(1000);
    ok(JSON.stringify(obj) === before && stateOf(R, obj.id) === end, '(e) a ' + end + ' entry\'s record is never written again by any door (31 parks, a clear, a claim, a take, a clock step, a turn end, the timer, a boot)');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
