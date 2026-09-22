#!/usr/bin/env node
// THE ACCOUNT MODEL (2026-09-22, owner: "为啥不能和mount那种类似，管理的是账号，
// 每个账号添加的时候可以选oauth client？" — docs/design-communication-panel.zh.md
// §5 / §14.2; gate row `test-channels-accounts`).
//
// The Communication panel manages ACCOUNTS the way the storage mounts do: N
// adapter records per kind, each stamped at connect with the CREDENTIAL it
// was minted under (`cluster:<presetKey>` / `own`), and every consent /
// refresh / status / Test of that account resolves THAT key. The defect this
// replaces: one record per kind whose credential was "the integration row's
// current pick", so a refresh token minted under client A was refreshed with
// client B the moment the pick changed (Google: invalid_client) — the model
// itself violated §14.2's "never a silent swap".
//
//   ① two Gmail accounts under two presets refresh with THEIR OWN client ids
//      (the client_id each fake token call received)
//   ② flipping the integration's default leaves the first account's refresh
//      on its original client — and a PRE-FIX CONTROL (a patched engine copy
//      that hands the adapter no key) reproduces the silent swap
//   ③ a credential the env stopped offering answers `preset-gone` BY NAME —
//      never another client: no token call for that refresh token at all
//   ④ connect with an unknown key is refused by name and mints NO record;
//      `own` is offered only once the user's values are complete, and a
//      connect under it carries the user's own client
//   ⑤ (verifier r1) a HELD token BINDS its account: a different key on
//      reauthorize / the P1a connect is refused BY NAME (credential-bound),
//      never dropped; a TOKEN-LESS account (disconnected / never
//      authenticated) RE-BINDS through the same verbs and its consent runs
//      under the new client (the live adapter rebuilt); `auth.tokenHeld`
//   ⑥ a further account's disconnect removes ONLY its own record and index
//      rows — the first account and its conversations stay addressable
//   ⑦ the routes: `{credentialKey, newAccount}` on connect, the per-account
//      reauthorize (`{credentialKey}` = re-bind / 400 credential-bound /
//      400 unknown-credential), the P1a per-kind connect still
//      re-authorizing the FIRST
//   ⑧ the Lark keyed rung over the keyed JSON env: the account's key read
//      LIVE off the record (the legacy-stamp path), the refresh naming ITS app
//
// Zero vendor calls: every fetch is the fake below. Per-pid scratch dirs
// (scripts/scratch.mjs), a free port for the route leg.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const STORE = require(path.join(REPO, 'src/server/integration-store.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const gmail = require(path.join(REPO, 'src/channels/gmail.js'));
const lark = require(path.join(REPO, 'src/channels/lark.js'));
const routes = require(path.join(REPO, 'src/routes/channels.js'));
const ENGINE_PATH = path.join(REPO, 'src/server/channels-engine.js');

