#!/usr/bin/env node
// THE PAGES CHIP'S TWO GROUPS (lane pages-chip-groups, owner 2026-10-08 "可以，不过要分组"; B-aa28) — src/lib/pages-chip-model.js
// (PURE) + the chat status bar's popover list drawn from it (the REAL ChatStatusBar through a small fake DOM, like
// test-status-bar-chips):
//   ① groups — own ("Published by this conversation") then shown ("Shown here"), never mixed; a design's page rides its
//     design row (F2), never the own group; a page in both lists is own only; counts + the tooltip's split
//   ② words — a shown row names its publisher / "from another conversation" / "no longer published"; en / zh / ja
//   ③ the popover — head line per group, rows KEYED: a new shown page inserts one row, the others keep their element;
//     a page going gone replaces only its row; an emptied group drops its head
//   ④ CONTROL — a patched model copy that puts the shown pages in the own group fails ①
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { scratchDir } from './scratch.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra) : '')); } };
const MODEL = path.join(repo, 'src/lib/pages-chip-model.js');
const M = await import(pathToFileURL(MODEL).href);
const zh = (await import(pathToFileURL(path.join(repo, 'src/lib/i18n-zh.js')).href)).default;
const ja = (await import(pathToFileURL(path.join(repo, 'src/lib/i18n-ja.js')).href)).default;
const tOf = (dict) => (s, v) => String((dict && dict[s]) || s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? String(v[k]) : m));

const own = [
  { id: 'pgown0000001', name: 'Report', srcKey: 'local:/w/report.html', path: '/p/pgown0000001', public: true, updatedAt: 10 },
  { id: 'pgown0000002', name: 'Poster', srcKey: 'local:/w/design-a', path: '/p/pgown0000002', public: false, updatedAt: 20 }, // design-a's page
  { id: 'pgown0000003', name: 'Older', srcKey: 'local:/w/older.html', path: '/p/pgown0000003', updatedAt: 5 },
];
const designs = [{ dir: '/w/design-a', title: 'Poster design' }];
const shown = (id, extra = {}) => ({ type: 'artifact', kind: 'page', presented: true, page: id, key: ':/p/' + id, name: 'Tour ' + id.slice(-1), url: '/p/' + id, publisher: 'Publisher', public: true, lastAt: 100, ...extra });
const presented = [shown('pgshow000001', { lastAt: 100 }), shown('pgshow000002', { lastAt: 200, publisher: '' }), shown('pgshow000003', { lastAt: 50, gone: true, publisher: '' }), shown('pgown0000001', { lastAt: 300 })];

console.log('— ① two groups, never mixed');
const run = (Mod, t) => Mod.pagesChipGroups({ own, presented, designs, t });
function groupsOk(v) {
  const [g0, g1] = v.groups;
  return g0.key === 'own' && g1.key === 'shown' && g0.rows.every((r) => r.group === 'own') && g1.rows.every((r) => r.group === 'shown')
    && g0.rows.map((r) => r.id).join() === 'pgown0000001,pgown0000003' && g1.rows.map((r) => r.id).join() === 'pgshow000002,pgshow000001,pgshow000003';
}
{
  const v = run(M);
  ok(groupsOk(v), '① own (newest first, the design\'s page left on its design row) then shown (newest mention first); an own page also linked here is own only', v.groups.map((g) => [g.key, g.rows.map((r) => r.id)]));
  ok(v.groups[0].label === 'Published by this conversation' && v.groups[1].label === 'Shown here', '① the group heads', v.groups.map((g) => g.label));
  ok(v.ownCount === 2 && v.shownCount === 3 && v.chipCount === 1 + 2 + 3, '① chipCount = designs + own + shown (1 + 2 + 3)', [v.ownCount, v.shownCount, v.chipCount]);
  ok(v.tip === '3 from this conversation · 3 shown here — click to open one or request a design', '① the tooltip spells the split', v.tip);
  const none = M.pagesChipGroups({ own: own.slice(0, 1), presented: [], designs: [] });
  ok(none.tip === '1 design(s) and page(s) from this session — click to open one or request a design' && none.groups[1].rows.length === 0 && none.chipCount === 1, '① nothing shown here ⇒ the sentence of before, an empty shown group', none.tip);
  ok(M.pagesChipGroups({}).chipCount === 0 && /^Request a design canvas/.test(M.pagesChipGroups({}).tip), '① nothing at all ⇒ count 0 and the request sentence');
  ok(M.pageOfDesign(designs[0], own)?.id === 'pgown0000002' && M.pageOfDesign({ dir: '/x', page: { id: 'pgown0000003' } }, own)?.id === 'pgown0000003', '① pageOfDesign: by srcKey, or by the id GET /api/designs named');
}

