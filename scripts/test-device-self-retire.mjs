#!/usr/bin/env node
// B-4d71 — A DIAL DEVICE RETIRES ITS OWN START WHEN ITS PAIRING IS GONE. A dial-only device has no ssh for the hub to clean it
// with: an unpair left its start behind (the systemd user unit, the launchd item, the container boot-hook block, the Windows
// logon task) and its agent dialed a refusing hub for ever. The hub keeps the unpaired token's tombstone and answers that
// device's next dial «retired» WITH A PROOF (an HMAC of the device's own per-dial nonce keyed by its token's hash —
// src/pairing-token.js); the agent checks it from the token it holds, then removes its own start (src/agentd/self-retire.js:
// the dial config and token first, the start, the supervisor's own stop LAST) and ends.
//   §1 the proof (PURE): this dial, this token only.   §2 the answer's words (src/dial-facts.js, ws-min's header).
//   §3 the KEY of a root = the installer's, in a real bash (GNU tr counts bytes; macOS tr characters).
//   §4 the hook block = the installer's drop_hook_block, in a real bash, case by case; its link, its mode, its owner kept.
//   §5 the steps per platform, named as the installer names them.   §6 the steps run over a scratch root (stub supervisors).
//   §7 the agent's wiring.   RED CONTROLS (anchored, each proving its plant).
// The gate legs (the REAL gateDialUpgrade answering «retired» with the proof, the tombstone, the one answer to anyone else)
// live in test-dial-link-kept.
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');
const SR = require('../src/agentd/self-retire.js');
const PT = require('../src/pairing-token.js');
const DF = require('../src/dial-facts.js');
const T = scratchDir('self-retire');
const M = mutantCopies('self-retire', REPO);
const bashOk = spawnSync('bash', ['-c', 'true']).status === 0 && process.platform === 'linux';

console.log('§1 the proof: only the hub that held the pairing can make it, for THIS dial and THIS token');
{
  const tok = PT.mintToken('host'), other = PT.mintToken('host'), dialTok = PT.mintToken('dial'), nonce = 'a1'.repeat(16), nonce2 = 'b2'.repeat(16);
  // THE PROOF NAMES ITS PURPOSE (主开发's round wz421di05: its format is fixed at its first release): a fixed purpose word, the
  // device's id, the hash of the dial token that matched the tombstone, the nonce — \0 between them (it occurs in none)
  const F = { deviceId: 'mini', dialToken: dialTok, nonce }, hubF = { deviceId: 'mini', dialTokenHash: PT.tokenHash(dialTok), nonce };
  const proof = PT.retireProof(PT.tokenHash(tok), hubF);
  ok(PT.RETIRE_PURPOSE === 'vibespace-retire-v1' && PT.retireMessage(hubF) === ['vibespace-retire-v1', 'mini', PT.tokenHash(dialTok), nonce].join('\0'), 'the message: the purpose word, the device\'s id, the dial token\'s hash, the nonce — \\0 between them');
  ok(/^[0-9a-f]{64}$/.test(proof) && PT.retireProofMatches(tok, F, proof), 'the hub\'s proof (keyed by the HOST token\'s hash its tombstone keeps) holds for the device\'s own host token, id, dial token and nonce');
  ok(!PT.retireProofMatches(tok, { ...F, nonce: nonce2 }, proof), 'a proof replayed to another dial (another nonce): refused');
  ok(!PT.retireProofMatches(tok, { ...F, deviceId: 'other' }, proof) && !PT.retireProofMatches(tok, { ...F, dialToken: PT.mintToken('dial') }, proof), 'the same proof for another device id, or another pairing\'s dial token: refused');
  ok(!PT.retireProofMatches(other, F, proof) && !PT.retireProofMatches(dialTok, F, proof), 'another device\'s host token, or the dial token in its place: refused');
  ok(!PT.retireProofMatches('', F, PT.retireProof(PT.tokenHash(''), hubF)) && !PT.retireProofMatches(tok, { ...F, nonce: '' }, PT.retireProof(PT.tokenHash(tok), { ...hubF, nonce: '' })), 'an EMPTY token, or no nonce: no proof can hold');
  ok(PT.retireProof(PT.tokenHash(tok), { ...hubF, deviceId: 'a\0b' }) === '' && PT.retireMessage({ ...hubF, nonce: '' }) === null, 'a part holding the separator, or an empty part, makes no proof (no two messages share one spelling)');
  const bare = require('node:crypto').createHmac('sha256', PT.tokenHash(tok)).update(nonce).digest('hex');
  ok(!PT.retireProofMatches(tok, F, bare), 'CONTROL: the bare HMAC of the nonce (the proof before it named its purpose) is NOT a retire proof');
  let threw = false; let r = [];
  try { r = [PT.retireProofMatches(tok, F, proof.slice(0, 40)), PT.retireProofMatches(tok, F, 'zz'.repeat(32)), PT.retireProofMatches(tok, F, undefined), PT.retireProofMatches(tok, F, null), PT.retireProofMatches(tok, undefined, proof)]; } catch { threw = true; }
  ok(!threw && r.every((x) => x === false), 'a cut, a non-hex, a missing proof, missing facts: refused, never a throw', r);
}

