#!/usr/bin/env node
// Peer-messaging gate (2.344.0, B-0bf4). Pins the delivery primitive for
// Background Work owner notifications against a REAL unix-socket inbox
// standing in for the CLI's cross-session messaging server: registry scan
// (live-pid + key-file discovery, dead-pid and wrong-id rejection), the exact
// two-frame wire shape ({"type":"auth"} then {"type":"user"} — from the
// 2.1.229 binary's own injection recipe) and dead-socket honesty (the
// channel-lane event post went with the VibeSpace channel, B-df40). All in a
// tmp dir; no real CLI.
// §4 (lane peer-registry-identity, 2026-10-14): a registration is found by its
// PROCESS IDENTITY (pid + /proc start time + a served socket), the newest live
// record of the session wins — the hub's post-reboot shape (two records, the
// stale one's low pid reused and answering EPERM, sorting first) + its RED
// control (the pid-only first-record rule picks the stale one).
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const PM = require('../src/peer-messaging.js');
const { findPeer, postToPeer } = PM;
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-peer-'));
const sockPath = path.join(dir, 'inbox.sock');
const SID = 'aaaa1111-2222-3333-4444-555566667777';
const KEY = 'k'.repeat(64);

// registry fixtures: live record (our own pid), dead record, other-session record
fs.writeFileSync(path.join(dir, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: SID, messagingSocketPath: sockPath, name: 'test-peer', version: '2.1.229' }));
fs.writeFileSync(path.join(dir, `${process.pid}.abc123.key`), KEY + '\n');
fs.writeFileSync(path.join(dir, '99999999.json'), JSON.stringify({ pid: 99999999, sessionId: 'dead-conv', messagingSocketPath: '/nonexistent.sock' }));

// the inbox stand-in serves its socket FIRST — a registration counts only while its socket exists (§4)
const frames = [];
const server = net.createServer((conn) => {
  let buf = '';
  conn.on('data', (d) => {
    buf += d.toString();
    let i; while ((i = buf.indexOf('\n')) >= 0) { frames.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); }
  });
});
await new Promise((r) => server.listen(sockPath, r));

// 1. registry scan
const peer = findPeer(SID, dir);
ok(peer && peer.socketPath === sockPath && peer.key === KEY && peer.name === 'test-peer', 'findPeer resolves live record + reads the published key file');
ok(findPeer('dead-conv', dir) === null, 'dead-pid registry record treated as absent');
ok(findPeer('no-such-conversation', dir) === null, 'NEGATIVE CONTROL: unknown conversation → null');
ok(findPeer(SID, path.join(dir, 'nope')) === null, 'missing registry dir → null, never throws');

// 2. wire shape against a real inbox server
const r1 = await postToPeer(peer, 'job done: test message');
ok(r1.ok === true, 'postToPeer resolves ok against a listening inbox', r1.reason);
await new Promise((r) => setTimeout(r, 100));
ok(frames.length === 2 && frames[0].type === 'auth' && frames[0].token === KEY, 'first frame = auth with the published key');
ok(frames[1] && frames[1].type === 'user' && frames[1].message && frames[1].message.role === 'user' && frames[1].message.content === 'job done: test message', 'second frame = the documented user-message injection shape');
server.close();

// 3. dead socket honesty
const r2 = await postToPeer({ socketPath: path.join(dir, 'gone.sock'), key: null }, 'x');
ok(r2.ok === false && /socket error|timeout/.test(r2.reason || ''), 'dead socket → {ok:false, reason}, never throws');

