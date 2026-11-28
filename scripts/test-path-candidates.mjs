#!/usr/bin/env node
// PATH CANDIDATES (lane path-field — L1 of the New Session train; the owner accepted POC v2.2 on 2026-10-23). Fast, PURE:
// the POC's rank-test (area-first-new-conversation poc2/rank-test.cjs) ported with its fixture and its case table as they
// were — the same machines, the same Task Groups, the same queries, the same winners:
//   ① the 13 measured cases keep their winners and resolutions (`ir q3`, `pay`, `合同` via a link alias, `~/wo`,
//     `work/pay` relative, `Q3` under a group, `草稿` two resolutions, empty + a name, `IR Q3`, `invrel`, `董事会`,
//     `条款版本` under the second of two groups)
//   ② two / three Task Groups selected: ① = every selected group's folders in selection order, ② = one
//     <group folder>/<name> per selected group in selection order + ~/<name>; a bare typed word plays the name; a path
//     never makes name rows; the bases follow the selection order
//   ③ files (a field that takes files): handbook.md resolves against the row above, as a file; a folder-only field does
//     not take it; fuzzy over files finds it first
//   ④ a remote machine gets the SAME recommendations, computed for it (groupOn): a folder that exists there (probed), one
//     declared for it (`host::/path`, no probe), one absent (kept, greyed, the create road); 由名字 under each group's
//     folder THERE + its home; its recents with counts; its volumes
//   ⑤ the exclusion rule (ADDENDUM, study round 4 — a fresh pod preselected the product's own checkout): the checkout,
//     its data dir and dot-folders are never offered unasked (empty, fuzzy, the listing); typed explicitly they still
//     resolve; a Task Group folder or a recent one the person made stays theirs — RED CONTROL: without `self` the
//     checkout (the folder with the most files) is offered
//   ⑥ resolveRelative's line + missingVerdict (parent there ⇒ create; parent missing ⇒ said) + groupOn here drops the
//     folders declared for another machine + fuzzyFilter (the hub's side) keeps the field's order
//   ⑦ B-d833's fourth shape: isPathText (the one predicate), textCandidates, lineAnswerOf, textVerdict as rows (exact beats a
//     completion; skipped with its time), the law seeded over 1500 cases — RED CONTROLS: a late one called absent, a completion that
//     stops the walk, a failed one called absent
// Run: node scripts/test-path-candidates.mjs
import './scratch.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const api = require('../src/path-candidates.js');

let bad = 0, n = 0;
const ok = (name, cond, got) => { if (typeof cond !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); n++; if (!cond) bad++; console.log(`${cond ? 'ok ' : 'BAD'} ${name}${cond ? '' : '  got ' + JSON.stringify(got)}`); };

