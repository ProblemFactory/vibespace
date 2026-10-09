#!/usr/bin/env node
// THE rclone mount argv (lane mount-argv-dir-cache, owner 2026-10-09 — the OneDrive disconnect forensics):
// src/mount-argv.js is ONE PURE builder the hub (MountManager._mountArgv) and the device pull mount
// (device-mount.js pullMountArgs) both call; the directory cache is a ROW fact with rclone's poll < ttl law.
//   ① the production OneDrive argv (measured, wf_629c8ad8) is the FIXTURE: every token identical but the moved cells
//   ② the dirCache census: every rclone row declares it, poll < ttl, only a ChangeNotify backend's row declares poll
//   ③ the s3 proxy-signing flag only on an s3 backend; a CHILD builds from its parent's row (drive child: no s3 flag)
//   ④ the rc socket: never under the data dir, never on a network fs, sun_path bound, hasFlag gated, stale file removed
//   ⑤ the twin: the device pull mount = today's argv; both sides give the same cells for the same row; no mount flag
//     literal outside src/mount-argv.js
//   ⑥ the log survives a remount (append, a marker per spawn, 1 MB rotate, a bounded tail)
//   ⑦ _rcStats over a fake rclone: parsed JSON, a 2 s-style bound, no socket = {error}
//   ⑧ patched-copy controls: poll ≥ ttl ⇒ red; a child built from rowOf(child) ⇒ red; the log opened 'w' ⇒ red
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const A = require(path.join(REPO, 'src/mount-argv.js'));
const PROV = require(path.join(REPO, 'src/mount-providers/index.js'));
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const DM = require(path.join(REPO, 'src/device-mount.js'));
const D = fs.mkdtempSync(path.join(process.env.VS_TEST_TMP || os.tmpdir(), 'vs-margv-'));
const RCLONE_1693 = ['vfs-fast-fingerprint', 'vfs-read-ahead', 'use-accept-encoding-gzip', 'rc-addr'];   // what the pinned v1.69.3 knows

