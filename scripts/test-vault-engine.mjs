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
//   N  the `totp:<name>` entry (design q-047 L1, lane vault-totp): a secret name, sealed + read back unlocked, refused locked,
//      forgotten locked too; a name outside the grammar is no secret
//   P  THE USE LAW (lane vault-use-law, design q-043 D1/D2/D7): ONE shape (useOf), ONE writer (noteUse — keyFor, the window,
//      a door), the vault-use AUDIT LEG (a bearer's use is one line of a closed key set: entry, purpose, actor, door, conv,
//      outcome, receipt — a value a door hands the writer is in no form in the file); the daily failure count (the 20th of
//      an actor × entry fires once; the lock's refusals never count; 20 wrong second passwords from one address); MUTANTS:
//      a writer that spreads a door's options into the line, a line without its closed key set ⇒ RED
//   O  THE LOCK'S FOUR CONSEQUENCES (lane vault-manual-and-lock — decision ③, design q-043 D3 ⑤): ONE census over the
//      engine's onLock subscribers (grep-derived: every `.onLock(` of the tree classified by what it ends; each of the four
//      carried; every file that files a vault ASK subscribes) and ONE live world holding all four at once — a page's reveal
//      window, the waiting asks (a run's card, an agent's request, a held automation call), the one-time grants (a request's
//      grant, an unspent automation once-grant) and a running `vault run` child — that a lock by the door, an agent or the
//      idle timer ENDS whole (the asks withdrawn `vault_locked`), while the shutdown's QUIET lock runs no subscriber;
//      MUTANTS: a copy dropping ONE consequence (the window, the request, the grants, the run) ⇒ RED on that one
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

console.log('N  the two-step entry totp:<name> (design q-047 L1, lane vault-totp)');
{
  const { dir } = world();
  const e = mk(dir);
  await e.setup(PW, {});
  const SEED = ['JBSWY3DP', 'EHPK3PXP'].join('');   // a secret-shaped fixture is built at runtime, never a literal
  const rec = JSON.stringify({ v: 1, seed: SEED, digits: 6, period: 30, algorithm: 'SHA1', issuer: 'GitHub', account: 'o', addedAt: 1, source: 'manual' });
  ok(VE.isSecretName('totp:github-owner') && VE.isSecretName('totp:a.b_c-1') && !VE.isSecretName('totp:') && !VE.isSecretName('totp:a b') && !VE.isSecretName('totp:a/b'), 'totp:<[\\w.-]> is a secret name; an empty / spaced / slashed one is not');
  const put = e.secretPut('totp:github-owner', rec), got = e.secretGet('totp:github-owner');
  ok(put.ok && got.ok && got.value.toString('utf8') === rec && e.secretNames().some((x) => x.name === 'totp:github-owner') && e.facts().secrets === 1, 'unlocked: sealed, read back to the very text, listed by NAME (a secret, not a store key)');
  got.value.fill(0);
  ok(!fs.readFileSync(path.join(dir, 'vault.json'), 'utf8').includes(SEED), 'vault.json holds no seed in the clear');
  e.lock('test');
  const lp = e.secretPut('totp:other', rec), lg = e.secretGet('totp:github-owner');
  ok(!lp.ok && /vault_locked/.test(lp.code) && !lg.ok && /vault_locked/.test(lg.code), 'LOCKED: a put and a get refused by name (vault_locked) — nothing written', { lp, lg });
  ok(e.secretDrop('totp:github-owner').ok && !e.secretNames().some((x) => x.name === 'totp:github-owner'), 'a locked vault still FORGETS one (a delete needs no key)');
  e.close();
}

