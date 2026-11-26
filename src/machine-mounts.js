// MachineMounts (B-f3e8) — ONE mount manager for both directions on any
// machine (machine = a host record, transport ssh|dial):
//   push: THIS instance's folder mounted ON the machine over the /dav bridge
//         (was src/host-mounts.js — tunnel-first via reverseForward, OS-aware
//         rclone/mount_webdav/net-use; scoped vsmt_ tokens)
//   pull: the machine's folder mounted INTO this workspace over the device
//         link (was src/device-mounts.js — serve-folder → tcp-forward →
//         rclone webdav, read-only)
// Records live in data/machine-mounts.json keyed by hostId + dir; a one-time
// constructor migration ingests the legacy host-mounts.json (→ dir:'push')
// and device-mounts.json (deviceId → hostId, dir:'pull'), then renames both
// to *.migrated. Every data path rides hosts.device(hostId) — the SAME
// manager works for ssh (daemon over ssh --stdio) and dial (daemon dialed in)
// machines, which is the whole point of the unification.
//
// Persistence semantics: push mounts live on the REMOTE (rclone there
// survives us; restore() re-owns tunnel ports so they heal after our
// restart); pull mounts' live chain (serve-folder + bridge + rclone) is
// in-memory — restore()/onMachineLinked() remount recorded pulls (auto-heal;
// a pull whose machine is offline stays recorded + pending).
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const SR = require('./store-read.js'); // remainder of B-f276 (bl-jobs): a read that FAILED is no answer — held, never written over
const HOLD = require('./store-read-hold.js');   // B-f276 family unit 2 commit 3: the kept copies' question (copiesOf)
const { execFile } = require('child_process');   // (B-323e: its two probe children — ls, realpath — ride THE STARTER)
const PI = require('./proc-identity.js');   // B-323e: a probe child's end the hub may never hear, asked of /proc by its pid
const MD = require('./server/push-mount-door.js'); // B-7f0b (r1220): a push mount's tunnel ends at its OWN door (that mount's /dav, its own pass), never the hub's whole web port
const MW = require('./mount-error-words.js'); // B-af94: every refusal and row words BY CODE — the page words them in its language
const DM = require('./device-mount'); // the pull chain (B-fcc7: read at each call — test-pull-refresh §15 drives the manager over a stub chain)
// cure 4 (the readers' should): a pull the person REMOVED while the mount it was asked for waited is refused to the caller
// that asked (mountPull / remount) with these words — whatever road the removal took (the boot's mark, the release, the
// mount landing, a throw on the way) — never a 200 with live:false for a record that is gone. The code names it in-process
// (logs, the suite); the routes answer the words (server.js takes no line)
const removedWhileMounting = () => MW.refusal('mount_removed');
const { rcloneMountArgs, shellWords, SSH_HOST_WEBDAV_ROW } = require('./mount-argv.js');   // THE mount argv (B-069b: the push mount's too)

const PAIR_GRACE_MS = 120000;   // B-844b r4: after a start, the mount that worked LAST (else the elder) keeps its folder while the machines redial; then a held record that can mount takes over from a holder that cannot
const LET_GO_MS = 20000;   // B-844b r4: how long a heal waits for a pull REMOVED from its folder to let it go
const PROBE_STUCK_MS = 60000;   // 主开发's small 2: a probe child still alive past this is said once (its folder not judged meanwhile)
/** B-323e (its reader's M2): a child of THE STARTER whose end this hub may NEVER hear — killed at its bound and asleep in the kernel
 *  (a dead mount), or started by a starter that then stopped answering; a fault ends the starter, never its children — so its pid and
 *  start time are kept and its end is asked of /proc when it is owed (as mounts.js _probeMountpoint's held mark, B-91aa — but see no
 *  /proc below): no such process, a zombie, or that pid now another process's (its start differs) ⇒ ended.
 *  THE ANCHOR IS THE STARTER'S REPLY, NEVER A CLOCK (主开发 r1284 (3)): kept at its «timeout» (onTimeout — the child it just killed is
 *  still there, so the process at that pid IS the child) or at the no answer itself; a child already ended when kept (no such process,
 *  a zombie) is gone for good. NO /proc (r1284 (4)): /proc's silence is no evidence — there the KERNEL is asked by signal 0 (a
 *  syscall, no child started) — and so for a pid /proc says nothing of: the child still there ⇒ held (until its late end or its end),
 *  none (or a pid not ours) ⇒ gone; a late end that can never come (its starter faulted) never holds a flight for good (its
 *  re-read's M1). mounts.js's held mark reads /proc's silence as gone — this file asks the kernel instead. LEFT: the kernel's
 *  witness has no identity — a pid another process of this user took holds the flight for that process's life (said in the kb) */
function heldChild(pid) {
  if (!pid) return { pid: 0, gone: () => true };
  const kernel = () => { try { process.kill(pid, 0); return false; } catch { return true; } };   // signal 0: a syscall, no child started
  if (!PI.hasProc()) return { pid, gone: kernel };   // no /proc: the kernel by signal 0
  const st0 = PI.statOf(pid);
  if (st0 === null || (st0 && st0[0] === 'Z')) return { pid, gone: () => true };
  const start = st0 ? st0[1] : null;
  return { pid, gone() { const st = PI.statOf(pid); if (st === undefined) return kernel(); return st === null || (!!st && (st[0] === 'Z' || (start != null && st[1] !== start))); } };   // a read that says nothing for it: the kernel (its re-read)
}
/** THE one `ls` child of this file (spawn-env-census: one probe site) — never node fs on a mount point. `names` asks `ls -A`
 *  for the folder's entries (B-fcc7: is a released pull's bare folder empty?). Bounded (8 s), ended by its handle.
 *  → { ok, empty } (empty: null unless `names`). */
function lsChild(mp, { names = false, ms = 8000 } = {}) {   // → ok: true / false (no answer in time, an error) / null (it could not start, or no answer from the starter); exited: the child's own end
  // B-323e (its mount half, lane bl-machines-b): THE STARTER runs it (src/server/child-starter.js — a fork of a few MB, never the hub's
  // 4.5–5 GB process; the pull sweep asks it every 90 s for each live pull). Its answers read as the release read its own child:
  // ended 0 = ok, ended else or killed at its bound = false, never started or NO ANSWER from the starter = null (no verdict: a slow
  // starter is never «the mount is down»); the names captured past the release's 4096 characters end the child (more names than that
  // = not empty). `exited` = the child's own end: at the answer, or — killed at its bound and still asleep — when it ends at last;
  // `held` = such a child, kept for its owner to ask /proc (heldChild) when its end may never be heard
  let exitedRes, held = null; const exited = new Promise((r) => { exitedRes = r; });
  const S = require('./server/child-starter').childStarter();
  return S.run('ls', names ? ['-A', mp] : [mp], { timeoutMs: ms, capture: names, maxBuffer: 4096, envAdd: { PATH: process.env.PATH || '' }, onTimeout: (pid) => { held = heldChild(pid); }, onLateExit: () => exitedRes() })
    .then((r) => {
      if (r && r.unknown && r.pid) return { ok: null, empty: null, exited, held: heldChild(r.pid) };   // started, then no answer: it may still run
      // (said: a no answer with no pid — the starter froze before its «started» line — is let go at once: its child, if any, is not known)
      if (!r || r.unknown || !r.started) { exitedRes(); return { ok: null, empty: null, exited }; }
      if (r.timedOut) return { ok: false, empty: null, exited, held: held || heldChild(r.pid) };   // its end comes through onLateExit, or of /proc
      exitedRes();
      if (r.overflow) return { ok: true, empty: names ? false : null, exited };
      return { ok: r.code === 0 && !r.error, empty: names && r.code === 0 && !r.error ? String(r.stdout || '').length === 0 : null, exited };   // a name of spaces is a name
    }, () => { exitedRes(); return { ok: null, empty: null, exited }; });
}

// B-02f6 remainder (1) (主开发 r1160 / r1178): the PROOF that a writer refused under a pull record whose real folder never resolved
// would reach a LIVE pull through that record's link — the record's real folder by THE STARTER's child, its answer kept per record
const PROOF_MS = 3000;          // the proof child's own bound (the starter answers `unknown` past it and its guard)
const PROOF_KEEP_MS = 10000;    // its answer is kept for the record this long — a pass as much as a refusal (a writer in a loop starts no child a write)
const PROOF_KIDS_MAX = 2;       // at most this many proof children IN FLIGHT (asked, not answered) — another ask meanwhile keeps its refusal, nothing kept
/** A folder's REAL path by THE STARTER (src/server/child-starter.js): a writer in a loop drives the proof's road, and the hub's main
 *  process starts no program on such a road (B-323e) — `realpath -m`, bounded PROOF_MS → { real (null: no answer), slow (the child
 *  TIMED OUT inside its bound — a starter fault's «unknown» is not slowness, r1274) }. Nothing here waits on the child's end after its answer. */
async function starterRealpath(p, { ms = PROOF_MS } = {}) {
  const lex = path.resolve(String(p || '/'));
  let r = null; try { r = await require('./server/child-starter').childStarter().run('realpath', ['-m', '--', lex], { timeoutMs: ms, capture: true, maxBuffer: 8192, envAdd: { PATH: process.env.PATH || '' } }); } catch { r = null; }
  const slow = !!(r && r.timedOut);   // ONLY a real timeout is slow (r1274): a starter fault's «unknown» and a throw are answers — no folder was slow
  const out = r && !slow && r.code === 0 ? String(r.stdout || '').replace(/\n$/, '') : '';
  return { real: out.startsWith('/') ? out : null, slow };
}
/** The proof's record as it stands — its FOLDER (all realpath reads): an edit of it is another question («never again» ends there) */
const proofSig = (rec) => rec.id + '\u0000' + path.resolve(String(rec.mountpoint || ''));

/** B-844b: a folder's REAL path — symlinks resolved — by a child `realpath -m` (never node fs on a path that may be a mount
 *  point), bounded (6 s); a host without GNU realpath (the child refuses) takes the path as written (resolved); a child that did
 *  not ANSWER in time (a wedged FUSE target) is no answer — null, so the next check asks again (r5: never cached as written). */
function realpathChild(p, { ms = 6000, onExit = null, onHeld = null } = {}) {   // r6: onExit — the child's own end (a stuck child is never doubled); onHeld — one whose end may never be heard (heldChild)
  // B-323e (its mount half): THE STARTER runs it, as lsChild; no answer from the starter = no answer (null, asked again)
  const lex = path.resolve(String(p || '/'));
  let gone = false; const exited = () => { if (!gone) { gone = true; try { onExit && onExit(); } catch { } } };
  const S = require('./server/child-starter').childStarter();
  const keep = (pid) => { try { onHeld && onHeld(heldChild(pid)); } catch { } };
  return S.run('realpath', ['-m', '--', lex], { timeoutMs: ms, capture: true, maxBuffer: 8192, envAdd: { PATH: process.env.PATH || '' }, onTimeout: (pid) => keep(pid), onLateExit: exited })
    .then((r) => {
      if (r && r.unknown && r.pid) { keep(r.pid); return null; }   // started, then no answer: it may still run
      if (!r || r.unknown) { exited(); return null; }
      if (!r.started) { exited(); return r.error === 'ENOENT' ? lex : null; }   // r7: no realpath on this host ⇒ as written (final); another error ⇒ no answer
      if (r.timedOut) return null;   // its end comes through onLateExit
      exited();
      if (r.overflow) return null;
      const out = String(r.stdout || '').replace(/\n$/, '');
      return r.code === 0 && out.startsWith('/') ? out : lex;
    }, () => { exited(); return null; });
}

const RCLONE_PIN = 'v1.69.3'; // ≥1.66 brings `rclone nfsmount` (macOS without macFUSE); 2.369.12

const STORE_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v);   // machine-mounts.json: {mounts: [...]}
const legacyKey = (r) => String((r && (r.id || r.mountpoint)) || '');   // r4985: a legacy record's key in the lift's judged list

class MachineMounts {
  /** @param deps { hosts, mountTokens, publicUrl:()=>string|null, localPort:()=>number|null, rcloneBin:()=>string, broadcast, log } */
  constructor({ dataDir, hosts, mountTokens, publicUrl, localPort, rcloneBin, broadcast, log }) {
    this.dataDir = dataDir;
    this.hosts = hosts;
    this.mountTokens = mountTokens;
    this.publicUrl = publicUrl || (() => null);
    this.localPort = localPort || (() => null);
    this.rcloneBin = rcloneBin || (() => 'rclone');
    this.broadcast = broadcast || (() => {});
    this.log = log || (() => {});
    this._doors = new Map();   // B-7f0b: a push mount's id → the PROMISE of its own door (src/server/push-mount-door.js; r1317 (2): kept while it opens, so two re-owns share one)
    this._file = path.join(dataDir, 'machine-mounts.json');
    this._legacyHolds = new Map();   // B-f276 slice legacy-mounts-gap (主开发 r4985): a legacy store whose read FAILED → its hold (one a store)
    // 2b commit 3 (主开发 r3648 / r3790): the hold is the FAMILY HELPER's (src/store-read-hold.js) — torn bytes at a start HOLD while
    // they are copied aside off the loop (once a content), then the list starts empty (its time cut marked at the lift); a failed read
    // holds, read again off the loop (past the helper's bound, said); the one-time legacy ingest is the boot's road only — after a
    // torn boot it waits for the next start
    this._hold = HOLD.create({
      file: this._file, valid: STORE_SHAPE, code: 'mounts-unread', aside: (mark) => this._asideName(mark),
      words: (f) => this._heldWords(f), log: (m) => this.log(m), onLift: (value, info) => this._lifted(value, info),
    });
    let read;
    try { read = { text: fs.readFileSync(this._file, 'utf-8') }; } catch (error) { read = { error }; }
    const a0 = SR.storeAnswer(read, { valid: STORE_SHAPE });
    if (this._hold.start(a0) !== 'held') this._loadAnswer(a0); else this._state = { mounts: [] };   // held: no mount listed until the lift
    // one-time hygiene: strip trailing slashes off legacy pull remotePaths —
    // slashed records predate the 2.168.0 intake normalization, never
    // dedup-match a re-added clean path (duplicate records on one mountpoint
    // cross-teardown each other), and fed the serve-folder double-slash 403
    let normed = false;
    for (const m of this._state.mounts || []) {
      if (m.dir === 'pull' && typeof m.remotePath === 'string' && /\/+$/.test(m.remotePath) && m.remotePath !== '/') {
        m.remotePath = m.remotePath.replace(/\/+$/, '') || '/';
        normed = true;
      }
    }
    if (normed) this._save();
    this._live = new Map(); // pull rec.id → { teardown, mountpoint }
    this._realMp = new Map(); // B-844b: pull rec.id → its mount point's REAL path (a child's realpath; as written until resolved)
    this._startedAt = Date.now();   // B-844b r4: the pair rank's grace (PAIR_GRACE_MS) runs from here
    this._held = new Map();   // B-844b / B-6c4f: pull rec.id → { kind, otherId, code, params, words } — a younger record on a folder another holds
    this._mounting = new Set(); // pull rec.id (single-flight)
    // Push tunnel ownership: rec.id whose reverse-forward listener was
    // established by THIS process. The boot re-own (restore→onMachineLinked)
    // is otherwise the ONLY attempt — ssh machines never dial in, the daemon
    // reaps a disowned listener after ~10min, and the machine-side rclone
    // STAYS in its mount table while pointing at the dead 127.0.0.1 port
    // (so the mount-table probe below can't see it) — review finding.
    this._pushTunnelOwned = new Set();
    this._pushRetryAt = new Map(); // push rec.id → next re-own attempt ts
    // Pull health sweep: a live pull whose LISTING hangs (its machine-side
    // serve-folder died with a daemon re-exec while the record still thinks
    // it's live — real Mac report) is torn down + remounted. Child-process ls
    // only (never node fs on a fuse mountpoint — §2.108.3 threadpool lesson).
    this._sweep = setInterval(() => this._healthSweep().catch(() => {}), 90000);
    if (this._sweep.unref) this._sweep.unref();
  }

