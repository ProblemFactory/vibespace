#!/usr/bin/env node
// THE STAY'S WINDOW, RUN FOR REAL (row B-27e8 — 主开发 r1132; lane bl-loop-a): what test-agentd-stay read and did not drive. The agent's
// BUILT bundle runs as daemons of their own roots against a stand-in hub on their sockets; a SIGNED self-upgrade lands; its
// successor cannot start (the node they run from is gone, or the file table is full). Each condition is PLACED in the built bundle
// by one edit (said applied), never made by load:
//  ① A THIRD PROCESS TAKES THE LOCK IN THE WINDOW (spawnNext's unlinks, the failed start and the stay's re-acquire): a live agent of the
//     same root writes its lock right after the unlinks ⇒ the stay refuses it: exit 75 BY NAME, the other agent's lock left as it is
//  ② …OR THE SOCKET: a third process listens on the path right after the unlinks ⇒ the stay cannot listen again: exit 75 BY NAME, the
//     other process's socket still answers
//  ③ A LISTENING SERVER'S LATER ERROR AFTER A STAY takes the boot's own fatal road (serverFatal: exit 1, said); RED: the stay's error
//     handler without its «listening» branch ⇒ read as a failed re-listen (exit 75)
//  ④ A SUCCESSOR START THAT FAILS WITH EMFILE inside a real daemon (its table filled around the start, released after it): the error
//     is heard and the daemon STAYS; RED: the successor's error listener cut (the shape before B-147f) ⇒ the unheard error ends it.
//     The table is bounded first (prlimit --nofile=1024, said if it fails) and the fill stops at 4096: no prlimit on the machine ⇒ ④
//     is SKIPPED BY NAME, never a fill of whatever table the daemon inherited
// Every wait is bounded on what happened; the roads are waited for together.
// Run: node scripts/test-agentd-stay-window.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIG = require(path.join(REPO, 'src/agentd-signature.js'));
const { Mux, PROTO_VERSION } = require(path.join(REPO, 'src/agentd/mux.js'));
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n      ' + JSON.stringify(extra).slice(0, 1500) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 25) => { const end = Date.now() + ms; for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return v; await sleep(step); } };
const T = scratch('agentd-window');
fs.mkdirSync(T, { recursive: true });

const kids = [];
const endKids = (sig) => { for (const c of kids) if (c.exitCode === null && c.signalCode === null) { try { c.kill(sig); } catch { } } };
process.on('exit', () => endKids('SIGKILL'));
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { endKids('SIGKILL'); process.exit(128 + os.constants.signals[sig]); });

