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

const T0 = process.hrtime.bigint();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let passed = 0, failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log('  ✓ ' + name); return; }
  failed++;
  let d = ''; try { d = detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700); } catch { d = ' — ' + String(detail); }
  console.log('  ✗ ' + name + d);
};
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
  [...PERSON_WHYS, ...OTHER_WHYS].every((w) => seen.has(w)), [...PERSON_WHYS, ...OTHER_WHYS].filter((w) => !seen.has(w)));
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
ok('a TYPED message that opens with the task tag (block-list content — the shape VibeSpace\'s own sends have) is the person\'s in both builders', personIn('mo-typed-tasktag'), twin('mo-typed-tasktag'));
ok('a TYPED paste of the compaction summary\'s head is the person\'s in both builders — their words, never «Context compacted»', personIn('mo-typed-compactpaste') && JSON.parse(twin('mo-typed-compactpaste')[0]).preview.startsWith('This session is being continued'), twin('mo-typed-compactpaste'));
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
ok('the interrupt kind is the CLI\'s two markers — permission-outcome\'s census rows Jw / Ud, letter for letter', PO_ROWS.length === 2 && PO_ROWS.every((r) => personRow(said(r.text)).why === 'interrupt'), PO_ROWS.map((r) => [r.id, personRow(said(r.text)).why]));
ok('…and nothing broader: a sentence that only resembles them, or quotes one mid-text, stays the person\'s', personRow(said('[Request interrupted by the user]')).why === 'typed' && personRow(said('I saw [Request interrupted by user] earlier')).why === 'typed');
ok('an empty / missing record never throws (nothing to fold)', personRow(null).person === true && AN.turnPreviewOf({ role: 'user', content: [] }) === null);

