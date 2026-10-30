/**
 * THE SHELL'S WORDS — PURE (imports nothing; CJS so the server's channel witness, the bundle and the client's run summary
 * share ONE reading). Enough of the shell grammar to tell a COMMAND WORD from prose: `shellCommands` (the simple commands
 * of a command line), `commandWord`, `shellScripts` (a shell IS its script), `commandsRun` (every command a line runs —
 * its spans, a shell's script, a script runner's, a find -exec's, `env -S`'s), `cliRuns` / `channelsRuns` (where the
 * channels CLI is a command word). Bounded: SCAN_MAX characters of shell, nesting 4; what it cannot read is `blind`.
 * r6: `endJobs` — which of a line's background jobs the line ENDS itself (a foreground `wait` / `kill` of the job's pid).
 * r7: a job sent to the background is a shell of its own (the jobs it launches are its orphans), a disowned job is never
 * waited for, a function's body runs only where it is called.
 * r8: UNSURE ⇒ IT LINGERS — `ended` is said only where every shell the agent may run (bash, zsh) surely ended the job.
 * r9: STOP READING THE SHELL — a job ends only in the PLAINEST shape (a lone top-level `C &`, a lone top-level `wait` /
 * `wait $!` / `kill $!` / `kill -TERM $!` after it, nothing but plain commands between); everything else lingers.
 * r10: what may stand BETWEEN the job and its reaper is a CLOSED allowlist (BETWEEN); a `kill` ends a job only when the
 * job's own command IS the CLI; a line that writes a name the shells keep (RESERVED), defines a function, does
 * arithmetic or sends anything else to the background ends nothing; a heredoc's substitutions run in the job of the
 * command it feeds.
 * r11: a newline after `|`, `|&`, `&&` or `||` continues the list; a special builtin (`:`) with a redirection is no row
 * of the allowlist, a reaper's redirection reaches /dev/null, 0–2 or a close only; a job that is neither the CLI (its
 * bare name) nor a row of the allowlist makes the WHOLE line end nothing; a name a command writes must be a plain
 * literal the reader can compare (a `{NAME}>` redirection writes NAME too); arithmetic anywhere bash evaluates it (a
 * subscript, `$[ ]`, `${x:off}`, `[[ -eq ]]`, an integer name) and an expansion that evaluates a value (`${x@P}`, zsh
 * `(e)`) end nothing; a carriage return is a word's own character (a CRLF line's `wait\r` is no `wait`).
 * r12: UNKNOWN ⇒ STOP — a construct the scan does not parse ends nothing (a `(` glued to a word, a `[[ … ]]` its
 * operators split, `((` wherever it stands, bash 5.3's `${ …; }`), never a longer allowlist; a continuation after `|`,
 * `|&`, `&&`, `||` whatever stood on its left; a construct after an opener (`then for IFS in …`, `if [[ i -eq 0 ]]`,
 * `then wait () { …; }`) is read as at a command's start; an indirection (`${!x}`), a compound assignment's subscript
 * and the text a builtin expands in the shell itself (a heredoc, a here-string) end nothing; a builtin that evaluates
 * text it is given (mapfile / readarray `-C`, complete, bind, fc, sched) is UNSURE; a redirection target is a
 * descriptor only in the dup form (`>&2`; `> 2` is a file named 2).
 * r13: UNREAD TEXT IS NEVER INERT — a STOP keeps a line from ending its jobs, it never hides a command from the reading:
 * `(( … ))` / `$(( … ))` is read as the shells expand it, as if double-quoted (`if (( $(C) > 0 ))` runs C), a `((`
 * whose inner `(` closes short of its `))` is two subshells (`((C) | head)`); the words of an unquoted `${ … }` are read
 * with the quotes the shells keep there (`${x:-'$(C)'}` prints `$(C)`); a trap's action and mapfile's `-C` callback are
 * scripts the shell runs later.
 *
 * lane touch-chip-cause (the .362 train fix, 2026-10-29): moved out of src/channel-touch.js — chat-run-summary (the
 * client's run summary, which imports nothing but PURE rule modules: test-collab-live-counter, test-fold-ux and
 * test-chat-hygiene pin its import lines) opens a chained command's compact head at the CLI's command word with
 * `channelsRuns` from HERE; src/channel-touch.js (the witness's decisions) imports this module and re-exports what it
 * always exported. Gate: test-channel-touch (every scanner table and control; a control's patched copy of THIS file is
 * loaded under a channel-touch.js copy that requires it).
 */
'use strict';

const CLI = 'vibespace-channels';
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
/** words after which the next word is again a command word */
const OPENERS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}', 'fi', 'done', 'esac', 'coproc']);
/** r12: the words of a simple command after its OPENERS (`then`, `do`, `!`, `{` …) — where a construct stands that
 *  the scan reads at a command's start (W2 / W3: never `words[0]` only) */
const afterOpeners = (w) => { const h = w.findIndex((x) => x.q || !OPENERS.has(x.v)); return h < 0 ? [] : w.slice(h); };
/** r12: a `[[ … ]]` the scan SPLIT — its `(`, `)`, `&&`, `||` end a simple command, so one command holds a `[[` with no
 *  `]]` after it or a `]]` with none before it (`[[ 1 && i -eq 0 ]]`, `[[ ( i -eq 0 ) ]]`): not parsed — a STOP */
const splitCond = (w) => { const a = w.findIndex((x) => !x.q && x.v === '[['), b = w.findIndex((x) => !x.q && x.v === ']]'); return (a >= 0 || b >= 0) && !(a >= 0 && b > a); };
/** r13: the `((` at `i` opens ARITHMETIC — its inner `(` closes right before its outer `)`, `(( … ))`; otherwise it is
 *  two subshells (`((C) | head)`, `$((C) | x)` — bash, zsh and dash run C), read as groups */
const arithAt = (s, i) => { const e = spanEnd(s, i, '(', ')', false); return e < s.length && spanEnd(s, i + 1, '(', ')', false) === e - 1; };
/** words that open a construct whose words are data (`for c in …`) */
const DATA_HEADS = new Set(['for', 'case', 'select', 'function']);
/** wrappers that run their operand as a command — the options that take an argument (skipped with it). r3: + command
 *  (`command -v` / `-V` is a LOOKUP — it runs nothing), exec -a, time -p (the shell's keyword and /usr/bin/time), strace,
 *  ltrace, ionice */
const WRAPPERS = new Map([['exec', ['-a']], ['env', ['-u', '-C']], ['sudo', ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U']], ['doas', ['-u']],
  ['nohup', []], ['timeout', ['-s', '-k']], ['xargs', ['-n', '-P', '-I', '-L', '-s', '-d', '-E', '-a']], ['nice', ['-n']], ['stdbuf', ['-i', '-o', '-e']], ['setsid', []],
  ['command', []], ['time', ['-f', '-o', '--format', '--output']], ['strace', ['-e', '-o', '-p', '-s', '-u', '-E', '-P', '-X', '-a', '-b', '-I', '-O', '-S', '-U']],
  ['ltrace', ['-e', '-o', '-p', '-s', '-u', '-a', '-n', '-A', '-D', '-F', '-l', '-w', '-x', '-L']], ['ionice', ['-c', '-n', '-p']]]);
/** r3: commands whose remaining words ARE a shell script — `eval …`, `watch …` (it runs `sh -c "$*"`), GNU `parallel CMD
 *  ::: ARGS` (the template up to `:::`): the options that take an argument. The runner is its script's commands, never a
 *  command of its own. */
const SCRIPT_RUNNERS = new Map([['eval', []], ['watch', ['-n', '--interval']],
  ['parallel', ['-j', '--jobs', '-N', '-n', '-S', '--sshlogin', '-a', '--arg-file', '-d', '--delimiter', '-I', '-L', '--colsep', '--delay', '--timeout', '--joblog', '--results', '-P', '--halt', '--tagstring', '--workdir']]]);
/** r3: `find … -exec CMD … ;` — the actions whose operand is a command */
const FIND_RUNS = new Set(['-exec', '-execdir', '-ok', '-okdir']);
const ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** r4: `env -S '…'` / `--split-string=…` — the option's argument IS a command line (split on spaces), never an option
 *  argument to skip */
const ENV_SPLIT = Object.freeze(['-S', '--split-string']);
/** The scanner reads this many characters of SHELL; anything after (and an unclosed heredoc's body) is BLIND text —
 *  never inert (it could run), never a run of the CLI (r4: a call that could not be READ never proves a command word).
 *  r4: a heredoc's BODY is no shell — it is read to its delimiter line whatever its length and never counts here. */
const SCAN_MAX = 8192;
/** r4: the words of a compound command — a group opened by one is closed by its pair; the group is ONE command of the
 *  list around it (`( … ) &`, `{ …; } &`, `for … done &`, `if … fi &` send every command of it to the background) */
const GROUP_OPEN = new Map([['{', '}'], ['for', 'done'], ['while', 'done'], ['until', 'done'], ['select', 'done'], ['if', 'fi'], ['case', 'esac']]);
const GROUP_CLOSE = new Set(['}', 'done', 'fi', 'esac']);
/** r4: the forms of a FILE tool (RUNS_NOTHING) that RUN a program — `git rebase -x CMD`, `git bisect run CMD`, `git
 *  submodule foreach CMD`, `git -c alias.x='!CMD'`, `rg --pre CMD`, `sort --compress-program=CMD`: could run (unread), never
 *  inert. A git HOOK (pre-commit …) is not read — a named blind spot. */
const RUNS_A_COMMAND = new Map(Object.entries({
  git: (ws) => {
    let k = 0;
    for (; k < ws.length; k++) {   // git's own options: `-c name=value` / `-C dir` take one
      if (ws[k] === '-c' && /^alias\.[^=]*=\s*!/.test(ws[k + 1] || '')) return true;
      if (ws[k] === '-c' || ws[k] === '-C') { k++; continue; }
      if (!ws[k].startsWith('-')) break;
    }
    const sub = ws[k], rest = ws.slice(k + 1);
    return (sub === 'rebase' && rest.some((w) => /^(-x|--exec)(=|$)/.test(w))) || (sub === 'bisect' && rest[0] === 'run') || (sub === 'submodule' && rest.includes('foreach'));
  },
  rg: (ws) => ws.some((w) => /^--pre(=|$)/.test(w)),
  sort: (ws) => ws.some((w) => /^--compress-program(=|$)/.test(w)),
}));
/** r4: a heredoc's DELIMITER word at `i` (just past `<<` / `<<-` and blanks) — quotes and escapes removed: `{delim,
 *  quoted, end}`. */
function heredocDelim(s, i) {
  let d = '', q = false;
  while (i < s.length && !' \t\n;&|()<>'.includes(s[i])) {   // r11: a CR is a word's own character (bash, zsh)
    const ch = s[i];
    if (ch === "'") { const k = s.indexOf("'", i + 1); const e = k < 0 ? s.length : k; d += s.slice(i + 1, e); i = e + 1; q = true; continue; }
    if (ch === '"') { let k = i + 1; for (; k < s.length && s[k] !== '"'; k++) { if (s[k] === '\\') k++; d += s[k] || ''; } i = k + 1; q = true; continue; }
    if (ch === '\\') { d += s[i + 1] || ''; i += 2; q = true; continue; }
    d += ch;
    i++;
  }
  return { delim: d, quoted: q, end: i };
}
/** r4: the index just past a heredoc's BODY that starts at `i` (the line after its `<<` line): its lines up to the
 *  delimiter line (leading tabs stripped for `<<-`) — `{end, closed, body}`; unclosed, the body runs to the text's end. */
function heredocBody(s, i, h) {
  const lines = [];
  while (i < s.length) {
    let j = s.indexOf('\n', i);
    if (j < 0) j = s.length;
    const line = s.slice(i, j);
    i = j + 1;
    if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) return { end: Math.min(i, s.length), closed: true, body: lines.join('\n') };
    lines.push(line);
  }
  return { end: s.length, closed: false, body: lines.join('\n') };
}
/** The closing index of a `$(` / `${` / backtick span opening at `i` (quotes inside honoured), or the end. r4: a heredoc
 *  inside a `$( … )` span (Claude Code's own `git commit -m "$(cat <<'EOF' … EOF\n)"`) is skipped to its delimiter line —
 *  a `)` / quote in its body never closes anything; `(( … ))` inside is arithmetic (its `<<` a shift). r6: the length of
 *  the heredoc bodies it skips is added to `acc.docs` (the caller's SCAN_MAX never counts a heredoc body). */
