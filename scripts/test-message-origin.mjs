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
const FIXTURE = path.join(REPO, 'scripts/fixtures/message-origin/claude-user-records.jsonl');
const CX_FIXTURE = path.join(REPO, 'scripts/fixtures/message-origin/codex-user-items.jsonl');
const RECS = fs.readFileSync(FIXTURE, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
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
  ok('…and the codex normalizer\'s (codex-message-manager userItemOf) for a codex item — never the wrapper\'s marker alone', /const u = userItemOf\(rec\.payload\);/.test(xu) && !/webui_peer|webui_origin/.test(xu));
  const mms = read('src/message-manager.js');
  const pu = mms.slice(mms.indexOf('  _processUser(raw, emit) {'), mms.indexOf('  _processAssistant(raw, emit) {'));
  ok('the claude normalizer writes its stamps from that function, once: _processUser keeps no companion, task-tag, nudge or typed test of its own',
    (pu.match(/userRecordOf\(raw\)/g) || []).length === 1 && !/META_NOTE_RE|<task-notification>\/\.test|safetyStopOf\(|msg\.typed = true|peerOriginOf\(/.test(pu) && (mms.match(/META_NOTE_RE\.test\(/g) || []).length === 1);
  const cms = read('src/codex-message-manager.js');
  const ru = cms.slice(cms.indexOf('  _processResponseMessage(item, emit) {'), cms.indexOf("    if (role === 'assistant') {", cms.indexOf('  _processResponseMessage(item, emit) {')));
  ok('…and the codex normalizer its message: _processResponseMessage asks userItemOf once, peer detection lives only there',
    (ru.match(/userItemOf\(item\)/g) || []).length === 1 && !/peerRecordOf\(|webui_origin/.test(ru) && (cms.match(/(?<!function )peerRecordOf\(item, content\)/g) || []).length === 1);
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) {
    const s = read(f);
    ok(`${path.basename(f)} words both chip states and the empty list`, /"System & other sources ×\{n\} · Show": "[^"]*×\{n\}[^"]*"/.test(s) && /"System & other sources ×\{n\} · Hide": "[^"]*×\{n\}[^"]*"/.test(s) && /"Nothing you typed here — the button above lists the rest": "[^"]+"/.test(s));
  }
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
    ['notification', ["  if (r.originKind === 'task-notification') return other('notification');\n", "    if (r.synthetic || CLI_TAG_RE.test(s) || STOP_HOOK_RE.test(s)) return other('notification');\n"], ['notification']],
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
    ['src/lib/chat-view.js', "add(t('Role'), msg.role === 'assistant'", 'the record-info dialog prints the record\'s ROLE field verbatim — a role, not an author'],
    ['src/lib/chat-view.js', "this._channelTouches?.noteTurn(msg.ts)", 'a turn\'s instant on the channel-touch timeline (any user record starts a turn), not a list of the person\'s words'],
    ['src/lib/chat-view.js', "if (msg.role === 'user' && !msg.imageAttachment) {", true],
    ['src/lib/chat-view.js', "this._renderers?.resolveContextFullCards && isCompactSummaryText(", 'the compaction marks retire the "Prompt is too long" cards by the summary\'s own text rule (isCompactSummaryText — personRow asks it for a record nobody typed): a retirement of advice cards, not a list of who wrote what'],
    ['src/lib/chat-view.js', "if (m.role === 'user' && !m.imageAttachment) this._chatMinimap.addTurn(", true],
    ['src/lib/search-window.js', "h.role === 'user' ? t('You') : t('Agent')", 'NAMED GAP (parked B-19bd): a global-search hit carries only the record\'s role from the server\'s index — no record to judge on the client, so a peer delivery is labelled «You» there until the search route stamps the verdict'],
  ];
  const READS = { "src/lib/chat-minimap.js|: this._turnMap.filter(t => t.role === 'user');": (s) => /const listed = showOther \? turns : turns\.filter\(\(tt\) => !tt\.other\);/.test(s),
    "src/lib/chat-run-summary.js|if (m.role === 'user') return userNoteOf(m);": (s) => /import \{ NOTE_MARKER, noteKindOfText, userNoteOf \} from '\.\.\/assistant-note\.js';/.test(s),
    "src/lib/chat-view.js|if (msg.role === 'user' && !msg.imageAttachment) {": (s) => /role: 'user', \.\.\.turnPreviewOf\(msg\) \};/.test(s),
    "src/lib/chat-view.js|if (m.role === 'user' && !m.imageAttachment) this._chatMinimap.addTurn(": (s) => /\.\.\.turnPreviewOf\(m\) \}, this\._total\)/.test(s) };
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

const ms = Number(process.hrtime.bigint() - T0) / 1e6;
console.log(`  (${ms.toFixed(0)} ms)`);
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
