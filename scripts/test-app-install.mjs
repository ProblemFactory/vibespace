#!/usr/bin/env node
// APPS THAT SURVIVE A REBUILT MACHINE — the REAL-APT gate (docs/design-app-persistence.zh.md §3.1 + §3.3, Layer 0).
// HEAVY: five throwaway Debian 12 containers (node:22-bookworm-slim — the fleet image's base) sharing ONE scratch HOME,
// exactly a pod recreated over its home volume. The checkout is bind-mounted READ-ONLY; inside, a non-root user with
// passwordless sudo (the fleet's shape) drives the REAL modules — the machine keeper (desktop-serve → app-serve), the
// ONE package slot (desktop-access), the hub's engine (apps-engine) — through scripts/fixtures/app-install-driver.cjs.
// Nothing here runs apt on this machine; no container, no gate: without docker or the image the suite SKIPS with the
// evidence printed (never a fake pass).
//   §1 the first machine (network): plan → install hello (the sudo -n slot, the root script) → a .deb file the user has
//      (sl, downloaded as the user) → a package built here that exists in NO archive (capp-localonly, a .deb) → a
//      package installed OUTSIDE VibeSpace (cowsay) is the drift tripwire's → Adopt →
//      install xterm (a desktop file ⇒ catalog rows app.xterm + app.xterm.<stem>) → remove hello (the cache follows)
//      → Refresh (the slot's --only-upgrade)
//   §2 the repository root wrote: root-owned 0755, every stanza byte-identical to the PURE packagesStanza, the Packages
//      index = packagesIndex, every file named debFileName (no %3a), the base sha = the PURE reader's
//   §3 THE REBUILT MACHINE: a FRESH root filesystem, NO network (`--network none`), the same HOME: the boot replay runs
//      rung 1 OFFLINE from ~/.vibespace/apps/debs — xterm, sl, cowsay, capp-localonly are back (hello is not), timed; a
//      second call is the marker hit (nothing runs)
//   §4 a control: the same fresh root filesystem WITHOUT the saved packages cannot put anything back offline
//   §5 the image changed: a fresh root filesystem (network on) whose base the cache does not know → rung 2, ONLINE —
//      the machine's sources AND the local repository (capp-localonly exists nowhere else); the base re-taken from this
//      image. Control: a patched copy of the modules whose rung 2 lacks the local repository names capp-localonly failed
//   §6 verify-r1 F4 — THE MARKER MEANS "EVERY ENTRY IS BACK": (a) a replay that could not put one entry back (its .debs
//      gone from the cache, no network) is retried at the next boot, and the user's Put back (a replay request) puts it
//      back once the cache has it; (b) an install that ran on a fresh root filesystem BEFORE the boot replay does not mark
//      it replayed — the replay still puts every app back. CONTROL: a patched copy whose every run writes the marker
//      (the pre-fix finish()) answers "replayed" in both, the apps not there
//   §9 design 009 — an agent proposes an installer BY FILE: a real .deb read by dpkg-deb (its own desktop file + icon),
//      installed by apt through the slot; an AppImage unpacked in its own directory with the cwd elsewhere; removed by kind
//   §8 verify-r1 H1 — THE PIN: a signed https repository (fixture CA + OpenPGP key) serving a NEWER build of an
//      installed package (hello) and a package the user installs FROM it (capp-third): Refresh takes capp-third's update
//      (named from the source) and keeps Debian's hello; the pin file = the PURE sourcePin. CONTROL: no pin ⇒ hello upgraded
// Run: node scripts/test-app-install.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scratchDir } from './scratch.mjs';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = 'node:22-bookworm-slim';
const T0 = Date.now();
let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 2500) : ''}`); } };
const skip = (why) => { skipped++; console.log(`  ⊘ SKIP ${why}`); };
const finish = () => { console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${skipped ? `, ${skipped} skipped` : ''}) in ${Math.round((Date.now() - T0) / 1000)} s`); process.exit(fail ? 1 : 0); };

// ── the evidence: docker + the image, or a SKIP that names what is missing ──
const dk = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' });
if (dk.status !== 0) { skip(`docker is not usable here: ${(dk.error && dk.error.message) || (dk.stderr || '').trim().split('\n')[0]}`); finish(); }
const img = spawnSync('docker', ['image', 'inspect', IMAGE, '--format', '{{.Id}}'], { encoding: 'utf8' });
if (img.status !== 0) { skip(`the image ${IMAGE} is not on this machine (docker image inspect: ${(img.stderr || '').trim().split('\n')[0]}) — pull it, then run again`); finish(); }
console.log(`docker ${dk.stdout.trim()} · ${IMAGE} ${img.stdout.trim().slice(7, 19)}`);

