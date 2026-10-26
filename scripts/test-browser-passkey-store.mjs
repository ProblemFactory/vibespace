#!/usr/bin/env node
// LANE PASSKEY-STORE-CORE (2026-10-12, owner GO "可以做一下authn存储，放在browser机制里"; docs/design-passkey-store.zh.md):
// THE PASSKEY STORE'S PURE RULES — fast tier, in-process (src/browser-passkey-store.js imports nothing):
//   ① a row / the file in and out (normalizeRow / normalizeStore: a plaintext key is never a row, one row per credential id)
//   ② publicRow NEVER carries the key (nor the whole credential id) — CONTROL: a copy whose publicRow spreads the row is RED
//   ③ seal / open round trip through the injected cipher (aes-256-gcm over node crypto): a wrong key / a flipped byte ⇒ null
//   ④ the sign count: pre-incremented before the release, reconciled after the event (never backwards)
//   ⑤ rpMatches: the registrable-suffix rule, positive and negative examples
//   ⑥ the table's edits (find / drop / policy / switch / a removed profile) and the card's data (P2's contract)
//   ⑦ lane passkey-sink (a kernel with `webauthn`): the row VibeSpace makes there (its shape), kernelFlags (UV only when the owner
//      decided THIS ceremony), signOrder, the three new reasons
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SRC = new URL('../src/browser-passkey-store.js', import.meta.url).pathname;
const PS = require(SRC);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 600) : '')); } return !!c; };

const C = PS.cipherOf(crypto, crypto.randomBytes(32));
const PKCS8 = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const CID = crypto.randomBytes(16).toString('base64url');
const row0 = { credentialId: CID, rpId: 'github.com', userHandle: crypto.randomBytes(8).toString('base64url'), userName: 'alice', displayName: 'Alice', keySealed: PS.seal(C, PKCS8), signCount: 5, createdBy: 'agent', bySession: 'bk-12345678', createdAt: 1000, lastUsedAt: 0, uses: 0, policy: 'ask' };

console.log('① a row / the file in and out');
{
  const r = PS.normalizeRow(row0);
  ok(r && JSON.stringify(PS.normalizeRow(r)) === JSON.stringify(r), 'a row round-trips (in = out)');
  ok(PS.normalizeRow({ ...row0, keySealed: PKCS8 }) === null, 'a PLAINTEXT key is never a row (the PURE side sees ciphertext only)');
  ok(PS.normalizeRow({ ...row0, credentialId: 'a b' }) === null && PS.normalizeRow({ ...row0, rpId: 'x/y' }) === null, 'a bad credential id / rpId is not a row');
  ok(PS.normalizeRow({ ...row0, policy: 'maybe' }).policy === PS.NEW_KEY_POLICY && PS.NEW_KEY_POLICY === 'ask', 'an unknown policy reads as the new-key default (ask — owner default ①)');
  ok(PS.normalizeRow({ ...row0, createdBy: 'root' }).createdBy === 'agent' && PS.normalizeRow({ ...row0, createdBy: 'human' }).createdBy === 'human', 'createdBy is agent | human');
  ok(PS.normalizeRow({ ...row0, userName: 'a\u0000b'.repeat(40) }).userName.length <= 64 && !/\u0000/.test(PS.normalizeRow({ ...row0, userName: 'a\u0000b' }).userName), 'names are bounded, control characters gone');
  const st = PS.normalizeStore({ profiles: { 'bp-1': { rows: [row0, row0, { junk: 1 }] }, '../x': { rows: [row0] }, 'bp-2': { agentsOff: true, rows: [] } } });
  ok(st.v === 1 && st.profiles['bp-1'].rows.length === 1 && !st.profiles['../x'] && st.profiles['bp-2'].agentsOff === true && st.profiles['bp-1'].agentsOff === PS.AGENTS_OFF_DEFAULT && PS.AGENTS_OFF_DEFAULT === false, 'the file: one row per credential id, bad profile ids dropped, the switch kept (default OFF — owner default ②)', st);
  ok(JSON.stringify(PS.normalizeStore(st)) === JSON.stringify(st) && JSON.stringify(PS.normalizeStore(null)) === '{"v":1,"profiles":{}}', 'the file round-trips; nothing reads as empty');
}

