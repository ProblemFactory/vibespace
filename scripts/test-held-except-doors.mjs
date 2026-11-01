#!/usr/bin/env node
// test-held-except-doors — lane held-except-doors (2026-10-31; the vault-standing-request r11 acceptance, claims[0].measured
// (d)): «A DIALOG NEVER DROPS AN EXCEPTION IT DID NOT SHOW AS REMOVED». Every grant door but the vault's saved `except: []`
// whenever its «除了» row was not offered (no Task Group / All agents picked), so a grant the owner narrowed to «everyone in
// Team except Cee» became «everyone in Team» the next time the dialog was saved for another reason — the owner's «Group grants
// need member exceptions» law broken on shipped doors.
// Each door's REAL dialog module (src/lib, bundled by esbuild; its page edge stubbed at the import line: utils' fetch / modal /
// toast, the picker's DOM — the picker's ARITHMETIC is the tree's own src/lib/principal-picker-model.js, as the real picker
// calls it —, build-version, i18n's dictionaries) is driven through the acceptance's shape; its request goes through the
// door's REAL server verdict into THE ONE WRITER (src/server/grants-store.js, a memory store):
//   ① browser profile «Who can use it» (browser-who-dialog.js → B.usePatchVerdict → the writer)
//   ② channel API access (channel-api-dialog.js → F.apiGrant → CG.setApiRows)
//   ③ channel «Grant access…» (channel-filter-editor.js grantAccessBody → CG.setGrainRows, the access row)
//   ④ channel «Notify…» (channel-filter-editor.js showNotifyDialog → CG.setGrainRows, the watch row)
//   ⑤ machine «Who can use it» (exit-access-dialog.js → E.patchVerdict → E.exitRows → the writer), Nobody included
//   ⑥ automation key «授权给…» (vault-automation.js showGrantPicker → the grant's use row, as setExcept writes it)
//   ⑦ Task Group outside visibility (task-groups.js _setVisibility: Closed keeps the 除了; a removal names itself)
// Per door: (a) CONTROL an untouched Save keeps the exception; (b) THE (d) SHAPE un-pick the Task Group (or All agents) and
// keep a conversation ⇒ the request still carries the exception, the stored row keeps it, the dialog says nothing went;
// (c) the group picked again later ⇒ the member is still left out (GM.admits: excepted); (d) a removal through the picker (the
// chip's ✕) ⇒ SAID («Cee will no longer be excluded») and NAMED (`removeExcept`) ⇒ the writer takes it (the member admitted
// again); (e) that same request with its name stripped (a forged / older page) ⇒ refused `except_unnamed`, the store as it was.
// RED: `REPO=<a git archive of c0faf8120 (or bf66cbc3e) + node_modules + src/lib/build-version.js> node
// scripts/test-held-except-doors.mjs` — the (b) (c) (d) (e) legs of every door red by name.
// r2 (主开发's acceptance of 3f8134f16): ⑧ an except-only row is a ROW — the account's last Task Group removed, the REAL engine's
// view draws {to: [], except: [Em]}, «Grant access…» (the REAL picker) shows it «Kept from an earlier grant — left out», saves
// over it and its ✕ names the removal; ⑨ the writers that give a member its OWN entry (the compat assignment, an agent's own
// watch, the owner's Approve) lift that member's kept exception BY NAME, and every channel route answers except_conflicts 409;
// ⑩ a pending fork's `webui:<id>` exception kept / named as STORED and renamed by name (E.rekeyForkExcept); ⑪ «Nobody» sends
// a kept exception as stored (a stopped conversation is no 410). RED on 3f8134f16 by name.
// r3 (主开发's acceptance of d4418c363): THE KEPT LINE NEVER LIES — ⑫ the automation key draws none over the group grant its
// Save deletes and SAYS the exception going; ⑬ the vault door's kept ✕ is said and named; ⑭ the browser door sends a kept
// exception whose conversation runs by its STORED key (no 410). RED on d4418c363 by name.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const REPO = path.resolve(process.env.REPO || new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700) : '')); } };
const J = JSON.stringify;
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), `vs-held-except-doors-${process.pid}-`));
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => process.exit(1));
const GM = require(path.join(REPO, 'src/grant-model.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const CGM = require(path.join(REPO, 'src/server/channels-grants.js'));
const B = require(path.join(REPO, 'src/browser-profiles.js'));
const E = require(path.join(REPO, 'src/exit-reach.js'));
const F = await import(pathToFileURL(path.join(REPO, 'src/channel-filter.js')).href);
const FA = require(path.join(REPO, 'src/channel-api.js'));   // the raw API's PURE rules (apiGrant — what setTiers maps a tier row through)
const PMpath = path.join(REPO, 'src/lib/principal-picker-model.js');
const PM = await import(pathToFileURL(PMpath).href);

// ── a fake element tree: what the dialogs touch, nothing more ──
class FakeEl {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null; this.dataset = {}; this.style = { setProperty(k, v) { this[k] = String(v); }, removeProperty(k) { delete this[k]; }, getPropertyValue(k) { return this[k] || ''; } }; this._text = ''; this._cls = []; this._ls = {}; this.attrs = {}; this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this.title = ''; this.type = ''; this.name = ''; this.id = ''; this.innerHTML = ''; }
  get className() { return this._cls.join(' '); }
  set className(v) { this._cls = String(v).split(/\s+/).filter(Boolean); }
  get classList() { const c = this._cls; return { add: (...a) => a.forEach((x) => { if (!c.includes(x)) c.push(x); }), remove: (...a) => a.forEach((x) => { const i = c.indexOf(x); if (i >= 0) c.splice(i, 1); }), contains: (x) => c.includes(x), toggle: (x, on) => { const has = c.includes(x); const want = on === undefined ? !has : !!on; if (want && !has) c.push(x); if (!want && has) c.splice(c.indexOf(x), 1); return want; } }; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  set textContent(v) { this.children.forEach((c) => { c.parentElement = null; }); this.children = []; this._text = v == null ? '' : String(v); }
  get parentNode() { return this.parentElement; }
  get childNodes() { return this.children; }
  removeChild(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parentElement = null; return n; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get isConnected() { return true; }
  appendChild(n) { if (n.parentElement) n.parentElement.children.splice(n.parentElement.children.indexOf(n), 1); n.parentElement = this; this.children.push(n); return n; }
  append(...ns) { for (const n of ns) if (n != null) this.appendChild(typeof n === 'string' ? Object.assign(new FakeEl('#text'), { _text: n }) : n); }
  prepend(...ns) { for (const n of ns.reverse()) if (n != null) this.insertBefore(typeof n === 'string' ? Object.assign(new FakeEl('#text'), { _text: n }) : n, this.firstChild); }
  insertBefore(n, ref) { if (n.parentElement) n.parentElement.children.splice(n.parentElement.children.indexOf(n), 1); n.parentElement = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); return n; }
  replaceChildren(...ns) { this.textContent = ''; this.append(...ns); }
  contains(n) { return n === this || this.all.includes(n); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  toggleAttribute(k, on) { if (on === undefined ? !(k in this.attrs) : on) this.attrs[k] = ''; else delete this.attrs[k]; }
  addEventListener(ev, fn) { (this._ls[ev] ||= []).push(fn); }
  removeEventListener(ev, fn) { this._ls[ev] = (this._ls[ev] || []).filter((f) => f !== fn); }
  fire(ev) { const e = { type: ev, target: this, preventDefault() { }, stopPropagation() { } }; for (const fn of this._ls[ev] || []) fn(e); const h = this['on' + ev]; if (typeof h === 'function') return h.call(this, e); return undefined; }
  click() { return this.fire('click'); }
  focus() { } blur() { } select() { } scrollIntoView() { }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  closest() { return null; } matches() { return false; }
  get all() { const out = [], st = this.children.slice().reverse(); while (st.length) { const n = st.pop(); out.push(n); for (let i = n.children.length - 1; i >= 0; i--) st.push(n.children[i]); } return out; }   // pre-order, one array (the fast tier's sum)
  _match(sel) { return sel.startsWith('.') ? sel.slice(1).split('.').every((c) => this._cls.includes(c)) : this.tagName === sel.toUpperCase(); }
  querySelectorAll(sel) { const parts = String(sel).split(',').map((s) => s.trim()); const m = /^:scope\s*>\s*(.+)$/.exec(parts[0]); return m ? this.children.filter((c) => c._match(m[1].trim())) : this.all.filter((c) => parts.some((p) => c._match(p))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
}
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.document = { createElement: (t) => new FakeEl(t), createElementNS: (ns, t) => new FakeEl(t), createTextNode: (s) => Object.assign(new FakeEl('#text'), { _text: String(s) }), createDocumentFragment: () => new FakeEl('#fragment'), addEventListener() { }, removeEventListener() { }, documentElement: new FakeEl('html'), body: new FakeEl('body'), head: new FakeEl('head'), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, activeElement: null, visibilityState: 'visible', hasFocus: () => true };
globalThis.addEventListener = () => { }; globalThis.removeEventListener = () => { };
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0); globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.matchMedia = () => ({ matches: false, addEventListener() { }, removeEventListener() { } });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
if (!globalThis.navigator) globalThis.navigator = { language: 'en', userAgent: 'node' };
const textOf = (n) => (n ? n.textContent : '');
const byCls = (root, cls) => (root ? root.all.find((n) => n._cls.includes(cls)) || null : null);
const shown = (n) => !!n && n.style.display !== 'none' && !n.hidden;

// ── THE PAGE: what a dialog reaches outside its own module (one page record per dialog) ──
const PAGE = { cur: null };
const tWords = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : String(s));
globalThis.__hx = {
  t: tWords,
  fetchJson: (u, o) => PAGE.cur.fetch(String(u), o || {}),
  api: (u, o) => PAGE.cur.fetch(String(u), o || {}),
  showToast: (m) => { PAGE.cur.toasts.push(String(m)); },
  createModalShell: (o) => { const P = PAGE.cur; const dialog = new FakeEl('div'), body = new FakeEl('div'); dialog.appendChild(body); P.shell = { dialog, body, opts: o }; return { dialog, body, overlay: dialog, close: () => { P.closed++; try { o && o.onClose && o.onClose(); } catch { } }, raised: false, ready: Promise.resolve(true) }; },
  picker: (o) => PAGE.cur.picker(o),
  roster: (app, opts = {}) => PAGE.cur.rosterRows.filter((r) => opts.groups !== false || r.kind !== 'group'),
};
/** A page for ONE dialog: `routes(url, opts, body)` answers its requests (each recorded); the pickers it builds are the
 *  stub below — their state set by the test, their arithmetic the REAL model's (PM.exceptSaved, as the picker calls it). */
function newPage({ routes, roster = [] }) {
  const P = { posts: [], toasts: [], closed: 0, shell: null, pickers: [], rosterRows: roster };
  P.fetch = async (url, o) => { let body = {}; try { body = o && o.body ? JSON.parse(o.body) : {}; } catch { body = {}; } const method = (o && o.method) || 'GET'; if (method !== 'GET') P.posts.push({ url, method, body }); const r = await routes(url, method, body); return JSON.parse(J(r === undefined ? { error: 'no route', code: 'not-found' } : r)); };
  P.picker = (o) => {
    const raw = () => (typeof o.items === 'function' ? o.items() : o.items) || [];
    const allRow = o.everyone && typeof o.everyone === 'object' ? PM.everyoneRow({ key: o.everyone.key || 'everyone:*', name: 'All agents' }) : null;
    const source = () => { const r = raw(); return allRow && !r.some((x) => x && PM.isEveryone(x)) ? [allRow, ...r] : r; };
    const extra = () => { const e = o.except && o.except.extra; return (typeof e === 'function' ? e() : e) || []; };
    const st = { sel: (o.selected || []).map(String), ex: ((o.except && o.except.selected) || []).map(String) };
    const known = new Map();
    const note = () => { for (const r of [...source(), ...extra()]) if (r && r.key != null && !known.has(String(r.key))) known.set(String(r.key), r); };
    note();
    const fire = () => { if (typeof o.onChange === 'function') o.onChange(st.sel.slice(), null); };
    const api = {
      el: new FakeEl('div'), o, st,
      selected: () => st.sel.slice(),
      selectedRows: () => st.sel.map((k) => known.get(k)).filter(Boolean),
      setSelected: (keys) => { st.sel = (keys || []).map(String); st.ex = st.ex.filter((k) => !st.sel.includes(k)); },
      refresh: () => { note(); },
      except: (...a) => PM.exceptSaved(source(), st.sel, st.ex, ...a),   // THE real picker's answer (src/lib/principal-picker.js api.except)
      setExcept: (keys) => { st.ex = (keys || []).map(String); },
      knownRows: () => { note(); return [...known.values()]; },
      nameOf: (k) => (known.get(k) || {}).name || k,
      focus() { }, setBusy() { }, close() { },
      // the test's hands: a pick (a member picked itself leaves the 除了 — the real picker's syncExcept), a chip's ✕ in «除了»
      pick: (keys) => { st.sel = keys.map(String); st.ex = st.ex.filter((k) => !st.sel.includes(k)); note(); fire(); },
      unexcept: (k) => { st.ex = st.ex.filter((x) => x !== k); if (o.except && typeof o.except.onChange === 'function') o.except.onChange(PM.exceptSaved(source(), st.sel, st.ex)); fire(); },
    };
    P.pickers.push(api);
    return api;
  };
  PAGE.cur = P;
  return P;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// ── the bundle: every door's dialog module, as it ships, its page edge stubbed at the import line ──
const exportNames = (src) => { const out = new Set(); for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm)) out.add(m[1]); for (const m of src.matchAll(/^export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]); for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const x of m[1].split(',')) { const n = x.trim().split(/\s+as\s+/).pop(); if (n) out.add(n); } return [...out]; };
const HOOKED = { 'utils.js': ['fetchJson', 'api', 'showToast', 'createModalShell'], 'principal-picker.js': [] };
function stubOf(file) {
  const base = path.basename(file);
  if (base === 'build-version.js') return 'export const BUILD_VERSION = "test";';
  if (base === 'i18n.js') return 'export const t = (s, p) => globalThis.__hx.t(s, p); export const tc = (c, s, p) => globalThis.__hx.t(s, p); export const getLangPref = () => "en"; export const resolveLang = () => "en"; export const deviceLocale = () => undefined; export const setLang = () => {}; export const applyI18nToDom = () => {};';
  // the picker: the stub below (its state set by the test) — or, once `globalThis.__hx.real` is set (r2's legs ⑧–⑪), THE REAL
  // src/lib/principal-picker.js bundled beside it (`hx-real:`), so one build serves both
  if (base === 'principal-picker.js') return `import * as Real from ${J('hx-real:' + file)};\nexport const principalPicker = (o) => (globalThis.__hx.real ? Real.principalPicker(o) : globalThis.__hx.picker(o)); export const rosterFromApp = (a, o) => (globalThis.__hx.real ? Real.rosterFromApp(a, o) : globalThis.__hx.roster(a, o));\n` + exportNames(fs.readFileSync(file, 'utf8')).filter((n) => !['principalPicker', 'rosterFromApp'].includes(n)).map((n) => `export const ${n} = (...a) => (globalThis.__hx.real ? Real.${n}(...a) : undefined);`).join('\n');
  // utils.js: the four the dialogs ask of the page, hooked; every other export a quiet no-op (never a DOM)
  return exportNames(fs.readFileSync(file, 'utf8')).map((n) => (HOOKED['utils.js'].includes(n) ? `export const ${n} = (...a) => globalThis.__hx.${n}(...a);` : n === 'MODAL_OPEN_EVENT' ? `export const ${n} = 'vs-modal-open';` : n === 'OWN_GESTURE_MS' ? `export const ${n} = 4000;` : `export const ${n} = () => undefined;`)).join('\n');
}
async function bundleDoors() {
  const lib = path.join(REPO, 'src/lib');
  // the doors' OWN entry functions only (named — esbuild leaves the rest of the dialog modules' exports out: the fast tier's sum)
  const NEED = [['browser-who-dialog', ['openWhoDialog']], ['channel-api-dialog', ['showApiAccessDialog']], ['channel-filter-editor', ['grantAccessBody', 'showGrantAccessDialog', 'showNotifyDialog']], ['exit-access-dialog', ['openExitAccessDialog']], ['vault-automation', ['showGrantPicker']], ['browser-who-model', ['pickerRows', 'draftExcept']], ['vault-use-row', ['showUseGrantDialog']]];   // r3: + the browser door's model, the vault «Who may use» door
  const entry = NEED.map(([m, names], i) => `import { ${names.join(', ')} } from ${J(path.join(lib, m + '.js'))};\nexport const D${i} = { ${names.join(', ')} };`).join('\n');
  const stubs = { name: 'page-edge', setup(b) {
    b.onResolve({ filter: /^\.\/(utils|i18n|principal-picker|build-version)\.js$/ }, (a) => (a.importer.startsWith(lib + path.sep) ? { path: path.join(lib, a.path.slice(2)), namespace: 'stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubOf(a.path), loader: 'js' }));
    b.onResolve({ filter: /^hx-real:/ }, (a) => ({ path: a.path.slice('hx-real:'.length) }));   // the real picker file (its own imports: the page edge above)
  } };
  const out = path.join(SCR, 'doors.bundle.mjs');
  await esbuild.build({ stdin: { contents: entry, resolveDir: lib, loader: 'js' }, bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], outfile: out, plugins: [stubs], logLevel: 'silent', minifyWhitespace: true, legalComments: 'none' });   // r2: whitespace-minified — 3 MB of comment-rich sources parse in less time (the fast tier's sum)
  const M = await import(pathToFileURL(out).href);
  return { BW: M.D0, CA: M.D1, CF: M.D2, EX: M.D3, VA: M.D4, WM: M.D5, VU: M.D6 };
}
// r2: the channels engine's modules (legs ⑧–⑨) are required WHILE the bundle builds (esbuild works in its own process)
const D_P = bundleDoors();
D_P.catch(() => { });
const CHX = require(path.join(REPO, 'src/channels/index.js'));
const CREC = require(path.join(REPO, 'src/channel-record.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
let D;
try { D = await D_P; } catch (e) { ok(false, 'the five dialog modules bundle (esbuild, the page edge stubbed)', String((e && e.errors && e.errors.map((x) => x.text).join(' | ')) || (e && e.message) || e)); console.log(`\nFAILED (${pass} passed, ${fail} failed)`); process.exit(1); }
ok(['openWhoDialog'].every((f) => typeof D.BW[f] === 'function') && typeof D.CA.showApiAccessDialog === 'function' && typeof D.CF.grantAccessBody === 'function' && typeof D.CF.showNotifyDialog === 'function' && typeof D.EX.openExitAccessDialog === 'function' && typeof D.VA.showGrantPicker === 'function', 'the five dialog modules bundle as they ship (the page edge stubbed at the import line only)');
const pkOf = (p) => GM.principalKey(p);
const exKeys = (row) => ((row && row.except) || []).map(pkOf).sort();
// THE WORLD: one Task Group «Team» (Ada, Bo and Cee in it), Cee left out; Ada also picked by name
const TEAM = { kind: 'group', id: 'g-team' }, ADA = { kind: 'conversation', key: 'cid-ada' }, CEE = { kind: 'conversation', key: 'cid-cee' };
const admitsCee = (rows) => GM.admits(rows, { conversationKey: 'cid-cee', groupIds: ['g-team'] });

// ═══ ① browser profile «Who can use it» ═══════════════════════════════════════════════════════════════════════════════
console.log('① browser profile «Who can use it» (browser-who-dialog.js → B.usePatchVerdict → the ONE writer)');
{
  const PID = 'bp-0000a001', DOOR = 'browser-profile';
  const st = GS.create({ memory: true });
  const seed = () => { st.remove(DOOR, PID, 'user'); st.set(DOOR, PID, { to: [TEAM, ADA], except: [CEE] }, 'user'); };
  const prof = () => ({ id: PID, label: 'Work', grantUse: B.useOfRows(st.rowsFor(DOOR, PID), { browserKeyOf: () => null }) });
  const app = { sidebar: { _webuiSessions: [], _tasks: [{ id: 'g-team', title: 'Team' }], _getSessionTaskGroups: () => [], getCustomName: () => '', _allSessions: [{ sessionId: 'cid-ada', name: 'Ada' }, { sessionId: 'cid-bo', name: 'Bo' }, { sessionId: 'cid-cee', name: 'Cee' }] } };
  // the keeper's PATCH, as src/routes/browser-trace.js + browser-keeper.js updateProfile run it (nothing live to resolve here)
  const routes = async (url, method, body) => {
    if (url === `/api/browser/profiles/${PID}/use`) { const p = prof(); return { profile: { id: p.id, label: p.label, legacy: false }, use: B.useDigestOf(p), base: B.useStamp(p), usedBy: [], createdBy: null }; }
    if (url === `/api/browser/profiles/${PID}` && method === 'PATCH') {
      const p = prof();
      const sv = B.useShapeVerdict(body.use); if (!sv.ok) return { error: sv.error, code: sv.code };
      const bv = B.useBaseVerdict(p, body.base); if (!bv.ok) return { error: bv.error, code: bv.code };
      const v = B.usePatchVerdict({ profile: p, use: body.use, knownTask: (tid) => tid === 'g-team', knownKey: () => false, conversationOf: () => null }); if (!v.ok) return { error: v.error, code: v.code };
      const w = st.set(DOOR, PID, { to: v.row.to, except: v.row.except, removeExcept: Array.isArray(body.removeExcept) ? body.removeExcept : [] }, 'user');
      return w.ok ? { ok: true, profile: { id: PID, label: 'Work' }, detached: [] } : { error: w.error, code: w.code };
    }
    return undefined;
  };
  const open = async () => { const P = newPage({ routes }); const h = await D.BW.openWhoDialog(app, PID, {}); return { P, h, pk: P.pickers[0] }; };
  const note = (P) => byCls(P.shell && P.shell.dialog, 'bwho-unexcept');
  const row = () => st.rowsFor(DOOR, PID)[0] || null;
  const said = (P) => { const n = note(P); return shown(n) ? textOf(n) : ''; };
  // (a) CONTROL
  seed();
  { const { P, h } = await open(); await h.save(); const b = (P.posts[0] || {}).body || {};
    ok(J(exKeys(row())) === J(['conversation:cid-cee']) && J(((b.use || {}).except || []).map((x) => x.key)) === J(['cid:cid-cee']) && !said(P), '(a) CONTROL: an untouched Save keeps the exception (the body carries it, the row keeps it, nothing said)', { body: b, row: row() }); }
  // (b) THE (d) SHAPE: Team un-picked, Ada kept — the 除了 row is no longer offered
  seed();
  { const { P, h, pk } = await open(); pk.pick(['session:bk:cid:cid-ada']); const sawNote = said(P); await h.save(); const b = (P.posts[0] || {}).body || {};
    ok(J(((b.use || {}).except || []).map((x) => x.key)) === J(['cid:cid-cee']) && !b.removeExcept, '(b) Team un-picked, Ada kept: the Save still SENDS the exception it never showed as removed (nothing named)', b);
    ok(J(exKeys(row())) === J(['conversation:cid-cee']) && J((row() || {}).to || []) === J([ADA]) && !sawNote, '(b) …the stored row keeps it — {to: Ada, except: Cee}; the dialog said nothing went', { row: row(), sawNote }); }
  // (c) Team picked again later: Cee is still left out
  { const { P, h, pk } = await open(); pk.pick(['task:g-team', 'session:bk:cid:cid-ada']); await h.save();
    const v = admitsCee(st.rowsFor(DOOR, PID));
    ok(P.posts.length === 1 && v.code === 'excepted' && J(exKeys(row())) === J(['conversation:cid-cee']), '(c) Team picked again in a later dialog: Cee is still excluded (GM.admits: excepted)', { v, row: row() }); }
  // (d) a removal through the picker (the chip's ✕) ⇒ said, named, written
  seed();
  let dBody = null;
  { const { P, h, pk } = await open(); pk.unexcept('session:x:cid:cid-cee'); const s = said(P); await h.save(); dBody = (P.posts[0] || {}).body || {};
    ok(s === 'Cee will no longer be excluded', '(d) the ✕ on «除了：Cee» is SAID before Save: «Cee will no longer be excluded»', s);
    ok(J(dBody.removeExcept) === J(['conversation:cid-cee']) && J(exKeys(row())) === J([]) && admitsCee(st.rowsFor(DOOR, PID)).ok === true, '(d) …and NAMED on the wire (removeExcept) — the writer takes it: Cee is admitted again', { body: dBody, row: row() }); }
  // (e) the same Save with its name stripped (a forged / older page) ⇒ refused by name, nothing written
  seed();
  { const before = J(st.rowsFor(DOOR, PID)); const P = newPage({ routes }); const { removeExcept, ...forged } = dBody || {}; const r = await P.fetch(`/api/browser/profiles/${PID}`, { method: 'PATCH', body: J({ ...forged, base: B.useStamp(prof()) }) });
    ok(r.code === 'except_unnamed' && J(st.rowsFor(DOOR, PID)) === before, '(e) that Save with removeExcept stripped is refused except_unnamed — the store as it was', { r, removeExcept }); }
}

// the channel world: a roster as rosterFromApp spells it (Team; Ada, Bo, Cee live in it); the store's spelling for the rows
const CH_ROSTER = [{ key: 'group:g-team', kind: 'group', id: 'g-team', name: 'Team', groupIds: [], groupNames: [] },
  ...[['cid-ada', 'Ada'], ['cid-bo', 'Bo'], ['cid-cee', 'Cee']].map(([id, name]) => ({ key: `agent:${id}`, kind: 'agent', id, name, live: true, groupIds: ['g-team'], groupNames: ['Team'], webuiId: `w-${id}` }))];
const CH_APP = { sidebar: { _webuiSessions: [['cid-ada', 'Ada'], ['cid-bo', 'Bo'], ['cid-cee', 'Cee']].map(([id, name]) => ({ id: `w-${id}`, backendSessionId: id, name })), _tasks: [{ id: 'g-team', title: 'Team' }] } };
const CTEAM = { kind: 'group', id: 'g-team', name: 'Team' }, CADA = { kind: 'agent', id: 'cid-ada', name: 'Ada' };

// ═══ ② channel API access ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('② channel API access (channel-api-dialog.js → F.apiGrant → CG.setApiRows → the ONE writer)');
{
  const CRED = 'cred-a1', DOOR = 'channel-api';
  const st = GS.create({ memory: true });
  const CG = CGM.create({ grants: st });
  const seed = () => { st.remove(DOOR, CRED, 'user'); st.set(DOOR, CRED, { to: [{ ...TEAM, tier: 'read' }, { ...ADA, tier: 'read' }], except: [CEE] }, 'user'); };
  // src/server/channel-api.js setTiers → channels-engine setApiGrants → CG.setApiRows, as the route hands them the body
  const routes = async (url, method, body) => {
    if (url === '/api/channels/api') return { ok: true, creds: [{ id: CRED, label: 'Slack', source: 'channels', grants: CG.apiGrants().filter((g) => g.scope && g.scope.id === CRED).map((g) => ({ principal: g.principal, tier: g.api, perDay: g.perDay || null })), except: [...CG.rowOf(CG.DOORS.api, CRED).except], shapes: [], sensitive: [] }], cards: [] };
    if (url === `/api/channels/api/${CRED}/grants` && method === 'PUT') {
      const rows = (body.grants || []).filter((r) => r && r.tier && r.tier !== 'none').map((r) => FA.apiGrant({ principal: r.principal, cred: CRED, tier: r.tier, perDay: r.perDay, at: 1, by: 'user', allWrite: r.allWrite === true }));
      const w = CG.setApiRows(CRED, rows, { except: body.except, removeExcept: Array.isArray(body.removeExcept) ? body.removeExcept : [], by: 'user' });
      return w.ok ? { ok: true } : { ok: false, code: w.code, error: w.error };
    }
    return undefined;
  };
  const open = async () => { const P = newPage({ routes, roster: CH_ROSTER }); await D.CA.showApiAccessDialog(CH_APP, CRED); return { P, pk: P.pickers[0], save: () => P.shell.opts.unsaved.save() }; };
  const row = () => st.rowsFor(DOOR, CRED)[0] || null;
  const said = (P) => { const n = byCls(P.shell && P.shell.dialog, 'chan-api-unexcept'); return shown(n) ? textOf(n) : ''; };
  seed();
  { const { P, save } = await open(); await save(); const b = (P.posts[0] || {}).body || {};
    ok(J(exKeys(row())) === J(['conversation:cid-cee']) && J((b.except || []).map(pkOf)) === J(['conversation:cid-cee']) && !said(P), '(a) CONTROL: an untouched Save keeps the exception', { body: b, row: row() }); }
  seed();
  { const { P, pk, save } = await open(); pk.pick(['agent:cid-ada']); const s0 = said(P); await save(); const b = (P.posts[0] || {}).body || {};
    ok(J((b.except || []).map(pkOf)) === J(['conversation:cid-cee']) && !b.removeExcept && !s0, '(b) Team un-picked, Ada kept: the Save still sends the exception (nothing said, nothing named)', b);
    ok(J(exKeys(row())) === J(['conversation:cid-cee']) && J(((row() || {}).to || []).map(pkOf)) === J(['conversation:cid-ada']), '(b) …the stored tier row keeps it — {to: Ada, except: Cee} (no Task Group left, the exception held)', row()); }
  { const { P, pk, save } = await open(); pk.pick(['agent:cid-ada', 'group:g-team']); await save();
    ok(P.posts.length === 1 && admitsCee(st.rowsFor(DOOR, CRED)).code === 'excepted', '(c) Team granted again later: Cee is still excluded', row()); }
  seed();
  let dBody = null;
  { const { P, pk, save } = await open(); pk.unexcept('agent:cid-cee'); const s = said(P); await save(); dBody = (P.posts[0] || {}).body || {};
    ok(s === 'Cee will no longer be excluded', '(d) the ✕ on «除了：Cee» is SAID under the picker', s);
    ok(J(dBody.removeExcept) === J(['conversation:cid-cee']) && J(exKeys(row())) === J([]), '(d) …and NAMED (removeExcept) — written', { body: dBody, row: row() }); }
  seed();
  { const before = J(st.rowsFor(DOOR, CRED)); const P = newPage({ routes }); const { removeExcept, ...forged } = dBody || {}; const r = await P.fetch(`/api/channels/api/${CRED}/grants`, { method: 'PUT', body: J(forged) });
    ok(r.code === 'except_unnamed' && J(st.rowsFor(DOOR, CRED)) === before, '(e) that Save with removeExcept stripped is refused except_unnamed — the store as it was', r); }
}

// ═══ ③ channel «Grant access…» ════════════════════════════════════════════════════════════════════════════════════════
console.log('③ channel «Grant access…» (channel-filter-editor.js grantAccessBody → CG.setGrainRows, the access row)');
const CH_RES = 'conversation:a1/c1';
const chanWorld = () => { const st = GS.create({ memory: true }); return { st, CG: CGM.create({ grants: st }) }; };
const grainView = (CG) => ({ access: CG.accessOf(CH_RES).map((r) => ({ principal: r.principal, authority: r.authority })), watchers: CG.watchOf(CH_RES).to.map((e) => ({ principal: GM.toChannelPrincipal(e), mode: 'all', notify: 'wake' })), except: [...CG.exceptOf(CH_RES)], watchExcept: [...CG.watchOf(CH_RES).except] });
{
  const { st, CG } = chanWorld();
  const seed = () => { st.remove('channel-reach', CH_RES, 'user'); st.set('channel-reach', CH_RES, { to: [{ ...TEAM, authority: 'draft' }, { ...ADA, authority: 'draft' }], except: [CEE] }, 'user'); };
  // src/server/channels-access.js setGrain → CG.setGrainRows (the access row; the body's except / removeExcept, a person's)
  const routes = async (url, method, body) => {
    if (url === '/api/channels/a1/c1/access' && method === 'PUT') { const w = CG.setGrainRows(CH_RES, { access: body.access, ...(body.except !== undefined ? { except: body.except } : {}), ...(Array.isArray(body.removeExcept) ? { removeExcept: body.removeExcept } : {}) }, 'user'); return w.ok ? { ok: true } : { ok: false, code: w.code, error: w.error }; }
    return undefined;
  };
  const open = () => { const P = newPage({ routes, roster: CH_ROSTER }); const v = grainView(CG); const stt = { kind: 'conversation', name: 'Launch chat', conv: { adapterId: 'a1', id: 'c1' }, ...v, eligibleAbove: [], caps: { offersSend: false, sendWhy: 'read-only-adapter', policyRequiresReview: true }, accessUrl: '/api/channels/a1/c1/access', watchersUrl: '/api/channels/a1/c1/watchers', stamp: F.grainStamp(v) }; const body = new FakeEl('div'); const part = D.CF.grantAccessBody(CH_APP, stt, body, { close: () => { P.closed++; }, target: { kind: 'conversation', conv: stt.conv }, notify: false }); P.shell = { dialog: body }; return { P, part, pk: P.pickers[0] }; };
  const row = () => st.rowsFor('channel-reach', CH_RES)[0] || null;
  const said = (P) => { const n = byCls(P.shell.dialog, 'chan-access-unexcept'); return shown(n) ? textOf(n) : ''; };
  seed();
  { const { P, part } = open(); await part.save(); const b = (P.posts[0] || {}).body || {};
    ok(J(exKeys(row())) === J(['conversation:cid-cee']) && J((b.except || []).map(pkOf)) === J(['conversation:cid-cee']) && !said(P), '(a) CONTROL: an untouched Save keeps the exception', { body: b, row: row() }); }
  seed();
  { const { P, part, pk } = open(); pk.pick(['agent:cid-ada']); const s0 = said(P); await part.save(); const b = (P.posts[0] || {}).body || {};
    ok(J((b.except || []).map(pkOf)) === J(['conversation:cid-cee']) && !b.removeExcept && !s0, '(b) Team un-picked, Ada kept: the Save still sends the exception (nothing said, nothing named)', b);
    ok(J(exKeys(row())) === J(['conversation:cid-cee']), '(b) …the stored access row keeps it (no Task Group left, the exception held — never «none left ⇒ the list goes»)', row()); }
  { const { P, part, pk } = open(); pk.pick(['agent:cid-ada', 'group:g-team']); await part.save();
    ok(P.posts.length === 1 && admitsCee(st.rowsFor('channel-reach', CH_RES)).code === 'excepted', '(c) Team given access again later: Cee is still excluded', row()); }
  seed();
  let dBody = null;
  { const { P, part, pk } = open(); pk.unexcept('agent:cid-cee'); const s = said(P); await part.save(); dBody = (P.posts[0] || {}).body || {};
    ok(s === 'Cee will no longer be excluded', '(d) the ✕ on «除了：Cee» is SAID under the picker', s);
    ok(J(dBody.removeExcept) === J(['conversation:cid-cee']) && J(exKeys(row())) === J([]), '(d) …and NAMED (removeExcept) — written', { body: dBody, row: row() }); }
  seed();
  { const before = J(st.rowsFor('channel-reach', CH_RES)); const P = newPage({ routes }); const { removeExcept, ...forged } = dBody || {}; const r = await P.fetch('/api/channels/a1/c1/access', { method: 'PUT', body: J(forged) });
    ok(r.code === 'except_unnamed' && J(st.rowsFor('channel-reach', CH_RES)) === before, '(e) that Save with removeExcept stripped is refused except_unnamed — the store as it was', r); }
}

// ═══ ④ channel «Notify…» ══════════════════════════════════════════════════════════════════════════════════════════════
console.log('④ channel «Notify…» (channel-filter-editor.js showNotifyDialog → CG.setGrainRows, the watch row)');
{
  const { st, CG } = chanWorld();
  const seed = () => { for (const d of ['channel-reach', 'channel-watch']) st.remove(d, CH_RES, 'user'); st.set('channel-reach', CH_RES, { to: [{ ...TEAM, authority: 'draft' }, { ...ADA, authority: 'draft' }] }, 'user'); st.set('channel-watch', CH_RES, { to: [TEAM, ADA], except: [CEE] }, 'user'); };
  const routes = async (url, method, body) => {
    if (url === '/api/channels/a1/c1') { const v = grainView(CG); return { conversation: { id: 'c1', title: 'Launch chat', own: v, eligibleAbove: [], authorityCaps: { offersSend: false, sendWhy: 'read-only-adapter', policyRequiresReview: true }, watchers: [], stats: null }, adapter: { id: 'a1', auth: {} } }; }
    if (url === '/api/channels/a1/c1/watchers' && method === 'PUT') { const w = CG.setGrainRows(CH_RES, { watchers: body.watchers, ...(body.except !== undefined ? { watchExcept: body.except } : {}), ...(Array.isArray(body.removeExcept) ? { watchRemoveExcept: body.removeExcept } : {}) }, 'user'); return w.ok ? { ok: true } : { ok: false, code: w.code, error: w.error }; }
    return undefined;
  };
  const open = async () => { const P = newPage({ routes, roster: CH_ROSTER }); await D.CF.showNotifyDialog(CH_APP, { kind: 'conversation', conv: { adapterId: 'a1', id: 'c1' } }); const ex = P.pickers.find((p) => p.o.cls === 'pp-except-only'); return { P, ex, save: () => P.shell.opts.unsaved.save() }; };
  const row = () => st.rowsFor('channel-watch', CH_RES)[0] || null;
  const said = (P) => { const n = byCls(P.shell && P.shell.dialog, 'chan-watch-unexcept'); return shown(n) ? textOf(n) : ''; };
  // the Team notification's ✕ (its row's own remove button)
  const dropTeam = (P) => { const boxes = P.shell.dialog.all.filter((n) => n._cls.includes('chan-af-rm')); const pk = P.pickers.filter((p) => p.o.compact); const i = pk.findIndex((p) => p.selected()[0] === 'group:g-team'); if (i >= 0 && boxes[i]) boxes[i].click(); return i >= 0 && !!boxes[i]; };
  seed();
  { const { P, ex, save } = await open(); const ready = !!ex; await save(); const b = (P.posts[0] || {}).body || {};
    ok(ready && J(exKeys(row())) === J(['conversation:cid-cee']) && J((b.except || []).map(pkOf)) === J(['conversation:cid-cee']) && !said(P), '(a) CONTROL: an untouched Save keeps the exception', { ready, body: b, row: row() }); }
  seed();
  { const { P, save } = await open(); const dropped = dropTeam(P); const s0 = said(P); await save(); const b = (P.posts[0] || {}).body || {};
    ok(dropped && J((b.watchers || []).map((w) => w.principal.kind + ':' + w.principal.id)) === J(['agent:cid-ada']) && J((b.except || []).map(pkOf)) === J(['conversation:cid-cee']) && !b.removeExcept && !s0, '(b) the Team notification removed, Ada\'s kept: the Save still sends the exception (nothing said, nothing named)', { dropped, b });
    ok(J(exKeys(row())) === J(['conversation:cid-cee']), '(b) …the stored watch row keeps it', row()); }
  seed();
  let dBody = null;
  { const { P, ex, save } = await open(); if (ex) ex.unexcept('agent:cid-cee'); const s = said(P); await save(); dBody = (P.posts[0] || {}).body || {};
    ok(s === 'Cee will no longer be excluded', '(d) the ✕ on «除了：Cee» is SAID under the notifications', s);
    ok(J(dBody.removeExcept) === J(['conversation:cid-cee']) && J(exKeys(row())) === J([]), '(d) …and NAMED (removeExcept) — written', { body: dBody, row: row() }); }
  seed();
  { const before = J(st.rowsFor('channel-watch', CH_RES)); const P = newPage({ routes }); const { removeExcept, ...forged } = dBody || {}; const r = await P.fetch('/api/channels/a1/c1/watchers', { method: 'PUT', body: J(forged) });
    ok(r.code === 'except_unnamed' && J(st.rowsFor('channel-watch', CH_RES)) === before, '(e) that Save with removeExcept stripped is refused except_unnamed — the store as it was', r); }
}

// ═══ ⑤ machine «Who can use it» ═══════════════════════════════════════════════════════════════════════════════════════
console.log('⑤ machine «Who can use it» (exit-access-dialog.js → E.patchVerdict → E.exitRows → the ONE writer)');
{
  const H = 'h-box';
  const st = GS.create({ memory: true });
  const seed = () => { for (const g of ['use', 'run']) st.remove('exit', `${H}:${g}`, 'user'); st.set('exit', `${H}:use`, { to: [TEAM, ADA], except: [CEE] }, 'user'); };
  // the hub's roster names the lists (GM.namesNow, as exit-routes' rosterNow hands it); this page's own roster lists Team only
  const HUB_ROSTER = { sessions: [['cid-ada', 'Ada'], ['cid-cee', 'Cee']].map(([cid, name]) => ({ id: `w-${cid}`, backendSessionId: cid, name })), groups: [{ id: 'g-team', title: 'Team' }] };
  const accessNow = () => E.exitAccessOf({ exit: { ask: false } }, { use: st.rowsFor('exit', `${H}:use`), run: st.rowsFor('exit', `${H}:run`) });
  // exit-proxy.js view / setAccess, as src/server/exit-routes.js hands them the body (the conversations here are not running)
  const routes = async (url, method, body) => {
    if (url === `/api/hosts/${H}/exit-access` && method === 'GET') { const a = accessNow(); return { machine: { id: H, name: 'Box', online: true }, access: E.exitView(a, { roster: HUB_ROSTER }), base: E.exitStamp(a), usedBy: { use: [], run: [] }, lastRun: null, audit: [], hub: null }; }
    if (url === `/api/hosts/${H}/exit-access` && method === 'PATCH') { const v = E.patchVerdict(accessNow(), body, { now: 5, by: 'user' }); if (!v.ok) return { status: 400, error: v.error || v.code, code: v.code }; const w = st.setMany(E.exitRows(v.access, H, v.removeExcept), 'user'); return w.ok ? { access: E.exitView(v.access), base: E.exitStamp(v.access) } : { status: 409, error: w.error, code: w.code }; }
    return undefined;
  };
  globalThis.fetch = async (url, o = {}) => { const r = await PAGE.cur.fetch(String(url), { ...o, method: o.method || 'GET' }); const status = r && r.status ? r.status : 200; return { ok: status < 400, status, json: async () => r }; };
  const roster = [{ key: 'group:g-team', kind: 'group', id: 'g-team', name: 'Team', groupIds: [], groupNames: [] }];
  const open = async () => { const P = newPage({ routes, roster }); await D.EX.openExitAccessDialog({ sidebar: {} }, { hostId: H, name: 'Box' }); const pk = P.pickers[0]; const save = byCls(P.shell && P.shell.body, 'exit-access-save'); return { P, pk, save: async () => { try { await save.click(); } catch (e) { P.threw = String((e && e.message) || e); } await tick(); } }; };   // (c0faf8120's Save threw «extra is not defined» on a list naming a conversation that is not running — said by the leg)
  const useRow = () => st.rowsFor('exit', `${H}:use`)[0] || null;
  const said = (P) => { const secs = P.shell.body.all.filter((n) => n._cls.includes('exit-access-unexcept')); const n = secs[0]; return shown(n) ? textOf(n) : ''; };
  const radio = (P, grant, m) => P.shell.body.all.find((n) => n.tagName === 'INPUT' && n.name === `exit-${grant}-mode` && n.value === m);
  seed();
  { const { P, save } = await open(); await save(); const b = (P.posts[0] || {}).body || {};
    ok(J(exKeys(useRow())) === J(['conversation:cid-cee']) && J((((b.use || {}).except) || []).map((x) => x.key)) === J(['cid-cee']) && !said(P), '(a) CONTROL: an untouched Save keeps the exception', { threw: P.threw, body: b, row: useRow() }); }
  seed();
  { const { P, pk, save } = await open(); pk.pick(['agent:cid-ada']); const s0 = said(P); await save(); const b = (P.posts[0] || {}).body || {};
    ok(J((((b.use || {}).except) || []).map((x) => x.key)) === J(['cid-cee']) && !(b.use || {}).removeExcept && !s0, '(b) Team un-picked, Ada kept: the Save still sends the exception (nothing said, nothing named)', b);
    ok(J(exKeys(useRow())) === J(['conversation:cid-cee']) && J(((useRow() || {}).to || []).map(pkOf)) === J(['conversation:cid-ada']), '(b) …the stored network row keeps it — {to: Ada, except: Cee}', useRow()); }
  { const { P, pk, save } = await open(); pk.pick(['agent:cid-ada', 'group:g-team']); await save();
    ok(P.posts.length === 1 && admitsCee(st.rowsFor('exit', `${H}:use`)).code === 'excepted', '(c) Team picked again later: Cee is still excluded', useRow()); }
  seed();
  { const { P, save } = await open(); const r = radio(P, 'use', 'nobody'); if (r) { r.checked = true; r.onchange(); } await save(); const b = (P.posts[0] || {}).body || {};
    ok(!!r && (b.use || {}).mode === 'nobody' && J(exKeys(useRow())) === J(['conversation:cid-cee']) && J((useRow() || {}).to || []) === J([]), '(b2) «Nobody» KEEPS the list\'s exception (an except-only row — it holds again when a Task Group is given back)', { body: b, row: useRow() }); }
  seed();
  let dBody = null;
  { const { P, pk, save } = await open(); pk.unexcept('agent:cid-cee'); const s = said(P); await save(); dBody = (P.posts[0] || {}).body || {};
    ok(s === 'Cee will no longer be excluded', '(d) the ✕ on «除了：Cee» is SAID in its list', s);
    ok(J((dBody.use || {}).removeExcept) === J(['conversation:cid-cee']) && J(exKeys(useRow())) === J([]), '(d) …and NAMED (use.removeExcept) — written', { body: dBody, row: useRow() }); }
  seed();
  { const before = J(st.rowsFor('exit', `${H}:use`)); const P = newPage({ routes }); const forged = JSON.parse(J(dBody || {})); if (forged.use) delete forged.use.removeExcept; forged.base = E.exitStamp(accessNow()); const r = await P.fetch(`/api/hosts/${H}/exit-access`, { method: 'PATCH', body: J(forged) });
    ok(r.code === 'except_unnamed' && J(st.rowsFor('exit', `${H}:use`)) === before, '(e) that Save with removeExcept stripped is refused except_unnamed — the store as it was', r); }
}

// ═══ ⑥ automation key «授权给…» ══════════════════════════════════════════════════════════════════════════════════════
console.log('⑥ automation key «授权给…» (vault-automation.js showGrantPicker → the grant\'s use row, as setExcept writes it)');
{
  const st = GS.create({ memory: true });
  const GID = 'ag-00000000000a';
  const seed = () => { st.remove('automation-key-use', GID, 'user'); st.set('automation-key-use', GID, { to: [TEAM], except: [CEE] }, 'user'); };
  const key = () => ({ id: 'ak-00000001', name: 'deploy', grants: [{ id: GID, subject: 'group:g-team', mode: 'always', reach: 'opened', except: [...((st.rowsFor('automation-key-use', GID)[0] || {}).except || [])] }] });
  const data = { subjects: { groups: [{ subject: 'group:g-team', name: 'Team' }], sessions: [['cid-ada', 'Ada'], ['cid-cee', 'Cee']].map(([id, name]) => ({ subject: `session:${id}`, name, groupIds: ['g-team'] })) } };
  // src/server/automation-engine.js setExcept: the grant's use row rewritten with the body's except, the names it gives
  const routes = async (url, method, body) => {
    if (url === `/api/automation/grants/${GID}/except` && method === 'POST') { const n = GM.normRow(st.rowsFor('automation-key-use', GID)[0]); const w = st.set('automation-key-use', GID, { to: n.row.to, except: body.except || [], removeExcept: Array.isArray(body.removeExcept) ? body.removeExcept : [] }, 'user'); return w.ok ? { ok: true } : { ok: false, code: w.code, error: w.error }; }
    if (method !== 'GET') return { ok: true };
    return undefined;
  };
  const open = () => { const P = newPage({ routes }); D.VA.showGrantPicker(key(), data, { refresh: () => { } }); return { P, pk: P.pickers[0], save: () => P.shell.opts.unsaved.save() }; };
  const row = () => st.rowsFor('automation-key-use', GID)[0] || null;
  const said = (P) => { const n = byCls(P.shell && P.shell.body, 'vw-ak-unexcept'); return shown(n) ? textOf(n) : ''; };
  seed();
  { const { P, save } = await open(); await save();
    ok(P.posts.length === 0 && J(exKeys(row())) === J(['conversation:cid-cee']) && !said(P), '(a) CONTROL: an untouched Save writes nothing — the exception kept', { posts: P.posts, row: row() }); }
  seed();
  let dBody = null;
  { const { P, pk, save } = await open(); pk.unexcept('group:g-team' === 'x' ? '' : 'session:cid-cee'); const s = said(P); await save(); dBody = ((P.posts.find((p) => /\/except$/.test(p.url)) || {}).body) || {};
    ok(s === 'Cee will no longer be excluded', '(d) the ✕ on «除了：Cee» is SAID under the picker', s);
    ok(J(dBody.removeExcept) === J(['conversation:cid-cee']) && J(exKeys(row())) === J([]), '(d) …and NAMED (removeExcept) — the Team grant\'s row written', { body: dBody, row: row() }); }
  seed();
  { const before = J(st.rowsFor('automation-key-use', GID)); const P = newPage({ routes }); const { removeExcept, ...forged } = dBody || {}; const r = await P.fetch(`/api/automation/grants/${GID}/except`, { method: 'POST', body: J(forged) });
    ok(r.code === 'except_unnamed' && J(st.rowsFor('automation-key-use', GID)) === before, '(e) that Save with removeExcept stripped is refused except_unnamed — the store as it was', r); }
}

// ═══ ⑦ Task Group outside visibility ═════════════════════════════════════════════════════════════════════════════════
console.log('⑦ Task Group outside visibility (task-groups.js _setVisibility — Closed keeps the 除了; a removal names itself)');
{
  const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
  const st = GS.create({ memory: true });
  const dataDir = path.join(SCR, 'tg'); fs.mkdirSync(dataDir, { recursive: true });
  const tg = new TaskGroupManager({ dataDir, onChange: () => { }, readUserState: () => ({}), getSetting: () => undefined, isPathShadowed: () => false, grants: st });
  const id = tg.create({ title: 'Team' }).id;
  const vis = () => tg.visibilityOf(id);
  tg.update(id, { externalVisibility: 'visible', externalVisibilityExcept: [CEE] });
  ok(J(vis()) === J({ externalVisibility: 'visible', externalVisibilityExcept: [CEE] }), '(a) CONTROL: Visible, Cee left out');
  tg.update(id, { externalVisibility: null });
  ok(J(vis().externalVisibilityExcept) === J([CEE]), '(b) Closed KEEPS the members left out (an except-only row)', vis());
  tg.update(id, { externalVisibility: 'visible' });
  ok(J(vis()) === J({ externalVisibility: 'visible', externalVisibilityExcept: [CEE] }), '(c) opened again: Cee is still left out', vis());
  let refused = null; try { tg.update(id, { externalVisibilityExcept: [] }); } catch (e) { refused = e; }
  ok(refused && refused.code === 'except_unnamed' && J(vis().externalVisibilityExcept) === J([CEE]), '(e) a change that leaves Cee out UNNAMED is refused except_unnamed (the row as it was)', refused && { code: refused.code, msg: refused.message });
  tg.update(id, { externalVisibilityExcept: [], externalVisibilityRemoveExcept: ['conversation:cid-cee'] });
  ok(J(vis().externalVisibilityExcept) === J([]), '(d) the ✕ named (externalVisibilityRemoveExcept) — written', vis());
  // the detail's live «除了» row (src/lib/task-detail.js, judged): the group is always picked, so the row is always offered and a
  // chip's ✕ IS the shown removal (each change lands at its click); its PATCH names what the ✕ took away
  const TD = fs.readFileSync(path.join(REPO, 'src/lib/task-detail.js'), 'utf8');
  ok(/pickToRow\(rows, \[evGroupKey\], keys, \{ held: evHeld \}\)/.test(TD) && /externalVisibilityRemoveExcept: gone/.test(TD), 'the detail\'s live 除了 row passes the stored list (held) and names what a ✕ takes away (externalVisibilityRemoveExcept)');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// r2 — 主开发's acceptance of 3f8134f16 (held-except-doors/accept-r1-verdict.json): «AN EXCEPT-ONLY ROW IS A ROW» (it is read,
// drawn, kept and removed by name like any other — hidden, every later Save left it out unnamed and was refused), «A WRITE
// THAT GIVES A MEMBER ITS OWN ENTRY LIFTS THAT MEMBER'S OWN EXCEPTION, BY NAME» (server-side, through the ONE writer — never
// except_conflicts, never a 500), and «A KEPT EXCEPTION RIDES AS IT IS STORED» (never re-resolved, never renamed unnamed).
// The legs below drive the REAL channels engine (a fake adapter, a scratch data dir), the REAL «Grant access…» and machine
// dialogs with the REAL picker (src/lib/principal-picker.js bundled — only utils / i18n / build-version stubbed), and the
// routes' own status functions (their text, as shipped). RED on 3f8134f16 by name.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE REAL PICKER: the one doors bundle carries it beside the stub (part 1's `hx-real:`); from here on the dialogs draw it
globalThis.__hx.real = true;
const RD = D;
// the real picker, read off the fake DOM: its main rows, its kept line (r2), its «除了» chips
const kidOf = (n, cls) => (n ? n.children.find((c) => c._cls.includes(cls)) || null : null);
const ppRow = (pp, key) => { const l = kidOf(pp, 'pp-list'); return l ? l.children.find((n) => n.dataset.key === key) || null : null; };
const keptOf = (pp) => { const k = kidOf(pp, 'pp-kept'); if (!shown(k)) return null; const chips = k.children.filter((c) => c._cls.includes('pp-kept-chip')); return { text: textOf(k), names: chips.map((c) => textOf(kidOf(c, 'pp-kept-name'))), x: (key) => kidOf(chips.find((c) => c.dataset.key === key), 'pp-kept-x') }; };
const exChipsOf = (pp) => { const w = kidOf(pp, 'pp-except'); const inner = w && w.all.find((n) => n._cls.includes('pp-except-picker')); return shown(w) && shown(inner) ? inner.all.filter((n) => n._cls.includes('pp-chip')).map((c) => textOf(kidOf(c, 'pp-chip-name'))) : []; };
const exChipX = (pp, key) => { const w = kidOf(pp, 'pp-except'); const chip = w && w.all.find((n) => n._cls.includes('pp-chip') && n.dataset.key === key); return kidOf(chip, 'pp-chip-x'); };

// ── THE REAL CHANNELS ENGINE (a fake adapter, no messages): Em (m1) and Mo (m2) in Task Groups G1 / G2, Ex (x1) in none ──
// (CHX / CREC / ENG — the channels engine's modules — are required at the top, while the bundles build)
const ENGINES = [];
const E_LIVE = [{ cid: 'm1', name: 'Em', groups: ['g1'] }, { cid: 'x1', name: 'Ex', groups: [] }, { cid: 'm2', name: 'Mo', groups: ['g2'] }];
const EG1 = { kind: 'group', id: 'g1', name: 'G1' }, EG2 = { kind: 'group', id: 'g2', name: 'G2' }, EM1 = { kind: 'agent', id: 'm1', name: 'Em' };
const LEFT_M1 = [{ kind: 'agent', id: 'm1' }];
const E_APP = { sidebar: { _webuiSessions: [['m1', 'Em'], ['x1', 'Ex'], ['m2', 'Mo']].map(([id, name]) => ({ id: `w-${id}`, backendSessionId: id, name })), _tasks: [{ id: 'g1', title: 'G1' }, { id: 'g2', title: 'G2' }],
  _getSessionTaskGroups: (s) => ({ 'w-m1': [{ id: 'g1', title: 'G1' }], 'w-m2': [{ id: 'g2', title: 'G2' }] }[s.id] || []) } };
let engN = 0;
const filesUnder = (dir, name) => { const out = []; const walk = (d) => { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, x.name); if (x.isDirectory()) walk(p); else if (x.name === name) out.push(p); } }; walk(dir); return out; };
/** ONE engine for every leg below (the fast tier's sum: a world after the first costs ~3 ms, the first ~20): several accounts
 *  (`ids` — each its own account grain) of one fake kind, each listing the same conversations (`convs`); `at(A, conv)` = the
 *  leg's handle on one account (and one conversation of it). */
async function engWorld({ ids = ['hxe'], convs = ['ops'] } = {}) {
  const KIND = 'hxe';
  const mod = { kind: KIND, caps: { receive: 'poll', history: 'page', pollInterval: { hot: 30, cold: 300, floor: 10 }, listConversations: true, sendAs: ['user'], identityMarking: 'none', identityMarkingWhere: null, identityMarkingText: null, tosRisk: 'none', idempotency: 'key', threading: 'thread-id', editSent: false, readReceipts: false, attachments: 'metadata' },
    create() { return { auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null }; } },
      async listConversations() { return { conversations: convs.map((id) => CREC.makeConversation({ id, vendorId: id, title: `Room ${id}`, kind: 'group', participants: 'Ada', lastAt: null })), cursor: null, complete: true }; },
      async convCaps() { return { read: 'yes', sendAs: ['user'], why: null, at: Date.now() }; },
      async history() { return { records: [], anchor: null, reachedAnchor: true, complete: true }; },
      async send() { return { ok: true, vendorMessageId: 'x', at: Date.now(), sentAs: 'user' }; }, async reconcile() { return { unknown: true }; } }; } };
  const dataDir = path.join(SCR, `eng-${++engN}`);
  fs.mkdirSync(path.join(dataDir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'channels', 'adapters.json'), J({ v: 1, adapters: ids.map((id) => ({ id, kind: KIND, label: `${id} mail`, enabled: true, linkedAt: 1, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: null, scan: null })) }));
  const registry = CHX.createChannelRegistry(); registry.register(mod);
  const todos = [];
  const userTodos = { add(key, it) { const x = { id: `todo-${todos.length + 1}`, status: 'open', sessionKey: key, ...it }; todos.push(x); return x; }, get(id) { return todos.find((x) => x.id === id) || null; }, setStatus() { }, resolveAnswered() { } };
  const e = ENG.create({ dataDir, env: {}, registry, broadcast: () => { }, log: { log() { }, warn() { }, error() { } }, deliver: { async deliverToConversation() { return { ok: true, lane: 'message' }; }, stashFor() { } }, userTodos, serverSetting: () => undefined, liveSessions: () => E_LIVE, now: () => Date.now() });
  ENGINES.push(e);
  for (const id of ids) await e.pass(id, { force: true });
  const rows = () => { const f = filesUnder(dataDir, 'grants.json')[0]; return f ? JSON.parse(fs.readFileSync(f, 'utf8')).rows : []; };
  const rowOf = (door, res) => rows().find((r) => r.door === door && r.resource === res) || null;
  const audit = () => { const f = filesUnder(dataDir, 'grants-audit.jsonl')[0]; return f ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };
  const at = (A, OPS = convs[0]) => ({ e, A, OPS, todos, view: () => JSON.parse(J(e.adapterView(e.adapterRecords().adapters.find((r) => r.id === A)))), rowOf, audit, ACCT: { kind: 'account' }, OPSC: { kind: 'conversation', convId: OPS }, RA: `account:${A}`, RC: `conversation:${A}/${OPS}` });
  return { e, at };
}
const EW = await engWorld({ ids: ['hxa', 'hxb', 'hxc', 'hxd'], convs: ['c1', 'c2', 'c3', 'c4'] });
// routes/channels.js's account routes as they hand the engine a body (`exceptOf`: the except list + the names a Save gives)
const exceptOfBody = (b) => ({ ...(b && Object.prototype.hasOwnProperty.call(b, 'except') ? { except: b.except } : {}), ...(b && Array.isArray(b.removeExcept) ? { removeExcept: b.removeExcept } : {}) });
const acctRoutes = (w) => async (url, method, body) => {
  if (url === `/api/channels/adapters/${w.A}/view` && method === 'GET') return { adapter: w.view() };
  if (url === `/api/channels/adapters/${w.A}/access` && method === 'PUT') return w.e.setAccess(w.A, w.ACCT, body.access, { base: body.base, ...exceptOfBody(body) });
  return undefined;
};
const openAcct = async (w) => {
  const P = newPage({ routes: acctRoutes(w) });
  await RD.CF.showGrantAccessDialog(E_APP, { kind: 'account', adapter: { id: w.A } });
  const pp = byCls(P.shell && P.shell.body, 'chan-access-pick');
  return { P, pp, said: () => { const n = byCls(P.shell && P.shell.body, 'chan-access-unexcept'); return shown(n) ? textOf(n) : ''; }, save: async () => { await P.shell.opts.unsaved.save(); await tick(); }, lastPut: () => (P.posts.filter((p) => p.method === 'PUT').slice(-1)[0] || {}).body || null };
};
const exOf = (r) => ((r && r.except) || []).map(pkOf).sort();
const toOf = (r) => ((r && r.to) || []).map(pkOf).sort();

// ═══ ⑧ BLOCKER — the account's last Task Group removed: the kept 除了 is a ROW (read, drawn, saved over, removed by name) ═══
console.log('⑧ r2 BLOCKER: an except-only account row is READ and DRAWN — «Grant access…» saves over it and its ✕ names the removal (the REAL engine + dialog + picker)');
if (RD) {
  const w = EW.at('hxa');
  // 1. the owner grants Task Group G1, Em left out; 2. later, in the same dialog, removes G1 (the held 除了 rides — r1)
  const s1 = await w.e.setAccess(w.A, w.ACCT, [{ principal: EG1, authority: 'draft' }], { except: LEFT_M1 });
  { const d = await openAcct(w); const g = ppRow(d.pp, 'group:g1'); if (g) g.click(); await d.save(); }
  const stored = w.rowOf('channel-reach', w.RA);
  ok(s1.ok && J(toOf(stored)) === J([]) && J(exOf(stored)) === J(['conversation:m1']), '(setup) G1 granted with Em left out, then G1 removed in «Grant access…»: the account\'s reach row is {to: [], except: [Em]} (kept — r1)', { s1, stored });
  const g0 = w.view().accountGrain;
  ok(!!g0 && J(exOf(g0)) === J(['conversation:m1']) && J(g0.access) === J([]), '(a) the account view DRAWS that row: accountGrain is non-null with except [Em] (3f8134f16: null — «nothing here», so the dialog drew no 除了)', g0);
  // 3. the owner re-opens «Grant access…» to grant Ex alone
  let d = await openAcct(w);
  const k0 = keptOf(d.pp);
  ok(!!k0 && J(k0.names) === J(['Em']) && /^Kept from an earlier grant — left out:/.test(k0.text), '(b) the re-opened dialog SHOWS the kept exception under the picker: «Kept from an earlier grant — left out: Em»', k0 || textOf(d.pp));
  { const x = ppRow(d.pp, 'agent:x1'); if (x) x.click(); }
  await d.save();
  const b3 = d.lastPut();
  const r3 = w.rowOf('channel-reach', w.RA);
  ok(!!b3 && J((b3.except || []).map((p) => p.kind + ':' + (p.key || p.id))) === J(['conversation:m1']) && !d.P.toasts.some((m) => /changed while the dialog was open/.test(m)) && J(toOf(r3)) === J(['conversation:x1']) && J(exOf(r3)) === J(['conversation:m1']), '(c) its Save granting Ex LANDS — the kept 除了 posted as held, never except_unnamed, never the «changed while open» reopen loop', { body: b3, toasts: d.P.toasts, row: r3 });
  // 4. the kept line's ✕ takes Em away: SAID, NAMED, written
  d = await openAcct(w);
  const k1 = keptOf(d.pp);
  const x1 = k1 && k1.x('agent:m1');
  if (x1) x1.click();
  const s4 = d.said();
  const k1b = keptOf(d.pp);
  await d.save();
  const b4 = d.lastPut();
  const r4 = w.rowOf('channel-reach', w.RA);
  ok(!!x1 && s4 === 'Em will no longer be excluded' && !k1b, '(d) the kept line\'s ✕ on Em: the line goes and the dialog SAYS «Em will no longer be excluded»', { kept: k1, said: s4, after: k1b });
  ok(!!b4 && J(b4.removeExcept) === J(['conversation:m1']) && J(exOf(r4)) === J([]) && J(toOf(r4)) === J(['conversation:x1']), '(d) …its Save NAMES the removal (removeExcept [conversation:m1]) and the row is {to: [Ex], except: []}', { body: b4, row: r4 });
  // 5. THE DESIGNED MEANING: the kept 除了 holds again when a Task Group is given — the 除了 row shows it the moment G2 is picked
  const w2 = EW.at('hxb');
  await w2.e.setAccess(w2.A, w2.ACCT, [{ principal: EG1, authority: 'draft' }], { except: LEFT_M1 });
  await w2.e.setAccess(w2.A, w2.ACCT, [], { except: LEFT_M1 });
  const d5 = await openAcct(w2);
  { const g = ppRow(d5.pp, 'group:g2'); if (g) g.click(); }
  const chips5 = exChipsOf(d5.pp), k5 = keptOf(d5.pp);
  await d5.save();
  const r5 = w2.rowOf('channel-reach', w2.RA);
  ok(J(chips5) === J(['Em']) && !k5 && J(toOf(r5)) === J(['group:g2']) && J(exOf(r5)) === J(['conversation:m1']) && GM.admits([r5], { conversationKey: 'm1', groupIds: ['g2'] }).code === 'excepted', '(e) G2 picked: the 除了 row shows «Em» (the kept row, made visible) and the Save keeps it — Em stays out of G2 (the owner\'s exclusion, as designed)', { chips: chips5, kept: k5, row: r5 });
}

// ═══ ⑨ MAJOR — a write that gives a member its OWN entry lifts that member's own (kept) exception BY NAME ═══
console.log('⑨ r2 MAJOR: the writers that give a member its own entry over its kept exception LIFT it by name (one audit line) — never except_conflicts, never a 500');
{
  const liftedIn = (w, door, res) => w.audit().filter((l) => l.door === door && l.resource === res && l.except && Array.isArray(l.except.removed) && l.except.removed.includes('conversation:m1'));
  // (a) the compatibility assignment (PUT …/:convId/assignment) naming Em, over the conversation's kept exception
  const a = EW.at('hxc', 'c1');
  await a.e.setAccess(a.A, a.OPSC, [{ principal: EG1, authority: 'draft' }], { except: LEFT_M1 });
  await a.e.setAccess(a.A, a.OPSC, [], { except: LEFT_M1 });
  const ra = await a.e.setAssignment(a.A, a.OPS, { principal: EM1, authority: 'draft', notify: 'wake', mode: 'all' });
  const rowA = a.rowOf('channel-reach', a.RC);
  ok(ra && ra.ok && J(toOf(rowA)) === J(['conversation:m1']) && J(exOf(rowA)) === J([]) && liftedIn(a, 'channel-reach', a.RC).length === 1, '(a) setAssignment(Em) over Em\'s kept exception LANDS — the exception lifted by name, one audit line naming it (3f8134f16: except_conflicts)', { ra: ra && { ok: ra.ok, code: ra.code, error: ra.error }, row: rowA, audit: liftedIn(a, 'channel-reach', a.RC) });
  // (b) an agent's own `vibespace-channels watch` over a DORMANT exception (G1's notification removed in Notify…)
  const b = EW.at('hxc', 'c2');
  await b.e.setAccess(b.A, b.OPSC, [{ principal: EG1, authority: 'draft' }]);
  await b.e.setWatchers(b.A, b.OPSC, [{ principal: EG1, notify: 'wake', mode: 'all', dailyWakeCap: 5 }], { except: LEFT_M1 });
  await b.e.setWatchers(b.A, b.OPSC, [], { except: LEFT_M1 });
  const mine = await b.e.agentWatch({ kind: 'agent', id: 'm1', name: 'Em', groups: ['g1'], msgLevelFor: () => 'none' }, `${b.A}/${b.OPS}`, {});
  const rowB = b.rowOf('channel-watch', b.RC);
  ok(mine && mine.ok && J(toOf(rowB)) === J(['conversation:m1']) && J(exOf(rowB)) === J([]) && liftedIn(b, 'channel-watch', b.RC).length === 1, '(b) Em\'s own watch over a DORMANT exception (no Task Group / All agents on the row) LANDS, lifting it by name — never «excepted: a Task Group row leaves you out» (no such row exists)', { mine: mine && { ok: mine.ok, code: mine.code, error: mine.error }, row: rowB });
  // control: a LIVE exception (G1 still notified, Em left out) is the owner's — the agent's own watch never lifts it
  const c = EW.at('hxc', 'c3');
  await c.e.setAccess(c.A, c.OPSC, [{ principal: EG1, authority: 'draft' }]);
  await c.e.setWatchers(c.A, c.OPSC, [{ principal: EG1, notify: 'wake', mode: 'all', dailyWakeCap: 5 }], { except: LEFT_M1 });
  const live = await c.e.agentWatch({ kind: 'agent', id: 'm1', name: 'Em', groups: ['g1'], msgLevelFor: () => 'none' }, `${c.A}/${c.OPS}`, {});
  ok(live && !live.ok && live.code === 'excepted' && J(exOf(c.rowOf('channel-watch', c.RC))) === J(['conversation:m1']), '(b) CONTROL: beside a live Task Group row the exception is the owner\'s — the agent\'s own watch is refused «excepted», the row as it was', live);
  // (c) the owner's Approve of Em's wake ask over the dormant exception (the For-you card's Approve)
  const d = EW.at('hxc', 'c4');
  await d.e.setAccess(d.A, d.OPSC, [{ principal: EG1, authority: 'draft' }]);
  await d.e.setWatchers(d.A, d.OPSC, [{ principal: EG1, notify: 'wake', mode: 'all', dailyWakeCap: 5 }], { except: LEFT_M1 });
  await d.e.setWatchers(d.A, d.OPSC, [], { except: LEFT_M1 });
  const ask = await d.e.agentWatch({ kind: 'agent', id: 'm1', name: 'Em', groups: ['g1'], msgLevelFor: () => 'none' }, `${d.A}/${d.OPS}`, { delivery: 'wake', why: 'r2' });
  const reqId = ((d.e.store.index.table('watchRequests') || []).find((r) => r && r.status === 'open') || {}).id;
  const appr = reqId ? await d.e.decideRequest(reqId, true, 'user', { person: true }) : null;
  const rowD = d.rowOf('channel-watch', d.RC);
  ok(ask && ask.ok !== false && !!reqId && appr && appr.ok && J(toOf(rowD)) === J(['conversation:m1']) && J(exOf(rowD)) === J([]) && liftedIn(d, 'channel-watch', d.RC).length === 1, '(c) the owner\'s Approve of Em\'s wake ask LANDS, lifting the kept exception by name (3f8134f16: except_conflicts — the card\'s Approve answered HTTP 500)', { ask, reqId, appr: appr && { ok: appr.ok, code: appr.code, error: appr.error }, row: rowD });
  // (d) THE ROUTES: a forced conflict (a client that sends a member both given and left out) answers 409 by name, never 500
  const RT = fs.readFileSync(path.join(REPO, 'src/routes/channels.js'), 'utf8'), AR = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf8');
  const fnText = (src, head) => { const i = src.indexOf(head); if (i < 0) return null; const j = src.indexOf('\n}\n', i); return j < 0 ? null : src.slice(i, j + 2); };
  const g400 = /^const GRAIN_400 = [^\n]*$/m.exec(RT);
  const statusOf = (fn, r) => { const res = { code: 200, status(s) { this.code = s; return this; }, json(b) { this.body = b; return this; }, setHeader() { } }; fn(res, r); return { status: res.code, code: res.body && res.body.code, error: res.body && res.body.error }; };
  const mk = (src, head, pre = '') => { const t = fnText(src, head); if (!t) return null; try { return new Function(`${pre}\n${t}\nreturn ${/function (\w+)/.exec(t)[1]};`)(); } catch { return null; } };
  const answer = mk(RT, 'function answer(res, r) {', g400 ? g400[0] : ''), scopeAnswer = mk(RT, 'function scopeAnswer(res, r) {', g400 ? g400[0] : ''), answer3 = mk(RT, 'function answer3(res, r) {');
  const ca = /const chanAnswer = \(res, r\) => \{[\s\S]*?\n\};\n/.exec(AR);
  let chanAnswer = null; try { chanAnswer = ca ? new Function(`${ca[0]}\nreturn chanAnswer;`)() : null; } catch { chanAnswer = null; }
  const CONFLICT = { ok: false, code: 'except_conflicts', error: 'conversation:m1 is both given and excepted — a member with its own grant here cannot also be left out of it' };
  const got = { answer: answer && statusOf(answer, CONFLICT), scopeAnswer: scopeAnswer && statusOf(scopeAnswer, CONFLICT), answer3: answer3 && statusOf(answer3, CONFLICT), chanAnswer: chanAnswer && statusOf(chanAnswer, CONFLICT), excepted: chanAnswer && statusOf(chanAnswer, { ok: false, code: 'excepted', error: 'the user left you out' }) };
  ok(['answer', 'scopeAnswer', 'answer3', 'chanAnswer'].every((k) => got[k] && got[k].status === 409 && got[k].code === 'except_conflicts' && /both given and excepted/.test(got[k].error)), '(d) every channel route answers a forced except_conflicts 409 WITH its sentence — the owner\'s grain routes, the P3 verbs (the Approve), the agent\'s CLI routes (3f8134f16: 500)', got);
  ok(got.excepted && got.excepted.status === 403 && got.excepted.code === 'excepted', '(d) …and the agent\'s «excepted» refusal is a 403 by name (it was a 500)', got.excepted);
  // (e) a compat unassign keeps the kept row; assigning G2 after it keeps Em out of G2 — and «Grant access…» SHOWS «除了 Em»
  if (RD) {
    const e = EW.at('hxd');
    await e.e.setAccess(e.A, e.ACCT, [{ principal: EG1, authority: 'draft' }], { except: LEFT_M1 });
    const un = await e.e.setScopeAssignment(e.A, { kind: 'account' }, null);
    const as = await e.e.setScopeAssignment(e.A, { kind: 'account' }, { principal: EG2, authority: 'draft', notify: 'wake', mode: 'all' });
    const rowE = e.rowOf('channel-reach', e.RA);
    const dE = await openAcct(e);
    const chipsE = exChipsOf(dE.pp);
    ok(un.ok && as.ok && J(toOf(rowE)) === J(['group:g2']) && J(exOf(rowE)) === J(['conversation:m1']) && J(chipsE) === J(['Em']), '(e) compat unassign ⇒ assign G2: the row is {to: [G2], except: [Em]} (the owner\'s exclusion holds, as designed) and «Grant access…» shows «除了：Em» the moment it opens', { un: un.ok, as: as.ok, row: rowE, chips: chipsE });
  }
}

// ═══ ⑩ MINOR 1 — an exception stored under a pending fork's `webui:<id>` key: kept as stored, named as stored, renamed by name ═══
console.log('⑩ r2 MINOR 1: the machine dialog over an exception stored under a pending fork\'s webui:<id> key (the REAL dialog + picker)');
const forkWorld = (H, seedRow) => {
  const st = GS.create({ memory: true });
  const seed = () => { for (const g of ['use', 'run']) st.remove('exit', `${H}:${g}`, 'user'); st.set('exit', `${H}:use`, seedRow, 'user'); };
  // the hub's sessions (exit-routes' activeSessions): a fork with its own id now (cidF, webui F1), Ada, Cee
  const SESS = new Map([['F1', 'cidF'], ['w-cid-ada', 'cid-ada'], ['w-cid-cee', 'cid-cee']]);
  const sidebar = { _webuiSessions: [['F1', 'cidF', 'Fork'], ['w-cid-ada', 'cid-ada', 'Ada'], ['w-cid-cee', 'cid-cee', 'Cee']].map(([id, cid, name]) => ({ id, backendSessionId: cid, name })), _tasks: [{ id: 'g-team', title: 'Team' }], _getSessionTaskGroups: () => [{ id: 'g-team', title: 'Team' }] };
  const HUB = () => ({ sessions: sidebar._webuiSessions.map((s) => ({ id: s.id, backendSessionId: s.backendSessionId, name: s.name })), groups: [{ id: 'g-team', title: 'Team' }] });
  const accessNow = () => E.exitAccessOf({ exit: { ask: false } }, { use: st.rowsFor('exit', `${H}:use`), run: st.rowsFor('exit', `${H}:run`) });
  // src/server/exit-routes.js PATCH: a LIVE row ({kind:'session'}) resolved to its key (gone ⇒ 410 session-gone), then the
  // fork re-key (E.rekeyForkExcept — r2), then exit-proxy setAccess (patchVerdict → exitRows → the ONE writer)
  const live = (row) => { if (!row || row.kind !== 'session') return row; const k = SESS.get(row.session); if (!k) throw Object.assign(new Error(`"${row.name || row.session}" is not running any more — pick it again when it is`), { code: 'session-gone' }); return { kind: 'conversation', key: k }; };
  const routes = async (url, method, body) => {
    if (url === `/api/hosts/${H}/exit-access` && method === 'GET') { const a = accessNow(); return { machine: { id: H, name: 'Box', online: true }, access: E.exitView(a, { roster: HUB() }), base: E.exitStamp(a), usedBy: { use: [], run: [] }, lastRun: null, audit: [], hub: null }; }
    if (url === `/api/hosts/${H}/exit-access` && method === 'PATCH') {
      const b = { ...body };
      try {
        for (const g of ['use', 'run']) {
          if (!b[g] || typeof b[g] !== 'object') continue;
          if (Array.isArray(b[g].who)) b[g] = { ...b[g], who: b[g].who.map(live) };
          if (Array.isArray(b[g].except)) { const g1 = { ...b[g], except: b[g].except.map(live) }; b[g] = typeof E.rekeyForkExcept === 'function' ? E.rekeyForkExcept(g1, (sid) => SESS.get(sid) || null) : g1; }
        }
      } catch (e) { return { status: 410, error: e.message, code: e.code }; }
      const v = E.patchVerdict(accessNow(), b, { now: 5, by: 'user' });
      if (!v.ok) return { status: 400, error: v.error || v.code, code: v.code };
      const w = st.setMany(E.exitRows(v.access, H, v.removeExcept), 'user');
      return w.ok ? { access: E.exitView(v.access), base: E.exitStamp(v.access) } : { status: 409, error: w.error, code: w.code };
    }
    return undefined;
  };
  const open = async () => { const P = newPage({ routes }); globalThis.fetch = async (url, o = {}) => { const r = await PAGE.cur.fetch(String(url), { ...o, method: o.method || 'GET' }); const status = r && r.status ? r.status : 200; return { ok: status < 400, status, json: async () => r }; }; await RD.EX.openExitAccessDialog({ sidebar }, { hostId: H, name: 'Box' }); const pp = P.shell.body.all.find((n) => n._cls.includes('pp') && n.parentElement && n.parentElement._cls.includes('exit-access-picker')); const btn = byCls(P.shell && P.shell.body, 'exit-access-save'); return { P, pp, save: async () => { try { await btn.click(); } catch (e) { P.threw = String((e && e.message) || e); } await tick(); await tick(); }, said: () => { const n = byCls(P.shell.body, 'exit-access-unexcept'); return shown(n) ? textOf(n) : ''; }, refused: () => textOf(byCls(P.shell.body, 'exit-access-refuse')), lastPatch: () => (P.posts.filter((p) => p.method === 'PATCH').slice(-1)[0] || {}).body || null }; };
  const radio = (P, grant, m) => P.shell.body.all.find((n) => n.tagName === 'INPUT' && n.name === `exit-${grant}-mode` && n.value === m);
  return { st, seed, SESS, sidebar, open, radio, row: () => st.rowsFor('exit', `${H}:use`)[0] || null };
};
{
  const FORK_X = { kind: 'conversation', key: 'webui:F1' };
  // PURE: the stored row drawn over the live roster — the fork's live row, its STORED key kept beside it
  const pick = PM.rowToPick({ to: [TEAM], except: [FORK_X] }, [{ key: 'agent:cidF', kind: 'agent', id: 'cidF', name: 'Fork', webuiId: 'F1', groupIds: ['g-team'], groupNames: ['Team'] }], {});
  ok(J(pick.except) === J(['agent:cidF']) && !!pick.storedKey && pick.storedKey['agent:cidF'] === 'conversation:webui:F1', '(a) PURE rowToPick: the fork\'s exception is drawn as its live row (agent:cidF) and carries the key it is STORED under (storedKey → conversation:webui:F1)', pick);
  ok(typeof E.rekeyForkExcept === 'function' && J(E.rekeyForkExcept({ mode: 'only', except: [FORK_X, CEE] }, (sid) => (sid === 'F1' ? 'cidF' : null))) === J({ mode: 'only', except: [{ kind: 'conversation', key: 'cidF' }, CEE], removeExcept: ['conversation:webui:F1'] }) && E.rekeyForkExcept && J(E.rekeyForkExcept({ mode: 'only', except: [FORK_X] }, () => 'webui:F1')) === J({ mode: 'only', except: [FORK_X] }), '(a) PURE E.rekeyForkExcept: a fork that has its own id now ⇒ its exception RENAMED by name (the old key in removeExcept); still pending ⇒ as it is', null);
  if (RD) {
    const fw = forkWorld('h-fork', { to: [TEAM], except: [FORK_X] });
    fw.seed();
    { const d = await fw.open(); await d.save(); const b = d.lastPatch() || {};
      ok(!d.threw && J(((b.use || {}).except || [])) === J([FORK_X]) && J(exKeys(fw.row())) === J(['conversation:cidF']) && !d.refused(), '(b) an untouched Save sends the fork\'s exception AS STORED and the route renames it to the fork\'s own id — it LANDS (3f8134f16: the dialog re-resolved it to conversation:cidF, left webui:F1 unnamed ⇒ except_unnamed, the whole dialog stuck)', { threw: d.threw, body: b, row: fw.row(), refused: d.refused() }); }
    fw.seed();
    { const d = await fw.open(); const x = exChipX(d.pp, 'agent:cidF'); if (x) x.click(); const s = d.said(); await d.save(); const b = d.lastPatch() || {};
      ok(!!x && s === 'Fork will no longer be excluded' && J((b.use || {}).removeExcept) === J(['conversation:webui:F1']) && J(exKeys(fw.row())) === J([]), '(c) the owner\'s ✕ on «除了：Fork» is SAID and NAMED by the key it is stored under (removeExcept [conversation:webui:F1]) — written', { x: !!x, said: s, body: b, row: fw.row(), refused: d.refused() }); }
  }
}

// ═══ ⑪ MINOR 2 — under «Nobody» a kept exception rides as stored: one whose conversation stopped meanwhile never refuses the Save ═══
console.log('⑪ r2 MINOR 2: «Nobody» sends the list\'s kept exceptions as STORED — a conversation that stopped while the dialog was open is no 410');
if (RD) {
  const fw = forkWorld('h-nobody', { to: [TEAM], except: [CEE] });
  fw.seed();
  const d = await fw.open();
  // Cee ends while the dialog is open (the hub's session gone, the sidebar's row gone)
  fw.SESS.delete('w-cid-cee');
  fw.sidebar._webuiSessions = fw.sidebar._webuiSessions.filter((s) => s.id !== 'w-cid-cee');
  const r = fw.radio(d.P, 'use', 'nobody'); if (r) { r.checked = true; r.onchange(); }
  await d.save();
  const b = d.lastPatch() || {};
  ok(!!r && !d.threw && (b.use || {}).mode === 'nobody' && J(((b.use || {}).except || [])) === J([CEE]) && J(exKeys(fw.row())) === J(['conversation:cid-cee']) && J(toOf(fw.row())) === J([]) && !d.refused(), '(a) Nobody + Cee ended meanwhile: the Save sends Cee\'s exception as stored ({kind:conversation, key}) and LANDS (3f8134f16: sent as a live session ⇒ 410 «"Cee" is not running any more», a conversation the owner cannot see under Nobody)', { threw: d.threw, body: b, row: fw.row(), refused: d.refused() });
}
for (const e of ENGINES) { try { e.stop(); } catch { } }

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// r3 — 主开发's acceptance of d4418c363 (held-except-doors/accept-r2-verdict.json): THE KEPT LINE NEVER LIES. A door whose
// model keeps no except-only row (the automation key) draws no kept line and SAYS the exceptions its Save deletes; a kept
// line's ✕ is the dialog's state (the vault door saved the ✕-ed one again); a kept exception rides AS STORED in every door
// (the browser door re-resolved a running one as a live session ⇒ 410 once it stopped). The REAL dialogs + the REAL picker.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const ppOf = (root) => (root ? root.all.find((n) => n._cls.includes('pp') && n._cls.includes('pp-multi') && !n._cls.includes('pp-except-picker')) || null : null);

// ═══ ⑫ MAJOR — the automation key «授权给…»: no kept line over a delete; the Save SAYS what it takes away ═══
console.log('⑫ r3 MAJOR: automation key «授权给…» — Team un-picked: no kept line (its grant is deleted with its 除了), the dialog SAYS «Cee will no longer be excluded»');
{
  const st = GS.create({ memory: true });
  const GT = 'ag-0000000000t1', GA = 'ag-0000000000a1', KID = 'ak-00000002';
  const seed = () => { for (const g of [GT, GA]) st.remove('automation-key-use', g, 'user'); st.set('automation-key-use', GT, { to: [TEAM], except: [CEE] }, 'user'); st.set('automation-key-use', GA, { to: [ADA] }, 'user'); };
  const key = () => ({ id: KID, name: 'deploy', grants: [GT, GA].filter((g) => st.rowsFor('automation-key-use', g).length).map((g) => ({ id: g, subject: g === GT ? 'group:g-team' : 'session:cid-ada', mode: 'always', reach: 'opened', except: [...((st.rowsFor('automation-key-use', g)[0] || {}).except || [])] })) });
  const data = { subjects: { groups: [{ subject: 'group:g-team', name: 'Team' }], sessions: [['cid-ada', 'Ada'], ['cid-cee', 'Cee']].map(([id, name]) => ({ subject: `session:${id}`, name, groupIds: ['g-team'] })) } };
  // src/server/automation-engine.js: DELETE a grant ⇒ dropRows (its exceptions NAMED — the engine's own road); POST /except
  const routes = async (url, method, body) => {
    const del = /^\/api\/automation\/grants\/([^/]+)$/.exec(url);
    if (del && method === 'DELETE') { const g = del[1]; const held = (st.rowsFor('automation-key-use', g)[0] || {}).except || []; const w = st.set('automation-key-use', g, { to: [], except: [], removeExcept: held }, 'user'); return w.ok ? { ok: true } : { ok: false, code: w.code, error: w.error }; }
    const ex = /^\/api\/automation\/grants\/([^/]+)\/except$/.exec(url);
    if (ex && method === 'POST') { const n = GM.normRow(st.rowsFor('automation-key-use', ex[1])[0]); const w = st.set('automation-key-use', ex[1], { to: n.row.to, except: body.except || [], removeExcept: Array.isArray(body.removeExcept) ? body.removeExcept : [] }, 'user'); return w.ok ? { ok: true } : { ok: false, code: w.code, error: w.error }; }
    if (method !== 'GET') return { ok: true };
    return undefined;
  };
  const open = () => { const P = newPage({ routes }); D.VA.showGrantPicker(key(), data, { refresh: () => { } }); const pp = ppOf(P.shell && P.shell.body); return { P, pp, said: () => { const n = byCls(P.shell.body, 'vw-ak-unexcept'); return shown(n) ? textOf(n) : ''; }, save: async () => { await P.shell.opts.unsaved.save(); await tick(); } }; };
  seed();
  { const { P, pp, said, save } = open();
    const g = ppRow(pp, 'group:g-team'); if (g) g.click();
    const k = keptOf(pp), s = said();
    ok(!!g && !k, '(a) Team un-picked, Ada kept: NO kept line — this door\'s exceptions live on the group grant the Save deletes (d4418c363 drew «Kept from an earlier grant — left out: Cee · They stay…» over the delete)', { kept: k });
    ok(s === 'Cee will no longer be excluded', '(b) …the dialog SAYS before Save: «Cee will no longer be excluded»', s);
    await save();
    const reqs = P.posts.map((x) => `${x.method} ${x.url}`);
    ok(J(reqs) === J([`DELETE /api/automation/grants/${GT}`]) && !st.rowsFor('automation-key-use', GT).length && J(exKeys(st.rowsFor('automation-key-use', GA)[0])) === J([]) && P.toasts.includes('Saved'), '(c) …the Save deletes Team\'s grant — its exception named by the engine (dropRows) — and nothing else; what was said happened', { reqs, toasts: P.toasts, rows: [GT, GA].map((x) => st.rowsFor('automation-key-use', x)) }); }
  seed();
  { const { P, pp, save } = open();
    const x = exChipX(pp, 'session:cid-cee'); if (x) x.click();
    await save();
    const b = (P.posts.find((q) => q.url.endsWith('/except')) || {}).body || {};
    ok(!!x && J(b.removeExcept) === J(['conversation:cid-cee']) && J(exKeys(st.rowsFor('automation-key-use', GT)[0])) === J([]) && J(toOf(st.rowsFor('automation-key-use', GT)[0])) === J(['group:g-team']), '(d) CONTROL — the ✕ road: Team kept, «除了：Cee» ✕ ⇒ the grant\'s 除了 dropped BY NAME (removeExcept), Team\'s grant kept', { x: !!x, body: b }); }
}

// ═══ ⑬ MINOR 1 — the vault «Who may use»: the kept line's ✕ is the dialog's state ═══
console.log('⑬ r3 MINOR 1: vault «Who may use» — the kept line\'s ✕ is SAID in the preview and NAMED on the wire (the REAL dialog + picker)');
{
  const ENTRY = 'local:api-key#password';
  const VU_APP = { sidebar: { _webuiSessions: [['cid-ada', 'Ada'], ['cid-cee', 'Cee']].map(([id, name]) => ({ id: `w-${id}`, backendSessionId: id, name })), _tasks: [{ id: 'g-team', title: 'Team' }], _getSessionTaskGroups: () => [{ id: 'g-team', title: 'Team' }] } };
  const member = { kind: 'conversation', key: 'cid-ada', principal: 'conversation:cid-ada', name: 'Ada', hosts: ['api.example.com'], scopes: [{ kind: 'host', host: 'api.example.com' }] };
  const row = { id: ENTRY, label: 'API key', run: { use: { to: [member], except: [{ ...CEE, principal: 'conversation:cid-cee', name: 'Cee' }], entryHosts: [] } } };
  const routes = async (url, method, body) => (url === '/api/vault/use-grants' && method === 'POST' ? { ok: true, use: { to: body.to, except: body.except } } : method !== 'GET' ? { ok: true } : undefined);
  const P = newPage({ routes });
  D.VU.showUseGrantDialog(row, { app: VU_APP, refresh: () => { } });
  const pp = ppOf(P.shell && P.shell.body);
  const k0 = keptOf(pp);
  const x = k0 && k0.x('agent:cid-cee'); if (x) x.click();
  const gone = P.shell.body.all.filter((n) => n._cls.includes('vw-use-except-gone')).map(textOf);
  await P.shell.opts.unsaved.save(); await tick();
  const b = (P.posts.find((q) => q.url === '/api/vault/use-grants') || {}).body || {};
  ok(!!k0 && J(k0.names) === J(['Cee']), '(a) Ada kept, Cee left out from an earlier grant: the kept line draws «Cee»', k0);
  ok(!!x && J(gone) === J(['Cee will no longer be excluded']), '(b) its ✕ ⇒ the preview SAYS «Cee will no longer be excluded» (d4418c363: nothing — pickToRow put the held one back)', { gone });
  ok(J(b.except || null) === J([]) && J(b.removeExcept) === J(['conversation:cid-cee']), '(c) …and the Save NAMES it: except [] + removeExcept [conversation:cid-cee] (d4418c363: except [Cee] again, no removeExcept)', b);
}

// ═══ ⑭ MINOR 2 — the browser «Who can use it»: a kept exception rides AS STORED, a running one too ═══
console.log('⑭ r3 MINOR 2: browser «Who can use it» — a kept exception whose conversation runs is sent by its STORED key; it stopping before Save is no 410');
{
  const view = { use: { mode: 'only', who: [{ kind: 'session', key: 'cid:cid-ada', conversationId: 'cid-ada', live: true, name: 'Ada' }], except: [{ kind: 'session', key: 'cid:cid-cee', conversationId: 'cid-cee', live: true, name: 'Cee' }] } };
  const sessions = [['cid-ada', 'Ada'], ['cid-cee', 'Cee']].map(([id, name]) => ({ id: `w-${id}`, backendSessionId: id, name }));
  const model = D.WM.pickerRows(view, { sessions });
  const sent = D.WM.draftExcept(model.exceptSelected, model);
  ok(J(model.exceptSelected) === J(['session:w-cid-cee']) && J(sent) === J([{ kind: 'session', key: 'cid:cid-cee' }]), '(a) PURE: a held exception whose conversation runs is drawn as its live row and sent AS STORED ({kind:session, key}) — never {kind:session, session} (d4418c363: a live pick the route re-resolves)', { selected: model.exceptSelected, sent });
  // the door: «only Ada», Cee left out and running; Cee stops before Save — the route resolves a LIVE pick (session-gone 410) as
  // src/routes/browser.js resolveExceptRows does, and passes a stored key through
  const PID = 'bp-0000a003', DOOR = 'browser-profile';
  const st = GS.create({ memory: true });
  st.set(DOOR, PID, { to: [ADA], except: [CEE] }, 'user');
  const SESS = new Set(['w-cid-ada', 'w-cid-cee']);
  const app = { sidebar: { _webuiSessions: sessions.map((s) => ({ ...s })), _tasks: [{ id: 'g-team', title: 'Team' }], _getSessionTaskGroups: () => [], getCustomName: () => '', _allSessions: [{ sessionId: 'cid-ada', name: 'Ada' }, { sessionId: 'cid-cee', name: 'Cee' }] } };
  const prof = () => ({ id: PID, label: 'Work', grantUse: B.useOfRows(st.rowsFor(DOOR, PID), { browserKeyOf: () => null }) });
  const routes = async (url, method, body) => {
    if (url === `/api/browser/profiles/${PID}/use`) { const p = prof(); const use = B.useDigestOf(p); return { profile: { id: p.id, label: p.label, legacy: false }, use: { ...use, except: (use.except || []).map((w) => (w.conversationId && SESS.has(`w-${w.conversationId}`) ? { ...w, live: true, name: w.conversationId === 'cid-cee' ? 'Cee' : 'Ada' } : w)) }, base: B.useStamp(p), usedBy: [], createdBy: null }; }
    if (url === `/api/browser/profiles/${PID}` && method === 'PATCH') {
      const ex = [];
      for (const r of (body.use && body.use.except) || []) {
        if (r.kind === 'session' && r.session !== undefined) { if (!SESS.has(r.session)) return { status: 410, error: 'that conversation is not running any more — pick it again from the list', code: 'session-gone' }; ex.push({ kind: 'session', key: `cid:${String(r.session).replace(/^w-/, '')}` }); }
        else ex.push(r);
      }
      const use = { ...body.use, except: ex };
      const p = prof();
      const sv = B.useShapeVerdict(use); if (!sv.ok) return { error: sv.error, code: sv.code };
      const v = B.usePatchVerdict({ profile: p, use, knownTask: (tid) => tid === 'g-team', knownKey: () => false, conversationOf: () => null }); if (!v.ok) return { error: v.error, code: v.code };
      const w = st.set(DOOR, PID, { to: v.row.to, except: v.row.except, removeExcept: Array.isArray(body.removeExcept) ? body.removeExcept : [] }, 'user');
      return w.ok ? { ok: true, profile: { id: PID, label: 'Work' }, detached: [] } : { error: w.error, code: w.code };
    }
    return undefined;
  };
  const P = newPage({ routes });
  const h = await D.BW.openWhoDialog(app, PID, {});
  SESS.delete('w-cid-cee');   // Cee's conversation stops while the dialog is open
  let threw = null; try { await h.save(); } catch (e) { threw = String((e && e.message) || e); }
  await tick();
  const b = (P.posts[0] || {}).body || {};
  const r0 = st.rowsFor(DOOR, PID)[0] || null;
  ok(!threw && J(((b.use || {}).except) || []) === J([{ kind: 'session', key: 'cid:cid-cee' }]) && J(exKeys(r0)) === J(['conversation:cid-cee']) && !P.toasts.some((m) => /not running any more/.test(m)), '(b) the door: an untouched Save while Cee stopped sends Cee\'s exception AS STORED and LANDS — no 410 «pick it again from the list» (d4418c363: refused)', { threw, body: b, row: r0, toasts: P.toasts });
}

console.log(`\n${fail ? "FAILED" : "ALL PASS"} (${pass} passed, ${fail} failed) — ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