  /** One-time ingest of the two pre-B-f3e8 stores. deviceId → hostId via the
   *  dial host record (hosts' dial-token migration runs FIRST in server.js,
   *  so the record is guaranteed). LOSSLESS is load-bearing (review-confirmed
   *  failure mode: rename-after-swallowed-save-error loses every record on an
   *  ENOSPC boot): each store is ingested per-file (one corrupt file can't
   *  take the other's data with it), the merged store is saved STRICTLY and
   *  re-parsed, and a legacy file is renamed .migrated only when it was
   *  actually ingested AND the save verified. */
  _migrateLegacy() {
    const hmF = path.join(this.dataDir, 'host-mounts.json');
    const dvF = path.join(this.dataDir, 'device-mounts.json');
    // B-f276 slice legacy-mounts-gap (主开发 r4985, lane lg-remote-hardening): each store read ONCE through store-read's answer — never
    // existsSync (false for a stat that FAILED too: an EACCES or an EIO was «nothing to do») and never one catch for a failed read and
    // torn bytes alike (both were -1, and the list was saved without that store's records: no later start ingested it again). MISSING:
    // nothing to do. DATA: ingested. TORN: kept in place, said with the words that name the kept file (a person's file to fix). A read that
    // FAILED: HELD and OWED (-2) — the family helper reads it again off the loop (its records join the list at its lift) and the list saved
    // below carries the owed mark, so a later start ingests it again; nothing of it is renamed until a start's verified save
    const ingest = (file, map) => {
      let read; try { read = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read = { error }; }
      const la = SR.storeAnswer(read, { valid: STORE_SHAPE });   // a legacy store's answer
      if (la.state === 'missing') return null; // nothing to do
      if (la.state === 'unreadable') { this._legacyHeld(file, map, la); return -2; }   // HELD (said by the helper: held and read again)
      // r5127: torn bytes at a start are OWED too (the mark below) — a repaired file is read at the next start; no word advises deleting the list
      if (la.state !== 'data') { this.log(`legacy store ${path.basename(file)} did not parse (${la.why}) — kept in place under its own name (fix it or remove it: the next start reads it again, the list keeps it owed): ${file}`); return -1; }
      // its gate (test-hosts-held-census's lookup control): a record whose LOOKUP throws (the machines answering by a throw) is no crash
      // of the start — the store stays in place under its name and OWED (-3: read, its records not judged now); the next start tries again
      try { return this._ingestLegacy(file, la.value, map, { judged: this._judgedOf(file) }).length; }
      catch (e) { this.log(`${path.basename(file)}: its records could not be judged now (${(e && (e.code || e.name)) || 'an error'}) — kept in place, owed to the next start`); return -3; }   // r5127: the code or the error's name only (a message can carry a path)
    };
    const nPush = ingest(hmF, (m) => ({ ...m, dir: 'push' }));
    const nPull = ingest(dvF, (m) => ({
      id: m.id, dir: 'pull',
      // the B-f276 remainder (H10, its read S1): while hosts.json is HELD no device can be looked up — the key is derived as the
      // pairing minted it: a graduated ssh machine's device id is `grad-<its host id>`, a pure dial device's host is `host-dial-<id>`
      // (a wait wrote machine-mounts.json anyway and the one-time ingest never ran again: every pull mount was lost)
      hostId: (this.hosts.held?.() ? null : this.hosts.findByDeviceId?.(m.deviceId)?.id) || (/^grad-/.test(String(m.deviceId || '')) ? String(m.deviceId).slice(5) : 'host-dial-' + String(m.deviceId || '').replace(/[^\w-]/g, '')),
      remotePath: m.remotePath, mountpoint: m.mountpoint, createdAt: m.createdAt,
    }));
    if (nPush === -2 || nPull === -2) this._state.legacyOwed = true;   // OWED (r4985): the next start ingests it again (the mark _loadAnswer reads)
    if (nPush === -3 || nPull === -3) this._state.legacyOwed = true;   // a lookup that threw: owed too (its gate)
    if (nPush === -1 || nPull === -1) this._state.legacyOwed = true;   // r5127: torn bytes owed too — a repaired file is read at the next start
    if (nPush === null && nPull === null) return;
    try {
      const t = this._file + '.tmp';
      fs.writeFileSync(t, JSON.stringify(this._state, null, 2), { mode: 0o600 });
      fs.renameSync(t, this._file);
      JSON.parse(fs.readFileSync(this._file, 'utf-8')); // verify before renaming legacy stores
    } catch (e) { this.log('migration save FAILED — legacy stores kept, will re-run next boot: ' + e.message); return; }
    try { if (nPush >= 0 && fs.existsSync(hmF)) fs.renameSync(hmF, hmF + '.migrated'); } catch { }
    try { if (nPull >= 0 && fs.existsSync(dvF)) fs.renameSync(dvF, dvF + '.migrated'); } catch { }
    // its read (MUST 2): a store ingested wholly at a start leaves no judged list behind (the file is renamed above)
    if (this._state.legacyHandled) { for (const [f, n] of [[hmF, nPush], [dvF, nPull]]) if (n !== null && n >= 0) delete this._state.legacyHandled[path.basename(f)]; if (!Object.keys(this._state.legacyHandled).length) delete this._state.legacyHandled; }
    const migrated = (nPush > 0 ? nPush : 0) + (nPull > 0 ? nPull : 0);
    if (migrated) this.log(`migrated ${migrated} legacy mount record(s) into machine-mounts.json`);
  }

  /** one legacy store's records into the list (`st` its whole value) → the records ADDED. r4039 (f): a record the list already holds (the
   *  SAME record: its id, mount point and birth — an owed ingest after a lift) is skipped in silence; one whose id or mount point a
   *  DIFFERENT record of the list holds (a person's newer mount, made while the store was held) is PASSED OVER — the live one wins — and
   *  said by its store and count, once a run (主开发 r4985 (b)): never dropped in silence. Its read: a PUSH mount point is a path on ITS
   *  machine — it meets only a push record of the same machine (a PULL mount point is a folder of this hub: any pull record there);
   *  `judged` — the records a lift already judged (added, passed over or the same): skipped in silence, so the person's acts since stand
   *  (a mount removed after the lift stays removed) */
  _ingestLegacy(file, st, map, { judged = null } = {}) {
    const same = (r, m) => m.id === r.id && (m.mountpoint || null) === (r.mountpoint || null) && (m.createdAt || null) === (r.createdAt || null);
    const added = [], passed = [];
    for (const r of (Array.isArray(st && st.mounts) ? st.mounts : []).map(map)) {
      if (judged && judged.has(legacyKey(r))) continue;
      const meets = this._state.mounts.filter((m) => m.id === r.id || (r.mountpoint && m.mountpoint === r.mountpoint && (r.dir === 'pull' ? m.dir === 'pull' : m.dir !== 'pull' && m.hostId === r.hostId)));
      if (!meets.length) added.push(r);
      else if (!meets.every((m) => same(r, m))) passed.push(r);
    }
    this._state.mounts.push(...added);
    // r5127 MUST 2: by its store and a COUNT — no mount point (a path on a paired machine or a hub folder), no host, no account
    if (passed.length) this.log(`${path.basename(file)}: ${passed.length} legacy mount record(s) passed over — a mount the list already holds has the same id or mount point (that newer one is kept)`);
    return added;
  }
  /** the records of `file` a lift already judged (its read, MUST 2) — a Set of their keys, or null */
  _judgedOf(file) { const j = this._state.legacyHandled && this._state.legacyHandled[path.basename(file)]; return Array.isArray(j) ? new Set(j) : null; }
  /** HELD (主开发 r4985): a legacy store whose read FAILED — the family helper's hold over it, read again off the loop on its ladder. Its
   *  journal line says it is held and read again (never the advice to delete a store); the family's notice names it while it holds */
  _legacyHeld(file, map, a) {
    let h = this._legacyHolds.get(file);
    if (!h) {
      const base = path.basename(file);
      h = HOLD.create({ file, valid: STORE_SHAPE, code: 'legacy_mounts_unread', aside: (mark) => file + '.corrupt-' + mark,
        words: (f) => `${base} (an older list of this hub's mounts with its machines) could not be read (${f && f.code}) — VibeSpace reads it again by itself; its mounts join the list when it reads, and nothing of it is renamed or removed until then`,
        log: (m) => this.log(m), onLift: (value, info) => this._legacyLifted(file, map, value, info) });
      this._legacyHolds.set(file, h);
    }
    if (!h.held()) h.start(a);
  }
  /** the legacy hold LIFTED: `value` the records read (null: torn bytes, a copy kept aside as `setAside`, or the file gone). Its records
   *  join the list NOW (from the helper's value: no synchronous read of the data folder on the loop) and are saved, their machines healed
   *  if linked; the file keeps its name and the mark stays — the next start ingests it again (the same records: no second copy) and
   *  renames it after its verified save (主开发 r4985 (c): nothing of a legacy store renamed or removed while any part of it is unread) */
  _legacyLifted(file, map, value, { setAside = null } = {}) {
    // its read (SHOULD 3): torn at a read again, the list already keeps the store OWED — fixing the file is enough; never «delete the list»
    if (!value) { this.log(setAside ? `legacy store unreadable — kept in place under its own name (fix it or remove it: the next start reads it again, the list keeps it owed): ${file}: torn bytes (a copy kept aside as ${path.basename(setAside)})` : `${path.basename(file)} is gone — nothing of it to ingest`); return; }
    // r5127 MUST 1: an EARLIER lift's judgment (the store held a second time, across a start) is handed to this ingest, and the list saved is
    // the UNION of the earlier names and this lift's — a mount removed after a lift stays removed on every road, nothing said twice
    const earlier = this._judgedOf(file);
    let added;
    try {
      added = this._ingestLegacy(file, value, map, { judged: earlier });
      // its read (MUST 2): what this lift JUDGED is saved with the mark — the next start skips it (a mount the person removes since stays removed)
      this._state.legacyHandled = { ...(this._state.legacyHandled || {}), [path.basename(file)]: [...new Set([...(earlier || []), ...(Array.isArray(value.mounts) ? value.mounts : []).map(map).map(legacyKey)])] };
    } catch (e) { this.log(`${path.basename(file)}: its records could not be judged at the lift (${(e && (e.code || e.name)) || 'an error'}) — kept in place, owed to the next start`); return; }   // r5127: the store stays owed (the mark saved at its start)
    this._state.legacyOwed = true;
    this._save();
    this.log(`${path.basename(file)} read again: ${added.length} legacy mount record(s) listed now — the file keeps its name until a start saves the list`);
    if (!added.length) return;
    this._notify();
    // its read (SHOULD 1): ONLY the records it added are healed — a person's live mounts on that machine are never torn down for it
    for (const hostId of new Set(added.map((r) => r.hostId))) { try { if (this._online(hostId)) this.onMachineLinked(hostId, new Set(added.map((r) => r.id))); } catch { } }
  }

  /** remainder of B-f276 (bl-jobs, the store-read law over machine-mounts.json — every mount of a paired machine, each push
   *  record's vsmt_ tokenId): data → loaded · missing → empty, then the one-time legacy ingest (as before) · torn bytes → backed
   *  up (a copy), then empty and the ingest, as before · a read that FAILED (EIO, EACCES, a timeout on network storage) →
   *  HELD: no mount is listed, NOTHING is written over the file (_save refuses; the legacy ingest — which saves — never runs),
   *  the orphan-token sweep revokes nothing (every push token would read as an orphan), a person's mount / unmount / remount is
   *  refused by name, and the file is read again off the loop; read, the boot's restore runs then */
  _loadAnswer(a, { atLift = false } = {}) {   // data | missing — the start's answer, or a lift's (torn bytes kept: missing + setAside)
    this._state = a.state === 'data' ? a.value : { mounts: [] };
    if (!Array.isArray(this._state.mounts)) this._state.mounts = [];
    // B-f276 family unit 2 (主开发 r3081): TORN BYTES NEVER LIFT AS AN EMPTY LIST BY THEMSELVES — the orphan token sweep (restore's
    // first step) would revoke every machine's reverse-mount token over it. The lift is MARKED, and the mark saved at once: a token
    // minted before it is UNKNOWN to the sweep, which revokes none of them until the list reads (the copy put back: no mark) or a
    // person decides (a machine removed revokes its own — onMachineUnpaired)
    const tornCopy = a.state === 'missing' && a.setAside ? a.setAside : null;   // 2b: torn bytes lift through the helper (kept aside, then empty)
    // r3982 (3): a lift with no mounts read (torn bytes kept, a gone file) mid-life OWES the one-time legacy ingest to the next start —
    // marked in the list it saves (the torn lift saves: the next start reads data, and without the mark the ingest never ran again)
    if (a.state !== 'data' && atLift) this._state.legacyOwed = true;
    if (tornCopy) { this._state.tornAt = Date.now(); this._tornCopy = tornCopy; this._save(); }
    // the one-time legacy ingest reads the data folder SYNCHRONOUSLY — the boot's road only; at a read again (mid-life, the main loop
    // running) it waits for the next start (its read: never a synchronous read of the data folder on the loop)
    if (a.state !== 'data' && !atLift) this._migrateLegacy();
    else if (a.state === 'data' && !atLift && this._state.legacyOwed) { delete this._state.legacyOwed; this.log('machine-mounts.json: the one-time ingest of the legacy mount stores owed by a mid-life lift runs at this start'); this._migrateLegacy(); this._save(); }   // r4039 (f): the mark goes once it is paid (saved even when no legacy store was there)
    else if (a.state !== 'data') this.log('machine-mounts.json read again with no mounts — the one-time ingest of the legacy mount stores is not run mid-life (a legacy store still there is ingested at the next start: the lift marks it owed)');
  }
  _asideName(mark = Date.now()) { return this._file + '.corrupt-' + mark; }   // ONE set-aside name: the helper's keep and the copies' prefix (the census counts the names)
  /** 2b: the hold is the helper's — every guard of this file asks it by its old name: { code, at } while held, else null */
  get _unread() { const f = this._hold ? this._hold.held() : null; return f ? { code: f.code, at: f.since } : null; }
  /** a read again now (the held store's own road — the notice's press reads it through the helper) → true when it lifted */
  readAgain() { return this._hold ? this._hold.again() : Promise.resolve(false); }
  /** the hold LIFTED (the helper's onLift): `value` the records READ, or null (torn bytes kept aside as `setAside` — the time cut is
   *  marked — or the file gone): no legacy ingest mid-life; the boot's restore, which met an empty list while held, runs now */
  _lifted(value, { setAside = null } = {}) {
    this._loadAnswer(value ? { state: 'data', value } : { state: 'missing', setAside }, { atLift: true });
    this._notify();
    this.restore().catch(() => { });
  }
  /** the words a person reads while machine-mounts.json is held (the mounts list, a refused change) */
  unreadWords() { return this._hold ? this._hold.words() : null; }
  /** the held words from the hold's facts (`f`: its code, and `waiting` while a read is past the helper's bound) */
  _heldWords(f) { return `machine-mounts.json in VibeSpace's data folder could not be read (${f.code}); ${f.waiting ? 'a read of it is still waiting for the storage to answer, and its answer is used the moment it comes' : 'VibeSpace reads it again every few minutes'}. No mount is lost: nothing is written over it, and changes to mounts wait until it reads.`; }
  _refuseIfUnread(what) {
    if (this._unread) throw Object.assign(new Error(`${what}: ${this.unreadWords()}`), { code: 'mounts-unread', status: 503 });
  }
  _save() {
    if (!this._hold.writable('a machine-mounts.json write')) return;   // (said once a hold, by the helper)
    try { const t = this._file + '.tmp'; fs.writeFileSync(t, JSON.stringify(this._state, null, 2), { mode: 0o600 }); fs.renameSync(t, this._file); } catch { }
  }
  _notify() { this.broadcast({ type: 'machine-mounts-updated', mounts: this.list() }); }

  _online(hostId) {
    try {
      const h = this.hosts.get(hostId);
      return h.transport === 'dial' ? !!this.hosts.dialOnline?.(h.deviceId) : true; // ssh: reachability is probed at use
    } catch { return false; }
  }

