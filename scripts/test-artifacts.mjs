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
// the first MAX_ROWS rows set up in one object, each exactly as the reducer births it (below the cap no row meets
// another); every row PAST the cap folds through the reducer — the eviction the assert judges (lane artifacts-by-intent
// r5: 510 folds each copying the whole object were 22 ms of this suite; r10: two folds past the cap, not ten — each sorts all
// 500 rows to pick its victim, and the third op's victim m2 says the first two took m0, m1: oldest code first, in order)
let big = {};
const born = (o) => { const r = AF.apply({}, o).row; big[r.key] = r; };
for (let i = 0; i < 30; i++) born({ path: `/c/m${i}.py`, op: 'write', at: 1000 + i });
for (let i = 0; i < 470; i++) born({ path: `/d/d${i}.md`, op: 'write', at: 5000 + i });
for (let i = 470; i < 472; i++) big = AF.fold(big, { path: `/d/d${i}.md`, op: 'write', at: 5000 + i });
const over = AF.apply(big, { path: '/d/last.md', op: 'write', at: 9999 });
ok(Object.keys(over.rows).length === AF.MAX_ROWS && over.evicted.length === 1 && over.evicted[0] === ':/c/m2.py' && !big[':/c/m0.py'] && !big[':/c/m1.py'] && !!big[':/c/m2.py'] && Object.keys(big).length === AF.MAX_ROWS, `≤ ${AF.MAX_ROWS} rows: the oldest CODE row goes first and is returned`, over.evicted);
const v = AF.view(rows);
ok(v.items.map((r) => r.name).join(',') === 'cover.png,part1.md,BRIEF.md' && v.items.every((r) => AF.intentOf(r) === 'made') && v.codeCount === 2 && v.count === 3, 'view (lane artifacts-by-intent): the three the agent wrote read in ONE band (made here), newest change first — the kind no longer splits them; code folded behind a count', v.items.map((r) => r.name));
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
ok(AF.view(mixed).items.map((b) => b.kind + ':' + AF.intentOf(b)).join(',') === 'design:foryou,upload:made,page:made', 'the chip\'s order (lane artifacts-by-intent): the design a Design window opened reads «for you»; the upload (the person\'s own) and the page taken down read «made here», newest first', AF.view(mixed).items.map((b) => b.kind + ':' + AF.intentOf(b)));
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

console.log('⑩ a rebuild\'s card lands at ITS time inside the loaded slab or nowhere (lane artifacts-settle-position)');
// the PURE rule + the splice point
const SLAB = { slabFirstAt: 1000, slabLastAt: 2000 };
const placeTable = [[{ firstAt: 500 }, SLAB, 'none'], [{ firstAt: 1000 }, SLAB, 'at'], [{ firstAt: 1500 }, SLAB, 'at'], [{ firstAt: 2000 }, SLAB, 'at'], [{ firstAt: 2500 }, SLAB, 'tail'],
  [{ firstAt: 0 }, SLAB, 'none'], [{}, SLAB, 'none'], [{ firstAt: 500 }, { ...SLAB, live: true }, 'tail'], [{ firstAt: 0 }, { live: true }, 'tail'], [{ firstAt: 500 }, {}, 'tail'], [{ firstAt: 1500 }, { slabFirstAt: 1000 }, 'tail'], [{ firstAt: 1000 }, { slabFirstAt: 1000 }, 'at']];
const placeBad = placeTable.filter(([r, o, want]) => AF.cardPlacement(r, o) !== want).map(([r, o, want]) => `${JSON.stringify(r)} ${JSON.stringify(o)}: ${AF.cardPlacement(r, o)}≠${want}`);
ok(!placeBad.length, 'cardPlacement: older than the slab / no instant ⇒ none · inside ⇒ at · after the last record ⇒ tail · live ⇒ tail · a clockless slab ⇒ tail', placeBad);
const tsList = [{ ts: 10 }, { ts: 20 }, { ts: 0 }, { ts: 20 }, { ts: 30 }];
ok(AF.timeSlot(tsList, 5) === 0 && AF.timeSlot(tsList, 10) === 1 && AF.timeSlot(tsList, 20) === 4 && AF.timeSlot(tsList, 25) === 4 && AF.timeSlot(tsList, 30) === 5 && AF.timeSlot([], 7) === 0 && AF.timeSlot(null, 7) === 0,
  'timeSlot = before the first message stamped LATER (an equal stamp keeps its place; an unstamped one never counts); the end when none', [5, 10, 20, 25, 30].map((x) => AF.timeSlot(tsList, x)));
// the owner's shape: a long transcript whose loaded slab starts at T0; rows written before it (a doc 2 d, a page 1 d,
// a service started 1 d before) + a page published 10 min into the slab
const T0 = Date.UTC(2026, 9, 6, 8, 0, 0), MIN = 60000, DAY = 86400000;
const S = (m) => new Date(T0 + m * MIN).toISOString();
const sayAt = (text, m) => ({ type: 'assistant', uuid: 'q' + m, timestamp: S(m), cwd: CWD, sessionId: 'c-8', message: { id: 'msg_q' + m, role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }] } });
const userAt = (text, m) => ({ type: 'user', uuid: 'p' + m, timestamp: S(m), cwd: CWD, sessionId: 'c-8', message: { role: 'user', content: text } }); // a turn boundary: one turn's assistant records fold into one message
const WP = tool('Write', { file_path: CWD + '/docs/plan.md', content: '# Plan\n' }, 1); // re-stamped into the slab below
WP.rec.timestamp = S(5);
const SLAB_RECS = [userAt('slab starts', 0), WP.rec, { ...result(WP.id, 1), timestamp: S(6) }, sayAt('before the page', 8), userAt('after the page', 12), sayAt('later still', 20)];
const oldDocKey = ':' + CWD + '/todo_wave9.md';
const persisted8 = AF.fold({}, { path: CWD + '/todo_wave9.md', op: 'write', at: T0 - 2 * DAY, id: 'w-old' });
const PG_OLD = { id: 'pgold', name: 'house-web', srcKey: 'local:' + CWD + '/web/index.html', srcPath: CWD + '/web/index.html', path: '/p/pgold', public: true, updatedAt: T0 - DAY, sessionId: 's8' };
const PG_NEW = { id: 'pgnew', name: 'house-web-2', srcKey: 'local:' + CWD + '/web2/index.html', srcPath: CWD + '/web2/index.html', path: '/p/pgnew', public: true, updatedAt: T0 + 10 * MIN, sessionId: 's8' };
const svcKey = 'svc:job-old';
const SVC = { [svcKey]: { key: svcKey, host: '', path: '', name: 'preview server', kind: 'service', by: 'agent', writes: 0, edits: 0, lastOp: 'listen', firstAt: T0 - DAY, lastAt: T0 - DAY, jobId: 'job-old', port: 8123, since: T0 - DAY, state: 'running', stoppedAt: 0 } };
const pgOldKey = ':' + PG_OLD.srcPath, pgNewKey = ':' + PG_NEW.srcPath;
STORE.pages = [PG_OLD, PG_NEW]; STORE.designs = [];
N.setArtifactServiceSource((s) => (s && s.svcFixture ? SVC : {}));
const s8 = { backend: 'claude', cwd: CWD, host: '', svcFixture: true, _artifacts: { ...persisted8 }, _normalizer: null };
const cardsOf = (sess) => sess._normalizer.messages.filter((m) => m.noticeKind === 'artifact');
const keyOfCard = (m) => m.content[0].key;
await N.rebuildHistory(s8, 's8', SLAB_RECS);
const c8 = cardsOf(s8);
ok(s8._normalizer.artifactSlab.slabFirstAt === T0 && s8._normalizer.artifactSlab.slabLastAt === T0 + 20 * MIN, 'the rebuild stamps the loaded slab\'s first / last record instants on the normalizer', s8._normalizer.artifactSlab);
ok(!c8.some((m) => [oldDocKey, pgOldKey, svcKey].includes(keyOfCard(m))), 'after a rebuild: NO card for the doc written 2 d before the slab, the page published 1 d before, the service started 1 d before', c8.map(keyOfCard));
const list8 = s8._normalizer.messages;
const iNew = list8.findIndex((m) => m.noticeKind === 'artifact' && keyOfCard(m) === pgNewKey);
const textOf = (m) => (m && Array.isArray(m.content) ? m.content.map((b) => b.text || '').join('') : '');
ok(c8.length === 2 && iNew > 0 && textOf(list8[iNew - 1]) === 'before the page' && textOf(list8[iNew + 1]) === 'after the page' && list8[iNew].ts === T0 + 10 * MIN,
  'the page published 10 min into the slab: ONE card at its time — between the message before it and the one after, never at the tail', { cards: c8.map(keyOfCard), at: iNew, of: list8.length, prev: textOf(list8[iNew - 1]), next: textOf(list8[iNew + 1]) });
ok(textOf(list8[list8.length - 1]) === 'later still', 'the last message of the slab is still the last thing in the chat (no card after it)', textOf(list8[list8.length - 1]));
const chip8 = AF.view(AF.merge(s8._artifacts, SVC)).items.map((r) => r.key);
ok([oldDocKey, pgOldKey, pgNewKey, svcKey].every((k) => chip8.includes(k)), 'the chip still lists every row — the two old ones, the old service and the in-slab page (the chip is their home)', chip8);
// a card queued behind a running rebuild (the ports door re-feeds the old service; a page published mid-slab; a new write)
const em8 = []; s8._normalizer.onOp((o) => em8.push(JSON.parse(JSON.stringify(o))));
const p8 = N.rebuildHistory(s8, 's8', SLAB_RECS);
const freshRow = AF.fold({}, { path: CWD + '/out/report.md', op: 'write', at: T0 + 30 * MIN, id: 'w-fresh' })[':' + CWD + '/out/report.md'];
const midRow = AF.fold({}, { path: CWD + '/notes/mid.md', op: 'write', at: T0 + 15 * MIN, id: 'w-mid' })[':' + CWD + '/notes/mid.md'];
N.feedArtifactCard(s8, AF.cardBlock(SVC[svcKey])); N.feedArtifactCard(s8, AF.cardBlock(midRow)); N.feedArtifactCard(s8, AF.cardBlock(freshRow));
const queued8 = (s8._rebuildQueue || []).filter((e) => e.kind === 'acard').length;
await p8;
const l8 = s8._normalizer.messages, c8b = cardsOf(s8).map(keyOfCard);
const iMid = l8.findIndex((m) => m.noticeKind === 'artifact' && keyOfCard(m) === midRow.key);
const cr8 = em8.filter((o) => o.op === 'create' && o.message.noticeKind === 'artifact').map((o) => o.message.content[0].key);
ok(queued8 === 3 && !c8b.includes(svcKey) && iMid > 0 && textOf(l8[iMid - 1]) === 'after the page' && textOf(l8[iMid + 1]) === 'later still' && keyOfCard(l8[l8.length - 1]) === freshRow.key,
  'cards queued behind the rebuild: the old service ⇒ none · a write inside the slab ⇒ at its time · a write after the slab ⇒ the tail', { queued8, c8b, iMid, last: keyOfCard(l8[l8.length - 1]) });
