#!/usr/bin/env node
// Self-upgrade re-exec must PRESERVE the original argv (2.185.2, real
// xingweil↔Mac dial outage). The dial transport reads `--dial <url>
// --dial-token <t>` from process.argv; the upgrade re-exec used to spawn the
// new bundle with NO args → a DIAL device came back in default LISTEN mode: it
// stopped dialing the instance AND held the singleton so launchd couldn't
// relaunch the real --dial daemon (walter-class wedge, usually masked by the
// launchd relaunch winning the race — lost under rapid upgrade churn).
//
// A live /proc-cmdline check is unreliable here: the daemon sets
// process.title = 'vibespace-device', which clobbers argv memory on Linux. So
// this proves (a) the pure helper preserves every flag, and (b) beginUpgrade
// actually WIRES reExecArgv into the spawn (guards against reverting to the
// bare `[newPath]` array), verified in the ESBUILD BUNDLE too so a broken
// require can't slip through.
// Run: node scripts/test-agentd-reexec-argv.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };

// ── (a) the pure helper preserves flags ──
const { reExecArgv } = require('../src/agentd/reexec.js');
{
  const argv = ['/usr/bin/node', '/old/2.0.0/agentd.js', '--dial', 'wss://x/agentd-dial', '--dial-token', 'TK', '--host-token', 'HT'];
  const out = reExecArgv('/new/2.1.0/agentd.js', argv);
  check('NEW script path is first', out[0] === '/new/2.1.0/agentd.js');
  check('--dial + url preserved', out[1] === '--dial' && out[2] === 'wss://x/agentd-dial');
  check('--dial-token + value preserved', out.includes('--dial-token') && out.includes('TK'));
  check('--host-token preserved', out.includes('--host-token') && out.includes('HT'));
  check('OLD script path dropped', !out.includes('/old/2.0.0/agentd.js'));
  check('a no-flags daemon re-execs cleanly (listen mode unchanged)',
    JSON.stringify(reExecArgv('/new/a.js', ['/usr/bin/node', '/old/a.js'])) === JSON.stringify(['/new/a.js']));
}

// ── (b) beginUpgrade WIRES reExecArgv into the re-exec spawn ──
{
  const src = fs.readFileSync(path.join(repo, 'src/agentd/agentd.js'), 'utf-8');
  // the spawn must go through reExecArgv, NOT a bare `[path.join(dir, ...)]`
  const reExecLine = src.split('\n').find((l) => l.includes('spawn(process.execPath') && l.includes('reExecArgv'));
  check('agentd.js re-exec spawns via reExecArgv', !!reExecLine, 'the upgrade spawn no longer preserves argv');
  check('agentd.js imports reExecArgv from the side-effect-free module', /require\(['"]\.\/reexec['"]\)/.test(src));
  // the old bare-array form must be GONE from the upgrade spawn
  check('no bare-array spawn in the upgrade path', !/spawn\(process\.execPath,\s*\[path\.join\(dir,/.test(src));
}

// ── (c) the ESBUILD bundle inlines reexec.js (a broken require would fail) ──
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-reexec-bundle-'));
  const out = path.join(tmp, 'agentd.js');
  const version = require('../package.json').version;
  fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
  execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${out}`], { cwd: repo });
  const bundle = fs.readFileSync(out, 'utf-8');
  check('bundle builds and contains the reExecArgv helper', bundle.includes('reExecArgv') && bundle.includes('argv.slice(2)'));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

console.log(failed ? `\n${failed} FAILED` : '\nre-exec argv test passed');
process.exit(failed ? 1 : 0);
