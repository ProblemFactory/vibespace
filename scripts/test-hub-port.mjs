#!/usr/bin/env node
// THE HUB'S PORT — THE START DECIDES, AND ONLY THE START (the separation, M1 — lane B, piece B2b; 主开发 2026-11-17 21:43Z,
// src/server/hub-port.js). In-process over stubs of the hub's listener and the join, plus one child on a REAL fd 3:
//   ① PIPED — a start pipe whose first line is {op:'start', party:'hub', secret, link}: server.js's one boot call
//     hub.listen(PORT, HOST, cb) JOINS the link and runs cb; the hub's own listener is NEVER called; its own record says
//     {form:'piped', listened:false, link}. RED CONTROL: the listener planted back in the piped form ⇒ it is called.
//   ② PLAIN — no start pipe: the hub's own listener is called with (PORT, HOST); the join NEVER; the record says
//     {form:'plain', listened:true, port}. RED CONTROL: a join planted in the plain form ⇒ it is called.
//   ③ NO FALLBACK — a piped hub whose link dies, or whose join is refused, ENDS and never opens its own listener.
//     RED CONTROL: a fallback listen planted on the link's death ⇒ the listener is called.
//   ④ NO WORD, NO LOOK (主开发 00:02Z, law 1 amended): a hub started without VIBESPACE_START_FD is plain, and a pipe LEFT on
//     its fd 3 is never looked at and never read (a real child: fd 3 spied, the line still in the pipe after the decision).
//     RED CONTROL: today's code — fd 3 looked at with no word ⇒ a plain hub takes itself for a piped one.
//   ⑥ THE CERTIFICATE: a piped hub pushes the pair src/server/tls.js keeps live ({op:'certificate', cert, key}; a stop
//     with no pair); one that comes before the join waits for it; the plain form pushes nothing. RED CONTROL: the waiting
//     pair's push cut ⇒ the first certificate never reaches the interface.
//   ⑤ THE SECRET travels only on fd 3 and in memory: no log line, no record, no error text carries it; a child started
//     with its start pipe on a REAL fd 3 (named by the word) decides «piped» and its own output, argv and environment
//     carry no secret.
//     RED CONTROL: a log of the start line planted ⇒ the secret is found in the output.
//   ⑦ THE PLAIN FORM IS A DEBT WITH A COUNT (law 3): «§B2c THE HUB'S OWN LISTENER» — owed while the hub boots outside the
//     boot helper (test-architecture §57c's BOOTS_OUTSIDE_HELPER where the tree has it, else §57c's own pattern counted:
//     only an overcount) stay above the floor; AT the floor it goes red «DELETE THE LISTENER NOW, B2c». RED CONTROL: the
//     judgement at the floor. And the ONE seam: one boot call in server.js, the own listener only through plainListen.
//   ⑧ WITH THE WORD, EVERY BAD START ENDS BY NAME IN BOUNDED TIME (law 3): the word naming a FILE, no descriptor, one not
//     open; a pipe that ends first; a SILENT pipe ends inside its bound (in-process, and a real child with the word on a
//     real fd 3). RED CONTROL: the bound cut ⇒ still waiting at four times the law's time. THE WORD GOES NO FURTHER (law 2):
//     read once and deleted (RED CONTROL: the delete cut ⇒ kept); a child of the hub sees no word; the three env lists —
//     agentEnv, daemonEnv, serviceEnv — drop it (RED CONTROLS: the agents' or the services' keep set naming it ⇒ carried).
//     THE ORDER: the boot TAKES the word at server.js line 5, before its first other require and its first spawn (RED
//     CONTROL: the claim moved to the decide line). A bad start ends on decide's answer, not after the boot's restore
//     probes, and once (RED CONTROL: the mark cut ⇒ the later listen says it and ends again).
//   ⑨ THE JOIN IS BOUNDED: an interface that accepts the link and never answers ⇒ the hub ends by name inside
//     JOIN_ANSWER_MS. RED CONTROL: the bound cut ⇒ neither joined nor ended at four times the law's time.
// in-process, plus children on a real fd 3; a scratch dir under os.tmpdir().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 500) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hub-port-'));
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
/** src/server/hub-port.js with ONE line swapped — the needle must occur exactly once, or the control is void (it throws) */
function mutant(needle, into) { const src = read('src/server/hub-port.js'); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once: ${needle.slice(0, 80)}`); return compileAt('src/server/hub-port.js', src.replace(needle, into)); }
const HP = require(path.join(REPO, 'src/server/hub-port.js'));
const SECRET = crypto.randomBytes(32).toString('hex');
const START = { op: 'start', party: 'hub', secret: SECRET, link: path.join(T, 'link.sock') };
const stubPort = process.pid % 50000 + 1024;   // the port a STUB hub is asked to listen on — nothing binds it, and it is per-pid (test-ci-gate-tiers: no fixed port claimed)
const pipeWith = (...lines) => { const p = new PassThrough(); for (const l of lines) p.write(JSON.stringify(l) + '\n'); return p; };

/** the hub's boot through `mod`: a stub hub (its own listener counted), a stub join, the lines the module said */
async function bootThrough(mod, decision, { joinResult = 'ack', deathAfter = false, joinWith = null, settleMs = 10 } = {}) {
  const calls = { own: [], join: [], ended: 0, cb: 0, endedAt: null }, lines = [];
  const hub = { listen: (port, host, cb) => { calls.own.push([port, host]); setImmediate(() => cb && cb()); return hub; } };
  let dead = null;
  const join = joinWith || (({ start, onDead }) => { calls.join.push(start && start.link); dead = onDead; return joinResult === 'ack' ? Promise.resolve({}) : Promise.reject(new Error('the interface refused this party (auth-fail)')); });
  const log = { log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) };
  const w = mod.wire(decision, { hub, server: {}, join, end: () => { calls.ended++; calls.endedAt = Date.now(); }, log });
  hub.listen(stubPort, '0.0.0.0', () => { calls.cb++; });
  await sleep(settleMs);
  if (deathAfter && dead) { dead('stream closed'); await sleep(10); }
  return { calls, lines, record: w.bound() };
}

console.log('— ① PIPED: the start pipe joins the link; the hub never listens on the port');
{
  const d = await HP.decide({ pipe: pipeWith(START) });
  ok(d.form === 'piped' && d.start && d.start.link === START.link, 'a start pipe whose first line is the hub\'s start ⇒ piped, its link read');
  const r = await bootThrough(HP, d);
  ok(r.calls.own.length === 0 && r.calls.join.length === 1 && r.calls.cb === 1 && r.record.form === 'piped' && r.record.listened === false && r.record.link === START.link, `the one boot call joined (${r.calls.join.length}) and ran the boot callback; the hub's own listener was called ${r.calls.own.length} times; its record ${JSON.stringify(r.record)}`, r);
  const planted = await bootThrough(mutant("    hub.listen = (port, host, cb) => {   // PIPED: the port is the interface's — this hub never listens on it\n", "    hub.listen = (port, host, cb) => {   // PIPED: the port is the interface's — this hub never listens on it\n      listenOwn.apply(hub, [port, host, () => { }]);\n"), d);
  ok(planted.calls.own.length === 1, `RED CONTROL — the listener planted back in the piped form: the hub's own listener is called (${planted.calls.own.length})`, planted.calls);
}

