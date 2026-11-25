#!/usr/bin/env node
// test-vault-secrets — THE VAULT'S SECOND ROUND (lane vault-e2e-password-fix-r2, design q-042 D1 + D9): the secrets the first
// round left in the clear, each sealed, each LOCKED by name, each migrated without a loss. Fast tier: scratch data dirs,
// the REAL engine (cheap KDF), the REAL stores / ladders / routes / attach child; fakes only for a device and a vendor.
//   ①  THE ENGINE'S SECRETS — `host:` / `frp:` / `file:` entries: get / put / drop / adopt per state; AAD binds the name;
//      adopt = wrapped, the record READ BACK, the file overwritten (a hard link sees random bytes) then unlinked; a file
//      that differs is KEPT and audited; onOpen after the setup + every unlock, onLock after a lock ACT only
//   ②  THE DEVICE LINK TOKENS (src/server/host-tokens.js) — not set up ⇒ the file as before; the setup's open sweep seals
//      every host-<id>.token (same value, file gone); LOCKED ⇒ `vault_locked` BY NAME; unlocked ⇒ minted INTO the vault;
//      unpair drops the entry; no engine over a sealed dir ⇒ locked; stripCopies takes the token out of every old
//      attach config (the old inode's bytes overwritten)
//   ③  THE SPAWN — the REAL dial ladder (chat + terminal) and ssh ladder (chat): LOCKED ⇒ refused `vault_locked` by name,
//      nothing written, no bridge; unlocked ⇒ session-<id>.json carries NO token, and the token is in no argv, no env
//      pair, no file under the scratch dir (0 hits). MUTANT: a ladder that writes the token back ⇒ RED
//   ④  THE ONE ROAD — GET /api/agent/vault/link-token (the real route) + the REAL attach child (src/agentd/attach-cli.js)
//      + the REAL DialSessionBridge: the attach asks the hub with its session token and reaches the bridge with the
//      right token; LOCKED ⇒ 423 and the attach exits 7 naming the vault (the wrapper retries); a local session / a job
//      token / nobody ⇒ refused; a legacy `hostToken` left in a config is NEVER used (a second road would be); the 423
//      marks the session WAITING (`_vaultWait` — its row says 「等待保险库解锁」), the first other answer clears it
//   ⑤  THE CARDS — every word function a refused secret reaches says 「保险库已锁定——先解锁」 for the vault code, never
//      "expired" / "re-authorize"; the census: every file that words `auth-expired` words `vault-locked` too; the REAL
//      channels engine + the REAL Lark adapter over a LOCKED vault: the account reads `vault-locked`, the pass builds no
//      request and counts no failure; the adapter's own refusal is `vault-locked`
//   ⑥  FRP — the relay token sealed (`frp:token`; plugins.json keeps `tokenSealed`), frpc.toml names an env var (no token),
//      the token rides the frpc child's env only; LOCKED ⇒ start refused by name, status `vaultLocked`, a new token refused
//   ⑦  THE VOICE PAIR — data/dropline-oauth.json sealed (src/server/sealed-json.js): plain before the setup, sealed by the
//      open sweep, the hourly refresh writes sealed; LOCKED ⇒ read / write refused, the card + the mic say the vault
//   ⑧  THE MIGRATION TABLE — a production-shaped data dir with every r2 secret planted in the clear, booted in the hub's
//      order (auth load → strip → engine → setup → open sweeps): every planted value (raw / hex / base64) in NO file
//      but the vault's ciphertext, every login still valid once, every host token readable through the vault
//   ⑩  THE DAILY-FAILURE CARD (lane vault-use-law, design q-043 D7): the 20th failed use of an actor × entry in a day ⇒ ONE
//      For-you item naming both (the owner resolves it, an unlock never; a day later the same row reopens); the lock's
//      refusals never count; 20 wrong second passwords from one address ⇒ its urgent item
// Run: node scripts/test-vault-secrets.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { trackedFiles } from './tracked-files.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('vault-secrets');
fs.mkdirSync(ROOT, { recursive: true });
const HOME0 = process.env.HOME;
process.env.HOME = path.join(ROOT, 'home');   // the plugin manager's ~/.vibespace/plugins (read at its require) — never the runner's
fs.mkdirSync(process.env.HOME, { recursive: true });
const R = (rel) => require(path.join(REPO, rel));
const VE = R('src/server/vault-engine.js');
const SB = R('src/secret-box.js');
const KF = R('src/key-file.js');
const HT = R('src/server/host-tokens.js');
const SJ = R('src/server/sealed-json.js');
const { wireVaultHooks } = R('src/server/vault-hooks.js');
const { replaceShredding } = R('src/secret-file.js');
const PT = R('src/pairing-token.js');
const CHEAP = { N: 1024, r: 8, p: 1 };
const PW = 'correct horse battery staple';
const quiet = { log() {}, warn() {}, error() {} };
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const T0 = Date.now();
let seq = 0;
const dirOf = (tag) => { const d = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };
const engines = [];
const mkVault = (dataDir, o = {}) => { const e = VE.create({ dataDir, kdf: CHEAP, log: quiet, idleTimer: false, ...o }); engines.push(e); return e; };
// r1563 (B-7e49 slice 1, lane bl-tests-e): THE TREE ONCE A RUN — the repo's source text is read once through this suite's own
// memo (srcText), and its comment-stripped form once (srcCode): ⑤'s census, ⑧'s readers and the retired-name census each kept
// their own scope's list but read every file again (naming() twice). A scratch folder the suite writes is still read from disk.
const SRC_TEXT = new Map();
const srcText = (f) => { let t = SRC_TEXT.get(f); if (t === undefined) { try { t = fs.readFileSync(f, 'utf8'); } catch (e) { t = e; } SRC_TEXT.set(f, t); } if (t instanceof Error) throw t; return t; };
const CODE_TEXT = new Map();
const srcCode = (f) => { let c = CODE_TEXT.get(f); if (c === undefined) CODE_TEXT.set(f, c = srcText(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')); return c; };
/** every file under `dir` (recursive) → [abs path] */
const walk = (dir, out = []) => { let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; } for (const e of es) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p); } return out; };
/** the forms a secret could sit in a file: raw, hex, base64 (+ url) — a hit in any is a leak */
const forms = (v) => { const b = Buffer.from(String(v), 'utf8'); return [String(v), b.toString('hex'), b.toString('base64'), b.toString('base64url')].filter((x) => x.length >= 8); };
const hitsIn = (dir, values, { skip = () => false } = {}) => {
  const out = [];
  for (const f of walk(dir)) {
    if (skip(f)) continue;
    let t = ''; try { t = fs.readFileSync(f, 'latin1'); } catch { continue; }
    for (const v of values) for (const x of forms(v)) if (t.includes(x)) out.push({ f: path.relative(dir, f), v: String(v).slice(0, 10) });
  }
  return out;
};

