#!/usr/bin/env node
// EXIT FORENSICS (B-3052) — a session's death leaves a record that names its actor.
// §6 (B-f698): an UNEXPECTED exit while working is resumed ONCE by itself + one For-you item.
// §6d (lane exit-item-heal): a resume answers that item — read off the store, one pass per new live session.
//
// The 2026-09-24 incident: three chat sessions died in one 40 ms window and
// the journal held only `[session] exited <id> "<name>" mode=chat
// backend=claude` — no code, no signal. Four gaps, one leg each here:
//   ① chat-wrapper dropped node's SECOND exit argument (the signal): a CLI
//      killed by SIGTERM was "code null" and nothing else. pty-wrapper read
//      only node-pty's `exitCode` (a signal death is exitCode 0 + signal N).
//   ② neither wrapper handled SIGTERM/SIGHUP/SIGINT: a signalled wrapper died
//      by the default action, logged nothing, wrote nothing.
//   ③ the server's teardown kept the buffer .tail but UNLINKED the wrapper
//      meta — the one file that says whether the wrapper finalized.
//   ④ the line never said whether the dtach socket was still there.
// r2 (the verifier's reproductions, each red here before its fix):
//   ⑤ the record re-created <id>.json/<id>.buf the kill path had just unlinked
//      (the wrapper is SIGHUP'd ms AFTER the unlink) — §2b + §2c under dtach;
//   ⑥ "the child is untouched" was a ≤20 ms liveness race — §2 now reads what
//      the child RECEIVED against the handler-less baseline;
//   ⑦ the keeper/daemon sentinel said `code 0` for a killed CLI — §3c;
//   ⑧ the no-.buf tomb/sweep and the reconnect-window record had no leg — §4, §3b.
// r3:
//   ⑨ the THIRD wrapper (data/bin/codex-chat-wrapper.js) wrote no exit record
//      at all: every codex exit read `wrapper=unfinalized` (the SIGKILL fate)
//      and the new keeper's `signal` was dropped — every leg now runs it too;
//   ⑩ "a chat child receives nothing" was true only WITHOUT a controlling
//      terminal: under dtach every kind receives the kernel's SIGHUP — the
//      received-signals parity lives in §2c's dtach shape, and the fake CLI
//      COUNTS signals, so a forwarded SIGHUP is no longer indistinguishable
//      from the kernel's (the pty/SIGHUP forward control goes red now);
//   ⑪ the REAL-keeper leg has its control (mutant-copy `selfPath`).
// Every leg runs the REAL wrapper from this checkout against a fake child (a
// node script that prints one JSON line and sleeps) and feeds what the wrapper
// wrote into the REAL setupSessionPty teardown. Every product change has a
// NEGATIVE CONTROL: a patched copy (scripts/mutant-copy.mjs, outside the tree)
// with that one change removed must FAIL the same assertion.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { scratch } = await import(path.join(REPO, 'scripts/scratch.mjs'));
const { mutantCopies, copiesCensus } = await import(path.join(REPO, 'scripts/mutant-copy.mjs'));

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? `\n      ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');

const ROOT = scratch('exit-forensics');
const BUF = path.join(ROOT, 'buffers');
const TOMBS = path.join(ROOT, 'data', 'exit-tombs');
fs.mkdirSync(BUF, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'meta'), { recursive: true });
const liveKids = new Set();
const cleanup = () => {
  for (const pid of liveKids) { try { process.kill(pid, 'SIGKILL'); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

// The fake CLI: one stream-json line, then sleeps. It writes its own pid so the
// suite can signal IT (not the wrapper) — the wrapper passes env through.
// Options (env): VS_FAKE_TRAP=<file> records EVERY SIGTERM/SIGHUP/SIGINT it
// receives ("SIG <ms>" per line) and dies of the FIRST one by the default
// action 300 ms later — it COUNTS, so a SIGHUP a wrapper forwarded and the
// kernel's own pty SIGHUP are two lines, not one (the r2 fixture died on the
// first and could not tell them apart). It is the ONLY way to prove what the
// wrapper did to its child (a liveness sample races the pty hangup);
// VS_FAKE_STREAM=1 prints a line every 200 ms (a buffer write is always
// pending); VS_FAKE_EXIT=<n> exits with n after 300 ms;
// VS_FAKE_SENTINEL=<json> prints that line (a keeper/daemon _remote_exit) and
// exits 3, as the keeper's attach does after forwarding it; VS_FAKE_CODEX=1
// speaks app-server notifications (`thread/goal/cleared`, which the codex
// wrapper RECORDS into its buffer) instead of stream-json lines.
const CHILD = path.join(ROOT, 'fake-cli.js');
fs.writeFileSync(CHILD, `
const fs = require('fs');
const E = process.env;
fs.writeFileSync(E.VS_FAKE_PID_FILE, String(process.pid));
let firstSig = null;
if (E.VS_FAKE_TRAP) for (const s of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(s, () => {
  try { fs.appendFileSync(E.VS_FAKE_TRAP, s + ' ' + Date.now() + '\\n'); } catch {}
  if (firstSig) return;
  firstSig = s;
  setTimeout(() => { process.removeAllListeners(firstSig); process.kill(process.pid, firstSig); }, 300);
});
const line = (o) => { try { process.stdout.write(JSON.stringify(o) + '\\n'); } catch {} };
line(E.VS_FAKE_CODEX ? { method: 'thread/goal/cleared', params: {}, init: 'fake' } : { type: 'system', subtype: 'init', session_id: 'fake' });
if (E.VS_FAKE_SENTINEL) { line(JSON.parse(E.VS_FAKE_SENTINEL)); setTimeout(() => process.exit(3), 100); }
if (E.VS_FAKE_EXIT) setTimeout(() => process.exit(Number(E.VS_FAKE_EXIT)), 300);
let n = 0;
if (E.VS_FAKE_STREAM) setInterval(() => line(E.VS_FAKE_CODEX ? { method: 'thread/goal/cleared', params: {}, n: ++n } : { type: 'system', subtype: 'tick', n: ++n }), 200);
setInterval(() => {}, 1e6);
`);
// The suite's own env never leaks a remote mode into a leg that did not ask for one.
const BASE_ENV = { ...process.env };
for (const k of ['VIBESPACE_REMOTE_SID', 'VIBESPACE_REMOTE_RETRY', 'VIBESPACE_REMOTE_ATTEMPT']) delete BASE_ENV[k];

const M = mutantCopies('exit-forensics', REPO);
const REL = { chat: 'data/bin/chat-wrapper.js', pty: 'data/bin/pty-wrapper.js', codex: 'data/bin/codex-chat-wrapper.js' };
const CHAT = path.join(REPO, REL.chat);
const PTYW = path.join(REPO, REL.pty);
const CODEX = path.join(REPO, REL.codex);
const chatSrc = read(REL.chat);
const ptySrc = read(REL.pty);
const codexSrc = read(REL.codex);
const SRC = { chat: chatSrc, pty: ptySrc, codex: codexSrc };
const REAL = { chat: CHAT, pty: PTYW, codex: CODEX };
const KINDS = ['chat', 'pty', 'codex'];
// what each kind's fake CLI needs: the codex wrapper records app-server
// notifications (a stream-json line is not one), and never reads ~/.codex.
const KIND_ENV = { chat: {}, pty: {}, codex: { VS_FAKE_CODEX: '1', CODEX_HOME: path.join(ROOT, 'codex-home') } };
const BUF_MARK = { chat: '"init"', pty: '"init"', codex: 'goal_cleared' };
// A STREAMING child keeps a buffer write pending. Not for codex: every codex
// record re-arms its 200 ms META timer, and a timer that is due when the
// signal lands runs BEFORE the handler (node dispatches a signal in the
// loop's poll phase) and re-creates the unlinked meta through the ordinary
// persistMeta — a steady-state writer, pre-existing and outside the record
// (a few-ms window in production, the kill path's unlink-to-SIGHUP gap). The
// codex child records ONE line at start instead: its 1 s buffer write is
// still pending when the leg signals (~0.45 s), its meta timer long done.
const STREAM = (kind) => (kind === 'codex' ? {} : { VS_FAKE_STREAM: '1' });
const logOf = (kind) => path.join(BUF, `${kind === 'codex' ? 'codex-chat' : kind}-wrapper.log`);
const logSize = (kind) => { try { return fs.statSync(logOf(kind)).size; } catch { return 0; } };
const logSince = (kind, at) => { try { return fs.readFileSync(logOf(kind), 'utf8').slice(at); } catch { return ''; } };
const metaOf = (id) => { try { return JSON.parse(fs.readFileSync(path.join(BUF, id + '.json'), 'utf8')); } catch { return null; } };

let seq = 0;
/** Spawn a wrapper exactly as the server's dtach tail does
 *  (`node <wrapper> <buf> <meta> <cmd> [args…]`), wait for the fake CLI. */
async function runWrapper(kind, wrapperPath, { env = {}, extraArgs = [] } = {}) {
  const id = `sess-xf-${kind}-${++seq}`;
  const pidFile = path.join(ROOT, id + '.childpid');
  const at = logSize(kind);
  const proc = spawn(process.execPath, [wrapperPath, path.join(BUF, id + '.buf'), path.join(BUF, id + '.json'), process.execPath, CHILD, ...extraArgs],
    { cwd: ROOT, env: { ...BASE_ENV, VS_FAKE_PID_FILE: pidFile, ...KIND_ENV[kind], ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  liveKids.add(proc.pid);
  proc.stdout.on('data', () => { }); proc.stderr.on('data', () => { });
  const exited = new Promise((res) => proc.on('exit', (code, signal) => { liveKids.delete(proc.pid); res({ code, signal }); }));
  let childPid = 0;
  for (let i = 0; i < 200 && !childPid; i++) { await sleep(25); try { childPid = Number(fs.readFileSync(pidFile, 'utf8')) || 0; } catch { } }
  if (childPid) liveKids.add(childPid);
  await sleep(150); // the fake CLI's line reaches the wrapper
  return { id, proc, childPid, exited, at };
}
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const killChild = async (pid) => { if (!pid) return; try { process.kill(pid, 'SIGKILL'); } catch { } await childGone(pid); liveKids.delete(pid); };
const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25); } return !!fn(); };
const within = (p, ms = 8000) => Promise.race([p, sleep(ms).then(() => ({ timeout: true }))]);
// a dtach replay's wait for its wrapper and child to be GONE (mirror-193): the deadline for a process that never
// dies — never a sample instant; the idle box settles in ~0.3 s, a starved one in a few
const SETTLE_MS = 15000;
const childGone = async (pid) => { for (let i = 0; i < 80; i++) { try { process.kill(pid, 0); } catch { return true; } await sleep(25); } return false; };

// ── the REAL server teardown (setupSessionPty's onExit) ─────────────────────
const activeSessions = new Map();
const lines = [], events = [], frames = [];
global.__vsEvent = (name, detail) => events.push({ name, detail });
function makeEngine(modPath) {
  return require(modPath).create({
    rootDir: ROOT, BUFFERS_DIR: BUF, META_DIR: path.join(ROOT, 'meta'),
    DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: '', CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(),
    activeSessions, engine: {}, checkClaudeGoalStatus: () => { },
    broadcastToSession: (s, id, m) => frames.push({ id, ...m }), broadcastActiveSessions: () => { },
    noteModelSeen: () => { }, noteHarnessModels: () => { }, recordUsageAttribution: () => { },
    daemonPtyShim: (h) => h, agentEnv: () => process.env, sbSeenFirst: () => { },
    getDeviceMgr: () => null, getHosts: () => null, getUsageHistory: () => null, getTelemetry: () => null,
    getNoConvoRef: () => null, getDeliver: () => null, getPages: () => null, getPermissionRules: () => null,
  });
}
const realEng = makeEngine(path.join(REPO, 'src/server/session-stdout.js'));
/** Tear a session down through the real onExit; returns its "[session] exited" line. */
function teardown(eng, id, { socketPath = null, cleanupOnExit = true } = {}) {
  let exitCb = null;
  const duck = { pid: 1, onData() { }, onExit(cb) { exitCb = cb; }, write() { }, resize() { }, kill() { } };
  const session = { name: 'xf', mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath, cwd: ROOT };
  activeSessions.set(id, session);
  eng.setupSessionPty(session, id, duck, { cleanupOnExit });
  const orig = console.log;
  const mine = [];
  console.log = (...a) => { const s = a.join(' '); if (s.includes('[session] exited')) mine.push(s); else orig(...a); };
  try { exitCb({ exitCode: 0 }); } finally { console.log = orig; }
  lines.push(...mine);
  return mine.join('\n');
}

// ── § 0 THE PURE READER ─────────────────────────────────────────────────────
console.log('— §0 exitFacts: one reader for the line, the event and the tomb —');
const { exitFacts, tombExpired, EXIT_TOMB_MAX_AGE_MS } = require(path.join(REPO, 'src/exit-facts.js'));
{
  const a = exitFacts({ meta: { childExitCode: null, childExitSignal: 'SIGTERM' }, socketPath: '/s', socketExists: false });
  ok(a.wrapperFate === 'finalized' && a.signal === 'SIGTERM' && a.socketFate === 'gone' && a.suffix === ' signal=SIGTERM wrapper=finalized socket=gone',
    'a child killed by SIGTERM: signal named, wrapper finalized, socket gone', a);
  const b = exitFacts({ meta: { wrapperSignal: 'SIGHUP' }, socketPath: '/s', socketExists: true });
  ok(b.wrapperFate === 'signal:SIGHUP' && b.socketFate === 'present' && b.suffix === ' wrapper=signal:SIGHUP socket=present', 'a signalled wrapper: wrapper=signal:SIGHUP, no signal= field without a child signal', b);
  const c = exitFacts({ meta: { pid: 1, startedAt: 1 }, socketPath: null });
  ok(c.wrapperFate === 'unfinalized' && c.socketFate === 'none' && c.code === null, 'a meta with no exit record (SIGKILL) = unfinalized; no socket path = none', c);
  ok(exitFacts({ meta: null }).wrapperFate === 'unfinalized', 'an unreadable/missing meta = unfinalized');
  ok(exitFacts({ meta: { childExitCode: 0 } }).wrapperFate === 'finalized' && exitFacts({ meta: { childExitCode: 0 } }).code === 0, 'code 0 is a record (finalized), not a missing one');
  const d = exitFacts({ meta: { childExitCode: '1 reason=x', childExitSignal: 'SIGTERM\n[session] forged', wrapperSignal: 'rm -rf' } });
  ok(d.code === null && d.signal === null && d.wrapperSignal === null && !/forged|rm|reason/.test(d.suffix), 'a torn/hostile meta can never inject text into the journal line', d);
  ok(a.eventSuffix === '/signal=SIGTERM/wrapper=finalized/socket=gone', 'the telemetry event carries the same three facts', a.eventSuffix);
  const { awaitsWrapper, WRAPPER_SETTLE_MS } = require(path.join(REPO, 'src/exit-facts.js'));
  ok(awaitsWrapper({ pid: 77 }) && awaitsWrapper({ pid: 77, wrapperSignal: 'SIGHUP' }) && awaitsWrapper({ pid: 77, childExitCode: 5, wrapperSignal: 'SIGTERM' }),
    'awaitsWrapper: no record, or a wrapper-signal record (its buffer may still be flushing) ⇒ the teardown waits for that wrapper');
  ok(!awaitsWrapper({ pid: 77, childExitCode: null, childExitSignal: 'SIGTERM' }) && !awaitsWrapper(null) && !awaitsWrapper({}) && !awaitsWrapper({ pid: 1 }) && !awaitsWrapper({ pid: '77' }),
    'awaitsWrapper: a FINALIZED record, no meta, or no usable pid ⇒ read at once');
  ok(WRAPPER_SETTLE_MS === 300, 'the wait is bounded at 300 ms');
  ok(exitFacts({ meta: { pid: 9 }, wrapperRunning: true }).wrapperFate === 'running' && exitFacts({ meta: { wrapperSignal: 'SIGHUP' }, wrapperRunning: true }).wrapperFate === 'signal:SIGHUP',
    'wrapperFate "running" = no record AND the wrapper outlived the wait; a record always wins');
  const now = 1e12;
  ok(tombExpired(now - EXIT_TOMB_MAX_AGE_MS - 1, now) && !tombExpired(now - 6 * 86400e3, now) && EXIT_TOMB_MAX_AGE_MS === 7 * 86400e3, 'the tomb sweep rule: older than 7 days goes, 6 days stays');
  // The kb essays quote line fragments an incident reader will grep the
  // journal for — in the line's OWN order (` signal=` before ` wrapper=`,
  // src/exit-facts.js); a reversed fragment matches nothing.
  for (const doc of ['docs/kb-bugfix-invariants.md', 'docs/kb-file-structure.md']) {
    const rev = read(doc).match(/wrapper=(?:finalized|unfinalized|signal:SIG[A-Z0-9]+) signal=/g) || [];
    ok(rev.length === 0, `${doc}: every quoted exit-line fragment is in the line's order (signal= before wrapper=)`, rev);
  }
}