console.log('— ② PLAIN: no start pipe — the hub listens on the port and never joins a link');
{
  const d = await HP.decide({ env: {} });   // no start word
  ok(d.form === 'plain', 'no start word ⇒ plain');
  const r = await bootThrough(HP, d);
  ok(r.calls.own.length === 1 && JSON.stringify(r.calls.own[0]) === `[${stubPort},"0.0.0.0"]` && r.calls.join.length === 0 && r.calls.cb === 1 && r.record.form === 'plain' && r.record.listened === true && r.record.port === stubPort, `the one boot call listened on (PORT, HOST) through the plain seam; the join was called ${r.calls.join.length} times; its record ${JSON.stringify(r.record)}`, r);
  const planted = await bootThrough(mutant("  if (decision.form === 'plain') {\n", "  if (decision.form === 'plain') {\n    join({ start: { link: 'planted', secret: 'x' }, server, onDead: () => { } }).catch(() => { });\n"), d);
  ok(planted.calls.join.length === 1, `RED CONTROL — a join planted in the plain form: the join is called (${planted.calls.join.length})`, planted.calls);
}

console.log('— ③ NO FALLBACK: a piped hub whose link dies or is refused ends — never its own listener');
{
  const d = await HP.decide({ pipe: pipeWith(START) });
  const died = await bootThrough(HP, d, { deathAfter: true });
  ok(died.calls.ended === 1 && died.calls.own.length === 0, `the link dies after the join: the hub ends (${died.calls.ended}) and its own listener is never called (${died.calls.own.length})`, died.calls);
  const refused = await bootThrough(HP, d, { joinResult: 'refused' });
  ok(refused.calls.ended === 1 && refused.calls.own.length === 0 && refused.calls.cb === 0, 'a refused join (auth-fail): the hub ends, no boot callback, no listener', refused.calls);
  const noStart = await bootThrough(HP, await HP.decide({ pipe: pipeWith({ op: 'admit', party: 'hub', digest: 'x' }) }));
  ok(noStart.calls.ended === 1 && noStart.calls.own.length === 0 && noStart.calls.join.length === 0, 'a start pipe whose first line is no start: piped, it cannot join — it ends, never its own listener', noStart.calls);
  const fallback = await bootThrough(mutant("      join({ start: decision.start, server, onDead: () => { try { log.error?.('[hub-port] the interface\\'s link ended — this hub ends (never its own listener)'); } catch { } end(); } })\n",
    "      join({ start: decision.start, server, onDead: () => { listenOwn.apply(hub, [port, host, () => { }]); end(); } })\n"), d, { deathAfter: true });
  ok(fallback.calls.own.length === 1, `RED CONTROL — a fallback listen planted on the link's death: the hub's own listener is called (${fallback.calls.own.length})`, fallback.calls);
}


