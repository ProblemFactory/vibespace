/**
 * THE SHELL'S WORDS — PURE (imports nothing; CJS so the server's channel witness, the bundle and the client's run summary
 * share ONE reading). Enough of the shell grammar to tell a COMMAND WORD from prose: `shellCommands` (the simple commands
 * of a command line), `commandWord`, `shellScripts` (a shell IS its script), `commandsRun` (every command a line runs —
 * its spans, a shell's script, a script runner's, a find -exec's, `env -S`'s), `cliRuns` / `channelsRuns` (where the
 * channels CLI is a command word). Bounded: SCAN_MAX characters of shell, nesting 4; what it cannot read is `blind`.
 * r6: `endJobs` — which of a line's background jobs the line ENDS itself (a foreground `wait` / `kill` of the job's pid).
 * r7: a job sent to the background is a shell of its own (the jobs it launches are its orphans), a disowned job is never
 * waited for, a function's body runs only where it is called.
 * r8: UNSURE ⇒ IT LINGERS — `ended` is said only where every shell the agent may run (bash, zsh) surely ended the job:
 * a function's body ends only its own earlier jobs, a pipeline element / a branch / a coproc is read the safe way.
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
/** r8: the words that start a BRANCH of a group whose words run on a condition (or once per pass) — a reaper there runs
 *  only when that branch does */
