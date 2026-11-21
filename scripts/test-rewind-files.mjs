#!/usr/bin/env node
// test-rewind-files (fast, PURE — row B-437e, the files tier, U2's pure part; 主开发 r1080 (B), (C), (7)): src/rewind-files.js
//   ① THE CHOICES — the files choices only where the conversation's own facts say checkpoints are on AND its dry run listed
//      files it can name; «both» runs the files, then the conversation
//   ② THE VERDICT — the conversation door's own refusals first (one rule), then the files' own (not-a-choice, not-offered off the
//      message road, files-off); every class one of the door's ANSWER_CLASSES
//   ③ THE REQUEST and THE ANSWER — the CLI's answers in one shape, each refusal named by its own words (2.1.322, read as bytes),
//      an unknown one kept with its text; a dry run whose list is absent or holds what is no path is NOT an empty list
//   ④ THE PERSON'S OWN LATER EDIT, from the normalizer's records — «same» ONLY where they prove nothing but the agent's ONE write
//      touched the file (r1232): one successful edit after the target, in its own turn, never refused, of a file not edited before
//      the target, its time at that edit; else could not be checked; the choice drawn as selected; a taken-back message offers no
//      files choice (r1232); AT THE PRESS the dry run judged again must equal what the confirm drew (changed-since)
//   ⑤ «BOTH» — a files failure is «some may have been put back» but where nothing changed by construction (r1232)
//   RED CONTROLS (anchored copies): no one-edit rule, no edited-before rule, no turn rule, no refused rule, no write-after check,
//   the default without the changed check, «both» in the other order, an unreadable list read as known, only the named failure
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
const at = (sec) => T0 + sec * 1000;
// the NORMALIZER'S records (r1230): person messages, and tool messages whose block is a tool_result with its own resultAt
const person = (id, uuid) => ({ id, role: 'user', uuid, content: [{ type: 'text', text: 'go on' }] });
const tool = (id, name, input, sec, status = 'ok') => ({ id, role: 'tool', content: [{ type: 'tool_result', toolCallId: 'c-' + id, toolName: name, input, output: 'x', status, resultAt: at(sec) }] });
const recs = [
  person('p0', 'u-0'), tool('k0', 'Edit', { file_path: '/w/old.js' }, 1),                           // BEFORE the target
  person('p1', 'u-1'),                                                                               // THE TARGET
  tool('k1', 'Edit', { file_path: '/w/a.js' }, 10),                                                  // one edit: the only plain case
  tool('k2', 'MultiEdit', { file_path: '/w/m.js' }, 12),
  tool('k3', 'NotebookEdit', { notebook_path: '/w/n.ipynb' }, 14),
  tool('k4', 'Write', { file_path: '/w/r.js' }, 15), tool('k5', 'Edit', { file_path: '/w/r.js' }, 16, 'error'), tool('k6', 'Edit', { file_path: '/w/r.js' }, 18),
  tool('k7', 'Read', { file_path: '/w/c.txt' }, 19),
  tool('k8', 'Edit', { file_path: '/w/e.js' }, 20), tool('k8r', 'Read', { file_path: '/w/e.js' }, 21), tool('k9', 'Edit', { file_path: '/w/e.js' }, 22),   // edit, a read, edit — one turn (r1232)
  tool('k10', 'Edit', { file_path: '/w/d.js' }, 23), tool('k11', 'Edit', { file_path: '/w/d.js' }, 24),                                                  // edit, edit, nothing between
  tool('k12', 'Edit', { file_path: '/w/old.js' }, 25),                                                // edited BEFORE the target too
  tool('k13', 'Edit', { file_path: '/w/s.js' }, 26),
  person('p2', 'u-2'),                                                                                // a later turn
  tool('k14', 'Edit', { file_path: '/w/t.js' }, 40),
];
const E = F.editsFromMessages(recs, { targetId: 'p1' });
ok(E.known && E.byPath['/w/a.js'].count === 1 && E.byPath['/w/a.js'].at === at(10) && E.byPath['/w/m.js'].count === 1 && E.byPath['/w/n.ipynb'].count === 1 && E.byPath['/w/r.js'].refused === true && E.byPath['/w/e.js'].count === 2 && E.byPath['/w/d.js'].count === 2 && E.byPath['/w/t.js'].turnsAfter === 1 && JSON.stringify(E.before) === '["/w/old.js"]' && !('/w/c.txt' in E.byPath),
  '④ the agent\'s edits from the normalizer\'s records (Edit, MultiEdit, NotebookEdit, Write; a Read is none): after the target each file\'s count, newest time, turns, refusals — and the files it edited BEFORE the target', E);