ok(cr8.length === 1 && cr8[0] === freshRow.key, 'only the tail card is a live `create` op (a mid-list card is placed silently — the client appends a create at its tail)', cr8);
// a LIVE birth (outside a rebuild) appends at the tail; a second refresh adds nothing new
const liveRow = AF.fold({}, { path: CWD + '/out/summary.md', op: 'write', at: T0 + 40 * MIN, id: 'w-live' })[':' + CWD + '/out/summary.md'];
const oldEdit = { ...persisted8[oldDocKey], edits: 1, lastAt: T0 + 41 * MIN, lastOp: 'edit' };
const before8 = em8.length;
N.feedArtifactCard(s8, AF.cardBlock(liveRow));
const l8c = s8._normalizer.messages;
ok(keyOfCard(l8c[l8c.length - 1]) === liveRow.key && em8.slice(before8).some((o) => o.op === 'create' && o.message.content[0].key === liveRow.key), 'a LIVE write ⇒ its card at the tail + a create op (unchanged)');
N.feedArtifactCard(s8, AF.cardBlock(oldEdit));
ok(keyOfCard(s8._normalizer.messages[s8._normalizer.messages.length - 1]) === oldDocKey, 'a LIVE edit of a file written before the slab ⇒ its card is born at the tail (a live birth — the agent just touched it)');
s8._artifacts = AF.merge(s8._artifacts, { [freshRow.key]: freshRow, [midRow.key]: midRow, [liveRow.key]: liveRow });
const s8r = { ...s8, _artifacts: { ...s8._artifacts, [oldDocKey]: persisted8[oldDocKey] }, _normalizer: null, _rebuildPromise: null, _rebuildQueue: null };
await N.rebuildHistory(s8r, 's8', SLAB_RECS);
const ids1 = cardsOf(s8r).map((m) => m.id);
await N.rebuildHistory(s8r, 's8', SLAB_RECS);
const ids2 = cardsOf(s8r).map((m) => m.id);
ok(ids1.join() === ids2.join() && new Set(ids2).size === ids2.length && !cardsOf(s8r).some((m) => [oldDocKey, pgOldKey, svcKey].includes(keyOfCard(m))), 'a second refresh: the same cards (idempotent by id), still none for the old rows', { ids1: ids1.length, ids2: ids2.length });
// patched-copy controls: the old push-at-tail in settle; the store rows placed without the range check
const nsrc8 = (await import('node:fs')).readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8');
const settleCall = 'if (!patchArtifactCard(mm, b, { emit: false })) placeArtifactCard(mm, b, { rebuilt: true });';
ok(nsrc8.includes(settleCall), 'control anchor: settle places a REBUILT card');
const MT = M.load('src/normalizers.js', nsrc8.replace(settleCall, 'if (!patchArtifactCard(mm, b, { emit: false })) placeArtifactCard(mm, b);'), 'tailsettle');
MT.setArtifactStoreSource(REG.storeRowsOf); MT.setArtifactServiceSource((s) => (s && s.svcFixture ? SVC : {}));
const s9 = { backend: 'claude', cwd: CWD, host: '', svcFixture: true, _artifacts: { ...persisted8 }, _normalizer: null };
await MT.rebuildHistory(s9, 's8', SLAB_RECS);
const l9 = s9._normalizer.messages, last9 = l9.findIndex((m) => textOf(m) === 'later still');
const tail9 = l9.slice(last9 + 1).map((m) => (m.noticeKind === 'artifact' ? keyOfCard(m) : textOf(m)));
ok(last9 > 0 && [oldDocKey, pgOldKey, svcKey].every((k) => tail9.includes(k)), 'CONTROL: with the old push-at-tail in settle the three stale cards sit after the last message (the ⑩ "no card" assert sees it)', tail9);
const asrc8 = (await import('node:fs')).readFileSync(path.join(REPO, 'src/artifacts.js'), 'utf8');
const range = '  if (at < slabFirstAt) return \'none\';\n';
ok(asrc8.includes(range), 'control anchor: the slab range check is in cardPlacement');
const afNoRange = M.write('src/artifacts.js', asrc8.replace(range, '\n'), 'norange');
const MR8 = M.load('src/normalizers.js', nsrc8.replace("require('./artifacts.js')", 'require(' + JSON.stringify(afNoRange) + ')'), 'norange');
MR8.setArtifactStoreSource(REG.storeRowsOf); MR8.setArtifactServiceSource(() => ({}));
const s10 = { backend: 'claude', cwd: CWD, host: '', _artifacts: {}, _normalizer: null };
await MR8.rebuildHistory(s10, 's8', SLAB_RECS);
ok(s10._normalizer.messages.some((m) => m.noticeKind === 'artifact' && keyOfCard(m) === pgOldKey), 'CONTROL: the store rows placed without the range check draw the page published before the slab (the ⑩ "no card" assert sees it)');
N.setArtifactServiceSource(REG.servicesOf);

