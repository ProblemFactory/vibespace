// rewind-files-words.js — row B-437e, THE FILES TIER's PAGE (U3; lane lg-rewind, 2026-11-22; 主开发 r1988). PURE (no DOM, no socket):
// what the files confirm draws from the SERVER's facts (src/server/rewind-files-door.js filesConfirmOf), each listed file's state in
// words, the kept copy (or why none can be kept), the press's outcome, the conversation's KEPT LINE and its put-back. The view
// (src/lib/chat-view.js) draws exactly this; scripts/test-rewind-files-page.mjs reads every sentence without a browser.
//   DARK as shipped: the server draws «the conversation only» unless the conversation's own fact says its checkpoints are on (U1
//   sets it), and then the page draws TODAY's confirm word for word (confirmKindOf → 'conversation').
//   A CHOICE THAT CANNOT ACT IS ABSENT, with ONE sentence why — never a greyed control (the owner's rule, r1423).
//   NEVER «all files restored»: every listed file reads «put back or removed» (the U2 ruling).
import { t } from './i18n.js';
import { dateOf } from './page-time.js';

export const FILES_CHOICES = Object.freeze(['conversation', 'files', 'both']);
export const SHOWN_MAX = 12;   // the confirm's rows before «and N more» (the server judges at most 64)

/** WHICH CONFIRM: 'files' only when the server drew the conversation AND a files choice; anything else (dark, a road the harness
 *  lacks, a dry run that did not answer, no facts at all) draws today's confirm */
export function confirmKindOf(facts) {
  if (!facts || facts.ok !== true || !Array.isArray(facts.choices)) return 'conversation';
  const c = facts.choices.filter((x) => FILES_CHOICES.includes(x));
  return c.includes('conversation') && c.length > 1 ? 'files' : 'conversation';
}

export function choiceWords(id) {
  if (id === 'files') return t('The files only — the conversation stays as it is');
  if (id === 'both') return t('Both — the conversation and the files');
  return t('The conversation only — the files stay as they are now');
}

const UNKNOWN_WORDS = () => ({
  'version-unread': t('this version of the CLI is not read yet'),
  'helper-worked': t('a helper agent worked in this conversation'),
  'unknown-tool': t('a tool VibeSpace does not read changed it'),
  'relative-path': t('its path is not a full path'),
  'case-twins': t('two of the names differ only by letter case'),
  'records-cut': t('the conversation\'s earlier records are not all here'),
  'target-not-found': t('this message was not found in the records'),
  'no-edit-known': t('no edit of it by the agent is known'),
  'refused-edit': t('an edit of it was refused'),
  'edited-before': t('it was edited before this message too'),
  'several-edits': t('the agent edited it more than once'),
  'several-turns': t('it was edited in more than one turn'),
  unreadable: t('its time could not be read'),
  'older-time': t('its time is older than the agent\'s edit'),
  'over-bound': t('more files than one confirm checks'),
});
/** a listed file's state → its words: «as the agent left it» · «changed since the agent's last edit» · «could not be checked: <why>» */
export function stateWords(row) {
  const s = row && row.state;
  if (s === 'same') return t('as the agent left it');
  if (s === 'changed') return t('changed since the agent\'s last edit');
  const why = UNKNOWN_WORDS()[row && row.why] || t('not known');
  return t('could not be checked: {why}', { why });
}

const KEEP_WORDS = () => ({
  'too-many': t('more than 64 files'),
  'too-large': t('larger than 32 MiB'),
  'press-full': t('more than 256 MiB in all'),
  'kept-full': t('the kept copies on that machine are full (the oldest leave seven days after they were kept)'),
  unreadable: t('it could not be read'),
  'relative-path': t('its path is not a full path'),
  link: t('it is a link (a rewind would write through it)'),
  folder: t('it is a folder'),
  device: t('it is a device'),
  'no-time': t('it could not be copied in time'),
  'not-kept': t('its copy could not be checked'),
  'agent-too-old': t('that machine\'s agent is an older version'),
  'files-not-allowed': t('that machine does not allow file changes'),
});
export const keepWhyWords = (why) => KEEP_WORDS()[why] || t('not known');

