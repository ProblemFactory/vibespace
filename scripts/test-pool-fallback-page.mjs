#!/usr/bin/env node
// THE FALLBACK MEMBER's PAGE (row B-d578 unit F3b, lane lg-providers — 主开发 r3316): the «When every member is out» section of
// «Members & placement…» and the pool row's fallback counts with its ONE press. The REAL src/lib/manage-agents.js builders (a
// stand-in document, as test-manage-agents), the real AccountManager, the real roster rows — made-up pools and providers only.
//   ① the section: «Ask me first» is the DEFAULT; «Move without asking» says the BILL (continues there, billed there); a Codex pool
//     says its sentence and lists nothing; three providers, one with no stored key worded beside it — never a greyed control;
//     the bound said; the providers that fit Claude only, once each
//   ② the row: the counts → «3 conversations run on Router» + the ONE press only when some can come back; «waiting their turn»
//   ③ the counts ride the accounts list (the pool row) and a change TELLS the clients without moving the tails generation
//   ④ the roster rows say WHY a provider cannot start (the vault locked / no key) — the list's word
//   ⑤ the wiring: the switch and the list ride the dialog's ONE save (Claude only); the ninth refused in words; the press is a
//     person's (the tree's one verdict) and its reply says QUEUED and how many — and how many could not (no first model)
//   ⑥ (F3b's cure, round w65f93fa5 / r3886) THE SAVE SENDS WHAT THE PERSON CHANGED (a members-only save carries neither the switch
//     nor the list); a provider ON the list that the store does not know now is LISTED with its word and kept by a save; while the
//     store is held the section says ITS words; the press's words (idle / busy, already on their way, «nothing» only alone), held in flight
//   ⑦ THE HUB's OWN LAWS: a CHANGE of the list refused BY NAME while the provider store cannot be read (the prune's fact); a listed id
//     the store does not know is kept, a new unknown one refused; the PATCH's two spend fields and the press are a PERSON's — by
//     REQUESTS carrying a bearer, through the real routes; a change saved on one page rides the push another page draws
//   RED COPIES — each LOADED and its leg RUN on it: the bill's words cut; the press always offered; the save that re-sends both;
//     the listed provider dropped; the «already» line cut; the hub's refusal cut; the kept listed id refused; the PATCH's verdict cut.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
import { pathToFileURL } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
const el = (tag) => ({ tagName: tag, className: '', style: {}, innerHTML: '', textContent: '', title: '', children: [], isConnected: true, onclick: null,
  append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; }, querySelector() { return { querySelectorAll: () => [] }; }, querySelectorAll() { return []; } });
globalThis.document = { createElement: el, querySelectorAll: () => [], querySelector: () => null, addEventListener() { }, removeEventListener() { }, body: el('body'), documentElement: el('html') };   // the page module wires a listener at its import
globalThis.window = globalThis.window || { addEventListener() { }, removeEventListener() { }, innerWidth: 1280, innerHeight: 900 };   // utils' instant tooltip binds at load (the train's utils.js)
const MA = await import(path.join(REPO, 'src/lib/manage-agents.js'));
const T = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : String(s));
const ESC = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ROWS = [
  { id: 'pv-demo-router', name: 'Router', type: 'provider', backend: 'claude', loggedIn: true },
  { id: 'pv-demo-router', name: 'Router', type: 'provider', backend: 'codex', loggedIn: true },   // the same provider's codex row: listed once, for Claude
  { id: 'pv-demo-deep', name: 'DeepThink', type: 'provider', backend: 'claude', loggedIn: true },
  { id: 'pv-demo-local', name: 'Local Gateway', type: 'provider', backend: 'claude', loggedIn: false, notReady: 'no-key' },
  { id: 'pv-demo-codexonly', name: 'Codex Only', type: 'provider', backend: 'codex', loggedIn: true },
];