console.log('① THE ENGINE\'S SECRETS — host: / frp: / file: entries');
{
  const d = dirOf('engine');
  const opened = [], locked = [];
  const v = mkVault(d);
  v.onOpen(() => opened.push(v.state()));
  v.onLock((why) => locked.push(why));
  ok(v.secretGet('host:a').code === 'vault_not_set_up' && v.secretPut('host:a', 'x').code === 'vault_not_set_up', 'not set up: a secret is neither read nor written (the callers keep their pre-vault file — the migration window)');
  ok(v.secretGet('.channels-key').code === 'bad-name' && v.secretPut('../x', 'y').code === 'bad-name' && !VE.isSecretName('.accounts-key') && VE.isSecretName('host:dial-x') && VE.isSecretName('frp:token') && VE.isSecretName('file:dropline-oauth.json'),
    'a secret\'s name is host:/frp:/file: only — never a store key\'s (the two kinds never meet)');
  const r0 = await v.setup(PW, {});
  ok(r0.ok && opened.join() === 'unlocked', 'setup ⇒ the open hooks run once, the vault unlocked (the sweeps seal what an older build left)', { r0, opened });
  ok(v.secretPut('host:dial-d1', 'vsht_' + 'a'.repeat(48)).ok && v.secretGet('host:dial-d1').value.toString() === 'vsht_' + 'a'.repeat(48), 'unlocked: put then get — the same value');
  ok(v.secretGet('host:nobody').ok && v.secretGet('host:nobody').value === null, 'unlocked: an absent entry reads null (never a mint here — the caller decides)');
  const rec = JSON.parse(fs.readFileSync(path.join(d, 'vault.json'), 'utf8'));
  ok(!JSON.stringify(rec).includes('aaaaaaaaaaaa') && rec.entries['host:dial-d1'] && v.facts().secrets === 1 && v.facts().keys === 0, 'vault.json holds the value as ciphertext only; facts count it as a SECRET, not a key', v.facts());
  // AAD binds the name: an entry copied under another name never opens
  const forged = { ...rec, entries: { ...rec.entries, 'host:dial-evil': rec.entries['host:dial-d1'] } };
  fs.writeFileSync(path.join(d, 'vault.json'), JSON.stringify(forged));
  const v2 = mkVault(d, { register: false }); await v2.unlock(PW, {});
  ok(v2.secretGet('host:dial-evil').code === 'key-malformed' && v2.secretGet('host:dial-d1').value.toString().startsWith('vsht_'), 'an entry copied under ANOTHER name does not open (AAD = its name)');
  v2.close();
  // a lock act ⇒ onLock (why); refused by name while locked; drop works locked; the quiet shutdown lock runs no hook
  v.lock('door');
  ok(locked.join() === 'door' && v.secretGet('host:dial-d1').code === KF.VAULT_LOCKED && v.secretPut('host:x', 'y').code === KF.VAULT_LOCKED, 'a lock act ⇒ onLock("door"); locked ⇒ get / put refused `key-unreadable:vault_locked`', locked);
  ok(v.secretDrop('host:dial-d1').ok && !JSON.parse(fs.readFileSync(path.join(d, 'vault.json'), 'utf8')).entries['host:dial-d1'], 'locked: an unpaired machine\'s entry is still dropped (no DEK needed)');
  await v.unlock(PW, {});
  ok(opened.length === 2, 'every unlock ⇒ the open hooks again');
  v.lock('sigterm', { quiet: true });
  ok(locked.length === 1, 'the SHUTDOWN\'s quiet lock runs no lock hook (a restart is not a lock act — logins survive it)', locked);
  await v.unlock(PW, {});
  // ADOPT: a plaintext file sealed, read back, overwritten in place (a hard link sees it), unlinked
  const f = path.join(d, 'plain.token');
  fs.writeFileSync(f, 'vsht_' + 'b'.repeat(48) + '\n', { mode: 0o600 });
  const link = path.join(d, 'plain.token.link'); fs.linkSync(f, link);
  const a = v.secretAdopt('host:host-11aa', f);
  const after = fs.readFileSync(link, 'latin1');
  ok(a.ok && a.value.toString() === 'vsht_' + 'b'.repeat(48) && !fs.existsSync(f) && !after.includes('bbbbbbbb') && after.length === 54, 'adopt: the value sealed (trimmed), the file overwritten in place (the hard link reads random bytes) and unlinked');
  ok(fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8').includes('"vault-adopted"') && !fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8').includes('bbbbbbbb'), 'adopt is audited — never the value');
  fs.writeFileSync(f, 'vsht_' + 'c'.repeat(48), { mode: 0o600 });
  const c = v.secretAdopt('host:host-11aa', f);
  ok(c.ok && c.value.toString().includes('bbbb') && fs.existsSync(f) && fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8').includes('vault-seal-conflict'), 'a file that DIFFERS from the entry is kept (never destroyed unproven) and audited as a conflict');
  fs.writeFileSync(f, 'vsht_' + 'b'.repeat(48), { mode: 0o600 });
  v.secretAdopt('host:host-11aa', f);
  ok(!fs.existsSync(f), 'a file that EQUALS the entry is shredded (a restored copy)');
  fs.writeFileSync(f, '', { mode: 0o600 });
  ok(v.secretAdopt('host:host-11bb', f).code === 'key-malformed' && fs.existsSync(f), 'an emptied file is not a value — refused, kept');
  // verify r2 low: a record-write failure during an adopt is SAID (the audit), and the file is kept
  {
    const df = dirOf('adopt-fault');
    let arm = false;
    const vf = mkVault(df, { faultAt: (step) => { if (arm && step === 'write-record') { arm = false; throw Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' }); } } });
    await vf.setup(PW, {});
    const ff = path.join(df, 'stray.token'); fs.writeFileSync(ff, 'vsht_' + '9'.repeat(48), { mode: 0o600 });
    arm = true;
    const ar = vf.secretAdopt('host:host-99', ff);
    ok(!ar.ok && ar.code === 'key-unreadable:ENOSPC' && fs.existsSync(ff) && /"vault-adopt-unsealed".*host:host-99: the record could not be written \(key-unreadable:ENOSPC\) — the file is kept/.test(fs.readFileSync(path.join(df, VE.AUDIT_FILE), 'utf8')),
      'an adopt whose record write fails is AUDITED by name (vault-adopt-unsealed) and the file is kept', ar);
  }
  v.lock('door');
  fs.writeFileSync(f, 'vsht_' + 'd'.repeat(48), { mode: 0o600 });
  ok(v.secretAdopt('host:host-11dd', f).code === KF.VAULT_LOCKED && fs.existsSync(f), 'locked: adopt reads nothing, writes nothing');
  // verify r2: a SYMLINK (another instance's token file, /etc/passwd …) is never followed — the shred would have overwritten the TARGET
  await v.unlock(PW, {});
  const tgt = path.join(d, 'elsewhere.token'); fs.writeFileSync(tgt, 'vsht_' + 'f'.repeat(48), { mode: 0o600 }); const lnk = path.join(d, 'plain.link.token'); fs.symlinkSync(tgt, lnk);
  const sl = v.secretAdopt('host:host-11ff', lnk);
  ok(!sl.ok && sl.code === 'key-unreadable:ELOOP' && fs.readFileSync(tgt, 'utf8') === 'vsht_' + 'f'.repeat(48) && fs.lstatSync(lnk).isSymbolicLink() && v.secretGet('host:host-11ff').value === null && fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8').includes('is a symbolic link'), 'a SYMLINKED secret file is never followed: not read, not sealed, the link kept, its target untouched — audited by name');
  let rs = null; try { replaceShredding(lnk, 'x'); } catch (e) { rs = e; }
  ok(rs && rs.code === 'ELOOP' && fs.readFileSync(tgt, 'utf8') === 'vsht_' + 'f'.repeat(48) && fs.lstatSync(lnk).isSymbolicLink(), 'replaceShredding (auth.json, the attach configs, the sealed JSON) refuses a symlink: the target keeps its bytes, the link stays');
}

console.log('② THE DEVICE LINK TOKENS — src/server/host-tokens.js');
{
  const d = dirOf('hosts');
  const ag = path.join(d, 'agentd');
  const ht = HT.create({ dataDir: d, log: quiet });
  // not set up: the file, exactly as before (read, or minted 0600)
  const t1 = ht.tokenFor('host-1a2b');
  const f1 = path.join(ag, 'host-host-1a2b.token');
  ok(/^vsht_[0-9a-f]{48}$/.test(t1) && fs.readFileSync(f1, 'utf8') === t1 && (fs.statSync(f1).mode & 0o777) === 0o600 && ht.tokenFor('host-1a2b') === t1, 'not set up: the token is the 0600 file (minted once, read after) — the migration window, byte for byte the pre-vault code');
  const t2 = ht.tokenFor('dial-dev9');
  ok(ht.stateOf() === 'not_set_up' && ht.lockedWhy('dial-dev9') === null, 'not set up: nothing is locked');
  // an attach config an older build wrote (the per-spawn copy)
  const cfgF = path.join(ag, 'session-s-old.json');
  fs.writeFileSync(cfgF, JSON.stringify({ tcp: { port: 1 }, hostToken: t2, sid: 's-old', version: '1' }), { mode: 0o600 });
  const cfgLink = path.join(d, 'cfg-old.link'); fs.linkSync(cfgF, cfgLink);
  ok(ht.stripCopies() === 1 && !('hostToken' in JSON.parse(fs.readFileSync(cfgF, 'utf8'))) && JSON.parse(fs.readFileSync(cfgF, 'utf8')).sid === 's-old' && !fs.readFileSync(cfgLink, 'latin1').includes(t2.slice(5, 20)) && (fs.statSync(cfgF).mode & 0o777) === 0o600,
    'stripCopies: the old attach config loses its token (the rest kept, 0600) and its old bytes are overwritten (the hard link to the retired inode reads no token)');
  ok(ht.stripCopies() === 0, '…once (a second sweep finds nothing)');
  // the setup's open sweep seals both files into the vault
  const v = mkVault(d);
  let redials = 0;
  wireVaultHooks({ vault: v, hostTokens: ht, log: quiet, redial: () => { redials++; return 0; } });
  ok((await v.setup(PW, {})).ok, 'setup');
  ok(redials === 1, 'the open also re-dials every device link that dialed in while locked (the wiring drops a link whose hello could not be said — it re-dials, the whole dial-in runs)');
  ok(!fs.existsSync(f1) && !fs.existsSync(path.join(ag, 'host-dial-dev9.token')) && v.facts().secrets === 2, 'the setup\'s open sweep sealed every host-<id>.token (the files gone, 2 entries)', v.facts());
  ok(ht.tokenFor('host-1a2b') === t1 && ht.tokenFor('dial-dev9') === t2, 'unlocked: the SAME tokens read back through the vault (every paired machine keeps working)');
  ok(hitsIn(d, [t1, t2]).length === 0, 'no file under the data dir holds either token (raw / hex / base64)', hitsIn(d, [t1, t2]));
  // a new machine: minted INTO the vault, never a file
  const t3 = ht.tokenFor('dial-newdev');
  ok(/^vsht_/.test(t3) && !fs.existsSync(path.join(ag, 'host-dial-newdev.token')) && v.secretGet('host:dial-newdev').value.toString() === t3, 'unlocked: a NEW machine\'s token is minted into the vault (an entry, no file)');
  // a file restored after the setup is adopted at its first read
  fs.writeFileSync(path.join(ag, 'host-host-77.token'), 'vsht_' + 'e'.repeat(48), { mode: 0o600 });
  ok(ht.tokenFor('host-77') === 'vsht_' + 'e'.repeat(48) && !fs.existsSync(path.join(ag, 'host-host-77.token')), 'a token file restored after the setup is adopted at its first read (sealed, shredded)');
  // LOCKED ⇒ by name
  v.lock('door');
  let err = null; try { ht.tokenFor('host-1a2b'); } catch (e) { err = e; }
  ok(err && err.code === 'vault_locked' && /the vault is locked — the link token of host-1a2b opens after the owner unlocks/.test(err.message) && ht.lockedWhy('dial-dev9') && /vault is locked/.test(ht.lockedWhy('dial-dev9')),
    'LOCKED: tokenFor throws `vault_locked` naming the machine and the door; lockedWhy says it (the spawn\'s pre-check)', err && err.message);
  let err2 = null; try { ht.tokenFor('dial-brandnew'); } catch (e) { err2 = e; }
  ok(err2 && err2.code === 'vault_locked' && !fs.existsSync(path.join(ag, 'host-dial-brandnew.token')), 'LOCKED: a new machine is NOT minted (no file, no entry) — a pairing waits for the unlock');
  ht.drop('dial-dev9');
  ok(!JSON.parse(fs.readFileSync(path.join(d, 'vault.json'), 'utf8')).entries['host:dial-dev9'], 'unpair while locked: the entry is dropped');
  // a process with no engine over a sealed dir: locked, never the file
  v.close();
  fs.writeFileSync(path.join(ag, 'host-host-1a2b.token'), t1, { mode: 0o600 });   // even a stray file beside a sealed vault
  let err3 = null; try { HT.create({ dataDir: d, log: quiet }).tokenFor('host-1a2b'); } catch (e) { err3 = e; }
  ok(err3 && err3.code === 'vault_locked', 'NO ENGINE in this process over a dir whose vault is set up ⇒ locked (never the file beside it)');
}

console.log('③ THE SPAWN — the real dial + ssh ladders: no token in the attach config, argv, env pairs or any file');
const DIAL = 'src/spawn/dial.js', SSH = 'src/spawn/ssh.js';
/** One ladder run over a fake ctx (a device that answers, a bridge, a host record) → what it answered and wrote. */
async function runLadder(ladder, { mode, transport, d, ht, sessionToken }) {
  const sent = [], ensured = [];
  const agentdDir = path.join(d, 'agentd');
  const h = transport === 'dial' ? { id: 'host-dial-dev1', name: 'dev1', deviceId: 'dev1', transport: 'dial' } : { id: 'host-ab12', name: 'box', host: 'box.invalid', user: 'u', transport: 'ssh' };
  const hostKey = transport === 'dial' ? 'dial-dev1' : 'host-ab12';
  const ctx = {
    hosts: { device: async () => ({}), findKeeperFor: async () => null, invalidateDiscovery() {}, get: () => h, sshArgs: () => ['-o', 'BatchMode=yes', 'u@box.invalid'] },
    path, fs, os, AGENT_BIN_DIR: path.join(REPO, 'data', 'bin'), EDITOR_CMD: path.join(REPO, 'data', 'bin', 'editor', 'code'), PORT: 41234,
    ownerWriteRefusal: () => null, cliConfigPlanB64: () => '', serverSetting: () => undefined, ensureDir: (x) => fs.mkdirSync(x, { recursive: true }), NODE_CMD: process.execPath,
    agentdRemote: { ensureAgentdOnHost: async () => { ht.tokenFor(hostKey); }, agentdHostToken: (k) => ht.tokenFor(k), lockedWhy: (k) => ht.lockedWhy(k), agentdDir, attachBundle: path.join(REPO, 'data', 'bin', 'vibespace-agentd-attach.js') },
    dialBridge: { ensure: async (o) => { ensured.push(o); return 45678; } },
  };
  const session = { agentToken: sessionToken };
  const c = {
    ctx, execFileAsync: async () => ({ stdout: '', stderr: '' }), ws: { send: (m) => sent.push(JSON.parse(m)) }, data: { reqId: 'r-1' }, id: 'sid-' + (++seq), SP: {}, sessionMode: mode, session,
    cwd: '/home/u/proj', spawnAccount: null, integrationOn: false, spawnBrowserPre: '', needsClaudeLoginHelper: false, sweepOpts: () => ({}), h,
    shq: (x) => `'${String(x).replace(/'/g, `'\\''`)}'`, rcmd: 'claude', rargs: ['--verbose'], spawnCmd: 'claude', spawnArgs: ['--verbose'], spawnEnvPairs: ['A=1'], spawnCwd: '/home/u/proj',
  };
  const answer = await ladder[mode](c);
  return { answer, sent, ensured, session, cfgFile: session._agentdCfgFile || null };
}
{
  const d = dirOf('spawn');
  const ht = HT.create({ dataDir: d, log: quiet });
  const v = mkVault(d);
  ok((await v.setup(PW, {})).ok, 'setup (the device tokens live in the vault)');
  const tokDial = ht.tokenFor('dial-dev1'), tokSsh = ht.tokenFor('host-ab12');
  const S = 'vsst_' + crypto.randomBytes(12).toString('hex');
  const leak = (r, tok) => {
    const argv = JSON.stringify([r.answer && r.answer.spawnCmd, ...(r.answer && r.answer.spawnArgs || []), ...(r.answer && r.answer.spawnEnvPairs || [])]);
    return { argv: argv.includes(tok), files: hitsIn(d, [tok], { skip: (f) => /vault\.json$/.test(f) || /vault-audit/.test(f) }).length, ws: JSON.stringify(r.sent).includes(tok) };
  };
  const cases = [['dial', 'chat'], ['dial', 'terminal'], ['ssh', 'chat']];
  for (const [transport, mode] of cases) {
    const ladder = R(transport === 'dial' ? DIAL : SSH);
    const tok = transport === 'dial' ? tokDial : tokSsh;
    const r = await runLadder(ladder, { mode, transport, d, ht, sessionToken: S });
    const cfg = r.cfgFile && fs.existsSync(r.cfgFile) ? JSON.parse(fs.readFileSync(r.cfgFile, 'utf8')) : null;
    const L = leak(r, tok);
    ok(r.answer && cfg && !('hostToken' in cfg) && cfg.hub && cfg.hub.port === 41234 && (fs.statSync(r.cfgFile).mode & 0o777) === 0o600 && !L.argv && !L.files && !L.ws,
      `UNLOCKED ${transport} ${mode}: session-<id>.json carries NO token (only where to ask: hub ${cfg && cfg.hub && cfg.hub.port}), 0 hits in argv / env pairs / every file / the answers`, { cfg, L, sent: r.sent });
  }
  // the env road is not taken either: ws-create's process env and argv for the wrapper name no device token
  const wsc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  ok(!/agentdHostToken|hostToken|link-token/.test(wsc), 'the wrapper\'s argv + env (src/ws-create.js r6Argv / r6Env) name no device token: the attach\'s ONE road is the hub\'s link-token door');
  v.lock('door');
  for (const [transport, mode] of cases) {
    const ladder = R(transport === 'dial' ? DIAL : SSH);
    const before = walk(path.join(d, 'agentd')).length;
    const r = await runLadder(ladder, { mode, transport, d, ht, sessionToken: S });
    const e = r.sent.find((m) => m.type === 'error');
    ok(r.answer === undefined && e && e.code === 'vault_locked' && /the vault is locked — the link token of (dial-dev1|host-ab12) opens after the owner unlocks/.test(e.message) && !r.ensured.length && walk(path.join(d, 'agentd')).length === before,
      `LOCKED ${transport} ${mode}: refused BY NAME (code vault_locked — the page opens the vault's door), no bridge, nothing written`, { sent: r.sent, ensured: r.ensured });
  }
  await v.unlock(PW, {});
  // THE MUTANT: a dial ladder that writes the token back into the attach config ⇒ the census leg above is RED
  const M = mutantCopies('vault-secrets', REPO);
  const src = fs.readFileSync(path.join(REPO, DIAL), 'utf8');
  const anchor = "const cfg = {   // NO TOKEN (lane vault-e2e-password-fix-r2) — the attach asks the hub (`hub`) at every (re)start\n                  tcp: { port: bridgePort },\n                  hub: { port: PORT },";
  ok(src.includes(anchor), 'the mutant\'s anchor is the chat ladder\'s attach config');
  const mut = require(M.write(DIAL, src.replace(anchor, anchor + "\n                  hostToken: agentdRemote.agentdHostToken('dial-' + h.deviceId),"), 'token-back'));
  const rm = await runLadder(mut, { mode: 'chat', transport: 'dial', d, ht, sessionToken: S });
  const cfgM = JSON.parse(fs.readFileSync(rm.cfgFile, 'utf8'));
  const Lm = leak(rm, tokDial);
  ok(cfgM.hostToken === tokDial && Lm.files >= 1, 'MUTANT (the token written back into session-<id>.json) ⇒ RED: the census finds the token in the attach config', Lm);
  fs.unlinkSync(rm.cfgFile);
}

console.log('④ THE ONE ROAD — GET /api/agent/vault/link-token + the REAL attach child + the REAL dial bridge');
{
  const express = require(path.join(REPO, 'node_modules/express'));
  const { registerVaultRoutes } = R('src/routes/vault.js');
  const { DialSessionBridge } = R('src/dial-session-bridge.js');
  const d = dirOf('road');
  const ht = HT.create({ dataDir: d, log: quiet });
  const v = mkVault(d);
  ok((await v.setup(PW, {})).ok, 'setup');
  const devTok = ht.tokenFor('dial-dev1');
  const S = 'vsst_' + crypto.randomBytes(12).toString('hex'), SL = 'vsst_' + crypto.randomBytes(12).toString('hex');
  const activeSessions = new Map([
    ['sid-road', { agentToken: S, host: 'host-dial-dev1', _agentdSession: true, _dialDeviceId: 'dev1' }],
    ['sid-local', { agentToken: SL, host: null }],
  ]);
  const app = express(); app.use(express.json());
  const waits = [], links = [];   // int317 RED-3: the door's audit rows
  registerVaultRoutes(app, { vault: v, activeSessions, linkTokenFor: (k) => ht.tokenFor(k), onVaultWait: (s) => waits.push(!!s._vaultWait), auditLink: (x) => links.push(x) });
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const hubPort = srv.address().port;
  const get = (tok) => new Promise((resolve) => { http.get({ host: '127.0.0.1', port: hubPort, path: '/api/agent/vault/link-token', headers: tok ? { Authorization: 'Bearer ' + tok } : {} }, (res) => { let b = ''; res.on('data', (c) => b += c); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { } resolve({ status: res.statusCode, j, cc: res.headers['cache-control'] }); }); }); });
  const g1 = await get(S);
  ok(g1.status === 200 && g1.j.token === devTok && g1.cc === 'no-store', 'the session\'s own token ⇒ 200, its machine\'s link token, never cached (no-store)', { status: g1.status });
  const g2 = await get(SL), g3 = await get('jbt_' + 'x'.repeat(20)), g4 = await get(null), g5 = await get('vsst_' + 'f'.repeat(24));
  ok(g2.status === 404 && g2.j.code === 'no_link' && !JSON.stringify(g2.j).includes(devTok) && g3.status === 401 && g4.status === 401 && g5.status === 401, 'a LOCAL session ⇒ 404 no_link; a job token, no token, an unknown session ⇒ 401 — no token in any refusal', { g2: g2.status, g3: g3.status, g4: g4.status, g5: g5.status });
  // the bridge, real: it checks the hello's token against the vault's
  const seen = [];
  const bridge = new DialSessionBridge({
    deviceForDial: async () => ({ openPipeSession: async (o) => { seen.push(o); const h = { ready: Promise.resolve({ pid: 4242, existing: false }), write() {}, kill() {}, onData: null, onExit: null }; return h; } }),
    hostTokenFor: (id) => ht.tokenFor('dial-' + id), log: () => {},
  });
  const bport = await bridge.ensure({ sid: 'sid-road', deviceId: 'dev1' });
  const attach = path.join(REPO, 'src/agentd/attach-cli.js');
  const runAttach = (cfg, env, ms = 8000) => new Promise((resolve) => {
    const f = path.join(d, `attach-${++seq}.json`);
    fs.writeFileSync(f, JSON.stringify(cfg), { mode: 0o600 });
    const ch = spawn(process.execPath, [attach, '--config', f, '--offset', '0'], { env: { PATH: process.env.PATH, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '', out = '';
    ch.stderr.on('data', (x) => { err += x; if (/attached sid=/.test(err)) { try { ch.kill('SIGTERM'); } catch { } } });
    ch.stdout.on('data', (x) => { out += x; });
    const t = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, ms);
    ch.on('exit', (code, sig) => { clearTimeout(t); resolve({ code, sig, err, out, argv: [attach, '--config', f], cfgText: fs.readFileSync(f, 'utf8') }); });
  });
  const cfg = { tcp: { port: bport }, hub: { port: hubPort }, sid: 'sid-road', version: '0', spawn: { cmd: 'sh', args: ['-lc', 'claude'], cwd: '/home/u' } };
  const a1 = await runAttach(cfg, { VIBESPACE_SESSION_TOKEN: S });
  ok(/attached sid=sid-road pid=4242/.test(a1.err) && seen.length === 1 && seen[0].sid === 'sid-road', 'UNLOCKED: the attach asked the hub with its session token, said hello to the bridge with the device token the vault holds — the bridge let it in and opened the pipe session', a1.err.slice(0, 400));
  ok(!a1.cfgText.includes(devTok) && !a1.argv.join(' ').includes(devTok) && !a1.err.includes(devTok) && !a1.out.includes(devTok), 'the token was in no config, argv, stderr or stdout of the attach — its memory only');
  // a legacy config's `hostToken` is NEVER used: no session token ⇒ the attach cannot ask, and does not fall back
  const a2 = await runAttach({ ...cfg, hostToken: devTok }, {});
  ok(a2.code === 5 && /no link token \(no-hub\)/.test(a2.err) && seen.length === 1, 'ONE ROAD: a config still holding `hostToken` (an older build\'s) is ignored — with no session token the attach exits 5, never says hello with it', { code: a2.code, err: a2.err.slice(0, 200) });
  const a3 = await runAttach(cfg, { VIBESPACE_SESSION_TOKEN: 'vsst_' + '0'.repeat(24) });
  ok(a3.code === 5 && /no link token \(unauthorized\)/.test(a3.err), 'a session token the hub does not know ⇒ refused, exit 5 (the wrapper retries)', { code: a3.code, err: a3.err.slice(0, 200) });
  v.lock('door');
  const g6 = await get(S);
  ok(g6.status === 423 && g6.j.code === 'vault_locked' && /the vault is locked — the link token of dial-dev1/.test(g6.j.error), 'LOCKED: the door answers 423 vault_locked, naming the machine', g6.j);
  ok(activeSessions.get('sid-road')._vaultWait > 0 && JSON.stringify(waits) === '[true]', 'verify RED-2: the 423 marks the session WAITING for the vault (`_vaultWait` — its row reads 「等待保险库解锁」, a state) and re-publishes the session list once', waits);
  await get(S);
  ok(JSON.stringify(waits) === '[true]', '…a second 423 changes nothing (no re-publish storm while the attach parks at 30 s)', waits);
  { // int317 — the r2 verify's RED-3: EVERY answer of the link-token door is ONE audit row (the session, its host key, the status), never the token
    const DA = R('src/device-acts.js');
    const st = links.map((l) => l.status), road = links.filter((l) => l.sid === 'sid-road');
    ok(st.filter((x) => x === 200).length === 2 && st.filter((x) => x === 404).length === 1 && st.filter((x) => x === 401).length === 4 && st.filter((x) => x === 423).length === 1, 'RED-3: one row per answer — 200 ×2 (the probe + the attach), 404 the local session, 401 ×4 (job / none / unknown ×2), ONE 423 (the second, while the session already waits, is the same fact)', st);
    ok(road.length === 3 && road.every((l) => l.hostKey === 'dial-dev1') && links.find((l) => l.status === 404).sid === 'sid-local' && links.filter((l) => l.status === 401).every((l) => l.sid === null && l.hostKey === null), 'by = the session (its sid + its host key); a token nobody holds names nobody', links);
    const line = DA.linkTokenLine({ at: 5, sid: 'sid-road', hostKey: 'dial-dev1', hostId: 'host-dial-dev1', machine: 'Studio Mac', status: 423 }), row = DA.rowOf(line);
    ok(row.op === 'link-token' && row.layer === 'session' && row.by === 'agent:sid-road' && row.hostId === 'host-dial-dev1' && row.ok === false && row.code === 423 && /dial-dev1/.test(row.summary) && /sid-road/.test(row.summary), 'the device-audit line: op link-token (layer session), by agent:<sid>, the machine\'s record, ok/code = the outcome, the host key in the summary', row);
    ok(!JSON.stringify(links).includes(devTok) && !JSON.stringify(line).includes(devTok) && DA.rowOf(DA.linkTokenLine({ sid: 'sid-road', hostKey: 'dial-dev1', status: 200 })).ok === true, 'the token is in no audit row (it is never an argument); a 200 reads ok', links.length);
  }
  const a4 = await runAttach(cfg, { VIBESPACE_SESSION_TOKEN: S });
  ok(a4.code === 7 && /no link token \(vault_locked\): the vault is locked/.test(a4.err) && seen.length === 1, 'LOCKED: the attach exits 7 with the vault\'s words on stderr (the chat-wrapper\'s reconnect line shows them; it retries every 30 s until the unlock) — the bridge is never reached', { code: a4.code, err: a4.err.slice(0, 300) });
  // the bridge itself, asked while LOCKED (a client that skipped the hub): told by name, the link closed — never a throw
  const net = require('net');
  const { Mux, PROTO_VERSION } = R('src/agentd/mux.js');
  const told = await new Promise((resolve) => {
    const sock = net.connect(bport, '127.0.0.1');
    const got = [];
    const mux = new Mux(sock, { onControl: (m) => got.push(m), onData() {}, onDead: () => resolve(got) });
    sock.on('connect', () => mux.control({ op: 'hello', protoVersion: PROTO_VERSION, hostToken: devTok, serverVersion: '0' }));
    sock.on('close', () => resolve(got));
    setTimeout(() => resolve(got), 3000);
  });
  ok(told.some((m) => m.op === 'session-error' && /vault is locked/.test(m.error)) && !told.some((m) => m.op === 'hello-ack'), 'LOCKED: a hello straight at the bridge (even with the right token) is told `the vault is locked` and closed — no hello-ack, no unhandled rejection in the hub', told);
  await v.unlock(PW, {});
  const g7 = await get(S);
  ok(g7.status === 200 && !('_vaultWait' in activeSessions.get('sid-road')) && JSON.stringify(waits) === '[true,false]', 'UNLOCKED: the next ask is answered and the wait ends (the row back to live)', waits);
  bridge.close('sid-road');
  await new Promise((r) => srv.close(r));
}

console.log('⑤ THE CARDS — a secret the LOCKED vault keeps closed reads 「保险库已锁定——先解锁」, never "expired" / "re-authorize"');
{
  const { pathToFileURL } = await import('node:url');
  const VAULT_EN = 'The vault is locked — unlock it first (Unlock… at the top of the page; For you names what is waiting on it)';   // lane vault-manual-and-lock: + where, and that For you names what waits (test-vault-words)
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(zh.includes(`  "${VAULT_EN}": "保险库已锁定——先解锁（`) && ja.includes(`  "${VAULT_EN}":`) && zh.includes('  "vault locked": "保险库已锁定"'), 'the sentence is 「保险库已锁定——先解锁」 in zh (and has ja); the short word 「保险库已锁定」');
  const caps = R('src/channel-caps.js');
  const CH = R('src/channels/index.js');
  const VM = R('src/voice-model.js');
  const CW = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-words.js')).href);
  const KW = await import(pathToFileURL(path.join(REPO, 'src/lib/key-file-words.js')).href);
  const t = (k) => k;
  const bad = /expired|re-?authori[sz]e|login/i;
  const rows = [
    ['channel-caps authState (the card\'s state)', caps.authState({ auth: { tokenEnc: 'x.y.z' }, lastPass: { ok: false, code: 'auth-expired' } }, Date.now(), { adapterState: { state: 'vault-locked' } }).state, 'vault-locked'],
    ['channel-caps errorCodeText (the failed-passes line)', caps.errorCodeText('vault-locked', { t }), 'vault locked'],
    ['channel-caps sendWhyText (read-only here)', caps.sendWhyText('vault-locked', { t }), VAULT_EN],
    ['channel-caps sendFoot (the window\'s foot)', caps.sendFoot(null, 'vault-locked', { t }).text, VAULT_EN],
    ['channel-words routeErrorText (a refused action\'s toast)', CW.routeErrorText({ code: 'vault-locked' }), VAULT_EN],
    ['key-file-words (integrations / accounts / mounts / app rows)', KW.keyFileWords('key-unreadable:vault_locked', '.channels-key'), VAULT_EN],
    ['voice-model voiceWords (the mic\'s chip)', VM.voiceWords('vault-locked').words, VAULT_EN],
    ['voice-model failureCodeOf(423) (the hub\'s refusal)', VM.failureCodeOf(423), 'vault-locked'],
  ];
  for (const [what, got, want] of rows) ok(got === want && !bad.test(String(got)), `${what}: ${JSON.stringify(got)}`, { got, want });
  const foot = caps.sendFoot(null, 'vault-locked', { t });
  ok(foot.reauth === false && foot.unlock === true && VM.voiceWords('vault-locked').action === 'unlock', 'the verb is the vault\'s door (unlock), never Re-authorize');
  // the adapter's own refusal
  const e1 = CH.notConnectedError('Lark', 'vault-locked'), e2 = CH.notConnectedError('Gmail', 'token-undecryptable: the vault is locked — .channels-key opens after …'), e3 = CH.notConnectedError('Slack', 'never-authenticated');
  ok(e1.code === 'vault-locked' && e1.retryable && e2.code === 'vault-locked' && e3.code === 'auth-expired' && CH.CHANNEL_ERROR_CODES.includes('vault-locked'), 'notConnectedError: the vault\'s why (the r2 code, or an older sentence naming it) ⇒ `vault-locked` (retryable); any other ⇒ `auth-expired`');
  // THE CENSUS: a file that words `auth-expired` words `vault-locked` too (a new card that says "expired" for a locked vault is RED)
  const files = walk(path.join(REPO, 'src')).filter((f) => /\.js$/.test(f) && !/\/channels\/(?!index\.js)/.test(f.replace(REPO, '')));
  const missing = [];
  for (const f of files) {
    const s = srcText(f);
    const words = /case 'auth-expired':\s*return\b|=== 'auth-expired' \? t\(/.test(s);
    if (words && !/'vault-locked'/.test(s)) missing.push(path.relative(REPO, f));
  }
  ok(missing.length === 0, `CENSUS: every file that words \`auth-expired\` also words \`vault-locked\` (${files.length} files scanned)`, missing);
  // the client cards: each auth-state switch draws the vault's line + the door
  const panel = fs.readFileSync(path.join(REPO, 'src/lib/channels-panel.js'), 'utf8');
  ok((panel.match(/auth\.state === 'vault-locked'/g) || []).length >= 4 && /vs-vault-door/.test(panel), 'the Channels panel: the account dot, its lines, the source dot and notes each draw `vault-locked` with the door (vs-vault-door)');
  for (const [f, re] of [['src/lib/integrations-window.js', /key-unreadable:vault_locked/], ['src/lib/plugins-ui.js', /p\.vaultLocked/], ['src/lib/oauth-connect-row.js', /'vault-locked'/], ['src/lib/sidebar-rail.js', /frpVaultLocked/], ['src/lib/voice-input.js', /'vault-locked'/], ['src/lib/session-lifecycle.js', /'vault_locked'/]]) {
    const s = fs.readFileSync(path.join(REPO, f), 'utf8');
    ok(re.test(s) && /vs-vault-door/.test(s), `${f}: the locked state is drawn with the vault's door`);
  }
  ok(/window\.addEventListener\(VAULT_DOOR_EVENT/.test(fs.readFileSync(path.join(REPO, 'src/lib/vault-unlock.js'), 'utf8')), 'the door is ONE listener (src/lib/vault-unlock.js): the unlock modal, or the Vault window once unlocked (lane vault-one-door)');
  // THE REAL ENGINE + THE REAL LARK ADAPTER over a LOCKED vault (the verifier's r1 finding: "The login expired — re-authorize")
  const IS = R('src/server/integration-store.js');
  const ENG = R('src/server/channels-engine.js');
  const d = dirOf('chan');
  const ints = IS.create({ dataDir: d, env: {}, log: quiet, broadcast: () => {} });
  ints.setIntegration('dropline', { apiKey: 'dl_' + 'k'.repeat(30) });   // a sealed key in the integrations store too
  const box = SB.secretBox(path.join(d, '.channels-key'), { hasCiphertext: () => false });
  const tokenEnc = box.enc(JSON.stringify({ access_token: 'u-access-sentinel', refresh_token: 'r-refresh-sentinel', expiresAt: Date.now() + 3600e3, refreshExpiresAt: Date.now() + 7 * 86400e3, openId: 'ou_1', name: 'Owner' }));
  fs.mkdirSync(path.join(d, 'channels'), { recursive: true });
  const rec = { id: 'lark-1', kind: 'lark', label: 'Lark', enabled: true, credentialKey: 'custom', credential: { appId: 'cli_a1b2c3d4e5f60718', appSecretEnc: box.enc('fs-secret-0001-abcdef') }, auth: { tokenEnc, expiresAt: Date.now() + 7 * 86400e3, scopes: ['im:message'], user: 'Owner' }, lastPass: null, consecutiveFailures: 0, push: { enabled: false }, options: {} };
  fs.writeFileSync(path.join(d, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [rec] }));
  const v = mkVault(d);
  ok((await v.setup(PW, {})).ok, 'setup: .channels-key + .integrations-key sealed into the vault');
  v.lock('door');
  const fetched = [];
  const eng = ENG.create({ dataDir: d, env: {}, integrations: ints, fetch: async (u) => { fetched.push(String(u)); throw new Error('no vendor in this suite'); }, log: quiet, broadcast: () => {}, serverSetting: () => undefined, liveSessions: () => [] });
  const r = await eng.pass('lark-1', { force: true });
  const rec2 = eng.adapterRecords().adapters.find((x) => x.id === 'lark-1');
  const view = eng.adapterView(rec2);
  ok(view.auth.state === 'vault-locked' && fetched.length === 0 && !(rec2.consecutiveFailures > 0) && !(rec2.lastPass && rec2.lastPass.code === 'auth-expired'), 'LOCKED: the account reads `vault-locked`; the pass built NO request and counted NO failure (no "For you" re-authorize item, no back-off)', { state: view.auth.state, fetched, cf: rec2.consecutiveFailures, lp: rec2.lastPass, r });
  // the adapter's own refusal, through the engine's real token store answer shape
  const adapter = eng.registry.create('lark', rec2, { now: Date.now, fetch: async () => { throw new Error('no vendor'); }, log: quiet, tokens: { read: () => ({ token: null, why: 'vault-locked' }) }, resolveIntegration: () => eng.clientFor(rec2) });   // the engine's own per-account client (customClientOf)
  let ae = null; try { await adapter.apiBearer(); } catch (e) { ae = e; }
  ok(ae && ae.code === 'vault-locked', 'LOCKED: the Lark adapter\'s own refusal (the account\'s own app secret sealed under the locked channels key) is `vault-locked` — never "expired" / "enter it again"', ae && { code: ae.code, msg: ae.message });
  const cf = eng.clientFor(rec2);
  const R0 = R('src/integration-registry.js');
  ok(cf.whyCode === 'vault-locked' && R0.credentialWhyText(cf, { t: (k) => k }) === VAULT_EN && ints.resolveIntegration('dropline').whyCode === 'vault-locked', 'LOCKED: the credential facts say `vault-locked` (an account\'s own client, an integrations row) — worded 「保险库已锁定——先解锁」, never "cannot be decrypted — enter it again"', { cf: cf.whyCode, ints: ints.resolveIntegration('dropline').whyCode });
  const adapter2 = eng.registry.create('lark', rec2, { now: Date.now, fetch: async () => { throw new Error('no vendor'); }, log: quiet, tokens: { read: () => ({ token: null, why: 'vault-locked' }) }, resolveIntegration: () => ({ source: 'cluster', values: { appId: 'cli_a1b2c3d4e5f60718', appSecret: 'fs-secret-0001-abcdef' }, missing: [] }) });
  let ae2 = null; try { await adapter2.apiBearer(); } catch (e) { ae2 = e; }
  ok(ae2 && ae2.code === 'vault-locked', 'LOCKED with a cluster credential: the sealed SIGN-IN alone ⇒ `vault-locked`', ae2 && ae2.code);
  await v.unlock(PW, {});
  ints.vaultChanged();
  await new Promise((res) => setTimeout(res, 50));
  ok(eng.adapterView(eng.adapterRecords().adapters.find((x) => x.id === 'lark-1')).auth.state !== 'vault-locked', 'UNLOCKED (the integrations re-derive the hooks fire): the account re-asks its auth and leaves `vault-locked` at once');
  try { eng.stop && eng.stop(); } catch { }
}

console.log('⑥ FRP — the relay token sealed; frpc.toml names an env var; LOCKED ⇒ the relay does not start, by name');
{
  const FRP = R('src/plugins/frp.js');
  const d = dirOf('frp');
  const pdir = path.join(d, 'plugin-frp');
  fs.mkdirSync(path.join(pdir, 'bin'), { recursive: true });
  // the fake frpc: records its argv, the token env and its config file, then lives (the plugin's pid check reads `frpc`)
  const recF = path.join(d, 'frpc-saw.json');
  fs.writeFileSync(path.join(pdir, 'bin', 'frpc'), `#!${process.execPath}\nconst fs=require('fs');const a=process.argv.slice(2);const c=a[a.indexOf('-c')+1];fs.writeFileSync(${JSON.stringify(recF)},JSON.stringify({argv:process.argv,env:process.env.VIBESPACE_FRP_AUTH_TOKEN||null,conf:fs.readFileSync(c,'utf8')}));setTimeout(()=>{},15000);\n`, { mode: 0o755 });
  let state = { plugins: { frp: { enabled: true } } };
  const pjson = path.join(d, 'plugins.json');
  const settings = { serverAddr: 'relay.example.invalid', serverPort: 7000 };
  const h = { id: 'frp', dir: pdir, opts: {}, rec: () => state.plugins.frp, peek: () => state.plugins.frp, save: () => fs.writeFileSync(pjson, JSON.stringify(state), { mode: 0o600 }), notify() {},
    settings: () => settings, setting: (k) => settings[k], writeSettings() {}, vault: () => SB.vaultForDir(d), sealedDir: () => SB.sealedDir(d) };
  const frp = FRP.create(h);
  const TOK = 'frp-relay-sentinel-' + crypto.randomBytes(6).toString('hex');
  frp.config({ token: TOK });
  ok(JSON.parse(fs.readFileSync(pjson, 'utf8')).plugins.frp.config.token === TOK && frp.status().configured, 'not set up: the override in plugins.json as before (the migration window)');
  const v = mkVault(d);
  const pm = { sealSecrets: () => frp.sealSecrets(), vaultChanged() {} };
  wireVaultHooks({ vault: v, plugins: pm, log: quiet });
  ok((await v.setup(PW, {})).ok, 'setup');
  const pj = JSON.parse(fs.readFileSync(pjson, 'utf8')).plugins.frp;
  ok(pj.config.tokenSealed === true && !('token' in pj.config) && !fs.readFileSync(pjson, 'utf8').includes(TOK) && v.secretGet('frp:token').value.toString() === TOK, 'the setup\'s open sweep moved the override into the vault (`frp:token`); plugins.json keeps only `tokenSealed`');
  ok(frp.status().configured && frp.status().tokenSealed && !frp.status().vaultLocked, 'unlocked: the relay is configured from the vault');
  frp.start();
  const saw = await (async () => { for (let i = 0; i < 100; i++) { if (fs.existsSync(recF)) { try { return JSON.parse(fs.readFileSync(recF, 'utf8')); } catch { } } await new Promise((r) => setTimeout(r, 30)); } return null; })();
  ok(saw && saw.env === TOK && !saw.argv.join(' ').includes(TOK) && !saw.conf.includes(TOK) && saw.conf.includes('auth.token = "{{ .Envs.VIBESPACE_FRP_AUTH_TOKEN }}"') && hitsIn(pdir, [TOK]).length === 0,
    'start: frpc.toml names an ENV var (frp\'s {{ .Envs.X }} template) — the token rides the frpc child\'s env only: not its argv, not its config, no file in its dir', saw && { env: !!saw.env, conf: saw.conf.split('\n').find((l) => /auth\.token/.test(l)) });
  try { frp.stop(); } catch { }
  v.lock('door');
  const st = frp.status();
  let se = null; try { frp.start(); } catch (e) { se = e; }
  let ce = null; try { frp.config({ token: 'another-token-123' }); } catch (e) { ce = e; }
  ok(st.vaultLocked && !st.configured && !st.missing.includes('token') && se && se.code === 'vault_locked' && /the vault is locked — the relay token opens/.test(se.message) && ce && ce.code === 'vault_locked' && !fs.readFileSync(pjson, 'utf8').includes('another-token'),
    'LOCKED: status `vaultLocked` (never "token missing"), start refused BY NAME, a new token refused (nothing written)', { st: { vaultLocked: st.vaultLocked, configured: st.configured, missing: st.missing }, se: se && se.message });
  await v.unlock(PW, {});
  // a frpc.toml an OLDER build wrote holds the token in the clear (a running frpc reads it): scrubbed at the next boot replay / open
  try { frp.stop(); } catch { }
  const conf = path.join(pdir, 'frpc.toml');
  fs.writeFileSync(conf, `serverAddr = "relay.example.invalid"\nserverPort = 7000\nauth.method = "token"\nauth.token = "${TOK}"\n`, { mode: 0o600 });
  const oldLink = path.join(d, 'frpc-old.link'); fs.linkSync(conf, oldLink);
  try { fs.unlinkSync(recF); } catch { }
  frp.bootReplay();
  const saw2 = await (async () => { for (let i = 0; i < 100; i++) { if (fs.existsSync(recF)) { try { return JSON.parse(fs.readFileSync(recF, 'utf8')); } catch { } } await new Promise((r) => setTimeout(r, 30)); } return null; })();
  ok(!fs.readFileSync(conf, 'utf8').includes(TOK) && !fs.readFileSync(oldLink, 'latin1').includes(TOK) && saw2 && saw2.env === TOK, 'an OLDER plaintext frpc.toml is scrubbed at the boot replay (the template; the old bytes overwritten — the hard link reads none) and the relay runs on the env road', saw2 && { env: !!saw2.env });
  frp.config({ token: '' });
  ok(!v.secretGet('frp:token').value && !(JSON.parse(fs.readFileSync(pjson, 'utf8')).plugins.frp.config || {}).tokenSealed, 'clearing the override drops the entry and the flag (the cluster\'s token, if any, again)');
  // the plugin manager's own open hook + its optional verb
  const PM = R('src/plugins.js');
  const calls = [];
  const stub = { id: 'stubsec', label: 'stub', description: '', provides: [], create: () => ({ install() {}, start() {}, stop() {}, status: () => ({}), sealSecrets: () => { calls.push('sealed'); return true; } }) };
  const mgr = new PM.PluginManager({ dataDir: dirOf('pm'), plugins: [stub] });
  ok(JSON.stringify(mgr.sealSecrets()) === '["stubsec"]' && calls.length === 1 && typeof mgr.vaultChanged === 'function', 'PluginManager.sealSecrets runs every plugin\'s sealSecrets (the vault\'s open hook) — an OPTIONAL verb');
  try { frp.stop(); } catch { }   // the fake frpc the replays started (its pid file) — none outlives the suite
  for (const pf of [path.join(pdir, 'frpc.pid')]) { try { process.kill(Number(fs.readFileSync(pf, 'utf8')), 'SIGKILL'); } catch { } }
}

console.log('⑦ THE VOICE PAIR — data/dropline-oauth.json sealed through the vault');
{
  const DC = R('src/server/dropline-client.js');
  const d = dirOf('voice');
  const file = path.join(d, 'dropline-oauth.json');
  const ACC = 'dl-access-sentinel-' + crypto.randomBytes(5).toString('hex'), REF = 'dl-refresh-sentinel-' + crypto.randomBytes(5).toString('hex');
  const tok = SJ.sealedJson(file, { dataDir: d });
  tok.write({ access: ACC, accessExp: Date.now() + 3600e3, refresh: REF, refreshExp: Date.now() + 60 * 86400e3, clientId: 'c1', name: 'Me', team: 'T' });
  ok(fs.readFileSync(file, 'utf8').includes(ACC) && (fs.statSync(file).mode & 0o777) === 0o600 && tok.read().access === ACC, 'not set up: the plain JSON file (0600) as before');
  const v = mkVault(d);
  wireVaultHooks({ vault: v, sealed: [tok], log: quiet });
  ok((await v.setup(PW, {})).ok, 'setup');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(SJ.isSealed(raw) && raw.entry === 'file:dropline-oauth.json' && hitsIn(d, [ACC, REF]).length === 0 && v.secretGet('file:dropline-oauth.json').value.length === 32, 'the setup\'s open sweep SEALED the file (its key a vault entry) — neither token in any file under data/', hitsIn(d, [ACC, REF]));
  ok(tok.read().access === ACC && SJ.sealedJson(file, { dataDir: d }).read().refresh === REF, 'unlocked: the pair reads back (a second reader too)');
  // the hourly refresh writes SEALED
  let fetchN = 0;
  const NEWACC = 'dl-access-rotated-' + crypto.randomBytes(5).toString('hex');
  const client = DC.create({ integrations: null, tokens: tok, log: quiet, fetchImpl: async (u) => { fetchN++; return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ access_token: NEWACC, refresh_token: 'dl-refresh-rotated-xyz', expires_in: 86400 }) }; } });
  tok.write({ ...tok.read(), accessExp: Date.now() - 1000 });
  const next = await client.refreshPair();
  ok(next.access === NEWACC && fetchN === 1 && SJ.isSealed(JSON.parse(fs.readFileSync(file, 'utf8'))) && !fs.readFileSync(file, 'utf8').includes(NEWACC), 'the refresh writes the rotated pair SEALED (the file never holds a token)');
  ok(client.account().state === 'connected' && !client.locked(), 'unlocked: the card reads connected');
  // verify r2 low: no decrypted copy of the pair outlives a lock — forget() drops the handle's cache (the hooks call it)
  ok(tok.read().access === NEWACC, 'the pair is cached in this handle while unlocked');
  const moved = file + '.moved'; fs.renameSync(file, moved);
  ok(tok.read() && tok.read().access === NEWACC, '(the cache answers without the file — the control for the next leg)');
  tok.forget();
  ok(tok.read() === null, 'forget(): the cache is gone — the next read meets the disk, not a remembered value');
  fs.renameSync(moved, file);
  const forgot = []; const vstub = { onOpen() {}, onLock: (fn) => forgot.push(fn) };
  wireVaultHooks({ vault: vstub, sealed: [{ seal() {}, forget: () => forgot.push('forgot') }], log: quiet });
  for (const fn of forgot.filter((x) => typeof x === 'function')) fn('door');
  ok(forgot.includes('forgot'), 'the vault\'s LOCK hook calls forget() on every sealed file (src/server/vault-hooks.js)');
  v.lock('door');
  let re = null; try { tok.read(); } catch (e) { re = e; }
  let we = null; try { tok.write({ access: 'x' }); } catch (e) { we = e; }
  ok(re && re.code === 'vault_locked' && we && we.code === 'vault_locked' && SJ.isSealed(JSON.parse(fs.readFileSync(file, 'utf8'))), 'LOCKED: read and write refused BY NAME (nothing read, nothing written)');
  // B-1e9a cure 3: writable() answers write()'s own first line — LOCKED ⇒ false for the sealed file AND for a file not made yet
  // (whose locked read gives nothing): a Connect asks it before the vendor's register, whose client id it could not keep
  const notYet = SJ.sealedJson(path.join(d, 'not-made-yet.json'), { dataDir: d });
  const heard = []; v.onBlocked((s) => heard.push(JSON.stringify(s)));   // the vault's For-you hook: a NO from writable() is a noted refusal
  ok(tok.writable() === false && notYet.writable() === false && notYet.read() === null && heard.some((s) => s.includes('not-made-yet.json')), 'B-1e9a cure 3: LOCKED ⇒ writable() false — the sealed file and a file not made yet alike (its read gives nothing, no throw) — and the NO is NOTED like write()\'s refusal (For you names the file)', { tok: tok.writable(), notYet: notYet.writable(), heard: heard.length });
  const acct = client.account();
  let be = null; try { await client.me(); } catch (e) { be = e; }
  ok(acct.state === 'vault-locked' && client.locked() && !client.connected() && be && be.code === 'vault-locked' && be.status === 423, 'LOCKED: the voice card reads `vault-locked` (the connect row draws the door), a call answers 423 vault-locked — never "connect your Dropline"', { acct, be: be && be.code });
  const VR = R('src/routes/voice.js');
  ok(typeof VR.create === 'function' && /vaultLocked: !!\(client\.locked && client\.locked\(\)\)/.test(fs.readFileSync(path.join(REPO, 'src/routes/voice.js'), 'utf8')) && /status\(423\)\.json\(\{ error: 'vault-locked' \}\)/.test(fs.readFileSync(path.join(REPO, 'src/routes/voice.js'), 'utf8')), 'GET /api/voice/status carries `vaultLocked`; a dictation while locked answers 423 vault-locked (the mic says the vault)');
  // a plaintext file written by an older build is sealed at its first unlocked read
  await v.unlock(PW, {});
  ok(tok.writable() === true && notYet.writable() === true, 'B-1e9a cure 3: unlocked ⇒ writable() true (both)');
  fs.writeFileSync(file, JSON.stringify({ access: 'dl-old-plain-access', refresh: 'dl-old-plain-refresh' }), { mode: 0o600 });
  const tok2 = SJ.sealedJson(file, { dataDir: d });
  ok(tok2.read().access === 'dl-old-plain-access' && SJ.isSealed(JSON.parse(fs.readFileSync(file, 'utf8'))) && hitsIn(d, ['dl-old-plain-access']).length === 0, 'a plain file restored after the setup: read once, sealed at that read (the plaintext overwritten in place)');
  tok2.clear();
  ok(!fs.existsSync(file) && v.secretGet('file:dropline-oauth.json').value === null, 'Disconnect: the file and its vault key forgotten');
}

console.log('⑧ THE MIGRATION TABLE — a production-shaped data dir, every r2 secret planted in the clear, booted in the hub\'s order');
{
  const { Auth } = R('src/auth.js');
  const PM = R('src/plugins.js');
  const FRPDEF = R('src/plugins/frp.js');
  const D = dirOf('prod');
  const ag = path.join(D, 'agentd'); fs.mkdirSync(ag, { recursive: true });
  const T1 = PT.mintToken('host'), T2 = PT.mintToken('host');
  fs.writeFileSync(path.join(ag, 'host-host-1111aaaa.token'), T1, { mode: 0o600 });
  fs.writeFileSync(path.join(ag, 'host-dial-laptop.token'), T2, { mode: 0o600 });
  fs.writeFileSync(path.join(ag, 'session-cw-ssh.json'), JSON.stringify({ sshBin: 'ssh', sshArgs: [], remoteCmd: 'x', hostToken: T1, sid: 'cw-ssh', version: '1' }), { mode: 0o600 });
  fs.writeFileSync(path.join(ag, 'session-cw-dial.json'), JSON.stringify({ tcp: { port: 40001 }, hostToken: T2, sid: 'cw-dial', version: '1' }), { mode: 0o600 });
  const L = [crypto.randomBytes(24).toString('hex'), crypto.randomBytes(24).toString('hex'), crypto.randomBytes(24).toString('hex')];
  const now = Date.now(), DAY = 86400e3;
  const salt = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(D, 'auth.json'), JSON.stringify({ passwordHash: crypto.scryptSync('signin-pw', Buffer.from(salt, 'hex'), 32).toString('hex'), salt, userSet: true,
    tokens: { [L[0]]: { createdAt: now - 10 * DAY, ua: 'phone' }, [L[1]]: { createdAt: now - 100 * DAY, ua: 'laptop' }, [L[2]]: { createdAt: now - 200 * DAY, ua: 'old' } } }));
  const authLink = path.join(D, 'auth.json.before'); fs.linkSync(path.join(D, 'auth.json'), authLink);
  const FRPT = 'frp-relay-' + crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(path.join(D, 'plugins.json'), JSON.stringify({ plugins: { frp: { enabled: false, config: { token: FRPT } } } }));
  const A = 'dl-acc-' + crypto.randomBytes(8).toString('hex'), B = 'dl-ref-' + crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(path.join(D, 'dropline-oauth.json'), JSON.stringify({ access: A, accessExp: now + 3600e3, refresh: B, refreshExp: now + 50 * DAY, clientId: 'c' }), { mode: 0o600 });
  const planted = [T1, T2, ...L, FRPT, A, B];
  const before = hitsIn(D, planted).length;
  // THE HUB'S BOOT ORDER: auth (server.js, early) → the attach-config sweep + the engine (mounts-plugins-wiring) → the person's setup
  const auth = new Auth(D);
  const authText = fs.readFileSync(path.join(D, 'auth.json'), 'utf8');
  ok(L.every((x) => !authText.includes(x)) && L.every((x) => authText.includes(crypto.createHash('sha256').update(x).digest('hex'))) && (fs.statSync(path.join(D, 'auth.json')).mode & 0o777) === 0o600 && !L.some((x) => fs.readFileSync(authLink, 'latin1').includes(x)),
    'auth.json at the FIRST start: every login re-keyed by its sha256 (0600), the plaintext map overwritten in the retired inode (the hard link reads none)');
  ok(auth.checkToken(L[0]) && auth.checkToken(L[1]) && !auth.checkToken(L[2]), 'every login inside the 180-day cap stays valid ONCE (the migration counts as a use); one past the cap is gone');
  const ht = HT.create({ dataDir: D, log: quiet });
  ht.stripCopies();
  const v = mkVault(D);
  const mgr = new PM.PluginManager({ dataDir: D, plugins: [FRPDEF] });
  wireVaultHooks({ vault: v, auth, hostTokens: ht, plugins: mgr, sealed: [SJ.sealedJson(path.join(D, 'dropline-oauth.json'), { dataDir: D })], log: quiet });
  ok((await v.setup(PW, {})).ok, 'the second password set (the setup + its open sweeps)');
  const after = hitsIn(D, planted, { skip: (f) => f === authLink });
  const TABLE = [
    ['data/agentd/host-<id>.token ×2', 'plaintext vsht_', 'vault entries host:<id> (files shredded)', !fs.existsSync(path.join(ag, 'host-host-1111aaaa.token')) && ht.tokenFor('host-1111aaaa') === T1 && ht.tokenFor('dial-laptop') === T2],
    ['data/agentd/session-<id>.json ×2', 'a copy of the token', 'no token (the attach asks the hub)', ['session-cw-ssh.json', 'session-cw-dial.json'].every((f) => !('hostToken' in JSON.parse(fs.readFileSync(path.join(ag, f), 'utf8'))))],
    ['data/auth.json tokens ×3', 'plaintext map keys', 'sha256 digests (30-day slide, 180-day cap)', auth.checkToken(L[0]) && !authText.includes(L[0])],
    ['data/plugins.json frp config.token', 'plaintext', 'vault entry frp:token (tokenSealed)', v.secretGet('frp:token').value.toString() === FRPT && !fs.readFileSync(path.join(D, 'plugins.json'), 'utf8').includes(FRPT)],
    ['data/dropline-oauth.json', 'plaintext pair', 'sealed file (key = vault entry file:dropline-oauth.json)', SJ.isSealed(JSON.parse(fs.readFileSync(path.join(D, 'dropline-oauth.json'), 'utf8')))],
  ];
  for (const [what, was, now2, good] of TABLE) ok(good, `${what}: ${was} → ${now2}`);
  ok(before >= 9 && after.length === 0, `every planted value (${planted.length}: 2 host tokens + their 2 copies, 3 logins, the relay token, the voice pair) — raw / hex / base64 — is in NO file under data/ now (it was in ${before})`, after);
  // design q-046 (lane automation-keys-core): an AUTOMATION KEY minted on the same data dir — its value is the vault entry
  // apikey:<id> only (the store keeps its sha256): in NO file under data/ (raw / hex / base64), and LOCKED ⇒ every use 423
  {
    const AE = R('src/server/automation-engine.js').create({ dataDir: D, vault: v, verbs: { 'conversations.rename': () => ({ ok: true }) } });
    const mk = AE.mint({ name: 'plant key', scopes: ['conversations.rename'] });
    const akv = v.secretGet(`apikey:${mk.key.id}`).value.toString();
    const store = fs.readFileSync(path.join(D, 'automation-keys.json'), 'utf8');
    ok(mk.ok && /^vsak_/.test(akv) && store.includes(crypto.createHash('sha256').update(akv).digest('hex')) && hitsIn(D, [akv], { skip: (f) => f === authLink }).length === 0,
      'an automation key: the vault entry apikey:<id> holds its value, data/automation-keys.json its sha256 only — the value is in NO file under data/ (raw / hex / base64)');
    AE.grant(mk.key.id, ['session:c-plant']);
    v.lock('door');
    const r = await AE.use({ caller: { conversationId: 'c-plant', sessionKey: 'claude:c-plant', live: true, groups: [] }, verb: 'conversations.rename', args: { name: 'x' } });
    ok(r.code === 'vault_locked', 'LOCKED ⇒ the automation key\'s use answers vault_locked (423 at the door)', r);
    await v.unlock(PW, {});
  }
  // design q-047 L1 (lane vault-totp): a TWO-STEP SEED added on the same data dir — the vault entry totp:<name> holds it,
  // data/vault-grants.json who may have the CODE: the seed is in NO file under data/ (raw / hex / base64); LOCKED ⇒ an agent's
  // use answers vault_locked; and the seed's readers are NAMED: every src/ file that calls secretGet( is a row below (a new
  // reader is RED until classified) — of them, only the two-step module and the reveal door can open a totp: entry
  {
    const TV = R('src/server/vault-totp.js').create({ dataDir: D, vault: v });
    const SEEDP = R('src/totp.js').base32Encode(crypto.randomBytes(20));   // a planted seed, built at runtime
    const add = TV.addEntry({ uri: `otpauth://totp/Plant:me?secret=${SEEDP}&issuer=Plant` }, { who: 'me' });
    const raw = Buffer.from(R('src/totp.js').base32Decode(SEEDP).bytes);
    const gr = TV.grant('plant-me', ['group:T-plant'], { who: 'me' });
    ok(add.ok && gr.ok && hitsIn(D, [SEEDP, raw.toString('hex'), raw.toString('base64')], { skip: (f) => f === authLink }).length === 0 && !fs.readFileSync(path.join(D, 'vault-grants.json'), 'utf8').includes(SEEDP),
      'a two-step seed: the vault entry totp:<name> holds it, data/vault-grants.json who may have the code — the seed (base32, its bytes in hex / base64) is in NO file under data/');
    v.lock('door');
    const u = TV.use({ conversationId: 'c-plant', groups: ['T-plant'], run: 'a'.repeat(24) }, 'plant-me');
    ok(u.code === 'vault_locked' && !JSON.stringify(u).includes(SEEDP), 'LOCKED ⇒ the granted agent\'s code answers vault_locked', u);
    await v.unlock(PW, {});
    const READERS = new Map([
      ['src/agent-output-belt.js', 'the OUTPUT BELT (q-043 P0-b, lane agent-output-sinks): the plaintext of the REVEALABLE secrets (maskableSecrets) read ONLY to blank an agent\'s OWN text where it lands in a store — never answered to anyone'],
      ['src/server/vault-totp.js', 'THE two-step module: a code (and a preview) from the record — never the seed in an answer'],
      ['src/server/vault-contents.js', 'the reveal door (secretSource): ONE value behind the second password — a totp entry as its otpauth link'],
      ['src/server/automation-engine.js', 'apikey:<id> only (A.entryOf)'], ['src/server/host-tokens.js', 'host:<id> only'], ['src/plugins/frp.js', 'frp:token only'], ['src/server/sealed-json.js', 'file:<name> only'],
      ['src/server/browser-logins.js', 'web-login:<origin>#<user> only (lane browser-login — the ONE writer): ONE entry opened for ONE fill the kernel makes (its values to the kernel on the loopback socket, never in an answer) or a save verdict'],
      ['src/server/browser-proxy-logins.js', 'proxy-login:<scheme>://<host>:<port>#<user> only (B-8b87 — the ONE writer and reader): ONE entry opened when a browser profile\'s forwarder starts (its launch, or the boot that adopts it) — the password handed to the profile\'s proxy upstream, never to the browser, an argv, an env or a record; each reading a use noted (door browser-proxy)'],
      ['src/server/provider-store.js', 'provider:<id> only (lane lg-providers, B-d578 — keyOf, the ONE reader of a third-party provider\'s key): opened for ONE spawn of a conversation that picked that provider, the person\'s Test, or the listed-model refresh — into that child\'s env or one request header — or the put-back of a failed new key / address change (the OLD key sealed back into the vault); its buffer zeroed; never an answer, never a file'],
      ['src/server/vault-job-door.js', 'secret:<id> / agent:<scope>/<name> only (lane vault-job-road): a Background Work job\'s --vault values, opened at ONE spawn the verdict allowed, framed for the wrapper\'s fd 3 and zeroed — never an answer, never a file'],
    ]);
    const walkJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkJs(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
    const callers = [...walkJs(path.join(REPO, 'src')), path.join(REPO, 'server.js')].filter((f) => /\bsecretGet\(/.test(srcCode(f))).map((f) => path.relative(REPO, f)).filter((f) => f !== 'src/server/vault-engine.js').sort();
    ok(callers.join() === [...READERS.keys()].sort().join(), `THE SEED'S READERS are named: every src/ caller of secretGet( is classified (${callers.join(', ')})`, { callers, named: [...READERS.keys()] });
  }
  // lane lg-vault-file (B-0830): a FILE the vault keeps, on the same data dir — data/vault-files/<id>.vfile holds it SEALED (the
  // SECRETS_AT_REST row): every line of it, and the whole of it (raw / hex / base64), is in NO file under data/; LOCKED ⇒ its one
  // road answers vault_locked
  {
    const LINES = [`licence-key: ${crypto.randomBytes(24).toString('hex')}`, `signature: ${crypto.randomBytes(30).toString('base64')}`];
    const FB = Buffer.from(['# a licence file', ...LINES, ''].join('\n'));
    const fp = (await v.filePut('keyfile:0f0e0d0c0b', FB, { filename: 'licence.lic', prov: 'uploaded' }));
    ok(fp.ok && fs.readdirSync(path.join(D, 'vault-files')).length >= 1 && hitsIn(D, [...LINES, FB.toString()], { skip: (f) => f === authLink }).length === 0,
      'a FILE the vault keeps: data/vault-files/<id>.vfile holds it sealed — none of its lines, nor the whole (raw / hex / base64), is in any file under data/');
    ok(R('src/vault.js').SECRETS_AT_REST.some((r) => /data\/vault-files/.test(r.where) && /keyfile:/.test(r.entry)), 'SECRETS_AT_REST names data/vault-files and its entries');   // stale-pins: kept (it reads src/vault.js's SECRETS_AT_REST row, which holds the words)
    v.lock('door');
    ok((await v.fileOpen('keyfile:0f0e0d0c0b')).code === KF.VAULT_LOCKED, 'LOCKED ⇒ its one road answers vault_locked');
    await v.unlock(PW, {});
  }
  // the boundary, stated by the census: what stays a file (TLS key, vendor CLI files, …) is the exception list — none of it is planted here
  const VAULT_SRC = fs.readFileSync(path.join(REPO, 'src/vault.js'), 'utf8');
  ok(/SECRETS_AT_REST/.test(VAULT_SRC) && R('src/vault.js').SECRETS_AT_REST.filter((r) => r.exception).map((r) => r.what).join(' · ').length > 0, 'the exceptions are a NAMED list (src/vault.js SECRETS_AT_REST): ' + R('src/vault.js').SECRETS_AT_REST.filter((r) => r.exception).map((r) => r.what).join(' · '));
  // lane job-secrets-retire (design-vault-service-secret D10): data/job-secrets.json — a PLAINTEXT 0600 store of a job's
  // secrets that no client wrote and no SECRETS_AT_REST row named — is RETIRED, not migrated: a job's secret comes from the
  // vault. Planted in this production-shaped dir: the REAL jobs wiring on a REAL express app answers GET / POST
  // /api/jobs-secrets 404 (no name, no value, the file byte-identical after), and NO READER IS LEFT — no file under src/,
  // server.js or data/bin names the store or its routes outside a comment (the engine's runs: test-jobs-engine §14).
  // r2 (accept-r1): a store an owner once filled by hand is RETIRED, never silently kept or deleted — the one-shot
  // 2026-10-job-secrets-retired renames it to data/job-secrets.retired.json (0600, kept) and tells the owner (its legs:
  // test-migrations); here the retired name is a KNOWN secret at rest: SECRETS_AT_REST names it, and after the one-shot a
  // planted value is in that ONE file and nowhere else under data/. The census names exactly two files beside a comment —
  // the one-shot and the row — and lists data/bin through git (law B-abd8: never a working-tree walk).
  {
    const JV = 'job-sec-' + crypto.randomBytes(10).toString('hex');   // built at runtime: no secret-shaped literal in the tree
    const jsf = path.join(D, 'job-secrets.json');
    fs.writeFileSync(jsf, JSON.stringify({ PLANTED_TOKEN: JV }), { mode: 0o600 });
    const was = fs.readFileSync(jsf);
    const express = require('express');
    const app = express(); app.use(express.json());
    R('src/server/jobs-wiring.js').create({ app, dataDir: D, broadcastAll() {}, userTodos: { add() {}, resolveByJob() { return 0; } }, log() {}, serverSetting: () => undefined,
      taskGroups: null, activeSessions: null, deliver: { peerReachable: () => false, deliverToConversation: async () => ({ ok: false, reason: 'no lane' }) } });   // routes only: no initAfterListen, no engine
    const srv = http.createServer(app);
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const at = `http://127.0.0.1:${srv.address().port}/api/jobs-secrets`;
    const g = await fetch(at), gt = await g.text();
    const pp = await fetch(at, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'PLANTED_TOKEN', value: 'over' }) }), pt = await pp.text();
    await new Promise((r) => srv.close(r));
    ok(g.status === 404 && pp.status === 404 && ![gt, pt].some((t) => t.includes('PLANTED_TOKEN') || t.includes(JV)) && fs.readFileSync(jsf).equals(was),
      'data/job-secrets.json (planted, retired): GET and POST /api/jobs-secrets on the REAL jobs wiring answer 404 — no name, no value, the file untouched', { get: g.status, post: pp.status, body: gt.slice(0, 120) });
    // src/ is walked (a new, not-yet-committed source file counts); data/bin is git's list (its untracked rclone ELF and the
    // generated agentd bundle are not source — test-architecture §96)
    const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.isFile() ? [path.join(dir, e.name)] : []));
    const code = srcCode;   // the memo above (r1563): naming() runs twice over the scope
    const scope = [...files(path.join(REPO, 'src')).filter((f) => f.endsWith('.js')), path.join(REPO, 'server.js'), ...trackedFiles(REPO, 'data/bin').map((f) => path.join(REPO, f))];
    const naming = (re) => scope.filter((f) => re.test(code(f))).map((f) => path.relative(REPO, f)).sort();
    const KNOWN = new Map([
      ['src/server/migrations.js', 'the one-shot 2026-10-job-secrets-retired: it RENAMES the store and tells the owner — never into a job, never a value said'],
      ['src/vault.js', 'SECRETS_AT_REST: the retired file is a known secret at rest until the owner deletes it'],
    ]);
    const readers = naming(/job-secrets\.json|\/api\/jobs-secrets/);
    ok(scope.length > 100 && readers.join() === [...KNOWN.keys()].sort().join(), `NO READER LEFT: outside a comment only the two named files name data/job-secrets.json or /api/jobs-secrets (${[...KNOWN].map(([f, why]) => f + ' — ' + why).join('; ')})`, readers);
    // B-ef1b: + the notice's own door — a PERSON's press moves each value into the vault (then deletes the file) or deletes it
    const RETIRED_KNOWN = new Map([...KNOWN, ['src/server/job-secrets-door.js', 'B-ef1b: the notice\'s two buttons — a person\'s press seals each value into the vault, then deletes the file (or deletes it) — never into a job, never a value said']]);
    // the batches 52–54 «also» (B-ef1b's refusals name their way on): the WORDS that tell a person / an API caller where to act name
    // the file's path — they SAY it, they never open it: in a WORDS file every mention is the sentence form «data/job-secrets.retired.json»
    // followed by a space or a comma (a reader joins the bare quoted name — the one-shot, the door), so a reader there is still red
    const RETIRED_WORDS = new Map([
      ['src/lib/vault-paste-box.js', 'the page\'s refusal words for the notice\'s two buttons (job_secrets_not_a_file / job_secrets_value_shape): where to act, then press again'],
      ['src/lib/i18n-zh.js', 'the same two refusal sentences in Chinese'],
      ['src/lib/i18n-ja.js', 'the same two refusal sentences in Japanese'],
      ['src/routes/vault.js', 'the route\'s own words for the same two refusals (an API caller reads them)'],
    ]);
    const retiredNaming = naming(/job-secrets\.retired\.json/), retiredKnown = new Set([...RETIRED_KNOWN.keys(), ...RETIRED_WORDS.keys()]);
    const unsaidIn = (t) => (t.match(/job-secrets\.retired\.json/g) || []).length !== (t.match(/data\/job-secrets\.retired\.json[ ,]/g) || []).length;   // a mention that is not the sentence form
    const notSaid = (f) => unsaidIn(code(path.join(REPO, f)));
    const retiredVerdict = (names, unsaid = (f) => RETIRED_WORDS.has(f) && notSaid(f)) => ({ unknown: names.filter((f) => !retiredKnown.has(f)), missing: [...RETIRED_KNOWN.keys()].filter((f) => !names.includes(f)), notWords: names.filter(unsaid) });
    const rv = retiredVerdict(retiredNaming);
    ok(!rv.unknown.length && !rv.missing.length && !rv.notWords.length,
      `the retired name is KNOWN: the one-shot writes it, SECRETS_AT_REST names it, the notice's door (B-ef1b) moves or deletes it — and only the refusal WORDS besides (${[...RETIRED_WORDS].map(([f, why]) => f + ' — ' + why).join('; ')}) — no other file; a WORDS file names it only as a sentence`, { naming: retiredNaming, ...rv });
    // RED controls of the leg's OWN predicate (retiredVerdict, planted inputs): a file outside both lists naming it ⇒ unknown; the door
    // no longer naming it ⇒ missing; a WORDS file that joins the bare name as a reader would ⇒ not words
    const plantedOut = retiredVerdict([...retiredNaming, 'src/lib/elsewhere.js']), plantedGone = retiredVerdict(retiredNaming.filter((f) => f !== 'src/server/job-secrets-door.js'));
    const asReader = code(path.join(REPO, 'src/lib/vault-paste-box.js')) + "\nconst f = path.join(dataDir, 'job-secrets" + ".retired.json');";   // the page's words + a reader line planted
    const plantedRead = retiredVerdict(['src/lib/vault-paste-box.js', ...RETIRED_KNOWN.keys()], (f) => RETIRED_WORDS.has(f) && unsaidIn(asReader));
    ok(plantedOut.unknown.join() === 'src/lib/elsewhere.js' && !plantedOut.missing.length && plantedGone.missing.join() === 'src/server/job-secrets-door.js' && !plantedGone.unknown.length && plantedRead.notWords.join() === 'src/lib/vault-paste-box.js',
      'RED controls of the leg\'s own predicate: a planted file outside the lists ⇒ unknown; the door no longer naming it ⇒ missing; a WORDS file joining the bare name as a reader ⇒ not words', { plantedOut, plantedGone, plantedRead });
    const row = R('src/vault.js').SECRETS_AT_REST.find((r) => /data\/job-secrets\.retired\.json/.test(r.where || ''));
    ok(!!row && /0600/.test(row.where) && /OWNER/.test(row.exception || '') && /never a value/.test(row.exception || '') && /into the vault/.test(row.exception || ''),
      'SECRETS_AT_REST names data/job-secrets.retired.json (0600) as an EXCEPTION with its reason: the owner\'s bytes, kept until they delete them; the notice names them (never a value) and the recipe', row);
    // the one-shot over a production-shaped root: the planted value ends in the retired file ONLY (0600) — the notice, the
    // inbox store and the ledger hold none of it
    const JR = dirOf('jsr-root'), JD = path.join(JR, 'data'); fs.mkdirSync(JD, { recursive: true });
    fs.writeFileSync(path.join(JD, 'job-secrets.json'), JSON.stringify({ PLANTED_TOKEN: JV }), { mode: 0o644 });
    const ran = R('src/server/migrations.js').create({ rootDir: JR, homeDir: dirOf('jsr-home'), serverNotice: () => { } }).runLocalMigrations({ only: ['2026-10-job-secrets-retired'] })[0];
    const where = hitsIn(JD, [JV]).map((h) => h.f);
    const retMode = fs.existsSync(path.join(JD, 'job-secrets.retired.json')) ? fs.statSync(path.join(JD, 'job-secrets.retired.json')).mode & 0o777 : null;
    ok(ran && ran.status === 'ran' && where.length > 0 && where.every((f) => f === 'job-secrets.retired.json') && retMode === 0o600 && !fs.existsSync(path.join(JD, 'job-secrets.json')),
      'after the one-shot a planted value is in ONE file under data/ — job-secrets.retired.json (0600), the row\'s file — and in no notice, inbox store or ledger', { ran: ran && ran.status, where, retMode });
  }
  for (const [what, , , good] of TABLE) void what, void good;
}

