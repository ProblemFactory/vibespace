#!/usr/bin/env node
// Re-login-on-this-machine (2.332.0): the route's building blocks — the login
// command must target the EXISTING account dir (identity/pool membership
// survive), and the attempt-baseline plumbing must never throw on accounts
// that have no login-status file yet.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { AccountManager } = require('../src/accounts.js');
const { buildClaudeSubscriptionLoginCommand } = require('../src/claude-subscription-login.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-relogin-'));
try {
  const am = new AccountManager({ dataDir: tmp });
  const { id } = am.createSubscription({ name: 'ReloginMe' });
  const dir = am.subDir(id);
  const cmd = buildClaudeSubscriptionLoginCommand({ nodeCmd: 'node', helperPath: '/x/helper.mjs', claudeCmd: 'claude', configDir: dir });
  ok(cmd.includes(dir), 'login command is scoped to the EXISTING account dir', cmd);
  ok(/--config-dir/.test(cmd), 'dir travels as --config-dir argv — the HELPER sets both config envs itself (env isolation is its contract)');
  ok(am._subscriptionLoginStatus(id) == null || typeof am._subscriptionLoginStatus(id) === 'object',
    'login-status read never throws on a status-less account (baseline=null path)');
  // a token-less husk (the real trigger for this feature) still yields a
  // usable dir + command — re-login needs no remove/re-add
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { scopes: [] } }));
  ok(!am.readSubCreds(id).loggedIn, 'husk reads as signed out');
  const cmd2 = buildClaudeSubscriptionLoginCommand({ nodeCmd: 'node', helperPath: '/x/helper.mjs', claudeCmd: 'claude', configDir: am.subDir(id) });
  ok(cmd2.includes(dir), 'signed-out account still gets a valid re-login command into the SAME dir');

  // ── THE RELOGIN DOOR ON THE ONE COMPARISON (row B-87fd identity unit 3, 主开发 r2533 / r2536): the scenes table, a leg each.
  // BEFORE = what the row's folder names at the «sign in again» press (reloginBegin); AFTER = what it names at the resolve. Every
  // folder here is a stand-in written as the CLI writes it; every address and id is made up.
  const am2 = new AccountManager({ dataDir: path.join(tmp, 'door') });
  const EXP = Date.now() + 29 * 86400e3, ORG = 'org-made-up-1';
  const personOf = (email) => 'p-' + email.split('@')[0] + '-made-up';
  const credsAt = (dir) => path.join(dir, '.credentials.json'), cfgAt = (dir) => path.join(dir, '.claude.json');
  const live = (dir, email, { cfg = true, org = ORG } = {}) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(credsAt(dir), JSON.stringify({ claudeAiOauth: { accessToken: 'at-' + email, refreshToken: 'rt-' + email, expiresAt: Date.now() + 3600e3, refreshTokenExpiresAt: EXP, scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } }));
    if (cfg) fs.writeFileSync(cfgAt(dir), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: personOf(email), organizationUuid: org, organizationName: 'Org' } }));
    else fs.rmSync(cfgAt(dir), { force: true });
  };
  const expired = (dir) => { const c = JSON.parse(fs.readFileSync(credsAt(dir), 'utf8')); c.claudeAiOauth.accessToken = 'at-old'; c.claudeAiOauth.refreshToken = 'rt-old'; c.claudeAiOauth.expiresAt = Date.now() - 3600e3; fs.writeFileSync(credsAt(dir), JSON.stringify(c)); };
  // THE CLI's OWN BLANKED RESIDUE (src/login-state.js, src/login-expiry.js): blank tokens, expiresAt 0, the deadline and scopes kept
  const blank = (dir, o = {}) => fs.writeFileSync(credsAt(dir), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: EXP - 1000, scopes: ['user:inference', 'user:profile'], ...o } }));
  const ours = (dir) => fs.writeFileSync(credsAt(dir), JSON.stringify({ claudeAiOauth: { accessToken: ['made-up', 'long-lived'].join('-'), expiresAt: Date.now() + 300 * 86400e3, scopes: ['user:inference'], subscriptionType: 'max' }, vibespaceOat: { id: 'made-up' } }));
  const row = (email) => { const id = am2.createSubscription({}).id; if (email) { live(am2.subDir(id), email); am2.finalizeSubscription(id); } return id; };
  const relogin = (id, as, opts) => { am2.reloginBegin(id); if (as) live(am2.subDir(id), as, opts); return am2.reloginResolve(id); };
  const n0 = () => am2.list().accounts.length;
  const held = (id) => fs.existsSync(path.join(am2.subDir(id), '.vibespace-relogin-held', '.credentials.json'));
  // 1. a refreshable sign-in that only EXPIRED (its tokens and config still there)
  { const s = row('a1@example.invalid'); expired(am2.subDir(s)); const r = relogin(s, 'a1@example.invalid');
    const s2 = row('a2@example.invalid'); expired(am2.subDir(s2)); const k = n0(); const r2 = relogin(s2, 'b2@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'split' && n0() === k + 1 && !am2.readSubCreds(s2).loggedIn, 'scene 1 (an expired refreshable sign-in): the same person back ⇒ SAME, in place; another account ⇒ DIFFERENT, a new row, this row signed out', JSON.stringify([r.outcome, r2.outcome])); }
  // 2. signed out BY THE CLI (blanked; the config of that login kept) — BEFORE reads the folder's LAST login (R4)
  { const s = row('a3@example.invalid'); blank(am2.subDir(s)); const r = relogin(s, 'a3@example.invalid');
    const s2 = row('a4@example.invalid'); blank(am2.subDir(s2)); const r2 = relogin(s2, 'b4@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'split', 'scene 2 (the CLI ended the sign-in, its config kept): the same person ⇒ SAME by the last login\'s seat; another ⇒ DIFFERENT (never in place: the release\'s name check kept, by the seat)', JSON.stringify([r.outcome, r2.outcome])); }
  // 2b. …and its config cleared too (unproven whether the vendor's sign-out does): the row's NAME (its login's address) checks the read
  { const s = row('a5@example.invalid'); blank(am2.subDir(s)); fs.rmSync(cfgAt(am2.subDir(s))); const r = relogin(s, 'a5@example.invalid');
    const s2 = row('a6@example.invalid'); blank(am2.subDir(s2)); fs.rmSync(cfgAt(am2.subDir(s2))); const r2 = relogin(s2, 'b6@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'ask' && held(s2) && !am2.readSubCreds(s2).loggedIn, 'scene 2b (blanked, config cleared): the row\'s name checks the read — equal ⇒ SAME; different ⇒ ASK (the sign-in HELD, not adopted: the row stays signed out) — never a split on a word alone', JSON.stringify([r.outcome, r2.outcome]));
    const listed = am2.list().accounts.find((x) => x.id === s2);
    ok(listed && listed.reloginAsk && JSON.stringify(Object.keys(listed.reloginAsk)) === '["at"]', 'the asked row carries its question as a MARK (when), no identity — the list and its push', listed && listed.reloginAsk);
    const ans = am2.reloginAnswer(s2, 'same');
    ok(ans.outcome === 'same' && am2.readSubCreds(s2).loggedIn && !held(s2) && !am2.list().accounts.find((x) => x.id === s2).reloginAsk, '«the same account: keep this row» ⇒ the held sign-in returns into the row, in place; the question gone', ans.outcome);
    ok(am2.reloginAnswer(s2, 'same').outcome === 'none', 'a second answer ⇒ «none» (nothing asked any more), said by name'); }
  // (b) THE ROW's OWN WORD OUTRANKS THE CONFIG ALONE: a typed address that disagrees with the last login ⇒ a conflict ⇒ ASK
  { const s = row('a7@example.invalid'); am2.setEmail(s, 'c7@example.invalid'); blank(am2.subDir(s)); const r = relogin(s, 'a7@example.invalid');
    ok(r.outcome === 'ask', 'condition (b): blanked, the config names a7 but the row\'s typed address is c7 ⇒ ASK — never «same» on a config against the row\'s own word', r.outcome); }
  // 3. «wiped by the product»: the product never signs a row out — its overwrite of a dead login is the long-lived token: scene 5
  // 4. a row NEVER signed in: a first sign-in names it
  { const s = am2.createSubscription({}).id, s2 = am2.createSubscription({}).id;
    const r = relogin(s, 'a8@example.invalid'), r2 = relogin(s2, 'b8@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'same', 'scene 4 (never signed in): any sign-in ⇒ IN PLACE, nothing asked (nothing to disagree with)', JSON.stringify([r.outcome, r2.outcome])); }
  // 5. a row on a LONG-LIVED token (ours), the mint's typed address, the config of an OLD login beside it
  const tokenRow = () => { const s = am2.createSubscription({}).id, d = am2.subDir(s); fs.mkdirSync(d, { recursive: true }); ours(d); fs.writeFileSync(cfgAt(d), JSON.stringify({ oauthAccount: { emailAddress: 'x9@example.invalid', accountUuid: personOf('x9@example.invalid'), organizationUuid: ORG } })); am2.setEmail(s, 'a9@example.invalid'); return s; };
  { const r = relogin(tokenRow(), 'a9@example.invalid'), s2 = tokenRow(), r2 = relogin(s2, 'b9@example.invalid'), r3 = relogin(tokenRow(), 'x9@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'ask' && r3.outcome === 'ask', 'scene 5 (a long-lived token row): the same person (the mint\'s address) ⇒ SAME; another ⇒ ASK; the OLD login the config names ⇒ ASK, never «same» by the config beside a token (law 5)', JSON.stringify([r.outcome, r2.outcome, r3.outcome]));
    const k = n0(), ans = am2.reloginAnswer(s2, 'another'), made = am2.list().accounts.find((x) => ans.account && x.id === ans.account.id);
    ok(ans.outcome === 'split' && n0() === k + 1 && made && am2.readSubCreds(made.id).loggedIn && !am2.readSubCreds(s2).loggedIn, '«another account: make a new row» ⇒ a NEW row holds the sign-in; this row stays as it was (signed out)', ans.outcome); }
  // 6. a TYPED address only (a sign-in flow that writes no config)
  { const s = am2.createSubscription({}).id; live(am2.subDir(s), 'a10@example.invalid', { cfg: false }); am2.finalizeSubscription(s); am2.setEmail(s, 'a10@example.invalid');
    const r = relogin(s, 'a10@example.invalid', { cfg: false });
    const s2 = am2.createSubscription({}).id; live(am2.subDir(s2), 'a11@example.invalid', { cfg: false }); am2.finalizeSubscription(s2); am2.setEmail(s2, 'a11@example.invalid');
    const r2 = relogin(s2, 'a11@example.invalid'), s3 = am2.createSubscription({}).id; am2.setEmail(s3, 'a12@example.invalid'); const r3 = relogin(s3, 'b12@example.invalid');
    ok(r.outcome === 'same' && r2.outcome === 'same' && r3.outcome === 'ask', 'scene 6 (a typed address only): AFTER names nothing read ⇒ IN PLACE; AFTER names the typed address ⇒ SAME; another address ⇒ ASK', JSON.stringify([r.outcome, r2.outcome, r3.outcome])); }
  // MOVED: the sign-in is another row's — its record (read facts) is «same»
  { const o = row('m1@example.invalid'), s = row('a13@example.invalid'); const r = relogin(s, 'm1@example.invalid');
    ok(r.outcome === 'moved' && r.movedTo && r.movedTo.id === o && am2.readSubCreds(o).loggedIn && !am2.readSubCreds(s).loggedIn, 'another row whose record is «same» ⇒ MOVED into it (its read facts, never a word)', JSON.stringify(r)); }
  // A LOST BEFORE: a restart between the press and the resolve (a new store on the same data), and a before past its time
  { const d = path.join(tmp, 'restart'), A = new AccountManager({ dataDir: d });
    const mk = (email, name) => { const id = A.createSubscription({}).id; live(A.subDir(id), email); A.finalizeSubscription(id); if (name) A.rename(id, name); A.reloginBegin(id); return id; };
    const sWord = mk('a14@example.invalid'), sNone = mk('a15@example.invalid', 'Work laptop'), sEq = mk('a16@example.invalid');
    live(A.subDir(sWord), 'b14@example.invalid'); live(A.subDir(sNone), 'b15@example.invalid'); live(A.subDir(sEq), 'a16@example.invalid');
    const B = new AccountManager({ dataDir: d });   // the hub restarted: the kept BEFOREs are gone
    const rW = B.reloginResolve(sWord), rN = B.reloginResolve(sNone), rE = B.reloginResolve(sEq);
    ok(rW.outcome === 'ask' && rW.lost === true && rN.outcome === 'ask' && rN.lost === true && rE.outcome === 'same', 'a LOST before (a restart): the row\'s own word checks the read (equal ⇒ SAME, else ASK); no word ⇒ ASK — and the question SAYS it was lost', JSON.stringify([rW, rN, rE].map((x) => [x.outcome, x.lost])));
    ok(B.list().accounts.find((x) => x.id === sWord).reloginAsk.lost === true, '…the row\'s question carries «lost» (its words say the sign-in finished across a restart)');
    const s = row('a17@example.invalid'); am2.reloginBegin(s); am2._reloginBefore.get(s).at = 0; live(am2.subDir(s), 'b17@example.invalid');
    const rT = am2.reloginResolve(s);
    ok(rT.outcome === 'ask' && rT.lost === true, 'a before kept past its time (30 min) counts as LOST', JSON.stringify(rT)); }
  // THE ANSWER's edges: nothing held any more ⇒ «gone»; an answer that is neither ⇒ refused by name
  { const s = row('a18@example.invalid'); blank(am2.subDir(s)); fs.rmSync(cfgAt(am2.subDir(s))); relogin(s, 'b18@example.invalid');
    fs.rmSync(path.join(am2.subDir(s), '.vibespace-relogin-held'), { recursive: true, force: true });
    fs.writeFileSync(cfgAt(am2.subDir(s)), '{"marker":1}');   // a file of the row's own: a «gone» answer must not touch it
    let refused = null; try { am2.reloginAnswer(s, 'maybe'); } catch (e) { refused = e.message; }
    ok(am2.reloginAnswer(s, 'same').outcome === 'gone' && /same.*another/.test(refused || '') && fs.readFileSync(cfgAt(am2.subDir(s)), 'utf8') === '{"marker":1}', 'nothing held any more ⇒ «gone», the row\'s own files untouched; an answer that is neither press ⇒ refused by name', refused); }
  // MOVING A SIGN-IN moves both files; a file it lacks is REMOVED at the destination (else a config of the old login stays beside new credentials)
  { const src = path.join(tmp, 'mv-src'), dst = path.join(tmp, 'mv-dst'); live(src, 'a19@example.invalid', { cfg: false }); live(dst, 'old@example.invalid');
    const n = am2._moveLogin(src, dst);
    ok(n === 1 && fs.existsSync(credsAt(dst)) && !fs.existsSync(cfgAt(dst)), 'a moved sign-in without a config REMOVES the destination\'s old config (law (5)\'s class: no stale record beside new credentials)', n); }
  // R4's READER — THE RESIDUE BY ITS EXACT SHAPE, nothing looser (condition (a)); it feeds nothing else (law 5 untouched)
  { const { get: harnessOf } = require('../src/harnesses');
    const CL = harnessOf('claude').creds;
    const rd = { facts: (f) => ({ text: fs.readFileSync(f, 'utf8') }), readText: (f) => fs.readFileSync(f, 'utf8') };
    const at = (name, write) => { const d = path.join(tmp, 'r4-' + name); live(d, 'a20@example.invalid'); if (write) write(d); return d; };
    const exact = at('exact', (d) => blank(d)), lst = CL.folderLastLoginOf(exact, rd);
    ok(lst && lst.email === 'a20@example.invalid' && lst.seat === personOf('a20@example.invalid') && lst.orgId === ORG, 'the CLI\'s exact blanked residue ⇒ the config\'s last login', lst);
    const not = {
      'a long-lived token (ours)': at('oat', (d) => ours(d)),
      'a long-lived token pasted (no mark, no refresh token)': at('pasted', (d) => fs.writeFileSync(credsAt(d), JSON.stringify({ claudeAiOauth: { accessToken: 'made-up', expiresAt: 0, scopes: ['user:inference'] } }))),
      'a live refreshable sign-in': at('live'),
      'an expired refreshable sign-in': at('expired', (d) => expired(d)),
      'a missing file': at('missing', (d) => fs.rmSync(credsAt(d))),
      'a malformed file': at('malformed', (d) => fs.writeFileSync(credsAt(d), '{not json')),
      'no scopes': at('noscopes', (d) => blank(d, { scopes: [] })),
      'a non-zero expiresAt': at('expiresat', (d) => blank(d, { expiresAt: 5 })),
      'a refresh token left': at('refresh', (d) => blank(d, { refreshToken: 'x' })),
      'no deadline': at('nodeadline', (d) => blank(d, { refreshTokenExpiresAt: undefined })),
      'tokens absent (not blank strings)': at('absent', (d) => blank(d, { accessToken: undefined, refreshToken: undefined })),
    };
    const wrong = Object.entries(not).filter(([, d]) => CL.folderLastLoginOf(d, rd) !== null).map(([k]) => k);
    ok(wrong.length === 0, `NOT the residue ⇒ null — ${Object.keys(not).length} shapes, a leg each (condition (a): the exact shape, nothing looser)`, wrong.join(' ; '));
    ok(CL.folderLastLoginOf(exact) === null, 'no default reader ⇒ null');
    ok(CL.folderIdentityOf(exact, rd) === null, 'it feeds nothing else: who the residue\'s folder IS stays nothing (claudeFolderIdentity, law 5 untouched)'); }
  // THE ROW's QUESTION, rendered by the real accounts dialog code (a fake DOM): one sentence, two presses named by what they do
  { let MA = null, why = null;
    try {
    const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
    const stub = { name: 'stub', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
    const out = await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/manage-agents.js')], bundle: true, write: false, format: 'iife', globalName: 'MA', platform: 'browser', target: 'es2022', logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stub] });
    const vm = require('node:vm');
    const el = () => new Proxy(function () { }, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : el()), apply: () => el(), construct: () => el(), set: () => true });
    const g = { console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, URL, URLSearchParams, TextEncoder, TextDecoder, Intl, Date, Math, JSON, Promise, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect, Error, TypeError, RangeError, Array, Object, String, Number, Boolean, RegExp, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, structuredClone, localStorage: { getItem: () => null, setItem: () => { }, removeItem: () => { } }, navigator: { userAgent: 'node', language: 'en' }, location: { origin: 'http://x', href: 'http://x/', search: '' }, matchMedia: () => ({ matches: false, addEventListener() { }, removeEventListener() { } }), requestAnimationFrame: (f) => setTimeout(f, 0), fetch: async () => ({ ok: false, json: async () => ({}) }) };
    g.document = el(); g.window = g; g.self = g; g.globalThis = g; g.addEventListener = () => { }; g.removeEventListener = () => { }; g.dispatchEvent = () => true;
    vm.createContext(g); vm.runInContext(out.outputFiles[0].text, g, { timeout: 5000 }); MA = g.MA;
    } catch (e) { why = String((e && e.message) || e).slice(0, 200); }
    if (!MA || typeof MA.reloginAskHtml !== 'function') ok(false, 'the real manage-agents renders under a fake DOM', why);
    else {
      const h = MA.reloginAskHtml({ id: 'sub-made-up', reloginAsk: { at: 1 } }), hl = MA.reloginAskHtml({ id: 'sub-made-up', reloginAsk: { at: 1, lost: true } });
      ok(h.includes('Is the new sign-in the same account as this row?') && h.includes('data-relogin-answer="same"') && h.includes('data-relogin-answer="another"') && h.includes('The same account: keep this row') && h.includes('Another account: make a new row') && !/disabled/.test(h), 'the row asks in ONE sentence with TWO presses named by what they do — no greyed control', h);
      ok(hl.includes('A sign-in finished across a restart') && MA.reloginAskHtml({ id: 'x' }) === '', 'a lost before says so; nothing asked ⇒ nothing rendered');
      ok(MA.subIdentHtml({ id: 'sub-made-up', loggedIn: false, facts: { state: 'read' }, reloginAsk: { at: 1 } }, {}).startsWith('<span class="acct-relogin-ask">'), 'the row\'s identity line shows the question first');
    } }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