// §4 THE PROCESS IDENTITY (lane peer-registry-identity). Shapes measured on the hub 2026-10-14 (ids, pids and start
// times invented): the CLI writes `procStart` as a STRING (/proc/<pid>/stat field 22) and `startedAt` in ms; after the
// 10:26 hard freeze 11 conversations held two records each, and 4 stale low pids now named another process (EPERM).
console.log('\n§4 a registration is its process identity: pid + /proc start time + a served socket; the newest live record wins');
const selfStart = () => { const st = fs.readFileSync('/proc/self/stat', 'utf8'); return st.slice(st.lastIndexOf(')') + 2).split(' ')[19]; };
const HAS_PROC = fs.existsSync('/proc/self/stat');
{
  // PURE: the rule over an injected probe — every verdict reachable without a process
  const probe = (o = {}) => ({ hasProc: true, starttime: () => 131357, alive: () => true, isSocket: () => true, ...o });
  const rec = { pid: 15622, procStart: '131357', messagingSocketPath: '/run/user/1000/cc-socks/15622.sock' };
  const v0 = PM.registryIdentityOk(rec, probe());
  ok(v0.ok === true && v0.identity === 'pid+start' && v0.reasons.length === 0, 'PURE: pid runs with the recorded start time + the socket exists ⇒ live (identity pid+start)', JSON.stringify(v0));
  const v1 = PM.registryIdentityOk(rec, probe({ starttime: () => 15298, isSocket: () => false }));
  ok(v1.ok === false && v1.reasons.join() === 'pid-reused,socket-absent', 'PURE: the hub\'s stale record — the pid answers (EPERM counts as alive) but its start time is another process\'s, the socket is gone ⇒ pid-reused + socket-absent', JSON.stringify(v1));
  const v2 = PM.registryIdentityOk(rec, probe({ starttime: () => 15298, alive: () => true }));
  ok(v2.ok === false && v2.reasons.join() === 'pid-reused', 'PURE: EPERM/alive alone is NOT liveness when the record carries procStart (the socket existing does not save a reused pid)', JSON.stringify(v2));
  const v3 = PM.registryIdentityOk(rec, probe({ starttime: () => null }));
  ok(v3.ok === false && v3.reasons.join() === 'pid-gone', 'PURE: no /proc/<pid>/stat for the pid ⇒ pid-gone', JSON.stringify(v3));
  const v4 = PM.registryIdentityOk({ pid: 15622, messagingSocketPath: '/x.sock' }, probe({ starttime: () => { throw new Error('never asked'); } }));
  ok(v4.ok === true && /^pid-only/.test(v4.identity) && /no procStart/.test(v4.identity), 'PURE: a record without procStart (an older CLI) falls back to the pid alone — and the verdict says so', JSON.stringify(v4));
  const v5 = PM.registryIdentityOk(rec, probe({ hasProc: false, starttime: () => { throw new Error('never asked'); } }));
  ok(v5.ok === true && v5.identity === 'pid-only (no /proc on this machine)', 'PURE: no /proc on this machine (macOS) ⇒ pid-only, said in the result', JSON.stringify(v5));
  const v6 = PM.registryIdentityOk({ ...rec, procStart: undefined }, probe({ alive: () => false }));
  ok(v6.ok === false && v6.reasons.join() === 'pid-gone', 'PURE: pid-only and the pid is dead ⇒ pid-gone', JSON.stringify(v6));
  const v8 = PM.registryIdentityOk({ pid: 15622, messagingSocketPath: '\\\\.\\pipe\\cc-msg-0123abcd' }, probe({ hasProc: false, isSocket: () => { throw new Error('a pipe is never statted'); } }));
  ok(v8.ok === true && v8.identity === 'pid-only (no /proc on this machine)', 'PURE: a Windows named pipe (\\\\.\\pipe\\…, the CLI\'s own form there) is not statted — no inode; its post judges it', JSON.stringify(v8));
  const v7 = PM.registryIdentityOk({ pid: 15622, procStart: '131357' }, probe());
  ok(v7.ok === false && v7.reasons.join() === 'socket-absent', 'PURE: a record naming no socket path is never live', JSON.stringify(v7));
}
const hub = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-peer-hub-'));
const HSID = '5f4369df-0b7e-4c51-9d1a-2e8f6a7c3b10';
const liveSock = path.join(hub, 'live.sock');
const liveSrv = net.createServer((c) => c.on('data', () => { }));
await new Promise((r) => liveSrv.listen(liveSock, r));
const REAL = HAS_PROC ? selfStart() : null;
// the reused-pid stand-in: OUR pid (alive, like the kernel thread that answered EPERM) with a WRONG start time and the
// pre-freeze socket path (absent); the live record: our pid with the start time /proc/self/stat says, a served socket
const staleRec = { pid: process.pid, sessionId: HSID, cwd: '/home/u/work', startedAt: 1791069101439, procStart: String(Number(REAL) + 113000), version: '2.1.296', peerProtocol: 1, kind: 'interactive', entrypoint: 'sdk-cli', pidDomain: 'linux:0123456789abcdef0123456789abcdef:pid:[4026531836]', messagingSocketPath: path.join(hub, 'pre-freeze.sock'), name: '企业助手', status: 'idle', updatedAt: 1791069101439 };
const liveRec = { ...staleRec, startedAt: 1791912553717, procStart: String(REAL), messagingSocketPath: liveSock, updatedAt: 1791912553717 };
const STALE_F = `${process.pid}.json`, LIVE_F = `9${process.pid}.json`;   // the stale file sorts FIRST (the hub's "15622.json" < "17654.json")
const writeHub = (d, files) => { for (const f of fs.readdirSync(d)) if (f.endsWith('.json')) fs.unlinkSync(path.join(d, f)); for (const [f, r] of files) fs.writeFileSync(path.join(d, f), JSON.stringify(r)); };
const jsonOrder = (d) => fs.readdirSync(d).filter((f) => /^\d+\.json$/.test(f));
fs.writeFileSync(path.join(hub, `${process.pid}.0123abcd.key`), KEY + '\n');
{
  writeHub(hub, [[STALE_F, staleRec], [LIVE_F, liveRec]]);
  ok(jsonOrder(hub)[0] === STALE_F, 'precondition: the scan meets the STALE record first (the hub\'s readdir order)', JSON.stringify(jsonOrder(hub)));
  const L = PM.lookupPeer(HSID, hub);
  ok(HAS_PROC && L.peer && L.peer.socketPath === liveSock && L.peer.key === KEY && L.peer.identity === 'pid+start', 'the hub\'s shape: two records for one session ⇒ the LIVE one is chosen (its socket, its key, identity pid+start)', JSON.stringify(L));
  ok(L.candidates === 2 && L.stale === 1 && L.why === 'candidates: 2, stale: 1 (pid-reused: 1, socket-absent: 1)' && L.peer && L.peer.why === L.why, 'the verdict carries the why for the journal: candidates 2, stale 1 (pid-reused 1, socket-absent 1)', L.why);
  ok(findPeer(HSID, hub) && findPeer(HSID, hub).socketPath === liveSock, 'findPeer answers the same record (the ladder\'s and agentd\'s call)');
  const r = await postToPeer(L.peer, 'reaches the live inbox');
  ok(r.ok === true, 'the chosen record\'s socket takes the post', JSON.stringify(r));
}
{
  // the mirror: the live record sorts first — unchanged
  writeHub(hub, [[`1${process.pid}.json`, liveRec], [`9${process.pid}.json`, staleRec]]);
  ok(jsonOrder(hub)[0] === `1${process.pid}.json`, 'precondition (mirror): the scan meets the LIVE record first');
  const L = PM.lookupPeer(HSID, hub);
  ok(L.peer && L.peer.socketPath === liveSock && L.why === 'candidates: 2, stale: 1 (pid-reused: 1, socket-absent: 1)', 'the mirror (live record first) ⇒ the same live record, the same why', JSON.stringify(L));
}
{
  // two LIVE records (a CLI restarted while the old process still serves): the newest startedAt wins, whatever the order
  const sock2 = path.join(hub, 'older.sock');
  const srv2 = net.createServer((c) => c.destroy());
  await new Promise((r) => srv2.listen(sock2, r));
  const older = { ...liveRec, startedAt: liveRec.startedAt - 60000, messagingSocketPath: sock2 };
  writeHub(hub, [[STALE_F, older], [LIVE_F, liveRec]]);
  const a = PM.lookupPeer(HSID, hub);
  writeHub(hub, [[STALE_F, liveRec], [LIVE_F, older]]);
  const b = PM.lookupPeer(HSID, hub);
  ok(a.peer && b.peer && a.peer.socketPath === liveSock && b.peer.socketPath === liveSock && a.why === 'candidates: 2, stale: 0', 'two passing records ⇒ the newest startedAt wins in either order', JSON.stringify([a.why, a.peer && a.peer.socketPath, b.peer && b.peer.socketPath]));
  srv2.close();
}
{
  // a single stale record ⇒ null + the why (the ladder says "stale registration(s) only")
  writeHub(hub, [[STALE_F, staleRec]]);
  const L = PM.lookupPeer(HSID, hub);
  ok(L.peer === null && findPeer(HSID, hub) === null && L.candidates === 1 && L.stale === 1 && L.why === 'candidates: 1, stale: 1 (pid-reused: 1, socket-absent: 1)', 'a single stale record ⇒ null + the why', JSON.stringify(L));
  ok(fs.existsSync(path.join(hub, STALE_F)), '…and the stale record is never cleaned (the CLI owns the directory)');
  const gone = { ...staleRec, pid: 99999999, procStart: '131014' };
  writeHub(hub, [[STALE_F, gone]]);
  ok(PM.lookupPeer(HSID, hub).why === 'candidates: 1, stale: 1 (pid-gone: 1, socket-absent: 1)', 'a dead pid counts as pid-gone (the other seven hub twins)', PM.lookupPeer(HSID, hub).why);
  writeHub(hub, []);
  ok(PM.lookupPeer(HSID, hub).why === 'candidates: 0, stale: 0' && PM.lookupPeer(HSID, hub).peer === null, 'no record of the session ⇒ candidates 0 (not running, not stale)');
}
{
  // RED CONTROL: the base's rule (the FIRST record in readdir order whose pid answers kill -0, EPERM counted) on the
  // same hub shape picks the stale record — the incident
  const src = fs.readFileSync(path.join(REPO, 'src/peer-messaging.js'), 'utf8');
  const RULE = '    const v = registryIdentityOk(rec, pr);\n';
  const CHOICE = '    if (!best || startedOf(rec) > startedOf(best.rec)) best = { rec, identity: v.identity };\n';
  const PID_ONLY = "    const v = rec.messagingSocketPath && pidAlive(rec.pid) ? { ok: true, reasons: [], identity: 'pid-only' } : { ok: false, reasons: ['pid-gone'] };\n";
  const FIRST = '    if (!best) best = { rec, identity: v.identity };\n';
  ok(src.split(RULE).length === 2 && src.split(CHOICE).length === 2, 'CONTROL anchors: the identity rule and the choice rule each sit on ONE line of src/peer-messaging.js');
  const M = mutantCopies('peerid', REPO);
  const Old = M.load('src/peer-messaging.js', src.replace(RULE, PID_ONLY).replace(CHOICE, FIRST), 'pidonly');
  writeHub(hub, [[STALE_F, staleRec], [LIVE_F, liveRec]]);
  const p = Old.findPeer(HSID, hub);
  ok(p && p.socketPath === staleRec.messagingSocketPath, 'RED CONTROL: the pid-only first-record rule picks the STALE record (its socket absent) on the hub\'s shape', JSON.stringify(p));
  const r = p ? await postToPeer(p, 'x', { timeoutMs: 500 }) : { ok: true };
  ok(r.ok === false && r.transient === false, '…and its post fails as "not served" (ENOENT) — the 34 stashed posts', JSON.stringify(r));
}
liveSrv.close();
fs.rmSync(hub, { recursive: true, force: true });

fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
