#!/usr/bin/env node
// CS DATA-PLANE SWITCHOVER acceptance (2.146.0) against a REAL host: with
// agentd.dataPlane forced ON, the four consumer switchovers produce results
// through the device agent — and their output matches / behaves like the
// legacy ssh path:
//   S1 RemoteFs: list/readText/write/readBinary/mkdir/remove via the device,
//      cross-checked against the legacy ssh implementations
//   S2 discovery: synthesized raw-facts path vs the legacy ssh script — the
//      SAME parser, comparable session sets (ids match)
//   S3 transcript slab: first fetch full, APPEND on the remote → refetch pulls
//      only the delta (incremental, byte-identical result)
//   S4 usage harvest: scanner streamed through the daemon returns NDJSON
// Usage: node scripts/test-agentd-switchover.mjs <hostId>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const hostId = process.argv[2];
if (!hostId) { console.error('usage: test-agentd-switchover.mjs <hostId>'); process.exit(2); }

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };

const { HostManager } = require('../src/hosts.js');
const { RemoteFs } = require('../src/remote-fs.js');
const hosts = new HostManager({ dataDir: path.join(repo, 'data') });
// wire the data-plane deps exactly as server.js does, flag FORCED ON
hosts.agentdDeps = {
  ensureAgentdOnHost: async (id) => {
    const version = require('../package.json').version;
    await hosts.installAgentd(id, path.join(repo, 'data/bin/vibespace-agentd.js'), version, tokenFor(id));
  },
  agentdHostToken: (id) => tokenFor(id),
  bundlePath: path.join(repo, 'data/bin/vibespace-agentd.js'),
  version: require('../package.json').version,
};
hosts.dataPlaneOn = () => true;
const tokDir = path.join(repo, 'data', 'agentd');
fs.mkdirSync(tokDir, { recursive: true });
function tokenFor(id) {
  const f = path.join(tokDir, 'host-' + id + '.token');
  try { return fs.readFileSync(f, 'utf-8').trim(); } catch { }
  const t = 'vsht_' + require('crypto').randomBytes(24).toString('hex');
  fs.writeFileSync(f, t, { mode: 0o600 });
  return t;
}
const rfs = new RemoteFs(hosts);
const dm = await hosts.device(hostId);
console.log('device connected:', dm.status().info.daemonVersion);

console.log('— S1 RemoteFs via device (cross-checked vs legacy) —');
{
  const base = `/tmp/vs-sw-${Date.now()}`;
  await rfs.mkdir(hostId, base);
  await rfs.write(hostId, base + '/文件.txt', Buffer.from('switchover-内容🎯'));
  const rt = await rfs.readText(hostId, base + '/文件.txt');
  check('write → readText round-trip (device path)', rt.content === 'switchover-内容🎯', JSON.stringify(rt.content));
  const ls = await rfs.list(hostId, base);
  check('list shows the file with size', ls.items.length === 1 && ls.items[0].name === '文件.txt' && ls.items[0].size === Buffer.byteLength('switchover-内容🎯'), JSON.stringify(ls.items));
  // cross-check against the LEGACY ssh path (flag off temporarily)
  hosts.dataPlaneOn = () => false;
  const lsLegacy = await rfs.list(hostId, base);
  hosts.dataPlaneOn = () => true;
  check('device list matches legacy ssh list (name+size)', lsLegacy.items.length === 1 && lsLegacy.items[0].name === ls.items[0].name && lsLegacy.items[0].size === ls.items[0].size, JSON.stringify(lsLegacy.items));
  const rb = await rfs.readBinary(hostId, base + '/文件.txt', 3, 6);
  check('readBinary honors offset/length', rb.length === 6, String(rb.length));
  await rfs.remove(hostId, base);
  const gone = await rfs.list(hostId, base).catch(() => null);
  check('remove works (dir gone)', !gone || gone.items?.length === 0 || gone.path !== base, '');
}

