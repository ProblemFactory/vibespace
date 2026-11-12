#!/usr/bin/env node
// test-mount-path-class — lane hub-fuse-sync-guard (the hub's 6.5-min hold of 2026-10-23: its main thread waited in the
// kernel's FUSE wait inside a synchronous fs call on an rclone storage mount). PURE src/mount-path-class.js — WHERE A
// PATH LIVES — and the SHARED answer every module asks, src/storage-path.js:
//   ① THE ROOTS from a mountinfo fixture (the owner's box at the incident, redacted): every FUSE / NFS mount is a root,
//      fusectl / fuseblk / procfs / ext4 are not; octal escapes are undone
//   ② the kinds: the workspace bindfs (it holds rootDir) is 'home', a hand-made NFS 'network', rclone / portal / gvfs
//      'storage'; a product storage row is 'storage' mounted or not (an unmounted one is the bare folder)
//   ③ THE EXEMPTION: rootDir / dataDir are 'local' though they sit under the bindfs; a session cwd beside them is 'mount'
//   ④ resolve, never realpath: '..' / '.' / '//' collapse, a symlink is judged where it stands, a relative path needs a cwd
//      (none ⇒ 'unknown'), '~' resolves against home, a descriptor is 'unknown', a path EQUAL to a root is under it, a
//      sibling sharing the root's prefix is not
//   ⑤ storage-path: no roots set ⇒ null everywhere (the device daemon, a child); set ⇒ storageRootOf names the storage
//      root and never a home / network one
//   ⑥ A VIEW IS CLASSED BY WHAT IT SHOWS (lane mount-class-by-source): the box's two real rows — the instance on the view
//      ⇒ home, on the local disk ⇒ network, every project path the same before and after; over the local disk 'disk' (a
//      watched root, never refused — the watch follows the daemon, only the refusal follows the source); the
//      controls stay storage (rclone, sshfs, a bindfs over them, a source not a path or absent, a product row, a product
//      folder); the match (escapes, `bindfs /d /d`, a view of a view, a loop ⇒ storage); the words
//      ROUND 2 (law 3 made exact): a storage mount or product row BELOW a view's source is storage through the view; equal
//      mount points ⇒ the last row before the view; rows after it inside it never its source; no depth rule; disk words
// Run: node scripts/test-mount-path-class.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const MPC = require(path.join(REPO, 'src/mount-path-class.js'));
const SP = require(path.join(REPO, 'src/storage-path.js'));
let pass = 0, fail = 0;
const ok = (c, n, detail) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (detail === undefined ? '' : ' — ' + JSON.stringify(detail))); } };

// the owner's /proc/self/mountinfo at the incident (2026-10-23), redacted: the user is `u`, the NAS 192.0.2.10, the rclone
// remotes VS{a}…; trimmed to one line per kind that matters
const HOME = '/home/u';
const MOUNTINFO = [
  '1 0 259:2 / / rw,relatime shared:1 - ext4 /dev/nvme0n1p2 rw',
  '22 1 0:21 / /proc rw,nosuid,nodev,noexec,relatime shared:12 - proc proc rw',
  '37 46 0:37 / /sys/fs/fuse/connections rw,nosuid,nodev,noexec,relatime shared:20 - fusectl fusectl rw',
  '831 42 0:67 / /mnt/nas_public rw,noatime shared:1016 - nfs4 192.0.2.10:/volume1/Public rw,vers=4.1,hard',
  '862 42 0:69 / /mnt/nfs_workspace rw,noatime shared:1046 - nfs4 192.0.2.10:/volume1/homes/u/Workspace rw,vers=4.1,hard',
  `589 42 0:65 / ${HOME}/workspace rw,relatime shared:1061 - fuse.bindfs /mnt/nfs_workspace rw,user_id=0,group_id=0,default_permissions,allow_other`,
  `1000 42 0:73 / ${HOME}/vibespace-mounts/NAS rw,nosuid,nodev,relatime shared:968 - fuse.rclone VS{a}: rw,user_id=1000,group_id=1000`,
  `2985 42 0:144 / ${HOME}/vibespace-mounts/OneDrive rw,nosuid,nodev,relatime shared:607 - fuse.rclone VS{b}: rw,user_id=1000,group_id=1000`,
  '1124 42 0:90 / /mnt/gdrive_39ai rw,nosuid,nodev,relatime shared:318 - fuse.rclone VS{c}: rw,user_id=1000,group_id=1000',
  '2914 468 0:85 / /run/user/1000/doc rw,nosuid,nodev,relatime shared:1110 - fuse.portal portal rw,user_id=1000,group_id=1000',
  '350 468 0:98 / /run/user/1000/gvfs rw,nosuid,nodev,relatime shared:1106 - fuse.gvfsd-fuse gvfsd-fuse rw,user_id=1000,group_id=1000',
  '400 42 8:17 / /media/usb rw,relatime shared:1200 - fuseblk /dev/sdb1 rw,user_id=0,group_id=0,allow_other',
  `401 42 0:150 / ${HOME}/My\\040Share rw,relatime shared:1201 - cifs //192.0.2.10/share rw`,
  '',
  'garbage line',
].join('\n');
const ROOT_DIR = `${HOME}/workspace/AIWorkspace/vibespace`;
const DATA_DIR = `${ROOT_DIR}/data`;
const REGISTRY = [{ mountpoint: `${HOME}/vibespace-mounts/NAS`, name: 'NAS', id: 'mnt-1' }, { mountpoint: `${HOME}/vibespace-mounts/Gone`, name: 'Gone', id: 'mnt-2' }];

