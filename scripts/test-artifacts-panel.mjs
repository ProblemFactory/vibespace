#!/usr/bin/env node
// THE ARTIFACTS POPOVER + WINDOW — the DOM half (lane artifacts-list-scale, design 021 E1–E9 + the owner's ⤢ window B).
// The REAL src/lib/artifact-card.js renderArtifactList and src/lib/artifacts-window.js (through esbuild, their app-level
// imports stubbed; the PURE model and src/artifacts.js real) over a mini element tree: the bounded panel (class + the
// chat.css rule), the KEYED IDENTITY census across a filter / a group switch / a live patch (no surviving row node
// replaced), the group / sort memory round trip (device-kept view), the ⋯ census per kind (none disabled), keyboard
// (`/`, ↑ ↓, Enter, Esc clears then lets the popover close), the 最近 band rule, the ⤢, a name's text never markup, the
// eviction note last; the window: rail counts, rail click = group filter, column sort, the same model's order, rows
// patched in place, the live relay, the registration. CONTROLS (patched copies, each RED): an unbounded panel, rows
// rebuilt instead of patched, the window without the shared model.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(REPO, 'src/lib');
const esbuild = (await import(pathToFileURL(path.join(REPO, 'node_modules/esbuild/lib/main.js')).href)).default;
const M = await import(pathToFileURL(path.join(LIB, 'artifacts-list-model.js')).href);
let pass = 0, fail = 0;
const ok = (c, msg, why = '') => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (why ? ' — ' + why : '')); } };