  /** r3982 (1): did a run on the machine NOT reach it — by the run's OWN result (`_run` resolves, it never throws for a machine that does
   *  not reply): the device road's «device unreachable», an ssh refusal or ssh's own failure (255); for a command that cannot fail once it
   *  runs (`… || true`), any other code too */
  _notReached(r, { cannotFail = false } = {}) {
    if (!r || typeof r !== 'object') return true;
    if (r.refusal || r.code === 255 || r.ended === 'no-code' || r.code == null || /^device unreachable: /.test(String(r.stderr || ''))) return true;   // r4039 (d): a run killed, timed out or with no code never reached its end there
    return cannotFail ? r.code !== 0 : false;
  }
  /** r3813: is the mount's machine in the machines list (a held list counts as listed — unknown, never «not listed») */
  _hostListed(hostId) { try { this.hosts.get(hostId); return true; } catch (e) { return !(e && e.code === 'host_not_found'); } }
  /** the MOVE (part one): a mount's machine is NOT LISTED but a kept copy of hosts.json's torn bytes may name it — never «removed».
   *  → true (a kept copy names it), false (not listed, and no copy names it: removed), null — UNKNOWN (part one's words follow, r3792):
   *  the copies not read yet (a later run's first moments), a copy that cannot be read or is over the bound, or more copies than the
   *  look reads — the page says it neutrally (neither «removed» nor «may still name»), and is told once the copies are read */
  _hostInCopy(hostId) {
    const h = this.hosts;
    if (!h || typeof h.namedByCopy !== 'function') return false;
    let listed = true; try { this.hosts.get(hostId); } catch (e) { listed = !(e && e.code === 'host_not_found'); }   // held ⇒ «listed»: unknown, and the page shows no machine as removed while held
    if (listed) return false;
    if (typeof h.removedByPerson === 'function' && h.removedByPerson(hostId)) return false;   // r3982 (2): a PERSON's removal is «removed» at once — asked before the copies (more than the look reads must not make it unknown)
    let named = false; try { named = !!h.namedByCopy(hostId); } catch { return null; }
    // the copies not read: an unread answer names every id but a person's removal (that one is «removed» at once). This run's own tear
    // says «may still name»; otherwise the page waits for the read, said neutrally — an ordinary boot's first seconds would otherwise
    // say «the damaged list may name it» of a list nothing damaged, or «removed» of a machine a copy names
    if (typeof h.copiesRead === 'function' && !h.copiesRead()) { if (!named) return false; if (typeof h.tornCopy === 'function' && h.tornCopy()) return true; this._tellWhenCopiesRead(); return null; }
    if (named) return true;
    if (typeof h.copiesWhole === 'function' && !h.copiesWhole()) return null;   // more copies than the look reads: an older one may name it
    return false;
  }
  /** part one's words follow (r3792): the page is TOLD when the kept copies become read — an unknown row then takes its own section.
   *  One read asked at a time, at most once a minute (a copy that cannot be read is asked again by the copies' own minute) */
  _tellWhenCopiesRead() {
    const h = this.hosts, at = Date.now();
    if (typeof h.copiesWarm !== 'function' || (this._copiesTellAt && at - this._copiesTellAt < 60000)) return;
    this._copiesTellAt = at;
    Promise.resolve().then(() => h.copiesWarm()).catch(() => { }).then(() => { try { if (h.copiesRead()) this._notify(); } catch { /* a stand-in without a broadcast */ } });
  }
  list() {
    return this._state.mounts.map((m) => ({ ...(m.dir === 'pull'
      ? this._pullRow(m)
      : { id: m.id, dir: 'push', hostId: m.hostId, folder: m.folder, mountpoint: m.mountpoint, mode: m.mode, os: m.os, method: m.method, via: m.tunnelPort ? 'tunnel' : 'public', mountedAt: m.mountedAt, remoteMounted: !this._pushDown?.has(m.id) }), ...((v) => (v === true ? { hostInCopy: true } : v === null ? { hostUnknown: true } : {}))(this._hostInCopy(m.hostId)) }));
  }

  /** B-af94: a pull row's words said from a coded error keep its code (a code is shown only while ITS words are the row's) */
  _sayCode(id, e) { if (e && MW.known(e.code)) (this._pullErrorCodes = this._pullErrorCodes || new Map()).set(id, { words: String(e.message), code: e.code, params: e.params || {} }); }

  /** A pull's row: its words AND their code + params when the hub knows them (the page words those — zh, ja — and shows the
   *  English only for a code it does not know). A code is given only while ITS words are the row's. */
  _pullRow(m) {
    const error = (this._pullErrors && this._pullErrors.get(m.id)) || null, pc = error && this._pullErrorCodes && this._pullErrorCodes.get(m.id);
    // r5/r6 (reads 4 #8, 5 #2): a HOLDER says it shares its folder — EVERY waiting row, which way it nests, and whether its machine is gone
    const shares = [...this._held].filter(([, h]) => h.otherId === m.id).map(([id, h]) => { const o = this._state.mounts.find((x) => x.id === id) || {}; let name = null; try { name = this.hosts.get(o.hostId).name || o.hostId; } catch (e) { name = e && e.code === 'hosts-unread' ? String(o.hostId || '') : null; } return { machine: name == null ? '' : String(name), removed: name == null, remotePath: String(o.remotePath || ''), kind: h.kind }; });
    // 主开发 09:24Z: a pull row's words with no code recorded beside them are found BY THEIR WORDS, as a cloud row's are (codeOfWords)
    const byWords = !(pc && pc.words === error) && error ? MW.codeOfWords(error) : null;
    return { id: m.id, dir: 'pull', hostId: m.hostId, remotePath: m.remotePath, mountpoint: m.mountpoint, live: this._live.has(m.id), online: this._online(m.hostId), createdAt: m.createdAt, error, ...(shares.length ? { shares } : {}),
      ...(pc && pc.words === error ? { errorCode: pc.code, errorParams: pc.params || {} } : byWords ? { errorCode: byWords.code, errorParams: byWords.params } : {}) };
  }

  // ═══ PUSH direction (this instance's folder → the machine) ═══

  /** How the remote reaches OUR /dav: device-agent tunnel first (NAT-proof —
   *  bytes ride the device link; the ONLY path for dial machines),
   *  agentd.publicUrl second. wantPort pins a previous tunnel port. */
  async _davBase(hostId, { wantPort = 0, publicUrlFallback = null } = {}) {
    const lp = this.localPort();
    const dial = (() => { try { return this.hosts.get(hostId).transport === 'dial'; } catch { return false; } })();
    if ((dial || this.hosts.dataPlaneOn?.()) && lp) {
      let door = null;
      try {
        const dm = await this.hosts.deviceBounded(hostId, 10000);
        const net = require('net');
        // B-7f0b (r1220): the tunnel ends at a door of this mount's own — /dav for its own pass, nothing else (no sign-in page)
        door = await MD.open({ tokens: this.mountTokens, log: this.log });
        const { port } = await dm.reverseForward({ port: wantPort || 0, connectLocal: () => net.connect(door.port, '127.0.0.1') });
        return { base: `http://127.0.0.1:${port}`, tunnelPort: port, door };
      } catch (e) { if (door) await door.close(); if (e && e.code === 'mount_door_unavailable') throw MW.refusal('mount_door_unavailable'); /* r1317 (5): words a page can show */ if (dial) throw MW.refusal('device_unreachable'); /* ssh → public fallback below */ }
    }
    const pub = this.publicUrl() || publicUrlFallback;
    if (pub) return { base: String(pub).replace(/\/$/, ''), tunnelPort: null };
    // the B-f276 remainder (its census's audit, 主开发 01:20Z (1)): a HELD machines list is why no tunnel came — said by name, never «no path»
    if (this.hosts && typeof this.hosts.held === 'function' && this.hosts.held()) throw Object.assign(new Error(`reaching this instance from a machine: ${this.hosts.unreadWords()}`), { code: 'hosts-unread', status: 503 });
    throw MW.refusal('no_dav_path');
  }

