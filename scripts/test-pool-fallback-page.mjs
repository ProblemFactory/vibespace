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
//   RED COPIES: the bill's words cut from «Move without asking»; the press offered with nothing to bring back.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

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
  ok(S.includes("body: JSON.stringify({ members, priority, ...(codex ? {} : { crossProvider: st.cross, fallbackProviders: st.fb.slice() }) }) });")
    && S.includes("cross: fresh.crossProvider === 'allow' ? 'allow' : 'never',") && S.includes("if (st.fb.length >= FALLBACK_MAX) { cb.checked = false; showToast(t('A pool lists at most {n} fallback providers — remove one first', { n: FALLBACK_MAX })")
    && S.includes("if (c && !c.ready) { const why = fallbackNotReadyWords(c.notReady, t); if (why) showToast(why"),
    '⑤ the switch and the list ride the dialog\'s ONE save (Claude pools only), the switch starts from the pool\'s own (never unless allow), the ninth is refused in words, a provider that cannot start says why at its press');
  ok(R.includes("app.post('/api/accounts/:poolId/fallback/move-back', (req, res) => {") && R.includes("const who = require('../routes/vault.js').personVerdict(req);")
    && R.includes("res.json({ ok: true, queued: (r && r.queued) || 0, noModel: (r && r.noModel) || 0, lapsed: (r && r.lapsed) || 0, familyUnknown: (r && r.familyUnknown) || 0, otherRecord: (r && r.otherRecord) || 0 });") && S.includes("'/fallback/move-back', { method: 'POST'")
    && S.includes("t('{n} cannot move back by a press — VibeSpace does not know the model they came from; pick a model for each in Session Properties', { n: nm })"),
    '⑤ the press is a person\'s (the tree\'s one verdict for a sign-in that is not the page\'s); its reply says QUEUED and how many, and how many could not move (no first model) in words');
}

console.log('— RED COPIES');
{
  const S = read('src/lib/manage-agents.js');
  const BILL = "t('The pool moves a conversation to a fallback provider by itself — it then continues there and is BILLED THERE, on that provider\\'s own bill, not on this pool\\'s subscriptions.')";
  ok(S.split(BILL).length === 2, 'control setup: the bill\'s sentence is in the section once (the plant the copy cuts)');
  const cut = anchored(S, BILL, "t('The pool moves a conversation to a fallback provider by itself.')", 'the bill cut');
  ok(!/BILLED THERE/.test(cut) && /BILLED THERE/.test(S), 'CONTROL: a copy whose «Move without asking» says no bill reads without «BILLED THERE» ⇒ ①\'s bill leg goes RED');
  const BACK = "${back ? ` <button class=\"agent-btn pool-fb-back\"";
  ok(S.includes(BACK) && !anchored(S, BACK, "${true ? ` <button class=\"agent-btn pool-fb-back\"", 'the press always offered').includes(BACK), 'CONTROL: a copy that always offers the press loses the «only when some can come back» test ⇒ ②\'s press leg goes RED');
}

report();
