'use strict';
/**
 * THE KEY-HELPER FACT OF ONE CLAUDE SETTINGS FILE — ONE rule for every machine (B-bc9f): this machine's (src/billing-pick.js
 * localHelperFact, read at a start) and a paired machine's (src/machine-probes.js, bundled into the device agent — its probe's
 * keyHelper / keyHelperUnread). PURE: imports nothing.
 *   text = the file as read, missing = there is no such file → true (a helper is named) / false (it names none, is empty, or there
 *   is no file) / null (it cannot be read: not JSON, not an object, a read that failed — billing wins)
 * Both readers read a regular file of at most SETTINGS_READ_MAX bytes and never wait on a FIFO (the hub's opens it non-blocking,
 * the probe stats it first).
 */
const SETTINGS_READ_MAX = 1 << 20;

/** does a settings object name a helper the CLI would use? (`row` = the harness's creds.keyHelper; anything else = no) */
function namesHelper(settings, row) {
  const key = row && typeof row.setting === 'string' ? row.setting : '';
  if (!key || !settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  const v = settings[key];
  return typeof v === 'string' ? v.trim() !== '' : !!v;
}

function helperFactOfText({ text = null, missing = false } = {}, row) {
  if (missing) return false;
  if (typeof text !== 'string') return null;
  if (!text.trim()) return false;   // an EMPTY file names nothing (never «cannot be read»)
  let o;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  return namesHelper(o, row);
}


/** THE START'S OTHER FILES, PLACED — ONE rule (B-77ed) for this machine's start (src/ws-create.js), a paired machine's probe
 *  (src/machine-probes.js) and the ssh rung's builder below: the project's `.claude/settings.json` and `.claude/settings.local.json`
 *  in the conversation's cwd, and the person's own `--settings` file. A cwd: absolute as is; `~` / `~/…` under the home; a relative
 *  one under the home (as a remote `cd` places it). The own file: absolute as is; a relative one under the placed cwd (the CLI
 *  opens it from its cwd); `~/…` by OWN_TILDE — BOTH files the CLI could open; any other tilde form (`~`, `~name/…`) cannot be
 *  placed. What the road refuses (`at.bad`), or an own file that needs a cwd and has none, cannot be placed ⇒ `unplaced` (that
 *  start reads «cannot be read»; the files that could be placed are still read).
 *  `at` = how the road writes a path: { home, tilde (a tilde and the road's separator), isAbs(s), abs(s), under(base, rel), bad(s) }
 *  — nodeAt for this machine and the probe, the rung's own (single-quoted shell words) below. → { files, unplaced } */
// 主开发's rule (round w38ycpn6z): every road hands the CLI its argv as WORDS, so a leading `~/` reaches it unexpanded, and whether
// the CLI expands it itself is not known here — the fact is judged over every file it could open: the one under that machine's
// home AND the literal `<cwd>/~/…` (named in either ⇒ named, unread in either ⇒ unread, both missing ⇒ none)
const OWN_TILDE = 'both';
function startFilesOf({ cwd = null, ownFile = null } = {}, at) {
  const given = (v) => typeof v === 'string' && v.trim() !== '';
  const placeCwd = (p) => {
    if (at.bad(p)) return null;
    const s = p.trim();
    if (at.isAbs(s)) return at.abs(s);
    if (s === '~') return at.home;
    return at.under(at.home, at.tilde.test(s) ? s.slice(2) : s);
  };
  const base = given(cwd) ? placeCwd(cwd) : null;
  const files = base ? [at.under(base, '.claude/settings.json'), at.under(base, '.claude/settings.local.json')] : [];
  let unplaced = given(cwd) && !base;
  if (given(ownFile)) {
    const s = ownFile.trim();
    if (at.bad(ownFile)) unplaced = true;
    else if (at.isAbs(s)) files.push(at.abs(s));
    else if (s.startsWith('~')) {
      if (at.tilde.test(s) && OWN_TILDE === 'both') { files.push(at.under(at.home, s.slice(2))); if (base) files.push(at.under(base, s)); else unplaced = true; }
      else unplaced = true;   // `~`, `~name/…`: not a file the CLI is known to open
    } else if (base) files.push(at.under(base, s));
    else unplaced = true;
  }
  return { files, unplaced };
}
/** a node road's way of writing a path (this machine's start, the device probe): `path` = node's path module (the probe on Windows
 *  places a drive, a backslash and a `~\` as its own), `home` = the CLI's home; only a NUL or a newline cannot be placed. The
 *  paths are joined LITERALLY, never normalized: the CLI runs chdir'd into its cwd, so the kernel resolves a `..` through a
 *  symlinked folder — as it does for the rung's words */
const nodeAt = (path, home) => ({ home, tilde: path.sep === '\\' ? /^~[\\/]/ : /^~\//, isAbs: (s) => path.isAbsolute(s), abs: (s) => s, under: (b, r) => b.replace(/[\\/]+$/, '') + path.sep + r, bad: (p) => /[\0\n]/.test(p) });
/** ONE start's fact over every file read: a helper named in ANY ⇒ true; else one that cannot be read ⇒ null (billing wins); else false */
const combinedFact = (facts) => (facts.some((f) => f === true) ? true : facts.some((f) => f !== false) ? null : false);
/** a path as ONE single-quoted shell word (no byte of it is ever read by the shell as syntax) */
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
/** the ssh rung's way of writing a path (a POSIX shell on the far machine): every hub-handed path ONE single-quoted word, the home
 *  `"$HOME"`; a NUL, a newline, a backslash or a drive letter cannot be placed there */
const shellAt = { home: '"$HOME"', tilde: /^~\//, isAbs: (s) => s.startsWith('/'), abs: (s) => shq(s), under: (b, r) => b + shq('/' + r), bad: (p) => /[\0\n\\]/.test(p) || /^[A-Za-z]:/.test(p.trim()) };
const VS_KH_ONE = 'vs_kh_one() { if [ -f "$1" ] && [ -r "$1" ]; then vs_q=0; grep -q "\\"apiKeyHelper\\"" "$1" || vs_q=$?; if [ $vs_q -eq 0 ]; then echo yes; '
  + 'elif [ $vs_q -ne 1 ]; then echo unread; else vs_b=0; grep -q apiKeyHelper "$1" || vs_b=$?; if [ $vs_b -ne 1 ]; then echo unread; else echo none; fi; fi; '
  + 'elif [ -e "$1" ]; then echo unread; else echo none; fi; }; ';
/** a config dir in the shell: absolute ⇒ its settings file; set but not absolute ⇒ cannot be placed (unread) */
const ccdWord = (v) => `case "${v}" in '') ;; /*) set -- "$@" "${v}/settings.json" ;; *) vs_kh_all="$vs_kh_all unread" ;; esac; `;
/** THE SSH RUNG (hosts.backendStatus' fallback, no node there), by the rung's TEXT law: the quoted key ⇒ named (an empty value too:
 *  billing wins); the bare name only (an unquoted key, a comment), a file it cannot open, a grep that could not READ it (exit 2:
 *  an I/O error, a stale network handle) ⇒ cannot be read; a file whose text never names the setting ⇒ none (a \u-escaped key or
 *  a link loop reads none here). Each grep's exit is read through `||` (errexit never ends it). Combined as combinedFact.
 *  THE MACHINE-LEVEL RUNG (no start: the status route) reads ~/.claude and the shell's CLAUDE_CONFIG_DIR and prints nothing for
 *  none. THE START'S RUNG (B-77ed) reads the same files as the probe — the UNION of the config dirs (~/.claude, the shell's
 *  CLAUDE_CONFIG_DIR, the login shell's: `sh -lc`, bounded by `timeout 3` where it exists, stdin closed; a non-absolute dir, a
 *  login shell that fails or prints no marker ⇒ unread), the project's two and the person's own (a path it cannot place ⇒
 *  unread) — and ALWAYS prints its line (`claude-helper|none` too): a missing line reads as cannot be read. Every path is ONE
 *  single-quoted word. No size bound: a huge file is read until the start's own bound (HELPER_FACT_MS, 8 s). */
function sshHelperRungFor(start = null) {
  const given = (v) => typeof v === 'string' && v.trim() !== '';
  if (!start) {
    return VS_KH_ONE + 'vs_kh_all=""; set -- "$HOME/.claude/settings.json"; ' + ccdWord('$CLAUDE_CONFIG_DIR')
      + 'for vs_kh in "$@"; do vs_kh_all="$vs_kh_all $(vs_kh_one "$vs_kh")"; done; '
      + 'case "$vs_kh_all" in *yes*) echo "claude-helper|yes";; *unread*) echo "claude-helper|unread";; esac; ';
  }
  const { files: words, unplaced } = startFilesOf(start, shellAt);
  // THE LOGIN SHELL'S ASK, both branches written out (主开发's round w38ycpn6z): no command kept in a variable — zsh never splits an
  // unquoted parameter, so «$cmd -lc» ran a program named «timeout 3 sh» there. The rung's text runs the same under sh, bash, zsh
  const ask = `-lc 'printf "\\n__VS_CCD__%s\\n" "$CLAUDE_CONFIG_DIR"' </dev/null 2>/dev/null`;
  return VS_KH_ONE + `vs_kh_all="${unplaced ? ' unread' : ''}"; set -- "$HOME/.claude/settings.json"; ` + ccdWord('$CLAUDE_CONFIG_DIR')
    + `if command -v timeout >/dev/null 2>&1; then vs_ccd_out=$(timeout 3 sh ${ask}) || vs_kh_all="$vs_kh_all unread"; `
    + `else vs_ccd_out=$(sh ${ask}) || vs_kh_all="$vs_kh_all unread"; fi; `
    + `case "$vs_ccd_out" in *__VS_CCD__*) ;; *) vs_kh_all="$vs_kh_all unread" ;; esac; `
    + `vs_ccd=$(printf '%s\\n' "$vs_ccd_out" | sed -n 's/^__VS_CCD__//p' | tail -n 1); ` + ccdWord('$vs_ccd')
    + `for vs_kh in "$@"${words.map((w) => ' ' + w).join('')}; do vs_kh_all="$vs_kh_all $(vs_kh_one "$vs_kh")"; done; `
    + 'case "$vs_kh_all" in *yes*) echo "claude-helper|yes";; *unread*) echo "claude-helper|unread";; *) echo "claude-helper|none";; esac; ';
}
/** the machine-level rung (no start: the CLI's config dirs only, no login shell) — hosts.backendStatus with no start, the status route */
const SSH_HELPER_RUNG = sshHelperRungFor(null);

module.exports = { namesHelper, helperFactOfText, SETTINGS_READ_MAX, SSH_HELPER_RUNG, startFilesOf, nodeAt, shellAt, OWN_TILDE, combinedFact, sshHelperRungFor };
