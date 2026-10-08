// THE PID CENSUS (B-1cc6, lane pid-identity-census — test-architecture §85 + test-pid-identity). A pid is never an
// identity: every signal / "is it alive" site in the server, the daemon, data/bin and the gate is a ROW naming what it
// signals and what proves the pid is still that process. An unlisted site is RED; a listed site whose proof is not on
// the page is RED; a row whose site is gone is DEAD.
//   identity  — goes through src/proc-identity.js (signalIdentity / aliveIdentity / sameProcess) or a gate built on it
//   starttime — the module's own pid+starttime proof (`guard` must sit within `win` lines above, or on the line)
//   scan      — the pid was read from a FRESH /proc / pgrep / cmdline scan in the same pass (`guard` = that scan)
//   handle    — the pid is this process's own ChildProcess handle (`guard` = the handle text on the line)
//   self      — process.pid
//   probe     — an existence probe whose answer never feeds a signal (display / a liveness wait)
//   user      — the owner named the pid in the process panel (his explicit kill)
//   unknown   — a RECORDED pid this build does not prove yet (EXEMPT, with why + a backlog line in the lane report)
import fs from 'fs';
import path from 'path';

export const SITE = /process\.kill\(|\bkill -(?:[0-9A-Z]|\$\{?)|\bpkill\b|\bkillall\b|tail --pid|\['kill'|\('kill'/;
const COMMENT = /^\s*(\/\/|\/?\*|#)/;
const OP = 'data/bin/vibespace-opencode-op', RK = 'data/bin/vibespace-remote-keeper', CI = 'scripts/ci.mjs', AG = 'src/agentd/agentd.js';
const RKWHY = 'a meta childPid/keeperPid proven by cmdline argv0 only (isOurChildPid / isKeeperPid) — the keeper ships to ssh hosts as one file and records no starttime yet';
const SHWHY = 'a remote agentd meta childPid read off disk in a shell sweep — the meta carries startTime, the shell does not compare it yet';
// [file, needle, kind, guard|why, signals, win = 12 lines above, sites = 1]
export const ROWS = [
  [OP, "process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'", 'probe', 'existence half of the serve verdict (cmdline + uid read beside it)', 'nothing'],
  [OP, "process.kill(pid, 'SIGTERM')", 'scan', 'v\\.verdict', 'a recorded opencode serve, after a cmdline+uid verdict read in the same call', 14],
  [OP, "process.kill(child.pid, 'SIGTERM')", 'handle', 'child.pid', 'its own spawned serve'],
  [RK, 'function pidAlive(pid) { try { process.kill(pid, 0)', 'probe', 'liveness polls of the keeper\'s child', 'nothing'],
  [RK, "process.kill(m.childPid, 'SIGTERM')", 'unknown', RKWHY, 'a pipe-mode orphan claude'],
  [RK, "process.kill(m.childPid, 'SIGKILL')", 'unknown', RKWHY, 'a pipe-mode orphan claude'],
  [RK, "process.kill(childPid, 'SIGTERM')", 'unknown', 'childPid = its spawn handle\'s pid OR a takeover-adopted meta pid (cmdline-only)', 'its claude on stop'],
  [RK, "for (const pid of targets) { try { process.kill(pid, 'SIGTERM')", 'unknown', RKWHY, 'stop: the child + the keeper'],
  [RK, "if (pidAlive(pid)) { try { process.kill(pid, 'SIGKILL')", 'unknown', RKWHY, 'stop: the child + the keeper'],
  ['deploy/docker/entrypoint.sh', 'kill -TERM "$child"', 'handle', '"$child"', 'the entrypoint\'s own $! child'],
  [CI, "process.kill(child.pid, 'SIGKILL'", 'handle', 'child.pid', 'a held gate child'],
  [CI, 'process.kill(o.pid, sig)', 'starttime', 'sameProcess\\(o,', 'the reaper\'s victims (own copy: rows from the same /proc pass; a starttime-less row passes)'],
  [CI, 'const alive = (pid) => { try { process.kill(pid, 0)', 'probe', 'the reaper\'s liveness wait', 'nothing'],
  [CI, "process.kill(-old.pid, 'SIGTERM')", 'scan', 'looksLikeHeavyRun\\(old\\.pid\\)', 'a superseded heavy run (lock record, its cmdline read now)'],
  ['src/adapters/claude-code.js', "process.kill(session._childPid, 'SIGINT')", 'unknown', 'an in-memory pid of this process\'s own pipe child, kept past the spawn tick (not the handle)', 'interrupt'],
  [AG, 'let alive = false; try { process.kill(pid, 0)', 'probe', 'a claude lock pid — discovery liveness', 'nothing'],
  [AG, 'try { process.kill(pid, 0); alive = true; }', 'probe', 'a session pid — discovery liveness', 'nothing'],
  [AG, 'try { process.kill(m.childPid, 0); }', 'probe', 'the existence half of _childAlive (adoption liveness); signals need _childProven', 'nothing'],
  [AG, "process.kill(m.childPid, 'SIGTERM')", 'identity', '_childProven\\(m\\)', 'a session child on TERMINATE (fixed: was _childAlive, which assumed alive when unverifiable)'],
  [AG, "process.kill(m.childPid, 'SIGKILL')", 'identity', '_childProven\\(m\\)', 'the same, 2.5 s later (fixed)'],
  ['src/browser-facts.js', "try { process.kill(pid, 0); } catch (e) { return !!(e && e.code === 'EPERM'); }", 'probe', 'pidAlive: existence + zombie; identity is sameProcess (proc-identity)', 'nothing'],
  ['src/cli-identity.js', 'kill -0 "$1" 2>/dev/null && return 0', 'probe', 'shell liveness inside the CLI identity fns', 'nothing'],
  // int237: daemon-orphan-end's `end-daemon` op (a paired machine's daemon with no browser) — the keeper's endProcess shape
  ['src/browser-serve.js', "try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }", 'starttime', 'same\\(\\)', 'a daemon with no browser the hub named by pid+starttime (end-daemon)', 8],
  ['src/browser-serve.js', "if (same()) { try { process.kill(pid, 'SIGKILL')", 'starttime', 'same\\(\\)', 'the same, 5 s later'],
  ['src/codex-reset-helper.js', 'process.kill(-child.pid, sig)', 'handle', '-child.pid', 'its own reset child\'s group'],
  ['src/desktop-display.js', 'function pidAlive(pid) {', 'probe', 'the existence half of desktop-display.sameProcess (pid+starttime)', 'nothing'],
  ['src/desktop-serve.js', 'const signalAll = (pids, sig) => { for (const p of pids) { try { process.kill(p, sig)', 'starttime', 'partIsOurs|display\\.sameProcess', 'a desktop session\'s proven parts', 16],
  ['src/desktop-serve.js', "if (leaderPid) { try { process.kill(-leaderPid, 'SIGTERM')", 'starttime', 'partIsOurs|leaderPid = ', 'the proven leader\'s group', 24],
  ['src/desktop-serve.js', "if (leaderPid) { try { process.kill(-leaderPid, 'SIGKILL')", 'starttime', 'partIsOurs|leaderPid = ', 'the proven leader\'s group', 28],
  ['src/device-mount.js', "process.kill(Number(pidS), 'SIGKILL')", 'scan', "cmd\\.includes\\('rclone'\\)", 'a stale rclone mount of this mountpoint (ps scan, same pass)'],
  ['src/device-mount.js', "process.kill(-rc.pid, 'SIGKILL')", 'handle', '-rc.pid', 'its own rclone'],
  ['src/device-mount.js', "process.kill(rc.pid, 'SIGTERM')", 'handle', 'rc.pid', 'its own rclone'],
  ['src/harnesses/claude.js', 'kill -TERM "$1" 2>/dev/null && echo "SWEPT:$1"', 'scan', 'vs_is_cli "\\$1"', 'a transcript writer (fd scan + vs_is_cli, same pass)', 3],
  ['src/harnesses/claude.js', 'kill -0 "$pid" 2>/dev/null || continue', 'probe', 'lock liveness in the sweep', 'nothing'],
  ['src/harnesses/codex.js', 'kill -TERM "$1" 2>/dev/null && echo "SWEPT:$1"', 'scan', 'vs_sid_of "\\$1"', 'a transcript writer (fd scan + its thread id, same pass)', 3],
  ['src/agentd/worker-pool.js', "process.kill(process.pid, 'SIGKILL')", 'self', 'process.pid', 'itself'],
  ['src/proc-identity.js', 'const kill = opts.kill || ((p, s) => process.kill(p, s));', 'identity', "verdict !== 'same'", 'THE choke point: a recorded identity judged same now'],
  ['src/hosts.js', '[ -n "$cpid" ] && kill -0 "$cpid" 2>/dev/null || continue', 'probe', 'a remote session child — listing only', 'nothing'],
  ['src/hosts.js', 'kill -0 "$pid" 2>/dev/null && { echo "LOCK', 'probe', 'a remote lock — listing only', 'nothing'],
  ['src/hosts.js', 'kill -TERM ${p} && echo VS_OK', 'scan', 'vs_is_cli \\$\\{p\\}', 'a remote CLI the owner named (vs_is_cli, same shell)'],
  ['src/mounts.js', "if (verdict) { try { process.kill(pid, 'SIGKILL')", 'scan', '_cpuTicks\\(pid\\)', 'its own rclone (spawn pid, polled every tick)', 14],
  ['src/mounts.js', 'try { process.kill(pid, 0); return Math.floor(process.uptime() * 100); }', 'probe', 'cpu-ticks fallback on no-/proc', 'nothing'],
  ['src/mounts.js', "try { process.kill(+pid, 'SIGKILL'); } catch {}", 'scan', "readdirSync\\('/proc'\\)", 'an rclone mount/authorize daemon (fresh /proc cmdline scan)', 8, 2],
  ['src/opencode-serve.js', "try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }", 'probe', 'the serve record\'s liveness (verdict reads cmdline beside it)', 'nothing'],
  ['src/opencode-serve.js', 'killPid = (pid, sig) => process.kill(pid, sig)', 'unknown', 'the serve record pid — its callers check cmdline/port verdicts but the record has no starttime yet', 'a recorded opencode serve'],
  ['src/peer-messaging.js', "try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }", 'probe', 'a peer\'s lock liveness', 'nothing'],
  ['src/plugins/frp.js', "if (pid) { try { process.kill(pid, 'SIGTERM')", 'scan', 'frpDaemonPid\\(\\)', 'its frpc (looked up now)', 4],
  ['src/plugins/proc.js', 'function pidAlive(pid) { try { process.kill(pid, 0)', 'probe', 'plugin liveness', 'nothing'],
  ['src/plugins/tailscale.js', "try { process.kill(pid, 'SIGTERM'); }", 'scan', 'tsOurDaemonPid\\(\\)', 'its tailscaled (looked up now)', 4],
  ['src/port-forward.js', "process.kill(pid, 'SIGTERM');", 'scan', "readlinkSync\\(`/proc/\\$\\{pid\\}/cwd`\\)", 'an orphan the owner named (cwd (deleted), read now)', 8],
  ['src/routes/sessions.js', "process.kill(pid, 'SIGTERM');", 'scan', 'isCliProcess\\(pid', 'a CLI the owner named (cmdline read in the same request)', 8],
  ['src/server/boot-restore.js', "if (pid > 1 && pid !== process.pid) { try { process.kill(pid, 'SIGTERM')", 'scan', "pgrep', \\['-f', socketPath\\]", 'a duplicate dtach (pgrep, same pass)', 4],
  ['src/server/boot-restore.js', '[ -n "$P" ] && kill -0 "$P" 2>/dev/null || exit 4', 'probe', 'a remote liveness read', 'nothing'],
  ['src/server/bridge-watch.js', 'kill = (pid, sig) => process.kill(pid, sig)', 'scan', 'procRoot', 'listOrphans: cmdline+stat read in the same pass', 2],
  ['src/server/browser-cli-install.js', "process.kill(-child.pid, 'SIGTERM')", 'handle', '-child.pid', 'its own installer'],
  ['src/server/browser-installs.js', "if (group) { try { process.kill(-pid, 'SIGTERM')", 'starttime', 'F\\.sameProcess\\(pid, starttime\\)', 'a stalled install step (pid+starttime)', 3],
  ['src/server/browser-installs.js', "try { process.kill(pid, 'SIGTERM'); return true; } catch { return false; }", 'starttime', 'F\\.sameProcess\\(pid, starttime\\)', 'the same, not a group leader', 3],
  ['src/server/browser-keeper.js', "try { process.kill(pid, 'SIGTERM'); } catch { /* gone meanwhile */ }", 'starttime', 'same\\(\\)', 'a launched Chrome (pid+starttime)', 8],
  ['src/server/browser-keeper.js', "if (same()) { try { process.kill(pid, 'SIGKILL')", 'starttime', 'same\\(\\)', 'the same'],
  ['src/server/browser-keeper.js', "try { process.kill(rec.pid, 'SIGTERM'); } catch { /* gone */ }", 'starttime', "v === 'ours'", 'a browser record (pidVerdictOf: pid+starttime)', 6],
  ['src/server/browser-keeper.js', "if (F.pidAlive(rec.pid)) { try { process.kill(rec.pid, 'SIGKILL')", 'starttime', "v === 'ours'", 'the same', 8],
  ['src/server/mounts-plugins-wiring.js', 'pkill -f "${root}/"', 'scan', 'root', 'whatever runs out of the plugin root being removed (its own install path)'],
  ['src/server/ops-routes.js', 'process.kill(_selfUpdate.pid, 0); return res.json', 'probe', 'an in-flight self-update (in-memory spawn record) — answer only', 'nothing'],
  ['src/server/ops-routes.js', 'process.kill(_selfUpdate.pid, 0); running = true;', 'probe', 'the same — status only', 'nothing'],
  ['src/server/ops-routes.js', 'process.kill(row.pid, 0); live = true;', 'probe', 'a CI run record — status only', 'nothing'],
  ['src/server/search-index.js', "process.kill(process.pid, 'SIGTERM')", 'self', 'process.pid', 'itself'],
  ['src/server/session-stdout.js', 'if (!HAS_PROC) { try { process.kill(pid, 0)', 'probe', 'no-/proc liveness', 'nothing'],
  ['src/server/sysinfo-wiring.js', 'if kill -${sig} ${p} 2>/dev/null; then', 'user', 'the owner\'s process-panel kill on a host', 'a pid the owner named'],
  ['src/server/sysinfo-wiring.js', "try { process.kill(pid, 'SIG' + sig); }", 'user', 'the owner\'s process-panel kill', 'a pid the owner named'],
  ['src/server/sysinfo-wiring.js', 'try { process.kill(pid, 0); } catch { gone = true; }', 'probe', 'did the owner\'s kill land', 'nothing'],
  ['src/server/usage-index.js', "process.kill(process.pid, 'SIGTERM')", 'self', 'process.pid', 'itself'],
  ['src/server/usage-index.js', "process.kill(process.pid, 'SIGKILL')", 'self', 'process.pid', 'itself'],
  ['src/server/window-targets-engine.js', 'const pidAlive = (pid) => { try { process.kill(pid, 0)', 'probe', 'a window\'s pid — liveness for listing', 'nothing'],
  ['src/session-store.js', 'try { process.kill(pid, 0); return true; } catch { return false; }', 'probe', 'a claude lock pid (isLockClaude proves procStart)', 'nothing'],
  ['src/vnc.js', "try { process.kill(own.pid, 'SIGTERM'); } catch { return false; }", 'starttime', 'procStart\\(own\\.pid\\) !== own\\.start', 'its own VNC server (pid+start)', 3],
  ['src/writer-sweep.js', 'kill -TERM "$cpid" 2>/dev/null && echo "SWEPT:$cpid"', 'unknown', SHWHY, 'a remote session\'s CLI'],
  // int237: fork-flag-server-side's fork-resumed-parent kill — the pid is the lock the proof step read in the same pass
  ['src/ws-create.js', "try { process.kill(Number(lock.pid), 'SIGKILL'); } catch { }", 'scan', 'captureForkProof\\(', 'a pending fork\'s own CLI holding its parent\'s id (B-8b7b: the lock dir, the ppid walk to its wrapper and lockWrittenByItsPid read in the same proof step, 2 sightings)'],
  ['src/ws-handler.js', "try { process.kill(dpid, 'SIGTERM'); } catch {}", 'scan', 'pidsMatchingCmdline\\(', 'a stale dtach of this socket (cmdline scan, same pass)', 4],
  ['src/ws-handler.js', 'kill -9 $P 2>/dev/null; true;', 'unknown', SHWHY, 'a remote session\'s CLI'],
];
// the persisted pids — each record and what its signal proves (a record with no starttime cannot be signalled by proof)
export const RECORDS = [
  ['jobs pid.json', 'data/bin/job-wrapper.js', 'bootId: bootId()', 'pid+starttime+bootId'],
  ['agentd session meta childPid', AG, 'startTime: pidStartTime(', 'start token (l<ticks> | p<lstart>)'],
  ['browser-profiles.json browsers{} (keeper)', 'src/server/browser-keeper.js', 'starttime', 'pid+starttime'],
  ['desktop serve record pids/starts', 'src/desktop-serve.js', 'rec.starts[part]', 'pid+starttime'],
  ['vnc own', 'src/vnc.js', 'own.start', 'pid+start'],
  ['xpra install slot', 'src/install-slot.js', '<pid> <starttime> <lock>', 'pid+starttime (shell)'],
  ['ci heavy lock / reaper rows', CI, 'looksLikeHeavyRun(', 'cmdline now (lock) · starttime (reaper rows)'],
  ['session-meta wrapper/pty pids', 'src/claude-lock-capture.js', 'wrapperPidOf(', 'never signalled (ppid depth only)'],
  ['remote keeper meta childPid/keeperPid', RK, 'isOurChildPid(', 'cmdline only — unknown'],
  ['opencode serve record', 'src/opencode-serve.js', 'killPid', 'cmdline+port verdict — unknown'],
];

const strip = (l) => l.replace(/\s\/\/\s.*$/, '');
/** files: [[repoRelPath, text]] → { rows: [printable], red: [], dead: [], counts: {kind: n} } */
export function judgeCensus(files, rows = ROWS) {
  const used = new Map(), red = [], out = [];
  const byFile = new Map();
  for (const r of rows) { if (!byFile.has(r[0])) byFile.set(r[0], []); byFile.get(r[0]).push(r); }
  for (const [f, text] of files) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (COMMENT.test(line) || !SITE.test(strip(line))) return;
      const cand = (byFile.get(f) || []).filter((r) => line.includes(r[1])).sort((a, b) => b[1].length - a[1].length);
      if (!cand.length) { red.push(`${f}:${i + 1} UNLISTED: ${line.trim().slice(0, 110)}`); return; }
      const r = cand[0]; const [, , kind, g, signals, win = 12] = r;
      used.set(r, (used.get(r) || 0) + 1);
      let proven = true;
      if (kind === 'identity' || kind === 'starttime' || kind === 'scan') proven = new RegExp(g).test(lines.slice(Math.max(0, i - win), i + 1).join('\n'));
      else if (kind === 'handle' || kind === 'self') proven = line.includes(g);
      if (!proven) red.push(`${f}:${i + 1} PROOF MISSING (${kind}: ${g}): ${line.trim().slice(0, 100)}`);
      out.push(`${f}:${i + 1} → ${signals} → ${kind}${kind === 'probe' || kind === 'unknown' || kind === 'user' ? ' (' + g + ')' : ''}`);
    });
  }
  const dead = rows.filter((r) => files.some(([f]) => f === r[0]) && !used.has(r)).map((r) => `${r[0]}: ${r[1].slice(0, 60)}`);
  const twice = rows.filter((r) => (used.get(r) || 0) > (r[6] || 1)).map((r) => `${r[0]}: ${r[1].slice(0, 60)} ×${used.get(r)}`);
  for (const t of twice) red.push('ONE ROW, TWO SITES: ' + t);
  const counts = {};
  for (const r of rows) if (used.has(r)) counts[r[2]] = (counts[r[2]] || 0) + 1;
  return { rows: out, red, dead, counts };
}
/** The census scope, read off a checkout: src/**.js, server.js, data/bin/*, scripts/ci.mjs, the image entrypoint. */
export function censusFiles(repo) {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(repo, d), { withFileTypes: true })) { const p = path.posix.join(d, e.name); if (e.isDirectory()) { if (p !== 'src/client') walk(p); } else if (/\.(c?js|mjs)$/.test(e.name)) out.push(p); } };
  walk('src');
  // data/bin/vibespace-agentd.js is the BUILT daemon bundle (npm run build) — its sources are the src/ rows
  for (const e of fs.readdirSync(path.join(repo, 'data/bin'))) { const p = 'data/bin/' + e; if (e !== 'vibespace-agentd.js' && fs.statSync(path.join(repo, p)).isFile()) out.push(p); }
  out.push('server.js', 'scripts/ci.mjs', 'deploy/docker/entrypoint.sh');
  return out.filter((p) => fs.existsSync(path.join(repo, p))).sort().map((p) => [p, fs.readFileSync(path.join(repo, p), 'utf8')]);
}
export function recordsJudge(repo) {
  return RECORDS.map(([what, f, needle, proof]) => ({ what, f, proof, ok: fs.existsSync(path.join(repo, f)) && fs.readFileSync(path.join(repo, f), 'utf8').includes(needle) }));
}
