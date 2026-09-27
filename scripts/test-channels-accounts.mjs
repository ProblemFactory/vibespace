#!/usr/bin/env node
// THE ACCOUNT MODEL (2026-09-22, owner: "为啥不能和mount那种类似，管理的是账号，
// 每个账号添加的时候可以选oauth client？" — docs/design-communication-panel.zh.md
// §5 / §14.2) AND ITS r4 (2.369.165, docs/design-integrations-per-account.zh.md:
// "the OAuth client is chosen where the account is added, exactly like a
// storage mount; account cards work like mount rows"; gate row
// `test-channels-accounts`).
//
// The Communication panel manages ACCOUNTS the way the storage mounts do: N
// adapter records per kind, each carrying its OWN client choice — an env
// preset by key (`cluster:<presetKey>`) or its own client (`custom` +
// `credential {appId, appSecretEnc}` sealed under `.channels-key`, the mounts'
// `clientId` + `clientSecretEnc` shape) — and every consent / refresh /
// status of that account resolves THAT client.
//
//   ⓪ the store: presets only (`own` retired for an account-bound row), the
//      `{key,label}` preset wire, the digest's `kinds` for the type-first dialog
//   ① two Gmail accounts under two presets refresh with THEIR OWN client ids
//   ② the row's pick names another client; the account keeps ITS own — and a
//      PRE-FIX CONTROL (a patched engine copy that hands the adapter no key)
//      reproduces the silent swap
//   ③ a preset the env stopped offering answers `preset-gone` BY NAME —
//      never another client: no token call for that refresh token at all
//   ④ refused choices mint nothing: an unknown key, `own` (retired), an
//      invalid custom client (the FIELD named, never the value)
//   ⑤ THE CUSTOM CLIENT: stored on the record, sealed under `.channels-key`,
//      the file 0600, never on the wire (masked) nor in a frame or a log line;
//      `clientFor` order custom > cluster:<k>, a missing preset named; the
//      refresh carries the account's own id + secret. Controls: a copy with
//      no custom rung cannot begin the consent; a copy that stores the
//      plaintext is SEEN by the disk check
//   ⑥ THE TRANSIENT CONSENT: start → status → callback (loopback AND
//      paste-back) → connect{flowId} creates the record ONLY at connect; the
//      flow is taken once; not-done / mismatched client refused by name
//   ⑦ RE-AUTHORIZE WITH ANOTHER CLIENT REBINDS (the mount semantics): the
//      account keeps its old client + token until the consent under the new
//      one lands, then both are replaced in one write; a failed consent
//      changes nothing. PRE-FIX CONTROL: the base engine's `credential-bound`
//   ⑧ DUPLICATE copies exactly `DUPLICATE_FIELDS` (table-driven against a
//      blank record: every other field is the blank's), the secret RE-SEALED,
//      and NEVER the token / tracked / assignments / reach / log; it answers
//      an unauthorized record that consents on its own. Control: a copy that
//      also carries the token is SEEN
//   ⑨ REMOVE is refused `409 account-referenced` naming each reference
//      (assignment + adapter-scoped reach + unsettled outbox; an agent group
//      and a settled proposal NOT counted); Disconnect ignores references and
//      keeps the record for EVERY account (the pre-r4 special case gone — the
//      base engine as the control); unreferenced ⇒ record + index gone.
//      Control: a copy whose reference check answers nothing removes a
//      referenced account
//   ⑩ the routes: /api/channels/oauth/{start,status,callback}, connect
//      {flowId}, duplicate, DELETE (409 by name), the owner-only config (D3 —
//      the ONE answer that carries the custom secret), PUT label / same-id
//      secret / another id ⇒ 409 client-change-needs-reauth; no other body
//      carries the secret
//   ⑪ the Lark keyed rung over the keyed JSON env: the account's key read
//      LIVE off the record, the refresh naming ITS app
//   ⑫ verify r5 (credential): a refresh IN FLIGHT when a disconnect or a
//      client-switch rebind lands writes nothing back (the disconnected
//      account used to reconnect itself; the rebind ended with the OLD
//      client's token ⇒ invalid_grant); a consent that NAMES another identity
//      than the account's is refused by name at the ONE token door (same-client
//      re-auth, rebind, re-connect after a disconnect), the same person under
//      another client accepted, a Lark rebind matching on user_id across apps;
//      the PURE table (src/channel-identity.js) — since B-f4cb in
//      test-channels-accounts-model (fast; this suite is heavy at 13 s). Control: an engine copy
//      without the check stores the stranger's consent
//
// Zero vendor calls: every fetch is the fake below; the consent runs against
// the engine's own loopback on an ephemeral port. Per-pid scratch dirs
// (scripts/scratch.mjs), a free port for the route leg.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const STORE = require(path.join(REPO, 'src/server/integration-store.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const SB = require(path.join(REPO, 'src/secret-box.js'));
const gmail = require(path.join(REPO, 'src/channels/gmail.js'));
const lark = require(path.join(REPO, 'src/channels/lark.js'));
const routes = require(path.join(REPO, 'src/routes/channels.js'));
const createGroups = require(path.join(REPO, 'src/server/groups-engine.js')).create;
const ENGINE_PATH = path.join(REPO, 'src/server/channels-engine.js');
/** The master the r4 lane branched from — the PRE-FIX engine for the controls
 *  that name a retired behaviour (credential-bound, disconnect-removes). */
const PRE_R4 = '348aa226';

const ROOT = scratch('chan-accounts');
// lane R5 (drain rule 18): the per-second PACE runs on a private clock this suite's sleep advances —
// exact and instantaneous, so a leg about something else never waits a real second per Gmail thread
const FAST_PACE = (() => { let t = 0; return { paceClock: () => t, sleep: (ms) => new Promise((r) => { t += ms; setImmediate(r); }) }; })();
// The pre-fix engine copy is written OUTSIDE the tree (scripts/mutant-copy.mjs,
// `require` re-bound on line 1 to the real module's path); its scratch dir is
// removed at exit.
const MUTA = mutantCopies('chan-accounts', REPO);
sweepLegacy(REPO, ['src/server'], /^\.channels-engine\.prefix-(\d+)-\d+\.js$/);   // what a pre-fix run stranded (dead PIDs only)
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

const T0 = 1_700_000_000_000;
let clock = T0;
const now = () => clock;
const quiet = { log() {}, warn() {}, error() {} };
const logLines = [];
const capLog = { log: (...a) => logLines.push(a.join(' ')), warn: (...a) => logLines.push(a.join(' ')), error: (...a) => logLines.push(a.join(' ')) };
const jsonRes = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const CUSTOM_ID = 'custom1.apps.googleusercontent.com';
const CUSTOM_SECRET = 'GOCSPX-cust0m-SECRET-7f3Q9zZ';   // unmistakable in any byte stream
const CUSTOM_SECRET2 = 'GOCSPX-second-SECRET-0000aaa';

// ── the fake Google: one mailbox per consent CODE, every token call records the client it received ──
function mkVendor() {
  const calls = [];
  const accounts = {
    'c-a': { email: 'member.a@example.com', refresh: '1//ra', thread: 'thr_a' },
    'c-b': { email: 'member.b@example.com', refresh: '1//rb', thread: 'thr_b' },
    'c-c': { email: 'member.c@example.com', refresh: '1//rc', thread: 'thr_c' },
    'c-d': { email: 'member.d@example.com', refresh: '1//rd', thread: 'thr_d' },
    'c-e': { email: 'member.e@example.com', refresh: '1//re', thread: 'thr_e' },
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
/** The browser landing on the loopback after the consent page. */
async function land(flow, code) {
  const cu = new URL(flow.consentUrl);
  const r = await get(`${flow.redirectUri}/?state=${cu.searchParams.get('state')}&code=${code}`);
  await sleep(80);   // the exchange + the done hook + the pass it kicked
  return r;
}
/** Connect one account end to end through the REAL engine (the pre-r4
 *  record-first path): begin → the loopback redirect → the exchange → the pass. */
async function consent(eng, kind, opts, code) {
  const r = await eng.connect(kind, opts);
  const cu = new URL(r.flow.consentUrl);
  const landed = await land(r.flow, code);
  return { r, id: r.adapter.id, clientId: cu.searchParams.get('client_id'), landed };
}
const rowOf = (eng, id) => eng.digest().adapters.find((a) => a.id === id) || null;
const diskOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'channels', 'adapters.json'), 'utf-8')).adapters;
const rawDisk = (dir) => fs.readFileSync(path.join(dir, 'channels', 'adapters.json'), 'utf-8');

/** A patched copy of the engine, written OUTSIDE the tree (scripts/mutant-copy.mjs,
 *  unique per copy). Every needle must exist EXACTLY once — the control really
 *  removes what it names. */
function patchedEngine(needles) {
  const src = fs.readFileSync(ENGINE_PATH, 'utf-8');
  for (const [n] of needles) if (src.split(n).length !== 2) throw new Error(`control needle not found exactly once: ${n.slice(0, 90)}`);
  return require(MUTA.write(ENGINE_PATH, needles.reduce((acc, [a, b]) => acc.replace(a, b), src), 'prefix'));
}
/** The PRE-r4 engine, byte for byte from git (null when the history is not
 *  present — a shallow mirror clone — and the leg SAYS it skipped). */
