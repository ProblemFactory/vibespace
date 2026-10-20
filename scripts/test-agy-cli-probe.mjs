#!/usr/bin/env node
// THE REAL agy, OFFLINE (lane antigravity-harness): the installed Antigravity CLI against the measured fixture
// (scripts/fixtures/antigravity-cli-<version>.json) — `--version`, `--help`, and the unauthenticated headless start
// (the OAuth URL on stderr; killed the moment it shows, never left to its 60 s wait). Every run is inside
// `bwrap --unshare-net` (loopback only) with a scratch HOME and NO D-Bus session bus, so nothing leaves the box and no
// keyring is touched; nothing is signed in and no prompt reaches anyone. SKIP, with the reason, when there is no agy
// (the hosted runner), no network-less sandbox, or agy updated itself to a version no fixture records (it
// self-updates: register the version — the drift-card rule). AGY_PROBE_CMD=<path> picks the binary. Heavy: it runs a
// real program.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : '')); } };
const which = (c) => { const r = spawnSync('sh', ['-c', `command -v ${c}`], { encoding: 'utf8' }); return (r.stdout || '').trim() || null; };
const agy = process.env.AGY_PROBE_CMD || which('agy');
const sandboxed = !!which('bwrap') && spawnSync('bwrap', ['--unshare-net', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', 'true']).status === 0;
const H = scratchDir('agy-probe');
process.on('exit', () => { try { fs.rmSync(H, { recursive: true, force: true }); } catch { } });
const boxed = (args) => ['--unshare-net', '--die-with-parent', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--tmpfs', '/run/user', '--bind', H, H,
  'env', '-i', `HOME=${H}`, 'PATH=/usr/bin:/bin', 'TERM=dumb', `DBUS_SESSION_BUS_ADDRESS=unix:path=${H}/no-bus`, agy, ...args];
const run = (args) => spawnSync('bwrap', boxed(args), { encoding: 'utf8', timeout: 30000 });
/** spawnSync's twin that keeps THIS process's event loop running — an in-process listener must be able to accept a
 *  dial while agy runs (spawnSync blocked it: a dial sat in the backlog and was never counted). */
const runAsync = (cmd, args, { timeoutMs = 30000 } = {}) => new Promise((resolve) => {
  const c = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
  c.stdin.end();
  const to = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, timeoutMs);
  c.on('close', (status) => { clearTimeout(to); resolve({ status, stdout, stderr }); });
});
console.log('— the installed agy against the recorded fixture (offline)');
let why = !agy ? 'no `agy` on PATH (set AGY_PROBE_CMD to probe one)' : !sandboxed ? 'no network-less sandbox here (bwrap --unshare-net) — agy is never run with a network' : null;
let FX = null, ver = null;
if (!why) {
  ver = (run(['--version']).stdout || '').trim();
  const fp = path.join(REPO, 'scripts/fixtures', `antigravity-cli-${ver}.json`);
  if (!fs.existsSync(fp)) why = `agy is ${ver || '?'} and no fixture records that version — it updated itself; register it (scripts/fixtures/antigravity-cli-${ver}.json)`;
  else FX = JSON.parse(fs.readFileSync(fp, 'utf8'));
}
if (why) console.log(`  - SKIP: ${why}`);
else {
  ok(`--version answers the recorded version offline (${ver})`, ver === FX.version);
  const help = run(['--help']).stderr || '';
  const flags = [...help.matchAll(/^\s{2}(-{1,2}[\w-]+)\s{2,}/gm)].map((m) => m[1]);
  const missing = Object.keys(FX.help.flags).filter((f) => !flags.includes(f));
  ok('--help still lists every flag the fixture (and the descriptor) relies on', !missing.length, missing);
  for (const f of ['--input-format', '--output-format', '--conversation', '--model', '--effort', '--mode', '--dangerously-skip-permissions']) ok(`  …${f}`, flags.includes(f));
  // the unauthenticated start: wait for the OAuth line, then kill (never its 60 s wait)
  const r = await new Promise((resolve) => {
    const c = spawn('bwrap', boxed(['--input-format', 'stream-json', '--output-format', 'stream-json']), { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '', out = '';
    const t0 = Date.now();
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; if (/accounts\.google\.com\/o\/oauth2\/auth\?/.test(err)) { try { c.kill('SIGKILL'); } catch { } } });
    const to = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 20000);
    c.on('exit', () => { clearTimeout(to); resolve({ err, out, ms: Date.now() - t0 }); });
  });
  const want = FX.unauthenticated.streamPipe;
  ok('an unauthenticated stream start on a PIPE (how the wrapper runs it) refuses at once with the recorded words', r.err.split('\n')[0] === want.stderr[0] && /authentication required/i.test(r.err) && r.ms < 15000, { err: r.err.slice(0, 300), ms: r.ms });
  const evs = r.out.trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
  ok('…its stdout is ONE result event, status ERROR, the recorded error (no init, no turn)', evs.length === 1 && evs[0] && evs[0].event === 'result' && evs[0].result.status === 'ERROR' && evs[0].result.error === want.stdout.result.error, r.out.slice(0, 300));
  // THE WRAPPER ON THE REAL agy: the shipped data/bin/agy-wrapper.js runs the real binary (inside the same sandbox)
  // and turns its refusal into the auth-required notice by name, ending the session — never a silent hang
  const W = path.join(REPO, 'data/bin/agy-wrapper.js');
  const wr = await new Promise((resolve) => {
    const c = spawn('bwrap', ['--unshare-net', '--die-with-parent', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--tmpfs', '/run/user', '--bind', H, H,
      'env', '-i', `HOME=${H}`, 'PATH=/usr/bin:/bin', `DBUS_SESSION_BUS_ADDRESS=unix:path=${H}/no-bus`, `AGY_WEBUI_CWD=${H}`, process.execPath, W, path.join(H, 'w.buf'), path.join(H, 'w.json'), agy], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const t0 = Date.now();
    c.stdout.on('data', (d) => { out += d; });
    c.stdin.write(JSON.stringify({ type: 'chat-input', text: 'hello', msgId: 'p1' }) + '\n');
    const to = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 30000);
    c.on('exit', (code) => { clearTimeout(to); resolve({ code, out, ms: Date.now() - t0 }); });
  });
  const recs = wr.out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const auth = recs.find((x) => x.kind === 'notice' && x.noticeKind === 'auth-required');
  const v = recs.find((x) => x.kind === 'agent_version');
  ok('the wrapper on the REAL agy: the refusal becomes the auth-required notice by name, the session ends (exit 1)', !!auth && wr.code === 1 && wr.ms < 25000, { code: wr.code, ms: wr.ms, kinds: recs.map((x) => x.kind) });
  ok('…and it recorded the version it ran (the version law, on the real binary)', v && v.version === FX.version, v);

  // COMMIT 2's MEASUREMENT AS A LEG: a named account's spawn env (HOME = a seeded root, the bus `disabled:`) on the real
  // agy reads THE ROOT's login file and dials NO bus — even with a listening `bus` under XDG_RUNTIME_DIR, which without
  // `disabled:` made agy autolaunch dbus-launch (measured). strace sees every connect / openat / execve.
  const AG = require(path.join(REPO, 'src/harnesses/antigravity.js'));
  const machine = path.join(H, 'machine'), root = path.join(H, 'acct-root'), run2 = path.join(H, 'xdg');
  fs.mkdirSync(machine, { recursive: true }); fs.mkdirSync(run2, { recursive: true });
  AG.seedHomeRoot(root, machine);
  const env2 = AG.creds.spawnEnv(root);
  const strace = which('strace');
  if (!strace) console.log('  - SKIP the account-env leg: no strace here');
  else {
    let dialed = 0;
    const srv = net.createServer((c) => { dialed++; c.destroy(); });
    await new Promise((r) => srv.listen(path.join(run2, 'bus'), r));
    const trace = path.join(H, 'acct.strace');
    const ar = await runAsync('bwrap', ['--unshare-net', '--die-with-parent', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--tmpfs', '/run/user', '--bind', H, H,
      'env', '-i', `HOME=${env2.HOME}`, 'PATH=/usr/bin:/bin', `DBUS_SESSION_BUS_ADDRESS=${env2.DBUS_SESSION_BUS_ADDRESS}`, `XDG_RUNTIME_DIR=${run2}`,
      strace, '-f', '-qq', '-e', 'trace=connect,openat,execve', '-o', trace, agy, '-p', 'hello', '--output-format', 'stream-json']);
    await new Promise((r) => srv.close(r));
    const tr = fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8') : '';
    const tokenOpened = tr.includes(path.join(root, AG.TOKEN_REL));
    const busDials = tr.split('\n').filter((l) => /connect\(/.test(l) && /(run\/user|\/bus"|xdg\/bus)/.test(l));
    const launched = /execve\([^)]*dbus-launch/.test(tr);
    ok('the ACCOUNT env on the real agy reads the ROOT\'s login file (antigravity-oauth-token under the root)', tokenOpened, tr.split('\n').filter((l) => /oauth-token/.test(l)).slice(0, 3));
    ok('…dials NO bus (no connect to a bus path, the planted XDG bus untouched) and autolaunches nothing (no dbus-launch)', busDials.length === 0 && dialed === 0 && !launched, { busDials: busDials.slice(0, 3), dialed, launched });
    ok('…and answers the measured refusal (not signed in), exit 1', ar.status === 1 && /authentication required/i.test(ar.stderr || ''), { status: ar.status, err: (ar.stderr || '').slice(0, 200) });
    // RED CONTROL: a fresh root with the bus ADDRESS pointing at a planted socket (no `disabled:`): agy dials it
    // (measured: the keyring lookup), so the detector can see a dial when there is one. Both legs run agy ASYNC — a
    // spawnSync blocks this process's event loop, a dial then waits in the listener's backlog uncounted (it did).
    const root2 = path.join(H, 'acct-root-2'); AG.seedHomeRoot(root2, machine);
    let dialed2 = 0;
    const srv2 = net.createServer((c) => { dialed2++; c.destroy(); });
    await new Promise((r) => srv2.listen(path.join(run2, 'bus2'), r));
    await runAsync('bwrap', ['--unshare-net', '--die-with-parent', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--tmpfs', '/run/user', '--bind', H, H,
      'env', '-i', `HOME=${root2}`, 'PATH=/usr/bin:/bin', `DBUS_SESSION_BUS_ADDRESS=unix:path=${path.join(run2, 'bus2')}`, agy, '-p', 'hello', '--output-format', 'stream-json']);
    await new Promise((r) => srv2.close(r));
    ok('RED control: a fresh root with a bus ADDRESS (no `disabled:`) — agy dials it (the leg above can go red)', dialed2 >= 1, { dialed2 });
  }

  // THE /usage CAPTURE on the real agy, offline + unauthenticated: the measured refusal ⇒ auth-required, exit 2, no file
  const capOut = path.join(H, 'usage-capture.json');
  const cr = spawnSync('bwrap', ['--unshare-net', '--die-with-parent', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--tmpfs', '/tmp', '--tmpfs', '/run/user', '--bind', H, H,
    'env', '-i', `HOME=${H}`, 'PATH=/usr/bin:/bin', `TMPDIR=${H}`, process.execPath, path.join(REPO, 'scripts/agy-usage-capture.mjs'), '--account', root, '--agy', agy, '--out', capOut], { encoding: 'utf8', timeout: 60000 });
  ok('the /usage capture script on the real agy (an account root, offline, not signed in): auth-required, exit 2, nothing written', cr.status === 2 && /auth-required/.test(cr.stdout || '') && !fs.existsSync(capOut), { status: cr.status, out: (cr.stdout || '') + (cr.stderr || '') });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass}${why ? ', the probe SKIPPED' : ''})`);
process.exit(fail ? 1 : 0);
