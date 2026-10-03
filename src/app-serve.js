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

const APP_OPS = Object.freeze(['app-status', 'app-plan', 'app-install', 'app-remove', 'app-refresh', 'app-adopt-drift']);
const PLAN_KINDS = Object.freeze(['search', 'apt', 'deb', 'source', 'source-remove', 'remove', 'refresh', 'adopt', 'replay']);
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
/** writeJsonAtomic (tmp + rename), mode 0600 — the index is the user's. */
async function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  await fsp.rename(tmp, file);
}
/** A bounded child: never throws; `{code, stdout, stderr, timedOut}`. */
function run(cmd, args, { env, timeout = SIM_MS, maxBuffer = 32 * 1024 * 1024, cwd } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = execFile(cmd, args, { env: { ...(env || process.env), LC_ALL: 'C' }, timeout, maxBuffer, encoding: 'utf8', cwd }, (err, stdout, stderr) => {
        resolve({ code: err ? (typeof err.code === 'number' ? err.code : (err.killed ? 124 : 127)) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), timedOut: !!(err && err.killed), error: err && typeof err.code !== 'number' ? String(err.message || err) : null });
      });
    } catch (e) { resolve({ code: 127, stdout: '', stderr: String(e.message || e), timedOut: false, error: String(e.message || e) }); }
    void child;
  });
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
 */
