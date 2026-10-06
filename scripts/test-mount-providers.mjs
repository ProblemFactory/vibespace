#!/usr/bin/env node
// STORAGE PROVIDER ROWS (lane dc-mount-providers, rv-server M6). A storage provider is ONE file in
// src/mount-providers/ (a PURE row: facts + its hooks into MountManager's generic lifecycle) and ONE line in
// src/mount-providers/index.js; src/mounts.js asks the row and names no provider (test-architecture §78, family
// `mount`). ① the folder and its list agree · ② a FAKE provider `acme` — one file + one added index line, nothing
// else — is added, listed, labelled, configured, edited, given a child, mounted through rclone's env, judged
// OAuth-backed and offered as a lendable Google client (the channels' "From storage" borrow) by the REAL manager
// code · ③ DIFFERENTIAL: every real provider's add / list / config / update / addChild / rclone env / OAuth facts
// answer the same on this tree as on the pre-move manager (the base commit's src/mounts.js, loaded as a copy) ·
// ④ patched-copy controls: the old ladders restored (a default-only rclone env, the literal vendor map) ⇒ ② red.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const ROOT = scratch('mount-providers');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const PROV = require(path.join(REPO, 'src/mount-providers/index.js'));
const MC = mutantCopies('mount-providers', REPO);   // patched copies live outside the tree (§51)

// ── ① the folder IS the family: every file is listed once, every row's id is its file name ──
{
  const files = fs.readdirSync(path.join(REPO, 'src/mount-providers')).filter((f) => f.endsWith('.js') && f !== 'index.js').sort();
  const idx = read('src/mount-providers/index.js');
  const listed = [...idx.matchAll(/^\s*require\('\.\/([\w-]+\.js)'\),$/gm)].map((m) => m[1]);
  ok(JSON.stringify([...listed].sort()) === JSON.stringify(files), `① index.js lists every provider file exactly once (${listed.length} lines, ${files.length} files)`, JSON.stringify({ listed, files }));
  ok(PROV.rows.every((r) => r.id + '.js' === listed[PROV.rows.indexOf(r)]) && PROV.rows.filter((r) => r.default).length === 1, '① each row\'s id is its file name; exactly one default row (a record without a type)');
  ok(PROV.rowOf('constructor') && !PROV.rowOf('constructor').create && PROV.rowOf(undefined) === PROV.defaultRow, '① an unknown type has no row (no prototype keys); no type = the default row');
}

// ── ② a FAKE provider through ONE registration line drives the real manager ──
// lane dc-mount-client: the fake row's CLIENT cells (pure data, published by clientRows()) — ④ renders them
const ACME_CLIENT = { pick: 10, form: 10, pickLabel: 'Acme Cloud', tag: 'ACME', offersChild: true, driveReauth: true,
  names: { product: 'Acme Drive', signin: 'Acme' }, signins: { acme: 'Acme' },
  connect: [{ key: 'acmeHost', label: 'Acme host', placeholder: 'acme.example.test' }, { key: 'acmeToken', label: 'Acme access', type: 'textarea' }],
  child: { path: { key: 'remotePath', label: 'Acme folder', placeholder: 'acme/sub' } },
  edit: [{ key: 'acmeHost', label: 'Acme host', placeholder: 'acme.example.test' }, { key: 'acmeKey', label: 'Acme key' }],
  submit: { map: { token: 'acmeToken' }, drop: ['acmeToken'] } };
