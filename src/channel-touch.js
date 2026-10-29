'use strict';
/**
 * FROM THE CHAT TO THE CONVERSATION — THE PASSIVE WITNESS'S DECISIONS
 * (docs/design-communication-panel.zh.md §26, backlog B-099e; owner
 * 2026-09-27: "那就按照这个做吧" — plan A, passive: no agent tool, no
 * injected context).
 *
 * With hundreds of mails and Lark chats, FINDING the conversation an agent is
 * working on is the slow part — and the agent already knows. Every agent
 * read / search / reply / compose / refresh / request / status of a channel
 * conversation goes through OUR agent routes, so the server WITNESSES it
 * (src/server/channel-touches.js) and the chat draws it: a clickable row on
 * the tool call's card, a status-bar chip for the turn, and a reverse link in
 * the conversation window. This module is every DECISION of that, PURE
 * (imports nothing; CommonJS so the server witness and the bundle share ONE
 * spelling of every rule — the task-color-seq / quota-model pattern):
 *
 *  - `normalizeTouch` / `touchKey` / `appendTouch`: the touch record, its
 *    conversation key (a composed message has none yet: `<account>/~compose/
 *    <proposal>`), the ring (RING_MAX, the newest kept; a repeat of the same
 *    op on the same conversation inside MERGE_MS folds into the previous
 *    touch — an agent's read loop is one touch, not 200 that evict the rest).
 *  - `bindToCall`: WHICH TOOL CARD A TOUCH BELONGS TO. A call RUNS from its
 *    own instant until the next call that is not part of its parallel batch
 *    starts (a sequential agent issues the next call only after the previous
 *    returned) or until the next non-tool message; a touch whose instant a
 *    running call contains belongs to it — among several, one whose command
 *    NAMES the touch (its conversation key, `vibespace-channels search`, a
 *    compose on that account, the proposal id) first, else the latest to
 *    start. Nothing contains it ⇒ the view's LATEST card when the view shows
 *    the conversation's tail (the spec's "the session's latest tool card"),
 *    else unbound (its card is not rendered here; it binds when it is).
 *    lane touch-chip-cause (the owner 2026-10-28, 「这个展开方式对吗？」 — 17 conversation rows hung on a
 *    `vibespace-status` call): A CONVERSATION ENTRY HANGS ON THE ACT THAT CAUSED IT. Every record carries its
 *    `cause` (CAUSES: `agent` — the agent's own channel verb, the only writer there is; `delivery` — the hub handing
 *    a conversation's words to the agent, declared and DEFERRED: no writer records one). THE CANDIDATES: a call
 *    RUNNING at the touch (its start to its stop + the skew — a call that ended more than the skew before the touch
 *    did not cause it) and a call that LINGERS (its work outlives its card: Bash `run_in_background`, a background
 *    helper, a command line ending in `&`, a `vibespace-job run`; to its turn's end or its seen end) — each of the
 *    touch's OWN turn (a call never causes another turn's touch). THE LADDER: ① a candidate whose command (a helper:
 *    its prompt, the CLI's name + verb as a phrase) NAMES the touch — its conversation, its proposal, its verb — the
 *    latest; else, nothing lingering, a running call that runs `vibespace-channels` as a COMMAND WORD (`channelsRuns`
 *    — never the name in quoted prose `--reason "… vibespace-channels read …"` / `$'…'`, a comment, a quoted heredoc
 *    or another command's argument), the latest; ② else exactly ONE candidate, running, when it could have run
 *    anything (`callCanRun`: a shell call not made only of RUNS_NOTHING — a script, an interpreter, a shell's script
 *    file; a helper by its TOOL NAME, HELPER_TOOLS); ③ else (a producer lingering beside a foreground stranger,
 *    several running none naming it, or a lone call that runs nothing) the turn's VibeSpace NOTE row (`notes` —
 *    «VibeSpace gave the assistant its task context»), never silently on a neighbour; ④ no note in the touch's turn
 *    (`turns` — the instants turns start, `opensTurn`: the harness's own turn facts — a record that entered a running
 *    turn never starts one; the skew window never crosses one) ⇒ unbound, the chip still lists it. A `delivery`
 *    touch always takes ③/④. THE SCANNER (`shellCommands` / `commandsRun`) reads enough shell to tell a command word
 *    from prose: a shell wrapper IS its script (`bash -c`, a re-joined codex argv read whole, a heredoc / here-string
 *    / pipe it reads), wrappers and script runners (eval, watch, parallel, find -exec) reach their operand; what it
 *    cannot read (past SCAN_MAX, an unclosed heredoc) could run, and the CLI's name there counts.
 *  - `foldTouches` / `foldView`: one ROW per conversation — the ops counted
 *    (read = messages read, search = hits, reply / compose / refresh /
 *    request / status = calls), replied or composed first, then by the last
 *    touch; FOLD_SHOWN rows shown, the rest behind "+N more".
 *  - `openVerdict` / `tailVerdict` (lane channel-search-view, .212 — the owner 2026-10-04: "目前点开似乎是第一条匹配结果
 *    的对话框而不是搜索结果展示"): WHAT A CLICK OPENS — a row whose newest op is a search that carries its query ⇒
 *    the search RESULTS scoped to that conversation; the fold's tail over rows of one search ⇒ that search unscoped;
 *    a search touch carries its `query` + bounded hit refs ({msgId, at} — never the words: the dialog re-reads them);
 *    lane search-card-open (.233): a vendor (`--full`) search's touch also carries its memo scope (`memo` — 'all' or
 *    the agent's set hash, SR.isMemoScope's shape): the dialog reads THAT remembered answer first.
 *  - `rowWords`, `chipView` / `chipText`, `touchedBy` / `touchedByWords`,
 *    `agoText`, `glyphFor`: the words, through an INJECTED translator (the
 *    server sends structure; the device's language speaks it).
 *
 * Gate: scripts/test-channel-touch.mjs (fast) + scripts/test-channel-jump.mjs
 * (heavy, chrome).
 */

/** The closed op set, in the order a row SAYS them (a draft outranks a read). */
const OPS = Object.freeze(['reply', 'compose', 'react', 'recall', 'read', 'search', 'refresh', 'request', 'status', 'api', 'connect']);   // + lane channels-proposals-recall; + lane pod-oauth-callback: `connect` = the agent asked the person to connect an account TYPE (the row opens the Connect dialog on it)
/** The ops that make a row a DRAFT row (sorted first; the reverse link says "Drafted by"). */
const DRAFT_OPS = Object.freeze(['reply', 'compose']);
/** lane chat-proposal-card: the ops that FILE a proposal (its card is drawn at the call row that filed it); `status` and
 *  `api` name one too, but a status check files nothing and an API call's card is channel-api-card-view's. */
