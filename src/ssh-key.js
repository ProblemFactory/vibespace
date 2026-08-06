/**
 * Passphrase-protected private-key IMPORT (2.246.0).
 *
 * Every ssh in this product runs with BatchMode=yes and can never prompt, so a
 * stored key must be usable non-interactively. We therefore UNLOCK the key ONCE
 * at import (ssh-keygen -p -N '') and store the decrypted copy — the passphrase
 * itself is used for that single exec and then discarded; it never reaches the
 * host record, the key file, argv, or any log.
 *
 * HOW THE PASSPHRASE IS PASSED (the whole security surface):
 *   ssh-keygen only ever reads a passphrase from a tty or from SSH_ASKPASS —
 *   NOT from stdin. So we write a throwaway 0700 helper into a 0700 mkdtemp dir
 *   whose entire body is `printf %s "$VIBESPACE_KEY_PASS"`, and pass the secret
 *   in the CHILD'S ENVIRONMENT (/proc/<pid>/environ is 0400 owner-only) with
 *   SSH_ASKPASS_REQUIRE=force so it is used even without a tty. argv carries
 *   only  -p -N '' -f <tmpfile>  — no secret, ever (/proc/<pid>/cmdline is
 *   world-readable 0444; the repo's 2.126.0 rule forbids secrets in argv).
 *   HOME is pointed at the temp dir so ssh-keygen can never touch the server's
 *   real ~/.ssh.
 *
 * NON-NEGOTIABLE ERROR BRANCH: an askpass helper that cannot be exec'd (noexec
 * tmpdir, missing file) makes ssh-keygen exit 255 with "incorrect passphrase
 * supplied" — indistinguishable from a genuinely wrong passphrase EXCEPT that
 * stderr also carries `ssh_askpass: exec(...)`. That marker MUST be checked
 * FIRST or a hardened container lies to users forever.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { classifyPrivateKey } = require('./ssh-key-format');

const MAX_KEY_BYTES = 64 * 1024;
const MAX_PASS_BYTES = 4 * 1024;

class KeyError extends Error {
  constructor(code, message) { super(message); this.name = 'KeyError'; this.code = code; }
}

const KEY_TYPE_LABEL = {
  'ssh-ed25519': 'ED25519',
  'ssh-rsa': 'RSA',
  'ssh-dss': 'DSA',
  'ecdsa-sha2-nistp256': 'ECDSA',
  'ecdsa-sha2-nistp384': 'ECDSA',
  'ecdsa-sha2-nistp521': 'ECDSA',
  'sk-ssh-ed25519@openssh.com': 'ED25519-SK',
  'sk-ecdsa-sha2-nistp256@openssh.com': 'ECDSA-SK',
};

/** execFile → {err, code, sys, killed, stdout, stderr} (never rejects). */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 20000, maxBuffer: 1 << 20, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      resolve({
        err: err || null,
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        sys: err && typeof err.code === 'string' ? err.code : null,
        killed: !!(err && err.killed),
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
      });
    });
  });
}

/** ssh-keygen embeds the temp path in its messages ("Failed to load key
 *  /tmp/vs-key-…") — strip it, keep the last non-empty line, cap the length. */
function sanitizeStderr(stderr, dir) {
  const rx = new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\S*', 'g');
  const lines = String(stderr || '')
    .split('\n')
    .map((l) => l.replace(rx, 'the key').trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1].slice(0, 200) : 'ssh-keygen failed';
}

/** Strip the passphrase IN PLACE (ssh-keygen -p rewrites the file, no .old backup). */
async function stripPassphrase(dir, kf, pass) {
  const askpass = path.join(dir, 'askpass');
  // SSH_ASKPASS is exec'd with the prompt as its only argv — it must be a bare
  // executable path, hence a real helper FILE. The secret rides the env.
  fs.writeFileSync(askpass, '#!/bin/sh\nprintf %s "$VIBESPACE_KEY_PASS"\n', { mode: 0o700 });
  const r = await run('ssh-keygen', ['-p', '-N', '', '-f', kf], {
    env: {
      PATH: process.env.PATH || '/usr/bin:/bin',
      HOME: dir, // never let ssh-keygen see the server's real ~/.ssh
      VIBESPACE_KEY_PASS: pass == null ? '' : String(pass),
      SSH_ASKPASS: askpass,
      SSH_ASKPASS_REQUIRE: 'force',
      DISPLAY: '',
    },
  });
  if (r.code === 0) return;
  if (r.sys === 'ENOENT' || /not found|no such file or directory/i.test(r.stderr)) {
    throw new KeyError('key-no-ssh-keygen', 'ssh-keygen is not available on this server');
  }
  // MUST precede the passphrase check — an unrunnable helper reports
  // "incorrect passphrase" for a CORRECT one.
  if (/ssh_askpass:/.test(r.stderr)) {
    throw new KeyError('key-unlock-unavailable', 'Could not run the passphrase helper on this server');
  }
  if (r.killed) throw new KeyError('key-unlock-failed', 'Unlocking the key timed out');
  if (/incorrect passphrase|bad passphrase/i.test(r.stderr)) {
    throw new KeyError('key-bad-passphrase', 'Wrong passphrase — the key could not be unlocked');
  }
  if (/invalid format|error in libcrypto|unsupported|not a (private )?key/i.test(r.stderr)) {
    throw new KeyError('key-unsupported', 'This key format is not supported');
  }
  throw new KeyError('key-unlock-failed', sanitizeStderr(r.stderr, dir));
}

