#!/usr/bin/env node
// THE STREAM RELAYS + VIEWS REGISTRIES (rv-desktop-apps F-B4, lane dc-seams-desktop 2026-10-05). A picture-stream KIND
// is its own relay module (src/server/stream-relay-<kind>.js) + ONE line in src/server/stream-relays.js, and its own
// view module + ONE line in src/lib/stream-views.js; the ONE bridge (desktop-stream.js) and the desktop-app window ask
// the registries and spell no kind. PROOF: a FAKE third kind added through one line in a scratch registry copy reaches
// the REAL bridge (a live ws upgrade lands in the fake relay with the bridge's shared state) and the client factory;
// CONTROL: a bridge copy with the pre-lane hand list (`kind !== 'rfb' && kind !== 'xpra'`) restored refuses it 501.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const MUT = mutantCopies('srl', repo);
const scratch = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'srl-'));
const { WebSocket } = require('ws');

// ── the fake relay: its own file, one registration line ──
const fakeFile = path.join(scratch, 'stream-relay-fake.js');
fs.writeFileSync(fakeFile, `'use strict';
const calls = [];
function bridgeOf(ctx) { return (a) => { calls.push({ id: a.id, port: a.port, viewerId: a.viewerId, netem: a.netem, shared: Object.keys(ctx).sort() }); ctx.stats.opened++; a.ws.send('fake-hello'); }; }
module.exports = { STREAM_KIND: 'fake', serverName: 'fake server', maxMessageBytes: 1024, netem: false, bridgeOf, calls };
`);
const REG = path.join(repo, 'src/server/stream-relays.js');
const regSrc = read('src/server/stream-relays.js');
const anchor = "  require('./stream-relay-xpra.js'),\n";
ok(regSrc.split(anchor).length === 2, 'the registry lists the xpra relay once (the copy adds its line after it)');
const regCopy = regSrc.replace(anchor, anchor + `  require(${JSON.stringify(fakeFile)}),\n`);
const diff = regCopy.split('\n').filter((l) => !regSrc.split('\n').includes(l));
ok(diff.length === 1 && /stream-relay-fake\.js/.test(diff[0]), `the fake kind is ONE added line in the registry copy (${diff.length})`);
const m = new Module(REG, null); m.filename = REG; m.paths = Module._nodeModulePaths(path.dirname(REG)); m._compile(regCopy, REG); m.loaded = true;
require.cache[REG] = m;
const DS = require(path.join(repo, 'src/server/desktop-stream.js'));
ok(Object.keys(DS.STREAM_RELAYS).join() === 'rfb,xpra,fake', `the bridge sees the copy's kinds (${Object.keys(DS.STREAM_RELAYS)})`);

async function drive(dsMod, kind) {
  const log = { log() { }, warn() { } };
  const b = dsMod.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => ({ kind, port: 5999 }), log });
  const srv = http.createServer();
  srv.on('upgrade', (req, socket, head) => b.handleUpgrade(req, socket, head, dsMod.upgradeId(new URL(req.url, 'http://x').pathname)));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ws = new WebSocket(`ws://127.0.0.1:${srv.address().port}/api/desktop/fk1/stream?viewer=v1`);
  const out = await new Promise((resolve) => {
    const t = setTimeout(() => resolve({ timeout: true }), 4000);
    ws.on('message', (d) => { clearTimeout(t); resolve({ msg: String(d) }); });
    ws.on('unexpected-response', (req, res) => { clearTimeout(t); resolve({ status: res.statusCode }); });
    ws.on('error', () => { });
  });
  try { ws.terminate(); } catch { /* gone */ }
  await new Promise((r) => srv.close(r));
  return { out, stats: b.stats() };
}
const FAKE = require(fakeFile);
const r1 = await drive(DS, 'fake');
const c = FAKE.calls[0] || {};
ok(r1.out.msg === 'fake-hello' && c.id === 'fk1' && c.port === 5999 && c.viewerId === 'v1', `PROOF: a live upgrade for the fake kind lands in ITS relay through the real bridge (${JSON.stringify(r1.out)}, ${c.id}/${c.port}/${c.viewerId})`);
ok(['takeSeat', 'seatState', 'stats', 'closeOversize', 'lastClose', 'KA', 'onInput'].every((k) => (c.shared || []).includes(k)) && r1.stats.opened === 1, 'the relay is handed the ONE bridge\'s shared state (seats, stats, the named closes, the keepalive) — it owns none of its own');
ok(c.netem === null, 'a relay that declares no netem gets none (the dev-only knob is a declared cell)');
const r2 = await drive(DS, 'nope');
ok(r2.out.status === 501, `an unregistered kind is refused 501 by name (${JSON.stringify(r2.out)})`);
const r3 = await drive(DS, 'constructor');
ok(r3.out.status === 501, 'a prototype key is no kind (own rows only)');
ok(DS.WS_MAX_MESSAGE_BYTES === 16 * 1024 * 1024 + 8, 'the ws cap = the largest declared relay cap + a frame header (16 MiB + 8, as before)');

