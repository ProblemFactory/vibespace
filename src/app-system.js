'use strict';
/**
 * THE APP SYSTEM — THE PURE HALF (Layer 1 of docs/design-app-persistence.zh.md §3.2). Imports nothing; CJS so the hub,
 * the bundle and the device daemon share ONE spelling with the machine half (src/app-system-serve.js).
 *
 * Two userspaces live on a pod with mount rights: the IMAGE's (ephemeral: rebuilt with the pod) and the APP SYSTEM's
 * (persistent: a same-release minbase userland on the home PVC that VibeSpace installs apps into):
 *   ~/.vibespace/sysroot/rootfs/                 root:root 0755 — its own /usr /etc /var/lib/dpkg /var/lib/apt
 *   rootfs/etc/vibespace-sysroot.json            THE IDENTITY {v, id, codename, arch, createdFrom, helperContract, createdAt}
 *   rootfs/var/lib/vibespace/entries/<id>.list   root's record of an entry's top-level packages (+ .desktop = its desktop
 *                                                files, + .deb = the .deb kept in rootfs/var/cache/vibespace) — it travels
 *                                                WITH the userland (a Rebase replays it, a Roll back brings it back)
 *   ~/.vibespace/sysroot/bin/                    user-owned launchers (THE SHIMS) — at the END of PATH: an image binary of
 *                                                the same name wins; a catalog row names its shim by absolute path
 *   rootfs.next/ · rootfs.prev/                  only around a Rebase (rootfs.prev stays until the user deletes it)
 * Entered ONLY through the root-owned helper deploy/sysroot/vs-sysroot-enter (installed at HELPER_PATH after listen,
 * with SUDOERS_TEXT, when VIBESPACE_APP_SYSTEM is set): sudo direct-execs it on the caller's pid, it unshares a private
 * mount namespace, binds /proc /sys /dev /home /tmp, chroots with --userspec and an allowlisted environment.
 *
 * The pieces (each table-tested by scripts/test-app-system.mjs; the real helper only inside a disposable container by
 * scripts/test-app-system-enter.mjs):
 *   · parseIdentity / identityText — the identity file, refused by name (no-identity · bad-identity · contract)
 *   · rebaseVerdict / systemView   — the machine's image vs the identity → ok · rebase (still runs) · blocked (arch)
 *   · sysRows / execTarget / resolveTarget / shimName — catalog rows `sys.<entry>` + THE EXPORT TABLE (one shim per target)
 *   · shimText / shimVersionOf / shimPlan — the shim template (versioned: an old one is rewritten at boot)
 *   · SYS_SCRIPT / sysArgv / sysCommands — THE ONE ROOT SCRIPT of the app system, run by the machine's ONE package slot
 *   · INSTALL_SCRIPT / installArgv / SUDOERS_TEXT — the helper + sudoers drop-in, re-installed after listen
 *   · auditVerdict — `dpkg --audit` → an interrupted install (the Repair banner)
 */
const SYSROOT_REL = '.vibespace/sysroot';
const HELPER_PATH = '/usr/local/libexec/vibespace/vs-sysroot-enter';
const SUDOERS_PATH = '/etc/sudoers.d/~vibespace-sysroot'; // `~` sorts after every user name: read after the user's own drop-in
/** The helper's contract number — written into every identity; the helper refuses an identity of another contract. */
const HELPER_CONTRACT = 1;
const SUDOERS_UID_MARK = '#VS_UID'; // the drop-in's user: INSTALL_SCRIPT writes `#<SUDO_UID>` (a comment until then)
// the boot install's digests of deploy/sysroot (INSTALL_SCRIPT installs only these bytes; test-app-system holds them equal)
const HELPER_SHA256 = '4d41ffd72f8e0bbad45be6a853fb6bdea10a4c3f7f9524e0ee61095522e12b4e';
const SUDOERS_SHA256 = 'fb5e42491eb9a6cf947c30d8b5294156b365907b95c8c8c2d8532970d8e86bbe';
/** The shim template's version — a shim of an older version (or a changed target) is rewritten when the catalog is read. */
const SHIM_VERSION = 1;
const SHIM_MARK = '# vibespace app-system shim v';
const ROW_PREFIX = 'sys.';
const ENTRY_DIR = '/var/lib/vibespace/entries';
const DEB_DIR = '/var/cache/vibespace';
/** rung A: the image bakes a minbase tarball of its own release here (§6 P3 — the private deploy repo builds it). */
const MINBASE_TARBALL = '/usr/share/vibespace/sysroot-minbase.tar.gz';
/** THE ENVIRONMENT ALLOWLIST: what sudo keeps (SUDOERS_TEXT env_keep) = what the helper lets cross into the app (its
 *  loop) — nothing else, never VIBESPACE_SESSION_TOKEN, never the host PATH. test-app-system pins all three equal. */
const ENV_KEEP = Object.freeze(['DISPLAY', 'XAUTHORITY', 'VIBESPACE_DESKTOP_APP', 'LANG', 'LANGUAGE', 'LC_ALL', 'TZ', 'TERM', 'COLORTERM']);
/** `--root` runs ONLY these (apt / dpkg, from the server's slot) — the helper refuses any other command as root. */
const ROOT_COMMANDS = Object.freeze(['apt-get', 'apt-cache', 'apt-mark', 'dpkg', 'dpkg-query']);
const SYS_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
/** Where a bare Exec word is looked up inside the app system (the inner PATH, games included). */
const EXEC_DIRS = Object.freeze(['/usr/local/bin', '/usr/bin', '/bin', '/usr/games', '/usr/local/games', '/usr/local/sbin', '/usr/sbin', '/sbin']);
const SYS_MODES = Object.freeze(['create', 'install', 'deb', 'remove', 'refresh', 'repair', 'rebase', 'rollback', 'drop-prev']);
/** The request kinds of the app system itself — the USER's clicks only (an agent never proposes one; D3). */
const SYS_KINDS = Object.freeze(['sys-create', 'repair', 'rebase', 'rollback', 'sys-drop-prev']);
const SYS_KIND_MODE = Object.freeze({ 'sys-create': 'create', repair: 'repair', rebase: 'rebase', rollback: 'rollback', 'sys-drop-prev': 'drop-prev' });
/** The run id of the app system's own runs (create / repair / rebase / rollback / drop-prev) in the slot's log. */
const SYS_RUN_ID = 'sysroot';
const SAFE_PATH_RE = /^\/[A-Za-z0-9._+\/-]{1,255}$/;
const NONCE_RE = /^[a-z0-9]{8,32}$/;
const ENTRY_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const PKG_RE = /^[a-z0-9][a-z0-9+.-]{1,63}$/;

