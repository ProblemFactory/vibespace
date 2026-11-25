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
const CE = require('../conversation-env.js');   // r2271: the handed mark (names only) and the person's session names
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

/** THE HUB'S SEAM (主开发 r1412, road (ii)): `VIBESPACE_REHOME_NOT_TEMP=<a folder a suite made under a temp root>` — that folder
 *  is NOT a temp root for the HOME's judgment, so a STAND-IN home the suite made in it is re-homed as a person's would be: the
 *  heavy pin's stand-in lives inside the boot helper's minted root and is never a real home on any machine. It can only make a hub
 *  re-home MORE: it touches no gate (the root verdict and its temp roots never read it), a value outside every temp root is
 *  ignored, a temp root itself is refused, and a root that is no linked worktree is never re-homed whatever it names. Read here
 *  alone, set by the pin alone (test-architecture §113 (j)). → null | { path } | { refused, path } */
const SEAM_ENV = 'VIBESPACE_REHOME_NOT_TEMP';
function seamOf(env, roots) {
  const v = env && env[SEAM_ENV];
  if (typeof v !== 'string' || !v.startsWith('/') || path.resolve(v) === '/') return null;
  const p = realOr(v), q = path.resolve(v);
  if (roots.includes(p) || roots.includes(q)) return { refused: true, path: p };
  return roots.some((t) => p.startsWith(t + '/')) ? { path: p } : null;
}
/** THE ONE TEST, for a root and the home it was handed (`roots`: the temp roots, tmpRootsOf's by default — a seam for the
 *  suites' tables). The home is judged by its real path too; an unread home is never a «temp» one (no answer is never throwaway). */
function judge(root, handed, { roots = tmpRoots(handed) } = {}) {
  // the root's real path ONCE (主开发 r1952 (1)): the facts' own read resolved it — a blocked root's facts carry it as given
  const facts = readRootFacts(root), r = facts.root || realOr(root);
  // the handed home is RESOLVED only when the root lies under a temp root (the only case it decides): an installed root's boot
  // never touches the home it was handed
  const home = typeof handed === 'string' && handed.startsWith('/') ? (SR.tmpRootUnder({ root: r, tmpRoots: roots }) ? realOr(handed) : handed) : null;
  const v = SR.rootVerdict({ ...facts, root: r, tmpRoots: roots, home });
  return { facts, rootVerdict: v, throwaway: SR.isThrowaway(v), linkedWorktree: SR.isLinkedWorktree(facts.gitDir, facts.gitCommonDir) };
}
/** Is this root throwaway? — ONE root only (主开发 r1952 (2)): the hub's own, the boot's answer. Another root, or none declared, is
 *  REFUSED (false): never a synchronous judge of a folder that may sit on a mount — the boot judged its own tree once, before its first
 *  turn (kb «BEFORE THE FIRST TURN»), and no caller asks about any other. Declared and not judged yet: the boot's own read. */
function throwaway(root = hubRoot) {
  if (!root || !hubRoot || path.resolve(String(root)) !== hubRoot) return false;
  if (verdict) return verdict.throwaway;
  return judge(hubRoot, process.env.HOME || os.homedir()).throwaway && process.env[OVERRIDE_ENV] !== '1';
}

/** THE BOOT'S FIRST ACT: the one test, and the re-home of THIS process's env when the root is a linked worktree handed a home
 *  outside every temp root. → { throwaway, sign, rehome, why, root, override, home?, dropped?, notCarried?, linked?, unruled? } */
