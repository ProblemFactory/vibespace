#!/usr/bin/env node
// THE INTERFACE AS ITS OWN PROCESS — THE LAWS ON ITS MAIN FILE (the separation, M1 — lane B, piece B2b; src/interface/main.js;
// lane readings' contract v1 §2–§3). main() is driven in-process with its start pipe handed in as a stream, and once as a
// child on a REAL fd 3; today's hub joins through its own road (src/server/interface-party.js) behind an http.Server.
//   ① THE MODULE GRAPH from main.js: src/interface/*, the frame code, the constant-time compare (src/pairing-token.js) and
//     node built-ins — no engine, vault, secret-box, store or normaliser. RED CONTROL: a planted require is caught.
//   ② NO SYNCHRONOUS DISK CALL once it listens: the hub's join and 10 page exchanges through the port — 0 fs *Sync calls.
//     RED CONTROL: a stat planted on the admit road is counted.
//   ③ A PREVIOUS GENERATION'S HELLO IS REFUSED: two admits for the hub — the old start's secret gets auth-fail, the new one's
//     is admitted (each PROVES its start value — the greeting's version 2 — never sends it). RED CONTROL: the proof's check
//     cut ⇒ the old generation is admitted.
//   ④ END OF FILE ON FD 3 ⇒ THE INTERFACE EXITS (the supervisor is gone): exit(0), the port and the link socket closed; and
//     as a child on a real fd 3, the process is gone once the parent closes its end. RED CONTROL: the end's handler cut ⇒
//     no exit.
//   ⑤ THE SECRET travels only on fd 3 and in memory: the child's output, argv and environment carry neither the hub's
//     secret nor the interface's own.
//   ⑥ THE PORT IS THE HUB'S: with PORT / HOST unset the interface listens where server.js would (its own defaults read
//     from server.js's text: 3456, every address). RED CONTROL: the pre-cure defaults (a random port on loopback).
//   ⑦ THE START NAMES ITS PIPE (主开发 00:02Z, law 1 amended; src/start-pipe.js, shared with the hub): without VIBESPACE_START_FD the
//     interface reads no descriptor and ends by name (exit 2); a first line that is no interface start, or a silent pipe,
//     ends by name (exit 2, a bad start's own status — 1 is a start that failed, 0 the supervisor gone) — the silent one inside its bound. (The bound's red control is test-hub-port ⑧'s: one reader.)
//   ⑧ THE LINK'S FOLDER IS THIS ACCOUNT'S ALONE (主开发 r1124 2): a folder any other account can write (777, the group's 770,
//     /tmp's own 1777) is a bad start by name (exit 2), and the file at the link's path is never touched; a folder another
//     account owns is refused too; 700 starts as before. RED CONTROL: the check cut ⇒ it starts on a folder every account can write.
// in-process; a scratch dir under os.tmpdir().
import './scratch.mjs';
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
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(…): its name must be a string — a swapped call is refused'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 500) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) return false; await sleep(5); } return true; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iface-proc-'));
process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
// THE SIGN-IN TABLE every start line names (piece B3b-1: REQUIRED) — in T, this account's alone (mkdtemp: 0700); never written here (sign-in off)
const SIGNIN = { file: path.join(T, 'auth.json') };
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
  pipe.write(JSON.stringify({ op: 'start', party: 'interface', secret: crypto.randomBytes(32).toString('hex'), link, signin: SIGNIN }) + '\n');
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
  // THE INTERFACE'S ONE STORE, allowed BY NAME (主开发 r1060; piece B3b-1): the sign-in table's writer (src/secret-file.js — its
  // async replace) and its single sign-on (src/clerk-auth.js); every other module the walk meets must stay clear of the pattern
  // + src/store-read.js (B-dc3f (1), at the pick of the piped table beside line 729: the id file's one read answered by the store-read law —
  // a PURE module, no store of its own; named at that pick by the second of the two units)
  const SIGNIN_STORE = new Set(['src/secret-file.js', 'src/clerk-auth.js', 'src/store-read.js']);
  ok(JSON.stringify(g.files) === JSON.stringify(['src/agentd/chan-socket.js', 'src/agentd/mux.js', 'src/app-csp.js', 'src/clerk-auth.js', 'src/door.js', 'src/interface/admission.js', 'src/interface/front.js', 'src/interface/index.js', 'src/interface/main.js', 'src/interface/owners.js', 'src/interface/relay.js', 'src/interface/signin.js', 'src/landing-lang.js', 'src/link-proof.js', 'src/local-index.js', 'src/login-page.js', 'src/login-words.js', 'src/secret-file.js', 'src/signin-table.js', 'src/signin-witness.js', 'src/start-pipe.js', 'src/store-read.js', 'src/write-origin.js']) && g.files.every((f) => !FORBIDDEN.test(f) || SIGNIN_STORE.has(f)) && g.builtins.every((b) => builtinModules.includes(b)),
    `the process's graph: ${g.files.join(', ')}; built-ins ${g.builtins.join(', ')} — no engine, vault, secret-box, store or normaliser module but the sign-in table's own (r1060: ${[...SIGNIN_STORE].join(', ')})`, g);
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
  const CHECK = "    if (!proofMatches(hello.proof, digest, nonce, party)) return { ok: false, why: 'proof' };   // a wrong proof: another start value, or a previous generation's\n";
  globalThis.__vsAdmission = compileAt('src/interface/admission.js', once('src/interface/admission.js', CHECK).replace(CHECK, ''));
  globalThis.__vsIndex = compileAt('src/interface/index.js', read('src/interface/index.js').replace("require('./admission.js')", 'globalThis.__vsAdmission'));
  const lax = compileAt('src/interface/main.js', once('src/interface/main.js', "const { create } = require('./index.js');").replace("const { create } = require('./index.js');", 'const { create } = globalThis.__vsIndex;'));
  const red = await generations(lax);
  ok(red.try1 === 'admitted', `RED CONTROL — the proof's check cut: the previous generation is admitted (${red.try1})`, red);
}