const SUDOERS_TEXT = '# VibeSpace app system (docs/design-app-persistence.zh.md §3.2) — installed by the server after listen.\n'
  + '# Grants nothing new (the user is already NOPASSWD: ALL): sudo EXECs the helper on the caller\'s pid and keeps the X environment.\n'
  + `Defaults!${HELPER_PATH} !use_pty, !pam_session, !pam_setcred, env_keep += "${ENV_KEEP.join(' ')}"\n`
  + '# Only this user\'s sudo of the helper, NOSETENV (the user\'s own `ALL` rule implies SETENV): a variable on the sudo command\n'
  + '# line (LD_PRELOAD, BASH_ENV, PATH…) is refused unless env_keep names it. The installer writes the server user\'s uid for\n'
  + '# VS_UID; the file is `~vibespace-sysroot` so sudo reads it AFTER every user-named drop-in (byte order; the last match wins).\n'
  + `${SUDOERS_UID_MARK} ALL=(root) NOPASSWD:NOSETENV: ${HELPER_PATH}\n`;

// ── the identity ─────────────────────────────────────────────────────────────────────────────────────────────────
const IDENT = Object.freeze({ id: /^[a-z0-9][a-z0-9.-]{0,31}$/, codename: /^[a-z0-9]{1,32}$/, arch: /^[a-z0-9-]{1,16}$/ });
const FROM_KINDS = Object.freeze(['debootstrap', 'minbase-tarball']);
/** The identity file's text → `{ok, identity}` | `{ok:false, code}` (no-identity · bad-identity · contract). */
function parseIdentity(text) {
  if (text == null || text === '') return { ok: false, code: 'no-identity' };
  let j;
  try { j = JSON.parse(String(text)); } catch { return { ok: false, code: 'bad-identity' }; }
  if (!j || typeof j !== 'object' || j.v !== 1) return { ok: false, code: 'bad-identity' };
  for (const k of Object.keys(IDENT)) if (typeof j[k] !== 'string' || !IDENT[k].test(j[k])) return { ok: false, code: 'bad-identity' };
  if (j.helperContract !== HELPER_CONTRACT) return { ok: false, code: 'contract' };
  return { ok: true, identity: { id: j.id, codename: j.codename, arch: j.arch, createdFrom: FROM_KINDS.includes(j.createdFrom) ? j.createdFrom : null, helperContract: j.helperContract, createdAt: Number.isFinite(j.createdAt) ? j.createdAt : null } };
}
/** The identity line SYS_SCRIPT's mk() writes (the same bytes — test-app-system holds them equal). */
function identityText({ id, codename, arch, createdFrom, createdAt }) {
  return `{"v":1,"id":"${id}","codename":"${codename}","arch":"${arch}","createdFrom":"${createdFrom}","helperContract":${HELPER_CONTRACT},"createdAt":${createdAt}}\n`;
}

// ── the verdicts ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * THE REBASE VERDICT: the app system's identity vs the machine's image `{id, codename, arch}`.
 *   none     no app system
 *   ok       same distribution, same release, same architecture
 *   rebase   another release / distribution — the app system KEEPS RUNNING (X11/GLX are wire protocols, the kernel ABI
 *            is shared); the dialog offers Migrate… (a human click)
 *   blocked  another ARCHITECTURE (another node pool) — nothing of it can run here: refused, Rebase offered
 */
function rebaseVerdict(identity, image) {
  if (!identity) return { state: 'none', why: 'no-identity' };
  if (!image || !image.arch) return { state: 'ok', why: 'image-unknown' };
  if (identity.arch !== image.arch) return { state: 'blocked', why: 'arch' };
  if (image.id && identity.id !== image.id) return { state: 'rebase', why: 'distro' };
  if (image.codename && identity.codename !== image.codename) return { state: 'rebase', why: 'release' };
  return { state: 'ok', why: 'same' };
}
/**
 * THE `appSystem` OBJECT GET /api/apps answers (the dialog's contract: `interrupted` → the Repair banner, `rebase` → the
 * Migrate… line, `canCreate` → Set up…, `canRollback` → Roll back…). PURE over the machine half's readings:
 *   enabled   VIBESPACE_APP_SYSTEM is set (the chart's appSystem.enabled) · identity / identityError — the file's verdict
 *   image     {id, codename, arch} · helper {installed, error} · audit {interrupted, packages} · prev / next — dirs exist
 *   rungs     {a: tarball present, b: debootstrap on PATH} · canRun — root or passwordless sudo
 */
function systemView({ enabled = false, identity = null, identityError = null, image = null, helper = null, audit = null, prev = false, next = false, entries = 0, rungs = {}, canRun = false } = {}) {
  const created = !!identity || !!identityError;
  const verdict = identity ? rebaseVerdict(identity, image) : { state: 'none', why: identityError || 'no-identity' };
  const rung = rungs.a ? 'a' : rungs.b ? 'b' : null;
  let blocked = null;
  if (!enabled) blocked = 'not-enabled';
  else if (identityError) blocked = identityError;
  else if (identity && verdict.state === 'blocked') blocked = verdict.why;
  else if (identity && helper && helper.installed === false) blocked = 'no-helper';
  const out = { enabled: !!enabled, created, usable: !!identity && !blocked, blocked, verdict, identity, image: image || null, entries, rung, canRun: !!canRun, prev: !!prev, next: !!next };
  if (enabled && !created && rung && canRun) out.canCreate = true;
  if (enabled && identity && audit && audit.interrupted) { out.interrupted = true; out.auditPackages = (audit.packages || []).slice(0, 20); }
  if (enabled && identity && (verdict.state === 'rebase' || verdict.state === 'blocked') && rung) out.rebase = true;
  if (enabled && prev) out.canRollback = true;
  return out;
}
/** `dpkg --audit` (run through the helper, after listen, in a child) → an interrupted install? Anything it prints is
 *  a package dpkg left half-configured / half-installed; a refusal of the helper is NOT an interruption (null). */
function auditVerdict({ code = 0, stdout = '', stderr = '' } = {}) {
  if (code === 111 || /^vs-sysroot-enter: /m.test(String(stderr))) return null;
  const text = String(stdout || '').trim();
  if (code !== 0 && !text) return null;
  const packages = [...new Set((text.match(/^ ([a-z0-9][a-z0-9+.-]{1,63})(?=\s|$)/gm) || []).map((s) => s.trim()))];
  return { interrupted: text.length > 0, packages };
}

