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
//      — lane vault-login-chrome r2 (HOTFIX 2.369.364): on standard Chrome the road is refused by name (login_fill_withdrawn)
//      with a granted login in the vault: 0 vault reads (noteUse never called), 0 CDP commands (counted on the stub's socket)
//      — r2c: counted in the WINDOW the leg marks on that socket (the stub's sequence number before, its own fence after — never a
//      clock); what the watch sends on its own is NAMED (WATCH_OWN), and two REPLAYS of the slow box's one read put the passkey
//      hook's look before the window (int361's red) and inside it — the leg as it was is red on both, the window green
//      — r2d: WHO sent a call, never its name: the stub stamps the tab each call rides (on the tab the leg fills nothing is the
//      watch's own) and the after-mark is the leg's own call, found by its CDP id; the pin reads fillLogin too, however quoted
//      — r2e: the watch's own = what ARMS a tab the page opened, heard by the leg's MID mark (once the arm it waits for is done);
//      after it nothing is anyone's own — and the fence binds only a call heard after its own mark
//   ⑧b lane engine-distribution: the NO-ECHO kernel (mode.omitFilledPassword — the real kernel sends no password while the box
//      holds the vault's value): a pending register promoted · an existing login none · a typed-over value rides; a RED control
//   ⑨ THE DOORS: the REAL route + the REAL CLI; the owner's card route refuses an agent; the Vault window's rows
//   ⑩ RED controls: a fill verdict without the frame check, without the grant — each lets the bad fill through; (r2d) six watch
//      copies whose fillLogin sends on the login tab before the gate (A1 A2 B B2 B3 C) — the window counts each — and the pin's own
//      RED; (r2e) G1 a fillLogin that re-arms the tab the page opened, G7 an attach to a tab the stub never had — each counted as the
//      road's — and the fence's own RED (a stale '1' with its id, heard before its mark, never binds)
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
// cdp-protocol-under-test — 'Page.navigate' in §⑪ tests pure CDP mediation verdicts, never a live browser navigation
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