/* ═══ the fake machines (the POC's, as they were) ═══ */
const F = (name, size, when) => ({ name, size, when });
function localFS() {
  const dirs = {
    '~': { kids: ['work', 'code', 'company', 'Downloads', 'Documents', 'Desktop', 'notes'], files: [F('.bashrc', '3.7 KB', '上月')] },
    '~/work': { kids: ['investor-relations', 'compute-deal', 'hr-comp', 'weekly-admin', 'contracts', 'payments', '草稿'], files: [F('我的工作笔记.md', '1.7 KB', '今天 08:40')] },
    '~/work/investor-relations': { n: 14, newest: '2 小时前', kids: ['Q3-董事会材料', '会议纪要', '草稿', '共享资料'], files: [F('投资人月报-10月.docx', '86 KB', '昨天'), F('估值模型-v7.xlsx', '312 KB', '3 天前'), F('股东名册.xlsx', '48 KB', '上周'), F('融资时间线.md', '3.1 KB', '上周'), F('路演问答.md', '9.4 KB', '2 周前'), F('审计函-2025.pdf', '1.1 MB', '上月')] },
    '~/work/investor-relations/Q3-董事会材料': { n: 7, newest: '2 小时前', kids: [], files: [F('Q3-董事会材料.pptx', '4.2 MB', '2 小时前'), F('财务摘要-Q3.xlsx', '96 KB', '2 小时前'), F('讲稿.md', '6 KB', '昨天'), F('附录-客户数据.xlsx', '220 KB', '昨天'), F('封面.png', '410 KB', '3 天前')] },
    '~/work/investor-relations/会议纪要': { n: 6, newest: '10-15', kids: [], files: [F('2026-10-15-董事会.md', '12 KB', '10-15'), F('2026-09-18-董事会.md', '10 KB', '09-18'), F('2026-08-21-投资人电话.md', '6 KB', '08-21')] },
    '~/work/investor-relations/草稿': { n: 3, newest: '昨天', kids: [], files: [F('致股东信-草稿.docx', '31 KB', '昨天'), F('问答补充.md', '2 KB', '3 天前')] },
    '~/work/investor-relations/共享资料': { n: 5, newest: '今天 08:10', kids: [], files: [F('进度与交接.md', '4 KB', '今天 08:10'), F('handbook.md', '2.1 KB', '上周'), F('数字口径表.xlsx', '40 KB', '上周'), F('术语表.md', '3 KB', '上周')] },
    '~/work/compute-deal': { n: 10, newest: '昨天', kids: ['条款版本'], files: [F('算力报价对比.xlsx', '72 KB', '2 天前'), F('给IR的数字.md', '0.6 KB', '昨天'), F('SLA-草案.docx', '58 KB', '3 天前'), F('机房参观笔记.md', '4 KB', '上周')] },
    '~/work/compute-deal/条款版本': { n: 5, newest: '昨天', kids: [], files: [F('条款表-v4-红线.pdf', '640 KB', '昨天'), F('条款表-v3.pdf', '610 KB', '上周')] },
    '~/work/hr-comp': { n: 5, newest: '3 天前', kids: [], files: [F('薪酬带宽-2026.xlsx', '40 KB', '3 天前'), F('Q4-招聘计划.docx', '31 KB', '上周')] },
    '~/work/weekly-admin': { n: 11, newest: '今天 09:12', kids: [], files: [F('周报-10-20.md', '6 KB', '今天 09:12'), F('报销单-10月.xlsx', '18 KB', '昨天'), F('待办.md', '2 KB', '昨天')] },
    '~/work/contracts': { n: 23, newest: '2 天前', kids: [], files: [F('翻译服务协议-已签.pdf', '1.4 MB', '2 天前'), F('签署跟踪表.xlsx', '36 KB', '2 天前'), F('保密协议-模板.docx', '44 KB', '上周'), F('办公室租约.pdf', '3.6 MB', '上月')] },
    '~/work/payments': { n: 12, newest: '上周', kids: ['2026-10', '发票'], files: [F('付款审批-10月.xlsx', '27 KB', '上周'), F('供应商银行信息.xlsx', '12 KB', '上月')] },
    '~/work/payments/2026-10': { n: 4, newest: '上周', kids: [], files: [F('付款计划.xlsx', '14 KB', '上周')] },
    '~/work/payments/发票': { n: 31, newest: '上周', kids: [], files: [F('发票-0001.pdf', '210 KB', '上周'), F('发票-0002.pdf', '198 KB', '上周')] },
    '~/work/草稿': { n: 2, newest: '4 天前', kids: [], files: [F('随手记.md', '1 KB', '4 天前'), F('发言提纲.docx', '18 KB', '上周')] },
    '~/code': { kids: ['ir-dashboard', 'finance-scripts'], files: [] },
    '~/code/ir-dashboard': { n: 38, newest: '上周', git: true, kids: ['src'], files: [F('README.md', '2 KB', '上周'), F('package.json', '1 KB', '上周')] },
    '~/code/ir-dashboard/src': { n: 31, newest: '上周', kids: [], files: [F('main.ts', '6 KB', '上周')] },
    '~/code/finance-scripts': { n: 6, newest: '上月', git: true, kids: [], files: [F('对账.py', '9 KB', '上月'), F('README.md', '1 KB', '上月')] },
    '~/company': { n: 4, newest: '上周', kids: ['草稿'], files: [F('通用规则.md', '1.1 KB', '上周'), F('术语表.md', '6 KB', '上周'), F('人员.md', '3 KB', '2 周前')] },
    '~/company/草稿': { n: 1, newest: '上月', kids: [], files: [F('内部草稿.md', '2 KB', '上月')] },
    '~/Downloads': { n: 41, newest: '1 小时前', kids: [], files: [F('条款表-v5.pdf', '702 KB', '1 小时前'), F('会议照片.jpg', '2.4 MB', '今天'), F('报价单-供应商B.pdf', '330 KB', '昨天')] },
    '~/Documents': { n: 8, newest: '3 周前', kids: [], files: [F('个人报税-2025.pdf', '1.2 MB', '3 周前')] },
    '~/Desktop': { n: 0, kids: [], files: [] },
    '~/notes': { n: 0, kids: [], files: [] },
    '~/vibespace-mounts/公司云盘': { mount: 'Google Drive', n: 312, newest: '昨天', kids: ['财务', '法务', '产品资料'], files: [F('团队通讯录.xlsx', '52 KB', '昨天')] },
    '~/vibespace-mounts/公司云盘/财务': { n: 120, newest: '昨天', kids: [], files: [F('2026-预算.xlsx', '420 KB', '昨天')] },
    '~/vibespace-mounts/公司云盘/法务': { n: 64, newest: '上周', kids: [], files: [F('合同模板库.docx', '210 KB', '上周')] },
    '~/vibespace-mounts/公司云盘/产品资料': { n: 126, newest: '4 天前', kids: [], files: [F('产品手册-v3.pdf', '6.1 MB', '4 天前')] },
  };
  /* the zh alias row: a link ~/合同 → ~/work/contracts (people keep short zh names to long folders) */
  const links = { '~/合同': '~/work/contracts' };
  return { machine: null, home: '/home/me', dirs, links, mounts: ['~/vibespace-mounts/公司云盘'] };
}
function macFS() {
  const dirs = {
    '~': { kids: ['Projects', 'work', 'Downloads', 'Documents', 'Desktop'], files: [] },
    '~/Projects': { kids: ['website', 'app-ios'], files: [] },
    /* the IR folder is synced to the Mac too (a probe finds it); the compute-deal one is not */
    '~/work': { kids: ['investor-relations'], files: [] },
    '~/work/investor-relations': { n: 9, newest: '昨天', kids: ['共享资料'], files: [F('投资人月报-10月.docx', '86 KB', '昨天'), F('估值模型-v7.xlsx', '312 KB', '3 天前')] },
    '~/work/investor-relations/共享资料': { n: 4, newest: '今天 08:10', kids: [], files: [F('进度与交接.md', '4 KB', '今天 08:10')] },
    '~/Documents/算力合同': { n: 6, newest: '2 天前', kids: [], files: [F('条款表-v4-红线.pdf', '640 KB', '2 天前')] },
    '/Volumes/工作盘': { mount: '外接硬盘', n: 88, newest: '上周', kids: ['素材'], files: [F('素材清单.xlsx', '30 KB', '上周')] },
    '/Volumes/工作盘/素材': { n: 80, newest: '上周', kids: [], files: [F('发布会-封面.psd', '48 MB', '上周')] },
    '~/Projects/website': { n: 54, newest: '3 天前', git: true, kids: ['content'], files: [F('README.md', '2 KB', '3 天前')] },
    '~/Projects/website/content': { n: 40, newest: '3 天前', kids: [], files: [F('about.md', '4 KB', '3 天前')] },
    '~/Projects/app-ios': { n: 210, newest: '上周', git: true, kids: [], files: [F('Package.swift', '1 KB', '上周')] },
    '~/Downloads': { n: 12, newest: '昨天', kids: [], files: [F('发布会照片.zip', '88 MB', '昨天')] },
    '~/Documents': { n: 30, newest: '上周', kids: ['算力合同'], files: [F('报价.pages', '1 MB', '上周')] },
    '~/Desktop': { n: 3, newest: '今天', kids: [], files: [F('截图.png', '400 KB', '今天')] },
  };
  /* macOS shows these folders by their zh names */
  return { machine: 'my-mac', home: '/Users/me', dirs, links: {}, mounts: ['/Volumes/工作盘'], localized: { '~/Downloads': '下载', '~/Documents': '文稿', '~/Desktop': '桌面' } };
}
const COLORS = ['#2dd4bf', '#3b82f6', '#f59e0b', '#ec4899', '#a78bfa'];
/* the POC's five Task Groups — folders / context as its Context table derived them (自动发现会话 / agent 在这里记笔记 rows);
   算力合同谈判 declares a folder FOR A MACHINE (task-groups.js keeps `host::/path`) */