// ── rows + the export table ─────────────────────────────────────────────────────────────────────────────────────
/** A Layer-0-shaped row (`app.<entry>…`, PURE parseDesktopFile) → its app-system id `sys.<entry>…`. */
function sysRowId(id) { return String(id).replace(/^app\./, ROW_PREFIX); }
/** What a row runs: its Exec word (a Terminal=true row is the image's xterm wrapping it: `xterm -e <word> …`). */
function execTarget(row) {
  const args = Array.isArray(row && row.args) ? row.args : [];
  if (row && row.exec === 'xterm' && args[0] === '-e' && args[1]) return { word: args[1], terminal: true, rest: args.slice(2) };
  return { word: row ? row.exec : null, terminal: false, rest: args };
}
/** An Exec word → its absolute target INSIDE the app system, or null. `present` = the set of paths that exist there
 *  (the machine half lstat's the candidates). Only plain absolute paths are ever a target (the shim quotes nothing). */
function resolveTarget(word, present) {
  const w = String(word || '');
  const has = (p) => (present instanceof Set ? present.has(p) : !!(present && present[p]));
  if (w.startsWith('/')) return SAFE_PATH_RE.test(w) && !w.split('/').includes('..') && has(w) ? w : null;
  if (!/^[A-Za-z0-9._+-]{1,64}$/.test(w) || w === '.' || w === '..') return null;
  for (const d of EXEC_DIRS) if (has(`${d}/${w}`)) return `${d}/${w}`;
  return null;
}
/** The shim's file name for a target: its basename (plain characters), `-2`, `-3`… when another target took it. */
function shimName(target, taken = new Map()) {
  const base = String(target).split('/').pop().replace(/[^A-Za-z0-9._+-]+/g, '-').replace(/^[.-]+/, '').slice(0, 60) || 'app';
  for (let i = 1; i < 100; i++) {
    const n = i === 1 ? base : `${base}-${i}`;
    if (!taken.has(n) || taken.get(n) === target) return n;
  }
  return null;
}
/**
 * THE ROWS AND THE EXPORT TABLE of the app system: Layer-0-shaped rows (one per .desktop file root recorded for an
 * entry, parsed by parseDesktopFile) → `{rows, exports, skipped}`. A row runs its shim by absolute path (never by PATH,
 * so an image binary of the same name never shadows it, and it never shadows one); `exports` = one `{name, target}`
 * per distinct target; a row whose Exec resolves to nothing inside the app system is skipped by name.
 */
function sysRows(rows, { shimDir, present, taken: taken0 = null } = {}) {
  const taken = new Map(taken0 || []);
  const out = [], skipped = [], exports = new Map();
  for (const r of rows || []) {
    const t = execTarget(r);
    const target = resolveTarget(t.word, present);
    if (!target) { skipped.push({ id: sysRowId(r.id), word: String(t.word || '').slice(0, 80) }); continue; }
    const name = shimName(target, taken);
    if (!name) { skipped.push({ id: sysRowId(r.id), word: t.word, why: 'names' }); continue; }
    taken.set(name, target); exports.set(name, target);
    const shim = `${shimDir}/${name}`;
    out.push({ ...r, id: sysRowId(r.id), exec: t.terminal ? 'xterm' : shim, args: t.terminal ? ['-e', shim, ...t.rest] : [...t.rest], layer: 'sys', target });
  }
  return { rows: out, exports: [...exports].map(([name, target]) => ({ name, target })), skipped };
}
/** The CLI half of the export table: each entry's executables (root's `<id>.bin`: /usr/bin, /usr/games…) → one shim per
 *  target not already exported by a row (a name another target holds is skipped — never overwritten). */
function binExports(bins, { taken: taken0 = null } = {}) {
  const taken = new Map(taken0 || []);
  const out = [];
  for (const b of bins || []) {
    if (!SAFE_PATH_RE.test(String(b)) || String(b).split('/').includes('..') || [...taken.values()].includes(b)) continue;
    const name = String(b).split('/').pop();
    if (!/^[A-Za-z0-9._+-]{1,64}$/.test(name) || name.startsWith('.') || (taken.has(name) && taken.get(name) !== b)) continue;
    taken.set(name, b); out.push({ name, target: b });
  }
  return out;
}
/** THE SHIM: the same pid all the way — `exec sudo -n <helper> --cwd "$PWD" -- <target> "$@"` (the keeper's setsid pid
 *  becomes sudo, the helper, unshare, chroot, sh and finally the app: handle, starttime, group kill, PSS unchanged). */
function shimText(target, { helper = HELPER_PATH, version = SHIM_VERSION } = {}) {
  if (!SAFE_PATH_RE.test(String(target))) throw new Error('a shim target is a plain absolute path');
  return `#!/bin/sh\n${SHIM_MARK}${version} — docs/design-app-persistence.zh.md §3.2 (VibeSpace rewrites this file; edits are lost)\nexec sudo -n ${helper} --cwd "$PWD" -- '${target}' "$@"\n`;
}
/** A file's shim version (null = not a shim VibeSpace wrote — never touched). */
function shimVersionOf(text) { const m = new RegExp(`^${SHIM_MARK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)`, 'm').exec(String(text || '')); return m ? Number(m[1]) : null; }
/** The shim dir's plan: `existing` [{name, text}] vs the export table → {write:[{name,text}], remove:[name]} (only OUR
 *  shims are ever removed; a file of the user's is left alone, and a name it holds is not written). */
function shimPlan({ existing = [], exports = [] } = {}) {
  const want = new Map(exports.map((e) => [e.name, shimText(e.target)]));
  const have = new Map(existing.map((e) => [e.name, e.text]));
  const write = [], remove = [];
  for (const [name, text] of want) { const cur = have.get(name); if (cur === text) continue; if (cur != null && shimVersionOf(cur) == null) continue; write.push({ name, text }); }
  for (const [name, text] of have) if (!want.has(name) && shimVersionOf(text) != null) remove.push(name);
  return { write, remove };
}