/** Best-effort {fingerprint, type} — never fails the import. */
async function inspectKey(dir, kf) {
  const r = await run('ssh-keygen', ['-y', '-f', kf], {
    timeout: 10000,
    env: {
      PATH: process.env.PATH || '/usr/bin:/bin',
      HOME: dir,
      // Still-encrypted → the (missing) helper fails fast instead of hanging.
      SSH_ASKPASS: path.join(dir, 'nope'),
      SSH_ASKPASS_REQUIRE: 'force',
      DISPLAY: '',
    },
  });
  if (r.code !== 0) return { fingerprint: null, type: null };
  const parts = r.stdout.trim().split(/\s+/);
  const algo = parts[0] || '';
  const blob = parts[1] || '';
  if (!blob) return { fingerprint: null, type: KEY_TYPE_LABEL[algo] || algo || null };
  let fingerprint = null;
  try {
    // Byte-identical to `ssh-keygen -l` (verified): sha256 over the raw blob,
    // base64 without padding.
    const dg = crypto.createHash('sha256').update(Buffer.from(blob, 'base64')).digest('base64').replace(/=+$/, '');
    fingerprint = 'SHA256:' + dg;
  } catch {}
  return { fingerprint, type: KEY_TYPE_LABEL[algo] || algo || null };
}

/**
 * prepareImportedKey(rawText, passphrase)
 *   → { body, wasEncrypted, format, fingerprint|null, type|null }
 * Throws KeyError with a stable `code` the UI maps to localized text.
 */
async function prepareImportedKey(rawText, passphrase) {
  const text = String(rawText || '');
  if (Buffer.byteLength(text, 'utf-8') > MAX_KEY_BYTES) {
    throw new KeyError('key-too-large', 'That file is too large to be a private key');
  }
  const pass = passphrase == null ? '' : String(passphrase);
  if (Buffer.byteLength(pass, 'utf-8') > MAX_PASS_BYTES) {
    throw new KeyError('key-bad-passphrase', 'Passphrase too long');
  }

  const body = text.replace(/\r\n/g, '\n').trim() + '\n';
  const info = classifyPrivateKey(body);
  if (info.format === 'empty') throw new KeyError('key-not-a-key', 'No key was provided');
  if (info.format === 'ppk') throw new KeyError('key-ppk', 'PuTTY .ppk keys cannot be used by OpenSSH');
  if (info.format === 'ssh2') throw new KeyError('key-unsupported', 'ssh.com/RFC4716 keys are not supported');
  if (!info.usable) throw new KeyError('key-not-a-key', 'Not a valid private key (missing BEGIN PRIVATE KEY header)');
  // ASK rather than store a key ssh can never use.
  if (info.encrypted && !pass) throw new KeyError('key-encrypted', 'Key is passphrase-protected — supply its passphrase so it can be unlocked at import');

  // A passphrase on a key we read as PLAIN is not an error — our detection can
  // be wrong about an exotic format, and `-p` on an already-plain key is a
  // verified harmless no-op.
  const needsWork = info.encrypted || !!pass;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-key-')); // 0700 by construction
  try {
    const kf = path.join(dir, 'k');
    fs.writeFileSync(kf, body, { mode: 0o600 });
    if (needsWork) await stripPassphrase(dir, kf, pass);
    const meta = await inspectKey(dir, kf);
    return {
      body: fs.readFileSync(kf, 'utf-8'),
      wasEncrypted: !!info.encrypted,
      format: info.format,
      fingerprint: meta.fingerprint,
      type: meta.type,
    };
  } finally {
    // removed on EVERY path, including throws
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { prepareImportedKey, classifyPrivateKey, KeyError, MAX_KEY_BYTES };