const FILED_OPS = Object.freeze(['reply', 'compose', 'react', 'recall']);
/** The per-session ring (the witness keeps the newest). */
const RING_MAX = 200;
/** A repeat of the same op on the same conversation inside this window folds into the previous touch. */
const MERGE_MS = 2000;
/** A touch may land this much before its card's own instant (the server's clock vs a transcript's). */
const SKEW_MS = 1500;
/** Calls started within this of each other are ONE parallel batch (they may run together). */
const BATCH_MS = 1500;
/** Rows shown before "+N more". */
const FOLD_SHOWN = 3;
/** lane touch-chip-cause: WHO CAUSED A TOUCH — the closed set the witness stamps at every writer (src/server/
 *  channel-touches.js refuses a writer without one). `agent` = the agent's own read / search / reply / compose (every
 *  /api/agent/channels/* verb); `delivery` = the hub handed the conversation's words to the agent as context — declared,
 *  no writer yet (test-channel-touch's census names it DEFERRED), bound to the turn's VibeSpace note row, never a call. */
const CAUSES = Object.freeze(['agent', 'delivery']);
/** What a rendered call IS, for the cause rule: a `command` (a shell call — its command text is known), a `helper` (an Agent /
 *  Task call: its own calls run under this session's token), anything `other` (a Read, an Edit, an MCP call). */
const CALL_KINDS = Object.freeze(['command', 'helper', 'other']);
/** lane touch-chip-cause r2: the TOOLS whose call is a `helper` — another agent running under this session's token
 *  (claude's Agent / Task, codex's Sub-agent card): classified by the tool's NAME, never by an input field (a WebFetch
 *  carries a `prompt` and runs nothing). */
const HELPER_TOOLS = Object.freeze(['Agent', 'Task', 'Sub-agent']);
/** lane touch-chip-cause r3: WHAT RUNS NOTHING ELSE — ONE table, three families: the SHELL's own builtins that run no
 *  other program (`set -e`, `[[ … ]]`, `export X=1`, `read`, `cd` …), the tools that read or write FILES and run nothing
 *  (cat / grep / jq / git over files …), and the product's own STATUS CLIs (the owner's `vibespace-status working
 *  --reason …`). A shell call made only of these (or of `command -v` lookups) could not have run the channels CLI, so it
 *  is never a lone call's cause; any other word (a script, an interpreter, a shell's script file, an unknown program)
 *  could have. INERT_COMMANDS is DERIVED from it. */
const RUNS_NOTHING = Object.freeze({
  builtins: Object.freeze([':', 'true', 'false', 'set', 'unset', 'export', 'local', 'declare', 'typeset', 'readonly', 'read', 'shift', 'let', 'cd', 'pwd',
    'pushd', 'popd', 'dirs', 'echo', 'printf', 'test', '[', '[[', 'type', 'hash', 'umask', 'wait', 'return', 'exit', 'break', 'continue', 'shopt', 'alias',
    'unalias', 'getopts']),
  files: Object.freeze(['sleep', 'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'jq', 'sort', 'uniq', 'cut', 'tr', 'tee', 'date', 'mkdir', 'touch', 'cp', 'mv',
    'rm', 'ln', 'stat', 'diff', 'basename', 'dirname', 'realpath', 'which', 'git']),
  product: Object.freeze(['vibespace-status', 'vibespace-task', 'vibespace-msg', 'vibespace-ask', 'vibespace-feedback', 'vibespace-docs']),
});
const INERT_COMMANDS = Object.freeze([...RUNS_NOTHING.builtins, ...RUNS_NOTHING.files, ...RUNS_NOTHING.product]);
/** lane touch-chip-cause r3: the queue chip states that mean «inside the RUNNING turn» — DERIVED from the chip table
 *  (src/queue-chips.js, the harness contract the renderer draws): a bubble wearing one never starts a turn where it was
 *  typed. */
const MID_TURN_QUEUE = require('./queue-chips.js').IN_TURN_STATES;
/** lane touch-chip-cause: a chip in a one-line strip keeps the account and at least this many code points of its title
 *  (the owner's screenshot: ten chips squeezed to «Lar…» / «Gm…»). */
const READABLE_TITLE_CHARS = 12;
/** lane touch-chip-cause r2: a strip's FIRST chip gives its name down to this many code points + «…» before the fold
 *  control leaves the line (a long account label at phone width — the control is never clipped). */
const TIGHT_NAME_CHARS = 6;
/** One search records at most this many conversations (by hits) — a search is one card, not a ring flush. */
const SEARCH_MAX_CONVS = 20;
/** A search touch keeps at most this many hit refs per conversation ({msgId, at} — never the words), the newest. */
const SEARCH_HITS_MAX = 50;
/** What was searched, at most this long (the agent's query — the dialog opens pre-filled with it). */
const QUERY_MAX = 200;
const TITLE_MAX = 200;
const LABEL_MAX = 120;
const ID_MAX = 300;
/** Where a drafted reply lands (2026-09-28) — the outbox policy's closed set (src/channel-policy.js PLACEMENTS; this
 *  module imports nothing, so test-channel-placement pins the two spellings equal). The row says it in words. */
const TOUCH_PLACEMENTS = Object.freeze(['chat', 'quote', 'thread', 'thread+chat']);

const str = (v, max) => {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/[\r\n\t]+/g, ' ');
  return s.length > max ? s.slice(0, max) : s;
};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The conversation a touch is about: `<adapter>/<conv>`, or `<account>/~compose/<proposal>` for a message not yet sent. */
function touchKey(t) {
  if (!t) return '';
  if (t.convId) return `${t.adapterId}/${t.convId}`;
  if (t.op === 'api') return `${t.adapterId}/~api/${t.id || t.at || ''}`;   // B-2198: one row per raw API call
  if (t.op === 'connect') return `${t.adapterId}/~connect`;   // lane pod-oauth-callback: one row per account type asked for
  return `${t.adapterId}/~compose/${t.proposalId || t.id || ''}`;
}

/** A vendor search's memo scope as a touch keeps it (src/channel-search.js `isMemoScope` — the same closed shape). */
const memoOk = (m) => typeof m === 'string' && (m === 'all' || /^set:\d{1,7}:[0-9a-f]{1,8}$/.test(m));
/** A search's hit refs, bounded: {msgId, at} only (the row re-reads the words at open), one per message, the newest
 *  SEARCH_HITS_MAX. */
