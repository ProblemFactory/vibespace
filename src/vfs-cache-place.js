// src/vfs-cache-place.js — WHERE a mount's rclone VFS cache lives (lane vfs-cache-local, B-4997, 2026-10-09; the owner's
// OneDrive cache sat on fuse.bindfs over NFS under data/: 164 788 cached files re-walked over NFS at every remount, 4.5 min
// STARTING — rclone's docs: cache-mode full keeps SPARSE files + its read-ahead on disk and "performs very badly" without
// sparse-file support). PURE: imports nothing. src/mounts.js only GATHERS (statfs of each dir, a CHILD reading the cache's
// vfsMeta, the old daemon's rc `vfs/queue`) and applies the answer — there is no second decision site.
// THE LAW (data safety): a cache MOVES only at a remount whose outgoing daemon left NOTHING dirty — never a copy (a 10 G
// sparse cache over NFS is itself the outage), never a loss. The dirty witnesses are PARSED, never grepped for a spelling:
// Go's indented encoder writes `"Dirty": true` WITH a space (a grep for `"Dirty":true` read every cache clean ⇒ the move +
// the old dir's removal would have deleted writes not yet uploaded). A witness that cannot be read is DIRTY (fail closed).

/** One vfsMeta file's text → 'dirty' | 'clean' | 'unread'. `Dirty: false` is the ONLY clean answer: a missing / odd field
 *  or a text that does not parse is never read as clean. */
