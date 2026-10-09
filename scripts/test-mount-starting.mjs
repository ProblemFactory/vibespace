#!/usr/bin/env node
// A mount whose daemon is still STARTING (2.369.213, the owner's OneDrive,
// 2026-10-04): rclone --vfs-cache-mode full rebuilt its cache index (164 788
// files, 4.5 min) before mounting; the fixed 5 s verdict called it failed,
// unblocked the bare mount point (an outside writer dropped .restore there →
// rclone died "not empty"), and each Connect killed the scan before it.
// A FAKE rclone (bash re-exec'd so argv[0] reads …/rclone, like the real
// daemon the /proc scan matches) drives the REAL MountManager:
//   ① starting state + cache count, path blocked + shadowed the whole window
//   ② a second connect JOINS (one daemon) ③ a restarted server ADOPTS it
//   ④ the health sweep never touches a starting daemon; a mounted daemon
//     making CPU progress is not torn down (the 15:09 / 16:41 path), an idle one still is
//   ⑤ a hung daemon (no CPU progress) is killed ⑥ "not empty" → stranded + ONE retry, said on the row
//   ⑦ patched-copy controls: the 5 s verdict restored ⇒ red; unblock before mount ⇒ red
//   ⑧ the log survives a remount (lane mount-argv-dir-cache): a killed daemon's last line is still readable after
//     the next daemon mounts (the log was reopened 'w' at every spawn)
//   ⑨ the VFS cache moves across a remount only when clean (lane vfs-cache-local): dirty ⇒ kept; clean ⇒ the local dir,
//     the old one removed by a child after the mount; a witness-skipping mutant moves a dirty cache (red)
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
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } return !!(await fn()); };

const D = fs.mkdtempSync(path.join(process.env.VS_TEST_TMP || os.tmpdir(), 'vs-mstart-'));
const FAKE = path.join(D, 'bin', 'rclone');
fs.mkdirSync(path.dirname(FAKE), { recursive: true });
fs.writeFileSync(FAKE, `#!/bin/bash
if [ -z "$FAKE_REEXEC" ]; then FAKE_REEXEC=1 exec -a "$0" /bin/bash "$0" "$@"; fi
[ "$1" = mount ] || exit 0
MP="$3"; echo "$MP" >> "$FAKE_DIR/spawns"
[ -n "$FAKE_SAY" ] && echo "$FAKE_SAY $$"
busy() { local end=$(( \${EPOCHREALTIME/./} + $1 * 1000000 )); while (( \${EPOCHREALTIME/./} < end )); do :; done; }
idle() { while :; do sleep 1; done; }
case "$FAKE_MODE" in
  hang) idle ;;
  nonempty) busy 1; if [ -n "$(ls -A "$MP")" ]; then echo "ERROR : mount helper error: failed to mount FUSE fs: \\"$MP\\" is not empty, use --allow-non-empty"; exit 1; fi ;;
esac
busy "\${FAKE_SCAN_S:-0}"
echo "rclone $MP fuse.rclone rw 0 0" > "$FAKE_DIR/mounted-$(basename "$MP")"
busy "\${FAKE_BUSY_AFTER:-0}"; idle
`, { mode: 0o755 });
const T = { ceilingMs: 20000, hungMs: 1500, progressTicks: 5, pollMs: 100, quickMs: 400, countCap: 100000 };
const spawns = (mp) => { try { return fs.readFileSync(path.join(D, 'spawns'), 'utf8').split('\n').filter((l) => l === mp).length; } catch { return 0; } };

