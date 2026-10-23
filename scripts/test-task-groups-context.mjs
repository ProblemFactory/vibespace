#!/usr/bin/env node
// THE CONTEXT TABLE (lane task-group-context, POC v2.2 + the owner's fourth level, 2026-10-23) — in-process, no server.
// A Task Group's `ctx` rows replace folders[] + contextDir: the PURE rules (src/task-context.js), the store's derivations
// (the 自动发现会话 rows = the old folders[], the 记笔记 row = the old contextDir), the FOUR levels of 告诉 agent, the
// budget's step-down and its words, 引用 ro / rw, the 10 KiB law (tools / rules first, then the table, within the room),
// the diff path over rows, the one migration over owner-shaped fixtures (+ a RED control), the window's preview read.
// Run: node scripts/test-task-groups-context.mjs   (int346: renamed — lane open-task-binds's test-task-groups.mjs is the membership suite)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const TC = require('../src/task-context.js');
const { TaskGroupManager } = require('../src/task-groups.js');

let failed = 0, passed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++;
  console.error(`  ✗ ${name}${extra !== undefined ? `\n    ${typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 1500)}` : ''}`);
};
const B = (s) => Buffer.byteLength(String(s), 'utf-8');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tgc-'));
const home = path.join(root, 'home');
const mk = (rel, body) => { const p = path.join(home, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); if (body !== undefined) fs.writeFileSync(p, body); return p; };
const mkdir = (rel) => { const p = path.join(home, rel); fs.mkdirSync(p, { recursive: true }); return p; };
let n = 0;
const fresh = (extra = {}) => { const d = path.join(root, 'data-' + (++n)); fs.mkdirSync(d, { recursive: true }); return { dir: d, m: new TaskGroupManager({ dataDir: d, homeDir: home, ...extra }) }; };

// ── a small world: an IR desk with key files, a shared-notes subfolder, a handbook, a big folder ──
const IR = mkdir('work/ir');
mk('work/ir/CLAUDE.md', '# IR desk\nAlways cite the figures table.\n');
mk('work/ir/README.md', 'IR readme.\n');
mk('work/ir/draft.txt', 'a draft');
mk('work/ir/deep/x.md', 'deep');
mk('work/ir/共享资料/handbook.md', '# Handbook\nContacts: CFO.\n');
mk('work/ir/共享资料/进度.md', 'progress');
mk('work/ir/路演问答.md', 'Q&A for the roadshow.\n');
const BIG = mkdir('work/big');
for (let i = 0; i < 450; i++) mk(`work/big/f${String(i).padStart(3, '0')}.txt`, 'x');
const MEMO = mkdir('work/memo');
mk('work/memo/README.md', 'Memo desk.\n');
mk('work/memo/long.txt', 'L'.repeat(3000) + '\n');
const OTHER = mkdir('work/contracts');
mk('work/contracts/a.md', 'contract a');

console.log('— PURE: a row and the table —');
{
  const r = TC.sanitizeRow({ path: ' ~/work/ir/ ', note: 'line one\nline two', tell: 'bogus', tags: ['notes', 'readonly', 'discover', 'nope', 'notes'], share: 'rw', keys: ['CLAUDE.md', 'a/b', 'README.md'] });
  ok('a row keeps its typed path (trailing slash dropped), one-line note, an unknown tell = the kind\'s default (null)', r.path === '~/work/ir' && r.note === 'line one line two' && r.tell === null, r);
  ok('记笔记 and 不许改 exclude each other (the writable one wins); unknown / repeated tags dropped', JSON.stringify(r.tags) === JSON.stringify(['notes', 'discover']), r.tags);
  ok('a key-file chip list keeps file NAMES only (a path is refused)', JSON.stringify(r.keys) === JSON.stringify(['CLAUDE.md', 'README.md']), r.keys);
  const ro = TC.sanitizeRow({ path: '/x', tags: ['readonly'], share: 'rw' });
  ok('a 不许改 row can only be shared read-only (rw → ro)', ro.share === 'ro');
  ok('the default key set is not stored', TC.sanitizeRow({ path: '/x', keys: TC.KEY_FILES.slice() }).keys === undefined);
  ok('a reference row needs a group id and never references its own group', !!TC.sanitizeRow({ ref: 'T-1-x' }) && TC.sanitizeRow({ ref: 'T-1-x' }, { selfId: 'T-1-x' }) === null && TC.sanitizeRow({ ref: 'nope' }) === null);
  const rows = TC.sanitizeRows([{ path: '/a', tags: ['notes'] }, { path: '/b', tags: ['notes'] }, { path: '/a', note: 'dup' }, { ref: 'T-2-y' }, { ref: 'T-2-y' }]);
  ok('ONE notes row (the first keeps it), no duplicate path or reference', rows.length === 3 && rows[0].tags.includes('notes') && !rows[1].tags.includes('notes'), rows);
  ok('the four levels, in order', JSON.stringify(TC.TELL) === JSON.stringify(['note', 'names', 'index', 'contents']));
  ok('the default key files', JSON.stringify(TC.KEY_FILES) === JSON.stringify(['CLAUDE.md', 'README.md', 'HANDOFF.md', 'handbook.md', 'TASK.md']));
}

