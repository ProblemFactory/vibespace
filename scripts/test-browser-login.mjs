#!/usr/bin/env node
// test-browser-login — lane browser-login (P3 of the custom browser kernel, docs/design-custom-browser-plugin.zh.md §4): on a kernel
// whose VibeSpace.getVersion lists `credentials`, the password manager is VibeSpace's vault — the kernel reports a page's login forms
// (VibeSpace.credentialFormDetected), fills what the vault holds (VibeSpace.fillCredential — the agent never sees a value) and says
// when the page took a form (VibeSpace.credentialSubmitted) — an account the agent registers goes THROUGH the vault and is saved
// automatically with its provenance; a password the agent typed itself is saved too, marked agent-typed (the owner's D3 / D5).
// Fast tier, in-process: the PURE module, the REAL dialog watch over THE FAKE KERNEL (scripts/fixtures/fake-kernel.mjs — extended
// with the credential legs), the REAL logins module over a REAL vault engine + a memory grants store, the REAL routes + the REAL CLI.
// Every fixture password is built at run time; no suite assertion compares a FILLED value (the stub's filledCredentials count and
// expectedOrigin only — the vault's own save verdict proves the bytes).
//   ① PURE names / origins / resources — the phishing rule's spelling (exact to the port), the entry name ≡ the engine's SECRET_RE
//   ② the record (recordOf / textOf / publicOf — never a password in the public facts)
//   ③ the form (formOf: closed types, the constraints kept, the page's words dropped; formOfSurface: an http-auth surface)
//   ④ THE FILL VERDICT — every row in its order (form · phishing · ambiguity · grant · vault), each grant scope, the model's refusals
//   ⑤ THE PASSWORD the vault mints — length, classes, the site's constraints, an unsatisfiable pattern by name; a RED control
//   ⑥ THE SAVE VERDICT — new / same / update / agent-typed / owner-card / none, and what the ONE writer seals
//   ⑦ the words (the agent's sentence never holds a value; the owner's notice in en / zh / ja)
//   ⑧ THE WATCH over the fake kernel + a REAL vault: detect → fill → submit (login, two-step, signup, change, agent-typed, a person's
//      own in a takeover, the vault locked, a kernel without the feature, standard Chrome, the kernel's stale_origin, http-auth)
//   ⑧b lane engine-distribution: the NO-ECHO kernel (mode.omitFilledPassword — the real kernel sends no password while the box
//      holds the vault's value): a pending register promoted · an existing login none · a typed-over value rides; a RED control
//   ⑨ THE DOORS: the REAL route + the REAL CLI; the owner's card route refuses an agent; the Vault window's rows
//   ⑩ RED controls: a fill verdict without the frame check, without the grant — each lets the bad fill through
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BL = require('../src/browser-login.js');
const GM = require('../src/grant-model.js');
const VI = require('../src/vault-inventory.js');
const D = require('../src/server/browser-dialogs.js');
const L = require('../src/server/browser-logins.js');
const VE = require('../src/server/vault-engine.js');
const GS = require('../src/server/grants-store.js');
const VT = require('../src/server/vault-totp.js');
const T = require('../src/totp.js');
const V = require('../src/browser-verbs.js');
const express = require('express');
const { startFakeKernel } = await import('./fixtures/fake-kernel.mjs');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000, step = 10) { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch { v = false; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
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
console.log('④ the fill verdict — form · phishing · ambiguity · grant · vault (in that order)');
const ME = { conversationKeys: ['conv-1'], groupIds: ['tg-1'] };
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

// ═══ ⑧ THE WATCH over the fake kernel + a REAL vault ═══
console.log('⑧ the dialog watch over the FAKE KERNEL + the logins module over a REAL vault');
const PID = 'bp-e0000b01', KEY = 'bk-0000b10c';
const TGT = { profileId: PID, browserKey: KEY, ephemeral: true };
async function world({ mode = {}, takeover = () => false, kernel = startFakeKernel } = {}) {
  const d = path.join(ROOT, 'w-' + crypto.randomBytes(3).toString('hex')); fs.mkdirSync(d, { recursive: true });
  const eng = VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
  const VPW = ['vault', crypto.randomBytes(4).toString('hex'), 'second'].join(' ');
  await eng.setup(VPW);
  const grants = GS.create({ memory: true });
  const totp = VT.create({ dataDir: d, vault: eng, log: () => { } });
  const fy = [], resolved = [];
  const logins = L.create({ vault: eng, grants: () => grants, totpCode: (n, o) => totp.codeForLogin(n, o), forYou: { add: (pid, it) => { fy.push({ pid, it }); return 'fy-' + fy.length; }, resolve: (id) => resolved.push(id) } });
  const k = await kernel({ firstUrl: SITE + '/login', mode });
  const evs = [], logs = [];
  const w = D.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: k.wsUrl }), onLease: () => () => { } }, log: { warn: (l) => logs.push(String(l)), log() { } }, enableTimeoutMs: 300, holdersOf: () => [{ browserKey: KEY, sessionId: 'sess-1', ephemeral: true }], leaseCountOf: () => 1, labelOf: () => 'Work',
    logins, conversationOf: () => ({ cid: 'conv-1', name: 'Chat One' }), takeoverOf: () => takeover(), forYou: { add: () => null, resolve() { } } });
  w.onChange((e) => evs.push(e));
  await w.arm(PID, { budgetMs: 3000 });
  const audit = () => { try { return fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const close = async () => { w.shutdown(); await k.close(); eng.close(); };
  return { d, eng, VPW, grants, totp, logins, fy, resolved, k, w, evs, logs, audit, close };
}
const FILL = (o = {}) => ({ facts: ME, conv: 'conv-1', actor: 'Chat One', ...o });
const fresh = (X) => X.evs.length;
{
  const X = await world();
  try {
    const tid = X.k.targets()[0].targetId;
    // detect
    const f1 = X.k.detectCredentialForm({ targetId: tid, kind: 'login' });
    await until(() => X.w.loginForms(PID).length === 1, 1500);
    ok(eq(X.w.loginForms(PID), [{ id: f1.surfaceId, targetId: tid, kind: 'login', origin: SITE, fields: ['username', 'password'] }]) && X.evs.some((e) => e.kind === 'login-form' && e.form.id === f1.surfaceId), 'credentialFormDetected ⇒ the tab keeps the form (ids, kind, origin, field types — nothing the page wrote)', X.w.loginForms(PID));
    // nothing in the vault, nothing granted
    let r = await X.w.fillLogin(TGT, FILL());
    ok(!r.ok && r.code === 'login_no_entry' && X.k.filledCredentials().length === 0, 'no login of the site in the vault ⇒ login_no_entry, nothing filled');
    const PW = pwOf('own');
    ok(X.logins.addOwn({ origin: SITE, username: 'Alice', password: PW }).ok, 'the owner adds their own login (the Vault window\'s door)');
    r = await X.w.fillLogin(TGT, FILL());
    ok(!r.ok && r.code === 'login_not_granted' && X.k.filledCredentials().length === 0, 'kept but not granted to this conversation ⇒ login_not_granted, nothing filled');
    const deny = X.audit().filter((l) => l.event === 'vault-use' && l.door === 'browser-login');
    ok(deny.length === 1 && deny[0].outcome === 'not_granted' && deny[0].conv === 'conv-1' && deny[0].entry === `web-login:${SITE}#alice`, 'the refused use is ONE vault-use line (the use law: a bearer\'s refusal counts too)', deny);
    ok(X.logins.grant(`web-login:${SITE}#alice`, 'this-account', 'session:conv-1').ok && X.grants.rowsFor('browser-login', `${SITE}#alice`).length === 1, 'the owner grants THIS account to the conversation (the grants store\'s ONE writer)');
    r = await X.w.fillLogin(TGT, FILL());
    const fc = X.k.filledCredentials();
    ok(r.ok && r.mode === 'login' && eq(r.filled, ['username', 'password']) && fc.length === 1 && fc[0].count === 2 && fc[0].expectedOrigin === SITE && fc[0].surfaceId === f1.surfaceId && fc[0].submit === false, 'FILLED: VibeSpace.fillCredential on the form — the stub counts 2 fields, expectedOrigin = the entry\'s origin (the kernel checks it again)', { r, fc });
    ok(!JSON.stringify(r).includes(PW) && /^vr-[0-9a-f]{12}$/.test(r.receipt || ''), 'the agent\'s answer holds NO value — what was filled + a receipt', r);
    const use1 = X.audit().filter((l) => l.event === 'vault-use' && l.door === 'browser-login' && l.outcome === 'ok');
    ok(use1.length === 1 && use1[0].purpose === `sign in at ${SITE}` && use1[0].receipt === r.receipt && !fs.readFileSync(path.join(X.d, VE.AUDIT_FILE), 'utf8').includes(PW), 'THE USE LAW: one vault-use line (door browser-login, purpose «sign in at <origin>», the receipt the agent got) — never the password', use1);
    // submit: the page takes it — the vault already holds it ⇒ same: nothing written, no notice
    const before = X.fy.length;
    r = await X.w.fillLogin(TGT, FILL({ submit: true }));
    await until(() => X.evs.some((e) => e.kind === 'login-saved'), 1500);
    ok(r.ok && r.submitted && X.k.filledCredentials().pop().submit === true && X.evs.filter((e) => e.kind === 'login-saved').pop().state === 'same' && X.fy.length === before, '--submit: the kernel submits; the page\'s credentialSubmitted carries the vault\'s own password ⇒ SAME (no write, no notice — the bytes the kernel filled were the vault\'s)');
    // a new document clears the tab's forms
    X.k.navigate(tid, SITE + '/account');
    await until(() => X.w.loginForms(PID).length === 0, 1500);
    ok(X.w.loginForms(PID).length === 0, 'a main-frame navigation clears the tab\'s forms (a new document — its forms are new too)');
    r = await X.w.fillLogin(TGT, FILL());
    ok(!r.ok && r.code === 'login_no_form', 'no form after the navigation ⇒ login_no_form');
  } finally { await X.close(); }
}
{
  // two-step: the login's paired code is filled (D3 — the login grant covers it)
  const X = await world();
  try {
    const tid = X.k.targets()[0].targetId;
    const seed = T.base32Encode(crypto.randomBytes(20));
    const add = X.totp.addEntry({ seed, name: 'shop' }, { who: 'test' });
    ok(add.ok, 'a two-step entry in the vault (the owner\'s)', add);
    X.logins.addOwn({ origin: SITE, username: 'alice', password: pwOf('otp'), totpName: 'shop' });
    X.logins.grant(`web-login:${SITE}#alice`, 'any-site', 'session:conv-1');
    X.k.detectCredentialForm({ targetId: tid, kind: 'login', otp: true });
    await until(() => X.w.loginForms(PID).length === 1, 1500);
    const r = await X.w.fillLogin(TGT, FILL());
    const fc = X.k.filledCredentials().pop();
    const tu = X.audit().filter((l) => l.event === 'vault-totp-use');
    ok(r.ok && eq(r.filled, ['username', 'password', 'otp']) && fc.count === 3 && tu.length === 1 && tu[0].via === 'browser-login' && tu[0].ok === true, 'D3: the paired two-step code is computed on the hub and filled (3 fields) — ONE vault-totp-use line via browser-login, no second grant', { r, tu });
    X.logins.addOwn({ origin: SITE2, username: 'zed', password: pwOf('z') });
    X.logins.grant(`web-login:${SITE2}#zed`, 'this-account', 'session:conv-1');
    X.k.detectCredentialForm({ targetId: tid, kind: 'login', otp: true, origin: SITE2 });
    await until(() => X.w.loginForms(PID).length === 2, 1500);
    const r2 = await X.w.fillLogin(TGT, FILL({ origin: SITE2 }));
    ok(r2.ok && r2.otpMissing && eq(r2.filled, ['username', 'password']) && /asks for a two-step code the vault holds none for/.test(BL.loginText(r2)), 'a page asking for a code the login has none for: the rest is filled and the agent is told (no code invented)', r2);
  } finally { await X.close(); }
}
{
  // REGISTRATION through the vault: --new-user --generate ⇒ sealed BEFORE the fill, saved on submission, ONE notice
  const X = await world();
  try {
    const tid = X.k.targets()[0].targetId;
    const sf = X.k.detectCredentialForm({ targetId: tid, kind: 'signup', constraints: { minLength: 12, maxLength: 64, pattern: '[A-Za-z0-9!#%*+.:=?@^_~-]+', required: true } });
    await until(() => X.w.loginForms(PID).length === 1, 1500);
    let r = await X.w.fillLogin(TGT, FILL({ newUser: 'NewUser@example.test', generate: true }));
    ok(!r.ok && r.code === 'login_not_granted', 'no «any account on this site» / «any site» grant ⇒ an agent may not register (login_not_granted)');
    ok(X.logins.grant(`web-login:${SITE}#x`, 'any-account', 'group:tg-1').ok, 'the owner lets the conversation\'s Task Group register on this site (any account)');
    r = await X.w.fillLogin(TGT, FILL({ newUser: 'NewUser@example.test', generate: true }));
    const name = `web-login:${SITE}#newuser@example.test`;
    const sealed = X.eng.secretGet(name);
    const rec = sealed.ok && sealed.value ? BL.recordOf(sealed.value.toString('utf8')) : null;
    const fc = X.k.filledCredentials().pop();
    ok(r.ok && r.mode === 'signup' && eq(r.filled, ['username', 'new-password']) && fc.count === 2 && fc.expectedOrigin === SITE && fc.surfaceId === sf.surfaceId, 'a signup is filled: the user name + the vault\'s password (2 fields, the entry\'s origin expected)', { r, fc });
    ok(rec && rec.source === 'vault-minted' && rec.strength === 'generated' && rec.pending === 'register' && rec.password.length === 20 && /^[A-Za-z0-9!#%*+.:=?@^_~-]+$/.test(rec.password) && rec.createdIn.conversation === 'Chat One' && rec.username === 'NewUser@example.test', 'SEALED BEFORE THE FILL: the entry is in the vault (vault-minted, generated, pending) the moment the kernel is handed its password — the site\'s pattern honoured', rec && { ...rec, password: rec.password.length });
    ok(!JSON.stringify(r).includes(rec.password) && r.length === 20, 'the agent\'s answer holds no value (the length only)');
    const n0 = X.fy.length;
    X.k.submitCredentialForm({ surfaceId: sf.surfaceId, usernameHint: 'NewUser@example.test' }); // the page takes it (this kernel hands no password)
    await until(() => X.evs.some((e) => e.kind === 'login-saved' && e.state === 'new'), 1500);
    const after = BL.recordOf(X.eng.secretGet(name).value.toString('utf8'));
    const notices = X.fy.slice(n0);
    ok(after && !after.pending && after.submittedAt && after.source === 'vault-minted' && notices.length === 1 && notices[0].it.kind === 'notice' && /registered newuser@example\.test on shop\.example\.test/i.test(notices[0].it.text) && !notices[0].it.action, 'the page took it ⇒ saved AUTOMATICALLY (pending cleared) and ONE For-you NOTICE (informational — no action, never an approval)', notices.map((n) => n.it));
    const rows = X.eng.secretNames().filter((s) => s.name === name);
    const vrow = VI.rowOf('secrets', VI.secretRowOf(rows[0]));
    ok(vrow && VI.purposeOf(vrow) === 'web-logins' && VI.provenanceOf(vrow) === 'agent-mint' && vrow.kind === 'login' && /registered by an agent/i.test(vrow.detail) && vrow.doors.delete && vrow.doors.login, 'the Vault window\'s row: purpose Web logins, provenance «minted by an agent · never shown», its delete door and 用于…', vrow);
    // a second submission of the same ⇒ same, nothing new
    X.k.submitCredentialForm({ surfaceId: sf.surfaceId, usernameHint: 'NewUser@example.test', password: after.password });
    await sleep(60);
    ok(X.fy.length === n0 + 1, 'the same password submitted again ⇒ same: no write, no second notice');
    // the site's rules no strong password meets
    X.k.detectCredentialForm({ targetId: tid, kind: 'signup', surfaceId: 'surf-cred-pin', constraints: { minLength: 6, maxLength: 6, pattern: '[0-9]{6}' } });
    await until(() => X.w.loginForms(PID).length === 2, 1500);
    const nf = X.k.filledCredentials().length;
    r = await X.w.fillLogin(TGT, FILL({ newUser: 'pinuser', generate: true }));
    ok(!r.ok && r.code === 'password_rules_unsupported' && X.k.filledCredentials().length === nf && !X.eng.secretGet(`web-login:${SITE}#pinuser`).value, 'a six-digit PIN rule ⇒ password_rules_unsupported: nothing filled, nothing sealed');
    // a change-password form: the vault mints the new one, the old kept a revision
    const cid = 'surf-cred-chg';
    X.k.detectCredentialForm({ targetId: tid, surfaceId: cid, kind: 'change-password', fields: [{ fieldId: 'c-1', type: 'password' }, { fieldId: 'c-2', type: 'new-password' }] });
    await until(() => X.w.loginForms(PID).length === 3, 1500);
    X.logins.grant(name, 'this-account', 'session:conv-1');
    r = await X.w.fillLogin(TGT, FILL({ user: 'newuser@example.test', generate: true }));
    const ch = BL.recordOf(X.eng.secretGet(name).value.toString('utf8'));
    ok(r.ok && r.mode === 'change' && X.k.filledCredentials().pop().count === 2 && ch.pending === 'change' && ch.previous.password === after.password && ch.password !== after.password, 'a change-password form: current + new filled (2), the new one SEALED first, the old kept as previous');
    const n1 = X.fy.length;
    X.k.submitCredentialForm({ surfaceId: cid, usernameHint: 'NewUser@example.test' });
    await until(() => X.fy.length === n1 + 1, 1500);
    ok(/was updated/.test(X.fy[X.fy.length - 1].it.text) && !BL.recordOf(X.eng.secretGet(name).value.toString('utf8')).pending, 'the page took the change ⇒ confirmed, the notice says «updated»');
  } finally { await X.close(); }
}
{
  // AGENT-TYPED: a password the vault never minted — saved automatically, marked; same again ⇒ nothing; different ⇒ updated
  const X = await world();
  try {
    const tid = X.k.targets()[0].targetId;
    const TYPED = pwOf('typed'), TYPED2 = pwOf('typed2');
    X.k.submitCredentialForm({ targetId: tid, usernameHint: 'Carol', password: TYPED });
    await until(() => X.evs.some((e) => e.kind === 'login-saved'), 1500);
    const name = `web-login:${SITE}#carol`;
    const rec = BL.recordOf(X.eng.secretGet(name).value.toString('utf8'));
    ok(rec && rec.source === 'agent-typed' && rec.strength === 'unknown' && rec.by === 'agent' && rec.password === TYPED && rec.createdIn.conversation === 'Chat One' && X.evs.filter((e) => e.kind === 'login-saved').pop().state === 'agent-typed', 'AGENT-TYPED: saved automatically (source agent-typed, strength unknown, the conversation) — never discarded', rec && { ...rec, password: '…' });
    ok(X.fy.length === 1 && /typed itself/.test(X.fy[0].it.text) && X.fy[0].it.kind === 'notice', 'ONE notice says so («typed by the agent»)');
    const vrow = VI.rowOf('secrets', VI.secretRowOf(X.eng.secretNames().find((s) => s.name === name)));
    ok(VI.provenanceOf(vrow) === 'agent-put' && VI.stateChipsOf(vrow).some((c) => c.id === 'rotate') && /Typed by an agent/.test(vrow.detail), 'the Vault window marks it: «stored by an agent · it saw the value» + the rotate chip');
    X.k.submitCredentialForm({ targetId: tid, usernameHint: 'carol', password: TYPED });
    await sleep(60);
    ok(X.fy.length === 1, 'the same password again ⇒ same: no write, no notice');
    X.k.submitCredentialForm({ targetId: tid, usernameHint: 'carol', password: TYPED2 });
    await until(() => X.fy.length === 2, 1500);
    const up = BL.recordOf(X.eng.secretGet(name).value.toString('utf8'));
    ok(up.password === TYPED2 && up.previous.password === TYPED && /was updated/.test(X.fy[1].it.text), 'another password ⇒ UPDATED, the old one kept one revision, the notice says «updated»');
    ok(!X.logs.some((l) => l.includes(TYPED) || l.includes(TYPED2)) && !fs.readFileSync(path.join(X.d, VE.AUDIT_FILE), 'utf8').includes(TYPED), 'no journal line and no audit line carries a submitted password');
    // the flood guard: a page inventing submissions adds at most TYPED_MAX new typed logins a site in 10 minutes
    const before = X.eng.secretNames().filter((x) => BL.isEntryName(x.name)).length;
    for (let i = 0; i < L.TYPED_MAX + 3; i++) X.k.submitCredentialForm({ targetId: tid, origin: SITE2, usernameHint: `flood${i}`, password: pwOf('fl' + i) });
    await until(() => X.evs.filter((e) => e.kind === 'login-saved' && e.state === 'none').length >= 3, 2000);
    const added = X.eng.secretNames().filter((x) => BL.isEntryName(x.name)).length - before;
    ok(added === L.TYPED_MAX && X.evs.filter((e) => e.kind === 'login-saved' && e.state === 'none').length >= 3 && X.eng.secretNames().filter((x) => x.name.startsWith(`web-login:${SITE2}#flood`)).length === L.TYPED_MAX, `THE FLOOD GUARD: a page of another site inventing ${L.TYPED_MAX + 3} submissions adds ${L.TYPED_MAX} typed logins (a site in 10 minutes) — the rest are not saved, each a journal line`, added);
    // the vault locked: held, then written at the next unlock
    X.eng.lock();
    const TYPED3 = pwOf('typed3');
    X.k.submitCredentialForm({ targetId: tid, usernameHint: 'dave', password: TYPED3 });
    await until(() => X.evs.some((e) => e.kind === 'login-saved' && e.state === 'held'), 1500);
    ok(X.logins._held.length === 1, 'a submission while the vault is LOCKED is held (in memory, ≤ 4) — an account is never lost to a lock');
    await X.eng.unlock(X.VPW);
    await until(() => X.logins._held.length === 0, 1500);
    const dv = X.eng.secretGet(`web-login:${SITE}#dave`);
    ok(dv.ok && dv.value && BL.recordOf(dv.value.toString('utf8')).source === 'agent-typed', 'the unlock writes it (agent-typed)');
    // a fill while locked
    X.eng.lock();
    X.k.detectCredentialForm({ targetId: tid, kind: 'login' });
    await until(() => X.w.loginForms(PID).length === 1, 1500);
    X.grants.set('browser-login', '*', { to: [{ kind: 'everyone' }] });
    const lr = await X.w.fillLogin(TGT, FILL({ user: 'carol' }));
    ok(!lr.ok && lr.code === 'vault_locked' && /already been told/.test(lr.error), 'a fill while the vault is locked ⇒ vault_locked (the vault rule\'s words), nothing filled', lr);
  } finally { await X.close(); }
}
{
  // A PERSON's own submission in a takeover ⇒ the owner's save-login card (approve / not now)
  let tk = true;
  const X = await world({ takeover: () => tk });
  try {
    const tid = X.k.targets()[0].targetId;
    const HPW = pwOf('human');
    X.k.submitCredentialForm({ targetId: tid, usernameHint: 'erin', password: HPW });
    await until(() => X.fy.length === 1, 1500);
    const c = X.fy[0].it;
    ok(c.kind === 'action' && c.action.type === 'save-login' && /^sl-[0-9a-f]{8}$/.test(c.action.id) && c.action.shown && /Save the login erin on shop\.example\.test/.test(c.text) && !X.eng.secretGet(`web-login:${SITE}#erin`).value, 'a person typing in a live-view takeover ⇒ the owner\'s save-login CARD (nothing written yet)', c);
    ok(!X.logins.answerCard(c.action.id, { approve: true, shown: 'nope' }).ok && X.logins.answerCard(c.action.id, { approve: true, shown: 'nope' }).code === 'card_changed', 'a card answered with another digest ⇒ card_changed, nothing saved');
    const a = X.logins.answerCard(c.action.id, { approve: true, shown: c.action.shown });
    const rec = BL.recordOf(X.eng.secretGet(`web-login:${SITE}#erin`).value.toString('utf8'));
    ok(a.ok && a.saved && rec.by === 'owner' && rec.source === 'owner' && rec.password === HPW && X.resolved.includes('fy-1') && X.logins._cards.size === 0, 'Save ⇒ the owner\'s login (by owner) through the ONE writer; the card resolved and its password forgotten');
    X.k.submitCredentialForm({ targetId: tid, usernameHint: 'fred', password: pwOf('h2') });
    await until(() => X.fy.length === 2, 1500);
    const r2 = X.logins.answerCard(X.fy[1].it.action.id, { approve: false, shown: X.fy[1].it.action.shown });
    ok(r2.ok && !r2.saved && !X.eng.secretGet(`web-login:${SITE}#fred`).value && X.logins._cards.size === 0, 'Not now ⇒ forgotten (nothing written, the held password dropped)');
    tk = false;
  } finally { await X.close(); }
}
{
  // kernels without the feature; standard Chrome; the kernel's stale_origin; an http-auth surface
  const A = await world({ mode: { features: ['surfaces', 'webauthn'] } });
  try {
    A.k.detectCredentialForm({ targetId: A.k.targets()[0].targetId });
    await sleep(80);
    const r = await A.w.fillLogin(TGT, FILL());
    ok(A.w.loginForms(PID).length === 0 && !r.ok && r.code === 'login_no_form' && /standard Chrome/.test(r.error) && A.logs.some((l) => /does not list the credentials feature/.test(l)), 'a kernel whose features do not list credentials: no form is kept, `login` ⇒ login_no_form (one journal line)');
  } finally { await A.close(); }
  const S = await world({ mode: { standard: true } });
  try { const r = await S.w.fillLogin(TGT, FILL()); ok(!r.ok && r.code === 'login_no_form', 'standard Chrome ⇒ login_no_form (no form is ever reported)'); } finally { await S.close(); }
  const X = await world();
  try {
    const tid = X.k.targets()[0].targetId;
    X.logins.addOwn({ origin: SITE, username: 'alice', password: pwOf('st') });
    X.grants.set('browser-login', `${SITE}#alice`, { to: [{ kind: 'conversation', key: 'conv-1' }] });
    // the KERNEL checks the origin again: its form moved to another site while the watch's record still says this one ⇒ stale_origin
    X.k.detectCredentialForm({ targetId: tid, surfaceId: 'surf-cred-moved', kind: 'login', origin: SITE2 });
    await until(() => X.w.loginForms(PID).some((x) => x.id === 'surf-cred-moved'), 1500);
    X.w._watches.get(PID).targets.get(tid).forms = [BL.formOf({ surfaceId: 'surf-cred-moved', targetId: tid, pageOrigin: SITE, frameOrigin: SITE, fields: [{ fieldId: 'f-1-1', type: 'username' }, { fieldId: 'f-1-2', type: 'password' }] }, { now: Date.now() })];
    const before = X.k.filledCredentials().length;
    const r = await X.w.fillLogin(TGT, FILL());
    ok(!r.ok && r.code === 'login_phishing' && /no longer https:\/\/shop\.example\.test/.test(r.error) && X.k.filledCredentials().length === before, 'the KERNEL checks the origin again: the page moved to another site under the form ⇒ stale_origin ⇒ login_phishing, nothing filled', r);
    // an http-auth surface answered by a saved login (the same rule, the same grant)
    X.w._watches.get(PID).targets.get(tid).forms = [];
    X.k.openSurface({ kind: 'http-auth', targetId: tid, origin: SITE, title: 'Sign in', message: 'shop.example.test asks you to sign in', fields: [{ fieldId: 'username', type: 'text', label: 'User' }, { fieldId: 'password', type: 'password', label: 'Password' }], answers: [{ id: 'sign-in', label: 'Sign in', kind: 'credential' }, { id: 'cancel', label: 'Cancel', kind: 'dismiss' }], detail: { host: 'shop.example.test', realm: 'Shop', scheme: 'basic', isProxy: false } });
    await until(() => (X.w.surfacesIn(PID) || []).some((s) => s.kind === 'http-auth'), 1500);
    const ha = X.w.surfacesIn(PID).find((s) => s.kind === 'http-auth');
    ok(ha && ha.logins === true && /A login the vault keeps fills it: vibespace-browser login/.test(require('../src/browser-surfaces.js').surfaceText(ha)), 'an http-auth surface on a credentials kernel: the agent\'s sentence names `vibespace-browser login`', ha && require('../src/browser-surfaces.js').surfaceText(ha));
    const hr = await X.w.fillLogin(TGT, FILL());
    const last = X.k.answers().pop();
    ok(hr.ok && hr.submitted && last && last.answerId === 'sign-in' && eq(Object.keys(last.values || {}).sort(), ['password', 'username']), 'the O answer through the login road: VibeSpace.answerSurface with its credential answer, both fields from the vault (the agent never typed one)', { hr, last: last && { answerId: last.answerId, keys: Object.keys(last.values || {}) } });
  } finally { await X.close(); }
}

// ⑧b lane engine-distribution (主开发 with the kernel side, 2026-10-25 — the gate before their stub flips its default): THE REAL
// KERNEL DOES NOT ECHO a password in VibeSpace.credentialSubmitted while the box still holds the value the vault filled (its
// kernel-private filledByVibeSpaceValue): the event is {surfaceId, origin, usernameHint, outcome} — no password. The fake kernel's
// `mode.omitFilledPassword` is that kernel; a value anyone else typed into the box rides as before. Three legs + a RED control.
{
  const X = await world({ mode: { omitFilledPassword: true } });
  try {
    const tid = X.k.targets()[0].targetId;
    // LEG 1 — a pending register: --new-user --generate --submit ⇒ no password in the event ⇒ the pending entry PROMOTED (new, confirm), ONE notice
    X.logins.grant(`web-login:${SITE}#x`, 'any-account', 'session:conv-1');
    const sf = X.k.detectCredentialForm({ targetId: tid, kind: 'signup' });
    await until(() => X.w.loginForms(PID).length === 1, 1500);
    const name = `web-login:${SITE}#reg@example.test`;
    const n0 = X.fy.length, s0 = X.k.submissions().length;
    let pendingText = null;
    const r1 = await X.w.fillLogin(TGT, FILL({ newUser: 'reg@example.test', generate: true, submit: true }));
    pendingText = X.eng.secretGet(name).ok ? X.eng.secretGet(name).value.toString('utf8') : null;
    await until(() => X.evs.some((e) => e.kind === 'login-saved' && e.name === name), 1500);
    const sub1 = X.k.submissions().slice(s0);
    const done1 = BL.recordOf(X.eng.secretGet(name).value.toString('utf8'));
    const saved1 = X.evs.filter((e) => e.kind === 'login-saved' && e.name === name).pop();
    ok(r1.ok && r1.submitted && sub1.length === 1 && sub1[0].surfaceId === sf.surfaceId && sub1[0].hasPassword === false && saved1.state === 'new' && done1 && !done1.pending && done1.source === 'vault-minted' && done1.submittedAt,
      'LEG 1: a vault-minted signup submitted unchanged ⇒ the kernel sends NO password ⇒ the pending entry is PROMOTED (state new, confirmed) — the sealed value never left the vault', { sub1, state: saved1 && saved1.state });
    ok(X.fy.length === n0 + 1 && /registered reg@example\.test/i.test(X.fy[X.fy.length - 1].it.text), '…ONE For-you notice (registered through the vault)');
    // LEG 2 — an existing login filled + submitted ⇒ no password ⇒ state none: no vault write, no notice; the fill's use is still written
    const PWO = pwOf('own2');
    X.logins.addOwn({ origin: SITE, username: 'olga', password: PWO });
    X.logins.grant(`web-login:${SITE}#olga`, 'this-account', 'session:conv-1');
    const lf = X.k.detectCredentialForm({ targetId: tid, kind: 'login', surfaceId: 'surf-cred-olga' });
    await until(() => X.w.loginForms(PID).length === 2, 1500);
    const rec2a = X.eng.secretGet(`web-login:${SITE}#olga`).value.toString('utf8');
    const n2 = X.fy.length, s2 = X.k.submissions().length, u2 = X.audit().filter((l) => l.event === 'vault-use' && l.door === 'browser-login' && l.outcome === 'ok').length;
    const r2 = await X.w.fillLogin(TGT, FILL({ user: 'olga', submit: true }));
    await until(() => X.evs.some((e) => e.kind === 'login-saved' && e.state === 'none'), 1500);
    const sub2 = X.k.submissions().slice(s2);
    ok(r2.ok && sub2.length === 1 && sub2[0].surfaceId === lf.surfaceId && sub2[0].hasPassword === false && X.evs.filter((e) => e.kind === 'login-saved').pop().state === 'none' && X.eng.secretGet(`web-login:${SITE}#olga`).value.toString('utf8') === rec2a && X.fy.length === n2,
      'LEG 2: a saved login filled and submitted ⇒ no password in the event ⇒ state none: no vault write, no notice', { sub2 });
    ok(X.audit().filter((l) => l.event === 'vault-use' && l.door === 'browser-login' && l.outcome === 'ok').length === u2 + 1 && r2.receipt, '…the fill\'s use is still ONE vault-use line with its receipt (the use law does not wait for the page)');
    // LEG 3 — a DIFFERENT value: the box was rewritten after the fill (the agent typing) ⇒ the kernel sends it ⇒ the agent-typed save with provenance
    const lf3 = X.k.detectCredentialForm({ targetId: tid, kind: 'login', surfaceId: 'surf-cred-olga3' });
    await until(() => X.w.loginForms(PID).length === 3, 1500);
    await X.w.fillLogin(TGT, FILL({ user: 'olga' }));
    const OTHER = pwOf('other');
    X.k.typeCredential({ surfaceId: lf3.surfaceId, fieldId: 'f-1-2', value: OTHER });
    const s3 = X.k.submissions().length, n3 = X.fy.length;
    X.k.submitCredentialForm({ surfaceId: lf3.surfaceId, usernameHint: 'olga', password: OTHER });
    await until(() => X.fy.length === n3 + 1, 1500);
    const sub3 = X.k.submissions().slice(s3);
    const up3 = BL.recordOf(X.eng.secretGet(`web-login:${SITE}#olga`).value.toString('utf8'));
    ok(sub3.length === 1 && sub3[0].hasPassword === true && up3.password === OTHER && up3.source === 'agent-typed' && up3.strength === 'unknown' && up3.previous.password === PWO && /was updated/.test(X.fy[X.fy.length - 1].it.text),
      'LEG 3: a value someone typed over the vault\'s ⇒ the kernel DOES send it (loopback CDP only) ⇒ saved with provenance (agent-typed, strength unknown, the old one kept a revision), ONE notice');
    const fresh4 = X.k.detectCredentialForm({ targetId: tid, kind: 'signup', surfaceId: 'surf-cred-typed' });
    await until(() => X.w.loginForms(PID).length === 4, 1500);
    const TY = pwOf('typed-new'), s4 = X.k.submissions().length;
    X.k.typeCredential({ surfaceId: fresh4.surfaceId, fieldId: 'f-1-2', value: TY });
    X.k.submitCredentialForm({ surfaceId: fresh4.surfaceId, usernameHint: 'dora', password: TY });
    await until(() => X.eng.secretGet(`web-login:${SITE}#dora`).ok && !!X.eng.secretGet(`web-login:${SITE}#dora`).value, 1500);
    const d4 = BL.recordOf(X.eng.secretGet(`web-login:${SITE}#dora`).value.toString('utf8'));
    ok(X.k.submissions().slice(s4)[0].hasPassword === true && d4.source === 'agent-typed' && d4.password === TY && d4.createdIn.conversation === 'Chat One', '…a NEW account the agent typed itself (nothing filled) rides too ⇒ the agent-typed auto-save, never discarded');
    // RED CONTROL — the OLD echo reading (a missing password read as «same») fails LEG 1's exact inputs
    const BLS = fs.readFileSync(path.join(REPO, 'src/browser-login.js'), 'utf8');
    const anchor = '  const pendingOk = rec && rec.pending && (!pw || pw === rec.password);';
    ok(BLS.includes(anchor), 'control: saveVerdict\'s pending rule is in src/browser-login.js');
    const BLx = mutantCopies('browser-login-echo', REPO).load('src/browser-login.js', BLS.replace(anchor, "  if (!pw && rec) return { state: 'same' };\n" + anchor), 'echo-same');
    const leg1 = { existing: pendingText, password: null, outcome: 'navigated', by: 'agent' };
    ok(BL.saveVerdict(leg1).state === 'new' && BLx.saveVerdict(leg1).state === 'same', 'control: a saveVerdict that reads a missing password as «same» (the echo reading) answers LEG 1\'s inputs «same» — the pending account never confirmed: RED', { product: BL.saveVerdict(leg1).state, copy: BLx.saveVerdict(leg1).state });
  } finally { await X.close(); }
}
{
  // the kernel side's OWN stub under the same flag (their package, when VIBESPACE_CUSTOM_BROWSER_PLUGIN names it)
  const peer = process.env.VIBESPACE_CUSTOM_BROWSER_PLUGIN || '';
  if (!peer || !fs.existsSync(path.join(peer, 'src', 'fake-kernel-stub.mjs'))) console.log('  … SKIP the three no-echo legs on the kernel side\'s own stub — VIBESPACE_CUSTOM_BROWSER_PLUGIN names no package with src/fake-kernel-stub.mjs here');
  else if (!fs.readFileSync(path.join(peer, 'src', 'fake-kernel-stub.mjs'), 'utf8').includes('omitFilledPassword')) console.log(`  … SKIP the no-echo legs on the kernel side's own stub — its src/fake-kernel-stub.mjs (${fs.statSync(path.join(peer, 'src', 'fake-kernel-stub.mjs')).mtime.toISOString()}) names no omitFilledPassword yet (their v0.1.3 flips it)`);
  else {
    // LEG 2 on THEIR stub (the hands both stubs share): a saved login filled + submitted ⇒ no password ⇒ none, no write, no notice
    const S = await import(pathToFileURL(path.join(peer, 'src', 'fake-kernel-stub.mjs')).href);
    const X = await world({ mode: { omitFilledPassword: true }, kernel: S.startFakeKernel });
    try {
      const tid = X.k.targets()[0].targetId;
      const PWO = pwOf('peer');
      X.logins.addOwn({ origin: SITE, username: 'pia', password: PWO });
      X.logins.grant(`web-login:${SITE}#pia`, 'this-account', 'session:conv-1');
      X.k.detectCredentialForm({ targetId: tid, kind: 'login' });
      await until(() => X.w.loginForms(PID).length === 1, 1500);
      const before = X.eng.secretGet(`web-login:${SITE}#pia`).value.toString('utf8'), n0 = X.fy.length;
      const r = await X.w.fillLogin(TGT, FILL({ user: 'pia', submit: true }));
      await until(() => X.evs.some((e) => e.kind === 'login-saved'), 2000);
      ok(r.ok && X.evs.filter((e) => e.kind === 'login-saved').pop().state === 'none' && X.eng.secretGet(`web-login:${SITE}#pia`).value.toString('utf8') === before && X.fy.length === n0, 'LEG 2 on the kernel side\'s OWN stub under omitFilledPassword: none — no write, no notice');
    } finally { await X.close(); }
  }
}

// ═══ ⑨ THE DOORS: the REAL route + the REAL CLI ═══
console.log('⑨ the real route + the real CLI; the owner\'s card route; the Vault window\'s doors');
{
  const X = await world();
  const HOME = path.join(ROOT, 'home'); fs.mkdirSync(HOME, { recursive: true });
  const REALDIR = path.join(ROOT, 'real'); fs.mkdirSync(REALDIR, { recursive: true });
  const CFG = path.join(ROOT, 'cfg.json'); fs.writeFileSync(CFG, '{}');
  fs.writeFileSync(path.join(REALDIR, 'agent-browser'), `#!${process.execPath}\nif (process.argv[2] === '--version') { console.log('agent-browser ${V.TABLE_VERSION}'); process.exit(0); }\nprocess.exit(0);\n`, { mode: 0o755 });
  const effProfile = { id: PID, ephemeral: true, owner: { kind: 'conversation', id: KEY }, provider: 'chromium', sharing: 'owner', label: '(ephemeral) Chat', dir: null };
  const stubKeeper = {
    resolveFor: () => ({ ok: true, kind: 'none', handles: [] }),
    ensureEphemeral: async () => ({ profile: { id: PID, label: effProfile.label }, browser: { state: 'ready' }, lease: {}, created: false }),
    socketRootOf: () => ({ socketDir: path.join(ROOT, 'sock'), runtimeDir: null }), configFileFor: () => CFG, clock: () => Date.now(),
    profile: (id) => (id === PID ? effProfile : null), profileByRef: () => null, setFor: () => ({ attachments: [], handles: [] }), audit() { }, noteLeaseUrl() { },
    leasesFor: () => [], inputStateFor: () => ({ input: 'agent', takenAt: 0 }), ephemeralFor: (bk) => (bk === KEY ? { profileId: PID, sessionId: 'sess-1' } : null),
    cdpEndpointFor: async (pid) => (pid === PID ? { ok: true, url: X.k.wsUrl } : { ok: false, error: 'no' }), onLease: () => () => { },
  };
  const TOKEN = 'vsst_blogin_1';
  const sessions = new Map([['sess-1', { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', _browserEnv: [`AGENT_BROWSER_SESSION=vs-${KEY}`, `AGENT_BROWSER_NAMESPACE=vs-${KEY}`, `AGENT_BROWSER_CONFIG=${CFG}`], name: 'Chat One', cwd: ROOT, backendSessionId: 'conv-1' }]]);
  const R = require('../src/routes/browser.js');
  const app = express(); app.use(express.json());
  const traced = [];
  R.setup({ keeper: stubKeeper, activeSessions: sessions, dialogs: X.w, logins: X.logins, tasksForSession: () => ['tg-1'], traceDialogAct: (act) => traced.push(act) });
  app.use(R.router);
  const apiSrv = http.createServer(app); const apiPort = await freePort(); await new Promise((r) => apiSrv.listen(apiPort, '127.0.0.1', r));
  const API = `http://127.0.0.1:${apiPort}`;
  const PASSWD = path.join(ROOT, 'passwd.cjs'); fs.writeFileSync(PASSWD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(HOME)} });\n`);
  const cliEnv = { HOME, PATH: `${REALDIR}:${path.dirname(process.execPath)}:/usr/bin:/bin`, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: TOKEN, VIBESPACE_SESSION_CWD: ROOT };
  const runCli = (args) => new Promise((resolve) => {
    const c = spawn(process.execPath, ['--require', PASSWD, path.join(REPO, 'data/bin/vibespace-browser'), ...args], { env: cliEnv, cwd: ROOT });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => c.kill('SIGKILL'), 30000);
    c.on('exit', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
  try {
    ok(V.OURS_PAGE.includes('login') && V.classify(['login', SITE, '--user', 'alice']).ours === true, '`login` is VibeSpace\'s own page verb (the resolve road — never handed to the browser CLI)');
    const tid = X.k.targets()[0].targetId;
    const PW = pwOf('cli');
    X.logins.addOwn({ origin: SITE, username: 'alice', password: PW });
    X.k.detectCredentialForm({ targetId: tid, kind: 'login' });
    await until(() => X.w.loginForms(PID).length === 1, 1500);
    let r = await runCli(['login']);
    ok(r.code === 1 && /\[login_not_granted\]/.test(r.err) && /the owner grants it in the Vault window/.test(r.err), '`vibespace-browser login` before a grant ⇒ exit 1, the sentence + [login_not_granted]', r);
    X.logins.grant(`web-login:${SITE}#alice`, 'this-account', 'group:tg-1');
    r = await runCli(['login']);
    ok(r.code === 0 && /^Filled the user name and the password on https:\/\/shop\.example\.test \(alice\) from the vault/.test(r.out) && !r.out.includes(PW) && !r.err.includes(PW) && X.k.filledCredentials().pop().count === 2 && traced.some((t) => t.action === 'login'), '`vibespace-browser login` (a Task Group\'s grant, the conversation\'s groups from the route) ⇒ filled, the sentence, no value anywhere in its output; the act on the trace', r);
    r = await runCli(['login', SITE, '--user', 'alice', '--submit', '--json']);
    const j = (() => { try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return null; } })();
    ok(r.code === 0 && j && j.success && eq(j.data.filled, ['username', 'password']) && j.data.submitted === true && /^vr-/.test(j.data.receipt) && !r.out.includes(PW), '`login <origin> --user alice --submit --json` ⇒ {filled, submitted, receipt} — never a value', j);
    r = await runCli(['login', SITE2]);
    ok(r.code === 1 && /\[login_phishing\]/.test(r.err), 'naming another site than the page\'s ⇒ [login_phishing]', r.err);
    r = await runCli(['login', '--new-user', 'zed']);
    ok(r.code === 2 && /--new-user <name> --generate/.test(r.err), '`--new-user` without `--generate` is refused before any call (the vault makes a new account\'s password)', r);
    r = await runCli(['login', 'a', 'b']);
    ok(r.code === 2 && /at most one site/.test(r.err), 'two sites ⇒ refused locally');
    // the owner's card route: an agent bearer is refused
    const cr = await fetch(`${API}/api/browser/logins/cards/sl-00000000/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ shown: 'x' }) });
    ok(cr.status === 403 && (await cr.json()).code === 'agent_forbidden', 'the save-login card\'s route refuses an agent\'s bearer (agent_forbidden) — saving a person\'s login is the person\'s act');
    const cn = await fetch(`${API}/api/browser/logins/cards/sl-00000000/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    ok(cn.status === 400 && (await cn.json()).code === 'shown_required', 'an answer naming no card is refused (shown_required)');
    // the Vault window's listing: facts, grants, never a password
    const lst = X.logins.list();
    const e0 = lst.entries.find((e) => e.name === `web-login:${SITE}#alice`);
    ok(lst.ok && e0 && e0.source === 'owner' && e0.grants.length === 1 && e0.grants[0].scope === 'this-account' && !JSON.stringify(lst).includes(PW), 'the Vault window\'s listing: each login with the grant rows that reach it — never a password', e0);
    ok(X.logins.ungrant(`${SITE}#alice`, 'group:tg-1').ok && X.grants.rowsFor('browser-login', `${SITE}#alice`).length === 0, '✕ on a grant chip takes it back (the row goes when nobody is left)');
    ok(X.logins.drop(`web-login:${SITE}#alice`).ok && !X.eng.secretGet(`web-login:${SITE}#alice`).value, 'delete: the entry leaves the vault');
  } finally { apiSrv.close(); await X.close(); }
}

// ═══ ⑩ RED controls ═══
console.log('⑩ RED controls — each mutant lets the bad fill through');
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
  ok(M3 && M3.fillVerdict({ forms: [p8443], entries: ENT, grantRows: rowsFrom([ROW('*', [{ kind: 'everyone' }])]), facts: ME, vaultState: 'unlocked' }).ok === true, 'RED: a copy matching by host alone offers the :443 login on a :8443 page (the real one is exact to the port)');
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ' passed' : ''})`);
process.exit(fail ? 1 : 0);
