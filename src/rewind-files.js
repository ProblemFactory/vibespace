'use strict';
// PURE: THE FILES TIER'S DECISIONS (row B-437e, the files tier, U2's pure part — 主开发 r1080 (B), (C), (7); lane lg-rewind,
// 2026-11-21). «Rewind to here» keeps ONE confirm; inside it three choices — the conversation only (tier one), the files only,
// both — and the files choices are drawn ONLY where they can work: the conversation's own facts say its checkpoints are on AND
// its dry run listed files it can name (absent otherwise, never a greyed choice with a hint).
//
// THE CLAUDE ANSWER (read from the installed 2.1.322 binary as bytes — nothing run; its capture is
// scripts/fixtures/claude-cli/<version>-rewind-files.json, written by scripts/measure-claude-rewind-files.mjs):
//   the control request `rewind_files {user_message_id, dry_run}` (the person's message as the CLI knows it: its record uuid)
//   · a DRY RUN always answers success: {canRewind: true, filesChanged: [path], insertions, deletions} — or {canRewind: false,
//     error}. Its list does NOT say which files go back and which are DELETED (a file created after the message).
//   · a PRESS answers success {canRewind: true, skippedLinks: <a count>} — or the control's ERROR reply with the CLI's words;
//     a press where SOME files failed and some were put back answers success (the CLI says nothing of the failed ones)
//   the CLI's words (our local session gets them as they are): «File rewinding is not enabled.» · «No file checkpoint found for
//   this message.» · «Failed to rewind: …» (all failed: «… No files were restored: …»; mid-way: some may be back)
// It puts back ONLY what its own checkpoints hold: the files its file tools changed after that message; what its commands
// changed is not. The confirm says that in its own words.
//
// THE PERSON'S OWN LATER EDIT (C): the CLI puts back all or nothing, so no file can be left out and a refusal would be a dead
// end. The press stays the person's, INFORMED: each listed file is judged (changedAfterOf), and when any is not plainly «same»
// the choice drawn as selected is «the conversation only» (defaultChoiceOf). THE LAW (主开发 r1232): «same» is said ONLY where
// the records PROVE that nothing but the agent's own write touched the file since its backup's moment; where they cannot,
// «could not be checked». THE BACKUP'S MOMENT: the capture does not state it (it was not asked) — so the STRICTER reading is
// taken: a file the agent edited before the target may have been backed up AT the target's message, and a person's edit after
// that message would then be lost. «same» therefore needs ALL of: the agent made EXACTLY ONE successful edit of it after the
// target, in the target's own turn, none refused, it never edited that file before the target in this conversation's records,
// and the file's time sits at that one edit (1 s after, 5 s before: the one-second grain of the clocks and file times). A
// person's save between two of the agent's edits, across a turn, under a refused edit, or after an earlier edit's backup is
// then never a silent «same». Over-naming, never a silent overwrite.
// A HELPER (主开发 r1247, r1304, r1307): where a tool that STARTS A HELPER (the table's `helper` rows) has a call or a result —
// or a person's typed command not proven built in — ANYWHERE in the records, every listed file reads «could not be checked: a
// helper worked here»; a tool the table does not know, or a program it was not read for: «could not be checked» too — a helper's
// own edits are not this conversation's records, so no file's history can be proved from them. THE RECORDS MUST BE WHOLE: the
// caller says whether the records it hands reach back to the conversation's start (`whole`); if not, every file «could not be
// checked» (an edit before the target may sit in what is missing). EVERY edit before the target counts as «edited before»,
// whatever its status (a refused or unfinished write may still have touched the file and its backup).
// AT THE PRESS the dry run is asked AGAIN and judged again: a list or a state that is not the one the confirm drew refuses
// `changed-since` (the person sees the new list) — the files moved under the confirm (sameDrawOf).
//
// «BOTH» (7): dry runs first; then the files, then the conversation; each result said on its own (outcomeOf) — a second step
// that fails leaves the first said as done; a files step that failed mid-way may have put some files back (said so).
//
// A MESSAGE WHOSE CONVERSATION WAS ALREADY TAKEN BACK: nothing is offered there in this tier (主开发 r1232, reversing r1230:
// its turn is a dead branch — every file judged against it reads «could not be checked»; a row of its own if asked).
//
// THE EDIT HISTORY is the normalizer's own records (主开发 r1230: no file read): its tool messages (`tool_result` blocks with
// the tool's name, its input, its status and `resultAt` — the CLI's own time of the result, the clock of the machine the files
// are on — and `tool_call` blocks, a call still waiting for its result) and the turn starts between them (src/rewind-cut.js
// startsATurn).
//
// PURE: imports only src/rewind-door.js (PURE: the conversation door's one verdict — its refusals are this door's too) and
// src/rewind-cut.js (PURE: what starts a turn).

