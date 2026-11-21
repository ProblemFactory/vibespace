#!/usr/bin/env node
// test-rewind-files (fast, PURE — row B-437e, the files tier, U2's pure part; 主开发 r1080 (B), (C), (7)): src/rewind-files.js
//   ① THE CHOICES — the files choices only where the conversation's own facts say checkpoints are on AND its dry run listed
//      files it can name; «both» runs the files, then the conversation
//   ② THE VERDICT — the conversation door's own refusals first (one rule), then the files' own (not-a-choice, not-offered off the
//      message road, files-off); every class one of the door's ANSWER_CLASSES
//   ③ THE REQUEST and THE ANSWER — the CLI's answers in one shape, each refusal named by its own words (2.1.322, read as bytes),
//      an unknown one kept with its text; a dry run whose list is absent or holds what is no path is NOT an empty list
//   ④ THE PERSON'S OWN LATER EDIT — «same» ONLY for a file the agent edited in the target's own turn, never refused, its time at
//      the agent's last edit; a person's edit hidden between two of the agent's edits across a turn is «could not be checked»
//      (never a silent «same»); the choice drawn as selected: «the conversation only» unless every listed file is plainly same;
//      AT THE PRESS the dry run judged again must equal what the confirm drew (changed-since)
//   ⑤ «BOTH» — a step that fails stops the ones after it; a files step that failed mid-way may have put some back
//   RED CONTROLS (anchored copies through scripts/mutant-copy.mjs): no turn rule, no refused rule, no high slack, the default
//   without the changed check, «both» in the other order, the dry run's unknown list read as empty
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const F = require(path.join(REPO, 'src/rewind-files.js'));
const DOOR = require(path.join(REPO, 'src/rewind-door.js'));
const { ok, report } = checker();
const SRC = fs.readFileSync(path.join(REPO, 'src/rewind-files.js'), 'utf8');
const M = mutantCopies('rewind-files', REPO);
const DRY = { ok: true, dryRun: true, files: ['/w/a.js'], filesKnown: true, plus: 3, minus: 1, skipped: 0 };

console.log('— ① the choices');
ok(JSON.stringify(F.choicesOf({ checkpoints: true, dry: DRY })) === '["conversation","files","both"]', '① checkpoints on and a dry run that names its files: the three choices');
const noDraw = [['checkpoints off', { checkpoints: false, dry: DRY }], ['no dry run', { checkpoints: true }], ['the dry run refused', { checkpoints: true, dry: { ...DRY, ok: false } }],
  ['the dry run lists none', { checkpoints: true, dry: { ...DRY, files: [] } }], ['its list could not be read', { checkpoints: true, dry: { ...DRY, filesKnown: false } }], ['checkpoints not literally true', { checkpoints: 'yes', dry: DRY }]];
ok(noDraw.every(([, a]) => JSON.stringify(F.choicesOf(a)) === '["conversation"]'), `① the files choices ABSENT (never greyed) where they cannot work: ${noDraw.map(([n]) => n).join(' · ')}`);
ok(JSON.stringify(F.stepsOf('both')) === '["files","conversation"]' && JSON.stringify(F.stepsOf('files')) === '["files"]' && F.stepsOf('files', F.choicesOf({ checkpoints: false })) === null && F.stepsOf('nonsense') === null,
  '① «both» runs the files, then the conversation (主开发 r1080 (7)); a choice not offered has no steps');
ok([F.CHOICES, F.STEPS, F.STEPS.both, F.EDIT_TOOLS, F.CLI_WORDS, F.FILES_REFUSALS, F.UNKNOWN_WHY].every(Object.isFrozen), '① the tables are frozen');