const BRANCHES = new Set(['then', 'else', 'elif', 'do']);
const COND_CLOSE = new Set(['fi', 'done', 'esac']);
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
  while (i < s.length && !' \t\r\n;&|()<>'.includes(s[i])) {
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
 *  `owner` = the word holding it); `(( … ))` / `$(( … ))` is arithmetic, no command; a heredoc's lines are kept on the
 *  command that reads them (`words.heredocs`; an UNQUOTED heredoc's `$( … )` runs — scanned), a here-string on
 *  `words.herestrings`; a # comment (at a word's start) and a redirection's target are no words; r4: a single `&` sends
 *  its whole AND-OR LIST to the background, as bash does — every command of `a | b &`, `cd x && ./run.sh &` and of a
 *  compound command (`( … ) &`, `{ …; } &`, `for … done &`, `if … fi &`) is `bg`.
 *  r6: each single `&` makes ONE JOB of this shell (`words.job` = `{at, scope, ended}`, the outermost `&` wins; a `( … )`
 *  subshell is a scope of its own, `words.scope`); a command after `&&` / `||` carries `words.andOr`; endJobs marks the
 *  jobs the line ends itself. r7: a single `&` makes its list a SHELL OF ITS OWN — the list's commands and the jobs they
 *  launched move to that shell's scope (`words.jobs` = every job around a command, innermost first: a run ends only when
 *  each did); zsh `&!` / `&|` disown the job at birth; a FUNCTION's body (`name () { … }`, `function name { … }`) carries
 *  `words.fn` — its words run where the function is called, never where it is defined. r8: each element of a pipeline
 *  (`a | b`) is a shell of its own too (its jobs are that shell's); `words.frame` = where the BRANCH a command runs in
 *  began (`then` / `else` / `elif` / `do`, a case pattern, a group after `&&` / `||`; -1: whenever the line runs),
 *  `words.loop` / `words.loopAt` = it runs once per pass of a loop; `coproc …` is a job of this shell (never waited for).
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
  // r6: `scope` = the `( … )` subshell open here (0: the line's own shell); `jobs` = this shell's background jobs, ONE per
  // single `&` ({at, scope, ended}); `mine` = this shell's own commands (a span's are its own shell's); `andOr` = the next
  // command runs on a condition (after `&&` / `||`); `span.docs` = the heredoc bodies read inside `$( … )` spans
  // r7: `fn` = a function definition's name read, its `{` body not yet open ({name}: one per definition)
  // r8: `elem` = the first command of the PIPELINE ELEMENT being read, `piping` = a `|` came before it (it ends as a shell
  // of its own); `coproc` = a `coproc` read, its list not ended yet ({depth, from}); `arith` = the names arithmetic touches
  let words = [], pending = [], redirect = false, pipe = null, skipped = 0, list = 0, andOr = false, scope = 0, scopes = 0, fn = null, elem = 0, piping = false, coproc = null;
  const groups = [], jobs = [], mine = [], span = { docs: 0 }, arith = new Set();
  const names = (text) => { for (const m of String(text).matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) arith.add(m[0]); };
  const end = () => {
    const c = words.length ? { words, owner, src: s, pipeFrom: pipe } : null;
    if (c) {
      out.push(c); mine.push(c); words.scope = scope; words.andOr = andOr; andOr = false;
      words.frame = frame();   // r8: where its branch began
      const loop = groups.filter((g) => g.close === 'done').pop();
      if (loop) { words.loopAt = loop.at; if (loop.scope === scope) words.loop = true; }   // r8: once per pass
      const body = groups.filter((g) => g.fn).pop();
      if (body) words.fn = body.fn;
      else if (words.length === 2 && words[0].v === 'function' && !words[0].q && !words[1].q) fn = { name: words[1].v };   // `function name` — its body next
    }
    words = []; pipe = null;
    return c;
  };
  // the group a closer ends — `)` only the innermost `(` (a `case` pattern's `)` closes nothing); a word, its own opener
  const closeGroup = (close, at) => {
    const k = close === ')' ? (groups.length && groups[groups.length - 1].close === ')' ? groups.length - 1 : -1) : groups.map((g) => g.close).lastIndexOf(close);
    if (k < 0) return null;
    isolate(); closeCoproc(at);   // r8: the group's last pipeline element and a coproc inside it end here
    const g = groups[k];
    groups.length = k;
    scope = g.scope; elem = g.elem; piping = g.piping;
    if (coproc && coproc.depth > groups.length) coproc = null;
    return g;
  };
  // r8: where the BRANCH a command runs in began — the innermost open group whose words run on a condition (or once per
  // pass): its `then` / `else` / `elif` / `do`, its case pattern, its opening after `&&` / `||`; -1 = whenever the line runs
  const frame = () => { for (let k = groups.length - 1; k >= 0; k--) if (groups[k].seg !== undefined) return groups[k].seg; return -1; };
  // r6/r7: ONE JOB of this shell (`job.at` = where it is launched): its list's commands from `from` — and the jobs they
  // launched — run in the job's OWN shell (a `wait` outside ends the job's own pid, never an orphan inside it)
  const launch = (job, from) => {
    const sub = ++scopes, body = groups.filter((g) => g.fn).pop();
    if (body) job.fn = body.fn;   // launched where its function is called
    if (groups.some((g) => g.close === 'done' && g.scope === scope)) job.many = true;   // inside a loop: a job per pass
    jobs.push(job);
    for (let k = from; k < out.length; k++) {
      const w = out[k].words;
      if (w.scope === scope) w.scope = sub;
      if (w.job && w.job.scope === scope) w.job.scope = sub;
      w.bg = true; w.job = job; w.jobs = [...(w.jobs || []), job];
    }
  };
  // r8: a PIPELINE ELEMENT ends — every element of `a | b` runs in a shell of its own (bash: each; zsh: all but the last
  // — unsure ⇒ each): its commands, and the jobs they launched, move there (a `wait` after the pipeline ends none of them)
  const isolate = (force = false) => {
    if (piping || force) {
      const sub = ++scopes;
      for (let k = elem; k < out.length; k++) { const w = out[k].words; if (w.scope === scope) w.scope = sub; if (w.job && w.job.scope === scope) w.job.scope = sub; }
    }
    piping = false; elem = out.length;
  };
  // r8: `coproc …` — its command is a JOB of this shell (bash and zsh set `$!` to it), launched where its list ends; read
  // as never waited for (a `wait` may end it — unsure ⇒ it lingers)
  const closeCoproc = (at) => { if (coproc && groups.length === coproc.depth) { launch({ at, scope, ended: false, disowned: true, coproc: true }, coproc.from); coproc = null; } };
  const nested = (body, at) => { const r = shellCommands(body, owner === null ? offset + at : owner, depth + 1); for (const c of r) out.push(c); for (const b of r.blind) out.blind.push(b); };
  // the command substitutions an UNQUOTED heredoc's body runs (`$( … )`, backticks — never `$(( … ))` arithmetic)
  const substitutions = (body, at) => {
    for (let j = 0; j < body.length; j++) {
      if (body[j] === '\\') { j++; continue; }
      if (body[j] === '$' && body[j + 1] === '(' && body[j + 2] !== '(') { const e = spanEnd(body, j + 1, '(', ')'); nested(body.slice(j + 2, e), at); j = e; continue; }
      if (body[j] === '`') { const e = spanEnd(body, j, '`', '`'); nested(body.slice(j + 1, e), at); j = e; }
    }
  };
  const readWord = (i) => {
    let v = '', q = false;
    const at = i;
    while (i < s.length) {
      const ch = s[i];
      if (' \t\r\n;&|()<>'.includes(ch)) break;
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
          if (s[j] === '$' && s[j + 1] === '(' && s[j + 2] === '(') { const e = spanEnd(s, j + 1, '(', ')', false); names(s.slice(j, e)); j = e; v += '$(())'; continue; }
          if (s[j] === '$' && s[j + 1] === '(') { const e = spanEnd(s, j + 1, '(', ')', true, span); nested(s.slice(j + 2, e), at); v += '$()'; j = e; continue; }
          if (s[j] === '`') { const e = spanEnd(s, j, '`', '`'); nested(s.slice(j + 1, e), at); v += '$()'; j = e; continue; }
          v += s[j];
        }
        i = j + 1; q = true;
        continue;
      }
      if (ch === '$' && s[i + 1] === '(' && s[i + 2] === '(') { const e = spanEnd(s, i + 1, '(', ')', false); names(s.slice(i, e)); v += '$(())'; i = e + 1; continue; }
      if (ch === '$' && s[i + 1] === '(') { const e = spanEnd(s, i + 1, '(', ')', true, span); nested(s.slice(i + 2, e), at); v += '$()'; i = e + 1; continue; }
      if (ch === '$' && s[i + 1] === '{') { const e = spanEnd(s, i + 1, '{', '}'); v += s.slice(i, e + 1); i = e + 1; continue; }
      if (ch === '`') { const e = spanEnd(s, i, '`', '`'); nested(s.slice(i + 1, e), at); v += '$()'; i = e + 1; continue; }
      v += ch;
      i++;
    }
    return { v, at, end: i, q };
  };
  let i = 0;
  while (i < s.length && i - skipped - span.docs < SCAN_MAX) {
    const ch = s[i];
    if (ch === '\n') {
      end();
      if (!(piping && elem === out.length)) { isolate(); closeCoproc(i); }   // r8: a pipeline element / a coproc ends
      i++;
      for (const h of pending) {   // the heredoc's lines: up to the delimiter line, whatever their length (r4: no shell)
        const b = heredocBody(s, i, h);
        skipped += b.end - i;
        i = b.end;
        (h.words.heredocs || (h.words.heredocs = [])).push(b.body);
        if (!b.closed) out.blind.push(b.body);   // an UNCLOSED heredoc — its body is blind text
        else if (!h.quoted) substitutions(b.body, h.at);
      }
      pending = [];
      list = out.length;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
    if (ch === '\\' && s[i + 1] === '\n') { i += 2; continue; }
    if (ch === '#') { while (i < s.length && s[i] !== '\n') i++; continue; }   // a word's start: a comment to the line's end
    if (ch === '&' && s[i + 1] === '>') { i += s[i + 2] === '>' ? 3 : 2; redirect = true; continue; }
    if (ch === '(' && s[i + 1] === '(' && !words.length) { const e = spanEnd(s, i, '(', ')', false); names(s.slice(i, e)); i = e + 1; continue; }   // `(( … ))` arithmetic
    if (ch === '|' && s[i + 1] === '&') { pipe = end(); isolate(true); piping = true; redirect = false; i += 2; continue; }   // `|&`: a pipe (stderr too)
    if (ch === '(' && /^[ \t]*\)/.test(s.slice(i + 1, i + 64)) && (words.length === 1 || (words.length === 2 && words[0].v === 'function')) && words.every((x) => !x.q) && /^[\w.:@+-]+$/.test(words[words.length - 1].v)) {
      const name = words[words.length - 1].v, c = end();   // r7: `name ()` / `function name ()` — a definition: its body next
      if (c) c.words.def = true;
      fn = { name }; list = out.length;
      i = s.indexOf(')', i) + 1;
      continue;
    }
    if (';&|()'.includes(ch)) {
      const two = (ch === '&' || ch === '|' || ch === ';') && s[i + 1] === ch;
      const c = end();
      if (ch === ';' || ch === '&' || (two && ch === '|')) { isolate(); closeCoproc(i); }   // r8: a pipeline, a coproc's list end
      if (ch === '&' && !two) {   // `… &` — its whole and-or list to the background: r6 — ONE job of this shell, launched here
        // r7: the job IS A SHELL OF ITS OWN — its list's commands and the jobs they launched run there (a `wait` outside
        // ends the job's own pid, never an orphan inside it; a reaper inside ends only what that shell launched); zsh's
        // `&!` / `&|` disown it at birth (never waited for)
        const job = { at: i, scope, ended: false, disowned: s[i + 1] === '!' || s[i + 1] === '|' };
        launch(job, list);
        if (job.disowned) i++;
      }
      if (two && ch !== ';') andOr = true;
      if (ch === '|' && !two) { pipe = c; isolate(true); piping = true; }   // r8: the element before the pipe is a shell of its own — the one after it too
      if (ch === ')') { const g = closeGroup(')', i); if (g) list = g.outer; else if (groups.length && groups[groups.length - 1].close === 'esac') groups[groups.length - 1].seg = i; }   // r8: a case pattern starts a branch
      else if (ch === '(') { groups.push({ close: ')', outer: list, scope, elem, piping, at: i, ...(andOr ? { seg: i } : {}) }); scope = ++scopes; list = out.length; elem = out.length; piping = false; fn = null; }
      else if (ch === ';' || (ch === '&' && !two)) list = out.length;
      redirect = false;
      i += two ? 2 : 1;
      continue;
    }
    if ((ch === '<' || ch === '>') && s[i + 1] === '(') {   // a process substitution: a command line of its own, an argument here
      const e = spanEnd(s, i + 1, '(', ')', true, span);
      nested(s.slice(i + 2, e), i);
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
    if (ch === '<' || ch === '>') { i++; while ('<>&|'.includes(s[i] || '_')) i++; redirect = true; continue; }
    const w = readWord(i);
    i = w.end > i ? w.end : i + 1;
    if (redirect) { redirect = false; continue; }
    if (/^\d+$/.test(w.v) && (s[i] === '<' || s[i] === '>')) continue;   // a file descriptor before a redirection
    if (!w.q && w.v === '{' && words.length === 2 && words[0].v === 'function') end();   // r7: `function name {`
    // r8: `coproc NAME { … }` — the name before a compound command is no command word
    const named = words.length === 2 && words[0].v === 'coproc' && !words[0].q && !words[1].q && /^[A-Za-z_][A-Za-z0-9_]*$/.test(words[1].v) && GROUP_OPEN.has(w.v);
    if (!w.q && (named || words.every((x) => OPENERS.has(x.v)))) {   // r4: a compound command's own words, where a command word stands
      if (w.v === 'coproc' && !coproc) coproc = { depth: groups.length, from: out.length };   // r8: its list is a job
      if (GROUP_OPEN.has(w.v)) {
        // r7: a function's body opens — r8: where (its scope, its branch), and inside another body (where it runs: unread)
        if (fn && w.v === '{') Object.assign(fn, { at: w.at, scope, frame: frame(), nested: groups.some((g) => g.fn) });
        groups.push({ close: GROUP_OPEN.get(w.v), outer: list, scope, elem, piping, at: w.at, ...(andOr ? { seg: w.at } : {}), ...(fn && w.v === '{' ? { fn } : {}) });
        list = out.length; elem = out.length; piping = false;   // r8: its own list (`x | { C & }` sends C alone)
      } else if (GROUP_CLOSE.has(w.v)) { const g = closeGroup(w.v, w.at); if (g) list = g.outer; }
      else if (BRANCHES.has(w.v) && groups.length && COND_CLOSE.has(groups[groups.length - 1].close)) groups[groups.length - 1].seg = w.at;   // r8: a branch begins
      fn = null;
    } else if (!words.length) fn = null;
    words.push(w);
  }
  end();
  isolate(); closeCoproc(i);   // r8: the line's last pipeline element and coproc end
  endJobs(mine, jobs, arith);
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
/** r7: the signals with which a `kill` ENDS a job (none named: TERM) — never STOP / CONT / HUP / USR1 / USR2 / WINCH …
 *  (a pause, a resume, a request a program may catch) nor `0` (a probe) */
const ENDING_SIGNALS = new Set(['TERM', 'KILL', 'INT', 'QUIT', 'ABRT', 'IOT', 'ALRM', 'PIPE', '15', '9', '2', '3', '6', '14', '13']);
/** r6: THE JOBS A LINE ENDS ITSELF — marks `ended` on the background jobs of ONE shell (shellCommands: one per single `&`)
 *  that a FOREGROUND `wait` / `kill` of that shell ends after their launch: `wait` with no operand ends every job before
 *  it; `wait` / `kill` of a job's pid — `$!`, a variable assigned `$!` after it, `%1` / `%%` — ends that job. Nothing else
 *  ends a job: a `wait` / `kill` sent to the background itself (r7: it runs in that job's own shell), `kill -0` (a probe) /
 *  `kill -l`, a literal or computed pid, a reaper after `&&` / `||` (it runs on a condition) or in a pipe (a subshell), a
 *  job of another `( … )` subshell, a `trap` (it ends nothing until it fires — never seen). r7: nor a job DISOWNED
 *  (`disown`, zsh's `&!` / `&|`: the shell no longer waits for it), an ORPHAN inside a backgrounded group (only a reaper in
 *  that group's shell ends it), a `kill` with a signal that ends nothing (ENDING_SIGNALS), a reaper through a wrapper
 *  (`timeout 5 wait` — a builtin), a reaper naming ONE pass of a job launched in a loop (`$!`, `%1` — only a `wait` of
 *  every job ends it), a variable once it is assigned anything but `$!`.
 *  r8: UNSURE ⇒ IT LINGERS — `ended` only where every shell the agent may run (bash, zsh) surely ended the job:
 *  - a FUNCTION's body runs where the function is CALLED — a call that passes THE ONE GATE (the reaper's: no `&&` / `||`
 *    before it, no pipe, no wrapper — `command f` runs no function; and no `&`) runs it: its reapers (each through the
 *    same gate) end ONLY the jobs the same call of the body launched BEFORE them, never the caller's; each call's jobs
 *    are NEW jobs (`f; f; wait $!` ends the second call's), a call in a loop one per pass; the caller's later reapers
 *    end what the call left running. A call that fails the gate, or a call made inside another body (unread): its
 *    body's jobs linger (and a body called with `&` runs its every command in that job);
 *  - a reaper reaches only the jobs launched IN ITS OWN BRANCH (`words.frame`: inside an `if` / `case` branch, a loop's
 *    body, a group after `&&` / `||`, it ends nothing launched before that branch began) and after the last `exit` /
 *    `return` / `exec CMD` of its shell (the shell may have ended there — a `break` / `continue`: in its loop);
 *  - each element of a pipeline is a shell of its own (shellCommands: its jobs are its own); a `coproc` is never ended;
 *  - `wait` with an option ends nothing (`wait -n`: an error in zsh), nor `command wait` (zsh's `command` runs no
 *    builtin); `%n` past `%1` and `%-` name nothing (job numbers restart when the table empties);
 *  - a variable names a job only from a plain `P=$!` (or `export` / `local` / `declare` …) in the job's branch — never
 *    one a function's body, arithmetic, `read` / `unset` / `for` (any bare word P) touches.
 *  PURE. */
function endJobs(cmds, jobs, arith = new Set()) {
  if (!jobs.length) return;
  const piped = new Set(cmds.map((c) => c.pipeFrom).filter(Boolean));
  const baseOf = (v) => v.slice(v.lastIndexOf('/') + 1);
  // r8: THE ONE GATE — a reaper and a function call alike: on a condition (after `&&` / `||`), in a pipe, through a
  // wrapper (`timeout 5 wait` runs no builtin, nor zsh's `command wait`; `command f` / `env f` no function); a call also
  // when it is sent to the background (its body runs in that job's own shell)
  const gated = (c, cw, call) => !!(c.words.andOr || c.pipeFrom || piped.has(c) || (call && c.words.bg) || c.words.slice(0, cw.k).some((w) => WRAPPERS.has(baseOf(w.v))));
  const bodies = new Map();   // a function (shellCommands' `words.fn`) → its body's commands, in order
  for (const c of cmds) if (c.words.fn) { if (!bodies.has(c.words.fn)) bodies.set(c.words.fn, []); bodies.get(c.words.fn).push(c); }
  const assigned = (c) => c.words.map((w) => /^([A-Za-z_][A-Za-z0-9_]*)\+?=/.exec(w.v)).filter(Boolean).map((m) => m[1]);
  const tainted = bodies.size ? new Set([...arith, ...[...bodies.values()].flat().flatMap(assigned)]) : arith;   // their value at a reaper: unknown
  // the functions whose body may `disown` (itself or through a function it calls): any call of one disowns every job
  const disowners = new Set();
  for (let grew = bodies.size > 0; grew;) {
    grew = false;
    for (const [fn, list] of bodies) {
      if (disowners.has(fn.name)) continue;
      if (list.some((c) => { const cw = commandWord(c.words); return !!cw && (cw.base === 'disown' || disowners.has(cw.base)); })) { disowners.add(fn.name); grew = true; }
    }
  }
  const order = (list) => list.slice().sort((x, y) => x.at - y.at);
  const defsAt = order([...bodies.keys()].filter((fn) => fn.at !== undefined));
  const ownOf = (fn) => order(jobs.filter((j) => j.fn === fn));
  const inst = new Map(jobs.filter((j) => j.fn).map((j) => [j, []]));   // a body's job → its jobs, one per call
  const mk = (j) => { const x = { at: j.at, scope: j.scope, many: j.many, disowned: j.disowned, ended: false }; inst.get(j).push(x); return x; };
  const lost = (fn, away) => { if (away) fn.away = true; for (const j of ownOf(fn)) inst.get(j).push({ ended: false }); };   // a call unread: its jobs linger
  const exitsIn = (fn) => (bodies.get(fn) || []).some((c) => { const cw = commandWord(c.words); return !!cw && (cw.base === 'exit' || c.words.slice(0, cw.k).some((w) => baseOf(w.v) === 'exec')); });
  // ONE SHELL running `list` in order — `own` = the jobs its text launches (`make` = their objects: a body's are new at
  // every call); `outer` = a body's caller's jobs (its `%1` / `disown` see them, its reapers never end them)
  const walk = (list, own, make, defs, outer) => {
    const live = [], vars = new Map(), cut = new Map();
    let next = 0, nd = 0;
    for (const c of list) {
      const at = c.words[0].at, sc = c.words.scope;
      while (next < own.length && own[next].at < at) live.push(make(own[next++]));
      if (!outer) while (nd < defsAt.length && defsAt[nd].at < at) { defs.set(defsAt[nd].name, defsAt[nd]); nd++; }
      const cw = commandWord(c.words);
      if (!cw && !c.words.some((w) => w.v.includes('=') || vars.has(w.v))) continue;   // no command, no assignment: nothing here
      let open = null, reach = null;
      const openOf = () => open || (open = live.filter((x) => x.scope === sc));   // this shell's job table, in launch order
      // what a reaper here can surely have run after: a job of its own branch, launched after its shell's last `exit` / …
      const reachOf = () => reach || (reach = openOf().filter((x) => x.at > c.words.frame && x.at > (cut.has(sc) ? cut.get(sc) : -1) && x.at > (cut.has(sc + ':' + c.words.loopAt) ? cut.get(sc + ':' + c.words.loopAt) : -1)));
      const job = (a) => {
        const table = outer && outer.length ? [...outer, ...openOf()] : openOf();
        if (a === '$!' || a === '${!}' || a === '%%' || a === '%+' || a === '%') return table[table.length - 1] || null;
        if (a === '%1') return table[0] || null;
        const v = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))$/.exec(a);
        return v ? vars.get(v[1] || v[2]) || null : null;
      };
      const reaperGate = !cw || gated(c, cw, false);
      for (const w of c.words) {   // `P=$!` names this branch's latest job; a bare word P, any other value: no job (r7)
        if (!w.q && vars.has(w.v)) vars.delete(w.v);
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\+?=([^]*)$/.exec(w.v);
        if (!m) continue;
        const plain = !cw || ['export', 'local', 'declare', 'typeset', 'readonly'].includes(cw.base);
        if (plain && !tainted.has(m[1]) && !(cw && reaperGate) && !c.words.andOr && /^\$(?:!|\{!\})$/.test(m[2])) vars.set(m[1], reachOf()[reachOf().length - 1] || null);
        else vars.delete(m[1]);
      }
      if (!cw || c.words.def) continue;
      if (cw.base === 'disown') {   // r7: wherever it could run (on a condition, in a pipe, in a body: the caller's too)
        const args = c.words.slice(cw.k + 1).map((w) => w.v), ops = args.filter((a) => a[0] !== '-');
        const pool = [...(outer || []), ...openOf()], named = ops.map(job);
        const marks = outer || args.some((a) => /^-[a-z]*[ar]/.test(a)) || named.includes(null) ? pool : ops.length ? named : pool.slice(-1);
        for (const j of marks) if (j && !j.ended) j.disowned = true;
        continue;
      }
      // r8: a command after which the shell may be gone — what a later reaper ends was launched after it
      if (cw.base === 'exit' || cw.base === 'return' || c.words.slice(0, cw.k).some((w) => baseOf(w.v) === 'exec')) { cut.set(sc, at); if (cw.base === 'exit' || cw.base === 'return') continue; }
      if (cw.base === 'break' || cw.base === 'continue') { cut.set(sc + ':' + c.words.loopAt, at); continue; }
      if (REAPERS.includes(cw.base)) {
        if (reaperGate) continue;
        const kill = cw.base === 'kill', ops = [];
        let sig = 'TERM', opts = true, ok = true;
        for (let k = cw.k + 1; k < c.words.length; k++) {
          const a = c.words[k].v;
          if (opts && a === '--') { opts = false; continue; }
          if (!opts || a.length < 2 || a[0] !== '-') { ops.push(a); continue; }
          if (!kill || a === '-l' || a === '-L') { ok = false; break; }   // r8: `wait -n` / `-f` / `-p` (zsh: an error), a list
          if (a === '-s' || a === '-n') { sig = (c.words[k + 1] || {}).v || ''; k++; } else sig = a.slice(1);
        }
        if (!ok || (kill && !ENDING_SIGNALS.has(sig.toUpperCase().replace(/^SIG/, '')))) continue;   // a probe (`-0`), a pause, a request
        // r7: a job launched in a LOOP is one per pass — only a `wait` of every job ends it (`$!`, `%1` name one pass)
        const one = (a) => { const j = job(a); return j && !j.many && reachOf().includes(j) ? j : null; };
        const ends = !ops.length ? (kill ? [] : reachOf()) : ops.map(one);
        for (const j of ends) if (j && !j.disowned) j.ended = true;
        continue;
      }
      const def = defs.get(cw.base);   // a function CALLED here (the latest definition read before it)
      if (!def) continue;
      if (disowners.has(def.name)) for (const x of [...(outer || []), ...openOf()]) if (!x.ended) x.disowned = true;
      if (exitsIn(def)) cut.set(sc, at);
      if (outer || gated(c, cw, true)) { lost(def, !!(outer || c.words.bg)); continue; }
      const body = walk(bodies.get(def) || [], ownOf(def), mk, defs, openOf());
      for (const x of body) if (x.scope === def.scope && !x.ended && !x.disowned) { x.scope = sc; x.at = at; if (c.words.loop) x.many = true; live.push(x); }
    }
    while (next < own.length) live.push(make(own[next++]));
    return live;
  };
  walk(cmds.filter((c) => !c.words.fn), order(jobs.filter((j) => !j.fn)), (j) => j, new Map(), null);
  for (const [j, xs] of inst) { j.ended = xs.length > 0 && xs.every((x) => x.ended && !x.disowned); if (xs.some((x) => x.disowned)) j.disowned = true; }
}

