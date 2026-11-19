// THE LOCK'S HOLDER (B-8475) — whose agent a live pid in the lock is. The lock file lives in the agent's state folder; in a
// container that is the home volume, which outlives the container. The next container's process table is fresh: the pid
// the dead agent left can belong to ANOTHER agent there — the hub's own local agent (data/bin/vibespace-agentd.js, its root
// the default ~/.vibespace/agentd) — and a command line that merely says «agentd» read as «a genuine second instance»: the
// device's agent refused to start, for good. A live process blocks only when it is an agent of THIS root.
// PURE but for its reads of /proc (a pid's environ, this process's own task list) and a root's realpath; where /proc cannot
// be read the caller keeps its old answer.
'use strict';
const path = require('path');

/** The root an agent process runs with, by agentd.js's own rule (VIBESPACE_DEVICE_ROOT, else VIBESPACE_AGENTD_ROOT, else
 *  <HOME>/.vibespace/agentd), from its environment block (NUL-separated) — null when the block names no root and no HOME.
 *  A name given twice reads its FIRST value, as getenv (and so the agent's own process.env) does. The installer's shell
 *  twin is root_of_pid (scripts/vibespace-agentd-install.sh). */
function rootOfEnviron(text) {
  const env = Object.create(null);
  for (const kv of String(text || '').split('\0')) { const i = kv.indexOf('='); if (i > 0 && !(kv.slice(0, i) in env)) env[kv.slice(0, i)] = kv.slice(i + 1); }
  if (env.VIBESPACE_DEVICE_ROOT) return env.VIBESPACE_DEVICE_ROOT;
  if (env.VIBESPACE_AGENTD_ROOT) return env.VIBESPACE_AGENTD_ROOT;
  return env.HOME ? path.join(env.HOME, '.vibespace', 'agentd') : null;
}

/** Is the live process `pid` an agent of `root`? → true / false, or null when it cannot be told — no /proc (macOS, BSD),
 *  a block that cannot be read (another user's process: EACCES; a hardened /proc) or a block that names no root — and the
 *  caller keeps today's answer («unknown stays a block»). The block is read as UTF-8, as node itself decodes its env and
 *  argv: a root with a non-ASCII folder name compares equal to the same root this agent holds. */
function holdsRoot(pid, root, { read = (p) => require('fs').readFileSync(p, 'utf8'), canon = canonOf } = {}) {
  let text;
  try { text = read('/proc/' + pid + '/environ'); } catch { return null; }
  const r = rootOfEnviron(text);
  if (!r) return null;
  return canon(r) === canon(String(root || ''));
}

/** A root's ONE spelling: its real path (a symlinked spelling of a root is that root — the image's /home/vibe → /home/<name>),
 *  else (a folder that is not there) the resolved path. The installer's twin is same_root. */
function canonOf(p) { try { return require('fs').realpathSync(p); } catch { return path.resolve(p); } }

/** Is `pid` one of THIS process's own threads, other than its main one? Thread ids share the pid space: a lock naming a
 *  number the next boot gave to one of this agent's own threads (V8's, the pool's) read «alive, our own name, our own root»
 *  and refused, for good. → true / false (no /proc — macOS, BSD — ⇒ false: today's answer stands). */
function isOwnThread(pid, { exists = (p) => require('fs').existsSync(p), self = process.pid } = {}) {
  return Number.isInteger(pid) && pid > 0 && pid !== self && exists('/proc/self/task/' + pid);
}

module.exports = { rootOfEnviron, holdsRoot, canonOf, isOwnThread };
