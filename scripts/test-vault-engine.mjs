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
//   R  A FILE ENTRY (lane lg-vault-file, B-0830): sealed in data/vault-files/<id>.vfile (never vault.json), ONE road (fileOpen),
//      secretGet refuses it (is_a_file), the caps and the kinds by name, a re-put / a delete SHREDS, damage and the boot sweep
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const V = require(path.join(REPO, 'src/vault.js'));
const SB = require(path.join(REPO, 'src/secret-box.js'));
const KF = require(path.join(REPO, 'src/key-file.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
  const ecut = esrc.replace('ref: V.vaultRefOf(name), ...(kept ? { rotated: true } : {}) };\n    } finally { V.zero(value); }', "ref: V.vaultRefOf(name), ...(kept ? { rotated: true } : {}), value: value.toString('utf8') };\n    } finally { V.zero(value); }");   // lane vault-entry-description r2: the return line carries `rotated`
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
    'src/server/vault-job-door.js': { n: 1, ends: ['asks'], why: 'B-a08e (主开发 r1665): every open approval card of a Background job withdrawn vault_locked by its own door (the job keeps waiting — a lock stops no job, decision ④ — and is asked again at the unlock); while For you is held unread the withdraw is owed to its read' },
    'src/server/vault-paste-door.js': { n: 1, ends: ['asks'], why: 'lane vault-paste-request: every open paste request withdrawn (its item done vault_locked) and its asker told at its next turn; one filed while locked, or kept over a restart, waits — its box says vault_locked with 解锁… inline' },
    'src/server/vault-hooks.js': { n: 3, ends: ['logins', 'sealed', 'said'], why: 'r2: every login signed out (the vault\'s fifth consequence, the sign-in\'s); a sealed file forgets its decrypted copy; lane vault-locked-loud (int332): the lock act files THE urgent unlock prompt at once',
      item: 'the lock\'s OWN prompt (lane vault-locked-loud): an action row (the badge counts it) filed BY the lock and resolved by the unlock — not an ask a lock withdraws' },
    'src/server/mounts-plugins-wiring.js': { n: 1, ends: ['scrub-workers'], why: 'lane lg-vault-file (主开发 r2445 law 4): the browser frames\' scrub workers end at a lock, their copy of a profile\'s values with them (src/server/browser-dialogs.js endScrubWorkers)' },
    'src/server/browser-logins.js': { n: 1, ends: ['filled'], why: 'lane vault-login-r3 r8: browser-dialogs subscribes via logins.onVaultLock to clear browser-login-fill\'s per-tab remembered plaintext secrets at once on a lock' },
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
  // B-3dbd (r4729, lane bl-chat-b): EVERY WAIT OF THE LOCK CENSUS IS ON ITS FACT under a generous bound (FACT_MS) whose expiry is a NAMED
  // line, never a silent read of whatever is there (was: 3 s and 2 s bounds a loaded machine beat — a green world read red)
  const FACT_MS = 20000, KILL_MS = 300;
  const until = async (fn, ms = FACT_MS, what = 'its fact') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 10)); } const v = fn(); if (!v) ok(false, `the lock census waited ${ms} ms for ${what} — it never came (a harness line, never the census's verdict)`); return v; };
  const settled = async (p, what, ms = FACT_MS) => { let t = null; const r = await Promise.race([p, new Promise((res) => { t = setTimeout(() => res({ code: 'still-waiting' }), ms); })]); clearTimeout(t); if (r && r.code === 'still-waiting') ok(false, `the lock census waited ${ms} ms for ${what} to settle — it never did (a harness line)`); return r; };
  async function lockWorld({ contentsMod = VC, doorMod = DOOR, autoMod = AE } = {}) {
    const top = path.join(ROOT, 'lock' + (++n)), dir = path.join(top, 'data');   // the data dir beside the work folder (a run never starts inside the data dir)
    fs.mkdirSync(dir, { recursive: true });
    let clock = Date.now();
    const v = mk(dir, { now: () => clock, register: false });
    await v.setup(PW, {});
    const userTodos = new UserTodoManager({ dataDir: dir, expirySweepMs: 3600e3 });
    const runRoot = path.join(top, 'run'), work = path.join(top, 'work'); fs.mkdirSync(runRoot); fs.mkdirSync(work);
    const contents = contentsMod.create({ vault: v, sources: { mounts: () => src } });
    // r4729: the door's own timers, recorded — the lock's stop() arms the run's SIGKILL at its grace (KILL_MS) synchronously inside the lock,
    // so «the lock did not stop the run» is a FACT read at once after it (no 3 s of waiting on a run that was never asked to end)
    const armed = [];
    const timers = { set: (fn, ms) => { armed.push(ms); return setTimeout(fn, ms); }, clear: (h) => clearTimeout(h) };
    const door = doorMod.create({ dataDir: dir, vault: v, sources: { mounts: () => src }, userTodos, instanceKind: () => 'cluster', runRoot: () => runRoot, agentEnv: () => ({ ...process.env }), killGraceMs: KILL_MS, pipeGraceMs: 200, liveOf: () => true, timers });
    const auto = autoMod.create({ dataDir: dir, vault: v, userTodos, now: () => clock, verbs: { 'conversations.rename': () => ({ ok: true }) } });
    const open = () => userTodos.snapshot().open || [];
    const cardOf = async (type, not = null) => { let c = null; await until(() => (c = open().find((i) => i.action && i.action.type === type && i.action.askId !== not)) != null, FACT_MS, `the ${type} card`); return c; };
    // (a) THE VIEW: 验证是你 opened this page's window
    const rs = await contents.startReveal('who-1', PW);
    // (d) A RUN IN FLIGHT: a child that sleeps (its pid in a file), its card answered once (a cluster asks every run)
    const caller = { conversationId: 'conv-1', sessionKey: 'claude:conv-1', name: 'Lane L', cwd: work, scope: 'webui-1' };
    door.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });
    const pidFile = path.join(work, 'pid');
    const running = door.run({ caller, args: ['--env', 'T=vault://mounts/m1/secretKey', '--', process.execPath, '-e', 'require("fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)', pidFile], cwd: work });
    const c1 = await cardOf('vault-run-ask');
    door.answer(c1.action.askId, { answer: 'once' });
    await until(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').length > 0, FACT_MS, 'the run\'s child pid');
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
    const mark = armed.length;   // the timers armed BEFORE the lock: only what the lock arms is read (the review: never the world's whole life)
    return { dir, v, contents, door, auto, userTodos, open, pid, running, held, call, rq, reqId, live, tick: (ms) => { clock += ms; }, killArmed: () => armed.slice(mark).includes(KILL_MS) };
  }
  /** What the lock ENDED — each of the four, judged from the outside. */
  async function ended(w) {
    const view = w.contents._windows.size === 0 && !w.contents.windowFacts('who-1', 'x'.repeat(32)).open;
    const heldR = await settled(w.held, 'the held run\'s answer');   // the lock withdraws it in every world and every mutant: a settle, never a race
    const callR = await settled(w.call, 'the automation call\'s answer');
    const reqItem = w.reqId ? w.userTodos.get(w.reqId) : null;
    const asks = heldR.code === 'vault_locked' && callR.code === 'vault_locked' && !w.door._requests.size && !!reqItem && reqItem.status !== 'open' && reqItem.resolvedBy === 'vault_locked'
      && !w.open().some((i) => i.action && ['vault-run-ask', 'vault-grant-ask', 'automation-ask'].includes(i.action.type));
    const grants = w.door._grants.size === 0 && !w.auto.list().keys[0].grants.some((g) => g.mode === 'once' && !g.spentAt);
    // THE NEVER CLAUSE read on the product's own act: a lock that stopped the run armed its SIGKILL (its grace) inside the lock — then its
    // end is waited for; a lock that armed nothing never asked the run to end (read at once, never by a wait a mutant must outlast)
    const armedKill = w.killArmed();
    const gone = armedKill ? await until(() => !alive(w.pid) && w.door.running() === 0, FACT_MS, 'the stopped run\'s end') : false;
    const runR = gone ? await w.running : { code: 'still-running' };
    const runs = gone && runR.code === 'vault_locked' && runR.killed === true;
    if (!gone) w.door.closeAll();   // a mutant left it: end it here (never a stray past the suite)
    return { view, asks, grants, runs, why: { heldR: heldR.code, callR: callR.code, reqItem: reqItem && [reqItem.status, reqItem.resolvedBy], runR: runR.code, armedKill } };
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
    // THE PLACEMENT (the family's law 1): the old fixed races read a GREEN world red whenever a withdrawal settled late — placed here by a
    // hold the leg owns (the held run's answer gated until the old race has spoken), never by load: the old shape reads «still-waiting»,
    // this leg's wait reads the answer
    const w = await lockWorld(); w.v.lock('door');
    let openGate = null; const gate = new Promise((r) => { openGate = r; });
    const late = w.held.then(async (r) => { await gate; return r; });
    const oldShape = await Promise.race([late, new Promise((r) => setTimeout(() => r({ code: 'still-waiting' }), 100))]);
    openGate();
    const newShape = await settled(late, 'the gated held run\'s answer');
    ok(oldShape.code === 'still-waiting' && newShape.code === 'vault_locked', 'PLACED: a held run whose answer is held past the old fixed race reads «still-waiting» there (a green world red, at will); this leg\'s wait reads its answer, vault_locked', JSON.stringify({ oldShape: oldShape.code, newShape: newShape.code }));
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
    let card = null; await until(() => (card = (userTodos.snapshot().open || []).find((i) => i.action && i.action.type === 'automation-ask')) != null, FACT_MS, 'the automation card after the unlock');
    if (card) auto.answer(card.action.askId, { answer: 'deny', answeredBy: 'user' });
    const r = await call;
    ok(still && card && !ran.length && r.ok === false, 'a lock whose store write FAILED still ends the automation once-grant: the next use asks again (the engine remembers the lock), nothing ran', JSON.stringify({ still, card: !!card, ran: ran.length, code: r.code }));
    v.close();
  }
  // (3) MUTANTS — a copy dropping ONE consequence ⇒ RED, on that one
  const MO = mutantCopies('vault-engine-lock', REPO);
  const CSRC = read('src/server/vault-contents.js'), DSRC = read('src/server/vault-run-door.js');
  const patch = (rel, srcText, from, to, tag) => (srcText.split(from).length === 2 ? MO.load(rel, editAnchor(srcText, from, to, "the text handed to patch()"), tag) : (() => { throw new Error(`ANCHOR GONE OR NOT UNIQUE (${srcText.split(from).length - 1} times): ${JSON.stringify(String(from).slice(0, 80))} — the control's anchor is not in the source — move it with the product line (B-0d3e)`); })());
  const MUT = [
    ['view', 'a lock that leaves the reveal window open', { contentsMod: patch('src/server/vault-contents.js', CSRC, "vault.onLock(() => { windows.clear(); });", "vault.onLock(() => { });", 'view') }],
    ['asks', 'a lock that leaves an agent\'s request open', { doorMod: patch('src/server/vault-run-door.js', DSRC, "for (const q of [...requests.values()]) settleRequest(q, 'vault_locked', 'locked');", '', 'asks') }],
    ['grants', 'a lock that does not end the one-time grants', { doorMod: patch('src/server/vault-run-door.js', DSRC, 'seen.clear(); shortAlways.clear(); grants.clear();', 'seen.clear(); shortAlways.clear();', 'grants') }],
    ['runs', 'a lock that does not stop the running child', { doorMod: patch('src/server/vault-run-door.js', DSRC, "log(`the vault locked (${why}): stopping the run of ${rec.name || rec.conv}`); stop(rec, 'lock'); shredDir(rec.dir);", '', 'runs') }],
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

// ── R  A FILE ENTRY (lane lg-vault-file, B-0830 — design q-058; the owner 2026-11-02: 「general 文件种类，这样什么 ssh key，某些
//      应用的授权文件啥的都能存进去了」, decided 2026-11-03: a 1 MB cap, `keyfile:<10 hex>`, a text value never upgraded, a key
//      with its passphrase stored AS IS): the bytes sealed in data/vault-files/<id>.vfile under a file key that is the entry's
//      value — never in vault.json, never answered by secretGet (`is_a_file`), opened by ONE road (fileOpen); a re-put and a
//      delete SHRED the old file (a hard link sees the overwrite); the boot shreds a file no entry names (never while the
//      record is unreadable); a file moved onto another id, or one flipped byte, does not open (`file_damaged`).
console.log('R  A FILE ENTRY (lane lg-vault-file, B-0830): sealed beside the record, one road to its bytes, shredded when it goes');
{
  const VF = require(path.join(REPO, 'src/vault-file.js'));
  const VC = require(path.join(REPO, 'src/server/vault-contents.js'));
  const u32 = (x) => { const b = Buffer.alloc(4); b.writeUInt32BE(x); return b; };
  const sstr = (x) => { const b = Buffer.isBuffer(x) ? x : Buffer.from(String(x), 'latin1'); return Buffer.concat([u32(b.length), b]); };
  const ARMOR = ['OPENSSH', 'PRIVATE', 'KEY'].join(' ');   // built at runtime: no key-shaped literal in the tree
  /** An openssh-key-v1 private key as ssh-keygen writes it (its public half in the clear; `encrypted` = a passphrase's cipher + kdf). */
  function opensshKey({ encrypted = false } = {}) {
    const { publicKey } = crypto.generateKeyPairSync('ed25519');
    const pub = Buffer.concat([sstr('ssh-ed25519'), sstr(Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url'))]);
    const body = Buffer.concat([Buffer.from('openssh-key-v1\0', 'latin1'), sstr(encrypted ? 'aes256-ctr' : 'none'), sstr(encrypted ? 'bcrypt' : 'none'),
      sstr(encrypted ? Buffer.concat([sstr(crypto.randomBytes(16)), u32(16)]) : Buffer.alloc(0)), u32(1), sstr(pub), sstr(crypto.randomBytes(160))]);
    return Buffer.from([`-----BEGIN ${ARMOR}-----`, ...body.toString('base64').match(/.{1,70}/g), `-----END ${ARMOR}-----`, ''].join('\n'), 'latin1');
  }
  const pem = (label, n = 300) => Buffer.from([`-----BEGIN ${label}-----`, ...crypto.randomBytes(n).toString('base64').match(/.{1,64}/g), `-----END ${label}-----`, ''].join('\n'), 'latin1');
  // the PURE verdicts
  const RLO = String.fromCodePoint(0x202e), NUL = String.fromCodePoint(0);
  ok(VF.cleanName('../../home/x/.ssh/id_ed25519') === 'id_ed25519' && VF.cleanName('C:\\keys\\deploy.pem') === 'deploy.pem' && VF.cleanName(`gpj${RLO}.exe`) === 'gpj.exe' && VF.cleanName(`a${NUL}b.txt`) === 'ab.txt',
    'cleanName keeps the base name only — no folder (either slash), no control or direction character');
  ok(VF.cleanName('..') === null && VF.cleanName('') === null && VF.cleanName('   ') === null && VF.cleanName(7) === null && [...VF.cleanName('k'.repeat(300))].length === VF.NAME_MAX, 'a name that cleans to nothing is refused; a long one is cut to 120');
  const v0 = VF.fileVerdict(Buffer.alloc(0), 'a'), v7 = VF.fileVerdict(Buffer.alloc(7, 1), 'a'), vMax = VF.fileVerdict(Buffer.alloc(VF.FILE_MAX, 1), 'big.bin'), vOver = VF.fileVerdict(Buffer.alloc(VF.FILE_MAX + 1, 1), 'big.bin'), vNo = VF.fileVerdict(Buffer.alloc(9, 1), '../');
  ok(v0.code === 'file_empty' && v7.code === 'file_too_small' && vMax.ok && vMax.size === VF.FILE_MAX && vOver.code === 'file_too_large' && vNo.code === 'file_name_bad' && [v0, v7, vOver, vNo].every((x) => x.words && x.words.length > 20),
    'fileVerdict: empty / under 8 bytes / over 1 MB / no name ⇒ refused BY NAME with words; exactly 1 MB ⇒ kept (the owner\'s D1)', [v0.code, v7.code, vMax.ok, vOver.code, vNo.code]);
  const kPlain = opensshKey(), kEnc = opensshKey({ encrypted: true });
  ok(VF.kindOf(kPlain) === 'ssh-key' && VF.encryptedOf(kPlain) === false && VF.kindOf(kEnc) === 'ssh-key' && VF.encryptedOf(kEnc) === true,
    'an OpenSSH key is ssh-key by its header; the one with a passphrase is ENCRYPTED (read from its body — its armor is the same)');
  ok(VF.kindOf(pem('CERTIFICATE')) === 'pem' && VF.encryptedOf(pem('CERTIFICATE')) === false && VF.kindOf(pem(['ENCRYPTED', 'PRIVATE', 'KEY'].join(' '))) === 'pem' && VF.encryptedOf(pem(['ENCRYPTED', 'PRIVATE', 'KEY'].join(' '))) === true
    && VF.kindOf(pem(['RSA', 'PRIVATE', 'KEY'].join(' '))) === 'ssh-key' && VF.kindOf(Buffer.from('apiVersion: v1\nkind: Config\n')) === 'generic' && VF.kindOf(crypto.randomBytes(64)) === 'generic',
    'a certificate / a PKCS#8 key is pem (the encrypted PKCS#8 says so), a classic RSA key is ssh-key, a kubeconfig or random bytes generic — the HEADER only, never the name');
  const text = Buffer.from(['apiVersion: v1', 'kind: Config', 'client-key-data: ' + crypto.randomBytes(40).toString('base64'), '  token: ' + crypto.randomBytes(20).toString('hex'), 'client-key-data: ' + 'x'.repeat(3), ''].join('\n'));
  const ms = VF.maskSetOf(text);
  ok(ms.whole.some(([f, t]) => f === 'raw' && t === text.toString()) && ms.whole.some(([f, t]) => f === 'base64' && t === text.toString('base64')) && ms.whole.some(([f, t]) => f === 'hex' && t === text.toString('hex').toUpperCase())
    && ms.lines.length === 3 && ms.lines.every((l) => Buffer.byteLength(l) >= 16) && !ms.lines.includes('kind: Config') && !ms.lines.includes('apiVersion: v1') && ms.lines.some((l) => l.startsWith('token: ')) && ms.pieces.length > 0,
    'maskSetOf: a small file whole (raw / base64 / hex, both cases) + its 64-character pieces + every DISTINCT line of 16 bytes or more, trimmed (the short ones are ordinary text)', ms.lines);
  const bin = Buffer.concat([Buffer.from([0, 255, 0, 1, 2, 3]), crypto.randomBytes(300)]);
  const mb = VF.maskSetOf(bin);
  ok(mb.whole.some(([, t]) => t === bin.toString('base64')) && mb.whole.some(([, t]) => t === bin.toString('hex')) && mb.pieces.some(([f, t]) => f === 'base64' && t === bin.toString('base64').slice(0, 64)), 'a binary file: its base64 and hex whole and in pieces (its raw text is what the output decoder makes of it)');
  // adversarial read r1: a Latin-1 licence file is NOT strict UTF-8 — its lines are read as the run's output decoder reads them
  const lat = Buffer.concat([Buffer.from('Licensee: Soci'), Buffer.from([0xe9]), Buffer.from('t'), Buffer.from([0xe9]), Buffer.from(' Example\nLicense-Key: 3F9A-77B2-C0DE-9911-ABCD\n')]);
  const ml = VF.maskSetOf(lat);
  ok(ml.lines.includes('License-Key: 3F9A-77B2-C0DE-9911-ABCD') && ml.lines.some((l) => l.startsWith('Licensee: Soci')), 'a Latin-1 file: its lines as the output decoder reads them (lenient UTF-8) — never «no text, no lines»', ml.lines);
  // r1: a short token file — `$(cat "$VAULT_FILE{K}")` drops its newline, and its one line is under 16 bytes
  const tok = VF.maskSetOf(Buffer.from('XXXX-1234-YYYY\n'));
  ok(tok.trimmed === 'XXXX-1234-YYYY' && tok.lines.length === 0, 'a short token file: its TRIMMED whole is masked in every spelling (14 bytes, its newline dropped)', tok);
  // r1: a big file is masked by PIECES — no whole form, so the masker's window does not grow with the file
  const big = Buffer.from(Array.from({ length: 5000 }, (_, i) => `${i} ` + crypto.randomBytes(45).toString('base64')).join('\n'));
  const mbig = VF.maskSetOf(big);
  ok(mbig.whole.length === 0 && mbig.pieces.every(([, t]) => t.length <= 64) && mbig.pieces.length > 5000 && mbig.lines.every((l) => Buffer.byteLength(l) <= 1024), `a ${big.length}-byte file: no whole form, ${mbig.pieces.length} pieces of ≤ 64 characters, every line ≤ 1024 bytes`);
  ok(VF.maskSetOf(Buffer.from(['-----BEGIN', 'CERTIFICATE-----'].join(' ') + '\n' + crypto.randomBytes(48).toString('base64') + '\n')).lines.every((l) => !/BEGIN/.test(l)), 'a PEM armor line is the format\'s — never masked as the file\'s (it is in every certificate a run prints)');
  ok(VF.diskNameOf('id_rsa (1)') === 'id_rsa_1' && VF.diskNameOf('my key.pem') === 'my_key.pem' && VF.diskNameOf('a$b;c`d.key') === 'a_b_c_d.key' && VF.diskNameOf('鍵ファイル.pem') === 'file.pem' && VF.diskNameOf('') === 'file' && Buffer.byteLength(VF.diskNameOf('k'.repeat(300) + '.yaml')) <= 80 && VF.diskNameOf('k'.repeat(300) + '.yaml').endsWith('.yaml'),
    'diskNameOf: the run writes a shell-safe name (no space, no $ ; `), at most 80 bytes, its extension kept');
  const many = Buffer.from(Array.from({ length: 6000 }, (_, i) => `line ${String(i).padStart(5, '0')} ${'z'.repeat(50)}`).join('\n'));
  const mm = VF.maskSetOf(many);
  ok(mm.lines.length > 1000 && mm.lines.length <= VF.LINES_MAX && mm.lines.reduce((s, l) => s + Buffer.byteLength(l), 0) <= VF.LINE_BYTES_MAX, `the lines stop at the measured bound (${mm.lines.length} lines, ≤ ${VF.LINE_BYTES_MAX} bytes) — the whole-file forms still hold past it`);
  const wb = VF.wireBytesOf(bin.toString('base64'), { size: bin.length });
  ok(wb.ok && wb.bytes.equals(bin) && VF.wireBytesOf('a b=', {}).code === 'bytes_bad' && VF.wireBytesOf('QUJD', { size: 4 }).code === 'bytes_bad' && VF.wireBytesOf('QUJD').ok && VF.wireBytesOf('').code === 'file_empty' && VF.wireBytesOf('QUJ').code === 'bytes_bad',
    'wireBytesOf: strict base64 only (a space, a cut quantum ⇒ bytes_bad), the size the sender said must be the size that arrived');

  // the engine
  const d = path.join(ROOT, 'file-entry'); fs.mkdirSync(d, { recursive: true });
  const frames = [];
  const v = VE.create({ dataDir: d, kdf: CHEAP, log: quiet, idleTimer: false, register: false, bcast: (m) => frames.push(JSON.stringify(m)) });
  ok((await v.filePut('keyfile:0123456789', bin, { filename: 'blob.bin' })).code === 'vault_not_set_up', 'NOT SET UP ⇒ a file is refused by name (vault_not_set_up), nothing written');
  await v.setup(PW);
  ok(VE.isSecretName('keyfile:0123456789') && !VE.isSecretName('keyfile:') && !VE.isSecretName('keyfile:../x'), 'the kind: `keyfile:<id>` is a secret name (the owner\'s files — decision D4)');
  const put = (await v.filePut('keyfile:0123456789', bin, { filename: '../tmp/blob.bin', prov: 'uploaded', label: 'Blob', note: 'the licence file' }));
  ok(put.ok && put.file && put.file.name === 'blob.bin' && put.file.size === bin.length && put.file.kind === 'generic' && put.file.encrypted === false && !('id' in put.file) && !('sha256' in put.file),
    'filePut ⇒ { ok, file: { name, size, kind, encrypted } } — its id (a path piece) and digest stay in the vault', put);
  const rec = fs.readFileSync(path.join(d, 'vault.json'), 'utf8');
  const box = JSON.parse(rec).entries['keyfile:0123456789'];
  ok(box && box.file && /^[0-9a-f]{10}$/.test(box.file.id) && box.file.size === bin.length && !('sha256' in box.file) && !rec.includes(crypto.createHash('sha256').update(bin).digest('hex')) && box.prov === 'uploaded' && box.label === 'Blob',
    'the box carries the file\'s FACTS (id, name, size, kind) beside its words — and NO digest of its bytes anywhere in vault.json (the cure: RULE 5′ — a short token file\'s sha256 is a guess away)');
  ok(!rec.includes(bin.toString('base64').slice(0, 40)) && !rec.includes(bin.toString('hex').slice(0, 40)) && rec.length < 4000, 'vault.json holds NONE of the bytes (no base64, no hex) — only the wrapped 32-byte file key');
  const vfile = path.join(d, 'vault-files', `${box.file.id}.vfile`);
  const vst = fs.statSync(vfile), dst = fs.statSync(path.join(d, 'vault-files'));
  const sealed = fs.readFileSync(vfile);
  ok((vst.mode & 0o777) === 0o600 && (dst.mode & 0o777) === 0o700 && sealed.subarray(0, 6).toString('latin1') === 'VSVF1\n' && sealed.indexOf(bin.subarray(6, 40)) < 0 && sealed.length === bin.length + 34,
    'the bytes are SEALED in data/vault-files/<id>.vfile (0600 in a 0700 folder): magic · iv · tag · ciphertext — no plaintext run in it');
  const op = (await v.fileOpen('keyfile:0123456789'));
  ok(op.ok && Buffer.isBuffer(op.bytes) && op.bytes.equals(bin) && op.file.name === 'blob.bin', 'fileOpen (the ONE road) opens it to the very bytes'); if (op.bytes) op.bytes.fill(0);
  const sg = v.secretGet('keyfile:0123456789');
  ok(!sg.ok && sg.code === 'is_a_file' && !('value' in sg), 'secretGet REFUSES a file entry by name (is_a_file) — no door gets its box value (the file key)');
  let revealed = null, revealCode = null;
  try { revealed = VC.secretSource({ vault: v }).vaultReveal('keyfile:0123456789'); } catch (e) { revealCode = e && e.code; }
  ok(revealed === null && revealCode === 'is_a_file', 'the Vault window\'s reveal source meets the same refusal (a file is never SHOWN — its download is its own door)', { revealCode });
  const sn = v.secretNames().find((x) => x.name === 'keyfile:0123456789');
  ok(sn && sn.file && sn.file.name === 'blob.bin' && sn.file.size === bin.length && !('id' in sn.file) && !('sha256' in sn.file) && sn.label === 'Blob', 'secretNames carries the file\'s public facts (name, size, kind) — no id, no digest');
  ok(v.fileOf('keyfile:0123456789').id === box.file.id && v.fileOf('secret:nope') === null, 'fileOf = the box\'s facts (the doors ask it before opening anything)');
  // a re-put: a NEW sealed file, the old one SHREDDED once the record names the new one
  const link = path.join(ROOT, 'file-entry-old-link'); fs.linkSync(vfile, link);
  const bin2 = Buffer.concat([bin, Buffer.from('v2')]);
  const re = (await v.filePut('keyfile:0123456789', bin2, { filename: 'blob.bin', prov: 'uploaded' }));
  await v.filesSettled();   // the cure: the old file is shredded off the main loop, after the record names the new one
  const box2 = JSON.parse(fs.readFileSync(path.join(d, 'vault.json'), 'utf8')).entries['keyfile:0123456789'];
  ok(re.ok && box2.file.id !== box.file.id && !fs.existsSync(vfile) && fs.existsSync(path.join(d, 'vault-files', `${box2.file.id}.vfile`)) && !fs.readFileSync(link).equals(sealed),
    'a re-put seals a NEW file and SHREDS the old one (a hard link to it reads the overwrite, not the old ciphertext)');
  fs.unlinkSync(link);
  // a text value is never turned into a file — and a file never into a text value (the owner's D5)
  ok(v.secretPut('secret:0a1b2c3d4e', 'a text value of the owner', { prov: 'owner', label: 'x' }).ok && (await v.filePut('secret:0a1b2c3d4e', bin, { filename: 'b.bin' })).code === 'not_a_file', 'a TEXT entry ⇒ filePut refused not_a_file (never upgraded)');
  const af = (await v.agentFilePut('agent:conv-9/deploy-key', kEnc, { filename: 'id_ed25519', actor: 'Deploy chat', note: 'the deploy key' }));
  ok(af.ok && af.ref === 'vault://agent:conv-9/deploy-key' && af.file.kind === 'ssh-key' && af.file.encrypted === true, 'agentFilePut (put --file) ⇒ its ref + the file\'s facts; a key with its passphrase is stored AS IS and SAID (encrypted — the owner\'s change, round 3)', af);
  ok(v.agentPut('agent:conv-9/deploy-key', 'now a text value').code === 'is_a_file' && v.agentPut('agent:conv-9/t', 'a text value here').ok && (await v.agentFilePut('agent:conv-9/t', bin, { filename: 'b.bin' })).code === 'not_a_file',
    'a text put over a FILE entry ⇒ is_a_file; a file put over a TEXT entry ⇒ not_a_file');
  const idBefore = v.fileOf('agent:conv-9/deploy-key').id;
  ok(v.agentMint('agent:conv-9/deploy-key', {}).code === 'is_a_file' && v.secretPut('agent:conv-9/deploy-key', 'x'.repeat(20)).code === 'is_a_file' && v.fileOf('agent:conv-9/deploy-key').id === idBefore && fs.existsSync(path.join(d, 'vault-files', `${idBefore}.vfile`)),
    'adversarial read r1: a MINT (or any text write) over a file entry ⇒ is_a_file — the file and its sealed bytes stay (it once became a random text value later runs wrote out as the key)');
  const before = fs.readdirSync(path.join(d, 'vault-files')).length;
  const bb = await v.agentFilePut('agent:conv-9/x', bin, { filename: 'b.bin', expect: { sha256: 'f'.repeat(64) } });
  await v.filesSettled();
  ok(bb.code === 'bytes_bad' && fs.readdirSync(path.join(d, 'vault-files')).length === before && !v.fileOf('agent:conv-9/x'),
    'the sender\'s digest differs ⇒ bytes_bad, its sealed file shredded, no entry');
  ok((await v.filePut('keyfile:0b1b2c3d4e', Buffer.alloc(VF.FILE_MAX + 1, 7), { filename: 'big.bin' })).code === 'file_too_large' && !v.fileOf('keyfile:0b1b2c3d4e'), 'over 1 MB ⇒ file_too_large (by name), nothing kept');
  const audit = fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8');
  ok(/"event":"vault-agent-put"/.test(audit) && /"file":\{"size":/.test(audit) && !audit.includes(kEnc.toString('latin1').split('\n')[1].slice(0, 30)) && !frames.some((f) => f.includes(bin.toString('base64').slice(0, 30))),
    'the put is audited by name, size and kind — no byte in any audit line or broadcast frame');
  // damaged: a file moved onto another id does not open (the id is its additional data), a flipped byte does not open
  const idA = JSON.parse(fs.readFileSync(path.join(d, 'vault.json'), 'utf8')).entries['agent:conv-9/deploy-key'].file.id;
  const fA = path.join(d, 'vault-files', `${idA}.vfile`), keepA = fs.readFileSync(fA);
  fs.copyFileSync(path.join(d, 'vault-files', `${box2.file.id}.vfile`), fA);
  ok((await v.fileOpen('agent:conv-9/deploy-key')).code === 'file_damaged', 'another entry\'s sealed file moved onto this id ⇒ file_damaged (never another file\'s bytes)');
  const flip = Buffer.from(keepA); flip[flip.length - 3] ^= 1; fs.writeFileSync(fA, flip);
  ok((await v.fileOpen('agent:conv-9/deploy-key')).code === 'file_damaged', 'one flipped byte ⇒ file_damaged');
  fs.writeFileSync(fA, keepA);
  const back = (await v.fileOpen('agent:conv-9/deploy-key'));
  ok(back.ok && back.bytes.equals(kEnc), 'the file put back ⇒ it opens again'); if (back.bytes) back.bytes.fill(0);
  // LOCKED: refused by name, nothing read, nothing written — its facts still readable (no DEK)
  v.lock('door');
  const nFiles = fs.readdirSync(path.join(d, 'vault-files')).length;
  ok((await v.filePut('keyfile:0c1b2c3d4e', bin, { filename: 'b.bin' })).code === KF.VAULT_LOCKED && (await v.fileOpen('keyfile:0123456789')).code === KF.VAULT_LOCKED && fs.readdirSync(path.join(d, 'vault-files')).length === nFiles && v.fileOf('keyfile:0123456789').size === bin2.length,
    'LOCKED ⇒ filePut and fileOpen refused vault_locked, no file written; fileOf still answers (facts, no key)');
  // the delete: the entry and its sealed file go together (a locked vault forgets too)
  const fK = path.join(d, 'vault-files', `${box2.file.id}.vfile`), lk2 = path.join(ROOT, 'file-entry-del-link'); fs.linkSync(fK, lk2); const sealedK = fs.readFileSync(fK);
  const dropped = v.secretDrop('keyfile:0123456789');
  await v.filesSettled();
  ok(dropped.ok && !fs.existsSync(fK) && !fs.readFileSync(lk2).equals(sealedK) && !v.fileOf('keyfile:0123456789'), 'secretDrop SHREDS the sealed file with the entry (a hard link reads the overwrite) — locked too');
  fs.unlinkSync(lk2);
  v.close();
  // THE START's SWEEP (主开发 r4625, the MUST): a stale temp file goes; a sealed file no entry names (a put that died between its file
  // and the record, a record restored from an older copy) is KEPT and SAID — one journal line, its count and its code; a live one
  // stays — and nothing is swept while the record cannot be read
  // a temp file is stale by its writer (a pid that is gone) or by its age (over a minute): pid 1 is always alive, so the stale
  // one is aged two minutes and a fresh one of a live writer stays (a put in flight in another process)
  const orphan = path.join(d, 'vault-files', 'abcdefabcd.vfile'), tmp = path.join(d, 'vault-files', 'abcdefabcd.vfile.tmp-1-0a0b0c0d'), young = path.join(d, 'vault-files', 'abcdefabcd.vfile.tmp-1-0e0f0a0b');
  // the cure (round 2): the sweep runs OFF the main loop beside puts — a put in flight is spared by its ID (the engine's in-flight set,
  // from mint to record), never by an age: a FRESH orphan goes like an old one (a crash's leftover at the next boot, whatever its age)
  const fresh = path.join(d, 'vault-files', 'fedcbafedc.vfile');
  fs.writeFileSync(orphan, 'orphan'); fs.writeFileSync(tmp, 'temp'); fs.writeFileSync(young, 'temp in flight'); fs.writeFileSync(fresh, 'a fresh orphan');
  const aged = (Date.now() - 120_000) / 1000; fs.utimesSync(tmp, aged, aged);
  const said2 = [], cap2 = { log() {}, warn: (s) => said2.push(String(s)) };
  const v2 = VE.create({ dataDir: d, kdf: CHEAP, log: cap2, idleTimer: false, register: false });
  await v2.filesSettled();
  const unnamed2 = said2.filter((s) => /files_unnamed/.test(s));
  ok(fs.existsSync(orphan) && fs.existsSync(fresh) && !fs.existsSync(tmp) && fs.existsSync(fA), 'the start\'s sweep shreds a stale temp file — a sealed file NO ENTRY NAMES is KEPT (an old one and a fresh one), the live one stays');
  ok(unnamed2.length === 1 && /\b2 sealed file\(s\)/.test(unnamed2[0]) && /KEPT \(files_unnamed\)/.test(unnamed2[0]) && !said2.join(' ').includes('abcdefabcd'), '…and SAID: ONE journal line with their count and the code files_unnamed (no id, no name)', said2);
  ok(fs.existsSync(young), 'a fresh temp file of a writer that is alive stays (another process\'s put in flight)');
  fs.rmSync(young, { force: true }); fs.rmSync(orphan, { force: true }); fs.rmSync(fresh, { force: true });
  v2.close();
  // …the store's own rule, the engine's predicate: a sealed file and a temp of a put IN FLIGHT stay (this process's own temp too);
  // the same names out of flight go
  {
    const VFS = require(path.join(REPO, 'src/server/vault-files.js'));
    const fd = path.join(ROOT, 'file-sweep-flight'); fs.mkdirSync(fd, { recursive: true });
    const st = VFS.create({ dataDir: fd }), key = crypto.randomBytes(32);
    await st.write('0f0f0f0f0f', key, Buffer.from('a sealed file of a put in flight'));
    const ownTmp = path.join(st.dir, `0e0e0e0e0e.vfile.tmp-${process.pid}-0a0b0c0d`); fs.writeFileSync(ownTmp, 'this process\'s own temp, in flight');
    const inFlight = new Set(['0f0f0f0f0f', '0e0e0e0e0e']);
    const n1 = await st.sweep((id) => inFlight.has(id), { dropped: () => true });
    const kept = fs.existsSync(path.join(st.dir, '0f0f0f0f0f.vfile')) && fs.existsSync(ownTmp);
    const n2 = await st.sweep(() => false, { dropped: () => true });
    ok(n1.shredded === 0 && kept && n2.shredded === 2 && !fs.existsSync(ownTmp) && !fs.existsSync(path.join(st.dir, '0f0f0f0f0f.vfile')),
      'round 2: the sweep spares a put IN FLIGHT by its id (its sealed file — even one named dropped — and this process\'s own temp) and takes them once out of flight', { n1, kept, n2 });
    // 主开发 r4625: THE STORE's LAW — a sealed file goes ONLY when the record names it dropped; one no list drops is kept and counted
    await st.write('0a0a0a0a0a', key, Buffer.from('a sealed file the record says nothing of'));
    const n3 = await st.sweep(() => false);
    ok(n3.shredded === 0 && n3.kept === 1 && fs.existsSync(path.join(st.dir, '0a0a0a0a0a.vfile')), 'a sealed file NO list drops is KEPT and counted (the store never guesses from a silence)', n3);
    // the record GONE MID-WALK (behaviour): the dropped answer is asked at EACH file's own turn — once it says «no record» the rest stay
    await st.write('0b0b0b0b0b', key, Buffer.from('a dropped file the walk reaches first'));
    await st.write('0c0c0c0c0c', key, Buffer.from('a dropped file the walk reaches after the record went away'));
    const listed = new Set(['0b0b0b0b0b', '0c0c0c0c0c']); let first = null, asks = 0;
    const n4 = await st.sweep(() => false, { dropped: (id) => { asks++; if (!listed.has(id)) return false; if (first === null) first = id; return id === first; } });   // the record answers for the listed file walked first, then it is gone
    const left4 = ['0b0b0b0b0b', '0c0c0c0c0c'].filter((id) => fs.existsSync(path.join(st.dir, `${id}.vfile`)));
    ok(n4.shredded === 1 && left4.length === 1 && left4[0] !== first && asks >= 4, 'the record GONE MID-WALK: the listed file walked first (its record there) goes, the next one (no record any more) is KEPT — the answer is asked at each file\'s own turn', { n4, left4, first, asks });
    // r4628: THE ID — 10 hex from 5 random bytes, drawn again while it is taken; an id it may not use is never answered
    const seq = ['0b0b0b0b0b', 'not hex', '0d0d0d0d0d'];
    const st2 = VFS.create({ dataDir: fd, randomId: () => seq.shift() });
    ok(st2.mintId((id) => id === '0b0b0b0b0b') === '0d0d0d0d0d' && /^[0-9a-f]{10}$/.test(VFS.create({ dataDir: fd }).mintId()), 'mintId draws again while the id is taken (or not 10 hex) — the store\'s own default is 5 random bytes', seq);
    let threw = null; try { await st.write('0a0a0a0a0a', key, Buffer.from('over a kept file')); } catch (e) { threw = e.code; }
    ok(threw === 'file_id_taken' && fs.readFileSync(path.join(st.dir, '0a0a0a0a0a.vfile')).length > 40, 'a write NEVER goes over a sealed file already on disk (file_id_taken) — a kept file is never overwritten by a new put', threw);
    // 主开发 r4625 (2): the opened bytes are ONE buffer of their own (never a slice of the shared pool, whose whole slab a message to the
    // run's worker would copy)
    const small = await st.read('0a0a0a0a0a', key, {});
    ok(small.byteOffset === 0 && small.buffer.byteLength === small.length && small.length > 0, 'a small file\'s opened bytes own their whole backing store (byteOffset 0, the store\'s size = the file\'s)', { off: small.byteOffset, store: small.buffer.byteLength, len: small.length });
    small.fill(0);
    key.fill(0);
  }
  // round 2: a read that LOSES to a drop (or a re-put) says what happened — file_moved / entry_unknown — never «restore data/vault-files
  // from a backup» about a healthy vault (the drop shreds THIS file under the read)
  {
    const v5 = VE.create({ dataDir: d, kdf: CHEAP, log: quiet, idleTimer: false, register: false });
    await v5.unlock(PW);
    ok((await v5.filePut('keyfile:0d0e0f0a0b', bin, { filename: 'race.bin', prov: 'uploaded' })).ok, 'a file to race');
    const pending = v5.fileOpen('keyfile:0d0e0f0a0b');
    v5.secretDrop('keyfile:0d0e0f0a0b');   // synchronous: the record no longer names it before the read resumes
    const lost = await pending;
    await v5.filesSettled();
    ok(!lost.ok && ['file_moved', 'entry_unknown'].includes(lost.code) && !('bytes' in lost), 'a read that loses to a drop ⇒ file_moved / entry_unknown, no byte — never file_damaged / file_missing', lost.code);
    v5.close();
  }
  // the round's should (r4676 page): the read REFUSED at its call (a placed EIO — the store-read family's rule), with a file ON the
  // dropped list: the record is HELD (record_unreadable), nothing is swept, the listed file stays. (Its red is structural: with the
  // record unread there is no list to carry out — droppedOf(null) is empty — so no guard can be cut to make a start shred it.)
  {
    const recText = fs.readFileSync(path.join(d, 'vault.json'), 'utf8'), rec = JSON.parse(recText);
    rec.filesDropped = [...(Array.isArray(rec.filesDropped) ? rec.filesDropped : []), 'abcdefabcd'];
    fs.writeFileSync(path.join(d, 'vault.json'), JSON.stringify(rec, null, 2) + '\n'); fs.writeFileSync(orphan, 'a listed file');
    const cfs = require('fs'), keepRead = cfs.readFileSync; let placed = 0;
    cfs.readFileSync = function (f, ...a) { if (!placed && String(f) === path.join(d, 'vault.json')) { placed++; throw Object.assign(new Error('EIO: placed'), { code: 'EIO' }); } return keepRead.call(this, f, ...a); };
    let v3 = null, st3 = null;
    try { v3 = VE.create({ dataDir: d, kdf: CHEAP, log: quiet, idleTimer: false, register: false }); } finally { cfs.readFileSync = keepRead; }
    await v3.filesSettled(); st3 = v3.state();
    ok(placed === 1 && fs.existsSync(orphan) && fs.existsSync(fA), 'vault.json\'s read REFUSED at its call (a placed EIO) ⇒ the record is held, NOTHING is swept — a file the record lists as dropped stays (nothing at a start removes a file because a record is unread)', { placed, state: st3 });
    v3.close();
    fs.writeFileSync(path.join(d, 'vault.json'), recText);
    fs.rmSync(orphan, { force: true });
  }
  // 主开发 r4625 — THE MUST: A RECORD OLDER THAN THE FOLDER (vault.json restored from an earlier copy, which file_missing's own words
  // invite) names no file put after it: the next start KEEPS that file and says it; the right record put back, it opens again.
  // THE DROPPED LIST: a re-put and a drop name the old file dropped in the same record write that stops naming it (append-only); an
  // instruction left by a crash (named dropped, its file still on disk) is carried out at the next start
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const MO = mutantCopies('vault-engine-older', REPO);
    const ESo = fs.readFileSync(path.join(REPO, 'src/server/vault-engine.js'), 'utf8');
    const olderLeg = async (E) => {
      const dd = path.join(ROOT, `file-older-${Math.random().toString(16).slice(2, 8)}`); fs.mkdirSync(dd, { recursive: true });
      const v0 = E.create({ dataDir: dd, kdf: CHEAP, log: quiet, idleTimer: false, register: false });
      await v0.setup(PW, {});
      const ok0 = (await v0.filePut('keyfile:0a2a3a4a5a', bin, { filename: 'first.bin', prov: 'uploaded' })).ok;
      const older = fs.readFileSync(path.join(dd, 'vault.json'), 'utf8');   // the earlier copy
      const pb = await v0.filePut('keyfile:0b2b3b4b5b', Buffer.concat([bin, Buffer.from('second')]), { filename: 'second.bin', prov: 'uploaded' });
      const newer = fs.readFileSync(path.join(dd, 'vault.json'), 'utf8'), idB = v0.fileOf('keyfile:0b2b3b4b5b').id;
      await v0.filesSettled(); v0.close();
      fs.writeFileSync(path.join(dd, 'vault.json'), older);   // restored from the earlier copy
      const said = [], cap = { log() {}, warn: (s) => said.push(String(s)) };
      const v1 = E.create({ dataDir: dd, kdf: CHEAP, log: cap, idleTimer: false, register: false });
      await v1.filesSettled(); v1.close();
      const keptB = fs.existsSync(path.join(dd, 'vault-files', `${idB}.vfile`));
      fs.writeFileSync(path.join(dd, 'vault.json'), newer);   // the right record put back
      const v2b = E.create({ dataDir: dd, kdf: CHEAP, log: quiet, idleTimer: false, register: false });
      await v2b.unlock(PW); await v2b.filesSettled();
      const o = await v2b.fileOpen('keyfile:0b2b3b4b5b'); const opens = !!(o.ok && o.bytes.equals(Buffer.concat([bin, Buffer.from('second')]))); if (o.bytes) o.bytes.fill(0);
      v2b.close();
      return { put: ok0 && pb.ok, keptB, said: said.filter((s) => /files_unnamed/.test(s)).length, opens };
    };
    const ol = await olderLeg(VE);
    ok(ol.put && ol.keptB && ol.said === 1 && ol.opens, 'THE MUST (r4625): a record OLDER than the folder names no file put after it — the next start KEEPS that file and SAYS it (files_unnamed); the right record put back, it opens again', ol);
    const releaseForm = MO.load('src/server/vault-engine.js', anchored(ESo, '    const r = await files.sweep(fileLive, { dropped: fileDropped });', '    const r = await files.sweep(fileLive, { dropped: (id) => !fileLive(id) });', 'test-vault-engine the release-form sweep'), 'releaseform');
    const olr = await olderLeg(releaseForm);
    ok(!olr.keptB && !olr.opens, 'red control: «the release-form sweep» (what the record does not name goes) SHREDS it — the right record put back, the file is gone for good', olr);
    // r4774 (A): THE FILE ID IS THE RECORD's OWN COUNTER, AND THE DROPPED LIST HOLDS ONLY THE INSTRUCTIONS NOT YET CARRIED OUT
    const recOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8'));
    const mkE = (E, dir, extra = {}) => E.create({ dataDir: dir, kdf: CHEAP, log: quiet, idleTimer: false, register: false, ...extra });
    const dl = path.join(ROOT, 'file-dropped-list'); fs.mkdirSync(dl, { recursive: true });
    const vl = mkE(VE, dl);
    await vl.setup(PW, {});
    await vl.filePut('keyfile:0c2c3c4c5c', bin, { filename: 'a.bin', prov: 'uploaded' }); const id1 = vl.fileOf('keyfile:0c2c3c4c5c').id, seq1 = recOf(dl).fileSeq;
    await vl.filePut('keyfile:0c2c3c4c5c', Buffer.concat([bin, Buffer.from('2')]), { filename: 'a.bin', prov: 'uploaded' }); const id2 = vl.fileOf('keyfile:0c2c3c4c5c').id;
    const afterRePut = recOf(dl);
    ok(id1 === '0000000000' && seq1 === 1 && id2 === '0000000001' && afterRePut.fileSeq === 2 && (afterRePut.filesDropped || []).join() === id1,
      'THE FILE ID IS THE RECORD\'s COUNTER (r4774 A): the first file 0000000000, the next 0000000001, fileSeq raised in the write that names each; a re-put names the old file DROPPED in that same write', { id1, id2, seq1, fileSeq: afterRePut.fileSeq, list: afterRePut.filesDropped });
    await vl.filesSettled();   // the re-put's shred is CONFIRMED
    vl.secretDrop('keyfile:0c2c3c4c5c'); await vl.filesSettled();
    const afterDrop = recOf(dl).filesDropped || [];
    await vl.filePut('keyfile:0f2f3f4f5f', bin, { filename: 'z.bin', prov: 'uploaded' }); await vl.filesSettled();   // one more record write
    const afterNext = recOf(dl).filesDropped || [];
    ok(afterDrop.join() === id2 && afterNext.length === 0 && !fs.existsSync(path.join(dl, 'vault-files', `${id1}.vfile`)) && !fs.existsSync(path.join(dl, 'vault-files', `${id2}.vfile`)),
      'an id LEAVES the list at the next record write after its shred is CONFIRMED (the re-put\'s at the drop\'s write, the drop\'s at the next) — the list holds only instructions not yet carried out', { afterDrop, afterNext });
    vl.secretDrop('keyfile:0f2f3f4f5f'); await vl.filesSettled();
    await vl.filePut('keyfile:0e2e3e4e5e', bin, { filename: 'b.bin', prov: 'uploaded' }); const id3 = vl.fileOf('keyfile:0e2e3e4e5e').id;
    await vl.filesSettled(); vl.close();
    const keep3 = fs.readFileSync(path.join(dl, 'vault-files', `${id3}.vfile`));
    const rec3 = recOf(dl); delete rec3.entries['keyfile:0e2e3e4e5e']; rec3.filesDropped = [...(rec3.filesDropped || []), id3];
    fs.writeFileSync(path.join(dl, 'vault.json'), JSON.stringify(rec3));   // a crash between the drop's record write and its shred: the instruction left, the file still there
    const vc = mkE(VE, dl); await vc.filesSettled();
    ok(keep3.length > 40 && !fs.existsSync(path.join(dl, 'vault-files', `${id3}.vfile`)), 'a crash between a drop\'s record write and its shred leaves an INSTRUCTION: the next start shreds what the record names dropped', id3);
    vc.close();
    // THE COUNTER ACROSS A RESTART, the list pruned (its red: the counter not raised — the next start would mint a dropped file's id again)
    const counterLeg = async (E) => {
      const dc = path.join(ROOT, `file-counter-${Math.random().toString(16).slice(2, 8)}`); fs.mkdirSync(dc, { recursive: true });
      const a = mkE(E, dc); await a.setup(PW, {});
      await a.filePut('keyfile:0a4a5a6a7a', bin, { filename: 'a.bin', prov: 'uploaded' }); const idA = a.fileOf('keyfile:0a4a5a6a7a').id;
      a.secretDrop('keyfile:0a4a5a6a7a'); await a.filesSettled();
      await a.filePut('keyfile:0b4b5b6b7b', bin, { filename: 'b.bin', prov: 'uploaded' }); await a.filesSettled();   // its write prunes A's confirmed id
      a.secretDrop('keyfile:0b4b5b6b7b'); await a.filesSettled(); const idB = '0000000001';
      a.agentPut('agent:conv-9/prune-carrier', 'a text value whose write carries the prune', { actor: 'Lane X' });   // a record write: B's confirmed id leaves the list
      a.close();
      const b = mkE(E, dc); await b.unlock(PW); await b.filesSettled();
      await b.filePut('keyfile:0c4c5c6c7c', bin, { filename: 'c.bin', prov: 'uploaded' }); const idC = b.fileOf('keyfile:0c4c5c6c7c').id;
      b.close();
      return { idA, idB, idC, again: [idA, idB].includes(idC) };
    };
    const cl = await counterLeg(VE);
    ok(cl.idA === '0000000000' && cl.idC === '0000000002' && !cl.again, 'r4628 by construction: a restart, the list pruned — the next file takes the COUNTER\'s id, never a dropped file\'s', cl);
    const noSeq = MO.load('src/server/vault-engine.js', anchored(ESo, "  const withSeq = (rec, id) => ({ ...rec, fileSeq: Math.max(Number.isInteger(rec.fileSeq) && rec.fileSeq >= 0 ? rec.fileSeq : 0, idNum(id) + 1) });", '  const withSeq = (rec) => rec;', 'test-vault-engine the counter not raised'), 'noseq');
    const clr = await counterLeg(noSeq);
    ok(clr.again, 'red control: «the counter not raised» mints a dropped file\'s id again after a restart', clr);
    // A KEPT FILE ON DISK AT THE COUNTER: the write refuses it (file_id_taken), the mint steps past, the kept file untouched
    {
      const dk = path.join(ROOT, 'file-counter-kept'); fs.mkdirSync(dk, { recursive: true });
      const k = mkE(VE, dk); await k.setup(PW, {}); await k.filesSettled();
      await k.filePut('keyfile:0d4d5d6d7d', bin, { filename: 'd.bin', prov: 'uploaded' });   // id 0000000000, fileSeq 1
      const planted = path.join(dk, 'vault-files', '0000000001.vfile'); fs.writeFileSync(planted, 'a kept file at the counter');
      const r = await k.filePut('keyfile:0e4e5e6e7e', bin, { filename: 'e.bin', prov: 'uploaded' });
      ok(r.ok && k.fileOf('keyfile:0e4e5e6e7e').id === '0000000002' && fs.readFileSync(planted, 'utf8') === 'a kept file at the counter' && recOf(dk).fileSeq === 3,
        'a kept file AT the counter: the write refuses its id (file_id_taken), the mint STEPS PAST it — the kept file untouched, fileSeq past both', { ok: r.ok, id: r.ok && k.fileOf('keyfile:0e4e5e6e7e').id, fileSeq: recOf(dk).fileSeq });
      k.close();
    }
    // A BROKEN COUNTER mints past every id the record names or lists AND every file the start met on disk (r4774 A 3)
    {
      const db = path.join(ROOT, 'file-counter-broken'); fs.mkdirSync(db, { recursive: true });
      const k = mkE(VE, db); await k.setup(PW, {});
      await k.filePut('keyfile:0f4f5f6f7f', bin, { filename: 'f.bin', prov: 'uploaded' }); await k.filesSettled(); k.close();
      const rb = recOf(db); rb.fileSeq = 'broken'; rb.filesDropped = ['0000000007']; fs.writeFileSync(path.join(db, 'vault.json'), JSON.stringify(rb));
      fs.writeFileSync(path.join(db, 'vault-files', '000000000c.vfile'), 'a kept file met at the start');
      const k2 = mkE(VE, db); await k2.unlock(PW); await k2.filesSettled();
      await k2.filePut('keyfile:0a5a6a7a8a', bin, { filename: 'g.bin', prov: 'uploaded' });
      const idG = k2.fileOf('keyfile:0a5a6a7a8a').id; k2.close();
      ok(idG === '000000000d', 'a BROKEN counter mints from one past the highest id the record names (0) or lists (7) AND past every file the start met on disk (c) ⇒ 000000000d', idG);
    }
    // A FILE LIVE UNDER THE RECORD is never shredded, even if the record's own list names it (a stale or crafted list): the proof of r4625
    {
      const dv = path.join(ROOT, 'file-live-listed'); fs.mkdirSync(dv, { recursive: true });
      const k = mkE(VE, dv); await k.setup(PW, {});
      await k.filePut('keyfile:0b5b6b7b8b', bin, { filename: 'h.bin', prov: 'uploaded' }); const idH = k.fileOf('keyfile:0b5b6b7b8b').id; await k.filesSettled(); k.close();
      const rv = recOf(dv); rv.filesDropped = [idH]; fs.writeFileSync(path.join(dv, 'vault.json'), JSON.stringify(rv));
      const k2 = mkE(VE, dv); await k2.unlock(PW); await k2.filesSettled();
      const o = await k2.fileOpen('keyfile:0b5b6b7b8b'); const opens = !!(o.ok && o.bytes.equals(bin)); if (o.bytes) o.bytes.fill(0); k2.close();
      ok(opens, 'a file the record NAMES is never shredded at a start, even when its list names it too — a stale list can never take a file live under it', idH);
    }
    // A DROPPED FILE WHOSE SHRED FAILED is counted apart (files_drop_owed), never as unnamed (the round's should)
    {
      const dw = path.join(ROOT, 'file-drop-owed'); fs.mkdirSync(dw, { recursive: true });
      const k = mkE(VE, dw); await k.setup(PW, {}); await k.filesSettled(); k.close();
      const rw = recOf(dw); rw.filesDropped = ['0000000009']; fs.writeFileSync(path.join(dw, 'vault.json'), JSON.stringify(rw));
      fs.mkdirSync(path.join(dw, 'vault-files', '0000000009.vfile'), { recursive: true });   // a «file» that cannot be unlinked (a folder)
      const said = [], cap = { log() {}, warn: (s) => said.push(String(s)) };
      const k2 = mkE(VE, dw, { log: cap }); await k2.filesSettled(); k2.close();
      ok(said.some((s) => /\b1 sealed file\(s\)/.test(s) && /files_drop_owed/.test(s)) && !said.some((s) => /files_unnamed/.test(s)), 'a dropped file whose shred failed at a start is SAID apart (files_drop_owed — the next start takes it), never as a file the record does not name', said);
    }
    // A FAILED LOOK PRUNES NOTHING (r4774 A 1): a shred that fails otherwise, a start whose look fails otherwise — the id stays listed;
    // its red: a prune on any shred's answer
    {
      const VFSm = require(path.join(REPO, 'src/server/vault-files.js')), realC = VFSm.create;
      let fail = true;
      VFSm.create = (o) => { const st = realC(o); return { ...st, shred: async (id) => (fail ? false : st.shred(id)), has: async (id) => (fail ? 'unknown' : st.has(id)) }; };
      const failLeg = async (E) => {
        fail = true;
        const df = path.join(ROOT, `file-failed-look-${Math.random().toString(16).slice(2, 8)}`); fs.mkdirSync(df, { recursive: true });
        const k = mkE(E, df); await k.setup(PW, {});
        await k.filePut('keyfile:0c5c6c7c8c', bin, { filename: 'i.bin', prov: 'uploaded' }); const idI = k.fileOf('keyfile:0c5c6c7c8c').id;
        k.secretDrop('keyfile:0c5c6c7c8c'); await k.filesSettled();   // its shred FAILS
        await k.filePut('keyfile:0d5d6d7d8d', bin, { filename: 'j.bin', prov: 'uploaded' }); await k.filesSettled();   // the next record write
        const listed = (recOf(df).filesDropped || []).includes(idI), onDisk = fs.existsSync(path.join(df, 'vault-files', `${idI}.vfile`));
        k.close(); fail = false;
        const k2 = mkE(E, df); await k2.unlock(PW); await k2.filesSettled(); k2.close();   // the next start carries the instruction out
        return { listed, onDisk, goneAfterStart: !fs.existsSync(path.join(df, 'vault-files', `${idI}.vfile`)) };
      };
      try {
        const fl = await failLeg(VE);
        ok(fl.listed && fl.onDisk && fl.goneAfterStart, 'a shred that FAILS keeps the id on the list (a look that failed otherwise prunes nothing) — the next start shreds it', fl);
        const pruneAny = MO.load('src/server/vault-engine.js', anchored(ESo, "if ((g === true || g === 'absent') && droppedOf(record).includes(String(id))) confirmedGone.add(String(id));", 'if (droppedOf(record).includes(String(id))) confirmedGone.add(String(id));', 'test-vault-engine a prune on any shred answer'), 'pruneany');
        const flr = await failLeg(pruneAny);
        ok(!flr.listed && flr.onDisk && !flr.goneAfterStart, 'red control: «a prune on any shred answer» drops the instruction — the file is left on disk, no start ever takes it', flr);
      } finally { VFSm.create = realC; }
    }
    // the suites' id seam (fileIds) asks the same taken check: a listed id offered first is passed over (its red: a mint that never asks)
    {
      const ds = path.join(ROOT, 'file-seam'); fs.mkdirSync(ds, { recursive: true });
      const k = mkE(VE, ds); await k.setup(PW, {}); await k.filesSettled(); k.close();
      const rs = recOf(ds); rs.filesDropped = ['0a0a0a0a0a']; fs.writeFileSync(path.join(ds, 'vault.json'), JSON.stringify(rs));
      const seamLeg = async (E) => {
        const seq = ['0a0a0a0a0a', '0b0b0b0b0b'];
        const k2 = mkE(E, ds, { fileIds: () => seq.shift() || '0c0c0c0c0c' }); await k2.unlock(PW);
        const r = await k2.filePut('keyfile:0e5e6e7e8e', bin, { filename: 'k.bin', prov: 'uploaded' }); const id = r.ok ? k2.fileOf('keyfile:0e5e6e7e8e').id : null;
        if (r.ok) { k2.secretDrop('keyfile:0e5e6e7e8e'); } await k2.filesSettled(); k2.close();
        const back = recOf(ds); back.filesDropped = ['0a0a0a0a0a']; fs.writeFileSync(path.join(ds, 'vault.json'), JSON.stringify(back));
        return { id };
      };
      const sl = await seamLeg(VE);
      ok(sl.id === '0b0b0b0b0b', 'the suites\' id source (fileIds) is asked through the same taken check: a listed id offered first is passed over', sl);
      const neverAsks = MO.load('src/server/vault-engine.js', anchored(ESo, '    if (typeof fileIds === \'function\') return files.mintId(fileIdTaken);', '    if (typeof fileIds === \'function\') return files.mintId();', 'test-vault-engine a mint that never asks'), 'neverasks');
      const slr = await seamLeg(neverAsks);
      ok(slr.id === '0a0a0a0a0a', 'red control: «a mint that never asks» takes a listed id', slr);
    }
    // 主开发 r5114 — THE MUST: a file planted AT the counter, the start's listing FAILED (the disk's top unknown), then the write's look
    // (or the folder's own check) failing ONCE with a placed refusal: the planted file's bytes are untouched after the put AND after the
    // queue has drained. Reds: today's two lines — the look reading any failure as «not there», the put's failure branch shredding its id
    {
      const VFSm = require(path.join(REPO, 'src/server/vault-files.js')), realC = VFSm.create, fspm = require('fs').promises;
      const SFo = fs.readFileSync(path.join(REPO, 'src/server/vault-files.js'), 'utf8');
      const mustLeg = async (E, failWhat, store = null) => {
        const dm = path.join(ROOT, `file-must-${failWhat}-${Math.random().toString(16).slice(2, 8)}`); fs.mkdirSync(dm, { recursive: true });
        const k = mkE(E, dm); await k.setup(PW, {});
        await k.filePut('keyfile:0a6a7a8a9a', bin, { filename: 'a.bin', prov: 'uploaded' }); await k.filesSettled(); k.close();   // 0000000000, fileSeq 1
        const planted = path.join(dm, 'vault-files', '0000000001.vfile'); fs.writeFileSync(planted, 'a kept file at the counter'); const keep = fs.readFileSync(planted);
        const keepReaddir = fspm.readdir, keepLstat = fspm.lstat; let listing = 0, look = 0;
        fspm.readdir = async function (p, ...a) { if (String(p).endsWith(`${path.sep}vault-files`) && !listing) { listing++; throw Object.assign(new Error('EIO: placed'), { code: 'EIO' }); } return keepReaddir.call(this, p, ...a); };
        fspm.lstat = async function (p, ...a) { const s = String(p), hit = failWhat === 'look' ? s.endsWith(`${path.sep}0000000001.vfile`) : s.endsWith(`${path.sep}vault-files`); if (hit && !look) { look++; throw Object.assign(new Error('EIO: placed'), { code: 'EIO' }); } return keepLstat.call(this, p, ...a); };
        if (store) VFSm.create = store;
        let r = null;
        try {
          const k2 = mkE(E, dm); await k2.unlock(PW); await k2.filesSettled();   // the start's listing failed: the disk's top is unknown
          r = await k2.filePut('keyfile:0b6b7b8b9b', bin, { filename: 'b.bin', prov: 'uploaded' });
          await k2.filesSettled(); k2.close();   // the queue drained
        } finally { fspm.readdir = keepReaddir; fspm.lstat = keepLstat; VFSm.create = realC; }
        return { listing, look, code: r && r.code, untouched: fs.existsSync(planted) && fs.readFileSync(planted).equals(keep) };
      };
      const ml = await mustLeg(VE, 'look'), mf = await mustLeg(VE, 'folder');
      ok(ml.listing === 1 && ml.look === 1 && ml.code === 'file_not_stored' && ml.untouched && mf.listing === 1 && mf.look === 1 && mf.untouched,
        'THE MUST (r5114): a file AT the counter, the start\'s listing failed — the write\'s look failing once REFUSES (file_not_stored) and the folder\'s check failing once refuses too: the planted file\'s bytes untouched after the put and after the queue drained', { ml, mf });
      const oldLook = MO.load('src/server/vault-files.js', anchored(SFo, "    let there = true;\n    try { await fsp.lstat(file); } catch (e) { if (!(e && e.code === 'ENOENT')) throw err('file_look_failed', `the place of a sealed file could not be looked at (${(e && e.code) || 'error'}) — nothing was written`); there = false; }\n    if (there) throw err('file_id_taken', 'a sealed file of that id is already kept');",
        "    if (await fsp.lstat(file).then(() => true, () => false)) throw err('file_id_taken', 'a sealed file of that id is already kept');", 'test-vault-engine the look reading any failure as absent'), 'oldlook');
      const mlr = await mustLeg(VE, 'look', oldLook.create);
      ok(!mlr.untouched, 'red control: «the look reads any failure as not there» — the rename writes over the kept file', mlr);
      const oldCatch = MO.load('src/server/vault-engine.js', anchored(ESo, "    } catch (e) { key.fill(0); return e && (e.code === 'files_stuck' || e.code === 'file_id_taken' || e.code === 'file_look_failed') ?",
        "    } catch (e) { key.fill(0); if (!(e && e.code === 'file_id_taken')) shredLater(id); return e && (e.code === 'files_stuck' || e.code === 'file_id_taken' || e.code === 'file_look_failed') ?", 'test-vault-engine the failed put shredding its id'), 'oldcatch');
      const mfr = await mustLeg(oldCatch, 'folder');
      ok(!mfr.untouched, 'red control: «a failed put shreds its minted id» — the kept file is shredded when the queue drains', mfr);
      // the round's smalls: ONE mutant red each — the step past a kept file (the write's taken check cut), «live wins over listed»
      // (fileDropped without !fileLive), the broken counter (seqBase without the disk's top); and a POSITIVE leg: a listed id whose
      // file a start finds not there by its name leaves the list at the next record write
      const stepLeg = async (store) => {
        const dk = path.join(ROOT, `file-step-${Math.random().toString(16).slice(2, 8)}`); fs.mkdirSync(dk, { recursive: true });
        if (store) VFSm.create = store;
        try {
          const k = mkE(VE, dk); await k.setup(PW, {}); await k.filesSettled();
          await k.filePut('keyfile:0c6c7c8c9c', bin, { filename: 'c.bin', prov: 'uploaded' });
          const planted = path.join(dk, 'vault-files', '0000000001.vfile'); fs.writeFileSync(planted, 'kept');
          await k.filePut('keyfile:0d6d7d8d9d', bin, { filename: 'd.bin', prov: 'uploaded' }); await k.filesSettled(); k.close();
          return { kept: fs.readFileSync(planted, 'utf8') === 'kept' };
        } finally { VFSm.create = realC; }
      };
      const noTaken = MO.load('src/server/vault-files.js', anchored(SFo, "    if (there) throw err('file_id_taken', 'a sealed file of that id is already kept');", "    if (false) throw err('file_id_taken', 'a sealed file of that id is already kept');", 'test-vault-engine the taken check cut'), 'notaken');
      const st0 = await stepLeg(null), str = await stepLeg(noTaken.create);
      ok(st0.kept && !str.kept, 'the step past a kept file holds it, and its red control «the taken check cut» writes over it', { st0, str });
      const liveLeg = async (E) => {
        const dv = path.join(ROOT, `file-live-${Math.random().toString(16).slice(2, 8)}`); fs.mkdirSync(dv, { recursive: true });
        const k = mkE(E, dv); await k.setup(PW, {});
        await k.filePut('keyfile:0e6e7e8e9e', bin, { filename: 'e.bin', prov: 'uploaded' }); const idE = k.fileOf('keyfile:0e6e7e8e9e').id; await k.filesSettled(); k.close();
        const rv = recOf(dv); rv.filesDropped = [idE]; fs.writeFileSync(path.join(dv, 'vault.json'), JSON.stringify(rv));
        const k2 = mkE(E, dv); await k2.filesSettled(); k2.close();
        return { kept: fs.existsSync(path.join(dv, 'vault-files', `${idE}.vfile`)) };
      };
      const noLive = MO.load('src/server/vault-engine.js', anchored(ESo, '  const fileDropped = (id) => !!record && droppedOf(record).includes(id) && !fileLive(id);', '  const fileDropped = (id) => !!record && droppedOf(record).includes(id);', 'test-vault-engine live not winning over listed'), 'nolive');
      const noLiveSweep = MO.load('src/server/vault-files.js', anchored(anchored(SFo, '      if (m && isLive(m[1])) continue;\n', '', 'test-vault-engine the sweep\'s live skip cut'),
        '    if (m && (isLive(m[1]) || !isDropped(m[1]))) return false;', '    if (m && !isDropped(m[1])) return false;', 'test-vault-engine the walk\'s own live re-ask cut'), 'nolivesweep');
      const lv0 = await liveLeg(VE);
      VFSm.create = noLiveSweep.create; let lvr; try { lvr = await liveLeg(noLive); } finally { VFSm.create = realC; }
      ok(lv0.kept && !lvr.kept, 'live wins over listed, and its red control «fileDropped without !fileLive» (the sweep\'s own live skip cut with it) shreds the file the record names', { lv0, lvr });
      const noTop = MO.load('src/server/vault-engine.js', anchored(ESo, '    let n = Math.max(counter, diskTop + 1, seqMinted + 1);', '    let n = Math.max(counter, seqMinted + 1);', 'test-vault-engine the disk\'s top cut'), 'notop');
      const brokenLeg = async (E) => {
        const db = path.join(ROOT, `file-broken-${Math.random().toString(16).slice(2, 8)}`); fs.mkdirSync(db, { recursive: true });
        const k = mkE(E, db); await k.setup(PW, {}); await k.filePut('keyfile:0f6f7f8f9f', bin, { filename: 'f.bin', prov: 'uploaded' }); await k.filesSettled(); k.close();
        const rb = recOf(db); rb.fileSeq = 'broken'; fs.writeFileSync(path.join(db, 'vault.json'), JSON.stringify(rb));
        fs.writeFileSync(path.join(db, 'vault-files', '000000000c.vfile'), 'a kept file met at the start');
        const k2 = mkE(E, db); await k2.unlock(PW); await k2.filesSettled();
        await k2.filePut('keyfile:0a7a8a9a0a', bin, { filename: 'g.bin', prov: 'uploaded' }); const id = k2.fileOf('keyfile:0a7a8a9a0a').id; k2.close();
        return { id };
      };
      const bk = await brokenLeg(noTop);
      ok(bk.id !== '000000000d', `red control: «the disk's top cut» mints below a file the start met (${bk.id}) — the step past it is all that is left`, bk);
      {
        const dp = path.join(ROOT, 'file-listed-absent'); fs.mkdirSync(dp, { recursive: true });
        const k = mkE(VE, dp); await k.setup(PW, {}); await k.filesSettled(); k.close();
        const rp = recOf(dp); rp.filesDropped = ['0000000005']; fs.writeFileSync(path.join(dp, 'vault.json'), JSON.stringify(rp));
        const k2 = mkE(VE, dp); await k2.unlock(PW); await k2.filesSettled();
        const before = (recOf(dp).filesDropped || []).includes('0000000005');
        await k2.filePut('keyfile:0b7b8b9b0b', bin, { filename: 'h.bin', prov: 'uploaded' }); await k2.filesSettled(); k2.close();   // the next record write
        ok(before && !(recOf(dp).filesDropped || []).includes('0000000005'), 'a listed id whose file a start finds NOT THERE by its name leaves the list at the next record write', recOf(dp).filesDropped);
      }
    }
  }
  // THE CURE (主开发 11-18, MUST 2 — «nothing of a file holds the hub's main loop»; the data folder may sit on a network mount):
  // a boot sweep, a put, an open and a drop make NO synchronous fs call on data/vault-files — every *Sync of the engine's own fs
  // object is counted while they run (by its path, or by an fd opened on one); the probe's control: one sync read IS counted
  {
    const cfs = require('fs');
    const SYNC = Object.keys(cfs).filter((k) => /Sync$/.test(k) && typeof cfs[k] === 'function');
    const keep = {}, hits = [], fds = new Set();
    const under = (x) => typeof x === 'string' && x.includes(`${path.sep}vault-files`);
    for (const k of SYNC) {
      keep[k] = cfs[k];
      cfs[k] = function (...a) { const r = keep[k].apply(this, a); if (under(a[0]) || under(a[1]) || (typeof a[0] === 'number' && fds.has(a[0]))) hits.push(`${k}(${typeof a[0] === 'string' ? path.basename(a[0]) : a[0]})`); if (k === 'openSync' && under(a[0])) fds.add(r); return r; };
    }
    let flow = null, controlSeen = false;
    try {
      const v4 = VE.create({ dataDir: d, kdf: CHEAP, log: quiet, idleTimer: false, register: false });
      await v4.unlock(PW);
      await v4.filesSettled();
      const p4 = await v4.filePut('keyfile:0d1d2d3d4d', bin, { filename: 'probe.bin', prov: 'uploaded' });
      const o4 = await v4.fileOpen('keyfile:0d1d2d3d4d');
      const same = !!(o4.ok && o4.bytes.equals(bin)); if (o4.bytes) o4.bytes.fill(0);
      const d4 = v4.secretDrop('keyfile:0d1d2d3d4d');
      await v4.filesSettled();
      flow = { put: p4.ok, open: same, drop: d4.ok, gone: !v4.fileOf('keyfile:0d1d2d3d4d') };
      v4.close();
      const n0 = hits.length; cfs.readFileSync(fA); controlSeen = hits.length > n0; hits.length = n0;   // the probe's control (Node's readFileSync makes more than one synchronous call itself)
    } finally { for (const k of SYNC) cfs[k] = keep[k]; }
    ok(controlSeen, 'the probe\'s control: a synchronous read of a sealed file IS counted (the probe is not blind)');
    ok(flow && flow.put && flow.open && flow.drop && flow.gone && hits.length === 0,
      'the cure: a boot sweep, a put, an open and a drop of a file make NO synchronous fs call on data/vault-files (fs.promises, awaited)', { flow, hits: hits.slice(0, 12) });
  }
  // r4625 (the round's should on MUST 2): THE PROBE COUNTS A DESTRUCTURED SYNC CALL — a copy of vault-files that takes readdirSync off
  // fs at its load (`const { readdirSync } = require('fs')`) and lists its folder with it, loaded and run under the probe, is COUNTED
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const MP = mutantCopies('vault-files-probe', REPO);
    const SFp = fs.readFileSync(path.join(REPO, 'src/server/vault-files.js'), 'utf8');
    const cfs = require('fs');
    const SYNC = Object.keys(cfs).filter((k) => /Sync$/.test(k) && typeof cfs[k] === 'function');
    const keep = {}, hits = [];
    const under = (x) => typeof x === 'string' && x.includes(`${path.sep}vault-files`);
    for (const k of SYNC) { keep[k] = cfs[k]; cfs[k] = function (...a) { if (under(a[0])) hits.push(k); return keep[k].apply(this, a); }; }
    let n = -1;
    try {
      const mut = MP.load('src/server/vault-files.js', anchored(anchored(SFp, "const fs = require('fs');\n", "const fs = require('fs');\nconst { readdirSync } = require('fs');\n", 'test-vault-engine a destructured sync call (its require)'),
        'const listQ = one(() => fsp.readdir(DIR))', 'const listQ = one(async () => readdirSync(DIR))', 'test-vault-engine a destructured sync call (its use)'), 'destructured');
      await mut.create({ dataDir: d }).sweep(() => true);
      n = hits.filter((k) => k === 'readdirSync').length;
    } finally { for (const k of SYNC) cfs[k] = keep[k]; }
    ok(n >= 1, `the probe's MUTANT «a destructured sync call in vault-files» (readdirSync taken off fs at its load, the copy loaded under the probe): COUNTED (${n})`, n);
  }
  // ROUND 3 (the cure's second read): THE ENGINE'S OWN WIRING, each held where it matters by a patched store (the engine asks
  // src/server/vault-files.js create at its construction — a mutant engine copy reaches the same module), each with its red control
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const VFS = require(path.join(REPO, 'src/server/vault-files.js'));
    const realCreate = VFS.create;
    const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };
    const tick = () => new Promise((r) => setTimeout(r, 5));
    let hold = {}, written = null;
    VFS.create = (o) => { const st = realCreate(o); return { ...st,
      write: async (...a) => { const r = await st.write(...a); written = a[0]; if (hold.write) await hold.write.p; return r; },   // the sealed file ON DISK, the put not answered yet
      read: async (...a) => { if (hold.read) await hold.read.p; return st.read(...a); },
      sweep: async (...a) => { if (hold.sweep) await hold.sweep.p; return st.sweep(...a); } }; };
    const ES3 = fs.readFileSync(path.join(REPO, 'src/server/vault-engine.js'), 'utf8'), SF3 = fs.readFileSync(path.join(REPO, 'src/server/vault-files.js'), 'utf8');
    const MR = mutantCopies('vault-engine-r3', REPO);
    const patch = (rel, text, from, to, tag) => MR.load(rel, anchored(text, from, to, tag), tag);   // an anchor gone or found twice THROWS by the control's name (B-0d3e)
    const vfileOf = (id) => path.join(d, 'vault-files', `${id}.vfile`);
    const mk3 = (E) => E.create({ dataDir: d, kdf: CHEAP, log: quiet, idleTimer: false, register: false });
    /** (a) the boot sweep runs WHILE a put is in flight (its sealed file on disk, its record not written yet) */
    const flightLeg = async (E) => {
      hold = { sweep: gate(), write: gate() }; written = null;
      const v = mk3(E);
      await v.unlock(PW);
      const p = v.filePut('keyfile:0a1a2a3a4a', bin, { filename: 'flight.bin', prov: 'uploaded' });
      for (let k = 0; k < 400 && !written; k++) await tick();
      const id = written, onDisk = !!id && fs.existsSync(vfileOf(id));
      hold.sweep.open();
      await v.filesSettled();
      const kept = !!id && fs.existsSync(vfileOf(id));
      hold.write.open();
      const r = await p;
      const o = await v.fileOpen('keyfile:0a1a2a3a4a');
      const same = !!(o.ok && o.bytes.equals(bin)); if (o.bytes) o.bytes.fill(0);
      v.secretDrop('keyfile:0a1a2a3a4a'); await v.filesSettled(); v.close(); hold = {};
      return { onDisk, kept, put: r.ok, same };
    };
    /** (b) a read that LOSES to a drop / a re-put — the drop's shred DONE before the read reaches the disk (the catch's road) */
    const lostLeg = async (E) => {
      hold = {};
      const v = mk3(E);
      await v.unlock(PW); await v.filesSettled();
      await v.filePut('keyfile:0b1b2b3b4b', bin, { filename: 'race.bin', prov: 'uploaded' });
      hold = { read: gate() };
      const pd = v.fileOpen('keyfile:0b1b2b3b4b');
      v.secretDrop('keyfile:0b1b2b3b4b'); await v.filesSettled();
      hold.read.open();
      const dropped = await pd;
      hold = {};
      await v.filePut('keyfile:0b1b2b3b4b', bin, { filename: 'race.bin', prov: 'uploaded' });
      hold = { read: gate() };
      const pr = v.fileOpen('keyfile:0b1b2b3b4b');
      await v.filePut('keyfile:0b1b2b3b4b', Buffer.concat([bin, Buffer.from('v2')]), { filename: 'race.bin', prov: 'uploaded' }); await v.filesSettled();
      hold.read.open();
      const moved = await pr;
      v.secretDrop('keyfile:0b1b2b3b4b'); await v.filesSettled(); v.close(); hold = {};
      return { dropped: dropped.code, moved: moved.code, bytes: 'bytes' in dropped || 'bytes' in moved };
    };
    /** (c) a put whose write is held across a LOCK and an UNLOCK (the lock epoch moved; the state reads «unlocked» again) */
    const epochLeg = async (E) => {
      hold = { write: gate() }; written = null;
      const v = mk3(E);
      await v.unlock(PW); await v.filesSettled();
      const p = v.filePut('keyfile:0c1c2c3c4c', bin, { filename: 'epoch.bin', prov: 'uploaded' });
      for (let k = 0; k < 400 && !written; k++) await tick();
      v.lock('agent'); await v.unlock(PW);
      hold.write.open();
      const r = await p; await v.filesSettled();
      const stored = !!v.fileOf('keyfile:0c1c2c3c4c'), shredded = !!written && !fs.existsSync(vfileOf(written));
      if (stored) { v.secretDrop('keyfile:0c1c2c3c4c'); await v.filesSettled(); }
      v.close(); hold = {};
      return { code: r.code, stored, shredded };
    };
    /** (d) ONE AT A TIME: 8 writes and 8 reads at once — the most opens of data/vault-files in flight together */
    const oneLeg = async (create) => {
      const fsp = fs.promises, keepOpen = fsp.open;
      let inFlight = 0, most = 0;
      fsp.open = async function (p, ...a) { const under = String(p).includes(`${path.sep}vault-files`); if (under) { inFlight++; most = Math.max(most, inFlight); } try { const fh = await keepOpen.call(this, p, ...a); if (under) await tick(); return fh; } finally { if (under) inFlight--; } };
      try {
        const st = create({ dataDir: path.join(ROOT, `files-one-${most}-${Date.now()}`) }), key = crypto.randomBytes(32);
        const ids = Array.from({ length: 8 }, (_, i) => `0e0e0e0e0${i}`);
        await Promise.all(ids.map((id) => st.write(id, key, bin)));
        await Promise.all(ids.map((id) => st.read(id, key, { size: bin.length }).then((b) => b.fill(0))));
        key.fill(0);
      } finally { fsp.open = keepOpen; }
      return most;
    };
    try {
      const fl = await flightLeg(VE);
      ok(fl.onDisk && fl.kept && fl.put && fl.same, 'round 3: the boot sweep that runs WHILE a put is in flight spares its sealed file BY ITS ID (filesInFlight, added before the write) — the put lands, the file opens', fl);
      // r4625: a sealed file the record says nothing of is KEPT at a start whatever its flight; the in-flight mark is what spares a put
      // under a sweep that WOULD take it — so its red is the release-form sweep (what no entry names goes) with the mark gone
      const mF = MR.load('src/server/vault-engine.js', anchored(anchored(ES3, '    filesInFlight.add(id);\n', '\n', 'noflight'), '    const r = await files.sweep(fileLive, { dropped: fileDropped });', '    const r = await files.sweep(fileLive, { dropped: (id) => !fileLive(id) });', 'noflight-releaseform'), 'noflight');
      const fm = mF ? await flightLeg(mF) : null;
      ok(fm && fm.onDisk && !fm.kept && !fm.same, 'MUTANT «a put never marked in flight, under the release-form sweep»: the leg goes RED — the sweep shredded the put\'s sealed file under it', fm);
      const lo = await lostLeg(VE);
      ok(lo.dropped === 'entry_unknown' && lo.moved === 'file_moved' && !lo.bytes, 'round 3 (deterministic): a read that reaches the disk AFTER a drop\'s shred ⇒ entry_unknown, after a re-put ⇒ file_moved — the catch\'s own road, no byte', lo);
      const mL = patch('src/server/vault-engine.js', ES3, "      if (!now) return { ok: false, code: 'entry_unknown' };\n      if (!now.file || now.file.id !== f.id) return { ok: false, code: 'file_moved', words: VF.WORDS.file_moved };\n", '', 'nolost');
      const lm = mL ? await lostLeg(mL) : null;
      ok(lm && lm.dropped === 'file_missing' && lm.moved === 'file_missing', 'MUTANT «the catch says what the disk said»: the patch hits once and the leg goes RED — «file_missing» (restore from a backup) about a healthy vault', lm);
      const ep = await epochLeg(VE);
      ok(/vault_locked/.test(String(ep.code)) && !ep.stored && ep.shredded, 'round 3: a put whose write was held across a lock AND an unlock ⇒ vault_locked (the lock EPOCH moved), nothing stored, its sealed file shredded', ep);
      const mE = patch('src/server/vault-engine.js', ES3, "state() !== 'unlocked' || epoch !== ep0) { key.fill(0); shredLater(id);", "state() !== 'unlocked') { key.fill(0); shredLater(id);", 'noepoch');
      const em = mE ? await epochLeg(mE) : null;
      ok(em && em.stored, 'MUTANT «the state asked, not the epoch»: the patch hits once and the leg goes RED — the put that was in flight across the lock landed', em);
      const one = await oneLeg(realCreate);
      ok(one === 1, `round 3: ONE sealed-file operation at a time — 8 writes and 8 reads at once never open two files of data/vault-files together (most ${one})`, one);
      const mQ = patch('src/server/vault-files.js', SF3, 'write: one(write), read: one(read), shred: one(shred), has: one(has), sweep };', 'write, read, shred, has, sweep };', 'noqueue');   // stale-pins: kept (the replacement IS the round-2 store, unqueued)
      const qm = mQ ? await oneLeg(mQ.create) : null;
      ok(qm != null && qm > 1, `MUTANT «the store's operations unqueued»: the patch hits once and the leg goes RED — ${qm} opens in flight together`, qm);
      // ROUND 4 (the third read: one HUNG operation held the queue for ever — every put unanswered, its bytes and its key in memory):
      // an operation past its bound (opMs; 30 s, here 60 ms) is answered files_stuck and the store is STUCK until it settles — every
      // operation meanwhile is refused at once, the fs never asked; once it settles the store works again. Red control: the refusal gone
      const stuckLeg = async (create) => {
        const fsp = fs.promises, keepOpen = fsp.open, rel = gate();
        let opens = 0, hung = false;
        fsp.open = async function (p, ...a) { if (String(p).includes(`${path.sep}vault-files`)) { opens++; if (!hung) { hung = true; await rel.p; } } return keepOpen.call(this, p, ...a); };
        const out = {};
        try {
          const st = create({ dataDir: path.join(ROOT, `files-stuck-${Date.now()}-${opens}`), opMs: 60 }), key = crypto.randomBytes(32);
          const p1 = st.write('0f1f2f3f4f', key, bin).then(() => 'ok', (e) => e.code);
          const early = st.read('0f1f2f3f4f', key, { size: bin.length }).then((b) => { b.fill(0); return 'ok'; }, (e) => e.code);   // queued BEHIND the hung write, before its bound
          const w1 = await p1;
          const o0 = opens;
          out.early = await early;
          const r2 = await st.read('0f1f2f3f4f', key, { size: bin.length }).then((b) => { b.fill(0); return 'ok'; }, (e) => e.code);
          out.whileStuck = { write: w1, early: out.early, read: r2, fsAsked: opens - o0 };
          rel.open();
          let w3 = 'files_stuck';
          for (let k = 0; k < 200 && w3 === 'files_stuck'; k++) { await tick(); w3 = await st.write('0e1e2e3e4e', key, bin).then(() => 'ok', (e) => e.code); }   // until the hung one settles
          out.after = w3;
          key.fill(0);
        } finally { fsp.open = keepOpen; rel.open(); }
        return out;
      };
      const sk = await stuckLeg(realCreate);
      ok(sk.whileStuck.write === 'files_stuck' && sk.whileStuck.early === 'files_stuck' && sk.whileStuck.read === 'files_stuck' && sk.whileStuck.fsAsked === 0 && sk.after === 'ok',
        'round 4: a sealed-file operation past its bound ⇒ files_stuck; one queued behind it before the bound and one called after are refused (the fs never asked); once the hung one settles the store works again', sk);
      const mS2 = patch('src/server/vault-files.js', SF3, '      if (stuck) throw stuckErr();\n', '', 'nostuck2');   // round 5 (the fourth read): the IN-QUEUE refusal alone — an operation queued before the bound fired
      const skm = mS2 ? await stuckLeg(mS2.create) : null;
      ok(skm && skm.whileStuck.fsAsked > 0, 'MUTANT «an operation queued behind a stuck one still asks the fs»: the patch hits once and the leg goes RED — the queued read went to the mount', skm);
    } finally { VFS.create = realCreate; hold = {}; }
  }
}

console.log('⑳ ROUND 7 OF THE U1a CURE (its sixth read, MINOR): a sealed file\'s size is the box\'s — refused BEFORE a byte is decrypted; the shred overwrites through ONE 64 KiB buffer');
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  /** a 1 KB file sealed, then its .vfile grown 4 MB past its box (a replaced file, a damaged mount): the read's code and its
   *  decrypts; then its shred: the largest random buffer one fill asked for, and whether the file is gone */
  const leg7 = async (VFSx) => {
    const { dir: d7 } = world();
    const st7 = VFSx.create({ dataDir: d7, log: quiet });
    const key = crypto.randomBytes(32), id = '0a0b0c0d0e';
    await st7.write(id, key, crypto.randomBytes(1024));
    const file = path.join(d7, 'vault-files', `${id}.vfile`);
    fs.appendFileSync(file, Buffer.alloc(4 << 20));
    let deciphers = 0, most = 0, code = null;
    const keepD = crypto.createDecipheriv, keepF = crypto.randomFillSync, keepB = crypto.randomBytes;
    crypto.createDecipheriv = function (...a) { deciphers++; return keepD.apply(this, a); };
    try { await st7.read(id, key, { size: 1024 }); } catch (e) { code = e.code; } finally { crypto.createDecipheriv = keepD; }
    crypto.randomFillSync = function (b, o, k) { most = Math.max(most, k == null ? b.length - (o || 0) : k); return keepF.apply(this, arguments); };
    crypto.randomBytes = function (k, ...r) { most = Math.max(most, k); return keepB.call(this, k, ...r); };
    try { await st7.shred(id); } finally { crypto.randomFillSync = keepF; crypto.randomBytes = keepB; }
    return { code, deciphers, most, gone: !fs.existsSync(file) };
  };
  const VFS7 = require(path.join(REPO, 'src/server/vault-files.js'));
  const r7 = await leg7(VFS7);
  console.log(`    judged: read ${r7.code} with ${r7.deciphers} decrypts · the shred's largest random buffer ${r7.most} B · gone ${r7.gone}`);
  ok(r7.code === 'file_damaged' && r7.deciphers === 0 && r7.most > 0 && r7.most <= 64 * 1024 && r7.gone, 'a sealed file grown 4 MB past its 1 KB box ⇒ file_damaged with NO decrypt; its shred fills ONE buffer of at most 64 KiB at a time, and the file is gone', r7);
  const M7 = mutantCopies('vault-files-r7', REPO), SF7 = fs.readFileSync(path.join(REPO, 'src/server/vault-files.js'), 'utf8');
  const mSz = M7.load('src/server/vault-files.js', anchored(SF7, '        if (facts.size != null) sized = (await fh.stat()).size === MAGIC.length + 28 + Number(facts.size);\n', '', 'the size checked after the decrypt'), 'nosize');
  const rSz = await leg7(mSz);
  ok(rSz.deciphers > 0, `MUTANT «the size checked after the decrypt»: the patch hits once and the leg goes RED — ${rSz.deciphers} decrypts of a file past its box`, rSz);
  const mCh = M7.load('src/server/vault-files.js', anchored(SF7, 'Buffer.allocUnsafe(Math.min(SHRED_CHUNK, st.size))', 'Buffer.allocUnsafe(st.size)', 'one buffer the size of the file'), 'nochunk');
  const rCh = await leg7(mCh);
  ok(rCh.most > 64 * 1024, `MUTANT «one buffer the size of the file»: the patch hits once and the leg goes RED — the shred filled ${rCh.most} B at once`, rCh);
}

fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
