#!/usr/bin/env node
// test-vfs-cache-place — WHERE a mount's rclone VFS cache lives (lane vfs-cache-local, B-4997, 2026-10-09): the owner's
// OneDrive cache sat on fuse.bindfs over NFS under data/ (164 788 files re-walked at every remount). The PURE rule
// (src/vfs-cache-place.js) + the REAL MountManager's remount step (_placeCache: the vfsMeta walk in a child, the rc queue,
// the switch) over REAL rclone vfsMeta files. THE LAW: a cache moves only when it holds nothing of the user's.
//   ① the witness fixture: real rclone vfsMeta bytes (Go's indented encoder: `"Dirty": true` WITH a space) — PARSED
//   ② dirtyWitness: either witness dirty ⇒ dirty; unreadable ⇒ dirty (fail closed)
//   ③ cachePlacement: network dataDir + local candidate + clean ⇒ move; dirty ⇒ stay + pending; local dataDir ⇒ never;
//     no local candidate ⇒ stay + the door; nothing cached ⇒ a switch with nothing to remove; the owner's override wins
//   ④ the real manager: _placeCache moves a clean cache (a SWITCH — the new dir starts empty, the old one stays until the
//     mount), keeps a dirty / no-space-spelling / unparsable / still-queued one, the row's cell says it; _dropCacheDir
//     removes by a child, only a dir named after the record
//   ⑤ patched-copy controls: a grep-for-a-spelling witness ⇒ red on the real fixture; a move while dirty ⇒ red; a copy
//     instead of a switch ⇒ red
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(50); } return !!(await fn()); };

// ① REAL rclone vfsMeta files (rclone mount --vfs-cache-mode full --vfs-write-back 1h on a scratch local remote, this box,
// 2026-10-09): a file written through the mount (still to upload) and a file only read. Byte-for-byte, tabs included.
const META_DIRTY = "{\n\t\"ModTime\": \"2026-10-09T04:42:04.4329626-07:00\",\n\t\"ATime\": \"2026-10-09T04:42:04.433022449-07:00\",\n\t\"Size\": 6,\n\t\"Rs\": [\n\t\t{\n\t\t\t\"Pos\": 0,\n\t\t\t\"Size\": 6\n\t\t}\n\t],\n\t\"Fingerprint\": \"\",\n\t\"Dirty\": true\n}\n";
const META_CLEAN = "{\n\t\"ModTime\": \"2026-10-09T04:42:04.427219733-07:00\",\n\t\"ATime\": \"2026-10-09T04:42:04.429995683-07:00\",\n\t\"Size\": 6,\n\t\"Rs\": [\n\t\t{\n\t\t\t\"Pos\": 0,\n\t\t\t\"Size\": 6\n\t\t}\n\t],\n\t\"Fingerprint\": \"6,2026-10-09 11:42:04.28076218 +0000 UTC,175388b0347c53b5a93c13cc12efd711\",\n\t\"Dirty\": false\n}\n";
const META_NOSPACE = '{"ModTime":"2026-10-09T04:42:04.4329626-07:00","Size":6,"Rs":[{"Pos":0,"Size":6}],"Fingerprint":"","Dirty":true}';

const D = fs.mkdtempSync(path.join(process.env.VS_TEST_TMP || os.tmpdir(), 'vs-vfsplace-'));
process.env.HOME = path.join(D, 'home'); fs.mkdirSync(process.env.HOME, { recursive: true });
delete process.env.VIBESPACE_VFS_CACHE_DIR;
const LOCAL_ROOT = path.join(D, 'home', '.cache', 'vibespace', 'vfs-cache');

function judgeMeta(P) {
  return P.metaVerdict(META_DIRTY) === 'dirty' && P.metaVerdict(META_CLEAN) === 'clean' && P.metaVerdict(META_NOSPACE) === 'dirty';
}
function judgePlace(P) {
  const base = { recordDir: '/net/data/vfs-cache/A', recordNetwork: true, dataDirNetwork: true, candidates: [{ dir: '/home/u/.cache/vibespace/vfs-cache/A', network: false, writable: true }] };
  const p = P.cachePlacement({ ...base, witness: P.dirtyWitness({ exists: true, files: 2, dirty: 1, unread: 0 }, null) });
  return !p.move && p.dir === base.recordDir && p.pendingMove === true && p.items === 1;
}

