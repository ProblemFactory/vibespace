#!/usr/bin/env node
// B-225b (lane lg-store-writes) — THE PERSISTENCE HOLDS, THE PAGE HALF (cut 6: R4, R7 of 主开发's shape, 2026-11-20 04:37Z).
// A persistence store the hub's START could not read is HELD: its doors refuse BY NAME (503 `store_unread` {held}), the ws layout
// doors answer `layout-held`, nothing is written over the file. THE PAGE: a held answer is a FAILED fetch — never data — and no
// store is written before a read of it LANDED (a page that never read the hub's copy holds its localStorage or the defaults: written
// whole, they would land over the real file at the lift). ONE strip says every hold past its silent rungs; the lift is one word,
// «read again», and each store's own reader fetches.
// The REAL modules, DOM-free (a stub document just wide enough for the client modules' imports, test-desktop-record's): §1 the page
// words · §2 the strip's model (src/lib/store-held.js) · §3 the settings store (src/lib/settings.js) · §4 the boot ladder
// (src/lib/boot-ladder.js) · §5 the hub's list of holds (GET /api/stores/held, the real persistence router) · §6 the desktops — a page
// opened during the hold (the SCRATCH SURFACE) and an open page (its STALE BASE, the lift's re-read) on the real LayoutManager +
// DesktopManager · §7 THE WRITERS' CENSUS: every page door that writes a held store WHOLE names its landed read. Each law has its
// RED control (anchored, in a copy).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { checker } from './lib/check.mjs';
import { anchored, scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const J = (x) => JSON.stringify(x);
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const roots = [];
process.on('exit', () => { for (const d of roots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
const M = mutantCopies('store-held-page', REPO);
const esmCopy = async (rel, src, tag) => import(pathToFileURL(M.write(rel, src, tag, { esm: true })).href);

// ── a stub DOM just wide enough for the client modules' imports, showToast (its history lands in localStorage) and the desktop
// previews (test-desktop-record's) ──
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const mkEl = () => {
  const el = { style: {}, dataset: {}, children: [], className: '', textContent: '', title: '', classList: { add(c) { el.className += ' ' + c; }, remove() {}, toggle() {}, contains: () => false }, append(...c) { el.children.push(...c); }, appendChild(c) { el.children.push(c); return c; }, remove() {}, setAttribute() {}, removeAttribute() {}, addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [], insertBefore(c) { el.children.push(c); return c; }, replaceChildren(...c) { el.children = c; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }), contains: () => false, closest: () => null };
  Object.defineProperty(el, 'innerHTML', { get: () => '', set: () => { el.children.length = 0; } });
  Object.defineProperty(el, 'firstChild', { get: () => el.children[0] });
  return el;
};
let previews = mkEl();
globalThis.document = { createElement: mkEl, getElementById: (id) => (id === 'desktop-previews' ? previews : null), querySelector: () => null, querySelectorAll: () => [], body: mkEl(), documentElement: { style: { getPropertyValue: () => '', getPropertyPriority: () => '', setProperty() {}, removeProperty() {} }, classList: { add() {}, remove() {} } }, addEventListener() {}, removeEventListener() {}, hidden: false };
globalThis.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true });
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0); globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
let reloads = 0;
globalThis.location = { reload: () => { reloads++; }, protocol: 'http:', host: 'hub.test', origin: 'http://hub.test', href: 'http://hub.test/', pathname: '/', search: '' };
const ops = [];
globalThis.__vsOp = (k, d) => ops.push([k, d]);
const toasts = () => { try { return JSON.parse(store.get('vibespace.toastHistory') || '[]').map((h) => h.m); } catch { return []; } };   // NEWEST FIRST (utils _putToastHistory)
const added = (n0) => toasts().slice(0, Math.max(0, toasts().length - n0));   // the toasts said since a count was taken
// THE NETWORK: one router a leg swaps (url, opts) → a Response-like answer
let ROUTE = () => ({ ok: false, status: 599, json: async () => ({}) });
globalThis.fetch = async (url, o = {}) => ROUTE(String(url), o);
const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(J(body)) });
const HELD = (file, rung = 'said', kind = 'unreadable', code = 'EIO') => ({ file, kind, code, since: 1, rung });
const heldBody = (h) => ({ error: `${h.file} could not be read (${h.kind}) — nothing was changed`, code: 'store_unread', held: h });

const U = await import('../src/lib/utils.js');
const SH = await import('../src/lib/store-held.js');

// ── §1 THE PAGE WORDS ──
console.log('§1 a held answer is said in the page\'s words by its KIND — never data; a user-state answer that did not land is no map');
{
  const said = async (body) => { ROUTE = () => answer(503, body); return U.fetchJson('/x'); };
  const un = await said(heldBody(HELD('layouts.json'))), dm = await said(heldBody(HELD('settings.json', 'said', 'damaged', 'SyntaxError'))), na = await said(heldBody(HELD('bookmarks.json', 'said', 'not-allowed', 'EACCES')));
  ok(un.code === 'store_unread' && /cannot read your desktops right now — nothing was changed/.test(un.error) && /could not be read/.test(un.said)
    && /could not read your settings: the file is not what it should be/.test(dm.error) && /start it empty/.test(dm.error)
    && /not allowed to read your bookmarks/.test(na.error) && /permissions of the data folder/.test(na.error),
    'a held store\'s refusal is ONE sentence by its file and kind (unreadable: «reads it again by itself»; damaged: its door; not-allowed: the permissions) — the hub\'s English kept as `said`', J({ un: un.error, dm: dm.error, na: na.error }));
  const ap = await said({ error: 'x appeared', code: 'store_appeared' });
  ok(/appeared since VibeSpace started/.test(ap.error) && /x appeared/.test(ap.said), 'a file that appeared since the start (409 store_appeared) is said in the page\'s words too', J({ ap }));
  ok(U.heldWordsOf(un) === un.error && U.heldWordsOf({ code: 'other' }) === null, 'heldWordsOf names a held store as fetchJson words it (and nothing else)');
  ok(U.stateLanded({ starredSessions: [] }) === true && U.stateLanded({ error: { theme: 'an object under the key «error»' } }) === true && U.stateLanded(un) === false && U.stateLanded(null) === false && U.stateLanded([]) === false,
    'stateLanded: the server\'s state LANDED — a held list\'s refusal (its `error` words) and a failed fetch (null) are no map');
}

