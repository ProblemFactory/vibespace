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
/** What the WORD means to the shell (an alias first, then a function, then a program — its own resolution order). */
function wordLookup(name, shell) { return shellName(shell) === 'fish' ? `functions -q ${name}; and echo ${name}; or command -v ${name}` : `\\command -v ${name}`; } // fish: an «alias» is a function (unmeasured here: no fish on this box)

/** The one line asked of `shell` for `name` (sh, bash, zsh, ksh and fish read it). */
function shellLine(name, shell) {
  if (!NAME_OK.test(String(name || ''))) throw new TypeError(`login-shell: not a plain command name: ${String(name).slice(0, 60)}`);
  const pr = (a) => `printf '\\n${a}\\n'`;
  return [pr(BEGIN), programLookup(name, shell), pr(END), pr(AL_BEGIN), wordLookup(name, shell), pr(AL_END),
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

const WRAP_CMDS = new Set(['env', 'nice', 'nohup', 'exec', 'command', 'builtin', 'noglob', 'time', 'sudo', 'caffeinate']);
const UNREADABLE = /`|\$\(|;|\||&|<|>|\$\{(?!HOME\})|\$(?!HOME\b|\{HOME\})/;

/** ~ / $HOME / ${HOME} expanded at the front of a word, or null when it needs a HOME we do not have. */
function expandHome(word, home) {
  const h = typeof home === 'string' && home.startsWith('/') ? home.replace(/\/+$/, '') : null;
  if (/^~(\/|$)/.test(word)) return h ? h + word.slice(1) : null;
  if (/^\$HOME(\/|$)/.test(word)) return h ? h + word.slice(5) : null;
  if (/^\$\{HOME\}(\/|$)/.test(word)) return h ? h + word.slice(7) : null;
  return word;
}

/** An alias body as the shell would run it: its words (simple quotes honoured), the CLI word — the first word that names
 *  the CLI (its basename = `name`), else the first command word past assignments (X=1) and wrappers (env, nice, …) — and
 *  every OTHER word (the options the alias adds, a wrapper command): what VibeSpace does NOT apply. */
function aliasPlan(body, { name, home } = {}) {
  const src = String(body || '').trim();
  if (!src) return null;
  const words = [];
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(src))) words.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  const isAssign = (w) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w);
  let at = words.findIndex((w) => { const x = expandHome(w, home); return !!x && x.split('/').pop() === name; });
  if (at < 0) at = words.findIndex((w) => !isAssign(w) && !WRAP_CMDS.has(w) && !w.startsWith('-'));
  if (at < 0) return { unreadable: true, words };
  const word = words[at];
  const dropped = words.filter((_, i) => i !== at).join(' ');
  const unreadable = UNREADABLE.test(src.replace(/^(\$HOME|\$\{HOME\})/, ''));
  const expanded = expandHome(word, home);
  if (expanded && expanded.startsWith('/')) return { target: SAFE_PATH.test(expanded) ? expanded : null, word, dropped, unreadable };
  return { word, dropped, unreadable, bare: true };
}

/** THE VERDICT over a parsed printout (complete) — WHAT THE PERSON'S SHELL RUNS FOR THE WORD, in its own resolution order
 *  (round 3: an alias shadows PATH; a function shadows PATH but its body is unreadable). Exactly one of:
 *   { kind: 'path', path, via: 'program' | 'alias', wrapper, dropped } — the program VibeSpace spawns (`dropped` = the
 *        alias's other words, which VibeSpace does not apply — said, never silently)
 *   { kind: 'follow', word, wrapper, dropped } — the alias runs ANOTHER program by its bare name: the caller asks the shell
 *        for that word's program (one hop)
 *   { kind: 'none', wrapper }                  — the shell resolves names and runs no program for the word
 *   { kind: 'unanswered', why: 'no-command-builtin' } — the control word was not named: it could not be asked */
function judgeAnswer({ cv, al, ctl }, { name, home } = {}) {
  const wrapper = wrapperOf(al, name);
  const prog = isOnePath(String(cv || '').trim()) ? String(cv).trim() : isOnePath(String(al || '').trim()) ? String(al).trim() : null;
  const asked = isOnePath(String(ctl || '').trim()) || !!prog;
  if (wrapper && wrapper.kind === 'alias') {
    const plan = aliasPlan(wrapper.body, { name, home });
    if (plan && plan.target && !plan.unreadable) return { kind: 'path', path: plan.target, via: 'alias', wrapper, dropped: plan.dropped || '' };
    if (plan && plan.bare && plan.word === name) return prog ? { kind: 'path', path: prog, via: 'program', wrapper, dropped: plan.dropped || '' } : asked ? { kind: 'none', wrapper } : { kind: 'unanswered', why: 'no-command-builtin' };
    if (plan && plan.bare && !plan.unreadable && NAME_OK.test(plan.word)) return { kind: 'follow', word: plan.word, wrapper, dropped: plan.dropped || '' };
    return asked ? { kind: 'none', wrapper } : { kind: 'unanswered', why: 'no-command-builtin' };
  }
  if (prog) return { kind: 'path', path: prog, via: 'program', wrapper: wrapper && wrapper.kind === 'function' ? wrapper : null, dropped: '' };
  if (!asked) return { kind: 'unanswered', why: 'no-command-builtin' };
  return { kind: 'none', wrapper };
}

module.exports = { S0_SH, pickLoginShell, shellLine, programLookup, wordLookup, parseShellAnswer, wrapperOf, aliasPlan, expandHome, judgeAnswer, shellName, NAME_OK, CONTROL_WORD,
  BEGIN, END, AL_BEGIN, AL_END, CTL_BEGIN, CTL_END, PATH_END };
