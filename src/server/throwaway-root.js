'use strict';
// A COPY OF VIBESPACE RUN FROM A GIT WORKTREE USES A HOME OF ITS OWN — DECIDED ONCE, AT BOOT (B-ba47 shape H: 主开发's GO
// 2026-11-14 16:52Z on the second page; re-landed on pick B's built env 2026-11-21, 主开发 r1222). The 2.369.401 hotfix night:
// hubs a claim booted outside its lane env ran on a person's HOME (their usage index was CREATED under ~/.vibespace/db). A
// SUITE re-homes itself at import (scripts/scratch.mjs, pick B); this is the hub a person or an agent starts BY HAND from a
// scratch copy.
//   THE ONE TEST «is this root throwaway» (src/server-root.js isThrowaway over the root verdict): the root is a LINKED WORKTREE
//   (git's fact: every scratch copy VibeSpace's tooling makes is one; a person's clone, or a tree with no .git, never is,
//   wherever it lives), or it lies under a temp root AND was handed a temp home (a test's scratch clone). A person's own clone
//   under a temp root, run with their own home, is neither: a real hub. EVERY gate asks it (主开发 r1278: «every gate asks ONE
//   function» — rule 3 too): the update check's offline answer and the boot's runtime check (src/server/ops-routes.js,
//   runtime-boot.js), git identity, both home-rename migrations, the throwaway Xvnc stop, the owner CLI-config writes.
//   THE LAW (r1278): the owner's production hub — a clone, its own data folder, started by the service — is never judged
//   throwaway by any input it can be handed: a temp variable at the disk's root, relative, at or above its home; an env name a
//   parent left; a symlinked checkout; a .git that cannot be read (no answer is never «throwaway»).
//   THE RE-HOME needs the FIRST sign, never the place: a linked worktree handed a home outside every temp root is re-homed at the boot's
//   FIRST act (runtime-boot.boot, after the runtime switch) to <root>/.home (0700), unless VIBESPACE_REAL_INSTALL=1, which is
//   printed. Its environment is BUILT, as a re-homed suite's is (src/home-verdict.js rehomeEnv), from the HUB's rows: the
//   suite's rows plus the hub's own knobs, derived from its code (HUB_ROWS); the conversation's names, the agent CLIs'
//   folders and sign-ins and the person's own hub credentials are named NOTs (HUB_NOT). os.homedir() reads $HOME, so every
//   spelling and every child follows; what does not (a passwd read, ssh) is a named row in scripts/test-throwaway-boot.mjs.
//   THE BOUND (主开发 r1222): a reader of env names can miss a form, so the first act PRINTS, once, every name it was handed
//   that is neither a hub row nor a hub NOT — by name, never a value; the guard holds that line EMPTY on a stand-in start.
const fs = require('fs');
const os = require('os');
const path = require('path');
const SR = require('../server-root');
const HV = require('../home-verdict');
const HL = require('../home-links');
const MPC = require('../mount-path-class');
const { readRootFacts } = require('./root-facts');
const { TMP_ROOTS } = require('../fixture-guard');

let hubRoot = null, verdict = null;
function setHubRoot(root) { hubRoot = root ? path.resolve(String(root)) : null; return hubRoot; }
const hub = () => hubRoot;
const OWN_HOME_DIR = '.home';
const OVERRIDE_ENV = 'VIBESPACE_REAL_INSTALL';
const realOr = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(String(p)); } };
/** THE TEMP ROOTS the one test compares a root and its handed home with (B-9dd0 r468 / r528, B-ba47 shape H r1278): the fixed
 *  temp folders (fixture-guard's TMP_ROOTS) and the temp VARIABLE's folder (os.tmpdir()) — ABSOLUTE spellings only (a relative
 *  one would resolve to the hub's own folder), never the disk's root, and the variable's folder never when it holds the handed
 *  home (TMPDIR=$HOME, or a folder above it, is no proof of a throwaway copy); each with its real path beside its spelling.
 *  PURE over its inputs (`realpath` the caller's). */
