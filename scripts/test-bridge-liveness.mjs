#!/usr/bin/env node
// THE DEAD-BRIDGE RULES, IN PROCESS (lane-dead-bridge) — FAST.
// The heavy reproduction is scripts/test-dead-bridge.mjs (real dtach, a real
// server, SIGKILL, the late gate, the card). This suite pins the RULES it rests
// on, each with a control where a weaker rule would be dangerous:
//   §A orphanAttachVerdict — a stuck ATTACH CLIENT a dead server left, never a
//      MASTER (ending a master ends the session): the rows measured on the
//      production box, and a copy without the controlling-terminal guard caught;
//   §B bridgeVerdict — silence alone is never dead (an idle CLI is quiet); a
//      witness after the last byte is; the heal budget;
//   §C the setting and the cadence;
//   §D the catch-up + its card, through lane-hot-switch's late rule;
//   §E the watch (ORCH) over a fake /proc and fake sessions: what it ends, when
//      it heals, the budget, the empty-heal backoff;
//   §F the wiring (the one healer, the hooks, the setting, the OTel witness).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BL = require(path.join(REPO, 'src/bridge-liveness.js'));
const RL = require(path.join(REPO, 'src/record-lateness.js'));
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? `\n      ${extra}` : '')); } return !!c; };
const ROOT = scratch('bridge-liveness');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const M = mutantCopies('bridge-liveness', REPO);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ── §A ──
console.log('\n§A orphanAttachVerdict — an orphaned attach CLIENT, never a master');
const SD = '/srv/vs/data/sockets';
const ROWS = [
  // [label, input, expect orphan, expect why]
  ['a restored session\'s old attach client, reparented to systemd --user (the 13 production orphans)', { argv: ['/usr/bin/dtach', '-a', SD + '/cw-4-1790602425171', '-E', '-r', 'winch'], ppid: 3604, parentComm: 'systemd', ttyNr: 34905 }, true, 'reparented-to-subreaper'],
  ['a CREATED session\'s attach client (`dtach -c` stays attached after forking the master), reparented', { argv: ['/usr/bin/dtach', '-c', SD + '/cw-2-1790806077604', '-E', '-r', 'none', 'node', 'chat-wrapper.js'], ppid: 1, parentComm: 'init', ttyNr: 34924 }, true, 'reparented-to-init'],
  ['THE MASTER of that session (same argv, no controlling terminal) — NEVER', { argv: ['/usr/bin/dtach', '-c', SD + '/cw-2-1790806077604', '-E', '-r', 'none', 'node', 'chat-wrapper.js'], ppid: 3604, parentComm: 'systemd', ttyNr: 0 }, false, 'a-master'],
  ['a detached-created master (`-n`) — NEVER', { argv: ['dtach', '-n', SD + '/cw-1-1', '-E', 'sh'], ppid: 1, parentComm: 'init', ttyNr: 0 }, false, 'not-an-attach'],
  ['this server\'s own attach client', { argv: ['dtach', '-a', SD + '/cw-1-1'], ppid: 777, parentComm: 'node', ttyNr: 5 }, false, 'ours'],
  ['a person\'s own `dtach -a` in their terminal (parent alive)', { argv: ['dtach', '-a', SD + '/cw-1-1'], ppid: 4242, parentComm: 'zsh', ttyNr: 9 }, false, 'parent-alive'],
  ['the local daemon\'s attach client (parent alive)', { argv: ['dtach', '-a', SD + '/cw-1-1'], ppid: 4243, parentComm: 'vibespace-devic', ttyNr: 9 }, false, 'parent-alive'],
  ['another tree\'s socket (a scratch server\'s) — not ours', { argv: ['dtach', '-a', '/tmp/vs-x/data/sockets/cw-1-1'], ppid: 1, parentComm: 'init', ttyNr: 9 }, false, 'not-our-socket'],
  ['a sibling dir that only shares the prefix', { argv: ['dtach', '-a', SD + '-evil/cw-1-1'], ppid: 1, parentComm: 'init', ttyNr: 9 }, false, 'not-our-socket'],
  ['a path that escapes the dir', { argv: ['dtach', '-a', SD + '/../x/cw-1-1'], ppid: 1, parentComm: 'init', ttyNr: 9 }, false, 'not-our-socket'],
  ['a socket that is not a session anchor (no cw- name)', { argv: ['dtach', '-a', SD + '/other'], ppid: 1, parentComm: 'init', ttyNr: 9 }, false, 'not-our-socket'],
  ['not dtach at all', { argv: ['node', '-a', SD + '/cw-1-1'], ppid: 1, parentComm: 'init', ttyNr: 9 }, false, 'not-dtach'],
];
for (const [label, inp, orphan, why] of ROWS) {
  const v = BL.orphanAttachVerdict({ ...inp, socketsDir: SD, selfPid: 777 });
  ok(v.orphan === orphan && v.why === why, `${label} ⇒ ${orphan ? 'orphan' : 'kept'} (${v.why})`, JSON.stringify(v));
}
{
  const src = read('src/bridge-liveness.js');
  const weak = src.replace("  if (!(Number(ttyNr) > 0)) return { orphan: false, socket: null, why: 'a-master' };", '');
  ok(weak !== src, 'control setup: the copy without the controlling-terminal guard took its patch');
  const W = M.load('src/bridge-liveness.js', weak, 'no-tty-guard');
  const master = ROWS[2][1];
  ok(W.orphanAttachVerdict({ ...master, socketsDir: SD, selfPid: 777 }).orphan === true, 'CONTROL: without the guard the reparented MASTER reads as an orphan — the sweep would end the session itself');
}

