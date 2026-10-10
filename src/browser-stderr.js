'use strict';
/**
 * LANE BROWSER-STDERR-PIPE (userW inc-mv2qf3xs-7g87, 2026-10-10; the fleet's "DevTools accepts, answers 0 bytes" hangs):
 * A CHILD'S OUTPUT ALWAYS HAS A READER OR NO PIPE. MEASURED on this box (scripts/test-browser-stderr-pipe-real.mjs, a real
 * daemon of the pinned driver 0.38.1 + its Chrome on a scratch HOME, own Xvfb): the daemon's own fds 0/1/2 are /dev/null,
 * Chrome's fd 2 is `pipe:[…]` whose ONLY other end is the daemon's (fd 14) — the driver spawns Chrome with
 * `.stderr(Stdio::piped())` (cli/src/native/cdp/chrome.rs try_launch_chrome) and reads it only when the launch FAILS
 * (DevToolsActivePort is the success path), so on success nothing ever reads it. Idle on about:blank Chrome writes
 * ≈ 3.7 KB at launch then ≈ 5 B/s (64 KB in ≈ 3.4 h — the fleet's "6 hangs / 26 h"); with console logging on, the pipe
 * held 63 502 bytes after 3 s and the main thread sat in `anon_pipe_write` with /json/version answering 0 bytes at 6.5 s.
 * THE FIX: the pinned driver is 0.38.2 (upstream #2003, "Fixed Chrome freezing after launch": a thread drains Chrome's stderr
 * for its lifetime — measured: the same spam held ≥ 3× the base's time-to-hang). DEFENCE IN DEPTH (this file): the switches
 * the keeper composes carry `QUIET_LOG_ARGS` (no `--enable-logging` of ours; a user's own logging switch wins), no spawn of
 * ours leaves an unread pipe (scripts/test-browser-stderr-pipe.mjs census), and a browser still hung that way — started by
 * a 0.38.1 daemon before the update — is NAMED: `stderrPipeVerdict` over two /proc samples (fd 2 a pipe + the main thread
 * still in pipe_write), whose words say Restart runs it on FIXED_IN.
 */
const fs = require('fs');

const STDERR_PIPE_FULL = 'stderr-pipe-full';
/** The switches every keeper-composed launch carries: Chromium's logging off (`--disable-logging`) and nothing below
 *  FATAL (`--log-level=3` — LOG(ERROR) reaches stderr even with logging "off", base/logging.cc ShouldLogToStderr). */
const QUIET_LOG_ARGS = Object.freeze(['--disable-logging', '--log-level=3']);
const LOG_SWITCH_RE = /^--(enable-logging|disable-logging|log-level|log-file|v|vmodule)(=|$)/;
/** The driver version that drains Chrome's stderr (agent-browser 0.38.2, #2003) — the one VibeSpace pins. */
const FIXED_IN = '0.38.2';

const argListOf = (args) => (Array.isArray(args) ? args.map(String) : (typeof args === 'string' ? args.split(/[,\n]/) : [])).map((x) => x.trim()).filter(Boolean);
/** Should `args` gain QUIET_LOG_ARGS? `{add, why}` — `theirs` (the user's own args spell a logging switch: theirs wins,
 *  untouched — the automationFlag precedent) or `added`. PURE. */
function quietLogVerdict(args) {
  return argListOf(args).some((x) => LOG_SWITCH_RE.test(x)) ? { add: false, why: 'theirs' } : { add: true, why: 'added' };
}
/** `args` WITH the quiet switches when the verdict adds them — a string stays a string (joined as it is separated), a
 *  list a list; nothing ⇒ the switches alone. PURE. */
function withQuietLogging(args) {
  if (!quietLogVerdict(args).add) return args;
  if (Array.isArray(args)) return [...args, ...QUIET_LOG_ARGS];
  if (typeof args !== 'string' || !args.trim()) return QUIET_LOG_ARGS.join(',');
  const sep = args.includes('\n') ? '\n' : ',';
  return [...argListOf(args), ...QUIET_LOG_ARGS].join(sep);
}

/**
 * THE VERDICT (PURE): a browser that does not answer whose Chrome has fd 2 a PIPE and whose main thread sat in
 * `pipe_write` at every sample (≥ 2, apart in time: a pipe somebody drains wakes its writer at once) ⇒ STDERR_PIPE_FULL;
 * anything else (it answered, fd 2 a file / null, one sample out of pipe_write, too few samples) ⇒ null.
 */
function stderrPipeVerdict({ fd2 = null, wchans = [], answered = false } = {}) {
  if (answered) return null;
  if (!/^pipe:\[\d+\]$/.test(String(fd2 || ''))) return null;
  const w = Array.isArray(wchans) ? wchans : [];
  if (w.length < 2 || !w.every((x) => /pipe_write/.test(String(x || '')))) return null;
  return STDERR_PIPE_FULL;
}
/** The /proc facts of one Chrome pid for `stderrPipeVerdict`: fd 2's link and its main thread's wchan, sampled twice
 *  `gapMs` apart. Linux only (elsewhere every fact is null ⇒ no verdict). Never throws. */
async function probeStderrPipe(pid, { fsImpl = fs, gapMs = 300, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return { pid, fd2: null, wchans: [] };
  const wchan = () => { try { return String(fsImpl.readFileSync(`/proc/${pid}/wchan`, 'utf8')).trim(); } catch { return null; } };
  let fd2 = null;
  try { fd2 = fsImpl.readlinkSync(`/proc/${pid}/fd/2`); } catch { fd2 = null; }
  const w1 = wchan();
  await sleep(gapMs);
  return { pid, fd2, wchans: [w1, wchan()] };
}
/** The journal line of the verdict (the incident bundle reads the journal). */
function stderrPipeLine({ id = '', label = '', pid = null, fd2 = '' } = {}) {
  return `${id} "${label}": ${STDERR_PIPE_FULL} — Chrome${Number.isInteger(pid) ? ` pid ${pid}` : ''} is blocked writing its log into ${fd2 || 'a pipe'} that nothing reads (its daemon runs the browser driver 0.38.1; ${FIXED_IN} drains it) — Restart runs it on ${FIXED_IN}`;
}

module.exports = {
  STDERR_PIPE_FULL, QUIET_LOG_ARGS, FIXED_IN,
  quietLogVerdict, withQuietLogging, stderrPipeVerdict, probeStderrPipe, stderrPipeLine,
};
