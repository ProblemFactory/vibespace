#!/usr/bin/env node
// A DEVICE RE-EXECS NOTHING UNSIGNED (lane device-bundle-signing, design q-042 §3 D2 / §5 P0-a).
//
// Before: a hub whose bundle version differed from a device's streamed its own data/bin/vibespace-agentd.js and the
// device landed it, repointed `current` and re-exec'd — a compromised hub replaced the code of every paired machine.
// Now: ① the PURE verdict (src/agentd-signature.js) — the truth table incl. the key chain; ② the hub pushes only the
// signed release (a manifest naming the exact bytes) to another machine, its own machine's daemon only with the local
// proof, and a device refusal is never pushed again + reaches the door; ③ a REAL daemon (the built bundle) judges the
// bytes ON DISK before anything points at them — unsigned / bad signature / unknown key / version mismatch / a path
// version are refused, the temp file deleted, the daemon still serving; a good signature (through the chain) lands and
// re-execs (a stub records the re-exec) and pins the successor; the local proof lands on the machine's own socket and
// is ignored on a dial link; a MUTANT that skips the verdict lands the bad signature (the legs can see a skip);
// ④ the watch files ONE urgent For-you item per refusal; ⑤ the release scripts (sign refuses CI / a hub checkout / a key
// in the repo / a loose key / an unknown key; the build step copies the manifest only for the signed bytes; the key
// generator never overwrites); ⑥ the census: the one writer of `current` sits behind the verdict.
// Fix r2 (verify-r1's two mediums + three lows): the VERSION FLOOR (a validly signed older release = `downgrade`; a
// rollback the release key SIGNED lands once), TRUST ON FIRST USE for a device that trusts no key (the record's signed
// key set; a pinned device never re-TOFUs), a successor JOINS the pin (a signed retirement drops one), ③b the SSH ROAD
// lands through the host's own agent (`--land-upgrade` = the same landBundle), the hub's downgrade / first-trust doors,
// the release scripts' --allow-downgrade-to / --retire / --encrypt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { endDaemonsAndWait } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SIG = require('../src/agentd-signature.js');
const { Mux, PROTO_VERSION } = require('../src/agentd/mux.js');

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 50) => { const end = Date.now() + ms; for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) return v; await sleep(step); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sig-'));
const roots = [];
const C = { crypto };
const row = (k) => ({ keyId: k.keyId, publicKey: k.publicKey });
const K1 = SIG.generateKeyPair(C), K2 = SIG.generateKeyPair(C), K3 = SIG.generateKeyPair(C), KX = SIG.generateKeyPair(C);

