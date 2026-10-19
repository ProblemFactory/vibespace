#!/usr/bin/env node
// THE VAULT RECORD (lane vault-e2e-password — src/vault.js). Fast tier, no fs.
//   ① a new record: its shape, the production KDF, and no DEK / password anywhere in its bytes
//   ② unlock: the right password opens THE DEK; a wrong one is `wrong_password`; a damaged record is `corrupt` (the check
//      tells a wrong password apart from a damaged wrap — a flipped byte in the wrap with the RIGHT password is corrupt)
//   ③ THE KDF COST PIN: the params are N 2^17 · r 8 · p 2 and one derive measures ≥ 250 ms on this box
//   ④ zeroing: the KEK of every derive is zeros when the call returns; V.zero zeros
//   ⑤ change password: a new salt + wrap, the SAME DEK, the entries byte-identical; the old password stops opening
//   ⑥ entries: AAD = the name — an entry copied under another name never opens; a damaged entry is null
//   ⑦ THE STATE MACHINE + THE STATE TABLE: every row of keyVerdict
//   ⑧ the password door's shape: text only, ≥ 8 code points, ≤ 1024
//   ⑨ no secret in an answer: a refusal object carries a code only
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const V = require(path.join(REPO, 'src/vault.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const CHEAP = { N: 1024, r: 8, p: 1 };
const pw = (s) => Buffer.from(s, 'utf8');
const isZero = (b) => Buffer.isBuffer(b) && b.length > 0 && b.every((x) => x === 0);

console.log('① a new record');
{
  const { record, dek } = await V.setup(pw('correct horse battery'), { kdf: CHEAP, now: 1000 });
  ok(V.recordShapeOk(record) && record.v === 1 && record.kdf.name === 'scrypt' && Buffer.from(record.kdf.salt, 'base64').length === 16, 'the record is v1 scrypt with a 16-byte salt', JSON.stringify(record.kdf));
  ok(Buffer.isBuffer(dek) && dek.length === 32 && !isZero(dek), 'the DEK is 32 random bytes, handed to the caller only');
  const text = JSON.stringify(record);
  ok(![dek.toString('hex'), dek.toString('base64'), 'correct horse battery'].some((x) => text.includes(x)), 'neither the DEK nor the password appears in the record\'s bytes');
  ok(record.createdAt === 1000 && record.rotatedAt === null && record.idleLockHours === 0 && Object.keys(record.entries).length === 0, 'createdAt / rotatedAt / idle lock (off) / no entries');
  ok(V.VAULT_FILE === 'vault.json', 'the record file is data/vault.json');
}

console.log('② unlock: right, wrong, corrupt, not set up');
{
  const { record, dek } = await V.setup(pw('correct horse battery'), { kdf: CHEAP });
  const r1 = await V.unlock(record, pw('correct horse battery'));
  ok(r1.ok && r1.dek.equals(dek), 'the right password opens THE DEK');
  const r2 = await V.unlock(record, pw('correct horse battery!'));
  ok(!r2.ok && r2.code === 'wrong_password' && !('dek' in r2), 'a wrong password is wrong_password (no DEK)', JSON.stringify(r2));
  const flip = (b64) => { const b = Buffer.from(b64, 'base64'); b[0] ^= 1; return b.toString('base64'); };
  const r3 = await V.unlock({ ...record, wrapped: { ...record.wrapped, ct: flip(record.wrapped.ct) } }, pw('correct horse battery'));
  ok(!r3.ok && r3.code === 'corrupt', 'the RIGHT password over a damaged wrap is corrupt — not wrong_password', JSON.stringify(r3));
  const r4 = await V.unlock({ ...record, verifier: flip(record.verifier) }, pw('correct horse battery'));
  ok(!r4.ok && r4.code === 'corrupt', 'a damaged verifier is corrupt');
  const r5 = await V.unlock({ ...record, kdf: { ...record.kdf, N: 1000 } }, pw('correct horse battery'));
  ok(!r5.ok && r5.code === 'corrupt', 'a malformed record (N not a power of two) is corrupt before any derive');
  const r6 = await V.unlock({ ...record, wrapped: 'x' }, pw('x'));
  ok(!r6.ok && r6.code === 'corrupt', 'a record without a wrap is corrupt');
  ok((await V.unlock(null, pw('x'))).code === 'not_set_up', 'no record ⇒ not_set_up');
}

console.log('③ THE KDF COST PIN');
{
  ok(V.KDF.name === 'scrypt' && V.KDF.N === 1 << 17 && V.KDF.r === 8 && V.KDF.p === 2 && V.KDF.keyLen === 32, `production KDF = scrypt N 2^17 · r 8 · p 2 (${JSON.stringify(V.KDF)})`);
  const salt = crypto.randomBytes(16).toString('base64');
  const times = [];
  for (let i = 0; i < 3; i++) { const t0 = process.hrtime.bigint(); const k = await V.deriveKek(pw('measure me'), { ...V.KDF, salt }); times.push(Number(process.hrtime.bigint() - t0) / 1e6); V.zero(k); }
  times.sort((a, b) => a - b);
  ok(times[1] >= V.KDF_FLOOR_MS, `one derive at the production params costs ≥ ${V.KDF_FLOOR_MS} ms on this box (median ${times[1].toFixed(0)} ms of ${times.map((x) => x.toFixed(0)).join(' / ')})`);
  const { record } = await V.setup(pw('cost pin password'), {});
  ok(record.kdf.N === V.KDF.N && record.kdf.r === V.KDF.r && record.kdf.p === V.KDF.p, 'a setup with no kdf option writes the production params');
}

console.log('④ zeroing');
{
  const seen = [];
  const real = crypto.scrypt;
  crypto.scrypt = (p, s, l, o, cb) => real(p, s, l, o, (e, k) => { if (k) seen.push(k); cb(e, k); });
  try {
    const { record } = await V.setup(pw('zero me please'), { kdf: CHEAP });
    const r = await V.unlock(record, pw('zero me please'));
    await V.unlock(record, pw('not the password'));
    await V.changePassword(record, pw('zero me please'), pw('a new password'), {});
    ok(seen.length >= 5 && seen.every(isZero), `every KEK derived is zeros once the call returns (${seen.length} derives)`);
    ok(r.ok && !isZero(r.dek), 'the DEK handed to the caller is NOT zeroed (it is the caller\'s to hold)');
  } finally { crypto.scrypt = real; }
  const b = Buffer.from('secret');
  V.zero(b, null, 'x');
  ok(isZero(b), 'V.zero zeros a Buffer (and ignores anything else)');
}

console.log('⑤ change password keeps the entries');
{
  const { record, dek } = await V.setup(pw('first password'), { kdf: CHEAP });
  const k1 = crypto.randomBytes(32);
  record.entries['.accounts-key'] = V.wrapEntry(dek, '.accounts-key', k1);
  const c = await V.changePassword(record, pw('first password'), pw('second password'), { now: 5000 });
  ok(c.ok && c.record.rotatedAt === 5000 && c.record.kdf.salt !== record.kdf.salt, 'a new salt, rotatedAt set');
  ok(JSON.stringify(c.record.entries) === JSON.stringify(record.entries), 'the entries are byte-identical (only the DEK is re-wrapped)');
  ok((await V.unlock(c.record, pw('first password'))).code === 'wrong_password', 'the old password no longer opens it');
  const u = await V.unlock(c.record, pw('second password'));
  ok(u.ok && u.dek.equals(dek) && V.unwrapEntry(u.dek, '.accounts-key', c.record.entries['.accounts-key']).equals(k1), 'the new password opens the SAME DEK and the entry');
  ok((await V.changePassword(record, pw('wrong'), pw('second password'))).code === 'wrong_password', 'a wrong old password changes nothing');
}

console.log('⑥ entries');
{
  const { dek } = await V.setup(pw('entries password'), { kdf: CHEAP });
  const k = crypto.randomBytes(32), box = V.wrapEntry(dek, '.mounts-key', k);
  ok(V.unwrapEntry(dek, '.mounts-key', box).equals(k), 'an entry opens under its own name');
  ok(V.unwrapEntry(dek, '.channels-key', box) === null, 'the same box under another name never opens (AAD = the name)');
  ok(V.unwrapEntry(crypto.randomBytes(32), '.mounts-key', box) === null, 'another DEK never opens it');
  ok(V.unwrapEntry(dek, '.mounts-key', { ...box, tag: Buffer.alloc(16).toString('base64') }) === null && V.unwrapEntry(dek, 'x', null) === null, 'a damaged / missing box is null');
}

console.log('⑦ the state machine and the state table');
{
  ok(V.stateOf({ record: null, dek: null }) === 'not_set_up' && V.stateOf({ record: {}, dek: null }) === 'locked' && V.stateOf({ record: {}, dek: Buffer.alloc(32, 1) }) === 'unlocked', 'no record ⇒ not_set_up · record ⇒ locked · record + DEK ⇒ unlocked');
  const rows = [
    [{ state: 'not_set_up' }, 'legacy'],
    [{ state: 'not_set_up', hasEntry: true, legacyFile: true }, 'legacy'],
    [{ state: 'locked' }, 'vault_locked'],
    [{ state: 'locked', hasEntry: true, legacyFile: true, holdsCiphertext: false }, 'vault_locked'],
    [{ state: 'unlocked', hasEntry: true }, 'entry'],
    [{ state: 'unlocked', hasEntry: true, legacyFile: true }, 'entry'],
    [{ state: 'unlocked', legacyFile: true }, 'adopt'],
    [{ state: 'unlocked', holdsCiphertext: true }, 'key-missing'],
    [{ state: 'unlocked', holdsCiphertext: false }, 'mint'],
  ];
  const bad = rows.filter(([i, want]) => V.keyVerdict(i) !== want).map(([i, want]) => `${JSON.stringify(i)} → ${V.keyVerdict(i)} (want ${want})`);
  ok(!bad.length, `the state table: ${rows.length} rows — locked never reads, not_set_up is the key-file law, unlocked never mints over ciphertext`, bad.join('; '));
  ok(V.STATES.join() === 'not_set_up,locked,unlocked', 'three states');
}

console.log('⑧ the password door');
{
  ok(V.passwordOf(12345678).code === 'password_not_text' && V.passwordOf(null).code === 'password_not_text', 'not text ⇒ password_not_text');
  ok(V.passwordOf('1234567').code === 'password_too_short' && V.passwordOf('12345678').ok, '7 characters refused, 8 accepted');
  ok(V.passwordOf('密码密码密码密码').ok && V.passwordOf('密码密码密码密').code === 'password_too_short', 'code points, not bytes');
  ok(V.passwordOf('x'.repeat(1025)).code === 'password_too_long', 'over 1024 ⇒ password_too_long');
  const p = V.passwordOf('a fine password');
  ok(Buffer.isBuffer(p.pw) && p.pw.toString() === 'a fine password', 'an accepted password becomes a Buffer (zeroable)');
}

console.log('⑨ no secret in an answer');
{
  const { record } = await V.setup(pw('answer password'), { kdf: CHEAP });
  const r = await V.unlock(record, pw('answer passwore'));
  ok(JSON.stringify(r) === JSON.stringify({ ok: false, code: 'wrong_password' }), 'a refusal is { ok:false, code } and nothing else', JSON.stringify(r));
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