console.log('— ① the section');
{
  const choices = MA.fallbackChoices(ROWS, 'claude');
  ok(choices.length === 3 && choices.map((c) => c.id).join() === 'pv-demo-router,pv-demo-deep,pv-demo-local' && choices[2].ready === false && choices[2].notReady === 'no-key',
    '① the list offers the providers that FIT Claude, each once (a provider\'s codex row and a codex-only provider are not offered)', choices);
  const never = MA.fallbackSectionHtml({ cross: 'never', picked: ['pv-demo-router'], choices }, T, ESC);
  const allow = MA.fallbackSectionHtml({ cross: 'allow', picked: ['pv-demo-router', 'pv-demo-local'], choices }, T, ESC);
  const codex = MA.fallbackSectionHtml({ codex: true, choices }, T, ESC);
  ok(/value="never" checked/.test(never) && !/value="allow" checked/.test(never) && /asks you in For you before a conversation moves/.test(never),
    '① «Ask me first» is the default and says the pool asks in For you first');
  ok(/value="allow" checked/.test(allow) && /continues there and is BILLED THERE, on that provider's own bill, not on this pool's subscriptions/.test(allow.replace(/&#39;|'/g, "'")),
    '① «Move without asking» says the BILL in plain words: the conversation continues on that provider and is billed THERE, on its own bill');
  ok((never.match(/class="pool-fb-row"/g) || []).length === 3 && /No key is stored for this provider — add it in the account dialog first/.test(never) && !/disabled/.test(never + allow)
    && /data-id="pv-demo-router" checked/.test(never) && /At most 8 fallback providers/.test(never),
    '① three providers, the one with no stored key worded beside its row — no control greyed (none disabled); the picked one checked; the bound said (8)');
  ok(/Fallback providers are for Claude pools/.test(codex) && !/pool-fb-row/.test(codex) && !/pool-fb-mode/.test(codex), '① a ChatGPT pool says its sentence and lists nothing (no switch, no rows)');
  ok(MA.fallbackNotReadyWords('vault-locked', T) === 'The vault is locked — this provider can take conversations once you unlock it' && MA.fallbackNotReadyWords(null, T) === null,
    '① the vault locked has its own word; a ready provider wears none');
}

console.log('— ② the pool row');
{
  const lines = MA.fallbackStatusLines([{ provider: 'pv-demo-router', label: 'Router', running: 3, canReturn: 2, waiting: 0 }], T);
  const one = MA.fallbackStatusLines([{ provider: 'pv-demo-router', label: 'Router', running: 1, canReturn: 0, waiting: 26 }], T);
  const rowBack = MA.fallbackRowHtml({ id: 'pool-demo', fallbackStatus: [{ provider: 'pv-demo-router', label: 'Router', running: 3, canReturn: 2, waiting: 0 }] }, T, ESC);
  const rowNone = MA.fallbackRowHtml({ id: 'pool-demo', fallbackStatus: [{ provider: 'pv-demo-router', label: 'Router', running: 1, canReturn: 0, waiting: 26 }] }, T, ESC);
  ok(lines.length === 1 && lines[0].text === '3 conversations run on Router' && lines[0].back === true && one.map((l) => l.text).join(' | ') === '1 conversation runs on Router | Router: 26 waiting their turn' && one.every((l) => !l.back),
    '② the counts in words: «3 conversations run on Router» (a singular for one), «Router: 26 waiting their turn»', { lines, one });
  ok(/Move them back/.test(rowBack) && /data-pool="pool-demo"/.test(rowBack) && !/Move them back/.test(rowNone) && /26 waiting their turn/.test(rowNone) && MA.fallbackRowHtml({ id: 'p', fallbackStatus: null }, T, ESC) === '',
    '② the ONE press is offered only when some can come back; a row with no counts draws nothing');
}

{
  const why = MA.fallbackStatusLines([{ provider: 'pv-demo-router', label: 'Router', running: 4, canReturn: 0, waiting: 0, lapsed: 2, familyUnknown: 1, noModel: 1 }], T).map((l) => l.text);
  ok(why.includes("2 cannot come back yet: the pool's default member has lapsed") && why.includes("1 cannot come back yet: VibeSpace cannot tell their first model's family") && why.includes('1 cannot come back by themselves: their first model is unknown'),
    '② (r3338 (2)) the row says WHY some stay, each count apart, in words a person can act on (the default lapsed, the family unknown, the first model unknown)', why);
  const S2 = read('src/lib/manage-agents.js');
  ok(S2.includes("[['lapsed', '{n} cannot come back yet: the pool\\'s default member has lapsed — renew it, or pick another default in Members & placement'], ['familyUnknown',") && read('src/server/account-usage-routes.js').includes("lapsed: (r && r.lapsed) || 0, familyUnknown: (r && r.familyUnknown) || 0, otherRecord: (r && r.otherRecord) || 0"),
    '② (r3338 (2) (4)) the press\'s reply carries each reason and its toast words each one');
}
const login = (am, id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, subscriptionType: 'max' } }), { mode: 0o600 });
console.log('— ③ the counts ride the accounts list');
{
  const dir = scratchDir('pool-fallback-page-accounts');
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  let told = 0;
  const am = new AccountManager({ dataDir: dir, onChange: () => { told++; } });
  const A = am.createSubscription({ name: 'Team Max' }).id; login(am, A);   // a pool needs a signed-in member (the release's createPool)
  const P = am.createPool({ name: 'Team', members: [A] }).id;
  const counts = [{ provider: 'pv-demo-router', label: 'Router', running: 3, canReturn: 2, waiting: 0 }];
  am.setFallbackStatusLookup((id) => (id === P ? counts : []));
  const row = am.list().accounts.find((r) => r.id === P), sub = am.list().accounts.find((r) => r.id === A);
  const t0 = told, g0 = am.list().tailsGen;
  am.noteFallbackStatus();
  ok(row && JSON.stringify(row.fallbackStatus) === JSON.stringify(counts) && sub && sub.fallbackStatus === undefined && told === t0 + 1 && am.list().tailsGen === g0,
    '③ the pool\'s row carries the engine\'s counts (a subscription row none); a change TELLS the clients (one push) and moves no tails generation', { row: row && row.fallbackStatus, told: told - t0 });
}

