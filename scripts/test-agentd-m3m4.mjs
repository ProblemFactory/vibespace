#!/usr/bin/env node
// M3/M4 ACCEPTANCE e2e — every device-side primitive of the CS architecture,
// each verified end-to-end through the mux (docs/design-remote-cs.md):
//   M3.1 fs ops: stat/list/write/mkdir/rm round-trip
//   M3.2 transcript slab: fsReadRange byte-exact, INCLUDING a multibyte char
//        split across two range reads (the CJK-offset law)
//   M3.3 discovery: raw-facts snapshot (locks live-filtered, jsonl inventory)
//        + fs.watch dirty PUSH on a new transcript appearing
//   M4.1 run-cmd: bounded argv exec with stdin (the xclip/clipboard shape)
//   M4.2 tcp-forward: loopback byte channel ↔ a device-local TCP service
//        bidirectionally (the VNC-bridge shape)
//   M4.3 Ctrl+G shape: write → device edit (run-cmd) → read-back
// Run: node scripts/test-agentd-m3m4.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-m34-'));
const AGENTD_ROOT = path.join(tmp, 'agentd');
process.env.VIBESPACE_AGENTD_ROOT = AGENTD_ROOT;
// discovery reads ~/.claude — point HOME at a fixture so the test is hermetic
const fakeHome = path.join(tmp, 'home');
fs.mkdirSync(path.join(fakeHome, '.claude', 'sessions'), { recursive: true });
fs.mkdirSync(path.join(fakeHome, '.claude', 'projects', '-tmp-proj'), { recursive: true });
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
dm._ensureLocalToken(); // BEFORE the daemon starts — it reads the token sha at boot
// spawn the daemon manually with the fake HOME (discovery fixture)
const { spawn } = await import('node:child_process');
const daemon = spawn(process.execPath, [path.join(AGENTD_ROOT, 'current', 'agentd.js')], {
  detached: true, stdio: 'ignore', env: { ...process.env, HOME: fakeHome },
});
daemon.unref();
await sleep(700);
await dm.connect();

console.log('— M3.1 fs ops —');
{
  const p = path.join(tmp, 'fs', 'hello.txt');
  await dm.fsMkdir(path.dirname(p));
  await dm.fsWrite(p, 'hello 设备文件系统 ✓');
  const st = await dm.fsStat(p);
  check('write + stat (size includes multibyte)', st.stat.size === Buffer.byteLength('hello 设备文件系统 ✓'), JSON.stringify(st.stat));
  const ls = await dm.fsList(path.dirname(p));
  check('list shows the file', ls.entries.length === 1 && ls.entries[0].name === 'hello.txt', JSON.stringify(ls.entries));
  await dm.fsRm(p);
  const ls2 = await dm.fsList(path.dirname(p));
  check('rm removes it', ls2.entries.length === 0, '');
}

console.log('— M3.2 transcript slab: byte-exact range reads across a multibyte split —');
{
  const p = path.join(tmp, 'fs', 'transcript.jsonl');
  const line = JSON.stringify({ type: 'user', text: '多字节🎯行' }) + '\n';
  const content = line.repeat(500); // ~25KB
  await dm.fsWrite(p, content);
  const whole = Buffer.byteLength(content);
  // split point INSIDE the 🎯 4-byte sequence of some line
  const cut = content.indexOf('🎯') + 2; // bytes: 🎯 starts at a known char index… compute byte offset
  const bytePrefix = Buffer.byteLength(content.slice(0, content.indexOf('🎯'))) + 2; // 2 bytes INTO the emoji
  const a = await dm.fsReadRange(p, 0, bytePrefix);
  const b = await dm.fsReadRange(p, bytePrefix, whole - bytePrefix);
  const glued = Buffer.concat([a.data, b.data]).toString('utf-8');
  check('two range reads splice byte-exact across a split emoji', glued === content, `lens ${a.data.length}+${b.data.length} vs ${whole}`);
  check('reported file size correct', a.size === whole, String(a.size));
  const mid = await dm.fsReadRange(p, 1000, 5000);
  check('arbitrary mid-file slab has exact length', mid.data.length === 5000, String(mid.data.length));
}

