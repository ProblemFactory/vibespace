#!/usr/bin/env node
// THE DEVICE AGENT STAYS WHEN ITS SUCCESSOR CANNOT START — RUN FOR REAL (B-147f, round w59hqoiqb; lane bl-loop-a). Split out of
// test-hub-start-failures (THE TIER RULE: that row stays under the fast bound, and so does this one). The agent's BUILT bundle
// (esbuild with the release's flags, the strip step aside) runs as daemons of their own roots and HOME against a stand-in hub; a
// SIGNED self-upgrade lands (a throwaway release key each device pins); its successor cannot start: the node each daemon runs
// from is GONE (a private copy of node — never a link of its inode, r2029 — removed after the boot: what a package manager's upgrade of node does to a
// running agent).
//  ① a DIALED device STAYS: its lock and its socket taken again, its hub DIALED AGAIN — in both orders: the hub ends the link at
//    upgrade-done BEFORE the stay (the dial the upgrade ended is re-armed) or AFTER it (the close takes the dial's own road) — and
//    its next drop is dialed again too (the upgrade's mark is cleared). RED the stay without its re-dial (the shape before this
//    cure): the dial stays dead; RED the mark left set: the next drop, and a close after the stay, are never dialed again.
//    A close that comes AFTER the stay is the upgrade's end, never a failed dial (the next dial reports none); RED the mark taken
//    away: the next dial reports one.
//  ② a stay whose socket cannot listen again (its folder made read-only: the old socket file cannot go) EXITS 75 BY NAME and its
//    own lock goes; RED the boot's listen handler left on: the boot's fatal road, exit 1.
//  ③ the exit removes the lock ONLY while it names this process: a lock another agent now holds survives the exit; RED the old
//    handler: it is removed.
// Each RED is the built bundle with ONE edit (each said applied). Every wait is bounded on what happened, and the laws are waited
// for TOGETHER: a red's window is the green's own road (the at-once re-dial, the dial's 1 s first backoff) plus a margin.
// NOT RUN here, run ELSEWHERE (row B-27e8): a listening server's later error after a stay, a successor start that fails with EMFILE
// inside a real daemon and a third process in the stay's window — scripts/test-agentd-stay-window.mjs; the pipe conversation's real
// start and a lock that names no process — scripts/test-agentd-debts.mjs.
// Run: node scripts/test-agentd-stay.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
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
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 50) => { const end = Date.now() + ms; for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return v; await sleep(step); } };
const T = scratch('agentd-stay');   // short (the long-root sockets below take a runtime folder under it) and swept by the scratch reaper
fs.mkdirSync(T, { recursive: true });

const kids = [];
const endKids = (sig) => { for (const c of kids) if (c.exitCode === null && c.signalCode === null) { try { c.kill(sig); } catch { } } };
// the daemons are DETACHED (as the release starts them): a gate that ends this suite reaches only its group — they are ended on
// EVERY road out of it, by their handles
process.on('exit', () => endKids('SIGKILL'));
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { endKids('SIGKILL'); process.exit(128 + os.constants.signals[sig]); });