// ── §B ──
console.log('\n§B bridgeVerdict — silence is judged against the CLI\'s own witnesses');
const N = 180e3, S = BL.WITNESS_SLACK_MS;
const t0 = 1_800_000_000_000;
const V = (o) => BL.bridgeVerdict({ now: t0 + 600e3, silenceMs: N, attachedAt: t0, ...o });
ok(V({ lastByteAt: t0 + 590e3 }).verdict === 'alive', 'a byte 10 s ago ⇒ alive');
ok(V({ lastByteAt: t0 + 100e3 }).verdict === 'quiet', 'silent 8 min, no witness ⇒ QUIET (an idle CLI is not a dead bridge — never healed)');
ok(V({ lastByteAt: t0 + 100e3, bufMtimeMs: t0 + 100e3 + S - 1 }).verdict === 'quiet', 'the wrapper\'s last persist inside the slack of our last byte ⇒ still quiet (it persists 2 s after data)');
const vb = V({ lastByteAt: t0 + 100e3, bufMtimeMs: t0 + 300e3 });
ok(vb.verdict === 'dead' && vb.witness === 'buffer-file' && vb.seenAt === t0 + 300e3, 'the wrapper wrote its buffer file 200 s after our last byte ⇒ DEAD (buffer-file)');
const va = V({ lastByteAt: t0 + 100e3, bufMtimeMs: t0 + 101e3, lastApiAt: t0 + 590e3 });
ok(va.verdict === 'dead' && va.witness === 'api-request', 'the buffer file frozen (the 12:03 shape: the wrapper is blocked) but the CLI made an API request after the last byte ⇒ DEAD (api-request)');
ok(V({ lastByteAt: 0, lastApiAt: t0 + 590e3 }).since === t0, 'no byte since the watch started ⇒ silence counts from the start, never from 1970');
ok(V({ lastByteAt: t0 + 100e3, lastApiAt: t0 + 590e3, heals: [t0 + 100e3, t0 + 200e3, t0 + 300e3] }).verdict === 'budget', 'three heals in the hour ⇒ budget (no heal loop)');
ok(V({ lastByteAt: t0 + 100e3, lastApiAt: t0 + 590e3, heals: [t0 - 3700e3, t0 - 3650e3, t0 - 3610e3] }).verdict === 'dead', 'heals older than an hour do not count');
ok(BL.bridgeVerdict({ now: t0, silenceMs: null }).verdict === 'off', 'the setting off ⇒ off');
ok(/no output for 8m20s while the CLI made an API request 8m10s after the last byte/.test(BL.verdictWords(va)), `the journal words: ${JSON.stringify(BL.verdictWords(va))}`);