console.log('— PURE: resolution (the row above\'s folder → the group\'s first folder → home) —');
{
  const fsKind = (a) => { try { const st = fs.statSync(a); return st.isDirectory() ? 'dir' : 'file'; } catch { return 'missing'; } };
  const rows = [{ path: '~/work/ir' }, { path: '共享资料' }, { path: 'handbook.md' }, { path: '/nope/abs' }, { path: '路演问答.md' }, { path: 'work/contracts' }, { path: 'zz-none' }, { path: 'mac::/Users/u/x' }, { ref: 'T-1-x' }];
  const res = TC.resolveRows(rows, { home, kindOf: fsKind });
  ok('a ~ path resolves under home', res[0].abs === IR && res[0].kind === 'dir' && res[0].via === 'home', res[0]);
  ok('a relative row resolves against the row above\'s folder', res[1].abs === path.join(IR, '共享资料') && res[1].via === 'prev', res[1]);
  ok('…and a row below a FOLDER row resolves inside it', res[2].abs === path.join(IR, '共享资料', 'handbook.md') && res[2].kind === 'file', res[2]);
  ok('an absolute path that is not there stays its path (kind missing)', res[3].abs === '/nope/abs' && res[3].kind === 'missing', res[3]);
  ok('the row above is a missing path ⇒ the group\'s first folder (the row above\'s folder does not have it)', res[4].abs === path.join(IR, '路演问答.md') && res[4].via === 'first', res[4]);
  ok('…then home', res[5].abs === OTHER && res[5].via === 'homerel', res[5]);
  ok('nowhere ⇒ unresolved, what was tried said', res[6].abs === null && res[6].kind === 'missing' && JSON.stringify(res[6].tried) === JSON.stringify(['prev', 'first', 'homerel']), res[6]);
  ok('host::/path is another machine\'s folder, never a local one', res[7].kind === 'remote' && res[7].host === 'mac', res[7]);
  ok('a reference row resolves to { ref }', res[8].ref === true);
  const blk = TC.resolveRows([{ path: '/dead/mount/x' }], { home, kindOf: () => 'blocked' });
  ok('a blocked storage is said as blocked (the caller\'s door)', blk[0].kind === 'blocked');
}

console.log('— PURE: the derived old fields —');
{
  const rows = [{ path: '/a', tags: ['discover'] }, { path: '/f.md', tags: ['discover'] }, { path: '/n', tags: ['notes'] }, { path: 'rel', tags: ['discover'] }];
  const res = [{ abs: '/a', kind: 'dir' }, { abs: '/f.md', kind: 'file' }, { abs: '/n', kind: 'missing' }, { abs: null, kind: 'missing' }];
  ok('folders[] = the 自动发现会话 rows (recursive; a file never; an unresolved relative never)', JSON.stringify(TC.discoverFolders(rows, res)) === JSON.stringify([{ path: '/a', recursive: true }]), TC.discoverFolders(rows, res));
  ok('contextDir = the 记笔记 row (a rooted folder counts even while it is not there — the old behaviour)', TC.notesDir(rows, res) === '/n');
  ok('a folder defaults to 文件名 + 关键文件内容, a file to 内容; 关键文件 on a file reads as 内容', TC.chosenTell({}, 'dir') === 'index' && TC.chosenTell({}, 'file') === 'contents' && TC.chosenTell({ tell: 'index' }, 'file') === 'contents' && TC.chosenTell({ tell: 'names' }, 'dir') === 'names');
  ok('step down: 内容 → 文件名 + 关键文件内容 → 文件名 → 只说明 (a file skips the key-file level)', TC.stepDown('contents', 'dir') === 'index' && TC.stepDown('index', 'dir') === 'names' && TC.stepDown('names', 'dir') === 'note' && TC.stepDown('contents', 'file') === 'names');
  const plan = TC.planRows([
    { kind: 'dir', chosen: 'index', cost: { note: 50, names: 300, index: 900 } },
    { kind: 'file', chosen: 'contents', cost: { note: 40, names: 60, contents: 5000 } },
    { kind: 'dir', chosen: 'names', cost: { note: 30, names: 9400 } },
  ], 1000);
  ok('planRows: a row that fits keeps its level', plan[0].level === 'index' && plan[0].from === null, plan[0]);
  ok('planRows: a row that does not fit steps down until it fits, and says from what', plan[1].level === 'names' && plan[1].from === 'contents' && plan[1].need === 5000 && plan[1].left === 100, plan[1]);
  ok('planRows: …down to 只说明, which is always told', plan[2].level === 'note' && plan[2].from === 'names', plan[2]);
  const shared = TC.sharedRows([{ path: '/a', share: 'ro', tags: ['discover', 'notes'] }, { path: '/b', share: 'rw', tags: [] }, { path: '/c', tags: [] }]);
  ok('sharedRows: only the rows marked shareable travel; 只读 ⇒ read-only here, 可写 ⇒ editable; their own verbs stay home', shared.length === 2 && JSON.stringify(shared[0].tags) === JSON.stringify(['readonly']) && shared[1].tags.length === 0, shared);
}