function create({ home = os.homedir(), stateDir, env = () => process.env, log = console, now = Date.now, binOnPath = null, installState = null,
  dpkgStatus = '/var/lib/dpkg/status', markerDir = A.MARKER_DIR, systemLists = '/var/lib/apt/lists', osRelease = '/etc/os-release', isRoot = null, runner = run } = {}) {
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
      if (!st.isFile() || st.uid !== 0 || (st.mode & 0o022) || st.size > max) return null;
      const d = await fsp.lstat(path.dirname(file));
      if (!d.isDirectory() || d.uid !== 0 || (d.mode & 0o022)) return null;
      return await fsp.readFile(file, 'utf8');
    } catch { return null; }
  }
  async function rootDirOk(dir) { try { const d = await fsp.lstat(dir); return d.isDirectory() && d.uid === 0 && !(d.mode & 0o022); } catch { return false; } }

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
  async function entryIdFor(packages, manifest, { kind = 'apt', asked = null } = {}) {
    const key = packages.join(' ');
    const rootE = await rootEntries();
    const rootBy = new Map(rootE.map((e) => [e.id, e.packages.join(' ')]));
    const fits = (id) => A.ENTRY_ID_RE.test(String(id || '')) && (!rootBy.has(id) || rootBy.get(id) === key);
    const mine = rootE.find((e) => e.packages.join(' ') === key);
    if (mine) return mine.id;
    if (asked && fits(asked)) return asked;
    const idx = manifest.entries.find((e) => (kind === 'deb' ? e.kind === 'deb' && e.deb && e.deb.package === packages[0] : e.kind === 'apt' && e.packages.join(' ') === key) && fits(e.id));
    if (idx) return idx.id;
    return A.entryIdFor(packages[0], [...rootBy.keys(), ...manifest.entries.map((e) => e.id)]);
  }
  /** The package sources root holds (sys/sources/<id>.sources, root-owned) — their names are taken. */
  async function rootSourceIds() {
    const dir = path.join(sysDir, 'sources');
    if (!(await rootDirOk(sysDir)) || !(await rootDirOk(dir))) return [];
    try { return (await fsp.readdir(dir)).filter((n) => /^[a-z0-9][a-z0-9-]{0,39}\.sources$/.test(n)).map((n) => n.slice(0, -8)); } catch { return []; }
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
    if (sig === catalog.sig) return catalog.rows;
    const rows = [];
    for (const e of await rootEntries()) rows.push(...await rowsFor(e));
    catalog = { rows, sig, at: now() };
    return rows;
  }
  /** The rows as desktop-serve's registry() last saw them (refreshCatalog keeps them current). */
  function catalogRows() { return catalog.rows.map((r) => ({ ...r, args: [...r.args] })); }
  /** The icon file a row may show → {file, type} | null: a PNG / SVG under /usr/share/{icons,pixmaps}, a regular file. */
  async function iconFile(rowId) {
    const row = catalog.rows.find((r) => r.id === rowId);
    if (!row || !row.icon) return null;
    for (const c of A.iconCandidates(row.icon)) {
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
  async function status() {
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
    return {
      appsDir, manifest, manifestError: error, state, rows, facts: await facts(),
      // `uncached`: an entry's own packages with no saved .deb and not in the image's base — the replay can never put them
      // back (an app adopted from a .deb that exists in no archive); the row says so (verify-r1 F6)
      entries: entries.map((e) => ({ id: e.id, packages: e.packages, rows: rows.filter((r) => r.app === e.id).map((r) => r.id), indexed: manifest.entries.some((m) => m.id === e.id), uncached: e.packages.filter((p) => !cached.has(p) && !baseSet.has(p)) })),
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
    const ret = (pl) => ({ plan: { ...pl, nonce }, facts: f, install });
    if (kind === 'search') {
      const words = A.searchWords(p.query);
      if (!words) throw named('bad-request', 'search for plain words (letters, digits, + . -)');
      if (!f.apt) return { results: [], facts: f, install, code: 'no_apt' };
      const opts = await aptOpts();
      const r = await runner('apt-cache', [...opts, 'search', '--names-only', ...words], { env: env(), timeout: 30000 });
      return { results: A.parseSearch(r.stdout, 60), facts: f, install };
    }
    if (!f.apt) return ret({ ok: false, code: 'no_apt', error: `${f.prettyName || 'this machine'} has no apt-get — VibeSpace installs apps with apt only`, kind });
    if (kind === 'apt' || kind === 'adopt') {
      const packages = (Array.isArray(p.packages) ? p.packages : String(p.packages || '').split(/[\s,]+/)).map(String).filter(Boolean).slice(0, 32);
      const bad = packages.find((x) => !A.PKG_RE.test(x));
      if (!packages.length || bad !== undefined) return ret({ ok: false, code: 'bad_name', error: bad !== undefined ? `${JSON.stringify(String(bad).slice(0, 64))} is not a Debian package name` : 'no package named', kind, packages });
      const entryId = await entryIdFor(packages, manifest, { kind: 'apt', asked: p.entryId });
      if (kind === 'adopt') {
        const now0 = await dpkgNow();
        const have = new Set((now0.list || []).map((x) => x.package));
        const missing = packages.filter((x) => !have.has(x));
        if (missing.length) return ret({ ok: false, code: 'not_found', error: `${missing.join(', ')} is not installed here — nothing to adopt`, kind, packages });
        return ret({ ok: true, code: canRun ? null : 'no_sudo', error: canRun ? null : 'this machine has no passwordless sudo — run the commands below yourself', canRun, kind, mode: 'adopt', packages, entryId, source: 'apt', closure: [], closureKey: packages.slice().sort().join(' '), commands: A.appCommands({ mode: 'adopt', packages }), argv: A.appArgv({ mode: 'adopt', appsDir, id: entryId, nonce, args: packages, root: f.root }), label: label0(packages) });
      }
      const opts = await aptOpts();
      const sim = await runner('apt-get', [...opts, '-s', 'install', ...packages], { env: env() });
      const uris = await runner('apt-get', [...opts, '--print-uris', '-y', 'install', ...packages], { env: env() });
      const pl = A.parsePlan(both(sim), both(uris), { requested: packages, facts: f, kind: 'apt' });
      if (!pl.ok) return ret(pl);
      const recorded = (await rootEntries()).some((e) => e.packages.join(' ') === packages.join(' ')); // root keeps exactly these already (an agent's "nothing to install" proposal is refused by the hub)
      return ret({ ...pl, mode: 'install', entryId, recorded, source: 'apt', commands: A.appCommands({ mode: 'install', packages }), argv: A.appArgv({ mode: 'install', appsDir, id: entryId, nonce, args: packages, root: f.root }), label: label0(packages) });
    }
    if (kind === 'deb') {
      const file = String(p.debPath || '');
      if (!path.isAbsolute(file) || !/\.deb$/.test(file)) return ret({ ok: false, code: 'bad_name', error: 'name a .deb file by its absolute path on this machine', kind });
      let st;
      try { st = await fsp.stat(file); } catch (e) { return ret({ ok: false, code: 'not_found', error: `${file} cannot be read on this machine (${e.code === 'ENOENT' ? 'no such file' : e.message})`, kind }); }
      if (!st.isFile() || st.size > DEB_MAX) return ret({ ok: false, code: 'bad_name', error: `${file} is not a regular file under ${A.fmtBytes(DEB_MAX)}`, kind });
      const staged = await stage(file, 'deb');
      const sha256 = await sha256File(staged);
      const info = await runner('dpkg-deb', ['-I', staged], { env: env(), timeout: 30000 });
      const ctl = await runner('dpkg-deb', ['-f', staged, 'Package', 'Version', 'Architecture', 'Maintainer'], { env: env(), timeout: 30000 });
      const fields = {};
      for (const l of ctl.stdout.split('\n')) { const m = /^([A-Za-z-]+): (.*)$/.exec(l); if (m) fields[m[1]] = m[2]; }
      if (info.code !== 0 || !A.PKG_RE.test(fields.Package || '')) { await fsp.rm(staged, { force: true }); return ret({ ok: false, code: 'bad_name', error: `${path.basename(file)} is not a Debian package (dpkg-deb cannot read it)`, kind }); }
      const scripts = ['preinst', 'postinst', 'prerm', 'postrm', 'config'].filter((x) => new RegExp(`\\blines\\s+\\*?\\s*${x}\\b`).test(info.stdout)); // dpkg-deb -I's control-archive listing: "<n> bytes, <n> lines  *  postinst  #!/bin/sh"
      const opts = await aptOpts();
      const sim = await runner('apt-get', [...opts, '-s', 'install', staged], { env: env() });
      const uris = await runner('apt-get', [...opts, '--print-uris', '-y', 'install', staged], { env: env() });
      const pl = A.parsePlan(both(sim), both(uris), { requested: [fields.Package], facts: f, kind: 'deb' });
      const deb = { package: fields.Package, version: fields.Version || null, arch: fields.Architecture || null, sha256, size: st.size, name: path.basename(file), maintainer: (fields.Maintainer || '').slice(0, 120), scripts };
      if (!pl.ok) { await fsp.rm(staged, { force: true }); return ret({ ...pl, deb }); }
      const entryId = await entryIdFor([deb.package], manifest, { kind: 'deb' });
      return ret({ ...pl, mode: 'deb', entryId, source: 'local-file', deb, staged, packages: [deb.package], commands: A.appCommands({ mode: 'deb', deb }), argv: A.appArgv({ mode: 'deb', appsDir, id: entryId, nonce, args: [staged, sha256], root: f.root }), label: deb.package });
    }
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
      const entries = await rootEntries();
      const e = entries.find((x) => x.id === p.entryId);
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
      let updates = [];
      if (pk.length) {
        const sim = await runner('apt-get', [...(await aptOpts()), '-s', 'install', '--only-upgrade', ...pk], { env: env() });
        updates = A.updatesOf(both(sim), pk);
      }
      await writeState({ updates: { count: updates.length, list: updates.slice(0, 100), at: now() } });
      return ret({ ok: true, code: canRun ? null : 'no_sudo', canRun, kind, mode: 'refresh', entryId: 'refresh', source: 'apt', packages: pk, updates, closure: [], closureKey: updates.map((u) => `${u.package}=${u.to}`).sort().join(' '), commands: A.appCommands({ mode: 'refresh', packages: pk }), argv: A.appArgv({ mode: 'refresh', appsDir, id: 'refresh', nonce, args: [], root: f.root }), label: 'refresh' });
    }
    throw named('bad-request', `plan kind ${kind} is not implemented`);
  }

  // ── records (after the slot ran) ──
  async function runOf(id, nonce) {
    let text = '';
    try {
      const file = path.join(stateDir, M.INSTALL_FILES.log);
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
  async function recordEntry({ entryId, nonce, kind = 'apt', by, why = null, label = null, deb = null, source = null }) {
    if (!A.ENTRY_ID_RE.test(String(entryId || ''))) throw named('bad-request', 'bad entry id');
    const run0 = await runOf(entryId, nonce);
    const entry = (await rootEntries()).find((e) => e.id === entryId);
    if (!entry) throw named('not_recorded', `the install ran but root did not record ${entryId} in ${path.join(sysDir, 'entries')} — check the log`);
    catalog.sig = null;
    const rows = (await refreshCatalog()).filter((r) => r.app === entryId);
    const { manifest, corrupt } = await readManifest();
    const prev = manifest.entries.find((e) => e.id === entryId);
    let m = A.withEntry(manifest, { id: entryId, kind: kind === 'deb' ? 'deb' : 'apt', packages: entry.packages, source: kind === 'deb' ? 'local-file' : (source || null), addedAt: (prev && prev.addedAt) || now(), by: byOf(by), approvedAt: now(), rows, services: run0.services.map((s) => s.unit), ...(why ? { why } : {}), ...(label ? { label } : {}), ...(kind === 'deb' && deb ? { deb } : {}) });
    m = { ...m, resolved: { ...m.resolved, ...(run0.debs.length ? { debs: run0.debs } : {}), baseSha: run0.base || m.resolved.baseSha, at: now() } };
    await writeManifest(m, { corrupt });
    return { entry: m.entries.find((e) => e.id === entryId), rows, run: { added: run0.delta.added.length, desktops: run0.desktops.length, services: run0.services, missing: run0.missing } };
  }
  async function recordRemove({ entryId, nonce }) {
    const run0 = await runOf(entryId, nonce);
    catalog.sig = null; await refreshCatalog();
    const { manifest, corrupt } = await readManifest();
    let m = A.withoutEntry(manifest, entryId);
    m = { ...m, resolved: { ...m.resolved, debs: run0.debs, at: now() } };
    await writeManifest(m, { corrupt });
    return { removed: entryId, run: { removed: run0.delta.removed.length, kept: run0.kept } };
  }
  async function recordRefresh({ nonce, id = 'refresh', mode = 'refresh' }) {
    const run0 = await runOf(id, nonce);
    const { manifest, corrupt } = await readManifest();
    if (run0.debs.length || run0.base) await writeManifest({ ...manifest, generation: manifest.generation + 1, resolved: { ...manifest.resolved, ...(run0.debs.length ? { debs: run0.debs } : {}), baseSha: run0.base || manifest.resolved.baseSha, at: now() } }, { corrupt });
    const patch = id === 'replay' ? { replay: { at: now(), mode, ok: run0.ok, partial: run0.partial, entries: run0.entries, missing: run0.missing.slice(0, 50) } } : { refreshedAt: now(), updates: { count: 0, list: [], at: now() } };
    const st = await writeState(patch);
    catalog.sig = null; await refreshCatalog();
    return { state: st, run: { ok: run0.ok, partial: run0.partial, entries: run0.entries, upgraded: run0.delta.added.length, missing: run0.missing } };
  }
  /** A USER-LEVEL tool (`vibespace-app add --kind uv|npm|appimage`, design §3.4) installed by the agent as the user —
   *  in HOME, nothing to replay: recorded for the record (who, why), never through root. */
  async function recordUserKind({ kind, name, why = null, by }) {
    if (!['uv-tool', 'npm', 'appimage'].includes(kind)) throw named('bad-request', 'kind must be uv-tool / npm / appimage');
    if (typeof name !== 'string' || !/^[@a-z0-9][a-z0-9@/._+-]{0,120}$/i.test(name)) throw named('bad_name', 'not a tool name');
    const { manifest, corrupt } = await readManifest();
    const prev = manifest.entries.find((e) => e.kind === kind && e.label === name);
    const id = prev ? prev.id : A.entryIdFor(name.replace(/^@/, '').replace(/\//g, '-'), manifest.entries.map((e) => e.id));
    const m = A.withEntry(manifest, { id, kind, packages: [], label: name, addedAt: (prev && prev.addedAt) || now(), by: byOf(by), approvedAt: null, rows: [], services: [], ...(why ? { why } : {}) });
    await writeManifest(m, { corrupt });
    return { entry: m.entries.find((e) => e.id === id) };
  }
  async function recordSource({ sourceId, nonce, source, by, remove = false }) {
    await runOf(sourceId, nonce);
    const { manifest, corrupt } = await readManifest();
    const m = remove ? A.withoutSource(manifest, sourceId) : A.withSource(manifest, { ...source, id: sourceId, addedAt: now(), approvedAt: now(), by: byOf(by) });
    await writeManifest(m, { corrupt });
    return { source: remove ? null : m.sources.find((s) => s.id === sourceId), removed: remove ? sourceId : null };
  }

  return { appsDir, sysDir, stagingDir, manifestFile, stateFile, listsRoot, facts, plan, status, readManifest, writeManifest, readState, writeState, recordEntry, recordRemove, recordRefresh, recordSource, recordUserKind, refreshCatalog, catalogRows, iconFile, rootEntries, dpkgNow, aptOpts, slotState };
}

const bad = (error) => ({ ok: false, code: 'bad-request', error });
/**
 * ONE app op on a machine's `apps` handle (desktop-serve's `ds.apps`). Every failure `{ok:false, code, error}` — never
 * a throw across the wire. Shapes:
 *   app-status      {}                                              → {ok, status}
 *   app-plan        {kind, packages?, debPath?, source?, entryId?, sourceId?, query?, rung?}  → {ok, plan, facts, install} | {ok, results} (search)
 *   app-install     {entryId, nonce, kind?, by, why?, label?, deb?, source?}  → {ok, entry, rows, run}   (after the slot ran)
 *                   {kind: uv-tool|npm|appimage, name, why, by}     → {ok, entry}   (a user-level tool — no slot, no root)
 *                   {sourceId, nonce, source, by} (kind 'source')  → {ok, source}
 *   app-remove      {entryId, nonce} | {sourceId, nonce, kind:'source'}      → {ok, removed, run}
 *   app-refresh     {nonce, id: 'refresh'|'replay', mode}           → {ok, state, run}
 *   app-adopt-drift {entryId, nonce, by}                            → {ok, entry, rows, run}
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
    if (op === 'app-install' && ['uv-tool', 'npm', 'appimage'].includes(p.kind)) return { ok: true, ...(await apps.recordUserKind({ kind: p.kind, name: p.name, why: p.why, by: p.by })) }; // a user-level tool: no slot ran, nothing to key
    if (!nonceOk()) return bad(`${op} needs the run's nonce`);
    if (op === 'app-install') {
      if (p.kind === 'source') return { ok: true, ...(await apps.recordSource({ sourceId: p.sourceId, nonce: p.nonce, source: p.source, by: p.by })) };
      return { ok: true, ...(await apps.recordEntry({ entryId: p.entryId, nonce: p.nonce, kind: p.kind, by: p.by, why: p.why, label: p.label, deb: p.deb, source: p.source })) };
    }
    if (op === 'app-adopt-drift') return { ok: true, ...(await apps.recordEntry({ entryId: p.entryId, nonce: p.nonce, kind: 'apt', by: p.by, why: p.why || 'installed outside VibeSpace, adopted', label: p.label })) };
    if (op === 'app-remove') {
      if (p.kind === 'source') return { ok: true, ...(await apps.recordSource({ sourceId: p.sourceId, nonce: p.nonce, remove: true })) };
      return { ok: true, ...(await apps.recordRemove({ entryId: p.entryId, nonce: p.nonce })) };
    }
    // app-refresh
    return { ok: true, ...(await apps.recordRefresh({ nonce: p.nonce, id: p.id === 'replay' ? 'replay' : 'refresh', mode: String(p.mode || 'refresh') })) };
  } catch (e) {
    return { ok: false, code: (e && e.code) || 'op_failed', error: String((e && e.message) || e) };
  }
}

module.exports = { create, runAppOp, APP_OPS, PLAN_KINDS, keyFingerprints, dearmor, fetchHttps, MANIFEST_FILE, STATE_FILE, LISTS_TTL_MS };
