#!/usr/bin/env node
// THE INTERFACE AS ITS OWN PROCESS — THE LAWS ON ITS MAIN FILE (the separation, M1 — lane B, piece B2b; src/interface/main.js;
// lane readings' contract v1 §2–§3). main() is driven in-process with its start pipe handed in as a stream, and once as a
// child on a REAL fd 3; today's hub joins through its own road (src/server/interface-party.js) behind an http.Server.
//   ① THE MODULE GRAPH from main.js: src/interface/*, the frame code, the constant-time compare (src/pairing-token.js) and
//     node built-ins — no engine, vault, secret-box, store or normaliser. RED CONTROL: a planted require is caught.
//   ② NO SYNCHRONOUS DISK CALL once it listens: the hub's join and 10 page exchanges through the port — 0 fs *Sync calls.
//     RED CONTROL: a stat planted on the admit road is counted.
//   ③ A PREVIOUS GENERATION'S HELLO IS REFUSED: two admits for the hub — the old start's secret gets auth-fail, the new one's
//     is admitted. RED CONTROL: the secret's check cut ⇒ the old generation is admitted.
//   ④ END OF FILE ON FD 3 ⇒ THE INTERFACE EXITS (the supervisor is gone): exit(0), the port and the link socket closed; and
//     as a child on a real fd 3, the process is gone once the parent closes its end. RED CONTROL: the end's handler cut ⇒
//     no exit.
//   ⑤ THE SECRET travels only on fd 3 and in memory: the child's output, argv and environment carry neither the hub's
//     secret nor the interface's own.
// in-process; a scratch dir under os.tmpdir().
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import Module, { createRequire, builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 500) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) return false; await sleep(5); } return true; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iface-proc-'));
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
function compileAt(rel, src) { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src, file); return m.exports; }
const once = (rel, needle) => { const src = read(rel); if (src.split(needle).length !== 2) throw new Error(`CONTROL needle not found exactly once in ${rel}: ${needle.slice(0, 80)}`); return src; };
const quiet = { log() { }, error() { } };
const secretPair = () => { const s = crypto.randomBytes(32).toString('hex'); return { secret: s, digest: crypto.createHash('sha256').update(s).digest('hex') }; };
const { join } = require(path.join(REPO, 'src/server/interface-party.js'));
const GET = (port, p) => new Promise((resolve) => { const q = http.get({ host: '127.0.0.1', port, path: p, agent: false }, (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => resolve({ status: r.statusCode, body: d })); }); q.on('error', (e) => resolve({ status: 0, body: String(e.code) })); });

/** main() over a start pipe it is handed: → { m, pipe, exits, port, link } once it listens */
let n = 0;
async function started(mainMod = require(path.join(REPO, 'src/interface/main.js')), env = {}) {
  const pipe = new PassThrough(), exits = [];
  const link = path.join(T, `m${++n}.sock`);
  const m = mainMod.main({ pipe, env: { PORT: '0', HOST: '127.0.0.1', ...env }, exit: (c) => exits.push(c), log: quiet });
  pipe.write(JSON.stringify({ op: 'start', party: 'interface', secret: crypto.randomBytes(32).toString('hex'), link }) + '\n');
  const at = await m.ready;
  return { m, pipe, exits, port: at.port, link };
}
const hubServer = () => http.createServer((req, res) => { res.setHeader('content-type', 'text/plain'); res.end(`hub saw ${req.method} ${req.url} secure=${!!req.socket.encrypted}`); });

