#!/usr/bin/env node
// THE CONTEXT TABLE (lane task-group-context, POC v2.2 + the owner's fourth level, 2026-10-23) — in-process, no server.
// A Task Group's `ctx` rows replace folders[] + contextDir: the PURE rules (src/task-context.js), the store's derivations
// (the 自动发现会话 rows = the old folders[], the 记笔记 row = the old contextDir), the FOUR levels of 告诉 agent, the
// budget's step-down and its words, 引用 ro / rw, the 10 KiB law (tools / rules first, then the table, within the room),
// the diff path over rows, the one migration over owner-shaped fixtures (+ a RED control), the window's preview read.
// Run: node scripts/test-task-groups-context.mjs   (int346: renamed — lane open-task-binds's test-task-groups.mjs is the membership suite)
import { createRequire } from 'node:module';
import { fileURLToPath as fileURLToPathU5 } from 'node:url';
import fs from 'node:fs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
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
const fresh = ({ Manager = TaskGroupManager, ...extra } = {}) => { const d = path.join(root, 'data-' + (++n)); fs.mkdirSync(d, { recursive: true }); return { dir: d, m: new Manager({ dataDir: d, homeDir: home, ...extra }) }; };

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
  // B-06de: another machine's root is stored as written (the sidebar's link writes `<host>::/` for a conversation at /)
  ok('a machine\'s root row keeps its slash (h1::/ stays remote, never the relative hub row h1::); a trailing slash elsewhere folds', TC.sanitizeRow({ path: 'h1::/' }).path === 'h1::/' && TC.sanitizeRow({ path: 'h1:://' }).path === 'h1::/' && TC.sanitizeRow({ path: 'h1::/srv/app/' }).path === 'h1::/srv/app' && TC.sanitizeRow({ path: '/srv/' }).path === '/srv' && TC.sanitizeRow({ path: '/' }).path === '/' && TC.resolveRows([TC.sanitizeRow({ path: 'h1::/', tags: ['discover'] })], { home: '/home/u' })[0].kind === 'remote');
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