// ── the mini element tree ──
let DOC;
function fire(el, type, props = {}) {
  const ev = { type, target: el, isComposing: false, defaultPrevented: false, stopped: false, ...props, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
  for (let n = el; n && !ev.stopped; n = n.parentNode) for (const fn of [...(n.listeners[type] || [])]) { ev.currentTarget = n; fn(ev); }
  return ev;
}
class N {
  constructor(tag, text) { this.tagName = tag; this.childNodes = []; this.parentNode = null; this._cls = new Set(); this.dataset = {}; this.attrs = {}; this.listeners = {}; this.title = ''; this._t = text == null ? '' : String(text); this.value = ''; this.style = { setProperty(k, v) { this[k] = v; } }; }
  get className() { return [...this._cls].join(' '); } set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() { const n = this; return { add: (...c) => c.forEach((x) => n._cls.add(x)), remove: (...c) => c.forEach((x) => n._cls.delete(x)), contains: (c) => n._cls.has(c), toggle: (c, f) => { const on = f === undefined ? !n._cls.has(c) : !!f; if (on) n._cls.add(c); else n._cls.delete(c); return on; } }; }
  get children() { return this.childNodes.filter((c) => c.tagName !== '#text'); }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() { const p = this.parentNode; return p ? p.childNodes[p.childNodes.indexOf(this) + 1] || null : null; }
  _detach() { if (this.parentNode) { const a = this.parentNode.childNodes; a.splice(a.indexOf(this), 1); this.parentNode = null; } }
  appendChild(c) { c._detach(); c.parentNode = this; this.childNodes.push(c); return c; }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? new N('#text', c) : c); }
  insertBefore(c, ref) { if (!ref) return this.appendChild(c); c._detach(); c.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, c); return c; }
  remove() { this._detach(); }
  get textContent() { return this.tagName === '#text' || !this.childNodes.length ? this._t : this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this._t = String(v); this._h = ''; }
  set innerHTML(v) { this.textContent = ''; this._h = String(v); } get innerHTML() { return this._h || ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  focus() { DOC.activeElement = this; } click() { fire(this, 'click'); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  matches(sel) { const m = /^((?:\.[\w-]+)+)(?:\[data-([\w-]+)\])?$/.exec(sel); if (!m) throw new Error('mini-DOM selector ' + sel); return m[1].slice(1).split('.').every((c) => this._cls.has(c)) && (!m[2] || this.dataset[m[2]] !== undefined); }
  querySelectorAll(sel) { const out = [], sels = sel.split(',').map((s) => s.trim()); const walk = (n) => { for (const c of n.childNodes) if (c.tagName !== '#text') { if (sels.some((s) => c.matches(s))) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
DOC = { createElement: (t) => new N(t), createTextNode: (s) => new N('#text', s), activeElement: null };
globalThis.document = DOC;
globalThis.window = { open() { } };
const STORE = new Map();
globalThis.localStorage = { getItem: (k) => (STORE.has(k) ? STORE.get(k) : null), setItem: (k, v) => STORE.set(k, String(v)), removeItem: (k) => STORE.delete(k) };

// ── the modules (real, app-level imports stubbed) ──
const STUBS = {
  './i18n.js': "export const t = (s, v) => String(s).replace(/\\{(\\w+)\\}/g, (_, k) => (v && v[k] != null ? v[k] : '')); export const resolveLang = () => 'en';",
  './file-types.js': "export const getFileIcon = () => '<svg/>';",
  './user-todos-row.js': "export const agoText = () => 'ago';",
  './icons.js': "export const UI_ICONS = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? '<svg data-i=\"' + k + '\"/>' : undefined) });",
  './utils.js': "export const absUrl = (s) => String(s || ''); export const showContextMenu = (x, y, items) => { globalThis.__menu = items; }; export const copyText = (s) => { globalThis.__copied = s; };",
  './window-types.js': "export const replayOpenSpec = () => null; export const svgIcon16 = (d) => d; export const registerWindowType = (r) => { (globalThis.__wt ||= []).push(r); };",
};
let gen = 0;
async function load(patch = {}) {
  const plug = { name: 'stub', setup(b) {
    b.onResolve({ filter: /^\.\/[\w-]+\.js$/ }, (a) => (STUBS[a.path] ? { path: a.path, namespace: 'stub' } : null));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
    b.onLoad({ filter: /src\/lib\/(artifact-card|artifacts-window|artifacts-list-model)\.js$/ }, (a) => { const k = path.basename(a.path); return patch[k] ? { contents: patch[k], loader: 'js', resolveDir: LIB } : null; });
  } };
  const r = await esbuild.build({ stdin: { contents: "export * from './artifact-card.js'; export * as W from './artifacts-window.js'; // " + (gen++), resolveDir: LIB, sourcefile: 'entry.js', loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'neutral', plugins: [plug], logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
}
const SRC = { card: fs.readFileSync(path.join(LIB, 'artifact-card.js'), 'utf8'), win: fs.readFileSync(path.join(LIB, 'artifacts-window.js'), 'utf8'), css: fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8') };

// ── the fixture: 43 deliverables + 174 code (the owner's conversation; synthetic paths) ──
const T0 = Date.UTC(2026, 9, 7, 12), H = 3600e3;
function fixture() {
  const rows = []; let k = 0;
  const hs = ['pt2:fix', 'pt2:build-core', 'seg:access'];
  const add = (kind, name, dir, i, extra = {}) => rows.push({ key: `local:/w/${dir}/${name}#${k++}`, kind, name, path: `/w/${dir}/${name}`, lastAt: T0 - i * 60e3, writes: 1, edits: i % 4, by: 'agent', ...(i % 4 === 3 ? {} : { via: { kind: 'subagent', name: hs[i % 3] } }), ...extra });
  for (let i = 0; i < 20; i++) add('doc', i === 0 ? 'sec10_tail.md' : `doc_${i}.md`, 'out', i + 10);
  rows.push({ key: 'service:web', kind: 'service', name: 'house3d-web2-2', path: '', url: '/proxy/web2/', state: 'running', since: T0 - H, lastAt: T0 - H, writes: 0, edits: 0, jobId: 'j1' });
  add('page', 'index.html', 'web', 40);
  add('doc', 'handed.md', 'out', 41, { via: { kind: 'handover', from: { cid: 'cid-helper-a', name: 'helper-A' }, at: T0 } });
  for (let i = 0; i < 20; i++) add('other', `file_${i}.bin`, 'files', i + 50);
  for (let i = 0; i < 174; i++) add('code', `mod_${i}.py`, `src/pkg${i % 9}`, i < 3 ? i : i + 100);
  return rows;
}
const ROWS = fixture();
const viewOf = (rows, extra = {}) => ({ ok: true, items: rows.filter((r) => r.kind !== 'code'), code: rows.filter((r) => r.kind === 'code'), count: rows.filter((r) => r.kind !== 'code').length, codeCount: rows.filter((r) => r.kind === 'code').length, ...extra });
const V = viewOf(ROWS);
const APP = { openFileExplorer() { }, openJobs() { }, sidebar: { _allSessions: [] }, attachSession() { }, viewSession() { } };

// ── the legs (each returns its verdict; the controls run the same legs on patched copies) ──
const rowsIn = (box) => box.querySelectorAll('.chat-artifact-row');
const typeQ = (ctrl, q) => { ctrl.input.value = q; fire(ctrl.input, 'input'); };
async function legIdentity(mod) {
  STORE.clear();
  const box = new N('div'); const c = mod.renderArtifactList(box, V, { onOpen() { }, close() { }, app: APP, onExpand() { } });
  const before = new Map(rowsIn(box).map((n) => [n.dataset.key + (n.parentNode === c.list ? '' : '?') + (rowsIn(box).indexOf(n) < 5 ? '#band' : ''), n]));
  const byKey = (b) => new Map(rowsIn(b).map((n) => [n.dataset.key, n]));
  const k0 = byKey(box);
  typeQ(c, 'doc_1');
  const k1 = byKey(box);
  const survived = [...k1.keys()].filter((k) => k0.has(k));
  const sameAfterFilter = survived.length > 0 && survived.every((k) => k1.get(k) === k0.get(k));
  typeQ(c, '');
  const k2 = byKey(box);
  const sameAfterClear = [...k0.keys()].every((k) => k2.get(k) === k0.get(k));
  const doc0 = ROWS.find((r) => r.name === 'doc_1.md');
  const live = viewOf(ROWS.map((r) => (r === doc0 ? { ...r, edits: 9 } : r)));
  c.update(live);
  const k3 = byKey(box);
  const patched = k3.get(doc0.key) === k0.get(doc0.key) && /Changed 9 times/.test(k3.get(doc0.key).querySelector('.chat-artifact-meta').textContent);
  return { sameAfterFilter, sameAfterClear, patched, survived: survived.length, before: before.size };
}
function cssBounded(css) {
  const body = (sel) => { const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css.replace(/\/\*[\s\S]*?\*\//g, '')); return m ? m[1] : ''; };
  const panel = body('.chat-status-dropdown.chat-artifacts-panel'), list = body('.chat-artifacts-panel .af-list'), top = body('.chat-artifacts-panel .af-top');
  return /max-height:\s*min\(calc\(100vh\s*-\s*var\(--taskbar-height[^)]*\)\s*-\s*24px\),\s*var\(--af-room/.test(panel) && /display:\s*flex/.test(panel) && /flex-direction:\s*column/.test(panel) && /overflow-y:\s*auto/.test(list) && /min-height:\s*0/.test(list) && /position:\s*sticky/.test(top);
}
async function legWindowModel(mod) {
  const root = new N('div');
  const w = mod.W.mountArtifactsWindow(root, { app: APP, sessionId: 's1', fetchView: async () => V });
  await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  const order = () => w.tbody.querySelectorAll('.af-trow').map((n) => n.dataset.key).join('\n');
  const want = (st) => M.sortRows(M.filterRows(M.railRows(M.rowsOfView(V), st.rail || 'all'), st.q || '').rows, { col: st.col || 'changed', dir: st.dir || '' }).map((r) => r.key).join('\n');
  const out = { all: order() === want({}), n: w.tbody.querySelectorAll('.af-trow').length };
  const railEl = (k) => w.rail.querySelectorAll('.af-rail-item').find((n) => n.dataset.rail === k);
  fire(railEl('k:code'), 'click'); out.code = order() === want({ rail: 'k:code' }) && w.tbody.querySelectorAll('.af-trow').length === 174;
  fire(railEl('h:pt2:fix'), 'click'); out.helperRail = order() === want({ rail: 'h:pt2:fix' }) && w.tbody.querySelectorAll('.af-trow').length > 0;
  fire(railEl('all'), 'click');
  const rowsBefore = new Map(w.tbody.querySelectorAll('.af-trow').map((n) => [n.dataset.key, n]));
  const th = (c) => root.querySelectorAll('.af-th[data-col]').find((n) => n.dataset.col === c);
  fire(th('name'), 'click'); out.nameSort = order() === want({ col: 'name' }) && th('name').dataset.dir === 'asc';
  fire(th('name'), 'click'); out.nameRev = order() === want({ col: 'name', dir: 'desc' }) && th('name').dataset.dir === 'desc';
  out.kept = w.tbody.querySelectorAll('.af-trow').every((n) => rowsBefore.get(n.dataset.key) === n);
  w.input.value = 'pt2:fix'; fire(w.input, 'input');
  out.filter = order() === want({ col: 'name', dir: 'desc', q: 'pt2:fix' }) && w.tbody.querySelectorAll('.af-trow').length > 0;
  w.input.value = ''; fire(w.input, 'input');
  const extra = { key: 'local:/w/out/new.md', kind: 'doc', name: 'new.md', path: '/w/out/new.md', lastAt: T0 + H, writes: 1, edits: 0 };
  mod.publishArtifacts('s1', viewOf([...ROWS, extra]));
  out.live = w.tbody.querySelectorAll('.af-trow').some((n) => n.dataset.key === extra.key) && w.rail.querySelector('.af-rail-n').textContent === String(ROWS.length + 1);
  out.rail = w.rail.querySelectorAll('.af-rail-item').map((n) => n.dataset.rail + ':' + n.querySelector('.af-rail-n').textContent).join(' ');
  return out;
}

console.log('① the popover is BOUNDED and keyed (the real renderArtifactList)');
const mod = await load();
STORE.clear();
const box = new N('div'); let opened = null, closed = 0, expanded = 0;
const ctrl = mod.renderArtifactList(box, V, { onOpen: (b) => { opened = b; }, close: () => { closed++; }, app: APP, onExpand: () => { expanded++; } });
ok(box.classList.contains('chat-artifacts-panel') && box._afList === ctrl && box.querySelector('.af-top') && box.querySelector('.af-list'), 'the panel carries .chat-artifacts-panel, a sticky .af-top and the scrolling .af-list; box._afList = the controller');
ok(cssBounded(SRC.css), 'chat.css: the panel is a column with max-height min(viewport − taskbar − 24 px, the room above the chip); the list scrolls (overflow-y auto, min-height 0); the top is sticky');
const heads = box.querySelectorAll('.chat-artifact-head').map((h) => h.dataset.group);
ok(heads.join() === 'recent,k:doc,k:service,k:page,k:other,k:code', `heads: the 最近 band then the kinds, code last (${heads.join(' ')})`);
const codeHead = box.querySelectorAll('.chat-artifact-head').find((h) => h.dataset.group === 'k:code');
ok(codeHead.dataset.fold === 'shut' && codeHead.textContent.includes('Code · 174') && rowsIn(box).filter((r) => r.dataset.kind === 'code').length === 3, `代码 collapsed by default ("${codeHead.textContent}"); only the band's newest code shows (${rowsIn(box).filter((r) => r.dataset.kind === 'code').length})`);
ok(box.querySelector('.af-count').textContent === '43 artifacts · 174 code files', `the count line: "${box.querySelector('.af-count').textContent}"`);
ok(!!box.querySelector('.af-expand'), 'the ⤢ "Open in a window" button is in the top bar');
fire(box.querySelector('.af-expand'), 'click');
ok(expanded === 1 && closed === 1, 'the ⤢ closes the popover and opens the window (onExpand)');

console.log('② the KEYED IDENTITY census (no surviving row node replaced)');
const id = await legIdentity(mod);
ok(id.sameAfterFilter, `typing "doc_1": the ${id.survived} surviving rows are the SAME nodes`);
ok(id.sameAfterClear, 'clearing the filter: every row is the node it was before');
ok(id.patched, 'a live refresh (edits 0 → 9): the same node, its meta words patched');

console.log('③ the filter: band hides, a collapsed group with matches opens, the count line, zero matches, Esc');
typeQ(ctrl, 'pkg3/');
ok(!box.querySelector('.af-head-recent') && rowsIn(box).length > 0 && rowsIn(box).every((r) => r.dataset.kind === 'code') && box.querySelectorAll('.chat-artifact-head').find((h) => h.dataset.group === 'k:code').dataset.fold === 'open', `"pkg3/": the band hides, 代码 opens for the filter (${rowsIn(box).length} rows)`);
ok(/^\d+ matches · \d+ code$/.test(box.querySelector('.af-count').textContent), `count while filtering: "${box.querySelector('.af-count').textContent}"`);
typeQ(ctrl, 'sec10');
const nm = rowsIn(box)[0].querySelector('.chat-artifact-name');
ok(nm.childNodes.length === 3 && nm.childNodes[1].tagName === 'mark' && nm.childNodes[1].textContent === 'sec10' && !nm.innerHTML, 'the match is ONE <mark> between text nodes (never innerHTML)');
typeQ(ctrl, 'zzzz');
ok(!!box.querySelector('.af-empty') && rowsIn(box).length === 0, 'zero matches: one note "No matching artifacts"');
const esc1 = fire(ctrl.input, 'keydown', { key: 'Escape' });
ok(esc1.stopped && ctrl.input.value === '' && rowsIn(box).length > 0, 'Esc with text: clears the filter and stops (the popover stays)');
const esc2 = fire(ctrl.input, 'keydown', { key: 'Escape' });
ok(!esc2.stopped, 'Esc with an empty filter: passes on (app.js closes the [data-popover])');
ok(M.viewFrom(JSON.parse(STORE.get('vs-artifacts-view') || 'null')).collapsed.kind.includes('k:code'), 'filtering never touched the remembered fold (代码 still collapsed)');

console.log('④ group / sort: the menus, the device-kept memory round trip');
fire(box.querySelector('.af-group'), 'click');
const gm = globalThis.__menu;
ok(gm.length === 3 && gm.map((i) => i.label).join() === 'By kind,By helper,By day' && /chan-menu-check-on/.test(gm[0].labelHtml) && !/chan-menu-check-on/.test(gm[1].labelHtml), 'group ▾: kind · helper · day, the current one checked');
gm[1].action();
fire(box.querySelector('.af-sort'), 'click'); globalThis.__menu[2].action();
ok(box.querySelectorAll('.chat-artifact-head').filter((h) => h.dataset.group !== 'recent').every((h) => h.dataset.group.startsWith('h:')), 'by helper: every head is a helper group');
const box2 = new N('div'); mod.renderArtifactList(box2, V, { app: APP });
ok(box2.querySelector('.af-group').textContent === 'By helper' && box2.querySelector('.af-sort').textContent === 'Times changed' && JSON.parse(STORE.get('vs-artifacts-view')).group === 'helper', 'a close + reopen keeps "By helper" / "Times changed" (vs-artifacts-view)');
const mainHead = box2.querySelectorAll('.chat-artifact-head').at(-1);
ok(mainHead.dataset.group === 'h:' && mainHead.textContent.startsWith('Main conversation'), `the main conversation's group is last ("${mainHead.textContent}")`);
fire(mainHead, 'click');
const box3 = new N('div'); mod.renderArtifactList(box3, V, { app: APP });
ok(box3.querySelectorAll('.chat-artifact-head').at(-1).dataset.fold === 'shut', 'a folded group is remembered per group kind');
STORE.clear();

console.log('⑤ the ⋯ census per kind (none disabled; a subagent row has no record item — no door)');
const menuOf = (pred) => { const b = new N('div'); mod.renderArtifactList(b, V, { app: APP, onOpen() { } }); typeQ(b._afList, ''); const row = rowsIn(b).find(pred) || (() => { const all = M.rowsOfView(V).find((r) => pred({ dataset: { kind: r.kind, key: r.key } })); typeQ(b._afList, all.name); return rowsIn(b).find(pred); })(); fire(row.querySelector('.chat-artifact-more'), 'click'); return globalThis.__menu; };
const labels = (m) => m.map((i) => (i.separator ? '—' : i.label)).join(' | ');
const mDoc = menuOf((r) => r.dataset.key && r.dataset.key.includes('sec10_tail'));
ok(labels(mDoc) === 'Open beside | Show in Files | Copy path', `a subagent's doc: ${labels(mDoc)}`);
const mHand = menuOf((r) => r.dataset.key && r.dataset.key.includes('handed.md'));
ok(labels(mHand) === "Open beside | Show in Files | Copy path | — | Open helper-A's conversation", `a hand-over: ${labels(mHand)}`);
const mSvc = menuOf((r) => r.dataset.kind === 'service');
ok(labels(mSvc) === 'Copy URL | Open in a new tab | Show in Ports | Copy the machine-local address | Show the job', `a service keeps its five: ${labels(mSvc)}`);
ok([mDoc, mHand, mSvc].flat().every((i) => !i.disabled), 'no item is disabled');
mDoc[2].action();
ok(globalThis.__copied === ROWS.find((r) => r.name === 'sec10_tail.md').path, 'Copy path copies the whole path');

console.log('⑥ keyboard: / focuses the filter, ↓ ↑ move, Enter opens');
const kb = new N('div'); let kopened = null; const kc = mod.renderArtifactList(kb, V, { app: APP, onOpen: (b) => { kopened = b; }, close() { } });
const r0 = rowsIn(kb)[0]; r0.focus();
fire(r0, 'keydown', { key: '/' });
ok(DOC.activeElement === kc.input, '/ (focus on a row) focuses the filter');
fire(kc.input, 'keydown', { key: 'ArrowDown' });
ok(DOC.activeElement === rowsIn(kb)[0], '↓ from the filter → the first row');
fire(rowsIn(kb)[0], 'keydown', { key: 'ArrowDown' }); fire(rowsIn(kb)[1], 'keydown', { key: 'ArrowDown' }); fire(rowsIn(kb)[2], 'keydown', { key: 'ArrowUp' });
ok(DOC.activeElement === rowsIn(kb)[1], '↓ ↓ ↑ → the second row');
fire(rowsIn(kb)[1], 'keydown', { key: 'Enter' });
ok(kopened && kopened.key === rowsIn(kb)[1].dataset.key, 'Enter opens that row (beside the chat)');

console.log('⑦ the band rule · a long helper · LRM · the eviction note last');
const small = viewOf(ROWS.filter((r) => r.kind === 'doc').slice(0, 7));
const sb = new N('div'); mod.renderArtifactList(sb, small, {});
ok(!sb.querySelector('.af-head-recent'), 'fewer than 8 rows: no 最近 band');
const longH = 'h'.repeat(120);
const lv = viewOf([{ key: 'L', kind: 'doc', name: '<mark>x</mark>.md', path: '/w/\u202eevil/<mark>x</mark>.md', lastAt: T0, writes: 1, edits: 0, via: { kind: 'subagent', name: longH } }], { full: true });
const lb = new N('div'); const lc = mod.renderArtifactList(lb, lv, {}); typeQ(lc, 'x');
const lr = rowsIn(lb)[0];
ok(lr.querySelector('.chat-artifact-meta').textContent.includes(longH) && lr.title.includes(longH), 'a 120-char helper is whole in the meta (CSS ellipsis) and in the title');
ok(lr.title.startsWith('\u200e/w/'), 'the title\'s path starts with an LRM (the RTL-mark rule kept)');
ok(lr.querySelector('.chat-artifact-name').childNodes.map((n) => n.tagName).join() === '#text,mark,#text' && lr.querySelector('.chat-artifact-name').textContent === '<mark>x</mark>.md', 'a name containing "<mark>" is text (only OUR one mark element)');
ok(lb.querySelector('.af-list').childNodes.at(-1).classList.contains('af-full'), 'the eviction note stays last');

console.log('⑧ the WINDOW (B): rail, column sort, the same model, rows patched, live');
const wv = await legWindowModel(mod);
ok(wv.all && wv.n === 217, `all ${wv.n} rows in the model's order (changed, newest first)`);
ok(wv.code && wv.helperRail, 'a rail click = the group filter (代码 174; a helper) in the model\'s order');
ok(wv.nameSort && wv.nameRev, 'a column head sorts (name ↑, again ↓) through sortRows');
ok(wv.kept, 'a column sort moves row nodes, never rebuilds one');
ok(wv.filter, 'the filter box: filterRows (a helper label matches)');
ok(wv.live, 'the live relay: a refresh of the conversation lands a new row and the counts');
console.log('  · rail: ' + wv.rail);
const reg = (globalThis.__wt || []).find((r) => r.type === 'artifacts');
let replayed = null; reg && reg.replay({ openArtifacts: (o) => { replayed = o; } }, { action: 'openArtifacts', sessionId: 's9', name: 'personal-life' }, { syncId: 'y' });
ok(reg && reg.action === 'openArtifacts' && reg.icon && replayed && replayed.sessionId === 's9' && replayed.name === 'personal-life' && replayed.syncId === 'y', 'registered: type artifacts, action openArtifacts; the replay re-opens {sessionId, name}');

console.log('⑨ CONTROLS (patched copies — each must be RED)');
const unbounded = SRC.css.replace(/max-height:\s*min\(calc\(100vh - var\(--taskbar-height, 0px\) - 24px\), var\(--af-room, 100vh\)\);/, '');
ok(unbounded !== SRC.css && !cssBounded(unbounded), 'CONTROL unbounded panel (the max-height dropped) ⇒ the bounded census is RED');
const rebuilt = SRC.card.replace('    const plan = listPlan(', '    list.textContent = \'\'; rowEls.clear(); headEls.clear();\n    const plan = listPlan(');
const idR = await legIdentity(await load({ 'artifact-card.js': rebuilt }));
ok(rebuilt !== SRC.card && !idR.sameAfterFilter && !idR.sameAfterClear && !idR.patched, 'CONTROL rows rebuilt instead of patched ⇒ the identity census is RED (filter, clear, live)');
const ownModel = SRC.win.replace('const f = filterRows(railRows(rowsOfView(v), rail), q);', "const s = String(q || '').toLowerCase().trim(); const all = railRows(rowsOfView(v), rail); const f = { rows: s ? all.filter((r) => String(r.name).toLowerCase().includes(s)) : all, q: s };");
const wR = await legWindowModel(await load({ 'artifacts-window.js': ownModel }));
ok(ownModel !== SRC.win && !wR.filter, 'CONTROL the window filtering without the shared model ⇒ the window leg is RED');

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASSED'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