// ── §2 THE STRIP'S MODEL ──
console.log('§2 ONE strip: a hold is said past its SILENT rungs only; the lift is one word and every reader fetches; the hub\'s list replaces what the page knows');
const silentLaw = (S) => {
  const silentSaid = S.noteStoreHeld(HELD('settings.json', 'silent'));
  const afterSilent = S.storeHeld('settings.json');
  const forced = S.noteStoreHeld(HELD('layouts.json', 'silent'), { force: true });
  const r = { silentSaid, afterSilent: !!afterSilent, forced, forcedRung: S.storeHeld('layouts.json')?.rung || null };
  S.noteStoreLifted('settings.json'); S.noteStoreLifted('layouts.json');
  return r;
};
{
  const r = silentLaw(SH);
  ok(r.silentSaid === false && r.afterSilent === false && r.forced === true && r.forcedRung === 'said', 'a hold in its SILENT rungs is not said (a restart on slow storage never flashes a strip on every device); a page that cannot work without saying it (the scratch surface) says it', J(r));
  const said = SH.noteStoreHeld(HELD('bookmarks.json'));
  let fired = 0, firedNever = 0;
  const off = SH.onStoreLift('bookmarks.json'), off1 = SH.onStoreLift('bookmarks.json', () => fired++), off2 = SH.onStoreLift('custom-themes.json', () => firedNever++);
  SH.noteStoreLifted('bookmarks.json'); SH.noteStoreLifted('custom-themes.json');
  ok(said === true && !SH.storeHeld('bookmarks.json') && fired === 1 && firedNever === 1 && typeof off === 'function', 'the lift lets the hold go and its readers fetch — a store this page never said (its silent rungs) included', J({ fired, firedNever }));
  off1(); off2();
  // the hub's list (the boot, every reconnect): it REPLACES what the page knows; a store held before and gone now was read again while away
  SH.noteStoreHeld(HELD('user-state.json'));
  let lifted = 0; const offL = SH.onStoreLift('user-state.json', () => lifted++);
  ROUTE = (u) => (u === '/api/stores/held' ? answer(200, { held: [{ section: 'settings', ...HELD('settings.json') }, { section: 'bookmarks', ...HELD('bookmarks.json', 'silent') }] }) : answer(404, {}));
  const took = await SH.refreshStoreHolds();
  ok(took === true && !!SH.storeHeld('settings.json') && !SH.storeHeld('bookmarks.json') && !SH.storeHeld('user-state.json') && lifted === 1,
    'the hub\'s list REPLACES what the page knows: a hold past its rungs is said, one still silent is not, and a hold the hub no longer has was read again while the page was away — its readers fetch', J({ took, lifted, s: !!SH.storeHeld('settings.json'), b: !!SH.storeHeld('bookmarks.json') }));
  offL();
  // a word that arrives while the list is asked: the answer is older than what the page knows — it is not taken
  let release; ROUTE = () => new Promise((res) => { release = () => res(answer(200, { held: [] })); });
  const asked = SH.refreshStoreHolds(); await settle(2);
  SH.noteStoreHeld(HELD('custom-themes.json')); release();
  const tookLate = await asked;
  ok(tookLate === false && !!SH.storeHeld('custom-themes.json') && !!SH.storeHeld('settings.json'), 'an answer asked BEFORE a word arrived is older than the word: not taken (the strip keeps what it was told)', J({ tookLate }));
  SH.noteStoreLifted('custom-themes.json'); SH.noteStoreLifted('settings.json');
  // the model: one sentence, the rows behind Details, a damaged store's door
  const m1 = SH.stripModel([HELD('layouts.json', 'said', 'damaged', 'SyntaxError')]), m2 = SH.stripModel([HELD('settings.json', 'said', 'damaged'), HELD('bookmarks.json')]);
  const m3 = SH.stripModel([], { scratch: 'held' }), m4 = SH.stripModel([], { scratch: 'lifted' }), m0 = SH.stripModel([]);
  ok(/could not read your desktops/.test(m1.text) && J(m1.rows[0].doors) === J(['empty', 'import', 'rollback']) && m1.rows[0].code === 'SyntaxError'
    && /cannot read 2 of its saved files/.test(m2.text) && J(m2.rows.map((r) => r.doors)) === J([['empty', 'import'], []])
    && /scratch surface: windows opened here are not saved/.test(m3.scratchText) && /can be read again/.test(m4.scratchText) && m0 === null,
    'the strip\'s model: one hold = its own sentence, several = how many (Details names each: file, kind, code); a DAMAGED store has its door (start empty, import a backup — the desktops: a rollback point too); the scratch surface says nothing it shows is saved, and at the lift that the desktops can be loaded; nothing held = no strip',
    J({ m1: m1.text, m2: m2.text, d: m2.rows.map((r) => r.doors) }));
  const CTL = await esmCopy('src/lib/store-held.js', anchored(read('src/lib/store-held.js'), "  if (!force && !saidRung(held) && !HELD.has(held.file)) return false;   // R7: the silent rungs are never said\n", '', 'silent gate'), 'silent-said');
  const rc = silentLaw(CTL);
  ok(rc.silentSaid === true && rc.afterSilent === true, 'CONTROL (the silent gate cut, in a copy): a hold in its silent rungs is SAID — every restart on slow storage puts the strip on every device (red)', J(rc));
}

