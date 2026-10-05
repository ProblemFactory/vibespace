'use strict';
/**
 * THE MACHINE'S ONE PACKAGE SLOT — PURE, imports nothing (lane dc-apps-rows, 2026-10-04; review rv-desktop-apps F-I1 /
 * F-I3). Every install on a machine — an installable of src/installs.js (xpra, the LibreOffice set, TightVNC), an app
 * of the app system's Layer 0/1 (src/app-serve.js plans, src/server/apps-engine.js runs) — goes through ONE slot: the
 * detached runner + launcher below (its pidfile, exit file and kernel-held lock), the apt-get lock wait, Debian's
 * package-name rule, and the generic apt plan over a closed spec. The slot NEVER knows what it installs: a row of
 * src/installs.js (or an app plan) hands it a plan; nothing here names an installable.
 * The slot's files keep their historical names (`xpra-install.*`, lock prefix `vibespace-xpra-install-`): a renamed
 * pidfile / lock would not see an install an older release started across an upgrade (two apts on one machine) — the
 * names are data here, read by the launcher, desktop-display installState and app-serve; nobody branches on them.
 * Moved here VERBATIM from src/desktop-apps.js (which re-exports them for its old callers and the suites).
 */
const shq = (s) => `'${String(s).replace(/'/g, '\'"\'"\'')}'`;
/** THE ROOT SCRIPT + THE COMMANDS A PERSON TYPES for a plan's steps (PURE — every install plan spells them here, §7.9
 *  generalised the xpra plan's two lines): the script runs every step as root, each echoed first, under `set -e`; in
 *  `commands` a step carries sudo (a subshell / printf line as `sudo sh -c '<line>'`), a step named in `plain` is
 *  typed as is (a check a person runs as themselves). */
function planLines(steps, { plain = [] } = {}) {
  const script = ['set -e', ...steps.map((l) => `echo '+ ${l.replace(/'/g, '\'"\'"\'')}'; ${l}`)].join('\n');
  const commands = steps.map((l) => (plain.includes(l) ? l : l.startsWith('(') || l.startsWith('printf') ? `sudo sh -c ${shq(l)}` : `sudo ${l}`));
  return { script, commands };
}
/** Debian's package-name rule — every name that reaches a plan's root script line is re-checked against it. */
const PKG_RE = /^[a-z0-9][a-z0-9+.-]{1,63}$/;
/** How long apt waits for ANOTHER apt's lock (a desktop's unattended-upgrades, an xpra install on the same machine —
 *  each its own slot) before it gives up by name, instead of failing at once with "Could not get lock". */
const APT_LOCK_WAIT_S = 300;
/**
 * A PACKAGE INSTALL PLAN from the machine's OWN apt sources (PURE; §7.9 — LibreOffice; the xpra plan's shape and
 * refusals): `no_facts` / `no_x11` / `no_apt` BY NAME before anything runs, then `apt-get update` + ONE
 * `apt-get install -y <packages>` + the spec's check, and `canRun` (root or passwordless sudo, else `no_sudo` with the
 * commands to copy). `spec` = `{what, label, packages, verify}` from a CLOSED table (src/office-open.js
 * installSpecFor) — a request never names a package; every name is re-checked against PKG_RE and the check against a
 * fixed shape before either reaches a root shell line (else `bad-request`).
 *   → { ok:true, source:'apt', what, label, packages, script, commands[], canRun, code:null|'no_sudo', error, root }
 */
function packageInstallPlan(f, spec) {
  const s = spec && typeof spec === 'object' ? spec : null;
  if (!s || !Array.isArray(s.packages) || !s.packages.length || !s.packages.every((p) => typeof p === 'string' && PKG_RE.test(p)) || !/^command -v [a-z][a-z0-9.-]{0,63}$/.test(String(s.verify || ''))) return { ok: false, code: 'bad-request', error: 'not a known install' };
  const label = String(s.label || s.what || 'the package');
  if (!f || typeof f !== 'object') return { ok: false, code: 'no_facts', error: 'the machine did not report its install facts (an older agent?)' };
  if (f.platform && f.platform !== 'linux') return { ok: false, code: 'no_x11', error: `${f.platform === 'darwin' ? 'macOS' : f.platform === 'win32' ? 'Windows' : f.platform} has no X11 server — desktop apps need Linux` };
  if (!f.apt) return { ok: false, code: 'no_apt', error: `${f.prettyName || f.distro || 'this Linux'} has no apt-get — install ${label} with its own package manager (VibeSpace drives apt only)` };
  const packages = s.packages.slice();
  const wait = `-o DPkg::Lock::Timeout=${APT_LOCK_WAIT_S}`;
  const steps = [`apt-get ${wait} update`, `DEBIAN_FRONTEND=noninteractive apt-get ${wait} install -y ${packages.join(' ')}`, s.verify];
  const { script, commands } = planLines(steps, { plain: [s.verify] });
  const canRun = !!(f.root || f.sudo);
  return { ok: true, source: 'apt', what: s.what || null, label, packages, script, commands, canRun, code: canRun ? null : 'no_sudo', error: canRun ? null : 'this machine has no passwordless sudo — run the commands below yourself, then check again', root: !!f.root };
}
/** The argv that RUNS a plan's script on its machine (the same argv on every transport: in-process spawn on this
 *  machine, the agentd `run-stream` op on a paired one). */
