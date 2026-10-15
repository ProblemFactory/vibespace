#!/usr/bin/env node
// RESUME ACCOUNT VERDICT (lane resume-account-door, owner 2026-10-15 「无法 resume 一个对话」) — FAST: no network, no CLI.
// A stopped conversation pinned to an account that cannot serve used to fail at the create (resolveForSpawn threw
// "subscription not logged in: <name>") into a red toast over an unchanged Resume bar. The Resume press now asks the
// PURE verdict (src/resume-account.js) first; a refusal is said in the bar with two doors.
//   ① the verdict table — every `why` from a fixture shaped like the real data: a REAL AccountManager in a scratch data
//     dir (sub-<12hex> ids minted at runtime), its list() rows, and the `logins` map built the way the usage route
//     builds it (login-state accountLoginState) — wiped / never-logged-in / expired / oat-expired / missing / remote /
//     pool-no-target / ok, with the instant each one stopped serving
//   ② the doors: relogin first, then switch — the pool first when one can serve, then the default, then the rest;
//     no pool off this machine; never the pinned account itself
//   ③ the verdict agrees with the create: every local refusal is a resolveForSpawn throw (bar `expired`, which the
//     create lets through to fail at the CLI's first refresh), every ok row spawns
//   ④ the sentences in three languages (en / zh / ja): the account named, the date said, no placeholder left
//   ⑤ RED control = the old path: no verdict ⇒ every refusing row goes straight to the create ⇒ the toast shape
//     (`Account error: <message>`, no door); the last-resort toast now names both doors; the press census (chat-view
//     asks before it resumes) with a planted copy that does not ask
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RA = require(path.join(REPO, 'src/resume-account.js'));
const { accountLoginState } = require(path.join(REPO, 'src/login-state.js'));
const AccountManager = require(path.join(REPO, 'src/accounts.js'));
const AM = AccountManager.AccountManager || AccountManager;
const ZH = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default;
const JA = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 900) : '')); } };
const J = JSON.stringify;

// ── fixtures: the shape of the real data ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-resume-acct-'));
const accounts = new AM({ dataDir: tmp, onChange: () => {} });
const NOW = Date.now(), DAY = 86400e3;
const creds = (id, o) => fs.writeFileSync(accounts.subCredsPath(id), JSON.stringify({ claudeAiOauth: o }));
const live = (id) => creds(id, { accessToken: 'at-' + id, refreshToken: 'rt-' + id, expiresAt: NOW + 3600e3, refreshTokenExpiresAt: NOW + 20 * DAY, scopes: ['user:inference'] });
const sub = (name) => accounts.createSubscription({ name }).id;
const OAT = 'sk-ant-oat01-' + 'q'.repeat(48);
// Account B — logged in, then WIPED three days ago: the CLI's wiped shape (tokens blanked, deadline + scopes kept)
const B = sub('Account B');
creds(B, { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: NOW + 17 * DAY, scopes: ['user:inference'] });
const WIPED_AT = Math.round((NOW - 3 * DAY) / 1000) * 1000;
fs.utimesSync(accounts.subCredsPath(B), new Date(WIPED_AT), new Date(WIPED_AT));
const N = sub('Account N');                        // never signed in: an empty dir
const E = sub('Account E');                        // the login's refresh deadline passed two days ago (tokens still there)
const E_AT = NOW - 2 * DAY;
creds(E, { accessToken: 'at-e', refreshToken: 'rt-e', expiresAt: E_AT - 3600e3, refreshTokenExpiresAt: E_AT, scopes: ['user:inference'] });
const T = sub('Account T');                        // no login; its long-lived token ended (minted 400 days ago, lives 365)
accounts.setOat(T, OAT);
accounts.get(T).oatMintedAt = NOW - 400 * DAY;
const O = sub('Account O');                        // no login, a LIVE long-lived token: the token is the spawn
accounts.setOat(O, OAT);
const C = sub('Account C'); live(C);               // healthy
const D = sub('Account D'); live(D);               // healthy until its pool's last member goes
const K = accounts.add({ name: 'Account K', key: 'sk-ant-api03-' + 'z'.repeat(80) }).id; // an API key
const P = accounts.createPool({ name: 'Pool P', members: [C] }).id;   // serves through C
const Q = accounts.createPool({ name: 'Pool Q', members: [D] }).id;   // …then D is wiped: no member can serve
creds(D, { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: NOW + 9 * DAY, scopes: ['user:inference'] });
const GONE = 'sub-' + 'f0e1d2c3b4a5';                                 // a removed account's id
accounts.setDefault(K);