// ── the root script ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * THE ONE ROOT SCRIPT OF THE APP SYSTEM. Run by the machine's ONE package slot (the same slot as Layer 0's APP_SCRIPT
 * and xpra's install — never two apt runs at once) as `sudo -n sh -c SYS_SCRIPT vs-sys <mode> <id> <nonce> -- <args…>`.
 * Every argument is a POSITION re-checked here before root touches anything; the home is SUDO_UID's passwd entry
 * (never an argument, never the environment). apt / dpkg run INSIDE the app system through the helper (`--root`;
 * `--root --next` = rootfs.next during a Rebase); dpkg-query reads its database from outside (`--admindir`). Its facts
 * are `= …` lines in APP_SCRIPT's grammar (PURE parseRunLog reads both). Exit 0 (done; a Rebase names what the new
 * release lacks, never blocks on it), 125 (refused by name: `= refused <code> …`) or apt's own code.
 *   create  <a|b> <codename> [mirror]   a new userland (rung A: the image's tarball, offline · rung B: debootstrap) —
 *                                        its directory root:root 0755 with setgid cleared BEFORE anything lands in it
 *   install <pkg…> · deb <staged> <sha256> · remove (id) · refresh (apt-get upgrade) · repair (dpkg --configure -a +
 *   apt-get -f install) · rebase <a|b> <codename> [mirror] (rootfs.next ← the entries, then rename) · rollback (swap
 *   rootfs and rootfs.prev) · drop-prev (delete rootfs.prev)
 * Hardening (design §9): root's writes INTO the userland go through rdir / put — the directory checked canonical
 * (`pwd -P`, no link anywhere in the chain) and root's, then written by a relative name from INSIDE it (the checked
 * object is the written one; install + `mv -T` replace a planted link, never follow it); the user-side sources and keys
 * are staged first into root's private $T (stage: the directory held as the cwd, each file read O_NOFOLLOW); the rebase
 * copies read the same way (cpin); a recursive removal is rmchild only — an expected child of the canonical sysroot,
 * a real root-owned directory, removed from inside it with --one-file-system.
 */
