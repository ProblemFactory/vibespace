#!/usr/bin/env node
// test-push-mount-door — lane lg-remote-hardening, row B-7f0b (the coordinator's r1220 (1) + r1317): A PUSH MOUNT's REVERSE TUNNEL
// ENDS AT A DOOR OF ITS OWN (src/server/push-mount-door.js), never the hub's whole web port; A PATH WITH A DOT SEGMENT IS NEVER
// A DOOR (src/path-dot-segment.js). FAST: real listeners on loopback, a real MountTokens store and a real Auth in a temp folder,
// the device's tunnel stood in (its connectLocal captured and dialled here).
//   ① the PURE verdicts: a door's path (/dav and under it only; no backslash, no dot segment); the dot segment, raw / escaped /
//      once decoded (the query not judged)
//   ② a real door bound to ONE mount's pass, handing to the hub's one app (registered as the wiring module does; none ⇒ refused):
//      anything but that mount's files is refused (404 — the sign-in page is not there); no pass, or another mount's (Bearer
//      or Basic), 401; that mount's own pass reaches its files; EVERY request on a kept connection is judged; an Upgrade is
//      answered as a plain request; a dot segment with the own pass: refused by name AT the door (the app never sees it);
//      close() ends a request in flight (RED: a door that only stops listening waits on it)
//   ③ THE WIRING, driven: MachineMounts._davBase over a stand-in device — the tunnel's connectLocal reaches the door, not the hub
//      (RED: the release's tunnel end, a copy: net.connect(lp), serves the sign-in page); the re-own road (_doorOf) binds the
//      door to the record's own pass, ONE door for two re-owns at once (RED: the open awaited before the map is set ⇒ two);
//      a record with no pass id said once; no hub app ⇒ the refusal a page can word
//   ④ THE DOT-SEGMENT LAW on the hub's port, SIGNED OUT (the real auth layer, the real public files' handler, the /dav route):
//      every door prefix with a dot segment, raw and escaped, is refused by name, never 200 (RED: the release's auth layer, a
//      copy, serves the app's own page through it); the signed-in page still loads
//   ⑤ (r1382) ONLY WHAT CAN SPELL A DOT SEGMENT is read: a bare «%», a Latin-1 / GBK / Shift_JIS escape through the proxy road,
//      a served folder and the files API goes on exactly as on the release (RED: the verdict that counted an undecodable escape
//      as a dot segment refuses them all); ③ also: an unmount while a re-own's door opens ⇒ no forward (RED: the unguarded re-own)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { anchored } from './scratch.mjs';   // FIRST after node's own (§113: a suite runs on a temp home before any of its code)
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-push-mount-door-'));
const M = mutantCopies('push-mount-door', REPO);
const MD = require('../src/server/push-mount-door.js');
const PD = require('../src/path-dot-segment.js');
const MW = require('../src/mount-error-words.js');
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
// a promise's answer within a bound (its timer cleared either way) — undefined when the bound came first
const within = (p, ms) => { let t; return Promise.race([p, new Promise((r) => { t = setTimeout(r, ms); })]).finally(() => clearTimeout(t)); };
const until = async (cond) => { for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 5)); return cond(); };
const UPGRADE = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13' };
const DOTTED = ['../index.html', '%2e%2e/index.html', '%2E./index.html', '..%2Findex.html', './../index.html'];   // raw, escaped, once decoded
const basic = (t) => ({ Authorization: 'Basic ' + Buffer.from('vibespace:' + t).toString('base64') });

