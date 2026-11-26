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
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this suite runs on a temp home of its own before any of its code
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { checker } from './lib/check.mjs';
import { anchored, scratchDir, landingWriter } from './scratch.mjs';
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
  const one = U.storeHeldWords([HELD('settings.json')]), two = U.storeHeldWords([HELD('settings.json'), HELD('layouts.json', 'said', 'damaged')]);
  ok(one === U.storeHeldWords(HELD('settings.json')) && /cannot read 2 of its saved files right now/.test(two), 'a refusal that names several holds (the export, the import: a LIST) is one true sentence — one hold its own words, several how many', J({ one, two }));
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
  const CTL = await esmCopy('src/lib/store-held.js', anchored(read('src/lib/store-held.js'), "  if (!force && !saidRung(held) && !HELD.has(held.file)) { QUIET.set(held.file, { ...pick(held), rung: 'silent' }); return false; }   // R7: the silent rungs are never said (known, for a press)\n", '', 'silent gate'), 'silent-said');
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
  // THE LIFT (主开发 12:54Z, picture B2): a LANDED page's change refused by a hold past its rungs, then the hold ends (the hub's whole
  // settings broadcast) — the row reads the STORED value again and its «not now … right now» mark leaves; the window hears which rows
  const liftScene2 = (SM) => settingsScene(SM, async ({ sm, W, advance }) => {
    W.hub = 'ok'; await sm.load();   // landed
    W.hub = 'held-said'; sm.set(P, false); await advance(600);   // refused by the hold: the row «Not now»
    const during = { state: sm.saveStateOf(P), byHold: sm.failHeldOf(P), shows: sm.get(P) };
    const heard = []; sm.onLift((paths) => heard.push(...paths));
    W.hub = 'ok'; sm.applyRemote({ ...W.server });   // the lift's settings-updated: the hub's whole state
    return { during, state: sm.saveStateOf(P), byHold: sm.failHeldOf(P), shows: sm.get(P), heard, posts: W.posts.length, held: sm.held };
  });
  const lf = await liftScene2(SettingsManager);
  ok(lf.during.state === 'failed' && lf.during.byHold === true && lf.during.shows === false && lf.state === 'idle' && lf.byHold === false && lf.shows === true && J(lf.heard) === J([P]) && lf.posts === 0 && lf.held === null,
    'THE LIFT: a row a hold refused («Not now», the person\'s value shown) reads the STORED value again once the hold is over and its mark leaves — no «right now» after the hold, no value shown that is not stored, and the refused change is NOT saved silently; the window hears the rows to redraw', J(lf));
  const CTLL = await esmCopy('src/lib/settings.js', anchored(read('src/lib/settings.js'), "    this._liftHeld();   // B-225b: the server's whole state is here again — the rows a hold refused read it (no «right now» after the hold)\n", '', 'the lift in applyRemote'), 'no-lift');
  const lfx = await liftScene2(CTLL.SettingsManager);
  ok(lfx.state === 'failed' && lfx.byHold === true && J(lfx.heard) === '[]', 'CONTROL (the lift cut, in a copy): after the hold the row still says «not now … cannot read your settings right now» — of a hold that ended — and the window is never told to redraw it, so its box keeps the person\'s refused value (red)', J(lfx));
  // THE WINDOW'S FOOT: «every change saves as you make it» is not said while the settings are held
  ok(V.footWords({ file: 'settings.json' }, (x) => x) === '' && /^Every change here saves as you make it/.test(V.footWords(null, (x) => x))
    && /const words = footWords\(this\.settings\.held, t\);/.test(read('src/lib/settings-ui.js')) && (read('src/lib/settings-ui.js').match(/this\._drawFoot\(\);/g) || []).length >= 4,
    'THE WINDOW\'S FOOT: while the settings are held it says nothing (its rule is false then); the window redraws it at every draw, every save state and the lift');
  // round wyzvr7567's cure 1: A PERSON'S RESET ALL REFUSED BY A HOLD IS SAID AT THE PRESS — inside the hold's silent rungs too. A landed
  // page that met a hold (here only in its silent rungs) refuses the reset at once: nothing changed, never left waiting in silence; the
  // window says it after the confirm (its words, zh / ja). RED: the reset's hold guard cut — the rows reset on the page, unsaved, unsaid
  const Q = 'chat.showHookCards';
  const resetScene = (SM) => settingsScene(SM, async ({ sm, W, advance }) => {
    W.hub = 'ok'; await sm.load();   // landed
    W.hub = 'held-silent'; sm.set(P, false); await advance(600);   // a change met the hold in its SILENT rungs: the page knows it now
    const knew = sm.held ? sm.held.rung : null, before = J(sm.toJSON());
    const r = sm.resetAll(); await advance(600);
    return { knew, r, same: J(sm.toJSON()) === before, posts: W.posts.length };
  });
  const rz = await resetScene(SettingsManager);
  const U = await import('../src/lib/utils.js');
  const tp = (x, ps) => String(x).replace(/\{(\w+)\}/g, (_, k) => (ps && ps[k] != null ? ps[k] : `{${k}}`));
  const rw = V.resetRefusedWords(HELD('settings.json', 'silent'), tp, U.storeHeldWords), rw0 = V.resetRefusedWords(null, tp, U.storeHeldWords);
  ok(rz.knew === 'silent' && rz.r === false && rz.same && rz.posts === 0 && /^Not reset: VibeSpace cannot read your settings right now — nothing was changed/.test(rw) && /^Not reset: the settings have not been read from VibeSpace yet/.test(rw0)
    && /if \(this\.settings\.resetAll\(\) === false\) showToast\(resetRefusedWords\(this\.settings\.held, t, storeHeldWords\), \{ type: 'error' \}\);/.test(read('src/lib/settings-ui.js')),
    'RESET ALL a hold refused is SAID AT THE PRESS, inside its silent rungs too: the page that met the hold refuses it at once (nothing changed, nothing sent, never left waiting in silence) and the window says «Not reset: …» after the confirm', J({ ...rz, rw, rw0 }));
  const CTLz = await esmCopy('src/lib/settings.js', anchored(read('src/lib/settings.js'), "    if (this.held) return false;       // a hold this page met (said or in its silent rungs): the person's whole reset is refused at once, never left waiting in silence\n", '', 'the reset\'s hold guard'), 'no-reset-guard');
  const rzx = await resetScene(CTLz.SettingsManager);
  ok(rzx.r !== false && rzx.same === false, 'CONTROL (the reset\'s hold guard cut, in a copy): the rows reset on the page while the hub holds the settings — not saved, and nothing says so at the press (red)', J(rzx));
  // the lift with NOTHING refused still tells the window (its foot was the hold's: it redraws); a change a hold refused never rides
  // another row's save (a hub that reads again before its word reached this page) — it was said refused, it is never saved in silence
  const nf = await settingsScene(SettingsManager, async ({ sm, W }) => {
    await sm.load();   // held (said), nothing refused
    const heard = []; sm.onLift((paths) => heard.push(paths.length));
    W.hub = 'ok'; sm.applyRemote({ ...W.server });
    return { heard, held: sm.held };
  });
  const ride = await settingsScene(SettingsManager, async ({ sm, W, advance }) => {
    W.hub = 'ok'; await sm.load();
    W.hub = 'held-said'; sm.set(P, false); await advance(600);   // refused by the hold: the row «Not now»
    W.hub = 'ok'; sm.set(Q, false); await advance(600);   // the hub reads again; its word has not reached this page — the person changes ANOTHER row
    return { body: W.posts[0] || null, refusedStill: sm.failHeldOf(P) };
  });
  ok(J(nf.heard) === '[0]' && nf.held === null && !!ride.body && !(P in ride.body) && ride.body[Q] === false && ride.body['x.server'] === 'the server\'s own value',
    'the LIFT with nothing refused tells the window (its foot, the hold\'s, is redrawn); a change a HOLD refused rides no other row\'s save — the next POST carries the stored value of that row, never the refused one', J({ nf, ride }));
  const CTLy = await esmCopy('src/lib/settings.js', anchored(read('src/lib/settings.js'), "    for (const p of this._failHeld) { if (p in this._server) data[p] = this._server[p]; else delete data[p]; }\n", '', 'the refused rows kept out'), 'refused-rides');
  const ridex = await settingsScene(CTLy.SettingsManager, async ({ sm, W, advance }) => {
    W.hub = 'ok'; await sm.load();
    W.hub = 'held-said'; sm.set(P, false); await advance(600);
    W.hub = 'ok'; sm.set(Q, false); await advance(600);
    return { body: W.posts[0] || null };
  });
  ok(!!ridex.body && ridex.body[P] === false, 'CONTROL (the refused rows kept out of the save cut, in a copy): the change the hold refused — said «not saved» at its press — is SAVED in silence by another row\'s save (red)', J(ridex));
  // the page's smaller shoulds (pins — their road needs the page's DOM): «Not now» toasted ONCE a hold (each refused row says it at the
  // row); a bookmarks save a hold refused leaves the list NOT landed (the next change is refused on the page until a read lands); the
  // Settings window lets its landing and lift listeners go at its close
  ok(/const once = h \? `\$\{h\.file\}\|\$\{h\.since\}` : ''; if \(o && o\.refused && h && h\.rung !== 'silent' && this\._notNowSaid !== once\) \{ this\._notNowSaid = once;/.test(read('src/lib/app.js'))
    && /if \(h\) \{ this\._bkLanded = false; this\._bkHeld = h; noteStoreHeld\(h\); throw /.test(read('src/lib/file-explorer.js'))
    && /winInfo\.onClose = \(\) => \{ this\._dropReloadSubs\(\); this\._offLand\?\.\(\); this\._offLand = null; this\._offLift\?\.\(\); this\._offLift = null; \};/.test(read('src/lib/settings-ui.js')),
    'the smaller shoulds (pins): «Not now» toasted ONCE a hold; a bookmarks save a hold refused leaves the list not landed (the next change refused on the page until a read lands); the Settings window lets its landing and lift listeners go at its close');
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
  const emptied = await G.call('post', '/api/stores/:file/empty', { params: { file: 'layouts.json' }, headers: { 'sec-fetch-site': 'same-origin' } });   // the owner's page (the damaged door's one verdict)
  const h2 = await G.call('get', '/api/stores/held');
  ok(h1.status === 200 && one.length === 1 && one[0].section === 'layouts' && one[0].file === 'layouts.json' && one[0].kind === 'damaged' && typeof one[0].rung === 'string'
    && !!emptied.body && emptied.body.success === true && J(h2.body.held) === J([]) && J(h2.body.unsaved) === J([]),
    'a torn layouts.json at a FRESH start (nothing read yet): the list names it — damaged, with its rung — and the readable settings not; once the person starts it empty the list is empty', J({ h1: h1.body, h2: h2.body }));
  const CTL = M.load(PREL, anchored(PSRC, '    res.json({ held: heldSections(Object.keys(STORE_SECTIONS)), unsaved: ', '    res.json({ held: Object.keys(STORE_SECTIONS).map((n) => STORE_SECTIONS[n].hold.held()).filter(Boolean), unsaved: ', 'the read first'), 'no-read-first');
  const R = setupP(CTL);
  const r1 = await R.call('get', '/api/stores/held');
  ok(J(r1.body.held) === J([]), 'CONTROL (the route asks no store its read first, in a copy): at a fresh start it answers «nothing held» over a torn file — a page opened first says nothing and shows an empty desktop (red)', J(r1.body));
}

// §5b THE HUB'S WORD REACHES THE STRIP: a hold past its silent rungs is SAID with its FILE (store-hold.js onSaid → the `store-held`
// frame) — the page's strip names a store by its file and ignores a word without one. The real hold over a directory (EISDIR), its
// ladder run by hand. RED (anchored, in a copy): the said word without its file — the page never shows the strip for a hold said
// after it opened (the B-225b pictures met exactly this: «[settings] undefined still cannot be read», no strip)
console.log('§5b the hub\'s «store-held» word carries its FILE — the strip names the store from it');
{
  const SHREL = 'src/store-hold.js', SHSRC = read(SHREL);
  const saidScene = async (HM, tag) => {
    const d = scratchDir('store-held-said-' + tag); roots.push(d);   // (one folder a scene: a name gives the same folder within a run)
    const F = path.join(d, 'settings.json'); fs.mkdirSync(F);   // a directory where the store should be: EISDIR, unreadable
    const q = [], saids = [];
    const h = HM.create({ file: F, valid: (v) => !!v && typeof v === 'object', log: { warn() { } }, schedule: (fn) => { q.push(fn); return 0; }, onSaid: (x) => saids.push(x) });
    const r = h.readAtStart();
    // each rung run by hand, then a wait for WHAT HAPPENED — the next rung armed or the word said — bounded at 5 s (the read is real I/O)
    for (let i = 0; i < 8 && !saids.length && q.length; i++) { q.shift()(); for (const t0 = Date.now(); !q.length && !saids.length && Date.now() - t0 < 5000;) await new Promise((res) => setTimeout(res, 5)); }
    h.stop?.();
    const word = saids[0] || null;
    const shown = word ? SH.noteStoreHeld(word) : false, named = !!SH.storeHeld('settings.json');
    SH.noteStoreLifted('settings.json');
    return { r, word, shown, named };
  };
  const real = await saidScene(require(path.join(REPO, SHREL)), 'real');
  ok(real.r === 'held' && !!real.word && real.word.file === 'settings.json' && real.word.rung === 'said' && real.word.kind === 'unreadable' && real.shown === true && real.named === true,
    'the hold\'s SAID word (past its silent rungs) carries its file, its kind and its rung — fed to the page, the strip names the store', real);
  const CTL = M.load(SHREL, anchored(SHSRC, 'onSaid?.({ file: path.basename(file), ...held })', 'onSaid?.({ ...held })', 'said-no-file'), 'said-no-file');   // stale-pins: kept — the replacement IS cut 1's old form (the control rebuilds it)
  const red = await saidScene(CTL, 'red');
  ok(!!red.word && red.word.file === undefined && red.shown === false && red.named === false, 'CONTROL (the said word without its file, in a copy — cut 1 as it was): the page ignores the word — no strip for a hold said after the page opened (red)', red);
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

{
  // (c) round wyzvr7567's cure 1: A PERSON'S PRESS ON THE DESKTOPS IS SAID AT THE ACT — inside the hold's SILENT rungs too. A hold the page
  // knows only in its silent rungs (the hub's list at a reconnect; never drawn) refuses the desktop's change BEFORE it is applied; a
  // press the page could not know held is refused by the hub (`layout-held` for a desktop op) and said all the same; a preset's delete
  // a hold refused is said and the preset stays; the scratch surface once the desktops read again says «load them first»
  const META = { desktopMeta: [{ id: 'd1', name: 'One' }], desktops: {}, saved: {}, current: null };
  ROUTE = (u, o) => (u === '/api/stores/held' ? answer(200, { held: [HELD('layouts.json', 'silent')] })
    : u.startsWith('/api/layouts/') && o && o.method === 'DELETE' ? answer(503, heldBody(HELD('layouts.json', 'silent')))
    : u === '/api/layouts' ? answer(200, META) : answer(404, {}));
  const W = openPage(RealDM, RealLM);
  await SH.refreshStoreHolds();
  const quiet = { said: !!SH.storeHeld('layouts.json'), known: (SH.storeHeldKnown('layouts.json') || {}).rung || null };
  const t0 = toasts().length;
  W.dm.renameDesktop('d1', 'Renamed');
  const r1 = { name: W.dm._desktops[0].name, sent: W.sent.some((m) => m.type === 'desktop-rename'), toasts: added(t0) };
  ok(quiet.said === false && quiet.known === 'silent' && r1.name === 'One' && !r1.sent && r1.toasts.length === 1 && /cannot read your desktops/.test(r1.toasts[0] || ''),
    'a desktop\'s RENAME while the hold is in its SILENT rungs (known from the hub\'s list, never drawn) is refused BEFORE it is applied and SAID at the press — the name kept, nothing sent', J({ quiet, r1 }));
  SH.noteStoreLifted('layouts.json'); await settle();
  const t1 = toasts().length;
  W.frame({ type: 'layout-held', op: 'desktop-rename', desktopId: 'd1', held: HELD('layouts.json', 'silent'), sentAt: null });
  const r2 = { toasts: added(t1), known: !!SH.storeHeldKnown('layouts.json'), drawn: !!SH.storeHeld('layouts.json') };
  ok(r2.toasts.length === 1 && /cannot read your desktops/.test(r2.toasts[0] || '') && r2.known && !r2.drawn,
    'a press the page could not know held, refused by the hub in the hold\'s silent rungs (`layout-held` for a desktop op), is SAID all the same — and the next press is refused before it is applied (the hold known, still not drawn)', J(r2));
  SH.noteStoreLifted('layouts.json'); await settle();
  W.lm._savedPresets = { Work: { windows: [] } };
  const t2 = toasts().length;
  const del = await W.lm.deletePreset('Work');
  ok(del === false && !!W.lm._savedPresets.Work && added(t2).length === 1, 'a preset\'s DELETE refused by a hold (its silent rungs) is SAID at the press and the preset STAYS in the list — the hub kept it', J({ del, presets: Object.keys(W.lm._savedPresets), toasts: added(t2) }));
  SH.noteStoreLifted('layouts.json'); await settle();
  W.done();
  const Sx = await scratchBoot(RealDM, RealLM);
  SH.setScratch('lifted');
  const t3 = toasts().length;
  Sx.dm.renameDesktop('__scratch__', 'Mine');
  ok(/^Your desktops can be read again — load them first/.test(added(t3)[0] || ''), 'the SCRATCH SURFACE once the desktops read again: a press is refused with «load them first» — never «cannot read» of a hold that ended', J(added(t3)));
  Sx.done(); SH.noteStoreLifted('layouts.json'); SH.setScratch(null); await settle();
  // CONTROLS
  const DMS = read('src/lib/desktop-manager.js');
  const CTLk = await esmCopy('src/lib/desktop-manager.js', anchored(anchored(DMS, "import { storeHeldKnown, scratchState } from './store-held.js';", "import { storeHeld, scratchState } from './store-held.js';", 'the import'), ": storeHeldKnown('layouts.json');", ": storeHeld('layouts.json');", 'the known hold'), 'said-only');   // stale-pins: kept — the replacement IS the tip's old spelling (the control rebuilds it)
  const Wk = openPage(CTLk.DesktopManager, RealLM);
  await SH.refreshStoreHolds();
  Wk.dm.renameDesktop('d1', 'Renamed');
  ok(Wk.dm._desktops[0].name === 'Renamed' && Wk.sent.some((m) => m.type === 'desktop-rename'), 'CONTROL (the press asks only a hold the strip DRAWS, in a copy): in the silent rungs the rename is applied and sent — shown as done, refused by the hub (red)');
  Wk.done(); SH.noteStoreLifted('layouts.json'); await settle();
  const CTLo = await esmCopy('src/lib/layout.js', anchored(read('src/lib/layout.js'), "    if (msg.op && msg.op !== 'layout-sync' && msg.held) showToast(", "    if (msg.op && msg.op !== 'layout-sync' && msg.held && msg.held.rung !== 'silent') showToast(", 'the press said at any rung'), 'press-said-past-rungs');
  const Wo = openPage(RealDM, CTLo.LayoutManager);
  const t4 = toasts().length;
  Wo.frame({ type: 'layout-held', op: 'desktop-rename', desktopId: 'd1', held: HELD('layouts.json', 'silent'), sentAt: null });
  ok(added(t4).length === 0, 'CONTROL (a press said only past the silent rungs, in a copy — the cut-6 rule): the hub refused the rename and the page says NOTHING (red)', J(added(t4)));
  Wo.done(); SH.noteStoreLifted('layouts.json'); await settle();
  const CTLp = await esmCopy('src/lib/layout.js', anchored(read('src/lib/layout.js'), "      if (res && res.status === 503) { let b = null; try { b = await res.json(); } catch { } const h = heldBodyOf(b); if (h) { noteStoreHeld(h); showToast(storeHeldWords(h), { type: 'error' }); return false; } }\n", '', 'the delete\'s answer read'), 'delete-unread');
  const Wp = openPage(RealDM, CTLp.LayoutManager);
  Wp.lm._savedPresets = { Work: { windows: [] } };
  await Wp.lm.deletePreset('Work');
  ok(!Wp.lm._savedPresets.Work, 'CONTROL (the delete\'s answer unread, in a copy — the release): the preset leaves the list though the hub kept it, and nothing is said (red)');
  Wp.done(); SH.noteStoreLifted('layouts.json'); await settle();
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

// ── §8 B-225b's SECOND HALF (主开发 r662): a store whose WRITE the storage refused is said on the SAME strip on every page —
// «changes are not being saved» — from the hub's word (store-unsaved) and from its list (a page that was away), off at store-saved;
// nothing is refused for it; a restore whose write was refused is said BY NAME, never «restored». RED (in a copy): the strip's
// unsaved sentence cut — the word arrives and the strip says nothing.
console.log('§8 a write the storage refused: the strip says «not being saved» on every page, lifted at the landing; a restore that did not land is never «restored»');
{
  const UNS = (file, code = 'EIO') => ({ file, code, since: 1 });
  SH.noteStoreUnsaved(UNS('layouts.json'));
  const known = SH.storesUnsaved();
  const m1 = SH.stripModel([], { unsaved: [UNS('layouts.json')] }), m2 = SH.stripModel([], { unsaved: [UNS('layouts.json'), UNS('bookmarks.json')] });
  const both = SH.stripModel([HELD('layouts.json')], { unsaved: [UNS('layouts.json')] });
  SH.noteStoreSaved('layouts.json');
  ok(known.length === 1 && known[0].file === 'layouts.json' && /^Changes to your desktops are not being saved: the storage refused the write\. They are kept here and written again by themselves\.$/.test(m1.unsavedText)
    && m1.rows.length === 1 && m1.rows[0].kind === 'unsaved' && /not being saved/.test(m1.rows[0].kindWords) && m1.rows[0].code === 'EIO' && J(m1.unsaved) === J(['layouts.json'])
    && /^Changes to 2 of VibeSpace’s saved files are not being saved/.test(m2.unsavedText) && both.unsaved.length === 0 && both.rows.length === 1 && SH.storesUnsaved().length === 0,
    'the strip\'s model: one unsaved store = its own sentence («changes are not being saved», the store named), several = how many (Details names each: file, code); a HELD store owes no write (the hold\'s words only); store-saved takes it off', J({ m1: m1.unsavedText, m2: m2.unsavedText, both: both.rows }));
  // the hub's list (a page that was away): `unsaved` beside `held`
  ROUTE = () => answer(200, { held: [], unsaved: [{ file: 'layouts.json', code: 'EIO', since: 1, rung: 'said' }] });
  const took = await SH.refreshStoreHolds();
  const fromList = SH.storesUnsaved();
  ROUTE = () => answer(200, { held: [], unsaved: [] });
  const took2 = await SH.refreshStoreHolds();
  ok(took === true && fromList.length === 1 && fromList[0].file === 'layouts.json' && took2 === true && SH.storesUnsaved().length === 0, 'the hub\'s list at a boot or a reconnect carries the unsaved stores (a word said while the page was away still reaches it); the next list without it lets it go', J({ fromList }));
  // a restore whose write the storage refused: the page's words BY NAME (fetchJson maps store_unsaved), the hub's kept as `said`
  ROUTE = () => answer(503, { error: 'restored here, but NOT saved: layouts.json could not be written (EIO)', code: 'store_unsaved', unsaved: { file: 'layouts.json', code: 'EIO' } });
  const rr = await U.fetchJson('/api/layout-history/layout-x.json/restore', { method: 'POST' });
  ROUTE = () => ({ ok: false, status: 599, json: async () => ({}) });
  ok(!!rr && rr.error === U.storeRestoreUnsavedWords() && /^Restored here, but not saved: the storage refused the write\./.test(rr.error) && /restored here, but NOT saved/.test(rr.said), 'a restore whose write was refused answers the page\'s own words (never «Layout restored»); the hub\'s English kept as `said`', J(rr));
  // B-0248 step 2 (the second fresh read's should): a write only QUEUED past the store writer's bound (code «queued») is not refused —
  // the restoring page, the strip's sentence and its row say it was not taken in time; a refused one keeps «refused». RED: the queued words cut
  ROUTE = () => answer(503, { error: 'restored here, but NOT saved: layouts.json is not on disk yet (its write is still queued behind the storage)', code: 'store_unsaved', unsaved: { file: 'layouts.json', code: 'queued' } });
  const rq = await U.fetchJson('/api/layout-history/layout-x.json/restore', { method: 'POST' });
  ROUTE = () => ({ ok: false, status: 599, json: async () => ({}) });
  const qm = SH.stripModel([], { unsaved: [UNS('layouts.json', 'queued')] }), em = SH.stripModel([], { unsaved: [UNS('layouts.json')] });
  const queuedSaid = (r, m) => !!r && /^Restored here, but not saved yet: the storage has not taken the write in time\./.test(r.error) && !!m && /not saved yet: the storage has not taken the write in time/.test(m.unsavedText) && /^not saved yet/.test(m.rows[0].kindWords);
  ok(queuedSaid(rq, qm) && rq.error === U.storeRestoreUnsavedWords('queued') && /refused the write/.test(em.unsavedText) && /refused the write/.test(em.rows[0].kindWords) && U.storeRestoreUnsavedWords('EIO') === U.storeRestoreUnsavedWords(),
    'a write only QUEUED past the writer\'s bound (code «queued») is said as not taken in time — the restoring page, the strip\'s sentence and its row; a refused one keeps «refused»', J({ rq: rq && rq.error, qm: qm && qm.unsavedText, row: qm && qm.rows[0].kindWords }));
  const UQX = await esmCopy('src/lib/utils.js', anchored(read('src/lib/utils.js'), "  if (u && u.code === 'queued') return t(", "  if (false) return t(", 'queued-words-cut'), 'queued-words-cut');
  const qmx = UQX.storeUnsavedWords(UNS('layouts.json', 'queued'));
  ok(/refused the write/.test(qmx), 'CONTROL (the queued words cut, in a copy): the strip says «the storage refused the write» for a write only queued (red)', J(qmx));
  // the round's small: each of the other two queued branches gets its own red — the strip's row, the restoring page's words
  const SKX = await esmCopy('src/lib/store-held.js', anchored(read('src/lib/store-held.js'), "unsaved: (code) => (code === 'queued' ? t('not saved yet — the storage has not taken the write in time') : t('not being saved — the storage refused the write')),", "unsaved: (code) => t('not being saved — the storage refused the write'),   /* MUTANT: the row's queued words cut */", 'row-queued-cut'), 'row-queued-cut');
  const skm = SKX.stripModel([], { unsaved: [UNS('layouts.json', 'queued')] });
  ok(!!skm && /refused the write/.test(skm.rows[0].kindWords), 'CONTROL (the strip row\'s queued words cut, in a copy): the row says «refused» for a write only queued (red)', J(skm && skm.rows[0].kindWords));
  const URX = await esmCopy('src/lib/utils.js', anchored(read('src/lib/utils.js'), "if (code === 'queued') return t(", "if (false) return t(", 'restore-queued-cut'), 'restore-queued-cut');
  ok(/refused the write/.test(URX.storeRestoreUnsavedWords('queued')), 'CONTROL (the restore\'s queued words cut, in a copy): the restoring page says «refused» for a write only queued (red)', J(URX.storeRestoreUnsavedWords('queued')));
  const APP = read('src/lib/app.js'), SF = read('src/lib/setup-flows.js');
  ok(APP.includes("else if (msg.type === 'store-unsaved') noteStoreUnsaved(msg);") && APP.includes("else if (msg.type === 'store-saved') noteStoreSaved(msg.file);")
    && /if \(own && msg\.rid && msg\.rid === own\.rid\) \{ if \(msg\.unsaved\) \{ noteStoreUnsaved\(msg\.unsaved\); own\.unsaved\(msg\.unsaved\); \} else own\.landed\(\); return; \}/.test(APP)
    && /if \(res\?\.code === 'store_unsaved'\) \{ own\.over = true;[^\n]*showToast\(res\.error \|\| storeRestoreUnsavedWords\(\), \{ type: 'error'/.test(SF) && /own\.unsaved = \(u\) => end\(\{ code: 'store_unsaved', error: storeRestoreUnsavedWords\(u && u\.code\) \}\);/.test(SF),
    'the page\'s wiring: the hub\'s two words reach the strip; the restoring page\'s own broadcast with the unsaved fact says the refusal (never «restored»), and so does its POST\'s 503 (pins)');
  // (round wg2vawd0o) an owed write that ENDED BY NAME says only `store-lifted`: the strip lets «not being saved» go at that word
  const liftClears = (S) => { S.noteStoreUnsaved(UNS('layouts.json')); S.noteStoreLifted('layouts.json'); const left = S.storesUnsaved().length; S.noteStoreSaved('layouts.json'); return left; };
  ok(liftClears(SH) === 0, 'the store read again (store-lifted) also takes «not being saved» off: an owed write that ended by name never keeps the strip up until a reconnect');
  const NOLIFT = await esmCopy('src/lib/store-held.js', anchored(read('src/lib/store-held.js'), /^ {2}UNSAVED\.delete\(f\);[^\n]*\n[^\n]*\n/m, '', 'lift-keeps-unsaved'), 'lift-keeps-unsaved');
  ok(liftClears(NOLIFT) === 1, 'CONTROL (the lift without the clearing, in a copy): the strip keeps «not being saved» for a store whose owed write ended — red');
  const CUT = await esmCopy('src/lib/store-held.js', anchored(read('src/lib/store-held.js'), "  const unsavedText = [ownRows.length ? storeUnsavedWords(ownRows) : '', ...pointRows.map((u) => storeUnsavedWords(u))].filter(Boolean).join(' ');", "  const unsavedText = '';   // MUTANT: the unsaved sentence cut", 'unsaved-cut'), 'unsaved-cut');
  const cm = CUT.stripModel([], { unsaved: [UNS('layouts.json')] });
  ok(!!cm && cm.unsavedText === '', 'CONTROL (the strip\'s unsaved sentence cut, in a copy): the word arrives and the strip says nothing of it — red', J(cm && cm.unsavedText));
  // r1595 (the round's should): the desktops' row AND the rollback points' row on the strip — the count sentence («kept here and written
  // again by themselves») is the stores' own; the points (let go when refused) say their own sentence beside it
  const PTS = { file: 'layout-history', code: 'EIO', since: 1, rung: 'said', lost: 1 };
  const two = SH.stripModel([], { unsaved: [UNS('layouts.json'), PTS] }).unsavedText;
  const twoRight = (x) => typeof x === 'string' && x.includes(U.storeUnsavedWords(UNS('layouts.json'))) && x.includes(U.storeUnsavedWords(PTS)) && !/saved files are not being saved/.test(x);
  ok(twoRight(two), 'the desktops\' row and the rollback points\' row together: the desktops\' own sentence and the points\' own (let go, counted) — never one count that calls a refused point «kept here and written again»', two);
  const COUNT = await esmCopy('src/lib/store-held.js', anchored(read('src/lib/store-held.js'), "  const unsavedText = [ownRows.length ? storeUnsavedWords(ownRows) : '', ...pointRows.map((u) => storeUnsavedWords(u))].filter(Boolean).join(' ');", "  const unsavedText = unsaved.length ? storeUnsavedWords(unsaved) : '';   // MUTANT: the tip's count over every row", 'points-counted'), 'points-counted');
  const twoX = COUNT.stripModel([], { unsaved: [UNS('layouts.json'), PTS] }).unsavedText;
  ok(!twoRight(twoX) && /saved files are not being saved/.test(twoX), 'CONTROL (the count over every row, in a copy — the line as taken): a refused point is told «kept here and written again by themselves» — red', twoX);
}

// ── §9 B-225b's REMAINDER (lane login-request-card, 主开发 r1310 / r1318) ── (a) the stamp and the start's verdict, PURE; (b) THE LAST
// STOP told at the next start, over the REAL persistence router in scratch data folders (each «hub start» a fresh copy of the module;
// a «hub death» = its timers never run: every run's sync calls go through `still`, which drops the timers they arm — the debounce, the
// hold's ladder — so nothing of a dead run lands later); (c) the ROLLBACK POINTS' failed save said once and cleared, an unread point
// never offered; (d) the stamp's roads census and the release's frozen reader. Each law has its RED (anchored, in a copy).
console.log('§9 B-225b\'s remainder: the rollback points\' failed save is said; the last stop is told at the next start (known / «may not» / nothing)');
{
  const PREL = 'src/routes/persistence.js', PSRC = read(PREL);
  const PZ = require(path.join(REPO, PREL));
  // (a) PURE
  const doc0 = { current: null, saved: { work: { a: 1 } }, desktopMeta: [{ id: 'd1', name: 'Work' }], desktops: { d1: { autoSave: { windows: [{ winId: 'w1' }] } } } };
  const b0 = PZ.stampedBytes(doc0, { run: 'r1', seq: 3, at: 1000, stop: false });
  const p0 = JSON.parse(b0), s0 = PZ.stampOfRead(p0, b0);
  const relDoc = JSON.parse(b0); relDoc.saved.home = { b: 2 };   // the release keeps the name and writes the doc back whole (§9e)
  const relBytes = JSON.stringify(relDoc, null, 2), sRel = PZ.stampOfRead(JSON.parse(relBytes), relBytes);
  const sSame = PZ.stampOfRead(JSON.parse(JSON.stringify(p0, null, 2)), JSON.stringify(p0, null, 2));
  const V = (stamp, mark = null, trusted = true) => PZ.stopVerdict({ stamp, trusted, mark });
  const T = (o) => ({ run: 'r1', seq: 3, at: 1000, stop: false, ...o });
  ok(b0.endsWith('\n}') && Object.keys(p0).pop() === PZ.STAMP && s0.trusted === true && s0.stamp.seq === 3 && sSame.trusted === true && sRel.trusted === false
    && V(T({ stop: true })) === null && V(T({})).kind === 'maynot'
    && V(T({}), { base: { run: 'r1', seq: 3 }, since: 900, code: 'EIO' }).kind === 'known' && V(T({}), { base: { run: 'r1', seq: 3 }, since: 900, code: 'EIO' }).since === 900 && V(T({}), { base: { run: 'r1', seq: 3 }, since: 900, code: 'EIO' }).cause === 'refused'
    && V(T({ stop: true }), { base: { run: 'r1', seq: 3 }, since: 900, code: 'ENOSPC' }).kind === 'known'
    && V(T({}), { base: { run: 'r1', seq: 3 }, since: 900, code: 'queued' }).cause === 'late'
    && V(T({}), { base: { run: 'r1', seq: 2 }, since: 900 }).kind === 'maynot' && V(T({ stop: true }), { base: { run: 'r0', seq: 3 }, since: 900 }) === null
    && V(null, { base: null, since: 5 }, false).kind === 'known' && V(null, { base: { run: 'r1', seq: 3 }, since: 5 }, false) === null
    && V(T({ stop: true, unnoted: { kind: 'known', since: 5, savedAt: 4, cause: 'late' } })).cause === 'late'
    && V(T({}), { base: { run: 'r1', seq: 3 }, since: 1 }, false) === null && V(null) === null
    && PZ.pointUnread({ bytes: 10 }, { size: 10 }) === null && PZ.pointUnread({ bytes: 10 }, { size: 7 }) === 'size' && PZ.pointUnread({}, { size: 7 }) === null && PZ.pointUnread({ bytes: 1 }, { statCode: 'ENOENT' }) === 'ENOENT',
    'PURE: the stamp is the LAST name of the bytes and reads back trusted (a rewrite of the same doc too); a reader that kept the name and changed the doc is NOT trusted; the verdict (r1387 (3)): a mark whose BASE is the file\'s own stamp = KNOWN whatever the stamp\'s stop says (a run whose every write was refused), with its cause (refused / late); a mark with no base over a file with no stamp = KNOWN; a base that no longer matches = silent (or «may not» on the stamp alone); a clean stop = nothing; a clean stop with an unnoted loss = KNOWN again; an untrusted stamp or none = nothing; a point is unread by its stat or by a byte count its meta names', J({ s0, sRel, sSame }));

  // (b) THE LAST STOP over the real router
  let runN = 0;
  const hub = (dir, src = null, writer = null) => {
    let P;
    if (src) P = M.load(PREL, src, `b225b-run-${++runN}`);
    else { for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k]; P = require(path.join(REPO, PREL)); }
    const words = [];
    const client = { readyState: 1, send: (j) => { try { words.push(JSON.parse(j)); } catch { } } };
    P.setup({ writer: writer || landingWriter(), dataDir: dir, wss: { clients: new Set([client]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
    const handler = (method, p) => { const l = P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]); return l.route.stack[0].handle; };
    const call = async (method, p, { params = {}, headers = {}, body = {} } = {}) => { let status = 200, o = null; const res = { status(c) { status = c; return res; }, json(x) { o = x; return res; }, set() { return res; }, setHeader() { } }; await handler(method, p)({ body, query: {}, params, headers }, res, () => { status = 500; }); return { status, body: o }; };
    return { R: P.router, words, call, said: (type) => words.filter((w) => w.type === type) };
  };
  const ST = globalThis.setTimeout;
  const still = (fn) => { globalThis.setTimeout = () => ({ unref() { return this; }, ref() { return this; } }); try { return fn(); } finally { globalThis.setTimeout = ST; } };
  const scratchRoot = scratchDir('store-held-page-b225b'); roots.push(scratchRoot);   // ONE folder per name in a process — each scene its own subfolder
  let scratchN = 0;
  const scratch = () => { const d = path.join(scratchRoot, String(++scratchN)); fs.mkdirSync(d, { recursive: true }); return d; };
  const desk = (...ids) => ({ current: null, saved: {}, customGrids: [], desktopMeta: [{ id: 'd1', name: 'Work' }], desktops: { d1: { autoSave: { windows: ids.map((w) => ({ winId: w, type: 'chat' })) } } } });
  const plant = (p) => fs.mkdirSync(p, { recursive: true });   // a DIRECTORY where a temp file goes: the write refused (EISDIR)
  const tmpOf = (dir, f) => path.join(dir, `${f}.${process.pid}.tmp`);
  // r1387 (8): wait on the EFFECT — the held list asks the desktops their read (the verdict starts), then the verdict's own promise
  const stopOf = async (H) => { await H.call('get', '/api/stores/held'); await H.R.layoutsStopJudged(); await settle(2); return (await H.call('get', '/api/stores/held')).body.stop; };
  /** a run that reads, changes and lands, then (owe) a change the storage refuses — the mark written (or not: markFails) — and a stop
   *  that cannot land; else a clean stop (clean) or none (a kill) */
  const runOne = async (dir, { owe = false, markFails = false, clean = false, src = null } = {}) => {
    const H = hub(dir, src);
    still(() => { H.R.readLayouts(); H.R.writeLayouts(desk('w1')); H.R.flushLayouts(); });
    if (owe) {
      plant(tmpOf(dir, 'layouts.json')); if (markFails) plant(tmpOf(dir, 'layouts.owed.json'));
      still(() => { H.R.writeLayouts(desk('w1', 'w2')); H.R.flushLayouts(); });
      await H.R.layoutsMarkSettled();
      still(() => H.R.flushLayouts({ stop: true }));
      fs.rmSync(tmpOf(dir, 'layouts.json'), { recursive: true, force: true }); fs.rmSync(tmpOf(dir, 'layouts.owed.json'), { recursive: true, force: true });
    } else if (clean) still(() => H.R.flushLayouts({ stop: true }));
    return H;
  };
  // KNOWN: a write owed at the stop, its mark written
  const dK = scratch();
  await runOne(dK, { owe: true });
  const mark = (() => { try { return JSON.parse(fs.readFileSync(path.join(dK, 'layouts.owed.json'), 'utf8')); } catch { return null; } })();
  const K2 = hub(dK); still(() => K2.R.readLayouts());
  const k2 = await stopOf(K2), k2w = K2.said('store-stop-unsaved');
  still(() => { K2.R.writeLayouts(desk('w9')); K2.R.flushLayouts(); });
  const k2after = await stopOf(K2);
  still(() => K2.R.flushLayouts({ stop: true }));
  const carried = PZ.stampOfRead(JSON.parse(fs.readFileSync(path.join(dK, 'layouts.json'), 'utf8')), fs.readFileSync(path.join(dK, 'layouts.json'), 'utf8')).stamp;
  const K3 = hub(dK); still(() => K3.R.readLayouts());
  const k3 = await stopOf(K3);
  const agent = await K3.call('post', '/api/stores/layouts.json/stop-noted', { headers: {} });
  const noted = await K3.call('post', '/api/stores/layouts.json/stop-noted', { headers: { 'sec-fetch-site': 'same-origin' } });
  const k3after = await stopOf(K3);
  still(() => K3.R.flushLayouts({ stop: true }));
  const K4 = hub(dK); still(() => K4.R.readLayouts());
  const k4 = await stopOf(K4);
  ok(!!mark && typeof mark.seq === 'number' && !!k2 && k2.kind === 'known' && k2.since === mark.since && k2w.length === 1 && k2w[0].kind === 'known'
    && !!k2after && k2after.kind === 'known' && !!carried && carried.stop === true && !!carried.unnoted && carried.unnoted.kind === 'known'
    && !!k3 && k3.kind === 'known' && agent.status === 403 && agent.body.code === 'store_person_only' && noted.status === 200 && noted.body.noted === true
    && k3after === null && K3.said('store-stop-over').length === 1 && k4 === null,
    'KNOWN (r1318 (a)): a stop with a layouts write owed and its mark written ⇒ the next start says the loss to every page (once, by word) and to a page asking later (GET /api/stores/held) — with the moment it began; a landed write does not take it away; it rides the next writes (a clean stop\'s stamp carries it) so a SECOND restart still says it; an agent\'s call never notes it (403 by name); the person\'s «Understood» does, every page told; the start after that says nothing', J({ mark, k2, k2after, carried, k3, agent: agent.body, noted: noted.body, k3after, k4 }));
  // MAY NOT: a kill (no stop flush); a mark the disk refused too; it goes by itself at the first landing and is never carried
  const dM = scratch();
  await runOne(dM);   // killed: no stop flush
  const M2 = hub(dM); still(() => M2.R.readLayouts());
  const m2 = await stopOf(M2), m2w = M2.said('store-stop-unsaved');
  still(() => { M2.R.writeLayouts(desk('w1', 'w5')); M2.R.flushLayouts(); });
  const m2after = await stopOf(M2), m2over = M2.said('store-stop-over');
  still(() => M2.R.flushLayouts({ stop: true }));
  const M3 = hub(dM); still(() => M3.R.readLayouts());
  const m3 = await stopOf(M3);
  const dF = scratch();
  await runOne(dF, { owe: true, markFails: true });
  const markGone = !fs.existsSync(path.join(dF, 'layouts.owed.json'));
  const F2 = hub(dF); still(() => F2.R.readLayouts());
  const f2 = await stopOf(F2);
  const dQ = scratch();
  await runOne(dQ);   // killed, then a start that changes NOTHING and stops cleanly: the stop's own flush is the first landing
  const Q2 = hub(dQ); still(() => Q2.R.readLayouts());
  const q2 = await stopOf(Q2);
  still(() => Q2.R.flushLayouts({ stop: true }));
  const Q3 = hub(dQ); still(() => Q3.R.readLayouts());
  const q3 = await stopOf(Q3);
  ok(!!m2 && m2.kind === 'maynot' && m2w.length === 1 && m2after === null && m2over.length === 1 && m3 === null
    && markGone && !!f2 && f2.kind === 'maynot' && !!q2 && q2.kind === 'maynot' && q3 === null,
    'MAY NOT (r1318 (b)): a hub killed with no stop flush ⇒ the next start says «may not» once (a word, and to a page asking before a landing); the first landed layouts write takes it away (every page told) and it is never carried — the start after a clean stop says nothing; a stop whose OWED MARK the disk refused too says «may not», never silence', J({ m2, m2after, m3, markGone, f2, q2, q3 }));
  // NOTHING: a clean stop; a start that never read the desktops stops without a write — the stamp of the last clean stop stands
  const dC = scratch();
  await runOne(dC, { clean: true });
  const C2 = hub(dC);
  let c2wrote = null; still(() => C2.R.flushLayouts({ stop: true }, (ok) => { c2wrote = ok; }));   // a start that never read the desktops: its stop writes nothing (answered «nothing to write»)
  const c2 = await stopOf(C2);
  const C3 = hub(dC); still(() => C3.R.readLayouts());
  const c3 = await stopOf(C3);
  // a file the release rewrote (it keeps the stamp's name, the doc changed) with a mark of that run: the stamp says nothing
  const dR = scratch();
  fs.writeFileSync(path.join(dR, 'layouts.json'), relBytes);
  fs.writeFileSync(path.join(dR, 'layouts.owed.json'), J({ run: 'r1', seq: 9, since: 1, base: { run: 'r1', seq: 3 }, code: 'EIO' }));   // its base IS the stamp the release kept
  const R2 = hub(dR); still(() => R2.R.readLayouts());
  const r2 = await stopOf(R2);
  ok(c2wrote === true && c2 === null && c3 === null && r2 === null && C2.said('store-stop-unsaved').length === 0,
    'NOTHING: a clean stop ⇒ the next start says nothing; a start that never read the desktops writes nothing at its stop and the start after still says nothing; a file another reader rewrote keeping the stamp\'s name (the release) ⇒ the stamp no longer speaks — no «not saved» from a stale mark', J({ c2, c3, r2 }));
  // REDs
  const cut = (tag, from, to) => anchored(PSRC, from, to, tag);
  { const S = cut('stop-unstamped', 'stop: !!stop, ...(unnoted', 'stop: false, ...(unnoted'); const d = scratch(); await runOne(d, { clean: true, src: S }); const H = hub(d, S); still(() => H.R.readLayouts()); const v = await stopOf(H);
    ok(!!v && v.kind === 'maynot', 'CONTROL (the stop\'s flush not stamped stop:true, in a copy): a CLEAN stop is told «may not» — red', J(v)); }
  { const S = cut('mark-ignored', "  const st = stamp || null, m = mark && typeof mark === 'object' && 'base' in mark ? mark : null;", "  const st = stamp || null, m = null;"); const d = scratch(); await runOne(d, { owe: true, src: S }); const H = hub(d, S); still(() => H.R.readLayouts()); const v = await stopOf(H);
    ok(!!v && v.kind === 'maynot', 'CONTROL (the owed mark not read, in a copy): a KNOWN loss is told only «may not» — red', J(v)); }
  // B-574d (lane nl-journals, 主开发 r4761 — the third shape): THE OWED MARK IS ON DISK BEFORE ITS NAME POINTS AT IT. Every call on its
  // temp, in order, on the promises road (its own chain, off the loop); a PLACED answer of the temp's sync (an errno name), never a mount
  const markTrace = async (dir, fn, { sync = null, close = null } = {}) => {
    const tmp = tmpOf(dir, 'layouts.owed.json'), fin = path.join(dir, 'layouts.owed.json'), P0 = { open: fs.promises.open, rename: fs.promises.rename }, calls = [], warned = [], w0 = console.warn;
    fs.promises.open = async function (p0, ...a) {
      const fh = await P0.open.call(this, p0, ...a);
      if (String(p0) !== tmp) return fh;
      calls.push('open');
      const s0 = fh.sync, c0 = fh.close;
      fh.sync = async function () { calls.push('sync'); if (sync) throw Object.assign(new Error(`${sync}: a placed answer of the sync`), { code: sync }); return s0.call(this); };
      fh.close = async function () { calls.push('close'); await c0.call(this); if (close) throw Object.assign(new Error(`${close}: a placed answer of the close`), { code: close }); };
      return fh;
    };
    fs.promises.rename = async function (a0, b0, ...a) { if (String(a0) === tmp && String(b0) === fin) calls.push('rename'); return P0.rename.call(this, a0, b0, ...a); };
    console.warn = (...a) => warned.push(a.join(' '));
    try { const value = await fn(); return { value, calls: calls.join(' '), warned }; } finally { Object.assign(fs.promises, P0); console.warn = w0; }
  };
  const markOf = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'layouts.owed.json'), 'utf8')); } catch { return null; } };
  /** a run with a write owed (runOne), its mark's chain SETTLED inside the placed window — the failed stop flush tries the mark again */
  const owedRun = (d, o = {}) => async () => { const H0 = await runOne(d, { owe: true, ...o }); await settle(10); await H0.R.layoutsMarkSettled(); return H0; };
  {
    const d = scratch(), t = await markTrace(d, owedRun(d));
    const m = markOf(d), H = hub(d); still(() => H.R.readLayouts()); const v = await stopOf(H);
    ok(t.calls === 'open sync close rename' && !!m && typeof m.seq === 'number' && !fs.existsSync(tmpOf(d, 'layouts.owed.json')) && !!v && v.kind === 'known',
      'B-574d THE OWED MARK: its temp opened, written, SYNCED, closed, THEN renamed — on its own chain off the loop; on disk before its name points at it, and the next start tells the KNOWN loss', { calls: t.calls, v: J(v) });
  }
  {
    const d = scratch(), t = await markTrace(d, owedRun(d), { sync: 'EIO' });
    const H = hub(d); still(() => H.R.readLayouts()); const v = await stopOf(H);
    ok(/^open sync close/.test(t.calls) && !/rename/.test(t.calls) && markOf(d) === null && !fs.existsSync(tmpOf(d, 'layouts.owed.json')) && t.warned.some((l) => /the owed mark could not be written \(EIO\)/.test(l)) && !!v && v.kind === 'maynot',
      'B-574d a sync of the mark that FAILS (a placed EIO) is a FAILED WRITE: no rename, no mark, no temp left, said by name — and the next start says «may not» (never a KNOWN loss read from a mark that never reached the disk)', { calls: t.calls, warned: t.warned, v: J(v) });
  }
  {
    const d = scratch(), t = await markTrace(d, owedRun(d), { close: 'EIO' });
    ok(/^open sync close/.test(t.calls) && !/rename/.test(t.calls) && markOf(d) === null && !fs.existsSync(tmpOf(d, 'layouts.owed.json')) && t.warned.some((l) => /the owed mark could not be written \(EIO\)/.test(l)),
      'B-574d a CLOSE of the mark that fails after its write (a placed EIO — a deferred write error) is a FAILED WRITE too: no rename, no mark, no temp left, said by name', { calls: t.calls, warned: t.warned });
  }
  {
    const d = scratch(), t = await markTrace(d, owedRun(d), { sync: 'EINVAL' });
    const nos = t.warned.filter((l) => /the owed mark: its file system does not do a sync \(EINVAL\)/.test(l));
    ok(t.calls === 'open sync close rename' && !!markOf(d) && nos.length === 1 && !nos[0].includes(d),
      'B-574d a file system that does no sync at all (a placed EINVAL) LANDS the mark — said once, no path in the words', { calls: t.calls, warned: t.warned });
  }
  { const S = cut('mark-unsynced', "          try { await fh.sync(); } catch (e) { if (!FCM.SYNC_UNSUPPORTED.has(e && e.code)) throw e; if (!_markNoSyncSaid) { _markNoSyncSaid = true; console.warn(`[layouts] ${FCM.syncUnsupportedWords('the owed mark', e.code)}`); } }\n", '');
    const d = scratch(), t = await markTrace(d, owedRun(d, { src: S }));
    ok(!/sync/.test(t.calls) && /rename/.test(t.calls), 'CONTROL (the mark\'s sync taken out, in a copy): renamed over its name with NO sync of its temp — red', { calls: t.calls }); }
  { const S = cut('maynot-carried', "_startUnnoted : _stopFact && _stopFact.kind === 'known' ?", '_startUnnoted : _stopFact ?'); const d = scratch(); await runOne(d, { src: S }); const H2 = hub(d, S); still(() => H2.R.readLayouts()); await stopOf(H2); still(() => H2.R.flushLayouts({ stop: true })); const H3 = hub(d, S); still(() => H3.R.readLayouts()); const v = await stopOf(H3);
    ok(!!v, 'CONTROL («may not» carried in the bytes, in a copy): the start after a clean stop still tells a loss — red', J(v)); }
  { const S = cut('sum-unchecked', "  return { stamp: st, trusted: body !== null && typeof st.sum === 'string' && sumOf(body) === st.sum };", '  return { stamp: st, trusted: true };'); const d = scratch(); fs.writeFileSync(path.join(d, 'layouts.json'), relBytes); fs.writeFileSync(path.join(d, 'layouts.owed.json'), J({ run: 'r1', seq: 9, since: 1, base: { run: 'r1', seq: 3 }, code: 'EIO' })); const H = hub(d, S); still(() => H.R.readLayouts()); const v = await stopOf(H);
    ok(!!v && v.kind === 'known', 'CONTROL (the checksum not asked, in a copy): a file the release rewrote is told a KNOWN loss from a stale mark — red', J(v)); }

  // (c) THE ROLLBACK POINTS
  const dP = scratch();
  const HP = hub(dP);
  still(() => { HP.R.readLayouts(); HP.R.writeLayouts(desk('w1')); HP.R.flushLayouts(); });
  const HIST = path.join(dP, 'layout-history');
  fs.rmSync(HIST, { recursive: true, force: true }); fs.writeFileSync(HIST, 'a file where the folder goes');   // the points' save refused
  for (const ids of [['w1', 'w2'], ['w1', 'w2', 'w3'], ['w1', 'w3'], ['w4']]) { still(() => { HP.R.writeLayouts(desk(...ids)); HP.R.flushLayouts(); }); await settle(4); }
  const onDisk = JSON.parse(fs.readFileSync(path.join(dP, 'layouts.json'), 'utf8'));
  const pw = HP.said('store-unsaved').filter((w) => w.file === 'layout-history');
  const ph = (await HP.call('get', '/api/stores/held')).body.unsaved.find((u) => u.file === 'layout-history');
  fs.rmSync(HIST, { force: true });   // the storage answers again
  still(() => { HP.R.writeLayouts(desk('w5')); HP.R.flushLayouts(); }); await settle(20);
  const back = HP.said('store-saved').filter((w) => w.file === 'layout-history');
  const ph2 = (await HP.call('get', '/api/stores/held')).body.unsaved.find((u) => u.file === 'layout-history');
  const points = HP.R.listLayoutHistory();
  const newestWins = (() => { try { return JSON.parse(fs.readFileSync(path.join(HIST, points[0].id), 'utf8')).layouts.desktops.d1.autoSave.windows.map((w) => w.winId); } catch { return null; } })();
  ok(pw.length >= 1 && pw[0].rung === 'said' && pw[0].lost === 1 && pw.every((w, i) => i === 0 || w.lost > pw[i - 1].lost) && pw.slice(-1)[0].lost === 4 && J(onDisk.desktops.d1.autoSave.windows.map((w) => w.winId)) === J(['w4']) && !!ph && ph.lost === 4
    && back.length === 1 && !ph2 && points.length === 1 && !points[0].unread && J(newestWins) === J(['w4']) && !fs.readFileSync(path.join(HIST, points[0].id), 'utf8').includes(`"${PZ.STAMP}"`),
    'THE ROLLBACK POINTS (r1310 law 1, r1353 (3)): four points the storage refused are LET GO (B-0248\'s way) and COUNTED — said to every page once a STATE (store-unsaved, layout-history: each word a new count, 1 … 4 — r1387 (2)) and listed for a page asking later with lost: 4 (the once-a-process journal line is not the telling); the desktops\' own save landed all along; when the storage answers again the next point lands and the episode is cleared (store-saved); no point carries the stamp', J({ pw, ph, back: back.length, n: points.length }));
  // an unread point: listed, never offered; its restore refused by name
  const torn = points[0].id, tornPath = path.join(HIST, torn);
  fs.writeFileSync(tornPath, fs.readFileSync(tornPath, 'utf8').slice(0, 40));
  const rowA = (await HP.R.listLayoutHistoryAsync()).find((p) => p.id === torn);
  const rowG = (await HP.call('get', '/api/layout-history')).body.entries.find((p) => p.id === torn);
  const rs = await HP.call('post', '/api/layout-history/:id/restore', { params: { id: torn } });
  const SF2 = read('src/lib/setup-flows.js');
  ok(!!rowA && rowA.unread === 'size' && !!rowG && rowG.unread === 'size' && rs.status === 409 && rs.body.code === 'point_unread'
    && /if \(e\.unread\) return `<div class="lh-row lh-unread">/.test(SF2) && !/if \(e\.unread\)[^\n]*lh-restore/.test(SF2),
    'A POINT THAT DOES NOT READ WHOLE is listed with its reason (the list off the loop, the page\'s route) and NEVER offered (the dialog draws no restore door for it); its restore is refused BY NAME (point_unread), never «not found»', J({ rowA, rowG, rs: rs.body }));
  // a point only LATE past the writer's bound (B-0248's cure: the desktops go on without it): the stand-in writer HOLDS the history's
  // files and answers «queued» (the cure's settle reads it as late), then lands them when the storage answers
  const stallWriter = () => {
    const base = landingWriter(), held = new Map(), refused = new Set(); let mode = 'off';   // 'stall' (answer «queued») | 'refuse' | 'off'
    const isPoint = (f) => f.includes(`${path.sep}layout-history${path.sep}`);
    return { ...base,
      stall(on) { mode = on ? 'stall' : 'off'; if (!on) { for (const [f, h] of [...held]) { held.delete(f); base.dirty(f, h.o); for (const a of h.answers) a(true); } } },
      refuseHeld() { mode = 'refuse'; for (const [f, h] of [...held]) { held.delete(f); refused.add(f); for (const a of h.answers) a(false); } },
      dirty(f, o = {}) {
        if (mode === 'stall' && isPoint(f)) { held.set(f, { o, answers: [], asked: false }); return; }
        if (mode === 'refuse' && isPoint(f)) { refused.add(f); try { o.onWritten && o.onWritten(false, Object.assign(new Error('refused'), { code: 'EIO' })); } catch { } return; }
        return base.dirty(f, o);
      },
      durable(f, { answer = null } = {}) {
        const h = held.get(f);
        if (h) { if (answer) { if (!h.asked) { h.asked = true; answer(false); } else h.answers.push(answer); } return Promise.resolve(false); }
        if (refused.has(f)) { if (answer) answer(false); return Promise.resolve(false); }
        return base.durable(f, { answer });
      },
      whyNotDurable: (f) => (held.has(f) ? { why: 'queued', code: null } : refused.has(f) ? { why: 'failed', code: 'EIO' } : base.whyNotDurable(f)),
    };
  };

  {
    const d = scratch(), SW = stallWriter(), H = hub(d, null, SW);
    still(() => { H.R.readLayouts(); H.R.writeLayouts(desk('w1')); H.R.flushLayouts(); });
    SW.stall(true);
    still(() => { H.R.writeLayouts(desk('w1', 'w2')); H.R.flushLayouts(); }); await settle(10);
    const lw = H.said('store-unsaved').filter((w) => w.file === 'layout-history');
    const desksMeanwhile = JSON.parse(fs.readFileSync(path.join(d, 'layouts.json'), 'utf8')).desktops.d1.autoSave.windows.map((w) => w.winId);
    const lh = (await H.call('get', '/api/stores/held')).body.unsaved.find((u) => u.file === 'layout-history');
    SW.stall(false); await settle(10);
    const lback = H.said('store-saved').filter((w) => w.file === 'layout-history');
    const lpoints = H.R.listLayoutHistory();
    ok(lw.length === 1 && lw[0].code === 'queued' && lw[0].lost === 0 && J(desksMeanwhile) === J(['w1', 'w2']) && !!lh && lh.code === 'queued'
      && lback.length === 1 && lpoints.length === 1 && U.storeUnsavedWords(lw[0]).startsWith('The rollback points of your desktops are not saved yet'),
      'A POINT ONLY LATE (r1353 (2)): past the writer\'s bound the desktops are written without it (layouts.json holds the change) and the episode is said ONCE, in the «queued» words (not saved yet — not taken in time), nothing counted lost; when the storage answers the late point lands, its header after it, and the episode is cleared', J({ lw, desksMeanwhile, lh, back: lback.length, n: lpoints.length }));
  }
  { const S = cut('points-unsaid', "      storeWord('store-unsaved', pointsWord());\n", ''); const d = scratch(); const H = hub(d, S); still(() => { H.R.readLayouts(); H.R.writeLayouts(desk('w1')); H.R.flushLayouts(); }); fs.writeFileSync(path.join(d, 'layout-history'), 'x'); still(() => { H.R.writeLayouts(desk('w1', 'w2')); H.R.flushLayouts(); }); await settle(4);
    ok(H.said('store-unsaved').length === 0, 'CONTROL (the episode not said, the release\'s journal line only — in a copy): no page is told the rollback points stopped — red'); }
  { const S = cut('points-never-cleared', '    if (ok) pointLanded(id);', '    void ok;'); const d = scratch(); const H = hub(d, S); still(() => { H.R.readLayouts(); H.R.writeLayouts(desk('w1')); H.R.flushLayouts(); }); fs.writeFileSync(path.join(d, 'layout-history'), 'x'); still(() => { H.R.writeLayouts(desk('w1', 'w2')); H.R.flushLayouts(); }); await settle(4); fs.rmSync(path.join(d, 'layout-history'), { force: true }); still(() => { H.R.writeLayouts(desk('w3')); H.R.flushLayouts(); }); await settle(20);
    ok(H.said('store-saved').length === 0 && !!(await H.call('get', '/api/stores/held')).body.unsaved.find((u) => u.file === 'layout-history'), 'CONTROL (a landing never ends the episode, in a copy): the storage answers, yet «rollback points are not being saved» stays — red'); }
  { const S = cut('stat-unchecked', "  if (meta && Number.isFinite(meta.bytes) && size !== meta.bytes) return 'size';\n", ''); const d = scratch(); const H = hub(d, S); still(() => { H.R.readLayouts(); H.R.writeLayouts(desk('w1')); H.R.flushLayouts(); H.R.writeLayouts(desk('w2')); H.R.flushLayouts(); }); await settle(4); const p = H.R.listLayoutHistory()[0]; const f = path.join(d, 'layout-history', p.id); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').slice(0, 40));
    ok(!(await H.R.listLayoutHistoryAsync()).find((x) => x.id === p.id).unread, 'CONTROL (the point\'s size not checked, in a copy): a torn point is offered as if it could be restored — red'); }
  { const S = cut('restore-not-found', "    catch { return res.status(409).json({ error: 'this rollback point is damaged (it does not read whole) — nothing was restored; pick another', code: 'point_unread', why: 'damaged' }); }", "    catch { return res.status(404).json({ error: 'not found' }); }"); const d = scratch(); const H = hub(d, S); still(() => { H.R.readLayouts(); H.R.writeLayouts(desk('w1')); H.R.flushLayouts(); H.R.writeLayouts(desk('w2')); H.R.flushLayouts(); }); await settle(4); const p = H.R.listLayoutHistory()[0]; const f = path.join(d, 'layout-history', p.id); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').slice(0, 40)); const r = await H.call('post', '/api/layout-history/:id/restore', { params: { id: p.id } });   // stale-pins: kept (the control puts the release's «not found» back)
    ok(r.status === 404 && r.body.code !== 'point_unread', 'CONTROL (the release\'s «not found», in a copy): a point the list showed answers «not found» — red', J(r.body)); }

  // (d) THE STAMP'S ROADS (主开发 r1318 note 1): every road that hands the desktops out strips it — read, reply, export, broadcast,
  // rollback point — and every reader of the file's BYTES in the hub is named here: a new one is red by name
  const dS = scratch();
  await runOne(dS, { clean: true });
  const HS = hub(dS); still(() => HS.R.readLayouts());
  const got = (await HS.call('get', '/api/layouts')).body;
  still(() => { HS.R.writeLayouts(desk('w7')); HS.R.flushLayouts(); }); await settle(4);
  const pointText = (() => { const p = HS.R.listLayoutHistory()[0]; return p ? fs.readFileSync(path.join(dS, 'layout-history', p.id), 'utf8') : ''; })();
  const relay = HS.words.map((w) => J(w)).join('\n');
  const SRCS = ['server.js', ...fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).map((f) => path.join('src', String(f))).filter((f) => f.endsWith('.js') && !f.startsWith(path.join('src', 'lib') + path.sep))];
  const readers = [];
  for (const f of SRCS) { let t; try { t = read(f); } catch { continue; } t.split('\n').forEach((l, i) => { const code = l.replace(/\/\/.*$/, ''); if (/(readFileSync|readFile|createReadStream|openSync)\(/.test(code) && /LAYOUTS_FILE|layouts\.json/.test(code)) readers.push(`${f}:${i + 1}`); }); }
  const KNOWN_READERS = [   // each strips the stamp before a layout is built from the bytes
    [PREL, "try { prev = JSON.parse(fs.readFileSync(LAYOUTS_FILE, 'utf-8')); } catch { return; }"],   // the rollback point's disk belt — `delete prev[STAMP]` next line
    [PREL, ": fs.promises.readFile(LAYOUTS_FILE, 'utf-8').then((text) => ({ text }), (error) => ({ error }));"],   // layoutsAsync — its text goes through readLayouts
  ];
  const named = readers.filter((r) => KNOWN_READERS.some(([f, l]) => r.startsWith(f + ':') && read(f).split('\n')[Number(r.split(':').pop()) - 1].includes(l)));
  const HR = read('src/server/home-rename.js');
  ok(!(PZ.STAMP in got) && !(PZ.STAMP in HS.R.readLayouts()) && !!pointText && !pointText.includes(`"${PZ.STAMP}"`) && !relay.includes(`"${PZ.STAMP}"`)
    && readers.length === KNOWN_READERS.length && named.length === readers.length && read(PREL).includes('        if (prev && typeof prev === \'object\') delete prev[STAMP];')
    && HR.includes("const stores = ['mounts.json', 'layouts.json', 'task-groups.json', 'machine-mounts.json']"),
    'THE STAMP\'S ROADS: GET /api/layouts, the value in memory (the export and every in-hub reader read it), a rollback point and every word to the pages carry NO stamp; the hub\'s readers of the file\'s bytes are exactly the two named (the point\'s disk belt strips it; layoutsAsync hands its text to readLayouts) — a NEW reader of layouts.json is red by its file and line; the one-shot home rename rewrites the bytes whole (its stamp then fails its checksum and says nothing)', J({ readers, named, got: Object.keys(got) }));
  { const S = cut('strip-cut', '      delete doc[STAMP];\n', ''); const d = scratch(); await runOne(d, { clean: true, src: S }); const H = hub(d, S); still(() => H.R.readLayouts()); const g = (await H.call('get', '/api/layouts')).body;
    ok(PZ.STAMP in g, 'CONTROL (the read does not strip the stamp, in a copy): GET /api/layouts hands the stamp to every page — red'); }

  // (e) A ROLLBACK TO THE RELEASE (note 1): the release's own reader, FROZEN (scripts/fixtures/layouts-reader-release-414.txt), over a
  // stamped file: what it does with the extra name
  const FROZEN = read('scripts/fixtures/layouts-reader-release-414.txt');
  const sec = (head) => { const a = FROZEN.indexOf(head); const b = FROZEN.indexOf('\n// ── ', a + head.length); return FROZEN.slice(FROZEN.indexOf('\n', a) + 1, b < 0 ? undefined : b); };
  const SHOLD = require(path.join(REPO, 'src', 'store-hold.js'));
  const dE = scratch(), fE = path.join(dE, 'layouts.json');
  fs.writeFileSync(fE, PZ.stampedBytes(desk('w1', 'w2'), { run: 'r9', seq: 4, at: 1000, stop: true }));
  const relHold = SHOLD.create({ file: fE, valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v) });
  const relRead = new Function('layoutsHold', 'LAYOUTS_EMPTY', 'ensureDir', 'dataDir', 'wordlessTitles', 'tracesTrue', 'flushLayouts', `let _layoutsCache = null, _layoutsRead = false, _layoutsSaveTimer = null;\n${sec('// ── SERVER readLayouts')}\nreturn readLayouts;`)(relHold, () => ({}), () => { }, dE, () => 0, () => 0, () => true);
  const served = relRead();
  const pageKeys = [...new Set([...sec('// ── PAGE the boot read').matchAll(/data\.(\w+)/g)].map((m) => m[1]))];
  const relWrite = JSON.stringify(served, null, 2);   // the release's flush: [_layoutsCache] with no bytes — the hold writes the doc whole
  const back2 = PZ.stampOfRead(JSON.parse(relWrite), relWrite);
  ok(Object.keys(served).includes(PZ.STAMP) && !(PZ.STAMP in served.saved) && !Object.keys(served.desktops).includes(PZ.STAMP) && !served.desktopMeta.some((m) => m.id === PZ.STAMP)
    && pageKeys.length >= 4 && !pageKeys.includes(PZ.STAMP) && sec('// ── SERVER the flush').includes('return [_layoutsCache]; }, { press }); }') && relWrite.includes(`"${PZ.STAMP}"`) && back2.trusted === true && back2.stamp.stop === true,   // stale-pins: kept (the release's frozen flush, read from the fixture)
    'A ROLLBACK TO THE RELEASE (its reader, frozen): the release hands the stamp out as ONE extra top-level name — never a layout (no saved layout, desktop or desktop id is named by it), and its page reads only its own names (saved, current, desktopMeta, desktops, autoSave…) so the name is ignored; its flush writes the doc back whole, the name kept verbatim — unchanged it still reads trusted, and a doc the release CHANGED fails the checksum (§9a: the stamp then says nothing)', J({ keys: Object.keys(served), pageKeys }));
  // ── §9f THE ROUND'S MUSTS (主开发 r1387, round w1pejcxn3) ──
  // (1) «may not» goes at the FIRST landed desktops write of the run — an autosave NOBODY waits on included (the hold's onLanded)
  {
    const d = scratch();
    await runOne(d);   // a kill: no stop flush
    const H = hub(d); still(() => H.R.readLayouts());
    const v0 = await stopOf(H);
    still(() => { H.R.writeLayouts(desk('w1', 'w8')); H.R.flushLayouts(); });   // an autosave: no answer, no waiter
    await settle(2);
    const v1 = (await H.call('get', '/api/stores/held')).body.stop;
    ok(!!v0 && v0.kind === 'maynot' && v1 === null && H.said('store-stop-over').length === 1,
      '(1) a PLAIN AUTOSAVE (no answer, no waiter — the common road) is the run\'s first landing: the quiet «may not» goes by itself, every page told', J({ v0, v1 }));
    const S = cut('landed-hook-cut', "    onLanded: () => { _lastLanded = { run: RUN, seq: _producedSeq }; layoutsLanded(); },\n", '');
    const d2 = scratch(); await runOne(d2, { src: S }); const H2 = hub(d2, S); still(() => H2.R.readLayouts()); await stopOf(H2);
    still(() => { H2.R.writeLayouts(desk('w1', 'w8')); H2.R.flushLayouts(); }); await settle(2);
    const r1 = (await H2.call('get', '/api/stores/held')).body.stop;
    ok(!!r1 && r1.kind === 'maynot', 'CONTROL (no landing hook for the desktops — the tip the round read, in a copy): the autosave lands and «may not» stays on every page — red', J(r1));
  }
  // (3) A KNOWN LOSS beside an OLDER clean stamp: run A stops cleanly; run B's every desktops write is refused (its mark lands) ⇒ KNOWN
  {
    const d = scratch();
    await runOne(d, { clean: true });   // run A: stamp A, stop:true
    const B = hub(d); still(() => B.R.readLayouts());
    plant(tmpOf(d, 'layouts.json'));
    still(() => { B.R.writeLayouts(desk('w1', 'w9')); B.R.flushLayouts(); });
    await B.R.layoutsMarkSettled();
    still(() => B.R.flushLayouts({ stop: true }));
    fs.rmSync(tmpOf(d, 'layouts.json'), { recursive: true, force: true });
    const markB = (() => { try { return JSON.parse(fs.readFileSync(path.join(d, 'layouts.owed.json'), 'utf8')); } catch { return null; } })();
    const stampA = PZ.stampOfRead(JSON.parse(fs.readFileSync(path.join(d, 'layouts.json'), 'utf8')), fs.readFileSync(path.join(d, 'layouts.json'), 'utf8')).stamp;
    const C = hub(d); still(() => C.R.readLayouts());
    const vC = await stopOf(C);
    ok(!!markB && !!markB.base && markB.base.run === stampA.run && markB.base.seq === stampA.seq && stampA.stop === true && !!vC && vC.kind === 'known' && vC.cause === 'refused',
      '(3) a run whose EVERY desktops write was refused (the mark lands, the file keeps the older run\'s CLEAN stamp): the mark names that stamp as its base ⇒ the next start says KNOWN — never «all saved»', J({ markB, stampA, vC }));
    // a stale mark (its base no longer the file's stamp) stays silent
    const d2 = scratch(); await runOne(d2, { clean: true });
    fs.writeFileSync(path.join(d2, 'layouts.owed.json'), J({ run: 'old', seq: 2, since: 1, base: { run: 'gone-run', seq: 7 }, code: 'EIO' }));
    const D = hub(d2); still(() => D.R.readLayouts());
    ok((await stopOf(D)) === null, '…and a mark whose base is no longer the file\'s own stamp (a later run landed over it) stays SILENT');
    const S = cut('base-ignored', "  if (m && markNamesStamp(m, st)) {", "  if (m && st && m.run === st.run && Number(m.seq) > Number(st.seq) && st.stop !== true) {");
    const E = hub(d, S); still(() => E.R.readLayouts());
    const vE = await stopOf(E);
    ok(vE === null, 'CONTROL (the same-run rule the round read, in a copy): the refused run beside the older clean stamp reads «all saved» — red', J(vE));
  }
  // (6) the KNOWN words by cause: a mark whose code says «queued» is told «not reached the disk in time», never «refused»
  {
    const d = scratch(); await runOne(d, { clean: true });
    const st = PZ.stampOfRead(JSON.parse(fs.readFileSync(path.join(d, 'layouts.json'), 'utf8')), fs.readFileSync(path.join(d, 'layouts.json'), 'utf8')).stamp;
    fs.writeFileSync(path.join(d, 'layouts.owed.json'), J({ run: 'x', seq: 9, since: 1, base: { run: st.run, seq: st.seq }, code: 'queued' }));
    const H = hub(d); still(() => H.R.readLayouts());
    const v = await stopOf(H);
    const words = U.storeStopWords(v, '');
    ok(!!v && v.cause === 'late' && /had not reached the disk in time/.test(words) && !/refused/.test(words) && /⚙ → System → Restore a previous layout…/.test(words),
      '(6) a write only LATE at the stop is told «had not reached the disk in time» (never «refused»), and the words say WHERE the earlier layouts are (⚙ → System → Restore a previous layout…)', words);
    // r1595 (6), the MUST: THE CARRIED ROAD keeps the cause — nobody presses «Understood», a clean stop, a second restart: still «late»
    const cc = async (src) => {
      const dd = scratch(); await runOne(dd, { clean: true });
      const t0 = fs.readFileSync(path.join(dd, 'layouts.json'), 'utf8'), s0 = PZ.stampOfRead(JSON.parse(t0), t0).stamp;
      fs.writeFileSync(path.join(dd, 'layouts.owed.json'), J({ run: 'x', seq: 9, since: 1, base: { run: s0.run, seq: s0.seq }, code: 'queued' }));
      const A = hub(dd, src); still(() => A.R.readLayouts()); const va = await stopOf(A);
      still(() => A.R.flushLayouts({ stop: true }));   // a clean stop; nobody pressed «Understood»
      const B = hub(dd); still(() => B.R.readLayouts());
      return { va, vb: await stopOf(B) };
    };
    const C1 = await cc(null);
    ok(!!C1.va && C1.va.cause === 'late' && !!C1.vb && C1.vb.kind === 'known' && C1.vb.cause === 'late' && !/refused/.test(U.storeStopWords(C1.vb, '')),
      'r1595 (6), THE CARRIED ROAD: a write only LATE, nobody pressing «Understood», a clean stop, a second restart — still told «had not reached the disk in time», never «refused»', J(C1));
    const C1x = await cc(cut('carried-cause-dropped', 'savedAt: _stopFact.savedAt, cause: _stopFact.cause }', 'savedAt: _stopFact.savedAt }'));   // stale-pins: kept (the red control puts the line as taken back)
    ok(!!C1x.vb && C1x.vb.cause === 'refused', 'CONTROL (the carried fact without its cause, in a copy — the line as taken): the second restart tells the late write «refused» — red', J(C1x.vb));
  }
  // (7) a mark that cannot be READ is «unknown» (the journal), never «may not» by itself; a landing before the verdict never removes it
  {
    const d = scratch(); await runOne(d, { clean: true });
    fs.mkdirSync(path.join(d, 'layouts.owed.json'));   // there, and not readable as a mark
    const warned = []; const w0 = console.warn; console.warn = (...a) => { warned.push(a.join(' ')); };
    let vU; try { const H = hub(d); still(() => H.R.readLayouts()); vU = await stopOf(H); } finally { console.warn = w0; }
    ok(vU === null && warned.some((l) => /owed mark could not be read \(EISDIR\)/.test(l) && /UNKNOWN/.test(l)), '(7) a mark that cannot be READ is «unknown» — said in the journal — and the clean stamp alone is judged: nothing is told, never «may not» by default', J({ vU, warned: warned.filter((l) => /mark/.test(l)) }));
    // r1595 (a): bytes made BEFORE the verdict carry no `unnoted` — when they land (before the verdict, or after it), the KNOWN mark
    // FOLLOWS that landing (its base the file's stamp now) and a kill before the next landing still reads KNOWN; the mark goes only at a
    // landing of bytes made AFTER the verdict. Both roads: the landing first (judged after it), and the round's: made before, landed after
    const lateDesk = () => {   // a writer that holds the DESKTOPS' write until released (the points land as ever)
      const base = landingWriter(); let on = false; const held = [];
      return { ...base,
        hold(x) { on = x; if (!x) for (const [f, o, waits] of held.splice(0)) { base.dirty(f, o); for (const w of waits) w(); } },
        dirty(f, o = {}) { if (on && path.basename(f) === 'layouts.json') { held.push([f, o, []]); return; } return base.dirty(f, o); },
        durable(f, o = {}) { const h = held.find((x) => x[0] === f); return h ? new Promise((r) => h[2].push(() => r(base.durable(f, o)))) : base.durable(f, o); },
        pending: (f) => held.some((x) => x[0] === f) || base.pending(f) };
    };
    const followScene = async (src, road) => {
      const dd = scratch(); await runOne(dd, { owe: true });   // a KNOWN loss waiting in its mark
      const m0 = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8'));
      const LW = lateDesk(), A = hub(dd, src, LW);
      still(() => { A.R.readLayouts(); if (road === 'after') LW.hold(true); A.R.writeLayouts(desk('w3')); A.R.flushLayouts(); });   // bytes made BEFORE the verdict
      const va = await stopOf(A);
      if (road === 'after') still(() => LW.hold(false));   // …landing AFTER it
      await settle(4); await A.R.layoutsMarkSettled();
      const t = fs.readFileSync(path.join(dd, 'layouts.json'), 'utf8'), st = PZ.stampOfRead(JSON.parse(t), t).stamp;
      let mk = null; try { mk = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8')); } catch { }
      const B = hub(dd); still(() => B.R.readLayouts()); const vb = await stopOf(B);   // A was KILLED: no stop flush
      return { va, vb, since0: m0.since, base: mk && mk.base, stamp: st && { run: st.run, seq: st.seq } };
    };
    const followRight = (r) => !!r.va && r.va.kind === 'known' && !!r.vb && r.vb.kind === 'known' && r.vb.since === r.since0 && J(r.base) === J(r.stamp);
    const F1 = await followScene(null, 'first'), F2 = await followScene(null, 'after');
    ok(followRight(F1) && followRight(F2), '(7) + r1595 (a): bytes made BEFORE the verdict — landing before it, or after it — never remove the KNOWN mark: it FOLLOWS that landing (its base the file\'s stamp now) and a kill before the next landing still reads KNOWN, with the loss\'s own moment', J({ F1, F2 }));
    const SF = cut('mark-not-followed', '    if (_oldKnown && _producedSeq <= _judgedSeq && _lastLanded && _lastLanded.run === RUN) {', '    if (false) {');
    const F1x = await followScene(SF, 'first'), F2x = await followScene(SF, 'after');
    ok(!followRight(F1x) && !followRight(F2x) && !!F2x.vb && F2x.vb.kind === 'maynot', 'CONTROL (the mark removed at that landing, in a copy — the line as taken): the kill turns the KNOWN loss into «may not» — red', J({ F1x: F1x.vb, F2x: F2x.vb }));
  }
  // r1798 (1): the PRESS IS TOLD THE TRUTH — a note whose write the storage refused answers `recorded: false`; the loss is told again at
  // the next start with ITS OWN moment (the refused write's episode mark carries it, r1798 (2))
  {
    const pressRefused = async (src) => {
      const dd = scratch(); await runOne(dd, { owe: true });
      const m0 = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8'));
      const A = hub(dd); still(() => A.R.readLayouts()); await stopOf(A); still(() => A.R.flushLayouts({ stop: true }));   // carried; nobody pressed
      await new Promise((r) => setTimeout(r, 5));   // this run's own moment is a later one
      const B = hub(dd, src); still(() => B.R.readLayouts()); await stopOf(B);
      plant(tmpOf(dd, 'layouts.json'));   // the storage refuses the note's write
      const pr = await still(() => B.call('post', '/api/stores/layouts.json/stop-noted', { headers: { 'sec-fetch-site': 'same-origin' } }));
      await B.R.layoutsMarkSettled();
      fs.rmSync(tmpOf(dd, 'layouts.json'), { recursive: true, force: true });
      const C = hub(dd); still(() => C.R.readLayouts());   // B KILLED
      return { body: pr.body, since0: m0.since, vc: await stopOf(C) };
    };
    const PR = await pressRefused(null);
    ok(!!PR.body && PR.body.noted === true && PR.body.recorded === false && !!PR.vc && PR.vc.kind === 'known' && PR.vc.since === PR.since0,
      'r1798 (1): «Understood» whose note the storage refused answers `recorded: false` (the page says so); after a kill the loss is told again with ITS OWN moment', J(PR));
    const PRx = await pressRefused(cut('press-told-noted', "      recorded = !_layoutsRead || !_layoutsCache ? false : await new Promise(", "      recorded = true; await new Promise("));
    ok(!!PRx.body && PRx.body.recorded === true, 'CONTROL (the press always told «noted», in a copy — the line as taken): a note never written is answered as recorded — red', J(PRx.body));
  }
  // r1798 (2): THE OLD LOSS UNDER A NEW EPISODE — this run's own owed mark is written over the last run's KNOWN mark: it CARRIES that
  // loss, so a kill tells the OLD loss with its own moment (never this run's time and cause)
  {
    const overScene = async (src) => {
      const dd = scratch(); await runOne(dd, { owe: true });   // the last run's loss, in its mark
      const m0 = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8'));
      await new Promise((r) => setTimeout(r, 5));
      const C = hub(dd, src); still(() => C.R.readLayouts()); await stopOf(C);   // KNOWN; nothing landed yet
      plant(tmpOf(dd, 'layouts.json'));
      still(() => { C.R.writeLayouts(desk('w5')); C.R.flushLayouts(); }); await C.R.layoutsMarkSettled();   // this run's OWN episode: its mark over the last run's
      fs.rmSync(tmpOf(dd, 'layouts.json'), { recursive: true, force: true });
      let mk = null; try { mk = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8')); } catch { }
      const D = hub(dd); still(() => D.R.readLayouts());   // C KILLED
      return { since0: m0.since, run0: m0.run, mk, vd: await stopOf(D) };
    };
    const OV = await overScene(null);
    ok(!!OV.mk && OV.mk.run !== OV.run0 && !!OV.mk.prior && OV.mk.prior.since === OV.since0 && !!OV.vd && OV.vd.kind === 'known' && OV.vd.since === OV.since0 && OV.vd.cause === 'refused',
      'r1798 (2): this run\'s own owed mark, written over the last run\'s KNOWN one, carries that loss (`prior`) — after a kill the OLD loss is told with its own moment', J(OV));
    const OVx = await overScene(cut('prior-not-carried', 'code: (o && o.code) || null, prior: priorLoss(), written: false', 'code: (o && o.code) || null, written: false'));   // stale-pins: kept (the red control puts the line as taken back)
    ok(!!OVx.vd && OVx.vd.kind === 'known' && OVx.vd.since !== OVx.since0, 'CONTROL (this run\'s mark carrying nothing, in a copy — the line as taken): the old loss is told with THIS run\'s moment — red', J(OVx.vd));
  }
  // r2254 (the round w9i2z96h7's MUST): a press told «could not record it yet» whose note LANDS LATER no longer carries the loss —
  // a second episode of this run, then a kill: the next start tells THIS episode's own moment, never the noted loss's
  {
    const laterLanded = async (src) => {
      const dd = scratch(); await runOne(dd, { owe: true });
      const m0 = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8'));
      const A = hub(dd); still(() => A.R.readLayouts()); await stopOf(A); still(() => A.R.flushLayouts({ stop: true }));   // carried; nobody pressed
      await new Promise((r) => setTimeout(r, 5));
      const C = hub(dd, src); still(() => C.R.readLayouts()); await stopOf(C);
      plant(tmpOf(dd, 'layouts.json'));
      const pr = await still(() => C.call('post', '/api/stores/layouts.json/stop-noted', { headers: { 'sec-fetch-site': 'same-origin' } }));   // refused: not recorded yet
      await C.R.layoutsMarkSettled();
      fs.rmSync(tmpOf(dd, 'layouts.json'), { recursive: true, force: true });
      still(() => { C.R.writeLayouts(desk('w7')); C.R.flushLayouts(); }); await C.R.layoutsMarkSettled();   // the storage is back: the note LANDS
      await new Promise((r) => setTimeout(r, 5));
      plant(tmpOf(dd, 'layouts.json'));
      still(() => { C.R.writeLayouts(desk('w8')); C.R.flushLayouts(); }); await C.R.layoutsMarkSettled();   // a SECOND episode of this run
      fs.rmSync(tmpOf(dd, 'layouts.json'), { recursive: true, force: true });
      let mk = null; try { mk = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8')); } catch { }
      const D = hub(dd); still(() => D.R.readLayouts());   // C KILLED
      return { recorded: pr.body && pr.body.recorded, since0: m0.since, mk, vd: await stopOf(D) };
    };
    const LL = await laterLanded(null);
    ok(LL.recorded === false && !!LL.mk && !LL.mk.prior && !!LL.vd && LL.vd.kind === 'known' && LL.vd.since === LL.mk.since && LL.vd.since !== LL.since0,
      'r2254 (the must): a press told «could not record it yet» whose note LANDS later carries the noted loss no more — this run\'s second episode, then a kill: the next start tells that episode\'s own moment, never the noted loss\'s', J(LL));
    const LLx = await laterLanded(cut('press-never-cleared', '    if (_pressPending && _producedSeq >= _pressSeq) _pressPending = null;\n', ''));
    ok(!!LLx.vd && LLx.vd.since === LLx.since0, 'CONTROL (the pending press never cleared, in a copy — the line as taken): the noted, recorded loss is told again with its old moment — red', J(LLx.vd));
  }
  // r2338 (1), THE EXACT BOUNDARY: the WRITER'S retry lands the press's OWN bytes (their seq EQUAL to the press's; no later flush) —
  // the carried loss is cleared all the same. (The hold's own ladder lands by the same door: its landing runs layoutsLanded with the
  // seq of the bytes it made.)
  {
    const retryWriter = () => {   // the stand-in writer that also writes a refused file AGAIN with the SAME producer (the store writer's backoff)
      const base = landingWriter(), last = new Map();
      return { ...base, dirty(f, o = {}) { last.set(f, o); return base.dirty(f, o); }, retry(f) { const o = last.get(f); if (o) base.dirty(f, o); } };
    };
    const ownBytes = async (src) => {
      const dd = scratch(); await runOne(dd, { owe: true });
      const m0 = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8'));
      const A = hub(dd); still(() => A.R.readLayouts()); await stopOf(A); still(() => A.R.flushLayouts({ stop: true }));   // carried; nobody pressed
      await new Promise((r) => setTimeout(r, 5));
      const RW = retryWriter(), C = hub(dd, src, RW); still(() => C.R.readLayouts()); await stopOf(C);
      plant(tmpOf(dd, 'layouts.json'));
      const pr = await still(() => C.call('post', '/api/stores/layouts.json/stop-noted', { headers: { 'sec-fetch-site': 'same-origin' } }));   // refused: not recorded yet
      await C.R.layoutsMarkSettled();
      fs.rmSync(tmpOf(dd, 'layouts.json'), { recursive: true, force: true });
      still(() => RW.retry(path.join(dd, 'layouts.json'))); await C.R.layoutsMarkSettled();   // the storage is back: the writer writes the press's own bytes again — no new flush
      const t = fs.readFileSync(path.join(dd, 'layouts.json'), 'utf8'), own = PZ.stampOfRead(JSON.parse(t), t).stamp;
      await new Promise((r) => setTimeout(r, 5));
      plant(tmpOf(dd, 'layouts.json'));
      still(() => { C.R.writeLayouts(desk('w8')); C.R.flushLayouts(); }); await C.R.layoutsMarkSettled();   // a SECOND episode of this run
      fs.rmSync(tmpOf(dd, 'layouts.json'), { recursive: true, force: true });
      let mk = null; try { mk = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8')); } catch { }
      const D = hub(dd); still(() => D.R.readLayouts());   // C KILLED
      return { recorded: pr.body && pr.body.recorded, own: own && { seq: own.seq, unnoted: !!own.unnoted }, since0: m0.since, mk, vd: await stopOf(D) };
    };
    const OB = await ownBytes(null);
    ok(OB.recorded === false && !!OB.own && OB.own.seq === 1 && !OB.own.unnoted && !!OB.mk && !OB.mk.prior && !!OB.vd && OB.vd.kind === 'known' && OB.vd.since === OB.mk.since && OB.vd.since !== OB.since0,
      'r2338 (1), THE BOUNDARY: the writer\'s retry lands the press\'s OWN bytes (this run\'s first, seq 1: the press\'s own number; no later flush) and the carried loss is cleared — this run\'s second episode, then a kill: the next start tells that episode\'s own moment, never the noted loss\'s', J(OB));
    const OBx = await ownBytes(cut('press-seq-strict', '    if (_pressPending && _producedSeq >= _pressSeq) _pressPending = null;\n', '    if (_pressPending && _producedSeq > _pressSeq) _pressPending = null;\n'));
    ok(!!OBx.own && OBx.own.seq === 1 && !!OBx.vd && OBx.vd.since === OBx.since0, 'CONTROL (only bytes AFTER the press\'s clear it, in a copy): the press\'s own bytes land and clear nothing — the noted, recorded loss is told again with its old moment — red', J(OBx.vd));
  }
  // r2254 (2): an episode BEGUN BEFORE the verdict learns its prior once the verdict is KNOWN — a kill tells the old loss's moment
  {
    const beganEarly = async (src) => {
      const dd = scratch(); await runOne(dd, { owe: true });
      const m0 = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8'));
      await new Promise((r) => setTimeout(r, 5));
      const C = hub(dd, src);
      plant(tmpOf(dd, 'layouts.json'));
      still(() => { C.R.readLayouts(); C.R.writeLayouts(desk('w4')); C.R.flushLayouts(); });   // refused BEFORE the verdict: this run's own episode, no prior yet
      const vc = await stopOf(C); await C.R.layoutsMarkSettled();
      fs.rmSync(tmpOf(dd, 'layouts.json'), { recursive: true, force: true });
      let mk = null; try { mk = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8')); } catch { }
      const D = hub(dd); still(() => D.R.readLayouts());   // C KILLED
      return { since0: m0.since, vc, mk, vd: await stopOf(D) };
    };
    const BE = await beganEarly(null);
    ok(!!BE.vc && BE.vc.kind === 'known' && !!BE.mk && !!BE.mk.prior && BE.mk.prior.since === BE.since0 && !!BE.vd && BE.vd.kind === 'known' && BE.vd.since === BE.since0,
      'r2254 (2): an episode begun BEFORE the start\'s verdict learns its prior once the verdict is KNOWN (its mark written again) — after a kill the old loss is told with its own moment', J(BE));
    const BEx = await beganEarly(cut('prior-not-learned', "      if (_mark && v && v.kind === 'known' && !_mark.prior) {", "      if (false) {"));
    ok(!!BEx.vd && BEx.vd.since !== BEx.since0, 'CONTROL (the verdict not handed to the running episode, in a copy — the line as taken): the old loss is told with this run\'s moment — red', J(BEx.vd));
  }
  // r2254 (2): an episode ENDED BY NAME (a file appeared where the start found none) puts the last run's followed KNOWN mark back — a kill
  // still tells that loss (removing it with the episode left nothing to tell)
  {
    const endedByName = async (src) => {
      const dd = scratch();
      const B = hub(dd); plant(tmpOf(dd, 'layouts.json'));
      still(() => { B.R.readLayouts(); B.R.writeLayouts(desk('w1')); B.R.flushLayouts(); }); await B.R.layoutsMarkSettled();   // its create refused: a KNOWN loss on no file
      fs.rmSync(tmpOf(dd, 'layouts.json'), { recursive: true, force: true });
      const m0 = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8'));
      const C = hub(dd, src); still(() => C.R.readLayouts()); const vc = await stopOf(C);   // KNOWN: the mark names «no file», and there is none
      plant(tmpOf(dd, 'layouts.json'));
      still(() => { C.R.writeLayouts(desk('w2')); C.R.flushLayouts(); }); await C.R.layoutsMarkSettled();   // this run's own episode, over the followed mark
      fs.rmSync(tmpOf(dd, 'layouts.json'), { recursive: true, force: true });
      fs.writeFileSync(path.join(dd, 'layouts.json'), J(desk('w9')));   // a file APPEARS where the start found none
      still(() => { C.R.writeLayouts(desk('w3')); C.R.flushLayouts(); }); await settle(4); await C.R.layoutsMarkSettled();   // refused by name: the episode ENDS, nothing landed
      let mk = null; try { mk = JSON.parse(fs.readFileSync(path.join(dd, 'layouts.owed.json'), 'utf8')); } catch { }
      const D = hub(dd); still(() => D.R.readLayouts());   // C KILLED
      return { since0: m0.since, run0: m0.run, vc, mk, vd: await stopOf(D) };
    };
    const EN = await endedByName(null);
    ok(!!EN.vc && EN.vc.kind === 'known' && !!EN.mk && EN.mk.run === EN.run0 && !!EN.vd && EN.vd.kind === 'known' && EN.vd.since === EN.since0,
      'r2254 (2): an episode of this run ENDED BY NAME (a file appeared where the start found none) puts the last run\'s KNOWN mark back — after a kill that loss is told with its own moment', J(EN));
    const ENx = await endedByName(cut('ended-by-name-removes', "    if (_oldKnown && !_oldMarkGone && _markJudged) { followOld(_lastLanded ? { run: _lastLanded.run, seq: _lastLanded.seq } : null); return; }\n", ''));
    ok(!(ENx.vd && ENx.vd.kind === 'known' && ENx.vd.since === ENx.since0), 'CONTROL (the episode\'s end removing the mark, in a copy — the line as taken): nothing is told of the last run\'s loss after the kill — red', J(ENx.vd));
  }
  // r1595 (b): «Understood» asks a flush — a kill right after the press never tells the noted loss again
  {
    const pk = async (src) => {
      const dd = scratch(); await runOne(dd, { owe: true });
      const A = hub(dd); still(() => A.R.readLayouts()); await stopOf(A); still(() => A.R.flushLayouts({ stop: true }));   // carried; nobody pressed
      const B = hub(dd, src); still(() => B.R.readLayouts()); const vb = await stopOf(B);
      const pr = await still(() => B.call('post', '/api/stores/layouts.json/stop-noted', { headers: { 'sec-fetch-site': 'same-origin' } }));
      await settle(2); await B.R.layoutsMarkSettled();   // B is KILLED here: no stop flush
      const C = hub(dd); still(() => C.R.readLayouts());
      return { vb, noted: pr.body && pr.body.noted, vc: await stopOf(C) };
    };
    const P1 = await pk(null);
    ok(!!P1.vb && P1.vb.kind === 'known' && P1.noted === true && !(P1.vc && P1.vc.kind === 'known'), 'r1595 (b): «Understood» asks a flush — a kill right after the press does not tell the noted loss again (the kill itself is told as one, «may not»)', J(P1));
    const P1x = await pk(cut('press-no-flush', 'try { flushLayouts({ press: true }, (ok) => resolve(ok === true)); }', 'try { resolve(true); }'));
    ok(!!P1x.vc && P1x.vc.kind === 'known', 'CONTROL (the press writes nothing, in a copy — the line as taken): the noted loss is told again after the kill — red', J(P1x.vc));
  }
  // the import's stamp: a layout that arrives WITH a stamp (an import of a file that held one) is written with THIS hub's stamp only
  {
    const d = scratch(); const H = hub(d);
    still(() => { H.R.readLayouts(); H.R.writeLayouts({ ...desk('w1'), [PZ.STAMP]: { run: 'foreign', seq: 99, at: 1, stop: true, sum: 'x' } }); H.R.flushLayouts(); });
    const t = fs.readFileSync(path.join(d, 'layouts.json'), 'utf8'), st = PZ.stampOfRead(JSON.parse(t), t);
    ok(t.split(`"${PZ.STAMP}"`).length === 2 && st.trusted && st.stamp.run !== 'foreign' && !(PZ.STAMP in H.R.readLayouts()), 'writeLayouts strips an incoming stamp (an import): the file carries this hub\'s ONE stamp, trusted; the value in memory none', J(st));
  }
  // (2) LATE, THEN REFUSED: the pages learn the new state (code and count), once a change — and two points in one episode
  {
    const d = scratch(), SW = stallWriter(), H = hub(d, null, SW);
    still(() => { H.R.readLayouts(); H.R.writeLayouts(desk('w1')); H.R.flushLayouts(); });
    SW.stall(true);
    still(() => { H.R.writeLayouts(desk('w1', 'w2')); H.R.flushLayouts(); }); await settle(4);
    const late = H.said('store-unsaved').filter((w) => w.file === 'layout-history').slice(-1)[0];
    SW.refuseHeld();   // the storage now REFUSES the late point
    await settle(4);
    still(() => { H.R.writeLayouts(desk('w1', 'w2', 'w3')); H.R.flushLayouts(); }); await settle(4);   // a second point, refused too
    const words = H.said('store-unsaved').filter((w) => w.file === 'layout-history');
    const last = words.slice(-1)[0];
    ok(!!late && late.code === 'queued' && !!last && last.code !== 'queued' && last.lost === 2 && words.length <= 3 && /the points made meanwhile are lost\. 2 rollback points were lost\./.test(U.storeUnsavedWords(last)),
      '(2) a point that goes LATE and is then REFUSED: the pages are TOLD the new state (refused, lost) — and a second refused point in the same episode raises the count told (2) — coalesced, never a word per change of nothing', J({ late, last, n: words.length }));
  }
  // (8) THE PAGE HALF: the strip's model for the stop, the quiet mode, the points' sentences — and the presses
  {
    const KNOWN = { file: 'layouts.json', kind: 'known', since: Date.UTC(2026, 10, 21, 10, 0), savedAt: 1, cause: 'refused' }, MAYNOT = { file: 'layouts.json', kind: 'maynot', savedAt: Date.UTC(2026, 10, 21, 9, 0) };
    const mK = SH.stripModel([], { stop: KNOWN }), mL = SH.stripModel([], { stop: { ...KNOWN, cause: 'late' } }), mM = SH.stripModel([], { stop: MAYNOT }), mMU = SH.stripModel([], { stop: MAYNOT, unsaved: [{ file: 'bookmarks.json', code: 'EIO', since: 1 }] });
    const pR1 = U.storeUnsavedWords({ file: 'layout-history', code: 'EIO', lost: 1 }), pR4 = U.storeUnsavedWords({ file: 'layout-history', code: 'EIO', lost: 4 }), pQ = U.storeUnsavedWords({ file: 'layout-history', code: 'queued', lost: 0 });
    ok(mK.stopKind === 'known' && !mK.quiet && /storage refused the write/.test(mK.stopText) && /Restore a previous layout…/.test(mK.stopText)
      && /had not reached the disk in time/.test(mL.stopText) && mM.stopKind === 'maynot' && mM.quiet === true && /may not have been saved/.test(mM.stopText) && mMU.quiet === false && SH.stripModel([], {}) === null
      && /lost\.$/.test(pR1) && !/rollback points were lost/.test(pR1) && /4 rollback points were lost\./.test(pR4) && /not saved yet: the storage has not taken the write in time\.$/.test(pQ)
      && ![pR1, pR4, pQ].some((x) => /themselves are saved|without waiting/.test(x)),   // stale-pins: kept (a deliberate absence check: no sentence says the desktops are saved)
      '(8) THE STRIP\'S MODEL: KNOWN (refused or late, its own words, WHERE the layouts are), «may not» QUIET when alone and not when another store is unsaved, nothing when nothing; the points\' sentences (refused, lost N, late) — none says the desktops are saved (r1387 (4))', J({ mK: mK.stopText, mL: mL.stopText, mM: mM.stopText, pR4, pQ }));
    // the presses, on a stand-in DOM just wide enough for the strip: «Understood» notes it (POST, then the strip goes), the rollback door opens
    const D0 = globalThis.document, posts = []; let opened = 0, strip = null;
    const mk = () => { const e = { style: {}, dataset: {}, children: [], className: '', textContent: '', classList: { toggle() { }, add() { }, remove() { } }, setAttribute() { }, append(...c) { e.children.push(...c); }, replaceChildren(...c) { e.children = c; }, remove() { e.removed = true; if (strip === e) strip = null; } }; Object.defineProperty(e, 'innerHTML', { set() { }, get: () => '' }); return e; };
    const wrap = mk(); wrap.insertBefore = (x) => { strip = x; };
    globalThis.document = { ...D0, createElement: () => mk(), getElementById: (id) => (id === 'main-wrapper' ? wrap : id === 'store-held-strip' ? strip : null) };
    const R0 = ROUTE; ROUTE = (url, o) => { posts.push([url, o && o.method]); return answer(200, { success: true, noted: true }); };
    try {
      SH.setStoreDoors({ rollback: () => { opened++; } });
      SH.noteStoreStop(KNOWN);
      const btns = (strip ? strip.children : []).flatMap((x) => x.children || []).filter((b) => typeof b.onclick === 'function');
      const under = btns.find((b) => /shs-stop-noted/.test(b.className)), roll = btns.find((b) => /shs-stop-rollback/.test(b.className));
      roll && roll.onclick();
      under && await under.onclick(); await settle(4);
      ok(!!under && under.textContent === 'Understood' && !!roll && opened === 1 && posts.some(([u, m]) => u === '/api/stores/layouts.json/stop-noted' && m === 'POST') && (strip === null || strip.dataset.stop === ''),
        '(8) THE PRESSES: «Understood» POSTs the person\'s note (stop-noted) and the strip goes; «Restore a previous layout…» opens the rollback dialog — where the earlier layouts are', J({ posts, opened, left: !!strip }));
      const NOOVER = await esmCopy('src/lib/store-held.js', anchored(read('src/lib/store-held.js'), '  if (r && r.success) {\n    noteStoreStopOver();\n', '  if (r && r.success) {\n    /* MUTANT: the press never ends the notice */\n', 'stop-press-over-cut'), 'stop-press-over-cut');
      NOOVER.setStoreDoors({}); NOOVER.noteStoreStop(KNOWN);
      const b2 = (strip ? strip.children : []).flatMap((x) => x.children || []).find((b) => /shs-stop-noted/.test(b.className || ''));
      b2 && await b2.onclick(); await settle(4);
      ok(!!strip && strip.dataset.stop === 'known', 'CONTROL (the press never ends the notice, in a copy): the strip stays after «Understood» — red');
      strip = null;
      // r1798 (1): the reply says the note could NOT be written yet ⇒ the page says so (the loss is told again at the next start)
      const SAYS = 'Noted here, but VibeSpace could not record it yet: the storage did not take the write. It is recorded once the storage takes it; until then the next start tells it again.';
      const pressUnrecorded = async (M) => {
        ROUTE = () => answer(200, { success: true, noted: true, recorded: false });
        M.setStoreDoors({}); M.noteStoreStop(KNOWN); const n0 = toasts().length;
        const b = (strip ? strip.children : []).flatMap((x) => x.children || []).find((x) => /shs-stop-noted/.test(x.className || ''));
        // the PRESS runs on the suite's own document (D0 — the toast stack's stand-in every other toast of this suite uses): the strip's
        // stand-in draws the strip only, and the toast the reply asks needs a stack
        const DS = globalThis.document; globalThis.document = D0;
        try { b && await b.onclick(); await settle(4); } finally { globalThis.document = DS; }
        strip = null;
        return added(n0);
      };
      const said3 = await pressUnrecorded(SH);
      ok(said3.includes(SAYS), 'r1798 (1): a press whose note the storage did not take is TOLD so on the page — never «noted» alone', J(said3));
      const MUTE = await esmCopy('src/lib/store-held.js', anchored(read('src/lib/store-held.js'), "    if (r.recorded === false) showToast(", '    if (false) showToast(', 'press-unrecorded-unsaid'), 'press-unrecorded-unsaid');
      const said3x = await pressUnrecorded(MUTE);
      ok(!said3x.includes(SAYS), 'CONTROL (the reply\'s `recorded` unheard, in a copy — the line as taken): the press says nothing of a note never written — red', J(said3x));
    } finally { ROUTE = R0; globalThis.document = D0; SH.setStoreDoors({}); }
    const QUIET = await esmCopy('src/lib/store-held.js', anchored(read('src/lib/store-held.js'), "  const quiet = !!st && st.kind === 'maynot' && !held.length && !unsaved.length && sc !== 'lifted' && sc !== 'held';", '  const quiet = false;', 'quiet-cut'), 'quiet-cut');
    ok(QUIET.stripModel([], { stop: MAYNOT }).quiet === false, 'CONTROL (no quiet mode, in a copy): a lone «may not» is drawn as an alert — red');
    const CAUSE = await esmCopy('src/lib/utils.js', anchored(read('src/lib/utils.js'), "    const late = fact.cause === 'late';", '    const late = false;', 'cause-cut'), 'cause-cut');
    ok(/storage refused the write/.test(CAUSE.storeStopWords({ kind: 'known', cause: 'late' }, '')), 'CONTROL (the cause ignored, in a copy): a write only late is told «refused» — red');
  }
}

// ── §10 r5185 (lane hub-loop-stalls, row B-574d — THE SETTINGS DOOR's SYNC, the coordinator's ruling r5185) ── the store hold's
// direct write door (src/store-hold.js write: EVERY write of the settings store — it has no store writer) SYNCS its temp once
// before the name moves: a person's press and the rare roads (a store's first, exclusive create; the start read's own rewrite; the
// ladder's retry). ONE road keeps the release's unsynced write: a MACHINE caller's config call (a bearer on POST
// /api/plugins/:id/config — that route cut VERBATIM from src/server/mounts-plugins-wiring.js). A failed sync is a FAILED WRITE
// (thrown by its code, the temp removed, the old file stands); a sync the file system does not do at all is said ONCE and the
// name moves. Over the REAL persistence router in scratch data folders; the file calls WITNESSED in order by a tap on the scene's
// own folder (a sync's failure PLACED there — never a real storage made to fail). REDs (anchored, in a copy): the release's
// unsynced door; the route without its machine scope.
console.log('§10 r5185 the settings door syncs a person\'s save before its name moves; a failed sync is a failed write; a machine caller\'s config call makes no sync');
{
  const PREL = 'src/routes/persistence.js', SHREL = 'src/store-hold.js', SHSRC = read(SHREL), SHP = require.resolve(path.join(REPO, SHREL));
  const root10 = scratchDir('store-held-page-r5185'); roots.push(root10);
  let n10 = 0;
  const OLD = JSON.stringify({ 'r5185.kept': 'the old bytes' }, null, 2);
  const dir10 = (bytes) => { const d = path.join(root10, String(++n10)); fs.mkdirSync(d, { recursive: true }); if (bytes !== undefined) fs.writeFileSync(path.join(d, 'settings.json'), bytes); return d; };
  /** the REAL persistence router, a fresh copy of the module over `dir` (the store hold in its require cache: the real one, or a
   *  copy a RED places there) */
  const hub10 = (dir) => {
    for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k];
    const P = require(path.join(REPO, PREL));
    const words = [];
    const client = { readyState: 1, send: (j) => { try { words.push(JSON.parse(j)); } catch { } } };
    P.setup({ writer: landingWriter(), dataDir: dir, wss: { clients: new Set([client]) }, WS_OPEN: 1, getSyncStore: () => null, activeSessions: new Map(), auth: null, getHosts: () => [], getMounts: () => [], getTasks: () => null, getAccounts: () => null, getUsageHistory: () => null, onSettingsWrite: () => { } });
    const handler = (method, p) => P.router.stack.find((x) => x.route && x.route.path === p && x.route.methods[method]).route.stack[0].handle;
    const call = async (method, p, { headers = {}, body = {} } = {}) => { let status = 200, o = null; const res = { status(c) { status = c; return res; }, json(x) { o = x; return res; }, set() { return res; }, setHeader() { } }; await handler(method, p)({ body, query: {}, params: {}, headers }, res, () => { status = 500; }); return { status, body: o }; };
    return { R: P.router, words, call };
  };
  /** the file calls under `dir`, in order, by file name; `fail.sync`: a code every sync of a file there throws (PLACED) */
  const tap = (dir) => {
    const ev = [], fds = new Map(), saved = {}, fail = { sync: null };
    const mine = (p) => typeof p === 'string' && p.startsWith(dir + path.sep);
    const wrap = (k, f) => { saved[k] = fs[k]; fs[k] = f(saved[k]); };
    wrap('openSync', (o) => function (p, ...a) { const fd = o.call(this, p, ...a); if (mine(p)) { fds.set(fd, path.basename(p)); ev.push(`open ${path.basename(p)}`); } return fd; });
    wrap('writeSync', (o) => function (fd, ...a) { const n = o.call(this, fd, ...a); if (fds.has(fd)) ev.push(`write ${fds.get(fd)}`); return n; });
    wrap('fsyncSync', (o) => function (fd, ...a) { if (fds.has(fd)) { ev.push(`sync ${fds.get(fd)}`); if (fail.sync) throw Object.assign(new Error(`${fail.sync}: a sync PLACED to fail (§10)`), { code: fail.sync, syscall: 'fsync' }); } return o.call(this, fd, ...a); });
    wrap('closeSync', (o) => function (fd, ...a) { if (fds.has(fd)) { ev.push(`close ${fds.get(fd)}`); fds.delete(fd); } return o.call(this, fd, ...a); });
    wrap('renameSync', (o) => function (a, b, ...r) { if (mine(a)) ev.push(`rename ${path.basename(a)} ${path.basename(b)}`); return o.call(this, a, b, ...r); });
    wrap('linkSync', (o) => function (a, b, ...r) { if (mine(a)) ev.push(`link ${path.basename(a)} ${path.basename(b)}`); return o.call(this, a, b, ...r); });
    wrap('writeFileSync', (o) => function (p, ...a) { if (mine(p)) ev.push(`writeFile ${path.basename(p)}`); return o.call(this, p, ...a); });
    wrap('unlinkSync', (o) => function (p, ...a) { if (mine(p)) ev.push(`unlink ${path.basename(p)}`); return o.call(this, p, ...a); });
    return { ev, fail, off: () => { for (const [k, f] of Object.entries(saved)) fs[k] = f; } };
  };
  /** run `fn` with the folder's calls tapped (`sync`: the placed failure) → { ev: the settings file's calls, r: fn's answer, thrown } */
  const tapped = async (dir, fn, sync = null) => {
    const t = tap(dir); t.fail.sync = sync;
    let r, thrown = null;
    try { r = await fn(); } catch (e) { thrown = e; } finally { t.off(); }
    return { ev: t.ev.filter((e) => / settings\.json/.test(e)), r, thrown };
  };
  const TMP = `settings.json.${process.pid}.tmp`;
  const syncs = (ev) => ev.filter((e) => e.startsWith('sync ')).length;
  /** the order the law asks: the temp written whole, SYNCED once, closed, THEN its name moves (`move`: rename, or link at a first create) */
  const syncedBefore = (ev, move) => { const s = ev.indexOf(`sync ${TMP}`), c = ev.indexOf(`close ${TMP}`), m = ev.findIndex((e) => e.startsWith(`${move} ${TMP} settings.json`)); return syncs(ev) === 1 && s > ev.lastIndexOf(`write ${TMP}`) && ev.lastIndexOf(`write ${TMP}`) > ev.indexOf(`open ${TMP}`) && ev.indexOf(`open ${TMP}`) >= 0 && c > s && m > c; };
  const unsyncedMoves = (ev) => syncs(ev) === 0 && ev.some((e) => e.startsWith(`rename ${TMP} settings.json`));
  const onDisk = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'settings.json'), 'utf8')); } catch { return null; } };
  const tmpLeft = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.tmp'));
  const PERSON = { 'sec-fetch-site': 'same-origin' };
  const press = (H, row) => () => H.call('patch', '/api/settings', { headers: PERSON, body: { 'r5185.row': row } });

  // (a) A PERSON's PRESS over a file the start read: synced before the rename; (b) A FIRST CREATE (the store read NOT THERE: the
  // exclusive link): synced before the link
  const dA = dir10(OLD), A = hub10(dA);
  await A.call('get', '/api/settings');
  const a = await tapped(dA, press(A, 'a person'));
  const dB = dir10(), B = hub10(dB);
  await B.call('get', '/api/settings');
  const b = await tapped(dB, press(B, 'the first'));
  ok(!a.thrown && a.r.status === 200 && a.r.body && a.r.body.success === true && syncedBefore(a.ev, 'rename') && onDisk(dA)?.['r5185.row'] === 'a person' && onDisk(dA)?.['r5185.kept'] === 'the old bytes' && tmpLeft(dA).length === 0
    && !b.thrown && b.r.status === 200 && syncedBefore(b.ev, 'link') && onDisk(dB)?.['r5185.row'] === 'the first' && tmpLeft(dB).length === 0,
    'r5185 (a) a PERSON\'s save (PATCH /api/settings): its temp written whole, SYNCED once, closed, THEN renamed over settings.json — the new row and the old ones on disk, no temp left; (b) a FIRST create (no settings.json at the start): synced before its exclusive link', J({ a: a.ev, b: b.ev, ta: a.thrown && a.thrown.message, tb: b.thrown && b.thrown.message }));

  // (c) A MACHINE CALLER's CONFIG CALL (router.asMachineCall): no sync — at once, and across an await (the scope rides the call);
  // the person's next press is synced again (the scope never outlives its call)
  const c = await tapped(dA, async () => { A.R.asMachineCall(() => A.R.patchSettings({ 'r5185.row': 'a machine' })); await A.R.asMachineCall(async () => { await settle(2); A.R.patchSettings({ 'r5185.late': 'after an await' }); }); });
  const c2 = await tapped(dA, press(A, 'a person again'));
  ok(!c.thrown && syncs(c.ev) === 0 && c.ev.filter((e) => e.startsWith(`rename ${TMP} settings.json`)).length === 2 && onDisk(dA)?.['r5185.late'] === 'after an await' && !c2.thrown && syncedBefore(c2.ev, 'rename') && onDisk(dA)?.['r5185.row'] === 'a person again',
    'r5185 (c) a MACHINE caller\'s config call (persistence\'s asMachineCall) keeps the release\'s write: NO sync, twice (one across an await — the scope rides the call), both landed; the person\'s next save is synced again (the scope never outlives its call)', J({ c: c.ev, c2: c2.ev, t: c.thrown && c.thrown.message }));

  // (d) THE ROUTE (POST /api/plugins/:id/config, cut VERBATIM from src/server/mounts-plugins-wiring.js; the plugin manager a stand-in
  // whose setConfig ends where the real one does — the router's patchSettings, through the plugin's own settings rows): a BEARER
  // (src/write-origin.js pressBearer) makes no sync; a person's press on the plugin's own page syncs. RED: the route without its scope
  const WIR = read('src/server/mounts-plugins-wiring.js'), HEAD = "app.post('/api/plugins/:id/config', ";
  const r0 = WIR.indexOf(HEAD), r1 = r0 < 0 ? -1 : WIR.indexOf('\n});\n', r0);
  const ROUTE = r0 >= 0 && r1 > r0 ? WIR.slice(r0 + HEAD.length, r1 + 2) : '';
  const wireRequire = createRequire(path.join(REPO, 'src/server/mounts-plugins-wiring.js'));
  const routeOf = (text, H) => new Function('require', 'plugins', 'persistenceRouter', `return (${text});`)(wireRequire, { setConfig: (id, patch) => { H.R.patchSettings({ [`plugin.${id}.r5185`]: patch.r5185 }); return { ok: true }; } }, H.R);
  const post = (fn, headers, v) => () => { let status = 200, o = null; const res = { status(x) { status = x; return res; }, json(x) { o = x; return res; } }; fn({ params: { id: 'frp' }, body: { r5185: v }, headers }, res); return { status, body: o }; };
  const BEARER = { authorization: 'Bearer vsst_r5185-a-job' };
  const ROUTE_SCOPE = "res.json(require('../write-origin.js').pressBearer(req.headers) && typeof persistenceRouter.asMachineCall === 'function' ? persistenceRouter.asMachineCall(call) : call())";
  ok(ROUTE.startsWith('(req, res) => {') && ROUTE.endsWith('}') && ROUTE.split(ROUTE_SCOPE).length === 2 && WIR.split('asMachineCall(').length === 2, 'control setup: the config route is cut whole from src/server/mounts-plugins-wiring.js, its machine scope found once (the file\'s one asMachineCall)', ROUTE.slice(0, 120));
  const route = routeOf(ROUTE, A);
  const dM = await tapped(dA, post(route, BEARER, 'a bearer'));
  const dP = await tapped(dA, post(route, PERSON, 'a press'));
  ok(!dM.thrown && dM.r.status === 200 && unsyncedMoves(dM.ev) && onDisk(dA)?.['plugin.frp.r5185'] === 'a press' && !dP.thrown && dP.r.status === 200 && syncedBefore(dP.ev, 'rename'),
    'r5185 (d) POST /api/plugins/:id/config (the route as written): a BEARER\'s config call lands UNSYNCED (the one road the ruling leaves); a person\'s press on the plugin\'s own page is synced before its rename', J({ bearer: dM.ev, person: dP.ev, t: (dM.thrown || dP.thrown || {}).message }));
  const routeX = routeOf(anchored(ROUTE, ROUTE_SCOPE, 'res.json(call() /* MUTANT: no machine scope */)', 'r5185-no-scope'), A);
  const dX = await tapped(dA, post(routeX, BEARER, 'a bearer, unscoped'));
  ok(!dX.thrown && syncs(dX.ev) === 1 && !unsyncedMoves(dX.ev), 'CONTROL (the route without its machine scope, in a copy): a bearer\'s config call is synced like a press — red', J(dX.ev));

  // (e) A FAILED SYNC IS A FAILED WRITE: the press throws by its code, nothing renamed, the temp removed, the old bytes stand, no page
  // told the change; (f) A SYNC THIS FILE SYSTEM DOES NOT DO (EINVAL): the write lands, said ONCE for the store (two writes)
  const dE = dir10(OLD), E = hub10(dE);
  await E.call('get', '/api/settings');
  const e = await tapped(dE, press(E, 'never landed'), 'EIO');
  ok(!!e.thrown && e.thrown.code === 'EIO' && e.thrown.syscall === 'fsync' && e.ev.includes(`sync ${TMP}`) && !e.ev.some((x) => /^(rename|link) /.test(x)) && e.ev.includes(`unlink ${TMP}`) && tmpLeft(dE).length === 0
    && fs.readFileSync(path.join(dE, 'settings.json'), 'utf8') === OLD && !E.words.some((w) => w.type === 'settings-updated'),
    'r5185 (e) a sync that FAILS (EIO, placed) is a FAILED WRITE: the save throws by its code, nothing renamed, the temp removed, settings.json\'s old bytes stand, no page told a change', J({ ev: e.ev, t: e.thrown && { code: e.thrown.code, syscall: e.thrown.syscall }, left: tmpLeft(dE) }));
  const dF = dir10(OLD), F = hub10(dF);
  await F.call('get', '/api/settings');
  const warned = [], W0 = console.warn;
  let f1, f2;
  console.warn = (...x) => { const s = x.map(String).join(' '); if (/does not do a sync/.test(s)) warned.push(s); else W0(...x); };
  try { f1 = await tapped(dF, press(F, 'unsynced one'), 'EINVAL'); f2 = await tapped(dF, press(F, 'unsynced two'), 'EINVAL'); } finally { console.warn = W0; }
  ok(!f1.thrown && !f2.thrown && [f1, f2].every((x) => x.ev.indexOf(`sync ${TMP}`) >= 0 && x.ev.findIndex((y) => y.startsWith(`rename ${TMP} settings.json`)) > x.ev.indexOf(`sync ${TMP}`)) && onDisk(dF)?.['r5185.row'] === 'unsynced two'
    && warned.length === 1 && /settings\.json: its file system does not do a sync \(EINVAL\)/.test(warned[0]),
    'r5185 (f) a sync the file system does not do (EINVAL — src/fd-close.js SYNC_UNSUPPORTED): both writes land, said ONCE for the store, by the hub\'s one sentence', J({ warned, f1: f1 && f1.ev, t: ((f1 && f1.thrown) || (f2 && f2.thrown) || {}).message }));

  // RED: THE RELEASE's DOOR (the store hold, in a copy placed in its require cache): a person's save renames an UNSYNCED temp
  const DOOR_A = /^ {4}let fd = fs\.openSync\(tmp, 'w'\), failed = null;\n[\s\S]*?^ {4}if \(failed\) \{[^\n]*\n/m;
  const holdX = M.load(SHREL, anchored(SHSRC, DOOR_A, "    for (let i = 0; i < parts.length; i++) fs.writeFileSync(tmp, parts[i], { flag: i ? 'a' : 'w' });   /* MUTANT: the release's door, unsynced */\n", 'r5185-release-door'), 'r5185-release-door');
  const savedHold = require.cache[SHP];
  let x;
  try {
    require.cache[SHP] = { id: SHP, filename: SHP, loaded: true, exports: holdX, children: [], paths: [] };
    const dX2 = dir10(OLD), X = hub10(dX2);
    await X.call('get', '/api/settings');
    x = await tapped(dX2, press(X, 'the release'));
  } finally { if (savedHold) require.cache[SHP] = savedHold; else delete require.cache[SHP]; for (const k of Object.keys(require.cache)) if (k.endsWith(path.join('src', 'routes', 'persistence.js'))) delete require.cache[k]; }
  ok(!!x && !x.thrown && syncs(x.ev) === 0 && x.ev.some((y) => y.startsWith(`rename ${TMP} settings.json`)) && !syncedBefore(x.ev, 'rename'), 'CONTROL (the release\'s door, the store hold in a copy): a person\'s save renames an UNSYNCED temp over settings.json — red', J(x && x.ev));
  // the one road, by text: the settings store's ONE write asks its sync by the scope, and no other write of the hold passes a choice
  const PSRC10 = read(PREL);
  ok(PSRC10.split('settingsHold.write(').length === 2 && PSRC10.includes("settingsHold.write(data, undefined, { sync: MACHINE_CALL.getStore() !== true });") && PSRC10.split('{ sync: ').length === 2
    && /function write\(next, bytes, \{ sync = true \} = \{\}\)/.test(SHSRC) && SHSRC.split('write(next, bytes)').length === 2 && SHSRC.split('write(made[0], made[1])').length === 2,
    'r5185 the one road, by text: the settings store\'s ONE write asks for its sync by the machine scope; the hold\'s door syncs by DEFAULT, and its own roads (the ladder\'s retry, the flush) pass no choice');
}

report();
