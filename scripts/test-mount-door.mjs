#!/usr/bin/env node
// test-mount-door — lane lg-remote-hardening, row B-7f0b (the coordinator's r1220 (1)): A PUSH MOUNT's REVERSE TUNNEL ENDS AT A
// DOOR OF ITS OWN (src/server/mount-door.js), never the hub's whole web port. FAST: real listeners on loopback, a real MountTokens
// store in a temp folder, the device's tunnel stood in (its connectLocal captured and dialled here).
//   ① the PURE path verdict: /dav and under it only; no backslash (raw or encoded)
//   ② a real door bound to ONE mount's pass, handing to the hub's one app (registered as the wiring module does; none ⇒ refused): anything but that mount's files is refused (404 — the sign-in page is not there);
//      no pass, or another mount's, 401 with the WebDAV challenge; that mount's own pass (Bearer or Basic) reaches its files
//   ③ THE WIRING, driven: MachineMounts._davBase over a stand-in device — the tunnel's connectLocal reaches the door, not the hub;
//      a request for the sign-in page through it is refused. RED: the release's tunnel end (a copy: net.connect(lp)) serves the
//      hub's whole port — its sign-in page answers. The re-own road (_doorOf) binds the door to the record's own pass.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mount-door-'));
const M = mutantCopies('mount-door', REPO);
const MD = require('../src/server/mount-door.js');
const { MountTokens, registerWebdav } = require('../src/webdav.js');
const express = require('express');

// a request over a given connection (the tunnel's own connectLocal) or to a port
const ask = (where, { method = 'GET', url = '/', headers = {} } = {}) => new Promise((resolve) => {
  const opts = { method, path: url, headers, ...(typeof where === 'function' ? { createConnection: where } : { host: '127.0.0.1', port: where }) };
  const req = http.request(opts, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers })); });
  req.on('error', (e) => resolve({ status: 0, body: String(e && e.message) }));
  req.end();
});
const bearer = (t) => ({ Authorization: 'Bearer ' + t });
const basic = (t) => ({ Authorization: 'Basic ' + Buffer.from('vibespace:' + t).toString('base64') });

console.log('① the PURE path verdict');
{
  const yes = ['/dav', '/dav/', '/dav/a/b.txt', '/dav/x?y=1'], no = ['/', '/login', '/api/sessions', '/davx', '/dav\\x', '/dav/%5cx', '/agent', ''];
  ok(yes.every(MD.onDoor) && !no.some(MD.onDoor), 'a mount\'s door lets /dav and under it pass, nothing else (no backslash, raw or encoded)', { yes, no });
}

