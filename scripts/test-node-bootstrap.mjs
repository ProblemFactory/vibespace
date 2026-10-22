#!/usr/bin/env node
// Node-free pairing: the installer's node RESOLUTION + PROVISIONING contract
// (2.246.0). Hermetic — a local HTTP fixture stands in for nodejs.org/dist, so
// this never touches the network, never writes to the real ~/.vibespace, and
// never starts a daemon (every case runs the installer with --node-only, which
// resolves/provisions node, prints it and exits).
//
// The machine running the tests almost certainly HAS node (we're running in
// it), and find_node also probes ABSOLUTE paths (/usr/bin/node …) that no PATH
// scrubbing can hide — so the provisioning cases run under `bwrap`, masking
// those paths with a non-executable file. No bwrap + a system node present ⇒
// those cases SKIP loudly (never a silent pass).
// ⑨ THE PIN MOVED (lane device-node-version — the Node.js security releases of 2026-10-21): the default pin of BOTH
// installers is v22.23.4 and never below the hub's floor for its line (src/device-runtime.js NODE_FLOORS); an install
// whose OWN node ($ROOT/node) is older than the pin gets the pinned one in its place (verified, no leftovers), a second
// run downloads nothing, an older pin never downgrades it, a failed download keeps it, and a node the machine HAD (on
// PATH, or --node) is never touched. RED CONTROL = the 2.369.340 installer: the pin moved and its own node stayed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLER = path.join(REPO, 'scripts', 'vibespace-agentd-install.sh');
const NODE_VERSION = 'v22.22.0';
const NEW_VERSION = 'v22.23.4';   // ⑨: the pin after the 2026-10-21 security releases
const NOS = process.platform === 'darwin' ? 'darwin' : 'linux';
const NARCH = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : process.arch;
const TARN = `node-${NODE_VERSION}-${NOS}-${NARCH}.tar.gz`;

let fails = 0, skips = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const skip = (name, why) => { skips++; console.log(`  ⊘ SKIP ${name} — ${why}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-nodeboot-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

// ── fixture: a fake node tarball with the real archive layout ────────────────
// bin/node is a shell stub answering exactly the three probes the installer
// makes: the major-version -e, the smoke-run -e, and -v.
const stubOf = (v) => `#!/bin/sh
if [ "$1" = "-v" ]; then echo "${v}"; exit 0; fi
if [ "$1" = "-e" ]; then
  case "$2" in *versions.node*) printf '22';; esac
  exit 0
fi
exit 0
`;
const NODE_STUB = stubOf(NODE_VERSION);
const stage = path.join(tmp, 'stage');
// one stub tarball per version the fixture mirror serves (⑨: the old pin and the new one)
const BALLS = {};
for (const v of [NODE_VERSION, NEW_VERSION]) {
  const inner = `node-${v}-${NOS}-${NARCH}`, name = `${inner}.tar.gz`;
  fs.mkdirSync(path.join(stage, inner, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(stage, inner, 'bin', 'node'), stubOf(v), { mode: 0o755 });
  execFileSync('tar', ['-czf', path.join(tmp, name), '-C', stage, inner]);
  const body = fs.readFileSync(path.join(tmp, name));
  BALLS[v] = { name, body, sha: crypto.createHash('sha256').update(body).digest('hex') };
}
const TARBALL = BALLS[NODE_VERSION].body;

// a standalone node stub for the --node override case
const overrideNode = path.join(tmp, 'my-node');
fs.writeFileSync(overrideNode, NODE_STUB, { mode: 0o755 });

// ── fixture server ──────────────────────────────────────────────────────────
let hits = { tar: 0, sha: 0, byVersion: {} };
let mode = 'ok'; // ok | tamper | nosum
const srv = http.createServer((req, res) => {
  const p = req.url || '';
  const ver = Object.keys(BALLS).find((v) => p.startsWith(`/${v}/`));
  const ball = ver ? BALLS[ver] : null;
  if (ball && p.endsWith(`/${ball.name}`)) {
    hits.tar++; hits.byVersion[ver] = (hits.byVersion[ver] || 0) + 1;
    const body = mode === 'tamper' ? Buffer.concat([ball.body, Buffer.from('x')]) : ball.body;
    res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(body);
  }
  if (ball && p.endsWith('/SHASUMS256.txt')) {
    hits.sha++;
    const body = mode === 'nosum'
      ? `${'0'.repeat(64)}  node-${ver}-somethingelse.tar.gz\n`
      : `${ball.sha}  ${ball.name}\n`;
    res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(body);
  }
  res.writeHead(404); res.end('nope');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const MIRROR = `http://127.0.0.1:${srv.address().port}`;

// ── sandbox plumbing ────────────────────────────────────────────────────────
const ABS_CANDIDATES = ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node', '/snap/bin/node'];
const present = ABS_CANDIDATES.filter((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } });
const hasBwrap = spawnSync('bwrap', ['--version'], { encoding: 'utf8' }).status === 0;
const maskFile = path.join(tmp, 'mask');
fs.writeFileSync(maskFile, '', { mode: 0o644 });

