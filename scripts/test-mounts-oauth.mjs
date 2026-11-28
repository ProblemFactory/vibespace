#!/usr/bin/env node
// THE GOOGLE OAUTH CLIENT PRESETS FROM THE PRESETS DIRECTORY (lane
// cluster-presets, B-53fe). Fast tier, in-process, no server.
//
// MountManager.drivePresets() — the ONE reader every Google consumer asks
// (Drive mounts' _driveClient, gmail-sync's _client, the storage dialog's
// drive-defaults, the Gmail channel row through the integration store) —
// answers FIRST from the presets directory's gdrive-clients.json (the cluster
// Secret + the release override, per key) and falls back to the env
// (VIBESPACE_GDRIVE_CLIENTS, then the legacy single pair) only for an
// instance whose directory says nothing about Google clients. A rotation in
// the directory reaches every consumer with no restart. CONTROL: the pre-lane
// reader (env only) never sees the directory.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return Date.now() - t0; await sleep(15); } return -1; };

for (const k of ['VIBESPACE_GDRIVE_CLIENTS', 'VIBESPACE_GDRIVE_CLIENT_ID', 'VIBESPACE_GDRIVE_CLIENT_SECRET', 'VIBESPACE_PRESETS_DIR']) delete process.env[k];
const CP = require(path.join(REPO, 'src/server/cluster-presets.js'));
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const ROOT = scratch('cpr');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });
const M = mutantCopies('cpr-mounts', REPO);
const quiet = { log() {}, error() {}, warn() {} };
const g = (key, secret, label) => ({ key, label: label || key, clientId: `${key}.apps.googleusercontent.com`, clientSecret: secret });
const S_A = 'GOC' + 'SPX-mounts-cluster-AAAAAAAAAAAAAAAAAA', S_B = 'GOC' + 'SPX-mounts-rotated-BBBBBBBBBBBBBBBBBB', S_U = 'GOC' + 'SPX-mounts-release-UUUUUUUUUUUUUUUUUU', S_E = 'GOC' + 'SPX-mounts-env-EEEEEEEEEEEEEEEEEEEEEE';

let seq = 0;
function project(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  const ts = `..2026_10_02_00_${String(++seq).padStart(2, '0')}_00.${process.pid}${seq}`;
  fs.mkdirSync(path.join(dir, ts, 'override'), { recursive: true });
  for (const [rel, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, ts, rel), typeof body === 'string' ? body : JSON.stringify(body));
  let old = null; try { old = fs.readlinkSync(path.join(dir, '..data')); } catch {}
  try { fs.unlinkSync(path.join(dir, '..data_tmp')); } catch {}
  fs.symlinkSync(ts, path.join(dir, '..data_tmp'));
  fs.renameSync(path.join(dir, '..data_tmp'), path.join(dir, '..data'));
  for (const top of ['integrations.json', 'gdrive-clients.json', 'override']) { try { fs.lstatSync(path.join(dir, top)); } catch { fs.symlinkSync(`..data/${top}`, path.join(dir, top)); } }
  if (old) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
}

console.log('§1 the file rung');
const DIR = path.join(ROOT, 'presets');
project(DIR, { 'gdrive-clients.json': [g('org1', S_A, 'Org (internal)'), g('channels', S_A)], 'override/gdrive-clients.json': [g('mine', S_U)] });
const reader = CP.create({ dir: DIR, log: quiet, debounceMs: 30, pollMs: 300 });
CP.setSharedPresets(reader);
process.env.VIBESPACE_GDRIVE_CLIENTS = JSON.stringify([g('envonly', S_E)]);
process.env.VIBESPACE_GDRIVE_CLIENT_ID = 'legacy.apps.googleusercontent.com'; process.env.VIBESPACE_GDRIVE_CLIENT_SECRET = S_E;
ok(MountManager.drivePresets().map((c) => c.key).join() === 'org1,channels,mine', 'drivePresets() = the directory\'s cluster clients + the release\'s own (per key) — the env list and the legacy pair are NOT mixed in');
ok(MountManager._driveClient({ clientPreset: 'org1' }).clientSecret === S_A && MountManager._driveClient({ clientPreset: 'mine' }).clientSecret === S_U, '_driveClient (Drive mounts) resolves a preset key from the directory');
ok(MountManager._driveClient({ clientPreset: 'envonly' }) === null, 'a key only the env offers is not served while the directory speaks for Google clients (one rung, never a mix)');
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
process.env.VIBESPACE_MOUNT_BASE = path.join(ROOT, 'mounts');
const mm = new MountManager({ dataDir: path.join(ROOT, 'data') });
ok(mm.gmail._client({ clientPreset: 'channels' }).clientSecret === S_A, 'gmail-sync\'s _client (the Gmail mount) asks the same reader');
ok(JSON.stringify(MountManager.drivePresets().map((c) => ({ key: c.key, label: c.label }))) === JSON.stringify([{ key: 'org1', label: 'Org (internal)' }, { key: 'channels', label: 'channels' }, { key: 'mine', label: 'mine' }]), 'the storage dialog\'s drive-defaults shape (key + label) from the directory');

console.log('§2 live');
{
  await reader.start();
  project(DIR, { 'gdrive-clients.json': [g('org1', S_B, 'Org (internal)'), g('channels', S_A)], 'override/gdrive-clients.json': [g('mine', S_U)] });
  const ms = await until(() => MountManager._driveClient({ clientPreset: 'org1' }).clientSecret === S_B);
  ok(ms >= 0, `a rotated client reaches _driveClient ${ms} ms after the ..data swap — no restart (a live rclone mount takes it at its next (re)mount)`);
  ok(mm.gmail._client({ clientPreset: 'org1' }).clientSecret === S_B, '…and gmail-sync\'s _client in the same instant');
  project(DIR, { 'gdrive-clients.json': [g('channels', S_A)] });
  await until(() => !MountManager.drivePresets().some((c) => c.key === 'org1'));
  ok(MountManager._driveClient({ clientPreset: 'org1' }) === null && MountManager.drivePresets().map((c) => c.key).join() === 'channels', 'a withdrawn client is gone for every mount that named it (null — never another preset), the override removed too (§4: a mount keeps the client its token was minted under)');
  let threw = null; try { mm.gmail._client({ clientPreset: 'org1' }); } catch (e) { threw = e.message; }
  ok(gateOf(threw) && verdictOf(/needs an OAuth client/.test(threw)), 'a Gmail mount whose preset was withdrawn, and which names no minted client, is refused by name (never a silent swap — §4: one that names its minted client keeps it)');
  project(DIR, { 'integrations.json': '[]' });
  await until(() => MountManager.drivePresets().some((c) => c.key === 'envonly'));
  ok(MountManager.drivePresets().map((c) => c.key).join() === 'envonly,default', 'the Secret lost its gdriveClients key ⇒ the env rung answers again (the list, then the legacy pair as `default`)');
  reader.stop();
}

console.log('§3 the env fallback, unchanged');
{
  CP.setSharedPresets(CP.create({ dir: null, log: quiet }));
  ok(MountManager.drivePresets().map((c) => c.key).join() === 'envonly,default', 'no directory: VIBESPACE_GDRIVE_CLIENTS then the legacy single pair, exactly as before');
  delete process.env.VIBESPACE_GDRIVE_CLIENT_ID; delete process.env.VIBESPACE_GDRIVE_CLIENT_SECRET;
  const errs = []; const prevErr = console.error; console.error = (...a) => errs.push(a.join(' '));
  process.env.VIBESPACE_GDRIVE_CLIENTS = `[{"key":"x","clientId":"c","clientSecret":"${S_E}"},]`;
  const out = MountManager.drivePresets();
  process.env.VIBESPACE_GDRIVE_CLIENTS = '{"key":"x"}';
  const out2 = MountManager.drivePresets();
  console.error = prevErr;
  ok(out.length === 0 && out2.length === 0 && errs.length === 2 && !errs.join().includes(S_E.slice(-6)) && verdictOf(/not an array/.test(errs[1])), 'an unparseable / non-array env is logged (no secret bytes) and answers [] — never a throw');
  delete process.env.VIBESPACE_GDRIVE_CLIENTS;
  ok(MountManager.drivePresets().length === 0, 'nothing anywhere ⇒ [] (the dialogs then say "ask your admin")');
}