console.log('— ④ the roster rows say why a provider cannot start');
{
  const MP = require(path.join(REPO, 'src/model-providers.js'));
  const p = MP.normalizeProvider({ id: 'pv-demo-local', preset: 'deepseek', kind: 'anthropic-compatible', label: 'Local Gateway' });   // the record carries its kind (normalizeProvider reads `kind`, never the preset's)
  const rows = MP.rosterRowsOf([p], { usable: false, whyNot: () => 'no-key' }), ready = MP.rosterRowsOf([p], { usable: true, whyNot: () => 'no-key' });
  ok(rows.length > 0 && rows.every((r) => r.loggedIn === false && r.notReady === 'no-key') && ready.every((r) => r.loggedIn === true && !('notReady' in r)),
    '④ a provider that cannot start carries its reason (no-key / vault-locked) beside `loggedIn`; a ready one carries none', { rows: rows.map((r) => [r.backend, r.notReady]) });
  ok(read('src/server/account-usage-routes.js').includes("whyNot: (p) => (!open ? 'vault-locked' : !providers.hasKey(p.id) ? 'no-key' : null)"), '④ the hub wires the reason from the vault\'s state and the record\'s entry (read off the names, no key read)');
}

console.log('— ⑤ the wiring');
{
  const S = read('src/lib/manage-agents.js'), R = read('src/server/account-usage-routes.js');
  ok(S.includes("body: JSON.stringify(poolSaveBody({ members, priority, codex, cross: st.cross, fb: st.fb, cross0, fb0 })) });")
    && S.includes("cross: fresh.crossProvider === 'allow' ? 'allow' : 'never',") && S.includes("if (st.fb.length >= FALLBACK_MAX) { cb.checked = false; showToast(t('A pool lists at most {n} fallback providers — remove one first', { n: FALLBACK_MAX })")
    && S.includes("if (c && !c.ready) { const why = fallbackNotReadyWords(c.notReady, t); if (why) showToast(why"),
    '⑤ the switch and the list ride the dialog\'s ONE save (Claude pools only), the switch starts from the pool\'s own (never unless allow), the ninth is refused in words, a provider that cannot start says why at its press');
  ok(R.includes("app.post('/api/accounts/:poolId/fallback/move-back', (req, res) => {") && R.includes("const who = require('../routes/vault.js').personVerdict(req);")
    && R.includes("res.json({ ok: true, queued: (r && r.queued) || 0, already: (r && r.already) || 0, noModel: (r && r.noModel) || 0, lapsed: (r && r.lapsed) || 0, familyUnknown: (r && r.familyUnknown) || 0, otherRecord: (r && r.otherRecord) || 0 });") && S.includes("'/fallback/move-back', { method: 'POST'")
    && S.includes("t('{n} cannot move back by a press — VibeSpace does not know the model they came from; pick a model for each in Session Properties', { n: nm })"),
    '⑤ the press is a person\'s (the tree\'s one verdict for a sign-in that is not the page\'s); its reply says QUEUED and how many, and how many could not move (no first model) in words');
}