console.log('— PURE: the old write doors keep working —');
{
  const base = [{ path: '/w', note: '', tell: 'names', tags: ['discover'], share: null }, { path: '/kept', note: 'mine', tell: null, tags: ['discover'], share: null }];
  const a = TC.applyLegacyPatch(base, null, { folders: ['/kept', '/new'] });
  ok('folders = exactly these: a row that existed only to auto-join goes, a noted row loses the verb only, a new one is added', JSON.stringify(a.map((r) => [r.path, r.tags])) === JSON.stringify([['/kept', ['discover']], ['/new', ['discover']]]), a);
  const b = TC.applyLegacyPatch(base, null, { contextDir: '/w' });
  ok('contextDir = this folder: the verb moves onto its row', b[0].tags.includes('notes') && b[0].tags.includes('discover'), b);
  const c = TC.applyLegacyPatch(b, null, { contextDir: null });
  ok('contextDir = null: no notes row (the row stays for its other verb)', c.every((r) => !r.tags.includes('notes')) && c.length === 2, c);
}

console.log('— the store: rows, derivations, the wire —');
let IRG;
{
  const { m } = fresh();
  const t = m.create({ title: 'IR', objective: 'Never quote vendor prices.\nNumbers only from the figures table.', ctx: [
    { path: '~/work/ir', note: '工作文件', tags: ['discover'] },
    { path: '共享资料', note: '共享笔记', tags: ['notes'], tell: 'names' },
    { path: 'handbook.md', note: '规则和联系人' },
  ] });
  IRG = { m, id: t.id };
  const v = m.list()[0];
  ok('the wire carries the rows + where each points (ctxRes, derived)', v.ctx.length === 3 && v.ctxRes[1].abs === path.join(IR, '共享资料') && v.ctxRes[2].kind === 'file', v.ctxRes);
  ok('the wire\'s folders / contextDir are DERIVED from the rows', JSON.stringify(v.folders) === JSON.stringify([{ path: IR, recursive: true }]) && v.contextDir === path.join(IR, '共享资料'), { folders: v.folders, contextDir: v.contextDir });
  ok('the live record holds NO old fields (nothing can read them by accident)', !('folders' in m.get(t.id)) && !('contextDir' in m.get(t.id)));
  ok('membership by cwd reads the 自动发现会话 rows, recursive', m.groupsForSession({ cwd: path.join(IR, 'deep') }).map((g) => g.id).join() === t.id && m.groupsForSession({ cwd: OTHER }).length === 0);
  await m.mirrorIdle();   // int346: lane cli-call-timeouts made the TASK.md mirror asynchronous (a queued, bounded write) — a suite awaits it
  ok('the TASK.md mirror is written in the 记笔记 row\'s folder and lists the rows', fs.readFileSync(path.join(IR, '共享资料', '.vibespace', 'TASK.md'), 'utf8').includes('## Context') && fs.readFileSync(path.join(IR, '共享资料', '.vibespace', 'TASK.md'), 'utf8').includes('handbook.md — 规则和联系人'));
  const before = m.get(t.id).contentUpdatedAt;
  const until = Date.now() + 5; while (Date.now() < until) { /* a later ms */ }
  m.update(t.id, { ctx: [...v.ctx, { path: '路演问答.md', note: 'Q&A' }] });
  ok('a table edit is content (members are re-told) and stamps ctxUpdatedAt', m.get(t.id).contentUpdatedAt > before && m.get(t.id).ctxUpdatedAt === m.get(t.id).contentUpdatedAt);
  const until2 = Date.now() + 5; while (Date.now() < until2) { /* a later ms */ }
  const contentAt = m.get(t.id).contentUpdatedAt;
  m.update(t.id, { color: '#61afef' });
  ok('a cosmetic edit is not', m.get(t.id).ctxUpdatedAt !== m.get(t.id).updatedAt && m.get(t.id).contentUpdatedAt === contentAt);
  // the old doors
  const g2 = m.create({ title: 'Legacy door', folders: [OTHER], contextDir: path.join(IR, '共享资料') });
  ok('create({folders, contextDir}) makes the rows they mean', JSON.stringify(m.get(g2.id).ctx.map((r) => [r.path, r.tags])) === JSON.stringify([[OTHER, ['discover']], [path.join(IR, '共享资料'), ['notes']]]), m.get(g2.id).ctx);
  m.update(g2.id, { contextDir: null });
  ok('update({contextDir: null}) leaves no notes row (the compat-made row goes with its verb)', m.view(g2.id).contextDir === null && m.get(g2.id).ctx.length === 1);
  let threw = ''; try { m.update(g2.id, { contextDir: 'relative/x' }); } catch (e) { threw = e.message; }
  ok('the old door still refuses a relative contextDir (its contract)', /absolute/.test(threw), threw);
  threw = ''; try { m.update(g2.id, { ctx: 'nope' }); } catch (e) { threw = e.message; }
  ok('ctx must be an array of rows', /array/.test(threw), threw);
}