console.log('\u2468 THE RESTART\u2019S FOR-YOU ITEM (lane vault-relock-door) \u2014 a boot over a SET UP + LOCKED vault files ONE tray notice; a second boot keeps ONE; unlock resolves it; not set up files nothing \u2014 lane vault-locked-refusal-notice: it is THE item \u2014 a refusal refreshes it (who and what), one row ever, a dismissal holds for the lock epoch, an upgrade\u2019s old row gives way, bounded; RED: the pre-fix engine files nothing');
{
  const { UserTodoManager } = R('src/user-todos.js');
  const { VAULT_INBOX_KEY, RELOCK_TEXT, LOCKED_TEXT, VAULT_ITEM_TEXT, BLOCKED_TEXT, NOTHING_YET, ROW_LINE, MORE_LINE } = R('src/server/vault-hooks.js');
  const mkTodos = (d) => new UserTodoManager({ dataDir: d, onChange: () => {}, expirySweepMs: 0 });
  const relocks = (t) => t.forSession(VAULT_INBOX_KEY).filter((i) => i.action && i.action.type === 'vault-unlock');
  // NOT SET UP \u21d2 nothing (the migration window asks at page load, never a tray row)
  {
    const d = dirOf('relock-unset'); const v = mkVault(d); const t = mkTodos(d);
    wireVaultHooks({ vault: v, userTodos: t, log: quiet });
    ok(v.state() === 'not_set_up' && relocks(t).length === 0, 'not set up \u21d2 no restart item'); t.stop();
  }
  // SET UP + UNLOCKED at boot \u21d2 nothing (it is not locked)
  {
    const d = dirOf('relock-open'); const v = mkVault(d); await v.setup(PW, {}); const t = mkTodos(d);
    wireVaultHooks({ vault: v, userTodos: t, log: quiet });
    ok(v.state() === 'unlocked' && relocks(t).length === 0, 'set up but unlocked at boot \u21d2 no restart item'); t.stop();
  }
  // SET UP + LOCKED \u21d2 ONE; a second boot (a fresh store re-reading the file) \u21d2 still ONE (the SAME row); unlock \u21d2 resolved
  {
    const d = dirOf('relock-locked');
    const v0 = mkVault(d); await v0.setup(PW, {}); v0.lock('close', { quiet: true }); // the shutdown leaves it set-up + locked
    const v1 = mkVault(d); const t1 = mkTodos(d);
    ok(v1.state() === 'locked', 'a boot over a set-up dir starts LOCKED by law');
    wireVaultHooks({ vault: v1, userTodos: t1, log: quiet });
    const one = relocks(t1);
    ok(one.length === 1 && one[0].kind === 'action' && one[0].urgency === 'urgent' && one[0].origin === 'vault' && one[0].action.type === 'vault-unlock' && one[0].text === VAULT_ITEM_TEXT && one[0].i18n.text.key === LOCKED_TEXT && one[0].i18n.detail[0].key === NOTHING_YET, 'set up + locked boot \u21d2 ONE For-you item (origin vault, the vault-unlock door; lane vault-locked-refusal-notice: THE item\u2019s one text, nothing refused yet; lane vault-locked-loud: an URGENT action row, the lock\u2019s own words)', one.map((i) => ({ kind: i.kind, origin: i.origin, type: i.action && i.action.type, text: i.text, i18n: i.i18n })));
    t1.flush(); t1.stop();
    const v2 = mkVault(d); const t2 = mkTodos(d); // boot 2: the persisted item re-read
    wireVaultHooks({ vault: v2, userTodos: t2, log: quiet });
    const two = relocks(t2);
    ok(two.length === 1 && two[0].id === one[0].id, 'a second boot while still locked \u21d2 no duplicate (dedupe by key + text + action keeps the SAME row)', { ids: two.map((i) => i.id), first: one[0].id });
    await v2.unlock(PW, {});
    ok(relocks(t2).length === 0 && t2.get(one[0].id) && t2.get(one[0].id).status === 'done' && t2.get(one[0].id).resolvedBy === 'vault', 'a person\u2019s unlock resolves the item (onUnlock)', t2.get(one[0].id));
    t2.stop();
  }

  // ── lane vault-locked-refusal-notice (the owner 2026-10-20: "为啥老是有 agent 和我说需要解锁 vault"): A REFUSAL IS THE SIGNAL —
  //    the boot item becomes THE item: refreshed by a refusal that changes who the lock stopped, one row ever, resolved on unlock
  const VB = R('src/vault-blocked.js');
  const allVault = (t) => t._state.items.filter((i) => i.sessionKey === VAULT_INBOX_KEY && i.action && i.action.type === 'vault-unlock');
  const mkClocked = (d, clock) => { let changes = 0; const t = new UserTodoManager({ dataDir: d, onChange: () => { changes++; }, expirySweepMs: 0, now: () => clock.t }); return { t, changes: () => changes }; };
  {
    const d = dirOf('blocked-boot');
    const clock = { t: 1800000000000 };
    const v0 = mkVault(d, { now: () => clock.t }); await v0.setup(PW, {}); v0.lock('close', { quiet: true });
    clock.t += 1000;
    const v1 = mkVault(d, { now: () => clock.t }); const { t, changes } = mkClocked(d, clock);
    wireVaultHooks({ vault: v1, userTodos: t, log: quiet });
    const id0 = relocks(t)[0] && relocks(t)[0].id;
    // a device link refused (the REAL host-tokens door, the machine named by nameOf — never its id)
    const ht = HT.create({ dataDir: d, nameOf: (k) => (k === 'host-0123abcd' ? 'mac-mini' : null) });
    clock.t += 1000;
    let e1 = null; try { ht.tokenFor('host-0123abcd'); } catch (e) { e1 = e; }
    const a = relocks(t);
    ok(e1 && e1.code === 'vault_locked' && a.length === 1 && a[0].id === id0 && a[0].i18n.text.key === BLOCKED_TEXT && a[0].i18n.text.params.who === 'mac-mini (device link)' && a[0].detail === 'mac-mini — device link · 1×',
      'a REFUSAL (a device link, the real host-tokens door) refreshes THE SAME item: its line names the machine by NAME and what it was refused', a.map((i) => ({ id: i.id, i18n: i.i18n, detail: i.detail })));
    const c0 = changes();
    try { ht.tokenFor('host-0123abcd'); } catch { }
    ok(changes() === c0 && relocks(t)[0].i18n.text.params.who === 'mac-mini (device link)', 'the same refusal again changes nothing the owner reads (no store write, no broadcast)', { before: c0, after: changes() });
    clock.t += 1000;
    v1.blocked('Worker one', 'vibespace-api conversations.rename');
    SB.lawfulKey(path.join(d, '.accounts-key'), { hasCiphertext: () => false });   // the store-key road: noted by the engine itself
    const b = relocks(t);
    ok(b.length === 1 && b[0].id === id0 && allVault(t).length === 1 && b[0].i18n.text.params.who === 'mac-mini (device link) · Worker one (vibespace-api conversations.rename) · VibeSpace (the accounts store)' && b[0].i18n.detail.length === 3 && b[0].i18n.detail.every((l) => l.key === ROW_LINE),
      'a second caller and the store-key road ⇒ STILL ONE item (one row ever): the named callers first, VibeSpace’s own read last; one detail line each', b.map((i) => i.i18n));
    ok(v1.facts().blocked === 3, 'facts().blocked = 3 (what the lock strip counts)');
    // the owner sets it aside: a later refusal THIS lock epoch refiles nothing
    clock.t += 1000;
    t.setStatus(id0, 'dismissed', 'user');
    clock.t += 1000;
    v1.blocked('Lane three', 'device link');
    ok(t.get(id0).status === 'dismissed' && relocks(t).length === 0 && !JSON.stringify(t.get(id0).i18n).includes('Lane three'), 'the owner DISMISSED it ⇒ a later refusal in the same lock epoch reopens nothing (quiet until the next lock)', t.get(id0));
    clock.t += 1000;
    await v1.unlock(PW, {});
    ok(v1.facts().blocked === 0 && relocks(t).length === 0, 'the unlock clears the list (the strip’s count 0)');
    clock.t += 1000;
    v1.lock('door');   // a lock ACT: lane vault-locked-loud — the item is filed AT ONCE (never first at a refusal)
    ok(relocks(t).length === 1 && relocks(t)[0].id === id0 && relocks(t)[0].i18n.text.key === LOCKED_TEXT && relocks(t)[0].urgency === 'urgent', 'lane vault-locked-loud: a LOCK ACT files THE item at once — the same row reopened, urgent, before anybody is refused', relocks(t).map((i) => i.i18n));
    clock.t += 1000;
    v1.blocked('Worker one', 'vibespace-api conversations.rename');
    const c = relocks(t);
    ok(c.length === 1 && c[0].id === id0 && allVault(t).length === 1 && c[0].i18n.text.params.who === 'Worker one (vibespace-api conversations.rename)',
      'the FIRST refusal of the new lock epoch REOPENS the same row (same id — one row, ever), naming only who this lock stopped', c.map((i) => ({ id: i.id, who: i.i18n.text.params })));
    clock.t += 1000;
    await v1.unlock(PW, {});
    const done = t.get(id0);
    ok(done.status === 'done' && done.resolvedBy === 'vault' && relocks(t).length === 0, 'a person’s unlock resolves it (the onUnlock door, unchanged)', done);
    t.stop();
  }
  // an older build's restart notice (its own text) gives way to THE item — never two rows for one lock
  {
    const d = dirOf('blocked-legacy');
    const v0 = mkVault(d); await v0.setup(PW, {}); v0.lock('close', { quiet: true });
    const t0 = mkTodos(d);
    const old = t0.add(VAULT_INBOX_KEY, { origin: 'vault', kind: 'notice', urgency: 'high', by: 'agent', sessionName: 'Vault', text: RELOCK_TEXT, i18n: { text: { key: RELOCK_TEXT } }, action: { type: 'vault-unlock' } });
    t0.flush(); t0.stop();
    const v1 = mkVault(d); const t1 = mkTodos(d);
    wireVaultHooks({ vault: v1, userTodos: t1, log: quiet });
    const open = relocks(t1);
    ok(open.length === 1 && open[0].text === VAULT_ITEM_TEXT && t1.get(old.id).status === 'done' && t1.get(old.id).resolvedBy === 'vault', 'an UPGRADE over an open 2.369.325 restart notice: that row is resolved, THE item is the one open row', { open: open.map((i) => i.text), old: t1.get(old.id) && t1.get(old.id).status });
    t1.stop();
  }
  // bounded: 60 callers ⇒ ≤ 12 detail lines, the rest counted
  {
    const d = dirOf('blocked-bound');
    const v0 = mkVault(d); await v0.setup(PW, {}); v0.lock('close', { quiet: true });
    const v1 = mkVault(d); const t1 = mkTodos(d);
    wireVaultHooks({ vault: v1, userTodos: t1, log: quiet });
    for (let i = 0; i < 60; i++) v1.blocked(`Lane ${i}`, 'device link');
    const it = relocks(t1)[0];
    const last = it.i18n.detail[it.i18n.detail.length - 1];
    ok(it.i18n.detail.length === 12 && last.key === MORE_LINE && last.params.n === `${VB.MAX_ACTORS - VB.DETAIL_ROWS}+` && it.i18n.text.params.who.endsWith(' · …') && v1.facts().blocked === VB.MAX_ACTORS,
      `BOUNDED: 60 callers \u21d2 ${VB.DETAIL_ROWS} detail lines + one \u00ab\u2026and ${VB.MAX_ACTORS - VB.DETAIL_ROWS}+ more\u00bb line (the + = some fell past the list: counted, not named), the item\u2019s line ends \u2026; the list holds ${VB.MAX_ACTORS}`, { lines: it.i18n.detail.length, last, blocked: v1.facts().blocked });
    t1.stop();
  }
  // RED CONTROL: a PATCHED COPY of the PRE-FIX engine (a scratch dir, never the tree) — its refusals note nothing ⇒ a lock act
  // followed by a refusal files NO item: the owner is never told and the agent is the messenger (the owner's complaint)
  {
    const MB = mutantCopies('vault-secrets-blocked', REPO);
    const esrc = fs.readFileSync(path.join(REPO, 'src/server/vault-engine.js'), 'utf8');
    const anchor = "  function blocked(actor, verb) {\n    if (state() !== 'locked') return false;\n";
    ok(esrc.includes(anchor), 'the control’s anchor is the ONE helper’s first line');
    const VEpre = MB.load('src/server/vault-engine.js', editAnchor(esrc, anchor, "  function blocked(actor, verb) {\n    return false;   // PRE-FIX: a refusal is nobody's signal\n", "src/server/vault-engine.js"), 'pre-fix');
    const run = async (engineMod, tag) => {
      const d = dirOf(tag);
      const v = engineMod.create({ dataDir: d, kdf: CHEAP, log: quiet, idleTimer: false }); engines.push(v);
      await v.setup(PW, {});
      const t = mkTodos(d);
      wireVaultHooks({ vault: v, userTodos: t, log: quiet });
      v.lock('door');
      let code = null; try { SB.secretBox(path.join(d, '.accounts-key'), { hasCiphertext: () => false }).enc('x'); } catch (e) { code = e.reason; }
      const items = relocks(t); t.stop(); v.close();
      return { code, items: items.length, who: items[0] ? items[0].i18n.text.params : null };
    };
    const pre = await run(VEpre, 'blocked-red-pre'), fixed = await run(VE, 'blocked-red-fixed');
    // lane vault-locked-loud: the lock act itself files THE item now, so the pre-fix engine's miss is the NAME — its row says
    // the lock, never who it stopped
    ok(pre.code === KF.VAULT_LOCKED && pre.items === 1 && !(pre.who && pre.who.who), 'RED: the pre-fix engine — a store read refused vault_locked after a lock act names NOBODY on the item (the lock act filed it; the refusal noted nothing)', pre);
    ok(fixed.code === KF.VAULT_LOCKED && fixed.items === 1 && fixed.who && fixed.who.who === 'VibeSpace (the accounts store)', 'the shipped engine — the same refusal files ONE item naming it', fixed);
  }
}