try {
  // ── ① THE PURE VERDICT ──
  console.log('— ① the verdict (PURE, crypto handed in) —');
  const B = Buffer.from('/* a bundle */ module.exports = { VERSION: "1.2.3" };\n');
  const good = SIG.sign(K1.privateKeyPem, B, '1.2.3', C);
  const v1 = SIG.verify([row(K1)], B, '1.2.3', good, C);
  ok(v1.ok && v1.keyId === K1.keyId && v1.viaChain === false && v1.trustAfter === null && v1.sha256 === crypto.createHash('sha256').update(B).digest('hex'), 'good: signed by a trusted key ⇒ ok (no pin change)', v1);
  const flipped = Buffer.from(B); flipped[3] ^= 1;
  ok(SIG.verify([row(K1)], flipped, '1.2.3', good, C).code === 'bad-signature', 'one flipped BUNDLE byte ⇒ bad-signature');
  const badSig = { ...good, sig: Buffer.from(Buffer.from(good.sig, 'base64').map((b, i) => (i === 7 ? b ^ 1 : b))).toString('base64') };
  ok(SIG.verify([row(K1)], B, '1.2.3', badSig, C).code === 'bad-signature', 'one flipped SIGNATURE byte ⇒ bad-signature');
  ok(SIG.verify([row(K1)], B, '1.2.3', { ...good, sha256: '0'.repeat(64) }, C).ok, 'the record\'s own sha256 is never trusted (the digest is computed over the bytes)');
  ok(SIG.verify([row(K1)], B, '1.2.3', SIG.sign(KX.privateKeyPem, B, '1.2.3', C), C).code === 'unknown-key', 'signed by a key this device does not trust ⇒ unknown-key');
  ok(SIG.verify([row(K1)], B, '1.2.4', good, C).code === 'version-mismatch', 'signed for 1.2.3, offered as 1.2.4 ⇒ version-mismatch');
  ok(SIG.verify([row(K1)], B, '1.2.3', null, C).code === 'unsigned', 'no record ⇒ unsigned');
  const malformed = [[{}, 'an empty record'], [{ ...good, v: 2 }, 'v 2'], [{ ...good, sig: 'not base64!' }, 'a non-base64 sig'], [{ ...good, sig: Buffer.alloc(63).toString('base64') }, 'a 63-byte sig'], [{ ...good, keyId: 'K1' }, 'a key id that is no key id'], [{ ...good, chain: 'x' }, 'a chain that is no list'], [{ ...good, chain: [{ by: K1.keyId }] }, 'a half link'], [{ ...good, version: '../x' }, 'a signed version that is a path']];
  for (const [rec, what] of malformed) ok(SIG.verify([row(K1)], B, '1.2.3', rec, C).code === 'malformed', `malformed: ${what}`);
  ok(SIG.verify([row(K1)], B, '../../etc', good, C).code === 'malformed', 'an offered version that is a PATH ⇒ malformed (never a directory name)');
  const L12 = SIG.signLink(K1.privateKeyPem, K2.publicKey, C), L23 = SIG.signLink(K2.privateKeyPem, K3.publicKey, C);
  const byK2 = SIG.sign(K2.privateKeyPem, B, '1.2.3', { ...C, chain: [L12] });
  const v2 = SIG.verify([row(K1)], B, '1.2.3', byK2, C);
  ok(v2.ok && v2.viaChain === true && JSON.stringify(v2.trustAfter) === JSON.stringify([row(K2), row(K1)]), 'a successor THROUGH the chain (K1 → K2) ⇒ ok, and K2 JOINS the pin — K1 stays (fix r2: a successor adds, it does not replace)', v2);
  ok(SIG.verify([row(K1)], B, '1.2.3', SIG.sign(K2.privateKeyPem, B, '1.2.3', C), C).code === 'unknown-key', 'the same successor WITHOUT the chain ⇒ unknown-key');
  ok(SIG.verify([row(K1)], B, '1.2.3', SIG.sign(K2.privateKeyPem, B, '1.2.3', { ...C, chain: [SIG.signLink(KX.privateKeyPem, K2.publicKey, C)] }), C).code === 'unknown-key', 'a successor vouched for by a STRANGER\'s link (KX → K2) ⇒ unknown-key');
  const forged = { ...L12, sig: SIG.signLink(KX.privateKeyPem, K2.publicKey, C).sig };
  ok(SIG.verify([row(K1)], B, '1.2.3', SIG.sign(K2.privateKeyPem, B, '1.2.3', { ...C, chain: [forged] }), C).code === 'bad-signature', 'a link that CLAIMS a trusted signer but does not check ⇒ bad-signature (a forgery is refused, never skipped)');
  const v3 = SIG.verify([row(K1)], B, '1.2.3', SIG.sign(K3.privateKeyPem, B, '1.2.3', { ...C, chain: [L23, L12] }), C);
  ok(v3.ok && v3.viaChain && v3.trustAfter[0].keyId === K3.keyId, 'two rotations, links out of order (K2→K3, K1→K2) ⇒ ok, pinned to K3');
  ok(SIG.verify([], B, '1.2.3', good, C).code === 'unknown-key', 'an EMPTY trusted set ⇒ unknown-key (no release key yet = nothing lands signed)');
  ok(SIG.verify([{ keyId: KX.keyId, publicKey: K1.publicKey }], B, '1.2.3', good, C).code === 'unknown-key', 'a trusted row whose keyId is not its key\'s id is dropped (never trusted by name)');
  ok(SIG.verify([row(K1)], B, '1.2.3', SIG.sign(K2.privateKeyPem, B, '1.2.3', { ...C, chain: [{ ...L12, keyId: K3.keyId }] }), C).code === 'malformed', 'a link naming another key than it carries ⇒ malformed');
  const linkAsBundle = { ...good, sig: L12.sig };
  ok(SIG.verify([row(K1)], B, '1.2.3', linkAsBundle, C).code === 'bad-signature', 'a link signature replayed as a bundle signature ⇒ bad-signature (domain-separated messages)');
  ok(SIG.manifestMatches(null, { sha256: good.sha256, version: '1.2.3' }).code === 'unsigned-local-build', 'hub: no manifest ⇒ unsigned-local-build');
  ok(/is not the signed release/.test(SIG.manifestMatches(good, { sha256: 'f'.repeat(64), version: '1.2.3' }).why), 'hub: another build\'s bytes ⇒ unsigned-local-build');
  ok(SIG.manifestMatches(good, { sha256: good.sha256, version: '1.2.4' }).signed === false && SIG.manifestMatches(good, { sha256: good.sha256, version: '1.2.3' }).signed === true, 'hub: the version must match too; these bytes + this version ⇒ signed');
  ok(JSON.stringify(SIG.parseTrust(SIG.trustText([row(K1)], { from: 'bundle', at: 'x' }))) === JSON.stringify([row(K1)]) && SIG.parseTrust('{}') === null && SIG.parseTrust('junk') === null, 'trusted-keys.json round-trips; junk is no pin');
  // ── fix r2: the floor + the signed rollback (RED-1), trust on first use (RED-2), the chain keeps siblings (low ④) ──
  console.log('— ① fix r2: the version floor, the signed rollback, trust on first use, a rotation keeps the siblings —');
  const Fo = (o) => ({ ...C, ...o });
  const dn = SIG.verify([row(K1)], B, '1.2.3', good, Fo({ floor: '1.2.4' }));
  ok(dn.code === 'downgrade' && dn.floor === '1.2.4', 'RED-1: a VALIDLY signed release older than the floor (1.2.3 < 1.2.4) ⇒ downgrade — the replay of an old release', dn);
  ok(SIG.verify([row(K1)], B, '1.2.3', good, Fo({ floor: '1.2.3' })).ok && SIG.verify([row(K1)], B, '1.2.3', good, Fo({ floor: '1.1.9' })).ok && SIG.verify([row(K1)], B, '1.2.3', good, Fo({ floor: '1.2.10' })).code === 'downgrade', 'the floor itself and older floors pass; the order is numeric (1.2.3 < 1.2.10)');
  const rbR = SIG.sign(K1.privateKeyPem, B, '1.2.3', { ...C, allowDowngradeTo: '1.2.3' });
  const rbv = SIG.verify([row(K1)], B, '1.2.3', rbR, Fo({ floor: '1.2.4' }));
  ok(rbv.ok && rbv.rollback === true && rbv.floor === '1.2.4', 'a SIGNED rollback (allowDowngradeTo = its own version, signed by the release key) lands below the floor', rbv);
  ok(SIG.verify([row(K1)], B, '1.2.3', rbR, Fo({ floor: '1.2.4', honoured: [rbv.sha256] })).code === 'downgrade', '…ONCE: the same rollback again (its digest already honoured) ⇒ downgrade');
  ok(SIG.verify([row(K1)], B, '1.2.3', { ...good, allowDowngradeTo: '1.2.3' }, Fo({ floor: '1.2.4' })).code === 'bad-signature', 'a FORGED allowDowngradeTo (added to a real old record) ⇒ bad-signature — the statement is inside the signed message');
  ok(SIG.verify([row(K1)], B, '1.2.3', SIG.sign(KX.privateKeyPem, B, '1.2.3', { ...C, allowDowngradeTo: '1.2.3' }), Fo({ floor: '1.2.4' })).code === 'unknown-key', 'a rollback signed by the WRONG key ⇒ unknown-key');
  ok(SIG.verify([row(K1)], B, '1.2.3', { ...rbR, allowDowngradeTo: '1.2.2' }, Fo({ floor: '1.2.4' })).code === 'malformed', 'allowDowngradeTo naming another version than the record signs ⇒ malformed');
  const k13 = SIG.sign(K1.privateKeyPem, B, '1.2.3', { ...C, keys: [row(K1), row(K3)] });
  const tf = SIG.verify([], B, '1.2.3', k13, Fo({ tofu: true }));
  ok(tf.ok && tf.tofu === true && JSON.stringify(tf.trustAfter) === JSON.stringify([row(K1), row(K3)]), 'RED-2: a device that trusts NO key takes the first validly signed record\'s own SIGNED key set (trust on first use) — both keys', tf);
  ok(SIG.verify([], B, '1.2.3', k13, C).code === 'unknown-key', '…only when the device says it trusts nothing (no tofu flag ⇒ unknown-key, as before)');
  ok(SIG.verify([], B, '1.2.3', SIG.sign(K1.privateKeyPem, B, '1.2.3', { ...C, keys: null }), Fo({ tofu: true })).code === 'unknown-key', 'TOFU: a record that names no key set ⇒ unknown-key');
  ok(SIG.verify([], B, '1.2.3', { ...k13, keys: [row(K1), row(KX)] }, Fo({ tofu: true })).code === 'bad-signature', 'TOFU: a key slipped into the signed set (KX) ⇒ bad-signature — the set is inside the signed message');
  ok(SIG.verify([], B, '1.2.3', { ...SIG.sign(K1.privateKeyPem, B, '1.2.3', { ...C, keys: null }), keys: [row(K3)] }, Fo({ tofu: true })).code === 'malformed', 'TOFU: a key set that does not hold its signer ⇒ malformed (not self-consistent)');
  ok(SIG.verify([], flipped, '1.2.3', k13, Fo({ tofu: true })).code === 'bad-signature', 'TOFU: the signature must still check over the bytes');
  ok(SIG.verify([row(K1)], B, '1.2.3', SIG.sign(KX.privateKeyPem, B, '1.2.3', C), Fo({ tofu: true })).code === 'unknown-key', 'a device that trusts ANY key never re-TOFUs: a stranger\'s self-consistent record ⇒ unknown-key even with the flag');
  const v13 = SIG.verify([row(K1), row(K3)], B, '1.2.3', byK2, C);
  ok(v13.ok && v13.trustAfter?.length === 3 && [K2, K1, K3].every((k) => v13.trustAfter.some((x) => x.keyId === k.keyId)), 'low ④: two keys pinned (K1, K3), a successor of one (K1 → K2) arrives ⇒ three pinned', v13.trustAfter);
  const R1 = SIG.signRetire(K1.privateKeyPem, C);
  const vr = SIG.verify([row(K1), row(K3)], B, '1.2.3', SIG.sign(K2.privateKeyPem, B, '1.2.3', { ...C, chain: [L12, R1] }), C);
  ok(vr.ok && JSON.stringify(vr.trustAfter) === JSON.stringify([row(K2), row(K3)]), '…and a retirement signed by K1 itself ⇒ two (K2, K3)', vr.trustAfter);
  ok(SIG.verify([row(K1), row(K3)], B, '1.2.3', SIG.sign(K2.privateKeyPem, B, '1.2.3', { ...C, chain: [L12, { retire: K1.keyId, sig: SIG.signRetire(KX.privateKeyPem, C).sig }] }), C).code === 'bad-signature', 'a retirement of K1 NOT signed by K1 ⇒ bad-signature (a forgery)');
  ok(SIG.verify([row(K1), row(K3)], B, '1.2.3', SIG.sign(K1.privateKeyPem, B, '1.2.3', { ...C, chain: [R1] }), C).code === 'unknown-key', 'a release signed by a key its own chain retires ⇒ unknown-key');
  const rx = SIG.verify([row(K1)], B, '1.2.3', SIG.sign(K1.privateKeyPem, B, '1.2.3', { ...C, chain: [SIG.signRetire(KX.privateKeyPem, C)] }), C);
  ok(rx.ok && rx.trustAfter === null, 'the retirement of a key this device never trusted is inert');
  ok(JSON.stringify(SIG.parseFloor(SIG.floorText({ floor: '1.2.3', honoured: [rbv.sha256], at: 'x' }))) === JSON.stringify({ floor: '1.2.3', honoured: [rbv.sha256] }) && SIG.parseFloor('junk') === null, 'release-floor.json round-trips; junk is no floor');

  // ── ② THE HUB ──
  console.log('— ② the hub pushes only the signed release (another machine), the local proof (its own) —');
  const { DeviceManager } = require('../src/agentd/client.js');
  process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'hub-local-root');
  const hb = path.join(tmp, 'hub'); fs.mkdirSync(hb);
  const hubBundle = path.join(hb, 'agentd.js');
  fs.writeFileSync(hubBundle, '/* hub bundle */ module.exports = { VERSION: "9.9.9" };\n');
  const hubManifest = path.join(hb, 'agentd.manifest.json');
  // a fake daemon over the REAL Mux: answers hello at 0.0.1, records upgrade lines, answers with `answer(m)`
  let lines = [], answer = () => ({ op: 'upgrade-done' }), answered = 0;
  const srv = net.createServer((sock) => {
    let expect = 0, got = 0, last = null;
    const mux = new Mux(sock, {
      onControl: (m) => { if (m.op === 'hello') mux.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '0.0.1', capabilities: [], platform: 'linux' }); if (m.op === 'upgrade') { lines.push(m); last = m; expect = m.size; got = 0; } },
      onData: (chan, buf) => { got += buf.length; mux.credit(chan, buf.length); if (expect && got >= expect) { expect = 0; mux.control(answer(last)); answered++; } },
      onDead: () => {},
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const dialIn = () => new Promise((res, rej) => { const s = net.connect(srv.address().port, '127.0.0.1'); s.on('connect', () => res(s)); s.on('error', rej); });
  const hubRun = async (hooks = {}, ledger = null) => {
    const stream = await dialIn();
    const refused = [];
    const dm = new DeviceManager({ dataDir: hb, bundlePath: hubBundle, version: '1.1.1', log: () => {}, transport: { kind: 'stream', hostToken: 'vsht_x', getStream: () => stream }, onUpgradeRefused: (f, t, i) => refused.push([f, t, i]), ...(ledger ? { upgradeLedger: ledger } : {}), ...hooks });
    // judged on the event, never a fixed wait: connected (no push), or the fake daemon's answer to a push (+ the hub's reaction)
    const before = answered;
    const r = await Promise.race([dm.connect().then(() => 'connected', (e) => 'failed: ' + e.message), until(() => answered > before, 3000, 10).then(() => sleep(60)).then(() => 'answered')]);
    dm.stop(); try { stream.destroy(); } catch { }
    return { r, refused, dm };
  };
  lines = [];
  const u1 = await hubRun();
  ok(u1.r === 'connected' && lines.length === 0, `an UNSIGNED build is never pushed to another machine: no upgrade line, the link kept (${u1.r}, ${lines.length} lines)`);
  ok(u1.refused.length === 1 && u1.refused[0][0] === '0.0.1' && u1.refused[0][1] === '9.9.9' && u1.refused[0][2].code === 'unsigned-local-build' && u1.refused[0][2].by === 'system:device-upgrade', 'and the door hears it ONCE: refused(0.0.1 → 9.9.9, unsigned-local-build)', u1.refused);
  const direct = await new DeviceManager({ dataDir: hb, bundlePath: hubBundle, version: '1.1.1', log: () => {}, transport: { kind: 'stream', getStream: () => null } })._upgrade({ control: () => { throw new Error('sent'); }, data: () => { }, onControl: () => { } }).then(() => 'pushed', (e) => e.code);
  ok(direct === 'unsigned-local-build', `_upgrade itself refuses an unsigned build to another machine (THE door, not only the hello path) (${direct})`);
  const hubSigned = SIG.sign(K1.privateKeyPem, fs.readFileSync(hubBundle), '9.9.9', C);
  fs.writeFileSync(hubManifest, JSON.stringify(hubSigned));
  lines = [];
  const u2 = await hubRun();
  ok(lines.length === 1 && JSON.stringify(lines[0].sig) === JSON.stringify(hubSigned) && lines[0].version === '9.9.9' && !('localProof' in lines[0]), 'a SIGNED build is pushed WITH its release record (`sig` = the manifest) and no local proof', lines[0]);
  fs.writeFileSync(hubBundle, '/* hub bundle, rebuilt */ module.exports = { VERSION: "9.9.9" };\n');
  lines = [];
  const u3 = await hubRun();
  ok(lines.length === 0 && u3.refused[0]?.[2].code === 'unsigned-local-build', 'a rebuilt bundle whose bytes are not the signed ones is not pushed (the manifest names other bytes)');
  fs.writeFileSync(hubManifest, JSON.stringify(SIG.sign(K1.privateKeyPem, fs.readFileSync(hubBundle), '9.9.9', C)));
  // a device refusal: never pushed again for this version, and the door hears the code + key
  const { create: createDP } = require('../src/server/dial-pairing.js');
  const ledger = createDP({ rootDir: hb, AGENTD_DIR: hb, agentdHostToken: () => 'x', getHosts: () => null, getMounts: () => null, getMachineMounts: () => null, getPortForwards: () => null, getExitProxy: () => null }).upgradeLedgerFor('devR');
  answer = (m) => ({ op: 'upgrade-failed', version: m.version, code: 'bad-signature', keyId: K1.keyId, error: 'bad-signature: no' });
  lines = [];
  const r1 = await hubRun({}, ledger);
  const r2 = await hubRun({}, ledger);
  ok(lines.length === 1, `a DEVICE's bad-signature refusal is never pushed again (1 push over two dial-ins, not 3) (${lines.length})`);
  ok(r1.refused.length === 1 && r1.refused[0][2].code === 'bad-signature' && r1.refused[0][2].keyId === K1.keyId && r2.refused.length === 0 && ledger.get('9.9.9')?.gaveUp === true, 'the refusal reaches the door once with its code + key; the ledger gives up at once', { r1: r1.refused, r2: r2.refused });
  answer = (m) => ({ op: 'upgrade-failed', version: m.version, error: 'EPERM: rename' });
  const ledger2 = createDP({ rootDir: hb, AGENTD_DIR: hb, agentdHostToken: () => 'x', getHosts: () => null, getMounts: () => null, getMachineMounts: () => null, getPortForwards: () => null, getExitProxy: () => null }).upgradeLedgerFor('devE');
  lines = [];
  for (let i = 0; i < 4; i++) await hubRun({}, ledger2);
  ok(lines.length === 3, `CONTROL: a landing failure that is NOT a signature refusal keeps its 3 tries (${lines.length})`);
  // fix r2: a DOWNGRADE refusal is a refusal (pushed once, never again; the door hears the floor) …
  answer = (m) => ({ op: 'upgrade-failed', version: m.version, code: 'downgrade', floor: '9.9.10', keyId: K1.keyId, error: 'downgrade: older' });
  const ledger3 = createDP({ rootDir: hb, AGENTD_DIR: hb, agentdHostToken: () => 'x', getHosts: () => null, getMounts: () => null, getMachineMounts: () => null, getPortForwards: () => null, getExitProxy: () => null }).upgradeLedgerFor('devD');
  lines = [];
  const dg1 = await hubRun({}, ledger3); await hubRun({}, ledger3);
  ok(lines.length === 1 && dg1.refused[0]?.[2].code === 'downgrade' && dg1.refused[0][2].floor === '9.9.10' && ledger3.get('9.9.9')?.gaveUp === true, 'RED-1: a device\'s DOWNGRADE refusal — pushed once, never again; the door hears the code and the floor', dg1.refused);
  // … and a FIRST TRUST (upgrade-done {tofu}) reaches its own door, once, with the fingerprints
  answer = (m) => ({ op: 'upgrade-done', version: m.version, tofu: [K1.keyId, 'not-a-key'] });
  const trustedHeard = [];
  lines = [];
  await hubRun({ onUpgradeTrusted: (f, t, i) => trustedHeard.push([f, t, i]) });
  ok(trustedHeard.length === 1 && trustedHeard[0][0] === '0.0.1' && trustedHeard[0][1] === '9.9.9' && JSON.stringify(trustedHeard[0][2].keyIds) === JSON.stringify([K1.keyId]) && trustedHeard[0][2].by === 'system:device-upgrade', 'RED-2: a device\'s FIRST TRUST (upgrade-done {tofu}) reaches the door once, with the fingerprints (junk dropped)', trustedHeard);
  answer = () => ({ op: 'upgrade-done' });
  // the hub's OWN machine (local transport) + an unsigned build: the local proof, written into the daemon's state dir
  fs.unlinkSync(hubManifest);
  const fm = { onControl: () => { }, data: () => { }, control: (m) => { if (m.op === 'upgrade') { fm.line = m; setTimeout(() => fm.onControl({ op: 'upgrade-done' }), 5); } } };
  await new DeviceManager({ dataDir: hb, bundlePath: hubBundle, version: '1.1.1', log: () => {} })._upgrade(fm);
  const proofFile = path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'upgrade-proof');
  ok(fm.line && /^[0-9a-f]{64}$/.test(fm.line.localProof) && !('sig' in fm.line) && fs.readFileSync(proofFile, 'utf8') === fm.line.localProof && (fs.statSync(proofFile).mode & 0o777) === 0o600, 'its OWN machine\'s daemon gets an unsigned build with the local proof (the same 32 random bytes in <root>/state/upgrade-proof, 0600)');
  fs.writeFileSync(hubManifest, JSON.stringify(SIG.sign(K1.privateKeyPem, fs.readFileSync(hubBundle), '9.9.9', C)));
  const fm2 = { onControl: () => { }, data: () => { }, control: (m) => { if (m.op === 'upgrade') { fm2.line = m; setTimeout(() => fm2.onControl({ op: 'upgrade-done' }), 5); } } };
  await new DeviceManager({ dataDir: hb, bundlePath: hubBundle, version: '1.1.1', log: () => {} })._upgrade(fm2);
  ok(fm2.line && fm2.line.sig && fm2.line.sig.keyId === K1.keyId && /^[0-9a-f]{64}$/.test(fm2.line.localProof), 'a SIGNED build to its own daemon carries the record AND the local proof (its own daemon never depends on a pin)', fm2.line && Object.keys(fm2.line));
  fs.unlinkSync(hubManifest);
  srv.close();

  // ── ③ A REAL DAEMON ──
  console.log('— ③ a real daemon judges the bytes on disk before anything points at them —');
  const bundle = path.join(tmp, 'agentd-real.js');
  execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), ['src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', '--preserve-symlinks', `--outfile=${bundle}`, '--log-level=error'], { cwd: REPO });
  // int315: the tree bakes its first release key now (src/agentd/release-keys.js) — the legs below model builds of their own:
  // `bsrc` = the built bundle with that set EMPTIED (a build before any signed release: no baked key ⇒ no pin); the TOFU
  // leg bakes K1 into the same place
  const KEYS_RE = /\b(const|var|let) RELEASE_KEYS = \[[^\]]*\];/;
  const built = fs.readFileSync(bundle, 'utf8');
  const bsrc = built.replace(KEYS_RE, (_, kw) => `${kw} RELEASE_KEYS = [];`);
  ok(KEYS_RE.test(built) && /\b(const|var|let) RELEASE_KEYS = \[\];/.test(bsrc), '(the legs\' base: the built bundle with its baked release key set emptied)');
  const realVersion = (/\bVERSION\s*:\s*"(\d+\.\d+\.\d+)"/.exec(bsrc) || [])[1];
  // the "next release": a stub that records its own start (the re-exec) and exits — what a landed bundle runs
  const stub = (mark, v) => Buffer.from(`require('fs').writeFileSync(${JSON.stringify(mark)}, JSON.stringify({ argv: process.argv.slice(2), v: process.env.VIBESPACE_AGENTD_VERSION || null }));\n/* module.exports = { VERSION: "${v}" }; */\n`);
  const install = (name, src, trust, root = path.join(tmp, name), track = true) => {
    if (track) roots.push(root); // a root a daemon may run under (the finally ends them); the ssh road's fake hosts run none
    const inst = path.join(root, realVersion); fs.mkdirSync(inst, { recursive: true });
    fs.writeFileSync(path.join(inst, 'agentd.js'), src);
    fs.symlinkSync(inst, path.join(root, 'current'));
    fs.mkdirSync(path.join(root, 'state'), { recursive: true, mode: 0o700 });
    const token = 'vsht_' + crypto.randomBytes(12).toString('hex');
    fs.writeFileSync(path.join(root, 'state', 'token'), token, { mode: 0o600 });
    if (trust) fs.writeFileSync(path.join(root, 'state', 'trusted-keys.json'), SIG.trustText(trust, { from: 'test', at: 'x' }), { mode: 0o600 });
    return { root, state: path.join(root, 'state'), token, log: () => { try { return fs.readFileSync(path.join(root, 'state', 'agentd.log'), 'utf8'); } catch { return ''; } } };
  };
  const start = (d, extra = []) => { const c = spawn(process.execPath, [path.join(d.root, 'current', 'agentd.js'), ...extra], { detached: true, stdio: 'ignore', env: { ...process.env, VIBESPACE_AGENTD_ROOT: d.root, VIBESPACE_DEVICE_ROOT: d.root } }); c.unref(); return c; };
  const sockOf = async (d) => until(() => { try { const p = fs.readFileSync(path.join(d.state, 'socket-path'), 'utf8').trim(); return fs.existsSync(p) ? p : null; } catch { return null; } }, 8000);
  const link = (stream, token) => {
    const inbox = []; let waiters = [];
    const mux = new Mux(stream, { onControl: (m) => { inbox.push(m); waiters = waiters.filter((w) => !w(m)); }, onData: () => { }, onDead: () => { } });
    const wait = (pred, ms = 10000) => new Promise((res) => { const hit = inbox.find(pred); if (hit) { inbox.splice(inbox.indexOf(hit), 1); return res(hit); } const t = setTimeout(() => res({ op: 'TIMEOUT' }), ms); waiters.push((m) => { if (!pred(m)) return false; clearTimeout(t); inbox.splice(inbox.indexOf(m), 1); res(m); return true; }); });
    return { mux, wait, hello: () => { mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: token }); return wait((m) => m.op === 'hello-ack'); } };
  };
  const push = async (L, bytes, fields) => { L.mux.control({ op: 'upgrade', size: bytes.length, ...fields }); for (let o = 0; o < bytes.length; o += 65536) L.mux.data(1, bytes.subarray(o, Math.min(o + 65536, bytes.length))); return L.wait((m) => m.op === 'upgrade-done' || m.op === 'upgrade-failed', 15000); };
  const sockLink = async (d) => { const s = net.connect(await sockOf(d)); await new Promise((r, j) => { s.on('connect', r); s.on('error', j); }); const L = link(s, d.token); const ack = await L.hello(); return { L, s, ack }; };

  // every daemon of ③ is installed and STARTED at once (their boots overlap — the fast row's budget); each leg uses its own
  const A = install('dev-a', bsrc, [row(K1)]);
  const RKsrc = bsrc.replace(/\b(const|var|let) RELEASE_KEYS = \[\s*\];/, (_, kw) => `${kw} RELEASE_KEYS = [${JSON.stringify(row(K1))}];`);
  ok(RKsrc !== bsrc, '(TOFU leg: the bundle copy carries K1 as its baked release key)');
  const T = install('dev-tofu', RKsrc, null);
  const Bd = install('dev-local', bsrc, [row(K1)]);
  const N = install('dev-nopin', bsrc, null);
  const NT = install('dev-tofu-first', bsrc, null); // fix r2: no pin, no baked key — trusts the first validly signed release
  const RB = install('dev-rollback', bsrc, [row(K1)]); // fix r2: a signed rollback lands below its floor
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ noServer: true });
  let incoming = null;
  const hs = http.createServer((q, r) => { r.writeHead(404); r.end(); });
  hs.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => {
    const Ls = { data: [], close: [], error: [] };
    ws.on('message', (d) => Ls.data.forEach((f) => f(Buffer.isBuffer(d) ? d : Buffer.from(d))));
    ws.on('close', () => Ls.close.forEach((f) => f()));
    incoming = { write: (d) => { try { ws.send(d); return true; } catch { return false; } }, on: (ev, fn) => { Ls[ev]?.push(fn); }, destroy: () => { try { ws.close(); } catch { } } };
  }));
  await new Promise((r) => hs.listen(0, '127.0.0.1', r));
  const D = install('dev-dial', bsrc, [row(K1)]);
  fs.writeFileSync(path.join(D.state, 'dial.json'), JSON.stringify({ url: `ws://127.0.0.1:${hs.address().port}/api/device-dial?device=devS`, token: 'vsdt_' + crypto.randomBytes(8).toString('hex') }), { mode: 0o600 });
  const mutSrc = bsrc.replace(/const verdict = landingVerdict\(fs\.readFileSync\(tmp\), \{ version, sig, localProof \}, \{ dialed \}\);/, 'const verdict = { ok: true };');
  ok(mutSrc !== bsrc, '(mutant: the verdict call is replaced by { ok: true })');
  const M = install('dev-mutant', mutSrc, [row(K1)]);
  for (const d of [A, T, Bd, N, NT, RB, D, M]) start(d);
  const a = await sockLink(A);
  ok(a.ack.daemonVersion === realVersion, `the real daemon answers hello (${a.ack.daemonVersion})`);
  const refuse = async (what, version, bytes, fields, code, extra = () => true) => {
    const m = await push(a.L, bytes, { version, ...fields });
    const dir = path.join(A.root, String(version));
    const leftovers = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    ok(m.op === 'upgrade-failed' && m.code === code && leftovers.length === 0 && fs.realpathSync(path.join(A.root, 'current')).endsWith(realVersion) && extra(m), `${what} ⇒ upgrade-failed {code: ${code}}, the temp file deleted (${leftovers.length} files left), current unmoved`, m);
  };
  const next = stub(path.join(tmp, 'never.json'), '9.9.1');
  await refuse('UNSIGNED (no sig, no proof)', '9.9.1', next, {}, 'unsigned');
  await refuse('a BAD signature (K1 over other bytes)', '9.9.1', next, { sig: SIG.sign(K1.privateKeyPem, Buffer.from('other'), '9.9.1', C) }, 'bad-signature', (m) => m.keyId === K1.keyId);
  await refuse('an UNKNOWN key (a stranger\'s)', '9.9.1', next, { sig: SIG.sign(KX.privateKeyPem, next, '9.9.1', C) }, 'unknown-key');
  await refuse('a VERSION mismatch (signed 9.9.2, offered 9.9.1)', '9.9.1', next, { sig: SIG.sign(K1.privateKeyPem, next, '9.9.2', C) }, 'version-mismatch');
  await refuse('a MALFORMED record', '9.9.1', next, { sig: { v: 1, version: '9.9.1' } }, 'malformed');
  // fix r2 (RED-1): the replay of an OLDER validly signed release, a forged rollback, a rollback by the wrong key
  const flA = SIG.parseFloor(fs.readFileSync(path.join(A.state, 'release-floor.json'), 'utf8'));
  ok(flA && flA.floor === realVersion && (fs.statSync(path.join(A.state, 'release-floor.json')).mode & 0o777) === 0o600, `the daemon's start wrote its floor = the version it runs (${flA && flA.floor}, 0600)`);
  const oldRel = stub(path.join(tmp, 'never-old.json'), '1.0.0');
  await refuse(`RED-1: a VALIDLY signed OLDER release (the replay of 1.0.0 onto ${realVersion})`, '1.0.0', oldRel, { sig: SIG.sign(K1.privateKeyPem, oldRel, '1.0.0', C) }, 'downgrade', (m) => m.floor === realVersion);
  await refuse('a FORGED rollback (allowDowngradeTo added to a real old record)', '1.0.0', oldRel, { sig: { ...SIG.sign(K1.privateKeyPem, oldRel, '1.0.0', C), allowDowngradeTo: '1.0.0' } }, 'bad-signature');
  await refuse('a rollback signed by the WRONG key', '1.0.0', oldRel, { sig: SIG.sign(KX.privateKeyPem, oldRel, '1.0.0', { ...C, allowDowngradeTo: '1.0.0' }) }, 'unknown-key');
  const m5 = await push(a.L, next, { version: '../../escape', sig: SIG.sign(K1.privateKeyPem, next, '9.9.1', C) });
  ok(m5.op === 'upgrade-failed' && m5.code === 'malformed' && !fs.existsSync(path.join(A.root, '..', '..', 'escape')) && !fs.existsSync(path.join(tmp, 'escape')), 'a version that is a PATH (../../escape) is refused before any directory is made', m5);
  fs.writeFileSync(path.join(A.state, 'upgrade-proof'), 'a'.repeat(64), { mode: 0o600 });
  await refuse('a WRONG local proof (on the machine\'s own socket)', '9.9.1', next, { localProof: 'b'.repeat(64) }, 'unsigned', () => !fs.existsSync(path.join(A.state, 'upgrade-proof')));
  const ping = await (async () => { a.L.mux.control({ op: 'ping-info' }); return a.L.wait((m) => m.op === 'info', 5000); })();
  ok(ping.op === 'info' && ping.version === realVersion, 'after ten refusals the daemon still serves (ping-info answers, same version)');
  ok(/upgrade to 9\.9\.1 REFUSED — bad-signature: .* the bundle was deleted; still running/.test(A.log()) && /upgrade to 9\.9\.1 REFUSED — unknown-key/.test(A.log()), 'the device log says each refusal in one line (code + why + still running)');
  // the good one: K2 through the chain K1 → K2 — lands, repoints, re-execs into it (the stub records its start), pins K2
  const markA = path.join(tmp, 'reexec-a.json');
  const relA = stub(markA, '9.9.9');
  const mA = await push(a.L, relA, { version: '9.9.9', sig: SIG.sign(K2.privateKeyPem, relA, '9.9.9', { ...C, chain: [L12] }) });
  try { a.s.destroy(); } catch { } // the hub drops its link at upgrade-done (the hand-over's close waits for open links)
  const seenA = await until(() => fs.existsSync(markA) && JSON.parse(fs.readFileSync(markA, 'utf8')), 10000);
  ok(mA.op === 'upgrade-done' && seenA && seenA.v === '9.9.9', 'a GOOD signature (K2 through the chain K1 → K2) lands, and the daemon re-execs into it (the stub recorded its start as 9.9.9)', { mA, seenA });
  ok(fs.readFileSync(path.join(A.root, '9.9.9', 'agentd.js')).equals(relA) && fs.realpathSync(path.join(A.root, 'current')) === fs.realpathSync(path.join(A.root, '9.9.9')), 'the landed bytes are the signed ones and `current` points at them');
  const pinA = SIG.parseTrust(fs.readFileSync(path.join(A.state, 'trusted-keys.json'), 'utf8'));
  ok(JSON.stringify(pinA) === JSON.stringify([row(K2), row(K1)]) && (fs.statSync(path.join(A.state, 'trusted-keys.json')).mode & 0o777) === 0o600, 'the successor JOINS the pin (trusted-keys.json = [K2, K1], 0600) — K1 stays until a signed retirement (fix r2)', pinA);
  ok(/release signature ok \(key [0-9a-f]{16}, reached through the key chain\)/.test(A.log()), 'the device log says the signature checked (through the chain)');
  try { a.s.destroy(); } catch { }

  // TOFU: a fresh install with NO pin pins the keys IN its bundle at its first start (a bundle carrying K1 as its release key)
  const tPin = await until(() => { try { return SIG.parseTrust(fs.readFileSync(path.join(T.state, 'trusted-keys.json'), 'utf8')); } catch { return null; } }, 8000);
  ok(JSON.stringify(tPin) === JSON.stringify([row(K1)]) && /release keys pinned: [0-9a-f]{16} \(the first start of this install\)/.test(T.log()), 'TOFU: the first start pins the release keys shipped IN the bundle', tPin);
  const t = await sockLink(T);
  const relT = stub(path.join(tmp, 'never-t.json'), '9.9.7');
  const mT = await push(t.L, relT, { version: '9.9.7', sig: SIG.sign(KX.privateKeyPem, relT, '9.9.7', C) });
  ok(mT.op === 'upgrade-failed' && mT.code === 'unknown-key', 'TOFU: … and from then on a bundle signed by any other key is refused', mT);
  try { t.s.destroy(); } catch { }

  // the hub's OWN machine: the real DeviceManager (local transport) + an unsigned build ⇒ the local proof ⇒ lands + re-execs
  await sockOf(Bd);
  const markB = path.join(tmp, 'reexec-b.json');
  const hubB = path.join(tmp, 'hub-b'); fs.mkdirSync(hubB);
  fs.writeFileSync(path.join(hubB, 'agentd.js'), stub(markB, '9.9.8'));
  process.env.VIBESPACE_AGENTD_ROOT = Bd.root;
  const dmB = new DeviceManager({ dataDir: hubB, bundlePath: path.join(hubB, 'agentd.js'), version: '1.1.1', log: () => { } });
  dmB.connect().catch(() => { });
  const seenB = await until(() => fs.existsSync(markB) && JSON.parse(fs.readFileSync(markB, 'utf8')), 12000);
  dmB.stop();
  ok(seenB && seenB.v === '9.9.8' && /upgrade to 9\.9\.8: accepted on this machine's own socket \(the local proof\)/.test(Bd.log()) && !fs.existsSync(path.join(Bd.state, 'upgrade-proof')), 'the hub\'s OWN daemon takes an unsigned local build with the local proof (landed, re-exec\'d, the proof deleted)', { seenB, log: Bd.log().split('\n').filter((l) => /upgrade/.test(l)).slice(-3) });

  // THE STUCK SCENARIO: the hub's own daemon once ran an UNSIGNED build (no baked key ⇒ no pin) — a signed release by a key
  // it does not know is refused over the socket WITHOUT the proof, and lands WITH it (the hub owns this machine)
  const n = await sockLink(N);
  const markN = path.join(tmp, 'reexec-n.json');
  const relN = stub(markN, '9.9.4');
  const sigN = SIG.sign(K1.privateKeyPem, relN, '9.9.4', { ...C, keys: null });
  const mN1 = await push(n.L, relN, { version: '9.9.4', sig: sigN });
  ok(mN1.op === 'upgrade-failed' && mN1.code === 'unknown-key' && !fs.existsSync(path.join(N.state, 'trusted-keys.json')), 'a daemon with NO pin (it ran an unsigned build) refuses a signed record that names no key set to trust — without the proof (unknown-key)', mN1);
  fs.writeFileSync(path.join(N.state, 'upgrade-proof'), 'd'.repeat(64), { mode: 0o600 });
  const mN2 = await push(n.L, relN, { version: '9.9.4', sig: sigN, localProof: 'd'.repeat(64) });
  try { n.s.destroy(); } catch { } // the hub drops its link at upgrade-done (the hand-over's close waits for open links)
  const seenN = await until(() => fs.existsSync(markN), 8000);
  ok(mN2.op === 'upgrade-done' && seenN, '…and WITH the proof on its own socket it lands (the hub\'s own daemon never sticks on a pin)', mN2);
  try { n.s.destroy(); } catch { }

  // fix r2 (RED-2): a daemon that trusts NO key (no pin, nothing baked) TOFUs the FIRST validly signed release — never an
  // unsigned one, never a tampered key set — and tells the hub the fingerprint (upgrade-done {tofu})
  const nt = await sockLink(NT);
  const markNT = path.join(tmp, 'reexec-nt.json');
  const relNT = stub(markNT, '9.9.3');
  const mNT0 = await push(nt.L, relNT, { version: '9.9.3' });
  ok(mNT0.op === 'upgrade-failed' && mNT0.code === 'unsigned' && !fs.existsSync(path.join(NT.state, 'trusted-keys.json')), 'RED-2: a daemon that trusts NO key still refuses an UNSIGNED bundle (trust on first use needs a valid signature)', mNT0);
  const sigNT = SIG.sign(K1.privateKeyPem, relNT, '9.9.3', C);
  const mNT1 = await push(nt.L, relNT, { version: '9.9.3', sig: { ...sigNT, keys: [row(K1), row(KX)] } });
  ok(mNT1.op === 'upgrade-failed' && mNT1.code === 'bad-signature' && !fs.existsSync(path.join(NT.state, 'trusted-keys.json')), '…and a key slipped into the signed set (bad-signature, nothing pinned)', mNT1);
  const mNT2 = await push(nt.L, relNT, { version: '9.9.3', sig: sigNT });
  try { nt.s.destroy(); } catch { } // the hub drops its link at upgrade-done (the hand-over's close waits for open links)
  const seenNT = await until(() => fs.existsSync(markNT), 10000);
  const pinNT = (() => { try { return JSON.parse(fs.readFileSync(path.join(NT.state, 'trusted-keys.json'), 'utf8')); } catch { return null; } })();
  ok(mNT2.op === 'upgrade-done' && JSON.stringify(mNT2.tofu) === JSON.stringify([K1.keyId]) && seenNT && pinNT && pinNT.from === 'tofu' && JSON.stringify(SIG.parseTrust(JSON.stringify(pinNT))) === JSON.stringify([row(K1)]) && /TRUSTED ON FIRST USE/.test(NT.log()), 'RED-2: …the FIRST validly signed release lands (re-exec), upgrade-done names the fingerprint for the hub, the pin = its signed key set (from: tofu)', { mNT2, pinNT });

  // fix r2 (RED-1): a rollback the release key SIGNED lands below the floor; the floor stays; the rollback is spent
  const rbd = await sockLink(RB);
  const markRB = path.join(tmp, 'reexec-rb.json');
  const relRB = stub(markRB, '1.0.1');
  const sigRB = SIG.sign(K1.privateKeyPem, relRB, '1.0.1', { ...C, allowDowngradeTo: '1.0.1' });
  const mRB = await push(rbd.L, relRB, { version: '1.0.1', sig: sigRB });
  try { rbd.s.destroy(); } catch { }
  const seenRB = await until(() => fs.existsSync(markRB), 10000);
  const flRB = SIG.parseFloor(fs.readFileSync(path.join(RB.state, 'release-floor.json'), 'utf8'));
  ok(mRB.op === 'upgrade-done' && seenRB && flRB.floor === realVersion && flRB.honoured.includes(sigRB.sha256) && /a SIGNED ROLLBACK below the floor/.test(RB.log()), 'RED-1: the SIGNED rollback (allowDowngradeTo) lands below the floor and re-execs; the floor stays, the rollback is recorded as honoured (once)', { mRB, flRB });

  // a DIAL link never takes the local proof (the hub on the other end is not this machine)
  const st = await until(() => incoming, 10000);
  ok(!!st, 'the real daemon dialed in (a dial link)');
  if (st) {
    const L = link(st, D.token);
    const ack = await L.hello();
    fs.writeFileSync(path.join(D.state, 'upgrade-proof'), 'c'.repeat(64), { mode: 0o600 });
    const relD = stub(path.join(tmp, 'never-d.json'), '9.9.6');
    const mD = await push(L, relD, { version: '9.9.6', localProof: 'c'.repeat(64) });
    ok(ack.op === 'hello-ack' && mD.op === 'upgrade-failed' && mD.code === 'unsigned' && fs.readFileSync(path.join(D.state, 'upgrade-proof'), 'utf8') === 'c'.repeat(64), 'over a DIAL link a matching local proof is IGNORED (unsigned refused; the proof file not even read)', mD);
  }
  hs.close();

  // MUTANT: the verdict skipped (`{ ok: true }`) — the bad signature LANDS; the legs above would all go red
  const mm = await sockLink(M);
  const markM = path.join(tmp, 'reexec-m.json');
  const relM = stub(markM, '9.9.5');
  const mM = await push(mm.L, relM, { version: '9.9.5', sig: SIG.sign(K1.privateKeyPem, Buffer.from('other bytes'), '9.9.5', C) });
  try { mm.s.destroy(); } catch { } // the hub drops its link at upgrade-done (the hand-over's close waits for open links)
  const seenM = await until(() => fs.existsSync(markM), 8000);
  ok(mM.op === 'upgrade-done' && seenM, 'MUTANT CONTROL: without the verdict the BAD signature lands and runs — the refusal legs above are what see it', mM);
  try { mm.s.destroy(); } catch { }

  // ── ③b THE SSH ROAD (fix r2, verify-r1 RED-3): src/hosts.js installAgentd over a fake ssh (the remote step runs in sh with
  // HOME = a fake host) — the host's OWN agent judges what the hub ships (`--land-upgrade` = landBundle) ──
  console.log('— ③b the ssh road: the agent already on the host judges what the hub ships —');
  const { HostManager, installAgentdScript, installAgentdAnswer } = require('../src/hosts.js');
  const fbin = path.join(tmp, 'fake-bin'); fs.mkdirSync(fbin);
  fs.writeFileSync(path.join(fbin, 'ssh'), '#!/bin/sh\n# a fake ssh: drop the options up to --, run the remote step on the fake host (HOME); a real host has none of the test\'s roots\nH=""\nwhile [ "$#" -gt 0 ] && [ "$1" != "--" ]; do case "$1" in VsFakeHost=*) H="${1#VsFakeHost=}";; esac; shift; done; shift\nunset VIBESPACE_AGENTD_ROOT VIBESPACE_DEVICE_ROOT VIBESPACE_AGENTD_VERSION\nHOME="$H" exec sh -c "$1"\n', { mode: 0o755 });
  process.env.PATH = fbin + path.delimiter + path.dirname(process.execPath) + path.delimiter + process.env.PATH;
  const sshHosts = {}, events = [];
  const fakeHM = { get: (id) => sshHosts[id], sshArgs: (h) => ['-o', 'VsFakeHost=' + h.home], onAgentUpgrade: (ev, f) => events.push([ev, f]) };
  const sshHost = (name, agentSrc, trust) => { const home = path.join(tmp, 'ssh-' + name); sshHosts[name] = { name, home }; if (agentSrc != null) install('ssh-' + name, agentSrc, trust, path.join(home, '.vibespace', 'agentd'), false); else fs.mkdirSync(home, { recursive: true }); return path.join(home, '.vibespace', 'agentd'); };
  const sshHub = (name, bytes, record) => { const d = path.join(tmp, 'sshhub-' + name); fs.mkdirSync(d); const b = path.join(d, 'vibespace-agentd.js'); fs.writeFileSync(b, bytes); if (record) fs.writeFileSync(path.join(d, 'vibespace-agentd.manifest.json'), JSON.stringify(record)); return b; };
  const ship = (host, bundlePath) => HostManager.prototype.installAgentd.call(fakeHM, host, bundlePath, '0.0.0', 'vsht_' + crypto.randomBytes(12).toString('hex')).then((r) => r, (e) => ({ error: e.message }));
  const cur = (root) => { try { return path.basename(fs.realpathSync(path.join(root, 'current'))); } catch { return null; } };
  const relS = stub(path.join(tmp, 'never-s.json'), '9.9.2');
  const hubU = sshHub('unsigned', relS, null), hubS = sshHub('signed', relS, SIG.sign(K1.privateKeyPem, relS, '9.9.2', C));
  const relOld = stub(path.join(tmp, 'never-sold.json'), '1.0.0'), relRb = stub(path.join(tmp, 'never-srb.json'), '1.0.2');
  const hubOld = sshHub('old', relOld, SIG.sign(K1.privateKeyPem, relOld, '1.0.0', C)), hubRb = sshHub('rollback', relRb, SIG.sign(K1.privateKeyPem, relRb, '1.0.2', { ...C, allowDowngradeTo: '1.0.2' }));
  const hubX = sshHub('stranger', relS, SIG.sign(KX.privateKeyPem, relS, '9.9.2', C));
  const rFresh = sshHost('fresh', null), rU = sshHost('pinned-u', bsrc, [row(K1)]), rS = sshHost('pinned-s', bsrc, [row(K1)]), rT = sshHost('nopin', bsrc, null);
  const rL = sshHost('legacy', '/* an agent from before the release signature */\n', null), rC = sshHost('same', relS, null), rD = sshHost('floor', bsrc, [row(K1)]), rJ = sshHost('junkpin', bsrc, null);
  fs.writeFileSync(path.join(rJ, 'state', 'trusted-keys.json'), 'junk', { mode: 0o600 });
  const [sFresh, sU, sS, sT, sL1, sC, sD, sJ] = await Promise.all([ship('fresh', hubU), ship('pinned-u', hubU), ship('pinned-s', hubS), ship('nopin', hubS), ship('legacy', hubU), ship('same', hubU), ship('floor', hubOld), ship('junkpin', hubX)]);
  ok(sFresh.landed === 'fresh' && cur(rFresh) === '9.9.2' && fs.readFileSync(path.join(rFresh, '9.9.2', 'agentd.js')).equals(relS) && (fs.statSync(path.join(rFresh, 'state', 'token')).mode & 0o777) === 0o600, 'a FRESH host (nothing installed): the first install lands as is — the owner\'s add-host act, the installer\'s trust-on-first-use (token 0600)', sFresh);
  ok(sU.refused === 'unsigned-local-build' && sU.from === realVersion && cur(rU) === realVersion && !fs.existsSync(path.join(rU, '9.9.2')), 'an INSTALLED host + an UNSIGNED hub build ⇒ refused before anything moves (unsigned-local-build; current unmoved)', sU);
  ok(sS.landed === 'verified' && cur(rS) === '9.9.2' && fs.readFileSync(path.join(rS, '9.9.2', 'agentd.js')).equals(relS) && /begins — staged over ssh/.test(fs.readFileSync(path.join(rS, 'state', 'agentd.log'), 'utf8')) && /release signature ok \(key [0-9a-f]{16}\)/.test(fs.readFileSync(path.join(rS, 'state', 'agentd.log'), 'utf8')), 'an INSTALLED host + the SIGNED release ⇒ its own agent verified it (--land-upgrade) and landed it', sS);
  ok(sT.landed === 'verified' && JSON.stringify(sT.tofu) === JSON.stringify([K1.keyId]) && JSON.parse(fs.readFileSync(path.join(rT, 'state', 'trusted-keys.json'), 'utf8')).from === 'tofu', 'RED-2 over ssh: a host agent that trusts NO key takes the first signed release on first use and says so (tofu=…)', sT);
  ok(sL1.refused === 'unsigned-local-build' && cur(rL) === realVersion, 'a PRE-SIGNING agent on the host (no --land-upgrade) + an unsigned build ⇒ refused too', sL1);
  ok(sC.landed === 'current' && cur(rC) === realVersion, 'the same bytes already run there ⇒ nothing moves', sC);
  ok(sD.refused === 'downgrade' && sD.floor === realVersion && sD.from === realVersion && cur(rD) === realVersion && !fs.existsSync(path.join(rD, '1.0.0')), `RED-1 over ssh: the replay of an OLDER signed release ⇒ downgrade (floor ${realVersion}), nothing left`, sD);
  ok(sJ.refused === 'unknown-key' && !fs.existsSync(path.join(rJ, '9.9.2')), 'a host whose pin file EXISTS but does not parse never trusts a stranger on first use (unknown-key)', sJ);
  const [sL2, sR1] = await Promise.all([ship('legacy', hubS), ship('floor', hubRb)]); // two hosts at once (the fast row's budget)
  ok(sL2.landed === 'legacy' && cur(rL) === '9.9.2', 'a PRE-SIGNING agent on the host + the SIGNED release ⇒ lands unverified once (it has no verifier — like every pre-signing dial device)', sL2);
  const flD = SIG.parseFloor(fs.readFileSync(path.join(rD, 'state', 'release-floor.json'), 'utf8'));
  ok(sR1.landed === 'verified' && cur(rD) === '1.0.2' && flD.floor === realVersion && flD.honoured.length === 1, 'RED-1 over ssh: the SIGNED rollback lands below the floor (honoured once, the floor stays)', { sR1, flD });
  // the host's STANDING agent (still the old code) is then streamed the same bundle: re-landing the bytes `current` already
  // holds is not a second downgrade (it lands again — the standing agent catches up); any other copy of it would be
  const stgR = path.join(rD, 'state', 'again.js'); fs.writeFileSync(stgR, relRb);
  const mfR = path.join(rD, 'state', 'again.manifest.json'); fs.writeFileSync(mfR, JSON.stringify(SIG.sign(K1.privateKeyPem, relRb, '1.0.2', { ...C, allowDowngradeTo: '1.0.2' })));
  const again = spawnSync(process.execPath, [path.join(rD, realVersion, 'agentd.js'), '--land-upgrade', stgR, '--version', '1.0.2', '--manifest', mfR], { env: { ...process.env, HOME: path.dirname(path.dirname(rD)), VIBESPACE_AGENTD_ROOT: '', VIBESPACE_DEVICE_ROOT: '', VIBESPACE_AGENTD_VERSION: '' }, encoding: 'utf8', timeout: 20000 });
  ok(again.status === 0 && /^VS-AGENTD-LANDED 1\.0\.2 /.test(again.stdout) && cur(rD) === '1.0.2' && SIG.parseFloor(fs.readFileSync(path.join(rD, 'state', 'release-floor.json'), 'utf8')).honoured.length === 1, 'RED-1: the honoured rollback re-landed onto a `current` that already holds those bytes is NOT a second downgrade (the standing agent catches up; nothing moves)', again.stdout + again.stderr);
  fs.unlinkSync(path.join(rD, 'current')); fs.symlinkSync(path.join(rD, realVersion), path.join(rD, 'current')); // back on the real agent
  // a hostile hub skips the hub-side check: the host's agent is the fence (its CLI, a staged file signed over other bytes)
  const stg = path.join(rS, 'state', 'evil.js'); fs.writeFileSync(stg, relS);
  const evilM = path.join(rS, 'state', 'evil.manifest.json'); fs.writeFileSync(evilM, JSON.stringify(SIG.sign(K1.privateKeyPem, Buffer.from('other'), '9.9.5', C)));
  const lrP = new Promise((res) => { const c = spawn(process.execPath, [path.join(rS, realVersion, 'agentd.js'), '--land-upgrade', stg, '--version', '9.9.5', '--manifest', evilM], { env: { ...process.env, HOME: path.dirname(path.dirname(rS)), VIBESPACE_AGENTD_ROOT: '', VIBESPACE_DEVICE_ROOT: '', VIBESPACE_AGENTD_VERSION: '' } }); let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; }); c.on('close', (status) => res({ status, stdout: out, stderr: err })); });
  const [sR2, lr] = await Promise.all([ship('floor', hubRb), lrP]);
  ok(sR2.refused === 'downgrade' && /honoured once already/.test(sR2.why) && cur(rD) === realVersion, 'RED-1: …the same signed rollback a SECOND time ⇒ downgrade (a statement is spent once)', sR2);
  const ev = (e, host) => events.filter(([x, f]) => x === e && f.hostKey === host);
  ok(ev('refused', 'pinned-u')[0]?.[1].code === 'unsigned-local-build' && ev('refused', 'floor')[0]?.[1].code === 'downgrade' && ev('refused', 'floor')[0]?.[1].floor === realVersion && ev('refused', 'floor')[0]?.[1].machine === 'floor' && JSON.stringify(ev('trusted', 'nopin')[0]?.[1].keyIds) === JSON.stringify([K1.keyId]) && ev('refused', 'pinned-s').length === 0, 'the ssh road reaches the SAME door: refused (code, floor, machine) and trusted (the fingerprint)', events.map(([e, f]) => [e, f.hostKey, f.code || f.keyIds]));
  ok(lr.status === 3 && /^VS-AGENTD-REFUSED bad-signature from=\d+\.\d+\.\d+ key=[0-9a-f]{16}: /.test(lr.stdout) && !fs.existsSync(path.join(rS, '9.9.5')) && !fs.existsSync(stg), 'a staged bundle whose signature does not check ⇒ the host\'s agent refuses it (exit 3, one line), nothing made', lr.stdout + lr.stderr);
  const SC = installAgentdScript('9.9.2', true);
  ok(SC.indexOf('elif [ "$SIGNED" != 1 ]') > SC.indexOf('elif [ ! -e "$D/current" ]') && SC.indexOf('--land-upgrade') > SC.indexOf('elif [ "$SIGNED" != 1 ]') && (SC.match(/ln -sfn/g) || []).length === 2 && /SIGNED=0;/.test(installAgentdScript('9.9.2', false)), 'the remote step moves `current` itself only for a FRESH host or a PRE-SIGNING agent; any other replacement goes through the host\'s agent (--land-upgrade)');
  const pa = installAgentdAnswer('x\nVS-AGENTD-REFUSED downgrade from=2.0.0 floor=2.0.1 key=0123456789abcdef: older\n');
  ok(pa.refused === 'downgrade' && pa.from === '2.0.0' && pa.floor === '2.0.1' && pa.keyId === '0123456789abcdef' && installAgentdAnswer('VS-AGENTD-LANDED 2.0.2 from=2.0.1 tofu=0123456789abcdef,zz').tofu.length === 1 && installAgentdAnswer('nothing') === null && installAgentdAnswer('VS-AGENTD-FAILED EACCES: x').failed === 'EACCES: x', 'the remote step\'s one line parses (refused / landed + tofu / failed / anything else = unexpected)');

  // ── ④ THE WATCH ──
  console.log('— ④ the watch: ONE urgent For-you item per refusal —');
  const W = require('../src/server/device-upgrade-watch.js');
  const items = [];
  const todos = { add: (k, it) => { const r = { id: 'i' + items.length, status: 'open', sessionKey: k, ...it }; items.push(r); return r; }, get: (id) => items.find((x) => x.id === id), setStatus: (id, s) => { const x = items.find((y) => y.id === id); if (x) x.status = s; } };
  const wd = path.join(tmp, 'watch'); fs.mkdirSync(wd);
  const w = W.create({ userTodos: todos, dataDir: wd, tickMs: 0 });
  const f1 = w.onAgentUpgrade('refused', { hostKey: 'host-dial-x', machine: 'MacBook', from: '2.369.312', to: '2.369.313', code: 'bad-signature', keyId: K1.keyId, by: 'system:device-upgrade' });
  const f2 = w.onAgentUpgrade('refused', { hostKey: 'host-dial-x', machine: 'MacBook', from: '2.369.312', to: '2.369.313', code: 'bad-signature', keyId: K1.keyId, by: 'system:device-upgrade' });
  ok(f1.filed && !f2.filed && items.length === 1 && items[0].urgency === 'urgent' && items[0].origin === 'machines', 'a device refusal files ONE URGENT item per (device, version, code)', items);
  ok(/MacBook REFUSED an agent update \(2\.369\.312 → 2\.369\.313\)/.test(items[0].text) && items[0].detail.includes('bad-signature (key ' + K1.keyId + ')') && /pushed by system:device-upgrade/.test(items[0].detail) && items[0].i18n.detail.length === 2, 'its words name the machine, from → to, the code, the key and who pushed', items[0]);
  ok(w.rowOf('host-dial-x').refused === 'bad-signature', 'the machine row carries `refused` (its line)');
  w.onAgentUpgrade('matched', { hostKey: 'host-dial-x', version: '2.369.313' });
  ok(w.rowOf('host-dial-x') === null && items[0].status === 'open', 'a later match drops the row but NEVER retracts the refusal item (a fact, not a state)');
  const u0 = w.onAgentUpgrade('refused', { hostKey: 'host-dial-y', machine: 'Box', from: '1.0.0', to: '1.0.1', code: 'unsigned-local-build' });
  ok(!u0.filed && items.length === 1 && w.rowOf('host-dial-y').unsigned === true, 'this hub\'s own unsigned build: the row\'s line only, no item');
  const fd1 = w.onAgentUpgrade('refused', { hostKey: 'host-dial-z', machine: 'Laptop', from: '2.369.313', to: '2.369.300', code: 'downgrade', floor: '2.369.314', keyId: K1.keyId, by: 'system:device-upgrade' });
  const dItem = items[items.length - 1];
  ok(fd1.filed && dItem.urgency === 'urgent' && dItem.text === 'Laptop: someone pushed an OLDER agent version (2.369.300) — refused' && /runs 2\.369\.313 and has already run 2\.369\.314/.test(dItem.detail) && /pushed by system:device-upgrade/.test(dItem.detail) && w.rowOf('host-dial-z').refused === 'downgrade', 'RED-1: a downgrade refusal files the same URGENT kind in its own words (someone pushed an older version; who pushed)', dItem);
  const tr1 = w.onAgentUpgrade('trusted', { hostKey: 'host-dial-t', machine: 'Pi', from: '2.369.312', to: '2.369.313', keyIds: [K1.keyId], by: 'system:device-upgrade' });
  const tr2 = w.onAgentUpgrade('trusted', { hostKey: 'host-dial-t', machine: 'Pi', from: '2.369.312', to: '2.369.313', keyIds: [K1.keyId], by: 'system:device-upgrade' });
  const tItem = items[items.length - 1];
  ok(tr1.filed && !tr2.filed && tItem.urgency === 'urgent' && tItem.text === `Pi trusted a release key for the first time: ${K1.keyId}` && /re-pair it/.test(tItem.detail) && w.rowOf('host-dial-t') === null, 'RED-2: a first trust files ONE urgent item naming the fingerprint (and how to undo it); the row is untouched', tItem);
  ok(/if \(u\.refused === 'downgrade'\) return t\('Agent \{from\} — REFUSED \{to\}: an older version than one it already ran; see For you'/.test(fs.readFileSync(path.join(REPO, 'src/lib/exit-access-dialog.js'), 'utf8')), 'the machine row words a downgrade on its own');
  const ED = fs.readFileSync(path.join(REPO, 'src/lib/exit-access-dialog.js'), 'utf8');
  ok(/if \(u\.refused\) return t\('Agent \{from\} — REFUSED the update to \{to\}/.test(ED) && /if \(u\.unsigned\) return t\("Agent \{from\} — not updated to \{to\}/.test(ED), 'the machine row words both (agentUpgradeText)');
  for (const lang of ['zh', 'ja']) { const L = fs.readFileSync(path.join(REPO, `src/lib/i18n-${lang}.js`), 'utf8'); ok(L.includes('"{machine} REFUSED an agent update ({from} → {to}): its release signature did not check ({code})"') && L.includes('"Agent {from} — REFUSED the update to {to}: its release signature did not check ({code}); see For you"') && [W.refusedItemOf({ machine: 'm', from: '1.0.1', to: '1.0.0', code: 'downgrade' }), W.trustedItemOf({ machine: 'm', from: '1.0.0', to: '1.0.1', keyIds: [K1.keyId] })].every((x) => L.includes(JSON.stringify(x.i18n.text.key)) && x.i18n.detail.every((d) => L.includes(JSON.stringify(d.key)))) && L.includes('"Agent {from} — REFUSED {to}: an older version than one it already ran; see For you"'), `the words exist in ${lang} (fix r2's two items + the row line too)`); }

  // ── ⑤ THE RELEASE SCRIPTS ──
  console.log('— ⑤ the release scripts: sign / gen / the build step —');
  const R = path.join(tmp, 'release-repo');
  for (const f of ['scripts/sign-agentd.mjs', 'scripts/gen-release-key.mjs', 'scripts/release-key-io.mjs', 'scripts/agentd-release.mjs', 'src/agentd-signature.js']) { fs.mkdirSync(path.dirname(path.join(R, f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(R, f)); }
  fs.mkdirSync(path.join(R, 'data/bin'), { recursive: true });
  fs.writeFileSync(path.join(R, 'package.json'), JSON.stringify({ version: '3.0.1' }));
  fs.writeFileSync(path.join(R, 'data/bin/vibespace-agentd.js'), '/* agent */ module.exports = { VERSION: "3.0.1" };\n');
  const writeKeys = (keys, chain = []) => fs.writeFileSync(path.join(R, 'src/agentd/release-keys.js'), `module.exports = { RELEASE_KEYS: ${JSON.stringify(keys)}, KEY_CHAIN: ${JSON.stringify(chain)} };\n`);
  fs.mkdirSync(path.join(R, 'src/agentd'), { recursive: true }); writeKeys([]);
  const HOME = path.join(tmp, 'release-home'); fs.mkdirSync(HOME);
  const env0 = { PATH: process.env.PATH, HOME, LANG: 'C.UTF-8' };
  const run = (script, args = [], env = {}, input = '') => spawnSync(process.execPath, [path.join(R, 'scripts', script), ...args], { env: { ...env0, ...env }, input, encoding: 'utf8', timeout: 20000 });
  const g = run('gen-release-key.mjs');
  const keyFile = path.join(HOME, '.vibespace-release', 'agentd-ed25519.pem');
  const rowM = /\{ keyId: '([0-9a-f]{16})', publicKey: '([A-Za-z0-9+/=]+)' \},/.exec(g.stdout || '');
  ok(g.status === 0 && fs.existsSync(keyFile) && (fs.statSync(keyFile).mode & 0o777) === 0o600 && (fs.statSync(path.dirname(keyFile)).mode & 0o777) === 0o700 && !!rowM, 'gen-release-key: the private key at ~/.vibespace-release/agentd-ed25519.pem (0600 in 0700) and the public row printed', g.stdout + g.stderr);
  const pemBefore = fs.readFileSync(keyFile, 'utf8');
  const g2 = run('gen-release-key.mjs');
  ok(g2.status === 2 && /exists \(a release key is never overwritten/.test(g2.stderr) && fs.readFileSync(keyFile, 'utf8') === pemBefore, 'gen-release-key never overwrites a release key (exit 2, by name)');
  const ci = run('sign-agentd.mjs', [], { CI: 'true' });
  ok(ci.status === 2 && /refused — CI is set/.test(ci.stderr), 'sign-agentd refuses under CI (exit 2, by name)', ci.stderr);
  const ciG = run('gen-release-key.mjs', ['--out', path.join(HOME, 'k2.pem')], { CI: '1' });
  ok(ciG.status === 2 && /refused — CI is set/.test(ciG.stderr) && !fs.existsSync(path.join(HOME, 'k2.pem')), 'gen-release-key refuses under CI too');
  const un = run('sign-agentd.mjs');
  ok(un.status === 2 && /is not in src\/agentd\/release-keys\.js RELEASE_KEYS/.test(un.stderr), 'a key whose public half is not in release-keys.js is refused', un.stderr);
  writeKeys([{ keyId: rowM[1], publicKey: rowM[2] }]);
  fs.writeFileSync(path.join(R, 'data/auth.json'), '{}');
  const hubCo = run('sign-agentd.mjs');
  ok(hubCo.status === 2 && /data\/auth\.json exists: this checkout belongs to a running VibeSpace/.test(hubCo.stderr), 'a running instance\'s checkout is refused (data/auth.json)', hubCo.stderr);
  fs.unlinkSync(path.join(R, 'data/auth.json'));
  const inRepo = path.join(R, 'k.pem'); fs.copyFileSync(keyFile, inRepo); fs.chmodSync(inRepo, 0o600);
  const ir = run('sign-agentd.mjs', ['--key', inRepo]);
  ok(ir.status === 2 && /is inside the repository/.test(ir.stderr), 'a key inside the repository is refused', ir.stderr);
  fs.unlinkSync(inRepo);
  fs.chmodSync(keyFile, 0o644);
  const loose = run('sign-agentd.mjs');
  ok(loose.status === 2 && /readable by others \(mode 644\)/.test(loose.stderr), 'a key readable by others is refused', loose.stderr);
  fs.chmodSync(keyFile, 0o600);
  const envKey = run('sign-agentd.mjs', [], { HOME: path.join(tmp, 'nohome'), VIBESPACE_RELEASE_KEY: pemBefore, VIBESPACE_AGENTD_SIGNING_KEY: pemBefore, SIGN_KEY: keyFile });
  ok(envKey.status === 2 && /no release key at/.test(envKey.stderr), 'a key handed in through the ENVIRONMENT is never used (no file ⇒ refused)', envKey.stderr);
  const ss = run('sign-agentd.mjs');
  const man = (() => { try { return JSON.parse(fs.readFileSync(path.join(R, 'release/agentd/manifest.json'), 'utf8')); } catch { return null; } })();
  const rBytes = fs.readFileSync(path.join(R, 'data/bin/vibespace-agentd.js'));
  ok(ss.status === 0 && man && SIG.verify([{ keyId: rowM[1], publicKey: rowM[2] }], rBytes, '3.0.1', man, C).ok && fs.existsSync(path.join(R, 'data/bin/vibespace-agentd.manifest.json')), 'sign-agentd writes release/agentd/manifest.json that verifies (and the copy beside the bundle)', ss.stdout + ss.stderr);
  ok(man && JSON.stringify(man.keys) === JSON.stringify([{ keyId: rowM[1], publicKey: rowM[2] }]) && SIG.verify([], rBytes, '3.0.1', man, { ...C, tofu: true }).tofu === true, 'fix r2: the manifest SIGNS the release key set (RELEASE_KEYS) — a device that trusts no key can take it on first use');
  const rbBad = run('sign-agentd.mjs', ['--allow-downgrade-to', '3.0.0']);
  ok(rbBad.status === 2 && /--allow-downgrade-to 3\.0\.0 is not this bundle's version 3\.0\.1/.test(rbBad.stderr), 'sign-agentd --allow-downgrade-to naming another version is refused (exit 2, by name)', rbBad.stderr);
  const rbOk = run('sign-agentd.mjs', ['--allow-downgrade-to', '3.0.1']);
  const manRb = (() => { try { return JSON.parse(fs.readFileSync(path.join(R, 'release/agentd/manifest.json'), 'utf8')); } catch { return null; } })();
  ok(rbOk.status === 0 && /ROLLBACK devices that already ran a newer agent land 3\.0\.1 once/.test(rbOk.stdout) && manRb?.allowDowngradeTo === '3.0.1' && SIG.verify([{ keyId: rowM[1], publicKey: rowM[2] }], rBytes, '3.0.1', manRb, { ...C, floor: '3.0.2' }).rollback === true, 'fix r2: sign-agentd --allow-downgrade-to <this version> signs a ROLLBACK statement that lands below a floor', rbOk.stdout + rbOk.stderr);
  for (const f of ['sign-agentd.mjs', 'gen-release-key.mjs', 'release-key-io.mjs']) {
    const envReads = (fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8').match(/process\.env\.[A-Za-z_]+|process\.env\[/g) || []).filter((x) => x !== 'process.env.CI');
    ok(envReads.length === 0, `${f} reads no environment variable but CI (${envReads.join(', ') || 'none'})`);
  }
  const ar = spawnSync(process.execPath, [path.join(R, 'scripts/agentd-release.mjs')], { env: env0, encoding: 'utf8' });
  ok(ar.status === 0 && /the signed release \(key [0-9a-f]{16}/.test(ar.stdout) && fs.existsSync(path.join(R, 'data/bin/vibespace-agentd.manifest.json')), 'the build step: these bytes ARE the signed release ⇒ the manifest beside the bundle', ar.stdout);
  fs.writeFileSync(path.join(R, 'data/bin/vibespace-agentd.js'), '/* agent, edited */ module.exports = { VERSION: "3.0.1" };\n');
  const ar2 = spawnSync(process.execPath, [path.join(R, 'scripts/agentd-release.mjs')], { env: env0, encoding: 'utf8' });
  ok(ar2.status === 0 && /UNSIGNED local build/.test(ar2.stdout) && !fs.existsSync(path.join(R, 'data/bin/vibespace-agentd.manifest.json')), 'a source change without a signing: the build still succeeds, says UNSIGNED, and removes the copy (this hub pushes nothing)', ar2.stdout);
  const rot = run('gen-release-key.mjs', ['--rotate-from', keyFile, '--out', path.join(HOME, '.vibespace-release', 'agentd-ed25519-2.pem')]);
  const lk = /\{ keyId: '([0-9a-f]{16})', publicKey: '([^']+)', by: '([0-9a-f]{16})', sig: '([^']+)' \},/.exec(rot.stdout || '');
  ok(rot.status === 0 && lk && lk[3] === rowM[1], 'a rotation prints the KEY_CHAIN link signed by the old key', rot.stdout + rot.stderr);
  if (lk) {
    const K2pem = fs.readFileSync(path.join(HOME, '.vibespace-release', 'agentd-ed25519-2.pem'), 'utf8');
    const rec = SIG.sign(K2pem, rBytes, '3.0.1', { ...C, chain: [{ keyId: lk[1], publicKey: lk[2], by: lk[3], sig: lk[4] }] });
    ok(SIG.verify([{ keyId: rowM[1], publicKey: rowM[2] }], rBytes, '3.0.1', rec, C).viaChain === true, '…and a device pinned to the old key follows that link to the new one');
    ok(/RELEASE_KEYS \(BESIDE the old row — retire the old one later with --retire\)/.test(rot.stdout), 'fix r2: a rotation ADDS the row (the old key stays trusted until a retirement)');
    const before = fs.readdirSync(path.join(HOME, '.vibespace-release')).sort().join(',');
    const ret = run('gen-release-key.mjs', ['--retire', keyFile]);
    const re = /\{ retire: '([0-9a-f]{16})', sig: '([^']+)' \},/.exec(ret.stdout || '');
    const recR = re && SIG.sign(K2pem, rBytes, '3.0.1', { ...C, chain: [{ keyId: lk[1], publicKey: lk[2], by: lk[3], sig: lk[4] }, { retire: re[1], sig: re[2] }] });
    const vR = recR && SIG.verify([{ keyId: rowM[1], publicKey: rowM[2] }], rBytes, '3.0.1', recR, C);
    ok(ret.status === 0 && re && re[1] === rowM[1] && vR?.ok && JSON.stringify(vR.trustAfter.map((k) => k.keyId)) === JSON.stringify([lk[1]]) && fs.readdirSync(path.join(HOME, '.vibespace-release')).sort().join(',') === before, 'fix r2: gen-release-key --retire prints a KEY_CHAIN retirement signed by that key (writes nothing); a device drops the key on it', ret.stdout + ret.stderr);
  }
  const encOut = path.join(HOME, '.vibespace-release', 'enc.pem');
  const enc = run('gen-release-key.mjs', ['--encrypt', '--out', encOut], {}, 'a passphrase of twenty\n');
  const G = fs.readFileSync(path.join(REPO, 'scripts/gen-release-key.mjs'), 'utf8');
  ok(enc.status === 0 && /BEGIN ENCRYPTED PRIVATE KEY/.test(fs.readFileSync(encOut, 'utf8')) && /passphrase-encrypted/.test(enc.stdout) && /when stdin is NOT a terminal the FIRST\n\/\/ stdin line is the passphrase and there is no confirmation/.test(G) && /--encrypt \(USE IT on any machine that also runs a VibeSpace or agent sessions/.test(G), 'low ⑤: --encrypt from a non-terminal stdin takes the FIRST line (no confirmation) — and the header says so, and says to use it', enc.stdout + enc.stderr);
  const BUILD = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).scripts;
  ok(/esbuild src\/agentd\/agentd\.js [^&]*--preserve-symlinks[^&]*--outfile=data\/bin\/vibespace-agentd\.js/.test(BUILD['build:agentd']) && /&& node scripts\/agentd-release\.mjs$/.test(BUILD['build:agentd']) && BUILD['sign:agentd'] === 'npm run build:agentd && node scripts/sign-agentd.mjs', 'package.json: build:agentd builds with --preserve-symlinks (the same bytes in any checkout) and ends with the release check; sign:agentd exists');
  ok(fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8').includes('\ndata/bin/vibespace-agentd.manifest.json\n'), '.gitignore: the copy beside the bundle is never tracked (a clean seed after the image build)');
  ok(/rm -f "\$ROOT\/state\/trusted-keys\.json" "\$ROOT\/state\/release-floor\.json"/.test(fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.sh'), 'utf8')) && /Remove-Item \(Join-Path \$root 'state\\trusted-keys\.json'\)/.test(fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.ps1'), 'utf8')) && /Remove-Item \(Join-Path \$root 'state\\release-floor\.json'\)/.test(fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.ps1'), 'utf8')), 'both installers reset the pin AND the version floor: a (re-)pair is a new trust-on-first-use (the lost-key recovery)');

  // ── ⑥ THE CENSUS ──
  console.log('— ⑥ the census: the one writer of `current` is behind the verdict —');
  const AD = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  const fnOf = (sig) => { const a = AD.indexOf(sig); return a >= 0 ? AD.slice(a, AD.indexOf('\n}\n', a)) : ''; };
  const body = fnOf('function landBundle('), bu = fnOf('function beginUpgrade(');
  const at = (needle) => body.indexOf(needle);
  ok((AD.match(/repointCurrent\(/g) || []).length === 1 && (body.match(/repointCurrent\(fs, \{ root: ROOT, dir \}\);/g) || []).length === 1, 'agentd.js: repointCurrent is called ONCE in the whole daemon, inside landBundle (the ONE landing: the hub\'s stream and the ssh road)');
  const iV = at('const verdict = landingVerdict(fs.readFileSync(tmp), { version, sig, localProof }, { dialed });'), iNo = at('if (!verdict.ok) {'), iRet = body.indexOf('return verdict;', iNo), iRen = at('fs.renameSync(tmp, path.join(dir, selfName));'), iRep = at('repointCurrent(fs, { root: ROOT, dir });');
  ok(iV > 0 && iV < iNo && iNo < iRet && iRet < iRen && iRen < iRep, 'landBundle: the verdict over the bytes ON DISK, then a refusal returns — only after it the rename and the repoint', { iV, iNo, iRet, iRen, iRep });
  ok(bu.includes('const verdict = landBundle(tmp, dir, version, { sig, localProof }, { dialed });') && bu.indexOf('landBundle(') < bu.indexOf('reExecArgv(path.join(dir,') && bu.indexOf('if (!verdict.ok) {') < bu.indexOf("mux.control({ op: 'upgrade-done'"), 'beginUpgrade lands through landBundle and re-execs only after a yes');
  const lu = AD.slice(AD.indexOf("if (process.argv.includes('--land-upgrade')) {"), AD.indexOf("if (!process.argv.includes('--stdio') && !process.argv.includes('--dial-check') && !process.argv.includes('--land-upgrade')) {"));
  ok(lu.length > 200 && lu.includes('const v = landBundle(tmp, dir, version, { sig }, { dialed: true });') && !/repointCurrent|localProof|acquireSingleton/.test(lu), 'the ssh road\'s --land-upgrade lands through the same landBundle (never a local proof, no writer of its own) and never starts the daemon');
  ok(/if \(typeof version !== 'string' \|\| !SIG\.VERSION_RE\.test\(version\)\)/.test(bu) && bu.indexOf('SIG.VERSION_RE') < bu.indexOf('fs.mkdirSync(dir') && lu.indexOf('SIG.VERSION_RE.test(version)') < lu.indexOf('fs.mkdirSync(dir'), 'beginUpgrade and --land-upgrade: the version is checked BEFORE a directory is made');
  ok(AD.includes("serveConnection(ws, { dialed: true });") && AD.includes("function serveConnection(sock, { dialed = false } = {})") && AD.includes("upgrade = beginUpgrade(mux, msg, { dialed });"), 'the dial link is marked: the local proof is never honored on it');
  const others = fs.readdirSync(path.join(REPO, 'src/agentd')).filter((f) => f.endsWith('.js') && f !== 'agentd.js' && f !== 'reexec.js' && f !== 'client.js').filter((f) => /repointCurrent\(|'current'\)/.test(fs.readFileSync(path.join(REPO, 'src/agentd', f), 'utf8')));
  ok(others.length === 0, `no other device module touches \`current\` (${others.join(', ') || 'none'}); client.js installLocal is the HUB's own machine`);
  const CL = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  ok(/if \(!rel\.signed && this\._transport\.kind !== 'local'\) \{ const e = new Error/.test(CL) && CL.includes("const proof = this._transport.kind === 'local' ? this._writeLocalProof() : null;") && /\.\.\.\(rel\.signed \? \{ sig: rel\.manifest \} : \{\}\), \.\.\.\(proof \? \{ localProof: proof \} : \{\}\)/.test(CL), 'client.js _upgrade: no unsigned bytes to another machine; the record rides the control line, and the hub\'s OWN daemon always gets the local proof');
  ok(['src/server.js', 'server.js'].some((f) => fs.existsSync(path.join(REPO, f)) && /onUpgradeRefused: \(from, to, info\) => hosts\.onAgentUpgrade\?\.\('refused'/.test(fs.readFileSync(path.join(REPO, f), 'utf8'))) && /onUpgradeRefused: \(from, to, info\) => \{ const h = hosts\.findByDeviceId\(deviceId\); hosts\.onAgentUpgrade\?\.\('refused'/.test(fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8')) && /onUpgradeRefused: \(from, to, info\) => this\.onAgentUpgrade\?\.\('refused'/.test(fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8')), 'WIRING: the local daemon, a dial device and an ssh host pass the refusal to the same door');
  ok(/onUpgradeTrusted: \(from, to, info\) => \{ const h = hosts\.findByDeviceId\(deviceId\); hosts\.onAgentUpgrade\?\.\('trusted'/.test(fs.readFileSync(path.join(REPO, 'src/server/dial-pairing.js'), 'utf8')) && /onUpgradeTrusted: \(from, to, info\) => this\.onAgentUpgrade\?\.\('trusted'/.test(fs.readFileSync(path.join(REPO, 'src/hosts.js'), 'utf8')), 'WIRING (fix r2): a dial device and an ssh host pass a first trust to the same door (the local daemon never trusts on first use: it lands by the local proof)');
} finally {
  for (const r of roots) { try { endDaemonsAndWait(r); } catch { } }
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