console.log('— the four levels, told —');
{
  const { m } = fresh();
  const words = (lvl) => {
    const t = m.create({ title: 'L-' + lvl, ctx: [{ path: IR, note: 'desk', tell: lvl }] });
    const out = m.renderContext(t.id, {});
    return out.slice(out.indexOf('## Context'), out.indexOf('</vibespace-task-context>'));
  };
  const note = words('note'), names = words('names'), index = words('index'), contents = words('contents');
  ok('只说明: the path + the note, no listing', note.includes(`- ${IR}/ — desk`) && !note.includes('draft.txt'), note);
  ok('文件名: + the listing (relative names, sizes)', names.includes('files below') && names.includes('  - draft.txt (7 B)') && names.includes('  - deep/x.md') && !names.includes('Always cite'), names);
  ok('文件名 + 关键文件内容: the listing + the CONTENTS of its key files (top level only)', index.includes('  - draft.txt') && index.includes('  > Always cite the figures table.') && index.includes('IR readme.') && !index.includes('Contacts: CFO') && index.includes("the key files' contents follow (CLAUDE.md, README.md)"), index);
  ok('内容: every file\'s contents', contents.includes('Contacts: CFO.') && contents.includes('  > a draft') && contents.includes("every file's contents below"), contents);
  const t2 = m.create({ title: 'keys', ctx: [{ path: IR, note: 'desk', tell: 'index', keys: ['README.md'] }] });
  const k2 = m.renderContext(t2.id, {});
  ok('the key files are the row\'s own chip list when edited', k2.includes('IR readme.') && !k2.includes('Always cite'), k2.slice(k2.indexOf('## Context'), k2.indexOf('## Context') + 600));
  const t3 = m.create({ title: 'file', ctx: [{ path: '~/work/ir/共享资料/handbook.md', note: 'rules' }] });
  const f3 = m.renderContext(t3.id, {});
  ok('a file defaults to 内容 (its contents, quoted)', f3.includes('handbook.md — rules — contents below') && f3.includes('  > Contacts: CFO.'), f3.slice(f3.indexOf('## Context'), f3.indexOf('## Context') + 400));
  const t4 = m.create({ title: 'verbs', ctx: [{ path: IR, note: 'desk', tags: ['discover', 'readonly'], tell: 'note' }, { path: '/nope/never', note: 'gone', tell: 'names' }] });
  const v4 = m.renderContext(t4.id, {});
  ok('the verbs are words: 自动发现会话 · 不许 agent 改', v4.includes('(conversations started here auto-join · read-only: never modify it)'), v4.slice(v4.indexOf('## Context'), v4.indexOf('## Context') + 500));
  ok('a path that is not there is SAID, never silently dropped', v4.includes('- /nope/never — gone — not there now'));
}