console.log('— B-4a9f: a stepped row\'s «over the injection budget» note is CHARGED inside the plan — its own words never push it past the budget —');
{
  const { anchored } = await import('./scratch.mjs');
  // the index level of MEMO, bare (a group that CHOSE index, under the default budget) — then a budget it fits bare, never with its note
  const { m: m0 } = fresh();
  const t0 = m0.create({ title: 'I', ctx: [{ path: MEMO, note: 'desk', tell: 'index' }] });
  const I = m0.contextPreview(t0.id, {}).rows[0].bytes;
  // a SWEEP of budgets around it (never one guessed byte count): the plan's used bytes stay within the budget unless the row
  // already rests at the floor (只说明 — nothing lower to step to); the release, somewhere in the sweep, keeps a level its note overflows
  const run = (Manager, budget) => { const { m } = fresh({ Manager, getSetting: (k) => (k === 'tasks.contextIndexBytes' ? budget : undefined) }); const t = m.create({ title: 'C', ctx: [{ path: MEMO, note: 'desk', tell: 'contents' }] }); return m.contextPreview(t.id, {}); };
  const budgets = Array.from({ length: 60 }, (_, i) => Math.max(1, I - 60 + i * 4));
  const cur = budgets.map((b) => ({ b, pv: run(TaskGroupManager, b) }));
  const overCur = cur.filter(({ pv }) => pv.used > pv.budget.effective && pv.rows[0].level !== 'note');
  const stepped = cur.filter(({ pv }) => pv.rows[0].level !== pv.rows[0].chosen);
  ok(`at every budget of the sweep (${budgets[0]}–${budgets[budgets.length - 1]} B) the plan's used bytes stay within it, unless the row rests at the floor (只说明) — the row (its contents never fit) steps down at every one`,
    overCur.length === 0 && stepped.length === budgets.length, overCur.map(({ b, pv }) => ({ b, used: pv.used, level: pv.rows[0].level })));
  // …and the charge is EXACT (never «≤» by over-charging): the first budget of the sweep that keeps «file names + key files» is
  // within one step (4 B) of that row's printed bytes, its note included
  const firstKeep = cur.find(({ pv }) => pv.rows[0].level === 'index');
  ok('the charged bytes ARE the shown bytes: the first budget that keeps the stepped level is within one step of its printed size (the note counted once, exactly)', !!firstKeep && firstKeep.b >= firstKeep.pv.rows[0].bytes && firstKeep.b - firstKeep.pv.rows[0].bytes < 4 && firstKeep.pv.rows[0].bytes > I, firstKeep && { b: firstKeep.b, bytes: firstKeep.pv.rows[0].bytes, I });   // the suite's ok is NAME-first
  const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/task-groups.js'), 'utf8');
  const relSrc = anchored(src, "    const plan = TC.planRows(items.map((m) => ({ kind: m.kind, chosen: m.chosen, cost: cost(m) })), budget);", "    const plan = TC.planRows(items.map((m) => ({ kind: m.kind, chosen: m.chosen, cost: (lvl, left) => bare(at(m, lvl, left)) })), budget);", 'the bare cost');
  const MC = mutantCopies('tgc-b4a9f', path.join(path.dirname(new URL(import.meta.url).pathname), '..'));
  const RelM = MC.load('src/task-groups.js', relSrc, 'bare').TaskGroupManager;
  const overRel = budgets.map((b) => ({ b, pv: run(RelM, b) })).filter(({ pv }) => pv.used > pv.budget.effective && pv.rows[0].level !== 'note');
  ok(`CONTROL — the release's bare cost (the note not charged): at ${overRel.length} budget(s) of the same sweep a row ABOVE the floor carries its note past the budget`, overRel.length > 0, overRel.slice(0, 3).map(({ b, pv }) => ({ b, used: pv.used, level: pv.rows[0].level })));
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
  // B-9ac8: a cap under which no log line fits (the preamble + other groups' contexts used the room) — the count says none
  // fit, how many, and where (`show` prints the newest; `--group <id>` in a payload of several groups); never «last 0 of N»
  const logHead = (s) => { const i = s.indexOf('## Activity log'); return i < 0 ? '' : s.slice(i, s.indexOf('\n', i)); };
  const tight = m.renderContext(t.id, { cap: 1000 }), roomy = m.renderContext(t.id, {}), tightM = m.renderContext(t.id, { cap: 1000, multi: true });
  const partialM = m.renderContext(t.id, { multi: true });
  ok('B-9ac8 follow-up: in a payload of several groups the PARTIAL header names its group too (one renderer, one form)', logHead(partialM).startsWith('## Activity log  _(last ') && logHead(partialM).includes(` of 30 — \`vibespace-task --group ${t.id} show\` prints more)_`), logHead(partialM));
  ok('B-9ac8 follow-up r2: the «† = has detail» hint names its group too in a payload of several groups (the CLI refuses a bare verb there)', fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/task-groups.js'), 'utf8').includes('_(† = has detail — \\`vibespace-task ${multi ? `--group ${t.id} ` : \'\'}show --full\\`)_'), '');
  ok('B-9ac8: no log line fits under the cap ⇒ «none fit inline — 30 lines; `vibespace-task show` prints the newest», never «last 0 of 30»; in a payload of several groups the door names the group; a roomy render still says «last N of 30»',
    logHead(tight) === '## Activity log  _(none fit inline — 30 lines; `vibespace-task show` prints the newest)_' && !/last 0 of/.test(tight)
    && logHead(tightM) === `## Activity log  _(none fit inline — 30 lines; \`vibespace-task --group ${t.id} show\` prints the newest)_` && /^## Activity log {2}_\(last [1-9]\d* of 30 — /.test(logHead(roomy)), { tight: logHead(tight), tightM: logHead(tightM), roomy: logHead(roomy) });
  for (let i = 0; i < 30; i++) m.addProgress(t2.id, { note: 'two ' + i + ' ' + 'y'.repeat(150), session: 'claude:abc' });
  const t3 = m.create({ title: 'Law3', objective: 'S'.repeat(1500) }); m.addProgress(t3.id, { note: 'only one', session: 'claude:abc' });
  const multiTight = m.renderMultiContext([t.id, t2.id], { cap: 2000 }), one = m.renderContext(t3.id, { cap: 600 });
  ok('B-9ac8: the payload of several groups under a cap — each group\'s count says none fit and names ITS group; one entry reads «1 line»',
    multiTight.includes(`### "Law"  _(none fit inline — 30 lines; \`vibespace-task --group ${t.id} show\` prints the newest)_`) && multiTight.includes(`### "Law2"  _(none fit inline — 30 lines; \`vibespace-task --group ${t2.id} show\` prints the newest)_`) && !/last 0 of/.test(multiTight)
    && logHead(one) === '## Activity log  _(none fit inline — 1 line; `vibespace-task show` prints the newest)_', { multi: (multiTight.match(/### "Law\d?".*/g) || []).slice(0, 2), one: logHead(one) });
  const SRC9 = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/task-groups.js'), 'utf8');
  const NONE9 = "const noneFitWords = (n, gid = '') => `none fit inline — ${n} line${n === 1 ? '' : 's'}; \\`vibespace-task ${gid}show\\` prints the newest`;";
  ok('ANCHOR: the none-fit words, spelled once', SRC9.split(NONE9).length === 2);
  if (SRC9.split(NONE9).length === 2) {
    const MT = mutantCopies('task-groups-log-head', path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'));
    const TG = MT.load('src/task-groups.js', SRC9.replace(NONE9, 'const noneFitWords = (n) => `last 0 of ${n}`;'), 'last-0');
    const { m: m0 } = fresh({ Manager: TG.TaskGroupManager });
    const a0 = m0.create({ title: 'Law', objective: 'R'.repeat(1500) }), b0 = m0.create({ title: 'Law2', objective: 'R'.repeat(1500) });
    for (let i = 0; i < 30; i++) { m0.addProgress(a0.id, { note: 'entry ' + i + ' ' + 'x'.repeat(150), session: 'claude:abc' }); m0.addProgress(b0.id, { note: 'two ' + i + ' ' + 'y'.repeat(150), session: 'claude:abc' }); }
    ok('…CONTROL RED: the release\'s words under the same caps say «last 0 of 30» — in one group\'s log and in the payload of several', /## Activity log {2}_\(last 0 of 30\)_/.test(m0.renderContext(a0.id, { cap: 1000 })) && /### "Law" {2}_\(last 0 of 30\)_/.test(m0.renderMultiContext([a0.id, b0.id], { cap: 2000 })));
  }
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
  // lane lg-store-writes, the U4/U5 cure (should 4): the migration's BOOT save is on disk when it returns — asked of the writer
  // BEFORE any landing (a plain save would still be owed here, whatever its thread did meanwhile: pending until the main thread
  // hears of the write), and the file read before the suite lands anything
  const SWu5 = require('../src/store-writer.js').storeWriter();
  const owedAfterMigrate = SWu5.pending(path.join(d, 'task-groups.json'));
  const diskAtMigrate = JSON.parse(fs.readFileSync(path.join(d, 'task-groups.json'), 'utf8'));
  ok('the migration reports what it did (6 groups, 10 rows, 6 auto-join rows, 5 notes, 1 merged, 1 non-recursive)', rep.groups === 6 && rep.rows === 10 && rep.folders === 6 && rep.notes === 5 && rep.merged === 1 && rep.nonRecursive === 1, rep);
  ok('folders[] → rows told 文件名, tagged 自动发现会话 (a bare string too)', JSON.stringify(m.get('T-260705-g2').ctx) === JSON.stringify([{ path: W2a, note: '', tell: 'names', tags: ['discover'], share: null }, { path: W2b, note: '', tell: 'names', tags: ['discover'], share: null }]), m.get('T-260705-g2').ctx);
  ok('contextDir → a row told 文件名, tagged agent 在这里记笔记 (after the folders)', JSON.stringify(m.get('T-260705-g1').ctx.map((r) => [r.path, r.tell, r.tags])) === JSON.stringify([[W1, 'names', ['discover']], [path.join(W1, 'SharedContext/notes'), 'names', ['notes']]]), m.get('T-260705-g1').ctx);
  ok('a contextDir that IS one of the folders is one row with both verbs', JSON.stringify(m.get('T-261003-g7').ctx.map((r) => r.tags)) === JSON.stringify([['discover', 'notes']]));
  ok('the membership it had survives: a cwd under g1\'s folder joins g1 (and g7, the same folder)', m.groupsForSession({ cwd: path.join(W1, 'src') }).map((g) => g.id).join() === 'T-260705-g1,T-261003-g7');
  ok('the contextDir it had survives: the derived notes folder', m.contextDirOf('T-260709-g3') === path.join(W3, 'SharedContext') && m.contextDirOf('T-260809-g4') === path.join(home, 'elsewhere/ctx'));
  // int346: lane open-task-binds' folder rule (PURE folderOf) — a stored glob tail is the recursive switch, never part of the
  // path; this group's folder now MATCHES (a cwd at it / under it joins) — the row is the folder, not its printed glob
  ok('a folder stored with a literal /** becomes the folder itself, recursive (lane open-task-binds\' folderOf — the glob is the switch; this fixture folder is absent here, so the row says so)', m.get('T-261002-g6').ctx[0].path === '/var/tmp/lanes-x' && m.list().find((g) => g.id === 'T-261002-g6').ctxRes[0].kind === 'missing', m.get('T-261002-g6').ctx[0]);
  // lane lg-store-writes U5: the store writer's owed writes land before the file is read — LOUDLY (the U4/U5 cure, should 6: a
  // landing that left a write throws, never a swallowed error under a check that then reads an old file)
  const landedU5 = () => { const r = SWu5.flushSync(); if (r.left && r.left.length) throw new Error(`the store writer left owed writes: ${JSON.stringify(r.left)}`); };
  ok('the migration\'s boot save is ON DISK when migrateContextRows returns — nothing owed, the rows in the file before any landing', !owedAfterMigrate && Array.isArray(diskAtMigrate.tasks['T-260705-g1'].ctx) && diskAtMigrate.tasks['T-260705-g1'].ctx.length === 2, { owedAfterMigrate });
  const disk = diskAtMigrate;
  ok('the old fields stay in the FILE one release (an older build still reads them)', JSON.stringify(disk.tasks['T-260705-g1'].folders) === JSON.stringify(legacy.tasks['T-260705-g1'].folders) && disk.tasks['T-260705-g1'].contextDir === legacy.tasks['T-260705-g1'].contextDir && Array.isArray(disk.tasks['T-260705-g1'].ctx));
  const again = m.migrateContextRows();
  ok('a second run finds nothing to do', again.groups === 0 && again.skipped === 6, again);
  const m2 = new TaskGroupManager({ dataDir: d, homeDir: home });
  ok('a restart keeps the rows and still does not read the old fields', m2.get('T-260705-g1').ctx.length === 2 && !('folders' in m2.get('T-260705-g1')));
  m2.update('T-260705-g1', { ctx: [] }); landedU5();
  const disk2 = JSON.parse(fs.readFileSync(path.join(d, 'task-groups.json'), 'utf8'));
  ok('a table edit never touches the held old fields (never stored twice: they are the rollback copy, not a mirror)', disk2.tasks['T-260705-g1'].ctx.length === 0 && disk2.tasks['T-260705-g1'].folders.length === 1);
  m2.remove('T-260809-g4'); landedU5();
  ok('a removed group takes its held old fields with it', !JSON.parse(fs.readFileSync(path.join(d, 'task-groups.json'), 'utf8')).tasks['T-260809-g4']);
}

console.log('— the bundle and the export —');
{
  const { m } = fresh();
  const n0 = m.importBundle({ tasks: [{ id: 'T-1-old', title: 'old', folders: [IR], contextDir: OTHER }, { id: 'T-1-new', title: 'new', ctx: [{ path: IR, tags: ['notes'] }] }] });
  ok('a bundle from before the table imports as the rows its old fields mean; a new one keeps its table', n0 === 2 && m.view('T-1-old').contextDir === OTHER && m.view('T-1-old').folders[0].path === IR && m.view('T-1-new').contextDir === IR);
  ok('exportBundle carries the table, never the derived names', Array.isArray(m.exportBundle().tasks[0].ctx) && !('folders' in m.exportBundle().tasks[0]));
}

// ═══ lane lg-store-writes U5 (B-0248): THE STORE'S SAVE GOES THROUGH THE STORE WRITER — task-groups.json is never written on the
// main thread at a change; a change is an act (rank 0 + durable()), a boot save lands before the boot's migrations read the file ═══
{
  /** a store writer stand-in: it lands NOTHING until told (flushSync), records every hand-off */
  const standIn = () => {
    const r = { dirties: [], durables: [], opts: [], flushes: [], owed: new Map(), answer: true };
    r.dirty = (f, o) => { r.dirties.push({ f: path.basename(f), name: o.name, rank: o.rank, urgent: !!o.urgent }); r.owed.set(f, o); };
    // durable() answers `r.answer` — IN PLACE to its `answer` (the writer's synchronous road, the U4/U5 cure) and as the promise
    r.durable = (f, o) => { r.durables.push(path.basename(f)); r.opts.push(o || {}); if (o && typeof o.answer === 'function') o.answer(r.answer); return Promise.resolve(r.answer); };
    r.pending = (f) => r.owed.has(f);
    r.flushSync = (files) => { r.flushes.push(files.map((f) => path.basename(f)).join('+')); for (const f of files) { const o = r.owed.get(f); if (!o) continue; fs.writeFileSync(f, o.produce()); r.owed.delete(f); if (o.onWritten) o.onWritten(true, null); } return { written: files, left: [] }; };
    return r;
  };
  const scene = (Mgr, tag) => {
    const d = path.join(root, 'u5-' + tag); fs.mkdirSync(d, { recursive: true });
    const rec = standIn();
    const m = new Mgr({ dataDir: d, homeDir: home, writer: rec });
    const F = path.join(d, 'task-groups.json');
    const before = fs.existsSync(F) ? fs.readFileSync(F, 'utf8') : null;
    const t = m.create({ title: 'u5 group' });
    m.addProgress(t.id, { note: 'u5 note', session: 'claude:u5' });
    return { d, F, rec, m, t, unchanged: (fs.existsSync(F) ? fs.readFileSync(F, 'utf8') : null) === before };
  };
  const a = scene(TaskGroupManager, 'moved');
  const acts = a.rec.dirties.filter((x) => x.f === 'task-groups.json');
  ok('U5: a create and a progress note hand task-groups.json to the store writer by name, rank 0 + URGENT (the writer\'s own flag — the U4/U5 cure: no durable() timer asked at a save) — the FILE is not written on the main thread at the change',
    a.unchanged && acts.length >= 2 && acts.every((x) => x.name === 'task-groups.write' && x.rank === 0 && x.urgent) && a.rec.durables.length === 0, { unchanged: a.unchanged, acts, durables: a.rec.durables });
  const bytes = JSON.parse(a.rec.owed.get(a.F).produce());
  ok('U5: the bytes are the store when the write is due — the note made after the create rides the same write', !!bytes.tasks[a.t.id] && (bytes.tasks[a.t.id].progress || []).some((p) => p.note === 'u5 note'), Object.keys(bytes.tasks));
  const f0 = a.rec.flushes.length;   // (the scene's own constructor flushed its fresh store's boot save — counted from here: the should-5 cure)
  const m2 = new TaskGroupManager({ dataDir: a.d, homeDir: home, writer: a.rec });
  ok('U5: a store made AGAIN in the same process while its write is owed lands it first (ONE flush of that file), then reads it (the group and its note)', a.rec.flushes.length === f0 + 1 && a.rec.flushes[f0] === 'task-groups.json' && !!m2.get(a.t.id) && m2.get(a.t.id).progress.some((p) => p.note === 'u5 note'), { flushes: a.rec.flushes.slice(f0) });
  const saved = await a.m.persisted();
  a.rec.answer = false;
  const notSaved = await a.m.persisted();
  ok('U5: persisted() — what an act\'s route waits on — true once on disk, FALSE when the write did not land (the route says notOnDisk)', saved === true && notSaved === false, { saved, notSaved });
  // the U4/U5 cure: the route's answer rides the writer's SYNCHRONOUS road (answered in place — the hub's exit leaves in its
  // flush's own run), bounded UNDER the CLI's write budget (src/cli-call.js — a stalled mount answers «notOnDisk» in time)
  const BUDGET_W = require('../src/cli-call.js').BUDGETS.write;
  let inPlace = null; a.m.persisted((v) => { inPlace = v; });
  ok(`U5 cure: persisted(answer) answers IN PLACE through durable()'s answer, bounded under the CLI's ${BUDGET_W / 1000} s write budget`, inPlace === false && a.rec.opts.length === 3 && a.rec.opts.every((o) => o.timeoutMs > 0 && o.timeoutMs < BUDGET_W && typeof o.answer !== 'undefined'), a.rec.opts.map((o) => ({ timeoutMs: o.timeoutMs, answer: typeof o.answer })));
  // a BOOT save (the legacy tasks.json migrated forward) is on disk when the constructor returns
  const dB = path.join(root, 'u5-boot'); fs.mkdirSync(dB, { recursive: true });
  fs.writeFileSync(path.join(dB, 'tasks.json'), JSON.stringify({ version: 1, tasks: { 'T-1-u5': { id: 'T-1-u5', title: 'legacy u5', sessions: [], progress: [] } } }));
  const recB = standIn();
  new TaskGroupManager({ dataDir: dB, homeDir: home, writer: recB });
  ok('U5: a BOOT save (a legacy store migrated forward) is on disk when the constructor returns — the boot\'s migrations read the file next', fs.existsSync(path.join(dB, 'task-groups.json')) && !recB.pending(path.join(dB, 'task-groups.json')) && recB.flushes.includes('task-groups.json'), { flushes: recB.flushes });
  // RED CONTROL: the change removed — the old synchronous save (the writer bypassed, a mutant copy)
  const tgSrc = fs.readFileSync(path.join(path.dirname(fileURLToPathU5(import.meta.url)), '..', 'src/task-groups.js'), 'utf8');
  const aW = "  _writer() { return this._writerDep || require('./store-writer.js').storeWriter(); }";
  ok('U5 ANCHOR: the store\'s one writer line', tgSrc.split(aW).length === 2);
  const SyncTG = mutantCopies('task-groups-u5', path.resolve(path.dirname(fileURLToPathU5(import.meta.url)), '..')).load('src/task-groups.js', tgSrc.replace(aW, "  _writer() { return { dirty: (f, o) => fs.writeFileSync(f, o.produce()), durable: async () => true, pending: () => false, flushSync: () => ({ written: [], left: [] }) }; }"), 'sync-save');
  const r = scene(SyncTG.TaskGroupManager, 'red');
  ok('U5 CONTROL: the old synchronous save (the writer bypassed) ⇒ task-groups.json is written on the main thread at the change — the first check above would be red', !r.unchanged);
  // THE MOVED2 CURE 2 (主开发's ruling — THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING, no roll back): a group's removal is TAKEN
  // (out of memory, its store marked); its archived Activity log and its grant go only once task-groups.json has LANDED — by
  // themselves when the storage answers late; a kill first leaves the old record (the group back, with its log). A writer
  // stand-in whose landing is HELD once armed (afterLanding keeps the steps; `land()` = the storage answers). RED: a copy whose
  // step runs at the act (its plant asserted by anchored())
  const rmScene = (Mgr, tag) => {
    const d = path.join(root, 'u5-rm-' + tag); fs.mkdirSync(d, { recursive: true });
    const st = { armed: false, steps: [] }, owed = new Map();
    const W = { dirty: (f, o) => owed.set(f, o), durable: () => Promise.resolve(!st.armed), pending: (f) => owed.has(f),
      flushSync: (files) => { const left = []; for (const f of files || [...owed.keys()]) { const o = owed.get(f); if (!o) continue; if (st.armed) { left.push({ file: f, name: o.name, why: 'held by the storage at the bound (a stand-in)' }); continue; } fs.writeFileSync(f, o.produce()); owed.delete(f); } return { written: [], left, ms: 0 }; },
      afterLanding: (file, step) => { if (!st.armed && !owed.has(file)) { const value = step(); return Promise.resolve({ landed: true, value }); } st.steps.push(step); return new Promise(() => { }); } };
    const m = new Mgr({ dataDir: d, homeDir: home, writer: W });
    const t = m.create({ title: 'u5 removal' });
    W.flushSync();   // the group on disk
    const arch = path.join(m._archiveRoot, t.id); fs.mkdirSync(arch, { recursive: true }); fs.writeFileSync(path.join(arch, 'log.jsonl'), '{"note":"kept words"}\n');
    st.armed = true;
    let err = null; try { m.remove(t.id); } catch (e) { err = e; }
    let inMemory = false; try { m.get(t.id); inMemory = true; } catch { inMemory = false; }
    const before = { err: err ? err.code || err.message : null, inMemory, archive: fs.existsSync(arch) };
    // A START before the landing (a kill first): the disk still holds the group — and its Activity log is still there
    const m2 = new Mgr({ dataDir: d, homeDir: home, writer: { dirty() { }, durable: () => Promise.resolve(true), pending: () => false, flushSync: () => ({ written: [], left: [], ms: 0 }) } });
    let atStart = false; try { m2.get(t.id); atStart = true; } catch { atStart = false; }
    st.armed = false; W.flushSync(); const xs = st.steps; st.steps = []; for (const x of xs) x();   // the storage answers
    return { ...before, atStart, archiveAfter: fs.existsSync(arch) };
  };
  const rmOk = rmScene(TaskGroupManager, 'real');
  ok('THE STEP RIDES THE LANDING: a group\'s removal not landed yet is TAKEN (never refused, never rolled back) and its archived Activity log is still on disk — a start before the landing finds the group, WITH its log', !rmOk.err && !rmOk.inMemory && rmOk.archive && rmOk.atStart, rmOk);
  ok('…and when the storage answers, the archived Activity log goes by itself (the step, once, at the landing)', !rmOk.archiveAfter, rmOk);
  // THE MOVED2 CURE 3 (主开发's read wjd3u2jue): an id is made from the title and the date — a group removed while the storage is
  // held and made AGAIN with the same title gets the SAME id; when the old removal lands, its step leaves the NEW group's visibility
  // row and Activity folder alone. RED (anchored): a copy without that guard deletes both
  const remakeScene = (Mgr, tag) => {
    const d = path.join(root, 'u5-remake-' + tag); fs.mkdirSync(d, { recursive: true });
    const st = { armed: false, steps: [] }, owed = new Map();
    const W = { dirty: (f, o) => owed.set(f, o), durable: () => Promise.resolve(!st.armed), pending: (f) => owed.has(f),
      flushSync: (files) => { const left = []; for (const f of files || [...owed.keys()]) { const o = owed.get(f); if (!o) continue; if (st.armed) { left.push({ file: f, name: o.name, why: 'held (a stand-in)' }); continue; } fs.writeFileSync(f, o.produce()); owed.delete(f); } return { written: [], left, ms: 0 }; },
      afterLanding: (file, step) => { if (!st.armed && !owed.has(file)) { const value = step(); return Promise.resolve({ landed: true, value }); } st.steps.push(step); return new Promise(() => { }); } };
    const m = new Mgr({ dataDir: d, homeDir: home, writer: W });
    const t = m.create({ title: 'u5 remake' });
    W.flushSync();
    st.armed = true;
    m.remove(t.id);
    const t2 = m.create({ title: 'u5 remake' });
    const arch = path.join(m._archiveRoot, t2.id); fs.mkdirSync(arch, { recursive: true }); fs.writeFileSync(path.join(arch, 'log.jsonl'), '{"note":"the new group\'s words"}\n');
    let vis = null; try { m._setVisibility(t2.id, { externalVisibility: 'visible' }); vis = true; } catch (e) { vis = String(e && e.message); }
    const rows = () => { try { const g = m._grants(); return g ? g.rowsFor('group-visibility', String(t2.id)).length : null; } catch { return null; } };
    const rowsBefore = rows();
    st.armed = false; W.flushSync(); const xs = st.steps; st.steps = []; for (const x of xs) x();   // the OLD removal lands
    let stands = false; try { m.get(t2.id); stands = true; } catch { stands = false; }
    return { sameId: t2.id === t.id, vis, rowsBefore, rowsAfter: rows(), archive: fs.existsSync(arch), stands };
  };
  const rmk = remakeScene(TaskGroupManager, 'real');
  ok('THE MOVED2 CURE 3: a group removed while the storage is held and made again under the SAME id keeps its visibility row and Activity folder when the old removal lands', rmk.sameId && rmk.stands && rmk.archive && rmk.rowsBefore >= 1 && rmk.rowsAfter === rmk.rowsBefore, rmk);
  const GUARD_TG = "      if (this._state.tasks[id]) return;\n";
  const RmkTG = mutantCopies('task-groups-remake', path.resolve(path.dirname(fileURLToPathU5(import.meta.url)), '..')).load('src/task-groups.js', anchored(tgSrc, GUARD_TG, '', 'the removal step leaves a group made again alone'), 'remake-unguarded');
  const rmkX = remakeScene(RmkTG.TaskGroupManager, 'red');
  ok('CONTROL (a copy without the guard): the old removal deletes the NEW group\'s Activity folder and visibility row (red)', rmkX.sameId && (!rmkX.archive || rmkX.rowsAfter === 0), rmkX);
  const RIDE_TG = "    require('./store-writer.js').ride(this._writer(), this._file, () => {";
  const RmTG = mutantCopies('task-groups-ride', path.resolve(path.dirname(fileURLToPathU5(import.meta.url)), '..')).load('src/task-groups.js', anchored(tgSrc, RIDE_TG, "    ((w, f, step) => step())(this._writer(), this._file, () => {   // MUTANT: the step runs at the act", 'the group removal rides the landing'), 'ride-ignored');
  const rmX = rmScene(RmTG.TaskGroupManager, 'red');
  ok('CONTROL (a copy whose step runs at the act): the archived Activity log is DELETED while nothing is on disk — a start finds the group without its log (red)', rmX.atStart && !rmX.archive, rmX);
}

{ const rEnd = require('../src/store-writer.js').storeWriter().flushSync(); if (rEnd.left && rEnd.left.length) ok('the store writer\'s owed writes land before the scratch root goes', false, rEnd.left); }   // lane lg-store-writes U5 (loud: the U4/U5 cure, should 6)
fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${failed ? failed + ' FAILED' : 'all passed'} (${passed} passed)`);
process.exit(failed ? 1 : 0);