// Run the installer. `mask:true` hides every absolute node candidate.
// ASYNC on purpose: the fixture HTTP server lives in THIS process, so a
// spawnSync would block the event loop and the installer's curl would hang
// forever waiting for a reply that can't be written (cost one debug cycle).
function run(args, env, { mask = true, installer = INSTALLER } = {}) {
  const full = { PATH: '/usr/bin:/bin', ...env };
  let cmd = '/bin/bash', argv = [installer, ...args];
  if (mask && present.length) {
    argv = ['--dev-bind', '/', '/'];
    for (const p of present) argv.push('--bind', maskFile, p);
    argv.push('/bin/bash', installer, ...args);
    cmd = 'bwrap';
  }
  return new Promise((resolve) => {
    const ch = spawn(cmd, argv, { env: full });
    let stdout = '', stderr = '';
    const t = setTimeout(() => ch.kill('SIGKILL'), 120000);
    ch.stdout.on('data', (d) => { stdout += d; });
    ch.stderr.on('data', (d) => { stderr += d; });
    ch.on('close', (status) => { clearTimeout(t); resolve({ status, stdout, stderr }); });
  });
}
const canMask = !present.length || hasBwrap;
const freshHome = (name) => { const h = path.join(tmp, name); fs.mkdirSync(h, { recursive: true }); return h; };
const baseEnv = (home, root) => ({
  HOME: home, VIBESPACE_DEVICE_ROOT: root,
  VIBESPACE_NODE_MIRROR: MIRROR, VIBESPACE_NODE_VERSION: NODE_VERSION,
});

console.log(`node-bootstrap: fixture ${MIRROR} · ${TARN} · absolute node candidates present: ${present.join(', ') || '(none)'}`);