const GROUPS = () => [
  { id: 'g-ir', name: '投资者关系', color: COLORS[0], folders: ['~/work/investor-relations'], context: '~/work/investor-relations/共享资料' },
  { id: 'g-wk', name: '周报与行政', color: COLORS[1], folders: ['~/work/weekly-admin'], context: null },
  { id: 'g-cd', name: '算力合同谈判', color: COLORS[2], folders: ['~/work/compute-deal', 'my-mac::/Users/me/Documents/算力合同'], context: null },
  { id: 'g-hr', name: '招聘与薪酬', color: COLORS[3], folders: ['~/work/hr-comp'], context: null },
  { id: 'g-co', name: '公司', color: COLORS[4], folders: ['~/company'], context: null },
];
/* recent folders on each host: where conversations started in the last 30 days (count = how many) */
const RECENT = () => ({
  '': [
    { path: '~/Downloads', count: 1, when: '1 小时前' },
    { path: '~/work/investor-relations', count: 6, when: '2 小时前' },
    { path: '~/work/weekly-admin', count: 3, when: '今天 09:12' },
    { path: '~/work/compute-deal', count: 3, when: '昨天' },
    { path: '~/work/contracts', count: 1, when: '2 天前' },
    { path: '~/work/hr-comp', count: 2, when: '3 天前' },
    { path: '~/work/payments', count: 1, when: '上周' },
    { path: '~/code/ir-dashboard', count: 2, when: '上周' },
  ],
  mac: [{ path: '~/Projects/website', count: 3, when: '3 天前' }, { path: '~/work/investor-relations', count: 2, when: '昨天' }, { path: '~/Downloads', count: 1, when: '上周' }],
});

const L = localFS(); const G = GROUPS(); const R = RECENT()[''];
/* o.groups = the selected Task Groups IN SELECTION ORDER (v2.1: the Task row is multi-select) */
const inputs = (o = {}) => {
  const sel = (o.groups || (o.group ? [o.group] : [])).map((id) => G.find((x) => x.id === id));
  const bases = [];
  for (const g of sel) api.groupOn(g, L).folders.forEach((f) => bases.push({ path: f, label: `任务组「${g.name}」` }));
  bases.push({ path: '~/work', label: '文件管理器所在' }); bases.push({ path: '~', label: '主目录' });
  return { bases, groups: sel.length ? sel.map((g) => ({ ...g, selected: true })) : G.map((x) => ({ ...x, selected: false })), recent: R, listing: L, name: o.name || '' };
};

console.log('── ① the measured cases keep their winners ──');
const cases = [
  ['ir q3', {}, '~/work/investor-relations/Q3-董事会材料'],
  ['pay', {}, '~/work/payments'],
  ['合同', {}, '~/work/contracts'],
  ['~/wo', {}, '~/work'],
  ['work/pay', {}, null, '~/work/payments'],
  ['Q3', { group: 'g-ir' }, '~/work/investor-relations/Q3-董事会材料', '~/work/investor-relations/Q3-董事会材料'],
  ['草稿', { group: 'g-ir' }, null, '~/work/investor-relations/草稿|~/work/草稿'],
  ['', { name: 'payments' }, null],
  ['', { name: 'payments', group: 'g-ir' }, null],
  ['IR Q3', {}, '~/work/investor-relations/Q3-董事会材料'],
  ['invrel', {}, '~/work/investor-relations'],
  ['董事会', {}, '~/work/investor-relations/Q3-董事会材料'],
  ['条款版本', { groups: ['g-ir', 'g-cd'] }, '~/work/compute-deal/条款版本', '~/work/compute-deal/条款版本'],
];
for (const [q, o, wantTop, wantRes] of cases) {
  const m = api.rankCandidates(q, inputs(o));
  const top = m.mode === 'empty' ? null : (m.best && m.best.path);
  const res = m.resolved.map((r) => r.path).join('|');
  const okTop = wantTop == null || top === wantTop;
  const okRes = wantRes == null || res === wantRes;
  ok(`q=${JSON.stringify(q)} ${JSON.stringify(o)} mode=${m.mode} top=${top} rule=${m.best ? m.best.rule : '-'} score=${m.best ? m.best.score : '-'} resolved=${res || '-'}`, gateOf(okTop) && verdictOf(okRes), { top, res });
}
{
  const m = api.rankCandidates('合同', inputs({}));
  ok('合同 wins through the link alias ~/合同 → ~/work/contracts (an alias, never a rename table)', gateOf(m.best) && gateOf(m.best.alias) && m.best.alias.text === '合同' && m.best.alias.from.key === 'link' && verdictOf(m.best.why.some((w) => w.key === 'alias')), m.best);
  const e = api.rankCandidates('', inputs({ name: 'payments', group: 'g-ir' }));
  const s2 = e.sections.find((s) => s.sec === 2).rows.map((r) => r.path + (r.isNew ? '+' : ''));
  ok('empty + name + 投资者关系: ② = the same-name folder, <IR>/payments 新建, ~/payments 新建', s2.join('|') === '~/work/payments|~/work/investor-relations/payments+|~/payments+', s2);
  const pay = api.rankCandidates('pay', inputs({}));
  ok('pay: the recent ~/work/payments (片段前缀 + 最近) leads', pay.best.path === '~/work/payments' && pay.best.rule === 'segment' && verdictOf(pay.best.boost.some((b) => b.key === 'recent')), pay.best);
  const inv = api.rankCandidates('invrel', inputs({}));
  ok('invrel: a real subsequence hit beats the typed word\'s own ~/invrel 新建 (−3000)', inv.best.path === '~/work/investor-relations' && inv.best.rule === 'subseq' && verdictOf(inv.rows.some((r) => r.path === '~/invrel' && r.boost.some((b) => b.key === 'word-new'))), inv.rows.map((r) => r.path));
}

