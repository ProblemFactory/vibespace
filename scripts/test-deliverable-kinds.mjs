#!/usr/bin/env node
// THE DELIVERABLES BY KIND (the chat status strip, P1 — the owner 2026-11-14 on the drawn strip: «产出部分可以分更细一点，比如把
// 设计/发布页面/文档/图片（如果有的话）这些分开»; 主开发's reading: ONE chip, one count; the kinds INSIDE its panel, each a group with
// its own count in a fixed order, a kind with nothing absent, a press on a kind's head shows that kind alone; the kind OBSERVED from
// what the thing is — never declared, never guessed from a title; the SAME rows as the intent grouping).
//   ① src/artifacts.js deliverableKind over every kind and its edges (an .html never published is a file; a page taken down is still a
//     page; sound and video are files; an uploaded picture is an image; a table is a document) + the words (en / zh / ja)
//   ② every block the list reads carries it (cardBlock `dk`)
//   ③ the list model: the KIND is the default grouping (DEFAULT_VIEW), the groups in DELIVERABLE_ORDER with their counts, an absent kind
//     no group at all, code folded by default
//   ④ ONE KIND ALONE: `only` = a kind's head key ⇒ that kind's rows only, open, its head marked `alone`, no 最近 band; ignored under
//     another grouping; a kind with no rows left ⇒ no section (the panel then shows them all again)
//   ⑤ the window's rail / its rail filter / its kind column sort and the filter's kind word read the deliverable kind
//   ⑥ a row's meta line names its deliverable kind («图片» for a png, «文件» for an mp3)
//   ⑦ the stored view: a v2 «intent» (the old default) reads as the kind default; a v3 intent CHOICE stays
//   ⑧ the panel's wiring (source census): the plan gets `only`, a kind's head toggles it, «Show all» on the alone head
//   ⑨ CONTROLS (patched copies, each RED by name)
// PURE + in-process.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 500) : '')); } return !!c; };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf-8');
const AF = require(path.join(repo, 'src/artifacts.js'));
const M = await import(pathToFileURL(path.join(repo, 'src/lib/artifacts-list-model.js')).href);
const H = '/w/proj';

console.log('— ① the kind is what the thing IS');
const row = (o) => ({ key: ':' + o.path, host: '', name: o.path.split('/').pop(), lastAt: 1, ...o });
const CASES = [
  [{ kind: 'design', path: H + '/designs/home' }, 'design', 'a design canvas'],
  [{ kind: 'page', path: '/p/q3', state: 'published', url: '/p/q3' }, 'page', 'a published page'],
  [{ kind: 'page', path: '/p/old', state: 'unpublished', url: '/p/old', gone: true }, 'page', 'a page taken down (still a page; its row says so)'],
  [{ kind: 'page', path: '/p/x9', presented: true, page: 'x9' }, 'page', 'a page put in this chat'],
  [{ kind: 'page', path: H + '/site/index.html' }, 'file', 'an .html never published — a file'],
  [{ kind: 'doc', path: H + '/a.md' }, 'doc', 'markdown'], [{ kind: 'doc', path: H + '/r.pdf' }, 'doc', 'a pdf'],
  [{ kind: 'doc', path: H + '/m.docx' }, 'doc', 'an office file'], [{ kind: 'doc', path: H + '/t.csv' }, 'doc', 'a table'],
  [{ kind: 'media', path: H + '/p.png' }, 'image', 'a picture'], [{ kind: 'media', path: H + '/d.svg' }, 'image', 'an svg'],
  [{ kind: 'media', path: H + '/s.mp3' }, 'file', 'sound — a file'], [{ kind: 'media', path: H + '/v.mp4' }, 'file', 'video — a file'],
  [{ kind: 'upload', path: H + '/inbox/u.jpg' }, 'image', 'an uploaded picture'], [{ kind: 'upload', path: H + '/inbox/u.pdf' }, 'doc', 'an uploaded pdf'],
  [{ kind: 'upload', path: H + '/inbox/u.zip' }, 'file', 'an uploaded archive'],
  [{ kind: 'service', path: 'svc:web2', url: 'https://web2.example/' }, 'service', 'a server the conversation runs'],
  [{ kind: 'other', path: H + '/x.bin' }, 'file', 'unknown'], [{ kind: 'code', path: H + '/a.py' }, 'code', 'code'],
  [{ kind: 'doc', path: H + '/设计稿.md', name: '设计稿 design.md' }, 'doc', 'a name that says «design» is still a document — never a title guess'],
];
const got = CASES.map(([o]) => AF.deliverableKind(row(o)));
ok(CASES.every(([, want], i) => got[i] === want), 'every row: ' + CASES.map(([o, want, why], i) => `${why} ⇒ ${got[i]}`).join(' · '), CASES.map(([o, w], i) => [o.path, w, got[i]]).filter(([, w, g]) => w !== g));
ok(JSON.stringify(AF.DELIVERABLE_ORDER) === JSON.stringify(['design', 'page', 'doc', 'image', 'service', 'file', 'code']), `the fixed order: ${AF.DELIVERABLE_ORDER.join(' · ')}`);
ok(AF.DELIVERABLE_ORDER.map((k) => AF.deliverableWord(k, 'zh')).join(' · ') === '设计 · 已发布的页面 · 文档 · 图片 · 服务 · 其他文件 · 代码'
  && AF.deliverableWord('page', 'en') === 'Published pages' && AF.deliverableWord('image', 'ja') === '画像' && AF.deliverableWord('nope', 'zh') === '其他文件',
  `the words: ${AF.DELIVERABLE_ORDER.map((k) => AF.deliverableWord(k, 'zh')).join(' · ')}`);