function makeMgr(MM, tag, recs) {
  const dataDir = path.join(D, 'data-' + tag); fs.mkdirSync(dataDir, { recursive: true });
  const mgr = new MM({ dataDir, broadcast: () => {} });
  mgr._startingT = T; mgr._rcloneFlagsHelp = ''; mgr.rcloneBin = () => FAKE;
  mgr._rcloneFor = (m) => ({ env: { ...process.env, FAKE_DIR: D, ...m.fake }, remote: 'VS:' });
  mgr._liveMounts = () => fs.readdirSync(D).filter((f) => f.startsWith('mounted-')).map((f) => fs.readFileSync(path.join(D, f), 'utf8')).join('');
  for (const r of recs) mgr._state.mounts.push({ type: 'rclone', rcloneType: 'local', desired: 'unmounted', customPath: path.join(D, 'mnt', r.name), ...r });
  return mgr;
}
const rec = (id, fake) => ({ id, name: id, fake });
const row = (mgr, id) => mgr.list().find((x) => x.id === id);
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const all = [];

try {
  // ── ①–④ a daemon still rebuilding its cache index ──
  const A = rec('A', { FAKE_SCAN_S: '2' });
  const mgr = makeMgr(MountManager, 'main', [A, rec('H', { FAKE_MODE: 'hang' }), rec('N', { FAKE_MODE: 'nonempty', FAKE_SCAN_S: '1' }), rec('B', { FAKE_BUSY_AFTER: '20' })]);
  all.push(mgr);
  const cache = path.join(mgr._vfsCacheRoot(), 'A', 'vfs', 'od');
  fs.mkdirSync(cache, { recursive: true });
  for (let i = 0; i < 1234; i++) fs.writeFileSync(path.join(cache, 'f' + i), '');
  const A0 = mgr._get('A'), mpA = mgr.pathOf(A0);
  ok(MountManager.STARTING.ceilingMs === 15 * 60e3 && MountManager.STARTING.hungMs === 60e3 && MountManager.STARTING.countCap === 200000, 'production timing: 15 min ceiling, hung = 60 s without CPU progress, count stops at 200 000');
  const r1 = await mgr.mount('A');
  ok(r1 === 'starting', '① a daemon alive past the quick window answers "starting" — never failed', String(r1));
  await until(() => row(mgr, 'A').starting?.files != null, 3000);
  const ra = row(mgr, 'A');
  ok(ra.starting && ra.starting.files === 1234 && ra.starting.capped === false && !ra.mounted && !ra.error, '① the row carries the starting state with the cached-file count (and no error)', JSON.stringify(ra.starting) + ' ' + ra.error);
  ok(!!mgr.pathBlocked(path.join(mpA, 'AIWorkspace', '.restore')) && mgr.shadowedBy(path.join(mpA, 'x')) === A0, '① the mount point stays BLOCKED and shadowed through the starting window');
  const capped = await mgr._countCacheFiles(path.join(mgr._vfsCacheRoot(), 'A'), 1000);
  ok(capped.n === 1000 && capped.capped === true, '① the count is bounded (stops at the cap, says capped)', JSON.stringify(capped));
  const pidA = mgr._daemonPids(mpA);
  const r2 = await mgr.mount('A');
  ok(r2 === 'starting' && spawns(mpA) === 1 && mgr._daemonPids(mpA).join() === pidA.join() && pidA.length === 1, '② a second connect JOINS the starting daemon (one daemon, no kill, no respawn)', `${r2} spawns=${spawns(mpA)} pids=${mgr._daemonPids(mpA)}`);
  const mgr2 = makeMgr(MountManager, 'restart', [A]); all.push(mgr2);
  const r3 = await mgr2.mount('A');
  ok(r3 === 'starting' && spawns(mpA) === 1 && mgr2._daemonPids(mpA).join() === pidA.join(), '③ a restarted server ADOPTS the scanning daemon instead of killing it', `${r3} spawns=${spawns(mpA)}`);
  const calls = []; const realUnmount = mgr.unmount.bind(mgr);
  mgr.unmount = async (id, o) => { calls.push(id); return true; };
  mgr._state.mounts.find((m) => m.id === 'H').desired = 'unmounted';
  await mgr._healthSweep();
  ok(calls.length === 0 && mgr._daemonPids(mpA).join() === pidA.join() && spawns(mpA) === 1, '④ the health sweep neither unmounts, remounts nor kills a starting daemon', calls.join());
  ok(await until(() => row(mgr, 'A').mounted && !row(mgr, 'A').starting, 6000), '① …and the same daemon mounts when its scan ends');
  await until(() => !mgr.pathBlocked(mpA), 3000);
  ok(!mgr.pathBlocked(mpA) && mgr.shadowedBy(path.join(mpA, 'x')) === null && !row(mgr, 'A').error, '① the path unblocks only after the fuse mount exists + its probe passed');

  // ── ⑤ hung: alive, no CPU progress, no mount ──
  const r5 = await mgr.mount('H');
  const mpH = mgr.pathOf(mgr._get('H'));
  ok(r5 === 'starting', '⑤ a fresh daemon starts as "starting"');
  ok(await until(() => mgr._daemonPids(mpH).length === 0 && /no progress/.test(row(mgr, 'H').error || ''), 5000), '⑤ a daemon with no CPU progress for the hung window and no mount is KILLED, said on the row', row(mgr, 'H').error);

  // ── ⑥ not empty → stranded + ONE retry ──
  const mpN = mgr.pathOf(mgr._get('N'));
  const r6 = await mgr.mount('N');
  fs.mkdirSync(path.join(mpN, 'AIWorkspace'), { recursive: true });
  fs.writeFileSync(path.join(mpN, 'AIWorkspace', '.restore'), 'x'); // an outside writer that ignores the block
  ok(r6 === 'starting' && await until(() => row(mgr, 'N').mounted, 9000), '⑥ rclone dies "not empty" → strays isolated → ONE retry mounts', `${r6} ${row(mgr, 'N').error}`);
  const sib = fs.readdirSync(path.join(D, 'mnt')).filter((f) => f.startsWith('N.stranded-'));
  ok(sib.length === 1 && fs.existsSync(path.join(D, 'mnt', sib[0], 'AIWorkspace', '.restore')) && spawns(mpN) === 2, '⑥ the stray tree moved to <mp>.stranded-<ts>/ (nothing deleted), exactly 2 spawns', `${sib} spawns=${spawns(mpN)}`);
  ok(row(mgr, 'N').stranded === path.join(D, 'mnt', sib[0]), '⑥ the move is said on the row (the stranded path)', row(mgr, 'N').stranded);

  // ── ④ (the 15:09 / 16:41 path): a mounted daemon whose listing is slow ──
  await mgr.mount('B');
  ok(row(mgr, 'B').mounted, '④ B mounted (its daemon keeps burning CPU after mounting)');
  mgr._probeMountpoint = async () => { await sleep(700); return 'hung'; }; // the real probe needs 6 s to say hung
  await sleep(300);
  await mgr._healthSweep();
  ok(!calls.includes('A') && /not answering/.test(row(mgr, 'A').error || ''), '④ the first silent sweep is a STRIKE, never a teardown (lane mount-liveness: strikes ≥ 2)', calls.join());
  await mgr._healthSweep();   // the second consecutive silent sweep — the deadlock signature
  ok(!calls.includes('B') && mgr._daemonPids(mgr.pathOf(mgr._get('B'))).length === 1 && /storage busy/.test(row(mgr, 'B').error || ''), '④ a slow listing while the daemon makes CPU progress is NOT torn down (no lazy unmount, no kill)', calls.join() + ' ' + row(mgr, 'B').error);
  ok(calls.includes('A'), '④ …while an IDLE daemon whose listing hangs still is (the unreachable-host defense stands)', calls.join());
  mgr.unmount = realUnmount;

  // ── ⑦ patched-copy controls ──
  const src = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8');
  const scenario = async (MM, tag) => {
    const R = rec('M' + tag, { FAKE_SCAN_S: '2' });
    const g = makeMgr(MM, tag, [R]); all.push(g);
    await g.mount(R.id); await sleep(800);
    const mp = g.pathOf(g._get(R.id));
    return { starting: !!row(g, R.id).starting, blocked: !!g.pathBlocked(mp), alive: g._daemonPids(mp).length === 1, error: row(g, R.id).error };
  };
  const MC = mutantCopies('mount-starting', REPO); // patched copies live outside the tree (§51)
  const mutant = async (tag, from, to) => (src.includes(from) ? scenario(require(MC.write('src/mounts.js', src.replace(from, to), tag)).MountManager, tag) : null);
  const real = await scenario(MountManager, 'real');
  ok(real.starting && real.blocked && real.alive, '⑦ control baseline: the real module keeps a starting daemon alive and its path blocked', JSON.stringify(real));
  const m1 = await mutant('5s', 'now - t0 >= T.ceilingMs', 'now - t0 >= T.quickMs');
  ok(m1 && !m1.alive && !m1.starting, '⑦ NEGATIVE CONTROL: the fixed 5 s verdict restored ⇒ the scanning daemon is called failed and killed (red)', JSON.stringify(m1));
  const m2 = await mutant('unblock', 'this.blockPath(mp, T.ceilingMs + 60e3);', 'this.unblockPath(mp);');
  ok(m2 && !m2.blocked, '⑦ NEGATIVE CONTROL: unblock before the mount exists ⇒ the bare directory is writable (red)', JSON.stringify(m2));

  // ── ⑧ the log survives a remount ──
  const gl = makeMgr(MountManager, 'log', [rec('L', { FAKE_SAY: 'NOTICE: fake daemon' })]); all.push(gl);
  const mpL = gl.pathOf(gl._get('L'));
  await gl.mount('L');
  ok(await until(() => row(gl, 'L').mounted, 5000), '⑧ the first daemon mounts');
  const pid1 = gl._daemonPids(mpL)[0];
  gl._killMountDaemon(mpL); fs.rmSync(path.join(D, 'mounted-L'), { force: true });
  await until(() => gl._daemonPids(mpL).length === 0, 3000);
  await gl.mount('L');
  ok(await until(() => row(gl, 'L').mounted, 5000), '⑧ …is killed, and a second daemon mounts the same record');
  const pid2 = gl._daemonPids(mpL)[0];
  const lines = gl.tailMountLog('L', 10);
  ok(pid1 && pid2 && pid1 !== pid2 && lines.includes(`NOTICE: fake daemon ${pid1}`) && lines.includes(`NOTICE: fake daemon ${pid2}`) && lines.filter((l) => l.startsWith(MountManager.LOG_MARK)).length === 2,
    '⑧ the dead daemon\'s last line is still readable after the remount (one spawn marker each)', `${pid1} ${pid2} ${JSON.stringify(lines)}`);
  ok(gl.tailMountLog('L', 5, { current: true }).join('|') === `NOTICE: fake daemon ${pid2}`, '⑧ the newest daemon\'s own lines (what the start verdict quotes) hold only its words');

  // ── ⑨ the VFS cache moves across a remount ONLY when clean (lane vfs-cache-local, B-4997): a real-shape vfsMeta item
  // ("Dirty": true WITH Go's space) ⇒ the next daemon restarts on the OLD dir; a clean one ⇒ the daemon gets the local
  // dir and the old one is removed by a child only AFTER the mount; a mutant that skips the witness ⇒ the dirty cache moves (red)
  process.env.HOME = path.join(D, 'home-c'); delete process.env.VIBESPACE_VFS_CACHE_DIR;
  const META = (dirty) => `{\n\t"ModTime": "2026-10-09T04:42:04.4329626-07:00",\n\t"Size": 6,\n\t"Rs": [\n\t\t{\n\t\t\t"Pos": 0,\n\t\t\t"Size": 6\n\t\t}\n\t],\n\t"Fingerprint": "",\n\t"Dirty": ${dirty}\n}\n`;
  const cacheRun = async (MM, tag, dirty) => {
    const id = 'C' + tag, g = makeMgr(MM, 'c' + tag, [rec(id, { FAKE_SCAN_S: '1' })]);
    all.push(g);
    const dd = path.join(D, 'data-c' + tag);
    g._cacheFs = (d) => (d === dd || d.startsWith(dd + '/')) ? 'network' : 'local';
    const old = path.join(g._vfsCacheRoot(), id), metaF = path.join(old, 'vfsMeta', 'VS', 'notes.txt');
    fs.mkdirSync(path.dirname(metaF), { recursive: true }); fs.writeFileSync(metaF, META(dirty));
    fs.mkdirSync(path.join(old, 'vfs', 'VS'), { recursive: true }); fs.writeFileSync(path.join(old, 'vfs', 'VS', 'notes.txt'), 'hello\n');
    const given = []; const argv0 = g._mountArgv.bind(g); g._mountArgv = (m, o) => { given.push(o.cacheDir); return argv0(m, o); };
    await g.mount(id);
    const oldWhileStarting = fs.existsSync(old) && !!row(g, id).starting;
    const mounted = await until(() => row(g, id).mounted, 8000);
    await until(() => !fs.existsSync(old), dirty ? 1500 : 5000);
    return { given: given[0], oldWhileStarting, mounted, oldAfter: fs.existsSync(old), local: path.join(D, 'home-c', '.cache', 'vibespace', 'vfs-cache', id), cell: row(g, id).cache };
  };
  const cd = await cacheRun(MountManager, 'd', true);
  ok(cd.mounted && cd.given === path.join(D, 'data-cd', 'vfs-cache', 'Cd') && cd.oldAfter && cd.cell.why === 'dirty' && cd.cell.items === 1, '⑨ a "Dirty": true vfsMeta item ⇒ NO move across the remount: the daemon restarts on the old dir, nothing removed, the row says 1 item still uploading', JSON.stringify(cd));
  const cc = await cacheRun(MountManager, 'c', false);
  ok(cc.given === cc.local && cc.oldWhileStarting, '⑨ a clean cache ⇒ the new daemon gets the local dir; the old dir still exists while it starts', JSON.stringify(cc));
  ok(cc.mounted && !cc.oldAfter && cc.cell.why === null, '⑨ …and the old dir is gone once the new daemon MOUNTED (a child rm), the row says nothing', JSON.stringify(cc));
  {
    const MCc = mutantCopies('mount-starting-cache', REPO), msrc = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8');
    const from = 'witness: CACHE_PLACE.dirtyWitness(meta, rcQueue) }';
    const cm = msrc.includes(from) ? await cacheRun(require(MCc.write('src/mounts.js', msrc.replace(from, "witness: { dirty: false, items: 0, why: 'clean' } }"), 'nowitness')).MountManager, 'm', true) : null;
    ok(cm && cm.given === cm.local && !cm.oldAfter, '⑨ NEGATIVE CONTROL: the witness skipped ⇒ the DIRTY cache moves and its old dir (the un-uploaded write) is deleted (red)', JSON.stringify(cm));
  }

  // ── the row: no Connect while starting, the line says what it waits for ──
  const sb = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  ok(/\} else if \(!isCred && !m\.starting\) \{/.test(sb) && /if \(!isCred && !m\.starting\) \{\s*row\.classList\.add\('mounts-row-clickable'\)/.test(sb), 'the row offers NO Connect (button or row click) while starting');
  ok(/sl\.dataset\.key = 'mount-start:' \+ m\.id/.test(sb) && /if \(!sl\.isConnected\) \{ clearInterval\(tick\); return; \} sl\.textContent = words\(\);/.test(sb), 'the starting line is keyed and its elapsed time is patched in place');
  const key = 'Starting — rebuilding its cache index ({files} files), {elapsed} so far; it mounts by itself when the scan ends (waits up to {max} min)';
  ok(sb.includes(key) && ['zh', 'ja'].every((l) => fs.readFileSync(path.join(REPO, `src/lib/i18n-${l}.js`), 'utf8').includes(JSON.stringify(key) + ':')), 'the starting words are translated (zh/ja)');
} finally {
  for (const g of all) for (const m of g._state.mounts) { try { g._killMountDaemon(g.pathOf(m)); } catch {} }
  await sleep(1200);
  fs.rmSync(D, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