// ── 1. provisions a private node when the machine has NONE ──────────────────
if (!canMask) skip('provisioning cases', 'this machine has a system node and bwrap is unavailable');
else {
  const home = freshHome('h1'), root = path.join(home, 'root');
  const r = await run(['--node-only'], baseEnv(home, root));
  const priv = path.join(root, 'node', 'bin', 'node');
  check('provisions a private node with no node on the machine', r.status === 0 && fs.existsSync(priv),
    `exit=${r.status} ${(r.stderr || '').trim().slice(-200)}`);
  check('reports the private node path', (r.stdout || '').includes(priv), (r.stdout || '').trim().slice(-160));
  check('checksum was verified', (r.stdout || '').includes('checksum verified'));
  check('breadcrumb state/node-path points at it',
    fs.existsSync(path.join(root, 'state', 'node-path')) &&
    fs.readFileSync(path.join(root, 'state', 'node-path'), 'utf8') === priv);
  check('no download leftovers', fs.readdirSync(root).filter((f) => f.startsWith('.node-dl')).length === 0,
    fs.readdirSync(root).join(','));

  // ── 2. second run re-uses it (no re-download) ─────────────────────────────
  const before = { ...hits };
  const r2 = await run(['--node-only'], baseEnv(home, root));
  check('second run re-uses the private node without re-downloading',
    r2.status === 0 && hits.tar === before.tar, `exit=${r2.status} tarHits ${before.tar}→${hits.tar}`);

  // ── 3. tampered tarball is REFUSED ────────────────────────────────────────
  mode = 'tamper';
  const home3 = freshHome('h3'), root3 = path.join(home3, 'root');
  const r3 = await run(['--node-only'], baseEnv(home3, root3));
  check('tampered tarball ⇒ non-zero exit', r3.status !== 0, `exit=${r3.status}`);
  check('tampered tarball ⇒ says checksum mismatch', /checksum mismatch/.test(r3.stdout || ''),
    (r3.stdout || '').trim().slice(-160));
  check('tampered tarball ⇒ no $ROOT/node committed', !fs.existsSync(path.join(root3, 'node')));
  check('tampered tarball ⇒ no .node-dl leftovers',
    fs.existsSync(root3) && fs.readdirSync(root3).filter((f) => f.startsWith('.node-dl')).length === 0);

  // ── 4. tarball missing from SHASUMS256.txt is REFUSED ─────────────────────
  mode = 'nosum';
  const home4 = freshHome('h4'), root4 = path.join(home4, 'root');
  const r4 = await run(['--node-only'], baseEnv(home4, root4));
  check('unlisted tarball ⇒ non-zero exit', r4.status !== 0, `exit=${r4.status}`);
  check('unlisted tarball ⇒ names SHASUMS256.txt', /SHASUMS256\.txt/.test(r4.stdout || ''),
    (r4.stdout || '').trim().slice(-160));
  check('unlisted tarball ⇒ no $ROOT/node committed', !fs.existsSync(path.join(root4, 'node')));
  mode = 'ok';

  // ── 5. nvm-shaped node is found when PATH has none ────────────────────────
  // curl|bash is NON-login: ~/.bashrc / nvm.sh are never sourced, so the nvm
  // node is invisible to PATH — the most common "no node" false report.
  const home5 = freshHome('h5'), root5 = path.join(home5, 'root');
  const nvmBin = path.join(home5, '.nvm', 'versions', 'node', 'v22.0.0', 'bin');
  fs.mkdirSync(nvmBin, { recursive: true });
  fs.writeFileSync(path.join(nvmBin, 'node'), NODE_STUB, { mode: 0o755 });
  const before5 = hits.tar;
  const r5 = await run(['--node-only'], baseEnv(home5, root5));
  check('nvm node found with a PATH that has none',
    r5.status === 0 && (r5.stdout || '').includes(path.join(nvmBin, 'node')), (r5.stdout || '').trim().slice(-160));
  check('nvm node ⇒ nothing downloaded', hits.tar === before5, `tarHits ${before5}→${hits.tar}`);

  // ── 6. newest nvm version wins ────────────────────────────────────────────
  const olderBin = path.join(home5, '.nvm', 'versions', 'node', 'v9.9.9', 'bin');
  fs.mkdirSync(olderBin, { recursive: true });
  fs.writeFileSync(path.join(olderBin, 'node'), NODE_STUB, { mode: 0o755 });
  const r6 = await run(['--node-only'], baseEnv(home5, path.join(home5, 'root6')));
  check('newest nvm version wins (v22 over v9, not lexicographic)',
    (r6.stdout || '').includes(path.join(nvmBin, 'node')), (r6.stdout || '').trim().slice(-160));
}

// ── 7. --node override short-circuits discovery ──────────────────────────────
{
  const home = freshHome('h7'), root = path.join(home, 'root');
  const before = hits.tar;
  const r = await run(['--node-only', '--node', overrideNode], baseEnv(home, root), { mask: canMask });
  check('--node override is used verbatim', r.status === 0 && (r.stdout || '').includes(overrideNode),
    `exit=${r.status} ${(r.stdout || '').trim().slice(-160)}`);
  check('--node override ⇒ nothing downloaded', hits.tar === before);
}

// ── 8. an unusable --node is rejected (not silently ignored) ─────────────────
if (!canMask) skip('unusable --node rejection', 'needs a node-free sandbox');
else {
  const home = freshHome('h8'), root = path.join(home, 'root');
  const bogus = path.join(tmp, 'not-node');
  fs.writeFileSync(bogus, '#!/bin/sh\nexit 3\n', { mode: 0o755 });
  const before = hits.tar;
  const r = await run(['--node-only', '--node', bogus], baseEnv(home, root));
  // falls through to provisioning rather than trusting a broken binary
  check('a non-working --node falls back to provisioning',
    r.status === 0 && fs.existsSync(path.join(root, 'node', 'bin', 'node')) && hits.tar === before + 1,
    `exit=${r.status} tarHits ${before}→${hits.tar}`);
}