console.log('§2 the answer\'s words: «retired» is a named refusal, read by the agent, said by the dial check');
{
  ok(DF.DIAL_REFUSAL_CODES.includes('retired') && DF.DIAL_FAIL_CODES.includes('refused-retired'), 'the refusal code and its stored failure code are in the closed sets');
  const f = DF.dialFailureOf({ code: 'UPGRADE_REFUSED', status: 401, refusal: 'retired', body: JSON.stringify({ error: 'this device was unpaired' }) });
  ok(f.code === 'refused-retired', 'a 401 «retired» classes as refused-retired (the agent\'s dial loop reads that code)', f);
  ok(/unpaired/.test(DF.refusalSentence('retired', 'mini')), 'its sentence says the device was unpaired');
  const c = DF.dialCheckLines({ code: 'refused-retired', detail: 'x', host: 'hub:3456', deviceId: 'mini' });
  ok(c.exit === 14, 'the dial check says it as a refusal (exit 14), never «other»', c);
  ok(read('src/agentd/ws-min.js').includes("retireProof: String(res.headers['x-vibespace-retire-proof'] || '').slice(0, 128) || null,"), 'ws-min carries the answer\'s proof header to the dial loop');
}

console.log('§3 the KEY of a root is the installer\'s (a real bash; GNU tr counts BYTES)');
{
  const SH = read('scripts/vibespace-agentd-install.sh');
  const KEYLINE = 'KEY=$(basename "$ROOT" | tr -c \'A-Za-z0-9.-\' \'-\' | sed \'s/-*$//\')';
  ok(SH.includes(KEYLINE + '\n'), 'the installer keys a root by that line');
  const roots = [path.join(T, '.vibespace', 'device@hub.example.com'), '/x/agentd', '/x/my root', '/x/höst', '/x/trail--', '/x/a_b/', '/x/日本', '/x/dev:9'];
  if (bashOk) {
    const bash = roots.map((R) => spawnSync('bash', ['-c', `ROOT=${JSON.stringify(R)}; ${KEYLINE}; printf %s "$KEY"`], { encoding: 'utf8' }).stdout);
    const js = roots.map((R) => SR.keyOf(R, 'linux'));
    ok(JSON.stringify(bash) === JSON.stringify(js), `every root keys alike in the installer's bash and the agent (${js.join(' | ')})`, { bash, js });
  } else ok(true, '(no Linux bash here: the parity leg runs on the test machine)');
  ok(SR.keyOf('/x/höst', 'linux') === 'h--st' && SR.keyOf('/x/höst', 'darwin') === 'h-st', 'a two-byte «ö»: two dashes under GNU tr, one under macOS tr (characters in its UTF-8 locale)');
  // RED CONTROL: a key over characters on Linux too (the natural JS) — a non-ASCII root names ANOTHER unit than the installer's
  const anchorK = "  const units = platform === 'darwin' ? [...base] : [...Buffer.from(base, 'utf8')].map((b) => String.fromCharCode(b));";
  const SRc = M.load('src/agentd/self-retire.js', anchored(read('src/agentd/self-retire.js'), anchorK, '  const units = [...base];', 'key-by-chars'), 'key-by-chars');
  ok(SRc.keyOf('/x/höst', 'linux') === 'h-st', 'CONTROL (the key over characters on Linux): «h-st», not the installer\'s «h--st» ⇒ RED (its unit and hook block would never be found)');
}

