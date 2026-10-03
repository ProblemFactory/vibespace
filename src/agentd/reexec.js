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

module.exports = { reExecArgv, repointCurrent };