const uid = process.getuid(), gid = process.getgid();
const home = scratchDir('app-install');
const share = path.join(home, '..', path.basename(home) + '-share'); fs.mkdirSync(share, { recursive: true });
fs.mkdirSync(path.join(home, '.vibespace'), { recursive: true });
const tag = `vs-capp-it-${process.pid}`;
let seq = 0;
const cleanup = () => {
  // root wrote ~/.vibespace/apps/{debs,sys} inside the scratch HOME: removed by root, in a container
  spawnSync('docker', ['run', '--rm', '-v', `${home}:/h`, '-v', `${share}:/s`, IMAGE, 'sh', '-c', 'rm -rf /h/.vibespace /h/.cache /s/*'], { stdio: 'ignore' });
  for (const d of [home, share]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(130));

/** ONE container: root prepares (sudo, the user), then `su` runs the driver as the user. `net` false = no network. */
function container({ net = true, prep = '', steps = [], timeoutMs = 15 * 60 * 1000, homeDir = home }) {
  const lines = [
    'set -e', 'export DEBIAN_FRONTEND=noninteractive LC_ALL=C',
    prep,
    // the image's own uid-1000 user (node) — or a new one — gets /home/u as its passwd home (the root script checks the
    // apps dir is the INVOKING user's own: SUDO_UID's home, never $HOME)
    `if getent passwd ${uid} >/dev/null; then usermod -d /home/u "$(getent passwd ${uid} | cut -d: -f1)"; else useradd -u ${uid} -M -d /home/u -s /bin/sh u; fi`,
    `U=$(getent passwd ${uid} | cut -d: -f1)`,
    'echo "$U ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/vs-test && chmod 0440 /etc/sudoers.d/vs-test',
    ...steps.map((s) => (s.root ? s.root : `su "$U" -s /bin/sh -c ${JSON.stringify(`cd /home/u && HOME=/home/u ${s.user}`)}`)),
  ].join('\n');
  const args = ['run', '--rm', '--name', `${tag}-${++seq}`, ...(net ? [] : ['--network', 'none']), '-v', `${repo}:/repo:ro`, '-v', `${homeDir}:/home/u`, '-v', `${share}:/share`, IMAGE, 'sh', '-c', lines];
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  const results = [];
  for (const l of String(r.stdout || '').split('\n')) if (l.startsWith('@@RESULT ')) { try { results.push(JSON.parse(l.slice(9))); } catch { results.push({ ok: false, error: 'unparseable' }); } }
  return { code: r.status, results, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}
const drv = (cmd, arg, step) => `node /repo/scripts/fixtures/app-install-driver.cjs ${cmd} '${JSON.stringify(arg || {})}' ${step || cmd}`;
/** the answers of one container BY STEP (a step that printed nothing is missing — never a neighbour's answer read in its place) */
const byStep = (c) => Object.fromEntries(c.results.map((r) => [r.step, r]));

// verify-r1 F1 CONTROL: a patched copy of the modules whose entry-id choice ignores ROOT's records (the index alone —
// the pre-fix rule): the steer step below must name the victim's id under it
const steerDir = path.join(share, 'steer-pre');
fs.cpSync(path.join(repo, 'src'), path.join(steerDir, 'src'), { recursive: true });
const steerFile = path.join(steerDir, 'src', 'app-serve.js');
const steerText = fs.readFileSync(steerFile, 'utf8');
const STEER_LINE = 'const rootE = await rootEntries();\n    const rootBy';
const SRC_CHECK = ' || (await rootSourceIds()).includes(src.id)';
// verify-r1 F7 CONTROL: the tripwire read from the apt hook's marker alone (the pre-fix rule)
const driftDir = path.join(share, 'drift-pre');
fs.cpSync(path.join(repo, 'src'), path.join(driftDir, 'src'), { recursive: true });
const driftFile = path.join(driftDir, 'src', 'app-serve.js');
const driftText = fs.readFileSync(driftFile, 'utf8');
const HOOK_ONLY = 'const touchedAt = hookAt == null && statusAt == null ? null : Math.max(hookAt || 0, statusAt || 0);';
fs.writeFileSync(driftFile, driftText.replace(HOOK_ONLY, 'const touchedAt = hookAt;'));
fs.writeFileSync(steerFile, steerText.replace(STEER_LINE, 'const rootE = [];\n    const rootBy').replace(SRC_CHECK, ''));
console.log('§1 the first machine (network): install, a .deb, the drift + Adopt, xterm\'s rows, a removal');
const SUDO_PREP = 'apt-get update -qq >/dev/null && apt-get install -y -qq sudo >/dev/null && cp /var/cache/apt/archives/sudo_*.deb /share/ 2>/dev/null || (cd /share && apt-get download -qq sudo)';
const c1 = container({
  prep: SUDO_PREP + ' && apt-mark hold sudo >/dev/null', // verify-r1 F5: an image package HELD (dpkg's "hi") — installed all the same
  steps: [
    { user: drv('plan', { request: { kind: 'apt', packages: ['hello'] } }, 'plan') },
    { user: drv('run', { request: { kind: 'apt', packages: ['hello'] } }, 'inst') },
    // verify-r1 F1: an agent edits the index so root's entry hello "is" sl — the plan of sl must not write under hello
    { user: drv('steer', { victim: 'hello', packages: ['sl'] }, 'steer') },
    { user: 'VS_REPO=/share/steer-pre ' + drv('steer', { victim: 'hello', packages: ['sl'] }, 'steerPre') },
    // …and a package source root already holds keeps its name, whatever the index says (an agent can delete the index's row)
    { root: "printf 'Types: deb\\nURIs: https://example.invalid/apt\\nSuites: stable\\nSigned-By: /etc/apt/keyrings/vibespace-vendor.asc\\n' > /home/u/.vibespace/apps/sys/sources/vendor.sources" },
    { user: drv('plan', { request: { kind: 'source', source: { id: 'vendor', uris: ['https://127.0.0.1:9/apt'], suites: ['stable'], components: ['main'], key: 'https://127.0.0.1:9/key.asc' } } }, 'srcTaken') },
    { user: 'VS_REPO=/share/steer-pre ' + drv('plan', { request: { kind: 'source', source: { id: 'vendor', uris: ['https://127.0.0.1:9/apt'], suites: ['stable'], components: ['main'], key: 'https://127.0.0.1:9/key.asc' } } }, 'srcTakenPre') },
    { root: 'rm -f /home/u/.vibespace/apps/sys/sources/vendor.sources' },
    { user: 'cd /tmp && apt-get download -qq sl >/dev/null 2>&1 && cp /tmp/sl_*.deb /tmp/sl.deb && ' + drv('run', { request: { kind: 'deb', debPath: '/tmp/sl.deb' } }, 'deb') }, // a .deb the user HAS (downloaded as the user, an ordinary file)
    // a package that exists in NO archive (built here, as the user): only the local repository can ever put it back
    { user: "mkdir -p /tmp/lo/DEBIAN /tmp/lo/usr/share/capp-localonly && echo here > /tmp/lo/usr/share/capp-localonly/marker && printf 'Package: capp-localonly\\nVersion: 1.0\\nArchitecture: all\\nMaintainer: Test <test@example.invalid>\\nDescription: a package in no archive\\n' > /tmp/lo/DEBIAN/control && dpkg-deb --root-owner-group -b /tmp/lo /tmp/localonly.deb >/dev/null && " + drv('run', { request: { kind: 'deb', debPath: '/tmp/localonly.deb' } }, 'local') },
    { root: 'sleep 2.5; apt-get install -y -qq cowsay >/dev/null' },
    // verify-r1 F6: a package installed outside VibeSpace from a .deb that exists in NO archive (root's own apt, a local file)
    { root: "mkdir -p /tmp/ns/DEBIAN && printf 'Package: capp-nosave\\nVersion: 1.0\\nArchitecture: all\\nMaintainer: Test <test@example.invalid>\\nDescription: in no archive, installed outside VibeSpace\\n' > /tmp/ns/DEBIAN/control && dpkg-deb --root-owner-group -b /tmp/ns /tmp/nosave.deb >/dev/null && apt-get install -y -qq /tmp/nosave.deb >/dev/null 2>&1" },
    { user: drv('status', null, 'drift') },
    { user: drv('run', { request: { kind: 'adopt', packages: ['cowsay'] } }, 'adopt') },
    { user: drv('run', { request: { kind: 'adopt', packages: ['capp-nosave'] } }, 'adoptNo') },
    { user: drv('status', null, 'stNo') },
    { user: drv('run', { request: { kind: 'remove', entryId: 'capp-nosave' } }, 'rmNo') },
    // verify-r1 F7: a plain `dpkg -i` (no apt — the DPkg::Post-Invoke hook never runs) right after a VibeSpace run (the removal above)
    { root: "sleep 2.5; mkdir -p /tmp/di/DEBIAN && printf 'Package: capp-dpkgi\\nVersion: 1.0\\nArchitecture: all\\nMaintainer: Test <test@example.invalid>\\nDescription: installed with dpkg -i\\n' > /tmp/di/DEBIAN/control && dpkg-deb --root-owner-group -b /tmp/di /tmp/dpkgi.deb >/dev/null && dpkg -i /tmp/dpkgi.deb >/dev/null" },
    { user: drv('status', null, 'driftDpkg') },
    { user: 'VS_REPO=/share/drift-pre ' + drv('status', null, 'driftDpkgPre') },
    { root: 'dpkg -r capp-dpkgi >/dev/null' },
    { user: drv('run', { request: { kind: 'apt', packages: ['xterm'] } }, 'xterm') },
    { user: drv('run', { request: { kind: 'remove', entryId: 'hello' } }, 'removed') },
    { user: drv('status', null, 'after') },
    { user: drv('run', { request: { kind: 'refresh' } }, 'refresh') },
    { user: drv('parity', null, 'parity') },
    // root refuses an apps dir that is not the INVOKING user's own (sudo names the user; a uid with another home — or none)
    { root: 'node -e "process.stdout.write(require(\'/repo/src/app-manifest.js\').APP_SCRIPT)" > /tmp/app.sh; SUDO_UID=4242 sh /tmp/app.sh /home/u/.vibespace/apps install hello abcdefgh9 -- hello > /tmp/foreign.out 2>&1 || true; node -e "process.stdout.write(\'@@RESULT \' + JSON.stringify({ step: \'foreign\', out: require(\'fs\').readFileSync(\'/tmp/foreign.out\', \'utf8\') }) + \'\\n\')"' },
    { root: 'command -v hello >/dev/null && echo "@@RESULT {\\"step\\":\\"helloAfter\\",\\"hello\\":true}" || echo "@@RESULT {\\"step\\":\\"helloAfter\\",\\"hello\\":false}"' },
  ],
});
const S1 = byStep(c1);
const need1 = ['plan', 'inst', 'steer', 'steerPre', 'srcTaken', 'srcTakenPre', 'deb', 'local', 'drift', 'adopt', 'adoptNo', 'stNo', 'rmNo', 'driftDpkg', 'driftDpkgPre', 'xterm', 'removed', 'after', 'refresh', 'parity', 'helloAfter', 'foreign'];
if (c1.error || need1.some((k) => !S1[k])) { ok(false, `the first container answered every step (exit ${c1.code}${c1.error ? `, ${c1.error.message}` : ''}; missing: ${need1.filter((k) => !S1[k]).join(' ')})`, (c1.stderr || '').slice(-3000) + '\n' + c1.stdout.slice(-3000)); finish(); }
const { plan, inst, deb, local, drift, adopt, xterm, removed, after, refresh, parity, helloAfter } = S1;
ok(plan.ok && plan.plan.ok && plan.plan.mode === 'install' && plan.plan.downloadBytes > 0 && plan.plan.argv && plan.plan.argv[0] === 'sudo', 'the plan, simulated as the user: ok, a real download size, the argv under sudo -n (the user is not root)', plan.plan && { code: plan.plan.code, error: plan.plan.error });
ok(inst.ok && inst.result.done && inst.result.entryId === 'hello' && /= run hello [0-9a-f]+ install/.test(inst.log) && /= ok/.test(inst.log), `install hello through the slot (sudo -n sh -c THE script): done in ${Math.round((inst.ms || 0) / 1000)} s`, inst.ok ? inst.log.slice(-1500) : inst);
ok(STEER_LINE && steerText.includes(STEER_LINE) && !fs.readFileSync(steerFile, 'utf8').includes(STEER_LINE), 'CONTROL (F1): the patched copy really ignores root\'s records in the entry-id choice');
ok(S1.steer.ok && S1.steer.entryId === 'sl' && S1.steer.argvId === 'sl', `verify-r1 F1: the index edited by an agent so root's entry hello claims sl — the plan of sl still writes under its OWN id (${S1.steer.entryId}), never over hello's root record`, S1.steer);
ok(S1.srcTaken.ok && S1.srcTaken.plan.ok === false && S1.srcTaken.plan.code === 'bad_source' && /already added/.test(S1.srcTaken.plan.error), 'verify-r1 F1: a package source ROOT holds (sys/sources/vendor.sources) is "already added" though the index does not list it — never re-added over root\'s files', S1.srcTaken);
ok(S1.srcTakenPre.ok && S1.srcTakenPre.plan.ok === false && !/already added/.test(S1.srcTakenPre.plan.error), 'CONTROL (F1): the index-only rule goes on to fetch the key — it would replace root\'s source', S1.srcTakenPre && S1.srcTakenPre.plan);
ok(S1.steerPre.ok && S1.steerPre.entryId === 'hello' && S1.steerPre.digest === S1.steer.digest, 'CONTROL (F1): the pre-fix rule (the index alone) names hello — root would replace hello\'s record with sl, and the digest the user approved is the same', S1.steerPre);
ok(deb.ok && deb.result.done && deb.result.kind === 'deb' && deb.result.entryId === 'sl' && /= run sl [0-9a-f]+ deb/.test(deb.log) && /= ok/.test(deb.log), `a .deb file the user had (sl): planned, approved, installed — copied into the repository (${Math.round((deb.ms || 0) / 1000)} s)`, deb.ok ? deb.log.slice(-2000) : deb);
ok(local.ok && local.result.done && local.result.entryId === 'capp-localonly' && /= ok/.test(local.log), 'a package built here, in NO archive (capp-localonly): installed from its .deb, kept in the repository', local.ok ? local.log.slice(-1500) : local);
ok(drift.ok && drift.status.drift.drift === true && drift.status.drift.added.some((x) => x.package === 'cowsay'), 'cowsay installed OUTSIDE VibeSpace (a plain sudo apt-get) — the tripwire says so: drift, cowsay among the added', drift.status && drift.status.drift);
ok(drift.ok && !drift.status.drift.added.some((x) => x.package === 'sudo'), 'verify-r1 F5: the HELD image package (sudo) is never "installed outside VibeSpace" — root\'s list and the reader agree it was there', drift.status && drift.status.drift.added.map((x) => x.package));
ok(driftText.includes(HOOK_ONLY) && !fs.readFileSync(driftFile, 'utf8').includes(HOOK_ONLY), 'CONTROL (F7): the patched copy reads the tripwire from the apt hook alone');
ok(S1.driftDpkg.ok && S1.driftDpkg.status.drift.drift === true && S1.driftDpkg.status.drift.added.some((x) => x.package === 'capp-dpkgi'), 'verify-r1 F7: a plain dpkg -i outside VibeSpace (the apt hook never ran) is "installed outside VibeSpace" too', S1.driftDpkg.status && S1.driftDpkg.status.drift);
ok(S1.driftDpkgPre.ok && !(S1.driftDpkgPre.status.drift.added || []).some((x) => x.package === 'capp-dpkgi'), 'CONTROL (F7): the hook-only tripwire never sees the dpkg -i install', S1.driftDpkgPre.status && S1.driftDpkgPre.status.drift);
const ent = (id) => ((S1.stNo.status && S1.stNo.status.entries) || []).find((e) => e.id === id) || {};
ok(S1.adoptNo.ok && S1.adoptNo.result.done && (S1.adoptNo.result.run.missing || []).some((x) => x.package === 'capp-nosave'), 'verify-r1 F6: Adopt of a package whose .deb is in no archive and no cache — the run NAMES it missing (the dialog says it will not come back)', S1.adoptNo.result && S1.adoptNo.result.run);
ok(S1.stNo.ok && JSON.stringify(ent('capp-nosave').uncached) === '["capp-nosave"]' && JSON.stringify(ent('cowsay').uncached) === '[]', 'verify-r1 F6: the status says it per entry — capp-nosave uncached (its row: "it will not come back after this machine is rebuilt"), cowsay kept', { nosave: ent('capp-nosave'), cowsay: ent('cowsay') });
ok(S1.rmNo.ok && S1.rmNo.result.done, 'the unsaved entry removed again (the rebuilt machine below replays the rest)', S1.rmNo.error);
ok(adopt.ok && adopt.result.done && adopt.result.entryId === 'cowsay', 'Adopt: cowsay is kept — its .deb saved, an entry recorded', adopt);
const xrows = (xterm.result && xterm.result.rows) || [];
ok(xterm.ok && xterm.result.done && xrows.some((r) => r.id === 'app.xterm' && r.label === 'XTerm') && xrows.some((r) => /^app\.xterm\./.test(r.id)), `xterm: its desktop files are catalog rows — the primary app.xterm (XTerm) + ${xrows.length - 1} more`, xrows);
ok(removed.ok && removed.result.done && removed.result.kind === 'remove', 'remove hello: done', removed.error);
const entries = (after.status && after.status.manifest.entries || []).map((e) => e.id).sort();
ok(after.ok && JSON.stringify(entries) === JSON.stringify(['capp-localonly', 'cowsay', 'sl', 'xterm']) && after.status.manifest.entries.find((e) => e.id === 'sl').kind === 'deb' && after.status.manifest.entries.find((e) => e.id === 'sl').deb.sha256.length === 64, 'the index: capp-localonly, cowsay, sl (kind deb, its sha256), xterm — hello gone', entries);
ok(helloAfter && helloAfter.hello === false, 'hello is really removed from the machine');
ok(refresh.ok && refresh.result.done && refresh.result.kind === 'refresh' && refresh.result.state && refresh.result.state.refreshedAt > 0, 'Refresh (the user\'s press — never automatic): `install --only-upgrade` through the slot; "last refreshed" stamped', refresh.ok ? refresh.result : refresh);

ok(after.status.rows.some((r) => r.id === 'app.xterm'), 'the catalog rows are read back from what ROOT recorded');

console.log('§2 the repository root wrote');
ok(parity.ok && (parity.rows || []).length >= 20 && parity.rows.every((r) => r.same), `every stanza root wrote is byte-identical to the PURE packagesStanza (${parity.rows.length} debs)`, parity.rows && parity.rows.filter((r) => !r.same));
ok(parity.rows.every((r) => r.nameOk && !/%/.test(r.f)), 'every cached file is named debFileName — no %3a (an epoch package among them)', parity.rows && parity.rows.filter((r) => !r.nameOk));
ok(parity.index === true, 'the Packages index = the PURE packagesIndex of the stanzas');
ok(parity.base && parity.base === parity.baseNode, 'the base sha root recorded = the PURE reader\'s over the same status file', { base: parity.base, node: parity.baseNode });
ok(/= run hello abcdefgh9 install\n= refused apps-dir-not-the-users/.test(S1.foreign.out) && !/= ok/.test(S1.foreign.out), 'root REFUSES an apps dir that is not the invoking user\'s own (SUDO_UID names another user): nothing is installed from someone else\'s cache', S1.foreign.out);
ok(parity.owners.debs.uid === 0 && parity.owners.debs.mode === '755' && parity.owners.sys.uid === 0 && parity.owners.entries.uid === 0 && parity.owners.manifest.uid === uid && parity.owners.manifest.mode === '600', 'debs/ and sys/ are root:root 0755 (what root reinstalls from); manifest.json is the user\'s, 0600 (written by VibeSpace, never by root)', parity.owners);

console.log('§3 THE REBUILT MACHINE — a fresh root filesystem, no network, the same home');
const sudoDeb = fs.readdirSync(share).find((f) => /^sudo_.*\.deb$/.test(f));
if (!sudoDeb) { ok(false, 'the sudo package was kept for the fresh container (the fleet image carries sudo)'); finish(); }
const NOSUDO_PREP = `dpkg -i /share/${sudoDeb} >/dev/null`;
const c2 = container({
  net: false, prep: NOSUDO_PREP,
  steps: [
    { root: 'r=; for b in xterm /usr/games/sl /usr/games/cowsay hello; do if command -v $b >/dev/null 2>&1; then r="$r ${b##*/}"; fi; done; if [ -f /usr/share/capp-localonly/marker ]; then r="$r capp-localonly"; fi; echo "@@RESULT {\\"step\\":\\"pre\\",\\"have\\":\\"$r\\"}"' },
    { user: drv('status', null, 'st2') },
    { user: drv('afterListen', null, 'rep1') },
    { user: drv('afterListen', null, 'rep2') },
    { root: 'r=; for b in xterm /usr/games/sl /usr/games/cowsay hello; do if command -v $b >/dev/null 2>&1; then r="$r ${b##*/}"; fi; done; if [ -f /usr/share/capp-localonly/marker ]; then r="$r capp-localonly"; fi; echo "@@RESULT {\\"step\\":\\"have\\",\\"have\\":\\"$r\\"}"' },
    { user: drv('status', null, 'st3') },
  ],
});
const S2 = byStep(c2);
const need2 = ['pre', 'st2', 'rep1', 'rep2', 'have', 'st3'];
if (c2.error || need2.some((k) => !S2[k])) { ok(false, `the fresh container answered every step (exit ${c2.code}; missing: ${need2.filter((k) => !S2[k]).join(' ')})`, (c2.stderr || '').slice(-3000) + '\n' + c2.stdout.slice(-3000)); finish(); }
const { pre, st2, rep1, rep2, have, st3 } = S2;
ok(pre.have.trim() === '', 'a FRESH root filesystem: none of the apps is there', pre);
ok(st2.ok && st2.status.replay.decision.run === true && st2.status.replay.decision.rung === 1 && st2.status.replay.decision.why === 'fresh-rootfs', 'its status: the replay marker is gone and the image is the one the cache knows → rung 1 (offline)', st2.status && st2.status.replay);
ok(rep1.ok && rep1.result.ran === true && rep1.result.failed.length === 0 && !rep1.result.error, `the boot replay put every entry back OFFLINE in ${((rep1.ms || 0) / 1000).toFixed(1)} s (no network in this container)`, rep1);
ok(have && /xterm/.test(have.have) && /\bsl\b/.test(have.have) && /cowsay/.test(have.have) && /capp-localonly/.test(have.have) && !/hello/.test(have.have), `xterm, sl, cowsay and the local-only package are back; hello (removed) is not: [${have && have.have.trim()}]`, have);
ok(rep2.ok && rep2.result.ran === false && rep2.result.why === 'replayed' && rep2.ms < 5000, `the next boot is the marker hit: nothing runs (${rep2.ms} ms in the driver, the status read included)`, rep2);
ok(st3.ok && st3.status.rows.some((r) => r.id === 'app.xterm'), 'the catalog row app.xterm is there again (a launchable app after the rebuild)');

console.log('§4 control: without the saved packages, nothing comes back offline');
const c3 = container({
  net: false, prep: NOSUDO_PREP,
  steps: [
    { root: 'mv /home/u/.vibespace/apps/debs /home/u/.vibespace/apps/debs.aside && install -d -m 0755 -o root -g root /home/u/.vibespace/apps/debs && : > /home/u/.vibespace/apps/debs/Packages' },
    { user: drv('afterListen', null, 'ctlRep') },
    { root: 'r=; for b in xterm /usr/games/sl; do command -v $b >/dev/null 2>&1 && r="$r ${b##*/}"; done; rm -rf /home/u/.vibespace/apps/debs && mv /home/u/.vibespace/apps/debs.aside /home/u/.vibespace/apps/debs; echo "@@RESULT {\\"step\\":\\"ctlHave\\",\\"have\\":\\"$r\\"}"' },
  ],
});
const { ctlRep, ctlHave } = byStep(c3);
ok(ctlRep && ctlRep.ok && ctlRep.result.ran === true && (ctlRep.result.failed.length >= 1 || ctlRep.result.error), 'CONTROL: an empty repository — the offline rung cannot put the entries back, rung 2 has no network: the run says so (failed entries / the error), never a quiet success', ctlRep);
ok(ctlHave && !/xterm|sl/.test(ctlHave.have), 'CONTROL: …and nothing is installed — §3\'s success was the saved packages, not a cached image', ctlHave);

console.log('§5 THE IMAGE CHANGED: a fresh root filesystem whose base the cache does not know → rung 2, online');
const c4 = container({
  prep: NOSUDO_PREP,
  steps: [
    // the stored identity of the image the cache was completed against is not this one (a new image) — kept aside, restored after
    { root: 'cp /home/u/.vibespace/apps/sys/base/sha /tmp/sha.keep && echo 0000000000000000000000000000000000000000000000000000000000000000 > /home/u/.vibespace/apps/sys/base/sha' },
    { user: drv('status', null, 'online0') },
    { user: drv('afterListen', null, 'online') },
    { root: 'r=; for b in xterm /usr/games/sl /usr/games/cowsay; do command -v $b >/dev/null 2>&1 && r="$r ${b##*/}"; done; if [ -f /usr/share/capp-localonly/marker ]; then r="$r capp-localonly"; fi; echo "@@RESULT {\\"step\\":\\"onHave\\",\\"have\\":\\"$r\\"}"' },
    { user: drv('parity', null, 'onParity') },
  ],
});
const { online0, online, onHave, onParity } = byStep(c4);
ok(online0 && online0.ok && online0.status.replay.decision.run && online0.status.replay.decision.rung === 2 && online0.status.replay.decision.why === 'base-changed', 'a fresh root filesystem whose image the cache does not know (the stored base sha differs) → rung 2 (online), never the offline rung', online0 && online0.status && online0.status.replay);
ok(online && online.ok && online.result.ran === true && online.result.failed.length === 0 && !online.result.error, `rung 2 put every entry back ONLINE (${(((online && online.ms) || 0) / 1000).toFixed(1)} s)`, online);
ok(onHave && /xterm/.test(onHave.have) && /\bsl\b/.test(onHave.have) && /cowsay/.test(onHave.have) && /capp-localonly/.test(onHave.have), `…xterm, sl, cowsay — and the package in NO archive (rung 2 carries the local repository too) — are there: [${onHave && onHave.have.trim()}]`, onHave);
ok(onParity && onParity.ok && onParity.base === onParity.baseNode && /^[0-9a-f]{64}$/.test(onParity.base) && !/^0+$/.test(onParity.base) && onParity.rows.every((r) => r.same), 'the base is RE-TAKEN from this image (the identity root records = the PURE reader\'s again) and the repository is still byte-consistent', onParity && { base: onParity.base, node: onParity.baseNode });

// CONTROL for §5: a patched copy of the modules whose rung 2 reads ONLY the machine's own sources (the line that adds the
// local repository removed) — the package in no archive cannot come back; §5's success was that line, not the archive
const preDir = path.join(share, 'pre');
fs.cpSync(path.join(repo, 'src'), path.join(preDir, 'src'), { recursive: true });
const pm = path.join(preDir, 'src', 'app-manifest.js');
const LOCAL_LINE = /^.*vibespace-local\.list.*\n/m;
const pmText = fs.readFileSync(pm, 'utf8');
fs.writeFileSync(pm, pmText.replace(LOCAL_LINE, ''));
ok(LOCAL_LINE.test(pmText) && !LOCAL_LINE.test(fs.readFileSync(pm, 'utf8')), 'CONTROL: the patched copy really lacks the local repository in rung 2 (the line was there, and is gone)');
const c5 = container({
  prep: NOSUDO_PREP,
  steps: [
    { root: 'echo 0000000000000000000000000000000000000000000000000000000000000000 > /home/u/.vibespace/apps/sys/base/sha' },
    { user: 'VS_REPO=/share/pre ' + drv('afterListen', null, 'preOnline') },
    { root: 'r=; for b in xterm /usr/games/sl; do command -v $b >/dev/null 2>&1 && r="$r ${b##*/}"; done; if [ -f /usr/share/capp-localonly/marker ]; then r="$r capp-localonly"; fi; echo "@@RESULT {\\"step\\":\\"preHave\\",\\"have\\":\\"$r\\"}"' },
  ],
});
const { preOnline, preHave } = byStep(c5);
ok(preOnline && preOnline.ok && preOnline.result.ran === true && preOnline.result.failed.some((f) => /capp-localonly/.test(JSON.stringify(f))), 'CONTROL: without the local repository in rung 2, the package in no archive is a FAILED entry, named', preOnline);
ok(preHave && /xterm/.test(preHave.have) && !/capp-localonly/.test(preHave.have), `CONTROL: …the archive's packages came back, the local-only one did not: [${preHave && preHave.have.trim()}]`, preHave);

console.log('§6 verify-r1 F4 — the replay marker means every entry is back');
// the pre-fix rule as a patched copy: every run's finish() writes the marker
const markDir = path.join(share, 'mark-pre');
fs.cpSync(path.join(repo, 'src'), path.join(markDir, 'src'), { recursive: true });
const mf = path.join(markDir, 'src', 'app-manifest.js');
const mText = fs.readFileSync(mf, 'utf8');
fs.writeFileSync(mf, mText.replace('touch "${SLOT_ENDED}"; }`,', 'touch "${SLOT_ENDED}"; [ -e "${REPLAY_MARKER}" ] || date +%s > "${REPLAY_MARKER}"; }`,'));
ok(fs.readFileSync(mf, 'utf8') !== mText, 'CONTROL (F4): the patched copy\'s finish() writes the marker on every run (the pre-fix rule)');
const HAVE6 = 'r=; for b in xterm /usr/games/sl /usr/games/cowsay /usr/bin/figlet; do command -v $b >/dev/null 2>&1 && r="$r ${b##*/}"; done; echo "@@RESULT {\\"step\\":\\"STEP\\",\\"have\\":\\"$r\\"}"';
const have6 = (step) => ({ root: HAVE6.replace('STEP', step) });
// the cache loses sl (as a fill that could not fetch it leaves it: no .deb, no stanza); restored after
const SL_ASIDE = 'D=/home/u/.vibespace/apps/debs; mkdir -p /share/sl-aside; mv $D/sl_* /share/sl-aside/; : > $D/Packages.tmp; for s in $D/*.stanza; do { cat $s; echo; } >> $D/Packages.tmp; done; mv $D/Packages.tmp $D/Packages';
const SL_BACK = 'D=/home/u/.vibespace/apps/debs; mv /share/sl-aside/sl_* $D/ && chown root:root $D/sl_*; : > $D/Packages.tmp; for s in $D/*.stanza; do { cat $s; echo; } >> $D/Packages.tmp; done; mv $D/Packages.tmp $D/Packages';
const c6 = container({
  net: false, prep: NOSUDO_PREP,
  steps: [
    { root: SL_ASIDE },
    { user: drv('afterListen', null, 'r6a') },
    { user: drv('afterListen', null, 'r6b') },
    { user: drv('status', null, 's6') },
    { root: SL_BACK },
    { user: drv('run', { request: { kind: 'replay' } }, 'r6c') }, // the user's Put back
    { user: drv('afterListen', null, 'r6d') },
    have6('h6'),
  ],
});
const S6 = byStep(c6);
ok(S6.r6a && S6.r6a.ok && S6.r6a.result.ran && S6.r6a.result.failed.includes('sl'), 'a fresh root filesystem, sl\'s .debs gone, no network: the boot replay names sl as not put back', S6.r6a);
ok(S6.r6b && S6.r6b.ok && S6.r6b.result.ran === true && S6.r6b.result.failed.includes('sl'), 'the NEXT boot (a server restart on the same root filesystem) tries again — a partial replay never marks it replayed', S6.r6b);
ok(S6.s6 && S6.s6.ok && S6.s6.status.replay.decision.run && (S6.s6.status.replay.missing || []).includes('sl') && !(S6.s6.status.replay.missing || []).includes('xterm'), 'its status names what is missing (sl — xterm is back): the dialog\'s Put back door', S6.s6 && S6.s6.status.replay);
ok(S6.r6c && S6.r6c.ok && S6.r6c.result.done && S6.r6c.result.kind === 'replay', 'the cache has sl again: the user\'s Put back (a replay request through the slot) is done', S6.r6c);
ok(S6.r6d && S6.r6d.ok && S6.r6d.result.ran === false && S6.r6d.result.why === 'replayed' && S6.h6 && /\bsl\b/.test(S6.h6.have) && /xterm/.test(S6.h6.have), `…and only now is the root filesystem marked replayed; sl and xterm are here: [${S6.h6 && S6.h6.have.trim()}]`, { r6d: S6.r6d, h6: S6.h6 });
const c6c = container({
  net: false, prep: NOSUDO_PREP,
  steps: [
    { root: SL_ASIDE },
    { user: 'VS_REPO=/share/mark-pre ' + drv('afterListen', null, 'p6a') },
    { user: 'VS_REPO=/share/mark-pre ' + drv('afterListen', null, 'p6b') },
    { root: SL_BACK },
  ],
});
const P6 = byStep(c6c);
ok(P6.p6a && P6.p6a.result && P6.p6a.result.failed.includes('sl') && P6.p6b && P6.p6b.result && P6.p6b.result.ran === false && P6.p6b.result.why === 'replayed', 'CONTROL (F4): under the pre-fix rule the partial replay marked the root filesystem replayed — the next boot never tried sl again', { p6a: P6.p6a && P6.p6a.result, p6b: P6.p6b && P6.p6b.result });
// (b) an install BEFORE the boot replay on a fresh root filesystem (network on: figlet comes from the archive)
const c7 = container({
  prep: NOSUDO_PREP,
  steps: [
    { user: drv('run', { request: { kind: 'apt', packages: ['figlet'] } }, 'i7') },
    { user: drv('status', null, 's7') },
    { user: drv('afterListen', null, 'r7') },
    have6('h7'),
  ],
});
const S7 = byStep(c7);
ok(S7.i7 && S7.i7.ok && S7.i7.result.done && S7.s7 && S7.s7.status.replay.decision.run === true && (S7.s7.status.replay.missing || []).includes('xterm'), 'a NEW app installed on a fresh root filesystem before the boot replay: the status still says the other apps must be put back (xterm among them)', S7.s7 && S7.s7.status.replay);
ok(S7.r7 && S7.r7.ok && S7.r7.result.ran === true && S7.h7 && /xterm/.test(S7.h7.have) && /\bsl\b/.test(S7.h7.have) && /figlet/.test(S7.h7.have), `…and the replay puts them back: [${S7.h7 && S7.h7.have.trim()}]`, { r7: S7.r7, h7: S7.h7 });
const c7c = container({
  prep: NOSUDO_PREP,
  steps: [
    { user: 'VS_REPO=/share/mark-pre ' + drv('run', { request: { kind: 'apt', packages: ['figlet'] } }, 'pi7') },
    { user: 'VS_REPO=/share/mark-pre ' + drv('afterListen', null, 'pr7') },
    have6('ph7'),
  ],
});
const P7 = byStep(c7c);
ok(P7.pr7 && P7.pr7.result && P7.pr7.result.ran === false && P7.pr7.result.why === 'replayed' && P7.ph7 && !/xterm/.test(P7.ph7.have), `CONTROL (F4): under the pre-fix rule the install marked the root filesystem replayed — the boot replay never ran, xterm is not here: [${P7.ph7 && P7.ph7.have.trim()}]`, { pr7: P7.pr7, ph7: P7.ph7 });

console.log('§8 verify-r1 H1 — an approved third-party source is PINNED: its newer build of an installed package never wins');
// a signed https repository (a fixture: our own CA + OpenPGP key, built in a throwaway container) serving a NEWER build
// of hello (2.10-99 — the machine has Debian's 2.10-3, an approved entry) and capp-third (1.0, later 1.1 — the package
// the user installs FROM it). With the pin, Refresh takes capp-third 1.1 and keeps hello; a later install of hello is
// nothing to do. CONTROL: a patched copy whose pins() writes nothing — the same steps upgrade hello to the source's build.
const FX = '/share/fx';
fs.mkdirSync(path.join(share, 'fx'), { recursive: true });
const fxBuild = container({
  prep: NOSUDO_PREP,
  steps: [{ root: [
    'apt-get update -qq >/dev/null && apt-get install -y -qq gnupg openssl >/dev/null',
    `F=${FX}; mkdir -p $F && cd $F`,
    'openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=vs-fx-ca -keyout ca.key -out ca.pem 2>/dev/null',
    'openssl req -newkey rsa:2048 -nodes -subj /CN=vs-fixture.test -keyout srv.key -out srv.csr 2>/dev/null',
    "printf 'subjectAltName=DNS:vs-fixture.test\\n' > ext && openssl x509 -req -in srv.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 2 -extfile ext -out srv.pem 2>/dev/null",
    'export GNUPGHOME=/tmp/g; mkdir -m 700 $GNUPGHOME',
    "gpg --batch --pinentry-mode loopback --passphrase '' --quick-gen-key 'VS Fixture <fx@example.invalid>' rsa2048 sign 1d 2>/dev/null",
    "mkdeb() { d=/tmp/b-$1-$2; mkdir -p $d/DEBIAN $d/usr/share/$1-fx; echo $2 > $d/usr/share/$1-fx/version; printf 'Package: %s\\nVersion: %s\\nArchitecture: all\\nMaintainer: VS Fixture <fx@example.invalid>\\nDescription: a fixture package\\n' $1 $2 > $d/DEBIAN/control; dpkg-deb --root-owner-group -b $d $F/$1_$2_all.deb >/dev/null; }",
    'mkdeb hello 2.10-99 && mkdeb capp-third 1.0 && mkdeb capp-third 1.1',
    'A0=$(dpkg --print-architecture)',
    "repo() { r=$F/$1; shift; mkdir -p $r/pool $r/dists/stable/main/binary-all $r/dists/stable/main/binary-$A0; : > $r/dists/stable/main/binary-$A0/Packages; P=$r/dists/stable/main/binary-all/Packages; : > $P; for deb in \"$@\"; do cp $F/$deb $r/pool/; { dpkg-deb -f $r/pool/$deb; printf 'Filename: pool/%s\\nSize: %s\\nSHA256: %s\\n\\n' $deb $(stat -c %s $r/pool/$deb) $(sha256sum $r/pool/$deb | cut -d' ' -f1); } >> $P; done; { printf 'Origin: Debian\\nLabel: Debian\\nSuite: stable\\nCodename: stable\\nArchitectures: all %s\\nComponents: main\\nDate: %s\\nSHA256:\\n' $A0 \"$(date -Ru)\"; for f in main/binary-all/Packages main/binary-$A0/Packages; do printf ' %s %s %s\\n' $(sha256sum $r/dists/stable/$f | cut -d' ' -f1) $(stat -c %s $r/dists/stable/$f) $f; done; } > $r/dists/stable/Release; gpg --batch --yes --clearsign -o $r/dists/stable/InRelease $r/dists/stable/Release 2>/dev/null; gpg --armor --export > $r/key.asc; }",
    'repo A hello_2.10-99_all.deb capp-third_1.0_all.deb && repo B hello_2.10-99_all.deb capp-third_1.1_all.deb',
    'chmod -R a+rX $F && echo "@@RESULT {\\"step\\":\\"fx\\",\\"ok\\":true}"',
  ].join(' && \\\n') }],
});
fs.writeFileSync(path.join(share, 'fx', 'srv.cjs'), [
  "const https = require('https'), fs = require('fs'), path = require('path');",
  "https.createServer({ key: fs.readFileSync('/share/fx/srv.key'), cert: fs.readFileSync('/share/fx/srv.pem') }, (q, s) => {",
  "  const f = path.join(fs.realpathSync('/share/fx/cur'), decodeURIComponent(q.url.split('?')[0]).replace(/^\\/repo\\//, '/'));",
  "  fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-length': b.length }); s.end(b); } });",
  "}).listen(Number(process.env.FX_PORT), '127.0.0.1', () => fs.writeFileSync(process.env.FX_UP, '1'));", // the CONTAINER's port + /tmp (its own netns / fs), set at its start below
].join('\n'));
if (!byStep(fxBuild).fx) {
  skip(`§8 the signed https repository fixture could not be built (no network for gnupg/openssl in the container?): ${(fxBuild.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
} else {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const home8 = scratchDir('app-install-h1');
  const FXSRC = { id: 'fx', uris: ['https://vs-fixture.test:8443/repo'], suites: ['stable'], components: ['main'], key: 'https://vs-fixture.test:8443/repo/key.asc' };
  const FX_PREP = `${NOSUDO_PREP} && echo '127.0.0.1 vs-fixture.test' >> /etc/hosts && install -m 0644 ${FX}/ca.pem /etc/apt/vsfx-ca.pem && printf 'Acquire::https::vs-fixture.test::CAInfo "/etc/apt/vsfx-ca.pem";\\n' > /etc/apt/apt.conf.d/50vsfx && ln -sfn ${FX}/A ${FX}/cur && (FX_PORT=8443 FX_UP=/tmp/fx-up node ${FX}/srv.cjs > /tmp/fx.log 2>&1 &) && for i in $(seq 100); do [ -f /tmp/fx-up ] && break; sleep 0.1; done`;
  const steps8 = (pre, t) => [
    { user: pre + drv('run', { request: { kind: 'apt', packages: ['hello'] } }, t + 'hello') },
    { user: 'NODE_EXTRA_CA_CERTS=/etc/apt/vsfx-ca.pem ' + pre + drv('run', { request: { kind: 'source', source: FXSRC } }, t + 'src') },
    { user: pre + drv('run', { request: { kind: 'apt', packages: ['capp-third'] } }, t + 'third') },
    { user: pre + drv('pin', { id: 'fx', expect: ['capp-third'], packages: ['hello', 'capp-third'] }, t + 'pin1') },
    { root: `ln -sfn ${FX}/B ${FX}/cur && apt-get update -qq >/dev/null 2>&1` }, // the source publishes capp-third 1.1; the machine's lists are fresh
    { user: pre + drv('plan', { request: { kind: 'refresh' } }, t + 'plan') },
    { user: pre + drv('run', { request: { kind: 'refresh' } }, t + 'refresh') },
    { user: pre + drv('plan', { request: { kind: 'apt', packages: ['hello'] } }, t + 'again') },
    { user: pre + drv('pin', { id: 'fx', expect: ['capp-third'], packages: ['hello', 'capp-third'] }, t + 'pin2') },
  ];
  const c8 = container({ homeDir: home8, prep: FX_PREP, steps: steps8('', 's8') });
  const S8 = byStep(c8);
  ok(S8.s8hello && S8.s8hello.ok && S8.s8src && S8.s8src.ok && S8.s8third && S8.s8third.ok, 'hello (Debian) installed, the signed https source approved, capp-third installed FROM it', { hello: S8.s8hello && (S8.s8hello.error || S8.s8hello.ok), src: S8.s8src && (S8.s8src.error || S8.s8src.slotLog || S8.s8src.ok), third: S8.s8third && (S8.s8third.error || S8.s8third.slotLog || S8.s8third.ok) });
  const p1 = S8.s8pin1;
  ok(p1 && p1.ok && p1.etc === p1.want && p1.sys === p1.want && p1.host === 'vs-fixture.test' && same(p1.pin, { packages: ['capp-third'] }), 'THE PIN as apt reads it (/etc/apt/preferences.d) and root\'s copy (sys/sources/fx.pref) = the PURE sourcePin: everything from vs-fixture.test at 1, capp-third (approved from it) at 500; the index records the allow-list', p1);
  ok(p1 && /2\.10-99 1\n\s+1 https:\/\/vs-fixture\.test:8443\/repo /.test(p1.policy) && /\*\*\* 1\.0 500\n\s+1 https:\/\/vs-fixture\.test:8443\/repo /.test(p1.policy), 'apt\'s own policy: the source\'s hello 2.10-99 at priority 1, capp-third (approved from it) at 500 — `Pin: origin` matched the bare host of an https://host:PORT source', p1 && p1.policy);
  const pl = S8.s8plan && S8.s8plan.plan;
  const ups = (pl && pl.updates) || [];
  ok(pl && ups.some((u) => u.package === 'capp-third' && u.to === '1.1' && u.origin === 'fx' && u.source === 'fx') && !ups.some((u) => u.package === 'hello'), 'the Refresh card: capp-third 1.0 → 1.1 named FROM fx; the source\'s newer hello is not an update at all', ups);
  const p2 = S8.s8pin2;
  ok(S8.s8refresh && S8.s8refresh.ok && p2 && p2.versions.hello === '2.10-3' && p2.versions['capp-third'] === '1.1', `after Refresh: hello stays Debian's 2.10-3, capp-third is 1.1 (got hello ${p2 && p2.versions.hello}, capp-third ${p2 && p2.versions['capp-third']})`, { refresh: S8.s8refresh && (S8.s8refresh.error || S8.s8refresh.ok), p2 });
  const again = S8.s8again && S8.s8again.plan;
  ok(again && again.ok && !(again.closure || []).some((c) => c.package === 'hello' && c.version === '2.10-99'), 'a later install of hello takes nothing from the source (its 2.10-99 never wins)', again && again.closure);
  // CONTROL: the same steps through a patched copy whose pins() writes nothing
  const nopinDir = path.join(share, 'nopin');
  fs.cpSync(path.join(repo, 'src'), path.join(nopinDir, 'src'), { recursive: true });
  const npf = path.join(nopinDir, 'src', 'app-manifest.js');
  const npText = fs.readFileSync(npf, 'utf8');
  fs.writeFileSync(npf, npText.replace("'pins() {',", "'pins() { return 0',"));
  ok(fs.readFileSync(npf, 'utf8') !== npText, 'CONTROL (no-pin): the patched copy\'s pins() writes nothing');
  const home8c = scratchDir('app-install-h1c');
  const c8c = container({ homeDir: home8c, prep: FX_PREP, steps: steps8('VS_REPO=/share/nopin ', 'c8') });
  const C8 = byStep(c8c);
  const cp2 = C8.c8pin2;
  ok(C8.c8third && C8.c8third.ok && cp2 && cp2.etc === null && cp2.versions.hello === '2.10-99', `CONTROL (no-pin): the same Refresh took the source's hello 2.10-99 over Debian's (got ${cp2 && cp2.versions.hello})`, { third: C8.c8third && (C8.c8third.error || C8.c8third.ok), cp2 });
  const cplan = C8.c8plan && C8.c8plan.plan;
  ok(cplan && ((cplan.updates || []).some((u) => u.package === 'hello' && u.to === '2.10-99' && u.origin === 'fx')), 'CONTROL (no-pin): …and its Refresh card listed hello → 2.10-99 from fx', cplan && cplan.updates);
  // verify r1 — a source on a host the machine's OWN apt sources use is refused (its pin would hold their updates at 1);
  // a source approved before .203 (no pin anywhere) is pinned BEFORE the first Refresh's apt runs. CONTROL: the pre-fix
  // order (a patched copy: no re-pin before the dispatch, the source live before its pin, no shared-host check)
  const preDir8 = path.join(share, 'pre-order');
  fs.cpSync(path.join(repo, 'src'), path.join(preDir8, 'src'), { recursive: true });
  const pof = path.join(preDir8, 'src', 'app-manifest.js');
  const poText = fs.readFileSync(pof, 'utf8');
  fs.writeFileSync(pof, poText.replace("  'pins',\n  'case $MODE in',", "  'case $MODE in',").replace('"$R/sources/$ID.sources"; pins; install', '"$R/sources/$ID.sources"; install').replace(/\n {2}'  h=\$\(printf[^\n]*shared-host[^\n]*/, ''));
  ok(!/shared-host/.test(fs.readFileSync(pof, 'utf8')) && /shared-host/.test(poText), 'CONTROL (pre-order): the patched copy has no shared-host check, no re-pin, the old source order');
  // the machine's own source: another path on the SAME host (one URI with two Signed-By would be apt's own refusal)
  const OWN_PREP = `${FX_PREP} && install -d -m 0755 /etc/apt/keyrings && install -m 0644 ${FX}/A/key.asc /etc/apt/keyrings/own.asc && ln -sfn . ${FX}/A/own && printf 'Types: deb\\nURIs: https://vs-fixture.test:8443/repo/own\\nSuites: stable\\nComponents: main\\nSigned-By: /etc/apt/keyrings/own.asc\\n' > /etc/apt/sources.list.d/own.sources`;
  const LEFT = { root: 'if [ -e /etc/apt/sources.list.d/vibespace-fx.sources ]; then l=yes; else l=no; fi; echo "@@RESULT {\\"step\\":\\"left\\",\\"live\\":\\"$l\\"}"' };
  const shared = (pre, homeDir) => byStep(container({ homeDir, prep: OWN_PREP, steps: [{ user: 'NODE_EXTRA_CA_CERTS=/etc/apt/vsfx-ca.pem ' + pre + drv('run', { request: { kind: 'source', source: FXSRC } }, 'shs') }, LEFT] }));
  const home8s = scratchDir('app-install-h1s'), home8sc = scratchDir('app-install-h1sc');
  const SH = shared('', home8s), SHC = shared('VS_REPO=/share/pre-order ', home8sc);
  ok(SH.shs && !SH.shs.ok && /shared-host vs-fixture\.test/.test(JSON.stringify(SH.shs)) && SH.left && SH.left.live === 'no', 'a source on the host of one of the machine\'s own sources is refused (shared-host) and nothing of it is live', { shs: SH.shs && (SH.shs.error || SH.shs.ok), left: SH.left });
  ok(SHC.shs && SHC.shs.ok && SHC.left && SHC.left.live === 'yes', 'CONTROL (pre-order): the same source was approved — its pin would hold the machine\'s own source at 1', { shs: SHC.shs && (SHC.shs.error || SHC.shs.ok), left: SHC.left });
  const HELLO = { root: 'echo "@@RESULT {\\"step\\":\\"hv\\",\\"hello\\":\\"$(dpkg-query -W -f=\'${Version}\' hello)\\"}"' };
  const legacy = (pre, homeDir) => byStep(container({ homeDir, prep: FX_PREP, steps: [
    { user: pre + drv('run', { request: { kind: 'apt', packages: ['hello'] } }, 'uh') },
    { user: 'NODE_EXTRA_CA_CERTS=/etc/apt/vsfx-ca.pem ' + pre + drv('run', { request: { kind: 'source', source: FXSRC } }, 'us') },
    { root: 'rm -f /etc/apt/preferences.d/vibespace-fx.pref /home/u/.vibespace/apps/sys/sources/fx.pref' }, // a machine whose source was approved before .203: no pin anywhere
    { user: pre + drv('run', { request: { kind: 'refresh' } }, 'ur') }, HELLO] }));
  const home8u = scratchDir('app-install-h1u'), home8uc = scratchDir('app-install-h1uc');
  const LG = legacy('', home8u), LGC = legacy('VS_REPO=/share/pre-order ', home8uc);
  ok(LG.us && LG.us.ok && LG.ur && LG.ur.ok && LG.hv && LG.hv.hello === '2.10-3', `a source approved before .203 (no pin): the first Refresh pins it BEFORE apt runs — hello stays Debian's 2.10-3 (got ${LG.hv && LG.hv.hello})`, { us: LG.us && (LG.us.error || LG.us.ok), ur: LG.ur && (LG.ur.error || LG.ur.ok) });
  ok(LGC.ur && LGC.ur.ok && LGC.hv && LGC.hv.hello === '2.10-99', `CONTROL (pre-order): the same first Refresh took the source's hello 2.10-99 (got ${LGC.hv && LGC.hv.hello})`, { ur: LGC.ur && (LGC.ur.error || LGC.ur.ok) });
  for (const h of [home8s, home8sc, home8u, home8uc]) spawnSync('docker', ['run', '--rm', '-v', `${h}:/h`, IMAGE, 'sh', '-c', 'rm -rf /h/.vibespace /h/.cache'], { stdio: 'ignore' });
  for (const h of [home8, home8c]) spawnSync('docker', ['run', '--rm', '-v', `${h}:/h`, IMAGE, 'sh', '-c', 'rm -rf /h/.vibespace /h/.cache'], { stdio: 'ignore' });
}
console.log('§9 design 009 — an agent PROPOSES an installer by file: a real .deb (dpkg-deb reads its own desktop file + icon, apt-get installs ./file.deb through the slot) and an AppImage unpacked in its own directory with the cwd elsewhere');
{
  const home9 = scratchDir('app-install-d9');
  const A9 = 'mkdir -p /tmp/cc/DEBIAN /tmp/cc/usr/share/applications /tmp/cc/usr/share/icons/hicolor/48x48/apps /tmp/cc/usr/bin'
    + " && printf 'Package: capp-vendor\\nVersion: 1.0\\nArchitecture: all\\nMaintainer: Test <test@example.invalid>\\nDescription: a vendor-style package with a desktop file\\n' > /tmp/cc/DEBIAN/control"
    + " && printf '[Desktop Entry]\\nType=Application\\nName=Capp Chat\\nName[zh_CN]=卡普聊天\\nName[ja]=カップチャット\\nExec=/usr/bin/capp-chat\\nIcon=capp-chat\\n' > /tmp/cc/usr/share/applications/capp-vendor.desktop"
    + " && printf '\\211PNG\\r\\n\\032\\n0000IHDR' > /tmp/cc/usr/share/icons/hicolor/48x48/apps/capp-chat.png && printf '#!/bin/sh\\necho capp\\n' > /tmp/cc/usr/bin/capp-chat && chmod 755 /tmp/cc/usr/bin/capp-chat"
    + ' && dpkg-deb --root-owner-group --build /tmp/cc /tmp/capp-vendor_1.0_all.deb >/dev/null';
  const STG = '/home/u/.vibespace/apps/staging', AIM = '/home/u/.vibespace/apps/appimage/capp-chat';
  const c9 = container({ homeDir: home9, prep: SUDO_PREP, steps: [
    { user: A9 },
    { user: drv('propose', { request: { kind: 'installer', file: '/tmp/capp-vendor_1.0_all.deb' } }, 'propDeb') },
    { user: drv('exec', { argv: ['stat', '-c', '%s', '/tmp/capp-vendor_1.0_all.deb'] }, 'sizeDeb') },
    { user: drv('ls', { dirs: [STG] }, 'stgDeb') },
    { user: drv('runp', {}, 'runDeb') },
    { user: drv('status', {}, 'stDeb') },
    { user: drv('exec', { argv: ['dpkg', '-s', 'capp-vendor'] }, 'dpkgDeb') },
    { user: 'mkdir -p /tmp/elsewhere && cd /tmp/elsewhere && ' + drv('propose', { request: { kind: 'installer', file: '/repo/scripts/fixtures/apps-installers/capp-chat.AppImage' } }, 'propAI') },
    { user: 'cd /tmp/elsewhere && ' + drv('runp', {}, 'runAI') },
    { user: drv('ls', { dirs: ['/tmp/elsewhere', STG, AIM, AIM + '/root'] }, 'lsAI') },
    { user: drv('exec', { argv: [AIM + '/root/AppRun'] }, 'execAI') },
    { user: drv('propose', { request: { kind: 'remove', entryId: 'capp-chat' } }, 'propRm') },
    { user: drv('runp', {}, 'runRm') },
    { user: drv('ls', { dirs: [AIM, '/home/u/.vibespace/apps'] }, 'lsRm') },
  ] });
  const R9 = byStep(c9);
  const pd = R9.propDeb && R9.propDeb.proposal;
  ok(pd && pd.kind === 'deb' && pd.app.name === 'Capp Chat' && pd.app.labels && pd.app.labels.zh === '卡普聊天' && /\/icon$/.test(pd.app.icon || '') && pd.details.packages.includes('capp-vendor') && R9.stgDeb && R9.stgDeb.ls[STG].some((n) => n.endsWith('.deb')), 'a REAL .deb proposed by file: dpkg-deb lists it, its own desktop file (Name + Name[zh_CN]) and icon are read out WITHOUT installing it; the copy sits in staging', { pd, stg: R9.stgDeb });
  ok(pd && R9.sizeDeb && pd.bytes.download === Number(R9.sizeDeb.out), 'apps-joint r1 F5: the card\'s download size of a .deb with nothing else to fetch = its file (apt\'s --print-uris lists the local file; never counted twice)', { bytes: pd && pd.bytes, size: R9.sizeDeb && R9.sizeDeb.out });
  const st = R9.stDeb && R9.stDeb.status;
  const ent = st && st.manifest.entries.find((e) => e.kind === 'deb');
  ok(R9.runDeb && R9.runDeb.ok && R9.runDeb.result.done && R9.dpkgDeb && /Status: install ok installed/.test(R9.dpkgDeb.out) && ent && ent.deb.package === 'capp-vendor' && st.rows.some((r) => r.app === ent.id && r.labels && r.labels.zh === '卡普聊天'), 'the click: apt-get installs ./the staged .deb through the ONE slot (root checks the sha256), the row carries the localized label', { run: R9.runDeb && (R9.runDeb.error || R9.runDeb.log), ent, rows: st && st.rows });
  const ls = R9.lsAI && R9.lsAI.ls;
  ok(R9.propAI && R9.propAI.proposal && R9.propAI.proposal.kind === 'appimage' && R9.runAI && R9.runAI.ok && R9.runAI.cwd === '/tmp/elsewhere' && ls && ls['/tmp/elsewhere'].length === 0 && ls[STG].length === 0 && (ls[AIM + '/root'] || []).includes('AppRun') && !(ls[AIM] || ['x.AppImage']).some((n) => /AppImage$/.test(n)) && /capp-chat runs from/.test(R9.execAI && R9.execAI.out), 'an AppImage (the W4 control): unpacked into appimage/<id>/root with the cwd ELSEWHERE (it stays empty), the AppImage file and every staged file gone, its AppRun runs', { prop: R9.propAI, run: R9.runAI && (R9.runAI.error || R9.runAI.log), ls, exec: R9.execAI });
  ok(R9.runRm && R9.runRm.ok && R9.lsRm && R9.lsRm.ls[AIM] === null && Array.isArray(R9.lsRm.ls['/home/u/.vibespace/apps']), 'Remove… of an AppImage: exactly its directory goes (no root), the apps directory stays', { rm: R9.runRm, ls: R9.lsRm });
  spawnSync('docker', ['run', '--rm', '-v', `${home9}:/h`, IMAGE, 'sh', '-c', 'rm -rf /h/.vibespace /h/.cache'], { stdio: 'ignore' });
}
finish();
