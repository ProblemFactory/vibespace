'use strict';
/**
 * THE PASSKEY STORE's FILE — data/browser-passkeys.json (0600, written only by the dialog watch, src/server/browser-dialogs.js)
 * + the per-instance key file data/browser-passkeys.key (0600, made once; B-4a59(b)'s keyring replaces this pair). Moved here
 * VERBATIM from src/server/mounts-plugins-wiring.js (lane passkey-store-core) by r3261 (the store-read law for this store), so the
 * production wiring and its legs build ONE object (scripts/test-browser-passkey-held.mjs): every fact a reader asks is asked of
 * the object production wires.
 * r3261 adds: `file` (the hold reads it again off the loop and keeps torn bytes beside it), `readText` (the start's ONE read, as
 * text, for the store-read law's answer — src/store-read.js storeAnswer), and the key-file law's ciphertext check counts the
 * torn bytes' copies beside the store (`browser-passkeys.json.corrupt-<mark>`): sealed passkeys in a copy keep their key — a
 * new key is never made over them.
 */
const fs = require('fs');
const path = require('path');

/** → { file, keyFile, readText, read, write, cipher } over `dataDir` (the instance's data folder) */
function passkeyFileStore({ dataDir }) {
  const PS = require('../browser-passkey-store.js'), crypto = require('crypto');
  const file = path.join(dataDir, 'browser-passkeys.json'), keyFile = path.join(dataDir, 'browser-passkeys.key');
  const sealedFiles = () => { let names = []; try { names = fs.readdirSync(dataDir).filter((n) => n.startsWith('browser-passkeys.json.corrupt-')); } catch { names = []; } return [file, ...names.map((n) => path.join(dataDir, n))]; };
  let cipher = null;
  const withCipher = (op) => {
    const SB = require('../secret-box.js');
    if (cipher) return op(cipher);
    const k = SB.lawfulKey(keyFile, { raw: true, hasCiphertext: () => SB.holdsCiphertext({ files: sealedFiles(), re: /v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\./ }) }); // THE KEY-FILE LAW (r3261: the torn copies too)
    if (!k.ok) return { ok: false, code: k.code, file: path.basename(keyFile), words: require('../key-file.js').refusalWords(k.code, path.basename(keyFile)) }; // sealed passkeys stay sealed: never a new key over them — a VALUE (key-file-law-fix: a throw here left the ws listener ⇒ the hub's exit)
    const c = PS.cipherOf(crypto, k.key);
    if (!SB.vaultHeld(keyFile)) { cipher = c; return op(c); }   // a key file (no vault in this process): cached as before
    try { return op(c); } finally { k.key.fill(0); }   // THE VAULT LAW: a vault-held key lives for this one call — a lock reaches it
  };
  return {
    file, keyFile,
    readText: () => fs.readFileSync(file, 'utf8'),   // r3261: the start's ONE read, as text — the store-read law answers it (the watch, src/server/browser-dialogs.js)
    read: () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    write: (o) => require('../channel-store.js').writeJsonAtomic(file, o, { mode: 0o600 }),
    cipher: { seal: (t) => withCipher((c) => c.seal(t)), open: (t) => withCipher((c) => c.open(t)) }, // a refusal = the answer of both doors
  };
}

module.exports = { passkeyFileStore };