/** a CHILD on a REAL descriptor: it decides from its own environment and fd 3 (spied: how often fd 3 was looked at), wires
 *  the decision over a stub hub, and says what happened as one JSON line. argv: <mode: read3 | silent | kid> [hub-port copy] */
const probe8 = path.join(T, 'probe8.cjs');
fs.writeFileSync(probe8, `
const fs = require('fs'), crypto = require('crypto'), net = require('net'), Module = require('module');
let fstat3 = 0; const of = fs.fstat, ofs = fs.fstatSync;
fs.fstat = function (fd, ...a) { if (fd === 3) fstat3++; return of.call(fs, fd, ...a); };
fs.fstatSync = function (fd, ...a) { if (fd === 3) fstat3++; return ofs.call(fs, fd, ...a); };
const [mode, copy] = process.argv.slice(2);
const FILE = ${JSON.stringify(path.join(REPO, 'src/server/hub-port.js'))};
let HP; if (copy) { const m = new Module(FILE, null); m.filename = FILE; m.paths = Module._nodeModulePaths(require('path').dirname(FILE)); m._compile(fs.readFileSync(copy, 'utf8'), FILE); HP = m.exports; } else HP = require(FILE);
const t0 = Date.now();
HP.decide({ ms: Number(process.env.PROBE_MS) || undefined }).then((d) => {
  const lines = []; let ended = 0, own = 0;
  const hub = { listen: () => { own++; return hub; } };
  HP.wire(d, { hub, server: {}, join: () => new Promise(() => { }), end: () => { ended++; }, log: { log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) } });
  hub.listen(0, '0.0.0.0', () => { });
  const ms = Date.now() - t0, looked = fstat3;
  const say = (rest) => { process.stdout.write(JSON.stringify({ form: d.form, why: d.why || null, fstat3: looked, rest, ended, own, lines, word: process.env.VIBESPACE_START_FD === undefined ? 'gone' : 'kept', kid, ms }) + '\\n'); setTimeout(() => process.exit(0), 20); };
  let kid = null;
  if (mode === 'kid') kid = require('child_process').spawnSync(process.execPath, ['-e', 'process.stdout.write(process.env.VIBESPACE_START_FD === undefined ? "none" : "seen")'], { env: { ...process.env }, encoding: 'utf8' }).stdout;
  if (mode !== 'read3') return say(null);
  let said = false; const once = (v) => { if (!said) { said = true; say(v); } };   // what is STILL in the pipe, read after the decision
  setTimeout(() => once('timeout'), 1500);
  try { const s = new net.Socket({ fd: 3, readable: true, writable: false }), parts = []; s.on('data', (b) => parts.push(b)); s.on('end', () => once(crypto.createHash('sha256').update(Buffer.concat(parts)).digest('hex'))); s.on('error', (e) => once('error ' + e.code)); } catch (e) { once('error ' + e.code); }
});
`);
async function runProbe(args, { fd3 = false, env = {}, write = null, keepOpen = false, waitMs = 5000 } = {}) {
  const c = spawn(process.execPath, [probe8, ...args], { stdio: ['ignore', 'pipe', 'pipe', ...(fd3 ? ['pipe'] : [])], env: { PATH: process.env.PATH, ...env } });
  let out = '', err = ''; c.stdout.on('data', (b) => { out += b; }); c.stderr.on('data', (b) => { err += b; });
  if (fd3) { if (write !== null) c.stdio[3].write(write); if (!keepOpen) c.stdio[3].end(); }
  const t0 = Date.now();
  const code = await new Promise((r) => { const k = setTimeout(() => { c.kill('SIGKILL'); r('killed'); }, waitMs); c.once('exit', (x) => { clearTimeout(k); r(x); }); });
  if (fd3) { try { c.stdio[3].destroy(); } catch { } }
  let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch { }
  return { j, code, wall: Date.now() - t0, err: err.slice(0, 300) };
}
const SP = require(path.join(REPO, 'src/interface/start-pipe.js'));
/** src/interface/start-pipe.js with ONE line swapped, under a hub-port.js that reads that copy */
function overStartPipe(needle, into) {
  const src = read('src/interface/start-pipe.js'); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once: ${needle.slice(0, 80)}`);
  globalThis.__vsStartPipe = compileAt('src/interface/start-pipe.js', src.replace(needle, into));
  return compileAt('src/server/hub-port.js', read('src/server/hub-port.js').replace("require('../interface/start-pipe.js')", 'globalThis.__vsStartPipe'));
}
const endedOnly = (r) => r.calls.ended === 1 && r.calls.own.length === 0 && r.calls.join.length === 0 && r.calls.cb === 0;

console.log('— ④ NO WORD, NO LOOK: a hub nobody named a start pipe to is plain, and a pipe LEFT on its fd 3 is never looked at or read');
{
  // (a forked hub's IPC on fd 3 is the same case: no word ⇒ no look. B2b's NODE_CHANNEL_FD check is gone — Node deletes that
  // name from the environment before user code runs, so it never could see it.)
  const LINE4 = JSON.stringify({ op: 'start', party: 'hub', secret: crypto.randomBytes(8).toString('hex'), link: path.join(T, 'four.sock') }) + '\n';
  const want = crypto.createHash('sha256').update(LINE4).digest('hex');
  const law = await runProbe(['read3'], { fd3: true, write: LINE4 });
  ok(law.j && law.j.form === 'plain' && law.j.fstat3 === 0 && law.j.rest === want && law.j.own === 1, `no word, a pipe left on fd 3 carrying a hub's start line: ${law.j && law.j.form}; fd 3 looked at ${law.j && law.j.fstat3} times; the line still whole in the pipe: ${!!law.j && law.j.rest === want}; its own listener called ${law.j && law.j.own} time`, law);
  const N4 = "  return (pipe ? firstLine(pipe, { ms }) : openStart({ env, taken, ms })).then((s) => {\n";
  const src4 = read('src/server/hub-port.js'); if (src4.split(N4).length !== 2) throw new Error('CONTROL needle not found exactly once: decide');
  const looks = path.join(T, 'hub-port-looks.js');
  fs.writeFileSync(looks, src4.replace(N4, "  return (pipe ? firstLine(pipe, { ms }) : openStart({ env: { ...env, VIBESPACE_START_FD: '3' }, taken: null, ms })).then((s) => {\n"));
  const red = await runProbe(['read3', looks], { fd3: true, write: LINE4 });
  ok(red.j && (red.j.form !== 'plain' || red.j.fstat3 > 0 || red.j.rest !== want), `RED CONTROL — today's code (fd 3 looked at with no word): ${red.j && red.j.form}; fd 3 looked at ${red.j && red.j.fstat3} times; the line ${red.j && red.j.rest === want ? 'left' : 'TAKEN'} — a plain hub took itself for a piped one`, red);
}

