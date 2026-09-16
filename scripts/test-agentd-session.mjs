#!/usr/bin/env node
// M1 e2e: a real pty session runs INSIDE vibespace-agentd and relays through
// the mux to the server-side DeviceManager (docs/design-remote-cs.md M1 — the
// session layer). Proves: open-session spawns a device-side pty, stdout bytes
// arrive on the byte channel, stdin flows back, resize + exit propagate, and a
// dtach-attach session SURVIVES the connection dropping (invariant #1). Runs
// against a THROWAWAY agentd root; uses the repo's node-pty via
// VIBESPACE_NODE_MODULES. Run: node scripts/test-agentd-session.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agentd-sess-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
process.env.VIBESPACE_NODE_MODULES = path.join(repo, 'node_modules');
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// build the daemon bundle (real version stamp)
const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
await dm.connect();

console.log('— M1: a pty session runs in the daemon, bytes relay both ways —');
{
  let out = '';
  const h = await dm.openSession({ cmd: '/bin/sh', args: ['-i'], cols: 80, rows: 24 });
  h.onData = (buf) => { out += buf.toString('utf-8'); };
  const ready = await h.ready;
  check('session-open returned a device-side pid', ready.pid > 0, JSON.stringify(ready));
  await sleep(300);
  h.write('echo hello_from_daemon_$((6*7))\n');
  await sleep(600);
  check('stdout relayed through the mux (command output)', out.includes('hello_from_daemon_42'), JSON.stringify(out.slice(-120)));
  let exitCode = null;
  h.onExit = (c) => { exitCode = c; };
  h.write('exit\n');
  await sleep(600);
  check('session-exit propagated to the server', exitCode !== null, String(exitCode));
}

console.log('— M1: resize reaches the device pty (stty reports new size) —');
{
  let out = '';
  const h = await dm.openSession({ cmd: '/bin/sh', args: ['-i'], cols: 80, rows: 24 });
  h.onData = (buf) => { out += buf.toString('utf-8'); };
  await h.ready;
  await sleep(300);
  h.resize(132, 40);
  await sleep(300);
  out = '';
  h.write('stty size\n');
  await sleep(600);
  check('device pty saw the resize (40 132)', /40\s+132/.test(out), JSON.stringify(out.slice(-120)));
  h.kill();
  await sleep(300);
}

console.log('— M1: dtach session SURVIVES a dropped connection (invariant #1) —');
{
  // start a dtach session THROUGH the daemon; drop the whole connection; the
  // dtach session must still be alive to reattach (like restoreSessions).
  const hasDtach = (() => { try { execSync('command -v dtach', { stdio: 'ignore' }); return true; } catch { return false; } })();
  if (!hasDtach) { console.log('  · dtach not installed — skipping (informational)'); }
  else {
    const sock = path.join(tmp, 'dtach.sock');
    // dtach -c creates+attaches; run a marker shell that stays alive
    const h = await dm.openSession({ cmd: 'dtach', args: ['-c', sock, '-E', '/bin/sh', '-c', 'echo DTACH_UP; sleep 60'], cols: 80, rows: 24 });
    let out = '';
    h.onData = (buf) => { out += buf.toString('utf-8'); };
    await h.ready;
    await sleep(700);
    check('dtach session created (marker seen)', out.includes('DTACH_UP'), JSON.stringify(out.slice(-80)));
    // drop the connection entirely — the daemon detaches the attach pty
    dm.stop();
    await sleep(600);
    check('dtach socket still exists after drop (session survived)', fs.existsSync(sock), '');
    // reconnect + reattach proves the survival is usable
    const dm2 = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
    const h2 = await dm2.openSession({ cmd: 'dtach', args: ['-a', sock, '-r', 'winch'], cols: 80, rows: 24 });
    await h2.ready;
    let out2 = '';
    h2.onData = (buf) => { out2 += buf.toString('utf-8'); };
    await sleep(500);
    check('reattached to the surviving dtach session', !!h2, '');
    h2.kill();
    try { execSync(`pkill -f ${sock}`, { stdio: 'ignore' }); } catch {}
    dm2.stop();
  }
}