// ── § 1 the CHILD is killed by a signal ─────────────────────────────────────
// PRE-CHANGE STATUS (read off the old code): chat-wrapper finalize(null) →
// process.exit(null ?? 0) = 0; pty-wrapper onChildExit({exitCode: 0}) →
// process.exit(0) = 0 (node-pty reports a signal death as exitCode 0 +
// signal N). The change must not move either.
console.log('— §1 a CLI killed by SIGTERM: the wrapper names the signal, exit status unchanged (0) —');
async function childSigterm(kind, wrapperPath) {
  const r = await runWrapper(kind, wrapperPath);
  if (r.childPid) process.kill(r.childPid, 'SIGTERM');
  const ex = await within(r.exited);
  return { ...r, ex, meta: metaOf(r.id), log: logSince(kind, r.at) };
}
{
  const c = await childSigterm('chat', CHAT);
  ok(c.childPid > 0, 'chat: the fake CLI started under the real chat-wrapper');
  ok(c.meta?.childExitSignal === 'SIGTERM', 'chat: meta.childExitSignal === "SIGTERM"', c.meta);
  ok(/Child exited with code null signal SIGTERM/.test(c.log), 'chat: log "Child exited with code null signal SIGTERM"', c.log.slice(-400));
  ok(c.ex.code === 0 && c.ex.signal === null, 'chat: wrapper exit status 0 — the PRE-CHANGE status (finalize(null) → process.exit(null ?? 0))', c.ex);
  const line = teardown(realEng, c.id, { socketPath: path.join(ROOT, 'gone.sock') });
  ok(/ signal=SIGTERM wrapper=finalized socket=gone$/.test(line), 'chat → server line: "… signal=SIGTERM wrapper=finalized socket=gone"', line);
  ok(/^\[session\] exited sess-xf-chat-\d+ "xf" mode=terminal backend=shell signal=/.test(line), 'the existing fields keep their spelling and order (no code= for a null code, new fields AFTER)', line);
  ok(events.some((e) => e.name === 'session-exited' && e.detail.endsWith('/signal=SIGTERM/wrapper=finalized/socket=gone')), 'the session-exited event carries the same facts', events.slice(-2));
  ok(frames.some((f) => f.id === c.id && f.type === 'exited' && f.signal === 'SIGTERM'), 'the exited broadcast carries the signal', frames.filter((f) => f.id === c.id));

  const p = await childSigterm('pty', PTYW);
  ok(p.childPid > 0, 'pty: the fake CLI started under the real pty-wrapper (node-pty)');
  ok(p.meta?.childExitSignal === 'SIGTERM', 'pty: meta.childExitSignal === "SIGTERM" (node-pty\'s numeric signal named)', p.meta);
  ok(/Child exited with code 0 signal SIGTERM/.test(p.log), 'pty: log "Child exited with code 0 signal SIGTERM"', p.log.slice(-400));
  ok(p.ex.code === 0 && p.ex.signal === null, 'pty: wrapper exit status 0 — the PRE-CHANGE status (process.exit(exitCode) with node-pty\'s exitCode 0)', p.ex);
  const pl = teardown(realEng, p.id);
  ok(/ code=0 signal=SIGTERM wrapper=finalized socket=none$/.test(pl), 'pty → server line: "… code=0 signal=SIGTERM wrapper=finalized socket=none"', pl);

  // codex (r3): the third wrapper wrote NO exit record — `wrapper=unfinalized`
  // for every codex exit. PRE-CHANGE STATUS: finalizeExit(null) →
  // process.exit(null ?? 0) = 0; unchanged.
  const x = await childSigterm('codex', CODEX);
  ok(x.childPid > 0, 'codex: the fake app-server started under the real codex-chat-wrapper');
  ok(x.meta?.childExitCode === null && x.meta?.childExitSignal === 'SIGTERM', 'codex: meta {childExitCode: null, childExitSignal: "SIGTERM"}', x.meta);
  ok(/Child exited with code null signal SIGTERM/.test(x.log) && /session ended code=null signal=SIGTERM/.test(x.log), 'codex: log "Child exited with code null signal SIGTERM" + "session ended code=null signal=SIGTERM"', x.log.slice(-400));
  ok(x.ex.code === 0 && x.ex.signal === null, 'codex: wrapper exit status 0 — the PRE-CHANGE status (finalizeExit(null) → process.exit(null ?? 0))', x.ex);
  const xl = teardown(realEng, x.id, { socketPath: path.join(ROOT, 'gone.sock') });
  ok(/ signal=SIGTERM wrapper=finalized socket=gone$/.test(xl), 'codex → server line: "… signal=SIGTERM wrapper=finalized socket=gone" (was wrapper=unfinalized)', xl);

  // NEGATIVE CONTROLS: the second exit argument dropped again.
  const chatNoSig = chatSrc.replace('child.on(\'exit\', (exitCode, signal) => {', 'child.on(\'exit\', (exitCode) => { const signal = null;');
  ok(chatNoSig !== chatSrc, 'control (chat): the patch applies');
  const cc = await childSigterm('chat', M.write('data/bin/chat-wrapper.js', chatNoSig, 'nosig'));
  ok(cc.meta?.childExitSignal !== 'SIGTERM', 'control (chat): a copy that drops the exit signal FAILS the childExitSignal assertion', cc.meta);
  const ptyNoSig = ptySrc.replace('function onChildExit({ exitCode, signal }) {', 'function onChildExit({ exitCode }) { const signal = 0;');
  ok(ptyNoSig !== ptySrc, 'control (pty): the patch applies');
  const pc = await childSigterm('pty', M.write('data/bin/pty-wrapper.js', ptyNoSig, 'nosig'));
  ok(pc.meta?.childExitSignal !== 'SIGTERM', 'control (pty): a copy that drops node-pty\'s signal FAILS the childExitSignal assertion', pc.meta);
  const codexNoSig = codexSrc.replace("child.on('exit', (code, signal) => {", "child.on('exit', (code) => { const signal = null;");
  ok(codexNoSig !== codexSrc, 'control (codex): the patch applies');
  const xc = await childSigterm('codex', M.write(REL.codex, codexNoSig, 'nosig'));
  ok(xc.meta?.childExitSignal !== 'SIGTERM', 'control (codex): a copy that drops the exit signal FAILS the childExitSignal assertion', xc.meta);
  const codexNoRec = codexSrc.replace("  meta.childExitCode = code ?? null;\n  meta.childExitSignal = signal || null;", '');
  ok(codexNoRec !== codexSrc, 'control (codex record): the patch applies');
  const xr = await childSigterm('codex', M.write(REL.codex, codexNoRec, 'norecord'));
  ok(teardown(realEng, xr.id).endsWith(' wrapper=unfinalized socket=none'), 'control (codex record): a copy without the finalizeExit record reads wrapper=unfinalized — the r2 state of every codex exit');
  for (const r of [cc, pc, xc]) teardown(realEng, r.id);
}

// ── § 2 the WRAPPER is signalled ────────────────────────────────────────────
// "The child is untouched" is pinned by what the CHILD RECEIVED, not by a
// liveness sample: a pty child dies of the pty hangup within ~20 ms of its
// wrapper under ANY wrapper (the default action included), so a sample taken
// at the wrapper's exit event only measures that race. The fake CLI records
// every TERM/HUP/INT it gets (it COUNTS — see the fixture); the lane's record
// must equal what the SAME wrapper with the handler removed (= the pre-change
// default action) hands the child IN THE SAME SHAPE. This section's shape is
// stdio pipes with NO controlling terminal (not production): here a pipe
// child (chat, codex) receives nothing and a pty child receives the kernel's
// SIGHUP when the wrapper's pty master closes. The PRODUCTION shape is dtach
// (§2c), where every kind receives the kernel's SIGHUP.
console.log('— §2 a wrapper killed by SIGTERM/SIGHUP records it, still dies (128+signo), hands the child nothing new —');
let sigSeq = 0;
const readSigs = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => l.split(' ')[0]); } catch { return []; } };
async function wrapperSignal(kind, wrapperPath, sig, { trap = true } = {}) {
  const sigFile = trap ? path.join(ROOT, `sigs-${++sigSeq}.txt`) : null;
  const r = await runWrapper(kind, wrapperPath, { env: trap ? { VS_FAKE_TRAP: sigFile } : {} });
  process.kill(r.proc.pid, sig);
  const ex = await within(r.exited);
  if (trap) await sleep(500); // every signal the child will get lands (it dies 300 ms after the first)
  const out = { ...r, ex, meta: metaOf(r.id), log: logSince(kind, r.at), received: trap ? readSigs(sigFile) : [] };
  await killChild(r.childPid);
  return out;
}
const STATUS = { SIGTERM: 143, SIGHUP: 129 };
const HANDLER_LINE = 'for (const sig of Object.keys(WRAPPER_SIGNO)) process.on(sig, () => onWrapperSignal(sig));';
const NOHANDLER = {};
for (const kind of KINDS) {
  const patched = SRC[kind].replace(HANDLER_LINE, '');
  ok(patched !== SRC[kind], `control (${kind}): the handler line exists and the patch applies`);
  NOHANDLER[kind] = M.write(REL[kind], patched, 'nohandler');
}
const BASELINE = {}; // kind/sig → what the handler-less wrapper hands the child in this (pipe) shape
for (const kind of KINDS) {
  for (const sig of ['SIGTERM', 'SIGHUP']) {
    const w = await wrapperSignal(kind, REAL[kind], sig);
    ok(new RegExp(`wrapper received ${sig} \\(child pid ${w.childPid}, childDead=false\\)`).test(w.log), `${kind}/${sig}: log "wrapper received ${sig} (child pid <pid>, childDead=false)"`, w.log.slice(-400));
    ok(w.meta?.wrapperSignal === sig && typeof w.meta?.wrapperSignalAt === 'number', `${kind}/${sig}: meta.wrapperSignal === "${sig}" + wrapperSignalAt`, w.meta);
    ok(w.ex.code === STATUS[sig] && w.ex.signal === null, `${kind}/${sig}: the wrapper still dies, exit status ${STATUS[sig]} (128+signo — what a shell reports for the signal death)`, w.ex);
    const base = await wrapperSignal(kind, NOHANDLER[kind], sig);
    BASELINE[`${kind}/${sig}`] = base.received;
    if (kind === 'pty') ok(JSON.stringify(base.received) === '["SIGHUP"]', `pty/${sig}: BASELINE (handler removed = the default action): the child receives exactly one SIGHUP, the kernel's when the pty closes`, base.received);
    ok(JSON.stringify(w.received) === JSON.stringify(base.received), `${kind}/${sig}: the child receives exactly what the default action hands it in this shape (${JSON.stringify(w.received)}) — no forwarding, no new kill`, { lane: w.received, baseline: base.received });
    ok(!('childExitCode' in (w.meta || {})), `${kind}/${sig}: a child still running is not given an exit record`, w.meta);
    const line = teardown(realEng, w.id);
    ok(line.endsWith(` wrapper=signal:${sig} socket=none`), `${kind}/${sig} → server line: "… wrapper=signal:${sig} socket=none"`, line);
    teardown(realEng, base.id);
  }
}
// NEGATIVE CONTROLS: the handler line removed ⇒ the wrapper dies by the default action, nothing recorded.
for (const kind of KINDS) {
  const w = await wrapperSignal(kind, NOHANDLER[kind], 'SIGTERM');
  ok(!(w.meta?.wrapperSignal === 'SIGTERM' && /wrapper received SIGTERM/.test(w.log) && w.ex.code === 143),
    `control (${kind}): a copy without the handler FAILS the record assertions (dies ${JSON.stringify(w.ex)}, no log, no meta)`, { meta: w.meta, ex: w.ex });
  ok(teardown(realEng, w.id).endsWith(' wrapper=unfinalized socket=none'), `control (${kind}): …and the server line says wrapper=unfinalized — the pre-change blind spot`);
}
// NEGATIVE CONTROLS: a handler that FORWARDS the signal to the child is caught
// by the received-signals leg — for EVERY signal row, pty/SIGHUP included
// (the forwarded SIGHUP + the kernel's = two lines; the r2 fixture died on
// the first and this row stayed green under a forwarding copy).
const FORWARD = {};
for (const kind of KINDS) {
  const fwd = SRC[kind].replace('function onWrapperSignal(sig) {\n', 'function onWrapperSignal(sig) {\n  try { process.kill(child.pid, sig); } catch {}\n');
  ok(fwd !== SRC[kind], `control (${kind} forward): the patch applies`);
  FORWARD[kind] = M.write(REL[kind], fwd, 'forward');
  for (const sig of ['SIGTERM', 'SIGHUP']) {
    const w = await wrapperSignal(kind, FORWARD[kind], sig);
    ok(w.received.includes(sig) && JSON.stringify(w.received) !== JSON.stringify(BASELINE[`${kind}/${sig}`]),
      `control (${kind} forward ${sig}): a copy that forwards ${sig} FAILS the "child receives exactly the default action's signals" leg (${JSON.stringify(w.received)} vs ${JSON.stringify(BASELINE[`${kind}/${sig}`])})`, w.received);
    teardown(realEng, w.id);
  }
}

// ── § 2b THE RECORD NEVER CREATES A FILE ────────────────────────────────────
// The kill path (ws-handler's kill case; boot-restore's duplicate retire has
// the same shape) SIGTERMs the dtach master and unlinks <id>.json and <id>.buf
// in the SAME tick; the master's death hangs up the pty and the wrapper is
// SIGHUP'd a few ms LATER. A record that writes with writeFileSync re-creates
// both files as orphans (one pair per Terminate, until the 7-day boot sweep).
// So the record opens only files that still exist ('r+'), and creates the
// buffer only while the meta still exists (a first-2 s death keeps its tail).
console.log('— §2b the wrapper record never re-creates a file the server already removed —');
async function unlinkThenSignal(kind, wrapperPath, { unlink = true } = {}) {
  const r = await runWrapper(kind, wrapperPath, { env: STREAM(kind) });
  const json = path.join(BUF, r.id + '.json'), buf = path.join(BUF, r.id + '.buf');
  await sleep(250); // streaming: a buffer write is pending (the 2 s persist timer is armed)
  if (unlink) { try { fs.unlinkSync(json); } catch { } try { fs.unlinkSync(buf); } catch { } }
  process.kill(r.proc.pid, 'SIGHUP');
  const ex = await within(r.exited);
  await sleep(100);
  const out = { ...r, ex, json: fs.existsSync(json), buf: fs.existsSync(buf), bufText: (() => { try { return fs.readFileSync(buf, 'utf8'); } catch { return ''; } })(), log: logSince(kind, r.at) };
  await killChild(r.childPid);
  for (const f of [json, buf]) { try { fs.unlinkSync(f); } catch { } }
  return out;
}
const CREATE = {};
for (const kind of KINDS) {
  const wp = REAL[kind], src = SRC[kind];
  const u = await unlinkThenSignal(kind, wp);
  ok(/wrapper received SIGHUP/.test(u.log) && u.ex.code === 129, `${kind}: the handler ran with a buffer write pending (log line, exit 129)`, { ex: u.ex, log: u.log.slice(-300) });
  ok(!u.json && !u.buf, `${kind}: <id>.json and <id>.buf unlinked BEFORE the signal stay gone (no orphan pair)`, { json: u.json, buf: u.buf });
  ok(/record skipped: .*\.json is gone/.test(u.log), `${kind}: the log says the record was skipped because the meta is gone`, u.log.slice(-300));
  const k = await unlinkThenSignal(kind, wp, { unlink: false });
  ok(k.buf && k.bufText.includes(BUF_MARK[kind]) && k.json, `${kind}: …while the meta exists the same pending write IS flushed (a first-2 s death keeps its tail)`, { buf: k.buf, json: k.json });
  // the 'w' copy also LOGS whether the file existed when the handler opened it: the dtach control below is
  // meaningful only on a trial where the handler ran AFTER the kill path's unlink (mirror-193)
  const create = src.replace("fd = fs.openSync(file, 'r+');", "log(`ctl-open ${path.basename(file)} existed=${fs.existsSync(file)}`); fd = fs.openSync(file, 'w');");
  ok(create !== src, `control (${kind} create): the patch applies`);
  CREATE[kind] = M.write(REL[kind], create, 'create');
  const c = await unlinkThenSignal(kind, CREATE[kind]);
  ok(c.json || c.buf, `control (${kind} create): a copy whose record opens with 'w' FAILS the no-orphan assertion (re-created json=${c.json} buf=${c.buf})`);
}

