#!/usr/bin/env node
/**
 * Passphrase-protected private-key import (2.246.0) — REAL keys, real
 * ssh-keygen. Generates every flavor in a temp dir, drives the classifier,
 * the unlock path, and hosts.add() against a throwaway dataDir.
 *
 *   node scripts/test-ssh-key.mjs
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { classifyPrivateKey } = require('../src/ssh-key-format');
const { prepareImportedKey } = require('../src/ssh-key');
const { HostManager } = require('../src/hosts');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-keytest-'));
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-keydata-'));
const keygen = (args) => execFileSync('ssh-keygen', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const read = (f) => fs.readFileSync(path.join(D, f), 'utf-8');
const tmpDirs = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('vs-key-'));

const PASS_ED = 'p@ss w/ spaces '; // TRAILING SPACE — trim-regression guard
const cleanup = () => { for (const d of [D, DATA]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } };

try {
  // ── fixtures (real keys) ────────────────────────────────────────────────
  keygen(['-t', 'ed25519', '-N', PASS_ED, '-f', path.join(D, 'ed_enc'), '-C', 'enc', '-q']);
  keygen(['-t', 'ed25519', '-N', '', '-f', path.join(D, 'ed_plain'), '-C', 'plain', '-q']);
  keygen(['-t', 'rsa', '-b', '2048', '-N', 'rsapass', '-f', path.join(D, 'rsa_enc'), '-C', 'encrsa', '-q']);
  keygen(['-t', 'rsa', '-b', '2048', '-m', 'PEM', '-N', 'pempass', '-f', path.join(D, 'rsa_pem'), '-C', 'pemrsa', '-q']);
  execFileSync('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-aes256',
    '-pass', 'pass:pk8pass', '-out', path.join(D, 'pkcs8_enc.pem')], { stdio: 'ignore' });
  execFileSync('openssl', ['genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048',
    '-out', path.join(D, 'pkcs8_plain.pem')], { stdio: 'ignore' });

  // ── 1. classifier ───────────────────────────────────────────────────────
  console.log('\n[1] classifyPrivateKey — real keys');
  const encInfo = classifyPrivateKey(read('ed_enc'));
  ok('encrypted openssh-v1 detected (armor says nothing!)', encInfo.encrypted && encInfo.format === 'openssh-v1' && encInfo.usable);
  ok('…and the word ENCRYPTED really is absent from it', !/ENCRYPTED/.test(read('ed_enc')));
  ok('…so the OLD first-3-lines /ENCRYPTED/ check would have missed it',
    !/ENCRYPTED/.test(read('ed_enc').split('\n').slice(0, 3).join('\n')));
  eq('encrypted cipher name', encInfo.cipher, 'aes256-ctr');
  ok('plain openssh-v1', classifyPrivateKey(read('ed_plain')).encrypted === false);
  ok('rsa openssh-v1 encrypted', classifyPrivateKey(read('rsa_enc')).encrypted === true);
  const pem = classifyPrivateKey(read('rsa_pem'));
  ok('classic PEM encrypted', pem.format === 'pem' && pem.encrypted && pem.usable, JSON.stringify(pem));
  ok('pkcs8 encrypted', (() => { const i = classifyPrivateKey(read('pkcs8_enc.pem')); return i.format === 'pkcs8' && i.encrypted; })());
  ok('pkcs8 plain', (() => { const i = classifyPrivateKey(read('pkcs8_plain.pem')); return i.format === 'pkcs8' && !i.encrypted; })());

  console.log('\n[1b] classifyPrivateKey — hostile input (must never throw)');
  const enc = read('ed_enc');
  const hostile = {
    empty: ['', (r) => r.format === 'empty' && !r.usable],
    garbage: ['not a key at all', (r) => r.format === 'unknown' && !r.usable],
    ppk: ['PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: aes256-cbc\n', (r) => r.format === 'ppk' && r.encrypted && !r.usable],
    ppk_plain: ['PuTTY-User-Key-File-2: ssh-rsa\nEncryption: none\n', (r) => r.format === 'ppk' && !r.encrypted],
    ssh2_4dash: ['---- BEGIN SSH2 ENCRYPTED PRIVATE KEY ----\nx\n', (r) => r.format === 'ssh2' && !r.usable],
    ssh2_5dash: ['-----BEGIN SSH2 PRIVATE KEY-----\nx\n', (r) => r.format === 'ssh2' && !r.usable],
    truncated: [enc.slice(0, 60), (r) => r.malformed === true && !r.usable],
    armor_stripped: [enc.split('\n').slice(1, -2).join('\n'), (r) => !r.usable],
    one_line: [enc.split('\n').join(''), (r) => r.encrypted === true],
    crlf: [enc.replace(/\n/g, '\r\n'), (r) => r.encrypted === true],
    bogus_b64: ['-----BEGIN OPENSSH PRIVATE KEY-----\n!!!!\n-----END OPENSSH PRIVATE KEY-----', (r) => !r.usable],
    huge_len: ['-----BEGIN OPENSSH PRIVATE KEY-----\n' +
      Buffer.concat([Buffer.from('openssh-key-v1\0'), Buffer.from([0xff, 0xff, 0xff, 0xff])]).toString('base64') +
      '\n-----END OPENSSH PRIVATE KEY-----', (r) => !r.usable],
    nul_bytes: ['\0\0\0\0', (r) => !r.usable],
  };
  for (const [name, [input, check]] of Object.entries(hostile)) {
    let r, threw = null;
    try { r = classifyPrivateKey(input); } catch (e) { threw = e; }
    ok(`hostile:${name}`, !threw && check(r), threw ? 'THREW ' + threw.message : JSON.stringify(r));
  }

  // ── 2. unlock with the CORRECT passphrase ───────────────────────────────
  console.log('\n[2] prepareImportedKey — correct passphrase');
  const before = tmpDirs();
  const r1 = await prepareImportedKey(read('ed_enc'), PASS_ED);
  ok('wasEncrypted', r1.wasEncrypted === true);
  eq('type', r1.type, 'ED25519');
  ok('result body is none/none (really decrypted)', classifyPrivateKey(r1.body).encrypted === false);
  const realFp = keygen(['-l', '-f', path.join(D, 'ed_enc.pub')]).trim().split(' ')[1];
  eq('fingerprint === ssh-keygen -l', r1.fingerprint, realFp);
  ok('TRAILING-SPACE passphrase accepted (no .trim() anywhere)', true); // implied by reaching here

  // ── 3. wrong passphrase ─────────────────────────────────────────────────
  console.log('\n[3] prepareImportedKey — wrong passphrase');
  const srcBefore = read('ed_enc');
  let err = null;
  try { await prepareImportedKey(srcBefore, 'definitely-wrong'); } catch (e) { err = e; }
  eq('code', err && err.code, 'key-bad-passphrase');
  ok('source key text untouched', read('ed_enc') === srcBefore);

  // ── 4. encrypted with NO passphrase ─────────────────────────────────────
  console.log('\n[4] prepareImportedKey — encrypted, no passphrase');
  err = null;
  try { await prepareImportedKey(srcBefore, ''); } catch (e) { err = e; }
  eq('code', err && err.code, 'key-encrypted');

  // ── 5. plain keys behave exactly as before ──────────────────────────────
  console.log('\n[5] prepareImportedKey — plain keys');
  const plain = read('ed_plain');
  const r5 = await prepareImportedKey(plain, '');
  ok('plain unchanged', r5.body.trim() === plain.trim());
  ok('wasEncrypted false', r5.wasEncrypted === false);
  const r5b = await prepareImportedKey(plain, 'typed-anyway');
  ok('plain + stray passphrase is a harmless no-op strip', r5b.wasEncrypted === false && !!r5b.fingerprint);

  // ── 6. other encrypted formats ──────────────────────────────────────────
  console.log('\n[6] prepareImportedKey — PEM / PKCS#8');
  const r6 = await prepareImportedKey(read('rsa_pem'), 'pempass');
  ok('classic PEM unlocks (re-serialized to openssh-v1)', r6.wasEncrypted && classifyPrivateKey(r6.body).format === 'openssh-v1');
  const r7 = await prepareImportedKey(read('pkcs8_enc.pem'), 'pk8pass');
  ok('PKCS#8 unlocks', r7.wasEncrypted && classifyPrivateKey(r7.body).encrypted === false);
  const r8 = await prepareImportedKey(read('rsa_enc'), 'rsapass');
  eq('rsa openssh-v1 type', r8.type, 'RSA');

  // ── 7. rejected formats ─────────────────────────────────────────────────
  console.log('\n[7] prepareImportedKey — rejected inputs');
  for (const [name, text, code] of [
    ['ppk', 'PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: aes256-cbc\n', 'key-ppk'],
    ['ssh2', '---- BEGIN SSH2 ENCRYPTED PRIVATE KEY ----\nx\n', 'key-unsupported'],
    ['garbage', 'hello', 'key-not-a-key'],
    ['empty', '', 'key-not-a-key'],
    ['too-large', 'x'.repeat(70000), 'key-too-large'],
  ]) {
    let e2 = null;
    try { await prepareImportedKey(text, ''); } catch (e) { e2 = e; }
    eq(`reject:${name}`, e2 && e2.code, code);
  }

  // ── 8. NO temp dirs leaked (incl. the throwing paths above) ─────────────
  console.log('\n[8] temp hygiene');
  const leaked = tmpDirs().filter((f) => !before.includes(f));
  ok('no vs-key-* temp dirs survive', leaked.length === 0, leaked.join(','));

  // ── 9. hosts.add() belt ─────────────────────────────────────────────────
  console.log('\n[9] hosts.add() — the belt for callers that skip the route');
  const hm = new HostManager({ dataDir: DATA });
  const sshDir = path.join(DATA, 'ssh');
  let e3 = null;
  try { hm.add({ name: 'enc', user: 'u', host: 'h', privateKey: read('ed_enc') }); } catch (e) { e3 = e; }
  eq('encrypted key refused', e3 && e3.code, 'key-encrypted');
  ok('…and NO key file was written', !fs.existsSync(sshDir) || fs.readdirSync(sshDir).length === 0,
    fs.existsSync(sshDir) ? fs.readdirSync(sshDir).join(',') : '');

  const id = hm.add({ name: 'good', user: 'u', host: 'h', privateKey: r1.body });
  const rec = hm.get(id);
  ok('unlocked key stored', !!rec.keyPath && fs.existsSync(rec.keyPath));
  eq('mode 0600', (fs.statSync(rec.keyPath).mode & 0o777).toString(8), '600');
  eq('keySource', rec.keySource, 'imported');
  ok('stored key is usable without prompting', (() => {
    try {
      const outPub = execFileSync('ssh-keygen', ['-y', '-f', rec.keyPath],
        { env: { PATH: process.env.PATH, HOME: DATA, SSH_ASKPASS: '/nonexistent', SSH_ASKPASS_REQUIRE: 'force', DISPLAY: '' }, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      return outPub.startsWith('ssh-ed25519');
    } catch { return false; }
  })());

  // name collision must not orphan a key file (old order wrote-then-threw)
  const filesBefore = fs.readdirSync(sshDir).length;
  let e4 = null;
  try { hm.add({ name: 'good', user: 'u', host: 'h2', privateKey: r5.body }); } catch (e) { e4 = e; }
  ok('duplicate name rejected', !!e4 && /exists/.test(e4.message));
  eq('…with no orphaned key file', fs.readdirSync(sshDir).length, filesBefore);

  // ── 10. the passphrase is nowhere on disk ───────────────────────────────
  console.log('\n[10] passphrase never persisted');
  const needle = PASS_ED.trim();
  const scan = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      const st = fs.statSync(fp);
      if (st.isDirectory()) walk(fp);
      else scan.push([fp, fs.readFileSync(fp)]);
    }
  };
  walk(DATA);
  const hits = scan.filter(([, buf]) => buf.includes(needle)).map(([f]) => f);
  ok(`no file under the dataDir contains the passphrase (${scan.length} files scanned)`, hits.length === 0, hits.join(','));
  const hostsJson = fs.readFileSync(path.join(DATA, 'hosts.json'), 'utf-8');
  ok('hosts.json has no keyPassphrase field', !/passphrase/i.test(hostsJson));

  // ── 11. askpass-unavailable must NOT read as a wrong passphrase ─────────
  console.log('\n[11] noexec/unrunnable askpass helper (the indistinguishable-error trap)');
  const stub = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-keystub-'));
  fs.writeFileSync(path.join(stub, 'ssh-keygen'),
    '#!/bin/sh\n' +
    'echo "ssh_askpass: exec(/tmp/vs-key-x/askpass): Permission denied" >&2\n' +
    'echo "Load key: incorrect passphrase supplied to decrypt private key" >&2\n' +
    'exit 255\n', { mode: 0o755 });
  const realPath = process.env.PATH;
  process.env.PATH = stub + ':' + realPath;
  let e5 = null;
  try { await prepareImportedKey(read('ed_enc'), PASS_ED); } catch (e) { e5 = e; }
  process.env.PATH = realPath;
  fs.rmSync(stub, { recursive: true, force: true });
  eq('code (NOT key-bad-passphrase, even though stderr says so)', e5 && e5.code, 'key-unlock-unavailable');

  // ── 12. ssh-keygen missing entirely ─────────────────────────────────────
  console.log('\n[12] ssh-keygen absent');
  process.env.PATH = '/nonexistent-dir-for-test';
  let e6 = null;
  try { await prepareImportedKey(read('ed_enc'), PASS_ED); } catch (e) { e6 = e; }
  process.env.PATH = realPath;
  eq('code', e6 && e6.code, 'key-no-ssh-keygen');

  // ── 13. importBundle skips encrypted keys with a warning ────────────────
  console.log('\n[13] importBundle — encrypted key skipped, never silently');
  const DATA2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-keydata2-'));
  try {
    const hm2 = new HostManager({ dataDir: DATA2 });
    const res = hm2.importBundle({
      hosts: [{ id: 'host-aaa', name: 'boxA', user: 'u', host: 'h', port: 22, keyPath: path.join(DATA2, 'ssh', 'host-aaa.key'), keySource: 'imported' }],
      keys: { 'host-aaa': read('ed_enc') },
    });
    ok('a warning is returned', !!res.warnings && res.warnings.length === 1, JSON.stringify(res));
    ok('warning names the host', /boxA/.test(res.warnings[0]), res.warnings[0]);
    ok('no encrypted key written', !fs.existsSync(path.join(DATA2, 'ssh', 'host-aaa.key')));
    eq('keySource downgraded', hm2.get('host-aaa').keySource, 'default');
    eq('keyPath cleared', hm2.get('host-aaa').keyPath, null);
    const res2 = hm2.importBundle({
      hosts: [{ id: 'host-bbb', name: 'boxB', user: 'u', host: 'h', port: 22, keyPath: path.join(DATA2, 'ssh', 'host-bbb.key'), keySource: 'imported' }],
      keys: { 'host-bbb': plain },
    });
    ok('plain key still imports with no warning', res2.warnings.length === 0 && fs.existsSync(path.join(DATA2, 'ssh', 'host-bbb.key')));
  } finally { fs.rmSync(DATA2, { recursive: true, force: true }); }
} finally {
  cleanup();
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