const eqA = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const BEARER = 'Bearer ' + ['demo', '-key-', '0001'].join('');   // any bearer: never a person's own page (built at runtime)
const PAGE = { 'sec-fetch-site': 'same-origin' };   // what the person's own page sends (src/write-origin.js pageVerdict)
const MP = require(path.join(REPO, 'src/model-providers.js'));
const recOf = (id, label) => MP.normalizeProvider({ id, preset: 'deepseek', kind: 'anthropic-compatible', label });
const legs6 = (X) => {
  const body = (o) => X.poolSaveBody({ members: ['m1'], priority: [], cross0: 'allow', fb0: ['pv-a'], cross: 'allow', fb: ['pv-a'], ...o });
  const only = body({}), sw = body({ cross: 'never' }), li = body({ fb: ['pv-a', 'pv-b'] });
  const cx = X.poolSaveBody({ members: ['m1'], priority: [], codex: true, cross: 'allow', cross0: 'never', fb: ['pv-x'], fb0: [] });
  const listed = [{ id: 'pv-demo-router', label: 'Router' }, { id: 'pv-gone-1', label: 'pv-gone-1', known: false }];
  const ch = X.fallbackChoicesWithListed(ROWS, 'claude', listed), gone = ch.find((c) => c.id === 'pv-gone-1');
  const sec = X.fallbackSectionHtml({ cross: 'never', picked: ['pv-demo-router', 'pv-gone-1'], choices: ch }, T, ESC);
  const after = X.poolSaveBody({ members: ['m1'], priority: [], cross0: 'never', cross: 'never', fb0: ['pv-demo-router', 'pv-gone-1'], fb: ['pv-demo-router', 'pv-gone-1', 'pv-demo-deep'] });
  const w = (r) => X.fallbackPressToasts(r, T).map((m) => m.text);
  return {
    save: JSON.stringify(Object.keys(only)) === '["members","priority"]' && sw.crossProvider === 'never' && !('fallbackProviders' in sw) && eqA(li.fallbackProviders, ['pv-a', 'pv-b']) && !('crossProvider' in li) && JSON.stringify(Object.keys(cx)) === '["members","priority"]',
    listed: !!gone && gone.ready === false && gone.notReady === 'unknown' && /data-id="pv-gone-1" checked/.test(sec) && /VibeSpace does not find this provider now/.test(sec) && eqA(after.fallbackProviders, ['pv-demo-router', 'pv-gone-1', 'pv-demo-deep']),
    words: (() => { const a2 = w({ queued: 2 }), al = w({ queued: 0, already: 2 }), rs = w({ queued: 0, otherRecord: 1 }), no = w({}); return /now if it is idle, or when its turn is over/.test(a2[0]) && al.length === 1 && /2 conversations are already on their way back/.test(al[0]) && rs.length === 1 && !rs.some((x) => /Nothing moved back/.test(x)) && no.length === 1 && /Nothing moved back/.test(no[0]); })(),
    seen: { only, sw, li, cx, gone, after },
  };
};
console.log('— ⑥ the save sends what the person changed; the list keeps what the page cannot see; the press in words (r3886)');
{
  const L = legs6(MA);
  ok(L.save, '⑥ (r3886 (A)) a members-only save carries NEITHER the switch nor the list (a dialog opened on «Move without asking» never turns it on again; the pool\'s queued moves are left alone); a changed switch alone carries the switch, a changed list alone the list; a ChatGPT pool carries neither', L.seen);
  ok(L.listed, '⑥ (r3886 (C)) a provider ON the pool\'s list that the store does not know now is LISTED, checked, with its word — a save after adding another keeps it (it leaves only by the person\'s own uncheck)', L.seen);
  const held = MA.fallbackSectionHtml({ cross: 'never', picked: [], choices: [], unread: 'providers.json in VibeSpace\'s data folder could not be read (EIO).' }, T, ESC);
  ok(/could not be read \(EIO\)/.test(held) && !/No model provider fits Claude yet/.test(held), '⑥ (r3886 (B)) while the provider store is held the section says the store\'s OWN words, never «no provider fits yet»');
  ok(L.words, '⑥ (smalls, (F)) the press says QUEUED with an idle one\'s words (now) and a busy one\'s (its turn\'s end); a second press says those already on their way, never «queued» again; «nothing moved back» only when no other line says why');
  const S = read('src/lib/manage-agents.js');
  ok(S.includes("b.disabled = true;   // (r3886 small) held while its request is in flight") && S.includes("} finally { b.disabled = false; }") && S.includes("if (fbUnread) { cb.checked = st.fb.includes(id); showToast(fbUnread, { type: 'error' }); return; }"),
    '⑥ (small, (B)) the press is held only while its request is in flight (released in a finally); a checkbox pressed while the store is held is put back and says the store\'s words');
}

