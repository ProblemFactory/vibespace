#!/usr/bin/env node
// Path mounts (2.358.0): /svc/<name>/ reverse proxy — REAL http round trips
// against a live target: prefix strip, X-Forwarded-Prefix, Location rewrite,
// honest 404/502, no-trailing-slash canonical redirect, ws upgrade splice.
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── fake target service ──
const target = http.createServer((req, res) => {
  if (req.url === '/redir') { res.writeHead(302, { location: '/login' }); return res.end(); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ path: req.url, prefix: req.headers['x-forwarded-prefix'] || null, host: req.headers.host }));
});
target.on('upgrade', (req, socket) => {
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
  socket.write('ECHO:' + req.url);
});
await new Promise((r) => target.listen(0, '127.0.0.1', r));
const tPort = target.address().port;

// ── the module under test, against a stub forwards registry ──
// authed is flipped by the tests: /svc is EXEMPT from the global cookie
// middleware, so THESE per-mount checks are the only gate for private mounts
let authed = true;
const registry = { app: { pathMount: 'app', localPort: tPort }, dead: { pathMount: 'dead', localPort: null }, pub: { pathMount: 'pub', localPort: tPort, pathPublic: true } };
const pm = require(REPO + '/src/server/path-mounts.js').create({
  getPortForwards: () => ({ pathMountTarget: (name) => (registry[name] ? { localPort: registry[name].localPort, rec: registry[name] } : null) }),
  requestAuthed: () => authed,
});
const express = require(path.join(REPO, 'node_modules/express'));
const app = express();
app.use('/svc', pm.handler);
const srv = http.createServer(app);
srv.on('upgrade', (req, socket, head) => { if ((req.url || '').startsWith('/svc/')) pm.handleUpgrade(req, socket, head); else socket.destroy(); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const get = (p, opts = {}) => fetch(`http://127.0.0.1:${port}${p}`, { redirect: 'manual', ...opts });

// prefix strip + forwarded headers
let r = await get('/svc/app/api/x?q=1');
let j = await r.json();
ok(r.status === 200 && j.path === '/api/x?q=1', 'prefix stripped, query preserved', JSON.stringify(j));
ok(j.prefix === '/svc/app', 'X-Forwarded-Prefix carries the mount');
ok(String(j.host).startsWith('127.0.0.1:'), 'Host rewritten to the local target');
// root form
j = await (await get('/svc/app/')).json();
ok(j.path === '/', 'mount root maps to target root');
// canonical redirect without trailing slash
r = await get('/svc/app');
ok(r.status === 302 && r.headers.get('location') === '/svc/app/', 'no-slash form redirects to the canonical /svc/app/');
// Location rewrite (the classic login bounce)
r = await get('/svc/app/redir');
ok(r.status === 302 && r.headers.get('location') === '/svc/app/login', 'absolute-path redirect rewritten under the mount', r.headers.get('location'));
// honest failures
r = await get('/svc/nope/');
ok(r.status === 404, 'unknown mount = 404');
r = await get('/svc/dead/');
ok(r.status === 502 && /not active/.test((await r.json()).error || ''), 'mounted-but-down forward = honest 502');
// per-mount auth (2.359.0): the /svc prefix is middleware-exempt, so these
// checks ARE the security boundary — pin both sides
authed = false;
r = await get('/svc/app/');
ok(r.status === 401, 'PRIVATE mount without a login = 401 (the only gate — /svc is middleware-exempt)');
r = await get('/svc/pub/');
ok(r.status === 200 && (await r.json()).path === '/', 'PUBLIC mount serves WITHOUT a login');
const wsDenied = await new Promise((resolve) => {
  const sock = net.connect(port, '127.0.0.1', () => sock.write(`GET /svc/app/ws HTTP/1.1\r\nhost: x\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n`));
  let buf = ''; sock.on('data', (d) => { buf += d; }); sock.on('close', () => resolve(buf)); sock.on('error', () => resolve(buf));
  setTimeout(() => { sock.destroy(); }, 2000);
});
ok(/401/.test(wsDenied), 'PRIVATE mount ws upgrade without a login = 401', wsDenied.slice(0, 40));
authed = true;
// ws upgrade splice
const wsResp = await new Promise((resolve, reject) => {
  const sock = net.connect(port, '127.0.0.1', () => {
    sock.write(`GET /svc/app/ws HTTP/1.1\r\nhost: x\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n`);
  });
  let buf = '';
  sock.on('data', (d) => { buf += d; if (buf.includes('ECHO:')) { sock.destroy(); resolve(buf); } });
  sock.on('error', reject);
  setTimeout(() => reject(new Error('ws timeout: ' + buf)), 4000);
});
ok(/101 Switching Protocols/.test(wsResp) && wsResp.includes('ECHO:/ws'), 'ws upgrade spliced with the prefix stripped', wsResp.slice(0, 80));

// setPathMount store rules (validation + uniqueness) on the real manager
{
  const os = await import('node:os'); const fs = await import('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pm-'));
  const { PortForwardManager } = require(REPO + '/src/port-forward.js');
  const pf = new PortForwardManager({ dataDir: dir, hosts: {}, log: () => { } });
  pf._state.forwards.push({ id: 'pf-a', hostId: '__local__', remotePort: 1234 }, { id: 'pf-b', hostId: '__local__', remotePort: 5678 });
  ok(pf.setPathMount('pf-a', 'myapp').pathMount === 'myapp', 'setPathMount stores a valid name');
  let threw = null; try { pf.setPathMount('pf-b', 'myapp'); } catch (e) { threw = e.message; }
  ok(/already mounted/.test(threw || ''), 'duplicate name refused with the owner named', threw);
  threw = null; try { pf.setPathMount('pf-b', 'Bad_Name'); } catch (e) { threw = e.message; }
  ok(/lowercase/.test(threw || ''), 'invalid name refused');
  ok(pf.setPathMount('pf-a', null).pathMount === null, 'unmount clears');
  ok(pf.pathMountTarget('myapp') === null, 'cleared mount resolves to null');
}

target.close(); srv.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
