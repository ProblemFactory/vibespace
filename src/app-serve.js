'use strict';
/**
 * APPS THAT SURVIVE A REBUILT MACHINE — THE MACHINE HALF (Layer 0 of docs/design-app-persistence.zh.md §3.1), SHARED:
 * node builtins + the PURE src/app-manifest.js + the PURE model's validateAppRow. It runs WHERE the apps live — in the
 * hub's process for device #0 (src/desktop-serve.js holds it as `ds.apps`), inside the device daemon for a paired
 * machine (the daemon bundles desktop-serve → this file) — and is reached through the `app-*` ops of the desktop-serve
 * table (runAppOp; a hub asks a daemon only when its hello-ack names `app-install`).
 *
 * WHAT IT DOES (as the machine's user — never as root; root runs only APP_SCRIPT, through the machine's ONE package
 * slot, which the HUB starts with the argv a plan carries):
 *   app-status       the index + what a rebuilt machine needs (replayRungs) + the drift tripwire's verdict + the slot
 *   app-plan         the simulations as the user (`apt-get -s` + `--print-uris`, the user's own lists when the system
 *                    has none), a .deb copied into ~/.vibespace/apps/staging with its sha256, a source's key fetched
 *                    over https with its OpenPGP fingerprints — → the PURE plan + the argv to run + the commands a
 *                    person reads; `kind: 'search'` answers `apt-cache search`
 *   app-fetch        design 009 — an installer the agent names by ADDRESS (downloaded as the user: https, a public name,
 *                    the address every hop connects to judged first, ≤ 5 redirects, ≤ 2 GiB) or by FILE (copied), into
 *                    staging/ 0600 with its sha256; its KIND read from the bytes (a .deb or an AppImage — anything else
 *                    is deleted and named). `app-plan` then plans the staged file in place: a .deb as today, an AppImage
 *                    with no root at all (its own .desktop + icon read out of its SquashFS — src/app-squashfs.js — never
 *                    by running it); `app-install {kind:'appimage'}` unpacks it into appimage/<id>/ and deletes it;
 *                    `app-remove {home:true}` removes an entry that lives in the home (AppImage / uv / npm), no root;
 *                    `app-unstage` deletes a proposal's staged files (declined, withdrawn, expired, done)
 *   app-install / app-remove / app-refresh / app-adopt-drift
 *                    the RECORD after the slot ran: the script's `= …` lines read from the slot's own log (keyed by the
 *                    run's nonce), the rows and package lists read from the ROOT-OWNED ~/.vibespace/apps/sys (an agent
 *                    runs as this same user — it may edit manifest.json, never what root wrote), the index written
 *                    through writeJsonAtomic. Nothing here ever runs apt as root.
 *   the catalog      catalogRows(): one row per .desktop file root listed for an entry (re-parsed from apt's own
 *                    /usr/share/applications, never from the user-writable index) — desktop-serve's registry() serves
 *                    them beside DEFAULT_REGISTRY; iconFile(): the one icon a row may show (PNG / SVG under /usr/share).
 * Every probe is a bounded async child or an async fs call — never a sync walk on the loop (the hub's event loop).
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const A = require('./app-manifest.js');
const M = require('./desktop-apps.js');
const SLOT = require('./install-slot.js'); // the machine's ONE package slot — its log is this machine's install log
const SQ = require('./app-squashfs.js');
const SS = require('./app-system-serve.js'); // Layer 1 (design §3.2): the app system's machine half — its rows, plans, boot step
const SYS = require('./app-system.js');

const APP_OPS = Object.freeze(['app-status', 'app-plan', 'app-install', 'app-remove', 'app-refresh', 'app-adopt-drift', 'app-fetch', 'app-unstage', 'app-forget']);
const K = require('./app-kinds/index.js'); // PURE — an app kind is its own file + one index line (lanes dc-apps-rows, dc-app-kinds)
const PLAN_KINDS = Object.freeze([...K.PLAN_KINDS, ...SYS.SYS_KINDS]); // design 019: `move` = the user's click (the host apps INTO the app system), `forget` = its second step
/** A file VibeSpace staged for a proposal: `<16 hex>.deb` / `.AppImage` / `.icon.png|svg` (a download in flight: `.part`). */
const STAGED_RE = /^[0-9a-f]{16}\.(?:deb|AppImage|icon\.(?:png|svg))$/;
const STAGED_ANY_RE = /^[0-9a-f]{16}\.(?:deb|AppImage|part|key|icon\.(?:png|svg))$/;
const ICON_MAX = 1024 * 1024;
const MANIFEST_FILE = 'manifest.json';
const STATE_FILE = 'state.json';
/** How long the user's own apt lists count as fresh (a machine whose system has no lists — a container image). */
const LISTS_TTL_MS = 6 * 3600 * 1000;
const SIM_MS = 120000;
const UPDATE_MS = 300000;
const KEY_MAX = 1024 * 1024;
const DEB_MAX = 4 * 1024 * 1024 * 1024;
const LOG_MAX = 32 * 1024 * 1024;
const DESKTOP_MAX = 256 * 1024;
const STAGING_KEEP_MS = 24 * 3600 * 1000;

const named = (code, msg) => { const e = new Error(msg); e.code = code; return e; };
const setKey = (l) => [...new Set(l || [])].sort().join(' '); // a package SET (design 019: a move = the same set in the other layer)
/** writeJsonAtomic (tmp + rename), mode 0600 — the index is the user's. */
async function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  await fsp.rename(tmp, file);
}
/** A bounded child: never throws; `{code, stdout, stderr, timedOut}`. */
function run(cmd, args, { env, timeout = SIM_MS, maxBuffer = 32 * 1024 * 1024, cwd, encoding = 'utf8' } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = execFile(cmd, args, { env: { ...(env || process.env), LC_ALL: 'C' }, timeout, maxBuffer, encoding, cwd }, (err, stdout, stderr) => {
        resolve({ code: err ? (typeof err.code === 'number' ? err.code : (err.killed ? 124 : 127)) : 0, stdout: encoding === 'buffer' ? (stdout || Buffer.alloc(0)) : String(stdout || ''), stderr: String(stderr || ''), timedOut: !!(err && err.killed), error: err && typeof err.code !== 'number' ? String(err.message || err) : null });
      });
    } catch (e) { resolve({ code: 127, stdout: '', stderr: String(e.message || e), timedOut: false, error: String(e.message || e) }); }
    void child;
  });
}
/** verify-r1 H2 — ONE read of a file the user named: opened O_NONBLOCK (a FIFO swapped in after a stat never blocks a
 *  libuv thread — an open of a writer-less FIFO returns at once), its type and size judged on the OPEN fd, copied to
 *  `dest` (0600) while hashed: the sha256 is of exactly the bytes staged (root installs only bytes that still hash to
 *  it, from its own copy). → {sha256, size}; throws `bad_name` for anything but a regular file ≤ max. */
async function readHashed(src, dest, max) {
  const fh = await fsp.open(src, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    const st = await fh.stat();
    if (!st.isFile() || st.size > max) throw named('bad_name', `${src} is not a regular file under ${A.fmtBytes(max)}`);
    const h = crypto.createHash('sha256');
    const out = await fsp.open(dest, 'w', 0o600);
    let size = 0;
    try {
      const buf = Buffer.alloc(1 << 20);
      for (;;) {
        const { bytesRead } = await fh.read(buf, 0, buf.length, null);
        if (!bytesRead) break;
        size += bytesRead;
        if (size > max) throw named('bad_name', `${src} grew past ${A.fmtBytes(max)} while it was read`);
        h.update(buf.subarray(0, bytesRead)); await out.write(buf, 0, bytesRead);
      }
    } finally { await out.close(); }
    return { sha256: h.digest('hex'), size };
  } finally { await fh.close(); }
}
const sha256File = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')));
});

// ── OpenPGP: the fingerprints of a key file (armored or binary), checked against gpg's own on real keys ─────────────
/** The bytes of a key file: an ASCII-armored block is de-armored (headers skipped, the CRC line dropped). */
function dearmor(buf) {
  const s = buf.toString('latin1');
  const m = /-----BEGIN PGP [A-Z ]+-----\r?\n([\s\S]*?)-----END PGP [A-Z ]+-----/.exec(s);
  if (!m) return buf;
  const lines = m[1].split(/\r?\n/);
  let i = 0;
  while (i < lines.length && /^[A-Za-z-]+: /.test(lines[i])) i++; // armor headers ("Version: …", "Comment: …")
  return Buffer.from(lines.slice(i).filter((l) => l && !/^=/.test(l)).join(''), 'base64');
}
/** Every public-key (tag 6) and subkey (tag 14) fingerprint in a key file, upper-case hex: v4 = SHA-1 over
 *  0x99 ‖ len16 ‖ body, v5 = SHA-256 over 0x9a ‖ len32 ‖ body, v6 = SHA-256 over 0x9b ‖ len32 ‖ body. Unparseable ⇒ []. */
function keyFingerprints(buf) {
  const bin = dearmor(Buffer.isBuffer(buf) ? buf : Buffer.from(buf || ''));
  const out = [];
  let p = 0;
  while (p < bin.length) {
    const b = bin[p++];
    if (!(b & 0x80)) return out;
    let tag, len;
    if (b & 0x40) {
      tag = b & 0x3f;
      const o = bin[p++];
      if (o < 192) len = o;
      else if (o < 224) { len = ((o - 192) << 8) + bin[p++] + 192; }
      else if (o === 255) { len = bin.readUInt32BE(p); p += 4; }
      else return out; // a partial length — never in a key
    } else {
      tag = (b >> 2) & 0x0f;
      const lt = b & 3;
      if (lt === 0) len = bin[p++];
      else if (lt === 1) { len = bin.readUInt16BE(p); p += 2; }
      else if (lt === 2) { len = bin.readUInt32BE(p); p += 4; }
      else return out;
    }
    if (!Number.isFinite(len) || p + len > bin.length) return out;
    const body = bin.subarray(p, p + len);
    p += len;
    if (tag !== 6 && tag !== 14) continue;
    const v = body[0];
    if (v === 4) { const h = crypto.createHash('sha1'); const l = Buffer.alloc(2); l.writeUInt16BE(len); h.update(Buffer.from([0x99])).update(l).update(body); out.push(h.digest('hex').toUpperCase()); }
    else if (v === 5 || v === 6) { const h = crypto.createHash('sha256'); const l = Buffer.alloc(4); l.writeUInt32BE(len); h.update(Buffer.from([v === 6 ? 0x9b : 0x9a])).update(l).update(body); out.push(h.digest('hex').toUpperCase()); }
  }
  return out;
}
/** GET an https URL (≤ max bytes, ≤ 3 redirects, https only) → Buffer, or a named throw. */
function fetchHttps(url, { max = KEY_MAX, timeout = 20000, redirects = 3 } = {}) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    if (!/^https:\/\//.test(String(url))) return reject(named('bad_source', `${String(url).slice(0, 120)} is not https`));
    const req = https.get(url, { timeout, headers: { 'User-Agent': 'VibeSpace-apps' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        let next;
        try { next = new URL(res.headers.location, url).href; } catch { return reject(named('bad_source', 'a bad redirect')); }
        return fetchHttps(next, { max, timeout, redirects: redirects - 1 }).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(named('bad_source', `the key address answered HTTP ${res.statusCode}`)); }
      const chunks = []; let n = 0;
      res.on('data', (d) => { n += d.length; if (n > max) { req.destroy(); reject(named('bad_source', `the key is larger than ${max} bytes`)); } else chunks.push(d); });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (e) => reject(named('bad_source', `the key could not be read (${e.message})`)));
    });
    req.on('timeout', () => { req.destroy(); reject(named('bad_source', 'the key address did not answer in time')); });
    req.on('error', (e) => reject(named('bad_source', `the key could not be fetched (${e.message})`)));
  });
}