const list = () => accounts.list();
// the usage route's `logins` map, built the way usage-routes builds it (src/login-state.js, account level)
const loginsOf = (rows) => Object.fromEntries(rows.filter((a) => a.type === 'subscription' && (a.backend || 'claude') === 'claude')
  .map((a) => { const st = accountLoginState(accounts.subCredsPath(a.id), { backend: 'claude', oatMintedAt: a.oat ? (a.oatMintedAt || null) : null }); return [a.id, { state: st.state, usable: st.usable, since: st.since || null }]; }));
const L = list();
const LOGINS = loginsOf(L.accounts);
const nameOf = (id) => L.accounts.find((a) => a.id === id)?.name;
const verdict = (account, { host = null, hostVerdicts = null, poolAvailable, defaultAccountId = L.defaultAccountId, machineLogin = { loggedIn: true }, fn = RA.resumeAccountVerdict } = {}) =>
  fn({ pinned: { account, backend: 'claude', host }, accounts: L.accounts, loginStates: LOGINS, poolAvailable, defaults: { defaultAccountId, machineLogin, hostVerdicts } });

console.log('── ① the verdict table (a real AccountManager, its list() rows, the usage route\'s logins) ──');
ok('fixtures read as the real readers read them: B wiped (login-state) / logged-out (login-expiry), E expired, T\'s token ended, O\'s lives',
  LOGINS[B].state === 'wiped' && L.accounts.find((a) => a.id === B).loginState.state === 'logged-out'
  && L.accounts.find((a) => a.id === E).loginState.state === 'expired' && L.accounts.find((a) => a.id === T).oatDaysLeft < 0 && L.accounts.find((a) => a.id === O).oatDaysLeft >= 0,
  { B: LOGINS[B], Bls: L.accounts.find((a) => a.id === B).loginState, E: L.accounts.find((a) => a.id === E).loginState });
const HOST = 'host-' + '7c2e9a11';
const TABLE = [
  ['wiped (the incident)', B, {}, { why: 'wiped', name: 'Account B', since: WIPED_AT }],
  ['never logged in', N, {}, { why: 'never-logged-in', name: 'Account N', since: null }],
  ['expired', E, {}, { why: 'expired', name: 'Account E', since: E_AT }],
  ['oat expired', T, {}, { why: 'oat-expired', name: 'Account T' }],
  ['missing account', GONE, {}, { why: 'missing-account', name: null, since: null }],
  ['remote cannot ship (the host\'s verdict)', C, { host: HOST, hostVerdicts: { [C]: { usable: false, reason: 'ship-disabled' } } }, { why: 'remote-cannot-ship', name: 'Account C' }],
  ['remote: a pool never runs on a host', P, { host: HOST, hostVerdicts: {} }, { why: 'remote-cannot-ship', name: 'Pool P' }],
  ['pool with no member that can serve', Q, {}, { why: 'pool-no-target', name: 'Pool Q' }],
];
for (const [label, id, o, want] of TABLE) {
  const v = verdict(id, o);
  ok(`${label}: ${want.why} · ${want.name ? '"' + want.name + '"' : '(no name: removed)'}${want.since !== undefined && want.since !== null ? ' · since ' + new Date(want.since).toISOString().slice(0, 10) : ''}`,
    !v.ok && v.why === want.why && (v.account?.name ?? null) === want.name && (want.since === undefined || v.since === want.since), v);
}
ok('oat expired: since = the token\'s own end (mint + 365 days)', (() => { const v = verdict(T); return typeof v.since === 'number' && Math.abs(v.since - (NOW - 35 * DAY)) < DAY; })(), verdict(T));
const OKS = [['healthy subscription', C], ['API key', K], ['a live long-lived token, no login', O], ['a pool that can serve', P],
  ['the machine\'s own login', 'subscription'], ['the default account (pin empty → K)', ''], ['a host whose verdict says usable', C, { host: HOST, hostVerdicts: { [C]: { usable: true, how: 'host-held' } } }],
  ['a host not answered yet: no claim', C, { host: HOST, hostVerdicts: null }]];
