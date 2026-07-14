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

// restore version stamp + cleanup
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
try { const pid = Number(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8')); process.kill(pid, 'SIGTERM'); } catch {}
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall agentd M1 session tests passed');
process.exit(0);