const M = mutantCopies('pool-fallback-page', REPO);
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const hubWorld = (AM) => {
  const dir = scratchDir('pool-fallback-page-hub'), recs = { 'pv-x': recOf('pv-x', 'X'), 'pv-y': recOf('pv-y', 'Y'), 'pv-z': recOf('pv-z', 'Z') }, st = { clean: true, unread: null };
  const am = new AM({ dataDir: dir });
  am.setProviderLookup((x) => recs[x && x.id] || null, { clean: () => st.clean, unread: () => st.unread });
  const A = am.createSubscription({ name: 'Hub' }).id; login(am, A);
  const P = am.createPool({ name: 'Hub pool', members: [A] }).id;
  am.updatePool(P, { fallbackProviders: ['pv-x', 'pv-y'] });
  return { am, A, P, recs, st };
};
const lawB = (AM) => {
  const w = hubWorld(AM); w.st.clean = false; w.st.unread = 'providers.json in VibeSpace\'s data folder could not be read (EIO).';
  let refused = null; try { w.am.updatePool(w.P, { fallbackProviders: ['pv-x'] }); } catch (e) { refused = { code: e.code, message: e.message }; }
  const afterTry = [...(w.am.get(w.P).fallbackProviders || [])];   // read at once: the next save below sends the whole list again
  let same = 'ok'; try { w.am.updatePool(w.P, { fallbackProviders: ['pv-x', 'pv-y'] }); } catch (e) { same = e.message; }
  let mem = 'ok'; try { w.am.updatePool(w.P, { members: [w.A] }); } catch (e) { mem = e.message; }
  return { refused, afterTry, same, mem, list: w.am.get(w.P).fallbackProviders };
};
const lawC = (AM) => {
  const w = hubWorld(AM); delete w.recs['pv-y'];   // removed behind the store, still on the list
  const row = (w.am.list().accounts.find((r) => r.id === w.P) || {}).fallbackProviders;
  let kept = 'ok'; try { w.am.updatePool(w.P, { fallbackProviders: ['pv-x', 'pv-y', 'pv-z'] }); } catch (e) { kept = e.message; }
  let fresh = null; try { w.am.updatePool(w.P, { fallbackProviders: ['pv-x', 'pv-y', 'pv-z', 'pv-w'] }); } catch (e) { fresh = e.message; }
  return { row, kept, fresh, list: w.am.get(w.P).fallbackProviders };
};
const AUR = require(path.join(REPO, 'src/server/account-usage-routes.js'));
const mount = (MOD, am) => {
  const handlers = new Map(), purged = [];
  const app = { get: (p, h) => handlers.set('GET ' + p, h), post: (p, h) => handlers.set('POST ' + p, h), put: (p, h) => handlers.set('PUT ' + p, h), delete: (p, h) => handlers.set('DELETE ' + p, h), patch: (p, h) => handlers.set('PATCH ' + p, h), use: () => { }, locals: {} };
  const root = scratchDir('pool-fallback-page-routes'); fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const eng = { fallbackMoveBack: () => ({ queued: 1 }), fallbackStatus: () => [], purgePoolMadeMoves: (id) => purged.push(id) };
  MOD.create({ app, rootDir: root, HOST: '127.0.0.1', CLAUDE_CMD: 'claude', NODE_CMD: 'node', CLAUDE_SUBSCRIPTION_LOGIN_HELPER: '/dev/null', activeSessions: new Map(), auth: { enabled: false }, engine: eng,
    serverSetting: () => undefined, recordUsageAttribution() { }, liveAccountIdSet: () => new Set(), buildClaudeSubscriptionLoginCommand: () => 'true', getAccounts: () => am, getHosts: () => null, getMounts: () => null,
    getTelemetry: () => ({ ingestRemote: () => 0, centralSummary: () => ({}) }), getUsageHistory: () => null, getLoginExpiryWatch: () => ({ sweep: () => ({ resolved: [] }) }) });
  const call = async (key, params, body, headers = {}) => { const h = handlers.get(key); if (!h) return { missing: key }; let out = null, code = 200; const res = { json: (o) => { out = o; return res; }, status: (c) => { code = c; return res; } }; await h({ params, body, headers, socket: {} }, res); return { code, body: out }; };
  return { call, purged };
};
const lawD = async (MOD) => {
  const dir = scratchDir('pool-fallback-page-door'), am = new AccountManager({ dataDir: dir });
  const A = am.createSubscription({ name: 'Door' }).id; login(am, A);
  const P = am.createPool({ name: 'Door pool', members: [A] }).id;
  const { call } = mount(MOD, am);
  const bearerSwitch = await call('PATCH /api/accounts/pool/:id', { id: P }, { crossProvider: 'allow' }, { authorization: BEARER });
  const afterBearer = am.get(P).crossProvider || 'never';
  const bearerMembers = await call('PATCH /api/accounts/pool/:id', { id: P }, { members: [A] }, { authorization: BEARER });
  const page = await call('PATCH /api/accounts/pool/:id', { id: P }, { crossProvider: 'allow' }, PAGE);
  const afterPage = am.get(P).crossProvider || 'never';
  const pressBearer = await call('POST /api/accounts/:poolId/fallback/move-back', { poolId: P }, {}, { authorization: BEARER });
  const pressPage = await call('POST /api/accounts/:poolId/fallback/move-back', { poolId: P }, {}, PAGE);
  return { bearerSwitch, afterBearer, bearerMembers: bearerMembers.code, page: page.code, afterPage, pressBearer, pressPage };
};
console.log('— ⑦ the hub\'s own laws, by the store and by requests (r3886 (B) (C) (D) (F))');
{
  const b = lawB(AccountManager);
  ok(b.refused && b.refused.code === 'providers_unread' && /could not be read \(EIO\)/.test(b.refused.message) && eqA(b.afterTry, ['pv-x', 'pv-y']) && b.same === 'ok' && b.mem === 'ok' && eqA(b.list, ['pv-x', 'pv-y']),
    '⑦ (r3886 (B)) while the provider store cannot be read, a CHANGE of the list is refused BY NAME with the store\'s own words — nothing shortened; the same list and a members-only save pass', b);
  const c = lawC(AccountManager);
  ok(eqA(c.row, [{ id: 'pv-x', label: 'X' }, { id: 'pv-y', label: 'pv-y', known: false }]) && c.kept === 'ok' && /no such provider on this hub: pv-w/.test(c.fresh || '') && eqA(c.list, ['pv-x', 'pv-y', 'pv-z']),
    '⑦ (r3886 (C)) the pool\'s row carries its SAVED list (a provider the store does not know now marked known:false); a save that keeps it beside a new one is taken, a NEW unknown id refused by name', c);
  const d = await lawD(AUR);
  ok(d.bearerSwitch.code === 403 && d.bearerSwitch.body && d.bearerSwitch.body.code === 'human_only' && d.afterBearer === 'never' && d.bearerMembers === 200 && d.page === 200 && d.afterPage === 'allow'
    && d.pressBearer.code === 403 && d.pressBearer.body && d.pressBearer.body.code === 'human_only' && d.pressPage.code === 200 && d.pressPage.body && d.pressPage.body.queued === 1,
    '⑦ (r3886 (D)) BY REQUESTS through the real routes: a PATCH carrying the switch with a bearer is refused (human_only) and changes nothing; a members-only PATCH with it is judged as before; the page\'s own PATCH sets it; the press with a bearer is refused, the page\'s press queues', d);
  // (F) TWO PAGES: a change saved on one page rides the push every open page redraws from
  const pushes = [], dir = scratchDir('pool-fallback-page-two'), am = new AccountManager({ dataDir: dir, onChange: (l) => pushes.push(l) });
  const A = am.createSubscription({ name: 'Two' }).id; login(am, A);
  const P = am.createPool({ name: 'Two pool', members: [A] }).id;
  am.setFallbackStatusLookup((id) => (id === P ? [{ provider: 'pv-demo-router', label: 'Router', running: 2, canReturn: 2, waiting: 0 }] : []));
  pushes.length = 0; am.updatePool(P, { crossProvider: 'allow' });
  const pushed = pushes.length ? (pushes[pushes.length - 1].accounts || []).find((r) => r.id === P) : null;
  const drawn = pushed ? MA.fallbackRowHtml(pushed, T, ESC) : '';
  const APP = read('src/lib/app.js'), SRV = read('server.js');
  ok(pushed && pushed.crossProvider === 'allow' && /2 conversations run on Router/.test(drawn) && /Move them back/.test(drawn)
    && APP.includes("if (msg.type === 'accounts-updated' && Array.isArray(msg.accounts)) {") && APP.includes('try { this._agentsRefreshHook?.(); } catch {}') && SRV.includes("const json = JSON.stringify({ type: 'accounts-updated', ...list });"),
    '⑦ (r3886 (F)) TWO PAGES: a change saved on one page is in the push the hub sends every page (accounts-updated, the whole list), and the other page\'s row draws it from that push with no reload (the app redraws an open roster on that frame)', { pushes: pushes.length, cross: pushed && pushed.crossProvider });
}

