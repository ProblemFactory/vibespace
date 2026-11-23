// test-needs-doors-proxy — B-7aef (主开发 r2863 / r2927, lane bl-phone-ui): THE PROXY DOORS OVER THE HUB's OWN ANSWERS, split out of
// test-needs-doors (r2927 (4): its census keeps its statement; these legs, a real keeper behind the real browser routes, carry their own
// row — the named-debt ratchet takes no new over). A profile saved with the password in its proxy address (before the law) is refused at
// every start BY NAME; the refusal names the profile (an id, never the word) on a PERSON's answer only, and every person's road says it
// through browser-proxy-dialog.js sayProxyRefusal with the profile's own «Move the password to the vault» (the hub moves the word: the
// page posts the id alone). Legs: Browse yourself's real answer → the press → PRESSED, the word moves (store and vault read); an
// agent's answer carries no id; a switch's restart (the same press after the switch's own words); the toast after a locked vault (Unlock
// goes on into the move already pressed; one move at a time); the exit dialog (Move; after a locked vault Unlock… with Move after it).
// REDs: the keeper's and the route's line as before line 578 (no id), the helper as at 82e4d3c50, today's exit dialog, the release's
// exit words. In-process: a real keeper (the capability check finds the fixture client; nothing launches — the refusal comes first),
// express on 127.0.0.1 port 0, the client bundled by esbuild over a minimal DOM (the doors suite's own, copied).
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFakeAgentBrowser } from './fixtures/fake-agent-browser.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const TMP = scratch('needs-doors-proxy');
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* gone */ } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
// ── a minimal DOM: elements with children, classes, data-*, style.cssText, listeners, simple selectors ──
const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function mkStyle() {
  const st = {};
  Object.defineProperty(st, 'cssText', { enumerable: false, get() { return Object.keys(st).filter((k) => st[k] !== '' && st[k] != null).map((k) => `${kebab(k)}: ${st[k]}`).join('; '); }, set(v) { for (const k of Object.keys(st)) delete st[k]; for (const part of String(v || '').split(';')) { const m = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(part); if (m) st[camel(m[1])] = m[2]; } } });
  Object.defineProperty(st, 'setProperty', { enumerable: false, value(k, v) { st[camel(k)] = String(v); } });
  Object.defineProperty(st, 'removeProperty', { enumerable: false, value(k) { delete st[camel(k)]; } });
  return st;
}
let DOC = null;
function matchSel(n, sel) {
  return String(sel).split(',').some((one) => {
    const last = one.trim().replace(/^:scope\s*>\s*/, '').split(/\s*>\s*|\s+/).pop();
    const m = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(last);
    if (!m || n.nodeType !== 1) return false;
    if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
    for (const c of (m[2] || '').split('.').filter(Boolean)) if (!n.classList.contains(c)) return false;
    for (const a of (m[3] || '').match(/\[[^\]]+\]/g) || []) { const am = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(a); if (!am) return false; const v = am[1].startsWith('data-') ? n.dataset[camel(am[1].slice(5))] : n.getAttribute(am[1]); if (am[2] === undefined ? v == null : String(v) !== am[2]) return false; }
    return true;
  });
}
class Nd {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.nodeType = tag === '#text' ? 3 : 1; this.children = []; this.parentNode = null; this.style = mkStyle(); this.dataset = {}; this.attributes = {}; this._text = ''; this._ls = {}; this.className = ''; this.id = ''; this.value = ''; this.disabled = false; }
  get classList() { const n = this; const list = () => String(n.className || '').split(/\s+/).filter(Boolean); return { add: (...c) => { n.className = [...new Set([...list(), ...c])].join(' '); }, remove: (...c) => { n.className = list().filter((x) => !c.includes(x)).join(' '); }, contains: (c) => list().includes(c), toggle: (c, f) => { const has = list().includes(c); const want = f === undefined ? !has : !!f; if (want !== has) { if (want) n.classList.add(c); else n.classList.remove(c); } return want; } }; }
  get childNodes() { return this.children; }
  get firstChild() { return this.children[0] || null; }
  get parentElement() { return this.parentNode; }
  get isConnected() { for (let n = this; n; n = n.parentNode) if (n === DOC.body) return true; return false; }
  _drop(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); n.parentNode = null; }
  appendChild(n) { if (n.parentNode) n.parentNode._drop(n); this.children.push(n); n.parentNode = this; return n; }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? textNode(n) : n); }
  prepend(...ns) { for (const n of ns.reverse()) this.insertBefore(typeof n === 'string' ? textNode(n) : n, this.children[0] || null); }
  insertBefore(n, ref) { if (n.parentNode) n.parentNode._drop(n); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); n.parentNode = this; return n; }
  replaceChildren(...ns) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = ''; this.append(...ns); }
  remove() { if (this.parentNode) this.parentNode._drop(this); }
  before(...ns) { const p = this.parentNode; if (p) for (const n of ns) p.insertBefore(typeof n === 'string' ? textNode(n) : n, this); }   // B-7aef r2863: the vault's own unlock dialog puts its wait line before its error line
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; this._text = String(v ?? ''); }
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) { this.children = []; this._text = ''; this._html = String(v ?? ''); }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }
  addEventListener(type, f) { (this._ls[type] ||= []).push(f); }
  removeEventListener(type, f) { const l = this._ls[type]; if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } }
  listening(type) { return (this._ls[type] || []).length; }
  dispatchEvent(ev) { for (const f of [...(this._ls[ev.type] || [])]) f(ev); return true; }
  matches(sel) { return matchSel(this, sel); }
  closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matchSel(n, sel)) return n; return null; }
  contains(x) { for (let n = x; n; n = n.parentNode) if (n === this) return true; return false; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (matchSel(c, sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() { DOC.activeElement = this; }
  blur() {}
  select() { this.selected = true; }
  click() { const ev = { type: 'click', target: this, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }; if (typeof this.onclick === 'function') this.onclick(ev); this.dispatchEvent(ev); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  get offsetWidth() { return parseFloat(this.style.width) || 0; }
  get offsetHeight() { return parseFloat(this.style.height) || 0; }
  get offsetLeft() { return parseFloat(this.style.left) || 0; }
  get offsetTop() { return parseFloat(this.style.top) || 0; }
}
const textNode = (s) => { const n = new Nd('#text'); n._text = String(s); return n; };
DOC = new Nd('#document'); DOC.nodeType = 9;
DOC.body = new Nd('body'); DOC.head = new Nd('head'); DOC.documentElement = new Nd('html'); DOC.documentElement.lang = 'en';
let PREVIEW = null, EXEC_COPY = false;
Object.assign(DOC, {
  createElement: (tg) => new Nd(tg), createTextNode: textNode, hidden: false, visibilityState: 'visible', hasFocus: () => true,
  getElementById: (id) => { const walk = (n) => { for (const c of n.children) { if (c.id === id) return c; const r = walk(c); if (r) return r; } return null; }; return walk(DOC.body); },
  querySelector: (sel) => (PREVIEW && /desktop-preview-win/.test(sel) ? PREVIEW : DOC.body.querySelector(sel)), querySelectorAll: (sel) => DOC.body.querySelectorAll(sel),
  execCommand: () => EXEC_COPY,
});
const PREFS = {};
let RELOADS = 0;
Object.assign(globalThis, {
  window: globalThis, document: DOC, localStorage: { getItem: (k) => (k in PREFS ? PREFS[k] : null), setItem: (k, v) => { PREFS[k] = String(v); }, removeItem: (k) => { delete PREFS[k]; } },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: (i) => clearTimeout(i), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  MutationObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} }, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  location: { origin: 'http://vs.test', href: 'http://vs.test/', protocol: 'http:', host: 'vs.test', hostname: 'vs.test', pathname: '/', search: '', hash: '', reload() { RELOADS++; } },
  getComputedStyle: () => ({ getPropertyValue: () => '' }), addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
  CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } },
});
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', languages: ['en'], userAgent: 'node', maxTouchPoints: 0, clipboard: null }, configurable: true, writable: true });
const realFetch = globalThis.fetch;
// A LEG LEAVES NOTHING IN FLIGHT (主开发 r1101, 2026-11-21 — the release mirror of 2.369.414, run 44886765836: the suite died on
// «hd.hosts is not iterable at Sb2._renderMountsOnce», a redraw the machines-1 (verifier #2) leg had started and left behind, served
// by a LATER leg's stand-in that answered every address «fine»). Every stand-in fetch answers ONLY its own leg's addresses; any
// other call is REFUSED BY NAME (a 404 whose error names the leg) and RECORDED with the leg it landed in, so a stray call is red
// where it happens (the census at the end of this section), never a silent answer. `stray(leg)` = that refusal.
const STRAYS = [];
const stray = (leg) => (url, o) => { const u = String(url); STRAYS.push(`${leg}: ${(o && o.method) || 'GET'} ${u}`); return { ok: false, status: 404, json: async () => ({ error: `not an address of the leg «${leg}»: ${u}` }) }; };
const noFetch = async (url, o) => { STRAYS.push(`between legs: ${(o && o.method) || 'GET'} ${String(url)}`); throw new Error('no fetch in this leg'); };
let FETCH = noFetch;
globalThis.fetch = (...a) => FETCH(...a);