console.log('§4 the hook block leaves as the installer\'s drop_hook_block removes it (a real bash, case by case)');
const H = path.join(T, 'home'); fs.mkdirSync(H, { recursive: true });
const HOOK = path.join(H, '.vibespace-init.sh');
const blk = (k, body = '( : start )') => `# >>> vibespace-device ${k} >>> (written by its installer)\n${body}\n# <<< vibespace-device ${k} <<<\n`;
const hookOnly = (key, uid = process.getuid()) => SR.runRetire([{ kind: 'hook', what: 'the container boot-hook block', file: HOOK, key }], { fs, supervisor: async () => true, uid });
{
  const SH = read('scripts/vibespace-agentd-install.sh');
  const B0 = "# >>> B-8475 THE IMAGE'S USER BOOT HOOK", B1 = '# <<< B-8475 <<<';
  const i0 = SH.indexOf(B0), i1 = SH.indexOf(B1);
  ok(i0 > 0 && i1 > i0, 'the installer\'s hook functions stand between their markers');
  const FNS = path.join(T, 'hook-fns.sh'); fs.writeFileSync(FNS, i0 > 0 && i1 > i0 ? SH.slice(i0, i1 + B1.length) : '');
  const CASES = [
    ['a block among the person\'s own lines, the hook ending in exit 0', `#!/bin/bash\necho mine-1\n${blk('device-a')}echo mine-2\nexit 0\n`, 'device-a'],
    ['two keys, one a prefix of the other: only THIS key\'s block leaves', `#!/bin/bash\n${blk('device-a')}${blk('device-ab')}echo mine\n`, 'device-a'],
    ['no block of this key: the hook is never rewritten', `#!/bin/bash\necho mine\n${blk('device-z')}`, 'device-a'],
    ['a begin with no end: LEFT as it is', `#!/bin/bash\necho mine-1\n# >>> vibespace-device device-a >>> (half)\n( : start )\necho mine-2\n`, 'device-a'],
  ];
  for (const [what, text, key] of CASES) {
    let bashOut = null, bashRc = null;
    if (bashOk) {
      fs.writeFileSync(HOOK, text);
      const r = spawnSync('bash', ['-c', `HOME=${JSON.stringify(H)}; . ${JSON.stringify(FNS)}; drop_hook_block ${key}`], { encoding: 'utf8' });
      bashRc = r.status; bashOut = fs.readFileSync(HOOK, 'utf8');
    }
    fs.writeFileSync(HOOK, text);
    const ino = fs.statSync(HOOK).ino;
    const j = await hookOnly(key);
    const jsOut = fs.readFileSync(HOOK, 'utf8');
    const open = j.left.some((x) => /begin has no end/.test(x.why));
    ok(bashOk ? jsOut === bashOut && open === (bashRc !== 0) : true, `${what}: the agent leaves the hook as the installer's bash does${open ? ' (both left it, said)' : ''}`, { jsOut, bashOut, bashRc, left: j.left });
    if (what.startsWith('no block')) ok(fs.statSync(HOOK).ino === ino && j.done.length === 0, '…and the file is the same file (not rewritten)');
  }
  // its link, its mode, its owner
  const real = path.join(T, 'dotfiles', 'init.sh'); fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, `#!/bin/bash\n${blk('device-a')}echo mine\n`); fs.chmodSync(real, 0o640);
  fs.rmSync(HOOK, { force: true }); fs.symlinkSync(real, HOOK);
  const um = process.umask(0o077); let jl; try { jl = await hookOnly('device-a'); } finally { process.umask(um); }
  ok(fs.lstatSync(HOOK).isSymbolicLink() && fs.readFileSync(real, 'utf8') === '#!/bin/bash\necho mine\n' && (fs.statSync(real).mode & 0o777) === 0o640 && jl.done.length === 1,
    'a symlinked hook (a dotfiles repo): written THROUGH its link — the link stays, the block leaves, the file keeps its mode 0640 (whatever the umask)', { mode: (fs.statSync(real).mode & 0o777).toString(8), done: jl.done });
  fs.writeFileSync(real, `#!/bin/bash\n${blk('device-a')}`);
  const jo = await hookOnly('device-a', process.getuid() + 1);
  ok(fs.readFileSync(real, 'utf8').includes('vibespace-device device-a') && jo.left.some((x) => /another user/.test(x.why)), 'a hook that belongs to another user: left as it is, and said', jo.left);
  fs.rmSync(HOOK, { force: true });
  // RED CONTROLS: the drop without its open guard (a begin with no end took the person's lines to the end of the file); the
  // rewrite at the umask's mode (a 0640 hook became 0600)
  const SRo = M.load('src/agentd/self-retire.js', anchored(read('src/agentd/self-retire.js'), '  if (skip) return { changed: false, open: true };\n', '', 'hook-no-open-guard'), 'hook-no-open-guard');
  fs.writeFileSync(HOOK, CASES[3][1]);
  await SRo.runRetire([{ kind: 'hook', what: 'the container boot-hook block', file: HOOK, key: 'device-a' }], { fs, supervisor: async () => true, uid: process.getuid() });
  ok(!fs.readFileSync(HOOK, 'utf8').includes('mine-2'), 'CONTROL (no open guard): a begin with no end takes the person\'s lines after it with it ⇒ RED');
  const SRm = M.load('src/agentd/self-retire.js', anchored(read('src/agentd/self-retire.js'), 'mode: 0o600, chmod: st.mode & 0o777, log', 'mode: 0o600, log', 'hook-umask-mode'), 'hook-umask-mode');
  fs.rmSync(HOOK, { force: true }); fs.writeFileSync(real, `#!/bin/bash\n${blk('device-a')}echo mine\n`); fs.chmodSync(real, 0o640); fs.symlinkSync(real, HOOK);
  const um2 = process.umask(0o077); try { await SRm.runRetire([{ kind: 'hook', what: 'the container boot-hook block', file: HOOK, key: 'device-a' }], { fs, supervisor: async () => true, uid: process.getuid() }); } finally { process.umask(um2); }
  ok((fs.statSync(real).mode & 0o777) === 0o600, 'CONTROL (the rewrite at the umask\'s mode): the 0640 hook becomes 0600 ⇒ RED', (fs.statSync(real).mode & 0o777).toString(8));
  fs.rmSync(HOOK, { force: true });
}