// ── O  AGENT-OWNED SECRETS (design q-043 §9, lane vault-mint-put): mint = the HUB's randomness, sealed, NEVER returned
//      (the owner can reveal it); put = a value the agent hands; both under agent:<scope>/<name>; a namespace escape and a
//      mint that echoes the value are each caught by a MUTANT.
console.log('O  agent mint / put (q-043 §9)');
{
  // the PURE pieces
  ok(V.agentEntryName('conv-7', 'db-pw').name === 'agent:conv-7/db-pw', 'agentEntryName builds agent:<scope>/<name> from a SERVER scope');
  ok(V.agentEntryName('conv-7', 'other/evil').code === 'bad_name' && V.agentEntryName('conv-7', 'agent:x/y').code === 'bad_name' && V.agentEntryName('a/b', 'x').code === 'bad_scope',
    'a name with / or : is refused (no namespace escape); a bad scope is refused');
  ok(V.mintVerdict({}).length === 24 && V.mintVerdict({}).charset === 'ascii-printable' && V.mintVerdict({ length: 4 }).code === 'bad_length' && V.mintVerdict({ charset: 'hex' }).code === 'bad_charset',
    'mintVerdict: defaults 24 / ascii-printable; a short length or an unknown charset refused');
  for (const cs of ['ascii-printable', 'alnum', 'digits']) { const str = V.randomSecret(64, cs).toString('utf8'); ok(str.length === 64 && [...str].every((c) => V.MINT_CHARSETS[cs].includes(c)), `randomSecret(${cs}) is 64 chars, every one in the alphabet`); }
  ok(new Set([...V.randomSecret(300, 'digits').toString('utf8')]).size === 10, 'randomSecret(digits, 300) draws all ten digits (uniform — no symbol starved by a modulo bias)');

  const { dir } = world();
  const e = mk(dir);
  await e.setup(PW, {});
  // MINT: the hub makes it, seals it, returns name + ref — NEVER the value
  const m = e.agentMint('agent:conv-7/signup-pw', { length: 20, charset: 'alnum', actor: 'My Chat' });
  ok(m.ok && m.name === 'agent:conv-7/signup-pw' && m.ref === 'vault://agent:conv-7/signup-pw' && !('value' in m), 'agentMint ⇒ { ok, name, ref } with NO value field (the agent never sees it)');
  const g = e.secretGet('agent:conv-7/signup-pw');
  const minted = g.ok && g.value ? g.value.toString('utf8') : null;
  ok(minted && minted.length === 20 && [...minted].every((c) => V.MINT_CHARSETS.alnum.includes(c)), 'the owner CAN reveal the minted value (20 alnum chars) — it is sealed, not lost');
  if (g.value) g.value.fill(0);
  const audit = fs.readFileSync(path.join(dir, VE.AUDIT_FILE), 'utf8');
  ok(!audit.includes(minted) && !fs.readFileSync(path.join(dir, 'vault.json'), 'utf8').includes(minted) && !JSON.stringify(m).includes(minted), 'the minted value is in NO return, audit line or record byte (only the entry name + who)');
  ok(/"event":"vault-agent-mint"/.test(audit) && /"by":"agent"/.test(audit) && /"actor":"My Chat"/.test(audit), 'the mint is audited by name + actor (never the value)');
  // PUT
  const p = e.agentPut('agent:conv-7/vendor-key', 'sk-PLANTED-UNIQUE-55', { actor: 'My Chat' });
  ok(p.ok && p.name === 'agent:conv-7/vendor-key' && !('value' in p), 'agentPut ⇒ { ok, name, ref }, no value echoed back');
  const g2 = e.secretGet('agent:conv-7/vendor-key');
  ok(g2.ok && g2.value.toString('utf8') === 'sk-PLANTED-UNIQUE-55', 'the put value is sealed and reveals back to the very bytes'); if (g2.value) g2.value.fill(0);
  const sn = e.secretNames().filter((x) => x.name.startsWith('agent:'));
  ok(sn.length === 2 && sn.find((x) => x.name.endsWith('/signup-pw')).prov === 'minted' && sn.find((x) => x.name.endsWith('/vendor-key')).prov === 'stored' && sn.every((x) => x.actor === 'My Chat'),
    'secretNames() carries prov (minted / stored) + actor for agent entries');
  ok(VE.isSecretName('agent:conv-7/x') === true && VE.isSecretName('agent:conv-7/a/b') === false && VE.isSecretName('host:dev9') === true, 'isSecretName: an agent entry with ONE slash is a secret; a second slash is not; host still is');
  ok(e.agentMint('host:dev9', {}).code === 'bad-name' && e.agentMint('agent:conv-7/x', { length: 4 }).code === 'bad_length' && e.agentMint('agent:conv-7/x', { charset: 'hex' }).code === 'bad_charset', 'agentMint refuses a non-agent name, a short length, an unknown charset');
  ok(e.agentPut('agent:conv-7/x', '').code === 'value_required', 'agentPut refuses an empty value');
  // LOCKED ⇒ refused by name, nothing read, nothing minted
  const before = JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8'));
  e.lock('test');
  ok(e.agentMint('agent:conv-7/y', {}).code === KF.VAULT_LOCKED && e.agentPut('agent:conv-7/y', 'v').code === KF.VAULT_LOCKED, 'a LOCKED vault refuses mint and put by name (vault_locked)');
  await e.unlock(PW);
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8'));
  ok(!after.entries['agent:conv-7/y'] && Object.keys(before.entries).length === Object.keys(after.entries).length, 'nothing was minted or stored while locked');
  e.close();

  // MUTANT 1 — agentMint that ECHOES the value ⇒ caught (the real return has no value; the mutant's does)
  const Mod = require('module');
  const ef = path.join(REPO, 'src/server/vault-engine.js');
  const esrc = fs.readFileSync(ef, 'utf8');
  const ecut = esrc.replace('ref: V.vaultRefOf(name) };\n    } finally { V.zero(value); }', "ref: V.vaultRefOf(name), value: value.toString('utf8') };\n    } finally { V.zero(value); }");
  const em = new Mod(ef); em.filename = ef; em.paths = Mod._nodeModulePaths(path.dirname(ef)); em._compile(ecut, ef);
  { const { dir: d2 } = world(); const me = em.exports.create({ dataDir: d2, kdf: CHEAP, log: quiet, idleTimer: false, register: false }); await me.setup(PW, {}); const mm = me.agentMint('agent:c/z', {}); ok(ecut !== esrc && 'value' in mm, 'MUTANT (agentMint echoes the value) ⇒ the value IS in the return — the real engine never puts it there (would RED a mint-never-returns assert)'); me.close(); }

  // MUTANT 2 — a vault.js whose name regex allows a / ⇒ a namespace escape slips through
  const vf = path.join(REPO, 'src/vault.js');
  const vsrc = fs.readFileSync(vf, 'utf8');
  const vcut = vsrc.replace('const AGENT_NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;', 'const AGENT_NAME_RE = /^[A-Za-z0-9._\\/-]{1,64}$/;');
  const vm = new Mod(vf); vm.filename = vf; vm.paths = Mod._nodeModulePaths(path.dirname(vf)); vm._compile(vcut, vf);
  ok(vcut !== vsrc && V.agentEntryName('conv-7', 'other/evil').code === 'bad_name' && vm.exports.agentEntryName('conv-7', 'other/evil').name === 'agent:conv-7/other/evil',
    'MUTANT (the name regex allows /) ⇒ agent:conv-7/other/evil is BUILT — the real agentEntryName refuses it (would RED the namespace-escape assert)');
}

