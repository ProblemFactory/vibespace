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
const { execFile, spawn } = require('child_process');
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
/** THE one `ls` child of this file (spawn-env-census: one probe site) — never node fs on a mount point. `names` asks `ls -A`
 *  for the folder's entries (B-fcc7: is a released pull's bare folder empty?). Bounded (8 s), ended by its handle.
 *  → { ok, empty } (empty: null unless `names`). */
function lsChild(mp, { names = false, ms = 8000 } = {}) {   // → ok: true / false (no answer in time, an error) / null (it could not start); exited: the child's own end
  let exitedRes; const exited = new Promise((r) => { exitedRes = r; });
  return new Promise((res) => {
    let out = '', done = false, spawned = false, t = null;
    const end = (v) => { if (!done) { done = true; clearTimeout(t); res({ ...v, exited }); } };
    let c; try { c = spawn('ls', names ? ['-A', mp] : [mp], { stdio: ['ignore', names ? 'pipe' : 'ignore', 'ignore'] }); } catch { exitedRes(); return end({ ok: null, empty: null }); }   // could not start: no verdict
    t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } end({ ok: false, empty: null }); }, ms);
    c.on('spawn', () => { spawned = true; });
    if (names) c.stdout.on('data', (d) => { if (out.length < 4096) out += d; });
    c.on('close', (code) => { exitedRes(); end({ ok: code === 0, empty: names && code === 0 ? out.length === 0 : null }); });   // a name of spaces is a name
    c.on('error', () => { exitedRes(); end({ ok: spawned ? false : null, empty: null }); });   // an error before it started (EAGAIN, ENOENT): no verdict
  });
}

/** B-844b: a folder's REAL path — symlinks resolved — by a child `realpath -m` (never node fs on a path that may be a mount
 *  point), bounded (6 s); a host without GNU realpath (the child refuses) takes the path as written (resolved); a child that did
 *  not ANSWER in time (a wedged FUSE target) is no answer — null, so the next check asks again (r5: never cached as written). */
function realpathChild(p, { ms = 6000, onExit = null } = {}) {   // r6: onExit — the child's own end (a stuck child is never doubled)
  const lex = path.resolve(String(p || '/'));
  return new Promise((res) => {
    let out = '', done = false, t = null, gone = false;
    const exited = () => { if (!gone) { gone = true; try { onExit && onExit(); } catch { } } };
    const end = (v) => { if (!done) { done = true; clearTimeout(t); res(v); } };
    let c; try { c = spawn('realpath', ['-m', '--', lex], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { exited(); return end(null); }
    t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } end(null); }, ms);
    c.stdout.on('data', (d) => { if (out.length < 8192) out += d; });
    c.on('close', (code) => { exited(); const r = out.replace(/\n$/, ''); end(code === 0 && r.startsWith('/') ? r : lex); });
    c.on('error', (e) => { exited(); end(e && e.code === 'ENOENT' ? lex : null); });   // r7: no realpath on this host ⇒ as written (final); another error ⇒ no answer
  });
}