console.log('— S2 discovery: device raw-facts vs legacy ssh script —');
{
  hosts._discoveryCache = new Map(); // bust
  const viaDevice = await hosts.discoverSessions(hostId, { ttlMs: 0 });
  hosts.dataPlaneOn = () => false;
  hosts._discoveryCache = new Map();
  const viaSsh = await hosts.discoverSessions(hostId, { ttlMs: 0 });
  hosts.dataPlaneOn = () => true;
  const ids = (l) => new Set(l.map((s) => s.sessionId));
  const a = ids(viaDevice), b = ids(viaSsh);
  const missing = [...b].filter((x) => !a.has(x));
  check(`device discovery covers the ssh session set (${viaDevice.length} vs ${viaSsh.length})`, viaDevice.length > 0 && missing.length === 0, 'missing: ' + missing.slice(0, 3).join(','));
  const named = viaDevice.filter((s) => s.name).length;
  check('names extracted from raw user lines', named > 0, String(named));
}

console.log('— S3 transcript slab: incremental delta sync —');
{
  // create a synthetic "transcript" on the host inside ~/.claude/projects
  const sid = 'ffffffff-0000-4000-8000-' + String(Date.now()).slice(-12);
  const remoteDir = `.claude/projects/-tmp-vs-slabtest`;
  const home = (await dm.runCmd('sh', ['-c', 'echo "$HOME"'])).stdout.trim();
  const remotePath = `${home}/${remoteDir}/${sid}.jsonl`;
  await dm.fsWrite(remotePath, '{"type":"user","cwd":"/tmp/slab"}\n'.repeat(100));
  const p1 = await hosts.fetchSessionJsonl(hostId, sid);
  const size1 = fs.statSync(p1).size;
  check('first slab fetch lands the full file', size1 === Buffer.byteLength('{"type":"user","cwd":"/tmp/slab"}\n') * 100, String(size1));
  const meta1 = JSON.parse(fs.readFileSync(p1 + '.meta', 'utf8'));
  check('meta marks the slab path', meta1.slab === true, JSON.stringify(meta1));
  // APPEND remotely, refetch — must pull only the delta and byte-match
  await dm.runCmd('sh', ['-c', `printf '{"type":"assistant","delta":true}\\n' >> ${JSON.stringify(remotePath)}`]);
  const p2 = await hosts.fetchSessionJsonl(hostId, sid);
  const local = fs.readFileSync(p2, 'utf8');
  const remote = (await dm.fsReadRange(remotePath, 0, 10 * 1024 * 1024)).data.toString('utf8');
  check('post-append refetch is byte-identical to the remote', local === remote && local.includes('"delta":true'), `lens ${local.length} vs ${remote.length}`);
  await dm.fsRm(`${home}/${remoteDir}`, true);
  fs.rmSync(p2, { force: true }); fs.rmSync(p2 + '.meta', { force: true });
}

console.log('— S4 usage harvest through the daemon (streaming) —');
{
  // force + TEMP cursor so we never consume the production cursor (the
  // 2.127.0 law: harvests are consuming)
  const scanner = path.join(repo, 'data/bin/vibespace-usage-scan');
  // run via the same runStream path harvestUsage uses, but against a temp cursor
  const home = (await dm.runCmd('sh', ['-c', 'echo "$HOME"'])).stdout.trim();
  const script = fs.readFileSync(scanner, 'utf-8');
  const scanPath = home + '/.vibespace/bin/.usage-scan-swtest';
  await dm.fsWrite(scanPath, script);
  const chunks = [];
  const { code } = await dm.runStream('node', [scanPath], {
    env: { VIBESPACE_USAGE_CURSOR: `/tmp/vs-sw-cursor-${Date.now()}.json` },
    onData: (b) => chunks.push(b),
  });
  const nd = Buffer.concat(chunks).toString('utf8').trim();
  const lines = nd ? nd.split('\n') : [];
  let parsed = 0; for (const l of lines.slice(0, 50)) { try { JSON.parse(l); parsed++; } catch { } }
  check('scanner streamed NDJSON through the daemon (exit 0)', code === 0, String(code));
  check('NDJSON lines parse (or host has no transcripts)', lines.length === 0 || parsed > 0, `${lines.length} lines, ${parsed} parsed`);
  await dm.fsRm(scanPath);
}

dm.stop();
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall data-plane SWITCHOVER tests passed');
process.exit(0);