function preR4Engine() {
  let src;
  try { src = execFileSync('git', ['show', `${PRE_R4}:src/server/channels-engine.js`], { cwd: REPO, env: gitEnvFrom(process.env), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return null; }
  return require(MUTA.write(ENGINE_PATH, src, 'pre-r4'));
}

const storeDir = path.join(ROOT, 'store'); fs.mkdirSync(storeDir, { recursive: true });
const integrations = STORE.create({ dataDir: storeDir, env: {}, now, broadcast: () => {}, drivePresets: () => holder.list, log: quiet });
const v = mkVendor();
const engDir = path.join(ROOT, 'eng'); fs.mkdirSync(engDir, { recursive: true });
const frames = [];
const eng = ENG.create({ dataDir: engDir, env: {}, now, broadcast: (m) => frames.push(m), integrations, fetch: v.fetchFn, log: capLog , ...FAST_PACE });
const engines = [eng];
process.on('exit', () => { for (const e of engines) { try { e.oauth.stopAll(); e.stop(); } catch {} } });
const chBox = SB.secretBox(path.join(engDir, ENG.KEY_FILE));   // the engine's own key file — reading the seal back

// ── ⓪ the store: presets only, the preset wire, the type-first dialog's kinds ──
console.log('⓪ the store');
{
  const d = integrations.resolveIntegration('gmail');
  ok(d.source === 'cluster' && d.clusterKey === 'channels' && d.credentialKey === 'cluster:channels', `the row's keyless pick (prefer \`channels\`) names its key: ${d.credentialKey}`);
  const a = integrations.resolveIntegration('gmail', { credentialKey: 'cluster:org1' });
  ok(a.source === 'cluster' && a.clusterKey === 'org1' && a.values.clientId === 'org1.apps.googleusercontent.com' && a.credentialKey === 'cluster:org1' && a.missing.length === 0, '`cluster:org1` resolves THAT preset whatever the pick prefers');
  const off = integrations.offeredCredentials('gmail');
  ok(off.length === 2 && off.map((o) => o.key).join() === 'cluster:org1,cluster:channels' && off.every((o) => !('values' in o) && !('clientSecret' in o)), 'offeredCredentials for an account-bound row = the presets ONLY (r4: `own` retired, `custom` lives on the account)');
  const own0 = integrations.resolveIntegration('gmail', { credentialKey: 'own' });
  ok(own0.source === 'none' && own0.whyCode === 'own-retired', '`own` on an account-bound row answers `own-retired` BY NAME (never the cluster, never the saved values)');
  const pf = integrations.presetsFor('gmail');
  ok(JSON.stringify(pf) === JSON.stringify([{ key: 'org1', label: 'Org 1' }, { key: 'channels', label: 'Channels' }]), 'presetsFor = the wire shape `{key,label}` from the ONE reader (drivePresets for Google) — no value', JSON.stringify(pf));
  const bogus = integrations.resolveIntegration('gmail', { credentialKey: 'nope' });
  ok(bogus.source === 'none' && bogus.whyCode === 'unknown-credential', 'a key of neither form is `unknown-credential`, not a throw');
  const kg = eng.digest().kinds.find((k) => k.kind === 'gmail');
  ok(kg && kg.bindsPerAccount === true && kg.presets.length === 2 && /refresh token is bound/.test(kg.clientHint) && kg.clientFields.id.key === 'clientId' && kg.clientFields.secret.key === 'clientSecret' && kg.optionsSchema.some((o) => o.key === 'query'), 'the digest\'s `kinds` gives the type-first dialog each type\'s presets, its hint, the custom client\'s two fields and its own options');
  const kl = eng.digest().kinds.find((k) => k.kind === 'lark');
  ok(kl && kl.setup && kl.setup.prerequisites.length === 3 && kl.clientFields.id.key === 'appId' && kl.clientFields.secret.key === 'appSecret', 'lark\'s kind carries its console setup (the custom branch\'s callback row + three prerequisites) and its App ID / App Secret fields');
}

// ── ① two accounts, two presets, two refreshes, two client ids ──
console.log('① two accounts under two presets');
let idA = null, idB = null;
{
  const A = await consent(eng, 'gmail', { credentialKey: 'cluster:org1' }, 'c-a');
  idA = A.id;
  ok(idA === 'gmail' && A.clientId === 'org1.apps.googleusercontent.com' && A.landed.status === 200, `the FIRST account's id IS the kind and its consent carried org1's client (${A.clientId})`);
  const B = await consent(eng, 'gmail', { clientPreset: 'channels', newAccount: true }, 'c-b');
  idB = B.id;
  ok(/^gmail:[0-9a-f]{8}$/.test(idB) && B.clientId === 'ch.apps.googleusercontent.com', `a further account is \`gmail:<8 hex>\` (${idB}) and its consent carried the channels client (named with the storage dialog's \`clientPreset\` spelling)`);
  const ra = rowOf(eng, idA), rb = rowOf(eng, idB);
  ok(ra && ra.auth.state === 'connected' && ra.auth.user === 'member.a@example.com' && ra.credentialKey === 'cluster:org1' && ra.credentialLabel === 'Org 1' && ra.credential.source === 'cluster' && ra.credential.clusterLabel === 'Org 1' && ra.auth.credentialKey === 'cluster:org1',
    'A\'s row: connected as member.a, credentialKey cluster:org1, its label, the facts FOR THAT KEY, auth.state naming the key', JSON.stringify(ra && { auth: ra.auth, credentialKey: ra.credentialKey, credentialLabel: ra.credentialLabel }));
  ok(rb && rb.auth.state === 'connected' && rb.credentialKey === 'cluster:channels' && rb.credentialLabel === 'Channels' && rb.presets.length === 2 && rb.customClient === null && rb.bindsPerAccount === true,
    'B\'s row: connected under cluster:channels; the row carries the presets for its Edit dialog and no custom client');
  const disk = diskOf(engDir);
  ok(disk.length === 2 && disk.find((r) => r.id === idA).credentialKey === 'cluster:org1' && disk.find((r) => r.id === idB).credentialKey === 'cluster:channels', 'adapters.json holds both records with their keys');
  ok(eng.digest().conversations.some((c) => c.key === `${idA}/thr_a`) && eng.digest().conversations.some((c) => c.key === `${idB}/thr_b`), 'each account discovered ITS mailbox\'s thread under its own adapter id');
  clock += 3600e3;
  v.calls.length = 0;
  const pa = await eng.pass(idA, { force: true });
  const pb = await eng.pass(idB, { force: true });
  const tc = v.tokenCalls();
  const ta = tc.find((c) => c.form.refresh_token === '1//ra'), tb = tc.find((c) => c.form.refresh_token === '1//rb');
  ok(pa.ok !== false && pb.ok !== false && tc.length === 2, `both passes refreshed (${tc.length} refresh calls)`, JSON.stringify({ pa, pb }));
  ok(ta && ta.form.client_id === 'org1.apps.googleusercontent.com' && ta.form.client_secret === 'org1-secret-000000', 'A\'s refresh token went to org1\'s client', JSON.stringify(ta && ta.form));
  ok(tb && tb.form.client_id === 'ch.apps.googleusercontent.com' && tb.form.client_secret === 'channels-secret-0000', 'B\'s refresh token went to the channels client', JSON.stringify(tb && tb.form));
}

// ── ② the row's pick is another client; A keeps ITS own (and the pre-fix control swaps) ──
console.log('② the row\'s pick vs the account\'s own');
{
  ok(integrations.resolveIntegration('gmail').credentialKey === 'cluster:channels', 'the row\'s keyless pick names channels');
  clock += 3600e3;
  v.calls.length = 0;
  const pa = await eng.pass(idA, { force: true });
  const ta = v.tokenCalls().find((c) => c.form.refresh_token === '1//ra');
  ok(pa.ok !== false && ta && ta.form.client_id === 'org1.apps.googleusercontent.com', 'A\'s refresh goes to org1 — the account\'s key, not the row\'s pick', JSON.stringify(ta && ta.form));
  // THE PRE-FIX CONTROL: an engine whose adapters get no credential key —
  // every account follows the row's pick; when the pick moves, A's client
  // swaps. Two needles: the deps hand-down AND the record stamp (the adapter
  // reads its key off the LIVE record as a fallback).
  const ENG0 = patchedEngine([['deliver, liveSessions, credentialKey: rec.credentialKey || null, meter: ', 'deliver, liveSessions, meter: '], ['      credentialKey: credentialKey || null,\n', '      credentialKey: null,\n']]);
  ok(true, 'POSITIVE CONTROL: both patched strings exist exactly once in the engine (the control really removes the key hand-down and the record stamp)');
  const holder0 = { list: [PRESETS[0]] };   // org1 only ⇒ the keyless pick IS org1
  const store0 = STORE.create({ dataDir: path.join(ROOT, 'store0'), env: {}, now, broadcast: () => {}, drivePresets: () => holder0.list, log: quiet });
  const v0 = mkVendor();
  const d0 = path.join(ROOT, 'eng0'); fs.mkdirSync(d0, { recursive: true });
  const eng0 = ENG0.create({ dataDir: d0, env: {}, now, broadcast: () => {}, integrations: store0, fetch: v0.fetchFn, log: quiet , ...FAST_PACE });
  engines.push(eng0);
  const A0 = await consent(eng0, 'gmail', { credentialKey: 'cluster:org1' }, 'c-a');
  ok(A0.clientId === 'org1.apps.googleusercontent.com', 'CONTROL: the copy consents A under org1 like the real engine');
  holder0.list = PRESETS.slice();   // `channels` appears ⇒ the keyless pick moves to it (prefer)
  clock += 3600e3;
  v0.calls.length = 0;
  await eng0.pass(A0.id, { force: true });
  const t0 = v0.tokenCalls().find((c) => c.form.refresh_token === '1//ra');
  ok(t0 && t0.form.client_id === 'ch.apps.googleusercontent.com', 'CONTROL: the copy refreshes A\'s org1 token with the CHANNELS client once the pick moved — the silent swap the model forbids', JSON.stringify(t0 && t0.form));
  eng0.oauth.stopAll(); eng0.stop();
}

// ── ③ the env stops offering A's preset: preset-gone BY NAME, never another client ──
console.log('③ a withdrawn preset');
{
  holder.list = PRESETS.filter((p) => p.key !== 'org1');
  const r = integrations.resolveIntegration('gmail', { credentialKey: 'cluster:org1' });
  ok(r.source === 'none' && r.whyCode === 'preset-gone' && r.whyParams.key === 'org1' && Object.keys(r.values).length === 0, 'the store answers preset-gone naming org1 with NO values (the channels preset is right there and is not offered)', JSON.stringify(r));
  clock += 3600e3;
  v.calls.length = 0;
  const pa = await eng.pass(idA, { force: true });
  ok(pa.ok === false && !v.calls.some((c) => c.host === 'oauth2.googleapis.com'), 'A\'s pass fails and NO token call is made — its client is gone, another one is never tried', JSON.stringify(pa));
  const ra = rowOf(eng, idA);
  ok(ra.auth.state === 'needs-credentials' && ra.auth.whyCode === 'preset-gone' && ra.credential.whyParams.key === 'org1' && ra.lastPass.code === 'auth-expired', 'A\'s row: needs-credentials / preset-gone naming org1', JSON.stringify({ auth: ra.auth, credential: ra.credential }));
  ok(eng.clientFor(eng.adapterRecords().adapters.find((x) => x.id === idA)).whyCode === 'preset-gone', '`clientFor` names the missing preset for the record itself');
  holder.list = PRESETS.slice();
  clock += 3600e3;
  v.calls.length = 0;
  const pa2 = await eng.pass(idA, { force: true });
  const ta2 = v.tokenCalls().find((c) => c.form.refresh_token === '1//ra');
  ok(pa2.ok !== false && ta2 && ta2.form.client_id === 'org1.apps.googleusercontent.com' && rowOf(eng, idA).auth.state === 'connected', 'org1 back ⇒ A refreshes with it again — nothing was re-pointed meanwhile');
}

// ── ④ refused choices mint nothing ──
console.log('④ refused choices');
{
  const before = eng.adapterRecords().adapters.length;
  const e1 = await threw(() => eng.connect('gmail', { credentialKey: 'cluster:nope', newAccount: true }));
  ok(e1 && e1.code === 'unknown-credential' && e1.status === 400 && /'cluster:nope'/.test(e1.message) && /offered: cluster:org1, cluster:channels/.test(e1.message), 'an unknown preset key is refused BY NAME with the offered list', e1 && e1.message);
  const e2 = await threw(() => eng.connect('gmail', { credentialKey: 'own', newAccount: true }));
  ok(e2 && e2.code === 'own-retired' && e2.status === 400 && /'custom'/.test(e2.message), '`own` is refused BY NAME as own-retired, naming `custom` as the way (r4)', e2 && e2.message);
  const e3 = await threw(() => eng.connect('gmail', { credentialKey: 'custom', credential: { appId: 'not-a-google-id', appSecret: 'shh-DO-NOT-ECHO-1234' }, newAccount: true }));
  ok(e3 && e3.code === 'invalid-client' && e3.status === 400 && /clientId/.test(e3.message) && !e3.message.includes('shh-DO-NOT-ECHO') && e3.detail.errors.clientId, 'an invalid custom client is 400 invalid-client naming the FIELD and the rule — never the value', e3 && e3.message);
  const e4 = await threw(() => eng.connect('gmail', { credentialKey: 'custom', credential: { appId: CUSTOM_ID }, newAccount: true }));
  ok(e4 && e4.code === 'invalid-client' && /clientSecret/.test(e4.message), 'a custom client without its secret names the missing field', e4 && e4.message);
  ok(eng.adapterRecords().adapters.length === before && diskOf(engDir).length === before, 'no record minted, nothing on disk');
}

// ── ⑤ the custom client: on the record, sealed, never on the wire ──
console.log('⑤ the custom client');
let idC = null;
{
  const framesAt = frames.length;
  const C = await consent(eng, 'gmail', { credentialKey: 'custom', credential: { appId: CUSTOM_ID, appSecret: CUSTOM_SECRET }, newAccount: true, name: 'Custom mail' }, 'c-c');
  idC = C.id;
  ok(C.clientId === CUSTOM_ID && C.r.adapter.credentialKey === 'custom' && C.r.adapter.label === 'Custom mail', `the consent carried the account's OWN client id (${C.clientId}) and the dialog's name`);
  const rec = diskOf(engDir).find((r) => r.id === idC);
  ok(rec && rec.credentialKey === 'custom' && rec.credential && rec.credential.appId === CUSTOM_ID && /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(rec.credential.appSecretEnc), 'on disk: credentialKey `custom` + credential {appId, appSecretEnc} (a secret-box blob)', JSON.stringify(rec && rec.credential));
  ok(chBox.dec(rec.credential.appSecretEnc) === CUSTOM_SECRET, 'the blob opens with `.channels-key` (this engine\'s key file) to the secret typed — SEALED under the channels key');
  ok(!rawDisk(engDir).includes(CUSTOM_SECRET), 'the plaintext secret appears nowhere in adapters.json');
  ok((fs.statSync(path.join(engDir, 'channels', 'adapters.json')).mode & 0o777) === 0o600, 'adapters.json is 0600 (it holds sealed tokens and an account\'s sealed client secret)', (fs.statSync(path.join(engDir, 'channels', 'adapters.json')).mode & 0o777).toString(8));
  const row = rowOf(eng, idC);
  ok(row.auth.state === 'connected' && row.auth.user === 'member.c@example.com' && row.credential.source === 'custom' && row.customClient.appId === CUSTOM_ID && row.customClient.secretMasked === '••••' + CUSTOM_SECRET.slice(-4), 'the row: connected, facts `custom`, customClient = the id + the MASKED secret');
  ok(!JSON.stringify(eng.digest()).includes(CUSTOM_SECRET) && !frames.slice(framesAt).some((f) => JSON.stringify(f).includes(CUSTOM_SECRET)), 'the digest and every broadcast frame carry NO plaintext secret');
  ok(!logLines.some((l) => l.includes(CUSTOM_SECRET)), 'no log line carries it');
  // the refresh carries the account's own client
  clock += 3600e3;
  v.calls.length = 0;
  const pc = await eng.pass(idC, { force: true });
  const tc = v.tokenCalls().find((c) => c.form.refresh_token === '1//rc');
  ok(pc.ok !== false && tc && tc.form.client_id === CUSTOM_ID && tc.form.client_secret === CUSTOM_SECRET, 'the refresh carried the account\'s OWN id + secret (the only place the secret leaves: the vendor call itself)', JSON.stringify(tc && { id: tc.form.client_id }));
  // clientFor order: custom > cluster:<k>; a missing preset named
  const live = eng.adapterRecords().adapters.find((r) => r.id === idC);
  const r1 = eng.clientFor(live);
  ok(r1.source === 'custom' && r1.values.clientId === CUSTOM_ID && r1.credentialKey === 'custom', 'clientFor(custom) = the record\'s own client, whatever presets the env offers');
  const r2 = eng.clientFor({ ...live, credentialKey: 'cluster:org1' });
  ok(r2.source === 'cluster' && r2.values.clientId === 'org1.apps.googleusercontent.com', 'clientFor(cluster:org1) = the preset, even with a custom credential lying on the record (the KEY decides)');
  const r3 = eng.clientFor({ ...live, credentialKey: 'cluster:gone' });
  ok(r3.source === 'none' && r3.whyCode === 'preset-gone' && r3.whyParams.key === 'gone', 'clientFor(cluster:gone) = none, preset-gone naming `gone`');
  const r4 = eng.clientFor({ ...live, credential: null });
  ok(r4.source === 'none' && r4.whyCode === 'custom-missing', 'clientFor(custom) with no credential on the record = none, custom-missing — never a preset');
  // CONTROL 1: a copy without the custom rung cannot serve the account
  const ENG1 = patchedEngine([["      if (row && row.bindsPerAccount && k === CUSTOM_KEY) return customClientOf(rec, row, CUSTOM_KEY);\n", '']]);
  const d1 = path.join(ROOT, 'eng1'); fs.mkdirSync(d1, { recursive: true });
  const eng1 = ENG1.create({ dataDir: d1, env: {}, now, broadcast: () => {}, integrations, fetch: v.fetchFn, log: quiet , ...FAST_PACE });
  engines.push(eng1);
  const c1 = await threw(() => eng1.connect('gmail', { credentialKey: 'custom', credential: { appId: CUSTOM_ID, appSecret: CUSTOM_SECRET }, newAccount: true }));
  ok(c1 && (c1.code === 'needs-credentials' || c1.code === 'auth-expired') && /unknown credential key 'custom'/.test(c1.message), 'CONTROL: a copy with no custom rung sends the adapter to the store, which knows no `custom` — the consent cannot begin', c1 && c1.message);
  eng1.stop();
  // CONTROL 2: a copy that stores the plaintext is SEEN by the disk check
  const ENG2 = patchedEngine([
    ['    return { appId: v.values[cf.idKey] || \'\', appSecretEnc: box.enc(v.values[cf.secretKey]) };', '    return { appId: v.values[cf.idKey] || \'\', appSecretEnc: v.values[cf.secretKey] };'],
    ['    try { secret = box.dec(c.appSecretEnc); }\n', '    try { secret = c.appSecretEnc; }\n'],   // …and reads it back unopened, so the copy runs end to end
  ]);
  const d2 = path.join(ROOT, 'eng2'); fs.mkdirSync(d2, { recursive: true });
  const eng2 = ENG2.create({ dataDir: d2, env: {}, now, broadcast: () => {}, integrations, fetch: v.fetchFn, log: quiet , ...FAST_PACE });
  engines.push(eng2);
  await eng2.connect('gmail', { credentialKey: 'custom', credential: { appId: CUSTOM_ID, appSecret: CUSTOM_SECRET }, newAccount: true });
  ok(rawDisk(d2).includes(CUSTOM_SECRET), 'CONTROL: a copy that skips the seal writes the plaintext — the disk check above would be red');
  eng2.oauth.stopAll(); eng2.stop();
}

// ── ⑥ the transient consent: the record exists only at connect ──
console.log('⑥ the transient consent');
let idD = null;
{
  const count0 = eng.adapterRecords().adapters.length;
  const disk0 = rawDisk(engDir);
  const st = await eng.startOAuth({ kind: 'gmail', clientPreset: 'org1' });
  ok(st.flowId && st.url && new URL(st.url).searchParams.get('client_id') === 'org1.apps.googleusercontent.com' && st.credentialKey === 'cluster:org1', 'start {kind, clientPreset} begins a consent under THAT client and answers {flowId, url}');
  ok(eng.adapterRecords().adapters.length === count0 && rawDisk(engDir) === disk0 && !eng.digest().adapters.some((a) => /^pending:/.test(a.id)), 'NO record exists yet — not live, not on disk, not in the digest');
  const s0 = eng.oauthStatus(st.flowId);
  ok(s0.running === true && s0.done === false && s0.token === null, 'status: running, no token yet');
  const early = await threw(() => eng.connect('gmail', { flowId: st.flowId }));
  ok(early && early.code === 'flow-not-done' && early.status === 409, 'connect before the sign-in finished is 409 flow-not-done by name');
  await land(st.flow, 'c-d');
  const s1 = eng.oauthStatus();   // no flowId = the latest (the storage block's status poll)
  ok(s1.done === true && s1.ok === true && s1.token === st.flowId && s1.user === 'member.d@example.com' && s1.flowId === st.flowId, 'status after the loopback landed: done, ok, `token` = the FLOW ID (the handle the shared block writes into its field), the signed-in user', JSON.stringify(s1));
  ok(eng.adapterRecords().adapters.length === count0 && rawDisk(engDir) === disk0, 'still NO record after the sign-in — only Connect creates it');
  const mism = await threw(() => eng.connect('gmail', { flowId: st.flowId, credentialKey: 'cluster:channels' }));
  ok(mism && mism.code === 'flow-client-mismatch' && mism.status === 400, 'connect naming ANOTHER client than the sign-in ran under is 400 flow-client-mismatch (a token is bound to its client)', mism && mism.message);
  const wrongKind = await threw(() => eng.connect('lark', { flowId: st.flowId }));
  ok(wrongKind && wrongKind.code === 'flow-kind-mismatch', 'a Gmail sign-in cannot connect a Lark account');
  const c = await eng.connect('gmail', { flowId: st.flowId, name: 'Work mail', options: { query: 'label:work' }, credentialKey: 'cluster:org1' });
  idD = c.adapter.id;
  const recD = diskOf(engDir).find((r) => r.id === idD);
  ok(recD && recD.credentialKey === 'cluster:org1' && recD.label === 'Work mail' && recD.options.query === 'label:work' && recD.auth.tokenEnc && recD.auth.user === 'member.d@example.com', 'connect {flowId} CREATES the record: the flow\'s client, the dialog\'s name and options, the token that flow minted (sealed)');
  ok(c.adapter.auth.state === 'connected' && c.adapter.auth.tokenHeld === true, 'and it is connected at once — no second consent');
  const again = await threw(() => eng.connect('gmail', { flowId: st.flowId }));
  ok(again && again.code === 'no-flow' && again.status === 404, 'the flow is TAKEN once: a second connect with it is 404 no-flow');
  // a custom client through the transient flow + the PASTE-BACK path
  const st2 = await eng.startOAuth({ kind: 'gmail', clientId: CUSTOM_ID, clientSecret: CUSTOM_SECRET2 });
  ok(new URL(st2.url).searchParams.get('client_id') === CUSTOM_ID && st2.credentialKey === 'custom', 'start {clientId, clientSecret} = a custom client (the storage dialog\'s spelling)');
  const cu = new URL(st2.url);
  const bad = await threw(() => eng.oauthCallback({ url: `http://127.0.0.1:1/?state=wrong&code=c-e`, flowId: st2.flowId }));
  ok(bad && bad.status === 400 && /state mismatch/.test(bad.message), 'a pasted URL with another state is refused 400 (the loopback\'s state check, verbatim)', bad && bad.message);
  const pb = await eng.oauthCallback({ url: `http://127.0.0.1:1/?state=${cu.searchParams.get('state')}&code=c-e` });
  ok(pb.ok === true && pb.token === st2.flowId && pb.user === 'member.e@example.com', 'paste-back (no flowId = the latest) completes the sign-in and answers the flow handle', JSON.stringify(pb));
  const c2 = await eng.connect('gmail', { flowId: st2.flowId, credentialKey: 'custom', credential: { appId: CUSTOM_ID, appSecret: CUSTOM_SECRET2 } });
  const recE = diskOf(engDir).find((r) => r.id === c2.adapter.id);
  ok(recE.credentialKey === 'custom' && chBox.dec(recE.credential.appSecretEnc) === CUSTOM_SECRET2 && !rawDisk(engDir).includes(CUSTOM_SECRET2), 'connect with the SAME custom client the flow ran under creates a custom account, the secret sealed');
  await eng.remove(c2.adapter.id);
  // CONTROL: the pre-r4 record-first path mints the record BEFORE any consent
  const count1 = eng.adapterRecords().adapters.length;
  const legacy = await eng.connect('gmail', { clientPreset: 'org1', newAccount: true });
  ok(eng.adapterRecords().adapters.length === count1 + 1 && legacy.adapter.auth.tokenHeld === false, 'CONTROL: the record-first path (no flowId) holds a token-less record while its consent runs — what the transient flow exists to avoid');
  await eng.cancelAuth(legacy.adapter.id); await eng.remove(legacy.adapter.id);
}

// ── ⑦ re-authorize with another client REBINDS (the mount semantics) ──
console.log('⑦ re-authorize = rebind');
{
  ok(rowOf(eng, idA).auth.tokenHeld === true && rowOf(eng, idA).credentialKey === 'cluster:org1', 'fixture: A holds a token under org1');
  const r = await eng.reauthorize(idA, { credentialKey: 'cluster:channels' });
  ok(r.rebind === true && r.flow && new URL(r.flow.consentUrl).searchParams.get('client_id') === 'ch.apps.googleusercontent.com', 'a different client on a HELD token is NOT refused: the consent runs under the NEW client (`rebind:true`)', JSON.stringify({ rebind: r.rebind }));
  ok(rowOf(eng, idA).credentialKey === 'cluster:org1' && rowOf(eng, idA).flow && rowOf(eng, idA).flow.running === true && diskOf(engDir).find((x) => x.id === idA).credentialKey === 'cluster:org1', 'until that consent lands A keeps org1 (live and on disk) and its row shows the running flow');
  clock += 3600e3; v.calls.length = 0;
  await eng.pass(idA, { force: true });
  ok(v.tokenCalls().find((c) => c.form.refresh_token === '1//ra')?.form.client_id === 'org1.apps.googleusercontent.com', 'a refresh WHILE the rebind is pending still carries org1 — the token is never sent to a client it was not issued under');
  await land(r.flow, 'c-a');
  const disk = diskOf(engDir).find((x) => x.id === idA);
  ok(disk.credentialKey === 'cluster:channels' && disk.auth.user === 'member.a@example.com' && rowOf(eng, idA).auth.state === 'connected', 'the consent landed: client AND token replaced together (cluster:channels, member.a)');
  clock += 3600e3; v.calls.length = 0;
  await eng.pass(idA, { force: true });
  ok(v.tokenCalls().find((c) => c.form.refresh_token === '1//ra')?.form.client_id === 'ch.apps.googleusercontent.com', 'the next refresh carries the NEW client');
  // a failed rebind changes nothing
  const r2 = await eng.reauthorize(idA, { credentialKey: 'custom', credential: { appId: CUSTOM_ID, appSecret: CUSTOM_SECRET } });
  await land(r2.flow, 'c-unknown');
  const d2 = diskOf(engDir).find((x) => x.id === idA);
  ok(d2.credentialKey === 'cluster:channels' && !d2.credential && /invalid_grant|failed/.test(rowOf(eng, idA).lastAuthError || ''), 'a consent that FAILS under the new client changes nothing: the account keeps cluster:channels and says why (lastAuthError)', JSON.stringify({ key: d2.credentialKey, err: rowOf(eng, idA).lastAuthError }));
  const same = await eng.reauthorize(idA, {});
  ok(!same.rebind && same.flow && new URL(same.flow.consentUrl).searchParams.get('client_id') === 'ch.apps.googleusercontent.com', 'no client named = the account\'s own consent, not a rebind');
  await eng.cancelAuth(idA);
  const e = await threw(() => eng.reauthorize(idA, { credentialKey: 'cluster:nope' }));
  ok(e && e.code === 'unknown-credential' && rowOf(eng, idA).credentialKey === 'cluster:channels', 'an unknown key on reauthorize is still refused and nothing moves');
  // PRE-FIX CONTROL: the base engine refused this verb by name
  const PRE = preR4Engine();
  if (!PRE) console.log(`  … SKIP the pre-r4 control (git history for ${PRE_R4} not present — a shallow clone)`);
  else {
    const dp = path.join(ROOT, 'engp'); fs.mkdirSync(dp, { recursive: true });
    const vp = mkVendor();
    const ep = PRE.create({ dataDir: dp, env: {}, now, broadcast: () => {}, integrations, fetch: vp.fetchFn, log: quiet , ...FAST_PACE });
    engines.push(ep);
    const Ap = await consent(ep, 'gmail', { credentialKey: 'cluster:org1' }, 'c-a');
    const pe = await threw(() => ep.reauthorize(Ap.id, { credentialKey: 'cluster:channels' }));
    ok(pe && pe.code === 'credential-bound', 'PRE-FIX CONTROL: the pre-r4 engine refused the client switch (`credential-bound`) — r4 makes it a re-authorization');
    ok(typeof ep.startOAuth !== 'function' && typeof ep.duplicate !== 'function' && typeof ep.remove !== 'function', 'PRE-FIX CONTROL: the pre-r4 engine has no transient consent, no duplicate, no remove');
    ep.oauth.stopAll(); ep.stop();
  }
}

// ── ⑧ duplicate: exactly DUPLICATE_FIELDS, never the token/refresh overrides/assignments/reach/log ──
console.log('⑧ duplicate');
{
  // shape the source: the custom account C, with options, a push claim, a sender line, a tracked conversation, an assignment and a reach grant
  await eng.setOptions(idC, { query: 'label:important' });
  await eng.setPush(idC, { claimedExclusive: 'exclusive' });
  await eng.setSenderHonesty(idC, true);
  await eng.refresh(idC, 'thr_c');
  await eng.setRefresh(idC, 'thr_c', 60);
  await eng.setAssignment(idC, 'thr_c', { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, mode: 'all' });
  await eng.setReach(idC, 'thr_c', { principal: { kind: 'agent', id: 'agent-2' }, level: 'visible' });
  const src = eng.adapterRecords().adapters.find((r) => r.id === idC);
  ok(src.auth.tokenEnc && src.options.query === 'label:important' && src.push.claimedExclusive === 'exclusive' && src.senderHonestyLine === true, 'fixture: the source holds a token, a query, a push claim, a sender line');
  const r = await eng.duplicate(idC);
  const dup = eng.adapterRecords().adapters.find((x) => x.id === r.adapter.id);
  ok(r.adapter && /^gmail:[0-9a-f]{8}$/.test(dup.id) && dup.id !== idC && dup.label === 'Custom mail (copy)', `a NEW account (${dup.id}) named '<name> (copy)'`);
  // TABLE-DRIVEN: every field of the copy is either declared (then = the source's) or the blank record's
  const blank = eng.blankRecord('gmail');
  const declared = new Set(ENG.DUPLICATE_FIELDS.flatMap((f) => f.paths));
  const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const keys = new Set([...Object.keys(blank), ...Object.keys(dup)]);
  const offenders = [];
  for (const k of keys) {
    if (k === 'id' || k === 'label') continue;
    const sub = [...declared].filter((p) => p === k || p.startsWith(k + '.'));
    if (!sub.length) { if (JSON.stringify(dup[k]) !== JSON.stringify(blank[k])) offenders.push(`${k}: ${JSON.stringify(dup[k])} ≠ blank ${JSON.stringify(blank[k])}`); continue; }
    if (sub.includes(k)) {
      if (k === 'credential') continue;   // compared opened below (RE-SEALED: the ciphertext differs by design)
      if (JSON.stringify(dup[k]) !== JSON.stringify(src[k])) offenders.push(`${k}: ${JSON.stringify(dup[k])} ≠ source`);
      continue;
    }
    const expect = JSON.parse(JSON.stringify(blank[k]));
    for (const p of sub) { const leaf = p.slice(k.length + 1); expect[leaf] = getP(src, p); }
    if (JSON.stringify(dup[k]) !== JSON.stringify(expect)) offenders.push(`${k}: ${JSON.stringify(dup[k])} ≠ blank+declared ${JSON.stringify(expect)}`);
  }
  ok(!offenders.length, `every field of the copy is the source's where DUPLICATE_FIELDS declares it (${[...declared].join(', ')}) and the blank record's everywhere else`, offenders.join(' | '));
  ok(dup.credential.appId === CUSTOM_ID && dup.credential.appSecretEnc !== src.credential.appSecretEnc && chBox.dec(dup.credential.appSecretEnc) === CUSTOM_SECRET, 'the custom client is copied RE-SEALED: a fresh ciphertext that opens to the same secret');
  // …and NEVER the five
  const ix = eng.store.index.snapshot().conversations;
  const never = {
    token: !dup.auth.tokenEnc && !dup.auth.user,
    refresh: !Object.values(ix).some((en) => en && en.adapterId === dup.id),
    access: !Object.values(ix).some((en) => en && en.adapterId === dup.id && ((en.access || []).length || (en.watchers || []).length || en.assignment)),
    reach: !Object.values(ix).some((en) => (en.reachEntries || []).some((g) => g.scope && (g.scope.id === dup.id || String(g.scope.id).startsWith(dup.id + '/')))),
    log: !fs.existsSync(path.join(engDir, 'channels', 'msgs', dup.id.replace(':', '%3a'))) && JSON.stringify(dup.state) === '{}' && dup.lastPass === null,
  };
  ok(ENG.DUPLICATE_NEVER.map((n) => n.key).join() === 'token,refresh,access,reach,log' && Object.values(never).every(Boolean), `the copy carries NO token, refresh override, access grant / notification, reach grant, log or cursor (${JSON.stringify(never)})`);
  ok(r.adapter.auth.tokenHeld === false && r.adapter.auth.state !== 'connected' && r.adapter.credentialKey === 'custom' && r.adapter.customClient.appId === CUSTOM_ID, 'the answer is an UNAUTHORIZED account under the copied client');
  ok(ix[`${idC}/thr_c`] && (ix[`${idC}/thr_c`].access || []).length === 1 && (ix[`${idC}/thr_c`].watchers || []).length === 1 && ix[`${idC}/thr_c`].refresh && ix[`${idC}/thr_c`].refresh.every === 60, 'the source is untouched (its refresh override, its access row and its notification stay)');
  const own = await eng.reauthorize(dup.id, {});
  ok(own.flow && new URL(own.flow.consentUrl).searchParams.get('client_id') === CUSTOM_ID, 'the copy consents on its own, under the copied client');
  await eng.cancelAuth(dup.id);
  const named = await eng.duplicate(idC, { name: '  Second\u0000 mailbox  ' });
  ok(named.adapter.label === 'Second mailbox', 'a given name is used (control characters and extra whitespace cleaned)');
  const bi = await threw(() => eng.duplicate('nope'));
  ok(bi && bi.code === 'no-such-adapter' && bi.status === 404, 'duplicating an unknown id is 404 no-such-adapter');
  // CONTROL: a copy that also carries the token is SEEN
  const ENG3 = patchedEngine([["        case 'filters': dup.options = { ...(src.options || {}) }; break;", "        case 'filters': dup.options = { ...(src.options || {}) }; dup.auth = { ...(src.auth || {}) }; break;"]]);
  const d3 = path.join(ROOT, 'eng3'); fs.mkdirSync(d3, { recursive: true });
  fs.mkdirSync(path.join(d3, 'channels'), { recursive: true });
  fs.copyFileSync(path.join(engDir, 'channels', 'adapters.json'), path.join(d3, 'channels', 'adapters.json'));
  fs.copyFileSync(path.join(engDir, ENG.KEY_FILE), path.join(d3, ENG.KEY_FILE));
  const eng3 = ENG3.create({ dataDir: d3, env: {}, now, broadcast: () => {}, integrations, fetch: v.fetchFn, log: quiet , ...FAST_PACE });
  engines.push(eng3);
  const r3 = await eng3.duplicate(idC);
  ok(eng3.adapterRecords().adapters.find((x) => x.id === r3.adapter.id).auth.tokenEnc, 'CONTROL: a copy that also copies `auth` hands the duplicate the token — the NEVER check above would be red');
  eng3.stop();
  await eng.remove(named.adapter.id);
  await eng.remove(dup.id);
}

// ── ⑨ remove: refused by name while referenced; disconnect ignores references ──
console.log('⑨ remove');
{
  // C is referenced by: the assignment on thr_c, an ADAPTER-scoped reach grant, an unsettled proposal; a settled proposal and an agent group are not references
  await eng.store.index.update(() => {
    const en = eng.store.index.entry(idC, 'thr_c', { create: false });
    en.reachEntries.push({ principal: { kind: 'agent', id: 'agent-9', name: 'Scout' }, scope: { kind: 'adapter', id: idC }, level: 'visible', origin: 'request', at: now(), by: 'user' });
  });
  await eng.store.outbox.update((ob) => {
    ob.proposals['p-open'] = { id: 'p-open', adapterId: idC, convId: 'thr_c', key: `${idC}/thr_c`, state: 'awaiting-approval', text: 'hi', at: now(), updatedAt: now() };
    ob.proposals['p-sent'] = { id: 'p-sent', adapterId: idC, convId: 'thr_c', key: `${idC}/thr_c`, state: 'sent', text: 'hi', at: now(), updatedAt: now() };
  });
  const CIDS = ['e2e00000-0000-4000-8000-00000000a001', 'e2e00000-0000-4000-8000-00000000a002'];
  const groups = createGroups({ store: eng.store, now, broadcast: () => {}, log: quiet, roster: () => [{ cid: CIDS[0], name: 'Worker', groups: [] }, { cid: CIDS[1], name: 'Scout', groups: [] }] });
  const g = await groups.create({ by: 'user', name: `about ${idC}`, members: CIDS, quiet: true });
  ok(g && g.ok, 'fixture: an agent group exists (it references agent sessions, never a channel account)', JSON.stringify(g && g.error));
  const refs = eng.referencesOf(idC);
  const kinds = refs.map((x) => x.kind).sort().join();
  ok(kinds === 'access,outbox,reach', `referencesOf names exactly the access row (its notification rides it), the adapter-scoped reach grant and the UNSETTLED proposal (${kinds}) — the conversation-scoped user grant, the settled proposal and the agent group are not references`, JSON.stringify(refs));
  ok(refs.find((x) => x.kind === 'access').principal.name === 'Worker' && refs.find((x) => x.kind === 'reach').principal.id === 'agent-9' && refs.find((x) => x.kind === 'outbox').id === 'p-open', 'each reference is NAMED: who is assigned, who holds the grant, which proposal');
  const e = await threw(() => eng.remove(idC));
  ok(e && e.status === 409 && e.code === 'account-referenced' && e.detail.refs.length === 3 && /1 access grant, 1 reach grant, 1 outbox proposal/.test(e.message) && /Disconnect only drops the token/.test(e.message), 'remove is 409 account-referenced naming each kind and the remedy', e && e.message);
  ok(eng.adapterRecords().adapters.some((x) => x.id === idC) && diskOf(engDir).some((x) => x.id === idC), 'the refused account is intact, live and on disk');
  const dc = await eng.disconnect(idC);
  ok(dc.ok === true && !dc.removed && rowOf(eng, idC) && rowOf(eng, idC).auth.tokenHeld === false && eng.referencesOf(idC).length === 3, 'Disconnect IGNORES references: the token is dropped, the record and every reference stay');
  // release them
  await eng.setAssignment(idC, 'thr_c', null);
  await eng.store.index.update(() => { const en = eng.store.index.entry(idC, 'thr_c', { create: false }); en.reachEntries = en.reachEntries.filter((x) => !(x.scope && x.scope.kind === 'adapter')); });
  await eng.store.outbox.update((ob) => { ob.proposals['p-open'].state = 'rejected'; });
  ok(eng.referencesOf(idC).length === 0, 'released: no reference left');
  const rm = await eng.remove(idC);
  ok(rm.ok && rm.removed && !eng.adapterRecords().adapters.some((x) => x.id === idC) && !diskOf(engDir).some((x) => x.id === idC) && !Object.keys(eng.store.index.snapshot().conversations).some((k) => k.startsWith(idC + '/')), 'unreferenced ⇒ the record and its index rows are gone');
  ok(rowOf(eng, idA) && rowOf(eng, idB) && eng.digest().conversations.some((c) => c.adapterId === idA), 'the other accounts and their conversations are untouched');
  // the FIRST account (id === kind) is removable too — no special case left; a further account's disconnect keeps its record
  const dB = await eng.disconnect(idB);
  ok(!dB.removed && eng.adapterRecords().adapters.some((x) => x.id === idB) && rowOf(eng, idB).credentialKey === 'cluster:channels', 'a FURTHER account\'s Disconnect keeps its record and client (the pre-r4 "disconnect removes it" special case is gone)');
  // CONTROL: a copy whose reference check answers nothing removes a referenced account
  await eng.refresh(idA, 'thr_a');
  await eng.setAssignment(idA, 'thr_a', { principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, mode: 'all' });
  const ENG4 = patchedEngine([['    const refs = referencesOf(rec.id);\n', '    const refs = [];\n']]);
  const d4 = path.join(ROOT, 'eng4'); fs.mkdirSync(path.join(d4, 'channels'), { recursive: true });
  for (const f of ['adapters.json', 'index.json']) fs.copyFileSync(path.join(engDir, 'channels', f), path.join(d4, 'channels', f));
  const eng4 = ENG4.create({ dataDir: d4, env: {}, now, broadcast: () => {}, integrations, fetch: v.fetchFn, log: quiet , ...FAST_PACE });
  engines.push(eng4);
  const r4 = await threw(() => eng4.remove(idA));
  ok(!r4 && !eng4.adapterRecords().adapters.some((x) => x.id === idA), 'CONTROL: a copy with no reference check removes an ASSIGNED account — the defect the refusal exists for');
  eng4.stop();
  ok((await threw(() => eng.remove(idA))).code === 'account-referenced', 'and the real engine refuses the same removal');
  await eng.setAssignment(idA, 'thr_a', null);
  // PRE-FIX CONTROL: the base engine's disconnect removed a further account
  const PRE = preR4Engine();
  if (PRE) {
    const dp = path.join(ROOT, 'engq'); fs.mkdirSync(dp, { recursive: true });
    const vp = mkVendor();
    const ep = PRE.create({ dataDir: dp, env: {}, now, broadcast: () => {}, integrations, fetch: vp.fetchFn, log: quiet , ...FAST_PACE });
    engines.push(ep);
    await consent(ep, 'gmail', { credentialKey: 'cluster:org1' }, 'c-a');
    const Bp = await consent(ep, 'gmail', { credentialKey: 'cluster:channels', newAccount: true }, 'c-b');
    const out = await ep.disconnect(Bp.id);
    ok(out.removed === true && !ep.adapterRecords().adapters.some((x) => x.id === Bp.id), 'PRE-FIX CONTROL: the pre-r4 disconnect REMOVED a further account (with no reference check) — r4 splits the two verbs');
    ep.oauth.stopAll(); ep.stop();
  }
}

// ── ⑩ the routes ──
console.log('⑩ the routes');
{
  const express = require(path.join(REPO, 'node_modules/express'));
  routes.setup({ getEngine: () => eng });
  const app = express(); app.use(express.json()); app.use(routes.router);
  const PORT = await freePort();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const bodies = [];
  const api = (method, p, body) => new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { 'Content-Type': 'application/json' } }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} if (!p.endsWith('/config')) bodies.push(b); resolve({ status: res.statusCode, body: j, raw: b }); }); });
    req.on('error', (e) => resolve({ status: 0, body: null, raw: String(e.message) }));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  // the account dialog's sign-in, the storage block's shapes
  const s1 = await api('POST', '/api/channels/oauth/start', { backend: 'gmail', clientId: CUSTOM_ID, clientSecret: CUSTOM_SECRET });
  ok(s1.status === 200 && s1.body.flowId && new URL(s1.body.url).searchParams.get('client_id') === CUSTOM_ID, 'POST /api/channels/oauth/start {backend, clientId, clientSecret} → {flowId, url} (the storage block\'s body spelling)', s1.raw.slice(0, 200));
  const s2 = await api('GET', '/api/channels/oauth/status');
  ok(s2.status === 200 && s2.body.flowId === s1.body.flowId && s2.body.running === true && s2.body.token === null, 'GET /api/channels/oauth/status (declared before the conversation route) → running, no token', s2.raw.slice(0, 200));
  const cb0 = await api('POST', '/api/channels/oauth/callback', { url: 'http://127.0.0.1:1/?state=nope&code=c-b' });
  ok(cb0.status === 400 && /state mismatch/.test(cb0.body.error), 'POST callback with a foreign state → 400 by name', cb0.raw);
  const cu = new URL(s1.body.url);
  const cb = await api('POST', '/api/channels/oauth/callback', { url: `http://127.0.0.1:1/?state=${cu.searchParams.get('state')}&code=c-b`, flowId: s1.body.flowId });
  ok(cb.status === 200 && cb.body.ok === true && cb.body.token === s1.body.flowId, 'POST callback (paste-back) → ok + the flow handle', cb.raw);
  const cn = await api('POST', '/api/channels/adapters/gmail/connect', { flowId: s1.body.flowId, name: 'Route mail', credentialKey: 'custom', credential: { appId: CUSTOM_ID, appSecret: CUSTOM_SECRET } });
  const idR = cn.body && cn.body.adapter && cn.body.adapter.id;
  ok(cn.status === 200 && idR && cn.body.adapter.credentialKey === 'custom' && cn.body.adapter.label === 'Route mail' && cn.body.adapter.auth.tokenHeld === true, 'POST connect {flowId, name, the same custom client} creates the connected account', cn.raw.slice(0, 200));
  const cn2 = await api('POST', '/api/channels/adapters/gmail/connect', { flowId: s1.body.flowId });
  ok(cn2.status === 404 && cn2.body.code === 'no-flow', 'a taken flow is 404 no-flow');
  // D3: the owner-only config carries the secret; nothing else does
  const cfg = await api('GET', `/api/channels/adapters/${encodeURIComponent(idR)}/config`);
  ok(cfg.status === 200 && cfg.body.config.client.appId === CUSTOM_ID && cfg.body.config.client.appSecret === CUSTOM_SECRET && cfg.body.config.presets.length === 2, 'GET /adapters/:id/config (owner-only, D3) prefills the custom secret in the clear — the storage `GET /api/mounts/:id/config` rule');
  // edits in place
  const pl = await api('PUT', `/api/channels/adapters/${encodeURIComponent(idR)}`, { label: 'Renamed mail' });
  ok(pl.status === 200 && pl.body.label === 'Renamed mail' && rowOf(eng, idR).label === 'Renamed mail', 'PUT {label} renames the account');
  const ps = await api('PUT', `/api/channels/adapters/${encodeURIComponent(idR)}`, { credential: { appId: CUSTOM_ID, appSecret: CUSTOM_SECRET2 } });
  ok(ps.status === 200 && ps.body.customClient.secretMasked === '••••' + CUSTOM_SECRET2.slice(-4) && chBox.dec(diskOf(engDir).find((x) => x.id === idR).credential.appSecretEnc) === CUSTOM_SECRET2, 'PUT {credential} with the SAME id replaces the secret in place (sealed; the answer masked)');
  const pi = await api('PUT', `/api/channels/adapters/${encodeURIComponent(idR)}`, { credential: { appId: 'other.apps.googleusercontent.com', appSecret: CUSTOM_SECRET2 } });
  ok(pi.status === 409 && pi.body.code === 'client-change-needs-reauth' && /Re-authorize/.test(pi.body.error), 'PUT {credential} with ANOTHER id is 409 client-change-needs-reauth (switching the client is a re-authorization)', pi.raw);
  const ra = await api('POST', `/api/channels/adapters/${encodeURIComponent(idR)}/reauthorize`, { clientPreset: 'org1' });
  ok(ra.status === 200 && ra.body.rebind === true && new URL(ra.body.flow.consentUrl).searchParams.get('client_id') === 'org1.apps.googleusercontent.com', 'POST reauthorize {clientPreset} = a rebind under the preset', ra.raw.slice(0, 200));
  await eng.cancelAuth(idR);
  // duplicate + remove
  const du = await api('POST', `/api/channels/adapters/${encodeURIComponent(idR)}/duplicate`, { name: 'Route copy' });
  ok(du.status === 200 && du.body.adapter.label === 'Route copy' && du.body.adapter.auth.tokenHeld === false && du.body.adapter.credentialKey === 'custom', 'POST duplicate {name} → {adapter} unauthorized under the copied client', du.raw.slice(0, 200));
  await eng.refresh(idR, 'thr_b');
  await eng.setAssignment(idR, 'thr_b', { principal: { kind: 'agent', id: 'agent-3', name: 'Helper' }, mode: 'all' });
  const dl = await api('DELETE', `/api/channels/adapters/${encodeURIComponent(idR)}`);
  ok(dl.status === 409 && dl.body.code === 'account-referenced' && dl.body.detail.refs.length === 1 && dl.body.detail.refs[0].kind === 'access' && dl.body.detail.refs[0].principal.name === 'Helper', 'DELETE a referenced account → 409 account-referenced with detail.refs naming the access row', dl.raw);
  const dd = await api('DELETE', `/api/channels/adapters/${encodeURIComponent(du.body.adapter.id)}`);
  ok(dd.status === 200 && dd.body.removed === true && !eng.adapterRecords().adapters.some((x) => x.id === du.body.adapter.id), 'DELETE an unreferenced account → removed');
  const d404 = await api('DELETE', '/api/channels/adapters/gmail%3Anope');
  ok(d404.status === 404 && d404.body.code === 'no-such-adapter', 'DELETE an unknown id → 404');
  const dg = await api('GET', '/api/channels');
  ok(dg.status === 200 && dg.body.kinds.length === 2, 'GET /api/channels carries the dialog\'s `kinds`');
  ok(!bodies.some((b) => b.includes(CUSTOM_SECRET) || b.includes(CUSTOM_SECRET2)), `NO route answer but the owner-only config carries a custom secret (${bodies.length} bodies checked)`);
  ok(!frames.some((f) => JSON.stringify(f).includes(CUSTOM_SECRET) || JSON.stringify(f).includes(CUSTOM_SECRET2)) && !logLines.some((l) => l.includes(CUSTOM_SECRET) || l.includes(CUSTOM_SECRET2)), 'no broadcast frame and no log line ever carried one');
  await eng.setAssignment(idR, 'thr_b', null);
  await new Promise((r) => server.close(r));
}

