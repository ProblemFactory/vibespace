// /proc helpers the built-in plugins share (a daemon's pidfile is trusted only while the pid is alive AND its cmdline
// still names the daemon — a recycled pid must never be killed).
const fs = require('fs');

function pidCmdline(pid) {
  try { return fs.readFileSync('/proc/' + pid + '/cmdline', 'utf-8').replace(/\0/g, ' '); } catch { return ''; }
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

module.exports = { pidCmdline, pidAlive };