try {
  const P = require(path.join(REPO, 'src/vfs-cache-place.js'));
  // ── ① the witness fixture — parsed, never grepped ──
  ok(/\n\t"Dirty": true\n\}\n?$/.test(META_DIRTY) && !META_DIRTY.includes('"Dirty":true'), '① the fixture is the real shape: Go\'s indented encoder writes "Dirty": true WITH a space (a grep for "Dirty":true matches nothing)');
  ok(P.metaVerdict(META_DIRTY) === 'dirty', '① the real dirty vfsMeta reads dirty');
  ok(P.metaVerdict(META_CLEAN) === 'clean', '① the real clean vfsMeta (uploaded: a fingerprint, "Dirty": false) reads clean');
  ok(P.metaVerdict(META_NOSPACE) === 'dirty', '① the no-space spelling "Dirty":true reads dirty too — parse, not grep');
  ok(P.metaVerdict(META_CLEAN.replace('"Dirty": false', '"Dirty": "false"')) === 'dirty' && P.metaVerdict(META_CLEAN.replace(/,\n\t"Dirty": false/, '')) === 'dirty', '① an odd or missing Dirty field is never read clean');
  ok(P.metaVerdict(META_DIRTY.slice(0, 40)) === 'unread' && P.metaVerdict('') === 'unread' && P.metaVerdict('[]') === 'unread', '① a torn / empty / non-object file is unread (never clean)');

  // ── ② the two witnesses ──
  const W = P.dirtyWitness;
  ok(W(null, null).dirty && W(null, null).why === 'unread', '② the walk failed ⇒ dirty (fail closed)');
  ok(W({ timedOut: true }, null).dirty, '② the walk timed out ⇒ dirty');
  ok(!W({ exists: false }, null).dirty && W({ exists: false }, null).why === 'empty', '② nothing cached and no daemon to ask ⇒ clean (empty)');
  ok(!W({ exists: true, files: 3, dirty: 0, unread: 0 }, null).dirty, '② every vfsMeta clean, no live daemon ⇒ clean');
  ok(W({ exists: true, files: 3, dirty: 2, unread: 0 }, null).items === 2, '② vfsMeta items dirty ⇒ dirty, counted');
  ok(W({ exists: true, files: 3, dirty: 0, unread: 1 }, null).why === 'unread', '② one unreadable vfsMeta ⇒ dirty (unread)');
  ok(W({ exists: true, files: 3, dirty: 0, unread: 0 }, { queue: [{ name: 'a.txt', uploading: true }] }).items === 1, '② the live witness: the outgoing daemon still queues an upload ⇒ dirty');
  ok(W({ exists: true, files: 3, dirty: 0, unread: 0 }, { error: 'vfs/queue: no answer in 2000 ms' }).dirty, '② the outgoing daemon alive but its rc queue unreadable ⇒ dirty');
  ok(W({ exists: false }, { queue: [{ name: 'a' }] }).dirty, '② no vfsMeta but the daemon queues ⇒ dirty');

  // ── ③ the placement rule ──
  const C = P.cachePlacement;
  const net = { recordDir: '/net/data/vfs-cache/A', recordNetwork: true, dataDirNetwork: true, candidates: [{ dir: '/home/u/.cache/vibespace/vfs-cache/A', network: false, writable: true }] };
  const clean = W({ exists: true, files: 2, dirty: 0, unread: 0 }, null);
  ok(C(net).needWitness && !C(net).move && C(net).dir === net.recordDir, '③ a move is wanted ⇒ the witness is read first (nothing moves without it)');
  const mv = C({ ...net, witness: clean });
  ok(mv.move && mv.dir === net.candidates[0].dir && mv.from === net.recordDir && mv.reason === 'moved', '③ network dataDir + a local writable candidate + clean ⇒ move (from = the old dir, removed after the mount)');
  ok(judgePlace(P), '③ dirty ⇒ stay on the old dir, pendingMove + the item count (moves at the next reconnect once clean)');
  const ur = C({ ...net, witness: W(null, null) });
  ok(!ur.move && ur.pendingMove && ur.reason === 'unread', '③ an unreadable witness ⇒ stay (fail closed)');
  ok(['local-data'].includes(C({ ...net, dataDirNetwork: false, witness: clean }).reason) && !C({ ...net, dataDirNetwork: false, witness: clean }).move, '③ a LOCAL dataDir (the fleet PVC) never moves');
  for (const cand of [[{ dir: '/x/A', network: true, writable: true }], [{ dir: '/x/A', network: false, writable: false }], []]) {
    const p = C({ ...net, candidates: cand, witness: clean });
    ok(!p.move && p.reason === 'no-local' && p.network === true, `③ no local writable candidate (${JSON.stringify(cand)}) ⇒ stay + the door on the row`);
  }
  const fr = C({ ...net, exists: false });
  ok(fr.move && fr.from === null && fr.dir === net.candidates[0].dir, '③ nothing cached yet ⇒ a switch with nothing to remove');
  ok(C({ ...net, recordDir: '/home/u/.cache/vibespace/vfs-cache/A', recordNetwork: false }).reason === 'local', '③ a cache already on local disk stays');
  const ov = { ...net, dataDirNetwork: false, recordNetwork: false, candidates: [{ dir: '/fast/A', network: false, writable: true, override: true }] };
  ok(C({ ...ov, witness: clean }).move && C({ ...ov, witness: clean }).dir === '/fast/A' && !C({ ...ov, witness: W({ exists: true, files: 1, dirty: 1, unread: 0 }, null) }).move, '③ the owner\'s override (env / mounts.vfsCacheRoot) wins — and still moves only when clean');
  ok(P.deviceCacheVerdict({}).dir === null && P.deviceCacheVerdict({ dir: '/n/c', network: true }).why === 'network' && P.deviceCacheVerdict({ dir: '/n/c', network: true }).dir === '/n/c', '③ the device twin: no dir ⇒ rclone\'s own local default; a network dir is said, never moved');

  // ── ④ the real manager's remount step ──
  const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
  const DATA = path.join(D, 'data');
  const mk = (MM, dataNet = true, tag = 'm', homeFs = 'local') => {
    const dataDir = path.join(DATA, tag); fs.mkdirSync(dataDir, { recursive: true });
    const g = new MM({ dataDir, broadcast: () => {} });
    g._cacheFs = (d) => (dataNet && (d === dataDir || d.startsWith(dataDir + '/'))) ? 'network' : d.startsWith(path.join(D, 'home')) ? homeFs : 'local';
    return g;
  };
  const seed = (g, id, metas) => {
    const dir = path.join(g._vfsCacheRoot(), id);
    fs.mkdirSync(path.join(dir, 'vfs', 'od'), { recursive: true }); fs.writeFileSync(path.join(dir, 'vfs', 'od', 'f0.txt'), 'cached bytes');
    metas.forEach((t, i) => { const p = path.join(dir, 'vfsMeta', 'od', 'sub', `f${i}.txt`); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); });
    const m = { id, name: id, type: 'rclone', rcloneType: 'local', desired: 'unmounted' }; g._state.mounts.push(m); return { m, dir };
  };
  const g = mk(MountManager);
  const A = seed(g, 'A', [META_CLEAN, META_CLEAN]);
  const toA = await g._placeCache(A.m);
  ok(toA === path.join(LOCAL_ROOT, 'A') && A.m.cacheDir === toA && A.m.cacheOld === A.dir, '④ a clean cache on the network dataDir MOVES at the remount: the new daemon gets ~/.cache/vibespace/vfs-cache/<id>, the record remembers both dirs', JSON.stringify({ toA, A: A.m }));
  ok(fs.readdirSync(toA).length === 0 && fs.existsSync(path.join(A.dir, 'vfs', 'od', 'f0.txt')), '④ a SWITCH, never a copy: the new dir starts empty; the old one stays until the new daemon mounted');
  ok((fs.statSync(LOCAL_ROOT).mode & 0o777) === 0o700, '④ the local root is 0700');
  ok(JSON.parse(fs.readFileSync(g._file, 'utf8')).mounts.find((x) => x.id === 'A').cacheDir === toA, '④ m.cacheDir is persisted through the mounts store');
  for (const [id, metas, rc, why] of [['B', [META_CLEAN, META_DIRTY], null, 'dirty'], ['N', [META_NOSPACE], null, 'dirty'], ['U', [META_CLEAN, '{"ModTime": '], null, 'unread'], ['Q', [META_CLEAN], { queue: [{ name: 'od/a.txt' }] }, 'dirty'], ['E', [META_CLEAN], { error: 'no answer' }, 'unread']]) {
    const S = seed(g, id, metas);
    const to = await g._placeCache(S.m, rc);
    const cell = g.list().find((x) => x.id === id).cache;
    ok(to === S.dir && S.m.cacheDir === S.dir && !S.m.cacheOld && cell.why === why && cell.pendingMove && cell.network, `④ ${id}: ${why === 'dirty' ? 'a dirty item' : 'an unreadable witness'} (${rc ? 'rc ' + JSON.stringify(rc) : metas.length + ' vfsMeta'}) ⇒ the daemon restarts on the OLD dir, the row says ${why}`, JSON.stringify({ to, m: S.m, cell }));
  }
  ok(g.list().find((x) => x.id === 'B').cache.items === 1, '④ the row counts the items still uploading');
  const T0 = seed(g, 'T', [META_CLEAN]); (g._cacheWalkFailed = new Map()).set('T', Date.now() - 60e3);
  ok(await g._placeCache(T0.m) === T0.dir && g.list().find((x) => x.id === 'T').cache.why === 'unread', '④ a walk that timed out within CACHE_WALK_RETRY_MS is not repeated at the next reconnect: the cache stays (unread, fail closed)');
  const F0 = { id: 'F', name: 'F', type: 'rclone', rcloneType: 'local', desired: 'unmounted' }; g._state.mounts.push(F0);
  ok(await g._placeCache(F0) === path.join(LOCAL_ROOT, 'F') && !F0.cacheOld, '④ nothing cached yet ⇒ the first daemon starts on local disk (nothing to remove)');
  const G = seed(g, 'G', [META_CLEAN]);
  ok(g.list().find((x) => x.id === 'G').cache.why === 'at-remount' && g.list().find((x) => x.id === 'A').cache.why === null, '④ the row before any remount: "moves at the next reconnect"; after the move: no line');
  const gl = mk(MountManager, false, 'local');
  const L = seed(gl, 'L', [META_CLEAN]);
  ok(await gl._placeCache(L.m) === L.dir && L.m.cacheDir === L.dir && gl.list().find((x) => x.id === 'L').cache.why === null, '④ a LOCAL dataDir (the fleet PVC) keeps its cache where it is, nothing said');
  const other = path.join(D, 'not-A'); fs.mkdirSync(other);
  g._dropCacheDir(A.m, other); g._dropCacheDir(A.m, toA);
  g._dropCacheDir(A.m, A.m.cacheOld);
  ok(await until(() => !fs.existsSync(A.dir) && !A.m.cacheOld, 5000), '④ the old dir is removed by a CHILD rm and m.cacheOld cleared');
  ok(fs.existsSync(other) && fs.existsSync(toA), '④ never a dir not named after the record, never the live dir');
  void G;

  // ── ⑥ verify r1 → r2 (the data-loss verify on 82a834ada) ──
  const clean6 = W({ exists: true, files: 1, dirty: 0, unread: 0 }, null);
  // #0 a stat error that is not a TRUE absence is UNKNOWN ⇒ dirty ⇒ stay + said, per errno (the real child)
  for (const code of ['ESTALE', 'EIO', 'EACCES']) {
    const w = W({ exists: null, error: code, files: 0, dirty: 0, unread: 1 }, null);
    const pl = C({ ...net, exists: true, witness: w });
    ok(w.dirty && w.code === code && !pl.move && pl.reason === 'unread' && pl.code === code, `⑥#0 PURE: a ${code} on the record's dir ⇒ unknown ⇒ stay + said (${code})`);
  }
  const errnoRun = async (MM, how, tag) => {
    const g = mk(MM, true, 'e-' + tag + '-' + how), id = 'X' + how.replace(/\W/g, '');
    const dir = path.join(g.dataDir, 'park', 'vfs-cache', id), meta = path.join(dir, 'vfsMeta', 'od', 'x.txt');
    if (how === 'EACCES') { fs.mkdirSync(path.dirname(meta), { recursive: true }); fs.writeFileSync(meta, META_DIRTY); fs.chmodSync(path.dirname(dir), 0o000); }
    if (how === 'ENOTDIR') { fs.mkdirSync(path.dirname(path.dirname(dir)), { recursive: true }); fs.writeFileSync(path.dirname(dir), 'a file, not a dir'); }
    if (how === 'ELOOP') { fs.mkdirSync(path.dirname(dir), { recursive: true }); fs.symlinkSync(dir, dir); }
    if (how === 'absent') fs.mkdirSync(path.dirname(dir), { recursive: true });
    const m = { id, name: id, type: 'rclone', rcloneType: 'local', desired: 'unmounted', cacheDir: dir }; g._state.mounts.push(m);
    const to = await g._placeCache(m);
    if (how === 'EACCES') fs.chmodSync(path.dirname(dir), 0o700);
    return { to, dir, cacheOld: m.cacheOld || null, cell: g.list().find((x) => x.id === id).cache, local: path.join(LOCAL_ROOT, id) };
  };
  for (const [how, code] of [['EACCES', 'EACCES'], ['ENOTDIR', 'ENOTDIR'], ['ELOOP', 'ELOOP'], ['ENOENT-root', 'ENOENT-root']]) {
    const r = await errnoRun(MountManager, how, 'real');
    ok(r.to === r.dir && !r.cacheOld && r.cell.why === 'unread' && r.cell.code === code, `⑥#0 real child: ${how === 'ENOENT-root' ? 'an absent cache ROOT (a mount not there yet)' : 'a ' + how + ' stat of the record\'s dir'} ⇒ NOT moved, the row says "${code}"`, JSON.stringify(r));
  }
  const ab = await errnoRun(MountManager, 'absent', 'real');
  ok(ab.to === ab.local && !ab.cacheOld, '⑥#0 only a TRUE absence (the root exists, the per-mount dir does not) is a fresh switch', JSON.stringify(ab));
  // #1 an override that is not a writable dir is REFUSED (stay + said, the old dir never dropped); cleared ⇒ re-placed
  ok(!C({ ...net, candidates: [{ dir: '/ro/A', fs: 'local', writable: false, override: true, root: '/ro', why: 'EACCES' }], witness: clean6 }).move
    && !C({ ...net, dataDirNetwork: false, candidates: [{ dir: '/ro/A', fs: 'local', writable: false, override: true }], witness: clean6 }).move, '⑥#1 PURE: an unwritable override never wins (network or local dataDir)');
  const RO = path.join(D, 'ro'); fs.mkdirSync(RO); fs.chmodSync(RO, 0o500);
  const g7 = mk(MountManager, true, 'ov'); g7._getSetting = (k) => (k === 'mounts.vfsCacheRoot' ? path.join(RO, 'vc') : undefined);
  const O7 = seed(g7, 'O', [META_CLEAN]);
  const toO = await g7._placeCache(O7.m), cO = g7.list().find((x) => x.id === 'O').cache;
  ok(toO === O7.dir && !O7.m.cacheOld && fs.existsSync(path.join(O7.dir, 'vfs', 'od', 'f0.txt')) && cO.why === 'override-refused' && cO.override === path.join(RO, 'vc') && cO.code === 'EACCES',
    '⑥#1 real: mounts.vfsCacheRoot under a 0500 dir ⇒ refused: the daemon keeps its dir, nothing dropped, the row names the override + EACCES', JSON.stringify({ toO, cO }));
  const formerDir = path.join(D, 'former', 'P'); fs.mkdirSync(path.join(formerDir, 'vfsMeta', 'od'), { recursive: true }); fs.writeFileSync(path.join(formerDir, 'vfsMeta', 'od', 'a.txt'), META_CLEAN);
  const P7 = { id: 'P', name: 'P', type: 'rclone', rcloneType: 'local', desired: 'unmounted', cacheDir: formerDir }; g7._state.mounts.push(P7);
  g7._getSetting = () => undefined;
  const toP = await g7._placeCache(P7);
  ok(toP === path.join(LOCAL_ROOT, 'P') && P7.cacheOld === formerDir, '⑥#1 the override cleared ⇒ a record parked on the former override dir is RE-PLACED by the rule (never "stays local" there)', JSON.stringify({ toP, P7 }));
  fs.chmodSync(RO, 0o700);
  // #3 'local' means PERSISTENT: overlayfs / tmpfs / ramfs / 9p are not candidates
  ok(P.fsClassOf(0x794c7630) === 'ephemeral' && P.fsClassOf(0x01021994) === 'ephemeral' && P.fsClassOf(0x858458f6) === 'ephemeral' && P.fsClassOf(0x01021997) === 'ephemeral'
    && P.fsClassOf(0xEF53) === 'local' && P.fsClassOf(0x6969) === 'network' && P.fsClassOf(0x65735546) === 'network', '⑥#3 fsClassOf: overlayfs / tmpfs / ramfs / 9p ⇒ ephemeral; ext4 ⇒ local; NFS / FUSE ⇒ network');
  const judgeDurable = (PP) => !PP.cachePlacement({ recordDir: '/net/d/vfs-cache/A', recordFs: 'network', dataDirNetwork: true, dataDirDefault: '/net/d/vfs-cache/A', candidates: [{ dir: '/home/v/.cache/vibespace/vfs-cache/A', fs: PP.fsClassOf(0x01021994), writable: true }], witness: clean6 }).move;
  ok(judgeDurable(P), '⑥#3 PURE: a tmpfs home ⇒ the cache stays on the data dir (ephemeral-home)');
  const tmpT = MountManager._statfsType(os.tmpdir());
  ok(tmpT !== 0x01021994 || P.fsClassOf(tmpT) === 'ephemeral', `⑥#3 real statfs: ${os.tmpdir()} = 0x${(tmpT >>> 0).toString(16)} ⇒ ${P.fsClassOf(tmpT)}${tmpT === 0x01021994 ? ' (tmpfs here — never a candidate)' : ''}`);
  const g9 = mk(MountManager, true, 'eph', 'ephemeral');
  const E9 = seed(g9, 'H', [META_CLEAN]);
  ok(await g9._placeCache(E9.m) === E9.dir && !E9.m.cacheOld && g9.list().find((x) => x.id === 'H').cache.why === 'ephemeral-home', '⑥#3 real manager: an ephemeral home ⇒ the cache stays on the data dir, the row says the home is not a persistent disk');
  // #2 the walk memo: re-armed at EVERY timeout, cleared by a finished walk; no walk while the mount is down
  const memoRun = async (MM, tag) => {
    const g = mk(MM, true, 'memo-' + tag), S = seed(g, 'M', [META_CLEAN]);
    let walks = 0, mode = 'timeout'; const realRead = g._readCacheMeta.bind(g);
    g._readCacheMeta = async (d) => { walks++; return mode === 'timeout' ? { timedOut: true } : realRead(d); };
    await g._placeCache(S.m); await g._placeCache(S.m);
    const w1 = walks;
    g._cacheWalkFailed.set('M', Date.now() - MM.CACHE_WALK_RETRY_MS - 60e3);
    await g._placeCache(S.m); const rearmed = Date.now() - g._cacheWalkFailed.get('M') < 60e3; await g._placeCache(S.m);
    const w2 = walks;
    g._cacheWalkFailed.set('M', Date.now() - MM.CACHE_WALK_RETRY_MS - 60e3); mode = 'real';
    const to = await g._placeCache(S.m);
    const D2 = seed(g, 'Nd', [META_CLEAN]); g._liveness = new Map([['Nd', { verdict: 'dead' }], ['Nu', { verdict: 'unreachable' }]]);
    const w3 = walks, toD = await g._placeCache(D2.m);
    return { w1, w2, rearmed, moved: to === path.join(LOCAL_ROOT, 'M'), cleared: !g._cacheWalkFailed.has('M'), downWalked: walks !== w3, downStay: toD === D2.dir, downCell: g.list().find((x) => x.id === 'Nd').cache };
  };
  const mr = await memoRun(MountManager, 'real');
  ok(mr.w1 === 1 && mr.w2 === 2 && mr.rearmed, '⑥#2 a timed-out walk is not repeated inside the window; after it, the next timeout RE-ARMS the memo (2 walks, not 3)', JSON.stringify(mr));
  ok(mr.moved && mr.cleared, '⑥#2 a walk that finished clears the memo (and a clean cache moves)', JSON.stringify(mr));
  ok(!mr.downWalked && mr.downStay && mr.downCell.why === 'unread' && mr.downCell.code === 'mount-dead', '⑥#2 the mount is down (liveness dead) ⇒ no walk at all: the cache stays, the row says mount-dead', JSON.stringify(mr));
  // #4 (refuted): covered by the STARTING suite — a joined start never reaches _placeCache while the old daemon lives

  // ── ⑤ patched-copy controls ──
  const MC = mutantCopies('vfs-cache-place', REPO);
  const psrc = fs.readFileSync(path.join(REPO, 'src/vfs-cache-place.js'), 'utf8');
  const grepFrom = 'function metaVerdict(text) {\n', grepTo = 'function metaVerdict(text) { return /"Dirty":true/.test(text) ? \'dirty\' : \'clean\';\n';
  ok(psrc.includes(grepFrom) && !judgeMeta(MC.load('src/vfs-cache-place.js', psrc.replace(grepFrom, grepTo), 'grep')), '⑤ NEGATIVE CONTROL: a grep-for-a-spelling witness reads the real dirty file CLEAN (red)');
  const dirtyFrom = '  if (witness.dirty) return stay(';
  ok(psrc.includes(dirtyFrom) && !judgePlace(MC.load('src/vfs-cache-place.js', psrc.replace(dirtyFrom, '  if (false) return stay('), 'movedirty')), '⑤ NEGATIVE CONTROL: a move while dirty (red)');
  const msrc = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8');
  const cpFrom = '      m.cacheDir = p.dir;\n      if (p.from) m.cacheOld = p.from;\n';
  ok(msrc.includes(cpFrom), '⑤ the copy control anchors on the real switch');
  const gm = mk(MC.load('src/mounts.js', msrc.replace(cpFrom, '      if (p.from) fs.cpSync(p.from, p.dir, { recursive: true });\n' + cpFrom), 'copy').MountManager, true, 'mut');
  const AM = seed(gm, 'AM', [META_CLEAN]);
  const toM = await gm._placeCache(AM.m);
  ok(fs.readdirSync(toM).length > 0, '⑤ NEGATIVE CONTROL: a copy instead of a switch fills the new dir (the switch leg above would be red)');
  // r2 controls (verify r1 #0 #1 #2 #3)
  const statFrom = msrc.slice(msrc.indexOf('try { const st = fs.statSync(dir); out.exists'), msrc.indexOf("out.error = 'ENOENT-root'; } }\n}\n") + "out.error = 'ENOENT-root'; } }\n}\n".length);
  ok(statFrom.length > 100, '⑤ the #0 control anchors on the real stat block');
  const MM0 = MC.load('src/mounts.js', msrc.replace(statFrom, 'try { out.exists = fs.statSync(dir).isDirectory(); } catch {}\n'), 'catchall').MountManager;
  const e0 = await errnoRun(MM0, 'EACCES', 'mut');
  ok(e0.to === e0.local, '⑤ NEGATIVE CONTROL #0: the old catch{} shape ⇒ an EACCES dirty cache moves "fresh" and is orphaned (red)', JSON.stringify(e0));
  const ovFrom = "    if (!ov.writable) return stay('override-refused',";
  ok(psrc.includes(ovFrom) && MC.load('src/vfs-cache-place.js', psrc.replace(ovFrom, "    if (false) return stay('override-refused',"), 'ovw').cachePlacement({ ...net, candidates: [{ dir: '/ro/A', fs: 'local', writable: false, override: true }], witness: clean6 }).move, '⑤ NEGATIVE CONTROL #1: an override obeyed without its writable check ⇒ moves onto the dead dir (red)');
  const durFrom = " : NON_DURABLE_FS_MAGIC.includes(t) ? 'ephemeral'";
  ok(psrc.includes(durFrom) && !judgeDurable(MC.load('src/vfs-cache-place.js', psrc.replace(durFrom, ''), 'netonly')), '⑤ NEGATIVE CONTROL #3: the old NETWORK_FS_MAGIC alone ⇒ a tmpfs home is "local" ⇒ the cache moves onto it (red)');
  const memoFrom = 'if (meta && meta.timedOut) memo.set(m.id, Date.now());';
  const mm2 = msrc.includes(memoFrom) && await memoRun(MC.load('src/mounts.js', msrc.replace(memoFrom, 'if (meta && meta.timedOut && !memo.get(m.id)) memo.set(m.id, Date.now());'), 'memo1').MountManager, 'mut');
  ok(mm2 && mm2.w2 === 3, '⑤ NEGATIVE CONTROL #2: the memo armed only once ⇒ every reconnect after the window walks again (red)', JSON.stringify(mm2));
} finally {
  await sleep(200);
  fs.rmSync(D, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