// ── ⑪ the Lark keyed rung: the keyed JSON env, the key read LIVE off the record ──
console.log('⑪ lark');
{
  const env = { VIBESPACE_INTEGRATIONS: JSON.stringify([
    { id: 'lark', key: 'tA', label: 'Tenant A', values: { appId: 'cli_fixture000a', appSecret: 'fs-a' } },
    { id: 'lark', key: 'tB', label: 'Tenant B', values: { appId: 'cli_fixture000b', appSecret: 'fs-b' } },
  ]) };
  const s2 = STORE.create({ dataDir: path.join(ROOT, 'store-lark'), env, now, broadcast: () => {}, log: quiet });
  const d = s2.resolveIntegration('lark');
  ok(d.source === 'none' && d.whyCode === 'ambiguous' && d.credentialKey === null, 'two tenants: the row\'s keyless pick is ambiguous and names no key');
  const b = s2.resolveIntegration('lark', { credentialKey: 'cluster:tB' });
  ok(b.source === 'cluster' && b.values.appId === 'cli_fixture000b' && b.clusterLabel === 'Tenant B' && b.credentialKey === 'cluster:tB', '`cluster:tB` resolves tenant B by key through the keyed JSON entries');
  ok(JSON.stringify(s2.presetsFor('lark')) === JSON.stringify([{ key: 'tA', label: 'Tenant A' }, { key: 'tB', label: 'Tenant B' }]) && s2.offeredCredentials('lark').map((o) => o.key).join() === 'cluster:tA,cluster:tB', 'Lark presets from the store\'s env reader, key + label only; no `own`');
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
  const rec = { id: 'lark:0badcafe', kind: 'lark', options: {}, credentialKey: null };
  const a = reg.create('lark', rec, { now, fetch: fetchFn, tokens, resolveIntegration: (id, o) => s2.resolveIntegration(id, o), log: quiet });
  const s0 = await a.auth.state();
  ok(s0.state === 'needs-credentials' && s0.whyCode === 'ambiguous' && s0.credentialKey === null, 'with no key the adapter follows the row (ambiguous ⇒ needs-credentials), naming no key');
  rec.credentialKey = 'cluster:tB';
  const s1 = await a.auth.state();
  ok(s1.state === 'connected' && s1.credentialKey === 'cluster:tB' && s1.clusterKey === 'tB' && s1.user === 'Member B', 'the stamp is read LIVE: connected, auth.state names cluster:tB', JSON.stringify(s1));
  await a.listConversations({ limit: 10 });
  const rf = calls.find((c) => c.path === '/open-apis/authen/v2/oauth/token');
  ok(rf && rf.body.grant_type === 'refresh_token' && rf.body.client_id === 'cli_fixture000b' && rf.body.client_secret === 'fs-b' && rf.body.refresh_token === 'ur-1', 'the refresh named tenant B\'s app — the account\'s key, with the row itself ambiguous', JSON.stringify(rf && rf.body));
  ok(calls.every((c) => /\.feishu\.cn$/.test(c.host)), 'NEGATIVE CONTROL: every call stayed on the declared egress hosts (the fake)');
}