const C = { crypto }, K = SIG.generateKeyPair(C), KROW = { keyId: K.keyId, publicKey: K.publicKey };
const bundle = path.join(T, 'agentd-stay.js');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), ['src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', '--external:xlsx', '--preserve-symlinks', `--outfile=${bundle}`, '--log-level=error'], { cwd: REPO });
// the built bundle with its baked release keys emptied (a build before any signed release): the device trusts K by its file
const bsrc = fs.readFileSync(bundle, 'utf8').replace(/\b(const|var|let) RELEASE_KEYS = \[[^\]]*\];/, (_, kw) => `${kw} RELEASE_KEYS = [];`);
const realVersion = (/\bVERSION\s*:\s*"(\d+\.\d+\.\d+)"/.exec(bsrc) || [])[1];
const muts = {
  noRedial: bsrc.replace(/(redialAfterStay\d*) = \(\) => \{\s*\w+ = 0;\s*\w+\(\);\s*\};/, '/* the stay before this cure: no re-dial */'),
  keepsLanded: bsrc.replace(/(\n\s*)upgradeLanded\d* = false;/, '$1/* the upgrade\'s mark left set */'),
  bootHandler: bsrc.replace(/(\w+)\.removeAllListeners\("error"\);(\s*let \w+ = false;)/, '$2'),
  noCloseMark: bsrc.replace(/if \(!\w+\)\s*closeAfterStay\d* = true;/, '/* no mark for the close after the stay */'),
  oldLockExit: bsrc.replace(/if \((\w+)\.readFileSync\((\w+), "utf-8"\)\.trim\(\) === String\(process\.pid\)\)\s*(\w+)\.unlinkSync\(\2\);/, '$3.unlinkSync($2);'),
};
ok(!!realVersion && Object.values(muts).every((m) => m !== bsrc), `(the base: the built bundle ${realVersion}, its release keys emptied; five RED copies, each with one edit applied: ${Object.entries(muts).map(([k, m]) => `${k} ${m !== bsrc ? 'applied' : 'NOT applied'}`).join(', ')})`);
// the node they run from: a PRIVATE COPY in this suite's scratch, removed after their boot (~100 MB, said with its size) and at
// exit — NEVER A HARD LINK (主开发 r2029): a link changes the real binary's inode (its link count and its change time) while other
// suites run (test-browser-builds read a moved stamp of that shared file once). The copy used to be the fallback across file
// systems (EXDEV, r884); it is the only road now. A symlink cannot stand in: a daemon's process.execPath is the RESOLVED binary
// (/proc/self/exe), so removing a symlink leaves its successor startable. A copy that fails is NOT RUN, by name, red
const NODE = path.join(T, 'node-gone');
const copyNode = (from, to) => { fs.copyFileSync(from, to); fs.chmodSync(to, 0o755); };
function placeNode(dst, { copy = copyNode } = {}) {
  try { copy(process.execPath, dst); return { how: 'copy', bytes: fs.statSync(dst).size }; } catch (e) { return { how: null, why: (e && e.code) || String(e) }; }
}
const binBefore = (() => { const st = fs.statSync(process.execPath); return { nlink: st.nlink, ctimeMs: st.ctimeMs }; })();
const placed = placeNode(NODE);
if (!placed.how) { ok(false, `NOT RUN — the node binary cannot be copied into the scratch (${placed.why}: ${process.execPath} → ${T}); a symlink cannot stand in (process.execPath is the resolved binary)`); console.log(`\n${fail} FAILED (${pass} passed)`); process.exit(1); }
console.log(`  (the node the daemons run from: a PRIVATE COPY of ${process.execPath}, ${(placed.bytes / 1048576).toFixed(1)} MB, removed after their boot)`);
// THE RULE (r2029): the real binary's inode is untouched by the placement (its link count and change time read before and after),
// and NO suite under scripts/ hard-links the running program (a census by text: `linkSync(` or a `link(` handed process.execPath;
// a symlink is not a link of the inode). CONTROL: a planted hard link is named, a planted symlink is not
{
  const st = fs.statSync(process.execPath), want = st.size;
  ok(placed.bytes === want && st.nlink === binBefore.nlink && st.ctimeMs === binBefore.ctimeMs,
    `THE PRIVATE COPY: ${placed.bytes} B of ${want}, executable; the real binary untouched (its link count ${st.nlink}, its change time the same)`, { placed, before: binBefore, after: { nlink: st.nlink, ctimeMs: st.ctimeMs } });
  const HARD = /(?<![A-Za-z])(?:linkSync|link)\(\s*process\.execPath\b/;
  const linkers = (files) => files.filter(([, t]) => t.split('\n').some((l) => HARD.test(l.replace(/\/\/.*$/, '')))).map(([f]) => f);
  const dir = path.join(REPO, 'scripts'), tree = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);
  const found = linkers(tree);
  // the planted texts are built from pieces at run time: this file is in the census too, and never names what it hunts in one piece
  const ctl = linkers([['planted-hard.mjs', 'fs.link' + 'Sync(process.execPath, x);\n'], ['planted-param.mjs', 'li' + 'nk(process.execPath, dst);\n'], ['planted-sym.mjs', 'fs.symlinkSync(process.execPath, x);\n']]);
  ok(!found.length && tree.length > 100, `no suite under scripts/ hard-links the running program (${tree.length} files read: ${found.join(', ') || 'none'})`, found);
  ok(ctl.join() === 'planted-hard.mjs,planted-param.mjs', `CONTROL: a planted hard link and a link handed process.execPath are named, a planted symlink is not (${ctl.join(', ')})`, ctl);
}
const HOMEN = path.join(T, 'home'); fs.mkdirSync(HOMEN, { recursive: true });   // never the person's HOME: its desktop apps, its keepers
const XB = path.join(T, 'x'); fs.mkdirSync(XB, { recursive: true, mode: 0o700 });   // ②'s runtime folders, this suite's own
const tok = (p) => [p, '_'].join('') + crypto.randomBytes(12).toString('hex');   // built at run time (no token-shaped literal)
const install = (name, src, { longRoot = false } = {}) => {
  const root = path.join(T, longRoot ? `${name}-${'r'.repeat(96)}` : name);   // a long root: its socket takes the runtime folder's rung
  const inst = path.join(root, realVersion); fs.mkdirSync(inst, { recursive: true });
  fs.writeFileSync(path.join(inst, 'agentd.js'), src);
  fs.symlinkSync(inst, path.join(root, 'current'));
  const state = path.join(root, 'state'); fs.mkdirSync(state, { recursive: true, mode: 0o700 });
  const token = tok('vsht');
  fs.writeFileSync(path.join(state, 'token'), token, { mode: 0o600 });
  fs.writeFileSync(path.join(state, 'trusted-keys.json'), SIG.trustText([KROW], { from: 'test', at: 'x' }), { mode: 0o600 });
  const read = (f) => { try { return fs.readFileSync(path.join(state, f), 'utf8'); } catch { return null; } };
  return { name, root, state, token, log: () => read('agentd.log') || '', lockPid: () => { const t = read('agentd.lock'); return t == null ? null : t.trim(); } };
};
const start = (d, env = {}) => {
  const c = spawn(NODE, [path.join(d.root, 'current', 'agentd.js')], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: HOMEN, VIBESPACE_AGENTD_ROOT: d.root, VIBESPACE_DEVICE_ROOT: d.root, ...env } });
  c.unref(); kids.push(c); d.child = c;
  d.exited = null; c.once('exit', (code, sig) => { d.exited = { code, sig }; });
};
// THE STAND-IN HUB: a ws server; every dial is kept by the device it names, in arrival order
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ noServer: true });
const dials = new Map();
const nDials = (d) => (dials.get(d.name) || []).length;
const hs = http.createServer((q, r) => { r.writeHead(404); r.end(); });
hs.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => {
  const dev = new URL(req.url, 'http://x').searchParams.get('device');
  const Ls = { data: [], close: [], error: [] };
  ws.on('message', (d) => Ls.data.forEach((f) => f(Buffer.isBuffer(d) ? d : Buffer.from(d))));
  ws.on('close', () => Ls.close.forEach((f) => f()));
  ws.on('error', () => Ls.error.forEach((f) => f()));
  const stream = { write: (d) => { try { ws.send(d); return true; } catch { return false; } }, on: (ev, fn) => { Ls[ev]?.push(fn); }, destroy: () => { try { ws.close(); } catch { } } };
  stream.attempt = req.headers['x-vibespace-dial-attempt'] || null; stream.last = req.headers['x-vibespace-dial-last'] || null;   // what the device reports of its failed dials
  if (!dials.has(dev)) dials.set(dev, []);
  dials.get(dev).push(stream);
}));
await new Promise((r) => hs.listen(0, '127.0.0.1', r));
const dialTo = (d) => fs.writeFileSync(path.join(d.state, 'dial.json'), JSON.stringify({ url: `ws://127.0.0.1:${hs.address().port}/api/device-dial?device=${d.name}`, token: tok('vsdt') }), { mode: 0o600 });
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
const NEXT = '9.9.7', next = Buffer.from(`/* the next release: never started (the node it would run on is gone) */\n/* module.exports = { VERSION: "${NEXT}" }; */\n`);
const push = async (L) => { L.mux.control({ op: 'upgrade', version: NEXT, size: next.length, sig: SIG.sign(K.privateKeyPem, next, NEXT, C) }); L.mux.data(1, next); return L.wait((m) => m.op === 'upgrade-done' || m.op === 'upgrade-failed', 15000); };
const stayed = (d) => /upgrade hand-over: the successor did not start — this daemon stays, listening again on /.test(d.log());
const BACKOFF_MS = 1000, MARGIN_MS = 1500;
const readOnly = [];   // ②'s folders made read-only — restored in the finally   // the dial's first backoff (agentd.js: [1000, 2000, …]) and the bound past it