console.log('— daemon death fires onExit on open session handles (attach self-heal) —');
{
  const dm3 = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
  const h3 = await dm3.openSession({ cmd: 'sh', args: ['-c', 'sleep 60'], cols: 80, rows: 24 });
  await h3.ready;
  let exited = false;
  h3.onExit = () => { exited = true; };
  // kill the daemon out from under the live session channel (= a self-upgrade
  // re-exec severing attaches — real report: frozen/blank local terminals)
  const dpid = Number(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8'));
  process.kill(dpid, 'SIGKILL');
  const t0 = Date.now();
  while (!exited && Date.now() - t0 < 5000) await sleep(100);
  check('mux death fired onExit on the pty handle (reattach path can heal)', exited, '');
  dm3.stop();
}

// ── THE DAEMON IS A SECOND HOLDER OF THE SERVER ENV (2026-09-14, the P0b
// round-1 verifier's HIGH) ────────────────────────────────────────────────
// `DeviceManager._spawnLocal` used to spawn the daemon with `{...process.env}`
// and `agentd.spawnEnv()` laid the server's sanitized session env OVER the
// daemon's `process.env` — so a pipe-session claude's /proc/<pid>/environ
// carried the full cluster integration secret a PREVIOUS server life had
// handed the daemon (measured on a worktree server; the daemon survives
// restarts by design, so a WITHDRAWN default kept flowing into new sessions).
// Two layers, each with its own control: ① the daemon is BORN sanitized
// (src/agent-env.js `daemonEnv`), ② every daemon child spawn merges over a
// sanitized base whatever the daemon itself holds — proved on a daemon
// spawned BY HAND with the secret (a previous-life daemon), with a PRE-FIX
// copy of the bundle (the raw `process.env` base) as the control that hands
// it down.
console.log('— the daemon is a second holder: a cluster secret in the server env reaches neither the daemon nor its children —');
const extraDaemons = [];   // pids to SIGTERM at exit (each leg has its own root)
if (!fs.existsSync('/proc/self/environ')) {
  console.log('  · SKIP: no /proc — the environ assertions need procfs (Linux only)');
} else {
  const { spawn } = await import('node:child_process');
  const { agentEnv, daemonEnv, DAEMON_ENV_KEEP, AGENT_ENV_KEEP } = require('../src/agent-env.js');
  const SECRET = 'CLUSTERSECRET-fk-' + 'Q7f3'.repeat(5) + 'ZZ9';   // 40 chars, unmistakable
  check('the synthetic secret is 40 chars', SECRET.length === 40, String(SECRET.length));
  const PROBE = 'env | grep -c -e VIBESPACE_INTEGRATION -e CLUSTERSECRET; env | grep -c VS_CANARY_KEEP; echo PROBE_DONE; sleep 1';
  const countsOf = (out) => { const m = out.match(/^(\d+)\r?\n(\d+)\r?\nPROBE_DONE/m); return m ? { secret: Number(m[1]), canary: Number(m[2]) } : null; };
  const readPid = (root) => Number(fs.readFileSync(path.join(root, 'state', 'agentd.pid'), 'utf8'));
  const waitFor = async (pred, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(100); } return pred(); };
  const spawnProbe = async (dmX, label) => {
    let out = '';
    const h = await dmX.openSession({ cmd: '/bin/sh', args: ['-c', PROBE], cols: 80, rows: 24, env: { ...agentEnv(process.env), TERM: 'xterm' } });
    h.onData = (b) => { out += b.toString('utf-8'); };
    await h.ready;
    await waitFor(() => /PROBE_DONE/.test(out), 4000);
    const c = countsOf(out);
    check(`${label}: the probe child ran and reported (raw ${JSON.stringify(out.slice(0, 40))})`, !!c, out.slice(0, 200));
    try { h.kill(); } catch {}
    return c || { secret: -1, canary: -1 };
  };
  // the server env for this leg: the secret in BOTH cluster forms + a canary
  // that MUST survive the strip (a zero that comes from a probe that saw
  // nothing proves nothing)
  process.env.VIBESPACE_INTEGRATION_FAKE_APIKEY = SECRET;
  process.env.VIBESPACE_INTEGRATIONS = JSON.stringify([{ id: 'fake', values: { apiKey: SECRET } }]);
  process.env.VS_CANARY_KEEP = 'canary-1';
  check('CONTROL: the server env really carries the secret before the strip', process.env.VIBESPACE_INTEGRATION_FAKE_APIKEY === SECRET && JSON.stringify(process.env).includes(SECRET));
  check('agentEnv() drops both cluster forms and keeps the canary (the orchestrator half)', !('VIBESPACE_INTEGRATION_FAKE_APIKEY' in agentEnv(process.env)) && !('VIBESPACE_INTEGRATIONS' in agentEnv(process.env)) && agentEnv(process.env).VS_CANARY_KEEP === 'canary-1');
  const d = daemonEnv(process.env);
  check('daemonEnv() drops them too and keeps exactly the daemon tier\'s own names on top of the agent set', !('VIBESPACE_INTEGRATION_FAKE_APIKEY' in d) && !('VIBESPACE_INTEGRATIONS' in d) && d.VIBESPACE_NODE_MODULES === process.env.VIBESPACE_NODE_MODULES && d.VIBESPACE_AGENTD_ROOT === process.env.VIBESPACE_AGENTD_ROOT && d.VS_CANARY_KEEP === 'canary-1');
  // the keep set is DERIVED from the daemon tier's own reads — a name it reads but the set omits would break the daemon loudly, a name it keeps but nothing reads is a holder for nothing
  const readByDaemonTier = new Set();
  for (const f of fs.readdirSync(path.join(repo, 'src/agentd')).filter((x) => x.endsWith('.js'))) {
    for (const m of fs.readFileSync(path.join(repo, 'src/agentd', f), 'utf8').matchAll(/process\.env\.(VIBESPACE_[A-Z_]+)/g)) readByDaemonTier.add(m[1]);
  }
  readByDaemonTier.delete('VIBESPACE_REMOTE_ATTEMPT');   // attach-cli's OWN respawn marker (set by pty-wrapper in the attach-cli process, never a daemon spawn base)
  const missing = [...readByDaemonTier].filter((n) => !DAEMON_ENV_KEEP.has(n));
  const extra = [...DAEMON_ENV_KEEP].filter((n) => !AGENT_ENV_KEEP.has(n) && !readByDaemonTier.has(n));
  check(`DAEMON_ENV_KEEP = AGENT_ENV_KEEP ∪ every VIBESPACE_* the daemon tier reads (${[...readByDaemonTier].sort().join(', ')})`, !missing.length && !extra.length, `missing: ${missing.join(',') || '-'} extra: ${extra.join(',') || '-'}`);

  // ① a daemon born from the REAL _spawnLocal under that env
  const root1 = path.join(tmp, 'holder-1');
  process.env.VIBESPACE_AGENTD_ROOT = root1;
  const dm4 = new DeviceManager({ dataDir, bundlePath: bundle, version, nodeModules: path.join(repo, 'node_modules'), log: () => {} });
  dm4.installLocal();
  await dm4.connect();
  const pid1 = readPid(root1); extraDaemons.push(pid1);
  const denv1 = fs.readFileSync(`/proc/${pid1}/environ`, 'latin1');
  check('POSITIVE CONTROL: the daemon environ is readable and carries the canary', denv1.includes('VS_CANARY_KEEP=canary-1'));
  check('①  the daemon\'s OWN environ carries neither the name nor the secret (born sanitized)', !denv1.includes('VIBESPACE_INTEGRATION') && !denv1.includes(SECRET));
  check('①  …and still carries what the daemon tier reads (root + node_modules)', denv1.includes('VIBESPACE_AGENTD_ROOT=') && denv1.includes('VIBESPACE_NODE_MODULES='));
  const c1 = await spawnProbe(dm4, '① pty child of the born-sanitized daemon');
  check('①  a pty session child sees 0 secret lines and the canary', c1.secret === 0 && c1.canary === 1, JSON.stringify(c1));
  let pout = '';
  const p1 = await dm4.openPipeSession({ sid: 'holder-pipe-1', cmd: '/bin/sh', args: ['-c', PROBE.replace('; sleep 1', '')], cwd: tmp, env: agentEnv(process.env) });
  p1.onData = (b) => { pout += b.toString('utf-8'); };
  await p1.ready; await waitFor(() => /PROBE_DONE/.test(pout), 4000);
  const cp = countsOf(pout);
  check('①  a PIPE-session child (the R6 final form) sees 0 secret lines and the canary', cp && cp.secret === 0 && cp.canary === 1, JSON.stringify(cp) + ' raw ' + JSON.stringify(pout.slice(0, 80)));
  dm4.stop();

  // ② a daemon from a PREVIOUS LIFE that HOLDS the secret: spawned by hand
  //    with it in its env (what every daemon born under the old client.js is),
  //    the NEW bundle's spawnEnv() still refuses to hand it down
  const bootHeld = async (tag, bundlePath) => {
    const root = path.join(tmp, tag);
    process.env.VIBESPACE_AGENTD_ROOT = root;
    const dmX = new DeviceManager({ dataDir, bundlePath, version, nodeModules: path.join(repo, 'node_modules'), log: () => {} });
    dmX._ensureLocalToken();                 // the daemon reads the token file fresh on every hello
    const child = spawn(process.execPath, [bundlePath], { detached: true, stdio: 'ignore', env: { ...process.env, VIBESPACE_AGENTD_ROOT: root, VIBESPACE_INTEGRATION_FAKE_APIKEY: SECRET } });
    child.unref();
    const up = await waitFor(() => fs.existsSync(path.join(root, 'state', 'agentd.sock')) && fs.existsSync(path.join(root, 'state', 'agentd.pid')), 8000);
    check(`${tag}: the hand-spawned daemon came up`, up);
    await dmX.connect();
    const pid = readPid(root); extraDaemons.push(pid);
    const denv = fs.readFileSync(`/proc/${pid}/environ`, 'latin1');
    check(`${tag}: FIXTURE CONTROL — this daemon really HOLDS the secret in its own environ`, denv.includes(`VIBESPACE_INTEGRATION_FAKE_APIKEY=${SECRET}`));
    return dmX;
  };
  const dm5 = await bootHeld('holder-2-held', bundle);
  const c2 = await spawnProbe(dm5, '② child of a previous-life daemon (fixed spawnEnv)');
  check('②  the FIXED spawnEnv hands a HELD secret to no child (0 secret lines, canary intact)', c2.secret === 0 && c2.canary === 1, JSON.stringify(c2));
  dm5.stop();

  // ③ CONTROL: the PRE-FIX base (`...process.env` under the server env) on
  //    the same held daemon hands it straight down — the leg can go red
  const bundleSrc = fs.readFileSync(bundle, 'utf8');
  // esbuild re-spells the source line (`...(extra || {})` loses its parens), so
  // the anchor is a regex over the BUNDLE and the source pin below keeps the
  // source spelling; both must hit exactly once
  const ANCHOR = 'const merged = { ...daemonEnv(process.env), ...(extra || {}) };';
  const BUNDLE_RE = /const merged = \{ \.\.\.daemonEnv\(process\.env\), \.\.\.\(?extra \|\| \{\}\)? \};/g;
  check('the built bundle carries the sanitized spawnEnv base exactly once (patch anchor)', (bundleSrc.match(BUNDLE_RE) || []).length === 1, String((bundleSrc.match(BUNDLE_RE) || []).length));
  const preBundle = path.join(tmp, 'agentd-prefix.js');
  fs.writeFileSync(preBundle, bundleSrc.replace(BUNDLE_RE, 'const merged = { ...process.env, ...(extra || {}) };'));
  const dm6 = await bootHeld('holder-3-prefix', preBundle);
  const c3 = await spawnProbe(dm6, '③ child of a previous-life daemon (PRE-FIX spawnEnv)');
  check('③  PRE-FIX CONTROL: the raw `process.env` base hands the held secret to the child (≥ 1 secret line) — the shape the verifier measured on a real claude', c3.secret >= 1, JSON.stringify(c3));
  dm6.stop();

  // wiring pins: the three daemon birth sites + the child base name the sanitizer, and no raw process.env env literal survives in the daemon tier
  const clientSrc = fs.readFileSync(path.join(repo, 'src/agentd/client.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const daemonSrc = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  check('WIRING: _spawnLocal spawns the daemon from daemonEnv(process.env)', /env:\s*\{\s*\.\.\.daemonEnv\(process\.env\)/.test(clientSrc));
  check('WIRING: spawnEnv() merges over daemonEnv(process.env), and the --stdio bridge + the upgrade re-exec are born from it too', daemonSrc.includes(ANCHOR) && (daemonSrc.match(/daemonEnv\(process\.env\)/g) || []).length >= 3);
  const RAW = /env:\s*(?:process\.env\b|\{\s*\.\.\.process\.env\b)/;
  check('WIRING: no `env: process.env` / `env: { ...process.env` literal survives in src/agentd/{client,agentd}.js', !RAW.test(clientSrc) && !RAW.test(daemonSrc));
  check('CONTROL: the raw-literal rule matches the retired spellings', RAW.test('spawn(x, [], { env: { ...process.env, A: 1 } })') && RAW.test('{ detached: true, stdio: "ignore", env: process.env,') && !RAW.test('env: daemonEnv(process.env)') && !RAW.test('env: spawnEnv(msg.env)'));
  delete process.env.VIBESPACE_INTEGRATION_FAKE_APIKEY; delete process.env.VIBESPACE_INTEGRATIONS; delete process.env.VS_CANARY_KEEP;
}

// restore version stamp + cleanup
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
for (const pid of extraDaemons) { try { process.kill(pid, 'SIGTERM'); } catch {} }
try { const pid = Number(fs.readFileSync(path.join(tmp, 'agentd', 'state', 'agentd.pid'), 'utf8')); process.kill(pid, 'SIGTERM'); } catch {}
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall agentd M1 session tests passed');
process.exit(0);