console.log('\n── ② two / three Task Groups selected (投资者关系, then 算力合同谈判) ──');
{
  const m = api.rankCandidates('', inputs({ groups: ['g-ir', 'g-cd'], name: 'payments' }));
  const s1 = m.sections.find((s) => s.sec === 1); const s2 = m.sections.find((s) => s.sec === 2);
  ok('① = every selected group\'s folders, in selection order', gateOf(s1) && s1.rows.map((r) => r.path).join('|') === '~/work/investor-relations|~/work/investor-relations/共享资料|~/work/compute-deal', s1 && s1.rows.map((r) => r.path));
  ok('…the notes folder says so (chip notes), the others group', s1.rows[0].chip.key === 'group' && s1.rows[1].chip.key === 'notes' && s1.rows[2].chip.params.group === '算力合同谈判', s1.rows.map((r) => r.chip));
  ok('② = one <group folder>/<name> per selected group, in order (+ the same-name folder, + ~/name)', gateOf(s2) && s2.rows.map((r) => r.path).join('|') === '~/work/payments|~/work/investor-relations/payments|~/work/compute-deal/payments|~/payments', s2 && s2.rows.map((r) => r.path));
  const b = inputs({ groups: ['g-cd', 'g-ir'] }).bases.map((x) => x.path).join('|');
  ok('bases follow the selection order (算力 first when picked first)', b === '~/work/compute-deal|~/work/investor-relations|~/work|~', b);
  const sec2 = (mm) => (mm.sections.find((s) => s.sec === 2) || { rows: [] }).rows.map((r) => r.path + (r.isNew ? '+' : ''));
  const two = sec2(m);
  ok('2 groups: ② = same-name folder, then <IR>/payments, <算力>/payments, ~/payments — selection order, all 新建', two.join('|') === '~/work/payments|~/work/investor-relations/payments+|~/work/compute-deal/payments+|~/payments+', two);
  const three = sec2(api.rankCandidates('', inputs({ groups: ['g-cd', 'g-wk', 'g-ir'], name: 'payments' })));
  ok('3 groups picked 算力 → 周报 → IR: ② follows THAT order', three.join('|') === '~/work/payments|~/work/compute-deal/payments+|~/work/weekly-admin/payments+|~/work/investor-relations/payments+|~/payments+', three);
  const w = api.rankCandidates('路演', inputs({ groups: ['g-ir', 'g-cd'] }));
  const ws = (w.sections.find((s) => s.sec === 2) || { rows: [], title: { params: {} } });
  ok('name empty + a bare word typed → the word plays the name: one 新建 per group + ~/word', ws.rows.map((r) => r.path).join('|') === '~/work/investor-relations/路演|~/work/compute-deal/路演|~/路演' && ws.title.params.word === true && w.word === '路演', [ws.title, ws.rows.map((r) => r.path)]);
  const r1 = ws.rows[0];
  ok('…its chips say 新建 + 任务组「X」 (name-group, the group\'s name and colour)', gateOf(r1) && gateOf(r1.isNew) && r1.chip.key === 'name-group' && r1.chip.params.group === '投资者关系' && r1.chip.params.color === COLORS[0], r1 && r1.chip);
  const pth = api.rankCandidates('~/wo', inputs({ groups: ['g-ir'] }));
  ok('a path (not a bare word) never makes name rows', !pth.sections.some((s) => s.sec === 2), pth.sections.map((s) => s.sec));
}

console.log('\n── ③ files (a field that takes a file or a folder) ──');
{
  const r = api.resolveRelative('handbook.md', [{ path: '~/work/investor-relations/共享资料', label: '上一行的文件夹' }, { path: '~', label: '主目录' }], L, { files: true });
  ok('handbook.md resolves against the row above, as a file', gateOf(r.resolved[0]) && r.resolved[0].path === '~/work/investor-relations/共享资料/handbook.md' && r.resolved[0].kind === 'file' && r.resolved[0].base === '上一行的文件夹', r);
  const r2 = api.resolveRelative('handbook.md', [{ path: '~/work/investor-relations/共享资料', label: '' }], L, { files: false });
  ok('…a folder-only field does not take it', !r2.resolved.length, r2);
  const m = api.rankCandidates('handb', { bases: [{ path: '~/work/investor-relations/共享资料', label: '上一行的文件夹' }, { path: '~', label: '主目录' }], groups: [], recent: [], listing: L, name: '', files: true });
  ok('fuzzy over files finds handbook.md first', gateOf(m.best) && m.best.path === '~/work/investor-relations/共享资料/handbook.md' && gateOf(m.best.file) && m.best.chip.key === 'file', m.best);
}