console.log('§5 the steps per platform, named as the installer names them; the dial config first, the supervisor\'s stop last');
{
  const SH = read('scripts/vibespace-agentd-install.sh');
  ok(SH.includes('  LABEL="cc.vibespace.device.$KEY"\n  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"\n') && SH.includes('  UNIT="vibespace-device-$KEY.service"\n') && SH.includes('cat > "$HOME/.config/systemd/user/$UNIT"'), 'the installer\'s names: the launchd label and plist, the systemd unit and its file');
  const R = '/home/u/.vibespace/device@hub.example.com', K = 'device-hub.example.com';
  const shape = (steps) => steps.map((s) => `${s.kind}:${s.file || [s.cmd, ...(s.args || [])].join(' ')}${s.last ? ' (last)' : ''}`);
  const lin = shape(SR.retireSteps({ root: R, platform: 'linux', home: '/home/u', uid: 1000 }));
  ok(JSON.stringify(lin) === JSON.stringify([`unlink:${R}/state/dial.json`, `unlink:${R}/state/token`, 'hook:/home/u/.vibespace-init.sh', `exec:systemctl --user disable vibespace-device-${K}.service`, `unlink:/home/u/.config/systemd/user/vibespace-device-${K}.service`, 'exec:systemctl --user daemon-reload', `exec:systemctl --user stop vibespace-device-${K}.service (last)`]), 'Linux: the dial config and token, the boot-hook block, the unit disabled and its file gone, systemd reloaded, its stop LAST', lin);
  const mac = shape(SR.retireSteps({ root: R, platform: 'darwin', home: '/Users/u', uid: 501 }));
  ok(JSON.stringify(mac) === JSON.stringify([`unlink:${R}/state/dial.json`, `unlink:${R}/state/token`, 'hook:/Users/u/.vibespace-init.sh', `unlink:/Users/u/Library/LaunchAgents/cc.vibespace.device.${K}.plist`, `exec:launchctl bootout gui/501/cc.vibespace.device.${K} (last)`]), 'macOS: the launch item gone, its bootout LAST', mac);
  const win = shape(SR.retireSteps({ root: 'C:\\Users\\u\\.vibespace\\device@hub', platform: 'win32', home: 'C:\\Users\\u' }));
  ok(win.length === 3 && win[2] === 'exec:schtasks /Delete /TN VibeSpaceDevice-hub /F', 'Windows: the logon task the installer made for that root (hidden-start logonTaskName)', win);
  ok(SR.retireSteps({ root: 'C:\\x\\agentd', platform: 'win32', home: 'C:\\Users\\u' }).length === 2, 'Windows, a root that is not the installer\'s: no task is named (none is ours)');
  {
    const H5 = path.join(T, 'home5'); fs.mkdirSync(H5, { recursive: true });
    const st5 = SR.retireSteps({ root: path.join(H5, '.vibespace', 'device@x'), platform: 'linux', home: H5, uid: process.getuid() }), calls5 = [];
    const pres5 = SR.presentOf(st5, fs);
    await SR.runRetire(st5.filter((s) => !s.last), { fs, supervisor: async (c, a2) => { calls5.push(c); return true; }, uid: process.getuid(), present: pres5 });
    await SR.runRetire(st5.filter((s) => s.last), { fs, supervisor: async (c, a2) => { calls5.push(c); return true; }, uid: process.getuid(), present: pres5 });
    ok(calls5.length === 0, 'no unit file of ours: no systemd step runs (no disable, no reload, no stop of a unit that is not there)', calls5);
  }
}