function installArgv(plan) { return plan && plan.root ? ['sh', '-c', plan.script] : ['sudo', '-n', 'sh', '-c', plan.script]; }

/**
 * THE INSTALL RUNS DETACHED (desktop lane C verify r2 F3 + F4, 2026-09-25). The install used to be a CHILD of whoever
 * started it — the hub process on this machine, the agent daemon's run-stream on a paired one — its stdout a pipe into
 * that process. The hub restarts (an Update, a crash, an OOM) and the daemon re-execs on every hub update: the pipe
 * closed, and the install's shell and dpkg died at their next line by SIGPIPE (measured: rc 141 mid-run; a dpkg
 * killed mid-unpack leaves "dpkg was interrupted"), while the in-memory "one install per machine" slot died with the
 * hub — a second click started a second apt beside any survivor ("Could not get lock … exit 100").
 * So the install runs in its OWN session (`setsid`), stdin /dev/null, stdout + stderr APPENDED to a log file on the
 * machine, and the slot IS a pidfile beside it: `<stateDir>/xpra-install.pid` = "<pid> <starttime> <lock>" of the
 * detached runner (a recycled pid is never taken for it), `xpra-install.exit` = "<code> <unix nanoseconds> <lock>" once
 * it ends (nanoseconds since verify r5 L1, below); who may START one is decided by a lock the running install holds (verify r4, below). The hub
 * only FOLLOWS the log (`tail --pid`) — a follower that dies (hub gone, link gone, daemon re-exec) leaves the install
 * running; a new follower re-attaches (the facts op reports `installing: {pid, since, lock}` while the pid+starttime
 * lives).
 * `stateDir` = the machine keeper's data dir (a device's ~/.vibespace, the hub's data/); empty ⇒ $HOME/.vibespace.
 * Only the plan's `script` runs as root; the state dir and the argv are POSITIONAL parameters, never interpolated.
 * The launcher (the follower), $1 = the runner text, $2 = stateDir, $3 = start|follow, "$@" = the install argv:
 *   a live recorded install ⇒ follow it (never a second — whatever the mode); `follow` with none running ⇒ its last
 *   log and recorded exit; `start` ⇒ start the runner detached, wait for its pidfile, follow. Exits with the install's
 *   RECORDED exit code, or INSTALL_UNRECORDED_EXIT when the runner ended without recording one (killed / a reboot).
 * Linux + GNU coreutils (`tail --pid`, fractional `sleep`, `sha1sum`) + util-linux `setsid` and `flock` — the plan only
 * runs on apt systems.
 */
const INSTALL_FILES = Object.freeze({ log: 'xpra-install.log', pid: 'xpra-install.pid', exit: 'xpra-install.exit' });
const INSTALL_UNRECORDED_EXIT = 199;
/** The install LOCK's file name, beside nothing of the state dir's (verify r4): `<runtime dir>/<prefix><first 12 hex of
 *  sha1(realpath of the state dir)>.lock` — LOCAL storage (the state dir may sit on NFS / FUSE, where flock is not
 *  dependable). The runtime dir is named by the UID, never the environment (verify r5 L3): /run/user/<uid> when it is a
 *  writable directory this user owns, else /tmp/vibespace-<uid> (created 0700; refused by name when it is not a
 *  directory this user owns). The launcher names it; the pidfile and the exit file record the name it used
 *  (installState reports it). */