console.log('P  THE USE LAW (lane vault-use-law — design q-043 D1 / D2 / D7): ONE shape, ONE writer, the vault-use line, the daily failure count');
{
  const VU = require(path.join(REPO, 'src/vault-use.js'));
  // the PURE half
  const u0 = VU.useOf({ by: 'agent', door: 'link-token', conv: 'c-1', extra: 'x' }, 7);
  ok(JSON.stringify(u0) === JSON.stringify({ at: 7, by: 'agent', door: 'link-token', conv: 'c-1' }), 'THE ONE SHAPE: useOf → { at, by, door, conv } (nothing else rides along)', JSON.stringify(u0));
  ok(VU.useOf('human', 1).by === 'human' && VU.useOf({ by: 'root' }, 1).by === 'system' && VU.useOf({ door: 'Not A Door!' }, 1).door === null && VU.useOf({ conv: 'a\nb' }, 1).conv === 'a b', 'a bare `by` string; an unknown subject is the hub (system); a door is an id or null; a conversation key one line');
  const belt = (U) => U.useLine({ at: 1, entry: 'frp:token', purpose: 'p', use: { by: 'agent', door: 'run', conv: 'c' }, actor: 'Lane', outcome: 'ok', receipt: 'vr-0123456789ab', ip: '10.0.0.1', value: 'SENTINEL-VALUE', token: 'SENTINEL-TOKEN' });
  const l0 = belt(VU);
  ok(Object.keys(l0).join() === VU.LINE_KEYS.join() && l0.event === 'vault-use' && !JSON.stringify(l0).includes('SENTINEL'), `THE LINE: a CLOSED key set (${VU.LINE_KEYS.join(', ')}) — a value a door hands it never reaches the file`, JSON.stringify(l0));
  ok(VU.outcomeOf(undefined) === 'ok' && VU.outcomeOf('human_only') === 'human_only' && VU.outcomeOf('the value is hunter2') === 'error', 'an outcome is ok or a code — a sentence is `error`, never itself');
  ok(VU.counts('human_only') && VU.counts('no_link') && VU.counts('wrong_password') && !VU.counts('ok') && !VU.counts('vault_locked') && !VU.counts('key-unreadable:vault_locked') && !VU.counts('paced') && !VU.counts('vault_not_set_up'), 'COUNTED: the actor\'s own refusals — never the lock\'s, the pace\'s or a vault not set up');
  const F = VU.createFailures();
  const fires = []; let t = 1e12;
  for (let i = 1; i <= 45; i++) { t += 60e3; const r = F.note({ key: 'agent:c-1', actor: 'Lane', by: 'agent', entry: 'vault', door: 'unlock', outcome: 'human_only', at: t }); if (r.fire) fires.push([i, r.card.n]); }
  ok(fires.length === 1 && fires[0][0] === VU.FAIL_PER_DAY && fires[0][1] === VU.FAIL_PER_DAY, `the ${VU.FAIL_PER_DAY}th failure in a day FIRES, once — 45 failures, one card`, JSON.stringify(fires));
  ok(F.note({ key: 'agent:c-2', entry: 'vault', at: t }).n === 1 && F.note({ key: 'agent:c-1', entry: 'contents', at: t }).n === 1, 'a pair is an actor × an entry: another actor, another entry count apart');
  t += VU.DAY_MS + 1; let again = 0;
  for (let i = 0; i < 20; i++) { t += 1000; if (F.note({ key: 'agent:c-1', entry: 'vault', at: t }).fire) again++; }
  ok(again === 1, 'a day after its card, the same pair fires again (20 more in a day)');
  const B = VU.createFailures({ maxPairs: 5 });
  for (let i = 0; i < 9; i++) B.note({ key: `k${i}`, entry: 'e', at: i + 1 });
  ok(B.size() === 5, 'BOUNDED: ≤ maxPairs pairs (the stalest leaves)');
  ok(VU.entryLabel('host:dial-mac01') === 'a machine link token' && VU.entryLabel('.accounts-key') === 'the accounts store key' && VU.entryLabel('browser-passkeys.key') === 'the passkeys store key' && VU.entryLabel(VU.VAULT_ENTRY) === 'the second password' && VU.entryLabel(VU.CONTENTS_ENTRY) === 'the stored values', 'an entry in words — never a machine\'s or a key\'s id');

  // the engine: THE ONE WRITER
  const { dir } = world({ keys: ['.accounts-key'] });
  let clock = 1800000000000;
  const e = mk(dir, { now: () => clock });
  await e.setup(PW, {});
  const cards = []; e.onFailing((c) => cards.push(c));
  const box = boxOf(dir, '.accounts-key');
  box.dec(box.enc('a store\'s own read'));
  const lu = e.lastUse('accounts');
  ok(lu && lu.by === 'system' && lu.door === 'store' && lu.conv === null && lu.at === clock, 'keyFor: a store\'s own read is a use in THE shape — by system, door store (the window\'s «last used»)', JSON.stringify(lu));
  e.noteUse('accounts', { by: 'human', door: 'vault-window' });
  ok(e.lastUse('accounts').by === 'human' && e.lastUse('accounts').door === 'vault-window', 'the Vault window\'s reveal goes through the SAME writer (by human, door vault-window)');
  const SENT = 'sentinel-' + crypto.randomBytes(16).toString('hex');
  e.secretPut('frp:token', SENT);
  const rc = e.noteUse('frp:token', { by: 'agent', door: 'run', conv: 'c-law' }, { outcome: 'ok', purpose: 'publish the relay', actor: 'Law lane', value: SENT, why: SENT, ip: '10.0.0.9' });
  e.noteUse('host:dial-mac01', { by: 'job', door: 'link-token', conv: 'job-j1' }, { outcome: 'no_link', purpose: 'attach', actor: 'Law job' });
  /** THE AUDIT LEG: every vault-use line in the file → { lines, extra keys, hits of the sentinel in any form } */
  const auditLeg = (d) => {
    const text = fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8');
    const lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.event === 'vault-use');
    const forms = [SENT, Buffer.from(SENT).toString('hex'), Buffer.from(SENT).toString('base64')];
    return { lines, extra: lines.filter((l) => Object.keys(l).join() !== VU.LINE_KEYS.join()).length, hits: forms.filter((f) => text.includes(f)).length };
  };
  const a1 = auditLeg(dir);
  ok(/^vr-[0-9a-f]{12}$/.test(rc.receipt) && a1.lines.length === 2 && a1.extra === 0 && a1.hits === 0, `THE AUDIT LEG: a bearer's use is ONE vault-use line each (2: an agent's ok, a job's no_link), the closed key set, a receipt — and the value a door handed the writer is in NO form in the file`, JSON.stringify(a1));
  const [ok1, no1] = a1.lines;
  ok(ok1.entry === 'frp:token' && ok1.purpose === 'publish the relay' && ok1.by === 'agent' && ok1.door === 'run' && ok1.conv === 'c-law' && ok1.actor === 'Law lane' && ok1.outcome === 'ok' && ok1.receipt === rc.receipt && ok1.ip === '10.0.0.9' && no1.outcome === 'no_link' && no1.by === 'job', 'the line: entry, purpose, actor, door, conversation, outcome, receipt (design q-043 D2) — names and codes only');
  ok(!a1.lines.some((l) => l.by === 'system' || l.by === 'human'), 'no line for the hub\'s own reads (a flood) or a person\'s (their doors keep their own lines)');
  // the daily count through the writer
  for (let i = 0; i < 25; i++) { clock += 30e3; e.noteUse('vault', { by: 'agent', door: 'unlock', conv: 'c-law' }, { outcome: 'human_only', actor: 'Law lane' }); }
  for (let i = 0; i < 30; i++) { clock += 30e3; e.noteUse('host:dial-mac01', { by: 'agent', door: 'link-token', conv: 'c-other' }, { outcome: 'vault_locked', actor: 'Other lane' }); }
  ok(cards.length === 1 && cards[0].actor === 'Law lane' && cards[0].entry === 'vault' && cards[0].door === 'unlock' && cards[0].outcome === 'human_only' && cards[0].n === VU.FAIL_PER_DAY && !JSON.stringify(cards[0]).includes(SENT), 'onFailing runs ONCE at the 20th failure of an actor × entry in a day (25 tries) — the lock\'s own refusals count nothing (30 vault_locked)', JSON.stringify(cards));
  e.lock('door');
  for (let i = 0; i < 20; i++) { clock += i % 5 === 0 ? 61e3 : 1e3; await e.unlock('not the password', { ip: '198.51.100.7' }); }
  ok(cards.length === 2 && cards[1].by === 'human' && cards[1].actor === 'someone at 198.51.100.7' && cards[1].entry === VU.VAULT_ENTRY && cards[1].outcome === 'wrong_password', 'design §2 T7: 20 wrong SECOND PASSWORDS in a day from one address ⇒ its card (someone at <address>, the second password)', JSON.stringify(cards[1] || null));
  ok(auditLeg(dir).lines.every((l) => l.by !== 'human') && !fs.readFileSync(path.join(dir, VE.AUDIT_FILE), 'utf8').includes('not the password'), 'the wrong passwords keep their own lines (vault-unlock-failed) — never the password, never a second line');
  e.close();

  // THE MUTANTS — each judged by the SAME leg ⇒ RED
  const Mod = require('module');
  const loadAs = (rel, src) => { const abs = path.join(REPO, rel); const m = new Mod(abs, null); m.filename = abs; m.paths = Mod._nodeModulePaths(path.dirname(abs)); m._compile(src, abs); return m.exports; };
  const ES = fs.readFileSync(path.join(REPO, 'src/server/vault-engine.js'), 'utf8');
  const from = "audit('vault-use', VU.useLine({ at: u.at, entry: name, purpose: o.purpose, use: u, actor: o.actor, outcome, receipt, ip: o.ip, grant: o.grant }));";   // lane vault-use-grants: + the grant that admitted it
  ok(ES.split(from).length === 2, 'the engine mutant\'s anchor is the writer\'s ONE audit call');
  const VEm = loadAs('src/server/vault-engine.js', ES.replace(from, "audit('vault-use', { ...o, ...VU.useLine({ at: u.at, entry: name, purpose: o.purpose, use: u, actor: o.actor, outcome, receipt, ip: o.ip, grant: o.grant }) });"));
  const { dir: dm } = world({ keys: ['.accounts-key'] });
  const em = VEm.create({ dataDir: dm, kdf: CHEAP, log: quiet, idleTimer: false, register: false });
  await em.setup(PW, {});
  em.noteUse('frp:token', { by: 'agent', door: 'run', conv: 'c-law' }, { outcome: 'ok', purpose: 'publish the relay', actor: 'Law lane', value: SENT });
  const am = auditLeg(dm);
  ok(am.hits > 0 && am.extra > 0, `MUTANT RED: a writer that spreads a door's options into the vault-use line puts the value in the audit (${am.hits} hit(s), ${am.extra} line(s) off the closed set)`, JSON.stringify(am));
  em.close();
  const VS = fs.readFileSync(path.join(REPO, 'src/vault-use.js'), 'utf8');
  const fromV = '  return Object.fromEntries(LINE_KEYS.map((k) => [k, line[k]]));';
  ok(VS.split(fromV).length === 2, 'the PURE mutant\'s anchor is the line\'s closed key set');
  const VUm = loadAs('src/vault-use.js', VS.replace(fromV, '  return { ...arguments[0], ...line };'));
  const lm = belt(VUm);
  ok(JSON.stringify(lm).includes('SENTINEL') && Object.keys(lm).join() !== VU.LINE_KEYS.join(), 'MUTANT RED: a line that keeps what a door hands it carries the value (the belt above is the judge)');
}

