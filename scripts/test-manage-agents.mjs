#!/usr/bin/env node
// THE ★ PICKS THE ANTIGRAVITY ACCOUNT YOU CHOOSE (lane antigravity-card-fixes, the owner 2026-10-20: Manage agents ›
// Antigravity CLI showed 「Google 登录 未登录 ★」 over 「Personal Ultra 已登录 ☆」, and a click on Personal Ultra's star
// changed nothing). The click posted, the server stored the harness's own field (accounts.setDefault →
// defaultAntigravityAccountId, the descriptor's creds.defaultIdField) — and the CLIENT'S ACCOUNT CACHE copied two
// hand-picked fields from the answer (claude's defaultAccountId, codex's defaultCodexAccountId), so every read of
// antigravity's field (the roster's star, the New Session dialog's default, the resume verdict) saw undefined and the
// machine login stayed ★. The cache now copies EVERY harness's field (agent-meta accountDefaultsOf, off the billing rows).
// DOM-mini: the REAL roster renderers (src/lib/manage-agents.js) over a fake document, the REAL refreshAccounts body
// (lifted from src/lib/app.js), the REAL client fetch helpers over a stubbed fetch that answers from the REAL accounts
// store (src/accounts.js, a scratch data dir) the way the routes do.
//   ① accountDefaultsOf (PURE) carries every billing row's field;
//   ② antigravity: no default ⇒ the machine login is ★; a click on an account's ☆ posts {id, backend}, the store keeps
//      defaultAntigravityAccountId, the refresh draws that account ★ and the machine row ☆; clearing goes back;
//   ③ the codex twin (its roster reads defaultCodexAccountId by name — it was never broken; pinned so it stays so);
//   ④ the accounts-updated push keeps the field too (the other cache writer);
//   ⑤ NEGATIVE CONTROLS: the pre-fix refreshAccounts body ⇒ the antigravity ★ leg RED (codex stays green); a roster
//      copy reading the CLAUDE field (defaultAccountId) ⇒ RED.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } return !!c; };
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }

const AM = await import(path.join(REPO, 'src/lib/agent-meta.js'));
const MA = await import(path.join(REPO, 'src/lib/manage-agents.js'));

// ── the fake document: just what the roster renderers touch ──
const el = (tag) => ({ tagName: tag, className: '', style: {}, innerHTML: '', textContent: '', title: '', children: [], isConnected: true, onclick: null,
  append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; },
  querySelector() { return { querySelectorAll: () => [] }; }, querySelectorAll() { return []; } });