const INSTALL_LOCK_PREFIX = 'vibespace-xpra-install-';
/*
 * verify r4 (2026-09-25) — THE SLOT IS A LOCK THE KERNEL HOLDS FOR THE RUNNING INSTALL.
 * r3 claimed the slot with a `mkdir` lock directory + an owner file + a break rule for a dead or ownerless owner. The
 * break rule was a race: a lock is ownerless for a moment during every claim (mkdir, then the owner file), so a
 * breaker could remove it between another claimer's mkdir and its owner rename — both then started a runner
 * (measured with the r3 launcher: 1–4 in 150 starts over an empty dir, 12–17 in 20 with a 30–50 ms slower rename).
 * Now the launcher opens a lock FILE on local storage (INSTALL_LOCK_PREFIX) as fd 9 and takes `flock -n 9` BEFORE it
 * spawns; the runner is started with fd 9 still open, so the lock is held by the running install itself — the runner
 * shell and apt-get (apt-get closes inherited descriptors for the children it forks — APT::Keep-Fds — so dpkg never
 * holds it; a dpkg outliving both is fenced by dpkg's own lock) — and the kernel drops it the instant the last holder
 * exits or is killed.
 * Nothing is ever broken by hand, nothing is stale, nothing waits on a guessed owner. The launcher closes its own copy
 * once the runner is started; the runner re-asserts the lock (`flock -n 9` on the inherited descriptor) FIRST, before
 * it reads or records anything, and refuses without touching the slot's files when it does not hold it.
 * A start that finds the lock held FOLLOWS: it polls (≤ 20 s) for the holder's pidfile and follows that runner's log;
 * if the lock frees first, the install it waited on ended already — its recorded exit (written before the lock
 * frees) is this start's answer when it is newer than this start, in nanoseconds (r5 L1); otherwise nothing ran since
 * this start was asked,
 * and this start holds the lock now — it runs the install. A lock that stays held with no install recorded for 20 s
 * (a process an earlier install started may still hold it) is refused by name. The lock file is never removed (a
 * removed lock file lets two holders lock two different files); after taking the lock a start re-reads the pidfile
 * and follows a live recorded install (a belt for a lock file that was removed under a running install).
 * M1 (r3): the winner resets pid/starttime, reads only the NEW pidfile, and `tail --pid` follows that runner only while
 * it is not PROVEN gone. L5: `setsid` and `flock` (util-linux) are checked before anything else. L8: a starttime that
 * cannot be read (no /proc) is refused by the runner before it runs (the pidfile's identity needs it).
 * Every refusal is exit 125 with one line naming its cause; nothing here ever signals the install.
 * verify r5 (2026-09-25, four lows):
 *  L1 "the install this start waited on" is decided in NANOSECONDS: the runner's exit file records `date +%s%N` and a
 *     start answers it only when it is strictly newer than the start itself (`-gt`). In whole seconds (r4, `-ge`) a
 *     start in the SAME second as an earlier install's exit — while a child that install left behind still held the
 *     lock — answered that stale exit instead of running (6 of 6). A clock without %N compares as no number: the start
 *     runs (it holds the lock — never a second install beside one).
 *  L2 (wording) the lock is held by the runner shell and apt-get, never dpkg (above).
 *  L3 the lock's directory is named by the uid, never $XDG_RUNTIME_DIR: two spawners with different environments (the
 *     hub under systemd, a daemon started from an ssh login; a runtime dir logind removed) named two locks for one state
 *     dir, and the /tmp name was predictable. `id -u` that is not a number is refused by name.
 *  L4 the wait for the runner's pidfile is bounded by the runner's own life (`$!`: setsid execs in place in a shell
 *     without job control, so it is the runner's pid): a runner that refused (it was not handed the lock) is reported
 *     at once with its own line, not after the full 10 s.
 * Pidfile "<pid> <starttime> <lock>", exit file "<code> <unix nanoseconds> <lock>".
 * Runner: $1 pidfile, $2 log, $3 exit file, $4 the lock file (held as fd 9), "$@" the install argv.
 */