function spanEnd(s, i, open, close, docs = open === '(', acc = null) {
  let depth = 0, pending = [];
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') { j++; continue; }
    if (docs && ch === '\n' && pending.length) {
      let k = j + 1;
      for (const h of pending) { const b = heredocBody(s, k, h); if (!b.closed) return s.length; if (acc) acc.docs += b.end - k; k = b.end; }
      pending = [];
      j = k - 1;
      continue;
    }
    if (ch === "'" && open !== '`') { const k = s.indexOf("'", j + 1); if (k < 0) return s.length; j = k; continue; }
    if (ch === '"' && open !== '`') { for (j++; j < s.length && s[j] !== '"'; j++) if (s[j] === '\\') j++; continue; }
    if (open === '`') { if (ch === '`' && j > i) return j; continue; }
    if (docs && ch === '<' && s[j + 1] === '<') {
      if (s[j + 2] === '<') { j += 2; continue; }   // a here-string
      let k = j + 2;
      const strip = s[k] === '-';
      if (strip) k++;
      while (s[k] === ' ' || s[k] === '\t') k++;
      const d = heredocDelim(s, k);
      if (d.delim) pending.push({ delim: d.delim, strip });
      j = Math.max(j + 1, d.end - 1);
      continue;
    }
    if (ch === '(' && s[j + 1] === '(' && j > i) { j = spanEnd(s, j, '(', ')', false); continue; }   // `(( … ))` / `$(( … ))` inside
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return j;
  }
  return s.length;
}

/** THE SHELL'S WORDS (lane touch-chip-cause — enough of the grammar to tell a COMMAND WORD from prose): one entry per
 *  simple command, `{words: [{v, at, end, q}], owner, src, pipeFrom}` — `v` is the word with its quotes and escapes
 *  removed (`'…'`, `"…"`, `$'…'`), `at` / `end` its span in `src`, `q` whether it was quoted; ; & && || | ( ) newline end
 *  a simple command (a single `&` marks it `words.bg` — sent to the background; after a single `|` the next command's
 *  `pipeFrom` is this one); a `$( … )` / backtick / `<( … )` / `>( … )` span is a command line of its own (its commands'
 *  `owner` = the word holding it); `(( … ))` / `$(( … ))` is arithmetic, no command (r13: its `$( … )` read); a heredoc's lines are kept on the
 *  command that reads them (`words.heredocs`; an UNQUOTED heredoc's `$( … )` runs — scanned), a here-string on
 *  `words.herestrings`; a # comment (at a word's start) and a redirection's target are no words; r4: a single `&` sends
 *  its whole AND-OR LIST to the background, as bash does — every command of `a | b &`, `cd x && ./run.sh &` and of a
 *  compound command (`( … ) &`, `{ …; } &`, `for … done &`, `if … fi &`) is `bg`.
 *  r6: each single `&` makes ONE JOB of this shell (`words.jobs` = every job around a command, innermost first: a run
 *  ends only when each did); a command after `&&` / `||` carries `words.andOr`; endJobs marks the jobs the line ends
 *  itself. r7: zsh `&!` / `&|` disown the job at birth; `name ()` marks a definition (`words.def`). r8: `coproc …` is a
 *  job of this shell (never ended). r9: `words.depth` = the groups open around a command (a branch, a loop, a subshell, a
 *  function's body: 0 = the line's top level); `words.lone` = a LONE command — the only one of its list (no `&&` / `||`,
 *  no pipe) at the top level: 'job' (its own `&`), 'disowned' (`&!` / `&|`), 'fg' (`;`, a newline, the end); a
 *  redirection's target is kept on `words.targets`, a process substitution marks `words.procsub`; `(( … ))` is a STOP
 *  (its place in `stops`); a line endJobs cannot be sure of (it sets options or traps, sources / evals text, redefines
 *  `wait` / `kill`) is `unsure` — none of its jobs ends, nor any job of a span inside it.
 *  PURE, bounded: SCAN_MAX characters of shell (a heredoc's body is read to its delimiter line and never counts — r6: a
 *  heredoc inside a `$( … )` span neither), nesting
 *  4 — the rest (and an unclosed heredoc's body) is returned as `blind` text. */
