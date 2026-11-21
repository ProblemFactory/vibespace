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
//   ⑩ A BAD START EXITS WITH ITS OWN STATUS (2), server.js's shutdown exits with it. RED CONTROL: the mark cut ⇒ 0.
//   ⑪ THE START PIPE IS CLOSED BEFORE THE FIRST CHILD (主开发 r724, (A)): the hub reads its one line at server.js line 5 and
//     CLOSES the descriptor there (Node cannot mark an inherited socket close-on-exec). BY MACHINE: server.js's own head, as
//     written, runs in a child with a start pipe on fd 3; a child it then starts holds nothing that points to that pipe.
//     MEASURED (Node 24): child_process with its default stdio and node-pty hand a child NO descriptor past its stdio, even
//     one held open — so the road a held pipe can take is a spawner that passes descriptors through (stdio slot 3): a road
//     the product has NOWHERE today (every longer stdio list in the tree makes a NEW descriptor at slot 3); every
//     leg prints all three. RED CONTROL: the head with the claim cut ⇒ a pass-through child holds it. (⑧ holds the same of
//     decide(): fd 3 closed, every kind of child clean — RED: the close cut; and the line's bound on a real descriptor —
//     RED: the bound cut ⇒ killed.)
//   ⑫ THE RUNTIME-SWITCH ROAD (主开发 r864 small 1; ruled r876 (A)): a REAL switch in a scratch root (a newer runtime provisioned).
//     MEASURED: a Node process's descriptors past its stdio do not cross an exec — a replaced image LOSES its start pipe. So
//     A SUPERVISED START DOES NOT SWITCH: with the word, one image, said once («SUPERVISED: … provisioned v…»), and the claim
//     reads the pipe (RED: the skip cut ⇒ the image is replaced and the start is bad). A PLAIN start switches as before (RED:
//     a skip keyed on anything but the word ⇒ it no longer switches). The claim stays AFTER the runtime boot (RED: before it ⇒
//     the switch never sees the word and the second image comes up plain).
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
/** a wait for WHAT HAPPENED, with its own bound → whether it happened */
const until = async (f, ms) => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 > ms) return false; await sleep(5); } return true; };
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
async function bootThrough(mod, decision, { joinResult = 'ack', joinPlan = null, rejoinMs, deathAfter = false, joinWith = null, settleMs = 10 } = {}) {
  const calls = { own: [], join: [], ended: 0, cb: 0, endedAt: null }, lines = [];
  const hub = { listen: (port, host, cb) => { calls.own.push([port, host]); setImmediate(() => cb && cb()); return hub; } };
  let dead = null;
  // the stub join: each try answers by `joinPlan(n)` (the n-th try) — ack, refused (auth-fail), or gone (no interface at the path)
  const join = joinWith || (({ start, onDead }) => { calls.join.push(start && start.link); dead = onDead; const r = joinPlan ? joinPlan(calls.join.length) : joinResult; return r === 'ack' ? Promise.resolve({}) : r === 'gone' ? Promise.reject(new Error('the link ended before the interface answered (ECONNREFUSED)')) : Promise.reject(new Error('the interface refused this party (auth-fail)')); });
  const log = { log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) };
  const w = mod.wire(decision, { hub, server: {}, join, end: () => { calls.ended++; calls.endedAt = Date.now(); }, log, ...(rejoinMs ? { rejoinMs } : {}) });
  hub.listen(stubPort, '0.0.0.0', () => { calls.cb++; });
  if (joinWith) await until(() => calls.ended > 0 || calls.cb > 0, settleMs); else await sleep(settleMs);   // a real join: wait for the end or the boot callback, bounded
  if (deathAfter && dead) { dead('stream closed'); await until(() => calls.ended > 0 || (joinPlan && calls.join.length > 1 && lines.some((l) => l.includes('took this hub'))), (rejoinMs || 100) * 6); }
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

