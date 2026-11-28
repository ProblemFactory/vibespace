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
import { anchored } from './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const { syncGroupCtx, syncGroupCtxOverDevice, FILE_CAP, MAX_FILES } = require('../src/ctx-sync.js');

let pass = 0, fail = 0;
const ok = (c, n) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
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
ok(gateOf(store.has('new-local.md')) && store.get('new-local.md').data.toString() === 'local fresh', 'push: fresh local file lands on the machine');
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
ok(verdictOf(skips.some((s) => s.rel === 'big.bin' && s.why === 'size')), 'THE POINT: the skip is REPORTED, never silent (the old dial cap ate files invisibly)');
fs.rmSync(big);

// ── the old 2MB cap must be GONE: a 3MB file (the audit example) syncs ──
fs.writeFileSync(path.join(dir, 'audit-3mb.json'), Buffer.alloc(3 * 1024 * 1024, 0x61));
await syncGroupCtxOverDevice({ hosts: mkHosts(fakeDevice(store)), hostId: 'h1', group, remoteDir: rdir, onSkip: () => { } });
ok(gateOf(store.has('audit-3mb.json')) && store.get('audit-3mb.json').data.length === 3 * 1024 * 1024, 'a 3MB context file now reaches the machine (the file the old cap silently ate)');
ok(MAX_FILES >= 1000, 'file-count bound raised to ≥1000');

// ── transport policy: ssh falls back to rsync, dial surfaces the error ──
let threw = null;
try { await syncGroupCtx({ hosts: mkHosts(null), host: { id: 'd', transport: 'dial' }, group, remoteDir: rdir }); }
catch (e) { threw = e; }
ok(gateOf(threw) && verdictOf(/device offline/.test(threw.message)), 'dial with a dead link surfaces the device error (no bogus rsync)');
let rsyncTried = false;
const hostsSsh = {
  async deviceBounded() { throw new Error('device offline'); },
  async _ssh() { rsyncTried = true; throw new Error('stop here — rsync path entered'); },
  sshCmd() { return 'ssh'; }, dest() { return 'u@h'; },
};
try { await syncGroupCtx({ hosts: hostsSsh, host: { id: 's', transport: 'ssh' }, group, remoteDir: rdir }); } catch { }
ok(verdictOf(rsyncTried), 'ssh with a dead link degrades to the legacy rsync pair');

// B-5278 (a): a file over LINE_FILE_MAX rides the agent's byte STREAM (fs-write-stream), never ONE control line (a 16 MiB file
// was ≈21 MiB of base64 in one line); an older agent — the client refuses the stream BEFORE anything is sent — keeps the one line
{
  const CS = require('../src/ctx-sync.js'), { LINE_FILE_MAX } = CS;
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ctx-big-')), g2 = { id: 'g2', title: 'G2', contextDir: d2 };
  fs.writeFileSync(path.join(d2, 'big.md'), Buffer.alloc(LINE_FILE_MAX + 4096, 0x61)); fs.writeFileSync(path.join(d2, 'small.md'), 'small');
  const relOf = (p) => p.split('/ctx-remote/')[1];
  const streamDev = (st2, log) => {
    const dev = fakeDevice(st2), fw = dev.fsWrite;
    dev.fsWrite = async (p, buf, o) => { log.push({ road: 'line', rel: relOf(p), bytes: Buffer.byteLength(buf) }); return fw(p, buf, o); };
    dev.fsWriteStream = async (p, { source, size, overwrite, by } = {}) => {
      const parts = []; for await (const c of source) parts.push(Buffer.from(c)); const data = Buffer.concat(parts);
      if (data.length !== size) throw Object.assign(new Error('more or fewer bytes than announced'), { code: 'size_changed' });
      log.push({ road: 'stream', rel: relOf(p), bytes: size, overwrite: overwrite === true, by });
      st2.set(relOf(p), { data, mt: Math.floor(Date.now() / 1000) }); return { size, sha256: sha(data) };
    };
    return dev;
  };
  const oldDev = (st2, log) => { const dev = streamDev(st2, log); dev.fsWriteStream = async () => { throw Object.assign(new Error('daemon lacks fs-write-stream (capabilities gate) -- upgrade the agent on this machine'), { code: 'host_needs_daemon' }); }; return dev; };
  const run2 = async (Lib, mk) => { const st2 = new Map(), log = []; await Lib.syncGroupCtxOverDevice({ hosts: mkHosts(mk(st2, log)), hostId: 'h2', group: g2, remoteDir: rdir, onSkip: () => { } }); return { st2, log }; };
  const s = await run2(CS, streamDev), sb = s.log.find((x) => x.rel === 'big.md');
  ok(gateOf(sb) && sb.road === 'stream' && sb.bytes === LINE_FILE_MAX + 4096 && gateOf(sb.overwrite) && sb.by === 'system:ctx-sync' && s.st2.get('big.md').data.length === LINE_FILE_MAX + 4096 && verdictOf(s.log.some((x) => x.rel === 'small.md' && x.road === 'line')),
    `B-5278 (a): a file over ${LINE_FILE_MAX} bytes goes through the agent's byte stream (its size announced, overwrite, by system:ctx-sync) — never one control line; a small one keeps the line`);
  const o2 = await run2(CS, oldDev), ob = o2.log.find((x) => x.rel === 'big.md');
  ok(gateOf(ob) && ob.road === 'line' && verdictOf(o2.st2.has('big.md')), 'an OLDER agent (no fs-write-stream: refused before anything is sent) — the file goes as one line, as before; the sync never hangs on an op the agent lacks');
  const M = mutantCopies('ctx-sync', path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'));
  const CSRC = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'ctx-sync.js'), 'utf8');
  const noStream = M.load('src/ctx-sync.js', anchored(CSRC, "      if (buf.length > LINE_FILE_MAX && typeof dm.fsWriteStream === 'function') {", "      if (false) {   /* MUTANT: the release's one line */", 'ctx-no-stream'), 'ctx-no-stream');
  const x = await run2(noStream, streamDev), xb = x.log.find((y) => y.rel === 'big.md');
  ok(gateOf(xb) && xb.road === 'line', 'CONTROL (the stream road cut, in a copy): the big file rides ONE control line again (red)');
  fs.rmSync(d2, { recursive: true, force: true });
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