function hitRefs(list) {
  const by = new Map();
  for (const h of Array.isArray(list) ? list : []) {
    const msgId = h && h.msgId ? str(h.msgId, ID_MAX) : '';
    if (msgId && !by.has(msgId)) by.set(msgId, { msgId, at: num(h.at) });
  }
  return [...by.values()].sort((a, b) => b.at - a.at).slice(0, SEARCH_HITS_MAX);
}
/** The ONE touch record (bounded strings; null when it names no op or no account). The witness makes the
 *  strings frame-inert BEFORE it calls this (src/channel-record.js inertFrames — this module imports nothing). */
function normalizeTouch(x) {
  if (!x || typeof x !== 'object') return null;
  const op = String(x.op || '');
  if (!OPS.includes(op)) return null;
  const adapterId = str(x.adapterId, ID_MAX);
  if (!adapterId) return null;
  const convId = x.convId ? str(x.convId, ID_MAX) : null;
  const proposalId = x.proposalId ? str(x.proposalId, ID_MAX) : null;
  if (!convId && op !== 'compose' && op !== 'api' && op !== 'connect') return null;   // only a message not yet sent (or a raw API call — B-2198, or an account type to connect — lane pod-oauth-callback) has no conversation
  const at = num(x.at);
  if (!(at > 0)) return null;
  return {
    id: str(x.id, 80) || null,
    op, adapterId, convId, proposalId,
    title: str(x.title, TITLE_MAX),
    account: str(x.account, LABEL_MAX),
    kind: str(x.kind, 40) || null,
    ...(GLYPHS.includes(x.icon) ? { icon: x.icon } : {}),
    count: Math.max(0, Math.floor(num(x.count))),
    ...(op === 'api' && x.trust === 'write-all' ? { trust: 'write-all' } : {}),   // a sensitive call that ran under 完全信任
    // lane channel-threads: the emoji a `react` touch proposed (a glyph ≤ 16 units, or `:key:`) — the row says it
    ...(op === 'react' && x.glyph ? { glyph: str(x.glyph, 70) } : {}),
    // 2026-09-28: where a drafted reply lands (a value outside the closed set is dropped, never printed)
    ...(op === 'reply' && TOUCH_PLACEMENTS.includes(x.placement) ? { placement: x.placement } : {}),
    // lane channel-search-view (.212): a search remembers WHAT was searched — the query + bounded hit refs
    ...(op === 'search' && x.query ? { query: str(x.query, QUERY_MAX), hits: hitRefs(x.hits), ...(memoOk(x.memo) ? { memo: x.memo } : {}) } : {}),
    // lane touch-chip-cause: who caused it (a value outside the closed set is dropped — the record reads as an old one)
    ...(CAUSES.includes(x.cause) ? { cause: x.cause } : {}),
    at,
  };
}

/** Append to a ring IN PLACE: a repeat of the newest touch's op + conversation inside MERGE_MS folds into it
 *  (counts summed, its instant moved, its id kept); the ring keeps the newest RING_MAX.
 *  @returns {{touch, merged}} — the touch as stored (the one to broadcast). */
function appendTouch(ring, t, { mergeMs = MERGE_MS, max = RING_MAX } = {}) {
  const last = ring.length ? ring[ring.length - 1] : null;
  if (last && last.op === t.op && touchKey(last) === touchKey(t) && causeOf(last) === causeOf(t) && t.at >= last.at && t.at - last.at < mergeMs) {
    last.count = num(last.count) + num(t.count);
    last.at = t.at;
    if (t.title) last.title = t.title;
    if (t.account) last.account = t.account;
    if (t.placement) last.placement = t.placement;
    if (t.query) { last.hits = hitRefs([...(t.hits || []), ...(last.query === t.query ? last.hits || [] : [])]); last.query = t.query; if (t.memo) last.memo = t.memo; else delete last.memo; }   // the same search again: refs united; another: the newest
    return { touch: last, merged: true };
  }
  ring.push(t);
  if (ring.length > max) ring.splice(0, ring.length - max);
  return { touch: t, merged: false };
}

/** Upsert by id (the client's copy of the ring: a merged touch arrives again under its id). The copy keeps the
 *  newest `max` like the server's ring (channel-jump verify r4 — measured: an agent reading two conversations in
 *  turn is a FRESH touch per read, and the client's list grew by every one for the window's life while the server
 *  kept 200; the oldest by instant fall off). */
function upsertTouch(list, t, { max = RING_MAX } = {}) {
  const i = t && t.id ? list.findIndex((x) => x && x.id === t.id) : -1;
  if (i >= 0) list[i] = t; else list.push(t);
  if (list.length > max) {
    list.sort((a, b) => (Number(a && a.at) || 0) - (Number(b && b.at) || 0));
    list.splice(0, list.length - max);
  }
  return list;
}

const CLI = 'vibespace-channels';
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
/** words after which the next word is again a command word */
const OPENERS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}', 'fi', 'done', 'esac']);
/** words that open a construct whose words are data (`for c in …`) */
const DATA_HEADS = new Set(['for', 'case', 'select', 'function']);
/** wrappers that run their operand as a command — the options that take an argument (skipped with it). r3: + command
 *  (`command -v` / `-V` is a LOOKUP — it runs nothing), exec -a, time -p (the shell's keyword and /usr/bin/time), strace,
 *  ltrace, ionice */
