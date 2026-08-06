/**
 * Private-key FORMAT classifier — shared by the server (import path) and the
 * browser (Add-machine dialog affordances). Pure, dependency-free, CJS like
 * src/task-color-seq.js (esbuild pulls it into the bundle).
 *
 * WHY a real decoder and not a regex: a modern `openssh-key-v1` key's PEM
 * armor is BYTE-IDENTICAL whether or not it has a passphrase — the word
 * ENCRYPTED appears NOWHERE (only the classic PEM `Proc-Type: 4,ENCRYPTED`
 * and PKCS#8's `BEGIN ENCRYPTED PRIVATE KEY` announce themselves in the
 * header). The pre-2.246.0 check grepped the first 3 lines for /ENCRYPTED/,
 * so it missed effectively every encrypted key ssh-keygen has produced since
 * OpenSSH 7.8 — those keys imported "successfully" and then failed at connect
 * time with a bare `Permission denied (publickey)` that never mentions a
 * passphrase at ANY -v level. The encryption state lives in the DECODED body:
 *   "openssh-key-v1\0" | string ciphername | string kdfname | …
 * ciphername === kdfname === "none"  ⇔  unencrypted.
 *
 * Every function is TOTAL: hostile/truncated input returns a verdict, never
 * throws (this runs on every keystroke in a textarea).
 */

const OPENSSH_MAGIC = 'openssh-key-v1\0';

/**
 * Decode only the FIRST 256 base64 chars (192 bytes) — far more than the magic
 * + two short strings we read, and it bounds the work on a multi-MB paste.
 * Returns null instead of throwing on garbage.
 */
function b64Head(b64) {
  let clean = String(b64).replace(/[^A-Za-z0-9+/]/g, '').slice(0, 256);
  if (clean.length % 4 === 1) clean = clean.slice(0, -1); // a lone trailing char is undecodable
  while (clean.length % 4) clean += '=';
  if (!clean) return null;
  try {
    if (typeof atob === 'function') {
      const bin = atob(clean);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
      return out;
    }
    return new Uint8Array(Buffer.from(clean, 'base64'));
  } catch { return null; }
}

/** {ciphername, kdfname, encrypted} for an openssh-key-v1 body, or null if it
 *  isn't one / is truncated beyond use. */
function opensshV1Info(text) {
  const m = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]*?)(?:-----END|$)/.exec(String(text || ''));
  const buf = b64Head(m ? m[1] : text);
  if (!buf || buf.length < OPENSSH_MAGIC.length + 8) return null;
  for (let i = 0; i < OPENSSH_MAGIC.length; i++) {
    if (buf[i] !== OPENSSH_MAGIC.charCodeAt(i)) return null;
  }
  let off = OPENSSH_MAGIC.length;
  const rd = () => {
    if (off + 4 > buf.length) return null;
    const n = ((buf[off] << 24) >>> 0) + (buf[off + 1] << 16) + (buf[off + 2] << 8) + buf[off + 3];
    off += 4;
    // BOUND the length word — never trust a pasted blob's own framing.
    // Real ciphername/kdfname are ≤ ~24 chars.
    if (n > 64 || n > buf.length - off) return null;
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(buf[off + i]);
    off += n;
    return s;
  };
  const ciphername = rd();
  const kdfname = rd();
  if (ciphername === null || kdfname === null) return null;
  return { ciphername, kdfname, encrypted: !(ciphername === 'none' && kdfname === 'none') };
}

/**
 * classifyPrivateKey(text) → { format, encrypted, cipher?, usable, malformed? }
 *   format : empty | openssh-v1 | pkcs8 | pem | ppk | ssh2 | unknown
 *   usable : can ssh(1) use this at all (after unlocking)? ppk/ssh2 → false
 * Never throws.
 */
function classifyPrivateKey(text) {
  const s = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!s) return { format: 'empty', encrypted: false, usable: false };

  // PuTTY .ppk — OpenSSH cannot read it at all; the header names the cipher.
  if (/^PuTTY-User-Key-File-\d+\s*:/m.test(s)) {
    const enc = /^Encryption\s*:\s*(\S+)/m.exec(s);
    return { format: 'ppk', encrypted: !!(enc && enc[1] !== 'none'), cipher: enc ? enc[1] : undefined, usable: false };
  }
  // ssh.com / RFC4716 private key. NOTE the real armor is FOUR dashes with
  // spaces (`---- BEGIN SSH2 ENCRYPTED PRIVATE KEY ----`), not the five-dash
  // PEM form — accept both so it never falls through to the generic
  // "doesn't look like a key" message.
  if (/-{4,5} ?BEGIN SSH2 (ENCRYPTED )?PRIVATE KEY ?-{4,5}/.test(s)) {
    return { format: 'ssh2', encrypted: /SSH2 ENCRYPTED/.test(s), usable: false };
  }
  if (/-----BEGIN OPENSSH PRIVATE KEY-----/.test(s)) {
    const i = opensshV1Info(s);
    if (!i) return { format: 'openssh-v1', encrypted: false, usable: false, malformed: true };
    return { format: 'openssh-v1', encrypted: i.encrypted, cipher: i.encrypted ? i.ciphername : undefined, usable: true };
  }
  // PKCS#8 MUST be checked before the generic PEM branch (its header also
  // matches /BEGIN [A-Z0-9 ]*PRIVATE KEY/).
  if (/-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(s)) return { format: 'pkcs8', encrypted: true, usable: true };
  if (/-----BEGIN PRIVATE KEY-----/.test(s)) return { format: 'pkcs8', encrypted: false, usable: true };
  // Classic PEM (RSA/DSA/EC) — encryption is announced in the header block.
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(s)) {
    const header = s.split(/\n\s*\n/)[0] || '';
    const dek = /^DEK-Info:\s*([^,\s]+)/m.exec(header);
    return {
      format: 'pem',
      encrypted: /^Proc-Type:\s*4,ENCRYPTED/m.test(header),
      cipher: dek ? dek[1] : undefined,
      usable: true,
    };
  }
  return { format: 'unknown', encrypted: false, usable: false };
}

module.exports = { classifyPrivateKey, opensshV1Info };
