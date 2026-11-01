#!/usr/bin/env node
// test-browser-login — fast tier (< 10 s, PURE + in-process only; zero loopback servers, zero CLI spawns, zero timers):
//   ① PURE names / origins / resources — the phishing rule's spelling (exact to the port), the entry name ≡ the engine's SECRET_RE
//   ② the record (recordOf / textOf / publicOf — never a password in the public facts)
//   ③ the form (formOf: closed types, constraints kept, page words dropped; formOfSurface; classifyChromeForm)
//   ④ THE FILL VERDICT — road · form · phishing · ambiguity · grant · vault, each grant scope, the model's refusals
//   ⑤ THE PASSWORD the vault mints — length, classes, site constraints, unsatisfiable pattern by name; RED control
//   ⑥ THE SAVE VERDICT — new / same / update / agent-typed / owner-card / none, and what the ONE writer seals
//   ⑦ the words (agent sentence + owner notices + pending-reason notices in en / zh / ja)
//   ⑧ in-process save-login card & route doors (digest check + agent bearer refusal — zero sockets)
//   ⑨ PURE RED controls on src/browser-login.js
//   ⑪ Standard-Chrome r3 invariants: live_fill fence, CDP verdict, submit classifier & isolated-world fill unit checks
//   ⑫ Standard-Chrome r13 PURE & in-process gates: byte-complete 2xx body judge (MAJOR 1), 5 named 'unknown' causes in Vault row +
//     For-you notice (MINOR 1), UTF-8 BOM-stripping JSON judge (MINOR 2), scrubber rolling hash, and RED mutant controls.
// The fake-kernel integration, stream road, re-arm roads, and external mutant suites live in heavy scripts/test-browser-login-kernel.mjs;
// real-Chrome end-to-end gates live in heavy scripts/test-vault-login-chrome.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BL = require('../src/browser-login.js');
const GM = require('../src/grant-model.js');
const VI = require('../src/vault-inventory.js');
const L = require('../src/server/browser-logins.js');
const VE = require('../src/server/vault-engine.js');
const GS = require('../src/server/grants-store.js');
const V = require('../src/browser-verbs.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ROOT = scratch('blogin');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const MUT = mutantCopies('blogin', REPO);
const SRC = fs.readFileSync(path.join(REPO, 'src/browser-login.js'), 'utf8');
const quiet = { log() { }, warn() { }, error() { } };
// a fixture password: built at run time, never a literal (the repo's rule)
const pwOf = (tag) => [tag, crypto.randomBytes(6).toString('hex'), 'Zq', String(crypto.randomInt(10, 99))].join('-');
// a SEEDED rng (the suite's own — the server hands node crypto)
const seeded = (seed) => { let s = seed >>> 0; return (n) => { const out = Buffer.alloc(n); for (let i = 0; i < n; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; out[i] = (s >>> 16) & 255; } return out; }; };
// cdp-protocol-under-test — 'Page.navigate' below tests pure CDP mediation verdicts, never a live browser navigation
const SITE = 'https://shop.example.test', SITE2 = 'https://other.example.test';

// ═══ ① PURE names / origins / resources ═══
console.log('① names, origins, grant resources (PURE src/browser-login.js)');
{
  ok(BL.originOf('HTTPS://Shop.Example.TEST/login?x=1#y') === SITE && BL.originOf('https://shop.example.test:443/') === SITE && BL.originOf('https://shop.example.test:8443/a') === 'https://shop.example.test:8443' && BL.originOf('shop.example.test') === SITE,
    'originOf: scheme + lower-case host + a port that is not the default (a path / query / fragment dropped; a bare host read as https)');
  ok(BL.originOf('javascript:alert(1)') === null && BL.originOf('file:///etc/passwd') === null && BL.originOf('https://u:p@shop.example.test/') === null && BL.originOf('ftp://shop.example.test') === null && BL.originOf('') === null,
    'originOf refuses javascript: / file: / ftp: / user-info / nothing');
  ok(BL.secureOrigin(SITE) && BL.secureOrigin('http://localhost') && BL.secureOrigin('http://127.0.0.1') && BL.secureOrigin('http://app.localhost') && !BL.secureOrigin('http://shop.example.test') && !BL.secureOrigin('http://10.0.0.5'),
    'https, or http on this machine only (localhost / 127.0.0.1 / *.localhost) — plain http elsewhere is never filled');
  ok(BL.entryName(SITE, '  Alice@Example.TEST ') === `web-login:${SITE}#alice@example.test` && BL.entryName(SITE, 'a b') === null && BL.entryName(SITE, 'a#b') === null && BL.entryName('nope:', 'alice') === null && BL.entryName(SITE, '*') === null && BL.originOf('null') === null,
    'entryName: web-login:<origin>#<user lower-cased> — a user name with a space / a # / the wildcard `*` is refused (a user named * would BE «any account»); an opaque `null` origin is no site');
  const n = BL.entryName('https://shop.example.test:8443', 'bob');
  ok(eq(BL.parseName(n), { origin: 'https://shop.example.test:8443', user: 'bob' }) && BL.parseName(`web-login:${SITE}/#bob`) === null && BL.parseName(`web-login:${SITE}#Bob`) === null,
    'parseName round-trips a canonical name and refuses a non-canonical one (a path, an upper-case user)');
  // the engine's SECRET_RE carries the same shape (an entry the engine refuses would never be written; one it takes that this module refuses would be an orphan)
  const ESRC = fs.readFileSync(path.join(REPO, 'src/server/vault-engine.js'), 'utf8');
  const m = /const SECRET_RE = (\/\^.*\$\/);/.exec(ESRC);
  const ERE = m ? new Function(`return ${m[1]};`)() : null;
  const names = [BL.entryName(SITE, 'alice'), BL.entryName('https://a.b.example:8443', 'x+y@z.test'), BL.entryName('http://localhost', 'dev'), BL.entryName('https://[::1]', 'v6'), `web-login:${SITE}#a b`, `web-login:${SITE}#`, 'web-login:javascript:x#a', `web-login:${SITE}#a#b`];
  ok(ERE && names.every((x) => !!(x && ERE.test(x)) === !!(x && BL.isEntryName(x))) && names.filter((x) => x && BL.isEntryName(x)).length === 4 && VE.isSecretName(BL.entryName(SITE, 'alice')),
    'the engine\'s SECRET_RE and NAME_RE agree on every name (4 good, 4 bad) — the vault holds a web login under its own entry', names.map((x) => [x, !!(x && ERE && ERE.test(x)), !!(x && BL.isEntryName(x))]));
  ok(eq(BL.grantResources(SITE, 'Alice'), [`${SITE}#alice`, `${SITE}#*`, '*']), 'the grant resources of a login: its own row, «any account on this site», «any site»');
  ok(GM.DOORS.includes('browser-login') && BL.resourceOk(`${SITE}#alice`) && BL.resourceOk(`${SITE}#*`) && BL.resourceOk('*') && !BL.resourceOk(`${SITE}#Alice`) && !BL.resourceOk('shop.example.test#alice') && !BL.resourceOk(`${SITE}/x#alice`) && !BL.resourceOk(`${SITE}#a b`),
    'the browser-login door and its resource shape (grant-model RESOURCE_SHAPES): <origin>#<user> | <origin>#* | * — nothing else');
  ok(BL.scopeOf(`${SITE}#alice`) === 'this-account' && BL.scopeOf(`${SITE}#*`) === 'any-account' && BL.scopeOf('*') === 'any-site' && BL.scopeOf('x') === null, 'the three scopes the Vault window\'s 「用于…」 offers');
}

// ═══ ② the record ═══
console.log('② the record');
{
  const PW = pwOf('rec');
  const r = BL.newRecord({ origin: SITE, username: 'Alice', password: PW, totpName: 'shop', source: 'owner', now: 1000 });
  ok(r && r.v === 1 && r.by === 'owner' && r.source === 'owner' && r.strength === 'unknown' && r.submittedAt === 1000 && r.totpName === 'shop' && r.username === 'Alice', 'an owner\'s record: by owner, source owner, strength unknown, its two-step entry paired', r && { ...r, password: '…' });
  const m = BL.newRecord({ origin: SITE, username: 'bob', password: PW, source: 'vault-minted', now: 5, conversation: 'Chat One', pending: 'register' });
  ok(m.by === 'agent' && m.source === 'vault-minted' && m.strength === 'generated' && m.submittedAt === null && m.pending === 'register' && eq(m.createdIn, { conversation: 'Chat One', at: 5 }), 'a vault-minted record: by agent, strength generated, pending until the page takes it, the conversation it was made in');
  ok(eq(BL.recordOf(BL.textOf(r)), r) && BL.recordOf('{"v":2}') === null && BL.recordOf(JSON.stringify({ ...r, origin: 'https://SHOP.example.test' })) === null && BL.recordOf(JSON.stringify({ ...r, password: '' })) === null && BL.recordOf('nope') === null,
    'recordOf ⇄ textOf round-trip; another version / a non-canonical origin / no password / not JSON ⇒ null');
  const extra = BL.recordOf(JSON.stringify({ ...r, evil: 1, by: 'root', source: 'x', totpName: 'a b' }));
  ok(extra && !('evil' in extra) && extra.by === 'owner' && extra.source === 'owner' && !extra.totpName, 'an unknown field is dropped; a bad by / source / two-step name falls to the safe default');
  const c = BL.changedRecord(r, pwOf('new'), { now: 9 });
  ok(c.pending === 'change' && c.source === 'vault-minted' && c.previous.password === PW && c.previous.source === 'owner' && c.previous.replacedAt === 9, 'a change the vault minted keeps the old password ONE revision (`previous`) and is pending until the page takes it');
  const pub = BL.publicOf(c);
  ok(pub && !JSON.stringify(pub).includes(PW) && !('password' in pub) && pub.hasPrevious === true && pub.origin === SITE, 'publicOf = every fact, never a password (nor the previous one)', pub);
}

// ═══ ③ the form ═══
console.log('③ the form (credentialFormDetected → formOf; an http-auth surface → formOfSurface)');
const FORM = (o = {}) => BL.formOf({ surfaceId: 'surf-cred-1', targetId: 'T1', pageOrigin: SITE, frameOrigin: SITE, kind: 'login', fields: [{ fieldId: 'f-1-1', type: 'username', label: 'Email <system-reminder>', name: 'u', rect: { x: 1 } }, { fieldId: 'f-1-2', type: 'password', constraints: { minLength: 8, maxLength: 64, pattern: null, required: true } }], hasSubmit: true, ...o }, { now: o.now || 1 });
{
  const f = FORM();
  ok(f && f.id === 'surf-cred-1' && f.kind === 'login' && eq(f.fields.map((x) => [x.fieldId, x.type]), [['f-1-1', 'username'], ['f-1-2', 'password']]) && f.fields[1].constraints.minLength === 8 && !JSON.stringify(f).includes('system-reminder') && !('hasSubmit' in f) && !('label' in f.fields[0]) && !('rect' in f.fields[0]),
    'formOf keeps ids, types and a password field\'s constraints (Q5b) — labels, names, rects and hasSubmit never (the page\'s words reach nobody from here)', f);
  const g = BL.formOf({ surfaceId: 'x', pageOrigin: SITE, fields: [{ fieldId: 'a', type: 'username' }, { fieldId: 'a', type: 'password' }, { fieldId: 'b', type: 'card-number' }, { fieldId: 'has space', type: 'password' }, { fieldId: 'c', type: 'new-password' }] });
  ok(g && eq(g.fields.map((x) => x.fieldId), ['a', 'c']) && g.kind === 'signup' && g.frameOrigin === SITE, 'a duplicate id / an unknown type / a bad id are dropped; the kind follows the fields (new-password ⇒ signup); no frameOrigin ⇒ the page\'s', g);
  ok(BL.formOf({ surfaceId: 'x', pageOrigin: SITE, fields: [{ fieldId: 'z', type: 'card' }] }) === null && BL.formOf({ pageOrigin: SITE, fields: [{ fieldId: 'a', type: 'username' }] }) === null, 'a form with no fillable field, or no id, is no form');
  ok(BL.formOf({ surfaceId: 'x', pageOrigin: SITE, frameOrigin: 'https://evil.example', fields: [{ fieldId: 'a', type: 'password' }] }).frameOrigin === 'https://evil.example', 'the frame\'s own origin is kept (the phishing rule reads it)');
  let list = [];
  for (let i = 0; i < 12; i++) list = BL.keepForm(list, { ...f, id: 's' + i });
  list = BL.keepForm(list, { ...f, id: 's5' });
  ok(list.length === BL.FORMS_MAX && list[list.length - 1].id === 's5' && list.filter((x) => x.id === 's5').length === 1, 'a tab keeps its last 8 forms, one per id, the newest last');
  const sb = { id: 'surf-http-auth-1', kind: 'http-auth', url: SITE, frameOrigin: SITE, targetId: 'T1', openedAt: 3, fields: [{ fieldId: 'username', type: 'text', label: 'User' }, { fieldId: 'password', type: 'password', label: 'Password' }], answers: [{ id: 'sign-in', label: 'Sign in', kind: 'credential' }, { id: 'cancel', label: 'Cancel', kind: 'dismiss' }], detail: { host: 'shop.example.test', realm: 'x' } };
  const hf = BL.formOfSurface(sb);
  ok(hf && hf.surface && hf.kind === 'http-auth' && hf.answerId === 'sign-in' && hf.pageOrigin === SITE && eq(hf.fields.map((x) => x.type), ['username', 'password']) && !hf.proxy, 'an http-auth SURFACE is a form the same road fills: text = the user name, password = the password, its credential answer');
  ok(BL.formOfSurface({ ...sb, detail: { isProxy: true } }).proxy === true && BL.formOfSurface({ ...sb, kind: 'js-dialog' }) === null && BL.formOfSurface({ ...sb, fields: [{ fieldId: 'u', type: 'text' }] }) === null, 'a proxy\'s sign-in is marked (no site\'s login answers it); another kind / no password field ⇒ no form');
  // lane vault-login-chrome: PURE classifyChromeForm + stepOfForm over DOM input descriptors and accessibility-tree fixtures
  const cfOne = BL.classifyChromeForm({ targetId: 'T1', pageOrigin: SITE, fields: [{ fieldId: 'vs-f-0', type: 'text', name: 'username', autocomplete: 'username', label: 'User', visible: true }, { fieldId: 'vs-f-1', type: 'password', name: 'password', autocomplete: 'current-password', minLength: 4, visible: true }] });
  ok(cfOne && cfOne.step === 'password' && eq(cfOne.fields.map((x) => [x.fieldId, x.type]), [['vs-f-0', 'username'], ['vs-f-1', 'password']]) && cfOne.fields[1].constraints.minLength === 4, 'classifyChromeForm: one-step login form (username + password) ⇒ step "password", constraints kept');
  const cfEmail = BL.classifyChromeForm({ targetId: 'T1', pageOrigin: SITE, nodes: [{ ref: 'e1', role: 'textbox', name: 'Email or phone', autocomplete: 'username', visible: true }, { ref: 'e2', role: 'textbox', name: 'Enter your password', type: 'password', visible: false }] });
  ok(cfEmail && cfEmail.step === 'email' && eq(cfEmail.fields.map((x) => [x.fieldId, x.type]), [['e1', 'username']]), 'classifyChromeForm (accessibility-tree / two-step step 1): only the visible email textbox is classified ⇒ step "email"');
  const cfPwd = BL.classifyChromeForm({ targetId: 'T1', pageOrigin: SITE, nodes: [{ ref: 'e1', role: 'textbox', name: 'Email or phone', visible: false }, { ref: 'e2', role: 'textbox', name: 'Enter your password', visible: true }] });
  ok(cfPwd && cfPwd.step === 'password' && eq(cfPwd.fields.map((x) => [x.fieldId, x.type]), [['e2', 'password']]), 'classifyChromeForm (accessibility-tree / two-step step 2): only the visible password textbox is classified ⇒ step "password"');
  const cfTotp = BL.classifyChromeForm({ targetId: 'T1', pageOrigin: SITE, nodes: [{ ref: 'e1', role: 'textbox', name: 'Enter code', inputType: 'tel', autocomplete: 'one-time-code', visible: true }] });
  ok(cfTotp && cfTotp.step === 'totp' && eq(cfTotp.fields.map((x) => [x.fieldId, x.type]), [['e1', 'otp']]), 'classifyChromeForm (accessibility-tree / two-step step 3): one-time-code / "Enter code" ⇒ step "totp"');
  const cfPlain = BL.classifyChromeForm({ targetId: 'T1', pageOrigin: SITE, fields: [{ fieldId: 'vs-f-0', type: 'text', id: 'q', placeholder: 'Search', visible: true }, { fieldId: 'vs-f-1', role: 'button', name: 'Go', visible: true }] });
  ok(cfPlain === null, 'classifyChromeForm: a plain search box / button with no sign-in field ⇒ null (login_no_form)');
}

// ═══ ④ THE FILL VERDICT ═══
console.log('④ the fill verdict — the road · form · phishing · ambiguity · grant · vault (in that order)');
const ME = { conversationKeys: ['conv-1'], groupIds: ['tg-1'] };
{
  // lane vault-login-chrome r2 → r3: THE ROAD first — the browser's capability row, never a provider id; r3 re-opens `standard`
  ok(eq(Object.keys(BL.ROADS), ['kernel', 'kernel-no-credentials', 'standard']) && BL.ROADS.kernel.fills === true && BL.ROADS['kernel-no-credentials'].code === 'login_no_form' && BL.ROADS.standard.fills === true && BL.WITHDRAWN_IN === '2.369.364' && BL.REFUSALS.includes('login_fill_withdrawn') && BL.REFUSALS.includes('login_fill_live'),
    'the road rows: a kernel with credentials fills; a kernel without them has no form; standard Chrome is RE-OPENED in r3 (fills: true)');
  ok(BL.roadOf({ protocol: 1, kinds: [], features: ['surfaces', 'credentials'] }) === 'kernel' && BL.roadOf({ protocol: 1, kinds: [], features: ['surfaces', 'webauthn'] }) === 'kernel-no-credentials' && BL.roadOf(false) === 'standard' && BL.roadOf(null) === 'standard' && BL.roadOf(undefined) === 'standard' && BL.roadOf('custom-kernel') === 'standard' && BL.roadOf({ provider: 'custom-kernel', features: ['surfaces'] }) === 'kernel-no-credentials',
    'roadOf reads the kernel fact\'s features alone: standard Chrome (false) and a fact not asked yet (null) are one road; a provider name never opens one');
  const wd = BL.roadVerdict(false), wn = BL.roadVerdict(null), nc = BL.roadVerdict({ protocol: 1, features: ['surfaces'] }), kr = BL.roadVerdict({ protocol: 1, features: ['surfaces', 'credentials'] });
  ok(wd.ok === true && wd.road === 'standard' && eq(wn, wd),
    'roadVerdict(standard Chrome) ⇒ {ok:true, road:"standard"} (re-opened by r3 root fix)', wd);
  ok(!nc.ok && nc.code === 'login_no_form' && nc.road === 'kernel-no-credentials' && /standard Chrome/.test(nc.error) && kr.ok === true && kr.road === 'kernel', 'roadVerdict: a kernel without credentials ⇒ login_no_form (its words unchanged); a kernel with them ⇒ the road is open');
}
const rowsFrom = (rows) => (res) => rows.filter((r) => r.resource === res);
const ROW = (resource, to, except = []) => ({ door: 'browser-login', resource, to, except });
const ENT = [{ origin: SITE, user: 'alice' }];
{
  const f = FORM();
  const grantA = rowsFrom([ROW(`${SITE}#alice`, [{ kind: 'conversation', key: 'conv-1' }])]);
  const base = { forms: [f], entries: ENT, grantRows: grantA, facts: ME, vaultState: 'unlocked' };
  const v = BL.fillVerdict(base);
  ok(v.ok && v.mode === 'login' && v.origin === SITE && v.user === 'alice' && v.name === `web-login:${SITE}#alice` && eq(v.plan.username, ['f-1-1']) && eq(v.plan.password, ['f-1-2']) && v.grant.via === 'conversation', 'the page\'s form, ONE login of its site, the conversation\'s own grant, the vault open ⇒ fill (the plan names the field ids)', v);
  ok(BL.fillVerdict({ ...base, forms: [] }).code === 'login_no_form' && BL.fillVerdict({ ...base, forms: [], newUser: 'x', generate: true }).code === 'login_no_form', 'no form on the tab ⇒ login_no_form');
  ok(BL.fillVerdict({ ...base, forms: [FORM({ frameOrigin: 'https://evil.example' })] }).code === 'login_phishing', 'THE PHISHING RULE: the form sits in another site\'s frame ⇒ login_phishing');
  ok(BL.fillVerdict({ ...base, origin: SITE2 }).code === 'login_phishing' && /belongs to https:\/\/shop\.example\.test, not to https:\/\/other\.example\.test/.test(BL.fillVerdict({ ...base, origin: SITE2 }).error), 'the agent names another site than the page\'s ⇒ login_phishing (never another site\'s password on this page)');
  const p8443 = FORM({ pageOrigin: 'https://shop.example.test:8443', frameOrigin: 'https://shop.example.test:8443' });
  ok(BL.fillVerdict({ ...base, forms: [p8443] }).code === 'login_no_entry' && BL.fillVerdict({ ...base, forms: [p8443], origin: SITE }).code === 'login_phishing', 'EXACT TO THE PORT: a page on :8443 is not the :443 site — its entries are not offered (login_no_entry) and naming the :443 site there is login_phishing');
  ok(BL.fillVerdict({ ...base, forms: [FORM({ pageOrigin: 'https://evil-shop.example.test', frameOrigin: 'https://evil-shop.example.test' })] }).code === 'login_no_entry' && BL.fillVerdict({ ...base, forms: [FORM({ pageOrigin: 'https://login.shop.example.test', frameOrigin: 'https://login.shop.example.test' })] }).code === 'login_no_entry', 'never the registrable domain: a sibling / a subdomain of the site gets none of its logins');
  ok(BL.fillVerdict({ ...base, forms: [FORM({ pageOrigin: 'http://shop.example.test', frameOrigin: 'http://shop.example.test' })], entries: [{ origin: 'http://shop.example.test', user: 'alice' }] }).code === 'login_phishing' && BL.fillVerdict({ ...base, forms: [FORM({ pageOrigin: 'http://localhost', frameOrigin: 'http://localhost' })], entries: [{ origin: 'http://localhost', user: 'dev' }], grantRows: rowsFrom([ROW('*', [{ kind: 'everyone' }])]) }).ok, 'plain http ⇒ login_phishing; http on localhost is filled');
  const two = [...ENT, { origin: SITE, user: 'bob' }];
  ok(BL.fillVerdict({ ...base, entries: two }).code === 'login_ambiguous' && /alice, bob/.test(BL.fillVerdict({ ...base, entries: two }).error) && BL.fillVerdict({ ...base, entries: two, user: 'ALICE' }).ok, 'two logins of the site ⇒ login_ambiguous (their user names said); --user picks one (case-insensitive)');
  ok(BL.fillVerdict({ ...base, user: 'carol' }).code === 'login_no_entry' && BL.fillVerdict({ ...base, user: 'a b' }).code === 'login_bad_user' && BL.fillVerdict({ ...base, origin: 'javascript:x' }).code === 'login_bad_origin', 'no such login ⇒ login_no_entry; a bad user name / origin by name');
  // the grant
  ok(BL.fillVerdict({ ...base, grantRows: () => [] }).code === 'login_not_granted' && BL.fillVerdict({ ...base, grantRows: () => [] }).grant === 'not_granted', 'no grant row ⇒ login_not_granted (the model\'s not_granted named)');
  const wild = (resource, to) => ({ ...base, grantRows: rowsFrom([ROW(resource, to)]) });
  ok(BL.fillVerdict(wild(`${SITE}#*`, [{ kind: 'group', id: 'tg-1' }])).ok && BL.fillVerdict(wild('*', [{ kind: 'everyone' }])).ok && !BL.fillVerdict(wild(`${SITE2}#*`, [{ kind: 'everyone' }])).ok && !BL.fillVerdict(wild(`${SITE}#bob`, [{ kind: 'everyone' }])).ok,
    'the scopes ADD: «any account on this site» (a Task Group) and «any site» (everyone) admit; another site\'s wildcard or another account\'s row do not');
  const ex = BL.fillVerdict({ ...base, grantRows: rowsFrom([ROW('*', [{ kind: 'everyone' }], [{ kind: 'conversation', key: 'conv-1' }])]) });
  ok(ex.code === 'login_not_granted' && ex.grant === 'excepted' && /left this conversation out/.test(ex.error), 'an exception subtracts its row: «any site» to everyone EXCEPT this conversation ⇒ excepted, said so');
  ok(BL.fillVerdict({ ...base, grantRows: rowsFrom([ROW(`${SITE}#alice`, [{ kind: 'group', id: 'tg-9' }])]), facts: { ...ME, groupsUnreadable: true } }).grant === 'groups_unreadable' && BL.fillVerdict({ ...base, grantRows: () => [{ door: 'browser-login', resource: '*', to: null, unreadable: true }] }).grant === 'unknown_shape', 'fail closed by the model\'s names: groups_unreadable, an unreadable store row (unknown_shape)');
  const lk = BL.fillVerdict({ ...base, vaultState: 'locked' });
  ok(lk.code === 'vault_locked' && /already been told/.test(lk.error) && /on this instance's page/.test(lk.error) && !/ask (the owner|them) to unlock/.test(lk.error), 'the vault locked ⇒ vault_locked, in the vault rule\'s words (the owner was told; never «ask them to unlock»)');
  ok(BL.fillVerdict({ ...base, forms: [], vaultState: 'locked' }).code === 'login_no_form' && BL.fillVerdict({ ...base, grantRows: () => [], vaultState: 'locked' }).code === 'login_not_granted', 'THE ORDER: no form before the vault; the grant before the vault');
  // signup / change
  const sf = BL.formOf({ surfaceId: 'surf-cred-2', pageOrigin: SITE, kind: 'signup', fields: [{ fieldId: 'f-2-1', type: 'username' }, { fieldId: 'f-2-2', type: 'new-password', constraints: { minLength: 12, maxLength: 40, pattern: '[A-Za-z0-9]+' } }, { fieldId: 'f-2-3', type: 'new-password', constraints: { minLength: 10, maxLength: 32 } }] });
  const sg = BL.fillVerdict({ ...base, forms: [f, sf], newUser: 'Newbie', generate: true, grantRows: rowsFrom([ROW(`${SITE}#*`, [{ kind: 'conversation', key: 'conv-1' }])]) });
  ok(sg.ok && sg.mode === 'signup' && sg.user === 'newbie' && sg.form.id === 'surf-cred-2' && eq(sg.plan.newPassword, ['f-2-2', 'f-2-3']) && eq(sg.plan.password, []) && sg.constraints.minLength === 12 && sg.constraints.maxLength === 32 && eq(sg.constraints.patterns, ['[A-Za-z0-9]+']),
    'a signup (--new-user --generate): the form with a new-password field, the constraints merged (the strictest of each, every pattern), the grant of «any account on this site»', sg);
  ok(BL.fillVerdict({ ...base, forms: [f, sf], newUser: 'alice', generate: true, grantRows: rowsFrom([ROW('*', [{ kind: 'everyone' }])]) }).code === 'login_exists' && BL.fillVerdict({ ...base, forms: [f], newUser: 'x', generate: true }).code === 'login_no_form' && BL.fillVerdict({ ...base, forms: [f, sf], newUser: 'newbie', generate: true }).code === 'login_not_granted',
    'a signup for a login the vault already keeps ⇒ login_exists; no new-password field ⇒ login_no_form; the account\'s own row cannot exist yet ⇒ only a wildcard grant lets an agent register');
  const cf = BL.formOf({ surfaceId: 'surf-cred-3', pageOrigin: SITE, fields: [{ fieldId: 'c1', type: 'password' }, { fieldId: 'c2', type: 'new-password' }] });
  const ch = BL.fillVerdict({ ...base, forms: [cf], generate: true });
  ok(ch.ok && ch.mode === 'change' && cf.kind === 'change-password' && eq(ch.plan.password, ['c1']) && eq(ch.plan.newPassword, ['c2']), 'a change-password form (--generate, the login\'s own grant): the current password from the vault, the new one the vault makes');
  const otp = BL.formOf({ surfaceId: 'o', pageOrigin: SITE, fields: [{ fieldId: 'o1', type: 'otp' }] });
  ok(BL.fillVerdict({ ...base, forms: [otp] }).ok && eq(BL.fillVerdict({ ...base, forms: [otp] }).plan.otp, ['o1']), 'a two-step page alone (an otp field) is a sign-in form too');
  const vals = BL.valuesOf(v, { username: 'Alice', password: 'P', otp: null });
  ok(eq(vals.values, { 'f-1-1': 'Alice', 'f-1-2': 'P' }) && eq(vals.filled, ['username', 'password']), 'valuesOf maps the opened values onto the kernel\'s own field ids; a field with no value is left alone');
}

// ═══ ⑤ THE PASSWORD the vault mints ═══
console.log('⑤ the password the vault mints (generatePassword, an injected rng)');
{
  const g = BL.generatePassword({}, seeded(7));
  ok(g.ok && g.password.length === 20 && /[a-z]/.test(g.password) && /[A-Z]/.test(g.password) && /[0-9]/.test(g.password) && /[!#%*+\-.:=?@^_~]/.test(g.password) && eq(g.classes, ['lower', 'upper', 'digit', 'symbol']), 'the site says nothing ⇒ 20 characters, every class present', g.password.length);
  const many = new Set(Array.from({ length: 50 }, (_, i) => BL.generatePassword({}, seeded(100 + i)).password));
  ok(many.size === 50, 'fifty seeds ⇒ fifty different passwords (the rng drives every character)');
  ok(BL.generatePassword({ minLength: 32 }, seeded(1)).password.length === 32 && BL.generatePassword({ maxLength: 16 }, seeded(2)).password.length === 16 && BL.generatePassword({ minLength: 8, maxLength: 128 }, seeded(3)).password.length === 20, 'the site\'s min / max honoured (32 when it asks 32; its cap of 16; 20 inside 8…128)');
  ok(BL.generatePassword({ maxLength: 10 }, seeded(4)).code === 'password_rules_unsupported' && BL.generatePassword({ minLength: 30, maxLength: 20 }, seeded(5)).code === 'password_rules_unsupported', 'a cap under 12, or min > max ⇒ password_rules_unsupported (never a weak fallback)');
  const an = BL.generatePassword({ patterns: ['[A-Za-z0-9]{20,64}'] }, seeded(6));
  ok(an.ok && /^[A-Za-z0-9]{20}$/.test(an.password) && eq(an.classes, ['lower', 'upper', 'digit']), 'a pattern without symbols ⇒ the next rung that satisfies it (letters + digits), still 20');
  const lo = BL.generatePassword({ patterns: ['[a-z0-9]+', '.*[0-9].*'] }, seeded(8));
  ok(lo.ok && /^[a-z0-9]{20}$/.test(lo.password) && /[0-9]/.test(lo.password), 'every pattern holds (two patterns: lower + digits, a digit present)');
  const un = BL.generatePassword({ patterns: ['[0-9]{6}'] }, seeded(9));
  ok(un.code === 'password_rules_unsupported' && /\[0-9\]\{6\}/.test(un.error), 'AN UNSATISFIABLE PATTERN (six digits — no strong password matches) ⇒ password_rules_unsupported by name', un);
  ok(BL.generatePassword({ patterns: ['[a-z'] }, seeded(10)).code === 'password_rules_unsupported' && BL.generatePassword({ patterns: ['x'.repeat(BL.PATTERN_MAX + 1)] }, seeded(11)).code === 'password_rules_unsupported', 'a pattern the browser cannot read (or a too-long one) ⇒ password_rules_unsupported');
  const pat = BL.patternOf('[A-Z]+');
  ok(pat && pat.test('ABC') && !pat.test('xABC') && !pat.test('ABCx'), 'the pattern is read as the browser reads it: the WHOLE value must match');
  // RED control: a copy that never tests the pattern hands back a password the site would refuse
  const mut = SRC.replace('if (res.every((r) => r.test(pw))) return', 'if (true) return');
  const BLm = mut !== SRC ? MUT.load('src/browser-login.js', mut, 'nopattern') : null;
  const bad = BLm && BLm.generatePassword({ patterns: ['[a-z]+'] }, seeded(12));
  ok(BLm && bad.ok && !/^[a-z]+$/.test(bad.password), 'RED CONTROL: a copy that skips the pattern test hands back a password the site\'s pattern refuses (the check bites)', bad);
}

// ═══ ⑥ THE SAVE VERDICT ═══
console.log('⑥ the save verdict + what the ONE writer seals');
{
  const PW = pwOf('sv'), PW2 = pwOf('sv2');
  const own = BL.newRecord({ origin: SITE, username: 'alice', password: PW, source: 'owner', now: 1 });
  const mint = BL.newRecord({ origin: SITE, username: 'bob', password: PW, source: 'vault-minted', now: 1, conversation: 'Chat', pending: 'register' });
  const S = (o) => BL.saveVerdict(o);
  ok(['new', 'update', 'same', 'agent-typed', 'owner-card', 'none'].every((x) => BL.SAVE_STATES.includes(x)) && BL.SAVE_STATES.length === 6, 'the closed set of save states (SAVE_STATES)');
  ok(eq(S({ existing: mint, password: PW }), { state: 'new', confirm: true }) && eq(S({ existing: mint, password: null }), { state: 'new', confirm: true }), 'NEW: a vault-minted entry the page took (the kernel hands the password, or not) ⇒ confirmed');
  ok(S({ existing: mint, password: PW2 }).state === 'update', 'a minted entry whose submission carries ANOTHER password ⇒ update (the page\'s value wins, the minted one kept as previous)');
  ok(eq(S({ existing: own, password: PW }), { state: 'same' }), 'SAME: the vault already holds this password ⇒ nothing written, no notice');
  ok(eq(S({ existing: own, password: PW2 }), { state: 'update' }), 'UPDATE: another password for a kept login ⇒ updated (the old one kept one revision)');
  ok(eq(S({ existing: null, password: PW2 }), { state: 'agent-typed' }), 'AGENT-TYPED: a password the vault never minted, for a login it does not keep ⇒ saved, marked agent-typed (never discarded)');
  ok(eq(S({ existing: null, password: PW2, by: 'human' }), { state: 'owner-card' }) && eq(S({ existing: own, password: PW2, by: 'human' }), { state: 'owner-card' }) && S({ existing: own, password: PW, by: 'human' }).state === 'same', 'a PERSON\'s own submission (a takeover) ⇒ the owner\'s card — unless the vault already holds it');
  ok(S({ existing: null, password: null }).state === 'none' && S({ existing: own, password: null }).state === 'none' && S({ existing: mint, password: PW, outcome: 'error' }).state === 'none', 'nothing to save (no password handed, nothing pending) / the page refused the submission ⇒ none');
  const n1 = BL.nextRecord(S({ existing: mint, password: PW }), { existing: mint, origin: SITE, username: 'bob', password: PW, now: 9 });
  ok(n1 && !n1.pending && n1.submittedAt === 9 && n1.source === 'vault-minted' && n1.password === PW, 'the confirm clears `pending`, stamps submittedAt, keeps source vault-minted');
  const n2 = BL.nextRecord({ state: 'agent-typed' }, { origin: SITE, username: 'Carol', password: PW2, now: 9, conversation: 'Chat Two' });
  ok(n2 && n2.by === 'agent' && n2.source === 'agent-typed' && n2.strength === 'unknown' && eq(n2.createdIn, { conversation: 'Chat Two', at: 9 }) && n2.username === 'Carol', 'an agent-typed record: by agent, strength unknown, the conversation it came from', n2 && { ...n2, password: '…' });
  const n3 = BL.nextRecord({ state: 'update' }, { existing: own, origin: SITE, username: 'alice', password: PW2, now: 9 });
  ok(n3 && n3.password === PW2 && n3.previous.password === PW && n3.previous.source === 'owner' && n3.source === 'agent-typed', 'an update keeps the old password in `previous` (one revision)');
  ok(BL.nextRecord({ state: 'same' }, { existing: own }) === null && BL.nextRecord({ state: 'owner-card' }, { existing: own }) === null, 'same / owner-card ⇒ nothing sealed by the agent\'s road');
}

// ═══ ⑦ the words ═══
console.log('⑦ the words');
{
  const t1 = BL.loginText({ ok: true, mode: 'login', origin: SITE, user: 'alice', filled: ['username', 'password'], submitted: false, receipt: 'vr-0123456789ab' });
  ok(/^Filled the user name and the password on https:\/\/shop\.example\.test \(alice\) from the vault — you never see the values — the form is NOT submitted/.test(t1) && /Receipt vr-0123456789ab\./.test(t1), 'the agent\'s sentence: what was filled (kinds), where, the receipt — and that it is not submitted', t1);
  ok(/vault made a 20-character password for the new account/.test(BL.loginText({ ok: true, mode: 'signup', origin: SITE, user: 'newbie', filled: ['username', 'new-password'], submitted: true, length: 20 })) && /saves this login automatically/.test(BL.loginText({ ok: true, mode: 'signup', origin: SITE, user: 'n', filled: [], submitted: true })),
    'a signup\'s sentence: the vault made the password, you never see it, the login is saved automatically');
  ok(BL.loginText({ ok: false, code: 'login_phishing', error: 'x' }) === 'x', 'a refusal says its own sentence (the CLI adds the code by name)');
  const nw = BL.noticeWords('agent-typed', { origin: SITE, username: 'carol', conversation: 'Chat Two' });
  ok(nw && /typed itself/.test(nw.text) && /shop\.example\.test/.test(nw.text) && /— Chat Two$/.test(nw.text) && nw.i18n.text.key === BL.NOTICE['agent-typed'].text && eq(Object.keys(nw.i18n.text.params), ['user', 'site']) && BL.noticeWords('nope', {}) === null, 'the owner\'s notice: i18n keys + params (user, site), the conversation named');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const keys = Object.values(BL.NOTICE).flatMap((w) => [w.text, w.detail]);
  const has = (src, k) => src.includes(JSON.stringify(k)) || src.includes(`'${k.replace(/'/g, "\\'")}'`);
  ok(keys.every((k) => has(zh, k) && has(ja, k)), 'every notice key is worded in zh and ja', keys.filter((k) => !has(zh, k) || !has(ja, k)));
}

// ═══ ⑧ in-process save-login card & route doors (zero sockets / spawns) ═══
console.log('⑧ in-process save-login card & route doors');
{
  const d = path.join(ROOT, 'doors'); fs.mkdirSync(d, { recursive: true });
  const eng = VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  await eng.setup(['vault', crypto.randomBytes(4).toString('hex'), 'fast'].join(' '));
  const grants = GS.create({ memory: true });
  const fy = [], resolved = [];
  const logins = L.create({
    vault: eng,
    grants: () => grants,
    forYou: { add: (pid, it) => { const id = 'fy-' + (fy.length + 1); fy.push({ id, pid, it }); return id; }, resolve: (id) => resolved.push(id) },
  });
  try {
    const HPW = pwOf('human-card');
    const sub = logins.submitted({ origin: SITE, usernameHint: 'erin', password: HPW, by: 'human', profileId: 'bp-e0000b01' });
    const cardAct = fy[0] && fy[0].it && fy[0].it.action;
    ok(sub && sub.state === 'owner-card' && cardAct && cardAct.type === 'save-login' && logins.answerCard(cardAct.id, { approve: true, shown: 'wrong' }).code === 'card_changed',
      'a card answered with another digest ⇒ card_changed (nothing written)');
    const saved = logins.answerCard(cardAct.id, { approve: true, shown: cardAct.shown });
    ok(saved.ok && saved.saved && resolved.includes('fy-1') && logins._cards.size === 0,
      'Save with matching shown digest seals the owner login through the ONE writer and resolves the card');

    const R = require('../src/routes/browser.js');
    const sessionBearer = ['vsst', crypto.randomBytes(6).toString('hex')].join('_');
    const sessions = new Map([['sess-1', { agentToken: sessionBearer, _browserKey: 'bk-0000b10c', backendSessionId: 'conv-1', name: 'Chat One' }]]);
    R.setup({
      keeper: { resolveFor: () => ({ ok: true, kind: 'none', handles: [] }), profile: () => null, leasesFor: () => [] },
      activeSessions: sessions,
      dialogs: { loginForms: () => [] },
      logins,
      tasksForSession: () => [],
    });
    const invokeCardRoute = (headers, body) => new Promise((resolve) => {
      const req = {
        method: 'POST',
        url: '/api/browser/logins/cards/sl-00000000/approve',
        originalUrl: '/api/browser/logins/cards/sl-00000000/approve',
        headers,
        body,
        get(h) { return this.headers[String(h || '').toLowerCase()]; },
      };
      const res = {
        statusCode: 200,
        status(c) { this.statusCode = c; return this; },
        json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      };
      R.router.handle(req, res, () => resolve({ status: 404, body: null }));
    });
    const agentTry = await invokeCardRoute({ authorization: `Bearer ${sessionBearer}` }, { shown: 'x' });
    const emptyTry = await invokeCardRoute({}, {});
    ok(agentTry.status === 403 && agentTry.body && agentTry.body.code === 'agent_forbidden',
      'the save-login card\'s route refuses an agent\'s bearer (agent_forbidden) — saving a person\'s login is the person\'s act', agentTry);
    ok(emptyTry.status === 400 && emptyTry.body && emptyTry.body.code === 'shown_required' && V.OURS_PAGE.includes('login'),
      'an answer naming no card is refused (shown_required), and login is VibeSpace\'s own page verb', emptyTry);
  } finally {
    eng.close();
  }
}

// ═══ ⑨ PURE RED controls ═══
console.log('⑨ PURE RED controls — each mutant lets the bad fill through');
const REFUSED_MODE = Object.freeze({ features: ['surfaces'] });
{
  const f = FORM({ frameOrigin: 'https://evil.example' });
  const grant = rowsFrom([ROW(`${SITE}#alice`, [{ kind: 'conversation', key: 'conv-1' }])]);
  const noFrame = SRC.replace("if (!form.pageOrigin || form.frameOrigin !== form.pageOrigin) return", "if (!form.pageOrigin) return");
  const M1 = noFrame !== SRC ? MUT.load('src/browser-login.js', noFrame, 'noframe') : null;
  ok(M1 && M1.fillVerdict({ forms: [f], entries: ENT, grantRows: grant, facts: ME, vaultState: 'unlocked' }).ok === true && BL.fillVerdict({ forms: [f], entries: ENT, grantRows: grant, facts: ME, vaultState: 'unlocked' }).code === 'login_phishing', 'RED: a copy without the frame check fills a form inside another site\'s frame (the real verdict refuses it)');
  const noGrant = SRC.replace("if (!g.ok) return no('login_not_granted'", "if (false) return no('login_not_granted'");
  const M2 = noGrant !== SRC ? MUT.load('src/browser-login.js', noGrant, 'nogrant') : null;
  ok(M2 && M2.fillVerdict({ forms: [FORM()], entries: ENT, grantRows: () => [], facts: ME, vaultState: 'unlocked' }).ok === true, 'RED: a copy without the grant fills a login nobody granted');
  const exactPort = SRC.replace("const here = (Array.isArray(entries) ? entries : []).filter((e) => e && e.origin === o);", "const here = (Array.isArray(entries) ? entries : []).filter((e) => e && hostOf(e.origin) === hostOf(o));");
  const M3 = exactPort !== SRC ? MUT.load('src/browser-login.js', exactPort, 'hostonly') : null;
  const p8443 = FORM({ pageOrigin: 'https://shop.example.test:8443', frameOrigin: 'https://shop.example.test:8443' });
  // lane vault-agent-own: a copy that reads any caller as the login's owner fills an agent's own login for ANOTHER conversation
  const anyOwner = SRC.replace("(Array.isArray(owners) ? owners : []).includes(kept.owner)", 'true');
  const M4 = anyOwner !== SRC ? MUT.load('src/browser-login.js', anyOwner, 'anyowner') : null;
  const ownEnt = [{ origin: SITE, user: 'alice', owner: 'conv-1' }];
  ok(M4 && M4.fillVerdict({ forms: [FORM()], entries: ownEnt, grantRows: () => [], facts: ME, owners: ['conv-2'], vaultState: 'unlocked' }).ok === true && BL.fillVerdict({ forms: [FORM()], entries: ownEnt, grantRows: () => [], facts: ME, owners: ['conv-2'], vaultState: 'unlocked' }).code === 'login_not_granted' && BL.fillVerdict({ forms: [FORM()], entries: ownEnt, grantRows: () => [], facts: ME, owners: ['conv-1'], vaultState: 'unlocked' }).ok === true,
    'RED: a copy that reads any caller as the owner fills an agent\'s own login for another conversation (the real one: its owner only, by name)');
  ok(M3 && M3.fillVerdict({ forms: [p8443], entries: ENT, grantRows: rowsFrom([ROW('*', [{ kind: 'everyone' }])]), facts: ME, vaultState: 'unlocked' }).ok === true, 'RED: a copy matching by host alone offers the :443 login on a :8443 page (the real one is exact to the port)');
  // lane vault-login-chrome r2 → r3: a copy that flips kernel-no-credentials open or flips standard back to withdrawn
  const reopenedNc = SRC.replace("'kernel-no-credentials': Object.freeze({ fills: false,", "'kernel-no-credentials': Object.freeze({ fills: true,");
  const rewithdrawn = SRC.replace("standard: Object.freeze({ fills: true }),", "standard: Object.freeze({ fills: false, code: 'login_fill_withdrawn', withdrawnIn: WITHDRAWN_IN }),");
  const M5 = reopenedNc !== SRC ? MUT.load('src/browser-login.js', reopenedNc, 'reopened-nc') : null;
  const M5w = rewithdrawn !== SRC ? MUT.load('src/browser-login.js', rewithdrawn, 'rewithdrawn') : null;
  ok(M5 && M5.roadVerdict(REFUSED_MODE).ok === true && BL.roadVerdict(REFUSED_MODE).code === 'login_no_form' && M5w && M5w.roadVerdict(false).code === 'login_fill_withdrawn' && BL.roadVerdict(false).ok === true,
    'RED: a copy opening kernel-no-credentials lets the non-credential kernel through, and a copy withdrawing standard returns 2.369.364\'s login_fill_withdrawn');
}

// ═══ ⑪ Standard-Chrome r3 invariants: live-fill fence, CDP verdict, submit classification, isolated-world fill ═══
console.log('⑪ Standard-Chrome r3 invariants — live_fill fence, CDP verdict, submit classifier & fail-closed fill');
{
  const Med = require('../src/browser-mediation.js');
  const LF = require('../src/server/browser-login-fill.js');
  ok(BL.REFUSALS.includes('login_fill_live') && BL.loginText({ ok: false, code: 'login_fill_live', error: 'live secret' }) === 'live secret',
    'login_fill_live is a named refusal in browser-login');
  for (const allowVerb of ['login', 'click', 'press', 'open', 'goto', 'navigate', 'back', 'reload', 'wait', 'tab', 'close', 'dialog', 'takeover']) {
    ok(BL.liveFillAllowsVerb(allowVerb) && BL.liveFillVerdict({ verb: allowVerb, origin: SITE }).ok === true, `liveFillVerdict allows non-reading verb \`${allowVerb}\``);
  }
  for (const denyVerb of ['eval', 'snapshot', 'screenshot', 'get', 'console', 'network', 'pdf', 'cookies', 'storage', 'trace']) {
    const vd = BL.liveFillVerdict({ verb: denyVerb, origin: SITE });
    ok(!BL.liveFillAllowsVerb(denyVerb) && !vd.ok && vd.code === 'login_fill_live', `liveFillVerdict refuses reading/scripting verb \`${denyVerb}\` with login_fill_live`, vd);
  }
  ok(BL.liveFillVerdict({ verb: 'batch', batchVerbs: ['click', 'wait'], origin: SITE }).ok === true, 'liveFillVerdict allows batch of allowed verbs');
  ok(BL.liveFillVerdict({ verb: 'batch', batchVerbs: ['click', 'eval'], origin: SITE }).code === 'login_fill_live', 'liveFillVerdict refuses batch carrying eval');
  ok(BL.liveFillVerdict({ verb: 'batch', batchVerbs: [], origin: SITE }).code === 'login_fill_live', 'liveFillVerdict refuses empty batch');

  // CDP mediator live-fill verdict (census-class driven in r4)
  ok(Med.liveFillCdpVerdict('Page.navigate').refuse === false && Med.liveFillCdpVerdict('Target.getTargets').refuse === false,
    'liveFillCdpVerdict allows top-level navigation and target listing');
  for (const m of ['Runtime.evaluate', 'Page.captureScreenshot', 'Accessibility.getFullAXTree', 'DOM.getOuterHTML', 'DOM.describeNode', 'Debugger.getScriptSource', 'Network.getResponseBody', 'DOMSnapshot.captureSnapshot']) {
    const cv = Med.liveFillCdpVerdict(m, { allowVerb: null });
    ok(cv.refuse === true && cv.code === 'login_fill_live', `liveFillCdpVerdict (raw CDP) refuses ${m}`, cv);
  }
  ok(Med.liveFillCdpVerdict('Input.dispatchMouseEvent', { allowVerb: 'click' }).refuse === false
    && Med.liveFillCdpVerdict('DOM.getBoxModel', { allowVerb: 'click' }).refuse === false
    && Med.liveFillCdpVerdict('Page.captureScreenshot', { allowVerb: 'click' }).code === 'login_fill_live'
    && Med.liveFillCdpVerdict('Debugger.getScriptSource', { allowVerb: 'click' }).code === 'login_fill_live'
    && Med.liveFillCdpVerdict('Network.getResponseBody', { allowVerb: 'click' }).code === 'login_fill_live',
    'liveFillCdpVerdict with allowVerb:"click" permits exact pointer locator plumbing while still refusing captureScreenshot, Debugger.*, and Network.getResponseBody');

  // Submit control classification
  ok(!BL.isSubmitControl({ tag: 'button', type: 'button', text: 'Show', ariaLabel: 'Show password', visible: true }, { mode: 'login' }), 'isSubmitControl rejects Show password toggle');
  ok(!BL.isSubmitControl({ tag: 'button', type: 'button', text: 'Continue', ariaPressed: 'false', visible: true }, { mode: 'login' }), 'isSubmitControl rejects aria-pressed toggle');
  ok(!BL.isSubmitControl({ tag: 'button', type: 'button', text: 'Back', visible: true }, { mode: 'login' }), 'isSubmitControl rejects Back button');
  ok(!BL.isSubmitControl({ tag: 'button', type: 'button', text: 'Forgot password?', visible: true }, { mode: 'login' }), 'isSubmitControl rejects Forgot password');
  ok(!BL.isSubmitControl({ tag: 'button', type: 'button', text: 'Sign in with Passkey', visible: true }, { mode: 'login' }), 'isSubmitControl rejects Passkey button');
  ok(!BL.isSubmitControl({ tag: 'button', type: 'button', text: 'Create account', visible: true }, { mode: 'login' }), 'isSubmitControl rejects Create account on login mode');
  ok(BL.isSubmitControl({ tag: 'div', role: 'button', text: 'Sign in', visible: true }, { mode: 'login' }), 'isSubmitControl accepts role=button Sign in on login mode');
  ok(BL.isSubmitControl({ tag: 'div', role: 'button', text: 'Next', visible: true }, { mode: 'login' }), 'isSubmitControl accepts role=button Next on login mode');
  ok(BL.isSubmitControl({ tag: 'div', role: 'button', text: 'Create account', visible: true }, { mode: 'signup' }), 'isSubmitControl accepts Create account on signup mode');
  ok(BL.isSubmitControl({ tag: 'button', type: 'button', text: 'Update password', visible: true }, { mode: 'change' }), 'isSubmitControl accepts Update password on change mode');

  // Stubbed CDP unit checks on browser-login-fill.js: isolated world + zero secret in Runtime.evaluate + origin mismatch refusal
  const SECRET = pwOf('unit-fill');
  for (const trig of ['ok', 'insert-err', 'cleared', 'focus-moved']) {
    const sent = [];
    let wiped = false;
    const call = async (m, p) => {
      sent.push({ m, p: m === 'Input.insertText' ? { textLen: String(p.text || '').length } : p });
      if (m === 'Page.getFrameTree') return { result: { frameTree: { frame: { id: 'F1', url: `${SITE}/login`, securityOrigin: SITE } } } };
      if (m === 'Target.getTargetInfo') return { result: { targetInfo: { targetId: 'T1', url: `${SITE}/login` } } };
      if (m === 'Page.createIsolatedWorld') return { result: { executionContextId: 77 } };
      if (m === 'Input.insertText') return trig === 'insert-err' ? { error: { message: 'boom' } } : { result: {} };
      if (m === 'Runtime.evaluate') {
        const ex = String(p.expression || '');
        if (ex.includes('isoOrigin')) return { result: { result: { value: { ok: true, isoOrigin: SITE, isoHref: `${SITE}/login`, actionOrigin: SITE, fields: [{ fieldId: 'vs-f-0', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }] } } } };
        if (ex.includes('window.vsLoginSnap =')) return { result: { result: { value: { ok: true, fields: [{ fieldId: 'vs-f-0', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }] } } } };
        if (ex.includes('focus_moved')) {
          if (trig === 'cleared') return { result: { result: { value: { ok: false, code: 'field_cleared' } } } };
          if (trig === 'focus-moved') return { result: { result: { value: { ok: false, code: 'focus_moved' } } } };
          return { result: { result: { value: { ok: true } } } };
        }
        if (ex.includes('for (const id of')) { wiped = true; return { result: { result: { value: true } } }; }
        return { result: { result: { value: { ok: true } } } };
      }
      return { result: {} };
    };
    const res = await LF.fillVaultLogin({ call, origin: SITE, trackedUrl: `${SITE}/login`, values: { 'vs-f-0': SECRET }, form: { targetId: 'T1', pageOrigin: SITE, frameOrigin: SITE, fields: [{ fieldId: 'vs-f-0', type: 'password' }] }, loginId: 'L1' });
    const evalCarrying = sent.filter((x) => x.m === 'Runtime.evaluate' && JSON.stringify(x.p).includes(SECRET)).length;
    const unisolated = sent.filter((x) => x.m === 'Runtime.evaluate' && x.p.contextId !== 77).length;
    ok((trig === 'ok' ? res.ok === true : (res.ok === false && res.code === 'login_failed' && wiped)) && evalCarrying === 0 && unisolated === 0 && !JSON.stringify(res).includes(SECRET),
      `fillVaultLogin (${trig}): 0 Runtime.evaluate expressions carry secret, all evals use isolated contextId, fail-closed wipes touched fields`, { trig, res, evalCarrying, unisolated, wiped });
  }

  // Disagreement between trackedUrl and Page.getFrameTree refuses login_phishing before touching any field
  const misSent = [];
  const misRes = await LF.fillVaultLogin({
    call: async (m) => {
      misSent.push(m);
      if (m === 'Page.getFrameTree') return { result: { frameTree: { frame: { id: 'F1', url: `${SITE2}/phish`, securityOrigin: SITE2 } } } };
      if (m === 'Target.getTargetInfo') return { result: { targetInfo: { targetId: 'T1', url: `${SITE2}/phish` } } };
      if (m === 'Page.createIsolatedWorld') return { result: { executionContextId: 88 } };
      if (m === 'Runtime.evaluate') return { result: { result: { value: { ok: true, isoOrigin: SITE2, isoHref: `${SITE2}/phish`, actionOrigin: SITE2, fields: [{ fieldId: 'vs-f-0', tag: 'input', type: 'password', visible: true }] } } } };
      return { result: {} };
    },
    origin: SITE,
    trackedUrl: `${SITE}/login`,
    values: { 'vs-f-0': SECRET },
  });
  ok(!misRes.ok && misRes.code === 'login_phishing' && !misSent.includes('Input.insertText'),
    'disagreement between trackedUrl and browser frame URL refuses login_phishing with 0 Input.insertText calls', misRes);

  // RED mutant controls for submit classifier and live-fill fence
  const noDeny = SRC.replace('if (SUBMIT_DENY_RE.test(words)) return false;', '');
  const M6 = noDeny !== SRC ? MUT.load('src/browser-login.js', noDeny, 'nosubmitdeny') : null;
  ok(M6 && M6.isSubmitControl({ tag: 'button', type: 'submit', text: 'Show password', visible: true }, { mode: 'login' }) === true
    && BL.isSubmitControl({ tag: 'button', type: 'submit', text: 'Show password', visible: true }, { mode: 'login' }) === false,
    'RED: a copy without SUBMIT_DENY_RE treats a Show password button as a submit control');
  const allowEval = SRC.replace("'takeover',", "'takeover', 'eval',");
  const M7 = allowEval !== SRC ? MUT.load('src/browser-login.js', allowEval, 'alloweval') : null;
  ok(M7 && M7.liveFillVerdict({ verb: 'batch', batchVerbs: ['click', 'eval'], origin: SITE }).ok === true
    && BL.liveFillVerdict({ verb: 'batch', batchVerbs: ['click', 'eval'], origin: SITE }).code === 'login_fill_live',
    'RED: a copy admitting eval in LIVE_FILL_ALLOW_VERBS lets batch+eval read a live-filled tab');
}

// ═══ ⑫ Standard-Chrome r13 PURE & in-process gates (MAJOR 1 body judge + MINOR 1 5 causes + MINOR 2 BOM + scrubber) ═══
console.log('⑫ Standard-Chrome r13 PURE & in-process gates (byte-complete 2xx judge, 5 named unknown causes, BOM JSON, scrubber)');
{
  const LF = require('../src/server/browser-login-fill.js');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8');
  const ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const hasKey = (src, k) => src.includes(JSON.stringify(k)) || src.includes(`'${k.replace(/'/g, "\\'")}'`);
  
  const vlrDir = path.join(ROOT, 'vlr-r13-esm');
  fs.mkdirSync(vlrDir, { recursive: true });
  fs.writeFileSync(path.join(vlrDir, 'i18n.mjs'), 'export const t = (s, p) => p ? Object.entries(p).reduce((a, [k, v]) => a.replaceAll("{" + k + "}", String(v)), s) : s;\n');
  fs.writeFileSync(path.join(vlrDir, 'utils.mjs'), 'export const fetchJson = async () => ({ ok: true }); export const showToast = () => {}; export const createModalShell = () => ({});\n');
  fs.writeFileSync(path.join(vlrDir, 'vault-totp-row.mjs'), 'export const loadTotp = async () => null;\n');
  const vlrEsmSrc = fs.readFileSync(path.join(REPO, 'src/lib/vault-login-row.js'), 'utf8')
    .replace('./i18n.js', './i18n.mjs')
    .replace('./utils.js', './utils.mjs')
    .replace('./vault-totp-row.js', './vault-totp-row.mjs');
  fs.writeFileSync(path.join(vlrDir, 'vault-login-row.mjs'), vlrEsmSrc);
  const { loginExtras } = await import(pathToFileURL(path.join(vlrDir, 'vault-login-row.mjs')).href);

  function renderVaultRowPendingText(entry) {
    class MiniEl {
      constructor(tag, cls = '', txt = '') {
        this.tagName = String(tag || 'div').toUpperCase();
        this.className = String(cls || '');
        this.textContent = txt == null ? '' : String(txt);
        this.children = [];
        this.dataset = {};
        this.style = {};
      }
      append(...nodes) {
        for (const n of nodes) {
          if (n == null) continue;
          if (typeof n === 'string') this.children.push({ textContent: n, children: [] });
          else this.children.push(n);
        }
      }
      appendChild(n) { this.append(n); return n; }
      setAttribute() {}
      addEventListener() {}
      get fullText() {
        return this.textContent + this.children.map((c) => (c.fullText !== undefined ? c.fullText : (c.textContent || ''))).join(' ');
      }
      findByClass(cls) {
        if (String(this.className || '').split(/\s+/).includes(cls)) return this;
        for (const c of this.children) {
          if (c && typeof c.findByClass === 'function') {
            const hit = c.findByClass(cls);
            if (hit) return hit;
          }
        }
        return null;
      }
    }
    const prevDoc = globalThis.document;
    globalThis.document = { createElement: (tag) => new MiniEl(tag) };
    try {
      const { box } = loginExtras({ entry: entry.name, pending: entry.pending, pendingReason: entry.pendingReason }, { entries: [entry] }, {});
      const hint = box && typeof box.findByClass === 'function' ? box.findByClass('vw-login-pending') : null;
      return hint ? hint.fullText : '';
    } finally {
      globalThis.document = prevDoc;
    }
  }


  // (1) MAJOR 1 PURE body judge: complete 2xx shapes vs incomplete/unparseable application/json
  const judgeFn = typeof BL.judgeCredResponseBody === 'function'
    ? BL.judgeCredResponseBody
    : () => ({ complete: false, errBody: false, reason: 'missing-judgeCredResponseBody' });
  const incReasonFn = typeof BL.answerIncompleteReason === 'function'
    ? BL.answerIncompleteReason
    : (got, total) => `the site's answer was incomplete (${got} of ${total} bytes)`;
  const isErrFn = typeof BL.isJsonErrorBody === 'function' ? BL.isJsonErrorBody : () => null;
  const jEmptyJson = judgeFn('', 'application/json; charset=utf-8', { sawBodyBytes: false, expectedBytes: 0 });
  const jNoMimeOk = judgeFn('OK', '', { sawBodyBytes: true, expectedBytes: 2 });
  const jEmptyHtml = judgeFn('', 'text/html', { sawBodyBytes: false, expectedBytes: 0 });
  const jHtmlBrace = judgeFn('{not json template}', 'text/html; charset=utf-8', { sawBodyBytes: true, expectedBytes: 19 });
  const jJsonOk = judgeFn('{"ok":true}', 'application/json', { sawBodyBytes: true, expectedBytes: 11 });
  const jJsonErr = judgeFn('{"ok":false,"error":"taken"}', 'application/json', { sawBodyBytes: true, expectedBytes: 28 });
  const jBadJson = judgeFn('{"errors":[{"message":"Invalid', 'application/json', { sawBodyBytes: true, expectedBytes: 30 });
  const jPlainUnderJson = judgeFn('OK', 'application/json', { sawBodyBytes: true, expectedBytes: 2 });
  const jBlankJsonBytes = judgeFn('   ', 'application/json', { sawBodyBytes: true, expectedBytes: 3 });

  ok(
    typeof BL.judgeCredResponseBody === 'function'
    && jEmptyJson.complete === true && jEmptyJson.errBody === false && jEmptyJson.reason === null
    && jNoMimeOk.complete === true && jNoMimeOk.errBody === false && jNoMimeOk.reason === null
    && jEmptyHtml.complete === true && jEmptyHtml.errBody === false && jEmptyHtml.reason === null
    && jHtmlBrace.complete === true && jHtmlBrace.errBody === false
    && jJsonOk.complete === true && jJsonOk.errBody === false
    && jJsonErr.complete === true && jJsonErr.errBody === true
    && jBadJson.complete === false && Boolean(BL.ANSWER_NOT_JSON_BOUND) && jBadJson.reason === BL.ANSWER_NOT_JSON_BOUND
    && jPlainUnderJson.complete === false && jPlainUnderJson.reason === BL.ANSWER_NOT_JSON_BOUND
    && jBlankJsonBytes.complete === false && Boolean(BL.ANSWER_EMPTY_BOUND) && jBlankJsonBytes.reason === BL.ANSWER_EMPTY_BOUND,
    'r13 MAJOR 1 PURE [r13-pure-1]: judgeCredResponseBody accepts empty CL:0 JSON, empty-mime "OK", and empty HTML, while failing closed on unparseable or whitespace-only claimed JSON',
    { jEmptyJson, jNoMimeOk, jEmptyHtml, jBadJson, jPlainUnderJson, jBlankJsonBytes });

  // (2) MINOR 1 PURE + Vault row DOM + For-you notice + i18n keys across all 5 causes
  const fiveCauses = [
    [BL.ANSWER_LARGE_BOUND || 'the site\'s answer was too large to read', /too large to read/],
    [incReasonFn(17, 46), /incomplete \(17 of 46 bytes\)/],
    [BL.ANSWER_STREAM_ENDED_BOUND || 'the stream ended before the answer', /the stream ended before the answer/],
    [BL.ANSWER_NOT_JSON_BOUND || 'the site\'s answer was not valid JSON', /not valid JSON/],
    [BL.ANSWER_EMPTY_BOUND || 'the site\'s answer was empty', /answer was empty/],
  ];
  const dM1 = path.join(ROOT, 'm1-causes'); fs.mkdirSync(dM1, { recursive: true });
  const engM1 = VE.create({ dataDir: dM1, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  await engM1.setup(['vault', crypto.randomBytes(4).toString('hex'), 'm1'].join(' '));
  const grantsM1 = GS.create({ memory: true });
  grantsM1.set('browser-login', `${SITE}#*`, { to: [{ kind: 'conversation', key: 'conv-1' }] });
  const fyM1 = [], resM1 = [];
  const loginsM1 = L.create({
    vault: engM1,
    grants: () => grantsM1,
    forYou: { add: (pid, it) => { const id = 'fym1-' + (fyM1.length + 1); fyM1.push({ id, pid, it }); return id; }, resolve: (id) => resM1.push(id) },
  });
  let allFiveOk = true;
  const fiveDiag = [];
  try {
    const fSignup = BL.formOf({ surfaceId: 's-m1', targetId: 'T1', pageOrigin: SITE, frameOrigin: SITE, kind: 'signup', fields: [{ fieldId: 'u', type: 'username' }, { fieldId: 'p', type: 'new-password' }] });
    for (let i = 0; i < fiveCauses.length; i++) {
      const [cause, rx] = fiveCauses[i];
      const u = `cause${i}@example.test`;
      const name = `web-login:${SITE}#${u}`;
      const pf = loginsM1.planFill({ forms: [fSignup], newUser: u, generate: true, facts: ME, conv: 'conv-1', actor: 'Chat One' });
      const nBefore = fyM1.length;
      const np1 = loginsM1.notePendingReason(name, cause, { notify: true, profileId: 'bp-e0000b01', conversation: 'Chat One' });
      const np2 = loginsM1.notePendingReason(name, cause, { notify: true, profileId: 'bp-e0000b01', conversation: 'Chat One' });
      const ent = loginsM1.list().entries.find((e) => e.name === name);
      const rowTxt = ent ? renderVaultRowPendingText(ent) : '';
      const fyItem = fyM1.length > nBefore ? fyM1[fyM1.length - 1] : null;
      const nwChg = BL.noticeWords('pending-change', { origin: SITE, username: u, conversation: 'Chat One', reason: cause });
      const cf = loginsM1.confirmOwn(name, { who: 'owner' });
      const causeOk = Boolean(
        pf.ok && np1.ok && np2.ok
        && fyM1.length === nBefore + 1
        && ent && ent.pendingReason === cause
        && rx.test(rowTxt)
        && fyItem && rx.test(fyItem.it.text) && /— Chat One$/.test(fyItem.it.text)
        && nwChg && rx.test(nwChg.text)
        && cf.ok && resM1.includes(fyItem.id)
      );
      if (!causeOk) allFiveOk = false;
      fiveDiag.push({ cause, causeOk, rowTxt, fyText: fyItem && fyItem.it.text });
    }
  } finally {
    engM1.close();
  }
  const pendingNoticeKeys = [
    ...Object.values(BL.PENDING_NOTICE_DETAIL || {}),
    ...Object.values((BL.PENDING_NOTICE_TEXT && BL.PENDING_NOTICE_TEXT['pending-register']) || {}),
    ...Object.values((BL.PENDING_NOTICE_TEXT && BL.PENDING_NOTICE_TEXT['pending-change']) || {}),
    'Why not auto-confirmed: the site\'s answer was incomplete ({got} of {total} bytes) — confirm here if the site accepted it.',
    'Why not auto-confirmed: the stream ended before the answer — confirm here if the site accepted it.',
    'Why not auto-confirmed: the site\'s answer was not valid JSON — confirm here if the site accepted it.',
    'Why not auto-confirmed: the site\'s answer was empty — confirm here if the site accepted it.',
  ];
  ok(allFiveOk && Boolean(BL.PENDING_NOTICE_DETAIL) && pendingNoticeKeys.every((k) => hasKey(zh, k) && hasKey(ja, k)),
    'r13 MINOR 1 PURE + in-process [r13-pure-m1]: all 5 answer causes round-trip into Vault row + deduplicated For-you notice (resolved on Confirm) and zh/ja i18n',
    { fiveDiag, missingI18n: pendingNoticeKeys.filter((k) => !hasKey(zh, k) || !hasKey(ja, k)) });

  // (3) MINOR 2 PURE BOM-stripping JSON judge + rolling-hash target matcher sanity
  const jBomOk = judgeFn('\uFEFF{"ok":true}', 'application/json; charset=utf-8', { sawBodyBytes: true, expectedBytes: 14 });
  const jBomErr = judgeFn('\uFEFF{"ok":false,"error":"bad_pw"}', 'application/json', { sawBodyBytes: true, expectedBytes: 31 });
  const jBomOnly = judgeFn('\uFEFF', 'application/json', { sawBodyBytes: true, expectedBytes: 3 });
  const secUtf8 = 'päss-' + crypto.randomBytes(5).toString('hex');
  const builtTargets = LF.buildFilledTargets([secUtf8]);
  const scanSecret = new Function('str', `${LF.filledTargetSrc(builtTargets.salt, builtTargets.targets)}\nreturn scanFilledTarget(str);`);
  const hitRes = scanSecret(`{"leak":"${secUtf8}","safe":"hello"}`);
  const safeRes = scanSecret('{"safe":"hello"}');
  LF.clearAllFilledSecrets();
  ok(
    typeof BL.judgeCredResponseBody === 'function'
    && jBomOk.complete === true && jBomOk.errBody === false
    && jBomErr.complete === true && jBomErr.errBody === true
    && isErrFn('\uFEFF{"authenticated":false}') === true
    && isErrFn('\uFEFF{"ok":true}') === false
    && jBomOnly.complete === false && Boolean(BL.ANSWER_EMPTY_BOUND) && jBomOnly.reason === BL.ANSWER_EMPTY_BOUND
    && hitRes === 'match' && safeRes === false,
    'r13 MINOR 2 PURE [r13-pure-m2]: stripUtf8Bom + judgeCredResponseBody/isJsonErrorBody handle UTF-8 BOM ok, error, and BOM-only JSON, and rolling-hash matcher detects multi-byte secrets',
    { jBomOk, jBomErr, jBomOnly });

  // (4) Fast RED mutant controls for r13 MAJOR 1, MINOR 1, MINOR 2
  const mutR12Judge = SRC.replace(
    'if ((claimsJson && hadBytes) || (raw.length === 0 && expNum > 4)) {',
    'if (claimsJson || hadBytes) {'
  );
  const BLmut1 = mutR12Judge !== SRC ? MUT.load('src/browser-login.js', mutR12Judge, 'r13-pure-mut1-emptyjson') : null;
  const mutNoBom = SRC.replaceAll(
    'stripUtf8Bom(raw).trim()',
    'String(raw || "").replace(/^[ \\t\\r\\n]+|[ \\t\\r\\n]+$/g, "")'
  );
  const BLmut2 = mutNoBom !== SRC ? MUT.load('src/browser-login.js', mutNoBom, 'r13-pure-mut2-nobom') : null;
  ok(
    Boolean(BLmut1 && typeof BLmut1.judgeCredResponseBody === 'function' && BLmut1.judgeCredResponseBody('', 'application/json', { sawBodyBytes: false, expectedBytes: 0 }).complete === false)
    && Boolean(BLmut2 && typeof BLmut2.judgeCredResponseBody === 'function' && BLmut2.judgeCredResponseBody('\uFEFF{"ok":true}', 'application/json', { sawBodyBytes: true, expectedBytes: 14 }).complete === false
      && BLmut2.isJsonErrorBody('\uFEFF{"ok":false}') === false),
    'r13 PURE RED controls [r13-pure-mut]: rejecting 0-byte JSON breaks Express CL:0 200, and skipping BOM strip breaks BOM JSON ok & makes BOM error JSON fail-open');
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ' passed' : ''})`);
process.exit(fail ? 1 : 0);
