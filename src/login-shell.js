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
// THE PERSON'S SHELL RUNS ITS OWN WRAPPER (round 4 — the law restated after three rounds of reading alias bodies: an
// alias body is the person's shell's grammar — assignments, launchers (npx, bunx, node), wrappers (sudo, nice, env),
// redirects, quoting — and reading it is the hand-kept recipe set the owner refused). VibeSpace NEVER interprets an alias
// or a function. The line asks, between sentinels:
//   CV  the PROGRAM the shell's PATH holds — the shell's own program-only spelling through ESCAPED builtins (bash
//       `\builtin type -P`, zsh `\builtin whence -p`, ksh `\whence -p`, fish `command -v`, else a subshell that drops
//       the alias and the function first) — so a person's `alias type='type -a'` never reaches it;
//   AL  whether the WORD is an alias or a function in that shell (`\command -v`: its text, never read further);
//   CTL a CONTROL word (`printenv`) through the same spelling — not named ⇒ the shell could not be asked;
//   PATH the exported PATH (`printenv PATH`, never "$PATH": fish keeps PATH as a list).
// Two cases only (judgeAnswer): the word is NOT a wrapper and the shell names a program ⇒ that program, spawned
// directly; the word IS an alias / a function ⇒ the CLI's recipe is THE SHELL ITSELF (`shimScript`: `<shell> -l -i -c
// '<cli> "$@"'`), proven once by a bounded `<cli> --version` through the same road (`versionLine` / `parseVersion`).
// The LAST whole sentinel sequence wins (an rc's banner or decoy echo never does).

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

/** THE PROGRAM-ONLY SPELLING per shell (the alias / function wearing the name bypassed). Round 3: the lookup words are
 *  the BUILTINS themselves, escaped past the person's own aliases (`alias type='type -a'` must never turn a missing CLI
 *  into «could not be asked»): `\builtin` in bash / zsh, a backslashed word elsewhere (an alias never expands a quoted
 *  word); fish's `command` is a builtin no alias reaches. */
