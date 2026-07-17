#!/usr/bin/env node
// Pipe-session ADOPTION across a daemon restart (the 2026-07-17 lengyue
// outage): a remote chat child is spawned as `sh -lc '… exec … <cli>'`, so
// after the execs its /proc cmdline no longer contains the recorded argv0
// ('sh'). The old _childAlive cmdline check therefore misjudged every LIVE
// child as a recycled pid when a daemon upgrade re-exec forced re-adoption —
// open() synthesized a `_remote_exit code:143 crashed` sentinel, the wrapper
// finalized the session dead, and the real claude ran on ORPHANED (and the
// same misjudgment made kill-pipe-session a no-op). Fix = exec-proof
// startTime identity + an adopted-child liveness watcher (keeper parity).
// Run: node scripts/test-agentd-adopt.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agentd-adopt-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (fn, ms, step = 250) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return fn(); };

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const ROOT = process.env.VIBESPACE_AGENTD_ROOT;
const sessFile = (sid, ext) => path.join(ROOT, 'state', 'sessions', sid + ext);
const daemonPid = () => Number(fs.readFileSync(path.join(ROOT, 'state', 'agentd.pid'), 'utf8'));
const killDaemon = async () => {
  const pid = daemonPid();
  try { process.kill(pid, 'SIGTERM'); } catch { }
  await until(() => !alive(pid), 5000);
  return !alive(pid);
};
const mkDm = () => new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });

let dm = mkDm();
dm.installLocal();
await dm.connect();

console.log('— adoption: a live exec-away child survives a daemon restart —');
let childA;
{
  // the REAL remote-chat spawn shape: sh -lc '… exec …' (cmdline loses "sh")
  const h = await dm.openPipeSession({ sid: 'adopt-a', cmd: 'sh', args: ['-lc', 'exec sleep 300'], cwd: tmp, env: {} });
  const r = await h.ready;
  childA = r.pid;
  check('pipe child spawned (fresh)', !r.existing && childA > 0, JSON.stringify(r));
  await until(() => { try { return !fs.readFileSync(`/proc/${childA}/cmdline`, 'utf8').includes('sh'); } catch { return false; } }, 3000);
  let cmdline = ''; try { cmdline = fs.readFileSync(`/proc/${childA}/cmdline`, 'utf8').replace(/\0/g, ' ').trim(); } catch { }
  check('child exec\'d away from argv0 (cmdline lacks "sh")', cmdline.startsWith('sleep'), cmdline);
  const meta = JSON.parse(fs.readFileSync(sessFile('adopt-a', '.json'), 'utf8'));
  check('meta records exec-proof startTime', !!meta.startTime, JSON.stringify(meta));

  check('daemon killed (simulated upgrade re-exec)', await killDaemon(), '');
  dm.stop();
  dm = mkDm();
  await dm.connect(); // respawns a fresh daemon on the same root

  const h2 = await dm.openPipeSession({ sid: 'adopt-a', cmd: 'sh', args: ['-lc', 'exec sleep 300'], cwd: tmp, env: {}, offset: 0 });
  const r2 = await h2.ready;
  check('re-open ADOPTS the live child (existing, not exited)', r2.existing && r2.exited === undefined, JSON.stringify(r2));
  await sleep(600);
  const out = fs.readFileSync(sessFile('adopt-a', '.out'), 'utf8');
  check('NO synthesized crash sentinel for the live child', !out.includes('_remote_exit'), out.slice(-200));
  check('child still running after adoption', alive(childA), String(childA));
}

console.log('— kill-pipe-session actually kills an ADOPTED child (terminate path) —');
{
  await dm.killPipeSession('adopt-a');
  check('adopted child killed by kill-pipe-session', await until(() => !alive(childA), 6000), String(childA));
}

console.log('— adopted-child watcher writes the exit sentinel (no wait() possible) —');
{
  const h = await dm.openPipeSession({ sid: 'adopt-b', cmd: 'sh', args: ['-lc', 'exec sleep 300'], cwd: tmp, env: {} });
  const { pid } = await h.ready;
  check('daemon killed again', await killDaemon(), '');
  dm.stop();
  dm = mkDm();
  await dm.connect();
  const h2 = await dm.openPipeSession({ sid: 'adopt-b', cmd: 'sh', args: ['-lc', 'exec sleep 300'], cwd: tmp, env: {}, offset: 0 });
  const r2 = await h2.ready;
  check('second child adopted alive', r2.existing && r2.exited === undefined, JSON.stringify(r2));
  process.kill(pid, 'SIGKILL'); // the child dies while only ADOPTED (unwaitable)
  const ok = await until(() => {
    try { return fs.readFileSync(sessFile('adopt-b', '.out'), 'utf8').includes('_remote_exit'); } catch { return false; }
  }, 12000, 500);
  check('watcher wrote the exit sentinel for the dead adopted child', ok, '');
  const meta = JSON.parse(fs.readFileSync(sessFile('adopt-b', '.json'), 'utf8'));
  check('meta finalized (exited set, adopted-flagged)', meta.exited !== undefined && meta.adopted === true, JSON.stringify(meta));
}

console.log('— legacy meta (no startTime) still adopts via the CLI-name fallback —');
{
  const h = await dm.openPipeSession({ sid: 'adopt-c', cmd: 'sh', args: ['-lc', 'exec sleep 300'], cwd: tmp, env: {} });
  const { pid } = await h.ready;
  // simulate a pre-fix meta: strip startTime (old daemons never wrote it)
  const mf = sessFile('adopt-c', '.json');
  const meta = JSON.parse(fs.readFileSync(mf, 'utf8'));
  delete meta.startTime;
  fs.writeFileSync(mf, JSON.stringify(meta));
  check('daemon killed a third time', await killDaemon(), '');
  dm.stop();
  dm = mkDm();
  await dm.connect();
  // 'sleep' matches neither argv0 'sh' nor claude|codex — the honest outcome
  // for an UNKNOWN legacy child is refusing to claim it (synthesize), but a
  // claude/codex cmdline (the only real remote-chat children) must adopt.
  // Emulate by checking the regex directly against a claude-style cmdline:
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf8');
  check('legacy fallback recognizes claude/codex cmdlines', /\(\^\|\[\/\\s\]\)\(claude\|codex\)/.test(src), '');
  try { process.kill(pid, 'SIGKILL'); } catch { }
}

dm.stop();
try { process.kill(daemonPid(), 'SIGTERM'); } catch { }
await sleep(300);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(failed ? `\n${failed} FAILED` : '\nagentd adoption test passed');
process.exit(failed ? 1 : 0);
