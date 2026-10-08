#!/usr/bin/env node
// THE ARTIFACTS LIST AT SCALE — the PURE model (lane artifacts-list-scale, design 021 E1–E9 + window B;
// src/lib/artifacts-list-model.js). DOM-free: filterRows over name / path tail / helper (CJK, case fold, the 80-char
// bound, matchedCode); orderRows 3 groups × 3 sorts over the owner's 217-row conversation (43 deliverables + 174 code)
// with ties — stable and deterministic; recentOf (code included) + the band rule; rowWords per kind (services say their
// state); countLine; sortRows / railOf / railRows (the window's); listPlan; listPlan LINEAR in WORK at 250 → 500 → 1 000 rows (scripts/work-meter.mjs; the ms only printed). Each table row
// has a control.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { judgeInChild, LINEAR_BOUND } from './work-meter.mjs';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await import(pathToFileURL(path.join(REPO, 'src/lib/artifacts-list-model.js')).href);
let pass = 0, fail = 0;
const ok = (c, msg, why = '') => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (why ? ' — ' + why : '')); } };
const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);
const H = 3600e3;

// ── THE FIXTURE: the owner's screenshot conversation (names from the screenshot; synthetic paths) — 43 + 174 ──
function fixture() {
  const rows = [];
  const helpers = ['pt2:fix', 'pt2:build-core', 'seg:access', 'pt2:judge', 'pt2:design-B', 'top:build', 'mart:verify'];
  const via = (i) => (i % 5 === 4 ? null : { kind: 'subagent', name: helpers[i % helpers.length] });
  const docNames = ['sec10_tail.md', 'DESIGN2.md', 'design2_B.md', 'status_r2.md', 'todo_wave12.md', 'todo_wave9.md', '设计说明.md', 'Notes 2.md', 'notes 10.md', 'notes 9.md'];
  let k = 0;
  const add = (kind, name, dir, i, extra = {}) => rows.push({ key: `local:/home/u/house3d/${dir}/${name}#${k++}`, kind, name, path: `/home/u/house3d/${dir}/${name}`, lastAt: T0 - (i % 17) * H - (i % 3) * 60e3, writes: 1 + (i % 2), edits: (i * 7) % 13, by: i % 9 === 0 ? 'user' : 'agent', ...(via(i) ? { via: via(i) } : {}), ...extra });
  for (let i = 0; i < 20; i++) add('doc', i < docNames.length ? docNames[i] : `wave${i}_notes.md`, i % 2 ? 'docs' : 'out', i);
  rows.push({ key: 'service:house3d-web2-2', kind: 'service', name: 'house3d-web2-2', path: '', url: '/proxy/web2/', state: 'running', since: T0 - 30 * H, lastAt: T0 - 30 * H, writes: 0, edits: 0 });
  add('page', 'index.html', 'web', 3, { via: { kind: 'subagent', name: 'top:build' } });
  for (let i = 0; i < 21; i++) add('other', i === 0 ? 'run.ps1' : i === 1 ? 'mart_remote.ps1' : `asset_${i}.bin`, 'files', i + 40);
  for (let i = 0; i < 174; i++) add('code', i === 0 ? 'render_wave12.py' : i === 1 ? 'lighting.py' : i === 2 ? 'CLAUDE.md' : `mod_${i % 60}.py`, `src/pkg${i % 9}`, i + 100);
  return rows;
}
const ROWS = fixture();
const items = ROWS.filter((r) => r.kind !== 'code'), code = ROWS.filter((r) => r.kind === 'code');
const V = { ok: true, items, code, count: items.length, codeCount: code.length, total: ROWS.length, full: false };
console.log(`fixture: ${items.length} deliverables + ${code.length} code = ${ROWS.length}`);
ok(items.length === 43 && code.length === 174, 'the 217-row fixture is the owner\'s 43 + 174');

