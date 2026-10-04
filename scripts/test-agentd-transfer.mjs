#!/usr/bin/env node
// test-agentd-transfer — lane exit-transfer (design 013 B, 2026-10-03; the owner: 「agent有能力在远程机器上生成一个大文件并pull回本地吗？
// 还是只能通过命令行一点一点读？」). A REAL device agent built from THIS tree (esbuild), the REAL DeviceManager and the REAL
// ExitProxyManager: `vibespace-exit pull` / `push` of ONE file through the device's own file ops.
//   ① a 100 MiB pull lands whole: sha256 equal on both ends, every window's hash compared ("sha256" verified), no
//      `.vs-part` left, the file held by the hub ≤ two windows at its worst instant (THE MEMORY JUDGE below: the bytes
//      off its link minus the bytes in the part on disk, taken at EVERY socket read — the exact maximum, not a sample)
//      — CONTROLS on the same judge: the whole-range read (the pre-lane fsReadRange shape) and a sink that keeps every
//      piece (credited at once, written at the end) of the same file are each measured ≥ 90 MiB
//   ② the same file pushed back: the device writes `<path>.vs-part` and renames once the count and the sha256 matched;
//      equal hashes; the file held ≤ two windows (the bytes the hub read off the local disk minus the device's part)
//   ③ the device REFUSES a lying end (a sha256 that is not the bytes'): hash_mismatch, the part removed, nothing at the path
//   ④ a source that dies mid-push ⇒ abort ⇒ the part removed; the link dropped mid-push ⇒ the part removed (onDead)
//   ⑤ /dev/zero ⇒ not_a_file (stat: not a regular file); a file that GROWS while it is pulled ⇒ transfer_failed, nothing
//      kept; a 0-byte file both ways; push onto an existing file ⇒ exists, with --overwrite ⇒ replaced
//   ⑥ NEVER A SHELL: the agent bundle carries a child_process census (every spawn / exec logged) — zero calls during
//      every transfer above (a Windows machine has no sh; a transfer must not need one)
// Run: node scripts/test-agentd-transfer.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, stampScratchRun } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const E = require(path.join(REPO, 'src/exit-reach.js'));
const { ExitProxyManager } = require(path.join(REPO, 'src/exit-proxy.js'));

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const section = async (name, fn) => { console.log(name); try { await fn(); } catch (e) { fail++; console.error(`  ✗ ${name} threw: ${e.stack || e.message}`); } };
const settle = async (p) => { try { return { v: await p }; } catch (e) { return { e }; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCR = scratch('xfer'); // /tmp/vs-xfer-<pid>
fs.mkdirSync(SCR, { recursive: true });
stampScratchRun(SCR);
const pids = [];
const cleanup = () => { for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch { } } try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const shaFile = (f) => { const h = crypto.createHash('sha256'); const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(1 << 20); let n; while ((n = fs.readSync(fd, b, 0, b.length, null)) > 0) h.update(b.subarray(0, n)); fs.closeSync(fd); return h.digest('hex'); };
const MiB = 1024 * 1024;
const WIN = E.TRANSFER_WINDOW_BYTES;

// the agent bundle with a child_process census prepended (every spawn / exec of the daemon AND its fs workers is logged)
const SPAWN_LOG = path.join(SCR, 'spawns.log');
const bundle = path.join(SCR, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`, '--log-level=warning'], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const census = `{ const __cp = require('child_process'), __fs = require('fs'); for (const k of ['spawn', 'execFile', 'exec', 'fork', 'spawnSync', 'execFileSync', 'execSync']) { const o = __cp[k]; __cp[k] = function (...a) { try { __fs.appendFileSync(${JSON.stringify(SPAWN_LOG)}, k + ' ' + String(a[0]) + ' ' + JSON.stringify(a[1] || null) + '\\n'); } catch { } return o.apply(this, a); }; } }\n`;
const src = fs.readFileSync(bundle, 'utf8');
const nl = src.startsWith('#!') ? src.indexOf('\n') + 1 : 0;
fs.writeFileSync(bundle, src.slice(0, nl) + census + src.slice(nl));
// the agent's own shell probe at every hello (lane windows-device-fs: which POSIX shells it can start) is not a transfer's
const PROBE = 'echo vs-$((40+2))';
const spawnLines = () => { try { return fs.readFileSync(SPAWN_LOG, 'utf8').split('\n').filter((l) => l && !l.includes(PROBE)); } catch { return []; } };
const spawns = () => spawnLines().length;

const root = path.join(SCR, 'root'); fs.mkdirSync(root, { recursive: true });
const dataDir = path.join(SCR, 'data'); fs.mkdirSync(dataDir, { recursive: true });
process.env.VIBESPACE_AGENTD_ROOT = root;
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const newDm = async () => { const dm = new DeviceManager({ dataDir, bundlePath: bundle, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => {} }); await dm.connect(); return dm; };
const dm = await newDm();
try { pids.push(Number(String(fs.readFileSync(path.join(root, 'state', 'agentd.lock'), 'utf8')).trim())); } catch { }

// the hub: the real manager over a hosts stub whose machine is the real agent (`wrap` lets a leg intercept device calls)
let wrap = (d) => d;
const recs = [{ id: 'host-box', name: 'BOX', transport: 'dial', deviceId: 'BOX', online: true, exit: { use: { mode: 'nobody' }, run: { mode: 'everyone', ask: false } } }];
const hosts = { list: () => recs.map((h) => ({ ...h })), get: (id) => recs.find((x) => x.id === id), setLastRun: () => {}, deviceBounded: async () => wrap(dm) };
const PROJ = path.join(SCR, 'proj'); fs.mkdirSync(PROJ, { recursive: true });
const REM = path.join(SCR, 'machine'); fs.mkdirSync(REM, { recursive: true });
const A = { name: 'agent A', backend: 'claude', claudeSessionId: 'A', cwd: PROJ };
const sessions = new Map([['wa', A]]);
const cards = [];
const mgr = new ExitProxyManager({ hosts, log: () => {}, dataDir: path.join(SCR, 'hubdata'), sessionsMap: () => sessions, emitCard: (s, c) => { cards.push(c); return true; } });

// THE MEMORY JUDGE (lane test-judges, 2026-10-03): the bytes of the file INSIDE the hub at its worst instant, counted
// at the hub's two edges, never sampled — IN: what came off the link (Node's own count, the socket's bytesRead) or, for
// a push, what the hub read off the local disk (the source stream's own pushes); OUT: what is in the receiving file on
// disk (the target and any part of it — the hub's is `<target>.<8 hex>.vs-part`, the device's `<target>.vs-part`). The hold can only GROW at an arrival, so IN − OUT taken
// at EVERY arrival is its exact maximum. A push's OUT is the DEVICE's file: the link and the device's own queue count
// as held too (an upper bound on the hub). The old probe — the TEST process's gc'd arrayBuffers every 20 ms — counted
// mux / socket chunks, decode and hash buffers and caught a live window only by the instant (0.0–19.4 MiB; red 6/10
// even at load 5): it could not measure what the line claims.
const onDisk = (target) => () => { const d = path.dirname(target), b = path.basename(target); let n = 0; try { for (const f of fs.readdirSync(d)) if (f === b || (f.startsWith(b + '.') && f.endsWith('.vs-part'))) { try { n += fs.statSync(path.join(d, f)).size; } catch { } } } catch { } return n; };
const holdOf = (out) => { const H = { peak: 0, at: 0, see(n) { H.at++; const h = n - out(); if (h > H.peak) H.peak = h; } }; return H; };
// a read off the link: every 'data' of the hub's socket to the agent (listened to after the mux's own: the bytes of
// that read have already been handed on when it is counted)
const linkHold = async (out) => { const sock = (await dm.connect()).mux.stream; const base = sock.bytesRead, H = holdOf(out); const on = () => H.see(sock.bytesRead - base); sock.on('data', on); H.stop = () => { sock.off('data', on); return H; }; return H; };
// a push: every chunk the source stream pushes (read off the local disk into the hub)
const sourceHold = (src, out) => { const H = holdOf(out); let n = 0; const push = src.push.bind(src); src.push = (c, e) => { if (c) { n += c.length; H.see(n); } return push(c, e); }; return H; };
const mib = (n) => `${(n / MiB).toFixed(n < MiB ? 2 : 1)} MiB`;
const BIG = path.join(REM, 'nomad.bin');
{ const fd = fs.openSync(BIG, 'w'); for (let i = 0; i < 100; i++) fs.writeSync(fd, crypto.randomBytes(MiB)); fs.closeSync(fd); }
const bigSha = shaFile(BIG);
const s0 = spawns();

await section('① a 100 MiB pull through the real agent: whole, sha256 per window, memory ≤ two windows', async () => {
  const H = await linkHold(onDisk(path.join(PROJ, 'nomad.bin')));
  const t0 = Date.now();
  const r = await settle(mgr.pull(A, 'wa', 'BOX', { remote: BIG, local: path.join(PROJ, 'nomad.bin') }));
  H.stop();
  ok(r.v && r.v.bytes === 100 * MiB && r.v.sha256 === bigSha && r.v.verified === 'sha256', `pulled 100 MiB in ${Date.now() - t0} ms — the hub's sha256 equals the file's, verified "sha256" (each window compared with the device's hash)`, r.e ? r.e.message : { ...r.v, line: undefined });
  ok(fs.existsSync(path.join(PROJ, 'nomad.bin')) && shaFile(path.join(PROJ, 'nomad.bin')) === bigSha && !fs.readdirSync(PROJ).some((f) => /\.vs-part$/.test(f)), 'the file on disk is the same bytes; no .vs-part left');
  ok(H.at >= 100 && H.peak <= 2 * WIN, `the hub held at most ${mib(H.peak)} of the file at once (the bytes off its link minus the part on disk, at each of ${H.at} socket reads) — ≤ two 8 MiB windows (never the file)`, { peak: H.peak, reads: H.at });
  const C1 = await linkHold(() => 0);
  const whole = await dm.fsReadRange(BIG, 0, 100 * MiB);
  C1.stop();
  ok(whole.data.length === 100 * MiB && C1.peak >= 90 * MiB, `CONTROL: the whole-range read (the pre-lane shape) of the same file holds ${mib(C1.peak)} on the same judge — it sees a file held whole`, C1.peak);
  const KEPT = path.join(SCR, 'kept.bin'), kept = [];
  const C2 = await linkHold(onDisk(KEPT));
  const rk = await dm.fsReadRange(BIG, 0, 100 * MiB, { sink: (b) => { kept.push(b); } });
  fs.writeFileSync(KEPT, Buffer.concat(kept)); kept.length = 0;
  C2.stop(); fs.rmSync(KEPT, { force: true });
  ok(rk.sent === 100 * MiB && C2.peak >= 90 * MiB, `CONTROL: a sink that keeps every piece (credited at once, written at the end) holds ${mib(C2.peak)} — the judge sees a hold the link's credit does not bound`, C2.peak);
  ok(/^pulled .*nomad\.bin from "BOX" → .*nomad\.bin — 100\.0 MiB \(104857600 bytes\) · sha256 [0-9a-f]{64} verified · \d+\.\d s$/.test(r.v && r.v.line), 'the CLI line: what, where, the size, the hash, the time', r.v && r.v.line);
});

await section('② the same file pushed back: .vs-part, then a rename once the count and the sha256 matched', async () => {
  const got = path.join(PROJ, 'nomad.bin'), dst = path.join(REM, 'back', 'nomad-copy.bin');
  const source = fs.createReadStream(got);
  const H = sourceHold(source, onDisk(dst));
  const r = await settle(mgr.push(A, 'wa', 'BOX', { remote: dst, local: got, size: fs.statSync(got).size, source }));
  ok(r.v && r.v.bytes === 100 * MiB && r.v.sha256 === bigSha && r.v.verified === 'sha256', 'pushed 100 MiB — the device\'s sha256 (compared device-side with the hub\'s) equals the file\'s', r.e ? r.e.message : r.v);
  ok(fs.existsSync(dst) && shaFile(dst) === bigSha && !fs.existsSync(dst + '.vs-part'), 'the bytes on the machine equal; the missing folder was made; no .vs-part left');
  ok(H.at >= 100 && H.peak <= 2 * WIN, `the hub held at most ${mib(H.peak)} of the file at once (the bytes it read off the disk minus the device's part, at each of ${H.at} reads; the link and the device's queue count too) — ≤ two windows`, { peak: H.peak, reads: H.at });
  fs.rmSync(dst, { force: true });
});

await section('③ ④ the device refuses a lying end; an abort and a dropped link remove the part', async () => {
  const dst = path.join(REM, 'lie.bin');
  const conn = await dm.connect();
  const chan = conn.nextChan++;
  conn.sessions.set(chan, {});
  const open = await dm._request({ op: 'fs-op', action: 'write-stream', step: 'open', path: dst, chan, size: 4, waitMs: 10000 });
  ok(open.ready === true && fs.existsSync(dst + '.vs-part'), 'open ⇒ ready, the part made', open);
  conn.mux.data(chan, Buffer.from('abcd'));
  const lie = await settle(dm._request({ op: 'fs-op', action: 'write-stream', step: 'end', path: dst, chan, sent: 4, sha256: '0'.repeat(64), waitMs: 20000 }));
  conn.sessions.delete(chan);
  await sleep(300);
  ok(lie.e && /hash_mismatch/.test(lie.e.message) && !fs.existsSync(dst) && !fs.existsSync(dst + '.vs-part'), 'a sha256 that is not the bytes\' ⇒ hash_mismatch; the part removed; nothing at the path', lie.e ? lie.e.message : lie.v);
  // a source that dies after 3 MiB
  const dst2 = path.join(REM, 'dies.bin');
  async function* dying() { yield crypto.randomBytes(3 * MiB); throw new Error('the local disk failed'); }
  const d = await settle(dm.fsWriteStream(dst2, { source: dying(), size: 10 * MiB }));
  await sleep(300);
  ok(d.e && /local disk failed/.test(d.e.message) && !fs.existsSync(dst2) && !fs.existsSync(dst2 + '.vs-part'), 'a source dying mid-push ⇒ abort ⇒ the part removed, nothing at the path', d.e && d.e.message);
  // the link dropped mid-push: a SECOND connection to the same agent, stopped while its push waits for more bytes
  const dm2 = await newDm();
  const dst3 = path.join(REM, 'dropped.bin');
  let release; const gate = new Promise((r) => { release = r; });
  async function* slow() { yield crypto.randomBytes(2 * MiB); await gate; yield crypto.randomBytes(MiB); }
  const p3 = settle(dm2.fsWriteStream(dst3, { source: slow(), size: 3 * MiB }));
  for (let i = 0; i < 50 && !fs.existsSync(dst3 + '.vs-part'); i++) await sleep(20);
  const had = fs.existsSync(dst3 + '.vs-part');
  await sleep(300);
  dm2.stop(); release();
  await p3;
  let gone = false; for (let i = 0; i < 50 && !gone; i++) { await sleep(40); gone = !fs.existsSync(dst3 + '.vs-part'); }
  ok(had && gone && !fs.existsSync(dst3), 'the link dropped mid-push ⇒ the agent removes the part (onDead); nothing at the path', { had, gone });
});

await section('⑤ /dev/zero, a growing file, 0 bytes, an existing destination', async () => {
  const z = await settle(mgr.pull(A, 'wa', 'BOX', { remote: '/dev/zero', local: path.join(PROJ, 'zero.bin') }));
  ok(z.e && z.e.code === 'not_a_file' && /is not a regular file \(a device, a pipe or a socket\)/.test(z.e.message) && !fs.existsSync(path.join(PROJ, 'zero.bin')), '/dev/zero ⇒ not_a_file (its stat says a device) — never an endless read', z.e && z.e.message);
  const G = path.join(REM, 'grows.bin'); fs.writeFileSync(G, crypto.randomBytes(20 * MiB));
  let first = true;
  wrap = (d) => ({ status: () => d.status(), fsStat: (p) => d.fsStat(p), fsReadRange: async (...a) => { const r = await d.fsReadRange(...a); if (first) { first = false; fs.appendFileSync(G, crypto.randomBytes(MiB)); } return r; } });
  const g = await settle(mgr.pull(A, 'wa', 'BOX', { remote: G, local: path.join(PROJ, 'grows.bin') }));
  wrap = (d) => d;
  ok(g.e && g.e.code === 'transfer_failed' && /changed size while it was read/.test(g.e.message) && !fs.existsSync(path.join(PROJ, 'grows.bin')) && !fs.readdirSync(PROJ).some((f) => /\.vs-part$/.test(f)), 'a file that grows during the pull ⇒ transfer_failed by name, nothing kept', g.e && g.e.message);
  const Z0 = path.join(REM, 'empty.bin'); fs.writeFileSync(Z0, '');
  const e0 = await settle(mgr.pull(A, 'wa', 'BOX', { remote: Z0, local: path.join(PROJ, 'empty.bin') }));
  ok(e0.v && e0.v.bytes === 0 && e0.v.verified === 'sha256' && e0.v.sha256 === crypto.createHash('sha256').digest('hex') && fs.statSync(path.join(PROJ, 'empty.bin')).size === 0, 'a 0-byte pull lands (one empty window, its hash compared)', e0.e ? e0.e.message : e0.v);
  const p0 = await settle(mgr.push(A, 'wa', 'BOX', { remote: path.join(REM, 'empty-back.bin'), local: path.join(PROJ, 'empty.bin'), size: 0, source: fs.createReadStream(path.join(PROJ, 'empty.bin')) }));
  ok(p0.v && p0.v.bytes === 0 && fs.statSync(path.join(REM, 'empty-back.bin')).size === 0, 'a 0-byte push lands', p0.e ? p0.e.message : p0.v);
  const X = path.join(REM, 'keep.txt'); fs.writeFileSync(X, 'theirs');
  const L = path.join(PROJ, 'mine.txt'); fs.writeFileSync(L, 'mine!');
  const ex = await settle(mgr.push(A, 'wa', 'BOX', { remote: X, local: L, size: 5, source: fs.createReadStream(L) }));
  ok(ex.e && ex.e.code === 'exists' && fs.readFileSync(X, 'utf8') === 'theirs', 'push onto an existing file ⇒ exists (nothing replaced)', ex.e && ex.e.message);
  const ow = await settle(mgr.push(A, 'wa', 'BOX', { remote: X, local: L, size: 5, source: fs.createReadStream(L), overwrite: true }));
  ok(ow.v && fs.readFileSync(X, 'utf8') === 'mine!' && !fs.existsSync(X + '.vs-part'), '…with --overwrite ⇒ replaced (one rename)', ow.e && ow.e.message);
  fs.writeFileSync(path.join(REM, 'stale.bin.vs-part'), 'a dead transfer\'s part');
  const st = await settle(mgr.push(A, 'wa', 'BOX', { remote: path.join(REM, 'stale.bin'), local: L, size: 5, source: fs.createReadStream(L) }));
  ok(st.v && fs.readFileSync(path.join(REM, 'stale.bin'), 'utf8') === 'mine!', 'a stale .vs-part from a dead transfer is replaced, never appended to', st.e && st.e.message);
  // fix r1 ②: two pulls into ONE local target through the real agent — the second is refused target_busy at once, the first lands whole
  const T2 = path.join(PROJ, 'twice.bin');
  const pA = settle(mgr.pull(A, 'wa', 'BOX', { remote: BIG, local: T2 }));
  const rB = await settle(mgr.pull(A, 'wa', 'BOX', { remote: BIG, local: T2 }));
  const rA = await pA;
  ok(rB.e && rB.e.code === 'target_busy' && rA.v && rA.v.sha256 === bigSha && shaFile(T2) === bigSha && !fs.readdirSync(PROJ).some((f) => /\.vs-part$/.test(f)), 'fix r1 ②: a second pull into the target a first one is writing ⇒ target_busy; the first lands whole (its sha256 is the file\'s); no part left', { b: rB.e ? rB.e.message : 'landed', a: rA.e ? rA.e.message : rA.v.sha256 });
});

await section('⑥ never a shell: the agent spawned nothing during any transfer', async () => {
  const n = spawns() - s0;
  ok(n === 0, `0 child_process calls on the agent across ①–⑤ beside its hello's shell probe (a Windows machine has no sh; a transfer needs none)${n ? ': ' + spawnLines().slice(-n).join(' | ') : ''}`, n);
  const r = await dm.runShell('true', { timeoutMs: 30000 });
  ok(r && r.code === 0 && spawns() - s0 >= 1, 'CONTROL: a `run` on the same agent IS logged by the census (it sees a spawn when one happens)', spawns() - s0);
});

try { dm.stop(); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