console.log('O  THE LOCK\'S FOUR CONSEQUENCES (lane vault-manual-and-lock — decision ③): one census over the engine\'s onLock subscribers, one live world, a mutant per consequence');
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
  const VC = require(path.join(REPO, 'src/server/vault-contents.js'));
  const DOOR = require(path.join(REPO, 'src/server/vault-run-door.js'));
  const AE = require(path.join(REPO, 'src/server/automation-engine.js'));
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
  // (1) THE CENSUS — every `.onLock(` of src/ + server.js, by file, with what it ends; a new subscriber unclassified ⇒ RED
  const CONSEQUENCES = ['view', 'asks', 'grants', 'runs'];   // decision ③: the view session, every unanswered ask, every one-time grant, every running `vault run`
  const SUBSCRIBERS = {
    'src/server/vault-contents.js': { n: 1, ends: ['view'], why: 'every page\'s reveal window closes at once (the epoch would refuse it at its next use); a 验证是你 still checking opens none' },
    'src/server/vault-run-door.js': { n: 1, ends: ['asks', 'grants', 'runs'], why: 'every run card and every agent request withdrawn vault_locked; every grant, seen shape and 8-hour «always» ended; every running child ended whole (its group, its marked strays, its files)' },
    'src/server/automation-engine.js': { n: 1, ends: ['asks', 'grants'], why: 'every held automation call answers vault_locked; every once-grant no call spent is spent' },
    'src/server/vault-paste-door.js': { n: 1, ends: ['asks'], why: 'lane vault-paste-request: every open paste request withdrawn (its item done vault_locked) and its asker told at its next turn; one filed while locked, or kept over a restart, waits — its box says vault_locked with 解锁… inline' },
    'src/server/vault-hooks.js': { n: 3, ends: ['logins', 'sealed', 'said'], why: 'r2: every login signed out (the vault\'s fifth consequence, the sign-in\'s); a sealed file forgets its decrypted copy; lane vault-locked-loud (int332): the lock act files THE urgent unlock prompt at once',
      item: 'the lock\'s OWN prompt (lane vault-locked-loud): an action row (the badge counts it) filed BY the lock and resolved by the unlock — not an ask a lock withdraws' },
  };
  const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(c|m)?js$/.test(e.name) ? [path.join(d, e.name)] : []));
  const files = [...walk('src'), 'server.js'];
  const sites = new Map();
  for (const f of files) { const k = (code(f).match(/\.onLock\(/g) || []).length; if (k) sites.set(f, k); }
  const unknown = [...sites].filter(([f, k]) => !SUBSCRIBERS[f] || SUBSCRIBERS[f].n !== k).map(([f, k]) => `${f}: ${k}`);
  const dead = Object.keys(SUBSCRIBERS).filter((f) => !sites.has(f));
  ok(sites.size >= 4 && !unknown.length && !dead.length, `the census: every onLock subscriber of the tree (${[...sites].map(([f, k]) => `${path.basename(f)}×${k}`).join(', ')}) is a row with what it ends — none unclassified, none dead`, JSON.stringify({ unknown, dead }));
  ok(CONSEQUENCES.every((c) => Object.values(SUBSCRIBERS).some((s) => s.ends.includes(c))), 'each of the four consequences (view · asks · grants · runs) is carried by a subscriber');
  const askFiles = files.filter((f) => /origin: 'vault',[^}]{0,240}?kind: 'action'/.test(code(f)));
  // int332: a file whose action row is the LOCK'S OWN prompt (vault-hooks.js, lane vault-locked-loud) declares it as `item` — filed by the lock, resolved by the unlock
  ok(askFiles.length >= 2 && askFiles.every((f) => SUBSCRIBERS[f] && (SUBSCRIBERS[f].ends.includes('asks') || SUBSCRIBERS[f].item)), `every file that files a vault ASK (origin vault, kind action: ${askFiles.map((f) => path.basename(f)).join(', ')}) subscribes and withdraws it on a lock — or declares its action row as the lock's own prompt`, askFiles.join(', '));
  const eng = code('src/server/vault-engine.js');
  ok(/if \(!quiet\) \{ audit\('vault-locked', \{ ip, why \}\); announce\(\); runHooks\(lockHooks, 'a lock', why\); \}/.test(eng) && /close\(\) \{[^}]*lock\('close', \{ quiet: true \}\)/.test(eng), 'the engine runs them on a lock ACT only (door / agent / idle) — the shutdown\'s quiet lock runs none');
  // (2) THE LIVE WORLD — the four at once
  const ROWS = [{ entry: 'm1', field: 'secretKey', label: 'bucket', cipher: 'x'.repeat(60) }, { entry: 'm2', field: 'secretKey', label: 'second', cipher: 'x'.repeat(60) }, { entry: 'm3', field: 'secretKey', label: 'third', cipher: 'x'.repeat(60) }];
  const VAL = { m1: 'lock-census-value-one-0123', m2: 'lock-census-value-two-4567', m3: 'lock-census-value-three-89' };
  const src = { vaultRows: () => ROWS, vaultReveal: (e, f) => (f === 'secretKey' ? VAL[e] || null : null) };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 10)); } return fn(); };
  async function lockWorld({ contentsMod = VC, doorMod = DOOR, autoMod = AE } = {}) {
    const top = path.join(ROOT, 'lock' + (++n)), dir = path.join(top, 'data');   // the data dir beside the work folder (a run never starts inside the data dir)
    fs.mkdirSync(dir, { recursive: true });
    let clock = Date.now();
    const v = mk(dir, { now: () => clock, register: false });
    await v.setup(PW, {});
    const userTodos = new UserTodoManager({ dataDir: dir, expirySweepMs: 3600e3 });
    const runRoot = path.join(top, 'run'), work = path.join(top, 'work'); fs.mkdirSync(runRoot); fs.mkdirSync(work);
    const contents = contentsMod.create({ vault: v, sources: { mounts: () => src } });
    const door = doorMod.create({ dataDir: dir, vault: v, sources: { mounts: () => src }, userTodos, instanceKind: () => 'cluster', runRoot: () => runRoot, agentEnv: () => ({ ...process.env }), killGraceMs: 300, pipeGraceMs: 200, liveOf: () => true });
    const auto = autoMod.create({ dataDir: dir, vault: v, userTodos, now: () => clock, verbs: { 'conversations.rename': () => ({ ok: true }) } });
    const open = () => userTodos.snapshot().open || [];
    const cardOf = async (type, not = null) => { let c = null; await until(() => (c = open().find((i) => i.action && i.action.type === type && i.action.askId !== not)) != null); return c; };
    // (a) THE VIEW: 验证是你 opened this page's window
    const rs = await contents.startReveal('who-1', PW);
    // (d) A RUN IN FLIGHT: a child that sleeps (its pid in a file), its card answered once (a cluster asks every run)
    const caller = { conversationId: 'conv-1', sessionKey: 'claude:conv-1', name: 'Lane L', cwd: work, scope: 'webui-1' };
    door.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });
    const pidFile = path.join(work, 'pid');
    const running = door.run({ caller, args: ['--env', 'T=vault://mounts/m1/secretKey', '--', process.execPath, '-e', 'require("fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)', pidFile], cwd: work });
    const c1 = await cardOf('vault-run-ask');
    door.answer(c1.action.askId, { answer: 'once' });
    await until(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').length > 0);
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    // (b) THE ASKS: a second run held on its card, an agent's request, a held automation call
    const held = door.run({ caller, args: ['--env', 'T=vault://mounts/m1/secretKey', '--', process.execPath, '-e', 'console.log(2)'], cwd: work });
    const c2 = await cardOf('vault-run-ask', c1.action.askId);
    const rq = door.request({ caller, entry: 'vault://mounts/m3/secretKey', purpose: 'read the third bucket' });
    const reqId = (open().find((i) => i.action && i.action.type === 'vault-grant-ask' && i.action.askId === rq.askId) || {}).id;
    const key = auto.mint({ name: 'census', scopes: ['conversations.rename'], by: 'user' });
    const call = auto.use({ caller: { conversationId: 'conv-1', sessionKey: 'claude:conv-1', name: 'Lane L', live: true, groups: [] }, verb: 'conversations.rename', args: { name: 'x' } });
    const c3 = await cardOf('automation-ask');
    // (c) THE ONE-TIME GRANTS: a request answered «8 hours», an automation «once» no call spent
    const rg = door.request({ caller, entry: 'vault://mounts/m2/secretKey', purpose: 'sync the second bucket' });
    door.answerRequest(rg.askId, { answer: '8h', reauthed: true });
    auto.grant(key.key.id, ['session:conv-2'], { mode: 'once', by: 'user' });
    const live = { view: contents._windows.size === 1 && rs.ok, run: alive(pid) && door.running() === 1, asks: !!(c2 && rq.ok && reqId && c3), grants: door._grants.size === 1 && auto.list().keys[0].grants.some((g) => g.mode === 'once' && !g.spentAt) };
    return { dir, v, contents, door, auto, userTodos, open, pid, running, held, call, rq, reqId, live, tick: (ms) => { clock += ms; } };
  }
  /** What the lock ENDED — each of the four, judged from the outside. */
  async function ended(w) {
    const view = w.contents._windows.size === 0 && !w.contents.windowFacts('who-1', 'x'.repeat(32)).open;
    const heldR = await Promise.race([w.held, new Promise((r) => setTimeout(() => r({ code: 'still-waiting' }), 2000))]);
    const callR = await Promise.race([w.call, new Promise((r) => setTimeout(() => r({ code: 'still-waiting' }), 2000))]);
    const reqItem = w.reqId ? w.userTodos.get(w.reqId) : null;
    const asks = heldR.code === 'vault_locked' && callR.code === 'vault_locked' && !w.door._requests.size && !!reqItem && reqItem.status !== 'open' && reqItem.resolvedBy === 'vault_locked'
      && !w.open().some((i) => i.action && ['vault-run-ask', 'vault-grant-ask', 'automation-ask'].includes(i.action.type));
    const grants = w.door._grants.size === 0 && !w.auto.list().keys[0].grants.some((g) => g.mode === 'once' && !g.spentAt);
    const gone = await until(() => !alive(w.pid) && w.door.running() === 0, 3000);
    const runR = gone ? await w.running : { code: 'still-running' };
    const runs = gone && runR.code === 'vault_locked' && runR.killed === true;
    if (!gone) w.door.closeAll();   // a mutant left it: end it here (never a stray past the suite)
    return { view, asks, grants, runs, why: { heldR: heldR.code, callR: callR.code, reqItem: reqItem && [reqItem.status, reqItem.resolvedBy], runR: runR.code } };
  }
  const four = (e) => CONSEQUENCES.every((c) => e[c] === true);
  for (const why of ['door', 'agent', 'idle']) {
    const w = await lockWorld();
    ok(Object.values(w.live).every(Boolean), `(${why}) the world holds all four before the lock: a reveal window, a running child, three waiting asks, two one-time grants`, JSON.stringify(w.live));
    if (why === 'idle') { w.v.setIdleLock(1); w.tick(2 * 3600e3); w.v.idleTick(); } else w.v.lock(why);
    const e = await ended(w);
    ok(w.v.state() === 'locked' && four(e), `a lock by ${why === 'door' ? 'the DOOR (a person)' : why === 'agent' ? 'an AGENT' : 'the IDLE timer'} ENDS all four: the view closed · every ask withdrawn vault_locked (the run card, the request, the automation call) · every one-time grant ended · the running child gone (vault_locked, killed)`, JSON.stringify(e));
    w.door.closeAll(); w.v.close();
  }
  {
    const dir = path.join(ROOT, 'quiet'); fs.mkdirSync(dir, { recursive: true });
    const v = mk(dir, { register: false }); await v.setup(PW, {});
    let hooks = 0; v.onLock(() => { hooks++; });
    v.lock('close', { quiet: true });
    const q1 = hooks; await v.unlock(PW); v.close();
    ok(q1 === 0 && hooks === 0, 'the shutdown\'s QUIET lock (and close()) runs no subscriber — its runs end with the process (the door\'s closeAll), nothing is withdrawn into a store a restart re-reads');
  }
  {
    // the review: a lock whose store write FAILS still ends the automation once-grant (the engine remembers the lock)
    const dir = path.join(ROOT, 'lockwrite'); fs.mkdirSync(dir, { recursive: true });
    const v = mk(dir, { register: false }); await v.setup(PW, {});
    const userTodos = new UserTodoManager({ dataDir: path.join(dir, 'todos'), expirySweepMs: 3600e3 });
    const ran = [];
    const auto = AE.create({ dataDir: dir, vault: v, userTodos, verbs: { 'conversations.rename': () => { ran.push(1); return { ok: true }; } } });
    const key = auto.mint({ name: 'w', scopes: ['conversations.rename'], by: 'user' });
    auto.grant(key.key.id, ['session:conv-2'], { mode: 'once', by: 'user' });
    fs.chmodSync(dir, 0o555);   // the store's directory read-only: the lock's write throws
    v.lock('agent');
    fs.chmodSync(dir, 0o755);
    await v.unlock(PW);
    const still = auto.list().keys[0].grants.some((g) => g.mode === 'once' && !g.spentAt);
    const call = auto.use({ caller: { conversationId: 'conv-2', sessionKey: 'claude:conv-2', name: 'Two', live: true, groups: [] }, verb: 'conversations.rename', args: { name: 'x' } });
    let card = null; await until(() => (card = (userTodos.snapshot().open || []).find((i) => i.action && i.action.type === 'automation-ask')) != null, 2000);
    if (card) auto.answer(card.action.askId, { answer: 'deny', answeredBy: 'user' });
    const r = await call;
    ok(still && card && !ran.length && r.ok === false, 'a lock whose store write FAILED still ends the automation once-grant: the next use asks again (the engine remembers the lock), nothing ran', JSON.stringify({ still, card: !!card, ran: ran.length, code: r.code }));
    v.close();
  }
  // (3) MUTANTS — a copy dropping ONE consequence ⇒ RED, on that one
  const MO = mutantCopies('vault-engine-lock', REPO);
  const CSRC = read('src/server/vault-contents.js'), DSRC = read('src/server/vault-run-door.js');
  const patch = (rel, srcText, from, to, tag) => (srcText.split(from).length === 2 ? MO.load(rel, srcText.replace(from, to), tag) : null);
  const MUT = [
    ['view', 'a lock that leaves the reveal window open', { contentsMod: patch('src/server/vault-contents.js', CSRC, "vault.onLock(() => { windows.clear(); });", "vault.onLock(() => { });", 'view') }],
    ['asks', 'a lock that leaves an agent\'s request open', { doorMod: patch('src/server/vault-run-door.js', DSRC, "for (const q of [...requests.values()]) settleRequest(q, 'vault_locked', 'locked');", '', 'asks') }],
    ['grants', 'a lock that does not end the one-time grants', { doorMod: patch('src/server/vault-run-door.js', DSRC, 'seen.clear(); shortAlways.clear(); grants.clear();', 'seen.clear(); shortAlways.clear();', 'grants') }],
    ['runs', 'a lock that does not stop the running child', { doorMod: patch('src/server/vault-run-door.js', DSRC, "for (const rec of [...runs]) { log(`the vault locked (${why}): stopping the run of ${rec.name || rec.conv}`); stop(rec, 'lock'); shredDir(rec.dir); }", '', 'runs') }],
  ];
  for (const [c, name, mods] of MUT) {
    const loaded = Object.values(mods).every(Boolean);
    let e = null;
    if (loaded) { const w = await lockWorld(mods); w.v.lock('agent'); e = await ended(w); w.door.closeAll(); w.v.close(); }
    ok(loaded && e && e[c] === false && CONSEQUENCES.filter((x) => x !== c).every((x) => e[x] === true), `MUTANT «${name}»: the patch hits once and the census goes RED on ${c} alone — the shipped tree ends it`, JSON.stringify(e));
  }
}