// ── §3 THE SETTINGS STORE ──
console.log('§3 the settings store writes NOTHING before a read of the hub\'s settings landed — its localStorage copy is never POSTed whole');
const P = 'browser.idlePaintFreeze';
async function settingsScene(SM, steps) {
  const vt = { now: 0, q: [], id: 0 };
  const keep = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, localStorage: globalThis.localStorage, route: ROUTE };
  const advance = async (ms) => {
    const end = vt.now + ms;
    for (;;) { vt.q.sort((x, y) => x.at - y.at || x.id - y.id); const nx = vt.q[0]; if (!nx || nx.at > end) break; vt.q.shift(); vt.now = nx.at; nx.fn(); await settle(); }
    vt.now = end; await settle();
  };
  const W = { hub: 'held-said', posts: [], gets: 0, server: { 'x.server': 'the server\'s own value' }, heldSaid: [] };
  globalThis.setTimeout = (fn, ms) => { const id = ++vt.id; vt.q.push({ id, at: vt.now + (Number(ms) || 0), fn }); return id; };
  globalThis.clearTimeout = (id) => { vt.q = vt.q.filter((x) => x.id !== id); };
  globalThis.localStorage = { getItem: (k) => (k === 'webui-settings' ? J({ 'x.pageOnly': 'this page\'s old copy' }) : null), setItem() {} };
  ROUTE = (u, o) => {
    if (u !== '/api/settings') return answer(404, {});
    if (o.method === 'POST') { if (W.hub !== 'ok') return answer(503, heldBody(HELD('settings.json', W.hub === 'held-silent' ? 'silent' : 'said'))); const b = JSON.parse(o.body); W.posts.push(b); W.server = b; return answer(200, { success: true }); }
    W.gets++;
    if (W.hub === 'held-said') return answer(503, heldBody(HELD('settings.json', 'said')));
    if (W.hub === 'held-silent') return answer(503, heldBody(HELD('settings.json', 'silent')));
    return answer(200, W.server);
  };
  try {
    const sm = new SM(); sm.onHeld = (h, o) => W.heldSaid.push(o && o.refused ? 'refused:' + o.refused.join(',') : h.rung);
    return await steps({ sm, W, advance });
  } finally { globalThis.setTimeout = keep.setTimeout; globalThis.clearTimeout = keep.clearTimeout; globalThis.localStorage = keep.localStorage; ROUTE = keep.route; }
}
const liftScene = (SM) => settingsScene(SM, async ({ sm, W, advance }) => {
  await sm.load();
  const boot = { landed: sm.landed, held: sm.held && sm.held.file, shows: sm.get('x.pageOnly') };
  W.hub = 'ok';   // the hold lifted — no broadcast reached this page (it was away); the person changes a row
  sm.set(P, false); await advance(600);
  return { boot, posts: W.posts, landed: sm.landed, state: sm.saveStateOf(P), gets: W.gets };
});
{
  const { SettingsManager } = await import('../src/lib/settings.js');
  const said = await settingsScene(SettingsManager, async ({ sm, W, advance }) => {
    await sm.load();
    sm.set(P, false); await advance(600);
    return { landed: sm.landed, held: sm.held && sm.held.rung, posts: W.posts.length, state: sm.saveStateOf(P), byHold: sm.failHeldOf(P), heldSaid: W.heldSaid, reset: sm.resetAll(), postsAfterReset: (await advance(600), W.posts.length) };
  });
  const V = await import('../src/lib/settings-view.js');
  ok(said.landed === false && said.held === 'said' && said.posts === 0 && said.state === 'failed' && said.byHold === true && said.heldSaid.includes('said') && said.heldSaid.includes('refused:' + P) && said.reset === false && said.postsAfterReset === 0
    && /^Not now — VibeSpace cannot read your settings right now/.test(V.saveMarkWords('failed', (x) => x, { held: true })) && /^Not saved — the server did not answer/.test(V.saveMarkWords('failed', (x) => x)),
    'a page whose settings read was refused (held, said) writes NOTHING: a change is asked against the hub first and refused BY THE HOLD — its row says «Not now» (never «the server did not answer»), the page says it once, the control stays as the person left it; «Reset all» refuses; the hold reaches the strip', J(said));
  const silent = await settingsScene(SettingsManager, async ({ sm, W, advance }) => {
    W.hub = 'held-silent';
    await sm.load();
    sm.set(P, false); await advance(600);
    const mid = { posts: W.posts.length, state: sm.saveStateOf(P), gets: W.gets };
    await advance(3000);
    const mid2 = { posts: W.posts.length, state: sm.saveStateOf(P), gets: W.gets };
    W.hub = 'ok'; await advance(3000);
    return { mid, mid2, posts: W.posts, state: sm.saveStateOf(P), landed: sm.landed, refusedSaid: W.heldSaid.filter((x) => x.startsWith('refused')) };
  });
  const body = silent.posts[0] || {};
  ok(silent.mid.posts === 0 && silent.mid.state === 'pending' && silent.mid2.posts === 0 && silent.mid2.state === 'pending' && silent.mid2.gets > silent.mid.gets
    && silent.posts.length === 1 && body[P] === false && body['x.server'] === 'the server\'s own value' && !('x.pageOnly' in body) && silent.state === 'saved' && silent.landed === true && silent.refusedSaid.length === 0,
    'in the hold\'s SILENT rungs a change WAITS (asked again in silence, the row «Saving…», never «Not saved»); once the hub answers, the change rides on the HUB\'S settings — the page\'s old copy is never written', J(silent));
  const lifted = await liftScene(SettingsManager);
  const lb = lifted.posts[0] || {};
  ok(lifted.boot.landed === false && lifted.boot.held === 'settings.json' && lifted.boot.shows === 'this page\'s old copy' && lifted.posts.length === 1 && lb[P] === false && lb['x.server'] === 'the server\'s own value' && !('x.pageOnly' in lb) && lifted.landed === true && lifted.state === 'saved',
    'a page that booted during the hold SHOWS its own copy, but its first save asks the hub first: the change lands on the hub\'s settings (the old copy\'s rows stay unwritten)', J(lifted));
  const bc = await settingsScene(SettingsManager, async ({ sm, W, advance }) => {
    await sm.load();
    sm.applyRemote({ ...W.server, 'x.fromLift': 1 }); W.hub = 'ok';   // the lift's settings-updated: the hub's WHOLE state
    const gets = W.gets;
    sm.set(P, false); await advance(600);
    return { landed: sm.landed, extraGets: W.gets - gets, body: W.posts[0] || null };
  });
  ok(bc.landed === true && bc.extraGets === 0 && !!bc.body && bc.body['x.fromLift'] === 1 && !('x.pageOnly' in bc.body), 'the lift\'s broadcast (the hub\'s whole settings) IS a landing: the next change goes at once, on the hub\'s copy', J(bc));
  const CTL = await esmCopy('src/lib/settings.js', anchored(read('src/lib/settings.js'), 'if (!this._landed) {\n      const r = await this._ask();', 'if (false) {\n      const r = await this._ask();', 'the save\'s landing ask'), 'no-landing-ask');
  const red = await liftScene(CTL.SettingsManager);
  const rb = red.posts[0] || {};
  ok(red.posts.length === 1 && rb['x.pageOnly'] === 'this page\'s old copy' && !('x.server' in rb), 'CONTROL (the save\'s landing ask cut, in a copy — the release): the page POSTs its OWN copy whole — the hub\'s settings written over by a localStorage list (red)', J(rb));
}