const DOOR = require('./rewind-door.js');
const { startsATurn } = require('./rewind-cut.js');

const CHOICES = Object.freeze(['conversation', 'files', 'both']);
const CONVERSATION_ONLY = Object.freeze(['conversation']);
const STEPS = Object.freeze({ conversation: Object.freeze(['conversation']), files: Object.freeze(['files']), both: Object.freeze(['files', 'conversation']) });
// THE CLI'S TOOLS — A CLOSED, VERSION-GATED TABLE (主开发 r1304 (c), r1307 (1)). «same» is said only for the program the table
// was read for (READ_CLI: the program the lane read — its helper names in its bytes, its rewind road in the capture of 11:30Z) and
// only when EVERY tool name in the records is one the table knows. Each row: its kind, its EVIDENCE (a recorded frame in the tree's
// fixtures, read back by test-rewind-files: the recorded 2.1.312 init frame's `tools` list, or a recorded call — the nearest
// recorded frame; a name the running program has and that frame lacks is unknown, the safe side), and WHY it cannot hide a write:
//   `edit` — a file writer the checkpoints HOLD: each of its edits is counted (one after the target, in its turn, its time at
//            that edit — else «could not be checked»).
//   `helper` — it starts (or resumes: SendMessage) another agent, whose own edits are not these records: every listed file «a helper
//            worked here» (the skill tool counts whole: a skill whose `context` is `fork` runs as a helper and the record does
//            not say which one did).
//   `untracked` — the checkpoints do NOT hold its writes (the shell, a read, a search, a plan, the task list, a worktree), and
//            such a write cannot hide: BEFORE the agent's first edit of a file it sits in that edit's backup (the file is put back
//            as it was, that write included); AFTER it, the file's time moved past the edit (changed).
// A NAME THE TABLE DOES NOT KNOW (or a call with no name), or a program it was not read for: every listed file «could not be
// checked», with its reason (`unknown-tool`, `version-unread`). Unknown so today: MultiEdit, Grep, Glob (no recorded frame names
// them). A connector's tools (`mcp__…`) are NOT
// in it (r1330: no recorded frame holds a connector call): every connector call reads «could not be checked». Not src/channel-touch.js HELPER_TOOLS: that table is the touch chip's cause.
const READ_CLI = '2.1.322';
const TABLE_READ_FOR = Object.freeze([READ_CLI]);
const INIT_312 = 'scripts/fixtures/claude-cli/2.1.312-frames.jsonl:2';
// a file's time against the agent's last edit of it, on the machine where both are read: the tool WRITES, then its result is
// recorded — so the agent's own write is at or BEFORE its result (LOW: how long before, a long edit's own run); a time past the
// result by more than the clock's grain (HIGH) is a write after the agent's
const HIGH_SLACK_MS = 1000;
const LOW_SLACK_MS = 5000;
// WHY a row's kind (each row names one): the reason it is in its kind, said once per kind of tool
const TOOL_WHY = Object.freeze({
  writer: 'a file writer the checkpoints hold: each of its edits is counted',
  agent: 'it starts another agent (or resumes one) whose own edits are not these records',
  skill: 'a skill whose context is fork runs as a helper, and the record does not say which one did',
  later: 'it schedules a prompt that runs later as its own turn, where a skill or a helper may run: counted as one now',
  shell: `its writes are not held by the checkpoints: before the agent's first edit of a file such a write sits in that edit's backup; after it, the file's time moved past the edit — OUTSIDE the window around the edit's time (${LOW_SLACK_MS / 1000} seconds before it, ${HIGH_SLACK_MS / 1000} second after): inside that window a time-preserving copy or a background writer reads «same»`,
  reads: 'it reads, searches or fetches: it writes none of the person\'s files',
  ui: 'it asks, plans, lists or reports to the person or the CLI itself: it writes none of the person\'s files',
  tasks: 'it keeps the CLI\'s own task list, or stops a process the shell started: no file of its own',
  worktree: 'it makes or leaves a git worktree: a write there is not held by the checkpoints — before the agent\'s first edit it sits in that edit\'s backup; after it, the time moved',
});
const TOOL_TABLE = Object.freeze(Object.fromEntries([
  ['Edit', 'edit', INIT_312, 'writer'], ['Write', 'edit', INIT_312, 'writer'], ['NotebookEdit', 'edit', INIT_312, 'writer'],
  ['Agent', 'helper', 'scripts/fixtures/claude-cli/2.1.312-frames.jsonl:13 (the call; line 15: the CLI\'s own task_started for it)', 'agent'], ['Task', 'helper', INIT_312, 'agent'], ['Workflow', 'helper', INIT_312, 'agent'], ['SendMessage', 'helper', INIT_312, 'agent'],
  ['Skill', 'helper', INIT_312, 'skill'], ['CronCreate', 'helper', INIT_312, 'later'], ['ScheduleWakeup', 'helper', INIT_312, 'later'],
  ['Bash', 'untracked', INIT_312, 'shell'],
  ...['Read', 'WebFetch', 'WebSearch', 'ToolSearch'].map((n) => [n, 'untracked', INIT_312, 'reads']),
  ...['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode', 'ListAgents', 'ReportFindings', 'CronDelete', 'CronList'].map((n) => [n, 'untracked', INIT_312, 'ui']),
  ...['TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate', 'TaskStop'].map((n) => [n, 'untracked', INIT_312, 'tasks']),
  ['Monitor', 'untracked', INIT_312, 'shell'],   // the watcher can run a command of its own (r1332 (4)): the shell's why
  ...['EnterWorktree', 'ExitWorktree'].map((n) => [n, 'untracked', INIT_312, 'worktree']),
].map(([name, kind, evidence, why]) => [name, Object.freeze({ kind, evidence, why })])));
// a tool named by a PREFIX class: NONE (主开发 r1330 — the connector row is OUT: a row whose evidence is our own reading of a
// name is a guess, and a shape with no recording is not guessed). Every connector call (`mcp__…`) reads «could not be checked»
// until a recorded frame holds one.
const TOOL_PREFIXES = Object.freeze([]);
const toolKind = (name) => {
  if (typeof name !== 'string' || !name) return null;
  if (Object.prototype.hasOwnProperty.call(TOOL_TABLE, name)) return TOOL_TABLE[name].kind;
  const row = TOOL_PREFIXES.find((r) => name.startsWith(r.prefix) && name.length > r.prefix.length);
  return row ? row.kind : null;
};
const EDIT_TOOLS = Object.freeze(Object.keys(TOOL_TABLE).filter((n) => TOOL_TABLE[n].kind === 'edit'));
const HELPER_TOOLS = Object.freeze(Object.keys(TOOL_TABLE).filter((n) => TOOL_TABLE[n].kind === 'helper'));
// A PERSON'S TYPED COMMAND (主开发 r1304 (a)) may run a forked skill — a helper — and leaves no tool record: it COUNTS AS A HELPER
// unless its name is one of the program's own commands PROVEN here to start none (a closed table, each with its evidence: a
// recorded frame: the init frame lists it as a command and NOT as a skill, and it is either recorded typed or a terminal command).
// The init frame's other commands are not here: the frame does not say what they run (some launch workflows).
// THE SHAPES read: the CLI's own command record `<command-name>/x</command-name>…` (recorded: scripts/fixtures/message-origin/
// claude-user-records.jsonl:3, a typed /compact; the local_command record has the same tag) in any message's text; and a
// person's own text that starts with `/x` (no recorded frame holds one: counted all the same — never proof of nothing).
const BUILT_IN_COMMANDS = Object.freeze({
  compact: 'scripts/fixtures/message-origin/claude-user-records.jsonl:3 (a typed /compact record); the init frame: a command, not a skill',
  color: `${INIT_312}: a command, not a skill — a terminal command`, focus: `${INIT_312}: a command, not a skill — a terminal command`, 'reload-plugins': `${INIT_312}: a command, not a skill — a terminal command`,
});   // NOT doctor: the same recorded frame lists it among its SKILLS
const TYPED_COMMAND_RE = /^\/([^\s/]+)(?=\s|$)/;   // ANY name up to a space (r1332 (1) and its reader: a digit, `__x`, `/部署`, `/a+b`); a path («/w/a.js …») is none
const COMMAND_TAGS_RE = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/g;
/** EVERY command a message carries (r1332 (2): every tag, not the first alone): the CLI's command tags in any of its text, and a
 *  person's text starting with one */