console.log('— ④ END OF FILE ON FD 3 ⇒ THE INTERFACE EXITS');
{
  const S = await started();
  S.pipe.end();
  const exited = await until(() => S.exits.length, 2000);
  await sleep(20);
  const port = await GET(S.port, '/after');
  ok(exited && S.exits[0] === 0 && port.status === 0 && !fs.existsSync(S.link), `the start pipe ended: exit(${S.exits[0]}), the port refuses (${port.body}), the link socket removed`, { exits: S.exits, port, link: fs.existsSync(S.link) });
  const END = "    input.on('end', () => stop(0));      // END OF FILE: the supervisor is gone\n";
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
  const child = spawn(process.execPath, [path.join(REPO, 'src/interface/main.js')], { stdio: ['ignore', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, PORT: '0', HOST: '127.0.0.1', VIBESPACE_START_FD: '3' } });
  let out = ''; child.stdout.on('data', (b) => { out += b; }); child.stderr.on('data', (b) => { out += b; });
  let exitCode = null; child.once('exit', (c) => { exitCode = c; });
  child.stdio[3].write(JSON.stringify({ op: 'start', party: 'interface', secret: own, link, signin: SIGNIN }) + '\n' + JSON.stringify({ op: 'admit', party: 'hub', digest: hub.digest }) + '\n');
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

console.log('— ⑥ THE PORT IS THE HUB\'S: PORT / HOST unset ⇒ where server.js would listen');
{
  const M = require(path.join(REPO, 'src/interface/main.js'));
  const srv = read('server.js');
  const hubPort = (/^const PORT = process\.env\.PORT \|\| (\d+);$/m.exec(srv) || [])[1], hubHost = (/^const HOST = process\.env\.HOST \|\| '([^']+)';$/m.exec(srv) || [])[1];
  const unset = M.listenAt({}), set = M.listenAt({ PORT: '0', HOST: '127.0.0.1' });
  ok(hubPort === '3456' && hubHost === '0.0.0.0' && unset.port === Number(hubPort) && unset.host === hubHost && set.port === 0 && set.host === '127.0.0.1', `PORT / HOST unset: the interface listens on ${unset.host}:${unset.port}, server.js's own defaults ${hubHost}:${hubPort}; set: ${set.host}:${set.port}`, { unset, set, hubPort, hubHost });
  const LA = "const listenAt = (env = {}) => ({ port: Number(env.PORT || 3456), host: env.HOST || '0.0.0.0' });";
  const old = compileAt('src/interface/main.js', once('src/interface/main.js', LA).replace(LA, "const listenAt = (env = {}) => ({ port: Number(env.PORT) || 0, host: env.HOST || '127.0.0.1' });"));
  const was = old.listenAt({});
  ok(!(was.port === Number(hubPort) && was.host === hubHost), `RED CONTROL — the pre-cure defaults: ${was.host}:${was.port}, not where the hub listens`, was);
}