function tmpRootsOf({ fixed = TMP_ROOTS, tmpdir = os.tmpdir(), home = null, realpath = realOr } = {}) {
  const abs = (p) => typeof p === 'string' && p.startsWith('/') && path.resolve(p) !== '/';
  const h = abs(home) ? path.resolve(home) : null;
  const holdsHome = (t) => { const r = path.resolve(t); return !!h && (h === r || h.startsWith(r + '/')); };
  const vars = abs(tmpdir) && !holdsHome(tmpdir) && !holdsHome(realpath(tmpdir) || tmpdir) ? [tmpdir] : [];
  const out = new Set();
  for (const t of [...(fixed || []), ...vars].filter(abs)) {
    const r = realpath(t);
    if (typeof r === 'string' && path.resolve(r) === '/') continue;   // the disk's root by another name is never a temp root (r468)
    out.add(path.resolve(t)); if (abs(r)) out.add(path.resolve(r));
  }
  return [...out];
}
const tmpRoots = (home = process.env.HOME || null) => tmpRootsOf({ home });
/** THE HUB's OWN NAMED DROP beyond its rows (a suite keeps it: its ssh legs dial with the person's agent on purpose). It is a
 *  NOT of the suite's too (the desktop session), so the built env never carries it; it is named here for the boot line. */
const HUB_DROPS = Object.freeze([
  Object.freeze({ name: 'SSH_AUTH_SOCK', why: "the person's ssh-agent — their keys are their identity; a throwaway hub dials, if at all, through its own ssh on its own files (sshOnOwnFiles)" }),
]);

/** THE ONE TEST, for a root and the home it was handed (`roots`: the temp roots, tmpRootsOf's by default — a seam for the
 *  suites' tables). The home is judged by its real path too; an unread home is never a «temp» one (no answer is never throwaway). */
function judge(root, handed, { roots = tmpRoots(handed) } = {}) {
  const facts = readRootFacts(root), r = realOr(root);
  // the handed home is RESOLVED only when the root lies under a temp root (the only case it decides): an installed root's boot
  // never touches the home it was handed
  const home = typeof handed === 'string' && handed.startsWith('/') ? (SR.tmpRootUnder({ root: r, tmpRoots: roots }) ? realOr(handed) : handed) : null;
  const v = SR.rootVerdict({ ...facts, root: r, tmpRoots: roots, home });
  return { facts, rootVerdict: v, throwaway: SR.isThrowaway(v), linkedWorktree: SR.isLinkedWorktree(facts.gitDir, facts.gitCommonDir) };
}
/** Is this root throwaway? — the boot's answer for the declared hub, else judged now (no hub declared ⇒ false). */
function throwaway(root = hubRoot) {
  if (!root) return false;
  if (verdict && hubRoot && path.resolve(String(root)) === hubRoot) return verdict.throwaway;
  return judge(root, process.env.HOME || os.homedir()).throwaway && process.env[OVERRIDE_ENV] !== '1';
}

/** THE BOOT'S FIRST ACT: the one test, and the re-home of THIS process's env when the root is a linked worktree handed a home
 *  outside every temp root. → { throwaway, sign, rehome, why, root, override, home?, dropped?, notCarried?, linked?, unruled? } */
function rehomeAtBoot({ root, env = process.env, execPath = process.execPath } = {}) {
  setHubRoot(root);
  const handed = env.HOME || os.homedir();
  const j = judge(hubRoot, handed);
  const override = env[OVERRIDE_ENV] === '1';
  // the main thread never waits on a storage mount (lane hub-fuse-sync-guard): a handed path on a FUSE, network or storage mount
  // is never walked from the first act (the witness is not installed yet) — could not look, so the value rule does not carry it
  let mounts = []; try { mounts = MPC.parseMountinfo(fs.readFileSync('/proc/self/mountinfo', 'utf8')); } catch { }
  const mctx = { mountRoots: MPC.rootsOf({ mounts, rootDir: hubRoot }), rootDir: hubRoot };
  const onMount = (p) => !!MPC.rootOf(p, mctx);
  const resolve = HL.makeResolver({ refuse: onMount });
  const v = HV.hubRehome({ root: hubRoot, home: handed, tmpRoots: tmpRoots(handed), resolve, linkedWorktree: j.linkedWorktree, override });
  // the override is the person's word «this copy is my real install»: no re-home, and every gate treats it as real
  verdict = { root: hubRoot, throwaway: j.throwaway && !override, sign: j.linkedWorktree ? 'worktree' : j.throwaway ? 'scratch-clone' : null, override, ...v };
  if (!v.rehome) return verdict;
  // THE BOUND: every handed name that is neither a hub row nor a hub NOT, by name (judged before the env is rebuilt)
  const unruled = HV.unruledNames(env, {}, { rows: HV.HUB_ROWS, not: HV.HUB_NOT });
  const own = path.join(hubRoot, OWN_HOME_DIR);
  fs.mkdirSync(own, { recursive: true, mode: 0o700 });
  const r = HV.rehomeEnv(env, { oldHome: handed, newHome: own, platform: process.platform, resolve, checkout: hubRoot, rows: HV.HUB_ROWS, not: HV.HUB_NOT });
  const runs = resolve(execPath) || execPath;
  const linked = HL.linkTools(r.binDir, HV.binLinks({ execPath: runs, nodeInstall: path.dirname(runs), handedPath: r.handedPath, home: handed, exists: (f) => !onMount(f) && HL.isFile(f), resolve, platform: process.platform }));
  const sshed = sshOnOwnFiles(r.binDir, r.env.PATH, own);
  for (const k of Object.keys(env)) if (!Object.prototype.hasOwnProperty.call(r.env, k)) delete env[k];
  Object.assign(env, r.env);
  verdict = { ...verdict, home: own, dropped: r.dropped, notCarried: r.notCarried, linked: sshed ? [...linked, 'ssh'] : linked, unruled };
  return verdict;
}
/** A THROWAWAY HUB'S ssh (the H readers' REACH-9): ssh reads the person's ~/.ssh from the PASSWD entry whatever HOME says, so a
 *  re-homed hub's PATH starts with an `ssh` of its own — every ssh road spawns ssh BY NAME (the hosts, the device agent,
 *  rsync's -e, the attach CLI) — that runs the real one on the hub's OWN files: no ~/.ssh/config (-F /dev/null), its own
 *  known_hosts and identity file, IdentitiesOnly, no global known_hosts; the person's agent socket is never carried (HUB_DROPS).
 *  `PATH` = the BUILT one (its own folder + the system's): the real ssh is a system copy, never one under the handed home.
 *  → true when the wrapper was written (no ssh on that PATH ⇒ nothing to wrap). */