console.log('② publicRow never carries the key');
const leaks = (mod) => {
  const out = [];
  const pub = mod.publicRow(mod.normalizeRow(row0));
  const j = JSON.stringify(pub);
  if (j.includes(row0.keySealed) || /keySealed|privateKey/.test(j)) out.push('the sealed key');
  if (j.includes(CID)) out.push('the whole credential id');
  const card = mod.proposalCard({ id: 'pk-0000abcd', kind: 'sign-in', profileId: 'bp-1', rpId: 'github.com', rows: [mod.normalizeRow(row0)] });
  if (JSON.stringify(card).includes(row0.keySealed) || JSON.stringify(mod.proposalItem(card)).includes(row0.keySealed)) out.push('the card');
  return out;
};
{
  const pub = PS.publicRow(PS.normalizeRow(row0));
  ok(pub.id === CID.slice(0, 8) && pub.rpId === 'github.com' && pub.userName === 'alice' && pub.source === 'agent' && pub.policy === 'ask' && pub.signCount === 5, 'publicRow: id = the first 8 characters, site, user, source, policy, count', pub);
  ok(PS.publicRow(PS.normalizeRow({ ...row0, createdBy: 'human' })).source === 'you', 'a key the person registered reads as "you"');
  ok(leaks(PS).length === 0, 'neither the row, the card nor its For-you item carries the key or the whole id', leaks(PS));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pkstore-'));
  const src = fs.readFileSync(SRC, 'utf8');
  const needle = "return { id: str(r.credentialId).slice(0, ID_SHOWN),";
  fs.writeFileSync(path.join(dir, 'leak.js'), src.replace(needle, "return { ...r, id: str(r.credentialId).slice(0, ID_SHOWN),"));
  ok(src.includes(needle) && leaks(require(path.join(dir, 'leak.js'))).includes('the sealed key'), 'CONTROL: a copy whose publicRow spreads the row is RED (it leaks the sealed key)');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('③ seal / open');
{
  const s1 = PS.seal(C, PKCS8), s2 = PS.seal(C, PKCS8);
  ok(PS.open(C, { keySealed: s1 }) === PKCS8 && s1 !== s2 && !s1.includes(PKCS8.slice(0, 16)), 'open(seal(key)) = key; a fresh IV per seal; no plaintext in the blob');
  const other = PS.cipherOf(crypto, crypto.randomBytes(32));
  const flip = s1.slice(0, -3) + (s1.slice(-3, -2) === 'A' ? 'B' : 'A') + s1.slice(-2);
  ok(other.open(s1) === null && C.open(flip) === null && C.open('v1.junk') === null, 'another key / a flipped byte / junk ⇒ null (never a wrong key)');
  let threw = false; try { PS.cipherOf(crypto, Buffer.alloc(16)); } catch { threw = true; }
  ok(threw, 'a key that is not 32 bytes is refused');
}

console.log('④ the sign count');
{
  const r = PS.normalizeRow(row0);
  const b = PS.bumpSignCount(r);
  ok(b.row.signCount === 6 && b.loadAs === 5, 'bump: the store says 6 BEFORE the release, the authenticator is loaded with 5');
  const after = PS.reconcile(b.row, 6, 5000);
  ok(after.signCount === 6 && after.uses === 1 && after.lastUsedAt === 5000, 'reconcile with the event (6): equal, the use stamped');
  ok(PS.reconcile(b.row, 2, 1).signCount === 6 && PS.reconcile(b.row, 9, 1).signCount === 9, 'never backwards; a higher authenticator count wins');
}

console.log('⑤ rpMatches');
{
  const yes = [['https://github.com', 'github.com'], ['https://www.github.com/login', 'github.com'], ['http://localhost', 'localhost'], ['https://a.b.example.co.uk', 'example.co.uk'], ['https://login.example.com:8443/x', 'login.example.com']];
  const no = [['https://evilgithub.com', 'github.com'], ['http://github.com', 'github.com'], ['https://github.com', 'com'], ['https://x.github.io', 'github.io'], ['https://127.0.0.1', '127.0.0.1'], ['https://github.com.evil.io', 'github.com'], ['https://github.com', 'www.github.com'], ['javascript:alert(1)', 'github.com'], ['https://foo.co.uk', 'co.uk'], ['', 'github.com']];
  ok(yes.every(([o, rp]) => PS.rpMatches(o, rp)), 'positives: the host, a subdomain, http://localhost, a registrable domain under a 2-label suffix');
  ok(no.every(([o, rp]) => !PS.rpMatches(o, rp)), 'negatives: a look-alike, http, a single label, a public suffix, an IP, a suffix trick, a parent asking for a child, non-http', no.filter(([o, rp]) => PS.rpMatches(o, rp)));
}

console.log('⑥ the table and the card');
{
  const A = PS.normalizeRow(row0), B = PS.normalizeRow({ ...row0, credentialId: crypto.randomBytes(16).toString('base64url'), rpId: 'gitlab.com', createdBy: 'human' });
  let st = PS.withRow(PS.withRow(null, 'bp-1', A), 'bp-1', B);
  ok(PS.profileOf(st, 'bp-1').rows.length === 2 && PS.findRows(PS.profileOf(st, 'bp-1').rows, 'gitlab.com').length === 1 && PS.findRows(PS.profileOf(st, 'bp-1').rows, CID.slice(0, 8)).length === 1 && PS.findRows(PS.profileOf(st, 'bp-1').rows, CID.slice(0, 4)).length === 0, 'find by site, by the shown 8-character id (never a shorter prefix)');
  st = PS.setPolicy(st, 'bp-1', A.credentialId, 'yes');
  ok(PS.profileOf(st, 'bp-1').rows.find((r) => r.credentialId === A.credentialId).policy === 'yes' && PS.profileOf(PS.setPolicy(st, 'bp-1', A.credentialId, 'sometimes'), 'bp-1').rows[0].policy === 'yes', 'a policy is set (only yes | ask | no)');
  ok(PS.profileOf(PS.setAgentsOff(st, 'bp-1', true), 'bp-1').agentsOff === true, 'the switch is set');
  const d = PS.dropProfile(st, 'bp-1');
  ok(d.removed === 2 && !d.store.profiles['bp-1'], 'a removed profile takes its keys with it');
  const card = PS.proposalCard({ id: 'pk-0000abcd', kind: 'register', profileId: 'bp-1', profileLabel: 'Work', rpId: 'github.com', user: { name: 'alice', displayName: 'Alice' }, expiresAt: 9 });
  const item = PS.proposalItem(card);
  ok(card.type === 'passkey' && card.kind === 'register' && card.choices.join() === 'once,no' && /^[0-9a-f]{8}$/.test(card.shown) && PS.proposalCard({ id: 'pk-0000abcd', kind: 'register', profileId: 'bp-1', profileLabel: 'Work', rpId: 'github.com', user: { name: 'alice', displayName: 'Alice' }, expiresAt: 9 }).shown === card.shown, 'the register card: choices once | no, a stable `shown` digest', card);
  ok(PS.proposalCard({ id: 'pk-1', kind: 'sign-in', rpId: 'github.com' }).choices.join() === 'once,always,no,never', 'the sign-in card: once | always | no | never');
  ok(item.kind === 'action' && item.action.type === 'browser-proposal' && item.action.id === 'pk-0000abcd' && item.action.shown === card.shown && /Work wants to register a passkey on github\.com for alice/.test(item.text), 'its For-you item is the existing browser-proposal action (Approve = allow once)', item);
}
console.log('⑦ lane passkey-sink: a kernel with `webauthn` — the row VibeSpace makes, the UV rule, the row a sign-in signs with, the reasons');
{
  // the created row (src/server/browser-dialogs.js pkKernelCreate's shape): a server-made P-256 key, sealed; signCount 0; policy ask
  const WA = require('../src/webauthn-sign.js');
  const m = WA.makeCredential({ crypto, rpId: 'github.com', user: { id: Buffer.from('user-7') }, flags: { up: true, uv: true } });
  const made = { credentialId: m.credentialId.toString('base64url'), rpId: 'github.com', userHandle: m.userHandle.toString('base64url'), userName: 'alice', displayName: 'Alice', keySealed: PS.seal(C, m.privateKeyPkcs8.toString('base64')), signCount: 0, createdBy: 'agent', bySession: 'bk-12345678', createdAt: 5, policy: PS.NEW_KEY_POLICY };
  const nr = PS.normalizeRow(made);
  ok(nr && nr.credentialId.length === 43 && nr.userHandle === Buffer.from('user-7').toString('base64url') && nr.signCount === 0 && nr.policy === 'ask' && nr.createdBy === 'agent' && nr.uses === 0 && JSON.stringify(PS.normalizeRow(nr)) === JSON.stringify(nr),
    'the row VibeSpace makes on the kernel is a store row like any other (32-byte id → 43 b64url characters, userHandle = user.id, signCount 0, NEW_KEY_POLICY) — it round-trips', nr);
  ok(PS.open(C, nr) === m.privateKeyPkcs8.toString('base64') && crypto.createPrivateKey({ key: Buffer.from(PS.open(C, nr), 'base64'), format: 'der', type: 'pkcs8' }).asymmetricKeyDetails.namedCurve === 'prime256v1' && !JSON.stringify(PS.publicRow(nr)).includes(nr.keySealed),
    'its key opens to the PKCS#8 P-256 the signer made (the shape the virtual authenticator handed — one row type for both roads); publicRow never carries it');
  // the UV rule
  const rel = (o) => ({ verdict: 'release', uv: true, load: ['K1'], ...o });
  const F = [
    ['a get the owner answered once', PS.kernelFlags(rel(), { answer: 'once' }), { up: true, uv: true }],
    ['a get the owner answered always', PS.kernelFlags(rel(), { answer: 'always' }), { up: true, uv: true }],
    ['a get released by policy yes (automatic)', PS.kernelFlags(rel(), {}), { up: true, uv: false }],
    ['the person\'s own ceremony (a takeover)', PS.kernelFlags(rel(), { takeover: true }), { up: true, uv: true }],
    ['a create by the owner\'s one-use grant', PS.kernelFlags(rel({ load: [], consumeGrant: true, createdBy: 'agent' }), { kind: 'create' }), { up: true, uv: true }],
    ['an empty-authenticator release', PS.kernelFlags(rel({ uv: false, load: [] }), { userVerification: 'required' }), { up: true, uv: false }],
  ];
  for (const [name, f, want] of F) ok(f.up === want.up && f.uv === want.uv && f.be === false && f.bs === false && !f.ask, `kernelFlags: ${name} ⇒ UP${want.uv ? ' + UV' : ', no UV'} (never BE / BS — the key lives in this VibeSpace only)`, f);
  ok(PS.kernelFlags(rel(), { userVerification: 'required' }).ask === true && !PS.kernelFlags(rel(), { userVerification: 'required', answer: 'once' }).ask, 'a page that REQUIRES UV on an automatic release is asked (the card), never signed without it; once answered it signs with UV');
  // the row a sign-in signs with
  const R = (id, lastUsedAt, createdAt) => ({ credentialId: id, lastUsedAt, createdAt });
  const rows = [R('a', 5, 1), R('b', 9, 2), R('c', 0, 3)];
  ok(PS.signOrder(rows, ['a', 'b', 'c']).map((r) => r.credentialId).join() === 'b,a,c' && PS.signOrder(rows, ['a', 'c'], ['c', 'a']).map((r) => r.credentialId).join() === 'c,a' && PS.signOrder(rows, ['a']).map((r) => r.credentialId).join() === 'a',
    'signOrder: only the released rows; the page\'s allow list in its order, else the most recently used first');
  ok(['webauthn_alg_unsupported', 'webauthn_rp_mismatch', 'webauthn_key_locked'].every((w) => PS.REASONS.includes(w)) && ['no-grant', 'policy-no', 'declined', 'expired', 'profile-switch', 'rp-mismatch', 'none', 'withdrawn'].every((w) => PS.REASONS.includes(w)), 'REASONS: every existing one kept + the three kernel refusals by name');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