console.log('— ⑦ THE START NAMES ITS PIPE: no word ⇒ no descriptor read, it ends by name; a bad first line or a silent pipe ⇒ by name');
{
  const M = require(path.join(REPO, 'src/interface/main.js'));
  const said = (lines) => ({ log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) });
  const l1 = [], x1 = [];
  const m1 = M.main({ env: {}, exit: (c) => x1.push(c), log: said(l1) });
  await until(() => x1.length, 2000);
  ok(x1[0] === 2 && l1.some((l) => l.includes('started without VIBESPACE_START_FD')), `no word: exit(${x1[0]}) «${l1.join(' | ')}»`, { x1, l1 });
  await m1.ready.catch(() => { });
  const l2 = [], x2 = [], hubLine = new PassThrough();
  M.main({ pipe: hubLine, env: { PORT: '0', HOST: '127.0.0.1' }, exit: (c) => x2.push(c), log: said(l2) });
  hubLine.write(JSON.stringify({ op: 'start', party: 'hub', secret: 'not-a-secret', link: path.join(T, 'x.sock') }) + '\n');
  await until(() => x2.length, 2000);
  ok(x2[0] === 2 && l2.some((l) => l.includes('first line is no start')), `a first line that is the HUB's start: exit(${x2[0]}) «${l2.join(' | ')}»`, { x2, l2 });
  const SILENT_MS = 120;   // the bound this suite hands main() (the product's is START_LINE_MS, 5 s)
  const l3 = [], x3 = [], t0 = Date.now();
  M.main({ pipe: new PassThrough(), env: { PORT: '0', HOST: '127.0.0.1' }, exit: (c) => x3.push(c), log: said(l3), startMs: SILENT_MS });
  await until(() => x3.length, 2000);
  const took = Date.now() - t0;
  ok(x3[0] === 2 && took >= SILENT_MS - 10 && took < 10 * SILENT_MS && l3.some((l) => l.includes('no line on the start pipe within 0.12 s')), `a SILENT start pipe: exit(${x3[0]}) after ${took} ms (the bound 120 ms) «${l3.join(' | ')}»`, { x3, l3 });
}