eng.oauth.stopAll(); eng.stop();

// ── ⑫ verify r5: a refresh in flight vs disconnect / rebind; whose account a consent may land on ──
console.log('⑫ verify r5: refresh races + the identity door');
{
  const P12 = [{ key: 'org1', label: 'Org 1', clientId: 'org1.apps.googleusercontent.com', clientSecret: 'org1-secret-000000' }, { key: 'channels', label: 'Channels', clientId: 'ch.apps.googleusercontent.com', clientSecret: 'channels-secret-0000' }];
  /** a scripted Google that KNOWS which client issued each refresh token, which person each consent code is, and when each access token expires */
  function google12() {
    const st = { refreshes: 0, sends: 0, holdRefresh: null, holdFor: null, issued: new Map(), access: new Map(), who: new Map(), n: 0, refreshLog: [], profileFail: false };
    const client = (id) => (id || '').split('.')[0];
    const emailFor = (code) => (/intruder/.test(code) ? 'intruder@example.com' : 'member.a@example.com');
    const issue = (c, who) => { st.n++; const at = `ya29.${c}-${st.n}`; st.access.set(at, clock + 3599e3); if (who) st.who.set(at, who); return at; };
    const fetchFn = async (url, init = {}) => {
      const u = new URL(String(url)); const form = init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : null;
      if (u.hostname === 'oauth2.googleapis.com') {
        if (form.grant_type === 'authorization_code') { const c = client(form.client_id); const rt = `1//${c}-${++st.n}`; st.issued.set(rt, c); return jsonRes({ access_token: issue(c, emailFor(form.code)), expires_in: 3599, refresh_token: rt, scope: gmail.SCOPE, token_type: 'Bearer' }); }
        st.refreshes++; const c = client(form.client_id); st.refreshLog.push({ client: c, token: form.refresh_token, family: st.issued.get(form.refresh_token) || null });
        if (st.holdRefresh && (!st.holdFor || st.holdFor(form))) { const h = st.holdRefresh; await h; }
        if (st.issued.get(form.refresh_token) !== c) return jsonRes({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
        return jsonRes({ access_token: issue(c, st.who.get(form.refresh_token) || null), expires_in: 3599, scope: gmail.SCOPE, token_type: 'Bearer' });
      }
      const at = String((init.headers || {}).Authorization || '').replace(/^Bearer /, ''); const exp = st.access.get(at);
      if (!exp || exp <= clock) return jsonRes({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
      st.sends++;
      const p = u.pathname.replace('/gmail/v1/users/me', '');
      if (p === '/profile') {
        st.profileCalls = (st.profileCalls || 0) + 1;
        if (st.holdProfile) { const h = st.holdProfile; await h; }   // verify r7: the consent's completion held mid-flight
        return st.profileFail ? jsonRes({ error: { code: 500, message: 'Backend Error' } }, 500) : jsonRes({ emailAddress: st.who.get(at) || 'member.a@example.com', historyId: '100' });
      }
      if (p === '/threads') return jsonRes({ threads: [{ id: 'thr_a' }] });
      if (/^\/threads\/[^/]+$/.test(p)) return jsonRes({ id: 'thr_a', messages: [{ id: 'm1', internalDate: String(T0), payload: { headers: [{ name: 'Subject', value: 'S' }, { name: 'From', value: 'x@example.com' }] } }] });
      if (p === '/history') return jsonRes({ historyId: '100' });
      return jsonRes({ error: { code: 404, message: 'unrouted' } }, 404);
    };
    return { st, fetchFn };
  }
  const boot12 = (name) => { const v = google12(); const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true }); const ints = STORE.create({ dataDir: path.join(dir, 'int'), env: {}, now, broadcast: () => {}, drivePresets: () => P12, log: quiet }); const e = ENG.create({ dataDir: dir, env: {}, now, broadcast: () => {}, integrations: ints, fetch: v.fetchFn, log: quiet, ...FAST_PACE }); return { eng: e, v, dir }; };
  const row = (e) => e.adapterRecords().adapters.find((x) => x.id === 'gmail');
  // (a) a DISCONNECT while the entry's refresh is in flight: the late refresh writes nothing back, the record carries no failure of a pass that outlived it
  {
    const { eng: e, v, dir } = boot12('r5-dc');
    const r = await e.connect('gmail', { credentialKey: 'cluster:channels' }); await land(r.flow, 'c1');
    await e.pass('gmail', { force: true }); clock += 3600e3;
    let release; v.st.holdRefresh = new Promise((x) => { release = x; });
    const p = e.pass('gmail', { force: true }); await sleep(30);
    ok(v.st.refreshes === 1, 'fixture: the pass\'s refresh POST is in flight (held)');
    await e.disconnect('gmail'); release(); await p; await sleep(50);
    const rec = row(e); const disk = diskOf(dir).find((x) => x.id === 'gmail'); const view = e.adapterView(rec);
    const s0 = v.st.sends; clock += 10e3; await e.pass('gmail', { force: true });
    ok(!rec.auth.tokenEnc && !disk.auth.tokenEnc && rec.lastPass === null && rec.consecutiveFailures === 0 && view.auth.state !== 'connected' && view.auth.state !== 'expired' && v.st.sends === s0, `a disconnect during the refresh: no token written back (live ${!!rec.auth.tokenEnc} / disk ${!!disk.auth.tokenEnc}), the late failure stamped nothing (lastPass ${JSON.stringify(rec.lastPass)}), state ${view.auth.state}, ${v.st.sends - s0} vendor calls by the next pass`);
    e.stop();
  }
  // (b) a CLIENT-SWITCH rebind that lands while the OLD client's refresh is in flight: the record ends with the rebind's token, the next refresh carries the new client and ITS family
  {
    const { eng: e, v } = boot12('r5-rebind');
    const r = await e.connect('gmail', { credentialKey: 'cluster:org1' }); await land(r.flow, 'c1');
    await e.pass('gmail', { force: true }); clock += 3600e3;
    let release; v.st.holdRefresh = new Promise((x) => { release = x; }); v.st.holdFor = (form) => /org1/.test(form.client_id);
    const p = e.pass('gmail', { force: true }); await sleep(20);
    const rb = await e.reauthorize('gmail', { credentialKey: 'cluster:channels' }); await land(rb.flow, 'c2');
    release(); await p; await sleep(40);
    clock += 3600e3; v.st.refreshLog.length = 0; await e.pass('gmail', { force: true });
    const rec = row(e); const view = e.adapterView(rec); const last = v.st.refreshLog[v.st.refreshLog.length - 1];
    ok(view.credentialKey === 'cluster:channels' && view.auth.state === 'connected' && last && last.client === 'ch' && last.family === 'ch' && rec.lastPass && rec.lastPass.ok === true, `a rebind landing during the old client's refresh: connected under ${view.credentialKey}, the next refresh carried ${last && last.client} + a token issued by ${last && last.family} (never the old client's), the pass ok`, JSON.stringify({ state: view.auth.state, last, lastPass: rec.lastPass }));
    e.stop();
  }
  // (c) WHOSE ACCOUNT: a consent naming another identity is refused at the ONE token door; the same person under another client is what re-authorize is for
  {
    const { eng: e } = boot12('r5-id');
    const r = await e.connect('gmail', { credentialKey: 'cluster:org1' }); await land(r.flow, 'c1');
    const rec0 = row(e); const tok0 = rec0.auth.tokenEnc;
    ok(rec0.auth.user === 'member.a@example.com' && rec0.identity && rec0.identity.email === 'member.a@example.com', `connected as member.a, the identity stamped on the record (${JSON.stringify(rec0.identity)})`);
    const r1 = await e.reauthorize('gmail', {}); await land(r1.flow, 'c-intruder');
    const rec1 = row(e);
    ok(rec1.auth.tokenEnc === tok0 && rec1.auth.user === 'member.a@example.com' && /connected as member\.a@example\.com; this sign-in is intruder@example\.com/.test(rec1.lastAuthError || ''), 'a same-client re-authorize as another Google user: refused by name (the token is the old one, the last sign-in line names both)', rec1.lastAuthError);
    const r2 = await e.reauthorize('gmail', { credentialKey: 'cluster:channels' }); await land(r2.flow, 'c-intruder');
    const rec2 = row(e);
    ok(rec2.credentialKey === 'cluster:org1' && rec2.auth.tokenEnc === tok0 && /this sign-in is intruder@example\.com/.test(rec2.lastAuthError || ''), `a rebind as another user keeps the client (${rec2.credentialKey}) and the token, refused by name`);
    const r3 = await e.reauthorize('gmail', { credentialKey: 'cluster:channels' }); await land(r3.flow, 'c-same');
    const rec3 = row(e);
    ok(rec3.credentialKey === 'cluster:channels' && rec3.auth.tokenEnc !== tok0 && rec3.lastAuthError === null && e.adapterView(rec3).auth.state === 'connected', 'the same person under the other client: client + token replaced, connected');
    await e.disconnect('gmail');
    const r4 = await e.reauthorize('gmail', {}); await land(r4.flow, 'c-intruder');
    const rec4 = row(e);
    ok(!rec4.auth.tokenEnc && rec4.identity && rec4.identity.email === 'member.a@example.com' && /this sign-in is intruder@example\.com/.test(rec4.lastAuthError || ''), 'the identity survives a disconnect: a re-connect as another user is refused, no token stored');
    const r5 = await e.reauthorize('gmail', {}); await land(r5.flow, 'c-same');
    ok(!!row(e).auth.tokenEnc && e.adapterView(row(e)).auth.state === 'connected', '…and the same person re-connects');
    const r6 = await e.connect('gmail', { credentialKey: 'cluster:org1', newAccount: true }); await land(r6.flow, 'c-intruder');
    const other = e.adapterRecords().adapters.find((x) => x.id !== 'gmail');
    ok(other && other.auth.user === 'intruder@example.com' && other.identity.email === 'intruder@example.com', 'a NEW account connects as the other person — its own record, its own identity');
    e.stop();
  }
  // (d) the PURE identity table + the door's wiring pins moved to test-channels-accounts-model (fast — the
  //     credential law's push-blocking half, B-f4cb 2026-09-27); this suite (heavy) keeps the door's behaviour.
  // (e) CONTROL: an engine copy without the identity check stores the stranger's consent (RED as asserted)
  {
    const src = fs.readFileSync(ENGINE_PATH, 'utf-8');
    const noCheck = src.replace("            if (mm) { verdict = { written: false, mismatch: mm }; return; }\n", '');   // verify r7: the check sits INSIDE the serialized callback
    ok(noCheck !== src, 'CONTROL fixture: the token door\'s identity check removed from a copy');
    const ENG2 = require(MUTA.write(ENGINE_PATH, noCheck, 'no-identity'));
    const v = google12(); const dir = path.join(ROOT, 'r5-ctl'); fs.mkdirSync(dir, { recursive: true });
    const ints = STORE.create({ dataDir: path.join(dir, 'int'), env: {}, now, broadcast: () => {}, drivePresets: () => P12, log: quiet });
    const e = ENG2.create({ dataDir: dir, env: {}, now, broadcast: () => {}, integrations: ints, fetch: v.fetchFn, log: quiet, ...FAST_PACE });
    const r = await e.connect('gmail', { credentialKey: 'cluster:org1' }); await land(r.flow, 'c1');
    const r1 = await e.reauthorize('gmail', {}); await land(r1.flow, 'c-intruder');
    const rec = row(e);
    ok(rec.auth.user === 'intruder@example.com' && !rec.lastAuthError, `CONTROL: without the check the stranger's consent is STORED on member.a's record (user ${rec.auth.user})`);
    e.stop();
  }
  // ── verify r6 ──
  // (f) A CONSENT MUST NAME ITS ACCOUNT: the profile read fails ⇒ refused, nothing bound (a nameless token used to bind nothing and the record then took ANYONE's next consent); a stranger's nameless consent never lands on a bound record (it used to: "no common key")
  {
    const { eng: e, v } = boot12('r6-nameless');
    v.st.profileFail = true;
    const r = await e.connect('gmail', { credentialKey: 'cluster:org1' }); await land(r.flow, 'c1');
    const rec0 = row(e);
    ok(rec0 && !rec0.auth.tokenEnc && !rec0.identity && /did not say which account signed in/.test(rec0.lastAuthError || ''), `(f) a first consent the profile could not name: refused by name, no token, no identity (${rec0 && rec0.lastAuthError})`);
    v.st.profileFail = false;
    const r1 = await e.reauthorize('gmail', {}); await land(r1.flow, 'c1');
    const rec1 = row(e); const tok1 = rec1.auth.tokenEnc;
    ok(!!tok1 && rec1.identity && rec1.identity.email === 'member.a@example.com' && rec1.lastAuthError === null, 'the owner signs in again: bound to member.a');
    v.st.profileFail = true;
    const r2 = await e.reauthorize('gmail', {}); await land(r2.flow, 'c-intruder');
    const rec2 = row(e);
    ok(rec2.auth.tokenEnc === tok1 && rec2.identity.email === 'member.a@example.com' && /did not say which account signed in/.test(rec2.lastAuthError || ''), '(f) a stranger\'s consent whose profile read failed never lands on the bound record (member.a\'s token kept)');
    v.st.profileFail = false;
    e.stop();
  }
  // (g) a LEGACY record (pre-r5, no stamp) is stamped at boot from the token it holds, so a disconnect after the upgrade (auth.user wiped) still refuses a stranger
  {
    const { eng: e0, v, dir } = boot12('r6-legacy');
    const r = await e0.connect('gmail', { credentialKey: 'cluster:org1' }); await land(r.flow, 'c1'); e0.stop();
    const file = path.join(dir, 'channels', 'adapters.json'); const j = JSON.parse(fs.readFileSync(file, 'utf-8')); delete j.adapters.find((x) => x.id === 'gmail').identity; fs.writeFileSync(file, JSON.stringify(j));
    const ints = STORE.create({ dataDir: path.join(dir, 'int'), env: {}, now, broadcast: () => {}, drivePresets: () => P12, log: quiet });
    const e = ENG.create({ dataDir: dir, env: {}, now, broadcast: () => {}, integrations: ints, fetch: v.fetchFn, log: quiet, ...FAST_PACE });
    await sleep(30);
    const rec0 = row(e); const disk0 = diskOf(dir).find((x) => x.id === 'gmail');
    ok(rec0.identity && rec0.identity.email === 'member.a@example.com' && disk0.identity && disk0.identity.email === 'member.a@example.com', `(g) a legacy record is stamped at boot from the token it holds (live + disk: ${JSON.stringify(disk0.identity)})`);
    const rep = e.stampIdentities(); await rep.write;
    ok(rep.stamped.length === 0 && rep.skipped.some((x) => x.id === 'gmail' && x.why === 'already'), 'the stamp runs once (a second run skips the record as already stamped)');
    await e.disconnect('gmail');
    const r1 = await e.reauthorize('gmail', {}); await land(r1.flow, 'c-intruder');
    const rec1 = row(e);
    ok(!rec1.auth.tokenEnc && rec1.identity.email === 'member.a@example.com' && /this sign-in is intruder@example\.com/.test(rec1.lastAuthError || ''), '(g) disconnected after the upgrade (auth.user wiped), a stranger is still refused — the boot stamp holds');
    e.stop();
  }
  // (h) a LEGACY LARK record — auth.user is the display NAME, never an id (heldIdentity read {} and a stranger's consent BOUND it): judged by the open_id its token holds, stamped at boot; a stranger under the same app refused, the holder accepted
  {
    const OAUTH = require(path.join(REPO, 'src/oauth-loopback.js'));
    const LENV = { VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'lark', key: 'tA', label: 'Tenant app A', values: { appId: 'cli_appa', appSecret: 'fs-a' } }]) };
    const larkV = () => { const st = { n: 0, access: new Map() }; const who = (code) => (/-x\b/.test(code) ? 'x' : 'a'); const fetchFn = async (url, init = {}) => { const u = new URL(String(url)); let body = null; try { body = init.body ? JSON.parse(String(init.body)) : null; } catch {} const at = String((init.headers || {}).Authorization || '').replace(/^Bearer /, ''); if (u.pathname === '/open-apis/authen/v2/oauth/token') { const w = body.grant_type === 'authorization_code' ? who(body.code) : (st.access.get(body.refresh_token) || 'a'); const atk = `u-${w}-${++st.n}`; const rt = `ur-${w}-${st.n}`; st.access.set(atk, w); st.access.set(rt, w); return jsonRes({ code: 0, access_token: atk, expires_in: 7200, refresh_token: rt, refresh_token_expires_in: 2592000, scope: 'im:message' }); } const w = st.access.get(at); if (!w) return jsonRes({ code: 99991668, msg: 'Invalid access token' }, 401); if (u.pathname === '/open-apis/authen/v1/user_info') return jsonRes({ code: 0, data: { open_id: `ou_appa_${w}`, union_id: `on_${w}`, user_id: `uid_${w}`, name: w === 'a' ? 'Member A' : 'Stranger X' } }); if (u.pathname === '/open-apis/im/v1/chats') return jsonRes({ code: 0, data: { items: [], has_more: false } }); return jsonRes({ code: 404, msg: 'unrouted' }, 404); }; return { st, fetchFn }; };
    const bootL = async (dir, v) => { fs.mkdirSync(dir, { recursive: true }); const ints = STORE.create({ dataDir: path.join(dir, 'int'), env: LENV, now, broadcast: () => {}, log: quiet }); const port = await freePort(); const oauth = OAUTH.createOAuthLoopback({ now, log: quiet, fixedCallbackUrl: `http://127.0.0.1:${port}/lark/cb` }); const e = ENG.create({ dataDir: dir, env: {}, now, broadcast: () => {}, integrations: ints, fetch: v.fetchFn, log: quiet, oauth, ...FAST_PACE }); return { e, stop: () => { oauth.stopAll(); e.stop(); } }; };
    const landL = async (flow, code) => { const cu = new URL(flow.consentUrl); const u = new URL(flow.redirectUri); u.searchParams.set('state', cu.searchParams.get('state')); u.searchParams.set('code', code); const r = await get(u.toString()); await sleep(80); return r; };
    const dir = path.join(ROOT, 'r6-lark-legacy'); const v = larkV();
    const b0 = await bootL(dir, v); const r = await b0.e.connect('lark', { credentialKey: 'cluster:tA' }); await landL(r.flow, 'c-a'); b0.stop();
    const box = SB.secretBox(path.join(dir, '.channels-key'));
    const file = path.join(dir, 'channels', 'adapters.json'); const j = JSON.parse(fs.readFileSync(file, 'utf-8')); const lr = j.adapters.find((x) => x.id === 'lark');
    ok(lr && lr.auth.tokenEnc && lr.identity && lr.identity.openId === 'ou_appa_a', `fixture: a Lark account connected through the engine (${JSON.stringify(lr && lr.identity)}; ${lr && lr.lastAuthError})`);
    delete lr.identity; const t = JSON.parse(box.dec(lr.auth.tokenEnc)); delete t.unionId; delete t.userId; lr.auth.user = t.name; lr.auth.tokenEnc = box.enc(JSON.stringify(t)); fs.writeFileSync(file, JSON.stringify(j));
    const b1 = await bootL(dir, v); await sleep(30);
    const lrow = () => b1.e.adapterRecords().adapters.find((x) => x.id === 'lark');
    const rec0 = lrow(); const tok0 = rec0.auth.tokenEnc;
    ok(rec0.identity && rec0.identity.openId === 'ou_appa_a' && !rec0.identity.unionId, `(h) the legacy Lark record (auth.user "${rec0.auth.user}") is stamped at boot from its token's open_id`);
    const r1 = await b1.e.reauthorize('lark', {}); await landL(r1.flow, 'c-x');
    const rec1 = lrow();
    ok(rec1.auth.tokenEnc === tok0 && /connected as ou_appa_a; this sign-in is ou_appa_x/.test(rec1.lastAuthError || ''), `(h) a stranger under the same app: refused by name (${rec1.lastAuthError})`);
    const r2 = await b1.e.reauthorize('lark', {}); await landL(r2.flow, 'c-a');
    const rec2 = lrow();
    ok(rec2.auth.tokenEnc !== tok0 && rec2.lastAuthError === null && rec2.identity.unionId === 'on_a' && rec2.identity.userId === 'uid_a', '(h) the holder re-authorizes: accepted, the stamp completed with union_id / user_id');
    b1.stop();
  }
  // (i) THE DOOR'S COMPARE-AND-SWAP IS LOAD-BEARING: an adapter copy with a 150 ms await between its re-read and its persist (the shape one edit reopens — r5 relied on there being none) still cannot revert a re-authorize on the real engine; an engine copy without the CAS does
  {
    const gsrc = fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf-8');
    const gap = gsrc.replace("    const w = await persistToken(next, String(token.refresh_token || ''));", "    await new Promise((r) => setTimeout(r, 150));   // CONTROL: an await between the refresh's re-read and its persist\n    const w = await persistToken(next, String(token.refresh_token || ''));");
    ok(gap !== gsrc, 'CONTROL fixture: a gmail copy with a 150 ms await between the refresh\'s re-read and its persist');
    const gmailGap = MUTA.load('src/channels/gmail.js', gap, 'await-gap');
    const esrc = fs.readFileSync(ENGINE_PATH, 'utf-8');
    const noCas = esrc.replace("            if (supersedes !== undefined) {\n              const cur = read().token; const curRt = cur ? String(cur.refresh_token || '') : '';\n              if (!cur || curRt !== supersedes) { verdict = { written: false, superseded: true, held: cur ? curRt : null }; return; }\n            }\n", '');
    ok(noCas !== esrc, 'CONTROL fixture: the door\'s compare-and-swap removed from an engine copy');
    const ENG3 = require(MUTA.write(ENGINE_PATH, noCas, 'no-cas'));
    const run = async (engineModule, tag) => {
      const v = google12(); const dir = path.join(ROOT, 'r6-cas-' + tag); fs.mkdirSync(dir, { recursive: true });
      const ints = STORE.create({ dataDir: path.join(dir, 'int'), env: {}, now, broadcast: () => {}, drivePresets: () => P12, log: quiet });
      const reg = CH.createChannelRegistry(); reg.register(gmailGap.adapter);
      const e = engineModule.create({ dataDir: dir, env: {}, now, broadcast: () => {}, integrations: ints, fetch: v.fetchFn, log: quiet, registry: reg, ...FAST_PACE });
      const r = await e.connect('gmail', { credentialKey: 'cluster:org1' }); await land(r.flow, 'c1');
      await e.pass('gmail', { force: true }); clock += 3600e3;
      let release; v.st.holdRefresh = new Promise((x) => { release = x; });
      const p = e.pass('gmail', { force: true }).catch(() => {});
      for (let w = 0; w < 40 && v.st.refreshes === 0; w++) await sleep(5);
      release(); await sleep(10);   // the refresh re-reads (the old token) and enters its gap…
      const rr = await e.reauthorize('gmail', {}); await land(rr.flow, 'c1');   // …the re-authorize lands inside it
      await p; await sleep(60);
      const box = SB.secretBox(path.join(dir, '.channels-key')); const rec = row(e); const held = JSON.parse(box.dec(rec.auth.tokenEnc)); const disk = diskOf(dir).find((x) => x.id === 'gmail');
      const consentRt = [...v.st.issued.keys()].pop();
      e.stop();
      return { held: held.refresh_token, consentRt, reverted: held.refresh_token !== consentRt, diskSame: disk.auth.tokenEnc === rec.auth.tokenEnc, refreshes: v.st.refreshes };
    };
    const real = await run(ENG, 'real'); const ctl = await run(ENG3, 'nocas');
    ok(real.refreshes === 1 && !real.reverted && real.diskSame, `(i) the real door: a re-authorize landing inside the adapter's gap is KEPT (held ${real.held} = the consent's; the late persist superseded at apply time)`, JSON.stringify(real));
    ok(ctl.reverted, `CONTROL: without the compare-and-swap the late persist REVERTS the re-authorize (held ${ctl.held}, the consent's ${ctl.consentRt})`, JSON.stringify(ctl));
  }
  // ── verify r7 ──
  // (j) A HUMAN ACT DURING THE CONSENT'S COMPLETION WINS: a disconnect / a cancel / a newer sign-in / a client-switch
  // rebind's disconnect landing while the consent's profile read is in flight — the consent that completes late
  // writes nothing (live + disk), the record stays as the owner left it, no vendor call on an account the owner ended
  // (it used to: the token landed after the disconnect, the pass ran 4 calls; an older flow overwrote the newer sign-in's token)
  {
    const landAsync = (flow, code) => { const cu = new URL(flow.consentUrl); return get(`${flow.redirectUri}/?state=${cu.searchParams.get('state')}&code=${code}`); };
    const rtOf = (dir, rec) => JSON.parse(SB.secretBox(path.join(dir, '.channels-key')).dec(rec.auth.tokenEnc)).refresh_token;
    const run = async (engineModule, act, tag) => {
      const v = google12(); const dir = path.join(ROOT, `r7-cancel-${tag}-${act}`); fs.mkdirSync(dir, { recursive: true });
      const ints = STORE.create({ dataDir: path.join(dir, 'int'), env: {}, now, broadcast: () => {}, drivePresets: () => P12, log: quiet });
      const e = engineModule.create({ dataDir: dir, env: {}, now, broadcast: () => {}, integrations: ints, fetch: v.fetchFn, log: quiet, ...FAST_PACE });
      const r = await e.connect('gmail', { credentialKey: 'cluster:org1' }); await land(r.flow, 'c1');
      await e.pass('gmail', { force: true });
      if (act === 'cancel') await e.disconnect('gmail');
      let release; v.st.holdProfile = new Promise((x) => { release = x; }); const pc0 = v.st.profileCalls || 0;
      const r1 = await e.reauthorize('gmail', act === 'rebind' ? { credentialKey: 'cluster:channels' } : {}); const landing = landAsync(r1.flow, 'c1');
      for (let w = 0; w < 60 && (v.st.profileCalls || 0) === pc0; w++) await sleep(5);
      const held = (v.st.profileCalls || 0) === pc0 + 1;
      let newerRt = null;
      if (act === 'disconnect' || act === 'rebind') await e.disconnect('gmail');
      else if (act === 'cancel') await e.cancelAuth('gmail');
      else if (act === 'newer') { v.st.holdProfile = null; const r2 = await e.reauthorize('gmail', {}); await land(r2.flow, 'c1'); newerRt = rtOf(dir, row(e)); }
      const s0 = v.st.sends; release(); await landing; await sleep(150);
      const rec = row(e); const disk = diskOf(dir).find((x) => x.id === 'gmail'); const view = e.adapterView(rec);
      const out = { held, live: !!rec.auth.tokenEnc, disk: !!disk.auth.tokenEnc, state: view.auth.state, key: rec.credentialKey, calls: v.st.sends - s0, err: rec.lastAuthError, rt: rec.auth.tokenEnc ? rtOf(dir, rec) : null, newerRt };
      e.stop();
      return out;
    };
    for (const act of ['disconnect', 'cancel', 'newer', 'rebind']) {
      const o = await run(ENG, act, 'real');
      const good = o.held && (act === 'newer' ? o.rt === o.newerRt && o.err === null && o.state === 'connected' : !o.live && !o.disk && o.state !== 'connected' && o.calls === 0 && /was cancelled while it was being completed/.test(o.err || '') && (act !== 'rebind' || o.key === 'cluster:org1'));
      ok(good, `(j) ${act} while the consent's profile read is in flight: ${act === 'newer' ? `the NEWER sign-in's token is held (${o.rt}), connected, no error line from the older flow` : `nothing written (live ${o.live} / disk ${o.disk}), state ${o.state}, ${o.calls} vendor calls after`}; the late consent refused by name`, JSON.stringify(o));
    }
    // CONTROL: an engine copy whose door ignores `consent.cancelled` — the disconnect is undone by the late consent (RED as asserted)
    const ENG5 = patchedEngine([["              if (c) { verdict = { written: false, cancelled: String(c), held: !!read().token }; return; }\n", '']]);
    const c = await run(ENG5, 'disconnect', 'nocancel');
    ok(c.held && c.live && c.disk && c.state === 'connected', `CONTROL: without the door's cancelled check the consent lands after the disconnect (live ${c.live} / disk ${c.disk}, state ${c.state} — the record the owner ended is connected again)`, JSON.stringify(c));
  }
  // (k) THE DOOR HELD DIRECTLY (a wrapper kind captures the deps.tokens the engine hands its adapter): every judgement
  // runs INSIDE the serialized write — two consents of one tick on an UNBOUND record end with exactly ONE written
  // (the second judged against the first's stamp; the record used to end bound to whichever was enqueued last);
  // a CAS write (`supersedes`) never lands on a CLEARED store, even one naming '' (a writer that read nothing)
  {
    const fake = require(path.join(REPO, 'src/channels/fake.js'));
    const run = async (engineModule, tag) => {
      const captured = {};
      const wrap = { ...fake.fakePoll, create(record, deps) { captured.tokens = deps.tokens; captured.rec = record; return fake.fakePoll.create(record, deps); } };
      const reg = CH.createChannelRegistry(); reg.register(wrap);
      const dir = path.join(ROOT, `r7-door-${tag}`); fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: 'fp', kind: 'fake-poll', label: 'fp', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: true, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null }] }));
      const e = engineModule.create({ dataDir: dir, registry: reg, env: {}, now, broadcast: () => {}, log: quiet, ...FAST_PACE });
      await e.pass('fp', { force: true }).catch(() => {});
      const door = captured.tokens; const rt = () => { const t = door.read().token; return t ? t.refresh_token : null; };
      const w = (t, meta) => door.write(t, meta).then((x) => x, (err) => ({ err: err.code }));
      const [c1, c2] = await Promise.all([w({ refresh_token: 'P', access_token: 'p', email: 'person@x.com' }, { consent: true }), w({ refresh_token: 'Q', access_token: 'q', email: 'stranger@x.com' }, { consent: true })]);
      const twoConsents = { c1, c2, held: rt(), identity: captured.rec.identity && captured.rec.identity.email };
      await door.clear();
      const cleared = { named: await w({ refresh_token: 'C', access_token: 'c', email: 'person@x.com' }, { supersedes: 'P' }), blank: await w({ refresh_token: 'D', access_token: 'd', email: 'person@x.com' }, { supersedes: null }), held: rt() };
      e.stop();
      return { twoConsents, cleared };
    };
    const real = await run(ENG, 'real');
    ok(real.twoConsents.c1.written === true && real.twoConsents.c2.err === 'forbidden' && real.twoConsents.held === 'P' && real.twoConsents.identity === 'person@x.com', `(k) two consents in one tick on an unbound record: the first lands, the second is judged against ITS stamp and refused (held ${real.twoConsents.held}, bound to ${real.twoConsents.identity})`, JSON.stringify(real.twoConsents));
    ok(real.cleared.named.superseded === true && real.cleared.named.held === null && real.cleared.blank.superseded === true && real.cleared.held === null, '(k) a CAS write never lands on a CLEARED store — naming the old token or naming nothing (a writer that read no token has nothing to persist; a landing would resurrect a disconnected account)', JSON.stringify(real.cleared));
    // CONTROL: the identity judgement lifted out of the serialized callback (judged once, before the store's await — the r6 shape) ⇒ both consents land, the record ends bound to the stranger
    const src = fs.readFileSync(ENGINE_PATH, 'utf-8');
    const hoisted = src.replace("            const held = heldIdentity(rec, read().token);\n            const mm = identityMismatch(held, offered);\n            if (mm) { verdict = { written: false, mismatch: mm }; return; }\n", '')
      .replace("        let verdict = { written: true };\n        try {\n          await store.adapters.update(() => {\n            if (consent) {", "        let verdict = { written: true };\n        { const held0 = heldIdentity(rec, read().token); const mm0 = identityMismatch(held0, offered); if (mm0) throw new ChannelError('forbidden', mismatchSentence(rec.label || rec.id, mm0), { retryable: false, detail: { identityMismatch: mm0 } }); }\n        try {\n          await store.adapters.update(() => {\n            if (consent) {");
    ok(hoisted !== src && hoisted.split('heldIdentity(rec, read().token)').length === src.split('heldIdentity(rec, read().token)').length, 'CONTROL fixture: the identity judgement hoisted out of the serialized callback in an engine copy');
    const ENG6 = require(MUTA.write(ENGINE_PATH, hoisted, 'hoisted-judgement'));
    const ctl = await run(ENG6, 'hoisted');
    ok(ctl.twoConsents.c1.written === true && ctl.twoConsents.c2.written === true && ctl.twoConsents.identity === 'stranger@x.com', `CONTROL: judged before the await, BOTH consents land and the record ends bound to the stranger (${ctl.twoConsents.identity})`, JSON.stringify(ctl.twoConsents));
  }
  // ── verify r8 ──
  // (l) THE WRITE IS THE FACT — a cancel landing BETWEEN the door's callback (the consent on disk) and the loopback's
  // report: r7's loopback overrode the report ({ok:false, "nothing was connected"}) over a token on disk — the record
  // connected, its last sign-in line contradicting it, no pass kicked; a stop() there stamped adapters.json AFTER
  // store.close(). Now the loopback reports what the exchange DID (resolved = landed; a late cancel is CARRIED for the
  // pending path, whose durable write is still ahead), onAuthDone judges a disconnect-since by the record, and nothing
  // is written after stop() — the engine's stop is a cancel the door reads too.
  {
    const OL_PATH = path.join(REPO, 'src/oauth-loopback.js'); const OL8 = require(OL_PATH);
    const landAsync = (flow, code) => { const cu = new URL(flow.consentUrl); return get(`${flow.redirectUri}/?state=${cu.searchParams.get('state')}&code=${code}`); };
    const rtOf = (dir, rec) => (rec && rec.auth && rec.auth.tokenEnc ? JSON.parse(SB.secretBox(path.join(dir, '.channels-key')).dec(rec.auth.tokenEnc)).refresh_token : null);
    /** a WRITE is the atomic rename (a new inode) — the same bytes rewritten are still a write after stop */
    const stamp = (dir) => { const f = path.join(dir, 'channels', 'adapters.json'); const st = fs.statSync(f); return `${st.ino}:${st.mtimeMs}:${fs.readFileSync(f, 'utf-8')}`; };
    /** google12 with PER-CODE profile holds (two consents in flight at once) and a per-code refresh token */
    const googleR8 = () => {
      const st = { sends: 0, n: 0, issued: new Map(), access: new Map(), codeOf: new Map(), holds: new Map(), profileCalls: new Map() };
      const client = (id) => (id || '').split('.')[0];
      const issue = (c, code) => { st.n++; const at = `ya29.${c}-${st.n}`; st.access.set(at, clock + 3599e3); if (code) st.codeOf.set(at, code); return at; };
      const fetchFn = async (url, init = {}) => {
        const u = new URL(String(url)); const form = init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : null;
        if (u.hostname === 'oauth2.googleapis.com') {
          if (form.grant_type === 'authorization_code') { const c = client(form.client_id); const rt = `1//${c}-${form.code}-${++st.n}`; st.issued.set(rt, c); return jsonRes({ access_token: issue(c, form.code), expires_in: 3599, refresh_token: rt, scope: gmail.SCOPE, token_type: 'Bearer' }); }
          const c = client(form.client_id); if (st.issued.get(form.refresh_token) !== c) return jsonRes({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
          return jsonRes({ access_token: issue(c, null), expires_in: 3599, scope: gmail.SCOPE, token_type: 'Bearer' });
        }
        const at = String((init.headers || {}).Authorization || '').replace(/^Bearer /, ''); const exp = st.access.get(at);
        if (!exp || exp <= clock) return jsonRes({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
        st.sends++;
        const p = u.pathname.replace('/gmail/v1/users/me', '');
        if (p === '/profile') { const code = st.codeOf.get(at) || null; st.profileCalls.set(code, (st.profileCalls.get(code) || 0) + 1); const h = st.holds.get(code); if (h) await h.p; return jsonRes({ emailAddress: 'member.a@example.com', historyId: '100' }); }
        if (p === '/threads') return jsonRes({ threads: [{ id: 'thr_a' }] });
        if (/^\/threads\/[^/]+$/.test(p)) return jsonRes({ id: 'thr_a', messages: [{ id: 'm1', internalDate: String(T0), payload: { headers: [{ name: 'Subject', value: 'S' }, { name: 'From', value: 'x@example.com' }] } }] });
        if (p === '/history') return jsonRes({ historyId: '100' });
        return jsonRes({ error: { code: 404, message: 'unrouted' } }, 404);
      };
      const hold = (code) => { let release; const p = new Promise((x) => { release = x; }); st.holds.set(code, { p, release }); return () => { st.holds.delete(code); release(); }; };
      const waitHeld = async (code) => { for (let w = 0; w < 200 && !(st.profileCalls.get(code) > 0); w++) await sleep(5); return st.profileCalls.get(code) > 0; };
      return { st, fetchFn, hold, waitHeld };
    };
    /** the real loopback (or a copy), `exchange` wrapped so a human act runs AFTER the adapter's write and BEFORE the exchange returns */
    const wrapped = (OL, { timeoutMs = null } = {}) => { const real = OL.createOAuthLoopback({ now: () => Date.now(), log: quiet }); const h = { after: null }; return { ...real, h, begin: (o) => real.begin({ ...o, ...(timeoutMs ? { timeoutMs } : {}), exchange: async (a) => { const r = await o.exchange(a); if (h.after) { const f = h.after; h.after = null; await f(); } return r; } }) }; };
    const boot = (engineModule, name, { OL = null, timeoutMs = null } = {}) => {
      const v = googleR8(); const dir = path.join(ROOT, `r8-${name}`); fs.mkdirSync(dir, { recursive: true });
      const ints = STORE.create({ dataDir: path.join(dir, 'int'), env: {}, now, broadcast: () => {}, drivePresets: () => P12, log: quiet });
      const lines = []; const log = { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) };
      const oauth = OL ? wrapped(OL, { timeoutMs }) : null;
      const e = engineModule.create({ dataDir: dir, env: {}, now, broadcast: () => {}, integrations: ints, fetch: v.fetchFn, log, ...(oauth ? { oauth } : {}), ...FAST_PACE });
      return { e, v, dir, oauth, lines };
    };
    const connected = async (c) => { const r = await c.e.connect('gmail', { credentialKey: 'cluster:org1' }); await land(r.flow, 'c0'); await c.e.pass('gmail', { force: true }); return rtOf(c.dir, row(c.e)); };
    const snap = (c, s0) => { const rec = row(c.e); const disk = diskOf(c.dir).find((x) => x.id === 'gmail'); const view = c.e.adapterView(rec); return { live: rtOf(c.dir, rec), disk: rtOf(c.dir, disk), state: view.auth.state, key: rec.credentialKey, err: rec.lastAuthError, calls: c.v.st.sends - s0, connectedLine: c.lines.some((l) => /: connected as member/.test(l)) }; };
    // (l1) the five acts in the window — cancel / a newer sign-in / the timer's cancel / disconnect / stop()
    const late = async (engineModule, OL, act, tag) => {
      const c = boot(engineModule, `late-${act}-${tag}`, { OL }); const { e, v, dir, oauth, lines } = c;
      const t0 = await connected(c);
      const rel = v.hold('cA'); const r1 = await e.reauthorize('gmail', {}); const flowA = r1.flow.flowId; const landing = landAsync(r1.flow, 'cA'); const held = await v.waitHeld('cA');
      let stampAtStop = null; let acted = false;
      oauth.h.after = async () => { acted = true; if (act === 'cancel') await e.cancelAuth('gmail'); else if (act === 'newer') await e.reauthorize('gmail', {}); else if (act === 'timeout') e.oauth.cancel(flowA, 'timeout'); else if (act === 'disconnect') await e.disconnect('gmail'); else if (act === 'shutdown') { e.stop(); e.oauth.stopAll(); stampAtStop = stamp(dir); } };
      const s0 = v.st.sends; lines.length = 0; rel(); await landing; await sleep(120);
      const o = { held, acted, t0, ...snap(c, s0) }; const st = e.oauth.status(flowA) || {}; o.flowOk = st.ok; o.flowCancelled = st.cancelled; o.landed = o.disk !== null && o.disk !== t0;
      o.newerRunning = !!e.oauth.runningFor('gmail'); o.writtenAfterStop = stampAtStop !== null && stamp(dir) !== stampAtStop;
      if (act !== 'shutdown') { if (act === 'newer') await e.cancelAuth('gmail'); e.stop(); }
      return o;
    };
    for (const act of ['cancel', 'timeout']) {
      const o = await late(ENG, OL8, act, 'real');
      ok(o.held && o.acted && o.landed && o.flowOk === true && o.flowCancelled === (act === 'cancel' ? 'cancelled' : act) && o.err === null && o.state === 'connected' && o.connectedLine && o.calls > 0, `(l) ${act} between the door's callback and the report: the write stands (${o.disk}), the flow reports ok:${o.flowOk} (cancelled carried: ${o.flowCancelled}), no error line, connected, the pass kicked (${o.calls} calls)`, JSON.stringify(o));
    }
    { const o = await late(ENG, OL8, 'newer', 'real');
      ok(o.held && o.acted && o.landed && o.flowOk === true && o.err === null && o.state === 'connected' && o.newerRunning, `(l) a NEWER sign-in begun after the older's write: the older's consent stands (${o.disk}) and reports ok, no error line, the newer flow running`, JSON.stringify(o)); }
    { const o = await late(ENG, OL8, 'disconnect', 'real');
      ok(o.held && o.acted && o.live === null && o.disk === null && o.state !== 'connected' && o.err === null && !o.connectedLine && o.calls === 0 && o.flowOk === true, `(l) a disconnect after the write, before the report: the disconnect stands (live ${o.live} / disk ${o.disk}), no "connected" line, no pass (${o.calls} calls), no error line — the flow itself reports ok (its consent DID land)`, JSON.stringify(o)); }
    { const o = await late(ENG, OL8, 'shutdown', 'real');
      ok(o.held && o.acted && o.landed && !o.writtenAfterStop && o.calls === 0 && !o.connectedLine, `(l) stop() after the write, before the report: the write stands (${o.disk}), NOTHING written after stop, no pass, no "connected" line`, JSON.stringify(o)); }
    // CONTROL: a loopback copy with r7's override (a cancel mid-exchange ⇒ {ok:false} whatever the exchange did) ⇒ the report contradicts the disk (RED as asserted)
    { const src = fs.readFileSync(OL_PATH, 'utf-8'); const needle = "      st.error = null;\n      if (st.cancelled) log.warn && log.warn(`[oauth-loopback] ${st.id}: a ${st.cancelled} arrived after the exchange had completed — the consent stands, the report says ok`);\n";
      if (src.split(needle).length !== 2) throw new Error('control needle (loopback r8 report) not found exactly once');
      const OL7 = require(MUTA.write(OL_PATH, src.replace(needle, "      st.error = st.cancelled ? 'the sign-in was cancelled while it was being completed — nothing was connected' : null;\n      if (st.cancelled) st.result = null;\n"), 'r7-override'));
      const o = await late(ENG, OL7, 'cancel', 'ctl');
      ok(o.held && o.acted && o.landed && o.flowOk === false && o.state === 'connected' && /nothing was connected/.test(o.err || '') && !o.connectedLine && o.calls === 0, `CONTROL: with r7's override the report says cancelled ("${o.err}") while the token is on disk (${o.disk}, state ${o.state}) and no pass runs — the contradiction`, JSON.stringify(o)); }
    // CONTROL: an engine copy without onAuthDone's stop guard ⇒ adapters.json written after store.close() (RED as asserted)
    { const ENG7 = patchedEngine([["    if (stopped) { log.log(`[channels] ${rec.id}: a sign-in completed after the engine stopped — nothing is written after stop (${r && r.ok ? 'its consent had landed and stands' : (r && r.error) || 'the consent flow failed'})`); return; }\n", '']]);
      const o = await late(ENG7, OL8, 'shutdown', 'ctl');
      ok(o.held && o.acted && o.writtenAfterStop, `CONTROL: without the stop guard onAuthDone writes adapters.json after stop() (written after stop: ${o.writtenAfterStop})`, JSON.stringify(o)); }
    // (l2) stop() while the exchange is IN FLIGHT, the engine's OWN loopback: refused by name, nothing written after stop, the listener closed
    { const c = boot(ENG, 'stop-inflight'); const { e, v, dir, lines } = c; const t0 = await connected(c);
      const rel = v.hold('cA'); const r1 = await e.reauthorize('gmail', {}); const landing = landAsync(r1.flow, 'cA'); await v.waitHeld('cA');
      const s0 = v.st.sends; lines.length = 0; e.stop(); const b0 = stamp(dir); const st0 = e.oauth.status(r1.flow.flowId);
      rel(); await landing; await sleep(150);
      const o = snap(c, s0); const st = e.oauth.status(r1.flow.flowId) || {}; const port = await get(`${r1.flow.redirectUri}/`);
      ok(st0 && st0.cancelled === 'shutdown' && o.disk === t0 && o.live === t0 && st.ok === false && /ended by a shutdown/.test(st.error || '') && stamp(dir).split(':').slice(2).join(':') === b0.split(':').slice(2).join(':') && o.calls === 0 && port.status === 0, `(l2) stop() mid-exchange: the door refused by name ("${st.error}"), the token untouched (${o.disk}), adapters.json's STATE unchanged after stop (the refused door still rides the store's unconditional atomic rewrite — same bytes, new inode: recorded), no vendor call, the listener closed (${port.body})`, JSON.stringify({ o, st, st0, sameBytes: stamp(dir).split(':').slice(2).join(':') === b0.split(':').slice(2).join(':'), sameInode: stamp(dir).split(':')[0] === b0.split(':')[0] })); }
    // (l3) the flow's OWN deadline (a real 300 ms one): mid-exchange ⇒ refused by name, untouched; after the write ⇒ stands
    { const c = boot(ENG, 'deadline-mid', { OL: OL8, timeoutMs: 300 }); const { e, v } = c; const t0 = await connected(c);
      const rel = v.hold('cA'); const r1 = await e.reauthorize('gmail', {}); const landing = landAsync(r1.flow, 'cA'); await v.waitHeld('cA'); await sleep(450);
      const st0 = e.oauth.status(r1.flow.flowId); const s0 = v.st.sends; rel(); await landing; await sleep(120);
      const o = snap(c, s0);
      ok(st0 && st0.cancelled === 'timeout' && o.disk === t0 && /past its time limit/.test(o.err || '') && o.calls === 0 && o.state === 'connected', `(l3) the deadline fired mid-exchange: refused by name ("${o.err}"), the record untouched (${o.disk}), no pass`, JSON.stringify(o)); e.stop();
      const c2 = boot(ENG, 'deadline-after', { OL: OL8, timeoutMs: 300 }); const t02 = await connected(c2);
      const r2 = await c2.e.reauthorize('gmail', {}); const s02 = c2.v.st.sends; await land(r2.flow, 'cA'); const w = snap(c2, s02); await sleep(450); const a = snap(c2, s02); const st2 = c2.e.oauth.status(r2.flow.flowId) || {};
      ok(w.disk !== t02 && a.disk === w.disk && a.err === null && st2.ok === true && st2.cancelled === null, `(l3) the deadline after the write: the write stands (${a.disk}), no refusal, the flow ok:${st2.ok} cancelled:${st2.cancelled}`, JSON.stringify({ w, a, st2 })); c2.e.stop(); }
    // (l4) THE PENDING PATH UNDER `superseded` — 20 orderings on the real engine (10 the record's door = a same-client
    // re-authorize, 10 the pending path = a client-switch rebind): A's exchange in flight, B (same account) begins ⇒ A
    // superseded; A answering first / after B's write is refused (never a second write); B cancelled or the account
    // disconnected while A is in flight ⇒ nothing written, the record as the owner left it; the refusal's tail says
    // what the record holds ("keeps its current sign-in" on a connected one, "nothing was connected" after a disconnect)
    const SEQS = [['A', 'B', 'rA', 'Bl', 'rB'], ['A', 'B', 'Bl', 'rB', 'rA'], ['A', 'B', 'Bl', 'rA', 'rB'], ['A', 'B', 'cB', 'rA'], ['A', 'B', 'Bl', 'cB', 'rB', 'rA'], ['A', 'B', 'Bl', 'cB', 'rA', 'rB'], ['A', 'B', 'dc', 'rA'], ['A', 'B', 'Bl', 'dc', 'rB', 'rA'], ['A', 'B', 'Bl', 'dc', 'rA', 'rB'], ['A', 'B', 'Bl', 'rB', 'dc', 'rA']];
    for (const pth of ['door', 'pend']) for (const [i, seq] of SEQS.entries()) {
      const c = boot(ENG, `ord-${pth}-${i}`); const { e, v } = c; const t0 = await connected(c); const key0 = row(e).credentialKey;
      const flows = {}; const rels = {}; const landings = {}; let cancelledB = false, disconnected = false; let sDc = 0; let tokenWrites = 0;
      const orig = e.store.adapters.update; e.store.adapters.update = (fn) => orig((ad) => { const rec = ad.adapters.find((x) => x.id === 'gmail'); const b = rec && rec.auth && rec.auth.tokenEnc; const r = fn(ad); const a = rec && rec.auth && rec.auth.tokenEnc; if (a && a !== b) tokenWrites++; return r; });
      const s0 = v.st.sends;
      for (const step of seq) {
        if (step === 'A' || step === 'B') { rels[step] = v.hold(`c${step}`); const r = await e.reauthorize('gmail', pth === 'pend' ? { credentialKey: 'cluster:channels' } : {}); flows[step] = r.flow; if (step === 'A') { landings.A = landAsync(r.flow, 'cA'); await v.waitHeld('cA'); } }
        else if (step === 'Bl') { landings.B = landAsync(flows.B, 'cB'); await v.waitHeld('cB'); }
        else if (step === 'rA' || step === 'rB') { rels[step[1]](); await landings[step[1]]; await sleep(60); }
        else if (step === 'cB') { cancelledB = true; await e.cancelAuth('gmail'); }
        else if (step === 'dc') { disconnected = true; await e.disconnect('gmail'); sDc = v.st.sends; }
      }
      await sleep(60);
      const r = snap(c, disconnected ? sDc : s0); const wroteA = /cA/.test(r.disk || ''); const wroteB = /cB/.test(r.disk || '');
      const bLanded = seq.includes('rB'); const bCancelled = cancelledB && (seq.indexOf('cB') < seq.indexOf('rB') || !bLanded); const dcAfterB = disconnected && bLanded && seq.indexOf('dc') > seq.indexOf('rB');
      let good, why;
      if (disconnected) { good = r.live === null && r.disk === null && r.state !== 'connected' && !wroteA && r.calls === 0 && tokenWrites === (dcAfterB ? 1 : 0) && (r.err === null || /nothing was connected/.test(r.err)); why = `disconnected — nothing of A written, token writes ${tokenWrites}, ${r.calls} calls after the disconnect, line ${JSON.stringify(r.err)}`; }
      else if (bCancelled) { good = r.disk === t0 && r.live === t0 && r.state === 'connected' && r.key === key0 && tokenWrites === 0 && (r.err === null || /keeps its current sign-in/.test(r.err)); why = `B cancelled — the pre-flow record (${r.disk}, ${r.key}), 0 token writes, line ${JSON.stringify(r.err)}`; }
      else { good = wroteB && !wroteA && tokenWrites === 1 && r.state === 'connected' && r.err === null && r.key === (pth === 'pend' ? 'cluster:channels' : key0); why = `B's consent is the ONE write (${r.disk}, ${r.key}), A refused, no error line`; }
      ok(good, `(l4) [${pth}] ${seq.join(' ')} ⇒ ${why}`, JSON.stringify({ ...r, tokenWrites, t0 }));
      e.stop();
    }
  }
}

// ── THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──────────────
// Measured HERE, while the patched engine copies still exist (the scratch dir
// goes at exit). They used to be gitignored siblings,
// src/server/.channels-engine.prefix-*, that every src/ scanner running beside
// this suite read as a second engine. Five are unconditional (the pre-r4
// copies SKIP on a shallow clone).
console.log('tree: the patched copies never touch the tree');
for (const r of copiesCensus(MUTA.files, MUTA.dir, REPO, { minCopies: 5 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);
cleanup();
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