console.log('§6 the steps run over a scratch root: each done or LEFT with its why; the stop is the caller\'s last');
{
  const R = path.join(T, '.vibespace', 'device@hub.example.com'); fs.mkdirSync(path.join(R, 'state'), { recursive: true });
  const unitDir = path.join(H, '.config', 'systemd', 'user'); fs.mkdirSync(unitDir, { recursive: true });
  const K = SR.keyOf(R, 'linux'), unitFile = path.join(unitDir, `vibespace-device-${K}.service`);
  const plant = () => { fs.writeFileSync(path.join(R, 'state', 'dial.json'), '{}'); fs.writeFileSync(path.join(R, 'state', 'token'), 'x'); fs.writeFileSync(unitFile, '[Unit]\n'); fs.writeFileSync(HOOK, `#!/bin/bash\necho mine\n${blk(K)}`); };
  plant();
  const steps = SR.retireSteps({ root: R, platform: 'linux', home: H, uid: process.getuid() });
  const calls = []; const exec = async (c, a) => { calls.push([c, ...a].join(' ')); return true; };
  const pres6 = SR.presentOf(steps, fs);   // (read before any step: the stop runs after the unit file is gone)
  const r1 = await SR.runRetire(steps.filter((s) => !s.last), { fs, supervisor: exec, uid: process.getuid(), present: pres6 });
  ok(r1.done.length === 6 && r1.left.length === 0 && !fs.existsSync(path.join(R, 'state', 'dial.json')) && !fs.existsSync(path.join(R, 'state', 'token')) && !fs.existsSync(unitFile) && fs.readFileSync(HOOK, 'utf8') === '#!/bin/bash\necho mine\n',
    'the steps before the stop: the dial config and token gone, the hook block gone (the person\'s line kept), the unit file gone', r1);
  ok(calls.join(' · ') === `systemctl --user disable vibespace-device-${K}.service · systemctl --user daemon-reload`, '…the supervisor asked to disable and reload — never to stop (that is the last step, after the answer)', calls);
  const r2 = await SR.runRetire(steps.filter((s) => s.last), { fs, supervisor: exec, uid: process.getuid(), present: pres6 });
  ok(r2.done.length === 1 && calls[2] === `systemctl --user stop vibespace-device-${K}.service`, 'the last step: the supervisor\'s stop', calls);
  const again = await SR.runRetire(steps.filter((s) => !s.last && s.kind !== 'exec'), { fs, supervisor: exec, uid: process.getuid() });
  ok(again.done.length === 0 && again.left.length === 0, 'run again: nothing is there, nothing is said (a missing file is no failure)', again);
  plant();
  const r3 = await SR.runRetire(steps.filter((s) => !s.last), { fs, supervisor: async (c, a) => a[1] !== 'disable', uid: process.getuid(), present: SR.presentOf(steps, fs) });
  ok(r3.left.length === 1 && /did not answer/.test(r3.left[0].why) && !fs.existsSync(unitFile) && r3.done.length === 5, 'a supervisor that fails a step: that step is LEFT with its why, the next steps still run', r3);
}