console.log('① the roots from the mountinfo of the incident');
const rows = MPC.parseMountinfo(MOUNTINFO);
ok(rows.length === 13 && rows.every((r) => r.mountpoint && r.fstype), `every well-formed line is a row (${rows.length}), a line it cannot read is skipped`);
ok(rows.some((r) => r.mountpoint === `${HOME}/My Share` && r.fstype === 'cifs'), 'octal escapes undone (\\040 → a space)');
const roots = MPC.rootsOf({ mounts: rows, registry: REGISTRY, rootDir: ROOT_DIR, dataDir: DATA_DIR });
const at = (p) => roots.find((r) => r.root === p);
ok(['/proc', '/sys/fs/fuse/connections', '/media/usb', '/'].every((p) => !at(p)), 'procfs, fusectl, fuseblk (a FUSE over a LOCAL disk) and / are never roots', roots.map((r) => r.root));
ok(roots.length === 10 && roots.every((r, i) => !i || roots[i - 1].root.length >= r.root.length), `10 roots (the NAS row and its mount are one), the longest first (${roots.map((r) => r.root).join(' ')})`);

console.log('② the kinds');
ok(at(`${HOME}/workspace`).kind === 'home' && at(`${HOME}/workspace`).fstype === 'fuse.bindfs', 'the workspace bindfs holds rootDir ⇒ home (witnessed, never refused)');
ok(at('/mnt/nfs_workspace').kind === 'network' && at('/mnt/nas_public').kind === 'network', 'a kernel NFS mount the instance does not live on ⇒ network');
ok(['/mnt/gdrive_39ai', '/run/user/1000/doc', '/run/user/1000/gvfs', `${HOME}/vibespace-mounts/OneDrive`, `${HOME}/My Share`].every((p) => at(p).kind === 'storage'), 'rclone by hand, the doc portal, gvfs, cifs ⇒ storage');
ok(at(`${HOME}/vibespace-mounts/NAS`).kind === 'storage' && at(`${HOME}/vibespace-mounts/NAS`).name === 'NAS' && at(`${HOME}/vibespace-mounts/NAS`).id === 'mnt-1' && at(`${HOME}/vibespace-mounts/NAS`).fstype === 'fuse.rclone', 'a product storage row carries its name + id beside the mountinfo fstype');
ok(at(`${HOME}/vibespace-mounts/Gone`) && at(`${HOME}/vibespace-mounts/Gone`).kind === 'storage' && at(`${HOME}/vibespace-mounts/Gone`).fstype === null, 'a storage row NOT mounted is still a storage root (the bare folder the shadow rule guards)');
ok(MPC.rootsOf({ mounts: rows, registry: [{ mountpoint: ROOT_DIR + '/data' }], rootDir: ROOT_DIR, dataDir: DATA_DIR }).find((r) => r.root === DATA_DIR).kind === 'home', 'a registry row that holds dataDir is home (a pod whose data sits on its storage row)');