console.log('— ② every block the list reads carries it');
const blocks = CASES.map(([o]) => AF.cardBlock(row(o)));
ok(blocks.every((b, i) => b.dk === got[i]), 'cardBlock(row).dk = deliverableKind(row) for every case');

console.log('— ③ the list groups by kind by default');
const V = { items: blocks.filter((b) => b.kind !== 'code'), code: blocks.filter((b) => b.kind === 'code'), cwd: H, host: '' };
ok(M.DEFAULT_VIEW.group === 'kind' && JSON.stringify(M.KIND_ORDER) === JSON.stringify(AF.DELIVERABLE_ORDER), 'DEFAULT_VIEW.group = kind; the model\'s KIND_ORDER = DELIVERABLE_ORDER');
const plan = M.listPlan(V, { group: 'kind', collapsed: M.DEFAULT_VIEW.collapsed.kind });
const heads = plan.sections.filter((s) => s.head.group === 'kind').map((s) => s.head.label + ' ' + s.head.count);
ok(heads.join(' · ') === 'design 1 · page 3 · doc 6 · image 3 · service 1 · file 5 · code 1', `the groups in order with their counts: ${heads.join(' · ')}`);
ok(plan.sections.find((s) => s.key === 'k:code').open === false && plan.sections.filter((s) => s.key !== 'k:code' && s.head.group === 'kind').every((s) => s.open), 'code folded by default; every other kind open');
const noImg = M.listPlan({ ...V, items: V.items.filter((b) => b.dk !== 'image') }, { group: 'kind' });
ok(!noImg.sections.some((s) => s.key === 'k:image') && !noImg.sections.some((s) => s.head.count === 0), 'a kind with nothing is no group at all — no empty head, no 0');

console.log('— ④ one kind alone');
const alone = M.listPlan(V, { group: 'kind', collapsed: M.DEFAULT_VIEW.collapsed.kind, only: 'k:image' });
ok(alone.alone === 'k:image' && alone.sections.length === 1 && alone.sections[0].key === 'k:image' && alone.sections[0].head.alone === true && alone.sections[0].open && alone.sections[0].rows.length === 3,
  `only k:image ⇒ one open section, its head marked alone (${alone.sections.map((s) => s.key).join()})`);