// ── §4 THE BOOT LADDER ──
console.log('§4 a boot read of a HELD store climbs in SILENCE through the silent rungs and answers HELD — never the stuck splash «HTTP 503»');
const ladderScene = async (L, answers) => {
  let i = 0; const retries = [], sleeps = [];
  const r = await L.ladderJson('/api/layouts', { fetchImpl: async () => answers[Math.min(i++, answers.length - 1)](), sleep: async (ms) => { sleeps.push(ms); }, onRetry: (x) => retries.push(x.fail.why), stallMs: 1000 });
  return { r, retries, sleeps: sleeps.length, tries: i };
};
{
  const BL = await import('../src/lib/boot-ladder.js');
  const H503 = (rung) => () => answer(503, heldBody(HELD('layouts.json', rung, 'damaged', 'SyntaxError')));
  const B1 = await ladderScene(BL, [H503('silent'), H503('silent'), H503('said')]);
  const B2 = await ladderScene(BL, [H503('silent')]);
  const B3 = await ladderScene(BL, [() => answer(503, { error: 'busy' })]);
  const B4 = await ladderScene(BL, [() => answer(200, { desktopMeta: [] })]);
  ok(!!B1.r.held && B1.r.held.rung === 'said' && B1.retries.length === 0 && B1.sleeps === 2 && !!B2.r.held && B2.tries === 5 && B2.retries.length === 0,
    'a HELD answer: silent rungs climbed with no line (R7), then HELD by name the moment it is said — or at the ladder\'s top while still silent', J({ B1: { r: B1.r, retries: B1.retries }, B2: { tries: B2.tries } }));
  ok(!!B3.r.gaveUp && B3.retries.length === 4 && !!B4.r.json && J(B4.r.json) === J({ desktopMeta: [] }), 'any other 503 still climbs the ladder with its line and gives up into Reload; a 200 is the data', J({ B3: B3.r, B4: B4.r }));
  const CTL = await esmCopy('src/lib/boot-ladder.js', anchored(read('src/lib/boot-ladder.js'), "        if (b && b.code === 'store_unread' && b.held && typeof b.held === 'object') return { ok: false, why: 'held', status: 503, held: b.held };\n", '', 'the held read'), 'no-held');
  const R1 = await ladderScene(CTL, [H503('silent'), H503('silent'), H503('said')]);
  ok(!!R1.r.gaveUp && !R1.r.held && R1.retries.length === 4, 'CONTROL (the held read cut, in a copy — the release): the ladder reads a held store as a server that did not answer — «HTTP 503» four times, then the stuck splash (red)', J(R1));
}

