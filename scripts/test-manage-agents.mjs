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
import { scratch } from './scratch.mjs';
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
  if (u === '/api/accounts/default' && opts.method === 'POST') {
    const b = JSON.parse(opts.body || '{}'); posted.push(b);
    try { am.setDefault(b.id || null, b.backend || 'claude'); return answer({ success: true }); } catch (e) { return answer({ error: e.message }, 400); }
  }
  return answer({ error: 'unexpected ' + u }, 404);
};
const { fetchJson } = await import(path.join(REPO, 'src/lib/utils.js'));

// ── THE REAL refreshAccounts body, lifted from app.js (a control swaps in the pre-fix line) ──
const APP = read('src/lib/app.js');
const RA = /\n  refreshAccounts\(\) \{\n([\s\S]*?)\n  \}\n/.exec(APP);
const PRE_LINE = "      if (d) this._accounts = { accounts: d.accounts || [], defaultAccountId: d.defaultAccountId || null, defaultCodexAccountId: d.defaultCodexAccountId || null, subscription: d.subscription || {}, cliKey: d.cliKey || {} };";
const refreshFrom = (body) => new Function('fetchJson', 'accountDefaultsOf', `return function refreshAccounts() {\n${body}\n}`)(fetchJson, AM.accountDefaultsOf);
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
    new Function('msg', 'accountDefaultsOf', PUSH[1]).call(self, msg, AM.accountDefaultsOf);
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

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