/** «a/b/c/d/e.js» → «…/d/e.js» past `max` characters (the end of a path is what a person knows it by) */
export function shortPath(p, max = 56) {
  const s = String(p || '');
  if (s.length <= max) return s;
  const parts = s.split(/(?=[\\/])/);
  let out = '';
  for (let i = parts.length - 1; i >= 0 && (parts[i] + out).length <= max - 1; i--) out = parts[i] + out;
  return '…' + (out || s.slice(-(max - 1)));
}

/** THE FILES CONFIRM's model from the server's facts → {kind, choices: [{id, words}], def, rows: [{path, short, state, words}],
 *  more, plus, minus, keep: {ok, words, rows: [{path, short, words}]}, absent: sentence | null} */
export function confirmModel(facts, { machine = null } = {}) {
  const kind = confirmKindOf(facts);
  if (kind !== 'files') return { kind, choices: [], def: 'conversation', rows: [], more: 0, plus: 0, minus: 0, keep: null, absent: null };
  const keep = facts.keep && typeof facts.keep === 'object' ? facts.keep : { ok: true, refusals: [] };
  const keepRows = (Array.isArray(keep.refusals) ? keep.refusals : []).map((r) => ({ path: r.path || null, short: r.path ? shortPath(r.path) : null, words: t('cannot keep a copy: {why}', { why: keepWhyWords(r.why) }) }));
  const canKeep = keep.ok === true && !keepRows.length;
  // the files choices stand only where a copy of every file can be kept (the server refuses them otherwise): absent, said once
  const ids = facts.choices.filter((x) => FILES_CHOICES.includes(x) && (canKeep || x === 'conversation'));
  const choices = ids.map((id) => ({ id, words: choiceWords(id) }));
  const def = ids.includes(facts.default) ? facts.default : 'conversation';
  const all = Array.isArray(facts.files) ? facts.files : [];
  const rows = all.slice(0, SHOWN_MAX).map((r) => ({ path: r.path, short: shortPath(r.path), state: r.state, words: stateWords(r) }));
  const keepWords = canKeep
    ? (machine ? t('A copy of each file as it is now is kept on {machine} before anything is put back (for seven days).', { machine }) : t('A copy of each file as it is now is kept on this computer before anything is put back (for seven days).'))
    : t('No copy can be kept of every file, so the files cannot be put back:');
  return {
    kind, choices, def, rows, more: Math.max(0, all.length - rows.length), plus: Number(facts.plus) || 0, minus: Number(facts.minus) || 0,
    keep: { ok: canKeep, words: keepWords, rows: keepRows },
    absent: canKeep ? null : t('Only the conversation can be rewound here.'),
  };
}

/** what the confirm said the files are, for the press's `drawn` (the server refuses `changed-since` when they moved) */
export function drawnOf(facts) {
  const all = facts && Array.isArray(facts.files) ? facts.files : [];
  return { files: all.map((r) => r.path), judged: all.map((r) => ({ path: r.path, state: r.state, why: r.why || null })), plus: Number(facts && facts.plus) || 0, minus: Number(facts && facts.minus) || 0 };
}

const PRESS_REFUSALS = () => ({
  'changed-since': t('The files changed since this was opened — nothing was put back. Open it again to see them as they are now.'),
  'not-kept': t('No copy could be kept of every file — nothing was put back.'),
  'files-off': t('Files cannot be put back in this conversation.'),
  'checkpoints-off': t('This conversation keeps no file checkpoints — nothing was put back.'),
  'no-checkpoint': t('There is no file checkpoint at this message — nothing was put back.'),
  'not-a-choice': t('That choice is not offered here — nothing was sent.'),
  pending: t('Another rewind is still out — try again once it answers.'),
  'not-the-person': t('Only a press on this page can put files back.'),
  'door-failed': t('VibeSpace could not do this — nothing was sent.'),
});
export const pressRefusalWords = (reason) => PRESS_REFUSALS()[reason] || null;