for (const [label, id, o] of OKS) { const v = verdict(id, o || {}); ok(`ok: ${label}`, v.ok === true, v); }
ok('a stale default id (the pin empty): refused as missing — the create throws unknown account too', (() => { const v = verdict('', { defaultAccountId: GONE }); return !v.ok && v.why === 'missing-account' && v.viaDefault === true; })(), verdict('', { defaultAccountId: GONE }));
ok('the pin empty + a dead DEFAULT: refused, said as the default (viaDefault)', (() => { const v = verdict('', { defaultAccountId: B }); return !v.ok && v.why === 'wiped' && v.viaDefault === true; })());
ok('every why in the table is a declared why', TABLE.every(([, , , w]) => RA.RESUME_ACCOUNT_WHYS.includes(w.why)) && new Set(TABLE.map((r) => r[3].why)).size === RA.RESUME_ACCOUNT_WHYS.length);

console.log('── ② the doors ──');
{
  const v = verdict(B);
  const [re, sw] = v.doors;
  ok('two doors, relogin first then switch', v.doors.length === 2 && re.kind === 'relogin' && re.accountId === B && re.via === 'login' && sw.kind === 'switch', v.doors);
  ok('switch.to: the pool first, then the default account, then the rest by the roster\'s order, the machine login last',
    J(sw.to.map((c) => [c.kind, c.name])) === J([['pool', 'Pool P'], ['default', 'Account K'], ['account', 'Account C'], ['account', 'Account O'], ['machine', null]]), sw.to);
  ok('never offered: the pinned account, a pool with no member (Q), a dead login (E, N, T, D)', !sw.to.some((c) => [B, Q, E, N, T, D].includes(c.id)));
  const nopool = verdict(B, { poolAvailable: false });
  ok('poolAvailable false ⇒ no pool offered (the default comes first)', nopool.doors[1].to[0].kind === 'default' && !nopool.doors[1].to.some((c) => c.kind === 'pool'), nopool.doors[1].to);
  const remote = verdict(C, { host: HOST, hostVerdicts: { [C]: { usable: false, reason: 'ship-disabled' }, [K]: { usable: true, how: 'ship' }, [O]: { usable: true, how: 'oat' } } });
  ok('a remote refusal: relogin opens Manage agents (via manage), no pool and no machine login offered there', remote.doors[0].via === 'manage' && J(remote.doors[1].to.map((c) => c.name)) === J(['Account K', 'Account O']), remote.doors);
  const gone = verdict(GONE);
  ok('missing account: no relogin door (nothing to log in), the switch door alone', gone.doors.length === 1 && gone.doors[0].kind === 'switch' && gone.doors[0].to.length > 0, gone.doors);
  ok('a pool refusal: relogin opens Manage agents on the pool (via manage)', verdict(Q).doors[0].via === 'manage');
  const lonely = RA.resumeAccountVerdict({ pinned: { account: B }, accounts: L.accounts.filter((a) => a.id === B), loginStates: LOGINS, defaults: {} });
  ok('nothing else can serve: the switch door is empty and the words say so', lonely.doors[1].to.length === 0 && /No other account/.test(RA.resumeAccountWords(lonely).none || ''), lonely);
}