console.log('— ⑧ THE LINK\'S FOLDER IS THIS ACCOUNT\'S ALONE: a folder others can write ⇒ a bad start by name (exit 2), its path never touched');
{
  const M = require(path.join(REPO, 'src/interface/main.js'));
  const said = (lines) => ({ log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) });
  let nf = 0;
  /** main() with its link in a fresh folder of `mode` — a FILE planted at the link's path first, to see it is never touched */
  async function onFolder(mode, mod = M, prep = null) {
    const dir = path.join(T, `folder${++nf}`); fs.mkdirSync(dir); fs.chmodSync(dir, mode);
    if (prep) prep(dir);   // r5506: the account files handed in for THIS folder's group (main.js's seam)
    const link = path.join(dir, 'link.sock'); fs.writeFileSync(link, 'what stood here before');
    const lines = [], exits = [], pipe = new PassThrough();
    const m = mod.main({ pipe, env: { PORT: '0', HOST: '127.0.0.1' }, exit: (c) => exits.push(c), log: said(lines) });
    pipe.write(JSON.stringify({ op: 'start', party: 'interface', secret: crypto.randomBytes(32).toString('hex'), link, signin: SIGNIN }) + '\n');
    const up = await m.ready.then(() => true, () => false);
    let kept = null; try { kept = fs.readFileSync(link, 'utf8'); } catch { }
    if (up) await m.stop(0); else await until(() => exits.length, 2000);
    fs.chmodSync(dir, 0o700);
    return { mode: mode.toString(8), up, exits, lines, kept };
  }
  const shut = [await onFolder(0o777), await onFolder(0o1777)];   // every account; /tmp's own shape
  ok(shut.every((r) => !r.up && r.exits[0] === 2 && r.kept === 'what stood here before' && r.lines.some((l) => l.includes(`can be written by every account (mode ${r.mode})`) && l.includes('chmod o-w') && l.includes('it ends'))), `a folder others can write is refused by name, exit 2, before its path is touched: ${shut.map((r) => `${r.mode} → exit ${r.exits[0]}, «${(r.lines[0] || '').slice(0, 70)}…»`).join(' · ')}`, shut);
  // 主开发 r5504 / r5506: THE GROUP's write bit — accepted only when the group is provably this account's own (its primary group, no member
  // in the group file, no other primary in the account file); the account files handed in through main.js's seam, each read counted
  const UIDp = typeof process.getuid === 'function' ? process.getuid() : null, GIDp = typeof process.getgid === 'function' ? process.getgid() : null;
  if (UIDp !== null && GIDp !== null) {
    let reads = 0;
    const seamFor = (members) => (dir) => { const gid = fs.statSync(dir).gid; M._accounts({ gid, read: async (n) => { reads++; return n === 'group' ? `grp:x:${gid}:${members}\n` : `me:x:${UIDp}:${gid}::/home/me:/bin/sh\n`; } }); };
    reads = 0; const shared = await onFolder(0o770, M, seamFor('me,ann,bob')); const sharedReads = reads; M._accounts(null);
    reads = 0; const mine = await onFolder(0o770, M, seamFor('')); const mineReads = reads; M._accounts(null);
    ok(!shared.up && shared.exits[0] === 2 && shared.kept === 'what stood here before' && shared.lines.some((l) => l.includes('can be written by its group grp, which 2 other accounts belong to (mode 770)') && l.includes('chmod g-w') && !/\bann\b|\bbob\b/.test(l)) && sharedReads === 2
      && mine.up && mine.exits[0] === 0 && mineReads === 2,
      `a 770 folder: its group SHARED (placed, two other members) — refused by name, exit 2, the path untouched, the count and the door in the words, no name; the account's OWN private group — it starts (the account files read: ${sharedReads}, ${mineReads})`, { shared: shared.lines[0], mine: mine.up });
  }
  const own = await onFolder(0o700);
  const other = await M.linkFolderWhy(path.join(T, 'x.sock'), (typeof process.getuid === 'function' ? process.getuid() : 0) + 1);
  ok(own.up && own.exits[0] === 0 && typeof other === 'string' && other.includes('belongs to another account'), `a folder of this account alone (700) starts as before; one another account owns is refused: «${other}»`, { own, other });
  const FOLDER = '    if (folder) { const e = new Error(folder); e.badStart = true; throw e; }\n';
  const open = await onFolder(0o777, compileAt('src/interface/main.js', once('src/interface/main.js', FOLDER).replace(FOLDER, '')));
  ok(open.up && open.kept !== 'what stood here before', `RED CONTROL — the check cut: it starts on a folder every account can write (up ${open.up}), the file at its path removed`, open);
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
