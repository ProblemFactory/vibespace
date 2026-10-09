'use strict';
/**
 * THE pre-resume writer sweep — ONE implementation for every machine
 * (CS separation, 2.276.0).
 *
 * THE INVARIANT it enforces: before resuming a conversation, no OTHER process
 * may still be writing that conversation's transcript. Two writers on one
 * JSONL is the B-4058 corruption class ("resume did nothing", vanishing
 * turns, keeper remnants that fool diagnosis).
 *
 * WHY IT LIVES HERE: it used to be a template literal inside the WS create
 * handler with THREE transport-specific invocations — and LOCAL had none at
 * all. A local resume of a conversation still held by a claude in an external
 * terminal had exactly the same double-writer risk; the fix only ever landed
 * on the remote paths because that is where the incident was reported. That
 * asymmetry is the bug class the CS separation exists to kill: the local twin
 * is the one nobody exercises when fixing a remote bug. Now `hostId` is just
 * a parameter — falsy means this machine (device #0) — and one call site
 * serves ssh, dial and local.
 */

/** THE /proc fd scan, as POSIX shell functions — ONE implementation (B-3185).
 *
 *  `vs_fd_scan <ere>` prints `<pid>\t<fd target>` for every open fd whose
 *  symlink target matches; `vs_fd_pids <ere>` reduces that to a deduped pid
 *  list. Emitted into the sweep script AND into boot-restore's "who holds this
 *  conversation's JSONL" probe, which is the same scan with the kill removed.
 *
 *  WHY BATCHED: the sweep used to fork an `ls` + a `grep` PER PROCESS —
 *  measured on the dev box (32 cores, loadavg 3.4, 3678 processes) that is
 *  7356 forks and 9.9–10.7s wall, over half the 20s budget spent on fork/exec
 *  alone and past it entirely on a busier or bigger machine; boot-restore's
 *  variant forked a `readlink` PER FD (405,735 of them here, ~6.4 minutes) and
 *  so ALWAYS blew its own 6s timeout into a silent empty result. One `ls -l`
 *  over 400 fd directories plus one awk does the same scan in 3.0s / ~20
 *  forks — 20s now covers ~24k processes.
 *
 *  WHY CHUNKED: `vs_fd_chunk` EXECS `ls`, so its argv is one operand per
 *  process and is bounded by ARG_MAX/MAX_ARG_STRLEN — a single `ls` over every
 *  process on a big machine is one execve whose size grows with the process
 *  table, and an E2BIG there fails into a discarded stderr and a silently empty
 *  result. 400-directory chunks can never reach that limit. (The OLD probe's
 *  `/proc/[0-9]*` `/fd/` fd-level glob was consumed by a SHELL for-loop — it
 *  never reached execve at all, so ARG_MAX was never its problem; its problem
 *  was the 405,735 `readlink` forks.)
 *
 *  WHY /proc/self/fd rides in every chunk: `ls -l` prints the `<dir>:` headers
 *  the pid attribution reads ONLY when it has more than one operand — a chunk
 *  that happened to hold a single process would otherwise attribute nothing.
 *  It is ALSO why the awk clears `p` on EVERY directory header and not only on
 *  the ones it recognises: `/proc/self/fd` is the fd table of the `ls` process
 *  itself, which inherits the caller's fds — with a sticky `p`, an inherited
 *  matching fd (the sweeping shell's own, a redirect, an editor's) was
 *  attributed to whichever numeric pid came last in the chunk, and the sweep
 *  would SIGTERM a process that never held the transcript. */
