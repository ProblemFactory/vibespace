#!/usr/bin/env node
// THE PERSON'S ROW (lane minimap-person-rows; the owner 2026-11-04, over the chat minimap's «筛选 12190 条消息…» list:
// the person's own messages were buried under VibeSpace's notes, other sessions' deliveries, background-task wakes and
// compaction summaries). PURE src/assistant-note.js `personRow(record) → {person, why}` is THE answer to «did the person
// type this user record?»: turnPreviewOf stamps `other: why` on every turn nobody typed (the minimap's message list
// folds those behind one chip — test-minimap-jump §5 drives that in chrome) and the chat's renderer picks its system
// card by the same verdict.
//   §1 every kind from REAL record shapes — scripts/fixtures/message-origin/claude-user-records.jsonl (the keys copied
//      verbatim from this box's Claude Code transcripts: origin / promptSource / isMeta / isCompactSummary / turnOrigin …;
//      the words neutral; the uuid names the expected verdict) through the REAL claude normalizer (the turnMap the attach
//      slab sends) and the REAL huge-session JSONL scan, plus the live cards the normalizers' own writers make (a group
//      report card, a Background Work notice, another session's message); a TYPED record shaped like a notice stays the
//      person's (provenance beats words)
//      r2 (LAW A′ — one verdict = ONE function over ONE record shape): record by record, the attach slab's turnMap (the
//      normalizer fed one record at a time) and the huge-session scan give the SAME turn or both none — for the claude
//      fixture and scripts/fixtures/message-origin/codex-user-items.jsonl (the codex rollout's real item shapes); the
//      scan asks the normalizers' own functions (message-manager userRecordOf / codex-message-manager userItemOf)
//   §2 the readers: the renderer and the list ask the verdict, every turn builder stamps it, nobody keeps a second copy
//   §3 mutants (in memory, nothing written): each kind's line taken out ⇒ exactly that kind's rows go red, by name;
//      r2: the scan's own text test / its blindness to the companion rule / r1's codex scan ⇒ the cross-builder leg red
//      on exactly those records; the typed guard broken ⇒ the typed paste red; the shared function broken ⇒ its row red
//   §4 the census: every `role === 'user'` / `!== 'user'` site in src/lib/ reads the verdict or is named with its reason
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // (mutant-copy.mjs loads scratch.mjs already)
import { AsyncLocalStorage } from 'node:async_hooks';   // B-9a2e: the stand-in device's op scope, as the agent's