const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const stubBuildVersion = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const answerOf = (answer) => ({ ok: !(answer && (answer.error || answer.ok === false)), status: answer && (answer.error || answer.ok === false) ? 409 : 200, json: async () => answer });
const bundleOf = async (entry, swaps, tag) => {   // a module bundled alone, a source swapped in (a RED control's copy, built by anchored())
  const swap = { name: tag + '-src', setup(b) { for (const [re, src] of swaps) b.onLoad({ filter: re }, () => ({ contents: src, loader: 'js' })); } };
  const out = await esbuild.build({ stdin: { contents: entry, resolveDir: path.join(REPO, 'src/lib'), sourcefile: tag + '-entry.js', loader: 'js' }, bundle: true, format: 'esm', write: false, plugins: [stubBuildVersion, swap], logLevel: 'silent', loader: { '.css': 'empty' } });
  const f = path.join(TMP, tag + '.mjs'); fs.writeFileSync(f, out.outputFiles[0].text);
  return import(pathToFileURL(f).href);
};
const newToasts = (seen) => DOC.body.querySelectorAll('.global-toast-body').filter((x) => !seen.has(x));
const dropToasts = (seen) => { for (const b of newToasts(seen)) if (b.parentNode) Nd.prototype.remove.call(b.parentNode); };
console.log('THE PROXY DOORS OVER THE HUB\'S OWN ANSWERS (B-7aef, 主开发 r2863 / r2927)');
{
    // (2) THE PROXY's PASSWORD IN ITS ADDRESS: «Move the password to the vault» = the profile's own move (主开发 r2686: the hub moves the
    // word, it never crosses the page). 主开发 r2863: EVERY ANSWER HERE IS THE HUB's OWN — a real keeper whose profiles were saved with the
    // password in the address before the law, behind the real browser routes (express on 127.0.0.1, port 0); the move is the keeper's
    // own (what the vault route's proxyMove calls); the vault a stand-in this leg locks and unlocks. RED: the id dropped where it is
    // dropped today (the keeper's launch refusal, the route's answer — each today's line, in memory); today's exit dialog (no vault door)
    const Module = require('node:module');
    const memOf = (rel, from, to, what) => { const file = path.join(REPO, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(anchored(fs.readFileSync(file, 'utf8'), from, to, what), file); return m.exports; };
    const RKROOT = path.join(TMP, 'b7aef-keeper'), RKHOME = path.join(RKROOT, 'home'), RKDATA = path.join(RKROOT, 'data'), RKSTORE = path.join(RKDATA, 'browser-profiles.json');
    const PUSER = 'standin-user', PPASS = ['standin', 'pw', String(process.pid)].join('-');   // built at run time — never a literal secret
    const PADDR = 'http://proxy.example.test:3128';
    const rkVault = { locked: false, entries: new Map() };
    Object.assign(rkVault, {
      state: () => (rkVault.locked ? 'locked' : 'unlocked'),
      secretPut: (name, value) => { if (rkVault.locked) return { ok: false, code: 'key-unreadable:vault_locked' }; rkVault.entries.set(name, Buffer.from(value)); return { ok: true }; },
      secretGet: (name) => (rkVault.locked ? { ok: false, code: 'key-unreadable:vault_locked' } : { ok: true, value: rkVault.entries.has(name) ? Buffer.from(rkVault.entries.get(name)) : null }),
      secretDrop: (name) => { rkVault.entries.delete(name); return { ok: true }; },
      secretNames: () => [...rkVault.entries.keys()].map((name) => ({ name, at: 1 })),
      noteUse: () => ({ receipt: null }),
    });
    const storeNow = () => { const w = require(path.join(REPO, 'src/store-writer.js')).storeWriter().flushSync(); if (w && (w.deferred || (w.left && w.left.length))) throw new Error('the store writer left owed writes'); return fs.readFileSync(RKSTORE, 'utf8'); };
    const rowOf = (id) => { try { return JSON.parse(storeNow()).profiles.find((x) => x.id === id) || null; } catch { return null; } };
    const movedWord = (id) => { const row = rowOf(id); const v = row && typeof row.proxyCredential === 'string' ? rkVault.entries.get(row.proxyCredential) : null; return !!row && row.proxy === PADDR && !JSON.stringify(row).includes(PPASS) && !!v && v.toString() === PPASS; };
    const stillHeld = (id) => { const row = rowOf(id); return !!row && String(row.proxy || '').includes(PPASS); };
    let BR = null, kNow = null, kToday = null, ids = [], rkErr = null;
    const servers = [];
    try {
      fs.mkdirSync(RKHOME, { recursive: true }); fs.mkdirSync(RKDATA, { recursive: true });
      writeFakeAgentBrowser(path.join(RKROOT, 'bin'), path.join(RKROOT, 'ab-state'));   // the capability check finds a client (nothing launches: the refusal comes first)
      const logins = require(path.join(REPO, 'src/server/browser-proxy-logins.js')).create({ vault: rkVault, log: { log() { }, warn() { } } });
      const make = (mod) => mod.create({ dataDir: RKDATA, homeDir: RKHOME, env: () => ({ PATH: `${path.join(RKROOT, 'bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: RKHOME, FAKE_AB_STATE: path.join(RKROOT, 'ab-state') }),
        serverSetting: (k) => (k === 'browser.exitCheckUrl' ? 'https://exit-check.example.com/ip' : undefined), liveKeys: () => new Set(), install: false, tickMs: 3600e3, log: { log() { }, warn() { }, error() { } }, hostKnown: () => false, userTodos: { add: () => ({ id: 'u1' }) }, proxyLogins: logins });
      const RK = require(path.join(REPO, 'src/server/browser-keeper.js'));
      const k0 = make(RK);
      ids = ['Legacy browse', 'Legacy exit', 'Legacy exit today', 'Legacy toast', 'Legacy toast today', 'Legacy switch'].map((label) => k0.createProfile({ label, proxy: PADDR }).id);
      const doc = JSON.parse(storeNow());
      for (const id of ids) doc.profiles.find((x) => x.id === id).proxy = 'http://' + [PUSER, PPASS].join(':') + '@proxy.example.test:3128';   // saved WITH its password, before the law
      fs.writeFileSync(RKSTORE, JSON.stringify(doc));
      kNow = make(RK);
      kToday = make(memOf('src/server/browser-keeper.js', "    if (!v.ok) throw namedError(v.code, v.error, v.code === 'proxy_password_in_profile' && v.profileId ? { profileId: v.profileId } : {});", '    if (!v.ok) throw namedError(v.code, v.error);', 'today: the launch refusal drops the verdict\'s id'));
      BR = require(path.join(REPO, 'src/routes/browser.js'));
      const RTToday = memOf('src/routes/browser.js', "    ...(!agentRoad && e?.code === 'proxy_password_in_profile' && typeof e?.profileId === 'string' && ID_RE.test(e.profileId) ? { profileId: e.profileId } : {}),\n", '', 'today: the route\'s answer drops the id');
      const express = require('express');
      // one routes module serves two keepers (now / today) — its context is set per request (the asks here are one at a time)
      const serve = async (R, keeper) => { const app = express(); app.use(express.json()); app.use((q, s, next) => { R.setup({ keeper, activeSessions: new Map(), browserEnv: () => null, forwards: () => [], propose: () => ({ id: 'ut-b7aef' }) }); next(); }); app.use(R.router); const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); }); servers.push(srv); return `http://127.0.0.1:${srv.address().port}`; };
      servers.now = await serve(BR, kNow); servers.keeperToday = await serve(BR, kToday); servers.routeToday = await serve(RTToday, kNow);
    } catch (e) { rkErr = String((e && e.stack) || e).slice(0, 900); }
    ok(!rkErr && ids.length === 6 && !!kNow && !!kToday && ids.every(stillHeld), 'B-7aef setup: a real keeper over six profiles saved with the password in the address, its today copy, the real browser routes and their today copy', rkErr);
    const hubAnswer = async (base, sub, id) => { if (!base) return null; const res = await realFetch(`${base}/api/browser/profiles/${encodeURIComponent(id)}/${sub}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); return { status: res.status, body: await res.json() }; };
    const keeperMove = async (o) => { const b = o && o.body ? JSON.parse(o.body) : {}; return { b, answer: await kNow.moveProxyPassword(String(b.profileId || '')) }; };
    // MUST 1 — Browse yourself (the panel row's, the switch dialog's «Open it yourself»): the hub's own answer names the profile; the page's
    // refusal (sayProxyRefusal — every person's road says it there) draws the press over THAT answer; PRESSED, the word moves
    const A = await hubAnswer(servers.now, 'browse', ids[0]), AK = await hubAnswer(servers.keeperToday, 'browse', ids[0]), AR = await hubAnswer(servers.routeToday, 'browse', ids[0]);
    let AG = null;
    try { const e0 = kNow ? await kNow.start(ids[0], { why: 'user' }).then(() => null, (e) => e) : null; if (BR && e0) BR.fail({ req: { path: '/api/agent/browser/open' }, locals: {}, status() { return this; }, json(b) { AG = b; } }, e0); } catch (e) { AG = { threw: String(e && e.message) }; }
    ok(!!A && A.status === 409 && A.body.code === 'proxy_password_in_profile' && A.body.profileId === ids[0] && !JSON.stringify(A.body).includes(PPASS),
      'B-7aef r2863: Browse yourself on a profile whose proxy address carries its password — THE HUB\'s answer (the real keeper behind the real route) names that profile by its id; the word is in no part of it', A);
    ok(!!AG && AG.code === 'proxy_password_in_profile' && !('profileId' in AG) && !JSON.stringify(AG).includes(PPASS), 'B-7aef r2863: the same refusal answered on an agent\'s route carries no id — the press is the owner\'s page only (r2686 law 1)', AG);
    const ENTRY_BPD = "export * as BPD from './browser-proxy-dialog.js'; export * as SM from './browser-switcher-model.js'; export { t } from './i18n.js';";
    const PDSRC = fs.readFileSync(path.join(REPO, 'src/lib/browser-proxy-dialog.js'), 'utf8');
    let BPDX = null, BPD = null, BPDR = null;
    try {
      BPDX = await bundleOf(ENTRY_BPD, [], 'b7aef-bpd'); BPD = BPDX.BPD;
      // the RED copy: the helper's two lines as at 82e4d3c50 — Unlock alone after a locked vault, no move-in-flight guard
      BPDR = (await bundleOf("export * as BPD from './browser-proxy-dialog.js';", [[/browser-proxy-dialog\.js$/, anchored(anchored(PDSRC, "  const goesOn = act === 'move' && door === 'unlock' && !!id;", '  const goesOn = false;', 'B-7aef r2927: the toast as at 82e4d3c50 — Unlock alone after a locked vault'), '  if (MOVING.has(id)) return false;\n', '', 'B-7aef r2927: the helper as at 82e4d3c50 — no move in flight guard')]], 'b7aef-bpdr')).BPD;
    } catch (e) { ok(false, 'B-7aef: the proxy dialog bundles alone (now, and its RED copy as at 82e4d3c50)', String(e && e.message).slice(0, 400)); }
    const pressDrive = async (answer, { lead = '' } = {}) => {
      const moves = [];
      const before0 = FETCH;
      FETCH = async (url, o) => { if (String(url) !== '/api/vault/proxy-logins/move') return before0(url, o); const m = await keeperMove(o); moves.push(m.b); return answerOf(m.answer); };
      const seen = new Set(DOC.body.querySelectorAll('.global-toast-body'));
      if (BPD && typeof BPD.sayProxyRefusal === 'function' && answer) BPD.sayProxyRefusal(answer, 'Could not open the browser', lead ? { said: lead } : {});
      const body0 = newToasts(seen)[0] || null;
      const press = body0 && body0.parentNode ? body0.parentNode.querySelector('.global-toast-action') : null;
      const drawn = { words: body0 ? body0.textContent : '', press: press ? press.textContent : null };
      if (press) { press.click(); for (let i = 0; i < 40 && !moves.length; i++) await tick(10); await tick(20); }
      const said = newToasts(seen).map((x) => x.textContent);
      dropToasts(seen);
      FETCH = noFetch;
      return { drawn, moves, said };
    };
    const PK = AK ? await pressDrive(AK.body) : null, PR = AR ? await pressDrive(AR.body) : null;   // the REDs first: a press they drew would move the word
    const P = A ? await pressDrive(A.body) : null;
    ok(!!P && P.drawn.press === 'Move the password to the vault' && P.drawn.words.includes('move it to the vault first'),
      'B-7aef r2863 MUST 1: over the hub\'s own answer the page\'s refusal draws «Move the password to the vault» beside its words', P && P.drawn);
    ok(!!P && P.moves.length === 1 && JSON.stringify(P.moves[0]) === JSON.stringify({ profileId: ids[0] }) && movedWord(ids[0]) && P.said.some((s) => s.includes('The proxy password is in the vault now')),   // stale-pins: kept — the drawn toast's words, read at run time (drawn by browser-proxy-dialog.js / browser-exit-dialog.js)
      'B-7aef r2863 MUST 1: PRESSED, it posts that profile\'s id ONLY and THE WORD MOVES — the profile keeps the address and a vault reference alone, the vault holds the password, the page says so', { moves: P && P.moves, said: P && P.said, row: rowOf(ids[0]) && Object.keys(rowOf(ids[0])) });
    ok(!!AK && AK.body.code === 'proxy_password_in_profile' && !AK.body.profileId && !!PK && !PK.drawn.press && !PK.moves.length,
      'RED control: the keeper as today (its launch refusal drops the verdict\'s id) — the hub\'s answer names no profile, the page draws no press', { answer: AK && AK.body.code, drawn: PK && PK.drawn });
    ok(!!AR && AR.body.code === 'proxy_password_in_profile' && !AR.body.profileId && !!PR && !PR.drawn.press && !PR.moves.length,
      'RED control: the route as today (its answer drops the id) — the hub\'s answer names no profile, the page draws no press', { answer: AR && AR.body.code, drawn: PR && PR.drawn });
    // 主开发 r2927 (1): A SWITCH to another backend whose restart meets the refusal — the keeper's own start refusal with the switch's three
    // rollback facts as switchBackend sets them (it rethrows the start's error itself: read below), answered through the real fail();
    // the switch's own words first, the proxy's after them, the same press; PRESSED, the word moves
    let SA = null;
    try { const e1 = kNow ? await kNow.start(ids[5], { why: 'switch chromium → cdp' }).then(() => null, (e) => e) : null; if (BR && e1) { e1.restored = true; e1.from = 'chromium'; e1.to = 'cdp'; BR.fail({ req: { path: '/api/browser/switch' }, locals: {}, status() { return this; }, json(b) { SA = b; } }, e1); } } catch (e) { SA = { threw: String(e && e.message) }; }
    const SWW = SA && BPDX && BPDX.SM && typeof BPDX.SM.switchOutcomeWords === 'function' ? BPDX.SM.switchOutcomeWords(SA, { t: BPDX.t, from: 'chromium', to: 'cdp', label: 'Legacy switch' }) : null;
    const PS = SA && SWW ? await pressDrive(SA, { lead: SWW.text }) : null;
    ok(!!SA && SA.code === 'proxy_password_in_profile' && SA.profileId === ids[5] && SA.restored === true && !!PS && PS.drawn.press === 'Move the password to the vault' && PS.drawn.words.startsWith(SWW.text) && PS.drawn.words.includes('move it to the vault first')
       && PS.moves.length === 1 && JSON.stringify(PS.moves[0]) === JSON.stringify({ profileId: ids[5] }) && movedWord(ids[5]),
      'B-7aef r2927 (1): a switch whose restart meets the refusal says the switch\'s own words, then the proxy\'s, with the same press — PRESSED, that profile\'s word moves', { answer: SA && [SA.code, SA.restored, !!SA.profileId], drawn: PS && PS.drawn, moves: PS && PS.moves });
    // r2927 (2) + (3): THE TOAST ROADS AFTER A LOCKED VAULT — the start refusal's Move pressed, and again from another toast while the first
    // is out: ONE post; the vault's refusal draws Unlock…, and its unlock (the vault's own dialog) GOES ON into that move: one press, the
    // word moves, never a second move. REDs (each the helper's line as at 82e4d3c50): Unlock alone (the word stays); no guard (two posts)
    const toastDrive = async (B, answer, { unlock = true, second = true } = {}) => {
      const posts = []; let unlocks = 0;
      const before0 = FETCH;
      FETCH = async (url, o) => {
        const u = String(url);
        if (u === '/api/vault/proxy-logins/move') { const m = await keeperMove(o); posts.push([m.b, m.answer && (m.answer.ok ? 'ok' : m.answer.code)]); return answerOf(m.answer); }
        if (u === '/api/vault/unlock') { unlocks++; rkVault.locked = false; return answerOf({ ok: true, state: 'unlocked' }); }   // the second password taken: the stand-in vault opens
        return before0(url, o);
      };
      const before = new Set(DOC.body.children), seen = new Set(DOC.body.querySelectorAll('.global-toast-body'));
      const actionOf = (re) => { for (const b of newToasts(seen)) { const a = b.parentNode && b.parentNode.querySelector('.global-toast-action'); if (a && re.test(b.textContent)) return a; } return null; };
      const settle = async (cond) => { for (let i = 0; i < 40 && !cond(); i++) await tick(10); await tick(20); };
      rkVault.locked = true;
      if (B && typeof B.sayProxyRefusal === 'function' && answer) B.sayProxyRefusal(answer, 'Could not open the browser');
      const press = actionOf(/move it to the vault first/);
      if (press) { press.click(); if (second && typeof B.moveProxyPassword === 'function') B.moveProxyPassword(answer.profileId); }   // a second press (another road's toast) while the first is out
      await settle(() => posts.length >= 1); await tick(30);
      const locked = { posts: posts.length, said: newToasts(seen).map((x) => x.textContent) };
      const un = actionOf(/The vault is locked/);
      const unlockLabel = un ? un.textContent : null;
      if (un && unlock) {
        un.click(); await tick(10);
        const pw = DOC.getElementById('vault-unlock-pw'), go = DOC.body.querySelector('.vault-unlock-go');
        if (pw && go) { pw.value = ['second', String(process.pid)].join('-'); go.click(); await settle(() => unlocks > 0 && !DOC.getElementById('vault-unlock-pw')); for (let i = 0; i < 50 && posts.length < 2; i++) await tick(10); await tick(30); }   // the move goes on in-process after the unlock (no HTTP): a short bound — the RED waits it out
      }
      const said = newToasts(seen).map((x) => x.textContent);
      dropToasts(seen);
      for (const n of DOC.body.children.filter((c) => !before.has(c))) Nd.prototype.remove.call(n);
      FETCH = noFetch; rkVault.locked = false;
      return { posts, locked, unlockLabel, unlocks, said };
    };
    const T3 = await hubAnswer(servers.now, 'browse', ids[3]), T4 = await hubAnswer(servers.now, 'browse', ids[4]);
    const TG = T4 ? await toastDrive(BPDR, T4.body, { second: false }) : null, TM = T4 ? await toastDrive(BPDR, T4.body, { unlock: false }) : null;   // the REDs first (ids[4]: nothing they do may move it)
    const TT = T3 ? await toastDrive(BPD, T3.body) : null;
    ok(!!TT && TT.locked.posts === 1 && TT.posts[0] && TT.posts[0][1] === 'vault_locked' && TT.unlockLabel === 'Unlock…' && TT.locked.said.some((x) => x.includes('the password moves once the vault is open')),
      'B-7aef r2927 (2)+(3): two presses while the first is out make ONE post; the locked vault\'s refusal says so and draws Unlock… — the move goes on once the vault is open', TT && { posts: TT.posts, locked: TT.locked, label: TT.unlockLabel });
    ok(!!TT && TT.unlocks === 1 && TT.posts.length === 2 && TT.posts[1][1] === 'ok' && TT.posts.every((x) => JSON.stringify(x[0]) === JSON.stringify({ profileId: ids[3] })) && movedWord(ids[3]) && TT.said.some((x) => x.includes('The proxy password is in the vault now')),
      'B-7aef r2927 (2): PRESSED Unlock (the vault\'s own dialog), the move the person already pressed GOES ON — one press, the word in the vault, no second move', TT && { posts: TT.posts, said: TT.said });
    ok(!!TG && TG.unlocks === 1 && TG.posts.length === 1 && stillHeld(ids[4]), 'RED control: the toast as at 82e4d3c50 — after the unlock no move is left on that surface: the word stays in the profile', TG && { posts: TG.posts, label: TG.unlockLabel });
    ok(!!TM && TM.posts.length === 2 && stillHeld(ids[4]), 'RED control: the helper as at 82e4d3c50 (no move in flight guard) — a second press while the first is out posts a second move', TM && { posts: TM.posts });
    // the roads that say a start's proxy refusal through sayProxyRefusal (named in the line): the panel's act() (Restart, a kept Resume),
    // Browse yourself and the live view's Resume / Restart, the For-you Restart — each hands the hub's answer as it came
    const ROADS = [['src/lib/browser-trace-view.js', 'sayProxyRefusal(r, what)'], ['src/lib/browser-live-window.js', "sayProxyRefusal(r, t('Could not open the browser'))"], ['src/lib/browser-live-window.js', "sayProxyRefusal(r, t('Could not resume the browser'))"],
      ['src/lib/browser-live-window.js', "sayProxyRefusal(r, t('Could not restart the browser'))"], ['src/lib/user-todos-actions.js', "sayProxyRefusal(r, t('Could not restart the browser'))"],
      ['src/lib/browser-switcher.js', "sayProxyRefusal(r, '', { said: said.text })"], ['src/server/browser-keeper.js', "if (e && typeof e === 'object') { e.restored = restored; e.from = from; e.to = to; throw e; }"]];
    const roadMiss = ROADS.filter(([f, call]) => !fs.readFileSync(path.join(REPO, f), 'utf8').includes(call));
    ok(roadMiss.length === 0, 'B-7aef r2863 / r2927: every person\'s road that meets a start\'s proxy refusal hands the hub\'s answer, as it came, to sayProxyRefusal (the panel\'s Restart / kept Resume, Browse yourself, the live view\'s Resume / Restart, the For-you Restart, a switch — whose keeper rethrows the start\'s own refusal)', roadMiss);
    // MUST 2 — the exit dialog: the hub's own check answer draws Move; a move a LOCKED vault refused takes the same door as the proxy
    // dialog — Unlock… / Set up the vault… — with Move AFTER it; the leg presses Unlock (the vault's own dialog), then completes the move
    const EWSRC = fs.readFileSync(path.join(REPO, 'src/lib/browser-exit-words.js'), 'utf8'), EDSRC = fs.readFileSync(path.join(REPO, 'src/lib/browser-exit-dialog.js'), 'utf8');
    const ENTRY_BX = "export * as BED from './browser-exit-dialog.js'; export * as BPM from './browser-proxy-model.js'; export * as BEW from './browser-exit-words.js';";
    let BX = null, BXW = null, BXD = null;
    try {
      BX = await bundleOf(ENTRY_BX, [], 'b7aef-bx');
      BXW = await bundleOf(ENTRY_BX, [[/browser-exit-words\.js$/, anchored(EWSRC, "    case 'proxy_password_in_profile': return row(t('Its proxy address carries its password, which is never used — move it to the vault first.'), '', 'move');", "    case 'proxy_password_in_profile': return row(t('Its proxy address carries its password, which is never used — move it to the vault first.'));", 'B-7aef: the exit words as released — no door as data')]], 'b7aef-bxw');
      BXD = await bundleOf(ENTRY_BX, [[/browser-exit-dialog\.js$/, anchored(EDSRC, "    vaultDoor.style.display = text && vault ? '' : 'none';", "    vaultDoor.style.display = 'none';", 'B-7aef r2863: today\'s exit dialog — no vault door (Move alone after a locked vault)')]], 'b7aef-bxd');
    } catch (e) { ok(false, 'RED control setup: the exit dialog bundles alone (now, the words as released, today\'s dialog)', String(e && e.message).slice(0, 600)); }
    const exitDrive = async (B, id, label) => {
      const calls = [];
      const before0 = FETCH;
      FETCH = async (url, o) => {
        const u = String(url);
        if (u === `/api/browser/profiles/${encodeURIComponent(id)}/exit-check`) { calls.push(['check']); return realFetch(servers.now + u, o); }   // the hub answers
        if (u === '/api/vault/proxy-logins/move') { const m = await keeperMove(o); calls.push(['move', m.b, m.answer && m.answer.code]); return answerOf(m.answer); }
        if (u === '/api/vault/unlock') { calls.push(['unlock']); rkVault.locked = false; return answerOf({ ok: true, state: 'unlocked' }); }   // the second password taken: the stand-in vault opens
        return before0(url, o);
      };
      const before = new Set(DOC.body.children), seen = new Set(DOC.body.querySelectorAll('.global-toast-body'));
      const app = { settings: { get: (k) => (k === 'browser.exitCheckUrl' ? 'https://exit-check.example.com/ip' : undefined) } };
      rkVault.locked = true;
      if (B && B.BED && typeof B.BED.openExitDialog === 'function' && servers.now) B.BED.openExitDialog(app, { id, label });
      const q = (sel) => DOC.body.querySelector(sel);
      const shown = (sel) => { const d = q(sel); return !!d && d.style.display !== 'none'; };
      const look = () => { const r = q('.bnew-refusal'), v = q('.bexit-vault'), n = q('.bwho-notes'), kids = n ? n.children : []; return { words: r ? r.textContent : '', said: !!r && r.style.display !== 'none', move: shown('.bexit-door'), vault: shown('.bexit-vault') ? v.textContent : null, greyed: !!((q('.bexit-door') || {}).disabled || (v || {}).disabled), vaultFirst: kids.findIndex((c) => c.classList.contains('bexit-vault')) < kids.findIndex((c) => c.classList.contains('bexit-door')) }; };
      const moves = () => calls.filter((c) => c[0] === 'move').length;
      const settle = async (cond, n = 40) => { for (let i = 0; i < n && !cond(); i++) await tick(10); await tick(10); };
      const check = q('.bexit-check'); if (check) check.click();
      // r2927 follow: until the HUB's answer is drawn (the check is asked over real HTTP — under load its answer lands well after the ask;
      // a wait for the ask alone read «Checking…» in the box zone of run 907c79e71-20261123045209-both)
      await settle(() => { const w = q('.bnew-refusal'); return calls.length > 0 && !!w && !/Checking through/.test(w.textContent); }, 300);   // the one real HTTP wait: a longer bound
      const refused = look(), steps = [];
      if (refused.move) { q('.bexit-door').click(); q('.bexit-door').click(); await settle(() => moves() >= 1); await tick(20); steps.push({ ...look(), moves: moves() }); }   // two presses while the first is out: ONE move
      let unlocked = false;
      if (steps[0] && steps[0].vault) {
        q('.bexit-vault').click(); await tick(10);
        const pw = DOC.getElementById('vault-unlock-pw'), go = q('.vault-unlock-go');
        if (pw && go) { pw.value = ['second', String(process.pid)].join('-'); go.click(); await settle(() => calls.some((c) => c[0] === 'unlock') && !DOC.getElementById('vault-unlock-pw')); unlocked = calls.some((c) => c[0] === 'unlock'); }
        if (unlocked && shown('.bexit-door')) { q('.bexit-door').click(); await settle(() => moves() >= 2); await tick(20); steps.push({ ...look(), moves: moves() }); }
      }
      const said = newToasts(seen).map((x) => x.textContent);
      dropToasts(seen);
      for (const n of DOC.body.children.filter((c) => !before.has(c))) Nd.prototype.remove.call(n);
      FETCH = noFetch;
      rkVault.locked = false;
      return { calls, refused, steps, unlocked, said };
    };
    const XW = await exitDrive(BXW, ids[2], 'Legacy exit today'), XD = await exitDrive(BXD, ids[2], 'Legacy exit today');   // the REDs first (nothing they do may move ids[2]'s word)
    const X = await exitDrive(BX, ids[1], 'Legacy exit');
    ok(X.refused.said && X.refused.words.includes('move it to the vault first') && X.refused.move && !X.refused.vault && !X.refused.greyed && X.calls[0] && X.calls[0][0] === 'check',
      'B-7aef: the hub\'s own exit-check refusal (a password in the proxy address) draws «Move the password to the vault» beside its words, live', X.refused);
    ok(!!X.steps[0] && X.steps[0].moves === 1 && X.steps[0].words.includes('The vault is locked') && X.steps[0].words.includes('move the password again') && X.steps[0].vault === 'Unlock…' && X.steps[0].move && X.steps[0].vaultFirst && !X.steps[0].greyed,
      'B-7aef r2863 MUST 2: a move the locked vault refused says so by name and what to do — Unlock… drawn, Move AFTER it, neither greyed; two presses while the first is out make ONE move', X.steps[0]);
    const xm = X.calls.filter((c) => c[0] === 'move');
    ok(X.unlocked && xm.length === 2 && xm.every((m) => JSON.stringify(m[1]) === JSON.stringify({ profileId: ids[1] })) && xm[0][2] === 'vault_locked' && !!X.steps[1] && !X.steps[1].said && !X.steps[1].move && !X.steps[1].vault && movedWord(ids[1]) && X.said.some((s) => s.includes('The proxy password is in the vault now')),   // stale-pins: kept — the drawn toast's words, read at run time (drawn by browser-proxy-dialog.js / browser-exit-dialog.js)
      'B-7aef r2863 MUST 2: PRESSED Unlock (the vault\'s own dialog, the second password), then Move — the move completes: the word in the vault, the profile holding a reference alone, the refusal and both presses gone', { calls: X.calls.map((c) => [c[0], c[2]]), step: X.steps[1], said: X.said });
    ok(XD.refused.move && !!XD.steps[0] && XD.steps[0].moves === 1 && !XD.steps[0].vault && !XD.unlocked && !XD.calls.some((c) => c[0] === 'unlock') && stillHeld(ids[2]),
      'RED control: today\'s exit dialog — after the locked vault\'s refusal no Unlock is drawn: the person cannot unlock from here and the word stays in the profile', { step: XD.steps[0], calls: XD.calls.map((c) => c[0]) });
    ok(XW.refused.said && !XW.refused.move && !XW.calls.some((c) => c[0] === 'move') && stillHeld(ids[2]), 'RED control: the release\'s exit words (no door as data) leave the hub\'s refusal with no press — «in ⋯» was the way', XW.refused);
    ok(BX && BX.BPM && BX.BPM.proxyDoor('proxy_password_in_profile') === 'move' && BX.BPM.proxyDoor('bad_proxy') === null, 'B-7aef: proxyDoor answers «move» for a password in the address (the proxy dialog and the live view draw it with the profile they hold)');
    for (const s of servers) { try { s.close(); } catch { /* gone */ } }
}
ok(STRAYS.length === 0, `A LEG LEAVES NOTHING IN FLIGHT: no stand-in was asked an address that is not its leg's${STRAYS.length ? ' — ' + STRAYS.slice(0, 6).join(' · ') : ''}`);
globalThis.fetch = realFetch;
report();