console.log('— ② the verdict');
const CP = { conversation: true, granularity: 'message' };
const msg = { role: 'user', id: 'm1', uuid: 'u-1', content: [{ type: 'text', text: 'edit it' }] };
const live = { live: true, fileCheckpoints: true };
for (const [n, st, choice, want] of [['a running turn', { ...live, turnRunning: true }, 'both', 'turn-running'], ['a stopped conversation', { live: false, fileCheckpoints: true }, 'files', 'stopped'], ['a queue waiting', { ...live, queued: true }, 'both', 'queued'], ['a compaction', { ...live, compacting: true }, 'files', 'compacting']]) {
  const v = F.filesVerdict(CP, msg, st, choice, DRY), d = DOOR.rewindVerdict(CP, msg, st);
  ok(v.ok === false && v.reason === want && d.reason === want && v.cls === d.cls, `② ${n}: refused «${want}» — the conversation door's own verdict, one rule for both`, v);
}
const noUuid = F.filesVerdict(CP, { ...msg, uuid: null }, live, 'files', DRY);
const turnRoad = F.filesVerdict({ conversation: true, granularity: 'turn' }, { ...msg, turnId: 't-1' }, live, 'files', DRY);
const nonsense = F.filesVerdict(CP, msg, live, 'everything', DRY);
ok(noUuid.reason === 'no-target-id' && turnRoad.ok === false && turnRoad.reason === 'not-offered' && nonsense.ok === false && nonsense.reason === 'not-a-choice',
  '② no uuid: refused; a files choice off the message road (a turn-granularity harness): not-offered; a choice that is none: not-a-choice', { noUuid, turnRoad, nonsense });
const off = F.filesVerdict(CP, msg, { live: true }, 'files', DRY), noList = F.filesVerdict(CP, msg, live, 'both', { ...DRY, files: [] }), conv = F.filesVerdict(CP, msg, { live: true }, 'conversation');
ok(off.reason === 'files-off' && noList.reason === 'files-off' && conv.ok === true && JSON.stringify(conv.steps) === '["conversation"]', '② a files choice where it is not drawn (checkpoints off, or the dry run lists none): files-off; the conversation only still goes', { off, noList, conv });
const both = F.filesVerdict(CP, msg, live, 'both', DRY);
ok(both.ok === true && JSON.stringify(both.steps) === '["files","conversation"]', '② an idle live conversation with checkpoints on and a dry run that names files: «both» may go, in order', both);
ok(Object.values(F.FILES_REFUSALS).every((c) => DOOR.ANSWER_CLASSES.includes(c)), '② every reason of this door has one of the conversation door\'s classes (the page words a class)');

console.log('— ③ the request and the answer');
ok(JSON.stringify(F.filesRequestOf('u-1', { dryRun: true })) === '{"subtype":"rewind_files","user_message_id":"u-1","dry_run":true}' && JSON.stringify(F.filesRequestOf('u-1')) === '{"subtype":"rewind_files","user_message_id":"u-1"}' && F.filesRequestOf('') === null && F.filesRequestOf(null) === null,
  '③ the body: rewind_files with the CLI\'s uuid of the person\'s message, dry_run only when asked; no uuid ⇒ no request');
const dry = F.filesAnswerOf({ canRewind: true, filesChanged: ['/w/a.js', '/w/b.md', '/w/a.js'], insertions: 12, deletions: 3.9 }, { dryRun: true });
ok(dry.ok && dry.dryRun && dry.filesKnown === true && JSON.stringify(dry.files) === '["/w/a.js","/w/b.md"]' && dry.plus === 12 && dry.minus === 3, '③ a dry run: its paths (2.1.322: a list of strings), once each; the lines it would add and remove', dry);
const absent = F.filesAnswerOf({ canRewind: true, insertions: 1 }, { dryRun: true }), odd = F.filesAnswerOf({ canRewind: true, filesChanged: ['/w/a.js', { filePath: '/w/b' }] }, { dryRun: true });
ok(absent.ok && absent.filesKnown === false && odd.ok && odd.filesKnown === false && JSON.stringify(F.choicesOf({ checkpoints: true, dry: absent })) === '["conversation"]' && JSON.stringify(F.choicesOf({ checkpoints: true, dry: odd })) === '["conversation"]',
  '③ a dry run whose list is absent or holds what is no path: filesKnown false — NOT an empty list (the files choices are not drawn: nothing unnamed is put back)', { absent, odd });