try {
  console.log('the stay, run for real: a dialed device dials again (both orders); a stay that cannot listen exits 75; the exit keeps another\'s lock');
  // the dialed ones: D1 / M1 / M4 — the hub ends the link at upgrade-done (before the stay); D5 / M5 — the hub ends it after
  const D1 = install('stay-dial', bsrc), M1 = install('stay-dial-red', muts.noRedial), M4 = install('stay-dial-mark-red', muts.keepsLanded);
  const D5 = install('stay-dial-late', bsrc), M5 = install('stay-dial-late-red', muts.keepsLanded), M6 = install('stay-dial-late-mark-red', muts.noCloseMark);
  const D2 = install('stay-nolisten', bsrc, { longRoot: true }), M2 = install('stay-nolisten-red', muts.bootHandler, { longRoot: true });
  const D3 = install('lock-kept', bsrc), M3 = install('lock-kept-red', muts.oldLockExit);
  const DIALED = [D1, M1, M4, D5, M5, M6], SOCKED = [D2, M2, D3, M3];
  for (const d of DIALED) dialTo(d);
  const xdg = (d) => { const x = path.join(XB, d === D2 ? 'g' : 'r'); fs.mkdirSync(x, { recursive: true, mode: 0o700 }); return x; };
  for (const d of DIALED) start(d);
  start(D2, { XDG_RUNTIME_DIR: xdg(D2) }); start(M2, { XDG_RUNTIME_DIR: xdg(M2) }); start(D3); start(M3);
  // every daemon up (the dialed ones dialed in and answer hello; the others answer hello on their sockets) BEFORE its node goes
  const first = await until(() => DIALED.every((d) => nDials(d) >= 1), 15000);
  const dl = {}, sl = {};
  await Promise.all([
    ...DIALED.map(async (d) => { if (!first) return; const L = link(dials.get(d.name)[0], d.token); dl[d.name] = { L, ack: await L.hello() }; }),
    ...SOCKED.map(async (d) => { sl[d.name] = await sockLink(d); }),
  ]);
  const up = !!first && DIALED.every((d) => dl[d.name] && dl[d.name].ack.op === 'hello-ack') && SOCKED.every((d) => sl[d.name] && sl[d.name].ack.op === 'hello-ack');
  ok(up, `(ten real daemons up: six dialed the stand-in hub, four answer hello on their sockets — ${realVersion})`, { dials: [...dials].map(([k, v]) => `${k}:${v.length}`), socks: Object.fromEntries(Object.entries(sl).map(([k, v]) => [k, v ? v.ack.op : null])) });
  fs.unlinkSync(NODE);   // the node they run from is gone: a successor started from it cannot start
  // ② first: the folder holding each socket made read-only (ONLY a folder this suite made), so the old socket file cannot go
  const own2 = {};
  for (const d of [D2, M2]) { const L = sl[d.name]; own2[d.name] = !!L && L.p.startsWith(XB + path.sep); if (own2[d.name]) { readOnly.push(path.dirname(L.p)); fs.chmodSync(path.dirname(L.p), 0o500); } }
  ok(own2[D2.name] && own2[M2.name], `(② the two sockets took the runtime folder's rung in a folder this suite made: ${[D2, M2].map((d) => sl[d.name] && sl[d.name].p).join(', ')})`);
  // EVERY upgrade at once: over each dial, and over each socket of ②. D1 / M1 / M4: the hub ends the link at upgrade-done (as the
  // hub does) — BEFORE the stay; ②'s links end at upgrade-done (the hand-over's close waits for open ones)
  const r = {};
  await Promise.all([
    ...DIALED.map(async (d) => { const m = dl[d.name] ? await push(dl[d.name].L) : { op: 'NO LINK' }; r[d.name] = m.op; if (![D5, M5, M6].includes(d)) { try { dials.get(d.name)[0].destroy(); } catch { } } }),
    ...[D2, M2].map(async (d) => { const L = sl[d.name]; if (!own2[d.name]) { r[d.name] = 'NOT OWN'; return; } r[d.name] = (await push(L.L)).op; try { L.s.destroy(); } catch { } }),
  ]);
  // ③ at once too: each lock rewritten to name another process, then the agent told to end
  for (const d of [D3, M3]) { try { sl[d.name].s.destroy(); } catch { } fs.writeFileSync(path.join(d.state, 'agentd.lock'), '1'); try { d.child.kill('SIGTERM'); } catch { } }
  // the roads, waited for TOGETHER
  const road = {};
  await Promise.all([
    (async () => {   // D1: the second dial at once → its hello; then the hub drops it → a THIRD dial on the dial's own road
      road.d1again = await until(() => nDials(D1) >= 2, 8000);
      if (road.d1again) road.d1ack = await link(dials.get(D1.name)[1], D1.token).hello();
      road.d1back = await sockLink(D1);
      if (road.d1again) { try { dials.get(D1.name)[1].destroy(); } catch { } }
      road.d1third = await until(() => nDials(D1) >= 3, BACKOFF_MS + MARGIN_MS);
    })(),
    (async () => {   // D5 / M5: the hub ends the link only AFTER the stay listened again (the close then takes the dial's road)
      road.d5stayed = await until(() => stayed(D5), 8000); try { dials.get(D5.name)[0].destroy(); } catch { }
      road.d5late = await until(() => nDials(D5) >= 2, BACKOFF_MS + MARGIN_MS);
    })(),
    (async () => {
      road.m5stayed = await until(() => stayed(M5), 8000); try { dials.get(M5.name)[0].destroy(); } catch { }
      await until(() => nDials(M5) >= 2, BACKOFF_MS + MARGIN_MS);
    })(),
    (async () => {   // M6: the mark taken away — its late close is written as a failed dial (the next dial reports one)
      road.m6stayed = await until(() => stayed(M6), 8000); try { dials.get(M6.name)[0].destroy(); } catch { }
      road.m6late = await until(() => nDials(M6) >= 2, BACKOFF_MS + MARGIN_MS);
    })(),
    (async () => {   // M1: its stay said, then the green's at-once re-dial plus the margin
      road.m1stayed = await until(() => stayed(M1), 8000);
      await until(() => nDials(M1) >= 2, MARGIN_MS);
    })(),
    (async () => {   // M4: the re-dial happens; the hub drops it; the NEXT drop's dial never comes
      road.m4two = await until(() => nDials(M4) >= 2, 8000);
      if (road.m4two) { try { dials.get(M4.name)[1].destroy(); } catch { } }
      await until(() => nDials(M4) >= 3, BACKOFF_MS + MARGIN_MS);
    })(),
    until(() => D2.exited && M2.exited && D3.exited && M3.exited, 10000),
  ]);
  ok(r[D1.name] === 'upgrade-done' && stayed(D1) && !!road.d1ack && road.d1ack.op === 'hello-ack' && road.d1ack.daemonVersion === realVersion && !!road.d1back && road.d1back.ack.op === 'hello-ack' && D1.exited === null && D1.lockPid() === String(D1.child.pid) && /its hub dialed again/.test(D1.log()),
    `① a DIALED device whose successor cannot start STAYS: its lock (pid ${D1.lockPid()}), its socket answers hello again, and its hub is DIALED AGAIN at once — the second dial's hello says the old version ${road.d1ack && road.d1ack.daemonVersion}`,
    { upgrade: r[D1.name], log: D1.log().split('\n').filter((l) => /hand-over|dial|successor/.test(l)).slice(-8) });
  ok(!!road.d1third, `① …and when the hub drops that link, the device dials a THIRD time on the dial's own road (dials ${nDials(D1)}): the upgrade's mark is cleared`);
  const d5two = (dials.get(D5.name) || [])[1] || {}, m6two = (dials.get(M6.name) || [])[1] || {};
  ok(r[D5.name] === 'upgrade-done' && !!road.d5stayed && !!road.d5late && D5.exited === null && !/its hub dialed again/.test(D5.log()) && d5two.attempt === '0' && !d5two.last && /dial-out ended after the upgrade's stay — dialing again/.test(D5.log()),
    `① the OTHER order — the hub ends the link after the stay listened again: that close is the upgrade's end, never a failed dial — the hub is dialed again at once and the new dial reports no failure (attempt ${d5two.attempt}, last ${d5two.last || 'none'})`);
  ok(r[M6.name] === 'upgrade-done' && !!road.m6stayed && !!road.m6late && m6two.attempt === '1',
    `RED ① the close after the stay without its mark: written as a failed dial — the next dial reports one (attempt ${m6two.attempt}, last ${m6two.last || 'none'})`);
  ok(r[M1.name] === 'upgrade-done' && !!road.m1stayed && nDials(M1) === 1 && M1.exited === null,
    `RED ① the stay WITHOUT its re-dial (the shape before this cure): it stays and listens, but its hub is NEVER dialed again (dials ${nDials(M1)}) — a live process, its lock held, no link`);
  ok(!!road.m4two && nDials(M4) === 2 && !!road.m5stayed && nDials(M5) === 1,
    `RED ① the upgrade's mark LEFT SET: the next drop is never dialed again (dials ${nDials(M4)}), nor a close that comes after the stay (dials ${nDials(M5)})`);
  ok(r[D2.name] === 'upgrade-done' && !!D2.exited && D2.exited.code === 75 && /upgrade hand-over: it could not stay — .* did not listen again \(EADDRINUSE\) — exit 75/.test(D2.log()) && D2.lockPid() === null,
    `② a stay whose socket cannot listen again EXITS 75 BY NAME (exit ${D2.exited && D2.exited.code}: «it could not stay — … did not listen again (EADDRINUSE) — exit 75»), its OWN lock removed by its exit`,
    { upgrade: r[D2.name], exited: D2.exited, log: D2.log().split('\n').filter((l) => /hand-over|server error|listen/.test(l)).slice(-6) });
  ok(r[M2.name] === 'upgrade-done' && !!M2.exited && M2.exited.code === 1 && /server error: listen EADDRINUSE/.test(M2.log()),
    `RED ② the boot's listen handler left on: the re-listen's error takes the boot's fatal road (exit ${M2.exited && M2.exited.code}, «server error: listen EADDRINUSE»), never the stay's named exit`);
  ok(!!D3.exited && D3.exited.code === 0 && D3.lockPid() === '1', `③ an exit leaves a lock that names ANOTHER process (exit ${D3.exited && D3.exited.code}; the lock still «${D3.lockPid()}»): a fourth start is refused by it, never run beside it`);
  ok(!!M3.exited && M3.lockPid() === null, `RED ③ the old exit handler removes the lock whoever it names (now: ${M3.lockPid() === null ? 'removed' : 'kept'})`);
} catch (e) {
  fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e));
} finally {
  for (const x of readOnly) { try { fs.chmodSync(x, 0o700); } catch { } }   // ②'s folders writable again on EVERY road (a scene that threw included)
  try { hs.close(); } catch { }
  endKids('SIGTERM');
  await until(() => kids.every((c) => c.exitCode !== null || c.signalCode !== null), 5000);
  endKids('SIGKILL');
  try { fs.unlinkSync(NODE); } catch { }
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { }
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