console.log('── ③ the verdict agrees with the create (resolveForSpawn) ──');
const spawn = (id) => { try { accounts.resolveForSpawn(id); return { threw: null }; } catch (e) { return { threw: e.message }; } };
for (const [label, id] of [['wiped', B], ['never logged in', N], ['oat expired', T], ['missing', GONE]]) {
  const s = spawn(id);
  ok(`refused ${label} ⇒ the create would throw too ("${(s.threw || '').slice(0, 60)}")`, !!s.threw, s);
}
ok('the incident\'s exact sentence: subscription not logged in: Account B', spawn(B).threw === 'subscription not logged in: Account B', spawn(B));
{ const was = accounts._state.defaultAccountId; accounts._state.defaultAccountId = GONE; const st = spawn(''); accounts._state.defaultAccountId = was; ok('a stale default id ⇒ the create throws too (unknown account)', /unknown account/.test(st.threw || ''), st); }
ok('expired: the create lets it through (it parses loggedIn) — the verdict refuses it before the CLI\'s first refresh fails', spawn(E).threw === null && !verdict(E).ok);
for (const [label, id] of [['healthy', C], ['API key', K], ['live oat', O], ['pool', P]]) ok(`ok ${label} ⇒ the create spawns`, spawn(id).threw === null && verdict(id).ok, spawn(id));

console.log('── ④ the sentences, in three languages ──');
const tOf = (dict) => (s, p) => { let x = (dict && dict[s]) || s; if (p) x = x.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)); return x; };
const DATE = (ms) => new Date(ms).toISOString().slice(0, 10);
const LANGS = [['en', null], ['zh', ZH], ['ja', JA]];
for (const [label, id, o] of TABLE) {
  const v = verdict(id, o);
  const rows = LANGS.map(([lang, dict]) => [lang, RA.resumeAccountWords(v, { t: tOf(dict), date: DATE, hostName: 'Box H' })]);
  const nm = v.account?.name;
  const good = rows.every(([, w]) => w && w.sentence && !/\{\w+\}/.test(w.sentence) && (!nm || w.sentence.includes(nm)) && (!v.since || w.sentence.includes(DATE(v.since))) && w.switch && !/\{\w+\}/.test(w.relogin || ''));
  const translated = rows[1][1].sentence !== rows[0][1].sentence && rows[2][1].sentence !== rows[0][1].sentence && rows[1][1].switch === '改用别的账号';
  ok(`${v.why}: en / zh / ja name the account${v.since ? ' and the date' : ''} — zh: ${rows[1][1].sentence}`, good && translated, rows);
}
{
  const w = RA.resumeAccountWords(verdict(B), { t: tOf(ZH), date: DATE });
  ok('zh doors: 「重新登录 Account B」 · 「改用别的账号」', w.relogin === '重新登录 Account B' && w.switch === '改用别的账号', w);
  const wj = RA.resumeAccountWords(verdict(B), { t: tOf(JA), date: DATE });
  ok('ja doors: 「Account B に再ログイン」 · 「別のアカウントを使う」', wj.relogin === 'Account B に再ログイン' && wj.switch === '別のアカウントを使う', wj);
  ok('a remote refusal names the host', RA.resumeAccountWords(verdict(C, { host: HOST, hostVerdicts: { [C]: { usable: false, reason: 'dial-no-ship' } } }), { hostName: 'Box H' }).sentence.includes('Box H'));
  const c = verdict(B).doors[1].to;
  ok('the picker\'s labels: the pool and the default said, the machine login in the billing row\'s word (zh)',
    J(c.map((x) => RA.candidateLabel(x, { t: tOf(ZH), machine: 'Subscription' }))) === J(['Pool P（池）', 'Account K（默认账号）', 'Account C', 'Account O', ZH.Subscription || 'Subscription']), c.map((x) => RA.candidateLabel(x, { t: tOf(ZH), machine: 'Subscription' })));
  ok('an ok verdict has no words (the bar keeps its Resume button)', RA.resumeAccountWords({ ok: true }) === null);
}