console.log('① filterRows — name · path tail · helper, case fold, CJK, the bound, matchedCode');
const keys = (rs) => rs.map((r) => r.key);
const f1 = M.filterRows(ROWS, 'SEC10');
ok(f1.rows.length === 1 && f1.rows[0].name === 'sec10_tail.md' && f1.matchedCode === 0, `"SEC10" (case-folded) finds sec10_tail.md only (${f1.rows.length})`);
const f2 = M.filterRows(ROWS, 'pkg3/');
ok(f2.rows.length > 0 && f2.rows.every((r) => r.kind === 'code' && r.path.includes('/pkg3/')) && f2.matchedCode === f2.rows.length, `a path-tail query ("pkg3/") matches code by its directory (${f2.rows.length}, matchedCode ${f2.matchedCode})`);
const f3 = M.filterRows(ROWS, 'pt2:FIX');
ok(f3.rows.length > 0 && f3.rows.every((r) => M.helperOf(r) === 'pt2:fix'), `a helper label ("pt2:FIX") matches that helper's rows (${f3.rows.length})`);
const f4 = M.filterRows(ROWS, '设计');
ok(f4.rows.length === 1 && f4.rows[0].name === '设计说明.md', 'CJK as typed: "设计" finds 设计说明.md');
const f5 = M.filterRows(ROWS, 'house3d');
ok(f5.rows.length === 1 && f5.rows[0].kind === 'service', `the path tail is the LAST TWO segments: "house3d" (a deeper ancestor) is not a path match — only the service named so (${f5.rows.length})`);
ok(M.filterRows(ROWS, '   ').rows.length === ROWS.length && M.filterRows(ROWS, '').q === '', 'an empty / blank query keeps every row (q "")');
const long = 'x'.repeat(200);
ok(M.queryOf(long).length === M.FILTER_MAX && M.FILTER_MAX === 80, 'the query is bounded to 80 chars');
ok(JSON.stringify(M.markOf('Sec10_tail.md', 'sec1')) === '[0,4]' && M.markOf('abc', 'zz') === null && M.markOf('abc', '') === null, 'markOf: the match\'s [start, end) in the name; none / empty ⇒ null');
// control: a filter over the name only misses the helper / path rows
const nameOnly = (rows, q) => rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
ok(nameOnly(ROWS, 'pt2:fix').length === 0 && f3.rows.length > 0, 'CONTROL: a name-only filter finds 0 rows for a helper label (the model finds them)');

console.log('② orderRows — 3 groups × 3 sorts, stable + deterministic, heads keyed and counted');
const shuffled = ROWS.slice().reverse();
for (const group of M.GROUPS) for (const sort of M.SORTS) {
  const a = M.orderRows(ROWS, { group, sort }), b = M.orderRows(shuffled, { group, sort });
  const flat = (gs) => gs.map((g) => g.head.key + '|' + keys(g.rows).join(',')).join('\n');
  const n = a.reduce((s, g) => s + g.rows.length, 0);
  ok(flat(a) === flat(b) && n === ROWS.length && a.every((g) => g.head.count === g.rows.length), `${group} × ${sort}: ${a.length} groups, ${n} rows, the same order from any input order`);
}
const byKind = M.orderRows(ROWS, { group: 'kind', sort: 'changed' }).map((g) => g.head.label);
ok(JSON.stringify(byKind) === JSON.stringify(['doc', 'service', 'page', 'other', 'code']), `kind groups in VIEW_ORDER, code last (${byKind.join(' ')})`);
const byHelper = M.orderRows(ROWS, { group: 'helper' });
ok(byHelper[byHelper.length - 1].head.label === '' && byHelper.slice(0, -1).every((g, i, a) => i === 0 || a[i - 1].head.count >= g.head.count), 'helper groups: most rows first, the main conversation ("") last');
const byDay = M.orderRows(ROWS, { group: 'day' }).map((g) => g.head.label);
ok(byDay.every((d, i) => i === 0 || byDay[i - 1] > d), `day groups newest first (${byDay.join(' ')})`);
const sorted = (rs, cmp) => rs.every((r, i) => i === 0 || cmp(rs[i - 1], r) <= 0);
const docs = (sort) => M.orderRows(ROWS, { group: 'kind', sort })[0].rows;
ok(sorted(docs('changed'), (a, b) => b.lastAt - a.lastAt), 'changed: newest change first');
ok(sorted(docs('name'), (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })) && docs('name').findIndex((r) => r.name === 'notes 9.md') < docs('name').findIndex((r) => r.name === 'notes 10.md'), 'name: numeric collation ("notes 9" before "notes 10")');
ok(sorted(docs('edits'), (a, b) => ((b.edits + b.writes) - (a.edits + a.writes))), 'edits: most touches (edits + writes) first');
const tie = [{ key: 'b', name: 'same', lastAt: 5, edits: 1, writes: 1, kind: 'doc' }, { key: 'a', name: 'same', lastAt: 5, edits: 1, writes: 1, kind: 'doc' }];
ok(M.SORTS.every((s) => keys(M.orderRows(tie, { group: 'kind', sort: s })[0].rows).join() === 'a,b'), 'full ties fall to the key — the same order every time');
ok(M.orderRows(ROWS, { group: 'nope', sort: 'nope' })[0].head.key === 'k:doc', 'an unknown group / sort reads as kind / changed');

