'use strict';
// THE PERSON'S LOGIN SHELL (lane cli-shell-truth, B-fb02) — PURE. Which shell is "theirs", and how a line is asked of it.
//
// TWO ROADS ASK IT: the hub's own CLI ask (src/server/cli-cmd.js askShell — where is an agent CLI?) and a device's shell
// terminal on the dial road (src/spawn/dial.js — the DEVICE user's own login shell). Both read the SAME ladder, spelled
// once here: the SHELL the session was born with › the account record (the passwd entry: os.userInfo() on the hub; on a
// device `dscl . -read ~/ UserShell` on macOS, `getent passwd` elsewhere — the same record) › the first one that is
// non-empty is the shell; one that is not executable falls to zsh › bash on PATH › /bin/sh. `pickLoginShell` is the JS
// spelling over handed-in facts; `S0_SH` is the sh spelling a device runs. test-cli-env runs S0_SH under a real sh and
// asks pickLoginShell on the same inputs: they must agree.
//
// THE ASK (`shellLine` / `parseShellAnswer`): `<shell> -l -i -c <line>` — a login AND interactive shell, so the rc files
// that put nvm's / Homebrew's / bun's bin on PATH have run. An rc prints anything before the line runs (banners, a motd,
// a decoy), so the answer is read ONLY between sentinels, and the LAST pair wins. `printenv PATH`, never "$PATH": fish
// keeps PATH as a list; printenv reads the exported colon form.

const BEGIN = '__VS_CV_BEGIN__', END = '__VS_CV_END__', PATH_END = '__VS_PATH_END__';

/** The device's spelling of the ladder (sh). Assigns S0; the dial road's shell terminal execs "$S0". */
const S0_SH = `S0="\${SHELL:-}"; [ -n "$S0" ] || S0="$(dscl . -read ~/ UserShell 2>/dev/null | awk '{print \$2}')"; [ -n "$S0" ] || S0="$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)"; [ -x "$S0" ] || S0="$(command -v zsh || command -v bash || echo sh)"; `;

/** THE LADDER over facts: { envShell, accountShell, executable(p) → bool, onPath(name) → absolute path | null }.
 *  Answers { shell, rung } — rung ∈ 'env' | 'account' | 'fallback'. */
function pickLoginShell({ envShell = '', accountShell = '', executable = () => false, onPath = () => null } = {}) {
  let shell = '', rung = 'fallback';
  if (envShell) { shell = String(envShell); rung = 'env'; }
  else if (accountShell) { shell = String(accountShell); rung = 'account'; }
  if (shell && executable(shell)) return { shell, rung };
  return { shell: onPath('zsh') || onPath('bash') || '/bin/sh', rung: 'fallback' };
}

/** A command name the ask may carry: a plain word (no quoting games — the name comes from config). */
const NAME_OK = /^[A-Za-z0-9_][A-Za-z0-9._+-]{0,127}$/;

/** The one line asked of the shell. sh, bash, zsh and fish all read it (`;`, printf, command -v, printenv). */
function shellLine(name) {
  if (!NAME_OK.test(String(name || ''))) throw new TypeError(`login-shell: not a plain command name: ${String(name).slice(0, 60)}`);
  return `printf '\\n${BEGIN}\\n'; command -v ${name}; printf '\\n${END}\\n'; printenv PATH; printf '\\n${PATH_END}\\n'`;
}

/** The shell's printout → { complete, pathDone, cv, path }: `complete` = a BEGIN…END pair stood (the line ran); `cv` = what
 *  command -v printed between them (trimmed, '' when nothing); `path` = the exported PATH printed after END, or null;
 *  `pathDone` = its own end sentinel came too (the whole answer is in).
 *  The LAST pair wins: a banner or a decoy echo printed before the line ran never does. */
function parseShellAnswer(out) {
  const lines = String(out || '').split(/\r?\n/);
  let end = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i] === END) { end = i; break; }
  let begin = -1;
  for (let i = end - 1; i >= 0; i--) if (lines[i] === BEGIN) { begin = i; break; }
  if (end < 0 || begin < 0) return { complete: false, pathDone: false, cv: '', path: null };
  const cv = lines.slice(begin + 1, end).map((l) => l.trim()).filter(Boolean).join('\n');
  let pend = -1;
  for (let i = lines.length - 1; i > end; i--) if (lines[i] === PATH_END) { pend = i; break; }
  const p = pend > end ? lines.slice(end + 1, pend).map((l) => l.trim()).filter(Boolean).join('') : '';
  return { complete: true, pathDone: pend > end, cv, path: p && p.includes('/') ? p : null };
}

/** What command -v said, as a verdict: 'path' (ONE absolute path), 'none' (nothing), 'alias' (an alias, a function, a
 *  builtin — VibeSpace runs PROGRAMS: bash «alias x='…'», zsh «x: aliased to …», a bare «x» for a function). */
function cvKind(cv) {
  const s = String(cv || '').trim();
  if (!s) return 'none';
  if (!s.includes('\n') && s.startsWith('/')) return 'path';
  return 'alias';
}

/** The shell's own name for the words («your zsh»): the basename, a login dash dropped. */
function shellName(shell) { return String(shell || '').split('/').pop().replace(/^-/, '') || 'sh'; }

module.exports = { S0_SH, pickLoginShell, shellLine, parseShellAnswer, cvKind, shellName, NAME_OK, BEGIN, END, PATH_END };