console.log('\n── ④ a remote machine gets the SAME recommendations, computed for it ──');
{
  const M = macFS();
  const view = (id) => api.groupOn(G.find((g) => g.id === id), M);
  const ir = view('g-ir'), cd = view('g-cd');
  ok('IR on my-mac: its folder exists there (probe) → offered; the notes folder too', ir.folders.join('|') === '~/work/investor-relations' && ir.context === '~/work/investor-relations/共享资料', [ir.folders, ir.context]);
  ok('算力 on my-mac: the folder declared for it (my-mac::/Users/me/Documents/算力合同) counts; ~/work/compute-deal is ABSENT (kept, greyed)', cd.folders.join('|') === '~/Documents/算力合同' && cd.absent.join('|') === '~/work/compute-deal' && cd.declared.join('|') === '~/Documents/算力合同', [cd.folders, cd.absent, cd.declared]);
  const inp = { bases: [...ir.folders.map((f) => ({ path: f, label: '任务组「投资者关系」（my-mac）' })), ...cd.folders.map((f) => ({ path: f, label: '任务组「算力合同谈判」（my-mac）' })), { path: '~', label: 'my-mac 的主目录' }], groups: [{ ...ir, selected: true }, { ...cd, selected: true }], recent: RECENT().mac, listing: M, name: 'payments', machine: 'my-mac' };
  const m = api.rankCandidates('', inp);
  const s1 = m.sections.find((s) => s.sec === 1).rows;
  ok('① = IR folder + notes (my-mac 上有), 算力 declared (为 my-mac 声明), then the absent one greyed 「在 my-mac 上不存在 · 新建？」', s1.map((r) => r.path + (r.absent ? '(absent)' : '')).join('|') === '~/work/investor-relations|~/work/investor-relations/共享资料|~/Documents/算力合同|~/work/compute-deal(absent)' && s1[0].chip.params.on === 'there' && s1[0].chip.params.host === 'my-mac' && s1[2].chip.params.on === 'declared' && s1[3].why.key === 'absent' && s1[3].why.params.host === 'my-mac', s1.map((r) => [r.path, r.chip, r.why]));
  const s2 = m.sections.find((s) => s.sec === 2).rows.map((r) => r.path);
  ok('② under each group\'s folder THERE + the machine\'s home', s2.join('|') === '~/work/investor-relations/payments|~/Documents/算力合同/payments|~/payments', s2);
  const s3 = m.sections.find((s) => s.sec === 3).rows;
  ok('③ = that machine\'s recents with counts', s3.map((r) => r.path + '×' + r.recent.count).join('|') === '~/Projects/website×3|~/Downloads×1', s3.map((r) => r.path));
  const s5 = m.sections.find((s) => s.sec === 5).rows.map((r) => r.path);
  ok('⑤ = the machine\'s volumes', s5.join('|') === '/Volumes/工作盘', s5);
  const doc = api.rankCandidates('文稿', { ...inp, name: '' });
  ok('文稿 finds ~/Documents through the OS display name (an alias, computed on that machine)', gateOf(doc.best) && doc.best.path === '~/Documents' && gateOf(doc.best.alias) && doc.best.alias.from.key === 'os-name', doc.best);
}

console.log('\n── ⑤ never offered unasked: the instance\'s own checkout, its data dir, dot-folders (ADDENDUM) ──');
{
  const P = localFS();
  P.dirs['~'].kids.push('vibespace', '.config');
  P.dirs['~/vibespace'] = { n: 4200, kids: ['src', 'data'], files: [F('package.json', '9 KB', '今天')] };
  P.dirs['~/vibespace/src'] = { n: 900, kids: [], files: [] };
  P.dirs['~/vibespace/data'] = { n: 300, kids: [], files: [] };
  P.dirs['~/.config'] = { n: 40, kids: ['vibespace'], files: [] };
  P.dirs['~/.config/vibespace'] = { n: 2, kids: [], files: [] };
  const self = { home: '/home/me', roots: ['/home/me/vibespace', '/home/me/vibespace/data'] };
  ok('isExcludedPath: the checkout and anything under it = self; a dot segment = dot; ~/work = free', api.isExcludedPath('~/vibespace', self) === 'self' && api.isExcludedPath('/home/me/vibespace/data', self) === 'self' && api.isExcludedPath('~/.config/vibespace', self) === 'dot' && api.isExcludedPath('~/work', self) === '' && api.isExcludedPath('/home/me/work', self) === '', ['~/vibespace', '~/.config/vibespace', '~/work'].map((p) => api.isExcludedPath(p, self)));
  const base = { bases: [{ path: '~', label: '主目录' }], groups: [], recent: [], listing: P, name: '' };
  const list = api.rankCandidates('~/', { ...base, self }).rows.map((r) => r.path);
  ok('~/ lists the home WITHOUT ~/vibespace and ~/.config', !list.includes('~/vibespace') && !list.includes('~/.config') && verdictOf(list.includes('~/work')), list);
  const ctl = api.rankCandidates('~/', base).rows.map((r) => r.path);
  ok('RED CONTROL: without `self` the checkout IS offered (the study\'s preselect)', verdictOf(ctl.includes('~/vibespace')), ctl);
  const vib = api.rankCandidates('vibe', { ...base, self });
  ok('fuzzy `vibe` never offers the checkout or ~/.config/vibespace (the mounts folder ~/vibespace-mounts is the person\'s, offered)', !vib.rows.some((r) => r.path === '~/vibespace' || r.path.startsWith('~/vibespace/') || r.path.startsWith('~/.config')) && verdictOf(vib.rows.some((r) => r.path.startsWith('~/vibespace-mounts/'))), vib.rows.map((r) => r.path));
  const typed = api.rankCandidates('~/vibespace', { ...base, self });
  ok('typed explicitly (~/vibespace) it resolves, and the listing row shows', gateOf(typed.resolved[0]) && typed.resolved[0].path === '~/vibespace' && verdictOf(typed.rows.some((r) => r.path === '~/vibespace')), [typed.resolved, typed.rows.map((r) => r.path)]);
  const dot = api.rankCandidates('~/.co', { ...base, self });
  ok('a typed "." segment lists dot-folders (~/.co → ~/.config)', verdictOf(dot.rows.some((r) => r.path === '~/.config')), dot.rows.map((r) => r.path));
  const own = api.rankCandidates('', { ...base, self, recent: [{ path: '~/vibespace', count: 4, when: '昨天' }], groups: [{ id: 'g-dev', name: 'dev', folders: ['~/vibespace'], context: null, selected: true }] });
  ok('a Task Group folder / a recent one the person made stays theirs', verdictOf(own.rows.some((r) => r.path === '~/vibespace' && r.sec === 1)), own.rows.map((r) => [r.path, r.sec]));
  const mounts = { ...P, mounts: ['~/vibespace/data/mounts/x'] };
  mounts.dirs['~/vibespace/data/mounts/x'] = { n: 1, kids: [], files: [] };
  ok('a mount under the data dir is not offered', !api.rankCandidates('', { ...base, listing: mounts, self }).rows.some((r) => r.path.startsWith('~/vibespace')), api.rankCandidates('', { ...base, listing: mounts, self }).rows.map((r) => r.path));
}