function commandsOf(m) {
  if (!m || typeof m !== 'object') return [];
  const texts = typeof m.content === 'string' ? [m.content] : (Array.isArray(m.content) ? m.content : []).filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text);
  if (typeof m.text === 'string') texts.push(m.text);
  const out = [];
  for (const t of texts) for (const a of t.matchAll(COMMAND_TAGS_RE)) out.push(a[1]);
  if (m.role === 'user') for (const t of texts) { const b = TYPED_COMMAND_RE.exec(t.trimStart()); if (b) out.push(b[1]); }
  return out;
}
/** the first command a message carries, or null */
const commandOf = (m) => commandsOf(m)[0] || null;
// the CLI's own words for the two refusals it names (2.1.322) — an answer in other words is `cli-other`, said with its text
const CLI_WORDS = Object.freeze({ 'checkpoints-off': 'File rewinding is not enabled.', 'no-checkpoint': 'No file checkpoint found for this message.' });
const FAILED_PREFIX = 'Failed to rewind';
// the CLI's own words when a press put NO file back, keyed by the program whose capture holds them (scripts/fixtures/claude-cli/
// <version>-rewind-files.json pressReply.allFailed; 2.1.322 throws «No files were restored: N files failed (…)» and the press answers
// «Failed to rewind: » + those words). Read as «nothing put back» ONLY in that shape — the failed prefix, then the words, at the
// start, the words' own colon included — and only from a program named here (主开发 r1247): anything else is «some may have been
// put back»
const NONE_RESTORED = Object.freeze({ [READ_CLI]: 'No files were restored' });
// this door's own reasons, each with its class (one of the conversation door's ANSWER_CLASSES)
const FILES_REFUSALS = Object.freeze({ 'files-off': 'cannot', 'not-a-choice': 'cannot', 'checkpoints-off': 'cannot', 'no-checkpoint': 'cannot', failed: 'failed', 'cli-other': 'other', 'no-answer': 'failed', 'changed-since': 'moved' });
// why a file reads «could not be checked» (the confirm words each)
const UNKNOWN_WHY = Object.freeze(['version-unread', 'helper-worked', 'unknown-tool', 'relative-path', 'case-twins', 'records-cut', 'target-not-found', 'no-edit-known', 'refused-edit', 'edited-before', 'several-edits', 'several-turns', 'unreadable', 'older-time', 'over-bound']);
// the files ONE confirm judges (the door reads their times); a list past it: the rest «could not be checked: over-bound»
const MAX_FILES = 64;

