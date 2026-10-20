#!/usr/bin/env node
// THE VAULT ENGINE (lane vault-e2e-password — src/server/vault-engine.js over src/secret-box.js). Fast tier: scratch data
// dirs with REAL-SHAPED key files (64 hex / 32 raw bytes, 0600) and ciphertext sealed under them before the setup.
//   A  not set up = the key-file law over the files, exactly as before (read, mint on an empty store)
//   B  setup = THE MIGRATION: every key file → an entry, read back, a `.sealed` marker, the file overwritten then unlinked
//      (a hard link sees the overwrite), the ledger row, no key byte in vault.json, every old ciphertext still opens
//   C  LOCKED ⇒ every read answers key-unreadable:vault_locked and touches NO file; the row facts say it; a process with
//      no engine over a sealed dir is locked too (never the legacy branch)
//   D  unlock ⇒ reads; a NEW store key is minted INTO the vault (no file); key-missing is kept (never a mint over ciphertext)
//   E  lock ⇒ the DEK and every unwrapped key zeroed; the password Buffer of every door zeroed
//   F  ROLLBACK: a fault at the record write / the read-back / a marker / a shred ⇒ every file back byte for byte, no
//      marker, no vault.json, not_set_up
//   G  RESUME: a seal interrupted after the record — the next unlock seals what matches, keeps what differs (and says so)
//   H  ADOPT: a key file restored after the setup is sealed in at its first read
//   I  a damaged vault.json ⇒ locked for good (never the files beside it)
//   J  pacing: 5 wrong ⇒ the next minute refused (the right password too); change keeps the keys; idle lock (off by default)
//   K  SIGTERM / SIGINT lock (the prepended listener), the broadcast on every change, the audit lines (no password)
//   M  A REFUSAL IS THE SIGNAL (lane vault-locked-refusal-notice): the PURE list keyed by the lock epoch (a new actor / a new
//      verb is fresh, a repeat is not), bounded at 50 actors × 8 verbs (the rest a count), names never ids; the engine's ONE
//      helper notes only while LOCKED, the store-key road notes itself (actor VibeSpace, the store as the verb), a fresh note
//      re-announces (facts().blocked = the strip's count) and runs onBlocked once; the unlock and a lock act clear it
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const V = require(path.join(REPO, 'src/vault.js'));
const SB = require(path.join(REPO, 'src/secret-box.js'));
const KF = require(path.join(REPO, 'src/key-file.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const ROOT = scratch('vault-engine');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const CHEAP = { N: 1024, r: 8, p: 1 };
const PW = 'correct horse battery staple';
const quiet = { log() {}, warn() {} };
let n = 0;
/** A data dir shaped like production's: five key files (four hex + the passkeys' raw 32 bytes) and a ciphertext under each. */
function world({ keys = ['.accounts-key', '.mounts-key', '.channels-key', '.app-secrets-key', 'browser-passkeys.key'] } = {}) {
  const dir = path.join(ROOT, 'd' + (++n));
  fs.mkdirSync(dir, { recursive: true });
  const files = {};
  for (const k of keys) {
    const raw = k === 'browser-passkeys.key';
    const key = crypto.randomBytes(32);
    const bytes = raw ? key : Buffer.from(key.toString('hex') + (k === '.mounts-key' ? '\n' : ''));   // one with a trailing newline (hand-written files have one)
    fs.writeFileSync(path.join(dir, k), bytes, { mode: 0o600 });
    files[k] = { key, bytes, ct: SB.encWith(key, 'secret under ' + k) };
  }
  return { dir, files };
}
const mk = (dir, o = {}) => VE.create({ dataDir: dir, kdf: CHEAP, log: quiet, idleTimer: false, ...o });
const boxOf = (dir, name, holds = true) => SB.secretBox(path.join(dir, name), { hasCiphertext: () => holds });
const isZero = (b) => Buffer.isBuffer(b) && b.every((x) => x === 0);
const refusalOf = (fn) => { try { fn(); return null; } catch (e) { return e; } };

console.log('A  not set up = the key-file law over the files');
{
  const { dir, files } = world();
  const e = mk(dir);
  ok(e.state() === 'not_set_up' && e.facts().state === 'not_set_up', 'no vault.json ⇒ not_set_up');
  ok(boxOf(dir, '.channels-key').dec(files['.channels-key'].ct) === 'secret under .channels-key', 'a key file is read as before (the migration window)');
  const nb = boxOf(dir, '.integrations-key', false);
  ok(nb.dec(nb.enc('x')) === 'x' && /^[0-9a-f]{64}$/.test(fs.readFileSync(path.join(dir, '.integrations-key'), 'utf8')), 'a store\'s FIRST key is minted as a file, as before (sealed in at setup)');
  ok(e.lock().code === 'vault_not_set_up' && e.facts().keys === 0, 'lock before setup ⇒ vault_not_set_up');
  e.close();
}

console.log('B  setup = THE MIGRATION');
let B = null;
{
  const { dir, files } = world();
  const link = path.join(ROOT, 'hardlink-of-accounts-key');
  fs.linkSync(path.join(dir, '.accounts-key'), link);
  const seen = [];
  const e = mk(dir, { bcast: (m) => seen.push(m) });
  const r = await e.setup(PW, { ip: '10.0.0.7' });
  ok(r.ok && r.sealed.length === 5 && e.state() === 'unlocked', 'setup seals the five key files and leaves the vault unlocked', JSON.stringify(r));
  const names = Object.keys(files);
  ok(names.every((k) => !fs.existsSync(path.join(dir, k))), 'every key file is gone');
  const markers = names.map((k) => { try { return JSON.parse(fs.readFileSync(path.join(dir, k + '.sealed'), 'utf8')); } catch { return null; } });
  ok(markers.every((m, i) => m && m.sealed === true && m.entry === names[i] && m.vault === 'vault.json'), 'a .sealed marker names each file\'s entry');
  const vt = fs.readFileSync(path.join(dir, 'vault.json'), 'utf8'), rec = JSON.parse(vt);
  ok(V.recordShapeOk(rec) && names.every((k) => rec.entries[k]) && !rec.sealing, 'vault.json holds an entry per key, no pending seal');
  ok(names.every((k) => !vt.includes(files[k].key.toString('hex')) && !vt.includes(files[k].key.toString('base64'))) && !vt.includes(PW), 'no key byte and no password in vault.json');
  ok((fs.statSync(path.join(dir, 'vault.json')).mode & 0o777) === 0o600, 'vault.json is 0600');
  const lk = fs.readFileSync(link);
  ok(lk.length === files['.accounts-key'].bytes.length && !lk.equals(files['.accounts-key'].bytes), 'the key file was OVERWRITTEN before the unlink (a hard link to it now holds other bytes)');
  const led = JSON.parse(fs.readFileSync(path.join(dir, 'migrations.json'), 'utf8'));
  ok(led.applied[`vault-seal-${rec.createdAt}`] && led.reports[`vault-seal-${rec.createdAt}`].keys === 5, 'the seal is a ledger-keyed one-shot (src/migration-runner.js)');
  ok(names.every((k) => boxOf(dir, k).dec(files[k].ct) === 'secret under ' + k), 'every ciphertext sealed BEFORE the setup still opens');
  ok(seen.some((m) => m.type === 'vault-state' && m.state === 'unlocked'), 'the setup is broadcast (vault-state)');
  ok((await e.setup('another password here')).code === 'already_set_up', 'a second setup ⇒ already_set_up');
  B = { dir, files, e };
}

console.log('C  LOCKED');
{
  const { dir, files, e } = B;
  ok(e.lock('test').ok && e.state() === 'locked', 'lock() ⇒ locked');
  const reads = { n: 0 };
  const real = { r: fs.readFileSync, x: fs.existsSync, s: fs.statSync };
  fs.readFileSync = (...a) => { reads.n++; return real.r(...a); }; fs.existsSync = (...a) => { reads.n++; return real.x(...a); }; fs.statSync = (...a) => { reads.n++; return real.s(...a); };
  let r;
  try { r = e.keyFor('.accounts-key', { keyFile: path.join(dir, '.accounts-key'), hasCiphertext: () => true, legacy: () => ({ ok: true, key: Buffer.alloc(32) }) }); } finally { Object.assign(fs, { readFileSync: real.r, existsSync: real.x, statSync: real.s }); }
  ok(r && !r.ok && r.code === KF.VAULT_LOCKED && reads.n === 0, `a locked keyFor answers ${KF.VAULT_LOCKED} and touches no file (${reads.n} fs calls)`);
  for (const k of Object.keys(files)) {
    const err = refusalOf(() => boxOf(dir, k).dec(files[k].ct));
    if (!(err && err.reason === KF.VAULT_LOCKED && err.code === 'key-unreadable')) { ok(false, `locked: ${k}`, String(err && err.message)); }
  }
  ok(true, 'every store\'s read is refused key-unreadable:vault_locked (the key-file law\'s transient refusal family)');
  ok(JSON.stringify(boxOf(dir, '.mounts-key').refusal()) === JSON.stringify({ code: KF.VAULT_LOCKED, file: '.mounts-key' }), 'the row fact says vault_locked');
  ok(boxOf(dir, '.mounts-key').hasKey() === true, 'hasKey: the vault holds it (no integration-key-missing while locked)');
  ok(SB.lawfulKey(path.join(dir, '.channels-key'), { hasCiphertext: () => true }).code === KF.VAULT_LOCKED, 'lawfulKey (the shim every store calls) ⇒ vault_locked');
  ok(/vault is locked/.test(KF.refusalWords(KF.VAULT_LOCKED, '.mounts-key')), 'the refusal in words says the vault is locked');
  // a process with NO engine over this dir (another process, a suite): locked, never the legacy branch
  const unreg = SB.registerVault(path.join(ROOT, 'elsewhere'), { keyFor: () => ({ ok: false, code: 'x' }), peek: () => null, hasEntry: () => false, state: () => 'locked', epoch: () => 0 });
  e.close(); unreg();
  ok(SB.lawfulKey(path.join(dir, '.accounts-key'), { hasCiphertext: () => true }).code === KF.VAULT_LOCKED, 'no engine registered + a vault.json beside ⇒ vault_locked (a sealed dir never falls back to the files)');
  const solo = path.join(ROOT, 'marker-only'); fs.mkdirSync(solo); fs.writeFileSync(path.join(solo, '.mounts-key.sealed'), '{}');
  ok(SB.lawfulKey(path.join(solo, '.mounts-key'), { hasCiphertext: () => false }).code === KF.VAULT_LOCKED && !fs.existsSync(path.join(solo, '.mounts-key')), 'a .sealed marker alone ⇒ vault_locked, nothing minted beside it');
}

console.log('D  unlock ⇒ reads; minted INTO the vault; key-missing kept');
{
  const { dir, files } = B;
  const e = mk(dir);
  ok(e.state() === 'locked', 'a new engine over a set-up dir starts LOCKED (default after every start)');
  ok((await e.unlock('wrong password!!')).code === 'wrong_password' && e.state() === 'locked', 'a wrong password leaves it locked');
  ok((await e.unlock(PW)).ok && e.state() === 'unlocked', 'the right password unlocks');
  ok(Object.keys(files).every((k) => boxOf(dir, k).dec(files[k].ct) === 'secret under ' + k), 'every store reads again');
  const nb = boxOf(dir, '.integrations-key', false);
  ok(nb.dec(nb.enc('fresh')) === 'fresh' && !fs.existsSync(path.join(dir, '.integrations-key')) && JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8')).entries['.integrations-key'], 'a store\'s first key is minted INTO the vault — no file');
  const mb = SB.secretBox(path.join(dir, 'other-store.key'), { hasCiphertext: () => true });
  const err = refusalOf(() => mb.enc('x'));
  ok(err && err.code === 'key-missing' && !JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8')).entries['other-store.key'], 'no entry + ciphertext ⇒ key-missing (never a new key over what is stored)');
  B.e = e;
}

console.log('D2 the unlock hooks (a boot step that ran while locked runs again)');
{
  const { dir } = B;
  const e = B.e;
  let ran = 0;
  e.onUnlock(() => { ran++; });
  e.onUnlock(() => { throw new Error('a hook that throws'); });
  e.onUnlock(async () => { throw new Error('a hook that rejects'); });
  e.lock();
  await e.unlock('not the password');
  ok(ran === 0, 'a failed unlock runs no hook');
  await e.unlock(PW);
  ok(ran === 1 && e.state() === 'unlocked', 'a successful unlock runs every hook once — a throwing / rejecting hook does not stop it');
  await e.unlock(PW);
  ok(ran === 1, 'an unlock of an unlocked vault runs nothing again');
  void dir;
}

console.log('E  zeroing');
{
  const { dir, files, e } = B;
  const zeroed = [];
  const realZero = V.zero;
  V.zero = (...bufs) => { for (const b of bufs) if (Buffer.isBuffer(b)) zeroed.push(b); return realZero(...bufs); };
  try { boxOf(dir, '.accounts-key').dec(files['.accounts-key'].ct); e.lock('zero-test'); } finally { V.zero = realZero; }
  ok(zeroed.length >= 2 && zeroed.every((b) => b.length === 32 && isZero(b)), `lock zeroes the DEK and every unwrapped key (${zeroed.length} buffers, all zeros)`);
  const seen = [];
  const real = crypto.scrypt;
  crypto.scrypt = (p, s, l, o, cb) => { seen.push(p); return real(p, s, l, o, cb); };
  try { await e.unlock('not it at all'); await e.unlock(PW); } finally { crypto.scrypt = real; }
  ok(seen.length === 2 && seen.every(isZero), 'the password Buffer of every unlock is zeros once the door returns');
  const copies = [];
  const k1 = e.keyFor('.mounts-key', { keyFile: path.join(dir, '.mounts-key') });
  copies.push(k1.key);
  ok(k1.ok && !isZero(k1.key), 'a reader gets a COPY of the key');
  const box = boxOf(dir, '.mounts-key');
  const realEnc = SB.encWith; let handed = null;
  ok(box.dec(box.enc('copy')) === 'copy', 'secretBox under a vault: the copy is used for one call');
  void handed; void realEnc;
}

console.log('F  ROLLBACK on an injected failure');
for (const [step, at] of [['write-record', ''], ['read-back', ''], ['marker', '.channels-key'], ['shred', '.app-secrets-key']]) {
  const { dir, files } = world();
  const before = Object.fromEntries(Object.keys(files).map((k) => [k, fs.readFileSync(path.join(dir, k))]));
  const e = mk(dir, { faultAt: (s, name) => {
    if (s !== step || name !== at) return;
    if (s === 'read-back') { fs.writeFileSync(path.join(dir, 'vault.json'), '{"v":1}'); return; }   // the disk answers something else
    throw Object.assign(new Error('injected ' + s), { code: 'EIO' });
  } });
  const r = await e.setup(PW);
  const back = Object.keys(files).every((k) => { try { return fs.readFileSync(path.join(dir, k)).equals(before[k]); } catch { return false; } });
  const markers = Object.keys(files).filter((k) => fs.existsSync(path.join(dir, k + '.sealed')));
  ok(!r.ok && r.code === 'migration_failed' && back && !markers.length && !fs.existsSync(path.join(dir, 'vault.json')) && e.state() === 'not_set_up',
    `a fault at ${step}${at ? ' (' + at + ')' : ''} ⇒ migration_failed, every file back byte for byte, no marker, no vault.json, not_set_up`, JSON.stringify({ r, back, markers }));
  ok(boxOf(dir, '.channels-key').dec(files['.channels-key'].ct) === 'secret under .channels-key', `  … and the stores read their files as before (${step})`);
  e.close();
}
{
  const { dir } = world({ keys: ['.accounts-key'] });
  fs.writeFileSync(path.join(dir, '.mounts-key'), 'not a key', { mode: 0o600 });
  const e = mk(dir);
  const r = await e.setup(PW);
  ok(!r.ok && r.code === 'migration_failed' && r.file === '.mounts-key' && r.why === 'key-malformed' && fs.existsSync(path.join(dir, '.accounts-key')) && !fs.existsSync(path.join(dir, 'vault.json')),
    'a damaged key file stops the setup BEFORE anything moves (it could never be shredded safely)', JSON.stringify(r));
  e.close();
}
{
  // verify r1 B3: THE DOUBLE FAULT — a shred fails after another landed AND that file cannot be put back: the record (read
  // back, every key proven) is KEPT and the vault stays set up; the unlock resumes the seal. The old branch unlinked it ⇒ every key gone.
  const { dir, files } = world({ keys: ['.accounts-key', '.mounts-key'] });
  const realWrite = fs.writeFileSync; let armed = true;   // ONE fault: the resume at the unlock must run clean
  const e = mk(dir, { faultAt: (s, nm) => { if (armed && s === 'shred' && nm === '.mounts-key') { armed = false; fs.writeFileSync = (f, ...a) => { if (path.basename(String(f)) === '.accounts-key') throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); return realWrite(f, ...a); }; throw Object.assign(new Error('injected shred'), { code: 'EIO' }); } } });
  const r = await e.setup(PW);
  fs.writeFileSync = realWrite;
  ok(!r.ok && r.code === 'migration_failed' && /\.accounts-key/.test(r.why) && fs.existsSync(path.join(dir, 'vault.json')) && e.state() === 'locked', 'a shred fault + a restore fault ⇒ migration_failed naming the file not put back, the record KEPT, the vault locked', JSON.stringify(r));
  ok((await e.unlock(PW)).ok && boxOf(dir, '.accounts-key').dec(files['.accounts-key'].ct) === 'secret under .accounts-key' && boxOf(dir, '.mounts-key').dec(files['.mounts-key'].ct) === 'secret under .mounts-key' && !fs.existsSync(path.join(dir, '.mounts-key')), '… and the unlock opens both keys and finishes the seal (nothing lost)');
  e.close();
}

console.log('G  RESUME an interrupted seal');
{
  const { dir, files } = world({ keys: ['.accounts-key', '.mounts-key'] });
  const e = mk(dir);
  await e.setup(PW); e.close();
  // the crash: the record says "sealing", the files are still there (one matches its entry, one does not)
  fs.writeFileSync(path.join(dir, '.accounts-key'), files['.accounts-key'].bytes, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, '.mounts-key'), crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  const rec = JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'vault.json'), JSON.stringify({ ...rec, sealing: { files: ['.accounts-key', '.mounts-key'], at: 1 } }));
  const e2 = mk(dir);
  await e2.unlock(PW);
  const audit = fs.readFileSync(path.join(dir, VE.AUDIT_FILE), 'utf8');
  ok(!fs.existsSync(path.join(dir, '.accounts-key')) && fs.existsSync(path.join(dir, '.mounts-key')) && /vault-seal-conflict/.test(audit) && !JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8')).sealing,
    'the next unlock seals the file that matches its entry, KEEPS the one that differs (audited vault-seal-conflict), and clears the pending list');
  ok(boxOf(dir, '.mounts-key').dec(files['.mounts-key'].ct) === 'secret under .mounts-key', 'the vault entry wins over a stray file for the store\'s reads');
  e2.close();
}

