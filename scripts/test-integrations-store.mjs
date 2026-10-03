#!/usr/bin/env node
// THE INTEGRATION STORE ON THE PRESETS DIRECTORY (lane cluster-presets,
// B-53fe). Fast tier: the REAL store + the REAL wiring + the REAL routes on a
// loopback port, over a scratch presets directory the test writes in the
// kubelet's AtomicWriter shape (a timestamped dir, an atomic `..data` rename).
//
// §1 the file rung: a card row's cluster default and an account-bound row's
//    presets come from the directory; the release override wins per key; a
//    kind the directory says nothing about falls back to the env handle; the
//    file wins over the env when both speak.
// §2 LIVE: one `..data` swap ⇒ every card row's recomputed view broadcast
//    (`integrations-updated`, why 'presets', masked — the new key's last 4,
//    never a plaintext), the listeners run ONCE (the channels engine's hook),
//    every client gets `cluster-presets-updated` with the recomputed summary,
//    GET /api/integrations carries the same summary; a preset the cluster
//    withdrew answers `preset-gone` BY NAME on the account rung (never another
//    preset); a Google client rotated in the directory reaches the gmail row
//    through the injected drivePresets with no restart.
// §3 a MALFORMED file: the previous presets stay in effect, ONE journal line,
//    no throw, the summary says it; fixed ⇒ it serves again.
// CONTROL: a store copy without the file rung (env only — today's boot-time
// reader) never sees the swap.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return Date.now() - t0; await sleep(15); } return -1; };

const express = require(path.join(REPO, 'node_modules/express'));
const CP = require(path.join(REPO, 'src/server/cluster-presets.js'));
const R = require(path.join(REPO, 'src/integration-registry.js'));
const wiring = require(path.join(REPO, 'src/server/integrations-wiring.js'));
const STORE_PATH = path.join(REPO, 'src/server/integration-store.js');
const ROOT = scratch('cpr');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });
const M = mutantCopies('cpr-store', REPO);

const CLOAK_A = 'cb_cluster_license_AAAAAAAAAAAAAAAA1111';
const CLOAK_B = 'cb_rotated_license_BBBBBBBBBBBBBBBB2222';
const LARK_A = 'lark-secret-cluster-AAAAAAAAAAAAAAAAAAAA';
const LARK_U = 'lark-secret-release-UUUUUUUUUUUUUUUUUUUU';
const G_A = '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AAAAA';
const G_B = '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BBBBB';
const SECRETS = [CLOAK_A, CLOAK_B, LARK_A, LARK_U, G_A, G_B];
const g = (key, secret, label) => ({ key, label: label || key, clientId: `${key}.apps.googleusercontent.com`, clientSecret: secret });

let seq = 0;
function project(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  const ts = `..2026_10_01_23_${String(++seq).padStart(2, '0')}_00.${process.pid}${seq}`;
  fs.mkdirSync(path.join(dir, ts, 'override'), { recursive: true });
  for (const [rel, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, ts, rel), typeof body === 'string' ? body : JSON.stringify(body));
  let old = null; try { old = fs.readlinkSync(path.join(dir, '..data')); } catch {}
  try { fs.unlinkSync(path.join(dir, '..data_tmp')); } catch {}
  fs.symlinkSync(ts, path.join(dir, '..data_tmp'));
  fs.renameSync(path.join(dir, '..data_tmp'), path.join(dir, '..data'));
  for (const top of ['integrations.json', 'gdrive-clients.json', 'override']) { try { fs.lstatSync(path.join(dir, top)); } catch { fs.symlinkSync(`..data/${top}`, path.join(dir, top)); } }
  if (old) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
}
const lines = [];
const log = { log: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push('E ' + a.join(' ')), warn: (...a) => lines.push('W ' + a.join(' ')) };

const DIR = path.join(ROOT, 'presets');
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
project(DIR, {
  'integrations.json': [{ id: 'cloak', values: { licenseKey: CLOAK_A } }, { id: 'lark', key: 'jarvis', label: 'Jarvis', values: { appId: 'cli_cluster', appSecret: LARK_A } }, { id: 'lark', key: 'other', label: 'Other', values: { appId: 'cli_other', appSecret: LARK_A } }],
  'gdrive-clients.json': [g('org1', G_A, 'Org'), g('channels', G_A, 'Channels')],
  'override/integrations.json': [{ id: 'lark', key: 'jarvis', label: 'Jarvis (mine)', values: { appId: 'cli_release', appSecret: LARK_U } }],
});
// the env handle carries OTHER values: the file must win where it speaks
const env = { VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'cloak', values: { licenseKey: 'cb_env_license_ZZZZZZZZZZZZZZZZ' } }, { id: 'cloud:browserless', values: { apiKey: 'env-browserless-key-0000000' } }]) };
const reader = CP.create({ dir: DIR, log, debounceMs: 30, pollMs: 300 });
CP.setSharedPresets(reader);                             // MountManager.drivePresets reads the same instance
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const frames = [];
const app = express(); app.use(express.json());
const w = wiring.create({ app, dataDir: DATA, bcastAll: (m) => frames.push(JSON.parse(JSON.stringify(m))), drivePresets: () => MountManager.drivePresets(), env, presets: reader, log });
await reader.start();
const store = w.store;
const PORT = await freePort();
const server = http.createServer(app);
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const get = (p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));