const ACME = `'use strict';
module.exports = {
  id: 'acme',
  oauth: 'google',
  oauthBacked: () => true,
  label: (m) => 'ACME ' + m.acmeHost,
  config(m, out, dec) { Object.assign(out, { acmeHost: m.acmeHost, acmeKey: dec(m.acmeKeyEnc) }); },
  create(m, cfg, x) {
    if (!cfg.acmeHost) throw new Error('acmeHost required');
    Object.assign(m, { acmeHost: String(cfg.acmeHost), acmeKeyEnc: x._enc(String(cfg.acmeKey || '')), clientId: cfg.clientId || null, clientSecretEnc: cfg.clientSecret ? x._enc(cfg.clientSecret) : null });
  },
  child(m, cfg) { m.remotePath = String(cfg.remotePath || ''); },
  update(m, patch, setIf, x) { setIf('acmeHost'); if (patch.acmeKey) m.acmeKeyEnc = x._enc(String(patch.acmeKey)); },
  client: ${JSON.stringify(ACME_CLIENT)},   // lane dc-mount-client: its CLIENT cells ride the same row
  rclone(m, env, P, R, x) { env[P('TYPE')] = 'acme'; env[P('HOST')] = m.acmeHost; env[P('KEY')] = x._dec(m.acmeKeyEnc); return R + ':' + (m.remotePath || ''); },
};
`;
const acmeFile = MC.write('src/mount-providers/acme.js', ACME, 'fake');
const idxSrc = read('src/mount-providers/index.js');
const lastReq = idxSrc.lastIndexOf("  require('./");
const lineEnd = idxSrc.indexOf('\n', lastReq) + 1;
const idxAcme = idxSrc.slice(0, lineEnd) + `  require(${JSON.stringify(acmeFile)}),\n` + idxSrc.slice(lineEnd);
const added = idxAcme.split('\n').filter((l) => !idxSrc.split('\n').includes(l));
ok(added.length === 1 && idxAcme.split('\n').length === idxSrc.split('\n').length + 1, '② the fake provider is ONE file + ONE added line in index.js (nothing else in the tree changes)', JSON.stringify(added));
const idxCopy = MC.write('src/mount-providers/index.js', idxAcme, 'acme');
const mountsSrc = read('src/mounts.js');
const NEEDLE = "require('./mount-providers/index.js')";
ok(mountsSrc.split(NEEDLE).length === 2, '② src/mounts.js reaches the family through its one list require');
const withList = (src, tag) => MC.load('src/mounts.js', src.split(NEEDLE).join(`require(${JSON.stringify(idxCopy)})`), tag).MountManager;
async function drive(MM, tag) {
  const dd = path.join(ROOT, 'acme-' + tag); fs.mkdirSync(dd, { recursive: true });
  const mm = new MM({ dataDir: dd });
  const out = {};
  try {
    const id = mm.add({ type: 'acme', name: 'Acme ' + tag, acmeHost: 'h1.example', acmeKey: 'k-1', clientId: 'acme-client.apps.googleusercontent.com', clientSecret: 's-1' });
    const row = () => mm.list().find((r) => r.id === id);
    out.listed = row() && row().type === 'acme' && row().source === 'ACME h1.example';
    out.config = JSON.stringify(mm.config(id)).includes('"acmeKey":"k-1"');
    await mm.update(id, { acmeHost: 'h2.example', acmeKey: 'k-2' });
    const { env, remote } = mm._rcloneFor(mm._get(id));
    out.env = env.RCLONE_CONFIG_VS_TYPE === 'acme' && env.RCLONE_CONFIG_VS_HOST === 'h2.example' && env.RCLONE_CONFIG_VS_KEY === 'k-2' && remote === 'VS:';
    const kid = mm.addChild(id, { name: 'Acme child ' + tag, remotePath: 'inbox' });
    const ce = mm._rcloneFor(mm._get(kid));
    out.child = ce.env.RCLONE_CONFIG_VS_HOST === 'h2.example' && ce.remote === 'VS:inbox';
    out.oauth = mm._oauthBacked(mm._get(id)) === true;
    out.lent = mm.oauthClientsFor('google').some((c) => c.mountId === id && c.type === 'acme');
  } catch (e) { out.error = String(e.message || e); }
  return out;
}
const real = await drive(MountManager, 'real');
ok(real.error === 'unknown mount type: acme', '② CONTROL: the real list (no acme line) refuses the fake type — the line is what admits it', JSON.stringify(real));
const fake = await drive(withList(mountsSrc, 'acme'), 'acme');
ok(fake.listed, '② the manager adds and lists it, labelled by its row', JSON.stringify(fake));
ok(fake.config && fake.env && fake.child, '② its row\'s config / edit / rclone env reach the real lifecycle — a child resolves the parent\'s connection');
ok(fake.oauth && fake.lent, '② its declared cells reach the OAuth facts: OAuth-backed, and its own Google client is offered to a channel account (oauthClientsFor)');

