#!/usr/bin/env node
// THE MANDATORY RELEASE GATE (2.336.0, owner directive: "发版之前能有个强制CI
// 过程，确保至少核心工作流都是能用的"). Runs the full core battery in ~90s:
//   1. npm run build   — esbuild + arch(40) + bundle-globals + ws-contract +
//                        session-schema + i18n (all already chained in build)
//   2. every gate suite the CLAUDE.md routing table names + the account/pool/
//      usage batteries (pure + store + real-daemon, all self-contained)
//   3. test-client-boot — headless chrome boots the real app (splash gone,
//      zero uncaught exceptions, ws open; negative-controlled) — the CLIENT
//      face of "打不开" (2.330.x) that static checks only partially model
//   4. test-restore-smoke — boots the WORKING TREE in an isolated worktree,
//      creates a real session, SIGKILLs, reboots, reconnects, then fires the
//      27-route GET battery (the lost-binding class ONLY manifests at boot or
//      route-run time; 2.330.0/2.330.1/2.333.0/2.335.0 all slipped past every
//      static gate)
// Enforced by scripts/git-hooks/pre-push (docs-only pushes skip; emergency
// bypass VIBESPACE_SKIP_CI=1) and mirrored in .github/workflows/ci.yml.
// Fail-fast: the first red suite stops the run with a nonzero exit.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const t0 = Date.now();

// Ordered cheap→expensive so a pure-logic regression fails in seconds.
const SUITES = [
  'test-discovery-interpret', 'test-remote-discovery-dirty', 'test-remote-shell',
  'test-usage-walk-parity', 'test-ctx-sync', 'test-migrations',
  'test-job-model', 'test-jobs-engine', 'test-lazy', 'test-server-globals',
  'test-pool-auto', 'test-account-pool', 'test-account-verdicts',
  'test-pool-signed-out', 'test-account-relogin', 'test-auto-cli-refresh',
  'test-cli-usage-parse', 'test-agentd-upgrade-loop', 'test-vendor-whitelist', 'test-wrapper-files',
  'test-local-device', 'test-sysinfo-op', 'test-transcript-parity',
  'test-writer-sweep', 'test-agentd-session', 'test-session-brain-dark',
  'test-chat-e2e',      // ONE real haiku turn through the full chat pipeline (oat token slot; SKIPs without ~/.config/vibespace/ci-oat)
  'test-client-boot',   // headless-chrome app boot (the FRONTEND face of 打不开; SKIPs without chrome)
  'test-restore-smoke', // LAST: the end-to-end boot + session-lifecycle + route battery
];

function run(name, cmd, args) {
  const s = Date.now();
  const r = spawnSync(cmd, args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, encoding: 'utf-8' });
  const ms = Date.now() - s;
  if (r.status !== 0) {
    console.error(`\n✗ ${name} FAILED (${ms}ms) — release gate is RED, do not push\n`);
    console.error((r.stdout || '').split('\n').slice(-40).join('\n'));
    console.error(r.stderr || '');
    process.exit(1);
  }
  const tail = (r.stdout || '').trim().split('\n').pop() || 'ok';
  console.log(`  ✓ ${name} (${ms}ms) — ${tail.slice(0, 80)}`);
}

console.log('release gate: build + ' + SUITES.length + ' suites');
run('npm run build', 'npm', ['run', 'build']);
for (const s of SUITES) run(s, process.execPath, [path.join(repo, 'scripts', s + '.mjs')]);
console.log(`\nALL GREEN — release gate passed in ${Math.round((Date.now() - t0) / 1000)}s`);