console.log('\n── ⑥ the resolution line, missingVerdict, groupOn here, fuzzyFilter ──');
{
  const B = [{ path: '~/work/investor-relations', label: 'IR' }, { path: '~/work', label: 'work' }, { path: '~', label: 'home' }];
  const two = api.resolveRelative('草稿', B, L);
  ok('草稿 = two resolutions, each with its base\'s name; the line says alts (the first used)', two.line.key === 'alts' && two.line.params.n === 2 && two.resolved.map((r) => r.base).join('|') === 'IR|work', two);
  const one = api.resolveRelative('Q3-董事会材料', B, L);
  ok('a relative one = resolved + its base', one.line.key === 'resolved' && one.line.params.base === 'IR' && one.line.params.relative === true, one.line);
  const cmp = api.resolveRelative('~/work/contr', B, L);
  ok('~/work/contr = a completion (Tab)', cmp.line.key === 'complete' && cmp.resolved[0].path === '~/work/contracts', cmp);
  const lk = api.resolveRelative('~/合同', B, L);
  ok('~/合同 = through the link', lk.line.key === 'link' && lk.resolved[0].path === '~/work/contracts' && lk.line.params.via === '~/合同', lk);
  const mi = api.resolveRelative('新项目', B, L);
  ok('新项目 = missing, where it WOULD be (the first base whose folder exists)', mi.line.key === 'missing' && mi.missing.path === '~/work/investor-relations/新项目' && mi.missing.base === 'IR', mi);
  const ab = api.resolveRelative('/home/me/work', B, L);
  ok('an absolute path resolves in ~ form against nothing', gateOf(ab.resolved[0]) && ab.resolved[0].path === '~/work' && ab.resolved[0].base === 'abs' && !ab.resolved[0].relative, ab);
  const se = api.resolveRelative('ir q3', B, L);
  ok('a few words with a space = a search, not a path', se.line.key === 'search' && !se.resolved.length && !se.missing, se);
  const v1 = api.missingVerdict('~/work/新项目', L);
  ok('missingVerdict: the parent is there ⇒ create', gateOf(v1.parentExists) && v1.line.key === 'missing-create' && v1.parent === '~/work', v1);
  const v2 = api.missingVerdict('~/nope/新项目', L);
  ok('missingVerdict: the parent is missing ⇒ said (no create)', !v2.parentExists && v2.line.key === 'missing-parent' && v2.line.params.parent === '~/nope', v2);
  const here = api.groupOn(G.find((g) => g.id === 'g-cd'), L);
  ok('groupOn here drops the folder declared for another machine', here.folders.join('|') === '~/work/compute-deal' && !here.absent.length, here);
  const ff = api.fuzzyFilter(Object.keys(L.dirs), 'ir q3');
  ok('fuzzyFilter (the hub\'s side) keeps the field\'s best first', ff[0] === '~/work/investor-relations/Q3-董事会材料', ff.slice(0, 3));
  ok('fuzzyFilter: nothing typed = nothing', api.fuzzyFilter(Object.keys(L.dirs), '').length === 0, null);
  ok('joinPath normalises . and ..; toTilde / fromTilde round-trip', api.joinPath('~/work', '../code/./x') === '~/code/x' && api.joinPath('/a', 'b/../c') === '/a/c' && api.fromTilde('/home/me', api.toTilde('/home/me', '/home/me/work')) === '/home/me/work' && api.toTilde('/home/me', '/srv/x') === '/srv/x', null);
}

