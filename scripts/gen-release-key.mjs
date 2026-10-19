#!/usr/bin/env node
// MINT THE DEVICE AGENT'S RELEASE KEY (lane device-bundle-signing, design q-042 D2) — once, on the RELEASE MACHINE.
//
//   node scripts/gen-release-key.mjs [--out <pem>] [--encrypt]
//   node scripts/gen-release-key.mjs --rotate-from <old pem> --out <new pem> [--encrypt]
//   node scripts/gen-release-key.mjs --retire <old pem>
//
// Writes an ed25519 private key (PKCS#8 PEM, 0600, in a 0700 dir; default ~/.vibespace-release/agentd-ed25519.pem —
// never inside this repository; an existing file is NEVER overwritten) and prints the PUBLIC row to paste into
// src/agentd/release-keys.js RELEASE_KEYS.
// --encrypt (USE IT on any machine that also runs a VibeSpace or agent sessions: they run as your user and can read a
// plain PEM) asks for a passphrase of ≥ 12 characters and encrypts the PEM with it (PKCS#8, aes-256-cbc); it is never
// stored — every signing asks for it. On a terminal it is typed twice (no echo); when stdin is NOT a terminal the FIRST
// stdin line is the passphrase and there is no confirmation.
// --rotate-from also prints the KEY_CHAIN link (the old key signs the new one): devices that pinned the old key follow it
// and ADD the new one (the old stays trusted until it is retired). --retire <old pem> writes nothing and prints a
// KEY_CHAIN retirement signed by that key: devices drop it from their trust at the next release that carries it.
// Refuses in CI and inside a running instance's checkout (exit 2, by name).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { REPO, die, refuseOffReleaseMachine, keyPathOf, loadPrivateKey, readSecret } from './release-key-io.mjs';
const require = createRequire(import.meta.url);

refuseOffReleaseMachine('gen-release-key');
const SIG = require(path.join(REPO, 'src/agentd-signature.js'));
const argv = process.argv.slice(2);
if (argv.includes('--retire')) {
  const old = loadPrivateKey(keyPathOf(['--key', argv[argv.indexOf('--retire') + 1]]));
  const r = SIG.signRetire(old, { crypto });
  console.log(`retirement of release key ${r.retire} — append to KEY_CHAIN (never remove an entry) and REMOVE its row from RELEASE_KEYS:
  { retire: '${r.retire}', sig: '${r.sig}' },`);
  process.exit(0);
}
const outArgv = argv.includes('--out') ? ['--key', argv[argv.indexOf('--out') + 1]] : [];
const out = keyPathOf(outArgv);
if (fs.existsSync(out)) die(2, `gen-release-key: refused — ${out} exists (a release key is never overwritten; pass --out <new path>)`);
const ri = argv.indexOf('--rotate-from');
const old = ri >= 0 ? loadPrivateKey(keyPathOf(['--key', argv[ri + 1]])) : null;
let passphrase = null;
if (argv.includes('--encrypt')) {
  passphrase = readSecret('new passphrase: ');
  if (process.stdin.isTTY && readSecret('again: ') !== passphrase) die(2, 'gen-release-key: the two passphrases differ — nothing written');
  if (!passphrase || passphrase.length < 12) die(2, 'gen-release-key: a passphrase of at least 12 characters, please — nothing written');
}
const pair = SIG.generateKeyPair({ crypto, passphrase });
fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
fs.writeFileSync(out, pair.privateKeyPem, { mode: 0o600, flag: 'wx' });
console.log(`release key ${pair.keyId} written to ${out} (0600${passphrase ? ', passphrase-encrypted' : ''}) — keep it on this machine only; back it up offline.
paste into src/agentd/release-keys.js RELEASE_KEYS${old ? ' (BESIDE the old row — retire the old one later with --retire)' : ''}:
  { keyId: '${pair.keyId}', publicKey: '${pair.publicKey}' },`);
if (old) {
  const link = SIG.signLink(old, pair.publicKey, { crypto });
  console.log(`append to KEY_CHAIN (never remove a link):
  { keyId: '${link.keyId}', publicKey: '${link.publicKey}', by: '${link.by}', sig: '${link.sig}' },`);
}