const WRAPPERS = new Map([['exec', ['-a']], ['env', ['-u', '-C', '-S']], ['sudo', ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U']], ['doas', ['-u']],
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
/** The scanner reads this many characters as shell; anything after (and an unclosed heredoc's body) is BLIND text — r3:
 *  never inert, and the CLI's name in it counts (fail toward «could run», never toward «runs nothing»). */
const SCAN_MAX = 8192;
/** the CLI's NAME in blind text (a cut-off scan, an unclosed heredoc) — and its verb */
const CLI_NAME_RE = /(^|[\s;&|(`'"=/])vibespace-channels(?:\s+([A-Za-z][\w-]*))?/g;

/** The closing index of a `$(` / `${` / backtick span opening at `i` (quotes inside honoured), or the end. */
function spanEnd(s, i, open, close) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') { j++; continue; }
    if (ch === "'" && open !== '`') { const k = s.indexOf("'", j + 1); if (k < 0) return s.length; j = k; continue; }
    if (ch === '"' && open !== '`') { for (j++; j < s.length && s[j] !== '"'; j++) if (s[j] === '\\') j++; continue; }
    if (open === '`') { if (ch === '`' && j > i) return j; continue; }
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
 *  `words.herestrings`; a # comment (at a word's start) and a redirection's target are no words. PURE, bounded: SCAN_MAX
 *  characters, nesting 4 — the rest (and an unclosed heredoc's body) is returned as `blind` text. */
function shellCommands(src, owner = null, depth = 0, offset = 0) {
  const all = String(src || '');
  const s = all.length > SCAN_MAX ? all.slice(0, SCAN_MAX) : all;
  const out = [];
  out.blind = all.length > SCAN_MAX ? [all.slice(SCAN_MAX)] : [];
  if (depth > 4) { out.blind.push(s); return out; }
  let words = [], pending = [], redirect = false, pipe = null;
  const end = () => { const c = words.length ? { words, owner, src: s, pipeFrom: pipe } : null; if (c) out.push(c); words = []; pipe = null; return c; };
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
          if (s[j] === '$' && s[j + 1] === '(' && s[j + 2] === '(') { j = spanEnd(s, j + 1, '(', ')'); v += '$(())'; continue; }
          if (s[j] === '$' && s[j + 1] === '(') { const e = spanEnd(s, j + 1, '(', ')'); nested(s.slice(j + 2, e), at); v += '$()'; j = e; continue; }
          if (s[j] === '`') { const e = spanEnd(s, j, '`', '`'); nested(s.slice(j + 1, e), at); v += '$()'; j = e; continue; }
          v += s[j];
        }
        i = j + 1; q = true;
        continue;
      }
      if (ch === '$' && s[i + 1] === '(' && s[i + 2] === '(') { const e = spanEnd(s, i + 1, '(', ')'); v += '$(())'; i = e + 1; continue; }
      if (ch === '$' && s[i + 1] === '(') { const e = spanEnd(s, i + 1, '(', ')'); nested(s.slice(i + 2, e), at); v += '$()'; i = e + 1; continue; }
      if (ch === '$' && s[i + 1] === '{') { const e = spanEnd(s, i + 1, '{', '}'); v += s.slice(i, e + 1); i = e + 1; continue; }
      if (ch === '`') { const e = spanEnd(s, i, '`', '`'); nested(s.slice(i + 1, e), at); v += '$()'; i = e + 1; continue; }
      v += ch;
      i++;
    }
    return { v, at, end: i, q };
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\n') {
      end();
      i++;
      for (const h of pending) {   // the heredoc's lines: up to the delimiter line
        const lines = [];
        let closed = false;
        while (i < s.length) {
          let j = s.indexOf('\n', i);
          if (j < 0) j = s.length;
          const line = s.slice(i, j);
          i = j + 1;
          if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) { closed = true; break; }
          lines.push(line);
        }
        const body = lines.join('\n');
        (h.words.heredocs || (h.words.heredocs = [])).push(body);
        if (!closed) out.blind.push(body);   // an UNCLOSED heredoc (or one the cut ended) — its body is blind text
        else if (!h.quoted) substitutions(body, h.at);
      }
      pending = [];
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
    if (ch === '\\' && s[i + 1] === '\n') { i += 2; continue; }
    if (ch === '#') { while (i < s.length && s[i] !== '\n') i++; continue; }   // a word's start: a comment to the line's end
    if (ch === '&' && s[i + 1] === '>') { i += s[i + 2] === '>' ? 3 : 2; redirect = true; continue; }
    if (ch === '(' && s[i + 1] === '(' && !words.length) { i = spanEnd(s, i, '(', ')') + 1; continue; }   // `(( … ))` arithmetic
    if (ch === '|' && s[i + 1] === '&') { pipe = end(); redirect = false; i += 2; continue; }   // `|&`: a pipe (stderr too)
    if (';&|()'.includes(ch)) {
      const two = (ch === '&' || ch === '|' || ch === ';') && s[i + 1] === ch;
      const c = end();
      if (c && ch === '&' && !two) c.words.bg = true;   // `cmd &` — sent to the background
      if (ch === '|' && !two) pipe = c;
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
    words.push(w);
  }
  end();
  for (const h of pending) { (h.words.heredocs || (h.words.heredocs = [])).push(''); out.blind.push(''); }   // a heredoc with no line after it
  return out;
}

/** One simple command's COMMAND WORD — `{base, k}` (base = the word after its last `/`): leading assignments, openers
 *  (do / then / ! / { …) and wrappers with their options (env X=1, sudo -u x, timeout 60, xargs -n1, nohup, exec -a n,
 *  command, time -p, strace -f …) skipped; `lookup` for `command -v` / `-V` (it runs nothing); null when there is none, or
 *  when the command is a construct whose words are data (`for c in …`). */
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
 *  watch / parallel), a `find -exec`'s command (each nested one owned by the word that runs it): `[{base, at, verb,
 *  bg?, lookup?}]` + `blind` (text the scan could not read: a cut-off tail, an unclosed heredoc). PURE. */
function commandsRun(cmd, owner = null, depth = 0, offset = 0) {
  const cmds = shellCommands(cmd, owner, depth, offset);
  const out = [];
  out.blind = cmds.blind.slice();
  const add = (list, bg) => { for (const x of list) out.push(bg ? { ...x, bg: true } : x); for (const b of list.blind) out.blind.push(b); };
  const run = (c, words, cw, at, bg) => {
    if (cw.lookup) { out.push({ base: cw.base, at, verb: '', lookup: true }); return; }
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
    out.push({ base: cw.base, at, verb: words[cw.k + 1] ? words[cw.k + 1].v : '', ...(bg ? { bg: true } : {}) });
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

/** The CLI's runs in a commandsRun result — its command words, then its NAME in blind text (`unseen`: a cut-off scan
 *  never proves the name is prose). */
function cliRuns(ran) {
  const out = ran.filter((x) => x.base === CLI).map(({ at, verb }) => ({ at, verb }));
  for (const b of ran.blind) for (const m of b.matchAll(CLI_NAME_RE)) out.push({ at: -1, verb: m[2] || '', unseen: true });
  return out;
}

/** lane touch-chip-cause r2: WHERE A COMMAND LINE RUNS THE CHANNELS CLI — `[{at, verb}]`, the CLI as a COMMAND WORD
 *  (the line's start, after ; && || | ( `$(` `<(` a newline, then / do, after a wrapper — env X=… / sudo … / exec -a n /
 *  timeout N / xargs … / command / time -p / strace …; inside a shell's script, eval / watch / parallel's, a find -exec;
 *  quotes removed, a path before the name kept): `at` = the index of the word that runs it (for a quoted `bash -c` string,
 *  the shell's word; a re-joined argv's script, its own word), `verb` = its first argument. The name inside a quoted
 *  argument (`--reason "… vibespace-channels read …"`, `$'…'`), a comment, a quoted heredoc's data or another command's
 *  argument (`grep vibespace-channels`) is prose; in BLIND text (r3: past SCAN_MAX, an unclosed heredoc) the name counts
 *  (`unseen`, `at` -1). PURE. */
function channelsRuns(cmd) { return cliRuns(commandsRun(cmd)); }

/** Does a shell call run the agent's channels CLI? (the renderer's holder gate — harness-neutral: the command TEXT, the
 *  CLI as a command word since round 2). */
function commandTouchesChannels(cmd) { return channelsRuns(cmd).length > 0; }

/** r3: does one run (of commandsRun) run NOTHING ELSE? — a lookup (`command -v`), or a word of RUNS_NOTHING. */
const inertRun = (x) => !!x.lookup || INERT_COMMANDS.includes(x.base);
/** r3: does a command line send work to the BACKGROUND that outlives the call — a non-inert command ended by `&`, or a
 *  `vibespace-job run` / `start`? */
const backgrounds = (ran) => ran.some((x) => (x.bg && !inertRun(x)) || (x.base === 'vibespace-job' && (x.verb === 'run' || x.verb === 'start')));

/** lane touch-chip-cause r2: a command line every command word of which RUNS NOTHING ELSE (RUNS_NOTHING) — it could not
 *  have run the CLI. An empty line runs nothing; r3: a line with BLIND text (cut off, an unclosed heredoc) could run. */
function runsNothing(cmd) { const ran = commandsRun(cmd); return !ran.blind.length && ran.every(inertRun); }

/** r3: the verbs a HELPER's prompt names — the CLI's name + its verb as a PHRASE («run vibespace-channels search
 *  "pairing review"»), never a command-word scan of prose. */
const PROMPT_VERB_RE = /(?:^|[^\w-])vibespace-channels\s+([a-z][\w-]*)/g;
const promptVerbs = (s) => [...s.matchAll(PROMPT_VERB_RE)].map((m) => m[1]);
/** Does this call's command (or prompt) NAME the touch? The strongest evidence of which card a touch is. `runs` = the
 *  call's channelsRuns (the verb is read off the CLI's command word, never off prose); r3: a `helper` call's evidence is
 *  its prompt — the verb is read off the CLI's name + verb as a phrase there. */
function namesTouch(text, t, runs, kind) {
  const s = String(text || '');
  if (!s || !t) return false;
  if (t.convId && s.includes(`${t.adapterId}/${t.convId}`)) return true;
  if (t.proposalId && s.includes(t.proposalId)) return true;
  const verbs = kind === 'helper' ? promptVerbs(s) : (runs || channelsRuns(s)).map((r) => r.verb);
  if (t.op === 'search' && verbs.includes('search')) return true;
  if (t.op === 'compose' && verbs.includes('compose') && s.includes(t.adapterId)) return true;
  if (t.op === 'connect' && verbs.includes('connect') && s.includes(t.adapterId)) return true;   // lane pod-oauth-callback
  return false;
}

/** lane touch-chip-cause: the cause a record carries. A record with none was written before the cause existed — and
 *  every writer then was an agent verb (agent-routes touchChannel), so it is the agent's. */
function causeOf(t) { return t && CAUSES.includes(t.cause) ? t.cause : 'agent'; }
/** lane touch-chip-cause r2: what a rendered call IS (CALL_KINDS) — a `command` when it carries a command line; a `helper`
 *  when its TOOL NAME is one (HELPER_TOOLS) or the harness folds it as an agent card (codex's collab cards); else
 *  `other`. Never read off an input field (a WebFetch's `prompt`). */
function callKindOf({ name = '', collapseKind = null, command = '' } = {}) {
  if (command) return 'command';
  return HELPER_TOOLS.includes(String(name || '')) || collapseKind === 'agent' ? 'helper' : 'other';
}
/** THE LADDER'S FIRST RUNG — does this call NAME the touch, or run the CLI as a command word? A call with no `kind` (a
 *  caller that knows only the instants) is judged by the time rules alone, as before the cause rule. */
function callNames(c, t) {
  if (!c) return false;
  if (c.kind === undefined || c.kind === null) return true;
  const runs = c.runs || (c.kind === 'command' ? channelsRuns(c.text) : []);
  return runs.length > 0 || namesTouch(c.text, t, runs, c.kind);
}
/** THE SECOND RUNG — could this call have run ANYTHING? A shell call unless it is made only of INERT_COMMANDS (a script,
 *  an interpreter, a `bash -c` wrapper could run the CLI unseen); a helper. Never another tool (a Read, a WebFetch). */
function callCanRun(c) {
  if (!c) return false;
  if (c.kind === 'command') return !(typeof c.inert === 'boolean' ? c.inert : runsNothing(c.text));
  return c.kind !== 'other';
}
/** COULD THIS CALL HAVE CAUSED THIS TOUCH? (either rung) */
function callCauses(c, t) { return callNames(c, t) || callCanRun(c); }

/** lane touch-chip-cause r2: DOES THIS RECORD START A TURN? — the HARNESS's own turn facts first (r3): `turnStart` true
 *  = the record that began a turn (codex: the first record after `task_started`; claude live: the first record after a
 *  turn's `result` — a held message's DELIVERY, whatever record it is), false = it entered a running turn. Else the
 *  transcript's turn (the renderer's turnIndex): a user-role record that moved the turn on (`prev` = the record before
 *  it) — the person's message that opened it, a wake, a peer message delivered while idle. Never a record that entered
 *  a RUNNING turn — `midTurn` (marked where it ENTERS: a steer typed while the agent worked, a card the hub drew mid-turn,
 *  the transcript's queued_command), a queue chip that waits inside the turn (MID_TURN_QUEUE, derived from the chip
 *  table) — nor an attached page image. The view leaves a VibeSpace note row out unless it carries `turnStart`. */
function opensTurn(msg, prev) {
  if (!msg) return false;
  if (typeof msg.turnStart === 'boolean') return msg.turnStart;
  if (msg.role !== 'user' || msg.midTurn || msg.imageAttachment || MID_TURN_QUEUE.includes(msg.queueState)) return false;
  return !(prev && Number.isFinite(prev.turnIndex) && Number.isFinite(msg.turnIndex) && prev.turnIndex === msg.turnIndex);
}

/**
 * WHICH CARD EACH TOUCH BELONGS TO.
 * @param touches [{…touch}]
 * @param calls   [{id, start, end: number|null, text, kind, background, bgEnd}] — the view's tool cards in conversation
 *                order; `end` = the next non-tool message's instant (null: nothing after it yet); `kind` ∈ CALL_KINDS
 *                (callCauses); r3: `background` = the call's work outlives its card (Bash `run_in_background`, a helper
 *                sent to the background) — true / false when the caller knows, undefined when it does not; `bgEnd` = the
 *                instant its background work was seen to end (the task notification that names it), when known
 * @param opts    {tail: the view shows the conversation's newest message (r3: kept for callers — a call is a candidate
 *                while it runs or lingers, there is no tail rung), notes: [{id, at}] the view's VibeSpace note rows,
 *                turns: [instant] the instants turns start (opensTurn), skewMs, batchMs}
 * @returns {{byCall: Object<string, touch[]>, byNote: Object<string, touch[]>, unbound: touch[]}}
 */
const NO_RUNS = Object.freeze(Object.assign([], { blind: Object.freeze([]) }));
function bindToCall(touches, calls, { notes = [], turns = [], skewMs = SKEW_MS, batchMs = BATCH_MS } = {}) {
  const cs = (Array.isArray(calls) ? calls : [])
    .map((c, i) => {
      const kind = CALL_KINDS.includes(c.kind) ? c.kind : undefined, text = c.text || '';
      const ran = kind === 'helper' || kind === 'other' ? NO_RUNS : commandsRun(text);   // ONE scan per call: the CLI's runs, whether it runs nothing, whether it backgrounds
      const runs = cliRuns(ran);
      // r3: a call whose work OUTLIVES its card stays a candidate after the card returns, to its turn's end (or its seen
      // end): one the caller says is background, one whose command line sends a non-inert command to the background or
      // starts a vibespace-job — and, when the caller does not say (`background` undefined), one that ran the CLI
      const lingers = c.background === true || (kind !== undefined && (backgrounds(ran) || (c.background === undefined && runs.length > 0)));
      return { id: String(c.id), start: num(c.start), end: c.end === null || c.end === undefined ? null : num(c.end), text, kind, i,
        runs, inert: !ran.blind.length && ran.every(inertRun), lingers, bgEnd: num(c.bgEnd) > 0 ? num(c.bgEnd) : null };
    })
    .filter((c) => c.id && c.start > 0)
    .sort((a, b) => a.start - b.start || a.i - b.i);
  // the instant each call stops RUNNING: the next call outside its batch, or its own end, whichever is first
  for (let i = 0; i < cs.length; i++) {
    let stop = cs[i].end !== null && cs[i].end > cs[i].start ? cs[i].end : null;
    for (let j = i + 1; j < cs.length; j++) {
      if (cs[j].start > cs[i].start + batchMs) { stop = stop === null ? cs[j].start : Math.min(stop, cs[j].start); break; }
    }
    cs[i].stop = stop;
  }
  // lane touch-chip-cause: THE TURN'S NOTE ROW — the newest VibeSpace note of the touch's own TURN: at (or a skew after)
  // the touch, and no turn starts between them (r2: the skew window never crosses a turn — the NEXT turn's note a
  // moment after this turn's last touch is not its note; a note may precede its own turn's start by the skew)
  const ns = (Array.isArray(notes) ? notes : []).map((n) => ({ id: String(n && n.id), at: num(n && n.at) })).filter((n) => n.id && n.at > 0).sort((a, b) => a.at - b.at);
  const us = (Array.isArray(turns) ? turns : []).map(num).filter((v) => v > 0);
  // r3: a call never causes a touch of ANOTHER turn — a turn starts between the call's start and the touch
  const crossesTurn = (from, to) => { const lo = Math.min(from, to), hi = Math.max(from, to); return us.some((u) => u > lo && u <= hi); };
  const noteFor = (at) => {
    for (let k = ns.length - 1; k >= 0; k--) {
      const n = ns[k];
      if (n.at > at + skewMs) continue;
      const crosses = n.at > at ? us.some((u) => u > at && u <= n.at + skewMs) : us.some((u) => u > n.at + skewMs && u <= at);
      if (!crosses) return n;
      if (n.at <= at) return null;
    }
    return null;
  };
  const byCall = {};
  const byNote = {};
  const unbound = [];
  for (const t of Array.isArray(touches) ? touches : []) {
    if (!t) continue;
    const at = num(t.at);
    let pick = null;
    if (causeOf(t) === 'agent') {
      // the CANDIDATES (r3): a call RUNNING at the touch (from its start, to its stop + the skew — a call that ended more
      // than the skew before the touch is not its cause) and a call that LINGERS (its work outlives its card) — each of
      // the touch's own turn
      const running = [], lingering = [];
      for (const c of cs) {
        if (crossesTurn(c.start, at)) continue;
        if (c.start - skewMs <= at && (c.stop === null || at < c.stop + skewMs)) running.push(c);
        else if (c.lingers && c.start <= at && (c.bgEnd === null || at < c.bgEnd + skewMs)) lingering.push(c);
      }
      // ① a candidate whose command (a helper: its prompt) NAMES the touch — its conversation, its proposal, its verb —
      // the latest; else, nothing lingering: a RUNNING call that runs the CLI as a command word (a caller's kindless call:
      // the time rules alone), the latest
      const cand = new Set([...running, ...lingering]);
      const exact = cs.filter((c) => cand.has(c) && namesTouch(c.text, t, c.runs, c.kind));
      const named = lingering.length ? [] : running.filter((c) => callNames(c, t));
      if (exact.length) pick = exact[exact.length - 1];
      else if (named.length) pick = named[named.length - 1];
      else if (!lingering.length && running.length === 1 && callCanRun(running[0])) {
        // ② the ONE candidate — a LONE running call that could have run anything (a script, an interpreter, a wrapper, a
        // helper), nothing lingering beside it
        pick = running[0];
      }
      // ③ several candidates and none naming it (a background producer + a foreground stranger), or a lone call that runs
      // nothing: the note row below; ④ no note in the turn: the chip
    }
    if (pick) { (byCall[pick.id] || (byCall[pick.id] = [])).push(t); continue; }
    const note = noteFor(at);
    if (note) (byNote[note.id] || (byNote[note.id] = [])).push(t);
    else unbound.push(t);
  }
  return { byCall, byNote, unbound };
}

/** One ROW per conversation: ops counted, replied / composed first, then by the last touch (newest first). */
function foldTouches(touches) {
  const rows = new Map();
  for (const t of Array.isArray(touches) ? touches : []) {
    if (!t || !OPS.includes(t.op)) continue;
    const key = touchKey(t);
    let r = rows.get(key);
    if (!r) {
      r = { key, adapterId: t.adapterId, convId: t.convId || null, proposalId: t.proposalId || null, title: '', account: '', kind: t.kind || null, icon: t.icon || null, ops: Object.fromEntries(OPS.map((o) => [o, 0])), readCalls: 0, calls: 0, first: num(t.at), last: 0, lastAt: {} };
      rows.set(key, r);
    }
    const at = num(t.at);
    r.calls += 1;
    r.ops[t.op] += t.op === 'read' || t.op === 'search' ? Math.max(t.op === 'search' ? 1 : 0, num(t.count)) : 1;
    if (t.op === 'read') r.readCalls += 1;
    if (at >= r.last) {
      r.last = at;
      if (t.title) r.title = t.title;
      if (t.account) r.account = t.account;
      if (t.kind) r.kind = t.kind;
      if (t.proposalId) r.proposalId = t.proposalId;
      if (t.op === 'api') { if (t.trust) r.trust = t.trust; else delete r.trust; }
      if (t.glyph) r.glyph = t.glyph;
      if (t.placement) r.placement = t.placement;
    } else {
      if (!r.title && t.title) r.title = t.title;
      if (!r.account && t.account) r.account = t.account;
    }
    if (t.op === 'search' && t.query && at >= num(r.lastAt.search)) { r.query = t.query; r.hits = Array.isArray(t.hits) ? t.hits : []; if (t.memo) r.memo = t.memo; else delete r.memo; }
    if (at < r.first) r.first = at;
    r.lastAt[t.op] = Math.max(num(r.lastAt[t.op]), at);
  }
  const drafted = (r) => DRAFT_OPS.some((o) => r.ops[o] > 0);
  return [...rows.values()].sort((a, b) => (drafted(b) - drafted(a)) || (b.last - a.last) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** lane chat-proposal-card (the owner, 2026-10-23: 「最下面那个是 outbox 请求吗？我视觉上完全看不出来啊」): THE PROPOSALS
 *  ONE CALL FILED — its touches of a FILED_OPS op that carry a proposal id, once per id, in the order filed, each with
 *  the row it belongs to (`key` = touchKey: the conversation, or the composed message's own key). PURE. */
function filedProposals(touches) {
  const out = [], seen = new Set();
  const list = (Array.isArray(touches) ? touches : []).filter((t) => t && FILED_OPS.includes(t.op) && t.proposalId).slice().sort((a, b) => num(a.at) - num(b.at));
  for (const t of list) {
    const id = String(t.proposalId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, key: touchKey(t), op: t.op, at: num(t.at) });
  }
  return out;
}

/** The fold: the first `max` rows shown, the rest counted behind "+N more" (all shown when expanded). */
function foldView(rows, { max = FOLD_SHOWN, expanded = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (expanded || list.length <= max) return { shown: list.slice(), hidden: 0 };
  return { shown: list.slice(0, max), hidden: list.length - max };
}

/** WHAT A ROW'S CLICK OPENS: a composed message not yet sent ⇒ the Outbox; a row whose NEWEST op is a search that
 *  carries its query ⇒ the search results scoped to that conversation (the agent's query, its hit refs); anything
 *  else (a read, a reply, a search recorded before the query was kept) ⇒ the conversation, as before. */
function openVerdict(row) {
  if (!row) return null;
  // lane pod-oauth-callback: the agent asked the person to connect an account type ⇒ the Connect dialog on that type
  if (!row.convId && row.ops && row.ops.connect && String(row.key || '').endsWith('/~connect')) return { open: 'connect', kind: row.kind || row.adapterId };
  if (!row.convId) return { open: 'outbox' };
  const la = row.lastAt || {};
  const newest = Math.max(0, ...Object.values(la).map(num));
  if (row.query && num(la.search) >= newest) return { open: 'search', adapterId: row.adapterId, convId: row.convId, title: row.title || row.convId, query: row.query, hits: Array.isArray(row.hits) ? row.hits : [], memo: memoOk(row.memo) ? row.memo : null, searchedAt: num(la.search) };
  return { open: 'conversation', adapterId: row.adapterId, convId: row.convId };
}
/** WHAT THE FOLD'S TAIL ("+N more") OPENS: every hidden row a search of ONE query ⇒ that search UNSCOPED (every
 *  conversation, grouped by conversation) over the accounts its rows name; anything else ⇒ the fold expands. */
function tailVerdict(rows, { max = FOLD_SHOWN } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const hidden = list.slice(max).map(openVerdict);
  if (!hidden.length || hidden.some((v) => !v || v.open !== 'search' || v.query !== hidden[0].query)) return { open: 'expand' };
  const q = hidden[0].query;
  const same = list.map(openVerdict).filter((v) => v && v.open === 'search' && v.query === q);
  const adapterIds = [...new Set(same.map((v) => v.adapterId))];
  // lane search-card-open: ONE vendor search's rows name one memo scope — the unscoped dialog reads it first
  const memos = [...new Set(same.map((v) => v.memo).filter(Boolean))];
  return { open: 'search-all', query: q, adapterIds, ...(memos.length === 1 && adapterIds.length === 1 ? { memo: memos[0], searchedAt: Math.max(0, ...same.map((v) => num(v.searchedAt))) } : {}) };
}
/** A row's words ("drafted a reply · read 12 messages"), in OPS order, through the injected `t`. */
function rowWords(row, t) {
  const o = (row && row.ops) || {};
  const out = [];
  if (o.reply) out.push(o.reply === 1 ? replyWords(row && row.placement, t) : t('drafted {n} replies', { n: o.reply }));
  if (o.compose) out.push(o.compose === 1 ? t('wrote a new message') : t('wrote {n} new messages', { n: o.compose }));
  if (o.react) out.push(o.react === 1 && row.glyph ? t('reacted {glyph}', { glyph: row.glyph }) : t('proposed {n} reactions', { n: o.react }));
  if (o.recall) out.push(o.recall === 1 ? t('proposed taking back your message') : t('proposed taking back {n} of your messages', { n: o.recall }));
  if (o.read || row.readCalls) out.push(o.read === 1 ? t('read 1 message') : t('read {n} messages', { n: o.read || 0 }));
  if (o.search) out.push(o.search === 1 ? t('1 search hit') : t('{n} search hits', { n: o.search }));
  if (o.refresh) out.push(t('refreshed'));
  if (o.request) out.push(t('asked for access'));
  if (o.status) out.push(t('checked its draft'));
  if (o.api) out.push(row.proposalId ? t('API call {call} · awaiting you', { call: row.title }) : row.trust === 'write-all' ? t('API call {call} · Full trust · sensitive', { call: row.title }) : t('API call {call}', { call: row.title }));
  if (o.connect) out.push(t('Connect {type} — sign in so the assistant can use it', { type: row.account || row.kind || row.adapterId }));   // lane pod-oauth-callback
  return out.join(' · ');
}

/** ONE drafted reply, with where it lands (2026-09-28): a plain message, a quote, a reply in a thread (+ also in the
 *  chat); a touch from before the placement said "drafted a reply" and still does. */
function replyWords(placement, t) {
  switch (placement) {
    case 'chat': return t('drafted a message');
    case 'quote': return t('drafted a quoted reply');
    case 'thread': return t('drafted a reply in a thread');
    case 'thread+chat': return t('drafted a reply in a thread, also shown in the chat');
    default: return t('drafted a reply');
  }
}

/** The row's name: `account › title` (the title alone when the account is unknown). */
function rowName(row) {
  const title = (row && (row.title || row.convId)) || '';
  if (!title) return (row && row.account) || '';   // lane pod-oauth-callback: a connect row names its account type alone
  return row && row.account ? `${row.account} › ${title}` : title;
}

/** lane touch-chip-cause: THE READABLE MINIMUM of a row drawn as a chip — how many UTF-16 units of `rowName(row)` a
 *  one-line strip may never cut: the account and its ` › ` whole, then the first `chars` code points of the title (the
 *  whole name when it is shorter, or when there is no title). The view measures that prefix's width. */
function readableCut(row, chars = READABLE_TITLE_CHARS) {
  const name = rowName(row);
  const title = (row && (row.title || row.convId)) || '';
  if (!title) return name.length;
  const head = row && row.account ? name.length - title.length : 0;
  return Math.min(name.length, head + [...title].slice(0, Math.max(0, chars)).join('').length);
}

/** lane touch-chip-cause r2: THE TIGHT CUT — how many UTF-16 units of `rowName(row)` a strip's first chip keeps when its
 *  readable minimum and the fold control do not fit one line: the first `chars` code points of the name (the account's,
 *  as it leads), + the «…» the view adds. The control has priority over chip 0. */
function tightCut(row, chars = TIGHT_NAME_CHARS) {
  const name = rowName(row);
  return Math.min(name.length, [...name].slice(0, Math.max(1, chars)).join('').length);
}

/** The library glyphs a row may wear — the adapter's DECLARED `caps.glyph` (lane dc-channels-blocks, C7). */
const GLYPHS = Object.freeze(['chat', 'mail', 'robot']);
/** Which library glyph a row wears: the row's `icon` (its adapter's declared caps.glyph, stamped by the witness);
 *  `chat` for anything else. */
function glyphFor(icon) {
  return GLYPHS.includes(icon) ? icon : 'chat';
}

/** THE CHIP: the touches of the CURRENT turn (at or after `turnAt`), folded; `latest` = the row of the newest
 *  touch. null when the turn touched nothing (the chip is not drawn). */
function chipView(touches, turnAt) {
  const since = num(turnAt);
  const mine = (Array.isArray(touches) ? touches : []).filter((x) => x && num(x.at) >= since);
  if (!mine.length) return null;
  const rows = foldTouches(mine);
  let newest = mine[0];
  for (const x of mine) if (num(x.at) >= num(newest.at)) newest = x;
  const latest = rows.find((r) => r.key === touchKey(newest)) || rows[0];
  return { rows, latest };
}
function chipText(view, t) {
  if (!view || !view.latest) return '';
  return `${t('Channels')} · ${view.latest.title || view.latest.convId || view.latest.account || ''}`;
}

/** THE REVERSE LINK's facts: per session, over its ring, the touches of ONE conversation key → the strongest op
 *  (a draft outranks a read) and the newest instant. null when the session never touched it. */
function sessionSummary(ring, key) {
  let op = null, at = 0, n = 0;
  for (const x of Array.isArray(ring) ? ring : []) {
    if (!x || touchKey(x) !== key) continue;
    n++;
    if (num(x.at) > at) at = num(x.at);
    if (!op || OPS.indexOf(x.op) < OPS.indexOf(op)) op = x.op;
  }
  return n ? { op, at, n } : null;
}
/** The reverse link's word for a summary's op. */
function touchedByWords(s, t, now) {
  const ago = agoText(num(now) - num(s && s.at), t);
  const name = (s && s.name) || t('an agent');
  if (s && DRAFT_OPS.includes(s.op)) return t('Drafted by {name} · {ago}', { name, ago });
  if (s && s.op === 'request') return t('Access asked by {name} · {ago}', { name, ago });
  return t('Read by {name} · {ago}', { name, ago });
}

/** `just now` / `12 min ago` / `5 h ago` / `3 d ago` (the existing keys). */
function agoText(ms, t) {
  const s = Math.max(0, num(ms) / 1000);
  if (s < 60) return t('just now');
  if (s < 5400) return t('{n} min ago', { n: Math.round(s / 60) });
  if (s < 172800) return t('{n} h ago', { n: Math.round(s / 3600) });
  return t('{n} d ago', { n: Math.round(s / 86400) });
}

/** A search's answer → the touches it records: one per conversation (hits counted), the SEARCH_MAX_CONVS with the
 *  most hits. `results` = the engine's `searchFor` rows ({adapterId, adapter, convId, title, vendorId, at}); `query` =
 *  what was searched (kept on each touch with ≤ SEARCH_HITS_MAX hit refs — the row opens the search results). */
function searchTouches(results, { max = SEARCH_MAX_CONVS, query = '', memo = null } = {}) {
  const q = String(query || '').trim();
  const by = new Map();
  for (const r of Array.isArray(results) ? results : []) {
    if (!r || !r.adapterId || !r.convId) continue;
    const k = `${r.adapterId}/${r.convId}`;
    const x = by.get(k) || { op: 'search', adapterId: r.adapterId, convId: r.convId, title: r.title || '', account: r.adapter || '', count: 0, ...(q ? { query: q, hits: [], ...(memoOk(memo) ? { memo } : {}) } : {}) };
    x.count += 1;
    if (x.hits && r.vendorId && x.hits.length < SEARCH_HITS_MAX) x.hits.push({ msgId: r.vendorId, at: num(r.at) });   // the rows come newest first
    by.set(k, x);
  }
  return [...by.values()].sort((a, b) => b.count - a.count).slice(0, max);
}

module.exports = {
  OPS, DRAFT_OPS, FILED_OPS, RING_MAX, MERGE_MS, SKEW_MS, BATCH_MS, FOLD_SHOWN, SEARCH_MAX_CONVS, SEARCH_HITS_MAX, QUERY_MAX, TITLE_MAX, LABEL_MAX, TOUCH_PLACEMENTS,
  CAUSES, CALL_KINDS, READABLE_TITLE_CHARS, causeOf, callCauses, readableCut,
  HELPER_TOOLS, INERT_COMMANDS, MID_TURN_QUEUE, TIGHT_NAME_CHARS, shellCommands, channelsRuns, runsNothing, callKindOf, callNames, callCanRun, opensTurn, tightCut,
  RUNS_NOTHING, SCAN_MAX, WRAPPERS, SCRIPT_RUNNERS, commandsRun,
  touchKey, normalizeTouch, appendTouch, upsertTouch, commandTouchesChannels, namesTouch, bindToCall, foldTouches, filedProposals, foldView, rowWords, replyWords, rowName,
  GLYPHS, glyphFor, chipView, chipText, sessionSummary, touchedByWords, agoText, searchTouches, hitRefs, openVerdict, tailVerdict,
};