console.log('\n── ⑦ the text\'s VERDICT, its fourth shape (B-d833) ──');
{
  // the coordinator's ruling 2026-11-20 03:24Z / 03:38Z: candidates ONE AT A TIME in the bases' order, each from ONE bare stat (absent ⇒
  // the names under the typed prefix in the same call); an exact hit wins, a completion never stops the walk; late / skipped / failed
  // before an exact hit decide. Rows, the seeded law, RED CONTROLS (anchored edits of the shipped source)
  const nfs = require('node:fs'), npath = require('node:path');
  const SRC = nfs.readFileSync(npath.join(npath.dirname(new URL(import.meta.url).pathname), '..', 'src', 'path-candidates.js'), 'utf8');
  // (r1636: path-candidates requires src/path-text.js — a copy's require resolves where the module lives)
  const srcRequire = createRequire(npath.join(npath.dirname(new URL(import.meta.url).pathname), '..', 'src', 'path-candidates.js'));
  const load = (src) => { const m = { exports: {} }; new Function('module', 'exports', 'require', src)(m, m.exports, srcRequire); return m.exports; };
  const edit = (src, pairs) => pairs.reduce((s2, [a, b]) => { if (s2.split(a).length !== 2) throw new Error('anchor gone: ' + a.slice(0, 60)); return s2.replace(a, b); }, src);
  const T = api.textCandidates, V = api.textVerdict, A = api.lineAnswerOf, B = [{ path: '~/a' }, { path: '~' }, { path: '~/a' }];
  ok('⑦ isPathText — the ONE predicate (shared with resolveRelative): any text with no whitespace — an absolute or ~ text, a relative one, a BARE WORD (the POC\'s «草稿» resolves in two bases); a spaced text is a search',
    [api.isPathText('/x'), api.isPathText('~'), api.isPathText('foo/bar'), api.isPathText('草稿'), api.isPathText('ir q3'), api.isPathText('')].join() === 'true,true,true,true,false,false');
  ok('⑦ textCandidates: an absolute text itself, a ~ text in ~ form, a relative one or a BARE WORD per base in order (each once); a spaced text none',
    JSON.stringify([T('/x/y/', B), T('~', B), T('foo/bar', B), T('草稿', B), T('ir q3', B)]) === JSON.stringify([['/x/y'], ['~'], ['~/a/foo/bar', '~/foo/bar'], ['~/a/草稿', '~/草稿'], []]), [T('草稿', B)]);
  const rowsA = [
    ['a folder ⇒ listed', A({ exists: true, isDir: true }), 'listed'],
    ['a FILE where a folder is wanted ⇒ absent; where a file will do ⇒ listed', A({ exists: true, isDir: false }).answer + '/' + A({ exists: true, isDir: false }, { files: true }).answer, 'absent/listed'],
    ['absent, ONE name under the prefix that is a folder ⇒ listed as its completion', JSON.stringify(A({ exists: false, names: ['payments'], one: { path: '/h/w/payments', exists: true, isDir: true } })), JSON.stringify({ answer: 'listed', completed: '/h/w/payments' })],
    ['absent, several names (or none) ⇒ absent (the rows offer them)', A({ exists: false, names: ['pa', 'pb'] }).answer + '/' + A({ exists: false, names: [] }).answer, 'absent/absent'],
    ['a stat that failed for another reason, or its names that could not be read ⇒ failed with the machine\'s words', A({ exists: false, err: 'EACCES: x' }).answer + '/' + A({ exists: false, namesErr: 'EIO: y' }).answer, 'failed/failed'],
  ];
  for (const [what, got, want] of rowsA) ok(`⑦ lineAnswerOf: ${what}`, (typeof got === 'string' ? got : got.answer) === want, got);
  // (the coordinator's r146, law 2) THE BASES' FIXPOINT on a paired machine: its group view MOVES ONCE — when the machine's home and its
  // listing are first learned (a declared folder spelled with its home, a local folder kept only once listed there) — and never again on a
  // reply with the same facts (so the field's question is renamed at most once per fact learned, never by a repeated reply)
  {
    const gx = { id: 'g', name: 'G', selected: true, folders: ['~/work/a', '~/work/c', 'my-mac::/Users/u/Documents/b'] };
    const L0 = { home: '', machine: 'my-mac', dirs: {}, links: {}, localized: {}, mounts: [], nondirs: {} };
    const sl = api.sliceListing({ home: '/Users/u', machine: 'my-mac', dirs: [], probes: [{ path: '/Users/u/work/a', exists: true, isDir: true }] }); sl.machine = 'my-mac';
    const L1 = api.mergeListing(JSON.parse(JSON.stringify(L0)), sl), L2 = api.mergeListing(JSON.parse(JSON.stringify(L1)), sl);
    const fv = (L) => JSON.stringify(api.groupOn(gx, L).folders);
    ok('⑦ THE BASES\' FIXPOINT: a paired machine\'s group view moves ONCE (its home and listing learned: «/Users/u/Documents/b» → «~/Documents/b», «~/work/a» kept once listed) and a reply with the same facts moves it no more', fv(L0) !== fv(L1) && fv(L1) === fv(L2) && fv(L1) === JSON.stringify(['~/Documents/b', '~/work/a']), { L0: fv(L0), L1: fv(L1), L2: fv(L2) });
  }
  // (the box pre-run r156, the coordinator's law) A ROW NEVER SAYS «DOES NOT EXIST» of a folder on a machine whose listing for it has not
  // answered: the page splits a paired machine's absent folders into KNOWN absent (asked, or the parent listed in full) and UNKNOWN; an
  // unknown one is a plain group row (no greyed «不存在 · 新建？»). CONTROL: the raw view (every unlisted folder absent at once) greys it
  {
    const Lm = { home: '/Users/u', machine: 'my-mac', dirs: {}, links: {}, localized: {}, mounts: [], nondirs: {} };
    const gb = { id: 'g', name: 'G', selected: true, color: '', folders: [], declared: [] };
    const inpU = (g) => ({ bases: [{ path: '~', label: 'home' }], groups: [g], recent: [], listing: Lm, name: '', self: { home: '/Users/u', roots: [] }, machine: 'my-mac' });
    const ru = api.rankCandidates('', inpU({ ...gb, absent: [], unknown: ['~/work/a'] })).rows.find((r) => r.path === '~/work/a'), rc = api.rankCandidates('', inpU({ ...gb, absent: ['~/work/a'], unknown: [] })).rows.find((r) => r.path === '~/work/a');
    ok('⑦ a group folder that machine has NOT YET answered for is a plain row — never «does not exist · create?» — CONTROL the raw view: greyed absent at once', !!ru && !ru.absent && !(ru.why && ru.why.key === 'absent') && !!rc && rc.absent === true && rc.why.key === 'absent', { unknown: ru, control: rc });
    // (r174, the (b) law) one the machine was ASKED for and did not answer is said by its name: an «unsaid» row, never absent, never 新建
    const rs = api.rankCandidates('', inpU({ ...gb, absent: [], unknown: ['~/work/a'], unsaid: ['~/work/a'] })).rows.find((r) => r.path === '~/work/a');
    ok('⑦ an unknown folder the machine did not answer for says so by the machine\'s name (why «unsaid», host my-mac) — never absent, never new; CONTROL the unknown row not asked carries no word', !!rs && rs.unsaid === true && gateOf(rs.why) && rs.why.key === 'unsaid' && rs.why.params.host === 'my-mac' && !rs.absent && !rs.isNew && !ru.unsaid && !(ru.why && ru.why.key === 'unsaid'), { unsaid: rs, control: ru });
  }
  // (the fresh read's N8) a FILE keeps its flag through the verdict (a file field): exact, and the one name a prefix completes to — CONTROL: dropped
  const fv = api.textVerdict([{ path: '~/n.txt', ...api.lineAnswerOf({ exists: true, isDir: false }, { files: true }) }]), fc = api.textVerdict([{ path: '~/n', ...api.lineAnswerOf({ exists: false, names: ['n.txt'], one: { path: '/h/n.txt', exists: true, isDir: false } }, { files: true }) }]);
  const fvC = load(edit(SRC, [["    if (c.answer === 'listed' && !c.completed) return end() || { kind: 'exists', path: c.path, ...(c.file ? { file: true } : {}) };", "    if (c.answer === 'listed' && !c.completed) return end() || { kind: 'exists', path: c.path };"]])).textVerdict([{ path: '~/n.txt', ...api.lineAnswerOf({ exists: true, isDir: false }, { files: true }) }]);
  ok('⑦ a FILE in a file field keeps its flag: «exists» with file — and the one name a prefix completes to — CONTROL dropped: no flag (Tab would write «~/n.txt/»)', fv.kind === 'exists' && fv.file === true && fc.kind === 'exists' && gateOf(fc.completed) && fc.file === true && !fvC.file, { fv, fc, fvC });
  const SLk = { home: '/h', probes: [{ path: '/h/合同', exists: true, isDir: true, link: '/h/work/contracts' }] };
  const sl = api.sliceListing(SLk), slc = load(edit(SRC, [["    if (p.link) { link(p.path, p.link); continue; }   // a stated symlink to a folder: a LINK, never a second row\n", '']])).sliceListing(SLk);
  ok('⑦ sliceListing: the line\'s stat of a symlink to a folder (its `link`) is a LINK — ~/合同 → ~/work/contracts, the target kept, never a second row — CONTROL: without it the link is a folder row of its own', sl.links['~/合同'] === '~/work/contracts' && !sl.dirs['~/合同'] && !!sl.dirs['~/work/contracts'] && !!slc.dirs['~/合同'] && !slc.links['~/合同'], { sl, slc });
  const C = (path, answer, x = {}) => ({ path, answer, ...x });
  const rowsV = [
    ['R1 the earlier ones absent, one EXACT ⇒ exists via it', [C('a', 'absent'), C('b', 'listed')], { kind: 'exists', path: 'b' }],
    ['an exact hit in a LATER base beats a completion in an earlier one (as resolveRelative drops completions)', [C('a', 'listed', { completed: 'a/x1' }), C('b', 'listed')], { kind: 'exists', path: 'b' }],
    ['a completion, nothing exact, every candidate answered ⇒ exists via the completion', [C('a', 'absent'), C('b', 'listed', { completed: 'b/x1' })], { kind: 'exists', path: 'b/x1', completed: true, from: 'b' }],
    ['a completion, then a LATE base (an exact hit may be there) ⇒ late', [C('a', 'listed', { completed: 'a/x1' }), C('b', 'late')], { kind: 'late', path: 'b' }],
    ['R2 every candidate absent ⇒ absent', [C('a', 'absent'), C('b', 'absent')], { kind: 'absent' }],
    ['R3 a LATE one before any exact ⇒ late', [C('a', 'late'), C('b', 'listed')], { kind: 'late', path: 'a' }],
    ['R-i a skipped one (a dead entrance\'s mark) ⇒ skipped, with when its mark ends', [C('a', 'skipped', { until: 9 }), C('b', 'listed')], { kind: 'skipped', path: 'a', until: 9 }],
    ['R5 a FAILED one, nothing late, nothing exact before ⇒ failed with its error', [C('a', 'absent'), C('b', 'failed', { err: 'EIO' })], { kind: 'failed', path: 'b', err: 'EIO' }],
  ];
  for (const [what, cs, want] of rowsV) ok(`⑦ textVerdict ${what}`, JSON.stringify(V(cs)) === JSON.stringify(want), V(cs));
  // THE LAW, seeded over 1500 cases of random answers (exact / completion / absent / late / skipped / failed) for 1..5 candidates
  const KINDS = ['exact', 'comp', 'absent', 'late', 'skipped', 'failed'];
  const law = (verdict) => {
    for (let seed = 1; seed <= 1500; seed++) {
      let x = (seed * 2654435761) >>> 0; const rnd = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 4294967296);
      const cs = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => { const k = KINDS[Math.floor(rnd() * KINDS.length)]; return k === 'exact' ? C('c' + i, 'listed') : k === 'comp' ? C('c' + i, 'listed', { completed: 'c' + i + '/x' }) : C('c' + i, k, k === 'skipped' ? { until: i + 1 } : k === 'failed' ? { err: 'e' + i } : {}); });
      const v = verdict(cs), ex = cs.findIndex((c) => c.answer === 'listed' && !c.completed), need = ex < 0 ? cs : cs.slice(0, ex);
      const stop = need.find((c) => c.answer === 'late' || c.answer === 'skipped'), fail = need.find((c) => c.answer === 'failed'), comp = cs.find((c) => c.completed);
      const holds = v.kind === 'absent' ? cs.every((c) => c.answer === 'absent')
        : v.kind === 'late' || v.kind === 'skipped' ? !!stop && stop.path === v.path && stop.answer === v.kind
          : v.kind === 'failed' ? !stop && !!fail && fail.path === v.path
            : v.kind === 'exists' && !v.completed ? ex >= 0 && v.path === cs[ex].path && !stop && !fail
              : v.kind === 'exists' && v.completed ? ex < 0 && !stop && !fail && !!comp && v.path === comp.completed
                : false;
      if (!holds) return { seed, cs: cs.map((c) => c.completed ? 'comp' : c.answer).join(','), v };
    }
    return null;
  };
  const broke = law(V);
  ok('⑦ THE LAW over 1500 seeds: absent ⇒ every candidate absent · late / skipped ⇒ the FIRST such before the exact hit · failed ⇒ one before the exact hit, none late · exact ⇒ the first, nothing unanswered before it · a completion ⇒ no exact anywhere, nothing unanswered, the first one', !broke, broke);
  const CONTROLS = [
    ['a late candidate called absent', [["    if (c.answer === 'late' || c.answer === 'skipped') { if (!late) late = c; }", "    if (c.answer === 'skipped') { if (!late) late = c; }"]]],
    ['a completion that STOPS the walk (an exact hit in a later base lost)', [["    if (c.answer === 'listed') { if (!comp) comp = c; continue; }", "    if (c.answer === 'listed') return end() || { kind: 'exists', path: c.completed, completed: true, from: c.path };"]]],
    ['a failed candidate called absent', [["    else if (c.answer === 'failed') { if (!failed) failed = c; }", "    else if (c.answer === 'failed') { }"]]],
  ];
  for (const [what, pairs] of CONTROLS) {
    let r = null, err = '';
    try { r = law(load(edit(SRC, pairs)).textVerdict); } catch (e) { err = String(e.message || e).slice(0, 200); }
    ok(`⑦ RED CONTROL: ${what} — the law finds it${r ? ` (seed ${r.seed}: ${r.cs} ⇒ ${r.v.kind})` : ''}`, !!r, r || err || 'not found');
  }
}

console.log(`\n${n - bad}/${n} ok${bad ? ` — ${bad} BAD` : ''}`);
process.exit(bad ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
