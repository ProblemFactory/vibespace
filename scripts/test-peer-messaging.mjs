#!/usr/bin/env node
// Peer-messaging gate (2.344.0, B-0bf4). Pins the delivery primitive for
// Background Work owner notifications against a REAL unix-socket inbox
// standing in for the CLI's cross-session messaging server: registry scan
// (live-pid + key-file discovery, dead-pid and wrong-id rejection), the exact
// two-frame wire shape ({"type":"auth"} then {"type":"user"} — from the
// 2.1.229 binary's own injection recipe), dead-socket honesty, and the
// channel-lane event post with its ok-ack. All in a tmp dir; no real CLI.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { findPeer, postToPeer, postChannelEvent } = require('../src/peer-messaging.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-peer-'));
const sockPath = path.join(dir, 'inbox.sock');
const SID = 'aaaa1111-2222-3333-4444-555566667777';
const KEY = 'k'.repeat(64);

// registry fixtures: live record (our own pid), dead record, other-session record
fs.writeFileSync(path.join(dir, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: SID, messagingSocketPath: sockPath, name: 'test-peer', version: '2.1.229' }));
fs.writeFileSync(path.join(dir, `${process.pid}.abc123.key`), KEY + '\n');
fs.writeFileSync(path.join(dir, '99999999.json'), JSON.stringify({ pid: 99999999, sessionId: 'dead-conv', messagingSocketPath: '/nonexistent.sock' }));

// 1. registry scan
const peer = findPeer(SID, dir);
ok(peer && peer.socketPath === sockPath && peer.key === KEY && peer.name === 'test-peer', 'findPeer resolves live record + reads the published key file');
ok(findPeer('dead-conv', dir) === null, 'dead-pid registry record treated as absent');
ok(findPeer('no-such-conversation', dir) === null, 'NEGATIVE CONTROL: unknown conversation → null');
ok(findPeer(SID, path.join(dir, 'nope')) === null, 'missing registry dir → null, never throws');

// 2. wire shape against a real inbox server
const frames = [];
const server = net.createServer((conn) => {
  let buf = '';
  conn.on('data', (d) => {
    buf += d.toString();
    let i; while ((i = buf.indexOf('\n')) >= 0) { frames.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); }
  });
});
await new Promise((r) => server.listen(sockPath, r));
const r1 = await postToPeer(peer, 'job done: test message');
ok(r1.ok === true, 'postToPeer resolves ok against a listening inbox', r1.reason);
await new Promise((r) => setTimeout(r, 100));
ok(frames.length === 2 && frames[0].type === 'auth' && frames[0].token === KEY, 'first frame = auth with the published key');
ok(frames[1] && frames[1].type === 'user' && frames[1].message && frames[1].message.role === 'user' && frames[1].message.content === 'job done: test message', 'second frame = the documented user-message injection shape');
server.close();

// 3. dead socket honesty
const r2 = await postToPeer({ socketPath: path.join(dir, 'gone.sock'), key: null }, 'x');
ok(r2.ok === false && /socket error|timeout/.test(r2.reason || ''), 'dead socket → {ok:false, reason}, never throws');

// 4. channel-lane event post (ok-ack protocol)
const chSock = path.join(dir, 'chan.sock');
const got = [];
const chServer = net.createServer((conn) => {
  let buf = '';
  conn.on('data', (d) => {
    buf += d.toString();
    let i; while ((i = buf.indexOf('\n')) >= 0) { got.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); conn.write('ok\n'); }
  });
});
await new Promise((r) => chServer.listen(chSock, r));
const r3 = await postChannelEvent(chSock, 'event body', { kind: 'background_job' });
ok(r3.ok === true && got.length === 1 && got[0].content === 'event body' && got[0].meta.kind === 'background_job', 'postChannelEvent delivers {content, meta} and honors the ok-ack');
chServer.close();
const r4 = await postChannelEvent(path.join(dir, 'gone2.sock'), 'x');
ok(r4.ok === false, 'channel post to a dead socket fails honestly');

fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