console.log('③ the exemption: the instance\'s own subtree');
const ctx = { mountRoots: roots, rootDir: ROOT_DIR, dataDir: DATA_DIR, home: HOME, cwd: ROOT_DIR };
ok(MPC.pathClass(`${DATA_DIR}/session-meta/cw-1.json`, ctx) === 'local' && MPC.pathClass(`${ROOT_DIR}/package.json`, ctx) === 'local' && MPC.rootOf(DATA_DIR, ctx) === null, 'rootDir / dataDir are local though the bindfs holds them');
ok(MPC.pathClass(`${HOME}/workspace/AIWorkspace/SharedContext/notes.md`, ctx) === 'mount' && MPC.rootOf(`${HOME}/workspace/x`, ctx).kind === 'home', 'a session cwd beside them on the bindfs is a mount path (home: witnessed)');
ok(MPC.rootOf(`${HOME}/vibespace-mounts/OneDrive/Courses/AIContext`, ctx).kind === 'storage', 'the Task Group row of the incident (a OneDrive folder) is on a storage root');
ok(MPC.pathClass(`${HOME}/.claude/projects/x.jsonl`, ctx) === 'local' && MPC.pathClass('/tmp/x', ctx) === 'local', 'HOME dot-dirs and /tmp are local');

console.log('④ resolve, never realpath');
ok(MPC.pathClass(`${HOME}/vibespace-mounts/NAS`, ctx) === 'mount' && MPC.rootOf(`${HOME}/vibespace-mounts/NAS/`, ctx).root === `${HOME}/vibespace-mounts/NAS`, 'a path EQUAL to a root (with or without its slash) is under it');
ok(MPC.pathClass(`${HOME}/vibespace-mounts/NASBackup/x`, ctx) === 'local' && MPC.pathClass(`${HOME}/vibespace-mounts`, ctx) === 'local', 'a sibling sharing the root\'s prefix is not under it, nor is the root\'s parent (its listing never enters the mount)');
ok(MPC.pathClass(`${HOME}/vibespace-mounts/x/../NAS/./a//b`, ctx) === 'mount' && MPC.pathClass(`${HOME}/vibespace-mounts/NAS/../x`, ctx) === 'local', '. / .. / // collapse by path rules before the judge');
ok(MPC.pathClass('data/x.json', ctx) === 'local' && MPC.pathClass('../../../vibespace-mounts/NAS/x', ctx) === 'mount', 'a relative path resolves against the cwd handed in');
ok(MPC.pathClass('x.json', { ...ctx, cwd: null }) === 'unknown' && MPC.pathClass(7, ctx) === 'unknown' && MPC.pathClass('', ctx) === 'unknown' && MPC.pathClass('a\0b', ctx) === 'unknown', 'no cwd ⇒ a relative path is unknown; a descriptor, an empty path, a NUL are unknown');
ok(MPC.pathClass('~/vibespace-mounts/OneDrive/x', ctx) === 'mount' && MPC.pathClass('~', ctx) === 'local', '~ resolves against home');
ok(MPC.pathClass(Buffer.from(`${HOME}/vibespace-mounts/NAS/x`), ctx) === 'mount' && MPC.pathClass(new URL(`file://${HOME}/vibespace-mounts/NAS/a%20b`), ctx) === 'mount', 'a Buffer and a file: URL are judged by the path they carry');
{ // a symlink INTO a mount is judged where it stands (a realpath would be a synchronous walk into the very mount)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mpc-'));
  try {
    fs.mkdirSync(path.join(dir, 'mnt'));
    fs.symlinkSync(path.join(dir, 'mnt'), path.join(dir, 'link'));
    const c2 = { mountRoots: [{ root: path.join(dir, 'mnt'), kind: 'storage' }] };
    ok(MPC.pathClass(path.join(dir, 'mnt', 'f'), c2) === 'mount' && MPC.pathClass(path.join(dir, 'link', 'f'), c2) === 'local', 'resolve, not realpath: a symlink into a mount is judged where it stands');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
ok(MPC.pathClass('/srv/x/y', { mountRoots: ['/srv/x'] }) === 'mount' && MPC.rootOf('/srv/x/y', { mountRoots: ['/srv/x'] }).kind === 'storage', 'a bare root string reads as a storage root');

console.log('⑤ storage-path: the one answer of the process');
SP.setRoots([]);
ok(SP.rootOf(`${HOME}/vibespace-mounts/NAS/x`) === null && SP.storageRootOf(`${HOME}/vibespace-mounts/NAS/x`) === null, 'no roots set (the daemon, a child, a suite) ⇒ null: every caller keeps its old road');
SP.setRoots(roots, { rootDir: ROOT_DIR, dataDir: DATA_DIR, home: HOME });
ok(SP.storageRootOf(`${HOME}/vibespace-mounts/NAS/x`).root === `${HOME}/vibespace-mounts/NAS` && SP.storageRootOf(`${HOME}/workspace/proj`) === null && SP.rootOf(`${HOME}/workspace/proj`).kind === 'home' && SP.storageRootOf('/mnt/nas_public/a') === null, 'storageRootOf names a storage root, never the home bindfs or a network NFS');
ok(SP.storageRootOf(`${DATA_DIR}/x`) === null && SP.roots().length === 10, 'the instance\'s own data is never a storage path');
SP.setRoots([]);

console.log('⑥ A VIEW IS CLASSED BY WHAT IT SHOWS (lane mount-class-by-source)');
{ // the box's two real rows (addresses removed) — the line order of the box: the NFS row first, though the view's mount id
  // (714) is lower than the NFS mount's (732): ids are reused, the line order is the mount order
  const NFS_ROW = '732 42 0:69 / /mnt/nfs_workspace rw,noatime shared:1044 - nfs4 192.0.2.10:/volume1/w rw,vers=4.1,hard';
  const VIEW_ROW = `714 42 0:65 / ${HOME}/workspace rw,relatime shared:1059 - fuse.bindfs /mnt/nfs_workspace rw,user_id=0,group_id=0,default_permissions,allow_other`;
  const DISK = '1 0 259:2 / / rw,relatime shared:1 - ext4 /dev/nvme0n1p2 rw';
  const R = (lines, o = {}) => MPC.rootsOf({ mounts: MPC.parseMountinfo(lines.join('\n')), ...o });
  const atIn = (roots, p) => roots.find((r) => r.root === p);
  const CO = `${HOME}/workspace/AIWorkspace/vibespace`, N = `${HOME}/vibespace`;
  const before = R([DISK, NFS_ROW, VIEW_ROW], { rootDir: CO, dataDir: `${CO}/data` });
  const after = R([DISK, NFS_ROW, VIEW_ROW], { rootDir: N, dataDir: `${N}/data` });
  ok(atIn(before, `${HOME}/workspace`).kind === 'home' && atIn(after, `${HOME}/workspace`).kind === 'network', 'the two real rows: the instance ON the view ⇒ home; the instance on the local disk ⇒ network (it shows the nfs4 mount)');
  ok(JSON.stringify(atIn(after, `${HOME}/workspace`).shows) === JSON.stringify({ root: '/mnt/nfs_workspace', fstype: 'nfs4' }) && atIn(after, '/mnt/nfs_workspace').kind === 'network', 'the view\'s row says what it shows; the NFS mount itself stays network');
  const ctxA = { mountRoots: after, rootDir: N, dataDir: `${N}/data`, home: HOME };
  SP.setRoots(after, { rootDir: N, dataDir: `${N}/data`, home: HOME });
  ok(SP.storageRootOf(`${HOME}/workspace/AIWorkspace/proj/a.md`) === null && SP.storageRootOf(`${CO}/data/settings.json`) === null && MPC.rootOf(`${CO}/data/x`, ctxA).kind === 'network',
    'law 2 — every project path, and the old checkout path through the view, answers as before the move: never a storage path');
  SP.setRoots([]);
  const shuffled = R([DISK, VIEW_ROW, NFS_ROW], { rootDir: N });
  ok(atIn(shuffled, `${HOME}/workspace`).kind === 'network', 'a source mount listed AFTER the view (remounted since) is still its source: the view shows it');
  // over the machine's own disk: a WATCHED root (a stopped FUSE daemon holds every reader), never a storage one
  const local = R([DISK, `90 1 0:80 / ${HOME}/data rw - fuse.bindfs /srv/data rw`], { rootDir: N });
  SP.setRoots(local, { rootDir: N });
  ok(atIn(local, `${HOME}/data`).kind === 'disk' && JSON.stringify(atIn(local, `${HOME}/data`).shows) === JSON.stringify({ root: '/', fstype: 'ext4' }) && MPC.pathClass(`${HOME}/data/x`, { mountRoots: local }) === 'mount' && SP.storageRootOf(`${HOME}/data/x`) === null,
    'a bindfs over the local disk is a watched root (disk: witnessed, never refused) — it shows the ext4 mount «/»');
  SP.setRoots([]);
  ok(atIn(R([DISK, `90 1 0:80 / ${N} rw - fuse.bindfs /srv/data rw`], { rootDir: N }), N).kind === 'home', 'a view of the local disk the instance lives on is still home');
  // the controls: storage stays storage
  const rcl = `800 1 0:70 / /mnt/r rw - fuse.rclone VSa: rw`, sshfs = '810 1 0:75 / /mnt/s rw - fuse.sshfs u@h:/x rw';
  const ctl = R([DISK, NFS_ROW, rcl, sshfs, `801 1 0:71 / ${HOME}/rv rw - fuse.bindfs /mnt/r/sub rw`, `802 1 0:72 / ${HOME}/q rw - fuse.bindfs bindfs rw`, `803 1 0:73 / ${HOME}/p rw - fuse.bindfs /mnt/nfs_workspace rw`, `804 1 0:74 / ${HOME}/sv rw - fuse.bindfs /mnt/s rw`],
    { rootDir: N, registry: [{ mountpoint: `${HOME}/p`, name: 'P', id: 'mnt-p' }] });
  ok(atIn(ctl, '/mnt/r').kind === 'storage' && atIn(ctl, '/mnt/s').kind === 'storage', 'an rclone and an sshfs mount stay storage');
  ok(atIn(ctl, `${HOME}/rv`).kind === 'storage' && atIn(ctl, `${HOME}/rv`).shows.fstype === 'fuse.rclone' && atIn(ctl, `${HOME}/sv`).kind === 'storage', 'a bindfs over an rclone (or sshfs) mount is storage');
  ok(atIn(ctl, `${HOME}/q`).kind === 'storage' && atIn(ctl, `${HOME}/q`).shows === null, 'a bindfs whose source is not a path (an fsname given by hand) cannot be told ⇒ storage');
  ok(atIn(ctl, `${HOME}/p`).kind === 'storage' && atIn(ctl, `${HOME}/p`).name === 'P' && atIn(ctl, `${HOME}/p`).id === 'mnt-p', 'a product storage row on a bindfs (over NFS) stays storage');
  ok(atIn(R([NFS_ROW, VIEW_ROW], { rootDir: N }), `${HOME}/workspace`).kind === 'network' && atIn(R([VIEW_ROW], { rootDir: N }), `${HOME}/workspace`).kind === 'storage'
    && atIn(R([`90 1 0:80 / ${HOME}/d rw - fuse.bindfs /srv/data rw`], { rootDir: N }), `${HOME}/d`).kind === 'storage', 'a bindfs whose source row is absent from the rows handed in is storage (no / row: nothing holds it)');
  ok(atIn(R([DISK, `90 1 0:80 / ${HOME}/u rw - fuse.bindfs ${HOME}/vibespace-mounts/Gone/x rw`], { rootDir: N, registry: [{ mountpoint: `${HOME}/vibespace-mounts/Gone` }] }), `${HOME}/u`).kind === 'storage', 'a view of a product storage folder (mounted or not) is storage');
  // the match: escapes, an overlay of its own source, a view of a view, a loop
  ok(atIn(R([DISK, '91 1 0:81 / /mnt/my\\040nfs rw - nfs4 192.0.2.10:/v rw', `92 1 0:82 / ${HOME}/w2 rw - fuse.bindfs /mnt/my\\040nfs/a rw`], { rootDir: N }), `${HOME}/w2`).kind === 'network', 'the source\'s octal escapes are undone before the match');
  ok(atIn(R([DISK, '93 1 0:83 / /srv/d rw - fuse.bindfs /srv/d rw'], { rootDir: N }), '/srv/d').kind === 'disk' && atIn(R([DISK, '94 1 0:84 / /srv/n rw - nfs4 192.0.2.10:/n rw', '95 1 0:85 / /srv/n rw - fuse.bindfs /srv/n rw'], { rootDir: N }), '/srv/n').kind === 'network',
    '`bindfs /d /d` (an overlay of its own source) shows what lies beneath it: the local disk ⇒ disk; an NFS mount ⇒ network');
  ok(atIn(R([DISK, NFS_ROW, `96 1 0:86 / /v1 rw - fuse.bindfs /mnt/nfs_workspace rw`, `97 1 0:87 / /v2 rw - fuse.bindfs /v1/x rw`], { rootDir: N }), '/v2').kind === 'network', 'a view of a view is followed to what it shows');
  ok(atIn(R([DISK, '98 1 0:88 / /a rw - fuse.bindfs /b rw', '99 1 0:89 / /b rw - fuse.bindfs /a rw'], { rootDir: N }), '/a').kind === 'storage', 'two views showing each other (a loop) cannot be told ⇒ storage');
  // ROUND 2 — law 3 made exact: a path is refused when what it REACHES is storage, by whichever spelling (bindfs crosses
  // into every mount below its source): the verifier's three storage-below arrangements, 0 differences from the law
  const below = (extra, o = {}) => R([DISK, NFS_ROW, VIEW_ROW, ...extra], { rootDir: N, ...o });
  const rUnderNfs = below(['900 732 0:90 / /mnt/nfs_workspace/drive rw - fuse.rclone VSd: rw']);
  SP.setRoots(rUnderNfs, { rootDir: N, home: HOME });
  ok(atIn(rUnderNfs, `${HOME}/workspace/drive`).kind === 'storage' && SP.storageRootOf(`${HOME}/workspace/drive/x`).root === `${HOME}/workspace/drive` && SP.storageRootOf('/mnt/nfs_workspace/drive/x').root === '/mnt/nfs_workspace/drive'
    && SP.storageRootOf(`${HOME}/workspace/proj/x`) === null, 'an rclone mounted below the NFS source is storage THROUGH the view (and at its own spelling); the rest of the view stays network');
  SP.setRoots([]);
  ok(MPC.viewWords(atIn(rUnderNfs, `${HOME}/workspace/drive`)) === ` — the fuse.rclone mount «/mnt/nfs_workspace/drive» reached through the fuse.bindfs view «${HOME}/workspace»`, 'its words name the mount reached and the view it is reached through');
  const rUnderExt4 = R([DISK, `90 1 0:80 / ${HOME}/data rw - fuse.bindfs /srv/data rw`, '91 1 0:81 / /srv/data/r rw - fuse.rclone VSe: rw'], { rootDir: N });
  ok(atIn(rUnderExt4, `${HOME}/data/r`).kind === 'storage' && atIn(rUnderExt4, `${HOME}/data`).kind === 'disk', 'an rclone below a local-disk source is storage through the view; the view stays disk');
  const regUnderNfs = below([], { registry: [{ mountpoint: '/mnt/nfs_workspace/prod', name: 'Prod', id: 'mnt-prod' }] });
  ok(atIn(regUnderNfs, `${HOME}/workspace/prod`).kind === 'storage' && atIn(regUnderNfs, `${HOME}/workspace/prod`).name === 'Prod' && atIn(regUnderNfs, `${HOME}/workspace/prod`).id === 'mnt-prod'
    && MPC.viewWords(atIn(regUnderNfs, `${HOME}/workspace/prod`)) === ` — the storage folder «/mnt/nfs_workspace/prod» reached through the fuse.bindfs view «${HOME}/workspace»`, 'a product storage row below the NFS source (not mounted) is storage through the view, named');
  const homeBelow = R([DISK, NFS_ROW, VIEW_ROW, '900 732 0:90 / /mnt/nfs_workspace/drive rw - fuse.rclone VSd: rw', '901 732 0:91 / /mnt/nfs_workspace/nas2 rw - nfs4 192.0.2.11:/x rw'], { rootDir: CO, dataDir: `${CO}/data` });
  ok(atIn(homeBelow, `${HOME}/workspace`).kind === 'home' && !atIn(homeBelow, `${HOME}/workspace/drive`) && !atIn(homeBelow, `${HOME}/workspace/nas2`) && atIn(homeBelow, '/mnt/nfs_workspace/drive').kind === 'storage',
    'a view the instance lives on derives nothing: home wins through it, as on the release (the rclone is refused at its own spelling)');
  ok(!atIn(below(['902 714 0:92 / /mnt/nfs_workspace/x rw - nfs4 192.0.2.12:/y rw']), `${HOME}/workspace/x`) && atIn(below(['903 714 0:93 / /mnt/nfs_workspace/s rw - ext4 /dev/sdc1 rw']), `${HOME}/workspace/s`).kind === 'disk',
    'below a network view an NFS adds nothing, a local stick is a disk part (named by its own type)');
  ok(atIn(below([`904 714 0:94 / ${HOME}/workspace/drive rw - nfs4 192.0.2.13:/z rw`, '900 732 0:90 / /mnt/nfs_workspace/drive rw - fuse.rclone VSd: rw']), `${HOME}/workspace/drive`).kind === 'network', 'a real row at the derived spelling wins (it is what that spelling shows)');
  // equal mount points: the last row listed BEFORE the view is what it entered (a mount put over its source later is not)
  ok(atIn(R([DISK, '50 1 0:50 / /srv/r rw - fuse.rclone VSf: rw', `51 1 0:51 / ${HOME}/rv2 rw - fuse.bindfs /srv/r rw`, '52 1 259:9 / /srv/r rw - ext4 /dev/sdd1 rw'], { rootDir: N }), `${HOME}/rv2`).kind === 'storage',
    'a local mount put over an rclone source AFTER the view started does not change it: still storage (the view serves the rclone)');
  ok(atIn(R([DISK, '53 1 0:53 / /srv/s rw - nfs4 192.0.2.14:/s rw', '54 1 0:54 / /srv/s rw - fuse.rclone VSg: rw', `55 1 0:55 / ${HOME}/sv2 rw - fuse.bindfs /srv/s rw`], { rootDir: N }), `${HOME}/sv2`).kind === 'storage'
    && atIn(R([DISK, '54 1 0:54 / /srv/s rw - fuse.rclone VSg: rw', '53 1 0:53 / /srv/s rw - nfs4 192.0.2.14:/s rw', `55 1 0:55 / ${HOME}/sv2 rw - fuse.bindfs /srv/s rw`], { rootDir: N }), `${HOME}/sv2`).kind === 'network',
    'two rows at the source\'s mount point, both before the view: the LAST listed is what it shows (rclone over NFS ⇒ storage, NFS over rclone ⇒ network)');
  ok(atIn(R([DISK, '60 1 0:60 / /d rw - fuse.bindfs /d/sub rw', '61 60 0:61 / /d/sub rw - fuse.rclone VSh: rw'], { rootDir: N }), '/d').kind === 'disk', 'a row listed after the view inside its own mount point is never its source (`bindfs /d/sub /d`, then an rclone at /d/sub ⇒ the view shows /)');
  { const chain = [DISK, NFS_ROW, '70 1 0:70 / /c0 rw - fuse.bindfs /mnt/nfs_workspace rw'];
    for (let k = 1; k <= 12; k++) chain.push(`${70 + k} 1 0:${70 + k} / /c${k} rw - fuse.bindfs /c${k - 1} rw`);
    ok(atIn(R(chain, { rootDir: N }), '/c12').kind === 'network', 'a chain of 13 views is followed to what it shows (no depth rule: the seen set ends a loop)'); }
  ok(MPC.viewWords(atIn(R([DISK, '80 1 0:20 / /tmp rw - tmpfs tmpfs rw', `81 1 0:81 / ${HOME}/t rw - fuse.bindfs /tmp/x rw`], { rootDir: N }), `${HOME}/t`)) === ' — a fuse.bindfs view of the tmpfs mount «/tmp»', 'a disk view\'s words name the type it shows (tmpfs here)');
  // the words: only a view's own row adds any
  ok(MPC.viewWords(atIn(after, `${HOME}/workspace`)) === ' — a fuse.bindfs view of the nfs4 mount «/mnt/nfs_workspace»' && MPC.viewWords(atIn(ctl, `${HOME}/q`)) === ' — a fuse.bindfs view whose source the mount table does not show (refused until it can be told)'
    && MPC.viewWords(atIn(local, `${HOME}/data`)) === ' — a fuse.bindfs view of the ext4 mount «/»'
    && MPC.viewWords(atIn(ctl, `${HOME}/p`)) === '' && MPC.viewWords(atIn(ctl, '/mnt/r')) === '' && MPC.viewWords(atIn(before, `${HOME}/workspace`)) === '', 'the words name what a view shows; a product row, a plain mount and home add nothing');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