console.log('Q  A FREE ENTRY (lane vault-paste-request — the owner: 「我压根没法添加啊」 / 「让我直接 paste 进去」): the write by kind');
{
  const d = path.join(ROOT, 'free-entry'); fs.mkdirSync(d, { recursive: true });
  const frames = [];
  const v = VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {} }, idleTimer: false, register: false, bcast: (m) => frames.push(JSON.stringify(m)) });
  const PW = 'free entry second password';
  const VAL = ['free', 'entry', 'value', crypto.randomBytes(6).toString('hex')].join('-');
  ok(VE.isSecretName('secret:0a1b2c3d4e') && !VE.isSecretName('secret:') && !VE.isSecretName('secret:../x') && !VE.isSecretName('secrets:x'), 'the kind: `secret:<id>` is a secret name (the id one segment of [\\w.-], never a path, never another prefix)');
  const nsu = v.secretPut('secret:0a1b2c3d4e', VAL, { prov: 'owner', label: 'Router admin', kind: 'password', note: 'x' });
  ok(!nsu.ok && nsu.code === 'vault_not_set_up', 'NOT SET UP ⇒ refused by name (vault_not_set_up), nothing written', nsu);
  await v.setup(PW);
  const put = v.secretPut('secret:0a1b2c3d4e', VAL, { prov: 'owner', actor: 'Lane asker', label: 'Router admin', kind: 'password', note: 'Asked for by Lane asker: change the DNS' });
  ok(put.ok, 'unlocked ⇒ sealed under its own entry');
  const n = v.secretNames().find((x) => x.name === 'secret:0a1b2c3d4e');
  ok(n && n.label === 'Router admin' && n.kind === 'password' && /change the DNS/.test(n.note) && n.prov === 'owner' && n.actor === 'Lane asker' && !Object.values(n).some((x) => String(x).includes(VAL)), 'its NAMES ride beside the box — label, kind, note, provenance, who asked — never the value', n);
  const g = v.secretGet('secret:0a1b2c3d4e');
  ok(g.ok && g.value.toString('utf8') === VAL && v.facts().secrets === 1, 'the hub\'s own read opens exactly it; facts count it among the secrets');
  const rec = fs.readFileSync(path.join(d, 'vault.json'), 'utf8');
  ok(!rec.includes(VAL) && /"label": "Router admin"/.test(rec), 'the record holds the label in the clear and the value only wrapped');
  v.lock('door');
  const lk = v.secretPut('secret:0b1b2c3d4e', VAL, { label: 'x' });
  ok(!lk.ok && lk.code === 'key-unreadable:vault_locked' && v.blockedSummary().count >= 1 && /a stored password or key/.test(JSON.stringify(v.blockedSummary())), 'LOCKED ⇒ refused by name, and the refusal names what it stopped in words («a stored password or key» — never the id)', { lk, b: v.blockedSummary() });
  ok(v.secretDrop('secret:0a1b2c3d4e').ok && !v.secretNames().some((x) => x.name === 'secret:0a1b2c3d4e'), 'its delete door forgets it — a locked vault forgets too (no key needed)');
  ok(!frames.some((f) => f.includes(VAL)), 'no broadcast frame holds the value');
  v.close();
}

fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