// § 2c THE PRODUCTION SHAPE, under real dtach (the wrapper is dtach's session
// leader on a pty; its chat/codex child shares that controlling terminal).
//   kill  = the kill path itself: the dtach master SIGTERMed and the
//           socket/meta/buffer unlinked in one tick (ws-handler's order);
//   pkill = the wrapper itself SIGTERMed, files present (a pkill, a stop
//           without KillMode=process).
// The child's received signals are read against the handler-less wrapper in
// the SAME shape: here EVERY kind receives exactly the kernel's SIGHUP (the
// pty child from its pty master closing, a pipe child from the controlling
// terminal's hangup when the session leader exits) — a chat/codex CLI does
// NOT outlive its wrapper under dtach (the r2 essay said it did).
const HAS_DTACH = spawnSync('sh', ['-c', 'command -v dtach'], { stdio: 'ignore' }).status === 0;
function dtachMasterPid(sock) {
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let c = ''; try { c = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'); } catch { continue; }
    const argv = c.split('\0');
    if (/(^|\/)dtach$/.test(argv[0]) && argv.includes(sock)) return Number(d);
  }
  return 0;
}
async function dtachReplay(kind, wrapperPath, { mode = 'kill' } = {}) {
  const id = `sess-xf-${mode}-${kind}-${++seq}`;
  const sock = path.join(ROOT, id + '.sock'), json = path.join(BUF, id + '.json'), buf = path.join(BUF, id + '.buf');
  const pidFile = path.join(ROOT, id + '.childpid'), sigFile = path.join(ROOT, id + '.sigs');
  const at = logSize(kind);
  spawnSync('dtach', ['-n', sock, '-E', '-r', 'none', process.execPath, wrapperPath, buf, json, process.execPath, CHILD],
    { cwd: ROOT, env: { ...BASE_ENV, VS_FAKE_PID_FILE: pidFile, VS_FAKE_TRAP: sigFile, ...KIND_ENV[kind], ...STREAM(kind) }, stdio: 'ignore', timeout: 5000 });
  let childPid = 0;
  await waitFor(() => { try { childPid = Number(fs.readFileSync(pidFile, 'utf8')) || 0; } catch { } return childPid > 0; }, 5000);
  if (childPid) liveKids.add(childPid);
  await sleep(300); // streaming: a buffer write is pending, as in a live chat
  const wrapperPid = metaOf(id)?.pid || 0;
  const master = dtachMasterPid(sock);
  if (master) liveKids.add(master);
  if (mode === 'kill') {
    // THE KILL PATH (src/ws-handler.js kill case) — one synchronous tick: SIGTERM the master, unlink the socket, the
    // meta and the buffer. The record's hazard is the SIGHUP handler running AFTER that tick (the files are gone).
    // Spelled in the server's order, a starved box never produces it (mirror-193, measured): the SIGTERM wakes the
    // sleeping master on the SAME CPU, the scheduler preempts the sender for it, the master's exit SIGHUPs the
    // wrapper and it too preempts — the handler writes into the still-present files and only THEN does this process
    // run its unlinks (8 of 8 codex trials on one CPU beside two busy loops; the 'w' control then read
    // "re-created nothing" — the runner's flaky red). So the tick is CONSTRUCTED in the order it means: the
    // unlinks first, then the SIGTERM — the handler cannot run before the kill that triggers it. What can still
    // land between them is a pre-existing steady-state writer (a due persist timer): `afterUnlink` below catches it
    // and the trial is repeated (killTrial).
    for (const f of [sock, json, buf]) { try { fs.unlinkSync(f); } catch { } }
    try { process.kill(master, 'SIGTERM'); } catch { }
  } else {
    try { process.kill(wrapperPid, 'SIGTERM'); } catch { }
  }
  // THE TERMINAL SIGNALS, never a window (mirror-193; B-5f0b's rule): the files are final once the WRAPPER is
  // gone (it is their only writer here) and the received signals once the CHILD is (it records, then dies 300 ms
  // after its first signal). A fixed 800 ms read the 'w' control as "re-created nothing" on a starved runner —
  // the SIGHUP handler had not run yet. SETTLE_MS bounds only a process that never dies; `settledMs` says how
  // long the evidence took, `settled:false` that the deadline, not the process, ended the wait.
  const t0 = Date.now();
  const settled = await waitFor(() => !alive(wrapperPid) && !alive(childPid), SETTLE_MS);
  const log = logSince(kind, at);
  // WHICH ORDER THE TRIAL TOOK (mirror-193): the kill path unlinks in the same tick as the SIGTERM, but a starved box
  // can run the wrapper's SIGHUP handler BETWEEN the two — then the record lands in the file the unlink removes
  // next, and a "no orphan" verdict proves nothing. `afterUnlink` is the handler's own evidence that it ran after the
  // unlink: the real record's "record skipped: <id>.json is gone", the 'w' copy's "ctl-open <id>.json existed=false".
  const afterUnlink = mode === 'kill' ? (log.includes(`record skipped: ${id}.json is gone`) || log.includes(`ctl-open ${id}.json existed=false`)) : null;
  const out = { id, master, wrapperPid, childPid, settled, settledMs: Date.now() - t0, afterUnlink, json: fs.existsSync(json), buf: fs.existsSync(buf), meta: metaOf(id), wrapperAlive: alive(wrapperPid), childAlive: alive(childPid), received: readSigs(sigFile), log };
  for (const pid of [childPid, wrapperPid, master]) await killChild(pid);
  for (const f of [sock, json, buf]) { try { fs.unlinkSync(f); } catch { } }
  return out;
}
// A KILL-PATH TRIAL whose handler ran BEFORE the unlink is INCONCLUSIVE (the record went into a file the unlink then
// removed) — it is repeated, bounded, until one ran after the unlink; how many did not is said, and a run where
// none did FAILS by name (the precondition, not the product, is then what the leg could not establish).
const KILL_TRIALS = 8;
async function killTrial(kind, wrapperPath) {
  const skipped = [];
  for (let i = 0; i < KILL_TRIALS; i++) {
    const r = await dtachReplay(kind, wrapperPath);
    if (r.afterUnlink) return { ...r, inconclusive: skipped.length };
    skipped.push({ settledMs: r.settledMs, json: r.json, buf: r.buf, log: r.log.slice(-160) });
  }
  const last = await dtachReplay(kind, wrapperPath);   // reported whole (its fixture fields) when none was conclusive
  return last.afterUnlink ? { ...last, inconclusive: skipped.length } : { ...last, afterUnlink: false, inconclusive: skipped.length + 1, skipped };
}
if (!HAS_DTACH || !fs.existsSync('/proc/self/cmdline')) {
  console.log('  · SKIP §2c: no dtach binary or no /proc on this machine (evidence: `command -v dtach` / /proc/self/cmdline) — §2b holds the no-orphan rule without dtach');
} else {
  for (const kind of KINDS) {
    const k = await killTrial(kind, REAL[kind]);
    ok(k.master > 0 && k.wrapperPid > 0, `${kind} under dtach: fixture — the dtach master and the wrapper were found`, k);
    ok(/wrapper received SIGHUP/.test(k.log) && !k.wrapperAlive, `${kind} under dtach: the master's death SIGHUPs the wrapper AFTER the unlink and the handler runs`, k.log.slice(-300));
    ok(k.afterUnlink && !k.json && !k.buf, `${kind} under dtach: the kill path leaves no <id>.json / <id>.buf behind — on a trial whose handler ran AFTER the unlink ("record skipped"; ${k.inconclusive} earlier trial(s) ran it before)`, { json: k.json, buf: k.buf, afterUnlink: k.afterUnlink, skipped: k.skipped });
    const kb = await dtachReplay(kind, NOHANDLER[kind]);
    ok(JSON.stringify(kb.received) === '["SIGHUP"]' && !kb.childAlive, `${kind} under dtach, kill path, BASELINE (handler removed): the child receives exactly the kernel's SIGHUP and dies of it`, kb);
    ok(JSON.stringify(k.received) === JSON.stringify(kb.received) && !k.childAlive, `${kind} under dtach, kill path: the child receives exactly what the default action hands it (${JSON.stringify(k.received)})`, { lane: k.received, baseline: kb.received });
    const p = await dtachReplay(kind, REAL[kind], { mode: 'pkill' });
    ok(p.meta?.wrapperSignal === 'SIGTERM' && !p.wrapperAlive, `${kind} under dtach, wrapper SIGTERMed: the record is written (meta.wrapperSignal) and the wrapper dies`, p.meta);
    const pb = await dtachReplay(kind, NOHANDLER[kind], { mode: 'pkill' });
    ok(JSON.stringify(pb.received) === '["SIGHUP"]' && JSON.stringify(p.received) === JSON.stringify(pb.received) && !p.childAlive,
      `${kind} under dtach, wrapper SIGTERMed: the child receives the kernel's SIGHUP (session leader gone) — the same as the handler-less baseline`, { lane: p.received, baseline: pb.received });
    const pf = await dtachReplay(kind, FORWARD[kind], { mode: 'pkill' });
    ok(JSON.stringify(pf.received) !== JSON.stringify(pb.received), `control (${kind} forward, under dtach): a copy that forwards SIGTERM FAILS the dtach parity leg (${JSON.stringify(pf.received)})`, pf.received);
    const c = await killTrial(kind, CREATE[kind]);
    ok(c.afterUnlink && c.settled && (c.json || c.buf), `control (${kind} create, under dtach): the 'w' copy re-creates the files the kill path removed (json=${c.json} buf=${c.buf}, read ${c.settledMs} ms after the kill once the wrapper and the child were gone, on a trial whose handler opened AFTER the unlink; ${c.inconclusive} earlier trial(s) opened before it)`, { settled: c.settled, afterUnlink: c.afterUnlink, wrapperAlive: c.wrapperAlive, childAlive: c.childAlive, log: c.log.slice(-300), skipped: c.skipped });
  }
}

// § 2d THE INCIDENT'S ORDER, the REAL teardown fed at the socket's EOF (r4).
// In the 2026-09-24 shape the dtach MASTER dies first: its death EOFs the
// socket (the server's `dtach -a` attach client dies on that EOF, node-pty's
// onExit follows 2–4 ms later) and SIGHUPs the wrapper — two consequences of
// ONE event, racing. The r1–r3 teardown read the wrapper meta ONCE at onExit,
// so the record usually lost: `wrapper=unfinalized` (the SIGKILL fate) on the
// shape the feature exists for, and on the production storage class
// (fuse.bindfs: appendFileSync ≈ 3.5 ms, an 'r+' ftruncate-then-write readable
// half-done) a TORN read wrote the whole tomb as {metaMissing:true}. Here the
// observer is a raw socket connection that never writes; the REAL onExit runs
// AT the EOF instant (EOF+0 — earlier than node-pty ever delivers it, the
// adverse bound). The teardown now waits, bounded, for the wrapper the meta
// names (identity: its /proc cmdline carries the meta path) to be gone before
// its one read. The production latency is injected, not hoped for: SLOW = the
// same wrapper whose handler first spends 40 ms (the bindfs log append + the
// 800 KB buffer flush, compressed) — the lane server still reads the record;
// a server copy without the wait reads unfinalized (the control).
console.log('— §2d the incident\'s order: the teardown fed at the socket EOF still reads the wrapper\'s record —');
async function teardownAsync(eng, id, { socketPath = null, cleanupOnExit = true, waitMs = 1500 } = {}) {
  let exitCb = null;
  const duck = { pid: 1, onData() { }, onExit(cb) { exitCb = cb; }, write() { }, resize() { }, kill() { } };
  const session = { name: 'xf', mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath, cwd: ROOT };
  activeSessions.set(id, session);
  eng.setupSessionPty(session, id, duck, { cleanupOnExit });
  const orig = console.log;
  const mine = [];
  console.log = (...a) => { const s = a.join(' '); if (s.includes('[session] exited') && s.includes(id + ' ')) mine.push(s); else orig(...a); };
  try { exitCb({ exitCode: 0 }); await waitFor(() => mine.length > 0, waitMs); } finally { console.log = orig; }
  lines.push(...mine);
  return mine.join('\n');
}
async function incidentOrder(kind, wrapperPath, eng) {
  const id = `sess-xf-order-${kind}-${++seq}`;
  const sock = path.join(ROOT, id + '.sock'), json = path.join(BUF, id + '.json'), buf = path.join(BUF, id + '.buf');
  const pidFile = path.join(ROOT, id + '.childpid');
  spawnSync('dtach', ['-n', sock, '-E', '-r', 'none', process.execPath, wrapperPath, buf, json, process.execPath, CHILD],
    { cwd: ROOT, env: { ...BASE_ENV, VS_FAKE_PID_FILE: pidFile, ...KIND_ENV[kind], ...STREAM(kind) }, stdio: 'ignore', timeout: 5000 });
  let childPid = 0;
  await waitFor(() => { try { childPid = Number(fs.readFileSync(pidFile, 'utf8')) || 0; } catch { } return childPid > 0; }, 5000);
  if (childPid) liveKids.add(childPid);
  await sleep(300);
  const wrapperPid = metaOf(id)?.pid || 0;
  const master = dtachMasterPid(sock);
  if (master) liveKids.add(master);
  let lineP = null, eofAt = 0;
  const c = net.connect(sock);
  c.on('data', () => { }); c.on('error', () => { });
  const onEof = () => { if (lineP) return; eofAt = Date.now(); lineP = teardownAsync(eng, id, { socketPath: sock }); };
  c.on('end', onEof); c.on('close', onEof);
  await new Promise((r) => { c.once('connect', r); setTimeout(r, 1000); });
  await sleep(100);
  const killAt = Date.now();
  try { process.kill(master, 'SIGTERM'); } catch { } // the master alone, nothing unlinked: the incident's shape
  await waitFor(() => !!lineP, 3000);
  const line = lineP ? await lineP : '';
  let tomb = null; try { tomb = JSON.parse(fs.readFileSync(path.join(TOMBS, id + '.meta.json'), 'utf8')); } catch { }
  const out = { id, master, wrapperPid, line, tomb, eofMinusKill: eofAt - killAt, sockGone: !fs.existsSync(sock) };
  try { c.destroy(); } catch { }
  for (const pid of [childPid, wrapperPid, master]) await killChild(pid);
  for (const f of [sock, json, buf]) { try { fs.unlinkSync(f); } catch { } }
  return out;
}
if (!HAS_DTACH || !fs.existsSync('/proc/self/cmdline')) {
  console.log('  · SKIP §2d: no dtach binary or no /proc on this machine (evidence: `command -v dtach` / /proc/self/cmdline)');
} else {
  const SLOW = {};
  for (const kind of KINDS) {
    const slow = SRC[kind].replace('function onWrapperSignal(sig) {\n', 'function onWrapperSignal(sig) {\n  { const until = Date.now() + 40; while (Date.now() < until) { } }\n');
    ok(slow !== SRC[kind], `fixture (${kind} slow): the production-latency copy applies`);
    SLOW[kind] = M.write(REL[kind], slow, 'slow');
  }
  const stdoutSrc2 = read('src/server/session-stdout.js');
  const noWait = stdoutSrc2.replace('settleWrapperMeta(wrapperMetaPath, WRAPPER_SETTLE_MS, finishTeardown);', 'settleWrapperMeta(wrapperMetaPath, 0, finishTeardown);');
  ok(noWait !== stdoutSrc2, 'control (no wait): the patch applies (the teardown reads at once, as r1–r3 did)');
  const noWaitEng = makeEngine(M.write('src/server/session-stdout.js', noWait, 'nowait'));
  for (const kind of KINDS) {
    for (const [tag, wp] of [['lane', REAL[kind]], ['slow', SLOW[kind]]]) {
      const r = await incidentOrder(kind, wp, realEng);
      ok(r.master > 0 && r.wrapperPid > 0 && r.sockGone, `${kind}/${tag}: fixture — dtach master + wrapper found, the master's SIGTERM removed its socket (the teardown branch)`, r);
      ok(r.line.endsWith(' wrapper=signal:SIGHUP socket=gone'), `${kind}/${tag}: teardown AT the socket EOF (+${r.eofMinusKill} ms after the kill) → "… wrapper=signal:SIGHUP socket=gone"`, r.line);
      ok(r.tomb && !r.tomb.metaMissing && r.tomb.wrapperSignal === 'SIGHUP' && r.tomb.pid === r.wrapperPid && r.tomb.wrapperFate === 'signal:SIGHUP', `${kind}/${tag}: the tomb is the wrapper's whole meta WITH its record (never {metaMissing:true})`, r.tomb);
    }
    const c = await incidentOrder(kind, SLOW[kind], noWaitEng);
    ok(!c.line.endsWith(' wrapper=signal:SIGHUP socket=gone'), `control (${kind} no wait): a teardown that reads at once FAILS against the production-latency wrapper (${c.line.replace(/^.* wrapper=/, 'wrapper=')})`, c.line);
  }
  // THE WAIT'S EDGES: bounded, identity-checked, yields to a Terminate.
  {
    const live = await runWrapper('chat', CHAT);
    const t0 = Date.now();
    const line = await teardownAsync(realEng, live.id);
    const took = Date.now() - t0;
    let tomb = null; try { tomb = JSON.parse(fs.readFileSync(path.join(TOMBS, live.id + '.meta.json'), 'utf8')); } catch { }
    ok(line.endsWith(' wrapper=running socket=none') && took >= 280 && took < 1200 && tomb?.settleMs >= 280,
      `a wrapper still alive and unrecorded when the bound runs out: the teardown gave up after ${took} ms and says wrapper=running (not the SIGKILL fate)`, { line, took, settleMs: tomb?.settleMs });
    try { process.kill(live.proc.pid, 'SIGKILL'); } catch { }
    await within(live.exited); await killChild(live.childPid);
    const idN = 'sess-xf-notwrapper';
    fs.writeFileSync(path.join(BUF, idN + '.json'), JSON.stringify({ pid: process.pid }));
    ok(teardown(realEng, idN).endsWith(' wrapper=unfinalized socket=none'), 'a meta whose pid is alive but is NOT its wrapper (its /proc cmdline lacks the meta path — a recycled pid) is read at once: no wait');
    const idT = 'sess-xf-torn';
    fs.writeFileSync(path.join(BUF, idT + '.json'), '{"pid": 12, "childExitCo');
    const tl = await teardownAsync(realEng, idT);
    let tt = null; try { tt = JSON.parse(fs.readFileSync(path.join(TOMBS, idT + '.meta.json'), 'utf8')); } catch { }
    ok(tl.endsWith(' wrapper=unfinalized socket=none') && tt?.metaUnreadable === true && !tt.metaMissing && tt.settleMs >= 280, 'a meta that never parses is re-read until the bound, then the tomb says metaUnreadable (not metaMissing)', { tl, tt });
    const k = await runWrapper('chat', CHAT);
    const kp = teardownAsync(realEng, k.id, { waitMs: 800 });
    await sleep(50);
    activeSessions.delete(k.id); // the kill path's own teardown took the session during the wait
    ok((await kp) === '' && fs.existsSync(path.join(BUF, k.id + '.json')), 'a Terminate during the wait owns the teardown: no second line, no tomb, the files left to the kill path');
    try { process.kill(k.proc.pid, 'SIGKILL'); } catch { }
    await within(k.exited); await killChild(k.childPid);
    for (const f of ['.json', '.buf']) { try { fs.unlinkSync(path.join(BUF, k.id + f)); } catch { } }
    // CONTROLS: identity by pid alone / no ownership re-check after the wait.
    const byPid = stdoutSrc2.replace('  if (!HAS_PROC) { try { process.kill(pid, 0); return true; } catch { return false; } }', '  { try { process.kill(pid, 0); return true; } catch { return false; } }');
    ok(byPid !== stdoutSrc2, 'control (pid identity): the patch applies');
    fs.writeFileSync(path.join(BUF, idN + '-c.json'), JSON.stringify({ pid: process.pid }));
    const bl = await teardownAsync(makeEngine(M.write('src/server/session-stdout.js', byPid, 'bypid')), idN + '-c');
    ok(bl.endsWith(' wrapper=running socket=none'), 'control (pid identity): a copy that trusts a bare live pid waits on a stranger and names it "running"', bl);
    const noOwn = stdoutSrc2.replace('    if (activeSessions.get(id) !== session) return;\n', '');
    ok(noOwn !== stdoutSrc2, 'control (ownership): the patch applies');
    const k2 = await runWrapper('chat', CHAT);
    const kp2 = teardownAsync(makeEngine(M.write('src/server/session-stdout.js', noOwn, 'noown')), k2.id, { waitMs: 800 });
    await sleep(50);
    activeSessions.delete(k2.id);
    ok((await kp2) !== '', 'control (ownership): a copy without the re-check prints a second exit line for a session the kill path already took');
    try { process.kill(k2.proc.pid, 'SIGKILL'); } catch { }
    await within(k2.exited); await killChild(k2.childPid);
  }
}