/** THE PRESS's OUTCOME for its files step → one sentence (the conversation step's answer is said as tier one says it) */
export function filesOutcomeWords(r) {
  if (!r || r.ok !== true) return pressRefusalWords(r && r.reason) || t('Nothing was put back.');
  const f = r.results && r.results.files;
  const o = r.outcome || {};
  if (f && f.ok === true) {
    const n = Number(r.results && r.results.kept && r.results.kept.files) || (Array.isArray(f.files) ? f.files.length : 0);
    return n ? t('Files put back or removed: {n}.', { n }) : t('The files were put back or removed.');
  }
  if (o.maybePartial) return t('Some files may have been put back — the files step did not finish. The kept copy holds them as they were.');
  return t('Nothing was put back.');
}

/** A KEPT LINE (src/server/rewind-kept-door.js linesOf) → {words, door: bool} — the door ONLY while its copy stands; after its seven
 *  days, or once put back, the line SAYS so (never a greyed door). `fmt(ms)` = the view's own date words */
export function keptLineModel(line, { fmt = (ms) => dateOf(ms, { words: true }) } = {}) {
  const n = Number(line && line.files) || 0;
  const where = line && line.machine ? t('on {machine}', { machine: line.machine }) : t('on this computer');
  if (line && line.state === 'put-back') return { door: false, words: t('Files rewound here — they were put back as they were on {date}.', { date: fmt(Number(line.putBackAt) || Number(line.at)) }) };
  if (line && line.state === 'kept' && line.door) return { door: true, words: t('Files rewound here — a copy of {n} file(s) as they were is kept {where} until {date}.', { n, where, date: fmt(Number(line.until)) }) };
  return { door: false, words: t('Files rewound here — the copy kept of them is gone (it was kept seven days).') };
}
export const putBackDoorWords = () => t('Put my files back as they were');

const PUT_WHY = () => ({
  'kept-changed': t('its kept copy changed since'),
  link: t('a link stands there now'),
  folder: t('a folder stands there now'),
  device: t('a device stands there now'),
  unreadable: t('it could not be read'),
  'agent-too-old': t('that machine\'s agent is an older version'),
});
/** «PUT MY FILES BACK»: each path's act named BEFORE it acts → [sentence] */
export function putBackPlanWords(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const p = shortPath(r.path);
    if (r.act === 'overwrite') return t('{path} — put back over what is there now (that is kept first)', { path: p });
    if (r.act === 'create') return t('{path} — put back (it is not there now)', { path: p });
    if (r.act === 'remove') return t('{path} — removed (it did not exist then)', { path: p });
    if (r.act === 'unchanged') return t('{path} — already as it was', { path: p });
    return t('{path} — not put back: {why}', { path: p, why: PUT_WHY()[r.why] || t('not known') });
  });
}
const PUT_REFUSALS = () => ({
  pending: t('These files are already being put back (another window pressed it) — wait for its answer.'),
  'turn-running': t('A turn is running — put the files back once it ends.'),
  'changed-since': t('The files changed since this was opened — nothing was put back. Press again to see them as they are now.'),
  'not-kept': t('The kept copy is gone — there is nothing to put back.'),
  stopped: t('Put these files back from the conversation on their own machine.'),
  'not-the-person': t('Only a press on this page can put files back.'),
  'door-failed': t('VibeSpace could not do this — nothing was put back.'),
});
/** the put-back's answer → one sentence */
export function putBackOutcomeWords(r) {
  if (!r || r.ok !== true) return PUT_REFUSALS()[r && r.reason] || t('Nothing was put back.');
  const rows = Array.isArray(r.rows) ? r.rows : [];
  const done = rows.filter((x) => x.done === true).length, not = rows.filter((x) => x.done !== true && x.act !== 'unchanged').length;
  if (!not) return t('Put back as they were: {n} file(s).', { n: done });
  return t('Put back as they were: {n} file(s); {m} not put back — the kept copy still holds them.', { n: done, m: not });
}