const RCLONE_PIN = 'v1.69.3'; // ≥1.66 brings `rclone nfsmount` (macOS without macFUSE); 2.369.12

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
    this._file = path.join(dataDir, 'machine-mounts.json');
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); }
    catch {
      // an unparseable store is backed up, never silently overwritten — its
      // records include live vsmt_ tokenIds (review hardening)
      try { if (fs.existsSync(this._file)) fs.copyFileSync(this._file, this._file + '.corrupt-' + Date.now()); } catch { }
      this._state = { mounts: [] };
      this._migrateLegacy();
    }
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
    const ingest = (file, map) => {
      if (!fs.existsSync(file)) return null; // nothing to do
      try {
        const st = JSON.parse(fs.readFileSync(file, 'utf-8'));
        const recs = (st.mounts || []).map(map);
        this._state.mounts.push(...recs);
        return recs.length;
      } catch (e) { this.log(`legacy store unreadable — kept in place (fix or remove it, then delete machine-mounts.json to re-migrate): ${file}: ${e.message}`); return -1; }
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
    if (nPush === null && nPull === null) return;
    try {
      const t = this._file + '.tmp';
      fs.writeFileSync(t, JSON.stringify(this._state, null, 2), { mode: 0o600 });
      fs.renameSync(t, this._file);
      JSON.parse(fs.readFileSync(this._file, 'utf-8')); // verify before renaming legacy stores
    } catch (e) { this.log('migration save FAILED — legacy stores kept, will re-run next boot: ' + e.message); return; }
    try { if (nPush >= 0 && fs.existsSync(hmF)) fs.renameSync(hmF, hmF + '.migrated'); } catch { }
    try { if (nPull >= 0 && fs.existsSync(dvF)) fs.renameSync(dvF, dvF + '.migrated'); } catch { }
    const migrated = (nPush > 0 ? nPush : 0) + (nPull > 0 ? nPull : 0);
    if (migrated) this.log(`migrated ${migrated} legacy mount record(s) into machine-mounts.json`);
  }

  _save() {
    try { const t = this._file + '.tmp'; fs.writeFileSync(t, JSON.stringify(this._state, null, 2), { mode: 0o600 }); fs.renameSync(t, this._file); } catch { }
  }
  _notify() { this.broadcast({ type: 'machine-mounts-updated', mounts: this.list() }); }

  _online(hostId) {
    try {
      const h = this.hosts.get(hostId);
      return h.transport === 'dial' ? !!this.hosts.dialOnline?.(h.deviceId) : true; // ssh: reachability is probed at use
    } catch { return false; }
  }

  list() {
    return this._state.mounts.map((m) => m.dir === 'pull'
      ? this._pullRow(m)
      : { id: m.id, dir: 'push', hostId: m.hostId, folder: m.folder, mountpoint: m.mountpoint, mode: m.mode, os: m.os, method: m.method, via: m.tunnelPort ? 'tunnel' : 'public', mountedAt: m.mountedAt, remoteMounted: !this._pushDown?.has(m.id) });
  }

  /** B-af94: a pull row's words said from a coded error keep its code (a code is shown only while ITS words are the row's) */
  _sayCode(id, e) { if (e && MW.known(e.code)) (this._pullErrorCodes = this._pullErrorCodes || new Map()).set(id, { words: String(e.message), code: e.code, params: e.params || {} }); }

  /** A pull's row: its words AND their code + params when the hub knows them (the page words those — zh, ja — and shows the
   *  English only for a code it does not know). A code is given only while ITS words are the row's. */
  _pullRow(m) {
    const error = (this._pullErrors && this._pullErrors.get(m.id)) || null, pc = error && this._pullErrorCodes && this._pullErrorCodes.get(m.id);
    // r5/r6 (reads 4 #8, 5 #2): a HOLDER says it shares its folder — EVERY waiting row, which way it nests, and whether its machine is gone
    const shares = [...this._held].filter(([, h]) => h.otherId === m.id).map(([id, h]) => { const o = this._state.mounts.find((x) => x.id === id) || {}; let name = null; try { name = this.hosts.get(o.hostId).name || o.hostId; } catch { name = null; } return { machine: name == null ? '' : String(name), removed: name == null, remotePath: String(o.remotePath || ''), kind: h.kind }; });
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
      try {
        const dm = await this.hosts.deviceBounded(hostId, 10000);
        const net = require('net');
        const { port } = await dm.reverseForward({ port: wantPort || 0, connectLocal: () => net.connect(lp, '127.0.0.1') });
        return { base: `http://127.0.0.1:${port}`, tunnelPort: port };
      } catch { if (dial) throw MW.refusal('device_unreachable'); /* ssh → public fallback below */ }
    }
    const pub = this.publicUrl() || publicUrlFallback;
    if (pub) return { base: String(pub).replace(/\/$/, ''), tunnelPort: null };
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
        if (err) resolve({ code: err.code || 1, stdout: (stdout || '').toString(), stderr: (stderr || err.message).toString(), ...(refusal ? { refusal: refusal.code } : {}) });
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
    const { base, tunnelPort } = await this._davBase(hostId, { publicUrlFallback });
    console.log(`[machine-mounts] push: dav base ready (${tunnelPort ? 'tunnel:' + tunnelPort : 'public'})`);
    const share = this.mountTokens.mint({ name: 'host:' + hostId, kind: 'reverse-mount', owner: hostId, root: abs, mode: mode === 'rw' ? 'rw' : 'ro' });
    const shareToken = share.raw, shareTokenId = share.rec.id;
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
    this._save(); this._notify();
    return { id, mountpoint: mp, os: osKind, method, via: tunnelPort ? 'tunnel' : 'public' };
    } catch (e) {
      // a FAILED push must not leak its freshly-minted credential — every
      // failed attempt used to leave an indistinguishable orphan token row
      // (real report: 6 stacked duplicates after the Mac's bad day)
      try { this.mountTokens.revoke?.(shareTokenId); } catch { }
      throw e;
    }
  }

  async _unmountPush(rec) {
    // best-effort on the machine (it may be offline) — the token is revoked
    // and the record dropped REGARDLESS, so a dead machine can't hold a live
    // credential hostage
    try {
      if (rec.method === 'rclone-webdav' || rec.method === 'rclone-nfs' || rec.method === 'mount_webdav') {
        await this._run(rec.hostId, 'sh', ['-c', `fusermount -u '${rec.mountpoint}' 2>/dev/null || umount '${rec.mountpoint}' 2>/dev/null || true`]);
      } else if (rec.method === 'net-use') {
        await this._run(rec.hostId, 'cmd', ['/c', `net use ${rec.mountpoint} /delete /y`]);
      }
    } catch { }
    try { this.mountTokens.revoke?.(rec.tokenId); } catch { }
    if (rec.tunnelPort) { // release the device-side listener (best-effort)
      try { const dm = await this.hosts.deviceBounded(rec.hostId); await dm.reverseUnforward(rec.tunnelPort); } catch { }
    }
  }

  // ═══ PULL direction (the machine's folder → this workspace) ═══

  async mountPull(hostId, opts = {}) {
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
      await DM.releaseStale(rec.mountpoint, { log: this.log });
      if (this._pullErrors && this._pullErrors.delete(rec.id)) this._notify();   // cure 2: the folder IS released now — its words go, whatever the mount does next
      const device = await this.hosts.deviceBounded(rec.hostId, 10000); // ssh: daemon over --stdio; dial: the dialed-in link
      // normalize a stored trailing slash so an EXISTING record (minted before
      // the mountPull fix) works without a daemon update (the serve-folder
      // confinement double-slash 403 — userW's real bug)
      const remotePath = String(rec.remotePath || '').replace(/\/+$/, '') || '/';
      let entry = null;
      const h = await DM.deviceFolderMount({
        device, remotePath, mountpoint: rec.mountpoint,
        rcloneBin: this.rcloneBin(), log: this.log, preCleaned: true,
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
    const rec = this._state.mounts.find((m) => m.id === id);
    if (!rec) throw MW.refusal('unknown_mount');
    if (!this._online(rec.hostId)) throw this.hosts.held?.() ? Object.assign(new Error(`mounting again: ${this.hosts.unreadWords()}`), { code: 'hosts-unread', status: 503 }) : MW.refusal('machine_offline_start');   // the B-f276 remainder (H21): held, not offline — beside B-af94's coded refusal (the move onto 921c0de17)
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
    const i = this._state.mounts.findIndex((m) => m.id === id);
    if (i < 0) throw MW.refusal('unknown_mount');
    const rec = this._state.mounts[i];
    // the B-f276 remainder's cure (主开发 23:20Z, its audit H5): a PUSH mount's unmount runs ON its machine — while hosts.json is HELD
    // that machine cannot be reached, and the remote unmount was swallowed while the token was revoked and the record dropped (a dead
    // mount left on the machine, nothing said): refused by name, nothing changed
    if (rec.dir !== 'pull' && this.hosts.held?.()) throw Object.assign(new Error(`removing a mount on a machine: ${this.hosts.unreadWords()}`), { code: 'hosts-unread', status: 503 });
    if (rec.dir === 'pull') {
      const live = this._live.get(id);
      if (live) { try { await live.teardown(); } catch { } this._live.delete(id); }
      this._pullErrors?.delete(id);   // cure 2: its words go with its record
      this._pullErrorCodes?.delete(id);   // B-af94: and their code
      this._bare?.delete(id);
      this._held.delete(id);
    } else {
      await this._unmountPush(rec);
      this._pushTunnelOwned.delete(id);
      this._pushRetryAt.delete(id);
      this._pushDown?.delete(id);
    }
    this._state.mounts.splice(i, 1);   // (its real path stays known: a chain of it still ending must see a record added again on that folder)
    this._save(); this._notify();
    if (rec.dir === 'pull') this._recheckPairs().catch(() => { });   // B-844b / B-6c4f: the record it held back may be free now
    return { ok: true };
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
    let name = null; try { name = this.hosts.get(other.hostId).name || other.hostId; } catch { name = null; }
    const params = { machine: name == null ? '' : String(name), removed: name == null, remotePath: String(other.remotePath || ''), mountpoint: String(other.mountpoint || ''), held };
    if (kind === 'same') return { code: 'mount_point_in_use', params, words: MW.wordsFor('mount_point_in_use', params) };   // B-af94: src/mount-error-words.js composes them (the page: the same in its language)
    params.kind = kind;
    return { code: 'mount_point_nested', params, words: MW.wordsFor('mount_point_nested', params) };
  }
  /** B-844b: every pull record's real path resolved (children, in parallel — never one wedged mount point after another) */
  async _resolveReals() {
    const kids = (this._realKids = this._realKids || new Set());   // r6 (read 5 #5): ONE child per record at a time — one stuck in the kernel is never doubled
    const todo = this._state.mounts.filter((m) => m.dir === 'pull' && !this._realMp.has(m.id) && !kids.has(m.id));
    todo.forEach((m) => kids.add(m.id));
    const reals = await Promise.all(todo.map((m) => (this._realpath || realpathChild)(m.mountpoint, { onExit: () => kids.delete(m.id) })));
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
  onMachineLinked(hostId) {
    if (!hostId) return;
    // B-844b r4 (read 3 #1b): a link is a re-rank — a held record of this machine may take its folder over from a holder that is down
    if (this._held.size) { this._recheckPairs().catch(() => { }).then(() => this._healLinked(hostId)); return; }
    this._healLinked(hostId);
  }
  _healLinked(hostId) {
    for (const rec of this._state.mounts.filter((m) => m.hostId === hostId)) {
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
          .then((dm) => dm.reverseForward({ port: rec.tunnelPort, connectLocal: () => net.connect(lp, '127.0.0.1') }))
          .then(() => { this._pushTunnelOwned.add(rec.id); this._pushRetryAt.delete(rec.id); })
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
   *  destination, the TASK.md writer) — ANY folder not live, whatever its probe (read 4: «unknown» must not mean «write»). → { id, hostId, machine, name (= machine: the shape the TASK.md writer reads), mountpoint, offline } | null */
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
    for (const m of this._state.mounts) {
      if (m.dir !== 'pull' || typeof m.mountpoint !== 'string' || !m.mountpoint) continue;
      const mp = this._pullFolders(m).find((x) => x !== '/' && (rp === x || rp.startsWith(x + '/')));   // a whole path segment (…/mac is not …/macbook)
      if (!mp) continue;
      if (this._live.has(m.id)) return null;
      let h = null; try { h = this.hosts.get(m.hostId); } catch { h = null; }
      if (!h || this._held.has(m.id) || (!writer && this._bare?.get(m.id) !== 'empty')) continue;   // a held record: its holder answers   // a READER: probed empty only (a folder with files of its own shows them); a WRITER: any folder not live (what it adds is hidden under the next mount, or blocks it)
      if (!best || mp.length > best.mp.length) best = { m, mp, h };
    }
    if (!best) return null;
    const machine = String(best.h.name || best.m.hostId || '');
    return { id: best.m.id, hostId: best.m.hostId, machine, name: machine, mountpoint: best.mp, offline: !this._online(best.m.hostId) };
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
    const r = await lsChild(rec.mountpoint, { names: true, ms: this._probeMs || 8000 });
    Promise.resolve(r.exited).then(() => { this._probing.delete(rec.id); this._probingAt.delete(rec.id); this._probeSaid?.delete(rec.id); if (this._reprobe?.delete(rec.id)) this._probeBare(rec).catch(() => { }); });
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
    let n = 0;
    try {
      const referenced = new Set(this._state.mounts.filter((m) => m.dir === 'push').map((m) => m.tokenId));
      for (const t of this.mountTokens.list?.() || []) {
        // structured kind (not a name-prefix hack): only reverse-mount tokens
        // with no backing push record are orphans; user 'share' tokens are
        // never touched
        if (t.kind === 'reverse-mount' && !referenced.has(t.id)) {
          try { this.mountTokens.revoke?.(t.id); n++; } catch { }
        }
      }
      if (n) this.log(`revoked ${n} orphan reverse-mount token(s) (no matching mount record)`);
    } catch { }
    return n;
  }

  /** Boot: heal every recorded mount whose machine is reachable. */
  async restore() {
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
      const p = prev.then(() => DM.releaseStale(rec.mountpoint, { log: this.log })).then(() => { if (!this._held.has(rec.id) && this._pullErrors && this._pullErrors.delete(rec.id)) this._notify(); }).catch((e) => {   // read 2: a held record's words stay
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
  async onMachineUnpaired(hostId) {
    if (!hostId) return;
    for (const rec of [...this._state.mounts.filter((m) => m.hostId === hostId)]) {
      try { await this.unmount(rec.id); } catch { }
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
              await dm.reverseForward({ port: rec.tunnelPort, connectLocal: () => net.connect(lp, '127.0.0.1') });
              this._pushTunnelOwned.add(rec.id);
              this._pushRetryAt.delete(rec.id);
              this.log(`push tunnel re-owned (:${rec.tunnelPort}) on ${rec.hostId}`);
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

/** The row's state as a refusal's body — { error (the English for an agent), code, params } the client words (fsErrorText): the
 *  files route's and WebDAV's one spelling. */
function pullShadowBody(s) {
  const params = { machine: s.machine };
  return s.offline
    ? { error: `“${s.machine}” is offline — this folder shows its files only while the machine is connected`, code: 'machine_offline', params }
    : { error: `“${s.machine}”’s folder is not mounted right now — this folder is where it appears; it is tried again by itself, or press Remount now on its row`, code: 'machine_folder_down', params };
}
/** A file under a pull folder was removed or moved out (MachineMounts#touched) — never a throw. */
function pullTouched(p) { if (!_pullDoor || !p) return; try { const mm = _pullDoor(); if (mm && typeof mm.touched === 'function') mm.touched(String(p)); } catch { } }

module.exports = { MachineMounts, registerPullDoor, pullShadowOf, pullTouched, onPullLive, pullShadowBody };