// § 2e THE RECORD IS FIRST AND NEVER TORN (r4, the wrapper half). A spy
// preloaded into the wrapper (NODE_OPTIONS --require, inert in the fake CLI)
// marks the signal's arrival (prepended listener), every append to the wrapper
// log, and — after EVERY write/ftruncate on a meta fd opened 'r+' (the record's
// only open) — whether the meta file parses AT THAT INSTANT, which is what a
// concurrent reader could see between two syscalls. The meta on disk is first
// inflated past the wrapper's in-memory meta, so the record is SHORTER than
// the file it overwrites — the case a write-without-truncate leaves trailing
// garbage in. chat/codex write their in-memory meta, so a parseable inflation
// does it; the pty wrapper RE-READS the file first (a parseable inflation
// would be carried into a longer record and prove nothing about the pad), so
// its inflation is an UNPARSEABLE longer body — the torn periodic write its
// handler falls back to the in-memory meta over (r4 verifier, round 4).
console.log('— §2e the wrapper writes its record before anything else, and no instant of the write is unparseable —');
const SPY = path.join(ROOT, 'spy.cjs');
fs.writeFileSync(SPY, `
const fs = require('fs');
const OUT = process.env.VS_SPY_OUT, META = process.argv[3];
if (OUT && META && META.endsWith('.json') && String(process.argv[2]).endsWith('.buf')) {
  const oOpen = fs.openSync, oWrite = fs.writeSync, oTrunc = fs.ftruncateSync, oClose = fs.closeSync, oAppend = fs.appendFileSync, oRead = fs.readFileSync;
  const out = (s) => oAppend(OUT, s + '\\n');
  const fds = new Set();
  const note = (op) => { let v = 'gone'; try { const raw = oRead(META, 'utf8'); try { JSON.parse(raw); v = 'ok'; } catch { v = 'torn'; } } catch { } out('meta-' + op + ' ' + v); };
  fs.openSync = function (p, flags, ...r) { const fd = oOpen.call(fs, p, flags, ...r); if (p === META && flags === 'r+') { fds.add(fd); try { out('open-size ' + fs.fstatSync(fd).size); } catch { } } return fd; };
  fs.writeSync = function (fd, ...r) { const x = oWrite.call(fs, fd, ...r); if (fds.has(fd)) note('write'); return x; };
  fs.ftruncateSync = function (fd, ...r) { const x = oTrunc.call(fs, fd, ...r); if (fds.has(fd)) note('ftruncate'); return x; };
  fs.closeSync = function (fd, ...r) { fds.delete(fd); return oClose.call(fs, fd, ...r); };
  fs.appendFileSync = function (p, d, ...r) { if (String(p).endsWith('-wrapper.log')) out('log'); return oAppend.call(fs, p, d, ...r); };
  for (const s of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.prependListener(s, () => out('signal ' + s));
}
`);
// A SPIED TRIAL IS JUDGED ONLY IF THE HANDLER OPENED THE INFLATED FILE (mirror-193, the same class as the kill-path
// trials): the leg writes an inflated meta and THEN signals; on a starved box the wrapper's own steady-state meta
// writer (the codex wrapper's 200 ms timer, re-armed by the child's line) can land between the two and replace the
// inflated file with a normal one — the record then pads to nothing and the pad legs and their control read a
// machine's timing, not the record. The spy logs the size the handler's r+ open saw; a trial that did not see the
// inflation is repeated (bounded) and the count is said.
const SPY_TRIALS = 6;
async function spiedSignal(kind, wrapperPath) {
  let r = null, inconclusive = 0;
  for (let i = 0; i < SPY_TRIALS; i++) {
    r = await spiedSignalOnce(kind, wrapperPath);
    if (r.inflated && r.openSize > 4096) break;
    inconclusive++;
  }
  return { ...r, inconclusive };
}
async function spiedSignalOnce(kind, wrapperPath) {
  const spyOut = path.join(ROOT, `spy-${++sigSeq}.txt`);
  const r = await runWrapper(kind, wrapperPath, { env: { NODE_OPTIONS: `${BASE_ENV.NODE_OPTIONS || ''} --require ${SPY}`.trim(), VS_SPY_OUT: spyOut } });
  const json = path.join(BUF, r.id + '.json');
  const m0 = metaOf(r.id);
  if (m0) fs.writeFileSync(json, kind === 'pty'
    ? JSON.stringify(m0).slice(0, -1) + ',"xfInflate":"' + 'x'.repeat(4096)
    : JSON.stringify({ ...m0, xfInflate: 'x'.repeat(4096) }));
  process.kill(r.proc.pid, 'SIGHUP');
  const ex = await within(r.exited);
  let raw = ''; try { raw = fs.readFileSync(json, 'utf8'); } catch { }
  let meta = null; try { meta = JSON.parse(raw); } catch { }
  const ops = (() => { try { return fs.readFileSync(spyOut, 'utf8').trim().split('\n'); } catch { return []; } })();
  const after = ops.slice(Math.max(0, ops.findIndex((l) => l.startsWith('signal '))));
  const openLine = after.find((l) => l.startsWith('open-size '));
  await killChild(r.childPid);
  await teardownAsync(realEng, r.id);
  return { ex, raw, meta, ops: after.filter((l) => !l.startsWith('open-size ')), inflated: !!m0, openSize: openLine ? Number(openLine.split(' ')[1]) : 0 };
}
const handlerOf = (src) => src.slice(src.indexOf('function onWrapperSignal'), src.indexOf(HANDLER_LINE));
const RECEIVED_LOG = /\n {4}log\(`wrapper received \$\{sig\} \(child pid \$\{child \? child\.pid : null\}, childDead=\$\{childDead\}\)`\);\n/;
for (const kind of KINDS) {
  const w = await spiedSignal(kind, REAL[kind]);
  const firstWrite = w.ops.findIndex((l) => l.startsWith('meta-write')), firstLog = w.ops.indexOf('log');
  ok(w.inflated && w.ops[0]?.startsWith('signal SIGHUP') && firstWrite > 0 && w.ex.code === 129, `${kind}: fixture — the spy saw the signal and the record's write (exit 129)`, { ops: w.ops, ex: w.ex });
  ok(firstWrite > 0 && (firstLog < 0 || firstWrite < firstLog), `${kind}: the record is the handler's FIRST write — before the log append (${w.ops.slice(0, 4).join(' | ')})`, w.ops);
  ok(w.ops.filter((l) => l.startsWith('meta-')).every((l) => l.endsWith(' ok')), `${kind}: after every syscall of the record the meta parses (no torn instant)`, w.ops);
  ok(w.openSize > 4096 && w.meta?.wrapperSignal === 'SIGHUP' && !('xfInflate' in w.meta) && w.raw.length > JSON.stringify(w.meta).length, `${kind}: the record is SHORTER than the inflated file and still parses (space-padded, never truncated) — the handler opened the ${w.openSize}-byte inflated file (${w.inconclusive} earlier trial(s) did not)`, { len: w.raw.length, openSize: w.openSize, tail: JSON.stringify(w.raw.slice(-40)) });
  // CONTROLS: the r3 overwrite (ftruncate, then write) / a write with neither
  // pad nor truncate / the r3 order (the log line before the record).
  const src = SRC[kind];
  const r3Write = src.replace(/  try \{\n    let b = Buffer\.from\(data\);\n    if \(pad\) \{\n[\s\S]*?\n    fs\.writeSync\(fd, b, 0, b\.length, 0\);\n  \}/, '  try { const b = Buffer.from(data); fs.ftruncateSync(fd, 0); fs.writeSync(fd, b, 0, b.length, 0); }');
  ok(r3Write !== src, `control (${kind} r3 write): the patch applies`);
  const t = await spiedSignal(kind, M.write(REL[kind], r3Write, 'r3write'));
  ok(t.ops.some((l) => l.startsWith('meta-') && !l.endsWith(' ok')), `control (${kind} r3 write): ftruncate-then-write FAILS the no-torn-instant leg (${t.ops.filter((l) => l.startsWith('meta-')).join(' | ')})`, t.ops);
  const noPad = src.replace('      if (b.length < old) b = Buffer.concat([b, Buffer.alloc(old - b.length, 0x20)]);\n', '');
  ok(noPad !== src, `control (${kind} no pad): the patch applies`);
  const n = await spiedSignal(kind, M.write(REL[kind], noPad, 'nopad'));
  ok(n.inflated && n.openSize > 4096 && !n.meta, `control (${kind} no pad): a shorter record written over the longer file without padding leaves it unparseable (the handler opened the ${n.openSize}-byte file; ${n.inconclusive} earlier trial(s) did not)`, n.raw.slice(-60));
  const h = handlerOf(src);
  const logLine = h.match(RECEIVED_LOG)?.[0];
  const recAt = kind === 'pty' ? '\n    let m = meta;\n' : '\n    meta.wrapperSignal = sig;\n';
  const logFirst = logLine ? src.replace(h, h.replace(logLine, '\n').replace(recAt, logLine + recAt.slice(1))) : src;
  ok(logFirst !== src, `control (${kind} log first): the patch applies`);
  const f = await spiedSignal(kind, M.write(REL[kind], logFirst, 'logfirst'));
  const fw = f.ops.findIndex((l) => l.startsWith('meta-write')), fl = f.ops.indexOf('log');
  ok(fl >= 0 && fl < fw, `control (${kind} log first): the r3 order FAILS the record-first leg (${f.ops.slice(0, 4).join(' | ')})`, f.ops);
}

// ── § 3 SIGKILL: uncatchable ⇒ nothing recorded ⇒ unfinalized ───────────────
console.log('— §3 SIGKILL on the wrapper: nothing can be recorded; the server says wrapper=unfinalized —');
for (const kind of KINDS) {
  const w = await wrapperSignal(kind, REAL[kind], 'SIGKILL', { trap: false });
  ok(w.ex.signal === 'SIGKILL', `${kind}: the wrapper died by SIGKILL`, w.ex);
  ok(!/wrapper received/.test(w.log) && w.meta && !('wrapperSignal' in w.meta) && !('childExitCode' in w.meta), `${kind}: no log line, no wrapperSignal, no exit record in the meta`, w.meta);
  const line = teardown(realEng, w.id, { socketPath: path.join(ROOT, 'never.sock') });
  ok(line.endsWith(' wrapper=unfinalized socket=gone'), `${kind} → server line: "… wrapper=unfinalized socket=gone"`, line);
}
{
  // socket=present is reachable only where the teardown runs WITH the socket
  // still on disk: the cleanupOnExit:false path (with cleanup, a present socket
  // takes the detach/re-attach branch and never tears down).
  const sock = path.join(ROOT, 'present.sock'); fs.writeFileSync(sock, '');
  const id = 'sess-xf-present';
  fs.writeFileSync(path.join(BUF, id + '.json'), JSON.stringify({ pid: 1, childExitCode: 1 }));
  const line = teardown(realEng, id, { socketPath: sock, cleanupOnExit: false });
  ok(line.endsWith(' code=1 wrapper=finalized socket=present'), 'socket=present when the socket is still on disk at teardown (cleanupOnExit:false)', line);
  ok(fs.existsSync(path.join(BUF, id + '.json')) && !fs.existsSync(path.join(TOMBS, id + '.meta.json')), '…and that path keeps the meta and writes no tomb (unchanged)');
}

// ── § 3b THE REMOTE RECONNECT WINDOW: the child is already dead when the wrapper is signalled
// Only there can the record find `childDead && childExit` (outside remote mode
// a child exit finalizes synchronously): chat in OFFSET_MODE waits 1 s before
// re-spawning its transport, pty under VIBESPACE_REMOTE_RETRY likewise. A
// wrapper signalled in that window records the LAST child's exit beside its
// own signal.
console.log('— §3b a wrapper signalled in the remote reconnect window records the last child exit too —');
async function signalInReconnectWindow(kind, wrapperPath) {
  const opts = kind === 'chat'
    ? { env: { VS_FAKE_EXIT: '5' }, extraArgs: ['__VS_OFFSET__'] } // a literal __VS_OFFSET__ = OFFSET_MODE
    : kind === 'codex'
      ? { env: { VS_FAKE_EXIT: '5', VIBESPACE_REMOTE_SID: 'xf-codex-sid' } } // codex remote mode = VIBESPACE_REMOTE_SID
      : { env: { VS_FAKE_EXIT: '5', VIBESPACE_REMOTE_RETRY: '1' } };
  const r = await runWrapper(kind, wrapperPath, opts);
  const marker = kind === 'pty' ? /Child exited with code 5 / : /reconnect #1 in/;
  const inWindow = await waitFor(() => marker.test(logSince(kind, r.at)), 3000);
  process.kill(r.proc.pid, 'SIGTERM');
  const ex = await within(r.exited);
  const out = { ...r, ex, inWindow, meta: metaOf(r.id), log: logSince(kind, r.at) };
  await killChild(r.childPid);
  return out;
}
for (const kind of KINDS) {
  const wp = REAL[kind], src = SRC[kind];
  const w = await signalInReconnectWindow(kind, wp);
  ok(w.inWindow && new RegExp(`wrapper received SIGTERM \\(child pid \\d+, childDead=true\\)`).test(w.log), `${kind}: the transport exited 5, the wrapper was signalled INSIDE the reconnect window (childDead=true)`, w.log.slice(-400));
  ok(w.meta?.wrapperSignal === 'SIGTERM' && w.meta?.childExitCode === 5 && w.meta?.childExitSignal === null && w.ex.code === 143,
    `${kind}: meta = {wrapperSignal: SIGTERM, childExitCode: 5, childExitSignal: null}, exit 143`, { meta: w.meta, ex: w.ex });
  const line = teardown(realEng, w.id);
  ok(line.endsWith(' code=5 wrapper=signal:SIGTERM socket=none'), `${kind} → server line: "… code=5 wrapper=signal:SIGTERM socket=none"`, line);
  const noBlock = src.replace(/\n[ \t]*if \(childDead && childExit\) \{[\s\S]*?\n[ \t]*\}\n/, '\n');
  ok(noBlock !== src, `control (${kind} last-exit): the patch applies`);
  const c = await signalInReconnectWindow(kind, M.write(REL[kind], noBlock, 'nolastexit'));
  ok(!(c.meta?.childExitCode === 5), `control (${kind} last-exit): a copy without the "child already exited" block FAILS the childExitCode assertion`, c.meta);
  teardown(realEng, c.id);
}

// ── § 3c THE REMOTE SENTINEL carries the signal ──────────────────────────────
// Keeper-backed ssh chat and the daemon's R6 pipe sessions report the CLI's
// death through the {"type":"_remote_exit"} sentinel, written by a waiter that
// sees node's (code, signal). Both writers kept `code ?? 0` (every reader
// treats the sentinel's code as the exit — unchanged) and now ADD `signal`;
// chat-wrapper records it, so a CLI killed on the host reads `code=0
// signal=SIGTERM`, the same shape as node-pty's (a signal death there is
// exitCode 0 + a signal). A sentinel without `signal` (an older keeper or
// daemon still running on the host) records childExitSignal null: the line
// cannot tell a clean exit from a kill until that writer updates.
console.log('— §3c the _remote_exit sentinel names the signal; chat-wrapper records it —');
async function sentinelRun(wrapperPath, sentinel, kind = 'chat') {
  const r = await runWrapper(kind, wrapperPath, kind === 'codex'
    ? { env: { VS_FAKE_SENTINEL: JSON.stringify(sentinel), VIBESPACE_REMOTE_SID: 'xf-codex-sentinel' } }
    : { env: { VS_FAKE_SENTINEL: JSON.stringify(sentinel) }, extraArgs: ['__VS_OFFSET__'] });
  const ex = await within(r.exited);
  return { ...r, ex, meta: metaOf(r.id), log: logSince(kind, r.at) };
}
{
  const s1 = await sentinelRun(CHAT, { type: '_remote_exit', code: 0, signal: 'SIGTERM' });
  ok(s1.meta?.childExitCode === 0 && s1.meta?.childExitSignal === 'SIGTERM', 'a sentinel {code:0, signal:"SIGTERM"} ⇒ meta {childExitCode: 0, childExitSignal: "SIGTERM"}', s1.meta);
  ok(s1.ex.code === 0 && /remote session exited on host with code 0 signal SIGTERM/.test(s1.log), '…the wrapper exits 0 as before, and its log names the signal', { ex: s1.ex, log: s1.log.slice(-300) });
  const l1 = teardown(realEng, s1.id);
  ok(l1.endsWith(' code=0 signal=SIGTERM wrapper=finalized socket=none'), 'sentinel → server line: "… code=0 signal=SIGTERM wrapper=finalized socket=none"', l1);
  const s2 = await sentinelRun(CHAT, { type: '_remote_exit', code: 7 });
  ok(s2.meta?.childExitCode === 7 && s2.meta?.childExitSignal === null && s2.ex.code === 7, 'a sentinel without `signal` (an older writer) ⇒ code as sent, childExitSignal null — never invented', { meta: s2.meta, ex: s2.ex });
  teardown(realEng, s2.id);
  const wrongSig = chatSrc.replace('remoteExited !== null ? remoteExitSignal : signal', 'signal');
  ok(wrongSig !== chatSrc, 'control (sentinel signal): the patch applies');
  const c = await sentinelRun(M.write('data/bin/chat-wrapper.js', wrongSig, 'sentinelsig'), { type: '_remote_exit', code: 0, signal: 'SIGTERM' });
  ok(c.meta?.childExitSignal !== 'SIGTERM', 'control (sentinel signal): a copy that records the TRANSPORT\'s signal on the sentinel path FAILS the childExitSignal assertion', c.meta);
  teardown(realEng, c.id);

  // codex (r3): the SAME sentinel through the third wrapper (codex remote chat
  // rides the same keeper — src/ws-create.js).
  const x1 = await sentinelRun(CODEX, { type: '_remote_exit', code: 0, signal: 'SIGTERM' }, 'codex');
  ok(x1.meta?.childExitCode === 0 && x1.meta?.childExitSignal === 'SIGTERM' && x1.ex.code === 0 && /remote session ended \(code 0 signal SIGTERM/.test(x1.log),
    'codex: a sentinel {code:0, signal:"SIGTERM"} ⇒ meta {childExitCode: 0, childExitSignal: "SIGTERM"}, exit 0, the log names the signal', { meta: x1.meta, ex: x1.ex, log: x1.log.slice(-300) });
  ok(teardown(realEng, x1.id).endsWith(' code=0 signal=SIGTERM wrapper=finalized socket=none'), 'codex sentinel → server line: "… code=0 signal=SIGTERM wrapper=finalized socket=none"');
  const x2 = await sentinelRun(CODEX, { type: '_remote_exit', code: 7 }, 'codex');
  ok(x2.meta?.childExitCode === 7 && x2.meta?.childExitSignal === null && x2.ex.code === 7, 'codex: a sentinel without `signal` ⇒ code as sent, childExitSignal null', { meta: x2.meta, ex: x2.ex });
  teardown(realEng, x2.id);
  const xNoSig = codexSrc.replace("remoteExitSignal = (typeof msg.signal === 'string' && msg.signal) || null;", 'remoteExitSignal = null;');
  ok(xNoSig !== codexSrc, 'control (codex sentinel signal): the patch applies');
  const xc = await sentinelRun(M.write(REL.codex, xNoSig, 'sentinelsig'), { type: '_remote_exit', code: 0, signal: 'SIGTERM' }, 'codex');
  ok(xc.meta?.childExitSignal !== 'SIGTERM', 'control (codex sentinel signal): a copy that drops the sentinel\'s signal FAILS the childExitSignal assertion', xc.meta);
  teardown(realEng, xc.id);

  // END TO END with the REAL keeper, through BOTH chat wrappers: the
  // wrapper's transport is `vibespace-remote-keeper run <sid> __VS_OFFSET__ --
  // node <cli>` (what the ssh inner command runs on a host), the CLI SIGTERMs
  // itself. The keeper re-spawns ITSELF as its daemon by `__filename`, so its
  // control copy is written with mutant-copy's `selfPath` (require rebound,
  // __filename left the COPY's own — the default rebinding would hand the
  // daemon role back to the real, fixed file and judge it instead).
  const KEEPER = path.join(REPO, 'data/bin/vibespace-remote-keeper');
  const keeperSrc = read('data/bin/vibespace-remote-keeper');
  const keeperR1 = keeperSrc.replace("child.on('exit', (code, signal) => finalize(code, signal));", "child.on('exit', (code) => finalize(code));");
  ok(keeperR1 !== keeperSrc, 'control (keeper r1): the patch applies (the waiter drops node\'s signal again)');
  const KEEPER_R1 = M.write('data/bin/vibespace-remote-keeper', keeperR1, 'r1', { esm: false, selfPath: true });
  const cli = path.join(ROOT, 'self-term-cli.js');
  fs.writeFileSync(cli, `process.stdout.write(JSON.stringify({type:'system',subtype:'init',session_id:'k'})+'\\n'); setTimeout(() => process.kill(process.pid, 'SIGTERM'), 400); setInterval(() => {}, 1e6);`);
  let kseq = 0;
  async function keeperRun(kind, keeperPath) {
    const kdir = path.join(ROOT, `keeper-${++kseq}`); fs.mkdirSync(kdir, { recursive: true });
    const sid = `xfkeeper${kseq}`;
    const id = `sess-xf-keeper-${kind}-${++seq}`, at = logSize(kind);
    const proc = spawn(process.execPath, [REAL[kind], path.join(BUF, id + '.buf'), path.join(BUF, id + '.json'), process.execPath, keeperPath, 'run', sid, '__VS_OFFSET__', '--', process.execPath, cli],
      { cwd: ROOT, env: { ...BASE_ENV, ...KIND_ENV[kind], VIBESPACE_KEEPER_DIR: kdir, ...(kind === 'codex' ? { VIBESPACE_REMOTE_SID: sid } : {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
    liveKids.add(proc.pid); proc.stdout.on('data', () => { }); proc.stderr.on('data', () => { });
    const ex = await within(new Promise((res) => proc.on('exit', (code, signal) => { liveKids.delete(proc.pid); res({ code, signal }); })), 15000);
    let kmeta = null; try { kmeta = JSON.parse(fs.readFileSync(path.join(kdir, sid + '.json'), 'utf8')); } catch { }
    // The keeper's own processes outlive the wrapper BY DESIGN (the codex
    // wrapper exits on the sentinel while `run` drains for 400 ms and the
    // daemon for 300 ms) — measured: the last pair was still alive at the
    // suite's exit and the gate's reaper killed it. A suite ends what it
    // starts: wait them out here (bounded; anything past the bound is ours
    // and is killed), found by the scratch keeper dir in their environment.
    const stragglers = await keeperQuiesce(kdir);
    return { id, ex, meta: metaOf(id), kmeta, log: logSince(kind, at), stragglers };
  }
  function keeperPids(kdir) {
    const tag = `VIBESPACE_KEEPER_DIR=${kdir}\0`, out = [];
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d) || +d === process.pid) continue;
      try { if (fs.readFileSync(`/proc/${d}/environ`, 'latin1').includes(tag)) out.push(+d); } catch { }
    }
    return out;
  }
  async function keeperQuiesce(kdir, ms = 5000) {
    const t0 = Date.now();
    let left = keeperPids(kdir);
    while (left.length && Date.now() - t0 < ms) { await sleep(50); left = keeperPids(kdir); }
    for (const pid of left) { try { process.kill(pid, 'SIGKILL'); } catch { } }
    return left;
  }
  for (const kind of ['chat', 'codex']) {
    const k = await keeperRun(kind, KEEPER);
    ok(k.meta?.childExitCode === 0 && k.meta?.childExitSignal === 'SIGTERM' && k.ex.code === 0, `REAL keeper (${kind}): a CLI killed by SIGTERM on the host reaches the meta as {childExitCode: 0, childExitSignal: "SIGTERM"} (wrapper exit 0)`, { meta: k.meta, ex: k.ex, log: k.log.slice(-400) });
    ok(k.kmeta?.exited === 0 && k.kmeta?.exitSignal === 'SIGTERM', `REAL keeper (${kind}): the keeper's own meta says {exited: 0, exitSignal: "SIGTERM"}`, k.kmeta);
    const kl = teardown(realEng, k.id);
    ok(kl.endsWith(' code=0 signal=SIGTERM wrapper=finalized socket=none'), `REAL keeper (${kind}) → server line names the signal`, kl);
    const c = await keeperRun(kind, KEEPER_R1);
    ok(!c.ex?.timeout && c.kmeta?.exited === 0 && c.meta?.childExitSignal !== 'SIGTERM' && !('exitSignal' in c.kmeta), `control (keeper r1, ${kind}): the r1 keeper copy (its OWN daemon — selfPath) ran to its end and FAILS the childExitSignal assertion (a host-side kill reads as a clean exit)`, { ex: c.ex, meta: c.meta, kmeta: c.kmeta });
    ok(!k.stragglers.length && !c.stragglers.length, `REAL keeper + r1 control (${kind}): every keeper process the leg started is gone before the suite moves on (none killed past the bound)`, { real: k.stragglers, r1: c.stragglers });
    teardown(realEng, c.id);
  }
}

// ── § 4 THE TOMB PAIR + THE 7-DAY SWEEP ─────────────────────────────────────
console.log('— §4 the teardown keeps .tail AND .meta.json; the sweep removes both after 7 days —');
function tombTeardown(eng, id, metaObj) {
  fs.writeFileSync(path.join(BUF, id + '.buf'), 'line one\nline two: the stack trace lives here\n');
  if (metaObj) fs.writeFileSync(path.join(BUF, id + '.json'), JSON.stringify(metaObj));
  return teardown(eng, id, { socketPath: path.join(ROOT, id + '.sock') });
}
{
  const id = 'sess-xf-tomb-1';
  tombTeardown(realEng, id, { pid: 42, mode: 'chat', childExitCode: null, childExitSignal: 'SIGHUP' });
  const tail = path.join(TOMBS, id + '.tail'), mt = path.join(TOMBS, id + '.meta.json');
  ok(fs.existsSync(tail) && fs.readFileSync(tail, 'utf8').includes('stack trace'), 'the .tail is kept (2.206.1, unchanged)');
  let t = null; try { t = JSON.parse(fs.readFileSync(mt, 'utf8')); } catch { }
  ok(t && t.pid === 42 && t.childExitSignal === 'SIGHUP' && t.wrapperFate === 'finalized' && t.socketFate === 'gone' && typeof t.exitedAt === 'number',
    'the .meta.json tomb = the wrapper meta + {exitedAt, socketFate, wrapperFate}', t);
  ok(!fs.existsSync(path.join(BUF, id + '.json')) && !fs.existsSync(path.join(BUF, id + '.buf')), 'the live meta + buffer are still unlinked (as before)');
  const id0 = 'sess-xf-tomb-nometa';
  tombTeardown(realEng, id0, null);
  let t0 = null; try { t0 = JSON.parse(fs.readFileSync(path.join(TOMBS, id0 + '.meta.json'), 'utf8')); } catch { }
  ok(t0 && t0.metaMissing === true && t0.wrapperFate === 'unfinalized', 'no wrapper meta at all ⇒ the tomb still says so (metaMissing, unfinalized)', t0);

  // backdate tomb-1 past 7 days, tomb-nometa to 6 days; the NEXT teardown sweeps.
  const old = (Date.now() - 8 * 86400e3) / 1000, six = (Date.now() - 6 * 86400e3) / 1000;
  for (const f of [tail, mt]) fs.utimesSync(f, old, old);
  for (const ext of ['.tail', '.meta.json']) fs.utimesSync(path.join(TOMBS, id0 + ext), six, six);
  tombTeardown(realEng, 'sess-xf-tomb-2', { pid: 43, childExitCode: 0 });
  ok(!fs.existsSync(tail) && !fs.existsSync(mt), 'the sweep removes BOTH files of a tomb older than 7 days');
  ok(fs.existsSync(path.join(TOMBS, id0 + '.tail')) && fs.existsSync(path.join(TOMBS, id0 + '.meta.json')), '…and keeps a 6-day-old pair');
  ok(fs.existsSync(path.join(TOMBS, 'sess-xf-tomb-2.meta.json')) && !fs.readdirSync(TOMBS).some((f) => f.includes('.tmp-')), 'the new tomb is written atomically (no .tmp- left behind)');

  // NO .buf AT ALL: the meta tomb and the sweep still run (they used to live
  // inside the .buf try — a session whose buffer was never written lost both).
  const noBufTeardown = (eng, id, oldPair) => {
    fs.writeFileSync(path.join(BUF, id + '.json'), JSON.stringify({ pid: 46, childExitCode: null, childExitSignal: 'SIGTERM' }));
    try { fs.unlinkSync(path.join(BUF, id + '.buf')); } catch { }
    for (const f of oldPair) { fs.writeFileSync(f, 'x'); fs.utimesSync(f, old, old); }
    return teardown(eng, id, { socketPath: path.join(ROOT, id + '.sock') });
  };
  const oldPairOf = (tag) => [path.join(TOMBS, `sess-xf-old-${tag}.tail`), path.join(TOMBS, `sess-xf-old-${tag}.meta.json`)];
  {
    const id = 'sess-xf-tomb-nobuf', pair = oldPairOf('nobuf');
    const line = noBufTeardown(realEng, id, pair);
    let t = null; try { t = JSON.parse(fs.readFileSync(path.join(TOMBS, id + '.meta.json'), 'utf8')); } catch { }
    ok(!fs.existsSync(path.join(TOMBS, id + '.tail')) && t && t.childExitSignal === 'SIGTERM' && t.wrapperFate === 'finalized' && t.socketFate === 'gone',
      'no <id>.buf: no .tail, but the .meta.json tomb is still written (wrapperFate/socketFate)', { t, line });
    ok(pair.every((f) => !fs.existsSync(f)), 'no <id>.buf: the same teardown still sweeps an 8-day-old pair');
  }

  // NEGATIVE CONTROLS on the server: patched copies of session-stdout.js.
  const stdoutSrc = read('src/server/session-stdout.js');
  {
    const CATCH = '      } catch { /* no buffer / read failed — nothing to keep */ }\n';
    const SWEEP_END = '      } catch {}\n      try { fs.unlinkSync(path.join(BUFFERS_DIR, id + \'.buf\')); } catch {}\n';
    const inside = stdoutSrc.includes(CATCH) && stdoutSrc.includes(SWEEP_END)
      ? stdoutSrc.replace(CATCH, '').replace(SWEEP_END, '      } catch {}\n' + CATCH + '      try { fs.unlinkSync(path.join(BUFFERS_DIR, id + \'.buf\')); } catch {}\n') : stdoutSrc;
    ok(inside !== stdoutSrc, 'control (no-buf): the patch applies (tomb write + sweep moved back inside the .buf try)');
    const id = 'sess-xf-tomb-nobuf-ctl', pair = oldPairOf('nobuf-ctl');
    noBufTeardown(makeEngine(M.write('src/server/session-stdout.js', inside, 'bufcatch')), id, pair);
    ok(!fs.existsSync(path.join(TOMBS, id + '.meta.json')) && pair.every((f) => fs.existsSync(f)),
      'control (no-buf): a copy with both back inside the .buf try FAILS both no-.buf assertions (no tomb, no sweep)');
    for (const f of pair) { try { fs.unlinkSync(f); } catch { } }
  }
  const noTomb = stdoutSrc.replace('fs.writeFileSync(tmp, JSON.stringify(tomb)); fs.renameSync(tmp, tombPath);', '');
  ok(noTomb !== stdoutSrc, 'control (tomb): the patch applies');
  tombTeardown(makeEngine(M.write('src/server/session-stdout.js', noTomb, 'notomb')), 'sess-xf-tomb-ctl', { pid: 44, childExitCode: 0 });
  ok(!fs.existsSync(path.join(TOMBS, 'sess-xf-tomb-ctl.meta.json')), 'control (tomb): a copy without the meta tomb write FAILS the tomb assertion');
  const noSweep = stdoutSrc.replace('if (tombExpired(s.mtimeMs, now)) fs.unlinkSync', 'if (false) fs.unlinkSync');
  ok(noSweep !== stdoutSrc, 'control (sweep): the patch applies');
  for (const ext of ['.tail', '.meta.json']) fs.utimesSync(path.join(TOMBS, 'sess-xf-tomb-2' + ext), old, old);
  tombTeardown(makeEngine(M.write('src/server/session-stdout.js', noSweep, 'nosweep')), 'sess-xf-tomb-ctl2', { pid: 45 });
  ok(fs.existsSync(path.join(TOMBS, 'sess-xf-tomb-2.meta.json')), 'control (sweep): a copy without the sweep rule FAILS the removal assertion');
  const noSuffix = stdoutSrc.replace("${exitReason ? ' reason=' + exitReason : ''}${facts.suffix}`", "${exitReason ? ' reason=' + exitReason : ''}`");
  ok(noSuffix !== stdoutSrc, 'control (line): the patch applies');
  fs.writeFileSync(path.join(BUF, 'sess-xf-line-ctl.json'), JSON.stringify({ childExitSignal: 'SIGTERM' }));
  const ctlLine = teardown(makeEngine(M.write('src/server/session-stdout.js', noSuffix, 'nosuffix')), 'sess-xf-line-ctl');
  ok(!/wrapper=/.test(ctlLine), 'control (line): a copy without the facts suffix prints the pre-change line (no wrapper=/socket=)', ctlLine);
}

// ── § 6 AN UNEXPECTED EXIT IS RESUMED ONCE, BY ITSELF (B-f698) ──────────────
// Owner 2026-10-02: a chat conversation that exits while WORKING, without a kill the
// user or VibeSpace asked for, is resumed ONCE (nothing sent into it — no bill) and
// the owner gets ONE For-you item; a second unexpected exit only notifies. The rule
// is PURE (exit-facts unexpectedExitVerdict); src/server/unexpected-exit.js asks ONE
// client to run the sidebar's own resume and files the item once the outcome is known.
// Pre-fix (b924041f) the same teardown broadcast `exited` and nothing else.
console.log('— §6 B-f698: an unexpected exit while working is resumed once by itself + one For-you item —');
{
  const XF = require(path.join(REPO, 'src/exit-facts.js'));
  const V = (o) => XF.unexpectedExitVerdict({ mode: 'chat', midTurn: true, conversationId: 'c1', now: 1e12, ...o });
  const F = (meta, extra) => ({ ...XF.exitFacts({ meta, socketPath: '/s', socketExists: false }), ...extra });
  const act = (v) => `${v.action}/${v.why}`;
  ok(act(V({ facts: F({ childExitCode: 1 }) })) === 'respawn/first', 'pure: a working chat whose CLI exited code 1 ⇒ respawn (the first time)');
  ok(act(V({ facts: F({ childExitCode: null, childExitSignal: 'SIGKILL' }) })) === 'respawn/first' && act(V({ facts: F({ wrapperSignal: 'SIGHUP' }) })) === 'respawn/first',
    'pure: a child killed by a signal, or a signalled wrapper (the 09-24 shape) ⇒ respawn');
  ok(act(V({ facts: F({ childExitCode: 0 }) })) === 'null/clean' && act(V({ midTurn: false, facts: F({ childExitCode: 1 }) })) === 'null/idle' && act(V({ mode: 'terminal', facts: F({ childExitCode: 1 }) })) === 'null/not-chat',
    'pure: code 0, an idle conversation, a terminal ⇒ nothing');
  ok(act(V({ facts: F({ pid: 9 }) })) === 'respawn/first' && act(V({ remote: true, facts: F({ pid: 9 }) })) === 'null/remote' && act(V({ facts: F({ pid: 9 }, { wrapperFate: 'running' }) })) === 'null/wrapper-running',
    'pure: no record on a LOCAL session (SIGKILL class, socket gone) ⇒ respawn; no record on a REMOTE one, or a wrapper still running ⇒ nothing (a CLI that may still run is never resumed beside)');
  ok(act(V({ askedBy: 'interrupt', facts: F({ childExitCode: 130 }) })) === 'null/asked:interrupt' && act(V({ askedBy: 'terminate', facts: F({ wrapperSignal: 'SIGHUP' }) })) === 'null/asked:terminate',
    'pure: an exit VibeSpace asked for (the Stop\'s SIGINT, Terminate) ⇒ nothing');
  ok(act(V({ respawnedAt: 1e12 - 3600e3, facts: F({ childExitCode: 1 }) })) === 'notify/again' && act(V({ respawnedAt: 1e12 - XF.RESPAWN_ONCE_MS - 1, facts: F({ childExitCode: 1 }) })) === 'respawn/first'
    && act(V({ conversationId: null, facts: F({ childExitCode: 1 }) })) === 'notify/no-conversation', 'pure: respawned within 24 h ⇒ notify only; a day later ⇒ respawn; no conversation id ⇒ notify');
  const now = 5e12;
  const fa = XF.exitFacts({ meta: { childExitCode: 130 }, asked: { by: 'interrupt', at: now - 2000 }, now });
  const fs2 = XF.exitFacts({ meta: { childExitCode: 130 }, asked: { by: 'interrupt', at: now - XF.EXIT_ASK_FRESH_MS - 1 }, now });
  const fh = XF.exitFacts({ meta: { childExitCode: 1 }, asked: { by: 'x\n[session] forged', at: now }, now });
  ok(fa.askedBy === 'interrupt' && fa.suffix === ' wrapper=finalized socket=none asked=interrupt' && fa.eventSuffix.endsWith('/asked=interrupt') && fs2.askedBy === null && !/asked/.test(fs2.suffix) && fh.askedBy === null && !/forged/.test(fh.suffix),
    'the exit line names the actor (asked=<by>) for 30 s; a stale or hostile mark says nothing', { fa: fa.suffix, fs2: fs2.suffix, fh: fh.suffix });

  // the REAL teardown + the REAL orchestrator, a fake store + clients
  const UE = require(path.join(REPO, 'src/server/unexpected-exit.js'));
  const filed = [];
  const userTodos = { add: (key, o) => { filed.push({ key, ...o }); return { id: 'u' + filed.length }; } };
  const mkClient = () => ({ readyState: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); } });
  let others = [];
  const reinstall = (o = {}) => UE.install({ userTodos, sessionKeyFor: (s) => 'claude:' + (s.claudeSessionId || 'none'), activeSessions, clients: () => others, log: { log() { }, warn() { } }, tickMs: 20, landMs: 400, ...o });
  let seq = 0;
  function chatExit(eng, { cid = 'conv-' + (++seq), meta = { childExitCode: 1 }, streaming = true, bg = 0, host = null, asked = null, attached = null, ask = null } = {}) {
    const id = 'xf-ue-' + (++seq);
    if (meta) fs.writeFileSync(path.join(BUF, id + '.json'), JSON.stringify(meta));
    let exitCb = null;
    const duck = { pid: 1, onData() { }, onExit(cb) { exitCb = cb; }, write() { }, resize() { }, kill() { } };
    const session = { name: 'ue ' + seq, mode: 'chat', backend: 'claude', claudeSessionId: cid, clients: new Map(attached ? [[attached, {}]] : []), buffer: '', socketPath: null, cwd: ROOT, host };
    activeSessions.set(id, session);
    eng.setupSessionPty(session, id, duck);
    session._isStreaming = streaming;
    if (bg) session._normalizer = { listeners: [], backgroundTasks: () => Array.from({ length: bg }, (_, i) => ({ id: 't' + i })) };
    if (asked) session._exitAsked = asked;
    if (ask) ask(session, id);
    const orig = console.log; const mine = [];
    console.log = (...a) => { const s = a.join(' '); if (s.includes('[session] exited')) mine.push(s); else orig(...a); };
    try { exitCb({ exitCode: 0 }); } finally { console.log = orig; }
    return { id, cid, session, line: () => mine.join('\n') };
  }
  const land = (cid) => activeSessions.set('xf-ue-live-' + cid, { mode: 'chat', backend: 'claude', claudeSessionId: cid, clients: new Map() });
  const runLegs = async (eng, tag) => {
    filed.length = 0; reinstall();
    const mine = mkClient(), other = mkClient(); others = [other, mine];
    // ① working, code 1: ONE client — the one that had it open — is asked; the item waits for the outcome
    const a = chatExit(eng, { attached: mine });
    await waitFor(() => !activeSessions.has(a.id) && (mine.sent.length || other.sent.length), 1500);
    const asked1 = mine.sent.filter((m) => m.type === 'unexpected-exit-respawn');
    const r1 = { asked: asked1.length, other: other.sent.length, keys: asked1[0] ? Object.keys(asked1[0]).join(',') : '', target: asked1[0]?.session, filedBefore: filed.length };
    land(a.cid);
    await waitFor(() => filed.length > 0, 1500);
    r1.item = filed[0] || null;
    // ② the same conversation exits unexpectedly AGAIN: no ask, one "again" item
    const before = mine.sent.length + other.sent.length; filed.length = 0;
    activeSessions.delete('xf-ue-live-' + a.cid);
    chatExit(eng, { cid: a.cid, attached: mine });
    await waitFor(() => filed.length > 0, 1500);
    const r2 = { asks: mine.sent.length + other.sent.length - before, item: filed[0] || null };
    // ③ the Stop's SIGINT: asked ⇒ the line names it, nothing asked, nothing filed
    filed.length = 0; const b3 = mine.sent.length + other.sent.length;
    const c = chatExit(eng, { meta: { childExitCode: null, childExitSignal: 'SIGINT' }, attached: mine, asked: { by: 'interrupt', at: Date.now() } });
    await sleep(120);
    const r3 = { line: c.line(), asks: mine.sent.length + other.sent.length - b3, filed: filed.length };
    // ④ idle (between turns, nothing in flight) ⇒ nothing; ⑤ idle but background tasks live ⇒ respawn
    const d = chatExit(eng, { streaming: false, attached: mine });
    await sleep(120);
    const r4 = { asks: mine.sent.filter((m) => m.session?.backendSessionId === d.cid).length, filed: filed.length };
    const e = chatExit(eng, { streaming: false, bg: 2, attached: mine });
    await waitFor(() => mine.sent.some((m) => m.session?.backendSessionId === e.cid), 1500);
    const r5 = { asks: mine.sent.filter((m) => m.session?.backendSessionId === e.cid).length };
    land(e.cid); await waitFor(() => filed.length > 0, 1500); filed.length = 0;
    // ⑥ no client open: it WAITS, and the first client to appear is asked
    others = [];
    const f = chatExit(eng, {});
    await sleep(150);
    const late = mkClient(); others = [late];
    await waitFor(() => late.sent.length > 0, 1500);
    const r6 = { waited: filed.length === 0, askedLate: late.sent.filter((m) => m.session?.backendSessionId === f.cid).length };
    land(f.cid); await waitFor(() => filed.length > 0, 1500); filed.length = 0;
    // ⑦ asked, never came up ⇒ ONE "did not work" item after landMs
    const g = chatExit(eng, { attached: mine });
    await waitFor(() => filed.length > 0, 2500);
    const r7 = { item: filed[0] || null, cid: g.cid };
    return { r1, r2, r3, r4, r5, r6, r7 };
  };
  const H = await runLegs(realEng, 'head');
  const { r1, r2, r3, r4, r5, r6, r7 } = H;
  ok(r1.asked === 1 && r1.other === 0 && r1.keys === 'type,session' && r1.target && r1.target.backendSessionId && r1.target.serverId && r1.target.mode === 'chat' && r1.filedBefore === 0,
    '① working + code 1: exactly ONE client is asked — the one that had it open — with the resume target only (no text, nothing for its stdin); no item before the outcome', r1);
  ok(!!r1.item && /^"ue \d+" exited unexpectedly at \d\d:\d\d and was restarted; say continue if you need it$/.test(r1.item.text) && r1.item.origin === 'agent' && r1.item.key === 'claude:' + r1.target.backendSessionId
    && r1.item.i18n?.text?.key === UE.TEXTS.respawned && /no turn was billed/.test(r1.item.detail) && /code=1 wrapper=finalized/.test(r1.item.detail),
    '…once a live session carries it again: ONE For-you item in the owner\'s words, under the conversation, worded per device, the exit record in its detail', r1.item);
  ok(r2.asks === 0 && !!r2.item && /exited unexpectedly again at \d\d:\d\d and was not restarted/.test(r2.item.text) && r2.item.urgency === 'high', '② a second unexpected exit of it: nothing asked, one "again" item', r2);
  ok(r3.asks === 0 && r3.filed === 0 && / signal=SIGINT wrapper=finalized socket=none asked=interrupt$/.test(r3.line), '③ the Stop\'s SIGINT (asked): the line says asked=interrupt, nothing asked, nothing filed', r3.line);
  ok(r4.asks === 0 && r4.filed === 0, '④ an IDLE conversation that exits code 1: nothing', r4);
  ok(r5.asks === 1, '⑤ between turns but with background tasks live (the 09-24 shape): respawned', r5);
  ok(r6.waited && r6.askedLate === 1, '⑥ no client open: the respawn waits and the first client to connect is asked', r6);
  ok(!!r7.item && /restarting it did not work/.test(r7.item.text), '⑦ asked but nothing came up within landMs: ONE "did not work" item', r7.item);

  // ⑧ the Stop's REAL path: claude-code postInterrupt's SIGINT fallback marks the session before it signals
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const stopLeg = async (AdapterClass) => {
    const kid = spawn(process.execPath, ['-e', 'process.on("SIGINT", () => process.exit(130)); setInterval(() => {}, 1e6)'], { stdio: 'ignore' });
    liveKids.add(kid.pid);
    const got = new Promise((res) => kid.on('exit', (code, sig) => { liveKids.delete(kid.pid); res({ code, sig }); }));
    const sid = 'xf-ue-stop-' + (++seq);
    fs.writeFileSync(path.join(BUF, sid + '.json'), JSON.stringify({ streaming: true }));
    const s = { _childPid: kid.pid };
    new AdapterClass({ buffersDir: BUF }).postInterrupt(s, sid);
    const ex = await within(got, 5000);
    return { exitAsked: s._exitAsked || null, exit: ex };
  };
  const st = await stopLeg(ClaudeCodeAdapter);
  ok(st.exitAsked?.by === 'interrupt' && Number.isFinite(st.exitAsked.at) && st.exit.code === 130, '⑧ the Stop\'s real SIGINT fallback marks _exitAsked {by:interrupt} before it signals the CLI', st);

  // NEGATIVE CONTROLS — each patched copy must fail the leg it guards
  const ss = read('src/server/session-stdout.js');
  const CALL = "try { require('./unexpected-exit').onExit(session, id, facts, { midTurn }); }";
  ok(ss.includes(CALL) && ss.includes('let midTurn = !!session._isStreaming;'), 'controls setup: the call and the capture exist verbatim');
  const noCall = makeEngine(M.write('src/server/session-stdout.js', ss.replace(CALL, 'try { }'), 'ue-nocall'));
  const C1 = await runLegs(noCall, 'nocall');
  ok(C1.r1.asked === 0 && !C1.r1.item, 'NEGATIVE CONTROL: the teardown without the call (the base) asks nobody and files nothing', C1.r1);
  const late2 = makeEngine(M.write('src/server/session-stdout.js', ss.replace(CALL, "try { require('./unexpected-exit').onExit(session, id, facts, { midTurn: !!session._isStreaming }); }"), 'ue-lateread'));
  const C2 = await runLegs(late2, 'lateread');
  ok(C2.r1.asked === 0 && C2.r5.asks === 0, 'NEGATIVE CONTROL: "working" read AFTER the teardown cleared it never respawns (① and ⑤ red)', { r1: C2.r1.asked, r5: C2.r5.asks });
  const cc = read('src/adapters/claude-code.js');
  const MARK = "      session._exitAsked = { by: 'interrupt', at: Date.now() };\n";
  ok(cc.includes(MARK), 'controls setup: the Stop\'s mark exists verbatim');
  const { ClaudeCodeAdapter: Unmarked } = require(M.write('src/adapters/claude-code.js', cc.replace(MARK, ''), 'ue-nomark'));
  const st2 = await stopLeg(Unmarked);
  ok(!st2.exitAsked && st2.exit.code === 130, 'NEGATIVE CONTROL: without the mark the Stop\'s SIGINT exit carries no actor (it would read as unexpected)', st2);
  // WIRING PINS: the server installs it with the live clients; the client routes the ask to the sidebar Resume's own path
  ok(/require\('\.\/src\/server\/unexpected-exit'\)\.install\(\{ userTodos, sessionKeyFor: [^\n]*activeSessions, clients: \(\) => wss\.clients(?:, buffersDir: BUFFERS_DIR)? \}\)/.test(read('server.js')), 'server.js installs the orchestrator with the store, the key fn and the live ws clients');
  const appSrc = read('src/lib/app.js'), lcSrc = read('src/lib/session-lifecycle.js');
  const body = lcSrc.slice(lcSrc.indexOf('  _respawnAfterExit(sess = {}) {'), lcSrc.indexOf('  // Jump the sidebar to a conversation'));
  ok(/msg\.type === 'unexpected-exit-respawn' && msg\.session\) \{ try \{ this\._respawnAfterExit\(msg\.session\); \}/.test(appSrc)
    && /this\.resumeSession\(sess\.backendSessionId, [^\n]*excludeWebuiId: sess\.serverId/.test(body) && !/\.send\(|sendInput|continue/.test(body),
    'the client runs resumeSession (excluding the dead id) and sends nothing into the conversation');
  // ── verify r1 (B-f698): who is never respawned, and the crash loop ──
  const r1Table = (X) => {
    const V1 = (o) => X.unexpectedExitVerdict({ mode: 'chat', midTurn: true, conversationId: 'c1', now: 1e12, facts: { code: 1, wrapperFate: 'finalized' }, ...o });
    return { codex: act(V1({ backend: 'codex' })), opencode: act(V1({ backend: 'opencode' })), remote: act(V1({ remote: true })), claude: act(V1({ backend: 'claude' })),
      loop: act(V1({ midTurn: false, respawnedAt: 1e12 - 60000 })), idleLate: act(V1({ midTurn: false, respawnedAt: 1e12 - 5 * 60000 - 1 })), idle: act(V1({ midTurn: false })),
      loopClean: act(V1({ midTurn: false, respawnedAt: 1e12 - 60000, facts: { code: 0, wrapperFate: 'finalized' } })) };
  };
  const vr = r1Table(XF);
  ok(vr.codex === 'null/backend:codex' && vr.opencode === 'null/backend:opencode' && vr.remote === 'null/remote' && vr.claude === 'respawn/first', 'r1 pure: a codex / OpenCode conversation or a REMOTE one is never respawned, even on a code-1 record (only a Claude conversation on this machine)', vr);
  ok(vr.loop === 'notify/again' && vr.idleLate === 'null/idle' && vr.idle === 'null/idle' && vr.loopClean === 'null/clean' && XF.RESPAWN_STARTUP_MS === 5 * 60000, 'r1 pure: the crash loop — a respawned conversation that dies again while STARTING (idle, < 5 min) only notifies; idle later, never respawned, or a clean exit stays nothing', vr);
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  filed.length = 0; reinstall(); const mL = mkClient(); others = [mL];
  const l1 = chatExit(realEng, { attached: mL });
  await waitFor(() => mL.sent.length > 0, 1500); land(l1.cid); await waitFor(() => filed.length > 0, 1500);
  const loop = { first: filed.map((f) => f.text) }; filed.length = 0; activeSessions.delete('xf-ue-live-' + l1.cid);
  chatExit(realEng, { cid: l1.cid, streaming: false, attached: mL });
  await waitFor(() => filed.length > 0, 1500); await pause(200);
  Object.assign(loop, { asks: mL.sent.filter((m) => m.type === 'unexpected-exit-respawn').length, items: filed.map((f) => f.text) });
  ok(loop.first.length === 1 && loop.asks === 1 && loop.items.length === 1 && /exited unexpectedly again at \d\d:\d\d and was not restarted/.test(loop.items[0]), 'r1 ⑨ (real teardown) the crash loop: the respawned CLI dies while starting (idle, code 1) ⇒ ONE "again" item, no second ask', loop);
  filed.length = 0; reinstall({ landMs: 300 }); const mP = mkClient(); others = [mP];
  const p1 = chatExit(realEng, { attached: mP }); await waitFor(() => mP.sent.length > 0, 1500);
  chatExit(realEng, { cid: p1.cid, streaming: false }); await pause(800);
  const pend = filed.map((f) => f.text);
  ok(pend.length === 1 && /again/.test(pend[0]), 'r1 ⑨b it dies before it was ever seen live ⇒ the ONE item is "again" (the superseded respawn files no "did not work" on top)', pend);
  filed.length = 0; reinstall(); const mX = mkClient(); others = [mX];
  chatExit(realEng, { attached: mX, ask: (s) => { s.backend = 'codex'; } }); chatExit(realEng, { attached: mX, host: 'box-1' }); await pause(300);
  ok(mX.sent.length === 0 && filed.length === 0, 'r1 ⑩ (real teardown) a codex conversation and a remote one exiting code 1 mid-turn: no ask, no item', { sent: mX.sent.length, filed: filed.length });
  const xfSrc = read('src/exit-facts.js');
  const GUARDS = ["  if ((backend || 'claude') !== 'claude') return no('backend:' + backend);\n", "  if (remote) return no('remote');\n"];
  const LOOP = "  if (!midTurn && !restarting) return no('idle');\n";
  ok(GUARDS.every((g) => xfSrc.includes(g)) && xfSrc.includes(LOOP), 'r1 controls setup: the two guards and the startup rule exist verbatim');
  const cg = r1Table(require(M.write('src/exit-facts.js', GUARDS.reduce((s, g) => s.replace(g, ''), xfSrc), 'ue-r1-noguard')));
  ok(cg.codex === 'respawn/first' && cg.remote === 'respawn/first', 'r1 NEGATIVE CONTROL: without the two guards a codex and a remote conversation are respawned (the r1 finding)', cg);
  const cl = r1Table(require(M.write('src/exit-facts.js', xfSrc.replace(LOOP, "  if (!midTurn) return no('idle');\n"), 'ue-r1-noloop')));
  ok(cl.loop === 'null/idle', 'r1 NEGATIVE CONTROL: without the startup rule the crash loop is silent (the r1 finding)', cl);
  reinstall({ userTodos: null }); others = [];
}

// ── § 5 WIRING PINS over the source ─────────────────────────────────────────
console.log('— §5 wiring: the line, the event and the tomb are built from exitFacts —');
{
  const s = read('src/server/session-stdout.js');
  ok(/require\('\.\.\/exit-facts\.js'\)/.test(s) && /const facts = exitFacts\(\{ meta: wrapperMeta, socketPath: session\.socketPath \|\| null, socketExists, wrapperRunning: settle\.running, asked: session\._exitAsked, now: Date\.now\(\) \}\)/.test(s), 'session-stdout requires exit-facts and builds `facts` from the ONE meta read');
  ok((s.match(/readFileSync\(path\.join\(BUFFERS_DIR, id \+ '\.json'\)/g) || []).length === 0 && /settleWrapperMeta\(wrapperMetaPath, WRAPPER_SETTLE_MS, finishTeardown\);/.test(s),
    'r4: the teardown reads the wrapper meta only through settleWrapperMeta (no second, unsettled read)');
  const lineSrc = s.split('\n').find((l) => l.includes('[session] exited'));
  ok(!!lineSrc && lineSrc.trim().startsWith('console.log(') && lineSrc.includes('${facts.suffix}`'), 'the "[session] exited" console.log ends with ${facts.suffix}', lineSrc);
  ok(/__vsEvent\?\.\('session-exited', .*\$\{facts\.eventSuffix\}`\)/.test(s), 'the session-exited event carries ${facts.eventSuffix}');
  ok(/wrapperFate: facts\.wrapperFate/.test(s) && /socketFate: facts\.socketFate/.test(s), 'the tomb carries the same facts');
  // dc-harness-store (2.369.213): chat-wrapper.js reads the claude stream-json flags from ONE PURE module (the remote spawn
  // reads the same list through the adapter). Admitted only while that module requires NOTHING and the wrapper is not a
  // remote-shipped tool (it runs on the server box beside src/; HostManager.AGENT_TOOLS is the ship list).
  const TRANSPORT_REQ = "require(path.join(__dirname, '..', '..', 'src', 'harnesses', 'claude-transport.js'))";
  const transportPure = (t) => !/\brequire\(|\bimport\b/.test(t.replace(/^\s*\/\/.*$/gm, ''));
  const shipList = (t) => ((t.match(/static AGENT_TOOLS = \[([^\]]*)\]/) || [])[1] || '');
  ok(transportPure(read('src/harnesses/claude-transport.js')) && /'vibespace-status'/.test(shipList(read('src/hosts.js'))) && !/wrapper/.test(shipList(read('src/hosts.js'))),
    'chat-wrapper.js\'s one non-builtin require (src/harnesses/claude-transport.js) is PURE (no require / import) and no wrapper is on the remote ship list (HostManager.AGENT_TOOLS)');
  ok(!transportPure("'use strict';\nconst x = require('./other.js');\n") && /wrapper/.test(shipList("  static AGENT_TOOLS = ['vibespace-status', 'chat-wrapper.js'];")),
    'CONTROL: a require in the transport module, or a wrapper on the ship list, is red');
  for (const [f, src] of KINDS.map((k) => [path.basename(REL[k]), SRC[k]])) {
    ok(!/require\((?!['"](fs|path|os|child_process|crypto)['"])[^)]*\)/.test(src.replace(/require\(path\.join\(__dirname, '\.\.\/\.\.\/node_modules\/node-pty'\)\)/, '').replace(TRANSPORT_REQ, '')),
      `${f}: node builtins only (a STATIC file; node-pty is its one pre-existing dependency; crypto since lane codex-0159: the reset-credit consume's idempotencyKey; dc-harness-store 2.369.213: the claude transport flags' PURE module, below)`);
    const body = src.slice(src.indexOf('function onWrapperSignal'), src.indexOf('for (const sig of Object.keys(WRAPPER_SIGNO))'));
    ok(body.length > 0 && !/await|setTimeout|setImmediate|\.write\(|\.end\(|Promise/.test(body.replace(/fs\.writeFileSync|clearTimeout/g, '')),
      `${f}: the signal handler is synchronous (no await/timer/stream write)`);
    ok(!/writeFileSync|persistMeta\(/.test(body) && /overwriteIfPresent\(metaFile, /.test(body) && /overwriteIfPresent\(bufferFile, buffer\) && fs\.existsSync\(metaFile\)\) persistBuffer\(\)/.test(body),
      `${f}: the handler writes the meta only through overwriteIfPresent ('r+'), the buffer only into an existing .buf or while the meta exists`);
  }
}

// ── § 6c THE KILL-DOOR CENSUS (B-f698 verify r2) ────────────────────────────
// Every call that can end a process on the SERVER side is declared here, per file, with WHY its exit is never
// judged "unexpected": an ACTOR mark (`_exitAsked` / markAskedByPid) set BEFORE the kill, an ATTACH client (the CLI
// keeps running under its dtach socket; a pty exit with the socket present re-attaches), an UNREGISTERED process (no
// session ⇒ no teardown), a DEVICE (remote ⇒ never respawned), or NOT A CONVERSATION. Every CLIENT door (window
// close, sidebar / card / Manage agents Terminate, pool switch + account change + restart-in-place, resume-all) is
// App.killSession → the ws kill case ('terminate'). A NEW kill call anywhere, or a new file with one, turns this red
// until it is declared — a respawn after a kill the user or VibeSpace asked for is the defect it fences.
// (A kill through an injected alias — bridge-watch / opencode-serve `kill = (pid, sig) => process.kill(…)` — is
// counted where the alias is defined.)
console.log('— §6c every kill door is declared: an actor marked before the kill, or why its exit is never judged —');
{
  const KILL_CALL = /\b(?:process\.kill|\.kill)\s*\((?:[^()]|\([^()]*\))*\)/g;   // a liveness probe `kill(pid, 0)` is no door
  const KILL_DOORS = {
    'src/ws-handler.js': [2, 'actor terminate: the ws kill case — every client door is App.killSession'],
    'src/adapters/claude-code.js': [1, "actor interrupt: the Stop's SIGINT fallback"],
    'src/server/sysinfo-wiring.js': [1, 'actor user-signal: the System panel'],
    'src/routes/sessions.js': [1, 'actor user-kill: /api/kill-pid'],
    'src/server/session-stdout.js': [3, 'attach: reattachLocalPty + an abandoned device open-session'],
    'src/server/bridge-watch.js': [2, "attach: shutdown's endAttachPtys + orphaned dtach -a clients (alias)"],
    'src/pty-duck.js': [1, "attach: a device handle's pty duck"],
    'src/server/boot-restore.js': [1, 'unregistered: a duplicate husk retired at boot before adoption'],
    'src/agentd/agentd.js': [6, "device: the daemon's own pipe / pty sessions + the posixShells probe's 3 s stop of a shell that never answered (windows-device-fs r2)"],
    'src/agentd/attach-cli.js': [1, 'device: an attach client'],
    'src/agentd/client.js': [1, 'device: an attach client'],
    'src/dial-session-bridge.js': [4, 'device: dial bridge handles'],
    'src/server/dial-pairing.js': [1, 'device: a pairing handle'],
    'src/hosts.js': [1, 'device: an install child on a timeout'],
    'src/opencode-serve.js': [5, 'not respawned: OpenCode serve (backend ≠ claude)'],
    'src/desktop-serve.js': [3, 'not a conversation: desktop apps'],
    'src/device-mount.js': [4, 'not a conversation: rclone mounts (lane mac-pull-refresh added one — its bounded refresh child; composed at the 2.369.202 integration)'],
    'src/machine-mounts.js': [1, 'not a conversation: mount probes'],
    'src/mounts.js': [7, 'not a conversation: mounts (2.369.213: + a hung/over-ceiling starting daemon, + the bounded cache-count child)'],
    'src/jobs.js': [2, 'not a conversation: background jobs'],
    'src/plugins/frp.js': [1, 'not a conversation: plugins (the frpc daemon it started)'],
    'src/plugins/tailscale.js': [1, 'not a conversation: plugins (the tailscaled it started)'],
    'src/server/plugin-loader.js': [2, 'not a conversation: plugin children'],
    'src/port-forward.js': [1, 'not a conversation: port forwards'],
    'src/remote-fs.js': [2, 'not a conversation: file transfers'],
    'src/routes/files.js': [5, 'not a conversation: file transfers'],
    'src/server/browser-keeper.js': [4, 'not a conversation: agent browsers and their stale holders (the 2.369.202 integration: lanes browser-windows / jobs-browser / browser-admin added four; rv-browser F7 moved the install children out — the two rows below)'],
    'src/server/browser-installs.js': [3, 'not a conversation: THE install slot — a step child past its wall clock, a re-attached stalled step (its pid, or its npm group) — rv-browser F7, moved out of the keeper'],
    'src/server/browser-cli-install.js': [2, 'not a conversation: the browser CLI install\'s detached npm group (or its child) past its deadline — rv-browser F7, moved out of the keeper'],
    // the 2.369.202 integration — kill calls the other lanes of this release added beside lane unexpected-exit's census
    'src/agentd/worker-pool.js': [1, "device: the daemon ends ITSELF by SIGKILL after its exit handlers while an fs worker is stuck in the kernel (lane runaway-daemon) — never a conversation"],
    'src/codex-reset-helper.js': [2, 'not a conversation: the bounded codex app-server child of a reset-credit press (lane reset-path), its own process group, ended at its deadline'],
    'src/vnc.js': [2, 'not a conversation: VNC (lane desktop-apps-safety B-956d added the held-display retry\'s end — composed at the 2.369.202 integration)'],
    'src/window-targets.js': [2, 'not a conversation: X helpers'],
    // the 2.369.204 integration — usage-index-shadow (on the .202 base) re-raises the server's OWN exit: at process exit the index worker is joined; past its 2 s bound the server ends itself (SIGTERM, then SIGKILL if ignored) — never a conversation
    'src/server/usage-index.js': [2, "not a conversation: the server's own exit, re-raised past the index worker's 2 s join bound (usage-index-shadow)"],
    // the 2.369.221 integration — lane global-search's ORCH joins its index worker at process exit the same way (its own close bound)
    'src/server/search-index.js': [1, "not a conversation: the server's own exit, re-raised past the search index worker's close bound (global-search)"],
  };
  // the actor pins: the mark is set BEFORE the kill it names (the teardown reads it; the kill case deletes the session late)
  const ACTOR_PINS = [
    ['src/ws-handler.js', "session._exitAsked = { by: 'terminate', at: Date.now() };", ["process.kill(dpid, 'SIGTERM')", 'if (session.pty) session.pty.kill();']],
    ['src/adapters/claude-code.js', "session._exitAsked = { by: 'interrupt', at: Date.now() };", ["process.kill(session._childPid, 'SIGINT')"]],
    ['src/server/sysinfo-wiring.js', "markAskedByPid(pid, 'user-signal', { refreshOnly: sig === 'CONT' })", ["process.kill(pid, 'SIG' + sig)"]],
    ['src/routes/sessions.js', "markAskedByPid(pid, 'user-kill')", ["process.kill(pid, 'SIGTERM')"]],
  ];
  const serverFiles = (root) => {
    const out = ['server.js'];
    const walk = (rel) => { for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) { if (!(rel === 'src' && /^(lib|public)$/.test(e.name))) walk(r); } else if (e.name.endsWith('.js')) out.push(r); } };
    walk('src');
    return out;
  };
  function killDoorCensus(readOf, files) {
    const bad = [];
    for (const f of files) {
      const n = [...readOf(f).matchAll(KILL_CALL)].filter((m) => !/,\s*0\s*\)$/.test(m[0])).length;
      const want = KILL_DOORS[f] ? KILL_DOORS[f][0] : 0;
      if (n !== want) bad.push(`${f}: ${n} kill call(s), ${want} declared${KILL_DOORS[f] ? ' (' + KILL_DOORS[f][1] + ')' : ''}`);
    }
    for (const f of Object.keys(KILL_DOORS)) if (!files.includes(f)) bad.push(`${f}: declared but gone`);
    for (const [f, mark, kills] of ACTOR_PINS) {
      const s = readOf(f), at = s.indexOf(mark);
      for (const k of kills) { const ki = s.indexOf(k, Math.max(0, at)); if (at < 0 || ki < 0 || ki - at > 2500) bad.push(`${f}: the actor mark does not precede ${k}`); }
    }
    const ui = [];
    const walkLib = (rel) => { for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) { const r = rel + '/' + e.name; if (e.isDirectory()) walkLib(r); else if (e.name.endsWith('.js')) ui.push(r); } };
    walkLib('src/lib');
    const sends = ui.flatMap((f) => [...readOf(f).matchAll(/type: *'kill'/g)].map(() => f));
    const ks = readOf('src/lib/session-lifecycle.js');
    const body = ks.slice(ks.indexOf('  killSession(webuiId, backendSessionId) {'), ks.indexOf('\n  },', ks.indexOf('  killSession(webuiId, backendSessionId) {')));
    if (sends.length !== 2 || sends.some((f) => f !== 'src/lib/session-lifecycle.js') || (body.match(/type: 'kill'/g) || []).length !== 2)
      bad.push(`client: the ws kill is sent outside App.killSession (${sends.join(', ')})`);
    return bad;
  }
  const files = serverFiles(REPO);
  const real = (f) => read(f);
  const census = killDoorCensus(real, files);
  ok(census.length === 0, `every server kill call is declared (${Object.values(KILL_DOORS).reduce((a, [n]) => a + n, 0)} calls in ${Object.keys(KILL_DOORS).length} files), every actor is marked before its kill, the client kills only through App.killSession`, census.join(' | '));
  // controls: each must go red
  const mut = (file, fn) => (f) => (f === file ? fn(read(f)) : read(f));
  ok(killDoorCensus(mut('src/server/ops-routes.js', (s) => s + "\nfunction stopIt(s) { process.kill(s._childPid, 'SIGTERM'); }\n"), files).some((b) => b.startsWith('src/server/ops-routes.js')),
    'control: a NEW kill door in an undeclared file is red');
  ok(killDoorCensus(mut('src/jobs.js', (s) => s + "\nfunction stopIt(s) { s.pty.kill(); }\n"), files).some((b) => b.startsWith('src/jobs.js')),
    'control: one more kill call in a declared file is red');
  ok(killDoorCensus(mut('src/ws-handler.js', (s) => s.replace("session._exitAsked = { by: 'terminate', at: Date.now() };", '')), files).some((b) => /actor mark does not precede/.test(b)),
    'control: the ws kill case without its actor mark is red');
  ok(killDoorCensus(mut('src/lib/chat-view.js', (s) => s + "\nfunction stopIt(ws, id) { ws.send({ type: 'kill', sessionId: id }); }\n"), files).some((b) => b.startsWith('client:')),
    'control: a client kill sent around App.killSession is red');
  // the actors the census names are each an asked exit, never a respawn — even mid-turn with a crash code
  const { askedActor: AA, unexpectedExitVerdict: UV } = require(path.join(REPO, 'src/exit-facts.js'));
  const t0 = 1_800_000_000_000;
  for (const by of ['terminate', 'interrupt', 'user-signal', 'user-kill']) {
    const v = UV({ mode: 'chat', backend: 'claude', midTurn: true, facts: { code: 1, signal: null, wrapperFate: 'finalized' }, conversationId: 'c-' + by, askedBy: AA({ by, at: t0 - 20000 }, t0), now: t0 });
    ok(v.action === null && v.why === 'asked:' + by, `actor ${by}: a mid-turn exit it asked for is never respawned (${v.why})`);
  }
  // r2: STOP → TERM → CONT a minute later — the TERM is delivered at the CONT; the CONT re-stamps the mark
  {
    const UX = require(path.join(REPO, 'src/server/unexpected-exit.js'));
    let clock = t0; const sx = { _childPid: 4242 }, other = { _childPid: 5151 };
    UX.install({ activeSessions: new Map([['sx', sx], ['so', other]]), now: () => clock, log: { log() { }, warn() { } } });
    UX.markAskedByPid(4242, 'user-signal');                         // the panel's TERM while the CLI is STOPped
    clock += 60000;
    ok(AA(sx._exitAsked, clock) === null, 'r2 control: a minute later the TERM mark alone is stale (the CONT would kill a "crash")');
    UX.markAskedByPid(4242, 'user-signal', { refreshOnly: true });  // the panel's CONT delivers the pending TERM
    UX.markAskedByPid(5151, 'user-signal', { refreshOnly: true });  // a CONT of a session nobody signalled
    ok(AA(sx._exitAsked, clock) === 'user-signal' && UV({ mode: 'chat', midTurn: true, facts: { code: null, signal: 'SIGTERM', wrapperFate: 'finalized' }, conversationId: 'cx', askedBy: AA(sx._exitAsked, clock), now: clock }).action === null,
      'r2: the CONT re-stamps the mark — the TERM it delivers is the user\'s kill, never respawned');
    ok(other._exitAsked === undefined, 'r2: a CONT marks nothing new (a session never signalled stays unmarked)');
    UX.install({});
  }
}

console.log('— §6d lane exit-item-heal: a resume answers the "resume it" item — read off the store, one pass per new live session —');
{
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const UER = 'src/server/unexpected-exit.js';
  const ueSrc = read(UER);
  const quiet = { log() { }, warn() { } };
  const keyOf = (s, id) => (s.claudeSessionId ? `${s.backend || 'claude'}:${s.claudeSessionId}` : `webui:${id}`); // server.js sessionStatusKey's shape
  const CRASH = { code: 1, signal: null, wrapperFate: 'finalized' };
  // THE LEGS, judged on a module (the real one, or a patched copy): items filed by the REAL orchestrator into the REAL store
  const healLegs = (UE, tag) => {
    const dir = path.join(ROOT, 'heal-' + tag);
    fs.mkdirSync(dir, { recursive: true });
    let store = new UserTodoManager({ dataDir: dir, onChange() { }, expirySweepMs: 0 });
    const live = new Map();
    let clock = Date.now();
    const install = () => UE.install({ userTodos: store, sessionKeyFor: keyOf, activeSessions: live, clients: () => [], log: quiet, now: () => clock, pendMaxMs: 1000 });
    install();
    const die = (cid, id) => UE.onExit({ name: 'conv ' + (cid || id), mode: 'chat', backend: 'claude', claudeSessionId: cid, clients: new Map(), cwd: ROOT }, id, CRASH, { midTurn: true });
    // four conversations die while working, no VibeSpace window open ⇒ "no window was open … resume it" (the 15:45 shape)
    for (const c of ['a', 'b', 'c', 'd']) die('conv-' + c, 'dead-' + c);
    clock += 1000; UE.tick();
    die('conv-d', 'dead-d2');                                    // conv-d dies AGAIN: "… again … resume it" supersedes nothing filed — a second item
    die(null, 'dead-nc');                                        // no conversation: nothing to resume
    store.rekey('webui:dead-nc', 'claude:conv-nc');              // (a placeholder item moved onto a real key later)
    const itemOf = (cid, outcome) => store.forSession('claude:' + cid).find((i) => i.i18n && i.i18n.text && i.i18n.text.key === UE.TEXTS[outcome]) || null;
    const A = itemOf('conv-a', 'no-window'), B = itemOf('conv-b', 'no-window'), C = itemOf('conv-c', 'no-window'), D1 = itemOf('conv-d', 'no-window'), D2 = itemOf('conv-d', 'again'), NC = itemOf('conv-nc', 'no-conversation');
    const r = { filed: [A, B, C, D1, D2, NC].filter(Boolean).length };
    // ① a CLIENT resumes conv-a 28 min later (a create carrying its id); conv-c was resumed BEFORE its item was filed;
    //   conv-nc runs again too; conv-b is not running
    const startA = A ? A.createdAt + 28 * 60000 : 0;
    live.set('live-a', { name: 'conv a', mode: 'chat', backend: 'claude', claudeSessionId: 'conv-a', createdAt: startA });
    live.set('live-c', { name: 'conv c', mode: 'chat', backend: 'claude', claudeSessionId: 'conv-c', createdAt: C ? C.createdAt - 60000 : 0 });
    live.set('live-nc', { name: 'conv nc', mode: 'chat', backend: 'claude', claudeSessionId: 'conv-nc', createdAt: NC ? NC.createdAt + 60000 : 0 });
    live.set('live-x', { name: 'other', mode: 'chat', backend: 'claude', claudeSessionId: 'conv-x', createdAt: Date.now() + 60000 });
    let saves = 0; const save0 = store._save.bind(store); store._save = () => { saves++; save0(); };
    const heard = []; store.onStatus((it, o) => heard.push(o.by));
    r.first = UE.healResumed();
    const a = A && store.get(A.id);
    r.a = a && { status: a.status, by: a.resolvedBy, fact: a.resolvedFact, saves };
    r.heard = heard.join(',');
    r.b = B && store.get(B.id).status; r.c = C && store.get(C.id).status; r.nc = NC && store.get(NC.id).status;
    // ② the next publish (an unrelated broadcast): the same live sessions are passed over — one pass per new live session
    const savesBefore = saves;
    r.second = UE.healResumed(); r.secondSaves = saves - savesBefore;
    // ③ a SERVER RESTART: a fresh manager over the same file, a fresh install (the pending map gone); conv-b and conv-d
    //   come back as RESTORED sessions started after their items were filed
    store.flush();
    store = new UserTodoManager({ dataDir: dir, onChange() { }, expirySweepMs: 0 });
    live.clear();
    install();
    const startB = B ? B.createdAt + 31 * 60000 : 0;
    live.set('restored-b', { name: 'conv b', mode: 'chat', backend: 'claude', claudeSessionId: 'conv-b', createdAt: startB });
    live.set('restored-d', { name: 'conv d', mode: 'chat', backend: 'claude', claudeSessionId: 'conv-d', createdAt: (D2 ? D2.createdAt : 0) + 1000 });
    r.restart = UE.healResumed();
    store.flush();
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'user-todos.json'), 'utf8'));
    const onDisk = (it) => it && (disk.items || []).find((x) => x.id === it.id);
    r.bDisk = onDisk(B) && { status: onDisk(B).status, by: onDisk(B).resolvedBy, at: onDisk(B).resolvedFact && onDisk(B).resolvedFact.resumedAt };
    r.d = [D1, D2].map((it) => it && store.get(it.id).status).join(',');
    r.ncAfter = NC && store.get(NC.id).status; r.cAfter = C && store.get(C.id).status;
    store.stop?.();
    UE.install({});
    return { r, A, B, startA, startB };
  };
  const { r, A, B, startA, startB } = healLegs(require(path.join(REPO, UER)), 'real');
  ok(r.filed === 6, 'setup: the REAL orchestrator filed six items into the REAL store (4 × no-window, 1 × again, 1 × no-conversation)', r);
  ok(r.a && r.a.status === 'done' && r.a.by === 'resumed' && r.a.fact && r.a.fact.resumedAt === startA && r.first.length === 1 && r.first[0] === A.id && r.a.saves === 1 && r.heard === 'resumed',
    '① filed, then the conversation resumed by a client ⇒ the item is done, resolvedBy "resumed" (the system, never the user), its fact = the new session\'s start; ONE save; the status listeners hear it', r);
  ok(r.c === 'open', '① a conversation resumed BEFORE its item was filed ⇒ the item is untouched', r);
  ok(r.b === 'open', '① another conversation\'s item ⇒ untouched (conv-b is not running)', r);
  ok(r.nc === 'open' && r.ncAfter === 'open', '① a no-conversation item stays even under a running conversation\'s key (nothing to resume)', r);
  ok(r.second.length === 0 && r.secondSaves === 0, '② the next publish passes the same live sessions over — one pass per new live session, nothing written', r);
  ok(r.restart.length === 3 && r.bDisk && r.bDisk.status === 'done' && r.bDisk.by === 'resumed' && r.bDisk.at === startB && r.d === 'done,done',
    '③ after a server restart (fresh install, store kept) the restored conversations\' items are resolved off the STORE — conv-b on disk, both of conv-d\'s (no-window + again)', r);
  ok(r.cAfter === 'open', '③ the item of a conversation resumed before it was filed is still untouched after the restart', r);
  // the words: the row renderer + the For-you window pane say it plainly, zh + ja carry the sentence
  const R = await import(path.join(REPO, 'src/lib/user-todos-row.js'));
  const L = await import(path.join(REPO, 'src/lib/inbox-window-layout.js'));
  const tt = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));
  const hm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const item = { id: 'u1', status: 'done', resolvedBy: 'resumed', resolvedFact: { resumedAt: startA }, createdAt: startA - 1, resolvedAt: startA, text: 'x' };
  const pane = L.itemView(item, { t: tt, resolvedBy: (by, it) => R.resolvedByText(by, tt, it) });
  ok(R.resolvedByText('resumed', tt, item) === `running again (resumed ${hm(startA)})` && R.resolvedByText('resumed', tt) === 'running again'
    && pane.meta.some((m) => m.kind === 'by' && m.text === `running again (resumed ${hm(startA)})`),
    'the resolution says it: "running again (resumed HH:MM)" on the row and in the For-you window pane (no fact ⇒ "running again")', pane.meta);
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok(['running again', 'running again (resumed {time})'].every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')), 'the resolution\'s words have zh + ja');
  // ONE entry point: the active-sessions payload builder (every broadcast + a fresh client's first list) — no other caller
  const srv = read('server.js');
  const builder = srv.split('function activeSessionsPayload() {')[1] || '';
  ok(/^\s*try \{ require\('\.\/src\/server\/unexpected-exit'\)\.healResumed\(\); \}/.test(builder), 'PIN: server.js activeSessionsPayload (the publish every create / resume / restore passes through) runs the heal pass first');
  const callers = spawnSync('git', ['-C', REPO, 'grep', '-l', 'healResumed(', '--', 'src', 'server.js'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean).sort();
  ok(callers.join(',') === 'server.js,src/server/unexpected-exit.js', 'census: healResumed is called from the ONE entry point only (never per call site)', callers);
  // CONTROLS — patched copies judged by the same legs
  const noHook = ueSrc.replace(/function healResumed\(\) \{\n/, 'function healResumed() { return [];\n');
  const ctl = healLegs(M.load(UER, noHook, 'noheal'), 'noheal').r;
  ok(noHook !== ueSrc && !(ctl.a && ctl.a.status === 'done') && ctl.restart.length === 0 && ctl.b === 'open',
    'control: a copy WITHOUT the heal pass leaves the resumed conversation\'s item open, before and after the restart (the legs go red)', ctl);
  const noOrder = ueSrc.replace('&& Number(it.createdAt) < startedAt', '');
  const ctl2 = healLegs(M.load(UER, noOrder, 'noorder'), 'noorder').r;
  ok(noOrder !== ueSrc && ctl2.c === 'done', 'control: a copy without "filed BEFORE the session started" resolves the item of a conversation resumed before it was filed (the leg goes red)', ctl2);
  const readsWords = (src) => /\bit\.(?:text|detail)\b/.test(src.split('function healResumed')[1].split('\n}\n')[0]);
  const byWords = ueSrc.replace("HEAL_KEYS.has(it.i18n && it.i18n.text && it.i18n.text.key)", "/resume it|say continue/.test(it.text)");
  ok(!readsWords(ueSrc) && byWords !== ueSrc && readsWords(byWords), 'census: the heal pass never reads an item\'s words — found by i18n.text.key + sessionKey (control: a words-matching copy is caught)');
}

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 28 })) ok(r.pass, r.name, r.detail);

console.log(`\n${fail ? '✗' : '✓'} test-exit-forensics: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