// ═══ ⑧ THE WATCH over the fake kernel + a REAL vault ═══
console.log('⑧ the dialog watch over the FAKE KERNEL + the logins module over a REAL vault');
const PID = 'bp-e0000b01', KEY = 'bk-0000b10c';
const TGT = { profileId: PID, browserKey: KEY, ephemeral: true };
async function world({ mode = {}, takeover = () => false, kernel = startFakeKernel, Dmod = D, WebSocketImpl = null } = {}) {
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
  const w = Dmod.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: k.wsUrl }), onLease: () => () => { } }, log: { warn: (l) => logs.push(String(l)), log() { } }, enableTimeoutMs: 300, holdersOf: () => [{ browserKey: KEY, sessionId: 'sess-1', ephemeral: true }], leaseCountOf: () => 1, labelOf: () => 'Work',
    logins, conversationOf: () => ({ cid: 'conv-1', name: 'Chat One' }), takeoverOf: () => takeover(), forYou: { add: () => null, resolve() { } }, ...(WebSocketImpl ? { WebSocketImpl } : {}) });
  w.onChange((e) => evs.push(e));
  await w.arm(PID, { budgetMs: 3000 });
  const audit = () => { try { return fs.readFileSync(path.join(d, VE.AUDIT_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const close = async () => { w.shutdown(); await k.close(); eng.close(); };
  return { d, eng, VPW, grants, totp, logins, fy, resolved, k, w, evs, logs, audit, close };
}
const FILL = (o = {}) => ({ facts: ME, conv: 'conv-1', actor: 'Chat One', ...o });
const fresh = (X) => X.evs.length;
// lane vault-login-chrome r2c: WHAT THE WATCH SENDS ON ITS OWN, by name (src/server/browser-dialogs.js) — a tab it arms: track
// (Target.attachToTarget) → armSurfaces (VibeSpace.enable + VibeSpace.listSurfaces on a kernel) → enable (Page.enable) →
// armPrompts (the file-chooser + sign-in hooks) → armHook (the passkey hook: a binding, two scripts, Runtime.enable, then pkFind's
// ONE look — Runtime.evaluate('CredentialsContainer.prototype') — at every document the stub had announced by then). The fill road
// (src/server/browser-login-fill.js, fillLogin in browser-dialogs.js) speaks none of these (pinned below) — and a name is never the
// proof (r2d, mineOf).
const WATCH_OWN = Object.freeze({ 'Target.attachToTarget': 'track', 'VibeSpace.enable': 'armSurfaces', 'VibeSpace.listSurfaces': 'armSurfaces', 'Page.enable': 'enable', 'Page.setInterceptFileChooserDialog': 'armPrompts', 'Fetch.enable': 'armPrompts', 'Runtime.addBinding': 'armHook', 'Page.addScriptToEvaluateOnNewDocument': 'armHook', 'Runtime.enable': 'armHook' });
const PK_LOOK = 'CredentialsContainer.prototype';
const ownOf = (c) => (c.method === 'Runtime.evaluate' ? (c.params && c.params.expression === PK_LOOK ? 'pkFind' : null) : Object.hasOwn(WATCH_OWN, c.method) ? WATCH_OWN[c.method] : null);
// r2d WHO SENT IT (review r2c F1: seven of the names matched any params on any session — a fillLogin that sent armHook's script on
// the login tab read as the watch's own): the stub stamps every call with the tab it rides. In the window the watch's own calls are
// the ones that ARM a tab the stub announced after the first mark (the attach to it, then the named calls on its session); on a tab
// that was there at the mark — the one the leg fills — nothing is anyone's own, whatever its name.
// r2e ONLY WHAT ARMS IT (review r2d G1: a fillLogin that re-ran armHook on the tab the page opened read as the watch's own; G7 an
// attach to a target id the stub never had read as track): the watch's own calls are the ones heard by the leg's MID mark — taken
// once `during` (the arm the leg waits for) returns; a mark nobody moved has mid = from — after it nothing is anyone's own.
const markOf = (X) => { const from = X.k.mark(); return { from, mid: from, tabs: new Set(X.k.targets().map((t) => t.targetId)) }; };
const mineOf = (m) => (c) => (c.tab && !m.tabs.has(c.tab) && c.seq <= m.mid ? ownOf(c) : null);
// the fill road's CDP vocabulary as the product text says it — a Domain.method token however it is quoted (r2d: '…' "…" `…`, any
// capitalised domain — a list leaves one out); fillLogin = the door's body in browser-dialogs.js (the gate, the dispatch) to its brace
const CDP_TOKEN = /(['"`])([A-Z][A-Za-z]*\.[a-z][A-Za-z]*)\1/g;
const vocabOf = (t) => [...new Set([...t.matchAll(CDP_TOKEN)].map((q) => q[2]))];
const fillLoginOf = (t) => { const i = t.indexOf('  async function fillLogin('), j = i < 0 ? -1 : t.indexOf('\n  }\n', i); return j < 0 ? '' : t.slice(i, j); };
/** The pin (r2c, widened r2d): every product text that sends on the login tab — browser-login-fill.js and fillLogin — says none of
 *  the watch's names in any quoting and never pkFind's look, and every call site names its method (a literal; the door's pass-through
 *  `m` carries the fill module's own literals) — a method built at run time is seen too. → what each text's call sites send. */
function pinOf(lf, door) {
  const lit = (a) => /^(['"`])[A-Za-z]+\.[A-Za-z]+\1$/.test(a), sent = (xs) => [...new Set(xs.filter(lit).map((a) => a.slice(1, -1)))].sort();
  const sites = [...lf.matchAll(/(?<![.\w])send\(\s*([^,)]+)/g)].map((q) => q[1].trim()), doorSites = [...door.matchAll(/(?<![.\w])call\(w,\s*([^,)]+)/g)].map((q) => q[1].trim());
  const hides = vocabOf(lf + '\n' + door).filter((m) => Object.hasOwn(WATCH_OWN, m));
  const ok = door.includes('roadVerdict') && hides.length === 0 && !lf.includes(PK_LOOK) && !door.includes(PK_LOOK) && sites.length > 0 && sites.every(lit) && doorSites.length > 0 && doorSites.every((a) => lit(a) || a === 'm');
  return { ok, sends: sent(sites), doorSends: sent(doorSites), hides, sites, doorSites };
}
// THE SLOW BOX'S READ, replayed (int361's red: 1 leg of 161 inside the 3-wide fast tier at load ~6, 0/5 alone): the watch reads
// Runtime.enable's answer and the frame after it — the stub's executionContextCreated, 1 ms later — in ONE socket read; ws emits
// both in one tick (allowSynchronousEvents), so armHook's `await Runtime.enable` resumes with the document already known and pkFind
// looks at it. Measured: 0/30 worlds as they come, 5/5 through this seam.
class OneRead extends require('ws') {
  constructor(...a) {
    super(...a);
    const emit = this.emit.bind(this); let held = null; this._enables = new Set();
    this.emit = (ev, ...x) => {
      if (ev !== 'message') return emit(ev, ...x);
      if (held) { const h = held; held = null; emit('message', ...h); return emit('message', ...x); }
      let m = null; try { m = JSON.parse(String(x[0])); } catch { /* not ours */ }
      if (m && this._enables.has(m.id)) { held = x; return true; }
      return emit('message', ...x);
    };
  }
  send(d, ...r) { try { const m = JSON.parse(String(d)); if (m.method === 'Runtime.enable') this._enables.add(m.id); } catch { /* */ } return super.send(d, ...r); }
}
// THE AFTER-MARK: the leg's OWN fence on the watch's socket — ONE bounded Runtime.evaluate '1' on the filled tab (pageAnswers), found
// on the stub by the CDP id the watch gave it, never by its look (r2d, review r2c F2: the first '1' after a mark was anyone's — a
// road '1' still in flight closed the window and the road's calls after it escaped). One socket, in order: every command the watch
// sent before the fence is heard before it — its sequence number closes the window (NaN = not found or not answered: red). Only a
// call heard after the fence's own mark binds (r2e, review r2d n1: ids restart at 0 when the watch reconnects — a stale '1' with
// the same id would close an empty window)
async function fence(X) {
  const before = X.k.mark(), tab = X.k.targets()[0].targetId, W = X.w._watches.get(PID), id = W ? W.id + 1 : NaN; // pageAnswers sends at once: the next id is its
  const a = await X.w.pageAnswers(TGT, { targets: [tab] });
  const f = X.k.calls().find((c) => c.seq > before && c.id === id && c.tab === tab && c.method === 'Runtime.evaluate' && c.params.expression === '1');
  return a.asked && a.pages.length === 1 && a.pages[0].answered === true && f ? f.seq : NaN;
}
const REFUSED_MODE = Object.freeze({ features: ['surfaces'] }); // kernel-no-credentials (and no webauthn, so armHook + pkFind still run): refused at roadVerdict
const roadRefused = (r) => !r.ok && r.code === 'login_no_form' && r.road === 'kernel-no-credentials' && r.error === BL.roadVerdict(REFUSED_MODE).error;
const roadCall = (c) => /^Input\./.test(c.method) || c.method === 'Runtime.evaluate';
/** The window between the leg's two marks: the watch's own calls in it (mineOf — WHO, then the name), the rest = the fill road's. */
function inWindow(X, m, to) {
  const win = X.k.calls().filter((c) => c.seq > m.from && c.seq < to), mine = mineOf(m);
  return { win, own: win.filter(mine).map((c) => `${mine(c)}:${c.method}#${c.seq}`), road: win.filter((c) => !mine(c)).map((c) => `${c.method}#${c.seq}`) };
}
const noRoad = (x) => Number.isFinite(x.to) && x.road.length === 0; // the leg's verdict: its fence found, nothing in the window the road's
/** REPLAY ②'s `during`: the page opens a tab while the login is refused; the leg waits for the watch's arm of it — its last call, pkFind's look (`at.pop` = the tab). */
const popUp = (X, at) => (from) => { at.pop = X.k.addTarget(SITE + '/popup'); return until(() => X.k.calls().some((c) => c.seq > from && c.tab === at.pop && ownOf(c) === 'pkFind'), 3000); };
/** The four refused fills between the leg's two marks (`during(from)` runs inside the window first, the MID mark after it): the window — and `was`, the leg
 *  as it stood until r2c (`sent` from the length before, the whole socket's Input.* / Runtime.evaluate), read where it read them:
 *  right after the fills. */
async function refusedFills(X, during = null) {
  const m = markOf(X), from = m.from;
  if (during) { await during(from); m.mid = X.k.mark(); }
  const rs = [];
  for (const o of [{}, { origin: SITE, user: 'alice', submit: true }, { newUser: 'bob', generate: true, submit: true }, { generate: true }]) rs.push(await X.w.fillLogin(TGT, FILL(o)));
  const sent = X.k.calls().slice(from).map((c) => c.method), whole = X.k.calls().filter(roadCall);
  const was = { ok: sent.length === 0 && whole.length === 0, sent, whole: whole.map((c) => `${c.method}#${c.seq}${c.params.expression ? `(${String(c.params.expression).slice(0, 40)})` : ''}`) };
  const to = await fence(X);
  return { rs, from, mid: m.mid, to, ...inWindow(X, m, to), was };
}
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
  // Refused capability road (kernel-no-credentials, with passkey hook active): 0 vault reads, 0 road CDP commands in the marked window
  const S0 = await world({ mode: REFUSED_MODE });
  try {
    ok(S0.logins.addOwn({ origin: SITE, username: 'Alice', password: pwOf('std') }).ok && S0.logins.grant(`web-login:${SITE}#alice`, 'this-account', 'session:conv-1').ok, 'refused capability road: the owner keeps a login of the site and grants it to this conversation');
    const reads = { secretGet: 0, secretNames: 0, noteUse: 0 };
    for (const m of Object.keys(reads)) { const f = S0.eng[m].bind(S0.eng); S0.eng[m] = (...a) => { reads[m]++; return f(...a); }; }
    const x = await refusedFills(S0), rs = x.rs;
    ok(rs.every(roadRefused), 'roadVerdict refusal ⇒ login_no_form by name — login · --submit · --new-user --generate · --generate alike', rs);
    ok(reads.secretGet === 0 && reads.secretNames === 0 && reads.noteUse === 0 && S0.audit().filter((l) => /^vault-(totp-)?use$/.test(l.event)).length === 0, '… 0 vault reads: secretGet / secretNames never called, the use-writer noteUse never called, no use line', reads);
    ok(noRoad(x), '… 0 CDP commands for it: in the window between the leg\'s two marks on the stub\'s socket nothing rides the login tab — 0 Input.*, 0 Runtime.evaluate, no name the watch also speaks', { from: x.from, to: x.to, own: x.own, road: x.road });
    ok(BL.loginText(rs[0]) === rs[0].error, '… the agent\'s sentence is the refusal\'s own words');
  } finally { await S0.close(); }
  // Standard Chrome (re-opened in r3): assert the FOUR r3 rules inside the marked window on the stub's socket
  const S = await world({ mode: { standard: true } });
  try {
    const PWS = pwOf('std-r3');
    ok(S.logins.addOwn({ origin: SITE, username: 'Alice', password: PWS }).ok && S.logins.grant(`web-login:${SITE}#alice`, 'this-account', 'session:conv-1').ok && S.logins.grant(`web-login:${SITE}#x`, 'any-account', 'session:conv-1').ok, 'standard Chrome (r3): login and any-account registration granted on the site');
    // Rule 1: browser-truth origin + isolated world; disagreement refuses login_phishing with 0 Input.insertText
    S.k.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE2, fields: [{ fieldId: 'vs-f-0', tag: 'input', type: 'password', autocomplete: 'current-password', visible: true }] });
    const mp = markOf(S), rp = await S.w.fillLogin(TGT, FILL()), top = await fence(S), wp = inWindow(S, mp, top);
    ok(!rp.ok && rp.code === 'login_phishing' && !wp.win.some((c) => c.method === 'Input.insertText') && wp.win.filter((c) => c.method === 'Runtime.evaluate').every((c) => Number.isInteger(c.params.contextId)),
      'r3 Rule 1 (origin gate): page claiming another origin vs browser truth ⇒ login_phishing, 0 Input.insertText, every Runtime.evaluate in isolated world', { rp, road: wp.road });
    // Rule 2: zero secret in Runtime.evaluate (Input.insertText ONLY) + fail-closed on insert error / cleared field
    S.k.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE, clearOnInput: true, fields: [{ fieldId: 'vs-f-0', tag: 'input', type: 'email', autocomplete: 'username', visible: true }, { fieldId: 'vs-f-1', tag: 'input', type: 'password', autocomplete: 'current-password', visible: true }] });
    const mc = markOf(S), rc = await S.w.fillLogin(TGT, FILL()), toc = await fence(S), wc = inWindow(S, mc, toc);
    ok(!rc.ok && rc.code === 'login_failed' && !JSON.stringify(wc.win).includes(PWS) && (S.k.standardPage().wiped || 0) >= 1,
      'r3 Rule 2a (fail-closed): cleared field after Input.insertText ⇒ login_failed, touched fields wiped, 0 secret bytes in any CDP expression', { rc, wiped: S.k.standardPage().wiped });
    S.k.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE, hasForm: false, buttons: [
      { btnId: 'vs-b-0', inForm: false, depth: 0, after: true, visible: true, tag: 'button', type: 'button', text: 'Show password' },
      { btnId: 'vs-b-1', inForm: false, depth: 0, after: true, visible: true, tag: 'button', type: 'button', text: 'Back' },
      { btnId: 'vs-b-2', inForm: false, depth: 0, after: true, visible: true, tag: 'div', role: 'button', text: 'Sign in' },
    ], fields: [{ fieldId: 'vs-f-0', tag: 'input', type: 'email', autocomplete: 'username', visible: true }, { fieldId: 'vs-f-1', tag: 'input', type: 'password', autocomplete: 'current-password', visible: true }] });
    const mf = markOf(S), rf = await S.w.fillLogin(TGT, FILL({ submit: true })), tof = await fence(S), wf = inWindow(S, mf, tof);
    const isoIds = new Set(S.k.isoWorlds().map(([id]) => id));
    ok(rf.ok && eq(rf.filled, ['username', 'password']) && rf.submitted === true && !JSON.stringify(rf).includes(PWS) && !JSON.stringify(wf.win).includes(PWS) && wf.win.some((c) => c.method === 'Input.insertText') && wf.win.filter((c) => c.method === 'Runtime.evaluate').every((c) => isoIds.has(c.params.contextId)),
      'r3 Rule 2b (Input.insertText only + isolated world): filled on standard Chrome with 0 secret bytes in Runtime.evaluate and every eval in Page.createIsolatedWorld', { rf, road: wf.road });
    // Rule 3: no .value getter mask; live-fill read fence active before navigation and cleared on navigation; value-based scrubbing
    ok(!JSON.stringify(wf.win).includes('defineProperty') && S.w.liveFillVerdictFor(TGT, { verb: 'eval' }).code === 'login_fill_live' && S.w.liveFillVerdictFor(TGT, { verb: 'click' }).ok === true && S.w.scrubText(PID, `leak:${PWS}`) === `leak:[vault:web-login:${SITE}#alice]`,
      'r3 Rule 3 (no getter mask + live_fill fence + value scrub): 0 defineProperty masks, eval fenced with login_fill_live while click allowed, value scrubbed to [vault:<id>]');
    // Rule 4: form-less submit picked Sign in (skipping Show password & Back), and signup stays pending until proven navigation
    ok(S.k.standardPage().clickedBtn === 'vs-b-2', 'r3 Rule 4a (submit classifier): form-less --submit clicked Sign in (vs-b-2), skipping Show password and Back', S.k.standardPage());
    S.k.navigate(S.k.targets()[0].targetId, SITE + '/signup');
    await until(() => S.w.liveFillVerdictFor(TGT, { verb: 'eval' }).ok === true, 1500);
    S.k.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE, fields: [{ fieldId: 'vs-f-0', tag: 'input', type: 'email', autocomplete: 'username', visible: true }, { fieldId: 'vs-f-1', tag: 'input', type: 'password', autocomplete: 'new-password', visible: true }] });
    const rs = await S.w.fillLogin(TGT, FILL({ newUser: 'newstd@example.test', generate: true, submit: true }));
    await sleep(90);
    const pendRec = BL.recordOf(S.eng.secretGet(`web-login:${SITE}#newstd@example.test`).value.toString('utf8'));
    ok(rs.ok && pendRec && pendRec.pending === 'register', 'r3 Rule 4b (no 60 ms timer): signup without navigation/2xx stays pending after 90 ms', pendRec && { pending: pendRec.pending });
    S.k.navigate(S.k.targets()[0].targetId, SITE + '/welcome');
    await until(() => { const r0 = BL.recordOf(S.eng.secretGet(`web-login:${SITE}#newstd@example.test`).value.toString('utf8')); return r0 && !r0.pending; }, 1500);
    const confRec = BL.recordOf(S.eng.secretGet(`web-login:${SITE}#newstd@example.test`).value.toString('utf8'));
    ok(confRec && !confRec.pending && confRec.submittedAt > 0, 'r3 Rule 4c (proven outcome): navigation away to /welcome promotes the pending signup entry', confRec && { submittedAt: confRec.submittedAt });
  } finally { await S.close(); }
  // r2c REPLAY ① — the recorded red, by the slow box's ONE read: the passkey hook's look lands while the watch ARMS, before the first mark
  const S1 = await world({ mode: REFUSED_MODE, WebSocketImpl: OneRead });
  try {
    const x = await refusedFills(S1);
    const pre = S1.k.calls().filter((c) => c.seq <= x.from && roadCall(c));
    ok(!x.was.ok && x.was.sent.length === 0 && x.was.whole.length === 1 && pre.length === 1 && ownOf(pre[0]) === 'pkFind', 'REPLAY ① the recorded shape: pkFind\'s ONE Runtime.evaluate(CredentialsContainer.prototype) while the watch arms, before the first mark — `sent` [] and the whole-socket count 1: the leg as it was is RED on it', x.was);
    ok(x.rs.every(roadRefused) && noRoad(x), '… the marked window is GREEN on it (the look is outside the window; the fills refused by name)', { own: x.own, road: x.road });
  } finally { await S1.close(); }
  // r2c REPLAY ② — the same look INSIDE the window: a tab the page opens while the login is refused, armed by the watch through the one read
  const S2 = await world({ mode: REFUSED_MODE, WebSocketImpl: OneRead });
  try {
    const at = {}, x = await refusedFills(S2, popUp(S2, at)), pop = at.pop;
    ok(!x.was.ok && x.was.sent.includes('Runtime.evaluate') && x.own.some((o) => o.startsWith('pkFind:')), 'REPLAY ② the same look INSIDE the window (a tab the page opens is armed while the login is refused): the leg as it was is RED on it', x.was);
    ok(x.rs.every(roadRefused) && noRoad(x) && x.own.length >= 2 && x.win.every((c) => c.tab === pop), '… the window names it — track · enable · armPrompts · armHook + pkFind, the watch\'s own, every one on the tab the page opened (r2d) and heard by the mid mark (r2e) — and the fill road still sent nothing', { own: x.own, road: x.road });
  } finally { await S2.close(); }
  {
    // r2c: the names can never hide the fill road — r2d: a second layer (the tab decides, mineOf) over EVERY product text that sends
    // on the login tab: browser-login-fill.js and fillLogin in browser-dialogs.js, a method however quoted; the pin's RED controls in ⑩
    const p = pinOf(fs.readFileSync(path.join(REPO, 'src/server/browser-login-fill.js'), 'utf8'), fillLoginOf(fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8')));
    ok(p.ok && eq(p.sends, ['Input.dispatchKeyEvent', 'Input.insertText', 'Page.createIsolatedWorld', 'Page.getFrameTree', 'Runtime.evaluate', 'Target.getTargetInfo']) && eq(p.doorSends, ['VibeSpace.fillCredential']), `… the names never hide the road: browser-login-fill.js sends ${p.sends.join(' · ')}, fillLogin ${p.doorSends.join(' · ')} (+ the fill module's, passed through) — no name of the watch's in either text however quoted, never pkFind's look, every call site names its method`, p);
    ok([{ method: 'Input.insertText', params: { text: 'x' } }, { method: 'Runtime.evaluate', params: { expression: '(() => document.forms.length)()' } }].every((c) => ownOf(c) === null) && ownOf({ method: 'constructor', params: {} }) === null, 'RED control: a road call (Input.insertText, a Runtime.evaluate the watch does not name) is nobody\'s own — it counts');
  }
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

{
  // lane vault-agent-own (the owner 2026-10-26: 「它自己存的使用为啥还要我的允许？」): A LOGIN THE AGENT HOLDS ITSELF (`vibespace-vault
  // login add`) — sealed agent-typed with its owner (the storing conversation); THAT conversation's fill needs NO grant (its own
  // paired two-step seed too), another conversation's is login_not_granted; no answer holds the password; an agent never
  // writes over a kept login
  const X = await world();
  try {
    const tid = X.k.targets()[0].targetId;
    const PWA = pwOf('agent'), seed = T.base32Encode(crypto.randomBytes(20));
    const ts = X.totp.agentAdd({ seed, name: 'shop-own' }, { owner: 'conv-1', actor: 'Chat One' });
    const a = X.logins.addAgent({ origin: SITE, username: 'Ann', password: PWA, totpName: 'shop-own' }, { owner: 'conv-1', actor: 'Chat One' });
    ok(ts.ok && a.ok && a.name === `web-login:${SITE}#ann` && !JSON.stringify([a, ts]).includes(PWA) && !JSON.stringify(ts).includes(seed), 'the agent stores a login it holds (and its own two-step seed): each answer names the entry — never the password, never the seed', [a, ts]);
    const nm = X.logins.names().find((x) => x.name === a.name);
    const row = VI.secretRowOf(X.eng.secretNames().find((s) => s.name === a.name));
    ok(nm && nm.source === 'agent-typed' && nm.owner === 'conv-1' && row && row.provenance && row.provenance.prov === 'agent-typed' && row.provenance.owner === 'conv-1' && VI.provenanceOf(VI.rowOf('secrets', row)) === 'agent-put', 'provenance agent-typed (the chip of a password the agent typed into a page itself), its owner the storing conversation', { nm, prov: row && row.provenance });
    X.k.detectCredentialForm({ targetId: tid, kind: 'login', otp: true });
    await until(() => X.w.loginForms(PID).length === 1, 1500);
    const other = await X.w.fillLogin(TGT, FILL({ conv: 'conv-2', owners: ['conv-2', 'sess-2'] }));
    ok(!other.ok && other.code === 'login_not_granted' && X.k.filledCredentials().length === 0, 'ANOTHER conversation ⇒ login_not_granted (the owner grants it like any login) — nothing filled', other.code);
    const mine = await X.w.fillLogin(TGT, FILL({ owners: ['conv-1', 'sess-1'] }));
    const fc = X.k.filledCredentials().pop();
    const tu = X.audit().filter((l) => l.event === 'vault-totp-use' && l.ok);
    ok(mine.ok && eq(mine.filled, ['username', 'password', 'otp']) && fc && fc.count === 3 && !JSON.stringify(mine).includes(PWA) && tu.length === 1 && X.grants.rowsFor('browser-login', `${SITE}#ann`).length === 0 && X.grants.rowsFor('browser-login', '*').length === 0,
      'ITS conversation ⇒ FILLED with NO grant row anywhere — the user name, the password and its own two-step code (the kernel fills; the agent sees none of them)', { mine, count: fc && fc.count });
    ok(X.logins.addAgent({ origin: SITE, username: 'ann', password: pwOf('x') }, { owner: 'conv-1' }).code === 'login_exists' && X.logins.addAgent({ origin: 'http://shop.example.test', username: 'b', password: pwOf('y') }, { owner: 'conv-1' }).code === 'login_bad_origin' && X.logins.addAgent({ origin: SITE, username: 'c', password: pwOf('z') }, {}).code === 'unauthorized',
      'an agent never writes over a kept login (login_exists); https only; no owner ⇒ unauthorized');
    // THE REVIEW (HIGH): its own fill needs no grant — so the login may pair ONLY a two-step entry this conversation added itself
    const ownerSeed = X.totp.addEntry({ seed: T.base32Encode(crypto.randomBytes(20)), name: 'owners-code' }, { who: 'test' });
    const otherSeed = X.totp.agentAdd({ seed: T.base32Encode(crypto.randomBytes(20)), name: 'other-code' }, { owner: 'conv-2', actor: 'Chat Two' });
    const pairOwner = X.logins.addAgent({ origin: SITE, username: 'dee', password: pwOf('d'), totpName: 'owners-code' }, { owner: 'conv-1' });
    const pairOther = X.logins.addAgent({ origin: SITE, username: 'eve', password: pwOf('e'), totpName: 'other-code' }, { owner: 'conv-1' });
    const pairNone = X.logins.addAgent({ origin: SITE, username: 'fay', password: pwOf('f'), totpName: 'no-such-code' }, { owner: 'conv-1' });
    ok(ownerSeed.ok && otherSeed.ok && pairOwner.code === 'bad_totp' && pairOther.code === 'bad_totp' && pairNone.code === 'bad_totp' && /added itself/.test(pairOwner.error || ''),
      'login add --totp names only a two-step entry THIS conversation added: the owner\'s seed, another conversation\'s, a missing one ⇒ bad_totp (nothing stored)', [pairOwner.code, pairOther.code, pairNone.code]);
    // a record that pairs a seed it does not own (sealed straight in — an older entry, a forged box): its own fill fills NO code
    const forged = BL.newRecord({ origin: SITE, username: 'gus', password: pwOf('g'), totpName: 'owners-code', source: 'agent-typed', now: 1, conversation: 'Chat One' });
    X.eng.secretPut(`web-login:${SITE}#gus`, BL.textOf(forged), { kind: 'agent-typed', actor: 'Chat One', owner: 'conv-1' });
    const before = X.audit().filter((l) => l.event === 'vault-totp-use' && l.ok).length;
    const gus = await X.w.fillLogin(TGT, FILL({ user: 'gus', owners: ['conv-1', 'sess-1'] }));
    const after = X.audit().filter((l) => l.event === 'vault-totp-use' && l.ok).length;
    ok(gus.ok && gus.otpMissing === true && eq(gus.filled, ['username', 'password']) && after === before && X.audit().some((l) => l.event === 'vault-totp-use' && !l.ok && l.code === 'not_granted' && l.entry === 'totp:owners-code'),
      'an OWN fill whose record pairs a seed the caller does not own: the user name and password, NO code (refused not_granted, audited) — the D3 cover is for a GRANTED login', { gus, before, after });
    // RED: the same fill through a copy whose codeForLogin forgets the owners check fills the owner's code into the page
    const VTS = fs.readFileSync(path.join(REPO, 'src/server/vault-totp.js'), 'utf8');
    const noOwners = VTS.replace("if (Array.isArray(owners)) { const ow = ownerOf(entry); if (!ow || !owners.includes(ow)) return done(named('not_granted')); }", '');
    const VTm = noOwners !== VTS ? MUT.load('src/server/vault-totp.js', noOwners, 'noowners') : null;
    const totpM = VTm && VTm.create({ dataDir: X.d, vault: X.eng, log: () => { } });
    const loginsM = totpM && L.create({ vault: X.eng, grants: () => X.grants, totpCode: (n, o) => totpM.codeForLogin(n, o) });
    const formO = BL.formOf({ surfaceId: 'surf-otp-1', targetId: 'T1', pageOrigin: SITE, frameOrigin: SITE, kind: 'login', fields: [{ fieldId: 'f-o-1', type: 'username' }, { fieldId: 'f-o-2', type: 'password' }, { fieldId: 'f-o-3', type: 'otp' }], hasSubmit: true }, { now: 1 });
    const planM = loginsM && loginsM.planFill({ forms: [formO], origin: SITE, user: 'gus', facts: ME, conv: 'conv-1', actor: 'Chat One', owners: ['conv-1'] });
    const planR = X.logins.planFill({ forms: [formO], origin: SITE, user: 'gus', facts: ME, conv: 'conv-1', actor: 'Chat One', owners: ['conv-1'] });
    ok(planM && planM.ok && eq(planM.filled, ['username', 'password', 'otp']) && planR.ok && planR.otpMissing === true && !planR.filled.includes('otp'), 'RED: a copy without the owners check fills the owner\'s two-step code on the agent\'s own road (the real one: no code)', { mutant: planM && planM.filled, real: planR.filled });
  } finally { await X.close(); }
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
{
  const DSRC = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  const noGate = DSRC.replace('    if (!road.ok) return road;\n', '    if (false) return road;\n');
  const MD = noGate !== DSRC ? MUT.load('src/server/browser-dialogs.js', noGate, 'nogate') : null;
  // no login in this vault — the copy can only READ the tab, never type
  const S = MD ? await world({ mode: REFUSED_MODE, Dmod: MD }) : null;
  try {
    const m = S ? markOf(S) : null; // lane vault-login-chrome r2c: the same marked window the leg reads — a real leak is the road's, never a name's
    const r = S ? await S.w.fillLogin(TGT, FILL()) : null;
    const to = S ? await fence(S) : NaN;
    const road = S ? inWindow(S, m, to).road : [];
    ok(MD && r && road.some((c) => c.startsWith('Runtime.evaluate#')), 'RED: a watch copy without the road gate sends Runtime.evaluate to a refused-road tab — the marked window counts it as the road\'s (the real watch sends nothing)', { code: r && r.code, road });
  } finally { if (S) await S.close(); }
  // lane vault-login-chrome r2d (review r2c F1 + F2): watch copies whose fillLogin sends on the login tab BEFORE the gate and still
  // refuses by name (0 vault reads) — the window counts every one as the road's: a name the watch also speaks hides nothing on the
  // login tab (B / B3 armHook's script, B2 pkFind's own look, C track's attach — a browser-level call rides the tab it names), and a
  // '1' the road sent (A2, the fence's own expression) is no fence
  const GATE = '    const road = BL().roadVerdict(w.kernel);';
  const onTabs = (body) => `    if (!loginSinks(w)) for (const e of w.targets.values()) if (e.sid) { ${body} }\n`;
  const read = "call(w, 'Runtime.evaluate', { expression: 'document.forms.length', returnByValue: true }, e.sid);", script = "call(w, 'Page.addScriptToEvaluateOnNewDocument', { source: 'void 0' }, e.sid);";
  for (const [name, what, body, method, n] of [
    ['A1', 'a form read (not awaited)', read, 'Runtime.evaluate', 4],
    ['A2', "a '1' — the fence's own expression — then a form read (neither awaited)", "call(w, 'Runtime.evaluate', { expression: '1', returnByValue: true }, e.sid); " + read, 'Runtime.evaluate', 8],
    ['B', "armHook's method Page.addScriptToEvaluateOnNewDocument (awaited)", 'await ' + script, 'Page.addScriptToEvaluateOnNewDocument', 4],
    ['B2', "pkFind's exact look (awaited)", `await call(w, 'Runtime.evaluate', { expression: '${PK_LOOK}' }, e.sid);`, 'Runtime.evaluate', 4],
    ['B3', "armHook's method (not awaited)", script, 'Page.addScriptToEvaluateOnNewDocument', 4],
    ['C', "track's method at the browser level — Target.attachToTarget, a second session on it (awaited)", "await call(w, 'Target.attachToTarget', { targetId: e.targetId, flatten: true });", 'Target.attachToTarget', 4],
  ]) {
    const src = DSRC.includes(GATE) ? DSRC.replace(GATE, onTabs(body) + GATE) : DSRC;
    const MX = src !== DSRC ? MUT.load('src/server/browser-dialogs.js', src, 'r2d-' + name.toLowerCase()) : null;
    const X = MX ? await world({ mode: REFUSED_MODE, Dmod: MX }) : null;
    try {
      const x = X ? await refusedFills(X) : null;
      ok(x && x.rs.every(roadRefused) && !noRoad(x) && x.road.length === n && x.road.every((c) => c.startsWith(method + '#')), `RED control ${name}: a watch copy whose fillLogin sends ${what} on the login tab before the gate (still refused by name) — the window counts all ${n} as the road's`, x && { to: x.to, own: x.own, road: x.road });
    } finally { if (X) await X.close(); }
  }
  // r2e (review r2d G1): a watch name is the watch's own only while it ARMS — a copy whose fillLogin re-arms the tab the page opened
  // (G1, in REPLAY ②'s world) or attaches to a target id the stub never had (G7, in the leg's) still refuses by name: every call it
  // sends rides a tab the mark did not know and speaks a watch name — after the mid mark the window counts each as the road's
  for (const [name, what, ins, popped, n] of [
    ['G1', 're-runs armHook on every tab but the first — the tab the page opened while the login is refused: its arm and pkFind\'s look, once per fill —', '    if (!loginSinks(w)) { const es = [...w.targets.values()].filter((e) => e.sid); for (const e of es.slice(1)) await armHook(w, e, e.sid); }\n', true, 20],
    ['G7', "sends track's attach to a target id the stub never had (awaited)", "    if (!loginSinks(w)) await call(w, 'Target.attachToTarget', { targetId: 'T' + 'NOPE' + String(w.id), flatten: true });\n", false, 4],
  ]) {
    const MX = DSRC.includes(GATE) ? MUT.load('src/server/browser-dialogs.js', DSRC.replace(GATE, ins + GATE), 'r2e-' + name.toLowerCase()) : null;
    const X = MX ? await world({ mode: REFUSED_MODE, Dmod: MX, WebSocketImpl: popped ? OneRead : null }) : null;
    try {
      const at = {}, x = X ? await refusedFills(X, popped ? popUp(X, at) : null) : null, had = X ? new Set(X.k.targets().map((t) => t.targetId)) : null;
      const after = x ? x.win.filter((c) => c.seq > x.mid) : [];
      ok(x && x.rs.every(roadRefused) && !noRoad(x) && x.road.length === n && after.length === n && after.every((c) => ownOf(c) && (popped ? c.tab === at.pop : c.tab && !had.has(c.tab))), `RED control ${name}: a watch copy whose fillLogin ${what} before the gate (still refused by name) — all ${n} speak a watch name on a tab the mark did not know, after the mid mark: the window counts each as the road's`, x && { mid: x.mid, to: x.to, own: x.own, road: x.road });
    } finally { if (X) await X.close(); }
  }
  // r2e (review r2d n1): the fence's own RED — a '1' with the fence's CDP id on the login tab heard BEFORE the fence's mark (a
  // reconnect restarts ids at 0) never binds: answered, nothing new heard ⇒ NaN, the leg red
  {
    const tab = 'T' + 'STALE', stale = { seq: 3, id: 8, tab, method: 'Runtime.evaluate', params: { expression: '1' } };
    const F = { k: { targets: () => [{ targetId: tab }], mark: () => 3, calls: () => [stale] }, w: { _watches: new Map([[PID, { id: 7 }]]), pageAnswers: async () => ({ asked: true, pages: [{ answered: true }] }) } };
    ok(Number.isNaN(await fence(F)), 'RED control (the fence): a stale \'1\' with the fence\'s CDP id on the login tab, heard before the fence\'s own mark, never binds — NaN, the leg red', { stale });
  }
  // the pin's own RED controls: a fillLogin that says armHook's method double-quoted, or builds it at run time, is seen
  const LFS = fs.readFileSync(path.join(REPO, 'src/server/browser-login-fill.js'), 'utf8');
  const named = pinOf(LFS, fillLoginOf(DSRC.replace(GATE, onTabs('call(w, "Page.addScriptToEvaluateOnNewDocument", { source: `void 0` }, e.sid);') + GATE)));
  const built = pinOf(LFS, fillLoginOf(DSRC.replace(GATE, onTabs("const k = ['Page', 'addScriptToEvaluateOnNewDocument'].join('.'); call(w, k, {}, e.sid);") + GATE)));
  ok(pinOf(LFS, fillLoginOf(DSRC)).ok && !named.ok && eq(named.hides, ['Page.addScriptToEvaluateOnNewDocument']) && !built.ok && built.hides.length === 0 && built.doorSites.includes('k') && eq(vocabOf('a("Input.dispatchKeyEvent") b(`DOMStorage.clear`)'), ['Input.dispatchKeyEvent', 'DOMStorage.clear']),
    'RED control (the pin): a fillLogin that says the watch\'s method in double quotes, or builds a method at run time, is red — a double-quoted or template token of any domain is seen', { named: named.hides, built: built.doorSites });
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

// ═══ ⑫ Standard-Chrome r4 adversarial fixup gates (RED by name on 956e39701 for 1/2/3/7/8/9) ═══
console.log('⑫ Standard-Chrome r4 adversarial fixup gates (MAJOR 1/2/3 + MINOR 6/7/8/9/10)');
{
  const vm = require('node:vm');
  const CENSUS = require('../src/cdp-census.js');
  const Med = require('../src/browser-mediation.js');
  const LF = require('../src/server/browser-login-fill.js');
  const BP = require('../src/browser-profiles.js');

  function makeStubDom(initialInputs = [], { iframes = [], onInsertText = null } = {}) {
    class StubInput {
      constructor(spec = {}) {
        this.nodeType = 1;
        this.tagName = String(spec.tag || 'INPUT').toUpperCase();
        this.attrs = { ...(spec.attrs || {}) };
        if (spec.type) this.attrs.type = String(spec.type);
        if (spec.name) this.attrs.name = String(spec.name);
        if (spec.autocomplete) this.attrs.autocomplete = String(spec.autocomplete);
        if (spec.placeholder) this.attrs.placeholder = String(spec.placeholder);
        this.type = String(spec.type || this.attrs.type || 'text');
        this.id = String(spec.id || '');
        this.val = String(spec.value || '');
        this.hidden = !!spec.hidden;
        this.disabled = !!spec.disabled;
        this.readOnly = !!spec.readOnly;
        this.required = !!spec.required;
        this.minLength = spec.minLength ?? -1;
        this.maxLength = spec.maxLength ?? -1;
        this.isConnected = true;
        this.parentElement = null;
        this.form = null;
        this.labels = [];
      }
      getAttribute(k) { const v = this.attrs[String(k).toLowerCase()]; return v === undefined ? null : String(v); }
      setAttribute(k, v) { const key = String(k).toLowerCase(); this.attrs[key] = String(v); if (key === 'type') this.type = String(v); }
      removeAttribute(k) { delete this.attrs[String(k).toLowerCase()]; }
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, String(k).toLowerCase()); }
      closest() { return null; }
      getBoundingClientRect() { return this.hidden ? { width: 0, height: 0 } : { width: 140, height: 30 }; }
      scrollIntoView() {}
      focus() { doc.activeElement = this; }
      blur() { if (doc.activeElement === this) doc.activeElement = null; }
      dispatchEvent() { return true; }
    }
    Object.defineProperty(StubInput.prototype, 'value', {
      get() { return this.val; },
      set(v) { this.val = String(v ?? ''); },
      configurable: true,
    });
    class StubTextArea extends StubInput {}
    const inputs = initialInputs.map((s) => new StubInput(s));
    const frameEls = iframes.map((s) => {
      const f = new StubInput({ tag: 'IFRAME', ...s });
      f.inert = !!s.inert;
      return f;
    });
    const doc = {
      activeElement: null,
      documentElement: { nodeType: 1 },
      getElementById: (id) => inputs.find((x) => x.id === id) || null,
      querySelectorAll: (sel) => {
        const s = String(sel || '');
        if (s.includes('iframe')) return frameEls.slice();
        if (s.startsWith('[') && s.endsWith(']')) {
          const attr = s.slice(1, -1).toLowerCase();
          return inputs.filter((x) => x.hasAttribute(attr));
        }
        return inputs.slice();
      },
    };
    const win = {
      document: doc,
      location: { origin: SITE, href: `${SITE}/login` },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      HTMLInputElement: StubInput,
      HTMLTextAreaElement: StubTextArea,
      Event: class Event { constructor(type, opts) { this.type = type; this.bubbles = !!(opts && opts.bubbles); } },
      Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
      WeakMap,
      Set,
      Array,
      Object,
      Number,
      String,
      Boolean,
      Math,
      JSON,
      crypto,
    };
    win.window = win;
    // Note: each Page.createIsolatedWorld on the SAME frame in Chrome shares the world for the same worldName!
    const worlds = new Map();
    const getWorld = (name = 'vs-login-fill') => {
      if (!worlds.has(name)) {
        const w = { ...win };
        w.window = w;
        worlds.set(name, vm.createContext(w));
      }
      return worlds.get(name);
    };
    let ctxSeq = 10;
    const ctxToWorld = new Map();
    let inserted = 0;
    const call = async (m, p = {}) => {
      if (m === 'Page.getFrameTree') return { result: { frameTree: { frame: { id: 'F1', url: `${SITE}/login`, securityOrigin: SITE } } } };
      if (m === 'Target.getTargetInfo') return { result: { targetInfo: { targetId: 'T1', url: `${SITE}/login` } } };
      if (m === 'Page.createIsolatedWorld') {
        const id = ++ctxSeq;
        ctxToWorld.set(id, getWorld(String(p.worldName || 'default')));
        return { result: { executionContextId: id } };
      }
      if (m === 'Runtime.evaluate') {
        const ctx = ctxToWorld.get(p.contextId) || getWorld('main');
        const value = vm.runInContext(String(p.expression || ''), ctx);
        return { result: { result: { value } } };
      }
      if (m === 'Input.insertText') {
        inserted++;
        if (onInsertText) onInsertText({ text: String(p.text || ''), doc, inputs, frameEls });
        else if (doc.activeElement) doc.activeElement.value = String(doc.activeElement.value || '') + String(p.text || '');
        return { result: {} };
      }
      return { result: {} };
    };
    return { StubInput, inputs, frameEls, doc, call, inserted: () => inserted };
  }

  // ── (1) MAJOR 1: non-positional per-element mark + role re-verification at fill time ──
  {
    const M1_PW = pwOf('m1-shift');
    const dom1 = makeStubDom([
      { type: 'email', name: 'email', autocomplete: 'username' },
      { type: 'password', name: 'password', autocomplete: 'current-password' },
    ]);
    const form1 = await LF.inspectTabLoginForm({ call: dom1.call, targetId: 'T1', trackedUrl: `${SITE}/login` });
    const plan1 = form1 ? BL.planOf(form1, 'login') : null;
    const vals1 = plan1 ? BL.valuesOf({ plan: plan1 }, { username: 'alice@example.test', password: M1_PW }).values : {};
    // Insert a visible search input ahead of the sign-in form between plan and fill
    const searchBox = new dom1.StubInput({ type: 'search', name: 'q', placeholder: 'Search' });
    dom1.inputs.unshift(searchBox);
    const resShift = await LF.fillVaultLogin({ call: dom1.call, targetId: 'T1', trackedUrl: `${SITE}/login`, origin: SITE, form: form1, values: vals1, loginId: 'L1' });
    ok(resShift.ok === true && searchBox.val === '' && dom1.inputs[1].val === 'alice@example.test' && dom1.inputs[2].val === M1_PW,
      'r4 MAJOR 1 (shifted DOM): visible input inserted ahead of form between plan and fill leaves search box empty and puts username + password into their planned elements',
      { resShift, search: searchBox.val, emailHasPw: dom1.inputs[1].val === M1_PW, pwOk: dom1.inputs[2].val === M1_PW });

    // Role mismatch at fill time (password input flipped to type="text") ⇒ login_form_changed by name, 0 Input.insertText
    const dom2 = makeStubDom([
      { type: 'email', name: 'email', autocomplete: 'username' },
      { type: 'password', name: 'password', autocomplete: 'current-password' },
    ]);
    const form2 = await LF.inspectTabLoginForm({ call: dom2.call, targetId: 'T1', trackedUrl: `${SITE}/login` });
    const plan2 = form2 ? BL.planOf(form2, 'login') : null;
    const vals2 = plan2 ? BL.valuesOf({ plan: plan2 }, { username: 'alice@example.test', password: M1_PW }).values : {};
    dom2.inputs[1].setAttribute('type', 'text');
    const resRole = await LF.fillVaultLogin({ call: dom2.call, targetId: 'T1', trackedUrl: `${SITE}/login`, origin: SITE, form: form2, values: vals2, loginId: 'L1' });
    ok(!resRole.ok && resRole.code === 'login_form_changed' && BL.REFUSALS.includes('login_form_changed') && dom2.inserted() === 0 && dom2.inputs[0].val === '' && dom2.inputs[1].val === '',
      'r4 MAJOR 1 (role re-verification): password field flipped to type=text before fill ⇒ login_form_changed by name, nothing typed',
      { resRole, inserted: dom2.inserted() });

    // RED mutant control: a copy of browser-login-fill.js without the role check types the password into the plain-text input
    const LFS0 = fs.readFileSync(path.join(REPO, 'src/server/browser-login-fill.js'), 'utf8');
    const noRoleSrc = LFS0
      .replace('if (!roleMatchesPlan(wantRole, desc, { hasPassword: pwPlan })) {', 'if (false) {')
      .replace("if (wantRole === 'password' || wantRole === 'new-password') {", 'if (false) {')
      .replace("if ((wantRole === 'password' || wantRole === 'new-password') && (tag !== 'input' || domType !== 'password')) {", 'if (false) {');
    const LFm = noRoleSrc !== LFS0 ? MUT.load('src/server/browser-login-fill.js', noRoleSrc, 'norolecheck') : null;
    const dom2m = makeStubDom([
      { type: 'email', name: 'email', autocomplete: 'username' },
      { type: 'password', name: 'password', autocomplete: 'current-password' },
    ]);
    const form2m = LFm ? await LFm.inspectTabLoginForm({ call: dom2m.call, targetId: 'T1', trackedUrl: `${SITE}/login` }) : null;
    const vals2m = form2m ? BL.valuesOf({ plan: BL.planOf(form2m, 'login') }, { username: 'alice@example.test', password: M1_PW }).values : {};
    dom2m.inputs[1].setAttribute('type', 'text');
    const resMut = LFm ? await LFm.fillVaultLogin({ call: dom2m.call, targetId: 'T1', trackedUrl: `${SITE}/login`, origin: SITE, form: form2m, values: vals2m, loginId: 'L1' }) : null;
    ok(Boolean(LFm && resMut && resMut.ok === true && dom2m.inputs[1].val === M1_PW && resRole.code === 'login_form_changed'),
      'r4 MAJOR 1 RED control: a mutant without the role check types the password into the type=text input (real module refuses login_form_changed)',
      { mutantOk: resMut && resMut.ok, realCode: resRole.code });
  }

  // ── (2) MAJOR 2: pending signup/change requires submission evidence; link-click without submit & 200-JSON-{error} stay pending ──
  {
    const S2 = await world({ mode: { standard: true } });
    try {
      const tid = S2.k.targets()[0].targetId;
      S2.logins.grant(`web-login:${SITE}#x`, 'any-account', 'session:conv-1');
      S2.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, passwordStillFilled: true,
        fields: [
          { fieldId: 'vs-lf-u1', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
          { fieldId: 'vs-lf-p1', tag: 'input', domType: 'password', type: 'password', autocomplete: 'new-password', visible: true },
        ],
      });
      const rNoSub = await S2.w.fillLogin(TGT, FILL({ newUser: 'linkclick@example.test', generate: true, submit: false }));
      const n0 = S2.fy.length;
      S2.k.navigate(tid, `${SITE}/terms`, { reason: 'anchorClick' });
      await sleep(100);
      const recLink = BL.recordOf(S2.eng.secretGet(`web-login:${SITE}#linkclick@example.test`).value.toString('utf8'));
      ok(rNoSub.ok && recLink && recLink.pending === 'register' && recLink.submittedAt === null && S2.fy.length === n0,
        'r4 MAJOR 2 (link-click without submit): signup filled without --submit followed by a plain link click stays pending (submittedAt null, 0 notices)',
        recLink && { pending: recLink.pending, submittedAt: recLink.submittedAt, notices: S2.fy.length - n0 });

      // 200-JSON-{error} same-doc answer with password input still filled never confirms even if pushState fires
      S2.k.navigate(tid, `${SITE}/signup`);
      await sleep(30);
      S2.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, passwordStillFilled: true,
        fields: [
          { fieldId: 'vs-lf-u2', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
          { fieldId: 'vs-lf-p2', tag: 'input', domType: 'password', type: 'password', autocomplete: 'new-password', visible: true },
        ],
      });
      const rJsonErr = await S2.w.fillLogin(TGT, FILL({ newUser: 'jsonerr@example.test', generate: true, submit: true }));
      if (typeof S2.k.emitPageEvent === 'function') {
        S2.k.emitPageEvent(tid, 'Network.requestWillBeSent', { requestId: 'rq-err', request: { method: 'POST', url: `${SITE}/api/register` }, type: 'Fetch' });
        S2.k.emitPageEvent(tid, 'Network.responseReceived', { requestId: 'rq-err', type: 'Fetch', response: { status: 200 } });
        S2.k.emitPageEvent(tid, 'Network.loadingFinished', { requestId: 'rq-err' });
        S2.k.emitPageEvent(tid, 'Page.navigatedWithinDocument', { frameId: tid, url: `${SITE}/signup?err=taken` });
      }
      await sleep(130);
      const recErr = BL.recordOf(S2.eng.secretGet(`web-login:${SITE}#jsonerr@example.test`).value.toString('utf8'));
      ok(rJsonErr.ok && recErr && recErr.pending === 'register' && recErr.submittedAt === null,
        'r4 MAJOR 2 (200-JSON-{error}): 200 POST + same-doc navigation while password input still holds value never confirms pending signup',
        recErr && { pending: recErr.pending, submittedAt: recErr.submittedAt });
    } finally { await S2.close(); }
  }

  // ── (3) MAJOR 3: MIN_MASK_BYTES (8) floor honoured everywhere; CDP frames scrubbed inside string values only ──
  {
    const S3 = await world({ mode: { standard: true } });
    try {
      const seed = T.base32Encode(crypto.randomBytes(20));
      S3.totp.addEntry({ seed, name: 'shop-r4' }, { who: 'test' });
      const LONG_ESC_PW = ['Long', crypto.randomBytes(4).toString('hex'), '"q\\s', '99'].join('-');
      S3.logins.addOwn({ origin: SITE, username: 'totpuser', password: LONG_ESC_PW, totpName: 'shop-r4' });
      S3.logins.grant(`web-login:${SITE}#totpuser`, 'this-account', 'session:conv-1');
      S3.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE,
        fields: [
          { fieldId: 'vs-lf-u', tag: 'input', domType: 'text', type: 'text', autocomplete: 'username', visible: true },
          { fieldId: 'vs-lf-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true },
          { fieldId: 'vs-lf-o', tag: 'input', domType: 'tel', type: 'tel', autocomplete: 'one-time-code', visible: true },
        ],
      });
      const rf = await S3.w.fillLogin(TGT, FILL({ user: 'totpuser' }));
      const code6 = S3.totp.codeForLogin('shop-r4', { conv: 'conv-1', actor: 'Chat One' }).code;
      const shortFrame = JSON.stringify({ id: Number(code6), method: 'DOM.attributeModified', params: { timestamp: Number(`357162.${code6}`), nodeId: Number(code6) } });
      const scrubFrameFn = typeof S3.w.scrubCdpFrame === 'function' ? S3.w.scrubCdpFrame : S3.w.scrubText;
      const afterShortFrame = scrubFrameFn(PID, shortFrame);
      const afterShortCli = S3.w.scrubText(PID, `Order #${code6} shipped`);
      let shortParsed = null;
      try { shortParsed = JSON.parse(afterShortFrame); } catch { shortParsed = null; }
      ok(rf.ok && afterShortFrame === shortFrame && shortParsed && shortParsed.id === Number(code6) && afterShortCli === `Order #${code6} shipped`,
        'r4 MAJOR 3 (MIN_MASK_BYTES = 8): 6-digit TOTP secret leaves CDP JSON timestamps/ids/nodeIds and CLI numbers byte-identical',
        { codeLen: code6.length, sameFrame: afterShortFrame === shortFrame, afterShortCli });

      const longFrame = JSON.stringify({ id: 91, result: { value: `echo:${LONG_ESC_PW}`, count: 12345678 } });
      const afterLongFrame = scrubFrameFn(PID, longFrame);
      let longParsed = null;
      try { longParsed = JSON.parse(afterLongFrame); } catch { longParsed = null; }
      const badBefore = typeof S3.w.loginFenceStats === 'function' ? S3.w.loginFenceStats().unparseableScrubFrames : -1;
      const unparsedOut = scrubFrameFn(PID, '{unparseable-frame');
      const badAfter = typeof S3.w.loginFenceStats === 'function' ? S3.w.loginFenceStats().unparseableScrubFrames : -1;
      ok(Boolean(longParsed && longParsed.id === 91 && longParsed.result.count === 12345678 && longParsed.result.value === `echo:[vault:web-login:${SITE}#totpuser]` && !afterLongFrame.includes(LONG_ESC_PW) && unparsedOut === '{unparseable-frame' && badAfter === badBefore + 1),
        'r4 MAJOR 3 (JSON string-only CDP scrub): long secret with quotes/backslashes is masked inside string values, JSON structure stays valid, and unparseable frames pass untouched & counted',
        { longParsed, badBefore, badAfter });
    } finally { await S3.close(); }
  }

  // ── (6) MINOR 6: persisted fence + scrub names survive watch reconnect / hub restart with audit lines ──
  {
    let regRow = BP.normalizeRegistry({ profiles: [{ id: PID, label: 'Work', sharing: 'owner' }] });
    const fenceKeeper = {
      cdpEndpointFor: async () => ({ ok: true, url: k6.wsUrl }),
      onLease: () => () => {},
      loginFenceStateOf: (id) => (regRow.loginFences && regRow.loginFences[id]) || { fences: [], scrubs: [] },
      saveLoginFenceState: (id, next) => {
        regRow = BP.normalizeRegistry({
          ...regRow,
          loginFences: { ...(regRow.loginFences || {}), [id]: next },
        });
        return true;
      },
      audit: (a) => k6Audits.push(a),
    };
    const k6Audits = [];
    const d6 = path.join(ROOT, 'w6-' + crypto.randomBytes(3).toString('hex')); fs.mkdirSync(d6, { recursive: true });
    const eng6 = VE.create({ dataDir: d6, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
    await eng6.setup('vault-r4-m6-pass');
    const grants6 = GS.create({ memory: true });
    const logins6 = L.create({ vault: eng6, grants: () => grants6 });
    const PW6 = pwOf('m6-persist');
    logins6.addOwn({ origin: SITE, username: 'persist', password: PW6 });
    grants6.set('browser-login', `${SITE}#persist`, { to: [{ kind: 'conversation', key: 'conv-1' }] });
    const k6 = await startFakeKernel({ firstUrl: `${SITE}/login`, mode: { standard: true } });
    k6.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE, fields: [{ fieldId: 'vs-lf-6', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }] });
    const mkWatch6 = () => D.create({ keeper: fenceKeeper, log: quiet, enableTimeoutMs: 300, holdersOf: () => [{ browserKey: KEY, sessionId: 'sess-1', ephemeral: true }], leaseCountOf: () => 1, logins: logins6, conversationOf: () => ({ cid: 'conv-1', name: 'Chat One' }) });
    const w6a = mkWatch6();
    try {
      await w6a.arm(PID, { budgetMs: 3000 });
      const rf6 = await w6a.fillLogin(TGT, FILL({ user: 'persist' }));
      const diskJson = JSON.stringify(regRow);
      w6a.shutdown(); // simulate dropped watch / hub restart (keep browser running at urlAtFill)
      const w6b = mkWatch6();
      await w6b.arm(PID, { budgetMs: 3000 });
      const rearmedFence = w6b.liveFillVerdictFor(TGT, { verb: 'eval' });
      const rearmedScrub = w6b.scrubText(PID, `pw=${PW6}`);
      w6b.shutdown();
      // Now navigate tab while watch is down, then reconnect: stale urlAtFill drops fence and writes url-changed audit line
      k6.navigate(k6.targets()[0].targetId, `${SITE}/home`);
      const w6c = mkWatch6();
      await w6c.arm(PID, { budgetMs: 3000 });
      const afterUrlChange = w6c.liveFillVerdictFor(TGT, { verb: 'eval' });
      const st6 = typeof w6c.loginFenceStats === 'function' ? w6c.loginFenceStats() : { fenceAuditLines: [] };
      w6c.shutdown();
      ok(rf6.ok && !diskJson.includes(PW6) && rearmedFence.code === 'login_fill_live' && rearmedScrub === `pw=[vault:web-login:${SITE}#persist]` && afterUrlChange.ok === true && st6.fenceAuditLines.some((l) => l.why === 'url-changed'),
        'r4 MINOR 6 (persisted fence + scrub): watch reconnect re-arms liveFill + scrub at urlAtFill (0 secret bytes persisted) and audits url-changed when tab moved',
        { rearmedFence, scrubbed: rearmedScrub === `pw=[vault:web-login:${SITE}#persist]`, audits: st6.fenceAuditLines });
    } finally { await k6.close(); eng6.close(); }
  }

  // ── (7) MINOR 7: per-tab CLI fence, proven SPA submit lifts fence, ceiling wipes + audits, honest refusal words ──
  {
    const S7 = await world({ mode: { standard: true } });
    try {
      const tid1 = S7.k.targets()[0].targetId;
      const tid2 = S7.k.addTarget(`${SITE2}/docs`);
      await until(() => S7.w._watches.get(PID)?.targets.has(tid2), 1500);
      const PW7 = pwOf('m7-tab');
      S7.logins.addOwn({ origin: SITE, username: 'tabuser', password: PW7 });
      S7.logins.grant(`web-login:${SITE}#tabuser`, 'this-account', 'session:conv-1');
      S7.k.setStandardPage({ passwordStillFilled: false, fields: [{ fieldId: 'vs-lf-7', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }], subFrames: { [tid2]: { fields: [] } } });
      const rf7 = await S7.w.fillLogin(TGT, FILL({ user: 'tabuser' }));
      const onTab1 = S7.w.liveFillVerdictFor(TGT, { verb: 'snapshot' });
      if (typeof S7.w.noteActiveTab === 'function') S7.w.noteActiveTab(TGT, tid2);
      const onTab2 = S7.w.liveFillVerdictFor(TGT, { verb: 'snapshot' });
      const batchSwitchRead = S7.w.liveFillVerdictFor(TGT, { verb: 'batch', batchVerbs: ['tab', 'snapshot'] });
      if (typeof S7.w.noteActiveTab === 'function') S7.w.noteActiveTab(TGT, tid1);
      const backOnTab1 = S7.w.liveFillVerdictFor(TGT, { verb: 'snapshot' });
      ok(rf7.ok && onTab1.code === 'login_fill_live' && /submit the form/.test(onTab1.error || '') && /or reload/.test(onTab1.error || '') && onTab2.ok === true && backOnTab1.code === 'login_fill_live' && batchSwitchRead.code === 'login_fill_live',
        'r4 MINOR 7 (per-tab CLI fence + honest recipe): reading Tab 2 passes while Tab 1 (and batch tab+snapshot) stays fenced with "submit the form … or reload"',
        { rf7, onTab1, onTab2, backOnTab1, batchSwitchRead });

      // Proven SPA submit (200 same-origin POST + empty/unmounted password input) lifts liveFill on Tab 1
      if (typeof S7.k.emitPageEvent === 'function') {
        S7.k.emitPageEvent(tid1, 'Network.requestWillBeSent', { requestId: 'rq-spa', request: { method: 'POST', url: `${SITE}/api/login`, postData: `password=${encodeURIComponent(PW7)}` }, type: 'Fetch' });
        S7.k.emitPageEvent(tid1, 'Network.responseReceived', { requestId: 'rq-spa', type: 'Fetch', response: { status: 200 } });
        S7.k.emitPageEvent(tid1, 'Network.loadingFinished', { requestId: 'rq-spa' });
      }
      const liftedSpa = await until(() => S7.w.liveFillVerdictFor(TGT, { verb: 'snapshot' }).ok === true, 1200);
      ok(Boolean(liftedSpa), 'r4 MINOR 7 (SPA finish): 2xx same-origin POST + cleared password field lifts liveFill without cross-document navigation');
    } finally { await S7.close(); }

    // Ceiling test: liveFillMaxMs = 60 wipes inputs in isolated world before lifting and records ceiling audit line
    const d7c = path.join(ROOT, 'w7c-' + crypto.randomBytes(3).toString('hex')); fs.mkdirSync(d7c, { recursive: true });
    const eng7c = VE.create({ dataDir: d7c, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
    await eng7c.setup('vault-r4-m7c');
    const grants7c = GS.create({ memory: true });
    const logins7c = L.create({ vault: eng7c, grants: () => grants7c });
    logins7c.addOwn({ origin: SITE, username: 'ceil', password: pwOf('m7-ceil') });
    grants7c.set('browser-login', `${SITE}#ceil`, { to: [{ kind: 'conversation', key: 'conv-1' }] });
    const k7c = await startFakeKernel({ firstUrl: `${SITE}/login`, mode: { standard: true } });
    k7c.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE, fields: [{ fieldId: 'vs-lf-c', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }] });
    const w7c = D.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: k7c.wsUrl }), onLease: () => () => {} }, log: quiet, enableTimeoutMs: 300, liveFillMaxMs: 60, holdersOf: () => [{ browserKey: KEY, sessionId: 'sess-1', ephemeral: true }], leaseCountOf: () => 1, logins: logins7c, conversationOf: () => ({ cid: 'conv-1', name: 'Chat One' }) });
    try {
      await w7c.arm(PID, { budgetMs: 3000 });
      await w7c.fillLogin(TGT, FILL({ user: 'ceil' }));
      const liftedCeil = await until(() => w7c.liveFillVerdictFor(TGT, { verb: 'eval' }).ok === true, 1200);
      const st7c = typeof w7c.loginFenceStats === 'function' ? w7c.loginFenceStats() : { fenceAuditLines: [] };
      ok(Boolean(liftedCeil && (k7c.standardPage().ceilingWiped || 0) >= 1 && st7c.fenceAuditLines.some((l) => l.why === 'ceiling')),
        'r4 MINOR 7 (ceiling): expired fence wipes inputs in isolated world before lifting and records ceiling audit line',
        { ceilingWiped: k7c.standardPage().ceilingWiped, audits: st7c.fenceAuditLines });
    } finally { w7c.shutdown(); await k7c.close(); eng7c.close(); }
  }

  // ── (8) MINOR 8: census-class mediated CDP fence (183 read + 197 page-mutation + unknown + Debugger.* refused) ──
  {
    const allRows = CENSUS.rows();
    const readRows = allRows.filter((r) => r.cls === 'read');
    const mutRows = allRows.filter((r) => r.cls === 'page-mutation');
    const leakReads = readRows.filter((r) => !Med.liveFillCdpVerdict(`${r.domain}.${r.method}`).refuse);
    const leakMuts = mutRows.filter((r) => !Med.liveFillCdpVerdict(`${r.domain}.${r.method}`).refuse);
    const unk = Med.liveFillCdpVerdict('FutureDomain.readSecret');
    const dbg = Med.liveFillCdpVerdict('Debugger.enable');
    const snapClick = Med.liveFillCdpVerdict('DOMSnapshot.captureSnapshot', { allowVerb: 'click' });
    const evalClickLeak = Med.liveFillCdpVerdict('Runtime.evaluate', { allowVerb: 'click', params: { expression: 'document.querySelector("input").value' } });
    const evalClickLocator = Med.liveFillCdpVerdict('Runtime.evaluate', { allowVerb: 'click', params: { expression: 'document.querySelector("#submit")', returnByValue: false } });
    ok(readRows.length >= 180 && mutRows.length >= 190 && leakReads.length === 0 && leakMuts.length === 0 && unk.refuse === true && dbg.refuse === true && snapClick.refuse === true && evalClickLeak.refuse === true && evalClickLocator.refuse === false,
      `r4 MINOR 8 (census-class CDP fence): refuses all ${readRows.length} read methods (incl. DOMSnapshot.captureSnapshot, IndexedDB.requestData, IO.read), all ${mutRows.length} page-mutation methods, unknown methods, and Debugger.*; click exempts only its locator plumbing`,
      { readCount: readRows.length, mutCount: mutRows.length, leakReads: leakReads.slice(0, 5), leakMuts: leakMuts.slice(0, 5), unk, snapClick, evalClickLeak });
  }

  // ── (9) MINOR 9: focus-theft hand-back wipe + keep fence on failed fill + inert iframes + wait --fn refused ──
  {
    const M9_PW = pwOf('m9-thief');
    let inertDuringInsert = false;
    const dom9 = makeStubDom(
      [
        { type: 'text', name: 'thief' },
        { type: 'password', name: 'password', autocomplete: 'current-password' },
      ],
      {
        iframes: [{ id: 'xorigin-frame' }],
        onInsertText: ({ text, doc, inputs, frameEls }) => {
          inertDuringInsert = Boolean(frameEls[0] && frameEls[0].inert === true && frameEls[0].hasAttribute('inert'));
          // (a3b) focus stolen into thief input during insertText, then focus handed back to password input!
          inputs[0].value = text;
          doc.activeElement = inputs[1];
        },
      }
    );
    const form9 = await LF.inspectTabLoginForm({ call: dom9.call, targetId: 'T1', trackedUrl: `${SITE}/login` });
    const vals9 = form9 ? BL.valuesOf({ plan: BL.planOf(form9, 'login') }, { username: '', password: M9_PW }).values : {};
    const res9 = await LF.fillVaultLogin({ call: dom9.call, targetId: 'T1', trackedUrl: `${SITE}/login`, origin: SITE, form: form9, values: vals9, loginId: 'L9' });
    ok(!res9.ok && res9.code === 'login_failed' && inertDuringInsert === true && dom9.frameEls[0].inert === false && !dom9.frameEls[0].hasAttribute('inert') && dom9.inputs[0].val === '' && dom9.inputs[1].val === '',
      'r4 MINOR 9 (focus theft + inert iframes): iframes marked inert during typing & restored after, and (a3b) focus-theft hand-back wipes the grown thief input',
      { res9, inertDuringInsert, restoredInert: dom9.frameEls[0].inert, thiefValLen: dom9.inputs[0].val.length });

    // Failed fill after Input.insertText KEEPS the read fence armed
    const S9 = await world({ mode: { standard: true } });
    try {
      S9.logins.addOwn({ origin: SITE, username: 'keepfence', password: pwOf('m9-keep') });
      S9.logins.grant(`web-login:${SITE}#keepfence`, 'this-account', 'session:conv-1');
      S9.k.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE, clearOnInput: true, fields: [{ fieldId: 'vs-lf-9', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }] });
      const rf9 = await S9.w.fillLogin(TGT, FILL({ user: 'keepfence' }));
      const fenceAfterFail = S9.w.liveFillVerdictFor(TGT, { verb: 'eval' });
      ok(!rf9.ok && rf9.code === 'login_failed' && fenceAfterFail.code === 'login_fill_live',
        'r4 MINOR 9 (keep fence on failed fill): failed fill after Input.insertText keeps liveFill armed over any residue',
        { rf9, fenceAfterFail });
    } finally { await S9.close(); }

    const wFn = BL.liveFillVerdict({ verb: 'wait', argv: ['wait', '--fn', 'document.body.innerHTML'], origin: SITE });
    const wFnBatch = BL.liveFillVerdict({ verb: 'batch', batchVerbs: ['click', 'wait --fn'], origin: SITE });
    const wMs = BL.liveFillVerdict({ verb: 'wait', argv: ['wait', '250'], origin: SITE });
    ok(!wFn.ok && wFn.code === 'login_fill_live' && !wFnBatch.ok && wFnBatch.code === 'login_fill_live' && wMs.ok === true,
      'r4 MINOR 9 (wait --fn): JS-running wait (--fn / batch wait --fn) is refused during liveFill while plain timer wait passes',
      { wFn, wFnBatch, wMs });
  }

  // ── (10) MINOR 10: honest words for framed forms (login_in_frame vs login_phishing) + bounded 302 skew ──
  {
    const mkFrameCall = ({ childFrames = [], targetUrls = null }) => {
      let tiCalls = 0;
      return async (m, p = {}) => {
        if (m === 'Page.getFrameTree') return { result: { frameTree: { frame: { id: 'TOP', url: `${SITE}/login`, securityOrigin: SITE }, childFrames } } };
        if (m === 'Target.getTargetInfo') {
          const u = Array.isArray(targetUrls) ? targetUrls[Math.min(tiCalls++, targetUrls.length - 1)] : `${SITE}/login`;
          return { result: { targetInfo: { targetId: 'T1', url: u } } };
        }
        if (m === 'Page.createIsolatedWorld') return { result: { executionContextId: p.frameId === 'TOP' ? 1 : (p.frameId === 'SUB_FORM' ? 2 : 3) } };
        if (m === 'Runtime.evaluate') {
          if (p.contextId === 1) return { result: { result: { value: { ok: true, isoOrigin: SITE, isoHref: `${SITE}/login`, actionOrigin: null, hasFrameEls: true, fields: [] } } } };
          if (p.contextId === 2) return { result: { result: { value: { ok: true, isoOrigin: SITE, isoHref: 'about:srcdoc', actionOrigin: null, fields: [{ fieldId: 'vs-lf-sub', tag: 'input', domType: 'password', type: 'password', visible: true }] } } } };
          return { result: { result: { value: { ok: true, isoOrigin: SITE, isoHref: 'about:blank', actionOrigin: null, fields: [] } } } };
        }
        return { result: {} };
      };
    };
    const srcdocForm = await LF.inspectTabLoginForm({
      call: mkFrameCall({ childFrames: [{ frame: { id: 'SUB_FORM', url: 'about:srcdoc', securityOrigin: 'null' } }] }),
      targetId: 'T1', trackedUrl: `${SITE}/login`,
    });
    const srcdocVerdict = BL.fillVerdict({ forms: srcdocForm ? [srcdocForm] : [], entries: ENT, grantRows: rowsFrom([ROW(`${SITE}#alice`, [{ kind: 'conversation', key: 'conv-1' }])]), facts: ME, vaultState: 'unlocked' });
    // 10th child frame (past the old 8-frame cap) cross-origin ⇒ login_phishing
    const tenKids = Array.from({ length: 9 }, (_, i) => ({ frame: { id: `EMPTY_${i}`, url: 'about:blank', securityOrigin: 'null' } }));
    tenKids.push({ frame: { id: 'SUB_FORM', url: `${SITE2}/embed`, securityOrigin: SITE2 } });
    const tenthCross = await LF.inspectTabLoginForm({ call: mkFrameCall({ childFrames: tenKids }), targetId: 'T1', trackedUrl: `${SITE}/login` });
    const tenthVerdict = BL.fillVerdict({ forms: tenthCross ? [tenthCross] : [], entries: ENT, grantRows: rowsFrom([ROW(`${SITE}#alice`, [{ kind: 'conversation', key: 'conv-1' }])]), facts: ME, vaultState: 'unlocked' });
    // Bounded 302 skew: 1st Target.getTargetInfo still reports SITE2 before settling to SITE on 2nd sample
    let skewTi = 0;
    const skewForm = await LF.inspectTabLoginForm({
      call: async (m) => {
        if (m === 'Page.getFrameTree') return { result: { frameTree: { frame: { id: 'TOP', url: `${SITE}/login`, securityOrigin: SITE } } } };
        if (m === 'Target.getTargetInfo') return { result: { targetInfo: { targetId: 'T1', url: skewTi++ === 0 ? `${SITE2}/sso` : `${SITE}/login` } } };
        if (m === 'Page.createIsolatedWorld') return { result: { executionContextId: 5 } };
        if (m === 'Runtime.evaluate') return { result: { result: { value: { ok: true, isoOrigin: SITE, isoHref: `${SITE}/login`, actionOrigin: SITE, fields: [{ fieldId: 'vs-lf-s', tag: 'input', domType: 'password', type: 'password', visible: true }] } } } };
        return { result: {} };
      },
      targetId: 'T1', trackedUrl: () => (skewTi <= 1 ? `${SITE2}/sso` : `${SITE}/login`),
    });
    ok(BL.REFUSALS.includes('login_in_frame') && srcdocVerdict.code === 'login_in_frame' && /inside a frame/.test(srcdocVerdict.error || '') && tenthVerdict.code === 'login_phishing' && Boolean(skewForm && skewForm.pageOrigin === SITE),
      'r4 MINOR 10 (framed forms + 302 skew): about:srcdoc/same-origin frame refuses login_in_frame ("inside a frame"), 10th cross-origin child frame refuses login_phishing, and transient 302 targetInfo skew settles within bounded retry',
      { srcdocVerdict, tenthVerdict, skewOk: !!skewForm });
  }
}