/** the choices the confirm draws: the files ones only where the conversation's own facts say checkpoints are on AND its dry run
 *  listed files it can name (a dry run that refused, or listed none, draws the conversation only) */
function choicesOf({ checkpoints = false, dry = null } = {}) {
  if (checkpoints !== true || !dry || dry.ok !== true || dry.filesKnown !== true || !Array.isArray(dry.files) || !dry.files.length) return CONVERSATION_ONLY;
  return CHOICES;
}

/** the steps a choice runs, in order — null when it is not one this conversation is offered */
function stepsOf(choice, offered = CHOICES) { return Array.isArray(offered) && offered.includes(choice) && STEPS[choice] ? STEPS[choice] : null; }

/** THE VERDICT of a press with a choice: the conversation door's own verdict first (ONE rule for what both need: the
 *  person's own message the CLI knows by its uuid, a live conversation, no running turn, no queue, no compaction), then the
 *  files' own: a choice that is none `not-a-choice`; a files choice off the message road (the files are asked by the CLI's
 *  uuid) `not-offered`; one where it is not drawn (`state.fileCheckpoints` off, or the dry run's) `files-off` */
function filesVerdict(checkpoints, msg, state = {}, choice = 'conversation', dry = null) {
  if (!Object.prototype.hasOwnProperty.call(STEPS, choice)) return { ok: false, reason: 'not-a-choice', cls: FILES_REFUSALS['not-a-choice'] };
  const v = DOOR.rewindVerdict(checkpoints, msg, state);   // a message already taken back: refused here too (r1232)
  if (!v.ok) return v;
  if (choice !== 'conversation' && (!checkpoints || checkpoints.granularity !== 'message')) return { ok: false, reason: 'not-offered', cls: DOOR.REWIND_REFUSALS['not-offered'] };
  const steps = stepsOf(choice, choice === 'conversation' ? CHOICES : choicesOf({ checkpoints: state.fileCheckpoints === true, dry }));
  if (!steps) return { ok: false, reason: 'files-off', cls: FILES_REFUSALS['files-off'] };
  return { ok: true, reason: null, cls: null, steps };
}