// ── §5 THE HUB'S LIST ──
console.log('§5 GET /api/stores/held names every store held NOW — each store asked its read first (a page\'s first ask may be the start\'s first read)');
{
  const PREL = 'src/routes/persistence.js', PSRC = read(PREL);
  const setupP = (P) => {
    const d = scratchDir('store-held-page'); roots.push(d);
    fs.writeFileSync(path.join(d, 'layouts.json'), '{ "desktopMeta": [ {"id": "d1"');   // a torn file: bytes read whole that are not the store
    fs.writeFileSync(path.join(d, 'settings.json'), J({ 'appearance.theme': 'the person\'s' }));
    P.setup({ dataDir: d, wss: { clients: new Set() }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
    const handler = (method, p) => { const l = P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
    const call = async (method, p, { params = {}, headers = {} } = {}) => { let status = 200, o = null; const res = { status(c) { status = c; return res; }, json(x) { o = x; return res; }, set() { return res; }, setHeader() { } }; await handler(method, p)({ body: {}, query: {}, params, headers }, res, () => { status = 500; }); return { status, body: o }; };
    return { call };
  };
  for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k];
  const G = setupP(require(path.join(REPO, PREL)));
  const h1 = await G.call('get', '/api/stores/held');
  const one = (h1.body && h1.body.held) || [];
  const emptied = await G.call('post', '/api/stores/:file/empty', { params: { file: 'layouts.json' } });
  const h2 = await G.call('get', '/api/stores/held');
  ok(h1.status === 200 && one.length === 1 && one[0].section === 'layouts' && one[0].file === 'layouts.json' && one[0].kind === 'damaged' && typeof one[0].rung === 'string'
    && !!emptied.body && emptied.body.success === true && J(h2.body) === J({ held: [] }),
    'a torn layouts.json at a FRESH start (nothing read yet): the list names it — damaged, with its rung — and the readable settings not; once the person starts it empty the list is empty', J({ h1: h1.body, h2: h2.body }));
  const CTL = M.load(PREL, anchored(PSRC, '    res.json({ held: heldSections(Object.keys(STORE_SECTIONS)) });', '    res.json({ held: Object.keys(STORE_SECTIONS).map((n) => STORE_SECTIONS[n].hold.held()).filter(Boolean) });', 'the read first'), 'no-read-first');
  const R = setupP(CTL);
  const r1 = await R.call('get', '/api/stores/held');
  ok(J(r1.body) === J({ held: [] }), 'CONTROL (the route asks no store its read first, in a copy): at a fresh start it answers «nothing held» over a torn file — a page opened first says nothing and shows an empty desktop (red)', J(r1.body));
}

// ── §6 THE DESKTOPS ──
console.log('§6 the desktops HELD: a page opened during the hold is a SCRATCH SURFACE (no desktop of the hub\'s, nothing saved); an open page goes on its STALE BASE; the lift re-reads');
const { DesktopManager: RealDM } = await import('../src/lib/desktop-manager.js');
const { LayoutManager: RealLM } = await import('../src/lib/layout.js');
function world(DM, LM) {
  const sent = [], handlers = [], stateHandlers = [], wins = new Map();
  const app = {
    ws: { connected: true, onGlobal: (fn) => handlers.push(fn), offGlobal() {}, onStateChange: (fn) => stateHandlers.push(fn), send: (m) => sent.push(JSON.parse(J(m))) },
    settings: null, sessions: new Map(), stage: null, isMobile: false,
    wm: { windows: wins, grid: null, zIndex: 100, setGrid() {}, _reflowWindows() {}, _applyGridBounds() {}, _captureGridBounds() {}, focusWindow() {}, setWindowHidden() {}, closeWindow: (id) => wins.delete(id), _detachFromChain() {}, _ungroupLast() {}, setSplitRatio() {}, applyChainRecord: () => false, witnessChain() {} },
    themeManager: { current: 'dark' }, _fontSize: 14, _fontFamily: 'mono', sidebar: { isOpen: true, _allSessions: [] },
    updateTaskbar() {}, _checkWelcome() {}, replayOpenSpec() {},
  };
  previews = mkEl();
  const lm = new LM(app); app.layoutManager = lm;
  const dm = new DM(app); app.desktopManager = dm;
  const frame = (m) => { for (const h of handlers) h(m); };
  const done = () => { try { lm._offLayoutsLift?.(); } catch { } clearTimeout(lm._autoSaveTimer); };
  return { app, lm, dm, sent, wins, frame, done };
}
const scratchBoot = async (DM, LM) => {
  const W = world(DM, LM);
  W.lm._bootJson = async (u) => { if (u === '/api/layouts') throw Object.assign(new Error('held'), { code: 'store_unread', held: HELD('layouts.json', 'said', 'damaged', 'SyntaxError') }); return {}; };
  await W.lm.loadAutoSave();
  return W;
};
{
  // (a) THE SCRATCH SURFACE
  const t0 = toasts().length;
  const W = await scratchBoot(RealDM, RealLM);
  W.lm._restoring = false; W.lm._booting = false; W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
  const boot = { scratch: !!W.lm._scratch, desks: W.dm._desktops.map((d) => d.id), active: W.dm.activeDesktopId, said: !!SH.storeHeld('layouts.json'), strip: SH.scratchState(), creates: W.sent.filter((m) => m.type === 'desktop-create').length };
  await W.lm._doAutoSave(); W.lm.scheduleAutoSave();
  const created = W.dm.createDesktop('More');
  const leave = W.lm._flushOnLeave('pagehide');
  let applied = 0; W.lm._handleRemoteSync = () => { applied++; }; W.lm._deferRemote = () => { applied++; };
  W.frame({ type: 'layout-sync', desktopId: 'desk-other', state: { windows: [] }, seq: 7 });
  const sends = W.sent.map((m) => m.type);
  ok(boot.scratch === true && J(boot.desks) === J(['__scratch__']) && boot.active === '__scratch__' && boot.said && boot.strip === 'held' && boot.creates === 0,
    'a page opened while the desktops are HELD is a SCRATCH SURFACE: ONE local desktop, the strip says so at once (its silent rungs or not) — never «Desktop 1» made of nothing and sent to the hub', J(boot));
  ok(sends.length === 0 && W.lm._autoSaveTimer == null && created === null && leave === false && applied === 0 && toasts().length === t0 + 1,
    'the scratch surface writes NOTHING: no autosave armed or sent, no desktop made (refused by name), nothing taken at the leave, no record of the hub\'s applied', J({ sends, created, leave, applied, toasts: added(t0) }));
  const r0 = reloads;
  SH.noteStoreLifted('layouts.json');
  const reloadedEmpty = reloads - r0;
  W.wins.set('w-open', { id: 'w-open' });
  SH.noteStoreLifted('layouts.json');
  ok(reloadedEmpty === 1 && reloads - r0 === 1 && SH.scratchState() === 'lifted', 'its LIFT is its own boot load: at once when nothing is open here; with a window open the strip offers «Load my desktops» (nothing closed under the person)', J({ reloadedEmpty, strip: SH.scratchState() }));
  W.done(); SH.setScratch(null);
  const CTLc = await esmCopy('src/lib/layout.js', anchored(read('src/lib/layout.js'), "    } catch (e) { if (e && e.code === 'store_unread') this._enterScratch(e.held); } // B-225b: the desktops HELD — a scratch surface, never «Desktop 1» made of nothing", '    } catch {}', 'the scratch catch'), 'no-scratch');
  const Wc = await scratchBoot(RealDM, CTLc.LayoutManager);
  ok(!Wc.lm._scratch && Wc.dm._desktops.length === 0 && !SH.storeHeld('layouts.json'), 'CONTROL (the boot\'s held catch cut, in a copy): the page opened during the hold is no scratch surface — an empty page, no desktop, and the strip never says why (red)', J({ desks: Wc.dm._desktops.length }));
  Wc.done();
  const CTLg = await esmCopy('src/lib/layout.js', anchored(read('src/lib/layout.js'), '    if (this._scratch) return; // B-225b: a scratch surface saves nothing\n', '', 'the save gate'), 'no-save-gate');
  const Wg = await scratchBoot(RealDM, CTLg.LayoutManager);
  Wg.lm._restoring = false; Wg.lm._booting = false; Wg.lm._userDirty = true; Wg.lm._lastUserInputAt = Date.now();
  await Wg.lm._doAutoSave();
  ok(Wg.sent.some((m) => m.type === 'layout-sync' && m.desktopId === '__scratch__'), 'CONTROL (the scratch surface\'s save gate cut, in a copy): its local desktop is SENT to the hub as a layout record (red)', J(Wg.sent.map((m) => [m.type, m.desktopId])));
  Wg.done(); SH.noteStoreLifted('layouts.json'); SH.setScratch(null);
}
const openPage = (DM, LM) => {
  const W = world(DM, LM);
  W.dm._desktops = [{ id: 'd1', name: 'One' }]; W.dm._activeId = 'd1';
  const rec = { windows: [], grid: null }; W.dm._setRecord('d1', rec); W.dm.noteWire('d1', rec);
  W.lm._restoring = false; W.lm._booting = false; W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
  return W;
};
const heldFrame = (W, sentAt) => W.frame({ type: 'layout-held', op: 'layout-sync', desktopId: 'd1', held: HELD('layouts.json'), sentAt });
{
  // (b) AN OPEN PAGE: the hub (restarted) refuses its save by name
  const W = openPage(RealDM, RealLM);
  ROUTE = (u) => (u === '/api/layouts' ? answer(503, heldBody(HELD('layouts.json'))) : answer(404, {}));
  await W.lm._doAutoSave();
  const first = W.sent.find((m) => m.type === 'layout-sync' && m.desktopId === 'd1');
  heldFrame(W, first && first.sentAt);
  const after = { acks: W.lm._serverAcks, owed: W.lm._unacked.length, carried: W.lm._carriedAt('d1'), stale: W.lm._resyncStale, said: !!SH.storeHeld('layouts.json') };
  W.lm._sweepUnacked();
  const t0 = toasts().length;
  W.sent.length = 0; W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
  await W.lm._doAutoSave(); await settle();
  const whileHeld = { sends: W.sent.filter((m) => m.type === 'layout-sync').length, stale: W.lm._resyncStale, resyncing: W.lm._resyncing, toasts: added(t0) };
  ok(!!first && after.acks === true && after.owed === 0 && !(after.carried >= first.sentAt) && after.stale === true && after.said,
    'an open page\'s save refused `layout-held`: its acts stay HELD (nothing carried — the no-ack fallback never settles it as read), the page is on its STALE BASE, the strip names the hold', J(after));
  ok(whileHeld.sends === 0 && whileHeld.stale === true && whileHeld.resyncing === false && whileHeld.toasts.length === 0,
    'while held nothing goes from the stale base: the save re-asks the read, the read is refused by name, the page stays stale IN SILENCE (no stale toast — the ONE strip is the face)', J(whileHeld));
  // the desktops themselves: a person's change is refused by name while the strip names the hold
  const t1 = toasts().length;
  W.dm.renameDesktop('d1', 'Renamed');
  ok(W.dm._desktops[0].name === 'One' && !W.sent.some((m) => m.type === 'desktop-rename') && toasts().length === t1 + 1 && /cannot read your desktops/.test(toasts()[0] || ''),
    'a person\'s change of the desktops while they are held (rename) is refused BY NAME on the page — nothing changed, nothing sent', J(added(t1)));
  // THE LIFT: one word — the page re-reads through its own guards; the held act goes again on the fresh base
  ROUTE = (u) => (u === '/api/layouts' ? answer(200, { desktopMeta: [{ id: 'd1', name: 'One' }], desktops: {}, saved: {}, current: null }) : answer(404, {}));
  SH.noteStoreLifted('layouts.json'); await settle();
  clearTimeout(W.lm._autoSaveTimer);
  W.sent.length = 0; W.lm._userDirty = true; W.lm._lastUserInputAt = Date.now();
  await W.lm._doAutoSave();
  ok(W.lm._resyncStale === false && W.sent.some((m) => m.type === 'layout-sync' && m.desktopId === 'd1'), 'THE LIFT re-reads (store-lifted): the stale base is released and the held act goes again — the very record the hub did not read is no «already sent» no-op', J({ stale: W.lm._resyncStale, sent: W.sent.map((m) => m.type) }));
  W.dm.renameDesktop('d1', 'Renamed');
  ok(W.sent.some((m) => m.type === 'desktop-rename'), 'after the lift the desktops are the person\'s again (the rename is sent)');
  W.done();
  // CONTROLS
  const CTLf = await esmCopy('src/lib/layout.js', anchored(read('src/lib/layout.js'), "      if (msg.type === 'layout-held') { this._onLayoutHeld(msg); return; } // …or refused BY NAME: the desktops are held (B-225b)\n", '', 'the held frame'), 'no-held-frame');
  const Wf = openPage(RealDM, CTLf.LayoutManager);
  ROUTE = (u) => (u === '/api/layouts' ? answer(503, heldBody(HELD('layouts.json'))) : answer(404, {}));
  await Wf.lm._doAutoSave();
  const sf = Wf.sent.find((m) => m.type === 'layout-sync');
  heldFrame(Wf, sf && sf.sentAt);
  for (const s of Wf.lm._unacked) if (s.at != null) s.at -= 5000;   // the no-ack fallback's wait, passed
  Wf.lm._sweepUnacked();
  ok(!!sf && Wf.lm._carriedAt('d1') >= sf.sentAt && Wf.lm._resyncStale !== true, 'CONTROL (the `layout-held` answer unheard, in a copy — the release): the save the hub refused is settled as READ by the no-ack fallback — the act released, its change lost at the next re-read (red)', J({ carried: Wf.lm._carriedAt('d1'), sentAt: sf && sf.sentAt }));
  Wf.done(); SH.noteStoreLifted('layouts.json');
  const CTLr = await esmCopy('src/lib/layout.js', anchored(read('src/lib/layout.js'), '        if (h) {\n          this._resyncing = false; this._resyncStale = true;', '        if (false) {\n          this._resyncing = false; this._resyncStale = true;', 'the held re-read'), 'no-held-reread');
  const Wr = openPage(RealDM, CTLr.LayoutManager);
  ROUTE = (u) => (u === '/api/layouts' ? answer(503, heldBody(HELD('layouts.json'))) : answer(404, {}));
  await Wr.lm._resyncFromServer();
  const rr = { stale: Wr.lm._resyncStale, resyncing: Wr.lm._resyncing };
  Wr.lm._resyncFromServer = async () => { };   // (its retries end here: the leg has read what it needs)
  ok(rr.stale !== true && rr.resyncing === true, 'CONTROL (the held re-read cut, in a copy): a held answer is a blind retry — the page is not on its stale base meanwhile, and after three tries it toasts the stale word over the strip (red)', J(rr));
  Wr.done();
  const CTLd = await esmCopy('src/lib/desktop-manager.js', anchored(read('src/lib/desktop-manager.js'), '    if (this._heldRefuse()) return;\n    const desk = this._desktops.find(d => d.id === desktopId);', '    const desk = this._desktops.find(d => d.id === desktopId);', 'the rename refusal'), 'no-rename-refusal');
  const Wd = openPage(CTLd.DesktopManager, RealLM);
  SH.noteStoreHeld(HELD('layouts.json'));
  Wd.dm.renameDesktop('d1', 'Renamed');
  ok(Wd.sent.some((m) => m.type === 'desktop-rename') && Wd.dm._desktops[0].name === 'Renamed', 'CONTROL (the rename\'s held refusal cut, in a copy): the page renames a desktop the hub holds unread — shown as done, refused by the hub (red)');
  Wd.done(); SH.noteStoreLifted('layouts.json');
}

// ── §7 THE WRITERS' CENSUS ──
console.log('§7 every page door that writes a held store WHOLE names its landed read (a new one is red until it does)');
const WRITE_DOOR = /\b(?:fetch|fetchJson|fj)\(\s*'\/api\/(user-state|bookmarks|settings|custom-themes)'\s*,\s*\{\s*method:\s*'(PATCH|POST)'/g;
// file → the store it writes whole, and the text of the read it writes over (a PATCH of user-state replaces the KEY: whole per key)
const WRITERS = {
  'src/lib/window-share.js': ['user-state', ['if (REACH_MAP !== null) { write(); return; }', 'if (!stateLanded(st)) {']],
  'src/lib/jobs-panel.js': ['user-state', ['if (!FOLDS_READ) return;', "if (!stateLanded(st)) return FOLDS || {};"]],
  'src/lib/channels-panel.js': ['user-state', ['if (!SEEN_READ) return;', 'if (!FOLDS_READ) return;', 'if (!stateLanded(st)) {']],
  'src/lib/desktop-app-launcher.js': ['user-state', ['if (recentsRead) patchUserState(', 'if (stateLanded(state)) { recentsRead = true;']],
  'src/lib/desktop-app-prefs.js': ['user-state', ['if (okState(st)) {']],
  'src/lib/owner-facts.js': ['user-state', ['After the page loaded user-state (the sidebar\'s one fetch)']],
  'src/lib/file-explorer.js': ['bookmarks', ['if (!this._bkLanded) {', 'if (Array.isArray(list)) { this._bookmarks = list; this._bkLanded = true;']],
  'src/lib/settings.js': ['settings', ['if (!this._landed) {\n      const r = await this._ask();']],
  'src/lib/browser-exit-dialog.js': ['settings', ["method: 'PATCH'"]],   // a PATCH of ONE row (the hub merges it into the file it read) — never the page's copy
  'src/lib/theme-editor.js': ['custom-themes', ["body: JSON.stringify({ name, css, terminal: this._termValues })"]],   // ONE theme by name (the hub merges it)
};
const writerCensus = (files) => {
  const found = new Map();
  for (const [f, src] of files) for (const m of src.matchAll(WRITE_DOOR)) found.set(f, m[1]);
  const unlisted = [...found.keys()].filter((f) => !WRITERS[f]);
  const unguarded = Object.entries(WRITERS).filter(([f, [, guards]]) => files.has(f) && guards.some((g) => !files.get(f).includes(g))).map(([f]) => f);
  return { found: [...found.keys()].sort(), unlisted, unguarded };
};
{
  const LIB = fs.readdirSync(path.join(REPO, 'src/lib')).filter((n) => n.endsWith('.js')).map((n) => 'src/lib/' + n);
  const files = new Map(LIB.map((f) => [f, read(f)]));
  // the owner-facts door is called only after the sidebar's LANDED apply (the state it reads is the hub's)
  const ss = read('src/lib/sidebar-state.js'), apply = ss.indexOf('this._applyServerState(state);'), report1 = ss.indexOf('reportOwnerPage(state, { phone: !!this.app.isMobile });');
  const c = writerCensus(files);
  ok(c.unlisted.length === 0 && c.unguarded.length === 0 && c.found.length >= 6 && apply > 0 && report1 > apply,
    `every page door that writes a store WHOLE writes over a read that LANDED (${c.found.length} doors: ${c.found.map((f) => path.basename(f)).join(', ')})`, J(c));
  const plant = new Map([...files, ['src/lib/a-new-panel.js', "fetch('/api/user-state', { method: 'PATCH', body: JSON.stringify({ newPanelFolds: FOLDS }) });"]]);
  const pc = writerCensus(plant);
  const strip = new Map(files); strip.set('src/lib/jobs-panel.js', files.get('src/lib/jobs-panel.js').replace('if (!FOLDS_READ) return;', ''));
  const sc = writerCensus(strip);
  ok(J(pc.unlisted) === J(['src/lib/a-new-panel.js']) && J(sc.unguarded) === J(['src/lib/jobs-panel.js']), 'CONTROLS (planted): a new whole-key writer is unlisted, and a listed one whose read mark is cut is unguarded — both red by name', J({ pc: pc.unlisted, sc: sc.unguarded }));
  // the boot readers: the themes boot takes no held body as a list (R13: no 'dark' written for a held file); the editors draw no rows
  const app = read('src/lib/app.js'), te = read('src/lib/theme-editor.js'), su = read('src/lib/settings-ui.js'), fe = read('src/lib/file-explorer.js');
  ok(app.includes("if (typeof themes.error === 'string') { noteStoreHeld(themes.held); return; }") && app.indexOf("if (typeof themes.error === 'string')") < app.indexOf('this.themeManager.applyPendingTheme();')
    && te.includes('if (this._held) { showToast(storeHeldWords(this._held)') && su.includes('if (this.settings.landed === false && this.settings.held) {')
    && fe.includes("dropZone.textContent = this._bkHeld && !this._bkLanded ? storeHeldWords(this._bkHeld) : this._bookmarks.length === 0 ? t('Drop folders here') : '';")
    && app.includes("if (msg.type === 'store-held') noteStoreHeld(msg);") && app.includes("else if (msg.type === 'store-lifted') noteStoreLifted(msg.file);") && (app.match(/refreshStoreHolds\(\)/g) || []).length === 2,
    'the page\'s wiring: a held themes file is no list (the pending theme waits — R13), the theme editor and the Settings window show no rows for a held file (its words), a held bookmarks list says its hold (never «Drop folders here»), the frames feed the ONE strip, the hub\'s list is asked at the boot and at every reconnect');
}

report();
