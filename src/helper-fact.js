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


/** THE OTHER FILES THE CLI READS A HELPER FROM (moved here from src/billing-pick.js by B-77ed: ONE list for every machine): the
 *  project's own `.claude/settings.json` and `.claude/settings.local.json` in the conversation's cwd, and the person's own
 *  `--settings` file (a relative path is the cwd's, as the CLI opens it). A cwd that is not absolute reads no project file. */
function projectSettingsFilesOf(cwd, ownFile = null) {
  const base = typeof cwd === 'string' && cwd.startsWith('/') ? cwd.replace(/\/+$/, '') : '';
  const out = base ? [`${base}/.claude/settings.json`, `${base}/.claude/settings.local.json`] : [];
  const f = typeof ownFile === 'string' ? ownFile.trim() : '';
  if (f) { if (f.startsWith('/')) out.push(f); else if (base) out.push(`${base}/${f}`); }
  return out;
}
/** ONE start's fact over every file read: a helper named in ANY ⇒ true; else one that cannot be read ⇒ null (billing wins); else false */
const combinedFact = (facts) => (facts.some((f) => f === true) ? true : facts.some((f) => f !== false) ? null : false);
/** a path as ONE single-quoted shell word (no byte of it is ever read by the shell as syntax) */
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
/** a hub-handed path as a shell word placed on the far machine: absolute as is, `~` under $HOME, a relative one under `baseWord`
 *  (a relative cwd is $HOME's, as a remote `cd` places it) — null when it cannot be placed */
function placeWord(p, baseWord) {
  if (typeof p !== 'string' || !p.trim() || /[\0\n\\]/.test(p) || /^[A-Za-z]:/.test(p.trim())) return null;   // a NUL, a newline, a backslash, a drive: not placeable here
  const s = p.trim();
  if (s.startsWith('/')) return shq(s);
  if (s === '~') return '"$HOME"';
  if (s.startsWith('~/')) return '"$HOME"' + shq(s.slice(1));
  return baseWord ? baseWord + shq('/' + s) : null;
}
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
  const { cwd = null, ownFile = null } = start;
  const base = given(cwd) ? placeWord(cwd, '"$HOME"') : null, own = given(ownFile) ? placeWord(ownFile, base) : null;
  const words = [...(base ? [base + shq('/.claude/settings.json'), base + shq('/.claude/settings.local.json')] : []), ...(own ? [own] : [])];
  const unplaced = (given(cwd) && !base) || (given(ownFile) && !own);
  return VS_KH_ONE + `vs_kh_all="${unplaced ? ' unread' : ''}"; set -- "$HOME/.claude/settings.json"; ` + ccdWord('$CLAUDE_CONFIG_DIR')
    + `if command -v timeout >/dev/null 2>&1; then vs_lsh="timeout 3 sh"; else vs_lsh="sh"; fi; `
    + `vs_ccd_out=$($vs_lsh -lc 'printf "\\n__VS_CCD__%s\\n" "$CLAUDE_CONFIG_DIR"' </dev/null 2>/dev/null) || vs_kh_all="$vs_kh_all unread"; `
    + `case "$vs_ccd_out" in *__VS_CCD__*) ;; *) vs_kh_all="$vs_kh_all unread" ;; esac; `
    + `vs_ccd=$(printf '%s\\n' "$vs_ccd_out" | sed -n 's/^__VS_CCD__//p' | tail -n 1); ` + ccdWord('$vs_ccd')
    + `for vs_kh in "$@"${words.map((w) => ' ' + w).join('')}; do vs_kh_all="$vs_kh_all $(vs_kh_one "$vs_kh")"; done; `
    + 'case "$vs_kh_all" in *yes*) echo "claude-helper|yes";; *unread*) echo "claude-helper|unread";; *) echo "claude-helper|none";; esac; ';
}
/** the machine-level rung (no start: the CLI's config dirs only, no login shell) — hosts.backendStatus with no start, the status route */
const SSH_HELPER_RUNG = sshHelperRungFor(null);

module.exports = { namesHelper, helperFactOfText, SETTINGS_READ_MAX, SSH_HELPER_RUNG, projectSettingsFilesOf, combinedFact, sshHelperRungFor };
