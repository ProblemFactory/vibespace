'use strict';
/**
 * A PAIRED DEVICE PROVES ITS OWN KEY (lane lg-remote-hardening, B-7f0b — design q-042 D3, its first half; the owner
 * approved D3 2026-10-19). Before: the hub believed whoever said hello with the right token — a leaked pairing command
 * or a copied dial.json WAS the device. Now the device mints an ed25519 identity once (state/identity.pem, 0600) and,
 * when the hub's hello carries a fresh nonce, answers with its public key and a signature over that nonce:
 *   hello      hub → device   { nonceH }                                  (+ the host token, as before)
 *   hello-ack  device → hub   { devPub, sigD = sign(devKey, ackMessage(nonceH)) }
 * The hub pins devPub on the machine's record at the first such answer (its token proved it then) and from then on
 * refuses another key (`device-key-mismatch`), a bad signature (`device-signature-bad`) and an answer with no proof at
 * all (`device-key-missing` — a device cannot be talked down to the old greeting). The nonce is fresh per hello: a
 * recorded answer proves nothing to the next. An agent too old to know the nonce answers without proof and is not
 * judged until its record holds a key.
 * THE SECOND HALF (lane lg-remote-hardening, D3 half b — 主开发's ruling 2026-11-18 00:00Z): THE HUB PROVES ITS KEY. A hello that
 * carries the hub's public key (hubPub) is answered with the device's own fresh nonceD too; the hub's `ok` carries sigH over
 * okMessage(devPub, nonceD) — ONE shape: a fixed label, the machine (its own public key: a signature made for one machine
 * means nothing to another) and the device's nonce; nothing a caller hands in is ever signed. The device pins hubPub at the
 * first such ok its token admitted (state/hub.pub, bound to that token: a new pairing voids it) and from then on refuses a
 * hello with another hub key (`hub-key-mismatch`), without one (`hub-key-missing` — no downgrade) and an ok whose signature
 * does not verify (`hub-signature-bad`); it is `authed` only after the ok verified.
 * PURE: node's crypto is handed in; the key helpers are the release signature's own (src/agentd-signature.js).
 */
const SIG = require('./agentd-signature.js');
const DOMAIN = 'vibespace-device-key/v1';
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex'); // the DER head of an ed25519 public key (12 bytes) before its raw 32

const need = (o) => { if (!o || !o.crypto || typeof o.crypto.verify !== 'function') throw new Error('mutual-auth: hand in node crypto ({ crypto })'); return o.crypto; };
/** a base64 value that decodes to exactly `n` bytes, or null */
function b64(v, n) {
  if (typeof v !== 'string' || v.length > 4 * Math.ceil(n / 3) || !/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return null;
  const b = Buffer.from(v, 'base64');
  return b.length === n ? b : null;
}
const isPub = (v) => !!b64(v, 32);
const isNonce = (v) => !!b64(v, 32);
const newNonce = (opts) => need(opts).randomBytes(32).toString('base64');
const ackMessage = (nonceH) => Buffer.from(`${DOMAIN}\nack\n${nonceH}\n`, 'utf8');
/** THE ONE SHAPE the hub's key ever signs (law 1): the label, the machine (its public key), the device's nonce */
const okMessage = (devPub, nonceD) => Buffer.from(`vibespace-hub-key/v1\nok\n${devPub}\n${nonceD}\n`, 'utf8');
/** ssh's own fingerprint form of a raw ed25519 public key: `SHA256:<base64, no padding>` — what a person compares */
const fingerprintOf = (pub, opts) => { const raw = b64(pub, 32); return raw ? 'SHA256:' + need(opts).createHash('sha256').update(raw).digest('base64').replace(/=+$/, '') : null; };
const sign = (privateKeyPem, message, opts) => need(opts).sign(null, message, privateKeyPem).toString('base64');
function verify(pub, message, sig, opts) {
  const crypto = need(opts);
  const s = b64(sig, 64);
  if (!isPub(pub) || !s) return false;
  try { return crypto.verify(null, message, crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, b64(pub, 32)]), format: 'der', type: 'spki' }), s); } catch { return false; }
}
/** the device's identity: → { privateKeyPem, publicKey } (raw 32 bytes, base64) */
const generateKeyPair = (opts) => { const k = SIG.generateKeyPair(opts); return { privateKeyPem: k.privateKeyPem, publicKey: k.publicKey }; };
const publicKeyOf = (privateKeyPem, opts) => SIG.publicKeyOf(privateKeyPem, opts);
/** the device's answer to a hello that carries a nonce → { devPub, sigD } */
const proofOf = (identity, nonceH, opts) => ({ devPub: identity.publicKey, sigD: sign(identity.privateKeyPem, ackMessage(nonceH), opts) });