/** the request's body (the adapter wraps it as a control_request): the CLI's uuid of the person's message, a dry run or not */
function filesRequestOf(userMessageId, { dryRun = false } = {}) {
  if (typeof userMessageId !== 'string' || !userMessageId) return null;
  return { subtype: 'rewind_files', user_message_id: userMessageId, ...(dryRun === true ? { dry_run: true } : {}) };
}

const count = (x) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
/** THE CLI'S ANSWER in one shape. `reply` = the control response's body, or {error: <words>} for its error reply →
 *  {ok, dryRun, files: [path], filesKnown, plus, minus, skipped, reason, cls, text}: a refusal NAMED by the CLI's own words,
 *  never dropped; a dry run whose list is absent or holds what is no path says filesKnown: false (never an empty list) */
function filesAnswerOf(reply, { dryRun = false } = {}) {
  const none = { files: [], filesKnown: false, plus: 0, minus: 0, skipped: 0 };
  if (reply == null || typeof reply !== 'object') return { ok: false, dryRun, ...none, reason: 'no-answer', cls: FILES_REFUSALS['no-answer'], text: null };
  const text = typeof reply.error === 'string' ? reply.error.slice(0, 300) : null;
  if (reply.canRewind !== true) {
    const reason = text === CLI_WORDS['checkpoints-off'] ? 'checkpoints-off' : text === CLI_WORDS['no-checkpoint'] ? 'no-checkpoint' : text && text.startsWith(FAILED_PREFIX) ? 'failed' : 'cli-other';
    return { ok: false, dryRun, ...none, reason, cls: FILES_REFUSALS[reason], text };
  }
  const raw = reply.filesChanged;
  const list = Array.isArray(raw) ? raw.filter((p) => typeof p === 'string' && p) : [];
  const filesKnown = Array.isArray(raw) && list.length === raw.length;
  return { ok: true, dryRun, files: [...new Set(list)], filesKnown, plus: count(reply.insertions), minus: count(reply.deletions), skipped: count(reply.skippedLinks), reason: null, cls: null, text: null };
}

/** a path's LEXICAL form (主开发 r1307 (4)), the same on both sides of every comparison: doubled separators and `.` segments
 *  dropped, `..` taken back lexically. A link is NOT followed: two names of one file stay two (a merge could only add edits
 *  to one name — more «could not be checked», never a «same») */
