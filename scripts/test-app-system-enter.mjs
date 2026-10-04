#!/usr/bin/env node
// THE APP SYSTEM — the heavy gate (docs/design-app-persistence.zh.md §3.2, Layer 1). The REAL helper
// (deploy/sysroot/vs-sysroot-enter), real unshare / chroot / sudo / debootstrap — ONLY INSIDE A DISPOSABLE CONTAINER that
// mirrors the pod: node:22-bookworm-slim (the fleet image's base), --cap-add SYS_ADMIN, AppArmor + seccomp unconfined
// (the pod has neither), a non-root user with NOPASSWD sudo, a volume standing in for the home PVC (its root 2775 —
// fsGroup's shape). NOTHING here runs the helper, unshare, chroot, debootstrap or a sudoers change on this machine.
// The container runs scripts/fixtures/app-system-driver.cjs (one `@@ {leg, ok, detail}` line per check): the boot
// install (+ a broken drop-in refused), create (rung B debootstrap; rung A the image's tarball), a CLI + a GUI package
// installed through SYS_SCRIPT, the catalog rows + shims, a plan simulated against the userland, the shim on the SAME pid
// (P7), the token never inside, no mount in the pod's namespace (even after a SIGKILL), refusals by name, an interrupted
// install → Repair, Rebase (rename) + Roll back + delete, removal, the hardening legs (planted links inside the app system
// and under HOME, a dirty sudo command line, a helper source of other bytes — each with its patched-copy control), and a CONTROLS leg per security rule (a patched copy of
// the helper without the rule does the bad thing). Without docker or the image: SKIP with the evidence.
// Run: node scripts/test-app-system-enter.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'node:22-bookworm-slim';
const T0 = Date.now();
let pass = 0, fail = 0, skipped = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); } };
const finish = () => { console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${skipped ? `, ${skipped} skipped` : ''}) in ${Math.round((Date.now() - T0) / 1000)} s`); process.exit(fail ? 1 : 0); };
const dk = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' });
if (dk.status !== 0) { skipped++; console.log(`  ⊘ SKIP docker is not usable here: ${(dk.error && dk.error.message) || (dk.stderr || '').trim().split('\n')[0]}`); finish(); }
const img = spawnSync('docker', ['image', 'inspect', IMAGE, '--format', '{{.Id}}'], { encoding: 'utf8' });
if (img.status !== 0) { skipped++; console.log(`  ⊘ SKIP the image ${IMAGE} is not on this machine — pull it, then run again`); finish(); }
console.log(`docker ${dk.stdout.trim()} · ${IMAGE} ${img.stdout.trim().slice(7, 19)}`);
// the PVC stand-in is a docker VOLUME (ext4 under docker's root, like the pod's block PVC): this machine's /tmp is nodev,
// where debootstrap refuses to build a userland — the pod's PVC is `rw,relatime` (design §1)
const name = `vs-app-system-enter-${process.pid}`;
const pvc = name;
const mk = spawnSync('docker', ['volume', 'create', pvc], { encoding: 'utf8' });
if (mk.status !== 0) { skipped++; console.log(`  ⊘ SKIP docker volume create failed: ${(mk.stderr || '').trim()}`); finish(); }
const PREP = [
  'set -e',
  'apt-get update -qq > /dev/null',
  'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq sudo debootstrap wget xvfb > /dev/null',
  'usermod -d /home/u node',
  "echo 'node ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/zz-node && chmod 0440 /etc/sudoers.d/zz-node", // the pod's shape: /etc/sudoers.d/<user name> (boot-root.sh) — one that sorts AFTER `vibespace-sysroot`
  'chown root:node /home/u && chmod 2775 /home/u',
  'install -d -m 0700 -o node -g node /home/u/.vibespace',
  'cd /tmp && exec su node -s /bin/sh -c "HOME=/home/u PATH=/usr/local/bin:/usr/bin:/bin node /repo/scripts/fixtures/app-system-driver.cjs"',
].join('\n');
console.log('§1 one disposable container (the pod\'s shape) runs the driver as its non-root user');
const r = spawnSync('docker', ['run', '--rm', '--name', name, '--cap-add', 'SYS_ADMIN', '--security-opt', 'apparmor=unconfined', '--security-opt', 'seccomp=unconfined', '-v', `${repo}:/repo:ro`, '-v', `${pvc}:/home/u`, IMAGE, 'sh', '-c', PREP], { encoding: 'utf8', timeout: 40 * 60 * 1000, maxBuffer: 256 * 1024 * 1024 });
const vr = spawnSync('docker', ['volume', 'rm', pvc], { encoding: 'utf8' });
ok(vr.status === 0, `the PVC stand-in (volume ${pvc}) removed — the container was --rm`);
const legs = String(r.stdout || '').split('\n').filter((l) => l.startsWith('@@ ')).map((l) => { try { return JSON.parse(l.slice(3)); } catch { return { leg: l.slice(3, 200), ok: false }; } });
for (const l of legs) ok(l.ok, l.leg + (l.ok || l.detail == null ? '' : ` — ${JSON.stringify(l.detail).slice(0, 900)}`));
const WANT = ['boot:', 'control: a broken drop-in', 'create (rung B', '§5 P3', 'install hello', 'catalog: sys.xterm', 'a plan INTO', 'GET /api/apps', '~/.vibespace/sysroot/bin/hello', 'P7:', 'the token never inside', 'a private mount namespace', 'the keeper\'s group kill', 'a crash (SIGKILL)', 'refused BY NAME', 'an install left unpacked', 'Repair (', 'create (rung A', 'the Rebase plan', 'Rebase:', 'Roll back swaps', 'Delete the previous', 'remove hello', 'CONTROL private namespace', 'CONTROL env -i', 'CONTROL HOME', 'CONTROL realpath', 'CONTROL root-owned', 'CONTROL identity contract', 'CONTROL arch', 'CONTROL chroot --userspec', 'CONTROL --root allowlist', 'CONTROL the sudoers drop-in', 'done'];
WANT.push('hardening 5 (r2):', 'hardening 1: a planted', 'hardening 1: etc/passwd', 'hardening 1: usr/share/fonts', 'hardening 2:', 'hardening 3:', 'hardening 5:', 'hardening 8:'); // lane app-system-harden
const missing = WANT.filter((w) => !legs.some((l) => l.leg.startsWith(w)));
ok(!missing.length && r.status === 0, `every leg reported (${legs.length}) and the container exited 0${missing.length ? ` — missing: ${missing.join(' · ')}` : ''}${r.status ? ` — exit ${r.status}: ${String(r.stderr || '').trim().split('\n').slice(-5).join(' | ').slice(0, 600)}` : ''}`);
finish();