function shellCommands(src, owner = null, depth = 0, offset = 0) {
  const s = String(src || '');
  const out = [];
  out.blind = [];
  if (depth > 4) { out.blind.push(s); return out; }
  // r4: `list` = the index of the first command of the AND-OR LIST being read (a `;`, a newline or a single `&` starts the
  // next); a compound command open here is ONE command of the list around it — {close: the word (or `)`) that closes it,
  // outer: that list}
  // r6: `mine` = this shell's own commands (a span's are its own shell's); `andOr` = the next command runs on a condition
  // (after `&&` / `||`); `span.docs` = the heredoc bodies read inside `$( … )` spans
  // r8: `coproc` = a `coproc` read, its list not ended yet ({depth, from}); r9: `stops` = where an `(( … ))` stands
  // r12: `cont` = the last token was `|`, `|&`, `&&` or `||` (whatever stood on its left — a word, a subshell, a group);
  // `op` = the redirection operator whose target comes next; `stops` also = where a construct the scan does not parse
  // stands (UNKNOWN ⇒ STOP)
  let words = [], pending = [], redirect = false, pipe = null, skipped = 0, list = 0, andOr = false, coproc = null, cont = false, op = '';
  const groups = [], mine = [], span = { docs: 0 }, stops = [];
  const end = () => {
    const c = words.length ? { words, owner, src: s, pipeFrom: pipe } : null;
    if (c) { out.push(c); mine.push(c); words.depth = groups.length; words.andOr = andOr; andOr = false; if (splitCond(words)) stops.push(words[0].at); }
    words = []; pipe = null;
    return c;
  };
  // r9: a LONE command — the only command of its list (no `&&` / `||` before it, no pipe), at the line's top level (no
  // group, branch, loop, subshell or function body around it): `how` it ended — 'job', 'disowned', 'fg'
  const lone = (c, how) => { if (c && !c.words.depth && !c.words.andOr && !c.pipeFrom && (mine.length < 2 || out.indexOf(mine[mine.length - 2]) < list)) c.words.lone = how; };
  // the group a closer ends — `)` only the innermost `(` (a `case` pattern's `)` closes nothing); a word, its own opener
  const closeGroup = (close) => {
    const k = close === ')' ? (groups.length && groups[groups.length - 1].close === ')' ? groups.length - 1 : -1) : groups.map((g) => g.close).lastIndexOf(close);
    if (k < 0) return null;
    closeCoproc();   // r8: a coproc inside the group ends here
    const g = groups[k];
    groups.length = k;
    if (coproc && coproc.depth > groups.length) coproc = null;
    return g;
  };
  // r6: ONE JOB of this shell — its list's commands from `from` (and the spans in them) run in it
  const launch = (job, from) => { for (let k = from; k < out.length; k++) { const w = out[k].words; w.bg = true; w.jobs = [...(w.jobs || []), job]; } };
  // r8: `coproc …` — its command runs in the background (bash and zsh set `$!` to it), launched where its list ends,
  // never ended by the line
  const closeCoproc = () => { if (coproc && groups.length === coproc.depth) { launch({ ended: false }, coproc.from); coproc = null; } };
  const nested = (body, at) => { const r = shellCommands(body, owner === null ? offset + at : owner, depth + 1); for (const c of r) out.push(c); for (const b of r.blind) out.blind.push(b); };
  // the command substitutions an UNQUOTED heredoc's body runs (`$( … )`, backticks — never `$(( … ))` arithmetic, its
  // text read on) — r13: and an ARITHMETIC span's text, which the shells expand as if double-quoted (`(( $(C) > 0 ))`
  // runs C; a `'` there quotes nothing); `from` — where the body stands in the line (each owned by its own `$`)
  const substitutions = (body, at, from = -1) => {
    for (let j = 0; j < body.length; j++) {
      if (body[j] === '\\') { j++; continue; }
      if (body[j] === '$' && body[j + 1] === '(' && !(body[j + 2] === '(' && arithAt(body, j + 1))) { const e = spanEnd(body, j + 1, '(', ')'); nested(body.slice(j + 2, e), from < 0 ? at : from + j); j = e; continue; }
      if (body[j] === '`') { const e = spanEnd(body, j, '`', '`'); nested(body.slice(j + 1, e), from < 0 ? at : from + j); j = e; }
    }
  };
  // r13: `lim` — where the word must stop (the end of a `${ … }` it stands in), `at` — the word that owns its spans
  const readWord = (i, lim = s.length, at = i) => {
    let v = '', q = false;
    while (i < lim) {
      const ch = s[i];
      if (' \t\n;&|()<>'.includes(ch)) break;   // r11: a CR is no blank — `wait\r` is a command of its own (not found)
      if (ch === '\\') { if (s[i + 1] !== '\n') v += s[i + 1] || ''; i += 2; q = true; continue; }
      if (ch === "'") { const k = s.indexOf("'", i + 1); const e = k < 0 ? s.length : k; v += s.slice(i + 1, e); i = e + 1; q = true; continue; }
      if (ch === '$' && s[i + 1] === "'") {   // ANSI-C quoting: `$'don\'t …'` — a `\` escapes the next character
        let j = i + 2;
        for (; j < s.length && s[j] !== "'"; j++) { if (s[j] === '\\') { v += s[j + 1] || ''; j++; continue; } v += s[j]; }
        i = j + 1; q = true;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        for (; j < s.length && s[j] !== '"'; j++) {
          if (s[j] === '\\') { v += s[j + 1] || ''; j++; continue; }
          if (s[j] === '$' && s[j + 1] === '(' && s[j + 2] === '(' && arithAt(s, j + 1)) { const e = spanEnd(s, j + 1, '(', ')', false); substitutions(s.slice(j + 3, e - 1), at); j = e; v += '$(())'; continue; }   // r13: read
          if (s[j] === '$' && s[j + 1] === '{' && FUNSUB.test(s[j + 2] || '')) { const e = spanEnd(s, j + 1, '{', '}'); nested(s.slice(j + 3, e), at); v += s.slice(j, e + 1); j = e; continue; }   // r12
          if (s[j] === '$' && s[j + 1] === '(') { const e = spanEnd(s, j + 1, '(', ')', true, span); nested(s.slice(j + 2, e), at); v += '$()'; j = e; continue; }
          if (s[j] === '`') { const e = spanEnd(s, j, '`', '`'); nested(s.slice(j + 1, e), at); v += '$()'; j = e; continue; }
          v += s[j];
        }
        i = j + 1; q = true;
        continue;
      }
      if (ch === '$' && s[i + 1] === '(' && s[i + 2] === '(' && arithAt(s, i + 1)) { const e = spanEnd(s, i + 1, '(', ')', false); substitutions(s.slice(i + 3, e - 1), at); v += '$(())'; i = e + 1; continue; }   // r13: read
      if (ch === '$' && s[i + 1] === '(') { const e = spanEnd(s, i + 1, '(', ')', true, span); nested(s.slice(i + 2, e), at); v += '$()'; i = e + 1; continue; }
      if (ch === '$' && s[i + 1] === '{' && FUNSUB.test(s[i + 2] || '')) { const e = spanEnd(s, i + 1, '{', '}'); nested(s.slice(i + 3, e), at); v += s.slice(i, e + 1); i = e + 1; continue; }   // r12
      // r12: a parameter's own words run their substitutions (`${x:-$(C &)}`) — r13: read with the quotes the shells
      // keep there (paramWord), never the heredoc's (`${x:-'$(C)'}` runs nothing)
      if (ch === '$' && s[i + 1] === '{') { const e = spanEnd(s, i + 1, '{', '}'); paramWord(i + 2, e, at); v += s.slice(i, e + 1); i = e + 1; continue; }
      if (ch === '`') { const e = spanEnd(s, i, '`', '`'); nested(s.slice(i + 1, e), at); v += '$()'; i = e + 1; continue; }
      v += ch;
      i++;
    }
    return { v, at, end: i, q };
  };
  // r13: the text of an UNQUOTED `${ … }` (`${x:-word}`, `${x#word}`, `${x/a/b}` …) — its words read as words, with the
  // quotes every shell keeps there: `'…'` / `$'…'` quote (`${x:-'$(C)'}` prints `$(C)` — bash, zsh, dash), `"…"` is a
  // double quote, a `$( … )` / backtick / `$(( … ))` / `${ … }` read as in any word; bash runs a `<( … )` there (its
  // `$!` — a stop; zsh refuses the line)
  const paramWord = (j, e, at) => {
    while (j < e) {
      if ((s[j] === '<' || s[j] === '>') && s[j + 1] === '(') { const k = spanEnd(s, j + 1, '(', ')', true, span); nested(s.slice(j + 2, k), at); stops.push(j); j = k + 1; continue; }
      if (' \t\n;&|()<>'.includes(s[j])) { j++; continue; }
      j = readWord(j, e, at).end;
    }
  };
  let i = 0;
  while (i < s.length && i - skipped - span.docs < SCAN_MAX) {
    const ch = s[i];
    if (ch === '\n') {
      // r11: a newline after `|`, `|&`, `&&` or `||` CONTINUES the pipeline or the and-or list on the next line (every
      // shell — the lexer's continuation, like a backslash-newline: `C |⏎ tee x &` sends C to the background, `cat <<EOF
      // &&⏎ … EOF⏎ echo ok &` the heredoc's substitutions); a heredoc's body is still read here — r12: whatever stood on
      // the left of the operator (W1: `( C ) |⏎ cat &` — after a subshell `pipe` is null, the list went on regardless)
      const more = !words.length && (cont || pipe !== null || andOr);
      if (!more) { lone(end(), 'fg'); closeCoproc(); }   // r8: a coproc's list ends
      i++;
      for (const h of pending) {   // the heredoc's lines: up to the delimiter line, whatever their length (r4: no shell)
        const b = heredocBody(s, i, h);
        skipped += b.end - i;
        i = b.end;
        (h.words.heredocs || (h.words.heredocs = [])).push(b.body);
        if (!b.closed) out.blind.push(b.body);   // an UNCLOSED heredoc — its body is blind text
        else if (!h.quoted) {
          // r10: the body is expanded by the process that runs the command it feeds — sent to the background before the
          // body was read (`cat <<EOF > o.txt &`), its substitutions run in that job
          // r12: a builtin's is expanded by the shell itself (`: <<EOF⏎$((IFS=…))⏎EOF`) — kept for `arithmetic`
          (h.words.expands || (h.words.expands = [])).push(b.body);
          const from = out.length;
          substitutions(b.body, h.at);
          if (h.words.bg) for (let k = from; k < out.length; k++) { const w = out[k].words; w.bg = true; w.jobs = [...(w.jobs || []), ...h.words.jobs]; }
        }
      }
      pending = [];
      if (!more) list = out.length;
      continue;
    }
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '\\' && s[i + 1] === '\n') { i += 2; continue; }
    if (ch === '#') { while (i < s.length && s[i] !== '\n') i++; continue; }   // a word's start: a comment to the line's end
    cont = false;   // r12: a token — the separators below say whether it continues the list past a newline
    if (ch === '&' && s[i + 1] === '>') { op = s[i + 2] === '>' ? '&>>' : '&>'; i += op.length; redirect = true; continue; }
    // `(( … ))` arithmetic (r9: a stop) — r12: wherever it stands (`then (( i ))`, `while (( i ))`, `for (( i; 0; ))`);
    // r13: a stop for the jobs, READ for the commands — its text as the shells expand it (`if (( $(C) > 0 ))` runs C);
    // a `((` that is two subshells (`then ((C) | head)`) is read on as groups (still a stop)
    if (ch === '(' && s[i + 1] === '(') {
      stops.push(i);
      if (arithAt(s, i)) { const e = spanEnd(s, i, '(', ')', false); substitutions(s.slice(i + 2, e - 1), i, i + 2); i = e + 1; continue; }
    }
    if (ch === '|' && s[i + 1] === '&') { pipe = end(); redirect = false; i += 2; cont = true; continue; }   // `|&`: a pipe (stderr too)
    if (ch === '(' && /^[ \t]*\)/.test(s.slice(i + 1, i + 64)) && [1, 2].includes(afterOpeners(words).length) && (afterOpeners(words).length === 1 || afterOpeners(words)[0].v === 'function') && words.every((x) => !x.q) && /^[\w.:@+-]+$/.test(words[words.length - 1].v)) {
      const c = end();   // r7: `name ()` / `function name ()` — a definition: its body next (r12: after an opener too)
      if (c) c.words.def = true;
      list = out.length;
      i = s.indexOf(')', i) + 1;
      continue;
    }
    if (';&|()'.includes(ch)) {
      const two = (ch === '&' || ch === '|' || ch === ';') && s[i + 1] === ch;
      // r12: a `(` GLUED to a word is no subshell — a compound assignment `a=(…)` / `a+=(…)`, zsh's glob qualifier
      // `*(e:…:)` (it runs code), an extglob `@(…)`: only a compound assignment with no `[` in it is read on (its
      // elements as words); any other is a STOP (W4: `a=([i]=x)` evaluates i)
      if (ch === '(' && words.length && words[words.length - 1].end === i) {
        const g = words[words.length - 1];
        if (g.q || !/^[A-Za-z_][A-Za-z0-9_]*\+?=$/.test(g.v) || s.slice(i + 1, spanEnd(s, i, '(', ')')).includes('[')) stops.push(i);
      }
      const c = end();
      if (ch === ';' || ch === '&' || (two && ch === '|')) closeCoproc();   // r8: a coproc's list ends
      if (ch === '&' && !two) {   // `… &` — its whole and-or list to the background: r6 — ONE job of this shell, launched here
        // (zsh's `&!` / `&|` disown it at birth); r9: a LONE command's own `&` is the one job a reaper may end (`job.cmd`)
        const disowned = s[i + 1] === '!' || s[i + 1] === '|', job = { ended: false };
        launch(job, list);
        lone(c, disowned ? 'disowned' : 'job');
        if (c && c.words.lone === 'job') job.cmd = c;
        if (disowned) i++;
      } else if (ch === ';' && !two) lone(c, 'fg');
      if (two && ch !== ';') andOr = true;
      if (ch === '|' && !two) pipe = c;
      if (ch === ')') { const g = closeGroup(')'); if (g) list = g.outer; }
      else if (ch === '(') { groups.push({ close: ')', outer: list }); list = out.length; }
      else if (ch === ';' || (ch === '&' && !two)) list = out.length;
      redirect = false;
      cont = ch === '|' || (two && ch === '&');   // r12: `|`, `||`, `&&`
      i += two ? 2 : 1;
      continue;
    }
    if ((ch === '<' || ch === '>') && s[i + 1] === '(') {   // a process substitution: a command line of its own, an argument here
      const e = spanEnd(s, i + 1, '(', ')', true, span);
      nested(s.slice(i + 2, e), i);
      words.procsub = true;   // r9: bash sets `$!` to it — a stop
      if (redirect) redirect = false; else words.push({ v: ch + '()', at: i, end: e + 1, q: false });
      i = e + 1;
      continue;
    }
    if (ch === '<' && s[i + 1] === '<' && s[i + 2] === '<') {   // a here-string: the next word is its text
      i += 3;
      while (s[i] === ' ' || s[i] === '\t') i++;
      const w = readWord(i);
      i = w.end > i ? w.end : i + 1;
      (words.herestrings || (words.herestrings = [])).push(w.v);
      (words.expands || (words.expands = [])).push(s.slice(w.at, w.end).replace(/'[^']*'/g, "''"));   // r12: the shell expands it
      continue;
    }
    if (ch === '<' && s[i + 1] === '<') {   // a heredoc: its delimiter, its lines after this line
      const at = i;
      i += 2;
      const strip = s[i] === '-';
      if (strip) i++;
      while (s[i] === ' ' || s[i] === '\t') i++;
      const w = readWord(i);
      i = w.end;
      if (w.v) pending.push({ delim: w.v, strip, quoted: w.q, words, at });
      continue;
    }
    if (ch === '<' || ch === '>') { const o = i; i++; while ('<>&|'.includes(s[i] || '_')) i++; op = s.slice(o, i); redirect = true; continue; }
    const w = readWord(i);
    i = w.end > i ? w.end : i + 1;
    if (redirect) { redirect = false; w.op = op; (words.targets || (words.targets = [])).push(w); continue; }   // r9: a target, kept (r12: with its operator)
    if (/^\d+$/.test(w.v) && (s[i] === '<' || s[i] === '>')) continue;   // a file descriptor before a redirection
    if (!w.q && w.v === '{' && afterOpeners(words).length === 2 && afterOpeners(words)[0].v === 'function') end();   // r7: `function name {` (r12: after an opener)
    // r8: `coproc NAME { … }` — the name before a compound command is no command word
    const named = words.length === 2 && words[0].v === 'coproc' && !words[0].q && !words[1].q && /^[A-Za-z_][A-Za-z0-9_]*$/.test(words[1].v) && GROUP_OPEN.has(w.v);
    if (!w.q && (named || words.every((x) => OPENERS.has(x.v)))) {   // r4: a compound command's own words, where a command word stands
      if (w.v === 'coproc' && !coproc) coproc = { depth: groups.length, from: out.length };   // r8: its list is a job
      if (GROUP_OPEN.has(w.v)) { groups.push({ close: GROUP_OPEN.get(w.v), outer: list }); list = out.length; }   // r8: its own list (`x | { C & }` sends C alone)
      else if (GROUP_CLOSE.has(w.v)) { const g = closeGroup(w.v); if (g) list = g.outer; }
    }
    words.push(w);
  }
  lone(end(), 'fg');
  closeCoproc();   // r8: the line's coproc ends
  // r9: a line the reader cannot be sure of ends none of its jobs — nor a job of a span inside it
  if (!endJobs(mine, stops, out)) { out.unsure = true; for (const c of out) for (const j of c.words.jobs || []) j.ended = false; }
  if (i < s.length) out.blind.push(s.slice(i));   // the shell past SCAN_MAX — blind
  for (const h of pending) { (h.words.heredocs || (h.words.heredocs = [])).push(''); out.blind.push(''); }   // a heredoc with no line after it
  return out;
}