const SYS_SCRIPT = [
  "set -eu",
  "export LC_ALL=C DEBIAN_FRONTEND=noninteractive",
  "MODE=${1:-}; ID=${2:-}; NONCE=${3:-}; [ $# -ge 3 ] || { printf '= refused bad-argv\\n'; exit 125; }; shift 3",
  "if [ \"${1:-}\" = -- ]; then shift; fi",
  "say() { printf '= %s\\n' \"$*\"; }",
  "refuse() { say refused \"$@\"; exit 125; }",
  "pkgok() { case $1 in [a-z0-9]?*) ;; *) return 1 ;; esac; case $1 in *[!a-z0-9+.-]*) return 1 ;; esac; [ ${#1} -le 64 ]; }",
  "case $ID in \"\"|-*|*[!a-z0-9-]*) refuse bad-id ;; esac",
  "case $NONCE in \"\"|*[!a-z0-9]*) refuse bad-nonce ;; esac",
  "case $MODE in \"\"|*[!a-z-]*) refuse bad-mode ;; esac",
  "say run \"$ID\" \"$NONCE\" \"$MODE\"",
  "case $MODE in create|install|deb|remove|refresh|repair|rebase|rollback|drop-prev) ;; *) refuse bad-mode ;; esac",
  "case $MODE in",
  "create|rebase) case ${1:-} in a|b) ;; *) refuse bad-rung ;; esac; case ${2:-} in \"\"|*[!a-z0-9]*) refuse bad-codename ;; esac; case ${3:-} in \"\"|https://*|http://*) ;; *) refuse bad-mirror ;; esac; case ${3:-} in *[!A-Za-z0-9._~:/%+-]*) refuse bad-mirror ;; esac ;;",
  "install) [ $# -gt 0 ] || refuse no-packages; for p in \"$@\"; do pkgok \"$p\" || refuse bad-name \"$p\"; done ;;",
  "deb) case ${1:-} in /*/.vibespace/apps/staging/*.deb) ;; *) refuse bad-deb-path ;; esac; case $1 in */../*|*[!A-Za-z0-9._/@+-]*) refuse bad-deb-path ;; esac; case ${2:-} in *[!0-9a-f]*|\"\") refuse bad-sha ;; esac; [ ${#2} -eq 64 ] || refuse bad-sha ;;",
  "esac",
  "[ \"$(id -u)\" = 0 ] || refuse not-root",
  "case ${SUDO_UID:-} in \"\"|*[!0-9]*) refuse no-sudo-uid ;; esac",
  "[ \"$SUDO_UID\" != 0 ] || refuse root-user",
  "PW=$(getent passwd \"$SUDO_UID\") || refuse no-user",
  "UH=$(printf '%s' \"$PW\" | cut -d: -f6); UG=$(printf '%s' \"$PW\" | cut -d: -f4)",
  "case $UH in /*) ;; *) refuse bad-home ;; esac",
  "case $UH in *[!A-Za-z0-9._/@+-]*|*/../*) refuse bad-home ;; esac",
  "S=$UH/.vibespace/sysroot; R=$S/rootfs; P=$S/rootfs.prev; NX=$S/rootfs.next; A=$UH/.vibespace/apps",
  "HP=/usr/local/libexec/vibespace/vs-sysroot-enter",
  "TARBALL=/usr/share/vibespace/sysroot-minbase.tar.gz",
  "[ -d \"$UH/.vibespace\" ] && [ ! -L \"$UH/.vibespace\" ] || refuse no-vibespace-dir",
  "if [ -L \"$S\" ]; then refuse sysroot-is-a-link \"$S\"; fi",
  "[ -d \"$S\" ] || install -d -m 0755 -o \"$SUDO_UID\" -g \"$UG\" \"$S\"",
  "[ \"$(cd \"$S\" && pwd -P)\" = \"$S\" ] || refuse not-canonical \"$S\"",
  "[ -f \"$HP\" ] && [ ! -L \"$HP\" ] && [ \"$(stat -c %u \"$HP\")\" = 0 ] || refuse no-helper \"$HP\"",
  "case $MODE in deb) case $1 in \"$A\"/staging/*) ;; *) refuse bad-deb-path ;; esac ;; esac",
  "T=$(mktemp -d); trap 'rm -rf \"$T\"' EXIT",
  "LOCK=\"-o DPkg::Lock::Timeout=300\"",
  "X() { \"$HP\" --root -- \"$@\"; }",
  "XN() { \"$HP\" --root --next -- \"$@\"; }",
  "q() { dpkg-query --admindir=\"$1/var/lib/dpkg\" -W -f='${db:Status-Abbrev} ${Package}:${Architecture} ${Version}\\n' 2>/dev/null | awk 'substr($1, 2, 1) == \"i\" { print $2 \" \" $3 }' | sort -u; }",
  "sysok() { [ -d \"$1\" ] && [ ! -L \"$1\" ] || refuse no-system \"$1\"; [ \"$(stat -c %u \"$1\")\" = 0 ] || refuse not-root-owned \"$1\"; m=$(stat -c %a \"$1\"); [ $(( 0$m & 02 )) -eq 0 ] || refuse world-writable \"$1\"; [ -f \"$1/etc/vibespace-sysroot.json\" ] || refuse no-identity \"$1\"; }",
  "rdir() { p=${1%/*}; ( cd \"$p\" && [ \"$(pwd -P)\" = \"$p\" ] && [ \"$(stat -c %u .)\" = 0 ] ) || refuse link-in-userland \"$p\"; if [ ! -e \"$1\" ] && [ ! -L \"$1\" ]; then install -d -m 0755 -o root -g root \"$1\"; fi; ( cd \"$1\" && [ \"$(pwd -P)\" = \"$1\" ] && [ \"$(stat -c %u .)\" = 0 ] && [ $(( 0$(stat -c %a .) & 022 )) -eq 0 ] ) || refuse link-in-userland \"$1\"; }",
  "put() { ( cd \"$2\" && [ \"$(pwd -P)\" = \"$2\" ] && [ \"$(stat -c %u .)\" = 0 ] && [ $(( 0$(stat -c %a .) & 022 )) -eq 0 ] && install -m 0644 -o root -g root \"$1\" \"./.$3.vs\" && mv -fT \"./.$3.vs\" \"./$3\" ) || refuse link-in-userland \"$2/$3\"; }",
  "stage() { ( cd \"$1\" && [ \"$(pwd -P)\" = \"$1\" ] && [ \"$(stat -c %u .)\" = 0 ] && [ $(( 0$(stat -c %a .) & 022 )) -eq 0 ] || exit 1; for f in *; do if [ -f \"$f\" ] && [ ! -L \"$f\" ]; then dd if=\"./$f\" of=\"$2/$f\" iflag=nofollow,nonblock bs=64k count=16 2>/dev/null || exit 1; fi; done ) || refuse link-in-userland \"$1\"; }",
  "cpin() { rm -f \"$T/cp\"; ( cd \"$1\" && [ \"$(pwd -P)\" = \"$1\" ] && [ -f \"./$2\" ] && [ ! -L \"./$2\" ] && dd if=\"./$2\" of=\"$T/cp\" iflag=nofollow,nonblock bs=1M count=4096 2>/dev/null ) && put \"$T/cp\" \"$3\" \"$2\"; }",
  "rmchild() { case $1 in rootfs.prev|rootfs.next|rootfs.new|rootfs.swap) ;; *) refuse unsafe-removal \"$1\" ;; esac; ( cd \"$S\" && [ \"$(pwd -P)\" = \"$S\" ] && [ -d \"./$1\" ] && [ ! -L \"./$1\" ] && [ \"$(stat -c %u \"./$1\")\" = 0 ] && rm -rf --one-file-system \"./$1\" ) || refuse unsafe-removal \"$S/$1\"; }",
  "mk() {",
  "  if [ -e \"$1\" ] || [ -L \"$1\" ]; then rmchild \"${1##*/}\"; fi",
  "  install -d -m 0755 -o root -g root \"$1\"; chmod g-s \"$1\"",
  "  if [ \"$2\" = a ]; then",
  "    [ -f \"$TARBALL\" ] || refuse no-tarball \"$TARBALL\"",
  "    echo \"+ tar -xpf $TARBALL\"; tar -xpzf \"$TARBALL\" -C \"$1\" --numeric-owner; FROM=minbase-tarball",
  "  else",
  "    command -v debootstrap > /dev/null || refuse no-debootstrap",
  "    echo \"+ debootstrap --variant=minbase $3 ${4:-}\"; debootstrap --variant=minbase \"$3\" \"$1\" ${4:+\"$4\"}; FROM=debootstrap",
  "  fi",
  "  for x in etc var var/lib var/cache; do rdir \"$1/$x\"; done",
  "  osr=$1/usr/lib/os-release; [ -f \"$osr\" ] && [ ! -L \"$osr\" ] || osr=$1/etc/os-release",
  "  [ -f \"$osr\" ] && [ ! -L \"$osr\" ] || refuse not-a-userland \"$1\"",
  "  did=$(sed -n 's/^ID=//p' \"$osr\" | tr -d '\"' | head -1); dcn=$(sed -n 's/^VERSION_CODENAME=//p' \"$osr\" | tr -d '\"' | head -1)",
  "  case \"$did\" in \"\"|*[!a-z0-9.-]*) refuse bad-userland-id ;; esac",
  "  case \"$dcn\" in \"\"|*[!a-z0-9]*) refuse bad-userland-id ;; esac",
  "  arch=$(dpkg --print-architecture)",
  "  rm -f \"$1/etc/vibespace-sysroot.json\"",
  "  printf '{\"v\":1,\"id\":\"%s\",\"codename\":\"%s\",\"arch\":\"%s\",\"createdFrom\":\"%s\",\"helperContract\":1,\"createdAt\":%s}\\n' \"$did\" \"$dcn\" \"$arch\" \"$FROM\" \"$(date +%s)\" > \"$T/id\"",
  "  put \"$T/id\" \"$1/etc\" vibespace-sysroot.json",
  "  rdir \"$1/var/lib/vibespace\"; rdir \"$1/var/lib/vibespace/entries\"; rdir \"$1/var/cache/vibespace\"",
  "  say identity \"$did\" \"$dcn\" \"$arch\" \"$FROM\"",
  "}",
  "srcsync() {",
  "  d=$A/sys/sources",
  "  [ -d \"$d\" ] && [ ! -L \"$d\" ] && [ \"$(stat -c %u \"$d\")\" = 0 ] || return 0",
  "  for x in etc/apt etc/apt/keyrings etc/apt/sources.list.d etc/apt/preferences.d; do rdir \"$1/$x\"; done",
  "  rm -rf \"$T/src\"; mkdir -m 0700 \"$T/src\"; stage \"$d\" \"$T/src\"; if [ -d \"$A/sys/keys\" ]; then stage \"$A/sys/keys\" \"$T/src\"; fi",
  "  for s in \"$T/src\"/*.sources; do",
  "    [ -f \"$s\" ] || continue; i=${s##*/}; i=${i%.sources}; case $i in \"\"|*[!a-z0-9-]*) continue ;; esac",
  "    for x in asc gpg; do if [ -f \"$T/src/$i.$x\" ]; then put \"$T/src/$i.$x\" \"$1/etc/apt/keyrings\" \"vibespace-$i.$x\"; fi; done",
  "    put \"$s\" \"$1/etc/apt/sources.list.d\" \"vibespace-$i.sources\"",
  "    if [ -f \"$T/src/$i.pref\" ]; then put \"$T/src/$i.pref\" \"$1/etc/apt/preferences.d\" \"vibespace-$i.pref\"; fi",
  "    say source \"$i\"",
  "  done",
  "}",
  "emit() {",
  "  q \"$R\" > \"$T/after\"",
  "  comm -13 \"$T/before\" \"$T/after\" | while read -r p v; do say delta + \"$p\" \"$v\"; done",
  "  comm -23 \"$T/before\" \"$T/after\" | while read -r p v; do say delta - \"$p\" \"$v\"; done",
  "  : > \"$T/desktop\"",
  "  for p in $(cat \"$T/req\"); do dpkg-query --admindir=\"$R/var/lib/dpkg\" -L \"$p\" 2>/dev/null | grep -E \"^/usr(/local)?/share/applications/[A-Za-z0-9@._+-]+[.]desktop$\" | while read -r f; do say desktop \"$p\" \"$f\"; echo \"$f\" >> \"$T/desktop\"; done; done",
  "  : > \"$T/bin\"",
  "  for p in $(cat \"$T/req\"); do dpkg-query --admindir=\"$R/var/lib/dpkg\" -L \"$p\" 2>/dev/null | grep -E \"^/usr/(local/)?(bin|games)/[A-Za-z0-9@._+-]+$\" | while read -r f; do say bin \"$p\" \"$f\"; echo \"$f\" >> \"$T/bin\"; done; done",
  "}",
  "list() {",
  "  E=$R/var/lib/vibespace/entries; rdir \"$R/var/lib/vibespace\"; rdir \"$E\"",
  "  put \"$T/req\" \"$E\" \"$ID.list\"; put \"$T/desktop\" \"$E\" \"$ID.desktop\"; put \"$T/bin\" \"$E\" \"$ID.bin\"",
  "}",
  "case $MODE in",
  "create)",
  "  [ ! -e \"$R\" ] || refuse exists \"$R\"",
  "  mk \"$S/rootfs.new\" \"$1\" \"$2\" \"${3:-}\"; srcsync \"$S/rootfs.new\"",
  "  mv \"$S/rootfs.new\" \"$R\"",
  "  echo \"+ apt-get update (inside the app system)\"; X apt-get $LOCK update || say warn update-failed",
  "  say ok ;;",
  "install)",
  "  sysok \"$R\"; srcsync \"$R\"; printf '%s\\n' \"$@\" > \"$T/req\"; q \"$R\" > \"$T/before\"",
  "  echo \"+ apt-get update\"; X apt-get $LOCK update",
  "  echo \"+ apt-get install -y $*\"; X apt-get $LOCK install -y \"$@\"",
  "  emit; list; say ok ;;",
  "deb)",
  "  sysok \"$R\"; srcsync \"$R\"",
  "  dd if=\"$1\" of=\"$T/in.deb\" iflag=nofollow,nonblock bs=1M count=4096 2>/dev/null && [ -f \"$T/in.deb\" ] || refuse no-deb",
  "  [ \"$(sha256sum \"$T/in.deb\" | cut -d\" \" -f1)\" = \"$2\" ] || refuse deb-changed",
  "  p=$(dpkg-deb -f \"$T/in.deb\" Package) && pkgok \"$p\" || refuse bad-name \"$p\"",
  "  v=$(dpkg-deb -f \"$T/in.deb\" Version); a=$(dpkg-deb -f \"$T/in.deb\" Architecture)",
  "  case \"$v$a\" in \"\"|*[!A-Za-z0-9.+~:-]*) refuse bad-deb ;; esac",
  "  n=${p}_$(printf %s \"$v\" | sed \"s/^[0-9]*://\")_$a.deb",
  "  rdir \"$R/var/cache/vibespace\"; put \"$T/in.deb\" \"$R/var/cache/vibespace\" \"$n\"",
  "  echo \"$p\" > \"$T/req\"; q \"$R\" > \"$T/before\"",
  "  echo \"+ apt-get update\"; X apt-get $LOCK update",
  "  echo \"+ apt-get install -y ./$n\"; X apt-get $LOCK install -y \"/var/cache/vibespace/$n\"",
  "  emit; list; echo \"$n\" > \"$T/debname\"; put \"$T/debname\" \"$R/var/lib/vibespace/entries\" \"$ID.deb\"; say ok ;;",
  "remove)",
  "  sysok \"$R\"; E=$R/var/lib/vibespace/entries",
  "  [ -f \"$E/$ID.list\" ] || refuse no-entry \"$ID\"",
  "  : > \"$T/req\"",
  "  for f in \"$E\"/*.list; do [ \"$f\" = \"$E/$ID.list\" ] || cat \"$f\"; done | sort -u > \"$T/others\"",
  "  pk=; for p in $(cat \"$E/$ID.list\"); do pkgok \"$p\" || continue; if grep -qxF \"$p\" \"$T/others\"; then say kept \"$p\"; else pk=\"$pk $p\"; fi; done",
  "  if [ -n \"$pk\" ]; then X apt-get -s remove --autoremove -y $pk 2>/dev/null | awk '$1 == \"Remv\" { print $2 }' | while read -r p; do if grep -qxF \"$p\" \"$T/others\"; then echo \"$p\"; fi; done > \"$T/hit\"; if [ -s \"$T/hit\" ]; then refuse shared $(cat \"$T/hit\"); fi; fi",
  "  q \"$R\" > \"$T/before\"",
  "  if [ -n \"$pk\" ]; then echo \"+ apt-get remove --autoremove -y$pk\"; X apt-get $LOCK remove --autoremove -y $pk; fi",
  "  emit",
  "  if [ -f \"$E/$ID.deb\" ]; then n=$(cat \"$E/$ID.deb\"); case $n in \"\"|*/*) ;; *) ( cd \"$R/var/cache/vibespace\" && [ \"$(pwd -P)\" = \"$R/var/cache/vibespace\" ] && rm -f \"./$n\" ) || true ;; esac; fi",
  "  ( cd \"$E\" && [ \"$(pwd -P)\" = \"$E\" ] && rm -f \"./$ID.list\" \"./$ID.desktop\" \"./$ID.deb\" \"./$ID.bin\" ) || refuse link-in-userland \"$E\"; say ok ;;",
  "refresh)",
  "  sysok \"$R\"; srcsync \"$R\"; : > \"$T/req\"; q \"$R\" > \"$T/before\"",
  "  echo \"+ apt-get update\"; X apt-get $LOCK update",
  "  echo \"+ apt-get upgrade -y\"; X apt-get $LOCK upgrade -y",
  "  emit; say ok ;;",
  "repair)",
  "  sysok \"$R\"; : > \"$T/req\"; q \"$R\" > \"$T/before\"",
  "  echo \"+ dpkg --configure -a\"; X dpkg --configure -a || true",
  "  echo \"+ apt-get install -f -y\"; X apt-get $LOCK install -f -y",
  "  emit",
  "  if [ -n \"$(X dpkg --audit 2>&1)\" ]; then say partial 1; else say ok; fi ;;",
  "rebase)",
  "  sysok \"$R\"; [ ! -e \"$P\" ] || refuse prev-exists \"$P\"",
  "  mk \"$NX\" \"$1\" \"$2\" \"${3:-}\"; srcsync \"$NX\"",
  "  echo \"+ apt-get update (the new app system)\"; XN apt-get $LOCK update",
  "  E=$R/var/lib/vibespace/entries; EN=$NX/var/lib/vibespace/entries; bad=0",
  "  for l in \"$E\"/*.list; do",
  "    [ -f \"$l\" ] || continue; e=${l##*/}; e=${e%.list}; case $e in \"\"|*[!a-z0-9-]*) continue ;; esac; pk=",
  "    if [ -f \"$E/$e.deb\" ]; then n=$(cat \"$E/$e.deb\"); case $n in \"\"|*/*) ;; *) if cpin \"$R/var/cache/vibespace\" \"$n\" \"$NX/var/cache/vibespace\"; then pk=\" /var/cache/vibespace/$n\"; fi ;; esac; fi",
  "    if [ -z \"$pk\" ]; then for p in $(cat \"$l\"); do if pkgok \"$p\"; then pk=\"$pk $p\"; fi; done; fi",
  "    [ -n \"$pk\" ] || { say entry \"$e\" failed bad-list; bad=$((bad+1)); continue; }",
  "    echo \"+ apt-get install -y$pk (the new app system)\"",
  "    if XN apt-get $LOCK install -y $pk; then say entry \"$e\" ok",
  "    else",
  "      for p in $pk; do XN apt-get $LOCK install -y \"$p\" || say missing \"$p\" -; done",
  "      say entry \"$e\" failed missing; bad=$((bad+1))",
  "    fi",
  "    for x in list desktop deb bin; do cpin \"$E\" \"$e.$x\" \"$EN\" || true; done",
  "    if [ -f \"$E/$e.desktop\" ]; then while read -r f; do case $f in /usr/*) [ -e \"$NX$f\" ] || say gone \"$e\" \"$f\" ;; esac; done < \"$E/$e.desktop\"; fi",
  "  done",
  "  mv \"$R\" \"$P\"; mv \"$NX\" \"$R\"; say rebased \"$bad\"; say ok ;;",
  "rollback)",
  "  [ -d \"$P\" ] && [ ! -L \"$P\" ] || refuse no-prev \"$P\"",
  "  sysok \"$P\"",
  "  if [ -e \"$S/rootfs.swap\" ] || [ -L \"$S/rootfs.swap\" ]; then rmchild rootfs.swap; fi",
  "  if [ -e \"$R\" ]; then mv \"$R\" \"$S/rootfs.swap\"; fi",
  "  mv \"$P\" \"$R\"; if [ -e \"$S/rootfs.swap\" ]; then mv \"$S/rootfs.swap\" \"$P\"; fi",
  "  say ok ;;",
  "drop-prev)",
  "  [ -d \"$P\" ] && [ ! -L \"$P\" ] || refuse no-prev \"$P\"",
  "  rmchild rootfs.prev; say ok ;;",
  "esac",
].join('\n');
/** The boot install (after listen, a child): the helper + the sudoers drop-in from the checkout, `visudo -cf` first,
 *  0755 / 0440 root:root, rewritten only when the bytes differ. Run as `sudo -n sh -c INSTALL_SCRIPT vs-sys-install <helper>
 *  <sudoers> <helper-sha256> <sudoers-sha256>`: the checkout may be user-writable (the pod's lives on the PVC), so root
 *  copies both into its private dir FIRST and installs those copies only when they carry this release's digests
 *  (HELPER_SHA256 / SUDOERS_SHA256 — test-app-system holds them equal to deploy/sysroot) — the bytes checked are the bytes installed. */