const MT = { '/w/a.js': at(10), '/w/m.js': at(30), '/w/n.ipynb': at(13.5), '/w/r.js': at(18), '/w/e.js': at(22), '/w/d.js': at(24), '/w/old.js': at(25), '/w/s.js': at(26), '/w/t.js': at(40) };
const J = Object.fromEntries(F.changedAfterOf(['/w/a.js', '/w/m.js', '/w/n.ipynb', '/w/r.js', '/w/e.js', '/w/d.js', '/w/old.js', '/w/t.js', '/w/gone.txt'], { mtimes: { ...MT, '/w/gone.txt': null }, edits: E }).map((x) => [x.path, `${x.state}${x.why ? ':' + x.why : ''}`]));
console.log(`    (judged: ${JSON.stringify(J)})`);
ok(J['/w/a.js'] === 'same' && J['/w/n.ipynb'] === 'same' && J['/w/m.js'] === 'changed' && J['/w/r.js'] === 'unknown:refused-edit' && J['/w/old.js'] === 'unknown:edited-before' && J['/w/t.js'] === 'unknown:several-turns' && J['/w/gone.txt'] === 'unknown:no-edit-known',
  '④ «same» ONLY for one edit in the target\'s own turn, never refused, of a file not edited before the target, its time at that edit; a write past it = changed; a refused edit, an edit before the target (its backup may be the target\'s), a later turn: could not be checked');
ok(J['/w/e.js'] === 'unknown:several-edits' && J['/w/d.js'] === 'unknown:several-edits',
  '④ THE LAW (r1232 MUST 1): edit, a read, edit in ONE turn — a person\'s save may sit between — and edit, edit with nothing between: could not be checked, never «same» (the newest edit\'s time would hide the save)');
const OLD = F.changedAfterOf(['/w/a.js'], { mtimes: { '/w/a.js': at(1) }, edits: E })[0], UNREAD = F.changedAfterOf(['/w/a.js'], { mtimes: {}, edits: E })[0], NOTGT = F.changedAfterOf(['/w/a.js'], { mtimes: MT, edits: F.editsFromMessages(recs, { targetId: 'p-404' }) })[0];
const OVER = F.changedAfterOf(Array.from({ length: F.MAX_FILES + 2 }, (_, k) => k ? `/w/x${k}.js` : '/w/a.js'), { mtimes: MT, edits: E });
ok(OLD.why === 'older-time' && UNREAD.why === 'unreadable' && NOTGT.why === 'target-not-found' && OVER[0].state === 'same' && OVER.slice(F.MAX_FILES).every((x) => x.why === 'over-bound') && F.MAX_FILES === 64 && [OLD.why, UNREAD.why, NOTGT.why, 'over-bound', 'edited-before', 'several-edits'].every((w) => F.UNKNOWN_WHY.includes(w)),
  '④ a time well BEFORE the edit, a time not read, a target the records lack, a file past the 64 one confirm judges: could not be checked, each with its reason');