// ── 9. THE PIN MOVED (lane device-node-version) ─────────────────────────────
{
  const sh = fs.readFileSync(INSTALLER, 'utf8'), ps1 = fs.readFileSync(path.join(REPO, 'scripts', 'vibespace-agentd-install.ps1'), 'utf8');
  const pinSh = (sh.match(/^NODE_VERSION="\$\{VIBESPACE_NODE_VERSION:-(v[\d.]+)\}"/m) || [])[1];
  const pinPs = (ps1.match(/^\$NodeVersion = if \(\$env:VIBESPACE_NODE_VERSION\) \{ \$env:VIBESPACE_NODE_VERSION \} else \{ '(v[\d.]+)' \}/m) || [])[1];
  const DR = (await import('../src/device-runtime.js')).default;
  const pinV = DR.runtimeVerdict({ node: pinSh || null, own: true });
  check(`⑨ both installers pin ${NEW_VERSION} (sh ${pinSh}, ps1 ${pinPs}) and the pin is at or above the hub's floor for its line (${pinV.floor})`,
    pinSh === NEW_VERSION && pinPs === NEW_VERSION && pinV.state === 'ok', JSON.stringify(pinV));
  check('⑨ both comments name the advisory (the Node.js security releases of 2026-10-21)',
    /security releases of 2026-10-21/.test(sh.slice(0, sh.indexOf('NODE_VERSION="'))) && /security releases of 2026-10-21/.test(ps1.slice(0, ps1.indexOf('$NodeVersion = '))));
}
if (!canMask) skip('⑨ the pin-moved cases', 'needs a node-free sandbox');
else {
  const home = freshHome('h9'), root = path.join(home, 'root');
  const priv = path.join(root, 'node', 'bin', 'node');
  const vOf = (p) => { try { return execFileSync(p, ['-v'], { encoding: 'utf8' }).trim(); } catch { return null; } };
  const env9 = (v) => ({ ...baseEnv(home, root), VIBESPACE_NODE_VERSION: v });
  const r0 = await run(['--node-only'], env9(NODE_VERSION));
  check('⑨ the install provisioned its own node at the OLD pin', r0.status === 0 && vOf(priv) === NODE_VERSION, `exit=${r0.status} v=${vOf(priv)}`);
  const n1 = hits.byVersion[NEW_VERSION] || 0;
  const r1 = await run(['--node-only'], env9(NEW_VERSION));
  check(`⑨ the pin moved ⇒ its OWN node is replaced by ${NEW_VERSION} (downloaded once, checksum verified, said)`,
    r1.status === 0 && vOf(priv) === NEW_VERSION && (hits.byVersion[NEW_VERSION] || 0) === n1 + 1 && (r1.stdout || '').includes(`this install's own Node ${NODE_VERSION} is older than the pinned ${NEW_VERSION} — replacing it`) && (r1.stdout || '').includes('checksum verified'),
    `exit=${r1.status} v=${vOf(priv)} ${(r1.stdout || '').trim().slice(-300)}`);
  check('⑨ …the agent runs it (the breadcrumb + the resolved path), no .node-dl / node.old left behind',
    (r1.stdout || '').includes(`→ node: ${priv} (${NEW_VERSION})`) && fs.readFileSync(path.join(root, 'state', 'node-path'), 'utf8') === priv
    && !fs.readdirSync(root).some((f) => f.startsWith('.node-dl') || f === 'node.old'), fs.readdirSync(root).join(','));
  const t2 = hits.tar;
  const r2 = await run(['--node-only'], env9(NEW_VERSION));
  check('⑨ a second run at the same pin downloads nothing', r2.status === 0 && hits.tar === t2 && !/replacing it/.test(r2.stdout || ''), `tarHits ${t2}→${hits.tar}`);
  const r3 = await run(['--node-only'], env9(NODE_VERSION));
  check('⑨ an OLDER pin never downgrades its own node', r3.status === 0 && hits.tar === t2 && vOf(priv) === NEW_VERSION, `v=${vOf(priv)} tarHits ${t2}→${hits.tar}`);
  const r4 = await run(['--node-only'], env9('v22.99.0'));   // the fixture mirror has no such build: the download fails
  check('⑨ the pin moved but the download fails ⇒ it keeps the node it had, says so, and goes on (exit 0)',
    r4.status === 0 && vOf(priv) === NEW_VERSION && (r4.stdout || '').includes(`keeping ${NEW_VERSION} for now`), `exit=${r4.status} ${(r4.stdout || '').trim().slice(-240)}`);

  // a node the machine HAD: on PATH (no own node in this root) and a --node — older than the pin, never touched
  const homeS = freshHome('h9s'), rootS = path.join(homeS, 'root');
  const sysBin = path.join(homeS, 'sysbin'); fs.mkdirSync(sysBin, { recursive: true });
  const sysNode = path.join(sysBin, 'node'); fs.writeFileSync(sysNode, stubOf('v22.10.0'), { mode: 0o755 });
  const sysBytes = fs.readFileSync(sysNode, 'utf8'), t5 = hits.tar;
  const r5 = await run(['--node-only'], { ...baseEnv(homeS, rootS), VIBESPACE_NODE_VERSION: NEW_VERSION, PATH: `${sysBin}:/usr/bin:/bin` });
  check('⑨ a system node older than the pin (on PATH) is USED and never touched — nothing downloaded, no own node made',
    r5.status === 0 && (r5.stdout || '').includes(`→ node: ${sysNode} (v22.10.0)`) && hits.tar === t5 && fs.readFileSync(sysNode, 'utf8') === sysBytes && !fs.existsSync(path.join(rootS, 'node')),
    `exit=${r5.status} ${(r5.stdout || '').trim().slice(-200)}`);
  const r6 = await run(['--node-only', '--node', sysNode], { ...baseEnv(home, root), VIBESPACE_NODE_VERSION: 'v22.30.0' });
  check('⑨ a --node older than the pin, beside an own node older than the pin: the --node is used, nothing downloaded or replaced',
    r6.status === 0 && (r6.stdout || '').includes(`→ node: ${sysNode} (v22.10.0)`) && hits.tar === t5 && vOf(priv) === NEW_VERSION && fs.readFileSync(sysNode, 'utf8') === sysBytes,
    `exit=${r6.status} ${(r6.stdout || '').trim().slice(-200)}`);

  // RED CONTROL: the 2.369.340 installer (git show 72056f53), the same root at the old pin, the pin moved
  const baseSh = path.join(tmp, 'install-340.sh');
  let baseOk = false;
  try { fs.writeFileSync(baseSh, execFileSync('git', ['show', '72056f53:scripts/vibespace-agentd-install.sh'], { cwd: REPO, encoding: 'utf8' })); baseOk = true; } catch {}
  if (!baseOk) skip('⑨ RED CONTROL', 'the 2.369.340 installer is not in this clone (git show 72056f53)');
  else {
    const homeR = freshHome('h9r'), rootR = path.join(homeR, 'root'), privR = path.join(rootR, 'node', 'bin', 'node');
    await run(['--node-only'], { ...baseEnv(homeR, rootR), VIBESPACE_NODE_VERSION: NODE_VERSION }, { installer: baseSh });
    const tR = hits.tar;
    const rR = await run(['--node-only'], { ...baseEnv(homeR, rootR), VIBESPACE_NODE_VERSION: NEW_VERSION }, { installer: baseSh });
    check(`⑨ RED CONTROL (the 2.369.340 installer): the pin moved to ${NEW_VERSION} and its own node STAYED ${NODE_VERSION} — nothing fetched`,
      rR.status === 0 && vOf(privR) === NODE_VERSION && hits.tar === tR, `exit=${rR.status} v=${vOf(privR)} tarHits ${tR}→${hits.tar}`);
  }
}

srv.close();
console.log(fails ? `\n✗ ${fails} failure(s)${skips ? `, ${skips} skipped` : ''}` : `\n✓ all node-bootstrap checks passed${skips ? ` (${skips} skipped)` : ''}`);
process.exit(fails ? 1 : 0);