const INSTALL_SCRIPT = [
  "set -eu",
  "say() { printf '= %s\\n' \"$*\"; }",
  "H=/usr/local/libexec/vibespace/vs-sysroot-enter; SD=/etc/sudoers.d/~vibespace-sysroot",
  "[ \"$(id -u)\" = 0 ] || { say refused not-root; exit 125; }",
  "case ${SUDO_UID:-} in \"\"|0|*[!0-9]*) say refused no-sudo-uid; exit 125 ;; esac",
  "[ $# -eq 4 ] && [ -f \"$1\" ] && [ -f \"$2\" ] || { say refused no-source; exit 125; }",
  "case $3$4 in *[!0-9a-f]*) say refused bad-digest; exit 125 ;; esac; [ ${#3} -eq 64 ] && [ ${#4} -eq 64 ] || { say refused bad-digest; exit 125; }",
  "command -v visudo > /dev/null || { say refused no-visudo; exit 125; }",
  "T=$(mktemp -d); trap 'rm -rf \"$T\"' EXIT",
  "cp \"$1\" \"$T/h\"; cp \"$2\" \"$T/s0\"",
  "[ \"$(sha256sum < \"$T/h\" | cut -d\" \" -f1)\" = \"$3\" ] && [ \"$(sha256sum < \"$T/s0\" | cut -d\" \" -f1)\" = \"$4\" ] || { say refused digest-mismatch; exit 125; }",
  "sed \"s/^#VS_UID /#$SUDO_UID /\" \"$T/s0\" > \"$T/s\"; chmod 0440 \"$T/s\"",
  "visudo -cf \"$T/s\" > /dev/null || { say refused sudoers-invalid; exit 125; }",
  "grep -qxF \"#$SUDO_UID ALL=(root) NOPASSWD:NOSETENV: $H\" \"$T/s\" || { say refused no-setenv-rule; exit 125; }",
  "install -d -m 0755 -o root -g root /usr/local/libexec/vibespace",
  "if cmp -s \"$T/h\" \"$H\"; then say helper same; else install -m 0755 -o root -g root \"$T/h\" \"$H.new\"; mv -f \"$H.new\" \"$H\"; say helper installed; fi",
  "chown root:root \"$H\"; chmod 0755 \"$H\"",
  "if cmp -s \"$T/s\" \"$SD\"; then say sudoers same; else install -m 0440 -o root -g root \"$T/s\" \"$SD.new\"; mv -f \"$SD.new\" \"$SD\"; say sudoers installed; fi",
  "chown root:root \"$SD\"; chmod 0440 \"$SD\"",
  "say ok",
].join('\n');