console.log('⑪ a page ANOTHER conversation published, shown here by its /p/<id> link, is a presented page row (lane pages-chip-groups, B-aa28)');
{
  const HOOK = require(path.join(REPO, 'src/harnesses/artifacts-of.js'));
  const PID = (c) => 'pg' + String(c).repeat(10).slice(0, 10); // the store's id shape: 'pg' + 10 of [a-z0-9]
  const ppSrc = (await import('node:fs')).readFileSync(path.join(REPO, 'src/server/published-pages.js'), 'utf8');
  ok(/const mintId = \(\) => 'pg' \+ Array\.from\(\{ length: 10 \}, \(\) => 'abcdefghijklmnopqrstuvwxyz0123456789'\[/.test(ppSrc) && AF.PAGE_LINK.source.includes('pg[a-z0-9]{10}'), 'the witness reads the pages store\'s OWN id shape (published-pages mintId: pg + 10 of [a-z0-9])');
  const sayAt = (text, s) => ({ type: 'assistant', uuid: 'p' + s, timestamp: T(s), cwd: CWD, sessionId: 'c-pa', message: { id: 'msg_p' + s, role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }] } });
  const userAt = (content, s) => ({ type: 'user', uuid: 'u' + s, timestamp: T(s), cwd: CWD, sessionId: 'c-pa', message: { role: 'user', content } });
  const links = AF.pageLinksIn(`a /p/${PID('a')} b (/p/${PID('b')}) https://vs.example.com:3456/p/${PID('c')}/ /home/u/p/${PID('d')} x/p/${PID('e')} /p/${PID('f')}0 /p/${PID('a')}`);
  ok(JSON.stringify(links) === JSON.stringify([{ id: PID('a'), origin: '' }, { id: PID('b'), origin: '' }, { id: PID('c'), origin: 'https://vs.example.com:3456' }]), 'pageLinksIn: a relative /p/<id>, a markdown link, an absolute URL (its origin kept); a file path, a word-joined path, a longer id and a repeat are not links', links);
  const OTHER = { id: PID('o'), name: 'house tour', path: '/p/' + PID('o'), public: true, updatedAt: 5, sessionId: 'sB', conversationId: 'c-pb' };
  const MINE = { id: PID('m'), name: 'my page', path: '/p/' + PID('m'), public: false, updatedAt: 6, sessionId: 'sA', conversationId: 'c-pa' };
  const MINE_CID = { id: PID('n'), name: 'mine before a resume', path: '/p/' + PID('n'), updatedAt: 7, sessionId: 'sOld', conversationId: 'c-pa' };
  const GONE = PID('g');
  const PSTORE = { pages: [OTHER, MINE, MINE_CID], gone: [GONE] };
  const pagesStore = { list: () => [], byId: (id) => { const p = PSTORE.pages.find((x) => x.id === id); return p ? { page: p } : (PSTORE.gone.includes(id) ? { gone: true } : null); } };
  const sA = { backend: 'claude', sockName: 'sA', claudeSessionId: 'c-pa', cwd: CWD, host: '', name: 'Writer', _artifacts: {} };
  const sB = { backend: 'claude', sockName: 'sB', claudeSessionId: 'c-pb', cwd: CWD, host: '', name: 'Publisher', _artifacts: {} };
  const told = [];
  const regCfg = (more = []) => ({ activeSessions: () => new Map([['sA', sA], ['sB', sB], ...more]), pages: () => pagesStore, designs: () => null, sessionMeta: null, instanceUrl: { url: () => 'https://vs.example.com:3456' }, toSession: (s, sid, m) => told.push({ sid, ...m }), log: { log() {}, warn() {} } });
  REG.configure(regCfg());
  const recs = [
    sayAt(`Here is the tour: /p/${OTHER.id}`, 20),
    userAt([{ type: 'tool_result', tool_use_id: 'x', content: `Published /p/${PID('t')}` }], 21), // a tool result is not a text record
    userAt(`and mine: https://vs.example.com:3456/p/${MINE.id} plus /p/${MINE_CID.id}`, 22),
    sayAt(`gone: /p/${GONE} unknown: /p/${PID('u')} foreign: https://elsewhere.example/p/${PID('w')} foreign-but-ours: http://10.0.0.5:3456/p/${OTHER.id}`, 23),
  ];
  ok(HOOK.claude(recs[1]).length === 0 && HOOK.claude(recs[0]).length === 1 && HOOK.claude(recs[0])[0].op === 'present', 'the claude hook: a text block witnesses, a tool_result never does');
  ok(HOOK.codex({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `/p/${OTHER.id}` }] } })[0]?.page === OTHER.id
    && HOOK.acp({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `see /p/${OTHER.id}` } } } })[0]?.page === OTHER.id, 'codex (a message item) and ACP (a message chunk) witness through their own hooks');
  for (const r of recs) REG.observe(sA, r);
  const keyO = AF.keyOf('', '/p/' + OTHER.id);
  ok(sA._artifacts[keyO]?.presented === true && sA._artifacts[keyO].kind === 'page' && !sA._artifacts[AF.keyOf('', '/p/' + PID('t'))], 'live: the reply\'s link is a presented page row keyed by the page id; the tool result\'s link is none', sA._artifacts[keyO]);
  ok(told.filter((m) => m.type === 'artifacts-changed' && m.sid === 'sA').length >= 1, 'a presented birth tells the conversation\'s clients (artifacts-changed → they re-read the one feed)');
  const items = REG.listFor('sA').items, byPage = Object.fromEntries(items.filter((b) => b.presented).map((b) => [b.page, b]));
  ok(byPage[OTHER.id]?.name === 'house tour' && byPage[OTHER.id].publisher === 'Publisher' && byPage[OTHER.id].public === true && byPage[OTHER.id].state === 'published' && byPage[OTHER.id].url === '/p/' + OTHER.id && !byPage[OTHER.id].gone, 'listFor resolves it NOW: the page\'s name, public, the publisher conversation\'s live name', byPage[OTHER.id]);
  ok(!byPage[MINE.id] && !byPage[MINE_CID.id], 'this conversation\'s own page (by session id, and by conversation id after a resume) is never a presented row');
  ok(byPage[GONE]?.gone === true && byPage[PID('u')]?.gone === true && byPage[GONE].state === 'unpublished', 'an unpublished page (410) and an id never published here stay as rows marked gone');
  ok(!byPage[PID('w')], 'another instance\'s URL to an id unknown here is no witness (dropped)');
  ok(items.filter((b) => b.presented).length === 3, 'the shown-here rows: the tour, the gone one, the unknown one', Object.keys(byPage));
  ok(!(sA._normalizer && sA._normalizer.messages || []).some((m) => m.noticeKind === 'artifact' && m.content?.[0]?.presented) && !AF.cardWorthy(sA._artifacts[keyO]), 'a presented row never draws a chat card (the message carries the link)');
  ok(AF.rowFor(sA._artifacts, '/p/' + OTHER.id) === null, 'a page only SHOWN here cannot be handed over (rowFor)');
  told.length = 0;
  REG.notePage({ ...OTHER, removed: true }, { removed: true });
  PSTORE.pages = PSTORE.pages.filter((p) => p.id !== OTHER.id); PSTORE.gone.push(OTHER.id);
  ok(told.some((m) => m.type === 'artifacts-changed' && m.sid === 'sA') && REG.listFor('sA').items.find((b) => b.page === OTHER.id)?.gone === true, 'the publisher unpublishes later ⇒ the showing conversation hears artifacts-changed and its row reads gone');
  // the cap: 55 distinct links ⇒ the newest 50 kept
  const sC = { backend: 'claude', sockName: 'sC', cwd: CWD, host: '', _artifacts: {} };
  for (let i = 0; i < 55; i++) REG.observe(sC, sayAt(`/p/pg${String(i).padStart(10, '0')}`, 30 + i));
  const kept = Object.values(sC._artifacts).filter((r) => r.presented).map((r) => r.page);
  ok(kept.length === AF.MAX_PRESENTED && AF.MAX_PRESENTED === 50 && !kept.includes('pg0000000000') && kept.includes('pg0000000054'), `the cap: ≤ ${AF.MAX_PRESENTED} presented rows per conversation, the newest-mentioned kept`, kept.length);
  // the rebuild path: the same rows from the transcript
  const sR = { backend: 'claude', sockName: 'sR', claudeSessionId: 'c-pr', cwd: CWD, host: '', _artifacts: {}, _normalizer: null };
  await N.rebuildHistory(sR, 'sR', [sayAt(`replayed /p/${PID('r')}`, 40)]);
  ok(sR._artifacts[AF.keyOf('', '/p/' + PID('r'))]?.presented === true, 'rebuild: the transcript\'s link re-derives the presented row (the registry\'s second path)');
  // lane artifacts-by-intent r3 (z1): WHO wrote a link is the message's PROVENANCE, through BOTH doors — the live consumer
  // (registry observe) and the rebuild (normalizers artifactDeriver); the r2 acceptance reverted either door to r1's forced
  // «agent» and no suite went red
  const PEERP = { id: PID('e'), name: 'Referee report', path: '/p/' + PID('e'), public: true, updatedAt: 8, sessionId: 'sB', conversationId: 'c-pb' };
  const PASTEP = { id: PID('f'), name: 'A page they pasted', path: '/p/' + PID('f'), public: true, updatedAt: 9, sessionId: 'sB', conversationId: 'c-pb' };
  PSTORE.pages.push(PEERP, PASTEP);
  const peerAt = (text, s) => ({ ...userAt(`Another Claude session sent a message:\n${text}`, s), isMeta: true, origin: { kind: 'peer', from: 'unknown' }, promptSource: 'system' }); // the CLI's measured peer record (scripts/fixtures/message-origin)
  const DOOR = [peerAt(`Message from session "referee" (via vibespace-msg; reply: vibespace-msg send "referee" "..."):\nreport published: /p/${PEERP.id}`, 60), userAt(`can you fix the table on /p/${PASTEP.id} ?`, 61)];
  const bandsOf = (rows) => Object.fromEntries(Object.values(rows || {}).filter((r) => r.presented).map((r) => [r.page, AF.intentOf(r)]));
  const doorsRight = (b) => b[PEERP.id] === 'foryou' && b[PASTEP.id] === 'made';
  const sD = { backend: 'claude', sockName: 'sD', claudeSessionId: 'c-pd', cwd: CWD, host: '', name: 'Lead', _artifacts: {} };
  REG.configure(regCfg([['sD', sD]]));
  for (const r of DOOR) REG.observe(sD, r);
  const liveD = Object.fromEntries(REG.listFor('sD').items.filter((b) => b.presented).map((b) => [b.page, b.intent]));
  ok(doorsRight(liveD), 'LIVE door (observe → listFor): a peer\'s vibespace-msg send with a /p/ link ⇒ «for you»; the person\'s own paste ⇒ «made here»', liveD);
  const sDr = { backend: 'claude', sockName: 'sDr', claudeSessionId: 'c-pdr', cwd: CWD, host: '', _artifacts: {}, _normalizer: null };
  await N.rebuildHistory(sDr, 'sDr', DOOR);
  ok(doorsRight(bandsOf(sDr._artifacts)), 'REBUILD door (the transcript\'s derivation): the same two verdicts', bandsOf(sDr._artifacts));
  {
    const fsD = await import('node:fs'), rsrc = fsD.readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8'), nsrcD = fsD.readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8');
    const liveDoor = 'noteOp(session, { ...o, by: AF.opAuthor(o) })', rbDoor = "by: AF.opAuthor(o) }); // the person's own page link";
    const M4e = rsrc.includes(liveDoor) ? M.load('src/server/artifact-registry.js', rsrc.replace(liveDoor, "noteOp(session, { ...o, by: 'agent' })"), 'liveagent') : null;
    const sE = { backend: 'claude', sockName: 'sE', claudeSessionId: 'c-pe', cwd: CWD, host: '', _artifacts: {} };
    if (M4e) { M4e.configure(regCfg([['sE', sE]])); for (const r of DOOR) M4e.observe(sE, r); REG.configure(regCfg()); } // the copy's configure pointed the rebuild's helper seam at itself — the real one again
    ok(M4e && bandsOf(sE._artifacts)[PASTEP.id] === 'foryou', 'CONTROL the live door forcing «agent» (r1 — the acceptor\'s M4e) ⇒ the person\'s paste reads «for you» — RED', M4e && bandsOf(sE._artifacts));
    const M4f = nsrcD.includes(rbDoor) ? M.load('src/normalizers.js', nsrcD.replace(rbDoor, "by: 'agent' }); // control"), 'rebuildagent') : null;
    const sF = { backend: 'claude', sockName: 'sF', claudeSessionId: 'c-pf', cwd: CWD, host: '', _artifacts: {}, _normalizer: null };
    if (M4f) await M4f.rebuildHistory(sF, 'sF', DOOR);
    ok(M4f && bandsOf(sF._artifacts)[PASTEP.id] === 'foryou', 'CONTROL the rebuild forcing «agent» (r1 — the acceptor\'s M4f) ⇒ RED', M4f && bandsOf(sF._artifacts));
  }
  // r4 (W1): a For-you TRAY ANSWER is ONE message with TWO authors — composeReply quotes the ask (its text + up to
  // DETAIL_QUOTE_CAP chars of its detail: the AGENT's words) above the person's answer. The r3 acceptance's three measured
  // records (claude JSONL promptSource sdk · the live _fromWebui record · codex input_text): the ask's pages «for you» at
  // BOTH doors; a link the person typed in the ANSWER lines «made»; a link the cap cut mid-id is no row from the reply.
  {
    const IR = require(path.join(REPO, 'src/inbox-reply.js'));
    const ASKP = { id: PID('h'), name: 'Referee report', path: '/p/' + PID('h'), public: true, updatedAt: 10, sessionId: 'sB', conversationId: 'c-pb' };
    const DIFFP = { ...ASKP, id: PID('i'), name: 'The diff', path: '/p/' + PID('i') }, MINEP = { ...ASKP, id: PID('j'), name: 'My notes', path: '/p/' + PID('j') }, CUTP = { ...ASKP, id: PID('k'), name: 'Cut', path: '/p/' + PID('k') };
    PSTORE.pages.push(ASKP, DIFFP, MINEP, CUTP);
    const ASK = { id: 'ut-0123456789', text: `Please review the referee report /p/${ASKP.id} before I merge`, detail: `Also see /p/${DIFFP.id} for the diff\n${'x'.repeat(IR.DETAIL_QUOTE_CAP - 46)} /p/${CUTP.id}`, createdAt: Date.parse(T(70)), urgency: 'normal' };
    const reply = IR.composeReply(ASK, `Looks fine, merge it — my own notes: /p/${MINEP.id}`, { now: Date.parse(T(80)) });
    const cutAt = reply.indexOf('/p/' + CUTP.id.slice(0, 4));
    ok(IR.parseReply(reply) && cutAt > 0 && !reply.includes('/p/' + CUTP.id), 'the fixture: composeReply\'s own reply (the parser reads it back); the detail\'s last link cut at the cap MID-ID (' + JSON.stringify(reply.slice(cutAt, cutAt + 12)) + ')');
    const RECS3 = {
      'claude JSONL (sdk)': { type: 'user', uuid: 'tr1', timestamp: T(80), cwd: CWD, sessionId: 'c-pt', promptSource: 'sdk', message: { role: 'user', content: reply } },
      'claude live (_fromWebui)': { type: 'user', _fromWebui: true, msgId: 'm-tray', uuid: 'tr2', timestamp: T(80), cwd: CWD, sessionId: 'c-pt', message: { role: 'user', content: [{ type: 'text', text: reply }] } },
      'codex input_text': { type: 'response_item', timestamp: T(80), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: reply }] } },
    };
    const trayRight = (b) => b[ASKP.id] === 'foryou' && b[DIFFP.id] === 'foryou' && b[MINEP.id] === 'made' && !(CUTP.id in b);
    const sess = (id, backend = 'claude') => ({ backend, sockName: id, claudeSessionId: 'c-' + id, cwd: CWD, host: '', name: id, _artifacts: {}, _normalizer: null });
    const live = {}, rebuilt = {};
    for (const [k, rec] of Object.entries(RECS3)) {
      const backend = k.startsWith('codex') ? 'codex' : 'claude', sL = sess('sTL' + backend + k.length, backend), sR3 = sess('sTR' + backend + k.length, backend);
      REG.configure({ ...regCfg([[sL.sockName, sL]]), asks: () => [ASK] }); // r10: the item the person answers is this conversation's ask (the store keeps it)
      REG.observe(sL, rec); live[k] = Object.fromEntries(REG.listFor(sL.sockName).items.filter((b) => b.presented).map((b) => [b.page, b.intent]));
      await N.rebuildHistory(sR3, sR3.sockName, [rec]); rebuilt[k] = bandsOf(sR3._normalizer && sR3._normalizer.derivedArtifacts); // the transcript's derivation (the store's own copy of the ask is storeRows' — below)
    }
    REG.configure({ ...regCfg(), asks: () => [] });
    ok(['claude JSONL (sdk)', 'claude live (_fromWebui)'].every((k) => trayRight(live[k])), 'LIVE door (observe → listFor), a tray answer: the ask\'s pages (its text, its detail) «for you»; the person\'s own link in the answer «made»; nothing from the cut link', live);
    ok(Object.keys(RECS3).every((k) => trayRight(rebuilt[k])), 'REBUILD door (the transcript\'s derivation): the same verdicts for claude JSONL, the live record and codex input_text', rebuilt);
    // door (a): THE ASK — presentAsk folds every /p/ link in the ask's text and WHOLE detail (the cut one too) as the agent's
    const sQ = sess('sQ');
    REG.configure(regCfg([['sQ', sQ]]));
    const nQ = REG.presentAsk(sQ, null, { id: ASK.id, said: [ASK.text, ASK.detail] });
    const askB = Object.fromEntries(REG.listFor('sQ').items.filter((b) => b.presented).map((b) => [b.page, b.intent]));
    REG.observe(sQ, RECS3['claude JSONL (sdk)']);
    const afterB = Object.fromEntries(REG.listFor('sQ').items.filter((b) => b.presented).map((b) => [b.page, b.intent]));
    ok(nQ === 3 && askB[ASKP.id] === 'foryou' && askB[DIFFP.id] === 'foryou' && askB[CUTP.id] === 'foryou' && afterB[ASKP.id] === 'foryou' && afterB[MINEP.id] === 'made', 'AT THE ASK (presentAsk, no --artifact): the links in its text and its whole detail are «for you» from the ask on — the cut one too; the answer later changes none of them', { askB, afterB });
    // controls: r3's whole-message rule at the reader; r3's presentAsk (attachments only)
    const fsT = await import('node:fs'), osrc = fsT.readFileSync(path.join(REPO, 'src/harnesses/artifacts-of.js'), 'utf8'), rsrcT = fsT.readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8');
    const splitLine = (/^ {2}for \(const s of texts\) \{ const rp = parseReply\(s\); if \(rp\) out\.push\(.*$/m.exec(osrc) || [''])[0]; // the reader's split line (r4's or r5's words)
    const WM = splitLine ? M.load('src/harnesses/artifacts-of.js', osrc.replace(splitLine, '  out.push(...presentOps(texts, by));'), 'wholemsg') : null;
    if (ok(WM, 'CONTROL needle present: the reader\'s split of a tray answer (r4) — a tree without it has nothing to patch')) {
      const wmB = bandsOf(AF.resolvePresented(WM.claude(RECS3['claude JSONL (sdk)']).reduce((rows, o) => AF.apply(rows, { cwd: CWD, at: 1, ...o, by: AF.opAuthor(o) }).rows, {}), { pageOf: (id) => ({ page: { ...ASKP, id } }) }));
      ok(wmB[ASKP.id] === 'made', 'CONTROL r3\'s whole-message rule (a tray answer\'s every line the person\'s) ⇒ the ask\'s page reads «made here» — RED', wmB);
    }
    const askLine = 'for (const op of AF.askOps({ artifacts, id, at, said }))'; // r6: the ONE reader of an ask (AF.askOps)
    const PA = rsrcT.includes(askLine) ? M.load('src/server/artifact-registry.js', rsrcT.replace(askLine, 'for (const op of AF.askOps({ artifacts, id, at }))'), 'askattachonly') : null;
    if (ok(PA, 'CONTROL needle present: presentAsk\'s fold of the ask\'s words (r4) — a tree without it has nothing to patch')) {
      const sQ2 = sess('sQ2');
      PA.configure(regCfg([['sQ2', sQ2]])); PA.presentAsk(sQ2, null, { id: ASK.id, said: [ASK.text, ASK.detail] }); REG.configure(regCfg());
      ok(!Object.keys(sQ2._artifacts).length, 'CONTROL r3\'s presentAsk (the attachments only) ⇒ an ask naming a page in its words shows none — RED', Object.keys(sQ2._artifacts));
    }
    // r5 (V5): A TOKEN THE CAP CUT IS NO LINK — a link that ENDS at the cap is read only when the detail was whole (≤ the
    // cap); at the cap with more detail beyond it, it is a token cut through: no row from the reply (whatever the ask
    // carried whole was folded at the ask — presentAsk). Through the reader, the cap landing exactly at the token's end
    const C = IR.DETAIL_QUOTE_CAP, PH = PID('q'), AT = PID('r'), pad = 'x'.repeat(C - 16) + ' /p/'; // a 12-char id's last char lands at index C - 1
    const fromReply = (detail) => { const rep = IR.composeReply({ ...ASK, detail }, 'ok', { now: Date.parse(T(80)) }); return HOOK.claude({ type: 'user', promptSource: 'sdk', message: { role: 'user', content: rep } }).map((o) => o.page + ':' + (o.by || 'agent')).filter((x) => !x.startsWith(ASKP.id)); };
    const atCap = { phantom: fromReply(pad + PH + 'z and more'), cutLink: fromReply(pad + AT + ' and more'), whole: fromReply(pad + AT), before: fromReply(pad.slice(1) + AT + ' and more') };
    const askPh = AF.pageLinksIn(pad + PH + 'z and more').length;
    ok((pad + AT).length === C && askPh === 0 && !atCap.phantom.length && !atCap.cutLink.length, 'a token of pg + 11 (no link) cut by the cap to pg + 10 ⇒ no row from the reply (the ask saw no link either); a link ending AT the cap with more detail beyond ⇒ no row from the reply — a token cut through', atCap);
    ok(atCap.whole.join() === AT + ':agent' && atCap.before.join() === AT + ':agent', 'a link ending at the cap in a detail of exactly the cap (whole) ⇒ read, the agent\'s; a link ending one before the cap (a space at the cut) ⇒ read', atCap);
    const uncutLine = 'presentOps([uncut(rp)])'; // the quote's reading (r5's words; r10 names the quoted item after it)
    const UC = osrc.includes(uncutLine) ? M.load('src/harnesses/artifacts-of.js', osrc.replace(uncutLine, 'presentOps([rp.quote])'), 'quotewhole') : null;
    if (ok(UC, 'CONTROL needle present: the reader\'s drop of the token the cap cut (r5) — a tree without it has nothing to patch')) {
      const ucPh = UC.claude({ type: 'user', promptSource: 'sdk', message: { role: 'user', content: IR.composeReply({ ...ASK, detail: pad + PH + 'z and more' }, 'ok', { now: Date.parse(T(80)) }) } }).map((o) => o.page);
      ok(ucPh.includes(PH), 'CONTROL r4\'s reader (the quote read whole) ⇒ the cut token births a phantom row «' + PH + '» — RED', ucPh);
    }
    // r6 (U1): A TOKEN CUT AT ANY CAP IS NO LINK — ONE rule for every cap. The store keeps an ask's words to TEXT_MAX /
    // DETAIL_MAX through the grammar's ONE cut (`clip`: the kept words end in the cut mark — test-user-todos-layout ⑫ pins
    // the store's own record) and both readers of the kept words drop the token the cut went through: presentAsk at the
    // ask (AF.askOps), the reader of the tray answer's quote. The acceptance's fixture (a pg + 11 token over char 500) and
    // the one only the mark stops (the kept chars end in pg + 10, the mark after them) — in the text and the detail
    const RT = require(path.join(REPO, 'src/inbox-reply-text.js'));
    const utSrc = fsT.readFileSync(path.join(REPO, 'src/user-todos.js'), 'utf8');
    const TM = +(/^const TEXT_MAX = (\d+);$/m.exec(utSrc) || [])[1], DM = +(/^const DETAIL_MAX = (\d+);$/m.exec(utSrc) || [])[1];
    ok(TM === 500 && DM === 8000 && /\btext = clip\(rawText, TEXT_MAX\);/.test(utSrc) && /\bdetail = rawDetail \? clip\(rawDetail, DETAIL_MAX\) : null;/.test(utSrc) && typeof RT.clip === 'function',
      'census: the store keeps an ask\'s text to TEXT_MAX 500 and its detail to DETAIL_MAX 8 000 through the grammar\'s ONE cut (`clip` — the cut mark where the cut is made)');
    const clipT = typeof RT.clip === 'function' ? RT.clip : (s, cap) => s.slice(0, cap), sliceT = (s, cap) => s.slice(0, cap); // sliceT: r5's store
    const P11 = PID('7') + '7', W10 = PID('8'); // a 13-char token (pg + 11: no page id) · a page id
    const CUTS = {
      acceptance: { text: 'x'.repeat(484) + ' /p/' + P11 + ' tail words after the token', detail: null }, // the token over char 500
      atMark: { text: 'x'.repeat(483) + ' /p/' + P11 + ' more', detail: 'y'.repeat(DM - 17) + ' /p/' + P11 + ' more' }, // kept: pg + 10, then the mark
      whole: { text: 'x'.repeat(TM - 16) + ' /p/' + W10, detail: 'y'.repeat(DM - 16) + ' /p/' + W10 }, // a link ending AT the cap, nothing beyond
    };
    const kept = (k, cut = clipT) => ({ id: 'ut-00000000c' + Object.keys(CUTS).indexOf(k), urgency: 'normal', createdAt: Date.parse(T(70)), text: cut(CUTS[k].text, TM), detail: CUTS[k].detail == null ? null : cut(CUTS[k].detail, DM) });
    let nU = 0;
    const atAsk = (it) => { const s = sess('sU' + (++nU)); REG.presentAsk(s, null, { id: it.id, said: [it.text, it.detail] }); return Object.values(s._artifacts).map((r) => r.page); };
    const fromQuote = (it, R = HOOK) => R.claude({ type: 'user', promptSource: 'sdk', message: { role: 'user', content: IR.composeReply(it, 'ok', { now: Date.parse(T(80)) }) } }).map((o) => o.page);
    const k6 = Object.fromEntries(Object.keys(CUTS).map((k) => { const it = kept(k); return [k, { tail: it.text.slice(-3) + '|' + String(it.detail).slice(-3), ask: atAsk(it), reply: fromQuote(it) }]; }));
    ok(!k6.acceptance.ask.length && !k6.acceptance.reply.length && !k6.atMark.ask.length && !k6.atMark.reply.length && k6.atMark.tail === '77…|77…',
      'a pg + 11 token the store\'s cut went through — char 500 of the text, 8 000 of the detail (the acceptance\'s fixture; and the kept chars ending in pg + 10, the mark after them) ⇒ no row at the ask (presentAsk), no row from the tray answer\'s quote of the same kept text', k6);
    ok(k6.whole.ask.join() === W10 && k6.whole.reply.join() === W10 && !k6.whole.tail.includes('…'), 'a whole link ending exactly AT the cap, nothing beyond (no cut, no mark) ⇒ a row at the ask and from the reply', k6.whole);
    const r5store = { ask: atAsk(kept('acceptance', sliceT)), reply: fromQuote(kept('acceptance', sliceT)) };
    ok(r5store.ask.join() === PID('7') && r5store.reply.join() === PID('7'), 'CONTROL r5\'s store (a plain slice — the cut unmarked) ⇒ the acceptance\'s phantom «' + PID('7') + '» at the ask and from the reply — RED', r5store);
    const mk6 = kept('atMark'), r5read = { ask: AF.pageLinksIn([mk6.text, mk6.detail].join('\n')).map((l) => l.id), reply: UC ? fromQuote(mk6, UC) : null };
    ok(r5read.ask.join() === PID('7') && (r5read.reply || []).join() === PID('7'), 'CONTROL r5\'s readers (the mark unread: presentAsk over the kept words whole; the reply\'s `cutAt` only — a text cut sets none) ⇒ the phantom at both doors — RED', r5read);
  }
  // r5 (V2): THE ONE RULE — a row BORN or MOVED BETWEEN BANDS tells the conversation's clients (artifacts-changed → they
  // re-read GET /api/artifacts: listFor is what the client draws), code rows included; an op that moves nothing tells nothing
  {
    const PGV = { id: PID('v'), name: 'Their spec', path: '/p/' + PID('v'), public: true, updatedAt: 10, sessionId: 'sB', conversationId: 'c-pb' };
    PSTORE.pages.push(PGV);
    const sV = { backend: 'claude', sockName: 'sV', claudeSessionId: 'c-sv', cwd: CWD, host: '', name: 'Asker', _artifacts: {}, _normalizer: null };
    const toldV = () => told.filter((m) => m.type === 'artifacts-changed' && m.sid === 'sV').length;
    const bandV = (R, pred) => { const v = R.listFor('sV'); return (v.items.concat(v.code).find(pred) || {}).intent; };
    const APP = CWD + '/src/app.py', attach = [{ kind: 'file', host: '', path: APP, name: 'app.py' }];
    const editRec = (n) => ({ type: 'assistant', uuid: 've' + n, timestamp: T(90 + n), cwd: CWD, sessionId: 'c-sv', message: { id: 'msg_ve' + n, role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'tu-ve' + n, name: 'Edit', input: { file_path: APP, old_string: 'a', new_string: 'b' } }] } });
    const run = (R) => {
      R.configure(regCfg([['sV', sV]])); sV._artifacts = {};
      const tl = [], bd = [];
      const step = (f, pred) => { const t0 = toldV(); f(); tl.push(toldV() - t0); bd.push(pred ? bandV(R, pred) : ''); };
      const isPg = (b) => b.page === PGV.id, isApp = (b) => b.path === APP;
      step(() => R.observe(sV, { type: 'user', promptSource: 'sdk', uuid: 'vp', timestamp: T(89), cwd: CWD, sessionId: 'c-sv', message: { role: 'user', content: [{ type: 'text', text: 'my notes: /p/' + PGV.id }] } }), isPg); // 0 the person pastes it
      step(() => R.presentAsk(sV, null, { id: 'ut-00000000a1', said: ['Please review /p/' + PGV.id] }), isPg); // 1 an ask names it
      step(() => R.presentAsk(sV, null, { id: 'ut-00000000a2', said: ['Again: /p/' + PGV.id] }), isPg); // 2 a second ask: nothing moves
      step(() => R.observe(sV, editRec(1)), isApp); // 3 an Edit births a code row
      step(() => R.observe(sV, editRec(2)), isApp); // 4 a second Edit: nothing moves
      step(() => R.presentAsk(sV, attach, { id: 'ut-00000000a3' }), isApp); // 5 an ask attaches it
      step(() => R.presentAsk(sV, attach, { id: 'ut-00000000a3' }), isApp); // 6 the SAME op again (seen)
      step(() => R.observe(sV, editRec(3)), isApp); // 7 an Edit after: still «for you», nothing moves
      REG.configure(regCfg());
      return { tl, bd };
    };
    const g = run(REG);
    ok(g.bd[0] === 'made' && g.bd[1] === 'foryou' && g.tl[1] === 1, 'presentAsk naming a page the person pasted ⇒ told +1, and listFor (what the client re-reads on it) moves it «made» → «for you»', g);
    ok(g.bd[3] === 'touched' && g.bd[5] === 'foryou' && g.tl[3] === 1 && g.tl[5] === 1, 'a code row: born by an Edit ⇒ told +1; an ask attaching it ⇒ told +1, «touched» → «for you»', g);
    ok(g.tl[2] === 0 && g.tl[4] === 0 && g.tl[6] === 0 && g.tl[7] === 0, 'an op that moves nothing tells nothing — a second ask on a row already «for you», a second Edit, the same op twice, an Edit after the ask (no storm)', g.tl);
    const csrc = (await import('node:fs')).readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
    ok(/msg\.type === 'artifacts-changed' && msg\.sessionId === sessionId\) \{\s*this\._refreshArtifacts\(\);/.test(csrc) && /_refreshArtifacts\(\) \{[\s\S]{0,400}fetch\(`\/api\/artifacts\?sessionId=[\s\S]{0,200}setArtifacts\(v\); publishArtifacts\(this\.sessionId, v\)/.test(csrc),
      'census: the client hears it — chat-view re-reads GET /api/artifacts on artifacts-changed; the chip and an open Artifacts window (publishArtifacts) draw the answer');
    const rsrcV = (await import('node:fs')).readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8');
    const oneRule = "  if (r.born || AF.intentOf(before[r.row.key]) !== AF.intentOf(r.row)) tellChanged(session);";
    const B4 = rsrcV.includes(oneRule) ? M.load('src/server/artifact-registry.js', rsrcV.replace(oneRule, '  if (r.row.presented && r.born) tellChanged(session);'), 'tellborn') : null;
    if (ok(B4, 'CONTROL needle present: noteOp\'s one tell rule (r5) — a tree without it has nothing to patch')) {
      const g4 = run(B4);
      REG.configure(regCfg()); // the copy's configure re-pointed the normalizers' seams — the real one again
      ok(g4.bd[1] === 'foryou' && g4.tl[1] === 0 && g4.tl[5] === 0, 'CONTROL r4\'s rule (told only at a presented birth) ⇒ the pasted page moves to «for you» and the code file too with nothing told — the open list keeps the old band — RED', g4.tl);
    }
  }
  // r4: the machines a view names, AS THE PERSON READS THEM (deps.hostName = the hosts registry's record name — the host
  // pickers' word): the list model's host rule says «gpu1:», never «host-1a2b3c4d:»
  {
    const HID = 'host-1a2b3c4d', sH = { backend: 'claude', sockName: 'sH', claudeSessionId: 'c-ph', cwd: CWD, host: HID, name: 'Remote', _artifacts: {} };
    const names = { [HID]: 'gpu1', 'host-2b3c4d5e': 'gpu2' };
    const HOSTS = { get: (id) => { if (!names[id]) throw new Error('host not found'); return { id, name: names[id] }; } }; // HostManager.get's shape: the record, a throw for an id it lost
    const cfgH = { ...regCfg([['sH', sH]]), hosts: () => HOSTS };
    REG.configure(cfgH);
    sH._artifacts = [[HID, CWD + '/a.md'], ['', '/srv/hub/b.md'], ['host-2b3c4d5e', '/srv/c.md'], ['host-dead1234', '/srv/d.md']].reduce((rows, [h, p], i) => AF.apply(rows, { op: 'write', host: h, path: p, cwd: CWD, at: 100 + i }).rows, {});
    const lv = REG.listFor('sH');
    REG.configure(regCfg());
    ok(lv.host === HID && JSON.stringify(lv.hostNames) === JSON.stringify({ [HID]: 'gpu1', 'host-2b3c4d5e': 'gpu2' }), 'listFor names the machines its view mentions by the hosts registry\'s name (the conversation\'s own included; the hub\'s own and a machine gone from the list: none — the model says «Local» / the id)', lv.hostNames);
    const hsrc = (await import('node:fs')).readFileSync(path.join(REPO, 'src/server/artifact-registry.js'), 'utf8'), hdoor = ', hostNames: hostNamesOf([host, ...v.items.map((r) => r.host), ...v.code.map((r) => r.host)]) }';
    const MH = hsrc.includes(hdoor) ? M.load('src/server/artifact-registry.js', hsrc.replace(hdoor, ' }'), 'nohostnames') : null;
    if (ok(MH, 'CONTROL needle present: listFor\'s machine names (r4) — a tree without it has nothing to patch')) {
      const mhv = (MH.configure(cfgH), MH.listFor('sH'));
      REG.configure(regCfg()); // the copy's configure re-pointed the normalizers' seams — the real one again
      ok(!mhv.hostNames, 'CONTROL r3\'s listFor (no names) ⇒ the list reads the internal id — RED');
    }
    // r5 (V4): THE WIRING — server.js hands the registry the hosts registry the host pickers read (`hosts: () => hosts`,
    // the HostManager); its own words, evaluated over a stub registry, carry «gpu1» to listFor (the list model's hostTag
    // reads it as «gpu1:» — test-artifacts-intent's machine-name leg)
    const srvSrc = (await import('node:fs')).readFileSync(path.join(REPO, 'server.js'), 'utf8');
    const wireOf = (src) => { const line = src.split('\n').find((l) => l.startsWith("require('./src/server/artifact-registry.js').configure(")) || ''; const m = /[{,] hosts: (\(\) => [A-Za-z_$][\w$]*)[,}]/.exec(line); return m && /^const hosts = new HostManager\(/m.test(src) ? m[1] : null; };
    const wordVia = (src) => { const w = wireOf(src); let thunk = () => null; try { thunk = w ? new Function('hosts', `return (${w});`)(HOSTS) : thunk; } catch { /* no wiring */ } REG.configure({ ...regCfg([['sH', sH]]), hosts: thunk }); const v = REG.listFor('sH'); REG.configure(regCfg()); return (v.hostNames || {})[HID] || null; };
    ok(wireOf(srvSrc) === '() => hosts', 'census: server.js configures the registry with `hosts: () => hosts` — `hosts` the HostManager the host pickers read');
    ok(wordVia(srvSrc) === 'gpu1', 'through server.js\'s own wiring (its words over a stub hosts registry) ⇒ listFor names the machine «gpu1»', wordVia(srvSrc));
    const noDep = srvSrc.replace(' hosts: () => hosts,', '');
    ok(noDep !== srvSrc && wireOf(noDep) === null && wordVia(noDep) === null, 'CONTROL the dep removed from server.js ⇒ the census reds and listFor names no machine (the list reads «' + HID + ':») — RED', wordVia(noDep));
    // r6 (U2 + U3) → r7 (T1 · T2 · T5): THE ASK STORE AT THE REBUILD, read by the ask route's own answer to «whose ask is
    // this?» (src/agent-routes/status.js asksOf: the route's key — a pending fork's placeholder —, the route's own items,
    // `via: 'ask'`), wired by server.js's own words over the records a For-you store holds: an older tree's (its asks carry
    // no mark — the store's load marks them by the route's shape, IO.legacyAsk; test-user-todos-layout pins that load on the
    // real store) and this tree's filings. The merge stamps the row; a stamp the merge gained is PERSISTED at the rebuild
    // (normalizers' persist seam → persistSoon) and a rebuild that gains none writes nothing.
    const fsX = await import('node:fs');
    const IO = require(path.join(REPO, 'src/inbox-origin.js')), STR = require(path.join(REPO, 'src/agent-routes/status.js'));
    const MA = require(path.join(REPO, 'src/main-ask.js')), HA = require(path.join(REPO, 'src/helper-ask.js')), UX = require(path.join(REPO, 'src/server/unexpected-exit.js')), AG = require(path.join(REPO, 'src/ask-grant.js'));
    const RPT = CWD + '/out/report.md', PO = CWD + '/out/parent-only.md', FO = CWD + '/out/fork-own.md', EO = CWD + '/out/early.md';
    const BASE_S3H = { key: AF.keyOf('', RPT), host: '', path: RPT, name: 'report.md', kind: 'doc', firstAt: Date.parse(T(55)), lastAt: Date.parse(T(65)), by: 'agent', writes: 1, edits: 1, lastOp: 'edit', bytes: null, lastId: 'toolu_e65' }; // b48937610's row: write → ask → the agent's edit
    const PGQ = ['1', '2', '3', '4'].map(PID), PGA = PID('5'), PGG = PID('6'), PGO = PID('9'), PGH = PID('0'), PGT = PID('s'); // pages only a producer's record of a tool call names · one this tree's ask names · one an older tree's --grant ask names
    for (const id of [...PGQ, PGA, PGG, PGO, PGH, PGT]) PSTORE.pages.push({ id, name: 'their page ' + id.slice(-1), path: '/p/' + id, public: true, updatedAt: 11, sessionId: 'sB', conversationId: 'c-pb' });
    const URL0 = 'https://vs.example.com:3456/p/', att = (p) => [{ kind: 'file', host: '', path: p, name: path.basename(p) }], KP = 'claude:c-pr';
    let nI = 0;
    const rec = (sessionKey, o) => ({ id: 'ut-00000000' + (++nI).toString(16).padStart(2, '0'), sessionKey, detail: null, status: 'open', by: 'agent', i18n: null, action: null, createdAt: Date.parse(T(60 + nI)), ...o }); // the store's record shape
    const producers = ([qm, qh, qx]) => [ // the three producers' OWN filings under the conversation's key (main-asks.js:78, helper-asks.js:73, unexpected-exit.js:82), each naming a page
      qm && rec(KP, { ...MA.inboxItemFor(MA.mainAskOf({ requestId: 'rq-' + qm, toolName: 'WebFetch', input: { url: URL0 + qm, prompt: 'read it' } }, {}), { name: 'Reporter', sessionId: 'sP7' }), origin: 'agent', kind: 'action', urgency: 'high', sessionName: 'Reporter' }),
      qh && rec(KP, { ...HA.inboxItemFor({ requestId: 'rq-' + qh, toolName: 'Bash', input: { command: 'curl -s ' + URL0 + qh } }, { label: 'Fetcher', sessionId: 'sP7' }), origin: 'agent', kind: 'action', urgency: 'high', sessionName: 'Reporter' }),
      qx && rec(KP, { origin: 'agent', urgency: 'high', sessionName: 'Reporter', text: UX.TEXTS.failed.replace('{name}', 'Reporter').replace('{time}', '08:01'), detail: 'Exit record: it was showing /p/' + qx + '\nNothing was sent into it.', i18n: { text: { key: UX.TEXTS.failed, params: { name: 'Reporter', time: '08:01' } } } }),
    ].filter(Boolean);
    const OLD = [rec(KP, { text: 'Please review the report', origin: 'agent', status: 'done', artifacts: att(RPT) }), rec('claude:c-other', { text: 'another conversation\'s ask', origin: 'agent', artifacts: att(CWD + '/out/theirs.md') }),
      rec(KP, { text: 'May this conversation use the Work browser? It opens /p/' + PGG, origin: 'agent', ...AG.grantItemFields({ id: 'bp-1', label: 'Work' }) }), ...producers(PGQ.slice(0, 3)),
      (({ origin, ...r }) => r)(rec(KP, { text: 'Please review the page /p/' + PGO, sessionName: 'Reporter' })), // r8 (X2): an ask filed before the origin field (≤ 2.369.168) — no origin
      // r9 (Y3): the browser's .168 records under the same key — a lapsed takeover naming the page it left, a backend switch proposal (no origin, no i18n, no action)
      (({ origin, ...r }) => r)(rec(KP, { text: "Your takeover of the agent's browser (Reporter) lapsed after 2 min without input — the agent is driving again", detail: 'Page you left it on: ' + URL0 + PGH + '. Nothing was sent to the agent (browser.announceIdleHandback is off).', urgency: 'low', sessionName: 'Reporter' })),
      (({ origin, ...r }) => r)(rec(KP, { text: 'Browser backend: switch to CloakBrowser', detail: 'The agent proposes to switch to CloakBrowser. /p/' + PGH + ' stays open.', sessionName: 'Reporter' }))]; // an older tree's: answered, another conversation's, a --grant ask (the grant IS its action), the producers'
    const TKq = require(path.join(REPO, 'src/browser-takeover.js')), IRq = require(path.join(REPO, 'src/inbox-reply.js'));
    const NEW = [rec(KP, { text: 'And this page: /p/' + PGA, origin: 'agent', via: 'ask' }), ...producers([PGQ[3]]), ...[['claude:c-par', PO, 'Parent'], ['claude:c-fk', FO, 'Fork'], ['webui:sE', EO, 'Early']].map(([k, p, t]) => rec(k, { text: t + ': please check', origin: 'agent', via: 'ask', artifacts: att(p) })),
      rec(KP, { ...TKq.idleInboxItem({ label: 'Work', url: URL0 + PGT, sessionName: 'Reporter' }), by: 'agent', origin: 'browser', sessionName: 'Reporter' })]; // r10 (F1): this tree's lapsed takeover — the builder's words, browser-handback fileInbox's fields — naming the page it left open
    const ROW_OF = require(path.join(REPO, 'src/foryou-actions.js')).ROW_OF, producerOf = (type) => (ROW_OF[type] || {}).producer; // the store's own lookup
    const held = (rung, legacy = IO.legacyAsk) => { const items = OLD.map((i) => (rung && typeof legacy === 'function' && legacy(i, producerOf) ? { ...i, via: IO.ASK_VIA } : i)).concat(NEW); return { idsWhere: (p) => items.filter(p).map((i) => i.id), get: (id) => items.find((i) => i.id === id) || null }; }; // UserTodoManager's own read
    const B = held(true), BR = held(false), B7 = held(true, (i, p) => i.origin === 'agent' && typeof IO.legacyAsk === 'function' && IO.legacyAsk(i, p)), B8 = held(true, (i, p) => !!i && (i.origin === 'agent' || (i.origin == null && !['Spending', 'Channels'].includes(i.sessionName) && i.jobId == null)) && i.via == null && i.i18n == null && (i.action == null || p(i.action.type) === IO.ASK_FILER)); // … · r8's rung, its expression as it was (no browser census) // what this tree's load holds · a load without the rung · r7's rung (origin `agent` only)
    const fixture = { marked: OLD.map((i) => (B.get(i.id).via || '-')).join(), named: [...OLD.slice(3, 6), NEW[1]].every((i, k) => i.detail.includes(PGQ[k])) };
    ok(fixture.marked === 'ask,ask,ask,-,-,-,ask,-,-' && fixture.named, 'fixture: the store\'s load rung (IO.legacyAsk) marks the older tree\'s asks — answered, another conversation\'s, a --grant ask, one filed before the origin field — and none of the producers\' records (the browser\'s .168 ones too), each of which names its page', fixture);
    const metas = {}, writes = {}, META = { readSessionMeta: (k) => metas[k] || null, writeSessionMeta: (k, v) => { writes[k] = (writes[k] || 0) + 1; metas[k] = JSON.parse(JSON.stringify(v)); } };
    const recsP = [tool('Write', { file_path: RPT, content: 'r' }, 55).rec, tool('Edit', { file_path: RPT, old_string: 'r', new_string: 's' }, 65).rec];
    const keyFn = /^function sessionStatusKey\(session, id\) \{\n[^\n]*\n[^\n]*\n\}$/m.exec(srvSrc), statusKey = keyFn ? new Function(`return (${keyFn[0]});`)() : null;
    const ASKS = "(s, id) => require('./src/agent-routes/status.js').asksOf(userTodos, s, id, sessionStatusKey)";
    const wireAsk = (src) => { const line = src.split('\n').find((l) => l.startsWith("require('./src/server/artifact-registry.js').configure(")) || ''; const m = /[{,] asks: (\(s, id\) => require\('\.\/src\/agent-routes\/status\.js'\)\.asksOf\(userTodos, s, id, sessionStatusKey\))[,}]/.exec(line); return m ? m[1] : null; };
    const srvRequire = createRequire(path.join(REPO, 'server.js'));
    const asksVia = (src, store) => { const w = wireAsk(src); try { return w ? new Function('userTodos', 'sessionStatusKey', 'require', `return (${w});`)(store, statusKey, srvRequire) : () => []; } catch { return () => []; } };
    const BASE_PGH = { key: AF.keyOf('', '/p/' + PGH), host: '', path: '/p/' + PGH, name: PGH, kind: 'page', firstAt: Date.parse(T(51)), lastAt: Date.parse(T(51)), by: 'agent', writes: 0, edits: 0, lastOp: 'present', bytes: null, lastId: null, url: '/p/' + PGH, presented: true, page: PGH, origin: '' }; // the row an older tree kept for the page the takeover left open
    const BASE_PGO = { key: AF.keyOf('', '/p/' + PGO), host: '', path: '/p/' + PGO, name: PGO, kind: 'page', firstAt: Date.parse(T(50)), lastAt: Date.parse(T(50)), by: 'agent', writes: 0, edits: 0, lastOp: 'present', bytes: null, lastId: null, url: '/p/' + PGO, presented: true, page: PGO, origin: '' }; // the page row an older tree kept: no `shown`, no `ask:` id
    const rebuild = async (sid, asks, { cid = 'c-pr', more = {}, rows = { [BASE_S3H.key]: { ...BASE_S3H }, [BASE_PGO.key]: { ...BASE_PGO }, [BASE_PGH.key]: { ...BASE_PGH } }, recs = recsP, sink = true } = {}) => { // one conversation per variant; the meta read after ONE shared tick (below)
      const sP = { backend: 'claude', sockName: sid, claudeSessionId: cid, cwd: CWD, host: '', name: 'Reporter', _artifacts: rows, _normalizer: null, ...more };
      REG.configure({ ...regCfg([[sid, sP]]), sessionMeta: () => META, asks });
      if (!sink && typeof N.setArtifactPersistSink === 'function') N.setArtifactPersistSink(null); // r5's normalizers: no persist seam
      await N.rebuildHistory(sP, sid, recs);
      const v = REG.listFor(sid), all = v.items.concat(v.code), band = (pred) => (all.find(pred) || {}).intent || null;
      REG.configure({ ...regCfg(), asks: () => [] });
      return { sid, rows: sP._artifacts, derived: bandsOf(sP._normalizer && sP._normalizer.derivedArtifacts), pgt: band((b) => b.page === PGT), rpt: band((b) => b.path === RPT), theirs: all.some((b) => b.name === 'theirs.md'), pga: band((b) => b.page === PGA), pgg: band((b) => b.page === PGG), pgo: band((b) => b.page === PGO), pgh: band((b) => b.page === PGH), pgq: PGQ.filter((id) => Object.values(sP._artifacts).some((r) => r.page === id)).length, po: band((b) => b.path === PO), fo: band((b) => b.path === FO), eo: band((b) => b.path === EO) };
    };
    const persisted = (g) => { const m = ((metas[g.sid] || {}).artifacts || {})[BASE_S3H.key]; const { rows, ...rest } = g; return { ...rest, persisted: !!(m && m.shown), writes: writes[g.sid] || 0 }; };
    const W7 = asksVia(srvSrc, B), FORK = { _forkRequested: true, _forkSourceId: 'c-par' }, bare = { rows: {}, recs: [] };
    ok(wireAsk(srvSrc) === ASKS && !!statusKey && statusKey({ backend: 'claude', claudeSessionId: 'c-pr' }, 'sP') === 'claude:c-pr',
      'census: server.js configures the registry with `asks: ' + ASKS + '` — the ask route\'s own answer to «whose ask is this?» over the For-you store');
    // the controls: patched copies of the ask route's ONE answer — r6's reader (origin `agent`), the filter dropped, r6's key (no fork guard), no placeholder
    const stSrc = fsX.readFileSync(path.join(REPO, 'src/agent-routes/status.js'), 'utf8');
    const ISASK = 'store.idsWhere((i) => IO.isAsk(i) && keys.has(i.sessionKey))', FORKKEY = '  const key = liveForkPending(s) ? `webui:${id}` : sessionStatusKey(s, id);', PLACE = 'const keys = new Set([askKey(s, id, sessionStatusKey), `webui:${id}`]);';
    const stMut = (a, b, tag) => (stSrc.includes(a) ? M.load('src/agent-routes/status.js', stSrc.replace(a, b), tag) : null);
    const S6 = stMut(ISASK, "store.idsWhere((i) => i.origin === 'agent' && keys.has(i.sessionKey))", 'r6origin'), S0 = stMut(ISASK, 'store.idsWhere((i) => keys.has(i.sessionKey))', 'nofilter');
    const SK = stMut(FORKKEY, '  const key = sessionStatusKey(s, id);', 'r6key'), SP = stMut(PLACE, 'const keys = new Set([askKey(s, id, sessionStatusKey)]);', 'noplaceholder');
    ok(S6 && S0 && SK && SP, 'CONTROL needles present: asksOf\'s filter, askKey\'s fork guard, the placeholder key (r7) — a tree without them has nothing to patch');
    const viaCopy = (S, store = B) => (s, id) => (S && typeof S.asksOf === 'function' ? S.asksOf(store, s, id, statusKey) : []);
    const g7 = await rebuild('sP7', W7), g5 = await rebuild('sP5', asksVia(srvSrc.replace(' asks: ' + ASKS + ',', ''), B)), gS = await rebuild('sPS', W7, { sink: false });
    const again = await rebuild('sP7', W7, { rows: JSON.parse(JSON.stringify(g7.rows)) }); // r7 (T5 · M3): the same conversation rebuilt from what it holds (a restart's persisted rows)
    const fkP = await rebuild('sF', W7, { cid: 'c-par', more: FORK, ...bare }), fkL = await rebuild('sF', W7, { cid: 'c-fk', more: FORK, ...bare }), gE = await rebuild('sE', W7, { cid: 'c-e', ...bare }), gN = await rebuild('sN', W7, { cid: 'c-none' });
    // r10 (F1): the person answers «ok» from the tray — to the browser's lapsed takeover, and to the conversation's own ask
    const TKI = NEW[NEW.length - 1], answer = (it, s) => ({ type: 'user', _fromWebui: true, msgId: 'm-' + it.id, uuid: 'uq' + s, timestamp: T(s), cwd: CWD, sessionId: 'c-pr', message: { role: 'user', content: [{ type: 'text', text: IRq.composeReply(it, 'ok', { now: Date.parse(T(s)) }) }] } });
    const TREC = answer(TKI, 90), AREC = answer(NEW[0], 91), gQ = await rebuild('sPQ', W7, { rows: {}, recs: [TREC, AREC] });
    const c6 = await rebuild('sC6', viaCopy(S6)), c0 = await rebuild('sC0', viaCopy(S0)), cK = await rebuild('sF', viaCopy(SK), { cid: 'c-par', more: FORK, ...bare }), cP = await rebuild('sE', viaCopy(SP), { cid: 'c-e', ...bare }), cR = await rebuild('sCR', viaCopy(STR, BR)), c7 = await rebuild('sC7', viaCopy(STR, B7)), c8 = await rebuild('sC8', viaCopy(STR, B8));
    // the persist seam asked at a rebuild that gains nothing: this tree's normalizers vs a copy that persists at every rebuild (a spy for persistSoon)
    const nsrc = fsX.readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8'), GAIN = 'if (artifactPersistSink && AF.stampsGained(was, session._artifacts)) artifactPersistSink(session);';
    const NM = nsrc.includes(GAIN) ? M.load('src/normalizers.js', nsrc.replace(GAIN, 'if (artifactPersistSink) artifactPersistSink(session);'), 'persistall') : null;
    const spyOn = async (Nmod) => { let n = 0; const sR = { backend: 'claude', sockName: 'sR', claudeSessionId: 'c-pr', cwd: CWD, host: '', name: 'Reporter', _artifacts: JSON.parse(JSON.stringify(g7.rows)), _normalizer: null }; Nmod.setArtifactPersistSink(() => n++); await Nmod.rebuildHistory(sR, 'sR', recsP); return n; };
    const spy = { tree: await spyOn(N), everyRebuild: NM ? await spyOn(NM) : null };
    REG.configure({ ...regCfg(), asks: () => [] }); // the registry's own sink back on the real normalizers
    await new Promise((r) => setTimeout(r, 1)); // persistSoon(…, 0) is an earlier timer of the same 1 ms list
    const [p7, p5, pS, pN] = [g7, g5, gS, gN].map(persisted);
    ok(p7.rpt === 'foryou' && p7.pgg === 'foryou' && p7.pga === 'foryou' && !p7.theirs && p7.persisted, 'r6 (U2 + U3) through server.js\'s own wiring: the older tree\'s row of a file its ask attached (answered since) that the agent then edited + the transcript intact ⇒ «for you» after the rebuild (its --grant ask\'s page too, this tree\'s ask\'s page too); another conversation\'s ask adds nothing; the stamp is in the session meta at the next tick — no op needed', p7);
    ok(p7.pgq === 0, 'r7 (T1) a parked WebFetch permission, a helper\'s Bash approval, an unexpected exit — an older tree\'s and this tree\'s, each naming a /p/ page, filed under the conversation\'s key with origin `agent` ⇒ no row (the witness is what the agent ASKED the person to look at, never a producer\'s record of a tool call)', p7);
    ok(c6 && c6.pgq === 4 && c6.rpt === 'foryou', 'CONTROL r6\'s reader (origin `agent`) ⇒ the four pages only the producers\' records name are rows, stamped «for you» — RED', c6);
    ok(c0 && c0.pgq === 4 && !c0.theirs, 'CONTROL the reader with no filter but the key ⇒ the same four phantom rows — RED', c0);
    ok(p7.pgo === 'foryou', 'r8 (X2) an ask filed before the origin field (≤ 2.369.168: no origin — the tray reads it as the agent\'s) still in the store, naming a page whose row an older tree kept (no `shown`, no `ask:` id) ⇒ «for you» at the rebuild', p7);
    ok(p7.pgh === 'made', 'r9 (Y3) the browser\'s .168 records under the same key (a lapsed takeover naming the page it left open, a backend switch proposal naming it too) ⇒ no ask: the page an older tree kept reads «made» — a producer\'s record is never a witness', p7);
    ok(c8.pgh === 'foryou' && c8.pgo === 'foryou', 'CONTROL r8\'s rung (every origin-less item the tray files under Agents) ⇒ the takeover\'s page a phantom «for you» — RED', c8);
    ok(c7.pgo === 'made' && c7.rpt === 'foryou', 'CONTROL r7\'s rung (origin `agent` only) ⇒ that page «made» while its ask is in the store — RED', c7);
    // r10 (F1): A QUOTE CARRIES THE ORIGIN OF WHAT IT QUOTES — the tray answers a PRODUCER's item too (replyVerdict ok for
    // origin 'browser'); its quote is nobody's showing: no row live or at the rebuild, nothing persisted. The same «ok» to the
    // conversation's own ask (via 'ask') keeps its page «for you» from the quote (the live door folds no ask's words)
    let nQL = 0;
    const liveQ = (asks, recs = [TREC, AREC]) => { const s = { backend: 'claude', sockName: 'sQL' + (++nQL), claudeSessionId: 'c-pr', cwd: CWD, host: '', name: 'Reporter', _artifacts: {}, _normalizer: null }; REG.configure({ ...regCfg([[s.sockName, s]]), asks }); for (const r of recs) REG.observe(s, r); const v = REG.listFor(s.sockName); REG.configure({ ...regCfg(), asks: () => [] }); return Object.fromEntries(v.items.filter((b) => b.presented).map((b) => [b.page, b.intent])); };
    const qShape = { item: TKI.origin + ' · ' + TKI.text.slice(0, 22) + '… · ' + TKI.detail.slice(0, 22) + '…', quoted: IRq.composeReply(TKI, 'ok').includes('/p/' + PGT), verdict: IRq.replyVerdict({ item: TKI, session: { live: true, mode: 'chat' } }).ok, ask: IO.isAsk(TKI) };
    const qLive = liveQ(W7), qMeta = Object.values((metas.sPQ || {}).artifacts || {});
    ok(qShape.quoted && qShape.verdict === true && qShape.ask === false, 'fixture: the browser\'s lapsed takeover (origin `browser`, its own builder\'s words) names the page it left open, the tray lets the person answer it, and it is no ask', qShape);
    ok(!(PGT in qLive) && gQ.pgt === null && !(PGT in gQ.derived) && !qMeta.some((r) => r.page === PGT), 'r10 (F1) the person answers «ok» from the tray to the browser\'s lapsed takeover ⇒ the page its quote names is NO row — live (observe), at the rebuild (the transcript\'s derivation and the merge), nothing persisted: a producer\'s quoted words are nobody\'s showing', { live: qLive, rebuilt: gQ.pgt, derived: gQ.derived, persisted: qMeta.map((r) => r.page) });
    ok(qLive[PGA] === 'foryou' && gQ.derived[PGA] === 'foryou' && gQ.pga === 'foryou' && liveQ(() => [], [AREC])[PGA] === undefined, 'r10 (F1) the same «ok» to the conversation\'s OWN ask (the route\'s, via `ask`) ⇒ its page «for you» from the quote — live and in the derivation; the ask unknown to this conversation (asksOf: none) ⇒ no row from the quote', { live: qLive, derived: gQ.derived });
    { // CONTROL r9's reader: the same ops, the quoted item unnamed (its said() pushed presentOps([uncut(rp)]) as they are)
      const isA = (id) => STR.asksOf(B, { backend: 'claude', claudeSessionId: 'c-pr' }, 'sPQ', statusKey).some((i) => i.id === id), r9ops = HOOK.claude(TREC).map(({ quote, ...o }) => o);
      const r9b = bandsOf(AF.resolvePresented(AF.quotedOps(r9ops, isA).reduce((rows, o) => AF.apply(rows, { cwd: CWD, at: 1, ...o, by: AF.opAuthor(o) }).rows, {}), { pageOf: (id) => ({ page: { id, name: id, path: '/p/' + id } }) }));
      ok(HOOK.claude(TREC).some((o) => o.page === PGT && o.quote === TKI.id) && r9b[PGT] === 'foryou', 'CONTROL r9\'s reader (the quote\'s ops name no item: every quoted link the agent\'s) ⇒ the takeover\'s page a phantom «for you» — RED', r9b);
    }
    ok(cR.rpt === 'made' && cR.pgg === null, 'CONTROL a load without the rung (an older tree\'s asks unmarked) ⇒ its ask is no witness: «made», its --grant page no row — RED', cR);
    const keyOf = typeof STR.askKey === 'function' ? STR.askKey : () => null, route = { pending: keyOf({ backend: 'claude', claudeSessionId: 'c-par', ...FORK }, 'sF', statusKey), landed: keyOf({ backend: 'claude', claudeSessionId: 'c-fk', ...FORK }, 'sF', statusKey) };
    ok(JSON.stringify(route) === JSON.stringify({ pending: 'webui:sF', landed: 'claude:c-fk' }) && fkP.po === null && fkP.fo === null && fkL.fo === 'foryou' && fkL.po === null,
      'r7 (T2) a pending fork (its claudeSessionId still the parent\'s) ⇒ the parent\'s ask rows are absent at its rebuild — the route\'s ONE key rule (askKey: the placeholder `webui:<id>` while pending, the route files and lists under it too); after the fork lands ⇒ its own asks only', { route, pending: fkP.po, landed: [fkL.fo, fkL.po] });
    ok(cK && cK.po === 'foryou', 'CONTROL r6\'s key (the status key, no fork guard) ⇒ the pending fork folds the PARENT\'s ask «for you» — RED', cK);
    ok(gE.eo === 'foryou', 'r7 (T5 · M2) an early ask filed under the placeholder `webui:<id>` (before the conversation had its id; the route re-keys it at the next ask) ⇒ «for you» at the rebuild', gE);
    ok(cP && cP.eo === null, 'CONTROL the reader without the placeholder key ⇒ the early ask is no witness — RED', cP);
    ok(p5.rpt === 'made' && !p5.persisted, 'CONTROL the ask store unwired (r5: the `ask:` id read on page rows only) ⇒ «made», nothing persisted — RED', p5);
    ok(pS.rpt === 'foryou' && !pS.persisted, 'CONTROL r5\'s rebuild (no persist at the rebuild) ⇒ «for you» in memory, the meta still without the stamp at the next tick — a restart before the next op loses it — RED', pS);
    ok(again.rpt === 'foryou' && p7.writes === 1 && pN.writes === 0 && spy.tree === 0, 'r7 (T5 · M3) a rebuild that gains no stamp writes nothing — the same conversation rebuilt from what it holds (a restart\'s persisted rows): still «for you», ONE write in all (the first rebuild\'s); a conversation with no ask: none; the persist seam (persistSoon) never asked', { again: again.rpt, writes, spy });
    ok(spy.everyRebuild === 1, 'CONTROL a persist at every rebuild (the stampsGained clause dropped) ⇒ the restart\'s rebuild asks for a write — RED', spy);
  }
  // controls
  const asrc = (await import('node:fs')).readFileSync(path.join(REPO, 'src/artifacts.js'), 'utf8');
  const cw = " && !row.presented); // lane pages-chip-groups";
  const MW = asrc.includes(cw) ? M.load('src/artifacts.js', asrc.replace(cw, '); // control'), 'cardpresented') : null;
  ok(MW && MW.cardWorthy(MW.fold({}, MW.presentOp({ id: OTHER.id }))[keyO]), 'CONTROL: without the presented guard a shown link draws a second chat card (the card assert sees it)');
  const ownDrop = '    if (page && own(page)) continue;\n';
  const MO = asrc.includes(ownDrop) ? M.load('src/artifacts.js', asrc.replace(ownDrop, '\n'), 'owndrop') : null;
  ok(MO && MO.resolvePresented(MO.fold({}, MO.presentOp({ id: MINE.id })), { pageOf: () => ({ page: MINE }), own: () => true })[AF.keyOf('', '/p/' + MINE.id)], 'CONTROL: without the own drop this conversation\'s page shows twice (own + shown here — the own assert sees it)');
  const capLine = 'evictOver(next, key).concat(row.presented ? evictPresented(next, key) : [])';
  const MP = asrc.includes(capLine) ? M.load('src/artifacts.js', asrc.replace(capLine, 'evictOver(next, key)'), 'nocap') : null;
  let capRows = {};
  if (MP) for (let i = 0; i < 55; i++) capRows = MP.fold(capRows, { ...MP.presentOp({ id: `pg${String(i).padStart(10, '0')}` }), at: i + 1 });
  ok(MP && Object.keys(capRows).length === 55, 'CONTROL: without the cap 55 links keep 55 rows (the cap assert sees it)');
}

console.log('ASK ATTACHMENTS (lane foryou-attachments) — vibespace-ask --artifact → a `present` op through THE ONE reducer');
{
  const f = AF.askOp({ kind: 'file', host: '', path: '/tmp/x/repo/report.md', name: 'report.md' }, { at: 9, id: 'ask:ut-1:0' });
  let rows = AF.fold({}, f);
  const r = rows[':/tmp/x/repo/report.md'];
  ok(f.op === 'present' && r && r.lastOp === 'present' && !r.presented && r.kind === 'doc' && r.writes === 0 && r.edits === 0 && r.name === 'report.md', 'a file an ask attaches is a NAMED row (a `present` op: never counted, never a presented page)', r);
  rows = AF.fold(rows, AF.askOp({ kind: 'page', page: 'pgabcdefghij', name: 'Plan' }, { at: 10 }));
  ok(rows[':/p/pgabcdefghij'] && rows[':/p/pgabcdefghij'].presented === true && rows[':/p/pgabcdefghij'].page === 'pgabcdefghij', 'a page an ask attaches is a PRESENTED row (resolved against the pages store at every read)');
  const d = AF.fold({}, AF.askOp({ kind: 'design', host: 'h1', path: '/srv/d', name: 'd' }, { at: 3 }));
  ok(d['h1:/srv/d'] && d['h1:/srv/d'].kind === 'design', 'a design keeps its kind on its host');
  ok(AF.apply(rows, f).skipped === 'seen', 'the same ask re-filed folds nothing twice (its op id)');
  const own = AF.fold({ ':/tmp/x/repo/report.md': { ...r, lastOp: 'write', writes: 2 } }, { ...f, id: 'ask:ut-2:0' })[':/tmp/x/repo/report.md'];
  ok(own.writes === 2 && !own.presented, 'a file the conversation wrote keeps its counts when an ask attaches it');
  ok(AF.askOp({ kind: 'exe', path: '/x' }) === null && AF.askOp({ kind: 'file' }) === null, 'a malformed attachment is no op');
  const rs = require('node:fs').readFileSync(path.join(REPO, 'src/agent-routes/status.js'), 'utf8');
  ok(/require\('\.\.\/server\/artifact-registry\.js'\)\.presentAsk\(s, item\.artifacts, \{ id: item\.id, said: \[item\.text, item\.detail\] \}\)/.test(rs) && !/_artifacts/.test(rs), 'THE ONE WRITER: the ask route hands its attachments AND its words to the registry (presentAsk → noteOp), never the rows itself');
}

console.log('ANTIGRAVITY (lane agy-status-bar-facts) — agy\'s own write / edit calls are rows (the owner\'s shapes, names replaced)');
{
  // the owner's conversation wrote .md reports and a SKILL.md and showed no chip: agy's journal tool records carry agy's
  // parameters (no `diff`), so the ACP reader saw nothing. The fixture = the wrapper's journal of the owner's two
  // conversations reduced to the tool records, paths in their measured SHAPES (absolute; a skill under the cwd's
  // .agents/skills/<skill>/; a CJK report at the cwd root; agy's brain/<conversation>/ report + scratch scripts).
  const fsx = (await import('node:fs')).default;
  const HOME = '/home/u', ACWD = '/home/u/proj';
  const J = fsx.readFileSync(path.join(REPO, 'scripts/fixtures/agy-status-bar/journal.jsonl'), 'utf8').split('\n').filter(Boolean)
    .map((l) => JSON.parse(l.replaceAll('/CWD', ACWD).replaceAll('/HOME', HOME)));
  const ag = harnessOf('antigravity');
  const viaDoor = J.map((r) => JSON.stringify(ag.artifactsOf(r))).join() === J.map((r) => JSON.stringify(AO.antigravity(r))).join(); // directly, or a door that delegates to it
  ok((ag.artifactsOf === AO.antigravity || viaDoor) && JSON.stringify(ag.artifactTools) === '["write_to_file","replace_file_content","multi_replace_file_content"]',
    'the antigravity descriptor reads the journal with agy\'s own reader; the tools it names to the agent are agy\'s model-facing ones (init.tools)');
  let ar = {};
  const seen = [];
  for (const r of J) for (const o of ag.artifactsOf(r)) { seen.push(`${r.update.title}:${o.op}`); ar = AF.fold(ar, { ...o, cwd: ACWD, at: 1 }); }
  const B = `${HOME}/.gemini/antigravity-cli/brain/c0ffee00-0000-4000-8000-00000000a9c1`;
  const row = (p) => ar[':' + p];
  ok(seen.length === 8 && !seen.some((x) => /^(read_file|run_command|invoke_subagent)/.test(x)), 'write_file / edit_file calls → ops; read_file / run_command / invoke_subagent / every tool_call_update → nothing', seen);
  ok(Object.keys(ar).length === 6 && row(ACWD + '/评审报告.md')?.kind === 'doc' && row(B + '/review_notes.md')?.kind === 'doc' && row(ACWD + '/.agents/skills/doc-review/references/rubric.md')?.kind === 'doc',
    'six rows: the CJK report at the cwd root, agy\'s BRAIN report (its own artifacts dir — not agent config) and the skill\'s reference are DOCUMENTS (cards)', Object.values(ar).map((r) => [r.name, r.kind]));
  ok(row(ACWD + '/.agents/skills/doc-review/SKILL.md')?.kind === 'code' && row(ACWD + '/.agents/skills/doc-review/scripts/score.py')?.writes === 1 && row(ACWD + '/.agents/skills/doc-review/scripts/score.py')?.edits === 1 && row(B + '/scratch/parse_inputs.py')?.edits === 1,
    'SKILL.md is agent config (code, as claude\'s); a written-then-edited script = ONE row (1 write + 1 edit)');
  const tcRec = (title, rawInput) => ({ type: 'acp', kind: 'update', update: { sessionUpdate: 'tool_call', toolCallId: 'k:1', title, rawInput } });
  ok(AO.antigravity(tcRec('write_to_file', { TargetFile: 'file:///home/u/proj/%E6%8A%A5%E5%91%8A/a%20b.md' }))[0]?.path === '/home/u/proj/报告/a b.md' && AO.antigravity(tcRec('replace_file_content', { Path: 'notes/x.md' }))[0]?.op === 'edit'
    && AF.apply({}, { ...AO.antigravity(tcRec('write_file', { Path: 'notes/x.md' }))[0], cwd: ACWD, at: 1, by: 'agent' }).row.path === ACWD + '/notes/x.md',
    'the model-facing names too; a file: URI is percent-decoded to its path; a relative path is the conversation cwd\'s');
  ok(AO.antigravity(tcRec('write_file', { Path: 'file://other-host/x.md' })).length === 0 && AO.antigravity(tcRec('write_file', {})).length === 0 && AO.antigravity(tcRec('write_file', null)).length === 0 && AO.antigravity(tcRec('write_file', { Path: '  ' })).length === 0,
    'no path, a blank path, a file: URI of ANOTHER host ⇒ nothing (never a guessed path)');
  ok(AO.antigravity({ kind: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'see /p/pgagy0000001' } } }).some((o) => o.page === 'pgagy0000001'), 'a text chunk still goes through the ACP reader (a page link shown here)');
  ok(AO.antigravity({ kind: 'update', update: { sessionUpdate: 'tool_call', toolCallId: 'd:1', title: 'write_to_file', content: [{ type: 'diff', path: '/home/u/proj/d.md', oldText: null, newText: 'x' }] } })[0]?.path === '/home/u/proj/d.md', 'a call carrying an ACP diff (a record built from agy\'s own transcript) still reads as ACP\'s');
  // the LIVE door: the wrapper's records through the ONE writer, the call seen twice moves its row once
  const live = { backend: 'antigravity', cwd: ACWD, host: '', sockName: null };
  REG.configure({ activeSessions: () => new Map([['sa', live]]), log: { log() {}, warn() {} } });
  for (const r of J) REG.observe(live, r);
  REG.observe(live, J.filter((r) => r.update.title === 'write_file').pop()); // the same call fed again (the parse + a replay)
  ok(Object.keys(live._artifacts || {}).length === 6 && Object.values(live._artifacts).every((r) => r.by === 'agent') && live._artifacts[':' + B + '/review_notes.md'].writes === 1,
    'the live registry (observe — what acp-events hands it): the same six rows, and a record seen twice moves its row once', Object.keys(live._artifacts || {}));
  const base = AO.acp; let none = 0; for (const r of J) none += base(r).length;
  ok(none === 0, 'CONTROL (the base): the ACP reader produces NOTHING from these records — why the owner saw no chip');
}

console.log('⑫ an ACP / agy rebuild reads its records\' own `ts` — an old card sits at its time, not at the bottom (lane agy-harness-fixes)');
{
  // the wrappers stamp `ts` (ISO; agy-wrapper / acp-wrapper record()), never `timestamp` — before, recordAt read only
  // `timestamp` ⇒ every ACP/agy slab was clockless ⇒ cardPlacement 'tail' for every rebuilt card (the owner's pile)
  const ACWD = '/home/u/agyproj', TA = Date.UTC(2026, 9, 20, 9, 0, 0);
  const at = (m) => new Date(TA + m * MIN).toISOString();
  const userA = (text, m) => ({ ts: at(m), type: 'acp', kind: 'user', msgId: 'u' + m, content: [{ type: 'text', text }], peer: null });
  const sayA = (text, m) => ({ ts: at(m), type: 'acp', kind: 'update', sessionId: 'conv-demo-1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } });
  const RECS = [userA('agy slab starts', 0), sayA('agy before the doc', 8), userA('agy after the doc', 12), sayA('agy later still', 20)];
  const oldKey = ':' + ACWD + '/old-report.md', midKey = ':' + ACWD + '/mid-report.md';
  const rows12 = { ...AF.fold({}, { path: ACWD + '/old-report.md', op: 'write', at: TA - 3 * 3600000, id: 'a-old' }), ...AF.fold({}, { path: ACWD + '/mid-report.md', op: 'write', at: TA + 10 * MIN, id: 'a-mid' }) };
  STORE.pages = []; STORE.designs = [];
  N.setArtifactStoreSource(REG.storeRowsOf); N.setArtifactServiceSource(() => ({}));
  const s12 = { backend: 'antigravity', cwd: ACWD, host: '', _artifacts: { ...rows12 }, _normalizer: null };
  await N.rebuildHistory(s12, 's12', RECS);
  const l12 = s12._normalizer.messages, k12 = l12.map((m) => (m.noticeKind === 'artifact' ? keyOfCard(m) : textOf(m)));
  ok(s12._normalizer.artifactSlab.slabFirstAt === TA && s12._normalizer.artifactSlab.slabLastAt === TA + 20 * MIN, 'an agy slab is STAMPED by its records\' `ts` (first / last instant non-zero)', s12._normalizer.artifactSlab);
  const iMid12 = k12.indexOf(midKey);
  ok(iMid12 > 0 && k12[iMid12 - 1] === 'agy before the doc' && k12[iMid12 + 1] === 'agy after the doc' && k12[k12.length - 1] === 'agy later still' && !k12.includes(oldKey),
    'the doc written 10 min into the slab: its card at ITS time (between the two messages), the doc older than the slab: no card (the chip is its home), nothing after the last message', k12);
  ok(['at', 'none'].every((w, i) => AF.cardPlacement([rows12[midKey], rows12[oldKey]][i], s12._normalizer.artifactSlab) === w), 'cardPlacement over the agy slab: the mid doc ⇒ at, the old doc ⇒ none (never tail)');
  // a ms-number `ts` reads the same; a claude record carrying BOTH reads its `timestamp` (claude / codex unchanged)
  const s12n = { backend: 'antigravity', cwd: ACWD, host: '', _artifacts: {}, _normalizer: null };
  await N.rebuildHistory(s12n, 's12n', RECS.map((r) => ({ ...r, ts: Date.parse(r.ts) })));
  const s12c = { backend: 'claude', cwd: CWD, host: '', _artifacts: {}, _normalizer: null };
  await N.rebuildHistory(s12c, 's12c', [{ ...userAt('both stamps', 0), ts: TA }, { ...sayAt('both stamps 2', 20), ts: 'not a time' }]);
  ok(s12n._normalizer.artifactSlab.slabFirstAt === TA && s12c._normalizer.artifactSlab.slabFirstAt === T0 && s12c._normalizer.artifactSlab.slabLastAt === T0 + 20 * MIN,
    'a ms-number `ts` stamps the slab the same; a record with a `timestamp` is read by it (claude / codex placement unchanged)', [s12n._normalizer.artifactSlab, s12c._normalizer.artifactSlab]);
  // CONTROL: the old timestamp-only recordAt ⇒ the agy slab is clockless ⇒ BOTH old cards pile after the last message
  const nsrc12 = (await import('node:fs')).readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8');
  const readTs = "  const v = typeof raw.timestamp === 'string' ? raw.timestamp : raw.ts;\n";
  ok(nsrc12.includes(readTs), 'control anchor: recordAt falls back to the record\'s `ts`');
  const MB = M.load('src/normalizers.js', nsrc12.replace(readTs, "  const v = raw.timestamp;\n"), 'tsblind');
  MB.setArtifactStoreSource(REG.storeRowsOf); MB.setArtifactServiceSource(() => ({}));
  const s12b = { backend: 'antigravity', cwd: ACWD, host: '', _artifacts: { ...rows12 }, _normalizer: null };
  await MB.rebuildHistory(s12b, 's12', RECS);
  const k12b = s12b._normalizer.messages.map((m) => (m.noticeKind === 'artifact' ? keyOfCard(m) : textOf(m)));
  const last12b = k12b.indexOf('agy later still');
  ok(s12b._normalizer.artifactSlab.slabFirstAt === 0 && [oldKey, midKey].every((k) => k12b.indexOf(k) > last12b), 'CONTROL: reading only `timestamp` — the agy slab is clockless and BOTH cards pile after the last message (the owner\'s bug; the ⑫ asserts see it)', k12b);
  N.setArtifactServiceSource(REG.servicesOf);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
