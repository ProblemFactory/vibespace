#!/usr/bin/env node
// THE REVERSE TUNNEL'S OWN DOOR (lane lg-remote-hardening, B-7f0b — design q-042 D8b). A remote conversation's tunnel used
// to end at the hub's WHOLE http server on loopback (the login page, /otel, /hook, every page route): a hostile device was a
// local caller of all of it. Now it ends at src/server/agent-listener.js — /api/agent/… and /api/editor/open only.
// Legs: ① the PURE door (dot segments, doubled slashes, look-alikes; a job name's encoded slash) · ② a REAL listener over a
// stand-in app (the agent route reaches the app, the login page does not; an upgrade is answered as a request; THE KEPT
// PORT across a restart, and a new one when it is taken) · ③ THE ROAD CENSUS: every hub path the shipped tools name (data/bin,
// the files copied there at boot, the generated helpers, the plugin shims) crosses the door — RED: a planted page route ·
// ④ EVERY tunnel end in the tree takes the door's port (the push mounts named apart) — RED: a planted end · RED: a copy
// that lets every path through fails ① and ②.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (typeof m !== 'string' || !m) throw new TypeError('ok(cond, name): the name is no string — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const AL = require('../src/server/agent-listener.js');

console.log('— ① PURE: the door —');
const IN = ['/api/agent/status', '/api/agent/task/progress?x=1', '/api/agent/channels/api/proposals/p1', '/api/agent/jobs/a%2Fb', '/api/editor/open', '/api/editor/open?f=1'];
const OUT = ['/login', '/', '/otel/v1/metrics', '/hook', '/api/hosts', '/api/home', '/api/agent', '/api/agentx', '/api/editor/open/x', '/api/home/x', '/api/agent/../login', '/api/agent/./x', '/api/agent/%2e%2e/login', '/api/agent/%2E%2E/login', '/api/agent%2flogin', '/api%2fagent/x', '/api/agent//x', '//api/agent/x', '/api/agent\\x', '/api/agent/jobs/x%2F..%2Fy', '/api/agent/jobs/a%2F%2Fb', '/api/agent/jobs/a%5Cb', 'api/agent/x', '', '/ws', '/api/vault/list'];
const pureLeg = (D) => ({ wrongIn: IN.filter((x) => !D.allowed(x)), wrongOut: OUT.filter((x) => D.allowed(x)) });
{
  const { wrongIn, wrongOut } = pureLeg(AL);
  ok(!wrongIn.length && !wrongOut.length, `PURE allowed(): ${IN.length} agent paths cross (a job name's encoded slash too); ${OUT.length} others do not — the login page, /otel, /hook, /api/home, page routes, look-alikes, dot segments (raw or after one decode), encoded prefixes, doubled slashes, a backslash raw or encoded`, { wrongIn, wrongOut });
}