/** The argv the package slot runs for one SYS_SCRIPT mode (values judged here first — fail before root). */
function sysArgv({ mode, id, nonce, args = [] }) {
  if (!SYS_MODES.includes(mode)) throw new Error(`unknown app-system mode ${JSON.stringify(mode)}`);
  if (!ENTRY_ID_RE.test(String(id))) throw new Error(`bad entry id ${JSON.stringify(id)}`);
  if (!NONCE_RE.test(String(nonce))) throw new Error('bad nonce');
  const a = (Array.isArray(args) ? args : []).map(String);
  if (mode === 'install' && (!a.length || !a.every((p) => PKG_RE.test(p)))) throw new Error('packages must be Debian package names');
  if ((mode === 'create' || mode === 'rebase') && (!['a', 'b'].includes(a[0]) || !/^[a-z0-9]{1,32}$/.test(a[1] || ''))) throw new Error('a rung (a|b) and a codename');
  return ['sudo', '-n', 'sh', '-c', SYS_SCRIPT, 'vs-sys', mode, String(id), String(nonce), '--', ...a];
}
function installArgv({ helperSrc, sudoersSrc, helperSha256 = HELPER_SHA256, sudoersSha256 = SUDOERS_SHA256 }) { return ['sudo', '-n', 'sh', '-c', INSTALL_SCRIPT, 'vs-sys-install', String(helperSrc), String(sudoersSrc), String(helperSha256), String(sudoersSha256)]; }
/** WHAT A SYS PLAN RUNS, as one value its digest binds (desktop-access planDigest — Layer 0's "what you approve is what
 *  runs", extended to the app system): `sudo -n sh -c <script> vs-sys <mode> <id> <nonce> -- <args…>` → the script and
 *  every position but the nonce (fresh per plan); null = not that shape. */