console.log('② a real door bound to ONE mount\'s pass');
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const rootA = path.join(tmp, 'share-a'), rootB = path.join(tmp, 'share-b');
fs.mkdirSync(rootA); fs.mkdirSync(rootB);
fs.writeFileSync(path.join(rootA, 'notes.txt'), 'the shared folder');
const tokens = new MountTokens({ dataDir });
const A = tokens.mint({ name: 'host:hA', kind: 'reverse-mount', owner: 'hA', root: rootA, mode: 'ro' });
const B = tokens.mint({ name: 'host:hB', kind: 'reverse-mount', owner: 'hB', root: rootB, mode: 'ro' });
// the hub's ONE app, stood in: its /dav route (webdav.js, as server.js registers it) and a sign-in page — the door hands its /dav
// requests to it (setApp, as the wiring module does); the sign-in page must never be reached through a door
const hubApp = express();
registerWebdav(hubApp, { tokens });
hubApp.get('/login', (_q, res) => res.status(200).type('text/html').send('<form>sign in</form>'));
{
  let refused = null; try { await MD.open({ tokens }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'mount_door_unavailable', `a door with no hub app registered is refused by name («${refused && refused.message}») — never a door of its own`);
}
MD.setApp(hubApp);
{
  const door = await MD.open({ tokens, tokenId: A.rec.id });
  const r = {
    root: await ask(door.port, { url: '/' }), login: await ask(door.port, { url: '/login' }), api: await ask(door.port, { url: '/api/sessions' }),
    none: await ask(door.port, { method: 'PROPFIND', url: '/dav/', headers: { Depth: '1' } }),
    other: await ask(door.port, { method: 'PROPFIND', url: '/dav/', headers: { Depth: '1', ...bearer(B.raw) } }),
    own: await ask(door.port, { method: 'PROPFIND', url: '/dav/', headers: { Depth: '1', ...bearer(A.raw) } }),
    file: await ask(door.port, { url: '/dav/notes.txt', headers: basic(A.raw) }),
  };
  ok(r.root.status === 404 && r.login.status === 404 && r.api.status === 404 && /not_on_the_mount_door/.test(r.login.body),
    `anything but that mount's files is refused (/ ${r.root.status}, /login ${r.login.status}, /api ${r.api.status}): the sign-in page is not on the door`);
  ok(r.none.status === 401 && /Basic realm="vibespace-dav"/.test(String(r.none.headers['www-authenticate'] || '')) && r.other.status === 401,
    `no pass, or ANOTHER mount's pass: 401 with the WebDAV challenge (${r.none.status}, ${r.other.status})`);
  ok(r.own.status === 207 && /notes\.txt/.test(r.own.body) && r.file.status === 200 && r.file.body === 'the shared folder',
    `that mount's own pass reaches its files — a listing (${r.own.status}) and a read by Basic (${r.file.status})`);
  await door.close();
}

console.log('③ THE WIRING, driven: the push tunnel\'s connectLocal reaches the mount\'s door, not the hub');
{
  // the hub's whole web port, stood in: the same app on its own port (what the release's tunnel reached)
  const hub = http.createServer(hubApp);
  await new Promise((r) => hub.listen(0, '127.0.0.1', r));
  const hubPort = hub.address().port;
  const drive = async (MMmod) => {
    let captured = null;
    const dm = { reverseForward: async ({ connectLocal }) => { captured = connectLocal; return { port: 47001 }; }, reverseUnforward: async () => { } };
    const hosts = { get: () => ({ id: 'hA', transport: 'dial' }), deviceBounded: async () => dm, dataPlaneOn: () => true };
    const mm = new MMmod.MachineMounts({ dataDir: fs.mkdtempSync(path.join(tmp, 'mm-')), hosts, mountTokens: tokens, localPort: () => hubPort, log: () => { } });
    const base = await mm._davBase('hA');
    if (base.door) base.door.setTokenId(A.rec.id);
    const login = await ask(() => captured(), { url: '/login' });
    const own = await ask(() => captured(), { method: 'PROPFIND', url: '/dav/', headers: { Depth: '0', ...bearer(A.raw) } });
    if (base.door) await base.door.close();
    return { base, login, own, mm };
  };
  const MMsrc = read('src/machine-mounts.js');
  const tree = await drive(require('../src/machine-mounts.js'));
  ok(tree.base.tunnelPort === 47001 && tree.base.door && tree.login.status === 404 && tree.own.status === 207,
    `the push mount's tunnel ends at its own door: the sign-in page through it ${tree.login.status}, the mount's files ${tree.own.status}`);
  const relLine = "        const { port } = await dm.reverseForward({ port: wantPort || 0, connectLocal: () => net.connect(door.port, '127.0.0.1') });\n";
  const Rel = M.load('src/machine-mounts.js', anchored(MMsrc, relLine, "        const { port } = await dm.reverseForward({ port: wantPort || 0, connectLocal: () => net.connect(lp, '127.0.0.1') });\n", 'release-tunnel-end'), 'release-tunnel-end');   // the release's tunnel end, quoted (stale-pins: kept)
  const red = await drive(Rel);
  ok(red.login.status === 200 && /sign in/.test(red.login.body), `CONTROL (the release's tunnel end, a copy: the hub's whole port): the sign-in page answers through the tunnel (${red.login.status}) — RED`);
  // the re-own road: a record's door is bound to the record's own pass
  const d2 = await tree.mm._doorOf({ id: 'mm-1', tokenId: A.rec.id });
  const own2 = await ask(d2.port, { method: 'PROPFIND', url: '/dav/', headers: { Depth: '0', ...bearer(A.raw) } }), other2 = await ask(d2.port, { method: 'PROPFIND', url: '/dav/', headers: { Depth: '0', ...bearer(B.raw) } });
  ok(own2.status === 207 && other2.status === 401 && (await tree.mm._doorOf({ id: 'mm-1', tokenId: A.rec.id })) === d2, 'the re-own road (_doorOf): the record\'s door, once, bound to the record\'s own pass');
  await d2.close();
  ok(read('src/server/mounts-plugins-wiring.js').includes("require('./mount-door.js').setApp(app);") && !/express\(\)/.test(read('src/server/mount-door.js')), 'the hub registers its ONE app with the door (the wiring module); the door builds no app of its own');
  const sinks = MMsrc.split('\n').filter((l) => /\.reverseForward\(/.test(l));
  ok(sinks.length === 3 && sinks.every((l) => l.includes("connectLocal: () => net.connect(door.port, '127.0.0.1')")) && !/net\.connect\(lp/.test(MMsrc),
    'every push tunnel sink (the mount, the boot re-own, the health re-own) ends at the mount\'s door; none at the hub\'s port');
  await new Promise((r) => hub.close(r));
}

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
try { tokens._save?.(); } catch { }
fs.rmSync(tmp, { recursive: true, force: true });
report();