/** One simple command's COMMAND WORD — `{base, k}` (base = the word after its last `/`): leading assignments, openers
 *  (do / then / ! / { …) and wrappers with their options (env X=1, sudo -u x, timeout 60, xargs -n1, nohup, exec -a n,
 *  command, time -p, strace -f …) skipped; `lookup` for `command -v` / `-V` (it runs nothing); r4: `split` = the command
 *  line of `env -S '…'` / `--split-string=…` (its words follow it); null when there is none, or when the command is a
 *  construct whose words are data (`for c in …`). */
function commandWord(words) {
  let k = 0;
  while (k < words.length) {
    const v = words[k].v;
    if (ASSIGN_RE.test(v) || OPENERS.has(v)) { k += v === 'coproc' && words[k + 2] && GROUP_OPEN.has(words[k + 2].v) ? 2 : 1; continue; }   // r8: `coproc NAME { … }`
    if (DATA_HEADS.has(v)) return null;
    const base = v.slice(v.lastIndexOf('/') + 1);
    const opts = WRAPPERS.get(base);
    if (!opts) return { base, k };
    if (base === 'command' && words[k + 1] && /^-[vV]$/.test(words[k + 1].v)) return { base, k, lookup: true };
    k++;
    let positional = base === 'timeout' ? 1 : 0;
    while (k < words.length) {
      const o = words[k].v;
      if (o === '--') { k++; break; }
      if (base === 'env' && (ENV_SPLIT.includes(o) || /^(-S.|--split-string=)/.test(o))) {   // r4: its argument is a command line
        const glued = o.startsWith('--split-string=') ? o.slice(15) : o.startsWith('-S') && o.length > 2 ? o.slice(2) : null;
        return { base, k, split: glued !== null ? glued : words[k + 1] ? words[k + 1].v : '', rest: k + (glued !== null ? 1 : 2) };
      }
      if (o.length > 1 && o[0] === '-') { k += opts.includes(o) ? 2 : 1; continue; }
      if (positional) { positional--; k++; continue; }
      break;
    }
  }
  return null;
}

/** r6: the commands with which a line ENDS its own background jobs. */
const REAPERS = Object.freeze(['wait', 'kill']);
/** r9: `$!` as a reaper's operand */
const BANG = Object.freeze(['$!', '${!}']);
/** r9: the shell's own words a PLAIN stretch never holds — they may end the shell (`exit`, `return`, `exec`; `:` and the
 *  assignment builtins: a special builtin's error ends a POSIX shell, a read-only name ends zsh), run what the line cannot
 *  see (`eval`, `source`, `.`, `builtin`, `command`), touch the job table (`wait`, `kill`, `disown`, `fg`, `bg`, `jobs`,
 *  `coproc`, `suspend`) or the shell's options and meanings, or stand where a compound command's words do */
const SHELL_OWN = new Set(['.', ':', 'source', 'eval', 'exec', 'exit', 'return', 'logout', 'bye', 'set', 'setopt', 'unsetopt', 'shopt', 'emulate', 'trap',
  'disown', 'kill', 'wait', 'fg', 'bg', 'jobs', 'suspend', 'coproc', 'break', 'continue', 'alias', 'unalias', 'enable', 'disable', 'builtin', 'command',
  'functions', 'unfunction', 'autoload', 'zmodload', 'local', 'declare', 'typeset', 'export', 'readonly', 'integer', 'float', 'unset', 'shift', 'let',
  'time', 'noglob', 'nocorrect', '-', '[[', 'function', 'select']);
/** r9: the words that make a line UNSURE wherever they stand (a function's body too) — it sets the shell's options or
 *  traps (`set -e` / `-u` / `-o errexit` / zsh's `setopt err_exit`: any later command may end the shell), sources or
 *  evals text the line cannot read, or may change what `wait` / `kill` mean (`alias`, `enable`, `disable`, `builtin`);
 *  r10: or what a word runs (`hash`, `functions`, `autoload`, `zmodload`); r11: or does arithmetic (`let "$n=1"`), or
 *  writes names its own syntax gives (zsh's `zparseopts` specs, `zformat -f`, `zstyle -s`, `zregexparse`, `getln`;
 *  bash's `compgen -V`); r12: or evaluates text it is given — mapfile / readarray `-C` (a callback run every few lines:
 *  W6 `mapfile -C 'IFS=…'`), `complete -C` / `-F`, `bind -x`, `fc` (re-runs a command), zsh's `sched` */