const C = { crypto }, K = SIG.generateKeyPair(C), KROW = { keyId: K.keyId, publicKey: K.publicKey };
const bundle = path.join(T, 'agentd-window.js');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), ['src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', '--external:xlsx', '--preserve-symlinks', `--outfile=${bundle}`, '--log-level=error'], { cwd: REPO });
const bsrc = fs.readFileSync(bundle, 'utf8').replace(/\b(const|var|let) RELEASE_KEYS = \[[^\]]*\];/, (_, kw) => `${kw} RELEASE_KEYS = [];`);
const realVersion = (/\bVERSION\s*:\s*"(\d+\.\d+\.\d+)"/.exec(bsrc) || [])[1];
// THE PLANTS, placed by POSITION in the built bundle (its spelling is esbuild's): spawnNext's two unlinks (the lock's, the socket's)
const plantAfterUnlinks = (src, code) => {
  const s0 = src.indexOf('spawnNext: () => {'); if (s0 < 0) return src;
  const u1 = src.indexOf('.unlinkSync(', s0), u2 = u1 < 0 ? -1 : src.indexOf('.unlinkSync(', u1 + 1);
  const c2 = u2 < 0 ? -1 : src.indexOf('catch', u2), b2 = c2 < 0 ? -1 : src.indexOf('}', c2);
  const nm = (i) => (/^\.unlinkSync\(([\w$]+)\)/.exec(src.slice(i)) || [])[1], fsName = u1 < 0 ? null : (/([\w$]+)$/.exec(src.slice(Math.max(0, u1 - 40), u1)) || [])[1];
  if (b2 < 0 || !nm(u1) || !nm(u2) || !fsName) return src;
  return src.slice(0, b2 + 1) + '\n' + code({ fs: fsName, lock: nm(u1), sock: nm(u2) }) + '\n' + src.slice(b2 + 1);
};
const serverName = (/([\w$]+)\.removeAllListeners\("error"\);\s*let [\w$]+ = false;/.exec(bsrc) || [])[1];
const plantInStayListening = (src, code) => { const i = src.indexOf('const stayListening = () => {'); return i < 0 ? src : src.slice(0, i + 'const stayListening = () => {'.length) + '\n' + code + '\n' + src.slice(i + 'const stayListening = () => {'.length); };
const PRLIMIT = (() => { try { execFileSync('prlimit', ['--version'], { stdio: 'ignore', timeout: 5000 }); return true; } catch { return false; } })();
const fillAroundStart = (src) => {   // the file table FULL during the successor's start, released right after it
  const s0 = src.indexOf('spawnNext: () => {'); if (s0 < 0) return src;
  const re = /return ([\w$]*startSuccessor[\w$]*)\(/g; re.lastIndex = s0; const m = re.exec(src); if (!m) return src;
  const end = src.indexOf(';', m.index); if (end < 0) return src;
  const call = src.slice(m.index + 'return '.length, end);
  return src.slice(0, m.index) + `{ const __fs = require("fs"); const __h = []; try { for (let __i = 0; __i < 4096; __i++) __h.push(__fs.openSync("/dev/null", "r")); } catch { } let __r; try { __r = ${call}; } finally { for (const __f of __h) { try { __fs.closeSync(__f); } catch { } } } return __r; }` + src.slice(end + 1);
};
const muts = {
  thirdLock: plantAfterUnlinks(bsrc, ({ fs: F, lock }) => `${F}.writeFileSync(${lock}, String(process.env.VS_PLANT_THIRD || ""));`),
  thirdSock: plantAfterUnlinks(bsrc, ({ fs: F, sock }) => `${F}.writeFileSync(process.env.VS_PLANT_GO, "1"); { const __e = Date.now() + 8000; while (!${F}.existsSync(${sock}) && Date.now() < __e) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); }`),
  serverErr: serverName ? plantInStayListening(bsrc, `setTimeout(() => ${serverName}.emit("error", Object.assign(new Error("planted: the listening server failed"), { code: "EPLANTED" })), 300);`) : bsrc,
  emfile: fillAroundStart(bsrc),
};
muts.serverErrRed = muts.serverErr.replace(/(const stayFatal[\w$]* = \(([\w$]+)\) => \{)\s*if \(stayUp[\w$]*\) \{\s*serverFatal[\w$]*\(\2\);\s*return;\s*\}/, '$1');
muts.emfileRed = muts.emfile.replace(/[\w$]+\.on\("error", \(([\w$]+)\) => log[\w$]*\(`the successor could not be started: [^`]*`\)\);/, '/* the successor\'s error listener cut */');
ok(!!realVersion && Object.values(muts).every((m) => m !== bsrc) && muts.serverErrRed !== muts.serverErr && muts.emfileRed !== muts.emfile,
  `(the base: the built bundle ${realVersion}, its release keys emptied; six copies, each condition placed by one edit: ${Object.entries(muts).map(([k, m]) => `${k} ${m !== bsrc ? 'applied' : 'NOT APPLIED'}`).join(', ')}${muts.serverErrRed === muts.serverErr ? ' — serverErrRed NOT APPLIED' : ''}${muts.emfileRed === muts.emfile ? ' — emfileRed NOT APPLIED' : ''})`);
// the node ①–③ run from: a HARD LINK that goes after their boot (a successor from it cannot start), else a COPY across file systems
const NODE = path.join(T, 'node-gone');
try { fs.linkSync(process.execPath, NODE); } catch (e) { if (e && e.code === 'EXDEV') { fs.copyFileSync(process.execPath, NODE); fs.chmodSync(NODE, 0o755); } else throw e; }
const HOMEN = path.join(T, 'home'); fs.mkdirSync(HOMEN, { recursive: true });   // never the person's HOME
const tok = (p) => [p, '_'].join('') + crypto.randomBytes(12).toString('hex');   // built at run time (no token-shaped literal)
const install = (name, src) => {
  const root = path.join(T, name);
  const inst = path.join(root, realVersion); fs.mkdirSync(inst, { recursive: true });
  fs.writeFileSync(path.join(inst, 'agentd.js'), src);
  fs.symlinkSync(inst, path.join(root, 'current'));
  const state = path.join(root, 'state'); fs.mkdirSync(state, { recursive: true, mode: 0o700 });
  const token = tok('vsht');
  fs.writeFileSync(path.join(state, 'token'), token, { mode: 0o600 });
  fs.writeFileSync(path.join(state, 'trusted-keys.json'), SIG.trustText([KROW], { from: 'test', at: 'x' }), { mode: 0o600 });
  const read = (f) => { try { return fs.readFileSync(path.join(state, f), 'utf8'); } catch { return null; } };
  return { name, root, state, token, lock: path.join(state, 'agentd.lock'), log: () => read('agentd.log') || '', lockPid: () => { const t = read('agentd.lock'); return t == null ? null : t.trim(); } };
};
const start = (d, { node = NODE, env = {} } = {}) => {
  const c = spawn(node, [path.join(d.root, 'current', 'agentd.js')], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: HOMEN, VIBESPACE_AGENTD_ROOT: d.root, VIBESPACE_DEVICE_ROOT: d.root, ...env } });
  c.unref(); kids.push(c); d.child = c;
  d.exited = null; c.once('exit', (code, sig) => { d.exited = { code, sig }; });
};
const link = (stream, token) => {
  const inbox = []; let waiters = [];
  const mux = new Mux(stream, { onControl: (m) => { inbox.push(m); waiters = waiters.filter((w) => !w(m)); }, onData: () => { }, onDead: () => { } });
  const wait = (pred, ms = 10000) => new Promise((res) => {
    const hit = inbox.find(pred); if (hit) { inbox.splice(inbox.indexOf(hit), 1); res(hit); return; }
    const t = setTimeout(() => res({ op: 'TIMEOUT' }), ms);
    waiters.push((m) => { if (!pred(m)) return false; clearTimeout(t); inbox.splice(inbox.indexOf(m), 1); res(m); return true; });
  });
  return { mux, wait, hello: () => { mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: token }); return wait((m) => m.op === 'hello-ack'); } };
};
const sockOf = (d) => until(() => { try { const p = fs.readFileSync(path.join(d.state, 'socket-path'), 'utf8').trim(); return fs.existsSync(p) ? p : null; } catch { return null; } }, 10000);
const sockLink = async (d) => { const p = await sockOf(d); if (!p) return null; const s = net.connect(p); const okc = await new Promise((r) => { s.once('connect', () => r(true)); s.once('error', () => r(false)); }); if (!okc) return null; const L = link(s, d.token); const ack = await L.hello(); return { L, s, ack, p }; };
const NEXT = '9.9.7', next = Buffer.from(`/* the next release: never started */\n/* module.exports = { VERSION: "${NEXT}" }; */\n`);
const push = async (L) => { L.mux.control({ op: 'upgrade', version: NEXT, size: next.length, sig: SIG.sign(K.privateKeyPem, next, NEXT, C) }); L.mux.data(1, next); return L.wait((m) => m.op === 'upgrade-done' || m.op === 'upgrade-failed', 15000); };
const stayed = (d) => /upgrade hand-over: the successor did not start — this daemon stays, listening again on /.test(d.log());
const connects = (p) => new Promise((r) => { const s = net.connect(p); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });

try {
  console.log('the stay\'s window, run for real: a third process in it, a server error after it, a successor that fails EMFILE');
  // ① the third agent: a live process of the same root that reads as an agent (its title, its root in its environ)
  const W1 = install('third-lock', muts.thirdLock), W2 = install('third-sock', muts.thirdSock);
  const W3 = install('server-error', muts.serverErr), W3r = install('server-error-red', muts.serverErrRed);
  const W4 = install('emfile', muts.emfile), W4r = install('emfile-red', muts.emfileRed);
  const third = spawn(process.execPath, ['-e', "process.title = 'vibespace-device'; setInterval(() => { }, 1000);"], { stdio: 'ignore', env: { ...process.env, VIBESPACE_AGENTD_ROOT: W1.root, VIBESPACE_DEVICE_ROOT: W1.root } });
  kids.push(third);
  const GO = path.join(T, 'third-sock.go');
  start(W1, { env: { VS_PLANT_THIRD: String(third.pid) } }); start(W2, { env: { VS_PLANT_GO: GO } }); start(W3); start(W3r);
  if (PRLIMIT) { start(W4, { node: process.execPath }); start(W4r, { node: process.execPath }); }   // ④: the node is THERE — only the full table fails its start
  const ALL = [W1, W2, W3, W3r, ...(PRLIMIT ? [W4, W4r] : [])], L = {};
  await Promise.all(ALL.map(async (d) => { L[d.name] = await sockLink(d); }));
  const up = ALL.every((d) => L[d.name] && L[d.name].ack.op === 'hello-ack');
  ok(up, `(${ALL.length} real daemons answer hello on their sockets — ${realVersion})`, Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v && v.ack && v.ack.op])));
  // ②'s third process: it listens on W2's socket path the moment the GO file is written (spawnNext's unlinks done)
  const sock2 = L[W2.name] && L[W2.name].p;
  const holder = spawn(process.execPath, ['-e', `const fs = require('fs'), net = require('net'); const go = ${JSON.stringify(GO)}, p = ${JSON.stringify(sock2 || '')}; const t = setInterval(() => { if (fs.existsSync(go)) { clearInterval(t); net.createServer((c) => c.end()).listen(p); } }, 5); setInterval(() => { }, 1000);`], { stdio: 'ignore' });
  kids.push(holder);
  fs.unlinkSync(NODE);   // ①–③: a successor started from it cannot start
  const bounded = {};   // ④: a bounded table to fill — a failed bound is SAID in the leg, never a fill of the inherited one
  if (PRLIMIT) for (const d of [W4, W4r]) { try { execFileSync('prlimit', ['--pid', String(d.child.pid), '--nofile=1024:'], { stdio: 'ignore', timeout: 5000 }); bounded[d.name] = true; } catch (e) { bounded[d.name] = String((e && e.message) || e).slice(0, 160); } }
  const r = {};
  await Promise.all(ALL.map(async (d) => { const k = L[d.name]; r[d.name] = k ? (await push(k.L)).op : 'NO LINK'; try { k && k.s.destroy(); } catch { } }));
  await Promise.all([
    until(() => W1.exited && W2.exited, 10000),
    until(() => W3.exited && W3r.exited, 10000),
    until(() => !PRLIMIT || ((stayed(W4) || W4.exited) && W4r.exited), 10000),
  ]);
  const lockedBy = W1.lockPid();
  ok(r[W1.name] === 'upgrade-done' && !!W1.exited && W1.exited.code === 75 && /upgrade hand-over: it could not stay \(the singleton lock is another agent's, or it could not be opened\) — exit 75/.test(W1.log()) && lockedBy === String(third.pid) && third.exitCode === null,
    `① a third agent takes the LOCK in the window (right after spawnNext's unlinks): the stay refuses it — exit ${W1.exited && W1.exited.code} BY NAME — and the other agent's lock stays (${lockedBy}), its process alive`, { exited: W1.exited, lockedBy, log: W1.log().split('\n').filter((l) => /hand-over|stay/.test(l)).slice(-4) });
  const holds2 = sock2 ? await connects(sock2) : false;
  ok(r[W2.name] === 'upgrade-done' && !!W2.exited && W2.exited.code === 75 && /upgrade hand-over: it could not stay — .* did not listen again \(EADDRINUSE\) — exit 75/.test(W2.log()) && holds2,
    `② a third process takes the SOCKET in the window: the stay cannot listen again — exit ${W2.exited && W2.exited.code} BY NAME — and the other process's socket still answers (${holds2})`, { exited: W2.exited, log: W2.log().split('\n').filter((l) => /hand-over|stay|listen/.test(l)).slice(-4) });
  ok(r[W3.name] === 'upgrade-done' && stayed(W3) && !!W3.exited && W3.exited.code === 1 && /server error: planted: the listening server failed/.test(W3.log()),
    `③ a listening server's error AFTER a stay takes the boot's own fatal road: exit ${W3.exited && W3.exited.code}, «server error: …» said`, { exited: W3.exited, log: W3.log().split('\n').slice(-3) });
  ok(stayed(W3r) && !!W3r.exited && W3r.exited.code === 75 && /did not listen again \(EPLANTED\) — exit 75/.test(W3r.log()),
    `RED ③ the stay's handler without its «listening» branch ⇒ the later error read as a failed re-listen (exit ${W3r.exited && W3r.exited.code})`, { exited: W3r.exited, log: W3r.log().split('\n').slice(-3) });
  if (PRLIMIT) {
  ok(bounded[W4.name] === true && r[W4.name] === 'upgrade-done' && stayed(W4) && W4.exited === null && /the successor could not be started: E[MN]FILE/.test(W4.log()),
    `④ a successor start that fails with EMFILE inside a real daemon (its table full during the start): the error is HEARD and the daemon STAYS, listening again — alive while the red's has ended`, { bounded: bounded[W4.name], exited: W4.exited, log: W4.log().split('\n').filter((l) => /successor|stay/.test(l)).slice(-4) });
  ok(bounded[W4r.name] === true && r[W4r.name] === 'upgrade-done' && !!W4r.exited && W4r.exited.code !== 0 && W4r.exited.code !== 75 && !/the successor could not be started: E[MN]FILE/.test(W4r.log()),
    `RED ④ the successor's error listener cut (the shape before B-147f) ⇒ the unheard EMFILE ends the daemon (exit ${W4r.exited && W4r.exited.code})`, { bounded: bounded[W4r.name], exited: W4r.exited, log: W4r.log().split('\n').slice(-3) });
  } else console.log('  – ④ SKIPPED BY NAME: no prlimit on this machine — the daemon\'s table cannot be bounded, and the leg never fills the one it inherited');
} catch (e) { fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e)); }
finally {
  endKids('SIGTERM');
  await until(() => kids.every((c) => c.exitCode !== null || c.signalCode !== null), 5000);
  endKids('SIGKILL');
  try { fs.unlinkSync(NODE); } catch { }
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