console.log('③ recentOf + the band rule');
const rec = M.recentOf(ROWS);
const newest = ROWS.slice().sort((a, b) => b.lastAt - a.lastAt || (a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })) || (a.key < b.key ? -1 : 1)).slice(0, 5);
ok(rec.length === 5 && keys(rec).join() === keys(newest).join(), 'the 5 newest touches, any kind');
ok(M.recentOf(code.concat(items.map((r) => ({ ...r, lastAt: 1 })))).every((r) => r.kind === 'code'), 'code is in the band when it is newest');
ok(M.recentShown({ total: 217 }) && !M.recentShown({ total: 217, filtering: true }) && !M.recentShown({ total: 7 }) && M.recentShown({ total: 8 }), 'the band: shown at ≥ 8 rows, hidden while filtering or < 8');

console.log('④ rowWords per kind · countLine (zh / ja / en through t)');
const zh = { 'Changed {n} times': '已改 {n} 次', Running: '运行中', Stopped: '已停止', '{items} artifacts · {code} code files': '{items} 项产出 · {code} 个代码文件', '{n} matches · {m} code': '匹配 {n} 项 · 其中代码 {m}', '{n} matches': '匹配 {n} 项', '{n} artifacts': '{n} 项产出' };
const ja = { 'Changed {n} times': '{n} 回変更', '{items} artifacts · {code} code files': '成果物 {items} 件 · コードファイル {code} 件', '{n} matches · {m} code': '一致 {n} 件 · うちコード {m}' };
const tOf = (d) => (s, v) => String(d[s] || s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : ''));
const kw = (k) => ({ doc: '文档', code: '代码', service: '服务' }[k] || k);
const lit = ROWS.find((r) => r.name === 'lighting.py');
const w1 = M.rowWords(lit, { t: tOf(zh), kindWord: kw, ago: () => '昨天' });
ok(w1.kind === '代码' && w1.helper === M.helperOf(lit) && w1.edits === `已改 ${M.changesOf(lit)} 次` && w1.ago === '昨天', `code: ${JSON.stringify(w1)}`);
const svc = ROWS.find((r) => r.kind === 'service');
ok(M.rowWords(svc, { t: tOf(zh), kindWord: kw }).edits === '运行中' && M.rowWords({ ...svc, state: 'stopped' }, { t: tOf(zh), kindWord: kw }).edits === '已停止', 'a service says its state (运行中 / 已停止) in the edits slot');
ok(M.rowWords({ key: 'x', kind: 'doc', writes: 1, edits: 0, lastAt: T0 }, { t: tOf(zh), kindWord: kw }).edits === '', 'a doc written once and never changed says no count (the default is unsaid)');
ok(M.rowWords({ key: 'h', kind: 'doc', via: { kind: 'handover', from: { cid: 'c1', name: 'helper-A' } } }).helper === 'helper-A', 'a hand-over names the helper conversation');
ok(M.countLine({ items: 43, code: 174 }, tOf(zh)) === '43 项产出 · 174 个代码文件' && M.countLine({ items: 43, code: 174 }, tOf(ja)) === '成果物 43 件 · コードファイル 174 件' && M.countLine({ items: 43, code: 174 }) === '43 artifacts · 174 code files', 'countLine zh / ja / en');
ok(M.countLine({ items: 43, code: 174, filtered: M.filterRows(ROWS, 'sec10') }, tOf(zh)) === '匹配 1 项' && M.countLine({ filtered: M.filterRows(ROWS, 'pkg3/') }, tOf(zh)) === `匹配 ${f2.rows.length} 项 · 其中代码 ${f2.matchedCode}`, 'countLine while filtering: "匹配 N 项 · 其中代码 M"');

