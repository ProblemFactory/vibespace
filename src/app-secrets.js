'use strict';
/**
 * lane app-display-secrets (2026-10-12, B-4a59 piece 4): the MACHINE half of an app display's Secret Service — the facts
 * the plan needs (desktop-apps secretServicePlan), the per-display key, and the ⋯ menu's count + its one door. The
 * service itself is src/secret-service.py (python3 + GDBus, activated by the app's private bus); its sealer is
 * src/app-secrets-seal.js. desktop-display forwards these (desktop-serve reaches them as `display.*`).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const DD = require('./desktop-display');
const run = (bin, args, { env, timeout }) => new Promise((r) => execFile(bin, args, { env, timeout }, (err, stdout) => r({ err, stdout: String(stdout || '') })));

/** lane app-display-secrets: the Secret Service's facts on THIS machine → desktop-apps secretServicePlan's `facts`:
 *  python3 + its GObject introspection (probed once per interpreter, ≤ 5 s), the service + sealer files beside this
 *  module, this node, and the PER-DISPLAY key: HKDF-SHA256 of the machine's master (data/.app-secrets-key — secret-box's
 *  discipline: minted on ENOENT only, never over a key that may exist) with the app's id. Never throws. */
const APP_SECRETS_SERVICE = path.join(__dirname, 'secret-service.py');
const APP_SECRETS_SEALER = path.join(__dirname, 'app-secrets-seal.js');
const APP_SECRETS_KEY_FILE = '.app-secrets-key';
let secretsGiMemo = null;
async function appSecretsFacts({ env = process.env, mode, dataDir, id, keyFile = dataDir ? path.join(dataDir, APP_SECRETS_KEY_FILE) : null } = {}) {
  const M = require('./desktop-apps');
  if (M.appSecretsMode(mode) === 'off') return { off: true };
  const python = DD.binOnPath('python3', { env });
  if (!python) return { why: 'python3 not found on this machine' };
  if (!secretsGiMemo || secretsGiMemo.python !== python) {
    const r = await run(python, ['-c', 'import gi; gi.require_version("Gio", "2.0"); from gi.repository import Gio'], { env, timeout: 5000 });
    secretsGiMemo = { python, ok: !r.err };
  }
  if (!secretsGiMemo.ok) return { why: 'python3 has no GObject introspection (python3-gi) on this machine' };
  if (!fs.existsSync(APP_SECRETS_SERVICE) || !fs.existsSync(APP_SECRETS_SEALER)) return { why: 'the secret service is not installed on this machine' };
  if (!keyFile || !id) return { why: 'no data dir or app id' };
  const { master, refused } = appSecretsMaster({ dataDir, keyFile });
  if (!master) return { why: `${refused.code} (${path.basename(keyFile)})` }; // THE KEY-FILE LAW: the window's ⋯ says restore (src/lib/key-file-words.js)
  const keyHex = Buffer.from(crypto.hkdfSync('sha256', master, Buffer.from(String(id), 'utf8'), Buffer.from('vibespace app-secrets v1', 'utf8'), 32)).toString('hex');
  return { python, service: APP_SECRETS_SERVICE, node: process.execPath, sealer: APP_SECRETS_SEALER, keyHex };
}
/** THE KEY-FILE LAW (lane key-file-law-stores): the machine's master key — minted only while no app holds a sealed
 *  login (`desktop-apps/<id>/portal/secrets.json` with n > 0, or one that cannot be read / parsed); else a refusal
 *  `{ code: key-missing | key-unreadable:<errno> | key-malformed }` and NO service key (the sealed stores stay as they are). */
function appSecretsMaster({ dataDir, keyFile = dataDir ? path.join(dataDir, APP_SECRETS_KEY_FILE) : null } = {}) {
  const SB = require('./secret-box');
  const sealed = (text) => { const n = require('./desktop-apps').secretsCountOf(text); return n == null || n > 0; };
  const r = SB.lawfulKey(keyFile, { hasCiphertext: () => !dataDir || SB.holdsCiphertext({ each: [{ dir: path.join(dataDir, 'desktop-apps'), file: path.join('portal', 'secrets.json') }], re: sealed }) });
  return r.ok ? { master: r.key, refused: null } : { master: null, refused: { code: r.code } };
}
/** The app's stored logins: `dir` = its app dir; `rec` = its record. → { secrets, count } (count = the sealed file's n). */
function appSecretsOf({ rec, dir }) {
  let count = 0;
  try { count = require('./desktop-apps').secretsCountOf(fs.readFileSync(path.join(dir, 'portal', require('./desktop-apps').SECRETS_STORE_FILE), 'utf8')) || 0; } catch { /* none yet */ }
  return { secrets: (rec && rec.secrets) || 'off', count };
}
/** Forget every login the app's Secret Service keeps: a running service is asked over the app's private bus (it drops
 *  its items and seals an empty store — ONE dbus-send, no secret in it); no bus ⇒ the sealed file is removed. */
async function forgetAppSecrets({ rec, dir, env = process.env, timeout = 5000 }) {
  const store = path.join(dir, 'portal', require('./desktop-apps').SECRETS_STORE_FILE), sock = path.join(dir, 'portal', 'bus');
  const ds = DD.binOnPath('dbus-send', { env });
  if (rec && rec.secrets === 'on' && ds && fs.existsSync(sock)) {
    const r = await run(ds, ['--bus=unix:path=' + sock, '--print-reply=literal', '--reply-timeout=' + timeout, '--dest=org.freedesktop.secrets', '/org/freedesktop/secrets', 'org.vibespace.AppSecrets.ForgetAll'], { env, timeout: timeout + 500 });
    const m = /uint32\s+(\d+)/.exec(r.err ? '' : r.stdout);
    if (m) return { ok: true, forgot: Number(m[1]), via: 'bus' };
  }
  const before = appSecretsOf({ rec, dir }).count;
  try { fs.unlinkSync(store); } catch (e) { if (!e || e.code !== 'ENOENT') return { ok: false, why: `the store could not be removed (${(e && e.code) || 'error'})` }; }
  return { ok: true, forgot: before, via: 'file' };
}
module.exports = { APP_SECRETS_SERVICE, APP_SECRETS_SEALER, APP_SECRETS_KEY_FILE, appSecretsFacts, appSecretsMaster, appSecretsOf, forgetAppSecrets };