function metaVerdict(text) {
  let j;
  try { j = JSON.parse(text); } catch { return 'unread'; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return 'unread';
  return j.Dirty === false ? 'clean' : 'dirty';
}

/** The two witnesses → {dirty, items, why, code}. `meta` = the child's summary of <cache>/vfsMeta ({exists, files, dirty,
 *  unread, error}; exists null = its state is UNKNOWN: a stat error that is not a true absence — EACCES / ENOTDIR /
 *  ESTALE / EIO / ELOOP, or an absent root = a mount not there yet) or {timedOut} or null (the child failed); `rcQueue` =
 *  null when no daemon was alive to ask, else the rc answer ({queue: [...]}) or {error}. Either says dirty ⇒ dirty;
 *  unknown ⇒ dirty (verify r1 #0: an EACCES read as 'no cache' moved a dirty cache away and orphaned it). */
function dirtyWitness(meta, rcQueue) {
  const unread = (code, items = null) => ({ dirty: true, items, why: 'unread', code });
  if (!meta || typeof meta !== 'object') return unread('child-failed');
  if (meta.timedOut) return unread('timeout');
  if (meta.exists !== true && meta.exists !== false) return unread(meta.error || 'unknown');
  if (!meta.exists) {
    if (rcQueue && !Array.isArray(rcQueue.queue)) return unread('rc');
    const q = rcQueue ? rcQueue.queue.length : 0;
    return q ? { dirty: true, items: q, why: 'uploading' } : { dirty: false, items: 0, why: 'empty' };
  }
  if (!Number.isInteger(meta.dirty) || !Number.isInteger(meta.unread)) return unread('unknown');
  if (rcQueue && !Array.isArray(rcQueue.queue)) return unread('rc', meta.dirty || null);
  const items = Math.max(meta.dirty, rcQueue ? rcQueue.queue.length : 0);
  if (items) return { dirty: true, items, why: 'uploading' };
  if (meta.unread) return unread('unparsable');
  return { dirty: false, items: 0, why: 'clean' };
}

/** The placement rule → {dir, move, from, reason, network, pendingMove, needWitness}.
 *  recordDir      the dir the record's cache uses now (m.cacheDir, or the legacy `<root>/<id>`)
 *  recordFs       that dir's filesystem class (fsClassOf): 'network' | 'ephemeral' | 'local' (recordNetwork = the old bool)
 *  dataDirDefault `<dataDir>/vfs-cache/<id>` — the floor: where a cache with no persistent local disk belongs
 *  exists         that dir holds a cache (else there is nothing to move: a switch, no removal)
 *  dataDirNetwork the instance's dataDir sits on a network filesystem (a LOCAL dataDir — the fleet PVC — never moves)
 *  candidates     [{dir, fs, writable, override?, root?, why?}] the per-mount dirs to consider; an `override` (the env
 *                 VIBESPACE_VFS_CACHE_DIR / the mounts.vfsCacheRoot setting) is the owner's own choice and wins — when
 *                 writable; a record outside the current candidates is RE-PLACED (never 'stays local' on a dead dir)
 *  witness        dirtyWitness(...) of recordDir, or undefined (not read yet ⇒ needWitness when a move is wanted) */
function cachePlacement({ recordDir, recordNetwork = false, recordFs, exists = true, dataDirNetwork = false, dataDirDefault = null, candidates = [], witness } = {}) {
  const fsOf = (c) => c.fs || (c.network ? 'network' : 'local');
  const rfs = recordFs || (recordNetwork ? 'network' : 'local');
  const stay = (reason, extra = {}) => ({ dir: recordDir, move: false, from: null, reason, network: rfs === 'network', fs: rfs, pendingMove: false, needWitness: false, ...extra });
  const ov = candidates.find((c) => c && c.override);
  let target = null, said = null;
  if (ov) {
    // the owner's own choice — but a dir that cannot be written is REFUSED, never obeyed (verify r1 #1: rclone 1.69.3
    // then mounts with the VFS cache silently disabled, and the old dir would have been dropped after that mount)
    if (!ov.writable) return stay('override-refused', { override: ov.root || ov.dir, code: ov.why || 'not writable' });
    target = ov;
  } else if (!dataDirNetwork) {
    // a LOCAL dataDir (the fleet PVC) keeps the cache on it; a record parked elsewhere (a former override) comes home
    if (!dataDirDefault || recordDir === dataDirDefault) return stay('local-data');
    target = { dir: dataDirDefault, fs: 'local' };
  } else {
    const home = candidates.find((c) => c && !c.override);
    if (home && fsOf(home) === 'local' && recordDir === home.dir) return stay('local');
    if (home && fsOf(home) === 'local' && home.writable) target = home;
    else {
      // no PERSISTENT local disk (verify r1 #3: an overlayfs / tmpfs / ramfs / 9p home is gone at a container recreate,
      // with every write still to upload): the cache belongs on the data dir, network as it is — said on the row
      said = home && fsOf(home) === 'ephemeral' ? 'ephemeral-home' : 'no-local';
      if (!dataDirDefault || recordDir === dataDirDefault) return stay(said);
      target = { dir: dataDirDefault, fs: 'network' };
    }
  }
  if (target.dir === recordDir) return stay(ov ? 'override' : 'local');
  const to = (from, reason) => ({ dir: target.dir, move: true, from, reason, network: fsOf(target) === 'network', fs: fsOf(target), pendingMove: false, needWitness: false, ...(said ? { said } : {}) });
  if (!exists) return to(null, 'fresh');
  if (!witness) return stay('witness', { needWitness: true });
  if (witness.dirty) return stay(witness.why === 'unread' ? 'unread' : 'dirty', { pendingMove: true, items: witness.items, code: witness.code || null });
  return to(recordDir, 'moved');
}

/** The device twin (src/device-mount.js, vfs-cache-mode minimal: only files open for writing are cached): it keeps the
 *  dir it is given — no caller passes one, so rclone's own default ($XDG_CACHE_HOME/rclone, local home) applies; a dir on
 *  a network filesystem is SAID, never moved (it may hold a write still uploading). */
function deviceCacheVerdict({ dir = null, network = false } = {}) {
  if (!dir) return { dir: null, why: 'rclone-default' };
  return { dir, why: network ? 'network' : 'given' };
}

/** statfs magic numbers of a network / FUSE filesystem: NFS, SMB, CIFS, SMB2, FUSE (bindfs, rclone), Ceph — THE table the
 *  hub (MountManager._onNetworkFs) and the device twin both ask. */
const NETWORK_FS_MAGIC = Object.freeze([0x6969, 0x517b, 0xff534d42, 0xfe534d42, 0x65735546, 0x00c36400]);
/** statfs magic numbers of a filesystem that is local but NOT persistent — never a cache candidate (verify r1 #3): overlayfs
 *  (a container's writable layer, dropped at a recreate), tmpfs + ramfs (memory: gone at a reboot), 9p (a VM / WSL host
 *  share — neither local nor durable). */
const NON_DURABLE_FS_MAGIC = Object.freeze([0x794c7630, 0x01021994, 0x858458f6, 0x01021997]);
/** A statfs type → 'network' | 'ephemeral' | 'local'. */
function fsClassOf(magic) {
  const t = Number(magic) >>> 0;
  return NETWORK_FS_MAGIC.includes(t) ? 'network' : NON_DURABLE_FS_MAGIC.includes(t) ? 'ephemeral' : 'local';
}

module.exports = { metaVerdict, dirtyWitness, cachePlacement, deviceCacheVerdict, fsClassOf, NETWORK_FS_MAGIC, NON_DURABLE_FS_MAGIC };
