#!/usr/bin/env node
// THE VAULT'S CONTENTS — the inventory and the reveal window (lane vault-contents-window; src/vault-inventory.js PURE +
// src/server/vault-contents.js + each store's `vaultRows` / `vaultReveal`). Fast tier, in-process: a real engine (cheap
// KDF) on a scratch data dir, the six REAL stores.
//   ① PURE: rowOf keeps NAMED fields only (a raw row's value / ciphertext / anything else leaves nothing); the length class;
//      the ciphertext forms; the reference grammar; kinds; doors per store; search + sort; revealVerdict's table; the pace
//   ② THE REAL STORES — accounts (API key + long-lived token), integrations (a card + a paired machine's row), channels (a
//      consent token, a custom client secret, a webhook caller's secret), mounts (a record + a params map + My storage),
//      app logins (a sealed Secret Service store), passkeys (a private key): a UNIQUE value planted in each; the inventory
//      lists every one and carries NO 4-character piece of any; each reveal answers exactly its own value
//   ③ THE COLLECTOR: no window ⇒ reveal_needs_password; the window is THIS PAGE's (r2: a page secret — the same sign-in
//      without it, or with another, is refused; reveal-end without it ends nothing); a wrong second password ⇒
//      wrong_password (and the unlock's pace); the pace per sign-in + the whole vault's ceiling; a wall clock stepped back
//      cannot stretch a window (the monotonic clock); a mount's masked record (the edit dialog outside the window);
//      the right one ⇒ a 5-minute window for THAT sign-in only; ONE value per reveal; the window ends at 5 min (clock),
//      at a lock (and stays ended after the next unlock), at endReveal; 20 reveals a minute, the 21st paced; LOCKED ⇒ no
//      rows; the audit holds who / entry / ip and never a value or a password
//   ④ TWO-STEP CODES (design q-047 L1, lane vault-totp): a `totp:<name>` entry is ONE row (kind totp, field seed, its name as
//      the label), its doors (the CODE, its own delete, no 换新), no seed and no setting anywhere in the inventory, and its
//      reveal = ONE value: the otpauth link
//   ⑧ (lane vault-window-v2, design q-047 §3): THE PURPOSES — the table pinned (nine + Other, the rail's order), every row of
//      the real stores in EXACTLY ONE purpose, each store's rows where the design puts them; THE PROVENANCE table (one chip
//      per row, the rules in order); the row's two new named fields (origin closed, expiresAt — the accounts' long-lived token
//      says when it stops); the state chips; the window's view (counts per purpose = the group's rows, the provenance filter,
//      只看可显示, the page's own words in the search); the band's items and doors; the use-failure hour; MUTANTS: a row of no
//      purpose (lane vault-totp-add: the channel FAMILY of the kind registry, src/vault-kinds.js, given a category the rail has
//      not) ⇒ RED, a row in two purposes ⇒ RED; the window's band reads For you only and answers through it (pinned)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const VI = require(path.join(REPO, 'src/vault-inventory.js'));

console.log('① PURE — src/vault-inventory.js');
{
  const raw = { entry: 'acct-1', field: 'key', kind: 'api-key', label: 'Work', detail: 'claude', createdAt: 5, cipher: 'aaaabbbbccccdddd:eeeeffffgggghhhhiiiijj==.QUJD', value: 'PLANTED-VALUE', plain: 'PLANTED', secret: 'PLANTED', token: 'PLANTED', bytes: undefined };
  const row = VI.rowOf('accounts', raw, { lastUsed: { at: 9, by: 'human' } });
  ok(JSON.stringify(Object.keys(row)) === JSON.stringify(['id', 'store', 'entry', 'field', 'kind', 'label', 'detail', 'createdAt', 'rotatedAt', 'lastUsed', 'size', 'doors', 'revealable', 'origin', 'expiresAt', 'provenance', 'hosts', 'askedBy']), 'rowOf: the row is exactly its NAMED fields (never a spread; + origin/expiresAt (v2) and provenance for an agent entry, null otherwise; + hosts / askedBy — lane vault-use-grants: a request-made entry)', Object.keys(row));
  ok(!/PLANTED|QUJD|aaaabbbb/.test(JSON.stringify(row)), 'rowOf: a raw row\'s value, plaintext, secret, token and ciphertext leave nothing in the row', row);
  ok(VI.STORE_IDS.join() === require(path.join(REPO, 'src/server/vault-engine.js')).STORE_KEYS.map((k) => k.store).sort((a, b) => VI.STORE_IDS.indexOf(a) - VI.STORE_IDS.indexOf(b)).join() && VI.STORE_IDS.length === 6, 'the stores are the vault engine\'s six (one key each)');
  ok(row.id === 'accounts:acct-1#key' && row.lastUsed.by === 'human' && row.lastUsed.at === 9, 'the id is <store>:<entry>#<field>; lastUsed { at, by }');
  ok(VI.rowOf('nope', raw) === null && VI.rowOf('accounts', { ...raw, entry: 'a#b' }) === null && VI.rowOf('accounts', { ...raw, field: 'k y' }) === null, 'an unknown store, a # in the entry, a space in the field ⇒ no row');
  ok([[0, 'short'], [16, 'short'], [17, 'medium'], [64, 'medium'], [65, 'long'], [512, 'long'], [513, 'very long'], [-1, 'unknown'], ['x', 'unknown']].every(([n, c]) => VI.sizeClassOf(n) === c) && VI.SIZE_CLASSES.length === 5, 'the length class: ≤16 short · ≤64 medium · ≤512 long · else very long');
  const SB = require(path.join(REPO, 'src/secret-box.js'));
  const k = crypto.randomBytes(32);
  const sb = SB.encWith(k, 'x'.repeat(40));
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv), ct = Buffer.concat([c.update('y'.repeat(70)), c.final()]);
  const hex = iv.toString('hex') + ':' + c.getAuthTag().toString('hex') + ':' + ct.toString('hex');
  const PS = require(path.join(REPO, 'src/browser-passkey-store.js'));
  const pk = PS.cipherOf(crypto, k).seal('z'.repeat(600));
  ok(VI.plainBytesOf(sb) === 40 && VI.plainBytesOf(hex) === 70 && VI.plainBytesOf(pk) === 600 && VI.plainBytesOf('nope') === null, 'the plaintext length off each ciphertext form (secret-box 40 · accounts hex 70 · passkey v1 600 · unknown null)', [VI.plainBytesOf(sb), VI.plainBytesOf(hex), VI.plainBytesOf(pk)]);
  ok(VI.parseRef('integrations:cloud:browserless#apiKey').entry === 'cloud:browserless' && VI.parseRef('integrations:remote:rdp/host-1#password').entry === 'remote:rdp/host-1' && VI.parseRef('channels:webhook#caller.inbox.c-0a1b.token').field === 'caller.inbox.c-0a1b.token', 'parseRef: an entry may hold : and / (an integration id, a machine row)');
  ok([null, '', 'accounts', 'accounts:#key', 'accounts:x#', 'zz:x#y', 'accounts:x\n#y', 'accounts:' + 'x'.repeat(500) + '#k', 'accounts:x#y z'].every((s) => VI.parseRef(s) === null), 'parseRef refuses an empty part, an unknown store, a control character, a 500-char entry, a space in the field');
  ok(VI.kindOfField('apiKey') === 'api-key' && VI.kindOfField('clientSecret') === 'client-secret' && VI.kindOfField('pass') === 'password' && VI.kindOfField('sessionToken') === 'session-token' && VI.kindOfField('bearerToken') === 'token' && VI.kindOfField('secretKey') === 'secret-key' && VI.kindOfField('privateKey') === 'private-key' && VI.kindOfField('zz') === 'secret', 'kindOfField over the stores\' field names');
  const D = (store, entry, field) => VI.doorsOf({ store, entry, field });
  ok(D('accounts', 'a1', 'key').delete.path === '/api/accounts/a1' && D('accounts', 'a1', 'oat').delete.path === '/api/accounts/a1/oat' && D('mounts', 'm1', 'secretKey').delete.path === '/api/mounts/m1' && D('mounts', 'my-storage', 'secretKey').delete === null, 'doors: accounts (the account / its token), mounts (My storage has none — provisioned)');
  ok(D('integrations', 'cloud:browserless', 'apiKey').delete.path === '/api/integrations/cloud%3Abrowserless' && D('integrations', 'cloud:browserless', 'apiKey').rotate.open === 'integration' && D('integrations', 'remote:rdp/h1', 'password').delete === null, 'doors: an integration card clears + opens its card; a machine row has none here');
  ok(D('channels', 'acct-1', 'token').rotate.open === 'channel-reauth' && D('channels', 'acct-1', 'token').delete.open === 'channel-remove' && D('channels', 'webhook', 'caller.x.c-1.token').delete === null, 'doors: a channel account re-authorizes / removes through its own dialogs; a caller has none here');
  ok(D('passkeys', 'bp-1/AbCdEfGhIj', 'privateKey').delete.path === '/api/browser/passkeys/bp-1/AbCdEfGhIj' && D('app-secrets', 'gimp', 'item.0.1').delete.path === '/api/desktop/apps/gimp/secrets/forget', 'doors: a passkey, an app\'s logins');
  const rows = [VI.rowOf('mounts', { entry: 'm', field: 'secretKey', label: 'Zed', createdAt: 1 }), VI.rowOf('accounts', { entry: 'b', field: 'key', label: 'Beta', createdAt: 3 }, { lastUsed: { at: 1 } }), VI.rowOf('accounts', { entry: 'a', field: 'oat', kind: 'oauth-token', label: 'Alpha', createdAt: 2 }, { lastUsed: { at: 5 } })];
  ok(VI.sortRows(rows, 'name').map((r) => r.label).join() === 'Alpha,Beta,Zed' && VI.sortRows(rows, 'created').map((r) => r.label).join() === 'Beta,Alpha,Zed' && VI.sortRows(rows, 'used').map((r) => r.label).join() === 'Alpha,Beta,Zed', 'sort inside the store groups: name · newest · recently used (stores stay in their order)');
  ok(VI.searchRows(rows, 'alpha oauth').map((r) => r.label).join() === 'Alpha' && VI.searchRows(rows, 'storage').map((r) => r.label).join() === 'Zed' && VI.searchRows(rows, '').length === 3, 'search: every word over label, kind words, store label');
  const V = (o) => VI.revealVerdict({ state: 'unlocked', epoch: 2, now: 1000, ...o });
  const w = { startedAt: 1000, until: 1000 + VI.REVEAL_MS, epoch: 2 };
  ok(VI.revealVerdict({ state: 'not_set_up' }).code === 'vault_not_set_up' && VI.revealVerdict({ state: 'locked', revealWindow: w, epoch: 2 }).code === 'vault_locked', 'revealVerdict: not set up / locked first');
  ok(V({}).code === 'reveal_needs_password' && V({ revealWindow: { ...w, epoch: 1 } }).code === 'reveal_needs_password', 'no window, or a window of another epoch (a lock came between) ⇒ reveal_needs_password');
  ok(V({ revealWindow: w }).ok && V({ revealWindow: w }).leftMs === VI.REVEAL_MS && V({ revealWindow: w, now: 1000 + VI.REVEAL_MS }).expired === true && V({ revealWindow: { ...w, until: 1000 + VI.REVEAL_MS + 1 } }).ok === false, 'inside ⇒ ok with leftMs; at 5:00 ⇒ expired; a window longer than 5 min is refused');
  ok(VI.REVEAL_MS === 300000 && VI.REVEAL_PACE_MAX === 20 && VI.CLIPBOARD_CLEAR_MS === 30000, 'the numbers: 5 min · 20 a minute · the clipboard cleared after 30 s');
  const st = Array.from({ length: 19 }, (_, i) => i * 1000);
  ok(VI.paceVerdict(st, 30000).ok && VI.paceVerdict([...st, 19000], 30000).code === 'paced' && VI.paceVerdict([...st, 19000], 60001).ok, 'the pace: 19 in the minute ⇒ ok · 20 ⇒ paced · a minute later ⇒ ok');
  ok(VI.countdownText(300000) === '5:00' && VI.countdownText(61000) === '1:01' && VI.countdownText(-5) === '0:00', 'the countdown chip text');
}