const UNSURE = new Set(['set', 'setopt', 'unsetopt', 'shopt', 'emulate', 'trap', 'source', '.', 'eval', 'alias', 'enable', 'disable', 'builtin',
  'hash', 'functions', 'autoload', 'zmodload', 'let', 'zparseopts', 'zformat', 'zstyle', 'zregexparse', 'getln', 'compgen',
  'mapfile', 'readarray', 'complete', 'bind', 'fc', 'sched']);
/** r10: a word that EXPANDS NOTHING (r9's `quiet`, closed tighter): no `$` (a parameter, a span, arithmetic — `$(( 1/0 ))`
 *  ends both shells), no glob or pattern character (zsh ends the shell on a pattern that matches nothing — `*` `?` `[`,
 *  `#` / `^` / `~` under EXTENDED_GLOB, a `<1-9>` range), no brace expansion, no `~` and no leading `=` (zsh: an unknown
 *  user / command ends it), no quote or escape left in it */
const plainWord = (w) => !/[$*?[\]~#^{}<>()|&;!`\\"']/.test(w.v) && w.v[0] !== '=';
/** r10: THE NAMES THE SHELLS KEEP — a line that WRITES one (`x=…`, `x+=…`, `x[k]=…` as a word anywhere, an operand of
 *  WRITERS, `${x:=…}`) ends nothing: zsh 5.9's own parameters (every module loaded: `typeset` flags special / read-only /
 *  integer / float / tied) and bash 5.3's (`env -i bash -c 'compgen -v'`), with the ones both manuals name that are unset
 *  until set. Writing one may END the shell before a `wait` (zsh: `read status`, `printf -v status`, `print -v status` —
 *  read-only; `read UID` — it tries to change user; `SECONDS=1/0` — arithmetic; both: `UID=0`), set an option
 *  (`options[errexit]=on`), change what a word runs (`PATH`, `path`, `commands`, `aliases`, `functions`, `EXECIGNORE`) or
 *  how `$!` splits (`IFS=0123456789; C & wait $!` — bash's `wait` returns at once, the CLI outlives). A hook array
 *  (`chpwd_functions` …) too (`reserved`). */
const RESERVED = new Set(('_ ARGC BASH BASHOPTS BASHPID BASH_ALIASES BASH_ARGC BASH_ARGV BASH_ARGV0 BASH_CMDS BASH_COMMAND BASH_COMPAT BASH_ENV ' +
  'BASH_EXECUTION_STRING BASH_LINENO BASH_LOADABLES_PATH BASH_MONOSECONDS BASH_SOURCE BASH_SUBSHELL BASH_VERSINFO BASH_VERSION BASH_XTRACEFD CDPATH ' +
  'CHILD_MAX COLUMNS COMPREPLY COMP_WORDBREAKS COPROC CPUTYPE DIRSTACK DIRSTACKSIZE EGID ENV EPOCHREALTIME EPOCHSECONDS ERRNO EUID EXECIGNORE FCEDIT ' +
  'FIGNORE FPATH FUNCNAME FUNCNEST GID GLOBIGNORE GLOBSORT GROUPS HISTCHARS HISTCMD HISTCONTROL HISTFILE HISTFILESIZE HISTIGNORE HISTSIZE ' +
  'HISTTIMEFORMAT HOME HOST HOSTFILE HOSTNAME HOSTTYPE IFS IGNOREEOF INPUTRC KEYBOARD_HACK KEYTIMEOUT LANG LINENO LINES LISTMAX LOGCHECK LOGNAME ' +
  'MACHTYPE MAIL MAILCHECK MAILPATH MANPATH MAPFILE MATCH MBEGIN MEND MODULE_PATH NULLCMD OLDPWD OPTARG OPTERR OPTIND OSTYPE PATH PERIOD PIPESTATUS ' +
  'POSIXLY_CORRECT PPID PROMPT PROMPT2 PROMPT3 PROMPT4 PROMPT_COMMAND PROMPT_DIRTRIM PS0 PS1 PS2 PS3 PS4 PSVAR PWD RANDOM READNULLCMD REPLY ' +
  'REPORTTIME SAVEHIST SECONDS SHELL SHELLOPTS SHLVL SPROMPT SRANDOM TERM TIMEFMT TIMEFORMAT TMOUT TMPDIR TMPPREFIX TRY_BLOCK_ERROR ' +
  'TRY_BLOCK_INTERRUPT TTY TTYIDLE UID USERNAME VENDOR WATCH WORDCHARS ZCURSES_COLORS ZCURSES_COLOR_PAIRS ZDOTDIR ZFTP_SESSION ZFTP_TMOUT ' +
  'ZSH_ARGZERO ZSH_EVAL_CONTEXT ZSH_EXECUTION_STRING ZSH_NAME ZSH_PATCHLEVEL ZSH_SCRIPT ZSH_SUBSHELL ZSH_VERSION aliases argv auto_resume builtins ' +
  'cdpath commands dirstack dis_aliases dis_builtins dis_functions dis_functions_source dis_galiases dis_patchars dis_reswords dis_saliases ' +
  'epochtime errnos fignore fpath funcfiletrace funcsourcetrace funcstack functions functions_source functrace galiases histchars history ' +
  'historywords jobdirs jobstates jobtexts keymaps langinfo mailpath manpath mapfile match mbegin mend module_path modules nameddirs options ' +
  'parameters patchars path pipestatus prompt psvar reply reswords saliases signals status sysparams termcap terminfo userdirs usergroups watch ' +
  'widgets zcurses_attrs zcurses_colors zcurses_keycodes zcurses_windows zgdbm_tied zle_bracketed_paste zle_highlight zsh_eval_context ' +
  'zsh_scheduled_events').split(' '));
const reserved = (n) => RESERVED.has(n) || /_functions$/.test(n);
/** r10: the commands that DECLARE a name (after one, an assignment may meet a read-only or an integer name —
 *  `readonly x; … x=1` ends zsh) and the ones that WRITE the names they are given */
const DECLARE = new Set(['local', 'declare', 'typeset', 'export', 'readonly', 'integer', 'float', 'private']);
const WRITERS = new Set(['read', 'printf', 'print', 'getopts', 'vared', 'mapfile', 'readarray', ...DECLARE]);
/** r11: the option letters that take an ARGUMENT (bash's and zsh's) — attached to its letters (`read -aIFS`) the name
 *  it writes cannot be compared */
const WRITER_ARGS = { read: 'adinNptuk', mapfile: 'dnOsuCc', readarray: 'dnOsuCc', vared: 'Mmprif' };
/** r11: the loops whose head writes a NAME (`for IFS in 0123456789; do :; done` — bash splits `$!` on digits after it) */
const LOOPS = new Set(['for', 'select', 'foreach']);
/** r11: shell text as WRITTEN is a plain literal — no `$` or backtick outside single quotes; no escape, glob, brace or
 *  `~` outside quotes (a name made at run time — `read "$v"`, `declare "$v=…"` — cannot be compared) */
const literal = (t) => { const u = t.replace(/'[^']*'/g, ''); return !/[$`]/.test(u) && !/[*?[{~\\]/.test(u.replace(/"[^"]*"/g, '')); };
/** r11: does a command write only names the reader can SEE (each a plain literal, no RESERVED name) — WRITERS'
 *  operands (a declaration's: its name before the `=`), `printf -v` / `print -v`'s name, a loop's variable? false when
 *  a name cannot be known (the r10 verdict): an operand not a plain literal (`read "$v"`, `typeset -g "$n"=on`), an
 *  option with its argument attached (`printf -vIFS`, `print -v'options[errexit]'`, `read -aIFS`), a nameref
 *  (`declare -n r=IFS`), an option the reader cannot read (`printf "$f" …`), `wait -p NAME` (bash: the pid's digits) */
function writesKnown(c, cw) {
  const w = c.words, raw = (x) => c.src.slice(x.at, x.end), seen = (x) => literal(raw(x)) && !reserved(x.v.replace(/[[=?+][^]*$/, ''));
  const aName = (x) => !!x && seen(x) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(x.v);
  // `for NAME in …` / zsh `for a b (…)`: every name before `in` / `do` — r12: wherever the loop's word stands (after
  // `then`, `{`, `!`, `time`: W2 `then for IFS in 0123456789`), never words[0] only
  for (let h = 0; h < w.length; h++) {
    if (w[h].q || !LOOPS.has(w[h].v)) continue;
    for (let k = h + 1; k < w.length && !['in', 'do'].includes(w[k].v); k++) if (!aName(w[k])) return false;
  }
  if (!cw) return true;
  const ops = w.slice(cw.k + 1);
  if (cw.base === 'wait') return !ops.some((x) => /^-[a-zA-Z]*p/.test(x.v));
  if (!WRITERS.has(cw.base)) return true;
  if (cw.base === 'printf' || cw.base === 'print') {   // only `-v NAME` writes; the options end at the first operand
    for (let k = 0; k < ops.length; k++) {
      const x = ops[k];
      if (!literal(raw(x))) return false;   // it may expand to `-vIFS`
      if (x.v === '--' || x.v === '-' || x.v[0] !== '-') break;
      if (!x.v.includes('v')) continue;
      if (cw.base === 'printf' ? x.v !== '-v' : !/^-[a-zA-Z]*v$/.test(x.v)) return false;   // attached
      if (!aName(ops[++k])) return false;
    }
    return true;
  }
  const decl = DECLARE.has(cw.base), takes = WRITER_ARGS[cw.base] || '';
  for (const x of ops) {
    if (/^[-+]./.test(x.v) && literal(raw(x))) {   // an option
      if (!/^[-+][a-zA-Z]+$/.test(x.v) || (decl && x.v.includes('n')) || [...x.v.slice(1, -1)].some((ch) => takes.includes(ch))) return false;
      continue;
    }
    const r = raw(x), eq = decl ? r.indexOf('=') : -1;   // a name (an option's own argument too: compared as one)
    if (!literal(eq >= 0 ? r.slice(0, eq) : r) || reserved(x.v.replace(/[[=?+][^]*$/, ''))) return false;
  }
  return true;
}
/** r10: THE ALLOWLIST — the ONLY commands that may stand BETWEEN a lone job and its reaper: shell builtins (and `sleep`)
 *  that expand nothing and cannot end the shell, written as the bare word, every word `plainWord`, redirected (if at all)
 *  to /dev/null or a descriptor. [word, its operands, the shells' truth behind the row — test-channel-touch ⑬'s rows:
 *  bash · zsh · zsh in the agent tool's form, every one ENDED]. Anything else between — an external command
 *  (`python3 -c "…os.kill(os.getppid(), 9)"` ends its parent: x9-38 outlives in both shells), a reserved word
 *  (`repeat 1 exit`: x9-31, `time`), a builtin that writes a name (`read status`, `printf -v status`: x9-36, x9-39), a
 *  pattern (`echo a<1-9>b`: x9-32) — is a STOP. A comment or an empty line is no command at all (a9-01, a9-02).
 *  r11: a SPECIAL builtin (`:`) with any redirection is a STOP (SPECIAL). */
const BETWEEN = new Map([
  ['true', [() => true, 'r9: C & true ⏎ wait']],
  ['false', [() => true, 'A0 control: C & false; wait']],
  [':', [() => true, 'r10: C & : plain; wait · r11: never redirected (SPECIAL — v10a D1, rc10 RC2)']],
  ['echo', [() => true, 'r9: C & echo started; wait · a9-03 · r10: C & echo hi >&2; wait · C & echo hi > /dev/null; wait']],
  ['sleep', [(a) => a.length === 1 && /^\d+(\.\d+)?$/.test(a[0]), 'a9-05 C & sleep 1; wait · 39: C & sleep 1 & wait (a job between) · r10: C & sleep 0.1 & wait']],
  ['cd', [(a) => a.length === 1 && !/^[-+]/.test(a[0]), 'r9: C & cd /; wait · S2 C & cd /nonexistentzz; wait (cd fails, the shell goes on)']],
]);
/** r11: the POSIX SPECIAL builtins — an error in one ENDS a POSIX shell (dash is `sh` here): `sh -c 'C & : >&9; wait'`
 *  exits at the `:` (fd 9 not open) before its `wait` in every form (v10a D1, v10b D6 / D8 / D9, v10c D15, rc10 RC2);
 *  a regular builtin's failed redirection does not (`true >&9`, `false >&9`, `echo hi >&9`, `cd / >&9`, `x=1 >&9`:
 *  v10a D3, v10b D4 / D5, v10c D12 / D13 / D14 end) */
const SPECIAL = new Set(['.', ':', 'break', 'continue', 'eval', 'exec', 'exit', 'export', 'readonly', 'return', 'set', 'shift', 'times', 'trap', 'unset']);
/** r12: a redirection the reader can follow — /dev/null opened as a FILE (`>`, `>>`, `<`) or a DESCRIPTOR in the dup form
 *  (`>&N`, `<&N`, `N>&M`, `>&-`): `> 2` opens a FILE named 2 (W7: a directory named 2 — the redirection fails and the
 *  command never runs; `wait < 0` with no file 0), `&>` is `&` then `>` to dash (`wait &> f` sends the wait to the
 *  background), `<&/dev/null` is no descriptor */
const FILE_OPS = new Set(['>', '>>', '<']), DUP_OPS = new Set(['>&', '<&']);
const followed = (x, fds) => (FILE_OPS.has(x.op) && x.v === '/dev/null') || (DUP_OPS.has(x.op) && fds.test(x.v));
/** r10: …and an ASSIGNMENT-only command (`x=1 y=two`) of plain words to LOWER-case names the shells do not keep, in a
 *  line that declares nothing — 'r10: C & x=1; wait', 'r10: C & x=1 y=two; wait' (every upper-case name may be one of
 *  either shell's own: `UID=0` and `SECONDS=1/0` end zsh) */
const PLAIN_SET = /^([a-z_][a-z0-9_]*)=/;
/** r10: a word that WRITES a name — `x=…`, `x+=…`, `x[k]=…` — and a `${x:=…}` / `${x=…}` anywhere in a word */
const NAME_SET = /^([A-Za-z_][A-Za-z0-9_]*)(\[[^\]]*\])?\+?=/;
const SETS_IN_WORD = /\$\{(\([^)]*\))?[#!^=~+]*[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?:{0,2}=/;
/** r11: zsh's `(P)` flag — the name is another parameter's value (`: ${(P)n::=on}` sets `options[errexit]`) */
const INDIRECT = /\$\{\([^)]*P/;
/** r11: bash's `{NAME}>file` / `{NAME}<&0` — the redirection WRITES NAME (the descriptor's number, 10 and up): `true
 *  {IFS}>/dev/null; C & wait $!` outlives in bash (`wait $!` splits the pid on 1 and 0 and returns at once) */
const VARFD = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const varfd = (c, x) => { const m = !x.q && VARFD.exec(x.v); return !!m && /^[<>]/.test(String(c.src || '').slice(x.end)) && reserved(m[1]); };
/** r11: ARITHMETIC THE LINE CANNOT READ — bash evaluates arithmetic (an assignment in it writes any name: IFS) beyond
 *  `(( ))` / `$(( ))` / `let` (r10): the legacy `$[ … ]`, a SUBSCRIPT (`a[i]=x`, `${a[i]}`, an operand `read 'a[i]'`,
 *  `unset 'a[i]'`, `[[ -v a[i] ]]`), a `${x:offset:length}`, the operands of `[[ … -eq … ]]`, an assignment to a name
 *  declared integer (`declare -i`, `integer`, `float`) — and it evaluates AGAIN the value of a variable named there
 *  (`i='IFS=1234567890'; a[i]=x`). So any such place holding more than an integer literal (`@` / `*` for a subscript)
 *  makes the line end nothing (r11 A rows: `echo $[IFS=…]`, `a[IFS=…]=x`, `${x:IFS=…}`, `declare -i n; n=IFS=…`,
 *  `i=IFS=…; [[ i -eq 0 ]]` … — `wait $!` splits the pid and returns at once in bash). So does an expansion that
 *  EVALUATES a value: bash's `${x@P}` (r11 E: `x='$((IFS=…))'`), zsh's `(e)` flag; r12: an INDIRECTION `${!x}` (W5: x='a[IFS=…]'
 *  — the name's subscript is evaluated; `${!}` is `$!`), bash 5.3's `${ …; }` / `${| …; }` (its commands run in the
 *  shell itself), a compound assignment's subscript (`a=([i]=x)`: the scan's glued `(`), and the same places in the
 *  text a builtin expands in the shell itself — an unquoted heredoc's body, a here-string (`: <<EOF⏎$((IFS=…))⏎EOF`,
 *  `read y <<< "${!x}"`). */
const SUB_EXP = /\$\{[#!]?[A-Za-z_][A-Za-z0-9_]*\[(?!\s*(-?\d+|@|\*)\s*\])/;
const SUB_NAME = /^[A-Za-z_][A-Za-z0-9_]*\[(?!\s*(-?\d+|@|\*)\s*\])/;
const SUBSTR = /\$\{[#!]?([A-Za-z_][A-Za-z0-9_]*|[0-9@*])(\[[^\]]*\])?:(?![-=?+])(?!\s*-?\d+\s*(:\s*-?\d+\s*)?\})/;
const EVALS = /\$\[|\$\{[^}]*@P\}|\$\{\([^)]*e[^)]*\)|\$\{!(?!\})|\$\{[\s|]/;
/** r12: bash 5.3's function substitution — `${ cmd; }` / `${| cmd; }` (a blank, a newline or `|` after the brace) */
const FUNSUB = /[ \t\n|]/;
const ARITH_OPS = new Set(['-eq', '-ne', '-lt', '-le', '-gt', '-ge']);
const INDEXED = new Set(['unset', 'test', '[', '[[', 'wait', 'getopts', 'vared']);
function arithmetic(c, cw) {
  const w = c.words, raw = (x) => String(c.src || '').slice(x.at, x.end).replace(/'[^']*'/g, "''");
  if ([...w, ...(w.targets || [])].some((x) => { const r = raw(x); return SUB_EXP.test(r) || SUBSTR.test(r) || EVALS.test(r) || /\$\(\(/.test(r); })) return true;   // r12: `$((` inside a `${…}` too
  if ((w.expands || []).some((t) => /\$\(\(/.test(t) || SUB_EXP.test(t) || SUBSTR.test(t) || EVALS.test(t) || SETS_IN_WORD.test(t) || INDIRECT.test(t))) return true;   // r12
  if (w.some((x) => SUB_NAME.test(x.v) && /\]\+?=/.test(x.v))) return true;   // `a[i]=x` (an assignment word — commandWord reads it as a command)
  const cond = w.findIndex((x) => !x.q && x.v === '[[');   // r12: wherever it stands (`if [[ i -eq 0 ]]`, `! [[ …`: W3)
  if (cond >= 0) {
    if (w.slice(cond + 1).some((x) => SUB_NAME.test(x.v))) return true;
    for (let k = cond + 1; k < w.length - 1; k++) if (ARITH_OPS.has(w[k].v) && !(/^-?\d+$/.test(w[k - 1].v) && /^-?\d+$/.test(w[k + 1].v))) return true;
  }
  if (cw && (WRITERS.has(cw.base) || INDEXED.has(cw.base)) && w.slice(cw.k + 1).some((x) => SUB_NAME.test(x.v))) return true;
  if (cw && (cw.base === 'integer' || cw.base === 'float' || (DECLARE.has(cw.base) && w.slice(cw.k + 1).some((x) => /^[-+][a-zA-Z]*[iEF]/.test(x.v))))) return true;
  return false;
}
/** r9: THE JOBS A LINE ENDS ITSELF — STOP READING THE SHELL: a line ENDS a job only in the PLAINEST shape; everything
 *  else LINGERS (unsure ⇒ it lingers — r6, r7 and r8 each read more of the shell and each added a regression the next
 *  round found; the question «does the CLI's job outlive its call?» needs no shell interpreter). A job ends only when
 *  ALL hold:
 *  - THE JOB is a LONE command at the line's top level (`words.lone` 'job': the only command of its list — no `&&` /
 *    `||`, no pipe — outside every group, branch, loop, subshell and function body) sent to the background by its own
 *    single `&` (never zsh's `&!` / `&|`), with nothing but assignments before its command word (no wrapper, no `!`,
 *    no `coproc`), its command word no SHELL_OWN word, no process substitution;
 *  - THE REAPER is a later LONE foreground `wait` (no operand — every such job before it) or `wait $!` / `kill $!` /
 *    `kill -TERM $!` (the latest job, only while no other `&` came after it), nothing before its word, its
 *    redirections to /dev/null, 0–2 or a close only (r11: a dup of a descriptor that is not open fails — the reaper
 *    never runs: `wait 2>&3`); r10: a `kill` reaches the job's own process only — it ends the job only when that
 *    process IS the CLI (`./read-all.sh &`, `python3 x.py &`, `node poll.js &` … `kill $!` leaves the CLI they started
 *    running: K1–K5; r11: the CLI by its BARE name — `./wrap/vibespace-channels` may be a script that runs it); a
 *    `wait` waits for the whole job;
 *  - BETWEEN them stand only rows of the allowlist (BETWEEN, PLAIN_SET; r11: a SPECIAL builtin never redirected) and
 *    other jobs whose command is the CLI or a row of the allowlist (`safe`). Anything else is a STOP: no job launched
 *    before it ends after it;
 *  - THE LINE is not UNSURE: no UNSURE word anywhere in it; r11: EVERY lone job of the line is `safe` — a job with any
 *    other command (it may end the shell: `sh -c 'sleep 0.2; kill -9 $PPID' &`) taints the whole call, past every STOP
 *    (r10 forgot it at the next one: `KS & echo $HOME; C & wait`); r10: no function definition (zsh's
 *    `TRAPCHLD() { exit; }` ends the shell when a child ends; a definition may shadow a word of the allowlist), no
 *    arithmetic (`(( … ))`, `$(( … ))` may assign), no write of a RESERVED name nor of a name it cannot see
 *    (`writesKnown`), nothing sent to the background but its LONE top-level jobs (a
 *    list, a pipeline, a group, a subshell, a function's or a span's own job, a coproc, a disowned job may outlive every
 *    reaper and end the shell while the CLI runs: `( sleep 1; kill $$ ) &`), and nothing but `safe` commands in the
 *    spans and heredoc substitutions of its jobs (`C "$(sleep 1; kill $$)" &`) — such a line ends nothing (endJobs
 *    returns false; shellCommands then ends no job of a span inside it either).
 *  `all` = every command of the line (its spans' too). Marks `job.ended` = 'wait' | 'kill' (commandsRun: a `kill` reaches
 *  the job's own command only). PURE. */
function endJobs(cmds, stops = [], all = cmds) {
  if (stops.length) return false;
  let declares = false;
  for (const c of cmds) {
    const w = c.words, cw = commandWord(w), ws = [...w, ...(w.targets || [])];
    if (w.def || w.some((x, k) => k < w.length - 1 && !x.q && x.v === 'function')) return false;   // r10: a definition (r12: after an opener too)
    if (cw && UNSURE.has(cw.base)) return false;
    if (ws.some((x) => x.v.includes('$(())') || SETS_IN_WORD.test(x.v) || INDIRECT.test(x.v) || varfd(c, x) || ((m) => !!m && reserved(m[1]))(NAME_SET.exec(x.v)))) return false;
    if (!writesKnown(c, cw)) return false;   // r11: a name it cannot see, or one the shells keep
    if (arithmetic(c, cw)) return false;   // r11: arithmetic or an evaluation it cannot read
    if (cw && DECLARE.has(cw.base)) declares = true;
  }
  // r10: the zsh range `<1-9>` / `<->` — the scan reads it as redirections (`echo a<1-9>b`: a target `1-9`)
  const ranges = (c) => { const ws = [...c.words, ...(c.words.targets || [])]; return /<\d*-/.test(c.src.slice(Math.min(...ws.map((x) => x.at)), Math.max(...ws.map((x) => x.end)))); };
  const clean = (c) => !c.words.heredocs && !c.words.herestrings && !c.words.procsub && !ranges(c);
  // a STEP of the allowlist: a row's bare word with plain operands, or plain assignments
  const step = (c, cw) => {
    if (!clean(c) || !c.words.every(plainWord) || !(c.words.targets || []).every((x) => followed(x, /^\d+$/))) return false;   // r12: `followed`
    if (!cw) return !declares && c.words.every((x) => { const m = PLAIN_SET.exec(x.v); return !!m && !reserved(m[1]); });
    const row = BETWEEN.get(c.words[0].v);
    if (SPECIAL.has(c.words[0].v) && (c.words.targets || []).length) return false;   // r11: dash exits at `: >&9`
    return cw.k === 0 && !!row && row[0](c.words.slice(1).map((x) => x.v));
  };
  const runs = (c, cw) => !!cw && cw.split === undefined && !SHELL_OWN.has(cw.base) && !c.words.procsub;
  const lone = cmds.filter((c) => c.words.lone === 'job'), tops = new Set(lone.map((c) => c.words.jobs[c.words.jobs.length - 1]));
  // `safe` — what may run BESIDE a job and leave its reaping sure: the CLI itself (r11: by its BARE name) or a row of the
  // allowlist
  const bare = (c, cw) => !!cw && cw.base === CLI && c.words[cw.k].v === CLI;
  const safe = (c, cw) => !!cw && ((bare(c, cw) && c.words.slice(0, cw.k).every((x) => ASSIGN_RE.test(x.v))) || step(c, cw));
  // r11: a lone job that is not `safe` may end the shell while any later job runs — the WHOLE line ends nothing
  for (const c of lone) if (!safe(c, commandWord(c.words))) return false;
  // r10: a background the line cannot follow — a job that is no lone top-level one, or a command that runs beside the line
  // inside a lone job (a span of its words, its heredoc's substitutions: `C "$(sleep 1; kill $$)" &`) and is not `safe`
  for (const c of all) if (c.words.bg && (!(c.words.jobs || []).every((j) => tops.has(j)) || (!lone.includes(c) && !safe(c, commandWord(c.words))))) return false;
  let open = [], last = null;
  for (const c of cmds) {
    const cw = commandWord(c.words), how = c.words.lone;
    if (how === 'job' && runs(c, cw) && c.words.slice(0, cw.k).every((x) => ASSIGN_RE.test(x.v))) {
      last = { job: c.words.jobs[c.words.jobs.length - 1], cli: bare(c, cw) };
      open.push(last);
      continue;
    }
    if (how === 'fg' && step(c, cw)) continue;   // a step of the allowlist: nothing changes
    if (how === 'fg' && cw && cw.k === 0 && REAPERS.includes(cw.base) && clean(c) && (c.words.targets || []).every((x) => followed(x, /^([0-2]|-)$/))) {
      const args = c.words.slice(cw.k + 1).map((x) => x.v);
      if (cw.base === 'wait' && !args.length) { for (const o of open) o.job.ended = 'wait'; open = []; continue; }
      const by = (args.length === 1 || (cw.base === 'kill' && args.length === 2 && args[0] === '-TERM')) && BANG.includes(args[args.length - 1]);
      if (by && last && open.includes(last) && (cw.base === 'wait' || last.cli)) { last.job.ended = cw.base; open = open.filter((o) => o !== last); continue; }
    }
    open = []; last = null;   // a STOP
  }
  return true;
}

/** r3: THE SCRIPTS A SHELL COMMAND WORD RUNS — the shell IS these, never a command of its own: its `-c` string (an
 *  UNQUOTED operand with words after it is a re-joined argv — codex's `["bash","-lc","…"]` joined with no quoting — so the
 *  rest of the line is the script, `joined`), its heredocs and here-strings, or the stdin a pipe feeds it (`cat <<EOF |
 *  bash`, `echo '…' | sh`). null when it runs a script FILE (`bash run.sh`) or a stdin it cannot see — it could run
 *  anything, unread. `[{text, at, joined, sure}]` — r9: `sure` = the shell runs the script AS WRITTEN with no option
 *  but `-c` / `-l` (a `-e`, `-u`, `-o …` may end it early): a `-c` string with no `$` or wholly in single quotes, a
 *  re-joined argv (a `"…$X…"` string, a heredoc, a here-string, a pipe is expanded by the line first). */
function shellScripts(c, words, k) {
  let cflag = false, sflag = false, plain = true, j = k + 1;
  for (; j < words.length; j++) {
    const o = words[j].v;
    if (o === '-o' || o === '+o' || o === '-O' || o === '+O') { plain = false; j++; continue; }
    if (o === '--') { j++; break; }
    if (o.length > 1 && (o[0] === '-' || o[0] === '+')) { if (!/^-[lc]+$/.test(o)) plain = false; if (o[0] === '-' && o[1] !== '-') { if (o.includes('c')) cflag = true; if (o.includes('s')) sflag = true; } continue; }
    break;
  }
  if (cflag) {
    if (j >= words.length) return [];
    const op = words[j];
    if (!op.q && j + 1 < words.length && c.src) return [{ text: c.src.slice(op.at, words[words.length - 1].end), at: op.at, joined: true, sure: plain }];
    return [{ text: op.v, at: op.at, joined: false, sure: plain && (!op.v.includes('$') || (!!c.src && /^'[^']*'$/.test(c.src.slice(op.at, op.end)))) }];
  }
  const out = [];
  for (const body of (c.words === words && words.heredocs) || []) out.push({ text: body });
  for (const h of (c.words === words && words.herestrings) || []) out.push({ text: h });
  if (j < words.length && !sflag) return null;   // a script file
  if (c.words === words && c.pipeFrom) {   // a pipe feeds it: what the command before it writes
    const p = c.pipeFrom, pw = commandWord(p.words);
    for (const body of p.words.heredocs || []) out.push({ text: body });
    for (const h of p.words.herestrings || []) out.push({ text: h });
    if (pw && (pw.base === 'echo' || pw.base === 'printf')) out.push({ text: p.words.slice(pw.k + 1).filter((w) => !/^-[a-zA-Z]+$/.test(w.v)).map((w) => w.v).join(pw.base === 'echo' ? ' ' : '') });
  }
  return out.length ? out : null;
}

/** Every simple command a command line RUNS — its own, its `$( … )` / `<( … )` spans, a shell's `-c` string / heredoc /
 *  here-string / piped script (r3: the shell is its script, never a command of its own), a script runner's script (eval /
 *  watch / parallel), a `find -exec`'s command, r4: `env -S`'s command line (each nested one owned by the word that runs
 *  it): `[{base, at, verb, bg?, ended?, lookup?, execs?}]` (`execs`: a file tool's form that runs a program, RUNS_A_COMMAND;
 *  r6: `ended` — a background run whose job the line ends itself, endJobs — r9: a `wait` ends every run of the job, a
 *  `kill` the job's own command only; r8: `query` — the channels CLI's `search` words, its first operand) + `blind`
 *  (text the scan could not read: a cut-off tail, an unclosed heredoc). PURE. */
function commandsRun(cmd, owner = null, depth = 0, offset = 0) {
  const cmds = shellCommands(cmd, owner, depth, offset);
  const out = [];
  out.blind = cmds.blind.slice();
  // r6: a run of a background job (`bg`) carries `ended` when the line ends that job itself (endJobs) — r7: inside a
  // command sent to the background, a run its own shell sent to the background ends only when that shell ended it too
  // (`bash -c 'cli &' & wait` leaves the CLI running) — r9: never in a script the line does not pass as written (a
  // shell's `sure`; `env -S`, a runner's words) nor in an UNSURE line
  const add = (list, bg, ended, sure = false) => {
    for (const { ended: e0, ...x } of list) { const e = e0 && sure && !cmds.unsure; out.push(bg ? { ...x, bg: true, ...(ended && (!x.bg || e) ? { ended: true } : {}) } : { ...x, ...(e ? { ended: true } : {}) }); }
    for (const b of list.blind) out.blind.push(b);
  };
  const run = (c, words, cw, at, bg, ended, waited) => {
    if (cw.lookup) { out.push({ base: cw.base, at, verb: '', lookup: true }); return; }
    if (cw.split !== undefined && depth < 4) { add(commandsRun([cw.split, ...words.slice(cw.rest).map((w) => w.v)].join(' '), at, depth + 1), bg, waited); return; }
    if (SHELLS.has(cw.base) && depth < 4) {
      const scripts = shellScripts(c, words, cw.k);
      if (scripts) { for (const sc of scripts) add(sc.joined && c.owner === null ? commandsRun(sc.text, null, depth + 1, offset + sc.at) : commandsRun(sc.text, at, depth + 1), bg, waited, sc.sure); return; }
    }
    // r13: `trap ACTION SIG …` — its action is a script the shell runs later (at EXIT, on a signal): its commands are read
    // (`trap 'C &' EXIT` leaves C running — every shell), never ended by the line; one operand is a signal (bash: usage);
    // so is mapfile / readarray's `-C CALLBACK` (bash runs it every quantum lines)
    if (cw.base === 'trap' && depth < 4) {
      const j = words[cw.k + 1] && words[cw.k + 1].v === '--' ? cw.k + 2 : cw.k + 1;
      if (j + 1 < words.length && !words[j].v.startsWith('-')) add(commandsRun(words[j].v, at, depth + 1), bg, false);
    }
    if ((cw.base === 'mapfile' || cw.base === 'readarray') && depth < 4) {
      for (let j = cw.k + 1; j < words.length && words[j].v.length > 1 && words[j].v[0] === '-' && words[j].v !== '--'; j++) {
        const o = words[j].v, k = [...o.slice(1)].findIndex((x) => 'dnOsuCc'.includes(x)) + 1;
        if (!k) continue;
        const arg = o.length > k + 1 ? o.slice(k + 1) : words[++j] ? words[j].v : '';
        if (o[k] === 'C' && arg) add(commandsRun(arg, at, depth + 1), bg, false);
      }
    }
    const runner = SCRIPT_RUNNERS.get(cw.base);
    if (runner && depth < 4) {
      let j = cw.k + 1;
      while (j < words.length && words[j].v.length > 1 && words[j].v[0] === '-') j += runner.includes(words[j].v) ? 2 : 1;
      let e = j;
      while (e < words.length && !(cw.base === 'parallel' && /^:::/.test(words[e].v))) e++;
      if (e > j) { add(commandsRun(words.slice(j, e).map((w) => w.v).join(' '), at, depth + 1), bg, waited); return; }
    }
    const execs = RUNS_A_COMMAND.has(cw.base) && RUNS_A_COMMAND.get(cw.base)(words.slice(cw.k + 1).map((w) => w.v));
    const verb = words[cw.k + 1] ? words[cw.k + 1].v : '', query = cw.base === CLI && verb === 'search' ? searchWords(words, cw.k + 2) : undefined;
    out.push({ base: cw.base, at, verb, ...(query !== undefined ? { query } : {}), ...(bg ? { bg: true } : {}), ...(bg && ended ? { ended: true } : {}), ...(execs ? { execs: true } : {}) });
    if (cw.base === 'find') {
      for (let j = cw.k + 1; j < words.length; j++) {
        if (!FIND_RUNS.has(words[j].v)) continue;
        let e = j + 1;
        while (e < words.length && words[e].v !== ';' && words[e].v !== '+') e++;
        const sub = words.slice(j + 1, e), scw = commandWord(sub);
        if (scw) run(c, sub, scw, c.owner === null ? offset + sub[scw.k].at : c.owner, bg, waited, waited);
        j = e;
      }
    }
  };
  for (const c of cmds) {
    const cw = commandWord(c.words), js = c.words.jobs || [];
    // r9: a `wait` ends every run of its job; a `kill` reaches the job's own command only (a span's run, a shell's or a
    // runner's script, a find -exec may outlive the pid it signals)
    const ended = js.length > 0 && js.every((j) => j.ended === 'wait' || (j.ended === 'kill' && j.cmd === c)), waited = js.length > 0 && js.every((j) => j.ended === 'wait');
    if (cw) run(c, c.words, cw, c.owner === null ? offset + c.words[cw.k].at : c.owner, !!c.words.bg, ended, waited);
  }
  return out;
}

/** r8: the WORDS a `vibespace-channels search` ran with — its first operand (the CLI takes ONE: `search "two words"
 *  [--account <id>] [--limit N] [--full]`), quotes removed; undefined when there is none. */
const SEARCH_VALUED = Object.freeze(['--account', '--limit']);
function searchWords(words, k) {
  for (; k < words.length; k++) {
    const v = words[k].v;
    if (SEARCH_VALUED.includes(v)) { k++; continue; }
    if (!words[k].q && v.startsWith('--')) continue;
    return v;
  }
  return undefined;
}

/** The CLI's runs in a commandsRun result — its COMMAND WORDS only (r4: its name in blind text is never a run — the
 *  blind text makes the call «could run», rung ②, never rung ①); r8: a search's `query` rides along. */
function cliRuns(ran) { return ran.filter((x) => x.base === CLI).map(({ at, verb, query }) => ({ at, verb, ...(query !== undefined ? { query } : {}) })); }

/** lane touch-chip-cause r2: WHERE A COMMAND LINE RUNS THE CHANNELS CLI — `[{at, verb}]`, the CLI as a COMMAND WORD
 *  (the line's start, after ; && || | ( `$(` `<(` a newline, then / do, after a wrapper — env X=… / sudo … / exec -a n /
 *  timeout N / xargs … / command / time -p / strace …; inside a shell's script, eval / watch / parallel's, a find -exec;
 *  quotes removed, a path before the name kept): `at` = the index of the word that runs it (for a quoted `bash -c` string,
 *  the shell's word; a re-joined argv's script, its own word), `verb` = its first argument. The name inside a quoted
 *  argument (`--reason "… vibespace-channels read …"`, `$'…'`), a comment, a quoted heredoc's data or another command's
 *  argument (`grep vibespace-channels`) is prose; r4: so is the name in BLIND text (past SCAN_MAX, an unclosed heredoc) —
 *  that text makes the call «could run», never a run. PURE. */
function channelsRuns(cmd) { return cliRuns(commandsRun(cmd)); }

module.exports = {
  CLI, SHELLS, OPENERS, DATA_HEADS, WRAPPERS, SCRIPT_RUNNERS, FIND_RUNS, ENV_SPLIT, SCAN_MAX, GROUP_OPEN, GROUP_CLOSE, RUNS_A_COMMAND, REAPERS, SHELL_OWN, UNSURE,
  RESERVED, BETWEEN, SPECIAL, spanEnd, shellCommands, commandWord, endJobs, shellScripts, commandsRun, cliRuns, channelsRuns, searchWords,
};