// ── ④ patched-copy controls: the pre-move ladders restored ⇒ ② red ──
{
  const ENV_LINE = '    remote = (row.rclone ? row : PROVIDERS.defaultRow).rclone(m, env, P, R, this);';
  const VENDOR = 'static OAUTH_CLIENT_VENDOR = Object.freeze(Object.fromEntries(PROVIDERS.rows.filter((r) => r.oauth).map((r) => [r.id, r.oauth])));';
  ok(mountsSrc.split(ENV_LINE).length === 2 && mountsSrc.split(VENDOR).length === 2, '④ control anchors exist once');
  const m1 = await drive(withList(mountsSrc.replace(ENV_LINE, '    remote = PROVIDERS.defaultRow.rclone(m, env, P, R, this);'), 'ladder'), 'ladder');
  ok(m1.listed && !m1.env, '④ NEGATIVE CONTROL: a rclone env that knows only its old arms (default = S3) mounts the fake as S3 — the env assert is red', JSON.stringify(m1));
  const m2 = await drive(withList(mountsSrc.replace(VENDOR, "static OAUTH_CLIENT_VENDOR = Object.freeze({ drive: 'google', gmail: 'google', onedrive: 'microsoft' });"), 'vendor'), 'vendor');
  ok(m2.listed && !m2.lent, '④ NEGATIVE CONTROL: the literal vendor map restored never offers the fake\'s client — the borrow assert is red', JSON.stringify(m2));
}