/** the hub's answer to a device that asked (its hello-ack carried nonceD): sigH over THE ONE SHAPE, or null for any other input */
function hubProof(identity, devPub, nonceD, opts) {
  if (!identity || !isPub(devPub) || !isNonce(nonceD)) return null;
  return sign(identity.privateKeyPem, okMessage(devPub, nonceD), opts);
}
/** THE DEVICE'S VERDICT over a hello (before it answers): `pinned` = state/hub.pub for this token | null.
 *  → { ok: true, mutual } | { ok: false, code, why } */
function helloVerdict({ hello, pinned }, opts) {
  const offered = hello && hello.hubPub !== undefined;
  if (!offered) return pinned ? { ok: false, code: 'hub-key-missing', why: `the hello proves no hub key; this device pins ${fingerprintOf(pinned, opts)} (an older hub, or not that hub)` } : { ok: true, mutual: false };
  if (!isPub(hello.hubPub) || !isNonce(hello.nonceH)) return { ok: false, code: 'hub-key-shape', why: 'the hello carries no usable hub key and nonce' };
  if (pinned && hello.hubPub !== pinned) return { ok: false, code: 'hub-key-mismatch', why: `the hello names the hub key ${fingerprintOf(hello.hubPub, opts)}, not the ${fingerprintOf(pinned, opts)} this device pins` };
  return { ok: true, mutual: true };
}
/** THE DEVICE'S VERDICT over the hub's ok: the signature over THIS device's key and nonce, by the hello's hub key. */
function okVerdict({ hubPub, devPub, nonceD, ok }, opts) {
  if (!ok || !verify(hubPub, okMessage(devPub, nonceD), ok.sigH, opts)) return { ok: false, code: 'hub-signature-bad', why: 'the hub\'s signature over this device\'s nonce does not verify' };
  return { ok: true };
}

/** THE HUB'S VERDICT over a device's hello-ack. `pinned` = the record's devPub | null.
 *  → { ok: true, learn } | { ok: true, judged: false } (no key pinned, no proof offered: an older agent) | { ok: false, code, why } */
function hubVerdict({ nonceH, ack, pinned, required = false }, opts) {
  const no = (code, why) => ({ ok: false, code, why });
  // unit 3's cure: a pin the record holds that is no key (an edited or imported record) refuses — never read as «nothing pinned»
  if (pinned != null && !isPub(pinned)) return no('device-key-mismatch', 'this machine\'s record pins a device key that is no ed25519 key (an edited or imported record) — forget its key to pin the one its agent proves');
  const offered = !!(ack && (ack.devPub !== undefined || ack.sigD !== undefined));
  if (!offered && pinned) return no('device-key-missing', `it answered without proving the key ${fingerprintOf(pinned, opts)} this machine's record pins (an agent older than the key, or not this device)`);
  // the person forgot its key: the NEXT answer must prove one (an agent that says nothing is not let in on the open pin)
  if (!offered) return required ? no('device-key-missing', 'it answered without proving a device key, and this machine\'s record asks for one (its old key was forgotten)') : { ok: true, judged: false };
  if (!isPub(ack.devPub) || !b64(ack.sigD, 64)) return no('device-key-shape', 'its answer carries no usable device key and signature');
  if (pinned && ack.devPub !== pinned) return no('device-key-mismatch', `it answered with the key ${fingerprintOf(ack.devPub, opts)}, not the ${fingerprintOf(pinned, opts)} this machine's record pins`);
  if (!verify(ack.devPub, ackMessage(nonceH), ack.sigD, opts)) return no('device-signature-bad', 'its signature over this hello\'s nonce does not verify');
  return { ok: true, learn: !pinned };
}

module.exports = { isPub, isNonce, newNonce, fingerprintOf, generateKeyPair, publicKeyOf, proofOf, hubVerdict, hubProof, helloVerdict, okVerdict };