function fdScanShellFns() {
  return `vs_fd_chunk() {
  ls -l "$@" /proc/self/fd 2>/dev/null | awk '
    BEGIN { pat = ENVIRON["VS_FD_PAT"] }
    $0 ~ "^/.*:$" { p = ""; if ($0 ~ "^/proc/[0-9]+/fd:$") p = substr($0, 7, length($0) - 10); next }
    p != "" && $0 ~ pat { i = index($0, " -> "); if (i) print p "\\t" substr($0, i + 4) }
  '
}
vs_fd_scan() {
  VS_FD_PAT=$1; export VS_FD_PAT
  set --
  for pdir in /proc/[0-9]*; do
    set -- "$@" "$pdir/fd"
    [ $# -lt 400 ] || { vs_fd_chunk "$@"; set --; }
  done
  [ $# -eq 0 ] || vs_fd_chunk "$@"
  return 0
}
vs_fd_pids() { vs_fd_scan "$1" | cut -f1 | sort -u; }`;
}

/** THE CLI identity test (`vs_is_cli <pid> <name>`) is NOT defined here — it
 *  lives in src/cli-identity.js together with its JS twin, and is re-exported
 *  so every existing call site keeps its import.
 *
 *  WHY IT MOVED (B-3185 r3): the same question — "is pid N the agent CLI?" — is
 *  asked by this sweep (who gets a SIGTERM), by the ssh discovery CO leg (which
 *  codex threads are RUNNING) and by src/discovery-facts.js in JavaScript (the
 *  local listing + the device snapshot's lock scan). r1/r2 fixed the shell
 *  spelling and RECORDED the JS one as a deliberate twin; a rule with two
 *  spellings has two behaviours the moment either is touched, so both now sit
 *  in one file with a parity suite that drives the SAME live pids through both.
 *
 *  The fd evidence stays the sweep's PRIMARY signal (this process holds THIS
 *  conversation's transcript open); the identity test only decides whether the
 *  holder is the agent CLI (a writer) or a reader that must be left alone. */
const { cliIdentityShellFns } = require('./cli-identity');
/** THE BIRTH TEST (`vs_same_proc <pid> <token>`, B-5ee1) — the sh twin of src/proc-identity.js, embedded verbatim: a
 *  daemon meta's childPid is SIGTERMed only while the meta's `startTime` (agentd's spawn token) still names it. */
const PI = require('./proc-identity');
const { procIdentityShellFns } = PI;

/** THE writer sweep's harness-neutral pieces. The per-harness HOLDER legs
 *  (which fds / lock files / argv name a writer of THIS conversation) are the
 *  descriptor's `store.writerSweep(rid, shq, {protectSids})` — claude and
 *  codex each compose their script from these pieces in their own file
 *  (src/harnesses/claude.js, codex.js); this module never branches on a
 *  harness id. `sweepSharedLegs()` = the daemon pipe-session-meta and keeper
 *  legs every script ends with (they reference the conversation id verbatim
 *  whatever the harness). Every kill leg echoes `SWEPT:<pid>` so the caller
 *  can TELL THE USER what was stopped (the honesty rule — a sweep is
 *  destructive by design); a meta pid whose recorded birth no longer names it
 *  echoes `REFUSED:<pid>:<why>` and is NOT signalled (B-5ee1); a birth-less
 *  meta (an older daemon) echoes `LEGACY:<pid>` and keeps today's rung. */
function sweepSharedLegs() {
  return `${procIdentityShellFns()}
for kf in "$HOME"/.vibespace/*/state/sessions/*.json; do
  [ -e "$kf" ] || continue
  grep -q "$RID" "$kf" 2>/dev/null || continue
  grep -q '"exited"' "$kf" 2>/dev/null && continue
  cpid=$(sed -n 's/.*"childPid":\\([0-9]*\\).*/\\1/p' "$kf" | head -1)
  [ -n "$cpid" ] || continue
  cst=$(sed -n 's/.*"startTime":"\\([^"]*\\)".*/\\1/p' "$kf" | head -1)
  if [ -z "$cst" ]; then echo "LEGACY:$cpid"; kill -TERM "$cpid" 2>/dev/null && echo "SWEPT:$cpid"
  elif vs_same_proc "$cpid" "$cst"; then kill -TERM "$cpid" 2>/dev/null && echo "SWEPT:$cpid"
  else case "$VS_SAME_WHY" in pid-recycled|unknown) echo "REFUSED:$cpid:$VS_SAME_WHY";; esac; fi
done
find "$HOME/.vibespace/run" -maxdepth 1 -name '*.json' 2>/dev/null | while read -r kf; do
  grep -q "$RID" "$kf" 2>/dev/null || continue
  grep -q '"exited"' "$kf" 2>/dev/null && continue
  node "$HOME/.vibespace/bin/vibespace-remote-keeper" stop "$(basename "$kf" .json)" 2>/dev/null | grep '^REFUSED:' || true
done`;
}