function normPath(p) {
  if (typeof p !== 'string' || !p) return p;
  const win = /^[A-Za-z]:[\\/]/.test(p), sep = win ? '\\' : '/', abs = win || p.startsWith('/');
  const segs = p.split(win ? /[\\/]+/ : /\/+/), out = [];
  const root = abs ? segs.shift() : null;   // '' for a posix root, the drive for windows
  for (const seg of segs) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..'); continue; }
    out.push(seg);
  }
  if (abs) return (root === '' ? '/' : root + sep) + out.join(sep);
  return out.length ? out.join(sep) : '.';
}
/** an edit's path the judge can compare: absolute (posix, or a drive) — a relative or `~` path names no one file for sure */
const isAbsPath = (p) => typeof p === 'string' && (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p));

/** THE AGENT'S EDITS of each file, from the NORMALIZER'S records (主开发 r1230): its tool messages' blocks of one of the CLI's
 *  file tools (EDIT_TOOLS) naming a path — a `tool_result`, or a `tool_call` still waiting for its result — and the turn starts
 *  between → {known: the target was found, whole: the caller says these records reach back to the conversation's start (r1247),
 *  helper: a tool that starts a helper (HELPER_TOOLS) has a call or a result anywhere in them (r1247), before: [path the agent
 *  edited BEFORE the target, whatever the edit's status (r1247)], byPath: {path: {at: the newest successful result's
 *  `resultAt`, count: the edits after the target that may have written (a success, or a call with no result yet), turnsAfter:
 *  the turn starts between the target and the newest, refused: an edit of it after the target was refused (the file changed
 *  under the agent)}}} */
// r1307: + `cli` (the conversation's program: `tableRead` only for one the table was read for), `unknownTool` (the first name
// the table does not know), a typed command not proven built in sets `helper`; every path in its lexical form (normPath)
// r1332 (6) + r1336: + `skills` (the conversation's OWN init's skills: a name there is a helper whatever the table says); an
// edit call with no readable path is a call that proves nothing (unknownTool)
function editsFromMessages(messages, { targetId, whole = false, cli = null, skills = null } = {}) {
  const byPath = {}, before = new Set();
  let known = false, helper = false, unknownTool = null, relativePath = false, turn = 0;
  const blocks = (m) => (m && Array.isArray(m.content) ? m.content : []);
  const isCall = (b) => !!b && (b.type === 'tool_result' || b.type === 'tool_call');
  const editOf = (b) => {
    if (!isCall(b) || !EDIT_TOOLS.includes(b.toolName) || !b.input) return null;
    const raw = typeof b.input.file_path === 'string' ? b.input.file_path : typeof b.input.notebook_path === 'string' ? b.input.notebook_path : null;
    if (raw !== null && !isAbsPath(raw)) relativePath = true;   // r1307 (4): a path the judge cannot compare for sure
    return normPath(raw);
  };
  // the conversation's own skills: names (a row `{name}` read as its name); a list in any other shape proves nothing (fails closed)
  const ownList = skills == null ? [] : Array.isArray(skills) ? skills.map((x) => (typeof x === 'string' ? x : x && typeof x.name === 'string' ? x.name : null)) : [null];
  const own = new Set(ownList.filter((x) => typeof x === 'string'));
  if (ownList.some((x) => typeof x !== 'string')) unknownTool = '(skills unreadable)';
  for (const m of Array.isArray(messages) ? messages : []) {
    for (const b of blocks(m)) {
      if (!isCall(b)) continue;
      const k = own.has(b.toolName) ? 'helper' : toolKind(b.toolName);
      if (k === 'helper') helper = true;
      else if (k === null && unknownTool === null) unknownTool = typeof b.toolName === 'string' && b.toolName ? b.toolName.slice(0, 80) : '(no name)';
      if (k === 'edit' && unknownTool === null && !(b.input && ((typeof b.input.file_path === 'string' && b.input.file_path) || (typeof b.input.notebook_path === 'string' && b.input.notebook_path)))) unknownTool = '(an edit with no path)';   // r1336 (an empty path too)
    }
    for (const cmd of commandsOf(m)) if (own.has(cmd) || !Object.prototype.hasOwnProperty.call(BUILT_IN_COMMANDS, cmd)) helper = true;   // a typed command not proven to start none
    if (!known) {
      if (m && typeof targetId === 'string' && m.id === targetId) { known = true; continue; }
      for (const b of blocks(m)) { const p = editOf(b); if (p) before.add(p); }
      continue;
    }
    if (startsATurn(m)) { turn++; continue; }
    for (const b of blocks(m)) {
      const p = editOf(b);
      if (!p) continue;
      const e = byPath[p] || (byPath[p] = { at: null, count: 0, turnsAfter: 0, refused: false });
      if (b.status === 'error') { e.refused = true; continue; }
      e.count++;
      if (b.type === 'tool_call') continue;   // no result yet: it may have written — counted, with no time
      const at = Number(b.resultAt);
      if (Number.isFinite(at) && !(e.at >= at)) { e.at = at; e.turnsAfter = turn; }
      else if (turn > e.turnsAfter) e.turnsAfter = turn;
    }
  }
  return { known, whole: whole === true, tableRead: typeof cli === 'string' && TABLE_READ_FOR.includes(cli), helper, unknownTool, relativePath, before: [...before], byPath };
}