  // ── run-on-machine helpers (device link first; ssh fallback for ssh hosts) ──
  async _run(hostId, cmd, args, { input } = {}) {
    const h = this.hosts.get(hostId);
    if (h.transport === 'dial' || this.hosts.dataPlaneOn?.()) {
      try {
        const dm = await this.hosts.deviceBounded(hostId, 10000);
        const r = await dm.runCmd(cmd, args, { stdin: input, timeoutMs: 60000, by: 'system:machine-mounts' }); // lane device-act-audit
        return { code: r.code, stdout: r.stdout, stderr: r.stderr };
      } catch (e) {
        if (h.transport === 'dial') return { code: 1, stdout: '', stderr: 'device unreachable: ' + e.message }; // no ssh to fall to
      }
    }
    const sshArgs = [...this.hosts.sshArgs(h, { multiplex: true }), '--', [cmd, ...args.map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`)].join(' ')];
    const { feedStdin, sshRefusal } = require('./hosts.js'); // THE ONE STDIN FEED (lane hub-dies-dead-ssh-host): a dead machine's EPIPE is an answer, never the hub's death
    return await new Promise((resolve) => {
      const child = execFile('ssh', sshArgs, { env: this.hosts.sshEnv(), timeout: 60000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
        const refusal = err && sshRefusal(h, err, stderr, fed);
        if (err) resolve({ code: err.code || 1, stdout: (stdout || '').toString(), stderr: (stderr || err.message).toString(), ...(refusal ? { refusal: refusal.code } : {}), ...(err.killed || err.signal || typeof err.code !== 'number' ? { ended: 'no-code' } : {}) });   // r4039 (d): killed, timed out, or no exit code of its own
        else resolve({ code: 0, stdout: (stdout || '').toString(), stderr: '' });
      });
      const fed = feedStdin(child, input);
    });
  }

  async detectOS(hostId) {
    const r = await this._run(hostId, 'uname', ['-s']);
    const u = (r.stdout || '').trim();
    if (r.code === 0 && u) return u === 'Darwin' ? 'macos' : (u === 'Linux' ? 'linux' : 'unix');
    return 'windows'; // uname missing → assume Windows
  }
  async _remoteHome(hostId) {
    const r = await this._run(hostId, 'sh', ['-c', 'echo "$HOME"']);
    return (r.stdout || '').trim() || '/root';
  }
  async _hasBin(hostId, name) {
    const r = await this._run(hostId, 'sh', ['-c', `command -v ${name} >/dev/null 2>&1 && echo yes || echo no`]);
    return (r.stdout || '').includes('yes');
  }

  /** Ensure rclone on the machine: prefer ~/.vibespace/bin/rclone, else the
   *  system one, else fetch the pinned build (unzip → busybox → python3
   *  fallbacks — unzip is absent on bare Debian, real report). */
  async _ensureRclone(hostId, osKind, { force = false } = {}) {
    const home = await this._remoteHome(hostId);
    const remoteBin = `${home}/.vibespace/bin/rclone`;
    if (!force) {
      const has = await this._run(hostId, 'sh', ['-c', `[ -x "${remoteBin}" ] && "${remoteBin}" version >/dev/null 2>&1 && echo yes || echo no`]);
      if ((has.stdout || '').includes('yes')) return remoteBin;
      if (await this._hasBin(hostId, 'rclone')) return 'rclone';
    }
    const arch = (await this._run(hostId, 'uname', ['-m'])).stdout.trim();
    const rcArch = { x86_64: 'amd64', aarch64: 'arm64', arm64: 'arm64' }[arch] || 'amd64';
    const rcOs = osKind === 'macos' ? 'osx' : 'linux';
    const url = `https://downloads.rclone.org/${RCLONE_PIN}/rclone-${RCLONE_PIN}-${rcOs}-${rcArch}.zip`;
    const script = `set -e; mkdir -p "${home}/.vibespace/bin"; cd "$(mktemp -d)"; curl -fsSL -o r.zip '${url}'; `
      + `if command -v unzip >/dev/null 2>&1; then unzip -oj r.zip 'rclone-*/rclone' -d "${home}/.vibespace/bin"; `
      + `elif command -v busybox >/dev/null 2>&1 && busybox unzip -h >/dev/null 2>&1; then busybox unzip -o r.zip && cp rclone-*/rclone "${home}/.vibespace/bin/"; `
      + `elif command -v python3 >/dev/null 2>&1; then python3 -c "import zipfile,glob,shutil,os,stat; z=zipfile.ZipFile('r.zip'); z.extractall(); src=glob.glob('rclone-*/rclone')[0]; dst=os.path.expanduser('${home}/.vibespace/bin/rclone'); shutil.copy(src,dst); os.chmod(dst,0o755)"; `
      + `else echo 'need unzip (or busybox/python3) on this machine — e.g. apt install unzip' >&2; exit 9; fi; `
      + `chmod 755 "${remoteBin}"; "${remoteBin}" version >/dev/null 2>&1 && echo OK`;
    // The ~20MB download exceeds the daemon's 30s run-cmd clamp on slow
    // uplinks (B-ee6d, review finding) — the device path streams it via
    // runStream (unbounded); ssh keeps the plain _run (no daemon clamp there).
    let out = '';
    const h = this.hosts.get(hostId);
    if (h.transport === 'dial' || this.hosts.dataPlaneOn?.()) {
      try {
        const dm = await this.hosts.deviceBounded(hostId, 10000);
        const chunks = [];
        const r = await dm.runStream('sh', ['-c', script], { onData: (b) => chunks.push(b), by: 'system:machine-mounts' });
        out = Buffer.concat(chunks).toString('utf8');
        if (r.code !== 0 && !out.includes('OK')) throw new Error('exit ' + r.code + ': ' + out.slice(-200));
      } catch (e) {
        if (h.transport === 'dial') throw MW.refusal('rclone_install_device_failed', { detail: String(e.message || e).slice(0, 200) });
        out = ''; // ssh fallback below
      }
    }
    if (!out.includes('OK')) {
      const fetch = await this._run(hostId, 'sh', ['-c', script]);
      out = (fetch.stdout || '') + (fetch.stderr || '');
    }
    if (!out.includes('OK')) throw MW.refusal('rclone_install_host_failed', { detail: out.slice(0, 200) });
    return remoteBin;
  }

  /** Mount THIS VibeSpace's <folder> on the machine as <mountpoint>. */
  // Overall deadline for a mount operation (2.214.1, userW's HTTP 502): the
  // chain crosses the device link many times — an await that stalls in an
  // unforeseen way (half-open dial stream, wedged daemon) used to hang the
  // HTTP handler FOREVER, so the proxy answered 502 and the server logged
  // NOTHING (the forensic blindness that motivated this). Race a hard cap so
  // the dialog always gets a real, actionable error.
  _withDeadline(p, ms, label) {
    return Promise.race([p, new Promise((_, rej) => {
      const t = setTimeout(() => rej(MW.refusal(label === 'push mount' ? 'push_mount_timed_out' : 'pull_mount_timed_out', { s: Math.round(ms / 1000) })), ms);
      t.unref?.();
    })]);
  }

  async mountPush(hostId, opts = {}) {
    this._refuseIfUnread('adding a push mount');   // remainder of B-f276: a held machine-mounts.json takes no change
    console.log(`[machine-mounts] push mount request → ${hostId} folder=${opts.folder || '~'} mode=${opts.mode || 'ro'}`);
    const t0 = Date.now();
    try {
      const r = await this._withDeadline(this._mountPushInner(hostId, opts), 150000, 'push mount');
      console.log(`[machine-mounts] push mount OK in ${Date.now() - t0}ms → ${r.mountpoint} (${r.method}, ${r.via})`);
      return r;
    } catch (e) {
      console.warn(`[machine-mounts] push mount FAILED after ${Date.now() - t0}ms: ${e.message}`);
      global.__vsEvent?.('machine-mount-push-failed', { detail: String(e.message).slice(0, 160) });
      throw e;
    }
  }

  async _mountPushInner(hostId, { folder, mode = 'ro', mountpoint, publicUrlFallback } = {}) {
    // expand ~ BEFORE resolving — a literal '~' resolved against cwd made the
    // token mint fail with a bare 'root does not exist' (real report)
    const expanded = String(folder || os.homedir()).replace(/^~(?=$|\/)/, os.homedir());
    const abs = path.resolve(expanded);
    // LOOP GUARD (2.215.1, userW's real attempt): pushing a folder that IS a
    // pull-mount mirror routes every IO through the device chain TWICE
    // (machine → tunnel → /dav → instance FUSE → tunnel → machine) — rclone's
    // daemon never comes up ("Daemon timed out"). Refuse with the real story.
    const pull = this._state.mounts.find((m) => m.dir === 'pull' && m.mountpoint && (abs === m.mountpoint || abs.startsWith(m.mountpoint + '/')));
    if (pull) {
      const mName = (() => { try { return this.hosts.get(pull.hostId)?.name || pull.hostId; } catch { return pull.hostId; } })();
      throw MW.refusal(pull.hostId === hostId ? 'push_loop_own' : 'push_loop_other', { machine: String(mName), remotePath: String(pull.remotePath || '') });
    }
    // Existence/health probe via a CHILD process — NEVER node fs on a
    // possibly-FUSE-backed path (2.108.3 class; real incident: the old
    // fs.existsSync here BLOCKED THE EVENT LOOP on a wedged storage mount —
    // the whole server froze and the proxy answered 502 with zero logs).
    const shqL = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
    const probe = await new Promise((resolve) => {
      execFile('sh', ['-c', `[ -e ${shqL(abs)} ] || exit 3; ls ${shqL(abs)} >/dev/null 2>&1 || exit 4`], { timeout: 6000 }, (err) => {
        if (!err) return resolve('ok');
        if (err.killed || err.signal) return resolve('hung');
        resolve(err.code === 3 ? 'missing' : err.code === 4 ? 'unreadable' : 'hung');
      });
    });
    if (probe === 'missing') throw MW.refusal('folder_missing', { path: abs });
    if (probe !== 'ok') throw MW.refusal(probe === 'hung' ? 'folder_hung' : 'folder_unreadable', { path: abs });
    const { base, tunnelPort, door } = await this._davBase(hostId, { publicUrlFallback });
    console.log(`[machine-mounts] push: dav base ready (${tunnelPort ? 'tunnel:' + tunnelPort : 'public'})`);
    let share;
    try { share = this.mountTokens.mint({ name: 'host:' + hostId, kind: 'reverse-mount', owner: hostId, root: abs, mode: mode === 'rw' ? 'rw' : 'ro' }); }
    catch (e) { if (door) await door.close(); throw e; }
    const shareToken = share.raw, shareTokenId = share.rec.id;
    if (door) door.setTokenId(shareTokenId);   // B-7f0b: the door serves THIS mount's pass and no other
    try {
    const davUrl = base + '/dav';
    const osKind = await this.detectOS(hostId);
    const home = await this._remoteHome(hostId);
    // '~/x' typed into the dialog must mean the MACHINE's home (inc-mtl78uhs,
    // userW: argv-form mkdir made a literal '~' directory, rclone was quoted
    // so the shell never expanded it either)
    // …and a trailing slash must go: the machine's mount table prints the
    // path bare, so the liveness probe (`mount | grep ' on <mp> '`) would flip
    // a healthy '…/x/' mount to "GONE" forever
    const mp = (mountpoint
      ? String(mountpoint).replace(/^~(?=\/|$)/, home).replace(/^\$HOME(?=\/|$)/, home)
      : `${home}/vibespace-remote/${path.basename(abs) || 'root'}`).replace(/(.)\/+$/, '$1');
    const id = 'mm-' + require('crypto').randomBytes(4).toString('hex');
    let method;

    if (osKind === 'windows') {
      // native WebClient redirector — no FUSE. drive letter or UNC-style path.
      const r = await this._run(hostId, 'cmd', ['/c', `net use * ${davUrl.replace(/^https?:/, m => m)} /user:vibespace ${shareToken} /persistent:no`]);
      if (r.code !== 0) throw MW.refusal('net_use_failed', { detail: (r.stderr || r.stdout).slice(0, 200) });
      method = 'net-use';
    } else {
      // MOUNT LADDER (2.369.12, inc-mtl78uhs — userW's Mac HAS macFUSE, yet
      // `rclone mount --daemon` died in 2s with the child's real reason lost:
      // --daemon detaches the child's stderr, so the dialog only ever showed
      // "Daemon timed out … exit 1"). Three fixes in one place: ① the daemon
      // child logs to the SAME file we tail (--log-file) so the dialog shows
      // the real cause; ② macOS tries `rclone nfsmount` first (rclone ≥1.66:
      // built-in NFS server + the OS's native NFS client — no kext, no macFUSE
      // approval dance), then FUSE `rclone mount` when macFUSE is present,
      // then native mount_webdav; every rung's failure is kept and shown.
      // Linux keeps the single rclone path.
      const rclone = await this._ensureRclone(hostId, osKind);
      await this._run(hostId, 'mkdir', ['-p', mp]);
      const env = `RCLONE_CONFIG_VSDAV_TYPE=webdav RCLONE_CONFIG_VSDAV_URL='${davUrl}' RCLONE_CONFIG_VSDAV_VENDOR=other RCLONE_CONFIG_VSDAV_BEARER_TOKEN='${shareToken}'`;
      // FULL fd redirect (</dev/null >/dev/null 2>>log) is MANDATORY: without
      // it the --daemon rclone inherits the ssh channel's stdio and the
      // ControlMaster connection never frees, deadlocking the next
      // multiplexed ssh (transport hygiene, caught by the reverse-mount e2e).
      // setsid is LINUX-ONLY (macOS has none — the installer hit the same
      // trap, 2.152.1): prefix it only where it exists; rclone --daemon
      // self-detaches either way.
      const setsid = '$(command -v setsid >/dev/null 2>&1 && echo setsid)';
      const logf = `${home}/.vibespace/host-mount-${id}.log`;
      // THE argv is src/mount-argv.js's (B-069b, lane mount-argv-vsdav-twin): SSH_HOST_WEBDAV_ROW carries --daemon +
      // --log-file, the vfs / dir-cache cells and the macOS --volname (Finder's name, after the folder); this line
      // composes only the env, the setsid prefix, the quoted words (shellWords) and the fd redirect.
      const rcloneLine = (via) => {
        const argv = rcloneMountArgs({ row: SSH_HOST_WEBDAV_ROW, via, remote: 'vsdav:', mountpoint: mp, readOnly: mode !== 'rw', logFile: logf, hostOs: osKind, folderName: path.basename(abs) });
        return { sub: argv[0], line: `${env} ${setsid} ${shellWords([rclone, ...argv])} </dev/null >/dev/null 2>>${shellWords([logf])}` };
      };
      const runRclone = async (via) => {
        const { sub, line } = rcloneLine(via);
        const r = await this._run(hostId, 'sh', ['-c', line]);
        if (r.code !== 0) {
          // the daemon child now writes to logf too — pull its tail so the
          // dialog shows the REAL reason, not an empty message
          const tail = await this._run(hostId, 'sh', ['-c', `tail -c 500 '${logf}' 2>/dev/null`]).catch(() => ({ stdout: '' }));
          const detail = ((r.stderr || r.stdout || '').trim() || (tail.stdout || '').trim() || `no output — see ${logf} on the machine`);
          throw new Error(`rclone ${sub} failed: ` + detail.slice(0, 400));
        }
      };
      const rungs = [];
      if (osKind === 'macos') {
        let nfsOk = (await this._run(hostId, 'sh', ['-c', `"${rclone}" nfsmount --help >/dev/null 2>&1 && echo yes || echo no`])).stdout.includes('yes');
        if (!nfsOk && rclone !== 'rclone') {
          // an OWNED pre-1.66 install (the old v1.65.2 pin) — re-install at the
          // current pin so the FUSE-less rung exists; a system rclone is not ours to touch
          try { await this._ensureRclone(hostId, osKind, { force: true }); nfsOk = (await this._run(hostId, 'sh', ['-c', `"${rclone}" nfsmount --help >/dev/null 2>&1 && echo yes || echo no`])).stdout.includes('yes'); } catch { }
        }
        const fuse = await this._run(hostId, 'sh', ['-c', 'if [ -d /Library/Filesystems/macfuse.fs ] || [ -d /Library/Filesystems/osxfuse.fs ]; then echo yes; else echo no; fi']);
        if (nfsOk) rungs.push({ method: 'rclone-nfs', run: () => runRclone('nfs') });
        if ((fuse.stdout || '').includes('yes')) rungs.push({ method: 'rclone-webdav', run: () => runRclone('fuse') });
        rungs.push({ method: 'mount_webdav', run: async () => {
          // macOS built-in WebDAV: keychain-free credentialed URL
          const url2 = davUrl.replace('://', `://vibespace:${shareToken}@`);
          const r = await this._run(hostId, 'mount_webdav', ['-S', url2, mp]);
          if (r.code !== 0) throw new Error('mount_webdav failed: ' + (r.stderr || r.stdout).slice(0, 200));
        } });
      } else {
        rungs.push({ method: 'rclone-webdav', run: () => runRclone('fuse') });
      }
      const errs = [];
      for (const rung of rungs) {
        try { await rung.run(); method = rung.method; break; }
        catch (e) { errs.push(`[${rung.method}] ${String(e.message || e)}`); console.warn(`[machine-mounts] push rung ${rung.method} failed on ${hostId}: ${String(e.message || e).slice(0, 200)}`); }
      }
      if (!method) throw (errs.length ? new Error(errs.join('\n')) : MW.refusal('no_mount_method'));   // B-af94: the rungs' list is the tools' own text
    }
    const rec = { id, dir: 'push', hostId, folder: abs, mountpoint: mp, mode, os: osKind, method, tokenId: shareTokenId, tunnelPort, mountedAt: Date.now() };
    if (tunnelPort) this._pushTunnelOwned.add(id);
    this._state.mounts.push(rec);
    if (door) (this._doors || (this._doors = new Map())).set(id, Promise.resolve(door));
    this._save(); this._notify();
    return { id, mountpoint: mp, os: osKind, method, via: tunnelPort ? 'tunnel' : 'public' };
    } catch (e) {
      // a FAILED push must not leak its freshly-minted credential — every
      // failed attempt used to leave an indistinguishable orphan token row
      // (real report: 6 stacked duplicates after the Mac's bad day)
      try { this.mountTokens.revoke?.(shareTokenId); } catch { }
      if (door) { try { await door.close(); } catch { } }   // B-7f0b: a failed push leaves no door
      throw e;
    }
  }

  /** B-7f0b (r1220): a push mount's own door (opened once, bound to the mount's own pass) — a re-own at boot or by the health
   *  sweep re-points the device's tunnel at it: an existing mount moves off the hub's whole port at its next re-attach */
  /** r1382 (1): is this record still a mount (an unmount may land while a re-own's door is opening)? */
  _stillMounted(id) { return !!(this._state && this._state.mounts.some((m) => m.id === id)); }

  _doorOf(rec) {
    const doors = this._doors || (this._doors = new Map());
    let d = doors.get(rec.id);
    if (!d) {
      // r1317 (4): a record with no pass id gets a door that serves no pass (401 to every request) — said once, never in silence
      if (!rec.tokenId && !(this._noPassSaid || (this._noPassSaid = new Set())).has(rec.id)) {
        this._noPassSaid.add(rec.id);
        this.log(`push mount ${rec.id} on ${rec.hostId}: its record names no pass, so its door answers every request 401 — remove it and push the folder again`);
      }
      // r1317 (2): the PENDING open is kept, so a second re-own at once (the link's heal and the health sweep) shares it
      d = MD.open({ tokens: this.mountTokens, tokenId: rec.tokenId, log: this.log });
      doors.set(rec.id, d);
      d.catch(() => { if (doors.get(rec.id) === d) doors.delete(rec.id); });   // a door that could not open is asked anew next time
    }
    return d;
  }

  async _unmountPush(rec) {
    // best-effort on the machine (it may be offline) — the token is revoked
    // and the record dropped REGARDLESS, so a dead machine can't hold a live
    // credential hostage. r3813: → null when the machine's side was reached, else why not ('not-listed' | 'not-reached') — said
    const listed = this._hostListed(rec.hostId);
    let side = listed ? null : 'not-listed';
    if (listed) try {
      if (rec.method === 'rclone-webdav' || rec.method === 'rclone-nfs' || rec.method === 'mount_webdav') {
        const r = await this._run(rec.hostId, 'sh', ['-c', `fusermount -u '${rec.mountpoint}' 2>/dev/null || umount '${rec.mountpoint}' 2>/dev/null || true`]);
        if (this._notReached(r, { cannotFail: true })) side = 'not-reached';   // r3982 (1): the run RESOLVES on a machine that does not reply — its own result says so
      } else if (rec.method === 'net-use') {
        const r = await this._run(rec.hostId, 'cmd', ['/c', `net use ${rec.mountpoint} /delete /y`]);
        if (this._notReached(r)) side = 'not-reached';
      }
    } catch { side = 'not-reached'; }
    try { this.mountTokens.revoke?.(rec.tokenId); } catch { }
    { const opening = this._doors && this._doors.get(rec.id); if (opening) { this._doors.delete(rec.id); try { await (await opening).close(); } catch { } } }   // B-7f0b: its door goes with it (its connections too)
    if (rec.tunnelPort) { // release the device-side listener (best-effort)
      try { const dm = await this.hosts.deviceBounded(rec.hostId); await dm.reverseUnforward(rec.tunnelPort); } catch { }
    }
    return side;
  }

  // ═══ PULL direction (the machine's folder → this workspace) ═══

  async mountPull(hostId, opts = {}) {
    this._refuseIfUnread('adding a mount');   // remainder of B-f276: a held machine-mounts.json takes no change
    console.log(`[machine-mounts] pull mount request → ${hostId} path=${opts.remotePath || '~'}`);
    const t0 = Date.now();
    try {
      const r = await this._withDeadline(this._mountPullInner(hostId, opts), 150000, 'pull mount');
      console.log(`[machine-mounts] pull mount OK in ${Date.now() - t0}ms → ${r.mountpoint}`);
      return r;
    } catch (e) {
      if (e && (e.code === 'mount_removed' || e.code === 'mount_point_in_use' || e.code === 'mount_point_nested' || e.code === 'mount_point_releasing' || e.code === 'mount_point_unchecked' || e.code === 'mount_point_add_unchecked')) { console.log(`[machine-mounts] pull mount request ended after ${Date.now() - t0}ms: ${e.message}`); throw e; }   // the person's own removal, a folder refused by name: no failure event
      console.warn(`[machine-mounts] pull mount FAILED after ${Date.now() - t0}ms: ${e.message}`);
      global.__vsEvent?.('machine-mount-pull-failed', { detail: String(e.message).slice(0, 160) });
      throw e;
    }
  }

  async _mountPullInner(hostId, { remotePath, mountpoint } = {}) {
    const h = this.hosts.get(hostId); // throws for unknown machine
    // '~' paths are what the dialog's own autocomplete suggests — expand them
    // against the MACHINE's home (review finding: suggest-then-reject)
    let rp = String(remotePath || '');
    if (rp === '~' || rp.startsWith('~/')) {
      const dm = await this.hosts.deviceBounded(hostId, 8000);
      const home = String((await dm.runCmd('sh', ['-c', 'echo "$HOME"'], { timeoutMs: 8000, by: 'system:machine-mounts' })).stdout || '').trim();
      if (!home.startsWith('/')) throw MW.refusal('home_unresolved');
      rp = home + rp.slice(1);
      remotePath = rp;
    }
    if (!remotePath || !String(remotePath).startsWith('/')) throw MW.refusal('remote_path_relative');
    // Strip a trailing slash (real userW bug): the daemon's serve-folder
    // confines requests with `root + path.sep`, so a root ending in '/' makes
    // the prefix a DOUBLE slash that no real subpath matches → every file 403s
    // ("couldn't list files: 403"). mountPush avoids this via path.resolve;
    // do the same here so the served + stored path is clean.
    remotePath = String(remotePath).replace(/\/+$/, '') || '/';
    const slug = String(h.name || hostId).replace(/[^\w-]/g, '-').slice(0, 40);
    const mp = mountpoint || path.join(os.homedir(), 'vibespace-machines', `${slug}-${path.basename(remotePath) || 'root'}`);
    let rec = this._state.mounts.find((m) => m.dir === 'pull' && m.hostId === hostId && m.remotePath === remotePath && path.resolve(m.mountpoint) === path.resolve(mp));   // r4 (read 3 #5): a slash spelling is that record
    let askedReal = null;
    if (!rec) {
      // B-844b / B-6c4f: ONE folder holds one machine's folder — the same folder (by its REAL path: a symlink, `..`, a slash
      // spelling are one folder), or one nested inside another pull's in either direction, is refused by name: one record's
      // release (a lazy unmount) would end the other's mount, or take everything beneath it
      const [realR, learnedAdd] = await Promise.all([(this._realpath || realpathChild)(mp), this._resolveReals()]), real = realR || path.resolve(mp);
      if (learnedAdd && learnedAdd.length) await this._recheckPairs().catch(() => { });   // r8 (read 7 #3): a sibling's path learned here — its pair is checked now
      // r7 (read 6 #2): an add whose folder did not ANSWER is refused (nothing recorded) — its pair could never be checked later
      if (!realR) throw MW.refusal('mount_point_add_unchecked', { mountpoint: mp });   // r8 (read 7 #1): nothing recorded — nothing is tried again
      rec = this._state.mounts.find((m) => m.dir === 'pull' && m.hostId === hostId && m.remotePath === remotePath && (this._realMp.get(m.id) || path.resolve(m.mountpoint)) === real);   // its read: asked twice meanwhile (r4: or by another spelling) — that record, never «in use» by itself
      if (!rec) { const c = this._folderConflict(real, null); if (c) throw this._conflictError(c); }
      askedReal = realR;
    }
    if (!rec) {
      rec = { id: 'mm-' + require('crypto').randomBytes(4).toString('hex'), dir: 'pull', hostId, remotePath, mountpoint: mp, createdAt: Date.now() };
      if (askedReal) this._realMp.set(rec.id, askedReal);   // r6 (read 5 #1): only a REAL answer is kept — no answer is asked again (never the path as written)
      this._state.mounts.push(rec);
      this._save();
    }
    await this._upAsked(rec);
    this._notify();
    return { ...rec, live: this._live.has(rec.id) };
  }

  /** cure 4: the mount a caller ASKED for (mountPull / remount) — a removal meanwhile is said as itself, even when the road
   *  threw first (the link closing, a hung release: their words would be stale for a record that is gone) */
  async _upAsked(rec) {
    const gone = () => !this._state.mounts.some((m) => m.id === rec.id);
    try { await this._up(rec); } catch (e) { if (gone()) throw removedWhileMounting(); throw e; }
    if (gone()) throw removedWhileMounting();
  }

  async _up(rec) {
    if (this._live.has(rec.id) || this._mounting.has(rec.id)) return;   // up or being made: nothing to wait for (a second press never queues)
    // B-844b r4 (its read 3 #1a): the FIRST mount of this hub — a machine dialling in before restore's check — runs the pair check
    // first (one shared check): which record holds a folder is never decided by which machine redialled first
    if (!this._pairsOnce) this._pairsOnce = this._recheckPairs().catch(() => { });
    await this._pairsOnce;
    // r6 (read 5 #1): a record whose OWN real path is unknown (its realpath child did not answer — a wedged target) is never mounted:
    // two spellings of one folder must never both mount; the next check asks again
    if (!this._realMp.has(rec.id)) {
      const learned = (await this._resolveReals()) || [];   // r8: its «could not be checked» words go in _resolveReals once learned
      if (learned.length) await this._recheckPairs().catch(() => { });   // r7/r8: a path learned NOW (its own or a sibling's) — the pair check runs again before anything
    }
    if (!this._realMp.has(rec.id) && this._held.has(rec.id)) { const h = this._held.get(rec.id); this._pullRetryAt?.delete(rec.id); throw Object.assign(new Error(h.words), { code: h.code, params: h.params }); }   // r8 (read 7 #6): a held row keeps its words
    if (!this._realMp.has(rec.id)) {   // r7 (read 6 #6): said on the row (the dot), the next check asks again once its child has ended
      const params = { mountpoint: String(rec.mountpoint || '') }, words = MW.wordsFor('mount_point_unchecked', params);
      (this._pullErrorCodes = this._pullErrorCodes || new Map()).set(rec.id, { words, code: 'mount_point_unchecked', params });
      if ((this._pullErrors = this._pullErrors || new Map()).get(rec.id) !== words) { this._pullErrors.set(rec.id, words); this._notify(); }
      this._pullRetryAt?.delete(rec.id);
      throw MW.refusal('mount_point_unchecked', params);
    }
    // the cure (the readers' 3): a boot release of THIS record's folder still running is WAITED for — never raced. Keyed by
    // the MOUNT POINT, resolved (cure-2 read #3): a pull removed and added again on the same folder meanwhile has a new id
    // and waits too — never mounted before the boot's step releases that folder under it
    const mine = this._markKey(rec);   // B-844b: keyed by the REAL path; read 2: a mark on a folder NESTED with this one is waited for too
    const rels = this._releasing ? [...this._releasing].filter(([k]) => k === mine || (k !== '/' && mine.startsWith(k + '/')) || (mine !== '/' && k.startsWith(mine + '/'))).map(([, v]) => v) : [];
    for (const rel of rels) { try { await rel; } catch { } }
    const held = this._held.get(rec.id);
    if (held) { this._pullRetryAt?.delete(rec.id); throw Object.assign(new Error(held.words), { code: held.code, params: held.params }); }   // r6: never tried — no failed-try mark   // B-844b / B-6c4f: a second record on a folder another holds — never mounted, never released
    // cure 2 (主开发's «as if a must»): the wait can last minutes — a pull the person REMOVED meanwhile is never mounted
    // (an rclone and a live entry with no row and no door)
    if (!this._state.mounts.some((m) => m.id === rec.id)) return;
    if (this._live.has(rec.id) || this._mounting.has(rec.id)) return;
    let lc = this._liveConflict(rec);   // its read: two machines dialling in before the boot's pair check — never both mounted on one folder
    if (lc && lc.removed) {   // B-844b r4 (read 3 #2): a pull REMOVED from this folder is still being let go — waited for (bounded), never refused by a row that is gone
      await this._letGo(lc.other.id);
      if (!this._state.mounts.some((m) => m.id === rec.id) || this._live.has(rec.id) || this._mounting.has(rec.id)) return;
      const heldNow = this._held.get(rec.id);   // r5: a re-rank during the wait may have held it
      if (heldNow) throw Object.assign(new Error(heldNow.words), { code: heldNow.code, params: heldNow.params });
      lc = this._liveConflict(rec);
    }
    if (lc) {
      this._pullRetryAt?.delete(rec.id);   // read 3 #6: refused for another record's mount — the next sweep asks again (no 5-min wait)
      if (lc.removed) throw MW.refusal('mount_point_releasing', { mountpoint: String(rec.mountpoint || '') });
      const w = this._conflictWords(lc, { held: true }); throw Object.assign(new Error(w.words), { code: w.code, params: w.params });
    }
    this._mounting.add(rec.id);
    this._bare?.delete(rec.id);   // B-fcc7 (主开发's small 6): a folder being mounted keeps no old «empty» verdict
    let failed = null;
    try {
      // B-fcc7 (adversarial r1 #2): release what the LAST chain left FIRST, before the machine is asked anything — a heal that
      // fails (an ssh machine unreachable: _online() is always true for ssh; a folder server refused) never leaves the old FUSE
      // entry for the next try five minutes on
      await DM.releaseStale(rec.mountpoint, { log: this.log, held: heldChild });   // B-323e: a stuck unmount child's end, asked of /proc
      if (this._pullErrors && this._pullErrors.delete(rec.id)) this._notify();   // cure 2: the folder IS released now — its words go, whatever the mount does next
      const device = await this.hosts.deviceBounded(rec.hostId, 10000); // ssh: daemon over --stdio; dial: the dialed-in link
      // normalize a stored trailing slash so an EXISTING record (minted before
      // the mountPull fix) works without a daemon update (the serve-folder
      // confinement double-slash 403 — userW's real bug)
      const remotePath = String(rec.remotePath || '').replace(/\/+$/, '') || '/';
      let entry = null;
      const h = await DM.deviceFolderMount({
        device, remotePath, mountpoint: rec.mountpoint,
        rcloneBin: this.rcloneBin(), log: this.log, preCleaned: true, heldChild,   // B-323e: the witness of a child whose end may never be heard
        canRelease: () => !this._otherHolds(rec),   // B-844b: a pull removed and added again on this folder — the new record's mount stays
        // B-fcc7: its rclone exited — the mount point is already released (lazy unmount); the row says so at once, the
        // sweep's pending branch remounts while the machine is linked (only THIS chain's entry: a newer one is left alone).
        // r1 #5: a chain that died YOUNG keeps the sweep's 5-min backoff (no remount every sweep, each one a folder server
        // asked of the device)
        onGone: (gone = {}) => {
          if (!entry || this._live.get(rec.id) !== entry) return;
          this._live.delete(rec.id);
          if (Date.now() - entry.at < 60000) { (this._pullRetryAt = this._pullRetryAt || new Map()).set(rec.id, Date.now() + 5 * 60000); (this._pullFailedAt = this._pullFailedAt || new Map()).set(rec.id, Date.now() + 5 * 60000); }   // r8 (read 7 #5): a young death is a failed try for the rank too
          this._notify();
          Promise.resolve(gone.released).catch(() => { }).then(() => this._probeBare(rec)).catch(() => { });   // B-fcc7: once its lazy unmount ended
        },
      });
      // r1 #4: the machine's link closed while this mount was being made (onMachineUnlinked saw no live chain) — let it go now
      if (!this._online(rec.hostId)) { try { await h.teardown(); } catch { } throw MW.refusal('machine_went_offline'); }
      if (!this._state.mounts.some((m) => m.id === rec.id)) { try { await h.teardown(); } catch { } return; }   // cure 2: removed while it was being mounted (B-844b: canRelease keeps a folder another record now holds)
      entry = { teardown: h.teardown, released: h.released, mountpoint: rec.mountpoint, at: Date.now() };
      this._live.set(rec.id, entry);
      rec.lastLiveAt = Date.now(); this._save();   // B-844b (read 2): the record live LAST holds its folder after a restart (the rank in _recheckPairs)
      this._bare?.delete(rec.id);   // B-fcc7: mounted — its bare folder's verdict goes (shadowedBy)
      for (const f of pullLiveListeners) { try { f(rec.mountpoint); } catch { } }   // B-fcc7 (read 6): who skipped the folder while it was away writes now
      if (this._pullErrors && this._pullErrors.delete(rec.id)) this._notify();
      this._pullFailedAt?.delete(rec.id);   // r6/r7: landed — no failed try pending
      this.log(`pull mount up: ${rec.hostId}:${rec.remotePath} → ${rec.mountpoint}`);
    } catch (e) {
      // the cure (the readers' 1): a release that HUNG is SAID where the row is read (list().error), once, and the record
      // leaves the mounting set (the finally) so the next check may try again — never a silent forever-«mounting»
      // cure-2 read #6: said only while the record exists — a pull removed during its release gets no words back
      if (e && e.code === 'unmount_hung' && this._state.mounts.some((m) => m.id === rec.id)) { const said = this._pullErrors || (this._pullErrors = new Map()); this._sayCode(rec.id, e); if (said.get(rec.id) !== e.message) { said.set(rec.id, e.message); this._notify(); } }
      // B-fcc7 (its reads 2–3): a mount refused because its folder is NOT EMPTY (rclone's «directory is not empty», fusermount's
      // «mountpoint is not empty») — a file a writer left in the bare folder while the machine was away: the row says why (that
      // failure's own evidence); the folder is probed again (shadowedBy shows a non-empty one, so its files can be moved out)
      if (e && /(directory|mountpoint) is not empty/i.test(String(e.message || '')) && this._state.mounts.some((m) => m.id === rec.id)) {
        const said = this._pullErrors || (this._pullErrors = new Map()), words = MW.wordsFor('mount_not_empty');
        (this._pullErrorCodes = this._pullErrorCodes || new Map()).set(rec.id, { words, code: 'mount_not_empty', params: {} });   // 主开发's small 5: worded on the page
        if (said.get(rec.id) !== words) { said.set(rec.id, words); this._notify(); }
      }
      failed = e || true;
      (this._pullFailedAt = this._pullFailedAt || new Map()).set(rec.id, Date.now() + 5 * 60000);   // r6/r7 (reads 5 #4, 6 #4): a failed try on any road — the RANK's own mark (the sweep's backoff stays the sweep's)
      throw e;
    } finally {
      this._mounting.delete(rec.id);
      // B-fcc7: a failed mount released its folder (deviceFolderMount's failure path) — probed now, the mounting mark gone
      // first (read 4: inside the catch the mark still stood and the probe skipped itself)
      if (failed && this._state.mounts.some((m) => m.id === rec.id)) Promise.resolve(failed.released).catch(() => { }).then(() => this._probeBare(rec)).catch(() => { });   // once the failure's own lazy unmount ended
    }
  }

  /** Manual remount (the pull row's ↻ — e.g. after a failed heal). */
  async remount(id) {
    this._refuseIfUnread('mounting again');   // remainder of B-f276: a held machine-mounts.json takes no change
    const rec = this._state.mounts.find((m) => m.id === id);
    if (!rec) throw MW.refusal('unknown_mount');
    if (!this._online(rec.hostId)) throw this.hosts.held?.() ? Object.assign(new Error(`mounting again: ${this.hosts.unreadWords()}`), { code: 'hosts-unread', status: 503 }) : MW.refusal(this._hostListed(rec.hostId) ? 'machine_offline_start' : 'machine_not_listed');   // r3813: a machine not listed is never told «start its daemon»   // the B-f276 remainder (H21): held, not offline — beside B-af94's coded refusal (the move onto 921c0de17)
    if (rec.dir === 'push') {
      // a push mount manually umounted ON the machine (or torn by a reboot):
      // the raw token is unrecoverable (hashed at rest), so re-creating with
      // the SAME params is the remount — old record/token dropped first
      const { hostId, folder, mode, mountpoint } = rec;
      try { await this.unmount(id); } catch { }
      this._pushDown?.delete(id);
      return this.mountPush(hostId, { folder, mode, mountpoint });
    }
    const live = this._live.get(id);
    if (live) { try { await live.teardown(); } catch { } this._live.delete(id); }
    await this._upAsked(rec);
    this._notify();
    return { ...rec, live: this._live.has(id) };
  }

  // ═══ shared lifecycle ═══

  async unmount(id) {
    this._refuseIfUnread('removing a mount');   // remainder of B-f276: a held machine-mounts.json takes no change
    const i = this._state.mounts.findIndex((m) => m.id === id);
    if (i < 0) throw MW.refusal('unknown_mount');
    const rec = this._state.mounts[i];
    let side = null;   // r3813: a push mount's own machine side NOT reached — 'not-listed' (its machine is not in the list) or 'not-reached' (it did not answer)
    // the B-f276 remainder's cure (主开发 23:20Z, its audit H5): a PUSH mount's unmount runs ON its machine — while hosts.json is HELD
    // that machine cannot be reached, and the remote unmount was swallowed while the token was revoked and the record dropped (a dead
    // mount left on the machine, nothing said): refused by name, nothing changed
    if (rec.dir !== 'pull' && this.hosts.held?.()) throw Object.assign(new Error(`removing a mount on a machine: ${this.hosts.unreadWords()}`), { code: 'hosts-unread', status: 503 });
    // B-f276 family unit 1 (round wom600meg's MUST): a push mount's removal REVOKES its token — while mount-tokens.json is HELD that
    // revoke cannot be made (it refuses by name), and the release's swallow would drop the record while the token opens the folder
    // again at the lift: refused by name BEFORE anything moves (the record and the token both kept)
    { const w = this._revokeHeldWords(rec); if (w) throw Object.assign(new Error(`removing a mount on a machine: ${w}`), { code: 'tokens_unread', status: 503 }); }
    if (rec.dir === 'pull') {
      const live = this._live.get(id);
      if (live) { try { await live.teardown(); } catch { } this._live.delete(id); }
      this._pullErrors?.delete(id);   // cure 2: its words go with its record
      this._pullErrorCodes?.delete(id);   // B-af94: and their code
      this._bare?.delete(id);
      this._held.delete(id);
      this._proofKept?.delete(id); this._proofNever?.delete(id);   // B-02f6 remainder (r1214): «never again» ends with the record
    } else {
      side = await this._unmountPush(rec);
      this._pushTunnelOwned.delete(id);
      this._pushRetryAt.delete(id);
      this._pushDown?.delete(id);
    }
    this._state.mounts.splice(i, 1);   // (its real path stays known: a chain of it still ending must see a record added again on that folder)
    this._save(); this._notify();
    if (rec.dir === 'pull') this._recheckPairs().catch(() => { });   // B-844b / B-6c4f: the record it held back may be free now
    // r3813: a push mount's machine side that could not be reached is SAID (its token is revoked, so the stale mount there opens nothing)
    return { ok: true, ...(side ? { machineSide: side } : {}) };
  }

  /** B-844b / B-6c4f: the record whose folder is `real` or nests with it (in either direction), but `exceptId` → { kind, other } | null.
   *  By the REAL paths (`_realMp`, resolved by a child); a path not resolved yet is compared as written. */
  _folderConflict(real, exceptId) {
    for (const m of this._state.mounts) {
      if (m.dir !== 'pull' || m.id === exceptId) continue;
      const ro = this._realMp.get(m.id) || path.resolve(m.mountpoint);
      if (ro === real) return { kind: 'same', other: m };
      if (ro !== '/' && real.startsWith(ro + '/')) return { kind: 'inside', other: m };
      if (real !== '/' && ro.startsWith(real + '/')) return { kind: 'over', other: m };
    }
    return null;
  }
  /** The refusal's words, named after the OTHER record (its machine, its folder, its mount point) and a code the client words. */
  _conflictWords({ kind, other }, { held = false } = {}) {
    let name = null; try { name = this.hosts.get(other.hostId).name || other.hostId; } catch (e) { name = e && e.code === 'hosts-unread' ? String(other.hostId || '') : null; }   // the machines list HELD: named by its id — never «a removed machine» (the restack's census)
    const params = { machine: name == null ? '' : String(name), removed: name == null, remotePath: String(other.remotePath || ''), mountpoint: String(other.mountpoint || ''), held };
    if (kind === 'same') return { code: 'mount_point_in_use', params, words: MW.wordsFor('mount_point_in_use', params) };   // B-af94: src/mount-error-words.js composes them (the page: the same in its language)
    params.kind = kind;
    return { code: 'mount_point_nested', params, words: MW.wordsFor('mount_point_nested', params) };
  }
  /** B-844b: every pull record's real path resolved (children, in parallel — never one wedged mount point after another) */
  async _resolveReals() {
    const kids = (this._realKids = this._realKids || new Set());   // r6 (read 5 #5): ONE child per record at a time — one stuck in the kernel is never doubled
    const kidHeld = (this._realKidHeld = this._realKidHeld || new Map()), kidTok = (this._realKidTok = this._realKidTok || new Map());
    for (const [id, h] of kidHeld) if (h.gone()) { kids.delete(id); kidHeld.delete(id); kidTok.delete(id); }   // B-323e: an end this hub could not hear, asked of /proc
    const todo = this._state.mounts.filter((m) => m.dir === 'pull' && !this._realMp.has(m.id) && !kids.has(m.id));
    todo.forEach((m) => kids.add(m.id));
    const reals = await Promise.all(todo.map((m) => { const tok = {}; kidTok.set(m.id, tok);
      return (this._realpath || realpathChild)(m.mountpoint, { onExit: () => { if (kidTok.get(m.id) !== tok) return; kidTok.delete(m.id); kidHeld.delete(m.id); kids.delete(m.id); }, onHeld: (h) => { if (kidTok.get(m.id) === tok) kidHeld.set(m.id, h); } }); }));
    const learned = [];
    todo.forEach((m, i) => { if (reals[i]) { this._realMp.set(m.id, reals[i]); learned.push(m.id); } });   // r5: a child that did not answer is asked again at the next check
    // r8 (read 7 #3): a path learned on ANY road — its «could not be checked» words go here (a pair it forms is the callers' re-check)
    for (const id of learned) { const said = this._pullErrorCodes && this._pullErrorCodes.get(id); if (said && said.code === 'mount_point_unchecked' && this._pullErrors && this._pullErrors.get(id) === said.words) { this._pullErrors.delete(id); this._notify(); } }
    return learned;
  }
  /** B-844b (its read): a record OTHER than `rec` that is live or being mounted on `rec`'s folder, or one nested with it → { kind, other } | null */
  _liveConflict(rec) {
    const real = this._markKey(rec);
    const byId = new Map(this._state.mounts.filter((m) => m.dir === 'pull').map((m) => [m.id, m]));
    for (const id of new Set([...this._live.keys(), ...this._mounting])) {   // read 2: a REMOVED record still mounting holds its folder too
      if (id === rec.id) continue;
      const m = byId.get(id) || { id, dir: 'pull', hostId: null, remotePath: '', mountpoint: (this._live.get(id) || {}).mountpoint || '' };
      if (!byId.has(id) && !this._realMp.has(id) && !m.mountpoint) continue;
      const ro = this._realMp.get(id) || path.resolve(String(m.mountpoint || '/'));
      const removed = !byId.has(id);   // B-844b r4: a record no longer on file (its chain still lets go)
      if (ro === real) return { kind: 'same', other: m, removed };
      if (ro !== '/' && real.startsWith(ro + '/')) return { kind: 'inside', other: m, removed };
      if (real !== '/' && ro.startsWith(real + '/')) return { kind: 'over', other: m, removed };
    }
    return null;
  }
  /** B-844b r4: wait (bounded, LET_GO_MS) until a removed record's chain has let its folder go — no longer being mounted, no live entry */
  _letGo(id, ms = this._letGoMs != null ? this._letGoMs : LET_GO_MS) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => { if (!(this._mounting.has(id) || this._live.has(id)) || Date.now() - t0 >= ms) return resolve(); setTimeout(tick, 100); };   // bounded (LET_GO_MS): a ref'd timer — the wait is part of a heal someone awaits
      tick();
    });
  }
  _conflictError(c) { const w = this._conflictWords(c); return Object.assign(new Error(w.words), { code: w.code, params: w.params }); }
  /** B-844b: does a record OTHER than `rec` now hold `rec`'s folder (live or being mounted)? — then `rec`'s chain never releases it */
  _otherHolds(rec) {
    const real = this._realMp.get(rec.id) || path.resolve(rec.mountpoint);
    const nests = (ro) => ro === real || (ro !== '/' && real.startsWith(ro + '/')) || (real !== '/' && ro.startsWith(real + '/'));   // read 2: nested too
    return this._state.mounts.some((m) => m.dir === 'pull' && m.id !== rec.id && (this._live.has(m.id) || this._mounting.has(m.id)) && nests(this._realMp.get(m.id) || path.resolve(m.mountpoint)));
  }
  /** B-844b (its read): may the boot release this record's folder? A free record, yes; a HELD one only while its holder is neither
   *  live nor being mounted (then the folder holds only the last hub's leftover — a dead FUSE entry of either). */
  _releasableHeld(m) {
    const h = this._held.get(m.id);
    return !h || !(this._live.has(h.otherId) || this._mounting.has(h.otherId));
  }
  /** The boot mark's key: the folder's REAL path (B-844b), as written until it is resolved */
  _markKey(rec) { return this._realMp.get(rec.id) || path.resolve(String(rec.mountpoint || '')); }
  /** B-844b / B-6c4f: EXISTING records on one folder (or nested): ONE of each pair is HELD — never mounted, never released (its
   *  release would end the other's mount) — its row says why, by the other's name: «… remove one of the two rows»; a removal frees
   *  it. The HOLDER is ranked (reads 2–5): live, then being mounted; then INSIDE the grace after a start (PAIR_GRACE_MS) the one live
   *  LAST (`lastLiveAt`), the current holder, the elder — the link decides nothing there; AFTER it the one that CAN MOUNT NOW (a dial
   *  link up, an ssh machine — no link to read — either way with no failed try pending), the current holder, the one live last,
   *  the elder; a record whose machine was removed never holds (the orphan an edited ssh machine leaves behind never blocks its new row). Real paths first (children, in parallel). Said once in the journal per pair. */
  async _recheckPairs() {
    // the B-f276 remainder meets line 244 (the stores chain's restack, its census): while the MACHINES LIST is held (hosts.json unread)
    // every record would read «gone» (its machine removed) and every pair hold would be dropped — the pairs are judged once the list
    // reads (keyed: one wait); the current holds stand meanwhile. Another meaning than a PAIR-held record (`_held`)
    if (this.hosts && typeof this.hosts.held === 'function' && this.hosts.held()) {
      if (typeof this.hosts.whenRead === 'function') this.hosts.whenRead(() => { this._recheckPairs().catch(() => { }); }, 'the pull mounts\' pair check', 'mounts:pairs');
      return this._held;
    }
    await this._resolveReals();
    const pulls = this._state.mounts.filter((m) => m.dir === 'pull');
    const gone = (m) => { try { this.hosts.get(m.hostId); return false; } catch { return true; } };
    // r5 (read 4 #2): CAN IT MOUNT NOW — a dial machine whose link is up; an ssh machine (no link to read: «online» is always true)
    // unless its last try failed (a retry still pending) — a held ssh record takes over from a holder that is down
    const failedTry = (m) => (this._pullFailedAt && this._pullFailedAt.get(m.id)) > Date.now();   // r6/r7: set by a failed try on any road (its own map)
    const dialUp = (m) => { try { const h = this.hosts.get(m.hostId); return this._realMp.has(m.id) && (h.transport === 'dial' ? !!this.hosts.dialOnline?.(h.deviceId) : true) && !failedTry(m); } catch { return false; } };   // r7 (read 6 #1): a record whose real path is unknown cannot mount now
    const rank = (m) => (this._live.has(m.id) ? 0 : this._mounting.has(m.id) ? 1 : gone(m) ? 4 : 2);
    // r4 (read 3 #1): inside the grace after a start the record live LAST keeps its folder whichever machine redials first; after it,
    // a record whose dial link is UP takes the folder over from a holder whose link is down (a dead holder never empties it for good)
    const settled = Date.now() - (this._startedAt || 0) >= (this._pairGraceMs != null ? this._pairGraceMs : PAIR_GRACE_MS);
    const last = (m) => Number(m.lastLiveAt) || 0, up = (m) => (dialUp(m) ? 1 : 0);
    // r5 (read 4 #1): INSIDE the grace the link decides NOTHING (records from before have no lastLiveAt — a tie there went to the
    // machine that redialled first): the one live last, then the elder; AFTER it, the one that can mount now first
    // r6 (read 5 #3): then the CURRENT holder stays while neither can mount (each failed try's mark lasts 5 min, so two dead machines
    // may still trade the folder at that pace — each change said once in the journal)
    const cur = (m) => (this._held.has(m.id) ? 0 : 1);
    const order = [...pulls].sort((a, b) => rank(a) - rank(b) || (settled ? (up(b) - up(a)) || (cur(b) - cur(a)) || (last(b) - last(a)) : (last(b) - last(a)) || (cur(b) - cur(a))) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0) || String(a.id).localeCompare(String(b.id)));
    const next = new Map();
    for (let i = 0; i < order.length; i++) {
      const m = order[i]; if (rank(m) <= 1) continue;   // a live record (or one being mounted) holds its folder by being so
      const real = this._realMp.get(m.id) || path.resolve(m.mountpoint);
      for (let j = 0; j < i; j++) {
        const o = order[j];
        if (next.has(o.id) || rank(o) === 4) continue;   // one already held — or a removed machine's — holds nothing
        const ro = this._realMp.get(o.id) || path.resolve(o.mountpoint);
        const kind = ro === real ? 'same' : (ro !== '/' && real.startsWith(ro + '/')) ? 'inside' : (real !== '/' && ro.startsWith(real + '/')) ? 'over' : null;
        if (kind) { next.set(m.id, { kind, otherId: o.id, ...this._conflictWords({ kind, other: o }, { held: true }) }); break; }
      }
    }
    let changed = false;
    for (const [id, h] of next) {
      const was = this._held.get(id);
      if (!was || was.words !== h.words) { changed = true; const rec = pulls.find((m) => m.id === id); this.log(`pull mount ${rec && rec.mountpoint}: held — ${h.words}`); }
      (this._pullErrors = this._pullErrors || new Map()).set(id, h.words);
      (this._pullErrorCodes = this._pullErrorCodes || new Map()).set(id, { words: h.words, code: h.code, params: h.params });
    }
    for (const id of [...this._held.keys()]) if (!next.has(id)) { changed = true; if (this._pullErrors && this._pullErrors.get(id) === this._held.get(id).words) this._pullErrors.delete(id); this._pullRetryAt?.delete(id); }   // freed: the next sweep tries it (no 5-min wait)
    this._held = next;
    if (changed) this._notify();
    return next;
  }

  /** A machine (re)linked — dial-in, or its daemon re-exec'd. Heal pulls
   *  (stale chain teardown first: a re-dial means the daemon RE-EXECED, so
   *  its serve-folder DIED and the live rclone points at a dead port — real
   *  Mac report) and re-own push tunnel ports (the fresh daemon has no
   *  listeners; the machine-side rclone still points at the recorded port).
   *  Fire-and-forget. */
  onMachineLinked(hostId, only = null) {   // `only`: the record ids to heal (the legacy lift's), else every record of the machine
    if (!hostId) return;
    // B-844b r4 (read 3 #1b): a link is a re-rank — a held record of this machine may take its folder over from a holder that is down
    if (this._held.size) { this._recheckPairs().catch(() => { }).then(() => this._healLinked(hostId, only)); return; }
    this._healLinked(hostId, only);
  }
  _healLinked(hostId, only = null) {
    for (const rec of this._state.mounts.filter((m) => m.hostId === hostId && (!only || only.has(m.id)))) {
      if (rec.dir === 'pull') {
        if (this._held.has(rec.id)) continue;   // B-844b (read 2): a held record is not healed (said once, by its row)
        const stale = this._live.get(rec.id);
        const heal = async () => {
          if (stale) { try { await stale.teardown(); } catch { } this._live.delete(rec.id); }
          await this._up(rec);
        };
        heal().then(() => this._notify())
          .catch((e) => this.log(`pull mount heal failed (${rec.mountpoint}): ${e.message}`));
      } else if (rec.tunnelPort) {
        const lp = this.localPort();
        if (!lp) continue;
        const net = require('net');
        this.hosts.deviceBounded(hostId, 8000)
          .then((dm) => this._doorOf(rec).then((door) => (this._stillMounted(rec.id)   // r1382 (1): removed while its door opened ⇒ no forward toward a closed door
            ? dm.reverseForward({ port: rec.tunnelPort, connectLocal: () => net.connect(door.port, '127.0.0.1') }).then(() => true)   // B-7f0b: re-pointed at its own door
            : false)))
          .then((owned) => { if (!owned) return; this._pushTunnelOwned.add(rec.id); this._pushRetryAt.delete(rec.id); })
          .catch((e) => {
            // clear ownership + backoff so the health sweep retries promptly —
            // a single failed re-own must not strand the tunnel (review finding)
            this._pushTunnelOwned.delete(rec.id);
            this._pushRetryAt.delete(rec.id);
            this.log(`push tunnel re-own failed (:${rec.tunnelPort}): ${e.message}`);
          });
      }
    }
  }

  /** B-fcc7 (the remainder — a reader in the file window met an EMPTY FOLDER where an offline machine's files belong): the
   *  pull record whose mount point holds p while its folder is NOT mounted (released: the machine offline or its rclone
   *  gone; being mounted again; waiting for its heal). The mount point is then a bare local folder: an empty one that
   *  reads as «the files are gone», and a write there is stranded under the next mount. A walk of the records — no fs,
   *  nothing waits. Shadowed ONLY when its bare folder was probed EMPTY (`_probeBare`: a child `ls -A`, at each release and
   *  in the sweep — the reads' findings): a folder holding files of its own (a person's own folder picked as a mount point,
   *  a file a writer left there while the machine was away) shows them, so nothing is hidden and they can be moved out; a
   *  folder not probed yet is shown as before. Never shadowed either: a path under ANY live pull's folder (two records on
   *  one folder, a nested one — what shows there is a machine's own); a removed machine's record (no words would be true).
   *  The innermost record answers. `writer`: the question of a request that ADDS to the folder (a write, a copy's or a move's
   *  destination, the TASK.md writer) — ANY folder not live, whatever its probe (read 4: «unknown» must not mean «write»). → { id, hostId, machine, name (= machine: the shape the TASK.md writer reads), mountpoint, offline, hostsHeld?, hostsHeldWords?, pairHeld?, held? ({ code, params, words }: B-02f6, a WRITER under a pair-held folder) } | null — `hostsHeld`: the MACHINES LIST is held (its words ride out; never «offline»; not a pair-held record) */
  /** B-2ca0 follow-up (主开发 19:42Z): a pull record's folder AS WRITTEN and by its REAL path (`_realMp`, a child's realpath) — the
   *  path a door asks with may be either (WebDAV's target comes from the real-pathed root: a record written through a link was
   *  never matched there, and a PUT landed in the bare folder under an unmounted pull) */
  _pullFolders(m) {
    const w = path.resolve(m.mountpoint), r = this._realMp.get(m.id);
    return r && r !== w ? [w, r] : [w];
  }
  shadowedBy(p, { writer = false } = {}) {
    const rp = typeof p === 'string' ? p : '';
    if (!rp.startsWith('/')) return null;
    let best = null;
    for (const m0 of this._state.mounts) {
      if (m0.dir !== 'pull' || typeof m0.mountpoint !== 'string' || !m0.mountpoint) continue;
      const mp = this._pullFolders(m0).find((x) => x !== '/' && (rp === x || rp.startsWith(x + '/')));   // a whole path segment (…/mac is not …/macbook)
      if (!mp) continue;
      if (this._live.has(m0.id)) return null;
      // B-02f6 remainder (2): a record HELD on ONE folder with its holder (by any spelling — a link, its real path) answers AS ITS
      // HOLDER: the row that holds the folder is the one its state and its name come from, never the row whose spelling the path used
      let m = m0;
      const tie = this._held.get(m0.id) || null;
      if (tie && tie.kind === 'same') { const o = this._state.mounts.find((x) => x.id === tie.otherId && x.dir === 'pull'); if (o) { if (this._live.has(o.id)) return null; let known = false; try { this.hosts.get(o.hostId); known = true; } catch (e) { known = !!(e && e.code === 'hosts-unread'); } if (known) m = o; } }   // the read's catch: a holder whose machine is gone (its records kept, the pair not checked again yet) never answers — the held row's own hold does
      // the B-f276 remainder meets B-fcc7: the MACHINES LIST held (hosts.json unread — `hostsHeld`, never «removed») — the record still
      // shadows its bare folder (named by its id), so a write there is refused by the hold's name. Another meaning, kept apart: a
      // PAIR-held record (`this._held`: two records on one folder — bl-machines-a) answers a WRITER only (B-02f6, below)
      let h = null; try { h = this.hosts.get(m.hostId); } catch (e) { h = e && e.code === 'hosts-unread' ? { id: m.hostId, name: m.hostId, hostsHeld: true } : null; }
      // B-02f6: a PAIR-held record (never mounted — its pair holds the place) answers a WRITER under its folder with its hold: the bare
      // folder there is THIS hub's disk, so a file written there never reached the machine and nothing said so. A READER lists the bare
      // folder; under the holder's live mount point the holder answers (null above); on one folder the holder answers (the tie, above)
      const pair = m === m0 ? this._held.get(m.id) || null : null;   // the tie's holder answers by its own state (its own hold, if any, is its own row's)
      if (!h || (pair && !writer) || (!pair && !writer && this._bare?.get(m.id) !== 'empty')) continue;   // a READER: probed empty only (a folder with files of its own shows them); a WRITER: any folder not live (what it adds is hidden under the next mount, or blocks it)
      if (!best || mp.length > best.mp.length) best = { m, mp, h, pair };   // the innermost answers; on ONE folder the tie above already made the holder answer
    }
    if (!best) return null;
    // B-02f6 (its read, a MUST): the path as asked may reach a LIVE pull through the LINK the held record was written with (its
    // holder's folder never matched that spelling) — mapped onto the held record's REAL folder, a path under any live pull's folder
    // (as written or real) is the machine's own: nothing refused
    if (best.pair) {
      const w = path.resolve(best.m.mountpoint), r = this._realMp.get(best.m.id), asReal = r && r !== w && best.mp === w ? r + rp.slice(w.length) : rp;
      if (this._state.mounts.some((o) => o.dir === 'pull' && this._live.has(o.id) && this._pullFolders(o).some((x) => x !== '/' && (asReal === x || asReal.startsWith(x + '/'))))) return null;
    }
    const machine = String(best.h.name || best.m.hostId || '');
    // round wojcq4hn4 (its MUST): a HELD machines list is unknown BY NAME — the mark and the hold's words ride out (the files route answers
    // the hold, hosts-unread 503), never «offline»: the online check swallowed the hold and said false for a machine that may be connected
    if (best.h.hostsHeld) return { id: best.m.id, hostId: best.m.hostId, machine, name: machine, mountpoint: best.mp, hostsHeld: true, hostsHeldWords: (this.hosts && typeof this.hosts.unreadWords === 'function' && this.hosts.unreadWords()) || '', offline: false };
    if (best.pair) return { id: best.m.id, hostId: best.m.hostId, machine, name: machine, mountpoint: path.resolve(best.m.mountpoint), pairHeld: true, held: { code: best.pair.code, params: best.pair.params || {}, words: best.pair.words } };
    return { id: best.m.id, hostId: best.m.hostId, machine, name: machine, mountpoint: best.mp, offline: !this._online(best.m.hostId) };
  }
  /** B-02f6 remainder (1): a WRITER that shadowedBy refuses under a pull record whose REAL folder never resolved (the pair check
   *  compares it as written, so it is not even held) — the asked path mapped onto that record's real folder, learned by THE
   *  STARTER's child: under a LIVE pull's folder the write is the machine's, nothing refused. The answer is the RECORD's, kept
   *  PROOF_KEEP_MS (a pass as much as a refusal; a child that did not answer = refused); at most PROOF_KIDS_MAX children in flight.
   *  A write that passes never asks it. → shadowedBy's answer, or null */
  async shadowedByReal(p, { writer = false } = {}) {
    const s = this.shadowedBy(p, { writer });
    if (!s || !writer || s.pairHeld) return s;   // a pair-held record maps its link itself (shadowedBy, B-02f6)
    const rec = this._state.mounts.find((x) => x.id === s.id && x.dir === 'pull'), rp = typeof p === 'string' ? p : '';
    if (!rec) return s;
    const w = path.resolve(rec.mountpoint);
    if (!(rp === w || rp.startsWith(w + '/'))) return s;
    // r1214 (1): once the pair check's own child has LEARNED the real folder, that answer maps the path — no proof child at all
    const real = this._realMp.has(rec.id) ? this._realMp.get(rec.id) : await this._proofReal(rec);
    // r1274 (2): refused because its link could not be checked in time («never again») — the refusal says it heals by itself and what
    // a person can do (the not-mounted words would send them to Remount, which cannot help)
    if (!real && !s.offline && !s.hostsHeld && this._proofNever && this._proofNever.get(rec.id) === proofSig(rec)) return { ...s, unchecked: true };
    if (!real) return s;
    const liveAt = (q) => this._state.mounts.some((o) => o.dir === 'pull' && this._live.has(o.id) && this._pullFolders(o).some((x) => x !== '/' && (q === x || q.startsWith(x + '/'))));
    if (real !== w && liveAt(real + rp.slice(w.length))) return null;
    // r2684 (B-02f6, its first gap): a LINK INSIDE the folder of the record may lead into a LIVE pull, and a write through it is that
    // machine's. One more look, asked only when the folder the write lands in lies below the folder of the record and the mapping
    // above refused: that folder by its own real path (THE STARTER's child, as the proof of the record; kept per folder, _proofDir)
    const dir = path.dirname(rp);
    if (dir === w || !dir.startsWith(w + '/')) return s;
    const inner = await this._proofDir(rec, dir);
    if (inner.real && liveAt(inner.real + '/' + path.basename(rp))) return null;
    // r2856 (1): a folder look that did not answer in time is said as the record's own («could not be checked», it heals by itself)
    return inner.unchecked && !s.offline && !s.hostsHeld ? { ...s, unchecked: true } : s;
  }
  /** The record's real folder for the proof (主开发 r1214). A child that did NOT answer inside its bound (timed out, or the starter's
   *  «unknown») is NEVER asked again for that record as it stands — the writer is refused as the release refused (its words), and at
   *  most one proof child a record can outlive its bound; «never again» ends when the record's FOLDER is edited (another proofSig) or
   *  the record is removed (unmount clears it; an add after that is a new record), or when the pair check learns its real folder
   *  (shadowedByReal maps with it). No proof while the pair check's OWN child for the record is alive (`_realKids`: never doubled).
   *  Every other answer is kept PROOF_KEEP_MS on the monotonic clock, a pass as much as a refusal; PROOF_KIDS_MAX counts the asks IN
   *  FLIGHT, keyed by the record as it stands. An answer that lands after its record was removed or edited is dropped — no mark
   *  depends on the order of two events; nothing waits for a child's end after its answer. */
  _proofReal(rec) {
    const kept = (this._proofKept = this._proofKept || new Map()), fly = (this._proofFly = this._proofFly || new Map()), never = (this._proofNever = this._proofNever || new Map());
    const sig = proofSig(rec), now = () => performance.now();
    if (never.get(rec.id) === sig) return Promise.resolve(null);
    const had = kept.get(rec.id);
    if (had && had.sig === sig && now() - had.at < (this._proofKeepMs != null ? this._proofKeepMs : PROOF_KEEP_MS)) return Promise.resolve(had.real);
    if (fly.has(sig)) return fly.get(sig);
    if (this._realKids && this._realKids.has(rec.id)) return Promise.resolve(null);   // the pair check's own child for it still alive
    if (fly.size >= PROOF_KIDS_MAX) return Promise.resolve(null);   // the bound: this ask keeps its refusal, nothing kept
    const ask = Promise.resolve().then(() => (this._proofRealpath || starterRealpath)(rec.mountpoint)).catch(() => ({ real: null, slow: false })).then((v) => {
      const o = v && typeof v === 'object' ? v : { real: v || null, slow: false };
      fly.delete(sig);
      const cur = this._state.mounts.find((x) => x.id === rec.id && x.dir === 'pull');
      if (!cur || proofSig(cur) !== sig) return null;   // removed or edited while it was asked: its answer is no one's
      if (o.slow) { never.set(rec.id, sig); kept.delete(rec.id); return null; }
      kept.set(rec.id, { at: now(), real: o.real || null, sig });
      if (kept.size > 256) kept.delete(kept.keys().next().value);
      return o.real || null;
    });
    fly.set(sig, ask);
    return ask;
  }
  /** r2684 (B-02f6, its first gap): the REAL path of the folder a write lands in, when that folder lies below the folder of its record
   *  (a link inside the bare outer folder may lead into a live pull). r2856: by the pair check's own road, `realpathChild` (THE
   *  STARTER's `realpath -m`, bounded PROOF_MS): a child that did not answer in time and may still sleep on a pull that hangs is HELD
   *  (its pid and start, `heldChild`) and counted until its end is seen, as the pair check's own child is — so the folder looks out,
   *  running and held, never pass PROOF_KIDS_MAX together (the record proof's in-flight asks counted with them). Its answer is kept
   *  PROOF_KEEP_MS for that folder as asked, a timeout too: refused for that time with the «could not be checked» words, then asked
   *  again. Never asked once the record's own proof is «never again». → { real (null: no folder), unchecked (it did not answer) } */
  _proofDir(rec, dir) {
    const kept = (this._proofDirKept = this._proofDirKept || new Map()), held = (this._proofDirHeld = this._proofDirHeld || new Set()), fly = (this._proofFly = this._proofFly || new Map());
    const rsig = proofSig(rec), sig = rsig + '\u0000' + dir, now = () => performance.now();
    if (this._proofNever && this._proofNever.get(rec.id) === rsig) return Promise.resolve({ real: null, unchecked: true });
    const had = kept.get(sig);
    if (had && now() - had.at < (this._proofKeepMs != null ? this._proofKeepMs : PROOF_KEEP_MS)) return Promise.resolve(had);
    if (fly.has(sig)) return fly.get(sig);
    for (const h of held) { let gone = true; try { gone = h.gone(); } catch { } if (gone) held.delete(h); }
    if (fly.size + held.size >= PROOF_KIDS_MAX) return Promise.resolve({ real: null, unchecked: false });   // the bound: this ask keeps its refusal, nothing kept
    let mark = null;
    const ask = Promise.resolve().then(() => (this._proofDirRealpath || realpathChild)(dir, { ms: PROOF_MS, onHeld: (h) => { mark = h; } })).catch(() => null).then((v) => {
      fly.delete(sig);
      if (mark) held.add(mark);   // it did not answer: counted until its end is seen
      const cur = this._state.mounts.find((x) => x.id === rec.id && x.dir === 'pull');
      if (!cur || proofSig(cur) !== rsig) return { real: null, unchecked: false };   // removed or edited while it was asked: no one's
      const ans = { at: now(), real: typeof v === 'string' && v.startsWith('/') ? v : null, unchecked: !!mark };
      kept.set(sig, ans);
      if (kept.size > 256) kept.delete(kept.keys().next().value);
      return ans;
    });
    fly.set(sig, ask);
    return ask;
  }
  /** B-fcc7 (read 5): a file under a pull folder that is not live was removed or moved out — probe that folder again now (its
   *  «not empty» verdict and words go once it is empty), never waiting for the sweep. */
  touched(p) {
    const rp = typeof p === 'string' ? p : '';
    let best = null;
    for (const m of this._state.mounts) {
      if (m.dir !== 'pull' || typeof m.mountpoint !== 'string' || !m.mountpoint || this._live.has(m.id)) continue;
      const mp = this._pullFolders(m).find((x) => x !== '/' && (rp === x || rp.startsWith(x + '/')));   // B-2ca0 follow-up: by its real path too
      if (mp && (!best || mp.length > best.mp.length)) best = { m, mp };
    }
    if (best) this._probeBare(best.m).catch(() => { });
  }
  /** B-fcc7: is this pull's BARE folder empty? A child `ls -A` (never node fs: a folder whose release hung may still be a dead
   *  FUSE entry), skipped while it is live, being mounted, or its unmount is stuck. → 'empty' | 'not-empty', or the verdict
   *  dropped (not readable, timed out: shown as before). */
  async _probeBare(rec) {
    this._bare = this._bare || new Map(); this._probing = this._probing || new Set();
    const pending = !!rec && !!this._releasing && this._releasing.has(this._markKey(rec));   // the boot's release of it still runs
    // B-323e (its reader's M2): a probe child whose end this hub may never hear (asleep in the kernel, its starter then replaced) is
    // asked of /proc — ended ⇒ its single flight ends here and the folder is asked again
    if (rec && this._probing.has(rec.id) && this._probingHeld?.get(rec.id)?.gone()) { this._probing.delete(rec.id); this._probingAt?.delete(rec.id); this._probeSaid?.delete(rec.id); this._probingHeld.delete(rec.id); this._probingTok?.delete(rec.id); this._reprobe?.delete(rec.id); }
    if (rec && this._probing.has(rec.id)) {
      (this._reprobe = this._reprobe || new Set()).add(rec.id);   // asked while one runs: again once that child exits (read 6: a multi-select delete)
      // 主开发's small 2: a probe child that never ends (an `ls` asleep in the kernel) — bounded: its folder is not judged meanwhile
      // (the verdict dropped: shown as before) and the journal says so ONCE
      const at = this._probingAt && this._probingAt.get(rec.id);
      if (at && Date.now() - at > PROBE_STUCK_MS && !(this._probeSaid = this._probeSaid || new Set()).has(rec.id)) {
        this._probeSaid.add(rec.id); this._bare.delete(rec.id);
        this.log(`pull mount ${rec.mountpoint}: its folder's check (ls -A) has not ended in ${Math.round(PROBE_STUCK_MS / 1000)} s — the folder is not judged until it ends`);
      }
      return this._bare.get(rec.id) || null;
    }
    if (!rec || rec.dir !== 'pull' || this._live.has(rec.id) || this._mounting.has(rec.id) || pending || this._held.has(rec.id) || DM.unmountStuckOf?.(rec.mountpoint)) return this._bare.get(rec && rec.id) || null;   // read 2: a held record is never probed (its folder may be its holder's live mount)
    this._probing.add(rec.id);   // one probe child per folder while it LIVES (a wedged `ls` is not stacked by every sweep)
    (this._probingAt = this._probingAt || new Map()).set(rec.id, Date.now());
    const tok = {}; (this._probingTok = this._probingTok || new Map()).set(rec.id, tok);
    const r = await lsChild(rec.mountpoint, { names: true, ms: this._probeMs || 8000 });
    if (r.held && this._probingTok.get(rec.id) === tok) (this._probingHeld = this._probingHeld || new Map()).set(rec.id, r.held);
    Promise.resolve(r.exited).then(() => { if (this._probingTok.get(rec.id) !== tok) return; this._probingTok.delete(rec.id); this._probingHeld?.delete(rec.id); this._probing.delete(rec.id); this._probingAt.delete(rec.id); this._probeSaid?.delete(rec.id); if (this._reprobe?.delete(rec.id)) this._probeBare(rec).catch(() => { }); });
    if (this._live.has(rec.id) || this._mounting.has(rec.id) || !this._state.mounts.some((m) => m.id === rec.id)) return null;   // it moved meanwhile
    if (r.ok === null) return this._bare.get(rec.id) || null;   // ls could not start: the verdict stands
    if (r.ok) this._bare.set(rec.id, r.empty ? 'empty' : 'not-empty'); else this._bare.delete(rec.id);
    if (r.ok && r.empty && this._pullErrors && /not empty/.test(this._pullErrors.get(rec.id) || '')) { this._pullErrors.delete(rec.id); this._notify(); }   // its files were moved out: the «not empty» words go
    return this._bare.get(rec.id) || null;
  }

  /** B-fcc7: the machine's link closed (its dial-in ended; the sweep's belt for a missed close). Each LIVE pull of it is
   *  torn down at once — the lazy unmount, in a child — so a reader of the mount point meets an empty folder and the row
   *  says the machine is offline (list(): live false, online false), never a zombie FUSE entry whose every read fails
   *  «Transport endpoint is not connected». The record stays; the re-dial heals it (onMachineLinked). Fire-and-forget. */
  onMachineUnlinked(hostId) {
    if (!hostId) return 0;
    let n = 0;
    for (const rec of this._state.mounts.filter((m) => m.dir === 'pull' && m.hostId === hostId)) {
      const live = this._live.get(rec.id);
      if (!live) continue;
      this._live.delete(rec.id); n++;
      this.log(`pull mount ${rec.mountpoint}: its machine went offline — unmounted until it is back`);
      let td; try { td = Promise.resolve(live.teardown()).catch(() => { }); } catch { td = Promise.resolve(); }   // its sync part starts the lazy unmount (released())
      // B-fcc7 (read 5): probed once its LAZY UNMOUNT ended — never after the whole teardown, whose unserveFolder rides the dead link
      Promise.resolve((typeof live.released === 'function' && live.released()) || td).catch(() => { }).then(() => this._probeBare(rec)).catch(() => { });
    }
    if (n) this._notify();
    return n;
  }

  /** Orphan-token GC: 'host:*' tokens whose id no PUSH RECORD references are
   *  unmanageable garbage (leaked by pre-2.162.1 failed pushes) — revoke them.
   *  Records are the source of truth; a token without one can't be re-owned,
   *  displayed meaningfully, or torn down through the app. */
  gcOrphanTokens() {
    if (this._unread) return 0;   // remainder of B-f276: a held store knows no record — every push token would read as an orphan
    // 主开发 r4985 (lane lg-remote-hardening): a LEGACY store held — its push records are not in the list yet, so their tokens would read
    // as orphans; the sweep revokes nothing until it reads (said once)
    { const lh = (this._legacyHolds ? [...this._legacyHolds.values()] : []).find((h) => h.held()); if (lh) { if (!this._legacySweepSaid) { this._legacySweepSaid = true; this.log(`the orphan reverse-mount token sweep waits — ${path.basename(lh.file)} could not be read, and a token its records name would read as an orphan; nothing is revoked until it reads`); } return 0; } }
    let n = 0;
    try {
      const referenced = new Set(this._state.mounts.filter((m) => m.dir === 'push').map((m) => m.tokenId));
      const tornAt = Number(this._state.tornAt) || 0;   // B-f276 family unit 2 (r3081): the list came from torn bytes at this time
      let unknown = 0;
      for (const t of this.mountTokens.list?.() || []) {
        // structured kind (not a name-prefix hack): only reverse-mount tokens
        // with no backing push record are orphans; user 'share' tokens are
        // never touched
        if (t.kind === 'reverse-mount' && !referenced.has(t.id)) {
          if (tornAt && !(Number(t.createdAt) > tornAt)) { unknown++; continue; }   // minted before the torn lift: its record is UNKNOWN — kept
          if (this._copies().names(t.id)) { unknown++; continue; }   // 主开发 r3115 (2): A REMOVER NEVER REMOVES WHAT A KEPT COPY OF TORN BYTES STILL NAMES — the restart-proof half (the mark above is this run's fast road)
          try { this.mountTokens.revoke?.(t.id); n++; } catch { }
        }
      }
      if (n) this.log(`revoked ${n} orphan reverse-mount token(s) (no matching mount record)`);
      if (unknown && !this._tornSaid) { this._tornSaid = true; this.log(`${unknown} reverse-mount token(s) minted before machine-mounts.json's torn bytes are KEPT — the list that would name them is unknown; removing a machine revokes its own`); }
    } catch { }
    return n;
  }

  /** Boot: heal every recorded mount whose machine is reachable. */
  /** the kept copies of this store's torn bytes (src/store-read-hold.js copiesOf) — their prefix is this store's own set-aside name */
  _copies() { return this.__copies || (this.__copies = HOLD.copiesOf({ file: this._file, prefix: path.basename(this._asideName()).replace(/\d+$/, ''), log: (m) => this.log(m) })); }
  async restore() {
    try { await Promise.race([this._copies().refresh(), new Promise((r) => { const t = setTimeout(r, 20000); t.unref?.(); })]); } catch { }   // B-f276 family unit 2 commit 3: the sweep below answers from memory — read first (off the loop); BOUNDED (a folder that hangs: the sweep keeps every id it cannot judge)
    this.gcOrphanTokens();
    if (this._pairsOnce) await this._pairsOnce;   // r4: a dial-in's heal ran one already — waited for, then
    this._pairsOnce = this._recheckPairs().catch(() => { });   // B-844b / B-6c4f: the real paths and the held records FIRST — a held record's folder is another's (r5: restore's own check, fresh)
    await this._pairsOnce;
    const byHost = new Set(this._state.mounts.map((m) => m.hostId));
    const linked = [], offline = [];
    for (const hostId of byHost) {
      if (this._online(hostId)) linked.push(hostId);
      // B-fcc7: an offline machine's recorded pull may still be mounted by the LAST hub's rclone (detached, it outlived
      // that hub; its bridge died with it) — released now, not at the next mount: the reader meets an empty folder
      else offline.push(...this._state.mounts.filter((m) => m.dir === 'pull' && m.hostId === hostId && !this._live.has(m.id) && !this._mounting.has(m.id) && this._releasableHeld(m)));
    }
    // the cure (the readers' 3): the releases run ONE AFTER ANOTHER (never every one at once) and every one is MARKED at once,
    // BEFORE any linked machine heals (cure-3 read #2) — a heal of the same folder, a dial-in meanwhile, waits in _up for the
    // step on its folder instead of racing it. The mark is the MOUNT POINT's (cure-2 read #3). A record removed while it
    // waited still has its folder released (the last hub's FUSE entry has nobody else to let it go); its words are set only
    // while the record exists (#6). Children and async /proc reads only; the boot's caller does not wait on restore
    this._releasing = this._releasing || new Map();
    let prev = Promise.resolve();
    for (const rec of offline) {
      const key = this._markKey(rec);   // B-844b: the REAL path
      const p = prev.then(() => DM.releaseStale(rec.mountpoint, { log: this.log, held: heldChild })).then(() => { if (!this._held.has(rec.id) && this._pullErrors && this._pullErrors.delete(rec.id)) this._notify(); }).catch((e) => {   // read 2: a held record's words stay
        if (e && e.code === 'unmount_hung' && !this._held.has(rec.id) && this._state.mounts.some((m) => m.id === rec.id)) { this._sayCode(rec.id, e); (this._pullErrors = this._pullErrors || new Map()).set(rec.id, e.message); this._notify(); }
      });
      this._releasing.set(key, p);
      p.then(() => { if (this._releasing.get(key) === p) this._releasing.delete(key); });
      prev = p;
    }
    for (const hostId of linked) { try { this.onMachineLinked(hostId); } catch { } }
    await prev;
    // B-fcc7: every pull not live has its bare folder probed now (shadowedBy) — a hub restart knows nothing of before
    for (const rec of this._state.mounts.filter((m) => m.dir === 'pull' && !this._live.has(m.id) && !this._mounting.has(m.id))) await this._probeBare(rec).catch(() => { });
  }

  /** The machine is being removed/unpaired — drop its mounts (records + live
   *  chains + tokens). Remote-side unmounts are best-effort. */
  /** B-f276 family unit 1: the words while a removal of `rec` cannot revoke its token (mount-tokens.json held) — null when it can */
  _revokeHeldWords(rec) {
    if (!rec || rec.dir === 'pull' || !rec.tokenId || !this.mountTokens || typeof this.mountTokens.unreadWords !== 'function') return null;
    return this.mountTokens.unreadWords() || null;
  }
  /** …the same question for a machine about to be removed: one of its push mounts would keep its token (the un-pairing asks it
   *  BEFORE any side effect — its own unmounts run inside a swallow) → the words, or null */
  revokeHeldFor(hostId) {
    for (const rec of this._state.mounts) if (rec.hostId === hostId) { const w = this._revokeHeldWords(rec); if (w) return w; }
    // B-f276 family unit 2 (r3081): after a torn lift the machine's tokens may have no record here — its removal revokes them by owner
    if (this._state.tornAt && this.mountTokens && typeof this.mountTokens.unreadWords === 'function' && this.mountTokens.unreadWords()) return this.mountTokens.unreadWords();
    return null;
  }
  /** B-f276 family unit 2 (r3081): the torn lift of this run — the copy's base name (the Machines section says where it is) or null */
  tornCopy() { return this._tornCopy || null; }

  async onMachineUnpaired(hostId) {
    if (!hostId) return;
    for (const rec of [...this._state.mounts.filter((m) => m.hostId === hostId)]) {
      try { await this.unmount(rec.id); } catch { }
    }
    // B-f276 family unit 2 (r3081): a PERSON removed this machine — its reverse-mount tokens with no record here (minted before a torn
    // lift: unknown to the sweep) are revoked now, by their owner (the un-pairing asked revokeHeldFor first: the token store reads)
    if (this._state.tornAt) {
      const referenced = new Set(this._state.mounts.filter((m) => m.dir === 'push').map((m) => m.tokenId));
      for (const t of this.mountTokens?.list?.() || []) if (t.kind === 'reverse-mount' && t.owner === hostId && !referenced.has(t.id)) { try { this.mountTokens.revoke(t.id); } catch (e) { this.log(`a token of the removed machine ${hostId} was not revoked: ${(e && e.message) || e}`); } }
    }
  }

  async _healthSweep() {
    // Recorded-but-not-live pulls retry here too (review finding: ssh machines
    // have no dial-in event, so a failed boot heal previously stayed 'Pending'
    // forever). 5min backoff per record so an unreachable machine isn't
    // hammered every sweep.
    this._pullRetryAt = this._pullRetryAt || new Map();
    if (this._held.size) await this._recheckPairs().catch(() => { });   // B-844b r4: a holder gone down (or removed) frees its held record here too
    for (const rec of this._state.mounts.filter((m) => m.dir === 'pull' && !this._live.has(m.id) && !this._mounting.has(m.id) && !this._held.has(m.id))) {
      if (!this._online(rec.hostId)) continue;
      const at = this._pullRetryAt.get(rec.id) || 0;
      if (Date.now() < at) continue;
      this._pullRetryAt.set(rec.id, Date.now() + 5 * 60000);
      this._up(rec).then(() => { this._pullRetryAt.delete(rec.id); this._notify(); }).catch(() => {});
    }
    // B-fcc7: every pull not live has its bare folder probed again (a file a writer left there since; a folder emptied) —
    // after the heals above, never one whose boot release is pending (_probeBare skips it)
    for (const rec of this._state.mounts.filter((m) => m.dir === 'pull' && !this._live.has(m.id) && !this._mounting.has(m.id))) await this._probeBare(rec).catch(() => { });
    // PUSH honesty (real report: user umounted on the Mac, the row stayed
    // green "on machine" and offered no way back): while the machine is
    // linked, ask it whether the mountpoint is still in its mount table —
    // a vanished mount flips the row to "not mounted there" + a remount ↻.
    this._pushDown = this._pushDown || new Set();
    for (const rec of this._state.mounts.filter((m) => m.dir === 'push')) {
      if (!this._online(rec.hostId)) continue;
      let dm = null;
      try { dm = await this.hosts.deviceBounded(rec.hostId); } catch { continue; }
      let mounted = null;
      try {
        // `mount` prints "… on <mountpoint> (type…" (mac) / "… on <mountpoint> type …"
        // (linux) — a fixed-string match on ' on <mp> ' covers both
        const mp = String(rec.mountpoint).replace(/'/g, `'\\''`);
        const r = await dm.runCmd('sh', ['-c', `mount | grep -qF ' on ${mp} '`], { timeoutMs: 8000, by: 'system:machine-mounts' });
        mounted = r.code === 0;
      } catch { mounted = null; }
      if (mounted === null) continue; // probe itself failed — no verdict
      const was = this._pushDown.has(rec.id);
      if (!mounted && !was) { this._pushDown.add(rec.id); this.log(`push mount ${rec.mountpoint} is GONE on the machine (umounted there?)`); this._notify(); }
      else if (mounted && was) { this._pushDown.delete(rec.id); this._notify(); }
      // Tunnel liveness (review finding): the mount-table probe above is
      // structurally blind to a dead reverse-forward — the machine-side
      // rclone stays mounted while every IO fails against the unbound
      // 127.0.0.1:tunnelPort. Verify end-to-end from the machine (a request
      // through the tunnel reaches our /dav only when a server owns the
      // listener; a disowned/reaped one refuses or resets) and re-own with
      // the same 5-min backoff the pull branch uses — ssh machines have no
      // dial-in event, so the boot attempt was otherwise the only one.
      if (rec.tunnelPort) {
        if (this._pushTunnelOwned.has(rec.id)) {
          try {
            // no curl on the machine ⇒ exit 0 (no verdict) — never churn re-owns
            const r = await dm.runCmd('sh', ['-c', `command -v curl >/dev/null 2>&1 || exit 0; curl -s -o /dev/null --max-time 5 http://127.0.0.1:${Number(rec.tunnelPort)}/`], { timeoutMs: 10000, by: 'system:machine-mounts' });
            if (r.code !== 0) { this._pushTunnelOwned.delete(rec.id); this.log(`push tunnel :${rec.tunnelPort} dead on ${rec.hostId} — will re-own`); }
          } catch { }
        }
        const lp = this.localPort();
        if (!this._pushTunnelOwned.has(rec.id) && lp) {
          const at = this._pushRetryAt.get(rec.id) || 0;
          if (Date.now() >= at) {
            this._pushRetryAt.set(rec.id, Date.now() + 5 * 60000);
            const net = require('net');
            try {
              const door = await this._doorOf(rec);
              if (this._stillMounted(rec.id)) {   // r1382 (1): removed while its door opened ⇒ no forward toward a closed door
                await dm.reverseForward({ port: rec.tunnelPort, connectLocal: () => net.connect(door.port, '127.0.0.1') });   // B-7f0b: re-pointed at its own door
                this._pushTunnelOwned.add(rec.id);
                this._pushRetryAt.delete(rec.id);
                this.log(`push tunnel re-owned (:${rec.tunnelPort}) on ${rec.hostId}`);
              }
            } catch (e) { this.log(`push tunnel re-own failed (:${rec.tunnelPort}): ${e.message}`); }
          }
        }
      }
    }
    for (const [id, h] of [...this._live]) {
      const rec = this._state.mounts.find((m) => m.id === id);
      if (!rec) continue;
      if (!this._online(rec.hostId)) { this.onMachineUnlinked(rec.hostId); continue; } // B-fcc7: the belt for a missed link close
      const lr = await lsChild(h.mountpoint);
      if (lr.ok === null) continue;   // ls could not start: no verdict (the old read threw out of the sweep — never a teardown)
      const responsive = lr.ok;
      if (!responsive) {
        this.log(`pull mount ${rec.mountpoint} hung — remounting`);
        try { await h.teardown(); } catch {}
        this._live.delete(id);
        this._up(rec).then(() => this._notify()).catch(() => {});
      }
    }
  }
}