console.log('§2 THE READERS — the renderer and the list ask the verdict; every builder stamps it; nobody keeps a copy');
{
  const cr = read('src/lib/chat-renderers.js');
  ok('chat-renderers imports personRow from the PURE module', /^import \{ personRow \} from '\.\.\/assistant-note\.js';/m.test(cr));
  ok('renderUserMsg asks it ONCE and draws the notification card / the command bubble by its word', /const origin = personRow\(msg\);\n\s*const isNotification = origin\.why === 'notification' \|\| origin\.why === 'command';/.test(cr));
  ok('…and the For-you answer card by its word', /const inboxReply = origin\.why === 'tray-answer' \? parseInboxReply\(rawText\) : null;/.test(cr));
  ok('the renderer keeps no copy of the notification shapes (they moved into personRow)', !/command-name\|local-command\|task-notification\|system-reminder/.test(cr) && !/A session-scoped Stop hook is now active\/\.test/.test(cr));
  const an = read('src/assistant-note.js');
  ok('personRow holds them, once', (an.match(/command-name\|local-command\|task-notification\|system-reminder/g) || []).length === 1);
  const mmap = read('src/lib/chat-minimap.js');
  const toc = mmap.slice(mmap.indexOf('  _showToc() {'), mmap.indexOf('  dispose() {'));
  ok('the list folds by the stamp: listed = the person\'s rows unless the chip is on, the chip counts the rest', /const folded = turns\.filter\(\(tt\) => tt\.other\)\.length;/.test(toc) && /const listed = showOther \? turns : turns\.filter\(\(tt\) => !tt\.other\);/.test(toc) && /for \(const turn of listed\)/.test(toc));
  ok('the placeholder counts what is listed', /filter\.placeholder = t\('Filter \{n\} messages…', \{ n: listed\.length \}\);/.test(toc));
  ok('the chip says the count in the device\'s words (two t() keys), is a pressed-state button, and is absent when nothing is folded',
    /t\('System & other sources ×\{n\} · Show', \{ n: folded \}\)/.test(toc) && /t\('System & other sources ×\{n\} · Hide', \{ n: folded \}\)/.test(toc) && /chip\.setAttribute\('aria-pressed', String\(showOther\)\);/.test(toc) && /if \(folded\) pop\.appendChild\(chip\);/.test(toc));
  ok('a list with nothing the person typed says so and points at the chip — never «No matches»', /empty\.textContent = !q && !showOther && folded \? t\('Nothing you typed here — the button above lists the rest'\) : t\('No matches'\);/.test(toc));
  ok('the chip\'s state is per device (localStorage), default folded', /const readShowOther = \(\) => \{ try \{ return localStorage\.getItem\(SHOW_OTHER_KEY\) === '1'; \} catch \{ return false; \} \};/.test(mmap) && /writeShowOther\(showOther\);/.test(toc));
  ok('the strip and the drag label keep every turn (B-40f8): nothing outside the list reads the stamp', (mmap.match(/\.other\b/g) || []).length === (toc.match(/\.other\b/g) || []).length + 1 && /other: turn\.other \};/.test(mmap));
  for (const [f, re, what] of [
    ['src/message-window.js', /if \(m\.role === 'user'\) Object\.assign\(entry, turnPreviewOf\(m\)\);/, 'the attach slab\'s turnMap'],
    ['src/adapters/codex.js', /\.\.\.\(p\.other \? \{ other: p\.other \} : \{\}\)/, 'the huge-session scan'],
    ['src/lib/chat-view.js', /role: 'user', \.\.\.turnPreviewOf\(msg\) \};/, 'the live append'],
    ['src/lib/chat-view.js', /role: 'user', \.\.\.turnPreviewOf\(m\) \}, this\._total\)/, 'the catch-up after missed messages'],
  ]) ok(`${what} stamps the verdict (${f})`, re.test(read(f)));
  // r2, LAW A′: the scan asks the normalizers' own functions — no ladder of its own
  const cxs = read('src/adapters/codex.js');
  const cu = fnBody(cxs, 'function _claudeUserTurn(rec, line) {');
  ok('the huge-session scan asks the claude normalizer\'s ONE function (message-manager userRecordOf) and keeps no ladder of its own — no origin, promptSource or task-tag test in _claudeUserTurn',
    /const u = userRecordOf\(rec\);/.test(cu) && /if \(u\.companion \|\| u\.nudge\) return null;/.test(cu) && /if \(u\.peer\) applyPeerOrigin\(msg, u\.peer\.po, u\.peer\.said\);/.test(cu) && !/task-notification|promptSource|_fromWebui|origin\?\.kind|originKind ===/.test(cu));
  const xu = fnBody(cxs, 'function _codexUserTurn(rec, line) {');
  ok('…and the codex normalizer\'s (codex-message-manager userItemOf) for a codex item — never the wrapper\'s marker alone', /const u = userItemOf\(rec\.payload[,)]/.test(xu) && !/webui_peer|webui_origin/.test(xu));
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
    ok(`${path.basename(f)} words both chip states and the empty list`, /"System & other sources ×\{n\} · Show": "[^"]*×\{n\}[^"]*"/.test(s) && /"System & other sources ×\{n\} · Hide": "[^"]*×\{n\}[^"]*"/.test(s) && /"Nothing you typed here — the button above lists the rest": "[^"]+"/.test(s));
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
  ok('…the control\'s anchors are in chat-renderers.js once each', CUT.every((c) => CRS.split(c).length === 2));
  const CR1 = await import(pathToFileURL(MUTC.write('src/lib/chat-renderers.js', CUT.reduce((x, c) => x.replace(c, ''), CRS).replace("from 'marked';", `from ${JSON.stringify(import.meta.resolve('marked'))};`), 'no3d90', { esm: true })).href);
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
    for (const g of got) ok(`B-3d90: ${g.uuid} is drawn as its system card, never a «You» bubble`, g.card, g);
    const pre = drawAll(CR1);
    ok(`CONTROL (the three branches removed): none of the ${pre.length} records gets its card — the legs go RED`, pre.every((g) => !g.card), pre);
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
    ok(`mutant «${kind} missing»: RED on exactly its rows (${names.join(', ') || 'none'})`, applied && exact, { applied, red: red.map((j) => [j.name, j.want, X.personRow(j.rec).why]) });
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
    if (why === true) ok(`${f} «${needle.slice(0, 60)}» reads the verdict`, !!READS[f + '|' + needle] && READS[f + '|' + needle](read(f)));
  }
  ok('every named site says its reason in words (no empty or one-word reasons)', ROWS.every(([, , why]) => why === true || (typeof why === 'string' && why.split(' ').length >= 6)));
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
    st.rowsFor('conv-a').length === SR.PER_CONV_MAX && st.rowsFor('conv-a')[0].at === T0 + 5 && writes.length === SR.PER_CONV_MAX + 5 && writes.every((w) => w.name === SR.STORE_NAME) && !last.bytes.includes('secret') && JSON.parse(last.bytes).v === 1);
  for (let c = 0; c < SR.CONV_MAX + 2; c++) st.note({ conv: `conv-${c}`, text: 'hello there', kind: 'typed', at: T0 + 1000 + c });
  ok(`…and the ${SR.CONV_MAX} conversations whose last send is newest (the oldest leaves)`, st.rowsFor('conv-0') === null && !!st.rowsFor(`conv-${SR.CONV_MAX + 1}`));
  const n0 = writes.length;
  const bad = SR.create({ dataDir: '/sent-record-suite', writer: fakeWriter, readFile: () => { throw Object.assign(new Error('unreadable'), { code: 'EIO' }); } });
  bad.note({ conv: 'conv-b', text: 'hello there', kind: 'typed' });
  ok('a record file that could not be read is never written over in that run', writes.length === n0 && bad.isUnread());
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
  ok('…a send re-encodes ONE conversation, and the store\'s bytes are the same as one JSON.stringify of the whole', es.delta === 1 && es.same, es);
  const healScene = (M) => {
    const bw = [], s = M.create({ dataDir: '/sent-record-suite', writer: { dirty: (f, o) => { const bytes = o.produce(); if (o.onWritten) o.onWritten(true, null); bw.push({ f, bytes, again: o.produce() }); } }, readFile: () => '{"v":1,"byConv":{ broken', now: () => T0 });
    s.note({ conv: 'conv-h', text: 'hello there', kind: 'typed', at: T0 });
    return { unread: s.isUnread(), files: bw.map((w) => w.f.split('/').pop()), kept: bw[0] && bw[0].bytes, held: bw[0] && bw[0].again, fresh: bw[1] && JSON.parse(bw[1].bytes).byConv['conv-h'] };
  };
  const hs = healScene(SR);
  ok('…a file that was read but is not a record is kept beside it (sent-record.json.bad, through the store writer) and a fresh record starts',
    hs.unread === false && hs.files.join() === 'sent-record.json.bad,sent-record.json' && hs.kept === '{"v":1,"byConv":{ broken' && Array.isArray(hs.fresh) && hs.fresh.length === 1, hs);
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
      p && p.peer === false && !p.stamps.originKind && q && q.stamps.originKind === 'auto-resume' && p0 && p0.peer === true, { p, q, p0 });
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
    const cut = (src, from, to, rel, tag) => { if (src.split(from).length !== 2) { ok(`the control's anchor is in ${rel} once: ${from.slice(0, 60)}`, false); return null; } return MUTC.load(rel, src.replace(from, to), tag); };
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
      const held = cut(SRS, ", onWritten: (ok) => { if (ok) bad = null; } });", " });", 'src/server/sent-record.js', 'heldbad');
      const hsc = held && healScene(held);
      ok('CONTROL (the damaged text held for the run): it is still produced after its write — the leg goes RED', !!hsc && hsc.held === '{"v":1,"byConv":{ broken', hsc);
      SP.setSource((conv) => (conv === 'th-h' ? [SP.rowOf(POSE2, 'peer', T0)] : null));
      const noRoute = cut(CMS, ": (recorded || inferred.via);", ": inferred.via;", 'src/codex-message-manager.js', 'noroute');
      const nr = noRoute && noRoute.userItemOf({ type: 'message', role: 'user', content: [{ type: 'input_text', text: POSE2 }] }, { conv: 'th-h', at: T0 + 20000 });
      const nrRow = nr && personRow({ role: 'user', content: nr.content, ...nr.stamps });
      ok('CONTROL (the frame reader ignores the record\'s route): the peer\'s words with VibeSpace\'s head read as VibeSpace\'s notice — the leg goes RED', !!nrRow && nrRow.why === 'notice', { nr, nrRow });
      // a v1 record only: valid JSON that is not one is kept aside too
      const v2 = SR.create({ dataDir: '/sent-record-suite', writer: { dirty: (f, o) => v2w.push(f.split('/').pop()) }, readFile: () => '{"v":2,"byConv":{}}', now: () => T0 });
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
    ok('bound 4: the transcript worker hands the rows through (payload.sent), never a store', /scanJsonlUserTurns\(payload\.fp, payload\.backend, payload\.sent \|\| null\)/.test(read('src/transcript-worker.js')) && !/sent-record/.test(read('src/transcript-worker.js')) && !/sent-record/.test(read('src/search-index-worker.js')) && !/sent-record/.test(read('src/transcript-service.js')));
    const writers = [];
    const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.js')) { const n = (read(rel).match(/(?:\bSENT|require\('\.\/sent-record\.js'\))\.note\(/g) || []).length; if (n) writers.push(`${rel}:${n}`); } } };
    walk('src');
    ok(`bound 2: the record has exactly its three writers — the typed door, the auto-resume continue, the rpc-queue road (${writers.join(', ')})`, writers.join() === 'src/server/auto-resume.js:1,src/server/conversation-deliver.js:1,src/server/user-input.js:1', writers);
  }
  // the send doors (bound 2): only VibeSpace's own — the typed door, the auto-resume continue, the rpc-queue road's peer frame
  const ui = read('src/server/user-input.js'), ar = read('src/server/auto-resume.js'), cd = read('src/server/conversation-deliver.js');
  ok('bound 2: the three send doors note their own sends (typed / dispatch / a group hand-over\'s peer frame at the typed door — B-02a3 at the 2.369.411 restack, auto-resume, peer) — and nothing else writes the record',
    /SENT\.note\(\{ conv: SENT\.convOf\(session\), text: wordsOfFrame\(text\), kind: handing \? 'peer' : human \? 'typed' : 'dispatch' \}\);/.test(ui) && /kind: 'auto-resume' \}\); return sent; \}/.test(ar) && /kind: kind === 'notification' \? 'notice' : 'peer' \}\);/.test(cd));
}

const ms = Number(process.hrtime.bigint() - T0) / 1e6;
console.log(`  (${ms.toFixed(0)} ms)`);
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
