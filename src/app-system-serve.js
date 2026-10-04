'use strict';
/**
 * THE APP SYSTEM — THE MACHINE HALF (Layer 1 of docs/design-app-persistence.zh.md §3.2), SHARED: node builtins + the
 * PURE src/app-system.js + src/app-manifest.js. Held by src/app-serve.js (its `sys`), so it runs where the apps live,
 * reached through the same `app-*` ops; every root step is SYS_SCRIPT in the machine's ONE package slot.
 *
 * As the machine's USER (never root) it reads: the identity (root-owned, canonical — the same rules the helper
 * enforces), root's entries inside the userland (rootfs/var/lib/vibespace/entries), their .desktop files → catalog rows
 * `sys.<entry>` + THE EXPORT TABLE, the shims it writes in ~/.vibespace/sysroot/bin (only its own, versioned), and the
 * plans (simulations against the userland's own apt state, `S.simOpts`).
 * After listen, ONLY when VIBESPACE_APP_SYSTEM is set (the chart's appSystem.enabled — never a bare-metal / systemd
 * install), in children: the helper + sudoers drop-in re-installed (INSTALL_SCRIPT: `visudo -cf` first), then
 * `dpkg --audit` through the helper + the dpkg journal → an interrupted install (the Repair banner).
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const S = require('./app-system.js');
const A = require('./app-manifest.js');

const DESKTOP_MAX = 256 * 1024;
const BOOT_MS = 20000;
const AUDIT_MS = 30000;

function create({ home, env = () => process.env, runner, log = console, now = Date.now, which = () => null, validate = null, helperSrcDir = path.resolve(__dirname, '..', 'deploy', 'sysroot'), tarball = S.MINBASE_TARBALL, platform = process.platform, rootUid = 0 } = {}) {
  if (!home || typeof runner !== 'function') throw new Error('app-system-serve: home and runner are required');
  const base = path.join(home, S.SYSROOT_REL);
  const rootfs = path.join(base, 'rootfs');
  const shimDir = path.join(base, 'bin');
  // a bare-metal / systemd install never keeps an app system: systemd names every process of a unit (INVOCATION_ID) —
  // under it the gate stays shut even with the flag set (no helper, no sudoers file is ever written there)
  const enabled = () => { const e = env() || {}; const v = String(e.VIBESPACE_APP_SYSTEM || ''); return platform === 'linux' && !e.INVOCATION_ID && v !== '' && v !== '0' && v !== 'false'; };
  const myUid = typeof process.getuid === 'function' ? process.getuid() : -1;
  let helper = { installed: null, error: null, at: null };
  let audit = null;
  let bootFlight = null;

  async function lst(p) { try { return await fsp.lstat(p); } catch { return null; } }
  async function rootDir(p) { const st = await lst(p); return !!st && st.isDirectory() && st.uid === rootUid && !(st.mode & 0o002); }
  /** A path INSIDE `dir` that root wrote → the joined path, or null: every component a real entry (a link is refused,
   *  never followed — it would resolve against this machine's /), every directory on the way root's and not writable by
   *  group/others. */
  async function inRoot(dir, rel) {
    const parts = String(rel).split('/').filter(Boolean);
    if (!parts.length || parts.some((c) => c === '.' || c === '..')) return null;
    let p = dir;
    for (let i = 0; i < parts.length; i++) {
      p = path.join(p, parts[i]);
      const st = await lst(p);
      if (!st || st.isSymbolicLink()) return null;
      if (i < parts.length - 1 && !(st.isDirectory() && st.uid === rootUid && !(st.mode & 0o022))) return null;
    }
    return p;
  }
  /** A file root wrote inside the userland (`rel` walked by inRoot): read through ONE descriptor opened without following
   *  a link (O_NOFOLLOW; O_NONBLOCK — a FIFO never blocks) and judged by fstat on that same descriptor: regular,
   *  root-owned, not group/other-writable, bounded. */
  async function rootFile(dir, rel, max) {
    const p = await inRoot(dir, rel);
    if (!p) return null;
    let fh = null;
    try {
      fh = await fsp.open(p, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const st = await fh.stat();
      if (!st.isFile() || st.uid !== rootUid || (st.mode & 0o022) || st.size > max) return null;
      return await fh.readFile('utf8');
    } catch { return null; } finally { if (fh) await fh.close().catch(() => { }); }
  }
  /** Does `abs` exist INSIDE the userland as the app will see it after the chroot: a link is followed only within the
   *  rootfs (an absolute target re-rooted at it, `..` stopping at its top, ≤ 40 links) — nothing outside the rootfs is
   *  ever looked at through one. */
  async function existsIn(abs) {
    let todo = String(abs).split('/').filter(Boolean), cur = [], hops = 0;
    while (todo.length) {
      const c = todo.shift();
      if (c === '.') continue;
      if (c === '..') { cur.pop(); continue; }
      const p = path.join(rootfs, ...cur, c);
      const st = await lst(p);
      if (!st) return false;
      if (st.isSymbolicLink()) {
        if (++hops > 40) return false;
        let t; try { t = await fsp.readlink(p); } catch { return false; }
        if (t.startsWith('/')) cur = [];
        todo = [...t.split('/').filter(Boolean), ...todo];
        continue;
      }
      if (todo.length && !st.isDirectory()) return false;
      cur.push(c);
    }
    return true;
  }
  /** The identity of a userland dir → {identity, error} (error = the helper's refusal by name; both null = none). */
  async function identity(dir = rootfs) {
    if (!(await lst(dir))) return { identity: null, error: null };
    if (!(await rootDir(dir))) return { identity: null, error: 'not-root-owned' };
    let canon = null;
    try { canon = path.join(await fsp.realpath(home), path.relative(home, dir)); } catch { /* none */ }
    if ((await fsp.realpath(dir).catch(() => null)) !== canon) return { identity: null, error: 'not-canonical' };
    const v = S.parseIdentity(await rootFile(dir, 'etc/vibespace-sysroot.json', 4096));
    return v.ok ? { identity: v.identity, error: null } : { identity: null, error: v.code };
  }
  /** root's record of the entries installed into the app system (it travels with the userland). */
  async function entries(dir = rootfs) {
    const d = await inRoot(dir, S.ENTRY_DIR);
    if (!d || !(await rootDir(d))) return [];
    let names = [];
    try { names = await fsp.readdir(d); } catch { return []; }
    const out = [];
    for (const n of names.filter((x) => /^[a-z0-9][a-z0-9-]{0,39}\.list$/.test(x)).sort()) {
      const id = n.slice(0, -5);
      const list = await rootFile(dir, `${S.ENTRY_DIR}/${n}`, 64 * 1024);
      if (list == null) continue;
      const desk = await rootFile(dir, `${S.ENTRY_DIR}/${id}.desktop`, 64 * 1024);
      const bin = await rootFile(dir, `${S.ENTRY_DIR}/${id}.bin`, 64 * 1024);
      out.push({ id, layer: 'sys', packages: list.split('\n').map((l) => l.trim()).filter((l) => A.PKG_RE.test(l)), desktops: (desk || '').split('\n').map((l) => l.trim()).filter(A.desktopPathOk), bins: (bin || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 200) });
    }
    return out;
  }
  /** Which candidate exec paths exist INSIDE the userland (for resolveTarget). */
  async function present(words) {
    const set = new Set();
    for (const w of words) for (const c of (String(w).startsWith('/') ? [String(w)] : S.EXEC_DIRS.map((x) => `${x}/${w}`))) {
      if (c.split('/').includes('..')) continue;
      if (await existsIn(c)) set.add(c);
    }
    return set;
  }
  /** THE ROWS + THE EXPORT TABLE (every entry's .desktop files, primary first — the same order as Layer 0's). */
  async function rows() {
    if (!(await identity()).identity) return { rows: [], exports: [] };
    const out = [], ex = [], taken = new Map();
    for (const e of await entries()) {
      const score = (p) => { const b = path.basename(p, '.desktop'); return e.packages.some((k) => b === k) ? 3 : e.packages.some((k) => b.endsWith('-' + k) || b.endsWith('.' + k)) ? 2 : 1; };
      const parsed = [];
      for (const f of e.desktops.slice().sort((a, b) => score(b) - score(a) || (a < b ? -1 : 1))) {
        const text = await rootFile(rootfs, f, DESKTOP_MAX);
        if (text == null) continue;
        const pkg = e.packages.find((k) => path.basename(f, '.desktop').includes(k)) || e.packages[0] || null;
        const r = A.parseDesktopFile(text, { entry: e.id, path: f, primary: parsed.length === 0, pkg, validate });
        if (r.ok && !parsed.some((x) => x.id === r.row.id)) parsed.push({ ...r.row, app: e.id });
      }
      const sr = S.sysRows(parsed, { shimDir, present: await present(parsed.map((r) => S.execTarget(r).word).filter(Boolean)), taken });
      for (const x of sr.exports) taken.set(x.name, x.target);
      const bx = S.binExports(e.bins, { taken }); // the CLI half: `~/.vibespace/sysroot/bin/hello` (P5)
      for (const x of bx) taken.set(x.name, x.target);
      out.push(...sr.rows.filter((r) => !validate || validate(r).ok)); ex.push(...sr.exports, ...bx);
    }
    return { rows: out, exports: ex };
  }
  /** The shim dir follows the export table (only VibeSpace's own shims are written or removed; an old version is rewritten). */
  async function syncShims(exports) {
    try { await fsp.mkdir(shimDir, { recursive: true, mode: 0o755 }); } catch { return null; }
    const existing = [];
    let names = [];
    try { names = await fsp.readdir(shimDir); } catch { /* none */ }
    for (const n of names) { const st = await lst(path.join(shimDir, n)); if (st && st.isFile() && st.size < 8192 && !n.startsWith('.')) existing.push({ name: n, text: await fsp.readFile(path.join(shimDir, n), 'utf8').catch(() => '') }); }
    const plan = S.shimPlan({ existing, exports });
    for (const w of plan.write) { const tmp = path.join(shimDir, `.${w.name}.vs-tmp`); await fsp.writeFile(tmp, w.text, { mode: 0o755 }); await fsp.chmod(tmp, 0o755); await fsp.rename(tmp, path.join(shimDir, w.name)); }
    for (const n of plan.remove) await fsp.rm(path.join(shimDir, n), { force: true });
    return plan;
  }
  /** THE LAUNCH CHECK of a sys row (the shim dir is user-writable by design): its launcher runs only while it is EXACTLY
   *  the shim VibeSpace writes for the row's target — a regular file (never a link) in a real shim dir, this user's,
   *  not group/other-writable, its bytes = shimText(target) (the template version included). Anything else there is
   *  ignored and reported (once per file + reason), never launched: the row comes back blocked `shim-not-ours`. */
  const reported = new Set();
  function shimWhy(shim, target) {
    if (typeof shim !== 'string' || path.dirname(shim) !== shimDir) return 'not-in-shim-dir';
    let text;
    try {
      const d = fs.lstatSync(shimDir);
      if (!d.isDirectory() || d.uid !== myUid) return 'shim-dir';
      const fd = fs.openSync(shim, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      try {
        const st = fs.fstatSync(fd);
        if (!st.isFile()) return 'not-a-file';
        if (st.uid !== myUid || (st.mode & 0o022)) return 'owner';
        if (st.size > 8192) return 'size';
        text = fs.readFileSync(fd, 'utf8');
      } finally { fs.closeSync(fd); }
    } catch (e) { return e && e.code === 'ELOOP' ? 'a-link' : 'missing'; }
    try { return text === S.shimText(target) ? null : 'content'; } catch { return 'content'; }
  }
  function verifyRow(r) {
    if (!r || r.layer !== 'sys') return r;
    const shim = r.exec === 'xterm' ? (r.args || [])[1] : r.exec;
    const why = shimWhy(shim, r.target);
    if (!why) return r;
    if (!reported.has(`${shim} ${why}`)) { reported.add(`${shim} ${why}`); log.warn?.(`[apps] app system: ${shim} is not VibeSpace's launcher for ${r.target} (${why}) — ignored; ${r.id} is not launched`); }
    return { ...r, blocked: r.blocked || 'shim-not-ours' };
  }
  /** The catalog's app-system rows (+ the shims synced): greyed with the app system's refusal while it is blocked. */
  async function catalog() {
    const { rows: rs, exports } = await rows();
    if (!rs.length && !exports.length) { await syncShims([]).catch(() => null); return []; }
    await syncShims(exports).catch((e) => log.warn?.(`[apps] the app system's launchers could not be written (${e.message})`));
    const id0 = await identity();
    const blocked = !enabled() ? 'not-enabled' : helper.installed === false ? 'no-helper' : null;
    return rs.map((r) => (blocked ? { ...r, blocked } : r)).map((r) => (id0.identity ? r : { ...r, blocked: id0.error || 'no-identity' })).map(verifyRow);
  }
  /** The catalog's signature piece (the entries dir's listing + mtimes, the identity's mtime). */
  async function signature() {
    let sig = `e:${enabled()}|h:${helper.installed}|`;
    const d = path.join(rootfs, S.ENTRY_DIR.slice(1));
    try { for (const n of (await fsp.readdir(d)).sort()) { const st = await lst(path.join(d, n)); sig += `${n}:${st ? st.mtimeMs : 0};`; } } catch { sig += 'none'; }
    const st = await lst(path.join(rootfs, 'etc', 'vibespace-sysroot.json'));
    return sig + `|i:${st ? st.mtimeMs : 0}`;
  }

  // ── after listen: the helper + sudoers, then the audit (children; only with VIBESPACE_APP_SYSTEM) ──
  function boot() { if (!bootFlight) bootFlight = bootNow().catch((e) => { log.warn?.(`[apps] the app system's boot step failed: ${e && e.message}`); }); return bootFlight; }
  async function bootNow() {
    if (!enabled()) return;
    const h = path.join(helperSrcDir, 'vs-sysroot-enter'), s = path.join(helperSrcDir, 'vibespace-sysroot.sudoers');
    if (!(await lst(h)) || !(await lst(s))) { helper = { installed: false, error: `the helper sources are missing in ${helperSrcDir}`, at: now() }; log.warn?.(`[apps] app system: ${helper.error}`); return; }
    const t0 = now();
    const argv = S.installArgv({ helperSrc: h, sudoersSrc: s }); // + this release's digests: root installs only those bytes
    const r = await runner(argv[0], argv.slice(1), { env: env(), timeout: BOOT_MS });
    const ok = r.code === 0 && /^= ok$/m.test(r.stdout || '');
    const refused = /^= refused (\S+)/m.exec(r.stdout || '');
    helper = { installed: ok, error: ok ? null : (refused ? refused[1] : `exit ${r.code}`), at: now() };
    log.log?.(`[apps] app system: helper + sudoers ${ok ? 'installed' : `NOT installed (${helper.error})`} in ${now() - t0} ms`);
    await auditNow();
  }
  /** `--root dpkg --audit` through the helper + the dpkg journal (rootfs/var/lib/dpkg/updates) → an interrupted install. */
  async function auditNow() {
    const id0 = await identity();
    if (!enabled() || !id0.identity || !helper.installed) { audit = null; return audit; }
    const r = await runner('sudo', ['-n', S.HELPER_PATH, '--root', '--', 'dpkg', '--audit'], { env: env(), timeout: AUDIT_MS });
    const v = S.auditVerdict(r);
    let journal = 0;
    try { journal = (await fsp.readdir(path.join(rootfs, 'var', 'lib', 'dpkg', 'updates'))).filter((n) => /^\d+$/.test(n)).length; } catch { /* none */ }
    audit = v ? { ...v, interrupted: v.interrupted || journal > 0, journal } : (journal ? { interrupted: true, packages: [], journal } : null);
    return audit;
  }
  /** After a run of the slot touched the app system: a fresh audit (the shims follow on the next catalog read). */
  async function afterRun() { if (enabled()) await auditNow().catch(() => null); }

  /** THE `appSystem` view (PURE systemView over these readings). The first one after listen waits for the boot step. */
  async function view({ facts = {}, slot = null } = {}) {
    if (enabled()) await boot();
    const id0 = await identity();
    const rungs = { a: !!(await lst(tarball)), b: !!(which('debootstrap') || (await lst('/usr/sbin/debootstrap')) || (await lst('/sbin/debootstrap'))) }; // a user's PATH rarely holds /usr/sbin (the pod's does not)
    const v = S.systemView({ enabled: enabled(), identity: id0.identity, identityError: id0.error, image: { id: facts.distro || null, codename: facts.codename || null, arch: facts.arch || null }, helper, audit: slot && slot.installing ? null : audit, prev: !!(await lst(path.join(base, 'rootfs.prev'))), next: !!(await lst(path.join(base, 'rootfs.next'))), entries: id0.identity ? (await entries()).length : 0, rungs, canRun: !!(facts.root || facts.sudo) });
    return { ...v, helper: { installed: helper.installed, error: helper.error }, shimDir };
  }

  // ── plans ──
  const no = (kind, code, error) => ({ ok: false, code, error, kind, layer: 'sys' });
  /** Layer 0's apt / deb plan, retargeted INTO the app system (its simulations already read the userland — simOpts). */
  function retarget(pl, nonce) {
    if (!pl || !pl.ok || !['install', 'deb'].includes(pl.mode)) return pl;
    const args = pl.mode === 'deb' ? [pl.staged, pl.deb.sha256] : pl.packages;
    return { ...pl, layer: 'sys', commands: S.sysCommands({ mode: pl.mode, packages: pl.packages, deb: pl.deb }), argv: S.sysArgv({ mode: pl.mode, id: pl.entryId, nonce, args }), replaySeconds: 0 };
  }
  async function removePlan(e, { facts: f, nonce, canRun, label = null, runner: run0 = runner, both }) {
    const others = (await entries()).filter((x) => x.id !== e.id).flatMap((x) => x.packages);
    const own = e.packages.filter((x) => !others.includes(x));
    let pl = { ok: true, code: canRun ? null : 'no_sudo', canRun, closure: [], closureKey: '', removes: [], kind: 'remove', packages: [] };
    if (own.length) {
      const sim = await run0('apt-get', [...S.simOpts(rootfs), '-s', 'remove', '--autoremove', ...own], { env: env() });
      pl = A.parsePlan(both(sim), '', { requested: own, facts: { ...f, rootFree: f.homeFree }, kind: 'remove', others });
    }
    if (!pl.ok) return { ...pl, layer: 'sys' };
    return { ...pl, mode: 'remove', layer: 'sys', entryId: e.id, source: 'apt', packages: e.packages, commands: S.sysCommands({ mode: 'remove', packages: own }), argv: S.sysArgv({ mode: 'remove', id: e.id, nonce }), label: label || e.id };
  }
  async function refreshPlan({ nonce, canRun, both }) {
    const sim = await runner('apt-get', [...S.simOpts(rootfs), '-s', 'upgrade'], { env: env() });
    const updates = [];
    for (const m of both(sim).matchAll(/^Inst (\S+) \[([^\]]+)\] \((\S+)/gm)) if (A.PKG_RE.test(m[1].split(':')[0])) updates.push({ package: m[1].split(':')[0], from: m[2], to: m[3], origin: null });
    return { updates, plan: { ok: true, code: canRun ? null : 'no_sudo', canRun, kind: 'refresh', mode: 'refresh', layer: 'sys', entryId: 'refresh', source: 'apt', packages: [], updates, closure: [], closureKey: updates.map((u) => `${u.package}=${u.to}`).sort().join(' '), commands: S.sysCommands({ mode: 'refresh' }), argv: S.sysArgv({ mode: 'refresh', id: 'refresh', nonce }), label: 'refresh' } };
  }
  /** The app system's own requests (the USER's clicks): Set up · Repair · Migrate (rebase) · Roll back · Delete the old one. */
  async function sysPlan(kind, { facts: f, nonce, canRun, view: v }) {
    if (!S.SYS_KINDS.includes(kind)) return no(kind, 'bad-request', `unknown app-system request ${kind}`);
    if (!v || !v.enabled) return no(kind, 'no_app_system', 'this machine keeps no app system (its pod has no mount rights — VIBESPACE_APP_SYSTEM is not set)');
    if (!canRun) return no(kind, 'no_sudo', 'this machine has no passwordless sudo');
    const mode = S.SYS_KIND_MODE[kind];
    const ok = (x) => ({ ok: true, code: null, canRun, kind, mode, layer: 'sys', entryId: S.SYS_RUN_ID, source: 'app-system', packages: [], closure: [], label: 'app system', ...x });
    const ents = v.identity ? await entries() : [];
    if (kind === 'sys-create') {
      if (v.created) return no(kind, 'exists', 'this machine already has an app system');
      if (!v.rung) return no(kind, 'no_rung', 'the image carries neither a minbase tarball nor debootstrap — an app system cannot be created here');
      if (!f.codename) return no(kind, 'no_facts', 'this machine does not name its release (VERSION_CODENAME)');
      return ok({ rung: v.rung, codename: f.codename, closureKey: `create ${v.rung} ${f.codename}`, commands: S.sysCommands({ mode, rung: v.rung, codename: f.codename }), argv: S.sysArgv({ mode, id: S.SYS_RUN_ID, nonce, args: [v.rung, f.codename] }) });
    }
    if (kind === 'repair') {
      if (!v.identity) return no(kind, 'no_app_system', 'this machine has no app system yet');
      return ok({ closureKey: `repair ${(v.auditPackages || []).join(' ')}`, packages: (v.auditPackages || []).slice(), commands: S.sysCommands({ mode }), argv: S.sysArgv({ mode, id: S.SYS_RUN_ID, nonce }) });
    }
    if (kind === 'rebase') {
      if (!v.identity) return no(kind, 'no_app_system', 'this machine has no app system yet');
      if (v.verdict.state === 'ok') return no(kind, 'nothing', 'the app system already matches this machine');
      if (v.prev) return no(kind, 'prev_exists', 'delete the previous app system first (it is kept until you do)');
      if (!v.rung || !f.codename) return no(kind, 'no_rung', 'a new app system cannot be created here');
      const packages = [...new Set(ents.flatMap((e) => e.packages))];
      return ok({ rung: v.rung, codename: f.codename, from: v.identity, packages, closureKey: `rebase ${v.identity.id}/${v.identity.codename}/${v.identity.arch} ${f.distro}/${f.codename}/${f.arch} ${ents.map((e) => e.id).join(' ')}`, commands: S.sysCommands({ mode, packages, rung: v.rung, codename: f.codename }), argv: S.sysArgv({ mode, id: S.SYS_RUN_ID, nonce, args: [v.rung, f.codename] }) });
    }
    if (!v.prev) return no(kind, 'nothing', 'there is no previous app system');
    const prev = await identity(path.join(base, 'rootfs.prev'));
    const word = prev.identity ? `${prev.identity.id} ${prev.identity.codename} ${prev.identity.arch}` : 'unknown';
    return ok({ prev: prev.identity, closureKey: `${mode} ${word}`, commands: S.sysCommands({ mode }), argv: S.sysArgv({ mode, id: S.SYS_RUN_ID, nonce }) });
  }

  return { base, rootfs, shimDir, enabled, identity, entries, rows, catalog, signature, syncShims, inRoot, existsIn, verifyRow, boot, auditNow, afterRun, view, retarget, removePlan, refreshPlan, sysPlan, helperState: () => ({ ...helper }), auditState: () => audit };
}

module.exports = { create };