console.log('— the budget: a row over it steps down and SAYS so —');
{
  const { m } = fresh({ getSetting: (k) => (k === 'tasks.contextIndexBytes' ? 1200 : undefined) });
  const t = m.create({ title: 'B', ctx: [{ path: MEMO, note: 'desk', tell: 'contents' }, { path: BIG, note: 'company drive', tell: 'names' }] });
  const out = m.renderContext(t.id, {});
  const ctx = out.slice(out.indexOf('## Context'), out.indexOf('</vibespace-task-context>'));
  ok('a folder whose contents do not fit steps down one level and says what it needed and what was left', /over the injection budget: full contents need [\d.]+ (KB|B), [\d.]+ (KB|B) was left — told as file names \+ key files instead/.test(ctx), ctx.slice(0, 700));
  ok('a folder past the walk cap steps down to 只说明 and points at show --full', /company drive \[over the injection budget: file names cover more than 400 files — told as the path and note only instead; `vibespace-task show --full` lists every file\]/.test(ctx), ctx.slice(ctx.indexOf('company drive') - 80, ctx.indexOf('company drive') + 260));
  ok('the heading names the budget it planned within', /## Context \(each row: path — note \(what it is for\); told at the depth the group chose, within 1\.2 KB\)/.test(ctx), ctx.slice(0, 200));
  const pv = m.contextPreview(t.id, {});
  const stepped = pv.rows.filter((r) => r.level !== r.chosen);
  ok('the preview\'s plan says the same (two rows stepped, their levels)', stepped.length === 2 && stepped[0].chosen === 'contents' && stepped[0].level === 'index' && stepped[1].level === 'note' && stepped[1].need === null, pv.rows);
  ok('the preview\'s text IS renderContext\'s output (the window shows the exact words)', pv.text === m.renderContext(t.id, { now: Date.now() }).replace(/Updated: [^\n]*/, (x) => x) || pv.text.includes(ctx.split('\n')[2]), pv.text.length);
  ok('…its block (identity + standing instructions + the table) is a verbatim part of that text', pv.block.split('## Context')[1] && pv.text.includes('## Context' + pv.block.split('## Context')[1]), pv.block.slice(0, 300));
  ok('…and the budget it used (own 1200, the room, the effective one)', pv.budget.own === 1200 && pv.budget.effective <= 1200 && pv.used <= pv.budget.effective, pv.budget);
}

console.log('— the 10 KiB law: tools / rules first, then the table, within the room —');
{
  const { m } = fresh();   // the default budget (10 KB) — the inline room is the binding one
  const t = m.create({ title: 'Law', objective: 'R'.repeat(1500), ctx: [{ path: IR, tell: 'contents', note: 'desk' }, { path: BIG, note: 'drive', tell: 'names' }, { path: OTHER, note: 'contracts' }] });
  for (let i = 0; i < 30; i++) m.addProgress(t.id, { note: 'entry ' + i + ' ' + 'x'.repeat(150), session: 'claude:abc' });
  const out = m.renderContext(t.id, {});
  ok(`the whole single-group block stays inside the hook's 9600 B inline cap (${B(out)} B)`, B(out) <= 9600, B(out));
  const iObj = out.indexOf('## Objective'), iTools = out.indexOf('### Reporting back'), iCtx = out.indexOf('## Context'), iLog = out.indexOf('## Activity log');
  ok('the order is the law: standing instructions → tools → the Context table → the activity log', iObj > 0 && iTools > iObj && iCtx > iTools && iLog > iCtx, { iObj, iTools, iCtx, iLog });
  ok('the standing instructions are told verbatim', out.includes('R'.repeat(1500)));
  ok('every row is told (its line), whatever its depth', out.includes(`${IR}/ — desk`) && out.includes(`${BIG}/ — drive`) && out.includes(`${OTHER}/ — contracts`));
  // several groups share the room
  const t2 = m.create({ title: 'Law2', ctx: [{ path: IR, tell: 'contents', note: 'desk2' }] });
  const multi = m.renderMultiContext([t.id, t2.id], {});
  ok(`two groups: one layered block inside the cap (${B(multi)} B), both tables told`, B(multi) <= 9600 && multi.includes('### "Law"\n') && multi.includes('### "Law2"\n') && multi.includes('## Context tables'), B(multi));
}

console.log('— 引用任务组「X」的 Context 表 (ro / rw) —');
{
  const { m } = fresh();
  const co = m.create({ title: '公司', ctx: [{ path: '~/work/contracts/a.md', note: '术语表', share: 'rw' }, { path: IR, note: '人员', share: 'ro', tell: 'note' }, { path: OTHER, note: 'not shared' }] });
  const ir = m.create({ title: 'IR2', ctx: [{ ref: co.id, note: '公司层' }, { path: '~/work/ir/README.md', note: 'own' }] });
  const out = m.renderContext(ir.id, {});
  const ctx = out.slice(out.indexOf('## Context'), out.indexOf('</vibespace-task-context>'));
  ok('the referenced rows come LAST, under the reference line', ctx.indexOf('own') < ctx.indexOf('The Context table of another Task Group — "公司"') && ctx.includes('— 2 rows it shares, below:'), ctx);
  ok('a row shared 可写 says you may edit it; a row shared 只读 is read-only here', ctx.includes('术语表 (from the Task Group "公司", you may edit it)') && ctx.includes('人员 (read-only: never modify it · from the Task Group "公司")'), ctx);
  ok('a row X did not mark shareable never travels', !ctx.includes('not shared'));
  const snap = m.snapshotForDiff(ir.id);
  const until = Date.now() + 5; while (Date.now() < until) { /* a later ms */ }
  m.update(co.id, { ctx: [...m.get(co.id).ctx, { path: '~/work/ir/CLAUDE.md', note: 'new shared', share: 'ro' }] });
  ok('an edit of X\'s table reaches the referencing group\'s gate (contentAtOf)', m.contentAtOf(ir.id) === m.get(co.id).ctxUpdatedAt && m.contentAtOf(ir.id) > m.get(ir.id).contentUpdatedAt);
  const d = m.diffChanges(ir.id, snap, {});
  ok('…and its diff re-tells the new shared row', d && d.lines.some((l) => l.includes('new shared')) && d.bits.includes('context table changed'), d);
  m.remove(co.id);
  ok('a referenced group that is gone is said', m.renderContext(ir.id, {}).includes('that group no longer exists'));
}

console.log('— the diff path diffs rows —');
{
  const { m } = fresh();
  const t = m.create({ title: 'D', ctx: [{ path: IR, note: 'desk', tell: 'names' }, { path: OTHER, note: 'contracts', tell: 'names' }] });
  const snap = m.snapshotForDiff(t.id);
  ok('the snapshot carries the table hash + its rows', typeof snap.ctxHash === 'string' && snap.ctxRows.length === 2);
  ok('nothing changed ⇒ an empty delta', m.diffChanges(t.id, snap, {}).lines.length === 0);
  m.update(t.id, { ctx: [m.get(t.id).ctx[0], { path: '~/work/ir/路演问答.md', note: 'Q&A' }] });
  const d = m.diffChanges(t.id, snap, {});
  ok('a removed row is named; an added one is re-told at its depth', d.lines.some((l) => l === `- Context row REMOVED: ${OTHER}`) && d.lines.some((l) => /- Context row ADDED — as told now:/.test(l)) && d.lines.some((l) => l.includes('  > Q&A for the roadshow.')), d.lines);
  ok('a LITE (restored) snapshot whose table changed falls back to the full delivery', m.diffChanges(t.id, { ...snap, ctxRows: undefined }, {}) === null);
  ok('a snapshot from before the table (no hash) falls back too', m.diffChanges(t.id, { title: snap.title, objHash: snap.objHash, backlog: [], lastProgressAt: 0 }, {}) === null);
  // files under a row
  const s2 = m.snapshotForDiff(t.id), sig1 = m.contextSignature(t.id);
  mk('work/ir/new-note.md', 'n');
  m._walkCache = new Map(); m._sigCache = new Map();
  const sig2 = m.contextSignature(t.id);
  const d2 = m.diffChanges(t.id, s2, { oldSig: sig1, newSig: sig2 });
  ok('a file added under a 文件名 row is a one-line delta naming it', d2 && d2.lines.some((l) => l === `- Files under ${IR} — new ${IR}/new-note.md`), d2 && d2.lines);
  fs.writeFileSync(path.join(home, 'work/ir/路演问答.md'), 'Q&A, revised.\n');
  m._walkCache = new Map(); m._sigCache = new Map();   // the signature's 4 s cache (it runs on every prompt)
  const sig3 = m.contextSignature(t.id);
  ok('a file told by its CONTENTS changed ⇒ the full delivery (the agent needs the new text)', sig3 !== sig2 && m.diffChanges(t.id, m.snapshotForDiff(t.id), { oldSig: sig2, newSig: sig3 }) === null);
  fs.rmSync(path.join(home, 'work/ir/new-note.md'));
}

console.log('— the store\'s reads for the window and the CLI —');
{
  const { m, id } = IRG;
  const ix = m.contextIndexOf(id);
  ok('show --full lists every row\'s files (+ the notes folder in the old shape)', ix.dir === path.join(IR, '共享资料') && ix.files.length === 2 && ix.rows.length >= 3 && ix.rows[0].files.some((f) => f.path === path.join(IR, 'draft.txt')), ix.rows.map((r) => r.path));
  const ixr = m.contextIndexOf(id, '/remote/home/.vibespace/ctx/' + id);
  ok('a remote session reads the notes row through its synced copy', ixr.dir.startsWith('/remote/home/.vibespace/ctx/') && ixr.rows.some((r) => r.path.startsWith('/remote/home/.vibespace/ctx/')), ixr.dir);
}

console.log('— the ONE migration: owner-shaped fixtures (masked) —');
{
  const d = path.join(root, 'data-mig');
  fs.mkdirSync(d, { recursive: true });
  const W1 = mkdir('ws/acme'); mkdir('ws/acme/SharedContext/notes');
  const W2a = mkdir('ws/proj/0223-alpha'), W2b = mkdir('ws/proj/beta');
  const W3 = mkdir('ws/desk'); mkdir('ws/desk/SharedContext');
  const legacy = {
    version: 1, tasks: {
      'T-260705-g1': { id: 'T-260705-g1', title: 'g1', kind: 'task', archived: false, objective: 'o1', backlog: [], progress: [], sessions: [], folders: [{ path: W1, recursive: true }], contextDir: path.join(W1, 'SharedContext/notes'), createdAt: 1, updatedAt: 1 },
      'T-260705-g2': { id: 'T-260705-g2', title: 'g2', kind: 'task', archived: false, objective: '', backlog: [], progress: [], sessions: [], folders: [{ path: W2a, recursive: true }, W2b], contextDir: null, createdAt: 2, updatedAt: 2 },
      'T-260709-g3': { id: 'T-260709-g3', title: 'g3', kind: 'task', archived: false, objective: '', backlog: [], progress: [], sessions: [], folders: [{ path: W3, recursive: false }], contextDir: path.join(W3, 'SharedContext'), injectContext: true, createdAt: 3, updatedAt: 3 },
      'T-260809-g4': { id: 'T-260809-g4', title: 'g4', kind: 'task', archived: false, objective: '', backlog: [], progress: [], sessions: [], folders: [], contextDir: path.join(home, 'elsewhere/ctx'), createdAt: 4, updatedAt: 4 },
      'T-261002-g6': { id: 'T-261002-g6', title: 'g6', kind: 'task', archived: false, objective: '', backlog: [], progress: [], sessions: ['claude:aaa'], folders: [{ path: '/var/tmp/lanes-x/**', recursive: true }], contextDir: W3, createdAt: 6, updatedAt: 6 },
      'T-261003-g7': { id: 'T-261003-g7', title: 'g7', kind: 'task', archived: false, objective: '', backlog: [], progress: [], sessions: [], folders: [{ path: W1, recursive: true }], contextDir: W1, createdAt: 7, updatedAt: 7 },
    },
  };
  fs.writeFileSync(path.join(d, 'task-groups.json'), JSON.stringify(legacy, null, 2));
  const m = new TaskGroupManager({ dataDir: d, homeDir: home });
  // RED CONTROL: before the migration the store reads NO old field — the same cwd joins nothing (the leg is not vacuous)
  ok('CONTROL (RED without it): before the migration the old folders[] are no longer read — a cwd under g1\'s folder joins nothing', m.groupsForSession({ cwd: path.join(W1, 'src') }).length === 0);
  const rep = m.migrateContextRows();
  ok('the migration reports what it did (6 groups, 10 rows, 6 auto-join rows, 5 notes, 1 merged, 1 non-recursive)', rep.groups === 6 && rep.rows === 10 && rep.folders === 6 && rep.notes === 5 && rep.merged === 1 && rep.nonRecursive === 1, rep);
  ok('folders[] → rows told 文件名, tagged 自动发现会话 (a bare string too)', JSON.stringify(m.get('T-260705-g2').ctx) === JSON.stringify([{ path: W2a, note: '', tell: 'names', tags: ['discover'], share: null }, { path: W2b, note: '', tell: 'names', tags: ['discover'], share: null }]), m.get('T-260705-g2').ctx);
  ok('contextDir → a row told 文件名, tagged agent 在这里记笔记 (after the folders)', JSON.stringify(m.get('T-260705-g1').ctx.map((r) => [r.path, r.tell, r.tags])) === JSON.stringify([[W1, 'names', ['discover']], [path.join(W1, 'SharedContext/notes'), 'names', ['notes']]]), m.get('T-260705-g1').ctx);
  ok('a contextDir that IS one of the folders is one row with both verbs', JSON.stringify(m.get('T-261003-g7').ctx.map((r) => r.tags)) === JSON.stringify([['discover', 'notes']]));
  ok('the membership it had survives: a cwd under g1\'s folder joins g1 (and g7, the same folder)', m.groupsForSession({ cwd: path.join(W1, 'src') }).map((g) => g.id).join() === 'T-260705-g1,T-261003-g7');
  ok('the contextDir it had survives: the derived notes folder', m.contextDirOf('T-260709-g3') === path.join(W3, 'SharedContext') && m.contextDirOf('T-260809-g4') === path.join(home, 'elsewhere/ctx'));
  // int346: lane open-task-binds' folder rule (PURE folderOf) — a stored glob tail is the recursive switch, never part of the
  // path; this group's folder now MATCHES (a cwd at it / under it joins) — the row is the folder, not its printed glob
  ok('a folder stored with a literal /** becomes the folder itself, recursive (lane open-task-binds\' folderOf — the glob is the switch; this fixture folder is absent here, so the row says so)', m.get('T-261002-g6').ctx[0].path === '/var/tmp/lanes-x' && m.list().find((g) => g.id === 'T-261002-g6').ctxRes[0].kind === 'missing', m.get('T-261002-g6').ctx[0]);
  const disk = JSON.parse(fs.readFileSync(path.join(d, 'task-groups.json'), 'utf8'));
  ok('the old fields stay in the FILE one release (an older build still reads them)', JSON.stringify(disk.tasks['T-260705-g1'].folders) === JSON.stringify(legacy.tasks['T-260705-g1'].folders) && disk.tasks['T-260705-g1'].contextDir === legacy.tasks['T-260705-g1'].contextDir && Array.isArray(disk.tasks['T-260705-g1'].ctx));
  const again = m.migrateContextRows();
  ok('a second run finds nothing to do', again.groups === 0 && again.skipped === 6, again);
  const m2 = new TaskGroupManager({ dataDir: d, homeDir: home });
  ok('a restart keeps the rows and still does not read the old fields', m2.get('T-260705-g1').ctx.length === 2 && !('folders' in m2.get('T-260705-g1')));
  m2.update('T-260705-g1', { ctx: [] });
  const disk2 = JSON.parse(fs.readFileSync(path.join(d, 'task-groups.json'), 'utf8'));
  ok('a table edit never touches the held old fields (never stored twice: they are the rollback copy, not a mirror)', disk2.tasks['T-260705-g1'].ctx.length === 0 && disk2.tasks['T-260705-g1'].folders.length === 1);
  m2.remove('T-260809-g4');
  ok('a removed group takes its held old fields with it', !JSON.parse(fs.readFileSync(path.join(d, 'task-groups.json'), 'utf8')).tasks['T-260809-g4']);
}

console.log('— the bundle and the export —');
{
  const { m } = fresh();
  const n0 = m.importBundle({ tasks: [{ id: 'T-1-old', title: 'old', folders: [IR], contextDir: OTHER }, { id: 'T-1-new', title: 'new', ctx: [{ path: IR, tags: ['notes'] }] }] });
  ok('a bundle from before the table imports as the rows its old fields mean; a new one keeps its table', n0 === 2 && m.view('T-1-old').contextDir === OTHER && m.view('T-1-old').folders[0].path === IR && m.view('T-1-new').contextDir === IR);
  ok('exportBundle carries the table, never the derived names', Array.isArray(m.exportBundle().tasks[0].ctx) && !('folders' in m.exportBundle().tasks[0]));
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${failed ? failed + ' FAILED' : 'all passed'} (${passed} passed)`);
process.exit(failed ? 1 : 0);