// ── ③ DIFFERENTIAL: the pre-move manager and this one answer the same for every real provider ──
{
  const BASE = process.env.MOUNT_PROVIDERS_BASE || 'b48b26ae4';
  let baseSrc = null;
  try { baseSrc = execFileSync('git', ['-C', REPO, 'show', `${BASE}:src/mounts.js`], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch {}
  // a depth-1 checkout (the Actions mirror) holds no pre-move object — the differential degrades to a named SKIP (§75).
  // A lane that changes a provider's behaviour ON PURPOSE re-points BASE at its own base commit (the diff names the field).
  if (!baseSrc) console.log(`  SKIP ③ the differential — ${BASE} is not in this checkout (a shallow clone)`);
  else ok(!baseSrc.includes(NEEDLE), `③ the pre-move manager is readable (${BASE}:src/mounts.js, no provider list)`);
  const OLD = baseSrc ? MC.load('src/mounts.js', baseSrc, 'base').MountManager : null;
  const ADDS = [
    { type: 's3', endpoint: 'https://s3.example', bucket: 'b', prefix: '/p/q/', accessKey: 'AK', secretKey: 'SK', sessionToken: 'ST' },
    { type: 'drive', token: 'Paste: {"access_token":"a","expiry":"x"} done', driveFolder: '/F/', driveMode: 'shared-drive', teamDriveId: ' TD ', clientId: 'cid', clientSecret: 'cs' },
    { type: 'gmail', token: '{"access_token":"g"}', syncCount: '', groupBy: 'day', labelIds: 'INBOX', query: 'is:unread', email: 'a@example.com' },
    { type: 'onedrive', token: '{"t":1}', remotePath: '/Docs/', driveId: ' D1 ', driveType: 'business', region: 'us' },
    { type: 'cloud', backend: 'dropbox', token: '{"t":2}', remotePath: '/x/' },
    { type: 'cloud', backend: 'nope', token: '{"t":2}' },
    { type: 'webdav', url: 'https://dav.example/', vendor: 'nextcloud', user: 'u', bearerToken: 'bt' },
    { type: 'vibespace', url: 'https://vs.example///', bearerToken: 'share-tok' },
    { type: 'sftp', sshHost: 'h', sshUser: 'u', sshPort: '2222', sshPath: '/srv', keyPath: '/k/id' },
    { type: 'sftp', sshHost: 'h', sshUser: 'u', keyPath: 'rel/id' },
    { type: 'rclone', rcloneType: 'b2', params: { account: 'acc', key: 'kk' }, remotePath: '/bkt/x' },
    { type: 'rclone', rcloneType: 's3', params: { provider: 'Other' }, remotePath: '' },
    { type: 'rclone', rcloneType: 'drive', params: { token: '{"t":3}', team_drive: 'TD2', client_id: 'c2', client_secret: 's2' } },
    { type: 'rclone', rcloneType: 'onedrive', params: { token: '{"t":4}', drive_id: 'd4', drive_type: 'personal' } },
    { type: 'rclone', rcloneType: 'box', params: { token: '{"t":5}', client_id: 'c5' } },
    { type: 'cephfs', cephMonHosts: '10.0.0.1:6789,10.0.0.2', cephSecret: 'cs', cephPath: 'vol' },
    { type: 'zzz' },
    { endpoint: 'https://s3.example', bucket: 'nb', accessKey: 'AK', secretKey: 'SK' },
  ];
  const CHILD = { bucket: 'kb', prefix: '/kp/', remotePath: '/kr', driveFolder: '/kf/', driveMode: 'shared-with-me', sshPath: '/ks' };
  const PATCH = { endpoint: 'https://s3b.example', prefix: '/n/', secretKey: 'SK2', driveFolder: 'G', driveMode: 'mydrive', rootFolderId: ' R ', remotePath: '/r2/', driveType: 'personal', clientId: 'cid2',
    clientSecret: 'cs2', syncCount: '5', groupBy: 'bogus', query: 'q2', url: 'https://dav2.example/', vendor: 'other', bearerToken: 'bt2', sshPort: 'x', sshPath: '/p2', params: { key: 'k2', account: '' }, rcloneType: 'b2' };
  const decAll = (mm, o) => JSON.parse(JSON.stringify(o, (k, v) => (/Enc$/.test(k) && typeof v === 'string' ? 'dec:' + mm._dec(v) : /Enc$/.test(k) && v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, 'dec:' + mm._dec(b)])) : v)));
  async function snap(MM, tag) {
    const dir = path.join(ROOT, 'diff-' + tag);
    fs.mkdirSync(dir, { recursive: true });
    const mm = new MM({ dataDir: dir });
    const norm = (o) => JSON.parse(JSON.stringify(o ?? null).split(dir).join('<D>').replace(/mnt-[0-9a-f]{10}/g, 'mnt-ID'));
    const tryv = async (fn) => { try { return { v: norm(await fn()) }; } catch (e) { return { err: String(e.message || e) }; } };
    const facts = (id) => {
      const m = mm._get(id);
      let env = null; try { const r = mm._rcloneFor(m); env = { remote: r.remote, ...Object.fromEntries(Object.entries(r.env).filter(([k]) => k.startsWith('RCLONE_CONFIG_VS_'))) }; } catch (e) { env = { err: String(e.message || e) }; }
      return norm({ rec: decAll(mm, { ...m, createdAt: 0 }), list: { ...mm.list().find((r) => r.id === id), createdAt: 0 }, config: mm.config(id), env,
        oauth: mm._oauthBacked(m), revocable: mm._revocable(m), share: mm.canShareFromMount(m), ceph: mm.canCephShare(m), lends: mm._lendsOAuthClient(m) });
    };
    const out = [];
    for (const [i, cfg] of ADDS.entries()) {
      const name = `p${i}`;
      const a = await tryv(() => mm.add({ ...cfg, name }));
      if (a.err) { out.push({ i, add: a }); continue; }
      const id = mm._state.mounts.find((m) => m.name === name).id;
      const row = { i, add: facts(id) };
      row.child = await tryv(() => { const k = mm.addChild(id, { ...CHILD, name: name + 'c' }); return facts(k); });
      if (!row.child.err) { const k = mm._state.mounts.find((m) => m.name === name + 'c').id; row.childUpd = await tryv(async () => { await mm.update(k, { ...PATCH }); return facts(k); }); }
      row.upd = await tryv(async () => { await mm.update(id, { ...PATCH, clientPreset: undefined }); return facts(id); });
      row.reauth = await tryv(() => { const c = mm._get(id); const T = mm.startDriveAuth; let got = null; mm.startDriveAuth = (o) => { got = o; return 'started'; }; try { mm.startDriveAuthForMount(id); } finally { mm.startDriveAuth = T; } return got || c.type; });
      out.push(row);
    }
    out.push({ migrate: await tryv(() => { const raw = { id: 'mnt-0123456789', name: 'raw', type: 'rclone', rcloneType: 'onedrive', paramsEnc: { token: mm._enc('{"t":9}'), drive_id: mm._enc('dd') } }; mm._state.mounts.push(raw); mm._state._cloudUnified2 = false; mm._maybeMigrateDrive(); return decAll(mm, mm._get('mnt-0123456789')); }) });
    out.push({ vendor: MM.OAUTH_CLIENT_VENDOR, identity: ['drive', 'gmail'].map((t) => MM._clientIdentity(t, { clientId: 'c', hasSecret: false, clientPreset: 'k' })) });
    return out;
  }
  if (baseSrc) {
    const before = await snap(OLD, 'base'), after = await snap(MountManager, 'tree');
    const firstDiff = (a, b, at = '') => {
      if (JSON.stringify(a) === JSON.stringify(b)) return null;
      if (a && b && typeof a === 'object' && typeof b === 'object') for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], at + '.' + k); if (d) return d; }
      return `${at}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
    };
    let same = 0; const diffs = [];
    before.forEach((b, i) => { if (JSON.stringify(b) === JSON.stringify(after[i])) same++; else diffs.push(`scenario ${i}: ` + firstDiff(b, after[i])); });
    ok(before.length === after.length && diffs.length === 0, `③ every provider answers the same before and after the move (${same}/${before.length} scenarios: add · list · config · child · edit · rclone env · OAuth/share facts · re-auth client · raw-rclone adoption)`, diffs.join('\n    '));
    ok(before.filter((r) => r.add && !r.add.err).length >= 15 && before.some((r) => r.add && r.add.err), '③ the scenarios reach every row (15+ adds land, the unknown type is refused)');
  }
}
// ⑤ lane dc-mount-client — the CLIENT half: the same ONE index line carries acme's client cells to GET /api/mounts
// (`providers` = clientRows()) and the REAL src/lib/sidebar-mounts.js (an esbuild node bundle, DOM stubbed) renders
// them — the Connect dialog's type + fields + submit body, the Edit fields, the submount path, the re-authorize
// names, the sign-in name — with ZERO client edits. Controls (patched copies, never src/): the old PROVIDER_LABELS
// literal table back in the client ⇒ acme unnamed ⇒ red; a literal type branch planted ⇒ §78 rise ⇒ red.
{
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const { census } = await import(path.join(REPO, 'scripts/id-branch-census.mjs'));
  const noop = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : noop), apply: () => noop, construct: () => noop, set: () => true, has: () => true });
  for (const g of ['window', 'document', 'localStorage', 'sessionStorage', 'location', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'customElements', 'history', 'screen']) if (!(g in globalThis)) globalThis[g] = noop;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null }); const j = String(url).endsWith('/drive-defaults') ? { presets: [] } : { id: 'acme-1' }; return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => j, text: async () => JSON.stringify(j) }; };
  const SM = path.join(REPO, 'src/lib/sidebar-mounts.js');
  const bundle = async (src, tag) => {
    const out = path.join(ROOT, `sidebar-mounts.${tag}.mjs`);
    await esbuild.build({ stdin: { contents: src, resolveDir: path.dirname(SM), sourcefile: SM }, bundle: true, format: 'esm', platform: 'browser', outfile: out, logLevel: 'silent', loader: { '.css': 'empty' },
      plugins: [{ name: 'bv', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'bv' })); b.onLoad({ filter: /.*/, namespace: 'bv' }, () => ({ contents: "export const BUILD_VERSION = '0';" })); } }] });
    return (await import(out)).installSidebarMounts;
  };
  const acmeRows = require(idxCopy).clientRows();
  const probe = async (install, rows) => {
    function S() { this._mountsData = { providers: rows }; this._hostsData = { hosts: [] }; }
    install(S);
    const s = new S(); let dlg = null;
    s._mountsDialog = (title, fields, submitLabel, onSubmit) => { dlg = { fields, onSubmit }; };
    s._connectNewMount = async () => false;
    await s._showAddMountDialog();
    const typeOpts = dlg.fields.find((f) => f.key === 'type').options;
    const host = dlg.fields.find((f) => f.key === 'acmeHost');
    calls.length = 0;
    try { await dlg.onSubmit({ type: 'acme', name: 'a1', acmeHost: 'h.example.test', acmeToken: '{"t":1}', mode: 'rw' }, { close() {} }); } catch {}
    const post = calls.find((c) => c.url.endsWith('/api/mounts') && c.method === 'POST');
    return { typeOpts, host: host && { label: host.label, ph: host.placeholder, mine: host.when({ type: 'acme' }), other: host.when({ type: 's3' }) }, body: post && post.body,
      edit: s._mountEditFields({ type: 'acme', acmeHost: 'h.example.test' }), editChild: s._mountEditFields({ type: 'acme', parentId: 'p' }),
      names: s._oauthProviderNames({ type: 'acme' }), reauth: s._isDriveBacked({ type: 'acme' }), signin: s._signins().acme, row: s._providerRow('acme') };
  };
  const smSrc = read('src/lib/sidebar-mounts.js');
  const real = await probe(await bundle(smSrc, 'tree'), acmeRows);
  ok(JSON.stringify(real.typeOpts.at(-1)) === '["acme","Acme Cloud"]' && real.typeOpts.length === 10, '⑤ Connect storage: the type list offers acme last (its pick + pickLabel cells)', JSON.stringify(real.typeOpts));
  ok(real.host && real.host.label === 'Acme host' && real.host.ph === 'acme.example.test' && real.host.mine === true && real.host.other === false, '⑤ …acme\'s own fields render, shown only while acme is picked', JSON.stringify(real.host));
  ok(real.body && real.body.type === 'acme' && real.body.token === '{"t":1}' && !('acmeToken' in real.body) && real.body.acmeHost === 'h.example.test', '⑤ …and its submit cells shape the POST body (acmeToken → token, the UI key dropped)', JSON.stringify(real.body));
  ok(JSON.stringify(real.edit) === JSON.stringify([['acmeHost', 'Acme host', 'acme.example.test', 'h.example.test'], ['acmeKey', 'Acme key', '', '']]) && JSON.stringify(real.editChild) === '[]', '⑤ the Edit dialog prefills acme\'s edit cells (a child without editChild cells edits nothing)', JSON.stringify(real.edit));
  ok(real.names.product === 'Acme Drive' && real.names.signin === 'Acme' && real.reauth === true && real.signin === 'Acme' && real.row.tag === 'ACME' && real.row.offersChild === true, '⑤ the re-authorize names, the sign-in name, the chip tag and the ＋ come off acme\'s row', JSON.stringify({ names: real.names, signin: real.signin }));
  ok(!PROV.clientRows().some((r) => r.id === 'acme') && PROV.clientRows().every((r) => r.client === undefined && 'oauth' in r), '⑤ the real providers list publishes no acme row (flat client cells, the oauth cell beside them)');
  const old = smSrc.replace(/_signins\(\) \{[^\n]*\},/, "_signins() { return { onedrive: 'Microsoft', drive: 'Google', dropbox: 'Dropbox', box: 'Box', pcloud: 'pCloud', yandex: 'Yandex', jottacloud: 'Jottacloud', hidrive: 'HiDrive' }; },");
  const ctl = old !== smSrc && await probe(await bundle(old, 'old-labels'), acmeRows);
  ok(ctl && ctl.signin === undefined, '⑤ CONTROL: the old PROVIDER_LABELS literal table back in the client ⇒ acme has no sign-in name (red)', JSON.stringify(ctl && ctl.signin));
  const planted = smSrc.replace('    _providerRows() {', "    _plant(m) { if (m.type === 'gmail') return 1; },\n    _providerRows() {");
  const c = census(REPO, { read: (f) => (f === 'src/lib/sidebar-mounts.js' ? planted : fs.readFileSync(path.join(REPO, f), 'utf8')) });
  const base = JSON.parse(read('scripts/fixtures/id-branch-baseline.json'));
  const n = (c.counts.mount || {})['src/lib/sidebar-mounts.js'] || 0, b0 = ((base.mount || {})['src/lib/sidebar-mounts.js']) || 0;
  ok(planted !== smSrc && n === 1 && b0 === 0, '⑤ CONTROL: a literal `m.type === \'gmail\'` planted in sidebar-mounts.js is a §78 mount rise (0 → 1)', JSON.stringify({ n, b0 }));
  // ⑤ DIFFERENTIAL: the client of the base (f02c9dfa9, before the rows' client cells) vs this tree over every real
  // provider — the Connect dialog's fields (+ each `when` over the types), the submit body, the Edit fields (top +
  // child), the re-authorize names, the D2 client-switch rule: identical. SKIP by name on a shallow clone (§75).
  let baseSm = null; try { baseSm = execFileSync('git', ['-C', REPO, 'show', 'f02c9dfa9:src/lib/sidebar-mounts.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch {}
  if (!baseSm) console.log('  SKIP ⑤ differential base-vs-tree client — f02c9dfa9 not in this clone (shallow)');
  else {
    const TYPES = PROV.rows.map((r) => r.id);
    const sorted = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
    const facts = async (install) => {
      function S() { this._mountsData = { providers: PROV.clientRows() }; this._hostsData = { hosts: [{ id: 'h1', name: 'Box', host: 'b', user: 'u', port: 22 }] }; }
      install(S);
      const s = new S(); let dlg = null; const out = {};
      s._mountsDialog = (title, fields, submitLabel, onSubmit) => { dlg = { fields, onSubmit }; };
      s._connectNewMount = async () => false;
      for (const presets of [[], [{ key: 'acme', label: 'Acme' }]]) {
        globalThis.__presets = presets;
        await s._showAddMountDialog();
        out['connect' + presets.length] = dlg.fields.map((f) => sorted({ ...f, when: f.when && TYPES.flatMap((t) => [f.when({ type: t }), f.when({ type: t, clientChoice: 'custom', gmailClientChoice: 'custom', driveMode: 'shared-drive' })]), autocomplete: typeof f.autocomplete === 'function' ? [f.autocomplete({ fromHost: { value: 'h1' } }), f.autocomplete({})] : f.autocomplete }));
        const all = Object.fromEntries(dlg.fields.map((f) => [f.key, f.key === 'params' || f.key === 'extraParams' ? 'a = 1\nb = 2' : f.key + '-v']));
        for (const t of TYPES) for (const ch of ['custom', '']) { calls.length = 0; try { await dlg.onSubmit({ ...all, type: t, clientChoice: ch, gmailClientChoice: ch }, { close() {} }); } catch {} out[`submit-${t}-${ch}-${presets.length}`] = sorted(calls.find((c) => c.url.endsWith('/api/mounts'))?.body); }
      }
      const cfg = { endpoint: 'e', bucket: 'b', prefix: 'p', accessKey: 'a', secretKey: 's', remotePath: 'r', params: { region: 'x', n: null }, driveFolder: 'f', driveMode: '', teamDriveId: 't', rootFolderId: 'r', clientPreset: 'acme', token: 'tok', clientId: 'c', clientSecret: 'cs', syncCount: 0, groupBy: '', labelIds: 'L', query: 'q', driveType: '', driveId: 'd', url: 'u', vendor: '', user: 'us', pass: 'pw', bearerToken: 'bt', sshHost: 'h', sshUser: 'u', sshPort: 22, sshPath: '/p', keyPath: '/k', backend: 'box', source: 'remote:x', rcloneType: 'drive' };
      for (const t of [...TYPES, undefined]) {
        out['edit-' + t] = sorted([s._mountEditFields({ ...cfg, type: t }, [{ key: 'acme', label: 'Acme' }]), s._mountEditFields({ ...cfg, type: t, parentId: 'p' }), s._mountEditFields({ ...cfg, type: t, syncCount: undefined, sshPort: 0 })]);
        out['names-' + t] = sorted([s._isDriveBacked({ ...cfg, type: t }) && s._oauthProviderNames({ ...cfg, type: t }), s._isDriveBacked({ ...cfg, type: t, rcloneType: 's3' }), s._isDriveBacked({ ...cfg, type: t }) && s._oauthProviderNames({ ...cfg, type: t, backend: 'zz' })]);   // names are only ever asked for a drive-backed record (D2's own rows: the d2 facts)
        out['d2-' + t] = sorted([s._mountClientSwitch({ type: t, clientPreset: 'acme' }, { clientPreset: 'lab' }, []), s._mountClientSwitch({ type: t, clientId: 'a', clientSecret: 'x' }, { clientId: 'b' }, []), s._mountClientSwitch({ type: t, clientId: 'a', clientSecret: 'x' }, { clientSecret: 'y' }, [])]);
      }
      return out;
    };
    const fetch0 = globalThis.fetch;
    globalThis.fetch = async (url, opts) => (String(url).endsWith('/drive-defaults') ? { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ presets: globalThis.__presets }), text: async () => JSON.stringify({ presets: globalThis.__presets }) } : fetch0(url, opts));
    const before = await facts(await bundle(baseSm, 'base')), after = await facts(await bundle(smSrc, 'tree2'));
    const diffs = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    ok(diffs.length === 0 && Object.keys(before).length === Object.keys(after).length, `⑤ DIFFERENTIAL: the base client and this tree answer the same over every real provider (${Object.keys(before).length} facts: Connect fields ×2 preset sets, ${TYPES.length * 4} submit bodies, Edit top/child, names, D2)`, diffs.slice(0, 3).map((k) => { const a = [].concat(before[k]), b = [].concat(after[k]); const i = a.findIndex((x, n) => x !== b[n]); return `${k}[${i}]: ${String(a[i]).slice(0, 300)} ≠ ${String(b[i]).slice(0, 300)}`; }).join('\n    '));
  }
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
