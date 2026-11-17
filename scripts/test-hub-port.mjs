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
//   ④ Node's own IPC channel on fd 3 (NODE_CHANNEL_FD) is never a start pipe: plain.
//   ⑥ THE CERTIFICATE: a piped hub pushes the pair src/server/tls.js keeps live ({op:'certificate', cert, key}; a stop
//     with no pair); one that comes before the join waits for it; the plain form pushes nothing. RED CONTROL: the waiting
//     pair's push cut ⇒ the first certificate never reaches the interface.
//   ⑤ THE SECRET travels only on fd 3 and in memory: no log line, no record, no error text carries it; a child started
//     with its start pipe on a REAL fd 3 decides «piped» and its own output, argv and environment carry no secret.
//     RED CONTROL: a log of the start line planted ⇒ the secret is found in the output.
//   ⑦ THE PLAIN FORM IS A DEBT WITH A COUNT (law 3): «§B2c THE HUB'S OWN LISTENER» — owed while the hub boots outside the
//     boot helper (test-architecture §57c's BOOTS_OUTSIDE_HELPER where the tree has it, else §57c's own pattern counted:
//     only an overcount) stay above the floor; AT the floor it goes red «DELETE THE LISTENER NOW, B2c». RED CONTROL: the
//     judgement at the floor. And the ONE seam: one boot call in server.js, the own listener only through plainListen.
// in-process; a scratch dir under os.tmpdir().
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
const pipeWith = (...lines) => { const p = new PassThrough(); for (const l of lines) p.write(JSON.stringify(l) + '\n'); return p; };

/** the hub's boot through `mod`: a stub hub (its own listener counted), a stub join, the lines the module said */
async function bootThrough(mod, decision, { joinResult = 'ack', deathAfter = false } = {}) {
  const calls = { own: [], join: [], ended: 0, cb: 0 }, lines = [];
  const hub = { listen: (port, host, cb) => { calls.own.push([port, host]); setImmediate(() => cb && cb()); return hub; } };
  let dead = null;
  const join = ({ start, onDead }) => { calls.join.push(start && start.link); dead = onDead; return joinResult === 'ack' ? Promise.resolve({}) : Promise.reject(new Error('the interface refused this party (auth-fail)')); };
  const log = { log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) };
  const w = mod.wire(decision, { hub, server: {}, join, end: () => { calls.ended++; }, log });
  hub.listen(3456, '0.0.0.0', () => { calls.cb++; });
  await sleep(10);
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
  const d = await HP.decide({ fd: 99, env: {} });   // fd 99: not open in this process
  ok(d.form === 'plain', 'no start pipe on the fd ⇒ plain');
  const r = await bootThrough(HP, d);
  ok(r.calls.own.length === 1 && JSON.stringify(r.calls.own[0]) === '[3456,"0.0.0.0"]' && r.calls.join.length === 0 && r.calls.cb === 1 && r.record.form === 'plain' && r.record.listened === true && r.record.port === 3456, `the one boot call listened on (PORT, HOST) through the plain seam; the join was called ${r.calls.join.length} times; its record ${JSON.stringify(r.record)}`, r);
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

console.log('— ④ Node\'s own IPC channel is never a start pipe');
{
  const d = await HP.decide({ fd: 3, env: { NODE_CHANNEL_FD: '3' } });
  ok(d.form === 'plain', 'fd 3 named by NODE_CHANNEL_FD (a forked hub\'s IPC) ⇒ plain, its messages never read as a start');
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
  const child = spawn(process.execPath, [probe], { stdio: ['ignore', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH } });
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
  hub.listen(3456, '0.0.0.0', () => { });
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
const LISTENER_DEBT_FLOOR = 0;   // the helper's own law (test-architecture §57c): «at 0 it is the law» — every hub a suite runs is the helper's
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

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