const aloneCode = M.listPlan(V, { group: 'kind', collapsed: ['k:code'], only: 'k:code' });
ok(aloneCode.sections.length === 1 && aloneCode.sections[0].open, 'a folded kind (code) shown alone is open');
ok(M.listPlan(V, { group: 'intent', only: 'k:image' }).alone === '' && M.listPlan(V, { group: 'intent', only: 'k:image' }).sections.length > 1, 'under another grouping `only` is ignored');
const many = { ...V, items: [...V.items, ...Array.from({ length: 9 }, (_, i) => AF.cardBlock(row({ kind: 'doc', path: H + `/n/${i}.md`, lastAt: 100 + i })))] };
ok(!M.listPlan(many, { group: 'kind', only: 'k:doc' }).sections.some((s) => s.key === 'recent'), 'no 最近 band while one kind is alone');
ok(M.listPlan({ ...V, items: V.items.filter((b) => b.dk !== 'image') }, { group: 'kind', only: 'k:image' }).sections.length === 0, 'a kind with no rows left ⇒ no section (the panel shows them all again)');

console.log('— ⑤ the window\'s rail, its filter, its kind sort, the filter\'s kind word');
const rail = M.railOf(M.rowsOfView(V));
ok(rail.kinds.map((k) => k.label).join() === 'design,page,doc,image,service,file,code' && M.railRows(M.rowsOfView(V), 'k:image').every((b) => b.dk === 'image') && M.railRows(M.rowsOfView(V), 'k:image').length === 3, `the rail's kinds: ${rail.kinds.map((k) => k.label + ' ' + k.count).join(' · ')}`);
const sorted = M.sortRows(M.rowsOfView(V), { col: 'kind' }).map((b) => b.dk);
ok(sorted.every((k, i) => i === 0 || AF.DELIVERABLE_ORDER.indexOf(sorted[i - 1]) <= AF.DELIVERABLE_ORDER.indexOf(k)), `the kind column sorts by the deliverable kind's order (${[...new Set(sorted)].join(' → ')})`);
const zhKw = (k) => AF.kindWord(k, 'zh'), enKw = (k) => AF.kindWord(k, 'en');
ok(M.filterRows(M.rowsOfView(V), '图片', { kindWord: zhKw }).rows.every((b) => b.dk === 'image') && M.filterRows(M.rowsOfView(V), '图片', { kindWord: zhKw }).rows.length === 3
  && M.filterRows(M.rowsOfView(V), 'ima', { kindWord: enKw }).rows.filter((b) => b.dk === 'image').length === 3, 'the filter reads the deliverable kind\'s word: «图片» finds the three pictures; «ima» their English word\'s start');

console.log('— ⑥ a row\'s meta line names its deliverable kind');
const kw = (b) => M.rowWords(b, { kindWord: zhKw, cwd: H }).kind;
ok(kw(blocks[9]) === '图片' && kw(blocks[11]) === '文件' && kw(blocks[13]) === '图片' && kw(blocks[5]) === '文档', `png «${kw(blocks[9])}» · mp3 «${kw(blocks[11])}» · uploaded jpg «${kw(blocks[13])}» · md «${kw(blocks[5])}»`);

console.log('— ⑦ the stored view');
ok(M.viewFrom({ v: 2, group: 'intent' }).group === 'kind' && M.viewFrom({ v: 3, group: 'intent' }).group === 'intent' && M.viewFrom(null).group === 'kind' && M.viewFrom({ v: 2, group: 'helper' }).group === 'helper' && M.viewFrom({ v: 2, group: 'intent' }).v === 3,
  'a v2 «intent» (the old default, never a choice) ⇒ kind; a v3 intent choice stays; a helper choice stays; saved as v3');