console.log('— M3.3 discovery: raw-facts snapshot + dirty push —');
{
  // fixture: one live lock (our own pid), one dead lock, one jsonl
  fs.writeFileSync(path.join(fakeHome, '.claude', 'sessions', process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: 'live-1', cwd: '/tmp/proj' }));
  fs.writeFileSync(path.join(fakeHome, '.claude', 'sessions', '999999.json'), JSON.stringify({ pid: 999999, sessionId: 'dead-1', cwd: '/tmp/proj' }));
  fs.writeFileSync(path.join(fakeHome, '.claude', 'projects', '-tmp-proj', 'aaaa.jsonl'), '{"type":"user"}\n');
  const snap = await dm.discoverySnapshot();
  check('live lock reported, dead lock filtered', snap.locks.length === 1 && snap.locks[0].sessionId === 'live-1', JSON.stringify(snap.locks));
  check('jsonl inventory with size/mtime', snap.jsonls.length === 1 && snap.jsonls[0].file === 'aaaa.jsonl' && snap.jsonls[0].size > 0, JSON.stringify(snap.jsonls));
  let dirty = false;
  await dm.watchDiscovery(() => { dirty = true; });
  await sleep(300);
  fs.writeFileSync(path.join(fakeHome, '.claude', 'projects', '-tmp-proj', 'bbbb.jsonl'), '{"type":"user"}\n');
  for (let i = 0; i < 20 && !dirty; i++) await sleep(200);
  check('fs.watch dirty PUSH on a new transcript', dirty, '');
  const snap2 = await dm.discoverySnapshot();
  check('re-snapshot sees the new transcript', snap2.jsonls.length === 2, String(snap2.jsonls.length));
}

console.log('— M4.1 run-cmd (the clipboard shape: argv + stdin, bounded) —');
{
  const r = await dm.runCmd('wc', ['-c'], { stdin: 'clip-payload-1234' });
  check('argv exec with stdin round-trips', r.code === 0 && r.stdout.trim() === '17', JSON.stringify(r));
  const bad = await dm.runCmd('false', []);
  check('non-zero exit surfaces', bad.code !== 0, JSON.stringify(bad.code));
}

console.log('— M4.2 tcp-forward (the VNC-bridge shape): bidirectional loopback —');
{
  // a device-local TCP echo server (stands in for Xtigervnc on 127.0.0.1)
  const echo = net.createServer((s) => { s.on('data', (d) => s.write(Buffer.from('ACK:' + d.toString()))); });
  await new Promise((r) => echo.listen(0, '127.0.0.1', r));
  const port = echo.address().port;
  const fwd = await dm.tcpForward(port);
  let got = '';
  fwd.onData = (b) => { got += b.toString(); };
  fwd.write('rfb-hello');
  await sleep(400);
  check('bytes forwarded to the device-local service and back', got === 'ACK:rfb-hello', JSON.stringify(got));
  fwd.write('frame2');
  await sleep(400);
  check('channel stays live for more traffic', got.includes('ACK:frame2'), JSON.stringify(got));
  fwd.close(); echo.close();
  const refused = await dm.tcpForward(1).catch((e) => e.message);
  check('connection-refused surfaces as an error', typeof refused === 'string', JSON.stringify(refused));
}

console.log('— M4.3 Ctrl+G shape: write → device-side edit → read-back —');
{
  const p = path.join(tmp, 'fs', 'edit.txt');
  await dm.fsWrite(p, 'line-original\n');
  await dm.runCmd('sed', ['-i', 's/original/edited-on-device/', p]);
  const rr = await dm.fsReadRange(p, 0, 1024);
  check('device-side edit visible in the read-back', rr.data.toString().includes('edited-on-device'), rr.data.toString());
}

console.log('— M5 shape: device-owned long-lived mount-class process lifecycle —');
{
  // a mount daemon (rclone-class) = a persistent pipe session whose process
  // outlives connections + is health-probed via run-cmd and torn down cleanly
  const h = await dm.openPipeSession({ sid: 'mount-1', cmd: process.execPath, args: ['-e', 'setInterval(()=>{},1e3);console.log("MOUNTED")'] });
  const r = await h.ready;
  await sleep(400);
  const probe = await dm.runCmd('kill', ['-0', String(r.pid)]);
  check('mount-class process spawned + health-probe alive', probe.code === 0, JSON.stringify(probe.code));
  h.kill();
  await sleep(3200); // kill = SIGTERM → 2.5s → SIGKILL
  const probe2 = await dm.runCmd('kill', ['-0', String(r.pid)]);
  check('teardown kills the device process', probe2.code !== 0, JSON.stringify(probe2.code));
}

try { const dpid = Number(fs.readFileSync(path.join(AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8')); process.kill(dpid, 'SIGTERM'); } catch {}
dm.stop();
execFileSync('node', ['-e', `require('fs').writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(require('./package.json').version) + ' };\\n')`], { cwd: repo });
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall agentd M3/M4 acceptance tests passed');
process.exit(0);