console.log('── ⑤ RED control: the old path (no verdict) ⇒ the toast shape ──');
{
  const NO_VERDICT = () => ({ ok: true }); // the base's Resume press: it never asked, it went straight to the create
  const refusing = TABLE.filter(([, id, o]) => !verdict(id, o).ok);
  const red = refusing.filter(([, id, o]) => verdict(id, { ...o, fn: NO_VERDICT }).ok);
  ok(`RED: without the verdict every refusing row (${refusing.length}) goes to the create — none is said in the bar`, red.length === refusing.length && refusing.length === TABLE.length, red.length);
  // the base's ws-create.js line (quoted): `message: 'Account error: ' + e.message` — a red toast that names no door
  const OLD_TOAST = (e) => 'Account error: ' + e.message;
  const oldText = OLD_TOAST(new Error(spawn(B).threw));
  ok(`RED: the old toast for the incident names no door — "${oldText}"`, oldText === 'Account error: subscription not logged in: Account B' && !/Manage agents|Session Properties/.test(oldText));
  const wsCreate = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  const line = wsCreate.split('\n').find((l) => l.includes("message: 'Account error: ' + e.message")) || '';
  ok('the last-resort toast (ws-create) now names both doors: Manage agents + Session Properties', /log it in again in Manage agents/.test(line) && /another account in Session Properties/.test(line), line.trim().slice(0, 200));
  // the press census: chat-view's _resumeAndClose asks resumeAccountCheck BEFORE it calls resumeSession
  const pressAsks = (src) => {
    const i = src.indexOf('  _resumeAndClose(');
    const body = i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i));
    const ask = body.indexOf('this.app.resumeAccountCheck('), go = body.indexOf('this.app.resumeSession(');
    return ask > 0 && go > ask && /_showAccountRefusalBar\(v, q\)/.test(body);
  };
  const cv = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
  ok('census: the Resume press asks the verdict before the create, and a refusal draws the bar', pressAsks(cv));
  const planted = cv.replace('this.app.resumeAccountCheck(q)', 'Promise.resolve({ ok: true })');
  ok('census control: a planted press that does not ask is RED', planted !== cv && !pressAsks(planted));
  const sl = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
  ok('the picker and the billing switcher persist through ONE door (_persistAccountOnCreate)', (sl.match(/this\._persistAccountOnCreate\(/g) || []).length === 1 && /this\.app\._persistAccountOnCreate\?\.\(/.test(cv) && !/const persistOnSuccess = \(ok2, createdMsg\) =>/.test(sl));
}

console.log('── ⑥ planted mutants: the table bites ──');
{
  const src = fs.readFileSync(path.join(REPO, 'src/resume-account.js'), 'utf8').replace("require('./login-expiry.js')", J(path.join(REPO, 'src/login-expiry.js')).replace(/^/, 'require(') + ')');
  const load = (s) => { const f = path.join(tmp, `ra-mutant-${Math.random().toString(16).slice(2)}.cjs`); fs.writeFileSync(f, s); return require(f); };
  const M = [
    ['the wiped reading ignored ⇒ the incident reads never-logged-in', "if ((ls && ls.state === 'logged-out') || (cred && cred.state === 'wiped'))", 'if (false)', () => verdict(B, { fn: mut.resumeAccountVerdict }).why !== 'wiped'],
    ['the pool not put first ⇒ the default leads the picker', "for (const a of rows.filter(isPool).sort(byRoster)) add(a, 'pool');", '', () => verdict(B, { fn: mut.resumeAccountVerdict }).doors[1].to[0].kind !== 'pool'],
    ['the dead login trusted ⇒ expired reads ok', 'if (!ls || loginUsable(ls)) return { ok: true };', 'return { ok: true };', () => verdict(E, { fn: mut.resumeAccountVerdict }).ok],
  ];
  var mut;
  for (const [label, from, to, red] of M) {
    ok(`mutant anchor found: ${label}`, src.includes(from));
    mut = load(src.replace(from, to));
    ok(`RED mutant: ${label}`, red());
  }
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
