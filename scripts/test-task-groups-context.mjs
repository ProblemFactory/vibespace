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
const ok = (name, cond, extra) => { if (typeof cond !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`);
  if (cond) { passed++; console.log(`  ✓ ${name}`); return; }
  failed++;
  console.error(`  ✗ ${name}${extra !== undefined ? `\n    ${typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 1500)}` : ''}`);
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
  ok('ONE notes row (the first keeps it), no duplicate path or reference', rows.length === 3 && gateOf(rows[0].tags.includes('notes')) && !rows[1].tags.includes('notes'), rows);
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
  ok('contextDir = this folder: the verb moves onto its row', gateOf(b[0].tags.includes('notes')) && verdictOf(b[0].tags.includes('discover')), b);
  const c = TC.applyLegacyPatch(b, null, { contextDir: null });
  ok('contextDir = null: no notes row (the row stays for its other verb)', gateOf(c.every((r) => !r.tags.includes('notes'))) && c.length === 2, c);
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
  ok('the TASK.md mirror is written in the 记笔记 row\'s folder and lists the rows', gateOf(fs.readFileSync(path.join(IR, '共享资料', '.vibespace', 'TASK.md'), 'utf8').includes('## Context')) && verdictOf(fs.readFileSync(path.join(IR, '共享资料', '.vibespace', 'TASK.md'), 'utf8').includes('handbook.md — 规则和联系人')));
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
  ok('the old door still refuses a relative contextDir (its contract)', verdictOf(/absolute/.test(threw)), threw);
  threw = ''; try { m.update(g2.id, { ctx: 'nope' }); } catch (e) { threw = e.message; }
  ok('ctx must be an array of rows', verdictOf(/array/.test(threw)), threw);
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
  ok('只说明: the path + the note, no listing', gateOf(note.includes(`- ${IR}/ — desk`)) && !note.includes('draft.txt'), note);
  ok('文件名: + the listing (relative names, sizes)', gateOf(names.includes('files below')) && gateOf(names.includes('  - draft.txt (7 B)')) && gateOf(names.includes('  - deep/x.md')) && !names.includes('Always cite'), names);
  ok('文件名 + 关键文件内容: the listing + the CONTENTS of its key files (top level only)', gateOf(index.includes('  - draft.txt')) && gateOf(index.includes('  > Always cite the figures table.')) && gateOf(index.includes('IR readme.')) && !index.includes('Contacts: CFO') && verdictOf(index.includes("the key files' contents follow (CLAUDE.md, README.md)")), index);
  ok('内容: every file\'s contents', gateOf(contents.includes('Contacts: CFO.')) && gateOf(contents.includes('  > a draft')) && verdictOf(contents.includes("every file's contents below")), contents);
  const t2 = m.create({ title: 'keys', ctx: [{ path: IR, note: 'desk', tell: 'index', keys: ['README.md'] }] });
  const k2 = m.renderContext(t2.id, {});
  ok('the key files are the row\'s own chip list when edited', gateOf(k2.includes('IR readme.')) && !k2.includes('Always cite'), k2.slice(k2.indexOf('## Context'), k2.indexOf('## Context') + 600));
  const t3 = m.create({ title: 'file', ctx: [{ path: '~/work/ir/共享资料/handbook.md', note: 'rules' }] });
  const f3 = m.renderContext(t3.id, {});
  ok('a file defaults to 内容 (its contents, quoted)', gateOf(f3.includes('handbook.md — rules — contents below')) && verdictOf(f3.includes('  > Contacts: CFO.')), f3.slice(f3.indexOf('## Context'), f3.indexOf('## Context') + 400));
  const t4 = m.create({ title: 'verbs', ctx: [{ path: IR, note: 'desk', tags: ['discover', 'readonly'], tell: 'note' }, { path: '/nope/never', note: 'gone', tell: 'names' }] });
  const v4 = m.renderContext(t4.id, {});
  ok('the verbs are words: 自动发现会话 · 不许 agent 改', verdictOf(v4.includes('(conversations started here auto-join · read-only: never modify it)')), v4.slice(v4.indexOf('## Context'), v4.indexOf('## Context') + 500));
  ok('a path that is not there is SAID, never silently dropped', verdictOf(v4.includes('- /nope/never — gone — not there now')));
}

console.log('— the budget: a row over it steps down and SAYS so —');
{
  const { m } = fresh({ getSetting: (k) => (k === 'tasks.contextIndexBytes' ? 1200 : undefined) });
  const t = m.create({ title: 'B', ctx: [{ path: MEMO, note: 'desk', tell: 'contents' }, { path: BIG, note: 'company drive', tell: 'names' }] });
  const out = m.renderContext(t.id, {});
  const ctx = out.slice(out.indexOf('## Context'), out.indexOf('</vibespace-task-context>'));
  ok('a folder whose contents do not fit steps down one level and says what it needed and what was left', verdictOf(/over the injection budget: full contents need [\d.]+ (KB|B), [\d.]+ (KB|B) was left — told as file names \+ key files instead/.test(ctx)), ctx.slice(0, 700));
  ok('a folder past the walk cap steps down to 只说明 and points at show --full', verdictOf(/company drive \[over the injection budget: file names cover more than 400 files — told as the path and note only instead; `vibespace-task show --full` lists every file\]/.test(ctx)), ctx.slice(ctx.indexOf('company drive') - 80, ctx.indexOf('company drive') + 260));
  ok('the heading names the budget it planned within', verdictOf(/## Context \(each row: path — note \(what it is for\); told at the depth the group chose, within 1\.2 KB\)/.test(ctx)), ctx.slice(0, 200));
  const pv = m.contextPreview(t.id, {});
  const stepped = pv.rows.filter((r) => r.level !== r.chosen);
  ok('the preview\'s plan says the same (two rows stepped, their levels)', stepped.length === 2 && stepped[0].chosen === 'contents' && stepped[0].level === 'index' && stepped[1].level === 'note' && stepped[1].need === null, pv.rows);
  ok('the preview\'s text IS renderContext\'s output (the window shows the exact words)', pv.text === m.renderContext(t.id, { now: Date.now() }).replace(/Updated: [^\n]*/, (x) => x) || verdictOf(pv.text.includes(ctx.split('\n')[2])), pv.text.length);
  ok('…its block (identity + standing instructions + the table) is a verbatim part of that text', gateOf(pv.block.split('## Context')[1]) && verdictOf(pv.text.includes('## Context' + pv.block.split('## Context')[1])), pv.block.slice(0, 300));
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
  ok('the standing instructions are told verbatim', verdictOf(out.includes('R'.repeat(1500))));
  ok('every row is told (its line), whatever its depth', gateOf(out.includes(`${IR}/ — desk`)) && gateOf(out.includes(`${BIG}/ — drive`)) && verdictOf(out.includes(`${OTHER}/ — contracts`)));
  // several groups share the room
  const t2 = m.create({ title: 'Law2', ctx: [{ path: IR, tell: 'contents', note: 'desk2' }] });
  const multi = m.renderMultiContext([t.id, t2.id], {});
  ok(`two groups: one layered block inside the cap (${B(multi)} B), both tables told`, B(multi) <= 9600 && gateOf(multi.includes('### "Law"\n')) && gateOf(multi.includes('### "Law2"\n')) && verdictOf(multi.includes('## Context tables')), B(multi));
  // B-9ac8: a cap under which no log line fits (the preamble + other groups' contexts used the room) — the count says none
  // fit, how many, and where (`show` prints the newest; `--group <id>` in a payload of several groups); never «last 0 of N»
  const logHead = (s) => { const i = s.indexOf('## Activity log'); return i < 0 ? '' : s.slice(i, s.indexOf('\n', i)); };
  const tight = m.renderContext(t.id, { cap: 1000 }), roomy = m.renderContext(t.id, {}), tightM = m.renderContext(t.id, { cap: 1000, multi: true });
  const partialM = m.renderContext(t.id, { multi: true });
  ok('B-9ac8 follow-up: in a payload of several groups the PARTIAL header names its group too (one renderer, one form)', gateOf(logHead(partialM).startsWith('## Activity log  _(last ')) && verdictOf(logHead(partialM).includes(` of 30 — \`vibespace-task --group ${t.id} show\` prints more)_`)), logHead(partialM));
  ok('B-9ac8 follow-up r2: the «† = has detail» hint names its group too in a payload of several groups (the CLI refuses a bare verb there)', verdictOf(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/task-groups.js'), 'utf8').includes('_(† = has detail — \\`vibespace-task ${multi ? `--group ${t.id} ` : \'\'}show --full\\`)_')), '');
  ok('B-9ac8: no log line fits under the cap ⇒ «none fit inline — 30 lines; `vibespace-task show` prints the newest», never «last 0 of 30»; in a payload of several groups the door names the group; a roomy render still says «last N of 30»',
    logHead(tight) === '## Activity log  _(none fit inline — 30 lines; `vibespace-task show` prints the newest)_' && !/last 0 of/.test(tight)
    && logHead(tightM) === `## Activity log  _(none fit inline — 30 lines; \`vibespace-task --group ${t.id} show\` prints the newest)_` && verdictOf(/^## Activity log {2}_\(last [1-9]\d* of 30 — /.test(logHead(roomy))), { tight: logHead(tight), tightM: logHead(tightM), roomy: logHead(roomy) });
  for (let i = 0; i < 30; i++) m.addProgress(t2.id, { note: 'two ' + i + ' ' + 'y'.repeat(150), session: 'claude:abc' });
  const t3 = m.create({ title: 'Law3', objective: 'S'.repeat(1500) }); m.addProgress(t3.id, { note: 'only one', session: 'claude:abc' });
  const multiTight = m.renderMultiContext([t.id, t2.id], { cap: 2000 }), one = m.renderContext(t3.id, { cap: 600 });
  ok('B-9ac8: the payload of several groups under a cap — each group\'s count says none fit and names ITS group; one entry reads «1 line»',
    gateOf(multiTight.includes(`### "Law"  _(none fit inline — 30 lines; \`vibespace-task --group ${t.id} show\` prints the newest)_`)) && gateOf(multiTight.includes(`### "Law2"  _(none fit inline — 30 lines; \`vibespace-task --group ${t2.id} show\` prints the newest)_`)) && !/last 0 of/.test(multiTight)
    && logHead(one) === '## Activity log  _(none fit inline — 1 line; `vibespace-task show` prints the newest)_', { multi: (multiTight.match(/### "Law\d?".*/g) || []).slice(0, 2), one: logHead(one) });
  const SRC9 = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src/task-groups.js'), 'utf8');
  const NONE9 = "const noneFitWords = (n, gid = '') => `none fit inline — ${n} line${n === 1 ? '' : 's'}; \\`vibespace-task ${gid}show\\` prints the newest`;";
  ok('ANCHOR: the none-fit words, spelled once', SRC9.split(NONE9).length === 2);
  if (SRC9.split(NONE9).length === 2) {
    const MT = mutantCopies('task-groups-log-head', path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'));
    const TG = MT.load('src/task-groups.js', editAnchor(SRC9, NONE9, 'const noneFitWords = (n) => `last 0 of ${n}`;', "src/task-groups.js"), 'last-0');
    const { m: m0 } = fresh({ Manager: TG.TaskGroupManager });
    const a0 = m0.create({ title: 'Law', objective: 'R'.repeat(1500) }), b0 = m0.create({ title: 'Law2', objective: 'R'.repeat(1500) });
    for (let i = 0; i < 30; i++) { m0.addProgress(a0.id, { note: 'entry ' + i + ' ' + 'x'.repeat(150), session: 'claude:abc' }); m0.addProgress(b0.id, { note: 'two ' + i + ' ' + 'y'.repeat(150), session: 'claude:abc' }); }
    ok('…CONTROL RED: the release\'s words under the same caps say «last 0 of 30» — in one group\'s log and in the payload of several', gateOf(/## Activity log {2}_\(last 0 of 30\)_/.test(m0.renderContext(a0.id, { cap: 1000 }))) && verdictOf(/### "Law" {2}_\(last 0 of 30\)_/.test(m0.renderMultiContext([a0.id, b0.id], { cap: 2000 }))));
  }
}

console.log('— 引用任务组「X」的 Context 表 (ro / rw) —');
{
  const { m } = fresh();
  const co = m.create({ title: '公司', ctx: [{ path: '~/work/contracts/a.md', note: '术语表', share: 'rw' }, { path: IR, note: '人员', share: 'ro', tell: 'note' }, { path: OTHER, note: 'not shared' }] });
  const ir = m.create({ title: 'IR2', ctx: [{ ref: co.id, note: '公司层' }, { path: '~/work/ir/README.md', note: 'own' }] });
  const out = m.renderContext(ir.id, {});
  const ctx = out.slice(out.indexOf('## Context'), out.indexOf('</vibespace-task-context>'));
  ok('the referenced rows come LAST, under the reference line', ctx.indexOf('own') < ctx.indexOf('The Context table of another Task Group — "公司"') && verdictOf(ctx.includes('— 2 rows it shares, below:')), ctx);
  ok('a row shared 可写 says you may edit it; a row shared 只读 is read-only here', gateOf(ctx.includes('术语表 (from the Task Group "公司", you may edit it)')) && verdictOf(ctx.includes('人员 (read-only: never modify it · from the Task Group "公司")')), ctx);
  ok('a row X did not mark shareable never travels', !ctx.includes('not shared'));
  const snap = m.snapshotForDiff(ir.id);
  const until = Date.now() + 5; while (Date.now() < until) { /* a later ms */ }
  m.update(co.id, { ctx: [...m.get(co.id).ctx, { path: '~/work/ir/CLAUDE.md', note: 'new shared', share: 'ro' }] });
  ok('an edit of X\'s table reaches the referencing group\'s gate (contentAtOf)', m.contentAtOf(ir.id) === m.get(co.id).ctxUpdatedAt && m.contentAtOf(ir.id) > m.get(ir.id).contentUpdatedAt);
  const d = m.diffChanges(ir.id, snap, {});
  ok('…and its diff re-tells the new shared row', gateOf(d) && gateOf(d.lines.some((l) => l.includes('new shared'))) && verdictOf(d.bits.includes('context table changed')), d);
  m.remove(co.id);
  ok('a referenced group that is gone is said', verdictOf(m.renderContext(ir.id, {}).includes('that group no longer exists')));
}

console.log('— lane lg-group-parents U4: a parent\'s 含子组 rows and standing rules ride to its descendants, read-only —');
{
  const { m } = fresh();
  ok('PURE: a row keeps 含子组 only when on; childRows hands it on read-only (its discover / notes stay its own)', TC.sanitizeRow({ path: IR, children: true }).children === true && !('children' in TC.sanitizeRow({ path: IR, children: 'yes' })) && JSON.stringify(TC.childRows([{ path: IR, note: 'n', tell: 'names', tags: ['discover', 'notes'], share: 'rw', children: true }, { path: OTHER, note: 'x', tags: [] }])) === JSON.stringify([{ path: IR, note: 'n', tell: 'names', tags: ['readonly'], share: null }]));
  const g = m.create({ title: '集团', objective: 'Grand rule: never push.', ctx: [{ path: OTHER, note: '合同库', children: true, tell: 'note' }] });
  const p = m.create({ title: '公司', objective: 'Parent rule: speak plainly.', parents: [g.id], ctx: [{ path: IR, note: '人员', children: true, tell: 'note' }, { path: '~/work/ir/README.md', note: 'not for children' }] });
  const c = m.create({ title: 'IR3', objective: 'Own rule.', parents: [p.id], ctx: [{ path: '~/work/ir/CLAUDE.md', note: 'own row' }] });
  const out = m.renderContext(c.id, {});
  const ctx = out.slice(out.indexOf('## Context'), out.indexOf('</vibespace-task-context>'));
  ok('the parent\'s 含子组 rows come after the child\'s own, under «Inherited from the parent Task Group», nearest parent first', ctx.indexOf('own row') < ctx.indexOf('Inherited from the parent Task Group "公司"') && ctx.indexOf('"公司"') < ctx.indexOf('Inherited from the parent Task Group "集团"') && verdictOf(ctx.includes('— 1 row it gives its child groups, below:')), ctx);
  ok('an inherited row is READ-ONLY and says where it comes from', gateOf(ctx.includes('人员 (read-only: never modify it · inherited from the parent Task Group "公司")')) && verdictOf(ctx.includes('合同库 (read-only: never modify it · inherited from the parent Task Group "集团")')), ctx);
  ok('a parent row NOT marked 含子组 never travels', !ctx.includes('not for children'));
  const head = out.slice(0, out.indexOf('## Context'));
  ok('the parents\' standing rules are told as «inherited», after the child\'s own, nearest first', head.indexOf('Own rule.') < head.indexOf('## Standing rules inherited from the parent Task Group "公司"') && gateOf(head.includes('Parent rule: speak plainly.')) && head.indexOf('"公司"') < head.indexOf('## Standing rules inherited from the parent Task Group "集团"') && verdictOf(head.includes('Grand rule: never push.')), head);
  ok('never the reverse: the parent is told nothing of its child', !m.renderContext(p.id, {}).includes('Own rule.') && !m.renderContext(p.id, {}).includes('own row'));
  const pv = m.contextPreview(c.id);
  ok('the window\'s preview carries them (rows marked `inherited`, the head names the parent; the block shows the rules)', gateOf(pv.rows.some((r) => r.inherited && r.from && r.from.id === p.id && r.i === null)) && gateOf(pv.rows.some((r) => r.parent === p.id)) && verdictOf(pv.block.includes('Parent rule: speak plainly.')), pv.rows);
  // a long parent rule is bounded, never evicting the child's own table
  const big = m.create({ title: 'Big', objective: 'x'.repeat(5000) });
  const k = m.create({ title: 'Kid', parents: [big.id] });
  const kh = m.renderContext(k.id, {});
  ok('a long inherited rule is cut at its bound and says so', gateOf(/… \(the rest — \d+ bytes — is cut here\)/.test(kh)) && !kh.includes('x'.repeat(1600)));
  // the gate and the diff
  const snap = m.snapshotForDiff(c.id);
  const until = Date.now() + 5; while (Date.now() < until) { /* a later ms */ }
  m.update(p.id, { objective: 'Parent rule: speak plainly, and briefly.' });
  ok('a parent\'s edit reaches the child\'s injection gate (contentAtOf — the child\'s own instant moves with it)', m.contentAtOf(c.id) >= m.get(p.id).contentUpdatedAt && m.get(c.id).contentUpdatedAt === m.get(p.id).contentUpdatedAt);
  const d = m.diffChanges(c.id, snap, {});
  ok('…and the child\'s diff re-tells the inherited rules', gateOf(d) && gateOf(d.bits.includes('inherited rules updated')) && verdictOf(d.lines.some((l) => l.includes('and briefly.'))), d);
  const snap2 = m.snapshotForDiff(c.id);
  m.update(p.id, { ctx: [...m.get(p.id).ctx, { path: '~/work/ir/HANDOFF.md', note: 'new for children', children: true }] });
  const d2 = m.diffChanges(c.id, snap2, {});
  ok('a parent row newly marked 含子组 is re-told in the child\'s diff', gateOf(d2) && verdictOf(d2.lines.some((l) => l.includes('new for children'))), d2);
  ok('a snapshot from before this release (no inherited hash) reads as «none inherited» — a group with no parent is not re-told', m.diffChanges(g.id, { ...m.snapshotForDiff(g.id), inhHash: undefined }, {}).lines.length === 0);
  const c2 = m.snapshotForDiff(c.id);
  m.update(c.id, { parents: [] });
  const d3 = m.diffChanges(c.id, c2, {});
  ok('dropping the parent re-tells the child: no inherited rules any more, the inherited rows removed', gateOf(d3) && gateOf(d3.lines.some((l) => l.includes('No standing rules are inherited'))) && !m.renderContext(c.id, {}).includes('Inherited from the parent'), d3);
  // a session in the child AND the parent: the parent's rules are told once, as itself
  m.update(c.id, { parents: [p.id] });
  const multi = m.renderMultiContext([c.id, p.id], {});
  ok('a multi-group injection tells a parent that is one of the session\'s own groups ONCE (as itself, not again as «inherited»)', (multi.match(/Parent rule: speak plainly, and briefly\./g) || []).length === 1 && verdictOf(multi.includes('### Standing rules inherited from the parent Task Group "集团"')), multi.slice(0, 2500));
}

console.log('— lane lg-group-parents U4: the adversarial read\'s findings —');
{
  const { m } = fresh();
  const P = m.create({ title: 'Par', objective: 'P rule.', ctx: [{ path: IR, note: 'PEOPLE', children: true, tell: 'note' }] });
  const C = m.create({ title: 'Bare child', parents: [P.id] });   // no Context row of its own
  const out = m.renderContext(C.id, {});
  const pv = m.contextPreview(C.id);
  ok('read 1 (BLOCKER): a child with NO table of its own is still told its parent\'s 含子组 rows (injection, preview, the file index)', gateOf(out.includes('PEOPLE (read-only: never modify it · inherited from the parent Task Group "Par")')) && gateOf(pv.rows.some((r) => r.inherited)) && m.contextIndexOf(C.id) !== null, out.slice(out.indexOf('## Context')));
  const at0 = m.contentAtOf(C.id);
  const until = Date.now() + 5; while (Date.now() < until) { /* a later ms */ }
  const s0 = m.snapshotForDiff(C.id);
  m.update(P.id, { archived: true });
  ok('read 2 (MAJOR): ARCHIVING the parent reaches the child\'s gate, and its diff says the rules and rows left', m.contentAtOf(C.id) > at0 && verdictOf((() => { const d = m.diffChanges(C.id, s0, {}); return d && d.bits.includes('inherited rules updated') && d.lines.some((l) => l.includes('No Context rows are inherited from the parent Task Group')); })()));
  m.update(P.id, { archived: false });
  const at1 = m.contentAtOf(C.id);
  const until2 = Date.now() + 5; while (Date.now() < until2) { /* a later ms */ }
  m.remove(P.id);
  ok('read 2: REMOVING the parent reaches the child\'s gate too', m.contentAtOf(C.id) > at1 && !m.renderContext(C.id, {}).includes('PEOPLE'));
  // read 3: ONE room for the whole injection, every line counted; a long chain is named in one bounded line
  let prev = null; const chain = [];
  for (let i = 0; i < 30; i++) { const g = m.create({ title: `A${i}`, objective: `rule ${i} `.repeat(40), ...(prev ? { parents: [prev] } : {}) }); chain.push(g.id); prev = g.id; }
  const leaf = m.create({ title: 'Leaf', parents: [prev] });
  const lh = m.renderContext(leaf.id, {});
  const ia = lh.indexOf('## Standing rules inherited'), ib = lh.indexOf('— not told here (no room left)');
  const inhBytes = ia >= 0 && ib > ia ? B(lh.slice(ia, ib)) : Infinity;
  ok('read 3 (MAJOR): thirty ancestors — the inherited rules stay inside ONE bound (headings counted) and the rest are NAMED in one line', inhBytes < 3400 && (lh.match(/also inherits the standing rules of .* and \d+ more — not told here/g) || []).length === 1, { inhBytes });
  const q1 = m.create({ title: 'Q1', objective: 'x'.repeat(1500) }), q2 = m.create({ title: 'Q2', objective: 'y'.repeat(1500) });
  const k1 = m.create({ title: 'K1', parents: [q1.id, q2.id] }), k2 = m.create({ title: 'K2', parents: [q1.id, q2.id] });
  const mm = m.renderMultiContext([k1.id, k2.id], {});
  ok('read 3: a multi-group injection SHARES the room — two children of the same two long parents tell each parent once, the second child names them «told above»', (mm.match(/x{200}/g) || []).length >= 1 && (mm.match(/### Standing rules inherited from the parent Task Group "Q1"/g) || []).length === 1 && verdictOf(mm.includes('(told above)')), mm.slice(0, 600));
  // read 4: one path, one permission — the nearer row wins
  const S = m.create({ title: 'Sharer', ctx: [{ path: OTHER, note: 'SHAREDROW', share: 'rw', children: true }] });
  const R4 = m.create({ title: 'Both ways', parents: [S.id], ctx: [{ ref: S.id, note: 'ref' }] });
  const r4 = m.renderContext(R4.id, {});
  ok('read 4: a path told by a reference (you may edit it) is not told again as inherited (read-only) — once, the nearer row', (r4.match(/SHAREDROW/g) || []).length === 1 && verdictOf(r4.includes('SHAREDROW (from the Task Group "Sharer", you may edit it)')), r4.slice(r4.indexOf('## Context')));
  // read 5: a multi injection of the child AND its parent tells the parent's rows once
  const P5 = m.create({ title: 'P5', ctx: [{ path: IR, note: 'P5ROW', children: true }] });
  const C5 = m.create({ title: 'C5', parents: [P5.id], ctx: [{ path: OTHER, note: 'C5ROW' }] });
  ok('read 5: [child, parent] in one injection — the parent\'s row is told once (as the parent\'s own)', (m.renderMultiContext([C5.id, P5.id], {}).match(/P5ROW/g) || []).length === 1);
  // read 7: switching 含子组 is not news to the group's own members
  const sp = m.snapshotForDiff(P5.id);
  m.update(P5.id, { ctx: [{ path: IR, note: 'P5ROW', children: false }] });
  ok('read 7: switching 含子组 off re-tells the PARENT\'s own members nothing', m.diffChanges(P5.id, sp, {}).lines.length === 0, m.diffChanges(P5.id, sp, {}));
  // read 8: the old write doors keep a row held only by 含子组
  const L8 = m.create({ title: 'L8', ctx: [{ path: IR, tags: ['discover'], children: true }] });
  m.update(L8.id, { folders: [] });
  ok('read 8: the old folders[] door keeps a row that only 含子组 holds', verdictOf(m.get(L8.id).ctx.some((r) => r.children === true)));
  // read 9: the agent\'s show answer carries the parents\' rules whole
  ok('read 9: `vibespace-task show` carries the inherited rules (the route and the CLI)', gateOf(/task: taskShowAnswer\(t, openSorted\), inheritedRules: inheritedRulesAnswer\(tasks\.inheritedRulesOf\(gid\)\)/.test(fs.readFileSync(new URL('../src/agent-routes.js', import.meta.url), 'utf-8'))) && verdictOf(/Standing rules inherited from the parent Task Group/.test(fs.readFileSync(new URL('../data/bin/vibespace-task', import.meta.url), 'utf-8'))));
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
  ok('a removed row is named; an added one is re-told at its depth', gateOf(d.lines.some((l) => l === `- Context row REMOVED: ${OTHER}`)) && gateOf(d.lines.some((l) => /- Context row ADDED — as told now:/.test(l))) && verdictOf(d.lines.some((l) => l.includes('  > Q&A for the roadshow.'))), d.lines);
  ok('a LITE (restored) snapshot whose table changed falls back to the full delivery', m.diffChanges(t.id, { ...snap, ctxRows: undefined }, {}) === null);
  ok('a snapshot from before the table (no hash) falls back too', m.diffChanges(t.id, { title: snap.title, objHash: snap.objHash, backlog: [], lastProgressAt: 0 }, {}) === null);
  // files under a row
  const s2 = m.snapshotForDiff(t.id), sig1 = m.contextSignature(t.id);
  mk('work/ir/new-note.md', 'n');
  m._walkCache = new Map(); m._sigCache = new Map();
  const sig2 = m.contextSignature(t.id);
  const d2 = m.diffChanges(t.id, s2, { oldSig: sig1, newSig: sig2 });
  ok('a file added under a 文件名 row is a one-line delta naming it', gateOf(d2) && verdictOf(d2.lines.some((l) => l === `- Files under ${IR} — new ${IR}/new-note.md`)), d2 && d2.lines);
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
  ok('show --full lists every row\'s files (+ the notes folder in the old shape)', ix.dir === path.join(IR, '共享资料') && ix.files.length === 2 && ix.rows.length >= 3 && verdictOf(ix.rows[0].files.some((f) => f.path === path.join(IR, 'draft.txt'))), ix.rows.map((r) => r.path));
  const ixr = m.contextIndexOf(id, '/remote/home/.vibespace/ctx/' + id);
  ok('a remote session reads the notes row through its synced copy', gateOf(ixr.dir.startsWith('/remote/home/.vibespace/ctx/')) && verdictOf(ixr.rows.some((r) => r.path.startsWith('/remote/home/.vibespace/ctx/'))), ixr.dir);
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
  ok('the migration\'s boot save is ON DISK when migrateContextRows returns — nothing owed, the rows in the file before any landing', !owedAfterMigrate && gateOf(Array.isArray(diskAtMigrate.tasks['T-260705-g1'].ctx)) && diskAtMigrate.tasks['T-260705-g1'].ctx.length === 2, { owedAfterMigrate });
  const disk = diskAtMigrate;
  ok('the old fields stay in the FILE one release (an older build still reads them)', JSON.stringify(disk.tasks['T-260705-g1'].folders) === JSON.stringify(legacy.tasks['T-260705-g1'].folders) && disk.tasks['T-260705-g1'].contextDir === legacy.tasks['T-260705-g1'].contextDir && verdictOf(Array.isArray(disk.tasks['T-260705-g1'].ctx)));
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
  ok('exportBundle carries the table, never the derived names', gateOf(Array.isArray(m.exportBundle().tasks[0].ctx)) && !('folders' in m.exportBundle().tasks[0]));
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
    gateOf(a.unchanged) && acts.length >= 2 && gateOf(acts.every((x) => x.name === 'task-groups.write' && x.rank === 0 && x.urgent)) && a.rec.durables.length === 0, { unchanged: a.unchanged, acts, durables: a.rec.durables });
  const bytes = JSON.parse(a.rec.owed.get(a.F).produce());
  ok('U5: the bytes are the store when the write is due — the note made after the create rides the same write', !!bytes.tasks[a.t.id] && verdictOf((bytes.tasks[a.t.id].progress || []).some((p) => p.note === 'u5 note')), Object.keys(bytes.tasks));
  const f0 = a.rec.flushes.length;   // (the scene's own constructor flushed its fresh store's boot save — counted from here: the should-5 cure)
  const m2 = new TaskGroupManager({ dataDir: a.d, homeDir: home, writer: a.rec });
  ok('U5: a store made AGAIN in the same process while its write is owed lands it first (ONE flush of that file), then reads it (the group and its note)', a.rec.flushes.length === f0 + 1 && a.rec.flushes[f0] === 'task-groups.json' && !!m2.get(a.t.id) && verdictOf(m2.get(a.t.id).progress.some((p) => p.note === 'u5 note')), { flushes: a.rec.flushes.slice(f0) });
  const saved = await a.m.persisted();
  a.rec.answer = false;
  const notSaved = await a.m.persisted();
  ok('U5: persisted() — what an act\'s route waits on — true once on disk, FALSE when the write did not land (the route says notOnDisk)', saved === true && notSaved === false, { saved, notSaved });
  // the U4/U5 cure: the route's answer rides the writer's SYNCHRONOUS road (answered in place — the hub's exit leaves in its
  // flush's own run), bounded UNDER the CLI's write budget (src/cli-call.js — a stalled mount answers «notOnDisk» in time)
  const BUDGET_W = require('../src/cli-call.js').BUDGETS.write;
  let inPlace = null; a.m.persisted((v) => { inPlace = v; });
  ok(`U5 cure: persisted(answer) answers IN PLACE through durable()'s answer, bounded under the CLI's ${BUDGET_W / 1000} s write budget`, inPlace === false && a.rec.opts.length === 3 && verdictOf(a.rec.opts.every((o) => o.timeoutMs > 0 && o.timeoutMs < BUDGET_W && typeof o.answer !== 'undefined')), a.rec.opts.map((o) => ({ timeoutMs: o.timeoutMs, answer: typeof o.answer })));
  // a BOOT save (the legacy tasks.json migrated forward) is on disk when the constructor returns
  const dB = path.join(root, 'u5-boot'); fs.mkdirSync(dB, { recursive: true });
  fs.writeFileSync(path.join(dB, 'tasks.json'), JSON.stringify({ version: 1, tasks: { 'T-1-u5': { id: 'T-1-u5', title: 'legacy u5', sessions: [], progress: [] } } }));
  const recB = standIn();
  new TaskGroupManager({ dataDir: dB, homeDir: home, writer: recB });
  ok('U5: a BOOT save (a legacy store migrated forward) is on disk when the constructor returns — the boot\'s migrations read the file next', gateOf(fs.existsSync(path.join(dB, 'task-groups.json'))) && !recB.pending(path.join(dB, 'task-groups.json')) && verdictOf(recB.flushes.includes('task-groups.json')), { flushes: recB.flushes });
  // RED CONTROL: the change removed — the old synchronous save (the writer bypassed, a mutant copy)
  const tgSrc = fs.readFileSync(path.join(path.dirname(fileURLToPathU5(import.meta.url)), '..', 'src/task-groups.js'), 'utf8');
  const aW = "  _writer() { return this._writerDep || require('./store-writer.js').storeWriter(); }";
  ok('U5 ANCHOR: the store\'s one writer line', tgSrc.split(aW).length === 2);
  const SyncTG = mutantCopies('task-groups-u5', path.resolve(path.dirname(fileURLToPathU5(import.meta.url)), '..')).load('src/task-groups.js', anchored(tgSrc, aW, "  _writer() { return { dirty: (f, o) => fs.writeFileSync(f, o.produce()), durable: async () => true, pending: () => false, flushSync: () => ({ written: [], left: [] }) }; }", 'tg-sync-save'), 'sync-save');
  const r = scene(SyncTG.TaskGroupManager, 'red');
  ok('U5 CONTROL: the old synchronous save (the writer bypassed) ⇒ task-groups.json is written on the main thread at the change — the first check above would be red', !r.unchanged);
  // A writer stand-in whose landing is HELD once armed: flushSync leaves the file (said), afterLanding keeps its steps; `land()` = the
  // storage answers (the file written — the steps are run only when the scene says so: a kill between the rename and the step)
  const heldWriter = () => {
    const st = { armed: false, steps: [] }, owed = new Map();
    const W = { st, owed, dirty: (f, o) => owed.set(f, o), durable: () => Promise.resolve(!st.armed), pending: (f) => owed.has(f),
      flushSync: (files) => { const left = []; for (const f of files || [...owed.keys()]) { const o = owed.get(f); if (!o) continue; if (st.armed) { left.push({ file: f, name: o.name, why: 'held by the storage at the bound (a stand-in)' }); continue; } fs.writeFileSync(f, o.produce()); owed.delete(f); } return { written: [], left, ms: 0 }; },
      afterLanding: (file, step) => { if (!st.armed && !owed.has(file)) { const value = step(); return Promise.resolve({ landed: true, value }); } st.steps.push(step); return new Promise(() => { }); } };
    return W;
  };
  const plainWriter = () => ({ dirty() { }, durable: () => Promise.resolve(true), pending: () => false, flushSync: () => ({ written: [], left: [], ms: 0 }) });
  // THE CENSUS CURE (主开发 2026-11-19 08:56Z, the hunt's finding 4): THE BASE'S ORDER BACK — a group's removal cleans the other stores
  // FIRST (its archived Activity log, its visibility row), then the record (the release is the oracle). A kill before the record lands
  // brings the group back WITHOUT them (the safe side); the record landed and the process killed before anything else ran leaves
  // NOTHING a group made again under the same id would inherit. RED (anchored): the chain's reversed order (the cleanup riding the landing)
  const rmScene = (Mgr, tag) => {
    const d = path.join(root, 'u5-rm-' + tag); fs.mkdirSync(d, { recursive: true });
    const W = heldWriter();
    const m = new Mgr({ dataDir: d, homeDir: home, writer: W });
    const t = m.create({ title: 'u5 removal' });
    W.flushSync();   // the group on disk
    const arch = path.join(m._archiveRoot, t.id); fs.mkdirSync(arch, { recursive: true }); fs.writeFileSync(path.join(arch, 'log.jsonl'), '{"note":"kept words"}\n');
    W.st.armed = true;
    let err = null; try { m.remove(t.id); } catch (e) { err = e; }
    const atAct = { err: err ? err.code || err.message : null, archive: fs.existsSync(arch) };
    // A START before the record lands (a kill first): the disk still holds the group
    let atStart = false; try { new Mgr({ dataDir: d, homeDir: home, writer: plainWriter() }).get(t.id); atStart = true; } catch { atStart = false; }
    // the record LANDS — and the process dies before anything else runs (a riding step never runs)
    W.st.armed = false; W.flushSync(); W.st.steps = [];
    const m2 = new Mgr({ dataDir: d, homeDir: home, writer: plainWriter() });
    let gone = false; try { m2.get(t.id); } catch { gone = true; }
    const t2 = m2.create({ title: 'u5 removal' });
    return { ...atAct, atStart, gone, sameId: t2.id === t.id, inherited: fs.existsSync(path.join(m2._archiveRoot, t2.id, 'log.jsonl')) };
  };
  const rmOk = rmScene(TaskGroupManager, 'real');
  ok('THE BASE\'S ORDER (finding 4): a removal cleans its archived Activity log at the act, before the record — a start before the record lands finds the group back WITHOUT it (the safe side)', !rmOk.err && !rmOk.archive && verdictOf(rmOk.atStart), rmOk);
  ok('…and the record landed with a kill right after it: a group made again under the SAME id inherits no Activity log (nothing outlives the record)', gateOf(rmOk.gone) && gateOf(rmOk.sameId) && !rmOk.inherited, rmOk);
  const TOUCH_RM = "    const touched = this._touchDescendants(id, Date.now());   // lane lg-group-parents U4: the descendants are told without it (the cure (E): each named in the notice)\n";   // lane lg-group-parents U4 (restack 415): the descendants are told between the cleanup and the record
  const BASE_RM = "    if (archivableId(id)) { this._archiveDrop(id); fs.rmSync(path.join(this._archiveRoot, id), { recursive: true, force: true }); }\n" + TOUCH_RM + "    delete this._state.tasks[id];\n";   // B-0248 step 3 (c): the removal drops what its archive is owed first
  const RideRm = mutantCopies('task-groups-ride', path.resolve(path.dirname(fileURLToPathU5(import.meta.url)), '..')).load('src/task-groups.js', anchored(tgSrc, BASE_RM, TOUCH_RM + "    delete this._state.tasks[id];\n    require('./store-writer.js').ride(this._writer(), this._file, () => { if (archivableId(id)) fs.rmSync(path.join(this._archiveRoot, id), { recursive: true, force: true }); });   // MUTANT: the chain's reversed order\n", 'the removal cleans first'), 'rm-rides');
  const rmX = rmScene(RideRm.TaskGroupManager, 'red');
  ok('CONTROL (a copy whose cleanup rides the record\'s landing — the reversed order): the record lands, the step never runs, and a group made again under the same id INHERITS the old Activity log (red)', gateOf(rmX.sameId) && verdictOf(rmX.inherited), rmX);
  // THE CENSUS CURE (the hunt's finding 3), OFF THE LOOP SINCE B-0248 step 3 (r1436): the archived conversations' unbind is HANDED to
  // the store writer — the pass waits on no synchronous flush — and THE BASELINE LAW STANDS: from the hand-off until the store says it
  // holds the unbind (persisted() true), its keys stay OUT of the baseline; a failed landing keeps them out and the next pass hands it
  // again; a landed one puts them back. A conversation bound AGAIN meanwhile stays (the person's later act wins).
  // REDS (anchored): the release's synchronous landing (one flushSync in the pass) · a copy that never keeps the keys owed (in the
  // baseline at the hand-off, before the store holds the unbind)
  const tickA = () => new Promise((r) => setImmediate(r));
  const archScene = async (Mgr, tag, { rebind = false } = {}) => {
    const d = path.join(root, 'u5-arch-' + tag); fs.mkdirSync(d, { recursive: true });
    const W = heldWriter(), st = { archivedSessions: [] };
    const land = W.flushSync; let flushes = 0; W.flushSync = (...a) => { flushes++; return land(...a); };   // a flushSync on the main thread, counted
    const m = new Mgr({ dataDir: d, homeDir: home, writer: W, readUserState: () => st, isLiveKey: () => false });
    const t = m.create({ title: 'u5 archive' }); m.bind(t.id, 'claude:arch1'); land();
    const file = path.join(d, 'task-groups.json');
    const disk = () => JSON.parse(fs.readFileSync(file, 'utf8')).tasks[t.id].sessions;
    const inBase = () => !!(m._archSeen && m._archSeen.has('claude:arch1'));
    W.st.armed = true;   // the storage does not answer: a landing asked now answers false
    flushes = 0;
    const first = m.noteArchived(['claude:arch1']);
    const pass = { first, flushes, member: disk().includes('claude:arch1'), owedAtPass: W.pending(file), inBaseline: inBase() };
    await tickA();   // the landing answered (false: held)
    const failed = { inBaselineAfterFail: inBase(), keptOwed: m._archOwed.has('claude:arch1') };
    W.st.armed = false; land();   // the writer's thread writes the owed store (the stand-in writes only when asked)
    if (rebind) m.bind(t.id, 'claude:arch1');
    m.noteArchived(['claude:arch1']);   // the next user-state write: hands the landing again
    await tickA();
    return { ...pass, ...failed, flushesAll: flushes, memberAfter: disk().includes('claude:arch1'), memberInMemory: m.get(t.id).sessions.includes('claude:arch1'), owedAfter: W.pending(file), inBaselineAfter: inBase() };
  };
  const ar = await archScene(TaskGroupManager, 'real');
  ok('B-0248 step 3: an archived conversation\'s unbind is HANDED to the store writer — the pass waits on no synchronous flush (0), the write owed, the member still on disk at the pass', gateOf(Array.isArray(ar.first)) && ar.first.length === 1 && ar.flushes === 0 && gateOf(ar.owedAtPass) && verdictOf(ar.member), ar);
  ok('FINDING 3, kept: its key stays OUT of the baseline from the hand-off, and a landing that answers false keeps it owed (never «done» for an unbind the disk does not hold)', !ar.inBaseline && !ar.inBaselineAfterFail && verdictOf(ar.keptOwed), ar);
  ok('…and once the store holds it, the next pass\'s landing puts the key back into the baseline: nothing owed, the member gone from the disk, still no synchronous flush', !ar.memberAfter && !ar.owedAfter && gateOf(ar.inBaselineAfter) && ar.flushesAll === 0, ar);
  const arB = await archScene(TaskGroupManager, 'rebind', { rebind: true });
  ok('…a conversation bound AGAIN meanwhile stays a member (the owed unbind is not retried over the person\'s later act)', gateOf(arB.memberInMemory) && verdictOf(arB.inBaselineAfter), arB);
  const ARCH_HAND = "    if (changed.length) { const gen = ++this._archGen; for (const k of due) this._archOwed.set(k, gen); }   // each key owed BY ITS UNBIND (a later one is a later generation)\n    if (this._archOwed.size) this._landArchived();\n";
  const SyncLand = mutantCopies('task-groups-arch', path.resolve(path.dirname(fileURLToPathU5(import.meta.url)), '..'));
  const ArchSync = SyncLand.load('src/task-groups.js', anchored(tgSrc, ARCH_HAND, "    if (changed.length || this._archOwed.size) {\n      const L = this._landNow('the archived conversations\\' unbind');\n      if (L.ok) this._archOwed.clear();\n      else for (const k of due) this._archOwed.set(k, 0);\n    }\n", 'the archive unbind handed to the writer'), 'arch-sync');   // the RELEASE's landing, written back on purpose (the red) — stale-pins: kept
  const arS = await archScene(ArchSync.TaskGroupManager, 'red-sync');
  ok('CONTROL (the release\'s landing, a copy): the pass flushes the whole store synchronously on the main thread (red)', arS.flushes >= 1, arS);
  const ArchNoOwe = SyncLand.load('src/task-groups.js', anchored(tgSrc, ARCH_HAND, "    if (this._archOwed.size) this._landArchived();\n", 'the owed keys at the hand-off'), 'arch-noowe');
  const arX = await archScene(ArchNoOwe.TaskGroupManager, 'red-noowe');
  ok('CONTROL (a copy that never keeps the keys owed): the key enters the baseline at the hand-off, before the store holds the unbind (red)', verdictOf(arX.inBaseline), arX);
  // THE READ'S CURES (B-0248 step 3): a landing settles the unbinds made BEFORE it (a key owed by its generation), passes meanwhile ask
  // again AFTER it (one landing in flight), and a person's re-add through a whole members write wins as bind() does. A GATED writer: each
  // durable() waits until the scene answers it (the writer's thread is slow); flushSync lands the bytes.
  const gateWriter = () => {
    const owed = new Map(), asks = [];
    return { owed, asks, dirty: (f, o) => owed.set(f, o), pending: (f) => owed.has(f), durable: () => new Promise((r) => asks.push(r)),
      flushSync: (files) => { for (const f of files || [...owed.keys()]) { const o = owed.get(f); if (o) { fs.writeFileSync(f, o.produce()); owed.delete(f); } } return { written: [], left: [], ms: 0 }; },
      answer: (v) => { const r = asks.shift(); if (r) r(v); return !!r; } };
  };
  const gateScene = async (Mgr, tag) => {
    const d = path.join(root, 'u5-gate-' + tag); fs.mkdirSync(d, { recursive: true });
    const W = gateWriter(), st = { archivedSessions: [] };
    const m = new Mgr({ dataDir: d, homeDir: home, writer: W, readUserState: () => st, isLiveKey: () => false });
    const t = m.create({ title: 'u5 gate' }); m.bind(t.id, 'claude:g1'); W.flushSync();
    const owedK = () => (m._archOwed && typeof m._archOwed.has === 'function' ? m._archOwed.has('claude:g1') : false);
    const inBase = () => !!(m._archSeen && m._archSeen.has('claude:g1'));
    const out = {};
    // (a) two passes while ONE landing is in flight: one durable() asked (the second pass owes nothing new: the first landing covers it)
    m.noteArchived(['claude:g1']); m.noteArchived(['claude:g1']);
    out.asksDuring = W.asks.length;
    W.flushSync(); W.answer(true); await tickA(); await tickA();
    out.asksAfter = W.asks.length;
    out.afterA = { owed: owedK(), inBase: inBase() };
    // (b) a NEWER unbind of the same key while an older landing is in flight: the older landing never settles the newer one
    m.bind(t.id, 'claude:g1'); m.noteArchived([]);            // bound again, then unarchived
    m.noteArchived(['claude:g1']);                            // archived again: unbind 1 (its landing L1 asked)
    m.bind(t.id, 'claude:g1'); m.noteArchived([]);            // bound again (L1 still in flight), unarchived
    m.noteArchived(['claude:g1']);                            // archived again: unbind 2 (owed by a newer generation; asks after L1)
    W.answer(true); await tickA(); await tickA();             // L1 answers true — for the older unbind
    out.afterOld = { owed: owedK(), inBase: inBase() };
    W.flushSync(); while (W.answer(true)) { await tickA(); await tickA(); }
    out.afterNew = { owed: owedK(), inBase: inBase() };
    // (c) a person writes the members WHOLE (PATCH sessions) while an unbind is owed: the re-add wins, the next pass leaves it a member
    m.bind(t.id, 'claude:g1'); m.noteArchived([]); m.noteArchived(['claude:g1']);   // archived: unbind owed, its landing asked
    m.update(t.id, { sessions: [...m.get(t.id).sessions, 'claude:g1'] });            // the person adds it back (the members list whole)
    m.noteArchived(['claude:g1']);                                                   // the next user-state write, the old unbind's landing still in flight
    W.flushSync(); while (W.answer(true)) { await tickA(); await tickA(); }
    out.afterReadd = { member: m.get(t.id).sessions.includes('claude:g1'), owed: owedK() };
    return out;
  };
  const gs = await gateScene(TaskGroupManager, 'real');
  ok('two passes while one landing is in flight ask ONE durable() (the second owes nothing new); once it answers nothing is owed, nothing more is asked, and the key is in the baseline', gs.asksDuring === 1 && gs.asksAfter === 0 && !gs.afterA.owed && verdictOf(gs.afterA.inBase), gs);
  ok('a NEWER unbind of the same key is not settled by the older landing (still owed, out of the baseline); its own landing settles it', gateOf(gs.afterOld.owed) && !gs.afterOld.inBase && !gs.afterNew.owed && verdictOf(gs.afterNew.inBase), gs);
  ok('a person\'s re-add through a whole members write (PATCH sessions) wins over an owed unbind: still a member after the next pass', gateOf(gs.afterReadd.member) && !gs.afterReadd.owed, gs);
  const SETTLE = "if (this._archOwed.get(k) === gen) { this._archOwed.delete(k); if (";
  const ArchByName = SyncLand.load('src/task-groups.js', anchored(tgSrc, SETTLE, "if (this._archOwed.delete(k)) { if (", 'the landing settles by generation'), 'arch-byname');
  const gsN = await gateScene(ArchByName.TaskGroupManager, 'red-byname');
  ok('CONTROL (a copy that settles by NAME): the older landing takes the newer unbind\'s key out of the owed set while it is not on disk (red)', !gsN.afterOld.owed, gsN);
  const REBOUND = "{ t.sessions = sanitizeStrArray(patch.sessions, 2000); this._archRebound(t.sessions); }";
  const ArchNoRebound = SyncLand.load('src/task-groups.js', anchored(tgSrc, REBOUND, "t.sessions = sanitizeStrArray(patch.sessions, 2000);", 'a whole members write re-adds'), 'arch-norebound');
  const gsR = await gateScene(ArchNoRebound.TaskGroupManager, 'red-norebound');
  ok('CONTROL (a copy whose whole members write does not count as a re-add): the next pass unbinds the person\'s re-add again (red)', !gsR.afterReadd.member, gsR);
  // r1699 (1)(2): THE OTHER ROADS THAT RE-ADD A MEMBER — a group CREATED with it, a config IMPORT naming it — win over an owed unbind
  // as bind() does; and a landing whose promise the writer REFUSES leaves the unbind owed and the next pass asks again (nothing stuck)
  const readdScene = async (Mgr, tag, road) => {
    const d = path.join(root, 'fu-readd-' + tag); fs.mkdirSync(d, { recursive: true });
    const W = gateWriter(), st = { archivedSessions: [] };
    const m = new Mgr({ dataDir: d, homeDir: home, writer: W, readUserState: () => st, isLiveKey: () => false });
    const t = m.create({ title: 'fu readd' }); m.bind(t.id, 'claude:r1'); W.flushSync();
    m.noteArchived(['claude:r1']);   // archived: its unbind owed (the landing asked, not answered)
    let gid = t.id;
    if (road === 'create') gid = m.create({ title: 'fu new', sessions: ['claude:r1'] }).id;
    else m.importBundle({ version: 1, tasks: [{ ...m.get(t.id), sessions: ['claude:r1'] }] }, { log: () => {} });
    m.noteArchived(['claude:r1']);   // the next user-state write, the old unbind still on its way
    W.flushSync(); while (W.answer(true)) { await tickA(); await tickA(); }
    return { member: m.get(gid).sessions.includes('claude:r1'), owed: m._archOwed.has('claude:r1') };
  };
  const rc = await readdScene(TaskGroupManager, 'create', 'create');
  ok('a group CREATED with a member whose archive unbind is owed keeps it at the next pass (the creation is a re-add)', gateOf(rc.member) && !rc.owed, rc);
  const CREATE_RB = "    this._archRebound(t.sessions);   // B-0248 step 3 follow (r1699 (1))";
  const NoCreate = SyncLand.load('src/task-groups.js', anchored(tgSrc, CREATE_RB, '    void 0;   // (cut)', 'the creation re-adds'), 'fu-nocreate');
  const rcX = await readdScene(NoCreate.TaskGroupManager, 'create-red', 'create');
  ok('CONTROL (a copy whose creation is no re-add): the next pass unbinds the member named at the creation (red)', !rcX.member, rcX);
  const ri = await readdScene(TaskGroupManager, 'import', 'import');
  ok('a config IMPORT naming a member whose archive unbind is owed keeps it at the next pass (the import is a re-add)', gateOf(ri.member) && !ri.owed, ri);
  const IMPORT_RB = "      for (const id of late) if (this._state.tasks[id]) this._archRebound(this._state.tasks[id].sessions);";
  const NoImport = SyncLand.load('src/task-groups.js', anchored(tgSrc, IMPORT_RB, '      void 0;   // (cut)', 'the import re-adds'), 'fu-noimport');
  const riX = await readdScene(NoImport.TaskGroupManager, 'import-red', 'import');
  ok('CONTROL (a copy whose import is no re-add): the next pass unbinds the imported member (red)', !riX.member, riX);
  const rejectScene = async (Mgr, tag) => {
    const d = path.join(root, 'fu-reject-' + tag); fs.mkdirSync(d, { recursive: true });
    const W = gateWriter(), st = { archivedSessions: [] };
    const m = new Mgr({ dataDir: d, homeDir: home, writer: W, readUserState: () => st, isLiveKey: () => false });
    const t = m.create({ title: 'fu reject' }); m.bind(t.id, 'claude:j1'); W.flushSync(); void t;
    let asks = 0; m.persisted = () => { asks++; return asks === 1 ? Promise.reject(new Error('the writer refused (a stand-in)')) : Promise.resolve(true); };
    const swallow = () => {}; process.on('unhandledRejection', swallow);   // a copy without the refusal arm leaves one unhandled: the red's own, not a crash
    try {
      m.noteArchived(['claude:j1']);   // its landing asked: the promise REFUSES
      await tickA(); await tickA();
      const after1 = { landing: m._archLanding, owed: m._archOwed.has('claude:j1'), asks };
      m.noteArchived(['claude:j1']);   // the next pass asks again
      await tickA(); await tickA();
      return { after1, asks, owedAfter: m._archOwed.has('claude:j1'), inBase: !!(m._archSeen && m._archSeen.has('claude:j1')) };
    } finally { await tickA(); process.off('unhandledRejection', swallow); }
  };
  const rj = await rejectScene(TaskGroupManager, 'real');
  ok('a landing whose promise the writer REFUSES: nothing stuck (no landing in flight), the unbind still owed; the next pass asks again, lands, and the key enters the baseline', rj.after1.landing === false && gateOf(rj.after1.owed) && rj.asks === 2 && !rj.owedAfter && verdictOf(rj.inBase), rj);
  const REJECT_ARM = "    this.persisted().then(settle, () => settle(false));";
  const NoArm = SyncLand.load('src/task-groups.js', anchored(tgSrc, REJECT_ARM, '    this.persisted().then(settle);', 'the refusal arm'), 'fu-noarm');
  const rjX = await rejectScene(NoArm.TaskGroupManager, 'red');
  ok('CONTROL (a copy without the refusal arm): the refused landing stays «in flight» for good and the next pass never asks again (red)', rjX.after1.landing === true && rjX.asks === 1, rjX);
}

{ const rEnd = require('../src/store-writer.js').storeWriter().flushSync(); if (rEnd.left && rEnd.left.length) ok('the store writer\'s owed writes land before the scratch root goes', false, rEnd.left); }   // lane lg-store-writes U5 (loud: the U4/U5 cure, should 6)
fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${failed ? failed + ' FAILED' : 'all passed'} (${passed} passed)`);
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
