/**
 * THE SHELL'S WORDS — PURE (imports nothing; CJS so the server's channel witness, the bundle and the client's run summary
 * share ONE reading). Enough of the shell grammar to tell a COMMAND WORD from prose: `shellCommands` (the simple commands
 * of a command line), `commandWord`, `shellScripts` (a shell IS its script), `commandsRun` (every command a line runs —
 * its spans, a shell's script, a script runner's, a find -exec's, `env -S`'s), `cliRuns` / `channelsRuns` (where the
 * channels CLI is a command word). Bounded: SCAN_MAX characters of shell, nesting 4; what it cannot read is `blind`.
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
const OPENERS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}', 'fi', 'done', 'esac']);
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
 *  a `)` / quote in its body never closes anything; `(( … ))` inside is arithmetic (its `<<` a shift). */
function spanEnd(s, i, open, close, docs = open === '(') {
  let depth = 0, pending = [];
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') { j++; continue; }
    if (docs && ch === '\n' && pending.length) {
      let k = j + 1;
      for (const h of pending) { const b = heredocBody(s, k, h); if (!b.closed) return s.length; k = b.end; }
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
 *  PURE, bounded: SCAN_MAX characters of shell (a heredoc's body is read to its delimiter line and never counts), nesting
 *  4 — the rest (and an unclosed heredoc's body) is returned as `blind` text. */
function shellCommands(src, owner = null, depth = 0, offset = 0) {
  const s = String(src || '');
  const out = [];
  out.blind = [];
  if (depth > 4) { out.blind.push(s); return out; }
  // r4: `list` = the index of the first command of the AND-OR LIST being read (a `;`, a newline or a single `&` starts the
  // next); a compound command open here is ONE command of the list around it — {close: the word (or `)`) that closes it,
  // outer: that list}
  let words = [], pending = [], redirect = false, pipe = null, skipped = 0, list = 0;
  const groups = [];
  const end = () => { const c = words.length ? { words, owner, src: s, pipeFrom: pipe } : null; if (c) out.push(c); words = []; pipe = null; return c; };
  // the group a closer ends — `)` only the innermost `(` (a `case` pattern's `)` closes nothing); a word, its own opener
  const closeGroup = (close) => {
    const k = close === ')' ? (groups.length && groups[groups.length - 1].close === ')' ? groups.length - 1 : -1) : groups.map((g) => g.close).lastIndexOf(close);
    if (k < 0) return null;
    const g = groups[k];
    groups.length = k;
    return g;
  };
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
          if (s[j] === '$' && s[j + 1] === '(' && s[j + 2] === '(') { j = spanEnd(s, j + 1, '(', ')', false); v += '$(())'; continue; }
          if (s[j] === '$' && s[j + 1] === '(') { const e = spanEnd(s, j + 1, '(', ')'); nested(s.slice(j + 2, e), at); v += '$()'; j = e; continue; }
          if (s[j] === '`') { const e = spanEnd(s, j, '`', '`'); nested(s.slice(j + 1, e), at); v += '$()'; j = e; continue; }
          v += s[j];
        }
        i = j + 1; q = true;
        continue;
      }
      if (ch === '$' && s[i + 1] === '(' && s[i + 2] === '(') { const e = spanEnd(s, i + 1, '(', ')', false); v += '$(())'; i = e + 1; continue; }
      if (ch === '$' && s[i + 1] === '(') { const e = spanEnd(s, i + 1, '(', ')'); nested(s.slice(i + 2, e), at); v += '$()'; i = e + 1; continue; }
      if (ch === '$' && s[i + 1] === '{') { const e = spanEnd(s, i + 1, '{', '}'); v += s.slice(i, e + 1); i = e + 1; continue; }
      if (ch === '`') { const e = spanEnd(s, i, '`', '`'); nested(s.slice(i + 1, e), at); v += '$()'; i = e + 1; continue; }
      v += ch;
      i++;
    }
    return { v, at, end: i, q };
  };
  let i = 0;
  while (i < s.length && i - skipped < SCAN_MAX) {
    const ch = s[i];
    if (ch === '\n') {
      end();
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
    if (ch === '(' && s[i + 1] === '(' && !words.length) { i = spanEnd(s, i, '(', ')', false) + 1; continue; }   // `(( … ))` arithmetic
    if (ch === '|' && s[i + 1] === '&') { pipe = end(); redirect = false; i += 2; continue; }   // `|&`: a pipe (stderr too)
    if (';&|()'.includes(ch)) {
      const two = (ch === '&' || ch === '|' || ch === ';') && s[i + 1] === ch;
      const c = end();
      if (ch === '&' && !two) for (let k = list; k < out.length; k++) out[k].words.bg = true;   // `… &` — its whole and-or list to the background
      if (ch === '|' && !two) pipe = c;
      if (ch === ')') { const g = closeGroup(')'); if (g) list = g.outer; }
      else if (ch === '(') { groups.push({ close: ')', outer: list }); list = out.length; }
      else if (ch === ';' || (ch === '&' && !two)) list = out.length;
      redirect = false;
      i += two ? 2 : 1;
      continue;
    }
    if ((ch === '<' || ch === '>') && s[i + 1] === '(') {   // a process substitution: a command line of its own, an argument here
      const e = spanEnd(s, i + 1, '(', ')');
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
    if (!w.q && words.every((x) => OPENERS.has(x.v))) {   // r4: a compound command's own words, where a command word stands
      if (GROUP_OPEN.has(w.v)) groups.push({ close: GROUP_OPEN.get(w.v), outer: list });
      else if (GROUP_CLOSE.has(w.v)) { const g = closeGroup(w.v); if (g) list = g.outer; }
    }
    words.push(w);
  }
  end();
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
    if (ASSIGN_RE.test(v) || OPENERS.has(v)) { k++; continue; }
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
 *  it): `[{base, at, verb, bg?, lookup?, execs?}]` (`execs`: a file tool's form that runs a program, RUNS_A_COMMAND) +
 *  `blind` (text the scan could not read: a cut-off tail, an unclosed heredoc). PURE. */
function commandsRun(cmd, owner = null, depth = 0, offset = 0) {
  const cmds = shellCommands(cmd, owner, depth, offset);
  const out = [];
  out.blind = cmds.blind.slice();
  const add = (list, bg) => { for (const x of list) out.push(bg ? { ...x, bg: true } : x); for (const b of list.blind) out.blind.push(b); };
  const run = (c, words, cw, at, bg) => {
    if (cw.lookup) { out.push({ base: cw.base, at, verb: '', lookup: true }); return; }
    if (cw.split !== undefined && depth < 4) { add(commandsRun([cw.split, ...words.slice(cw.rest).map((w) => w.v)].join(' '), at, depth + 1), bg); return; }
    if (SHELLS.has(cw.base) && depth < 4) {
      const scripts = shellScripts(c, words, cw.k);
      if (scripts) { for (const sc of scripts) add(sc.joined && c.owner === null ? commandsRun(sc.text, null, depth + 1, offset + sc.at) : commandsRun(sc.text, at, depth + 1), bg); return; }
    }
    const runner = SCRIPT_RUNNERS.get(cw.base);
    if (runner && depth < 4) {
      let j = cw.k + 1;
      while (j < words.length && words[j].v.length > 1 && words[j].v[0] === '-') j += runner.includes(words[j].v) ? 2 : 1;
      let e = j;
      while (e < words.length && !(cw.base === 'parallel' && /^:::/.test(words[e].v))) e++;
      if (e > j) { add(commandsRun(words.slice(j, e).map((w) => w.v).join(' '), at, depth + 1), bg); return; }
    }
    const execs = RUNS_A_COMMAND.has(cw.base) && RUNS_A_COMMAND.get(cw.base)(words.slice(cw.k + 1).map((w) => w.v));
    out.push({ base: cw.base, at, verb: words[cw.k + 1] ? words[cw.k + 1].v : '', ...(bg ? { bg: true } : {}), ...(execs ? { execs: true } : {}) });
    if (cw.base === 'find') {
      for (let j = cw.k + 1; j < words.length; j++) {
        if (!FIND_RUNS.has(words[j].v)) continue;
        let e = j + 1;
        while (e < words.length && words[e].v !== ';' && words[e].v !== '+') e++;
        const sub = words.slice(j + 1, e), scw = commandWord(sub);
        if (scw) run(c, sub, scw, c.owner === null ? offset + sub[scw.k].at : c.owner, bg);
        j = e;
      }
    }
  };
  for (const c of cmds) {
    const cw = commandWord(c.words);
    if (cw) run(c, c.words, cw, c.owner === null ? offset + c.words[cw.k].at : c.owner, !!c.words.bg);
  }
  return out;
}

/** The CLI's runs in a commandsRun result — its COMMAND WORDS only (r4: its name in blind text is never a run — the
 *  blind text makes the call «could run», rung ②, never rung ①). */
function cliRuns(ran) { return ran.filter((x) => x.base === CLI).map(({ at, verb }) => ({ at, verb })); }

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
  CLI, SHELLS, OPENERS, DATA_HEADS, WRAPPERS, SCRIPT_RUNNERS, FIND_RUNS, ENV_SPLIT, SCAN_MAX, GROUP_OPEN, GROUP_CLOSE, RUNS_A_COMMAND,
  spanEnd, shellCommands, commandWord, shellScripts, commandsRun, cliRuns, channelsRuns,
};