// ═══ §1 the file rung ═══════════════════════════════════════════════════
console.log('§1 the file rung');
{
  const c = store.resolveIntegration('cloak');
  ok(c.source === 'cluster' && c.values.licenseKey === CLOAK_A, 'cloak (a card row): the cluster default comes from the presets DIRECTORY — the env handle\'s other key is not consulted');
  const bl = store.resolveIntegration('cloud:browserless');
  ok(bl.source === 'none', 'cloud:browserless: the directory speaks for integrations, the env JSON is not merged into it (one rung, never a mix)');
  ok(JSON.stringify(store.presetsFor('lark')) === JSON.stringify([{ key: 'jarvis', label: 'Jarvis (mine)' }, { key: 'other', label: 'Other' }]), 'lark (account-bound): presetsFor = the directory\'s presets, the release override REPLACING jarvis per key, the company\'s other preset kept');
  const lj = store.resolveIntegration('lark', { credentialKey: 'cluster:jarvis' });
  ok(lj.source === 'cluster' && lj.values.appId === 'cli_release' && lj.values.appSecret === LARK_U, 'the account rung cluster:jarvis resolves the RELEASE override\'s app');
  ok(JSON.stringify(store.presetsFor('gmail')) === JSON.stringify([{ key: 'org1', label: 'Org' }, { key: 'channels', label: 'Channels' }]) && store.resolveIntegration('gmail').clusterKey === 'channels', 'gmail (delegating): the Google presets come from the directory through MountManager.drivePresets, `prefer: channels` still picks');
  // the env is the fallback for a kind the directory says nothing about
  const bare = CP.create({ dir: path.join(ROOT, 'empty-dir'), log: { log() {}, error() {}, warn() {} } });
  fs.mkdirSync(path.join(ROOT, 'empty-dir'), { recursive: true });
  const envOnly = require(STORE_PATH).create({ dataDir: path.join(ROOT, 'data-envonly'), env, presets: bare, log: { log() {}, error() {}, warn() {} } });
  ok(envOnly.resolveIntegration('cloak').values.licenseKey === 'cb_env_license_ZZZZZZZZZZZZZZZZ' && envOnly.resolveIntegration('cloud:browserless').source === 'cluster', 'a directory with no integrations file: the env is the fallback rung (a release still on env works unchanged)');
  const items = store.presetItems();
  ok(items.some((i) => i.kind === 'cloak' && i.source === 'cluster' && i.n === 1) && items.some((i) => i.kind === 'lark' && i.source === 'cluster' && i.n === 1) && items.some((i) => i.kind === 'lark' && i.source === 'release' && i.n === 1), `presetItems: counted by the layer each preset came from (${JSON.stringify(items)})`);
}

// ═══ §2 LIVE ═════════════════════════════════════════════════════════════
console.log('§2 live re-derive + notify');
{
  const view0 = (await get('/api/integrations'));
  ok(view0.presets && view0.presets.dir === DIR && view0.presets.groups.some((gr) => gr.source === 'cluster') && view0.presets.groups.some((gr) => gr.source === 'release'), 'GET /api/integrations carries the presets summary (dir + groups by source)');
  ok(!SECRETS.some((s) => JSON.stringify(view0).includes(s)), 'the GET body carries no secret (the cards are masked, the summary is counts)');
  const listened = []; store.onChange((id, why) => listened.push([id, why]));
  frames.length = 0; lines.length = 0;
  project(DIR, {
    'integrations.json': [{ id: 'cloak', values: { licenseKey: CLOAK_B } }, { id: 'lark', key: 'jarvis', label: 'Jarvis', values: { appId: 'cli_cluster', appSecret: LARK_A } }],
    'gdrive-clients.json': [g('org1', G_B, 'Org'), g('channels', G_A, 'Channels')],
    'override/integrations.json': [{ id: 'lark', key: 'jarvis', label: 'Jarvis (mine)', values: { appId: 'cli_release', appSecret: LARK_U } }],
  });
  const ms = await until(() => frames.some((f) => f.type === 'cluster-presets-updated'));
  ok(ms >= 0, `the swap reached the clients (${ms} ms after the rename)`);
  const cards = frames.filter((f) => f.type === 'integrations-updated');
  const cloak = cards.find((f) => f.id === 'cloak');
  ok(cloak && cloak.why === 'presets' && cloak.integration.source === 'cluster' && cloak.integration.masked.licenseKey === '••••' + CLOAK_B.slice(-4), `the cloak card's RECOMPUTED view is pushed (masked ••••${CLOAK_B.slice(-4)}, why: presets)`);
  const cardIds = R.ROWS.filter((r) => !r.bindsPerAccount).map((r) => r.id);
  ok(cards.length === cardIds.length && cardIds.every((id) => cards.filter((f) => f.id === id).length === 1) && !cards.some((f) => ['lark', 'gmail', 'fake'].includes(f.id)), `every CARD row re-broadcast exactly once (${cards.length} of the registry's ${cardIds.length}), no account-bound row (not a card)`);
  ok(listened.length === 1 && listened[0][0] === null && listened[0][1] === 'presets', 'the store listeners run ONCE (the channels engine re-asks every adapter and re-pushes its digest)');
  const sumF = frames.filter((f) => f.type === 'cluster-presets-updated');
  ok(sumF.length === 1 && sumF[0].presets.groups.find((gr) => gr.source === 'cluster').items.some((i) => i.kind === 'gdrive' && i.n === 2), 'ONE cluster-presets-updated frame with the recomputed summary');
  ok(!SECRETS.some((s) => JSON.stringify(frames).includes(s)), 'no frame carries a secret — not the old, not the new');
  const jl = lines.filter((l) => /\[presets\] changed/.test(l));
  ok(jl.length === 1 && /rotated org1/.test(jl[0]) && /rotated cloak\/default/.test(jl[0]) && /removed lark\/other/.test(jl[0]) && !SECRETS.some((s) => jl[0].includes(s)), `ONE journal line naming what changed: ${jl[0]}`);
  ok(store.resolveIntegration('cloak').values.licenseKey === CLOAK_B, 'the consumers\' call answers the rotated key now — no restart');
  const gone = store.resolveIntegration('lark', { credentialKey: 'cluster:other' });
  ok(gone.source === 'none' && gone.whyCode === 'preset-gone' && gone.whyParams.key === 'other', 'a preset the cluster withdrew answers preset-gone BY NAME on the account rung — never another preset');
  ok(store.resolveIntegration('gmail', { credentialKey: 'cluster:org1' }).values.clientSecret === G_B && MountManager._driveClient({ clientPreset: 'org1' }).clientSecret === G_B, 'the rotated Google client reaches the gmail row AND the storage mounts\' _driveClient — the same instance, no restart');
  const view1 = await get('/api/integrations');
  ok(JSON.stringify(view1.presets.groups) === JSON.stringify(sumF[0].presets.groups), 'the GET summary equals the pushed one (one computation)');
}