console.log('— ② a REAL listener over a stand-in app —');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agent-door-'));
const get = (port, p, headers = {}) => new Promise((resolve) => { const r = http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }); r.on('error', (e) => resolve({ status: 0, err: e.code })); });
const UPGRADE = { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13' };
const listenLeg = async (D) => {
  const seen = [];
  const port = await D.start({ app: (req, res) => { seen.push(req.url); res.statusCode = 200; res.end('app'); }, log: () => { } });
  const a = await get(port, '/api/agent/status'), l = await get(port, '/login'), o = await get(port, '/otel/v1/metrics');
  const w = await get(port, '/ws', UPGRADE), wa = await get(port, '/api/agent/x', UPGRADE);
  await D.close();
  return { port, seen, a, l, o, w, wa };
};
{
  const r = await listenLeg(AL);
  ok(r.port > 0 && r.a.status === 200 && r.a.body === 'app' && r.seen[0] === '/api/agent/status', 'an agent route crosses the door to the hub\'s own app', r);
  ok(r.l.status === 404 && /not_on_the_agent_door/.test(r.l.body) && r.o.status === 404 && !r.seen.includes('/login') && !r.seen.some((u) => /otel/.test(u)), 'the login page and /otel answer 404 at the door — the app never sees them (a hostile device is no local caller of the hub)', { l: r.l, o: r.o });
  ok(r.w.status === 404 && r.wa.status === 200 && r.wa.body === 'app', 'an upgrade is answered as a plain request, never upgraded: a page path is 404, an agent path is the app\'s ordinary answer (no upgrade listener — none is added)', { w: r.w, wa: r.wa });
  ok(AL.tunnelPort(1234) === 1234, 'not listening ⇒ the hub\'s own port (a remote session keeps its tools)');
  // THE KEPT PORT: a remote ssh session survives a hub restart with its -R fixed in its argv
  const stateFile = path.join(tmp, 'agent-door.json');
  const logs = [];
  const p1 = await AL.start({ app: (req, res) => res.end('app'), log: (m) => logs.push(m), stateFile });
  ok(p1 >= AL.PORT_LO && p1 <= AL.PORT_HI && AL.tunnelPort(1234) === p1 && JSON.parse(fs.readFileSync(stateFile, 'utf8')).port === p1 && (fs.statSync(stateFile).mode & 0o777) === 0o600 && (await AL.ready()) === p1, `tunnelPort() = the door\'s own port once it listens — one OUTSIDE the ephemeral ranges (${AL.PORT_LO}–${AL.PORT_HI}: no outgoing connection holds it across a restart), KEPT (0600); ready() hands it`, { p1, logs });
  await AL.close();
  const p2 = await AL.start({ app: (req, res) => res.end('app'), log: (m) => logs.push(m), stateFile });
  ok(p2 === p1 && /its kept port/.test(logs[logs.length - 1]), 'a restart listens on the KEPT port: a session started before it still reaches its tools', { p1, p2, logs });
  await AL.close();
  const squat = net.createServer(); await new Promise((r2) => squat.listen(p1, '127.0.0.1', r2));
  const p3 = await AL.start({ app: (req, res) => res.end('app'), log: (m) => logs.push(m), stateFile });
  ok(p3 >= AL.PORT_LO && p3 <= AL.PORT_HI && p3 !== p1 && JSON.parse(fs.readFileSync(stateFile, 'utf8')).port === p3 && logs.some((m) => new RegExp(`kept port ${p1} is taken`).test(m)), 'a kept port that is taken: a new one, kept, and said once', logs);
  await AL.close(); squat.close();
  fs.writeFileSync(stateFile, JSON.stringify({ port: p3 }) + '\n');
  const p4 = await AL.start({ app: (req, res) => res.end('app'), log: () => { }, stateFile, avoid: p3 });
  ok(p4 > 0 && p4 !== p3, 'a kept port that is the hub\'s OWN port is never taken (the door would hold the hub\'s port)', { p3, p4 });
  await AL.close();
  ok((await AL.ready()) === 0, 'not started: ready() answers at once (a re-adoption never waits for nothing)');
  ok(read('src/server/agent-listener.js').includes("server.on('error', (e) => log(") && read('src/server/boot-restore.js').includes("  await require('./agent-listener.js').ready();"), 'once listening the door keeps an error listener (an accept error is said, never an uncaught exit); a re-adopted session waits for the door');
}

console.log('— ③ THE ROAD CENSUS: every hub path a shipped tool names crosses the door —');
// THE SHIP LIST: hosts.js HostManager.AGENT_TOOLS, each read where it lives in the tree (the files copied to data/bin at boot
// from src/, the status tool agent-tool-generators.js writes) — a built bundle in data/bin (the device agent's own, which
// talks to the hub over its dial link, never a tunnel) is no tool. A path counts after a quote, a backtick, a `}` or a `$VAR`.
const { HostManager } = require('../src/hosts.js');
const FROM = { 'vibespace-status': 'src/server/agent-tool-generators.js', 'vibespace-browser-verbs.js': 'src/browser-verbs.js', 'vibespace-browser-stuck.js': 'src/browser-stuck.js', 'vibespace-browser-passkey.js': 'src/browser-passkey.js', 'vibespace-browser-read-back.js': 'src/browser-read-back.js', 'agent-cli-text.js': 'src/agent-cli-text.js', 'cli-call.js': 'src/cli-call.js', 'fd-close.js': 'src/fd-close.js', 'vibespace-local-index.js': 'src/local-index.js' };
const SHIPPED = [...new Set(HostManager.AGENT_TOOLS.map((t) => FROM[t] || `data/bin/${t}`).concat(['src/server/agent-tool-generators.js']))];
// a road that is not a tunnel road, said by name: the `vibespace` CLI asks the hub on its OWN box (the local index's port)
const NOT_TUNNEL = new Map([['/api/home', ['data/bin/vibespace', 'the person\'s CLI asks the hub on its own box (the local index\'s port), never through a tunnel']]]);
const ROAD = /(?:['"`}]|\$\w+|\$\{[^}]*\})(\/(?:api|hook|otel|dav|svc)(?:\/[^'"`\s$?)<>,;]*)?)(?=['"`\s$?)<>,;]|$)/g;
const roadsOf = (texts) => {
  const paths = new Map();
  for (const [f, text] of texts) text.split('\n').forEach((l, i) => {
    if (/^\s*(?:\/\/|\*|#)/.test(l)) return; // a comment line names no road
    const code = l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1');
    for (const m of code.matchAll(ROAD)) { if (!paths.has(m[1])) paths.set(m[1], []); paths.get(m[1]).push(`${f}:${i + 1}`); }
  });
  return paths;
};
const saidApart = (x, at) => NOT_TUNNEL.has(x) && at.every((a) => a.startsWith(NOT_TUNNEL.get(x)[0] + ':'));
const outsideOf = (paths) => [...paths].filter(([x, at]) => !AL.allowed(x) && !AL.allowed(x.replace(/\/+$/, '')) && !saidApart(x, at)).map(([x, at]) => `${x} (${at.join(', ')})`);
{
  const missing = SHIPPED.filter((f) => !fs.existsSync(path.join(REPO, f)));
  ok(HostManager.AGENT_TOOLS.length >= 25 && !missing.length, `every one of the ${HostManager.AGENT_TOOLS.length} shipped tools is read where it lives (a tool with no file would hide its roads)`, missing);
  const texts = SHIPPED.filter((f) => !missing.includes(f)).map((f) => [f, read(f)]);
  const paths = roadsOf(texts);
  const outside = outsideOf(paths);
  ok(paths.size >= 100 && !outside.length, `${paths.size} distinct hub paths named by ${texts.length} shipped files — every one crosses the door, but ${NOT_TUNNEL.size} said by name (${[...NOT_TUNNEL.keys()].join(', ')})`, outside);
  ok(/'\/api\/agent\/plugin-tool\//.test(read('src/server/plugin-loader.js')), 'the plugin shims\' one road (src/server/plugin-loader.js writes it into each shim) is under /api/agent/');
  const planted = outsideOf(roadsOf([['planted', "const r = await fetch(`${API}/api/hosts`); // a tool that calls a page route"], ['planted2', "curl -s $HUB/hook/x"], ['data/bin/vibespace-task', "get(`${API}/api/home`)"]]));
  ok(planted.length === 3, 'RED CONTROL: a planted tool line calling a page route (after `${API}`), one after `$HUB`, and /api/home from a tool that is not the person\'s CLI are all seen outside the door', planted);
}

console.log('— ④ EVERY tunnel end in the tree takes the door\'s port —');
// LINE BY LINE over server.js and src/: a SINK line (a `.reverseForward(` call, an ssh -R `reverse:` template) names
// tunnelPort(PORT) on that line, or is a push mount's (its own form, said); the one place an ssh -R goes into an argv
// passes its caller's target. A sink written over two lines is red: the line that opens it must name its target.
const SINK = /\.reverseForward\(|reverse:\s*`/;
const PUSH = new Map([['src/machine-mounts.js', [/connectLocal: \(\) => net\.connect\(door\.port, '127\.0\.0\.1'\)/, 'a push mount\'s tunnel ends at ITS OWN door (src/server/push-mount-door.js: that mount\'s /dav for its own pass — test-push-mount-door)']]]);
const sinksOf = (f, text) => text.split('\n').map((l, i) => ({ f, at: i + 1, l })).filter((x) => !/^\s*(?:\/\/|\*)/.test(x.l) && SINK.test(x.l));
const badOf = (sinks) => sinks.filter((x) => !x.l.includes('tunnelPort(PORT)') && !(PUSH.has(x.f) && PUSH.get(x.f)[0].test(x.l))).map((x) => `${x.f}:${x.at}`);
const walk = (dir) => fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []);
{
  const files = ['server.js', ...walk('src')];
  const texts = files.map((f) => [f, read(f)]);
  const sinks = texts.flatMap(([f, t]) => sinksOf(f, t));
  const bad = badOf(sinks);
  const where = [...new Set(sinks.filter((x) => x.l.includes('tunnelPort(PORT)')).map((x) => x.f))].sort();
  ok(sinks.length >= 7 && !bad.length && ['server.js', 'src/server/boot-restore.js', 'src/spawn/dial.js', 'src/spawn/ssh.js'].every((f) => where.includes(f)), `${sinks.length} tunnel sinks in ${files.length} files: the session roads (${where.join(', ')}) end at tunnelPort(PORT); the push mounts in their one form`, bad);
  const pushes = texts.flatMap(([f, t]) => t.split('\n').map((l, i) => ({ f, at: i + 1, l })).filter((x) => /push\(\s*['"]-R['"]/.test(x.l)));
  ok(pushes.length === 1 && pushes[0].f === 'src/hosts.js' && /push\('-R', reverse\)/.test(pushes[0].l), 'the one place an ssh -R goes into an argv (hosts.js sshArgs) passes its caller\'s target', pushes.map((x) => `${x.f}:${x.at}`));
  const planted = badOf([
    ...sinksOf('planted', "await dm.reverseForward({ port: p, connectLocal: makeConn });"),
    ...sinksOf('planted2', "await dm.reverseForward({\n  port: p, connectLocal: () => require('net').connect(require('./agent-listener.js').tunnelPort(PORT), '127.0.0.1') });"),
    ...sinksOf('planted3', "const a = { reverse: `${rport}:localhost:${PORT}` };"),
    ...sinksOf('src/machine-mounts.js', "await dm.reverseForward({ port: 1, connectLocal: () => net.connect(PORT, '127.0.0.1') });"),
  ]);
  ok(planted.length === 4, 'RED CONTROL: a planted sink with a named connectLocal, one over two lines, an ssh -R to localhost, and a push-mount file\'s sink that is not the push form are each seen', planted);
  ok(/require\('\.\/agent-listener\.js'\)\.start\(\{ app, stateFile: path\.join\(rootDir, 'data', 'agent-door\.json'\), avoid: PORT \}\)/.test(read('src/server/mounts-plugins-wiring.js')), 'the hub starts the door over its own app, with its kept port, never on the hub\'s own');
}

console.log('— RED: a door that lets every path through —');
{
  const SRC = read('src/server/agent-listener.js');
  const anchor = '  return p.startsWith(AGENT_PREFIX);';
  ok(SRC.includes(anchor) && SRC.includes('  if (EXACT.has(p)) return true;\n'), 'control: the door\'s verdict (the anchors)');
  const M = mutantCopies('agent-door', REPO);
  const Mut = M.load('src/server/agent-listener.js', anchored(SRC, anchor, '  return true;', 'open'), 'open');
  const pure = pureLeg(Mut);
  const r = await listenLeg(Mut);
  ok(pure.wrongOut.length > 0 && r.l.status === 200 && r.seen.includes('/login'), `RED CONTROL: a copy that lets every path through fails ① (${pure.wrongOut.length} page paths would cross) and ② (the login page reaches the app)`, { wrongOut: pure.wrongOut.slice(0, 6), l: r.l });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