function rehomeAtBoot({ root, env = process.env, execPath = process.execPath } = {}) {
  setHubRoot(root);
  const handed = env.HOME || os.homedir();
  const roots = tmpRoots(handed);   // the temp roots ONCE (主开发 r1952 (1)), handed to the one test, the seam and the re-home's verdict
  const j = judge(hubRoot, handed, { roots });
  const override = env[OVERRIDE_ENV] === '1';
  // the main thread never waits on a storage mount (lane hub-fuse-sync-guard): a handed path on a FUSE, network or storage mount
  // is never walked from the first act (the witness is not installed yet) — could not look, so the value rule does not carry it.
  // THE MOUNT TABLE IS READ ONLY WHEN A WALK NEEDS IT (主开发 r1952 (1)): a hub that is no linked worktree (the production clone) leaves
  // the verdict at «not-worktree» before any walk, so its first act reads only what it needs
  let mctx = null;
  const onMount = (p) => {
    if (!mctx) { let mounts = []; try { mounts = MPC.parseMountinfo(fs.readFileSync('/proc/self/mountinfo', 'utf8')); } catch { } mctx = { mountRoots: MPC.rootsOf({ mounts, rootDir: hubRoot }), rootDir: hubRoot }; }
    return !!MPC.rootOf(p, mctx);
  };
  const resolve = HL.makeResolver({ refuse: onMount });
  const seam = seamOf(env, roots);
  const v = HV.hubRehome({ root: hubRoot, home: handed, tmpRoots: roots, notTemp: seam && !seam.refused ? [seam.path] : [], resolve, linkedWorktree: j.linkedWorktree, override });
  // the override is the person's word «this copy is my real install»: no re-home, and every gate treats it as real
  verdict = { root: hubRoot, throwaway: j.throwaway && !override, sign: j.linkedWorktree ? 'worktree' : j.throwaway ? 'scratch-clone' : null, override, checkout: (j.rootVerdict && j.rootVerdict.checkout) || null, seam: seam || null, ...v };
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
/** THE PAGE'S ANSWER (the plan's (b): GET /api/throwaway, the first screen's banner): re-homed or not, its OWN home, the clone it
 *  is a worktree of (the first door), the override's name (the second) — never a path of the home it was handed. */
function view(v = verdict) {
  if (!v) return { throwaway: false, rehomed: false, home: null, checkout: null, override: false, overrideEnv: OVERRIDE_ENV };
  return { throwaway: !!v.throwaway, rehomed: !!v.rehome, home: v.rehome ? v.home : null, checkout: v.checkout || null, override: !!v.override, overrideEnv: OVERRIDE_ENV };
}

/** The boot's words — NO path of the handed home (it is the person's), the names dropped, never a value. */
function bootLine(v = verdict) {
  if (!v) return null;
  if (v.rehome) {
    const n = v.dropped.length;
    return `[throwaway] this copy runs from a git worktree (${v.root}): its home is ${v.home}, for itself and everything it starts, instead of the home it was handed. `
      + `Your CLIs, logins and plugins are not here. To run your real install, start it from your clone — or set ${OVERRIDE_ENV}=1 for this copy. `
      + (v.seam && !v.seam.refused ? `A suite's seam (${SEAM_ENV}) named ${v.seam.path} no temp root, so its stand-in home counted as a person's. ` : '')
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

/** THE LAW (主开发 r2271, its clause corrected by r2505): A HUB's OWN ENVIRONMENT NEVER HOLDS WHAT A PARENT CONVERSATION, JOB OR APP
 *  HANDED. Every road that hands a child its env leaves a names-only mark (src/conversation-env.js HANDED_MARK: the conversation's
 *  spawn line, a job's run, the remote command, the boot's re-adopt, a desktop app). A hub that finds it was started INSIDE a
 *  VibeSpace: at its boot, before any child and before the jobs engine, it drops ONLY WHAT WAS HANDED — every name the mark lists,
 *  the mark, the app's process mark and the two page-helper names. NO catch-all by family: a VibeSpace name the mark does not list
 *  is the person's own word and stays (no re-home here: the data folder and the home untouched). A name the mark lists is dropped
 *  even when it is a hub row (a desktop app's row that pins PORT: a hub started by hand in that app's terminal loses it).
 *  NEVER DROPPED, even when a mark lists it: the person's session names; the hub's CREDENTIAL rows (hub-env-knobs.json
 *  `credentials`: no road can hand one — agentEnv drops each before a conversation sees it — so one beside a mark is the person's
 *  own typing: their sign-in, their TLS key); and the pod's instance name (KEPT_ENV — the stricter of the two, r2505: dropped, a
 *  hub started by hand on a pod with no shared presets folder judged itself «local», acts not asked and pairing allowing all;
 *  kept, it stays a «cluster» hub and shares no identity of the outer one — the relay's cluster identity also needs the cluster
 *  token, a credential no road hands). The device and daemon roots ARE dropped: an inner hub never shares the outer's device root.
 *  The job names (VIBESPACE_JOB_*) are dropped in every case — moved from the jobs engine's construction: the hub reads none of
 *  them (its own knobs are VIBESPACE_JOBS_*). A hub with NO mark keeps everything else: an operator's own values stand. */
const PAGE_HELPER_ENV = Object.freeze(['CLAUDE_WEBUI_SESSION_ID', 'CLAUDE_WEBUI_PORT']);
const APP_MARK_ENV = 'VIBESPACE_DESKTOP_APP';
const KEPT_ENV = Object.freeze(['VIBESPACE_INSTANCE_NAME']);
let handedDrop = null;
function dropHandedAtBoot({ env = process.env } = {}) {
  const has = Object.prototype.hasOwnProperty.call(env, CE.HANDED_MARK);
  const listed = new Set(has ? CE.namesOfMark(env[CE.HANDED_MARK]) : []);
  const person = new Set(CE.PERSON_SESSION_ENV);
  const creds = new Set(HV.HUB_KNOBS.credentials.map((c) => c && c.name).filter(Boolean));
  const kept = new Set(KEPT_ENV);
  const dropped = [];
  // B-2c5c (4c), 主开发 r4380: the background job this hub was started INSIDE (its handed id, a name and never a secret) is kept for the
  // boot's one journal line (src/server/jobs-wiring.js) — the job's memory bound holds this VibeSpace
  const handedJob = env.VIBESPACE_JOB_ID;   // read, never written (test-architecture §112)
  const jobId = typeof handedJob === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(handedJob) ? handedJob : null;
  for (const k of Object.keys(env)) {
    if (person.has(k)) continue;
    if (creds.has(k)) continue;
    if (kept.has(k)) continue;
    const job = k.startsWith('VIBESPACE_JOB_');
    const handed = has && (k === CE.HANDED_MARK || listed.has(k) || k === APP_MARK_ENV || PAGE_HELPER_ENV.includes(k));
    if (job || handed) { delete env[k]; dropped.push(k); }
  }
  handedDrop = { by: has ? 'mark' : 'none', dropped: dropped.sort(), jobId };
  return handedDrop;
}
/** B-2c5c (4c): the background job this hub was started inside (its id), or null */
function handedJobId(d = handedDrop) { return d && d.jobId ? d.jobId : null; }
/** The boot narrative's one line for it (names only, never a value) — null when no mark was found. */
function handedLine(d = handedDrop) {
  if (!d || d.by !== 'mark') return null;
  return `[env] started inside a VibeSpace (its handed mark): dropped ${d.dropped.length} name${d.dropped.length === 1 ? '' : 's'} a parent conversation, job or app handed — ${d.dropped.join(', ')}`;
}

module.exports = { setHubRoot, hub, OWN_HOME_DIR, OVERRIDE_ENV, SEAM_ENV, seamOf, HUB_DROPS, sshOnOwnFiles, tmpRootsOf, tmpRoots, judge, throwaway, rehomeAtBoot, boot, view, bootLine, unruledLine, dropHandedAtBoot, handedLine, handedJobId, PAGE_HELPER_ENV, KEPT_ENV };