// CONTROL — the pre-lane hand list restored in a bridge copy: the same one-line kind is refused
const dsSrc = read('src/server/desktop-stream.js');
const gate = '    if (!Object.hasOwn(STREAM_RELAYS, target.kind)) {';
ok(dsSrc.split(gate).length === 2, 'the bridge\'s kind gate is spelled once (the control patches exactly it)');
const ctl = require(MUT.write('src/server/desktop-stream.js', dsSrc.replace(gate, "    if (target.kind !== 'rfb' && target.kind !== 'xpra') {"), 'handlist'));
const r4 = await drive(ctl, 'fake');
ok(r4.out.status === 501, `CONTROL: with the hand list restored the registered fake kind is refused 501 (${JSON.stringify(r4.out)}) — the registry is the gate`);

// ── the client twin: a view module + one line in src/lib/stream-views.js reaches the window's factory ──
const win = read('src/lib/desktop-app-window.js');
ok(/view = viewOf\(kind\)\(winInfo\.content, /.test(win) && !/createXpraView|createVncView|STREAM_KIND as/.test(win) && /ensureView\(streamKindOf\(r\)\)/.test(win), 'the desktop-app window makes its view ONLY through viewOf(<the record\'s kind>) and names no view module');
const esbuild = require('esbuild');
const viewsSrc = read('src/lib/stream-views.js');
const vAnchor = "  { kind: xpra.STREAM_KIND, create: xpra.createXpraView },\n";
ok(viewsSrc.split(vAnchor).length === 2, 'the views registry lists the xpra view once');
const viewsCopy = viewsSrc.replace(vAnchor, vAnchor + "  { kind: 'fake', create: () => 'fake-view' },\n");
const stub = { name: 'stub', setup(b) {
  b.onResolve({ filter: /^\.\/(vnc|xpra)-view\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: /vnc/.test(a.path) ? "export const STREAM_KIND = 'rfb'; export const createVncView = () => 'rfb-view';" : "export const STREAM_KIND = 'xpra'; export const createXpraView = () => 'xpra-view';", loader: 'js' }));
} };
const out = await esbuild.build({ stdin: { contents: viewsCopy, resolveDir: path.join(repo, 'src/lib'), loader: 'js' }, bundle: true, write: false, format: 'esm', plugins: [stub], logLevel: 'silent' });
const V = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
ok(V.viewOf('fake')() === 'fake-view' && V.viewOf('xpra')() === 'xpra-view' && V.viewOf('rfb')() === 'rfb-view', 'PROOF (client): the one-line fake view is what viewOf answers for its kind; the registered views keep theirs');
ok(V.viewOf('nope')() === 'rfb-view' && V.viewOf('constructor')() === 'rfb-view' && V.STATUS_KIND === 'rfb', 'an unregistered kind falls to the STATUS_KIND view, as before the registry (the bridge refuses it 501)');
fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