console.log('— ⑧ the panel\'s wiring (source census)');
const card = read('src/lib/artifact-card.js');
ok(/listPlan\(st\.v, \{[^}]*only: st\.only \}\)/.test(card) && /st\.view\.group === 'kind' && \/\^k:\/\.test\(s\.key\)\) \{ st\.only = st\.only === s\.key \? '' : s\.key;/.test(card) && /const all = kindHead \? \(s\.head\.alone \? t\('Show all'\) : t\('Only this kind'\)\) : ''/.test(card) && /kindHead \? '' : \(s\.open \? UI_ICONS\.chevronDown/.test(card) && /deliverableWord\(h\.label, lang\(\)\)/.test(card)
  && /\.chat-artifact-head\[data-kind-head="true"\] \.af-head-chev \{ display: none; \}/.test(read('public/chat.css')),
  'the plan gets `only`; a KIND\'s head toggles it and SAYS what its press does — «Only this kind», alone «Show all» — with no fold arrow (主开发 00:07Z); a kind head says the deliverable word');
ok(/intent: intentOf\(row\), dk: deliverableKind\(row\),/.test(read('src/artifacts.js')), 'cardBlock carries dk beside the intent');

console.log('— ⑨ CONTROLS');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-deliverable-kinds-'));
process.on('exit', () => { try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { } });
const afSrc = read('src/artifacts.js');
const afCopy = (tag, from, to) => { if (!afSrc.includes(from)) return null; const d = path.join(scratch, tag, 'src'); fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(path.join(repo, 'src')).filter((x) => /\.js$/.test(x))) fs.copyFileSync(path.join(repo, 'src', f), path.join(d, f)); fs.writeFileSync(path.join(d, 'artifacts.js'), afSrc.replace(from, to)); return require(path.join(d, 'artifacts.js')); };
const byTitle = afCopy('title', "  const e = FILE_TYPES[extOf(r.path)];", "  if (/design|设计/i.test(String(r.name || ''))) return 'design';\n  const e = FILE_TYPES[extOf(r.path)];");
ok(byTitle && byTitle.deliverableKind(row({ kind: 'doc', path: H + '/设计稿.md', name: '设计稿 design.md' })) === 'design', 'CONTROL a kind guessed from the title ⇒ the «设计稿 design.md» leg is RED');
const anyPage = afCopy('anypage', "  if (r.presented || (r.kind === 'page' && (r.state === 'published'", "  if (r.presented || (r.kind === 'page' || (r.state === 'published'");
ok(anyPage && anyPage.deliverableKind(row({ kind: 'page', path: H + '/site/index.html' })) === 'page', 'CONTROL every kind-page row a published page ⇒ the never-published .html leg is RED');
const media = afCopy('media', "  if (cat === 'image') return 'image';", "  if (cat === 'image' || cat === 'audio' || cat === 'video') return 'image';");
ok(media && media.deliverableKind(row({ kind: 'media', path: H + '/s.mp3' })) === 'image', 'CONTROL sound counted a picture ⇒ the mp3 leg is RED');
const mSrc = read('src/lib/artifacts-list-model.js');
const mCopy = async (tag, from, to) => { if (!mSrc.includes(from)) return null; const f = path.join(scratch, `model-${tag}.mjs`); fs.writeFileSync(f, mSrc.replace(from, to)); return import(pathToFileURL(f).href); };
const rawKind = await mCopy('raw', "export const kindKey = (r) => (r && KIND_ORDER.includes(r.dk) ? r.dk : (r && RAW_KIND[r.kind]) || 'file');", "export const kindKey = (r) => (r && RAW_KIND[r.kind]) || 'file';");
ok(rawKind && rawKind.listPlan(V, { group: 'kind' }).sections.filter((s) => s.head.group === 'kind').map((s) => s.head.label + ' ' + s.head.count).join(' · ') !== heads.join(' · '), 'CONTROL the list grouping by the RAW kind (not dk) ⇒ the groups leg is RED');
const noAlone = await mCopy('noalone', "  const all = alone ? railRows([...items, ...code], alone) : [...items, ...code];", "  const all = [...items, ...code];");
ok(noAlone && noAlone.listPlan(V, { group: 'kind', only: 'k:image' }).sections.length > 1, 'CONTROL `only` not applied ⇒ the alone leg is RED');

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