console.log('— ⑤ THE SECRET travels only on fd 3 and in memory');
{
  const d = await HP.decide({ pipe: pipeWith(START) });
  const runs = [await bootThrough(HP, d), await bootThrough(HP, d, { deathAfter: true }), await bootThrough(HP, d, { joinResult: 'refused' })];
  const said = runs.flatMap((r) => [...r.lines, JSON.stringify(r.record)]).join('\n');
  ok(said.length > 0 && !said.includes(SECRET), `every line the module said (${runs.reduce((n, r) => n + r.lines.length, 0)}) and every record: no secret`);
  const leaky = await bootThrough(mutant("try { log.log?.(`[hub-port] ${JSON.stringify(record)}`); } catch { } if (pendingPem", "try { log.log?.(`[hub-port] ${JSON.stringify(decision.start)}`); } catch { } if (pendingPem"), d);
  ok(leaky.lines.join('\n').includes(SECRET), 'RED CONTROL — the start line logged: the secret is in the output', leaky.lines);
  // A REAL fd 3: a child decides from its inherited start pipe; its output, argv and environment
  const probe = path.join(T, 'probe.cjs');
  fs.writeFileSync(probe, `require(${JSON.stringify(path.join(REPO, 'src/server/hub-port.js'))}).decide().then((d) => { console.log('form ' + d.form + ' link ' + (d.start && d.start.link)); setTimeout(() => process.exit(0), 300); });\n`);
  const child = spawn(process.execPath, [probe], { stdio: ['ignore', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, VIBESPACE_START_FD: '3' } });
  let out = ''; child.stdout.on('data', (b) => { out += b; }); child.stderr.on('data', (b) => { out += b; });
  child.stdio[3].write(JSON.stringify(START) + '\n');
  await sleep(150);
  let argv = '', environ = '';
  try { argv = fs.readFileSync(`/proc/${child.pid}/cmdline`, 'utf8'); environ = fs.readFileSync(`/proc/${child.pid}/environ`, 'utf8'); } catch { }
  await new Promise((r) => child.once('exit', r));
  ok(/^form piped link /.test(out) && !out.includes(SECRET) && argv.length > 0 && !argv.includes(SECRET) && !environ.includes(SECRET), `a child with its start pipe on a REAL fd 3: «${out.trim().slice(0, 60)}…»; the secret in its output: ${out.includes(SECRET)}, argv: ${argv.includes(SECRET)}, environment: ${environ.includes(SECRET)}`);
  const plainChild = spawn(process.execPath, [probe], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH } });
  let out2 = ''; plainChild.stdout.on('data', (b) => { out2 += b; });
  await new Promise((r) => plainChild.once('exit', r));
  ok(/^form plain/.test(out2), `a child with no fd 3: «${out2.trim()}»`);
}

