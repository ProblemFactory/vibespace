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
  ok(/value="never" checked/.test(never) && !/value="allow" checked/.test(never) && /asks you in For you before a conversation moves to one of these keys/.test(never),
    '① «Ask me first» is the default and says the pool asks in For you first');
  ok(/value="allow" checked/.test(allow) && /continues there and is BILLED THERE, on that key's own bill at its vendor, not on this pool's subscriptions/.test(allow.replace(/&#39;|'/g, "'")),
    '① «Move without asking» says the BILL in plain words: the conversation continues on that provider and is billed THERE, on its own bill');
  ok((never.match(/class="pool-fb-row"/g) || []).length === 3 && /This key&#39;s value is not stored yet — add it in the account dialog first|This key's value is not stored yet — add it in the account dialog first/.test(never) && !/disabled/.test(never + allow)
    && /data-id="pv-demo-router" checked/.test(never) && /At most 8\./.test(never),
    '① three providers, the one with no stored key worded beside its row — no control greyed (none disabled); the picked one checked; the bound said (8)');
  ok(/Pay-as-you-go API keys are for Claude pools/.test(codex) && !/pool-fb-row/.test(codex) && !/pool-fb-mode/.test(codex), '① a ChatGPT pool says its sentence and lists nothing (no switch, no rows)');
  ok(MA.fallbackNotReadyWords('vault-locked', T) === 'The vault is locked — this key can take conversations once you unlock it' && MA.fallbackNotReadyWords(null, T) === null,
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
  const S2 = read('src/lib/pool-priority-model.js');   // (r3918) the press's reply words moved to the PURE pool model (the strip says the same)
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
  ok(S.includes("body: JSON.stringify(poolSaveBody({ members, priority, codex, cross: st.cross, fb: st.fb, cross0, fb0, crossTouched, fbTouched })) });")
    && S.includes("cross: fresh.crossProvider === 'allow' ? 'allow' : 'never',") && S.includes("if (st.fb.length >= FALLBACK_MAX) { cb.checked = false; showToast(t('A pool lists at most {n} pay-as-you-go API keys — remove one first', { n: FALLBACK_MAX })")
    && S.includes("if (c && !c.ready) { const why = fallbackNotReadyWords(c.notReady, t); if (why) showToast(why"),
    '⑤ the switch and the list ride the dialog\'s ONE save (Claude pools only), the switch starts from the pool\'s own (never unless allow), the ninth is refused in words, a provider that cannot start says why at its press');
  ok(R.includes("app.post('/api/accounts/:poolId/fallback/move-back', (req, res) => {") && R.includes("const who = require('../routes/vault.js').personVerdict(req);")
    && R.includes("res.json({ ok: true, queued: (r && r.queued) || 0, already: (r && r.already) || 0, noModel: (r && r.noModel) || 0, lapsed: (r && r.lapsed) || 0, familyUnknown: (r && r.familyUnknown) || 0, otherRecord: (r && r.otherRecord) || 0 });") && S.includes("'/fallback/move-back', { method: 'POST'")
    && read('src/lib/pool-priority-model.js').includes("t('{n} cannot move back by a press — VibeSpace does not know the model they came from; pick a model for each in Session Properties', { n: nm })"),
    '⑤ the press is a person\'s (the tree\'s one verdict for a sign-in that is not the page\'s); its reply says QUEUED and how many, and how many could not move (no first model) in words');
}

const eqA = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const BEARER = 'Bearer ' + ['demo', '-key-', '0001'].join('');   // any bearer: never a person's own page (built at runtime)
const PAGE = { 'sec-fetch-site': 'same-origin' };   // what the person's own page sends (src/write-origin.js pageVerdict)
const MP = require(path.join(REPO, 'src/model-providers.js'));
const recOf = (id, label) => MP.normalizeProvider({ id, preset: 'deepseek', kind: 'anthropic-compatible', label });
const legs6 = (X) => {
  const body = (o) => X.poolSaveBody({ members: ['m1'], priority: [], cross0: 'allow', fb0: ['pv-a'], cross: 'allow', fb: ['pv-a'], ...o });
  const only = body({}), sw = body({ cross: 'never' }), li = body({ fb: ['pv-a', 'pv-b'] }), swBack = body({ crossTouched: true }), liBack = body({ fbTouched: true });
  const cx = X.poolSaveBody({ members: ['m1'], priority: [], codex: true, cross: 'allow', cross0: 'never', fb: ['pv-x'], fb0: [] });
  const listed = [{ id: 'pv-demo-router', label: 'Router' }, { id: 'pv-gone-1', label: 'pv-gone-1', known: false }];
  const ch = X.fallbackChoicesWithListed(ROWS, 'claude', listed), gone = ch.find((c) => c.id === 'pv-gone-1');
  const sec = X.fallbackSectionHtml({ cross: 'never', picked: ['pv-demo-router', 'pv-gone-1'], choices: ch }, T, ESC);
  const after = X.poolSaveBody({ members: ['m1'], priority: [], cross0: 'never', cross: 'never', fb0: ['pv-demo-router', 'pv-gone-1'], fb: ['pv-demo-router', 'pv-gone-1', 'pv-demo-deep'] });
  const w = (r) => X.fallbackPressToasts(r, T).map((m) => m.text);
  return {
    save: JSON.stringify(Object.keys(only)) === '["members","priority"]' && sw.crossProvider === 'never' && sw.crossProviderOpened === 'allow' && !('fallbackProviders' in sw) && eqA(li.fallbackProviders, ['pv-a', 'pv-b']) && eqA(li.fallbackProvidersOpened, ['pv-a']) && !('crossProvider' in li) && JSON.stringify(Object.keys(cx)) === '["members","priority"]',
    touched: swBack.crossProvider === 'allow' && swBack.crossProviderOpened === 'allow' && eqA(liBack.fallbackProviders, ['pv-a']) && eqA(liBack.fallbackProvidersOpened, ['pv-a']),
    nofit: (() => { const c = X.fallbackChoicesWithListed([], 'claude', [{ id: 'pv-lab', label: 'Lab', fits: false }])[0]; return !!c && c.notReady === 'no-fit' && c.name === 'Lab' && /no longer serves Claude Code/.test(X.fallbackNotReadyWords(c.notReady, T) || ''); })(),
    listed: !!gone && gone.ready === false && gone.notReady === 'unknown' && /data-id="pv-gone-1" checked/.test(sec) && /VibeSpace does not find this key now/.test(sec) && eqA(after.fallbackProviders, ['pv-demo-router', 'pv-gone-1', 'pv-demo-deep']),
    words: (() => { const a2 = w({ queued: 2 }), al = w({ queued: 0, already: 2 }), rs = w({ queued: 0, otherRecord: 1 }), no = w({}); return /now if it is idle, or when its turn is over/.test(a2[0]) && al.length === 1 && /2 conversations are already on their way back/.test(al[0]) && rs.length === 1 && !rs.some((x) => /Nothing moved back/.test(x)) && no.length === 1 && /Nothing moved back/.test(no[0]); })(),
    seen: { only, sw, li, cx, gone, after, swBack, liBack },
  };
};
console.log('— ⑥ the save sends what the person changed; the list keeps what the page cannot see; the press in words (r3886)');
{
  const L = legs6(MA);
  ok(L.save, '⑥ (r3886 (A)) a members-only save carries NEITHER the switch nor the list (a dialog opened on «Move without asking» never turns it on again; the pool\'s queued moves are left alone); a changed switch alone carries the switch, a changed list alone the list; a ChatGPT pool carries neither', L.seen);
  ok(L.listed, '⑥ (r3886 (C)) a provider ON the pool\'s list that the store does not know now is LISTED, checked, with its word — a save after adding another keeps it (it leaves only by the person\'s own uncheck)', L.seen);
  const held = MA.fallbackSectionHtml({ cross: 'never', picked: [], choices: [], unread: 'providers.json in VibeSpace\'s data folder could not be read (EIO).' }, T, ESC);
  ok(/could not be read \(EIO\)/.test(held) && !/No pay-as-you-go API key serves Claude yet/.test(held), '⑥ (r3886 (B)) while the provider store is held the section says the store\'s OWN words, never «no key serves Claude yet»');
  ok(L.touched, '⑥ (r3908 (1)) a field the person TOUCHED is sent even when changed and changed back, WITH the value the dialog opened with (the hub then refuses a stale one by name)', L.seen);
  ok(L.nofit, '⑥ (r3908 small) a listed provider the store still holds that no longer serves Claude is said as that, by its label — not as removed');
  const dmg = MA.fallbackSectionHtml({ cross: 'never', picked: ['pv-x'], choices: [], damaged: { copy: 'providers.json.corrupt-demo' } }, T, ESC);
  ok(/The list of model providers was damaged, so it starts empty/.test(dmg) && /providers\.json\.corrupt-demo/.test(dmg) && /until VibeSpace restarts with the list it reads now/.test(dmg) && !/No pay-as-you-go API key serves Claude yet/.test(dmg),
    '⑥ (r3908 (2)) after a torn lift the section says the family\'s own sentence for a list that started empty, names the copy set aside, and says the way out (a restart reads the list again)');
  ok(L.words, '⑥ (smalls, (F)) the press says QUEUED with an idle one\'s words (now) and a busy one\'s (its turn\'s end); a second press says those already on their way, never «queued» again; «nothing moved back» only when no other line says why');
  const S = read('src/lib/manage-agents.js');
  ok(S.includes("b.disabled = true;   // (r3886 small) held while its request is in flight") && S.includes("} finally { b.disabled = false; }") && S.includes("if (fbLock) { cb.checked = st.fb.includes(id); showToast(fbLock, { type: 'error' }); return; }"),
    '⑥ (small, (B)) the press is held only while its request is in flight (released in a finally); a checkbox pressed while the store is held is put back and says the store\'s words');
}

const M = mutantCopies('pool-fallback-page', REPO);
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const hubWorld = (AM) => {
  const dir = scratchDir('pool-fallback-page-hub'), recs = { 'pv-x': recOf('pv-x', 'X'), 'pv-y': recOf('pv-y', 'Y'), 'pv-z': recOf('pv-z', 'Z') }, st = { clean: true, unread: null, damaged: null };
  const am = new AM({ dataDir: dir });
  am.setProviderLookup((x) => recs[x && x.id] || null, { clean: () => st.clean, unread: () => st.unread, damaged: () => st.damaged });
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

const lawE = (AM) => {
  const w = hubWorld(AM);
  w.am.updatePool(w.P, { fallbackProviders: ['pv-x'] });   // ANOTHER page removes pv-y (no opening value: judged as before)
  let list = null; try { w.am.updatePool(w.P, { fallbackProviders: ['pv-x', 'pv-y', 'pv-z'], fallbackProvidersOpened: ['pv-x', 'pv-y'] }); } catch (e) { list = { code: e.code, message: e.message }; }
  const listAfter = [...(w.am.get(w.P).fallbackProviders || [])];
  w.am.updatePool(w.P, { crossProvider: 'allow' });   // ANOTHER page turns «Move without asking» on
  let sw = null; try { w.am.updatePool(w.P, { crossProvider: 'never', crossProviderOpened: 'never' }); } catch (e) { sw = { code: e.code, message: e.message }; }
  const swAfter = w.am.get(w.P).crossProvider || 'never';
  let fresh = 'ok'; try { w.am.updatePool(w.P, { fallbackProviders: ['pv-x', 'pv-z'], fallbackProvidersOpened: ['pv-x'], crossProvider: 'never', crossProviderOpened: 'allow' }); } catch (e) { fresh = e.message; }
  return { list, listAfter, sw, swAfter, fresh, end: { list: w.am.get(w.P).fallbackProviders, cross: w.am.get(w.P).crossProvider || 'never' } };
};
const lawLock = (AM) => {
  const w = hubWorld(AM); w.st.clean = false; w.st.damaged = { copy: 'providers.json.corrupt-demo', at: 1 };
  const lockD = (({ providersUnread, providersDamaged }) => ({ providersUnread, providersDamaged }))(w.am.list());
  let refD = null; try { w.am.updatePool(w.P, { fallbackProviders: ['pv-x'] }); } catch (e) { refD = { code: e.code, message: e.message }; }
  w.st.damaged = null; w.st.unread = 'providers.json in VibeSpace\'s data folder could not be read (EIO).';
  const lockH = (({ providersUnread, providersDamaged }) => ({ providersUnread, providersDamaged }))(w.am.list());
  w.st.clean = true; w.st.unread = null;
  const lockC = (({ providersUnread, providersDamaged }) => ({ providersUnread, providersDamaged }))(w.am.list());
  w.recs['pv-y'] = MP.normalizeProvider({ id: 'pv-y', kind: 'self-hosted', wire: 'openai-responses', baseUrl: 'https://lab.invalid/v1', label: 'Lab' });   // still held, speaks Responses: Codex only
  const row = (w.am.list().accounts.find((r) => r.id === w.P) || {}).fallbackProviders;
  return { lockD, refD, lockH, lockC, row };
};
console.log('— ⑧ the follow\'s laws on the hub: a stale dialog\'s edit refused by name; ONE fact for the lock (r3908)');
{
  const e = lawE(AccountManager);
  ok(e.list && e.list.code === 'pool_changed_elsewhere' && /changed on another page/.test(e.list.message) && eqA(e.listAfter, ['pv-x']),
    '⑧ (r3908 (1)) THE LIST: a dialog opened on [X, Y]; another page removed Y; the stale dialog ticks Z and saves [X, Y, Z] — refused BY NAME (changed on another page), Y never back on the spend list', e);
  ok(e.sw && e.sw.code === 'pool_changed_elsewhere' && e.swAfter === 'allow' && e.fresh === 'ok' && eqA(e.end.list, ['pv-x', 'pv-z']) && e.end.cross === 'never',
    '⑧ (r3908 (1)) THE SWITCH: a dialog opened on «Ask me first»; another page set «Move without asking»; the stale dialog\'s touched switch is refused by name and the other page\'s value stays — a dialog opened on what is stored now saves', e);
  const l = lawLock(AccountManager);
  ok(l.lockD.providersDamaged && l.lockD.providersDamaged.copy === 'providers.json.corrupt-demo' && !l.lockD.providersUnread && l.refD && l.refD.code === 'providers_damaged' && /providers\.json\.corrupt-demo/.test(l.refD.message) && /restarts/.test(l.refD.message)
    && /could not be read \(EIO\)/.test(l.lockH.providersUnread || '') && !l.lockH.providersDamaged && l.lockC.providersUnread === null && !l.lockC.providersDamaged,
    '⑧ (r3908 (2)) ONE FACT: after a torn lift the list carries providersDamaged (the copy) and the hub\'s refusal names that copy and the restart; while held, providersUnread (the store\'s words); reading, neither — the page\'s lock and the hub\'s refusal read the same flag', l);
  ok(eqA(l.row, [{ id: 'pv-x', label: 'X' }, { id: 'pv-y', label: 'Lab', fits: false }]), '⑧ (r3908 small) a listed provider the store still holds that no longer serves Claude rides the row by its label, marked fits:false — not as removed', l.row);
}

console.log('— ⑩ each row says what it is — its name, its vendor, ••••its last four (the person\'s read only) — in the order the pool uses them (r3945)');
{
  const AT = await import(path.join(REPO, 'src/lib/account-tails.js'));
  const LIST = { providerRows: [
    { id: 'pv-demo-router', name: 'Router', type: 'provider', backend: 'claude', loggedIn: true, preset: 'deepseek', kind: 'anthropic-compatible' },
    { id: 'pv-demo-deep2', name: 'DeepSeek', type: 'provider', backend: 'claude', loggedIn: true, preset: 'deepseek', kind: 'anthropic-compatible' },
    { id: 'pv-demo-lab', name: 'Home lab', type: 'provider', backend: 'claude', loggedIn: true, preset: 'other', kind: 'self-hosted' },
  ] };
  const TAILS = { 'pv-demo-router': 'e9b6', 'pv-demo-deep2': '41c2', 'pv-demo-lab': '7f30' };
  const subs = (h) => [...h.matchAll(/<span class="pool-mem-sub pool-fb-what">([^<]*)<\/span>/g)].map((m) => m[1]);
  const ids = (h) => [...h.matchAll(/<label class="pool-fb-row" data-id="([^"]+)"/g)].map((m) => m[1]);
  const bare = MA.fallbackSectionHtml({ cross: 'never', picked: [], choices: MA.fallbackChoices(LIST.providerRows, 'claude') }, T, ESC);
  const laid = AT.withTails(LIST, { accounts: {}, cliKey: null, providers: TAILS });   // the person's read (POST /api/accounts/tails) laid on the rows
  const html = MA.fallbackSectionHtml({ cross: 'never', picked: ['pv-demo-lab', 'pv-demo-router'], choices: MA.fallbackChoices(laid.providerRows, 'claude') }, T, ESC);
  ok(eqA(subs(bare), ['DeepSeek', 'DeepSeek', 'Other or self-hosted']) && !/••••/.test(bare),
    '⑩ (r3945 (1)) each row names its VENDOR under its name — the preset the person chose (two keys of DeepSeek, one self-hosted) — and, before the person\'s read, no characters of a key', subs(bare));
  ok(eqA(subs(html), ['Other or self-hosted · ••••7f30', 'DeepSeek · ••••e9b6', 'DeepSeek · ••••41c2']) && subs(html)[1] !== subs(html)[2],
    '⑩ (r3945 (1)) with the person\'s read laid on: the vendor and ••••the last four — two keys of ONE vendor told apart at a glance', subs(html));
  ok(eqA(ids(html), ['pv-demo-lab', 'pv-demo-router', 'pv-demo-deep2']) && eqA(ids(bare), ['pv-demo-router', 'pv-demo-deep2', 'pv-demo-lab']),
    '⑩ (r3945 (3)) the rows stand in the order the pool uses them: the checked ones first, in the saved list\'s order, then the others (the engine\'s order: test-pool-fallback)', { checked: ids(html), none: ids(bare) });
  const S = read('src/lib/manage-agents.js');
  ok(/When every member is out: pay-as-you-go API keys/.test(html) && /Each row is one API key you added, paid as you go: its vendor bills its use on that key&#39;s own bill|Each row is one API key you added, paid as you go: its vendor bills its use on that key's own bill/.test(html)
    && /Used only when every member is out, top first: the first key that can take the conversation then\. At most 8\./.test(html)
    && S.includes("try { list = await accountsWithTails(); } catch {") && S.includes("draw();   // (r3945 (3)) the row stands where the pool will use it"),
    '⑩ (r3945 (2)) the section is named for what it lists — METERED keys, each billed by its vendor on its own bill, used only when every member is out, top first; the dialog reads the rows with the person\'s tails (the roster\'s own read) and redraws a checked row into its place');
  // B-ba7d: THE LIST AND ITS PUSH CARRY NO TAIL — a real store of three keys (two of one vendor, one self-hosted), the pool listing all three
  const tailsLaw = (MPX) => {
    const dir = scratchDir('pool-fallback-page-tails'), pushes = [];
    const am = new AccountManager({ dataDir: dir, onChange: (l) => pushes.push(l) });
    const rec = (id, o, tail) => ({ ...MP.normalizeProvider({ id, ...o }), tail });
    const recs = { 'pv-t1': rec('pv-t1', { preset: 'deepseek', kind: 'anthropic-compatible', label: 'Router' }, 'Qz7w'), 'pv-t2': rec('pv-t2', { preset: 'deepseek', kind: 'anthropic-compatible', label: 'DeepSeek' }, 'Kx4p'),
      'pv-t3': rec('pv-t3', { preset: 'other', kind: 'self-hosted', wire: 'anthropic-messages', baseUrl: 'https://lab.invalid/v1', label: 'Home lab' }, 'Mv9t') };
    am.setProviderLookup((x) => recs[x && x.id] || null);
    am.setProviderRows(() => MPX.rosterRowsOf(Object.values(recs), { usable: true }));
    const A = am.createSubscription({ name: 'Tails' }).id; login(am, A);
    const P = am.createPool({ name: 'Tails pool', members: [A] }).id;
    pushes.length = 0; am.updatePool(P, { fallbackProviders: ['pv-t1', 'pv-t2', 'pv-t3'] });
    const all = JSON.stringify(am.list()) + JSON.stringify(pushes);
    return { pushes: pushes.length, rows: (am.list().providerRows || []).length, listed: ((am.get(P) || {}).fallbackProviders || []).length, tails: ['Qz7w', 'Kx4p', 'Mv9t'].filter((x) => all.includes(x)) };
  };
  const tl = tailsLaw(MP);
  ok(tl.pushes > 0 && tl.rows >= 3 && tl.listed === 3 && tl.tails.length === 0,
    '⑩ (B-ba7d) the accounts list and its push carry NO character of a key after this change — the rows\' tails come only from the person\'s own read on the page', tl);
  const MPS = read('src/model-providers.js');
  const tx = tailsLaw(M.load('src/model-providers.js', anchored(MPS, 'localOnly: true,', 'localOnly: true, tail: p.tail,', 'the list carries the tail'), 'mp-list-tail'));
  ok(tx.tails.length === 3, 'CONTROL (loaded, run): a model-providers copy whose roster rows carry the tail puts the three tails in the list and its push ⇒ the leg goes RED', tx);
}

console.log('— ⑪ the rows\' follow (r4028): the vendor through the REAL roster\'s rows; a hostile name and tail escaped on the new span');
const HOSTILE = { id: 'pv-demo-hostile', name: '<img src=x onerror=1>"q', type: 'provider', backend: 'claude', loggedIn: true, preset: 'deepseek', kind: 'anthropic-compatible', tail: '<"x>' };
const hostileOk = (h) => !/<img/.test(h) && !/<"x>/.test(h) && /&lt;img src=x onerror=1&gt;&quot;q/.test(h) && /DeepSeek · ••••&lt;&quot;x&gt;/.test(h);
{
  // (3) the vendor through the REAL roster's rows (model-providers rosterRowsOf over normalized records — the accounts list's own rows), never a hand-built list
  const rec = (id, o) => MP.normalizeProvider({ id, ...o });
  const real = MP.rosterRowsOf([rec('pv-r1', { preset: 'deepseek', kind: 'anthropic-compatible', label: 'Router' }), rec('pv-r2', { preset: 'deepseek', kind: 'anthropic-compatible', label: 'DeepSeek' }),
    rec('pv-r3', { preset: 'other', kind: 'self-hosted', wire: 'anthropic-messages', baseUrl: 'https://lab.invalid/v1', label: 'Home lab' })], { usable: true });
  const h = MA.fallbackSectionHtml({ cross: 'never', picked: [], choices: MA.fallbackChoices(real, 'claude') }, T, ESC);
  const subs = [...h.matchAll(/<span class="pool-mem-sub pool-fb-what">([^<]*)<\/span>/g)].map((m) => m[1]);
  ok(eqA(subs, ['DeepSeek', 'DeepSeek', 'Other or self-hosted']) && real.every((r) => !('tail' in r)),
    '⑪ (r4028 (3)) the vendor reaches each row through the REAL roster\'s rows (rosterRowsOf carries the preset; no tail) — two DeepSeek keys and a self-hosted one', { subs, rows: real.length });
  // (2) a HOSTILE name and tail (a tag and a quote) on the new span: escaped in the name, its aria-label and the vendor-and-tail line
  const hh = MA.fallbackSectionHtml({ cross: 'never', picked: ['pv-demo-hostile'], choices: MA.fallbackChoices([HOSTILE], 'claude') }, T, ESC);
  ok(hostileOk(hh), '⑪ (r4028 (2)) a key named «<img src=x onerror=1>"q» with the tail «<"x>» is drawn escaped — no tag and no bare quote reach the page, in its name, its label or its vendor-and-tail line', hh.slice(0, 600));
}

const PMOD = await import(path.join(REPO, 'src/lib/pool-priority-model.js'));
const strip9 = (X) => {
  const on = { on: { sid: 's1', poolId: 'pool-demo', provider: 'pv-demo-router', label: 'Router', back: { id: 'sub-a', name: 'Team Max' }, why: null } };
  const onNo = { on: { ...on.on, back: null, why: 'no-member' } };
  const can = { can: { sid: 's2', poolId: 'pool-demo', provider: 'pv-demo-router', label: 'Router', askId: 'ask-1' } };
  const a = X.fallbackStripOf(on, T), b = X.fallbackStripOf(onNo, T), c = X.fallbackStripOf(can, T), n = X.fallbackStripOf(null, T);
  return { a, b, c, n,
    back: !!a && /Runs on Router — billed there, on Router's own bill/.test(a.words) && a.press === 'Move back to Team Max' && a.request && a.request.url === '/api/accounts/pool-demo/fallback/move-back' && eqA(a.request.body, { sids: ['s1'] }),
    none: !!b && !b.press && !b.request && /no member can take it back yet/.test(b.words) && n === null,
    to: !!c && c.press === "Move to Router — billed there, on Router's own bill" && c.request && c.request.url === '/api/accounts/pool-cross/asks/ask-1' && eqA(c.request.body, { answer: 'once', sid: 's2' }) };
};
console.log('— ⑨ the conversation\'s own press in its status strip (r3918)');
{
  const z = strip9(PMOD);
  ok(z.back && z.to, '⑨ (r3918 (b)) the strip\'s words say where it runs and the BILL; «Move back to {member}» names THIS conversation; «Move to {provider} — billed there, on {provider}\'s own bill» is the ask\'s Allow once for THIS conversation', z);
  ok(z.none, '⑨ (r3918 (c) (d)) with no member able to take it back the strip says why and draws NO press; with no fact, nothing', z.b);
  const BAR = read('src/lib/chat-status-bar.js'), VIEW = read('src/lib/chat-view.js'), TAB = read('src/lib/strip-table.js');
  ok(BAR.includes("<span class=\"chat-status-fb-words\">${escHtml(fs.words)}</span>${fs.press ? ` <button type=\"button\" class=\"agent-btn chat-status-fb-press\"${this._fbBusy ? ' disabled' : ''}>${escHtml(fs.press)}</button>` : ''}")
    && BAR.includes("if (e.target.closest('.chat-status-fb-press')) { e.stopPropagation(); this._fbPress(); return; }")
    && BAR.includes("} finally { this._fbBusy = false; this.render(); }") && BAR.includes(": fallbackPressToasts(r, t);")
    && VIEW.includes("this._statusBar?.setPoolFallback?.(row.poolFallback || null);") && TAB.includes("row('fallback', 'I', 'row1', 35, { exists: true }),"),
    '⑨ (r3918 (c)) the press is a BUTTON beside the words (only its own click acts — the words are never made clickable), held only while its request is in flight (released in a finally); a «Move back» reply in the pool row\'s own words; the chat view feeds it the payload\'s fact; the strip\'s table places it on row 1');
  // (e) WHO SEES THE FACT — the live payload's roads, and nothing else
  const SRV = read('server.js'), WSH = read('src/ws-handler.js');
  const tracked = (await import(pathToFileURL(path.join(REPO, 'scripts/tracked-files.mjs')).href)).trackedFiles(REPO, 'src', 'server.js').filter((f) => /\.(c|m)?js$/.test(f));
  const callers = tracked.filter((f) => read(f).split('\n').some((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && /activeSessionsPayload\(\)/.test(l)));
  const factUsers = tracked.filter((f) => read(f).split('\n').some((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && /\bfallbackFactOf\s*\(/.test(l)));   // a CALL (or its definition) on a code line — a comment naming it is no reader
  ok(SRV.includes("poolPin: poolPinFactOf(s), poolFallback: (() => { try { return fallbackFactOf(id); } catch { return null; } })(),")
    && eqA(callers.sort(), ['server.js', 'src/ws-handler.js']) && SRV.includes("const msg = JSON.stringify({ type: 'active-sessions', sessions: activeSessionsPayload() });") && WSH.includes("ws.send(JSON.stringify({ type: 'active-sessions', sessions: activeSessionsPayload() }));")
    && SRV.includes("if (pathname === '/ws') {\n    if (!auth.requestAuthed(req)) return deny();") && read('src/auth.js').includes('return this.checkToken(Auth.cookieToken(req));')
    && eqA(factUsers.sort(), ['server.js', 'src/server/account-usage-routes.js', 'src/server/usage-pool-engine.js']),
    '⑨ (r3918 (e)) WHO SEES THE FACT: the live payload is built only for the page\'s /ws (its broadcast and its first frame — the only two callers in the tree), and /ws admits only the person\'s page (the same-origin verdict and the owner\'s cookie, never a bearer); the fact is read nowhere else but the engine and the routes\' own one-conversation checks — no agent, job or automation read carries it', { callers, factUsers });
}

console.log('— RED COPIES (each LOADED, its leg RUN on it — r3886 (E))');
{
  const S = read('src/lib/manage-agents.js');
  const loadMA = async (src, tag) => import(pathToFileURL(M.write('src/lib/manage-agents.js', src, tag)).href);
  const BILL = "t('The pool moves a conversation to one of these keys by itself — it then continues there and is BILLED THERE, on that key\\'s own bill at its vendor, not on this pool\\'s subscriptions.')";
  const WHAT = '<span class="pool-mem-sub pool-fb-what">${esc(what)}</span>';
  const noEsc = await loadMA(anchored(S, WHAT, '<span class="pool-mem-sub pool-fb-what">${what}</span>', 'the new span unescaped'), 'what-unescaped');
  ok(!hostileOk(noEsc.fallbackSectionHtml({ cross: 'never', picked: ['pv-demo-hostile'], choices: noEsc.fallbackChoices([HOSTILE], 'claude') }, T, ESC)), 'CONTROL (loaded, run): a copy whose vendor-and-tail span drops its escape puts the hostile tail on the page raw ⇒ ⑪\'s escape leg goes RED');
  const noBill = await loadMA(anchored(S, BILL, "t('The pool moves a conversation to one of these keys by itself.')", 'the bill cut'), 'no-bill');
  ok(!/BILLED THERE/.test(noBill.fallbackSectionHtml({ cross: 'allow', picked: [], choices: [] }, T, ESC)), 'CONTROL (loaded, run): a copy whose «Move without asking» says no bill draws the section WITHOUT the bill ⇒ ①\'s bill leg goes RED');
  const BACK = "${back ? ` <button class=\"agent-btn pool-fb-back\"";
  const always = await loadMA(anchored(S, BACK, "${true ? ` <button class=\"agent-btn pool-fb-back\"", 'the press always offered'), 'always-press');
  ok(/Move them back/.test(always.fallbackRowHtml({ id: 'pool-demo', fallbackStatus: [{ provider: 'pv-demo-router', label: 'Router', running: 1, canReturn: 0, waiting: 26 }] }, T, ESC)), 'CONTROL (loaded, run): a copy that always offers the press draws it with nothing to bring back ⇒ ②\'s press leg goes RED');
  const SAVE = "  if (crossTouched || cross !== cross0) { body.crossProvider = cross; body.crossProviderOpened = cross0; }\n  if (fbTouched || !sameIds(fb, fb0)) { body.fallbackProviders = (Array.isArray(fb) ? fb : []).slice(); body.fallbackProvidersOpened = (Array.isArray(fb0) ? fb0 : []).slice(); }\n";
  const resend = await loadMA(anchored(S, SAVE, "  body.crossProvider = cross;\n  body.fallbackProviders = (Array.isArray(fb) ? fb : []).slice();\n", 'the save re-sends both'), 'resend');
  ok(!legs6(resend).save, 'CONTROL (loaded, run): a copy whose save re-sends the switch and the list as they opened (the release before the cure) ⇒ ⑥\'s save leg goes RED');
  const LISTED = "    out.push({ id: x.id, name: x.label || x.id, ready: false, notReady: x.fits === false ? 'no-fit' : 'unknown', preset: null, tail: null });   // (r3908 small) a held record that no longer serves this vendor, said as that\n";
  const dropped = await loadMA(anchored(S, LISTED, '', 'the listed provider dropped'), 'dropped');
  ok(!legs6(dropped).listed, 'CONTROL (loaded, run): a copy that lists only the roster\'s providers drops the one the store does not know ⇒ ⑥\'s list leg goes RED');
  const ALREADY = "  if (al) out.push({ text: al === 1 ? t('1 conversation is already on its way back') : t('{n} conversations are already on their way back', { n: al }), type: 'info' });\n";
  const PPM = read('src/lib/pool-priority-model.js');
  const NOBACK = "    if (!f.on.back || !f.on.back.id) return { words: words + ' · ' + t('no member can take it back yet'), press: null, request: null };\n";
  const pressAlways = await import(pathToFileURL(M.write('src/lib/pool-priority-model.js', anchored(PPM, NOBACK, '', 'a press with no member'), 'press-always')).href);
  let crashed = false; try { strip9(pressAlways); } catch { crashed = true; }
  ok(crashed || !strip9(pressAlways).none, 'CONTROL (loaded, run): a pool-model copy that offers «Move back» with no member to take it ⇒ ⑨\'s no-press leg goes RED');
  const noAlP = await import(pathToFileURL(M.write('src/lib/pool-priority-model.js', anchored(PPM, ALREADY, '', 'the already line cut'), 'no-already')).href);
  ok(!legs6({ ...MA, fallbackPressToasts: noAlP.fallbackPressToasts }).words, 'CONTROL (loaded, run): a copy whose press does not say «already on their way» says «nothing moved back» to a second press ⇒ ⑥\'s words leg goes RED');
  const ACC = read('src/accounts.js');
  const REFUSE = "      if (idsOf(fallbackProviders) !== idsOf(a.fallbackProviders)) {";
  const noLaw = M.load('src/accounts.js', anchored(ACC, REFUSE, '      if (false) {', 'the hub\'s refusal cut'), 'no-law').AccountManager;
  const bx = lawB(noLaw);
  ok(!bx.refused && eqA(bx.afterTry, ['pv-x']), 'CONTROL (loaded, run): a store copy without the refusal SHORTENS the list while the provider store cannot be read ⇒ ⑦\'s (B) leg goes RED', bx);
  const STALE_LIST = "    if (fallbackProviders !== undefined && fallbackProvidersOpened !== undefined && idsOf(a.fallbackProviders) !== idsOf(fallbackProvidersOpened)) {";
  const ex = lawE(M.load('src/accounts.js', anchored(ACC, STALE_LIST, '    if (false) {', 'the stale list let through'), 'stale-list').AccountManager);
  ok(!ex.list && eqA(ex.listAfter, ['pv-x', 'pv-y', 'pv-z']), 'CONTROL (loaded, run): a store copy without the list\'s check takes the stale [X, Y, Z] — Y back on the spend list, nobody choosing it ⇒ ⑧\'s list leg goes RED', ex);
  const STALE_SW = "    if (crossProvider !== undefined && crossProviderOpened !== undefined && (a.crossProvider === 'allow' ? 'allow' : 'never') !== (crossProviderOpened === 'allow' ? 'allow' : 'never')) {";
  const ey = lawE(M.load('src/accounts.js', anchored(ACC, STALE_SW, '    if (false) {', 'the stale switch let through'), 'stale-switch').AccountManager);
  ok(!ey.sw && ey.swAfter === 'never', 'CONTROL (loaded, run): a store copy without the switch\'s check writes the stale «Ask me first» over the other page\'s choice ⇒ ⑧\'s switch leg goes RED', ey);
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