// ═══ ⑬ Standard-Chrome r5 adversarial fixup gates (MAJOR A/B/C + MINOR D/E/F + Vault pending/provenance + RED controls A–F) ═══
console.log('⑬ Standard-Chrome r5 adversarial fixup gates (MAJOR A/B/C + MINOR D/E/F + RED controls A–F)');
{
  const { performance } = require('node:perf_hooks');
  const DSRC0 = fs.readFileSync(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf8');
  const BLSRC0 = fs.readFileSync(path.join(REPO, 'src/browser-login.js'), 'utf8');
  // 6-byte runtime secret (< MIN_MASK_BYTES = 8, so Layer 2 never masks it; Layer 1 fence alone protects it)
  const pw6Of = () => 'Z' + crypto.randomBytes(2).toString('hex') + '!';

  function makeAxFrame(nodeCount, { compact = false, secret = '', withSecretKey = false } = {}) {
    const nodes = [];
    for (let i = 0; i < nodeCount; i++) {
      if (compact) {
        nodes.push({ id: String(i), r: 't', n: i === nodeCount - 1 && secret ? `lbl:${secret}` : `item-${i}` });
      } else {
        nodes.push({
          nodeId: String(1000 + i),
          ignored: false,
          role: { type: 'role', value: i % 3 === 0 ? 'button' : 'StaticText' },
          name: { type: 'computedString', value: i === nodeCount - 1 && secret ? `echo:${secret}` : `Label text for node ${i}` },
          description: { type: 'computedString', value: '' },
          value: { type: 'computedString', value: '' },
          childIds: [],
          backendDOMNodeId: 2000 + i,
        });
      }
    }
    const extra = withSecretKey && secret ? { [secret]: 'key-val' } : {};
    return JSON.stringify({ id: 77, result: { nodes, count: 12345678, ...extra } });
  }

  // ── (A) MAJOR A: compiled per-profile scrubber (< 20 ms for 5000 AX nodes), 256 KB bound, and scrub cleared when fence ends ──
  {
    const SA = await world({ mode: { standard: true } });
    try {
      const tid = SA.k.targets()[0].targetId;
      const PWA = pwOf('r5-majA');
      SA.logins.addOwn({ origin: SITE, username: 'axuser', password: PWA });
      SA.logins.grant(`web-login:${SITE}#axuser`, 'this-account', 'session:conv-1');
      SA.k.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE, fields: [{ fieldId: 'vs-a-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }] });
      const rfA = await SA.w.fillLogin(TGT, FILL({ user: 'axuser' }));
      const compact5000 = makeAxFrame(5000, { compact: true, secret: PWA, withSecretKey: true });
      const full5000 = makeAxFrame(5000, { compact: false, secret: PWA });
      // Warm V8 JIT once, then measure median of 3 runs
      SA.w.scrubCdpFrame(PID, makeAxFrame(50, { compact: true }));
      const timesCompact = [];
      let outCompact = '';
      for (let r = 0; r < 3; r++) {
        const t0 = performance.now();
        outCompact = SA.w.scrubCdpFrame(PID, compact5000);
        timesCompact.push(performance.now() - t0);
      }
      timesCompact.sort((a, b) => a - b);
      const ov0 = SA.w.loginFenceStats().oversizeScrubFrames || 0;
      const tFull0 = performance.now();
      const outFull = SA.w.scrubCdpFrame(PID, full5000);
      const fullMs = performance.now() - tFull0;
      const ov1 = SA.w.loginFenceStats().oversizeScrubFrames || 0;
      const compactParsed = JSON.parse(outCompact);
      const fullParsed = JSON.parse(outFull);
      const hadScrubDuringFence = SA.w.hasScrubSecrets(PID);
      // Ending the last fence on the profile clears the scrub set immediately (the value is dead to the agent once the fence ends)
      SA.k.navigate(tid, `${SITE}/after-login`);
      const scrubCleared = await until(() => SA.w.hasScrubSecrets(PID) === false, 1500);
      ok(rfA.ok && Buffer.byteLength(compact5000) <= 256 * 1024 && Buffer.byteLength(full5000) > 256 * 1024 &&
        timesCompact[1] < 20 && fullMs < 20 && ov1 === ov0 + 1 &&
        !outCompact.includes(PWA) && !outFull.includes(PWA) &&
        compactParsed.result[`[vault:web-login:${SITE}#axuser]`] === 'key-val' &&
        compactParsed.result.count === 12345678 && fullParsed.result.count === 12345678 &&
        hadScrubDuringFence === true && Boolean(scrubCleared),
        `r5 MAJOR A (compiled scrubber + 256 KB bound + fence-end clear): 5000-node AX frames scrub in < 20 ms (<=256KB walk=${timesCompact[1].toFixed(2)}ms, >256KB spelled=${fullMs.toFixed(2)}ms), mask string values & JSON keys, and clear scrub set when fence ends`,
        { walkMs: timesCompact[1], fullMs, ov0, ov1, hadScrubDuringFence, scrubCleared: !!scrubCleared });

      // RED A1: per-string VR().maskText rebuild (r4 shape) exceeds the 20 ms budget on the 5000-node frame
      const redA1Src = DSRC0
        .replace('if (Buffer.byteLength(frameStr, \'utf8\') > SCRUB_JSON_MAX_BYTES) {', 'if (false) {')
        .replace('const s = fn(node);', 'const s = VR().maskText(node, [...(scrubByProfile.get(pid) || [])].map((b) => ({ label: b.label, value: b.value })));');
      const DmA1 = redA1Src !== DSRC0 ? MUT.load('src/server/browser-dialogs.js', redA1Src, 'r5-a-per-string-masker') : null;
      const SA1 = DmA1 ? await world({ mode: { standard: true }, Dmod: DmA1 }) : null;
      let redA1Ms = -1;
      if (SA1) {
        try {
          SA1.logins.addOwn({ origin: SITE, username: 'axuser', password: PWA });
          SA1.logins.grant(`web-login:${SITE}#axuser`, 'this-account', 'session:conv-1');
          SA1.k.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE, fields: [{ fieldId: 'vs-a1-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }] });
          await SA1.w.fillLogin(TGT, FILL({ user: 'axuser' }));
          const t0 = performance.now();
          SA1.w.scrubCdpFrame(PID, full5000);
          redA1Ms = performance.now() - t0;
        } finally { await SA1.close(); }
      }
      ok(Boolean(DmA1 && redA1Ms >= 20 && fullMs < 20 && timesCompact[1] < 20),
        `r5 MAJOR A RED control [r5-a-per-string-masker]: per-string maskText mutant blocks event loop (${redA1Ms.toFixed(1)} ms >= 20 ms) while compiled r5 scrubs in < 20 ms`,
        { redA1Ms, r5FullMs: fullMs, r5WalkMs: timesCompact[1] });

      // RED A2: mutant that never clears the scrub set when the fence ends
      const redA2Src = DSRC0.replace('function pruneProfileScrubIfUnfenced(profileId, { persist = true } = {}) {', 'function pruneProfileScrubIfUnfenced() { return;');
      const DmA2 = redA2Src !== DSRC0 ? MUT.load('src/server/browser-dialogs.js', redA2Src, 'r5-a-never-clear-scrub') : null;
      const SA2 = DmA2 ? await world({ mode: { standard: true }, Dmod: DmA2 }) : null;
      let redA2Kept = false;
      if (SA2) {
        try {
          const tid2 = SA2.k.targets()[0].targetId;
          SA2.logins.addOwn({ origin: SITE, username: 'axuser', password: PWA });
          SA2.logins.grant(`web-login:${SITE}#axuser`, 'this-account', 'session:conv-1');
          SA2.k.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE, fields: [{ fieldId: 'vs-a2-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }] });
          await SA2.w.fillLogin(TGT, FILL({ user: 'axuser' }));
          SA2.k.navigate(tid2, `${SITE}/after-login`);
          await until(() => SA2.w.liveFillVerdictFor(TGT, { verb: 'eval' }).ok === true, 1500);
          redA2Kept = SA2.w.hasScrubSecrets(PID) === true;
        } finally { await SA2.close(); }
      }
      ok(Boolean(DmA2 && redA2Kept && scrubCleared),
        'r5 MAJOR A RED control [r5-a-never-clear-scrub]: mutant without pruneProfileScrubIfUnfenced keeps scrub set alive after fence ends (r5 clears it)',
        { redA2Kept, r5ScrubCleared: !!scrubCleared });
    } finally { await SA.close(); }
  }

  // ── (B) MAJOR B: frame-held fields on ANOTHER tab never shadow or refuse the active tab's top-level sign-in form ──
  {
    const SB = await world({ mode: { standard: true } });
    try {
      const tidA = SB.k.targets()[0].targetId;
      const tidB = SB.k.addTarget(`${SITE}/article`);
      const tidC = SB.k.addTarget(`${SITE2}/blog`);
      await until(() => SB.w._watches.get(PID)?.targets.has(tidB) && SB.w._watches.get(PID)?.targets.has(tidC), 1500);
      const PWB = pwOf('r5-majB');
      SB.logins.addOwn({ origin: SITE, username: 'taba', password: PWB });
      SB.logins.grant(`web-login:${SITE}#taba`, 'this-account', 'session:conv-1');
      // Tab A: plain top-level username + password form on SITE/login
      SB.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE,
        fields: [
          { fieldId: 'vs-ba-u', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
          { fieldId: 'vs-ba-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true },
        ],
      }, tidA);
      // Tab B (later in Map order, SAME site): no top-level fields, same-origin /embed/newsletter iframe with an email input
      SB.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, fields: [],
        childFrames: [{ frame: { id: 'SUB_NEWS_B', url: `${SITE}/embed/newsletter`, securityOrigin: SITE } }],
        subFrames: { SUB_NEWS_B: { isoOrigin: SITE, isoHref: `${SITE}/embed/newsletter`, fields: [{ fieldId: 'vs-bb-e', tag: 'input', domType: 'email', type: 'email', autocomplete: 'email', visible: true }] } },
      }, tidB);
      // Tab C (later in Map order, OTHER site): cross-origin widget iframe with an email input
      SB.k.setStandardPage({
        securityOrigin: SITE2, isoOrigin: SITE2, fields: [],
        childFrames: [{ frame: { id: 'SUB_CHAT_C', url: 'https://chat-widget.example.test/box', securityOrigin: 'https://chat-widget.example.test' } }],
        subFrames: { SUB_CHAT_C: { isoOrigin: 'https://chat-widget.example.test', isoHref: 'https://chat-widget.example.test/box', fields: [{ fieldId: 'vs-bc-e', tag: 'input', domType: 'email', type: 'email', autocomplete: 'email', visible: true }] } },
      }, tidC);
      SB.w.noteActiveTab(TGT, tidA);
      const rfNoOrigin = await SB.w.fillLogin(TGT, FILL());
      SB.k.navigate(tidA, `${SITE}/login`);
      await sleep(30);
      const rfWithOrigin = await SB.w.fillLogin(TGT, FILL({ origin: SITE }));
      // Refusal on a framed tab names the tab (`(tab <id[0..8]>)`)
      const fB = BL.classifyChromeForm({ targetId: tidB, pageOrigin: SITE, frameOrigin: SITE, inFrame: true, fields: [{ fieldId: 'e1', tag: 'input', domType: 'email', type: 'email', visible: true }] }, { now: 20 });
      const fC = BL.classifyChromeForm({ targetId: tidC, pageOrigin: SITE2, frameOrigin: 'https://chat-widget.example.test', inFrame: false, fields: [{ fieldId: 'e2', tag: 'input', domType: 'email', type: 'email', visible: true }] }, { now: 30 });
      const vRefB = BL.fillVerdict({ forms: [fB], activeTargetId: tidB, entries: ENT, grantRows: rowsFrom([ROW(`${SITE}#alice`, [{ kind: 'conversation', key: 'conv-1' }])]), facts: ME, vaultState: 'unlocked' });
      const vRefC = BL.fillVerdict({ forms: [fC], activeTargetId: tidC, entries: ENT, grantRows: rowsFrom([ROW(`${SITE}#alice`, [{ kind: 'conversation', key: 'conv-1' }])]), facts: ME, vaultState: 'unlocked' });
      ok(rfNoOrigin.ok === true && rfWithOrigin.ok === true && SB.k.standardPage(tidA).inserted === 4 &&
        vRefB.code === 'login_in_frame' && vRefB.error.includes(`(tab ${tidB.slice(0, 8)})`) &&
        vRefC.code === 'login_phishing' && vRefC.error.includes(`(tab ${tidC.slice(0, 8)})`),
        'r5 MAJOR B (two-tab frame isolation + tab-named refusal): active Tab A fills (both no-origin and named-origin) despite later Tab B same-origin iframe & Tab C cross-origin iframe; refusals name the tab',
        { rfNoOrigin, rfWithOrigin, insertedA: SB.k.standardPage(tidA).inserted, vRefB, vRefC });

      // RED B: r4's last-form-wins rule (`const form = pick(pool);`) refuses login_phishing / login_in_frame on the same forms
      const redBSrc = BLSRC0.replace(
        'const form = pick(actTop) || (actTid ? pick(actAny) || pick(anyTop) : pick(anyTop)) || pick(pool);',
        'const form = pick(pool);'
      );
      const BLmB = redBSrc !== BLSRC0 ? MUT.load('src/browser-login.js', redBSrc, 'r5-b-last-form-wins') : null;
      const fA = BL.classifyChromeForm({ targetId: tidA, pageOrigin: SITE, frameOrigin: SITE, fields: [{ fieldId: 'u', tag: 'input', domType: 'email', type: 'email', visible: true }, { fieldId: 'p', tag: 'input', domType: 'password', type: 'password', visible: true }] }, { now: 10 });
      const realVB = BL.fillVerdict({ forms: [fA, fB, fC], activeTargetId: tidA, entries: ENT, grantRows: rowsFrom([ROW(`${SITE}#alice`, [{ kind: 'conversation', key: 'conv-1' }])]), facts: ME, vaultState: 'unlocked' });
      const redVB1 = BLmB ? BLmB.fillVerdict({ forms: [fA, fB], activeTargetId: tidA, entries: ENT, grantRows: rowsFrom([ROW(`${SITE}#alice`, [{ kind: 'conversation', key: 'conv-1' }])]), facts: ME, vaultState: 'unlocked' }) : null;
      const redVB2 = BLmB ? BLmB.fillVerdict({ forms: [fA, fC], activeTargetId: tidA, entries: ENT, grantRows: rowsFrom([ROW(`${SITE}#alice`, [{ kind: 'conversation', key: 'conv-1' }])]), facts: ME, vaultState: 'unlocked' }) : null;
      ok(Boolean(BLmB && realVB.ok === true && realVB.form.targetId === tidA && redVB1 && redVB1.code === 'login_in_frame' && redVB2 && redVB2.code === 'login_phishing'),
        'r5 MAJOR B RED control [r5-b-last-form-wins]: last-form-wins mutant refuses login_in_frame / login_phishing where r5 fills active Tab A',
        { realVB: realVB.ok, redVB1: redVB1 && redVB1.code, redVB2: redVB2 && redVB2.code });
    } finally { await SB.close(); }
  }

  // ── (C) MAJOR C: credential-carrying write + non-error body confirmation law (all 4 false confirmations + sendBeacon + getRequestPostData) ──
  {
    const SC = await world({ mode: { standard: true } });
    try {
      const tid = SC.k.targets()[0].targetId;
      SC.logins.grant(`web-login:${SITE}#x`, 'any-account', 'session:conv-1');

      // (c1) 200 {"ok":false,"error":"taken"} where site JS clears password + pushState + later cross-doc nav ⇒ stays pending, 0 notices
      SC.k.navigate(tid, `${SITE}/signup1`);
      await sleep(25);
      SC.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, noAutoSubmitNet: true, passwordStillFilled: false,
        fields: [
          { fieldId: 'c1-u', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
          { fieldId: 'c1-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'new-password', visible: true },
        ],
      }, tid);
      const n0 = SC.fy.length;
      const rc1 = await SC.w.fillLogin(TGT, FILL({ newUser: 'c1err@example.test', generate: true, submit: true }));
      const pwC1 = BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c1err@example.test`).value.toString('utf8')).password;
      SC.k.setResponseBody(tid, 'rq-c1', JSON.stringify({ ok: false, error: 'email_taken' }));
      SC.k.emitPageEvent(tid, 'Network.requestWillBeSent', { requestId: 'rq-c1', type: 'Fetch', request: { method: 'POST', url: `${SITE}/api/signup`, postData: JSON.stringify({ email: 'c1err@example.test', password: pwC1 }) } });
      SC.k.emitPageEvent(tid, 'Network.responseReceived', { requestId: 'rq-c1', type: 'Fetch', response: { status: 200, url: `${SITE}/api/signup` } });
      SC.k.emitPageEvent(tid, 'Network.loadingFinished', { requestId: 'rq-c1' });
      SC.k.emitPageEvent(tid, 'Page.navigatedWithinDocument', { frameId: tid, url: `${SITE}/signup1?step=err` });
      await sleep(140);
      SC.k.navigate(tid, `${SITE}/help`);
      await sleep(80);
      const recC1 = BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c1err@example.test`).value.toString('utf8'));
      ok(rc1.ok && recC1.pending === 'register' && SC.fy.length === n0,
        'r5 MAJOR C.1 (200 {error} + cleared password + pushState + later nav): stays pending:register with 0 notices',
        { pending: recC1.pending, notices: SC.fy.length - n0 });

      // (c2) same-origin email-availability POST 200 (carrying email, NOT password) + plain link click ⇒ stays pending, 0 notices
      SC.k.navigate(tid, `${SITE}/signup2`);
      await sleep(25);
      SC.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, passwordStillFilled: true,
        fields: [
          { fieldId: 'c2-u', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
          { fieldId: 'c2-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'new-password', visible: true },
        ],
      }, tid);
      const rc2 = await SC.w.fillLogin(TGT, FILL({ newUser: 'c2avail@example.test', generate: true, submit: false }));
      SC.k.setResponseBody(tid, 'rq-c2', JSON.stringify({ available: true }));
      SC.k.emitPageEvent(tid, 'Network.requestWillBeSent', { requestId: 'rq-c2', type: 'Fetch', request: { method: 'POST', url: `${SITE}/api/email-check`, postData: JSON.stringify({ email: 'c2avail@example.test' }) } });
      SC.k.emitPageEvent(tid, 'Network.responseReceived', { requestId: 'rq-c2', type: 'Fetch', response: { status: 200, url: `${SITE}/api/email-check` } });
      SC.k.emitPageEvent(tid, 'Network.loadingFinished', { requestId: 'rq-c2' });
      await sleep(80);
      SC.k.navigate(tid, `${SITE}/privacy`, { reason: 'anchorClick' });
      await sleep(80);
      const recC2 = BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c2avail@example.test`).value.toString('utf8'));
      ok(rc2.ok && recC2.pending === 'register' && SC.fy.length === n0,
        'r5 MAJOR C.2 (same-origin email-availability POST 200 + link click): non-credential write never arms nav confirmation (0 notices)',
        { pending: recC2.pending, notices: SC.fy.length - n0 });

      // (c3) --submit blocked by required checkbox (0 POSTs) ⇒ submitted:false, then tab navigates elsewhere ⇒ stays pending, 0 notices
      SC.k.navigate(tid, `${SITE}/signup3`);
      await sleep(25);
      SC.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, blockSubmit: true, passwordStillFilled: true,
        fields: [
          { fieldId: 'c3-u', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
          { fieldId: 'c3-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'new-password', visible: true },
        ],
      }, tid);
      const rc3 = await SC.w.fillLogin(TGT, FILL({ newUser: 'c3blocked@example.test', generate: true, submit: true }));
      SC.k.navigate(tid, `${SITE}/pricing`);
      await sleep(80);
      const recC3 = BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c3blocked@example.test`).value.toString('utf8'));
      ok(rc3.ok && rc3.submitted === false && recC3.pending === 'register' && SC.fy.length === n0,
        'r5 MAJOR C.3 (--submit blocked by required checkbox, 0 POSTs): agent told submitted:false and later nav keeps pending:register (0 notices)',
        { submitted: rc3.submitted, pending: recC3.pending, notices: SC.fy.length - n0 });

      // (c4) change-password form: 200 {success:false, errors:[...]} that clears fields ⇒ stays pending:change, keeps owner provenance, 0 notices
      const oldPwC4 = pwOf('r5-c4-old');
      SC.logins.addOwn({ origin: SITE, username: 'c4owner@example.test', password: oldPwC4 });
      SC.logins.grant(`web-login:${SITE}#c4owner@example.test`, 'this-account', 'session:conv-1');
      SC.k.navigate(tid, `${SITE}/settings/password`);
      await sleep(25);
      SC.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, noAutoSubmitNet: true, passwordStillFilled: false,
        fields: [
          { fieldId: 'c4-cur', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true },
          { fieldId: 'c4-new', tag: 'input', domType: 'password', type: 'password', autocomplete: 'new-password', visible: true },
        ],
      }, tid);
      const rc4 = await SC.w.fillLogin(TGT, FILL({ user: 'c4owner@example.test', generate: true, submit: true }));
      const recC4Before = BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c4owner@example.test`).value.toString('utf8'));
      SC.k.setResponseBody(tid, 'rq-c4', JSON.stringify({ success: false, errors: ['incorrect_current_password'] }));
      SC.k.emitPageEvent(tid, 'Network.requestWillBeSent', { requestId: 'rq-c4', type: 'Fetch', request: { method: 'POST', url: `${SITE}/api/password`, postData: JSON.stringify({ current: oldPwC4, next: recC4Before.password }) } });
      SC.k.emitPageEvent(tid, 'Network.responseReceived', { requestId: 'rq-c4', type: 'Fetch', response: { status: 200, url: `${SITE}/api/password` } });
      SC.k.emitPageEvent(tid, 'Network.loadingFinished', { requestId: 'rq-c4' });
      await sleep(140);
      const recC4 = BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c4owner@example.test`).value.toString('utf8'));
      const rowC4 = SC.logins.list().entries.find((r) => r.name === `web-login:${SITE}#c4owner@example.test`);
      const vrowC4 = VI.rowOf('secrets', VI.secretRowOf(SC.eng.secretNames().find((s) => s.name === `web-login:${SITE}#c4owner@example.test`)));
      // Also verify second `login` on pending change types pending password, says so in loginText, and stamps lastFilledPassword:'pending'
      SC.k.navigate(tid, `${SITE}/login`);
      await sleep(25);
      SC.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, passwordStillFilled: true,
        fields: [
          { fieldId: 'c4-lu', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
          { fieldId: 'c4-lp', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true },
        ],
      }, tid);
      const rc4Login = await SC.w.fillLogin(TGT, FILL({ user: 'c4owner@example.test' }));
      const recC4AfterFill = BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c4owner@example.test`).value.toString('utf8'));
      const rowC4AfterFill = SC.logins.list().entries.find((r) => r.name === `web-login:${SITE}#c4owner@example.test`);
      ok(rc4.ok && recC4.pending === 'change' && recC4.previous && recC4.previous.password === oldPwC4 && SC.fy.length === n0 &&
        rowC4 && rowC4.pending === 'change' && rowC4.source === 'owner' &&
        vrowC4 && vrowC4.pending === 'change' && VI.stateChipsOf(vrowC4).some((c) => c.id === 'pending-change') &&
        rc4Login.ok && rc4Login.usedPassword === 'pending' && /pending password/.test(BL.loginText(rc4Login)) &&
        recC4AfterFill.lastFilledPassword === 'pending' && rowC4AfterFill.lastFilledPassword === 'pending',
        'r5 MAJOR C.4 + Vault pending/provenance: change-password 200 {success:false} stays pending:change (0 notices), preserves owner source + pending-change chip, and second login reports & stamps usedPassword:pending',
        { pending: recC4.pending, rowC4, usedPassword: rc4Login.usedPassword, lastFilled: rowC4AfterFill && rowC4AfterFill.lastFilledPassword });

      // (c5) sendBeacon (type: 'Ping') + link click control ⇒ stays pending, 0 notices; (c6) positive getRequestPostData 200 {"ok":true} ⇒ confirms!
      SC.k.navigate(tid, `${SITE}/signup5`);
      await sleep(25);
      SC.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, passwordStillFilled: false,
        fields: [
          { fieldId: 'c5-u', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
          { fieldId: 'c5-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'new-password', visible: true },
        ],
      }, tid);
      const rc5 = await SC.w.fillLogin(TGT, FILL({ newUser: 'c5beacon@example.test', generate: true, submit: false }));
      const pwC5 = BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c5beacon@example.test`).value.toString('utf8')).password;
      SC.k.emitPageEvent(tid, 'Network.requestWillBeSent', { requestId: 'rq-ping', type: 'Ping', request: { method: 'POST', url: `${SITE}/beacon`, postData: pwC5 } });
      SC.k.emitPageEvent(tid, 'Network.responseReceived', { requestId: 'rq-ping', type: 'Ping', response: { status: 204, url: `${SITE}/beacon` } });
      SC.k.emitPageEvent(tid, 'Network.loadingFinished', { requestId: 'rq-ping' });
      await sleep(80);
      SC.k.navigate(tid, `${SITE}/about`, { reason: 'anchorClick' });
      await sleep(80);
      const recC5 = BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c5beacon@example.test`).value.toString('utf8'));

      // (c6) Positive control via Network.getRequestPostData (hasPostData:true, no inline postData) + 200 {"ok":true} + cleared password ⇒ confirms!
      SC.k.navigate(tid, `${SITE}/signup6`);
      await sleep(25);
      SC.k.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, passwordStillFilled: false,
        fields: [
          { fieldId: 'c6-u', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
          { fieldId: 'c6-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'new-password', visible: true },
        ],
      }, tid);
      const rc6 = await SC.w.fillLogin(TGT, FILL({ newUser: 'c6ok@example.test', generate: true, submit: false }));
      const pwC6 = BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c6ok@example.test`).value.toString('utf8')).password;
      SC.k.setRequestPostData(tid, 'rq-c6', new URLSearchParams({ user: 'c6ok@example.test', pass: pwC6 }).toString());
      SC.k.setResponseBody(tid, 'rq-c6', JSON.stringify({ ok: true, userId: 'u-6' }));
      SC.k.emitPageEvent(tid, 'Network.requestWillBeSent', { requestId: 'rq-c6', type: 'Fetch', request: { method: 'POST', url: `${SITE}/api/signup`, hasPostData: true } });
      SC.k.emitPageEvent(tid, 'Network.responseReceived', { requestId: 'rq-c6', type: 'Fetch', response: { status: 200, url: `${SITE}/api/signup` } });
      SC.k.emitPageEvent(tid, 'Network.loadingFinished', { requestId: 'rq-c6' });
      const confirmedC6 = await until(() => !BL.recordOf(SC.eng.secretGet(`web-login:${SITE}#c6ok@example.test`).value.toString('utf8')).pending, 1500);
      ok(rc5.ok && recC5.pending === 'register' && rc6.ok && Boolean(confirmedC6) && SC.fy.length === n0 + 1,
        'r5 MAJOR C.5/C.6 (sendBeacon Ping ignored; getRequestPostData credential write + non-error 200 confirms): beacon stays pending while genuine credential POST confirms',
        { beaconPending: recC5.pending, confirmedC6: !!confirmedC6, totalNotices: SC.fy.length - n0 });

      // RED C: mutant where any 2xx POST counts as credential write and JSON {error} bodies are not rejected
      const redCSrc = DSRC0
        .replace('if (cPend && !rq.carriesPending) rq.carriesPending = true;', 'rq.carriesPending = true;')
        .replace('function isJsonErrorBody(raw) {', 'function isJsonErrorBody() { return false;')
        .replace('if (rtype === \'Ping\') return;', '');
      const DmC = redCSrc !== DSRC0 ? MUT.load('src/server/browser-dialogs.js', redCSrc, 'r5-c-any-2xx-confirms') : null;
      const SCm = DmC ? await world({ mode: { standard: true }, Dmod: DmC }) : null;
      let redC1Confirmed = false, redC2Confirmed = false;
      if (SCm) {
        try {
          const tidm = SCm.k.targets()[0].targetId;
          SCm.logins.grant(`web-login:${SITE}#x`, 'any-account', 'session:conv-1');
          SCm.k.setStandardPage({
            securityOrigin: SITE, isoOrigin: SITE, noAutoSubmitNet: true, passwordStillFilled: false,
            fields: [
              { fieldId: 'cm1-u', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
              { fieldId: 'cm1-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'new-password', visible: true },
            ],
          }, tidm);
          await SCm.w.fillLogin(TGT, FILL({ newUser: 'cm1@example.test', generate: true, submit: true }));
          const pwm1 = BL.recordOf(SCm.eng.secretGet(`web-login:${SITE}#cm1@example.test`).value.toString('utf8')).password;
          SCm.k.setResponseBody(tidm, 'rq-cm1', JSON.stringify({ ok: false, error: 'taken' }));
          SCm.k.emitPageEvent(tidm, 'Network.requestWillBeSent', { requestId: 'rq-cm1', type: 'Fetch', request: { method: 'POST', url: `${SITE}/api/signup`, postData: JSON.stringify({ password: pwm1 }) } });
          SCm.k.emitPageEvent(tidm, 'Network.responseReceived', { requestId: 'rq-cm1', type: 'Fetch', response: { status: 200, url: `${SITE}/api/signup` } });
          SCm.k.emitPageEvent(tidm, 'Network.loadingFinished', { requestId: 'rq-cm1' });
          redC1Confirmed = Boolean(await until(() => !BL.recordOf(SCm.eng.secretGet(`web-login:${SITE}#cm1@example.test`).value.toString('utf8')).pending, 800));

          SCm.k.navigate(tidm, `${SITE}/signup2`);
          await sleep(25);
          SCm.k.setStandardPage({
            securityOrigin: SITE, isoOrigin: SITE, passwordStillFilled: true,
            fields: [
              { fieldId: 'cm2-u', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
              { fieldId: 'cm2-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'new-password', visible: true },
            ],
          }, tidm);
          await SCm.w.fillLogin(TGT, FILL({ newUser: 'cm2@example.test', generate: true, submit: false }));
          SCm.k.emitPageEvent(tidm, 'Network.requestWillBeSent', { requestId: 'rq-cm2', type: 'Fetch', request: { method: 'POST', url: `${SITE}/api/email-check`, postData: '{"email":"cm2@example.test"}' } });
          SCm.k.emitPageEvent(tidm, 'Network.responseReceived', { requestId: 'rq-cm2', type: 'Fetch', response: { status: 200, url: `${SITE}/api/email-check` } });
          SCm.k.emitPageEvent(tidm, 'Network.loadingFinished', { requestId: 'rq-cm2' });
          await sleep(40);
          SCm.k.navigate(tidm, `${SITE}/terms`, { reason: 'anchorClick' });
          redC2Confirmed = Boolean(await until(() => !BL.recordOf(SCm.eng.secretGet(`web-login:${SITE}#cm2@example.test`).value.toString('utf8')).pending, 800));
        } finally { await SCm.close(); }
      }
      ok(Boolean(DmC && redC1Confirmed && redC2Confirmed && recC1.pending === 'register' && recC2.pending === 'register'),
        'r5 MAJOR C RED control [r5-c-any-2xx-confirms]: mutant without credential-signature & JSON-error checks falsely confirms both 200 {error} and email-check + link click',
        { redC1Confirmed, redC2Confirmed });
    } finally { await SC.close(); }
  }

  // ── (D) MINOR D: 10-min ceiling keeps fence & files For-you reload notice when wipe frame is unanswered or non-empty (6-byte password) ──
  {
    const runCeilingSwallow = async (DmodToUse) => {
      const dd = path.join(ROOT, 'wd-' + crypto.randomBytes(3).toString('hex')); fs.mkdirSync(dd, { recursive: true });
      const engD = VE.create({ dataDir: dd, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
      await engD.setup('vault-r5-d');
      const grantsD = GS.create({ memory: true });
      const loginsD = L.create({ vault: engD, grants: () => grantsD });
      const pw6 = pw6Of();
      loginsD.addOwn({ origin: SITE, username: 'shortd', password: pw6 });
      grantsD.set('browser-login', `${SITE}#shortd`, { to: [{ kind: 'conversation', key: 'conv-1' }] });
      const kD = await startFakeKernel({ firstUrl: `${SITE}/login`, mode: { standard: true } });
      kD.setStandardPage({
        securityOrigin: SITE, isoOrigin: SITE, swallowWipe: true,
        fields: [{ fieldId: 'vs-d-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }],
      });
      const dFy = [];
      const wD = DmodToUse.create({
        keeper: { cdpEndpointFor: async () => ({ ok: true, url: kD.wsUrl }), onLease: () => () => {} },
        log: quiet, enableTimeoutMs: 300, liveFillMaxMs: 50,
        holdersOf: () => [{ browserKey: KEY, sessionId: 'sess-1', ephemeral: true }],
        leaseCountOf: () => 1, logins: loginsD,
        conversationOf: () => ({ cid: 'conv-1', name: 'Chat One' }),
        forYou: { add: (pid, it) => { dFy.push({ pid, it }); return 'dfy-' + dFy.length; }, resolve() {} },
      });
      try {
        await wD.arm(PID, { budgetMs: 3000 });
        await wD.fillLogin(TGT, FILL({ user: 'shortd' }));
        const shortUnmasked = wD.scrubText(PID, `leak:${pw6}`) === `leak:${pw6}`;
        // Wait past liveFillMaxMs (50 ms) + wipe call timeout (1500 ms) so the unanswered wipe settles
        await until(() => dFy.length > 0 || wD.liveFillVerdictFor(TGT, { verb: 'eval' }).ok === true, 2200);
        const verdictAfter = wD.liveFillVerdictFor(TGT, { verb: 'eval' });
        return { pwBytes: pw6.length, shortUnmasked, verdictAfter, notices: dFy.map((x) => x.it.text) };
      } finally { wD.shutdown(); await kD.close(); engD.close(); }
    };

    const realD = await runCeilingSwallow(D);
    const redDSrc = DSRC0.replace('if (wipedEmpty) {', 'if (true) {');
    const DmD = redDSrc !== DSRC0 ? MUT.load('src/server/browser-dialogs.js', redDSrc, 'r5-d-unconditional-ceiling-lift') : null;
    const redD = DmD ? await runCeilingSwallow(DmD) : null;
    ok(realD.pwBytes === 6 && realD.shortUnmasked === true && realD.verdictAfter.code === 'login_fill_live' &&
      realD.notices.length === 1 && /a filled password could not be cleared on .* — reload it/.test(realD.notices[0]),
      'r5 MINOR D (ceiling fail-closed on 6-byte password): swallowed wipe frame keeps login_fill_live and files For-you reload notice',
      realD);
    ok(Boolean(DmD && redD && redD.verdictAfter.ok === true && realD.verdictAfter.code === 'login_fill_live'),
      'r5 MINOR D RED control [r5-d-unconditional-ceiling-lift]: mutant that ignores wipe outcome lifts liveFill on unanswered wipe (r5 stays fenced)',
      { redVerdict: redD && redD.verdictAfter, realCode: realD.verdictAfter.code });
  }

  // ── (E) MINOR E: opener-less new tab appearing during `wait` never unfences a filled tab (6-byte password) ──
  {
    const runOpenerlessTabProbe = async (DmodToUse) => {
      const SE = await world({ mode: { standard: true }, Dmod: DmodToUse });
      try {
        const tidA = SE.k.targets()[0].targetId;
        const pw6 = pw6Of();
        SE.logins.addOwn({ origin: SITE, username: 'shorte', password: pw6 });
        SE.logins.grant(`web-login:${SITE}#shorte`, 'this-account', 'session:conv-1');
        SE.k.setStandardPage({ securityOrigin: SITE, isoOrigin: SITE, fields: [{ fieldId: 'vs-e-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true }] }, tidA);
        await SE.w.fillLogin(TGT, FILL({ user: 'shorte' }));
        SE.w.verbStarted(KEY, { profileId: PID, verb: 'wait' });
        const tidB = SE.k.addTarget(`${SITE2}/newtab`);
        await until(() => SE.w._watches.get(PID)?.targets.get(tidB)?.enabled, 1500);
        SE.w.verbEnded(KEY, { profileId: PID });
        const evalDefault = SE.w.liveFillVerdictFor(TGT, { verb: 'eval' });
        const evalExplicitA = SE.w.liveFillVerdictFor(TGT, { verb: 'eval', targetId: tidA });
        const evalExplicitB = SE.w.liveFillVerdictFor(TGT, { verb: 'eval', targetId: tidB });
        const evalUnknownSym = SE.w.liveFillVerdictFor(TGT, { verb: 'eval', targetId: 'tab-unknown-symbolic' });
        return { evalDefault, evalExplicitA, evalExplicitB, evalUnknownSym };
      } finally { await SE.close(); }
    };

    const realE = await runOpenerlessTabProbe(D);
    const redESrc = DSRC0.replace(
      'w.targets.set(tid, e);',
      'w.targets.set(tid, e); if (e.seenAt && e.owner && !e.opener) noteActiveTarget(w.profileId, e.owner, tid);'
    );
    const DmE = redESrc !== DSRC0 ? MUT.load('src/server/browser-dialogs.js', redESrc, 'r5-e-track-steals-active-tab') : null;
    const redE = DmE ? await runOpenerlessTabProbe(DmE) : null;
    ok(realE.evalDefault.code === 'login_fill_live' && realE.evalExplicitA.code === 'login_fill_live' &&
      realE.evalExplicitB.ok === true && realE.evalUnknownSym.code === 'login_fill_live',
      'r5 MINOR E (target-scoped CLI fence): opener-less tab born during wait never unfences Tab A; explicit Tab B passes while Tab A and unknown target IDs fail closed',
      realE);
    ok(Boolean(DmE && redE && redE.evalDefault.ok === true && realE.evalDefault.code === 'login_fill_live'),
      'r5 MINOR E RED control [r5-e-track-steals-active-tab]: mutant with noteActiveTarget in track() unfences Tab A when opener-less Tab B appears during wait',
      { redDefault: redE && redE.evalDefault, realDefault: realE.evalDefault.code });
  }

  // ── (F) MINOR F: SPA finish requires credential-carrying write AND counts hidden / Show-password type=text inputs (6-byte password) ──
  {
    const runSpaHiddenFlipProbe = async (DmodToUse) => {
      const SF = await world({ mode: { standard: true }, Dmod: DmodToUse });
      try {
        const tid = SF.k.targets()[0].targetId;
        const pw6 = pw6Of();
        SF.logins.addOwn({ origin: SITE, username: 'shortf@example.test', password: pw6 });
        SF.logins.grant(`web-login:${SITE}#shortf@example.test`, 'this-account', 'session:conv-1');
        SF.k.setStandardPage({
          securityOrigin: SITE, isoOrigin: SITE, passwordStillFilled: false,
          // Simulate a Show-password toggle (type="text") or hidden wizard panel input still holding the 6-byte password
          domInputs: [
            { fieldId: 'vs-f-u', type: 'email', valueLen: 'shortf@example.test'.length, hidden: false },
            { fieldId: 'vs-f-flipped', type: 'text', valueLen: pw6.length, hidden: true },
          ],
          fields: [
            { fieldId: 'vs-f-u', tag: 'input', domType: 'email', type: 'email', autocomplete: 'username', visible: true },
            { fieldId: 'vs-f-p', tag: 'input', domType: 'password', type: 'password', autocomplete: 'current-password', visible: true },
          ],
        }, tid);
        await SF.w.fillLogin(TGT, FILL({ user: 'shortf@example.test' }));
        // 1. Same-origin 2xx analytics POST without credential never lifts even if domInputs were empty
        SF.k.emitPageEvent(tid, 'Network.requestWillBeSent', { requestId: 'rq-f-beacon', type: 'Fetch', request: { method: 'POST', url: `${SITE}/collect`, postData: 'ev=pageview' } });
        SF.k.emitPageEvent(tid, 'Network.responseReceived', { requestId: 'rq-f-beacon', type: 'Fetch', response: { status: 204, url: `${SITE}/collect` } });
        SF.k.emitPageEvent(tid, 'Network.loadingFinished', { requestId: 'rq-f-beacon' });
        await sleep(100);
        const afterBeacon = SF.w.liveFillVerdictFor(TGT, { verb: 'eval' });
        // 2. Credential-carrying 200 POST while Show-password / hidden input still holds 6-byte value
        SF.k.setResponseBody(tid, 'rq-f-cred', JSON.stringify({ step: 2, ok: true }));
        SF.k.emitPageEvent(tid, 'Network.requestWillBeSent', { requestId: 'rq-f-cred', type: 'Fetch', request: { method: 'POST', url: `${SITE}/api/step1`, postData: `pw=${encodeURIComponent(pw6)}` } });
        SF.k.emitPageEvent(tid, 'Network.responseReceived', { requestId: 'rq-f-cred', type: 'Fetch', response: { status: 200, url: `${SITE}/api/step1` } });
        SF.k.emitPageEvent(tid, 'Network.loadingFinished', { requestId: 'rq-f-cred' });
        await sleep(130);
        const afterHiddenFlip = SF.w.liveFillVerdictFor(TGT, { verb: 'eval' });
        return { afterBeacon, afterHiddenFlip };
      } finally { await SF.close(); }
    };

    const realF = await runSpaHiddenFlipProbe(D);
    const redFSrc = DSRC0.replace('const sLens = ${JSON.stringify(secretLens)};', 'const sLens = [];');
    const DmF = redFSrc !== DSRC0 ? MUT.load('src/server/browser-dialogs.js', redFSrc, 'r5-f-visible-pw-only') : null;
    const redF = DmF ? await runSpaHiddenFlipProbe(DmF) : null;
    ok(realF.afterBeacon.code === 'login_fill_live' && realF.afterHiddenFlip.code === 'login_fill_live',
      'r5 MINOR F (SPA finish credential-write + hidden/type=text probe): neither analytics POST nor credential POST with hidden/Show-password input holding 6-byte secret lifts liveFill',
      realF);
    ok(Boolean(DmF && redF && redF.afterHiddenFlip.ok === true && realF.afterHiddenFlip.code === 'login_fill_live'),
      'r5 MINOR F RED control [r5-f-visible-pw-only]: mutant ignoring hidden/type-flipped inputs of secret length lifts liveFill with 6-byte secret still in DOM',
      { redAfterHiddenFlip: redF && redF.afterHiddenFlip, realAfterHiddenFlip: realF.afterHiddenFlip.code });
  }
}

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}${fail ? ' passed' : ''})`);
process.exit(fail ? 1 : 0);