/** Run the sweep on ANY machine. hostId falsy ⇒ this machine (device #0).
 *  Returns {swept: [pid…], via: 'device'|'ssh'}; throws if it could not run
 *  (the caller must decide: refuse the resume, or warn and continue).
 *  `sweep` = the harness descriptor's `store.writerSweep` (src/resume-store.js
 *  writerSweepOpts resolves it with the protect list). */
async function sweepWriters(hosts, hostId, rid, { shq, timeoutMs = 20000, connectMs = 15000, execFileAsync, sweep, protectSids = [] } = {}) {
  if (typeof sweep !== 'function') throw new Error('sweepWriters: no store.writerSweep hook for this harness');
  const script = sweep(rid, shq, { protectSids });
  try {
    const dm = await hosts.deviceBounded(hostId, connectMs);
    const r = await dm.runCmd('sh', ['-c', script], { timeoutMs });
    return { swept: parseSwept(r?.stdout), ...sayRefused(r?.stdout, hostId), via: 'device' };
  } catch (e) {
    // ssh hosts keep the legacy per-op channel as the fallback the data plane
    // has always had; local and dial have no second channel by design.
    if (!hostId || !execFileAsync) throw e;
    const h = hosts.get(hostId);
    if (h?.transport === 'dial') throw e;
    const out = await execFileAsync('ssh', [...hosts.sshArgs(h, { multiplex: true }), '--', script], { timeout: timeoutMs, encoding: 'utf-8' });
    return { swept: parseSwept(out), ...sayRefused(out, hostId), via: 'ssh' };
  }
}

/** REFUSED:<pid>:<why> / LEGACY:<pid> lines → { refused: [{pid, why}], legacy: [pid] }, each said ONCE by name in the
 *  journal (the door: writer sweep). A refused pid is not ours any more — nothing of VibeSpace's holds the file. */
function parseRefused(stdout) {
  const refused = [], legacy = [];
  for (const line of String(stdout || '').split('\n')) {
    const m = /^REFUSED:(\d+):([\w-]+)/.exec(line.trim());
    if (m) refused.push({ pid: m[1], why: m[2] });
    const l = /^LEGACY:(\d+)/.exec(line.trim());
    if (l) legacy.push(l[1]);
  }
  return { refused, legacy };
}
const _refusedSaid = new Set();
function sayRefused(stdout, hostId) {
  const r = parseRefused(stdout), where = hostId || 'this machine';
  for (const x of r.refused) {
    if (_refusedSaid.has(`${where}:${x.pid}`)) continue;
    _refusedSaid.add(`${where}:${x.pid}`);
    console.warn(`[writer-sweep] ${where}: pid ${x.pid} — the daemon meta's recorded birth no longer names it (${x.why}), not signalled`);
  }
  for (const pid of r.legacy) PI.legacyOnce(`writer sweep on ${where}`, pid);
  return r;
}

function parseSwept(stdout) {
  const out = [];
  for (const line of String(stdout || '').split('\n')) {
    const m = /^SWEPT:(\d+)/.exec(line.trim());
    if (m) out.push(m[1]);
  }
  return out;
}

module.exports = { sweepSharedLegs, sweepWriters, parseSwept, parseRefused, fdScanShellFns, cliIdentityShellFns, procIdentityShellFns };
