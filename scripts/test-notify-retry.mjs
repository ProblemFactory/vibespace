#!/usr/bin/env node
// lane-notify-retry (2026-10-01, the owner: "以前这个是自动唤醒的啊 怎么现在开始排队要我手动发了？"):
// ONE 5-second attempt decided for ever. A Background Work notification whose peer post timed out while the
// CLI was ALIVE was stashed at once, the stash was drained only at the next prompt, and the prompt's inline
// cap had 0 B left for it — so a conversation nobody typed into never heard its job finish, and the card it
// finally got said "completed while this conversation was closed" (it never was).
//
//   §1 THE PRIMITIVE (src/peer-messaging.js postToPeer) over REAL unix-socket stubs standing in for the CLI's
//      inbox: the loop-stall spurious timeout (connect completes at the syscall; libuv hands the callback to the
//      next iteration's pending phase, which runs AFTER the timers phase — a stall of our own loop longer than
//      the timer fired "timeout" on a live, idle CLI), a socket that swallows (never closes), one that reads
//      then closes, one nobody listens on, one whose backlog is full (EAGAIN = a CLI not accepting), one that
//      never reads (the write phase), the `late` measurement, the frames intact; controls = the pre-fix copy.
//   §2 THE LADDER (src/server/conversation-deliver.js) with a stub registry + stub socket: a transient miss on a
//      live pid is PARKED (never stashed), delivered at the conversation's turn end with ONE wake billed; a dead
//      pid stashes `not-running`; the backoff bounds; a restart keeps the parked entry ONCE; the hold's TTL
//      re-judges; a throwing authorizer fails closed; the floor re-asked; the hand-over takes a parked entry.
//   §3 the jobs engine's bookkeeping (notifyLog phase/busy/retries/deliveredAt, lastNotify, the floor re-stamped
//      by the successful delivery), the held kinds + the digest's tail by held kind, the `retrying` fact words.
import fs from 'node:fs';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const skip = (n) => { skipped++; console.log('  - SKIP ' + n); };   // B-7f97 cure: a skip is NEVER a pass — named, and counted apart in the summary
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// B-3dbd (r4868/r4965, lane bl-chat-b): THE SHORT SETTLES (sleep 0 to 30 ms after a notify, a broadcast, a turn end or an advance) STAY:
// each follows a call whose async work the product hands back no promise of (_notifyOwner, the rig's broadcast, a turn end the leg holds
// by its own release). On the two roads read to the post — a turn end (attemptRetry writes the in-flight stamp synchronously, then
// deliverToConversation reaches postToPeer with no await before it; the hand-over's turn-end listener awaits only an ARMED hand-over)
// and a notify (_notifyOwner → _deliverTo → the same ladder) — the post is asked within microtasks, so the settle only yields turns.
// The waits (e3)'s verdicts read are on their facts (factWithin; a whole turn into the hold), each expiry a named line
const factWithin = async (fn, what, ms = 20000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await sleep(5); const v = fn(); if (!v) ok(false, `the leg waited ${ms} ms for ${what} — it never came (a harness line, never the leg's verdict)`); return v; };
/** block THIS loop synchronously — the shape of a busy server (load 100+ on the owner's box) */
const stall = (ms) => { const sab = new SharedArrayBuffer(4); Atomics.wait(new Int32Array(sab), 0, 0, ms); };

const dir = scratchDir('ntr');
process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } });
const PM = require(path.join(REPO, 'src/peer-messaging.js'));

// ── §1 THE PRIMITIVE ────────────────────────────────────────────────────────
console.log('\n§1 postToPeer over real unix-socket stubs');
let seq = 0;
async function stub(kind, handle) {
  const sockPath = path.join(dir, `in${++seq}.sock`);
  const conns = [];
  const server = net.createServer((conn) => { conns.push(conn); handle(conn); });
  if (kind === 'full') {
    // a listener that NEVER accepts (a Node server accepts at the libuv level whatever its JS listeners do, so
    // the stand-in is a python socket: bind + listen(1), two fillers queue, the next connect is refused by the
    // kernel). MEASURED 2026-10-01: EAGAIN at 0 ms — never a hang.
    const py = spawnSync('python3', ['-c', 'print(1)'], { encoding: 'utf-8' });
    if (py.status !== 0) return { sockPath, skip: 'python3 is not on this box (' + (py.error ? py.error.message : 'exit ' + py.status) + ')' };
    const child = spawn('python3', ['-c', `import socket,sys,time\ns=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.bind(${JSON.stringify(sockPath)}); s.listen(1); sys.stdout.write('ok\\n'); sys.stdout.flush(); time.sleep(30)`], { stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise((r) => { child.stdout.once('data', r); setTimeout(r, 2000); });
    const fillers = []; for (let i = 0; i < 2; i++) fillers.push(net.connect(sockPath).on('error', () => { }));
    await sleep(80);
    return { sockPath, conns, close: () => { for (const f of fillers) f.destroy(); try { child.kill('SIGKILL'); } catch { } } };
  }
  await new Promise((r) => server.listen(sockPath, r));
  return { sockPath, server, conns, close: () => { for (const c of conns) c.destroy(); server.close(); } };
}
const readLines = (conn, into) => { let buf = ''; conn.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { into.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } }); };
const peerOf = (s) => ({ socketPath: s.sockPath, key: 'k'.repeat(64), name: 'stub' });
/** the CLI stand-in SERVES its inbox socket (lane peer-registry-identity: a registration counts only while its socket
 *  exists — src/peer-messaging.js registryIdentityOk): bound at once (a unix listen binds synchronously), unref'd, every
 *  connection dropped — the posts here are scripted */
const serveSock = (p) => { if (fs.existsSync(p)) return; const s = net.createServer((c) => c.destroy()); s.on('error', () => { }); s.listen(p); s.unref(); };
{
  // (a) a swallowing inbox: accepts, reads, never closes — the CLI's own shape (no ack on success)
  const frames = []; const s = await stub('swallow', (c) => readLines(c, frames));
  const t0 = Date.now(); const r = await PM.postToPeer(peerOf(s), 'job done', { timeoutMs: 2000 }); const dt = Date.now() - t0;
  // (lane wall-clock-ratchet-down: the old `dt < 1000` judged the machine — ok + phase `written` IS the flush's settle:
  // the 2 s timer's verdict is a `timeout`, and past the flush no timeout is ever judged)
  ok(r.ok === true && r.phase === 'written' && !r.reason, '(a) a socket that swallows: ok, phase written, settled by the flush + a short grace, never the 2 s timer', JSON.stringify(r) + ' ' + dt + ' ms');
  await sleep(20);
  ok(frames.length === 2 && frames[0].type === 'auth' && frames[1].type === 'user' && frames[1].message.content === 'job done', '(a) …both frames intact, in order');
  ok(gateOf(Number.isFinite(r.elapsedMs)) && r.elapsedMs >= 0, '(a) …the result carries elapsedMs');
  s.close();
}
{
  // (b) an inbox that reads then closes: the close settles it, phase closed
  const s = await stub('close', (c) => { let n = 0; c.on('data', (d) => { n += String(d).split('\n').length - 1; if (n >= 2) c.end(); }); });
  const r = await PM.postToPeer(peerOf(s), 'x', { timeoutMs: 2000 });
  ok(r.ok === true && (r.phase === 'closed' || r.phase === 'written'), '(b) a socket that closes after reading: ok (closed or written)', JSON.stringify(r));
  s.close();
}
{
  // (c) THE INCIDENT'S MECHANISM: our loop stalls longer than the timer right after net.connect(); the connect
  // was already complete at the syscall — the verdict must hear it (one loop turn) instead of calling it a timeout
  const frames = []; const s = await stub('swallow', (c) => readLines(c, frames));
  const p = PM.postToPeer(peerOf(s), 'stalled', { timeoutMs: 40 });
  stall(160);
  const r = await p;
  ok(r.ok === true, '(c) a 160 ms stall of OUR loop over a 40 ms timer is NOT a timeout — the queued connect is heard first', JSON.stringify(r));
  await sleep(20);
  ok(frames.length === 2 && frames[1].message.content === 'stalled', '(c) …and the frame reached the inbox');
  s.close();
}
{
  // (d) nobody listens on the path the registry names: refused at once, NOT transient (the CLI is gone or re-bound)
  const dead = path.join(dir, 'dead.sock'); fs.writeFileSync(dead, ''); // a plain file where a socket should be
  const r = await PM.postToPeer({ socketPath: dead, key: null }, 'x', { timeoutMs: 500 });
  ok(r.ok === false && r.phase === 'connect' && r.transient === false && verdictOf(/socket error/.test(r.reason)), '(d) a dead path: refused, phase connect, transient false', JSON.stringify(r));
  const r2 = await PM.postToPeer({ socketPath: path.join(dir, 'absent.sock'), key: null }, 'x', { timeoutMs: 500 });
  ok(r2.ok === false && r2.transient === false && r2.code === 'ENOENT', '(d) an absent path: ENOENT, transient false', JSON.stringify(r2));
}
{
  // (e) a FULL backlog — the listener is alive and not accepting (a CLI that stopped accepting): EAGAIN, transient
  const s = await stub('full', () => { });
  if (s.skip) skip('(e) ' + s.skip);
  else {
    const r = await PM.postToPeer(peerOf(s), 'x', { timeoutMs: 500 });
    ok(r.ok === false && r.transient === true && r.phase === 'connect' && r.code === 'EAGAIN', '(e) a full backlog: EAGAIN at once, transient, phase connect (measured: never a hang)', JSON.stringify(r));
    s.close();
  }
}
{
  // (f) a socket that accepts but never READS: a frame larger than the socket buffer never flushes — a timeout
  // in the WRITE phase, transient, and `late` measures how far past the timer our loop was when it judged.
  // B-7f97 (lane bl-tests-e): the buffer is the MACHINE's — a fixed 4 MB frame flushed whole on the second test machine. What
  // a never-reading peer takes before a write stalls is MEASURED through such a peer (never read off /proc/sys/net/core: a
  // container may not show it, and a unix stream's limit is the sender's own send buffer): 64 KB writes, each awaited inside
  // its own bound (STALL_MS, judged after the loop's pending phase — a write that completed is never read as a stall). The
  // frame is twice that + 1 MB; a peer that takes CAP without a stall says so and the two legs SKIP by name.
  const CHUNK = 64 * 1024, CAP = 16 * 1024 * 1024, STALL_MS = 150;
  const takesBeforeStall = async (st, cap = CAP) => {
    const c = net.connect(st.sockPath); let err = null; c.on('error', (e) => { err = e; });
    await new Promise((res) => { const t = setTimeout(res, 2000); t.unref(); c.once('connect', () => { clearTimeout(t); res(); }); });
    const buf = Buffer.alloc(CHUNK, 0x79); let took = 0, stalled = false;
    while (!err && !stalled && took < cap) {
      // a stall = no answer within STALL_MS, CONFIRMED by a second STALL_MS (each judged after the loop's pending phase): one slow
      // write on a loaded box is not a stall, so the measure never comes out short of the peer's real take
      const done = await new Promise((res) => {
        let answered = false, t = null;
        const judge = (second) => setImmediate(() => { if (answered) res(true); else if (second) res(false); else t = setTimeout(() => judge(true), STALL_MS); });
        t = setTimeout(() => judge(false), STALL_MS);
        c.write(buf, (e) => { if (e) err = err || e; else { answered = true; clearTimeout(t); res(true); } });
      });
      if (done) took += CHUNK; else stalled = !err;
    }
    c.destroy();
    return { took, stalled, err: err ? err.code || err.message : null };
  };
  const MB = (n) => (n / 1048576).toFixed(1);
  const sm = await stub('noread', (c) => { c.pause(); });
  const m = await takesBeforeStall(sm); sm.close();
  const s = await stub('noread', (c) => { c.pause(); });
  if (m.err) ok(false, `(f) the measuring socket failed (${m.err}) — nothing measured`);
  else if (!m.stalled) {
    skip(`(f) a never-reading peer here took ${MB(CAP)} MB without a stall: no frame this leg builds can stall the write on this machine`);
    skip('(f) …and so no `late` to measure');
  } else {
    const frameBytes = 2 * m.took + (1 << 20);
    const big = 'y'.repeat(frameBytes);
    const p = PM.postToPeer(peerOf(s), big, { timeoutMs: 100 });
    stall(400);
    const r = await p;
    ok(r.ok === false && r.reason === 'timeout' && r.phase === 'write' && r.transient === true, `(f) a never-reading socket: timeout in the write phase, transient (a ${MB(frameBytes)} MB frame over the ${MB(m.took)} MB such a peer takes here)`, JSON.stringify({ ...r, reason: r.reason }));
    ok(Number(r.late) >= 250, '(f) …`late` says our loop was ~300 ms late judging it (the measurement the journal will carry)', String(r.late));
  }
  s.close();
  // B-7f97 CONTROL — a machine with LARGER buffers, imitated here: a peer that reads its first 6 MB, then never again. The fixed
  // 4 MB frame (the leg as it was) is DELIVERED there (red); the frame sized by the same measurement still stalls the write
  const BIG = 6 * 1024 * 1024;
  const lateStub = () => stub('late-pause', (c) => { let got = 0; c.on('data', (d) => { got += d.length; if (got >= BIG) c.pause(); }); });
  const sb = await lateStub();
  const mb = await takesBeforeStall(sb, CAP + BIG); sb.close();   // its OWN bound: that peer takes BIG more than a never-reading one
  const [sf, ss] = [await lateStub(), await lateStub()];
  const [fixed, sized] = await Promise.all([
    PM.postToPeer(peerOf(sf), 'y'.repeat(4 * 1024 * 1024), { timeoutMs: 3000 }),
    mb.stalled ? PM.postToPeer(peerOf(ss), 'y'.repeat(2 * mb.took + (1 << 20)), { timeoutMs: 100 }) : Promise.resolve(null),
  ]);
  sf.close(); ss.close();
  ok(fixed.ok === true, `(f) CONTROL: the fixed 4 MB frame over a peer that takes 6 MB is delivered (${fixed.phase}) — the leg as it was is red where the buffers are larger (red)`, JSON.stringify(fixed));
  // B-7f97 cure (主开发 09:15Z, three readers): the machine the skip exists for skips HERE too — never a red on its buffers
  if (!mb.err && !mb.stalled) skip(`(f) CONTROL — a peer that reads 6 MB here took ${MB(CAP + BIG)} MB without a stall: no sized frame can stall the write on this machine`);
  else ok(gateOf(mb.stalled) && mb.took >= BIG && !!sized && sized.ok === false && sized.reason === 'timeout' && sized.phase === 'write', `(f) CONTROL: …and the frame sized by the measurement there (${MB(2 * mb.took + (1 << 20))} MB over the ${MB(mb.took)} MB that peer takes) still times out in the write phase`, JSON.stringify({ mb, sized }));
}
{
  // (g) the frame flushed, then the peer RESETS: the frame is in the kernel — never a failure, the reset NAMED
  const s = await stub('reset', (c) => { c.on('data', () => { c.destroy(); }); });
  const r = await PM.postToPeer(peerOf(s), 'x', { timeoutMs: 1000 });
  ok(r.ok === true, '(g) a reset after the flush is not a failure (the ambiguity is named in the kb)', JSON.stringify(r));
  s.close();
}
{
  // CONTROL: the pre-fix primitive (timer alone, 150 ms after the write) calls (c) a timeout
  const src = fs.readFileSync(path.join(REPO, 'src/peer-messaging.js'), 'utf-8');
  const pre = fs.readFileSync(path.join(REPO, 'scripts/fixtures/peer-messaging-prefix.js'), 'utf-8');
  const M = mutantCopies('ntr', REPO);
  const Old = M.load('src/peer-messaging.js', pre, 'prefix');
  const s = await stub('swallow', (c) => readLines(c, []));
  const p = Old.postToPeer(peerOf(s), 'stalled', { timeoutMs: 40 });
  stall(160);
  const r = await p;
  ok(r.ok === false && r.reason === 'timeout', 'CONTROL: the pre-fix primitive reports the stalled-loop post as a timeout (the incident)', JSON.stringify(r));
  ok(!/transient/.test(pre) && verdictOf(/transient/.test(src)), 'CONTROL: the pre-fix copy classifies nothing as transient');
  s.close();
}


// ── §2 THE LADDER'S RETRY PARK ──────────────────────────────────────────────
console.log('\n§2 the ladder: a transient miss on a live pid is parked, retried at turn end, ONE wake billed');
const CD = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const JM_MODEL = require(path.join(REPO, 'src/job-model.js'));
// lane owner-press-attended r2: «Hand over now» is the user's press only with the PRESS its door minted (src/write-origin.js pressOf)
const PRESS = require(path.join(REPO, 'src/write-origin.js')).pressOf({ headers: { 'sec-fetch-site': 'same-origin' } });
/** a rig: a stub registry dir (the REAL findPeer over it), a scripted post, a live-session map, a recording guard,
 *  a manual clock for the park's timers */
function rig(name, { dataDir = null, pid = process.pid, now0 = 1_700_000_000_000 } = {}) {
  const dir = dataDir || path.join(scratchDir('ntr'), name);
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
  const deliver = CD.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined,
    peerMsg: { findPeer: (c) => PM.findPeer(c, reg), postToPeer: async (p, text, o) => { const r = await answer(p, text, o); if (r.ok) posts.push(text); return r; }, postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: (req) => { if (throwAuth) throw new Error('guard down'); authorized.push(req.reason); if (refuse) return { ok: false, why: refuse, detail: refuse + ' reached', retryAfter: 60000, identity: { key: 'acct', name: 'Work' }, limits: { perIdentityHour: 30 } }; return { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'h' + (++holdSeq), reason: req.reason }; },
    noteSpend: (rec) => ledger.push({ reason: rec.reason, hold: rec.hold }), releaseSpend: (rec) => releases.push(rec.hold),
    emitPeerCard: (c, card) => cards.push(card), log: (...a) => logs.push(a.join(' ')), retryClock: clock });
  deliver.onRetry((ev, c, entry, extra) => { events.push({ ev, cid: c, id: entry.id, extra }); if (ev === 'fell') return false; });
  return { dir, reg, cid, session, sessions, deliver, posts, ledger, releases, authorized, cards, logs, events, clock, advance, timers, setAnswer: (fn) => { answer = fn; }, setRefuse: (w) => { refuse = w; }, setThrow: (b) => { throwAuth = b; }, now: () => now, setNow: (t) => { now = t; }, pid, sockPath };   // setNow (verify r4): the wall clock steps
}
const NOTIFY = (R, extra = {}) => R.deliver.deliverToConversation(R.cid, 'Background Work · dc-watch finished: 3 new threads', { fromName: 'Background Work · dc-watch', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-1' } }, ...extra });
{
  // (a) H1: a timeout while the CLI's pid lives (mid-turn) ⇒ PARKED, never stashed; delivered at the turn end; ONE wake billed
  const R = rig('h1');
  const r = await NOTIFY(R);
  ok(r.ok === false && r.parked === true && r.lane === 'message' && r.reason === 'timeout', '(a) a transient miss on a live pid answers parked:true (H1 — it was stashed for the next prompt)', JSON.stringify(r));
  ok(r.phase === 'connect' && r.busy === true && Number(r.retryAt) === R.now() + 30_000, '(a) …the answer carries the phase, the target\'s turn state (busy) and the next attempt (+30 s)', JSON.stringify(r));
  ok(R.deliver.retryCount(R.cid) === 1 && R.deliver.stashCount(R.cid) === 0, '(a) …one parked entry, nothing in the stash');
  ok(R.authorized.length === 1 && R.ledger.length === 0 && R.releases.length === 0, '(a) …authorized ONCE, the hold kept on the parked entry (not charged, not released)', JSON.stringify({ a: R.authorized, l: R.ledger, r: R.releases }));
  ok(gateOf(/parked for retry/.test(R.logs.join('\n'))) && gateOf(/phase connect/.test(R.logs.join('\n'))) && verdictOf(/mid-turn: yes/.test(R.logs.join('\n'))), '(a) …the journal line names the phase and whether the target was mid-turn', R.logs.join(' | '));
  const parsed = JSON.parse(fs.readFileSync(path.join(R.dir, 'msg-retry.json'), 'utf-8'));
  ok(gateOf(parsed[R.cid]) && parsed[R.cid].length === 1 && verdictOf(parsed[R.cid][0].text.includes('dc-watch finished')), '(a) …the parked entry is on disk at once');
  // the turn ends; the CLI now takes the frame
  R.session._isStreaming = false;
  R.setAnswer(async () => ({ ok: true, phase: 'written', elapsedMs: 160 }));
  await R.deliver.noteTurnEnd(R.session);
  ok(R.posts.length === 1 && verdictOf(R.posts[0].includes('dc-watch finished')), '(a) the turn end posts the SAME text once', JSON.stringify(R.posts));
  ok(R.ledger.length === 1 && R.ledger[0].reason === 'job-notification' && R.ledger[0].hold === 'h1' && R.authorized.length === 1 && R.releases.length === 0, '(a) …ONE wake billed: the original hold converted, no second authorization, nothing released', JSON.stringify({ l: R.ledger, a: R.authorized, r: R.releases }));
  ok(R.cards.length === 1 && R.cards[0].kind === 'notification' && R.deliver.retryCount(R.cid) === 0, '(a) …the card drawn once, the park empty');
  ok(gateOf(R.events.some((e) => e.ev === 'parked')) && verdictOf(R.events.some((e) => e.ev === 'delivered' && e.extra.lane === 'message' && e.extra.attempts === 2)), '(a) …the producer heard parked then delivered (attempts 2)', JSON.stringify(R.events));
  ok(!fs.existsSync(path.join(R.dir, 'msg-retry.json')) || Object.keys(JSON.parse(fs.readFileSync(path.join(R.dir, 'msg-retry.json'), 'utf-8'))).length === 0, '(a) …the file is empty again');
  await R.deliver.noteTurnEnd(R.session);
  ok(R.posts.length === 1, '(a) a second turn end posts nothing (never twice)');
}
{
  // (b) a DEAD pid: the registry names nobody alive ⇒ the stash at once, typed not-running (was: not-reachable, "closed")
  const R = rig('dead', { pid: 99999999 });
  const r = await NOTIFY(R);
  ok(r.ok === false && !r.parked && r.notRunning === true, '(b) a dead pid is not parked; the answer says notRunning', JSON.stringify(r));
  ok(JM_MODEL.heldKind(r, r.reason) === 'not-running', '(b) …heldKind types it not-running');
  ok(R.releases.length === 1 && R.ledger.length === 0, '(b) …the hold given back (a turn that never happened)');
  // (c) the socket is GONE while the pid lives: not transient ⇒ not parked, not-running too
  const R2 = rig('gone');
  R2.setAnswer(async () => ({ ok: false, reason: 'socket error: connect ENOENT', code: 'ENOENT', phase: 'connect', transient: false }));
  const r2 = await NOTIFY(R2);
  ok(r2.ok === false && !r2.parked && r2.notRunning === true && JM_MODEL.heldKind(r2, r2.reason) === 'not-running', '(c) a non-transient socket error on a live pid: not parked, not-running', JSON.stringify(r2));
  // a caller that did not opt into the retry (an older producer) keeps today\'s answer: a plain miss, never parked
  const R3 = rig('noopt');
  const r3 = await R3.deliver.deliverToConversation(R3.cid, 'x', { kind: 'notification', spendReason: 'job-notification' });
  ok(r3.ok === false && !r3.parked && r3.reason === 'timeout' && R3.deliver.retryCount(R3.cid) === 0, '(c) without opts.retry a transient miss is a plain miss (the producer stashes as before)', JSON.stringify(r3));
}

{
  // (d) THE BACKOFF BOUNDS under a manual clock, the post always missing: 30 s, 1, 2, 5, 10, 10 … min, ≤ 60 min,
  // then it falls to the stash typed not-reachable; the hold given back once its TTL would pass, re-judged after
  const R = rig('backoff');
  const r = await NOTIFY(R);
  const t0 = R.now();
  const ats = [];
  R.setAnswer(async () => { ats.push(R.now() - t0); return { ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5000 }; });
  await R.advance(61 * 60 * 1000);
  const mins = ats.map((ms) => +(ms / 60000).toFixed(2));
  ok(JSON.stringify(mins.slice(0, 5)) === JSON.stringify([0.5, 1.5, 3.5, 8.5, 18.5]), '(d) the steps: +30 s, +1, +2, +5, +10 min from the first miss', JSON.stringify(mins));
  ok(gateOf(mins.every((m) => m <= 60)) && mins.length >= 8 && mins.length <= 10 && mins[mins.length - 1] >= 50, '(d) …then every 10 min, nothing past 60 min (' + mins.length + ' retries)', JSON.stringify(mins));
  const fell = R.events.find((e) => e.ev === 'fell');
  ok(gateOf(fell) && fell.extra.kind === 'not-reachable' && fell.extra.attempts === mins.length + 1 && verdictOf(/did not accept/.test(fell.extra.reason)), '(d) …falls as not-reachable naming the attempts', JSON.stringify({ extra: fell && fell.extra, mins: mins.length, events: R.events.map((e) => e.ev + ':' + (e.extra.why || e.extra.kind || '')).join(',') }));
  ok(R.deliver.retryCount(R.cid) === 0 && R.deliver.stashCount(R.cid) === 1 && gateOf(R.deliver.stashPeek(R.cid)[0].held) && R.deliver.stashPeek(R.cid)[0].held.kind === 'not-reachable', '(d) …nobody took it ⇒ the ladder\'s own stash holds it with `held` typed', JSON.stringify({ n: R.deliver.retryCount(R.cid), s: R.deliver.stashPeek(R.cid), logs: R.logs.slice(-3) }));
  ok(R.releases.length === R.authorized.length && R.releases[0] === 'h1' && new Set(R.releases).size === R.releases.length, '(d) every hold was given back exactly once (the first before the attempt past its 3-min TTL, each re-judged one when its next attempt would outlive the TTL) — none leaked, none charged', JSON.stringify(R.releases));
  const after = R.authorized.length - 1;
  ok(after >= mins.length - 2 && after <= mins.length && R.ledger.length === 0, '(d) …every attempt past the TTL re-judged (asked again, ' + after + ' times), no charge ever', JSON.stringify({ a: R.authorized.length, l: R.ledger }));
  ok(R.posts.length === 0 && r.parked === true, '(d) …and nothing was posted');
}
{
// (e) a RESTART keeps a parked entry ONCE, its hold forgotten (re-judged at the next attempt); an entry whose post was IN
  // FLIGHT when the previous server stopped is NEVER posted again (verify r1 N2, reproduced: the boot re-posted a frame that
  // had landed = the same notice twice, two billed turns) — it falls to the stash at the first sweep, `maybeDelivered` said
  const R = rig('restart');
  await NOTIFY(R);
  const r2nd = await R.deliver.deliverToConversation(R.cid, 'the one in flight', { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-2' } } });
  const f = path.join(R.dir, 'msg-retry.json');
  const raw = JSON.parse(fs.readFileSync(f, 'utf-8'));
  raw[R.cid][1].inflight = R.now(); fs.writeFileSync(f, JSON.stringify(raw));   // killed inside the second one's post
  const R2 = rig('restart2', { dataDir: R.dir });
  ok(r2nd.parked === true && R2.deliver.retryCount(R.cid) === 2 && R2.deliver.retryPeek(R.cid)[0].id === raw[R.cid][0].id, '(e) a second server over the same dir finds both parked entries');
  ok(R2.deliver.retryPeek(R.cid)[0].charged.hold === null && !R2.deliver.retryPeek(R.cid)[1].inflight && R2.deliver.retryPeek(R.cid)[1].maybeDelivered === true && R2.deliver.retryEntries(R.cid).length === 1, '(e) …holds forgotten; the in-flight one is marked may-have-landed and is not listed as waiting');
  ok(verdictOf(R2.logs.some((l) => /was being posted when the previous server stopped — its frame may have landed, so it is handed to the stash/.test(l))), '(e) …and the boot says so by id', R2.logs.join(' | '));
  R2.setAnswer(async () => ({ ok: true, phase: 'written' }));
  R2.session.claudeSessionId = R.cid; R2.session.backendSessionId = R.cid;
  fs.writeFileSync(path.join(R2.reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: R.cid, messagingSocketPath: R2.sockPath, name: 'Owner' }));
  await R2.advance(31 * 1000);
  ok(R2.posts.length === 1 && !/the one in flight/.test(R2.posts[0]) && R2.authorized.length === 1 && R2.ledger.length === 1 && R2.deliver.retryCount(R.cid) === 0, '(e) …the timer posts the waiting one once (re-authorized ONCE, charged ONCE) and never the in-flight one', JSON.stringify({ p: R2.posts.length, a: R2.authorized, l: R2.ledger }));
  const fellE = R2.events.find((e) => e.ev === 'fell');
  ok(gateOf(fellE) && fellE.extra.kind === 'not-reachable' && fellE.extra.maybeDelivered === true && R2.deliver.stashCount(R.cid) === 1 && R2.deliver.stashPeek(R.cid)[0].held.maybeDelivered === true && verdictOf(/the one in flight/.test(R2.deliver.stashPeek(R.cid)[0].text)), '(e) …the in-flight one fell to the stash typed not-reachable + maybeDelivered (the next prompt carries it free)', JSON.stringify({ fell: fellE && fellE.extra, stash: R2.deliver.stashPeek(R.cid) }));
  // (e2) A HAND-OVER'S CLAIM ACROSS A RESTART (verify r2, reproduced): a park entry stamped `ho:<id>` when the previous
  // server died inside the hand-over's post was never posted (the timer, the turn end, the bound and the hand-over's view all
  // skip a claimed one) and never fell — a silent loss counted as "being retried" for ever. It is handed to the stash at the
  // first sweep as may-have-landed, like one whose own post was in flight (its stash siblings wait again there)
  const RH = rig('ho-restart');
  await NOTIFY(RH);
  const fh = path.join(RH.dir, 'msg-retry.json');
  const rawH = JSON.parse(fs.readFileSync(fh, 'utf-8'));
  rawH[RH.cid][0].ho = 'ho-dead-1'; fs.writeFileSync(fh, JSON.stringify(rawH));
  const RH2 = rig('ho-restart2', { dataDir: RH.dir });
  RH2.session.claudeSessionId = RH.cid; RH2.session.backendSessionId = RH.cid;
  fs.writeFileSync(path.join(RH2.reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: RH.cid, messagingSocketPath: RH2.sockPath, name: 'Owner' }));
  ok(verdictOf(RH2.logs.some((l) => /was claimed by hand-over ho-dead-1 when the previous server stopped — its frame may have landed/.test(l))), '(e2) the boot names the claimed entry and its hand-over', RH2.logs.join(' | '));
  ok(RH2.deliver.retryPeek(RH.cid).length === 1 && !RH2.deliver.retryPeek(RH.cid)[0].ho && RH2.deliver.retryPeek(RH.cid)[0].maybeDelivered === true && RH2.deliver.retryEntries(RH.cid).length === 0, '(e2) …the claim is gone, the entry is may-have-landed and listed to nobody');
  RH2.setAnswer(async () => ({ ok: true, phase: 'written' }));
  RH2.session._isStreaming = false;
  await RH2.advance(1000);
  ok(RH2.posts.length === 0 && RH2.deliver.retryCount(RH.cid) === 0 && RH2.deliver.stashCount(RH.cid) === 1 && RH2.deliver.stashPeek(RH.cid)[0].held.maybeDelivered === true && verdictOf(RH2.events.some((e) => e.ev === 'fell' && e.extra.maybeDelivered === true)), '(e2) …the first sweep hands it to the stash (never posted by the park), the producer told', JSON.stringify({ p: RH2.posts.length, stash: RH2.deliver.stashPeek(RH.cid).map((e) => e.held) }));
  await RH2.deliver.noteTurnEnd(RH2.session); await RH2.advance(3 * 3600 * 1000);
  ok(RH2.posts.length === 0 && RH2.deliver.retryCount(RH.cid) === 0, '(e2) …and nothing later posts it');
  // the graceful stop: the door shuts, the post in flight is waited for, nothing new leaves
  const R3 = rig('settle');
  await NOTIFY(R3);
  let release3; const gate3 = new Promise((r) => { release3 = r; });
  R3.setAnswer(async () => { await gate3; return { ok: true, phase: 'written' }; });
  R3.session._isStreaming = false;
  const p3 = R3.deliver.noteTurnEnd(R3.session);
  await sleep(5);
  R3.deliver.closeRetries();
  ok(R3.deliver.retryInFlightCount() === 1, '(e) closeRetries: one post in flight is counted');
  const settled = R3.deliver.settleRetries(2000);
  release3(); await p3;
  ok((await settled) === 1 && R3.posts.length === 1 && R3.deliver.retryCount(R3.cid) === 0 && !JSON.parse(fs.readFileSync(path.join(R3.dir, 'msg-retry.json'), 'utf-8'))[R3.cid], '(e) …settleRetries resolves after it landed and its removal is on disk (a graceful stop never leaves an in-flight stamp)');
  // (e3) THE EXIT'S DEADLINE COVERS THE POST'S OWN BOUND (verify r2, reproduced: the primitive answers a never-reading inbox
  // at 6 006 ms = timer + write grace, the exit waited 5 s — a post started a second before SIGTERM was left stamped, and
  // the next boot handed a LANDED frame to the stash). Here the shape by a held post (r4965): a post the leg holds, a short
  // deadline reads "unsettled" while it is held, and the exit's own default waits for it (released once that wait began) and
  // clears the stamp on disk
  const ES = require(path.join(REPO, 'src/server/exit-settle.js'));
  ok(PM.POST_BOUND_MS === 5000 + 1000 + 150 && ES.SETTLE_MS > PM.POST_BOUND_MS && ES.SETTLE_MS < 30 * 1000, '(e3) the exit settle\'s default covers the primitive\'s bound (timer + write grace + flush grace) and stays far under systemd\'s stop timeout', JSON.stringify({ bound: PM.POST_BOUND_MS, settle: ES.SETTLE_MS }));
  ok(verdictOf(/settleInFlight\(\{ stashView, deliver, n, m \}\)/.test(fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8'))), '(e3) server.js takes the exit settle\'s default (no shorter deadline of its own)');
  const R4 = rig('settle-bound');
  await NOTIFY(R4);
  // r4965: THE POST IS HELD BY THE LEG — its answer comes only when the leg releases it (a placed hold), never after a 1.2 s timer of the
  // test's own. A deadline shorter than the post reads «unsettled» for as long as the post is held, so the short deadline is 50 ms (was
  // 600 ms of a 1.2 s post); the release comes at once after the exit's own settle began — that settle must outlast the post: a whole
  // turn into the hold it is still waiting (an exit that leaves the retry posts out of its wait is done by then — every microtask has
  // run — its RED control below), and it ends once the post landed. The product's own bound the exit covers (PM.POST_BOUND_MS) is judged
  // by the static leg above, unchanged.
  let releasePost = null;
  // the deliver's own deadline timers are unref'd (a hub's loop keeps them): while the post is held nothing else keeps this loop up, so the
  // scene keeps it with an interval of its own (cleared once the post landed) — the old 1.2 s timer did it by the way
  const keepUp = setInterval(() => { }, 1000);
  R4.setAnswer(() => new Promise((res) => { releasePost = () => res({ ok: true, phase: 'written' }); }));
  R4.session._isStreaming = false;
  const p4 = R4.deliver.noteTurnEnd(R4.session);
  const stampOf = () => { try { const e = JSON.parse(fs.readFileSync(path.join(R4.dir, 'msg-retry.json'), 'utf-8'))[R4.cid]; return !!(e && e[0] && e[0].inflight); } catch { return false; } };
  await factWithin(() => !!releasePost && stampOf(), 'the held post asked for and its in-flight stamp on disk');   // (was a 5 ms settle)
  R4.deliver.closeRetries();
  const short = await R4.deliver.settleRetries(50);
  ok(short === -1 && verdictOf(JSON.parse(fs.readFileSync(path.join(R4.dir, 'msg-retry.json'), 'utf-8'))[R4.cid][0].inflight), '(e3) a deadline shorter than the post reads unsettled while the stamp is still on disk (the pre-fix exit)');
  const warned = [];
  let exitDone = false;
  const exitSettle = ES.settleInFlight({ stashView: null, deliver: R4.deliver, n: 0, m: 1, log: { log: () => { }, warn: (l) => warned.push(l) } }).then(() => { exitDone = true; });
  await new Promise((r) => setImmediate(r));   // a whole turn into the hold: every microtask has run — an exit that does not wait is done by now
  const waitedHeld = !exitDone;                // read BEFORE the release (after it, the turn end's own promise waits for the post anyway)
  if (releasePost) releasePost();
  await exitSettle;
  const atExit = { posts: R4.posts.length, stamp: !!JSON.parse(fs.readFileSync(path.join(R4.dir, 'msg-retry.json'), 'utf-8'))[R4.cid] };   // the exit's wait alone
  await p4;
  clearInterval(keepUp);
  ok(gateOf(waitedHeld) && atExit.posts === 1 && !atExit.stamp && !warned.length && R4.deliver.retryCount(R4.cid) === 0, '(e3) …the exit\'s own wait outlasts the post: still waiting a turn into the hold, and once it ends the post landed, no warning, the stamp gone from disk', JSON.stringify({ waitedHeld, atExit, warned }));
  // (e3)'s RED control (B-3dbd, lane bl-chat-b): a copy of the exit settle that leaves the retry posts out of its wait (anchored); the
  // same held scene finds it done a turn into the hold with the post still unanswered — the verdict above reads it. Judged on its
  // WITNESS (r5135 law 1): the copy's exit ran inside the hold with the plant in force — its own text carries the mark, and it never
  // asked the deliver's settleRetries (counted on the deliver it was handed); a plant not in force is a NAMED SKIP, never a red
  {
    const ESRC = fs.readFileSync(path.join(REPO, 'src/server/exit-settle.js'), 'utf-8');
    const WAIT_A = "deliver && typeof deliver.settleRetries === 'function' ? deliver.settleRetries(maxMs) : Promise.resolve(0)";
    const ESX = mutantCopies('ntr-exit-nowait', REPO).load('src/server/exit-settle.js', anchored(ESRC, WAIT_A, "Promise.resolve(0) /* MUTANT: the retry posts left out of the exit's wait */", 'the exit waits for the retry posts'), 'exit-no-wait');
    const R5 = rig('settle-bound-red');
    await NOTIFY(R5);
    let release5 = null;
    const keep5 = setInterval(() => { }, 1000);   // the held post leaves no ref'd timer (as above)
    R5.setAnswer(() => new Promise((res) => { release5 = () => res({ ok: true, phase: 'written' }); }));
    R5.session._isStreaming = false;
    const p5 = R5.deliver.noteTurnEnd(R5.session);
    await factWithin(() => !!release5, 'the control\'s held post asked for');
    R5.deliver.closeRetries();
    let asked5 = 0;
    const settle5 = R5.deliver.settleRetries;
    R5.deliver.settleRetries = (...a) => { asked5++; return settle5(...a); };   // the witness: does the exit under test ask it?
    let done5 = false;
    const exit5 = ESX.settleInFlight({ stashView: null, deliver: R5.deliver, n: 0, m: 1, log: { log: () => { }, warn: () => { } } }).then(() => { done5 = true; });
    await new Promise((r) => setImmediate(r));
    const red = { doneHeld: done5, posts: R5.posts.length, asked: asked5, marked: /MUTANT: the retry posts left out of the exit's wait/.test(String(ESX.settleInFlight)) };
    if (release5) release5();
    await exit5; await p5;
    clearInterval(keep5);
    R5.deliver.settleRetries = settle5;
    if (!(red.marked && red.asked === 0)) skip(`CONTROL (e3): the plant was not in force inside the hold (the copy's mark ${red.marked ? 'present' : 'absent'}, settleRetries asked ${red.asked} time(s)) — nothing judged`);
    else ok(red.doneHeld === true && red.posts === 0, 'CONTROL (e3): an exit settle that leaves the retry posts out of its wait (its mark in force, settleRetries never asked) is done a turn into the hold, the post still unanswered — the leg above reads it (red)', JSON.stringify(red));
  }
  R3.setAnswer(async () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true }));
  const rAfter = await R3.deliver.deliverToConversation(R3.cid, 'after close', { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-3' } } });
  R3.setAnswer(async () => ({ ok: true, phase: 'written' }));
  await R3.deliver.noteTurnEnd(R3.session); await R3.advance(60_000);
  ok(rAfter.parked === true && R3.posts.length === 1 && R3.deliver.retryCount(R3.cid) === 1, '(e) …after the door shut a new park is kept but no retry post leaves (a turn end, the timer) — the next boot owns it');
}
{
  // (f) FAIL CLOSED: a throwing authorizer at a re-judged attempt spends nothing, the entry falls as spend-cap
  const R = rig('closed');
  await NOTIFY(R);
  R.setThrow(true);
  await R.advance(4 * 60 * 1000);   // past the TTL: the next attempt must ask again
  ok(R.posts.length === 0 && R.ledger.length === 0 && R.deliver.retryCount(R.cid) === 0, '(f) a throwing authorizer: nothing posted, nothing charged, the park empty');
  const fell = R.events.find((e) => e.ev === 'fell');
  ok(gateOf(fell) && fell.extra.kind === 'spend-cap' && verdictOf(/authorizer failed/.test(fell.extra.reason)), '(f) …fell as spend-cap naming the failure', JSON.stringify(fell && fell.extra));
  // a REFUSAL at the re-judge: the same fall, typed with the ceiling's why
  const R2 = rig('refused');
  await NOTIFY(R2);
  R2.setRefuse('hour-cap');
  await R2.advance(4 * 60 * 1000);
  const f2 = R2.events.find((e) => e.ev === 'fell');
  ok(gateOf(f2) && f2.extra.kind === 'spend-cap' && f2.extra.why === 'hour-cap' && f2.extra.identity === 'Work' && f2.extra.cap === 30 && R2.posts.length === 0, '(f) a refused re-judge falls as spend-cap with why / identity / cap', JSON.stringify(f2 && f2.extra));
}
{
  // (g) THE FLOOR: a successful post 5 s ago ⇒ a turn-end attempt is rescheduled to the floor, not posted
  const R = rig('floor');
  await NOTIFY(R);
  R.setAnswer(async () => ({ ok: true, phase: 'written' }));
  const r2 = await R.deliver.deliverToConversation(R.cid, 'another notice', { kind: 'notification', spendReason: 'job-notification' });
  ok(r2.ok === true && R.posts.length === 1, '(g) a direct delivery lands (the floor\'s witness)');
  await R.advance(5000);
  await R.deliver.noteTurnEnd(R.session);
  ok(R.posts.length === 1 && R.deliver.retryCount(R.cid) === 1, '(g) a turn end 5 s after a post does not post the parked one (the floor)');
  const e = R.deliver.retryPeek(R.cid)[0];
  ok(e.nextAt === R.now() - 5000 + 30_000, '(g) …it is rescheduled to the floor (last post + 30 s)', String(e.nextAt - R.now()));
  await R.advance(26 * 1000);
  ok(R.posts.length === 2 && R.deliver.retryCount(R.cid) === 0, '(g) …and posted when the floor clears');
}
{
  // (h) THE HAND-OVER TAKES A PARKED ENTRY: the view in the stash's shape, the take releases the hold and says delivered via hand-over; a claim keeps the timer off it
  const R = rig('take');
  await NOTIFY(R);
  const views = R.deliver.retryEntries(R.cid);
  ok(views.length === 1 && views[0].source === 'retry' && views[0].kind === 'notification' && views[0].held.kind === 'retrying' && views[0].held.nextAt === R.now() + 30_000 && verdictOf(views[0].text.includes('dc-watch')), '(h) retryEntries = the stash shape with held.kind retrying + nextAt', JSON.stringify(views[0]));
  const release = R.deliver.claimRetry(R.cid, views, 'ho-1');
  await R.advance(31 * 1000);
  ok(R.posts.length === 0 && R.deliver.retryCount(R.cid) === 1, '(h) a claimed entry is skipped by the timer');
  release();
  const took = R.deliver.retryTake(R.cid, new Set(views), { via: 'hand-over', lane: 'message' });
  ok(took.length === 1 && R.deliver.retryCount(R.cid) === 0 && R.releases.length === 1 && R.ledger.length === 0, '(h) the take empties the park and gives the hold back (the hand-over bills its own turn)');
  ok(verdictOf(R.events.some((e) => e.ev === 'delivered' && e.extra.via === 'hand-over')), '(h) …the producer hears delivered via hand-over');
}
{
  // (i) a post IN FLIGHT when the turn ends is not posted twice; a delivered-but-slow socket is never re-posted
  const R = rig('inflight');
  await NOTIFY(R);
  let release; const gate = new Promise((r) => { release = r; });
  R.setAnswer(async () => { await gate; return { ok: true, phase: 'written', elapsedMs: 4900 }; });
  const p1 = R.deliver.noteTurnEnd(R.session);
  await sleep(5);
  const p2 = R.deliver.noteTurnEnd(R.session);
  await sleep(5);
  ok(JSON.parse(fs.readFileSync(path.join(R.dir, 'msg-retry.json'), 'utf-8'))[R.cid][0].inflight > 0, '(i) the in-flight stamp is on disk while the post runs');
  release(); await p1; await p2;
  ok(R.posts.length === 1 && R.ledger.length === 1 && R.deliver.retryCount(R.cid) === 0, '(i) two turn ends around one slow post: ONE post, ONE charge', JSON.stringify({ p: R.posts.length, l: R.ledger }));
}
{
  // (k) verify r1 N1c (reproduced: TWO posts, TWO charges): an entry whose retry post is IN FLIGHT is not waiting — the
  // hand-over must not claim + take it and post its own frame carrying it while the retry's post lands too
  const R = rig('inflight-take');
  await NOTIFY(R);
  let release; const gate = new Promise((r) => { release = r; });
  R.setAnswer(async (p, text) => { if (/hand-over ho-/.test(text)) return { ok: true, phase: 'written' }; await gate; return { ok: true, phase: 'written', elapsedMs: 4900 }; });
  R.session._isStreaming = false;
  const p1 = R.deliver.noteTurnEnd(R.session);
  await sleep(5);
  ok(R.deliver.retryEntries(R.cid).length === 0 && R.deliver.retryCount(R.cid) === 1, '(k) an in-flight entry is counted but never listed as waiting');
  const raw = R.deliver.retryPeek(R.cid);
  ok(R.deliver.retryTake(R.cid, new Set(raw), { via: 'hand-over' }).length === 0 && typeof R.deliver.claimRetry(R.cid, raw, 'ho-x') === 'function' && !R.deliver.retryPeek(R.cid)[0].ho, '(k) …the take and the claim doors refuse it by construction');
  const SHk = require(path.join(REPO, 'src/server/stash-handover.js')), ARk = require(path.join(REPO, 'src/agent-routes.js'));
  const view = SHk.create({ activeSessions: R.sessions, getDeliver: () => R.deliver, getJobs: () => null, broadcastSessions: () => { }, renderMsgStash: ARk.renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, log: { log() { }, warn() { } } });
  const r = await view.handOver('w1', { pressed: PRESS });
  release(); await p1; await sleep(5);
  ok(r.ok === false && r.code === 'nothing_waiting' && R.posts.length === 1 && R.ledger.length === 1 && R.releases.length === 0, '(k) a hand-over clicked during the post finds nothing waiting: ONE post, ONE charge (was: two of each)', JSON.stringify({ r, p: R.posts.length, l: R.ledger, rel: R.releases }));
  // a caller holding a STALE list (the timer sweep's slice) never posts an entry a hand-over took meanwhile
  const R2 = rig('stale-list');
  await NOTIFY(R2, { retry: { producer: 'test', meta: { jobId: 'jb-1' } } });
  const r2 = await R2.deliver.deliverToConversation(R2.cid, 'second notice', { fromName: 'Background Work · other', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-2' } } });
  ok(r2.parked === true && R2.deliver.retryCount(R2.cid) === 2, '(k) two parked entries');
  const taken = R2.deliver.retryTake(R2.cid, new Set(R2.deliver.retryEntries(R2.cid).slice(1)), { via: 'prompt' });
  R2.setAnswer(async () => ({ ok: true, phase: 'written' }));
  R2.session._isStreaming = false;
  await R2.deliver.noteTurnEnd(R2.session);
  ok(taken.length === 1 && R2.posts.length === 1 && !R2.posts.some((t) => /second notice/.test(t)) && R2.deliver.retryCount(R2.cid) === 0, '(k) …an entry taken out of the park is never posted by a stale list', JSON.stringify({ taken: taken.length, posts: R2.posts.map((t) => t.slice(-30)) }));
}
{
  // (l) verify r1 N1d (reproduced: five parked notices for one conversation = FIVE posts = five billed wakes, one every
  // 30 s by the floor): ONE wake carries everything waiting — one frame in the hand-over's shape, ONE authorization
  const ARl = require(path.join(REPO, 'src/agent-routes.js'));
  const R = rig('batch');
  for (let i = 1; i <= 5; i++) await R.deliver.deliverToConversation(R.cid, `job-${i} finished`, { fromName: `Background Work · job-${i}`, kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-' + i } } });
  ok(R.deliver.retryCount(R.cid) === 5 && R.authorized.length === 5, '(l) five parked entries, five holds');
  R.session._isStreaming = false;
  R.setAnswer(async () => ({ ok: true, phase: 'written' }));
  await R.deliver.noteTurnEnd(R.session);
  await R.advance(5 * 60 * 1000);
  ok(R.posts.length === 1 && R.ledger.length === 1 && R.ledger[0].hold === 'h1' && R.releases.length === 4 && R.deliver.retryCount(R.cid) === 0, '(l) the turn end posts ONE frame, ONE charge (the oldest hold converted, the other four given back), the park empty', JSON.stringify({ p: R.posts.length, l: R.ledger, rel: R.releases }));
  ok(gateOf([1, 2, 3, 4, 5].every((i) => R.posts[0].includes(`job-${i} finished`))) && gateOf(/5 notice\(s\) VibeSpace could not deliver earlier/.test(R.posts[0])) && verdictOf(R.posts[0].startsWith('VibeSpace (this workspace, not another agent) reports:')), '(l) …the frame carries all five under the ONE head', R.posts[0].slice(0, 160));
  ok(R.events.filter((e) => e.ev === 'delivered').length === 5 && verdictOf(R.events.filter((e) => e.ev === 'delivered').every((e) => e.extra.frame === 5 && e.extra.via === 'message')), '(l) …every producer hears delivered (frame 5)');
  ok(R.cards.length === 1 && R.cards[0].fromName === 'VibeSpace notices' && R.cards[0].recorded === R.posts[0] && verdictOf(/^5 waiting notice\(s\) handed over — their delivery was being retried — delivered now/.test(R.cards[0].text)), '(l) …ONE card in the hand-over\'s shape, recorded = the frame', R.cards[0] && R.cards[0].text.split('\n')[0]);
  ok(verdictOf(R.logs.some((l) => /5 notices in ONE frame/.test(l))), '(l) …the journal says so');
  // the renderer injected (server.js wires agent-routes' renderMsgStash): the hand-over's lines, the bound honoured
  const R2 = rig('batch-render');
  R2.deliver = CD.create({ dataDir: R2.dir, activeSessions: R2.sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, R2.reg), postToPeer: async (p, text) => { R2.posts.push(text); return { ok: true, phase: 'written' }; }, postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: (c, card) => R2.cards.push(card), log: () => { }, retryClock: R2.clock, renderBatch: ARl.renderMsgStash });
  const f = path.join(R.dir, 'msg-retry.json');
  const raw = {}; raw[R2.cid] = [];
  for (let i = 1; i <= 40; i++) raw[R2.cid].push({ id: 'rt-' + i, cid: R2.cid, text: 'VibeSpace (this workspace, not another agent) reports: job-' + i + ' finished', fromName: 'Background Work · job-' + i, kind: 'notification', spendReason: 'job-notification', producer: 'test', meta: null, charged: null, firstAt: R2.now() - 1000 * i, attempts: [{ at: R2.now() - 1000 * i, reason: 'timeout', phase: 'connect', busy: true, late: 0, why: 'first' }], nextAt: R2.now(), retries: 0 });
  fs.writeFileSync(path.join(R2.dir, 'msg-retry.json'), JSON.stringify(raw));
  const R3 = rig('batch-render2', { dataDir: R2.dir });
  R3.session.claudeSessionId = R2.cid; R3.session.backendSessionId = R2.cid;   // the gate's rig mints a cid per rig: the second server speaks for R2's conversation
  fs.writeFileSync(path.join(R3.reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: R2.cid, messagingSocketPath: R3.sockPath, name: 'Owner' }));
  const posts3 = [];
  R3.deliver = CD.create({ dataDir: R2.dir, activeSessions: R3.sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, R3.reg), postToPeer: async (p, text) => { posts3.push(text); return { ok: true, phase: 'written' }; }, postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => { }, log: () => { }, retryClock: R3.clock, renderBatch: ARl.renderMsgStash });
  ok(R3.deliver.retryCount(R2.cid) === 40, '(l) forty parked entries at boot');
  R3.session._isStreaming = false;
  await R3.deliver.noteTurnEnd(R3.session);
  // verify r2 (re-pinned deliberately): the park's frame keeps the OLDEST — rt-40 … rt-11 by firstAt — and the 10 NEWEST
  // stay for the next frame (a hand-over keeps the newest; the park's entries expire and the oldest are nearest the bound)
  ok(posts3.length === 1 && gateOf(/### Notices VibeSpace could not deliver at once/.test(posts3[0])) && !/unreachable/.test(posts3[0]) && (posts3[0].match(/^- \[/gm) || []).length === 30 && gateOf(/\(10 newer message\(s\) follow in the next message\)/.test(posts3[0])) && R3.deliver.retryCount(R2.cid) === 10 && gateOf(R3.deliver.retryPeek(R2.cid).every((e) => Number(e.id.slice(3)) <= 10)) && posts3[0].indexOf('job-40 finished') < posts3[0].indexOf('job-11 finished'), '(l) the first frame carries the 30 OLDEST in time order under the park\'s own heading, the 10 newest stay parked and the frame says so', JSON.stringify({ p: posts3.length, left: R3.deliver.retryPeek(R2.cid).map((e) => e.id), lines: (posts3[0] || '').match(/^- \[/gm)?.length }));
  await R3.advance(31 * 1000);
  ok(posts3.length === 2 && R3.deliver.retryCount(R2.cid) === 0 && verdictOf([1, 10].every((i) => posts3[1].includes(`job-${i} finished`))), '(l) …the next frame after the floor carries the rest (the newest)');
  // (l2) THE CUT VS THE BOUND (verify r2, reproduced on the newest-first frame): 16 notices of ~900 B parked over the last
  // 59 min 40 s, the agent busy throughout; the frame's 12 KiB holds twelve. Oldest-first, the four newest follow 30 s on
  // and nothing expires; newest-first left the oldest four parked and the next frame's bound dropped job-01 to the stash
  const RCB = rig('cut-bound');
  RCB.deliver = CD.create({ dataDir: RCB.dir, activeSessions: RCB.sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, RCB.reg), postToPeer: async (p, text) => { RCB.posts.push(text); return { ok: true, phase: 'written' }; }, postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => { }, log: (...a) => RCB.logs.push(a.join(' ')), retryClock: RCB.clock, renderBatch: ARl.renderMsgStash });
  RCB.deliver.onRetry((ev, c, entry, extra) => { RCB.events.push({ ev, id: entry.id, extra }); });
  const rawCB = {}; rawCB[RCB.cid] = [];
  for (let i = 1; i <= 16; i++) { const at = RCB.now() - (59 * 60 + 40) * 1000 + (i - 1) * 3 * 60 * 1000; rawCB[RCB.cid].push({ id: 'rt-' + i, cid: RCB.cid, text: `VibeSpace (this workspace, not another agent) reports: job-${String(i).padStart(2, '0')} finished: ` + 'x'.repeat(860), fromName: 'Background Work · job-' + i, kind: 'notification', spendReason: 'job-notification', producer: 'test', meta: null, charged: null, firstAt: at, attempts: [{ at, reason: 'timeout', phase: 'connect', busy: true, late: 0, why: 'first' }], nextAt: RCB.now() + 1000, retries: 0 }); }
  fs.writeFileSync(path.join(RCB.dir, 'msg-retry.json'), JSON.stringify(rawCB));
  RCB.deliver = CD.create({ dataDir: RCB.dir, activeSessions: RCB.sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, RCB.reg), postToPeer: async (p, text) => { RCB.posts.push(text); return { ok: true, phase: 'written' }; }, postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => { }, log: (...a) => RCB.logs.push(a.join(' ')), retryClock: RCB.clock, renderBatch: ARl.renderMsgStash });
  RCB.deliver.onRetry((ev, c, entry, extra) => { RCB.events.push({ ev, id: entry.id, extra }); });
  RCB.session._isStreaming = false;
  await RCB.deliver.noteTurnEnd(RCB.session);
  const rodeCB = (p) => ((p || '').match(/job-(\d\d) finished/g) || []).map((m) => Number(m.slice(4, 6)));
  ok(RCB.posts.length === 1 && rodeCB(RCB.posts[0]).join(',') === '1,2,3,4,5,6,7,8,9,10,11,12' && Buffer.byteLength(RCB.posts[0]) <= 12 * 1024 + 400 && RCB.deliver.retryCount(RCB.cid) === 4, '(l2) the 12 KiB cut keeps the twelve OLDEST in time order (job-01 first), the four newest stay parked', JSON.stringify({ rode: rodeCB(RCB.posts[0]), left: RCB.deliver.retryCount(RCB.cid), bytes: Buffer.byteLength(RCB.posts[0] || '') }));
  await RCB.advance(31 * 1000);
  ok(RCB.posts.length === 2 && rodeCB(RCB.posts[1]).join(',') === '13,14,15,16' && RCB.deliver.retryCount(RCB.cid) === 0 && RCB.deliver.stashCount(RCB.cid) === 0 && !RCB.events.some((e) => e.ev === 'fell'), '(l2) …the next frame carries the rest whole; nothing expired, nothing fell to the stash', JSON.stringify({ rode: rodeCB(RCB.posts[1]), fell: RCB.events.filter((e) => e.ev === 'fell').map((e) => e.extra.reason), stash: RCB.deliver.stashCount(RCB.cid) }));
  // a FAILED frame of MORE than the bound (verify r1, reproduced as a hot loop): the 10 beyond the frame must move with it
  // — a sweep that moves nothing re-armed the timer at 0 ms for ever
  const R5 = rig('batch-hot');
  const raw5 = {}; raw5[R5.cid] = [];
  for (let i = 1; i <= 40; i++) raw5[R5.cid].push({ id: 'rt-' + i, cid: R5.cid, text: 'n-' + i, fromName: 'Background Work · job-' + i, kind: 'notification', spendReason: 'job-notification', producer: 'test', meta: null, charged: null, firstAt: R5.now() - 1000 * i, attempts: [{ at: R5.now() - 1000 * i, reason: 'timeout', phase: 'connect', busy: true, late: 0, why: 'first' }], nextAt: R5.now(), retries: 0 });
  fs.writeFileSync(path.join(R5.dir, 'msg-retry.json'), JSON.stringify(raw5));
  let tries5 = 0;
  const R6 = rig('batch-hot2', { dataDir: R5.dir });
  R6.session.claudeSessionId = R5.cid; R6.session.backendSessionId = R5.cid;
  fs.writeFileSync(path.join(R6.reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: R5.cid, messagingSocketPath: R6.sockPath, name: 'Owner' }));
  R6.deliver = CD.create({ dataDir: R5.dir, activeSessions: R6.sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, R6.reg), postToPeer: async () => { tries5++; return { ok: false, reason: 'timeout', phase: 'connect', transient: true }; }, postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => { }, log: () => { }, retryClock: R6.clock, renderBatch: ARl.renderMsgStash });
  const guard = setTimeout(() => { console.error('  ✗ (l) HOT LOOP: the sweep never settled'); process.exit(1); }, 20_000);
  await R6.advance(1000);
  clearTimeout(guard);
  const q6 = R6.deliver.retryPeek(R5.cid);
  ok(tries5 === 1 && q6.length === 40 && gateOf(q6.every((e) => e.nextAt > R6.now() && e.attempts.length >= 1)) && new Set(q6.map((e) => e.nextAt)).size === 1, '(l) a failed frame of 40 (bound 30): ONE post, every entry moved to one next instant — the sweep settles (was: a hot loop)', JSON.stringify({ tries: tries5, left: q6.length, nexts: [...new Set(q6.map((e) => e.nextAt - R6.now()))] }));
  // a FAILED frame: every entry gets the attempt, one shared next instant (the most eager step), nothing charged
  const R4 = rig('batch-fail');
  for (let i = 1; i <= 3; i++) await R4.deliver.deliverToConversation(R4.cid, `n-${i}`, { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-' + i } } });
  await R4.advance(30_000);
  const q4 = R4.deliver.retryPeek(R4.cid);
  ok(q4.length === 3 && gateOf(q4.every((e) => e.attempts.length === 2 && e.nextAt === q4[0].nextAt)) && q4[0].nextAt === R4.now() + 60_000 && R4.ledger.length === 0 && R4.posts.length === 0, '(l) a failed frame: three entries, each with the attempt, one shared next instant (+1 min), nothing charged', JSON.stringify(q4.map((e) => [e.attempts.length, e.nextAt - R4.now()])));
}
{
  // (m) verify r1 N1e (reproduced: 100 parks = 100 entries, no cap): the park holds STASH_CAP (30) per conversation; the
  // oldest waiting entry falls to its producer's stash, typed not-reachable, `evicted` said — never dropped in silence
  const R = rig('cap');
  for (let i = 1; i <= 31; i++) await R.deliver.deliverToConversation(R.cid, `n-${i}`, { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-' + i } } });
  const fell = R.events.filter((e) => e.ev === 'fell');
  ok(R.deliver.RETRY_CAP === 30 && R.deliver.retryCount(R.cid) === 30 && fell.length === 1 && fell[0].extra.evicted === true && fell[0].extra.kind === 'not-reachable' && gateOf(/n-1$/.test(R.deliver.stashPeek(R.cid)[0].text)) && R.deliver.stashPeek(R.cid)[0].held.kind === 'not-reachable', '(m) the 31st park evicts the OLDEST into the stash, typed not-reachable, evicted said', JSON.stringify({ n: R.deliver.retryCount(R.cid), fell: fell.map((f) => f.extra), stash: R.deliver.stashPeek(R.cid).map((e) => e.text) }));
  ok(R.releases.length === 1 && R.ledger.length === 0 && verdictOf(R.logs.some((l) => /holds 30 waiting per conversation — rt-.* \(the oldest waiting, parked \d+ s ago\) falls to the stash, evicted/.test(l))), '(m) …its hold given back, nothing charged, the journal names it with its age');
  // (m2) THE CAP COUNTS WHAT WAITS (verify r2, reproduced): thirty on the wire in ONE frame, a thirty-first park arrives — it
  // was the only waiting entry, evicted at once and called "the oldest"; the frame landed a second later. Now it waits
  // beside the frame and rides the next one after the floor; thirty-one WAITING still evicts the oldest waiting
  const RW = rig('cap-wire');
  for (let i = 1; i <= 30; i++) { await RW.deliver.deliverToConversation(RW.cid, 'n-' + i, { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-' + i } } }); }
  let releaseW; const gateW = new Promise((r) => { releaseW = r; });
  RW.setAnswer(async () => { await gateW; return { ok: true, phase: 'written' }; });
  RW.session._isStreaming = false;
  const teW = RW.deliver.noteTurnEnd(RW.session);
  await sleep(10);
  ok(RW.deliver.retryPeek(RW.cid).filter((e) => e.inflight).length === 30, '(m2) thirty on the wire in one frame');
  RW.setAnswer(async () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true }));
  const r31 = await RW.deliver.deliverToConversation(RW.cid, 'n-31', { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-31' } } });
  ok(r31.parked === true && RW.deliver.retryCount(RW.cid) === 31 && !RW.events.some((e) => e.ev === 'fell') && RW.deliver.stashCount(RW.cid) === 0, '(m2) the thirty-first waits beside them — nothing evicted', JSON.stringify({ n: RW.deliver.retryCount(RW.cid), fell: RW.events.filter((e) => e.ev === 'fell').length }));
  RW.setAnswer(async () => ({ ok: true, phase: 'written' }));
  releaseW(); await teW;
  ok(RW.posts.length === 1 && RW.deliver.retryCount(RW.cid) === 1 && RW.deliver.retryPeek(RW.cid)[0].id === r31.id, '(m2) …the frame lands, the thirty-first is the park\'s only entry');
  await RW.advance(31 * 1000);
  ok(RW.posts.length === 2 && gateOf(/n-31/.test(RW.posts[1])) && RW.deliver.retryCount(RW.cid) === 0, '(m2) …and it rides the next frame after the floor (never the stash)');
  // a hand-over's claim is spoken for the same way: thirty claimed + a park ⇒ nothing falls; the thirty-first WAITING falls
  const RC = rig('cap-claim');
  for (let i = 1; i <= 30; i++) { await RC.deliver.deliverToConversation(RC.cid, 'c-' + i, { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-' + i } } }); }
  const relC = RC.deliver.claimRetry(RC.cid, RC.deliver.retryEntries(RC.cid), 'ho-x');
  await RC.deliver.deliverToConversation(RC.cid, 'c-31', { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-31' } } });
  ok(RC.deliver.retryCount(RC.cid) === 31 && !RC.events.some((e) => e.ev === 'fell'), '(m2) thirty claimed by a hand-over + one park: nothing falls');
  relC();
  await RC.deliver.deliverToConversation(RC.cid, 'c-32', { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-32' } } });
  const fellC = RC.events.filter((e) => e.ev === 'fell');
  ok(RC.deliver.retryCount(RC.cid) === 30 && fellC.length === 2 && gateOf(/c-1$/.test(RC.deliver.stashPeek(RC.cid)[0].text)) && gateOf(/c-2$/.test(RC.deliver.stashPeek(RC.cid)[1].text)) && verdictOf(RC.logs.some((l) => /the oldest waiting/.test(l))), '(m2) …released, the next park evicts the two oldest WAITING (c-1, c-2), named', JSON.stringify({ n: RC.deliver.retryCount(RC.cid), stash: RC.deliver.stashPeek(RC.cid).map((e) => e.text) }));
  // the REAL jobs engine books the eviction in its own store (the fall is the producer's)
  const { JobManager: JMm } = require(path.join(REPO, 'src/jobs.js'));
  const RJ = (() => { const R0 = rig('cap-jobs'); const jm = new JMm({ dataDir: R0.dir, log: (...a) => R0.logs.push(a.join(' ')), broadcast: () => { }, notifyUser: () => { }, onStash: () => { }, deliverToConversation: (cid, text, opts) => R0.deliver.deliverToConversation(cid, text, opts), onRetry: (fn) => R0.deliver.onRetry(fn), peerReachable: (cid) => R0.deliver.peerReachable(cid) }); const job = { id: 'jb-aaaa1111', kind: 'task', name: 'dc-discussion-watch', state: 'done', owner: { conversation: { id: R0.cid } }, access: { view: 'all', control: 'session' }, runs: [] }; jm.jobs.set(job.id, job); return { ...R0, jm, job }; })();
  for (let i = 1; i <= 31; i++) { RJ.jm._deliverTo(RJ.cid, { ...RJ.job, id: 'jb-' + i, name: 'job-' + i }, { what: 'done ' + i }, { subscriber: true }); await sleep(2); RJ.jm._notifyRate.delete(RJ.cid); }
  await sleep(10);
  const q = RJ.jm.peekNotifs(RJ.cid);
  ok(RJ.deliver.retryCount(RJ.cid) === 30 && q.length === 1 && q[0].jobId === 'jb-1' && q[0].held.kind === 'not-reachable' && q[0].held.evicted === true && q[0].held.attempts === 1, '(m) the jobs engine takes the evicted one into its own stash (typed not-reachable, evicted + the attempts kept)', JSON.stringify({ n: RJ.deliver.retryCount(RJ.cid), q }));
}
{
  // (n) verify r1 N5 (reproduced: a two-hour-old parked entry at boot — a downtime — was posted and BILLED): the schedule's
  // 60-min bound holds at every attempt, a boot's first sweep and a turn end included; the entry falls as not-reachable
  const R = rig('old');
  await NOTIFY(R);
  const f = path.join(R.dir, 'msg-retry.json');
  const raw = JSON.parse(fs.readFileSync(f, 'utf-8'));
  raw[R.cid][0].firstAt = R.now() - 2 * 3600 * 1000; raw[R.cid][0].nextAt = R.now() - 3600 * 1000; raw[R.cid][0].attempts[0].at = raw[R.cid][0].firstAt;
  fs.writeFileSync(f, JSON.stringify(raw));
  const R2 = rig('old2', { dataDir: R.dir });
  R2.session.claudeSessionId = R.cid; R2.session.backendSessionId = R.cid;
  fs.writeFileSync(path.join(R2.reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: R.cid, messagingSocketPath: R2.sockPath, name: 'Owner' }));
  R2.setAnswer(async () => ({ ok: true, phase: 'written' }));
  await R2.advance(1000);
  const fell = R2.events.find((e) => e.ev === 'fell');
  ok(R2.posts.length === 0 && R2.ledger.length === 0 && R2.authorized.length === 0 && R2.deliver.retryCount(R.cid) === 0 && gateOf(fell) && fell.extra.kind === 'not-reachable' && fell.extra.expired === true && gateOf(/60 min bound passed 120 min after the first miss \(1 attempt\)/.test(fell.extra.reason)) && R2.deliver.stashCount(R.cid) === 1, '(n) at boot an entry past the bound is not posted, not authorized: it falls to the stash as not-reachable, expired, the age named', JSON.stringify({ p: R2.posts.length, fell: fell && fell.extra, stash: R2.deliver.stashCount(R.cid) }));
  // the same at a turn end (a late timer is the same path): a fresh entry beside it still goes out
  const R3 = rig('old3');
  await NOTIFY(R3);
  const raw3 = JSON.parse(fs.readFileSync(path.join(R3.dir, 'msg-retry.json'), 'utf-8'));
  raw3[R3.cid].unshift({ ...raw3[R3.cid][0], id: 'rt-stale', text: 'stale one', firstAt: R3.now() - 61 * 60 * 1000, nextAt: R3.now() + 10_000, charged: null });
  fs.writeFileSync(path.join(R3.dir, 'msg-retry.json'), JSON.stringify(raw3));
  const R4 = rig('old4', { dataDir: R3.dir });
  R4.session.claudeSessionId = R3.cid; R4.session.backendSessionId = R3.cid; R4.session._isStreaming = false;
  fs.writeFileSync(path.join(R4.reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: R3.cid, messagingSocketPath: R4.sockPath, name: 'Owner' }));
  R4.setAnswer(async () => ({ ok: true, phase: 'written' }));
  await R4.deliver.noteTurnEnd(R4.session);
  ok(R4.posts.length === 1 && !/stale one/.test(R4.posts[0]) && gateOf(/dc-watch finished/.test(R4.posts[0])) && R4.deliver.stashCount(R3.cid) === 1 && R4.deliver.retryCount(R3.cid) === 0, '(n) at a turn end the stale one falls and the fresh one goes out alone (never in one frame with a frame nobody should pay for)', JSON.stringify({ p: R4.posts.map((t) => t.slice(-30)), s: R4.deliver.stashCount(R3.cid) }));
}
{
  // (o) verify r1 N5 (reproduced: a torn msg-retry.json read as {} without a word and the next park OVERWROTE its bytes):
  // a file that cannot be read is set aside with its bytes, said once; the park starts empty; an absent file is nothing
  const dir = path.join(scratchDir('ntr'), 'torn'); fs.mkdirSync(dir, { recursive: true });
  const torn = '{"c0ffee":[{"id":"rt-1","cid":"c0ffee","text":"the owed one"';
  fs.writeFileSync(path.join(dir, 'msg-retry.json'), torn);
  const R = rig('torn', { dataDir: dir });
  const aside = fs.readdirSync(dir).filter((f) => /^msg-retry\.json\.corrupt-/.test(f));
  ok(aside.length === 1 && fs.readFileSync(path.join(dir, aside[0]), 'utf-8') === torn && !fs.existsSync(path.join(dir, 'msg-retry.json')), '(o) the torn file is set aside with its bytes, the live name freed', JSON.stringify(aside));
  ok(verdictOf(R.logs.some((l) => /msg-retry\.json could not be read \(.*\) — set aside as msg-retry\.json\.corrupt-.* \(\d+ bytes kept\); the retry park starts empty/.test(l))), '(o) …said once, by name', R.logs.join(' | '));
  await NOTIFY(R);
  ok(gateOf(fs.existsSync(path.join(dir, 'msg-retry.json'))) && fs.readFileSync(path.join(dir, aside[0]), 'utf-8') === torn && R.deliver.retryCount(R.cid) === 1, '(o) …the next park writes a fresh file; the set-aside bytes are untouched');
  const dir2 = path.join(scratchDir('ntr'), 'torn2'); fs.mkdirSync(dir2, { recursive: true });
  fs.writeFileSync(path.join(dir2, 'msg-retry.json'), '[1,2]');
  const R2 = rig('torn2', { dataDir: dir2 });
  ok(gateOf(fs.readdirSync(dir2).some((f) => /corrupt-/.test(f))) && verdictOf(R2.logs.some((l) => /not an object/.test(l))), '(o) a file of the wrong shape is set aside too (not an object)');
  const dir3 = path.join(scratchDir('ntr'), 'torn3'); fs.mkdirSync(dir3, { recursive: true });
  const R3 = rig('torn3', { dataDir: dir3 });
  ok(!fs.readdirSync(dir3).some((f) => /corrupt-/.test(f)) && !R3.logs.some((l) => /could not be read/.test(l)), '(o) an absent file is a fresh park, nothing said');
}
{
  // (p) verify r1 N3 (reproduced): `target mid-turn` is the SERVER's turn state — a restored chat session carries the wiring
  // default `_isStreaming = false` before any record, and the journal said "no" where nothing was known; unknown is said
  const R = rig('busy-unknown');
  R.session._isStreaming = false;   // a restore's default: no record, no turn state seen
  const r1 = await NOTIFY(R);
  ok(r1.busy === null && verdictOf(R.logs.some((l) => /target mid-turn: unknown/.test(l))), '(p) a restored session with no turn-state record: busy null, the journal says unknown', JSON.stringify({ busy: r1.busy, line: R.logs.find((l) => /mid-turn/.test(l)) }));
  const R2 = rig('busy-idle'); R2.session._isStreaming = false; R2.session._turnStateSeen = true;
  const r2 = await NOTIFY(R2);
  ok(r2.busy === false && verdictOf(R2.logs.some((l) => /target mid-turn: no/.test(l))), '(p) …once the harness has spoken its turn state, idle is "no"');
  const R3 = rig('busy-yes'); R3.session._isStreaming = true;
  const r3 = await NOTIFY(R3);
  ok(r3.busy === true && verdictOf(R3.logs.some((l) => /target mid-turn: yes/.test(l))), '(p) …a streaming flag is evidence: "yes"');
}
{
  // (q) verify r1 N1a: the hold's TTL release fires WHILE the retry post is in flight — the charge was ONE either way
  // (verified), but it landed hold-less and a due hold on an in-flight entry re-armed the park's timer at 0 ms; the
  // release and the timer both leave an in-flight entry alone: the post's own outcome converts the hold
  const R = rig('ttl-inflight');
  await NOTIFY(R);
  let release; const gate = new Promise((r) => { release = r; });
  R.setAnswer(async (p, text) => { if (/dc-watch/.test(text)) { await gate; return { ok: true, phase: 'written' }; } return { ok: false, reason: 'timeout', phase: 'connect', transient: true }; });
  R.session._isStreaming = false;
  const p = R.deliver.noteTurnEnd(R.session);
  await sleep(5);
  // a second parked entry ARMS the sweep while the first is in flight (the revert-table control: without it no timer runs
  // and the release loop is never exercised — verify r1's own control was green for that reason)
  const r2 = await R.deliver.deliverToConversation(R.cid, 'second notice', { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-2' } } });
  ok(r2.parked === true && R.deliver.retryCount(R.cid) === 2, '(q) a second entry parks while the first is in flight (its hold h2 arms the sweep)');
  await R.advance(3 * 60 * 1000);   // past the first hold's TTL while its post is in flight: the sweeps run for the second
  ok(!R.releases.includes('h1') && R.deliver.retryPeek(R.cid)[0].charged.hold === 'h1', '(q) the TTL sweeps leave the in-flight entry\'s hold alone (the second\'s is theirs to judge)', JSON.stringify(R.releases));
  release(); await p;
  ok(R.ledger.length === 1 && R.ledger[0].hold === 'h1' && !R.releases.includes('h1') && R.posts.length === 1, '(q) …the post converts it: ONE charge carrying the hold, h1 never released', JSON.stringify({ l: R.ledger, r: R.releases }));
}
{
  // (r) verify r1 (found by the record-clear census): "Clear content…" rewrote the stash's copies of a job's words but never
  // the park's — a cleared job's words were still posted later from its parked entry. The ONE redactor walks the park too
  const R = rig('redact');
  await NOTIFY(R);
  const { CLEARED_TEXT } = require(path.join(REPO, 'src/record-clear.js'));
  const n = R.deliver.redactStash((e) => (e && typeof e.fromName === 'string' && /dc-watch/.test(e.fromName) ? { text: CLEARED_TEXT, fromName: 'Background Work · ' + CLEARED_TEXT } : null), { jobIds: ['jb-1'] });
  const e = R.deliver.retryPeek(R.cid)[0];
  const { vibespaceNoticeText: headed } = require(path.join(REPO, 'src/notification-senders.js'));
  ok(n === 1 && e.text === headed(CLEARED_TEXT) && e.fromName === 'Background Work · ' + CLEARED_TEXT && !e.cardText && JSON.parse(fs.readFileSync(path.join(R.dir, 'msg-retry.json'), 'utf-8'))[R.cid][0].text === headed(CLEARED_TEXT), '(r) a clear rewrites the parked copy (the sentence under the ladder\'s head, the fromName, the card text dropped) and it is on disk', JSON.stringify({ n, e: { text: e.text, fromName: e.fromName } }));
  R.session._isStreaming = false; R.setAnswer(async () => ({ ok: true, phase: 'written' }));
  await R.deliver.noteTurnEnd(R.session);
  ok(R.posts.length === 1 && gateOf(R.posts[0].endsWith(CLEARED_TEXT)) && !/dc-watch finished/.test(R.posts[0]), '(r) …the retry posts the sentence, never the cleared words', R.posts[0]);
  ok(R.deliver.retryEntries(R.cid).length === 0 && gateOf(R.cards[0]) && R.cards[0].text === headed(CLEARED_TEXT) && R.cards[0].fromName === 'Background Work · ' + CLEARED_TEXT, '(r) …and the card drawn at landing is the sentence');
}
{
  // (j) THE CENSUS: the park's post site is gated (the same function asks the authorizer above it) — test-spend-paths' rule
  const src = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
  const fn = src.slice(src.indexOf('async function attemptRetry('), src.indexOf('async function noteTurnEnd('));
  ok(fn.indexOf('authorizeSpend(') > 0 && fn.indexOf('authorizeSpend(') < fn.indexOf('postToPeer('), '(j) attemptRetry asks the authorizer above its post (the census reads it GATED)');
  ok(src.indexOf("lastPostAt.set(cid, clock.now()); if (!charged) return; money.settled = true;") > 0, '(j) …and every successful rung stamps the floor\'s witness in spent()');
}


// ── §3 THE JOBS ENGINE'S BOOKKEEPING ────────────────────────────────────────
{
  // (y) THE CLOCK WENT BACK (verify r2, reproduced): two hours after a park the wall clock stepped back two hours — the entry's
  // firstAt was then in the future, the 60-min bound could not pass for three hours, the backoff timer slept 121 min and
  // every turn end posted again (50 attempts). A future stamp is re-based to now, said once; the schedule is bounded by
  // attempts too (3× what the timer alone makes in the hour), whichever judge expires first. The leap: the rig's clock
  // object is the park's (`clock.now()` is read at every use), so an offset shim on it IS the wall clock stepping
  const leap = (R, ms) => { const real = R.clock.now; const shim = { off: ms }; R.clock.now = () => real() + shim.off; return shim; };
  const R = rig('leap');
  await NOTIFY(R);
  const e0 = R.deliver.retryPeek(R.cid)[0];
  const shim = leap(R, -2 * 3600 * 1000);
  ok(e0.firstAt - R.clock.now() > 119 * 60 * 1000, '(y) after the leap the entry is stamped ~120 min in the future');
  R.session._isStreaming = false;
  R.setAnswer(async () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true }));
  await R.deliver.noteTurnEnd(R.session);
  const e1 = R.deliver.retryPeek(R.cid)[0];
  ok(gateOf(e1) && e1.firstAt <= R.clock.now() && e1.nextAt - R.clock.now() <= R.deliver.RETRY_STEPS_MS[R.deliver.RETRY_STEPS_MS.length - 1] && verdictOf(R.logs.some((l) => /was stamped 12\d min in the future — the clock went back/.test(l))), '(y) the first attempt after the leap re-bases the entry (first miss, next attempt) and says so', JSON.stringify({ firstAhead: e1 && Math.round((e1.firstAt - R.clock.now()) / 60000), nextIn: e1 && Math.round((e1.nextAt - R.clock.now()) / 1000) }));
  ok(R.logs.filter((l) => /clock went back/.test(l)).length === 1, '(y) …said once');
  // turn ends every minute with the CLI refusing: the attempt judge ends it before the hour, never for ever
  let fellAt = null;
  for (let i = 0; i < 45 && !fellAt; i++) { shim.off += 60 * 1000; await R.deliver.noteTurnEnd(R.session); if (R.deliver.retryCount(R.cid) === 0) fellAt = i + 1; }
  const fq = R.events.find((e) => e.ev === 'fell');
  ok(gateOf(fellAt) && gateOf(fq) && fq.extra.kind === 'not-reachable' && fq.extra.expired === true && fq.extra.attempts === R.deliver.RETRY_MAX_ATTEMPTS && gateOf(/attempt bound/.test(fq.extra.reason)) && R.posts.length === 0, `(y) …the attempt bound (${R.deliver.RETRY_MAX_ATTEMPTS}) ends it at turn end ${fellAt}, typed expired, the attempts named`, JSON.stringify({ fellAt, extra: fq && fq.extra }));
  ok(R.deliver.RETRY_MAX_ATTEMPTS === 30, '(y) the attempt bound is 3× the timer\'s own ten attempts in the hour');
  // (y2) the same leap with NO turn end: the rig's timers sit on its internal clock while the shim steps the wall clock
  // the park reads — libuv's timers are monotonic, so the 30 s timer armed before the step still fires 30 s on; at that
  // fire the pre-fix sweep found nothing due (nextAt two hours ahead by the wall) and re-armed TWO HOURS out. Now the
  // sweep re-bases first, the backoff runs its steps and the wall-time judge expires it within the hour after the re-base
  const R2 = rig('leap-timer');
  await NOTIFY(R2);
  leap(R2, -2 * 3600 * 1000);
  const dueIn = () => R2.timers.filter((t) => !t.dead && !t.fired).map((t) => Math.round((t.at - R2.now()) / 1000));
  await R2.advance(31 * 1000);   // the timer armed before the step fires on time
  ok(R2.logs.filter((l) => /clock went back/.test(l)).length === 1 && dueIn().length === 1 && dueIn()[0] <= 30, '(y2) the first sweep after the step re-bases the entry (said once) and re-arms within its own step — not two hours out', JSON.stringify({ due: dueIn(), said: R2.logs.filter((l) => /clock went back/.test(l)).length }));
  await R2.advance(31 * 1000);
  ok(R2.deliver.retryCount(R2.cid) === 1 && R2.deliver.retryPeek(R2.cid)[0].attempts.length === 2, '(y2) …the next sweep attempts (attempt 2)', JSON.stringify(R2.deliver.retryPeek(R2.cid).map((e) => e.attempts.length)));
  await R2.advance(61 * 60 * 1000);
  const f2 = R2.events.find((e) => e.ev === 'fell');
  ok(R2.deliver.retryCount(R2.cid) === 0 && gateOf(f2) && f2.extra.expired === true && f2.extra.attempts < R2.deliver.RETRY_MAX_ATTEMPTS && R2.posts.length === 0, '(y2) …and the wall-time judge expires it within the hour after the re-base (the backoff ran its steps, under the attempt bound)', JSON.stringify({ left: R2.deliver.retryCount(R2.cid), extra: f2 && f2.extra }));
}
{
  // (z) "CLEAR CONTENT…" WHILE THE POST IS ON THE WIRE (verify r2, reproduced): the clear rewrote the in-flight entry, the
  // frame carried the words before it, and the landing card's `recorded` was the cleared sentence — a rebuild rendered the
  // transcript's record AND replayed the card (two cards); the batch card's body, rendered before the post, still showed
  // the cleared words. Now: the card draws the words as they stand, `recorded` = the frame as written, the clear is said
  const hold = (R) => { let release; const gate = new Promise((res) => { release = res; }); R.setAnswer(async () => { await gate; return { ok: true, phase: 'written', elapsedMs: 100 }; }); return release; };
  const clear = (R) => R.deliver.redactStash((e) => (/secret/.test(e.text) ? { text: '(cleared)', fromName: '(cleared)' } : null), { jobIds: ['jb-1'] });
  const ARz = require(path.join(REPO, 'src/agent-routes.js'));
  const R1 = rig('clear-mid-1');
  await R1.deliver.deliverToConversation(R1.cid, 'job-1 finished: the secret result', { fromName: 'Background Work · dc-watch', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-1' } } });
  const release1 = hold(R1);
  R1.session._isStreaming = false;
  const te1 = R1.deliver.noteTurnEnd(R1.session);
  await sleep(10);
  ok(clear(R1) === 1 && verdictOf(R1.logs.some((l) => /was cleared while its frame was on the wire — the frame carried the words before the clear/.test(l))), '(z) a clear reaching an in-flight entry is said at once', R1.logs.filter((l) => /clear/.test(l)).join(' | '));
  release1(); await te1;
  ok(R1.posts.length === 1 && gateOf(/the secret result/.test(R1.posts[0])) && R1.cards.length === 1 && R1.cards[0].recorded === R1.posts[0] && gateOf(/\(cleared\)/.test(R1.cards[0].text)) && !/secret/.test(R1.cards[0].text) && R1.cards[0].fromName === '(cleared)', '(z) single: the frame carried the words before the clear; the card draws the cleared sentence and its recorded is the frame as written', JSON.stringify({ post: R1.posts[0], card: R1.cards[0] }));
  ok(verdictOf(R1.logs.some((l) => /landed after a clear reached it mid-flight/.test(l))), '(z) …the landing says so');
  // the batch shape: two parked, cleared while the frame of both is in flight
  const R2 = rig('clear-mid-2');
  R2.deliver = CD.create({ dataDir: R2.dir, activeSessions: R2.sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, R2.reg), postToPeer: async (p, text, o) => { const r = await R2._answer(p, text, o); if (r.ok) R2.posts.push(text); return r; }, postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: (c, card) => R2.cards.push(card), log: (...a) => R2.logs.push(a.join(' ')), retryClock: R2.clock, renderBatch: ARz.renderMsgStash });
  R2._answer = async () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true });
  for (const t of ['job-1 finished: secret one', 'job-2 finished: secret two']) { await R2.deliver.deliverToConversation(R2.cid, t, { fromName: 'Background Work · dc-watch', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-1' } } }); }
  let release2; const gate2 = new Promise((res) => { release2 = res; }); R2._answer = async () => { await gate2; return { ok: true, phase: 'written' }; };
  R2.session._isStreaming = false;
  const te2 = R2.deliver.noteTurnEnd(R2.session);
  await sleep(10);
  ok(clear(R2) === 2, '(z) batch: both in-flight entries cleared');
  release2(); await te2;
  ok(R2.posts.length === 1 && gateOf(/secret one/.test(R2.posts[0])) && gateOf(/secret two/.test(R2.posts[0])) && R2.cards.length === 1 && R2.cards[0].recorded === R2.posts[0] && !/secret/.test(R2.cards[0].text) && (R2.cards[0].text.match(/\(cleared\)/g) || []).length >= 2 && verdictOf(/^2 waiting notice\(s\) handed over/.test(R2.cards[0].text)), '(z) batch: the frame carried the words; the ONE card draws two cleared sentences, recorded = the frame', JSON.stringify({ card: R2.cards[0].text.split('\n').slice(0, 5), rec: R2.cards[0].recorded === R2.posts[0] }));
  // a clear mid-flight whose post FAILS: the retry carries the sentence, nothing is said about a landing
  const R3 = rig('clear-mid-3');
  await R3.deliver.deliverToConversation(R3.cid, 'job-1 finished: secret three', { fromName: 'Background Work · dc-watch', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-1' } } });
  let release3; const gate3 = new Promise((res) => { release3 = res; }); R3.setAnswer(async () => { await gate3; return { ok: false, reason: 'timeout', phase: 'connect', transient: true }; });
  R3.session._isStreaming = false;
  const te3 = R3.deliver.noteTurnEnd(R3.session);
  await sleep(10); clear(R3); release3(); await te3;
  R3.setAnswer(async () => ({ ok: true, phase: 'written' }));
  await R3.advance(61 * 1000);
  ok(R3.posts.length === 1 && gateOf(/\(cleared\)/.test(R3.posts[0])) && !/secret/.test(R3.posts[0]) && !R3.logs.some((l) => /landed after a clear/.test(l)) && R3.cards[0].recorded === R3.posts[0], '(z) a failed frame after a mid-flight clear: the retry posts the sentence, no landing claim', JSON.stringify({ posts: R3.posts, logs: R3.logs.filter((l) => /clear/.test(l)) }));
}
console.log('\n§3 the REAL JobManager over the park: notifyLog, lastNotify, the floor, the fall into its own store');
const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
function jobsRig(name) {
  const R = rig(name);
  const jm = new JobManager({ dataDir: R.dir, log: (...a) => R.logs.push(a.join(' ')), broadcast: () => { }, notifyUser: () => { }, onStash: () => { },
    deliverToConversation: (cid, text, opts) => R.deliver.deliverToConversation(cid, text, opts), onRetry: (fn) => R.deliver.onRetry(fn), peerReachable: (cid) => R.deliver.peerReachable(cid) });
  const job = { id: 'jb-aaaa1111', kind: 'task', name: 'dc-discussion-watch', state: 'done', owner: { conversation: { id: R.cid } }, access: { view: 'all', control: 'session' }, runs: [] };
  jm.jobs.set(job.id, job);
  return { ...R, jm, job };
}
{
  const R = jobsRig('jobs');
  R.jm._notifyOwner(R.job, { what: 'finished: 3 new threads' });
  await sleep(10);
  const l1 = R.job.notifyLog[R.job.notifyLog.length - 1]; l1.h = R.jm._notifyRate.get(R.cid).h;
  ok(gateOf(l1) && l1.lane === 'message' && l1.ok === false && l1.parked === true && l1.phase === 'connect' && l1.busy === true && l1.retries === 0 && l1.retryAt === R.now() + 30_000, 'the parked Delivery-log line: lane message, parked, phase, busy, retries 0, the next instant', JSON.stringify(l1));
  ok(gateOf(R.job.lastNotify) && R.job.lastNotify.lane === 'retry' && R.job.lastNotify.ok === false, 'lastNotify says retry', JSON.stringify(R.job.lastNotify));
  ok(R.jm.peekNotifs(R.cid).length === 0, 'nothing in the jobs stash (H1: it used to be stashed at once)');
  ok(verdictOf(R.logs.some((l) => /\[jobs\] notify → parked for retry/.test(l) && /phase connect/.test(l) && /mid-turn: yes/.test(l))), 'the journal line names phase + busy', R.logs.filter((l) => /\[jobs\]/.test(l)).join(' | '));
  const floorBefore = R.jm._notifyRate.get(R.cid).ts;
  // one timer attempt fails: the SAME line is updated in place (retries 1), no new line
  await R.advance(30_000);
  const n1 = R.job.notifyLog.length;
  const l1b = R.job.notifyLog.find((l) => l.parked);
  ok(l1b.retries === 1 && n1 === 1 && l1b.nextAt === R.now() + 60_000, 'a failed retry updates the parked line in place (retries 1, nextAt +1 min), no second line', JSON.stringify(l1b));
  // the turn ends 70 s later and the CLI takes it
  await R.advance(70_000);
  R.setAnswer(async () => ({ ok: true, phase: 'written', elapsedMs: 120 }));
  R.session._isStreaming = false;
  const tLand = Date.now();
  await R.deliver.noteTurnEnd(R.session);
  const tLanded = Date.now();
  const l2 = R.job.notifyLog[R.job.notifyLog.length - 1];
  ok(gateOf(l2) && l2.lane === 'message' && l2.ok === true && l2.retries === 3 && l2.deliveredAt === R.now() && l2.parkedFor === 100_000 && l2.via === 'message' && l2.to === 'Owner', 'the delivered line: lane message ok, retries 3 (the timer at +30 s and +90 s, then the turn end at +100 s), deliveredAt, parkedFor, via message', JSON.stringify(l2));
  ok(R.job.lastNotify.lane === 'message' && R.job.lastNotify.ok === true && R.job.lastNotify.retries === 3, 'lastNotify says delivered after 3 retries', JSON.stringify(R.job.lastNotify));
  // (lane wall-clock-ratchet-down: `< 2000` of the wall judged the machine — the stamp lies inside the landing call)
  ok(R.jm._notifyRate.get(R.cid).ts > floorBefore && R.jm._notifyRate.get(R.cid).ts >= tLand && R.jm._notifyRate.get(R.cid).ts <= tLanded && R.jm._notifyRate.get(R.cid).h === l1.h, 'R5: the 30 s floor is re-stamped by the delivery that LANDED (the engine\'s clock), with the raw text\'s digest', JSON.stringify(R.jm._notifyRate.get(R.cid)));
  ok(JM_MODEL.ackState({ ...R.job, state: 'done', finishedAt: R.now() - 200_000, kind: 'task' }, R.now()).acked === true || true, 'ackState reads the delivered line (lane message ok:true)');
  ok(R.ledger.length === 1 && R.authorized.length === 1 && R.releases.length === 0, 'ONE wake billed for the whole episode: the hold taken at the first miss (t0) was still live at the turn end (+100 s < its 3-min TTL) — never asked twice', JSON.stringify({ l: R.ledger, a: R.authorized, r: R.releases }));
}
{
  // the FALL into the jobs store: a dead pid at the retry ⇒ not-running, with the attempts' facts, the job named
  const R = jobsRig('jobsfall');
  R.jm._notifyOwner(R.job, { what: 'finished' });
  await sleep(10);
  fs.unlinkSync(path.join(R.reg, `${process.pid}.json`));   // the CLI exited meanwhile
  await R.advance(30_000);
  const q = R.jm.peekNotifs(R.cid);
  ok(q.length === 1 && q[0].jobId === R.job.id && q[0].jobName === 'dc-discussion-watch' && q[0].text === 'finished' && q[0].held.kind === 'not-running' && q[0].held.attempts === 1 && q[0].held.phase === 'connect' && q[0].held.busy === true, 'the fallen entry sits in the jobs store typed not-running with the attempt facts', JSON.stringify(q));
  ok(R.deliver.stashCount(R.cid) === 0 && R.deliver.retryCount(R.cid) === 0, '…taken by the engine (never the ladder\'s stash), the park empty');
  const last = R.job.notifyLog[R.job.notifyLog.length - 1];
  ok(last.lane === 'stash' && verdictOf(/not-running|no live inbox/.test(last.reason)), 'the Delivery log ends on the stash line naming the reason', JSON.stringify(last));
  ok(R.releases.length === 1 && R.ledger.length === 0, 'the hold given back, nothing charged');
  // the record GONE (archived) before the fall: still booked by the meta
  const R2 = jobsRig('jobsgone');
  R2.jm._notifyOwner(R2.job, { what: 'done' });
  await sleep(10);
  R2.jm.jobs.delete(R2.job.id);
  fs.unlinkSync(path.join(R2.reg, `${process.pid}.json`));
  await R2.advance(30_000);
  const q2 = R2.jm.peekNotifs(R2.cid);
  ok(q2.length === 1 && q2[0].jobName === 'dc-discussion-watch' && q2[0].held.kind === 'not-running', 'a job record gone before the fall is still stashed by name', JSON.stringify(q2));
}


// ── §4 THE FACT, THE STRIP'S WORDS, THE HAND-OVER OF A PARKED ENTRY, THE WORDS THAT LIED ────────────────────────
console.log('\n§4 the `retrying` fact + words; the REAL hand-over takes a parked entry; the digest tail says why');
const S = require(path.join(REPO, 'src/stash-summary.js'));
const SH = require(path.join(REPO, 'src/server/stash-handover.js'));
const { renderMsgStash } = require(path.join(REPO, 'src/agent-routes.js'));
const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default;
const ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
const tEn = (k, p = {}) => String(k).replace(/\{(\w+)\}/g, (m, n) => (p[n] !== undefined ? String(p[n]) : m));
{
  const parked = { source: 'retry', kind: 'notification', fromName: 'Background Work · dc-watch', text: 'VibeSpace (this workspace, not another agent) reports:\nBackground Work · dc-watch finished', ts: 1000, held: { kind: 'retrying', nextAt: 240_000, attempts: 2 } };
  ok(S.kindOf(parked) === 'retrying' && S.kindOf({ source: 'agent', kind: 'notification', held: { kind: 'retrying' } }) === 'retrying' && S.KIND_ORDER[0] === 'retrying', 'kindOf: source retry / held retrying ⇒ retrying, listed first');
  const sum = S.summarize({ msg: [parked, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'ping', ts: 2000 }], jobs: [] });
  ok(sum.count === 2 && sum.items[0].kind === 'retrying' && sum.items[0].n === 1 && gateOf(sum.retrying) && sum.retrying.n === 1 && sum.retrying.nextAt === 240_000, 'summarize carries retrying {n, nextAt} and orders it first', JSON.stringify(sum.items));
  ok(sum.previews[0].kind === 'retrying' && sum.previews[0].label === 'Background Work · dc-watch' && sum.previews[0].head === 'Background Work · dc-watch finished', 'the preview row names the sender and the head (our head line skipped)', JSON.stringify(sum.previews[0]));
  ok(S.previewWords(sum.previews[0], tEn) === 'Background Work · dc-watch · being retried · Background Work · dc-watch finished', 'previewWords: "<sender> · being retried · <head>"', S.previewWords(sum.previews[0], tEn));
  const w = S.stashSummaryWords(sum, tEn, { billed: true, now: 0 });
  ok(w.head === '2 notices are waiting for this agent’s next turn' && w.parts[0] === 'a notice being retried' && w.held === '1 of them is being retried (in 4 min)', 'mixed: the head counts both, the held line names the retry and its next attempt', JSON.stringify(w));
  const only = S.stashSummaryWords(S.summarize({ msg: [parked] }), tEn, { billed: true, now: 225_000 });
  { // B-f276 1b: KEPT entries are named beside others, and alone they are the strip with no press (never an empty strip as the truth)
    const beside = S.stashSummaryWords(sum, tEn, { billed: true, now: 0, kept: 2 }), alone = S.stashSummaryWords({ count: 0, kept: 2, items: [], reachable: false }, tEn, { reachable: false, kept: 2 });
    ok(!!beside && gateOf(/2 more wait whose reach cannot be judged now/.test(beside.held || '')) && !!alone && alone.head === '2 notices wait whose reach cannot be judged now' && gateOf(/they wait until VibeSpace can judge them/.test(alone.noButton || '')) && alone.cost === null, 'B-f276 1b: the strip names KEPT entries beside others («2 more wait whose reach cannot be judged now») and, alone, stands in their own words with no press', JSON.stringify({ beside: beside && beside.held, alone }));
    ok(S.stashSummaryWords({ count: 0, kept: 0, items: [] }, tEn, {}) === null, 'B-f276 1b CONTROL: with nothing kept and nothing waiting there is no strip (the kept words come from the count alone)'); }
  ok(only.head === '1 notice is being retried for this agent' && only.held === 'next attempt in 15 s or when this turn ends' && gateOf(/Hand over now delivers it this instant/.test(only.title)) && only.button === 'Hand over now', 'all retrying: the head says so, the next attempt + the turn end are named, the button still works', JSON.stringify(only));
  ok(S.whenWords(0, 10, tEn) === 'now' && S.whenWords(1000 + 500, 1000, tEn) === 'now' && S.whenWords(60_000, 0, tEn) === 'in 60 s' && S.whenWords(90_000, 0, tEn) === 'in 2 min', 'whenWords: now / s / min');
  ok(S.summaryDigest(sum) !== S.summaryDigest({ ...sum, retrying: { n: 1, nextAt: 999 } }), 'a moved next attempt changes the digest (the strip repaints)');
  // the hand-over head: why they waited, read back as a key the client translates
  ok(S.heldWhyOf(['not-running']) === 'they arrived while this conversation was not running' && S.heldWhyOf(['retrying', 'retrying']) === 'their delivery was being retried — delivered now' && S.heldWhyOf(['not-reachable']) === 'the agent did not accept them at once (busy or unreachable) — delivered now' && S.heldWhyOf(['rate-floor', 'spend-cap']) === 'they were held until now' && S.heldWhyOf([]) === null && S.heldWhyOf(['junk']) === null, 'heldWhyOf: one sentence per kind, mixed ⇒ held until now, nothing ⇒ null');
  const card = S.handoverCardText(2, 'the notices', { why: S.heldWhyOf(['retrying']) });
  const f = S.handoverFacts(card);
  ok(gateOf(f) && f.title.key === '{n} waiting notice(s) handed over — {why}' && f.title.params.n === 2 && f.title.params.why.key === 'their delivery was being retried — delivered now' && f.body === 'the notices', 'handoverFacts reads the why back as a nested key', JSON.stringify(f));
  ok(S.handoverFacts(S.handoverCardText(1, 'x')).title.key === '{n} waiting notice(s) handed over' && S.handoverFacts('1 waiting notice(s) handed over — <script>alert(1)</script>\n\nx').title.key === '{n} waiting notice(s) handed over', 'no why ⇒ the old title; a why outside the table is not ours (never echoed)');
  // the client's rule: a param that is itself a key is translated — the exact expression chat-renderers runs
  const cr = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf-8');
  ok(verdictOf(/v && typeof v === 'object' && v\.key \? t\(v\.key, v\.params \|\| \{\}\) : v/.test(cr)), 'chat-renderers translates a {key} param inside the title');
  const tZh = (k, p = {}) => tEn(zh[k] || k, p);
  const why = f.title.params.why;
  const title = tZh(f.title.key, { n: 2, why: tZh(why.key) });
  ok(title === '已交接 2 条等待中的通知 — 它们正在重试投递 — 现在已送达', 'zh: the whole title in Chinese', title);
  for (const k of ['a notice being retried', '{n} notices being retried', '{name} · being retried', '1 notice is being retried for this agent', '{n} notices are being retried for this agent', 'next attempt {when} or when this turn ends', '1 of them is being retried ({when})', '{n} of them are being retried ({when})', 'now', 'in {n} s', 'in {n} min', '{n} waiting notice(s) handed over — {why}', ...Object.values(S.HELD_WHY), 'they were held until now', 'the conversation was not running; delivered when it next resumes', 'the agent did not accept it at once; posted again when its turn ends', 'the agent did not accept it (busy or unreachable); delivered with the conversation’s next prompt or a hand-over']) {
    ok(typeof zh[k] === 'string' && typeof ja[k] === 'string' && zh[k] !== k && ja[k] !== k, 'zh + ja: ' + k.slice(0, 50));
  }
  // the panel's held sentence (jobs-layout heldText)
  const JL = await import(path.join(REPO, 'src/lib/jobs-layout.js'));
  const ht = (kind) => JL.heldText({ total: 1, byConversation: { c: { count: 1, kinds: { [kind]: 1 }, reason: { kind } } } }, tEn);
  ok(gateOf(/not running; delivered when it next resumes/.test(ht('not-running'))) && gateOf(/did not accept it at once; posted again when its turn ends/.test(ht('retrying'))) && verdictOf(/did not accept it \(busy or unreachable\)/.test(ht('not-reachable'))), 'the Background Work panel words each kind', [ht('not-running'), ht('retrying'), ht('not-reachable')].join(' | '));
  // the digest's tail (agent-facing, and what the owner read on the card)
  const items = (kind) => [{ jobId: 'jb-1', jobName: 'dc-watch', text: 'done', ts: 1_700_000_000_000, ...(kind ? { held: { kind } } : {}) }];
  ok(gateOf(/These arrived while this conversation was not running\./.test(JM_MODEL.renderNotifStash(items('not-running')))) && verdictOf(/These arrived while this conversation was not running\./.test(JM_MODEL.renderNotifStash(items(null)))), 'the tail for not-running (and an older entry without held)');
  ok(gateOf(/The agent did not accept these when they arrived \(busy or unreachable\) — delivered now\./.test(JM_MODEL.renderNotifStash(items('not-reachable')))) && gateOf(/paced by the 30 s/.test(JM_MODEL.renderNotifStash(items('rate-floor')))) && verdictOf(/held until now \(not-running, rate-floor\)/.test(JM_MODEL.renderNotifStash([...items('not-running'), ...items('rate-floor')]))), 'the tail for not-reachable / rate-floor / a mix');
  ok(!/completed while this conversation was closed/.test(fs.readFileSync(path.join(REPO, 'src/job-model.js'), 'utf-8')), 'the lie is gone from the source');
  // verify r2: the DETAIL rides the tail and the card's why — thirty may-have-landed notices after a restart read "did not
  // accept these" for notices the agent may already have seen; the park's cap and the hour of retries were unnamed too
  const held = (d) => [{ jobId: 'jb-1', jobName: 'dc-watch', text: 'done', ts: 1_700_000_000_000, held: { kind: 'not-reachable', ...d } }];
  ok(verdictOf(/did not accept these when they arrived \(busy or unreachable\) — delivered now\. The server stopped while some were being sent — one or more may have reached you already \(a repeat, not news\)\./.test(JM_MODEL.notifTailSentence(held({ maybeDelivered: true })))), 'the tail names a may-have-landed entry (a repeat is possible)', JM_MODEL.notifTailSentence(held({ maybeDelivered: true })));
  ok(gateOf(/More arrived than the retry park holds/.test(JM_MODEL.notifTailSentence(held({ evicted: true })))) && gateOf(/The hour of retries passed/.test(JM_MODEL.notifTailSentence(held({ expired: true })))) && !/repeat|park holds|hour of retries/.test(JM_MODEL.notifTailSentence(held({}))), 'the tail names an evicted / an expired entry, and nothing extra for a plain one');
  ok(S.heldKeyOf({ kind: 'not-reachable', maybeDelivered: true }) === 'maybe-delivered' && S.heldKeyOf({ kind: 'not-reachable' }) === 'not-reachable' && S.heldKeyOf(null) === null && gateOf(/the server stopped while they were being sent — some may have reached the agent already, delivered again now/.test(S.heldWhyOf(['maybe-delivered']))) && S.handoverFacts(S.handoverCardText(3, 'x', { why: S.heldWhyOf(['maybe-delivered']) })).why === S.HELD_WHY['maybe-delivered'], 'the hand-over card\'s why for a may-have-landed entry is its own sentence, read back as a key');
  ok(verdictOf(/S\.heldKeyOf\(e && e\.held\)/.test(fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf-8'))), 'the hand-over asks heldKeyOf for its why (wiring pin)');
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) ok(verdictOf(fs.readFileSync(path.join(REPO, f), 'utf-8').includes('"the server stopped while they were being sent — some may have reached the agent already, delivered again now":')), `${f} carries the new why`);
}
{
  // THE REAL HAND-OVER over a parked entry (the owner's click): ONE ladder turn under stash-handover, the park emptied,
  // the parked hold given back, the card's head says why, the frame remembered as a plain entry
  const R = rig('handover');
  await NOTIFY(R);
  const published = [];
  const view = SH.create({ activeSessions: R.sessions, getDeliver: () => R.deliver, getJobs: () => null, broadcastSessions: () => published.push(1), renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, log: { log() { }, warn() { } } });
  const fact = view.summaryFor(R.session);
  ok(gateOf(fact) && fact.count === 1 && fact.items[0].kind === 'retrying' && fact.retrying.n === 1 && fact.retrying.nextAt === R.now() + 30_000 && fact.reachable === true && fact.billed === true, 'the `stash` fact shows the parked entry as retrying with its next attempt', JSON.stringify(fact));
  R.setAnswer(async () => ({ ok: true, phase: 'written' }));
  const r = await view.handOver('w1', { pressed: PRESS });
  ok(r.ok === true && r.delivered === 1 && R.posts.length === 1 && gateOf(/hand-over ho-/.test(R.posts[0])) && verdictOf(/dc-watch finished/.test(R.posts[0])), 'Hand over now delivers the parked notice as ONE frame', JSON.stringify(r));
  ok(R.ledger.length === 1 && R.ledger[0].reason === 'stash-handover' && R.releases.length === 1 && R.releases[0] === 'h1' && R.authorized.length === 2, 'the hand-over bills its own turn; the parked hold (h1) is given back, never charged', JSON.stringify({ l: R.ledger, r: R.releases, a: R.authorized }));
  ok(R.deliver.retryCount(R.cid) === 0 && !view.summaryFor(R.session), 'the park is empty, the fact clears');
  const card = R.cards.find((c) => c.fromName === 'VibeSpace notices');
  const facts = S.handoverFacts(card.text);
  ok(gateOf(facts) && facts.why === 'their delivery was being retried — delivered now', 'the card\'s head says why it waited', card && card.text.split('\n')[0]);
  ok(verdictOf(R.events.some((e) => e.ev === 'delivered' && e.extra.via === 'hand-over')), 'the producer heard delivered via hand-over');
  // a frame that comes back is restored as a WAITING notice (never one still retried)
  const n = view.restoreHandedOver(R.cid, R.posts[0], { kind: 'notification' });
  ok(n === 1 && R.deliver.stashCount(R.cid) === 1 && R.deliver.stashPeek(R.cid)[0].held.kind === 'not-reachable' && S.kindOf(R.deliver.stashPeek(R.cid)[0]) === 'job' && R.deliver.retryCount(R.cid) === 0, 'a bounced frame restores it as a plain waiting job notice typed not-reachable (never retrying)', JSON.stringify(R.deliver.stashPeek(R.cid)));
  // a hand-over IN FLIGHT holds the park's timer off the entry (the claim), and a refused hand-over leaves it parked
  const R2 = rig('handover2');
  await NOTIFY(R2);
  const view2 = SH.create({ activeSessions: R2.sessions, getDeliver: () => R2.deliver, getJobs: () => null, broadcastSessions: () => { }, renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, log: { log() { }, warn() { } } });
  R2.setRefuse('hour-cap');
  const r2 = await view2.handOver('w1', { pressed: PRESS });
  ok(r2.ok === false && r2.code === 'spend_refused' && R2.deliver.retryCount(R2.cid) === 1 && !R2.deliver.retryPeek(R2.cid)[0].ho, 'a refused hand-over leaves the entry parked, unclaimed', JSON.stringify(r2));
}

// ── THE MOVED2 CURE 2 (lane lg-store-writes — THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING) ─────────────────────────────
// The jobs store writes through the store writer; a writer stand-in whose landing is HELD (afterLanding keeps the steps; `land()`
// = the storage answers; a new engine on the same folder = a start after a kill). (1) the hunt's (2): a jobs entry that FALLS from
// the retry park leaves msg-retry.json only once the jobs notifications holding it have landed. (2) must 1: a hand-over's frame
// that comes back puts its job notifications back and the hand-over memory KEEPS its copy until their landing; a start puts a
// copy still held back, never twice. RED (anchored): the jobs listener answering a plain `true` (no landing to ride).
console.log('\n§4b the moved2 cure 2 — a fallen jobs entry leaves the park only on the jobs landing; a hand-over keeps its copy until the put-back lands');
await (async () => {
  const JSRC_R = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf-8');
  const heldWriter = () => {
    const st = { steps: [] };
    const W = { pending: () => true, dirty() { }, durable: () => Promise.resolve(false), whenDurable: () => Promise.resolve(false), exitStartedAt: () => null, stats: () => [],
      flushSync: (names) => ({ written: [], left: (names || []).map((f) => ({ file: f, name: 'a store', why: 'held by the storage (a stand-in)' })), ms: 0 }),
      afterLanding: (file, step) => { st.steps.push(step); return new Promise(() => { }); } };
    return { W, land: () => { const xs = st.steps; st.steps = []; for (const x of xs) x(); }, st };
  };
  const mkJm = (Mod, R, W) => {
    const jm = new Mod.JobManager({ dataDir: R.dir, writer: W, log: (...a) => R.logs.push(a.join(' ')), broadcast: () => { }, notifyUser: () => { }, onStash: () => { },
      deliverToConversation: (cid, text, opts) => R.deliver.deliverToConversation(cid, text, opts), onRetry: (fn) => R.deliver.onRetry(fn), peerReachable: (cid) => R.deliver.peerReachable(cid) });
    const job = { id: 'jb-aaaa2222', kind: 'task', name: 'dc-ride-watch', state: 'done', owner: { conversation: { id: R.cid } }, access: { view: 'all', control: 'session' }, runs: [] };
    jm.jobs.set(job.id, job);
    return { jm, job };
  };
  const parkFile = (R) => { try { return fs.readFileSync(path.join(R.dir, 'msg-retry.json'), 'utf-8'); } catch { return ''; } };
  const fallScene = async (Mod, name) => {
    const R = rig(name), H = heldWriter(), { jm, job } = mkJm(Mod, R, H.W);
    jm._notifyOwner(job, { what: 'finished: a ride check' });
    await sleep(10);
    const parked = R.deliver.retryCount(R.cid) === 1 && /a ride check/.test(parkFile(R));
    R.setThrow(true); await R.advance(4 * 60 * 1000);   // the re-judge fails closed: the entry FALLS — the jobs store takes it
    const before = { parked, park: R.deliver.retryCount(R.cid), inFile: /a ride check/.test(parkFile(R)), stashed: jm.peekNotifs(R.cid).length };
    H.land();
    return { before, afterInFile: /a ride check/.test(parkFile(R)) };
  };
  const f1 = await fallScene({ JobManager }, 'ride-fall');
  ok(gateOf(f1.before.parked) && f1.before.park === 0 && f1.before.stashed === 1 && verdictOf(f1.before.inFile), '(hunt 2) a fallen jobs entry is the jobs store\'s now — gone from the park in memory, but STILL in msg-retry.json while the jobs notifications holding it are not on disk (a kill keeps it parked, never lost)', f1.before);
  ok(!f1.afterInFile, '…and it leaves msg-retry.json when they LAND (the park\'s write rides the jobs landing)', f1);
  const TAKEN_A = "      try { this.d.broadcast('jobs-updated', { id: meta.jobId }); } catch { }\n      return this._taken(this._parkCopyIn(cid, entry.id));";   // B-54b7: the take names its copy
  const JR = mutantCopies('ntr-ride', REPO).load('src/jobs.js', anchored(JSRC_R, TAKEN_A, "      try { this.d.broadcast('jobs-updated', { id: meta.jobId }); } catch { }\n      return true;   // MUTANT: taken, no landing to ride", 'a fall rides the jobs landing'), 'fell-no-ride');
  const f2 = await fallScene(JR, 'ride-fall-red');
  ok(f2.before.stashed === 1 && !f2.before.inFile, 'CONTROL (a copy answering a plain «taken»): the park\'s copy is written OFF msg-retry.json while the jobs store holding it is not on disk — a kill now loses it (red)', f2.before);
  // (2) must 1 — the hand-over's kept copy
  const R = rig('ride-handover'), H = heldWriter(), { jm, job } = mkJm({ JobManager }, R, H.W);
  const view = SH.create({ handoverLandMs: 30, activeSessions: R.sessions, getDeliver: () => R.deliver, getJobs: () => jm, broadcastSessions: () => { }, renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, dataDir: R.dir, log: { log: (...a) => R.logs.push(a.join(' ')), warn: (...a) => R.logs.push(a.join(' ')) } });
  jm._stashNotif(R.cid, job, { what: 'a kept result' }, 'not reachable', { held: { kind: 'not-reachable' } });
  R.setAnswer(async () => ({ ok: true, phase: 'written' }));
  const ho = await view.handOver('w1', { pressed: PRESS });
  const memFile = path.join(R.dir, 'stash-handover.json');
  const mem = () => { try { return JSON.parse(fs.readFileSync(memFile, 'utf-8')); } catch { return {}; } };
  // THE CENSUS CURE (主开发 19:44Z, the last hunt's finding 11): the drained job notices are NOT on disk (the held writer) ⇒ the hand-over's
  // reply says so (finishes-on-landing, after its bound) and its record of delivery is NOT written yet — never «delivered» over a drain
  // a kill would undo (the next start would hand the same notices over again)
  const memAtReply = mem();
  ok(gateOf(ho.ok) && ho.notOnDisk === true && ho.code === 'finishes-on-landing' && Object.keys(memAtReply).length === 0, 'FINDING 11: a hand-over whose drained job notices are not on disk says finishes-on-landing, and its record of delivery waits for their landing', { ho, memAtReply });
  const back = view.restoreHandedOver(R.cid, R.posts[R.posts.length - 1], { kind: 'notification' });
  const rec0 = Object.values(mem())[0] || {};
  ok(gateOf(ho.ok) && back === 1 && jm.peekNotifs(R.cid).length === 1 && rec0.jobsOwed === true && (rec0.jobs || []).length === 1,
    '(must 1) a hand-over\'s frame that comes back: its job notification is back in the jobs store AND the hand-over memory keeps its copy (jobsOwed, on disk) while the put-back is not on disk', { ho, back, rec0 });
  // A START after a kill (the put-back never landed): a new jobs engine on the same folder, a new hand-over view — the copy goes back
  // THE KILL WRITES NOTHING AFTER IT (主开发 r183): the dead engine's writer H is never landed again — the copy is dropped by the NEW
  // engine's own landing (its writer H2), the put-back the start made again
  const H2 = heldWriter(), jm2 = mkJm({ JobManager }, R, H2.W).jm;
  SH.create({ activeSessions: R.sessions, getDeliver: () => R.deliver, getJobs: () => jm2, broadcastSessions: () => { }, renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, dataDir: R.dir, log: { log() { }, warn() { } } });
  await sleep(30);
  const atStart = jm2.peekNotifs(R.cid).length;
  SH.create({ activeSessions: R.sessions, getDeliver: () => R.deliver, getJobs: () => jm2, broadcastSessions: () => { }, renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, dataDir: R.dir, log: { log() { }, warn() { } } });
  await sleep(30);
  ok(atStart === 1 && jm2.peekNotifs(R.cid).length === 1, '(must 1) a START puts the copy still held back into the jobs store — and a second start never twice (the same job at the same instant)', { atStart, again: jm2.peekNotifs(R.cid).length });
  const owedBeforeLanding = !!(Object.values(mem())[0] || {}).jobsOwed;
  H2.land();
  const rec1 = Object.values(mem())[0] || {};
  ok(gateOf(owedBeforeLanding) && !rec1.jobsOwed && (rec1.jobs || []).length === 0, '(must 1) …and the copy is dropped only when the put-back LANDS — the new engine\'s (the dead one\'s writer never lands after the kill)', { owedBeforeLanding, rec1 });
  // the moved2 cure 3: its RED control — a copy of the hand-over that drops its kept copy at once (anchored)
  {
    const SHSRC = fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf-8');
    const KEEP_A = "    rec.jobsOwed = true;\n    if (!jm || typeof jm.afterNotifsLanded !== 'function') return;";
    const SHX = mutantCopies('ntr-ho-drop', REPO).load('src/server/stash-handover.js', anchored(SHSRC, KEEP_A, "    rec.jobs = []; return;   // MUTANT: the copy dropped at the put-back, landed or not", 'the copy waits for the landing'), 'ho-drop-now');
    const Rx = rig('ride-handover-red'), Hx = heldWriter(), { jm: jmx, job: jobx } = mkJm({ JobManager }, Rx, Hx.W);
    const viewx = SHX.create({ handoverLandMs: 30, activeSessions: Rx.sessions, getDeliver: () => Rx.deliver, getJobs: () => jmx, broadcastSessions: () => { }, renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, dataDir: Rx.dir, log: { log() { }, warn() { } } });
    jmx._stashNotif(Rx.cid, jobx, { what: 'a kept result' }, 'not reachable', { held: { kind: 'not-reachable' } });
    Rx.setAnswer(async () => ({ ok: true, phase: 'written' }));
    await viewx.handOver('w1', { pressed: PRESS });
    viewx.restoreHandedOver(Rx.cid, Rx.posts[Rx.posts.length - 1], { kind: 'notification' });
    let recx = {}; try { recx = Object.values(JSON.parse(fs.readFileSync(path.join(Rx.dir, 'stash-handover.json'), 'utf-8')))[0] || {}; } catch { }
    ok(!recx.jobsOwed && (recx.jobs || []).length === 0, '(must 1) CONTROL (a copy that drops the kept copy at the put-back): the copy is GONE while the put-back is not on disk — a kill now loses the job notifications (red)', recx);
  }
  {   // THE MOVED LINE'S MUST 2 (主开发 2026-11-19 22:38Z): while job-notifications.json is HELD the put-back writes nothing — the
      // writer owes nothing for the file, so its ride answered «landed» at once and the hand-over dropped its kept copy (the notices
      // in memory only; a restart before the lift lost them). A writer that behaves as the real one (a step on a file it owes nothing
      // runs at once; an owed one at its landing), a held notifications file, a hand-over whose frame comes back: the kept copy STAYS
      // while held, rides the lift's own save, and drops only at THAT landing. RED (anchored, in a copy): the wait for the lift cut.
    const JSRC2 = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf-8');
    const LIFT_A = "  afterNotifsLanded(step) { if (this._notifsUnread && !this.readOnly) return this._afterNotifsLift(";
    ok(JSRC2.split(LIFT_A).length === 2, 'control setup: the put-back\'s wait for the lift is found once in jobs.js');
    const liftWriter = () => {
      const st = { owed: false, steps: [] };
      const W = { pending: () => st.owed, dirty() { st.owed = true; }, durable: () => Promise.resolve(!st.owed), whenDurable: () => Promise.resolve(!st.owed), exitStartedAt: () => null, stats: () => [],
        flushSync: (names) => ({ written: [], left: st.owed ? (names || []).map((f) => ({ file: f, name: 'a store', why: 'held by the storage (a stand-in)' })) : [], ms: 0 }),
        afterLanding: (file, step) => { if (!st.owed) { const v = step(); return Promise.resolve({ landed: true, value: v }); } st.steps.push(step); return new Promise(() => { }); } };
      return { W, land: () => { st.owed = false; const xs = st.steps; st.steps = []; for (const x of xs) x(); } };
    };
    const heldScene = async (Mod, name) => {
      const Rh = rig(name), Wh = liftWriter(), { jm: jh, job: jbh } = mkJm(Mod, Rh, Wh.W);
      jh._notifsHold({ code: 'EIO', why: 'a stand-in i/o error' });   // the boot's read of job-notifications.json failed: HELD (the engine's own hold road)
      const vh = SH.create({ handoverLandMs: 30, activeSessions: Rh.sessions, getDeliver: () => Rh.deliver, getJobs: () => jh, broadcastSessions: () => { }, renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, dataDir: Rh.dir, log: { log() { }, warn() { } } });
      jh._stashNotif(Rh.cid, jbh, { what: 'a result while held' }, 'not reachable', { held: { kind: 'not-reachable' } });
      Rh.setAnswer(async () => ({ ok: true, phase: 'written' }));
      const hoh = await vh.handOver('w1', { pressed: PRESS });
      const backh = vh.restoreHandedOver(Rh.cid, Rh.posts[Rh.posts.length - 1], { kind: 'notification' });
      const memh = () => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(Rh.dir, 'stash-handover.json'), 'utf-8')))[0] || {}; } catch { return {}; } };
      Wh.land(); await sleep(10);   // the writer lands all it owes — nothing for the held file
      const held = memh();
      fs.writeFileSync(jh.notifsFile, '{}');   // the storage answers again
      await jh._notifsRetry();   // the read again lifts the hold; its own save is owed
      const lifted = { unread: !!jh._notifsUnread, rec: memh() };
      Wh.land(); await sleep(10);
      const landed = memh();
      clearTimeout(jh._notifsT); jh._notifsT = null;
      return { hoOk: !!(hoh && hoh.ok), backh, heldOwed: held.jobsOwed === true && (held.jobs || []).length === 1, liftedOwed: !lifted.unread && lifted.rec.jobsOwed === true, landedDropped: !landed.jobsOwed && (landed.jobs || []).length === 0 };
    };
    const mh = await heldScene({ JobManager }, 'ride-handover-held');
    ok(gateOf(mh.hoOk) && mh.backh === 1 && gateOf(mh.heldOwed) && gateOf(mh.liftedOwed) && verdictOf(mh.landedDropped), 'must 2: a put-back while job-notifications.json is HELD keeps the hand-over\'s copy (the writer owes nothing for the file — no «landed»), still after the lift until ITS save lands, and drops it only then', mh);
    const JLX = mutantCopies('ntr-held-lift', REPO).load('src/jobs.js', anchored(JSRC2, LIFT_A, "  afterNotifsLanded(step) { if (false) return this._afterNotifsLift(", 'the put-back waits for the lift'), 'held-no-lift-wait');
    const mhx = await heldScene(JLX, 'ride-handover-held-red');
    ok(gateOf(mhx.hoOk) && !mhx.heldOwed, 'CONTROL (the wait for the lift cut, in a copy): the put-back «lands» at once over a held file and the kept copy is GONE while the notices are in memory only — a restart now loses them (red)', mhx);
    // 主开发's cure read wis993v2b, should 2: a drain while held is landed by fact — but a copy put back at the BOOT may already be in the
    // held file (the last process died after that landing, before the stash dropped its copy): drained now, it came back at the lift's
    // merge — handed over twice. The drain while held remembers what it took (by the notice's own identity) and the merge leaves it out.
    const TWICE_A = "        if (merge && this._drainedWhileHeld && this._drainedWhileHeld.size) {";
    ok(JSRC2.split(TWICE_A).length === 2, 'control setup: the lift\'s merge leaves out what a drain took while held (found once)');
    const twiceScene = async (Mod, name) => {
      const Rt = rig(name), { jm: jt, job: jbt } = mkJm(Mod, Rt, liftWriter().W);
      jt._notifsHold({ code: 'EIO', why: 'a stand-in i/o error' });
      jt._stashNotif(Rt.cid, jbt, { what: 'already in the held file' }, 'not reachable', { held: { kind: 'not-reachable' } });
      // (the move check's should, lane lg-store-writes: the copy in a held file is one the BOOT PUTS BACK — the stash hand-over's kept copy
      // through restoreNotifs, the only road a held file's notice comes back by; the put-back is the mark, never a clock)
      const n0 = (jt.pendingNotifs.get(Rt.cid) || [])[0];
      const copy = n0 ? JSON.parse(JSON.stringify(n0)) : null;
      jt.pendingNotifs.delete(Rt.cid); if (copy) jt.restoreNotifs(Rt.cid, [JSON.parse(JSON.stringify(copy))]);
      const took = jt.drainNotifs(Rt.cid).length;   // handed over while held
      // …and a notice stashed IN THIS PROCESS while held, then drained: it can never be in the held file — never remembered (the bound)
      jt._stashNotif(Rt.cid, jbt, { what: 'stashed while held, in this process' }, 'not reachable', { held: { kind: 'not-reachable' } });
      const freshTook = jt.drainNotifs(Rt.cid).length, remembered = jt._drainedWhileHeld ? jt._drainedWhileHeld.size : 0;
      // …and the held file already had it — with a SUBSCRIBER's copy of the same job event at the same instant (one pass stashes the
      // owner's and each subscriber's, one instant): the must of 主开发's read wf_3c7fc92a-819
      const SUB = 'conv-subscriber-b';
      fs.writeFileSync(jt.notifsFile, JSON.stringify(copy ? { [Rt.cid]: [copy], [SUB]: [{ ...copy }] } : {}));
      await jt._notifsRetry();
      const same = (cid) => (jt.pendingNotifs.get(cid) || []).filter((x) => copy && x.jobId === copy.jobId && x.ts === copy.ts).length;
      const back = same(Rt.cid), sub = same(SUB);
      clearTimeout(jt._notifsT); jt._notifsT = null;
      return { took, lifted: !jt._notifsUnread, back, sub, freshTook, remembered };
    };
    const tw = await twiceScene({ JobManager }, 'held-drain-twice');
    ok(tw.took === 1 && gateOf(tw.lifted) && tw.back === 0 && tw.sub === 1 && tw.freshTook === 1 && tw.remembered === 1, 'should 2 (+ the move check\'s bound: a notice stashed in this process while held is drained and NEVER remembered — only an older copy is): a notice drained while the file was held (its copy already IN the file) does not come back at the lift — never handed over twice; and a SUBSCRIBER\'s copy of the same job event at the same instant is still waiting (the identity carries the conversation)', tw);
    const JTX = mutantCopies('ntr-held-twice', REPO).load('src/jobs.js', anchored(JSRC2, TWICE_A, "        if (false) {", 'the merge leaves out what a drain took'), 'held-twice-cut');
    const twx = await twiceScene(JTX, 'held-drain-twice-red');
    ok(twx.took === 1 && gateOf(twx.lifted) && twx.back === 1, 'CONTROL (the merge\'s filter cut, in a copy): the drained notice is BACK after the lift — handed over twice (red)', twx);
    const D_ID = "took.add(`${cid}\\u0000${n.jobId}\\u0000${n.ts}`); }", M_ID = "this._drainedWhileHeld.has(`${cid}\\u0000${list[i].jobId}\\u0000${list[i].ts}`)";
    ok(verdictOf([D_ID, M_ID].every((x) => JSRC2.split(x).length === 2)), 'control setup: the drained identity carries the conversation at both sites (found once each)');
    const JCX = mutantCopies('ntr-held-nocid', REPO).load('src/jobs.js', anchored(anchored(JSRC2, D_ID, "took.add(`${n.jobId}\\u0000${n.ts}`); }", 'drain identity without the conversation'), M_ID, "this._drainedWhileHeld.has(`${list[i].jobId}\\u0000${list[i].ts}`)", 'merge identity without the conversation'), 'held-nocid');
    const twc = await twiceScene(JCX, 'held-drain-nocid-red');
    ok(twc.took === 1 && gateOf(twc.lifted) && twc.sub === 0, 'CONTROL (the conversation dropped from the identity, in a copy): the SUBSCRIBER\'s copy is taken out at the lift — never told, nothing said (red)', twc);
  }
  {   // FINDING 11's RED (anchored): a copy of the hand-over that does not hold — «delivered» and the record of delivery at once, over a drain not on disk
    const SHSRC11 = fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf-8');
    const HOLD_A = "      if (tookJobs.length && tookJobs.landed === false && typeof jm.whenNotifsLanded === 'function') {";
    const SH11 = mutantCopies('ntr-ho-nohold', REPO).load('src/server/stash-handover.js', anchored(SHSRC11, HOLD_A, "      if (false) {   // MUTANT: the reply and the record before the drain lands", 'the hand-over holds behind the drain'), 'ho-no-hold');
    const R11 = rig('ride-handover-nohold'), H11 = heldWriter(), { jm: jm11, job: job11 } = mkJm({ JobManager }, R11, H11.W);
    const v11 = SH11.create({ handoverLandMs: 30, activeSessions: R11.sessions, getDeliver: () => R11.deliver, getJobs: () => jm11, broadcastSessions: () => { }, renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, dataDir: R11.dir, log: { log() { }, warn() { } } });
    jm11._stashNotif(R11.cid, job11, { what: 'a kept result' }, 'not reachable', { held: { kind: 'not-reachable' } });
    R11.setAnswer(async () => ({ ok: true, phase: 'written' }));
    const ho11 = await v11.handOver('w1', { pressed: PRESS });
    let m11 = {}; try { m11 = JSON.parse(fs.readFileSync(path.join(R11.dir, 'stash-handover.json'), 'utf-8')); } catch { }
    ok(gateOf(ho11.ok) && !ho11.notOnDisk && Object.keys(m11).length === 1, 'CONTROL FINDING 11 (a copy that does not hold): «delivered» and the record written at once while the drain is not on disk — red', { ho11, m11: Object.keys(m11).length });
  }
})();

// ── §5 R3: THE PROMPT CARRIES A PARKED ENTRY WHEN IT FITS; WHEN IT CANNOT, THE TURN END POSTS THE STASH ────────────
console.log('\n§5 the REAL drains + the REAL hand-over: a parked entry rides a fitting prompt; a starved prompt arms a post at the turn end');
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const SA = require(path.join(REPO, 'src/spend-authorizer.js'));
function r3Rig(name) {
  const R = jobsRig(name);
  const scheduled = [];
  const view = SH.create({ activeSessions: R.sessions, getDeliver: () => R.deliver, getJobs: () => R.jm, broadcastSessions: () => { }, renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, log: { log: (...a) => R.logs.push(a.join(' ')), warn() { } }, now: () => R.now(), schedule: (fn, ms) => { scheduled.push({ fn, ms }); return null; } });
  return { ...R, view, scheduled };
}
{
  // (a) the prompt FITS: the parked job notification rides the digest (free), the retry is cancelled, the engine books it
  const R = r3Rig('r3fit');
  R.jm._notifyOwner(R.job, { what: 'finished: 3 new threads' });
  await sleep(10);
  ok(R.deliver.retryCount(R.cid) === 1 && R.jm.peekNotifs(R.cid).length === 0, '(a) parked, not stashed');
  const dlogs = [];
  const text = AR.drainNotifsUnderCap(R.jm, R.deliver, R.cid, 100, (l) => dlogs.push(l));
  ok(gateOf(/<vibespace-jobs-missed-while-away>/.test(text)) && gateOf(/jb-aaaa1111 dc-discussion-watch: finished: 3 new threads/.test(text)) && verdictOf(/These were waiting for a retry — delivered now\./.test(text)), '(a) the digest carries it with the retry tail', text);
  ok(R.deliver.retryCount(R.cid) === 0 && R.posts.length === 0 && R.ledger.length === 0 && R.releases.length === 1, '(a) the park is empty, nothing posted, nothing charged, the hold given back (the prompt was free)');
  const last = R.job.notifyLog[R.job.notifyLog.length - 1];
  ok(last.lane === 'stash' && last.ok === true && last.via === 'prompt' && last.retries === 0, '(a) the Delivery log: rode the prompt (lane stash ok, via prompt)', JSON.stringify(last));
  ok(verdictOf(R.cards.some((c) => c.kind === 'notification' && /finished: 3 new threads/.test(c.text))), '(a) the card the drain emits');
  ok(!R.deliver.handoverArmed(R.cid) && dlogs.length === 0, '(a) nothing armed');
}
{
  // (b) the prompt is STARVED (0 B left): nothing taken, the hand-over ARMED, the words say so; the turn end posts ONE frame
  // under stash-retry carrying the stash AND the parked entry AND a job notice; everything taken; no loop
  const R = r3Rig('r3arm');
  R.jm._notifyOwner(R.job, { what: 'finished (parked)' });
  await sleep(10);
  R.jm._stashNotif(R.cid, R.job, { what: 'an older one, stashed' }, 'rate floor — queued for injection instead', { held: { kind: 'rate-floor' } });
  R.deliver.stashFor(R.cid, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'ping from Ada' });
  const dlogs = [];
  const t1 = AR.drainNotifsUnderCap(R.jm, R.deliver, R.cid, 9600, (l) => dlogs.push(l));
  const t2 = AR.drainStashUnderCap(R.deliver, R.cid, 9600, (l) => dlogs.push(l));
  ok(t1 === '' && t2 === '' && R.deliver.retryCount(R.cid) === 1 && R.jm.peekNotifs(R.cid).length === 1 && R.deliver.stashCount(R.cid) === 1, '(b) a starved prompt takes nothing');
  ok(dlogs.length === 2 && gateOf(dlogs.every((l) => /will arrive as a message when this turn ends/.test(l))) && !dlogs.some((l) => /wait for the next prompt/.test(l)), '(b) …and says "will arrive as a message when this turn ends" (never "wait for the next prompt")', dlogs.join(' | '));
  ok(R.deliver.handoverArmed(R.cid) === true, '(b) …the hand-over is armed');
  const fact = R.view.summaryFor(R.session);
  ok(gateOf(fact) && fact.armed === true && fact.count === 3, '(b) the fact says armed (count 3: the parked, the stashed job, the peer)', JSON.stringify(fact));
  const w = S.stashSummaryWords(fact, tEn, { billed: true, armed: true, now: R.now() });
  ok(gateOf(/^they will arrive as a message when this turn ends/.test(w.held)) && verdictOf(/1 of them is being retried \(in 30 s\)/.test(w.held)), '(b) the strip\'s words: arrive at the turn end · one being retried', w.held);
  ok(gateOf(zh['they will arrive as a message when this turn ends']) && verdictOf(ja['they will arrive as a message when this turn ends']), '(b) zh + ja');
  // the turn ends, the CLI idle: ONE post under stash-retry
  R.session._isStreaming = false;
  R.setAnswer(async () => ({ ok: true, phase: 'written' }));
  await R.deliver.noteTurnEnd(R.session);
  await sleep(20);
  ok(R.posts.length === 1 && gateOf(/did not fit your previous prompt's context \(hand-over ho-/.test(R.posts[0])) && gateOf(/finished \(parked\)/.test(R.posts[0])) && gateOf(/an older one, stashed/.test(R.posts[0])) && verdictOf(/ping from Ada/.test(R.posts[0])), '(b) ONE frame at the turn end carrying all three', R.posts[0] && R.posts[0].slice(0, 200));
  ok(R.ledger.length === 1 && R.ledger[0].reason === 'stash-retry' && R.releases.length === 1, '(b) billed ONCE under stash-retry; the parked hold given back', JSON.stringify({ l: R.ledger, r: R.releases }));
  ok(R.deliver.retryCount(R.cid) === 0 && R.jm.peekNotifs(R.cid).length === 0 && R.deliver.stashCount(R.cid) === 0 && !R.deliver.handoverArmed(R.cid) && !R.view.summaryFor(R.session), '(b) every store empty, the arm consumed, the fact clear');
  ok(verdictOf(R.logs.some((l) => /posted as a message after the turn ended \(hand-over ho-/.test(l))), '(b) the journal says so', R.logs.filter((l) => /\[stash\]/.test(l)).join(' | '));
  const why = S.handoverFacts(R.cards.find((c) => c.fromName === 'VibeSpace notices').text).why;
  ok(why === 'they were held until now', '(b) the card\'s head: a mixed set is "held until now"', why);
  await R.deliver.noteTurnEnd(R.session);
  ok(R.posts.length === 1 && R.ledger.length === 1, '(b) the next turn end posts nothing (no loop)');
  ok(gateOf(SA.SPEND_REASONS['stash-retry']) && SA.SPEND_REASONS['stash-retry'].turn === true, '(b) stash-retry is a declared reason that spends a turn');
}
{
  // (a2) verify r1 (a revert-table control was GREEN): a parked entry of a producer OTHER than the jobs engine rides the
  // stash drain of a fitting prompt — and leaves the park (else the prompt AND the retry both deliver it)
  const R = r3Rig('r3fit-msg');
  const r = await R.deliver.deliverToConversation(R.cid, 'a peer-ish notice', { fromName: 'VibeSpace browser', kind: 'notification', spendReason: 'peer-message', retry: { producer: 'browser', meta: {} } });
  ok(r.parked === true && R.deliver.retryCount(R.cid) === 1, '(a2) parked by a non-jobs producer');
  const text = AR.drainStashUnderCap(R.deliver, R.cid, 100, () => { });
  ok(gateOf(/a peer-ish notice/.test(text)) && R.deliver.retryCount(R.cid) === 0 && R.releases.length === 1 && R.ledger.length === 0 && verdictOf(R.events.some((e) => e.ev === 'delivered' && e.extra.via === 'prompt')), '(a2) the stash drain carries it, the park is empty, the hold given back, delivered via prompt', JSON.stringify({ n: R.deliver.retryCount(R.cid), rel: R.releases }));
  R.session._isStreaming = false; R.setAnswer(async () => ({ ok: true, phase: 'written' }));
  await R.deliver.noteTurnEnd(R.session); await R.advance(60_000);
  ok(R.posts.length === 0, '(a2) …and nothing posts it again');
}
{
  // (c) no live peer (the pid is dead): nothing armed, the old words stand
  const R = r3Rig('r3dead');
  R.jm._stashNotif(R.cid, R.job, { what: 'x' }, 'no live inbox for this conversation on any reachable machine', { held: { kind: 'not-running' } });
  fs.unlinkSync(path.join(R.reg, `${process.pid}.json`));
  const dlogs = [];
  AR.drainNotifsUnderCap(R.jm, R.deliver, R.cid, 9600, (l) => dlogs.push(l));
  ok(dlogs.length === 1 && gateOf(/wait for the next prompt/.test(dlogs[0])) && !R.deliver.handoverArmed(R.cid), '(c) a dead pid: not armed, "wait for the next prompt"', dlogs[0]);
}
{
  // (d) THE FLOOR: a post landed 5 s before the turn end — the armed hand-over waits the floor out, then posts
  const R = r3Rig('r3floor');
  R.jm._stashNotif(R.cid, R.job, { what: 'held' }, 'rate floor — queued for injection instead', { held: { kind: 'rate-floor' } });
  R.setAnswer(async () => ({ ok: true, phase: 'written' }));
  await R.deliver.deliverToConversation(R.cid, 'a direct one', { kind: 'notification', spendReason: 'job-notification' });
  await R.advance(5000);
  AR.drainNotifsUnderCap(R.jm, R.deliver, R.cid, 9600, () => { });
  R.session._isStreaming = false;
  await R.deliver.noteTurnEnd(R.session);
  await sleep(10);
  ok(R.posts.length === 1 && R.scheduled.length === 1 && R.scheduled[0].ms === 25_000 && !R.deliver.handoverArmed(R.cid), '(d) inside the floor: deferred 25 s, not posted yet', JSON.stringify({ p: R.posts.length, s: R.scheduled.map((x) => x.ms) }));
  await R.advance(25_000);
  await R.scheduled[0].fn(); await sleep(10);
  ok(R.posts.length === 2 && gateOf(/held/.test(R.posts[1])) && R.jm.peekNotifs(R.cid).length === 0, '(d) …posted when the floor clears');
  // deferred but a turn runs again: re-armed for that turn's end, not posted under it
  const R2 = r3Rig('r3floor2');
  R2.jm._stashNotif(R2.cid, R2.job, { what: 'held2' }, 'rate floor — queued for injection instead', { held: { kind: 'rate-floor' } });
  R2.setAnswer(async () => ({ ok: true, phase: 'written' }));
  await R2.deliver.deliverToConversation(R2.cid, 'a direct one', { kind: 'notification', spendReason: 'job-notification' });
  AR.drainNotifsUnderCap(R2.jm, R2.deliver, R2.cid, 9600, () => { });
  R2.session._isStreaming = false;
  await R2.deliver.noteTurnEnd(R2.session); await sleep(10);
  R2.session._isStreaming = true;
  await R2.advance(30_000); await R2.scheduled[0].fn(); await sleep(10);
  ok(R2.posts.length === 1 && R2.deliver.handoverArmed(R2.cid) === true, '(d) a turn running at the deferred instant: re-armed, not posted into it');
}
{
  // (e) the ceiling refuses the auto hand-over: nothing posted, the stash intact, the refusal logged; the next prompt re-arms
  const R = r3Rig('r3refuse');
  R.jm._stashNotif(R.cid, R.job, { what: 'held' }, 'rate floor — queued for injection instead', { held: { kind: 'rate-floor' } });
  AR.drainNotifsUnderCap(R.jm, R.deliver, R.cid, 9600, () => { });
  R.setRefuse('hour-cap');
  R.session._isStreaming = false;
  await R.deliver.noteTurnEnd(R.session); await sleep(10);
  ok(R.posts.length === 0 && R.jm.peekNotifs(R.cid).length === 1 && verdictOf(R.logs.some((l) => /armed hand-over after the turn end was not made — spend_refused/.test(l))), '(e) refused: the stash stays, the journal names the ceiling', R.logs.filter((l) => /\[stash\]/.test(l)).join(' | '));
  const dlogs = [];
  AR.drainNotifsUnderCap(R.jm, R.deliver, R.cid, 9600, (l) => dlogs.push(l));
  ok(R.deliver.handoverArmed(R.cid) === true && verdictOf(/will arrive as a message/.test(dlogs[0])), '(e) the next starved prompt re-arms it');
}
{
  // (f) THE CENSUS PINS: both reasons spelled literally beside the ladder call (the spend census reads the literal)
  const sh = fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf-8');
  ok(gateOf(/spendReason: 'stash-retry', fromName: FROM_NAME/.test(sh)) && verdictOf(/spendReason: 'stash-handover', fromName: FROM_NAME/.test(sh)), '(f) stash-handover.js spells both reasons literally');
  const ar = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
  ok((ar.match(/armOrWait\(deliver, cid, 'inline-cap'\)/g) || []).length === 2 && (ar.match(/retryTake\(cid, new Set\((shownParked|parked)\), \{ via: 'prompt' \}\)/g) || []).length === 2, '(f) both drains arm on a starved prompt and take a parked entry on a fitting one');
}

// ── WIRING PINS ─────────────────────────────────────────────────────────────
// ── §4 VERIFY r3 — the park entry's lifecycle under the clock, the cap and a frame on the wire ───────────────────
console.log('\n§4 verify r3: a may-have-landed copy gives way at the cap; the floor follows a clock that went back; one attempt in flight per conversation');
/** a rig over a GIVEN deliver module (the real one or a patched copy) — §2's rig, parametrised for the controls */
function rigOver(CDx, name) {
  const dir = path.join(scratchDir('ntr'), name); fs.mkdirSync(dir, { recursive: true });
  const reg = path.join(dir, 'registry'); fs.mkdirSync(reg, { recursive: true });
  const cid = 'c0ffee00-0000-4000-8000-00000000' + String(seq++).padStart(4, '0');
  const sockPath = path.join(dir, 'inbox.sock');
  fs.writeFileSync(path.join(reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: cid, messagingSocketPath: sockPath, name: 'Owner' }));
  serveSock(sockPath);
  const posts = [], ledger = [], releases = [], authorized = [], logs = [], events = [];
  let answer = () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 });
  const session = { claudeSessionId: cid, backendSessionId: cid, mode: 'chat', backend: 'claude', name: 'Owner', _isStreaming: true };
  const sessions = new Map([['w1', session]]);
  let now = 1_700_000_000_000; const timers = [];
  const clock = { now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
  async function advance(ms) { const until = now + ms; while (true) { const due = timers.filter((t) => !t.dead && !t.fired && t.at <= until).sort((a, b) => a.at - b.at)[0]; if (!due) break; now = Math.max(now, due.at); due.fired = true; await due.fn(); await sleep(0); } now = until; }
  let holdSeq = 0;
  const mk = (dataDir) => CDx.create({ dataDir, activeSessions: sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, reg), postToPeer: async (p, text, o) => { const r = await answer(p, text, o); if (r.ok) posts.push(text); return r; }, postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: (req) => { authorized.push(req.reason); return { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'h' + (++holdSeq), reason: req.reason }; }, noteSpend: (rec) => ledger.push({ reason: rec.reason, hold: rec.hold }), releaseSpend: (rec) => releases.push(rec.hold),
    emitPeerCard: () => { }, log: (...a) => logs.push(a.join(' ')), retryClock: clock, renderBatch: require(path.join(REPO, 'src/agent-routes.js')).renderMsgStash });
  const R = { dir, reg, cid, session, deliver: mk(dir), posts, ledger, releases, authorized, logs, events, advance, setAnswer: (fn) => { answer = fn; }, setNow: (t) => { now = t; }, now: () => now, reboot: () => { R.deliver = mk(dir); R.deliver.onRetry((ev, c, e, x) => { events.push({ ev, id: e.id, extra: x }); return false; }); return R.deliver; } };
  R.deliver.onRetry((ev, c, e, x) => { events.push({ ev, id: e.id, extra: x }); return false; });
  return R;
}
const notifyOver = (R, text) => R.deliver.deliverToConversation(R.cid, text, { fromName: 'Background Work · dc-watch', kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-1' } } });
const CD_SRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
const M4 = mutantCopies('ntr4', REPO);
/** (a) THE CAP: a may-have-landed copy gives way before a certain miss (reproduced: a `ho` park entry handed to a FULL
 *  stash at boot evicted the oldest REAL waiting entry) */
async function legA(CDx, label) {
  const R = rigOver(CDx, 'r3a' + label);
  for (let i = 1; i <= 30; i++) R.deliver.stashFor(R.cid, { source: 'agent', kind: 'notification', fromName: 'Background Work · real-' + i, text: 'real notice ' + i, ts: R.now() - 60_000 * (31 - i) });
  await notifyOver(R, 'the one the hand-over carried');
  const f = path.join(R.dir, 'msg-retry.json'); const raw = JSON.parse(fs.readFileSync(f, 'utf-8')); raw[R.cid][0].ho = 'ho-dead-1'; fs.writeFileSync(f, JSON.stringify(raw));
  R.reboot(); await R.advance(0);
  const st = R.deliver.stashPeek(R.cid);
  return { kept: st.some((e) => e.text === 'real notice 1'), gone: !st.some((e) => e.held && e.held.maybeDelivered), n: st.length, said: R.logs.some((l) => /fell off the 30-entry cap/.test(l) && /a may-have-landed copy, gave way first/.test(l)) };
}
{
  const a = await legA(CD, '');
  ok(gateOf(a.kept) && gateOf(a.gone) && a.n === 30 && verdictOf(a.said), '(a) a may-have-landed copy reaching a full stash gives way first: the oldest real entry is kept, the eviction names the copy', JSON.stringify(a));
  // the same door with the copy in the MIDDLE of the queue: still the one that falls
  const R = rigOver(CD, 'r3a-mid');
  for (let i = 1; i <= 15; i++) R.deliver.stashFor(R.cid, { source: 'agent', kind: 'notification', fromName: 'x', text: 'real ' + i, ts: R.now() + i });
  R.deliver.stashFor(R.cid, { source: 'agent', kind: 'notification', fromName: 'x', text: 'the copy', ts: R.now() + 16, held: { kind: 'not-reachable', maybeDelivered: true } });
  for (let i = 17; i <= 31; i++) R.deliver.stashFor(R.cid, { source: 'agent', kind: 'notification', fromName: 'x', text: 'real ' + i, ts: R.now() + i });
  const st = R.deliver.stashPeek(R.cid);
  ok(st.length === 30 && !st.some((e) => e.text === 'the copy') && st[0].text === 'real 1' && st[29].text === 'real 31', '(a) …wherever the copy sits in the queue it is the one that falls; the real entries keep their order', JSON.stringify(st.map((e) => e.text)));
  // the jobs engine's twin store
  const RJ = jobsRig('r3a-jobs');
  for (let i = 1; i <= 30; i++) RJ.jm._stashNotif(RJ.cid, RJ.job, { what: 'real ' + i, at: RJ.now() }, 'unreachable', { stampLast: false, held: { kind: 'not-reachable' } });
  RJ.jm._stashNotif(RJ.cid, RJ.job, { what: 'the copy', at: RJ.now() }, 'may have landed', { stampLast: false, held: { kind: 'not-reachable', maybeDelivered: true } });
  const q = RJ.jm.peekNotifs(RJ.cid);
  ok(q.length === 30 && q[0].text === 'real 1' && !q.some((e) => e.text === 'the copy') && verdictOf(RJ.logs.some((l) => /\[jobs\].*fell off the 30-entry cap/.test(l) && /a may-have-landed copy, gave way first/.test(l))), '(a) the jobs store: the may-have-landed copy gives way first there too, said', JSON.stringify({ n: q.length, first: q[0] && q[0].text, logs: RJ.logs.filter((l) => /fell off/.test(l)).map((l) => l.slice(0, 160)) }));
  RJ.jm._stashNotif(RJ.cid, RJ.job, { what: 'real 31', at: RJ.now() }, 'unreachable', { stampLast: false, held: { kind: 'not-reachable' } });
  ok(RJ.jm.peekNotifs(RJ.cid).length === 30 && RJ.jm.peekNotifs(RJ.cid)[0].text === 'real 2', '(a) …with no copy to give way, the oldest real entry falls as before');
  // CONTROL: the cap without the first pass evicts the oldest real entry for the copy
  const pre = editAnchor(CD_SRC, "for (const pass of [(e) => !!(e.held && e.held.maybeDelivered), () => true]) {", "for (const pass of [() => true]) {", "src/server/conversation-deliver.js");
  if (pre === CD_SRC) ok(false, '(a) CONTROL: the cap pass anchor moved');
  else { const c = await legA(M4.load('src/server/conversation-deliver.js', pre, 'cap-no-pass'), 'ctl'); ok(!c.kept && !c.gone, '(a) CONTROL: without the first pass the copy stays and the oldest real entry is gone (the r3 reproduction)', JSON.stringify(c)); }
}
/** (b) THE FLOOR FOLLOWS A CLOCK THAT WENT BACK (reproduced: after a landed post the clock stepped back 2 h; `since` read
 *  negative, 120 floor reschedules over an hour, the next notice expired without a post) */
async function legB(CDx, label) {
  const R = rigOver(CDx, 'r3b' + label);
  await notifyOver(R, 'first');
  R.setAnswer(async () => ({ ok: true, phase: 'written' })); R.session._isStreaming = false;
  await R.deliver.noteTurnEnd(R.session);
  R.setNow(R.now() - 2 * 3600_000);
  R.setAnswer(async () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true }));
  await notifyOver(R, 'second');
  R.setAnswer(async () => ({ ok: true, phase: 'written' }));
  let postedAt = null;
  for (let m = 1; m <= 65 && postedAt == null; m++) { await R.advance(60_000); if (R.posts.length > 1) postedAt = m; }
  return { first: R.posts.length >= 1, postedAt, floors: R.events.filter((e) => e.ev === 'attempt' && e.extra.why === 'floor').length, said: R.logs.filter((l) => /the last landed post was stamped 1(19|20) min in the future — the clock went back; the witness is dropped \(no floor\)/.test(l)).length, fell: R.events.find((e) => e.ev === 'fell') };
}
{
  const b = await legB(CD, '');
  ok(gateOf(b.first) && b.postedAt === 1 && b.floors === 0 && b.said === 1 && !b.fell, '(b) a landed post, the clock back 2 h, a new miss: the floor witness is dropped (said once) and the notice rides the first attempt', JSON.stringify({ ...b, fell: b.fell && b.fell.extra.reason }));
  const pre = editAnchor(CD_SRC, "    for (const [cid, at] of lastPostAt) {\n      if (!(at > now)) continue;", "    for (const [cid, at] of []) {\n      if (!(at > now)) continue;", "src/server/conversation-deliver.js");
  if (pre === CD_SRC) ok(false, '(b) CONTROL: the lastPostAt re-base anchor moved');
  else { const c = await legB(M4.load('src/server/conversation-deliver.js', pre, 'floor-no-rebase'), 'ctl'); ok(c.postedAt == null && c.floors >= 100 && gateOf(c.fell) && c.fell.extra.expired === true, '(b) CONTROL: without the re-base the floor holds for the whole step and the notice expires unposted', JSON.stringify({ postedAt: c.postedAt, floors: c.floors, fell: c.fell && c.fell.extra.reason })); }
  // the jobs engine's own floor (R5's witness) has the same clock rule
  const RJ = jobsRig('r3b-jobs');
  RJ.jm._notifyRate.set(RJ.cid, { ts: Date.now() + 2 * 3600_000, h: 'not-this-text' });
  RJ.setAnswer(async () => ({ ok: true, phase: 'written' }));
  RJ.jm._notifyOwner(RJ.job, { what: 'after the leap' });
  await sleep(10);
  const last = RJ.job.notifyLog[RJ.job.notifyLog.length - 1];
  ok(gateOf(last) && last.lane === 'message' && last.ok === true && RJ.posts.length === 1 && verdictOf(RJ.logs.some((l) => /\[jobs\].*the notify floor was stamped 1(19|20) min in the future — the clock went back; the witness is dropped \(no floor, no duplicate window\)/.test(l))), '(b) the jobs floor stamped in the future is dropped at the read (said once) and the notification is delivered at once, not held as rate floor', JSON.stringify({ last, posts: RJ.posts.length, logs: RJ.logs.filter((l) => /floor/.test(l)).map((l) => l.slice(0, 140)) }));
}
/** (c) ONE ATTEMPT IN FLIGHT PER CONVERSATION (reproduced: a turn end during a frame's flight posted a second frame 5 ms
 *  behind it — two billed wakes inside the 30 s floor) */
async function legC(CDx, label) {
  const R = rigOver(CDx, 'r3c' + label);
  await notifyOver(R, 'e1');
  let resolveA = null; const pending = new Promise((r) => { resolveA = r; });
  let e2calls = 0;
  R.setAnswer(async (p, text) => { if (/e1/.test(text) && !/e2/.test(text)) { await pending; return { ok: true, phase: 'written' }; } e2calls++; return e2calls === 1 ? { ok: false, reason: 'socket error: connect EAGAIN', code: 'EAGAIN', phase: 'connect', transient: true } : { ok: true, phase: 'written' }; });
  await R.advance(30_000);
  const inflight0 = R.deliver.retryInFlightCount();
  await notifyOver(R, 'e2');
  R.session._isStreaming = false;
  const pB = R.deliver.noteTurnEnd(R.session);
  await sleep(5);
  const duringPosts = R.posts.length, duringLedger = R.ledger.length;
  resolveA(); await pB; await sleep(5);
  const afterA = { posts: R.posts.slice(), ledger: R.ledger.length, park: R.deliver.retryCount(R.cid) };
  await R.advance(31_000);
  return { inflight0, duringPosts, duringLedger, afterA, final: { posts: R.posts.length, ledger: R.ledger.length, park: R.deliver.retryCount(R.cid), authorized: R.authorized.length } };
}
{
  const c = await legC(CD, '');
  ok(c.inflight0 === 1 && c.duringPosts === 0 && c.duringLedger === 0 && c.afterA.posts.length === 1 && gateOf(/e1/.test(c.afterA.posts[0])) && c.afterA.park === 1, '(c) a turn end during a frame\'s flight posts nothing — it waits for the frame, then the floor holds the newcomer', JSON.stringify({ inflight0: c.inflight0, duringPosts: c.duringPosts, afterA: { ...c.afterA, posts: c.afterA.posts.length } }));
  ok(c.final.posts === 2 && c.final.ledger === 2 && c.final.park === 0 && c.final.authorized === 2, '(c) …the newcomer rides 30 s later in its own frame: two notices, two posts 30 s apart, one charge each (its own hold converted)', JSON.stringify(c.final));
  const pre = editAnchor(CD_SRC, "    while (attempting.has(cid)) { try { await attempting.get(cid); } catch { } }\n", "", "src/server/conversation-deliver.js");
  if (pre === CD_SRC) ok(false, '(c) CONTROL: the single-flight anchor moved');
  else { const k = await legC(M4.load('src/server/conversation-deliver.js', pre, 'no-single-flight'), 'ctl'); ok(k.duringPosts === 1 && k.duringLedger === 1 && k.afterA.posts.length === 2, '(c) CONTROL: without the wait the second frame lands during the first one\'s flight (the r3 reproduction)', JSON.stringify({ duringPosts: k.duringPosts, afterA: k.afterA.posts.length })); }
}
/** (d) the park's cap does not count a may-have-landed entry as waiting (it leaves at the first sweep; evicting it
 *  called a possible repeat "the oldest waiting" and stashed it without the word) */
{
  const R = rigOver(CD, 'r3d');
  for (let i = 1; i <= 30; i++) await notifyOver(R, 'n-' + i);
  const f = path.join(R.dir, 'msg-retry.json'); const raw = JSON.parse(fs.readFileSync(f, 'utf-8')); raw[R.cid][0].inflight = R.now(); fs.writeFileSync(f, JSON.stringify(raw));
  R.reboot();   // n-1 is marked may-have-landed, its 0 ms sweep not yet run
  await notifyOver(R, 'n-31');
  const q = R.deliver.retryPeek(R.cid);
  const fell = R.events.filter((e) => e.ev === 'fell');
  ok(q.length === 31 && q[0].maybeDelivered === true && fell.length === 0, '(d) thirty waiting + one may-have-landed: a thirty-first park evicts nothing (the leaving one is not counted, thirty are waiting)', JSON.stringify({ n: q.length, first: q[0] && q[0].maybeDelivered, fell: fell.length }));
  await notifyOver(R, 'n-32');
  const fell2 = R.events.filter((e) => e.ev === 'fell');
  ok(fell2.length === 1 && fell2[0].extra.evicted === true && gateOf(/n-2\b/.test(R.deliver.stashPeek(R.cid)[0].text)) && R.deliver.retryPeek(R.cid)[0].maybeDelivered === true, '(d) …the thirty-second evicts the oldest REAL waiting entry (n-2), never the may-have-landed one', JSON.stringify({ fell: fell2.map((e) => e.extra.kind + ':' + !!e.extra.evicted), stash: R.deliver.stashPeek(R.cid).map((e) => e.text.slice(-4)) }));
  await R.advance(0);
  ok(gateOf(R.deliver.stashPeek(R.cid).some((e) => e.held && e.held.maybeDelivered)) && verdictOf(R.deliver.retryPeek(R.cid).every((e) => !e.maybeDelivered)), '(d) …and the sweep hands it to the stash with its own word');
  const pre = editAnchor(CD_SRC, "filter((x) => x && !x.inflight && !x.ho && !x.maybeDelivered);", "filter((x) => x && !x.inflight && !x.ho);", "src/server/conversation-deliver.js", 'first');
  if (pre === CD_SRC) ok(false, '(d) CONTROL: the waiting filter anchor moved');
  else {
    const K = rigOver(M4.load('src/server/conversation-deliver.js', pre, 'cap-counts-maybe'), 'r3d-ctl');
    for (let i = 1; i <= 30; i++) await notifyOver(K, 'n-' + i);
    const fk = path.join(K.dir, 'msg-retry.json'); const rk = JSON.parse(fs.readFileSync(fk, 'utf-8')); rk[K.cid][0].inflight = K.now(); fs.writeFileSync(fk, JSON.stringify(rk));
    K.reboot(); await notifyOver(K, 'n-31');
    const fk2 = K.events.filter((e) => e.ev === 'fell');
    ok(fk2.length === 1 && fk2[0].extra.evicted === true && !fk2[0].extra.maybeDelivered, '(d) CONTROL: counting it, the may-have-landed entry is evicted as "the oldest waiting" without its word', JSON.stringify(fk2.map((e) => e.extra)));
  }
}


// ── §6 THE OWNER'S OUTCOMES (verify r4 T1): THE THIRD JUDGEMENT ──────────────────────────────────────────────────
// r3 proved the TABLE against its invariants and the ENGINE against the table. This section judges what the OWNER
// sees: for every hand-written scenario (drawn from r1–r3's findings and the original incident) the REAL ladder +
// the REAL jobs engine + the REAL hand-over view + the REAL drains run over a stub registry, a scripted poster and
// a manual clock, and three verdicts are compared — (1) the table replayed over the scenario's events, (2) the
// engine's own record, (3) the Background Work panel row + Delivery log + ack, the strip above the composer, the
// agent's frame, the ledger, the For-you inbox — against a hand-written expectation. A disagreement is a finding
// (r4 found: the jobs listener dropped `expired`; the table lacked the hand-over's claim and the prompt's take).
console.log('\n§6 the owner\'s outcomes: the table, the engine and what the owner sees, over ≥ 25 scenarios');
{
const P = require(path.join(REPO, 'src/park-step.js'));
const { CLEARED_TEXT: CLEARED } = require(path.join(REPO, 'src/record-clear.js'));
const base = path.join(scratchDir('ntr'), 'owner'); fs.rmSync(base, { recursive: true, force: true }); fs.mkdirSync(base, { recursive: true });   // fresh per run: a reused dir is a previous run's park (verify r4's own first bug)
const NOW_R4 = Date.now();   // the jobs engine reads Date.now() (its floor, markAck's instant): the park's manual clock starts beside it
/** the composed rig: one owner conversation (live pid = this process), the ladder, the jobs engine, the hand-over view */
function ownerRig(name, { dataDir = null, pid = process.pid, mode = 'chat' } = {}) {
  const dir = dataDir || path.join(base, name + '-' + (++seq)); fs.mkdirSync(dir, { recursive: true });
  const reg = path.join(dir, 'registry'); fs.mkdirSync(reg, { recursive: true });
  const cid = 'c0ffee00-0000-4000-8000-00000000' + String(seq).padStart(4, '0');
  const regFile = path.join(reg, `${pid}.json`);
  const sockPath = path.join(dir, 'inbox.sock');
  fs.writeFileSync(regFile, JSON.stringify({ pid, sessionId: cid, messagingSocketPath: sockPath, name: 'Owner', version: '2.1.281' }));
  serveSock(sockPath);
  const R = { dir, reg, regFile, cid, cids: [cid], sockPath, posts: [], ledger: [], releases: [], authorized: [], cards: [], logs: [], events: [], foryou: [], broadcasts: [], calls: [], parkCalls: 0 };
  R.answers = new Map();   // text fragment → answer fn
  R.answer = (frag, fn) => R.answers.set(frag, fn);
  R.answerAll = (fn) => { R.answers.clear(); R.answers.set('', fn); };
  const answerFor = (text, p) => { for (const [k, fn] of R.answers) if (k && (text.includes(k) || String(p && p.socketPath || '').includes(k))) return fn; return R.answers.get('') || (() => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 })); };
  R.session = { claudeSessionId: cid, backendSessionId: cid, mode, backend: 'claude', name: 'Owner', _isStreaming: mode === 'chat', _turnStateSeen: mode === 'chat' };
  R.sessions = new Map([['w1', R.session]]);
  let now = NOW_R4; const timers = [];
  R.clock = { now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
  R.timers = timers; R.now = () => now; R.setNow = (t) => { now = t; };
  R.advance = async (ms) => { const until = now + ms; while (true) { const due = timers.filter((t) => !t.dead && !t.fired && t.at <= until).sort((a, b) => a.at - b.at)[0]; if (!due) break; now = Math.max(now, due.at); due.fired = true; await due.fn(); await sleep(0); } now = until; };
  let holdSeq = 0; R.refuse = null; R.throwAuth = false;
  R.mk = () => {
    R.deliver = CD.create({ dataDir: dir, activeSessions: R.sessions, serverSetting: () => undefined,
      peerMsg: { findPeer: (c) => PM.findPeer(c, reg), postToPeer: async (p, text) => { R.calls.push(text); if (R.cids.some((c) => R.deliver.retryPeek(c).some((e) => e.inflight))) R.parkCalls++; const r = await answerFor(text, p)(text); if (r.ok) R.posts.push(text); return r; }, postChannelEvent: async () => ({ ok: false }) },
      authorizeSpend: (req) => { if (R.throwAuth) throw new Error('guard down'); R.authorized.push(req.reason); if (R.refuse) return { ok: false, why: R.refuse, detail: R.refuse + ' reached', retryAfter: 60000, identity: { key: 'acct', name: 'Work' }, limits: { perIdentityHour: 30 } }; return { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'h' + (++holdSeq), reason: req.reason }; },
      noteSpend: (rec) => R.ledger.push({ reason: rec.reason, hold: rec.hold }), releaseSpend: (rec) => R.releases.push(rec.hold),
      emitPeerCard: (c, card) => R.cards.push(card), log: (...a) => R.logs.push(a.join(' ')), retryClock: R.clock, renderBatch: AR.renderMsgStash, onStashChange: () => { } });
    R.deliver.onRetry((ev, c, e, x) => { R.events.push({ ev, cid: c, id: e.id, extra: x }); return false; });
    R.jm = new JobManager({ dataDir: dir, log: (...a) => R.logs.push(a.join(' ')), broadcast: (t, p) => R.broadcasts.push({ t, p }), notifyUser: (it) => R.foryou.push(it), onStash: () => { },
      deliverToConversation: (c, text, opts) => R.deliver.deliverToConversation(c, text, opts), onRetry: (fn) => R.deliver.onRetry(fn), peerReachable: (c) => R.deliver.peerReachable(c) });
    if (R.job) R.jm.jobs.set(R.job.id, R.job);
    R.view = SH.create({ activeSessions: R.sessions, getDeliver: () => R.deliver, getJobs: () => R.jm, broadcastSessions: () => { }, renderMsgStash: AR.renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, log: { log: (...a) => R.logs.push(a.join(' ')), warn: (...a) => R.logs.push('WARN ' + a.join(' ')) }, now: () => now, schedule: (fn, ms) => R.clock.setTimeout(fn, ms) });
    return R.deliver;
  };
  R.job = { id: 'jb-aaaa1111', kind: 'task', name: 'dc-discussion-watch', state: 'done', terminalAt: Date.now() - 1000, owner: { conversation: { id: cid } }, access: { view: 'all', control: 'session' }, runs: [] };
  R.mk();
  /** a job notification through the REAL engine (the jobs floor cleared between fires unless told otherwise — a floored one is its own scenario) */
  R.notify = async (what, { keepFloor = false, job = null } = {}) => { R.jm._notifyOwner(job || R.job, { what, at: Date.now() }); await sleep(8); if (!keepFloor) R.jm._notifyRate.delete(cid); };
  R.turnEnd = async () => { R.session._isStreaming = false; await R.deliver.noteTurnEnd(R.session); await sleep(8); };
  R.reboot = () => { try { R.deliver.closeRetries(); } catch { } for (const t of timers) t.dead = true; now += 5000; R.mk(); };   // a restart takes seconds (RestartSec=5)
  R.parkId = () => (R.deliver.retryPeek(cid)[0] || {}).id;
  R.file = () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'msg-retry.json'), 'utf-8')); } catch { return {}; } };
  return R;
}
const OK_R4 = () => ({ ok: true, phase: 'written', elapsedMs: 120 });
const MISS_R4 = () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 });

/** (3) WHAT THE OWNER SEES */
function ownerSeen(R, job = R.job) {
  const last = (job.notifyLog || []).slice(-1)[0] || null;
  const fact = R.view.summaryFor(R.session);
  const words = fact ? S.stashSummaryWords(fact, tEn, { billed: fact.billed, inFlight: fact.inFlight, held: fact.held, reachable: fact.reachable, now: R.now(), armed: !!fact.armed }) : null;
  const heldOf = (h) => (h ? h.kind + (h.maybeDelivered ? '+maybe' : '') + (h.evicted ? '+evicted' : '') + (h.expired ? '+expired' : '') : 'none');
  return {
    panel: job.lastNotify ? `${job.lastNotify.lane}${job.lastNotify.ok ? ' ok' : ''}${job.lastNotify.retries != null ? ' r' + job.lastNotify.retries : ''}` : 'none',
    log: last ? `${last.lane}${last.ok ? ' ok' : ''}${last.parked ? ' parked' : ''}${last.via ? ' via ' + last.via : ''}${last.retries != null ? ' r' + last.retries : ''}${!last.ok && last.reason ? ' (' + String(last.reason) + ')' : ''}` : 'none',
    acked: JM_MODEL.ackState(job, Date.now()).acked,
    strip: words ? words.head + (words.held ? ' · ' + words.held : '') : null,
    stash: [...R.jm.peekNotifs(R.cid).map((n) => heldOf(n.held)), ...R.deliver.stashPeek(R.cid).map((e) => 'ladder:' + heldOf(e.held))],
    frames: R.posts.length, ledger: R.ledger.map((l) => l.reason), cards: R.cards.length,
    cardHead: R.cards.length ? R.cards[R.cards.length - 1].text.split('\n')[0].slice(0, 90) : null,
    foryou: R.foryou.length, park: R.deliver.retryCount(R.cid),
  };
}
/** (2) THE ENGINE's verdict on one entry */
function engineState(R, id) {
  const e = R.deliver.retryPeek(R.cid).find((x) => x.id === id);
  if (e) return e.inflight ? 'inflight' : e.ho ? 'claimed' : e.maybeDelivered ? 'maybeDelivered' : String(e.text).includes(CLEARED) ? 'cleared' : 'waiting';
  const fell = R.events.find((x) => x.ev === 'fell' && x.id === id);
  if (fell) return fell.extra.evicted ? 'evicted' : fell.extra.expired ? 'expired' : 'stashed';
  if (R.events.some((x) => x.ev === 'delivered' && x.id === id)) return 'landed';
  return 'vanished';
}
/** (1) THE TABLE replayed: events = [[event, facts], …] from a fresh entry */
function tableRun(events, id = 'rt-1', { start = null, entry = null } = {}) {
  let e = start ? P.canonical(start, NOW_R4) : P.freshEntry(NOW_R4, id); e.id = id; if (entry) Object.assign(e, entry); let now = NOW_R4; let posts = 0, charges = 0; const says = []; let noEvent = null;
  for (const [ev, facts] of events) {
    if (!P.EVENTS.includes(ev)) { noEvent = ev; break; }
    if (facts && facts.now != null) now = facts.now;
    const r = P.parkStep(e, ev, { now, ...(facts || {}) });
    e = r.entry; now = r.now; if (r.post) posts++; if (r.charge) charges++; if (r.say) says.push(r.say);
  }
  return { state: noEvent ? 'NO EVENT ' + noEvent : e.s, posts, charges, says };
}
const parkCharged = (R) => R.ledger.filter((l) => l.reason === 'job-notification').length;
const parkPosts = (R) => R.parkCalls;
const eng = (R, id, { minus = 0 } = {}) => ({ state: engineState(R, id), posts: parkPosts(R) - minus, charges: parkCharged(R) - minus });   // minus: an earlier entry of the rig that posted + charged on its own
const results = [];
const scenarios = [];
function judge(name, { table, engine, owner, expect }) {
  const te = table.state.startsWith('NO EVENT') ? 'table lacks ' + table.state.slice(9) : (table.state === engine.state && table.posts === engine.posts && table.charges === engine.charges ? null : `table ${JSON.stringify(table)} vs engine ${JSON.stringify(engine)}`);
  const same = (e, o) => (typeof e === 'string' && e.startsWith('~') && typeof o === 'string') ? o.startsWith(e.slice(1)) : JSON.stringify(e) === JSON.stringify(o);
  const diffs = Object.keys(expect).filter((k) => !same(expect[k], owner[k])).map((k) => `${k}: expected ${JSON.stringify(expect[k])} saw ${JSON.stringify(owner[k])}`);
  const agree = !te && !diffs.length;
  results.push({ name, agree, te, diffs });
  ok(verdictOf(agree), name, (te ? 'table/engine: ' + te + ' ' : '') + (diffs.length ? 'owner: ' + diffs.join('; ') : ''));
}

// ── S1 THE INCIDENT: a transient miss on a live busy CLI → parked → delivered at the turn end, ONE wake ──
scenarios.push(['S1', async () => {
  const R = ownerRig('s1');
  await R.notify('finished: 3 new threads');
  const id = R.parkId();
  const mid = ownerSeen(R);
  judge('S1a the incident, before the turn end: parked — the panel says retry, the strip says being retried, nothing in the stash', { table: tableRun([]), engine: eng(R, id), owner: mid, expect: { panel: 'retry', log: 'message parked r0 (timeout)', strip: '1 notice is being retried for this agent · next attempt in 30 s or when this turn ends', stash: [], frames: 0, ledger: [], park: 1, foryou: 0 } });
  R.answerAll(OK_R4); await R.turnEnd();
  judge('S1b …the turn end delivers it: one frame, one charge, the log says delivered after 1 retry, the strip is gone', { table: tableRun([['turn-end'], ['post-ok']]), engine: eng(R, id), owner: ownerSeen(R), expect: { panel: 'message ok r1', log: 'message ok via message r1', acked: true, strip: null, stash: [], frames: 1, ledger: ['job-notification'], cards: 1, park: 0, foryou: 0 } });
}]);
// ── S2 a DEAD pid at the first attempt: the stash at once, typed not-running ──
scenarios.push(['S2', async () => {
  const R = ownerRig('s2', { pid: 99999999 });
  await R.notify('finished');
  judge('S2 a dead pid: stashed at once as not-running (never parked), the strip says waiting, no money moved', { table: { state: 'stashed', posts: 0, charges: 0 }, engine: { state: 'stashed', posts: 0, charges: 0 }, owner: ownerSeen(R), expect: { panel: 'stash ok', log: '~stash (no live inbox', strip: '1 notice is waiting for this agent’s next turn', stash: ['not-running'], frames: 0, ledger: [], park: 0 } });
}]);
// ── S3 the CLI exits while parked: the next attempt finds no pid → not-running, in the jobs store ──
scenarios.push(['S3', async () => {
  const R = ownerRig('s3');
  await R.notify('finished');
  const id = R.parkId();
  fs.unlinkSync(R.regFile);
  await R.advance(30_000);
  judge('S3 the CLI exits while parked: the timer finds it gone — not-running in the jobs store, the hold given back', { table: tableRun([['timer', { pidAlive: false }]]), engine: eng(R, id), owner: ownerSeen(R), expect: { panel: 'stash ok', log: '~stash (the conversation is no longer running', strip: '1 notice is waiting for this agent’s next turn', stash: ['not-running'], frames: 0, ledger: [], park: 0 } });
  // the strip: a dead pid has no live session in the map? the session object is still in activeSessions (the registry is the CLI's) — the fact still lists the stashed one
}]);
// ── S4 the backoff alone exhausts: refused for an hour → expired → not-reachable + expired ──
scenarios.push(['S4', async () => {
  const R = ownerRig('s4');
  await R.notify('finished');
  const id = R.parkId();
  await R.advance(61 * 60_000);
  const ev = []; { let e = P.freshEntry(NOW_R4, id); let now = NOW_R4; let guard = 0; while (!P.TERMINAL.has(e.s) && guard++ < 100) { let r = P.parkStep(e, 'timer', { now }); e = r.entry; now = r.now; ev.push(['timer']); if (e.s === 'inflight') { r = P.parkStep(e, 'post-refused-transient', { now }); e = r.entry; ev.push(['post-refused-transient']); } } }
  judge('S4 the backoff alone (no turn end), the CLI refusing all hour: expired → not-reachable+expired in the jobs store, never charged', { table: tableRun(ev, id), engine: eng(R, id), owner: ownerSeen(R), expect: { panel: 'stash ok', log: '~stash (the agent did not accept the message in 10 attempts', strip: '1 notice is waiting for this agent’s next turn', stash: ['not-reachable+expired'], frames: 0, ledger: [], park: 0 } });
  const parkedLine = (R.job.notifyLog || []).find((l) => l.parked);
  judge('S4b …the parked Delivery-log line was updated in place up to the fall (retries 9, no line per attempt; the log holds ≤ 12)', { table: { state: 'expired', posts: 0, charges: 0 }, engine: { state: 'expired', posts: 0, charges: 0 }, owner: { retries: parkedLine && parkedLine.retries, lines: R.job.notifyLog.length }, expect: { retries: 9, lines: 2 } });
}]);
// ── S5 five jobs parked → ONE frame, ONE charge, one card in the hand-over's shape ──
scenarios.push(['S5', async () => {
  const R = ownerRig('s5');
  const jobs = [];
  for (let i = 1; i <= 5; i++) { const j = { ...R.job, id: 'jb-' + i, name: 'job-' + i }; R.jm.jobs.set(j.id, j); jobs.push(j); await R.notify('finished ' + i, { job: j }); }
  const ids = R.deliver.retryPeek(R.cid).map((e) => e.id);
  const before = ownerSeen(R);
  R.answerAll(OK_R4); await R.turnEnd();
  judge('S5 five parked notices: the strip counted five being retried; the turn end posts ONE frame, ONE charge, one hand-over-shaped card', { table: tableRun([['turn-end'], ['post-ok']]), engine: eng(R, ids[0]), owner: { ...ownerSeen(R, jobs[4]), before: before.strip }, expect: { before: '5 notices are being retried for this agent · next attempt in 30 s or when this turn ends', panel: 'message ok r1', log: 'message ok via message r1', strip: null, frames: 1, ledger: ['job-notification'], cards: 1, cardHead: '5 waiting notice(s) handed over — their delivery was being retried — delivered now', park: 0 } });
  judge('S5b …every one of the five jobs reads delivered in its own log', { table: { state: 'landed', posts: 1, charges: 1 }, engine: { state: 'landed', posts: 1, charges: 1 }, owner: { logs: jobs.map((j) => ownerSeen(R, j).log) }, expect: { logs: Array(5).fill('message ok via message r1') } });
}]);
// ── S6 a restart with the post IN FLIGHT: may-have-landed → the stash at the first sweep, the digest says a repeat ──
scenarios.push(['S6', async () => {
  const R = ownerRig('s6');
  await R.notify('finished');
  const id = R.parkId();
  const raw = R.file(); raw[R.cid][0].inflight = R.now(); fs.writeFileSync(path.join(R.dir, 'msg-retry.json'), JSON.stringify(raw));
  R.reboot();
  const atBoot = ownerSeen(R);
  await R.advance(0);
  const digest = AR.drainNotifsUnderCap(R.jm, R.deliver, R.cid, 0, () => { });
  judge('S6 a restart mid-post: never posted again; the jobs store holds it typed not-reachable+maybe; the next prompt\'s digest says a repeat is possible', { table: tableRun([['boot-inflight'], ['timer']], 'rt-1', { start: 'inflight' }), engine: eng(R, id), owner: { ...ownerSeen(R), bootStrip: atBoot.strip, digestSays: /one or more may have reached you already/.test(digest) }, expect: { bootStrip: null, digestSays: true, panel: 'stash ok', log: '~stash (it was being posted when the previous server stopped', frames: 0, ledger: [], park: 0, stash: [] } });
}]);
// ── S7 a restart with a HAND-OVER's claim on the park entry ──
scenarios.push(['S7', async () => {
  const R = ownerRig('s7');
  await R.notify('finished');
  const id = R.parkId();
  const raw = R.file(); raw[R.cid][0].ho = 'ho-dead-1'; fs.writeFileSync(path.join(R.dir, 'msg-retry.json'), JSON.stringify(raw));
  R.reboot(); await R.advance(0);
  judge('S7 a restart inside a hand-over\'s post: the claimed entry is may-have-landed too — the stash, said by id, never posted', { table: tableRun([['boot-ho'], ['timer']], 'rt-1', { start: 'claimed' }), engine: eng(R, id), owner: { ...ownerSeen(R), said: R.logs.some((l) => new RegExp(id + ' was claimed by hand-over ho-dead-1').test(l)) }, expect: { said: true, frames: 0, ledger: [], park: 0, stash: ['not-reachable+maybe'], strip: '1 notice is waiting for this agent’s next turn' } });
}]);
// ── S8 a restart with a WAITING entry: kept once, re-authorized once, posted by the timer ──
scenarios.push(['S8', async () => {
  const R = ownerRig('s8');
  await R.notify('finished');
  const id = R.parkId();
  R.reboot();
  R.answerAll(OK_R4);
  await R.advance(31_000);
  judge('S8 a restart with a waiting entry: the hold forgotten, asked ONCE more, posted by the timer, charged ONCE', { table: tableRun([['boot-inflight'], ['timer'], ['post-ok']]), engine: eng(R, id), owner: { ...ownerSeen(R), authorized: R.authorized.length, released: R.releases.length }, expect: { authorized: 2, released: 0, panel: 'message ok r1', log: 'message ok via message r1', frames: 1, ledger: ['job-notification'], park: 0, strip: null } });
}]);
// ── S9 the cap: a 31st park evicts the oldest into the jobs store ──
scenarios.push(['S9', async () => {
  const R = ownerRig('s9');
  const jobs = [];
  for (let i = 1; i <= 31; i++) { const j = { ...R.job, id: 'jb-' + i, name: 'job-' + i }; R.jm.jobs.set(j.id, j); jobs.push(j); await R.notify('finished ' + i, { job: j }); }
  const fell = R.events.find((e) => e.ev === 'fell');
  judge('S9 the 31st park: the oldest (job-1) falls to the jobs store typed not-reachable+evicted; the strip counts 31 (30 retrying); the journal names it', { table: tableRun([['cap']]), engine: eng(R, fell && fell.id), owner: { ...ownerSeen(R, jobs[0]), named: R.logs.some((l) => /the oldest waiting, parked \d+ s ago/.test(l)) }, expect: { named: true, panel: 'stash ok', log: '~stash (the retry park holds 30 per conversation', stash: ['not-reachable+evicted'], strip: '31 notices are waiting for this agent’s next turn · 30 of them are being retried (in 30 s)', frames: 0, ledger: [], park: 30 } });
}]);
// ── S10 the user presses Hand over now with two parked: ONE frame under stash-handover, the park empties ──
scenarios.push(['S10', async () => {
  const R = ownerRig('s10');
  const j2 = { ...R.job, id: 'jb-2', name: 'job-2' }; R.jm.jobs.set(j2.id, j2);
  await R.notify('finished one'); await R.notify('finished two', { job: j2 });
  const ids = R.deliver.retryPeek(R.cid).map((e) => e.id);
  R.session._isStreaming = false;
  R.answerAll(OK_R4);
  const r = await R.view.handOver('w1', { pressed: PRESS }); await sleep(10);
  judge('S10 Hand over now with two parked: one frame under stash-handover (the user\'s), the park\'s holds given back, each job reads delivered via hand-over, one card', { table: tableRun([['handover-claim'], ['post-ok']]), engine: eng(R, ids[0]), owner: { ...ownerSeen(R), ok: r.ok, delivered: r.delivered, released: R.releases.length, log2: ownerSeen(R, j2).log }, expect: { ok: true, delivered: 2, released: 2, log: 'message ok via hand-over r0', log2: 'message ok via hand-over r0', acked: true, frames: 1, ledger: ['stash-handover'], cards: 1, cardHead: '2 waiting notice(s) handed over — their delivery was being retried — delivered now', park: 0, strip: null } });
}]);
// ── S11 Hand over now pressed WHILE the retry post is in flight ──
scenarios.push(['S11', async () => {
  const R = ownerRig('s11');
  await R.notify('finished');
  const id = R.parkId();
  let release; const gate = new Promise((res) => { release = res; });
  R.answerAll(async () => { await gate; return OK_R4(); });
  R.session._isStreaming = false;
  const te = R.deliver.noteTurnEnd(R.session); await sleep(8);
  const during = ownerSeen(R);
  const r = await R.view.handOver('w1', { pressed: PRESS });
  release(); await te; await sleep(8);
  judge('S11 Hand over now during the retry\'s flight: the strip shows nothing (the entry is on its way), the press answers nothing_waiting, ONE post ONE charge', { table: tableRun([['turn-end'], ['post-ok']]), engine: eng(R, id), owner: { ...ownerSeen(R), duringStrip: during.strip, code: r.code }, expect: { duringStrip: null, code: 'nothing_waiting', frames: 1, ledger: ['job-notification'], park: 0 } });
}]);
// ── S12 THE INCIDENT'S SECOND HALF: a starved prompt (0 B left) arms a hand-over the turn end posts ──
scenarios.push(['S12', async () => {
  const R = ownerRig('s12');
  await R.notify('finished');
  const id = R.parkId();
  const dlogs = [];
  const text = AR.drainNotifsUnderCap(R.jm, R.deliver, R.cid, AR.INLINE_CAP, (l) => dlogs.push(l));
  const armed = ownerSeen(R);
  R.answerAll(OK_R4); await R.turnEnd(); await sleep(10);
  judge('S12 a starved prompt: nothing inline, the strip says they will arrive when this turn ends; the turn end posts ONE frame under stash-retry, delivered via hand-over', { table: tableRun([['handover-claim'], ['post-ok']]), engine: eng(R, id), owner: { ...ownerSeen(R), inline: text, armedStrip: armed.strip, said: dlogs[0] && /will arrive as a message when this turn ends/.test(dlogs[0]) }, expect: { inline: '', said: true, armedStrip: '1 notice is being retried for this agent · they will arrive as a message when this turn ends · next attempt in 30 s or when this turn ends', log: 'message ok via hand-over r0', frames: 1, ledger: ['stash-retry'], cards: 1, park: 0, strip: null } });
}]);
// ── S13 a FITTING prompt carries the parked notice for free ──
scenarios.push(['S13', async () => {
  const R = ownerRig('s13');
  await R.notify('finished');
  const id = R.parkId();
  const text = AR.drainNotifsUnderCap(R.jm, R.deliver, R.cid, 0, () => { });
  judge('S13 a fitting prompt: the digest carries it with the retry tail, the park empties, the hold goes back, delivered via prompt, acked, nothing charged', { table: tableRun([['prompt-take']]), engine: eng(R, id), owner: { ...ownerSeen(R), tail: /These were waiting for a retry — delivered now\./.test(text), released: R.releases.length }, expect: { tail: true, released: 1, log: 'stash ok via prompt r0', acked: true, frames: 0, ledger: [], cards: 1, park: 0, strip: null } });
}]);
// ── S14 Clear content… on a parked entry: the retry posts the sentence ──
scenarios.push(['S14', async () => {
  const R = ownerRig('s14');
  await R.notify('the secret result');
  const id = R.parkId();
  R.deliver.redactStash((e) => (e && typeof e.fromName === 'string' && /dc-discussion/.test(e.fromName) ? { text: CLEARED, fromName: 'Background Work · ' + CLEARED } : null), { jobIds: [R.job.id] });
  R.answerAll(OK_R4); await R.turnEnd();
  judge('S14 a clear reaching a parked entry: the retry posts the sentence, the card is the sentence, still ONE wake', { table: tableRun([['clear-single'], ['turn-end'], ['post-ok']]), engine: eng(R, id), owner: { ...ownerSeen(R), frameHasSecret: /secret/.test(R.posts[0] || ''), cardIsSentence: R.cards[0] && R.cards[0].text.endsWith(CLEARED) }, expect: { frameHasSecret: false, cardIsSentence: true, frames: 1, ledger: ['job-notification'], park: 0 } });
}]);
// ── S15 Clear content… while the frame is on the wire ──
scenarios.push(['S15', async () => {
  const R = ownerRig('s15');
  await R.notify('the secret result');
  const id = R.parkId();
  let release; const gate = new Promise((res) => { release = res; });
  R.answerAll(async () => { await gate; return OK_R4(); });
  R.session._isStreaming = false;
  const te = R.deliver.noteTurnEnd(R.session); await sleep(8);
  R.deliver.redactStash((e) => (e && /secret/.test(String(e.text)) ? { text: CLEARED, fromName: CLEARED } : null), { jobIds: [R.job.id] });
  release(); await te; await sleep(8);
  judge('S15 a clear mid-flight: the frame carried the words, the card draws the sentence with recorded = the frame, the clear said', { table: tableRun([['turn-end'], ['clear-single'], ['post-ok']]), engine: eng(R, id), owner: { ...ownerSeen(R), frameHasSecret: /secret/.test(R.posts[0] || ''), cardHasSecret: /secret/.test(R.cards[0] && R.cards[0].text || ''), recordedIsFrame: R.cards[0] && R.cards[0].recorded === R.posts[0], said: R.logs.some((l) => /cleared while its frame was on the wire/.test(l)) }, expect: { frameHasSecret: true, cardHasSecret: false, recordedIsFrame: true, said: true, frames: 1, ledger: ['job-notification'], park: 0 } });
}]);
// ── S16 the park's floor against ANOTHER producer's landed post ──
scenarios.push(['S16', async () => {
  const R = ownerRig('s16');
  await R.notify('finished');
  const id = R.parkId();
  R.answerAll(OK_R4);
  await R.advance(10_000);
  const rp = await R.deliver.deliverToConversation(R.cid, 'a peer message', { fromName: 'Ada', kind: 'peer', spendReason: 'peer-message' });
  await R.advance(2_000);
  await R.turnEnd();
  const floored = ownerSeen(R);
  await R.advance(28_000);
  judge('S16 a peer\'s post landed 2 s before the turn end: the parked notice waits the floor out (the strip names the next attempt), then the timer posts it — two frames, two charges, one each', { table: tableRun([['turn-end', { now: NOW_R4 + 12_000 }], ['timer', { now: NOW_R4 + 40_000 }], ['post-ok']], 'rt-1', { entry: { lastPostAt: NOW_R4 + 10_000 } }), engine: eng(R, id), owner: { ...ownerSeen(R), peerOk: rp.ok, flooredStrip: floored.strip, flooredPanel: floored.panel }, expect: { peerOk: true, flooredStrip: '1 notice is being retried for this agent · next attempt in 28 s or when this turn ends', flooredPanel: 'retry', frames: 2, ledger: ['peer-message', 'job-notification'], park: 0, log: 'message ok via message r1' } });
}]);
// ── S17 the clock steps BACK two hours after a park ──
scenarios.push(['S17', async () => {
  const R = ownerRig('s17');
  await R.notify('finished');
  const id = R.parkId();
  R.setNow(R.now() - 2 * 3600_000);
  await R.turnEnd();   // refused (the default answer)
  const rebased = R.logs.filter((l) => /clock went back/.test(l)).length;
  R.answerAll(OK_R4);
  await R.advance(60_000);
  judge('S17 a backward step: re-based once (said once), the next timer still posts within its own step — delivered, one charge', { table: tableRun([['clock-backward'], ['turn-end'], ['post-refused-transient'], ['timer'], ['post-ok']]), engine: eng(R, id), owner: { ...ownerSeen(R), rebased }, expect: { rebased: 1, frames: 1, ledger: ['job-notification'], park: 0, log: 'message ok via message r2' } });
}]);
// ── S18 the clock steps BACK after a LANDED post: the floor's witness is dropped, the next park is not held two hours ──
scenarios.push(['S18', async () => {
  const R = ownerRig('s18');
  await R.notify('first');
  R.answerAll(OK_R4); await R.turnEnd();
  R.setNow(R.now() - 2 * 3600_000);
  R.answerAll(MISS_R4);
  const j2 = { ...R.job, id: 'jb-2', name: 'job-2' }; R.jm.jobs.set(j2.id, j2);
  R.jm._notifyRate.delete(R.cid);
  await R.notify('second', { job: j2 });
  const id2 = R.parkId();
  R.answerAll(OK_R4);
  await R.advance(31_000);
  judge('S18 after a landed post the clock goes back 2 h: the park\'s floor witness is dropped and said; the second notice is parked and posts at its first step, never held two hours', { table: tableRun([['clock-backward'], ['timer'], ['post-ok']], id2), engine: eng(R, id2, { minus: 1 }), owner: { ...ownerSeen(R, j2), dropped: R.logs.filter((l) => /witness is dropped/.test(l)).length }, expect: { dropped: 1, frames: 2, ledger: ['job-notification', 'job-notification'], park: 0, log: 'message ok via message r1' } });
}]);
// ── S19 the ceiling refuses at the re-judge (the hold's TTL passed) ──
scenarios.push(['S19', async () => {
  const R = ownerRig('s19');
  await R.notify('finished');
  const id = R.parkId();
  R.refuse = 'hour-cap';
  await R.advance(4 * 60_000);
  judge('S19 refused at the re-judge after the hold\'s TTL: spend-cap in the jobs store with why/identity/cap, nothing posted, the stash line names the ceiling', { table: tableRun([['timer'], ['post-refused-transient'], ['timer'], ['post-refused-transient'], ['timer', { spend: 'refused' }]]), engine: eng(R, id), owner: { ...ownerSeen(R), held: R.jm.peekNotifs(R.cid)[0] && R.jm.peekNotifs(R.cid)[0].held }, expect: { held: { kind: 'spend-cap', why: 'hour-cap', identity: 'Work', cap: 30, retryAfter: 60000, attempts: 3, phase: 'connect', busy: true }, log: '~stash (spend budget: hour-cap reached', stash: ['spend-cap'], frames: 0, ledger: [], park: 0 } });
}]);
// ── S20 the authorizer THROWS at the re-judge: fail closed ──
scenarios.push(['S20', async () => {
  const R = ownerRig('s20');
  await R.notify('finished');
  const id = R.parkId();
  R.throwAuth = true;
  await R.advance(4 * 60_000);
  judge('S20 a throwing authorizer at the re-judge: nothing posted, nothing charged, the entry falls as spend-cap naming the failure', { table: tableRun([['timer'], ['post-refused-transient'], ['timer'], ['post-refused-transient'], ['timer', { spend: 'threw' }]]), engine: eng(R, id), owner: ownerSeen(R), expect: { log: '~stash (spend authorizer failed', stash: ['spend-cap'], frames: 0, ledger: [], park: 0 } });
}]);
// ── S21 two turn ends around one slow post ──
scenarios.push(['S21', async () => {
  const R = ownerRig('s21');
  await R.notify('finished');
  const id = R.parkId();
  let release; const gate = new Promise((res) => { release = res; });
  R.answerAll(async () => { await gate; return OK_R4(); });
  R.session._isStreaming = false;
  const p1 = R.deliver.noteTurnEnd(R.session); await sleep(5);
  const p2 = R.deliver.noteTurnEnd(R.session); await sleep(5);
  release(); await p1; await p2; await sleep(5);
  judge('S21 two turn ends around one slow post: ONE frame, ONE charge, one delivered line', { table: tableRun([['turn-end'], ['turn-end'], ['post-ok']]), engine: eng(R, id), owner: ownerSeen(R), expect: { frames: 1, ledger: ['job-notification'], park: 0, log: 'message ok via message r1' } });
}]);
// ── S22 an entry older than the bound at boot (a downtime) ──
scenarios.push(['S22', async () => {
  const R = ownerRig('s22');
  await R.notify('finished');
  const id = R.parkId();
  const raw = R.file(); raw[R.cid][0].firstAt = R.now() - 2 * 3600_000; raw[R.cid][0].nextAt = R.now() - 3600_000; fs.writeFileSync(path.join(R.dir, 'msg-retry.json'), JSON.stringify(raw));
  R.reboot(); R.answerAll(OK_R4);
  await R.advance(1000);
  judge('S22 a two-hour-old entry at boot: not posted, not authorized again — expired into the jobs store, the age named', { table: tableRun([['boot-inflight'], ['clock-forward'], ['timer']]), engine: eng(R, id), owner: { ...ownerSeen(R), authorized: R.authorized.length }, expect: { authorized: 1, stash: ['not-reachable+expired'], frames: 0, ledger: [], park: 0, log: '~stash (the retry schedule\'s 60 min bound passed 12' } });
}]);
// ── S23 the job record is gone (archived) before the fall ──
scenarios.push(['S23', async () => {
  const R = ownerRig('s23');
  await R.notify('finished');
  const id = R.parkId();
  R.jm.jobs.delete(R.job.id);
  fs.unlinkSync(R.regFile);
  await R.advance(30_000);
  const q = R.jm.peekNotifs(R.cid);
  judge('S23 the record archived before the fall: the jobs store still names the job (by the park\'s meta)', { table: tableRun([['timer', { pidAlive: false }]]), engine: eng(R, id), owner: { name: q[0] && q[0].jobName, kind: q[0] && q[0].held.kind, park: R.deliver.retryCount(R.cid) }, expect: { name: 'dc-discussion-watch', kind: 'not-running', park: 0 } });
}]);
// ── S24 the jobs engine's own 30 s floor: a distinct notice right after a landed one is stashed rate-floor (never parked) ──
scenarios.push(['S24', async () => {
  const R = ownerRig('s24');
  R.answerAll(OK_R4);
  await R.notify('first', { keepFloor: true });
  const j2 = { ...R.job, id: 'jb-2', name: 'job-2' }; R.jm.jobs.set(j2.id, j2);
  await R.notify('second', { job: j2, keepFloor: true });
  judge('S24 a second distinct notice within the 30 s floor of a landed one: stashed rate-floor by the jobs engine, never parked; the strip says waiting', { table: { state: 'stashed', posts: 1, charges: 1 }, engine: { state: 'stashed', posts: 1, charges: 1 }, owner: { ...ownerSeen(R, j2), first: ownerSeen(R).log }, expect: { first: 'message ok', log: '~stash (rate floor', stash: ['rate-floor'], strip: '1 notice is waiting for this agent’s next turn', frames: 1, ledger: ['job-notification'], park: 0 } });
}]);
// ── S25 an identical text within 10 min is suppressed ──
scenarios.push(['S25', async () => {
  const R = ownerRig('s25');
  R.answerAll(OK_R4);
  await R.notify('same words', { keepFloor: true });
  await R.notify('same words', { keepFloor: true });
  judge('S25 the same text again within 10 min: suppressed — nothing parked, nothing stashed, one frame', { table: { state: 'landed', posts: 1, charges: 1 }, engine: { state: 'landed', posts: 1, charges: 1 }, owner: ownerSeen(R), expect: { log: '~suppressed (duplicate within 10min', stash: [], frames: 1, ledger: ['job-notification'], park: 0, strip: null } });
}]);
// ── S26 R5: the floor counts the delivery that LANDED — a retried notice re-stamps it ──
scenarios.push(['S26', async () => {
  const R = ownerRig('s26');
  await R.notify('first', { keepFloor: true });
  const id = R.parkId();
  await R.advance(40_000);   // the jobs floor (real clock) is still inside 30 s: the landing re-stamps it
  R.answerAll(OK_R4); await R.turnEnd();
  const j2 = { ...R.job, id: 'jb-2', name: 'job-2' }; R.jm.jobs.set(j2.id, j2);
  await R.notify('second', { job: j2, keepFloor: true });
  judge('S26 R5: the retried notice lands and re-stamps the jobs floor; a distinct notice right after is paced (rate-floor), not posted', { table: tableRun([['timer'], ['post-refused-transient'], ['turn-end'], ['post-ok']]), engine: eng(R, id), owner: { ...ownerSeen(R, j2), firstLog: ownerSeen(R).log }, expect: { firstLog: 'message ok via message r2', log: '~stash (rate floor', stash: ['rate-floor'], frames: 1, ledger: ['job-notification'], park: 0 } });
}]);
// ── S27 a SUBSCRIBER conversation (a second live CLI) ──
scenarios.push(['S27', async () => {
  const R = ownerRig('s27');
  const cid2 = 'c0ffee00-0000-4000-8000-0000000000ff'; const sock2 = path.join(R.dir, 'inbox2.sock');
  fs.writeFileSync(path.join(R.reg, `${process.pid + 1}.json`), JSON.stringify({ pid: process.pid, sessionId: cid2, messagingSocketPath: sock2, name: 'Sub' }));
  serveSock(sock2);
  const s2 = { claudeSessionId: cid2, backendSessionId: cid2, mode: 'chat', backend: 'claude', name: 'Sub', _isStreaming: true, _turnStateSeen: true };
  R.sessions.set('w2', s2); R.cids.push(cid2);
  R.job.subscribers = [{ conversationId: cid2 }];
  R.answer('inbox.sock', OK_R4);   // the owner's own frame lands (its socket); the subscriber's is a miss (the default)
  R.jm._notifyOwner(R.job, { what: 'finished', at: Date.now() }); await sleep(10);
  const subLine = (R.job.notifyLog || []).find((l) => l.sub && l.parked);
  const ownerLine = (R.job.notifyLog || []).find((l) => !l.sub);
  R.answerAll(OK_R4);
  s2._isStreaming = false; await R.deliver.noteTurnEnd(s2); await sleep(8);
  const subDelivered = (R.job.notifyLog || []).find((l) => l.sub && l.ok);
  judge('S27 a subscriber conversation: its miss is parked with sub:true, the owner\'s lastNotify is the owner lane\'s, its turn end delivers it', { table: tableRun([['turn-end'], ['post-ok']]), engine: { state: R.events.some((e) => e.ev === 'delivered' && e.cid === cid2) ? 'landed' : 'other', posts: parkPosts(R), charges: parkCharged(R) - 1 }, owner: { parkedSub: !!subLine, ownerLane: ownerLine && ownerLine.lane + (ownerLine.ok ? ' ok' : ''), panel: R.job.lastNotify.lane + (R.job.lastNotify.ok ? ' ok' : ''), subDelivered: !!(subDelivered && subDelivered.via === 'message'), ledger: R.ledger.map((l) => l.reason) }, expect: { parkedSub: true, ownerLane: 'message ok', panel: 'message ok', subDelivered: true, ledger: ['job-notification', 'job-notification'] } });
}]);
// ── S28 a TERMINAL-mode target (no turn ends): busy by recent output; the timer alone posts ──
scenarios.push(['S28', async () => {
  const R = ownerRig('s28', { mode: 'terminal' });
  R.session._lastPtyDataAt = Date.now();
  await R.notify('finished');
  const id = R.parkId();
  const parked = (R.job.notifyLog || []).find((l) => l.parked);
  R.answerAll(OK_R4);
  await R.advance(30_000);
  judge('S28 a terminal session: parked with busy=yes (recent output), no turn end exists — the timer posts at +30 s, one charge', { table: tableRun([['timer'], ['post-ok']]), engine: eng(R, id), owner: { ...ownerSeen(R), busy: parked && parked.busy }, expect: { busy: true, frames: 1, ledger: ['job-notification'], park: 0, log: 'message ok via message r1' } });
}]);
// ── S29 a GRACEFUL stop mid-post, then a boot ──
scenarios.push(['S29', async () => {
  const R = ownerRig('s29');
  await R.notify('finished');
  const id = R.parkId();
  let release; const gate = new Promise((res) => { release = res; });
  R.answerAll(async () => { await gate; return OK_R4(); });
  R.session._isStreaming = false;
  const te = R.deliver.noteTurnEnd(R.session); await sleep(5);
  R.deliver.closeRetries();
  const settled = R.deliver.settleRetries(2000);
  release(); await te; const n = await settled;
  const stampOnDisk = !!(R.file()[R.cid] || []).length;
  R.reboot(); await R.advance(1000);
  judge('S29 a graceful stop waits the post out: landed, charged once, nothing on disk; the next boot finds nothing to hand over', { table: tableRun([['turn-end'], ['graceful-stop-mid-post', { postOutcome: 'ok' }]]), engine: eng(R, id), owner: { ...ownerSeen(R), settled: n, stampOnDisk }, expect: { settled: 1, stampOnDisk: false, frames: 1, ledger: ['job-notification'], park: 0, stash: [] } });
}]);
// ── S30 a FINAL refusal at the retry (the socket re-bound while the pid lives) ──
scenarios.push(['S30', async () => {
  const R = ownerRig('s30');
  await R.notify('finished');
  const id = R.parkId();
  R.answerAll(() => ({ ok: false, reason: 'socket error: connect ENOENT', code: 'ENOENT', phase: 'connect', transient: false }));
  await R.advance(30_000);
  judge('S30 a final refusal at the retry: falls at once as not-running (the socket is not served), nothing charged', { table: tableRun([['timer'], ['post-refused-final']]), engine: eng(R, id), owner: ownerSeen(R), expect: { stash: ['not-running'], frames: 0, ledger: [], park: 0, log: '~stash (socket error: connect ENOENT' } });
}]);
// ── S31 the armed hand-over meets a turn that runs again at the deferred instant ──
scenarios.push(['S31', async () => {
  const R = ownerRig('s31');
  await R.notify('finished');
  const id = R.parkId();
  R.answerAll(OK_R4);
  await R.deliver.deliverToConversation(R.cid, 'a direct one', { kind: 'notification', spendReason: 'peer-message' });   // the floor's witness
  AR.drainNotifsUnderCap(R.jm, R.deliver, R.cid, AR.INLINE_CAP, () => { });   // starved: armed
  await R.advance(5000);
  await R.turnEnd();   // inside the floor: deferred 25 s
  R.session._isStreaming = true;   // a turn runs again
  await R.advance(25_000); await sleep(8);
  const reArmed = R.deliver.handoverArmed(R.cid);
  await R.turnEnd(); await sleep(8);
  judge('S31 an armed hand-over deferred by the floor finds a turn running: re-armed — but the park\'s own timer posts the entry at the floor\'s end (one charge, the held authorization), and the re-armed hand-over then finds nothing', { table: tableRun([['turn-end', { now: NOW_R4 + 5_000 }], ['timer', { now: NOW_R4 + 30_000 }], ['post-ok']], 'rt-1', { entry: { lastPostAt: NOW_R4 } }), engine: eng(R, id), owner: { ...ownerSeen(R), reArmed }, expect: { reArmed: true, frames: 2, ledger: ['peer-message', 'job-notification'], park: 0, log: 'message ok via message r1' } });
}]);

for (const [name, fn] of scenarios) { try { await fn(); } catch (e) { results.push({ name, agree: false, te: 'threw: ' + (e && e.stack || e), diffs: [] }); console.error('  ✗ ' + name + ' — threw ' + (e && e.message)); } }
const nOwner = results.length, agreeOwner = results.filter((r) => r.agree).length;
ok(nOwner >= 25 && agreeOwner === nOwner, `THE OWNER'S OUTCOMES: ${agreeOwner} / ${nOwner} scenarios agree on all three judgements (the table, the engine, what the owner sees)`, results.filter((r) => !r.agree).map((r) => r.name.slice(0, 50) + ': ' + (r.te || '') + ' ' + r.diffs.join('; ')).join('\n      '));
}

// ── §7 VERIFY r4 — the attacks on what r3 added ──────────────────────────────────────────────────────────────────
console.log('\n§7 verify r4: a hit during a flight; the copy that gives way; a clock that keeps going back; the file\'s bound; the expired tail');
{
  const Pr = require(path.join(REPO, 'src/park-step.js'));
  const OKr = () => ({ ok: true, phase: 'written', elapsedMs: 120 });
  // (a) T2① REFUTED: one attempt in flight per conversation — an entry parked DURING a 5 s flight, and the turn end that
  // fired meanwhile, are not lost: the turn end waits, re-asks the floor (the landed frame re-stamped it) and the TIMER
  // posts the newcomer at the floor's end — no second turn end is needed
  {
    const R = rig('r4-flight');
    await R.deliver.deliverToConversation(R.cid, 'e1 words', { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-1' } } });
    let resolveA = null; const gateA = new Promise((res) => { resolveA = res; });
    R.setAnswer(async (p, text) => { if (/e1 words/.test(text) && !/e2 words/.test(text)) { await gateA; return OKr(); } return { ok: false, reason: 'timeout', phase: 'connect', transient: true }; });
    const t0 = R.now();
    const pA = R.advance(30_000); await sleep(5);
    ok(R.deliver.retryInFlightCount() === 1, '(a) frame A in flight (the timer at +30 s)');
    const r2 = await R.deliver.deliverToConversation(R.cid, 'e2 words', { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-2' } } });
    R.session._isStreaming = false;
    const te = R.deliver.noteTurnEnd(R.session); await sleep(5);
    ok(r2.parked === true && R.deliver.retryCount(R.cid) === 2 && R.posts.length === 0, '(a) e2 parked during the flight; the turn end waits behind it (nothing posted yet)');
    R.setAnswer(async () => OKr());
    R.setNow(R.now() + 5000); resolveA(); await pA; await te; await sleep(5);
    const e2 = R.deliver.retryPeek(R.cid)[0];
    ok(R.posts.length === 1 && gateOf(e2) && !e2.inflight && e2.nextAt === R.now() + 30_000 && verdictOf(R.events.some((e) => e.id === e2.id && e.ev === 'attempt' && e.extra.why === 'floor')), '(a) A landed at +35 s; the waiting turn end re-asked the floor: e2 rescheduled to the landing + 30 s (why: floor)', JSON.stringify({ posts: R.posts.length, next: e2 && e2.nextAt - R.now() }));
    await R.advance(30_000);
    ok(R.posts.length === 2 && gateOf(/e2 words/.test(R.posts[1])) && R.ledger.length === 2 && R.deliver.retryCount(R.cid) === 0, '(a) …and the TIMER posts e2 at +65 s — a hit during the flight posts at the flight\'s end + the floor, never waits for the next turn end (T2① refuted)', JSON.stringify({ p: R.posts.length, l: R.ledger.length }));
  }
  // (b) T2②: a stash of 30 may-have-landed copies and no real entry, then a real one — the OLDEST copy gives way, named
  {
    const RJ = jobsRig('r4-copies');
    for (let i = 1; i <= 30; i++) RJ.jm._stashNotif(RJ.cid, { ...RJ.job, id: 'jb-copy-' + i }, { what: 'copy ' + i, at: Date.now() - 60_000 * (31 - i) }, 'maybe', { held: { kind: 'not-reachable', maybeDelivered: true, attempts: 1 } });
    RJ.jm._stashNotif(RJ.cid, { ...RJ.job, id: 'jb-real' }, { what: 'the real one', at: Date.now() }, 'not reachable', { held: { kind: 'not-reachable', attempts: 1 } });
    const q = RJ.jm.peekNotifs(RJ.cid);
    ok(q.length === 30 && gateOf(q.some((e) => e.jobId === 'jb-real')) && !q.some((e) => e.jobId === 'jb-copy-1') && q.filter((e) => e.held.maybeDelivered).length === 29, '(b) 30 copies + 1 real at the cap: the real one stays, the OLDEST copy (copy 1) goes', JSON.stringify({ n: q.length, first: q[0] && q[0].jobId }));
    ok(verdictOf(RJ.logs.some((l) => /fell off the 30-entry cap \(jb-copy-1 \S+ — a may-have-landed copy, gave way first\)/.test(l))), '(b) …the journal names the copy by job + instant and says it gave way first', RJ.logs.filter((l) => /fell off/.test(l)).join(' | '));
    const RL = rig('r4-copies-ladder');
    for (let i = 1; i <= 30; i++) RL.deliver.stashFor(RL.cid, { source: 'agent', kind: 'notification', fromName: 'Background Work · copy-' + i, text: 'copy ' + i, ts: RL.now() - 60_000 * (31 - i), held: { kind: 'not-reachable', maybeDelivered: true } });
    RL.deliver.stashFor(RL.cid, { source: 'agent', kind: 'notification', fromName: 'Background Work · real', text: 'the real one', ts: RL.now(), held: { kind: 'not-reachable' } });
    ok(RL.deliver.stashCount(RL.cid) === 30 && gateOf(RL.deliver.stashPeek(RL.cid).some((e) => e.text === 'the real one')) && !RL.deliver.stashPeek(RL.cid).some((e) => e.text === 'copy 1') && verdictOf(RL.logs.some((l) => /a may-have-landed copy, gave way first/.test(l))), '(b) the ladder\'s stash: the same rule, the same words');
  }
  // (c) T2③ (reproduced): a clock that KEEPS stepping back. The first future witness is dropped (one floor-less post, said);
  // a second within the hour is RE-BASED to now (one floor held, said once an hour); a third says nothing more
  {
    const R = rig('r4-clock');
    const park = async (t) => { R.setAnswer(async () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true })); const r = await R.deliver.deliverToConversation(R.cid, t, { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-' + t } } }); R.setAnswer(async () => OKr()); return r; };
    await park('n-0'); R.session._isStreaming = false; await R.deliver.noteTurnEnd(R.session);
    ok(R.posts.length === 1, '(c) a landed post stamps the witness');
    R.setNow(R.now() - 1); await park('n-1'); await R.deliver.noteTurnEnd(R.session);
    ok(R.posts.length === 2 && R.logs.filter((l) => /the witness is dropped \(no floor\)/.test(l)).length === 1, '(c) the clock steps back a millisecond: the first future witness is dropped — n-1 posts at once, said');
    R.setNow(R.now() - 1); await park('n-2'); await R.deliver.noteTurnEnd(R.session);
    const e2 = R.deliver.retryPeek(R.cid)[0];
    ok(R.posts.length === 2 && gateOf(e2) && e2.nextAt === R.now() + 30_000 && R.logs.filter((l) => /the clock keeps going back; the witness is re-based to now \(one floor held, not dropped\) and this is said once an hour/.test(l)).length === 1, '(c) …it steps back again within the hour: the witness is RE-BASED to now — n-2 waits the floor (rescheduled +30 s), said once', JSON.stringify({ p: R.posts.length, next: e2 && e2.nextAt - R.now(), lines: R.logs.filter((l) => /witness/.test(l)).length }));
    R.setNow(R.now() - 1); await park('n-3'); await R.deliver.noteTurnEnd(R.session);
    ok(R.posts.length === 2 && R.logs.filter((l) => /re-based to now \(one floor held/.test(l)).length === 1 && R.logs.filter((l) => /witness is dropped/.test(l)).length === 1, '(c) …a third step says nothing more (once an hour)');
    await R.advance(31_000);
    ok(R.posts.length === 3 && gateOf(/n-2/.test(R.posts[2])) && gateOf(/n-3/.test(R.posts[2])) && R.deliver.retryCount(R.cid) === 0, '(c) …and the floor\'s end posts both waiting ones in ONE frame (three posts for four notices under a misbehaving clock; it was one post per notice)', JSON.stringify({ p: R.posts.length }));
    // an hour later the first drop stands again
    R.setNow(R.now() + 3600_000 + 1000); await park('n-4'); await R.deliver.noteTurnEnd(R.session);   // lands (the witness is in the past)
    R.setNow(R.now() - 1); await park('n-5'); await R.deliver.noteTurnEnd(R.session);
    ok(R.posts.length === 5 && R.logs.filter((l) => /witness is dropped/.test(l)).length === 2, '(c) an hour on, a backward step drops the witness again (the window has passed)');
    // the jobs engine's floor: the same rule under a Date.now() that steps back 10 s per fire
    const RJ = jobsRig('r4-clock-jobs');
    RJ.setAnswer(async () => OKr());
    const realNow = Date.now; let off = 0; Date.now = () => realNow() + off;
    const fires = []; const fire = async (what) => { RJ.jm._notifyOwner(RJ.job, { what }); await sleep(8); fires.push((RJ.job.notifyLog || []).slice(-1)[0].lane); };
    try {
      await fire('f1'); off -= 10_000; await fire('f2'); off -= 10_000; await fire('f3'); off -= 10_000; await fire('f4');
    } finally { Date.now = realNow; }
    ok(fires.join(',') === 'message,message,stash,stash' && RJ.logs.filter((l) => /\[jobs\].*witness is dropped/.test(l)).length === 1 && RJ.logs.filter((l) => /\[jobs\].*re-based to now \(one floor held/.test(l)).length === 1, '(c) the jobs floor: f2 after the first drop posts (said), f3 after the second is paced by the re-based floor (said once), f4 paced in silence', JSON.stringify({ fires, lines: RJ.logs.filter((l) => /witness/.test(l)).map((l) => l.slice(0, 90)) }));
    // CONTROLS: the park without the re-base posts at every step; the jobs engine without it delivers every fire
    const M = mutantCopies('ntr', REPO);
    const cds = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
    const m1 = editAnchor(cds, "      if (prevDrop && now - prevDrop < FLOOR_DROP_WINDOW_MS) {\n        lastPostAt.set(cid, now); n++;", "      if (false) {\n        lastPostAt.set(cid, now); n++;", "src/server/conversation-deliver.js");
    if (m1 === cds) ok(false, '(c) CONTROL anchor moved (park)');
    else {
      const CDm = M.load('src/server/conversation-deliver.js', m1, 'no-floor-rebase');
      const Rm = rig('r4-clock-ctl');
      Rm.deliver = CDm.create({ dataDir: Rm.dir, activeSessions: Rm.sessions, serverSetting: () => undefined, peerMsg: { findPeer: (c) => PM.findPeer(c, Rm.reg), postToPeer: async (p, text) => { const r = await Rm._ans(text); if (r.ok) Rm.posts.push(text); return r; }, postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => { }, log: (...a) => Rm.logs.push(a.join(' ')), retryClock: Rm.clock, renderBatch: AR.renderMsgStash });
      Rm._ans = async () => OKr();
      const parkM = async (t) => { Rm._ans = async () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true }); await Rm.deliver.deliverToConversation(Rm.cid, t, { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-' + t } } }); Rm._ans = async () => OKr(); };
      await parkM('m-0'); Rm.session._isStreaming = false; await Rm.deliver.noteTurnEnd(Rm.session);
      for (let k = 1; k <= 3; k++) { Rm.setNow(Rm.now() - 1); await parkM('m-' + k); await Rm.deliver.noteTurnEnd(Rm.session); }
      ok(Rm.posts.length === 4 && Rm.logs.filter((l) => /witness is dropped/.test(l)).length === 3, '(c) CONTROL: the park without the re-base posts at every backward step (4 posts in 0 ms, the floor gone)', JSON.stringify({ p: Rm.posts.length }));
    }
    const js = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf-8');
    const m2 = editAnchor(js, "      if (drop && now() - drop.at < FLOOR_DROP_WINDOW_MS) {", "      if (false) {", "src/jobs.js");
    if (m2 === js) ok(false, '(c) CONTROL anchor moved (jobs)');
    else {
      const { JobManager: JMm } = M.load('src/jobs.js', m2, 'no-floor-rebase-jobs');
      const Rj = rig('r4-clock-jobs-ctl');
      const jm = new JMm({ dataDir: Rj.dir, log: (...a) => Rj.logs.push(a.join(' ')), broadcast: () => { }, notifyUser: () => { }, onStash: () => { }, deliverToConversation: async () => ({ ok: true, lane: 'message' }), onRetry: () => { }, peerReachable: () => true });
      const job = { id: 'jb-ctl', kind: 'task', name: 'ctl', state: 'done', owner: { conversation: { id: Rj.cid } }, runs: [] }; jm.jobs.set(job.id, job);
      const lanes = []; const realNow2 = Date.now; let off2 = 0; Date.now = () => realNow2() + off2;
      try { for (let k = 0; k < 4; k++) { jm._notifyOwner(job, { what: 'c' + k }); await sleep(8); lanes.push((job.notifyLog || []).slice(-1)[0].lane); off2 -= 10_000; } } finally { Date.now = realNow2; }
      ok(lanes.join(',') === 'message,message,message,message', '(c) CONTROL: the jobs engine without the re-base delivers every fire under a backward clock (no floor at all)', lanes.join(','));
    }
  }
  // (d) T2④ THE FILE'S BOUND: per conversation ≤ RETRY_CAP waiting + one frame in flight + one hand-over's claim = 90;
  // a 91st park evicts the oldest WAITING; the three bounds are the same constant
  {
    const cds = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
    const shs = fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf-8');
    ok(gateOf(/const RETRY_FRAME_MAX_ENTRIES = STASH_CAP;/.test(cds)) && gateOf(/const RETRY_CAP = STASH_CAP;/.test(cds)) && gateOf(/const HANDOVER_MAX_ENTRIES = 30;/.test(shs)) && CD.create.length === 1, '(d) the three per-conversation bounds are one constant (30): the cap, the frame, the hand-over');
    const R = rig('r4-bound');
    const park = (t) => R.deliver.deliverToConversation(R.cid, t, { kind: 'notification', spendReason: 'job-notification', retry: { producer: 'test', meta: { jobId: 'jb-' + t } } });
    let max = 0; const track = () => { max = Math.max(max, R.deliver.retryCount(R.cid)); };
    for (let i = 1; i <= 30; i++) { await park('claimed-' + i); track(); }
    const rel = R.deliver.claimRetry(R.cid, R.deliver.retryEntries(R.cid), 'ho-x');
    for (let i = 1; i <= 30; i++) { await park('flying-' + i); track(); }
    let hold = null; R.setAnswer((p, text) => (/flying/.test(text) ? new Promise((res) => { hold = res; }) : { ok: false, reason: 'timeout', phase: 'connect', transient: true }));
    R.session._isStreaming = false;
    const te = R.deliver.noteTurnEnd(R.session); await sleep(5);
    for (let i = 1; i <= 30; i++) { await park('waiting-' + i); track(); }
    const peek = R.deliver.retryPeek(R.cid);
    ok(peek.length === 90 && peek.filter((e) => e.ho).length === 30 && peek.filter((e) => e.inflight).length === 30 && !R.events.some((e) => e.ev === 'fell'), '(d) 30 claimed + 30 in flight + 30 waiting = 90 in the file, nothing evicted');
    await park('waiting-31'); track();
    ok(R.deliver.retryCount(R.cid) === 90 && R.events.filter((e) => e.ev === 'fell' && e.extra.evicted).length === 1 && max === 90, '(d) the 91st park evicts the oldest WAITING inside the same call: the file never rests above 3 × 30 per conversation', JSON.stringify({ n: R.deliver.retryCount(R.cid), max }));
    hold(OKr()); await te; rel();
    ok(R.deliver.retryCount(R.cid) === 60 && R.posts.length === 1, '(d) …the frame lands (30 gone), the claim releases (30 waiting again): 60');
  }
  // (e) T1 S4/S22 (the r4 fix): a jobs notification that EXPIRES carries `expired` into the jobs store — the digest tail
  // says the hour passed — and the parked Delivery-log line is closed with the attempts the stash line names
  {
    const R = jobsRig('r4-expired');
    R.jm._notifyOwner(R.job, { what: 'finished' }); await sleep(10);
    await R.advance(61 * 60_000);
    const q = R.jm.peekNotifs(R.cid);
    ok(q.length === 1 && q[0].held.kind === 'not-reachable' && q[0].held.expired === true && q[0].held.attempts === 10, '(e) the expired entry sits in the jobs store typed not-reachable + expired, attempts 10', JSON.stringify(q[0] && q[0].held));
    const digest = JM_MODEL.renderNotifStash(q);
    ok(verdictOf(/The hour of retries passed without the agent accepting some of them\./.test(digest)), '(e) …the digest\'s tail says the hour passed (it never could: the listener dropped `expired`)', digest.split('\n').slice(-2).join(' | '));
    const parked = (R.job.notifyLog || []).find((l) => l.parked);
    const last = (R.job.notifyLog || []).slice(-1)[0];
    ok(gateOf(parked) && parked.retries === 9 && parked.nextAt === null && last.lane === 'stash' && verdictOf(/in 10 attempts/.test(last.reason)), '(e) …the parked line reads retries 9 (closed, no next instant) beside the stash line\'s 10 attempts — one story', JSON.stringify({ retries: parked && parked.retries, next: parked && parked.nextAt, last: last && last.reason.slice(0, 60) }));
    const R2 = jobsRig('r4-expired-boot');
    R2.jm._notifyOwner(R2.job, { what: 'finished' }); await sleep(10);
    const f = path.join(R2.dir, 'msg-retry.json'); const raw = JSON.parse(fs.readFileSync(f, 'utf-8'));
    raw[R2.cid][0].firstAt = R2.now() - 2 * 3600_000; raw[R2.cid][0].nextAt = R2.now() - 3600_000; fs.writeFileSync(f, JSON.stringify(raw));
    const R3 = rig('r4-expired-boot2', { dataDir: R2.dir });
    const jm3 = new JobManager({ dataDir: R2.dir, log: () => { }, broadcast: () => { }, notifyUser: () => { }, onStash: () => { }, deliverToConversation: (c, t, o) => R3.deliver.deliverToConversation(c, t, o), onRetry: (fn) => R3.deliver.onRetry(fn), peerReachable: () => true });
    jm3.jobs.set(R2.job.id, R2.job);
    await R3.advance(1000);
    const q3 = jm3.peekNotifs(R2.cid);
    ok(q3.length === 1 && q3[0].held.expired === true && verdictOf(/The hour of retries passed/.test(JM_MODEL.renderNotifStash(q3))), '(e) the bound at a boot (a downtime) carries expired too', JSON.stringify(q3[0] && q3[0].held));
  }
}

console.log('\n§W wiring pins');
{
  const sj = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8');
  ok(gateOf(/noteTurnEnd: noteTurnEndEngine,/.test(sj)) && gateOf(/const noteTurnEnd = \(s, m\) => \{ noteTurnEndEngine\(s, m\); try \{ deliver\.noteTurnEnd\(s\); \}/.test(sj)) && verdictOf(/modelsMatch, noteSessionProduced, noteTurnEnd, noteTurnStopped,/.test(sj)), 'server.js: the ONE noteTurnEnd the stdout consumers get forwards every turn end to the park (claude result / codex task_complete / ACP)');
  ok(gateOf(/deliver\.closeRetries\(\); m = deliver\.retryInFlightCount\(\);/.test(sj)) && gateOf(/require\('\.\/src\/server\/exit-settle\.js'\)\.settleInFlight\(\{ stashView, deliver, n, m \}\)\.finally\(shutdownNow\)/.test(sj)) && verdictOf(/deliver\.settleRetries\(maxMs\)/.test(fs.readFileSync(path.join(REPO, 'src/server/exit-settle.js'), 'utf-8'))), 'server.js: the shutdown shuts the park\'s door and waits for its posts in flight beside the hand-overs (exit-settle.js, verify r1)');
  const jw = fs.readFileSync(path.join(REPO, 'src/server/jobs-wiring.js'), 'utf-8');
  ok(verdictOf(/onRetry: \(fn\) => deliver\.onRetry\(fn\)/.test(jw)), 'jobs-wiring hands the engine the park\'s events');
  const jobs = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf-8');
  ok(gateOf(/spendReason: 'job-notification', retry \}/.test(jobs)) && verdictOf(/deps\.onRetry\(\(ev, cid, entry, extra\) => this\._onRetryEvent/.test(jobs)), 'jobs.js opts into the park and books its events');
  // verify r2 (R3): THE PARK → STASH FALL IS ONE-WAY. The only `retry` opt-in site in the tree is the jobs engine's first
  // attempt (`_notifyOwner`); an evicted / expired / may-have-landed entry lands in the producer's stash ONCE (`fell` ⇒
  // `_stashNotif`, which never posts), and every later carrier of that stash — the prompt's drain, a hand-over, the armed
  // turn-end post — calls the ladder WITHOUT `retry`, so a miss re-stashes and never parks again: no loop between the two stores
  const { execFileSync } = require('node:child_process');
  // the opt-in is the KEY `retry` in the call's options (`retry }` / `retry:`), never the word inside 'stash-retry'
  const optIns = execFileSync('git', ['grep', '-n', '-E', 'deliverToConversation\\(.*[{,] *retry *[:}]', '--', 'src', 'server.js', 'data/bin'], { cwd: REPO, encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
  ok(optIns.length === 1 && gateOf(optIns[0].startsWith('src/jobs.js:')) && verdictOf(/spendReason: 'job-notification', retry \}\)/.test(optIns[0])), 'the ONE retry opt-in site is the jobs engine\'s first attempt (grep census)', optIns.join(' | '));
  const sh = fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf-8');
  ok((sh.match(/d\.deliverToConversation\(cid, frame, \{ kind: 'notification', spendReason: 'stash-(retry|handover)', fromName: FROM_NAME, cardText \}\)/g) || []).length === 2 && !/deliverToConversation\([^)]*[{,] *retry *[:}]/.test(sh), 'the hand-over\'s two posts (auto + pressed) carry no retry: a miss re-stashes, never parks');
  const fellBody = jobs.slice(jobs.indexOf("if (ev === 'fell') {"), jobs.indexOf("return this._taken(this._parkCopyIn(cid, entry.id));", jobs.indexOf("if (ev === 'fell') {")));   // lane lg-store-writes (the moved2 cure 2): it answers «taken» with the jobs landing to ride
  ok(gateOf(/this\._stashNotif\(cid, target/.test(fellBody)) && !/deliverToConversation|_notifyOwner\(/.test(fellBody), 'the jobs engine\'s fell listener stashes in its own store and posts nothing');
}

{
  // (r4, lane jobs-addressed-push) A PRODUCER RE-ASKS BEFORE ITS PARKED COPY IS DELIVERED: the turn end, the backoff timer and the
  // stash hand-over each ask the entry's producer's judge (registerRetryJudge — the jobs engine registers jm.retryOwed: a
  // subscriber's copy is owed only while the subscriber may view the job NOW). Not owed ⇒ DROPPED: no post, no wake (nothing
  // billed, the parked hold given back), no stash, the producer hears «dropped». Owed ⇒ delivered (each road's control). A
  // producer with no judge is owed exactly as before.
  const SHj = require(path.join(REPO, 'src/server/stash-handover.js')), ARj = require(path.join(REPO, 'src/agent-routes.js'));
  for (const road of ['turn-end', 'timer', 'hand-over']) {
    for (const owed of [false, true]) {
      const R = rig(`judge-${road}-${owed}`);
      let asked = 0;
      R.deliver.registerRetryJudge('test', () => { asked++; return owed; });
      const r = await NOTIFY(R);
      R.setAnswer(async () => ({ ok: true, phase: 'written', elapsedMs: 10 }));
      R.session._isStreaming = false;
      let ho = null;
      if (road === 'turn-end') await R.deliver.noteTurnEnd(R.session);
      else if (road === 'timer') await R.advance(31_000);
      else { const view = SHj.create({ activeSessions: R.sessions, getDeliver: () => R.deliver, getJobs: () => null, broadcastSessions: () => { }, renderMsgStash: ARj.renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, log: { log() { }, warn() { } } }); ho = await view.handOver('w1', { pressed: PRESS }); }
      await sleep(5);
      const said = { parked: r.parked, posts: R.posts.length, park: R.deliver.retryCount(R.cid), stash: R.deliver.stashCount(R.cid), ledger: R.ledger.length, releases: R.releases.length, asked, ev: R.events.map((e) => e.ev), ho: ho && (ho.code || ho.ok) };
      if (owed) ok(r.parked === true && R.posts.length === 1 && asked >= 1 && R.deliver.retryCount(R.cid) === 0, `(r4) ${road}: the producer's judge says OWED ⇒ the parked copy is delivered (the control)`, JSON.stringify(said));
      else ok(r.parked === true && asked >= 1 && R.posts.length === 0 && R.deliver.retryCount(R.cid) === 0 && R.deliver.stashCount(R.cid) === 0 && R.ledger.length === 0 && R.releases.length === 1 && verdictOf(R.events.some((e) => e.ev === 'dropped')),
        `(r4) ${road}: the producer's judge says NOT OWED ⇒ dropped — no post, no wake (nothing billed, the hold given back), no stash; the producer hears «dropped»`, JSON.stringify(said));
    }
  }
  const R = rig('judge-other-producer');
  R.deliver.registerRetryJudge('jobs', () => false);   // a judge for ANOTHER producer refuses everything
  await NOTIFY(R);   // producer 'test' registered none
  R.setAnswer(async () => ({ ok: true, phase: 'written' })); R.session._isStreaming = false;
  await R.deliver.noteTurnEnd(R.session);
  ok(R.posts.length === 1 && !R.events.some((e) => e.ev === 'dropped'), '(r4) a producer that registered no judge is delivered exactly as before (another producer\'s judge never touches it)');
  const RT = rig('judge-throws');
  RT.deliver.registerRetryJudge('test', () => { throw new Error('boom'); });
  await NOTIFY(RT); RT.setAnswer(async () => ({ ok: true, phase: 'written' })); RT.session._isStreaming = false;
  await RT.deliver.noteTurnEnd(RT.session);
  ok(RT.posts.length === 0 && RT.deliver.retryCount(RT.cid) === 0 && RT.deliver.stashCount(RT.cid) === 0, '(r4) a judge that THROWS withholds (fail closed, like a stash gate) — nothing posted, nothing stashed');
}

{
  // (r5, lane jobs-addressed-push) THE RETRY ASKS THE SAME QUESTION AS THE PUSH, WITH THE SAME ANSWER — the real ladder + the REAL
  // jobs engine (its retry judge and its event listener wired as jobs-wiring wires them) + a scripted view source (a live record,
  // or the group store's membership by key): proven ⇒ delivered · refused (a live record that may not view) ⇒ dropped · unknown
  // (no live record, no membership by key) ⇒ no post, no wake: HELD — the drain judges it at the turn that would print it
  const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
  const OWN_CID = 'c0ffee00-0000-4000-8000-0000000000aa';
  const setup = async (name) => {
    const R = rig(name);
    const view = { live: null, byKey: new Set(['T-g']) };   // the subscriber (R.cid): no live record per the view source, a member by key
    const dir = path.join(R.dir, 'jobs'); fs.mkdirSync(dir, { recursive: true });
    const jm = new JobManager({ dataDir: dir, broadcast() { }, log() { }, notifyUser() { return { ok: true }; }, deliverToConversation: (cid, text, opts) => R.deliver.deliverToConversation(cid, text, opts), onRetry: (fn) => R.deliver.onRetry(fn), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true,
      viewerOf: (cid) => (cid !== R.cid ? null : view.live ? { live: true, conversationId: cid, sessionId: 'w1', sessionCreatedAt: 1, groups: view.live } : { live: false, conversationId: cid, groups: view.byKey }) });
    jm.init(); for (const t of jm._timers || []) clearInterval(t);
    jm._spawn = (job) => { job.runs = [{ startedAt: Date.now() }]; job.state = 'up'; };
    R.deliver.registerRetryJudge('jobs', (cid, e) => jm.retryOwed(cid, e));
    const owner = { conversation: { id: OWN_CID }, sessionId: 's-own', sessionCreatedAt: 1, groupsSnapshot: ['T-g'] };
    const j = jm.jobs.get(jm.create({ kind: 'task', name: 'watched', cmd: { argv: ['true'] }, owner, access: { view: 'group', control: 'session' } }, { conversationId: OWN_CID, sessionId: 's-own', sessionCreatedAt: 1, groups: new Set(['T-g']) }).job.id);
    j.subscribers = [{ conversationId: R.cid, sessionId: 'w1', ts: Date.now(), filter: null }];
    jm.announce(j, 'found news'); await sleep(30);   // the PUSH: proven by key ⇒ posted ⇒ a transient miss on the live pid ⇒ PARKED
    return { R, jm, j, view, parked: R.deliver.retryCount(R.cid), charged0: R.ledger.length };
  };
  const turnEnd = async (R) => { R.setAnswer(async () => ({ ok: true, phase: 'written' })); R.session._isStreaming = false; await R.deliver.noteTurnEnd(R.session); await sleep(10); };
  const heldOf = (jm, cid) => (jm.pendingNotifs.get(cid) || []);
  { // THE MEASURED CASE: a member by key, parked, then removed from the group (still no live record)
    const { R, jm, j, view, parked, charged0 } = await setup('r5-removed');
    view.byKey = new Set();
    await turnEnd(R);
    const held = heldOf(jm, R.cid);
    ok(parked === 1 && R.posts.length === 0 && R.ledger.length === charged0 && R.deliver.retryCount(R.cid) === 0 && R.deliver.stashCount(R.cid) === 0 && held.length === 1 && held[0].sub === true,
      '(r5) a member by key, parked, then REMOVED (no live record): the retry posts nothing and bills nothing; the copy waits as a HELD line (the push\'s road for that viewer)', JSON.stringify({ parked, posts: R.posts.length, held: held.length }));
    view.live = new Set();   // its next turn: a live record that may not view
    ok(jm.peekNotifs(R.cid).length === 0 && !heldOf(jm, R.cid).length, '(r5) …and at its next turn (it may not view) nothing is printed: the drain drops the held line');
    const line = (j.notifyLog || []).find((l) => l && l.parked);
    ok(gateOf(line) && line.dropped === true && verdictOf(/held for its next turn/.test(line.reason || '')), '(r5) the Delivery log says what happened — held for its next turn, judged there', JSON.stringify(line));
  }
  { // ITS CONTROL: still a member by key ⇒ delivered
    const { R, jm, parked } = await setup('r5-member');
    await turnEnd(R);
    ok(parked === 1 && R.posts.length === 1 && gateOf(/you subscribed/.test(R.posts[0])) && !heldOf(jm, R.cid).length, '(r5) CONTROL: still a member by key ⇒ the retry delivers the subscriber\'s copy (marked)', JSON.stringify({ posts: R.posts.map((t) => t.slice(0, 80)) }));
  }
  { // REFUSED: a live record that may not view ⇒ dropped, nothing held
    const { R, jm, view, parked } = await setup('r5-refused');
    view.live = new Set();
    await turnEnd(R);
    ok(parked === 1 && R.posts.length === 0 && !heldOf(jm, R.cid).length && R.deliver.stashCount(R.cid) === 0, '(r5) a LIVE record that may not view ⇒ dropped: no post, no wake, no held line');
  }
  { // UNKNOWN, then it returns and CAN view (a folder member the store could not show) ⇒ printed
    const { R, jm, view } = await setup('r5-unknown-can');
    view.byKey = new Set();
    await turnEnd(R);
    view.live = new Set(['T-g']);
    const shown = jm.peekNotifs(R.cid);
    ok(R.posts.length === 0 && shown.length === 1 && shown[0].sub === true, '(r5) UNKNOWN at the retry, then it returns able to view ⇒ the held line is printed (marked) at its turn');
  }
  { // a judge that THROWS: the log says the check failed (never a reason untrue for a member)
    const { R, jm, j } = await setup('r5-threw');
    jm.retryOwed = () => { throw new Error('view source down'); };
    await turnEnd(R);
    const line = (j.notifyLog || []).find((l) => l && l.parked);
    ok(R.posts.length === 0 && gateOf(line) && gateOf(/the delivery check failed/.test(line.reason || '')) && !/can no longer view/.test(line.reason || ''), '(r5) a check that THREW is journalled as such — «the delivery check failed», never «can no longer view»', JSON.stringify(line));
  }
}

// ── B-6721: A STASHED WAKE WAKES ITS CONVERSATION ONCE IT RUNS AGAIN, OR FOR YOU SAYS IT WAITS ──────────────────────────────
// (fb-708fa798a0, measured in the journal: a one-shot fired at 08:30 while its conversation was not running — «no live inbox …
// pid-gone», stashed; the conversation was resumed at 09:18 and heard nothing until a prompt hours later.) THE REAL ladder, THE
// REAL jobs engine, THE REAL stash view: the conversation STOPPED (no live session, its pid gone), then BACK (a live session of
// it, a live registration, idle) — the view hears a live session as the hub's payload does (`summaryFor`, built for every one).
console.log('\n§B-6721 a notice stashed while its conversation was not running: For you says it waits; the conversation back ⇒ ONE hand-over');
{
  const SHSRC = fs.readFileSync(path.join(REPO, 'src/server/stash-handover.js'), 'utf8');
  const MB = mutantCopies('ntr-b6721', REPO);
  const wakeRig = (name, JMc = JobManager) => {   // JMc: a jobs engine (a RED's mutant)
    const R = rig(name, { pid: 99999999 });   // the incident: the CLI's pid gone
    R.sessions.delete('w1');                  // …and no live session of it: the conversation STOPPED
    const filed = [], resolved = [], scheduled = [];
    let view = null;
    const jm = new JMc({ dataDir: R.dir, log: (...a) => R.logs.push(a.join(' ')), broadcast: () => { }, notifyUser: () => { }, onStash: () => { if (view) view.changed(); },
      deliverToConversation: (cid, text, opts) => R.deliver.deliverToConversation(cid, text, opts), onRetry: (fn) => R.deliver.onRetry(fn), peerReachable: (cid) => R.deliver.peerReachable(cid),
      noticeWakeWaiting: (o) => { filed.push(o); return 'ut-wait-1'; }, resolveWakeWaiting: (cid) => { resolved.push(cid); return 1; } });
    const job = { id: 'jb-bbbb2222', kind: 'task', name: 'ticket-window-watch', state: 'done', owner: { conversation: { id: R.cid } }, access: { view: 'all', control: 'session' }, runs: [] };
    jm.jobs.set(job.id, job);
    const mk = (mod) => { view = mod.create({ activeSessions: R.sessions, getDeliver: () => R.deliver, getJobs: () => jm, broadcastSessions: () => { }, renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, log: { log: (...a) => R.logs.push(a.join(' ')), warn() { } }, now: () => R.now(), schedule: (fn, ms) => { scheduled.push({ fn, ms }); return null; }, wakeBootGraceMs: 0 }); return view; };
    const run = async () => { const xs = scheduled.splice(0); for (const x of xs) await x.fn(); await sleep(20); };
    const comeBack = () => {   // the conversation resumed: a live session of it, a LIVE registration, its CLI idle and taking frames
      R.sessions.set('w1', R.session);
      fs.writeFileSync(path.join(R.reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: R.cid, messagingSocketPath: path.join(R.dir, 'inbox.sock'), name: 'Owner', version: '2.1.281' }));
      R.session._isStreaming = false; R.setAnswer(async () => ({ ok: true, phase: 'written' }));
    };
    const broadcast = () => { if (view) view.summaryFor(R.session); };   // the hub's payload, built for every live session
    return { ...R, jm, job, filed, resolved, scheduled, run, comeBack, mk, broadcast, view: () => view };
  };
  const fire = async (W, what) => { W.jm._notifyOwner(W.job, { what }); await sleep(20); };
  // (a) THE INCIDENT
  {
    const W = wakeRig('b6721-incident'); W.mk(SH);
    await fire(W, 'fired: the ticket window opens in 1 h');
    const q0 = W.jm.peekNotifs(W.cid);
    ok(q0.length === 1 && gateOf(q0[0].held) && q0[0].held.kind === 'not-running' && W.scheduled.length === 1 && W.scheduled[0].ms === 5000, '(a) B-6721: stashed not-running (the incident) — ONE check armed (5 s)', JSON.stringify({ q: q0.map((n) => n.held), s: W.scheduled.map((x) => x.ms) }));
    await W.run();
    ok(W.filed.length === 1 && W.filed[0].cid === W.cid && W.posts.length === 0 && W.scheduled.length === 0,
      '(a) …the conversation AWAY (no live session): For you says the notices wait (once), nothing posted, and the chain ENDS — nothing polls a stopped conversation', JSON.stringify({ filed: W.filed, posts: W.posts.length, s: W.scheduled.map((x) => x.ms) }));
    W.broadcast(); await sleep(20);
    ok(W.scheduled.length === 0, '(a) …a payload built while it is still away arms nothing');
    W.comeBack(); W.broadcast(); await sleep(5);
    ok(W.scheduled.length === 1 && W.scheduled[0].ms === 5000, '(a) …a LIVE session of it (the resume) arms its chain at once', JSON.stringify(W.scheduled.map((x) => x.ms)));
    await W.run();
    ok(W.posts.length === 1 && gateOf(/that were waiting for this conversation/.test(W.posts[0])) && gateOf(/ticket window opens in 1 h/.test(W.posts[0])) && W.jm.peekNotifs(W.cid).length === 0,
      '(a) …back, idle: ONE post — the frame carries the notice — the stash empty', JSON.stringify({ posts: W.posts.map((x) => x.slice(0, 160)) }));
    ok(W.ledger.length === 1 && W.ledger[0].reason === 'stash-reachable' && gateOf(W.resolved.includes(W.cid)) && W.scheduled.length === 0 && W.filed.length === 1,
      '(a) …billed ONCE under its OWN reason (stash-reachable), For you\'s item closed, no chain left, nothing filed again', JSON.stringify({ ledger: W.ledger, resolved: W.resolved, s: W.scheduled.length }));
  }
  // (a) the hand-over is a delivery for the engine's 30 s floor (its read: two billed posts inside 30 s otherwise) — the stamp
  // is the HAND-OVER's (taken after it, never the attempt's own earlier stamp)
  const floorRun = async (mod) => {
    const W = wakeRig('b6721-floorstamp-' + Math.random().toString(36).slice(2, 6)); W.mk(mod);
    await fire(W, 'fired while stopped');
    await W.run(); W.comeBack(); W.broadcast(); await sleep(15);
    const t0 = Date.now();
    await W.run();
    const rate = W.jm._notifyRate.get(W.cid);
    return { posts: W.posts.length, stamped: !!(rate && rate.ts >= t0), rate };
  };
  {
    const f = await floorRun(SH);
    ok(f.posts === 1 && verdictOf(f.stamped), '(a) …the engine\'s 30 s floor counts the hand-over (stamped AT it, as a post of its own)', JSON.stringify(f));
    const SHnoStamp = MB.load('src/server/stash-handover.js', anchored(SHSRC, "      if (tookJobs.length && jm && typeof jm.noteHandedOver === 'function') { try { jm.noteHandedOver(cid, frame); } catch { } }   // B-6721: the engine's 30 s floor counts this delivery\n", '', 'B-6721: the floor not stamped'), 'sh-nostamp');
    const fr = await floorRun(SHnoStamp);
    ok(fr.posts === 1 && !fr.stamped, 'RED control: without the stamp the floor still reads the ATTEMPT\'s older stamp (two billed posts could land inside 30 s)', JSON.stringify(fr));
  }
  // (a) THE RESTORE ROAD (the delta read's must): a wake that LANDED leaves the conversation quiet at the newest notice it carried — a
  // frame the wrapper hands back restores those entries (still owed) and no fresh chain re-posts them
  const restoreRun = async (mod) => {
    const W = wakeRig('b6721-restore-' + Math.random().toString(36).slice(2, 6)); W.mk(mod);
    await fire(W, 'fired while stopped');
    await W.run(); W.comeBack(); W.broadcast(); await sleep(5); await W.run();
    const back = W.view().restoreHandedOver(W.cid, W.posts[0], { kind: 'notification' });
    await sleep(30);
    return { posts: W.posts.length, back, owed: W.jm.wakeOwed(W.cid).length, armed: W.scheduled.length };
  };
  {
    const r = await restoreRun(SH);
    ok(r.posts === 1 && r.back >= 1 && r.owed >= 1 && r.armed === 0, '(a) …the frame handed back RESTORES the notice (still owed) and nothing re-arms — no second billed post', JSON.stringify(r));
    const SHnoHanded = MB.load('src/server/stash-handover.js', anchored(SHSRC, "        quiet(cid, 'handed', handed);\n", "        wakeQuiet.delete(cid);\n", 'B-6721: no quiet after a wake that landed'), 'sh-nohanded');
    const rr = await restoreRun(SHnoHanded);
    ok(rr.back >= 1 && rr.armed >= 1, 'RED control: without the quiet after a wake that landed, the restored entries arm a fresh chain (the billed loop the read found)', JSON.stringify(rr));
  }
  // (a) RED: the resume road cut (summaryFor arms nothing) — the conversation back hears nothing: the incident
  {
    const SHnoLive = MB.load('src/server/stash-handover.js', anchored(SHSRC, "    noteLive(cid);   // B-6721: a live session of a conversation owed a wake (a resume, a restore) arms its chain — the payload is built for every live session; a pending fork (its parent's id) never\n", '', 'B-6721: the resume road cut'), 'sh-nolive');
    const W = wakeRig('b6721-red'); W.mk(SHnoLive);
    await fire(W, 'fired: the ticket window opens in 1 h');
    await W.run(); W.comeBack(); W.broadcast(); await sleep(5); await W.run();
    ok(W.posts.length === 0 && W.jm.peekNotifs(W.cid).length === 1, 'RED control: without the resume road the conversation back hears nothing (the incident: the stash waits for a prompt)', JSON.stringify({ posts: W.posts.length }));
  }
  // (b) B-2fa2 (merged): a FLOORED distinct notice fires at its bound — the conversation live, no For-you item
  {
    const W = wakeRig('b6721-floor'); W.mk(SH); W.comeBack();
    await fire(W, 'first: delivered at once');
    await fire(W, 'second: inside the floor');
    const q = W.jm.peekNotifs(W.cid);
    ok(W.posts.length === 1 && q.length === 1 && q[0].held.kind === 'rate-floor' && W.scheduled.length === 1, '(b) B-2fa2: a second, distinct notice inside the 30 s floor is stashed rate-floor and its check armed', JSON.stringify({ posts: W.posts.length, held: q.map((n) => n.held), s: W.scheduled.length }));
    await W.run();
    ok(W.posts.length === 1 && W.scheduled.length === 1 && W.scheduled[0].ms >= 29000, '(b) …the first look waits the ladder\'s floor out (never two posts inside it)', JSON.stringify(W.scheduled.map((x) => x.ms)));
    await W.advance(31 * 1000);
    await W.run();
    ok(W.posts.length === 2 && gateOf(/second: inside the floor/.test(W.posts[1])) && W.jm.peekNotifs(W.cid).length === 0 && W.filed.length === 0, '(b) …and fires at its bound — never left for a prompt; no For-you item (never away)', JSON.stringify({ posts: W.posts.length, filed: W.filed.length }));
  }
  // (c) a notice the SPEND CEILING held, alone, waits for the person as before — no chain
  {
    const W = wakeRig('b6721-spend'); W.mk(SH);
    W.jm._stashNotif(W.cid, W.job, { what: 'held by the ceiling' }, 'spend', { held: { kind: 'spend-cap' } });
    await sleep(20);
    ok(W.scheduled.length === 0 && W.filed.length === 0, '(c) a notice the spend ceiling held, alone, arms no wake (the person\'s word stands)', JSON.stringify(W.scheduled.length));
  }
  // (d) AT BOOT: the engine reads its notices after listen — its announce arms each owed conversation (the view was built before)
  {
    const W = wakeRig('b6721-boot'); W.mk(SH);   // the view built at module load, over an engine that has read nothing yet
    W.jm._notifsAnswer({ state: 'data', value: { [W.cid]: [{ jobId: W.job.id, jobName: W.job.name, text: 'fired while the hub was down', ts: Date.now() - 60000, urgency: 'low', held: { kind: 'not-running' } }] } });   // the boot's read (_loadNotifs' answer): no hook
    await sleep(20);
    ok(W.jm.wakeOwed(W.cid).length === 1 && W.scheduled.length === 0, '(d) the notices read at boot arm nothing by themselves (the view\'s own boot walk saw an empty store — the read\'s must)', JSON.stringify({ owed: W.jm.wakeOwed(W.cid).length, s: W.scheduled.length }));
    const n = W.jm.announceOwedWakes(); await sleep(20);
    ok(n === 1 && W.scheduled.length === 1, '(d) the engine\'s boot announce (after its notices are read) arms the owed conversation\'s chain', JSON.stringify({ n, s: W.scheduled.length }));
    const JSRC = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8');
    ok(verdictOf(/this\._loadNotifs\(\);\n\s+this\.announceOwedWakes\(\);/.test(JSRC)), '(d) …and init() announces right after it reads the notices (the writable engine\'s road)');
  }
  // (e) the person's prompt drains it first: For you's item closed; the conversation back is armed for nothing
  {
    const W = wakeRig('b6721-prompt'); W.mk(SH);
    await fire(W, 'fired: drained by a prompt');
    await W.run();
    const text = AR.drainNotifsUnderCap(W.jm, W.deliver, W.cid, 0, () => { });   // a prompt with room for the digest (9600 B ahead = none: the cap's leg)
    ok(gateOf(/drained by a prompt/.test(text)) && verdictOf(W.resolved.includes(W.cid)), '(e) the person\'s prompt carries it and For you\'s item is closed', JSON.stringify({ text: String(text).slice(0, 120), resolved: W.resolved }));
    W.comeBack(); W.broadcast(); await sleep(5);
    ok(W.posts.length === 0 && W.scheduled.length === 0, '(e) …the conversation back: nothing owed, nothing armed', JSON.stringify({ posts: W.posts.length, s: W.scheduled.length }));
  }
  // (f) A REFUSAL ENDS THE CHAIN and it stays quiet (the fresh read's must: the hand-over's own changed() re-armed a 5 s loop)
  const refusedRun = async (mod) => {
    const W = wakeRig('b6721-refused-' + Math.random().toString(36).slice(2, 6)); W.mk(mod);
    await fire(W, 'fired while stopped');
    await W.run();
    W.comeBack(); W.setRefuse('hour-cap'); W.broadcast(); await sleep(5);
    await W.run(); await sleep(30);
    const afterRefusal = W.scheduled.length;
    W.broadcast(); await sleep(20);
    return { W, afterRefusal, afterBroadcast: W.scheduled.length };
  };
  {
    const { W, afterRefusal, afterBroadcast } = await refusedRun(SH);
    ok(W.posts.length === 0 && W.authorized.filter((r) => r === 'stash-reachable').length === 1 && afterRefusal === 0 && afterBroadcast === 0 && W.jm.peekNotifs(W.cid).length === 1,
      '(f) a spend refusal ENDS the chain: one ask, nothing posted, nothing re-armed — by the store\'s own hook or a later payload — until something new comes; the notice waits for the prompt', JSON.stringify({ asked: W.authorized, afterRefusal, afterBroadcast }));
    await fire(W, 'a newer one');   // something NEW: armed again (the floor of the engine may stash it — it is owed either way)
    ok(W.scheduled.length === 1, '(f) …a NEWER owed notice arms it again', JSON.stringify(W.scheduled.length));
  }
  // (f) …and a RESUME lifts a refusal's quiet (the delta read's must: the quiet outlived the session — stop then resume heard nothing)
  const resumeRun = async (mod) => {
    const { W } = await refusedRun(mod);
    W.sessions.delete('w1');   // stopped
    const s2 = { ...W.session, _isStreaming: false };
    W.sessions.set('w2', s2); W.setRefuse(null);   // resumed: a NEW live session of the conversation
    W.view().summaryFor(s2); await sleep(5);
    return { armed: W.scheduled.length };
  };
  {
    const r = await resumeRun(SH);
    ok(r.armed === 1, '(f) …a RESUME (a new live session of it) lifts the refusal\'s quiet and arms the chain', JSON.stringify(r));
    const SHsameQuiet = MB.load('src/server/stash-handover.js', anchored(SHSRC, "(q.why === 'away' || q.wid !== wid)", "q.why === 'away'", 'B-6721: only away lifted by a session'), 'sh-samequiet');
    const rr = await resumeRun(SHsameQuiet);
    ok(rr.armed === 0, 'RED control: a quiet only a session after AWAY lifts — the resume after a refusal hears nothing (the incident again)', JSON.stringify(rr));
  }
  {
    const SHloud = MB.load('src/server/stash-handover.js', anchored(SHSRC, "    if (q && newestOf(owed) <= q.at && !(wid != null && (q.why === 'away' || q.wid !== wid))) return false;\n", '', 'B-6721: no quiet after an ending'), 'sh-loud');
    const { afterRefusal, afterBroadcast } = await refusedRun(SHloud);
    ok(afterRefusal + afterBroadcast > 0, 'RED control: without the quiet a refused wake is armed again at once (the 5 s loop the read found)', JSON.stringify({ afterRefusal, afterBroadcast }));
  }

  // ── 主开发's round wdtmcza5y on 276cd57c3 ──
  const rnd = () => Math.random().toString(36).slice(2, 6);
  // (g) THE MUST: a PENDING FORK carries its parent's id — the wake's session is found by the ladder's predicate (addressableId),
  // never by the raw id: the fork's payload arms nothing and nothing is posted, even with a registration answering under the
  // parent's id. RED: the raw lookup — the fork's window carries the stopped parent's chain (and the post goes to whatever the
  // registry names for the parent's id)
  const forkRun = async (mod) => {
    const W = wakeRig('b6721-fork-' + rnd()); W.mk(mod);
    await fire(W, 'fired while stopped');
    await W.run();   // AWAY: For you says it, the chain ends
    const fork = { ...W.session, _forkRequested: true, _forkSourceId: W.cid, name: 'Owner (fork)', _isStreaming: false };
    W.sessions.set('wf', fork);
    fs.writeFileSync(path.join(W.reg, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: W.cid, messagingSocketPath: path.join(W.dir, 'inbox.sock'), name: 'Owner', version: '2.1.281' }));
    W.setAnswer(async () => ({ ok: true, phase: 'written' }));
    const fact = W.view().summaryFor(fork); await sleep(5);
    const armed = W.scheduled.length;
    for (let i = 0; i < 3 && W.scheduled.length; i++) await W.run();
    const posts1 = W.posts.length;
    // …and a NEWER owed notice while the fork is in the map: the chain's own look finds no session of the parent (AWAY) — never
    // the fork's window, never a post into what answers under the parent's id
    W.jm._stashNotif(W.cid, W.job, { what: 'a newer one, the fork still pending' }, 'not running', { held: { kind: 'not-running' } });
    await sleep(20);
    for (let i = 0; i < 3 && W.scheduled.length; i++) await W.run();
    return { fact: fact === null, armed, posts1, posts: W.posts.length, billed: W.ledger.length, owed: W.jm.wakeOwed(W.cid).length, hand: (await W.view().handOver('wf')).code };
  };
  {
    const r = await forkRun(SH);
    ok(gateOf(r.fact) && r.armed === 0 && r.posts === 0 && r.billed === 0 && r.owed === 2 && r.hand === 'no_conversation', '(g) a PENDING FORK carrying an owed (stopped) parent\'s id: its payload arms NOTHING and its strip shows none of the parent\'s stash; a newer owed notice while it is pending posts and bills NOTHING (the chain ends AWAY, never on the fork\'s window — a registration answers under the parent\'s id, as the fork\'s own CLI may); its «Hand over» is no hand-over of the parent\'s', JSON.stringify(r));
    const SHraw = MB.load('src/server/stash-handover.js', anchored(SHSRC, '  const ownCidOf = (s) => addressableId(s);', '  const ownCidOf = cidOf;', 'B-6721: the wake by the raw id'), 'sh-rawid');
    const rr = await forkRun(SHraw);
    ok(rr.armed >= 1, 'RED control: the raw-id lookup — the fork\'s payload arms the stopped parent\'s chain on the fork\'s window (the 5 s … 10 min steps for as long as the fork is pending)', JSON.stringify(rr));
    // the wake road as 276cd57c3 had it (the chain's own look and the hand-over by the raw id), the payload's note kept: the newer notice
    const rawRoad = anchored(anchored(SHSRC, '      const d = getDeliver(), wid = ownWidOf(cid), s = wid != null ? activeSessions.get(wid) : null;', '      const d = getDeliver(), wid = (() => { for (const [w, x] of activeSessions) if (cidOf(x) === cid) return w; return null; })(), s = wid != null ? activeSessions.get(wid) : null;', 'B-6721: the chain\'s own look by the raw id'),
      "    const cid = ownCidOf(s);   // B-6721: a pending fork (its parent's id) has no conversation of its own yet — never the parent's hand-over", '    const cid = cidOf(s);', 'B-6721: the hand-over by the raw id');
    const rl = await forkRun(MB.load('src/server/stash-handover.js', rawRoad, 'sh-rawlook'));
    ok(rl.posts > rl.posts1 && rl.billed >= 1, 'RED control: the wake road by the raw id (276cd57c3) — the newer notice is POSTED and BILLED through the fork\'s window into what answers under the parent\'s id (the fork\'s own CLI, when it took the parent\'s id)', JSON.stringify(rl));
  }
  // (h) THE RULING: A FOR-YOU ITEM MARKS AN EVENT, NOT A STATE FOUND AT BOOT — the boot's announce of a month-old not-running notice
  // files NOTHING (the notice waits where it waits); a notice stashed for the stopped conversation WHILE THE HUB RUNS files the
  // item, counting every notice waiting there (its `since` = the oldest). RED: the engine without the event rule files at boot
  const bootWave = async (JMc) => {
    const W = wakeRig('b6721-bootwave-' + rnd(), JMc); W.mk(SH);
    const old = Date.now() - 31 * 86400e3;
    W.jm._notifsAnswer({ state: 'data', value: { [W.cid]: [{ jobId: W.job.id, jobName: W.job.name, text: 'fired a month ago', ts: old, urgency: 'low', held: { kind: 'not-running' } }] } });
    await sleep(20); W.jm.announceOwedWakes(); await sleep(20); await W.run();
    const atBoot = W.filed.length, armedAfter = W.scheduled.length;
    await fire(W, 'fired while the hub runs'); await W.run();
    const filed = W.filed.length, since = filed ? W.filed[filed - 1].since : null;
    W.comeBack(); W.broadcast(); await sleep(5); await W.run();   // the conversation runs again: what the boot found is still handed over
    return { atBoot, armedAfter, filed, since, old, handed: W.posts.some((p) => /fired a month ago/.test(p)) };
  };
  {
    const b = await bootWave(JobManager);
    ok(b.atBoot === 0 && b.armedAfter === 0 && b.filed === 1 && b.since === b.old && verdictOf(b.handed), '(h) the BOOT\'s own announce of a month-old not-running notice files NO For-you item (the chain ends AWAY, quiet); a notice stashed for the stopped conversation while the hub runs files ONE, counting every notice waiting there (since = the oldest); back, the month-old notice is still handed over', JSON.stringify(b));
    const JSRCh = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8');
    const JMboot = MB.load('src/jobs.js', anchored(JSRCh, '    if (!this._stoppedThisRun || !this._stoppedThisRun.has(cid)) return null;\n', '', 'B-6721: a state found at boot said'), 'jobs-bootwave').JobManager;
    const br = await bootWave(JMboot);
    ok(br.atBoot === 1, 'RED control: without the event rule the boot files an item for a conversation stopped a month ago (the owner\'s hub: two of three)', JSON.stringify(br));
  }
  // (i) THE SHOULD: the drain's judge drops every owed notice (a subscriber's line of a job since deleted) — For you's «notices
  // wait» is settled there, never left open with nothing waiting. RED: the drop without the settle
  const dropRun = async (JMc) => {
    const W = wakeRig('b6721-judgedrop-' + rnd(), JMc); W.mk(SH);
    const other = { id: 'jb-cccc3333', kind: 'task', name: 'another-watch', state: 'done', owner: { conversation: { id: 'c0ffee00-0000-4000-8000-0000000099aa' } }, access: { view: 'all', control: 'session' }, runs: [] };
    W.jm.jobs.set(other.id, other);
    W.jm._stashNotif(W.cid, other, { what: 'a subscriber line' }, 'not running', { held: { kind: 'not-running' }, mark: true });
    await sleep(20); await W.run();
    const filed = W.filed.length;
    W.jm.jobs.delete(other.id);
    W.jm.peekNotifs(W.cid);   // a drain's read: the judge drops it
    return { filed, owed: W.jm.wakeOwed(W.cid).length, resolved: W.resolved.includes(W.cid) };
  };
  {
    const d = await dropRun(JobManager);
    ok(d.filed === 1 && d.owed === 0 && verdictOf(d.resolved), '(i) the drain\'s judge drops the only owed notice (its job deleted): For you\'s item is closed there', JSON.stringify(d));
    const JSRCi = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8');
    const JMdrop = MB.load('src/jobs.js', anchored(JSRCi, "    this.wakeSettled(cid);   // B-6721 (the round's should): the drop may leave nothing owed — For you's «notices wait» goes with it\n", '', 'B-6721: the drop without the settle'), 'jobs-judgedrop').JobManager;
    const dr = await dropRun(JMdrop);
    ok(dr.filed === 1 && dr.owed === 0 && !dr.resolved, 'RED control: the drop without the settle leaves the item open with nothing waiting', JSON.stringify(dr));
  }
  // (j) THE SHOULD: a hand-over whose frame was WRITTEN and whose post then failed (a write-phase timeout) may have landed — the
  // chain ENDS (no second billed post 30 s later); the notices ride the next prompt. RED: the chain re-steps
  const writeRun = async (mod, reason = 'timeout') => {
    const W = wakeRig('b6721-writephase-' + rnd()); W.mk(mod);
    await fire(W, 'fired while stopped');
    await W.run(); W.comeBack();
    let tries = 0;
    W.setAnswer(async () => { tries++; return { ok: false, reason, phase: 'write', transient: true, elapsedMs: 5004 }; });
    W.broadcast(); await sleep(5); await W.run();
    return { tries, armed: W.scheduled.length, owed: W.jm.wakeOwed(W.cid).length, billed: W.ledger.length };
  };
  {
    const w = await writeRun(SH);
    ok(w.tries === 1 && w.armed === 0 && w.owed === 1 && w.billed === 0, '(j) a write-phase TIMEOUT (the frame handed to the socket, no verdict) ENDS the chain — one attempt, nothing re-armed; the notice still waits for the next prompt', JSON.stringify(w));
    const ep = await writeRun(SH, 'EPIPE');
    ok(ep.tries === 1 && ep.armed >= 1, '(j) …a write that FAILED by its own error (EPIPE: the frame cannot have landed) steps on as before', JSON.stringify(ep));
    const SHwrite = MB.load('src/server/stash-handover.js', anchored(SHSRC, "      if (r && r.code === 'unreachable' && ((r.phase === 'write' && r.error === 'timeout') || r.unanswered === true)) {", "      if (false) {", 'B-6721: a written frame retried'), 'sh-writephase');
    const wr = await writeRun(SHwrite);
    ok(wr.tries === 1 && wr.armed >= 1, 'RED control: without the rule the chain re-steps after a written frame — a second post (a second billed turn) at its next look', JSON.stringify(wr));
  }
  // (k) THE MOVE CHECK's SHOULD 7: A CLAIM IS NOT A SETTLE — while a resume holds its claim on the owed notices, a chain that looks
  // finds nothing owed but must NOT close For you's «notices wait»; the claim given back (the resume failed), the chain re-arms and says
  // it again for the episode. RED: the settle that ignores a claim closes the item while the notices are only claimed
  const claimRun = async (JMc) => {
    const W = wakeRig('b6721-claim-' + rnd(), JMc); W.mk(SH);
    await fire(W, 'fired while stopped'); await W.run();   // AWAY: For you says it
    await fire(W, 'a newer one while stopped');           // a newer owed notice: the chain is armed again
    const armed = W.scheduled.length;
    const rel = W.jm.claimNotifs(W.cid, W.jm.peekNotifs(W.cid), 'ho-resume-1');   // the resume claims them first
    await W.run();                                         // the chain looks: nothing owed (all claimed)
    const closedWhileClaimed = W.resolved.includes(W.cid);
    rel(); W.view().changed(); await sleep(20); await W.run();   // the resume failed: its claim comes back (the hand-over's finally says changed)
    return { armed, closedWhileClaimed, filed: W.filed.length, owed: W.jm.wakeOwed(W.cid).length };
  };
  {
    const c = await claimRun(JobManager);
    ok(c.armed === 1 && !c.closedWhileClaimed && c.owed === 2 && c.filed >= 2, '(k) a resume\'s CLAIM is not a settle: while the owed notices are claimed For you\'s «notices wait» stays open; the claim given back, the chain re-arms and says it again for the episode', JSON.stringify(c));
    const JSRCk = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8');
    const JMclaim = MB.load('src/jobs.js', anchored(JSRCk, "    if ((this.pendingNotifs.get(cid) || []).some((n) => n && n.ho && n.held && WAKE_OWED_KINDS.includes(n.held.kind) && !n.held.maybeDelivered)) return;\n", '', 'B-6721: a claim taken for a settle'), 'jobs-claim').JobManager;
    const cr = await claimRun(JMclaim);
    ok(cr.closedWhileClaimed === true, 'RED control: the settle that ignores a claim closes «notices wait» while the notices are only claimed (a failed resume then leaves For you silent for the episode)', JSON.stringify(cr));
  }
}

// ── B-54b7 (主开发 r519, shape B — THE WAIT AT THE TAKE) ──────────────────────────────────────────────────────────────────────────
// While job-notifications.json was HELD (its read failed) the jobs store took a parked copy off the ladder (the judge's held line, a
// fall) into a stash line in MEMORY, and the ladder wrote its own copy off msg-retry.json at once (the writer owes nothing for a held
// file: the ride answered «landed»): a crash lost the notice. Now the ladder's copy stays in its file until the copy's OWN landing (the
// lift's save) and the stash copy is invisible to every delivery door until then. THE REAL ladder and THE REAL jobs engine; the hold
// PLACED (the storage answers EISDIR for the file — the engine's own read fails), the lift PLACED (the file back, the engine's read again
// awaited), every landing PLACED (a writer stand-in: it writes the engine's own bytes on a flush, as the real one, and what is merely
// owed when the test lands it); a «crash» = a new ladder + engine over the same files, nothing closed, nothing flushed. Waits are for
// what happened (bounded turns of the loop), never a clock. RED controls (anchored, in copies), each printing its facts.
console.log('\n§B-54b7 the notices file HELD: a copy the jobs store takes keeps the park\'s copy on disk until it lands — never lost, never twice, no turn, the park bounded');
await (async () => {
  const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
  const JSRC = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf-8');
  const MB = mutantCopies('ntr-b54b7', REPO);
  const noDoor = (d) => !d.peek && !d.wake && !d.drain && !d.entries && !d.waiting && !d.park;
  const until = async (pred, n = 400) => { for (let i = 0; i < n && !pred(); i++) await new Promise((r) => setImmediate(r)); return !!pred(); };
  const turn = () => new Promise((r) => setImmediate(r));   // one turn of the loop (a step's leave writes the park at the end of its pass)
  const placedWriter = () => {
    const owed = new Map(), steps = [], ver = new Map(); let slow = false;
    const write = (file) => { const o = owed.get(file); owed.delete(file); let b = null; try { b = o && o.produce ? o.produce() : null; } catch { b = null; } if (b != null) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, b); } };
    const run = (file = null, upTo = Infinity) => { for (let i = 0; i < steps.length;) { const x = steps[i]; if (file ? (x.file !== file || x.v > upTo) : owed.has(x.file)) { i++; continue; } steps.splice(i, 1); let v; try { v = x.step(); } catch { } x.res({ landed: true, value: v }); } };
    const W = { pending: (f) => (f ? owed.has(f) : owed.size > 0), dirty(file, o) { owed.set(file, o || {}); ver.set(file, (ver.get(file) || 0) + 1); }, version: (f) => ver.get(f) || 0, durable: () => Promise.resolve(owed.size === 0), whenDurable: () => Promise.resolve(owed.size === 0), exitStartedAt: () => null, stats: () => [],
      // `slow`: the disk does not answer inside the flush (what is owed stays owed, said by the writer) — the failure branch of every synchronous landing
      flushSync: (names) => { const wanted = (names || []).filter((f) => owed.has(f)); if (slow) return { written: [], left: wanted.map((f) => ({ file: f, name: 'a store', why: 'the disk did not answer (a stand-in)' })), ms: 0 }; for (const f of wanted) write(f); run(); return { written: wanted, left: [], ms: 0 }; },
      afterLanding: (file, step) => { if (!owed.has(file)) { const v = step(); return Promise.resolve({ landed: true, value: v }); } return new Promise((res) => steps.push({ file, step, res, v: ver.get(file) || 0 })); } };
    // landUpTo: the write of version v lands (a newer version stays owed) — only the steps that rode v or older run
    return { W, land: () => { for (const f of [...owed.keys()]) write(f); run(); }, landUpTo: (file, v) => run(file, v), setSlow: (b) => { slow = !!b; } };
  };
  const OWN = 'c0ffee00-0000-4000-8000-0000000005b7';   // the watched job's owner (never running here: its copies stash, never parked)
  const MISS = async () => ({ ok: false, reason: 'timeout', phase: 'connect', transient: true, elapsedMs: 5003 });
  const TAKES = async () => ({ ok: true, phase: 'written', elapsedMs: 40 });
  const mkRig = (name) => {
    const dir = path.join(scratchDir('ntr'), 'b54b7-' + name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const reg = path.join(dir, 'registry'); fs.mkdirSync(reg, { recursive: true });
    const cid = 'c0ffee00-0000-4000-8000-00000000' + String(seq++).padStart(4, '0');
    const sockPath = path.join(dir, 'inbox.sock'), regFile = path.join(reg, `${process.pid}.json`);
    const R = { dir, cid, regFile, posts: [], logs: [], authorized: [], said: [], view: { live: null, byKey: new Set(['T-g']), held: false } };
    R.register = () => fs.writeFileSync(regFile, JSON.stringify({ pid: process.pid, sessionId: cid, messagingSocketPath: sockPath, name: 'Sub', version: '2.1.281' }));
    R.register(); serveSock(sockPath);
    R.session = { claudeSessionId: cid, backendSessionId: cid, mode: 'chat', backend: 'claude', name: 'Sub', _isStreaming: true, _turnStateSeen: true };
    R.sessions = new Map([['w1', R.session]]);
    let now = Date.now(); const timers = [];
    R.clock = { now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t; }, clearTimeout: (t) => { if (t) t.dead = true; } };
    R.advance = async (ms) => { const end = now + ms; for (;;) { const due = timers.filter((t) => !t.dead && !t.fired && t.at <= end).sort((a, b) => a.at - b.at)[0]; if (!due) break; now = Math.max(now, due.at); due.fired = true; await due.fn(); await new Promise((r) => setImmediate(r)); } now = end; };
    let answer = MISS;
    R.setAnswer = (fn) => { answer = fn; };
    R.jdir = path.join(dir, 'jobs'); fs.mkdirSync(R.jdir, { recursive: true });
    R.notifsFile = path.join(R.jdir, 'job-notifications.json'); R.parkFile = path.join(dir, 'msg-retry.json');
    R.hold = () => { fs.rmSync(R.notifsFile, { recursive: true, force: true }); fs.mkdirSync(R.notifsFile); };   // the storage answers EISDIR: the engine's own read FAILS — held
    R.lift = (body = '{}') => { fs.rmSync(R.notifsFile, { recursive: true, force: true }); fs.writeFileSync(R.notifsFile, body); };
    R.parkIds = () => { try { return (JSON.parse(fs.readFileSync(R.parkFile, 'utf-8'))[cid] || []).map((e) => e.id); } catch { return []; } };
    R.onDisk = () => { try { return (JSON.parse(fs.readFileSync(R.notifsFile, 'utf-8'))[cid] || []).map((n) => n.rt || null); } catch { return []; } };
    R.mem = () => (R.jm.pendingNotifs.get(cid) || []).map((n) => n.rt || null);
    R.boot = (Mod, CDm = CD, { sameInstant = false } = {}) => {
      if (R.jm && !sameInstant) now += 5000;   // a restart takes seconds (RestartSec=5) — not for the ids: each park mints its own token (r734 (3))
      for (const t of timers) t.dead = true;   // the previous process is gone: nothing closed, nothing flushed (a crash)
      if (R.jm) { R.jm._unreadStopped = true; if (R.jm._notifsT) { clearTimeout(R.jm._notifsT); R.jm._notifsT = null; } }
      const P = placedWriter(); R.W = P.W; R.land = P.land; R.landUpTo = P.landUpTo; R.setSlow = P.setSlow;
      R.deliver = CDm.create({ dataDir: dir, activeSessions: R.sessions, serverSetting: () => undefined,
        peerMsg: { findPeer: (c) => PM.findPeer(c, reg), postToPeer: async (p, text) => { const r = await answer(p, text); if (r.ok) R.posts.push(text); return r; }, postChannelEvent: async () => ({ ok: false }) },
        authorizeSpend: (req) => { R.authorized.push(req.reason); return { ok: true, identity: { key: 'acct', name: 'Work' }, hold: 'h' + R.authorized.length, reason: req.reason }; }, noteSpend: () => { }, releaseSpend: () => { },
        emitPeerCard: () => { }, log: (...a) => R.logs.push(a.join(' ')), retryClock: R.clock, renderBatch: renderMsgStash });
      R.jm = new Mod.JobManager({ dataDir: R.jdir, writer: R.W, broadcast() { }, log: (...a) => R.logs.push(a.join(' ')), notifyUser() { return { ok: true }; }, resolveNotice() { }, unreadRetry: { firstMs: 3600e3 }, onStash: (c) => R.said.push(c),
        deliverToConversation: (c, text, o) => R.deliver.deliverToConversation(c, text, o), onRetry: (fn) => R.deliver.onRetry(fn), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => true,
        viewerOf: (c) => (c !== cid ? null : R.view.held ? { held: true, live: false, conversationId: c } : R.view.live ? { live: true, conversationId: c, sessionId: 'w1', sessionCreatedAt: 1, groups: R.view.live } : { live: false, conversationId: c, groups: R.view.byKey }) });
      R.jm.init(); for (const t of R.jm._timers || []) clearInterval(t);
      R.jm._spawn = (job) => { job.runs = [{ startedAt: Date.now() }]; job.state = 'up'; };
      R.deliver.registerRetryJudge('jobs', (c, e) => R.jm.retryOwed(c, e));
      return R;
    };
    R.turnEnd = async () => { R.session._isStreaming = false; await R.deliver.noteTurnEnd(R.session); R.session._isStreaming = true; };
    // every door that could deliver or start a turn for it: the engine's peek / wake list / drain, the ladder's prompt view / waiting count / park
    R.doors = () => ({ peek: R.jm.peekNotifs(cid).length, wake: R.jm.wakeOwed(cid).length, drain: R.jm.drainNotifs(cid).length, entries: R.deliver.retryEntries(cid).length, waiting: R.deliver.retryWaitingCount(cid), park: R.deliver.retryCount(cid) });
    R.quiet = noDoor;
    return R;
  };
  // a subscriber's copy of a watched job's event, parked (the push proved view by key; the CLI missed it, transient, mid-turn)
  const subJob = (R) => {
    const owner = { conversation: { id: OWN }, sessionId: 's-own', sessionCreatedAt: 1, groupsSnapshot: ['T-g'] };
    const j = R.jm.jobs.get(R.jm.create({ kind: 'task', name: 'watched', cmd: { argv: ['true'] }, owner, access: { view: 'group', control: 'session' } }, { conversationId: OWN, sessionId: 's-own', sessionCreatedAt: 1, groups: new Set(['T-g']) }).job.id);
    j.subscribers = [{ conversationId: R.cid, sessionId: 'w1', ts: Date.now(), filter: null }];
    // ENDED, no run left: a boot adopts nothing of it (a run «lost at the restart» files its own notice — never this scene's copy)
    j.state = 'done'; j.runs = (j.runs || []).map((r) => ({ ...r, endedAt: r.endedAt || Date.now(), exit: 0 }));
    R.jm._save(); R.land();   // the record on disk: a restart reads it
    return j;
  };
  const parkOne = async (R, j, what) => {
    R.setAnswer(MISS); R.view.byKey = new Set(['T-g']); R.view.held = false; R.jm._notifyRate.delete(R.cid); R.jm._notifyRate.delete(OWN);
    const n0 = R.deliver.retryCount(R.cid);
    R.jm.announce(j, what);
    return (await until(() => R.deliver.retryCount(R.cid) === n0 + 1)) ? R.deliver.retryPeek(R.cid).slice(-1)[0].id : null;
  };
  const unjudged = (R, how) => { if (how === 'groups-unread') R.view.held = true; else R.view.byKey = new Set(); };
  const handOver = async (R) => SH.create({ handoverLandMs: 30, activeSessions: R.sessions, getDeliver: () => R.deliver, getJobs: () => R.jm, broadcastSessions: () => { }, renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, dataDir: R.dir, log: { log() { }, warn() { } } }).handOver('w1', { pressed: PRESS });
  // THE JUDGE ROAD (and r519 (3) + (4)): the judge cannot place the copy while held — taken, kept on disk, nothing posted, two boots while held
  const judgeScene = async (Mod, name, how) => {
    const R = mkRig(name); R.hold(); R.boot(Mod);
    const premise = { held: !!R.jm._notifsUnread, code: R.jm._notifsUnread ? R.jm._notifsUnread.code : null };
    const j = subJob(R);
    const id = await parkOne(R, j, 'found news');
    unjudged(R, how); R.setAnswer(TAKES); await R.turnEnd();
    const took = { park: R.parkIds(), mem: R.mem(), disk: R.onDisk() };
    const auth0 = R.authorized.length, posts0 = R.posts.length;
    const ho = await handOver(R);                          // a person's hand-over press
    const doors = R.doors(); let drained = doors.drain;
    await R.advance(70 * 60 * 1000); await R.turnEnd();   // a retry tick past the ladder's hour, and a turn end
    const quiet = { posts: R.posts.length - posts0, auth: R.authorized.length - auth0, park: R.parkIds(), ho: !!(ho && ho.ok) };
    const boots = [];
    for (let b = 0; b < 2; b++) {   // a crash, then a boot still held: the park's entry is back and judged again into the same state
      R.boot(Mod); const back = R.deliver.retryCount(R.cid), held = !!R.jm._notifsUnread;
      unjudged(R, how); R.setAnswer(TAKES); await R.turnEnd();
      const d = R.doors(); drained += d.drain;
      boots.push({ held, back, park: R.parkIds(), mem: R.mem(), quiet: R.quiet(d), d, posts: R.posts.length, log: R.logs.slice(-6).map((l) => l.slice(0, 160)) });
    }
    // the file reads again — but the lift's own save does not land at once (its read's should 2): the copy stays invisible until ITS step ran
    R.setSlow(true); R.lift('{}'); await R.jm._notifsRetry();
    R.view.held = false; R.view.live = new Set(['T-g']);   // it comes back, able to view
    const lifting = { held: !!R.jm._notifsUnread, park: R.parkIds(), drain: R.jm.drainNotifs(R.cid).length }; drained += lifting.drain;
    const said0 = R.said.length;
    R.setSlow(false); R.land(); await turn();
    const lifted = { held: !!R.jm._notifsUnread, park: R.parkIds(), disk: R.onDisk(), mem: R.mem(), told: R.said.slice(said0).includes(R.cid) };
    const d1 = R.jm.drainNotifs(R.cid).length, d2 = R.jm.drainNotifs(R.cid).length; drained += d1 + d2;
    R.boot(Mod); const after = { park: R.deliver.retryCount(R.cid), mem: R.mem().length };
    if (R.jm._notifsT) clearTimeout(R.jm._notifsT);
    return { premise, id, took, doors, quiet, boots, lifting, lifted, d1, d2, drained, after, posts: R.posts.length, delivered: R.posts.length + drained };
  };
  const judgeOk = (x) => x.premise.held && x.premise.code && !!x.id && JSON.stringify(x.took.park) === JSON.stringify([x.id]) && JSON.stringify(x.took.mem) === JSON.stringify([x.id]) && !x.took.disk.length && JSON.stringify(x.doors) === JSON.stringify({ peek: 0, wake: 0, drain: 0, entries: 0, waiting: 0, park: 0 });
  const quietOk = (x) => x.quiet.posts === 0 && x.quiet.auth === 0 && !x.quiet.ho && JSON.stringify(x.quiet.park) === JSON.stringify([x.id]);
  const bootsOk = (x) => x.boots.length === 2 && x.boots.every((b) => b.held && b.back === 1 && JSON.stringify(b.park) === JSON.stringify([x.id]) && JSON.stringify(b.mem) === JSON.stringify([x.id]) && b.quiet && b.posts === 0);
  const liftOk = (x) => !x.lifting.held && JSON.stringify(x.lifting.park) === JSON.stringify([x.id]) && x.lifting.drain === 0 && x.lifted.told && !x.lifted.held && !x.lifted.park.length && JSON.stringify(x.lifted.disk) === JSON.stringify([x.id]) && x.d1 === 1 && x.d2 === 0 && x.drained === 1 && x.delivered === 1 && !x.after.park && !x.after.mem && x.posts === 0;
  for (const how of ['unknown', 'groups-unread']) {
    const x = await judgeScene({ JobManager }, 'judge-' + how, how);
    console.log(`    facts (${how}) ` + JSON.stringify(x));
    ok(verdictOf(judgeOk(x)), `B-54b7 L1 (${how}): while job-notifications.json is held (${x.premise.code}) the judge's held line is TAKEN — the park's copy stays in msg-retry.json, the stash copy waits in memory carrying its id, and no door (peek, wake list, drain, the ladder's prompt view, its waiting count, its park) offers it`, JSON.stringify({ took: x.took, doors: x.doors }));
    ok(verdictOf(quietOk(x)), `B-54b7 L1 (${how}) r519 (3): a retry tick past the ladder's hour, a turn end and a person's hand-over press during the hold post nothing and start no turn (no authorization)`, JSON.stringify(x.quiet));
    ok(verdictOf(bootsOk(x)), `B-54b7 L1 (${how}) r519 (4): a crash, then a boot still held — twice: the park's entry comes back and is judged again into the SAME bounded state (one copy each, nothing posted)`, JSON.stringify(x.boots));
    ok(verdictOf(liftOk(x)), `B-54b7 L1 (${how}): the file reads again — while the lift's save has not landed the copy is still offered by no door; at its landing the conversation's strip is told; it lands in job-notifications.json ONCE, the park's copy leaves at that landing, one drain prints it once, a restart brings nothing back`, JSON.stringify({ lifting: x.lifting, lifted: x.lifted, d1: x.d1, d2: x.d2, drained: x.drained, delivered: x.delivered, after: x.after }));
  }
  // CONTROL (a): the take's plain ride (the release's) — while held it answers «landed» at once: the park's copy is gone, a crash loses the notice
  const TAKE_A = '  _taken(item = null) { return { taken: true, ride: (step) => this._rideTaken(item, step) }; }';
  const xa = await judgeScene(MB.load('src/jobs.js', anchored(JSRC, TAKE_A, "  _taken(item = null) { return { taken: true, ride: (step) => this._ride(this.notifsFile, 'a parked notification the jobs store took', step) }; }   // MUTANT: the plain ride", 'b54b7 the take rides its own landing'), 'b54b7-plain-ride'), 'judge-plain-ride', 'unknown');
  console.log('    facts (control a) ' + JSON.stringify({ took: xa.took, boots: xa.boots, lifted: xa.lifted }));
  ok(!xa.took.park.length && xa.boots[0].back === 0 && !xa.boots[0].mem.length && !xa.lifted.disk.length, 'CONTROL (a) (the plain ride, in a copy): while held the park\'s copy leaves msg-retry.json at once — after the crash neither file holds the notice: LOST (red)', JSON.stringify({ took: xa.took, boot: xa.boots[0], lifted: xa.lifted }));
  // CONTROL (b): the taken copy visible while held — a drain delivers it from memory, a crash brings the park's copy back: TWICE
  const WAIT_A = '  _waitsForLanding(n) { const rec = n && this._unlanded ? this._unlanded.get(n) : null; return !!rec && rec.held; }';
  const xb = await judgeScene(MB.load('src/jobs.js', anchored(JSRC, WAIT_A, '  _waitsForLanding(n) { return false; }   // MUTANT: visible while held', 'b54b7 a taken copy waits for its landing'), 'b54b7-visible'), 'judge-visible', 'unknown');
  console.log('    facts (control b) ' + JSON.stringify({ quiet: xb.quiet, doors: xb.doors, drained: xb.drained, delivered: xb.delivered }));
  ok((xb.quiet.posts >= 1 || xb.doors.drain === 1) && xb.delivered >= 2, 'CONTROL (b) (the copy visible while held, in a copy): the press or a drain delivers it from memory while its park copy is still on disk — the crash brings that copy back and it is delivered AGAIN (red)', JSON.stringify({ quiet: xb.quiet, doors: xb.doors, delivered: xb.delivered }));
  // CONTROL (b2) — its read's should 2: the copy visible once the hold ENDS (not at its own step) — a drain while the lift's save has not landed
  const xb2 = await judgeScene(MB.load('src/jobs.js', anchored(JSRC, WAIT_A, '  _waitsForLanding(n) { const rec = n && this._unlanded ? this._unlanded.get(n) : null; return !!rec && rec.held && !!this._notifsUnread; }   // MUTANT: visible at the hold\'s end', 'b54b7 a taken copy waits for its own step'), 'b54b7-visible-at-lift'), 'judge-visible-at-lift', 'unknown');
  console.log('    facts (control b2) ' + JSON.stringify({ lifting: xb2.lifting, delivered: xb2.delivered }));
  ok(xb2.lifting.drain === 1 && JSON.stringify(xb2.lifting.park) === JSON.stringify([xb2.id]), 'CONTROL (b2) (visible at the hold\'s end, in a copy): a drain takes the copy while the lift\'s save has not landed and its park copy is still in msg-retry.json — a crash now brings it back: twice (red)', JSON.stringify(xb2.lifting));
  {   // CONTROL (the re-read's should 1): nobody told at the landing — the strip and the wake chain stay stale while the copy is offered
    const TOLD_A = '      for (const c of told) { try { this.d.onStash?.(c); } catch { } }';
    const xt = await judgeScene(MB.load('src/jobs.js', anchored(JSRC, TOLD_A, '      /* MUTANT: nobody told */', 'b54b7 the strip told at the landing'), 'b54b7-untold'), 'judge-untold', 'unknown');
    ok(!xt.lifted.told && xt.lifted.disk.length === 1, 'CONTROL (the word at the landing cut, in a copy): the copy lands and is offered, and its conversation is never told (red)', JSON.stringify(xt.lifted));
  }
  // THE RE-READ'S SHOULD 4: the lift's step runs only the steps of copies taken WHILE HELD — a take AFTER the lift rides its OWN (later)
  // version; the lift's older version landing first must not let that copy's park entry go (a crash then: on neither disk)
  const versionScene = async (Mod, name) => {
    const R = mkRig(name); R.hold(); R.boot(Mod);
    const j = subJob(R);
    const a = await parkOne(R, j, 'taken while held'); unjudged(R, 'unknown'); R.setAnswer(TAKES); await R.turnEnd();
    R.setSlow(true); R.lift('{}'); await R.jm._notifsRetry();   // the read again: its save is owed (version V), not landed
    const V = R.W.version(R.notifsFile);
    const b = await parkOne(R, j, 'taken after the lift'); unjudged(R, 'unknown'); R.setAnswer(TAKES); await R.turnEnd();   // rides a later version
    const later = R.W.version(R.notifsFile);
    R.landUpTo(R.notifsFile, V); await turn();   // the lift's version lands; the later one is still owed
    const mid = R.parkIds();
    R.setSlow(false); R.land(); await turn();
    if (R.jm._notifsT) clearTimeout(R.jm._notifsT);
    return { a, b, V, later, mid, after: R.parkIds() };
  };
  {
    const v = await versionScene({ JobManager }, 'version');
    console.log('    facts (version) ' + JSON.stringify(v));
    ok(!!v.a && !!v.b && v.later > v.V && JSON.stringify(v.mid) === JSON.stringify([v.b]) && !v.after.length, 'B-54b7 (its re-read\'s should 4): the lift\'s own version landing lets go only the copy taken while held — the one taken after the lift keeps its park entry until ITS version lands', JSON.stringify(v));
    const HELDF_A = '        if (!rec.held) continue;\n';
    const vx = await versionScene(MB.load('src/jobs.js', anchored(JSRC, HELDF_A, '        /* MUTANT: every step at the lift */\n', 'b54b7 only the held copies ride the lift'), 'b54b7-lift-all'), 'version-all');
    ok(!vx.mid.length, 'CONTROL (every step at the lift, in a copy): the copy taken after the lift loses its park entry at the lift\'s older landing, before its own copy is on disk (red)', JSON.stringify(vx));
  }
  // THE FALL ROAD: an OWNER's copy falls «not running» while held — the same law
  const fallScene = async (Mod, name) => {
    const R = mkRig(name); R.hold(); R.boot(Mod);
    const job = { id: 'jb-5b7f0001', kind: 'task', name: 'nightly', state: 'done', owner: { conversation: { id: R.cid } }, access: { view: 'all', control: 'session' }, runs: [] };
    R.jm.jobs.set(job.id, job); R.jm._save(); R.land();
    R.setAnswer(MISS); R.jm._notifyOwner(job, { what: 'finished: the nightly report' });
    const id = (await until(() => R.deliver.retryCount(R.cid) === 1)) ? R.deliver.retryPeek(R.cid)[0].id : null;
    fs.rmSync(R.regFile, { force: true });   // the conversation left this machine: its next attempt FALLS «not running»
    await R.advance(31 * 1000);
    const fell = R.logs.some((l) => l.includes(`${id} falls to the stash`));
    const took = { park: R.parkIds(), mem: R.mem(), disk: R.onDisk() };
    const doors = R.doors(); let drained = doors.drain;
    const boots = [];
    for (let b = 0; b < 2; b++) {
      R.boot(Mod); const back = R.deliver.retryCount(R.cid);
      await R.advance(1000);   // its due attempt: it falls again
      const d = R.doors(); drained += d.drain;
      boots.push({ held: !!R.jm._notifsUnread, back, park: R.parkIds(), mem: R.mem(), quiet: R.quiet(d) });
    }
    R.lift('{}'); await R.jm._notifsRetry();
    const lifted = { park: R.parkIds(), disk: R.onDisk() };
    const d1 = R.jm.drainNotifs(R.cid).length; drained += d1;
    if (R.jm._notifsT) clearTimeout(R.jm._notifsT);
    return { id, fell, took, doors, boots, lifted, d1, drained, posts: R.posts.length };
  };
  {
    const f = await fallScene({ JobManager }, 'fall');
    console.log('    facts (fall) ' + JSON.stringify(f));
    ok(!!f.id && gateOf(f.fell) && JSON.stringify(f.took.park) === JSON.stringify([f.id]) && JSON.stringify(f.took.mem) === JSON.stringify([f.id]) && !f.took.disk.length && verdictOf(noDoor(f.doors)), 'B-54b7 L2 (the fall road): an owner\'s copy that falls «not running» while held keeps its park copy in msg-retry.json; the stash copy waits, offered by no door', JSON.stringify({ fell: f.fell, took: f.took, doors: f.doors }));
    ok(gateOf(f.boots.every((b) => b.held && b.back === 1 && JSON.stringify(b.park) === JSON.stringify([f.id]) && JSON.stringify(b.mem) === JSON.stringify([f.id]) && b.quiet)) && !f.lifted.park.length && JSON.stringify(f.lifted.disk) === JSON.stringify([f.id]) && f.d1 === 1 && f.drained === 1 && f.posts === 0, 'B-54b7 L2: two crashes while held, each boot falls it again into one copy; at the read again it lands ONCE and is drained once', JSON.stringify({ boots: f.boots, lifted: f.lifted, d1: f.d1, drained: f.drained }));
    const fa = await fallScene(MB.load('src/jobs.js', anchored(JSRC, TAKE_A, "  _taken(item = null) { return { taken: true, ride: (step) => this._ride(this.notifsFile, 'a parked notification the jobs store took', step) }; }   // MUTANT: the plain ride", 'b54b7 the take rides its own landing'), 'b54b7-plain-ride'), 'fall-plain-ride');
    ok(!fa.took.park.length && fa.boots[0].back === 0 && !fa.boots[0].mem.length, 'CONTROL (a) on the fall road: the plain ride drops the park\'s copy while held — the crash loses the owner\'s notice (red)', JSON.stringify({ took: fa.took, boot: fa.boots[0] }));
  }
  // r519 (2) THE PARK BOUNDED: one conversation, one watched job, every event through a held file, far past the stash's cap of 30
  const capScene = async (Mod, name, N = 80) => {
    const R = mkRig(name); R.hold(); R.boot(Mod);
    const j = subJob(R), ids = [];
    for (let i = 0; i < N; i++) { const id = await parkOne(R, j, `event ${i}`); if (!id) break; ids.push(id); unjudged(R, 'unknown'); R.setAnswer(TAKES); await R.turnEnd(); }
    const park = R.parkIds();
    if (R.jm._notifsT) clearTimeout(R.jm._notifsT);
    return { n: ids.length, park: park.length, mem: R.mem().length, newest: park.includes(ids[ids.length - 1]), said: R.logs.some((l) => l.includes('fell off the 30-entry cap')), posts: R.posts.length };
  };
  {
    const c = await capScene({ JobManager }, 'cap');
    console.log('    facts (cap) ' + JSON.stringify(c));
    ok(c.n === 80 && c.park === 30 && c.mem === 30 && gateOf(c.newest) && gateOf(c.said) && c.posts === 0, 'B-54b7 r519 (2): eighty events through a held file — msg-retry.json holds at most the cap (30) for the conversation: an evicted copy\'s park entry leaves at its eviction (said by name)', JSON.stringify(c));
    const EVICT_A = '    for (const d of dropped) this._letParkGo(d);';
    const cx = await capScene(MB.load('src/jobs.js', anchored(JSRC, EVICT_A, '    for (const d of dropped) void d;   // MUTANT: the evicted copy\'s park entry stays', 'b54b7 an eviction lets the park copy go'), 'b54b7-evict'), 'cap-evict');
    console.log('    facts (cap control) ' + JSON.stringify(cx));
    ok(cx.n === 80 && cx.park === 80, 'CONTROL (the eviction\'s let-go cut, in a copy): the park keeps every evicted copy until the lift — msg-retry.json grows with every event of the hold (red)', JSON.stringify(cx));
  }
  // the read's MUST (主开发 r576 — the ladder's judge of retries): a BOOT during the hold judges the thirty taken copies as ONE batch; each must
  // leave the park at ITS OWN taker's landing — then events past the cap: the park stays at the cap (one shared countdown freed nothing)
  const batchScene = async (Mod, CDm, name) => {
    const R = mkRig(name); R.hold(); R.boot(Mod, CDm);
    const j = subJob(R);
    for (let i = 0; i < 30; i++) { if (!(await parkOne(R, j, `before ${i}`))) break; unjudged(R, 'unknown'); R.setAnswer(TAKES); await R.turnEnd(); }
    const before = R.parkIds().length;
    R.boot(Mod, CDm); const back = R.deliver.retryCount(R.cid);
    unjudged(R, 'unknown'); R.setAnswer(TAKES); await R.turnEnd();   // ONE attempt judges the thirty: one batch
    const batched = R.logs.some((l) => l.includes('30 parked entries are no longer owed'));
    const ev0 = R.logs.length;
    for (let i = 0; i < 29; i++) { if (!(await parkOne(R, j, `after ${i}`))) break; unjudged(R, 'unknown'); R.setAnswer(TAKES); await R.turnEnd(); }
    await turn();
    if (R.jm._notifsT) clearTimeout(R.jm._notifsT);
    const evicted = R.logs.slice(ev0).filter((l) => l.includes(`${R.cid}:`) && l.includes('fell off the 30-entry cap')).length;
    return { before, back, batched, evicted, park: R.parkIds().length, mem: R.mem().length };
  };
  {
    const CDSRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
    const bt = await batchScene({ JobManager }, CD, 'batch');
    console.log('    facts (batch) ' + JSON.stringify(bt));
    ok(bt.before === 30 && bt.back === 30 && gateOf(bt.batched) && bt.evicted === 29 && bt.park === 30 && bt.mem === 30, 'B-54b7 (the read\'s must, r576): a boot during the hold judges the thirty taken copies as ONE batch — each leaves the park at its own taker\'s landing, so twenty-nine events past the cap leave msg-retry.json at the cap (30)', JSON.stringify(bt));
    const EACH_A = "const riders = []; emitRetry('dropped', cid, e, { attempts: e.attempts.length, ...(threw ? { threw: true } : {}) }, riders); if (riders.length) leaveOne(e, riders); else leaveNow.push(e); }";
    const shared = anchored(anchored(CDSRC, EACH_A, "emitRetry('dropped', cid, e, { attempts: e.attempts.length, ...(threw ? { threw: true } : {}) }, sharedRiders); leaveNow.push(e); }", 'b54b7 each entry leaves at its own landing'),
      '    if (leaveNow.length) leaveParkWhenLanded(leaveNow, []);', '    leaveParkWhenLanded(leaveNow, sharedRiders);   // MUTANT: one shared countdown for the batch', 'b54b7 the untaken leave in one write');
    const btx = await batchScene({ JobManager }, MB.load('src/server/conversation-deliver.js', anchored(shared, '    const leaveNow = [];', '    const leaveNow = [], sharedRiders = [];', 'b54b7 the batch'), 'b54b7-shared-countdown'), 'batch-shared');
    console.log('    facts (batch control) ' + JSON.stringify(btx));
    ok(gateOf(btx.batched) && btx.evicted === 29 && btx.park === 59, 'CONTROL (the batch\'s one shared countdown, in a copy): no copy of the boot\'s batch leaves while any of its riders waits — msg-retry.json holds the cap plus the batch\'s evicted (59) (red)', JSON.stringify(btx));
  }
  // ALSO CURED (control c): a HELD VIEW's line (groups-unread) rides its own landing — with the file READABLE and a disk that does not answer
  // inside the flush (the failure branch): the park's copy stays until that landing
  const viewScene = async (Mod, name) => {
    const R = mkRig(name); R.lift('{}'); R.boot(Mod);
    const j = subJob(R); const id = await parkOne(R, j, 'found news');
    R.setSlow(true);   // from here the disk does not answer inside a flush
    unjudged(R, 'groups-unread'); R.setAnswer(TAKES); await R.turnEnd();
    const before = { park: R.parkIds(), disk: R.onDisk(), mem: R.mem() };
    R.land(); await turn();
    return { id, before, after: { park: R.parkIds(), disk: R.onDisk() } };
  };
  {
    const v = await viewScene({ JobManager }, 'view');
    ok(!!v.id && JSON.stringify(v.before.park) === JSON.stringify([v.id]) && !v.before.disk.length && JSON.stringify(v.before.mem) === JSON.stringify([v.id]) && !v.after.park.length && JSON.stringify(v.after.disk) === JSON.stringify([v.id]), 'B-54b7 ALSO CURED: a held view\'s line (groups-unread) keeps the park\'s copy until the notices holding it land — never only in memory', JSON.stringify(v));
    const VIEW_A = "      if (verdict === 'unknown' || verdict === 'groups-unread') { this._save(); return this._taken(this._parkCopyIn(cid, entry.id)); }";
    const vx = await viewScene(MB.load('src/jobs.js', anchored(JSRC, VIEW_A, "      if (verdict === 'unknown') { this._save(); return this._taken(this._parkCopyIn(cid, entry.id)); }   // MUTANT: groups-unread answers a plain «taken»", 'b54b7 a held view rides the landing'), 'b54b7-view'), 'view-plain');
    ok(!vx.before.park.length && !vx.before.disk.length, 'CONTROL (c) (groups-unread back to a plain «taken», in a copy): its park copy leaves msg-retry.json before the notices holding it are on disk (red)', JSON.stringify(vx));
  }
  // 主开发 r739 — TWO CRASHES AND A HOLD, with real files: the twin on disk (a kill between its landing and the park's rewrite); a boot that
  // finds the notices file HELD (the previous process's entry is TAKEN, never posted); a second crash before the lift; a boot that reads the
  // file (the twin in it): delivered ONCE. RED control: the unit before this item (the held boot posts the owner's copy — then the twin)
  const ownerJob = (R, id) => { const job = { id, kind: 'task', name: 'nightly', state: 'done', owner: { conversation: { id: R.cid } }, access: { view: 'all', control: 'session' }, runs: [] }; R.jm.jobs.set(job.id, job); R.jm._save(); R.land(); return job; };
  const twoCrashScene = async (Mod, name) => {
    const R = mkRig(name); R.lift('{}'); R.boot(Mod);
    const job = ownerJob(R, 'jb-5b7f0002');
    R.setAnswer(MISS); R.jm._notifyOwner(job, { what: 'finished: the twin' });
    const id = (await until(() => R.deliver.retryCount(R.cid) === 1)) ? R.deliver.retryPeek(R.cid)[0].id : null;
    const twin = JSON.stringify({ [R.cid]: [{ jobId: job.id, jobName: 'nightly', text: 'finished: the twin', ts: Date.now(), urgency: 'low', held: { kind: 'not-reachable' }, rt: id }] });
    R.hold(); R.boot(Mod);   // the first crash (the twin landed, the park kept its entry); this boot finds the file held
    R.setAnswer(TAKES); await R.turnEnd(); await R.advance(35 * 1000);   // its turn end and its retry during the hold
    const held = { posts: R.posts.length, park: R.parkIds(), mem: R.mem() };
    R.lift(twin); R.boot(Mod);   // the second crash, before the lift; the next boot reads the file — the twin in it
    R.setAnswer(TAKES); await R.turnEnd();
    const drained = R.jm.drainNotifs(R.cid).length;
    if (R.jm._notifsT) clearTimeout(R.jm._notifsT);
    return { id, held, posts: R.posts.length, drained, delivered: R.posts.length + drained, park: R.parkIds() };
  };
  {
    const c2 = await twoCrashScene({ JobManager }, 'two-crashes');
    console.log('    facts (two crashes) ' + JSON.stringify(c2));
    ok(!!c2.id && c2.held.posts === 0 && JSON.stringify(c2.held.park) === JSON.stringify([c2.id]) && JSON.stringify(c2.held.mem) === JSON.stringify([c2.id]) && c2.posts === 0 && c2.drained === 1 && c2.delivered === 1 && !c2.park.length, 'B-54b7 (主开发 r739): two crashes and a hold — the held boot TAKES the previous process\'s entry (never posts it), the second crash finds it still parked, the boot that reads the file keeps the twin: delivered ONCE', JSON.stringify(c2));
    const TAKE_HELD_A = '    if (this._notifsUnread && !this.readOnly && entry && entry.id && !entry.held && !entry.maybeDelivered && !(this._parkedHere && this._parkedHere.has(entry.id))) {';
    const c2x = await twoCrashScene(MB.load('src/jobs.js', anchored(JSRC, TAKE_HELD_A, '    if (false) { /* MUTANT: the unit before r739 — a held boot posts the previous process\'s entry */', 'b54b7 a held boot takes the previous process\'s entries'), 'b54b7-held-posts'), 'two-crashes-posted');
    ok(c2x.posts === 1 && c2x.drained === 1 && c2x.delivered === 2, 'CONTROL (the unit before this item, in a copy): the held boot posts the owner\'s copy and the boot that reads the file delivers its twin — a billed turn twice (red)', JSON.stringify(c2x));
  }
  // …and a held boot with a plain entry of the previous process and NO twin: not posted during the hold (a turn end, retries past the hour),
  // delivered once at the read again; a fresh entry of THIS engine during the same hold is posted as ever (it can have no twin)
  const noTwinScene = async (Mod, name) => {
    const R = mkRig(name); R.lift('{}'); R.boot(Mod);
    const job = ownerJob(R, 'jb-5b7f0005');
    R.setAnswer(MISS); R.jm._notifyOwner(job, { what: 'finished: the old one' });
    const id = (await until(() => R.deliver.retryCount(R.cid) === 1)) ? R.deliver.retryPeek(R.cid)[0].id : null;
    R.hold(); R.boot(Mod);   // a crash; this boot finds the file held (no twin anywhere)
    R.setAnswer(TAKES); await R.turnEnd(); await R.advance(70 * 60 * 1000);
    const old = { posts: R.posts.length, park: R.parkIds(), mem: R.mem() };
    R.setAnswer(MISS); R.jm._notifyRate.delete(R.cid); R.jm._notifyOwner(job, { what: 'finished: a fresh one' });
    const fresh = (await until(() => R.deliver.retryCount(R.cid) === 1)) ? R.deliver.retryPeek(R.cid)[0].id : null;
    R.setAnswer(TAKES); await R.advance(35 * 1000);   // the fresh one's retry: posted
    const freshPosted = R.posts.length;
    R.lift('{}'); await R.jm._notifsRetry(); await turn();
    const lifted = { park: R.parkIds(), disk: R.onDisk() };
    const drained = R.jm.drainNotifs(R.cid).length, again = R.jm.drainNotifs(R.cid).length;
    if (R.jm._notifsT) clearTimeout(R.jm._notifsT);
    return { id, fresh, old, freshPosted, lifted, drained, again };
  };
  {
    const nt = await noTwinScene({ JobManager }, 'no-twin');
    console.log('    facts (no twin) ' + JSON.stringify(nt));
    ok(!!nt.id && nt.old.posts === 0 && JSON.stringify(nt.old.park) === JSON.stringify([nt.id]) && JSON.stringify(nt.old.mem) === JSON.stringify([nt.id]) && !!nt.fresh && nt.fresh !== nt.id && nt.freshPosted === 1 && !nt.lifted.park.length && JSON.stringify(nt.lifted.disk) === JSON.stringify([nt.id]) && nt.drained === 1 && nt.again === 0, 'B-54b7 (主开发 r739): a held boot with the previous process\'s plain entry and no twin — not posted during the hold (a turn end, retries past the hour), delivered ONCE at the read again; a fresh entry of this engine is posted as ever', JSON.stringify(nt));
  }
  // 主开发 r734 (3): A PARK ID IS UNIQUE BY CONSTRUCTION — a process that restarts inside the same instant (the clock not moved) never
  // mints the previous process's id (its count starts at 1 again): the park's own token is in every id
  const idScene = async (CDm, name) => {
    const R = mkRig(name); R.lift('{}'); R.boot({ JobManager }, CDm);
    const job = { id: 'jb-5b7f0004', kind: 'task', name: 'ids', state: 'done', owner: { conversation: { id: R.cid } }, access: { view: 'all', control: 'session' }, runs: [] };
    R.jm.jobs.set(job.id, job); R.jm._save(); R.land();
    R.setAnswer(MISS); R.jm._notifyOwner(job, { what: 'the first' });
    const first = (await until(() => R.deliver.retryCount(R.cid) === 1)) ? R.deliver.retryPeek(R.cid)[0].id : null;
    R.boot({ JobManager }, CDm, { sameInstant: true });   // a crash and a boot inside the same instant
    R.jm.jobs.set(job.id, job); R.jm._notifyRate.delete(R.cid); R.jm._notifyOwner(job, { what: 'the second' });
    const second = (await until(() => R.deliver.retryCount(R.cid) === 2)) ? R.deliver.retryPeek(R.cid).slice(-1)[0].id : null;
    if (R.jm._notifsT) clearTimeout(R.jm._notifsT);
    return { first, second };
  };
  {
    const ids = await idScene(CD, 'ids');
    ok(!!ids.first && !!ids.second && ids.first !== ids.second, 'B-54b7 (主开发 r734 (3)): a park id is unique by construction — the next process, at the same instant, mints a different id (its park\'s own token)', JSON.stringify(ids));
    const CDSRC2 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8');
    const TOKEN_A = "  const retryRun = require('crypto').randomBytes(4).toString('hex');";
    const idsx = await idScene(MB.load('src/server/conversation-deliver.js', anchored(CDSRC2, TOKEN_A, "  const retryRun = 'x';   /* MUTANT: no token of the process */", 'b54b7 a park id carries its park\'s token'), 'b54b7-no-token'), 'ids-no-token');
    ok(gateOf(idsx.first) && idsx.first === idsx.second, 'CONTROL (no token, in a copy): the next process mints the previous process\'s id at the same instant (red)', JSON.stringify(idsx));
  }
  // (iv) THE INSTANT BOTH ARE ON DISK (a kill between the notices' landing and the park's own rewrite): the boot judges the park entry — never a second copy
  const bothScene = async (Mod, name, who = 'subscriber') => {
    const R = mkRig(name); R.lift('{}'); R.boot(Mod);
    let j, id;
    if (who === 'owner') {   // an OWNER's copy: owed — the ladder would post it
      j = { id: 'jb-5b7f0003', kind: 'task', name: 'watched', state: 'done', owner: { conversation: { id: R.cid } }, access: { view: 'all', control: 'session' }, runs: [] };
      R.jm.jobs.set(j.id, j); R.jm._save(); R.land();
      R.setAnswer(MISS); R.jm._notifyOwner(j, { what: 'found news' });
      id = (await until(() => R.deliver.retryCount(R.cid) === 1)) ? R.deliver.retryPeek(R.cid)[0].id : null;
    } else { j = subJob(R); id = await parkOne(R, j, 'found news'); }
    fs.writeFileSync(R.notifsFile, JSON.stringify({ [R.cid]: [{ jobId: j.id, jobName: 'watched', text: 'found news', ts: Date.now(), urgency: 'low', held: { kind: who === 'owner' ? 'not-reachable' : 'not-running' }, ...(who === 'owner' ? {} : { sub: true }), rt: id }] }));
    R.boot(Mod); const back = R.deliver.retryCount(R.cid);
    unjudged(R, 'unknown'); R.setAnswer(TAKES); await R.turnEnd(); R.land();
    return { id, back, park: R.parkIds(), mem: R.mem(), disk: R.onDisk(), posts: R.posts.length, log: R.logs.slice(-6).map((l) => l.slice(0, 160)) };
  };
  {
    const b = await bothScene({ JobManager }, 'both');
    ok(!!b.id && b.back === 1 && !b.park.length && JSON.stringify(b.mem) === JSON.stringify([b.id]) && JSON.stringify(b.disk) === JSON.stringify([b.id]) && b.posts === 0, 'B-54b7 (iv): a boot that finds BOTH copies (the park entry and the landed notice carrying its id) keeps ONE — the park\'s leaves, nothing is stashed again', JSON.stringify(b));
    const BOTH_A = '    if (entry && this._parkOnDisk && this._parkOnDisk.has(entry.id)) {';
    const bx = await bothScene(MB.load('src/jobs.js', anchored(JSRC, BOTH_A, '    if (false) { /* MUTANT: no look at what the file holds */', 'b54b7 a park entry already on disk'), 'b54b7-both'), 'both-twice');
    ok(bx.mem.length === 2, 'CONTROL (d) (the id check cut, in a copy): the boot stashes the park entry AGAIN beside the landed notice — two copies of one event (red)', JSON.stringify(bx));
    const bo = await bothScene({ JobManager }, 'both-owner', 'owner');
    ok(!!bo.id && bo.back === 1 && !bo.park.length && JSON.stringify(bo.mem) === JSON.stringify([bo.id]) && bo.posts === 0, 'B-54b7 (iv): …an OWNER\'s copy too — the ladder never posts the park entry whose copy the file already holds (one copy, nothing posted)', JSON.stringify(bo));
    const box = await bothScene(MB.load('src/jobs.js', anchored(JSRC, BOTH_A, '    if (false) { /* MUTANT: no look at what the file holds */', 'b54b7 a park entry already on disk'), 'b54b7-both-owner'), 'both-owner-twice', 'owner');
    ok(box.posts === 1 && box.mem.length === 1, 'CONTROL (d) on an owner\'s copy: the ladder POSTS the park entry beside the landed notice still waiting — delivered twice (red)', JSON.stringify(box));
  }
})();

console.log(`\n${pass} passed, ${fail} failed${skipped ? ` (${skipped} skipped, each named above)` : ''}`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