function sysRunKey(argv) {
  if (!Array.isArray(argv) || argv.length < 10 || argv[0] !== 'sudo' || argv[1] !== '-n' || argv[2] !== 'sh' || argv[3] !== '-c' || argv[5] !== 'vs-sys' || argv[9] !== '--') return null;
  return JSON.stringify([String(argv[4]), ...argv.slice(6).map((x, i) => (i === 2 ? '' : String(x)))]);
}
/** A plan's app-system part of its digest: a sys plan → {layer, run}; any other plan → {} (its digest unchanged); null =
 *  a plan that never runs — a sys plan whose argv is not SYS_SCRIPT's shape, or a host plan carrying that argv. */
function sysDigestPart({ layer = null, argv = null } = {}) {
  const sys = layer === 'sys';
  const run = sysRunKey(argv);
  if (sys !== (run != null)) return null;
  return sys ? { layer: 'sys', run } : {};
}
/** The commands a person READS above the button — the same steps, as a person would type them (part of the digest). */
function sysCommands({ mode, packages = [], deb = null, rung = null, codename = null } = {}) {
  const sys = '~/.vibespace/sysroot/rootfs';
  const inside = `sudo ${HELPER_PATH} --root --`;
  const lock = '-o DPkg::Lock::Timeout=300';
  const mkLine = (dir) => (rung === 'a' ? `sudo tar -xpzf ${MINBASE_TARBALL} -C ${dir}  # the image's own minbase, offline` : `sudo debootstrap --variant=minbase ${codename || '<codename>'} ${dir}`);
  if (mode === 'create') return [`# VibeSpace creates your app system: a ${codename || ''} userland on your disk that keeps the apps you install (root:root 0755, never group-inherited)`, mkLine(sys), `# + ${sys}/etc/vibespace-sysroot.json (its identity)`, `${inside} apt-get ${lock} update`];
  if (mode === 'install') return ['# into your app system — it survives a rebuilt machine with nothing to reinstall', `${inside} apt-get ${lock} update`, `${inside} apt-get ${lock} install -y ${packages.join(' ')}`];
  if (mode === 'deb') return [`# into your app system — the file is kept in ${sys}${DEB_DIR} (sha256 ${deb && deb.sha256 ? deb.sha256 : '?'})`, `${inside} apt-get ${lock} update`, `${inside} apt-get ${lock} install -y ${DEB_DIR}/${deb && deb.name ? deb.name : 'package.deb'}`];
  if (mode === 'remove') return ['# from your app system', `${inside} apt-get ${lock} remove --autoremove -y ${packages.join(' ')}`];
  if (mode === 'refresh') return ['# your app system gets its own updates (the image never patches it)', `${inside} apt-get ${lock} update`, `${inside} apt-get ${lock} upgrade -y`];
  if (mode === 'repair') return ['# an install into your app system was interrupted — finish it', `${inside} dpkg --configure -a`, `${inside} apt-get ${lock} install -f -y`];
  if (mode === 'rebase') return [`# a new app system on ${codename || 'the new release'} next to the old one; your apps are installed into it again`, mkLine('~/.vibespace/sysroot/rootfs.next'), `sudo ${HELPER_PATH} --root --next -- apt-get ${lock} install -y ${packages.join(' ') || '<your apps>'}`, '# then rootfs → rootfs.prev, rootfs.next → rootfs (Roll back swaps them again; nothing is deleted)'];
  if (mode === 'rollback') return ['# swap the app system with the previous one (rootfs ⇄ rootfs.prev)', 'sudo mv ~/.vibespace/sysroot/rootfs ~/.vibespace/sysroot/rootfs.prev  # and back'];
  if (mode === 'drop-prev') return ['sudo rm -rf --one-file-system ~/.vibespace/sysroot/rootfs.prev'];
  return [];
}
/** The apt options a SIMULATION reads the app system with, as the user (no root before approval): its own /etc/apt,
 *  dpkg status and lists; no cache file written, no lock taken. */
function simOpts(rootfs) { return ['-o', `Dir=${rootfs}/`, '-o', 'Dir::Cache::pkgcache=', '-o', 'Dir::Cache::srcpkgcache=', '-o', 'Debug::NoLocking=1', '-o', 'APT::Sandbox::User=']; }

module.exports = {
  SYSROOT_REL, HELPER_PATH, SUDOERS_PATH, HELPER_CONTRACT, SHIM_VERSION, SHIM_MARK, ROW_PREFIX, ENTRY_DIR, DEB_DIR, MINBASE_TARBALL,
  ENV_KEEP, ROOT_COMMANDS, SYS_PATH, EXEC_DIRS, SYS_MODES, SYS_KINDS, SYS_KIND_MODE, SYS_RUN_ID, SUDOERS_TEXT,
  parseIdentity, identityText, rebaseVerdict, systemView, auditVerdict,
  sysRowId, execTarget, resolveTarget, shimName, sysRows, binExports, shimText, shimVersionOf, shimPlan,
  SYS_SCRIPT, INSTALL_SCRIPT, sysArgv, installArgv, sysCommands, simOpts, SUDOERS_UID_MARK, HELPER_SHA256, SUDOERS_SHA256, sysRunKey, sysDigestPart,
};
