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
// THE ASK IS FOR A PROGRAM, NOT FOR WHAT THE WORD MEANS (round 2, the acceptance's blocker): `alias claude='claude
// --dangerously-skip-permissions'`, an nvm lazy-load function, the installer's own `alias claude="~/.claude/local/claude"`
// — the person's own wrapper is never a refusal. The line asks, in this order, between sentinels:
//   CV  the PROGRAM the shell's PATH holds, the alias / function layer bypassed — the shell's own program-only
//       spelling (bash `type -P`, zsh / ksh `whence -p`, fish `command -v` — fish's command searches programs only —
//       anything else a subshell that drops the alias and the function first) — MEASURED per shell, test-cli-env;
//   AL  what the WORD means to the shell (`command -v`: an alias definition, a function's bare name, or a path) — read
//       as provenance («your zsh wraps claude in an alias»), and as the answer ONLY for an alias whose body is ONE word
//       naming an executable after ~ / $HOME expansion (the installer's shape) when no program stands on PATH;
//   CTL a CONTROL word that must exist (`printenv`) through the same program-only spelling — a shell whose printout
//       does not name it (no `command` builtin: tcsh / csh / xonsh) could not be ASKED: never a «none»;
//   PATH the exported PATH (`printenv PATH`, never "$PATH": fish keeps PATH as a list).
// An rc prints anything before the line runs (banners, a motd, a decoy), so each answer is read ONLY between its
// sentinels and the LAST whole sequence wins.

const BEGIN = '__VS_CV_BEGIN__', END = '__VS_CV_END__', AL_BEGIN = '__VS_AL_BEGIN__', AL_END = '__VS_AL_END__';
const CTL_BEGIN = '__VS_CTL_BEGIN__', CTL_END = '__VS_CTL_END__', PATH_END = '__VS_PATH_END__';
const CONTROL_WORD = 'printenv';

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

/** The shell's own name for the words («your zsh»): the basename, a login dash dropped. */
function shellName(shell) { return String(shell || '').split('/').pop().replace(/^-/, '') || 'sh'; }

/** THE PROGRAM-ONLY SPELLING per shell (the alias / function wearing the name bypassed). */
function programLookup(name, shell) {
  const sh = shellName(shell);
  if (sh === 'bash') return `type -P ${name}`;
  if (sh === 'zsh' || sh === 'ksh' || sh === 'ksh93' || sh === 'mksh') return `whence -p ${name}`;
  if (sh === 'fish') return `command -v ${name}`;
  return `(unalias ${name}; unset -f ${name}; command -v ${name}) 2>/dev/null`;
}

/** The one line asked of `shell` for `name` (sh, bash, zsh, ksh and fish read it). */
function shellLine(name, shell) {
  if (!NAME_OK.test(String(name || ''))) throw new TypeError(`login-shell: not a plain command name: ${String(name).slice(0, 60)}`);
  const pr = (a) => `printf '\\n${a}\\n'`;
  return [pr(BEGIN), programLookup(name, shell), pr(END), pr(AL_BEGIN), `command -v ${name}`, pr(AL_END),
    pr(CTL_BEGIN), programLookup(CONTROL_WORD, shell), pr(CTL_END), 'printenv PATH', pr(PATH_END)].join('; ');
}

/** The shell's printout → { complete, pathDone, cv, al, ctl, path }. The sentinels are found from the END backwards in
 *  their order (PATH_END › CTL_END › CTL_BEGIN › AL_END › AL_BEGIN › CV_END › CV_BEGIN): the LAST whole sequence is
 *  the line's own — a banner or a decoy echo printed before the line ran never is. */
