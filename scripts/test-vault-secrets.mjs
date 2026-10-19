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
const T0 = Date.now();
let seq = 0;
const dirOf = (tag) => { const d = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };
const engines = [];
const mkVault = (dataDir, o = {}) => { const e = VE.create({ dataDir, kdf: CHEAP, log: quiet, idleTimer: false, ...o }); engines.push(e); return e; };
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
  const VAULT_EN = 'The vault is locked — unlock it first';
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(zh.includes(`  "${VAULT_EN}": "保险库已锁定——先解锁"`) && ja.includes(`  "${VAULT_EN}":`) && zh.includes('  "vault locked": "保险库已锁定"'), 'the sentence is 「保险库已锁定——先解锁」 in zh (and has ja); the short word 「保险库已锁定」');
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
    const s = fs.readFileSync(f, 'utf8');
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
  const acct = client.account();
  let be = null; try { await client.me(); } catch (e) { be = e; }
  ok(acct.state === 'vault-locked' && client.locked() && !client.connected() && be && be.code === 'vault-locked' && be.status === 423, 'LOCKED: the voice card reads `vault-locked` (the connect row draws the door), a call answers 423 vault-locked — never "connect your Dropline"', { acct, be: be && be.code });
  const VR = R('src/routes/voice.js');
  ok(typeof VR.create === 'function' && /vaultLocked: !!\(client\.locked && client\.locked\(\)\)/.test(fs.readFileSync(path.join(REPO, 'src/routes/voice.js'), 'utf8')) && /status\(423\)\.json\(\{ error: 'vault-locked' \}\)/.test(fs.readFileSync(path.join(REPO, 'src/routes/voice.js'), 'utf8')), 'GET /api/voice/status carries `vaultLocked`; a dictation while locked answers 423 vault-locked (the mic says the vault)');
  // a plaintext file written by an older build is sealed at its first unlocked read
  await v.unlock(PW, {});
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
  // the boundary, stated by the census: what stays a file (TLS key, vendor CLI files, …) is the exception list — none of it is planted here
  const VAULT_SRC = fs.readFileSync(path.join(REPO, 'src/vault.js'), 'utf8');
  ok(/SECRETS_AT_REST/.test(VAULT_SRC) && R('src/vault.js').SECRETS_AT_REST.filter((r) => r.exception).map((r) => r.what).join(' · ').length > 0, 'the exceptions are a NAMED list (src/vault.js SECRETS_AT_REST): ' + R('src/vault.js').SECRETS_AT_REST.filter((r) => r.exception).map((r) => r.what).join(' · '));
  for (const [what, , , good] of TABLE) void what, void good;
}

for (const e of engines) { try { e.close(); } catch { } }
process.env.HOME = HOME0;
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
