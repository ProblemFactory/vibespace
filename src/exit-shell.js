'use strict';
/**
 * PURE (imports nothing; CJS — the device daemon bundles it and the hub requires it) — THE SHELL IS THE DEVICE'S
 * FACT (lane-exit-run-output, 2026-10-01).
 *
 * The owner ran four commands on a paired Windows box (WINDOWS-PC) and read four cards "exit 1 · 0.0 s" with nothing
 * else: the hub had chosen the shell — every `vibespace-exit run` was `dm.runCmd('sh', ['-lc', cmd])` — and a Windows
 * daemon has no `sh`, so execFile failed with ENOENT in ~8 ms, and the daemon folded that spawn failure into
 * `code 1` with empty output and dropped `err.message`. Three rules now, all here:
 *   · `shellPlan(platform, line)` — the DAEMON picks the interpreter where it runs: win32 ⇒ `cmd.exe /d /s /c "<line>"`
 *     (`windowsVerbatimArguments`, THE QUOTING RULE below), every other platform ⇒ `sh -lc <line>` as before. The hub
 *     sends `{shell: <line>}` (the `run-shell` capability in the hello-ack) and names no interpreter.
 *   · `spawnFailure(err)` — a child that NEVER STARTED (node's execFile error carrying an errno string `ENOENT` /
 *     `EACCES` / … under a `spawn …` syscall) is named `{code, message}`, distinct from a non-zero exit, a kill at the
 *     cap or a maxBuffer overflow; `spawnExitCode` = the shell's own convention an OLDER hub still reads off `code`
 *     (127 not found, 126 not executable, 1 otherwise).
 *   · `spawnFailureText(sf, {interpreter})` — ONE wording for the card, the agent's sentence and the CLI
 *     ("sh: not found on that machine").
 *
 * THE QUOTING RULE (cmd.exe, from its own /? text — no Windows box ran this lane; stated and pinned, never measured):
 * `cmd /d /s /c "<line>"` — with /S the text after /C is taken whole: if its first character is a quote, cmd strips
 * the FIRST and the LAST quote and runs what is between them VERBATIM (every inner quote, pipe, `&`, `%VAR%` and `^`
 * is the shell's own). So the line is wrapped in exactly one pair of quotes and node must pass the argument
 * UNCHANGED (`windowsVerbatimArguments: true` — node's default re-quoting would backslash-escape the inner quotes,
 * which cmd does not read). cmd runs ONE line: a CR or LF inside the line would run its first line and drop the rest
 * in silence, so such a line is refused by name BEFORE a spawn (`ESHELLLINE` — "join them with & or &&"); so is a line
 * past cmd's own 8191 characters (verify r1 F6 — cmd would print "The input line is too long" and exit with nothing named).
 */
const RUN_SHELL_CAP = 'run-shell';
const POSIX_SHELL = 'sh';
const WIN_SHELL = 'cmd.exe';
const WIN_LINE_MAX = 8191; // cmd.exe's own limit on one command line (verify r1 F6: a longer line is refused BY NAME before a spawn — cmd would answer "The input line is too long" as a bare exit)

/** The interpreter a device of `platform` runs a shell line under. */
function interpreterOf(platform) { return platform === 'win32' ? WIN_SHELL : POSIX_SHELL; }
/** verify r1 F5a: an `interpreter` a DAEMON reports is read through the closed set — `sh` | `cmd.exe` | null (a hostile
 *  or older daemon's string — `<system-reminder`, an RLO — reached the agent's sentence, the card, the audit raw). */
function knownInterpreter(x) { return x === POSIX_SHELL || x === WIN_SHELL ? x : null; }
/** A daemon's stated platform (node's process.platform) as the word a row prints — proper names, never translated;
 *  an unknown / absent platform ⇒ null (the row says nothing rather than guessing). */