// B-fcc7 (the remainder): THE pull manager a reader with no handle on it asks (src/routes/files.js). src/server/dial-pairing.js
// registers the hub's one manager — the one wiring that already holds its getter (server.js takes no line); before that, and in
// a process with none, nothing is shadowed.
let _pullDoor = null;
const pullLiveListeners = new Set();   // B-fcc7 (read 6): told when a pull comes up (src/server/task-groups-wiring.js: the TASK.md writer)
function onPullLive(f) { if (typeof f === 'function') pullLiveListeners.add(f); return () => pullLiveListeners.delete(f); }
function registerPullDoor(get) { _pullDoor = typeof get === 'function' ? get : null; }
/** The pull record whose folder holds p while it is not mounted (MachineMounts#shadowedBy), or null — never a throw. */
function pullShadowOf(p, { writer = false } = {}) {
  if (!_pullDoor || !p) return null;
  try { const mm = _pullDoor(); return mm && typeof mm.shadowedBy === 'function' ? mm.shadowedBy(String(p), { writer }) || null : null; } catch { return null; }
}

/** B-02f6 remainder (1): the WRITERS' door — shadowedBy's answer, with the proof (MachineMounts#shadowedByReal) where a write would
 *  be refused under a record whose real folder never resolved. ASYNC: every caller awaits it (a guard nobody awaits passes
 *  everything — test-pull-refresh's census); never a throw. */