// ── §C ──
console.log('\n§C the setting and the cadence');
ok(BL.silenceMsOf(undefined) === 180e3 && BL.silenceMsOf('') === 180e3 && BL.silenceMsOf(3) === 180e3, 'unset ⇒ the default 3 minutes');
ok(BL.silenceMsOf(0) === null && BL.silenceMsOf(-1) === null && BL.silenceMsOf('x') === null, '0 / negative / junk ⇒ off');
ok(BL.silenceMsOf(2.1) === 126e3, 'fractions are minutes (2.1 ⇒ 126 s)');
ok(BL.tickMsOf(180e3) === 30e3 && BL.tickMsOf(6e3) === 2e3 && BL.tickMsOf(60e3) === 15e3 && BL.tickMsOf(null) === 30e3, 'the watch looks every quarter of the silence, 2 s..30 s');
ok(BL.spanWords(45e3) === '45s' && BL.spanWords(152e3) === '2m32s' && BL.spanWords(3 * 3600e3 + 2 * 60e3) === '3h02m', 'durations in words');

// ── §D ──
console.log('\n§D the catch-up and its card (through lane-hot-switch\'s late rule)');
{
  const restoredAt = Date.parse('2026-09-30T22:05:14Z');
  const st = BL.catchUpStart({ restoredAt, silentSince: Date.parse('2026-09-30T19:03:33Z'), why: 'heal' });
  let clock = null;
  const feed = (rec, at) => { const j = RL.judge(clock, rec, at); clock = RL.observe(clock, rec, at).clock; BL.catchUpNote(st, j, RL.stampOf(rec), at); };
  const stamp = (iso) => ({ type: 'assistant', timestamp: iso, message: { content: [] } });
  feed(stamp('2026-09-30T19:03:20Z'), restoredAt + 50);           // 3 h old
  feed({ type: 'rate_limit_event' }, restoredAt + 51);             // unstamped: inherits the burst
  feed(stamp('2026-09-30T22:04:00Z'), restoredAt + 60);           // 74 s old: backlog, not late
  ok(st.n === 3 && st.late === 2 && !BL.catchUpSettled(st, restoredAt + 100), `3 records, 2 late (the unstamped one inherits its neighbour); a 74 s old one is backlog, not "now" — not settled (${JSON.stringify({ n: st.n, late: st.late })})`);
  feed(stamp(new Date(restoredAt + 1000).toISOString()), restoredAt + 1500);
  ok(BL.catchUpSettled(st, restoredAt + 1500), 'a record stamped NOW arrived behind the backlog ⇒ settled');
  ok(BL.catchUpLostAt(st) === Date.parse('2026-09-30T19:03:20Z'), 'lost at = the oldest record we missed (before our last byte at 19:03:33)');
  const card = BL.catchUpCard(st, { fmt: (ms) => new Date(ms).toISOString().slice(11, 16) });
  ok(card === "The connection to this conversation's output was lost at 19:03 and restored at 22:05 — 4 records caught up (they are shown, not re-run).", `the card: ${JSON.stringify(card)}`);
  const quick = BL.catchUpStart({ restoredAt, silentSince: restoredAt - 5000 });
  BL.catchUpNote(quick, { verdict: 'live', by: 'own-stamp', lateMs: 3000 }, restoredAt - 3000, restoredAt + 10);
  ok(BL.catchUpCard(quick) === null, 'a 5 s gap (a quick restart) ⇒ no card');
  ok(BL.catchUpCard(BL.catchUpStart({ restoredAt, silentSince: restoredAt - 600e3 })) === null, 'a heal that brought nothing ⇒ no card');
  const q = BL.catchUpStart({ restoredAt });
  ok(!BL.catchUpSettled(q, restoredAt + 14e3) && BL.catchUpSettled(q, restoredAt + 15e3), 'no record for 15 s ⇒ settled');
}

