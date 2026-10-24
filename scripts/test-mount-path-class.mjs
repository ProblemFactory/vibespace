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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