function programLookup(name, shell) {
  const sh = shellName(shell);
  if (sh === 'bash') return `\\builtin type -P ${name}`;
  if (sh === 'zsh') return `\\builtin whence -p ${name}`;
  if (sh === 'ksh' || sh === 'ksh93' || sh === 'mksh') return `\\whence -p ${name}`;
  if (sh === 'fish') return `command -v ${name}`;
  return `(\\unalias ${name}; \\unset -f ${name}; \\command -v ${name}) 2>/dev/null`;
}
/** The one line asked of `shell` for `name` (sh, bash, zsh, ksh and fish read it). */
function shellLine(name, shell) {
  if (!NAME_OK.test(String(name || ''))) throw new TypeError(`login-shell: not a plain command name: ${String(name).slice(0, 60)}`);
  const pr = (a) => `printf '\\n${a}\\n'`;
  return [pr(BEGIN), programLookup(name, shell), pr(END), pr(AL_BEGIN), shellName(shell) === 'fish' ? `functions -q ${name}; and echo ${name}; or command -v ${name}` : `\\command -v ${name}`, pr(AL_END),
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

/** Is the WORD an alias or a function in the person's shell? `command -v` printed an alias definition (bash / dash
 *  «alias x='…'», zsh «alias x=…») or a function's bare name ⇒ { kind, text } — the TEXT only, never read further. */
function wrapperOf(al, name) {
  const s = String(al || '').trim();
  if (!s || isOnePath(s)) return null;
  if (/^alias\s/.test(s) || /: aliased to /.test(s)) return { kind: 'alias', text: s.slice(0, 300) };
  return { kind: 'function', text: s === name ? name : s.slice(0, 300) };
}

/** THE VERDICT over a parsed printout (complete). Exactly one of:
 *   { kind: 'path', path }            — the word is no wrapper and the shell names a program: spawn it directly
 *   { kind: 'wrapper', wrapper, path } — the word IS an alias / a function (whatever its body, a program on PATH or not —
 *        the shell would run the wrapper, so VibeSpace runs the wrapper): the recipe is the shell itself, proven by a probe
 *   { kind: 'none' }                  — the shell resolves names (the control word answered) and holds nothing
 *   { kind: 'unanswered', why: 'no-command-builtin' } — the control word was not named: it could not be asked */
function judgeAnswer({ cv, al, ctl }, { name } = {}) {
  const wrapper = wrapperOf(al, name);
  const prog = isOnePath(String(cv || '').trim()) ? String(cv).trim() : isOnePath(String(al || '').trim()) ? String(al).trim() : null;
  const asked = isOnePath(String(ctl || '').trim()) || !!prog || !!wrapper;
  if (wrapper) return { kind: 'wrapper', wrapper, path: prog };
  if (prog) return { kind: 'path', path: prog };
  if (!asked) return { kind: 'unanswered', why: 'no-command-builtin' };
  return { kind: 'none' };
}

const VB = '__VS_VER_BEGIN__', VE = '__VS_VER_END__';
/** THE PROBE's line: `<cli> --version` run BY THE SHELL (its alias expanded, its function run — exactly as the person's
 *  terminal does), between sentinels; the shell's stderr is what a refusal quotes. */
function versionLine(name, shell) {
  if (!NAME_OK.test(String(name || ''))) throw new TypeError(`login-shell: not a plain command name: ${String(name).slice(0, 60)}`);
  const rc = shellName(shell) === 'fish' ? '$status' : '$?';
  return `printf '\\n${VB}\\n'; ${name} --version; printf '\\n${VE} %s\\n' ${rc}`;
}
/** → { complete, version, code }: the LAST non-empty versioned line between the LAST pair, and the CLI's own exit code
 *  (the end sentinel carries it). */
function parseVersion(out) {
  const lines = String(out || '').split(/\r?\n/);
  let e = -1; for (let i = lines.length - 1; i >= 0; i--) if (lines[i] === VE || lines[i].startsWith(VE + ' ')) { e = i; break; }
  let b = -1; for (let i = e - 1; i >= 0; i--) if (lines[i] === VB) { b = i; break; }
  if (e < 0 || b < 0) return { complete: false, version: '', code: null };
  const body = lines.slice(b + 1, e).map((l) => l.trim()).filter(Boolean);
  const v = body.filter((l) => /\d+\.\d+/.test(l)).pop() || '';
  const code = Number.parseInt(lines[e].slice(VE.length).trim(), 10);
  return { complete: true, version: v.slice(0, 200), code: Number.isInteger(code) ? code : null };
}

/** THE RECIPE: a CLI the person's shell runs through its wrapper is spawned BY THAT SHELL — `<shell> -l -i -c '<cli> "$@"'`,
 *  the session's argv as "$@". The rc's own stdout / stderr (a banner, bash's «no job control» lines) go to /dev/null
 *  while it starts; the CLI gets the session's stdout / stderr back (fd 3 / 4) — stream-json stays clean (measured). For
 *  an alias both shells EXEC the expansion, so the CLI's pid is the shim's (measured); a function keeps the shell as its
 *  parent. Single-quoted shell path; a NAME_OK name. */
function shimScript(shell, name) {
  if (!NAME_OK.test(String(name || ''))) throw new TypeError(`login-shell: not a plain command name: ${String(name).slice(0, 60)}`);
  const q = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;
  return `#!/bin/sh\n# VibeSpace: ${name} runs through the person's login shell (its alias / function) — lane cli-shell-truth\nexec 3>&1 4>&2 >/dev/null 2>&1\nexec ${q(shell)} -l -i -c 'exec 1>&3 2>&4 3>&- 4>&-; ${name} "$@"' ${name} "$@"\n`;
}

module.exports = { S0_SH, pickLoginShell, shellLine, programLookup, parseShellAnswer, wrapperOf, judgeAnswer, versionLine, parseVersion, shimScript, shellName, NAME_OK, CONTROL_WORD,
  BEGIN, END, AL_BEGIN, AL_END, CTL_BEGIN, CTL_END, PATH_END };
