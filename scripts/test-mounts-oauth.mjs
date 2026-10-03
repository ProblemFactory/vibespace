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
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
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
const S_A = '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AAAAA', S_B = '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BBBBB', S_U = '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UUUUU', S_E = 'GOCSPX-mounts-env-EEEEEEEEEEEEEEEEEEEEEE';

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
  ok(MountManager._driveClient({ clientPreset: 'org1' }) === null && MountManager.drivePresets().map((c) => c.key).join() === 'channels', 'a withdrawn client is gone for every mount that named it (null — never another preset), the override removed too');
  let threw = null; try { mm.gmail._client({ clientPreset: 'org1' }); } catch (e) { threw = e.message; }
  ok(threw && /needs an OAuth client/.test(threw), 'a Gmail mount whose preset was withdrawn is refused by name (never a silent swap)');
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
  ok(out.length === 0 && out2.length === 0 && errs.length === 2 && !errs.join().includes(S_E.slice(-6)) && /not an array/.test(errs[1]), 'an unparseable / non-array env is logged (no secret bytes) and answers [] — never a throw');
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
  ok(src.includes(anchor), 'the control\'s anchor exists in mounts.js');
  const old = M.load('src/mounts.js', src.replace(anchor, '    const fromFile = null;'), 'envonly');
  ok(old.MountManager.drivePresets().map((c) => c.key).join() === 'envonly' && MountManager.drivePresets().map((c) => c.key).join() === 'org1', 'CONTROL: the env-only reader serves the env\'s boot-time list while the directory offers org1 — the §1/§2 asserts are red on it');
  delete process.env.VIBESPACE_GDRIVE_CLIENTS;
}

for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(row.pass, row.name, row.detail);
CP.setSharedPresets(null);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