function makeMgr(MM, tag, recs, flags = RCLONE_1693) {
  const dataDir = path.join(D, 'data-' + tag); fs.mkdirSync(dataDir, { recursive: true });
  const mgr = new MM({ dataDir, broadcast: () => {} });
  mgr._rcloneHasFlag = (f) => flags.includes(f);
  for (const r of recs) mgr._state.mounts.push({ desired: 'unmounted', ...r });
  return mgr;
}
const argvOf = (mgr, id, o = {}) => mgr._mountArgv(mgr._get(id), { remote: 'VS:', mp: '/MP', cacheDir: '/CACHE', ...o });
const cell = (args, flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const S3F = '--s3-use-accept-encoding-gzip=false';

try {
  console.log('① the production OneDrive argv is the fixture');
  const FIXTURE = 'mount VS: /MP --vfs-cache-mode full --cache-dir /CACHE --vfs-cache-max-size 10G --vfs-cache-max-age 168h --vfs-cache-poll-interval 1m --vfs-write-back 5s --buffer-size 16M --timeout 60s --contimeout 15s --low-level-retries 10 --retries 3 --dir-cache-time 30s --log-level NOTICE --vfs-fast-fingerprint --vfs-read-ahead 128M'.split(' ');
  const mgr = makeMgr(MountManager, 'main', [
    { id: 'od', name: 'od', type: 'onedrive' }, { id: 'gd', name: 'gd', type: 'drive' },
    { id: 'gdc', name: 'gdc', parentId: 'gd', remotePath: 'Shared' }, { id: 's3p', name: 's3p', type: 's3', bucket: 'b' },
    { id: 's3c', name: 's3c', parentId: 's3p', bucket: 'c' }, { id: 'rs3', name: 'rs3', type: 'rclone', rcloneType: 's3' },
    { id: 'rlo', name: 'rlo', type: 'rclone', rcloneType: 'local' }, { id: 'ro', name: 'ro', type: 'webdav', mode: 'ro' },
  ]);
  const od = argvOf(mgr, 'od');
  const moved = FIXTURE.slice(); moved.splice(moved.indexOf('--dir-cache-time'), 2, '--dir-cache-time', '5m', '--poll-interval', '1m');
  ok(JSON.stringify(od) === JSON.stringify(moved), '① onedrive: every production token identical, only --dir-cache-time 30s → 5m and + --poll-interval 1m', JSON.stringify(od));
  ok(cell(argvOf(mgr, 'od', { rcSocket: null }), '--log-level') === 'NOTICE' && !od.includes('--log-file'), '① --log-level stays NOTICE (the owner\'s log volume), no --log-file (stdio append)');
  mgr._getSetting = (k) => (k === 'mounts.vfsCacheMaxSizeGB' ? 25 : undefined);
  ok(cell(argvOf(mgr, 'od'), '--vfs-cache-max-size') === '25G', '① the cache budget setting still reaches the argv');
  mgr._getSetting = () => undefined;
  const old = makeMgr(MountManager, 'old', [{ id: 'od', name: 'od', type: 'onedrive' }], []);
  const odOld = argvOf(old, 'od', { rcSocket: '/run/user/1/vibespace-mounts/od.sock' });
  ok(cell(odOld, '--vfs-cache-mode') === 'writes' && !odOld.includes('--vfs-fast-fingerprint') && !odOld.includes('--vfs-read-ahead') && !odOld.includes('--rc'), '① an rclone without the flags gets none of them (writes cache, no rc)', JSON.stringify(odOld));

  console.log('② the directory cache is a row fact');
  const census = (rows) => rows.flatMap((r) => {
    if (r.rclone === false) return r.dirCache ? [`${r.id}: no rclone, yet a dirCache`] : [];
    if (!r.dirCache) return [`${r.id}: an rclone row without dirCache`];
    const d = A.dirCacheOf(r), bad = [];
    if (!d.ok) bad.push(`${r.id}: ${d.why}`);
    if (d.poll && !A.CHANGE_NOTIFY_BACKENDS.includes(r.rcloneType)) bad.push(`${r.id}: declares poll but ${r.rcloneType || 'its backends'} has no ChangeNotify`);
    return bad;
  });
  ok(census(PROV.rows).length === 0, `② every rclone row declares dirCache, poll < ttl, poll only on a ChangeNotify row (${PROV.rows.length} rows)`, census(PROV.rows).join('; '));
  ok(['onedrive', 'drive'].every((id) => JSON.stringify(PROV.byId[id].dirCache) === '{"ttl":"5m","poll":"1m"}'), '② onedrive + drive = {5m, 1m} (rclone\'s own defaults for a polling backend)');
  ok(PROV.rows.filter((r) => r.rclone !== false && !['onedrive', 'drive'].includes(r.id)).every((r) => JSON.stringify(r.dirCache) === '{"ttl":"30s"}'), '② every other rclone row = {ttl: 30s}, no poll');
  for (const [id, ttl, poll] of [['od', '5m', '1m'], ['gd', '5m', '1m'], ['s3p', '30s', null], ['rlo', '30s', null], ['ro', '30s', null]]) {
    const a = argvOf(mgr, id);
    ok(cell(a, '--dir-cache-time') === ttl && cell(a, '--poll-interval') === poll, `② ${id}: --dir-cache-time ${ttl}${poll ? ' --poll-interval ' + poll : ', no --poll-interval'}`, JSON.stringify(a));
  }
  ok(A.dirCacheOf({}).ttl === '30s' && A.dirCacheOf({ dirCache: { ttl: '5m', poll: '5m' } }).ok === false && A.dirCacheOf({ dirCache: { ttl: 'soon' } }).ok === false, '② the judge: an undeclared row = 30s; poll = ttl is refused; a non-duration is refused');

  console.log('③ the s3 flag only on an s3 backend; a child builds from its parent\'s row');
  for (const id of ['od', 'gd', 'rlo', 'ro']) ok(!argvOf(mgr, id).includes(S3F), `③ ${id}: no s3 flag`);
  ok(argvOf(mgr, 's3p').includes(S3F) && argvOf(mgr, 'rs3').includes(S3F), '③ s3 row + a raw rclone s3 record: the s3 flag');
  const nos3 = makeMgr(MountManager, 'nos3', [{ id: 's', name: 's', type: 's3' }], ['vfs-fast-fingerprint']);
  ok(!argvOf(nos3, 's').includes(S3F), '③ an rclone without the flag never gets it (hasFlag gates)');
  const gdc = argvOf(mgr, 'gdc');
  ok(!gdc.includes(S3F) && cell(gdc, '--dir-cache-time') === '5m' && cell(gdc, '--poll-interval') === '1m', '③ a drive CHILD (parentId, no type): no s3 flag, its parent\'s 5m / 1m (/mnt/gdrive_39ai_shared)', JSON.stringify(gdc));
  ok(argvOf(mgr, 's3c').includes(S3F), '③ an s3 child keeps the s3 flag');
  ok(argvOf(mgr, 'ro').includes('--read-only') && !argvOf(mgr, 'od').includes('--read-only'), '③ mode ro ⇒ --read-only, rw ⇒ none');

  console.log('④ the rc socket');
  const run = path.join(D, 'run'); fs.mkdirSync(run, { mode: 0o700 });
  const pk = A.rcSocketPath({ id: 'od', dataDir: '/srv/data', xdgRuntimeDir: run, uid: 1000 });
  ok(pk.path === path.join(run, 'vibespace-mounts', 'od.sock') && pk.via === 'runtime-dir', '④ $XDG_RUNTIME_DIR/vibespace-mounts/<id>.sock', JSON.stringify(pk));
  const under = A.rcSocketPath({ id: 'od', dataDir: '/srv/data', xdgRuntimeDir: '/srv/data/run', uid: 1000, tmpBase: '/tmp' });
  ok(under.path === '/tmp/vs-mounts-1000/od.sock' && under.via === 'tmp', '④ a runtime dir under the data dir is skipped (the tmp rung)', JSON.stringify(under));
  const netfs = A.rcSocketPath({ id: 'od', dataDir: '/d', xdgRuntimeDir: '/run/user/1', uid: 1, network: () => true });
  ok(netfs.path === null && /network filesystem/.test(netfs.why), '④ every rung on a network filesystem ⇒ no socket, refused by name', netfs.why);
  const both = A.rcSocketPath({ id: 'od', dataDir: '/tmp', xdgRuntimeDir: '', uid: 1, tmpBase: '/tmp' });
  ok(both.path === null && /under the data dir/.test(both.why), '④ nothing outside the data dir ⇒ no socket', both.why);
  ok(A.rcSocketPath({ id: 'od', xdgRuntimeDir: '/' + 'x'.repeat(100), uid: 1 }).via === 'tmp' && A.rcSocketPath({ id: '../od' }).path === null, '④ the 107-byte sun_path bound skips a long rung; an id that is not a file name has no socket');
  for (const [name, o, want] of [['hasFlag', { rcSocket: '/r/x.sock' }, true], ['no rc-addr flag', { rcSocket: '/r/x.sock', hasFlag: () => false }, false], ['under dataDir', { rcSocket: '/d/x.sock', dataDir: '/d' }, false]]) {
    const a = A.rcloneMountArgs({ row: PROV.byId.onedrive, remote: 'VS:', mountpoint: '/m', cacheDir: '/c', hasFlag: (f) => RCLONE_1693.includes(f), ...o });
    const has = a.join(' ').endsWith(`--rc --rc-addr unix://${o.rcSocket} --rc-no-auth`);
    ok(has === want, `④ builder, ${name}: ${want ? 'the rc cells' : 'no --rc'}`, a.slice(-4).join(' '));
  }
  const env0 = process.env.XDG_RUNTIME_DIR;
  process.env.XDG_RUNTIME_DIR = run;
  try {
    const sock = mgr._rcSocketReady(mgr._get('od'));
    ok(sock === path.join(run, 'vibespace-mounts', 'od.sock') && (fs.statSync(path.dirname(sock)).mode & 0o777) === 0o700, '④ _rcSocketReady: the dir created 0700 (sock-path\'s verdict)', sock);
    fs.writeFileSync(sock, 'stale');
    ok(mgr._rcSocketReady(mgr._get('od')) === sock && !fs.existsSync(sock), '④ a dead daemon\'s socket file is removed before the spawn (v1.69.3: "address already in use" kills the mount)');
    fs.chmodSync(path.dirname(sock), 0o755);
    ok(mgr._rcSocketReady(mgr._get('od')) === null, '④ a dir with group/other bits ⇒ no rc for this daemon (the mount still spawns)');
    fs.chmodSync(path.dirname(sock), 0o700);
    ok(old._rcSocketReady(old._get('od')) === null, '④ an rclone without --rc-addr ⇒ null');
    ok(MountManager._onNetworkFs(run) === false && MountManager._onNetworkFs(path.join(run, 'not', 'yet')) === false, '④ statfs: the scratch runtime dir is local (a missing dir asks its nearest ancestor)');
  } finally { if (env0 === undefined) delete process.env.XDG_RUNTIME_DIR; else process.env.XDG_RUNTIME_DIR = env0; }

  console.log('⑤ the twin: hub and device call the ONE builder');
  ok(JSON.stringify(DM.pullMountArgs('/m')) === JSON.stringify(['mount', 'vsdev:', '/m', '--read-only', '--dir-cache-time', '5s', '--vfs-cache-mode', 'minimal', '--timeout', '30s', '--contimeout', '10s', '--attr-timeout', '1s'])
    && JSON.stringify(DM.pullMountArgs('/m', '/c').slice(-2)) === '["--cache-dir","/c"]', '⑤ the device pull argv is today\'s, token for token (+ --cache-dir when given)');
  ok(A.dirCacheOf(DM.PULL_ROW).ok && !DM.PULL_ROW.dirCache.poll && census([{ ...DM.PULL_ROW, rcloneType: 'webdav' }]).length === 0, '⑤ the pull row passes the census (webdav: no poll; 5 s = the held-file tick)');
  const CELLS = ['--dir-cache-time', '--poll-interval', '--rc-addr'];
  const drift = [...PROV.rows.filter((r) => r.rclone !== false), DM.PULL_ROW].filter((r) => {
    const o = { remote: 'VS:', mountpoint: '/m', cacheDir: '/c', hasFlag: () => true, rcSocket: '/r/s.sock' };
    const hub = A.rcloneMountArgs({ ...o, row: { ...r, pull: false } }), dev = A.rcloneMountArgs({ ...o, row: { ...r, pull: true } });
    return CELLS.some((c) => cell(hub, c) !== cell(dev, c));
  }).map((r) => r.id);
  ok(drift.length === 0, '⑤ for the same row, the hub and the device shapes carry the same dirCache + rc cells', drift.join());
  const FLAGS = ['--dir-cache-time', '--poll-interval', '--vfs-cache-mode', '--log-level', '--rc-addr', '--cache-dir', '--vfs-cache-max-size', '--attr-timeout'];
  const codeOf = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const strays = ['src/mounts.js', 'src/device-mount.js'].flatMap((f) => FLAGS.filter((fl) => codeOf(f).includes(`'${fl}'`)).map((fl) => `${f} ${fl}`));
  ok(strays.length === 0, '⑤ no mount flag literal in src/mounts.js or src/device-mount.js — only src/mount-argv.js writes them', strays.join(', '));
  ok(FLAGS.filter((fl) => fl !== '--attr-timeout').every((fl) => codeOf('src/mount-argv.js').includes(`'${fl}'`)), '⑤ (census scope: the builder holds every one of them)');

  console.log('⑥ the log survives a remount');
  const logOf = (g, id) => fs.readFileSync(path.join(g._logDir, id + '.log'), 'utf8');
  const say = (g, id, line) => { const fd = g._openMountLog(id); fs.writeSync(fd, line + '\n'); fs.closeSync(fd); };
  say(mgr, 'od', 'CRITICAL: daemon 1 last words'); say(mgr, 'od', 'NOTICE: daemon 2 up');
  ok(/daemon 1 last words[\s\S]*daemon 2 up/.test(logOf(mgr, 'od')), '⑥ the previous daemon\'s last line is still in the log after a remount');
  ok(mgr.tailMountLog('od', 2, { current: true }).join('|') === 'NOTICE: daemon 2 up', '⑥ tail {current}: the newest daemon\'s lines only (the start verdict reads this)', mgr.tailMountLog('od', 2, { current: true }).join('|'));
  ok(mgr.tailMountLog('od', 3).some((l) => l.includes('daemon 1 last words')) && mgr.tailMountLog('od', 3).some((l) => l.startsWith(MountManager.LOG_MARK)), '⑥ tail: the dead daemon\'s last words + the spawn marker');
  fs.appendFileSync(path.join(mgr._logDir, 'od.log'), ('x'.repeat(99) + '\n').repeat(11000));
  const t0 = mgr.tailMountLog('od', 4);
  ok(t0.length === 4 && t0.every((l) => l === 'x'.repeat(99)), '⑥ the tail is a bounded read of a 1 MB log');
  say(mgr, 'od', 'NOTICE: daemon 3 up');
  ok(fs.statSync(path.join(mgr._logDir, 'od.log.1')).size > A.LOG_ROTATE_BYTES && /daemon 1 last words/.test(fs.readFileSync(path.join(mgr._logDir, 'od.log.1'), 'utf8')) && logOf(mgr, 'od').split('\n').length === 3, '⑥ past 1 MB the log rotates to <id>.log.1 before the spawn (nothing of it lost)');
  ok(mgr.tailMountLog('nope', 5).length === 0, '⑥ no log ⇒ []');

  console.log('⑦ _rcStats over a fake rclone');
  const FAKE = path.join(D, 'rclone');
  fs.writeFileSync(FAKE, '#!/bin/bash\n[ "$1" = rc ] || exit 2\n[ "$2" = --unix-socket ] || exit 3\n[ -n "$FAKE_HANG" ] && sleep 5\ncase "$4" in core/stats) echo \'{"bytes": 7, "errors": 1}\';; vfs/queue) echo \'{"queue": [{"name": "a.txt"}]}\';; *) exit 4;; esac\n', { mode: 0o755 });
  mgr.rcloneBin = () => FAKE;
  process.env.XDG_RUNTIME_DIR = run;
  try {
    ok(/no rc socket/.test((await mgr._rcStats(mgr._get('od'))).error || ''), '⑦ no socket ⇒ {error}, no child');
    const sp = mgr._rcSocketPick(mgr._get('od')).path;
    const srv = net.createServer(); await new Promise((r) => srv.listen(sp, r));
    try {
      const st = await mgr._rcStats(mgr._get('od'));
      ok(st.stats?.bytes === 7 && st.queue?.queue?.[0]?.name === 'a.txt', '⑦ core/stats + vfs/queue parsed', JSON.stringify(st));
      process.env.FAKE_HANG = '1';
      const t1 = Date.now(), h = await mgr._rcStats(mgr._get('od'), 300);
      ok(/no answer in 300 ms/.test(h.error || '') && Date.now() - t1 < 2500, '⑦ a daemon that does not answer ⇒ {error} within the bound', `${h.error} ${Date.now() - t1} ms`);
      delete process.env.FAKE_HANG;
    } finally { srv.close(); }
  } finally { if (env0 === undefined) delete process.env.XDG_RUNTIME_DIR; else process.env.XDG_RUNTIME_DIR = env0; }

  console.log('⑧ patched-copy controls');
  const MC = mutantCopies('mount-argv', REPO);
  const odSrc = fs.readFileSync(path.join(REPO, 'src/mount-providers/onedrive.js'), 'utf8');
  const POLL = "dirCache: { ttl: '5m', poll: '1m' }";
  ok(odSrc.split(POLL).length === 2, '⑧ control anchor: the onedrive dirCache cell exists once');
  const odMut = require(MC.write('src/mount-providers/onedrive.js', odSrc.replace(POLL, "dirCache: { ttl: '30s', poll: '1m' }"), 'poll'));
  ok(census([odMut]).length === 1, '⑧ NEGATIVE CONTROL: today\'s 30 s under the 1 m poll (poll ≥ ttl) ⇒ the census is red', census([odMut]).join());
  const mSrc = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8');
  const EFF = 'const conn = this._connOf(m), row = rowFor(this, m);';
  const OPEN = "const fd = fs.openSync(f, 'a');";
  ok(mSrc.split(EFF).length === 2 && mSrc.split(OPEN).length === 2, '⑧ control anchors: the effective-row line and the append open exist once');
  const childMut = makeMgr(require(MC.write('src/mounts.js', mSrc.replace(EFF, 'const conn = this._connOf(m), row = rowOf(m);'), 'child')).MountManager, 'mutc',
    [{ id: 'gd', name: 'gd', type: 'drive' }, { id: 'gdc', name: 'gdc', parentId: 'gd' }]);
  const gm = argvOf(childMut, 'gdc');
  ok(gm.includes(S3F) && cell(gm, '--dir-cache-time') === '30s', '⑧ NEGATIVE CONTROL: a child built from rowOf(child) gets the s3 flag and the s3 row\'s 30 s (red)', JSON.stringify(gm));
  const logMut = makeMgr(require(MC.write('src/mounts.js', mSrc.replace(OPEN, "const fd = fs.openSync(f, 'w');"), 'w')).MountManager, 'mutw', []);
  say(logMut, 'L', 'daemon 1 last words'); say(logMut, 'L', 'daemon 2 up');
  ok(!/daemon 1 last words/.test(logOf(logMut, 'L')), '⑧ NEGATIVE CONTROL: the log opened \'w\' again ⇒ the dead daemon\'s last words are gone (red)');
} finally {
  fs.rmSync(D, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
