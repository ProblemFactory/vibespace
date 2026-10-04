'use strict';
// Argv the daemon's self-upgrade re-exec must launch with: the NEW bundle path
// followed by EVERY original flag after the script (--dial/--dial-token/
// --host-token/…). Dropping the flags re-exec'd a DIAL device into default
// LISTEN mode — it stopped dialing the instance and held the singleton so
// launchd couldn't relaunch the real --dial daemon (real owner↔Mac outage,
// userW-class wedge). Pure + side-effect-free so it's unit-testable without
// starting the daemon. argv defaults to process.argv ([node, script, ...flags]).
function reExecArgv(newScriptPath, argv = process.argv) {
  return [newScriptPath, ...argv.slice(2)];
}

// THE `current` REPOINT of a self-upgrade (lane device-upgrade-stuck, 2026-10-03). POSIX: a symlink made beside it and
// renamed over it (atomic). WINDOWS: the installer makes `current` a JUNCTION (scripts/vibespace-agentd-install.ps1
// `mklink /J` — "no admin needed, unlike symlinks"). The pre-fix repoint was the POSIX one everywhere: a directory
// SYMLINK needs SeCreateSymbolicLinkPrivilege (EPERM for a normal user) and a rename cannot replace an existing
// directory (EPERM even with Developer Mode on), so it threw on every Windows machine — inside ws-min's swallowing emit:
// no line on the device, no `upgrade-done`, the hub waited out its 30 s, three times, and gave up (WIN-DESK1,
// 2026-10-02 19:08 and 22:11, attempts exactly 31 s apart). Windows now: a junction beside it, the old link removed
// (unlink of a junction removes the link, never its target; rmdir as the fallback), then renamed into place — not
// atomic: a death between the two leaves no `current`, which the install command repairs. `fsx` = node's fs (injected
// so the win32-shaped test can model Windows' rules on any machine); `pathx` = the platform's path module.
function repointCurrent(fsx, { root, dir, platform = process.platform }, pathx = require('path')) {
  const cur = pathx.join(root, 'current'), tmp = pathx.join(root, '.current.tmp');
  try { fsx.unlinkSync(tmp); } catch { }
  if (platform === 'win32') {
    fsx.symlinkSync(dir, tmp, 'junction');
    try { fsx.unlinkSync(cur); } catch (e) { if (!e || e.code !== 'ENOENT') { try { fsx.rmdirSync(cur); } catch (e2) { if (!e2 || e2.code !== 'ENOENT') throw e2; } } }
    fsx.renameSync(tmp, cur);
    return cur;
  }
  fsx.symlinkSync(dir, tmp);
  fsx.renameSync(tmp, cur);
  return cur;
}

// THE UPGRADE HAND-OVER (lane win-upgrade-pipe, 2026-10-04 — the owner's Windows box lost its agent at 2.369.205). The
// re-exec used to unlink the socket path, spawn the successor and exit. On POSIX the unlink frees the path. On WINDOWS
// the address is a NAMED PIPE (`\\.\pipe\vibespace-agentd-<sha1(root)>`): it cannot be unlinked and stays bound while ANY
// pipe instance of the old process is open — the successor reached `listen` first, got EADDRINUSE, and its error handler
// exited; then the old daemon exited too and the machine had no agent until the owner reran the install command.
// Two halves, both needed: the OLD daemon closes its listener BEFORE it starts the successor (bounded wait: a lingering
// local connection keeps a Windows pipe bound until the process exits — the successor's retry covers that tail), and the
// NEW daemon retries a busy address for a bounded time (the hop that installs THIS code is run by the OLDER daemon's
// code, which spawns before it lets go — only the new bundle's retry can save that hop). The singleton lock stays the
// authority: a retry happens only while the lock file names THIS pid, so a genuine second instance (refused at the lock
// long before it listens) never waits here. `timers` / `now` are injected so the win32-shaped test runs on any machine.
function handOver({ server, spawnNext, exit, log = () => {}, waitMs = 1500, timers = { setTimeout, clearTimeout } }) {
  let done = false;
  const go = (line) => {
    if (done) return; done = true;
    log(line);
    try { spawnNext(); } finally { exit(0); }
  };
  const t = timers.setTimeout(() => go(`upgrade hand-over: the listener did not close within ${waitMs} ms — starting the successor anyway (it retries a busy address)`), waitMs);
  try { server.close(() => { timers.clearTimeout(t); go('upgrade hand-over: listener closed — starting the successor'); }); }
  catch (e) { timers.clearTimeout(t); go(`upgrade hand-over: the listener would not close (${(e && e.message) || e}) — starting the successor anyway`); }
}
function listenWithRetry(server, addr, { onListening, onFatal, lockIsOurs = () => true, log = () => {}, everyMs = 250, forMs = 15000, now = Date.now, timers = { setTimeout } }) {
  const t0 = now();
  let tries = 0, up = false;
  server.once('listening', () => {
    up = true;
    if (tries) log(`listen: ${addr} free after ${tries} retr${tries === 1 ? 'y' : 'ies'} (${now() - t0} ms) — the previous daemon let go`);
    onListening();
  });
  server.on('error', (e) => {
    if (up || !e || e.code !== 'EADDRINUSE') { onFatal(e); return; }
    const ours = lockIsOurs();
    if (ours && now() - t0 < forMs) {
      if (tries++ === 0) log(`listen: ${addr} is still held (EADDRINUSE) — the singleton lock is ours, so the previous daemon is still exiting; retrying every ${everyMs} ms for up to ${Math.round(forMs / 1000)} s`);
      timers.setTimeout(() => { try { server.close(); } catch { } server.listen(addr); }, everyMs);
      return;
    }
    log(ours ? `listen: ${addr} still held after ${now() - t0} ms (${tries} retries) — giving up` : `listen: ${addr} is held and the singleton lock is not ours — not retrying`);
    onFatal(e);
  });
  server.listen(addr);
}

module.exports = { reExecArgv, repointCurrent, handOver, listenWithRetry };