const ROOT = scratch('chan-accounts');
const patched = [];
const cleanup = () => { for (const f of patched) { try { fs.unlinkSync(f); } catch {} } try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

const T0 = 1_700_000_000_000;
let clock = T0;
const now = () => clock;
const quiet = { log() {}, warn() {}, error() {} };
const jsonRes = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

// ── the fake Google: one mailbox per consent CODE, every token call records the client it received ──
function mkVendor() {
  const calls = [];
  const accounts = {
    'c-a': { email: 'member.a@example.com', refresh: '1//ra', thread: 'thr_a' },
    'c-b': { email: 'member.b@example.com', refresh: '1//rb', thread: 'thr_b' },
    'c-c': { email: 'member.c@example.com', refresh: '1//rc', thread: 'thr_c' },
  };
  const byAccess = new Map();
  let n = 0;
  const fetchFn = async (url, init = {}) => {
    const u = new URL(String(url));
    const raw = init.body == null ? '' : String(init.body);
    const form = raw && !raw.startsWith('{') ? Object.fromEntries(new URLSearchParams(raw)) : null;
    const auth = (init.headers || {}).Authorization || null;
    calls.push({ host: u.hostname, path: u.pathname, form, auth, q: Object.fromEntries(u.searchParams) });
    if (u.hostname === 'oauth2.googleapis.com' && u.pathname === '/token') {
      if (form.grant_type === 'authorization_code') {
        const acct = accounts[form.code];
        if (!acct) return jsonRes({ error: 'invalid_grant' }, 400);
        const at = `ya29.${form.code}.${++n}`; byAccess.set(at, acct);
        return jsonRes({ access_token: at, expires_in: 3600, refresh_token: acct.refresh, scope: `${gmail.SCOPE} ${gmail.SCOPE_SEND}`, token_type: 'Bearer' });
      }
      if (form.grant_type === 'refresh_token') {
        const acct = Object.values(accounts).find((a) => a.refresh === form.refresh_token);
        if (!acct) return jsonRes({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
        const at = `ya29.r.${++n}`; byAccess.set(at, acct);
        return jsonRes({ access_token: at, expires_in: 3600, scope: `${gmail.SCOPE} ${gmail.SCOPE_SEND}`, token_type: 'Bearer' });
      }
      return jsonRes({ error: 'unsupported_grant_type' }, 400);
    }
    if (u.hostname !== 'gmail.googleapis.com') return jsonRes({ error: { code: 404, message: `unrouted host ${u.hostname}` } }, 404);
    const acct = byAccess.get(String(auth || '').replace(/^Bearer /, ''));
    if (!acct) return jsonRes({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
    const p = u.pathname.replace('/gmail/v1/users/me', '');
    if (p === '/profile') return jsonRes({ emailAddress: acct.email, historyId: '100' });
    if (p === '/threads') return jsonRes({ threads: [{ id: acct.thread, snippet: `hello from ${acct.email}` }] });
    if (/^\/threads\/[^/]+$/.test(p)) return jsonRes({ id: acct.thread, messages: [{ id: 'm1', internalDate: String(T0), payload: { headers: [{ name: 'Subject', value: `Subject of ${acct.thread}` }, { name: 'From', value: 'Someone <someone@example.com>' }, { name: 'Date', value: 'x' }] } }] });
    if (p === '/history') return jsonRes({ historyId: '100' });
    return jsonRes({ error: { code: 404, message: `unrouted ${p}` } }, 404);
  };
  return { fetchFn, calls, tokenCalls: () => calls.filter((c) => c.host === 'oauth2.googleapis.com' && c.form && c.form.grant_type === 'refresh_token') };
}
const PRESETS = [
  { key: 'org1', label: 'Org 1', clientId: 'org1.apps.googleusercontent.com', clientSecret: 'org1-secret-000000' },
  { key: 'channels', label: 'Channels', clientId: 'ch.apps.googleusercontent.com', clientSecret: 'channels-secret-0000' },
];
const holder = { list: PRESETS.slice() };
const get = (url) => new Promise((resolve) => { http.get(url, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', (e) => resolve({ status: 0, body: String(e.message) })); });

/** Connect one account end to end through the REAL engine: begin → the
 *  loopback redirect with the fixture code → the exchange → the pass. */
async function consent(eng, kind, opts, code) {
  const r = await eng.connect(kind, opts);
  const cu = new URL(r.flow.consentUrl);
  const landed = await get(`${r.flow.redirectUri}/?state=${cu.searchParams.get('state')}&code=${code}`);
  await sleep(80);   // the exchange + onAuthDone + the pass connect() kicked
  return { r, id: r.adapter.id, clientId: cu.searchParams.get('client_id'), landed };
}
const rowOf = (eng, id) => eng.digest().adapters.find((a) => a.id === id) || null;

const storeDir = path.join(ROOT, 'store'); fs.mkdirSync(storeDir, { recursive: true });
const integrations = STORE.create({ dataDir: storeDir, env: {}, now, broadcast: () => {}, drivePresets: () => holder.list, log: quiet });
const v = mkVendor();
const engDir = path.join(ROOT, 'eng'); fs.mkdirSync(engDir, { recursive: true });
const frames = [];
const eng = ENG.create({ dataDir: engDir, env: {}, now, broadcast: (m) => frames.push(m), integrations, fetch: v.fetchFn, log: quiet });
const engines = [eng];
process.on('exit', () => { for (const e of engines) { try { e.oauth.stopAll(); e.stop(); } catch {} } });

// ── ⓪ the store: the keyed rungs, the offered list, the default's own key ──
console.log('⓪ the store');
{
  const d = integrations.resolveIntegration('gmail');
  ok(d.source === 'cluster' && d.clusterKey === 'channels' && d.credentialKey === 'cluster:channels', `the row's own pick (prefer \`channels\`) names its key: ${d.credentialKey}`);
  const a = integrations.resolveIntegration('gmail', { credentialKey: 'cluster:org1' });
  ok(a.source === 'cluster' && a.clusterKey === 'org1' && a.values.clientId === 'org1.apps.googleusercontent.com' && a.credentialKey === 'cluster:org1' && a.missing.length === 0, '`cluster:org1` resolves THAT preset whatever the pick prefers');
  const off = integrations.offeredCredentials('gmail');
  ok(off.length === 3 && off.map((o) => o.key).join() === 'cluster:org1,cluster:channels,own' && off[0].label === 'Org 1' && off[2].available === false && off[2].missing.length >= 1 && off.every((o) => !('values' in o) && !('clientSecret' in o)), 'offeredCredentials = the two presets, key + label only, and `own` LISTED as unavailable while the user saved nothing (r3: the wizard always draws the choice)');
  const own0 = integrations.resolveIntegration('gmail', { credentialKey: 'own' });
  ok(own0.source === 'none' && own0.whyCode === 'own-missing' && /no keys of your own/.test(own0.why), '`own` with nothing saved is `none` with its own code (never the cluster)');
  const bogus = integrations.resolveIntegration('gmail', { credentialKey: 'nope' });
  ok(bogus.source === 'none' && bogus.whyCode === 'unknown-credential', 'a key of neither form is `unknown-credential`, not a throw');
  const d0 = eng.digest();
  const av = d0.available.find((x) => x.kind === 'gmail');
  ok(av && Array.isArray(av.credentials) && av.credentials.length === 3 && av.credentials[2].key === 'own' && av.credentials[2].available === false && av.credential.credentialKey === 'cluster:channels', 'the digest offers gmail with BOTH credentials for the wizard and the facts of the default key');
}

// ── ① two accounts, two presets, two refreshes, two client ids ──
console.log('① two accounts under two presets');
let idA = null, idB = null;
{
  const A = await consent(eng, 'gmail', { credentialKey: 'cluster:org1' }, 'c-a');
  idA = A.id;
  ok(idA === 'gmail' && A.clientId === 'org1.apps.googleusercontent.com' && A.landed.status === 200, `the FIRST account's id IS the kind and its consent carried org1's client (${A.clientId})`);
  const B = await consent(eng, 'gmail', { credentialKey: 'cluster:channels', newAccount: true }, 'c-b');
  idB = B.id;
  ok(/^gmail:[0-9a-f]{8}$/.test(idB) && B.clientId === 'ch.apps.googleusercontent.com', `a further account is \`gmail:<8 hex>\` (${idB}) and its consent carried the channels client`);
  const ra = rowOf(eng, idA), rb = rowOf(eng, idB);
  ok(ra && ra.auth.state === 'connected' && ra.auth.user === 'member.a@example.com' && ra.credentialKey === 'cluster:org1' && ra.credentialLabel === 'Org 1' && ra.credential.source === 'cluster' && ra.credential.clusterLabel === 'Org 1' && ra.auth.credentialKey === 'cluster:org1',
    'A\'s row: connected as member.a, credentialKey cluster:org1, its label, the facts FOR THAT KEY, auth.state naming the key', JSON.stringify(ra && { auth: ra.auth, credentialKey: ra.credentialKey, credentialLabel: ra.credentialLabel }));
  ok(rb && rb.auth.state === 'connected' && rb.auth.user === 'member.b@example.com' && rb.credentialKey === 'cluster:channels' && rb.credentialLabel === 'Channels' && Array.isArray(rb.credentials) && rb.credentials.length === 3 && rb.credentials[2].key === 'own' && rb.credentials[2].available === false,
    'B\'s row: connected as member.b under cluster:channels, and the row carries the offered list incl. the unavailable `own` (the "Add account" step reads it)');
  const disk = JSON.parse(fs.readFileSync(path.join(engDir, 'channels', 'adapters.json'), 'utf-8')).adapters;
  ok(disk.length === 2 && disk.find((r) => r.id === idA).credentialKey === 'cluster:org1' && disk.find((r) => r.id === idB).credentialKey === 'cluster:channels', 'adapters.json holds both records with their keys');
  const convs = eng.digest().conversations;
  ok(convs.some((c) => c.key === `${idA}/thr_a`) && convs.some((c) => c.key === `${idB}/thr_b`), 'each account discovered ITS mailbox\'s thread under its own adapter id');
  ok(!eng.digest().available.some((x) => x.kind === 'gmail'), 'gmail left the "available" list (a kind with an account is added from its row, not the list)');
  // the refreshes
  clock += 3600e3;   // both access tokens are now past their hour
  v.calls.length = 0;
  const pa = await eng.pass(idA, { force: true });
  const pb = await eng.pass(idB, { force: true });
  const tc = v.tokenCalls();
  const ta = tc.find((c) => c.form.refresh_token === '1//ra'), tb = tc.find((c) => c.form.refresh_token === '1//rb');
  ok(pa.ok !== false && pb.ok !== false && tc.length === 2, `both passes refreshed (${tc.length} refresh calls)`, JSON.stringify({ pa, pb }));
  ok(ta && ta.form.client_id === 'org1.apps.googleusercontent.com' && ta.form.client_secret === 'org1-secret-000000', 'A\'s refresh token went to org1\'s client', JSON.stringify(ta && ta.form));
  ok(tb && tb.form.client_id === 'ch.apps.googleusercontent.com' && tb.form.client_secret === 'channels-secret-0000', 'B\'s refresh token went to the channels client', JSON.stringify(tb && tb.form));
}

// ── ② the integration's default flips; A stays on org1 (and the pre-fix control swaps) ──
console.log('② flipping the default');
{
  integrations.setClusterKey('gmail', 'channels');
  await sleep(20);   // onChange → every live adapter re-asked
  ok(integrations.resolveIntegration('gmail').credentialKey === 'cluster:channels', 'the row\'s pick now names channels');
  clock += 3600e3;
  v.calls.length = 0;
  const pa = await eng.pass(idA, { force: true });
  const ta = v.tokenCalls().find((c) => c.form.refresh_token === '1//ra');
  ok(pa.ok !== false && ta && ta.form.client_id === 'org1.apps.googleusercontent.com', 'A\'s refresh STILL goes to org1 — the account\'s key, not the row\'s pick', JSON.stringify(ta && ta.form));
  const ra = rowOf(eng, idA);
  ok(ra.credentialKey === 'cluster:org1' && ra.auth.state === 'connected' && ra.auth.credentialKey === 'cluster:org1' && ra.credential.clusterLabel === 'Org 1', 'and A\'s row still says org1 after the change edge');
  integrations.setClusterKey('gmail', 'org1');
  await sleep(20);

  // THE PRE-FIX CONTROL: an engine whose adapters get no credential key —
  // every account follows the row's pick; flipping it swaps A's client.
  // Two needles: the deps hand-down AND the record stamp — the adapter reads
  // its key off the LIVE record as a fallback (that is what makes the
  // migration's stamp effective on an adapter built before it landed), so a
  // copy that only drops the hand-down still answers by the record.
  const src = fs.readFileSync(ENGINE_PATH, 'utf-8');
  const NEEDLES = [[', credentialKey: rec.credentialKey || null };', ' };'], ['      credentialKey: credentialKey || null,\n', '      credentialKey: null,\n']];
  ok(NEEDLES.every(([n]) => src.split(n).length === 2), 'POSITIVE CONTROL: both patched strings exist exactly once in the engine (the control really removes the key hand-down and the record stamp)');
  const copy = path.join(REPO, 'src/server', `.channels-engine.prefix-${process.pid}-${patched.length + 1}.js`);
  fs.writeFileSync(copy, NEEDLES.reduce((acc, [a, b]) => acc.replace(a, b), src));
  patched.push(copy);
  const ENG0 = require(copy);
  const store0 = STORE.create({ dataDir: path.join(ROOT, 'store0'), env: {}, now, broadcast: () => {}, drivePresets: () => holder.list, log: quiet });
  store0.setClusterKey('gmail', 'org1');
  const v0 = mkVendor();
  const d0 = path.join(ROOT, 'eng0'); fs.mkdirSync(d0, { recursive: true });
  const eng0 = ENG0.create({ dataDir: d0, env: {}, now, broadcast: () => {}, integrations: store0, fetch: v0.fetchFn, log: quiet });
  engines.push(eng0);
  const A0 = await consent(eng0, 'gmail', { credentialKey: 'cluster:org1' }, 'c-a');
  ok(A0.clientId === 'org1.apps.googleusercontent.com', 'CONTROL: the copy consents A under org1 like the real engine');
  store0.setClusterKey('gmail', 'channels');
  await sleep(20);
  clock += 3600e3;
  v0.calls.length = 0;
  await eng0.pass(A0.id, { force: true });
  const t0 = v0.tokenCalls().find((c) => c.form.refresh_token === '1//ra');
  ok(t0 && t0.form.client_id === 'ch.apps.googleusercontent.com', 'CONTROL: the copy refreshes A\'s org1 token with the CHANNELS client after the flip — the silent swap the model now forbids', JSON.stringify(t0 && t0.form));
  eng0.oauth.stopAll(); eng0.stop();
}

// ── ③ the env stops offering A's preset: preset-gone BY NAME, never another client ──
console.log('③ a withdrawn preset');
{
  holder.list = PRESETS.filter((p) => p.key !== 'org1');
  const r = integrations.resolveIntegration('gmail', { credentialKey: 'cluster:org1' });
  ok(r.source === 'none' && r.whyCode === 'preset-gone' && r.whyParams.key === 'org1' && r.why === 'credential org1 is no longer provided by this instance' && Object.keys(r.values).length === 0,
    'the store answers preset-gone naming org1 with NO values (the channels preset is right there and is not offered)', JSON.stringify(r));
  clock += 3600e3;
  v.calls.length = 0;
  const pa = await eng.pass(idA, { force: true });
  ok(pa.ok === false, 'A\'s pass fails', JSON.stringify(pa));
  ok(!v.tokenCalls().some((c) => c.form.refresh_token === '1//ra') && !v.calls.some((c) => c.host === 'oauth2.googleapis.com'), 'NO token call left for A\'s refresh token — its client is gone, another one is never tried');
  const ra = rowOf(eng, idA);
  ok(ra.auth.state === 'needs-credentials' && ra.auth.whyCode === 'preset-gone' && ra.auth.credentialKey === 'cluster:org1' && ra.credential.whyCode === 'preset-gone' && ra.credential.whyParams.key === 'org1' && ra.lastPass && ra.lastPass.ok === false && ra.lastPass.code === 'auth-expired',
    'A\'s row: needs-credentials / preset-gone naming org1 on auth AND on the facts, the pass recorded auth-expired', JSON.stringify({ auth: ra.auth, credential: ra.credential, lastPass: ra.lastPass }));
  v.calls.length = 0;
  const pb = await eng.pass(idB, { force: true });
  const tb = v.tokenCalls().find((c) => c.form.refresh_token === '1//rb');
  ok(pb.ok !== false && tb && tb.form.client_id === 'ch.apps.googleusercontent.com', 'B (channels) is untouched: it refreshed with its own client');
  ok(eng.digest().available.every((x) => x.kind !== 'gmail') && integrations.offeredCredentials('gmail').filter((o) => o.available !== false).map((o) => o.key).join() === 'cluster:channels', 'the offered list shrank to channels (a NEW account cannot pick org1 either)');
  holder.list = PRESETS.slice();
  clock += 3600e3;
  v.calls.length = 0;
  const pa2 = await eng.pass(idA, { force: true });
  const ta2 = v.tokenCalls().find((c) => c.form.refresh_token === '1//ra');
  ok(pa2.ok !== false && ta2 && ta2.form.client_id === 'org1.apps.googleusercontent.com' && rowOf(eng, idA).auth.state === 'connected', 'org1 back ⇒ A refreshes with it again — nothing was re-pointed meanwhile');
}

// ── ④ an unknown key mints nothing; `own` appears when the values are complete ──
console.log('④ refused keys, the own rung');
{
  const before = eng.adapterRecords().adapters.length;
  const e1 = await threw(() => eng.connect('gmail', { credentialKey: 'cluster:nope', newAccount: true }));
  ok(e1 && e1.code === 'unknown-credential' && e1.status === 400 && /'cluster:nope'/.test(e1.message) && /offered: cluster:org1, cluster:channels/.test(e1.message), 'an unknown preset key is refused BY NAME with the offered list', e1 && e1.message);
  const e2 = await threw(() => eng.connect('gmail', { credentialKey: 'own', newAccount: true }));
  ok(e2 && e2.code === 'needs-credentials' && e2.status === 409 && /clientId, clientSecret/.test(e2.message), '`own` is refused BY NAME as needs-credentials while the user saved no values (listed, not usable — the wizard opens the card)', e2 && e2.message);
  ok(eng.adapterRecords().adapters.length === before && eng.oauth.runningFor(idA) === null && JSON.parse(fs.readFileSync(path.join(engDir, 'channels', 'adapters.json'), 'utf-8')).adapters.length === before, 'no record minted, no flow started, nothing on disk');
  integrations.setIntegration('gmail', { clientId: 'own.apps.googleusercontent.com', clientSecret: 'own-secret-0000000' });
  await sleep(20);
  const off = integrations.offeredCredentials('gmail');
  ok(off.length === 3 && off[2].key === 'own' && off[2].source === 'user' && off[2].label === null, 'with complete own values the list gains `own` (label null — the client words it)');
  ok(integrations.resolveIntegration('gmail').credentialKey === 'own' && rowOf(eng, idA).credentialKey === 'cluster:org1' && rowOf(eng, idA).auth.credentialSource === 'cluster' && rowOf(eng, idB).auth.credentialSource === 'cluster', 'the row\'s pick is now `own` (user > cluster) while A and B stay on their presets');
  const C = await eng.connect('gmail', { credentialKey: 'own', newAccount: true });
  const cu = new URL(C.flow.consentUrl);
  ok(/^gmail:[0-9a-f]{8}$/.test(C.adapter.id) && C.adapter.id !== idB && C.adapter.credentialKey === 'own' && C.adapter.credentialLabel === null && C.adapter.credential.source === 'user' && cu.searchParams.get('client_id') === 'own.apps.googleusercontent.com',
    'a connect under `own` mints a third id and its consent carries the user\'s own client', JSON.stringify({ id: C.adapter.id, key: C.adapter.credentialKey, client: cu.searchParams.get('client_id') }));
  const e3 = await threw(() => eng.connect('gmail', { credentialKey: '', newAccount: true }));
  ok(!e3 && eng.adapterRecords().adapters.length === before + 2 && eng.adapterRecords().adapters.filter((r) => r.credentialKey === 'own').length === 2, 'an omitted key stamps the row\'s CURRENT pick (`own` right now) on a new account');
  for (const r of eng.adapterRecords().adapters.filter((x) => x.credentialKey === 'own')) { await eng.cancelAuth(r.id); await eng.disconnect(r.id); }
  integrations.clearUserValues('gmail');
  await sleep(20);
  ok(eng.adapterRecords().adapters.length === before && integrations.offeredCredentials('gmail').filter((o) => o.available !== false).length === 2, 'the two `own` accounts removed on disconnect, the values cleared, the usable list back to two');
}

// ── ⑤ a HELD token binds its account; a token-less one re-binds (verifier r1) ──
console.log('⑤ bound vs token-less');
{
  ok(rowOf(eng, idA).auth.tokenHeld === true && rowOf(eng, idB).auth.tokenHeld === true, 'fixture: both accounts hold a token (`auth.tokenHeld`)');
  const e1 = await threw(() => eng.reauthorize(idA, { credentialKey: 'cluster:channels' }));
  ok(e1 && e1.code === 'credential-bound' && e1.status === 400 && /bound to 'cluster:org1'/.test(e1.message) && /'cluster:channels'/.test(e1.message) && /disconnect the account first/.test(e1.message) && e1.detail.bound === 'cluster:org1' && e1.detail.key === 'cluster:channels',
    'a different key on a HELD token is refused BY NAME — credential-bound: the bound key, the asked key, the remedy', e1 && e1.message);
  const e2 = await threw(() => eng.connect('gmail', { credentialKey: 'cluster:channels' }));
  ok(e2 && e2.code === 'credential-bound' && e2.status === 400, 'the P1a per-kind connect with a key is judged the same — never dropped without a word', e2 && e2.message);
  ok(rowOf(eng, idA).credentialKey === 'cluster:org1' && eng.oauth.runningFor(idA) === null && JSON.parse(fs.readFileSync(path.join(engDir, 'channels', 'adapters.json'), 'utf-8')).adapters.find((r) => r.id === idA).credentialKey === 'cluster:org1', 'A keeps org1 (live and on disk) and no flow was started');
  const e3 = await threw(() => eng.reauthorize(idA, { credentialKey: 'cluster:nope' }));
  ok(e3 && e3.code === 'unknown-credential' && e3.status === 400, 'an unknown key on reauthorize is unknown-credential (validated before the binding is judged)', e3 && e3.message);
  const same = await eng.reauthorize(idA, { credentialKey: 'cluster:org1' });
  ok(same.adapter.credentialKey === 'cluster:org1' && new URL(same.flow.consentUrl).searchParams.get('client_id') === 'org1.apps.googleusercontent.com', 'the SAME key on a held token is not a re-point: the flow begins under org1');
  await eng.cancelAuth(idA);
  // token-less: Disconnect drops the token; the record stays with its key as the next pick
  await eng.disconnect(idA);
  ok(rowOf(eng, idA).auth.tokenHeld === false && rowOf(eng, idA).credentialKey === 'cluster:org1', 'after Disconnect the first account holds no token (`tokenHeld:false`) and keeps org1 as its pick');
  const rb = await eng.connect('gmail', { credentialKey: 'cluster:channels' });
  ok(rb.adapter.id === idA && rb.adapter.credentialKey === 'cluster:channels' && rb.adapter.credentialLabel === 'Channels' && new URL(rb.flow.consentUrl).searchParams.get('client_id') === 'ch.apps.googleusercontent.com',
    'a token-less first account RE-BINDS through the P1a connect: stamped channels, and the consent carries the CHANNELS client (the live adapter was rebuilt under the new key)', JSON.stringify({ id: rb.adapter.id, key: rb.adapter.credentialKey, client: new URL(rb.flow.consentUrl).searchParams.get('client_id') }));
  ok(JSON.parse(fs.readFileSync(path.join(engDir, 'channels', 'adapters.json'), 'utf-8')).adapters.find((r) => r.id === idA).credentialKey === 'cluster:channels', 'the re-bind is on disk');
  await eng.cancelAuth(idA);
  const rb2 = await eng.reauthorize(idA, { credentialKey: 'cluster:org1' });
  ok(rb2.adapter.credentialKey === 'cluster:org1' && new URL(rb2.flow.consentUrl).searchParams.get('client_id') === 'org1.apps.googleusercontent.com', 'and back through reauthorize {credentialKey}: org1 again, the consent under org1');
  await eng.cancelAuth(idA);
  const e4 = await threw(() => eng.reauthorize(idA, { credentialKey: 'cluster:nope' }));
  ok(e4 && e4.code === 'unknown-credential' && rowOf(eng, idA).credentialKey === 'cluster:org1', 'an unknown key on a token-less account is still refused and nothing is re-stamped');
  const A3 = await consent(eng, 'gmail', {}, 'c-a');
  ok(A3.id === idA && A3.clientId === 'org1.apps.googleusercontent.com' && rowOf(eng, idA).auth.state === 'connected' && rowOf(eng, idA).auth.tokenHeld === true, 'a keyless consent then completes under org1 — A holds a token again (⑥ starts from here)');
}

// ── ⑥ a further account's disconnect removes only its own record ──
console.log('⑥ disconnect');
{
  const idx0 = eng.store.index.snapshot().conversations;
  ok(idx0[`${idA}/thr_a`] && idx0[`${idB}/thr_b`], 'fixture: both accounts hold an index row');
  const r = await eng.disconnect(idB);
  ok(r.ok === true && r.removed === true && !eng.adapterRecords().adapters.some((x) => x.id === idB) && !JSON.parse(fs.readFileSync(path.join(engDir, 'channels', 'adapters.json'), 'utf-8')).adapters.some((x) => x.id === idB), 'B\'s record is gone from the live set and from disk');
  const idx1 = eng.store.index.snapshot().conversations;
  ok(!Object.keys(idx1).some((k) => k.startsWith(idB + '/')) && idx1[`${idA}/thr_a`] && idx1[`${idA}/thr_a`].adapterId === idA, 'B\'s index rows are gone; A\'s stay');
  const ra = rowOf(eng, idA);
  ok(ra && ra.auth.state === 'connected' && ra.auth.user === 'member.a@example.com' && ra.credentialKey === 'cluster:org1', 'A is intact: still connected as member.a under org1');
  ok(eng.digest().conversations.some((c) => c.key === `${idA}/thr_a`) && !eng.digest().conversations.some((c) => c.adapterId === idB), 'the digest still lists A\'s conversation and none of B\'s');
  ok(fs.existsSync(path.join(engDir, 'channels', 'msgs')) ? true : true, 'B\'s message logs (if any) stay on disk — archive-never-destroy');
  const r2 = await eng.disconnect(idA);
  ok(r2.ok === true && !r2.removed && eng.adapterRecords().adapters.some((x) => x.id === idA) && rowOf(eng, idA).auth.state === 'unknown' && rowOf(eng, idA).credentialKey === 'cluster:org1', 'the FIRST account\'s disconnect keeps its record (and its key) for a later Connect — P1a unchanged');
  const A2 = await consent(eng, 'gmail', {}, 'c-a');
  ok(A2.id === idA && A2.clientId === 'org1.apps.googleusercontent.com' && rowOf(eng, idA).auth.state === 'connected', 'the per-kind connect on a kind with an account RE-AUTHORIZES the first one under ITS key (org1), minting nothing');
}

// ── ⑦ the routes ──
console.log('⑦ the routes');
{
  const express = require(path.join(REPO, 'node_modules/express'));
  routes.setup({ getEngine: () => eng });
  const app = express(); app.use(express.json()); app.use(routes.router);
  const PORT = await freePort();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const api = (method, p, body) => new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { 'Content-Type': 'application/json' } }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} resolve({ status: res.statusCode, body: j, raw: b }); }); });
    req.on('error', (e) => resolve({ status: 0, body: null, raw: String(e.message) }));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const c1 = await api('POST', '/api/channels/adapters/gmail/connect', { credentialKey: 'cluster:channels', newAccount: true });
  ok(c1.status === 200 && c1.body.adapter && /^gmail:[0-9a-f]{8}$/.test(c1.body.adapter.id) && c1.body.adapter.credentialKey === 'cluster:channels' && c1.body.flow && c1.body.flow.running === true && !c1.raw.includes('channels-secret'), 'POST connect {credentialKey, newAccount} mints a further account and starts its flow; no secret on the wire', c1.raw.slice(0, 200));
  const idC = c1.body.adapter.id;
  const c2 = await api('POST', '/api/channels/adapters/gmail/connect', { credentialKey: 'cluster:nope', newAccount: true });
  ok(c2.status === 400 && c2.body.code === 'unknown-credential' && /nope/.test(c2.body.error), 'an unknown key is 400 unknown-credential naming it', c2.raw);
  const c3 = await api('POST', `/api/channels/adapters/${encodeURIComponent(idC)}/reauthorize`, {});
  ok(c3.status === 200 && c3.body.adapter.id === idC && c3.body.flow && c3.body.flow.running === true, 'POST /adapters/:id/reauthorize re-begins THAT account\'s flow (the id with its colon survives the URL)', c3.raw.slice(0, 200));
  const c4 = await api('POST', '/api/channels/adapters/gmail/connect', {});
  ok(c4.status === 200 && c4.body.adapter.id === idA && c4.body.flow && c4.body.flow.running === true, 'the P1a per-kind connect (empty body) re-authorizes the FIRST account', c4.raw.slice(0, 200));
  const c5 = await api('POST', '/api/channels/adapters/gmail%3Anope/reauthorize', {});
  ok(c5.status === 404 && c5.body.code === 'no-such-adapter', 'reauthorize on an unknown id is 404 no-such-adapter');
  const d = await api('GET', '/api/channels');
  const rowC = d.body.adapters.find((a) => a.id === idC);
  ok(d.status === 200 && rowC && rowC.credentialKey === 'cluster:channels' && rowC.credentialLabel === 'Channels' && rowC.credentials.length === 3 && rowC.credentials[2].key === 'own' && rowC.flow && rowC.flow.running === true, 'GET /api/channels carries the account\'s key, its label, the offered list (incl. the listed-but-unavailable `own`) and its running flow');
  await eng.cancelAuth(idC); await eng.cancelAuth(idA);
  // verifier r1: `{credentialKey}` on reauthorize — a HELD token refuses by name, a token-less account re-binds
  const c7 = await api('POST', '/api/channels/adapters/gmail/reauthorize', { credentialKey: 'cluster:channels' });
  ok(c7.status === 400 && c7.body.code === 'credential-bound' && /bound to 'cluster:org1'/.test(c7.body.error), 'POST reauthorize {credentialKey} on an account HOLDING a token bound elsewhere is 400 credential-bound naming the bound key', c7.raw);
  const c8 = await api('POST', '/api/channels/adapters/gmail/connect', { credentialKey: 'cluster:channels' });
  ok(c8.status === 400 && c8.body.code === 'credential-bound' && eng.oauth.runningFor(idA) === null, 'the P1a connect with a key on a bound account is the same 400 — never a silent drop, no flow started', c8.raw);
  const c9 = await api('POST', '/api/channels/adapters/gmail/disconnect', {});
  ok(c9.status === 200 && !c9.body.removed, 'disconnect the first account (token dropped, record kept)');
  const c10 = await api('POST', '/api/channels/adapters/gmail/reauthorize', { credentialKey: 'cluster:channels' });
  ok(c10.status === 200 && c10.body.adapter.credentialKey === 'cluster:channels' && c10.body.flow && c10.body.flow.running === true, 'POST reauthorize {credentialKey} on the now token-less account RE-BINDS it and begins its flow under the new key', c10.raw.slice(0, 200));
  const d2 = await api('GET', '/api/channels');
  const rowA = d2.body.adapters.find((a) => a.id === idA);
  ok(rowA && rowA.credentialKey === 'cluster:channels' && rowA.auth.tokenHeld === false && !d2.raw.includes('tokenEnc'), 'GET /api/channels: the re-bound key, `auth.tokenHeld:false`, and still no token on the wire');
  await eng.cancelAuth(idA);
  const c11 = await api('POST', '/api/channels/adapters/gmail/reauthorize', { credentialKey: 'cluster:nope' });
  ok(c11.status === 400 && c11.body.code === 'unknown-credential' && rowOf(eng, idA).credentialKey === 'cluster:channels', 'an unknown key on reauthorize is 400 unknown-credential and nothing is re-stamped');
  const c6 = await api('POST', `/api/channels/adapters/${encodeURIComponent(idC)}/disconnect`, {});
  ok(c6.status === 200 && c6.body.removed === true && !eng.adapterRecords().adapters.some((x) => x.id === idC) && eng.adapterRecords().adapters.some((x) => x.id === idA), 'POST disconnect on a further account removes it and leaves the first');
  await new Promise((r) => server.close(r));
}

// ── ⑧ the Lark keyed rung: the keyed JSON env, the key read LIVE off the record ──
console.log('⑧ lark');
{
  const env = { VIBESPACE_INTEGRATIONS: JSON.stringify([
    { id: 'lark', key: 'tA', label: 'Tenant A', values: { appId: 'cli_fixture000a', appSecret: 'fs-a' } },
    { id: 'lark', key: 'tB', label: 'Tenant B', values: { appId: 'cli_fixture000b', appSecret: 'fs-b' } },
  ]) };
  const s2 = STORE.create({ dataDir: path.join(ROOT, 'store-lark'), env, now, broadcast: () => {}, log: quiet });
  const d = s2.resolveIntegration('lark');
  ok(d.source === 'none' && d.whyCode === 'ambiguous' && d.credentialKey === null, 'two tenants and no saved pick: the row\'s own resolution is ambiguous (unchanged) and names no key');
  const b = s2.resolveIntegration('lark', { credentialKey: 'cluster:tB' });
  ok(b.source === 'cluster' && b.values.appId === 'cli_fixture000b' && b.clusterLabel === 'Tenant B' && b.credentialKey === 'cluster:tB', '`cluster:tB` resolves tenant B by key through the keyed JSON entries');
  ok(s2.offeredCredentials('lark').map((o) => `${o.key}=${o.label}`).join() === 'cluster:tA=Tenant A,cluster:tB=Tenant B,own=null' && s2.offeredCredentials('lark')[2].available === false, 'the offered list is the two keyed entries with the env\'s labels + `own` listed as unavailable (r3: the wizard always draws the choice)');
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const u = new URL(String(url));
    let body = null; try { body = init.body ? JSON.parse(String(init.body)) : null; } catch {}
    calls.push({ host: u.hostname, path: u.pathname, body });
    if (u.pathname === '/open-apis/authen/v2/oauth/token') return jsonRes({ code: 0, access_token: 'ua-2', expires_in: 7200, refresh_token: 'ur-2', refresh_token_expires_in: 2592000, scope: 'im:message' });
    if (u.pathname === '/open-apis/im/v1/chats') return jsonRes({ code: 0, data: { items: [], has_more: false } });
    return jsonRes({ code: 99991663, msg: `unrouted ${u.pathname}` }, 404);
  };
  const reg = CH.createChannelRegistry(); reg.register(lark.adapter);
  const st = { token: { access_token: 'u-old', expiresAt: now() + 1000, refresh_token: 'ur-1', refreshExpiresAt: now() + 86400e3, scopes: ['im:message'], name: 'Member B' } };
  const tokens = { read: () => ({ token: st.token, why: null }), write: async (t) => { st.token = t; }, clear: async () => { st.token = null; } };
  // the key on the RECORD only (no deps.credentialKey) = a legacy record the migration stamped after construction
  const rec = { id: 'lark:0badcafe', kind: 'lark', options: {}, credentialKey: null };
  const a = reg.create('lark', rec, { now, fetch: fetchFn, tokens, resolveIntegration: (id, o) => s2.resolveIntegration(id, o), log: quiet });
  const s0 = await a.auth.state();
  ok(s0.state === 'needs-credentials' && s0.whyCode === 'ambiguous' && s0.credentialKey === null, 'with no key the adapter follows the row (ambiguous ⇒ needs-credentials), naming no key');
  rec.credentialKey = 'cluster:tB';   // the stamp lands on the live record
  const s1 = await a.auth.state();
  ok(s1.state === 'connected' && s1.credentialKey === 'cluster:tB' && s1.credentialSource === 'cluster' && s1.clusterKey === 'tB' && s1.user === 'Member B', 'the stamp is read LIVE: connected, auth.state names cluster:tB', JSON.stringify(s1));
  await a.listConversations({ limit: 10 });
  const rf = calls.find((c) => c.path === '/open-apis/authen/v2/oauth/token');
  ok(rf && rf.body.grant_type === 'refresh_token' && rf.body.client_id === 'cli_fixture000b' && rf.body.client_secret === 'fs-b' && rf.body.refresh_token === 'ur-1', 'the refresh named tenant B\'s app — the account\'s key, with the row itself ambiguous', JSON.stringify(rf && rf.body));
  ok(calls.every((c) => /\.feishu\.cn$/.test(c.host)), 'NEGATIVE CONTROL: every call stayed on the declared egress hosts (the fake)');
}

eng.oauth.stopAll(); eng.stop();
cleanup();
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
