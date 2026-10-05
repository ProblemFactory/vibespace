// src/mount-providers/vibespace.js — another VibeSpace instance's /dav bridge: WebDAV + the share's scoped bearer token.
// A row of the storage-provider family (src/mount-providers/index.js lists it in ONE line): PURE — the cells are
// facts, the hooks are this provider's branches of MountManager's generic lifecycle, called with the manager `x`
// (its key, its statics, its engines); the fact predicates (label / adopts / oauthBacked / rootMayBeDenied) get the class `MM`. Moved verbatim from src/mounts.js's per-type switches (lane dc-mount-providers).
'use strict';

const webdav = require('./webdav.js');

module.exports = {
  ...webdav,              // the same config / edit / rclone shape as WebDAV
  id: 'vibespace',
  davUrl: (m) => m.url + '/dav',
  revocable: true,        // the sharing instance can revoke the token — the heavier backend re-auth probe runs
  everyFileErrors: 'connected but every file errors — the share may have been revoked, or the source instance is unreachable',
  create(m, cfg, x) {
    // another VibeSpace instance's /dav bridge — webdav + scoped bearer token
    for (const k of ['url', 'bearerToken']) if (!cfg[k]) throw new Error(`${k} required`);
    // Self-mount guard: a token WE minted means the link points back at
    // THIS instance — fuse→HTTP→self is a threadpool deadlock loop (real
    // incident: a self-imported test share froze the instance on open).
    if (x.selfTokenCheck?.(String(cfg.bearerToken))) {
      throw new Error('This share link was minted by THIS VibeSpace — mounting your own share back onto yourself deadlocks the server. Open the shared folder directly instead.');
    }
    Object.assign(m, { url: String(cfg.url).replace(/\/+$/, ''), bearerTokenEnc: x._enc(cfg.bearerToken) });
  },
  preMount(m, id, x) {
    // Self-mount guard for EXISTING records too (imported before the add()
    // guard existed): our own bridge token = the URL points back at this
    // instance — refuse instead of fuse-mounting a self-referential loop.
    if (m.bearerTokenEnc && x.selfTokenCheck?.(x._dec(m.bearerTokenEnc))) {
      x._errors.set(id, 'this share was minted by this same VibeSpace (self-mount deadlocks the server) — open the shared folder directly instead');
      m.desired = 'unmounted';
      x._save();
      x._notify();
      return false;
    }
  },
};