const offered = F.choicesOf({ checkpoints: true, dry: DRY });
const sameOnly = F.changedAfterOf(['/w/a.js', '/w/n.ipynb'], { mtimes: MT, edits: E });
ok(F.defaultChoiceOf(offered, sameOnly) === 'both' && F.defaultChoiceOf(offered, F.changedAfterOf(['/w/a.js', '/w/e.js'], { mtimes: MT, edits: E })) === 'conversation' && F.defaultChoiceOf(offered, F.changedAfterOf(['/w/m.js'], { mtimes: MT, edits: E })) === 'conversation'
  && F.defaultChoiceOf(offered, []) === 'conversation' && F.defaultChoiceOf(F.choicesOf({ checkpoints: false }), sameOnly) === 'conversation',
  '④ the choice drawn as selected: «both» only when every listed file is plainly the same; anything else ⇒ «the conversation only»');
const taken = F.filesVerdict(CP, { ...msg, rewound: true }, live, 'files', DRY);
ok(taken.ok === false && taken.reason === 'already-rewound',
  '④ a message whose conversation was ALREADY taken back offers no files choice in this tier (主开发 r1232, reversing r1230: its turn is a dead branch)', taken);
const drawn = { files: ['/w/a.js'], judged: sameOnly.slice(0, 1), plus: 3, minus: 1 };
ok(F.sameDrawOf(drawn, { ...drawn, judged: [...drawn.judged] }) && !F.sameDrawOf(drawn, { ...drawn, judged: [{ path: '/w/a.js', state: 'changed', why: null }] }) && !F.sameDrawOf(drawn, { ...drawn, files: ['/w/a.js', '/w/z.js'] }) && !F.sameDrawOf(drawn, { ...drawn, plus: 4 }) && !F.sameDrawOf(drawn, null) && F.FILES_REFUSALS['changed-since'] === 'moved',
  '④ AT THE PRESS the dry run judged again must equal what the confirm drew — else changed-since (moved)');

console.log('— ⑤ «both»');
const o = (files) => F.outcomeOf(F.STEPS.both, { files, conversation: { ok: true } });
const o1 = F.outcomeOf(F.STEPS.both, { files: { ok: true }, conversation: { ok: true } });
const o2 = F.outcomeOf(F.STEPS.both, { files: { ok: true }, conversation: { ok: false } });
ok(JSON.stringify(o1) === '{"done":["files","conversation"],"failed":null,"notTried":[],"maybePartial":false}' && JSON.stringify(o2) === '{"done":["files"],"failed":"conversation","notTried":[],"maybePartial":false}',
  '⑤ in order: the conversation failing after the files leaves the files said as done');
const partial = [['no answer (a time-out)', { ok: false, reason: 'no-answer' }], ['words this door does not know', { ok: false, reason: 'cli-other', text: 'Something new' }], ['a failure mid-way', { ok: false, reason: 'failed', text: 'Failed to rewind: EACCES' }], ['a CLI that died mid-press', { ok: false, reason: 'no-answer', sent: true }]];
const none = [['checkpoints off', { ok: false, reason: 'checkpoints-off', text: 'File rewinding is not enabled.' }], ['no checkpoint', { ok: false, reason: 'no-checkpoint' }], ['changed since (the door, before it sent)', { ok: false, reason: 'changed-since', sent: false }], ['a door refusal before anything was sent', { ok: false, reason: 'stopped', sent: false }], ['«No files were restored» (the CLI\'s own words)', { ok: false, reason: 'failed', text: 'Failed to rewind: No files were restored: 2 files failed' }]];
ok(partial.every(([, r]) => o(r).maybePartial === true && o(r).failed === 'files' && JSON.stringify(o(r).notTried) === '["conversation"]') && none.every(([, r]) => o(r).maybePartial === false),
  `⑤ A FILES FAILURE (r1232 MUST 2) is «not known: some files may have been put back» — ${partial.map(([n]) => n).join(', ')} — except where nothing changed by construction: ${none.map(([n]) => n).join(', ')}`);