console.log('① the PURE verdicts');
{
  const yes = ['/dav', '/dav/', '/dav/a/b.txt', '/dav/x?y=1', '/dav/.hidden'], no = ['/', '/login', '/api/sessions', '/davx', '/dav\\x', '/dav/%5cx', '/agent', '', ...DOTTED.map((d) => '/dav/' + d)];
  ok(yes.every(MD.onDoor) && !no.some(MD.onDoor), 'a mount\'s door lets /dav and under it pass, nothing else (no backslash, raw or encoded; no dot segment)', { yes, no });
  const dot = ['/dav/..', '/dav/.', '/dav/x/../y', '/dav/%2e%2e/x', '/dav/%2E/x', '/dav/.%2e/x', '/dav/..%2fx', '/dav/x%2f..%2fy', '/dav/..\\x', '/dav/x%5c..%5cy', '/api/agent/%2e%2e/login', '/dav/%zz/../x'];
  const clean = ['/dav/.hidden', '/dav/a..b', '/dav/..x/y', '/dav/x.%2e', '/dav/notes.txt?p=/../x', '/api/agent/jobs/a%2Fb', '/', '/index.html', '/dav/%zz/x', '/dav/%252e%252e/x', '/svc/app/100%', '/proxy/https://legacy.example/caf%E9.html', '/dav/%C4%E3.txt'];
  ok(dot.every(PD.dotSegment) && !clean.some(PD.dotSegment) && PD.refusal().status === 400 && PD.refusal().body.code === 'path_dot_segment',
    `a dot segment, raw or spelled with the escapes of a dot, a slash or a backslash (%2e, ..%2f, %5c), a backslash a separator too: ${dot.length} judged one; ${clean.length} are not — names with dots, a query, a bare «%», an escape that is not UTF-8 or does not decode, a twice-escaped dot (the refusal: 400 path_dot_segment)`, { dot: dot.filter((x) => !PD.dotSegment(x)), clean: clean.filter(PD.dotSegment) });
  ok(/require\('\.\.\/path-dot-segment\.js'\)/.test(read('src/server/agent-listener.js')) && /PD\.dotSegment\(p\)/.test(read('src/server/agent-listener.js')) && !/\\\/\\\.\\\.\?/.test(read('src/server/agent-listener.js').split('function allowed')[1].split('\n}')[0]),
    'ONE verdict: the agent door asks it (its own dot-segment test is gone; its legs, test-agent-door, unchanged)');
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
const seen = [];
hubApp.use((req, _res, next) => { seen.push(req.url); next(); });
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
  const otherBasic = await ask(door.port, { url: '/dav/notes.txt', headers: basic(B.raw) });
  ok(otherBasic.status === 401, `another mount's pass by Basic: 401 (${otherBasic.status})`);
  // EVERY request is judged: three on ONE kept connection — the own pass, then the sign-in page, then no pass
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const askKept = (o) => new Promise((resolve) => {
    const q = http.request({ host: '127.0.0.1', port: door.port, agent, method: o.method || 'GET', path: o.url, headers: o.headers || {} }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b, reused: q.reusedSocket })); });
    q.on('error', (e) => resolve({ status: 0, body: String(e && e.message) })); q.end();
  });
  const k1 = await askKept({ method: 'PROPFIND', url: '/dav/', headers: { Depth: '0', ...bearer(A.raw) } }), k2 = await askKept({ url: '/login' }), k3 = await askKept({ method: 'PROPFIND', url: '/dav/', headers: { Depth: '0' } });
  agent.destroy();
  ok(k1.status === 207 && k2.reused && k2.status === 404 && k3.reused && k3.status === 401,
    `every request on a kept connection is judged: the own pass ${k1.status}, then the sign-in page ${k2.status}, then no pass ${k3.status} (the same socket: ${!!k2.reused}, ${!!k3.reused})`);
  // an Upgrade is a plain request (no upgrade listener): judged as one
  const u1 = await ask(door.port, { url: '/login', headers: UPGRADE }), u2 = await ask(door.port, { url: '/dav/notes.txt', headers: { ...UPGRADE, ...bearer(B.raw) } });
  ok(u1.status === 404 && !/sign in/.test(u1.body) && u2.status === 401, `an Upgrade is answered as a plain request, never upgraded: the sign-in page ${u1.status}, another mount's pass ${u2.status}`);
  // r1317: a dot segment with the mount's OWN pass — refused by name AT the door, the app never sees it
  seen.length = 0;
  const dots = [];
  for (const d of DOTTED) dots.push([d, await ask(door.port, { url: '/dav/' + d, headers: bearer(A.raw) })]);
  ok(dots.every(([, x]) => x.status === 400 && JSON.parse(x.body || '{}').code === 'path_dot_segment') && seen.length === 0,
    `a dot segment through the door, with the mount's own pass (${DOTTED.length} spellings): refused by name (${[...new Set(dots.map(([, x]) => x.status))].join(', ')} path_dot_segment) before the app — it saw ${seen.length}`, dots.filter(([, x]) => x.status !== 400).map(([d, x]) => [d, x.status]));
  await door.close();
}
{
  // r1317 (3): close() ends a request in flight — the unmount waits on nothing (its pass is already revoked)
  const DSRC = read('src/server/push-mount-door.js');
  const closeLeg = async (Mod, bound) => {
    const held = [];
    Mod.setApp((req, res) => { held.push(res); });   // a request the app never answers (a read stuck on slow storage)
    const d = await Mod.open({ tokens, tokenId: A.rec.id });
    const pending = ask(d.port, { url: '/dav/notes.txt', headers: bearer(A.raw) });
    await until(() => held.length === 1);
    const closing = d.close().then(() => 'closed');
    const quick = await within(closing, bound);
    for (const res of held) { try { res.setHeader('Connection', 'close'); res.end(); } catch { /* already gone with its connection */ } }
    await closing; const got = await pending;
    return { quick, got };
  };
  const tree = await closeLeg(MD, 2000);   // closes at once — the bound only stops a hang
  MD.setApp(hubApp);
  const Wait = M.load('src/server/push-mount-door.js', anchored(DSRC, 'server.close(() => r()); server.closeAllConnections();', 'server.close(() => r());', 'close-waits'), 'close-waits');
  const red = await closeLeg(Wait, 100);   // never closes while the request is held — 100 ms shows it (the suite's one fixed wait)
  ok(tree.quick === 'closed' && tree.got.status === 0 && red.quick === undefined,
    `close() ends a request in flight at once (closed: ${tree.quick === 'closed'}; the held request's connection ended: ${tree.got.status === 0}); RED: a door that only stops listening still waits on it, 100 ms on (${red.quick === undefined})`);
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
  const d2 = await tree.mm._doorOf({ id: 'mm-1', hostId: 'hA', tokenId: A.rec.id });
  const own2 = await ask(d2.port, { method: 'PROPFIND', url: '/dav/', headers: { Depth: '0', ...bearer(A.raw) } }), other2 = await ask(d2.port, { method: 'PROPFIND', url: '/dav/', headers: { Depth: '0', ...bearer(B.raw) } });
  ok(own2.status === 207 && other2.status === 401 && (await tree.mm._doorOf({ id: 'mm-1', hostId: 'hA', tokenId: A.rec.id })) === d2, 'the re-own road (_doorOf): the record\'s door, once, bound to the record\'s own pass');
  await d2.close();
  ok(read('src/server/mounts-plugins-wiring.js').includes("require('./push-mount-door.js').setApp(app);") && !/express\(\)/.test(read('src/server/push-mount-door.js')), 'the hub registers its ONE app with the door (the wiring module); the door builds no app of its own');
  // r1317 (2): two re-owns of one record at once (the link's heal and the health sweep) share ONE door
  const MMmod = require('../src/machine-mounts.js');
  const race = async (Mod) => {
    const mm = new Mod.MachineMounts({ dataDir: fs.mkdtempSync(path.join(tmp, 'mm-')), hosts: { get: () => ({ id: 'hA', transport: 'dial' }) }, mountTokens: tokens, localPort: () => hubPort, log: () => { } });
    const rec = { id: 'mm-race', hostId: 'hA', tokenId: A.rec.id };
    const [x, y] = await Promise.all([mm._doorOf(rec), mm._doorOf(rec)]);
    await x.close(); if (y !== x) await y.close();
    return x === y;
  };
  const doorOfNow = MMsrc.slice(MMsrc.indexOf('  _doorOf(rec) {'), MMsrc.indexOf('\n  }\n', MMsrc.indexOf('  _doorOf(rec) {')) + 4);
  const Awaited = M.load('src/machine-mounts.js', anchored(MMsrc, doorOfNow, "  async _doorOf(rec) {\n    if (!this._doors) this._doors = new Map();\n    let d = this._doors.get(rec.id);\n    if (!d) { d = await MD.open({ tokens: this.mountTokens, tokenId: rec.tokenId, log: this.log }); this._doors.set(rec.id, d); }\n    return d;\n  }\n", 'door-awaited'), 'door-awaited');   // the unit's first form (e1ba1be65), quoted for its RED (stale-pins: kept)
  const one = await race(MMmod), two = await race(Awaited);
  ok(one && !two, `two re-owns of one record at once share ONE door (the pending open kept in the map); RED: the open awaited before the map is set opens two (${two ? 'one' : 'two'})`);
  // r1317 (4): a record with no pass id — its door serves no pass, said ONCE in the journal
  {
    const said = [];
    const mm = new MMmod.MachineMounts({ dataDir: fs.mkdtempSync(path.join(tmp, 'mm-')), hosts: { get: () => ({ id: 'hA', transport: 'dial' }) }, mountTokens: tokens, localPort: () => hubPort, log: (m) => said.push(String(m)) });
    const rec = { id: 'mm-nopass', hostId: 'hA', tokenId: null };
    const d = await mm._doorOf(rec);
    const r401 = await ask(d.port, { method: 'PROPFIND', url: '/dav/', headers: { Depth: '0', ...bearer(A.raw) } });
    await d.close(); mm._doors.delete(rec.id);
    const d3 = await mm._doorOf(rec); await d3.close();
    const lines = said.filter((l) => l.includes('mm-nopass') && /names no pass/.test(l));
    ok(r401.status === 401 && lines.length === 1, `a record with no pass id: its door answers 401 (${r401.status}) and the journal says why ONCE (${lines.length} line over two opens: «${lines[0] || ''}»)`);
  }
  // r1317 (5): no hub app registered ⇒ the push is refused in words a page can show (the code's zh / ja rows: test-mount-error-words)
  {
    MD.setApp(null);
    let e5 = null; try { await tree.mm._davBase('hA'); } catch (e) { e5 = e; }
    MD.setApp(hubApp);
    const body = e5 && MW.errorBody(e5);
    ok(!!e5 && e5.code === 'mount_door_unavailable' && e5.message === MW.wordsFor('mount_door_unavailable', {}) && body && body.code === 'mount_door_unavailable',
      `no hub app registered: the push is refused by its code, worded («${e5 && e5.message}»)`);
  }
  // r1382 (1): an unmount while a re-own's door is still opening — the re-own forwards nothing toward the closed door
  {
    const realOpen = MD.open;
    const reownLeg = async (Mod) => {
      const forwards = [];
      let release = null;
      MD.setApp(hubApp);
      MD.open = (o) => new Promise((r) => { release = () => r(realOpen(o)); });   // the door's open held, so the unmount lands inside it
      try {
        const dm = { reverseForward: async (o) => { forwards.push(o.port); return { port: o.port }; }, reverseUnforward: async () => { } };
        const mm = new Mod.MachineMounts({ dataDir: fs.mkdtempSync(path.join(tmp, 'mm-')), hosts: { get: () => ({ id: 'hA', transport: 'dial' }), deviceBounded: async () => dm, dataPlaneOn: () => true }, mountTokens: tokens, localPort: () => hubPort, log: () => { } });
        const rec = { id: 'mm-gone', dir: 'push', hostId: 'hA', tunnelPort: 47002, tokenId: A.rec.id };
        mm._state.mounts.push(rec);
        mm._healLinked('hA');   // the link's heal: the push record's re-own starts and its door is opening
        await until(() => !!release);
        // the unmount's own steps while the door opens: the record goes, its door is taken out of the map and closed once open
        mm._state.mounts.splice(mm._state.mounts.indexOf(rec), 1);
        const opening = mm._doors.get(rec.id); mm._doors.delete(rec.id);
        release();
        await (await opening).close();
        for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
        return { forwards: forwards.length, owned: mm._pushTunnelOwned.has(rec.id) };
      } finally { MD.open = realOpen; }
    };
    const tree = await reownLeg(MMmod);
    const gStart = MMsrc.indexOf('          .then((dm) => this._doorOf(rec).then((door) => (this._stillMounted(rec.id)'), gEndMark = "this._pushRetryAt.delete(rec.id); })\n";
    const guarded = MMsrc.slice(gStart, MMsrc.indexOf(gEndMark, gStart) + gEndMark.length);
    const Unguarded = M.load('src/machine-mounts.js', anchored(MMsrc, guarded, "          .then((dm) => this._doorOf(rec).then((door) => dm.reverseForward({ port: rec.tunnelPort, connectLocal: () => net.connect(door.port, '127.0.0.1') })))\n          .then(() => { this._pushTunnelOwned.add(rec.id); this._pushRetryAt.delete(rec.id); })\n", 'reown-unguarded'), 'reown-unguarded');   // the first form's re-own, quoted for its RED (stale-pins: kept)
    const red = await reownLeg(Unguarded);
    ok(tree.forwards === 0 && !tree.owned && red.forwards === 1 && (MMsrc.match(/this\._stillMounted\(rec\.id\)/g) || []).length === 2,
      `an unmount while a re-own's door is opening: the re-own forwards nothing toward the closed door (${tree.forwards}) and owns nothing; RED: the unguarded re-own forwards (${red.forwards}); both re-owns (the link's heal, the health sweep) ask after the open`);
  }
  const sinks = MMsrc.split('\n').filter((l) => /\.reverseForward\(/.test(l));
  ok(sinks.length === 3 && sinks.every((l) => l.includes("connectLocal: () => net.connect(door.port, '127.0.0.1')")) && !/net\.connect\(lp/.test(MMsrc),
    'every push tunnel sink (the mount, the boot re-own, the health re-own) ends at the mount\'s door; none at the hub\'s port');
  await new Promise((r) => hub.close(r));
}

// ONE password hash for the suite (scrypt): every sign-in layer below starts from a copy of the seed's auth.json
const AUTH_SEED = fs.mkdtempSync(path.join(tmp, 'auth-seed-'));
new (require('../src/auth.js').Auth)(AUTH_SEED).setPassword('pw-' + crypto.randomBytes(6).toString('hex'));
const authDir = () => { const d = fs.mkdtempSync(path.join(tmp, 'auth-')); fs.copyFileSync(path.join(AUTH_SEED, 'auth.json'), path.join(d, 'auth.json')); return d; };
console.log('④ THE DOT-SEGMENT LAW on the hub\'s port, signed out');
{
  const AUTH_SRC = read('src/auth.js');
  const SP = require('../src/server/static-public.js');
  const pub = path.join(tmp, 'public'); fs.mkdirSync(pub);
  fs.writeFileSync(path.join(pub, 'index.html'), '<!doctype html><title>THE APP SHELL</title>');
  // the hub's order (server.js): the auth layer FIRST, the public files' handler, then the /dav route
  const hubPort4 = async (AuthMod) => {
    const auth = new AuthMod.Auth(authDir());
    const app = express();
    app.use(auth.middleware());
    app.use(SP.create(pub));
    registerWebdav(app, { tokens });
    app.use((_q, res) => res.status(404).json({ error: 'no route' }));
    const srv = http.createServer(app);
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    return { port: srv.address().port, cookie: { cookie: `vs_token=${auth.issueToken('owner-ua')}` }, close: () => new Promise((r) => { srv.close(() => r()); srv.closeAllConnections(); }) };
  };
  const PREFIXES = ['/dav/', '/api/agent/', '/vibespace-node/', '/svc/', '/otel/', '/p/', '/hook/', `/frame-host/f/${'A'.repeat(24)}/`];
  const sweep = async (I) => { const out = []; for (const pre of PREFIXES) for (const d of DOTTED) out.push([pre + d, await ask(I.port, { url: pre + d })]); return out; };
  const I = await hubPort4(require('../src/auth.js'));
  const got = await sweep(I);
  const shell = await ask(I.port, { url: '/index.html', headers: I.cookie }), outShell = await ask(I.port, { url: '/index.html' });
  await I.close();
  const bad = got.filter(([, x]) => !(x.status === 400 && JSON.parse(x.body || '{}').code === 'path_dot_segment'));
  ok(bad.length === 0 && got.every(([, x]) => !/THE APP SHELL/.test(x.body)),
    `signed out: ${PREFIXES.length} door prefixes × ${DOTTED.length} spellings (raw, %2e, ..%2f) = ${got.length} requests, each refused by name (400 path_dot_segment), none the app's page`, bad.slice(0, 6).map(([u, x]) => [u, x.status]));
  ok(shell.status === 200 && /THE APP SHELL/.test(shell.body) && !/THE APP SHELL/.test(outShell.body),
    `the gate itself: the page loads signed in (${shell.status}); signed out, its own address is the gate's (${outShell.status})`);
  const gateLine = AUTH_SRC.split('\n').find((l) => l.includes('if (PD.dotSegment(req.originalUrl || req.url))')) + '\n';
  const Rel = M.load('src/auth.js', anchored(AUTH_SRC, gateLine, '', 'release-auth'), 'release-auth');
  const R = await hubPort4(Rel);
  const rgot = await sweep(R);
  await R.close();
  const served = rgot.filter(([, x]) => x.status === 200 && /THE APP SHELL/.test(x.body)).map(([u]) => u);
  ok(served.includes('/dav/../index.html') && served.includes('/dav/%2e%2e/index.html'),
    `RED (the release's auth layer, a copy): signed out, ${served.length} of ${rgot.length} dotted door paths served the app's page (200) — /dav/../index.html among them`, served.slice(0, 8));
  // THE ORDER (round w0z9ourlm): the refusal MOVED below the door class (a copy) lets a door's prefix carry a dot segment through again
  const passLine = AUTH_SRC.split('\n').find((l) => l.includes('if (PASSES.has(d.kind)) return next();')) + '\n';
  const Below = M.load('src/auth.js', anchored(anchored(AUTH_SRC, gateLine, '', 'below-door-class-cut'), passLine, passLine + gateLine, 'below-door-class'), 'below-door-class');
  const BH = await hubPort4(Below);
  const bgot = [];
  for (const u of ['/dav/../index.html', '/dav/%2e%2e/index.html']) bgot.push([u, await ask(BH.port, { url: u })]);   // two requests show the order
  await BH.close();
  const bserved = bgot.filter(([, x]) => x.status === 200 && /THE APP SHELL/.test(x.body)).map(([u]) => u);
  ok(bserved.includes('/dav/../index.html') && bserved.includes('/dav/%2e%2e/index.html'),
    `RED (the refusal moved BELOW the door class, a copy): signed out, /dav/../index.html and its escaped spelling served the app's page again (${bserved.length} of 2) — the order (the held block, the refusal, then the door class) is the law's`, bserved.slice(0, 6));
}

console.log('⑤ A PATH THE VERDICT CANNOT SPELL A DOT SEGMENT IN GOES ON EXACTLY AS ON THE RELEASE (r1382)');
{
  const AUTH_SRC5 = read('src/auth.js'), PD_SRC = read('src/path-dot-segment.js');
  const SP5 = require('../src/server/static-public.js');
  const pub5 = path.join(tmp, 'public5'); fs.mkdirSync(pub5);
  fs.writeFileSync(path.join(pub5, 'index.html'), '<!doctype html><title>THE APP SHELL</title>');
  const seen5 = [];
  const road = (name) => (req, res) => { seen5.push(name + ' ' + req.originalUrl); res.status(200).json({ road: name }); };
  // the hub's order and the roads' own mount forms (server.js: unblocker by app.use, /svc by app.use; src/routes/files.js: a
  // router.get with its * param) — each road stood in by a handler that says it was reached
  const hub5 = async (AuthMod) => {
    const auth = new AuthMod.Auth(authDir());
    const app = express();
    app.use(auth.middleware());
    app.use(SP5.create(pub5));
    app.use('/proxy/', road('proxy'));
    app.use('/svc', road('svc'));
    app.get('/api/file/serve/*', road('files'));
    app.use((_q, res) => res.status(404).json({ error: 'no route' }));
    const srv = http.createServer(app);
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    return { port: srv.address().port, cookie: { cookie: `vs_token=${auth.issueToken('owner-ua')}` }, close: () => new Promise((r) => { srv.close(() => r()); srv.closeAllConnections(); }) };
  };
  // a person's real requests: an older site's Latin-1 / GBK / Shift_JIS names through the proxy, a served folder's file with a
  // name that is not UTF-8 or a bare «%», the files API with the same
  const ODD = ['/proxy/https://legacy.example/docs/caf%E9.html', '/proxy/http://old.example/%C4%E3%BA%C3.html', '/proxy/http://old.example/%82%A0.html',
    '/svc/files/caf%E9.txt', '/svc/app/100%', '/svc/files/50%_off.txt', '/api/file/serve/tmp/caf%E9.txt', '/api/file/serve/tmp/100%.txt'];
  const askAll = async (I) => { const out = []; for (const u of ODD) out.push(await ask(I.port, { url: u, headers: I.cookie })); return out; };
  const T = await hub5(require('../src/auth.js'));
  seen5.length = 0; const tip = await askAll(T); const reached = [...seen5]; await T.close();
  const gateLine = AUTH_SRC5.split('\n').find((l) => l.includes('if (PD.dotSegment(req.originalUrl || req.url))')) + '\n';
  const R = await hub5(M.load('src/auth.js', anchored(AUTH_SRC5, gateLine, '', 'release-auth5'), 'release-auth5'));
  const rel = await askAll(R); await R.close();
  const same = ODD.filter((u, i) => tip[i].status === rel[i].status && !/path_dot_segment/.test(tip[i].body));
  const roads = ODD.filter((u) => !u.startsWith('/api/file/serve/'));
  ok(same.length === ODD.length && roads.every((u) => reached.includes((u.startsWith('/proxy/') ? 'proxy ' : 'svc ') + u)),
    `${ODD.length} requests with a bare «%» or an escape that is not UTF-8, signed in: each answered as on the release (${tip.map((x) => x.status).join(' ')}), never the gate's refusal — the proxy road and the served folder reached (${roads.filter((u) => reached.some((x) => x.endsWith(' ' + u))).length} of ${roads.length}); the files API's own * param answers as it did`, ODD.filter((u) => !same.includes(u)));
  // RED: the verdict that decoded the whole path and counted a throw as a dot segment (the cure's first form, f6c78fade)
  const newBody = "  return SEGMENT.test(p.replace(SPELL, (_, h) => SPELLED[h.toLowerCase()]));\n";
  const oldPath = M.write('src/path-dot-segment.js', anchored(PD_SRC, newBody, "  if (SEGMENT.test(p)) return true;\n  let dec; try { dec = decodeURIComponent(p); } catch { return true; }\n  return SEGMENT.test(dec);\n", 'decode-throws'), 'decode-throws');   // the first form, quoted for its RED (stale-pins: kept)
  const O = await hub5(M.load('src/auth.js', anchored(AUTH_SRC5, "require('./path-dot-segment.js')", `require(${JSON.stringify(oldPath)})`, 'decode-throws'), 'decode-throws'));
  const old = await askAll(O); await O.close();
  ok(old.every((x) => x.status === 400 && /path_dot_segment/.test(x.body)),
    `RED (the verdict that counted an escape it could not decode as a dot segment): all ${ODD.length} refused at the sign-in gate (${old.map((x) => x.status).join(' ')})`);
}

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
try { tokens._save?.(); } catch { }
fs.rmSync(tmp, { recursive: true, force: true });
report();
