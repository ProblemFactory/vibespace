#!/usr/bin/env node
'use strict';
/**
 * The sealing half of src/secret-service.py (lane app-display-secrets, 2026-10-12, B-4a59 piece 4): ONE app display's
 * Secret Service items, sealed at rest with src/secret-box.js's cipher (aes-256-gcm) under the per-display key the
 * service hands this child alone — over an inherited PIPE whose fd number is VS_APP_SECRETS_FD (lane
 * display-secret-fd, B-6c6d: never an env value, never argv — this process's environ carries a number, not a key).
 *   open <file>  → stdout the items JSON (`[]` when the file does not exist); exit 3 = not decryptable with this key
 *   seal <file>  ← stdin the items JSON; writes `{ v, n, sealed }` (n = the item count, read by the window's ⋯ menu
 *                  without the key) to a 0600 temp file and renames it over <file> (atomic).
 * Its words name no byte of a secret: a failure says the step and the errno.
 */
const fs = require('fs');
const { encWith, decWith } = require('./secret-box');

const fail = (code, line) => { process.stderr.write(`app-secrets-seal: ${line}\n`); process.exit(code); };
const fd = Number(process.env.VS_APP_SECRETS_FD);
delete process.env.VS_APP_SECRETS_FD;
let hex = '';
if (Number.isInteger(fd) && fd > 2) { try { hex = fs.readFileSync(fd, 'utf8').trim(); } catch (e) { fail(2, `the per-display key could not be read off fd ${fd} (${(e && e.code) || 'error'})`); } }
if (!/^[0-9a-f]{64}$/i.test(hex)) fail(2, 'no per-display key on VS_APP_SECRETS_FD');
const key = Buffer.from(hex, 'hex');
const [mode, file] = process.argv.slice(2);
if (!file) fail(2, 'usage: app-secrets-seal.js open|seal <file>');
if (mode === 'open') {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { if (e && e.code === 'ENOENT') { process.stdout.write('[]'); process.exit(0); } fail(1, `cannot read the store (${(e && e.code) || 'error'})`); }
  let items;
  try { items = JSON.parse(decWith(key, JSON.parse(raw).sealed)); } catch { fail(3, 'the store is not decryptable with this display\'s key'); }
  process.stdout.write(JSON.stringify(Array.isArray(items) ? items : []));
} else if (mode === 'seal') {
  let items;
  try { items = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { fail(2, 'the items are not JSON'); }
  if (!Array.isArray(items)) fail(2, 'the items are not a list');
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, n: items.length, sealed: encWith(key, JSON.stringify(items)) }), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (e) { try { fs.unlinkSync(tmp); } catch { /* never written */ } fail(1, `cannot write the store (${(e && e.code) || 'error'})`); }
} else fail(2, `unknown mode ${String(mode).slice(0, 16)}`);