// ── §E the watch over a fake /proc ──
console.log('\n§E the watch (ORCH) over a fake /proc and fake sessions');
{
  const proc = path.join(ROOT, 'proc');
  const SOCKS = path.join(ROOT, 'data', 'sockets'), BUFS = path.join(ROOT, 'data', 'session-buffers');
  fs.mkdirSync(SOCKS, { recursive: true }); fs.mkdirSync(BUFS, { recursive: true });
  const mk = (pid, { comm, argv, ppid, tty }) => {
    fs.mkdirSync(path.join(proc, String(pid)), { recursive: true });
    fs.writeFileSync(path.join(proc, String(pid), 'comm'), comm + '\n');
    fs.writeFileSync(path.join(proc, String(pid), 'cmdline'), argv.join('\0') + '\0');
    fs.writeFileSync(path.join(proc, String(pid), 'stat'), `${pid} (${comm}) S ${ppid} ${pid} ${pid} ${tty} -1 4194560 0 0`);
  };
  mk(1, { comm: 'systemd', argv: ['/sbin/init'], ppid: 0, tty: 0 });
  mk(3604, { comm: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], ppid: 1, tty: 0 });
  mk(500, { comm: 'node', argv: ['node', 'server.js'], ppid: 1, tty: 0 });
  mk(4242, { comm: 'zsh', argv: ['zsh'], ppid: 1, tty: 3 });
  const sockA = path.join(SOCKS, 'cw-1-1'), sockB = path.join(SOCKS, 'cw-2-2');
  mk(10, { comm: 'dtach', argv: ['dtach', '-c', sockA, '-E', '-r', 'none', 'node', 'chat-wrapper.js'], ppid: 3604, tty: 0 });   // master A
  mk(11, { comm: 'dtach', argv: ['dtach', '-a', sockA, '-E', '-r', 'winch'], ppid: 3604, tty: 34905 });                         // ORPHAN of A
  mk(12, { comm: 'dtach', argv: ['dtach', '-a', sockA, '-E', '-r', 'winch'], ppid: 500, tty: 34906 });                          // ours
  mk(13, { comm: 'dtach', argv: ['dtach', '-a', sockB, '-E', '-r', 'winch'], ppid: 4242, tty: 3 });                             // a person's
  mk(14, { comm: 'dtach', argv: ['dtach', '-c', sockB, '-E', '-r', 'none', 'sh'], ppid: 1, tty: 9 });                           // a CREATING client of B, orphaned
  const killed = [];
  const BW = require(path.join(REPO, 'src/server/bridge-watch.js'));
  const sessions = new Map();
  let t = t0;
  const reattached = [];
  const lines = [];
  const W = BW.create({ activeSessions: sessions, BUFFERS_DIR: BUFS, SOCKETS_DIR: SOCKS, procRoot: proc, selfPid: 500, now: () => t,
    kill: (pid, sig) => killed.push([pid, sig]), log: { log: (l) => lines.push(l), warn: (l) => lines.push(l) },
    serverSetting: (k) => (k === 'session.deadBridgeMinutes' ? 3 : undefined),
    getOtelIngest: () => ({ lastApiRequestAt: (sid) => (sid === 'conv-a' ? apiAt : null) }),
    reattachLocalPty: (id, s, why, o) => { reattached.push({ id, why, o }); s._lastPtyDataAt = t; W.afterReattach(id, s, { kind: o && o.kind, silentSince: null }); return true; },
    feedPeerCard: () => true });
  let apiAt = null;
  const orphans = W.listOrphans().map((o) => o.pid).sort();
  ok(JSON.stringify(orphans) === '[11,14]', `the sweep's list over the fake /proc: ${JSON.stringify(orphans)} — the orphaned -a client and the orphaned creating -c client; never the master (10), ours (12) or a person's (13)`);
  ok(JSON.stringify(W.listOrphans(sockB).map((o) => o.pid)) === '[14]', 'scoped to one socket: only that socket\'s orphan');
  // ATTACH FIRST: the boot sweep waits for each orphan's session to have its own attach connected (a first byte)
  const sBoot = { socketPath: sockA, pty: { onData: () => ({ dispose() { } }), kill() { } }, _lastPtyDataAt: 0 };
  sessions.set('sess-boot', sBoot);
  const sweeping = W.bootSweep();
  await new Promise((r) => setTimeout(r, 300));
  ok(killed.length === 0, 'the boot sweep does NOT end an orphan while its session\'s own attach has not connected yet (no first byte)');
  sBoot._lastPtyDataAt = t;
  await sweeping;
  ok(JSON.stringify(killed) === '[[11,"SIGKILL"],[14,"SIGKILL"]]' && /\[bridge\] boot: ended 2 orphaned dtach attach client/.test(lines[0] || ''), `…then ends them with SIGKILL and says so: ${JSON.stringify((lines[0] || '').slice(0, 100))}…`);
  ok(sBoot._bridgeCatchUp && sBoot._bridgeCatchUp.why === 'boot', '…and counts what the freed session catches up');
  sBoot._bridgeCatchUp = null; sessions.delete('sess-boot');
  // a fresh orphan of A for the HEAL's own sweep (verify r1: the post-heal sweep was pinned by no gate)
  mk(15, { comm: 'dtach', argv: ['dtach', '-a', sockA, '-E', '-r', 'winch'], ppid: 3604, tty: 34907 });
  // a session silent 4 min
  const pty = { onData: () => ({ dispose() { } }), kill() { } };
  const sA = { socketPath: sockA, pty, claudeSessionId: 'conv-a', _lastPtyDataAt: t };
  sessions.set('sess-a', sA);
  t += 240e3;
  let acted = await W.tick();
  ok(acted.length === 0 && reattached.length === 0, 'silent 4 min with no witness ⇒ no heal (quiet)');
  apiAt = t - 30e3;
  acted = await W.tick();
  ok(acted.length === 1 && reattached.length === 1 && reattached[0].o.kind === 'heal' && /^dead bridge: no output for 4m00s while the CLI made an API request/.test(reattached[0].why), `the OTel witness ⇒ ONE heal through the one healer: ${JSON.stringify(reattached[0] && reattached[0].why)}`);
  ok(sA._bridgeCatchUp && sA._bridgeCatchUp.why === 'heal' && Array.isArray(sA._bridgeHeals) && sA._bridgeHeals.length === 1, 'the heal armed its catch-up and spent one of the hour\'s budget');
  await new Promise((r) => setTimeout(r, 300));   // afterReattach: the new attach's first byte (the stub stamped it) ⇒ this socket's orphans are ended
  ok(killed.some(([p, sig]) => p === 15 && sig === 'SIGKILL') && lines.some((l) => /\[bridge\] sess-a heal: ended \d+ orphaned dtach attach client\(s\)[^\n]*pid 15 cw-1-1/.test(l)), `the heal ends the orphan holding THIS socket once the new attach has spoken (attach first, then kill) — and says so`, `killed=${JSON.stringify(killed)} lines=${JSON.stringify(lines.filter((l) => /heal/.test(l)).slice(-3))}`);
  t += 20e3;                                        // 15 s with no record and no byte past the preamble: the catch-up settles EMPTY
  await new Promise((r) => setTimeout(r, 1300));   // the settle poll runs on real time
  ok(sA._bridgeCatchUp === null && sA._bridgeEmptyHeals === 1, `an EMPTY heal (no record, nothing past the preamble) is counted by the settle poll itself: _bridgeEmptyHeals = ${sA._bridgeEmptyHeals}`);
  t += 200e3; apiAt = t - 10e3;
  acted = await W.tick();
  ok(acted.length === 0, 'after an EMPTY heal the silence doubles (200 s < 6 min ⇒ no heal yet) — a CLI whose requests print nothing is quiet, not dead');
  t += 200e3; apiAt = t - 10e3;
  acted = await W.tick();
  ok(acted.length === 1, '…and past the doubled silence it heals again');
  sA._bridgeCatchUp = null; sA._bridgeEmptyHeals = 0;
  t += 200e3; apiAt = t - 10e3; await W.tick(); sA._bridgeCatchUp = null;
  t += 200e3; apiAt = t - 10e3;
  acted = await W.tick();
  ok(acted.length === 0 && sA._bridgeHeals.length === 3 && lines.some((l) => /after 3 re-attaches this hour — not re-attaching again/.test(l)), 'the fourth in the hour is refused by the budget, and said once');
  const quietLines = lines.length;
  await W.tick();
  ok(lines.length === quietLines, '…said once, not every tick');
  W.stop();
  // verify r2 (L3): `session.deadBridgeMinutes` changed at RUNTIME — the watch re-reads it after every tick and re-arms
  // its interval (real timers: 0.034 min ⇒ a 2 s tick; then 3 min ⇒ 30 s — the 2 s cadence must stop at once)
  let minutes = 0.034, reads = 0;
  const W2 = BW.create({ activeSessions: new Map(), BUFFERS_DIR: BUFS, SOCKETS_DIR: SOCKS, procRoot: proc, selfPid: 500,
    serverSetting: (k) => { if (k === 'session.deadBridgeMinutes') reads++; return k === 'session.deadBridgeMinutes' ? minutes : undefined; },
    log: { log() { }, warn() { } }, reattachLocalPty: () => false });
  W2.start();
  await new Promise((r) => setTimeout(r, 5000));
  const r1 = reads;                       // start's arm + the intervals (tick + arm each) at 2 s and 4 s (a loaded box may slip one)
  minutes = 3;                            // ⇒ silence 180 s, tick 30 s: the next 2 s interval re-arms, then silence
  await new Promise((r) => setTimeout(r, 3000));
  const r2 = reads;                       // the one interval at 6 s that re-armed (2 s of slack)
  await new Promise((r) => setTimeout(r, 2500));
  const r3 = reads;                       // nothing: the 2 s interval is gone (a 30 s one fires at 36 s)
  W2.stop();
  ok(r1 >= 3 && r2 > r1 && r3 === r2, `the setting changed at runtime re-arms the watch: ${r1} reads in the first 5 s at a 2 s tick, ${r2 - r1} at the next tick (the re-arm), ${r3 - r2} in the 2.5 s after (the old cadence is gone)`);
}