console.log('— red controls');
const load = (from, to, tag) => M.load('src/rewind-files.js', anchored(SRC, from, to, `rewind-files: ${tag}`), tag);
const judge1 = (mod, path) => mod.changedAfterOf([path], { mtimes: MT, edits: mod.editsFromMessages(recs, { targetId: 'p1' }) })[0].state;
const noCount = load("    if (e.count !== 1) return { path, state: 'unknown', why: 'several-edits' };\n", '', 'no-count-rule');
ok(judge1(noCount, '/w/e.js') === 'same' && judge1(noCount, '/w/d.js') === 'same', 'RED CONTROL (no one-edit rule): edit-read-edit and edit-edit read «same» — a person\'s save between them lost');
const noBefore = load("    if (Array.isArray(edits.before) && edits.before.includes(path)) return { path, state: 'unknown', why: 'edited-before' };\n", '', 'no-before-rule');
ok(judge1(noBefore, '/w/old.js') === 'same', 'RED CONTROL (no edited-before rule): a file the agent edited before the target (its backup may be the target\'s message) reads «same»');
const noTurn = load("    if (e.turnsAfter > 0) return { path, state: 'unknown', why: 'several-turns' };\n", '', 'no-turn-rule');
ok(judge1(noTurn, '/w/t.js') === 'same', 'RED CONTROL (no turn rule): an edit in a later turn reads «same»');
const noRefused = load("    if (e.refused) return { path, state: 'unknown', why: 'refused-edit' };\n", '', 'no-refused-rule');
ok(noRefused.changedAfterOf(['/w/r.js'], { mtimes: MT, edits: { ...noRefused.editsFromMessages(recs, { targetId: 'p1' }), byPath: { '/w/r.js': { at: at(18), count: 1, turnsAfter: 0, refused: true } } } })[0].state === 'same', 'RED CONTROL (no refused rule): a file whose edit was refused because it changed under the agent reads «same»');
const noHigh = load('    if (m > e.at + HIGH_SLACK_MS) return', '    if (false) return', 'no-high-check');
ok(judge1(noHigh, '/w/m.js') === 'same', 'RED CONTROL (no write-after check): m.js written 18 s after the agent\'s one edit reads «same»');
const noCheck = load("  return list.every((x) => x && x.state === 'same') ? 'both' : 'conversation';", "  return 'both';", 'default-no-check');
ok(noCheck.defaultChoiceOf(offered, F.changedAfterOf(['/w/m.js'], { mtimes: MT, edits: E })) === 'both', 'RED CONTROL (the default without the changed check): a changed file is preselected for «both»');
const swapped = load("both: Object.freeze(['files', 'conversation'])", "both: Object.freeze(['conversation', 'files'])", 'both-order');
ok(JSON.stringify(swapped.stepsOf('both')) === '["conversation","files"]', 'RED CONTROL (the other order): the control flips the order ① pins');
const asEmpty = load('  const filesKnown = Array.isArray(raw) && list.length === raw.length;', '  const filesKnown = true;', 'unknown-list-as-empty');
ok(JSON.stringify(asEmpty.choicesOf({ checkpoints: true, dry: asEmpty.filesAnswerOf({ canRewind: true, filesChanged: ['/w/a.js', { filePath: '/w/b' }] }, { dryRun: true }) })) === '["conversation","files","both"]', 'RED CONTROL (an unreadable list taken as read): the files choices are drawn over a file nobody named');
const oneNamed = load("  const maybePartial = failed === 'files' && !(fr && (NO_CHANGE.includes(fr.reason) || fr.sent === false || /No files were restored/.test(String(fr.text || ''))));", "  const maybePartial = !!fr && fr.reason === 'failed';", 'only-the-named-failure');
ok(oneNamed.outcomeOf(F.STEPS.both, { files: { ok: false, reason: 'no-answer' } }).maybePartial === false, 'RED CONTROL (r1232 MUST 2\'s old rule: only the named failure is partial): a press with no answer reads «nothing put back»');

report();