const press = F.filesAnswerOf({ canRewind: true, skippedLinks: 2 });
ok(press.ok && !press.dryRun && press.skipped === 2, '③ a press: done, the tracked links it skipped counted (2.1.322: a count)', press);
for (const [r, want, cls] of [[{ canRewind: false, error: 'File rewinding is not enabled.' }, 'checkpoints-off', 'cannot'], [{ canRewind: false, error: 'No file checkpoint found for this message.' }, 'no-checkpoint', 'cannot'], [{ error: 'Failed to rewind: No files were restored: 2 files failed' }, 'failed', 'failed'], [{ error: 'Unexpected error' }, 'cli-other', 'other'], [{ canRewind: false }, 'cli-other', 'other']]) {
  const a = F.filesAnswerOf(r); ok(!a.ok && a.reason === want && a.cls === cls && a.text === (r.error || null), `③ «${r.error || '(no words)'}» ⇒ ${want} (${cls}), its words kept`, a);
}
ok(!F.filesAnswerOf(null).ok && F.filesAnswerOf(null).reason === 'no-answer' && F.filesAnswerOf({ canRewind: true, insertions: -4, deletions: 'x' }).plus === 0, '③ no answer is named; a count that is no count reads 0');
const CAP_SRC = fs.readFileSync(path.join(REPO, 'scripts/measure-claude-rewind-files.mjs'), 'utf8');
ok(!/child_process|worker_threads|\b(?:spawn|spawnSync|execFile|execFileSync|execSync|fork)\(/.test(CAP_SRC) && /MEASURED by scripts\/measure-claude-rewind-files\.mjs/.test(CAP_SRC) && JSON.stringify([...CAP_SRC.matchAll(/^import [^;]* from '([^']+)';$/gm)].map((m) => m[1]).sort()) === '["node:crypto","node:fs","node:path","node:url"]',
  '③ the capture script READS the program file and starts no process (its imports: fs, path, crypto, url — nothing that runs anything)');
// THE ORACLE (主开发 r1104): the module judged against the capture of 2.1.322's own bytes — never a hand copy
const CAP = (() => { try { return JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/claude-cli/2.1.322-rewind-files.json'), 'utf8')); } catch { return null; } })();
ok(!!CAP && /MEASURED by scripts\/measure-claude-rewind-files\.mjs/.test(CAP._note) && CAP.cli === '2.1.322' && /^[0-9a-f]{64}$/.test(CAP.programSha256) && CAP.request.subtype === 'rewind_files'
  && JSON.stringify(CAP.request.fields) === JSON.stringify(Object.keys(F.filesRequestOf('u', { dryRun: true })).filter((k) => k !== 'subtype').sort())
  && CAP.words['checkpoints-off'] === F.CLI_WORDS['checkpoints-off'] && CAP.words['no-checkpoint'] === F.CLI_WORDS['no-checkpoint'] && CAP.words.failedPrefix === F.FAILED_PREFIX
  && JSON.stringify(CAP.reply.dryRun) === '["canRewind","filesChanged","insertions","deletions"]' && JSON.stringify(CAP.reply.press) === '["canRewind","skippedLinks"]'
  && /^paths \(strings\)/.test(CAP.dryRunList.form) && /DELETED/.test(CAP.dryRunList.deletions) && CAP.pressReply.skippedLinks === 'a count' && /success/.test(CAP.pressReply.someFailed)
  && CAP.gate.switch === 'CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING' && JSON.stringify(CAP.rows.types) === '["file-history-snapshot","file-history-delta"]',
  '③ THE ORACLE: the module against the capture of 2.1.322 — the request\'s fields, the reply\'s keys, the CLI\'s own words, the dry run\'s list of paths (deletions not told apart), the press\'s count, the switch, the rows', CAP && { cli: CAP.cli, words: CAP.words });

console.log('— ④ the person\'s own later edit');
const T0 = Date.parse('2026-11-21T09:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const person = (uuid, s) => ({ type: 'user', uuid, timestamp: at(s), message: { content: [{ type: 'text', text: 'go on' }] } });
const use = (id, name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
const res = (id, s, err) => ({ type: 'user', timestamp: at(s), message: { content: [{ type: 'tool_result', tool_use_id: id, ...(err ? { is_error: true } : {}), content: 'x' }] } });
const recs = [
  person('u-0', 0), use('t0', 'Edit', { file_path: '/w/old.js' }), res('t0', 1),             // before the target: never counted
  person('u-1', 5),                                                                            // THE TARGET
  use('t1', 'Edit', { file_path: '/w/a.js' }), res('t1', 10),
  use('t2', 'MultiEdit', { file_path: '/w/m.js' }), res('t2', 12),
  use('t3', 'NotebookEdit', { notebook_path: '/w/n.ipynb' }), res('t3', 14),
  use('t4', 'Write', { file_path: '/w/r.js' }), res('t4', 15), use('t5', 'Edit', { file_path: '/w/r.js' }), res('t5', 16, true), use('t6', 'Edit', { file_path: '/w/r.js' }), res('t6', 18),
  use('t7', 'Read', { file_path: '/w/c.txt' }), res('t7', 19),
  use('t8', 'Edit', { file_path: '/w/s.js' }), res('t8', 20),
  person('u-2', 30),                                                                           // a later turn: a person's edit of s.js may hide here
  use('t9', 'Edit', { file_path: '/w/s.js' }), res('t9', 40),
];
const E = F.lastEditsOf(recs, { targetUuid: 'u-1' });
ok(E.known && E.byPath['/w/a.js'].at === T0 + 10000 && E.byPath['/w/a.js'].turnsAfter === 0 && E.byPath['/w/m.js'].at === T0 + 12000 && E.byPath['/w/n.ipynb'].at === T0 + 14000 && E.byPath['/w/r.js'].refused === true && E.byPath['/w/s.js'].turnsAfter === 1 && !('/w/old.js' in E.byPath) && !('/w/c.txt' in E.byPath),
  '④ the agent\'s edits AFTER the target (Edit, MultiEdit, NotebookEdit, Write; a Read is none; an edit before the target never counts): the newest result\'s time, the turns between, a refused one marked', E.byPath);
const MT = { '/w/a.js': T0 + 10000, '/w/m.js': T0 + 30000, '/w/n.ipynb': T0 + 13500, '/w/r.js': T0 + 18000, '/w/s.js': T0 + 40000, '/w/o.js': T0 + 1000 };
const J = Object.fromEntries(F.changedAfterOf(['/w/a.js', '/w/m.js', '/w/n.ipynb', '/w/r.js', '/w/s.js', '/w/gone.txt'], { mtimes: { ...MT, '/w/gone.txt': null }, edits: E }).map((x) => [x.path, `${x.state}${x.why ? ':' + x.why : ''}`]));
console.log(`    (judged: ${JSON.stringify(J)})`);
ok(J['/w/a.js'] === 'same' && J['/w/m.js'] === 'changed' && J['/w/n.ipynb'] === 'same' && J['/w/r.js'] === 'unknown:refused-edit' && J['/w/s.js'] === 'unknown:several-turns' && J['/w/gone.txt'] === 'unknown:no-edit-known',
  '④ «same» only in the target\'s own turn at the agent\'s last edit; a write past it = changed; a refused edit and an edit across a later turn = could not be checked (a person\'s edit may hide between) — never a silent «same»');
const OLD = F.changedAfterOf(['/w/a.js'], { mtimes: { '/w/a.js': T0 + 1000 }, edits: E })[0], UNREAD = F.changedAfterOf(['/w/a.js'], { mtimes: {}, edits: E })[0], NOTGT = F.changedAfterOf(['/w/a.js'], { mtimes: MT, edits: F.lastEditsOf(recs, { targetUuid: 'u-404' }) })[0];
ok(OLD.why === 'older-time' && UNREAD.why === 'unreadable' && NOTGT.why === 'target-not-found' && [OLD, UNREAD, NOTGT].every((x) => x.state === 'unknown') && [OLD.why, UNREAD.why, NOTGT.why].every((w) => F.UNKNOWN_WHY.includes(w)),
  '④ a time well BEFORE the agent\'s last edit (an older copy put over it, another clock), a time not read, a target the records do not hold: could not be checked, each with its reason', { OLD, UNREAD, NOTGT });
const offered = F.choicesOf({ checkpoints: true, dry: DRY });
const sameOnly = F.changedAfterOf(['/w/a.js', '/w/n.ipynb'], { mtimes: MT, edits: E });
ok(F.defaultChoiceOf(offered, sameOnly) === 'both' && F.defaultChoiceOf(offered, F.changedAfterOf(['/w/a.js', '/w/s.js'], { mtimes: MT, edits: E })) === 'conversation' && F.defaultChoiceOf(offered, F.changedAfterOf(['/w/m.js'], { mtimes: MT, edits: E })) === 'conversation'
  && F.defaultChoiceOf(offered, []) === 'conversation' && F.defaultChoiceOf(F.choicesOf({ checkpoints: false }), sameOnly) === 'conversation',
  '④ the choice drawn as selected: «both» only when every listed file is plainly the same; any changed or not-checked file, an empty list, or no files choice ⇒ «the conversation only»');
const drawn = { files: ['/w/a.js'], judged: sameOnly.slice(0, 1), plus: 3, minus: 1 };
ok(F.sameDrawOf(drawn, { ...drawn, judged: [...drawn.judged] }) && !F.sameDrawOf(drawn, { ...drawn, judged: [{ path: '/w/a.js', state: 'changed', why: null }] }) && !F.sameDrawOf(drawn, { ...drawn, files: ['/w/a.js', '/w/z.js'] }) && !F.sameDrawOf(drawn, { ...drawn, plus: 4 }) && !F.sameDrawOf(drawn, null) && F.FILES_REFUSALS['changed-since'] === 'moved',
  '④ AT THE PRESS the dry run judged again must equal what the confirm drew — a file saved in between, one more file, other counts ⇒ changed-since (moved)');

console.log('— ⑤ «both»');
const o1 = F.outcomeOf(F.STEPS.both, { files: { ok: true }, conversation: { ok: true } });
const o2 = F.outcomeOf(F.STEPS.both, { files: { ok: true }, conversation: { ok: false } });
const o3 = F.outcomeOf(F.STEPS.both, { files: { ok: false, reason: 'failed', text: 'Failed to rewind: EACCES' } });
const o4 = F.outcomeOf(F.STEPS.both, { files: { ok: false, reason: 'failed', text: 'Failed to rewind: No files were restored: 2 files failed' } });
ok(JSON.stringify(o1) === '{"done":["files","conversation"],"failed":null,"notTried":[],"maybePartial":false}' && JSON.stringify(o2) === '{"done":["files"],"failed":"conversation","notTried":[],"maybePartial":false}'
  && JSON.stringify(o3) === '{"done":[],"failed":"files","notTried":["conversation"],"maybePartial":true}' && o4.maybePartial === false,
  '⑤ in order: the conversation failing after the files leaves the files said as done; the files failing mid-way may have put some back (said), «no files were restored» says none were', { o1, o2, o3, o4 });

console.log('— red controls');
const load = (from, to, tag) => M.load('src/rewind-files.js', anchored(SRC, from, to, `rewind-files: ${tag}`), tag);
const noTurn = load("    if (e.turnsAfter > 0) return { path, state: 'unknown', why: 'several-turns' };\n", '', 'no-turn-rule');
ok(noTurn.changedAfterOf(['/w/s.js'], { mtimes: MT, edits: noTurn.lastEditsOf(recs, { targetUuid: 'u-1' }) })[0].state === 'same', 'RED CONTROL (no turn rule): s.js — a person\'s edit could hide in the later turn — reads «same», a silent overwrite');
const noRefused = load("    if (e.refused) return { path, state: 'unknown', why: 'refused-edit' };\n", '', 'no-refused-rule');
ok(noRefused.changedAfterOf(['/w/r.js'], { mtimes: MT, edits: noRefused.lastEditsOf(recs, { targetUuid: 'u-1' }) })[0].state === 'same', 'RED CONTROL (no refused rule): r.js, whose edit was refused because it changed under the agent, reads «same»');
const noHigh = load('    if (m > e.at + HIGH_SLACK_MS) return', '    if (false) return', 'no-high-check');
ok(noHigh.changedAfterOf(['/w/m.js'], { mtimes: MT, edits: noHigh.lastEditsOf(recs, { targetUuid: 'u-1' }) })[0].state === 'same', 'RED CONTROL (no write-after check): m.js written 18 s after the agent\'s last edit reads «same»');
const noCheck = load("  return list.every((x) => x && x.state === 'same') ? 'both' : 'conversation';", "  return 'both';", 'default-no-check');
ok(noCheck.defaultChoiceOf(offered, F.changedAfterOf(['/w/m.js'], { mtimes: MT, edits: E })) === 'both', 'RED CONTROL (the default without the changed check): a changed file is preselected for «both»');
const swapped = load("both: Object.freeze(['files', 'conversation'])", "both: Object.freeze(['conversation', 'files'])", 'both-order');
ok(JSON.stringify(swapped.stepsOf('both')) === '["conversation","files"]', 'RED CONTROL (the other order): the control flips the order ① pins');
const asEmpty = load('  const filesKnown = Array.isArray(raw) && list.length === raw.length;', '  const filesKnown = true;', 'unknown-list-as-empty');
ok(JSON.stringify(asEmpty.choicesOf({ checkpoints: true, dry: asEmpty.filesAnswerOf({ canRewind: true, filesChanged: ['/w/a.js', { filePath: '/w/b' }] }, { dryRun: true }) })) === '["conversation","files","both"]', 'RED CONTROL (an unreadable list taken as read): the files choices are drawn over a file nobody named');

report();