console.log('— ① THE MODULE GRAPH from src/interface/main.js');
function graph(entry, srcOf = read) {
  const files = new Set(), builtins = new Set(), todo = [entry];
  while (todo.length) {
    const rel = todo.pop(); if (files.has(rel)) continue; files.add(rel);
    for (const mm of srcOf(rel).matchAll(/require\(\s*'([^']+)'\s*\)/g)) {
      const req = mm[1];
      if (req.startsWith('.')) todo.push(path.relative(REPO, path.resolve(path.dirname(path.join(REPO, rel)), req.endsWith('.js') ? req : req + '.js')));
      else builtins.add(req.replace(/^node:/, ''));
    }
  }
  return { files: [...files].sort(), builtins: [...builtins].sort() };
}
{
  const g = graph('src/interface/main.js');
  const FORBIDDEN = /engine|vault|secret|store|normali[sz]er|message-manager|accounts|channel|auth\b|session/;
  ok(JSON.stringify(g.files) === JSON.stringify(['src/agentd/mux.js', 'src/interface/admission.js', 'src/interface/front.js', 'src/interface/index.js', 'src/interface/main.js', 'src/interface/owners.js', 'src/interface/relay.js', 'src/pairing-token.js']) && g.files.every((f) => !FORBIDDEN.test(f)) && g.builtins.every((b) => builtinModules.includes(b)),
    `the process's graph: ${g.files.join(', ')}; built-ins ${g.builtins.join(', ')} — no engine, vault, secret-box, store or normaliser module`, g);
  const planted = graph('src/interface/main.js', (rel) => (rel === 'src/interface/main.js' ? once(rel, "const { create } = require('./index.js');") + "\nrequire('../vault.js');\n" : read(rel)));
  ok(planted.files.includes('src/vault.js'), 'RED CONTROL — a planted require of the vault is caught in the graph', planted.files);
}

console.log('— ② NO SYNCHRONOUS DISK CALL once it listens');
async function exchanges(mainMod) {
  const S = await started(mainMod);
  const hub = secretPair();
  S.pipe.write(JSON.stringify({ op: 'admit', party: 'hub', digest: hub.digest }) + '\n'); await sleep(10);
  let count = 0; const saved = {};
  for (const k of Object.keys(fs)) if (/Sync$/.test(k) && typeof fs[k] === 'function') { saved[k] = fs[k]; fs[k] = (...a) => { count++; return saved[k](...a); }; }
  let answers = [];
  try {
    S.pipe.write(JSON.stringify({ op: 'admit', party: 'hub', digest: hub.digest }) + '\n');   // an admit after listen (the planted stat rides this road)
    const srv = hubServer();
    const party = await join({ start: { party: 'hub', secret: hub.secret, link: S.link }, server: srv });
    for (let i = 0; i < 10; i++) answers.push((await GET(S.port, `/x${i}`)).status);
    try { party.mux.destroy(); } catch { }
  } finally { Object.assign(fs, saved); }
  S.pipe.end(); await until(() => S.exits.length, 2000);
  return { count, answers };
}
{
  const law = await exchanges(require(path.join(REPO, 'src/interface/main.js')));
  ok(law.count === 0 && law.answers.length === 10 && law.answers.every((s) => s === 200), `the hub's join and 10 page exchanges through the port: ${law.count} synchronous fs calls; answers ${[...new Set(law.answers)].join(',')}`, law);
  const N = "    else if (m.op === 'admit') iface.admit(m);";
  const planted = compileAt('src/interface/main.js', once('src/interface/main.js', N).replace(N, "    else if (m.op === 'admit') { require('fs').statSync(require('os').tmpdir()); iface.admit(m); }"));
  const red = await exchanges(planted);
  ok(red.count >= 1, `RED CONTROL — a stat planted on the admit road is counted (${red.count})`, red);
}

