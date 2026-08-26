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
//      28-route GET battery (the lost-binding class ONLY manifests at boot or
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
  'test-job-model', 'test-jobs-engine', 'test-peer-messaging', 'test-lazy', 'test-server-globals',
  'test-resume-all-desktops', // pure scan + the WIRING pin (the 2.331.0 dead-fix lesson)
  'test-path-mounts',   // /svc/<name>/ reverse proxy: real http+ws round trips + store rules
  'test-mount-oauth-probe', // dead OAuth token behind a healthy-looking mount: probe eligibility + slow clock + phrasings + Re-authorize button
  'test-otel-truth',    // per-request billing truth: parser + loopback ingest + bake override + wiring pins
  'test-chat-frame-guard', // 38MB-poisoning trio: poison guard + frame-file bypass (real wrapper) + rescue
  'test-agent-msg',     // Channels v1: ACL matrix + delivery ladder + wiring pins
  'test-proxy-post',    // proxied POST body reaches the target (real unblocker; the json-parser-skips-/proxy/ pin)
  'test-compaction-ux', // prompt_too_long → guidance card + /compact turn label + two-step Stop (normalizer behavioral + wiring pins)
  'test-auto-resume', // continue-after-limit-reset (tri-state gate, never-early/twice, restart-survival) + CLI output style at spawn
  'test-public-links', // every "link to something here" surface uses the instance's public address (not the browser origin)
  'test-instance-url', // this instance's own public address: frp mapping layered over agentd.publicUrl (never written), one publisher of the relay proxy
  'test-design-kit', // /design kit from the installed CLI: extraction (cli-dir + binary parity), adaptation all-or-nothing, helper --check, wiring
  'test-published-pages', // instance-hosted shareable HTML: publish/serve/auth-gate/CSP-sandbox/upsert + wiring pins
  'test-peer-msg-card', // peer message visible on the LIVE stream (result.origin mining + 3-site dedup)
  'test-pool-auto', 'test-account-pool', 'test-account-verdicts',
  'test-pool-signed-out', 'test-account-relogin', 'test-auto-cli-refresh',
  'test-cli-usage-parse', 'test-rate-limit-capture', 'test-agentd-upgrade-loop', 'test-vendor-whitelist', 'test-wrapper-files',
  'test-usage-estimator', // dead-reckoning core; was OUTSIDE the gate (silent-stale class) until the 2.368.13 delta-relative calib change touched it
  'test-task-wakeup-card', // background-task lifecycle closure incl. the real record order (tool_result BEFORE the completion notification); also joined the gate late (same class)
  'test-codex-history', // codex rollout coverage: custom_tool_call_output routing, sub-agent visibility, live contextWindow, encrypted reasoning
  'test-codex-quota',   // codex quota P0+P1: window-by-length normalization (0.149.x single-window), exhaustion markers kept, persistence, estimator inclusion
  'test-codex-pool',    // codex pooled account cold-switch v1: store/spawn/self-heal + engine gates + wrapper signal relay
  'test-peer-delivery', // peerDelivery registry lane: codex rpc-queue rung (real deliver.create + sidecar) + wiring pins
  'test-chat-trim-guard', // fold-dominated window trim guard (inc-mtajy6wr white-screen) pins
  'test-local-device', 'test-sysinfo-op', 'test-transcript-parity',
  'test-writer-sweep', 'test-agentd-session', 'test-session-brain-dark',
  'test-chat-e2e',      // ONE real haiku turn through the full chat pipeline (oat token slot; SKIPs without ~/.config/vibespace/ci-oat)
  'test-client-boot',   // headless-chrome app boot (the FRONTEND face of 打不开; SKIPs without chrome)
  'test-sidebar-rail',  // rail panels + process manager CDP battery (was manual-only and went silently stale — the 9-item assert was red for 12 releases; no rebuild: overlays the gate's own build; SKIPs without chrome)
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