console.log('⑩ THE DAILY-FAILURE CARD (lane vault-use-law — design q-043 D7): the 20th failed use of one actor × one entry in a day files ONE For-you item naming both; the owner resolves it (an unlock never does); a day later the same pair files again; the lock\'s own refusals never count; 20 wrong second passwords from one address are their own, urgent card');
{
  const { UserTodoManager } = R('src/user-todos.js');
  const { VAULT_INBOX_KEY, FAILING_TEXT, FAILING_LINE, FAILING_PW_LINE, FAILING_DOOR, FAILING_ONCE, FAILING_PW_HINT } = R('src/server/vault-hooks.js');
  const VU = R('src/vault-use.js');
  const clock = { t: 1800000000000 };
  const d = dirOf('failing');
  const v = mkVault(d, { now: () => clock.t }); await v.setup(PW, {});
  const t = new UserTodoManager({ dataDir: d, onChange: () => {}, expirySweepMs: 0, now: () => clock.t });
  wireVaultHooks({ vault: v, userTodos: t, log: quiet });
  const failing = () => t._state.items.filter((i) => i.sessionKey === VAULT_INBOX_KEY && String(i.text).startsWith(FAILING_TEXT));
  const knock = (n, actor = 'Law lane', conv = 'c-law', entry = VU.VAULT_ENTRY, outcome = 'human_only', door = 'unlock') => { for (let i = 0; i < n; i++) { clock.t += 20e3; v.noteUse(entry, { by: 'agent', door, conv }, { outcome, actor, purpose: 'unlock the vault' }); } };
  knock(19);
  ok(failing().length === 0, '19 refused uses in a day ⇒ no item yet');
  knock(1);
  const [one] = failing();
  ok(failing().length === 1 && one.origin === 'vault' && one.kind === 'notice' && one.urgency === 'high' && !one.action && one.status === 'open' && one.text === `${FAILING_TEXT} — Law lane: the second password`, 'the 20th ⇒ ONE item in the Vault bucket, no button (the owner resolves it), its text = the pair (one row per actor × entry)', one);
  ok(one.i18n.text.key === FAILING_LINE && JSON.stringify(one.i18n.text.params) === JSON.stringify({ who: 'Law lane', what: 'the second password', n: VU.FAIL_PER_DAY }) && one.i18n.detail.map((l) => l.key).join('|') === [FAILING_DOOR, FAILING_ONCE].join('|') && one.i18n.detail[0].params.door === 'unlock' && one.i18n.detail[0].params.code === 'human_only', 'its words name the ACTOR and the ENTRY, the count, the door and the last answer (i18n: en/zh/ja)', one.i18n);
  ok(/Through unlock; the last answer was human_only\./.test(one.detail), 'its plain detail says the same (an older page)', one.detail);
  knock(30);
  ok(failing().length === 1 && failing()[0].id === one.id && failing()[0].status === 'open', '30 more the same day ⇒ still ONE item (the count fires once a day)');
  knock(40, 'Other lane', 'c-other', 'host:dial-mac01', 'vault_locked', 'link-token');
  ok(failing().length === 1, 'the LOCK\'s own refusals (40 × vault_locked) file nothing here — the lock\'s item names those');
  v.lock('door'); await v.unlock(PW, {});
  ok(t.get(one.id).status === 'open', 'an unlock never resolves it (it is not the lock\'s)');
  knock(20, 'Second lane', 'c-two');
  ok(failing().length === 2 && failing().some((i) => i.i18n.text.params.who === 'Second lane'), 'another actor at the same door ⇒ its own item');
  t.setStatus(one.id, 'done', 'user');
  knock(25);
  ok(t.get(one.id).status === 'done', 'the OWNER resolves it — the same day\'s further failures leave it resolved');
  clock.t += VU.DAY_MS;
  knock(20);
  ok(t.get(one.id).status === 'open' && failing().filter((i) => i.i18n.text.params.who === 'Law lane').length === 1, 'a day later, 20 more ⇒ the SAME row reopens (one row per pair, ever)', t.get(one.id));
  v.lock('door');
  for (let i = 0; i < 20; i++) { clock.t += i % 5 === 0 ? 61e3 : 1e3; await v.unlock('not the second password', { ip: '203.0.113.5' }); }
  const pw = failing().find((i) => i.i18n.text.key === FAILING_PW_LINE);
  ok(pw && pw.urgency === 'urgent' && pw.i18n.text.params.who === 'someone at 203.0.113.5' && pw.i18n.text.params.n === VU.FAIL_PER_DAY && pw.i18n.detail.map((l) => l.key).join('|') === [FAILING_DOOR, FAILING_PW_HINT].join('|'), 'design §2 T7: 20 wrong second passwords from one address in a day ⇒ ONE URGENT item naming the address (lock the vault, change the sign-in password)', pw);
  ok(!JSON.stringify(t._state.items).includes('not the second password') && !fs.readFileSync(path.join(d, 'vault-audit.jsonl'), 'utf8').includes('not the second password'), 'no password in any item or audit line');
  t.stop();
}

