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
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