console.log('§7 the agent\'s wiring: only a dial device retires; the proof is checked before; the stop last, then the agent ends');
{
  const A = read('src/agentd/agentd.js');
  ok(A.includes("  if (!now || !provenDialToken || now.token !== provenDialToken) return false;\n"), 'a root with no dial config (the hub\'s own agent, a hand-made root), or one whose dial config no longer holds the token just proven (a pairing made again into it), retires nothing');
  ok(A.includes('  SR.runRetire(steps.filter((s) => !s.last), { fs, supervisor: run, uid, present, log }).then((r) => {') && A.includes('SR.runRetire(steps.filter((s) => s.last), { fs, supervisor: run, uid, present, log }).then((z) => { if (z.left.length) log(') && A.includes('}).finally(() => process.exit(0)); }, 500).unref?.();'), 'the steps before the stop first, said in the agent\'s log; the supervisor\'s stop last, a stop that did not answer said too; then the agent ends');
  ok(A.includes("const dialNonce = require('crypto').randomBytes(16).toString('hex');") && A.includes("'x-vibespace-dial-nonce': dialNonce,"), 'every dial sends a fresh nonce of its own');
  ok(A.includes("        let hostTok = ''; try { hostTok = fs.readFileSync(TOKEN_FILE, 'utf-8').trim(); } catch { }") && A.includes("if (lastErr && require('../pairing-token.js').retireProofMatches(hostTok, { deviceId: devId, dialToken: cfg.token || '', nonce: dialNonce }, lastErr.retireProof)) { if (retireOwnStart('the hub this device was paired with unpaired it (its proof checked)', cfg.token)) return; }"),
    'a «retired» answer retires the start only when its proof holds for THIS dial\'s nonce, this device\'s id and dial token, under its HOST token');
  ok(read('scripts/test-architecture.mjs').includes("'src/agentd/self-retire.js'"), 'self-retire.js is a DEVICE module (test-architecture\'s tiers)');
}

for (const x of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(!!x.pass, x.name, x.detail);
fs.rmSync(T, { recursive: true, force: true });
report();