console.log('H  ADOPT a restored key file');
{
  const { dir, files } = world({ keys: ['.accounts-key'] });
  const e = mk(dir);
  await e.setup(PW);
  const k = crypto.randomBytes(32), ct = SB.encWith(k, 'restored');
  fs.writeFileSync(path.join(dir, '.channels-key'), k.toString('hex'), { mode: 0o600 });
  ok(boxOf(dir, '.channels-key').dec(ct) === 'restored' && !fs.existsSync(path.join(dir, '.channels-key')) && fs.existsSync(path.join(dir, '.channels-key.sealed'))
    && JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8')).entries['.channels-key'], 'a key file restored after the setup is sealed in at its first read (entry + marker, file shredded)');
  e.lock();
  ok(SB.lawfulKey(path.join(dir, '.channels-key'), { hasCiphertext: () => true }).code === KF.VAULT_LOCKED, '… and is locked with the rest');
  void files; e.close();
}

console.log('I  a damaged vault.json');
{
  const { dir } = world({ keys: ['.accounts-key'] });
  fs.writeFileSync(path.join(dir, 'vault.json'), '{ not json');
  const e = mk(dir);
  ok(e.state() === 'locked' && e.facts().corrupt === true, 'an unreadable vault.json ⇒ locked, corrupt: true');
  ok((await e.unlock(PW)).code === 'corrupt' && (await e.setup(PW)).code === 'already_set_up', 'unlock ⇒ corrupt; setup ⇒ already_set_up (a broken vault is never replaced)');
  ok(SB.lawfulKey(path.join(dir, '.accounts-key'), { hasCiphertext: () => true }).code === KF.VAULT_LOCKED, 'the key file beside a broken vault is NOT read (locked)');
  e.close();
}

console.log('J  pacing, change, idle lock');
{
  const { dir, files } = world({ keys: ['.accounts-key'] });
  let clock = 1_000_000;
  const e = mk(dir, { now: () => clock, signInPassword: (p) => p === 'the sign-in pw!' });
  ok((await e.setup('the sign-in pw!')).code === 'same_as_sign_in', 'the sign-in password is refused as the second password');
  ok((await e.setup('short')).code === 'password_too_short', 'a short password is refused');
  await e.setup(PW); e.lock();
  for (let i = 0; i < 5; i++) await e.unlock('wrong ' + i + ' password');
  const p = await e.unlock(PW);
  ok(!p.ok && p.code === 'paced' && p.retryInMs > 0 && p.retryInMs <= 60e3 && e.facts().failedTries === 5, '5 wrong ⇒ the next try is refused paced — the RIGHT password too', JSON.stringify(p));
  clock += 60e3 + 1;
  ok((await e.unlock(PW)).ok && e.facts().failedTries === 0, 'after the minute the right password unlocks and the count resets');
  ok((await e.change('wrong old one', 'brand new password')).code === 'wrong_password', 'change with a wrong old password ⇒ wrong_password');
  ok((await e.change(PW, PW)).code === 'same_password' && (await e.change(PW, 'the sign-in pw!')).code === 'same_as_sign_in', 'change refuses the same / the sign-in password');
  ok((await e.change(PW, 'brand new password')).ok, 'change ok');
  {
    // verify r1 B4: a change writes onto the record as it is NOW — a key minted and an idle lock set WHILE its derives ran survive
    const real = crypto.scrypt; crypto.scrypt = (p, s, l, o, cb) => setTimeout(() => real(p, s, l, o, cb), 30);
    const pending = e.change('brand new password', 'brand new password 2');
    await new Promise((r) => setTimeout(r, 5));
    const nb = boxOf(dir, '.race-key', false); const ct = nb.enc('during the change'); e.setIdleLock(3);
    let ch; try { ch = await pending; } finally { crypto.scrypt = real; }
    const rec = JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8'));
    ok(ch.ok && !!rec.entries['.race-key'] && rec.idleLockHours === 3 && nb.dec(ct) === 'during the change', 'a key minted and an idle lock set WHILE the password changed are kept (the lost-update race)', JSON.stringify({ ch, entry: !!rec.entries['.race-key'], idle: rec.idleLockHours }));
    e.setIdleLock(0); ok((await e.change('brand new password 2', 'brand new password')).ok, 'changed back');
  }
  {
    // verify r1 A1: a PARALLEL burst — the derives in flight count toward the pace (40 concurrent wrong passwords landed 40 derives)
    e.lock();
    const real = crypto.scrypt; let derives = 0; crypto.scrypt = (...a) => { derives++; return real(...a); };
    let rs; try { rs = await Promise.all(Array.from({ length: 12 }, (_, i) => e.unlock('burst wrong ' + i))); } finally { crypto.scrypt = real; }
    ok(derives === 5 && rs.filter((r) => r.code === 'paced').length === 7 && rs.filter((r) => r.code === 'wrong_password').length === 5, `12 concurrent wrong passwords ⇒ 5 derives, 7 refused paced before any landed (${derives} derives)`);
    clock += 60e3 + 1; ok((await e.unlock('brand new password')).ok && e.facts().failedTries === 0, 'after the minute the right password unlocks');
  }
  e.lock();
  ok((await e.unlock(PW)).code === 'wrong_password' && (await e.unlock('brand new password')).ok, 'the old password stops, the new one opens');
  ok(boxOf(dir, '.accounts-key').dec(files['.accounts-key'].ct) === 'secret under .accounts-key', 'the keys are unchanged by a password change');
  clock += 1000 * 3600e3; e.idleTick();
  ok(e.state() === 'unlocked' && e.facts().idleLockHours === 0, 'the idle lock is OFF by default (1000 h later, still unlocked)');
  ok(e.setIdleLock(2).ok && e.setIdleLock(1.5).code === 'bad_hours' && e.setIdleLock(721).code === 'bad_hours', 'the idle lock is whole hours 0..720');
  e.touch(); clock += 2 * 3600e3 - 1; e.idleTick();
  ok(e.state() === 'unlocked', 'just under 2 h idle ⇒ still unlocked');
  clock += 2; e.idleTick();
  ok(e.state() === 'locked', '2 h with no person\'s input ⇒ locked');
  e.close();
}

console.log('K  signals, broadcast, audit');
{
  const { dir } = world({ keys: ['.accounts-key'] });
  const seen = [], logs = [];
  const e = mk(dir, { bcast: (m) => seen.push(m), signals: true, log: { log: (m) => logs.push(m), warn: (m) => logs.push(m) } });
  await e.setup(PW, { ip: '192.0.2.9' });
  await e.lock(); await e.unlock('a wrong password', { ip: '192.0.2.10' }); await e.unlock(PW, { ip: '192.0.2.10' });
  const first = process.listeners('SIGTERM')[0];
  first();
  ok(e.state() === 'locked', 'the FIRST SIGTERM listener (prepended) locks the vault before the hub\'s own shutdown');
  await e.unlock(PW); process.listeners('SIGINT')[0](); ok(e.state() === 'locked', 'SIGINT locks it too');
  ok(['unlocked', 'locked'].every((s) => seen.some((m) => m.type === 'vault-state' && m.state === s)) && seen.every((m) => !JSON.stringify(m).includes(PW)), 'every change is broadcast as vault-state (no secret in it)');
  const audit = fs.readFileSync(path.join(dir, VE.AUDIT_FILE), 'utf8');
  ok(/"event":"vault-unlock-failed"[^\n]*"ip":"192\.0\.2\.10"/.test(audit) && /"event":"vault-set-up"/.test(audit) && /"event":"vault-unlocked"/.test(audit), 'the audit has the failure with its address, the setup and the unlock');
  ok(!audit.includes(PW) && !audit.includes('a wrong password') && !logs.join('\n').includes(PW) && !logs.join('\n').includes('a wrong password'), 'no password — right or wrong — in the audit or the log');
  ok((fs.statSync(path.join(dir, VE.AUDIT_FILE)).mode & 0o777) === 0o600, 'the audit file is 0600');
  e.close();
  for (const sig of ['SIGTERM', 'SIGINT']) for (const l of process.listeners(sig)) process.removeListener(sig, l);
}

console.log('L  startedAt names the boot (lane vault-relock-door) \u2014 the open tab tells a RESTART from a lock act by it');
{
  const { dir } = world();
  let clock = 1700000000000;
  const e = mk(dir, { now: () => clock });
  const at0 = e.facts().startedAt;
  ok(typeof at0 === 'number' && at0 === 1700000000000, 'facts().startedAt = the engine\'s construction time (ms)', String(at0));
  clock += 5000; await e.setup(PW, {});
  ok(e.state() === 'unlocked' && e.facts().startedAt === at0, 'a setup does not change startedAt (the same boot)');
  clock += 5000; e.lock('test');
  ok(e.state() === 'locked' && e.facts().startedAt === at0, 'a lock does not change startedAt (a lock act is not a restart)');
  clock += 5000; await e.unlock(PW);
  ok(e.state() === 'unlocked' && e.facts().startedAt === at0, 'an unlock does not change startedAt');
  clock += 9000;
  const e2 = mk(dir, { now: () => clock });
  ok(e2.facts().startedAt === clock && e2.facts().startedAt !== at0, 'a NEW engine over the same dir (a restart) \u21d2 a new startedAt (same bundle, a different process \u2014 the open tab re-asks)', JSON.stringify({ at0, at1: e2.facts().startedAt }));
  e2.close();
}

console.log('M  A REFUSAL IS THE SIGNAL (lane vault-locked-refusal-notice) — who a vault_locked refusal stopped, keyed by the lock epoch');
{
  const VB = require(path.join(REPO, 'src/vault-blocked.js'));
  // the PURE list
  const L = VB.createBlocked();
  ok(L.note({ actor: 'Lane one', verb: 'vibespace-api conversations.rename', at: 1, epoch: 3 }).fresh === true, 'a first refusal of an actor is fresh (the owner reads something new)');
  ok(L.note({ actor: 'Lane one', verb: 'vibespace-api conversations.rename', at: 2, epoch: 3 }).fresh === false && L.summary().actors[0].n === 2 && L.summary().refusals === 2, 'the same actor × verb again is NOT fresh — counted on its row (a door refusing every second refreshes nothing)');
  ok(L.note({ actor: 'Lane one', verb: 'device link', at: 3, epoch: 3 }).fresh === true && L.summary().actors[0].verbs.join('|') === 'vibespace-api conversations.rename|device link', 'a NEW verb of the same actor is fresh (one row, its verbs)');
  ok(L.note({ actor: 'Lane two', verb: 'x', at: 4, epoch: 4 }).fresh === true && L.summary().count === 1 && L.summary().epoch === 4, 'KEYED BY THE LOCK EPOCH: a note from another epoch starts the list afresh');
  for (const id of ['sess-1a2b3c4d', 'claude:3f0e9c1a-77aa-4b1c-9d2e-0123456789ab', '3f0e9c1a-77aa-4b1c-9d2e-0123456789ab', 'host-0123456789abcdef', 'dial-mac01', '0123456789abcdef0123', '', '   '])
    ok(VB.actorName(id, 'a conversation') === 'a conversation', `never a bare id: ${JSON.stringify(id)} ⇒ the fallback name`);
  ok(VB.actorName('  Lane\n  foo  ') === 'Lane foo' && VB.actorName('x'.repeat(200)).length === 80, 'a name is one line, ≤ 80 characters');
  const B = VB.createBlocked();
  let freshN = 0;
  for (let i = 0; i < 60; i++) if (B.note({ actor: `caller ${i}`, verb: 'v', at: i, epoch: 1 }).fresh) freshN++;
  const bs = B.summary();
  ok(bs.count === VB.MAX_ACTORS && bs.more === 10 && freshN === VB.MAX_ACTORS + 1 && bs.refusals === 60, `BOUNDED: ${VB.MAX_ACTORS} actors kept, the rest a count (more = 10); only the first refusal past the table is fresh`, JSON.stringify({ count: bs.count, more: bs.more, freshN }));
  const V9 = VB.createBlocked();
  const vf = []; for (let i = 0; i < 11; i++) vf.push(V9.note({ actor: 'one', verb: `verb ${i}`, epoch: 1 }).fresh);
  ok(V9.summary().actors[0].verbs.length === VB.MAX_VERBS && V9.summary().actors[0].moreVerbs === 3 && vf.filter(Boolean).length === VB.MAX_VERBS + 1, `≤ ${VB.MAX_VERBS} verbs a row, the rest a count (one fresh note past the bound)`);
  const W = VB.createBlocked();
  W.note({ actor: VB.HUB, verb: 'the accounts store', epoch: 1 });
  for (const a of ['Lane A', 'Lane B', 'mac-mini', 'Lark — Inbox', 'Lane E']) W.note({ actor: a, verb: 'v', epoch: 1 });
  const iw = VB.itemWords(W.summary());
  ok(iw.who.startsWith('Lane A (v) · Lane B (v) · mac-mini (v) · Lark — Inbox (v)') && iw.who.endsWith(' · …') && iw.lines.length === 6 && iw.lines[5].who === VB.HUB, 'the item’s words: the named callers first (≤ 4 on its line, then …), VibeSpace’s own reads last; one detail line each', JSON.stringify(iw));
  ok(VB.itemWords(bs).lines.length === VB.DETAIL_ROWS && VB.itemWords(bs).moreActors === VB.MAX_ACTORS - VB.DETAIL_ROWS && VB.itemWords(bs).moreRefusals === 10, '… bounded too: ≤ 11 detail lines, the rest counted (the store keeps ≤ 12 i18n lines)');
  ok(/the user has already been told/.test(VB.AGENT_WORDS) && /do not ask them to unlock it or for its password/.test(VB.AGENT_WORDS) && VB.agentWords('x waits').startsWith('the vault is locked — x waits; the user has already been told'), 'THE words toward an agent: the user was already told — never ask them to unlock');

  // the engine
  const { dir } = world();
  const sent = [];
  const e = mk(dir, { bcast: (m) => sent.push(m) });
  const runs = [];
  e.onBlocked((s) => runs.push(s));
  ok(e.blocked('Lane one', 'v') === false && e.blockedSummary().count === 0, 'NOT SET UP: the helper notes nothing (only a LOCKED vault refuses by this code)');
  await e.setup(PW, {});
  ok(e.blocked('Lane one', 'v') === false && e.facts().blocked === 0, 'UNLOCKED: the helper notes nothing');
  e.lock('door');
  sent.length = 0;
  const box = boxOf(dir, '.accounts-key');
  const err = refusalOf(() => box.dec(SB.encWith(crypto.randomBytes(32), 'x')));
  const s1 = e.blockedSummary();
  ok(err && err.reason === KF.VAULT_LOCKED && s1.count === 1 && s1.actors[0].actor === VB.HUB && s1.actors[0].verbs.join() === 'the accounts store', 'THE STORE-KEY ROAD notes itself: a store’s key read refused while locked ⇒ actor «VibeSpace», the store as the verb (nothing read — the lock law unchanged)', JSON.stringify(s1));
  ok(e.facts().blocked === 1 && sent.some((m) => m.type === 'vault-state' && m.blocked === 1) && runs.length === 1 && runs[0].count === 1, 'a fresh note re-announces the facts (blocked = 1, the strip’s count) and runs onBlocked ONCE with the summary');
  refusalOf(() => box.dec('x')); refusalOf(() => box.enc('y'));
  ok(runs.length === 1 && e.blockedSummary().actors[0].n === 3, 'the same store refused again ⇒ counted, no hook, no broadcast storm');
  ok(e.secretGet('host:host-0123456789abcdef').code === KF.VAULT_LOCKED && e.blockedSummary().actors[0].verbs.includes('a device link token') && !JSON.stringify(e.blockedSummary()).includes('0123456789abcdef'), 'a secret refused while locked ⇒ noted by its kind («a device link token») — never the machine’s id');
  ok(e.blocked('Worker one', 'vibespace-api conversations.rename') === true && runs.length === 3 && e.facts().blocked === 2, 'a door’s own note (the ONE helper) ⇒ a second actor, the hook runs');
  ok(e.state() === 'locked' && !fs.existsSync(path.join(dir, '.accounts-key')), 'the lock law is unchanged: still locked, no key file written by any note');
  await e.unlock(PW);
  ok(e.facts().blocked === 0 && e.blockedSummary().count === 0, 'the UNLOCK clears it');
  e.lock('door');
  ok(e.blockedSummary().count === 0 && e.blocked('Lane three', 'v') === true && e.blockedSummary().count === 1, 'a LOCK ACT starts a fresh epoch: nobody stopped yet, the first refusal is fresh');
  e.close();
}

fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