console.log('⑤ the window (B): sortRows · railOf · railRows — the same comparators');
for (const col of M.COLUMNS) {
  const a = M.sortRows(ROWS, { col }), b = M.sortRows(shuffled, { col }), r = M.sortRows(ROWS, { col, dir: (col === 'edits' || col === 'changed') ? 'asc' : 'desc' });
  ok(keys(a).join() === keys(b).join() && keys(r).join() === keys(a).reverse().join(), `column ${col}: deterministic; the other direction is the exact reverse`);
}
ok(keys(M.sortRows(items, { col: 'name' })).join() === keys(M.orderRows(items, { group: 'kind', sort: 'name' }).flatMap((g) => g.rows).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || b.lastAt - a.lastAt || (a.key < b.key ? -1 : 1))).join(), 'the window\'s name sort = the popover\'s name comparator');
const R = M.railOf(ROWS);
ok(R.total === 217 && R.kinds.map((k) => k.key).join() === 'k:doc,k:service,k:page,k:other,k:code' && R.kinds.find((k) => k.key === 'k:code').count === 174, `the rail: all ${R.total}, kinds with counts (${R.kinds.map((k) => k.label + ' ' + k.count).join(', ')})`);
ok(R.helpers.length && R.helpers.every((h) => h.label) && M.railRows(ROWS, R.helpers[0].key).length === R.helpers[0].count, `the rail's helpers (${R.helpers.map((h) => h.label + ' ' + h.count).join(', ')}) — a click selects exactly its count`);
ok(M.railRows(ROWS, 'k:code').length === 174 && M.railRows(ROWS, 'recent').length === 5 && M.railRows(ROWS, 'all').length === 217, 'railRows: a kind · recent · all');

console.log('⑥ listPlan (the popover) + viewFrom (the device-kept view)');
const p0 = M.listPlan(V, { collapsed: M.DEFAULT_VIEW.collapsed.kind });
ok(p0.sections[0].key === 'recent' && p0.sections.find((s) => s.key === 'k:code').open === false && p0.sections.find((s) => s.key === 'k:doc').open === true, 'default: the 最近 band first; 代码 collapsed; documents open');
const p1 = M.listPlan(V, { q: 'pkg3/', collapsed: ['k:code'] });
ok(!p1.sections.some((s) => s.key === 'recent') && p1.sections.find((s) => s.key === 'k:code').open === true, 'filtering: the band hides; a collapsed group with matches opens');
ok(M.listPlan(V, { q: 'zzzz' }).empty === true, 'zero matches ⇒ the empty note');
const v1 = M.viewFrom({ group: 'helper', sort: 'edits', collapsed: { helper: ['h:pt2:fix'] } });
ok(v1.group === 'helper' && v1.sort === 'edits' && v1.collapsed.helper[0] === 'h:pt2:fix' && v1.collapsed.kind.join() === 'k:code', 'viewFrom keeps a stored choice; an absent kind fold set = 代码 collapsed');
ok(JSON.stringify(M.viewFrom('junk')) === JSON.stringify(M.viewFrom(null)) && M.viewFrom({ group: 'x' }).group === 'kind', 'junk ⇒ the defaults');