console.log('— RED COPIES (each LOADED, its leg RUN on it — r3886 (E))');
{
  const S = read('src/lib/manage-agents.js');
  const loadMA = async (src, tag) => import(pathToFileURL(M.write('src/lib/manage-agents.js', src, tag)).href);
  const BILL = "t('The pool moves a conversation to a fallback provider by itself — it then continues there and is BILLED THERE, on that provider\\'s own bill, not on this pool\\'s subscriptions.')";
  const noBill = await loadMA(anchored(S, BILL, "t('The pool moves a conversation to a fallback provider by itself.')", 'the bill cut'), 'no-bill');
  ok(!/BILLED THERE/.test(noBill.fallbackSectionHtml({ cross: 'allow', picked: [], choices: [] }, T, ESC)), 'CONTROL (loaded, run): a copy whose «Move without asking» says no bill draws the section WITHOUT the bill ⇒ ①\'s bill leg goes RED');
  const BACK = "${back ? ` <button class=\"agent-btn pool-fb-back\"";
  const always = await loadMA(anchored(S, BACK, "${true ? ` <button class=\"agent-btn pool-fb-back\"", 'the press always offered'), 'always-press');
  ok(/Move them back/.test(always.fallbackRowHtml({ id: 'pool-demo', fallbackStatus: [{ provider: 'pv-demo-router', label: 'Router', running: 1, canReturn: 0, waiting: 26 }] }, T, ESC)), 'CONTROL (loaded, run): a copy that always offers the press draws it with nothing to bring back ⇒ ②\'s press leg goes RED');
  const SAVE = "  if (cross !== cross0) body.crossProvider = cross;\n  if (!sameIds(fb, fb0)) body.fallbackProviders = (Array.isArray(fb) ? fb : []).slice();\n";
  const resend = await loadMA(anchored(S, SAVE, "  body.crossProvider = cross;\n  body.fallbackProviders = (Array.isArray(fb) ? fb : []).slice();\n", 'the save re-sends both'), 'resend');
  ok(!legs6(resend).save, 'CONTROL (loaded, run): a copy whose save re-sends the switch and the list as they opened (the release before the cure) ⇒ ⑥\'s save leg goes RED');
  const LISTED = "    out.push({ id: x.id, name: x.label || x.id, ready: false, notReady: 'unknown' });\n";
  const dropped = await loadMA(anchored(S, LISTED, '', 'the listed provider dropped'), 'dropped');
  ok(!legs6(dropped).listed, 'CONTROL (loaded, run): a copy that lists only the roster\'s providers drops the one the store does not know ⇒ ⑥\'s list leg goes RED');
  const ALREADY = "  if (al) out.push({ text: al === 1 ? t('1 conversation is already on its way back') : t('{n} conversations are already on their way back', { n: al }), type: 'info' });\n";
  const noAl = await loadMA(anchored(S, ALREADY, '', 'the already line cut'), 'no-already');
  ok(!legs6(noAl).words, 'CONTROL (loaded, run): a copy whose press does not say «already on their way» says «nothing moved back» to a second press ⇒ ⑥\'s words leg goes RED');
  const ACC = read('src/accounts.js');
  const REFUSE = "      if (ids(fallbackProviders) !== ids(a.fallbackProviders)) {";
  const noLaw = M.load('src/accounts.js', anchored(ACC, REFUSE, '      if (false) {', 'the hub\'s refusal cut'), 'no-law').AccountManager;
  const bx = lawB(noLaw);
  ok(!bx.refused && eqA(bx.afterTry, ['pv-x']), 'CONTROL (loaded, run): a store copy without the refusal SHORTENS the list while the provider store cannot be read ⇒ ⑦\'s (B) leg goes RED', bx);
  const KEEP = "      if (!p || p.known === false) { if (listed) { if (!out.includes(pv)) out.push(pv); continue; } throw new Error('no such provider on this hub: ' + pv); }";
  const noKeep = M.load('src/accounts.js', anchored(ACC, KEEP, "      if (!p || p.known === false) throw new Error('no such provider on this hub: ' + pv);", 'the listed id refused'), 'no-keep').AccountManager;
  const cx = lawC(noKeep);
  ok(cx.kept !== 'ok', 'CONTROL (loaded, run): a store copy that refuses a listed id the store does not know refuses the person\'s save ⇒ ⑦\'s (C) leg goes RED', cx);
  const AURS = read('src/server/account-usage-routes.js');
  const VERDICT = "    if (req.body && (req.body.crossProvider !== undefined || req.body.fallbackProviders !== undefined)) { const who = require('../routes/vault.js').personVerdict(req);";
  const noVerdict = M.load('src/server/account-usage-routes.js', anchored(AURS, VERDICT, "    if (false) { const who = require('../routes/vault.js').personVerdict(req);", 'the PATCH\'s verdict cut'), 'no-verdict');
  const dx = await lawD(noVerdict);
  ok(dx.bearerSwitch.code === 200 && dx.afterBearer === 'allow', 'CONTROL (loaded, run): a routes copy without the PATCH\'s verdict lets a bearer turn «Move without asking» on ⇒ ⑦\'s (D) leg goes RED', { code: dx.bearerSwitch.code, after: dx.afterBearer });
}

report();