/** (C) each file the dry run lists → {path, state, why}: 'same' (only as the header says), 'changed' (its time is past the agent's
 *  last edit of it), or 'unknown' with its reason (UNKNOWN_WHY) — every file `helper-worked` where a helper worked, every one
 *  `records-cut` where the records are not whole */
function changedAfterOf(files, { mtimes = {}, edits = null, max = MAX_FILES } = {}) {
  // r1332 (5): two listed or edited paths equal but for letter case — one file on a case-blind storage, two on another: not judged
  // (its reader: also a composed vs a decomposed letter — one file on APFS — and a trailing dot or space — one file on Windows)
  // (主开发 r1383: the fold strips a trailing dot or space before EVERY separator, so two folders on Linux that differ only by a
  // trailing dot read as twins too — that fails closed, «could not be checked», never «same»: it stands)
  const seen = new Map();
  for (const p of [...(Array.isArray(files) ? files : []).map(normPath), ...(edits && Array.isArray(edits.before) ? edits.before : []), ...Object.keys((edits && edits.byPath) || {})]) {
    if (typeof p !== 'string') continue;
    const low = p.normalize('NFC').toLowerCase().replace(/[. ]+(?=[\\/]|$)/g, '');   // case, a composed / decomposed letter, a trailing dot or space (Windows drops them)
    if (!seen.has(low)) seen.set(low, new Set());
    seen.get(low).add(p);
  }
  const twins = [...seen.values()].some((set) => set.size > 1);
  return (Array.isArray(files) ? files : []).map((path, i) => {
    if (!edits) return { path, state: 'unknown', why: 'records-cut' };
    if (edits.tableRead !== true) return { path, state: 'unknown', why: 'version-unread' };
    if (edits.helper === true) return { path, state: 'unknown', why: 'helper-worked' };
    if (edits.unknownTool) return { path, state: 'unknown', why: 'unknown-tool' };
    if (edits.relativePath === true) return { path, state: 'unknown', why: 'relative-path' };
    if (twins) return { path, state: 'unknown', why: 'case-twins' };
    if (edits.whole !== true) return { path, state: 'unknown', why: 'records-cut' };
    if (edits.known !== true) return { path, state: 'unknown', why: 'target-not-found' };
    if (i >= max) return { path, state: 'unknown', why: 'over-bound' };
    const key = normPath(path);
    const e = edits.byPath && Object.prototype.hasOwnProperty.call(edits.byPath, key) ? edits.byPath[key] : null;
    if (!e || typeof e.at !== 'number' || !Number.isFinite(e.at)) return { path, state: 'unknown', why: e && e.refused ? 'refused-edit' : 'no-edit-known' };
    if (e.refused) return { path, state: 'unknown', why: 'refused-edit' };
    if (Array.isArray(edits.before) && edits.before.includes(key)) return { path, state: 'unknown', why: 'edited-before' };
    if (e.count !== 1) return { path, state: 'unknown', why: 'several-edits' };
    if (e.turnsAfter > 0) return { path, state: 'unknown', why: 'several-turns' };
    const m = mtimes ? mtimes[path] : undefined;
    if (typeof m !== 'number' || !Number.isFinite(m)) return { path, state: 'unknown', why: 'unreadable' };
    if (m > e.at + HIGH_SLACK_MS) return { path, state: 'changed', why: null };
    if (m < e.at - LOW_SLACK_MS) return { path, state: 'unknown', why: 'older-time' };
    return { path, state: 'same', why: null };
  });
}

