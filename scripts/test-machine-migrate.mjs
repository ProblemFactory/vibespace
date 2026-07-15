#!/usr/bin/env node
// B-f3e8 migration guard: dial-tokens.json → host records (dialTokenHash) and
// host-mounts.json + device-mounts.json → machine-mounts.json. The token
// migration MUST be lossless (devices in the field hold the raw tokens — a
// lost hash locks every daemon out permanently) and idempotent (a crash
// mid-way re-runs cleanly). Pure unit test — no server boot.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { HostManager } = require('../src/hosts.js');
const { MachineMounts } = require('../src/machine-mounts.js');

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-migrate-'));
process.on('exit', () => { try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { } });
fs.mkdirSync(path.join(dataDir, 'agentd'), { recursive: true });

const HASH_A = 'a'.repeat(64), HASH_B = 'b'.repeat(64);
// pre-migration world: one dial host record ALREADY exists (created by the
// 2.154.2 backfill) with NO hash; a second pairing has a token but NO record
// (pre-backfill); plus a normal ssh host.
fs.writeFileSync(path.join(dataDir, 'hosts.json'), JSON.stringify({
  hosts: [
    { id: 'host-dial-mac1', name: 'mac1', transport: 'dial', deviceId: 'mac1', createdAt: 1 },
    { id: 'host-11223344', name: 'gpu-01', user: 'u', host: '10.0.0.5', port: 22, keyPath: null, keySource: 'default', createdAt: 2 },
  ],
}));
fs.writeFileSync(path.join(dataDir, 'agentd', 'dial-tokens.json'), JSON.stringify({ mac1: HASH_A, 'frps-server': HASH_B }));
// legacy mount stores: one push (host-mounts) + one pull (device-mounts)
fs.writeFileSync(path.join(dataDir, 'host-mounts.json'), JSON.stringify({
  mounts: [{ id: 'hm-1111', hostId: 'host-11223344', folder: '/srv/x', mountpoint: '/home/u/vibespace-remote/x', mode: 'ro', os: 'linux', method: 'rclone-webdav', tokenId: 'tk1', tunnelPort: 40001, mountedAt: 3 }],
}));
fs.writeFileSync(path.join(dataDir, 'device-mounts.json'), JSON.stringify({
  mounts: [{ id: 'dvm-2222', deviceId: 'mac1', remotePath: '/Users/me/docs', mountpoint: '/home/vibe/vibespace-devices/mac1-docs', createdAt: 4 }],
}));

// ── run the migrations the way server.js does (hosts first, then mounts) ──
const hosts = new HostManager({ dataDir });
hosts.migrateDialTokenFile(path.join(dataDir, 'agentd', 'dial-tokens.json'));
const mm = new MachineMounts({ dataDir, hosts, mountTokens: { mint: () => ({ raw: 'x', rec: { id: 'x' } }) } });

// token migration
check('existing dial record gained its hash', hosts.dialTokenHash('mac1') === HASH_A);
check('record-less pairing got a record + hash', hosts.dialTokenHash('frps-server') === HASH_B);
check('created record has the deterministic id', !!hosts.list().find((h) => h.id === 'host-dial-frps-server'));
check('legacy token file renamed .migrated', !fs.existsSync(path.join(dataDir, 'agentd', 'dial-tokens.json')) && fs.existsSync(path.join(dataDir, 'agentd', 'dial-tokens.json.migrated')));
check('list() exposes online, never the hash', (() => {
  const h = hosts.list().find((x) => x.deviceId === 'mac1');
  return h && !('dialTokenHash' in JSON.parse(JSON.stringify(h))) && h.online === false;
})());
check('ssh record untouched', (() => { const h = hosts.get('host-11223344'); return h.name === 'gpu-01' && !h.transport; })());

// mount migration
const recs = mm.list();
check('machine-mounts.json created with both records', recs.length === 2, JSON.stringify(recs));
const push = recs.find((m) => m.dir === 'push');
check('push record intact (hostId/folder/tunnelPort)', push && push.id === 'hm-1111' && push.hostId === 'host-11223344' && push.folder === '/srv/x' && push.via === 'tunnel', JSON.stringify(push));
const pull = recs.find((m) => m.dir === 'pull');
check('pull record rekeyed deviceId → hostId', pull && pull.id === 'dvm-2222' && pull.hostId === 'host-dial-mac1' && pull.remotePath === '/Users/me/docs', JSON.stringify(pull));
check('legacy mount stores renamed .migrated', !fs.existsSync(path.join(dataDir, 'host-mounts.json')) && !fs.existsSync(path.join(dataDir, 'device-mounts.json'))
  && fs.existsSync(path.join(dataDir, 'host-mounts.json.migrated')) && fs.existsSync(path.join(dataDir, 'device-mounts.json.migrated')));

// idempotence: constructing again must not duplicate or lose anything
const hosts2 = new HostManager({ dataDir });
hosts2.migrateDialTokenFile(path.join(dataDir, 'agentd', 'dial-tokens.json')); // file gone → no-op
const mm2 = new MachineMounts({ dataDir, hosts: hosts2, mountTokens: { mint: () => ({ raw: 'x', rec: { id: 'x' } }) } });
check('second boot: hashes survive, no dupes', hosts2.dialTokenHash('mac1') === HASH_A && hosts2.list().filter((h) => h.deviceId === 'mac1').length === 1);
check('second boot: mount records stable', mm2.list().length === 2);

// token hygiene (2.162.1): gcOrphanTokens revokes host:* tokens no push
// record references; referenced + non-host tokens untouched
const revoked = [];
const fakeTokens = {
  mint: () => ({ raw: 'x', rec: { id: 'x' } }),
  revoke: (id) => revoked.push(id),
  list: () => [
    { id: 'tk1', kind: 'reverse-mount', owner: 'host-11223344' }, // referenced by the migrated push record
    { id: 'tk-orphan', kind: 'reverse-mount', owner: 'host-dial-mac1' }, // leaked by a failed push
    { id: 'tk-manual', kind: 'share', name: 'team-dataset' },   // a user's manual share — MUST survive
    { id: 'tk-legacy', kind: 'reverse-mount', owner: 'host-gone' }, // orphan from an old push (back-filled kind)
  ],
};
const mm3 = new MachineMounts({ dataDir, hosts: hosts2, mountTokens: fakeTokens });
mm3.gcOrphanTokens();
check('GC revokes reverse-mount tokens with no push record (by kind), leaves share tokens', JSON.stringify(revoked.sort()) === '["tk-legacy","tk-orphan"]', JSON.stringify(revoked));

// unpair semantics: removing the dial host kills the credential with it
hosts2.remove('host-dial-frps-server');
check('unpair (record removal) revokes the pairing', hosts2.dialTokenHash('frps-server') === null);

console.log(failed ? `\n${failed} FAILED` : '\nmigration guard passed');
process.exit(failed ? 1 : 0);