console.log('⑪ THE DOOR\'S PRESS (B-6f65) — the vault\'s door is heard from the App\'s construction; a press before the facts waits for them');
{
  // the REAL src/lib/vault-unlock.js bundled by esbuild; stubs only for what draws a dialog, asks the hub or opens a window
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const STUBS = {
    'i18n.js': 'export const t = (s) => s;',
    'utils.js': 'export const createModalShell = (o) => globalThis.__vd.shell(o); export const fetchJson = (u) => globalThis.__vd.fetch(u); export const showToast = () => {}; export const familyHeldWords = () => null;',   // r3002 (b): the unlock page reads its held code\'s words from the one table (r3428 law 2: the stand-in carried)
    'icons.js': 'export const UI_ICONS = {};',
    'chat-enter-keys.js': 'export const enterSubmits = () => {};',
    'window-types.js': 'export const replayOpenSpec = (app, spec) => globalThis.__vd.open(spec);',
    'customize-mode.js': 'export const slotBeside = () => null;',
  };
  const built = new Map();   // one esbuild run per shape; each page requires a fresh copy (its own module state)
  const bundleDoor = async (mutate) => {
    if (!built.has(mutate)) built.set(mutate, await buildDoor(mutate));
    const f = path.join(dirOf('door'), 'vault-unlock.cjs');
    fs.writeFileSync(f, built.get(mutate));
    return require(f);
  };
  const buildDoor = async (mutate) => {
    const out = await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/vault-unlock.js')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
      plugins: [{ name: 'vd', setup(b) {
        b.onResolve({ filter: /^\.\/(i18n|utils|icons|chat-enter-keys|window-types|customize-mode)\.js$/ }, (a) => ({ path: a.path.slice(2), namespace: 'vd-stub' }));
        b.onLoad({ filter: /.*/, namespace: 'vd-stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
        if (mutate) b.onLoad({ filter: /vault-unlock\.js$/ }, (a) => { const s0 = fs.readFileSync(a.path, 'utf8'), m = mutate(s0); if (m === s0) throw new Error('the door mutant changed nothing'); return { contents: m, loader: 'js', resolveDir: path.dirname(a.path) }; });
      } }] });
    return out.outputFiles[0].text;
  };
  // a page: the window (a real EventTarget — the door's event), a document that draws nothing, the hub's answer held until told
  const anyEl = () => new Proxy(function () { }, { get: (t0, k) => (k === Symbol.toPrimitive ? () => '' : anyEl()), set: () => true, apply: () => anyEl() });
  const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
  const page = async (mutate) => {
    const M = await bundleDoor(mutate), seen = [], gets = [], shells = [];
    let answer = null;
    globalThis.__vd = {
      shell: (o) => { seen.push(`dialog:${o.id}`); shells.push(o); return { dialog: anyEl(), body: anyEl(), close() { }, raised: true }; },
      fetch: (u) => { gets.push(String(u)); return new Promise((r) => { answer = r; }); },
      open: (spec) => { seen.push(`window:${spec.action}`); },
    };
    const win = new EventTarget();
    const press = () => win.dispatchEvent(new CustomEvent('vs-vault-door'));
    return { M, seen, gets, shells, press, win, answer: (f) => { if (answer) answer(f); } };
  };
  const had = { window: globalThis.window, document: globalThis.document };
  const scene = async (mutate, run) => {
    const p = await page(mutate);
    globalThis.window = p.win; globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() { }, removeEventListener() { }, createElement: () => anyEl(), body: anyEl() };
    try { return await run(p); } finally { globalThis.window = had.window; globalThis.document = had.document; }
  };
  // (a) THE EARLY PRESS: the App's construction listened (app.js), /api/home has not answered — initVault has not run
  const early = (p) => (async () => { p.M.listenVaultDoor({}); p.press(); await tick(); const asked = p.gets.length; p.answer({ state: 'unlocked' }); await tick(); return { seen: p.seen.join(), asked }; })();
  const e1 = await scene(null, early);
  ok(e1.asked === 1 && e1.seen === 'window:openVault', 'a press BEFORE initVault ran (the construction listened) is heard: it reads the state and opens the Vault window (unlocked)', e1);
  const only407 = (s0) => s0.replace('  window.addEventListener(VAULT_DOOR_EVENT, pressDoor);\n', '').replace('  listenVaultDoor(app);   // (app.js already did, at the construction — B-6f65; once)\n', '  window.addEventListener(VAULT_DOOR_EVENT, pressDoor);\n');
  const eRed = await scene(only407, early);
  ok(eRed.seen === '' && eRed.asked === 0, 'RED control: the door added only where initVault adds it (the .407 shape: initVault listens, the construction does not) ⇒ the same press is LOST — nothing opens', eRed);
  // (b) THE PRESS BEFORE THE FACTS: initVault's boot read is in flight
  const before = (state) => (p) => (async () => {
    p.M.initVault({}); p.press(); p.press(); await tick();
    const meanwhile = p.seen.join(), asked = p.gets.length;
    p.answer({ state, startedAt: 7 }); await tick();
    return { meanwhile, asked, seen: p.seen.join(), gets: p.gets.length };
  })();
  const b1 = await scene(null, before('unlocked'));
  ok(b1.meanwhile === '' && b1.seen === 'window:openVault' && b1.gets === 1, 'two presses while the boot read is in flight: nothing opens over a state not yet known, then ONE Vault window once it answers unlocked — no second read, no unlock dialog', b1);
  const b2 = await scene(null, before('locked'));
  ok(b2.meanwhile === '' && /^dialog:vault-unlock-dialog/.test(b2.seen) && !/window:/.test(b2.seen) && b2.gets === 1, 'the same presses over a LOCKED vault ⇒ the unlock dialog (the load\'s ask and the press are one dialog), no window', b2);
  const b3 = await scene(null, before('not_set_up'));
  ok(b3.seen === 'dialog:vault-setup-dialog', 'over a vault NOT SET UP ⇒ the setup dialog', b3);
  const bRed = await scene((s0) => s0.replace('  if (facts) { doorOpens(); return; }\n', '  { doorOpens(); return; }\n'), before('unlocked'));
  // A HUB THAT ANSWERS NOTHING (a held loop): the press waits DOOR_WAIT_MS at most (3 s; 30 ms in this shape), then the unlock
  // dialog — and the press is still answered when the facts land (unlocked ⇒ the Vault window)
  const short = (s0) => s0.replace('const DOOR_WAIT_MS = 3000;', 'const DOOR_WAIT_MS = 30;');
  const held = (p) => (async () => {
    p.M.initVault({}); p.press(); await new Promise((r) => setTimeout(r, 80)); await tick();
    const bounded = p.seen.join();
    p.press(); await tick();   // a SECOND press after the bound, the facts still unknown (the reader's should): it joins the same answer
    p.answer({ state: 'unlocked', startedAt: 7 }); await tick();
    return { bounded, seen: p.seen.join() };
  })();
  const h1 = await scene(short, held);
  ok(h1.bounded === 'dialog:vault-unlock-dialog' && h1.seen === 'dialog:vault-unlock-dialog,dialog:vault-unlock-dialog,window:openVault', 'a hub that answers nothing: after the bound the UNLOCK dialog (never a silent press); a second press meanwhile gets the dialog again (raised, or back after 「稍后」) and joins the one answer; once the facts say unlocked, ONE Vault window', h1);
  const hSilent = await scene((s0) => short(s0).replace("  if (doorWait && doorPast) { showUnlock(); return; }   // a press AFTER the bound, the facts still unknown: the dialog again (raised, or back after 「稍后」) — never a silent press; the one answer still comes\n", ''), held);
  ok(hSilent.seen === 'dialog:vault-unlock-dialog,window:openVault', 'RED control: a press after the bound swallowed by the open wait (the cure\'s first shape) ⇒ the second press shows NOTHING (after 「稍后」 the person would see no dialog for as long as the hub holds)', hSilent);
  const h2 = await scene((s0) => short(s0).replace('    await read;   // …and the press is answered once it is — a later press while it waits joins THIS answer (one window, never two)\n    doorWait = null;\n', '    doorWait = null;\n    await read;\n'), held);
  ok((h2.seen.match(/window:openVault/g) || []).length === 2, 'RED control: the wait released at the bound (the first cure shape) ⇒ the second press opens a second dialog and a SECOND Vault window', h2);
  const hRed = await scene((s0) => short(s0).replace('    await Promise.race([read, bound]);\n', '    await read;\n'), held);
  ok(hRed.bounded === '', 'RED control: the wait without its bound ⇒ a press on a held hub shows NOTHING for as long as the hub holds', hRed);
  ok(/^dialog:vault-unlock-dialog/.test(bRed.meanwhile), 'RED control: the press decides at once (the .407 shape) ⇒ the UNLOCK dialog opens over the unlocked vault', bRed);
  // the wiring: app.js listens in the App's construction, before /api/home is asked (initVault stays in its then)
  const appSrc = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8');
  const listensFirst = (src) => { const i = src.indexOf('\n    listenVaultDoor(this);'), h = src.indexOf("\n    fetch('/api/home').then(r => {"); return i > 0 && h > i && h - i < 300 && src.indexOf('initVault(this);') > h; };
  ok(listensFirst(appSrc), 'app.js: listenVaultDoor(this) runs in the construction right before /api/home is asked; initVault(this) stays in its then');
  ok(!listensFirst(appSrc.replace('\n    listenVaultDoor(this);', '').replace('initVault(this);', 'listenVaultDoor(this); initVault(this);')), 'RED control: the call moved into /api/home\'s then ⇒ the wiring check is red');
  // B-864f CURE (the reader round's must): «Unlock and resume all n» waited on the unlock dialog's close alone — but the facts
  // saying UNLOCKED remove that dialog (applyVaultFacts) and a removed form runs none of its closers, so the resumes never ran.
  // unlockThen runs `go` ONCE on whichever comes first: the vault turning unlocked, or the person's close (Later / Esc / ✕)
  const thenScene = (first) => (p) => (async () => {
    p.M.initVault({}); p.answer({ state: 'locked', startedAt: 7 }); await tick();   // the boot read: LOCKED (the load's own ask opens)
    let went = 0;
    p.M.unlockThen(() => { went++; });
    const sh = p.shells.filter((o) => o.id === 'vault-unlock-dialog').pop();
    const unlock = async () => { const rp = p.M.refreshVaultFacts(); p.answer({ state: 'unlocked', startedAt: 7 }); await rp; await new Promise((r) => setTimeout(r, 5)); await tick(); };   // (go runs on a zero timer — outside the facts loop, cure 2)
    const close = async () => { if (sh && sh.onClose) sh.onClose(); await new Promise((r) => setTimeout(r, 10)); await tick(); };
    if (first === 'unlock') { await unlock(); const atUnlock = went; await close(); return { atUnlock, went }; }
    await close(); const atClose = went; await unlock(); return { atClose, went };
  })();
  const u1 = await scene(null, thenScene('unlock'));
  ok(u1.atUnlock === 1 && u1.went === 1, 'unlockThen: the vault turns UNLOCKED while the dialog is open (it is removed, no closer runs) ⇒ go runs ONCE, and a later close runs nothing more', u1);
  const u2 = await scene(null, thenScene('close'));
  ok(u2.atClose === 1 && u2.went === 1, 'unlockThen: the person closes the dialog (Later) first ⇒ go runs ONCE (the resumes start; each folder that waits says so), a later unlock runs nothing more', u2);
  const uRed = await scene((s0) => s0.replace("  off = onVaultFacts((f) => {\n    if (!f) return;\n    if (f.state === 'not_set_up') { if (ran) return; endUnrun(); if (typeof ended === 'function') setTimeout(ended, 0); return; }   // cure 4 (主开发): a RESET is no unlock — the wait ends unrun, nothing it waited for runs; a caller that asked to hear it (`ended` — the boot offer) gives its door back\n    if (f.state !== 'unlocked') return;\n    if (!here || unlockedHere) { once(); return; }\n    if (!unlockAsked) endUnrun(); else raceWaits.add(endUnrun);\n  });\n", "  off = () => { };\n"), thenScene('unlock'));
  // the ⚙ press (unlockFirst — the same root, the cure's own read): THIS page's unlock in its dialog (which removes it) opens the
  // menu after it, once; ANOTHER tab's or device's unlock does not (cure 2, 主开发: a menu popping open minutes later is not what
  // the press asked for). The leg's own bundle exposes the page's own unlock road (applyUnlockHere, the dialog's submit) by a
  // source line it appends — the product exports nothing for it
  const exposeHere = (s0) => s0 + '\nexport const __applyUnlockHere = applyUnlockHere;\nexport const __asking = (n) => { unlockAsked += n; };\nexport const __ownMissed = () => ownUnlockMissed();\n';
  const gearScene = (by) => (p) => (async () => {
    p.M.initVault({}); p.answer({ state: 'locked', startedAt: 7 }); await tick();
    let opened = 0; p.M.unlockFirst(() => { opened++; });
    const facts = async (state) => { const rp = p.M.refreshVaultFacts(); p.answer({ state, startedAt: 7 }); await rp; };   // the hub's facts (a broadcast / a read)
    if (by === 'here') p.M.__applyUnlockHere({ state: 'unlocked', startedAt: 7 });
    else if (by === 'missed') { p.M.__asking(1); await facts('unlocked'); await tick(); p.M.__asking(-1); p.M.__ownMissed(); await new Promise((r) => setTimeout(r, 5)); await facts('locked'); p.M.__applyUnlockHere({ state: 'unlocked', startedAt: 7 }); }   // the restack read: another device's unlock lands while THIS page's own is in flight, and this page's own comes back NOT ok; hours later an unlock here for another reason
    else if (by === 'reset') { await facts('not_set_up'); await new Promise((r) => setTimeout(r, 5)); await facts('locked'); p.M.__applyUnlockHere({ state: 'unlocked', startedAt: 7 }); }   // the restack read: the vault is RESET while the dialog is open; later it is set up again and unlocked here
    else if (by === 'raced') { p.M.__asking(1); await facts('unlocked'); await tick(); p.M.__asking(-1); p.M.__applyUnlockHere({ state: 'unlocked', startedAt: 7 }); }   // this page's unlock: the hub's broadcast lands BEFORE its answer
    else { await facts('unlocked'); await new Promise((r) => setTimeout(r, 5)); await facts('locked'); p.M.__applyUnlockHere({ state: 'unlocked', startedAt: 7 }); }   // another device unlocks; later the vault locks and THIS page unlocks for another reason
    await new Promise((r) => setTimeout(r, 5)); await tick();
    return { opened };
  })();
  const g1 = await scene(exposeHere, gearScene('here'));
  ok(g1.opened === 1, 'the ⚙ press while locked: THIS page\'s unlock in its dialog (which removes it) opens the menu after it, once — on a zero timer', g1);
  const g2 = await scene(exposeHere, gearScene('elsewhere'));
  ok(g2.opened === 0, 'the ⚙ press while locked: ANOTHER device\'s unlock ENDS the wait unrun — no menu then, and none when this page unlocks later for another reason (cure 2b)', g2);
  const g3 = await scene(exposeHere, gearScene('raced'));
  ok(g3.opened === 1, 'the ⚙ press: THIS page\'s unlock whose broadcast lands before its own answer still opens the menu, once', g3);
  const gRed3 = await scene((s0) => exposeHere(s0.replace('    if (!unlockAsked) endUnrun(); else raceWaits.add(endUnrun);\n', '')), gearScene('elsewhere'));
  ok(gRed3.opened === 1, 'RED control: a wait another device\'s unlock leaves ARMED (cure 2\'s shape) ⇒ a later unlock here pops the menu hours after the press', gRed3);
  const gRed4 = await scene((s0) => exposeHere(s0.replace('    if (!unlockAsked) endUnrun(); else raceWaits.add(endUnrun);\n', '    endUnrun();\n')), gearScene('raced'));
  ok(gRed4.opened === 0, 'RED control: the wait dropped on ANY other unlock, this page\'s own in flight included ⇒ the broadcast that lands first kills the press', gRed4);
  // the restack's readers (cure 3): this page's own unlock that FAILS after another page's unlock raced it ends the ⚙ wait unrun;
  // a RESET while the dialog is open ends it unrun too (a resume-all's wait goes on: its door comes back)
  const g5 = await scene(exposeHere, gearScene('missed'));
  ok(g5.opened === 0, 'the ⚙ press: another device\'s unlock lands while THIS page\'s own is in flight and this page\'s own comes back NOT ok ⇒ the wait ENDS unrun — no menu at a later unlock here (cure 3)', g5);
  const gRed5 = await scene((s0) => exposeHere(s0.replace('function ownUnlockMissed() { for (const end of [...raceWaits]) end(); raceWaits.clear(); }', 'function ownUnlockMissed() { }')), gearScene('missed'));
  ok(gRed5.opened === 1, 'RED control: a missed own unlock that ends nothing (cure 2\'s shape) ⇒ the wait stays armed with no dialog and pops the menu at a later unlock here', gRed5);
  const g6 = await scene(exposeHere, gearScene('reset'));
  ok(g6.opened === 0, 'the ⚙ press: the vault RESET while the unlock dialog is open ⇒ the wait ends unrun — no menu when it is unlocked here later (cure 3)', g6);
  const gRed6 = await scene((s0) => exposeHere(s0.replace("    if (f.state === 'not_set_up') { if (ran) return; endUnrun(); if (typeof ended === 'function') setTimeout(ended, 0); return; }", '')), gearScene('reset'));
  ok(gRed6.opened === 1, 'RED control: a reset that ends nothing (cure 2\'s shape) ⇒ the wait stays armed and pops the menu at the later unlock here', gRed6);
  const resetGo = (p) => (async () => { p.M.initVault({}); p.answer({ state: 'locked', startedAt: 7 }); await tick(); let ran = 0, ends = 0; p.M.unlockThen(() => { ran++; }, { ended: () => { ends++; } }); const rp = p.M.refreshVaultFacts(); p.answer({ state: 'not_set_up' }); await rp; await new Promise((r) => setTimeout(r, 5)); await tick(); return { ran, ends }; })();
  const g7 = await scene(null, resetGo);
  ok(g7.ran === 0 && g7.ends === 1, 'a plain wait (the boot offer\'s «Unlock and resume all») at a RESET: what it waited for never runs (no unlock happened), its `ended` runs once — the offer gives its door back, nothing resumed (cure 4, 主开发)', g7);
  const g7Red = await scene((s0) => s0.replace("    if (f.state === 'not_set_up') { if (ran) return; endUnrun(); if (typeof ended === 'function') setTimeout(ended, 0); return; }", "    if (f.state === 'not_set_up') { if (here) endUnrun(); else once(); return; }"), resetGo);   // stale-pins: kept — a RED control: cure 3's reset line restored on purpose
  ok(g7Red.ran === 1, 'RED control: cure 3\'s shape (a reset RUNS a plain wait) ⇒ the resumes start for an unlock that never happened', g7Red);
  const g7Red2 = await scene((s0) => s0.replace(" if (typeof ended === 'function') setTimeout(ended, 0); return; }", ' return; }'), resetGo);
  ok(g7Red2.ran === 0 && g7Red2.ends === 0, 'RED control: a reset that tells nobody ⇒ the offer\'s promise hangs and its door never comes back (the restack reader\'s nit 2)', g7Red2);
  // the dialog's submit is THIS page's road (source pin — the leg's shell stub draws no form): its unlock is counted in flight and applied as here
  const VUs = fs.readFileSync(path.join(REPO, 'src/lib/vault-unlock.js'), 'utf8');
  const submitHere = (x) => /unlockAsked\+\+;[^\n]*\n\s*let r; try \{ r = await post\('\/api\/vault\/unlock', \{ password: pw\.value \}\); \} finally \{ unlockAsked--; \}/.test(x) && /if \(r && r\.ok\) \{ pw\.value = ''; applyUnlockHere\(r\); close\(\);/.test(x) && /applyUnlockHere\(r\); close\(\); showToast\(t\('Vault unlocked'\)\); return; \}\n    if \(!unlockAsked\) ownUnlockMissed\(\);/.test(x);   // cure 3 (its own read): the failure branch ends a raced `here` wait — pinned, the legs call the exposed road
  ok(submitHere(VUs), 'the unlock dialog\'s submit counts its own unlock in flight and applies its answer as THIS page\'s');
  ok(!submitHere(VUs.replace("applyUnlockHere(r); close();", "applyVaultFacts(r); close();")), 'RED control: a submit that applies its answer plainly ⇒ the pin is red (a real unlock in the dialog would never open the ⚙ menu)');
  ok(!submitHere(VUs.replace('    if (!unlockAsked) ownUnlockMissed();', '   ')), 'RED control: a submit whose failure branch ends nothing (cure 2\'s shape) ⇒ the pin is red (a raced `here` wait would stay armed)');
  const gRed = await scene((s0) => exposeHere(s0.replace('  if (vaultLoudState({ facts }).mark) { unlockThen(open, { here: true }); return; }', '  if (vaultLoudState({ facts }).mark) { showUnlock({ then: open }); return; }')), gearScene('here'));   // stale-pins: kept — a RED control: the pre-cure ⚙ press restored on purpose
  ok(gRed.opened === 0, 'RED control: the ⚙ press on `then` alone (the release\'s shape) ⇒ the menu never opens after an unlock in its dialog', gRed);
  const gRed2 = await scene((s0) => exposeHere(s0.replace('unlockThen(open, { here: true })', 'unlockThen(open)')), gearScene('elsewhere'));   // stale-pins: kept — a RED control: cure 1's ⚙ press (any unlock) restored on purpose
  ok(gRed2.opened === 1, 'RED control: the ⚙ press waiting on ANY unlock (cure 1\'s shape) ⇒ another device\'s unlock pops the menu open here', gRed2);
  ok(uRed.atUnlock === 0, 'RED control: the close alone (the batch\'s first shape — showUnlock({ then })) ⇒ an unlock in the dialog never starts the resumes', uRed);
  delete globalThis.__vd;
}

