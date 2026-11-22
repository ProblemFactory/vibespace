// /proc helpers the built-in plugins share (a daemon's pidfile is trusted only while the pid is alive AND its cmdline
// still names the daemon — a recycled pid must never be killed).
const fs = require('fs');

function pidCmdline(pid) {
  try { return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf-8').replace(/\0/g, ' '); } catch { return ''; }
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
/** B-1217: a process's own argv (its program first) — [] when it cannot be read */
function pidArgv(pid) {
  try { return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf-8').split('\0').filter((x, i, a) => x !== '' || i < a.length - 1); } catch { return []; }
}

module.exports = { pidCmdline, pidAlive, pidArgv };