console.log('— ⑥ THE CERTIFICATE: a piped hub pushes its live pair to the interface (which holds the port); the plain form never');
async function pushes(mod, form) {
  const pushed = [];
  const d = form === 'piped' ? await mod.decide({ pipe: pipeWith(START) }) : await mod.decide({ fd: 99, env: {} });
  const hub = { listen: (port, host, cb) => { setImmediate(() => cb && cb()); return hub; } };
  let release; const joined = new Promise((r) => { release = r; });
  const w = mod.wire(d, { hub, server: {}, join: () => joined.then(() => ({ mux: { control: (m) => pushed.push(m) } })), end: () => { }, log: { log() { }, error() { } } });
  w.pushCertificate({ cert: 'C1', key: 'K1' });   // tls.js's plan answers BEFORE the join lands
  hub.listen(stubPort, '0.0.0.0', () => { });
  await sleep(5); const beforeJoin = pushed.length;
  release(); await sleep(10);
  w.pushCertificate({ cert: 'C2', key: 'K2' }); w.pushCertificate(null);   // a renewal, then serving stopped
  return { beforeJoin, pushed };
}
{
  const law = await pushes(HP, 'piped');
  ok(law.beforeJoin === 0 && JSON.stringify(law.pushed) === JSON.stringify([{ op: 'certificate', cert: 'C1', key: 'K1' }, { op: 'certificate', cert: 'C2', key: 'K2' }, { op: 'certificate' }]), 'piped: the pair that came before the join waits for it, then goes; a renewal goes at once; a stop goes as {op:\'certificate\'} (no pair)', law);
  const plain = await pushes(HP, 'plain');
  ok(plain.pushed.length === 0, 'plain: nothing is pushed (the hub serves its own TLS)', plain);
  const lost = await pushes(mutant("if (pendingPem !== undefined) push(pendingPem); ", ''), 'piped');
  ok(lost.pushed.length === 2 && lost.pushed[0].cert === 'C2', 'RED CONTROL — the waiting pair\'s push cut: the first certificate never reaches the interface (TLS is not served until a renewal)', lost);
}