const T0 = process.hrtime.bigint();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0;
const ok = (name, cond, detail) => { if (typeof cond !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`);
  if (cond) { passed++; console.log('  ✓ ' + name); return; }
  failed++;
  let d = ''; try { d = detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700); } catch { d = ' — ' + String(detail); }
  console.log('  ✗ ' + name + d);
};
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(`ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`, false); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const AN_PATH = path.join(REPO, 'src/assistant-note.js');
const AN = require(AN_PATH);
const MM_PATH = path.join(REPO, 'src/message-manager.js');
const { MessageManager } = require(MM_PATH);
const { CodexMessageManager } = require(path.join(REPO, 'src/codex-message-manager.js'));
const { placeGroupCard } = require(path.join(REPO, 'src/normalizers.js'));
const CX_PATH = path.join(REPO, 'src/adapters/codex.js');
const CX = require(CX_PATH);
const FIXTURE_SRC = path.join(REPO, 'scripts/fixtures/message-origin/claude-user-records.jsonl');
const CX_FIXTURE = path.join(REPO, 'scripts/fixtures/message-origin/codex-user-items.jsonl');
const RECS = fs.readFileSync(FIXTURE_SRC, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
// B-3d90 (3): two rows CONSTRUCTED (not copied from a transcript): no scheduled fire was found on this box. Their keys are
// the CLI's own (Claude Code 2.1.322's bundle): a user record carries `wakeupSource` ('loop_wakeup' | 'schedule_wakeup')
// on a scheduler fire, and `promptSource: 'system'` is its «other machine-injected turns (peer/channel messages, task
// notifications, auto-continuation)» — the follow-up: no 'system' record WITHOUT an origin was measured, so that one
// keeps today's answer (typed); wakeupSource stays unmeasured on a real record (only the scheduler writes it). Every builder reads them: the normalizer from RECS, the scan from FIXTURE (the
// verbatim file + these two, written in this run's scratch folder)
RECS.push({ type: 'user', promptSource: 'sdk', wakeupSource: 'loop_wakeup', uuid: 'mo-notification-wakeup', message: { role: 'user', content: 'Check whether the CI run finished and report the result.' }, timestamp: '2026-11-04T20:00:30.000Z' },
  { type: 'user', promptSource: 'system', uuid: 'mo-typed-sysprompt', message: { role: 'user', content: 'Continue with the plan from the last turn.' }, timestamp: '2026-11-04T20:00:31.000Z' });
const MUTC = mutantCopies('message-origin', REPO);
const FIXTURE = path.join(MUTC.dir, 'claude-user-records.jsonl');
fs.writeFileSync(FIXTURE, RECS.map((r) => JSON.stringify(r)).join('\n') + '\n');
const CX_RECS = fs.readFileSync(CX_FIXTURE, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const expectOf = (id) => (/^(?:mo|cx)-(.+?)-[^-]+$/.exec(id || '') || [])[1] || null;   // mo-<why>-<n> / cx-<why>-<n>; why 'noturn' = no turn of its own
// THE SPEC's kinds (the brief's list + r2's interrupt marker): the person's rows stay listed, every other kind is folded
const PERSON_WHYS = ['typed', 'tray-answer', 'command'];
const OTHER_WHYS = ['attachment', 'note', 'auto-resume', 'notice', 'peer', 'notification', 'interrupt', 'compact'];
// a copy of a module with a patch, evaluated in memory (nothing written) — its requires resolve beside the original
const loadPatchedAt = (file, patched) => { const mod = { exports: {} }; new Function('require', 'module', 'exports', '__filename', '__dirname', patched)(createRequire(file), mod, mod.exports, file, path.dirname(file)); return mod.exports; };
// THE CROSS-BUILDER LEG (r2): record i → the user turn it opened in the attach slab (the normalizer fed one record at a
// time, then its turnMap) and in the huge-session scan (line i); a turn's face = its verdict + what the list shows
const faceOf = (e) => (e ? JSON.stringify({ other: e.other || null, preview: e.preview, note: e.note || null, compact: !!e.isCompact }) : 'no turn');
function slabTurnsOf(Manager, recs) {
  const m = new Manager('mo-x'); const out = []; let n = 0;
  recs.forEach((r, i) => { m.processLive(r); const t = m.turnMap().filter((e) => e.role === 'user'); if (t.length > n) out[i] = t[t.length - 1]; n = t.length; });
  return out;
}
const scanTurnsOf = (scan) => { const at = []; for (const e of scan) at[e.line] = e; return at; };
const disagree = (slab, scanAt, recs, idOf) => recs.map((r, i) => [idOf(r), faceOf(slab[i]), faceOf(scanAt[i])]).filter(([, a, b]) => a !== b);
const idOfMo = (r) => r.uuid, idOfCx = (r) => r.payload?.id;
const fnBody = (src, head) => { const i = src.indexOf(head); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i) + 2); };   // a top-level function's source
const PERSON = new Set(PERSON_WHYS);
// on a tree without the verdict every row reads as the person's — each folded row then goes red BY NAME, never a crash
const personRow = typeof AN.personRow === 'function' ? AN.personRow : () => ({ person: true, why: 'typed' });

console.log('§1 THE KINDS — real record shapes through the real normalizer, the real scan and the live card writers');
ok('src/assistant-note.js exports personRow — THE verdict «did the person type this user record?»', typeof AN.personRow === 'function');
ok('…and its kinds are exactly the spec\'s (the person\'s / nobody\'s)', JSON.stringify(AN.PERSON_WHYS) === JSON.stringify(PERSON_WHYS) && JSON.stringify(AN.OTHER_WHYS) === JSON.stringify(OTHER_WHYS), { person: AN.PERSON_WHYS, other: AN.OTHER_WHYS });
const mm = new MessageManager('mo');
for (const r of RECS) mm.processLive(r);
const byUuid = new Map(mm.messages.filter((m) => m.role === 'user').map((m) => [m.uuid, m]));
// the live cards: the delivery ladder's notification path, another session's message, a group report card
const live = [
  [mm.injectPeerCard({ fromName: 'Background Work · nightly-build', text: 'nightly-build finished (exit 0, 4 min)', kind: 'notification' }), 'notice', 'a Background Work notice (the ladder\'s notification path)'],
  [mm.injectPeerCard({ fromName: 'Lane worker', text: 'done — the report is in report.md', kind: 'peer' }), 'peer', 'another session\'s message (vibespace-msg)'],
  [placeGroupCard(mm, { fromName: 'Coordinator', text: 'please take the next lane', group: { id: 'g-0123abcd', name: 'Lane chat', at: Date.parse('2026-11-04T20:01:00Z'), from: 'Coordinator', via: 'report' } }), 'peer', 'a group report card (normalizers placeGroupCard)'],
];
const judged = [];   // [{name, rec, want}] — every normalized record with its expected verdict
for (const r of RECS) {
  if (expectOf(r.uuid) === 'noturn') continue;   // a companion line / the safety nudge: no turn of its own (the cross-builder leg below)
  const m = byUuid.get(r.uuid);
  ok(`${r.uuid}: the normalizer kept the record`, !!m);
  if (m) judged.push({ name: r.uuid, rec: m, want: expectOf(r.uuid) });
}
for (const [m, want, what] of live) { ok(`${what}: the writer made its card`, !!m); if (m) judged.push({ name: what, rec: m, want }); }
for (const j of judged) {
  const v = personRow(j.rec);
  ok(`${j.name} → «${j.want}» (${PERSON.has(j.want) ? 'the person\'s — listed' : 'nobody typed it — folded'})`, v.why === j.want && v.person === PERSON.has(j.want), v);
}
const seen = new Set(judged.map((j) => j.want));
ok(`every kind is exercised by a real shape — the person's (${PERSON_WHYS.join(', ')}) and nobody's (${OTHER_WHYS.join(', ')})`,
  verdictOf([...PERSON_WHYS, ...OTHER_WHYS].every((w) => seen.has(w))), [...PERSON_WHYS, ...OTHER_WHYS].filter((w) => !seen.has(w)));
// the turn map the attach slab sends (message-window turnMap → turnPreviewOf): `other` exactly on the rows nobody typed
const turns = mm.turnMap().filter((e) => e.role === 'user');
const turnRows = turns.map((e) => { const j = judged.find((x) => x.rec === mm.messages[e.startIdx]); return { name: j ? j.name : null, want: j ? j.want : null, other: e.other || null, preview: e.preview, note: e.note || null }; });
const badTurns = turnRows.filter((e) => !e.want || (PERSON.has(e.want) ? e.other !== null : e.other !== e.want));
const TURNED = RECS.filter((r) => !['attachment', 'noturn'].includes(expectOf(r.uuid)));   // the page images and the no-turn lines open none
ok(`the attach slab's turnMap: \`other\` on exactly the ${turnRows.filter((e) => e.other).length} turns nobody typed, never on the person's ${turnRows.filter((e) => !e.other).length}`, turnRows.length === TURNED.length + live.length && badTurns.length === 0, { n: turnRows.length, badTurns });
const pv = (u) => turnRows.find((e) => e.name === u) || {};
ok('a For-you answer previews its ANSWER — never the tray\'s marker and quote', pv('mo-tray-answer-1').preview === 'B — tonight is fine, tell me when it is done', pv('mo-tray-answer-1'));
ok('a slash command the person ran previews as "/compact" — never its tags', pv('mo-command-1').preview === '/compact', pv('mo-command-1'));
ok('a note keeps its sentence slot (no text, `note: status`) and a compaction summary says so — both folded', pv('mo-note-1').preview === '' && pv('mo-note-1').note === 'status' && pv('mo-note-1').other === 'note' && pv('mo-compact-1').preview === AN.COMPACT_PREVIEW && pv('mo-compact-1').other === 'compact');
// the huge-session JSONL scan (the full-extent minimap's turns): the same verdict off the raw records
const scan = CX.scanJsonlUserTurns(FIXTURE, 'claude');
const scanBad = scan.filter((e) => { const w = expectOf(RECS[e.line]?.uuid); return !w || (PERSON.has(w) ? !!e.other : e.other !== w); });
ok(`the huge-session scan: the same verdict on all ${scan.length} turns (the page images and the no-turn lines open none)`, scan.length === TURNED.length && scanBad.length === 0, scanBad.map((e) => [RECS[e.line]?.uuid, e.other]));
// r2, LAW A′: the two builders agree record by record — the claude fixture and the codex rollout's items
const slabMo = slabTurnsOf(MessageManager, RECS), scanMo = scanTurnsOf(scan);
const crossMo = disagree(slabMo, scanMo, RECS, idOfMo);
ok(`THE BUILDERS AGREE (claude): the attach slab's turnMap and the huge-session scan give every one of the ${RECS.length} records the same turn — verdict, preview, note, compact — or both none`, crossMo.length === 0, crossMo);
const twin = (id) => { const i = RECS.findIndex((r) => r.uuid === id); return [faceOf(slabMo[i]), faceOf(scanMo[i])]; };
const personIn = (id) => twin(id).every((f) => f !== 'no turn' && JSON.parse(f).other === null);
ok('a TYPED message that opens with the task tag (block-list content — the shape VibeSpace\'s own sends have) is the person\'s in both builders', verdictOf(personIn('mo-typed-tasktag')), twin('mo-typed-tasktag'));
ok('a TYPED paste of the compaction summary\'s head is the person\'s in both builders — their words, never «Context compacted»', gateOf(personIn('mo-typed-compactpaste')) && verdictOf(JSON.parse(twin('mo-typed-compactpaste')[0]).preview.startsWith('This session is being continued')), twin('mo-typed-compactpaste'));
const noTurn = RECS.filter((r) => expectOf(r.uuid) === 'noturn').map((r) => r.uuid);
const turned = noTurn.filter((id) => twin(id).some((f) => f !== 'no turn'));
ok(`the companion lines («[Image source: …]», a skill's body, «Caveat:») and the safety stop's nudge have no turn of their own in either builder (${noTurn.join(', ')})`, noTurn.length === 4 && turned.length === 0, turned.map((id) => [id, ...twin(id)]));
const slabCx = slabTurnsOf(CodexMessageManager, CX_RECS), scanCx = scanTurnsOf(CX.scanJsonlUserTurns(CX_FIXTURE, 'codex'));
const crossCx = disagree(slabCx, scanCx, CX_RECS, idOfCx);
ok(`THE BUILDERS AGREE (codex): the codex normalizer's turnMap and the huge-session scan give every one of the ${CX_RECS.length} rollout items the same turn, or both none`, crossCx.length === 0, crossCx);
const cxBad = CX_RECS.map((r, i) => [idOfCx(r), expectOf(idOfCx(r)), slabCx[i]]).filter(([, want, e]) => (want === 'noturn' ? !!e : !e || (PERSON.has(want) ? !!e.other : e.other !== want)));
ok('…and the verdict is each item\'s own: the goal\'s auto-continue opens no turn, the rollout copy of a peer / a notice folds, a typed send that only looks like a frame stays the person\'s', cxBad.length === 0, cxBad.map(([id, want, e]) => [id, want, e ? e.other || 'listed' : 'no turn']));
// provenance beats words: a record the person TYPED is theirs whatever it looks like
const typed = (text) => ({ role: 'user', typed: true, content: [{ type: 'text', text }] });
const looksLike = [
  ['<system-reminder>pasted</system-reminder>', 'a pasted reminder tag'],
  ['Stop hook feedback:\nVibeSpace bookkeeping before you stop', 'the Stop nudge, quoted'],
  ['<local-command-stdout>pasted</local-command-stdout>', 'a pasted command output'],
  ['[Request interrupted by user]', 'the interrupt marker'],
  ['This session is being continued from a previous conversation that ran out of context.', 'the compaction summary\'s head'],
];
for (const [text, what] of looksLike) ok(`a TYPED message shaped like ${what} stays the person's`, personRow(typed(text)).why === 'typed', personRow(typed(text)));
// the interrupt kind reads the CLI's own two markers, letter for letter (permission-outcome's census: the binary's user-message markers)
const PO_ROWS = require(path.join(REPO, 'src/permission-outcome.js')).PERMISSION_OUTCOME_ROWS.filter((r) => r.id === 'Jw' || r.id === 'Ud');
const said = (text) => ({ role: 'user', content: [{ type: 'text', text }] });
ok('the interrupt kind is the CLI\'s two markers — permission-outcome\'s census rows Jw / Ud, letter for letter', PO_ROWS.length === 2 && verdictOf(PO_ROWS.every((r) => personRow(said(r.text)).why === 'interrupt')), PO_ROWS.map((r) => [r.id, personRow(said(r.text)).why]));
ok('…and nothing broader: a sentence that only resembles them, or quotes one mid-text, stays the person\'s', personRow(said('[Request interrupted by the user]')).why === 'typed' && personRow(said('I saw [Request interrupted by user] earlier')).why === 'typed');
ok('an empty / missing record never throws (nothing to fold)', personRow(null).person === true && AN.turnPreviewOf({ role: 'user', content: [] }) === null);

console.log('§2 THE READERS — the renderer and the list ask the verdict; every builder stamps it; nobody keeps a copy');
{
  const cr = read('src/lib/chat-renderers.js');
  ok('chat-renderers imports personRow from the PURE module', verdictOf(/^import \{ personRow \} from '\.\.\/assistant-note\.js';/m.test(cr)));
  ok('renderUserMsg asks it ONCE and draws the notification card / the command bubble by its word', verdictOf(/const origin = personRow\(msg\);\n\s*const isNotification = origin\.why === 'notification' \|\| origin\.why === 'command';/.test(cr)));
  ok('…and the For-you answer card by its word', verdictOf(/const inboxReply = origin\.why === 'tray-answer' \? parseInboxReply\(rawText\) : null;/.test(cr)));
  ok('the renderer keeps no copy of the notification shapes (they moved into personRow)', !/command-name\|local-command\|task-notification\|system-reminder/.test(cr) && !/A session-scoped Stop hook is now active\/\.test/.test(cr));
  const an = read('src/assistant-note.js');
  ok('personRow holds them, once', (an.match(/command-name\|local-command\|task-notification\|system-reminder/g) || []).length === 1);
  const mmap = read('src/lib/chat-minimap.js');
  const toc = mmap.slice(mmap.indexOf('  _showToc() {'), mmap.indexOf('  dispose() {'));
  ok('the list folds by the stamp: listed = the person\'s rows unless the chip is on, the chip counts the rest', gateOf(/const folded = turns\.filter\(\(tt\) => tt\.other\)\.length;/.test(toc)) && gateOf(/const listed = showOther \? turns : turns\.filter\(\(tt\) => !tt\.other\);/.test(toc)) && verdictOf(/for \(const turn of listed\)/.test(toc)));
  ok('the placeholder counts what is listed', verdictOf(/filter\.placeholder = t\('Filter \{n\} messages…', \{ n: listed\.length \}\);/.test(toc)));
  ok('the chip says the count in the device\'s words (two t() keys), is a pressed-state button, and is absent when nothing is folded',
    gateOf(/t\('System & other sources ×\{n\} · Show', \{ n: folded \}\)/.test(toc)) && gateOf(/t\('System & other sources ×\{n\} · Hide', \{ n: folded \}\)/.test(toc)) && gateOf(/chip\.setAttribute\('aria-pressed', String\(showOther\)\);/.test(toc)) && verdictOf(/if \(folded\) pop\.appendChild\(chip\);/.test(toc)));
  ok('a list with nothing the person typed says so and points at the chip — never «No matches»', verdictOf(/empty\.textContent = !q && !showOther && folded \? t\('Nothing you typed here — the button above lists the rest'\) : t\('No matches'\);/.test(toc)));
  ok('the chip\'s state is per device (localStorage), default folded', gateOf(/const readShowOther = \(\) => \{ try \{ return localStorage\.getItem\(SHOW_OTHER_KEY\) === '1'; \} catch \{ return false; \} \};/.test(mmap)) && verdictOf(/writeShowOther\(showOther\);/.test(toc)));
  ok('the strip and the drag label keep every turn (B-40f8): nothing outside the list reads the stamp', (mmap.match(/\.other\b/g) || []).length === (toc.match(/\.other\b/g) || []).length + 1 && verdictOf(/other: turn\.other \};/.test(mmap)));
  for (const [f, re, what] of [
    ['src/message-window.js', /if \(m\.role === 'user'\) Object\.assign\(entry, turnPreviewOf\(m\)\);/, 'the attach slab\'s turnMap'],
    ['src/adapters/codex.js', /\.\.\.\(p\.other \? \{ other: p\.other \} : \{\}\)/, 'the huge-session scan'],
    ['src/lib/chat-view.js', /role: 'user', \.\.\.turnPreviewOf\(msg\) \};/, 'the live append'],
    ['src/lib/chat-view.js', /role: 'user', \.\.\.turnPreviewOf\(m\) \}, this\._total\)/, 'the catch-up after missed messages'],
  ]) ok(`${what} stamps the verdict (${f})`, verdictOf(re.test(read(f))));
  // r2, LAW A′: the scan asks the normalizers' own functions — no ladder of its own
  const cxs = read('src/adapters/codex.js');
  const cu = fnBody(cxs, 'function _claudeUserTurn(rec, line) {');
  ok('the huge-session scan asks the claude normalizer\'s ONE function (message-manager userRecordOf) and keeps no ladder of its own — no origin, promptSource or task-tag test in _claudeUserTurn',
    gateOf(/const u = userRecordOf\(rec\);/.test(cu)) && gateOf(/if \(u\.companion \|\| u\.nudge\) return null;/.test(cu)) && gateOf(/if \(u\.peer\) applyPeerOrigin\(msg, u\.peer\.po, u\.peer\.said\);/.test(cu)) && !/task-notification|promptSource|_fromWebui|origin\?\.kind|originKind ===/.test(cu));
  const xu = fnBody(cxs, 'function _codexUserTurn(rec, line) {');
  ok('…and the codex normalizer\'s (codex-message-manager userItemOf) for a codex item — never the wrapper\'s marker alone', gateOf(/const u = userItemOf\(rec\.payload[,)]/.test(xu)) && !/webui_peer|webui_origin/.test(xu));
  const mms = read('src/message-manager.js');
  const pu = mms.slice(mms.indexOf('  _processUser(raw, emit) {'), mms.indexOf('  _processAssistant(raw, emit) {'));
  ok('the claude normalizer writes its stamps from that function, once: _processUser keeps no companion, task-tag, nudge or typed test of its own',
    (pu.match(/userRecordOf\(raw\)/g) || []).length === 1 && !/META_NOTE_RE|<task-notification>\/\.test|safetyStopOf\(|msg\.typed = true|peerOriginOf\(/.test(pu) && (mms.match(/META_NOTE_RE\.test\(/g) || []).length === 1);
  const cms = read('src/codex-message-manager.js');
  const ru = cms.slice(cms.indexOf('  _processResponseMessage(item, emit) {'), cms.indexOf("    if (role === 'assistant') {", cms.indexOf('  _processResponseMessage(item, emit) {')));
  ok('…and the codex normalizer its message: _processResponseMessage asks userItemOf once, peer detection lives only there',
    (ru.match(/userItemOf\(item[,)]/g) || []).length === 1 && !/peerRecordOf\(|webui_origin/.test(ru) && (cms.match(/(?<!function )peerRecordOf\(item, content[,)]/g) || []).length === 1);
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) {
    const s = read(f);
    ok(`${path.basename(f)} words both chip states and the empty list`, gateOf(/"System & other sources ×\{n\} · Show": "[^"]*×\{n\}[^"]*"/.test(s)) && gateOf(/"System & other sources ×\{n\} · Hide": "[^"]*×\{n\}[^"]*"/.test(s)) && verdictOf(/"Nothing you typed here — the button above lists the rest": "[^"]+"/.test(s)));
  }
}

// B-3d90 (1, 3, 4): THE RENDERER draws the user records nobody typed as system cards — the compaction summary, the
// interrupt marker («Turn stopped»), a scheduled wake-up — never a «You» bubble; a «system» record with no origin stays typed (a minimal DOM: the cards it
// writes are one element each) + a RED control (the branches removed: the same records reach the bubble path)
{
  const { pathToFileURL } = await import('node:url');
  const CRP = path.join(REPO, 'src/lib/chat-renderers.js');
  const CRS = fs.readFileSync(CRP, 'utf8');
  // the modules load BEFORE the minimal DOM is set (utils.js listens on document at load; with no document it does not)
  const CR0 = await import(pathToFileURL(CRP).href);
  const CUT = ["    if (origin.why === 'compact') return this._renderNotificationMsg(rawText, { label: t('Context compacted'), detail: rawText.trim() });\n",
    "    if (origin.why === 'interrupt') return this._renderNotificationMsg(rawText, { label: t('Turn stopped'), detail: INTERRUPT_ONLY_RE.test(rawText.trim()) ? '' : rawText.trim() }); // the marker says THAT a stop happened, never who pressed it (a stop the product sends writes the same marker); the result row says «Interrupted»\n",
    "      if (msg.originKind === 'wakeup') return this._renderNotificationMsg(rawText, { label: t('Scheduled wake-up'), detail: rawText.trim() });\n"];
  ok('…the control\'s anchors are in chat-renderers.js once each', verdictOf(CUT.every((c) => CRS.split(c).length === 2)));
  const CR1 = await import(pathToFileURL(MUTC.write('src/lib/chat-renderers.js', editAnchor(CUT.reduce((x, c) => editAnchor(x, c, '', "src/lib/chat-renderers.js"), CRS), "from 'marked';", `from ${JSON.stringify(import.meta.resolve('marked'))};`, "src/lib/chat-renderers.js"), 'no3d90', { esm: true })).href);
  const doc0 = globalThis.document;
  globalThis.document = { createElement: () => ({ className: '', innerHTML: '', title: '', classList: { add() { }, toggle() { } }, querySelector: () => null, appendChild() { }, setAttribute() { } }), addEventListener() { }, removeEventListener() { } };
  const CASES = [['mo-compact-1', 'Context compacted'], ['mo-interrupt-1', 'Turn stopped'], ['mo-interrupt-tool', 'Turn stopped'], ['mo-notification-wakeup', 'Scheduled wake-up']];
  const drawAll = (CRm) => CASES.map(([uuid, label]) => {
    const R = Object.create(CRm.ChatRenderers.prototype);
    let el = null; try { el = R.renderUserMsg(byUuid.get(uuid)); } catch { el = null; }
    return { uuid, card: !!el && /chat-msg-system/.test(el.className) && !/chat-msg-user/.test(el.className) && el.innerHTML.includes(label) };
  });
  try {
    const got = drawAll(CR0);
    for (const g of got) ok(`B-3d90: ${g.uuid} is drawn as its system card, never a «You» bubble`, verdictOf(g.card), g);
    const pre = drawAll(CR1);
    ok(`CONTROL (the three branches removed): none of the ${pre.length} records gets its card — the legs go RED`, verdictOf(pre.every((g) => !g.card)), pre);
  } finally { globalThis.document = doc0; }
  ok('B-3d90 (3): a record naming its wakeup is never typed; a «system» record with NO origin (unmeasured) keeps today\'s answer — typed, never «not by you» on a reading', byUuid.get('mo-notification-wakeup')?.originKind === 'wakeup' && !byUuid.get('mo-notification-wakeup')?.typed && byUuid.get('mo-typed-sysprompt')?.typed === true && !byUuid.get('mo-typed-sysprompt')?.originKind);
}

console.log('§3 MUTANTS — each kind taken out of a copy (in memory) reddens exactly its own rows, by name');
{
  const src = fs.readFileSync(AN_PATH, 'utf8');
  const loadPatched = (patched) => { const mod = { exports: {} }; new Function('require', 'module', 'exports', patched)(createRequire(AN_PATH), mod, mod.exports); return mod.exports; };
  const MUTANTS = [
    ['attachment', ["  if (r.imageAttachment) return other('attachment');\n"], ['attachment']],
    ['note', ["  if (userNoteOf(r)) return other('note');\n"], ['note']],
    ['auto-resume', ["  if (r.originKind === 'auto-resume') return other('auto-resume');\n"], ['auto-resume']],
    ['notice', [["isVibespaceNotice(r.peerFrom, text, r.peerVia) ? 'notice' : 'peer'", "'peer'"]], ['notice']],
    ['peer', ["  if (r.originKind === 'peer-message') return other(isVibespaceNotice(r.peerFrom, text, r.peerVia) ? 'notice' : 'peer');\n"], ['peer', 'notice']],
    ['notification', ["  if (r.originKind === 'task-notification') return other('notification');\n", "  if (r.originKind === 'wakeup') return other('notification'); // B-3d90 (3): the CLI's scheduler's own prompt (wakeupSource: a scheduled wake-up, a /loop fire)\n", "    if (r.synthetic || CLI_TAG_RE.test(s) || STOP_HOOK_RE.test(s)) return other('notification');\n"], ['notification']],
    ['command', ["    if (r.originKind === 'local-command' || /^<command-name\\b/.test(s)) return { person: true, why: 'command' };\n"], ['command']],
    ['interrupt', ["    if (INTERRUPT_RE.test(s)) return other('interrupt');\n"], ['interrupt']],
    ['compact', ["    if (isCompactSummaryText(s)) return other('compact');\n"], ['compact']],
    ['tray-answer', ["  if (parseReply(text)) return { person: true, why: 'tray-answer' };\n"], ['tray-answer']],
  ];
  const killed = new Set();
  for (const [kind, cuts, owns] of MUTANTS) {
    let p = src;
    for (const c of cuts) { const [from, to] = Array.isArray(c) ? c : [c, '']; p = p.replace(from, to); }
    const applied = cuts.every((c) => src.includes(Array.isArray(c) ? c[0] : c)) && p !== src;
    const X = applied ? loadPatched(p) : { personRow };
    const red = judged.filter((j) => { const v = X.personRow(j.rec); return v.why !== j.want || v.person !== PERSON.has(j.want); });
    const names = red.map((j) => j.name);
    const exact = red.length > 0 && red.every((j) => owns.includes(j.want));
    if (applied && exact) killed.add(kind);
    ok(`mutant «${kind} missing»: RED on exactly its rows (${names.join(', ') || 'none'})`, gateOf(applied) && verdictOf(exact), { applied, red: red.map((j) => [j.name, j.want, X.personRow(j.rec).why]) });
  }
  ok(`every kind has a mutant that dies (${killed.size}/${PERSON_WHYS.length + OTHER_WHYS.length - 1} — 'typed' is the fall-through)`, killed.size === PERSON_WHYS.length + OTHER_WHYS.length - 1);
  // the turn stamp itself: a turnPreviewOf that forgets `other` lists every row as the person's
  const STAMP = '  const other = who.person ? {} : { other: who.why };';
  const noStamp = src.includes(STAMP) ? loadPatched(src.replace(STAMP, '  const other = {};')) : null;
  const folds = judged.filter((j) => !PERSON.has(j.want) && j.want !== 'attachment');   // (page images have no text — no turn)
  const stampRed = noStamp ? folds.filter((j) => !noStamp.turnPreviewOf(j.rec)?.other).map((j) => j.name) : [];
  ok(`mutant «turnPreviewOf without the stamp»: every folded kind's row goes red (${stampRed.length}/${folds.length})`, stampRed.length === folds.length && folds.length > 0);
  // r2: the typed guard — the compaction rule read for a TYPED record again (r1's place) ⇒ the typed paste goes red, by name
  const GUARD = "    if (isCompactSummaryText(s)) return other('compact');\n  }\n";
  const unguarded = src.includes(GUARD) ? loadPatched(src.replace(GUARD, "  }\n  if (isCompactSummaryText(s)) return other('compact');\n")) : null;
  const guardRed = unguarded ? judged.filter((j) => { const v = unguarded.personRow(j.rec); return v.why !== j.want || v.person !== PERSON.has(j.want); }).map((j) => j.name) : [];
  ok(`mutant «the compaction rule outside the typed guard»: RED on exactly the typed paste (${guardRed.join(', ') || 'none'})`, !!unguarded && guardRed.join() === 'mo-typed-compactpaste', guardRed);
  // r2, LAW A′: the scan's own ladder back ⇒ the cross-builder leg red on exactly the records it judges alone, by name
  const cxSrc = fs.readFileSync(CX_PATH, 'utf8');
  const scanMutant = (from, to) => { if (!cxSrc.includes(from)) return null; const X = loadPatchedAt(CX_PATH, cxSrc.replace(from, to)); return X.scanJsonlUserTurns; };
  const R1_CODEX = `function _codexUserTurn(rec, line) {
  if (rec.type !== 'response_item' || rec.payload?.type !== 'message' || rec.payload?.role !== 'user') return null;
  const content = rec.payload.content;
  const text = Array.isArray(content) ? content.filter((b) => b.type === 'input_text' || b.type === 'text').map((b) => b.text || '').join('') : String(content || '');
  const ts = rec.timestamp ? Date.parse(rec.timestamp) || 0 : 0;
  return _turnOf(line, ts, { role: 'user', content: [{ type: 'text', text }], ...(rec.payload?.webui_peer ? { originKind: 'peer-message' } : {}) });
}`;
  for (const [what, from, to, file, recs, slab, idOf, want] of [
    ['the scan\'s own task-tag test restored (r1: on text joined from block-list content)', '  const u = userRecordOf(rec);', "  const u = userRecordOf(rec); if (/^\\s*<task-notification>/.test(u.text)) u.stamps = { originKind: 'task-notification' };", FIXTURE, RECS, slabMo, idOfMo, ['mo-typed-tasktag']],
    ['the scan blind to the companion rule and the nudge (r1)', '  if (u.companion || u.nudge) return null;', '', FIXTURE, RECS, slabMo, idOfMo, ['mo-noturn-imagesource', 'mo-noturn-skill', 'mo-noturn-caveat', 'mo-noturn-nudge']],
    ['r1\'s codex scan restored (the wrapper\'s marker alone)', fnBody(cxSrc, 'function _codexUserTurn(rec, line) {').trimEnd() || '\u0000', R1_CODEX, CX_FIXTURE, CX_RECS, slabCx, idOfCx, ['cx-noturn-goal', 'cx-notice-bw', 'cx-peer-frame', 'cx-peer-marker', 'cx-notice-head', 'cx-auto-resume-1']],
  ]) {
    const scanFn = scanMutant(from, to);
    const red = scanFn ? disagree(slab, scanTurnsOf(scanFn(file, file === FIXTURE ? 'claude' : 'codex')), recs, idOf).map(([id]) => id) : [];
    ok(`mutant «${what}»: the builders disagree on exactly ${want.join(', ')} (${red.join(', ') || 'none'})`, !!scanFn && red.join() === want.join(), red);
  }
  // …and the ONE function itself broken (the task tag read on block-list text): the verdict rows catch it, by name
  const mmSrc = fs.readFileSync(MM_PATH, 'utf8');
  const TAG = "  const contentStr = typeof content === 'string' ? content : '';\n  const stamps = raw.origin?.kind === 'task-notification'";
  const MMX = mmSrc.includes(TAG) ? loadPatchedAt(MM_PATH, mmSrc.replace(TAG, "  const contentStr = text;\n  const stamps = raw.origin?.kind === 'task-notification'")) : null;
  let fnRed = [];
  if (MMX) { const mx = new MMX.MessageManager('mo-m'); for (const r of RECS) mx.processLive(r); const by = new Map(mx.messages.filter((m) => m.role === 'user').map((m) => [m.uuid, m]));
    fnRed = judged.filter((j) => by.has(j.name) && personRow(by.get(j.name)).why !== j.want).map((j) => j.name); }
  ok(`mutant «userRecordOf reads the task tag on block-list text»: RED on exactly the typed paste of the tag (${fnRed.join(', ') || 'none'})`, !!MMX && fnRed.join() === 'mo-typed-tasktag', fnRed);
}

console.log('§4 THE CENSUS — every role === \'user\' site in src/lib/ reads the verdict or is named with its reason');
{
  // [file, a needle of the line, true = it reads the verdict (checked) | the reason it is not a «who wrote this» list]
  const ROWS = [
    ['src/lib/chat-minimap.js', "if (turn.role !== 'user') continue;", 'the strip\'s markers (render): every user turn is a marker — the strip and the drag label keep every turn (B-40f8), only the list folds'],
    ['src/lib/chat-minimap.js', "if (!turn || turn.role !== 'user') return;", 'addTurn: the ONE turn map the strip, the drag label and the list share — the list folds by `other` when it paints'],
    ['src/lib/chat-minimap.js', "const userTurns = this._turnMap.filter(tt => tt.role === 'user');", 'marker positions on the strip (every turn)'],
    ['src/lib/chat-minimap.js', ": this._turnMap.filter(t => t.role === 'user');", true],
    ['src/lib/chat-run-summary.js', "if (m.role === 'user') return userNoteOf(m);", true],
    ['src/lib/chat-view.js', "const msgId = msg.role === 'user' ? (msg.webuiMsgId", 'a bubble\'s queue identity (the wrapper\'s queue row joins it), not who wrote it'],
    ['src/lib/chat-view.js', "this._channelTouches?.noteTurn(msg.ts)", 'a turn\'s instant on the channel-touch timeline (any user record starts a turn), not a list of the person\'s words'],
    ['src/lib/chat-view.js', "if (msg.role === 'user' && !msg.imageAttachment) {", true],
    ['src/lib/chat-view.js', "this._renderers?.resolveContextFullCards && isCompactSummaryText(", 'the compaction marks retire the "Prompt is too long" cards by the summary\'s own text rule (isCompactSummaryText — personRow asks it for a record nobody typed): a retirement of advice cards, not a list of who wrote what'],
    ['src/lib/chat-view.js', "if (m.role === 'user' && !m.imageAttachment) this._chatMinimap.addTurn(", true],
    ['src/lib/chat-view.js', "if (this._gapMinimapActive && missedStart + i >= knownTotal && m.role === 'user' && !m.imageAttachment) this._chatMinimap.appendFullTurn(", true], // B-4735
    ['src/lib/search-window.js', "const hitWho = (h) => (h.role === 'user'", true], // B-19bd (was a NAMED GAP): the index keeps the verdict per row
  ];
  const READS = { "src/lib/chat-minimap.js|: this._turnMap.filter(t => t.role === 'user');": (s) => /const listed = showOther \? turns : turns\.filter\(\(tt\) => !tt\.other\);/.test(s),
    "src/lib/chat-run-summary.js|if (m.role === 'user') return userNoteOf(m);": (s) => /import \{ NOTE_MARKER, noteKindOfText, userNoteOf \} from '\.\.\/assistant-note\.js';/.test(s),
    "src/lib/chat-view.js|if (msg.role === 'user' && !msg.imageAttachment) {": (s) => /role: 'user', \.\.\.turnPreviewOf\(msg\) \};/.test(s),
    "src/lib/chat-view.js|if (m.role === 'user' && !m.imageAttachment) this._chatMinimap.addTurn(": (s) => /\.\.\.turnPreviewOf\(m\) \}, this\._total\)/.test(s),
    "src/lib/search-window.js|const hitWho = (h) => (h.role === 'user'": (s) => /h\.other \? otherWord\(h\.other\)/.test(s) && /const v = AN\.personRow\(m\); return v\.person \? null : v\.why;/.test(read('src/search-index-worker.js')) && /who: whoWrote\(m\)/.test(read('src/server/search-index.js')),
    "src/lib/chat-view.js|if (this._gapMinimapActive && missedStart + i >= knownTotal && m.role === 'user' && !m.imageAttachment) this._chatMinimap.appendFullTurn(": (s) => /appendFullTurn\(\{ turnIndex: m\.turnIndex, ts: m\.ts, role: 'user', \.\.\.turnPreviewOf\(m\) \}, \{ once: true \}\);/.test(s) };
  const ROLE_RE = /\brole\s*[!=]==?\s*['"]user['"]/;
  const libDir = path.join(REPO, 'src/lib');
  const hits = [];
  for (const f of fs.readdirSync(libDir).filter((x) => x.endsWith('.js')).sort()) {
    const rel = 'src/lib/' + f;
    read(rel).split('\n').forEach((line, i) => { if (ROLE_RE.test(line)) hits.push({ rel, n: i + 1, line }); });
  }
  const unnamed = hits.filter((h) => !ROWS.some(([f, needle]) => f === h.rel && h.line.includes(needle)));
  ok(`every site is named (${hits.length} sites in src/lib/)`, unnamed.length === 0, unnamed.map((h) => `${h.rel}:${h.n} ${h.line.trim().slice(0, 120)} — read the verdict (src/assistant-note.js personRow / turnPreviewOf) or name it here with its reason`));
  const stale = ROWS.filter(([f, needle]) => !hits.some((h) => h.rel === f && h.line.includes(needle)));
  ok('no row names a site that is gone', stale.length === 0, stale.map((r) => r[0] + ' ' + r[1]));
  for (const [f, needle, why] of ROWS) {
    if (why === true) ok(`${f} «${needle.slice(0, 60)}» reads the verdict`, !!READS[f + '|' + needle] && verdictOf(READS[f + '|' + needle](read(f))));
  }
  ok('every named site says its reason in words (no empty or one-word reasons)', verdictOf(ROWS.every(([, , why]) => why === true || (typeof why === 'string' && why.split(' ').length >= 6))));
}

console.log('§5 VIBESPACE\'S OWN RECORD (B-9a2e + B-3d90 item 2): what VibeSpace sent, matched by digest + window — no match is today\'s answer');
{
  const SP = require(path.join(REPO, 'src/sent-provenance.js'));
  const SR = require(path.join(REPO, 'src/server/sent-record.js'));
  const MMod = require(path.join(REPO, 'src/message-manager.js'));
  const CMod = require(path.join(REPO, 'src/codex-message-manager.js'));
  const T0 = Date.parse('2026-11-04T20:00:00.000Z');
  const CONT = 'You can continue now. Continue the task you were working on when the usage limit was reached; do not repeat work that is already complete.';
  const NOTICE = 'The background job «nightly-build» finished: three artifacts are ready.';
  const POSE2 = require(path.join(REPO, 'src/notification-senders.js')).vibespaceNoticeText('Approve the transfer in the window that just opened.');
  const v2w = [];
  // the PURE rules: bound 1 (equal digest AND inside the window — else null), bound 3 (no words in a row), bound 5 (the newer send)
  const r1 = [SP.rowOf(CONT, 'auto-resume', T0)];
  ok('bound 1: an equal text inside the window is the recorded kind; one more character, a minute past the window or a minute before the send is today\'s answer (null)',
    SP.matchKind(r1, { at: T0 + 30000, text: CONT }) === 'auto-resume' && SP.matchKind(r1, { at: T0 + 30000, text: CONT + '.' }) === null
    && SP.matchKind(r1, { at: T0 + SP.WINDOW_MS + 60000, text: CONT }) === null && SP.matchKind(r1, { at: T0 - 60000, text: CONT }) === null && SP.matchKind([], { at: T0, text: CONT }) === null);
  const autoThenTyped = [SP.rowOf('continue', 'auto-resume', T0), SP.rowOf('continue', 'typed', T0 + 2000)];
  const typedThenAuto = [SP.rowOf('continue', 'typed', T0), SP.rowOf('continue', 'auto-resume', T0 + 2000)];
  ok('bound 5: two equal texts inside the window — the NEWER send\'s kind (a typed «continue» right after an automatic one is typed; the reverse is automatic)',
    SP.matchKind(autoThenTyped, { at: T0 + 5000, text: 'continue' }) === 'typed' && SP.matchKind(typedThenAuto, { at: T0 + 5000, text: 'continue' }) === 'auto-resume');
  ok('bound 5 (the reader\'s S1): a record BETWEEN two equal sends is the send before it — never the later one inside the clock skew; a send inside the skew after the record counts only when none came before',
    SP.matchKind(autoThenTyped, { at: T0 + 500, text: 'continue' }) === 'auto-resume' && SP.matchKind(typedThenAuto, { at: T0 + 500, text: 'continue' }) === 'typed' && SP.matchKind([SP.rowOf('continue', 'typed', T0)], { at: T0 - 2000, text: 'continue' }) === 'typed');
  ok('bound 3: a row is {at, n, h, k} — no word of the text', JSON.stringify(r1).indexOf('continue') === -1 && Object.keys(r1[0]).join() === 'at,n,h,k');
  // the store: bounded (newest win), every change one store-writer dirty() (never a write of its own), no words on disk,
  // an unreadable file never written over
  const writes = [];
  const fakeWriter = { dirty: (file, o) => writes.push({ file, name: o.name, bytes: o.produce() }) };
  const none = () => { throw Object.assign(new Error('no file'), { code: 'ENOENT' }); };
  const st = SR.create({ dataDir: '/sent-record-suite', writer: fakeWriter, readFile: none, now: () => T0 });
  for (let i = 0; i < SR.PER_CONV_MAX + 5; i++) st.note({ conv: 'conv-a', text: `the secret word ${i}`, kind: 'typed', at: T0 + i });
  const last = writes[writes.length - 1];
  ok(`bound 3: the store keeps the ${SR.PER_CONV_MAX} newest sends of a conversation, each change ONE store-writer dirty(), and its bytes hold no words`,
    st.rowsFor('conv-a').length === SR.PER_CONV_MAX && st.rowsFor('conv-a')[0].at === T0 + 5 && writes.length === SR.PER_CONV_MAX + 5 && gateOf(writes.every((w) => w.name === SR.STORE_NAME)) && !last.bytes.includes('secret') && JSON.parse(last.bytes).v === 1);
  for (let c = 0; c < SR.CONV_MAX + 2; c++) st.note({ conv: `conv-${c}`, text: 'hello there', kind: 'typed', at: T0 + 1000 + c });
  ok(`…and the ${SR.CONV_MAX} conversations whose last send is newest (the oldest leaves)`, st.rowsFor('conv-0') === null && !!st.rowsFor(`conv-${SR.CONV_MAX + 1}`));
  const n0 = writes.length;
  const bad = SR.create({ dataDir: '/sent-record-suite', writer: fakeWriter, readFile: () => { throw Object.assign(new Error('unreadable'), { code: 'EIO' }); } });
  bad.note({ conv: 'conv-b', text: 'hello there', kind: 'typed' });
  ok('a record file that could not be read is never written over in that run', writes.length === n0 && verdictOf(bad.isUnread()));
  // the batch's readers: a send re-encodes ONE conversation (the store's bytes are those of one JSON.stringify of the whole);
  // a file that was read but is not a record is kept beside it and a fresh record starts
  const encScene = (M) => {
    const ew = [], s = M.create({ dataDir: '/sent-record-suite', writer: { dirty: (f, o) => ew.push(o.produce()) }, readFile: none, now: () => T0 });
    for (let c = 0; c < 50; c++) s.note({ conv: `cv-e${c}`, text: 'hello there', kind: 'typed', at: T0 + c });
    const e0 = s.encodes ? s.encodes() : 0;
    s.note({ conv: 'cv-e7', text: 'one more', kind: 'typed', at: T0 + 99 });
    const order = [...Array(50).keys()].filter((c) => c !== 7).concat([7]).map((c) => `cv-e${c}`);
    return { delta: (s.encodes ? s.encodes() : 0) - e0, same: ew[ew.length - 1] === JSON.stringify({ v: 1, byConv: Object.fromEntries(order.map((c) => [c, s.rowsFor(c)])) }) };
  };
  const es = encScene(SR);
  ok('…a send re-encodes ONE conversation, and the store\'s bytes are the same as one JSON.stringify of the whole', es.delta === 1 && verdictOf(es.same), es);
  const healScene = (M) => {
    const bw = [], s = M.create({ dataDir: '/sent-record-suite', writer: { dirty: (f, o) => { const bytes = o.produce(); if (o.onWritten) o.onWritten(true, null); bw.push({ f, bytes, again: o.produce() }); } }, readFile: () => '{"v":1,"byConv":{ broken', now: () => T0 });
    s.note({ conv: 'conv-h', text: 'hello there', kind: 'typed', at: T0 });
    return { unread: s.isUnread(), files: bw.map((w) => w.f.split('/').pop()), kept: bw[0] && bw[0].bytes, held: bw[0] && bw[0].again, fresh: bw[1] && JSON.parse(bw[1].bytes).byConv['conv-h'] };
  };
  const hs = healScene(SR);
  ok('…a file that was read but is not a record is kept beside it (sent-record.json.bad, through the store writer) and a fresh record starts',
    hs.unread === false && hs.files.join() === 'sent-record.json.bad,sent-record.json' && hs.kept === '{"v":1,"byConv":{ broken' && gateOf(Array.isArray(hs.fresh)) && hs.fresh.length === 1, hs);
  ok('…and the damaged text is not held once it is written (the readers\' small thing: dropped in onWritten)', hs.held === '', hs);
  // THE NORMALIZERS with the hub's source: claude (userRecordOf) and codex (userItemOf)
  SP.setSource((conv) => (conv === 'cv-a' ? [SP.rowOf(CONT, 'auto-resume', T0), SP.rowOf('fix the login page', 'typed', T0)] : null));
  try {
    const crec = (text, over = {}) => ({ type: 'user', promptSource: 'sdk', sessionId: 'cv-a', uuid: 'r', timestamp: new Date(T0 + 20000).toISOString(), message: { role: 'user', content: text }, ...over });
    const a = MMod.userRecordOf(crec(CONT)).stamps;
    const b = MMod.userRecordOf(crec(CONT, { sessionId: 'cv-other' })).stamps;
    const c = MMod.userRecordOf(crec(CONT, { timestamp: new Date(T0 + SP.WINDOW_MS + 60000).toISOString() })).stamps;
    const d = MMod.userRecordOf(crec('a message the person typed in the CLI\'s own terminal')).stamps;
    ok('claude, a rebuild: VibeSpace\'s auto-resume continue reads as VibeSpace\'s again (B-3d90 item 2); another conversation, past the window, or a terminal message with no record is today\'s answer (typed)',
      a.originKind === 'auto-resume' && a.typed === false && b.typed === true && !b.originKind && c.typed === true && !c.originKind && d.typed === true && !d.originKind, { a, b, c, d });
    const frame = 'Message from session "Lane worker" (via vibespace-msg): done — the report is in report.md';
    SP.setSource((conv) => (conv === 'th-1' ? [SP.rowOf(frame, 'typed', T0), SP.rowOf(CONT, 'auto-resume', T0)] : null));
    const item = (text) => ({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });
    const p = CMod.userItemOf(item(frame), { conv: 'th-1', at: T0 + 20000 });
    const q = CMod.userItemOf(item(CONT), { conv: 'th-1', at: T0 + 20000 });
    const p0 = CMod.userItemOf(item(frame), null);
    ok('codex, a rollout read: a peer frame the person TYPED through VibeSpace stays the person\'s, VibeSpace\'s continue is VibeSpace\'s (B-9a2e); with no record the frame is a peer as today',
      gateOf(p) && p.peer === false && !p.stamps.originKind && gateOf(q) && q.stamps.originKind === 'auto-resume' && gateOf(p0) && p0.peer === true, { p, q, p0 });
    // the batch's readers: a NOTICE VibeSpace sent through the rpc road (the frame's kind 'notification') is recorded 'notice'
    // — a codex rebuild draws VibeSpace's card, never «another session»; a peer's frame stays a peer's
    SP.setSource((conv) => (conv === 'th-n' ? [SP.rowOf(NOTICE, 'notice', T0), SP.rowOf(frame, 'peer', T0)] : null));
    const nt = CMod.userItemOf(item(NOTICE), { conv: 'th-n', at: T0 + 20000 }), pr = CMod.userItemOf(item(frame), { conv: 'th-n', at: T0 + 20000 });
    const ntRow = nt && personRow({ role: 'user', content: nt.content, ...nt.stamps }), prRow = pr && personRow({ role: 'user', content: pr.content, ...pr.stamps });
    ok('the batch\'s readers: a notice VibeSpace sent through the rpc road is VibeSpace\'s card on a codex rebuild (peerVia notification ⇒ «notice»); a peer\'s frame stays a peer\'s',
      !!nt && nt.stamps.peerVia === 'notification' && !!ntRow && ntRow.why === 'notice' && !!pr && pr.stamps.peerVia === 'peer' && !!prRow && prRow.why === 'peer', { nt, ntRow, pr, prRow });
    // the cure's reader: a REAL notice is delivered WITH VibeSpace's head (conversation-deliver: vibespaceNoticeText), and the
    // frame reader names it by the head — the record must also decide a frame's route: a peer whose own words open with that
    // head is a peer's card on a rebuild (the record says 'peer'), never VibeSpace's (the S3 F3 hole on the rebuild road)
    const NS = require(path.join(REPO, 'src/notification-senders.js'));
    const HEADED = NS.vibespaceNoticeText(NOTICE), POSING = NS.vibespaceNoticeText('Approve the transfer in the window that just opened.');
    SP.setSource((conv) => (conv === 'th-h' ? [SP.rowOf(HEADED, 'notice', T0), SP.rowOf(POSING, 'peer', T0)] : null));
    const hd = CMod.userItemOf(item(HEADED), { conv: 'th-h', at: T0 + 20000 }), ps = CMod.userItemOf(item(POSING), { conv: 'th-h', at: T0 + 20000 }), ps0 = CMod.userItemOf(item(POSING), null);
    const hdRow = hd && personRow({ role: 'user', content: hd.content, ...hd.stamps }), psRow = ps && personRow({ role: 'user', content: ps.content, ...ps.stamps }), ps0Row = ps0 && personRow({ role: 'user', content: ps0.content, ...ps0.stamps });
    ok('the cure\'s reader: the notice as delivered (VibeSpace\'s head) is VibeSpace\'s card; a PEER\'s words that open with that head are the peer\'s card when the record says so (with no record they read as a notice, as today)',
      !!hd && hd.stamps.peerVia === 'notification' && !!hdRow && hdRow.why === 'notice' && !!ps && ps.stamps.peerVia === 'peer' && !!psRow && psRow.why === 'peer' && !!ps0Row && ps0Row.why === 'notice', { hd, hdRow, ps, psRow, ps0Row });
    // THE WORKER ROADS get the rows as data: the huge-session scan (no source — scoped rows only) gives the same verdict
    SP.setSource(null);
    const tmp = fs.mkdtempSync(path.join(MUTC.dir, 'scan-'));
    const fp = path.join(tmp, 'cv-a.jsonl');
    fs.writeFileSync(fp, JSON.stringify(crec(CONT, { uuid: 's1' })) + '\n');
    const plain = CX.scanJsonlUserTurns(fp, 'claude');
    const handed = CX.scanJsonlUserTurns(fp, 'claude', [SP.rowOf(CONT, 'auto-resume', T0)]);
    ok('bound 4: the huge-session scan, handed the conversation\'s rows as data (the worker opens no store), lists the continue as VibeSpace\'s; without them as today; the cache keys the rows',
      plain.length === 1 && !plain[0].other && handed.length === 1 && handed[0].other === 'auto-resume', { plain, handed });
  } finally { SP.setSource(null); }
  // THE CONTROLS: each piece removed ⇒ its leg goes RED
  {
    const SPS = read('src/sent-provenance.js'), MMS = read('src/message-manager.js'), CMS = read('src/codex-message-manager.js');
    const cut = (src, from, to, rel, tag) => { if (src.split(from).length !== 2) { ok(`the control's anchor is in ${rel} once: ${from.slice(0, 60)}`, false); return null; } return MUTC.load(rel, editAnchor(src, from, to, "the text handed to cut()"), tag); };
    const noWin = cut(SPS, '!(t >= r.at - SKEW_MS && t <= r.at + WINDOW_MS)', 'false', 'src/sent-provenance.js', 'nowindow');
    ok('CONTROL (no window): a send long before the record still names it — bound 1\'s leg goes RED', !!noWin && noWin.matchKind([noWin.rowOf(CONT, 'auto-resume', T0)], { at: T0 + noWin.WINDOW_MS + 60000, text: CONT }) === 'auto-resume');
    const older = cut(SPS, 'r.at >= before.at', 'r.at < before.at', 'src/sent-provenance.js', 'olderwins');
    ok('CONTROL (the older send wins): a typed «continue» right after an automatic one reads as automatic — bound 5\'s leg goes RED', !!older && older.matchKind([older.rowOf('continue', 'auto-resume', T0), older.rowOf('continue', 'typed', T0 + 2000)], { at: T0 + 5000, text: 'continue' }) === 'auto-resume');
    SP.setSource((conv) => (conv === 'cv-a' ? [SP.rowOf(CONT, 'auto-resume', T0)] : conv === 'th-1' ? [SP.rowOf('Message from session "Lane worker" (via vibespace-msg): done — the report is in report.md', 'typed', T0)] : null));
    try {
      const noStamp = cut(MMS, "raw.originKind === 'auto-resume' || sentKind === 'auto-resume' ?", "raw.originKind === 'auto-resume' ?", 'src/message-manager.js', 'nostamp');   // stale-pins: kept (the RED control puts the release's line back)
      const st0 = noStamp && noStamp.userRecordOf({ type: 'user', promptSource: 'sdk', sessionId: 'cv-a', uuid: 'r', timestamp: new Date(T0 + 20000).toISOString(), message: { role: 'user', content: CONT } }).stamps;
      ok('CONTROL (claude reads no record): the auto-resume continue is the person\'s again after a rebuild — the item 2 leg goes RED', !!st0 && st0.originKind !== 'auto-resume');
      const noTyped = cut(CMS, "const peer = webuiMsgId || sentKind === 'typed' ? null : peerRecordOf(item, content, ", "const peer = webuiMsgId ? null : peerRecordOf(item, content, ", 'src/codex-message-manager.js', 'notyped');   // the anchor follows the call (the readers' round gave it the record's route)
      const pp = noTyped && noTyped.userItemOf({ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Message from session "Lane worker" (via vibespace-msg): done — the report is in report.md' }] }, { conv: 'th-1', at: T0 + 20000 });
      ok('CONTROL (codex ignores a typed record): the peer frame the person typed folds as a peer again — the B-9a2e leg goes RED', !!pp && pp.peer === true);
      // the batch's readers' controls: a notice read as nothing; the store re-encoding the whole; a file not a record left off
      SP.setSource((conv) => (conv === 'th-n' ? [SP.rowOf(NOTICE, 'notice', T0)] : null));
      const noNotice = cut(CMS, "if (sentKind === 'peer' || sentKind === 'notice') return", "if (sentKind === 'peer') return", 'src/codex-message-manager.js', 'nonotice');   // stale-pins: kept (the RED control puts the parent's line back)
      const nn = noNotice && noNotice.userItemOf({ type: 'message', role: 'user', content: [{ type: 'input_text', text: NOTICE }] }, { conv: 'th-n', at: T0 + 20000 });
      ok('CONTROL (codex reads no notice row): VibeSpace\'s notice is not its card — the notice leg goes RED', !!nn && !(nn.stamps && nn.stamps.peerVia === 'notification'), nn);
      const SRS = read('src/server/sent-record.js');
      const whole = cut(SRS, "produce: produceAll }", "produce: () => JSON.stringify({ v: 1, byConv: Object.fromEntries(byConv) }) }", 'src/server/sent-record.js', 'wholeenc');   // stale-pins: kept (the RED control puts the parent's produce back)
      const wsc = whole && encScene(whole);
      ok('CONTROL (every send re-encodes the whole store): no conversation\'s encoding is kept — the leg goes RED', !!wsc && wsc.delta === 0, wsc);
      const left = cut(SRS, "    else if (typeof raw === 'string') {", "    else if (false) {", 'src/server/sent-record.js', 'badoff');
      const lsc = left && healScene(left);
      ok('CONTROL (a file not a record turns the record off, as before): nothing is kept aside, nothing written — the leg goes RED', !!lsc && lsc.unread === true && lsc.files.length === 0, lsc);
      const held = cut(SRS, ", onWritten: (ok) => { if (ok) { bad = null; badOwed = false; if (persistHeld) { persistHeld = false; persist(); } } } });", " });", 'src/server/sent-record.js', 'heldbad');   // B-a09e: the onWritten also lets a held write through
      const hsc = held && healScene(held);
      ok('CONTROL (the damaged text held for the run): it is still produced after its write — the leg goes RED', !!hsc && hsc.held === '{"v":1,"byConv":{ broken', hsc);
      // B-a09e: the record is never written over the damaged file before its copy is ON DISK — a .bad write that FAILS holds the record's
      // write (the damaged bytes stay where they are, never only in memory); the copy's landing lets it through. RED: a copy without the hold
      const badFirst = (M) => {
        const bw = [], cbs = [];
        const s = M.create({ dataDir: '/sent-record-suite', writer: { dirty: (f, o) => { bw.push(f.split('/').pop()); if (o.onWritten) cbs.push([f, o.onWritten]); } }, readFile: () => '{"v":1,"byConv":{ broken', now: () => T0 });
        s.note({ conv: 'conv-b', text: 'hello there', kind: 'typed', at: T0 });
        const before = bw.slice(), bad = cbs.find(([f]) => f.endsWith('.bad'));
        if (bad) bad[1](false, Object.assign(new Error('no space'), { code: 'ENOSPC' }));
        const afterFail = bw.slice();
        if (bad) bad[1](true, null);
        return { before, afterFail, after: bw.slice() };
      };
      const bf = badFirst(SR);
      ok('B-a09e: the record is not written over the damaged file while its copy is owed (a failed copy holds it); the copy landing lets it through', bf.before.join() === 'sent-record.json.bad' && bf.afterFail.join() === 'sent-record.json.bad' && verdictOf(bf.after.includes('sent-record.json')), bf);
      const noHold = cut(SRS, "    if (badOwed) { persistHeld = true; return; }   // B-a09e: the damaged file's copy first\n", '', 'src/server/sent-record.js', 'nohold');
      const bfx = noHold && badFirst(noHold);
      ok('CONTROL (a copy without the hold): the record is queued over the damaged file before its copy landed — the leg goes RED', !!bfx && verdictOf(bfx.before.includes('sent-record.json')), bfx);
      SP.setSource((conv) => (conv === 'th-h' ? [SP.rowOf(POSE2, 'peer', T0)] : null));
      const noRoute = cut(CMS, ": (recorded || inferred.via);", ": inferred.via;", 'src/codex-message-manager.js', 'noroute');
      const nr = noRoute && noRoute.userItemOf({ type: 'message', role: 'user', content: [{ type: 'input_text', text: POSE2 }] }, { conv: 'th-h', at: T0 + 20000 });
      const nrRow = nr && personRow({ role: 'user', content: nr.content, ...nr.stamps });
      ok('CONTROL (the frame reader ignores the record\'s route): the peer\'s words with VibeSpace\'s head read as VibeSpace\'s notice — the leg goes RED', !!nrRow && nrRow.why === 'notice', { nr, nrRow });
      // a v1 record only: valid JSON that is not one is kept aside too
      // (B-a09e: the stand-in writer LANDS the kept-aside copy at once — the record is written only after it)
      const v2 = SR.create({ dataDir: '/sent-record-suite', writer: { dirty: (f, o) => { v2w.push(f.split('/').pop()); if (/\.bad$/.test(f) && o && typeof o.onWritten === 'function') o.onWritten(true); } }, readFile: () => '{"v":2,"byConv":{}}', now: () => T0 });
      v2.note({ conv: 'conv-v', text: 'hello there', kind: 'typed', at: T0 });
      ok('…JSON that is not a v1 record (a later version, an array) is kept aside too, never written over unseen', v2w.join() === 'sent-record.json.bad,sent-record.json' && !v2.isUnread(), v2w);
      const nov1 = cut(SRS, "    if (!j || j.v !== 1 || !j.byConv || typeof j.byConv !== 'object' || Array.isArray(j.byConv)) throw", "    if (false) throw", 'src/server/sent-record.js', 'nov1');
      const v2c = []; const v2s = nov1 && nov1.create({ dataDir: '/sent-record-suite', writer: { dirty: (f) => v2c.push(f.split('/').pop()) }, readFile: () => '{"v":2,"byConv":{}}', now: () => T0 });
      if (v2s) v2s.note({ conv: 'conv-v', text: 'hello there', kind: 'typed', at: T0 });
      ok('CONTROL (any JSON loads as a record): a later version is written over unseen, nothing kept aside — the leg goes RED', !!v2s && v2c.join() === 'sent-record.json', v2c);
    } finally { SP.setSource(null); }
  }
  // THE WIRING (the reader's S2): the hub's ONE store through install (the PURE source), a codex rollout scanned with its rows,
  // the worker's pass-through, and a census of every writer of the record
  {
    const wr = [];
    SR.install({ dataDir: '/sent-record-suite', writer: { dirty: (f, o) => wr.push(o.produce()) }, readFile: none, now: () => T0 });
    try {
      SR.note({ conv: 'cv-i', text: CONT, kind: 'auto-resume', at: T0 });
      const viaInstall = MMod.userRecordOf({ type: 'user', promptSource: 'sdk', sessionId: 'cv-i', uuid: 'i', timestamp: new Date(T0 + 20000).toISOString(), message: { role: 'user', content: CONT } }).stamps;
      SR.install(null);
      const afterUninstall = MMod.userRecordOf({ type: 'user', promptSource: 'sdk', sessionId: 'cv-i', uuid: 'i', timestamp: new Date(T0 + 20000).toISOString(), message: { role: 'user', content: CONT } }).stamps;
      ok('the hub\'s store, installed, IS the PURE source: a noted continue reads as VibeSpace\'s; uninstalled, as today', viaInstall.originKind === 'auto-resume' && afterUninstall.typed === true && !afterUninstall.originKind && wr.length === 1);
    } finally { SR.install(null); }
    const tmpc = fs.mkdtempSync(path.join(MUTC.dir, 'cx-'));
    const fpc = path.join(tmpc, 'rollout.jsonl');
    fs.writeFileSync(fpc, JSON.stringify({ timestamp: new Date(T0 + 20000).toISOString(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: CONT }] } }) + '\n');
    const cPlain = CX.scanJsonlUserTurns(fpc, 'codex'), cHanded = CX.scanJsonlUserTurns(fpc, 'codex', [SP.rowOf(CONT, 'auto-resume', T0)]);
    ok('B-9a2e\'s headline: a codex huge-session list, its rollout scanned with the conversation\'s rows, lists the continue as VibeSpace\'s; without them as the person\'s (today)', cPlain.length === 1 && !cPlain[0].other && cHanded.length === 1 && cHanded[0].other === 'auto-resume', { cPlain, cHanded });
    ok('bound 4: the transcript worker hands the rows through (payload.sent), never a store', gateOf(/scanJsonlUserTurns\(payload\.fp, payload\.backend, payload\.sent \|\| null\)/.test(read('src/transcript-worker.js'))) && !/sent-record/.test(read('src/transcript-worker.js')) && !/sent-record/.test(read('src/search-index-worker.js')) && !/sent-record/.test(read('src/transcript-service.js')));
    const writers = [];
    const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.js')) { const n = (read(rel).match(/(?:\bSENT|require\('\.\/sent-record\.js'\))\.note(?:For)?\(/g) || []).length; if (n) writers.push(`${rel}:${n}`); } } };
    walk('src');
    ok(`bound 2: the record has exactly its three writers — the typed door, the auto-resume continue, the rpc-queue road (${writers.join(', ')})`, writers.join() === 'src/server/auto-resume.js:1,src/server/conversation-deliver.js:1,src/server/user-input.js:1', writers);
  }
  // the send doors (bound 2): only VibeSpace's own — the typed door, the auto-resume continue, the rpc-queue road's peer frame
  const ui = read('src/server/user-input.js'), ar = read('src/server/auto-resume.js'), cd = read('src/server/conversation-deliver.js');
  ok('bound 2: the three send doors note their own sends (typed / dispatch / a group hand-over\'s peer frame at the typed door — B-02a3 at the 2.369.412 restack, auto-resume, peer) — and nothing else writes the record',
    gateOf(/SENT\.noteFor\(session, \{ text: wordsOfFrame\(text\), kind: handing \? 'peer' : human \? 'typed' : 'dispatch' \}\);/.test(ui)) && gateOf(/noteFor\(s2, \{ text, kind: 'auto-resume' \}\); return sent; \}/.test(ar)) && verdictOf(/noteFor\(rpc\.s, \{ text, kind: kind === 'notification' \? 'notice' : 'peer' \}\);/.test(cd)));   // B-9a2e part 2: through the session (its id may be adopted later); the id reports move a session's own rows and keep links (§5c) — no other door notes a send
  // B-9a2e — THE TWO REMAINDERS (主开发 r1119; the 11-17 cure's own read left them). PART 1: a stopped conversation read ON ITS
  // PAIRED MACHINE — the device has no record, so the hub hands each transcript op {id: rows} through THE ONE HELPER
  // (sent-provenance sentFor) behind the device's 'sent-rows' capability; the device holds them as that op's own table (holdFor, in the op's async scope).
  // The REAL agent's read is test-transcript-parity's (byte-identical to the hub's own); here the hub's side and the module's keep.
  console.log('§5b B-9a2e part 1: the rows handed to the paired machine');
  {
    const TS_REL = 'src/transcript-service.js', TS_SRC = read(TS_REL);
    const tmpd = fs.mkdtempSync(path.join(MUTC.dir, 'dev-'));
    const fpd = path.join(tmpd, 'rollout.jsonl');
    fs.writeFileSync(fpd, JSON.stringify({ timestamp: new Date(T0 + 20000).toISOString(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: CONT }] } }) + '\n');
    // THE STAND-IN DEVICE: what src/agentd/agentd.js's transcript-op does — the op's params.sent as THAT op's own table, the read run
    // inside the op's async scope (the shared module's getter), then the shared module's read (the huge-session scan) — with the hub's
    // record OFF while it plays the device (`consults`: the other ids its read consults — a fork's parent; its ack names those read
    // with nothing handed, as the agent's does; `failSecond`: its link drops at the second ask)
    const ALS = new AsyncLocalStorage();
    SP.setScope(() => ALS.getStore());
    const standIn = (caps, seen, consults = [], { failSecond = false } = {}) => {
      let asked = 0;
      return {
        connect: async () => ({ info: { capabilities: caps } }),
        transcriptOp: async (method, ref, params, info) => {
          const entry = { method, sent: params && Object.prototype.hasOwnProperty.call(params, 'sent') ? Object.keys(params.sent || {}) : null };
          seen.push(entry);
          if (failSecond && ++asked > 1) throw new Error('the link dropped');
          const hub = SP._source;
          SP.setSource(null);
          const held = SP.holdFor(params && params.sent);
          try {
            return await ALS.run(held, async () => {
              await null;   // the scope rides the op's awaits
              entry.parents = consults.map((id) => !!SP.rowsOf(id));   // the parent's rows reached this read or not
              const turns = CX.scanJsonlUserTurns(fpd, ref.backend, SP.rowsOf(ref.sessionId));
              if (info && params && params.sent) info.unhanded = [...held.unhanded];
              return { turns, parents: entry.parents };   // the answer says what reached the read (as a page's stamps would)
            });
          } finally { SP.setSource(hub); }
        },
      };
    };
    const viaDevice = async (TSmod, caps, { conv = 'th-dev', live = null, consults = [], svc = null, seen = [], failSecond = false } = {}) => {
      const activeSessions = new Map(live ? [['w-live', live]] : []);
      const s = svc || TSmod.createTranscriptService({ activeSessions, createSessionMessages: () => null, hosts: { deviceBounded: async () => standIn(caps, seen, consults, { failSecond }) } });
      const got = await s.fullTurnmap({ backend: 'codex', sessionId: conv, host: 'h-paired', cwd: '/w' }, '\u0000device:' + conv);
      return { turns: got, seen, svc: s };
    };
    const HUB_HELD = new Set(['th-dev', 'th-parent', 'th-kid', 'th-kid3', 'th-far', 'th-near', 'th-hub', 'th-kid4', 'th-kid5', 'th-p0', 'th-p1', 'th-p2', 'th-p3', 'th-p4', 'th-p5']);
    const hubRows = (conv) => (HUB_HELD.has(conv) ? [SP.rowOf(CONT, 'auto-resume', T0)] : null);
    SP._source = hubRows; SP.setSource(hubRows);
    try {
      const TS = require(path.join(REPO, TS_REL));
      const now = await viaDevice(TS, ['transcript-op', 'sent-rows']), old = await viaDevice(TS, ['transcript-op']);
      ok('PART 1: a stopped codex conversation read on its PAIRED machine (a stand-in device): the hub hands {its id: its rows} in the op\'s params and the device lists VibeSpace\'s «You can continue now…» as VibeSpace\'s — never the person\'s',
        now.seen.length === 1 && now.seen[0].method === 'fullTurnmap' && JSON.stringify(now.seen[0].sent) === '["th-dev"]' && now.turns.length === 1 && now.turns[0].other === 'auto-resume', now);
      ok('…an OLDER agent (no \'sent-rows\' in its capabilities) is never sent the field: today\'s answer (the person\'s), never a hang', old.seen.length === 1 && old.seen[0].sent === null && old.turns.length === 1 && !old.turns[0].other, old);
      const empty = await viaDevice(TS, ['transcript-op', 'sent-rows'], { conv: 'th-none' });
      ok('…a conversation the hub holds no rows for is still sent the field — {} (the device then holds nothing for the op: never an earlier op\'s rows)', empty.seen.length === 1 && JSON.stringify(empty.seen[0].sent) === '[]' && !empty.turns[0].other, empty);
      const live = await viaDevice(TS, ['transcript-op', 'sent-rows'], { live: { backend: 'codex', backendSessionId: 'th-dev', host: 'h-paired', forkedFrom: ['th-parent', 'th-dev', 'not an id!'] } });
      ok('…a live session not yet read here: the ids of its own chain (forkedFrom) are handed beside its own, each once, an id of the wrong shape never', live.seen.length === 1 && JSON.stringify(live.seen[0].sent) === '["th-dev","th-parent"]', live);
      // a fork the hub never saw made (no link): the agent's ack names the parent its read consulted with nothing handed — the hub
      // holds the parent's rows, so ONE more ask hands them; the next read of that conversation hands them at once (one ask); an id
      // the hub holds no rows for is never asked again
      const kidSeen = [];
      const kid1 = await viaDevice(TS, ['transcript-op', 'sent-rows'], { conv: 'th-kid', consults: ['th-parent', 'th-nobody'], seen: kidSeen });
      const asks1 = kidSeen.map((x) => x.sent.join('+'));
      const kid2 = await viaDevice(TS, ['transcript-op', 'sent-rows'], { conv: 'th-kid', svc: kid1.svc, seen: kidSeen });
      const asks2 = kidSeen.slice(asks1.length).map((x) => x.sent.join('+'));
      const reached = kidSeen.map((x) => JSON.stringify(x.parents)).join(' ');
      ok('…a read that consults an id the hub could not name (a fork made elsewhere): the agent names it, the hub hands it in ONE more ask (only an id it holds rows for — the parent\'s rows reach that read) and remembers it for the conversation\'s next read',
        JSON.stringify(asks1) === '["th-kid","th-kid+th-parent"]' && JSON.stringify(asks2) === '["th-kid+th-parent"]' && reached === '[false,false] [true,false] [true,false]', { asks1, asks2, reached });
      // THE GATE of the one more ask (round ww0zvz7tw's first small): an id the hub noted for a conversation of ANOTHER machine (or of
      // this hub) is never handed for a read on this one — a mistaken name never fetches it; one never noted, or noted here, is
      SP.setPlaces((id) => ({ 'th-far': 'h-else', 'th-near': 'h-paired', 'th-hub': '' })[id]);
      const gSeen = [];
      try { await viaDevice(TS, ['transcript-op', 'sent-rows'], { conv: 'th-kid3', consults: ['th-far', 'th-near', 'th-hub', 'th-parent'], seen: gSeen }); } finally { SP.setPlaces(null); }
      const gAsks = gSeen.map((x) => x.sent.join('+'));
      ok('…the one more ask hands only an id linked to this conversation or never noted for a conversation of ANOTHER machine: the far machine\'s and this hub\'s own are not fetched for a read on this one',
        JSON.stringify(gAsks) === '["th-kid3","th-kid3+th-near+th-parent"]', gAsks);
      const fSeen = [];
      const fl = await viaDevice(TS, ['transcript-op', 'sent-rows'], { conv: 'th-kid4', consults: ['th-parent'], seen: fSeen, failSecond: true });
      ok('…a second ask that fails leaves the FIRST answer (never the legacy fetch for it)', fSeen.length === 2 && gateOf(Array.isArray(fl.turns)) && fl.turns.length === 1, { asks: fSeen.length, turns: fl.turns });
      const bSeen = [];
      await viaDevice(TS, ['transcript-op', 'sent-rows'], { conv: 'th-kid5', consults: ['th-p0', 'th-p1', 'th-p2', 'th-p3', 'th-p4', 'th-p5'], seen: bSeen });
      ok('…the one more ask hands at most four of the named ids (its bound)', bSeen.length === 2 && bSeen[1].sent.length === 5 && bSeen[1].sent[0] === 'th-kid5', bSeen.map((x) => x.sent));
      let TSx = null, why = null;
      try { TSx = MUTC.load(TS_REL, anchored(TS_SRC, "if (!SENT_OPS.has(method) || !caps.includes('sent-rows')) return await", 'if (true) return await', 'the op without the rows'), 'b9a2e-norows'); } catch (e) { why = e.message; }
      const nx = TSx ? await viaDevice(TSx, ['transcript-op', 'sent-rows']) : null;
      ok('CONTROL (the op without the rows — the road before this unit): the paired machine lists the continue as the person\'s — the leg goes RED', !!nx && nx.turns.length === 1 && !nx.turns[0].other, nx || why);
    } finally { SP.setSource(null); delete SP._source; }
    // THE DEVICE'S KEEP (round ww0zvz7tw's third small): each op's OWN table, found through its async scope — two ops at once handing
    // the SAME id (two hubs) each read their own rows; nothing outside an op; an id read with nothing handed noted in that op's table
    SP.setSource(null);
    const rowA = SP.rowOf(CONT, 'auto-resume', T0), rowB = SP.rowOf(NOTICE, 'notice', T0), rowT = SP.rowOf(CONT, 'typed', T0);
    const k = (conv, text) => SP.kindFor({ conv, at: T0 + 1000, text });
    const tick = () => new Promise((r) => setImmediate(r));
    const opA = ALS.run(SP.holdFor({ 'th-a': [rowA], 'th-x': [{ at: T0, n: 1, h: 'nothex', k: 'typed' }, null], 'not an id!': [rowA] }), async () => {
      await tick(); const v = [k('th-a', CONT), k('th-x', CONT), k('not an id!', CONT)]; await tick();
      return { v, again: k('th-a', CONT), un: [...ALS.getStore().unhanded] };
    });
    const opB = ALS.run(SP.holdFor({ 'th-a': [rowT], 'th-b': [rowB] }), async () => {
      await tick(); const v = [k('th-a', CONT), k('th-b', NOTICE)]; await tick();
      return { v, un: [...ALS.getStore().unhanded] };
    });
    const [ra, rb] = await Promise.all([opA, opB]);
    const outside = k('th-a', CONT);
    const many = ALS.run(SP.holdFor(Object.fromEntries(Array.from({ length: SP.HAND_IDS_MAX + 4 }, (_, i) => ['th-m' + i, [rowA]]))), () => Array.from({ length: SP.HAND_IDS_MAX + 4 }, (_, i) => k('th-m' + i, CONT)).filter(Boolean).length);
    ok('…the device holds the handed rows in EACH OP\'S OWN TABLE: two ops at once handing the same id (two hubs) each read their own rows; a malformed row or id is dropped; outside an op nothing is held; an id read with nothing handed is noted in that op\'s table alone; at most HAND_IDS_MAX ids per op',
      JSON.stringify(ra.v) === '["auto-resume",null,null]' && ra.again === 'auto-resume' && JSON.stringify(rb.v) === '["typed","notice"]' && outside === null && JSON.stringify(ra.un) === '["th-x"]' && JSON.stringify(rb.un) === '[]' && many === SP.HAND_IDS_MAX, { ra, rb, outside, many });
    SP.setLinks((id) => ({ 'th-y': ['th-x'], 'th-x': ['th-w', 'th-y'], 'th-w': ['not an id!'] })[id] || null);
    const linked = SP.idsFor('th-y', ['th-live']), unlinkedBad = SP.idsFor('not an id!', ['th-x']);
    SP.setLinks(null);
    ok('…the helper names the ids each named id was adopted from (the links the hub\'s store installs — part 2): breadth first, oldest parents too, each once, a wrong-shaped id never; without the links only the conversation and the chain it was given',
      JSON.stringify(linked) === '["th-y","th-live","th-x","th-w"]' && JSON.stringify(unlinkedBad) === '[]' && JSON.stringify(SP.idsFor('th-y', ['th-live'])) === '["th-y","th-live"]', { linked, unlinkedBad });
    const AG = read('src/agentd/agentd.js');
    ok('…the real device does what the stand-in does: its capabilities name \'sent-rows\' (after peer-post-wait — the list\'s head and its last twelve stay as the suites pin them), its transcript-op holds msg.params.sent as the op\'s own table and runs the read inside the op\'s async scope (the shared module\'s getter), and its ack names that table\'s unhanded ids',
      gateOf(/'peer-post-wait' \/\*[^*]*\*\/, 'sent-rows' \/\* B-9a2e[^*]*\*\/, 'stream-offer',/.test(AG)) && gateOf(/const held = require\('\.\.\/sent-provenance\.js'\)\.holdFor\(msg\.params\?\.sent\);\n {12}let result;\n {12}await sentScope\(\)\.run\(held, async \(\) => \{\n {14}if \(m === 'page'\)/.test(AG))
      && gateOf(/else throw new Error\('unknown transcript method: ' \+ m\);\n {12}\}\);\n {12}const unhanded = msg\.params && msg\.params\.sent \? \[\.\.\.held\.unhanded\] : \[\];\n/.test(AG))
      && gateOf(/sending: buf\.length, \.\.\.\(unhanded\.length \? \{ unhanded \} : \{\}\) \}\);/.test(AG)) && verdictOf(/setScope\(\(\) => _sentScope\.getStore\(\)\)/.test(AG)));
  }
  // B-9a2e PART 2 — A SESSION'S OWN SENDS FOLLOW ITS ID: the rows a session noted BEFORE its first id report move to the id it
  // reports (a send before any id is held, then filed); a later report moves nothing (a mid-life fork's earlier sends stay with the
  // old id); every report keeps the ids the session came from as the new id's links (the helper of part 1 hands their rows too)
  console.log('§5c B-9a2e part 2: a session\'s sends follow the id it reports first');
  {
    const SR_REL = 'src/server/sent-record.js', SR_SRC = read(SR_REL);
    const run = (SRmod) => {
      const writes = [];
      SRmod.install({ dataDir: '/sent-record-suite', writer: { dirty: (f, o) => { if (o && o.name === SRmod.STORE_NAME) writes.push(o.produce()); } }, readFile: none, now: () => T0 });
      try {
        const kinds = (c) => (SRmod.rowsFor(c) || []).map((r) => r.k);
        // (a) a resume that minted a new id: VibeSpace's continue noted under the old id before the first report; another session's row stays
        const s = { backendSessionId: 'th-old' }, other = { backendSessionId: 'th-old' };
        SRmod.adoptFor(other); SRmod.noteFor(other, { text: 'a send of another session', kind: 'typed', at: T0 - 60000 });
        SRmod.noteFor(s, { text: CONT, kind: 'auto-resume', at: T0 });
        s.forkedFrom = ['th-old']; s.backendSessionId = 'th-new';   // what the road does (codex-events / claude-stream-json / acp-events)
        const moved = SRmod.adoptFor(s), again = SRmod.adoptFor(s);
        // (b) a brand-new conversation: a send before ANY id is held (its row, never the words), then filed at the first report in its instant's place
        const fresh = {};
        const heldNow = SRmod.noteFor(fresh, { text: 'hello there', kind: 'typed', at: T0 - 1000 });
        fresh.backendSessionId = 'th-fresh';
        SRmod.noteFor(fresh, { text: 'and a second line', kind: 'dispatch', at: T0 });
        const movedFresh = SRmod.adoptFor(fresh);
        // (c) the reader's case — a MID-LIFE fork: the id reported (confirmed), a send, then a fork to a new id
        const live = { backendSessionId: 'th-x' };
        SRmod.adoptFor(live); SRmod.noteFor(live, { text: 'before the fork', kind: 'typed', at: T0 });
        live.forkedFrom = ['th-x']; live.backendSessionId = 'th-y';
        const movedMid = SRmod.adoptFor(live);
        const far = { backendSessionId: 'th-far1', host: 'h-paired' };   // a conversation on a paired machine
        SRmod.adoptFor(far); SRmod.noteFor(far, { text: 'on the paired machine', kind: 'typed', at: T0 });
        const gate = [SP.mayHandMore('th-far1', 'th-kid', 'h-paired'), SP.mayHandMore('th-far1', 'th-kid', 'h-other'), SP.mayHandMore('th-new', 'th-kid', 'h-paired'), SP.mayHandMore('th-never', 'th-kid', 'h-paired'), SP.mayHandMore('th-old', 'th-new', 'h-paired')];
        const last = writes.length ? JSON.parse(writes[writes.length - 1]) : null;
        return { moved, again, heldNow, movedFresh, movedMid, old: kinds('th-old'), nw: kinds('th-new'), fr: kinds('th-fresh'), frAt: (SRmod.rowsFor('th-fresh') || []).map((r) => r.at - T0), x: kinds('th-x'), y: SRmod.rowsFor('th-y'),
          kindNew: SP.kindFor({ conv: 'th-new', at: T0 + 20000, text: CONT }), kindOld: SP.kindFor({ conv: 'th-old', at: T0 + 20000, text: CONT }),
          ids: SP.idsFor('th-y'), idsNew: SP.idsFor('th-new'), from: last && last.from, on: last && last.on, gate, last: writes.length ? writes[writes.length - 1] : null };
      } finally { SRmod.install(null); }
    };
    const a2 = run(SR);
    ok('PART 2: the first send after a resume that minted a new id is FILED UNDER THE NEW ID at the session\'s first id report — the continue reads as VibeSpace\'s in the new conversation, the old one keeps only its own rows (another session\'s row stays); the same id reported again does nothing',
      a2.moved === 1 && a2.again === 0 && JSON.stringify(a2.nw) === '["auto-resume"]' && JSON.stringify(a2.old) === '["typed"]' && a2.kindNew === 'auto-resume' && a2.kindOld === null, a2);
    ok('…a send made before the session had ANY id is held as its row, then filed under the id it reports, in its instant\'s place (never lost)', a2.heldNow === null && a2.movedFresh === 1 && JSON.stringify(a2.fr) === '["typed","dispatch"]' && JSON.stringify(a2.frAt) === '[-1000,0]', a2);
    ok('…a MID-LIFE fork (the id reported, a send, then a new id): the send stays with the conversation it went to — nothing moves after the first report', a2.movedMid === 0 && JSON.stringify(a2.x) === '["typed"]' && a2.y === null, a2);
    ok('…each report keeps the ids the session came from as the new id\'s links — on disk (the record\'s `from`, never words) and in the helper\'s ids: a stopped fork read on its paired machine is handed its parent\'s rows too',
      JSON.stringify(a2.from) === '{"th-new":["th-old"],"th-y":["th-x"]}' && JSON.stringify(a2.ids) === '["th-y","th-x"]' && JSON.stringify(a2.idsNew) === '["th-new","th-old"]', a2);
    ok('…the record keeps where each conversation\'s sends were noted (`on`: \'\' this hub, else the machine) and the one more ask\'s gate reads it: a paired machine\'s conversation is handed for a read on THAT machine only; one of this hub\'s is not handed for a paired machine\'s read unless linked to it; an id never noted may be',
      !!a2.on && a2.on['th-far1'] === 'h-paired' && a2.on['th-new'] === '' && a2.on['th-old'] === '' && JSON.stringify(a2.gate) === '[true,false,false,true,true]', { on: a2.on, gate: a2.gate });
    // the record read back: the links come back with the rows; a v1 record without `from` reads as before
    {
      const R2 = SR.create({ dataDir: '/sent-record-suite', writer: { dirty: () => { } }, readFile: () => a2.last });
      const R1 = SR.create({ dataDir: '/sent-record-suite', writer: { dirty: () => { } }, readFile: () => JSON.stringify({ v: 1, byConv: { 'th-a': [SP.rowOf(CONT, 'typed', T0)] } }) });
      ok('…the record read back keeps the links and the places (only well-formed ones); a record with neither reads as before', JSON.stringify(R2.fromOf('th-y')) === '["th-x"]' && R2.placeOf('th-far1') === 'h-paired' && R2.placeOf('th-new') === '' && R2.rowsFor('th-new').length === 1 && R1.fromOf('th-a') === null && R1.placeOf('th-a') === undefined && R1.rowsFor('th-a').length === 1 && !R1.isUnread(), { y: R2.fromOf('th-y'), far: R2.placeOf('th-far1') });
    }
    // the move keeps the old conversation's place in the eviction order (the readers' nit): it did not send anything
    {
      let txt = '';
      const st = SR.create({ dataDir: '/sent-record-suite', writer: { dirty: (f, o) => { txt = o.produce(); } }, readFile: none, now: () => T0 });
      const ra = st.note({ conv: 'th-a', text: 'one', kind: 'typed' }); st.note({ conv: 'th-a', text: 'two', kind: 'typed' }); st.note({ conv: 'th-b', text: 'three', kind: 'typed' });
      const ra2 = st.rowsFor('th-a')[1];
      const mv = st.move('th-a', 'th-c', [ra2]);
      ok('…a move takes only the named rows (by identity) and leaves the old conversation where it was in the eviction order', mv === 1 && JSON.stringify(Object.keys(JSON.parse(txt).byConv)) === '["th-a","th-b","th-c"]' && st.rowsFor('th-a').length === 1 && st.rowsFor('th-a')[0] === ra, txt);
    }
    // CONTROLS — each on a copy of the record with one named line changed
    let SRx = null, whyx = null, SRe = null, whye = null;
    try { SRx = MUTC.load(SR_REL, anchored(SR_SRC, '      for (const [from, rows] of byFrom) { n += installed.move(from, to, rows); olds.push(from); }\n', '', 'the adoption without the move'), 'b9a2e-nomove'); } catch (e) { whyx = e.message; }
    try { SRe = MUTC.load(SR_REL, anchored(anchored(SR_SRC, '    const first = !reported.has(session);\n', '    const first = true;\n', 'every report moves'), '  if (row && !reported.has(session)) {', '  if (row) {', 'every row is remembered'), 'b9a2e-everyreport'); } catch (e) { whye = e.message; }
    const x2 = SRx ? run(SRx) : null, e2 = SRe ? run(SRe) : null;
    ok('CONTROL (the report that moves nothing — the record before this unit): the continue stays under the OLD id, the new conversation reads it as the person\'s — the leg goes RED', !!x2 && JSON.stringify(x2.old) === '["typed","auto-resume"]' && x2.kindNew === null, x2 || whyx);
    ok('CONTROL (every row the session noted moves at every new id — the first cut of this unit, the read\'s finding): the mid-life fork takes the send that went to the old conversation — the leg goes RED', !!e2 && e2.movedMid === 1 && !!e2.y && e2.y.length === 1 && JSON.stringify(e2.x) === '[]', e2 || whye);
    // A BORROWED ID IS NO REPORT (the read's MUST): a codex fork still carries its source's id and its wrapper may echo it before the
    // fork answers (set-permission-mode skips the ready gate); the fork's own id is its first report. And THE BOOT: a session it
    // restored was reported before the restart (a mid-life change later moves nothing) — unless its id may still change: a claude
    // resume whose first id line has not come gets its own rows since its spawn back as remembered
    const runB = (SRmod) => {
      SRmod.install({ dataDir: '/sent-record-suite', writer: { dirty: () => { } }, readFile: none, now: () => T0 });
      try {
        const kinds = (c) => (SRmod.rowsFor(c) || []).map((r) => r.k);
        const parent = { backendSessionId: 'th-src' }; SRmod.adoptFor(parent);
        const fork = { backendSessionId: 'th-src', _forkRequested: true };   // as a live fork is (no source field: liveForkPending reads its forkedFrom)
        SRmod.noteFor(fork, { text: CONT, kind: 'auto-resume', at: T0 });
        SRmod.noteFor(parent, { text: 'the parent goes on', kind: 'typed', at: T0 + 1000 });
        const echo = SRmod.adoptFor(fork);   // the wrapper echoes the borrowed id
        fork.forkedFrom = ['th-src']; fork.backendSessionId = 'th-fk';   // codex-events: the fork's own id
        const own = SRmod.adoptFor(fork);
        const rest = { backendSessionId: 'th-r1' };   // RESTORED: its id read from its meta
        const restN = SRmod.restoredFor(rest);
        SRmod.noteFor(rest, { text: 'after the restart', kind: 'typed', at: T0 });
        rest.forkedFrom = ['th-r1']; rest.backendSessionId = 'th-r2';
        const restMoved = SRmod.adoptFor(rest);
        // a claude resume restored before its first id line: one row of its id from before its spawn, one since (the earlier hub life's)
        SRmod.noteFor({ backendSessionId: 'th-rs' }, { text: 'long before', kind: 'typed', at: T0 - 60000 });
        SRmod.noteFor({ backendSessionId: 'th-rs' }, { text: CONT, kind: 'auto-resume', at: T0 });
        const res = { backendSessionId: 'th-rs', _resumeSpawn: true, _sawFirstId: false, createdAt: T0 - 5000 };
        const seeded = SRmod.restoredFor(res);
        res._sawFirstId = true; res.forkedFrom = ['th-rs']; res.backendSessionId = 'th-rn';   // claude-stream-json: the implicit fork's first line
        const resMoved = SRmod.adoptFor(res);
        // a conversation noted before places were kept (the earlier release: no `on`) gets its machine when the boot restores its session
        SRmod.note({ conv: 'th-pre', text: 'before places were kept', kind: 'typed', at: T0 - 1000 });
        const preOpen = SP.mayHandMore('th-pre', 'th-k', 'h-other');
        SRmod.restoredFor({ backendSessionId: 'th-pre', host: 'h-m2' });
        const prePlaced = [SP.mayHandMore('th-pre', 'th-k', 'h-m2'), SP.mayHandMore('th-pre', 'th-k', 'h-other')];
        return { preOpen, prePlaced, echo, own, src: kinds('th-src'), fk: kinds('th-fk'), restN, restMoved, r1: kinds('th-r1'), r2: SRmod.rowsFor('th-r2'), seeded, resMoved, rs: kinds('th-rs'), rn: kinds('th-rn') };
      } finally { SRmod.install(null); }
    };
    const b2 = runB(SR);
    ok('…a fork still carrying its source\'s id: an echo of that BORROWED id is no report — at the fork\'s own id its continue moves there (the parent\'s own send stays)',
      b2.echo === 0 && b2.own === 1 && JSON.stringify(b2.fk) === '["auto-resume"]' && JSON.stringify(b2.src) === '["typed"]', b2);
    ok('…a conversation noted before places were kept has no machine (the gate open for it — the kb names it) until the boot restores its session: then its rows go to a read on ITS machine only',
      b2.preOpen === true && JSON.stringify(b2.prePlaced) === '[true,false]', { preOpen: b2.preOpen, prePlaced: b2.prePlaced });
    ok('…a session the boot RESTORED was reported before the restart: a later new id moves nothing; a claude resume restored before its first id line gets its rows since its spawn back (the older one stays) and they move at that line',
      b2.restN === 0 && b2.restMoved === 0 && JSON.stringify(b2.r1) === '["typed"]' && b2.r2 === null && b2.seeded === 1 && b2.resMoved === 1 && JSON.stringify(b2.rs) === '["typed"]' && JSON.stringify(b2.rn) === '["auto-resume"]', b2);
    let SRb = null, whyb = null, SRr = null, whyr = null;
    try { SRb = MUTC.load(SR_REL, anchored(SR_SRC, '    if (borrowed(session)) return 0;\n', '', 'a borrowed id reports'), 'b9a2e-borrowed'); } catch (e) { whyb = e.message; }
    try { SRr = MUTC.load(SR_REL, anchored(SR_SRC, '    reported.set(session, to);\n    return 0;\n  } catch { return 0; }\n}', '    return 0;\n  } catch { return 0; }\n}', 'the boot marks nothing'), 'b9a2e-restored'); } catch (e) { whyr = e.message; }
    const bb = SRb ? runB(SRb) : null, br = SRr ? runB(SRr) : null;
    ok('CONTROL (the borrowed id counted as the first report): the fork\'s continue stays under its SOURCE\'s id — the leg goes RED', !!bb && bb.own === 0 && JSON.stringify(bb.src) === '["auto-resume","typed"]' && JSON.stringify(bb.fk) === '[]', bb || whyb);
    ok('CONTROL (the boot marks nothing — the read\'s should): the restored session\'s send moves to a later id — the leg goes RED', !!br && br.restMoved === 1 && JSON.stringify(br.r1) === '[]', br || whyr);
    // EACH ROAD REPORTS THE ID IT SET (the read's should): in every road's file the report comes AFTER the id's assignment — a call
    // moved above it would report the OLD id first. CONTROL: codex-events with its call moved above the assignment
    const ROADS = ['src/server/stdout/codex-events.js', 'src/server/stdout/claude-stream-json.js', 'src/server/stdout/acp-events.js', 'src/ws-create.js', 'src/server/boot-restore.js', 'src/claude-lock-capture.js'];
    const afterSet = (t) => {   // EVERY assignment has a report after it, before the next assignment
      const sets = [...t.matchAll(/\.backendSessionId = /g)].map((m) => m.index), reps = [...t.matchAll(/sent-record\.js'\)\.adoptFor\(/g)].map((m) => m.index);
      return sets.length > 0 && sets.every((a, i) => reps.some((r) => r > a && (i + 1 >= sets.length || r < sets[i + 1])));
    };
    const CE = read('src/server/stdout/codex-events.js');
    const CEup = CE.replace("          if (nextThreadId) require('../sent-record.js').adoptFor(session);", '').replace('          if (nextThreadId && session.backendSessionId !== nextThreadId) {', "          if (nextThreadId) require('../sent-record.js').adoptFor(session);\n          if (nextThreadId && session.backendSessionId !== nextThreadId) {");
    ok(`…every road reports AFTER it set the id (${ROADS.length} roads); CONTROL: codex-events with its report moved above the assignment is caught`, gateOf(ROADS.every((f) => afterSet(read(f)))) && CEup !== CE && !afterSet(CEup), ROADS.filter((f) => !afterSet(read(f))));
    // the boot's registrations (a census): every restored session boot-restore registers is marked at once
    const BR = read('src/server/boot-restore.js');
    const regs = (BR.match(/activeSessions\.set\(id, session\);/g) || []).length;
    const marked = (BR.match(/activeSessions\.set\(id, session\);(?: oweRestoredPin\(session\);)?\n *require\('\.\/sent-record\.js'\)\.restoredFor\(session\);/g) || []).length;
    ok(`…every session the boot registers is marked by restoredFor right after its registration (${marked} of ${regs})`, regs === 3 && marked === 3, { regs, marked });
    // THE ID REPORTS — a census: every assignment of a session's id in src/, by file, with its verdict. A file of the hub's that sets
    // a live session's id reports it to the record (adoptFor) as many times as it sets it; a new road is named here
    const assigns = [], reports = [];
    const walkI = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) walkI(rel); else if (e.name.endsWith('.js')) { const t = read(rel); const a = (t.match(/\.backendSessionId = /g) || []).length, r = (t.match(/sent-record\.js'\)\.adoptFor\(/g) || []).length; if (a) assigns.push(`${rel}:${a}`); if (r) reports.push(`${rel}:${r}`); } } };
    walkI('src');
    const NOT_A_LIVE_SESSION = { 'src/lib/layout.js:4': 'the page\'s own copy of a conversation (its window layout), never a live session' };
    const live2 = assigns.filter((x) => !NOT_A_LIVE_SESSION[x]);
    ok(`…every road that sets a live session's id reports it (${reports.join(', ')}): codex's thread id, claude's id line, ACP's session id, the lock capture (both its callers), the codex thread match at create and at boot — the page's own copies named (${Object.keys(NOT_A_LIVE_SESSION).join(', ')})`,
      live2.join() === reports.join() && reports.join() === 'src/claude-lock-capture.js:1,src/server/boot-restore.js:1,src/server/stdout/acp-events.js:1,src/server/stdout/claude-stream-json.js:1,src/server/stdout/codex-events.js:1,src/ws-create.js:1' && assigns.length === live2.length + 1, { assigns, reports });
  }
}

const ms = Number(process.hrtime.bigint() - T0) / 1e6;
console.log(`  (${ms.toFixed(0)} ms)`);
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