/** (C) the choice drawn as SELECTED: «the conversation only» where the files are not offered, the dry run lists no file, or
 *  any listed file is not plainly «same»; else «both» */
function defaultChoiceOf(offered, judged = []) {
  if (!Array.isArray(offered) || !offered.includes('both')) return 'conversation';
  const list = Array.isArray(judged) ? judged : [];
  if (!list.length) return 'conversation';
  return list.every((x) => x && x.state === 'same') ? 'both' : 'conversation';
}

/** AT THE PRESS: the dry run asked again and judged again equals what the confirm drew (the same files, the same states, the
 *  same counts) — else the press is refused `changed-since` */
function sameDrawOf(drawn, now) {
  const key = (d) => (d && Array.isArray(d.judged) ? JSON.stringify({ files: [...(d.files || [])].sort(), judged: d.judged.map((x) => [x.path, x.state, x.why || null]).sort(), plus: d.plus || 0, minus: d.minus || 0 }) : null);
  const a = key(drawn), b = key(now);
  return a !== null && a === b;
}

/** (7) the steps' results in their order → {done: [step], failed: step | null, notTried: [step], maybePartial}: a step that fails
 *  stops the ones after it; what was done before it stays said as done. A FILES STEP THAT FAILED (主开发 r1232 MUST 2) is «not
 *  known: some files may have been put back» — a press with no answer, a CLI that died mid-press, words this door does not know —
 *  EXCEPT where nothing was changed by construction: the CLI refused before it began (checkpoints off, no checkpoint), the door
 *  refused before it sent (changed-since, or anything else it said itself), or the CLI said «No files were restored» (its own
 *  words when every differing file failed — the capture's pressReply.allFailed) in the measured shape, from the program measured
 *  (`cli`: the conversation's CLI version, as its init said it — r1247; NONE_RESTORED) */
const NO_CHANGE = Object.freeze(['checkpoints-off', 'no-checkpoint', 'changed-since']);
function outcomeOf(steps, results, { cli = null } = {}) {
  const done = [], notTried = [];
  let failed = null;
  for (const s of Array.isArray(steps) ? steps : []) {
    if (failed) { notTried.push(s); continue; }
    const r = results && results[s];
    if (r && r.ok === true) done.push(s); else failed = s;
  }
  const fr = failed === 'files' && results ? results.files : null;
  const noneBack = typeof cli === 'string' && Object.prototype.hasOwnProperty.call(NONE_RESTORED, cli) && !!fr && typeof fr.text === 'string' && fr.text.startsWith(`${FAILED_PREFIX}: ${NONE_RESTORED[cli]}:`);
  const maybePartial = failed === 'files' && !(fr && (NO_CHANGE.includes(fr.reason) || fr.sent === false || noneBack));
  return { done, failed, notTried, maybePartial };
}

module.exports = { CHOICES, STEPS, READ_CLI, TABLE_READ_FOR, TOOL_WHY, TOOL_TABLE, TOOL_PREFIXES, EDIT_TOOLS, HELPER_TOOLS, BUILT_IN_COMMANDS, commandOf, commandsOf, normPath, CLI_WORDS, FAILED_PREFIX, NONE_RESTORED, FILES_REFUSALS, HIGH_SLACK_MS, LOW_SLACK_MS, UNKNOWN_WHY, MAX_FILES, NO_CHANGE, choicesOf, stepsOf, filesVerdict, filesRequestOf, filesAnswerOf, editsFromMessages, changedAfterOf, defaultChoiceOf, sameDrawOf, outcomeOf };
