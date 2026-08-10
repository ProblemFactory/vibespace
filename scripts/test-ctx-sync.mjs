#!/usr/bin/env node
// ONE ctx sync, any machine (CS separation, 2.277.0).
//
// The old split: ssh = bidirectional rsync with NO caps; dial = hashed sync
// with a SILENT ≤400-files/≤2MB cap. A 3MB context file reached every ssh
// host and silently never reached a dial device. This test drives the ONE
// implementation (src/ctx-sync.js) against an in-memory fake device and
// proves: newer-wins both directions, sha-equal skip (no echo ping-pong),
// traversal guard, capped skips are REPORTED not silent, and the ssh-only
// rsync fallback triggers exactly when the device link is down.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { syncGroupCtx, syncGroupCtxOverDevice, FILE_CAP, MAX_FILES } = require('../src/ctx-sync.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// In-memory fake device: rdir → Map(rel → {data, mt})
function fakeDevice(store) {
  return {
    async runCmd(cmd, args) {
      // answer the inventory probe from the store
      const lines = [];
      for (const [rel, f] of store) lines.push(`${f.mt}\t${sha(f.data)}\t./${rel}`);
      return { stdout: lines.join('\n'), code: 0 };
    },
    async fsMkdir() { },
    async fsWrite(p, buf) {
      const rel = p.split('/ctx-remote/')[1];
      store.set(rel, { data: Buffer.from(buf), mt: Math.floor(Date.now() / 1000) });
    },
    async fsReadRange(p, start, len) {
      const rel = p.split('/ctx-remote/')[1];
      const f = store.get(rel);
      if (!f) throw new Error('missing');
      return { data: f.data.slice(start, start + len) };
    },
  };
}
const mkHosts = (dev) => ({ async deviceBounded() { if (!dev) throw new Error('device offline'); return dev; } });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ctx-'));
const group = { id: 'g1', title: 'G', contextDir: dir };
const rdir = '/fake/ctx-remote';
const now = Math.floor(Date.now() / 1000);

// local: fresh file + one identical to remote + one older than remote
fs.writeFileSync(path.join(dir, 'new-local.md'), 'local fresh');
fs.writeFileSync(path.join(dir, 'same.md'), 'identical');
fs.writeFileSync(path.join(dir, 'stale.md'), 'old local body');
fs.utimesSync(path.join(dir, 'stale.md'), now - 3600, now - 3600);
fs.mkdirSync(path.join(dir, '.vibespace')); fs.writeFileSync(path.join(dir, '.vibespace', 'TASK.md'), 'generated');

const store = new Map();
store.set('same.md', { data: Buffer.from('identical'), mt: now - 9999 }); // same content, ancient mtime — must NOT ping-pong
store.set('stale.md', { data: Buffer.from('remote newer body'), mt: now }); // strictly newer → pull
store.set('remote-only/art.txt', { data: Buffer.from('artifact'), mt: now });
store.set('../evil.txt', { data: Buffer.from('escape'), mt: now + 100 }); // traversal attempt

const skips = [];
const r = await syncGroupCtxOverDevice({ hosts: mkHosts(fakeDevice(store)), hostId: 'h1', group, remoteDir: rdir, onSkip: (rel, why, size) => skips.push({ rel, why, size }) });
ok(store.has('new-local.md') && store.get('new-local.md').data.toString() === 'local fresh', 'push: fresh local file lands on the machine');
ok(store.get('same.md').mt === now - 9999, 'sha-equal file untouched despite mtime gap (no echo ping-pong)');
ok(fs.readFileSync(path.join(dir, 'stale.md'), 'utf8') === 'remote newer body', 'pull: strictly-newer remote wins locally');
ok(fs.readFileSync(path.join(dir, 'remote-only/art.txt'), 'utf8') === 'artifact', 'pull: remote-only artifact materializes (nested dir)');
ok(!fs.existsSync(path.join(path.dirname(dir), 'evil.txt')) && !fs.existsSync(path.join(dir, '..', 'evil.txt')) || !fs.existsSync(path.resolve(dir, '..', 'evil.txt')), 'traversal-guarded: ../evil.txt never written outside the dir');
ok(!store.has('.vibespace/TASK.md'), '.vibespace/ never pushed');
ok(r.pushed >= 1 && r.pulled >= 2, `counts reported (pushed=${r.pushed} pulled=${r.pulled})`);

// ── caps are HONEST: an oversized file is skipped AND reported ──
const big = path.join(dir, 'big.bin');
fs.writeFileSync(big, Buffer.alloc(FILE_CAP + 1024));
skips.length = 0;
await syncGroupCtxOverDevice({ hosts: mkHosts(fakeDevice(store)), hostId: 'h1', group, remoteDir: rdir, onSkip: (rel, why, size) => skips.push({ rel, why, size }) });
ok(!store.has('big.bin'), `an over-cap file (${Math.round(FILE_CAP / 1024 / 1024)}MB+) is not synced`);
ok(skips.some((s) => s.rel === 'big.bin' && s.why === 'size'), 'THE POINT: the skip is REPORTED, never silent (the old dial cap ate files invisibly)');
fs.rmSync(big);

// ── the old 2MB cap must be GONE: a 3MB file (the audit example) syncs ──
fs.writeFileSync(path.join(dir, 'audit-3mb.json'), Buffer.alloc(3 * 1024 * 1024, 0x61));
await syncGroupCtxOverDevice({ hosts: mkHosts(fakeDevice(store)), hostId: 'h1', group, remoteDir: rdir, onSkip: () => { } });
ok(store.has('audit-3mb.json') && store.get('audit-3mb.json').data.length === 3 * 1024 * 1024, 'a 3MB context file now reaches the machine (the file the old cap silently ate)');
ok(MAX_FILES >= 1000, 'file-count bound raised to ≥1000');

// ── transport policy: ssh falls back to rsync, dial surfaces the error ──
let threw = null;
try { await syncGroupCtx({ hosts: mkHosts(null), host: { id: 'd', transport: 'dial' }, group, remoteDir: rdir }); }
catch (e) { threw = e; }
ok(threw && /device offline/.test(threw.message), 'dial with a dead link surfaces the device error (no bogus rsync)');
let rsyncTried = false;
const hostsSsh = {
  async deviceBounded() { throw new Error('device offline'); },
  async _ssh() { rsyncTried = true; throw new Error('stop here — rsync path entered'); },
  sshCmd() { return 'ssh'; }, dest() { return 'u@h'; },
};
try { await syncGroupCtx({ hosts: hostsSsh, host: { id: 's', transport: 'ssh' }, group, remoteDir: rdir }); } catch { }
ok(rsyncTried, 'ssh with a dead link degrades to the legacy rsync pair');

fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