console.log('— ③ NO FALLBACK: a piped hub whose link dies waits for a new interface within its bound, then ends — never its own listener');
{
  const fresh = async () => HP.decide({ pipe: pipeWith(START) });
  const REJOIN = 150;   // the bound this suite hands the wiring (the product's is REJOIN_MS, 30 s)
  ok(HP.REJOIN_MS === 30000, `the re-join's bound is said by name: REJOIN_MS = ${HP.REJOIN_MS} ms`);
  const died = await bootThrough(HP, await fresh(), { deathAfter: true, rejoinMs: REJOIN, joinPlan: (n) => (n === 1 ? 'ack' : 'gone') });
  ok(died.calls.ended === 1 && died.calls.own.length === 0 && died.calls.join.length >= 2 && died.lines.some((l) => l.includes('no interface took this hub within 0.15 s — this hub ends')), `the link dies and no interface comes back: ${died.calls.join.length - 1} re-join tries, then the hub ends by name (${died.calls.ended}) — its own listener never called (${died.calls.own.length})`, died);
  const back = await bootThrough(HP, await fresh(), { deathAfter: true, rejoinMs: REJOIN, joinPlan: (n) => (n === 2 ? 'gone' : 'ack') });
  ok(back.calls.ended === 0 && back.calls.cb === 1 && back.calls.own.length === 0 && back.lines.some((l) => l.includes('a new interface took this hub (try 2)')), `the link dies and a new interface takes the hub at its second try: it goes on (ended ${back.calls.ended}), the boot callback ran once (${back.calls.cb})`, back);
  const turned = await bootThrough(HP, await fresh(), { deathAfter: true, rejoinMs: REJOIN, joinPlan: (n) => (n === 1 ? 'ack' : 'refused') });
  ok(turned.calls.ended === 1 && turned.calls.join.length === 2 && turned.lines.some((l) => l.includes('the new interface refused this hub')), `the new interface refuses this hub (not its generation): it ends at once by name, after ONE try (${turned.calls.join.length - 1})`, turned);
  const d = await fresh();
  const refused = await bootThrough(HP, d, { joinResult: 'refused' });
  ok(refused.calls.ended === 1 && refused.calls.own.length === 0 && refused.calls.cb === 0, 'a refused join (auth-fail): the hub ends, no boot callback, no listener', refused.calls);
  const noStart = await bootThrough(HP, await HP.decide({ pipe: pipeWith({ op: 'admit', party: 'hub', digest: 'x' }) }));
  ok(noStart.calls.ended === 1 && noStart.calls.own.length === 0 && noStart.calls.join.length === 0, 'a start pipe whose first line is no start: piped, it cannot join — it ends, never its own listener', noStart.calls);
  const ONDEAD = "      const onDead = () => {   // the interface's link ended: every channel with it; this hub waits for a NEW interface (r1060)\n";
  const fallback = await bootThrough(mutant(ONDEAD, ONDEAD + "        listenOwn.apply(hub, [port, host, () => { }]);\n"), await fresh(), { deathAfter: true, rejoinMs: REJOIN, joinPlan: (n) => (n === 1 ? 'ack' : 'gone') });
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
const link3 = () => { try { return fs.readlinkSync('/proc/self/fd/3'); } catch { return null; } };
const ptyKid = () => new Promise((res) => {   // a child started through node-pty (the hub's session holders), its descriptor table
  let pty; try { pty = Module.createRequire(FILE)('node-pty'); } catch (e) { return res({ error: 'node-pty: ' + String(e && e.message).slice(0, 80) }); }
  let out = '', t; try { t = pty.spawn(process.execPath, ['-e', 'const fs=require("fs");const o=[];for(const f of fs.readdirSync("/proc/self/fd")){try{o.push(fs.readlinkSync("/proc/self/fd/"+f))}catch{}}process.stdout.write(JSON.stringify({word:process.env.VIBESPACE_START_FD===undefined?"none":"seen",links:o}))'], { name: 'xterm', cols: 4000, rows: 20, env: { PATH: process.env.PATH } }); } catch (e) { return res({ error: 'spawn: ' + String(e && e.message).slice(0, 80) }); }
  const bound = setTimeout(() => res({ error: 'no exit in 5 s' }), 5000);
  t.onData((d) => { out += d; });
  t.onExit(() => { clearTimeout(bound); const m = /\\{"word".*\\]\\}/.exec(out.replace(/\\r?\\n/g, '')); try { res(JSON.parse(m[0])); } catch { res({ error: 'unparsed', out: out.slice(0, 120) }); } });
});
const startLink = link3();   // what fd 3 points to BEFORE the decision (the start pipe, when one was passed)
const t0 = Date.now();
HP.decide({ ms: Number(process.env.PROBE_MS) || undefined }).then((d) => {
  const lines = []; let ended = 0, own = 0;
  const hub = { listen: () => { own++; return hub; } };
  HP.wire(d, { hub, server: {}, join: () => new Promise(() => { }), end: () => { ended++; }, log: { log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) } });
  hub.listen(0, '0.0.0.0', () => { });
  const ms = Date.now() - t0, looked = fstat3;
  const selfAfter = link3();
  const say = (rest) => { process.stdout.write(JSON.stringify({ form: d.form, why: d.why || null, fstat3: looked, rest, ended, own, lines, word: process.env.VIBESPACE_START_FD === undefined ? 'gone' : 'kept', kid, ms, startLink, selfAfter, kidHolds: !!(kid && startLink && kid.links.includes(startLink)), pty: ptyFacts, ptyHolds: !!(ptyFacts && ptyFacts.links && startLink && ptyFacts.links.includes(startLink)), pass: passFacts && (passFacts.links ? { n: passFacts.links.length } : passFacts), passHolds: !!(passFacts && passFacts.links && startLink && passFacts.links.includes(startLink)) }) + '\\n'); setTimeout(() => process.exit(0), 20); };
  let ptyFacts = null, passFacts = null;
  let kid = null;
  if (mode === 'kid') { try { kid = JSON.parse(require('child_process').spawnSync(process.execPath, ['-e', 'const fs=require("fs");const o=[];for(const f of fs.readdirSync("/proc/self/fd")){try{o.push(fs.readlinkSync("/proc/self/fd/"+f))}catch{}}process.stdout.write(JSON.stringify({word:process.env.VIBESPACE_START_FD===undefined?"none":"seen",links:o}))'], { env: { ...process.env }, encoding: 'utf8' }).stdout); } catch { kid = null; } }   // a CHILD of the decided hub: its environment and its descriptor table
  if (mode === 'kid') { try { const r = require('child_process').spawnSync(process.execPath, ['-e', 'const fs=require("fs");const o=[];for(const f of fs.readdirSync("/proc/self/fd")){try{o.push(fs.readlinkSync("/proc/self/fd/"+f))}catch{}}process.stdout.write(JSON.stringify({word:process.env.VIBESPACE_START_FD===undefined?"none":"seen",links:o}))'], { env: { PATH: process.env.PATH }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore', 3] }); passFacts = r.error ? { error: String(r.error.code || r.error.message) } : JSON.parse(r.stdout); } catch (e) { passFacts = { error: String(e && (e.code || e.message)) }; } }   // a spawner that PASSES descriptors through (stdio slot 3 = this process's fd 3)
  if (mode === 'kid') return ptyKid().then((f) => { ptyFacts = f; say(null); });
  if (mode !== 'read3') return say(null);
  let said = false; const once = (v) => { if (!said) { said = true; say(v); } };   // what is STILL in the pipe, read after the decision
  setTimeout(() => once('timeout'), 1500);
  try { const s = new net.Socket({ fd: 3, readable: true, writable: false }), parts = []; s.on('data', (b) => parts.push(b)); s.on('end', () => once(crypto.createHash('sha256').update(Buffer.concat(parts)).digest('hex'))); s.on('error', (e) => once('error ' + e.code)); } catch (e) { once('error ' + e.code); }
});
`);
async function runProbe(args, { fd3 = false, env = {}, write = null, keepOpen = false, waitMs = 5000 } = {}) {
  const c = spawn(process.execPath, [probe8, ...args], { stdio: ['ignore', 'pipe', 'pipe', ...(fd3 ? ['pipe'] : [])], env: { PATH: process.env.PATH, ...env } });
  let out = '', err = ''; c.stdout.on('data', (b) => { out += b; }); c.stderr.on('data', (b) => { err += b; });
  if (fd3) { c.stdio[3].on('error', () => { }); if (write !== null) c.stdio[3].write(write); if (!keepOpen) c.stdio[3].end(); }   // the child closes its end once it has read its line
  const t0 = Date.now();
  const code = await new Promise((r) => { const k = setTimeout(() => { c.kill('SIGKILL'); r('killed'); }, waitMs); c.once('exit', (x) => { clearTimeout(k); r(x); }); });
  if (fd3) { try { c.stdio[3].destroy(); } catch { } }
  let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch { }
  return { j, code, wall: Date.now() - t0, err: err.slice(0, 300) };
}
const SP = require(path.join(REPO, 'src/start-pipe.js'));
/** src/start-pipe.js with ONE line swapped, under a hub-port.js that reads that copy */
function overStartPipe(needle, into) {
  const src = read('src/start-pipe.js'); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once: ${needle.slice(0, 80)}`);
  globalThis.__vsStartPipe = compileAt('src/start-pipe.js', src.replace(needle, into));
  return compileAt('src/server/hub-port.js', read('src/server/hub-port.js').replace("require('../start-pipe.js')", 'globalThis.__vsStartPipe'));
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
  const N4 = "  return Promise.resolve(judge(env === process.env && claimed ? claimed : takeStart(env, ms)));\n";
  const src4 = read('src/server/hub-port.js'); if (src4.split(N4).length !== 2) throw new Error('CONTROL needle not found exactly once: decide');
  const looks = path.join(T, 'hub-port-looks.js');
  fs.writeFileSync(looks, src4.replace(N4, "  return Promise.resolve(judge(takeStart({ ...env, VIBESPACE_START_FD: '3' }, ms)));\n"));
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
  child.stdio[3].on('error', () => { }); child.stdio[3].write(JSON.stringify(START) + '\n');
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

console.log('— ⑥b THE CERTIFICATE SERVED BEFORE THE WIRING (the pair heavy\'s first real run: TLS through the interface was reset) — held, then pushed after the join');
{
  const SAME = 'let wired = null, earlyPem;\n';
  const early = async (mod, waitMs) => {
    const pushed = []; let release; const joined = new Promise((r) => { release = r; });
    mod.certificate({ cert: 'C0', key: 'K0' });   // tls.js's loadSync: the last pair served at once, before the boot wires the form
    const d = await mod.decide({ pipe: pipeWith(START) });
    const hub = { listen: (port, host, cb) => { setImmediate(() => cb && cb()); return hub; } };
    mod.wire(d, { hub, server: {}, join: () => joined.then(() => ({ mux: { control: (m) => pushed.push(m) } })), end: () => { }, log: { log() { }, error() { } } });
    hub.listen(stubPort, '0.0.0.0', () => { }); release();
    await until(() => pushed.length > 0, waitMs);
    return pushed;
  };
  const law = await early(mutant(SAME, SAME), 2000);
  ok(law.length === 1 && law[0].op === 'certificate' && law[0].cert === 'C0' && law[0].key === 'K0', `a pair served before the wiring reaches the interface once the hub has joined: ${JSON.stringify(law.map((m) => m.cert))}`, law);
  const DROP = 'function certificate(pem) { if (wired) wired.pushCertificate(pem); else earlyPem = pem || null; }';
  const red = await early(mutant(DROP, 'function certificate(pem) { if (wired) wired.pushCertificate(pem); }'), 300);
  ok(red.length === 0, `RED CONTROL — the early pair dropped (B2b's hook: «if (hubPort) …»): the interface gets ${red.length} certificate(s), so every TLS page is reset`, red);
  ok(/onCertificate: \(pem\) => require\('\.\/src\/server\/hub-port\.js'\)\.certificate\(pem\)/.test(read('server.js')), 'server.js hands tls.js the hold (hub-port.js certificate), not a hook that drops what comes before the wiring');
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
  let fileStillOpen = true; try { fs.fstatSync(fileFd); } catch { fileStillOpen = false; }
  const rFile = await bootThrough(HP, dFile);
  if (fileStillOpen) { try { fs.closeSync(fileFd); } catch { } }
  ok(!fileStillOpen, `the descriptor the word named (a file, fd ${fileFd}) is CLOSED by the decision too — no child inherits what the word named`);
  ok(dFile.why === 'not-a-pipe' && endedOnly(rFile) && rFile.lines.some((l) => l.includes(`the start pipe (fd ${fileFd}) named by VIBESPACE_START_FD is no pipe or socket`)), `the word naming a FILE: «${rFile.lines.join(' | ').slice(0, 150)}» — it ends, never its own listener, never a join`, { dFile, calls: rFile.calls });
  const words = [];
  for (const w of ['x', '1', '-3', '999']) { const d = await HP.decide({ env: { [SP.START_WORD]: w } }); const r = await bootThrough(HP, d); words.push([w, d.why, endedOnly(r), r.lines.join(' ')]); }
  ok(words.every(([w, why, e, l]) => e && (w === '999' ? why === 'not-open' && l.includes('(fd 999) named by VIBESPACE_START_FD is not open') : why === 'no-descriptor' && l.includes('names no descriptor'))), 'the word naming no descriptor (\'x\', a stdio \'1\', \'-3\') or one that is not open (999): each ends by name', words);
  const faulty = new PassThrough(); setImmediate(() => faulty.destroy(Object.assign(new Error('the read failed'), { code: 'EIO' })));
  const dFault = await HP.decide({ pipe: faulty });
  const rFault = await bootThrough(HP, dFault);
  ok(dFault.why === 'read-fault' && dFault.code === 'EIO' && endedOnly(rFault) && rFault.lines.some((l) => l.includes('could not be read (EIO)')), `a READ FAULT on the start pipe is said as one, with its code: «${rFault.lines.join(' | ')}»`, { dFault, lines: rFault.lines });
  const asEnded = overStartPipe("    const onFault = (e) => done({ why: 'read-fault', code: (e && e.code) || 'error' });   // a READ FAULT, said as one with its code (never «ended»)\n", "    const onFault = () => done({ why: 'ended' });\n");
  const faulty2 = new PassThrough(); setImmediate(() => faulty2.destroy(Object.assign(new Error('the read failed'), { code: 'EIO' })));
  const dAsEnded = await asEnded.decide({ pipe: faulty2 });
  ok(dAsEnded.why === 'ended', `RED CONTROL — the fault read as an end: «${dAsEnded.why}», the code lost`, dAsEnded);
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
  const NB = "        if (Date.now() >= until) return { word: true, fd, why: 'no-line', ms };\n";
  const srcB = read('src/server/hub-port.js'); if (srcB.split(NB).length !== 2) throw new Error('CONTROL needle not found exactly once: the sync bound');
  const unbound = path.join(T, 'hub-port-unbound.js'); fs.writeFileSync(unbound, srcB.replace(NB, ''));
  const hung = await runProbe(['silent', unbound], { fd3: true, keepOpen: true, env: { [SP.START_WORD]: '3', PROBE_MS: String(PROBE_BOUND) }, waitMs: Math.max(4 * (real.wall || 0), 1500) });
  ok(hung.code === 'killed' && !hung.j, `RED CONTROL — the line's bound cut on a REAL descriptor: the child never decides and is killed at ${Math.max(4 * (real.wall || 0), 1500)} ms (a hub that never listens and never ends)`, { code: hung.code });
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
  ok(kid.j && kid.j.form === 'piped' && kid.j.word === 'gone' && kid.j.kid && kid.j.kid.word === 'none' && !JSON.stringify(kid).includes(SECRET), `a piped child: the word ${kid.j && kid.j.word} from its own environment, and ITS child (spawned with a copy of that environment) sees «${kid.j && kid.j.kid}»`, kid.j);
  ok(kid.j && /^socket:\[\d+\]$/.test(kid.j.startLink || '') && kid.j.selfAfter !== kid.j.startLink && kid.j.kid && kid.j.kid.links.length > 2 && !kid.j.kidHolds && !kid.j.ptyHolds && !kid.j.passHolds, `THE START PIPE IS CLOSED (the B2b cure 2): fd 3 pointed to ${kid.j && kid.j.startLink} before the decision and to ${kid.j && kid.j.selfAfter} after; a child_process child's ${kid.j && kid.j.kid ? kid.j.kid.links.length : 0} descriptors hold it: ${kid.j && kid.j.kidHolds}; a node-pty child's: ${kid.j && (kid.j.pty && kid.j.pty.links ? kid.j.ptyHolds + ' (' + kid.j.pty.links.length + ' read)' : JSON.stringify(kid.j.pty))}; a child of a spawner that passes fd 3 through: ${kid.j && kid.j.passHolds} (${JSON.stringify(kid.j && kid.j.pass)})`, kid.j && { startLink: kid.j.startLink, selfAfter: kid.j.selfAfter, kidLinks: kid.j.kid && kid.j.kid.links, pty: kid.j.pty });
  const NC = '  } finally { try { sock.destroy(); } catch { } }   // THE CLOSE, on every road above\n';
  const srcC = read('src/server/hub-port.js'); if (srcC.split(NC).length !== 2) throw new Error('CONTROL needle not found exactly once: the close');
  const keptCopy = path.join(T, 'hub-port-kept.js'); fs.writeFileSync(keptCopy, srcC.replace(NC, '  } finally { }\n'));
  const kidKept = await runProbe(['kid', keptCopy], { fd3: true, write: JSON.stringify(START) + '\n', env: { [SP.START_WORD]: '3' } });
  // the MEASURED fact (Node 24, the test machines): child_process with its default stdio and node-pty hand a child no descriptor
  // past its stdio, even one this process holds open; a spawner that passes descriptors through does — a road the product has NOWHERE today — every longer stdio list in the tree (data/bin/job-wrapper.js, src/vnc.js, the forks' ipc) makes a NEW descriptor at slot 3; it stands here only to show the leg sees a held pipe.
  ok(kidKept.j && kidKept.j.passHolds === true, `RED CONTROL — the close cut (the pipe left open): a child of a spawner that passes fd 3 through (a road the product has NOWHERE today — every longer stdio list in the tree (data/bin/job-wrapper.js, src/vnc.js, the forks' ipc) makes a NEW descriptor at slot 3; it stands here only to show the leg sees a held pipe) holds it: ${kidKept.j && kidKept.j.passHolds}; (facts: child_process default ${kidKept.j && kidKept.j.kidHolds}, node-pty ${kidKept.j && kidKept.j.ptyHolds}) (${kidKept.j && kidKept.j.startLink})`, kidKept.j && { kidHolds: kidKept.j.kidHolds, ptyHolds: kidKept.j.ptyHolds, selfAfter: kidKept.j.selfAfter, pty: kidKept.j.pty, kidLinks: kidKept.j.kid && kidKept.j.kid.links });
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
  const twice = mutant('  decision.ended = true; badStart = true;\n', '  badStart = true;\n');
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
  const N9 = '    silent = setTimeout(() => {   // accepted, never answered: refused BY NAME, the link dropped (declared after the mux it names)\n';
  const src9 = read('src/server/interface-party.js'); if (src9.split(N9).length !== 2) throw new Error('CONTROL needle not found exactly once: the join bound');
  const IPx = compileAt('src/server/interface-party.js', src9.replace(N9, N9 + '      return;\n'));
  const redWait = Math.max(4 * tookMs, 480);
  const red = await bootThrough(HP, d, { joinWith: (o) => IPx.join({ ...o, answerMs: JOIN_MS }), settleMs: redWait });
  ok(red.calls.ended === 0 && red.calls.cb === 0, `RED CONTROL — the join's bound cut: after ${redWait} ms the hub has neither joined nor ended (it would wait for ever)`, red.calls);
  for (const s of held) s.destroy();
  srv.close();
  await sleep(20);
}

console.log('— ⑩ A BAD START EXITS WITH ITS OWN STATUS (2 — never 0, a stop, nor 1, a crash): server.js\'s shutdown exits with it');
{
  const SAME = 'const EXIT_BAD_START = 2;\n';
  const fresh = mutant(SAME, SAME);   // a fresh copy: no start judged yet
  const before = fresh.exitStatus();
  fresh.endBadStart({ form: 'piped', start: null, why: 'no-line', fd: 3, ms: 5000 }, { end: () => { }, log: { error() { } } });
  const after = fresh.exitStatus();
  const plain = mutant(SAME, SAME); plain.endBadStart({ form: 'plain' }, { end: () => { }, log: { error() { } } });
  ok(before === 0 && after === 2 && fresh.EXIT_BAD_START === 2 && plain.exitStatus() === 0 && /process\.exit\(require\('\.\/src\/server\/hub-port\.js'\)\.exitStatus\(\)\)/.test(read('server.js')), `a stop exits ${before}; after a bad start ${after}; a plain start that ends nothing ${plain.exitStatus()}; server.js's shutdown exits with exitStatus()`);
  const quiet = mutant('  decision.ended = true; badStart = true;\n', '  decision.ended = true;\n');   // stale-pins: kept (the red plants the line WITHOUT the exit mark)
  quiet.endBadStart({ form: 'piped', start: null, why: 'no-line', fd: 3, ms: 5000 }, { end: () => { }, log: { error() { } } });
  ok(quiet.exitStatus() === 0, `RED CONTROL — the mark cut: a bad start exits ${quiet.exitStatus()}, the code of a clean stop`);
}

console.log('— ⑪ THE PIPE IS CLOSED BEFORE THE FIRST CHILD, BY MACHINE: server.js\'s own head, as written, runs with a start pipe on fd 3; a child it then starts holds nothing that points to that pipe');
{
  // server.js's HEAD: its lines up to the first other require (the runtime boot, then the claim) — compiled AS server.js
  // (its requires resolve in the tree; nothing is written into the tree), in a child whose fd 3 is a start pipe the suite
  // holds; the head runs, then the child starts ONE child of its own, the way the boot's first probe does
  const L = read('server.js').split('\n'), CLAIM = " require('./src/server/hub-port.js').claim();";
  const cut = L.findIndex((l, i) => i > 0 && /\brequire\(/.test(l.replace(/\/\/.*$/, '').replace(CLAIM.trim(), '')));
  const head = L.slice(0, cut).join('\n') + '\n';
  const headFile = path.join(T, 'server-head.js'), noClaimFile = path.join(T, 'server-head-noclaim.js');
  fs.writeFileSync(headFile, head); fs.writeFileSync(noClaimFile, head.replace(CLAIM, ''));
  const probe11 = path.join(T, 'probe11.cjs');
  fs.writeFileSync(probe11, `
const fs = require('fs'), path = require('path'), cp = require('child_process'), Module = require('module');
const FILE = ${JSON.stringify(path.join(REPO, 'server.js'))};
const link = (f) => { try { return fs.readlinkSync('/proc/self/fd/' + f); } catch { return null; } };
const before = link(3);
const m = new Module(FILE, null); m.filename = FILE; m.paths = Module._nodeModulePaths(path.dirname(FILE));
let err = null; try { m._compile(fs.readFileSync(process.argv[2], 'utf8'), FILE); } catch (e) { err = String(e && e.message).slice(0, 200); }
const LIST = 'const fs=require("fs");const o=[];for(const f of fs.readdirSync("/proc/self/fd")){try{o.push(fs.readlinkSync("/proc/self/fd/"+f))}catch{}}process.stdout.write(JSON.stringify(o))';
let links = []; try { links = JSON.parse(cp.spawnSync(process.execPath, ['-e', LIST], { encoding: 'utf8', env: { PATH: process.env.PATH } }).stdout); } catch { }
let pass = null; try { const r = cp.spawnSync(process.execPath, ['-e', LIST], { encoding: 'utf8', env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'ignore', 3] }); pass = r.error ? { error: String(r.error.code || r.error.message) } : { links: JSON.parse(r.stdout) }; } catch (e) { pass = { error: String(e && (e.code || e.message)) }; }   // a spawner that PASSES fd 3 through
const ptyLinks = () => new Promise((res) => {   // a child started through node-pty (the hub's session holders)
  let pty; try { pty = Module.createRequire(FILE)('node-pty'); } catch (e) { return res({ error: 'node-pty: ' + String(e && e.message).slice(0, 80) }); }
  let out = '', t; try { t = pty.spawn(process.execPath, ['-e', 'const fs=require("fs");const o=[];for(const f of fs.readdirSync("/proc/self/fd")){try{o.push(fs.readlinkSync("/proc/self/fd/"+f))}catch{}}process.stdout.write("LINKS"+JSON.stringify(o)+"END")'], { name: 'xterm', cols: 4000, rows: 20, env: { PATH: process.env.PATH } }); } catch (e) { return res({ error: 'spawn: ' + String(e && e.message).slice(0, 80) }); }
  const bound = setTimeout(() => res({ error: 'no exit in 5 s' }), 5000);
  t.onData((d) => { out += d; });
  t.onExit(() => { clearTimeout(bound); const flat = out.split('\\r').join('').split('\\n').join(''), a = flat.indexOf('LINKS'), b = flat.indexOf('END', a); try { res({ links: JSON.parse(flat.slice(a + 5, b)) }); } catch { res({ error: 'unparsed', out: flat.slice(0, 120) }); } });
});
ptyLinks().then((pf) => {
  process.stdout.write('\\n' + JSON.stringify({ before, after: link(3), childHolds: !!before && links.includes(before), childLinks: links.length, pty: pf.links ? { n: pf.links.length } : pf, ptyHolds: !!(before && pf.links && pf.links.includes(before)), pass: pass && (pass.links ? { n: pass.links.length } : pass), passHolds: !!(before && pass && pass.links && pass.links.includes(before)), err, word: process.env.VIBESPACE_START_FD === undefined ? 'gone' : 'kept' }) + '\\n');
  setTimeout(() => process.exit(0), 20);
});
`);
  const runHead = async (file) => {
    const c = spawn(process.execPath, [probe11, file], { stdio: ['ignore', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, VIBESPACE_START_FD: '3', NO_AUTO_UPDATE: '1', VIBESPACE_RUNTIME_REEXEC: '1' } });
    let out = '', err = ''; c.stdout.on('data', (b) => { out += b; }); c.stderr.on('data', (b) => { err += b; });
    c.stdio[3].on('error', () => { }); c.stdio[3].write(JSON.stringify(START) + '\n');
    const code = await new Promise((r) => { const k = setTimeout(() => { c.kill('SIGKILL'); r('killed'); }, 10000); c.once('exit', (x) => { clearTimeout(k); r(x); }); });
    try { c.stdio[3].destroy(); } catch { }
    let j = null; try { j = JSON.parse(out.split('\n').filter((l) => l.startsWith('{') && l.includes('"childHolds"')).pop()); } catch { }   // the runtime boot says its own line on a later tick
    return { j, code, leaked: out.includes(SECRET) || err.includes(SECRET), err: err.slice(0, 300) };
  };
  const law = await runHead(headFile);
  ok(cut > 3 && law.j && !law.j.err && /^socket:\[\d+\]$/.test(law.j.before || '') && law.j.after !== law.j.before && law.j.word === 'gone' && law.j.childLinks > 2 && law.j.childHolds === false && law.j.ptyHolds === false && law.j.passHolds === false && !law.leaked, `server.js lines 1–${cut} as written: fd 3 was ${law.j && law.j.before}, after the head ${law.j && law.j.after}; a child_process child holds the start pipe: ${law.j && law.j.childHolds} (${law.j && law.j.childLinks} descriptors read); a node-pty child: ${law.j && law.j.ptyHolds} (${JSON.stringify(law.j && law.j.pty)}); a child of a spawner that passes fd 3 through: ${law.j && law.j.passHolds} (${JSON.stringify(law.j && law.j.pass)}); the word ${law.j && law.j.word}; no secret in its output`, law);
  const red = await runHead(noClaimFile);
  ok(red.j && red.j.passHolds === true, `RED CONTROL — the head with the claim cut (the pipe left open): a child of a spawner that passes fd 3 through (a road the product has nowhere today) holds it: ${red.j && red.j.passHolds}; (facts: child_process default ${red.j && red.j.childHolds}, node-pty ${red.j && red.j.ptyHolds}) (${red.j && red.j.before})`, red.j);
}

console.log('— ⑫ THE RUNTIME-SWITCH ROAD: the head\'s first line replaces the process with a newer runtime — its version probe holds nothing of the start pipe, the pipe survives the replacement, and the NEW image claims it');
{
  // A REAL switch in a scratch root: <root>/data/runtime/current → node-v<newer patch of this major>, whose bin/node is a
  // stand-in (it answers that version to the switch's probe, writing down the probe's own descriptor table; otherwise it execs
  // THIS node) and whose record holds its sha256. server.js's head (lines 1–5 as written) runs with only its rootDir pointed at
  // the scratch root; the first image probes, then execve()s itself — same pid, same argv — and the second image claims.
  const [maj, min, pat] = process.version.slice(1).split('.').map(Number), newer = `v${maj}.${min}.${pat + 1}`;
  const root = path.join(T, 'rt-root'), rtDir = path.join(root, 'data', 'runtime', `node-${newer}`), probeFds = path.join(T, 'rt-probe-fds.txt');
  fs.mkdirSync(path.join(rtDir, 'bin'), { recursive: true });
  const stand = `#!/bin/sh\nif [ "$1" = "-p" ]; then\n  for f in /proc/$$/fd/*; do readlink "$f"; done > ${JSON.stringify(probeFds)}\n  echo ${newer}\n  exit 0\nfi\nexec ${JSON.stringify(process.execPath)} "$@"\n`;
  fs.writeFileSync(path.join(rtDir, 'bin', 'node'), stand, { mode: 0o755 });
  fs.writeFileSync(path.join(rtDir, '.vibespace-runtime.json'), JSON.stringify({ version: newer, platform: process.platform, sha256: crypto.createHash('sha256').update(stand).digest('hex') }));
  try { fs.unlinkSync(path.join(root, 'data', 'runtime', 'current')); } catch { }
  fs.symlinkSync(`node-${newer}`, path.join(root, 'data', 'runtime', 'current'));
  const L = read('server.js').split('\n'), CLAIM = " require('./src/server/hub-port.js').claim();", ROOT = 'boot({ rootDir: __dirname })';
  const cut = L.findIndex((l, i) => i > 0 && /\brequire\(/.test(l.replace(/\/\/.*$/, '').replace(CLAIM.trim(), '')));
  const head = L.slice(0, cut).join('\n') + '\n';
  if (head.split(ROOT).length !== 2 || head.split(CLAIM).length !== 2) throw new Error('CONTROL needle not found exactly once: the head\'s runtime boot or its claim');
  const headAt = (src, name) => { const f = path.join(T, name); fs.writeFileSync(f, src.replace(ROOT, `boot({ rootDir: ${JSON.stringify(root)} })`)); return f; };
  const lawHead = headAt(head, 'rt-head.js');
  const earlyHead = headAt(`require('./src/server/hub-port.js').claim();\n` + head.replace(CLAIM, ''), 'rt-head-early.js');   // RED: the claim BEFORE the runtime boot
  // copies of the switch for the reds: the supervised skip CUT, and a skip keyed on anything but the start word
  const SKIP = "  if (env[START_WORD] !== undefined) return { state: 'supervised', version: cur.version };\n";
  const rtSrc = read('src/node-runtime.js'); if (rtSrc.split(SKIP).length !== 2) throw new Error('CONTROL needle not found exactly once: the supervised skip');
  const rtNoSkip = path.join(T, 'node-runtime-noskip.js'); fs.writeFileSync(rtNoSkip, rtSrc.replace(SKIP, ''));
  const rtAlways = path.join(T, 'node-runtime-always.js'); fs.writeFileSync(rtAlways, rtSrc.replace(SKIP, SKIP.replace('env[START_WORD] !== undefined', 'true')));
  const probe12 = path.join(T, 'probe12.cjs');
  fs.writeFileSync(probe12, `
const fs = require('fs'), path = require('path'), Module = require('module');
const REPO = ${JSON.stringify(REPO)}, FILE = path.join(REPO, 'server.js');
const [headFile, outFile, runtimeCopy] = process.argv.slice(2);
const link = (f) => { try { return fs.readlinkSync('/proc/self/fd/' + f); } catch { return null; } };
const second = process.env.VIBESPACE_RUNTIME_REEXEC !== undefined, from = process.env.VIBESPACE_RUNTIME_REEXEC || null;
if (!second) fs.writeFileSync(outFile + '.first', JSON.stringify({ pid: process.pid, link3: link(3) }));
if (runtimeCopy) { const RT = path.join(REPO, 'src/node-runtime.js'); const r = new Module(RT, null); r.filename = RT; r.paths = Module._nodeModulePaths(path.dirname(RT)); r._compile(fs.readFileSync(runtimeCopy, 'utf8'), RT); r.loaded = true; require.cache[RT] = r; }
const before = link(3);
const m = new Module(FILE, null); m.filename = FILE; m.paths = Module._nodeModulePaths(path.dirname(FILE));
let err = null; try { m._compile(fs.readFileSync(headFile, 'utf8'), FILE); } catch (e) { err = String(e && e.message).slice(0, 200); }
require(path.join(REPO, 'src/server/hub-port.js')).decide().then((d) => {
  fs.writeFileSync(outFile, JSON.stringify({ second, from, pid: process.pid, before, after: link(3), form: d.form, link: d.start ? d.start.link : null, why: d.why || null, word: process.env.VIBESPACE_START_FD === undefined ? 'gone' : 'kept', err }));
  setTimeout(() => process.exit(0), 50);
});
`);
  let n12 = 0;
  const runSwitch = async (headFile, runtimeCopy, { word = true } = {}) => {
    const out = path.join(T, `rt-out-${++n12}.json`); try { fs.unlinkSync(probeFds); } catch { }
    const c = spawn(process.execPath, [probe12, headFile, out, ...(runtimeCopy ? [runtimeCopy] : [])], { stdio: ['ignore', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, NO_AUTO_UPDATE: '1', ...(word ? { VIBESPACE_START_FD: '3' } : {}) } });
    let said = ''; c.stdout.on('data', (b) => { said += b; }); c.stderr.on('data', (b) => { said += b; });
    c.stdio[3].on('error', () => { }); c.stdio[3].write(JSON.stringify(START) + '\n');
    const code = await new Promise((r) => { const k = setTimeout(() => { c.kill('SIGKILL'); r('killed'); }, 15000); c.once('exit', (x) => { clearTimeout(k); r(x); }); });
    try { c.stdio[3].destroy(); } catch { }
    const j = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
    const first = j(out + '.first'), last = j(out);
    let fds = []; try { fds = fs.readFileSync(probeFds, 'utf8').split('\n').filter(Boolean); } catch { }
    return { code, first, last, probeRan: fds.length > 0, probeHolds: !!(first && first.link3 && fds.includes(first.link3)), leaked: said.includes(SECRET), said: said.split(SECRET).join('<the secret>').slice(0, 600) };
  };
  ok(/const START_WORD = 'VIBESPACE_START_FD';/.test(rtSrc) && SP.START_WORD === 'VIBESPACE_START_FD', `the switch knows the start word by the same name as src/start-pipe.js (${SP.START_WORD})`);
  // ONE WAY — A SUPERVISED START (the word present) DOES NOT SWITCH: the first image stays, says so once, and claims its pipe
  const sup = await runSwitch(lawHead);
  const s1 = sup.last, f1 = sup.first;
  ok(!!(s1 && f1) && s1.second === false && s1.pid === f1.pid && !sup.probeRan && s1.form === 'piped' && s1.link === START.link && s1.word === 'gone' && /SUPERVISED: its supervisor started it on v[\d.]+; the instance has provisioned v[\d.]+/.test(sup.said) && sup.said.includes(newer) && !sup.leaked && !s1.err,
    `a SUPERVISED start with ${newer} provisioned: no switch (one image, pid ${s1 && s1.pid}; the version probe ran: ${sup.probeRan}), the claim read its pipe (${s1 && s1.form}, link ${s1 && s1.link === START.link ? 'read' : 'NOT read'}); said once: «${(sup.said.match(/\[runtime\][^\n]*/) || [''])[0].slice(0, 260)}»`, sup);
  const noSkip = await runSwitch(lawHead, rtNoSkip);
  ok(noSkip.last && noSkip.last.second === true && noSkip.last.form === 'piped' && !noSkip.last.link && noSkip.probeRan && !noSkip.probeHolds, `RED CONTROL — the supervised skip cut: the image is replaced (second image ${noSkip.last && noSkip.last.second}), its fd 3 is ${noSkip.last && noSkip.last.before} and the start is BAD (${noSkip.last && noSkip.last.why}) — every supervised start with a newer runtime would exit 2; the probe held nothing (${noSkip.probeHolds})`, noSkip.last);
  // THE OTHER WAY — A PLAIN START (no word) SWITCHES EXACTLY AS BEFORE
  const plain = await runSwitch(lawHead, null, { word: false });
  ok(plain.last && plain.first && plain.last.second === true && plain.last.from === process.version && plain.last.pid === plain.first.pid && plain.last.form === 'plain' && plain.probeRan, `a PLAIN start with ${newer} provisioned switches as before: the probe ran, the image was replaced (pid ${plain.last && plain.last.pid}, from ${plain.last && plain.last.from}), and the new image is ${plain.last && plain.last.form}`, plain);
  const always = await runSwitch(lawHead, rtAlways, { word: false });
  ok(always.last && always.last.second === false, `RED CONTROL — a skip keyed on anything but the start word: a plain start no longer switches (second image ${always.last && always.last.second})`, always.last);
  // and the claim's place: AFTER the runtime boot, or the switch no longer sees the word
  const early = await runSwitch(earlyHead);
  ok(early.last && early.last.second === true && early.last.form === 'plain', `RED CONTROL — the claim BEFORE the runtime boot: the word is gone before the switch looks, so the image is replaced and the second image comes up ${early.last && early.last.form} (a supervised hub that would listen on the port itself)`, early.last);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
