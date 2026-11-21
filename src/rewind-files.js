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
// the choice drawn as selected is «the conversation only» (defaultChoiceOf). A file reads «same» ONLY when every edit the agent
// made of it after the target happened IN THE TARGET'S OWN TURN, none of them was refused, and the file's time sits at the
// agent's last edit of it. Anything else is «changed» or «could not be checked», with its reason — because a person's edit can
// hide BETWEEN two of the agent's edits (the agent's later edit makes the file's time its own again), and the records say
// nothing of it but across a turn boundary or by a refused edit. Failing safe: over-naming, never a silent overwrite. (主开发
// said «against the backup's time»: the backups are taken at the person's messages, so that alone names every file the agent
// edited after its latest backup as the person's — the turn rule keeps that safety where it matters.)
// AT THE PRESS the dry run is asked AGAIN and judged again: a list or a state that is not the one the confirm drew refuses
// `changed-since` (the person sees the new list) — the files moved under the confirm (sameDrawOf).
//
// «BOTH» (7): dry runs first; then the files, then the conversation; each result said on its own (outcomeOf) — a second step
// that fails leaves the first said as done; a files step that failed mid-way may have put some files back (said so).
//
// PURE: imports only src/rewind-door.js (PURE: the conversation door's one verdict — its refusals are this door's too).

const DOOR = require('./rewind-door.js');

const CHOICES = Object.freeze(['conversation', 'files', 'both']);
const CONVERSATION_ONLY = Object.freeze(['conversation']);
const STEPS = Object.freeze({ conversation: Object.freeze(['conversation']), files: Object.freeze(['files']), both: Object.freeze(['files', 'conversation']) });
// the CLI's file tools whose edits its checkpoints hold (the records name the path as input.file_path / input.notebook_path)
const EDIT_TOOLS = Object.freeze(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
// the CLI's own words for the two refusals it names (2.1.322) — an answer in other words is `cli-other`, said with its text
const CLI_WORDS = Object.freeze({ 'checkpoints-off': 'File rewinding is not enabled.', 'no-checkpoint': 'No file checkpoint found for this message.' });
const FAILED_PREFIX = 'Failed to rewind';
// this door's own reasons, each with its class (one of the conversation door's ANSWER_CLASSES)
const FILES_REFUSALS = Object.freeze({ 'files-off': 'cannot', 'not-a-choice': 'cannot', 'checkpoints-off': 'cannot', 'no-checkpoint': 'cannot', failed: 'failed', 'cli-other': 'other', 'no-answer': 'failed', 'changed-since': 'moved' });
// a file's time against the agent's last edit of it, on the machine where both are read: the tool WRITES, then its result is
// recorded — so the agent's own write is at or BEFORE its result (LOW: how long before, a long edit's own run); a time past the
// result by more than the clock's grain (HIGH) is a write after the agent's
const HIGH_SLACK_MS = 1000;
const LOW_SLACK_MS = 5000;
// why a file reads «could not be checked» (the confirm words each)
const UNKNOWN_WHY = Object.freeze(['target-not-found', 'no-edit-known', 'refused-edit', 'several-turns', 'unreadable', 'older-time']);

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
  const v = DOOR.rewindVerdict(checkpoints, msg, state);
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

/** a user row that STARTS a turn (the person's, or one somebody else opened): not a tool result, not a meta or summary row */
const startsTurn = (r) => {
  if (!r || r.type !== 'user' || r.isMeta === true || r.isCompactSummary === true) return false;
  const c = r.message && r.message.content;
  if (typeof c === 'string') return true;
  return Array.isArray(c) && c.length > 0 && !c.some((b) => b && b.type === 'tool_result');
};
/** THE AGENT'S EDITS of each file AFTER the target message, from the CLI's own records (EDIT_TOOLS): → {known: the target was
 *  found, byPath: {path: {at: the newest successful result's own timestamp, turnsAfter: how many turn starts lie between the
 *  target and that edit, refused: an edit of it was refused (the file changed under the agent)}}} */
function lastEditsOf(records, { targetUuid } = {}) {
  const asked = new Map(), byPath = {};
  let known = false, turn = 0;
  for (const r of Array.isArray(records) ? records : []) {
    if (!known) { if (r && typeof targetUuid === 'string' && r.uuid === targetUuid) known = true; continue; }
    if (startsTurn(r)) { turn++; continue; }
    const c = r && r.message && Array.isArray(r.message.content) ? r.message.content : [];
    if (r && r.type === 'assistant') {
      for (const b of c) {
        if (!b || b.type !== 'tool_use' || !EDIT_TOOLS.includes(b.name) || !b.input || typeof b.id !== 'string') continue;
        const p = typeof b.input.file_path === 'string' ? b.input.file_path : typeof b.input.notebook_path === 'string' ? b.input.notebook_path : null;
        if (p) asked.set(b.id, p);
      }
    } else if (r && r.type === 'user') {
      const at = Date.parse(r.timestamp);
      for (const b of c) {
        if (!b || b.type !== 'tool_result' || !asked.has(b.tool_use_id)) continue;
        const p = asked.get(b.tool_use_id), e = byPath[p] || (byPath[p] = { at: null, turnsAfter: 0, refused: false });
        if (b.is_error === true) { e.refused = true; continue; }
        if (Number.isFinite(at) && !(e.at >= at)) { e.at = at; e.turnsAfter = turn; }
        else if (turn > e.turnsAfter) e.turnsAfter = turn;
      }
    }
  }
  return { known, byPath };
}

/** (C) each file the dry run lists → {path, state, why}: 'same' (only as the header says), 'changed' (its time is past the agent's
 *  last edit of it), or 'unknown' with its reason (UNKNOWN_WHY) */
function changedAfterOf(files, { mtimes = {}, edits = null } = {}) {
  return (Array.isArray(files) ? files : []).map((path) => {
    if (!edits || edits.known !== true) return { path, state: 'unknown', why: 'target-not-found' };
    const e = edits.byPath && Object.prototype.hasOwnProperty.call(edits.byPath, path) ? edits.byPath[path] : null;
    if (!e || typeof e.at !== 'number' || !Number.isFinite(e.at)) return { path, state: 'unknown', why: e && e.refused ? 'refused-edit' : 'no-edit-known' };
    if (e.refused) return { path, state: 'unknown', why: 'refused-edit' };
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
 *  stops the ones after it; what was done before it stays said as done; a files step that failed mid-way may have put some
 *  files back (maybePartial — «no files were restored» says it did not) */
function outcomeOf(steps, results) {
  const done = [], notTried = [];
  let failed = null;
  for (const s of Array.isArray(steps) ? steps : []) {
    if (failed) { notTried.push(s); continue; }
    const r = results && results[s];
    if (r && r.ok === true) done.push(s); else failed = s;
  }
  const fr = failed === 'files' && results ? results.files : null;
  const maybePartial = !!fr && fr.reason === 'failed' && !/No files were restored/.test(String(fr.text || ''));
  return { done, failed, notTried, maybePartial };
}

module.exports = { CHOICES, STEPS, EDIT_TOOLS, CLI_WORDS, FAILED_PREFIX, FILES_REFUSALS, HIGH_SLACK_MS, LOW_SLACK_MS, UNKNOWN_WHY, choicesOf, stepsOf, filesVerdict, filesRequestOf, filesAnswerOf, lastEditsOf, changedAfterOf, defaultChoiceOf, sameDrawOf, outcomeOf };