// CONTROL: the pre-lane reader (env only) never sees the directory
{
  const dir2 = path.join(ROOT, 'presets-ctl');
  project(dir2, { 'gdrive-clients.json': [g('org1', S_A)] });
  CP.setSharedPresets(CP.create({ dir: dir2, log: quiet }));
  process.env.VIBESPACE_GDRIVE_CLIENTS = JSON.stringify([g('envonly', S_E)]);
  const src = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf-8');
  const anchor = "    const fromFile = clusterPresets.sharedPresets().entries('gdrive');";
  ok(verdictOf(src.includes(anchor)), 'the control\'s anchor exists in mounts.js');
  const old = M.load('src/mounts.js', editAnchor(src, anchor, '    const fromFile = null;', "src/mounts.js"), 'envonly');
  ok(old.MountManager.drivePresets().map((c) => c.key).join() === 'envonly' && MountManager.drivePresets().map((c) => c.key).join() === 'org1', 'CONTROL: the env-only reader serves the env\'s boot-time list while the directory offers org1 — the §1/§2 asserts are red on it');
  delete process.env.VIBESPACE_GDRIVE_CLIENTS;
}

console.log('§4 THE MINTED CLIENT (B-e40d): a preset swapped under the same key never kills a mount');
{
  // B-166e's rule for the storage mounts: a Google refresh token answers only to the client it was minted under, and a preset-backed
  // record stores the KEY — the 2026-10-23 outage replaced the presets under the same keys and every refresh was refused
  const D4 = path.join(ROOT, 'presets-mint');
  const use = (list) => { project(D4, { 'gdrive-clients.json': list }); CP.setSharedPresets(CP.create({ dir: D4, log: quiet })); };
  const S_M = 'GOC' + 'SPX-mounts-minted-MMMMMMMMMMMMMMMMMMMM', S_N = 'GOC' + 'SPX-mounts-swapped-NNNNNNNNNNNNNNNNNNN', S_R = 'GOC' + 'SPX-mounts-rotsame-RRRRRRRRRRRRRRRRRRR', S_Z = 'GOC' + 'SPX-mounts-fallbk-ZZZZZZZZZZZZZZZZZZZZ';
  const ORG1 = 'org1.apps.googleusercontent.com', swapped = { key: 'org1', label: 'org1', clientId: 'replaced.apps.googleusercontent.com', clientSecret: S_N };
  const DRIVE = require(path.join(REPO, 'src/mount-providers/drive.js')), GMAIL = require(path.join(REPO, 'src/mount-providers/gmail.js'));
  const SPENT = new Date(Date.now() - 2 * 3600e3).toISOString();   // two hours ago, whatever the run's date: a probe that answers had to refresh
  const tok = (rt) => JSON.stringify({ access_token: 'a', refresh_token: rt, expiry: SPENT });
  const RCLONE = require(path.join(REPO, 'src/mount-providers/rclone.js')), GS = require(path.join(REPO, 'src/gmail-sync.js'));
  const rcl = (m, P = DRIVE) => { const e = {}; P.rclone(m, e, (k) => 'VS_' + k, (x) => x, mm); return `${e.VS_CLIENT_ID}|${e.VS_CLIENT_SECRET}`; };
  const sealed = (m) => (m.mintedClient ? `${m.mintedClient.id}|${mm._dec(m.mintedClient.sealed)}` : 'none');
  const quietLog = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
  const quietA = async (fn) => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };
  const msrc4 = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8');
  use([g('org1', S_M)]);
  // a token saved from THIS hub's sign-in names the client that sign-in used (startDriveAuth keeps it), never a guess at Save
  mm._driveAuth = { token: tok('rt-d'), client: { clientId: ORG1, clientSecret: S_M } };
  const d = { type: 'drive' }; DRIVE.create(d, { token: tok('rt-d'), clientPreset: 'org1' }, mm);
  ok(sealed(d) === `${ORG1}|${S_M}` && d.mintedClient.key === 'org1' && !JSON.stringify(d).includes(S_M), 'a Drive record saved from this hub\'s sign-in names the client that sign-in minted its token under — the secret SEALED with .mounts-key (never plain in the record)');
  const pasted = {}; DRIVE.create(pasted, { token: tok('rt-elsewhere'), clientPreset: 'org1' }, mm);
  ok(!('mintedClient' in pasted), 'a token no sign-in of this hub minted (pasted, imported) names NONE — no key on the record (its shape unchanged) — never a guess from the key');
  ok(rcl(d) === `${ORG1}|${S_M}`, 'its mount: the preset\'s client while it names the minted one');
  use([g('org1', S_R)]);   // the SAME client, its secret rotated
  ok(rcl(d) === `${ORG1}|${S_R}`, 'a ROTATED secret under the same client reaches the mount (the preset\'s values while they name the minted client)');
  ok(mm._adoptClient(d, MountManager.refreshClient(d, mm)) === true && sealed(d) === `${ORG1}|${S_R}`, '…and a proven-good refresh with it moves the SEALED copy to the rotated secret (never a stale one)');
  use([swapped]);   // THE OUTAGE: another client under the SAME key
  ok(quietLog(() => rcl(d)) === `${ORG1}|${S_R}`, 'THE OUTAGE: another client swapped in under the SAME key — the mount keeps refreshing with the client its token was minted under (its rotated secret)');
  ok(mm._adoptClient(d, { clientId: swapped.clientId, clientSecret: S_N }) === false && sealed(d) === `${ORG1}|${S_R}`, 'the minted client is the truth: a refresh under ANOTHER id never re-names it');
  const said = []; const l0 = console.log; console.log = (...x) => said.push(x.join(' ')); MountManager._mintedSaid = null;
  try { rcl({ ...d, id: 'd-said', name: 'Drive said' }); rcl({ ...d, id: 'd-said', name: 'Drive said' }); } finally { console.log = l0; }
  ok(said.length === 1 && gateOf(/preset «org1» now names another OAuth client — this mount keeps the client its token was minted under/.test(said[0])) && !said[0].includes(S_R), 'the hub\'s log says it ONCE per mount and pair (no secret bytes) — the admin re-authorizes before deleting the old client', said);
  use([g('channels', S_A)]);   // the key withdrawn
  ok(quietLog(() => rcl(d)) === `${ORG1}|${S_R}`, 'the key withdrawn: the mount keeps its minted client (never a silent fall to another preset)');
  // a re-authorize while org1 is withdrawn: the sign-in fell to another preset (Z) — the record names THAT client
  use([g('default', S_Z)]);
  mm._driveAuth = { token: tok('rt-d2'), client: { clientId: 'default.apps.googleusercontent.com', clientSecret: S_Z } };
  DRIVE.writeToken(d, tok('rt-d2'), mm);   // applyDriveToken's road
  ok(sealed(d) === `default.apps.googleusercontent.com|${S_Z}` && quietLog(() => rcl(d)) === `default.apps.googleusercontent.com|${S_Z}`, 'a re-authorize names the client its sign-in actually used — a withdrawn key\'s sign-in that fell to another preset keeps THAT one (never erased, never guessed)');
  mm._driveAuth = null;
  DRIVE.update(d, { token: tok('rt-d2') }, () => {}, mm);   // the SAME token pasted again — no sign-in names it
  ok(sealed(d) === `default.apps.googleusercontent.com|${S_Z}`, 'the SAME refresh token saved again (a re-paste) keeps the client it names — only another token clears it');
  // a NEW token no sign-in names CLEARS the old minted client on both Drive roads (update and writeToken name it BEFORE the token is written)
  { use([g('org1', S_M)]); mm._driveAuth = { token: tok('rt-z1'), client: { clientId: ORG1, clientSecret: S_M } };
    const z = { type: 'drive' }; DRIVE.create(z, { token: tok('rt-z1'), clientPreset: 'org1' }, mm); mm._driveAuth = null;
    const had = sealed(z); DRIVE.update(z, { token: tok('rt-z2') }, () => {}, mm); const afterUpdate = 'mintedClient' in z;
    mm._driveAuth = { token: tok('rt-z3'), client: { clientId: ORG1, clientSecret: S_M } }; DRIVE.update(z, { token: tok('rt-z3') }, () => {}, mm); mm._driveAuth = null;
    const had3 = sealed(z); DRIVE.writeToken(z, tok('rt-z4'), mm);
    ok(had === `${ORG1}|${S_M}` && !afterUpdate && had3 === `${ORG1}|${S_M}` && !('mintedClient' in z), 'a NEW token no sign-in names clears the old minted client — on Drive\'s update and on its re-authorize road (writeToken) alike', { had, afterUpdate, had3 }); }
  // a LOCKED vault (the key sealed by the second password) is no unreadable copy: nothing is said; the WORKER's reader keeps the
  // copy it opened (as the worker keeps its token) and the manager keeps none — the lock reaches every other reader
  { const lk = { ...d, id: 'drv-lock', name: 'locked one' }; mm._state.mounts.push(lk);
    const read = MountManager.mintedReader(mm, 'drv-lock'), first = read();
    const saidL = []; const l2 = console.log; console.log = (...x) => saidL.push(x.join(' '));
    const dec0 = mm._dec;
    mm._dec = (blob) => { if (blob === lk.mintedClient.sealed) throw Object.assign(new Error('the vault is locked'), { reason: 'key-unreadable:vault_locked' }); return dec0.call(mm, blob); };
    const why = {}; let held, bare, other;
    try { held = read(); bare = MountManager.mintedOf(lk, mm, why); other = MountManager.mintedReader(mm, 'drv-lock')(); }
    finally { delete mm._dec; console.log = l2; mm._state.mounts = mm._state.mounts.filter((x) => x.id !== 'drv-lock'); }
    ok(!!first && !!held && held.clientId === first.clientId && held.clientSecret === first.clientSecret && bare === null && why.locked === true && other === null && saidL.length === 0,
      'a LOCKED vault: the running worker\'s reader keeps the copy it opened (as it keeps its token) and nothing is said; the manager keeps NONE — mintedOf and a reader that never opened it answer null', { saidL, bare, other }); }
  // SEALED FIRST: with the vault locked, a token pasted on any road is refused BEFORE the record's minted client changes
  { const zl = { type: 'drive', clientPreset: 'org1', tokenEnc: mm._enc(tok('rt-zl')), mintedClient: { id: ORG1, key: 'org1', sealed: mm._enc(S_M) } };
    const gl = { type: 'gmail', clientPreset: 'org1', tokenEnc: mm._enc(tok('rt-gl')), mintedClient: { id: ORG1, key: 'org1', sealed: mm._enc(S_M) } };
    const enc0 = mm._enc; const refused = [];
    mm._enc = () => { throw Object.assign(new Error('the vault is locked'), { reason: 'key-unreadable:vault_locked' }); };
    try {
      for (const [n, f] of [['drive update', () => DRIVE.update(zl, { token: tok('rt-zl2') }, () => {}, mm)], ['drive writeToken', () => DRIVE.writeToken(zl, tok('rt-zl3'), mm)], ['gmail PATCH', () => GMAIL.update(gl, { token: tok('rt-gl2') }, () => {}, mm)]]) {
        try { f(); refused.push(n + ': not refused'); } catch { refused.push(n); }
      }
    } finally { delete mm._enc; }
    ok(refused.join() === 'drive update,drive writeToken,gmail PATCH' && sealed(zl) === `${ORG1}|${S_M}` && sealed(gl) === `${ORG1}|${S_M}`, 'SEALED FIRST: with the vault locked a pasted token is refused on Drive\'s update, its re-authorize road and Gmail\'s PATCH — BEFORE the record\'s minted client changes (it still names it)', refused); }
  // an rclone-type Drive record (rcloneType drive, its token in its params) is under the same rule
  { use([g('org1', S_M)]); mm._driveAuth = { token: tok('rt-rc'), client: { clientId: ORG1, clientSecret: S_M } };
    const rc = { id: 'rc-drive', type: 'rclone', rcloneType: 'drive', name: 'rclone drive', clientPreset: 'org1', paramsEnc: {} };
    RCLONE.writeToken(rc, tok('rt-rc'), mm); mm._driveAuth = null;
    const rce = () => { const e = {}; RCLONE.rclone(rc, e, (k) => 'VS_' + k, 'VS', mm); return `${e.VS_CLIENT_ID}|${e.VS_CLIENT_SECRET}`; };
    use([swapped]);
    const out = quietLog(rce);
    delete rc.mintedClient; mm._state.mounts.push(rc);
    let adopted = false; try { adopted = mm._adoptClient(rc, { clientId: ORG1, clientSecret: S_M }); } finally { mm._state.mounts = mm._state.mounts.filter((x) => x.id !== 'rc-drive'); }
    const own = { type: 'rclone', rcloneType: 'drive', paramsEnc: {} }; mm._driveAuth = { token: tok('rt-rc2'), client: { clientId: ORG1, clientSecret: S_M } }; RCLONE.writeToken(own, tok('rt-rc2'), mm); mm._driveAuth = null;
    ok(out === `${ORG1}|${S_M}` && adopted === true && sealed(rc) === `${ORG1}|${S_M}` && !('mintedClient' in own), 'an rclone-type Drive record: its re-authorize names the sign-in\'s client, its rclone env keeps it after the swap, a proven refresh adopts it; one with no preset (its own params client) names none', { out, adopted, own: 'mintedClient' in own }); }
  // the sign-in memory's bounds: sixteen at most (the oldest leaves), a day each — gone at a read past it and at the 60 s sweep
  { const mem = new Map();
    for (let i = 0; i < 17; i++) GS.keepSignIn(mem, { token: tok(`rt-mem-${i}`), client: { clientId: ORG1, clientSecret: S_M } });
    const evicted = GS.signInClient(mem, 'rt-mem-0'), newest = GS.signInClient(mem, 'rt-mem-16'), size16 = mem.size;
    const ents = [...mem.values()]; ents[0].at = Date.now() - 24 * 3600e3 - 1000; ents[1].at = Date.now() - 24 * 3600e3 - 1000;   // rt-mem-1 and rt-mem-2: a day and a second old
    const atRead = GS.signInClient(mem, 'rt-mem-1'), afterRead = mem.size, pruned = GS.pruneSignIns(mem);
    ok(evicted === null && !!newest && size16 === 16 && atRead === null && afterRead === 15 && pruned === 1 && mem.size === 14 && ![...mem.keys()].some((k) => k.includes('rt-mem')),
      'the sign-in memory keeps at most SIXTEEN (the oldest leaves) for a DAY each: an entry past its day is gone at a read and at a prune; keyed by a hash, never the token', { size16, afterRead, pruned, size: mem.size });
    const drv = (mm._driveSignIns ||= new Map()), gml = mm.gmail._signIns, age = (mp) => { const k = [...mp.keys()].pop(); mp.get(k).at = Date.now() - 24 * 3600e3 - 1000; return k; };   // the entry just kept: a day and a second old
    GS.keepSignIn(drv, { token: tok('rt-old-d'), client: { clientId: ORG1, clientSecret: S_M } }); const kd = age(drv);
    GS.keepSignIn(gml, { token: tok('rt-new-g'), client: { clientId: ORG1, clientSecret: S_M } }); const kn = [...gml.keys()].pop();   // kept FIRST: a later keep prunes the aged one itself
    GS.keepSignIn(gml, { token: tok('rt-old-g'), client: { clientId: ORG1, clientSecret: S_M } }); const kg = age(gml);
    const keepM = mm._state.mounts; mm._state.mounts = [];
    try { await mm._healthSweep(); } finally { mm._state.mounts = keepM; }
    ok(!drv.has(kd) && !gml.has(kg) && gateOf(gml.has(kn)) && kn !== kg, 'the hub\'s 60 s mount sweep drops a sign-in\'s client at its day\'s end — the Drive and the Gmail memory alike (no new timer); a fresh one stays'); }
  // a Gmail sign-in takes only the request's client fields: a `minted` in its body never picks the client
  { use([g('org1', S_M)]);
    await mm.gmail.startAuth({ clientPreset: 'org1', minted: { clientId: 'body.apps.googleusercontent.com', clientSecret: 'body-secret' } });
    const used = mm.gmail._auth && mm.gmail._auth.client; mm.gmail.cancelAuth();
    ok(!!used && used.clientId === ORG1 && used.clientSecret === S_M, 'a Gmail sign-in takes only the request\'s client fields — a `minted` in its body never picks the client', used); }
  // the Connect dialog's pickers BEFORE Save (a transient token) after a swap between the sign-in and Save: its sign-in's client
  { use([g('org1', S_M)]); mm._driveAuth = { token: tok('rt-pk'), client: { clientId: ORG1, clientSecret: S_M } }; use([swapped]);
    const pk = MountManager.pickerClient(mm, tok('rt-pk'), 'org1'), pn = MountManager.pickerClient(mm, tok('rt-other'), 'org1');
    const keepLL = mm.gmail.listLabels; mm.gmail.listLabels = async (cfg) => cfg; let lcfg = null;
    try { mm.gmail._auth = { token: tok('rt-pk'), client: { clientId: ORG1, clientSecret: S_M } }; lcfg = await mm.listGmailLabels({ token: tok('rt-pk'), clientPreset: 'org1' }); }
    finally { mm.gmail.listLabels = keepLL; mm.gmail._auth = null; mm._driveAuth = null; }
    ok(!!pk && pk.clientId === ORG1 && !!pn && pn.clientId === swapped.clientId && !!lcfg && !!lcfg.minted && lcfg.minted.clientId === ORG1, 'the Connect dialog\'s pickers before Save (the shared drives, the labels) use the client the sign-in minted the token under after a swap between the sign-in and Save; a token no sign-in names, the preset\'s', { pk, pn, lm: lcfg && lcfg.minted }); }
  // a SLOW Save: the sign-in's flow ended first (its 10-minute timer, another sign-in, a Cancel — all cancelDriveAuth / cancelAuth)
  use([g('org1', S_M)]);
  mm._driveAuth = { token: tok('rt-slow'), client: { clientId: ORG1, clientSecret: S_M }, child: { kill() {} }, timer: null };
  mm.cancelDriveAuth();
  const slow = { type: 'drive' }; DRIVE.create(slow, { token: tok('rt-slow'), clientPreset: 'org1' }, mm);
  ok(mm._driveAuth === null && sealed(slow) === `${ORG1}|${S_M}`, 'a Drive Save AFTER its sign-in\'s flow ended (cancelDriveAuth — the 10-minute timer\'s road) still names the client that sign-in minted under');
  mm.gmail._auth = { token: tok('rt-slowg'), client: { clientId: ORG1, clientSecret: S_M }, server: null, timer: null };
  mm.gmail.cancelAuth();
  const slowG = {}; GMAIL.create(slowG, { token: tok('rt-slowg'), clientPreset: 'org1' }, mm);
  ok(mm.gmail._auth === null && sealed(slowG) === `${ORG1}|${S_M}` && ![...mm.gmail._signIns.keys()].some((k) => k.includes('rt-slowg')), 'a Gmail Save after its flow ended names it too — kept by a HASH of the refresh token (never the token)');
  // a sealed copy that cannot be opened is never silent
  { use([swapped]); const bad = { id: 'drv-bad', name: 'bad seal', type: 'drive', clientPreset: 'org1', tokenEnc: mm._enc(tok('rt-bad')), mintedClient: { id: ORG1, key: 'org1', sealed: 'not-a-sealed-value' } };
    const saidB = []; const l1 = console.log; console.log = (...x) => saidB.push(x.join(' ')); MountManager._mintedSaid = null;
    let rb; try { rb = rcl(bad); rcl(bad); } finally { console.log = l1; }
    ok(rb === `${swapped.clientId}|${S_N}` && saidB.length === 1 && verdictOf(/bad seal: the sealed copy of the client its token was minted under .* cannot be opened — it refreshes with the preset «org1»; re-authorize it/.test(saidB[0])), 'a sealed copy that cannot be opened is NEVER silent: the hub\'s log says it once (the mount refreshes with the preset — re-authorize it)', saidB); }
  // a record saved before the rule (or from a pasted token): its first ANSWERED backend probe adopts the client ITS env carried —
  // driven through the real _accessErrorFor → _probeBackendAccess (only the rclone run stands in: it answers «listed»)
  use([g('org1', S_M)]);
  const before = { id: 'drv-before', type: 'drive', name: 'before', tokenEnc: mm._enc(tok('rt-b')), clientPreset: 'org1', desired: 'mounted' };
  mm._state.mounts.push(before);
  const ran = []; let during = null;
  mm._rcloneProbeRun = async (args, env) => { ran.push(`${env.RCLONE_CONFIG_VS_CLIENT_ID}|${env.RCLONE_CONFIG_VS_CLIENT_SECRET}`); if (during) during(); return { started: true, code: 0, stdout: '', stderr: '' }; };
  mm._probeBackendRead = async () => 'ok';
  const probe = async (m) => { mm._oauthProbeAt = new Map(); return quietA(() => mm._accessErrorFor(m, '/mp', 'ok')); };
  try {
    const had0 = 'mintedClient' in before;
    await probe(before);
    ok(!had0 && ran[0] === `${ORG1}|${S_M}` && sealed(before) === `${ORG1}|${S_M}`, 'a record from before the rule names none; its first ANSWERED backend probe (the real _accessErrorFor → _probeBackendAccess; its token spent, so rclone refreshed) ADOPTS the client the probe\'s env carried', ran);
    use([swapped]);
    ok(quietLog(() => rcl(before)) === `${ORG1}|${S_M}`, '…and the outage after it no longer kills the mount');
    // a preset swapped WHILE the probe runs: the client the run carried is adopted — never one worked out after it
    delete before.mintedClient; use([g('org1', S_M)]); ran.length = 0; during = () => use([swapped]);
    await probe(before);
    during = null;
    ok(ran[0] === `${ORG1}|${S_M}` && sealed(before) === `${ORG1}|${S_M}`, 'a preset swapped DURING the probe: the record adopts the client the run carried (never the swapped one worked out after it)', sealed(before));
    const anchorP = '      return this._adoptClient(holder, { clientId: env.RCLONE_CONFIG_VS_CLIENT_ID, clientSecret: env.RCLONE_CONFIG_VS_CLIENT_SECRET });';
    ok(verdictOf(msrc4.includes(anchorP)), 'RED control, its plant first: _adoptProbed adopts the client the probe\'s env carried');
    const MP = M.load('src/mounts.js', anchored(msrc4, anchorP, '      return this._adoptClient(holder, MountManager.refreshClient(holder, this));', 'adopt-after-run'), 'adopt-after-run');
    delete before.mintedClient; use([g('org1', S_M)]);
    const envP = mm._rcloneFor(before).env; use([swapped]);
    quietLog(() => MP.MountManager.prototype._adoptProbed.call(mm, before, envP));
    ok(sealed(before) === `${swapped.clientId}|${S_N}`, 'RED control: adopting the client worked out AFTER the run records the SWAPPED one — the mount would then die when the old client is put back', sealed(before));
    delete before.mintedClient; mm._adoptProbed(before, envP);
    ok(sealed(before) === `${ORG1}|${S_M}`, '…the product, from the same env: the client the run carried');
    // a FRESH token (rclone refreshed nothing) proves no client; a probe that never ran rclone proves none
    const fresh = { id: 'drv-fresh', type: 'drive', name: 'fresh', tokenEnc: mm._enc(JSON.stringify({ access_token: 'a', refresh_token: 'rt-f', expiry: new Date(Date.now() + 3600e3).toISOString() })), clientPreset: 'org1' };
    mm._state.mounts.push(fresh); use([g('org1', S_M)]);
    const ranBefore = ran.length;
    await probe(fresh);
    ok(ran.length === ranBefore + 1 && !fresh.mintedClient, 'a probe that really RAN (its rclone answered «listed») on a FRESH token (rclone refreshed nothing) adopts nothing', ran.length - ranBefore);
    mm._rcloneFor = () => { throw new Error('unreadable extra params'); };
    try { fresh.tokenEnc = mm._enc(tok('rt-f')); await probe(fresh); } finally { delete mm._rcloneFor; }
    ok(!fresh.mintedClient, 'a probe that never ran rclone (its env could not be built: «ok» with no proof) adopts nothing');
    // a SUBMOUNT's probe (the sweep probes the mounted children, never their credential): the PARENT record adopts — never the
    // merged copy _rcloneFor builds
    const par = { id: 'drv-par', type: 'drive', name: 'par', kind: 'credential', tokenEnc: mm._enc(tok('rt-par')), clientPreset: 'org1' };
    const kid = { id: 'drv-kid', type: 'drive', name: 'kid', parentId: 'drv-par', driveFolder: 'Photos', desired: 'mounted' };
    mm._state.mounts.push(par, kid); use([g('org1', S_M)]);
    await probe(kid);
    ok(sealed(par) === `${ORG1}|${S_M}` && !('mintedClient' in kid), 'a SUBMOUNT\'s answered probe (the sweep probes the children, never their credential) adopts onto its PARENT — the record that holds the token', { par: sealed(par), kid: 'mintedClient' in kid });
    use([swapped]);
    ok(quietLog(() => rcl(mm._connOf(kid))) === `${ORG1}|${S_M}`, '…and after the swap the submount refreshes with its parent\'s minted client');
    // the record's token REPLACED while the probe ran (a re-authorize): the run's client is never adopted onto the new token
    const re = { id: 'drv-re', type: 'drive', name: 're', tokenEnc: mm._enc(tok('rt-re1')), clientPreset: 'org1' };
    mm._state.mounts.push(re); use([g('org1', S_M)]);
    during = () => { re.tokenEnc = mm._enc(tok('rt-re2')); };
    await probe(re); during = null;
    ok(!re.mintedClient, 'a token REPLACED while the probe ran (a re-authorize): the run\'s client is never adopted onto the new token');
  } finally { delete mm._rcloneProbeRun; delete mm._probeBackendRead; during = null; mm._state.mounts = mm._state.mounts.filter((x) => !['drv-before', 'drv-fresh', 'drv-par', 'drv-kid', 'drv-re'].includes(x.id)); }
  // the minted secret is SERVER-ONLY: never in what a route answers (config — the Edit dialog's data — or the list)
  { const wr = { ...d, id: 'drv-wo', type: 'drive', name: 'wo' }; mm._state.mounts.push(wr);
    try { const out = JSON.stringify([mm.config('drv-wo'), mm.list().find((x) => x.id === 'drv-wo')]); ok(!out.includes(S_Z) && !out.includes('mintedClient') && !out.includes(wr.mintedClient.sealed), 'the minted client never leaves the server: absent from config() (the Edit dialog) and the list'); }
    finally { mm._state.mounts = mm._state.mounts.filter((x) => x.id !== 'drv-wo'); } }
  // the owner's export carries the minted client like the record's other secrets; an import seals it again (a restore keeps it)
  { use([g('org1', S_M)]);
    const ex = { id: 'drv-ex', type: 'drive', name: 'exported drive', tokenEnc: mm._enc(tok('rt-ex')), clientPreset: 'org1', mintedClient: { id: ORG1, key: 'org1', sealed: mm._enc(S_M) } };
    const keepS = mm._state.mounts; mm._state.mounts = [ex];
    let row = null; try { row = mm.exportBundle().mounts.find((x) => x.name === 'exported drive'); } finally { mm._state.mounts = keepS; }
    ok(!!row && !!row.mintedClient && row.mintedClient.id === ORG1 && row.mintedClient.secret === S_M && row.mintedClient.key === 'org1', 'the owner\'s export carries the minted client (plaintext like the record\'s token and own secret — the bundle is sealed under the export passphrase)', row && row.mintedClient);
    mm.importBundle({ mounts: [row] });
    const back = mm._state.mounts.find((x) => x.name === 'exported drive');
    try { ok(!!back && sealed(back) === `${ORG1}|${S_M}` && back.mintedClient.sealed !== ex.mintedClient.sealed, 'an import seals it again under this instance\'s key — a restored mount keeps the client its token was minted under', back && sealed(back)); }
    finally { mm._state.mounts = mm._state.mounts.filter((x) => x.name !== 'exported drive'); } }
  const own = {}; DRIVE.create(own, { token: tok('rt-own'), clientId: 'own.apps.googleusercontent.com', clientSecret: 'own-secret' }, mm);
  ok(!('mintedClient' in own) && rcl(own) === 'own.apps.googleusercontent.com|own-secret' && mm._adoptClient({ ...own, type: 'drive' }, { clientId: 'x', clientSecret: 'y' }) === false, 'a record with its OWN client names no minted client and adopts none — its own wins, as before');
  // RED control (a patched COPY of the product, its plant first): rclone's env from the preset alone — the base's road
  const dsrc = fs.readFileSync(path.join(REPO, 'src/mount-providers/drive.js'), 'utf8'), danchor = 'const pc = x.constructor.refreshClient(m, x);';
  ok(verdictOf(dsrc.includes(danchor)), 'RED control, its plant first: drive.js asks refreshClient for rclone\'s client');
  const DRIVE0 = M.load('src/mount-providers/drive.js', anchored(dsrc, danchor, 'const pc = x.constructor._driveClient(m);', 'drive-preset-only'), 'drive-preset-only');
  use([swapped]);
  ok(rcl(before, DRIVE0) === `${swapped.clientId}|${S_N}`, 'RED control: rclone\'s env from the preset alone sends the SWAPPED client after the swap — the 2026-10-23 outage');
  // Gmail: the record names it from gmail-sync's own sign-in; gmail-sync resolves the preset each refresh and keeps the minted client only after a swap
  use([g('org1', S_M)]);
  mm.gmail._auth = { token: tok('rt-g'), client: { clientId: ORG1, clientSecret: S_M } };
  const gm = {}; GMAIL.create(gm, { token: tok('rt-g'), clientPreset: 'org1' }, mm);
  const mintedG = MountManager.mintedOf(gm, mm);
  ok(!!mintedG && mintedG.clientId === ORG1 && mintedG.clientSecret === S_M && mm.gmail._client({ clientPreset: 'org1', minted: mintedG }).clientSecret === S_M, 'a Gmail record saved from gmail-sync\'s sign-in names its minted client; gmail-sync uses the preset while it names that client');
  use([g('org1', S_R)]);
  ok(mm.gmail._client({ clientPreset: 'org1', minted: mintedG }).clientSecret === S_R, '…a rotated secret under the same client reaches gmail-sync at once');
  use([swapped]);
  const gc = quietLog(() => mm.gmail._client({ id: 'g1', clientPreset: 'org1', minted: mintedG }));
  ok(gc.clientId === ORG1 && gc.clientSecret === S_M, 'THE OUTAGE for Gmail: another client under the same key — gmail-sync refreshes with the minted one');
  const gsrc = fs.readFileSync(path.join(REPO, 'src/gmail-sync.js'), 'utf8'), ganchor = '    if (minted && minted.clientId && minted.clientSecret && (!pick || String(pick.clientId) !== String(minted.clientId))) {';
  ok(verdictOf(gsrc.includes(ganchor)), 'RED control, its plant first: gmail-sync\'s _client holds the minted branch');
  const G0 = M.load('src/gmail-sync.js', anchored(gsrc, ganchor, '    if (false) {', 'gmail-preset-only'), 'gmail-preset-only');
  ok(new G0.GmailSync({ presets: () => MountManager.drivePresets() })._client({ clientPreset: 'org1', minted: mintedG }).clientId === swapped.clientId, 'RED control: gmail-sync without it refreshes with the SWAPPED client (the base\'s road)');
  // the wiring: the sync worker and the labels picker are handed the RECORD's minted client; a refresh that worked adopts / follows
  const rec = { ...gm, id: 'g-mint', name: 'mail-mint', type: 'gmail', mode: 'ro' };
  mm._state.mounts.push(rec);
  const keep = { start: mm.gmail.start, listLabels: mm.gmail.listLabels, status: mm.gmail.status };
  let started = null;
  mm.gmail.start = (cfg) => { started = cfg; }; mm.gmail.listLabels = async (cfg) => cfg; mm.gmail.status = () => null;
  try {
    mm._mountGmail('g-mint');
    const lc = await mm.listGmailLabels({ id: 'g-mint' });
    const sm = started && typeof started.minted === 'function' ? started.minted() : null;
    ok(!!sm && sm.clientId === ORG1 && sm.clientSecret === S_M && started.name === 'mail-mint' && !!lc.minted && lc.minted.clientId === ORG1 && lc.id === 'g-mint', 'the Gmail sync worker is handed a READER of the record\'s minted client and its labels picker the client itself (src/mounts.js _mountGmail / listGmailLabels)');
    delete rec.mintedClient;
    mm.gmail._onClientProven('g-mint', { clientId: ORG1, clientSecret: S_R }, 'rt-g');
    ok(sealed(rec) === `${ORG1}|${S_R}`, 'a Gmail refresh that worked (gmail-sync onClientProven) ADOPTS its client on a record that names none');
  } finally { Object.assign(mm.gmail, keep); mm._state.mounts = mm._state.mounts.filter((x) => x.id !== 'g-mint'); }
  // THE RUNNING WORKER: a Gmail mount mounted BEFORE its client is known (every mount at the deploy) — its refresh that worked
  // adopts the client, and after a swap the SAME worker refreshes with it (the record read at each refresh, never a copy taken at
  // start). The real _mountGmail → gmail-sync start → _accessToken → onClientProven; only the token endpoint stands in.
  { const recW = { id: 'g-work', name: 'mail-work', type: 'gmail', mode: 'ro', tokenEnc: mm._enc(tok('rt-w')), clientPreset: 'org1' };
    mm._state.mounts.push(recW); use([g('org1', S_M)]);
    const fetch0 = globalThis.fetch, sent = [];
    mm.gmail._loop = async () => {};
    globalThis.fetch = async (url, o) => { const b = new URLSearchParams(String((o && o.body) || '')); sent.push(b.get('client_id')); const good = b.get('client_id') === ORG1; return { ok: good, status: good ? 200 : 400, json: async () => (good ? { access_token: 'at', expires_in: 3600 } : { error: 'invalid_grant' }) }; };
    const refresh = async (w) => { w.tok.expiry = 0; try { await quietA(() => mm.gmail._accessToken(w)); return null; } catch (e) { return e.message; } };
    try {
      mm._mountGmail('g-work');
      let w = mm.gmail._workers.get('g-work');
      const e1 = await refresh(w);
      ok(!e1 && sent[0] === ORG1 && sealed(recW) === `${ORG1}|${S_M}`, 'a running Gmail worker\'s refresh that worked ADOPTS its client (the real gmail-sync _accessToken → onClientProven)', `${sent} ${e1 || ''}`);
      use([swapped]);
      const e2 = await refresh(w);
      ok(!e2 && sent[1] === ORG1, 'THE RUNNING WORKER after the swap refreshes with the adopted client — the same worker, no restart', `${sent} ${e2 || ''}`);
      delete recW.mintedClient; use([g('org1', S_M)]); w.stopped = true;
      await refresh(w);
      ok(!recW.mintedClient, 'a STOPPED worker\'s refresh adopts nothing (a re-authorize stopped it — its token may no longer be the record\'s)');
      mm.gmail._onClientProven('g-work', { clientId: ORG1, clientSecret: S_M }, 'rt-other');
      ok(!recW.mintedClient, 'a refresh of a token the record no longer holds adopts nothing');
      // RED control (a patched copy of mounts.js, its plant first): the worker handed a COPY of the minted client at start
      const anchorW = '      name: MountManager.lentName(m) || id, minted: MountManager.mintedReader(this, id),';
      ok(verdictOf(msrc4.includes(anchorW)), 'RED control, its plant first: _mountGmail hands the worker a reader of the record');
      const MW = M.load('src/mounts.js', anchored(msrc4, anchorW, '      name: MountManager.lentName(m) || id, minted: MountManager.mintedOf(m, this),', 'worker-copy'), 'worker-copy');
      mm.gmail.stop('g-work'); sent.length = 0;
      MW.MountManager.prototype._mountGmail.call(mm, 'g-work');
      w = mm.gmail._workers.get('g-work');
      await refresh(w); use([swapped]); await refresh(w);
      ok(sealed(recW) === `${ORG1}|${S_M}` && sent[0] === ORG1 && sent[1] === swapped.clientId, 'RED control: a worker that keeps the copy it was handed at start adopts, then refreshes with the SWAPPED client after the swap — the outage, for every Gmail mount mounted at the deploy', sent);
    } finally { mm.gmail.stop('g-work'); delete mm.gmail._loop; globalThis.fetch = fetch0; mm._state.mounts = mm._state.mounts.filter((x) => x.id !== 'g-work'); } }
  // THE LABELS READ (the picker over a saved record): its refresh that worked adopts the client too — the real listGmailLabels →
  // gmail-sync listLabels → _accessToken; only the token endpoint and the labels answer stand in
  { const recL = { id: 'g-lab', name: 'mail-labels', type: 'gmail', mode: 'ro', tokenEnc: mm._enc(tok('rt-lab')), clientPreset: 'org1' };
    mm._state.mounts.push(recL); use([g('org1', S_M)]);
    const fetch0 = globalThis.fetch, asked = [];
    globalThis.fetch = async (url, o) => { asked.push(String(url).includes('oauth2') ? 'token' : 'labels'); return { ok: true, status: 200, json: async () => (String(url).includes('oauth2') ? { access_token: 'at', expires_in: 3600 } : { labels: [{ id: 'INBOX', name: 'INBOX', type: 'system' }] }) }; };
    let labels = null; try { labels = await mm.listGmailLabels({ id: 'g-lab' }); } finally { globalThis.fetch = fetch0; mm._state.mounts = mm._state.mounts.filter((x) => x.id !== 'g-lab'); }
    ok(asked.join() === 'token,labels' && gateOf(Array.isArray(labels)) && labels.length === 1 && sealed(recL) === `${ORG1}|${S_M}`, 'a LABELS read over a saved record whose refresh worked adopts its client (listGmailLabels hands gmail-sync the record\'s id)', { asked, n: labels && labels.length }); }
  mm.gmail._auth = { token: tok('rt-g2'), client: { clientId: swapped.clientId, clientSecret: S_N } };
  GMAIL.update(gm, { token: tok('rt-g2') }, () => {}, mm);
  ok(gm.mintedClient.id === swapped.clientId, 'a Gmail re-authorize (its PATCH with a token) names the client its sign-in used');
  GMAIL.update(gm, { token: tok('rt-g3') }, () => {}, mm);
  ok(!('mintedClient' in gm), 'a PATCH with a token no sign-in of this hub minted names none (the old minted client never outlives its token)');
  // §5 THE CLIENT-SWAP NOTICE (B-e40d's remainder — B-166e part 2's shape for the storage mounts, its rule shared:
  // src/client-swap-step.js): ONE For-you item per preset key naming the mounts still on a replaced client, its door the first's
  // Re-authorize; it follows who is left and resolves itself. The real MountManager facts → the real mount-for-you producer → a
  // real For-you store (a scratch dir); only the presets stand in.
  console.log('§5 THE CLIENT-SWAP NOTICE (B-e40d): a replaced preset client is said in For you, with its door');
  {
    const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
    const MP = require(path.join(REPO, 'src/server/mount-for-you.js')), FA = require(path.join(REPO, 'src/foryou-actions.js'));
    const store = (tag) => { const d = path.join(ROOT, 'todos-' + tag); fs.mkdirSync(d, { recursive: true }); return new UserTodoManager({ dataDir: d, onChange: () => {}, expirySweepMs: 0 }); };
    const rec = (id, name, mintedId, extra = {}) => ({ id, name, type: 'drive', clientPreset: 'org1', tokenEnc: mm._enc(tok('rt-' + id)), ...(mintedId ? { mintedClient: { id: mintedId, key: 'org1', sealed: mm._enc(S_M) } } : {}), ...extra });
    const keepS = mm._state.mounts, keepSw = mm._state.clientSwaps, keepOn = mm.onClientSwaps;
    // the sequence: A, B, D on the old client (C names none, Own has its own) → the swap → A re-authorized → B (the door) removed
    const run = async (P, u) => {
      const fy = P.create({ getUserTodos: () => u, mountCount: () => mm._state.mounts.length, onReopen: () => { mm.clientSwapCheck().catch(() => { }); } });   // as the wiring hands it
      const open = () => u.forSession([P.ITEM_KEY]).filter((i) => i.status === 'open' && i.i18n && i.i18n.text && i.i18n.text.key === P.SWAP);
      const at = {};
      mm.onClientSwaps = (gs, memos) => fy.clientSwaps(gs, memos);
      mm._state.clientSwaps = {};
      mm._state.mounts = [rec('sw-a', 'Alpha', ORG1), rec('sw-b', 'Beta', ORG1), rec('sw-c', 'Gamma', null), rec('sw-d', 'Delta', ORG1), rec('sw-own', 'Own', ORG1, { clientId: 'own.apps.googleusercontent.com', clientSecretEnc: mm._enc('own-secret') })];
      use([g('org1', S_M)]); await mm.clientSwapCheck(); at.before = open().map((i) => i.id);
      use([swapped]); await mm.clientSwapCheck(); at.swap = open().map((i) => ({ id: i.id, n: i.i18n.text.params.n, text: i.text, detail: i.detail, action: i.action, door: FA.doorOf(i) }));
      try { require('../src/store-writer.js').storeWriter().flushSync([mm._file]); } catch { }   // B-574d (r4796): mounts.json is the store writer's — the swap check's save (no person pressed it) lands before the file is read
      at.memo = JSON.parse(fs.readFileSync(mm._file, 'utf8')).clientSwaps;
      { // a RESTART: a NEW MountManager over the same data dir (its own _load of mounts.json) and a NEW producer over the same For-you
        // store — the boot's check says nothing new
        const mm2 = new MountManager({ dataDir: mm.dataDir }), fy2 = P.create({ getUserTodos: () => u, mountCount: () => mm2._state.mounts.length });
        mm2.onClientSwaps = (gs, memos) => fy2.clientSwaps(gs, memos);
        at.loaded = mm2._state.clientSwaps && mm2._state.clientSwaps.org1 ? mm2._state.clientSwaps.org1.itemId : null;
        await mm2.clientSwapCheck(); at.restart = open().map((i) => i.id);
      }
      mm._driveAuth = { token: tok('rt-sw-a2'), client: { clientId: swapped.clientId, clientSecret: S_N } };
      DRIVE.writeToken(mm._state.mounts[0], tok('rt-sw-a2'), mm); mm._driveAuth = null;
      await mm.clientSwapCheck(); at.reauth = open().map((i) => ({ id: i.id, n: i.i18n.text.params.n, detail: i.detail, door: i.action.mountId }));
      fy.removed(mm._state.mounts.find((x) => x.id === 'sw-b')); at.afterRemovedHook = open().length;
      mm._state.mounts = mm._state.mounts.filter((x) => x.id !== 'sw-b');
      await mm.clientSwapCheck(); at.removed = open().map((i) => ({ id: i.id, n: i.i18n.text.params.n, detail: i.detail, door: i.action.mountId }));
      return { at, open, u };
    };
    try {
      const { at, open, u } = await quietA(() => run(MP, store('swap')));
      const s0 = at.swap[0] || {};
      ok(at.before.length === 0, 'the preset names the client the mounts were minted under: nothing is said');
      ok(at.swap.length === 1 && s0.n === 3 && gateOf(/the preset «org1» signs in with another OAuth client now — 3 mount\(s\) still on the old one/.test(s0.text)) && gateOf(/: Alpha, Beta, Delta\./.test(s0.detail)) && !/Gamma|Own/.test(s0.detail) && s0.action.type === 'mount-reauth' && s0.action.mountId === 'sw-a',
        'ANOTHER client under the key: ONE For-you item names the mounts still on the old client (Alpha, Beta, Delta — never one that names no client, never one with its own), its door the first by name', at.swap);
      ok(!!s0.door && s0.door.opens === 'storage' && verdictOf(/Re-authorize/.test(s0.door.verb)), 'its door is the registry row\'s (opens the storage Re-authorize — src/lib/user-todos-actions.js ROW_DOORS `storage`)', s0.door);
      ok(!!at.memo && !!at.memo.org1 && at.memo.org1.to === swapped.clientId && at.memo.org1.itemId === s0.id && at.memo.org1.named.join() === 'sw-a,sw-b,sw-d' && at.loaded === s0.id && JSON.stringify(at.restart) === JSON.stringify([s0.id]), 'what was said is kept on disk (the memo: the client in force, the mounts named, the item) — after a RESTART (a new manager\'s own load, a new producer, the boot\'s check) the same ONE item, never a second', { memo: at.memo, loaded: at.loaded, restart: at.restart });
      const r1 = at.reauth[0] || {};
      ok(at.reauth.length === 1 && r1.id === s0.id && r1.n === 2 && gateOf(/: Beta, Delta\./.test(r1.detail)) && r1.door === 'sw-b', 'one re-authorized under the new client: the SAME item names who is left (Beta, Delta), its door moves to the next', at.reauth);
      const m1 = at.removed[0] || {};
      ok(at.afterRemovedHook === 1 && at.removed.length === 1 && m1.id === s0.id && m1.n === 1 && gateOf(/: Delta\./.test(m1.detail)) && m1.door === 'sw-d', 'the mount its door named REMOVED: the item is not closed by the removal — the next check names who is left (Delta), its door moves', at.removed);
      mm._driveAuth = { token: tok('rt-sw-d2'), client: { clientId: swapped.clientId, clientSecret: S_N } };
      DRIVE.writeToken(mm._state.mounts.find((x) => x.id === 'sw-d'), tok('rt-sw-d2'), mm); mm._driveAuth = null;
      await quietA(() => mm.clientSwapCheck());
      ok(open().length === 0 && u.get(s0.id).status !== 'open', 'the last one re-authorized: the item resolves itself');
      mm._state.clientSwaps = {};
      u.setStatus(s0.id, 'open', 'user');   // the person's ↺ — NO check is asked here: the store's reopen asks it (onReopen)
      await new Promise((r) => setImmediate(r));
      ok(u.get(s0.id).status !== 'open', 'a swap item RE-OPENED is judged at once (the store says the reopen, the check runs by itself): with no memo holding it, it closes again (known by its words\' key)');
      // THE KEY WITHDRAWN while its item is open: no client to re-authorize under — the item closes, its memo goes
      mm._state.mounts = [rec('sw-w', 'Withdrawn', ORG1)]; mm._state.clientSwaps = {};
      use([swapped]); await quietA(() => mm.clientSwapCheck());
      const wOpen = open().length;
      use([g('channels', S_A)]); await quietA(() => mm.clientSwapCheck());
      ok(wOpen === 1 && open().length === 0 && !('org1' in (mm._state.clientSwaps || {})), 'the key WITHDRAWN while its item is open: the item closes (its door could not do what it says) and its memo goes — the mounts keep their minted client, the hub\'s log names them', { wOpen, memos: mm._state.clientSwaps });
      // NO KEY and the explicit key of the SAME preset are ONE group (the single / default preset): one item names both
      use([g('default', S_M)]); mm._state.clientSwaps = {};
      const DEF = 'default.apps.googleusercontent.com';
      mm._state.mounts = [rec('sw-p', 'Plain', DEF, { clientPreset: null }), rec('sw-q', 'Keyed', DEF, { clientPreset: 'default' })];
      use([{ key: 'default', label: 'Default', clientId: 'replaced-default.apps.googleusercontent.com', clientSecret: S_N }]); await quietA(() => mm.clientSwapCheck());
      const one = open();
      ok(one.length === 1 && one[0].i18n.text.params.n === 2 && verdictOf(/: Keyed, Plain\./.test(one[0].detail)), 'a mount with NO key and one keyed to the same (default) preset are ONE group: one item names both', one.map((i) => [i.text, i.detail]));
      // RED control (a patched COPY of the producer, its plant first): the removal closes the swap item like the mount's own items
      const fsrc = fs.readFileSync(path.join(REPO, 'src/server/mount-for-you.js'), 'utf8'), fanchor = "filter((x) => x && !isSwap(x) && ((x.facts && x.facts.mountId === m.id)";
      ok(verdictOf(fsrc.includes(fanchor)), 'RED control, its plant first: the removal of a mount leaves a client-swap item to the check');
      const MP0 = M.load('src/server/mount-for-you.js', anchored(fsrc, fanchor, "filter((x) => x && ((x.facts && x.facts.mountId === m.id)", 'removal-closes-swap'), 'removal-closes-swap');   // stale-pins: kept — the RED control's plant is the base's road on purpose
      const red = await quietA(() => run(MP0, store('swap-red')));
      ok(red.at.afterRemovedHook === 0 && red.at.removed.length === 0, 'RED control: a removal that closes the swap item leaves Delta, still on the old client, told by NOTHING (the item closed, the memo named it already)', red.at.removed);
      // MANY MOUNTS on the old client: whole names only, then the count of the rest — never a list cut mid-name (the store keeps a
      // param's first 600 characters); every fact the leg judges is printed
      { const ub = store('swap-many'), fb = MP.create({ getUserTodos: () => ub, mountCount: () => 40 });
        const need = Array.from({ length: 30 }, (_, k) => ({ id: `mb-${String(k).padStart(2, '0')}`, name: `Shared drive of the team number ${String(k).padStart(2, '0')} (long)` }));
        fb.clientSwaps([{ key: 'big', preset: 'Big', to: 'new.apps.googleusercontent.com', need }], {});
        const it = ub.forSession([MP.ITEM_KEY]).find((i) => i.status === 'open');
        const l1 = it && it.i18n && it.i18n.detail && it.i18n.detail[0];
        const shown = l1 && l1.params && typeof l1.params.names === 'string' ? l1.params.names.split(', ') : [];
        const whole = shown.every((n) => need.some((r) => r.name === n)), more = l1 && l1.params ? l1.params.more : null;
        ok(!!it && gateOf(/\{names\} and \{more\} more\.$/.test(l1.key)) && shown.length > 1 && gateOf(whole) && shown.length + more === need.length && l1.params.names.length <= 600 && verdictOf(it.detail.includes(`and ${more} more.`)),
          'MANY mounts on the old client: the item names WHOLE names only (never cut mid-name inside the store\'s 600 characters), then the count of the rest — in one sentence of its own', { shown: shown.length, more, len: l1 && l1.params && l1.params.names.length, key: l1 && l1.key, lastShown: shown.slice(-1)[0] }); }
      // A FULL TRAY: the item waits, said ONCE an episode (the log), the episode ends when it is filed or nothing is owed
      { const uf = store('swap-full'), said = [], ff = MP.create({ getUserTodos: () => uf, mountCount: () => 1, log: (l) => said.push(l) });
        const add0 = uf.add.bind(uf); let full = true;
        uf.add = (...a) => { if (full) throw Object.assign(new Error('the tray is full'), { code: 'full' }); return add0(...a); };
        const g1 = [{ key: 'tray', preset: 'Tray', to: 'new.apps.googleusercontent.com', need: [{ id: 'mf-1', name: 'Full one' }] }];
        let memos = ff.clientSwaps(g1, {}); memos = ff.clientSwaps(g1, memos);
        const fullSaid = said.filter((l) => /tray is full/.test(l)).length;
        full = false; memos = ff.clientSwaps(g1, memos);
        const filed = uf.forSession([MP.ITEM_KEY]).filter((i) => i.status === 'open').length;
        full = true; memos = ff.clientSwaps([{ ...g1[0], to: 'newer.apps.googleusercontent.com' }], memos);
        const again = said.filter((l) => /tray is full/.test(l)).length;
        ok(fullSaid === 1 && filed === 1 && again === 2, 'a FULL tray: the swap item waits and the log says it ONCE (two checks, one line); once filed the episode ends — the next full tray is said again', { fullSaid, filed, again, said }); }
      // THE DOORS THAT ASK THE CHECK: a client adopted, an import (counted by a spy on the real methods); a removal and an edit
      // (their real lines — both move folders and children, so they are read, not driven here)
      { const keepC = mm.clientSwapCheck; let asked = 0; mm.clientSwapCheck = () => { asked++; return Promise.resolve(); };
        const ra = rec('sw-ad', 'Adopting', null); mm._state.mounts = [ra];
        try { mm._adoptClient(ra, { clientId: ORG1, clientSecret: S_M }); const afterAdopt = asked; MountManager._mintedImport({ id: 'sw-im', type: 'drive', clientPreset: 'org1' }, { id: ORG1, secret: S_M }, mm); at.doors = { afterAdopt, afterImport: asked }; }
        finally { mm.clientSwapCheck = keepC; }
        const msrc5 = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8');
        const rmBody = msrc5.slice(msrc5.indexOf('  async remove(id) {'), msrc5.indexOf('\n  }\n', msrc5.indexOf('  async remove(id) {')));
        const upBody = msrc5.slice(msrc5.indexOf('  async update(id, patch = {}) {'), msrc5.indexOf('\n  }\n', msrc5.indexOf('  async update(id, patch = {}) {')));
        ok(at.doors.afterAdopt === 1 && at.doors.afterImport === 2 && gateOf(rmBody.includes('this.clientSwapCheck().catch(')) && verdictOf(upBody.includes('this.clientSwapCheck().catch(')),
          'the doors that change who is counted ask the check: a client adopted and an import (driven), a removal and an edit (their own lines)', { doors: at.doors, remove: rmBody.includes('this.clientSwapCheck().catch('), update: upBody.includes('this.clientSwapCheck().catch(') }); }
      // THE WIRING (the hub's real lines): the producer handed over, the store's reopen, the presets reload and the boot's check;
      // the door's client chain: ROW_DOORS `storage` → app.openMountReauth → the sidebar's openMountReauth (the shared client-switch
      // Re-authorize under the preset's NOW client — Drive and Gmail alike)
      const wire = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8'), acts = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-actions.js'), 'utf8');
      const appSrc = fs.readFileSync(path.join(REPO, 'src/lib/app.js'), 'utf8'), side = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
      ok(gateOf(wire.includes('onClientSwaps: (g, memos) => fy.clientSwaps(g, memos)')) && gateOf(wire.includes('onReopen: () => { mounts.clientSwapCheck().catch(() => { }); }')) && gateOf(wire.includes('sharedPresets().onChange(() => { mounts.clientSwapCheck().catch(() => { }); })')) && verdictOf(/\} mounts\.clientSwapCheck\(\)\.catch\(\(\) => \{ \}\); \} \/\/ B-e40d/.test(wire)),
        'the hub wires it: the producer, the store\'s reopen, the presets reload and the boot\'s check (src/server/mounts-plugins-wiring.js)');
      ok(gateOf(/const ROW_DOORS = \{[^\n]*\bstorage: \(item\) => app\.openMountReauth\?\.\(/.test(acts)) && gateOf(appSrc.includes('openMountReauth(id) { return this.sidebar?.openMountReauth?.(id); }')) && gateOf(side.includes('async openMountReauth(id) {'))
        && gateOf(side.includes('this._showClientSwitchReauthDialog(m, m, { type: m.type, start: { clientPreset: m.clientPreset || undefined }, client: { clientPreset: m.clientPreset || \'\' } }, presets);')) && verdictOf(side.includes('this._providersSeen = d.providers')),
        'the door\'s client chain: ROW_DOORS storage → app.openMountReauth → the sidebar\'s openMountReauth — the client-switch Re-authorize under the preset\'s NOW client (its rows read though the Storage tab never drew)');
    } finally { mm._state.mounts = keepS; mm._state.clientSwaps = keepSw; mm.onClientSwaps = keepOn; if (keepOn === undefined) delete mm.onClientSwaps; mm._driveAuth = null; }
  }
  mm._driveAuth = null; mm.gmail._auth = null; MountManager._mintedSaid = null;
  CP.setSharedPresets(null);
}

for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(verdictOf(row.pass), row.name, row.detail);
CP.setSharedPresets(null);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