// ═══ §3 a malformed file ════════════════════════════════════════════════
console.log('§3 malformed');
{
  frames.length = 0; lines.length = 0;
  project(DIR, { 'integrations.json': `[{"id":"cloak","values":{"licenseKey":"${CLOAK_A}"}},`, 'gdrive-clients.json': [g('org1', G_B, 'Org'), g('channels', G_A, 'Channels')], 'override/integrations.json': [{ id: 'lark', key: 'jarvis', label: 'Jarvis (mine)', values: { appId: 'cli_release', appSecret: LARK_U } }] });
  await until(() => frames.some((f) => f.type === 'cluster-presets-updated'));
  ok(store.resolveIntegration('cloak').values.licenseKey === CLOAK_B, 'a malformed integrations file: the PREVIOUS presets stay in effect (cloak keeps the last good key)');
  const el = lines.filter((l) => /could not be read/.test(l));
  ok(el.length === 1 && /integrations\.json/.test(el[0]) && !el[0].includes(CLOAK_A.slice(-6)), `ONE journal line, no secret bytes: ${el[0]}`);
  const sf = frames.find((f) => f.type === 'cluster-presets-updated');
  ok(sf && sf.presets.errors.length === 1 && sf.presets.errors[0].code === 'unparseable' && sf.presets.errors[0].kept === true, 'the summary says it to every client (kept: true) — and no card was re-broadcast (the presets did not change)');
  ok(!frames.some((f) => f.type === 'integrations-updated'), '…no card frame: nothing to re-derive');
  frames.length = 0;
  project(DIR, { 'integrations.json': [{ id: 'cloak', values: { licenseKey: CLOAK_A } }], 'gdrive-clients.json': [g('org1', G_B, 'Org')] });
  await until(() => frames.some((f) => f.type === 'integrations-updated'));
  ok(store.resolveIntegration('cloak').values.licenseKey === CLOAK_A && (await get('/api/integrations')).presets.errors.length === 0, 'fixed: it serves again and the error is gone from the summary');
}

// CONTROL: today's store (no file rung) never sees the swap
{
  const src = fs.readFileSync(STORE_PATH, 'utf-8');
  const anchor = "    const fromFile = presets && typeof presets.entries === 'function' ? presets.entries('integrations') : null;";
  ok(src.includes(anchor), 'the control\'s anchor exists in the store');
  const envOnly = M.load('src/server/integration-store.js', src.replace(anchor, '    const fromFile = null;'), 'envonly');
  const s2 = envOnly.create({ dataDir: path.join(ROOT, 'data-ctl'), env, presets: reader, log: { log() {}, error() {}, warn() {} } });
  ok(s2.resolveIntegration('cloak').values.licenseKey === 'cb_env_license_ZZZZZZZZZZZZZZZZ', 'CONTROL: a store without the file rung keeps serving the env\'s boot-time key — the §1/§2 asserts are red on it');
}

for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(row.pass, row.name, row.detail);
reader.stop(); server.close(); CP.setSharedPresets(null);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