// ── §F the wiring ──
console.log('\n§F the wiring');
{
  const SS = read('src/server/session-stdout.js');
  const fn = (/function reattachLocalPty\([\s\S]*?\n\}/.exec(SS) || [''])[0];
  ok(/onLocalReattach\?\.\(id, session, \{ why, kind, silentSince \}\)/.test(fn) && fn.indexOf('onLocalReattach') > fn.indexOf('setupSessionPty(session, id, newPty)'), 'THE ONE HEALER tells the watch after EVERY local re-attach (after the new pty is wired)');
  const UI = read('src/server/user-input.js');
  ok(/const neverSpoke = ptyQuietSince\(session, Number\(session\._ptyOpenedAt\) \|\| 0\);\n\s*reattachLocalPty\(sessionId, session, `Broken pty stdin detected \([^`]*`\);/.test(UI), 'the broken-stdin detector still heals through it (its orphans are ended too); WHAT is re-sent is the healer\'s — the inputs a bridge that never spoke was handed (verify r1: a connected client\'s queued input is read after it dies — a re-send doubled the message)');
  // B-c20d: the ONE typed-input write holds what a never-spoke bridge was handed; the ONE healer replays ALL of it, in order, and repaints a terminal
  ok(/^\s*try \{ writeSessionInput\(session, payloadLine\); \}/m.test(UI) && !/^\s*try \{ session\.pty\.write\(payloadLine/m.test(UI), 'B-c20d: the typing path writes through writeSessionInput (a never-spoke bridge HOLDS every input it is handed) — no direct pty write left');
  const iTake = fn.search(/^\s*const replay = takeHeldInputs\(session\);/m), iSetup = fn.indexOf('setupSessionPty(session, id, newPty)'), iPaint = fn.search(/^\s*repaintFromBuf\(id, session\);/m), iReplay = fn.search(/^\s*if \(replay\.length\) replayHeldInputs\(session, newPty, replay\);/m);
  ok(iTake > 0 && iSetup > iTake && iPaint > iSetup && iReplay > iPaint, 'B-c20d: the healer takes the held inputs BEFORE the new pty re-stamps the birth, repaints a terminal\'s .buf tail after wiring it, then replays every held input (the detector, the attach probe and the watch alike)', JSON.stringify({ iTake, iSetup, iPaint, iReplay }));
  ok(/function attachToDtach\([^)]*\) \{\n\s*const repaintClients = \(\) => \{ if \(repaint\) repaintFromBuf\(id, session\); \};/.test(SS), 'B-c20d: ONE repaint — the onExit ladder\'s re-attach and the healer share repaintFromBuf');
  ok(/createUserInputSender\(\{[^}]*reattachLocalPty, ptyQuietSince, writeSessionInput,/.test(read('server.js')), 'B-c20d: server.js hands the sender session-stdout\'s writeSessionInput (the default is a bare write)');
  // verify r2: anchored at the START of its line — a stamp commented out (`// session._ptyOpenedAt = …`) satisfied the unanchored pin (the 2.369.134 class)
  ok(/^\s*session\._ptyOpenedAt = Date\.now\(\);[^\n]*\n\s*ptyProcess\.onData\(\(\) => \{ session\._lastPtyDataAt = Date\.now\(\); \}\);/m.test(SS), 'every pty is stamped with its birth right beside the liveness stamp (the one place every pty is wired) — the statement, not a comment of it');
  const S = read('server.js');
  ok(/onLocalReattach: \(\.\.\.a\) => bridgeWatch\.afterReattach\(\.\.\.a\)/.test(S), 'server.js hands session-stdout the watch\'s afterReattach');
  ok(/const bridgeWatch = require\('\.\/src\/server\/bridge-watch\.js'\)\.create\(\{ activeSessions, BUFFERS_DIR, SOCKETS_DIR, reattachLocalPty, serverSetting, getOtelIngest: \(\) => otelIngest, feedPeerCard/.test(S), 'the watch is built from the one healer, the setting, the OTel witness and the card door');
  const iRestore = S.indexOf('restoreSessions(); bootBrowserKeeper()'), iSweep = S.indexOf('bridgeWatch.bootSweep(); bridgeWatch.start();');
  ok(iSweep > iRestore && /setTimeout\(\(\) => \{ try \{ bridgeWatch\.bootSweep\(\); bridgeWatch\.start\(\); \}/.test(S), 'the boot sweep runs AFTER the restore\'s attaches (attach first, then end the orphans)');
  const crash = (/process\.on\('uncaughtException', \(e\) => \{([\s\S]*?)\n\}\);/.exec(S) || [])[1] || '';
  ok(/bridgeWatch\.endAttachPtys\(\)/.test(crash) && crash.indexOf('endAttachPtys') < crash.indexOf('process.exit(1)'), 'THE CRASH PATH ends the attach clients like the clean shutdown (no orphan survives a crash)');
  const shut = (/function shutdownNow\(\) \{([\s\S]*?)\n\}/.exec(S) || [])[1] || '';
  ok(/bridgeWatch\.endAttachPtys\(\)/.test(shut) && !/s\.pty\.kill\(\)/.test(shut), 'the clean shutdown uses the SAME teardown (one implementation)');
  const CS = read('src/server/stdout/claude-stream-json.js');
  const iNote = CS.indexOf('noteStreamRecord?.(session, msg)'), iCu = CS.indexOf('session._bridgeCatchUp?.note?.(msg)');
  ok(iNote > 0 && iCu > iNote && iCu - iNote < 400, 'the claude parse counts every record into a running catch-up, right after the late rule saw it');
  const SCH = read('src/lib/settings-schema.js');
  ok(/'session\.deadBridgeMinutes': \{\s*type: 'number', default: 3, min: 0/.test(SCH), 'the setting is declared (default 3 minutes, 0 = off)');
  const OI = require(path.join(REPO, 'src/server/otel-ingest.js')).create({ dataDir: path.join(ROOT, 'otel'), PORT: 1, getUsageHistory: () => null, identityGroups: () => null, listAccounts: () => [], serverSetting: () => undefined });
  OI._ingest({ resourceLogs: [{ resource: { attributes: [] }, scopeLogs: [{ logRecords: [{ timeUnixNano: String(t0 * 1e6), attributes: [{ key: 'event.name', value: { stringValue: 'api_request' } }, { key: 'session.id', value: { stringValue: 'conv-x' } }] }] }] }] });
  ok(OI.lastApiRequestAt('conv-x') === t0 && OI.lastApiRequestAt('conv-y') === null, 'the OTel witness is kept for a row with no request id and no org (it still proves the CLI worked)');
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