console.log('— ② a row\'s words, en / zh / ja');
{
  const words = (t) => run(M, t).groups[1].rows.map((r) => r.words);
  ok(words().join(' | ') === 'from another conversation | from Publisher | no longer published', '② en: no live publisher name / the publisher\'s name / gone', words());
  ok(words(tOf(zh)).join(' | ') === '来自另一个会话 | 来自 Publisher | 已不再发布' && run(M, tOf(zh)).groups.map((g) => g.label).join() === '本会话发布的,在这里展示过的', '② zh', words(tOf(zh)));
  ok(words(tOf(ja)).join(' | ') === '別の会話から | Publisher から | 公開終了' && run(M, tOf(ja)).groups.map((g) => g.label).join() === 'この会話が公開したもの,ここで表示されたもの', '② ja', words(tOf(ja)));
  ok(run(M, tOf(zh)).tip.includes('3') && run(M, tOf(zh)).tip !== run(M).tip && run(M, tOf(ja)).tip !== run(M).tip, '② the split tooltip is translated (zh, ja)');
  const g = run(M).groups[1].rows.find((r) => r.id === 'pgshow000003');
  ok(g.gone === true && g.url === '/p/pgshow000003', '② a gone row keeps its /p/ link (it answers "unpublished")');
}

console.log('— ③ the popover list: heads + keyed rows (the REAL ChatStatusBar)');
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.childNodes = []; this.parentNode = null; this.className = ''; this.textContent = ''; this.title = ''; this.style = {}; this._cls = new Set(); const self = this; this.classList = { toggle(c, on) { if (on === undefined ? !self._cls.has(c) : on) self._cls.add(c); else self._cls.delete(c); }, add(c) { self._cls.add(c); }, contains(c) { return self._cls.has(c); } }; }
  get children() { return this.childNodes.slice(); }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
  get isConnected() { return true; }
  append(...ns) { for (const n of ns) this.insertBefore(n, null); }
  appendChild(n) { return this.insertBefore(n, null); }
  insertBefore(n, ref) {
    if (ref && ref.parentNode !== this) throw new Error('insertBefore: reference is not a child');
    if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
    n.parentNode = this; return n;
  }
  remove() { if (this.parentNode) { this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null; } }
  replaceChildren() { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; }
  addEventListener() {}
  setAttribute() {} getAttribute() { return null; } removeAttribute() {}
}
const { ChatStatusBar } = await import(pathToFileURL(path.join(repo, 'src/lib/chat-status-bar.js')).href);
globalThis.document = { createElement: (t) => new El(t) };
globalThis.location = { origin: 'https://vs.test', href: 'https://vs.test/' }; // absUrl joins a relative /p/ path with it
async function drive(Bar) {
  const bar = new Bar({ send() {} }, 'sid-pages', { backend: 'claude', getToolMsg: () => null, openSubagentViewer() {}, openInTempEditor() {}, onSearch: () => {}, onDesignRequest: () => {} });
  const list = new El('div');
  bar._designListEl = list;
  bar.setDesigns(designs);
  bar.setPages(own);
  const feed = (items) => bar.setArtifacts({ ok: true, items, code: [], count: items.length, codeCount: 0 });
  feed([presented[0], presented[2]]);
  const sig = () => list.children.map((el) => (el.className === 'chat-design-group-head' ? 'H:' + el.textContent : el._pcKey));
  const s1 = sig(), els1 = new Map(list.children.map((el) => [el._pcKey, el]));
  feed([presented[0], presented[2], presented[1]]); // a new page shown here
  const s2 = sig(), keptSame = list.children.filter((el) => els1.get(el._pcKey) === el).length;
  feed([presented[0], { ...presented[2] }, { ...presented[1], gone: true, publisher: '' }]); // pgshow000002 goes gone
  const s3 = sig(), els3 = new Map(list.children.map((el) => [el._pcKey, el]));
  const goneEl = els3.get('shown:pgshow000002');
  feed([]);
  const s4 = sig();
  const chip = bar._pagesChip();
  bar.dispose?.();
  return { s1, s2, s3, s4, keptSame, n2: s2.length, goneReplaced: goneEl && /chat-design-gone/.test(goneEl.className), otherKept: els3.get('shown:pgshow000001') === els1.get('shown:pgshow000001'), chip, hidden: list._cls.has('hidden') };
}
{
  const v = await drive(ChatStatusBar);
  ok(v.s1.join() === 'H:Published by this conversation,own:pgown0000001,own:pgown0000003,H:Shown here,shown:pgshow000001,shown:pgshow000003', '③ the list: a head per group, own rows then shown rows (the design\'s page is not in the list)', v.s1);
  ok(v.s2.join() === 'H:Published by this conversation,own:pgown0000001,own:pgown0000003,H:Shown here,shown:pgshow000002,shown:pgshow000001,shown:pgshow000003' && v.keptSame === v.n2 - 1, `③ a new page shown here inserts ONE row; the other ${v.n2 - 1} keep their element (keyed, no repaint)`, [v.s2, v.keptSame]);
  ok(v.goneReplaced && v.otherKept, '③ a page going gone replaces only its own row (drawn gone); its neighbours keep their element');
  ok(v.s4.join() === 'H:Published by this conversation,own:pgown0000001,own:pgown0000003', '③ nothing shown any more ⇒ the shown group and its head leave', v.s4);
  const src = fs.readFileSync(path.join(repo, 'src/lib/chat-status-bar.js'), 'utf8');
  const refill = src.slice(src.indexOf('\n  _refillDesignList() {'), src.indexOf('\n    const dl = this._designsEl;'));
  ok(refill.length > 0 && !/replaceChildren\(|innerHTML/.test(refill) && /pagesChipGroups\(/.test(src) && /const pc = this\._pagesChip\(\);[^\n]*\n\s*const n = pc\.chipCount, dTitle = pc\.tip;/.test(src), '③ pins: the pages list is patched by key (no replaceChildren / innerHTML), the chip\'s number + tooltip are the model\'s');
}

console.log('— ④ CONTROL: a model copy that mixes the groups');
{
  const src = fs.readFileSync(MODEL, 'utf8');
  const line = "rows: ownRows }, { key: 'shown', label: t('Shown here'), rows: shownRows }";
  const mixed = src.replace(line, "rows: ownRows.concat(shownRows) }, { key: 'shown', label: t('Shown here'), rows: [] }");
  ok(mixed !== src, '④ the patch landed');
  const dir = scratchDir('pages-chip-model');
  try {
    const f = path.join(dir, 'pages-chip-model.mixed.mjs');
    fs.writeFileSync(f, mixed);
    const MX = await import(pathToFileURL(f).href);
    ok(!groupsOk(run(MX)), '④ the mixed copy FAILS the ① groups check (it can fail)');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  ok(/\{ name: 'test-pages-chip-model', tier: 'fast'/.test(fs.readFileSync(path.join(repo, 'scripts/ci.mjs'), 'utf8')), '④ ci.mjs carries test-pages-chip-model in the fast tier');
  ok(!/^\s*import\s/m.test(src) && !/require\(/.test(src), '④ the model imports nothing (PURE; t injected)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