/** r3: THE SCRIPTS A SHELL COMMAND WORD RUNS — the shell IS these, never a command of its own: its `-c` string (an
 *  UNQUOTED operand with words after it is a re-joined argv — codex's `["bash","-lc","…"]` joined with no quoting — so the
 *  rest of the line is the script, `joined`), its heredocs and here-strings, or the stdin a pipe feeds it (`cat <<EOF |
 *  bash`, `echo '…' | sh`). null when it runs a script FILE (`bash run.sh`) or a stdin it cannot see — it could run
 *  anything, unread. `[{text, at, joined}]`. */
function shellScripts(c, words, k) {
  let cflag = false, sflag = false, j = k + 1;
  for (; j < words.length; j++) {
    const o = words[j].v;
    if (o === '-o' || o === '+o' || o === '-O' || o === '+O') { j++; continue; }
    if (o === '--') { j++; break; }
    if (o.length > 1 && (o[0] === '-' || o[0] === '+')) { if (o[0] === '-' && o[1] !== '-') { if (o.includes('c')) cflag = true; if (o.includes('s')) sflag = true; } continue; }
    break;
  }
  if (cflag) {
    if (j >= words.length) return [];
    const op = words[j];
    if (!op.q && j + 1 < words.length && c.src) return [{ text: c.src.slice(op.at, words[words.length - 1].end), at: op.at, joined: true }];
    return [{ text: op.v, at: op.at, joined: false }];
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
 *  r6: `ended` — a background run whose job the line ends itself, endJobs; r8: `query` — the channels CLI's `search`
 *  words, its first operand) + `blind` (text the scan could not read: a cut-off tail, an unclosed heredoc). PURE. */
function commandsRun(cmd, owner = null, depth = 0, offset = 0) {
  const cmds = shellCommands(cmd, owner, depth, offset);
  const out = [];
  out.blind = cmds.blind.slice();
  // r6: a run of a background job (`bg`) carries `ended` when the line ends that job itself (endJobs) — r7: inside a
  // command sent to the background, a run its own shell sent to the background ends only when that shell ended it too
  // (`bash -c 'cli &' & wait` leaves the CLI running)
  const add = (list, bg, ended) => { for (const { ended: e, ...x } of list) out.push(bg ? { ...x, bg: true, ...(ended && (!x.bg || e) ? { ended: true } : {}) } : { ...x, ...(e ? { ended: true } : {}) }); for (const b of list.blind) out.blind.push(b); };
  const run = (c, words, cw, at, bg, ended) => {
    if (cw.lookup) { out.push({ base: cw.base, at, verb: '', lookup: true }); return; }
    if (cw.split !== undefined && depth < 4) { add(commandsRun([cw.split, ...words.slice(cw.rest).map((w) => w.v)].join(' '), at, depth + 1), bg, ended); return; }
    if (SHELLS.has(cw.base) && depth < 4) {
      const scripts = shellScripts(c, words, cw.k);
      if (scripts) { for (const sc of scripts) add(sc.joined && c.owner === null ? commandsRun(sc.text, null, depth + 1, offset + sc.at) : commandsRun(sc.text, at, depth + 1), bg, ended); return; }
    }
    const runner = SCRIPT_RUNNERS.get(cw.base);
    if (runner && depth < 4) {
      let j = cw.k + 1;
      while (j < words.length && words[j].v.length > 1 && words[j].v[0] === '-') j += runner.includes(words[j].v) ? 2 : 1;
      let e = j;
      while (e < words.length && !(cw.base === 'parallel' && /^:::/.test(words[e].v))) e++;
      if (e > j) { add(commandsRun(words.slice(j, e).map((w) => w.v).join(' '), at, depth + 1), bg, ended); return; }
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
        if (scw) run(c, sub, scw, c.owner === null ? offset + sub[scw.k].at : c.owner, bg, ended);
        j = e;
      }
    }
  };
  for (const c of cmds) {
    const cw = commandWord(c.words);
    // r8: a function's body called with `&` (or from another body — where, unread) runs in a job: it lingers
    const away = !!(c.words.fn && (c.words.fn.away || c.words.fn.nested));
    if (cw) run(c, c.words, cw, c.owner === null ? offset + c.words[cw.k].at : c.owner, !!c.words.bg || away, !away && !!(c.words.jobs && c.words.jobs.every((j) => j.ended && !j.disowned)));
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
  CLI, SHELLS, OPENERS, DATA_HEADS, WRAPPERS, SCRIPT_RUNNERS, FIND_RUNS, ENV_SPLIT, SCAN_MAX, GROUP_OPEN, GROUP_CLOSE, BRANCHES, RUNS_A_COMMAND, REAPERS, ENDING_SIGNALS,
  spanEnd, shellCommands, commandWord, endJobs, shellScripts, commandsRun, cliRuns, channelsRuns, searchWords,
};
