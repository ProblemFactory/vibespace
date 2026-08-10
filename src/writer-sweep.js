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

/** POSIX sweep script. Every kill leg echoes `SWEPT:<pid>` so the caller can
 *  TELL THE USER what was stopped instead of silently killing their terminal
 *  session (the honesty rule — a sweep is destructive by design). */
function writerSweepScript(rid, shq) {
  return `RID=${shq(rid)}
# writer sweep, portable: /proc fd scan on Linux; lsof on macOS/BSD ssh hosts
# (no /proc there — the old script silently swept NOTHING, audit 2.192.0).
# cmdline checks use POSIX \`ps -o args=\` (same idiom as killRemotePid).
if [ -d /proc/1 ] || [ -d /proc/self ]; then
  for pdir in /proc/[0-9]*; do
    [ -e "$pdir" ] || continue
    ls -l "$pdir/fd" 2>/dev/null | grep -q "/$RID.jsonl" || continue
    pid=$(basename "$pdir")
    case "$(ps -p "$pid" -o args= 2>/dev/null)" in *claude*) kill -TERM "$pid" 2>/dev/null && echo "SWEPT:$pid";; esac
  done
elif command -v lsof >/dev/null 2>&1; then
  J=$(find "$HOME/.claude/projects" -maxdepth 2 -name "$RID.jsonl" 2>/dev/null | head -1)
  if [ -n "$J" ]; then
    for pid in $(lsof -t -- "$J" 2>/dev/null); do
      case "$(ps -p "$pid" -o args= 2>/dev/null)" in *claude*) kill -TERM "$pid" 2>/dev/null && echo "SWEPT:$pid";; esac
    done
  fi
fi
find "$HOME/.claude/sessions" -maxdepth 1 -name '*.json' 2>/dev/null | while read -r f; do
  pid=$(basename "$f" .json)
  grep -q "\\"sessionId\\":\\"$RID\\"" "$f" 2>/dev/null || continue
  kill -0 "$pid" 2>/dev/null || continue
  case "$(ps -p "$pid" -o args= 2>/dev/null)" in *claude*) kill -TERM "$pid" 2>/dev/null && echo "SWEPT:$pid";; esac
done
for kf in "$HOME"/.vibespace/*/state/sessions/*.json; do
  [ -e "$kf" ] || continue
  grep -q "$RID" "$kf" 2>/dev/null || continue
  grep -q '"exited"' "$kf" 2>/dev/null && continue
  cpid=$(sed -n 's/.*"childPid":\\([0-9]*\\).*/\\1/p' "$kf" | head -1)
  [ -n "$cpid" ] && kill -TERM "$cpid" 2>/dev/null && echo "SWEPT:$cpid"
done
find "$HOME/.vibespace/run" -maxdepth 1 -name '*.json' 2>/dev/null | while read -r kf; do
  grep -q "$RID" "$kf" 2>/dev/null || continue
  grep -q '"exited"' "$kf" 2>/dev/null && continue
  node "$HOME/.vibespace/bin/vibespace-remote-keeper" stop "$(basename "$kf" .json)" >/dev/null 2>&1 || true
done`;
}

/** Run the sweep on ANY machine. hostId falsy ⇒ this machine (device #0).
 *  Returns {swept: [pid…], via: 'device'|'ssh'}; throws if it could not run
 *  (the caller must decide: refuse the resume, or warn and continue). */
async function sweepWriters(hosts, hostId, rid, { shq, timeoutMs = 20000, connectMs = 15000, execFileAsync } = {}) {
  const script = writerSweepScript(rid, shq);
  try {
    const dm = await hosts.deviceBounded(hostId, connectMs);
    const r = await dm.runCmd('sh', ['-c', script], { timeoutMs });
    return { swept: parseSwept(r?.stdout), via: 'device' };
  } catch (e) {
    // ssh hosts keep the legacy per-op channel as the fallback the data plane
    // has always had; local and dial have no second channel by design.
    if (!hostId || !execFileAsync) throw e;
    const h = hosts.get(hostId);
    if (h?.transport === 'dial') throw e;
    const out = await execFileAsync('ssh', [...hosts.sshArgs(h, { multiplex: true }), '--', script], { timeout: timeoutMs, encoding: 'utf-8' });
    return { swept: parseSwept(out), via: 'ssh' };
  }
}

function parseSwept(stdout) {
  const out = [];
  for (const line of String(stdout || '').split('\n')) {
    const m = /^SWEPT:(\d+)/.exec(line.trim());
    if (m) out.push(m[1]);
  }
  return out;
}

module.exports = { writerSweepScript, sweepWriters, parseSwept };