async function pullShadowOfReal(p, { writer = false } = {}) {
  if (!_pullDoor || !p) return null;
  try { const mm = _pullDoor(); if (!mm) return null; if (typeof mm.shadowedByReal === 'function') return (await mm.shadowedByReal(String(p), { writer })) || null; return typeof mm.shadowedBy === 'function' ? mm.shadowedBy(String(p), { writer }) || null : null; } catch { return null; }
}

/** The row's state as a refusal's body — { error (the English for an agent), code, params } the client words (fsErrorText): the
 *  files route's and WebDAV's one spelling. */
function pullShadowBody(s) {
  const params = { machine: s.machine };
  // the B-f276 remainder (round wojcq4hn4's MUST): the MACHINES LIST held is said as the HOLD, by its name — never «offline» (the files
  // route and WebDAV alike: one spelling); another meaning than a PAIR-held record (`_held`, B-02f6 below)
  if (s.hostsHeld) return { error: `“${s.machine}”’s folder: ${s.hostsHeldWords || 'the paired machines cannot be read right now'}`, code: 'hosts-unread', params };
  // B-02f6: a writer under a PAIR-held folder — the row's hold, by its code (the page words it: src/mount-error-words.js)
  if (s.pairHeld) { const why = String((s.held && s.held.words) || ''); return { error: `“${s.machine}”’s folder ${s.mountpoint} is not mounted — ${why}`, code: 'machine_folder_held', params: { machine: s.machine, mountpoint: s.mountpoint, heldCode: (s.held && s.held.code) || null, heldParams: (s.held && s.held.params) || {} } }; }
  // B-02f6 remainder's follow (r1274): its link could not be checked in time — it heals by itself (the pair check asks again), or a person
  // removes the row and adds it again
  if (s.unchecked) return { error: `“${s.machine}”’s folder ${s.mountpoint}: where its link leads could not be checked in time, so nothing is written here — VibeSpace checks it again by itself, or remove the row and add it again to have it checked now`, code: 'machine_folder_unchecked', params: { machine: s.machine, mountpoint: s.mountpoint } };
  return s.offline
    ? { error: `“${s.machine}” is offline — this folder shows its files only while the machine is connected`, code: 'machine_offline', params }
    : { error: `“${s.machine}”’s folder is not mounted right now — this folder is where it appears; it is tried again by itself, or press Remount now on its row`, code: 'machine_folder_down', params };
}
/** A file under a pull folder was removed or moved out (MachineMounts#touched) — never a throw. */
function pullTouched(p) { if (!_pullDoor || !p) return; try { const mm = _pullDoor(); if (mm && typeof mm.touched === 'function') mm.touched(String(p)); } catch { } }

module.exports = { MachineMounts, registerPullDoor, pullShadowOf, pullShadowOfReal, pullTouched, onPullLive, pullShadowBody, starterRealpath, PROOF_MS, PROOF_KEEP_MS, PROOF_KIDS_MAX };