function sshOnOwnFiles(binDir, PATH, own) {
  const real = String(PATH || '').split(':').filter((d) => d && path.resolve(d) !== path.resolve(binDir)).map((d) => path.join(d, 'ssh')).find(HL.isFile);
  if (!real) return false;
  fs.mkdirSync(path.join(own, '.ssh'), { recursive: true, mode: 0o700 });
  const q = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;
  fs.writeFileSync(path.join(binDir, 'ssh'), `#!/bin/sh\n# B-ba47 shape H: this throwaway hub's ssh — the real one (${real}) on the hub's OWN files, never the person's ~/.ssh\n`
    + `exec ${q(real)} -F /dev/null -o UserKnownHostsFile=${q(path.join(own, '.ssh', 'known_hosts'))} -o GlobalKnownHostsFile=/dev/null -o IdentitiesOnly=yes -o IdentityFile=${q(path.join(own, '.ssh', 'id_ed25519'))} "$@"\n`, { mode: 0o755 });
  return true;
}
const boot = () => verdict;

/** The boot's words — NO path of the handed home (it is the person's), the names dropped, never a value. */
function bootLine(v = verdict) {
  if (!v) return null;
  if (v.rehome) {
    const n = v.dropped.length;
    return `[throwaway] this copy runs from a git worktree (${v.root}): its home is ${v.home}, for itself and everything it starts, instead of the home it was handed. `
      + `Your CLIs, logins and plugins are not here. To run your real install, start it from your clone — or set ${OVERRIDE_ENV}=1 for this copy. `
      + `${n} name${n === 1 ? '' : 's'} not carried into its environment${n ? ` (${v.dropped.join(', ')})` : ''}; its PATH is its own (${v.linked.length ? v.linked.join(', ') + ' + ' : ''}the system's directories; ${v.notCarried.length} entr${v.notCarried.length === 1 ? 'y' : 'ies'} of the handed PATH not carried).`;
  }
  if (v.why === 'override') return `[throwaway] this copy runs from a git worktree (${v.root}) but ${OVERRIDE_ENV}=1 is set: it uses the home it was handed, as an installed copy does`;
  return null;
}
/** THE BOUND's line (主开发 r1222): the handed names that are neither a hub row nor a hub NOT — null when there are none. */
function unruledLine(v = verdict) {
  if (!v || !v.rehome || !v.unruled || !v.unruled.length) return null;
  return `[throwaway] handed ${v.unruled.length} name${v.unruled.length === 1 ? '' : 's'} that ${v.unruled.length === 1 ? 'is' : 'are'} neither a hub row nor a named NOT (src/home-verdict.js HUB_ROWS / HUB_NOT; not carried): ${v.unruled.join(', ')} — one the hub needs: add it to src/hub-env-knobs.json (its code must read it)`;
}

module.exports = { setHubRoot, hub, OWN_HOME_DIR, OVERRIDE_ENV, HUB_DROPS, sshOnOwnFiles, tmpRootsOf, tmpRoots, judge, throwaway, rehomeAtBoot, boot, bootLine, unruledLine };