/**
 * @param home        the user's home on this machine (the hub: os.homedir(); a daemon: its HOME)
 * @param stateDir    the machine keeper's data dir — where the package slot keeps its log / pidfile / exit file
 * @param env         () => the sanitised base env
 * @param binOnPath   (name, {env}) => path | null (desktop-display's memo)
 * @param installState (stateDir) => {installing, lastInstall} (desktop-display — the slot's own pidfile reading)
 * @param dpkgStatus  path of the dpkg status file (the suite points it at a fixture)
 * @param markerDir   where the ephemeral-rootfs markers live (the suite points it at a scratch dir)
 * @param fetchSeam   SUITES ONLY: `{hosts: {'<name>.test': '127.0.0.1'}, ca: <PEM>, limits: {idleMs, totalMs, max}}` — a
 *                    loopback "vendor" by a RESERVED `.test` name (never a real site); production passes nothing
 */
function create({ home = os.homedir(), stateDir, env = () => process.env, log = console, now = Date.now, binOnPath = null, installState = null,
  dpkgStatus = '/var/lib/dpkg/status', markerDir = A.MARKER_DIR, systemLists = '/var/lib/apt/lists', osRelease = '/etc/os-release', isRoot = null, runner = run, fetchSeam = null, rootUid = 0 } = {}) {
  if (!stateDir) throw new Error('app-serve: stateDir is required');
  if (typeof env !== 'function') { const e0 = env; env = () => e0; }
  const appsDir = path.join(home, A.APPS_REL);
  const sysDir = path.join(appsDir, 'sys');
  const stagingDir = path.join(appsDir, 'staging');
  const manifestFile = path.join(appsDir, MANIFEST_FILE);
  const stateFile = path.join(appsDir, STATE_FILE);
  const listsRoot = path.join(home, '.cache', 'vibespace', 'apt');
  const root = isRoot != null ? !!isRoot : (typeof process.getuid === 'function' && process.getuid() === 0);
  const marker = (p) => path.join(markerDir, path.basename(p));
  const which = (name) => (typeof binOnPath === 'function' ? binOnPath(name, { env: env() }) : null);
  let sudoMemo = null; // { at, yes }
  let catalog = { rows: [], sig: null, at: 0 };
  let baseMemo = { mtime: null, size: null, list: null, sha: null };
  let listsFlight = null;
  // Layer 1: the app system (a persistent userland on this disk) — active only where VIBESPACE_APP_SYSTEM is set
  const sys = SS.create({ home, env, runner, log, now, which, validate: M.validateAppRow, rootUid }); // rootUid: a gate's fixture tree stands in for root's (default 0)

  async function ensureDirs() {
    await fsp.mkdir(appsDir, { recursive: true, mode: 0o700 });
    await fsp.mkdir(stagingDir, { recursive: true, mode: 0o700 });
  }
  async function exists(p) { try { await fsp.lstat(p); return true; } catch { return false; } }
  async function mtimeOf(p) { try { return (await fsp.stat(p)).mtimeMs; } catch { return null; } }
  /** A file root wrote: a regular file, root-owned, never group/other-writable, its directory the same — else null. */
  async function readRootFile(file, max = 1024 * 1024) {
    try {
      const st = await fsp.lstat(file);
      if (!st.isFile() || st.uid !== rootUid || (st.mode & 0o022) || st.size > max) return null;
      const d = await fsp.lstat(path.dirname(file));
      if (!d.isDirectory() || d.uid !== rootUid || (d.mode & 0o022)) return null;
      return await fsp.readFile(file, 'utf8');
    } catch { return null; }
  }
  async function rootDirOk(dir) { try { const d = await fsp.lstat(dir); return d.isDirectory() && d.uid === rootUid && !(d.mode & 0o022); } catch { return false; } }

  // ── the index ──
  async function readManifest() {
    let txt;
    try { txt = await fsp.readFile(manifestFile, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return { manifest: A.emptyManifest(), error: null }; return { manifest: A.emptyManifest(), error: `${MANIFEST_FILE} cannot be read (${e.message})` }; }
    let j;
    try { j = JSON.parse(txt); } catch (e) { return { manifest: A.emptyManifest(), error: `${MANIFEST_FILE} is not JSON (${e.message})`, corrupt: true }; }
    const v = A.validateManifest(j);
    return v.ok ? { manifest: v.manifest, error: null } : { manifest: A.emptyManifest(), error: `${MANIFEST_FILE}: ${v.error}`, corrupt: true };
  }
  /** Write the index (the ONE writer). A corrupt file is set aside first (`manifest.json.corrupt-<ms>`, bytes kept). */
  async function writeManifest(m, { corrupt = false } = {}) {
    await ensureDirs();
    if (corrupt) { try { await fsp.rename(manifestFile, `${manifestFile}.corrupt-${now()}`); } catch { /* gone already */ } }
    await writeJsonAtomic(manifestFile, m);
  }
  async function readState() { try { const j = JSON.parse(await fsp.readFile(stateFile, 'utf8')); return j && typeof j === 'object' ? j : {}; } catch { return {}; } }
  async function writeState(patch) { await ensureDirs(); const s = { ...(await readState()), ...patch }; await writeJsonAtomic(stateFile, s); return s; }

  // ── machine facts ──
  async function osFacts() {
    const out = { distro: null, codename: null, prettyName: null };
    try {
      const kv = {};
      for (const line of (await fsp.readFile(osRelease, 'utf8')).split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) kv[m[1]] = m[2].replace(/^"(.*)"$/, '$1'); }
      out.distro = kv.ID ? kv.ID.toLowerCase() : null;
      out.codename = (kv.VERSION_CODENAME || kv.UBUNTU_CODENAME || '').toLowerCase() || null;
      out.prettyName = kv.PRETTY_NAME ? kv.PRETTY_NAME.slice(0, 80) : null;
    } catch { /* none */ }
    return out;
  }
  async function freeBytes(p) {
    try {
      if (typeof fsp.statfs === 'function') { const s = await fsp.statfs(p); return s.bavail * s.bsize; }
      const r = await runner('df', ['-B1', '--output=avail', p], { env: env(), timeout: 5000 });
      const n = Number(String(r.stdout).trim().split('\n').pop());
      return Number.isFinite(n) ? n : null;
    } catch { return null; }
  }
  let factsMemo = null; // { at, facts } — a status read every few seconds never re-probes sudo / dpkg each time
  async function facts({ fresh = false } = {}) {
    if (!fresh && factsMemo && now() - factsMemo.at < 30000) return factsMemo.facts;
    const out0 = await factsNow();
    factsMemo = { at: now(), facts: out0 };
    return out0;
  }
  async function factsNow() {
    const e = env();
    const out = { platform: process.platform, arch: null, ...(await osFacts()), apt: null, sudo: false, root, rootFree: null, homeFree: null, appsDir, stateDir };
    if (process.platform !== 'linux') return out;
    out.apt = which('apt-get');
    if (out.apt) { const r = await runner('dpkg', ['--print-architecture'], { env: e, timeout: 5000 }); out.arch = r.code === 0 ? r.stdout.trim() || null : null; }
    if (!root && which('sudo')) {
      if (!sudoMemo || now() - sudoMemo.at > 60000) { const r = await runner('sudo', ['-n', 'true'], { env: e, timeout: 4000 }); sudoMemo = { at: now(), yes: r.code === 0 }; }
      out.sudo = sudoMemo.yes;
    }
    out.rootFree = await freeBytes('/');
    out.homeFree = await freeBytes(home);
    return out;
  }
  async function slotState() {
    if (typeof installState !== 'function') return { installing: null, lastInstall: null };
    try { return await installState(stateDir); } catch { return { installing: null, lastInstall: null }; }
  }

  // ── apt as the user ──
  async function systemListsPresent() {
    try { return (await fsp.readdir(systemLists)).some((f) => /_Packages(?:\.(?:gz|xz|lz4|zst|bz2))?$/.test(f)); } catch { return false; }
  }
  const userOpts = () => ['-o', `Dir::State::Lists=${listsRoot}/lists`, '-o', `Dir::Cache=${listsRoot}/cache`, '-o', 'Debug::NoLocking=1'];
  /** The apt options the simulations use: none when the system has its own lists (they are what root's install reads
   *  after its own `apt-get update`); else the user's own lists, refreshed when older than LISTS_TTL_MS (one in flight). */
  async function aptOpts({ refresh = false } = {}) {
    if (!refresh && await systemListsPresent()) return [];
    const stamp = path.join(listsRoot, 'updated');
    const at = await mtimeOf(stamp);
    if (refresh || at == null || now() - at > LISTS_TTL_MS) {
      if (!listsFlight) {
        listsFlight = (async () => {
          await fsp.mkdir(path.join(listsRoot, 'lists', 'partial'), { recursive: true });
          await fsp.mkdir(path.join(listsRoot, 'cache', 'archives', 'partial'), { recursive: true });
          const r = await runner('apt-get', [...userOpts(), 'update'], { env: env(), timeout: UPDATE_MS });
          if (r.code === 0) await fsp.writeFile(stamp, String(now()));
          else log.warn?.(`[apps] the user's apt lists could not be refreshed (exit ${r.code}): ${(r.stderr || r.stdout).split('\n').filter((l) => /^(E|W):/.test(l)).slice(0, 3).join(' | ')}`);
          return r;
        })().finally(() => { listsFlight = null; });
      }
      await listsFlight;
    }
    return userOpts();
  }
  const both = (r) => `${r.stdout}\n${r.stderr}`;

  // ── the dpkg set (the base identity + the drift's "now") ──
  async function dpkgNow() {
    try {
      const st = await fsp.stat(dpkgStatus);
      if (baseMemo.list && baseMemo.mtime === st.mtimeMs && baseMemo.size === st.size) return baseMemo;
      const list = A.parseDpkgStatus(await fsp.readFile(dpkgStatus, 'utf8'));
      const sha = crypto.createHash('sha256').update(A.dpkgListText(list)).digest('hex');
      baseMemo = { mtime: st.mtimeMs, size: st.size, list, sha };
      return baseMemo;
    } catch { return { list: null, sha: null }; }
  }

  // ── the catalog: rows from what ROOT listed ──
  async function rootEntries() {
    const dir = path.join(sysDir, 'entries');
    if (!(await rootDirOk(sysDir)) || !(await rootDirOk(dir))) return [];
    let names = [];
    try { names = await fsp.readdir(dir); } catch { return []; }
    const out = [];
    for (const n of names.filter((x) => /^[a-z0-9][a-z0-9-]{0,39}\.list$/.test(x)).sort()) {
      const id = n.slice(0, -5);
      const list = await readRootFile(path.join(dir, n), 64 * 1024);
      if (list == null) continue;
      const packages = list.split('\n').map((l) => l.trim()).filter((l) => A.PKG_RE.test(l));
      const desk = await readRootFile(path.join(dir, `${id}.desktop`), 64 * 1024);
      const desktops = (desk || '').split('\n').map((l) => l.trim()).filter(A.desktopPathOk);
      out.push({ id, packages, desktops });
    }
    return out;
  }
  /** THE ENTRY ID A RUN WRITES UNDER (verify-r1 F1). The id keys ROOT's record (sys/entries/<id>.list + .desktop — what a
   *  rebuilt machine reinstalls, which rows exist), and the run REPLACES that record with this request's packages. So it is
   *  chosen against root's own records, never the user-writable index alone (an agent runs as this user and can edit
   *  manifest.json; the plan's digest does not carry the id): root's record of exactly these packages keeps its id; an id
   *  the index offers (or the caller asks) is taken only when root holds no record under it or root's record is these
   *  same packages; a new id is free in BOTH. */
  async function entryIdFor(packages, manifest, { kind = 'apt', asked = null, layer = null, moving = false } = {}) {
    const key = packages.join(' ');
    // Layer 1: an install INTO the app system keys root's record inside the userland; an id the other layer holds is taken
    const [hostE, sysE] = [await rootEntries(), await sys.entries()];
    const rootE = layer === 'sys' ? sysE : hostE;
    const otherIds = new Set((layer === 'sys' ? hostE : sysE).map((e) => e.id));
    const rootBy = new Map(rootE.map((e) => [e.id, e.packages.join(' ')]));
    // design 019 M2: a MOVE keeps its id — the other layer's record of it is these same packages (the host copy goes next)
    const twinOk = (id) => moving && (layer === 'sys' ? hostE : sysE).some((e) => e.id === id && setKey(e.packages) === setKey(packages));
    const fits = (id) => A.ENTRY_ID_RE.test(String(id || '')) && (!otherIds.has(id) || twinOk(id)) && (!rootBy.has(id) || rootBy.get(id) === key);
    const mine = rootE.find((e) => e.packages.join(' ') === key);
    if (mine) return mine.id;
    if (asked && fits(asked)) return asked;
    const idx = manifest.entries.find((e) => K.rootRowOf(kind).sameEntry(e, packages, key) && fits(e.id));
    if (idx) return idx.id;
    return A.entryIdFor(packages[0], [...rootBy.keys(), ...otherIds, ...manifest.entries.map((e) => e.id)]);
  }
  /** The package sources root holds (sys/sources/<id>.sources, root-owned) — their names are taken. */
  async function rootSourceIds() {
    const dir = path.join(sysDir, 'sources');
    if (!(await rootDirOk(sysDir)) || !(await rootDirOk(dir))) return [];
    try { return (await fsp.readdir(dir)).filter((n) => /^[a-z0-9][a-z0-9-]{0,39}\.sources$/.test(n)).map((n) => n.slice(0, -8)); } catch { return []; }
  }
  /** verify-r1 H1 — the approved sources as ROOT holds them (sys/sources/<id>.sources: its URIs line), never the index's word. */
  async function rootSources() {
    const out = [];
    for (const id of await rootSourceIds()) {
      try { const m = /^URIs: (\S+)/m.exec(await fsp.readFile(path.join(sysDir, 'sources', `${id}.sources`), 'utf8')); if (m) out.push({ id, uris: [m[1]] }); } catch { /* gone */ }
    }
    return out;
  }
  /** The rows of ONE entry: each .desktop file (root-owned, under apt's applications dirs) parsed and validated; the
   *  primary row (`app.<entry>`) is the file named after the package (`<pkg>.desktop`, `…-<pkg>.desktop`), else the first. */
  async function rowsFor(entry) {
    const score = (p) => { const b = path.basename(p, '.desktop'); return entry.packages.some((k) => b === k) ? 3 : entry.packages.some((k) => b.endsWith('-' + k) || b.endsWith('.' + k)) ? 2 : 1; };
    const files = entry.desktops.slice().sort((a, b) => score(b) - score(a) || (a < b ? -1 : 1));
    const rows = [];
    for (const f of files) {
      const text = await readRootFile(f, DESKTOP_MAX);
      if (text == null) continue;
      const pkg = entry.packages.find((k) => path.basename(f, '.desktop').includes(k)) || entry.packages[0] || null;
      const r = A.parseDesktopFile(text, { entry: entry.id, path: f, primary: rows.length === 0, pkg, validate: M.validateAppRow });
      if (r.ok && !rows.some((x) => x.id === r.row.id)) rows.push({ ...r.row, app: entry.id });
    }
    return rows;
  }
  /** Re-read the catalog (cheap when nothing changed: the entries dir's listing + mtimes are its signature). */
  async function refreshCatalog() {
    const dir = path.join(sysDir, 'entries');
    let sig = '';
    try { const names = (await fsp.readdir(dir)).sort(); for (const n of names) sig += `${n}:${await mtimeOf(path.join(dir, n))};`; } catch { sig = 'none'; }
    sig += `|m:${await mtimeOf(manifestFile)}|s:${await sys.signature()}`;
    if (sig === catalog.sig) return catalog.rows;
    const hostRows = [];
    for (const e of await rootEntries()) hostRows.push(...await rowsFor(e));
    const sysRows = await sys.catalog(); // Layer 1: `sys.<entry>` rows — each runs its shim (the export table keeps ~/.vibespace/sysroot/bin current)
    const rows = [...A.dedupeRows(hostRows, sysRows), ...await homeRows(), ...sysRows]; // design 019 M3: one row per app (a moved app's host copy is no row)
    catalog = { rows, sig, at: now() };
    return rows;
  }
  /** design 009 S2 — an AppImage's row lives in the user-writable index; it is a row only while it runs exactly
   *  `<appsDir>/appimage/<id>/root/AppRun` and that file exists (an index edited to run anything else is no row). */
  async function homeRows() {
    const { manifest } = await readManifest();
    const out = [];
    for (const e of manifest.entries.filter((x) => (K.kindRow(x.kind) || {}).unpacked)) {
      const apprun = path.join(appsDir, 'appimage', e.id, 'root', 'AppRun');
      const r = e.rows[0];
      if (!r || !(r.exec === apprun || (r.exec === 'xterm' && r.args[0] === '-e' && r.args[1] === apprun)) || !(await exists(apprun))) continue;
      const row = { ...r, args: [...r.args], env: { APPDIR: path.dirname(apprun) }, app: e.id };
      if (M.validateAppRow(row).ok) out.push(row);
    }
    return out;
  }
  /** The rows as desktop-serve's registry() last saw them (refreshCatalog keeps them current). */
  function catalogRows() { return catalog.rows.map((r) => sys.verifyRow({ ...r, args: [...r.args] })); } // Layer 1: a sys row's launcher is re-checked at every read (= at launch)
  /** The icon file a row may show → {file, type} | null: a PNG / SVG under /usr/share/{icons,pixmaps}, a regular file. */
  async function iconFile(rowId) {
    const row = catalog.rows.find((r) => r.id === rowId);
    if (!row || !row.icon) return null;
    for (const c0 of A.iconCandidates(row.icon, { appsDir })) {
      const c = row.layer === 'sys' ? (c0.startsWith('/usr/share/') ? await sys.inRoot(sys.rootfs, c0) : null) : c0; // an app-system row's icon lives in its userland (no link on the way)
      if (!c) continue;
      try { const st = await fsp.stat(c); if (st.isFile() && st.size <= 1024 * 1024) return { file: c, type: c.endsWith('.svg') ? 'image/svg+xml' : 'image/png' }; } catch { /* next */ }
    }
    return null;
  }

  // ── what a rebuilt machine CAN put back (verify-r1 F6) ──
  let rootBaseMemo = { mtime: null, set: null };
  /** The packages root's base holds (sys/base/status, root-owned) — what a fresh machine of that image already has. */
  async function rootBaseSet() {
    const file = path.join(sysDir, 'base', 'status');
    const t0 = await mtimeOf(file);
    if (t0 == null) return new Set();
    if (rootBaseMemo.mtime === t0 && rootBaseMemo.set) return rootBaseMemo.set;
    const txt = await readRootFile(file, 64 * 1024 * 1024);
    const set = new Set(txt == null ? [] : A.parseDpkgStatus(txt).map((x) => x.package));
    rootBaseMemo = { mtime: t0, set };
    return set;
  }
  /** The packages whose .deb root keeps in the local repository (debs/, root-owned: <pkg>_<version>_<arch>.deb). */
  async function cachedSet() {
    const dir = path.join(appsDir, 'debs');
    if (!(await rootDirOk(dir))) return new Set();
    try { return new Set((await fsp.readdir(dir)).filter((n) => n.endsWith('.deb')).map((n) => n.split('_')[0])); } catch { return new Set(); }
  }

  // ── status ──
  /** design 019 M1: the index follows root's records in both layers (a layer that cannot be read is left alone: the host's
   *  when its record dir is not root's, the app system's unless it is enabled AND usable — verify r1: a boot with the flag
   *  off, its userland still on this disk, dropped every sys entry and named it gone). A corrupt index is never rewritten
   *  here (its own path wins). Dropped ids → state.sys.gone (the dialog names them once). */
  async function reconcile({ view = null } = {}) {
    const { manifest, corrupt, error } = await readManifest();
    if (corrupt || error) return { changed: false, manifest };
    const entriesDir = path.join(sysDir, 'entries');
    const hostKnown = !(await exists(entriesDir)) || ((await rootDirOk(sysDir)) && (await rootDirOk(entriesDir)));
    const v = sys.enabled() ? (view || await sys.view({ facts: await facts(), slot: await slotState() })) : null;
    const r = A.reconcileIndex(manifest, { host: hostKnown ? await rootEntries() : null, sys: v && v.usable ? await sys.entries() : null });
    if (!r.changed) return r;
    await writeManifest(r.manifest);
    if (r.dropped.length) { const s0 = await readState(); await writeState({ sys: { ...(s0.sys || {}), gone: { ids: r.dropped.slice(0, 50), at: now() } } }); }
    catalog.sig = null;
    return r;
  }
  async function status() {
    { const v0 = sys.enabled() ? await sys.view({ facts: await facts(), slot: await slotState() }) : null; await reconcile({ view: v0 }); }
    const { manifest, error } = await readManifest();
    const state = await readState();
    const rows = await refreshCatalog();
    const entries = await rootEntries();
    const [cached, baseSet] = [await cachedSet(), await rootBaseSet()];
    const replayedAt = await mtimeOf(marker(A.REPLAY_MARKER));
    const baseShaStored = ((await readRootFile(path.join(sysDir, 'base', 'sha'), 200)) || '').trim() || null;
    const now0 = await dpkgNow();
    // verify-r1 F4: which of root's entries are NOT installed on this root filesystem (null = the dpkg set unreadable)
    const installed = now0.list ? new Set(now0.list.map((x) => x.package)) : null;
    const missing = installed ? entries.filter((e) => !e.packages.every((p) => installed.has(p))).map((e) => e.id) : null;
    const decision = A.replayRungs({ entries: entries.length, markerHit: replayedAt != null, baseShaNow: now0.sha, baseShaStored: A.SHA256_RE.test(baseShaStored || '') ? baseShaStored : null, missing: missing ? missing.length : null });
    let drift = { drift: false, why: 'no-tripwire' };
    // verify-r1 F7: the apt hook (DPkg::Post-Invoke) never runs for a plain `dpkg -i` — the dpkg status file's own write
    // time is a touch too (every dpkg run rewrites it; VibeSpace's own runs end before slot-ended is stamped)
    const hookAt = await mtimeOf(marker(A.DRIFT_MARKER)), statusAt = await mtimeOf(dpkgStatus);
    const touchedAt = hookAt == null && statusAt == null ? null : Math.max(hookAt || 0, statusAt || 0);
    if (touchedAt != null) {
      const lastTxt = await readRootFile(marker(A.LAST_LIST), 16 * 1024 * 1024);
      const managed = new Set([...entries.flatMap((e) => e.packages), ...manifest.resolved.debs.map((d) => d.package)]);
      drift = A.driftVerdict({ touchedAt, slotEndedAt: await mtimeOf(marker(A.SLOT_ENDED)), last: lastTxt == null ? null : A.parseDpkgList(lastTxt), now: now0.list || [], managed: [...managed] });
    }
    const f0 = await facts();
    const appSystem = await sys.view({ facts: f0, slot: await slotState() }); // Layer 1: the dialog's Set up… / Repair / Migrate… / Roll back… read this
    const sysE = await sys.entries();
    return {
      appsDir, manifest, manifestError: error, state, rows, facts: f0, appSystem,
      // `uncached`: an entry's own packages with no saved .deb and not in the image's base — the replay can never put them
      // back (an app adopted from a .deb that exists in no archive); the row says so (verify-r1 F6)
      entries: entries.map((e) => ({ id: e.id, packages: e.packages, rows: rows.filter((r) => r.app === e.id).map((r) => r.id), indexed: manifest.entries.some((m) => m.id === e.id), uncached: e.packages.filter((p) => !cached.has(p) && !baseSet.has(p)) })).concat(sysE.map((e) => ({ id: e.id, layer: 'sys', packages: e.packages, rows: rows.filter((r) => r.app === e.id).map((r) => r.id), indexed: manifest.entries.some((m) => m.id === e.id), uncached: [] }))),
      replay: { markerAt: replayedAt, decision, missing, baseShaNow: now0.sha, baseShaStored: baseShaStored || null, last: state.replay || null },
      drift, updates: state.updates || null, refreshedAt: state.refreshedAt || null, slot: await slotState(), stateDir,
    };
  }

  // ── plans ──
  const nonceOf = () => crypto.randomBytes(8).toString('hex');
  const label0 = (pkgs) => pkgs.join(' ');
  async function stage(src, ext) {
    await ensureDirs();
    // stale staged files go (a plan nobody approved within a day is a new plan)
    try { for (const n of await fsp.readdir(stagingDir)) { const p = path.join(stagingDir, n); const t = await mtimeOf(p); if (t != null && now() - t > STAGING_KEEP_MS) await fsp.rm(p, { force: true }); } } catch { /* none */ }
    const dest = path.join(stagingDir, `${nonceOf()}.${ext}`);
    if (Buffer.isBuffer(src)) await fsp.writeFile(dest, src, { mode: 0o600 });
    else await fsp.copyFile(src, dest);
    return dest;
  }
  /** The plan for ONE request (see the header). `p` = {kind, packages?, debPath?, source?, entryId?, query?}. */
  async function plan(p = {}) {
    const kind = String(p.kind || '');
    if (!PLAN_KINDS.includes(kind)) throw named('bad-request', `unknown plan kind ${JSON.stringify(kind)} — one of ${PLAN_KINDS.join(', ')}`);
    if (kind !== 'search') await ensureDirs(); // the apps dir is the USER's (root refuses one that is missing — never creates it under someone's home)
    const f = await facts({ fresh: true });
    const slot = await slotState();
    const install = { stateDir, installing: slot.installing, lastInstall: slot.lastInstall, sudo: f.sudo, root: f.root, apt: f.apt, platform: f.platform };
    const { manifest } = await readManifest();
    const nonce = nonceOf();
    const canRun = !!(f.root || f.sudo);
    // Layer 1: where the app system is usable, an apt / .deb install goes INTO it (simulated against its own apt state)
    const sysV = [...K.SYS_VIEW_KINDS, ...SYS.SYS_KINDS].includes(kind) ? await sys.view({ facts: f, slot }) : null;
    const intoSys = !!(sysV && sysV.usable) && (K.kindRow(kind) || {}).entry === 'root';
    const simOpts = async () => (intoSys ? SYS.simOpts(sys.rootfs) : aptOpts());
    const ret = (pl) => ({ plan: { ...(intoSys ? sys.retarget(pl, nonce) : pl), nonce }, facts: f, install });
    if (SYS.SYS_KINDS.includes(kind)) return ret(await sys.sysPlan(kind, { facts: f, nonce, canRun, view: sysV }));
    if (kind === 'search') {
      const words = A.searchWords(p.query);
      if (!words) throw named('bad-request', 'search for plain words (letters, digits, + . -)');
      if (!f.apt) return { results: [], facts: f, install, code: 'no_apt' };
      const opts = await aptOpts();
      const r = await runner('apt-cache', [...opts, 'search', '--names-only', ...words], { env: env(), timeout: 30000 });
      return { results: A.parseSearch(r.stdout, 60), facts: f, install };
    }
    if (!f.apt) return ret({ ok: false, code: 'no_apt', error: `${f.prettyName || 'this machine'} has no apt-get — VibeSpace installs apps with apt only`, kind });
    const planRow = K.kindRow(kind) || {};
    if (planRow.planner) return planRow.planner({ p, f, kind, manifest, nonce, canRun, intoSys, ret, simOpts, moveTail, label0, A, M, appsDir, both, env, runner, fsp, path, DEB_MAX, dpkgNow, entryIdFor, twinOf, rootEntries, sys, stage, stagedFile, readHashed, debApp, appImageInfo, stageIcon }); // an app kind plans itself (its own file in src/app-kinds/, lane dc-app-kinds)
    if (kind === 'move' || kind === 'forget') return ret(await movePlan(kind, p, { manifest, f, nonce, canRun, sysV }));
    if (kind === 'source') {
      const v = A.validateSourceSpec(p.source);
      if (!v.ok) return ret({ ok: false, code: v.code, error: v.error, kind });
      const src = v.source;
      if (src.uris.length !== 1) return ret({ ok: false, code: 'bad_source', error: 'one https address per package source', kind });
      // the name keys ROOT's own files (sys/sources/<id>.sources, sys/keys/<id>.*, /etc/apt/…/vibespace-<id>.*): a source root
      // already holds is "already added" whatever the user-writable index says (an agent can delete the index's row)
      if (manifest.sources.some((s) => s.id === src.id) || (await rootSourceIds()).includes(src.id)) return ret({ ok: false, code: 'bad_source', error: `a package source named ${src.id} is already added — remove it first, or pick another name`, kind });
      let key;
      try { key = await fetchHttps(src.key); } catch (e) { return ret({ ok: false, code: e.code || 'bad_source', error: String(e.message || e), kind, source: src }); }
      const fingerprints = keyFingerprints(key);
      if (!fingerprints.length) return ret({ ok: false, code: 'bad_source', error: `${src.key} is not an OpenPGP public key`, kind, source: src });
      const keySha256 = crypto.createHash('sha256').update(key).digest('hex');
      const staged = await stage(key, 'key');
      const source = { ...src, keySha256, fingerprints };
      return ret({ ok: true, code: canRun ? null : 'no_sudo', error: canRun ? null : 'this machine has no passwordless sudo — run the commands below yourself', canRun, kind, mode: 'source', entryId: src.id, source: `source:${src.id}`, sourceSpec: source, staged, packages: [], closure: [], closureKey: `${src.uris.join(' ')} ${keySha256} ${fingerprints.join(' ')}`,
        commands: A.appCommands({ mode: 'source', source }), argv: A.appArgv({ mode: 'source', appsDir, id: src.id, nonce, args: [src.uris[0], src.suites.join(' '), src.components.join(' '), keySha256, staged], root: f.root }), label: src.id });
    }
    if (kind === 'source-remove') {
      const s = manifest.sources.find((x) => x.id === p.sourceId);
      if (!s) return ret({ ok: false, code: 'not_found', error: `no package source named ${JSON.stringify(String(p.sourceId || '').slice(0, 40))}`, kind });
      return ret({ ok: true, code: canRun ? null : 'no_sudo', error: canRun ? null : 'no passwordless sudo', canRun, kind, mode: 'source-remove', entryId: s.id, source: `source:${s.id}`, packages: [], closure: [], closureKey: `remove ${s.id}`, commands: A.appCommands({ mode: 'source-remove', source: s }), argv: A.appArgv({ mode: 'source-remove', appsDir, id: s.id, nonce, args: [], root: f.root }), label: s.id });
    }
    if (kind === 'remove') {
      const se = (await sys.entries()).find((x) => x.id === p.entryId); // Layer 1: an entry of the app system is removed from it
      if (se) { const me = manifest.entries.find((x) => x.id === se.id); return ret(await sys.removePlan(se, { facts: f, nonce, canRun, label: (me && me.label) || null, both })); }
      const entries = await rootEntries();
      const e = entries.find((x) => x.id === p.entryId);
      const homeE = !e && manifest.entries.find((x) => x.id === p.entryId && A.HOME_KINDS.includes(x.kind));
      if (homeE) return ret(A.removePlanFor(homeE)); // design 009 S3: AppImage / uv / npm — no root, no slot
      if (!e) return ret({ ok: false, code: 'not_found', error: `no app ${JSON.stringify(String(p.entryId || '').slice(0, 40))} was installed through VibeSpace on this machine`, kind });
      const others = entries.filter((x) => x.id !== e.id).flatMap((x) => x.packages);
      const own = e.packages.filter((x) => !others.includes(x));
      let pl;
      if (own.length) {
        const sim = await runner('apt-get', [...(await aptOpts()), '-s', 'remove', '--autoremove', ...own], { env: env() });
        pl = A.parsePlan(both(sim), '', { requested: own, facts: f, kind: 'remove', others });
      } else pl = { ok: true, code: canRun ? null : 'no_sudo', canRun, closure: [], closureKey: '', removes: [], kind: 'remove', packages: [] };
      if (!pl.ok) return ret(pl);
      const me = manifest.entries.find((x) => x.id === e.id);
      return ret({ ...pl, mode: 'remove', entryId: e.id, source: 'apt', packages: e.packages, commands: A.appCommands({ mode: 'remove', packages: own, entryLabel: (me && me.label) || e.id }), argv: A.appArgv({ mode: 'remove', appsDir, id: e.id, nonce, args: [], root: f.root }), label: (me && me.label) || e.id });
    }
    if (kind === 'refresh' || kind === 'replay') {
      const entries = await rootEntries();
      const pk = [...new Set([...entries.flatMap((e) => e.packages), ...manifest.resolved.debs.map((d) => d.package)])].filter((x) => A.PKG_RE.test(x));
      if (kind === 'replay') {
        const st = await status();
        const rung = p.rung === 2 || p.rung === 1 ? p.rung : st.replay.decision.rung;
        if (!rung) return ret({ ok: false, code: 'nothing', error: `nothing to put back (${st.replay.decision.why})`, kind, decision: st.replay.decision });
        const mode = rung === 1 ? 'replay' : 'replay-online';
        return ret({ ok: true, code: canRun ? null : 'no_sudo', canRun, kind, mode, rung, entryId: 'replay', source: 'apt', packages: entries.flatMap((e) => e.packages), closure: [], closureKey: `${mode} ${entries.map((e) => e.id).join(' ')}`, decision: st.replay.decision,
          commands: rung === 1 ? ['# VibeSpace puts your apps back from ~/.vibespace/apps/debs, offline', `sudo apt-get install -y ${entries.flatMap((e) => e.packages).join(' ')}  # from the local repository only`] : A.appCommands({ mode: 'refresh', packages: pk }),
          argv: A.appArgv({ mode, appsDir, id: 'replay', nonce, args: [], root: f.root }), label: 'replay' });
      }
      if (sysV && sysV.usable) { // Layer 1: the image never patches the app system — its Refresh upgrades it (D5: shown first, never automatic)
        const r = await sys.refreshPlan({ nonce, canRun, both });
        await writeState({ updates: { count: r.updates.length, list: r.updates.slice(0, 100), at: now() } });
        // design 019 M5: the host apps this Refresh does NOT upgrade are named (the card offers their move)
        const skippedHost = entries.map((e) => { const me = manifest.entries.find((x) => x.id === e.id); return { id: e.id, label: (me && me.label) || e.id }; });
        return ret(skippedHost.length ? { ...r.plan, skippedHost } : r.plan);
      }
      let updates = [];
      if (pk.length) {
        const opts = await aptOpts();
        const sim = await runner('apt-get', [...opts, '-s', 'install', '--only-upgrade', ...pk], { env: env() });
        // verify-r1 H1: each update names its origin — the files apt would fetch, an approved source by ROOT's record
        const uris = await runner('apt-get', [...opts, '--print-uris', '-y', 'install', '--only-upgrade', ...pk], { env: env() });
        updates = A.updatesOf(both(sim), pk, { debs: A.parseUris(both(uris)).debs, sources: await rootSources() });
      }
      await writeState({ updates: { count: updates.length, list: updates.slice(0, 100), at: now() } });
      return ret({ ok: true, code: canRun ? null : 'no_sudo', canRun, kind, mode: 'refresh', entryId: 'refresh', source: 'apt', packages: pk, updates, closure: [], closureKey: updates.map((u) => `${u.package}=${u.to}`).sort().join(' '), commands: A.appCommands({ mode: 'refresh', packages: pk }), argv: A.appArgv({ mode: 'refresh', appsDir, id: 'refresh', nonce, args: [], root: f.root }), label: 'refresh' });
    }
    throw named('bad-request', `plan kind ${kind} is not implemented`);
  }

  // ── design 009 §2 A: an installer by ADDRESS or FILE — staged as the user, judged by its bytes, read without running it ──
  const stagedPath = (name) => (STAGED_RE.test(String(name || '')) ? path.join(stagingDir, String(name)) : null);
  /** A staged installer, re-hashed: `{file, size}` | `{error: <a plan refusal>}` (gone, or not the bytes approved). */
  async function stagedFile(p, ext) {
    const f = stagedPath(p.staged);
    if (!f || !f.endsWith(ext) || !A.SHA256_RE.test(String(p.sha256 || ''))) return { error: { ok: false, code: 'bad-request', error: 'a staged installer is named by its file and its sha256' } };
    let st;
    try { st = await fsp.lstat(f); } catch { return { error: { ok: false, code: 'gone', error: 'the downloaded installer is gone (declined, expired or cleaned up) — propose it again' } }; }
    if (!st.isFile()) return { error: { ok: false, code: 'changed', error: 'the staged installer is not a plain file any more — nothing ran' } };
    const sha = await sha256File(f).catch(() => null);
    if (sha !== p.sha256) return { error: { ok: false, code: 'changed', error: 'the installer changed after it was shown — nothing ran; propose it again' } };
    return { file: f, size: st.size };
  }
  const testHosts = () => Object.keys((fetchSeam && fetchSeam.hosts) || {});
  /** The ONE address a hop connects to: every address the name resolves to must be public (or the suite's `.test` seam). */
  async function resolveHost(host) {
    const seam = fetchSeam && fetchSeam.hosts && Object.prototype.hasOwnProperty.call(fetchSeam.hosts, host) ? fetchSeam.hosts[host] : null;
    if (seam && /\.test$/.test(host)) return { address: seam, family: seam.includes(':') ? 6 : 4 };
    let all;
    try { all = await require('dns').promises.lookup(host, { all: true, verbatim: true }); } catch (e) { throw named('fetch_failed', `${host} does not resolve (${e.code || e.message})`); }
    if (!all.length) throw named('fetch_failed', `${host} does not resolve`);
    for (const a of all) { const why = require('./egress-fence.js').addressVerdict(a.address); if (why) throw named('bad_address', `${host} points at a private address (${why}) — refused`); }
    return all[0];
  }
  /** ONE GET of a judged address, connected to exactly `ip` → `{redirect}` | `{sha256, size}` (the body into `dest`). */
  function getOnce(url, ip, dest, lim) {
    const https = require('https');
    return new Promise((resolve, reject) => {
      let settled = false, ws = null;
      const fin = (fn, x) => { if (settled) return; settled = true; clearTimeout(total); fn(x); };
      const fail = (code, msg) => { try { req.destroy(); } catch { /* gone */ } if (ws) ws.destroy(); fin(reject, named(code, msg)); };
      const total = setTimeout(() => fail('fetch_failed', `the download did not finish within ${Math.round(lim.totalMs / 60000)} min`), lim.totalMs);
      const lookup = (h, o, cb) => (o && o.all ? cb(null, [{ address: ip.address, family: ip.family }]) : cb(null, ip.address, ip.family));
      const req = https.get(url, { lookup, headers: { 'User-Agent': 'VibeSpace-apps', Accept: '*/*' }, ...(fetchSeam && fetchSeam.ca ? { ca: fetchSeam.ca } : {}) }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return fin(resolve, { redirect: String(res.headers.location) }); }
        if (res.statusCode !== 200) { res.resume(); return fail('fetch_failed', `the address answered HTTP ${res.statusCode}`); }
        const len = Number(res.headers['content-length']);
        if (Number.isFinite(len) && len > lim.max) return fail('too_large', `the file is ${A.fmtBytes(len)} — VibeSpace downloads at most ${A.fmtBytes(lim.max)}`);
        const h = crypto.createHash('sha256'); let size = 0;
        ws = fs.createWriteStream(dest, { flags: 'wx', mode: 0o600 });
        ws.on('error', (e) => fail('fetch_failed', `the download could not be written (${e.message})`));
        res.on('data', (d) => { size += d.length; if (size > lim.max) return fail('too_large', `the file is larger than ${A.fmtBytes(lim.max)} — VibeSpace downloads at most that`); h.update(d); });
        res.on('error', (e) => fail('fetch_failed', `the download broke off (${e.message})`));
        res.on('aborted', () => fail('fetch_failed', 'the download broke off'));
        ws.on('finish', () => fin(resolve, { sha256: h.digest('hex'), size }));
        res.pipe(ws);
      });
      req.setTimeout(lim.idleMs, () => fail('fetch_failed', `the address stopped sending for ${Math.round(lim.idleMs / 1000)} s`));
      req.on('error', (e) => fail('fetch_failed', `the address could not be fetched (${e.code || e.message})`));
    });
  }
  /** Download `url0` into `dest`: every hop judged (fetchVerdict + the resolved address), ≤ FETCH_REDIRECTS redirects. */
  async function download(url0, dest) {
    const lim = { idleMs: 60000, totalMs: 60 * 60000, max: A.FETCH_MAX, ...((fetchSeam && fetchSeam.limits) || {}) };
    let url = String(url0);
    const hosts = [];
    for (let hop = 0; ; hop++) {
      const v = A.fetchVerdict(url, { testHosts: testHosts() });
      if (!v.ok) throw named(v.code, hop ? `the address redirected to ${url.slice(0, 160)} — ${v.error}` : v.error);
      if (hop > A.FETCH_REDIRECTS) throw named('bad_address', `the address redirected more than ${A.FETCH_REDIRECTS} times`);
      hosts.push(v.host);
      const r = await getOnce(v.url, await resolveHost(v.host), dest, lim);
      if (r.redirect) { try { url = new URL(r.redirect, v.url).href; } catch { throw named('bad_address', 'a bad redirect'); } continue; }
      return { ...r, hosts, url: String(url0) };
    }
  }
  /** `app-fetch {url} | {file}` → `{staged, sha256, size, kind, hosts, url?, file?}` — or a named refusal, nothing kept. */
  async function fetchInstaller(p = {}) {
    await ensureDirs();
    const part = path.join(stagingDir, `${nonceOf()}.part`);
    try {
      let got;
      if (p.url != null) got = await download(String(p.url), part);
      else if (p.file != null) {
        const file = String(p.file);
        if (!path.isAbsolute(file) || /[\0\n]/.test(file) || file.length > 4096) throw named('bad_name', 'name the installer by its absolute path on that machine');
        if (path.resolve(file).startsWith(appsDir + path.sep)) throw named('bad_name', 'that file is VibeSpace\'s own');
        try { got = { ...(await readHashed(file, part, A.FETCH_MAX)), hosts: [], file }; }
        catch (e) { throw named(e.code === 'bad_name' ? 'bad_name' : 'not_found', e.code === 'bad_name' ? e.message : `${file} cannot be read on that machine (${e.code === 'ENOENT' ? 'no such file' : e.code === 'EACCES' ? 'you may not read it' : e.message})`); }
      } else throw named('bad-request', 'name an address or a file');
      const head = Buffer.alloc(64);
      const fh = await fsp.open(part, 'r'); try { await fh.read(head, 0, 64, 0); } finally { await fh.close(); }
      const s = A.sniffInstaller(head);
      if (!s.kind) throw named('not_an_installer', `${p.url != null ? `what ${got.hosts[got.hosts.length - 1]} sent` : path.basename(String(p.file))} is ${s.why}`);
      const name = `${path.basename(part, '.part')}.${(K.kindRow(s.kind) || {}).staged || 'AppImage'}`;
      await fsp.rename(part, path.join(stagingDir, name));
      return { staged: name, sha256: got.sha256, size: got.size, kind: s.kind, hosts: got.hosts, url: p.url != null ? String(p.url) : null, file: got.file || null };
    } catch (e) { await fsp.rm(part, { force: true }); throw e; }
  }
  /** `app-unstage {names}` deletes a proposal's staged files; `{keep}` sweeps every staged file over an hour old that no
   *  open proposal keeps (a crash mid-install, a hub restarted). */
  async function unstage(p = {}) {
    let removed = 0;
    for (const n of (Array.isArray(p.names) ? p.names : []).slice(0, 20)) { const f = stagedPath(n); if (f && await exists(f)) { await fsp.rm(f, { force: true }); removed++; } }
    if (Array.isArray(p.keep)) {
      const keep = new Set(p.keep.map(String));
      let names = [];
      try { names = await fsp.readdir(stagingDir); } catch { names = []; }
      for (const n of names) { if (keep.has(n) || !STAGED_ANY_RE.test(n)) continue; const t = await mtimeOf(path.join(stagingDir, n)); if (t != null && now() - t > 3600 * 1000) { await fsp.rm(path.join(stagingDir, n), { force: true }); removed++; } }
    }
    return { removed };
  }
  /** An icon read out of an archive → `<hash>.icon.png|svg` in staging (PNG by its magic, SVG by its text), or null. The
   *  name is the hash of the bytes AND the installer's staged name: a re-plan of the same proposal (the dialog, the click)
   *  writes nothing new, another proposal never shares (and never deletes) it. */
  async function stageIcon(buf, salt) {
    if (!buf || !buf.length || buf.length > ICON_MAX) return null;
    const ext = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'png' : /<svg[\s>]/.test(buf.subarray(0, 4096).toString('utf8')) ? 'svg' : null;
    if (!ext) return null;
    const name = `${crypto.createHash('sha256').update(String(salt || '')).update(buf).digest('hex').slice(0, 16)}.icon.${ext}`;
    try { await fsp.writeFile(path.join(stagingDir, name), buf, { mode: 0o600, flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    return name;
  }
  /** ONE member of a .deb's data archive (dpkg-deb --fsys-tarfile | tar -xO, bounded) → Buffer | null. */
  async function debMember(staged, member, max) {
    const r = await runner('sh', ['-c', 'dpkg-deb --fsys-tarfile "$1" | tar -xOf - -- "$2"', 'vs-deb-member', staged, `.${member}`], { env: env(), timeout: 60000, maxBuffer: max, encoding: 'buffer' });
    return r.code === 0 && r.stdout && r.stdout.length ? Buffer.from(r.stdout) : null;
  }
  /** A staged .deb's own app: its .desktop (Name + the localized names) and icon, read out WITHOUT installing it. */
  async function debApp(staged, pkg) {
    const ls = await runner('dpkg-deb', ['-c', staged], { env: env(), timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
    if (ls.code !== 0) return null;
    const members = A.debMembers(ls.stdout);
    for (const d of A.debDesktopOf(members, { pkg, max: DESKTOP_MAX }).slice(0, 4)) {
      const txt = await debMember(staged, d, DESKTOP_MAX);
      const r = txt ? A.parseDesktopFile(txt.toString('utf8'), { entry: 'x', primary: true }) : null;
      if (!r || !r.ok) continue;
      const iconPath = A.debIconOf(members, r.row.icon);
      const icon = iconPath ? await stageIcon(await debMember(staged, iconPath, ICON_MAX), path.basename(staged)) : null;
      return { name: r.row.label, labels: r.row.labels || null, icon, desktop: d };
    }
    return null;
  }
  /** An AppImage's facts, read out of its SquashFS (never run): the app (its root .desktop), its icon bytes, the
   *  unpacked size; every name in the tree judged NOW (a hostile tree is refused before any card exists). */
  async function appImageInfo(file) {
    const head = Buffer.alloc(64);
    const fh = await fsp.open(file, 'r'); try { await fh.read(head, 0, 64, 0); } finally { await fh.close(); }
    const off = A.appImageOffset(head);
    if (off == null) throw named('unreadable', 'not an AppImage (no ELF header)');
    const img = await SQ.open(file, off);
    try {
      const sum = await img.walk(async () => { });
      const top = await img.root();
      const d = top.filter((e) => e.type !== 'dir' && /^[A-Za-z0-9@._+-]+\.desktop$/.test(e.name)).sort((a, b) => (a.name < b.name ? -1 : 1))[0];
      const out = { app: null, desktopText: null, icon: null, bytes: sum.bytes, files: sum.count, offset: off };
      if (!d) return out;
      const txt = await img.readFile(d, DESKTOP_MAX).catch(() => null);
      const r = txt ? A.parseDesktopFile(txt.toString('utf8'), { entry: 'x', primary: true }) : null;
      if (!r || !r.ok) return out;
      out.desktopText = txt.toString('utf8');
      out.app = { name: r.row.label, labels: r.row.labels || null, stem: d.name.replace(/\.desktop$/, '').toLowerCase() };
      const names = r.row.icon && /^[A-Za-z0-9@._+-]{1,120}$/.test(r.row.icon) ? [`${r.row.icon}.png`, `${r.row.icon}.svg`, '.DirIcon'] : ['.DirIcon'];
      for (const n of names) {
        const e = top.find((x) => x.name === n);
        const b = e ? await img.readFile(e, ICON_MAX).catch(() => null) : null;
        if (b && (b.subarray(0, 4).toString('latin1') === '\x89PNG' || /<svg[\s>]/.test(b.subarray(0, 4096).toString('utf8')))) { out.icon = { bytes: b, ext: b[0] === 0x89 ? 'png' : 'svg' }; break; }
      }
      return out;
    } finally { await img.close(); }
  }
  /** design 009 S2 — THE CLICK for an AppImage: the staged bytes copied (hashed) into a private directory, checked
   *  against the approved sha256, unpacked by VibeSpace's own reader into appimage/<id>/root (never run, never outside
   *  that directory), the AppImage file deleted, the row recorded from its own desktop file. */
  async function installAppImage({ staged, sha256, entryId, by, why = null, label = null, from = null, icon = null }) {
    if (!A.ENTRY_ID_RE.test(String(entryId || ''))) throw named('bad-request', 'bad entry id');
    const sf = await stagedFile({ staged, sha256 }, '.AppImage');
    if (sf.error) throw named(sf.error.code, sf.error.error);
    const base = path.join(appsDir, 'appimage');
    await fsp.mkdir(base, { recursive: true, mode: 0o700 });
    const dir = path.join(base, entryId), tmp = path.join(base, `.${entryId}.${nonceOf()}`);
    await fsp.mkdir(tmp, { mode: 0o700 });
    let row, info;
    try {
      const copy = path.join(tmp, 'app.AppImage');
      const h = await readHashed(sf.file, copy, A.FETCH_MAX);
      if (h.sha256 !== sha256) throw named('changed', 'the installer changed after it was shown — nothing was installed');
      info = await appImageInfo(copy);
      if (!info.desktopText) throw named('unreadable', 'the AppImage carries no desktop file VibeSpace can read — it would have no row in Apps');
      const img = await SQ.open(copy, info.offset);
      try { await img.extract(path.join(tmp, 'root')); } finally { await img.close(); }
      await fsp.rm(copy, { force: true });
      if (info.icon) await fsp.writeFile(path.join(tmp, `icon.${info.icon.ext}`), info.icon.bytes, { mode: 0o600 });
      const rr = A.appImageRow({ entry: entryId, desktopText: info.desktopText, dir, icon: info.icon ? path.join(dir, `icon.${info.icon.ext}`) : null, validate: M.validateAppRow });
      if (!rr.ok) throw named('unreadable', rr.error || `the AppImage's desktop file is not an app (${rr.skip})`);
      row = rr.row;
      let old = null;
      if (await exists(dir)) { old = path.join(base, `.${entryId}.old-${nonceOf()}`); await fsp.rename(dir, old); }
      await fsp.rename(tmp, dir);
      if (old) await fsp.rm(old, { recursive: true, force: true });
    } catch (e) { await fsp.rm(tmp, { recursive: true, force: true }); throw e; }
    const { manifest, corrupt } = await readManifest();
    const prev = manifest.entries.find((e) => e.id === entryId);
    const m = A.withEntry(manifest, { id: entryId, kind: 'appimage', packages: [], label: String(label || row.label).slice(0, 80), addedAt: (prev && prev.addedAt) || now(), by: byOf(by), approvedAt: now(), rows: [row], services: [], ...(why ? { why } : {}), appimage: { sha256, size: sf.size, name: info.app ? `${info.app.stem}.AppImage` : 'app.AppImage', from: from ? String(from).slice(0, 300) : null } });
    await writeManifest(m, { corrupt });
    await unstage({ names: [staged, icon] });
    catalog.sig = null;
    const rows = (await refreshCatalog()).filter((r) => r.app === entryId);
    return { entry: m.entries.find((e) => e.id === entryId), rows, run: { files: info.files, bytes: info.bytes } };
  }
  /** design 009 S3 — removing an entry that lives in the home: an AppImage's own directory (lstat'ed, never a link) and
   *  row; a uv / npm tool through its own uninstaller, as the user. */
  async function removeHome({ entryId }) {
    const { manifest, corrupt } = await readManifest();
    const e = manifest.entries.find((x) => x.id === entryId && A.HOME_KINDS.includes(x.kind));
    if (!e) throw named('not_found', `no app ${JSON.stringify(String(entryId || '').slice(0, 40))} in your home`);
    const pl = A.removePlanFor(e);
    if (!pl.ok) throw named(pl.code, pl.error);
    if (K.kindRow(e.kind).unpacked) {
      const dir = path.join(appsDir, 'appimage', e.id);
      let st = null;
      try { st = await fsp.lstat(dir); } catch { st = null; }
      if (st && st.isDirectory()) await fsp.rm(dir, { recursive: true, force: true });
    } else {
      const argv = pl.homeArgv.map((a) => (a === '~/.local' ? path.join(home, '.local') : a));
      const r = await runner(argv[0], argv.slice(1), { env: env(), timeout: 300000 });
      if (r.code !== 0 && !/not installed|No such|is not a|nothing to/i.test(both(r))) throw named('remove_failed', `${argv.join(' ')} failed (exit ${r.code}): ${both(r).trim().split('\n').slice(-2).join(' ').slice(0, 300)}`);
    }
    await writeManifest(A.withoutEntry(manifest, e.id), { corrupt });
    catalog.sig = null; await refreshCatalog();
    return { removed: e.id, kind: e.kind };
  }

  // ── records (after the slot ran) ──
  async function runOf(id, nonce) {
    let text = '';
    try {
      const file = path.join(stateDir, SLOT.INSTALL_FILES.log);
      const st = await fsp.stat(file);
      const fh = await fsp.open(file, 'r');
      try { const n = Math.min(st.size, LOG_MAX); const b = Buffer.alloc(n); await fh.read(b, 0, n, st.size - n); text = b.toString('utf8'); } finally { await fh.close(); }
    } catch { text = ''; }
    const r = A.parseRunLog(text, { id, nonce });
    if (!r.found) throw named('not_run', 'that run did not happen in this machine\'s package slot (another install held it) — press Install again');
    if (r.refused) throw named('refused', `the install was refused on the machine: ${r.refused.code}${r.refused.detail ? ` ${r.refused.detail}` : ''}`);
    if (!r.ok && r.partial == null) throw named('install_failed', 'the install did not finish — the log above says why');
    return r;
  }
  const byOf = (b) => (b && typeof b === 'object' && (b.kind === 'user' || b.kind === 'agent') ? b : { kind: 'user' });
  async function recordEntry({ entryId, nonce, kind = 'apt', by, why = null, label = null, deb = null, source = null, staged = null, icon = null, keep = false }) {
    if (!A.ENTRY_ID_RE.test(String(entryId || ''))) throw named('bad-request', 'bad entry id');
    const run0 = await runOf(entryId, nonce);
    const entry = [...await sys.entries(), ...await rootEntries()].find((e) => e.id === entryId); // design 019: a move in flight holds the id in both layers — the run went into the app system
    if (!entry) throw named('not_recorded', `the install ran but root did not record ${entryId} in ${path.join(sysDir, 'entries')} — check the log`);
    if (entry.layer === 'sys') await sys.afterRun();
    catalog.sig = null;
    const rows = (await refreshCatalog()).filter((r) => r.app === entryId);
    const { manifest, corrupt } = await readManifest();
    const prev = manifest.entries.find((e) => e.id === entryId);
    if (keep && prev) { by = prev.by; why = why || prev.why || null; label = label || prev.label || null; } // design 019 M2: a moved app keeps who asked and why
    let m = A.withEntry(manifest, { id: entryId, kind: K.rootRowOf(kind).id, packages: entry.packages, source: K.rootRowOf(kind).recordSource || (source || null), addedAt: (prev && prev.addedAt) || now(), by: byOf(by), approvedAt: now(), rows, services: run0.services.map((s) => s.unit), ...(entry.layer === 'sys' ? { layer: 'sys' } : {}), ...(why ? { why } : {}), ...(label ? { label } : {}), ...(K.rootRowOf(kind).fileBound && deb ? { deb } : {}) });
    m = A.withPins({ ...m, resolved: { ...m.resolved, ...(run0.debs.length ? { debs: run0.debs } : {}), baseSha: run0.base || m.resolved.baseSha, at: now() } }, run0.pins);
    await writeManifest(m, { corrupt });
    if (staged || icon) await unstage({ names: [staged, icon] }); // design 009: root keeps its own copy in debs/ — the staged one goes at once
    await reconcile();
    return { entry: m.entries.find((e) => e.id === entryId), rows, run: { added: run0.delta.added.length, desktops: run0.desktops.length, services: run0.services, missing: run0.missing, ...(entry.layer === 'sys' ? { layer: 'sys', exports: (entry.bins || []).length + entry.desktops.length } : {}) } };
  }
  async function recordRemove({ entryId, nonce }) {
    const run0 = await runOf(entryId, nonce);
    await sys.afterRun();
    catalog.sig = null; await refreshCatalog();
    const { manifest, corrupt } = await readManifest();
    let m = A.withoutEntry(manifest, entryId);
    m = A.withPins({ ...m, resolved: { ...m.resolved, debs: run0.debs, at: now() } }, run0.pins);
    await writeManifest(m, { corrupt });
    await reconcile();
    return { removed: entryId, run: { removed: run0.delta.removed.length, kept: run0.kept } };
  }
  async function recordRefresh({ nonce, id = 'refresh', mode = 'refresh' }) {
    const run0 = await runOf(id, nonce);
    await sys.afterRun();
    if (id === SYS.SYS_RUN_ID) { // Layer 1: the app system's own run (create / repair / rebase / rollback / drop-prev)
      const st = await writeState({ sys: { at: now(), mode, ok: run0.ok, partial: run0.partial, entries: run0.entries, missing: run0.missing.slice(0, 50) } });
      const rc = await reconcile(); // design 019 M1: after Rebase / Roll back / Repair the index follows the userland
      catalog.sig = null; await refreshCatalog();
      return { state: rc.dropped && rc.dropped.length ? await readState() : st, run: { ok: run0.ok, partial: run0.partial, entries: run0.entries, missing: run0.missing, gone: rc.dropped || [], indexed: rc.indexed || [], collisions: rc.collisions || [] } };
    }
    const { manifest, corrupt } = await readManifest();
    if (run0.debs.length || run0.base || Object.keys(run0.pins).length) await writeManifest(A.withPins({ ...manifest, generation: manifest.generation + 1, resolved: { ...manifest.resolved, ...(run0.debs.length ? { debs: run0.debs } : {}), baseSha: run0.base || manifest.resolved.baseSha, at: now() } }, run0.pins), { corrupt });
    const patch = id === 'replay' ? { replay: { at: now(), mode, ok: run0.ok, partial: run0.partial, entries: run0.entries, missing: run0.missing.slice(0, 50) } } : { refreshedAt: now(), updates: { count: 0, list: [], at: now() } };
    const st = await writeState(patch);
    catalog.sig = null; await refreshCatalog();
    return { state: st, run: { ok: run0.ok, partial: run0.partial, entries: run0.entries, upgraded: run0.delta.added.length, missing: run0.missing } };
  }
  /** design 019 M2: the second step of a move ran — root's host record is gone; the index follows (the entry is 'sys'). */
  async function recordForget({ entryId, nonce }) {
    const run0 = await runOf(entryId, nonce);
    if (!run0.ok) throw named('forget_failed', `the host record of ${entryId} was not dropped — it is still put back at every rebuild`);
    const { manifest, corrupt } = await readManifest();
    if (run0.debs.length || run0.gc.length) await writeManifest({ ...manifest, resolved: { ...manifest.resolved, debs: run0.debs, at: now() } }, { corrupt });
    const rc = await reconcile();
    catalog.sig = null; await refreshCatalog();
    return { forgot: entryId, run: { gc: run0.gc }, relayered: rc.relayered || [] };
  }
  /** design 019 M2/M3 — the host entry holding exactly these packages (an install INTO the app system of it is its move),
   *  else the host entries it merely overlaps (named, allowed). */
  async function twinOf(packages, manifest) {
    const hostE = await rootEntries();
    const twin = hostE.find((e) => setKey(e.packages) === setKey(packages)) || null;
    if (twin) { const me = manifest.entries.find((x) => x.id === twin.id); return { twin: { id: twin.id, label: (me && me.label) || twin.id }, overlap: [] }; }
    return { twin: null, overlap: hostE.flatMap((e) => e.packages.filter((x) => packages.includes(x)).map((x) => ({ package: x, entry: e.id }))).slice(0, 32) };
  }
  /** A plan INTO the app system that is a move says so and carries its second step (`forgets`: the host record dropped
   *  after the sys install recorded it — src/server/apps-engine.js runs it); an overlap is named. */
  function moveTail(r, tw) {
    const pl = r.plan;
    if (!pl || !pl.ok) return r;
    if (tw.twin) return { ...r, plan: { ...pl, forgets: tw.twin.id, moves: [tw.twin], commands: [...(pl.commands || []), ...A.appCommands({ mode: 'forget', entryLabel: tw.twin.label })] } };
    return tw.overlap.length ? { ...r, plan: { ...pl, overlap: tw.overlap } } : r;
  }
  /** design 019 M2 — MOVE the host apps into the app system (the USER's click; one transaction per entry: the sys install,
   *  then `forget`), and `forget` itself (only once the app system holds the same packages: another entry is refused). */
  async function movePlan(kind, p, { manifest, f, nonce, canRun, sysV }) {
    const hostE = await rootEntries(), sysE = await sys.entries();
    const has = (e) => sysE.some((x) => setKey(x.packages) === setKey(e.packages));
    const labelOf = (id) => { const me = manifest.entries.find((x) => x.id === id); return (me && me.label) || id; };
    if (kind === 'forget') {
      const e = hostE.find((x) => x.id === p.entryId);
      if (!e) return { ok: false, code: 'not_found', error: `no app ${JSON.stringify(String(p.entryId || '').slice(0, 40))} is put back at every rebuild on this machine`, kind };
      if (!has(e)) return { ok: false, code: 'not_moved', error: `${e.id} is not in the app system — its host record stays (nothing is forgotten before the move recorded it)`, kind };
      return { ok: true, code: canRun ? null : 'no_sudo', canRun, kind, mode: 'forget', entryId: e.id, source: 'apt', packages: e.packages, closure: [], closureKey: `forget ${e.id}`, commands: A.appCommands({ mode: 'forget', entryLabel: labelOf(e.id) }), argv: A.appArgv({ mode: 'forget', appsDir, id: e.id, nonce, args: [], root: f.root }), label: labelOf(e.id) };
    }
    if (!(sysV && sysV.usable)) return { ok: false, code: 'no_app_system', error: 'there is no app system on this machine to move the apps into', kind };
    const want = Array.isArray(p.entryIds) ? new Set(p.entryIds.map(String)) : null;
    const list = hostE.filter((e) => e.packages.length && (!want || want.has(e.id)));
    if (!list.length) return { ok: false, code: 'nothing', error: 'no app on this machine is reinstalled at every rebuild — nothing to move', kind };
    const entries = [];
    for (const e of list) {
      const me = manifest.entries.find((x) => x.id === e.id);
      const deb = !!(me && (K.kindRow(me.kind) || {}).fileBound && me.deb);
      let request = { kind: 'apt', packages: e.packages }, refused = null;
      if (deb && !has(e)) {
        const c = await sys.cachedDeb(path.join(appsDir, 'debs'), me.deb.package, me.deb.sha256, { hash: sha256File });
        if (c.ok) request = { kind: 'deb', debPath: c.file, sha256: me.deb.sha256 }; else refused = { code: c.code, error: c.error };
      }
      entries.push({ id: e.id, label: labelOf(e.id), kind: deb ? 'deb' : 'apt', packages: e.packages, recorded: has(e), request, ...(refused ? { refused } : {}) });
    }
    const cmds = entries.flatMap((x) => (x.refused ? [`# ${x.label}: ${x.refused.error}`] : [...(x.recorded ? [`# ${x.label} is already in the app system`] : SYS.sysCommands({ mode: K.kindRow(x.kind).mode, packages: x.packages, deb: K.kindRow(x.kind).fileBound ? (manifest.entries.find((m0) => m0.id === x.id) || {}).deb : null })), ...A.appCommands({ mode: 'forget', entryLabel: x.label })]));
    return { ok: true, code: canRun ? null : 'no_sudo', canRun, kind, mode: 'move', entryId: 'move', source: 'apt', packages: [...new Set(entries.flatMap((x) => x.packages))], entries, closure: [], closureKey: entries.map((x) => `${x.id}=${x.packages.join(',')}${x.recorded ? '+' : ''}${x.refused ? '!' : ''}`).join(' '), commands: cmds, label: 'move' };
  }
  /** A USER-LEVEL tool (`vibespace-app add --kind uv|npm`, design §3.4) installed by the agent as the user — in HOME,
   *  nothing to replay: recorded for the record (who, why), never through root. (An AppImage is proposed: design 009.) */
  async function recordUserKind({ kind, name, why = null, by }) {
    if (!['uv-tool', 'npm'].includes(kind)) throw named('bad-request', 'kind must be uv-tool / npm (an AppImage is proposed: vibespace-app install --file)');
    if (typeof name !== 'string' || !/^[@a-z0-9][a-z0-9@/._+-]{0,120}$/i.test(name)) throw named('bad_name', 'not a tool name');
    const { manifest, corrupt } = await readManifest();
    const prev = manifest.entries.find((e) => e.kind === kind && e.label === name);
    const id = prev ? prev.id : A.entryIdFor(name.replace(/^@/, '').replace(/\//g, '-'), manifest.entries.map((e) => e.id));
    const m = A.withEntry(manifest, { id, kind, packages: [], label: name, addedAt: (prev && prev.addedAt) || now(), by: byOf(by), approvedAt: null, rows: [], services: [], ...(why ? { why } : {}) });
    await writeManifest(m, { corrupt });
    return { entry: m.entries.find((e) => e.id === id) };
  }
  async function recordSource({ sourceId, nonce, source, by, remove = false }) {
    const run0 = await runOf(sourceId, nonce);
    const { manifest, corrupt } = await readManifest();
    const m = A.withPins(remove ? A.withoutSource(manifest, sourceId) : A.withSource(manifest, { ...source, id: sourceId, addedAt: now(), approvedAt: now(), by: byOf(by) }), run0.pins);
    await writeManifest(m, { corrupt });
    return { source: remove ? null : m.sources.find((s) => s.id === sourceId), removed: remove ? sourceId : null };
  }

  return { sys, appsDir, sysDir, stagingDir, manifestFile, stateFile, listsRoot, facts, plan, status, fetchInstaller, unstage, installAppImage, removeHome, appImageInfo, readManifest, writeManifest, readState, writeState, recordEntry, recordRemove, recordRefresh, recordSource, recordUserKind, recordForget, reconcile, refreshCatalog, catalogRows, iconFile, rootEntries, dpkgNow, aptOpts, slotState };
}

const bad = (error) => ({ ok: false, code: 'bad-request', error });
/**
 * ONE app op on a machine's `apps` handle (desktop-serve's `ds.apps`). Every failure `{ok:false, code, error}` — never
 * a throw across the wire. Shapes:
 *   app-status      {}                                              → {ok, status}
 *   app-plan        {kind, packages?, debPath?, source?, entryId?, sourceId?, query?, rung?}  → {ok, plan, facts, install} | {ok, results} (search)
 *   app-install     {entryId, nonce, kind?, by, why?, label?, deb?, source?, staged?, icon?}  → {ok, entry, rows, run}   (after the slot ran)
 *                   {kind: uv-tool|npm, name, why, by}              → {ok, entry}   (a user-level tool — no slot, no root)
 *                   {kind: 'appimage', staged, sha256, entryId, by, why?, label?, from?, icon?}  → {ok, entry, rows, run}  (unpacked as the user)
 *   app-fetch       {url} | {file}                                  → {ok, staged, sha256, size, kind, hosts, url?, file?}
 *   app-unstage     {names?: [staged…], keep?: [staged…]}           → {ok, removed}
 *                   {sourceId, nonce, source, by} (kind 'source')  → {ok, source}
 *   app-remove      {entryId, nonce} | {sourceId, nonce, kind:'source'} | {entryId, home: true}  → {ok, removed, run?}
 *   app-refresh     {nonce, id: 'refresh'|'replay'|'sysroot', mode}  → {ok, state, run}   ('sysroot' = an app-system run, Layer 1)
 *   app-adopt-drift {entryId, nonce, by}                            → {ok, entry, rows, run}
 *   app-forget      {entryId, nonce}                                → {ok, forgot, run, relayered}   (a move's second step ran)
 */
async function runAppOp(apps, action, params = {}) {
  const op = String(action || '');
  if (!APP_OPS.includes(op)) return bad(`unknown app op ${JSON.stringify(op)} — one of ${APP_OPS.join(', ')}`);
  if (!apps || typeof apps.plan !== 'function') return { ok: false, code: 'host_unavailable', error: 'the apps machine half is not installed on this machine' };
  const p = params && typeof params === 'object' ? params : {};
  const nonceOk = () => A.NONCE_RE.test(String(p.nonce || ''));
  try {
    if (op === 'app-status') return { ok: true, status: await apps.status() };
    if (op === 'app-plan') return { ok: true, ...(await apps.plan(p)) };
    if (op === 'app-fetch') return { ok: true, ...(await apps.fetchInstaller(p)) };
    if (op === 'app-unstage') return { ok: true, ...(await apps.unstage(p)) };
    if (op === 'app-install' && (K.kindRow(p.kind) || {}).unpacked) return { ok: true, ...(await apps.installAppImage(p)) }; // no slot, no root: unpacked as the user
    if (op === 'app-remove' && p.home === true) return { ok: true, ...(await apps.removeHome({ entryId: p.entryId })) };
    if (op === 'app-install' && (K.kindRow(p.kind) || {}).addArgv) return { ok: true, ...(await apps.recordUserKind({ kind: p.kind, name: p.name, why: p.why, by: p.by })) }; // a user-level tool: no slot ran, nothing to key
    if (!nonceOk()) return bad(`${op} needs the run's nonce`);
    if (op === 'app-install') {
      if (p.kind === 'source') return { ok: true, ...(await apps.recordSource({ sourceId: p.sourceId, nonce: p.nonce, source: p.source, by: p.by })) };
      return { ok: true, ...(await apps.recordEntry({ entryId: p.entryId, nonce: p.nonce, kind: p.kind, by: p.by, why: p.why, label: p.label, deb: p.deb, source: p.source, staged: p.staged, icon: p.icon, keep: p.keep === true })) };
    }
    if (op === 'app-forget') return { ok: true, ...(await apps.recordForget({ entryId: p.entryId, nonce: p.nonce })) }; // design 019 M2: a move's second step ran
    if (op === 'app-adopt-drift') return { ok: true, ...(await apps.recordEntry({ entryId: p.entryId, nonce: p.nonce, kind: 'apt', by: p.by, why: p.why || 'installed outside VibeSpace, adopted', label: p.label })) };
    if (op === 'app-remove') {
      if (p.kind === 'source') return { ok: true, ...(await apps.recordSource({ sourceId: p.sourceId, nonce: p.nonce, remove: true })) };
      return { ok: true, ...(await apps.recordRemove({ entryId: p.entryId, nonce: p.nonce })) };
    }
    // app-refresh
    return { ok: true, ...(await apps.recordRefresh({ nonce: p.nonce, id: p.id === 'replay' ? 'replay' : p.id === SYS.SYS_RUN_ID ? SYS.SYS_RUN_ID : 'refresh', mode: String(p.mode || 'refresh') })) };
  } catch (e) {
    return { ok: false, code: (e && e.code) || 'op_failed', error: String((e && e.message) || e) };
  }
}

module.exports = { create, runAppOp, APP_OPS, PLAN_KINDS, STAGED_RE, keyFingerprints, dearmor, fetchHttps, readHashed, MANIFEST_FILE, STATE_FILE, LISTS_TTL_MS };
