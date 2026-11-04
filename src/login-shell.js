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
// THE SHELL IS THE TRUTH FOR WHERE A PROGRAM IS — NOT THE SESSION'S PARENT (round 5, the final shape). Round 4 ran the
// person's interactive login shell inside the session (a shim): the shell took the pty's foreground (the chat went DEAF),
// its rc re-exported what the spawn stripped (billing, the agent PATH). Rounds 2–3 read alias BODIES and each acceptance
// found the next shape. So: the SPAWN is always a program path, and an alias / function body is never read — with ONE
// narrow rule, the installer's shape. The line asks, between sentinels:
//   CV  the PROGRAM the shell's PATH holds — the shell's own program-only spelling through ESCAPED builtins (bash
//       `\builtin type -P`, zsh `\builtin whence -p`, ksh `\whence -p`, fish `command -v`, else a subshell that drops
//       the alias and the function first) — so a person's `alias type='type -a'` never reaches it;
//   AL  whether the WORD is an alias or a function in that shell (`\command -v`: its text);
//   CTL a CONTROL word (`printenv`) through the same spelling — not named ⇒ the shell could not be asked;
//   PATH the exported PATH (`printenv PATH`, never "$PATH": fish keeps PATH as a list).
// judgeAnswer: an alias whose body is EXACTLY ONE word, an absolute path after ~ / $HOME expansion ⇒ that program (it wins
// over a PATH program: the person's shell would run it); EVERY other alias or function ⇒ not read: the PATH program
// (the wrapper NAMED), or nothing. The LAST whole sentinel sequence wins (an rc's banner or decoy echo never does).

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
 *  «alias x='…'», zsh «alias x=…») or a function's bare name ⇒ { kind, text, body } (an alias's body unquoted ONE layer —
 *  read only by the installer-shape rule, never interpreted). */
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

/** THE ONE NARROW RULE (the installer's shape, `alias claude="~/.claude/local/claude"`): a body that is EXACTLY ONE word,
 *  an absolute path after ~ / $HOME / ${HOME} expansion ⇒ that path; anything else ⇒ null (never read further). */
function aliasTarget(body, home) {
  const b = String(body || '').trim();
  if (!b || /\s/.test(b)) return null;
  const h = typeof home === 'string' && home.startsWith('/') ? home.replace(/\/+$/, '') : null;
  let p = b;
  if (/^~(\/|$)/.test(p)) { if (!h) return null; p = h + p.slice(1); }
  else if (/^\$HOME(\/|$)/.test(p)) { if (!h) return null; p = h + p.slice(5); }
  else if (/^\$\{HOME\}(\/|$)/.test(p)) { if (!h) return null; p = h + p.slice(7); }
  return p.startsWith('/') ? p : null;
}

/** THE VERDICT over a parsed printout (complete). Exactly one of:
 *   { kind: 'path', path, via: 'alias', wrapper }   — the installer-shape alias: its one absolute word (wins over PATH)
 *   { kind: 'path', path, via: 'program', wrapper }  — the PATH program (`wrapper` = the person's alias / function NAMED:
 *        VibeSpace runs the program WITHOUT it — said, never silently)
 *   { kind: 'none', wrapper }                        — the shell resolves names and holds no program for the word
 *   { kind: 'unanswered', why: 'no-command-builtin' } — the control word was not named: it could not be asked */
function judgeAnswer({ cv, al, ctl }, { name, home } = {}) {
  const wrapper = wrapperOf(al, name);
  const prog = isOnePath(String(cv || '').trim()) ? String(cv).trim() : isOnePath(String(al || '').trim()) ? String(al).trim() : null;
  const asked = isOnePath(String(ctl || '').trim()) || !!prog || !!wrapper;
  const target = wrapper && wrapper.kind === 'alias' ? aliasTarget(wrapper.body, home) : null;
  if (target) return { kind: 'path', path: target, via: 'alias', wrapper };
  if (prog) return { kind: 'path', path: prog, via: 'program', wrapper };
  if (!asked) return { kind: 'unanswered', why: 'no-command-builtin' };
  return { kind: 'none', wrapper };
}

module.exports = { S0_SH, pickLoginShell, shellLine, programLookup, parseShellAnswer, wrapperOf, aliasTarget, judgeAnswer, shellName, NAME_OK, CONTROL_WORD,
  BEGIN, END, AL_BEGIN, AL_END, CTL_BEGIN, CTL_END, PATH_END };