console.log('⑦ the work per keystroke (filterRows → orderRows): LINEAR in WORK at 250 → 500 → 1 000 rows; the clock printed, never judged');
const big = []; for (let i = 0; i < 500; i++) big.push({ ...ROWS[i % ROWS.length], key: 'k' + i, name: (i % 3 ? 'mod_' : 'Sec') + i + '.py' });
for (let i = 0; i < 20; i++) M.orderRows(M.filterRows(big, 'sec1').rows, { group: 'kind' }); // warm
const takes = [];
for (const q of ['s', 'se', 'sec', 'sec1', 'sec10', 'pt2', '']) { const t0 = performance.now(); M.listPlan({ items: big.slice(0, 43), code: big.slice(43) }, { q, group: 'kind', sort: 'changed' }); takes.push(performance.now() - t0); }
takes.sort((a, b) => a - b);
const med = takes[Math.floor(takes.length / 2)];
console.log(`  · listPlan at 500 rows: median ${med.toFixed(2)} ms, max ${takes[takes.length - 1].toFixed(2)} ms over ${takes.length} queries (information only)`);
// int238 (rel237's Actions red: the runner read a 7.63 ms median against the old `med < 5` pin): a complexity gate counts WORK,
// never the clock (lane-mirror-198, scripts/work-meter.mjs) — the 7 keystrokes' listPlan over n vs 2n rows, judged in a child
const LP = {
  module: path.join(REPO, 'src/lib/artifacts-list-model.js'), kind: 'linear',
  run: "(M, v) => { for (const q of ['s', 'se', 'sec', 'sec1', 'sec10', 'pt2', '']) M.listPlan(v, { q, group: 'kind', sort: 'changed' }); }",
  mk: "(n) => { const T0 = Date.UTC(2026, 9, 7, 12); const rows = Array.from({ length: n }, (_, i) => { const nm = (i % 3 ? 'mod_' : 'Sec') + i + '.py'; "
    + "return { key: 'k' + i, kind: i % 3 ? 'code' : (i % 2 ? 'doc' : 'other'), name: nm, path: '/home/u/p/src/pkg' + (i % 9) + '/' + nm, lastAt: T0 - (i % 17) * 3600e3 - (i % 3) * 60e3, "
    + "writes: i % 4, edits: i % 5, via: i % 5 === 4 ? null : { kind: 'subagent', name: 'pt2:h' + (i % 7) } }; }); "
    + "return { items: rows.filter((r) => r.kind !== 'code'), code: rows.filter((r) => r.kind === 'code') }; }",
};
for (const n of [250, 500]) { const v = judgeInChild({ ...LP, n }); ok(v.ok, `listPlan is LINEAR in WORK over ${n} → ${2 * n} rows (×${(v.r || 0).toFixed(2)} ≤ ${LINEAR_BOUND}: ${v.w1} → ${v.w2} ops)`, v.err || ''); }
{ // CONTROL: a quadratic listPlan copy (a findIndex dedupe over every row) must read red
  const s7 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-alm7-'));
  try {
    const src7 = fs.readFileSync(LP.module, 'utf8'), needle7 = '  const all = [...items, ...code];\n';
    fs.writeFileSync(path.join(s7, 'artifacts-list-model.mjs'), src7.replace(needle7, '  const all = [...items, ...code].filter((r, i, a) => a.findIndex((x) => x.key === r.key) === i);\n'));
    const q7 = judgeInChild({ ...LP, module: path.join(s7, 'artifacts-list-model.mjs'), n: 250 });
    ok(src7.includes(needle7) && !q7.ok && q7.r > LINEAR_BOUND, `CONTROL: a quadratic listPlan copy reads ×${(q7.r || 0).toFixed(2)} over 250 → 500 rows — red`, q7.err || '');
  } finally { fs.rmSync(s7, { recursive: true, force: true }); }
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASSED'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