console.log('— ⑦ THE PLAIN FORM IS A DEBT WITH A COUNT (主开发\'s law 3): the hub\'s own listener is ONE seam, owed until the helper\'s count reaches its floor');
/** THE DEBT'S JUDGEMENT: owed while hub boots outside the helper remain above the floor; at it, the words say B2c */
const LISTENER_DEBT_FLOOR = 1;   // the boot helper's answer (lane chrome-157, 2026-11-17): the floor is 1 — test-update-road boots its own STUB server.js, which stays outside the helper; every real hub a suite runs is the helper's
const debt = (count) => (count > LISTENER_DEBT_FLOOR
  ? { owed: true, words: `owed: ${count} hub boots outside the helper, the floor ${LISTENER_DEBT_FLOOR}` }
  : { owed: false, words: `the count is at its floor (${count}) — DELETE THE LISTENER NOW, B2c: remove src/server/hub-port.js plainListen and the plain form, in ONE commit with the helper's last batch` });
{
  const ARCH = read('scripts/test-architecture.mjs');
  const ratchet = (ARCH.match(/const BOOTS_OUTSIDE_HELPER = (\d+);/) || [])[1];
  // §57c's own pattern, where the tree has no helper yet: strings and comments are not skipped, so it can only OVERcount —
  // it may delay the red, never fire it early
  const BOOT = /\b(?:spawn|fork)\(\s*(?:(?:process\.execPath|'node'|"node")\s*,\s*\[|[A-Za-z_$][\w$.]*\s*,\s*\[[^\]]*?(?:process\.execPath|'node'|"node")\s*,)[^\]]*?['"`]server\.js['"`]/g;
  const files = fs.readdirSync(path.join(REPO, 'scripts')).filter((x) => /\.mjs$/.test(x) && !/^dbg-/.test(x) && x !== 'hub-boot.mjs' && x !== 'test-hub-port.mjs');
  const counted = files.reduce((nn, x) => nn + [...read(`scripts/${x}`).matchAll(BOOT)].length, 0);
  const count = ratchet !== undefined ? Number(ratchet) : counted;
  const j = debt(count);
  ok(j.owed, `§B2c THE HUB'S OWN LISTENER — ${j.words} (${ratchet !== undefined ? `test-architecture §57c BOOTS_OUTSIDE_HELPER = ${ratchet}` : `counted by §57c's pattern: ${counted} — the helper is not on this tree yet`})`);
  const atFloor = debt(LISTENER_DEBT_FLOOR);
  ok(!atFloor.owed && /DELETE THE LISTENER NOW, B2c/.test(atFloor.words), `RED CONTROL — the count at its floor: the assert goes red and says «${atFloor.words.slice(atFloor.words.indexOf('DELETE'), atFloor.words.indexOf('DELETE') + 34)}…»`);
  const SRV = read('server.js'), HPS = read('src/server/hub-port.js');
  ok((SRV.match(/\bhub\.listen\(/g) || []).length === 1 && (HPS.match(/\bplainListen\(/g) || []).length === 2 && /function plainListen\(hub, port, host, cb\) \{ return hub\.listen\(port, host, cb\); \}/.test(HPS), 'ONE seam: server.js makes ONE boot call (hub.listen), and the hub\'s own listener is reached only through src/server/hub-port.js plainListen (defined once, called once)');
}

console.log('— ⑧ WITH THE WORD, EVERY BAD START ENDS BY NAME IN BOUNDED TIME; THE WORD GOES NO FURTHER');
{
  const fileFd = fs.openSync(path.join(T, 'not-a-pipe'), 'w+');
  const dFile = await HP.decide({ env: { [SP.START_WORD]: String(fileFd) } });
  const rFile = await bootThrough(HP, dFile);
  fs.closeSync(fileFd);
  ok(dFile.why === 'not-a-pipe' && endedOnly(rFile) && rFile.lines.some((l) => l.includes(`the start pipe (fd ${fileFd}) named by VIBESPACE_START_FD is no pipe or socket`)), `the word naming a FILE: «${rFile.lines.join(' | ').slice(0, 150)}» — it ends, never its own listener, never a join`, { dFile, calls: rFile.calls });
  const words = [];
  for (const w of ['x', '1', '-3', '999']) { const d = await HP.decide({ env: { [SP.START_WORD]: w } }); const r = await bootThrough(HP, d); words.push([w, d.why, endedOnly(r), r.lines.join(' ')]); }
  ok(words.every(([w, why, e, l]) => e && (w === '999' ? why === 'not-open' && l.includes('(fd 999) named by VIBESPACE_START_FD is not open') : why === 'no-descriptor' && l.includes('names no descriptor'))), 'the word naming no descriptor (\'x\', a stdio \'1\', \'-3\') or one that is not open (999): each ends by name', words);
  const gone = new PassThrough(); gone.end();
  const dEnd = await HP.decide({ pipe: gone });
  const rEnd = await bootThrough(HP, dEnd);
  ok(dEnd.why === 'ended' && endedOnly(rEnd) && rEnd.lines.some((l) => l.includes('ended before its first line')), `a start pipe that ends before its first line: «${rEnd.lines.join(' | ')}»`, rEnd.lines);
  const SILENT_MS = 120;   // the bound this suite hands the reader (the product's is START_LINE_MS, 5 s)
  const t0 = Date.now();
  const dSilent = await HP.decide({ pipe: new PassThrough(), ms: SILENT_MS });
  const tookMs = Date.now() - t0;
  const rSilent = await bootThrough(HP, dSilent);
  ok(dSilent.why === 'no-line' && tookMs >= SILENT_MS - 10 && tookMs < 10 * SILENT_MS && endedOnly(rSilent) && rSilent.lines.some((l) => l.includes('no line on the start pipe within 0.12 s')), `a SILENT start pipe: «${rSilent.lines.join(' | ')}» after ${tookMs} ms (the bound 120 ms)`, rSilent.lines);
  const unbounded = overStartPipe("    const timer = setTimeout(() => done({ why: 'no-line', ms }), ms);\n", '    const timer = null;\n');
  let settled = false; unbounded.decide({ pipe: new PassThrough(), ms: SILENT_MS }).then(() => { settled = true; });
  const redWait = Math.max(4 * tookMs, 480);
  await sleep(redWait);
  ok(!settled, `RED CONTROL — the bound cut: a silent start pipe still waits after ${redWait} ms (a hub that never listens and never ends, and says nothing)`);
  const PROBE_BOUND = 150;   // handed to the child's reader (PROBE_MS)
  const real = await runProbe(['silent'], { fd3: true, keepOpen: true, env: { [SP.START_WORD]: '3', PROBE_MS: String(PROBE_BOUND) } });
  ok(real.j && real.j.why === 'no-line' && real.j.ended === 1 && real.j.own === 0 && real.j.ms >= PROBE_BOUND - 10 && real.j.ms < 10 * PROBE_BOUND && real.j.lines.some((l) => l.includes('no line on the start pipe (fd 3) within 0.15 s')), `the WORD on a REAL fd 3 that nobody writes to: «${real.j ? real.j.lines.join(' | ') : real.err}» after ${real.j && real.j.ms} ms (the bound 150 ms)`, real);
  // THE WORD GOES NO FURTHER
  const e1 = { [SP.START_WORD]: '999', PATH: '/x' };
  await HP.decide({ env: e1 });
  const kept = overStartPipe('  delete env[START_WORD];\n', '');
  const e2 = { [SP.START_WORD]: '999', PATH: '/x' };
  await kept.decide({ env: e2 });
  ok(!(SP.START_WORD in e1) && e1.PATH === '/x', 'the word is read once and DELETED from the environment it came in');
  ok(SP.START_WORD in e2, 'RED CONTROL — the delete cut: the word stays in the environment, for every child to inherit');
  const kid = await runProbe(['kid'], { fd3: true, write: JSON.stringify(START) + '\n', env: { [SP.START_WORD]: '3' } });
  ok(kid.j && kid.j.form === 'piped' && kid.j.word === 'gone' && kid.j.kid === 'none' && !JSON.stringify(kid).includes(SECRET), `a piped child: the word ${kid.j && kid.j.word} from its own environment, and ITS child (spawned with a copy of that environment) sees «${kid.j && kid.j.kid}»`, kid.j);
  const carriers = (AE) => {
    const base = { PATH: '/usr/bin', HOME: '/h', [SP.START_WORD]: '3' };
    const outs = { agentEnv: AE.agentEnv(base), daemonEnv: AE.daemonEnv(base), serviceEnv: AE.serviceEnv(base) };
    const lists = { AGENT_ENV_KEEP: [...AE.AGENT_ENV_KEEP], DAEMON_ENV_KEEP: [...AE.DAEMON_ENV_KEEP], SERVICE_ENV_KEEP: [...AE.SERVICE_ENV_KEEP] };
    return [...Object.entries(outs).filter(([, o]) => SP.START_WORD in o).map(([k]) => k), ...Object.entries(lists).filter(([, l]) => l.includes(SP.START_WORD)).map(([k]) => k)];
  };
  const law2 = carriers(require(path.join(REPO, 'src/agent-env.js')));
  ok(law2.length === 0, `the three env lists — agentEnv (agent conversations), daemonEnv (the device agent), serviceEnv (service children) — drop ${SP.START_WORD}, and no keep set names it`, law2);
  const NK = "'VIBESPACE_INSTANCE_NAME', 'VIBESPACE_DEVICE_ROOT'";
  const aeSrc = read('src/agent-env.js'); if (aeSrc.split(NK).length !== 2) throw new Error('CONTROL needle not found exactly once: the agent keep set');
  const NS = "'XDG_RUNTIME_DIR', 'TERM']);";
  if (aeSrc.split(NS).length !== 2) throw new Error('CONTROL needle not found exactly once: the service keep set');
  const red2 = carriers(compileAt('src/agent-env.js', aeSrc.replace(NK, `'VIBESPACE_INSTANCE_NAME', '${SP.START_WORD}', 'VIBESPACE_DEVICE_ROOT'`)));
  ok(red2.includes('agentEnv') && red2.includes('daemonEnv'), `RED CONTROL — the word planted in the agents' keep set: the census names ${red2.join(', ')}`, red2);
  const red3 = carriers(compileAt('src/agent-env.js', aeSrc.replace(NS, `'XDG_RUNTIME_DIR', 'TERM', '${SP.START_WORD}']);`)));
  ok(red3.includes('serviceEnv'), `RED CONTROL — the word planted in the services' keep set: the census names ${red3.join(', ')}`, red3);
  // THE ORDER (the adversarial read's must): the boot TAKES the word at server.js line 5, before any require that can start a
  // child — the boot's first children (which dtach, the CLI probes) run long before decide() at line 109
  const orderOf = (src) => { const L = src.split('\n'), CLAIM = "require('./src/server/hub-port.js').claim()"; const at = L.findIndex((l) => l.includes(CLAIM)); const firstReq = L.findIndex((l, i) => i > 0 && /\brequire\(/.test(l.replace(/\/\/.*$/, '').replace(CLAIM, ''))); const spawnAt = L.findIndex((l) => /\b(?:spawn|spawnSync|execFile|execFileSync|execSync|exec)\(/.test(l.replace(/\/\/.*$/, ''))); const decideAt = L.findIndex((l) => l.includes("require('./src/server/hub-port.js').decide()")); return { at, firstReq, spawnAt, decideAt }; };
  const srv8 = read('server.js'), o8 = orderOf(srv8);
  // server.js starts no child itself: every child is started inside a module it requires, so the first OTHER require is the
  // gate (a direct spawn, should one ever be written into server.js, is judged too)
  ok(o8.at > 0 && o8.at < 8 && o8.at < o8.firstReq && (o8.spawnAt < 0 || o8.at < o8.spawnAt) && o8.at < o8.decideAt && /require\('\.\/src\/server\/hub-port\.js'\)\.decide\(\); hubForm\.then\(\(d\) => require\('\.\/src\/server\/hub-port\.js'\)\.endBadStart\(d\)\);/.test(srv8), `the boot takes the word on server.js line ${o8.at + 1}: before the first other require (line ${o8.firstReq + 1}) — the road to every child the boot starts — ${o8.spawnAt < 0 ? 'no direct spawn in server.js' : `the first direct spawn (line ${o8.spawnAt + 1})`}, and decide (line ${o8.decideAt + 1}); a bad start ends on decide's answer`, o8);
  const late = srv8.replace(" require('./src/server/hub-port.js').claim();", '').replace("const hubForm = require('./src/server/hub-port.js').decide();", "require('./src/server/hub-port.js').claim(); const hubForm = require('./src/server/hub-port.js').decide();");
  const oLate = orderOf(late);
  ok(late !== srv8 && !(oLate.at < oLate.firstReq), `RED CONTROL — the claim moved to the decide line (${oLate.at + 1}): after the first other require (${oLate.firstReq + 1}), so the boot's first children inherit the word`, oLate);
  // A BAD START ENDS AT ONCE (on decide's answer), and once
  const bad = { form: 'piped', start: null, why: 'no-line', fd: 3, ms: 5000 }, bl = [], be = [];
  const did = HP.endBadStart(bad, { end: () => be.push(1), log: { error: (l) => bl.push(String(l)) } });
  const after = await bootThrough(HP, bad);
  ok(did && be.length === 1 && bl.length === 1 && bl[0].includes('no line on the start pipe (fd 3) within 5 s') && after.calls.ended === 0 && after.lines.length === 0 && after.calls.own.length === 0 && after.calls.join.length === 0 && HP.endBadStart({ form: 'plain' }) === false, `a bad start ends on decide's answer: «${bl.join(' | ')}»; the boot's later listen says nothing more and ends nothing more (${after.calls.ended}); a plain start is no bad start`, { bl, after: after.calls });
  const twice = mutant('  decision.ended = true;\n', '');
  const bad2 = { form: 'piped', start: null, why: 'no-line', fd: 3, ms: 5000 }, b2 = [];
  twice.endBadStart(bad2, { end: () => b2.push('end'), log: { error: () => b2.push('line') } });
  const after2 = await bootThrough(twice, bad2);
  ok(after2.calls.ended === 1 && after2.lines.length === 1, `RED CONTROL — the mark cut: the boot's later listen says it AGAIN and ends AGAIN (${after2.lines.length} line, ${after2.calls.ended} end)`, after2.calls);
}

console.log('— ⑨ THE JOIN IS BOUNDED: an interface that accepts the link and never answers — the hub ends by name');
{
  const IP = require(path.join(REPO, 'src/server/interface-party.js'));
  const net = await import('node:net');
  const link = path.join(T, 'silent.sock'), held = [];
  const srv = net.createServer((s) => { held.push(s); });
  await new Promise((r) => srv.listen(link, r));
  const d = { form: 'piped', start: { party: 'hub', secret: 'not-a-secret', link } };
  const JOIN_MS = 120;   // the bound this suite hands the join (the product's is JOIN_ANSWER_MS, 5 s)
  const t0 = Date.now();
  const r = await bootThrough(HP, d, { joinWith: (o) => IP.join({ ...o, answerMs: JOIN_MS }), settleMs: 300 });
  const tookMs = (r.calls.endedAt || Date.now()) - t0;
  ok(r.calls.ended === 1 && r.calls.own.length === 0 && r.calls.cb === 0 && tookMs >= JOIN_MS - 10 && tookMs < 10 * JOIN_MS && r.lines.some((l) => l.includes("the interface never answered this party's hello within 0.12 s — this hub ends")), `accepted and never answered: «${r.lines.join(' | ')}» after ${tookMs} ms (the bound 120 ms) — never its own listener, no boot callback`, r.calls);
  const N9 = '    const silent = setTimeout(() => {   // accepted, never answered: refused BY NAME, the link dropped\n';
  const src9 = read('src/server/interface-party.js'); if (src9.split(N9).length !== 2) throw new Error('CONTROL needle not found exactly once: the join bound');
  const IPx = compileAt('src/server/interface-party.js', src9.replace(N9, N9 + '      return;\n'));
  const redWait = Math.max(4 * tookMs, 480);
  const red = await bootThrough(HP, d, { joinWith: (o) => IPx.join({ ...o, answerMs: JOIN_MS }), settleMs: redWait });
  ok(red.calls.ended === 0 && red.calls.cb === 0, `RED CONTROL — the join's bound cut: after ${redWait} ms the hub has neither joined nor ended (it would wait for ever)`, red.calls);
  for (const s of held) s.destroy();
  srv.close();
  await sleep(20);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