console.log('— ③ A PREVIOUS GENERATION\'S HELLO IS REFUSED');
async function generations(mainMod) {
  const S = await started(mainMod);
  const g1 = secretPair(), g2 = secretPair();
  S.pipe.write(JSON.stringify({ op: 'admit', party: 'hub', digest: g1.digest }) + '\n');
  S.pipe.write(JSON.stringify({ op: 'admit', party: 'hub', digest: g2.digest }) + '\n'); await sleep(10);   // the hub's next start
  const try1 = await join({ start: { party: 'hub', secret: g1.secret, link: S.link }, server: hubServer() }).then(() => 'admitted', (e) => String(e.message));
  const try2 = await join({ start: { party: 'hub', secret: g2.secret, link: S.link }, server: hubServer() }).then((p) => { try { p.mux.destroy(); } catch { } return 'admitted'; }, (e) => String(e.message));
  S.pipe.end(); await until(() => S.exits.length, 2000);
  return { try1, try2 };
}
{
  const law = await generations(require(path.join(REPO, 'src/interface/main.js')));
  ok(/auth-fail/.test(law.try1) && law.try2 === 'admitted', `the previous start's secret: «${law.try1}»; this start's: ${law.try2}`, law);
  const CHECK = "    if (!tokenMatches(hello.secret, digest)) return { ok: false, why: 'secret' };   // a wrong secret, or a previous generation's\n";
  globalThis.__vsAdmission = compileAt('src/interface/admission.js', once('src/interface/admission.js', CHECK).replace(CHECK, ''));
  globalThis.__vsIndex = compileAt('src/interface/index.js', read('src/interface/index.js').replace("require('./admission.js')", 'globalThis.__vsAdmission'));
  const lax = compileAt('src/interface/main.js', once('src/interface/main.js', "const { create } = require('./index.js');").replace("const { create } = require('./index.js');", 'const { create } = globalThis.__vsIndex;'));
  const red = await generations(lax);
  ok(red.try1 === 'admitted', `RED CONTROL — the secret's check cut: the previous generation is admitted (${red.try1})`, red);
}

console.log('— ④ END OF FILE ON FD 3 ⇒ THE INTERFACE EXITS');
{
  const S = await started();
  S.pipe.end();
  const exited = await until(() => S.exits.length, 2000);
  await sleep(20);
  const port = await GET(S.port, '/after');
  ok(exited && S.exits[0] === 0 && port.status === 0 && !fs.existsSync(S.link), `the start pipe ended: exit(${S.exits[0]}), the port refuses (${port.body}), the link socket removed`, { exits: S.exits, port, link: fs.existsSync(S.link) });
  const END = "  input.on('end', () => stop(0));      // END OF FILE: the supervisor is gone\n";
  const deaf = compileAt('src/interface/main.js', once('src/interface/main.js', END).replace(END, ''));
  const R = await started(deaf);
  R.pipe.end(); await sleep(200);
  ok(R.exits.length === 0, 'RED CONTROL — the end\'s handler cut: the start pipe ended and the interface does NOT exit', R.exits);
  R.m.stop(0); await until(() => R.exits.length, 2000);
}

console.log('— ④ and ⑤ as a CHILD on a REAL fd 3: it exits when its pipe ends; its output, argv and environment carry no secret');
{
  const own = crypto.randomBytes(32).toString('hex'), hub = secretPair();
  const link = path.join(T, 'child.sock');
  const child = spawn(process.execPath, [path.join(REPO, 'src/interface/main.js')], { stdio: ['ignore', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, PORT: '0', HOST: '127.0.0.1' } });
  let out = ''; child.stdout.on('data', (b) => { out += b; }); child.stderr.on('data', (b) => { out += b; });
  let exitCode = null; child.once('exit', (c) => { exitCode = c; });
  child.stdio[3].write(JSON.stringify({ op: 'start', party: 'interface', secret: own, link }) + '\n' + JSON.stringify({ op: 'admit', party: 'hub', digest: hub.digest }) + '\n');
  const listening = await until(() => /listening on/.test(out), 5000);
  const party = listening ? await join({ start: { party: 'hub', secret: hub.secret, link }, server: hubServer() }).catch(() => null) : null;
  let argv = '', environ = '';
  try { argv = fs.readFileSync(`/proc/${child.pid}/cmdline`, 'utf8'); environ = fs.readFileSync(`/proc/${child.pid}/environ`, 'utf8'); } catch { }
  try { party && party.mux.destroy(); } catch { }
  child.stdio[3].end();   // the supervisor goes
  const gone = await until(() => exitCode !== null, 5000);
  if (!gone) child.kill('SIGKILL');
  ok(listening && !!party && gone && exitCode === 0, `the child listened, admitted the hub, and EXITED (${exitCode}) once its fd 3 ended`, { listening, party: !!party, exitCode, out: out.slice(0, 200) });
  const leaks = [own, hub.secret, hub.digest].filter((v) => out.includes(v) || argv.includes(v) || environ.includes(v));
  ok(argv.length > 0 && leaks.length === 0, `the child's output (${out.length} B), argv and environment: no secret and no digest (${leaks.length} found)`);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