console.log('①b THE PAGE\'S XSS RULE — src/lib/vault-window.js');
{
  const acorn = require('acorn');
  const src = fs.readFileSync(path.join(REPO, 'src/lib/vault-window.js'), 'utf8');
  const toks = [...acorn.tokenizer(src, { ecmaVersion: 'latest', sourceType: 'module' })];   // tokens: comments never count
  const names = toks.filter((t) => t.type.label === 'name').map((t) => t.value);
  ok(!names.some((n) => ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'write', 'writeln', 'srcdoc', 'createContextualFragment'].includes(n)), 'the window module names no HTML sink (innerHTML / outerHTML / insertAdjacentHTML / document.write / srcdoc / a parsed fragment) — a value can only go in as text');
  const valueSinks = [...src.matchAll(/([\w.]+)\.value = ([^;\n]+)/g)].map((m) => `${m[1]} = ${m[2].trim()}`);
  const fromAnswer = valueSinks.filter((x) => /\br\.value\b/.test(x));
  ok(fromAnswer.length === 1 && fromAnswer[0] === 'x.plain = r.value' && valueSinks.filter((x) => !/^x\.plain = /.test(x)).every((x) => /= ('')|= k$/.test(x)), 'a revealed value has ONE sink — its row field\'s `.value`; every other `.value =` is a clear or an option key', valueSinks);
  ok(!/sessionStorage|localStorage|indexedDB|postMessage|BroadcastChannel|\.send\(/.test(src), 'nothing of the page stores or forwards a value (no storage, no message, no socket send)');
  // lane vault-window-v2: NO GREYED CONTROL — a door the row has not is not drawn (design q-047 §3.3); a planted `disabled` is caught
  const greyed = (s) => /\.disabled\s*=\s*(?!false\b)|setAttribute\(\s*'disabled'/.test(s);
  ok(!greyed(src) && greyed(src + "\nb.disabled = true;") && greyed(src + "\nb.setAttribute('disabled', '');"), 'no greyed control in the window: nothing sets `disabled` (CONTROL: a planted `.disabled = true` / setAttribute(\'disabled\') is caught)');
  // the 「需要你」 band is For you's view, never a second queue: its items come from the inbox model's store and its answers go
  // through the model's own verbs (runAction / setStatus) — a band that kept its own list is caught
  const bandFrom = /const \{ items, total \} = bandItemsOf\(\(inbox\.todos && inbox\.todos\.open\) \|\| \[\]\);/;
  const bandAnswers = /await inbox\.runAction\(item, door\)/.test(src) && /await inbox\.setStatus\(item\.id, 'done'\)/.test(src);
  const ownList = (s) => /(?:bandItems|bandQueue|bandState)\s*(?:=|\.push)/.test(s);
  ok(bandFrom.test(src) && bandAnswers && !ownList(src) && ownList(src + '\nst.bandItems = [];'), 'the band reads For you\'s open items (inboxModel) and answers through its verbs — no list of its own (CONTROL: a planted own list is caught)');
  // the reveal's reason is the 显示 button's help, never a sentence beside the value (the owner's confusion note 2026-10-20)
  ok(!/vw-ak-why/.test(src) && /title: showHelp\(row\)/.test(src) && /Only to hand it to an outside system|only to hand it to an outside system/.test(src), 'the automation key\'s why is its 「显示」\'s help (title) — the free-floating vw-ak-why line is gone');
}

console.log('② THE REAL STORES — a unique value planted in each');
const ROOT = scratch('vault-inventory');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const d = path.join(ROOT, 'data'); fs.mkdirSync(d);
const quiet = { log() {}, warn() {}, error() {}, info() {} };
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const SB = require(path.join(REPO, 'src/secret-box.js'));
let clock = Date.parse('2026-10-19T12:00:00Z');
const eng = VE.create({ dataDir: d, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => clock });
const PW = 'inventory second password';
ok((await eng.setup(PW)).ok && eng.state() === 'unlocked', 'a real vault, set up (unlocked)');
const RAND = [];
const P = (tag) => { const r = crypto.randomBytes(16).toString('hex'); RAND.push(r); return `PLANT-${tag}-${r}`; };
const PL = {
  accKey: 'sk-ant-api03-' + P('acc'), accOat: 'sk-ant-oat01-' + P('oat').replace(/[^\w-]/g, '') + 'x'.repeat(24),
  intKey: P('int'), intMachine: P('machine'), chToken: P('chtok'), chSecret: P('chsec'), whSecret: P('whsec'),
  mSecret: P('m3'), mParam: P('mparam'), myStorage: P('mys'), app: P('applogin'), pk: P('pkcs8'),
  hostTok: 'vsht_' + P('host'), frpTok: P('frp'), fileKey: P('filekey'), dsUser: P('dsuser'), dsPw: P('dspw'),   // int317: the engine's own entries + a desktop sign-in
};
// int317: the engine's OWN secret entries (r2: a machine's link token, the relay token, a sealed file's key), sealed at `clock`
ok(eng.secretPut('host:dial-dev9', PL.hostTok).ok && eng.secretPut('frp:token', PL.frpTok).ok && eng.secretPut('file:dropline-oauth.json', PL.fileKey).ok, 'int317: three secret entries sealed (host / frp / file)');
const MACHINES = { 'dial-dev9': 'Studio Mac', 'host-9': 'Office Mac' };
const machineName = (k) => MACHINES[k] || k;   // the wiring's vaultMachineName over hosts
// accounts
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const acc = new AccountManager({ dataDir: d });
const a1 = acc.add({ name: 'Work key', key: PL.accKey });
const sub = acc.createSubscription({ name: 'Sub' });
acc.setOat(sub.id, PL.accOat);
// integrations (a card and a paired machine's record)
const IS = require(path.join(REPO, 'src/server/integration-store.js'));
const R = require(path.join(REPO, 'src/integration-registry.js'));
const is = IS.create({ dataDir: d, env: {}, now: () => clock, broadcast: () => {}, log: quiet });
is.setIntegration('cloud:browserless', { apiKey: PL.intKey, apiUrl: 'https://chrome.example.net' });
const machineRow = R.ROWS.find((r) => r.bindsPerMachine === true);
const mSecretField = machineRow && machineRow.fields.find((f) => f.secret);
if (machineRow && mSecretField) is.setMachineValues(machineRow.id, 'host-7', { [mSecretField.key]: PL.intMachine });
is.setMachineValues('desktop-signin', 'host-9', { auth: 'ard', username: PL.dsUser, password: PL.dsPw });   // int317: a remembered Mac sign-in
// channels (a consent token, a custom client secret, a webhook caller's secret)
const chBox = SB.secretBox(path.join(d, '.channels-key'), { hasCiphertext: () => false });
fs.mkdirSync(path.join(d, 'channels', 'webhook'), { recursive: true });
fs.writeFileSync(path.join(d, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [
  { id: 'acct-lark', kind: 'lark', label: 'Lark (work)', enabled: true, auth: { tokenEnc: chBox.enc(JSON.stringify({ access_token: PL.chToken, refresh_token: 'r' })), expiresAt: null, scopes: [], updatedAt: clock }, credential: { appId: 'cli_x', appSecretEnc: chBox.enc(PL.chSecret) } },
  { id: 'webhook', kind: 'webhook', label: 'Webhook', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: ['local'] } },
] }));
fs.writeFileSync(path.join(d, 'channels', 'webhook', 'callers.json'), JSON.stringify({ v: 1, paths: { inbox: { title: 'inbox', callers: [{ id: 'c-0a1b2c3d', name: 'CI bot', kind: 'system', auth: 'hmac', tokenEnc: chBox.enc(PL.whSecret), createdAt: clock }] } } }));
const CE = require(path.join(REPO, 'src/server/channels-engine.js'));
const ce = CE.create({ dataDir: d, env: {}, broadcast() {}, userTodos: null, deliver: null, serverSetting: () => undefined, log: quiet });
// mounts (a record with a secret key and a params map, and My storage)
const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
const mm = new MountManager({ dataDir: d, broadcast: () => {}, getSetting: () => undefined });
mm._state.mounts.push({ id: 'mnt1', name: 'Team bucket', type: 's3', endpoint: 'https://s3.example.invalid', bucket: 'b', accessKey: 'AK', secretKeyEnc: mm._enc(PL.mSecret), paramsEnc: { client_secret: mm._enc(PL.mParam) }, createdAt: clock });
mm._save();
mm.setMyStorageConfig({ endpoint: 'https://s3.example.invalid', bucket: 'mine', accessKey: 'AK2', secretKey: PL.myStorage });
// app logins (one app's sealed Secret Service store, sealed the way src/app-secrets-seal.js seals it)
const AS = require(path.join(REPO, 'src/app-secrets.js'));
const DA = require(path.join(REPO, 'src/desktop-apps.js'));
{
  const m = AS.appSecretsMaster({ dataDir: d }).master;
  const key = crypto.hkdfSync('sha256', m, Buffer.from('gimp', 'utf8'), Buffer.from('vibespace app-secrets v1', 'utf8'), 32);
  const items = [{ label: 'GIMP cloud login', attributes: { user: 'me' }, secret: Buffer.from(PL.app).toString('base64'), content_type: 'text/plain', created: 1760000000, modified: 1760000000 }];
  fs.mkdirSync(path.join(d, 'desktop-apps', 'gimp', 'portal'), { recursive: true });
  fs.writeFileSync(path.join(d, 'desktop-apps', 'gimp', 'portal', DA.SECRETS_STORE_FILE), JSON.stringify({ v: 1, n: 1, sealed: SB.encWith(Buffer.from(key), JSON.stringify(items)) }));
  m.fill(0);
}
// passkeys (the dialog watch's store over the wiring's own reader shape)
const PS = require(path.join(REPO, 'src/browser-passkey-store.js'));
const pkFile = path.join(d, 'browser-passkeys.json'), pkKey = path.join(d, 'browser-passkeys.key');
const passkeys = {
  read: () => { try { return JSON.parse(fs.readFileSync(pkFile, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
  write: (o) => fs.writeFileSync(pkFile, JSON.stringify(o), { mode: 0o600 }),
  cipher: (() => { const op = (fn) => { const k = SB.lawfulKey(pkKey, { raw: true, hasCiphertext: () => fs.existsSync(pkFile) }); if (!k.ok) return { ok: false, code: k.code }; try { return fn(PS.cipherOf(crypto, k.key)); } finally { k.key.fill(0); } }; return { seal: (t) => op((c) => c.seal(t)), open: (t) => op((c) => c.open(t)) }; })(),
};
const cid = crypto.randomBytes(24).toString('base64url');
passkeys.write(PS.withRow(PS.normalizeStore(null), 'bp-1', PS.normalizeRow({ credentialId: cid, rpId: 'github.com', userHandle: 'aGFuZGxl', userName: 'alice', displayName: 'Alice', keySealed: passkeys.cipher.seal(PL.pk), signCount: 1, policy: 'yes', createdBy: 'human', createdAt: clock })));
const BD = require(path.join(REPO, 'src/server/browser-dialogs.js'));
const D = BD.create({ keeper: { profile: () => ({ id: 'bp-1' }), cdpEndpointFor: async () => ({ ok: false }), onLease: () => () => {} }, log: quiet, now: () => clock, passkeys, forYou: { add: () => null, resolve() {} } });

// design q-046 (lane automation-keys-core): «Automation keys» — the REAL engine over this vault, one key minted (its value
// lives in the vault only — the inventory lists its name and date)
const AE = require(path.join(REPO, 'src/server/automation-engine.js')).create({ dataDir: d, vault: eng, now: () => clock });
const akMint = AE.mint({ name: 'Lane dispatch', scopes: ['conversations.rename'] });
const akValue = eng.secretGet(`apikey:${akMint.key.id}`).value.toString();
const sources = {
  automation: () => AE,
  accounts: () => acc, integrations: () => ({ vaultRows: () => is.vaultRows({ machineName }), vaultReveal: (e, f) => is.vaultReveal(e, f) }), channels: () => ce, mounts: () => mm,
  secrets: () => VC.secretSource({ vault: eng, machineName }),   // int317: «Hub secrets» as the wiring hands it
  'app-secrets': () => ({ vaultRows: () => AS.appSecretRows({ dataDir: d }), vaultReveal: (e, f) => AS.appSecretReveal({ dataDir: d }, e, f) }),
  passkeys: () => ({ vaultRows: () => D.passkeyVaultRows(), vaultReveal: (e, f) => D.passkeyVaultReveal(e, f) }),
};
const VC = require(path.join(REPO, 'src/server/vault-contents.js'));
let mono = 1e6;
const vc = VC.create({ vault: eng, sources, now: () => clock, mono: () => mono });
const inv = vc.list();
const text = JSON.stringify(inv);
const byStore = (s) => inv.rows.filter((r) => r.store === s);
ok(inv.ok && inv.state === 'unlocked' && inv.stores.length === 8 && inv.stores.every((s) => !s.error && !s.missing), 'the inventory reads all six stores + Automation keys + Hub secrets (none missing, none unreadable)', inv.stores);
{ // design q-046: «Automation keys» — one row per live key: its NAME, revealable (only to hand to an outside party), never its value
  const ak = inv.rows.filter((r) => r.store === 'automation');
  ok(akMint.ok && ak.length === 1 && ak[0].entry === `apikey:${akMint.key.id}` && ak[0].label === 'Lane dispatch' && ak[0].kind === 'api-key' && ak[0].revealable === true && ak[0].detail === 'Only to hand to an outside party' && !ak[0].doors.delete,
    'Automation keys: the key\'s name, revealable (the row says why: only to hand to an outside party), no store door (the section\'s own 撤销)', ak);
  ok(!inv.rows.some((r) => r.store === 'secrets' && /apikey:/.test(r.entry)) && !text.includes(akValue), 'its entry is not a «Hub secrets» row, and its value is nowhere in the inventory');
}
ok(byStore('accounts').map((r) => r.field).sort().join() === 'key,oat', 'accounts: the API key and the long-lived token', byStore('accounts'));
{ const oat = byStore('accounts').find((r) => r.field === 'oat') || {};   // lane vault-one-door (the owner: 「最好标记一下是 long term oauth 防止误会」)
  ok(oat.kind === 'long-lived-oauth-token' && VI.KIND_WORDS[oat.kind] === 'Long-lived OAuth token' && /setup-token/.test(oat.detail || '') && VI.KIND_WORDS['oauth-token'] === 'OAuth token', 'an account\'s setup-token row is a LONG-LIVED OAuth token in words (its detail names setup-token); a mount\'s / a channel\'s OAuth sign-in keeps "OAuth token"', oat); }
ok(byStore('integrations').some((r) => r.entry === 'cloud:browserless' && r.field === 'apiKey') && (!machineRow || byStore('integrations').some((r) => r.entry === `${machineRow.id}/host-7` && r.field === mSecretField.key)), 'integrations: a card\'s secret field and a paired machine\'s row', byStore('integrations').map((r) => r.id));
ok(['channels:acct-lark#token', 'channels:acct-lark#appSecret', 'channels:webhook#caller.inbox.c-0a1b2c3d.token'].every((id) => byStore('channels').some((r) => r.id === id)), 'channels: the consent token, the custom client secret, the webhook caller\'s secret', byStore('channels').map((r) => r.id));
ok(['mounts:mnt1#secretKey', 'mounts:mnt1#params.client_secret', 'mounts:my-storage#secretKey'].every((id) => byStore('mounts').some((r) => r.id === id)), 'mounts: a record\'s secret key, its params map, My storage', byStore('mounts').map((r) => r.id));
ok(byStore('app-secrets').length === 1 && byStore('app-secrets')[0].label === 'GIMP cloud login' && byStore('app-secrets')[0].kind === 'login', 'app logins: one row per stored item, labelled', byStore('app-secrets'));
ok(byStore('passkeys').length === 1 && byStore('passkeys')[0].label === 'github.com · alice' && byStore('passkeys')[0].kind === 'private-key', 'passkeys: the private key, by site and user', byStore('passkeys'));
const pieces = (v) => { const out = []; for (let i = 0; i + 8 <= v.length; i += 1) out.push(v.slice(i, i + 8)); return out; };
const leaks = RAND.filter((r) => pieces(r).some((p) => text.includes(p)));
ok(RAND.length === Object.keys(PL).length && leaks.length === 0 && !Object.values(PL).some((v) => text.includes(v)), `THE INVENTORY CARRIES NO VALUE: neither any of the ${Object.keys(PL).length} planted values nor any 8-character piece of their random parts appears in the whole answer`, leaks);
ok(inv.rows.every((r) => VI.SIZE_CLASSES.includes(r.size) && (r.store === 'secrets' ? r.size === 'unknown' : r.size !== 'unknown')), 'every store row has a length class (never a length, never a tail); a hub secret not even that (names and dates only)', inv.rows.map((r) => r.size));
{ // int317 — «Hub secrets» and the desktop sign-in rows
  const hs = byStore('secrets'), at = (id) => hs.find((r) => r.id === id);
  ok(hs.map((r) => r.id).sort().join() === 'secrets:file:dropline-oauth.json#key,secrets:frp:token#token,secrets:host:dial-dev9#token', 'Hub secrets: one row per engine entry — the link token, the relay token, the sealed file\'s key', hs.map((r) => r.id));
  ok(at('secrets:host:dial-dev9#token').label === 'Machine link token · Studio Mac' && at('secrets:frp:token#token').label === 'Relay token' && at('secrets:file:dropline-oauth.json#key').label === 'Sealed file key · dropline-oauth.json', 'Hub secrets: the NAMES — a link token by its machine\'s name, the relay token, a file by its name', hs.map((r) => r.label));
  ok(hs.every((r) => r.createdAt === clock && r.size === 'unknown' && !r.doors.delete && !r.doors.rotate), 'Hub secrets: the DATE each was sealed, no length class, no door here (the machine card / the plugin card own them)', hs);
  ok(at('secrets:host:dial-dev9#token').revealable === false && at('secrets:file:dropline-oauth.json#key').revealable === false && at('secrets:frp:token#token').revealable === true && inv.rows.filter((r) => r.store !== 'secrets').every((r) => r.revealable === true), 'NEVER SHOWN: a link token (it runs commands on its machine) and a file key; the relay token and every store row may be shown', hs.map((r) => [r.id, r.revealable]));
  const ds = byStore('integrations').filter((r) => r.entry === 'desktop-signin/host-9');
  ok(ds.length === 1 && ds[0].field === 'password' && ds[0].label === 'Desktop sign-in · Office Mac' && ds[0].detail === 'Screen Sharing: name + password', 'a desktop sign-in: ONE row — the machine\'s name and the kind; the user name is no row', ds);
  ok(!text.includes('Office Mac') || !text.includes(PL.dsUser), 'the user name appears nowhere in the inventory');
}
ok(byStore('accounts').every((r) => r.lastUsed && r.lastUsed.by === 'system'), 'lastUsed: the store key\'s last use (the store\'s own reads ⇒ by system)', byStore('accounts').map((r) => r.lastUsed));

console.log('③ THE COLLECTOR — the reveal window (THIS page\'s)');
const AUDIT = path.join(d, VE.AUDIT_FILE);
const r0 = vc.reveal('me', null, 'accounts:' + a1.id + '#key', { ip: '10.0.0.5' });
ok(!r0.ok && r0.code === 'reveal_needs_password' && !JSON.stringify(r0).includes(PL.accKey), 'no window ⇒ reveal_needs_password (nothing revealed)', r0);
const w0 = await vc.startReveal('me', 'not the second password', { ip: '10.0.0.5' });
ok(!w0.ok && w0.code === 'wrong_password' && w0.failedTries === 1 && !w0.page, 'a wrong second password ⇒ wrong_password (counted with the unlock\'s tries), no page secret', w0);
const w1 = await vc.startReveal('me', PW, { ip: '10.0.0.5' });
const PAGE = w1.page;
ok(w1.ok && w1.leftMs === 300000 && VI.PAGE_RE.test(PAGE) && eng.facts().failedTries === 0, 'the right one ⇒ a 5-minute window and THIS page\'s secret (32 hex)', w1);
ok(vc.reveal('me', null, 'mounts:mnt1#secretKey').code === 'reveal_needs_password' && vc.reveal('me', 'f'.repeat(32), 'mounts:mnt1#secretKey').code === 'reveal_needs_password' && vc.reveal('me', PAGE.toUpperCase(), 'mounts:mnt1#secretKey').code === 'reveal_needs_password', 'THE SAME SIGN-IN without the page secret (none / another / a malformed one) ⇒ reveal_needs_password — a second tab asks again');
ok(vc.reveal('other', PAGE, 'mounts:mnt1#secretKey').code === 'reveal_needs_password', 'the page secret under another sign-in ⇒ reveal_needs_password (the key is the pair)');
const want = {
  ['accounts:' + a1.id + '#key']: PL.accKey, ['accounts:' + sub.id + '#oat']: PL.accOat, 'integrations:cloud:browserless#apiKey': PL.intKey,
  'channels:acct-lark#appSecret': PL.chSecret, 'channels:webhook#caller.inbox.c-0a1b2c3d.token': PL.whSecret, 'mounts:mnt1#secretKey': PL.mSecret,
  'mounts:mnt1#params.client_secret': PL.mParam, 'mounts:my-storage#secretKey': PL.myStorage, [byStore('app-secrets')[0].id]: PL.app, [byStore('passkeys')[0].id]: PL.pk,
};
if (machineRow) want[`integrations:${machineRow.id}/host-7#${mSecretField.key}`] = PL.intMachine;
const got = {};
for (const id of Object.keys(want)) got[id] = vc.reveal('me', PAGE, id, { ip: '10.0.0.5' });
const wrong = Object.entries(want).filter(([id, v]) => !(got[id].ok && got[id].value === v));
ok(wrong.length === 0, `each reveal answers exactly its own value (${Object.keys(want).length} rows across the six stores)`, wrong.map(([id]) => [id, got[id].code]));
const tok = vc.reveal('me', PAGE, 'channels:acct-lark#token', { ip: '10.0.0.5' });
ok(tok.ok && JSON.parse(tok.value).access_token === PL.chToken, 'a consent token reveals as its JSON (access + refresh)');
const allPlants = Object.values(PL);
const one = (ans) => allPlants.filter((v) => JSON.stringify(ans).includes(v)).length;
ok(Object.values(got).every((x) => one(x) === 1) && Object.keys(got[Object.keys(want)[0]]).sort().join() === 'id,leftMs,ok,value', 'ONE VALUE per answer: { ok, id, value, leftMs } — never a list, never a second planted value');
ok(vc.reveal('me', PAGE, 'mounts:nope#secretKey').code === 'not_found' && vc.reveal('me', PAGE, 'mounts:mnt1#bogus').code === 'not_found' && vc.reveal('me', PAGE, 'zz').code === 'not_found', 'an unknown row / field / reference ⇒ not_found');
// the pace: 20 a minute for ONE sign-in — another sign-in's own window is not starved by it; 60 for the whole vault
let n = 0; while (vc.reveal('me', PAGE, 'mounts:mnt1#secretKey').ok) n++;
const paced = vc.reveal('me', PAGE, 'mounts:mnt1#secretKey');
ok(paced.code === 'paced' && paced.retryInMs > 0, `the pace: ${VI.REVEAL_PACE_MAX} reveals a minute for one sign-in, the next one paced`, paced);
const wo = await vc.startReveal('other', PW);
ok(wo.ok && vc.reveal('other', wo.page, 'mounts:mnt1#secretKey').ok, 'ANOTHER sign-in\'s window still answers (verify r1: one sign-in no longer starves the owner\'s)');
const pagesC = [];
for (const w of ['c1', 'c2', 'c3']) pagesC.push([w, (await vc.startReveal(w, PW)).page]);
let ceil = 0, ceilAns = null;
for (let i = 0; i < 80 && !ceilAns; i++) { const [w, p] = pagesC[i % 3]; const r = vc.reveal(w, p, 'mounts:mnt1#secretKey'); if (r.ok) ceil++; else ceilAns = r; }
ok(ceilAns && ceilAns.code === 'paced' && ceil + 21 === VI.REVEAL_PACE_CEILING, `the whole vault's ceiling: ${VI.REVEAL_PACE_CEILING} a minute across every sign-in (${ceil} more after the 21 already answered)`, { ceil, ceilAns });
clock += 61e3; mono += 61e3;
ok(vc.reveal('me', PAGE, 'mounts:mnt1#secretKey').ok, 'a minute later ⇒ answered again (the window still open: 1 min in)');
clock += 4 * 60e3 - 2e3; mono += 4 * 60e3 - 2e3;
ok(vc.reveal('me', PAGE, 'mounts:mnt1#secretKey').ok && vc.windowFacts('me', PAGE).leftMs === 1000, '4:59 in ⇒ still open (1 s left)', vc.windowFacts('me', PAGE));
clock += 1000; mono += 1000;
const exp = vc.reveal('me', PAGE, 'mounts:mnt1#secretKey');
ok(exp.code === 'reveal_needs_password' && !vc.windowFacts('me', PAGE).open, 'AT 5:00 the window is over ⇒ reveal_needs_password (fixed: activity never extended it)', exp);
// a wall clock stepped back cannot stretch a window (the monotonic clock bounds it)
const ws = await vc.startReveal('me', PW);
clock += 4 * 60e3; mono += 4 * 60e3;
clock -= 4 * 60e3;   // the wall clock steps BACK 4 minutes; the monotonic one does not
ok(vc.reveal('me', ws.page, 'mounts:mnt1#secretKey').ok && vc.windowFacts('me', ws.page).leftMs <= 60e3, 'a wall clock stepped back 4 min: the time left is the monotonic clock\'s (≤ 1 min), not 5 min again', vc.windowFacts('me', ws.page));
mono += 60e3;
ok(vc.reveal('me', ws.page, 'mounts:mnt1#secretKey').code === 'reveal_needs_password', '… and the window ends at 5 monotonic minutes whatever the wall clock says');
clock += 4 * 60e3;
const w2 = await vc.startReveal('me', PW);
ok(w2.ok && vc.reveal('me', w2.page, 'mounts:mnt1#secretKey').ok, 'the second password again ⇒ a new window (a new page secret)');
eng.lock();
ok(vc.reveal('me', w2.page, 'mounts:mnt1#secretKey').code === 'vault_locked' && vc.list().rows.length === 0, 'LOCKED ⇒ vault_locked, and the inventory lists nothing');
ok((await vc.startReveal('me', PW)).code === 'vault_locked', 'a locked vault opens no window (the second password is the UNLOCK\'s door, not this one)');
await eng.unlock(PW);
ok(vc.reveal('me', w2.page, 'mounts:mnt1#secretKey').code === 'reveal_needs_password', 'unlocked again ⇒ the old window stays ended (the lock moved the epoch)');
const w3 = await vc.startReveal('me', PW);
ok(vc.endReveal('me', null).ended === false && vc.reveal('me', w3.page, 'mounts:mnt1#secretKey').ok, 'reveal-end WITHOUT the page secret ends nothing (another page cannot close this one\'s)');
ok(vc.endReveal('me', w3.page).ended === true && vc.reveal('me', w3.page, 'mounts:mnt1#secretKey').code === 'reveal_needs_password', 'endReveal with it (the window closed / 隐藏全部) ends it at once');
const rr0 = vc.revealRecord('me', null, 'mounts', 'mnt1');
const w4 = await vc.startReveal('me', PW);
const rr1 = vc.revealRecord('me', w4.page, 'mounts', 'mnt1');
ok(rr0.code === 'reveal_needs_password' && rr1.ok && vc.revealRecord('me', w4.page, 'zz', 'mnt1').code === 'not_found', 'revealRecord (a store\'s whole record, the mount edit dialog): the same door — no window ⇒ refused; inside it ⇒ ok');
console.log('③b THE MOUNT EDIT DIALOG\'S RECORD — masked outside the window');
{
  const mk = mm.config('mnt1', { masked: true });
  const real = mm.config('mnt1');
  ok(mk.secretKey === '••••••••' && JSON.stringify(mk.masked) === '["secretKey"]' && mk.bucket === 'b' && mk.accessKey === 'AK', 'masked: every sealed field the dialog shows answers the mask and is named (an s3 record: secretKey); the rest of the record is real', mk);
  ok(real.secretKey === PL.mSecret && real.masked === undefined, 'inside the window: the real values (the dialog\'s prefill, as before)');
  mm._state.mounts.push({ id: 'rc1', name: 'Custom rclone', type: 'rclone', rcloneType: 'drive', remotePath: '', paramsEnc: { client_secret: mm._enc(PL.mParam), team_drive: mm._enc('0ATeamDrive') }, createdAt: clock });
  const rk = mm.config('rc1', { masked: true }), rr = mm.config('rc1');
  ok(rk.params.client_secret === '••••••••' && rk.params.team_drive === '••••••••' && rk.masked.includes('param:client_secret') && rk.driveMode === 'shared-drive' && rr.params.client_secret === PL.mParam, 'an rclone record: every sealed param masked as param:<key> (the dialog\'s own field names); what is derived from them (driveMode) stays right', rk);
  mm._state.mounts.pop();
  ok(!JSON.stringify(mk).includes(PL.mSecret) && !JSON.stringify(mk).includes(PL.mParam), 'the masked record carries no planted value');
}
console.log('③c HUB SECRETS — a link token refused BY NAME (int317)');
{
  clock += 61e3; mono += 61e3;   // past the minute's pace of the legs above
  const w = await vc.startReveal('me3', PW, { ip: '10.0.0.7' });
  ok(w.ok, 'a fresh window', w);
  const h = vc.reveal('me3', w.page, 'secrets:host:dial-dev9#token', { ip: '10.0.0.7' });
  ok(!h.ok && h.code === 'not_revealable' && !JSON.stringify(h).includes(PL.hostTok), 'a machine\'s link token inside an open window ⇒ not_revealable by name (an RCE credential is never shown)', h);
  const g = eng.secretGet('host:dial-dev9');
  ok(g.ok && g.value && g.value.toString('utf8') === PL.hostTok, 'CONTROL: the entry is there and opens (the refusal is the rule, not an absence)');
  if (g.value) g.value.fill(0);
  const h0 = vc.reveal('nobody', null, 'secrets:host:dial-dev9#token');
  ok(h0.code === 'not_revealable', 'refused by name even with no window (the page never offers it)', h0);
  const fk = vc.reveal('me3', w.page, 'secrets:file:dropline-oauth.json#key', { ip: '10.0.0.7' });
  ok(fk.code === 'not_revealable' && !JSON.stringify(fk).includes(PL.fileKey), 'a sealed file\'s key ⇒ not_revealable', fk);
  const fr = vc.reveal('me3', w.page, 'secrets:frp:token#token', { ip: '10.0.0.7' });
  ok(fr.ok && fr.value === PL.frpTok && one(fr) === 1, 'the relay token (the owner\'s own) ⇒ ONE value, like a key', fr.code);
  const du = vc.reveal('me3', w.page, 'integrations:desktop-signin/host-9#username', { ip: '10.0.0.7' });
  const dp = vc.reveal('me3', w.page, 'integrations:desktop-signin/host-9#password', { ip: '10.0.0.7' });
  ok(!du.ok && du.code === 'not_found' && !JSON.stringify(du).includes(PL.dsUser) && dp.ok && dp.value === PL.dsPw, 'a desktop sign-in: the user name is never revealed here (no row, no door); its password through the window', [du.code, dp.code]);
  const rl = fs.readFileSync(AUDIT, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.event === 'vault-reveal-refused' && l.code === 'not_revealable');
  ok(rl.length === 3 && rl.some((l) => l.who === 'me3' && l.ip === '10.0.0.7' && l.store === 'secrets' && l.entry === 'host:dial-dev9' && l.field === 'token'), 'AUDITED like the other refusals: vault-reveal-refused {who, ip, store, entry, field, code: not_revealable} — three', rl);
  // MUTANT: the collector without its by-name refusal ⇒ the source's own guard answers not_found — never not_revealable
  const src = fs.readFileSync(path.join(REPO, 'src/server/vault-contents.js'), 'utf8');
  const cut = src.replace('if (!VI.revealableOf(ref.store, ref.entry)) {', 'if (false) {');
  const Mod = require('module'), mf = path.join(REPO, 'src/server/vault-contents.js');   // compiled in memory at the real path — nothing written under src/
  const mm2 = new Mod(mf); mm2.filename = mf; mm2.paths = Mod._nodeModulePaths(path.dirname(mf)); mm2._compile(cut, mf);
  {
    const MV = mm2.exports.create({ vault: eng, sources, now: () => clock, mono: () => mono });
    const mw = await MV.startReveal('mut', PW);
    const mr = MV.reveal('mut', mw.page, 'secrets:host:dial-dev9#token');
    ok(cut !== src && mr.code !== 'not_revealable' && !JSON.stringify(mr).includes(PL.hostTok), 'MUTANT (the by-name refusal removed) ⇒ RED on the not_revealable leg; the source\'s own guard still answers no value', mr.code);
  }
}
const audit = fs.readFileSync(AUDIT, 'utf8');
const lines = audit.trim().split('\n').map((l) => JSON.parse(l));
const rev = lines.filter((l) => l.event === 'vault-reveal');
ok(rev.length >= 20 && rev.every((l) => l.by === 'human' && l.store && l.entry && l.field && ('ip' in l)) && rev.some((l) => l.field === '*' && l.store === 'mounts'), `the audit: one vault-reveal line per value shown (${rev.length}) with who / ip / store / entry / field — a whole record says field *`, rev.slice(0, 2));
ok(lines.some((l) => l.event === 'vault-reveal-window') && lines.some((l) => l.event === 'vault-reveal-refused' && l.code === 'wrong_password') && lines.some((l) => l.event === 'vault-reveal-paced'), 'the audit: the window opened, the refused password, the pace');
ok(![...allPlants, PW, 'not the second password', PAGE, w4.page].some((v) => audit.includes(v)), 'THE AUDIT CARRIES NO VALUE, no password and no page secret');
ok(vc.reveal('me', w4.page, 'accounts:' + a1.id + '#key').ok && eng.lastUse('accounts').by === 'human' && eng.lastUse('nope') === null, 'a reveal is a use of the store key BY A PERSON (the row\'s «last used»; the store\'s own reads after it say system)', eng.lastUse('accounts'));

console.log('④ TWO-STEP CODES — the inventory row (design q-047 L1, lane vault-totp)');
{
  const d2 = path.join(ROOT, 'totp'); fs.mkdirSync(d2);
  const c2 = Date.parse('2026-10-20T12:00:00Z');
  const e2 = VE.create({ dataDir: d2, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, now: () => c2, register: false });
  await e2.setup(PW);
  const SEED = require(path.join(REPO, 'src/totp.js')).base32Encode(crypto.randomBytes(20));   // a planted seed, built at runtime
  const VT = require(path.join(REPO, 'src/server/vault-totp.js')).create({ dataDir: d2, vault: e2, now: () => c2 });
  const added = VT.addEntry({ uri: `otpauth://totp/GitHub:owner%40example.com?secret=${SEED}&issuer=GitHub&digits=8&period=60&algorithm=SHA256` }, { who: 'me' });
  const vc2 = VC.create({ vault: e2, sources: { secrets: () => VC.secretSource({ vault: e2 }) }, now: () => c2, mono: () => c2 });
  const inv2 = vc2.list();
  const row = inv2.rows.find((r) => r.id === 'secrets:totp:github-owner#seed') || {};
  ok(added.ok && row.kind === 'totp' && row.field === 'seed' && row.label === 'github-owner' && row.detail === '' && row.revealable === true && row.size === 'unknown' && row.createdAt === c2,
    'a two-step entry is ONE row: kind totp, field seed, its NAME as the label — the issuer, the account and the settings are its value (behind 显示)', row);
  ok(row.doors && row.doors.code && row.doors.code.path === '/api/vault/totp/github-owner' && row.doors.delete.method === 'DELETE' && row.doors.delete.path === '/api/vault/totp/github-owner' && row.doors.delete.confirm === 'totp' && row.doors.rotate === null,
    'its doors: THE CODE (a person\'s GET), its own delete (confirm totp — its grants go with it), no 换新 (a new seed = delete + add)', row.doors);
  ok(VI.KINDS.includes('totp') && VI.KIND_WORDS.totp === 'Two-step code' && VI.searchRows(inv2.rows, 'two-step').some((r) => r.id === row.id), 'the kind: totp in the closed table, «Two-step code» in words, found by searching for it');
  const t2 = JSON.stringify(inv2);
  ok(!t2.includes(SEED) && !t2.includes('GitHub') && !t2.includes('owner@example.com') && !t2.includes('SHA256'), 'THE INVENTORY CARRIES NO SEED and no setting (issuer, account, algorithm)');
  ok(VI.secretRowOf({ name: 'totp:' + 'x'.repeat(121), at: 1 }) === null && VI.doorsOf({ store: 'secrets', entry: 'host:h1', field: 'token' }).code === undefined && VI.doorsOf({ store: 'secrets', entry: 'totp:a b', field: 'seed' }).code === undefined,
    'a name outside [\\w.-]{1,120} is no row and no door; no other hub secret has a code door');
  const w = await vc2.startReveal('me', PW, {});
  const rv = vc2.reveal('me', w.page, row.id, {});
  ok(rv.ok && rv.value === `otpauth://totp/GitHub:owner%40example.com?secret=${SEED}&issuer=GitHub&algorithm=SHA256&digits=8&period=60`, 'its reveal (inside the second password\'s window) is ONE value: the otpauth link — the seed and every setting, never the raw record', rv);
  e2.close();
}

console.log('⑧ THE PURPOSES AND THE PROVENANCE (lane vault-window-v2, design q-047 §3.1 / §3.2)');
{
  ok(VI.PURPOSE_IDS.join() === 'two-step,accounts,integrations,machines,storage,app-logins,passkeys,web-logins,automation,keys,agents,other' && new Set(VI.PURPOSE_IDS).size === VI.PURPOSES.length && VI.PURPOSES.filter((p) => p.onlyWhenAny).map((p) => p.id).join() === 'other',
    'THE TABLE (pinned — a new purpose changes this line): eleven purposes + Other (lane vault-paste-request: + Passwords & keys, the free `secret:` entries; lane browser-login: + Web logins, a website\'s `web-login:` entries) (shown only when it holds a row), the rail\'s order, each id once', VI.PURPOSE_IDS);
  const onceIn = (V, rows) => { const groups = V.groupByPurpose(rows); const seen = new Map(); for (const g of groups) for (const r of g.rows) seen.set(r.id, (seen.get(r.id) || 0) + 1); return rows.filter((r) => seen.get(r.id) !== 1).map((r) => [r.id, seen.get(r.id) || 0]); };
  ok(inv.rows.length >= 15 && inv.rows.length === inv.stores.reduce((n, x) => n + x.count, 0) && onceIn(VI, inv.rows).length === 0 && inv.rows.every((r) => VI.PURPOSE_IDS.includes(VI.purposeOf(r))), `EVERY ROW of the real stores (${inv.rows.length}, all eight groups) lands in EXACTLY ONE purpose`, onceIn(VI, inv.rows));
  const P = (id) => VI.purposeOf(inv.rows.find((r) => r.id === id) || null);
  const where = {
    ['accounts:' + a1.id + '#key']: 'accounts', ['accounts:' + sub.id + '#oat']: 'accounts', 'integrations:cloud:browserless#apiKey': 'integrations', 'integrations:desktop-signin/host-9#password': 'machines',
    'channels:acct-lark#token': 'integrations', 'channels:webhook#caller.inbox.c-0a1b2c3d.token': 'integrations', 'mounts:mnt1#secretKey': 'storage', 'mounts:my-storage#secretKey': 'storage',
    [byStore('app-secrets')[0].id]: 'app-logins', [byStore('passkeys')[0].id]: 'passkeys', [byStore('automation')[0].id]: 'automation',
    'secrets:host:dial-dev9#token': 'machines', 'secrets:frp:token#token': 'machines', 'secrets:file:dropline-oauth.json#key': 'other',
  };
  if (machineRow) where[`integrations:${machineRow.id}/host-7#${mSecretField.key}`] = 'machines';
  const off = Object.entries(where).filter(([id, p]) => P(id) !== p).map(([id, p]) => [id, P(id), p]);
  ok(off.length === 0, 'each store\'s rows where design §3.1 puts them: accounts · integrations + channels · a machine\'s row + host: + frp: (machines & relay) · mounts · app logins · passkeys · automation · a sealed file\'s key (other)', off);
  const R = (store, entry, extra = {}) => VI.rowOf(store, { entry, field: extra.field || 'value', label: entry, ...extra });
  ok(VI.purposeOf(R('secrets', 'totp:github', { kind: 'totp', field: 'code' })) === 'two-step' && VI.purposeOf(R('secrets', 'apikey:ak-1')) === 'automation' && VI.purposeOf({ store: 'secrets', entry: 'agent:github-token' }) === 'agents' && VI.purposeOf({ store: 'accounts', entry: 'agent:x' }) === 'agents' && VI.purposeOf({ store: 'nope', entry: 'x' }) === null && VI.purposeOf(null) === null,
    'the rows to come: a two-step entry (lane vault-totp\'s totp:) · an apikey: entry · an agent: entry wins over its store (q-043 §9 — one entry, one purpose) · an unknown store / nothing ⇒ no purpose');
  // lane browser-login: a website login's row — its own purpose, its provenance by its source word, the reference round-trips (its name holds a `#`)
  const WL = (kind) => VI.rowOf('secrets', VI.secretRowOf({ name: 'web-login:https://shop.example.test:8443#alice.k+tag', at: 5, ...(kind ? { kind, actor: 'Chat One' } : {}) }));
  const wlOwn = WL(null), wlMint = WL('vault-minted'), wlTyped = WL('agent-typed');
  ok(wlOwn && VI.purposeOf(wlOwn) === 'web-logins' && wlOwn.kind === 'login' && wlOwn.field === 'password' && wlOwn.label === 'alice.k+tag · shop.example.test:8443' && VI.provenanceOf(wlOwn) === 'me' && VI.provenanceOf(wlMint) === 'agent-mint' && VI.provenanceOf(wlTyped) === 'agent-put' && VI.stateChipsOf(wlTyped).some((c) => c.id === 'rotate') && !VI.stateChipsOf(wlMint).length
    && JSON.stringify(VI.parseRef(wlOwn.id)) === JSON.stringify({ store: 'secrets', entry: 'web-login:https://shop.example.test:8443#alice.k+tag', field: 'password' }) && wlOwn.doors.delete.path === '/api/vault/web-logins/' + encodeURIComponent('web-login:https://shop.example.test:8443#alice.k+tag') && wlOwn.revealable === true,
    'a web login\'s row (lane browser-login): purpose Web logins, kind login, «user · site»; the owner\'s = 我自己, registered through the vault = agent 铸造 · 从未显示, typed by an agent = agent 见过明文 (+ rotate); its reference round-trips; its own delete door; revealable (the password, behind 验证是你)', { wlOwn, mint: VI.provenanceOf(wlMint), typed: VI.provenanceOf(wlTyped) });
  // THE PROVENANCE
  ok(VI.PROVENANCE_IDS.join() === 'me,scan,hub-mint,agent-mint,agent-put,system,request' && VI.PROVENANCE_FILTERS.map((f) => f.id).join() === 'me,agent-mint,agent-put,system' && VI.PROVENANCES.every((p) => VI.PROVENANCE_FILTERS.some((f) => f.id === p.filter)),
    'the provenance chips (seven — lane vault-use-grants: + «filled by you · asked for by …», under 我自己) and the bar\'s four filters — every chip answers to one filter', VI.PROVENANCES.map((p) => `${p.id}→${p.filter}`));
  const pv = (id) => VI.provenanceOf(inv.rows.find((r) => r.id === id));
  ok(pv('accounts:' + a1.id + '#key') === 'me' && pv('integrations:cloud:browserless#apiKey') === 'me' && pv(byStore('automation')[0].id) === 'hub-mint' && pv('secrets:frp:token#token') === 'hub-mint' && pv('secrets:host:dial-dev9#token') === 'system' && pv('secrets:file:dropline-oauth.json#key') === 'system' && inv.rows.every((r) => VI.PROVENANCE_IDS.includes(VI.provenanceOf(r))),
    'the real rows: a person\'s value = 我自己 · an automation key / the relay token = hub 铸造 · a link token / a file key (never shown) = 系统 — every row exactly one chip');
  ok(VI.provenanceOf(R('secrets', 'totp:gh', { origin: 'qr' })) === 'scan' && VI.provenanceOf(R('secrets', 'totp:gh', { origin: 'paste' })) === 'scan' && VI.provenanceOf(R('secrets', 'totp:gh', { origin: 'manual' })) === 'me'
    && VI.provenanceOf({ store: 'secrets', entry: 'agent:tok', origin: 'mint', revealable: true }) === 'agent-mint' && VI.provenanceOf({ store: 'secrets', entry: 'agent:tok', origin: 'put', revealable: true }) === 'agent-put' && VI.provenanceOf(R('integrations', 'cloud:x', { origin: 'put' })) === 'agent-put',
    'the rules in order: put ⇒ agent 见过明文 (whatever the entry) · agent: ⇒ agent 铸造 · a scanned / pasted seed ⇒ 扫码 · a typed one ⇒ 我自己');
  ok(VI.rowOf('accounts', { entry: 'a', field: 'key', label: 'x', origin: 'put', expiresAt: 9 }).origin === 'put' && VI.rowOf('accounts', { entry: 'a', field: 'key', label: 'x', origin: 'bogus' }).origin === null && VI.rowOf('accounts', { entry: 'a', field: 'key', label: 'x', expiresAt: 'soon' }).expiresAt === null,
    'the row\'s origin is a CLOSED word (anything else is no origin); expiresAt an instant or null');
  const oatRow = inv.rows.find((r) => r.id === 'accounts:' + sub.id + '#oat');
  ok(oatRow && oatRow.expiresAt === acc._oatFact(acc.get(sub.id)).validUntil && oatRow.expiresAt > clock, 'the accounts store says when a long-lived token stops (its row\'s expiresAt = minted + the token\'s life)', oatRow && oatRow.expiresAt);
  const S = (row, now) => VI.stateChipsOf(row, now).map((c) => c.id + (c.days ? ':' + c.days : '')).join();
  ok(S({ expiresAt: 10 * 86400e3 }, 8 * 86400e3) === 'expires:2' && S({ expiresAt: 10 * 86400e3 }, 6 * 86400e3) === '' && S({ expiresAt: 5 }, 9) === 'expired' && S({ store: 'secrets', entry: 'agent:x', origin: 'put' }, 0) === 'rotate' && S({ store: 'accounts', entry: 'a' }, 0) === '',
    'the state chips: expires within 3 days (N days) · expired · an agent saw it (rotate) — nothing else');
  // THE WINDOW'S VIEW
  const v0 = VI.viewOf(inv.rows, {});
  ok(v0.counts.all === inv.rows.length && v0.groups.every((g) => v0.counts[g.id] === g.rows.length) && VI.PURPOSE_IDS.filter((id) => id !== 'other').every((id) => id in v0.counts) && v0.rows.length === inv.rows.length,
    'the rail\'s counts: 全部 = every row, each purpose = its group\'s rows (the nine always counted; Other when it holds one)', v0.counts);
  const vs = VI.viewOf(inv.rows, { prov: ['system'] });
  ok(vs.rows.length && vs.rows.every((r) => ['system', 'hub-mint'].includes(VI.provenanceOf(r))) && vs.counts.all === vs.rows.length, 'the provenance filter «系统» keeps the hub\'s own and the never-shown rows only', vs.rows.map((r) => r.id));
  const vr = VI.viewOf(inv.rows, { revealOnly: true });
  ok(vr.rows.every((r) => r.revealable !== false) && vr.rows.length === inv.rows.filter((r) => r.revealable !== false).length, '只看可显示 drops the never-shown rows');
  const vp = VI.viewOf(inv.rows, { purpose: 'storage' });
  ok(vp.groups.length === 1 && vp.groups[0].id === 'storage' && vp.counts.all === inv.rows.length && vp.counts.storage === byStore('mounts').length, 'a purpose picked in the rail shows its group only; the counts stay the whole view\'s');
  const vw = VI.viewOf(inv.rows, { q: '存储', wordsOf: (r) => (VI.purposeOf(r) === 'storage' ? ['存储'] : []) });
  ok(vw.rows.length === byStore('mounts').length, 'the search matches the page\'s OWN words for a row (its language — here 存储)', vw.rows.map((r) => r.id));
  const vu = VI.viewOf([R('accounts', 'b', { label: 'B', createdAt: 1 }), R('accounts', 'a', { label: 'A', createdAt: 2 })], { sort: 'created' });
  ok(vu.rows.map((r) => r.label).join() === 'A,B' && VI.viewOf(vu.rows, { sort: 'name' }).rows.map((r) => r.label).join() === 'A,B', 'the sort inside a purpose (newest / name)');
  // THE BAND
  const it = (id, o = {}) => ({ id, origin: 'vault', status: 'open', urgency: 'normal', createdAt: 1, ...o });
  const b = VI.bandItemsOf([it('a', { createdAt: 5 }), it('b', { urgency: 'urgent', createdAt: 1 }), { id: 'c', origin: 'login', status: 'open' }, it('d', { status: 'done' }), it('e', { clearedAt: 3 }), it('f', { createdAt: 9 }), it('g'), it('h'), it('i')]);
  ok(b.items.map((x) => x.id).join() === 'b,f,a,g,h' && b.total === 6, 'the band: origin vault only, open, not cleared — urgent first, then newest, at most 5 (the total said)', b);
  ok(VI.bandDoorsOf({ action: { type: 'automation-ask' } }).join() === 'once,always,deny' && VI.bandDoorsOf({ action: { type: 'vault-unlock' } }).join() === 'unlock' && VI.bandDoorsOf({ action: { type: 'vault-rotate' } }).join() === 'renew,ack' && VI.bandDoorsOf({ action: { type: 'vault-use-failed' } }).join() === 'open,ack' && VI.bandDoorsOf({}).join() === 'open,ack',
    'the band\'s doors per card: a held automation call = its three answers · the restart\'s = unlock · rotate = renew + got it · a failed use / any other = open + got it');
  // THE USE-FAILURE HOUR
  const H = VI.USE_FAIL_MERGE_MS;
  const f1 = VI.useFailVerdict(null, { code: 'vault_locked', at: 1000, who: 'Release helper' });
  const f2 = VI.useFailVerdict(f1.next, { code: 'not_granted', at: 1000 + H - 1 });
  const f3 = VI.useFailVerdict(f2.next, { code: 'ask_expired', at: 1000 + H });
  ok(f1.fresh && f1.next.n === 1 && f1.next.causes.locked === 1 && !f2.fresh && f2.next.n === 2 && f2.next.causes['not-granted'] === 1 && f2.next.since === 1000 && f3.fresh && f3.next.n === 1 && f3.next.causes.expired === 1,
    'one card per entry per hour: the first failure files, the hour\'s next ones count on it, the next hour files again', [f1, f2, f3]);
  ok(['ask_denied', 'ask_quiet', 'caller_gone', 'unknown_verb', 'failed', 'vault_not_set_up', 'subject_busy', 'already_archived', 'bad_args'].every((c) => !VI.useFailVerdict(null, { code: c, at: 1 }).counted) && Object.keys(VI.USE_FAIL_CAUSES).sort().join() === 'ask_expired,asks_open,key_revoked,not_granted,once_spent,subject_ended,vault_locked,verb_not_in_scope',
    'only a cause the owner can act on is a failure (locked / not granted / expired / the target\'s open asks — lane conversations-archive-verb) — the owner\'s own refusal, a caller gone, a mistake in the call, a retry the caller holds (subject_busy, already_archived) are not');
  // lane conversations-archive-verb → lane vault-key-row-compact (the card grammar): THE HEAD = who · the key · the verb (the closed
  // table's own words, a param that IS words) · refused; THE CAUSE = the first detail line (the reason + the door, the target in
  // it); the hour's count, the last target, the last caller under the fold; one hour per (key, verb, reason) keeps its FIRST target and caller
  const g1 = VI.useFailVerdict(null, { code: 'not_granted', at: 5000, who: 'Coordinator', target: 'lane a' });
  const g2 = VI.useFailVerdict(g1.next, { code: 'not_granted', at: 5001, who: 'Helper', target: 'lane b' });
  const c1 = VI.useFailCard({ name: 'dispatch', verb: 'conversations.end', verbLabel: 'End a conversation', code: 'not_granted', who: 'Helper', next: g2.next });
  ok(g2.next.target === 'lane a' && g2.next.lastTarget === 'lane b' && g2.next.who === 'Coordinator' && g2.next.lastWho === 'Helper'
    && c1.text.key === VI.USE_FAIL_HEADS.named && c1.text.key === '{who} used “{name}” for “{verb}” — refused' && c1.text.params.who === 'Coordinator' && c1.text.params.name === 'dispatch' && JSON.stringify(c1.text.params.verb) === '{"key":"End a conversation"}'
    && c1.detail[0].key === VI.USE_FAIL_LINES.not_granted && c1.detail[0].params.target === 'lane a' && /^The key is not granted to \{target\} .* — grant it there in the Vault window/.test(c1.detail[0].key)
    && c1.detail[1].params.n === 2 && c1.detail[2].key === 'Last: {target}' && c1.detail[2].params.target === 'lane b' && c1.detail[3].key === 'Last asked by {who}' && c1.detail[3].params.who === 'Helper' && c1.detail.length === 4,
    'useFailCard: the HEAD «Coordinator used “dispatch” for “End a conversation” — refused» (the hour\'s FIRST caller; the verb as the table\'s words); the CAUSE first under it (the target + the door); then the count, the last target, the last caller', c1);
  ok(c1.english === 'Coordinator used “dispatch” for “End a conversation” — refused. The key is not granted to lane a (nor to one of its Task Groups) and did not open it — grant it there in the Vault window (授权给…), or answer the card next time',
    'the English sentence (the store\'s dedupe key) = the head + the cause, filled — one hour of one (key, verb, reason) stays ONE item', c1.english);
  ok(Object.keys(VI.USE_FAIL_LINES).sort().join() === Object.keys(VI.USE_FAIL_CAUSES).sort().join() && Object.values(VI.USE_FAIL_LINES).every((l) => /^\S.+ — .+$/.test(l) && !/\{name\}|\{verb\}/.test(l)) && Object.keys(VI.USE_FAIL_NAMELESS).sort().join() === 'not_granted,vault_locked,verb_not_in_scope' && VI.USE_FAIL_NAMELESS.vault_locked === VI.USE_FAIL_LINES.vault_locked && VI.useFailCard({ verb: 'feedback.list', code: 'verb_not_in_scope', target: 'w', next: { n: 1 } }).detail[0].key === VI.USE_FAIL_NAMELESS.verb_not_in_scope && VI.useFailCard({ verb: 'x', code: 'once_spent', target: 'w', next: { n: 1 } }).detail[0].key === VI.USE_FAIL_LINES.once_spent,
    'every cause has its sentence (reason — door) that never repeats the key or the verb (the head says them — said once); the three refusals met before a key is picked have a nameless line (the locked one shared); any other nameless code says the named cause');
  const c0 = VI.useFailCard({ name: null, verb: 'conversations.open', verbLabel: 'Open a conversation', target: 'x', code: 'vault_locked', who: 'Release helper', next: VI.useFailVerdict(null, { code: 'vault_locked', at: 1, who: 'Release helper' }).next });
  const c00 = VI.useFailCard({ name: null, verb: 'conversations.open', target: 'x', code: 'vault_locked', next: VI.useFailVerdict(null, { code: 'vault_locked', at: 1 }).next });
  ok(c0.text.key === VI.USE_FAIL_HEADS.who && !('name' in c0.text.params) && c0.detail[0].key === 'The vault is locked — Unlock… at the top of the page' && c00.text.key === VI.USE_FAIL_HEADS.none && c00.text.params.verb === 'conversations.open',
    'no key picked yet (locked before the pick) ⇒ the nameless head («Release helper used an automation key for “Open a conversation” — refused»), the cause\'s door in a person\'s words (Unlock…); no caller and no table words ⇒ the verb id said as it is', [c0.text, c00.text]);
  // lane key-instance-scope: a REACH refusal's cause names the reach the grant has (opened / its Task Groups) and the door that widens it
  ok(Object.keys(VI.USE_FAIL_REACH_LINES).sort().join() === 'groups,opened' && Object.values(VI.USE_FAIL_REACH_LINES).every((l) => /\{target\}/.test(l) && / — .+/.test(l) && /Vault window/.test(l)), 'USE_FAIL_REACH_LINES: one cause per reach kind a refusal can name (opened / groups), the target in it, each with its door');
  const cr = VI.useFailCard({ name: 'dispatch', verb: 'conversations.end', target: 'lane c', code: 'not_granted', reach: 'opened', next: { n: 1 } });
  const cg = VI.useFailCard({ name: 'dispatch', verb: 'conversations.end', target: 'lane c', code: 'not_granted', reach: 'groups', next: { n: 1 } });
  const cn = VI.useFailCard({ name: 'dispatch', verb: 'conversations.end', target: 'lane c', code: 'not_granted', next: { n: 1 } });
  const cx = VI.useFailCard({ name: 'dispatch', verb: 'conversations.end', target: 'lane c', code: 'vault_locked', reach: 'opened', next: { n: 1 } });
  const cu = VI.useFailCard({ name: 'dispatch', verb: 'conversations.end', target: 'lane c', code: 'not_granted', reach: 'instance', next: { n: 1 } });
  ok(cr.detail[0].key === VI.USE_FAIL_REACH_LINES.opened && cg.detail[0].key === VI.USE_FAIL_REACH_LINES.groups && cn.detail[0].key === VI.USE_FAIL_LINES.not_granted && cx.detail[0].key === VI.USE_FAIL_LINES.vault_locked && cu.detail[0].key === VI.USE_FAIL_LINES.not_granted && cr.detail[0].params.target === 'lane c' && cr.text.key === VI.USE_FAIL_HEADS.key && cr.text.params.name === 'dispatch',
    'not_granted with a reach ⇒ that reach\'s cause (opened / groups); without one, or a kind no line names ⇒ the grant cause; another code ignores the reach; no caller ⇒ the key head');
  // MUTANTS — compiled in memory at the real path (nothing written under src/)
  const Mod = require('module'), mf = path.join(REPO, 'src/vault-inventory.js'), srcI = fs.readFileSync(mf, 'utf8');
  const compile = (code) => { const m = new Mod(mf); m.filename = mf; m.paths = Mod._nodeModulePaths(path.dirname(mf)); m._compile(code, mf); return m.exports; };
  // lane vault-totp-add: a row's purpose is its kind family's (src/vault-kinds.js) — the registry is mutated, compiled at its real
  // path and put in front of the inventory's require for the one compile
  const kf = path.join(REPO, 'src/vault-kinds.js'), srcK = fs.readFileSync(kf, 'utf8');
  const withKinds = (kindsCode, code) => {
    const k = new Mod(kf); k.filename = kf; k.paths = Mod._nodeModulePaths(path.dirname(kf)); k._compile(kindsCode, kf); k.loaded = true;
    const prev = Mod._cache[kf]; Mod._cache[kf] = k;
    try { return compile(code); } finally { if (prev) Mod._cache[kf] = prev; else delete Mod._cache[kf]; }
  };
  const noPurposeK = srcK.replace("category: 'integrations', stores: ['channels']", "category: 'nowhere', stores: ['channels']");
  const twoPurposes = srcI.replace('for (const r of rows || []) { const p = purposeOf(r); if (by.has(p)) by.get(p).push(r); }', "for (const r of rows || []) { const p = purposeOf(r); if (by.has(p)) by.get(p).push(r); if (r.store === 'mounts') by.get('other').push(r); }");
  const m1 = withKinds(noPurposeK, srcI), m2 = compile(twoPurposes);
  const lost = onceIn(m1, inv.rows), twice = onceIn(m2, inv.rows);
  ok(noPurposeK !== srcK && lost.length >= 3 && lost.every(([id, n]) => id.startsWith('channels:') && n === 0), 'MUTANT (a row of NO purpose — channels answer none) ⇒ RED: its rows land nowhere', lost);
  ok(twoPurposes !== srcI && twice.length === byStore('mounts').length && twice.every(([, n]) => n === 2), 'MUTANT (a row in TWO purposes) ⇒ RED: each mount counted twice', twice);
}

console.log('⑨ AGENT-OWNED SECRETS — provenance rows (q-043 §9, lane vault-mint-put)');
{
  const da = path.join(ROOT, 'agentprov'); fs.mkdirSync(da, { recursive: true });
  let ac = Date.parse('2026-10-19T15:00:00Z');
  const ea = VE.create({ dataDir: da, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false, register: false, now: () => ac });
  await ea.setup(PW, {});
  ea.agentMint('agent:conv-INV/signup-pw', { length: 24, charset: 'ascii-printable', actor: 'Build chat' });
  ea.agentPut('agent:conv-INV/vendor-key', 'sk-INVENTORY-PLANT-9911', { actor: 'Build chat' });
  const va = VC.create({ vault: ea, sources: { secrets: () => VC.secretSource({ vault: ea }) }, now: () => ac, mono: () => 5000 });
  const inv2 = va.list();
  const ar = inv2.rows.filter((r) => r.store === 'secrets' && r.entry.startsWith('agent:'));
  const at2 = (id) => ar.find((r) => r.id === id);
  ok(ar.length === 2 && at2('secrets:agent:conv-INV/signup-pw#secret') && at2('secrets:agent:conv-INV/vendor-key#secret'), 'each agent entry is ONE «Hub secrets» row keyed <scope>/<name>#secret', ar.map((r) => r.id));
  const mintRow = at2('secrets:agent:conv-INV/signup-pw#secret'), putRow = at2('secrets:agent:conv-INV/vendor-key#secret');
  ok(mintRow.label === 'Agent secret · signup-pw' && mintRow.provenance && mintRow.provenance.prov === 'minted' && mintRow.provenance.sawPlaintext === false && mintRow.provenance.actor === 'Build chat' && mintRow.detail === 'Agent minted · never shown to the agent',
    'the MINTED row: provenance minted, the agent never saw it, the owning conversation named', mintRow);
  ok(putRow.provenance.prov === 'stored' && putRow.provenance.sawPlaintext === true && putRow.detail === 'Agent stored · the agent saw the plaintext',
    'the STORED row: provenance stored, the agent saw the plaintext (the rotate hint belongs to it)', putRow);
  ok(mintRow.revealable === true && putRow.revealable === true && mintRow.size === 'unknown', 'an agent secret may be revealed by the owner (names + dates only — no length class)', [mintRow.revealable, mintRow.size]);
  ok(VI.AGENT_PROV.minted.sawPlaintext === false && VI.AGENT_PROV.stored.sawPlaintext === true, 'AGENT_PROV: minted never seen, stored seen (the v2 window\'s provenance chip reads row.provenance)');
  ok(!JSON.stringify(inv2.rows).includes('sk-INVENTORY-PLANT-9911'), 'the masked inventory carries no agent value');
  const wA = await va.startReveal('meA', PW);
  const rvMint = va.reveal('meA', wA.page, 'secrets:agent:conv-INV/signup-pw#secret');
  const rvPut = va.reveal('meA', wA.page, 'secrets:agent:conv-INV/vendor-key#secret');
  ok(rvMint.ok && rvMint.value.length === 24 && rvPut.ok && rvPut.value === 'sk-INVENTORY-PLANT-9911', 'the owner reveals the minted value (24 ch) AND the stored value through the window', [rvMint.ok, rvPut.ok]);
  // MUTANT: rowOf that drops provenance ⇒ the v2 chip would have nothing to show
  const src = fs.readFileSync(path.join(REPO, 'src/vault-inventory.js'), 'utf8');
  const cut = src.replace("provenance: raw.provenance || null,   // lane vault-mint-put: agent entries carry it; the v2 window's chip reads it", 'provenance: null,');
  const Mod = require('module'), mf = path.join(REPO, 'src/vault-inventory.js');
  const mm = new Mod(mf); mm.filename = mf; mm.paths = Mod._nodeModulePaths(path.dirname(mf)); mm._compile(cut, mf);
  const mraw = mm.exports.secretRowOf({ name: 'agent:c/x', at: ac, prov: 'minted', actor: 'A' });
  const mrow = mm.exports.rowOf('secrets', mraw);
  ok(cut !== src && mraw.provenance && mrow.provenance === null, 'MUTANT (rowOf drops provenance) ⇒ the agent row loses its provenance — the v2 chip would show nothing (RED on the provenance-row assert)');
  // lane vault-agent-own: the CHIP tells mint from put (the row now carries its origin — a PUT showed «never shown» before:
  // provenanceOf read `origin`, the agent row never had one); a mint's --for rides its provenance; an agent's own two-step seed
  // (`totp add`) is «stored by an agent» with its owner; «Kept by agents» says its rule
  ok(VI.provenanceOf(mintRow) === 'agent-mint' && VI.provenanceOf(putRow) === 'agent-put' && mintRow.origin === 'mint' && putRow.origin === 'put', 'the MINTED row\'s chip says «minted by an agent · never shown», the STORED row\'s «stored by an agent · it saw the value»', [VI.provenanceOf(mintRow), VI.provenanceOf(putRow)]);
  const noOrigin = src.replace("origin: prov === 'minted' ? 'mint' : 'put', provenance:", 'provenance:');
  const mo = new Mod(mf); mo.filename = mf; mo.paths = Mod._nodeModulePaths(path.dirname(mf)); mo._compile(noOrigin, mf);
  ok(noOrigin !== src && mo.exports.provenanceOf(mo.exports.rowOf('secrets', mo.exports.secretRowOf({ name: 'agent:c/x', prov: 'stored' }))) === 'agent-mint', 'CONTROL RED: without the origin a PUT reads «minted · never shown» (the window lied about what the agent saw)');
  ea.agentMint('agent:conv-INV/site-pw', { length: 24, charset: 'alnum', actor: 'Build chat', forHost: 'api.example.com' });
  ea.secretPut('totp:agent-shop', JSON.stringify({ v: 1, seed: ['JBSW', 'Y3DP', 'EHPK', '3PXP'].join(''), digits: 6, period: 30, algorithm: 'SHA1' }), { kind: 'agent-typed', actor: 'Build chat', owner: 'conv-INV' });
  const inv3 = va.list().rows;
  const fr = inv3.find((r) => r.id === 'secrets:agent:conv-INV/site-pw#secret'), tr = inv3.find((r) => r.id === 'secrets:totp:agent-shop#seed');
  ok(fr && fr.provenance.forHost === 'api.example.com' && tr && tr.kind === 'totp' && tr.provenance && tr.provenance.prov === 'agent-typed' && tr.provenance.owner === 'conv-INV' && tr.provenance.actor === 'Build chat' && VI.provenanceOf(tr) === 'agent-put' && tr.detail === 'Added by an agent itself — the agent saw the seed' && VI.purposeOf(tr) === 'two-step',
    'a mint\'s --for rides its provenance; an agent\'s own two-step seed: kind totp, provenance agent-typed + its owner, the «stored by an agent» chip, under Two-step codes', [fr && fr.provenance, tr && tr.provenance]);
  const ag = VI.PURPOSES.find((p) => p.id === 'agents');
  ok(ag && /uses it without asking you/.test(ag.help) && /other conversations cannot use it/.test(ag.help) && VI.PURPOSES.filter((p) => p.help).length === 1, '«Kept by agents» carries its rule as its help sentence (the only purpose with one)', ag);
  ea.close();
}

try { ce.stop(); ce.store.close(); } catch { }
eng.close();
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
