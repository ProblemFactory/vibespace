#!/usr/bin/env node
// DELIVERABLES, DERIVED (lane artifacts-model; docs/design-artifacts.zh.md). PURE src/artifacts.js (the kinds table, the
// ONE reducer over the REAL claude Write / Edit record shapes, bounds, the chip's view order), the harness hook
// (src/harnesses/artifacts-of.js: claude / codex / ACP shapes), the REPLAY (normalizers.convertWithCards derives the
// rows + cards from a transcript; a restart's persisted rows merge), the LIVE registry (one card, patched in place;
// the device feed twice moves a row once), the doc-window contract (ownerOf / noteEdit through the stash) and patched-copy
// controls. Fixtures are invented, real-shape, no company content. Run: node scripts/test-artifacts.mjs
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const AF = require(path.join(REPO, 'src/artifacts.js'));
const AO = require(path.join(REPO, 'src/harnesses/artifacts-of.js'));
const N = require(path.join(REPO, 'src/normalizers.js'));
const REG = require(path.join(REPO, 'src/server/artifact-registry.js'));
const { harnessOf, harnessIds } = require(path.join(REPO, 'src/harnesses/index.js'));
const M = mutantCopies('artifacts', REPO);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } return !!c; };

// ── fixtures: the claude transcript's own record shapes ──
const CWD = '/home/u/proj';
let n = 0;
const T = (s) => new Date(Date.UTC(2026, 9, 5, 8, 0, s)).toISOString();
const tool = (name, input, s) => { const id = 'toolu_0' + (++n); return { id, rec: { type: 'assistant', uuid: 'a' + n, timestamp: T(s), cwd: CWD, sessionId: 'c-1', message: { id: 'msg_' + n, role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id, name, input }] } } }; };
const result = (id, s) => ({ type: 'user', uuid: 'r' + id, timestamp: T(s), cwd: CWD, sessionId: 'c-1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const say = (text, s) => ({ type: 'assistant', uuid: 's' + s, timestamp: T(s), cwd: CWD, sessionId: 'c-1', message: { id: 'msg_s' + s, role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }] } });
const W1 = tool('Write', { file_path: CWD + '/docs/BRIEF.md', content: '# Brief\n\nline\n' }, 2);
const E1 = tool('Edit', { file_path: CWD + '/docs/BRIEF.md', old_string: 'line', new_string: 'line two' }, 5);
const W2 = tool('Write', { file_path: CWD + '/CLAUDE.md', content: 'rules' }, 7);
const W3 = tool('Write', { file_path: CWD + '/files/part1.md', content: 'part one' }, 9);
const W4 = tool('Write', { file_path: CWD + '/out/cover.png', content: 'x' }, 11);
const E2 = tool('MultiEdit', { file_path: CWD + '/src/app.py', edits: [] }, 13);
const TRANSCRIPT = [say('starting', 1), W1.rec, result(W1.id, 3), say('editing', 4), E1.rec, result(E1.id, 6), W2.rec, result(W2.id, 8), W3.rec, result(W3.id, 10), W4.rec, result(W4.id, 12), E2.rec, result(E2.id, 14), say('done', 15)];

console.log('① the kinds table (closed; `other` is a kind, never a throw)');
const K = { 'docs/BRIEF.md': 'doc', 'a.markdown': 'doc', 'n.rst': 'doc', 'n.txt': 'doc', 'r.docx': 'doc', 'r.pdf': 'doc', 'd.csv': 'doc', 'p.png': 'media', 'v.mp4': 'media', 's.mp3': 'media', 'i.html': 'page',
  'x.py': 'code', 'c.json': 'code', 'c.yaml': 'code', 'CLAUDE.md': 'code', 'sk/SKILL.md': 'code', 'AGENTS.md': 'code', '/h/.claude/notes.md': 'code', 'a.zip': 'other', 'Makefile': 'other', '': 'other' };
const kBad = Object.entries(K).filter(([p, k]) => AF.kindOf(p) !== k).map(([p, k]) => `${p}: ${AF.kindOf(p)}≠${k}`);
ok(!kBad.length, `kindOf over ${Object.keys(K).length} paths through the ONE extension table`, kBad);
{ // lane artifacts-e2e: a project's scaffolding touched by an EDIT is code; WRITTEN by the conversation it is the deliverable
  const born = (path, op) => AF.apply({}, { path, op, by: 'agent', at: 1 }).row;
  const r1 = born('/p/README.md', 'edit'), r2 = born('/p/README.md', 'write'), r3 = born('/p/docs/CHANGELOG.md', 'edit'), r4 = born('/p/readme-notes.md', 'edit'), r5 = born('/p/LICENSE', 'edit');
  ok(r1.kind === 'code' && !AF.cardWorthy(r1) && r2.kind === 'doc' && AF.cardWorthy(r2) && r3.kind === 'code' && r4.kind === 'doc' && r5.kind === 'code' && AF.kindOf('/p/README.md') === 'doc',
    'README / CHANGELOG / LICENSE born by an EDIT ⇒ code (no card, behind Code (n)); README WRITTEN ⇒ doc; readme-notes.md stays doc', [r1, r2, r3, r4, r5].map((r) => r.kind));
  const later = AF.apply(AF.apply({}, { path: '/p/README.md', op: 'edit', by: 'agent', at: 1 }).rows, { path: '/p/README.md', op: 'write', by: 'agent', at: 2 }).row;
  ok(later.kind === 'code', 'the kind is the BIRTH\'s: a later write of an edit-born README stays code (a rebuild derives the same)', later);
}
ok(AF.KINDS.every((k) => ['en', 'zh', 'ja'].every((l) => AF.kindWord(k, l))) && AF.kindWord('doc', 'zh') === '文档', 'every kind has its en/zh/ja word');

console.log('② the hook: claude / codex / ACP shapes');
const ops1 = AO.claude(W1.rec);
ok(ops1.length === 1 && ops1[0].path === CWD + '/docs/BRIEF.md' && ops1[0].op === 'write' && ops1[0].bytes === 14 && ops1[0].id === W1.id, 'claude Write → one write op (bytes, call id)', ops1);
ok(AO.claude(E1.rec)[0].op === 'edit' && AO.claude(E2.rec)[0].op === 'edit' && AO.claude(tool('NotebookEdit', { notebook_path: '/n.ipynb' }, 1).rec)[0].path === '/n.ipynb', 'Edit / MultiEdit / NotebookEdit → edit ops');
ok(AO.claude(tool('Read', { file_path: '/x.md' }, 1).rec).length === 0 && AO.claude(result(W1.id, 3)).length === 0 && AO.claude(say('hi', 1)).length === 0, 'Read / a tool_result / text → nothing');
const patch = '*** Begin Patch\n*** Update File: src/app/views.js\n@@\n-a\n+b\n*** Add File: docs/report.md\n+hello\n*** Delete File: old.md\n*** End Patch';
const cx = AO.codex({ type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'k1', name: 'apply_patch', input: patch } });
ok(cx.length === 2 && cx[0].op === 'edit' && cx[1].path === 'docs/report.md' && cx[1].op === 'write' && cx[1].id === 'k1', 'codex custom_tool_call envelope → Update = edit, Add = write, Delete = nothing', cx);
const cj = AO.codex({ type: 'response_item', payload: { type: 'function_call', call_id: 'kf1', name: 'apply_patch', arguments: JSON.stringify({ changes: [{ path: '/h/r.md', kind: { type: 'add' } }, { path: '/h/v.js', kind: { type: 'update', move_path: null } }] }) } });
ok(cj.length === 2 && cj[0].op === 'write' && cj[1].op === 'edit', 'codex function_call JSON changes → write + edit', cj);
ok(AO.codex({ type: 'event_msg', payload: { type: 'patch_apply_end', changes: {} } }).length === 0, 'codex FileChange / patch result → nothing (the call already counted)');
const acpU = (su, oldText) => ({ kind: 'update', update: { sessionUpdate: su, toolCallId: 'tc1', content: [{ type: 'diff', path: '/h/notes.md', oldText, newText: 'n' }] } });
ok(AO.acp(acpU('tool_call', null))[0].op === 'write' && AO.acp(acpU('tool_call_update', 'o'))[0].op === 'edit' && AO.acp({ kind: 'update', update: { sessionUpdate: 'agent_message_chunk' } }).length === 0, 'ACP diff: no oldText = write, oldText = edit; a chunk = nothing');

console.log('③ the reducer (the ONE fold) — write births, edit bumps, same path = one row');
let rows = {};
for (const r of TRANSCRIPT) for (const o of AO.claude(r)) rows = AF.fold(rows, { ...o, at: Date.parse(r.timestamp) });
const brief = rows[':' + CWD + '/docs/BRIEF.md'];
ok(Object.keys(rows).length === 5 && brief && brief.writes === 1 && brief.edits === 1 && brief.lastOp === 'edit' && brief.kind === 'doc' && brief.by === 'agent', '6 calls over 5 paths → 5 rows; BRIEF.md = 1 write + 1 edit', brief);
const again = AF.apply(rows, { ...AO.claude(E1.rec)[0], at: 1 });
ok(again.skipped === 'seen' && again.rows === rows, 'the SAME call twice (parse + device feed) moves the row once');
const rel = AF.apply({}, { path: 'docs/a.md', op: 'write', cwd: '/w/p/' });
ok(rel.row.path === '/w/p/docs/a.md' && rel.born, 'a relative path is made absolute against the cwd');
const orphan = AF.apply({}, { path: '/x/never-written.md', op: 'edit' });
ok(orphan.born && orphan.row.edits === 1 && orphan.row.writes === 0 && orphan.row.by === 'agent', 'an edit on a path never written here is still a row (by: agent)');
ok(AF.apply({}, { op: 'write' }).skipped === 'no-path' && AF.apply({}, { path: '/a', op: 'delete' }).skipped === 'bad-op', 'an unreadable op is skipped with a reason, never a throw');

console.log('④ bounds + the view');
let big = {};
for (let i = 0; i < 30; i++) big = AF.fold(big, { path: `/c/m${i}.py`, op: 'write', at: 1000 + i });
for (let i = 0; i < 480; i++) big = AF.fold(big, { path: `/d/d${i}.md`, op: 'write', at: 5000 + i });
const over = AF.apply(big, { path: '/d/last.md', op: 'write', at: 9999 });
ok(Object.keys(over.rows).length === AF.MAX_ROWS && over.evicted.length === 1 && over.evicted[0] === ':/c/m10.py' && Object.keys(big).length === AF.MAX_ROWS, `≤ ${AF.MAX_ROWS} rows: the oldest CODE row goes first and is returned`, over.evicted);
const v = AF.view(rows);
ok(v.items.map((r) => r.name).join(',') === 'part1.md,BRIEF.md,cover.png' && v.codeCount === 2 && v.count === 3, 'view: docs first (newest change first), then media; code folded behind a count', v.items.map((r) => r.name));
ok(AF.view(over.rows).full === true, 'a full list says so');

console.log('⑤ the replay — a transcript with 3 deliverable writes ⇒ the rows + one card each after a rebuild');
const opts = N.artifactDeriveOpts({ backend: 'claude', cwd: CWD });
ok(opts && opts.artifactsOf === harnessOf('claude').artifactsOf && N.artifactDeriveOpts({ backend: 'shell' }) === null, 'deriveOpts asks the DESCRIPTOR (shell declares null = no derivation)');
const mm = N.createMessageManager('claude', 's1');
await N.convertWithCards(mm, TRANSCRIPT, [], { artifacts: opts });
const cards = mm.messages.filter((m) => m.noticeKind === 'artifact');
ok(cards.length === 3 && Object.keys(mm.derivedArtifacts || {}).length === 5, 'three deliverable cards (BRIEF.md, part1.md, cover.png) — CLAUDE.md and app.py stay code', cards.map((c) => c.content[0].name));
const bc = cards.find((c) => c.content[0].name === 'BRIEF.md');
const wIdx = mm.messages.findIndex((m) => m.toolCallId === W1.id || (m.content || []).some((b) => b.id === W1.id));
ok(bc && bc.content[0].edits === 1 && bc.content[0].writes === 1 && mm.messages.indexOf(bc) > wIdx && wIdx >= 0, 'BRIEF.md\'s ONE card sits after its Write and says 1 write + 1 edit (patched, not re-placed)', { wIdx, at: mm.messages.indexOf(bc) });
const ids = new Set(cards.map((c) => c.id));
const mm2 = N.createMessageManager('claude', 's1');
await N.convertWithCards(mm2, TRANSCRIPT, [], { artifacts: opts });
ok(mm2.messages.filter((m) => m.noticeKind === 'artifact').every((c) => ids.has(c.id)), 'a second rebuild names the SAME card ids (keyed by the row key)');
// the restart: the persisted rows carry the user's own save (live only) — rebuildHistory merges, the card says it
const persisted = { ...mm.derivedArtifacts };
const bk = ':' + CWD + '/docs/BRIEF.md';
persisted[bk] = { ...persisted[bk], edits: 2, by: 'user', lastAt: Date.parse(T(30)) };
const sess = { backend: 'claude', cwd: CWD, host: '', _artifacts: persisted, _normalizer: null };
await N.rebuildHistory(sess, 's1', TRANSCRIPT);
const rc = sess._normalizer.messages.filter((m) => m.noticeKind === 'artifact');
const rb = rc.find((c) => c.content[0].name === 'BRIEF.md');
ok(rc.length === 3 && rb.content[0].edits === 2 && rb.content[0].by === 'user' && sess._artifacts[bk].edits === 2, 'a restart loses nothing: rebuild = transcript ∪ persisted rows (the user\'s save survives, its card says 2 edits)', rb && rb.content[0]);

console.log('⑥ the live registry — one card, patched in place; the device feed twice moves the row once');
const live = { backend: 'claude', cwd: CWD, host: '', sockName: null, _historyLoaded: true, _normalizer: N.createMessageManager('claude', 's2') };
const emitted = [];
live._normalizer.onOp((o) => emitted.push(JSON.parse(JSON.stringify(o)))); // the op as SENT (the message object is patched later)
const stashed = [];
REG.configure({ activeSessions: () => new Map([['s2', live]]), deliver: { stashFor: (cid, env) => { stashed.push({ cid, env }); return { stored: true }; } }, log: { log() {}, warn() {} } });
REG.observe(live, W1.rec); REG.observe(live, W1.rec); REG.observe(live, E1.rec); REG.observe(live, W2.rec);
const creates = emitted.filter((o) => o.op === 'create' && o.message.noticeKind === 'artifact');
const edits = emitted.filter((o) => o.op === 'edit');
ok(creates.length === 1 && edits.length === 1 && edits[0].id === creates[0].message.id && edits[0].fields.content[0].edits === 1, 'Write + (Write again) + Edit + CLAUDE.md → ONE card create, ONE in-place edit op (content only), no code card', { creates: creates.length, edits: edits.length });
ok(creates[0].message.content[0].autoOpen === true && !('autoOpen' in edits[0].fields.content[0]), 'the doc\'s BIRTH carries autoOpen (the client opens it when the setting is on); the patch never re-opens');
ok(AF.autoOpenVerdict({ born: true, row: { kind: 'doc', by: 'agent', lastOp: 'edit' } }) === false && AF.autoOpenVerdict({ born: true, row: { kind: 'media', by: 'agent', lastOp: 'write' } }) === false, 'an Edit-born or non-doc row never auto-opens');
const sh = { backend: 'shell', _historyLoaded: true };
ok(REG.observe(sh, W1.rec) === 0 && !sh._artifacts, 'a harness whose hook is null never produces (shell)');
const held = { backend: 'claude', cwd: CWD, _historyLoaded: false, _rebuildQueue: [], _normalizer: N.createMessageManager('claude', 's3') };
REG.observe(held, W3.rec);
ok(held._rebuildQueue.length === 1 && held._rebuildQueue[0].kind === 'acard', 'a rebuild in progress HOLDS the live card in its queue (the same gate as every live writer)');

console.log('⑦ the doc-window contract — ownerOf / noteEdit / the user\'s save');
const older = { backend: 'claude', cwd: CWD, claudeSessionId: 'c-old', backendSessionId: 'c-old', _artifacts: { [bk]: { ...brief, lastAt: 1 } } };
REG.configure({ activeSessions: () => new Map([['s0', older], ['s2', live]]) });
const own = REG.ownerOf({ host: '', path: CWD + '/docs/BRIEF.md' });
ok(own && own.sessionId === 's2' && own.row.key === bk && REG.ownerOf({ host: '', path: '/nope.md' }) === null, 'ownerOf → the NEWEST conversation holding the path; an unknown path → null', own && own.sessionId);
live.claudeSessionId = live.backendSessionId = 'c-2';
const t = REG.touch({ sessionId: 's2', host: 'local', path: CWD + '/docs/BRIEF.md', summary: AF.lineDelta('a\nb\n', 'a\nc\nd\n').text });
const lastEdit = emitted.filter((o) => o.op === 'edit').pop();
ok(t.ok && t.row.by === 'user' && t.row.edits === 2 && lastEdit.fields.content[0].by === 'user', 'the user\'s save (artifact-touch) → by: user, edits+1, the card patched in place', t.row);
ok(stashed.length === 1 && stashed[0].env.kind === 'peer' && stashed[0].env.source === 'doc-edit' && stashed[0].env.text === `[Doc edit] ${CWD}/docs/BRIEF.md: +2 −1 lines` && !!stashed[0].cid, 'ONE next-turn note through the stash ("[Doc edit] <path>: +a −b lines") — never a wake', stashed[0]);
ok(REG.touch({ sessionId: 'nope', path: '/a.md' }).ok === false && REG.touch({ sessionId: 's2', path: 'rel.md' }).ok === false, 'an unknown conversation or a relative path is refused');
ok(AF.editNoteText({ path: '/a.md', summary: 'x'.repeat(900) }).length < 330, 'the note is bounded (the summary is the editor\'s words, never file content)');

console.log('⑧ the registries (lane artifacts-registries) — published pages, designs and the composer\'s uploads feed the ONE reducer');
const PG = { id: 'pg1', name: 'site', srcKey: 'local:' + CWD + '/site/index.html', srcPath: CWD + '/site/index.html', path: '/p/pg1', public: true, updatedAt: Date.parse(T(40)), sessionId: 's5' };
let rr = AF.fold({}, { op: 'write', path: CWD + '/site/index.html', at: Date.parse(T(35)), id: 'w-site' });
rr = AF.fold(AF.fold(rr, AF.pageOp(PG)), AF.pageOp({ ...PG, updatedAt: Date.parse(T(45)) }));
const pk = ':' + CWD + '/site/index.html';
ok(Object.keys(rr).length === 1 && rr[pk].kind === 'page' && rr[pk].url === '/p/pg1' && rr[pk].state === 'published' && rr[pk].writes === 1 && rr[pk].edits === 0, 'a page the agent wrote, published twice = ONE row (its source file, the /p/ link, published; a publish never counts as a write)', rr[pk]);
rr = AF.fold(rr, AF.pageOp({ ...PG, removed: true }));
ok(rr[pk] && rr[pk].state === 'unpublished' && rr[pk].url === '/p/pg1' && AF.cardBlock(rr[pk]).state === 'unpublished', 'unpublish ⇒ the row SAYS so (never deleted; the card block carries the state)', rr[pk]);
ok(AF.pageOp({ ...PG, srcKey: 'box:/srv/a.html', srcPath: '/srv/a.html' }).host === 'box' && AF.pageOp({ ...PG, srcKey: 'conv-9:/srv/a.html', srcPath: '/srv/b.html' }).host === '', 'a page\'s machine = its srcKey prefix only when the key IS <host>:<srcPath> (a namespaced key names none)');
const DS = { id: 'd1', sessionId: 's5', host: null, dir: CWD + '/designs/landing', title: 'Landing', openedAt: Date.parse(T(50)) };
let dr = AF.fold({}, AF.designOp(DS));
dr = AF.fold(dr, AF.designOp({ ...DS, title: 'Landing v2', openedAt: Date.parse(T(55)) }));
const dk = ':' + DS.dir;
ok(Object.keys(dr).length === 1 && dr[dk].kind === 'design' && dr[dk].name === 'Landing v2', 'a design = ONE row per (conversation, folder), named by its title (registration, then a re-open / rename)', dr[dk]);
dr = AF.fold(dr, AF.pageOp({ id: 'pg2', srcKey: 'local:' + DS.dir, srcPath: DS.dir, path: '/p/pg2', updatedAt: Date.parse(T(56)) }));
ok(dr[dk].kind === 'design' && dr[dk].url === '/p/pg2', 'a PUBLISHED design stays a design (KIND_RANK) and carries its link');
let ur = AF.fold({}, AF.uploadOp({ name: 'notes.md', path: CWD + '/notes.md', size: 12 }, { at: Date.parse(T(60)) }));
const uk = ':' + CWD + '/notes.md';
ur = AF.fold(ur, { op: 'edit', path: CWD + '/notes.md', at: Date.parse(T(61)), id: 'e-notes' });
ok(ur[uk].kind === 'upload' && ur[uk].bytes === 12 && ur[uk].edits === 1 && AF.cardFacts(AF.cardBlock(ur[uk])).byUser === false, 'an upload is an `upload` row by: user; the agent\'s later edit keeps its kind (an upload outranks the extension)', ur[uk]);
const mixed = AF.merge(AF.merge({ ...rr, ...ur }, dr), {});
ok(AF.view(mixed).items.map((b) => b.kind).join(',') === 'page,design,upload', 'the chip\'s order holds the three: page › design › upload', AF.view(mixed).items.map((b) => b.kind));
const stale = AF.merge({ [pk]: { ...rr[pk], lastAt: Date.parse(T(70)) } }, AF.storeRows({ pages: [PG] }));
const back = AF.merge({ [pk]: { ...rr[pk] } }, AF.storeRows({ pages: [{ ...PG, updatedAt: Date.parse(T(80)) }] }));
ok(stale[pk].state === 'unpublished' && back[pk].state === 'published', 'the merge: the LATER fact wins (a persisted unpublish over an older store record; a re-publish after it)', [stale[pk].state, back[pk].state]);
// the live registry: each store's notification → its conversation's row + ONE card (patched in place)
const s5 = { backend: 'claude', cwd: CWD, host: '', sockName: null, _historyLoaded: true, _normalizer: N.createMessageManager('claude', 's5') };
const em5 = []; s5._normalizer.onOp((o) => em5.push(JSON.parse(JSON.stringify(o))));
const STORE = { pages: [PG], designs: [DS] };
REG.configure({ activeSessions: () => new Map([['s5', s5]]), pages: () => ({ list: ({ sessionId }) => STORE.pages.filter((x) => x.sessionId === sessionId) }), designs: () => ({ list: ({ sessionId }) => STORE.designs.filter((x) => x.sessionId === sessionId) }), log: { log() {}, warn() {} } });
REG.notePage(PG, { replaced: false }); REG.notePage({ ...PG, updatedAt: Date.parse(T(45)) }, { replaced: true });
REG.noteDesign(DS, { created: true });
ok(REG.noteUploads({ sessionId: 's5', files: [{ name: 'notes.md', path: CWD + '/notes.md', size: 12 }] }) === 1 && REG.noteUploads({ sessionId: 'nope', files: [{ path: '/x' }] }) === 0 && REG.notePage({ ...PG, sessionId: 'nope' }) === null, 'notePage / noteDesign / noteUploads land on the named conversation (an unknown one feeds nothing)');
const c5 = em5.filter((o) => o.op === 'create' && o.message.noticeKind === 'artifact').map((o) => o.message.content[0]);
ok(c5.length === 3 && c5.map((b) => b.kind).join(',') === 'page,design,upload' && c5[0].url === '/p/pg1' && c5[2].by === 'user', 'three live cards: page (its link) · design · upload by: user — the re-publish PATCHED the page card, never a second one', c5.map((b) => [b.kind, b.url]));
REG.notePage({ ...PG, removed: true }, { removed: true });
ok(em5.filter((o) => o.op === 'edit').pop().fields.content[0].state === 'unpublished' && REG.listFor('s5').count === 3, 'the unpublish patches the page card (state unpublished) — the list still holds 3', REG.listFor('s5').count);
// the replay: a rebuild reads pages + designs from THEIR stores (not the transcript); the upload from the persisted rows
const s6 = { backend: 'claude', cwd: CWD, host: '', _artifacts: { [uk]: { ...ur[uk] } }, _normalizer: null };
STORE.pages = [{ ...PG, sessionId: 's6' }]; STORE.designs = [{ ...DS, sessionId: 's6' }];
await N.rebuildHistory(s6, 's6', TRANSCRIPT);
const k6 = s6._normalizer.messages.filter((m) => m.noticeKind === 'artifact').map((m) => m.content[0].kind).sort().join(',');
ok(k6 === 'doc,doc,media,design,page,upload'.split(',').sort().join(',') && s6._artifacts[pk].url === '/p/pg1', 'a rebuild = transcript ∪ persisted ∪ the stores: the 3 written + page + design + upload cards', k6);
console.log('⑨ every harness declares the hook; patched-copy controls');
ok(harnessIds().every((id) => 'artifactsOf' in harnessOf(id) && (harnessOf(id).artifactsOf === null || typeof harnessOf(id).artifactsOf === 'function')), 'every registered harness declares artifactsOf (a reader or null)', harnessIds());
const src = (await import('node:fs')).readFileSync(path.join(REPO, 'src/artifacts.js'), 'utf8');
const noSeen = "  if (prev && o.id && prev.lastId === o.id) return { rows: cur, row: prev, born: false, evicted: [], skipped: 'seen' };\n";
ok(src.includes(noSeen), 'control anchor: the seen-call guard is in the reducer');
const MUT = M.load('src/artifacts.js', src.replace(noSeen, '\n'), 'noseen');
let mr = {}; for (const r of [W1.rec, W1.rec]) for (const o of AO.claude(r)) mr = MUT.fold(mr, o);
ok(mr[bk].writes === 2, 'CONTROL: without the seen-call guard the double feed counts 2 writes (the ③ assert sees it)', mr[bk].writes);
const cfg = "  if (AGENT_CONFIG_NAMES.has(baseName(p).toLowerCase()) || AGENT_CONFIG_DIR.test(p)) return 'code';\n";
ok(src.includes(cfg) && M.load('src/artifacts.js', src.replace(cfg, '\n'), 'nocfg').kindOf('/p/CLAUDE.md') === 'doc', 'CONTROL: without the agent-config rule CLAUDE.md becomes a doc card (the ① assert sees it)');
// lane artifacts-registries: the kind rank and the rebuild's third input are each load-bearing
const rank = " && !outranks(row.kind, o.kind)) row.kind = o.kind;";
const MR = src.includes(rank) ? M.load('src/artifacts.js', src.replace(rank, ') row.kind = o.kind;'), 'norank') : null;
ok(MR && MR.fold(MR.fold({}, MR.designOp(DS)), MR.pageOp({ id: 'pg2', srcKey: 'local:' + DS.dir, srcPath: DS.dir, path: '/p/pg2', updatedAt: 1 }))[dk].kind === 'page', 'CONTROL: without the kind rank a published design turns into a page (the ⑧ assert sees it)');
const regOnly = "  if (REG_OPS.includes(o.op)) {";
const MC = src.includes(regOnly) ? M.load('src/artifacts.js', src.replace(regOnly, '  if (false) {'), 'regcount') : null;
ok(MC && MC.fold(MC.fold({}, MC.pageOp(PG)), MC.pageOp({ ...PG, updatedAt: 9 }))[pk].edits === 2, 'CONTROL: without the registry-op branch every publish counts as an edit (the ⑧ "never counts" assert sees it)');
const nsrc = (await import('node:fs')).readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8');
const third = 'AF.merge(AF.merge(mm.derivedArtifacts || {}, session._artifacts || {}), artifactStoreRows(session, sessionId))';
const MN = nsrc.includes(third) ? M.load('src/normalizers.js', nsrc.replace(third, 'AF.merge(mm.derivedArtifacts || {}, session._artifacts || {})'), 'nostore') : null;
if (MN) MN.setArtifactStoreSource(REG.storeRowsOf);
const s7 = { backend: 'claude', cwd: CWD, host: '', _artifacts: {}, _normalizer: null };
STORE.pages = [{ ...PG, sessionId: 's7' }];
if (MN) await MN.rebuildHistory(s7, 's7', TRANSCRIPT);
ok(MN && !s7._artifacts[pk] && REG.storeRowsOf(null, 's7')[pk], 'CONTROL: a rebuild without the store merge loses the published page (the ⑧ replay assert sees it)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