function parseShellAnswer(out) {
  const lines = String(out || '').split(/\r?\n/);
  const back = (word, before) => { for (let i = before - 1; i >= 0; i--) if (lines[i] === word) return i; return -1; };
  const none = { complete: false, pathDone: false, cv: '', al: '', ctl: '', path: null };
  const pe = back(PATH_END, lines.length);
  const ce = pe < 0 ? -1 : back(CTL_END, pe), cb = ce < 0 ? -1 : back(CTL_BEGIN, ce);
  const ae = cb < 0 ? -1 : back(AL_END, cb), ab = ae < 0 ? -1 : back(AL_BEGIN, ae);
  const ve = ab < 0 ? -1 : back(END, ab), vb = ve < 0 ? -1 : back(BEGIN, ve);
  if (vb < 0) return none;
  const between = (a, b) => lines.slice(a + 1, b).map((l) => l.trim()).filter(Boolean).join('\n');
  const p = between(ce, pe).replace(/\n/g, '');
  return { complete: true, pathDone: true, cv: between(vb, ve), al: between(ab, ae), ctl: between(cb, ce), path: p && p.includes('/') ? p : null };
}

const isOnePath = (s) => !!s && !s.includes('\n') && s.startsWith('/');
const SAFE_PATH = /^\/[^\s'"`$;|&<>()*?\\]*$/;

/** What `command -v <name>` said the WORD is: { kind: 'alias', text, body } | { kind: 'function', text } | null. */
function wrapperOf(al, name) {
  const s = String(al || '').trim();
  if (!s || isOnePath(s)) return null;
  const m = /^alias\s+([^=\s]+)=([\s\S]*)$/.exec(s) || /^([^:\s]+): aliased to ([\s\S]*)$/.exec(s);
  if (m) {
    let body = m[2].trim();
    if (body.length >= 2 && body[0] === "'" && body.endsWith("'")) body = body.slice(1, -1).replace(/'\\''/g, "'");
    else if (body.length >= 2 && body[0] === '"' && body.endsWith('"')) body = body.slice(1, -1);
    return { kind: 'alias', text: s.slice(0, 300), body };
  }
  return { kind: 'function', text: s === name ? name : s.slice(0, 300) };
}

/** An alias body that IS a program's path: ONE word, an absolute path after ~ / $HOME expansion (the installer writes
 *  `alias claude="~/.claude/local/claude"`); anything else (flags, a pipeline, a variable) is not readable ⇒ null. */
function aliasTarget(body, home) {
  const b = String(body || '').trim();
  if (!b || /\s/.test(b)) return null;
  const h = typeof home === 'string' && home.startsWith('/') ? home.replace(/\/+$/, '') : null;
  let p = b;
  if (/^~(\/|$)/.test(p)) { if (!h) return null; p = h + p.slice(1); }
  else if (/^\$HOME(\/|$)/.test(p)) { if (!h) return null; p = h + p.slice(5); }
  else if (/^\$\{HOME\}(\/|$)/.test(p)) { if (!h) return null; p = h + p.slice(7); }
  return SAFE_PATH.test(p) ? p : null;
}

/** THE VERDICT over a parsed printout (complete): exactly one of
 *   { kind: 'path', path, via: 'program' | 'alias', wrapper } — the program (its wrapper, if any, is provenance)
 *   { kind: 'none', wrapper }                                  — the shell resolves names and holds no program
 *   { kind: 'unanswered', why: 'no-command-builtin' }          — the control word was not named: it could not be asked */
function judgeAnswer({ cv, al, ctl }, { name, home } = {}) {
  const wrapper = wrapperOf(al, name);
  if (isOnePath(String(cv || '').trim())) return { kind: 'path', path: String(cv).trim(), via: 'program', wrapper };
  if (!isOnePath(String(ctl || '').trim())) return { kind: 'unanswered', why: 'no-command-builtin' };
  if (isOnePath(String(al || '').trim())) return { kind: 'path', path: String(al).trim(), via: 'program', wrapper: null };
  if (wrapper && wrapper.kind === 'alias') {
    const t = aliasTarget(wrapper.body, home);
    if (t) return { kind: 'path', path: t, via: 'alias', wrapper };
  }
  return { kind: 'none', wrapper };
}

module.exports = { S0_SH, pickLoginShell, shellLine, programLookup, parseShellAnswer, wrapperOf, aliasTarget, judgeAnswer, shellName, NAME_OK, CONTROL_WORD,
  BEGIN, END, AL_BEGIN, AL_END, CTL_BEGIN, CTL_END, PATH_END };