globalThis.document = { createElement: el, querySelectorAll: () => [] };
/** The roster's rows as data: [{ id, def }] — `def` = the row is the default AND its star button is on. */
const rowsOf = (html) => [...String(html).matchAll(/<div class="acct-key-row( is-default)?[^"]*" data-id="([^"]+)"[\s\S]*?<button class="acct-icon acct-def ([^"]*)"/g)]
  .map((m) => ({ id: m[2], def: !!m[1] && /\bon\b/.test(m[3]), half: !!m[1] !== /\bon\b/.test(m[3]) }));

// ── the REAL accounts store in a scratch data dir (HOME = a scratch machine home) ──
const ROOT = scratch('manage-agents');
fs.rmSync(ROOT, { recursive: true, force: true });
const MACHINE = path.join(ROOT, 'machine-home'), DATA = path.join(ROOT, 'data');
fs.mkdirSync(MACHINE, { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
process.env.HOME = MACHINE;
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const AGY = require(path.join(REPO, 'src/harnesses/antigravity.js'));
const am = new AccountManager({ dataDir: DATA });
const g1 = am.createHomeSubscription('antigravity', { name: 'Personal Ultra' });
const g2 = am.createHomeSubscription('antigravity', { name: 'Work' });
for (const g of [g1, g2]) { fs.writeFileSync(path.join(g.dir, AGY.TOKEN_REL), 'LOGIN', { mode: 0o600 }); am.finalizeHomeSubscription(g.id); }
const c1 = am.createCodexSubscription({ name: 'ChatGPT A' });

// ── fetch, answered the way the routes answer (src/server/account-usage-routes.js) ──
const posted = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const answer = (body, status = 200) => ({ ok: status < 400, status, statusText: '', json: async () => body });
  if (u === '/api/accounts' && (!opts.method || opts.method === 'GET')) return answer({ ...am.list(), subscription: {}, cliKey: {} });
  if (u === '/api/accounts/tails' && opts.method === 'POST') {   // B-ba7d: the person's read (src/routes/account-tails.js); B-ee0a: { hostId } ⇒ that machine's CLI-key tail
    const b = (() => { try { return JSON.parse(opts.body || '{}'); } catch { return {}; } })();
    if (!b.hostId) globalThis.__tailsAsks = (globalThis.__tailsAsks || 0) + 1;   // the accounts' read asked (B-ee0a smalls: one a push)
    if (globalThis.__tailsRefused) return answer({ ok: false, code: 'human_only' }, 403);
    return b.hostId ? answer({ ok: true, tails: { hostCliKey: globalThis.__hostTail ?? null } }) : answer({ ok: true, tails: am.keyTails() });
  }
  if (u === '/api/accounts/default' && opts.method === 'POST') {
    const b = JSON.parse(opts.body || '{}'); posted.push(b);
    try { am.setDefault(b.id || null, b.backend || 'claude'); return answer({ success: true }); } catch (e) { return answer({ error: e.message }, 400); }
  }
  return answer({ error: 'unexpected ' + u }, 404);
};
const { fetchJson } = await import(path.join(REPO, 'src/lib/utils.js'));
const ATL = await import(path.join(REPO, 'src/lib/account-tails.js'));   // B-ba7d: the refresh body and the push line lay the person's tails on

// ── THE REAL refreshAccounts body, lifted from app.js (a control swaps in the pre-fix line) ──
const APP = read('src/lib/app.js');
const RA = /\n  refreshAccounts\(\) \{\n([\s\S]*?)\n  \}\n/.exec(APP);
const PRE_LINE = "      if (d) this._accounts = { accounts: d.accounts || [], defaultAccountId: d.defaultAccountId || null, defaultCodexAccountId: d.defaultCodexAccountId || null, subscription: d.subscription || {}, cliKey: d.cliKey || {} };";
const refreshFrom = (body) => new Function('fetchJson', 'accountDefaultsOf', 'accountRowsOf', 'askTails', 'withTails', `return function refreshAccounts() {\n${body}\n}`)(fetchJson, AM.accountDefaultsOf, AM.accountRowsOf, ATL.askTails, ATL.withTails);   // accountRowsOf: lane lg-providers U5 (the providers' rows beside the accounts)
const PUSH = /if \(msg\.type === 'accounts-updated' && Array\.isArray\(msg\.accounts\)\) \{\n\s*(this\._accounts = [^\n]*)\n/.exec(APP);

/** ② ③ ④ as rows, over a roster module and a refreshAccounts body. */
async function starLegs(Mod, raBody) {
  const out = [];
  const leg = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
  am.setDefault(null, 'antigravity'); am.setDefault(null, 'codex');
  class App { }
  Mod.installManageAgents(App, {});
  const app = new App();
  app.refreshAccounts = refreshFrom(raBody);
  app._acctUsageHtml = () => '';
  app.settings = { get: () => null };
  let refreshes = 0;
  const render = async (be) => {
    const body = el('div');
    const ctx = { body, selectedHost: null, done() { }, run() { }, refresh: () => { refreshes++; }, st: { [be]: { loggedIn: false } }, stale: () => false, racct: null };
    if (be === 'codex') await app._renderCodexAccounts(ctx); else await app._renderHomeAccounts(ctx, be);
    const row = body.children[0];
    const left = row?.children?.find((c) => /acct-key-row/.test(c.innerHTML || ''));
    return { rows: rowsOf(left?.innerHTML || ''), left };
  };
  const click = async (left, id) => left.onclick({ target: { closest: (sel) => (sel === '.acct-key-row' ? { dataset: { id } } : sel === '.acct-def' ? {} : null) } });
  // antigravity
  let r = await render('antigravity');
  const defs = (rows) => rows.filter((x) => x.def).map((x) => x.id).join(',');
  leg('antigravity, no default: the machine login is ★ and both Google accounts ☆', defs(r.rows) === '__home_global__' && r.rows.length === 3 && !r.rows.some((x) => x.half), JSON.stringify(r.rows));
  await click(r.left, g1.id);
  leg('a click on Personal Ultra\'s ☆ posts {id, backend: antigravity} and the store keeps defaultAntigravityAccountId', posted.at(-1)?.id === g1.id && posted.at(-1)?.backend === 'antigravity' && am.list().defaultAntigravityAccountId === g1.id && refreshes === 1, JSON.stringify(posted.at(-1)));
  r = await render('antigravity');
  leg('THE REPORT: the refresh draws Personal Ultra ★ and the machine login ☆ (the star moved)', defs(r.rows) === g1.id && !r.rows.some((x) => x.half), JSON.stringify(r.rows));
  await click(r.left, g2.id);
  r = await render('antigravity');
  leg('a click on Work moves the ★ there (one ★ at a time)', defs(r.rows) === g2.id, JSON.stringify(r.rows));
  await click(r.left, g2.id);
  r = await render('antigravity');
  leg('a click on the ★ itself clears it: the machine login is ★ again', defs(r.rows) === '__home_global__' && am.list().defaultAntigravityAccountId === null, JSON.stringify(r.rows));
  await click(r.left, g1.id);
  leg('…the claude and codex defaults never moved', am.list().defaultAccountId === null && am.list().defaultCodexAccountId === null);
  leg('the cache the New Session dialog and the resume verdict read carries antigravity\'s field (billingRow(be).defaultIdField)', (await app.refreshAccounts())?.[AM.billingRow('antigravity').defaultIdField] === g1.id);
  // codex twin
  let c = await render('codex');
  leg('codex, no default: its machine login is ★', defs(c.rows) === '__codex_global__', JSON.stringify(c.rows));
  am.setDefault(c1.id, 'codex');
  c = await render('codex');
  leg('THE CODEX TWIN: a starred ChatGPT account draws ★ and un-stars the machine row', defs(c.rows) === c1.id, JSON.stringify(c.rows));
  am.setDefault(null, 'codex');
  // the push
  if (PUSH) {
    const self = { _accounts: { accounts: [], subscription: { x: 1 } } };
    const msg = { type: 'accounts-updated', ...am.list() };
    new Function('msg', 'accountDefaultsOf', 'accountRowsOf', 'withTails', PUSH[1]).call(self, msg, AM.accountDefaultsOf, AM.accountRowsOf, ATL.withTails);   // accountRowsOf: lane lg-providers U5 (the push carries the providers' rows too)
    leg('the accounts-updated push keeps antigravity\'s field (and the fields it does not carry)', self._accounts.defaultAntigravityAccountId === g1.id && self._accounts.subscription?.x === 1, JSON.stringify(self._accounts));
  } else leg('the accounts-updated push line is found in app.js', false);
  am.setDefault(null, 'antigravity');
  return out;
}

console.log('① accountDefaultsOf (PURE)');
{
  const fields = AM.defaultIdFields();
  ok(`every billing row's field, read off the rows: ${fields.join(', ')}`, ['defaultAccountId', 'defaultCodexAccountId', 'defaultAntigravityAccountId'].every((f) => fields.includes(f)) && Object.keys(AM.BACKEND_META).every((be) => fields.includes(AM.billingRow(be).defaultIdField)));
  const d = AM.accountDefaultsOf({ defaultAccountId: 'a', defaultCodexAccountId: 'b', defaultAntigravityAccountId: 'c', other: 1 });
  ok('an answer\'s fields are copied, nothing else', d.defaultAccountId === 'a' && d.defaultCodexAccountId === 'b' && d.defaultAntigravityAccountId === 'c' && !('other' in d));
  ok('a missing field / no answer ⇒ null each', Object.values(AM.accountDefaultsOf({})).every((v) => v === null) && Object.values(AM.accountDefaultsOf(null)).every((v) => v === null));
}

console.log('② ③ ④ the rosters over the real store');
ok('app.js\'s refreshAccounts body is found (the legs run the product\'s own line)', !!RA && /\.\.\.accountDefaultsOf\(d\)/.test(RA[1]));
for (const x of await starLegs(MA, RA ? RA[1] : '')) ok(x.name, x.pass, x.detail);

console.log('— wiring');
{
  ok('both client cache writers copy every harness\'s field through accountDefaultsOf (no hand-picked default field left in app.js)', (APP.match(/\.\.\.accountDefaultsOf\(/g) || []).length === 3 && !/defaultCodexAccountId:/.test(APP) && !/defaultAccountId: (d|msg)\./.test(APP));
  const ma = read('src/lib/manage-agents.js');
  ok('the isolated-home roster reads ITS harness\'s field (bill.defaultIdField), never claude\'s', /const defId = accts\[bill\.defaultIdField\] \|\| null;/.test(ma));
}

console.log('⑤ negative controls');
{
  ok('control pre-fix: the base refreshAccounts line is swapped in', !!RA);
  const pre = RA ? RA[1].replace(/^ {6}if \(d\) this\._accounts = [^\n]*$/m, PRE_LINE) : '';
  ok('…the swap took (the pre-fix line is in the body)', pre.includes(PRE_LINE));
  const redP = (await starLegs(MA, pre)).filter((x) => !x.pass).map((x) => x.name);
  ok(`control pre-fix cache (two hand-picked fields — the owner's card): THE REPORT leg is RED (${redP.length} red), the codex twin stays green`, redP.some((n) => /^THE REPORT/.test(n)) && !redP.some((n) => /CODEX TWIN/.test(n)), redP.join(' | ').slice(0, 300));
  const M = mutantCopies('manage-agents', REPO);
  const SRC = read('src/lib/manage-agents.js');
  const FIND = 'const defId = accts[bill.defaultIdField] || null;';
  ok('control claude-field: the roster line exists', SRC.includes(FIND));
  const f = M.write('src/lib/manage-agents.js', SRC.replace(FIND, 'const defId = accts.defaultAccountId || null;'), 'claude-field');
  const Mut = await import(pathToFileURL(f).href);
  const redM = (await starLegs(Mut, RA ? RA[1] : '')).filter((x) => !x.pass).map((x) => x.name);
  ok(`control claude-field (the roster reads defaultAccountId): THE REPORT leg is RED (${redM.length} red)`, redM.some((n) => /^THE REPORT/.test(n)), redM.join(' | ').slice(0, 300));
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1 })) ok(r.name, r.pass, r.detail);
}

// ── THE PROVIDER REMOVE CONFIRM, DRIVEN WITH A STAND-IN APP (lane lg-providers, B-d578; the coordinator's 21:50Z: the Vault
// window's Remove sentence, the sidebar's rename winning over the raw name and the «and N more» join were pinned by source
// text only). The REAL provider-roster.js over a stand-in sidebar: namedLiveRows (the names the sidebar shows) → the ONE words
// function both doors call (the roster's Remove… with the provider's row, the Vault window's with ITS row shape)
{
  const PR = await import(path.join(REPO, 'src/lib/provider-roster.js'));
  const live = [{ id: 'w1', accountId: 'pv-ds1', name: 'Session 7' }, { id: 'w2', accountId: 'pv-ds1', name: 'Session 8' }, { id: 'w3', accountId: 'sub-x', name: 'Elsewhere' },
    ...Array.from({ length: 9 }, (_, i) => ({ id: 'n' + i, accountId: 'pv-ds1', name: 'run ' + i }))];
  const standIn = { sidebar: { _webuiSessions: live,
    _allSessions: [{ webuiId: 'w1', name: 'Session 7', cwd: '/home/u/proj' }, { webuiId: 'w2', name: 'Refactor the parser', cwd: '/home/u/p2' }],
    getCustomName: (row) => (row && row.webuiId === 'w1' ? 'Fix the build' : '') } };
  const WANT = ' Running on it now: Fix the build, Refactor the parser, run 0, run 1, run 2, run 3, run 4, run 5 and 3 more';
  const drive = (Mod) => {
    const rows = Mod.namedLiveRows(standIn);
    return { rows, vault: Mod.providerRemoveWords({ entry: 'provider:pv-ds1', field: 'key', kind: 'api-key', label: 'Model provider key · DeepSeek' }, rows),
      roster: Mod.providerRemoveWords({ id: 'pv-ds1', label: 'DeepSeek' }, rows), none: Mod.providerRemoveWords({ id: 'pv-ds2', label: 'Kimi' }, rows) };
  };
  const real = drive(PR);
  ok('the provider Remove confirm, driven: the rename wins over the raw name («Fix the build», never «Session 7»), the sidebar row\'s name over the live payload\'s, eight named then «and 3 more»; the Vault window\'s row names the provider by its name (never «Model provider key · …»); both doors say the same words; none on it ⇒ no sentence',
    real.vault.message.endsWith(WANT) && real.vault.title === 'Remove the model provider "DeepSeek"?' && real.vault.confirm === 'Remove'
    && real.roster.title === real.vault.title && real.roster.message === real.vault.message && !real.none.message.includes('Running on it now') && real.none.title === 'Remove the model provider "Kimi"?',
    JSON.stringify({ vault: real.vault, none: real.none.message.slice(-60) }).slice(0, 400));
  const VW = read('src/lib/vault-window.js');
  const RS0 = read('src/lib/provider-roster.js');
  ok('the Vault window\'s provider Remove IS that function over the page\'s named rows (its one line), its confirm asked with the app and handed on to the words (every hop), and the roster\'s dialog shows the words it was given',
    VW.includes('  provider: (row, app) => providerRemoveWords(row, namedLiveRows(app)),') && VW.includes('const w = confirmWords(d.confirm, row, app);') && VW.includes('  return w ? w(row, app) : {')
    && RS0.includes('const yes = await showConfirmDialog({ title: w.title, message: w.message, confirmText: w.confirm, danger: true });'));
  const PM = mutantCopies('manage-agents-pv', REPO);
  const RS = read('src/lib/provider-roster.js');
  const NAME = "(names && (() => { try { return names.nameOfLive(s); } catch { return ''; } })()) || (s && s.name) || ''";
  const MORE = " + (on.more ? ' ' + t('and {n} more', { n: on.more }) : '')";
  ok('controls: each anchor is in provider-roster.js once', RS.split(NAME).length === 2 && RS.split(MORE).length === 2);
  const raw = drive(await import(pathToFileURL(PM.write('src/lib/provider-roster.js', anchored(RS, NAME, "(s && s.name) || ''", 'the live payload\'s raw name'), 'raw-name')).href));
  ok('CONTROL: the live payload\'s raw name in place of the sidebar\'s («Session 7») ⇒ the leg goes RED', !raw.vault.message.endsWith(WANT) && raw.vault.message.includes('Session 7'), raw.vault.message.slice(-120));
  const cut = drive(await import(pathToFileURL(PM.write('src/lib/provider-roster.js', anchored(RS, MORE, '', 'the join without «and N more»'), 'no-more')).href));
  ok('CONTROL: the join without «and N more» (three conversations go unsaid) ⇒ the leg goes RED', !cut.vault.message.endsWith(WANT) && !cut.vault.message.includes('more'), cut.vault.message.slice(-80));
  for (const r of copiesCensus(PM.files, PM.dir, REPO, { minCopies: 2 })) ok(r.name, r.pass, r.detail);
}

// ── THE KEY TAILS ON THE PAGE (B-ba7d — the owner's decision 2026-11-18): the accounts list carries no tail; the page lays the
// person's own read (POST /api/accounts/tails) onto the rows it holds — the roster's «API …<tail>» and the CLI key's import
// compare read it. The REAL src/lib/account-tails.js over the fetch stand-in above (it answers as the routes do)
{
  const T = await import(path.join(REPO, 'src/lib/account-tails.js'));
  const TAIL = ['Wm3', 'k8Pz', 'Q'].join('');   // the last 8 of a key built at runtime
  const kid = am.add({ name: 'Console', key: ['sk-ant-', 'api03-', 'j'.repeat(30), TAIL].join('') }).id;
  T.notePush();   // the hub pushes accounts-updated on an add (B-ee0a smalls: the page asks again only after a push)
  const want = am.keyTails().accounts[kid];
  const bare = await fetchJson('/api/accounts');
  const laid = await T.accountsWithTails();
  const row = (d) => (d.accounts || []).find((a) => a.id === kid) || {};
  ok('the page\'s own read: the list it fetches holds no tail; the person\'s read lays it on the API-key row (the roster\'s «API …» and the import compare read it)',
    !!want && !('tail' in row(bare)) && row(laid).tail === want && T.tailsMissing(bare, { accounts: {} }) && !T.tailsMissing(bare, { accounts: { [kid]: want } }), { want, laid: row(laid).tail });
  globalThis.__tailsRefused = true;
  const T2 = await import(pathToFileURL(path.join(REPO, 'src/lib/account-tails.js')).href + '?refused');   // a fresh page (no earlier read)
  const refused = await T2.accountsWithTails();
  globalThis.__tailsRefused = false;
  ok('a refused read (not the person: 403) lays nothing — the row reads «API key» with no characters, never a wrong one', !('tail' in row(refused)), row(refused));
  const pushLaid = T.withTails({ type: 'accounts-updated', ...am.list() });
  const provLaid = T.withTails({ providerRows: [{ id: 'pv-x1', type: 'provider', name: 'DeepSeek' }] }, { accounts: {}, cliKey: null, providers: { 'pv-x1': '7c2e' } });
  ok('the providers\' rows get their tail from the same read (the pickers\' «DeepSeek — API …7c2e»)', provLaid.providerRows[0].tail === '7c2e', provLaid.providerRows);
  // a RE-KEYED provider on another tab: the cache's merged row (first laid «7c2e») re-laid at the next push takes the NEW tail
  const merged = T.withTails({ accounts: [{ id: 'pv-x1', type: 'provider', name: 'DeepSeek', tail: '7c2e' }] }, { accounts: {}, cliKey: null, providers: { 'pv-x1': '9b1f' } });
  ok('a re-keyed provider\'s row in the merged cache takes the NEW tail at the next re-lay (never the first lay\'s)', merged.accounts[0].tail === '9b1f', merged.accounts);
  ok('the accounts-updated push (no tail) gets the person\'s last read laid on by the page — the cache keeps showing it', row(pushLaid).tail === want && !JSON.stringify(am.list()).includes(want), row(pushLaid).tail);
  const AP = read('src/lib/app.js'), MAs = read('src/lib/manage-agents.js');
  ok('the page wiring: the app\'s refresh asks the list and the person\'s read together and lays them; its push handler lays the last read and asks again at every push (a re-keyed provider\'s new tail, never the old); the roster\'s own read goes through the same',
    AP.includes("return Promise.all([fetchJson('/api/accounts'), askTails()]).then(([d0, tl]) => {") && AP.includes('const d = withTails(d0, tl);') && AP.includes('accounts: accountRowsOf(withTails(msg))') && AP.includes('        askTails().then(() => { if (this._accounts && Array.isArray(this._accounts.accounts)) this._accounts = { ...this._accounts, accounts: withTails({ accounts: this._accounts.accounts }).accounts };')
    && MAs.includes('    try { acct = await accountsWithTails(); } catch {}'));
  const SC2 = read('src/lib/session-card.js'), CV = read('src/lib/chat-view.js'), SPp = read('src/lib/session-props.js'), WN = read('src/lib/window.js');
  ok('the conversation badges carry no key tail (the live payload reaches every client): the page reads the person\'s read by the badge\'s account id — the card, the chat header, Session Properties, the window chip',
    T.tailOf(kid) === want && T.tailOf('acct-unknown') === null
    && SC2.includes("${badgeTail(a) ? ' (…' + badgeTail(a) + ')' : ''}") && CV.includes("(badgeTail(a) ? ' (…' + badgeTail(a) + ')' : '')")
    && SPp.includes("tail: badgeTail(a) ? ' (…' + badgeTail(a) + ')' : ''") && WN.includes("(badgeTail(auth) ? ' (…' + badgeTail(auth) + ')' : '')")
    && [SC2, CV, SPp, WN].every((s) => s.includes("import { badgeTail } from './account-tails.js';")) && T.badgeTail({ accountId: kid }) === want && T.badgeTail({ tail: 'abcd' }) === 'abcd');
  const TM = mutantCopies('manage-agents-tails', REPO);
  const TS = read('src/lib/account-tails.js');
  const LAY = "  if (Array.isArray(d.accounts)) out.accounts = d.accounts.map((a) => { if (!a) return a; const v = a.type === 'provider' ? prov[a.id] : tails[a.id]; return typeof v === 'string' ? { ...a, tail: v } : a; });";
  ok('control: the lay-on is one line of account-tails.js', TS.split(LAY).length === 2);
  const Tx = await import(pathToFileURL(TM.write('src/lib/account-tails.js', anchored(TS, LAY, '  // CONTROL: the lay-on cut', 'the page without the lay-on'), 'no-lay')).href);
  ok('CONTROL: the page without the lay-on shows no tail on the API-key row though the person\'s read answered it ⇒ the legs above go RED', !('tail' in row(await Tx.accountsWithTails())));
  for (const r of copiesCensus(TM.files, TM.dir, REPO, { minCopies: 1 })) ok(r.name, r.pass, r.detail);
}

// B-ee0a smalls: ONE tails ask a PUSH (each ask is a synchronous read of the CLI's file on the hub's main loop): the app's push asks,
// every other reader (the roster's refresh, the app's own) takes that read; a refused read is never kept — the next reader asks
{
  const onePush = async (T) => {
    globalThis.__tailsAsks = 0;
    await Promise.all([T.askTails(), T.askTails()]); const first = globalThis.__tailsAsks;
    await T.askTails(); await T.accountsWithTails(); const reused = globalThis.__tailsAsks;
    T.notePush(); await Promise.all([T.askTails(), T.accountsWithTails()]); await T.accountsWithTails(); const afterPush = globalThis.__tailsAsks;
    globalThis.__tailsRefused = true; T.notePush(); await T.askTails(); globalThis.__tailsRefused = false; await T.askTails(); const afterRefusal = globalThis.__tailsAsks;
    return { first, reused, afterPush, afterRefusal };
  };
  const r1 = await onePush(await import(pathToFileURL(path.join(REPO, 'src/lib/account-tails.js')).href + '?onepush'));   // a fresh page
  const APP2 = read('src/lib/app.js');
  ok('ONE tails ask a push: two at once are one, the roster\'s refresh and a later reader take the last good read, a push asks once more, a refused read is asked again; the app notes each accounts push before it asks',
    r1.first === 1 && r1.reused === 1 && r1.afterPush === 2 && r1.afterRefusal === 4 && APP2.includes('        notePush();\n        askTails().then('), r1);
  const OTS = read('src/lib/account-tails.js');
  const GATE1 = '  if (readFor === pushes) return Promise.resolve(last);\n';
  const OM = mutantCopies('manage-agents-onepush', REPO);
  const r0 = await onePush(await import(pathToFileURL(OM.write('src/lib/account-tails.js', anchored(OTS, GATE1, '', 'the page that asks at every read'), 'every-read')).href));
  ok('CONTROL: the page that asks at every read (no push gate) asks again for the roster\'s refresh ⇒ the leg above goes RED', r0.reused > r0.first, r0);
  for (const r of copiesCensus(OM.files, OM.dir, REPO, { minCopies: 1 })) ok(r.name, r.pass, r.detail);
}

// B-ee0a: A PAIRED machine's CLI-key tail — its accounts-status answer carries none; the REAL page helper lays the person's read on
// (withHostKeyTail: Manage Agents' host roster «API key …», «Import its key» and the «already imported» compare read it)
{
  const T = await import(path.join(REPO, 'src/lib/account-tails.js'));
  const HT = ['Hx', '4v', 'Lm9q'].join('');
  globalThis.__hostTail = HT;
  const st = { cliKey: { present: true }, subscription: {} };
  const laid = await T.withHostKeyTail('host-1', st);
  const none = await T.withHostKeyTail('host-1', { cliKey: { present: false } });
  globalThis.__tailsRefused = true; const refused = await T.withHostKeyTail('host-1', st); globalThis.__tailsRefused = false;
  globalThis.__hostTail = undefined;
  const MA = read('src/lib/manage-agents.js');
  ok('a paired machine\'s CLI-key tail: the person\'s read lays it on the machine\'s answer (a copy — the answer itself untouched); none asked for no key; a refused read lays nothing; the host roster reads through it',
    laid.cliKey.tail === HT && !('tail' in st.cliKey) && !('tail' in none.cliKey) && !('tail' in refused.cliKey)
    && MA.includes('racct = await withHostKeyTail(selectedHost, await fetchJson(`/api/hosts/${encodeURIComponent(selectedHost)}/accounts-status`));'), { laid: laid.cliKey, refused: refused.cliKey });
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