const INSTALL_RUNNER = [
  'P=$1; L=$2; X=$3; K=$4; shift 4',
  'st() { sed \'s/^.*) //\' "/proc/$1/stat" 2>/dev/null | cut -d\' \' -f20; }',
  'w=; fin() { echo "$1 $(date +%s%N) $K" > "$X.tmp" && mv -f "$X.tmp" "$X"; [ -z "$w" ] || rm -f "$P"; exit "$1"; }', // r5 L1: nanoseconds
  'flock -n 9 2>/dev/null || { echo "+ [vibespace] this install does not hold the install lock ($K) - it was not run" >> "$L"; exit 125; }', // FIRST: the inherited lock, re-asserted; not held ⇒ the slot's files are another install's: untouched
  's=$(st $$); [ -n "$s" ] || { sleep 0.05; s=$(st $$); }', // one retry: a refusal is for a /proc that cannot be read, never a blip
  '[ -n "$s" ] || { echo "+ [vibespace] cannot read /proc/$$/stat on this machine - the install slot needs it; nothing was run" >> "$L"; fin 125; }',
  'echo "$$ $s $K" > "$P.tmp" && mv -f "$P.tmp" "$P"; w=1',
  '"$@" >> "$L" 2>&1 < /dev/null',
  'fin $?',
].join('\n');
const INSTALL_LAUNCHER = [
  'exec 2>&1',
  'R=$1; D=${2:-$HOME/.vibespace}; M=$3; shift 3',
  `L=$D/${INSTALL_FILES.log}; P=$D/${INSTALL_FILES.pid}; X=$D/${INSTALL_FILES.exit}`,
  'st() { sed \'s/^.*) //\' "/proc/$1/stat" 2>/dev/null | cut -d\' \' -f20; }',
  'live() { [ -n "$1" ] && [ -n "$2" ] && [ "$(st "$1")" = "$2" ]; }',
  'gone() { [ -z "$1" ] || [ ! -e "/proc/$1" ] || { t=$(st "$1"); [ -n "$t" ] && [ "$t" != "$2" ]; }; }', // PROVEN gone: no /proc entry, or a readable starttime that differs — an empty probe proves nothing
  'rec() { pid=; s=; k=; [ -r "$P" ] && read pid s k < "$P"; live "$pid" "$s"; }', // a live RECORDED install (pid + starttime)
  'run() { echo "+ [vibespace] an install is already running on this machine (pid $pid) - following its log"; }',
  'mine=',
  'if rec; then run',
  'elif [ "$M" = follow ]; then', // follow never takes the lock
  '  echo "+ [vibespace] no install is running on this machine - its last log follows"',
  '  [ -r "$L" ] && cat "$L"',
  `  if [ -r "$X" ]; then read c at k < "$X"; exit "$c"; fi`,
  `  exit ${INSTALL_UNRECORDED_EXIT}`,
  'else',
  '  command -v setsid >/dev/null 2>&1 || { echo "+ [vibespace] setsid (util-linux) is missing on this machine - the install cannot run detached; install util-linux, then check again"; exit 125; }',
  '  command -v flock >/dev/null 2>&1 || { echo "+ [vibespace] flock (util-linux) is missing on this machine - the install slot cannot be locked; install util-linux, then check again"; exit 125; }',
  '  mkdir -p "$D" 2>/dev/null; [ -d "$D" ] && [ -w "$D" ] || { echo "+ [vibespace] $D is not writable on this machine - the install cannot record itself there"; exit 125; }',
  '  u=$(id -u 2>/dev/null); case $u in ""|*[!0-9]*) echo "+ [vibespace] this user id cannot be read (id -u) - the install lock cannot be named; nothing was run"; exit 125 ;; esac',
  '  T=/run/user/$u; [ -d "$T" ] && [ -w "$T" ] && [ -O "$T" ] || { T=/tmp/vibespace-$u; mkdir -m 700 "$T" 2>/dev/null; }', // LOCAL storage (the state dir may be on NFS / FUSE), named by the UID — never the environment (r5 L3)
  '  [ ! -L "$T" ] && [ -d "$T" ] && [ -w "$T" ] && [ -O "$T" ] || { echo "+ [vibespace] $T is not a directory this user owns - the install lock cannot be taken there; nothing was run"; exit 125; }',
  '  rp=$(cd "$D" 2>/dev/null && pwd -P); h=$(printf %s "$rp" | sha1sum 2>/dev/null | cut -c1-12)',
  `  K=$T/${INSTALL_LOCK_PREFIX}$h.lock`,
  '  [ -n "$rp" ] && [ ${#h} -eq 12 ] && { command exec 9>>"$K"; } 2>/dev/null || { echo "+ [vibespace] the install lock cannot be taken on $K (it cannot be opened) - nothing was run"; exit 125; }',
  '  t0=$(date +%s%N); lost=; n=0', // r5 L1: this start's own instant, in nanoseconds
  '  while :; do',
  '    if rec; then exec 9>&-; run; break; fi', // a live recorded install: follow it (also the belt after taking the lock)
  '    if flock -n 9; then', // held by this start now: every earlier holder (the runner, apt-get) is gone
  '      if rec; then exec 9>&-; run; break; fi',
  '      if [ -n "$lost" ] && [ -r "$X" ] && read c at k < "$X" && [ "${at:-0}" -gt "$t0" ] 2>/dev/null; then exec 9>&-; [ -r "$L" ] && cat "$L"; exit "$c"; fi', // the install this start waited on ended AFTER this start began (r5 L1: nanoseconds, strictly newer): its answer
  '      mine=1; break',
  '    else',
  '      e=$?; [ $e -eq 1 ] || { echo "+ [vibespace] the install lock cannot be taken on $K (flock exit $e) - nothing was run"; exit 125; }',
  '    fi',
  '    lost=1; n=$((n+1)); [ $n -le 400 ] || { echo "+ [vibespace] the install lock ($K) is held but no install is recorded as running after 20 s - a process an earlier install started may still hold it; check again"; exit 125; }',
  '    sleep 0.05',
  '  done',
  'fi',
  'if [ -n "$mine" ]; then', // this start holds the lock: start the runner detached, WITH the lock (fd 9)
  '  touch -c "$K" 2>/dev/null', // an old lock file in an aged /tmp is never swept from under a running install
  '  pid=; s=', // M1: never the old pidfile's pid
  '  rm -f "$X" "$P" "$P.tmp"; { command : > "$L"; } 2>/dev/null || { echo "+ [vibespace] $L cannot be written - nothing was run"; exit 125; }',
  '  setsid sh -c "$R" vs-install-run "$P" "$L" "$X" "$K" "$@" < /dev/null > /dev/null 2>>"$L" &',
  '  b=$!; exec 9>&-', // the runner holds the lock now (its inherited fd 9 — the runner shell and apt-get)
  '  n=0; while [ ! -s "$P" ] && [ ! -s "$X" ] && [ $n -lt 200 ] && [ -e "/proc/$b" ]; do sleep 0.05; n=$((n+1)); done', // r5 L4: bounded by the runner's own life
  '  [ -s "$P" ] && read pid s k < "$P" 2>/dev/null',
  '  r=$pid; [ -n "$s" ] && ! gone "$pid" "$s" || pid=', // M1: tail follows only the NEW runner's pid, and only while it is not proven gone
  '  if [ -z "$pid" ]; then', // the runner ended already (or never began): its recorded exit, else why not
  '    if [ -s "$X" ]; then cat "$L"; read c at k < "$X"; exit "$c"; fi',
  '    [ -r "$L" ] && cat "$L"',
  `    if [ -n "$r" ]; then echo "+ [vibespace] the install ended without recording its exit (it was stopped, or the machine restarted) - check again"; exit ${INSTALL_UNRECORDED_EXIT}; fi`,
  '    echo "+ [vibespace] the install did not start (no pid in $P)"; exit 125',
  '  fi',
  'fi',
  'tail -s 0.2 --pid="$pid" -n +1 -f "$L"',
  `if [ -r "$X" ]; then read c at k < "$X"; exit "$c"; fi`,
  'echo "+ [vibespace] the install ended without recording its exit (it was stopped, or the machine restarted) - check again"',
  `exit ${INSTALL_UNRECORDED_EXIT}`,
].join('\n');
/** The argv that STARTS (or re-attaches to) an install on its machine — identical on both transports. */
function installLauncherArgv(argv, { stateDir = '', mode = 'start' } = {}) {
  return ['sh', '-c', INSTALL_LAUNCHER, 'vs-install', INSTALL_RUNNER, String(stateDir || ''), mode === 'follow' ? 'follow' : 'start', ...(Array.isArray(argv) ? argv.map(String) : [])];
}

module.exports = {
  planLines, PKG_RE, APT_LOCK_WAIT_S, packageInstallPlan, installArgv, // §7.9: the generalised install plan + the argv that runs it
  INSTALL_FILES, INSTALL_UNRECORDED_EXIT, INSTALL_LOCK_PREFIX, INSTALL_RUNNER, INSTALL_LAUNCHER, installLauncherArgv, // lane C verify r2 (F3 + F4), r4 (the kernel-held lock)
};
