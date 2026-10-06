// src/mount-providers/cephfs.js — a native KERNEL CephFS mount (deployment-provisioned "My storage"; sudo mount -t ceph — not rclone).
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';

module.exports = {
  id: 'cephfs',
  rclone: false,          // no rclone binary, no fuse daemon: nothing to adopt, kill or fusermount
  daemon: false,
  fstype: /^ceph$/,       // isMounted()'s /proc/mounts fstype
  probeMs: 12000,         // the health probe's patience (a network filesystem under load)
  hungStrikes: 2,         // strikes before a hung verdict
  cephShare: true,        // the CephFS share minting (canCephShare)
  replacesMyStorage: true,   // the deployment's flash "My storage": an env-provisioned record of this row replaces a prior S3 one
  label: (m) => `CephFS ${m.cephPath || '/'} @ ${(m.cephMonHosts || '').split(',')[0] || '?'}`,
  mount: (id, x) => x._mountCephfs(id),
  unmount: (m, id, mp, finish, x) => x._kernelUnmount(m, mp, finish),
  config(m, out, dec, x) {
    Object.assign(out, { cephMonHosts: m.cephMonHosts, cephFsName: m.cephFsName, cephPath: m.cephPath, cephUser: m.cephUser }); // secret withheld
  },
  create(m, cfg, x) {
    // Native KERNEL CephFS mount (all-flash shared storage; deployment-
    // provisioned). `mount -t ceph <mons>:<path> <mp> -o name=…,secret=…`
    // — needs root, so the app sudo's it (the container has passwordless
    // sudo). NOT rclone; mount()/unmount()/isMounted() have cephfs branches.
    for (const k of ['cephMonHosts', 'cephSecret']) if (!cfg[k]) throw new Error(`${k} required`);
    Object.assign(m, {
      cephMonHosts: String(cfg.cephMonHosts),          // "10.0.0.1,10.0.0.2:6789"
      cephFsName: String(cfg.cephFsName || 'cephfs'),
      cephPath: '/' + String(cfg.cephPath || '/').replace(/^\/+/, ''),
      cephUser: String(cfg.cephUser || 'admin'),
      cephSecretEnc: x._enc(cfg.cephSecret),
    });
  },
  // the CLIENT cells (lane dc-mount-client): pure data GET /api/mounts publishes once (`providers`); src/lib/sidebar-mounts.js
  // renders the sidebar row, the Connect / submount / Edit dialogs and the re-authorize words from them — it names no provider
  client: {
    tag: 'CephFS',
  },
};