console.log('⑫ A FOLDER THAT WAITS IS NOT GONE (B-864f) — a session folder on a mount that waits for the vault is PENDING, never «gone»');
{
  // the REAL engine (cheap KDF) + the REAL MountManager (rows whose mount points are bare folders: one whose secret is sealed
  // under the vault, one with none) + a machine's pull
  const CW = R('src/server/cwd-wait.js');
  const { MountManager } = R('src/mounts.js');
  const d = dirOf('cwdwait'), sealedAt = path.join(d, 'mnt', 'Team_drive'), openAt = path.join(d, 'mnt', 'Open_share'), pull = path.join(d, 'mnt', 'mac');
  for (const x of [sealedAt, openAt, pull]) fs.mkdirSync(x, { recursive: true });
  fs.mkdirSync(path.join(d, 'data'), { recursive: true });
  const v = mkVault(path.join(d, 'data'));
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const mounts = new MountManager({ dataDir: path.join(d, 'data'), broadcast: () => { }, getSetting: () => undefined });
  mounts._state.mounts.push(
    { id: 'm-team', name: 'Team drive', type: 's3', endpoint: 'https://s3.example.test', bucket: 'team', accessKey: 'AKEXAMPLE', secretKeyEnc: SB.encWith(crypto.randomBytes(32), 'x'), desired: 'mounted', customPath: sealedAt },
    { id: 'm-open', name: 'Open share', type: 's3', endpoint: 'https://s3.example.test', bucket: 'open', desired: 'mounted', customPath: openAt });
  let pulls = [{ id: 'p-mac', dir: 'pull', hostId: 'h-mac', mountpoint: pull, live: false }];
  const sshPull = path.join(d, 'mnt', 'buildbox'); fs.mkdirSync(sshPull, { recursive: true });
  const HOSTS = { 'h-mac': { name: 'Studio Mac', transport: 'dial' }, 'h-ssh': { name: 'Build box', transport: 'ssh' } };
  CW.register({ vault: v, mounts, getHosts: () => ({ get: (id) => HOSTS[id] || null }), getMachineMounts: () => ({ list: () => [...pulls, { id: 'p-ssh', dir: 'pull', hostId: 'h-ssh', mountpoint: sshPull, live: false }] }) });
  const at = (root, ...p) => path.join(root, ...p);
  const why = (cwd, o) => (CW.verdict(cwd, o) || { why: null }).why;
  ok(why(at(sealedAt, 'proj'), { missing: false }) === null && why(at(sealedAt, 'proj')) === 'mount_down' && why(at(d, 'elsewhere')) === null && why(sealedAt + '-other/x') === null, 'a vault NOT SET UP: an existing folder waits for nothing; a MISSING one under a recorded mount that is down is mount_down (never «gone»); no mount on the path (or a prefix only) ⇒ null');
  // the reader table (r3230): mounts.json HELD (its memory empty because unread) — a MISSING folder is mount_down by the list's words,
  // never «gone» and never made (it may sit on a mount point that is not up); an existing folder waits for nothing. RED CONTROL: the
  // held branch cut (in a copy) — the missing folder reads null, and the create's recreate road would make it under the mount point
  { const was = mounts.unreadWords; mounts.unreadWords = () => 'mounts.json in VibeSpace\'s data folder could not be read (EIO)';
    try {
      const wh = CW.verdict(at(d, 'elsewhere'));
      ok(!!wh && wh.why === 'mount_down' && wh.held === true && /cannot read its list of storage mounts/.test(wh.name) && CW.verdict(at(d, 'elsewhere'), { missing: false }) === null, 'mounts.json HELD: a missing folder is mount_down by the held list\'s words — never «gone», never recreated; an existing one waits for nothing', wh);
      // r3360: its words say the folder MAY be on a mount (never «is on … not mounted»), the create's refusal carries `held`, and the page
      // words it so (zh, ja beside)
      { const dw = CW.downWords(at(d, 'elsewhere'), wh), WC = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8'), SL = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
        const C1 = 'This conversation’s folder may be on a mount: VibeSpace cannot read its list of mounts right now — nothing was started and nothing was made there; resume it once the list reads again.';
        const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
        ok(/may be on a mount/.test(dw) && !/is on .*not mounted/.test(dw) && WC.includes('waitsFor: w.name, ...(w.held ? { held: true } : {}), message:') && SL.includes("msg.code === 'mount_down' && msg.held") && SL.includes(`t('${C1}')`) && zh.includes(`"${C1}":`) && ja.includes(`"${C1}":`), 'r3360: a held mounts list\'s missing folder is said as one that MAY be on a mount — the hub\'s words, the refusal\'s `held`, the page\'s sentence (zh, ja)', dw); }
      const { mutantCopies: MC } = await import('./mutant-copy.mjs'), CS = fs.readFileSync(path.join(REPO, 'src/server/cwd-wait.js'), 'utf8');
      const CWh = MC('vs-cwdwait-held', REPO).load('src/server/cwd-wait.js', editAnchor(CS, "  if (!d) { const held = missing ? heldListOf() : null; return held ? { why: 'mount_down', root: null, name: held, held: true } : null; }", '  if (!d) return null;', 'src/server/cwd-wait.js'), 'held-unasked');
      CWh.register({ vault: v, mounts, getHosts: () => ({ get: (id) => HOSTS[id] || null }), getMachineMounts: () => ({ list: () => [] }) });
      ok(CWh.verdict(at(d, 'elsewhere')) === null, 'RED CONTROL — the held branch cut (in a copy): the missing folder over a held mounts list reads null («gone»)');
    } finally { mounts.unreadWords = was; } }
  await v.setup(PW, {}); v.lock('door');
  const row = mounts.list().find((r) => r.id === 'm-team');
  ok(row && row.keyFile && row.keyFile.code === KF.VAULT_LOCKED, 'the REAL list row of a mount whose secret is sealed says its key waits for the vault', row && row.keyFile);
  const ws = CW.verdict(at(sealedAt, 'proj'), { missing: false });
  ok(ws && ws.why === 'vault_locked' && ws.root === sealedAt && ws.name === 'Team drive' && why(at(sealedAt, 'proj')) === 'vault_locked', 'LOCKED: a folder under a storage mount whose secret is sealed ⇒ vault_locked — the EXISTING bare mount point too (it passes test -d), its mount named', ws);
  const wp = CW.verdict(at(pull, 'src', 'app'), { missing: false });
  ok(wp && wp.why === 'vault_locked' && wp.root === pull && wp.name === 'Studio Mac', '…and under a DIAL machine\'s pulled folder that is not live (its link token is a vault entry) ⇒ vault_locked, the machine named', wp);
  ok(why(at(sshPull, 'src'), { missing: false }) === 'vault_locked' && why(at(sshPull, 'src')) === 'vault_locked', 'LOCKED, an SSH machine\'s pulled folder too: its link token is a vault entry (host-tokens host-<id>) ⇒ vault_locked — the EXISTING bare mount point included (never the shadow)');
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    globalThis.__cwHosts = HOSTS;   // read by the mutant copy at its load
    const CSRC = fs.readFileSync(path.join(REPO, 'src/server/cwd-wait.js'), 'utf8'), from = 'busy: false, failed: false, sealed: true };';
    const CWm = CSRC.split(from).length === 2 ? mutantCopies('vs-cwdwait', REPO).load('src/server/cwd-wait.js', editAnchor(editAnchor(CSRC, from, "busy: false, failed: false, sealed: !!(HOSTS[r.hostId] && HOSTS[r.hostId].transport === 'dial') };", "src/server/cwd-wait.js"), "'use strict';", "'use strict'; const HOSTS = globalThis.__cwHosts || {};", "src/server/cwd-wait.js"), 'dialonly') : null;
    let mw = null;
    if (CWm) { CWm.register({ vault: v, mounts, getHosts: () => ({ get: (id) => HOSTS[id] || null }), getMachineMounts: () => ({ list: () => [{ id: 'p-ssh', dir: 'pull', hostId: 'h-ssh', mountpoint: sshPull, live: false }] }) }); mw = (CWm.verdict(at(sshPull, 'src'), { missing: false }) || { why: null }).why; }
    delete globalThis.__cwHosts;
    ok(!!(CWm && mw === null), 'RED control: a pull sealed only on a dial machine (the cure\'s first, refuted shape) ⇒ an ssh machine\'s bare mount point while locked reads null — the agent would start in the empty folder', mw);
  }
  { const wf = mounts.waitFacts(mounts._state.mounts[0]), lr = mounts.list().find((x) => x.id === 'm-team') || {};
    ok(wf.keyCode === KF.VAULT_LOCKED && wf.keyCode === (lr.keyFile && lr.keyFile.code) && wf.connecting === !!lr.connecting && wf.starting === !!lr.starting && (wf.error || null) === (lr.error || null), 'the by-id wait facts (MountManager.waitFacts — one row, never list() every 500 ms) agree with the REAL list row', { wf, lr: { keyFile: lr.keyFile, connecting: lr.connecting, starting: lr.starting, error: lr.error } }); }
  ok(why(at(openAt, 'x'), { missing: false }) === null && why(at(openAt, 'x')) === 'mount_down', 'LOCKED, a mount that needs NO secret: it waits for nothing of the vault — an existing folder ⇒ null, a missing one ⇒ mount_down');
  mounts._state.mounts[0].desired = 'unmounted';
  ok(why(at(sealedAt, 'proj')) === null, 'a storage row the person UNMOUNTED waits for nothing (the folder\'s own verdict)');
  mounts._state.mounts[0].desired = 'mounted';
  await v.unlock(PW, {});
  const t0 = v.facts().unlockedSince;
  ok(why(at(sealedAt, 'proj'), { now: t0 + 5e3 }) === 'mount_starting' && why(at(pull, 'x'), { missing: false, now: t0 + 5e3 }) === 'mount_starting', 'UNLOCKED a moment ago ⇒ mount_starting (the unlock\'s restore brings each mount up in turn)');
  mounts._errors.set('m-team', 'the mount failed: AccessDenied');
  ok(why(at(sealedAt, 'proj'), { now: t0 + 5e3 }) === 'mount_down', 'a mount whose restore already FAILED is not «starting» inside the heal window ⇒ mount_down at once');
  mounts._errors.delete('m-team');
  ok(why(at(sealedAt, 'proj'), { now: t0 + CW.HEAL_MS + 1 }) === 'mount_down' && why(at(sealedAt, 'proj'), { missing: false, now: t0 + CW.HEAL_MS + 1 }) === null, 'the heal window over, still down ⇒ a missing folder mount_down, an existing one its own verdict');
  mounts._connecting = new Set(['m-team']);
  ok(why(at(sealedAt, 'proj'), { now: t0 + CW.HEAL_MS + 1 }) === 'mount_starting', 'its connect in flight ⇒ mount_starting whenever it is');
  mounts._connecting = new Set();
  // the bounded wait: a stand-in clock; the pull comes back live at the 3rd step ⇒ true; never back ⇒ false at the bound
  let clock = t0 + 1e3, steps = 0;
  const now = () => clock, sleep = async (ms) => { clock += ms; if (++steps === 3) pulls = [{ ...pulls[0], live: true }]; };
  ok(await CW.whenBack(at(pull, 'x'), { now, sleep }) === true && steps === 3, 'whenBack: waits while the mount comes up, true the moment it is live', { steps });
  clock = t0 + 1e3; steps = -1e9;
  ok(await CW.whenBack(at(sealedAt, 'proj'), { ms: 4e3, now, sleep }) === false && clock - (t0 + 1e3) >= 4e3 && clock - (t0 + 1e3) < 5e3, 'whenBack: never back ⇒ false at its bound (4 s here; 45 s in the product)', { waited: clock - (t0 + 1e3) });
  v.lock('door');
  clock = t0 + 1e3;
  ok(await CW.whenBack(at(sealedAt, 'proj'), { now, sleep }) === false && why(at(sealedAt, 'proj')) === 'vault_locked', 'whenBack: the vault locked again ⇒ false at once, and the verdict is vault_locked again');
  ok(/^the vault is locked — the folder X is on Team drive, which opens after the owner unlocks the vault with the second password/.test(CW.lockedWords('X', ws)) && /^the folder X is on Team drive, which is not mounted right now — nothing was started and nothing was made there/.test(CW.downWords('X', ws)), 'the refusals\' words (the hub\'s log, an older page) name the folder and its mount');
  CW.register({ vault: null, mounts: null, getHosts: null, getMachineMounts: null });
  // THE WIRING: ws-create asks for EVERY local cwd, BEFORE the recreate; after the bounded wait a mount still down is mount_down
  const wc = read('src/ws-create.js');
  const asksFirst = (src) => {
    const probe = src.indexOf('missing = await dirMissing();'), ask = src.indexOf('let w = CW.verdict(cwd, { missing });'), rec = src.indexOf('if (missing && data.recreateCwd === true) {');
    const blk = src.slice(ask, rec);
    return probe > 0 && ask > probe && rec > ask && /\n            if \(!data\.hostId\) \{\n              const CW = /.test(src.slice(probe, ask + 40))
      && /if \(await CW\.whenBack\(cwd\)\) missing = await dirMissing\(\);\n\s*ws\.send\(JSON\.stringify\(\{ type: 'create-waiting', reqId: data\.reqId, cwd, waitsFor: w\.name, done: true \}\)\);[^\n]*\n\s*w = CW\.verdict\(cwd, \{ missing \}\);\n\s*if \(w && w\.why === 'mount_starting'\) w = \{ \.\.\.w, why: 'mount_down' \};/.test(blk)
      && /code: w\.why, cwd, waitsFor: w\.name/.test(blk) && /break;/.test(blk);
  };
  ok(asksFirst(wc), 'ws-create: EVERY local cwd is asked (a bare mount point passes test -d), BEFORE the recreate; after the bounded wait (and its done frame, B-ce65) a mount still down is refused mount_down; the refusal names the folder and its mount');
  const blk = wc.slice(wc.indexOf('            // A FOLDER THAT WAITS IS NOT GONE'), wc.indexOf('            // Recreate-empty-and-resume (B-7812'));
  const moved = wc.replace(blk, '').replace("            if (missing) {\n              global.__vsEvent?.('spawn-cwd-missing'", blk + "            if (missing) {\n              global.__vsEvent?.('spawn-cwd-missing'");
  ok(blk.length > 200 && moved !== wc && !asksFirst(moved), 'RED control: the ask moved AFTER the recreate (the recreate could make the folder under the waiting mount) ⇒ red');
  const onlyMissing = wc.replace('            if (!data.hostId) {\n              const CW = ', '            if (missing && !data.hostId) {\n              const CW = ');
  ok(onlyMissing !== wc && !asksFirst(onlyMissing), 'RED control: asked only for a MISSING cwd (a bare mount point resumes in an empty folder) ⇒ red');
  const noDowngrade = wc.replace("                if (w && w.why === 'mount_starting') w = { ...w, why: 'mount_down' };   // it waited its bound: still not up\n", '');
  ok(noDowngrade !== wc && !asksFirst(noDowngrade), 'RED control: the bound passed with the mount still starting falls through to «Working directory is gone» and its recreate ⇒ red');
  ok(/require\('\.\/cwd-wait\.js'\)\.register\(\{ vault, mounts \}\)/.test(read('src/server/mounts-plugins-wiring.js')) && /require\('\.\/cwd-wait\.js'\)\.register\(\{ getHosts, getMachineMounts \}\)/.test(read('src/server/dial-pairing.js')), 'the vault + storage mounts register in mounts-plugins-wiring, the hosts + machine mounts in dial-pairing');
}

for (const e of engines) { try { e.close(); } catch { } }
process.env.HOME = HOME0;
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