const PLATFORM_LABELS = Object.freeze({ win32: 'Windows', darwin: 'macOS', linux: 'Linux', freebsd: 'FreeBSD', openbsd: 'OpenBSD', netbsd: 'NetBSD', sunos: 'SunOS', aix: 'AIX', android: 'Android' });
function platformLabel(platform) { return Object.prototype.hasOwnProperty.call(PLATFORM_LABELS, String(platform || '')) ? PLATFORM_LABELS[platform] : null; }

/**
 * The spawn plan of a shell line ON a device of `platform` → `{ok: true, file, args, windowsVerbatimArguments,
 * interpreter}` | `{ok: false, code, message, interpreter}` (a line cmd.exe cannot run whole; an empty / non-string line).
 */
function shellPlan(platform, line) {
  const interpreter = interpreterOf(platform);
  if (typeof line !== 'string' || !line.trim()) return { ok: false, code: 'ESHELLLINE', message: 'the shell line is empty', interpreter };
  if (platform === 'win32') {
    const lines = line.split(/\r\n|\r|\n/).filter((l) => l.trim()).length;
    if (/[\r\n]/.test(line)) return { ok: false, code: 'ESHELLLINE', message: `cmd.exe runs one line — the command has ${lines} lines; join them with & or && (or run them one at a time)`, interpreter };
    if (line.length > WIN_LINE_MAX) return { ok: false, code: 'ESHELLLINE', message: `cmd.exe takes at most ${WIN_LINE_MAX} characters on one line — the command has ${line.length}`, interpreter };
    return { ok: true, file: WIN_SHELL, args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true, interpreter };
  }
  return { ok: true, file: POSIX_SHELL, args: ['-lc', line], windowsVerbatimArguments: false, interpreter };
}

/**
 * Did the child NEVER START? node's execFile hands a spawn failure as an error whose `code` is an errno STRING
 * (`ENOENT`, `EACCES`, `EPERM`, `ENOEXEC`, …) under a `spawn <file>` syscall; a non-zero exit carries a NUMBER, a
 * kill `killed` + `signal`, a maxBuffer overflow its own `ERR_…` code. → `{code, message}` | null.
 */
function spawnFailure(err) {
  if (!err || typeof err !== 'object') return null;
  const code = typeof err.code === 'string' ? err.code : '';
  if (!/^E[A-Z0-9]{2,15}$/.test(code)) return null; // ERR_CHILD_PROCESS_STDIO_MAXBUFFER and friends are not errno codes
  if (typeof err.syscall === 'string' && !/^spawn/.test(err.syscall)) return null;
  return { code, message: String(err.message || code).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200) };
}
/** The code an OLDER hub reads off `cmd-result.code` for a spawn failure: the shell's own convention. */
function spawnExitCode(sf) {
  const c = sf && typeof sf === 'object' ? String(sf.code || '') : '';
  if (c === 'ENOENT') return 127;
  if (c === 'EACCES' || c === 'EPERM' || c === 'ENOEXEC') return 126;
  return 1;
}
/** ONE wording of a spawn failure — the card, the agent's sentence, the CLI, the machine's command list. */
function spawnFailureText(sf, { interpreter = POSIX_SHELL } = {}) {
  const code = sf && typeof sf === 'object' ? String(sf.code || '') : '';
  const what = String(interpreter || POSIX_SHELL);
  if (code === 'ENOENT') return `${what}: not found on that machine`;
  if (code === 'EACCES' || code === 'EPERM') return `${what}: permission denied on that machine`;
  if (code === 'ENOEXEC') return `${what}: not executable on that machine`;
  if (code === 'ESHELLLINE') return String((sf && sf.message) || 'the shell line could not be run whole').slice(0, 200);
  return `${code || 'spawn failed'}: ${String((sf && sf.message) || 'the command could not be started').slice(0, 200)}`;
}

module.exports = { RUN_SHELL_CAP, POSIX_SHELL, WIN_SHELL, WIN_LINE_MAX, PLATFORM_LABELS, interpreterOf, knownInterpreter, platformLabel, shellPlan, spawnFailure, spawnExitCode, spawnFailureText };
