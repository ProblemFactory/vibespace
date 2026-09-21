#!/usr/bin/env node
// INTEGRATIONS & KEYS (docs/design-communication-panel.zh.md §14; §17's
// `test-integration-registry` row; §19's P0 r7/r8 exit conditions). Fast tier.
//
// §1 the PURE table — every row's fields / test / consumers, the closed test
//    kinds, prerequisites ⇒ caveat, callback URL is a loopback, decision 25
// §2 masking — last 4 ONLY at length ≥ 12; omit-vs-'' ; trimming; named errors
// §3 precedence as a pure function — user > cluster > none, a user value
//    SURVIVES a later env injection; the delegating pick: prefer / saved /
//    only-one / "choose one", with `_driveClient()`'s 'default' fallback as
//    the negative control (null on a two-preset list)
// §4 the STORE over real files, through the REAL routes on a real http port:
//    a 40-char secret written through PUT is ABSENT from every GET body, every
//    broadcast frame and the on-disk file; the walk none → user → cluster →
//    none-with-a-reason; inject-then-remove; a selector-only record answers
//    `cluster`; DELETE lands on cluster/none; `use:'cluster'` refuses by name;
//    Test dispatches to the consumer's runner (fixture switch) and refuses
//    `not-wired` by name; single flight; an unreadable key is SAID; (r3) a
//    ROTATED key WITH a cluster default present answers none — never cluster —
//    with the reason, hasOwnValues, a typed storeError and ONE log line
// §5 THE ADAPTERS ROW FLIPS — the REAL channels engine with the store: a
//    withdrawn credential answers `needs-credentials` on the digest, with a
//    card-only patched copy as the control
// §6 the CENSUSES, each with a synthetic offender: env NAMES over `git
//    ls-files` (printed), no timer/scheduler calls `.test(`, every consumer
//    file really calls resolveIntegration('<id>'), the callback literal has ONE
//    definition, one env name has one resolver, no route touches plaintext,
//    (r3) no file outside the store BUILDS an env name either
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const R = require(path.join(REPO, 'src/integration-registry.js'));
const STORE_PATH = path.join(REPO, 'src/server/integration-store.js');
const ENGINE_PATH = path.join(REPO, 'src/server/channels-engine.js');
const storeMod = require(STORE_PATH);
const ROOT = scratch('integ');
const patched = [];
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} for (const p of patched) { try { fs.unlinkSync(p); } catch {} } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

// patched copies: gitignored, PID-swept, unique names (node caches by path)
let seq = 0;
function patchCopy(srcPath, prefix, replacements) {
  const dir = path.dirname(srcPath);
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(new RegExp(`^\\${prefix}(\\d+)-\\d+\\.js$`)); if (!m) continue;
    let alive = false; try { process.kill(Number(m[1]), 0); alive = true; } catch (e) { alive = e && e.code === 'EPERM'; }
    if (!alive) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
  }
  let s = fs.readFileSync(srcPath, 'utf-8');
  for (const [from, to] of replacements) {
    if (!s.includes(from)) throw new Error(`patchCopy(${path.basename(srcPath)}): anchor not found: ${from.slice(0, 80)}`);
    s = s.replace(from, to);
  }
  const p = path.join(dir, `${prefix}${process.pid}-${++seq}.js`);
  fs.writeFileSync(p, s); patched.push(p);
  return p;
}
const gi = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf-8');
ok(/src\/server\/\.integration-store\.prefix-\*\.js/.test(gi) && /src\/server\/\.channels-engine\.prefix-\*\.js/.test(gi), 'the patched copies this suite writes are gitignored');

// ═══ §1 THE PURE TABLE ═══════════════════════════════════════════════════
console.log('§1 the PURE table');
{
  const src = fs.readFileSync(path.join(REPO, 'src/integration-registry.js'), 'utf-8');
  ok(!/\brequire\(|\bimport\s/.test(src.replace(/^\s*(\*|\/\/).*$/gm, '')), 'src/integration-registry.js imports NOTHING');
  const ids = R.rowIds();
  ok(new Set(ids).size === ids.length && ids.length >= 4, `row ids are unique (${ids.join(', ')})`);
  for (const row of R.ROWS) { const errs = R.checkRow(row); ok(!errs.length, `row ${row.id} passes its own checks`, errs.join('; ')); }
  ok(['fake', 'lark', 'gmail', 'cloak'].every((id) => R.rowById(id)), 'the four P0b rows exist: fake, lark, gmail, cloak');
  ok(R.TEST_KINDS.length === 3 && Object.keys(R.TEST_BUTTON_LABEL).sort().join() === [...R.TEST_KINDS].sort().join(), 'test.kind is a CLOSED set of 3 and every kind has its button wording');
  const fake = R.rowById('fake');
  ok(fake.consumers.length === 1 && fake.setup && fake.setup.callbackUrl && fake.setup.prerequisites.length >= 1 && fake.test.caveat, 'the fake row has a LIVE consumer, a setup block with a callback URL + prerequisites, and a caveat (§19 r7/r8 exits)');
  const lark = R.rowById('lark');
  ok(lark.setup.callbackUrl === R.LARK_CALLBACK_URL && lark.setup.callbackUrl === 'http://127.0.0.1:17865/lark/cb', 'the Lark callback URL is the fixed VibeSpace loopback (decision 4) and the exported constant IS the row\'s value');
  ok(lark.setup.prerequisites.length === 3 && lark.test.kind === 'credential-exchange' && /consent/i.test(lark.test.caveat), 'lark: three prerequisites, credential-exchange, a caveat naming the consent page');
  ok(lark.fields.find((f) => f.key === 'appSecret').secret === true && lark.fields.find((f) => f.key === 'appId').secret === false, 'lark: appSecret is secret, appId is not');
  const gmail = R.rowById('gmail');
  ok(gmail.delegate && gmail.delegate.to === 'drive-presets' && gmail.delegate.prefer === 'channels' && gmail.delegate.multi === true && !gmail.clusterEnv, 'gmail DELEGATES to drive-presets with prefer:channels + multi and declares NO env of its own (decision 5)');
  ok(gmail.test.kind === 'shape-only' && /shape/i.test(gmail.test.caveat), 'gmail: shape-only and says so');
  const cloak = R.rowById('cloak');
  ok(cloak.test.kind === 'shape-only' && cloak.fields[0].key === 'licenseKey' && cloak.fields[0].secret && !cloak.fields[0].required, 'cloak: shape-only, one secret licenseKey, NOT required (empty = free tier)');
  for (const row of R.ROWS) if (!row.consumers.length) ok(!!row.wiredIn, `${row.id}: no live consumer ⇒ names the phase it is wired in (decision 25, ${row.wiredIn})`);
  // negative controls on checkRow
  const noCaveat = { ...lark, test: { ...lark.test, caveat: '' } };
  ok(R.checkRow(noCaveat).some((e) => /caveat/.test(e)), 'CONTROL: a row with prerequisites but no caveat is refused');
  const orphan = { ...cloak, consumers: [], wiredIn: null };
  ok(R.checkRow(orphan).some((e) => /decision 25/.test(e)), 'CONTROL: a row with no consumer and no wiredIn phase is refused');
  const both = { ...lark, delegate: gmail.delegate };
  ok(R.checkRow(both).some((e) => /UNION/.test(e)), 'CONTROL: clusterEnv and delegate together are refused (a union)');
  const publicCb = { ...lark, setup: { ...lark.setup, callbackUrl: 'https://my-instance.example/lark/cb' } };
  ok(R.checkRow(publicCb).some((e) => /loopback/.test(e)), 'CONTROL: a per-instance public callback URL is refused (decision 4/21)');
  ok(storeMod.envFieldName('lark', 'appSecret') === 'VIBESPACE_INTEGRATION_LARK_APPSECRET' && storeMod.envFieldName('cloud:kernel', 'api-key') === 'VIBESPACE_INTEGRATION_CLOUD_KERNEL_API_KEY', 'envFieldName (the STORE\'s since r3) upper-cases and maps - and : to _');
  ok(R.ROWS.filter((r) => r.clusterEnv).every((r) => storeMod.envFieldName(r.id, 'x').startsWith(r.clusterEnv.prefix)), 'every declared prefix IS what the store derives from the row id (one declaration, one derivation)');
}

// ═══ §2 masking + validation ═══════════════════════════════════════════════
console.log('§2 masking + validation');
{
  ok(R.maskValue('a'.repeat(11)) === '••••', '11 chars: mask only (the last 4 would be most of it)');
  ok(R.maskValue('abcdefgh1234') === '••••1234', '12 chars: mask + last 4 (the boundary)');
  ok(R.maskValue('x'.repeat(40) + 'WXYZ') === '••••WXYZ' && R.maskValue('') === null && R.maskValue(null) === null, 'long ⇒ last 4; empty/null ⇒ null');
  const v = R.validateValues('lark', { appId: '  cli_abc123  ', appSecret: undefined });
  ok(v.ok && v.values.appId === 'cli_abc123' && !('appSecret' in v.values), 'a value is TRIMMED; an omitted field is not in the result (untouched)');
  const cleared = R.validateValues('lark', { appSecret: '' });
  ok(cleared.ok && cleared.values.appSecret === '', "'' means CLEARED and is not validated");
  const badId = R.validateValues('lark', { appId: 'nope' });
  ok(!badId.ok && /cli_/.test(badId.errors.appId), `a bad App ID is a NAMED complaint (${badId.errors.appId})`);
  const unknown = R.validateValues('lark', { bogus: 'x' });
  ok(!unknown.ok && /not a field/.test(unknown.errors.bogus), 'an unknown field is a named error, never silently dropped');
  ok(R.validateValues('cloak', { licenseKey: '' }).ok && R.validateValues('cloak', { licenseKey: 'cb_abcdefghij' }).ok && !R.validateValues('cloak', { licenseKey: 'nope' }).ok, 'cloak: empty ok (free tier), cb_… ok, other shapes named');
  ok(R.missingFields('lark', { appId: 'cli_x' }).join() === 'appSecret' && R.missingFields('cloak', {}).length === 0, 'missingFields names the required gap and nothing for optional fields');
}

// ═══ §3 precedence, pure ══════════════════════════════════════════════════
console.log('§3 precedence, pure');
{
  const cluster = { key: 'default', label: 'Cluster', values: { appId: 'cli_cluster', appSecret: 'cluster-secret-1234' } };
  ok(R.resolvePrecedence(null, null).source === 'none' && /no user values/.test(R.resolvePrecedence(null, null).why), 'nothing ⇒ none WITH a reason');
  ok(R.resolvePrecedence(null, cluster).source === 'cluster' && R.resolvePrecedence(null, cluster).clusterKey === 'default', 'cluster only ⇒ cluster, with its key');
  const u = R.resolvePrecedence({ appId: 'cli_mine', appSecret: 'my-secret-123456' }, cluster);
  ok(u.source === 'user' && u.values.appId === 'cli_mine', 'USER > CLUSTER: a user value survives a later env injection');
  ok(R.resolvePrecedence({ appId: '' }, cluster).source === 'cluster', "an EMPTY user value is absent, not 'user'");
  ok(R.resolvePrecedence(null, null, { clusterWhy: 'the cluster default this row used (org1) is no longer provided' }).why.includes('no longer provided'), 'a withdrawn default carries ITS reason into `why`');
  // the delegating pick
  const two = [{ key: 'org1', label: 'Org 1', values: {} }, { key: 'channels', label: 'Channels', values: {} }];
  ok(R.pickPreset(two, { prefer: 'channels' }).preset.key === 'channels', 'two presets (org1 + channels, no default) ⇒ `prefer` wins');
  ok(R.pickPreset(two, { prefer: 'channels', savedKey: 'org1' }).preset.key === 'org1', 'the user\'s SAVED choice beats `prefer`');
  const gone = R.pickPreset(two, { prefer: 'channels', savedKey: 'legacy' });
  ok(gone.preset === null && /legacy/.test(gone.why), 'a saved key the cluster no longer provides ⇒ null WITH the key named (never a silent swap to prefer)');
  ok(R.pickPreset([two[0]], { prefer: 'channels' }).preset.key === 'org1', 'one preset and prefer misses ⇒ the only one');
  const ambiguous = R.pickPreset(two, { prefer: 'nope' });
  ok(ambiguous.preset === null && /choose one/.test(ambiguous.why), 'two presets, no saved, prefer misses ⇒ null + "choose one" (no fourth rung)');
  // NEGATIVE CONTROL: `_driveClient()`'s fallback shape (src/mounts.js) on the same list
  const driveClientFallback = (presets) => (presets.length === 1 ? presets[0] : presets.find((c) => c.key === 'default') || null);
  ok(driveClientFallback(two) === null, 'CONTROL: the _driveClient() `default` fallback answers null on org1 + channels — the shape the delegating row must not inherit');
}

// ═══ §4 THE STORE, through the REAL routes ═══════════════════════════════
console.log('§4 the store through the real routes');
const SECRET40 = 'sk-' + 'Q7f3'.repeat(8) + 'ZZZ99';   // 40 chars, unmistakable
ok(SECRET40.length === 40, 'the synthetic secret is 40 chars');
const drivePresetsHolder = { list: [] };
const frames = [];
const env = {};
const dataDir = path.join(ROOT, 'data'); fs.mkdirSync(dataDir, { recursive: true });
let clock = 1_700_000_000_000;
// the store's logger is CAPTURED, not swallowed: "the secret appears in no log
// line" is an exit condition, and a stub that drops every line cannot measure it
const logLines = [];
const capLog = (lvl) => (...a) => logLines.push(lvl + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const store = storeMod.create({ dataDir, env, now: () => clock, broadcast: (m) => frames.push(m), drivePresets: () => drivePresetsHolder.list, log: { log: capLog('log'), warn: capLog('warn'), error: capLog('error') } });
const express = require(path.join(REPO, 'node_modules/express'));
const routes = require(path.join(REPO, 'src/routes/integrations.js'));
routes.setup({ getStore: () => store });
const app = express(); app.use(express.json()); app.use(routes.router);
const PORT = await freePort();
const server = http.createServer(app);
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
process.on('exit', () => { try { server.close(); } catch {} });
const api = async (method, p, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};
const allBodies = [];
const get = async (p) => { const r = await api('GET', p); allBodies.push(r.text); return r; };
{
  const r0 = await get('/api/integrations');
  ok(r0.status === 200 && Array.isArray(r0.json.integrations) && r0.json.integrations.length === R.ROWS.length, 'GET /api/integrations lists every row');
  const f0 = r0.json.integrations.find((x) => x.id === 'fake');
  ok(f0.source === 'none' && f0.missing.join() === 'apiKey' && /no default/.test(f0.why), `fake starts as none, names the missing field, says why (${f0.why})`);
  ok(f0.fields.every((f) => !('validate' in f)) && f0.setup.callbackUrl === 'http://127.0.0.1:17865/fake/cb' && f0.testButton === 'Check format (no network)', 'the wire carries declarations only (no validate fns), the setup block and the button wording');
  ok(!('values' in f0) || Object.keys(f0.values).every((k) => !f0.fields.find((x) => x.key === k).secret), 'no secret key appears under `values` on the wire');

  // PUT a 40-char secret ⇒ user; masked; plaintext nowhere
  const put = await api('PUT', '/api/integrations/fake', { values: { apiKey: `  ${SECRET40}\n`, region: 'eu' } });
  ok(put.status === 200 && put.json.ok && put.json.integration.source === 'user', 'PUT {values} ⇒ source user');
  const v1 = put.json.integration;
  ok(v1.set.apiKey === true && v1.masked.apiKey === '••••ZZ99' && v1.values.region === 'eu', 'the secret is SET and masked with its last 4; the non-secret is plain');
  ok(!put.text.includes(SECRET40), 'the PUT response body does not carry the plaintext');
  const g1 = await get('/api/integrations/fake');
  ok(!g1.text.includes(SECRET40) && g1.json.integration.masked.apiKey === '••••ZZ99', 'GET one: masked, never the plaintext');
  const onDisk = fs.readFileSync(path.join(dataDir, 'integrations.json'), 'utf-8');
  ok(!onDisk.includes(SECRET40) && /"apiKey": "[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+"/.test(onDisk) && onDisk.includes('"region": "eu"'), 'on disk: the secret is `iv.tag.data` ciphertext, the non-secret is plain, no `source` field');
  ok(!/"source"/.test(onDisk), '`source` is NEVER stored — it is derived at read time');
  ok(fs.existsSync(path.join(dataDir, '.integrations-key')) && (fs.statSync(path.join(dataDir, '.integrations-key')).mode & 0o777) === 0o600, 'the store has its OWN 0600 key file (decision 24)');
  const res1 = store.resolveIntegration('fake');
  ok(res1.source === 'user' && res1.values.apiKey === SECRET40 && res1.values.region === 'eu', 'resolveIntegration (the consumer\'s call) hands back the TRIMMED plaintext');

  // omit vs ''
  const put2 = await api('PUT', '/api/integrations/fake', { values: { region: 'us' } });
  ok(put2.json.integration.set.apiKey === true && put2.json.integration.values.region === 'us', 'an OMITTED secret is untouched while a sibling field changes');
  const put3 = await api('PUT', '/api/integrations/fake', { values: { apiKey: '' } });
  ok(put3.json.integration.set.apiKey === false && put3.json.integration.values.region === 'us', "'' CLEARS the secret and leaves the sibling");
  // named refusal on a bad value, nothing written
  const bad = await api('PUT', '/api/integrations/lark', { values: { appId: 'nope' } });
  ok(bad.status === 400 && /appId: .*cli_/.test(bad.json.error) && bad.json.code === 'invalid-values', `a bad value is a 400 with the field NAMED (${bad.json.error})`);
  ok(store.resolveIntegration('lark').source === 'none', 'and nothing was written for it');
  const unk = await api('PUT', '/api/integrations/nope', { values: {} });
  ok(unk.status === 404, 'an unknown id is 404');

  // restore the user secret for the walk
  await api('PUT', '/api/integrations/fake', { values: { apiKey: SECRET40 } });
  // inject a cluster default ⇒ the user's value SURVIVES
  env.VIBESPACE_INTEGRATIONS = JSON.stringify([{ id: 'fake', label: 'Cluster fake', values: { apiKey: 'cluster-fake-key-000000', region: 'cluster' } }]);
  const g2 = await get('/api/integrations/fake');
  ok(g2.json.integration.source === 'user' && g2.json.integration.clusterAvailable === true, 'USER > CLUSTER: injecting an env default does not displace the user\'s own key');
  // DELETE ⇒ lands on cluster
  const del = await api('DELETE', '/api/integrations/fake');
  ok(del.json.integration.source === 'cluster' && del.json.integration.clusterKey === 'default' && del.json.integration.clusterLabel === 'Cluster fake' && del.json.integration.fromEnv === true, 'DELETE ("drop my keys") lands on the CLUSTER default when one exists, chip = cluster · <label>');
  ok(!del.text.includes('cluster-fake-key-000000') && del.json.integration.masked.apiKey === '••••0000', 'the cluster secret is masked on the wire too');
  ok(store.resolveIntegration('fake').values.apiKey === 'cluster-fake-key-000000', 'the consumer resolves the CLUSTER value, read from env at the moment of the question');
  ok(!fs.readFileSync(path.join(dataDir, 'integrations.json'), 'utf-8').includes('cluster-fake-key'), 'the cluster value is NEVER copied into data/integrations.json');
  // use:'cluster' explicitly; then withdraw the env ⇒ none WITH the reason
  const use = await api('PUT', '/api/integrations/fake', { use: 'cluster' });
  ok(use.status === 200 && use.json.integration.source === 'cluster', "PUT {use:'cluster'} keeps it on the cluster");
  delete env.VIBESPACE_INTEGRATIONS;
  const g3 = await get('/api/integrations/fake');
  ok(g3.json.integration.source === 'none' && /no longer provided/.test(g3.json.integration.why) && g3.json.integration.set.apiKey === false,
    `INJECT-THEN-REMOVE: the row answers none WITH THE REASON, never the old value (${g3.json.integration.why})`);
  ok(store.resolveIntegration('fake').source === 'none', 'and the consumer is told none too (an adapter is never quietly handed a dead credential)');
  // use:'cluster' now REFUSES BY NAME
  const refuse = await api('PUT', '/api/integrations/fake', { use: 'cluster' });
  ok(refuse.status === 409 && refuse.json.code === 'no-cluster-default' && /no longer provided|no default/.test(refuse.json.error), `useClusterDefault with no default is a NAMED refusal (${refuse.json.code})`);
  const del2 = await api('DELETE', '/api/integrations/fake');
  ok(del2.status === 200 && del2.json.integration.source === 'none', 'DELETE with no default is ALWAYS allowed and lands on none');
  // the single-field env form
  env.VIBESPACE_INTEGRATION_FAKE_APIKEY = 'prefix-form-key-12345678';
  ok(store.resolveIntegration('fake').source === 'cluster' && store.resolveIntegration('fake').values.apiKey === 'prefix-form-key-12345678', 'the single-field form VIBESPACE_INTEGRATION_FAKE_APIKEY is a cluster default too');
  env.VIBESPACE_INTEGRATIONS = JSON.stringify([{ id: 'fake', values: { apiKey: 'json-form-key-12345678' } }]);
  ok(store.resolveIntegration('fake').values.apiKey === 'json-form-key-12345678', 'when both forms name the row the JSON form wins');
  delete env.VIBESPACE_INTEGRATIONS; delete env.VIBESPACE_INTEGRATION_FAKE_APIKEY;
  env.VIBESPACE_INTEGRATIONS = '{not json';
  ok(store.resolveIntegration('fake').source === 'none', 'an unparseable VIBESPACE_INTEGRATIONS is "no cluster default", never a throw');
  delete env.VIBESPACE_INTEGRATIONS;

  // the delegating row
  drivePresetsHolder.list = [{ key: 'org1', label: 'Org 1', clientId: 'org1.apps.googleusercontent.com', clientSecret: 'org1-secret-000000' }, { key: 'channels', label: 'Channels', clientId: 'ch.apps.googleusercontent.com', clientSecret: 'channels-secret-0000' }];
  const gm = await get('/api/integrations/gmail');
  ok(gm.json.integration.source === 'cluster' && gm.json.integration.clusterKey === 'channels' && gm.json.integration.clusterLabel === 'Channels', 'gmail on org1 + channels (no default) resolves to `prefer` = channels');
  ok(gm.json.integration.clusterOptions.length === 2 && gm.json.integration.clusterOptions.every((o) => Object.keys(o).sort().join() === 'key,label') && gm.json.integration.delegate.multi === true, 'clusterOptions carry key + label ONLY, and the row says multi');
  ok(!gm.text.includes('org1-secret') && !gm.text.includes('channels-secret'), 'no preset secret is on the wire');
  const pick = await api('PUT', '/api/integrations/gmail', { clusterKey: 'org1' });
  ok(pick.json.integration.source === 'cluster' && pick.json.integration.clusterKey === 'org1', 'a SAVED selector beats prefer: clusterKey org1');
  ok(store.resolveIntegration('gmail').values.clientId === 'org1.apps.googleusercontent.com', 'and the consumer gets org1\'s client');
  const disk2 = JSON.parse(fs.readFileSync(path.join(dataDir, 'integrations.json'), 'utf-8'));
  ok(disk2.integrations.gmail.clusterKey === 'org1' && Object.keys(disk2.integrations.gmail.values).length === 0 && !('source' in disk2.integrations.gmail), 'a selector-only record: clusterKey and NO values, NO source');
  ok(store.publicView('gmail').source === 'cluster', "a selector-only record answers source 'cluster', NOT 'user' (the chip must not lie, and the export must carry a key not a credential)");
  drivePresetsHolder.list = [drivePresetsHolder.list[1]];   // org1 withdrawn
  const gm2 = await get('/api/integrations/gmail');
  ok(gm2.json.integration.source === 'none' && /org1/.test(gm2.json.integration.why), `the saved preset vanished ⇒ none naming org1 (${gm2.json.integration.why}) — never a silent swap to prefer`);
  const badKey = await api('PUT', '/api/integrations/gmail', { clusterKey: 'ghost' });
  ok(badKey.status === 400 && badKey.json.code === 'no-such-preset', 'choosing a preset the cluster does not provide is refused by name');
  await api('PUT', '/api/integrations/gmail', { clusterKey: null });
  drivePresetsHolder.list = [];
  const gmNone = await api('PUT', '/api/integrations/gmail', { use: 'cluster' });
  ok(gmNone.status === 409 && gmNone.json.code === 'no-cluster-default', 'gmail with NO presets: use:cluster refuses by name');
  const own = await api('PUT', '/api/integrations/gmail', { values: { clientId: 'me.apps.googleusercontent.com', clientSecret: 'my-google-secret-1' } });
  ok(own.json.integration.source === 'user' && own.json.integration.masked.clientSecret === '••••et-1', 'gmail with my own client ⇒ user, secret masked');
  drivePresetsHolder.list = [{ key: 'channels', label: 'Channels', clientId: 'ch.apps.googleusercontent.com', clientSecret: 'channels-secret-0000' }];
  ok(store.publicView('gmail').source === 'user', 'and a preset appearing later does not displace it');
  await api('DELETE', '/api/integrations/gmail');
  ok(store.publicView('gmail').source === 'cluster' && store.publicView('gmail').clusterKey === 'channels', 'DELETE lands on the only preset');

  // NEGATIVE CONTROL: a copy that COPIES the cluster values into the record
  const copyPath = patchCopy(STORE_PATH, '.integration-store.prefix-', [[
    "    r.values = {};\n    r.clusterKey = cluster.def.key;\n    r.updatedAt = now();\n    save();\n    return changed(id, 'use-cluster');",
    "    r.values = Object.fromEntries(Object.entries(cluster.def.values).map(([k, val]) => [k, encField(row, k, val)]));\n    r.clusterKey = cluster.def.key;\n    r.updatedAt = now();\n    save();\n    return changed(id, 'use-cluster');",
  ]]);
  const env2 = { VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'fake', values: { apiKey: 'rotated-away-key-000' } }]) };
  const d2 = path.join(ROOT, 'data-copy'); fs.mkdirSync(d2, { recursive: true });
  const badStore = require(copyPath).create({ dataDir: d2, env: env2, log: { log() {}, warn() {}, error() {} } });
  badStore.useClusterDefault('fake');
  delete env2.VIBESPACE_INTEGRATIONS;
  const stale = badStore.resolveIntegration('fake');
  ok(stale.source === 'user' && stale.values.apiKey === 'rotated-away-key-000', 'PRE-FIX CONTROL: a store that copies the cluster value keeps serving it after the env is rotated away (as "user"!) — the exact defect §14.3 forbids');
  ok(/"apiKey": "[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+"/.test(fs.readFileSync(path.join(d2, 'integrations.json'), 'utf-8')), 'PRE-FIX CONTROL: …and wrote the cluster credential to disk (encrypted, but a rotated-away credential all the same)');

  // Test: dispatch to the consumer's runner (registered by the channels engine below), refusal by name, single flight
  const notWired = await api('POST', '/api/integrations/cloak/test');
  ok(notWired.status === 501 && notWired.json.code === 'not-wired' && /agent-browser/.test(notWired.json.error), `cloak's Test is a NAMED not-wired refusal (lark and gmail are WIRED since P1 — their runners are registered by the channels engine) (${notWired.json.error})`);
  ok(store.publicView('cloak').testedAt === null, 'a refusal is not a verdict — nothing was recorded');
  const before = frames.length;
  ok(frames.length > 0 && frames.every((f) => f.type === 'integrations-updated' && f.integration && f.id), `every write broadcast integrations-updated with publicView (${frames.length} frames so far)`);
  ok(!frames.some((f) => JSON.stringify(f).includes(SECRET40) || JSON.stringify(f).includes('cluster-fake-key') || JSON.stringify(f).includes('org1-secret')), 'no broadcast frame ever carried a plaintext secret');
  ok(!allBodies.some((b) => b.includes(SECRET40)), `the 40-char secret is absent from all ${allBodies.length} GET bodies`);
  // the LOG is the third channel a secret could leave through (the boot line
  // about both env forms and the unparseable-env error both fired above)
  ok(logLines.length > 0, `the store logged something the capture can see (${logLines.length} lines — a capture that saw nothing proves nothing)`);
  ok(!logLines.some((l) => l.includes(SECRET40) || l.includes('json-form-key') || l.includes('cluster-fake-key') || l.includes('org1-secret')), 'no log line ever carried a plaintext secret');
  void before;

  // undecryptable stored value ⇒ SAID, never mis-read as "not configured"
  await api('PUT', '/api/integrations/cloak', { values: { licenseKey: 'cb_1234567890abcd' } });
  const keyFile = path.join(dataDir, '.integrations-key');
  const keyBytes = fs.readFileSync(keyFile);
  fs.writeFileSync(keyFile, 'f'.repeat(64));
  const store2 = storeMod.create({ dataDir, env, drivePresets: () => [], log: { log() {}, warn() {}, error() {} } });
  const v = store2.publicView('cloak');
  ok(v.source === 'none' && /could not be decrypted/.test(v.why), `a stored value the key cannot open is SAID (${v.why}) — the opposite sentence from "nothing configured"`);
  ok(v.hasOwnValues === true && v.storeError && v.storeError.code === 'values-undecryptable' && v.storeError.fields.join() === 'licenseKey', 'CONTROL (no cluster default): hasOwnValues stays TRUE and the view carries the typed values-undecryptable storeError (r3)');
  fs.writeFileSync(keyFile, keyBytes);
  const store3 = storeMod.create({ dataDir, env, drivePresets: () => [], log: { log() {}, warn() {}, error() {} } });
  ok(store3.resolveIntegration('cloak').values.licenseKey === 'cb_1234567890abcd', 'with the right key back, the value is readable again — nothing was destroyed');

  // (r3) THE ROTATED KEY WITH A CLUSTER DEFAULT PRESENT — the round-2
  // verifier's MEDIUM: a user secret the current key cannot open used to fall
  // through to the CLUSTER rung (source cluster, why null, hasOwnValues false,
  // Clear hidden, Test passing on the cluster credential, zero log lines).
  // Through the REAL route, with the REAL fake runner on the rotated instance.
  {
    const { integrationTest } = require(path.join(REPO, 'src/channels/fake.js'));
    const OWN = 'user-own-fake-key-ABCDEFGHIJKLMNOP';
    const CLUSTER = 'cluster-tenant-fake-key-000000IJKL';
    await api('PUT', '/api/integrations/fake', { values: { apiKey: OWN } });   // written under the ORIGINAL key
    fs.writeFileSync(keyFile, '0123456789abcdef'.repeat(4));                  // a restored-from-elsewhere / rotated key
    env.VIBESPACE_INTEGRATIONS = JSON.stringify([{ id: 'fake', key: 'tenantA', label: 'Tenant A', values: { apiKey: CLUSTER } }]);
    const lines = [];
    const cap = (lvl) => (...a) => lines.push(lvl + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
    const s2 = storeMod.create({ dataDir, env, now: () => clock, drivePresets: () => [], log: { log: cap('log'), warn: cap('warn'), error: cap('error') } });
    s2.registerTest('fake', integrationTest);
    routes.setup({ getStore: () => s2 });
    const g = await get('/api/integrations/fake');
    const rv = g.json.integration;
    ok(g.status === 200 && rv.source === 'none' && rv.clusterAvailable === true && rv.clusterKey === null && rv.fromEnv === false, `ROTATED KEY + CLUSTER DEFAULT: the row answers none, NOT cluster, while the env offers tenantA (source ${rv.source}, clusterAvailable ${rv.clusterAvailable})`);
    ok(/could not be decrypted \(apiKey\)/.test(rv.why) && /not the one they were written with/.test(rv.why), `the why names the field and the reason (${rv.why})`);
    ok(rv.hasOwnValues === true, 'hasOwnValues is a fact about the RECORD — "Clear my keys" is reachable for the orphaned ciphertext');
    ok(rv.storeError && rv.storeError.code === 'values-undecryptable' && /restore the \.integrations-key/.test(rv.storeError.message) && /clear the keys/.test(rv.storeError.message) && rv.storeError.fields.join() === 'apiKey', `the view carries a typed values-undecryptable storeError with the remedy (${rv.storeError && rv.storeError.message})`);
    ok(rv.set.apiKey === false && rv.masked.apiKey === null && !g.text.includes('IJKL') && !g.text.includes('MNOP'), "no value is SET on the wire — neither the cluster secret's tail nor the user's");
    const res = s2.resolveIntegration('fake');
    ok(res.source === 'none' && Object.keys(res.values).length === 0 && res.missing.join() === 'apiKey', 'the CONSUMER is told none with apiKey missing — it is never handed the cluster credential');
    const tr = await api('POST', '/api/integrations/fake/test');
    ok(tr.status === 200 && tr.json.ok === false && /no key resolved/.test(tr.json.error) && !(tr.json.detail && tr.json.detail.source === 'cluster'), `Test does NOT pass on the cluster credential (${tr.json.error})`);
    await get('/api/integrations/fake'); await get('/api/integrations');
    const said = lines.filter((l) => /could not be decrypted \(apiKey\)/.test(l));
    ok(said.length === 1 && /fake:/.test(said[0]) && /cluster default is NOT consulted/.test(said[0]), `logged ONCE per row per transition over five reads (${said.length} line(s) of ${lines.length})`);
    ok(s2.list().storeError === null && s2.list().integrations.find((x) => x.id === 'fake').storeError.code === 'values-undecryptable', 'list(): the store-level storeError stays null (the key FILE is fine) while the row carries its own');
    // the way out the card offers: Clear my keys ⇒ lands on the cluster default (the user decided, not the fall-through)
    const del = await api('DELETE', '/api/integrations/fake');
    ok(del.status === 200 && del.json.integration.source === 'cluster' && del.json.integration.clusterKey === 'tenantA' && del.json.integration.hasOwnValues === false && del.json.integration.storeError === null, 'DELETE ("Clear my keys") discards the orphaned ciphertext and lands on the cluster default');
    ok(!lines.some((l) => l.includes(OWN) || l.includes(CLUSTER)), 'no log line carried either plaintext');
    await api('PUT', '/api/integrations/fake', { values: { apiKey: 'rotated-era-key-QRSTUVWXYZ' } });
    ok(s2.publicView('fake').source === 'user' && lines.filter((l) => /could not be decrypted \(apiKey\)/.test(l)).length === 1, 'a value written under the CURRENT key is `user` again, and no new line was said');
    // the original key back ⇒ the rotated-era value is the orphan now: a NEW transition, said once
    fs.writeFileSync(keyFile, keyBytes);
    const lines3 = []; const cap3 = (lvl) => (...a) => lines3.push(lvl + ' ' + a.map(String).join(' '));
    const s3 = storeMod.create({ dataDir, env, now: () => clock, drivePresets: () => [], log: { log: cap3('log'), warn: cap3('warn'), error: cap3('error') } });
    const v3 = s3.publicView('fake');
    ok(v3.source === 'none' && v3.storeError && v3.storeError.code === 'values-undecryptable' && lines3.filter((l) => /could not be decrypted \(apiKey\)/.test(l)).length === 1, 'the original key restored ⇒ the rotated-era value is the orphan: none, typed, said once on the new instance');
    s3.clearUserValues('fake');                    // leave the record decryptable for the legs below
    delete env.VIBESPACE_INTEGRATIONS;
    routes.setup({ getStore: () => store });
  }
}

// ═══ §4b THE STORE FILE ITSELF (r2 — the round-1 verifier's findings, each reproduced first) ═══
console.log('§4b the store file itself');
const quietLog = { log() {}, warn() {}, error() {} };
const captured = () => { const lines = []; const cap = (lvl) => (...a) => lines.push(lvl + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); return { lines, log: { log: cap('log'), warn: cap('warn'), error: cap('error') } }; };
{
  // (i) AN UNREADABLE STORE IS A TYPED ERROR, NEVER AN EMPTY STATE. The former
  // bare catch read EACCES/EMFILE/EIO as "fresh", cached it, and the next
  // unrelated write replaced the file — every stored credential gone.
  const d = path.join(ROOT, 'unreadable'); fs.mkdirSync(d, { recursive: true });
  const life1 = storeMod.create({ dataDir: d, env: {}, log: quietLog });
  life1.setIntegration('lark', { appId: 'cli_abc123', appSecret: 'lark-secret-000000' });
  const f = path.join(d, 'integrations.json');
  fs.chmodSync(f, 0o000);
  let stillReadable = true; try { fs.readFileSync(f); } catch { stillReadable = false; }
  if (stillReadable) {
    console.log('  … SKIP the unreadable-store legs: chmod 000 does not block this uid (root?) — the EACCES fixture cannot be built here');
  } else {
    const cap = captured();
    const life2 = storeMod.create({ dataDir: d, env: {}, log: cap.log });
    const v = life2.publicView('lark');
    ok(v.storeError && v.storeError.code === 'store-unreadable' && /cannot be read/.test(v.storeError.message), `the unreadable file is a TYPED storeError on the view (${v.storeError && v.storeError.code})`);
    ok(v.source === 'none' && /cannot be read/.test(v.why), `and the row's why says the real reason, not "no user values" (${v.why})`);
    ok(life2.list().storeError && life2.list().storeError.code === 'store-unreadable', 'list() carries it too');
    ok(cap.lines.some((l) => /store-unreadable|cannot be read/.test(l)) && cap.lines.filter((l) => /cannot be read/.test(l)).length === 1, `it is LOGGED once per transition, not once per poll (${cap.lines.filter((l) => /cannot be read/.test(l)).length} line(s) over 3 reads)`);
    const refused = (fn) => { try { fn(); return null; } catch (e) { return e; } };
    const e1 = refused(() => life2.setIntegration('fake', { apiKey: 'fake-key-0123456789' }));
    ok(e1 && e1.code === 'store-unreadable' && e1.status === 500, 'setIntegration REFUSES with the typed error (500 store-unreadable)');
    ok(refused(() => life2.useClusterDefault('fake'))?.code === 'store-unreadable' && refused(() => life2.setClusterKey('gmail', null))?.code === 'store-unreadable' && refused(() => life2.clearUserValues('lark'))?.code === 'store-unreadable', 'useClusterDefault / setClusterKey / clearUserValues refuse too');
    life2.registerTest('fake', async () => ({ ok: true }));
    const eT = await life2.test('fake').then(() => null, (e) => e);
    ok(eT && eT.code === 'store-unreadable', 'test() refuses BEFORE running (its verdict is recorded, and the record cannot land)');
    // through the REAL route: the typed error reaches the wire with its status
    routes.setup({ getStore: () => life2 });
    const put = await api('PUT', '/api/integrations/fake', { values: { apiKey: 'fake-key-0123456789' } });
    ok(put.status === 500 && put.json && put.json.code === 'store-unreadable', `PUT answers 500 {code:'store-unreadable'} on the wire (${put.status} ${put.json && put.json.code})`);
    const g = await api('GET', '/api/integrations');
    ok(g.status === 200 && g.json.storeError && g.json.storeError.code === 'store-unreadable', 'GET still answers 200 with the storeError beside the rows (a card can say it)');
    routes.setup({ getStore: () => store });
    fs.chmodSync(f, 0o600);
    const back = life2.publicView('lark');
    ok(!back.storeError && back.source === 'user' && back.set.appSecret === true, 'the moment the file is readable again the SAME store instance recovers (nothing was cached over it) and lark is intact');
    life2.setIntegration('fake', { apiKey: 'fake-key-0123456789' });
    const disk = JSON.parse(fs.readFileSync(f, 'utf-8')).integrations;
    ok(Object.keys(disk).sort().join() === 'fake,lark' && !!disk.lark.values.appSecret, 'a write after recovery keeps every earlier credential on disk');
    // PRE-FIX CONTROL: a copy that reads "unreadable" as "fresh" (the shipped bare catch, one mechanism) destroys lark on the next write
    const preFix = patchCopy(STORE_PATH, '.integration-store.prefix-', [[
      "return unreadable('exists but cannot be read', e);",
      '{ loadError = null; state = fresh(); return state; }',
    ]]);
    const d2 = path.join(ROOT, 'unreadable-prefix'); fs.mkdirSync(d2, { recursive: true });
    const pre1 = require(preFix).create({ dataDir: d2, env: {}, log: quietLog });
    pre1.setIntegration('lark', { appId: 'cli_abc123', appSecret: 'lark-secret-000000' });
    const f2 = path.join(d2, 'integrations.json');
    fs.chmodSync(f2, 0o000);
    const pre2 = require(preFix).create({ dataDir: d2, env: {}, log: quietLog });
    const pv = pre2.publicView('lark');
    ok(pv.source === 'none' && !pv.storeError, 'PRE-FIX CONTROL: the bare-catch copy answers none with NO storeError');
    let preAccepted = true; try { pre2.setIntegration('fake', { apiKey: 'fake-key-0123456789' }); } catch { preAccepted = false; }
    fs.chmodSync(f2, 0o600);
    const preDisk = JSON.parse(fs.readFileSync(f2, 'utf-8')).integrations;
    ok(preAccepted && Object.keys(preDisk).join() === 'fake' && !preDisk.lark, 'PRE-FIX CONTROL: …accepts the next write and the file now holds ONLY fake — lark\'s secret is destroyed (the defect, kept as the control)');
  }

  // (ii) A FILE THAT IS NOT A STORE IS ARCHIVED, NEVER OVERWRITTEN (archive-never-destroy)
  for (const [label, bytes] of [['not JSON', '{not json'], ['wrong shape', '[]'], ['wrong shape (integrations is an array)', '{"integrations":[1]}']]) {
    const d3 = path.join(ROOT, 'corrupt-' + label.replace(/\W+/g, '-')); fs.mkdirSync(d3, { recursive: true });
    fs.writeFileSync(path.join(d3, 'integrations.json'), bytes);
    const cap = captured();
    const s = storeMod.create({ dataDir: d3, env: {}, log: cap.log });
    const v = s.publicView('fake');
    const archived = fs.readdirSync(d3).filter((n) => /^integrations\.json\.corrupt-/.test(n));
    ok(v.source === 'none' && !v.storeError && archived.length === 1 && fs.readFileSync(path.join(d3, archived[0]), 'utf-8') === bytes, `${label}: the bytes are ARCHIVED beside the file (${archived[0]}) and the store starts fresh with no storeError`);
    ok(cap.lines.some((l) => /not a valid store/.test(l) && l.includes(archived[0])), `${label}: …and the archive is logged by name`);
    s.setIntegration('fake', { apiKey: 'fake-key-0123456789' });
    ok(fs.existsSync(path.join(d3, 'integrations.json')) && fs.existsSync(path.join(d3, archived[0])), `${label}: the next write lands in a fresh file and the archive is untouched`);
  }

  // (iii) THE LOG ABOUT A MISTYPED ENV CARRIES NO BYTES OF IT. V8's SyntaxError
  // message quotes the source around the error position, and `e.message` was
  // logged verbatim: a trailing comma printed the secret's last 6 characters.
  const { describeJsonError } = require(path.join(REPO, 'src/secret-box.js'));
  const bad = `[{"id":"fake","values":{"apiKey":"${SECRET40}"}},]`;
  let v8err = null; try { JSON.parse(bad); } catch (e) { v8err = e; }
  ok(v8err instanceof SyntaxError && v8err.message.includes(SECRET40.slice(-6)), `CONTROL: V8's own message carries the secret's tail — the retired \`e.message\` line leaked it (…${v8err && v8err.message.slice(-40)})`);
  const desc = describeJsonError(v8err);
  ok(/not valid JSON \(SyntaxError/.test(desc) && !desc.includes(SECRET40.slice(-6)) && !desc.includes(SECRET40.slice(0, 6)) && !/"/.test(desc), `describeJsonError keeps the class (+ position when V8 states one) and no quoted fragment (${desc})`);
  // the same rule over a matrix of malformed shapes, each with the secret mid-string
  for (const shape of [`[{"id":"fake","values":{"apiKey":"${SECRET40}"}},]`, `[{"id":"fake","values":{"apiKey":"${SECRET40}"}}`, `[{"id":"fake","values":{"apiKey":"${SECRET40}"`, `{"apiKey":"${SECRET40}"} trailing`, `[{"id":"fake","values":{"apiKey":"${SECRET40.slice(0, 20)}"${SECRET40.slice(20)}"}}]`]) {
    let e = null; try { JSON.parse(shape); } catch (x) { e = x; }
    const dsc = describeJsonError(e);
    if (!/not valid JSON/.test(dsc) || [4, 5, 6].some((n) => { for (let i = 0; i + n <= SECRET40.length; i++) if (dsc.includes(SECRET40.slice(i, i + n))) return true; return false; })) ok(false, `describeJsonError leaked a ≥4-char run of the secret for shape ${JSON.stringify(shape.slice(0, 30))}…: ${dsc}`);
  }
  ok(true, 'describeJsonError leaks no 4+-char run of the secret over five malformed shapes (unterminated string / trailing comma / truncated / trailing garbage / quote mid-secret)');
  const cap4 = captured();
  const d4 = path.join(ROOT, 'badenv'); fs.mkdirSync(d4, { recursive: true });
  const s4 = storeMod.create({ dataDir: d4, env: { VIBESPACE_INTEGRATIONS: bad }, log: cap4.log });
  ok(s4.resolveIntegration('fake').source === 'none', 'the store still answers none on a mistyped block');
  const unp = cap4.lines.filter((l) => /unparseable/.test(l));
  ok(unp.length === 1 && !unp[0].includes(SECRET40.slice(-6)) && !unp[0].includes(SECRET40.slice(0, 6)), `the store's unparseable line carries no tail of the secret (${unp[0]})`);
  // the twin reader: MountManager.drivePresets on VIBESPACE_GDRIVE_CLIENTS (the line §14.8 told P0b to copy)
  {
    const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
    const prevEnv = process.env.VIBESPACE_GDRIVE_CLIENTS; const prevErr = console.error; const lines = [];
    console.error = (...a) => lines.push(a.map(String).join(' '));
    try {
      process.env.VIBESPACE_GDRIVE_CLIENTS = `[{"key":"x","clientId":"c","clientSecret":"${SECRET40}"},]`;
      const presets = MountManager.drivePresets();
      ok(Array.isArray(presets) && lines.length === 1 && /unparseable/.test(lines[0]) && !lines[0].includes(SECRET40.slice(-6)) && !lines[0].includes(SECRET40.slice(0, 6)), `mounts.drivePresets logs the same redacted form (${lines[0]})`);
    } finally { console.error = prevErr; if (prevEnv === undefined) delete process.env.VIBESPACE_GDRIVE_CLIENTS; else process.env.VIBESPACE_GDRIVE_CLIENTS = prevEnv; }
  }

  // (iv) A NON-DELEGATING ROW'S RADIO IS A BOOLEAN INTENT: a saved 'default'
  // survives the admin naming that single default; a PICKER's vanished key
  // (two presets, or the delegating dropdown) still refuses by name.
  {
    const d5 = path.join(ROOT, 'rebind'); fs.mkdirSync(d5, { recursive: true });
    const env5 = { VIBESPACE_INTEGRATIONS: JSON.stringify([{ id: 'fake', values: { apiKey: 'cluster-key-000000000' } }]) };
    const s5 = storeMod.create({ dataDir: d5, env: env5, log: quietLog });
    s5.useClusterDefault('fake');
    ok(s5.publicView('fake').source === 'cluster' && s5.publicView('fake').savedClusterKey === 'default', 'the radio stores the implicit selector `default`');
    env5.VIBESPACE_INTEGRATIONS = JSON.stringify([{ id: 'fake', key: 'tenantA', label: 'Tenant A', values: { apiKey: 'cluster-key-000000000' } }]);
    const v5 = s5.publicView('fake');
    ok(v5.source === 'cluster' && v5.clusterKey === 'tenantA' && v5.savedClusterKey === 'default' && v5.clusterAvailable === true && /re-keyed to tenantA/.test(v5.why), `the admin re-keys the ONLY default ⇒ the row still resolves cluster, on tenantA, and SAYS the re-bind (${v5.why})`);
    ok(s5.resolveIntegration('fake').values.apiKey === 'cluster-key-000000000', 'and the consumer gets the value');
    s5.useClusterDefault('fake');
    ok(s5.publicView('fake').savedClusterKey === 'tenantA' && !s5.publicView('fake').why, 'clicking the radio again re-saves the live key and the why clears');
    env5.VIBESPACE_INTEGRATIONS = JSON.stringify([{ id: 'fake', key: 'tenantA', values: { apiKey: 'a-000000000' } }, { id: 'fake', key: 'tenantB', values: { apiKey: 'b-000000000' } }]);
    s5.setClusterKey('fake', 'tenantB');
    env5.VIBESPACE_INTEGRATIONS = JSON.stringify([{ id: 'fake', key: 'tenantA', values: { apiKey: 'a-000000000' } }, { id: 'fake', key: 'tenantC', values: { apiKey: 'c-000000000' } }]);
    const v5b = s5.publicView('fake');
    ok(v5b.source === 'none' && /tenantB/.test(v5b.why) && v5b.clusterOptions.length === 2, `CONTROL: with TWO presets offered a vanished saved key is a picker's question — none naming tenantB (${v5b.why})`);
    // PURE: the rule and its boundary
    const one = [{ key: 'tenantA', label: 'A', values: {} }], two = [...one, { key: 'tenantB', label: 'B', values: {} }];
    ok(R.pickPreset(one, { savedKey: 'default' }).preset === null, 'PURE CONTROL: without the flag a vanished saved key on one preset answers null (the delegating dropdown\'s rule, unchanged)');
    const rb = R.pickPreset(one, { savedKey: 'default', rebindSingle: true });
    ok(rb.preset && rb.preset.key === 'tenantA' && rb.rebound && rb.rebound.from === 'default' && rb.rebound.to === 'tenantA', 'PURE: with the flag the single preset is re-bound and the re-bind is reported');
    ok(R.pickPreset(two, { savedKey: 'default', rebindSingle: true }).preset === null, 'PURE: the flag never re-binds among two');
    ok(R.pickPreset(one, { savedKey: 'tenantA', rebindSingle: true }).rebound === undefined, 'PURE: a saved key that still exists reports no re-bind');
    // the delegating row keeps its refusal (§4's gm2 leg is the functional twin of this control)
    const wiringSrc = fs.readFileSync(STORE_PATH, 'utf-8');
    ok((wiringSrc.match(/rebindSingle: true/g) || []).length === 1 && /json\.length[\s\S]{0,900}rebindSingle: true/.test(wiringSrc) && !/row\.delegate[\s\S]{0,400}rebindSingle/.test(wiringSrc.slice(wiringSrc.indexOf('if (row.delegate) {'), wiringSrc.indexOf('const json = envJsonEntries()'))), 'WIRING: the flag is passed at the env-preset site ONLY — the delegating branch never passes it');
  }
}

// ═══ §5 THE ADAPTERS ROW FLIPS (real engine + real store) ═════════════════
console.log('§5 the Adapters row flips');
{
  const engMod = require(ENGINE_PATH);
  const mk = (mod, dir, integrations) => mod.create({ dataDir: dir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, integrations });
  const d = path.join(ROOT, 'eng'); fs.mkdirSync(d, { recursive: true });
  const eng = mk(engMod, d, store);
  ok(store.hasTestRunner('fake'), 'constructing the engine with the store registered the fake row\'s Test runner (the consumer owns it)');
  await api('PUT', '/api/integrations/fake', { values: { apiKey: 'good-key-12345678' } });
  await eng.pass('fake-poll', { force: true });
  const a1 = eng.digest().adapters.find((a) => a.id === 'fake-poll');
  ok(a1 && a1.auth.state === 'unknown' && a1.auth.why === 'never-authenticated', `with a key resolved the digest says what the RECORD proves — unknown/never-authenticated (the fake talks to nothing; its own 'connected' is a stub the r2 rule refuses) — and NOT needs-credentials (${JSON.stringify(a1 && a1.auth)})`);
  const t1 = await api('POST', '/api/integrations/fake/test');
  ok(t1.status === 200 && t1.json.ok === true && t1.json.caveat && t1.json.kind === 'shape-only', 'Test dispatched to the runner: ok, WITH the caveat and the kind');
  ok(store.publicView('fake').lastOk === true && store.publicView('fake').testedAt === clock, 'the verdict + its instant are recorded');
  await api('PUT', '/api/integrations/fake', { values: { apiKey: 'this-will-fail-key' } });
  const t2 = await api('POST', '/api/integrations/fake/test');
  ok(t2.json.ok === false && /fail/.test(t2.json.error) && t2.json.caveat, `the fixture switch: a key containing "fail" fails, with the words and the caveat (${t2.json.error})`);
  const [c1, c2] = await Promise.all([store.test('fake'), store.test('fake')]);
  ok(c1 === c2 || (c1.testedAt === c2.testedAt), 'two concurrent Tests share ONE flight');
  // withdraw the credential ⇒ the ADAPTERS ROW flips, without a pass
  await api('DELETE', '/api/integrations/fake');
  await sleep(20);
  const a2 = eng.digest().adapters.find((a) => a.id === 'fake-poll');
  ok(a2.auth.state === 'needs-credentials' && a2.auth.missing.join() === 'apiKey' && /no longer provided|no default|no user/.test(a2.auth.why), `THE ADAPTERS ROW FLIPS on the store's change edge: needs-credentials, naming apiKey and the reason (${JSON.stringify(a2.auth)})`);
  await api('PUT', '/api/integrations/fake', { values: { apiKey: 'back-again-12345678' } });
  await sleep(20);
  ok(eng.digest().adapters.find((a) => a.id === 'fake-poll').auth.state === 'unknown', "and flips back (to the record's honest unknown) when a key is saved");
  // CONTROL: a card-only copy — an engine whose adapters get no resolver — never flips
  const cardOnly = patchCopy(ENGINE_PATH, '.channels-engine.prefix-', [[
    'registry.create(rec.kind, rec, { now, resolveIntegration, ...adapterDeps })', 'registry.create(rec.kind, rec, { now, ...adapterDeps })',
  ]]);
  const d2 = path.join(ROOT, 'eng2'); fs.mkdirSync(d2, { recursive: true });
  const eng2 = mk(require(cardOnly), d2, store);
  await eng2.pass('fake-poll', { force: true });
  await api('DELETE', '/api/integrations/fake');
  await sleep(20);
  const c = eng2.digest().adapters.find((a) => a.id === 'fake-poll');
  ok(c.auth.state !== 'needs-credentials', `CONTROL: a copy that hands adapters no resolver flips only the card — the Adapters row still says ${c.auth.state}`);
  eng.stop(); eng2.stop();
  // the contract suite's shape: an adapter created BARE still answers connected
  const { fakePoll } = require(path.join(REPO, 'src/channels/fake.js'));
  const bare = fakePoll.create({ id: 'x' }, {});
  ok((await bare.auth.state()).state === 'connected', 'with no resolver handed in, the fake answers as before (the contract suite creates adapters bare)');
}

// ═══ §6 THE CENSUSES ══════════════════════════════════════════════════════
console.log('§6 the censuses');
const BIN_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.zst', '.gz', '.zip', '.pdf', '.svg']);
let tracked = [];
try {
  // cached AND untracked-but-not-ignored: the gate runs BEFORE a commit, so a
  // new file is exactly the one this census must see.
  tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: REPO, env: gitEnvFrom(process.env), encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0').filter(Boolean).filter((f) => !BIN_EXT.has(path.extname(f).toLowerCase()) && fs.existsSync(path.join(REPO, f)));
} catch (e) { console.log(`  … SKIP the git-derived censuses (git ls-files failed: ${e.message})`); }
const readRepo = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');

// (a) ENV NAMES: the regex matches the NAME, whatever the spelling around it
const ENV_RE = /VIBESPACE_INTEGRATIONS?\b|VIBESPACE_INTEGRATION_/;
const ENV_ALLOW = new Map([
  ['src/server/integration-store.js', 'THE resolver (both forms)'],
  ['src/integration-registry.js', 'DECLARES the names a row is served under (never reads them)'],
  ['scripts/test-integration-registry.mjs', 'this census + the store legs'],
  ['scripts/test-integrations-ui.mjs', 'the heavy leg injects the env into a worktree server'],
  ['scripts/dbg-comm-surfaces.mjs', 'the comm-panel screenshot driver injects the cluster copy path into its worktree server (a1 of the polish; the i18n census drives it)'],
  ['scripts/test-agentd-session.mjs', 'the second-holder leg boots a real daemon under the name and asserts neither the daemon nor any child sees it'],
  ['deploy/helm/vibespace-user/values.yaml', 'the admin-facing values block'],
  ['deploy/helm/vibespace-user/templates/main.yaml', 'renders the Secret into the env'],
  ['deploy/README.md', 'documents the two forms'],
]);
const isDoc = (f) => /^docs\/.*\.md$/.test(f) || f === 'CLAUDE.md' || f === 'CHANGELOG.md' || f === 'README.md';
function envNameCensus(files, read) {
  const hits = [];
  for (const f of files) {
    if (isDoc(f)) continue;
    let s; try { s = read(f); } catch { continue; }
    if (ENV_RE.test(s)) hits.push(f);
  }
  return { walked: files.length, hits, offenders: hits.filter((f) => !ENV_ALLOW.has(f)) };
}
if (tracked.length) {
  const c = envNameCensus(tracked, readRepo);
  console.log(`  … env-name census walked ${c.walked} tracked files (docs excluded); hits: ${c.hits.join(', ')}`);
  ok(c.hits.includes('src/server/integration-store.js'), 'the census SEES the resolver (a census that sees nothing is not a census)');
  ok(!c.offenders.length, `no file outside the allowlist names VIBESPACE_INTEGRATIONS / VIBESPACE_INTEGRATION_* (offenders: ${c.offenders.join(', ') || 'none'})`);
  for (const [f] of ENV_ALLOW) if (!c.hits.includes(f) && fs.existsSync(path.join(REPO, f))) ok(false, `ALLOWLIST DEAD ENTRY: ${f} no longer names the env — remove the row`);
  // two spellings that a "process.env.X" regex would miss — each must be RED
  const tmpDir = path.join(ROOT, 'census'); fs.mkdirSync(tmpDir, { recursive: true });
  const bracket = path.join(tmpDir, 'bracket.js'); fs.writeFileSync(bracket, "const v = process.env['VIBESPACE_INTEGRATIONS'];\n");
  const destr = path.join(tmpDir, 'destr.js'); fs.writeFileSync(destr, 'const { VIBESPACE_INTEGRATIONS } = process.env;\n');
  const aliased = path.join(tmpDir, 'alias.js'); fs.writeFileSync(aliased, 'const env = process.env; const s = env.VIBESPACE_INTEGRATION_LARK_APPSECRET;\n');
  const ctl = envNameCensus([...tracked, bracket, destr, aliased], (f) => (f.startsWith('/') ? fs.readFileSync(f, 'utf-8') : readRepo(f)));
  ok(ctl.offenders.length === 3 && ctl.offenders.includes(bracket) && ctl.offenders.includes(destr) && ctl.offenders.includes(aliased), 'CONTROL: the bracket form, the destructuring form and the aliased-env form are each RED');
}

// (a′) THE NAME MAY NOT BE BUILT OUTSIDE THE RESOLVER EITHER (r3, the round-2
// verifier's LOW): `process.env[R.envFieldName('lark','appSecret')]` spells no
// env name, so census (a) walked it green — a builder exported from the PURE
// registry was a second resolver. The builder now lives in the store; the
// registry DECLARES a row's prefix and nothing derives a name from it: an
// `envFieldName(` / `envNamesOf(` call or a `.clusterEnv.prefix|json` read
// outside the store and this suite is RED.
const BUILDER_RE = /\benvFieldName\s*\(|\benvNamesOf\s*\(|\bclusterEnv\s*\.\s*(?:prefix|json)\b/;
const BUILDER_ALLOW = new Set(['src/server/integration-store.js', 'scripts/test-integration-registry.mjs']);
function builderCensus(files, read) {
  const hits = [];
  for (const f of files) {
    if (isDoc(f)) continue;
    let s; try { s = read(f); } catch { continue; }
    if (BUILDER_RE.test(s.replace(/^\s*(\*|\/\/).*$/gm, ''))) hits.push(f);
  }
  return { hits, offenders: hits.filter((f) => !BUILDER_ALLOW.has(f)) };
}
if (tracked.length) {
  const c = builderCensus(tracked, readRepo);
  console.log(`  … env-name BUILDER census hits: ${c.hits.join(', ')}`);
  ok(c.hits.includes('src/server/integration-store.js'), "the builder census SEES the store's own envFieldName( / clusterEnv.prefix reads");
  ok(!c.offenders.length, `nothing outside the store builds an env name or reads a row's declared prefix (offenders: ${c.offenders.join(', ') || 'none'})`);
  ok(!('envFieldName' in R) && !('envNamesOf' in R), 'the PURE registry exports NO builder (envFieldName / envNamesOf are gone)');
  const dir = path.join(ROOT, 'census'); fs.mkdirSync(dir, { recursive: true });
  const readAny = (f) => (f.startsWith('/') ? fs.readFileSync(f, 'utf-8') : readRepo(f));
  const built = path.join(dir, 'built.js'); fs.writeFileSync(built, "const S = require('../server/integration-store.js');\nconst s = process.env[S.envFieldName('lark', 'appSecret')];\n");
  const prefixed = path.join(dir, 'prefixed.js'); fs.writeFileSync(prefixed, "const row = R.rowById('lark');\nconst s = env[row.clusterEnv.prefix + 'APPSECRET'];\n");
  const commented = path.join(dir, 'commented.js'); fs.writeFileSync(commented, "// the store's envFieldName( builds the name; see clusterEnv.prefix\nconst x = 1;\n");
  const bc = builderCensus([...tracked, built, prefixed, commented], readAny);
  ok(bc.offenders.includes(built) && bc.offenders.includes(prefixed) && !bc.offenders.includes(commented) && bc.offenders.length === 2, "CONTROLS: the built-name probe (the verifier's exact shape) and a prefix concatenation are RED; a comment naming the builder is not");
  ok(envNameCensus([...tracked, built], readAny).offenders.length === 0, 'CONTROL: census (a) alone still walks the built-name probe GREEN — which is why this census exists');
}

// (b) NO scheduler / timer / ingest loop calls `.test(` on the store — THE
// RECEIVER IS DERIVED, NEVER TYPED (r2, the round-1 verifier): the first
// census matched four typed callee spellings, so a scheduler reaching the
// store through the route's OWN accessor idiom (`function store() { return
// ctx.getStore(); } … store().test('lark')`) was invisible — measured: an
// untracked probe file with exactly that shape, `ALL PASS (128)`. The
// derived-census law (test-architecture §45 r3, test-writer-sweep §17 r7).
// A site is flagged when its RECEIVER is the store — a traced HANDLE (an
// identifier bound from the wiring's `.store`, `integrationStore.create(`, a
// `getStore()`/`store()` call, `deps|ctx|opts.integrations`, or one of the
// names the product hands the store around by) or a store ACCESSOR call
// (`store()`, `getStore()`, `….integrations()`) — or when its FIRST ARGUMENT
// is a registry row-id LITERAL on any non-RegExp receiver. Identifiers bound
// to a RegExp literal / `new RegExp(` in the same file are never receivers
// (`ID_RE.test(req.params.id)` is a validator, not a probe); a bare `X.test(id)`
// on an untraced receiver (`hosts.test(req.params.id)`) is not flagged either —
// `id` alone says nothing about the store.
const TEST_ALLOW = new Set(['src/routes/integrations.js', 'scripts/test-integration-registry.mjs', 'scripts/test-integrations-ui.mjs']);
const STORE_HANDLE_NAMES = new Set(['integrations', 'integrationStore', 'integStore', 'integrationsStore']);
const HANDLE_RHS_RE = /integrationsWiring\.store\b|integrationStore\.create\(|integration-store(?:\.js)?['"]\)\.create\(|\.getStore\(\)|\bstore\(\)|\b(?:deps|ctx|opts)\.integrations\b/;
const STORE_ACCESSOR_RE = /(?:^|\.)(?:store|getStore|integrations|integrationStore)\(\)$/;
const ROW_ID_LITERALS = new Set(R.rowIds());
function testCallSites(src) {
  const s = src.replace(/^\s*(\*|\/\/).*$/gm, '');
  const handles = new Set(STORE_HANDLE_NAMES);
  for (const m of s.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g)) if (HANDLE_RHS_RE.test(m[2])) handles.add(m[1]);
  for (const m of s.matchAll(/(?:const|let|var)\s+\{([^}]*)\}\s*=\s*([^;\n]+)/g)) {
    if (!/\b(?:deps|ctx|opts)\b|integrationsWiring/.test(m[2])) continue;
    for (const part of m[1].split(',')) { const n = part.trim().split(/\s*:\s*/).pop(); if (n && STORE_HANDLE_NAMES.has(n)) handles.add(n); }
  }
  const regexBound = new Set();
  for (const m of s.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\/(?![*/])|new RegExp\()/g)) regexBound.add(m[1]);
  const sites = [];
  for (const m of s.matchAll(/([A-Za-z_$][\w$]*(?:\(\))?(?:\s*\.\s*[A-Za-z_$][\w$]*(?:\(\))?)*)\s*\.test\(\s*([^)]*)\)/g)) {
    const recv = m[1].replace(/\s+/g, ''); const first = String(m[2]).split(',')[0].trim();
    const head = recv.split('.')[0].replace(/\(\)$/, '');
    if (regexBound.has(head)) continue;
    const lit = /^['"`]([^'"`]+)['"`]$/.exec(first);
    const rowLiteral = !!(lit && ROW_ID_LITERALS.has(lit[1]));
    const storeReceiver = handles.has(head) || STORE_ACCESSOR_RE.test(recv);
    if (storeReceiver || rowLiteral) sites.push({ recv, arg: first, via: storeReceiver ? (handles.has(head) ? 'handle' : 'accessor') : 'row-literal' });
  }
  return sites;
}
function timerTestCensus(files, read) {
  const offenders = [], seen = [];
  for (const f of files) {
    if (isDoc(f)) continue;
    let s; try { s = read(f); } catch { continue; }
    const sites = testCallSites(s);
    if (!sites.length) continue;
    seen.push({ f, sites });
    if (!TEST_ALLOW.has(f)) offenders.push(`${f} (${sites.map((x) => `${x.recv}.test(${x.arg}) via ${x.via}`).join('; ')})`);
  }
  return { offenders, seen };
}
if (tracked.length) {
  const c = timerTestCensus(tracked, readRepo);
  console.log(`  … .test( receiver census: ${c.seen.map((x) => `${x.f} → ${x.sites.map((s) => `${s.recv}.test(${s.arg})[${s.via}]`).join(', ')}`).join(' | ') || 'no store call sites'}`);
  ok(!c.offenders.length, `nothing outside the route calls the store's test( (offenders: ${c.offenders.join(', ') || 'none'}) — a Test is a human's click, never a timer's (§14.11.2)`);
  const route = c.seen.find((x) => x.f === 'src/routes/integrations.js');
  ok(route && route.sites.some((s) => s.recv === 'store()' && s.via === 'accessor'), 'POSITIVE CONTROL: the census SEES the route\'s own `store().test(req.params.id)` without rewriting it');
  const dir = path.join(ROOT, 'census'); fs.mkdirSync(dir, { recursive: true });
  const readAny = (f) => (f.startsWith('/') ? fs.readFileSync(f, 'utf-8') : readRepo(f));
  const timerFile = path.join(dir, 'timer.js');
  fs.writeFileSync(timerFile, "setInterval(() => { integrations.test('lark').catch(() => {}); }, 60000);\n");
  const accessorFile = path.join(dir, 'verify-timer-probe.js');   // the verifier's exact shape
  fs.writeFileSync(accessorFile, "let ctx = null;\nfunction store() { return ctx.getStore(); }\nsetInterval(() => { store().test('lark').catch(() => {}); }, 60000);\nmodule.exports = { setup: (d) => { ctx = d; } };\n");
  const handleFile = path.join(dir, 'handle-timer.js');           // a traced handle, an id-shaped argument
  fs.writeFileSync(handleFile, "const s = integrationsWiring.store;\nsetInterval(() => { for (const rowId of ids) s.test(rowId); }, 60000);\n");
  const destrFile = path.join(dir, 'destr-timer.js');             // the engine's own destructuring shape
  fs.writeFileSync(destrFile, "function create({ dataDir, integrations }) { setTimeout(() => integrations.test(id), 1000); }\n");
  const innocent = path.join(dir, 'innocent.js');                 // validators + a different `test` — must NOT flag
  fs.writeFileSync(innocent, "const ID_RE = /^[a-z][a-z0-9-]*$/;\nif (!ID_RE.test(req.params.id)) throw new Error('bad');\nif (!/^inc-[a-z0-9-]+$/.test(id)) throw new Error('bad');\nconst r = await hosts.test(req.params.id);\nconst re = new RegExp('^x'); re.test(row.id);\n");
  const ctl = timerTestCensus([...tracked, timerFile, accessorFile, handleFile, destrFile, innocent], readAny);
  const red = (f) => ctl.offenders.some((o) => o.startsWith(f));
  ok(red(timerFile) && red(accessorFile) && red(handleFile) && red(destrFile), 'CONTROLS: the typed-handle timer, the verifier\'s accessor-idiom timer, a traced-handle timer with an id-shaped argument and the destructured-dep shape are each RED');
  ok(!red(innocent) && !ctl.seen.some((x) => x.f === innocent), 'CONTROL: RegExp validators (`ID_RE.test(id)`, a literal, `new RegExp`) and `hosts.test(req.params.id)` are NOT flagged');
  ok(ctl.offenders.length === 4, `exactly the four synthetic producers are red (${ctl.offenders.length})`);
}

// (h) THE DAEMON IS A SECOND HOLDER (r2, the round-1 verifier's HIGH): the env
// NAMES census above answers who READS the cluster env; a process that merely
// HOLDS it is a holder too, and the daemon is one — born from the server env,
// surviving its restarts, merging every child over its own environ. So every
// daemon birth site and the child base go through the ONE sanitizer
// (src/agent-env.js) and no raw `process.env` env literal survives in the
// daemon tier. scripts/test-agentd-session.mjs proves the CONSEQUENCE on a real
// daemon (three layers, a pre-fix bundle as the control); this is the census.
{
  const RAW_ENV_LITERAL_RE = /env:\s*(?:process\.env\b|\{\s*\.\.\.process\.env\b)/;
  const holders = ['src/agentd/client.js', 'src/agentd/agentd.js'];
  const offenders = [];
  for (const f of holders) {
    const s = readRepo(f).replace(/^\s*(\*|\/\/).*$/gm, '');
    for (const [i, line] of s.split('\n').entries()) if (RAW_ENV_LITERAL_RE.test(line)) offenders.push(`${f}:${i + 1}`);
  }
  ok(!offenders.length, `no daemon spawn hands a raw process.env to a child or to a daemon being born (offenders: ${offenders.join(', ') || 'none'})`);
  ok(RAW_ENV_LITERAL_RE.test('spawn(process.execPath, [f], { detached: true, stdio: "ignore", env: process.env })') && RAW_ENV_LITERAL_RE.test('env: { ...process.env, ...(extra || {}) }') && !RAW_ENV_LITERAL_RE.test('env: { ...daemonEnv(process.env), X: 1 }'), 'CONTROL: the two retired spellings are RED, the sanitized one is not');
  const { agentEnv, daemonEnv, DAEMON_ENV_KEEP, AGENT_ENV_KEEP } = require(path.join(REPO, 'src/agent-env.js'));
  const base = { VIBESPACE_INTEGRATIONS: '[…]', VIBESPACE_INTEGRATION_LARK_APPSECRET: 's', VIBESPACE_GDRIVE_CLIENTS: '[…]', VIBESPACE_PASSWORD: 'p', VIBESPACE_NODE_MODULES: '/nm', VIBESPACE_AGENTD_ROOT: '/r', VIBESPACE_API: 'http://x', HOME: '/h', PATH: '/bin', CLAUDE_CODE_OAUTH_TOKEN: 't', npm_config_x: '1', NODE_ENV: 'production' };
  const a = agentEnv(base), d = daemonEnv(base);
  ok(!('VIBESPACE_INTEGRATIONS' in a) && !('VIBESPACE_INTEGRATION_LARK_APPSECRET' in a) && !('VIBESPACE_GDRIVE_CLIENTS' in a) && !('VIBESPACE_PASSWORD' in a) && !('CLAUDE_CODE_OAUTH_TOKEN' in a) && !('npm_config_x' in a) && !('NODE_ENV' in a) && a.HOME === '/h' && a.VIBESPACE_API === 'http://x' && a.VIBESPACE_AGENTD_ROOT === '/r' && !('VIBESPACE_NODE_MODULES' in a), 'agentEnv drops both cluster env forms, the drive presets, the password, the ambient oauth token, npm_* and NODE_ENV — keeps HOME/PATH and the agent keep set');
  ok(!('VIBESPACE_INTEGRATIONS' in d) && !('VIBESPACE_GDRIVE_CLIENTS' in d) && d.VIBESPACE_NODE_MODULES === '/nm' && d.VIBESPACE_AGENTD_ROOT === '/r', 'daemonEnv is the same rule plus the daemon tier\'s own names');
  ok([...AGENT_ENV_KEEP].every((n) => DAEMON_ENV_KEEP.has(n)) && [...DAEMON_ENV_KEEP].filter((n) => !AGENT_ENV_KEEP.has(n)).sort().join() === 'VIBESPACE_AGENTD_VERSION,VIBESPACE_NODE_MODULES', 'DAEMON_ENV_KEEP ⊇ AGENT_ENV_KEEP + exactly {VIBESPACE_AGENTD_VERSION, VIBESPACE_NODE_MODULES} (derived from the daemon tier\'s reads in test-agentd-session)');
  ok(/agentEnvPure\(base\)/.test(readRepo('src/ws-handler.js')) && !/function agentEnv\(base = process\.env\) \{\s*const out = \{\}/.test(readRepo('src/ws-handler.js')), 'WIRING: ws-handler\'s agentEnv is the PURE rule re-exported, not a second copy');
}

// (c) CONSUMERS: every named consumer exists AND calls resolveIntegration('<id>')
function consumerCensus(rows, read) {
  const problems = [];
  for (const row of rows) {
    for (const f of row.consumers) {
      let s; try { s = read(f); } catch { problems.push(`${row.id}: consumer ${f} does not exist`); continue; }
      if (!s.includes(`resolveIntegration('${row.id}')`) && !s.includes(`resolveIntegration("${row.id}")`)) problems.push(`${row.id}: consumer ${f} never calls resolveIntegration('${row.id}')`);
    }
    if (!row.consumers.length && !row.wiredIn) problems.push(`${row.id}: no consumer and no wiredIn phase`);
  }
  return problems;
}
{
  const p = consumerCensus(R.ROWS, readRepo);
  ok(!p.length, `every consumer file exists and REALLY calls resolveIntegration('<id>') (${p.join('; ') || 'clean'})`);
  const ctl = consumerCensus([{ id: 'fake', consumers: ['src/channels/index.js'], wiredIn: null }], readRepo);
  ok(ctl.length === 1 && /never calls/.test(ctl[0]), 'CONTROL: a consumer that EXISTS but never calls resolveIntegration is RED ("file exists" is the degenerate form of this census)');
}

// (d) THE CALLBACK URL HAS ONE DEFINITION
if (tracked.length) {
  const LIT = 'http://127.0.0.1:17865/lark/cb';
  const holders = tracked.filter((f) => !isDoc(f)).filter((f) => { try { return readRepo(f).includes(LIT); } catch { return false; } });
  const allowed = new Set(['src/integration-registry.js', 'scripts/test-integration-registry.mjs', 'scripts/test-integrations-ui.mjs']);
  ok(holders.includes('src/integration-registry.js') && holders.every((f) => allowed.has(f)), `the Lark callback literal is defined in src/integration-registry.js and nowhere else in code (holders: ${holders.join(', ')})`);
  if (fs.existsSync(path.join(REPO, 'src/oauth-loopback.js'))) ok(!readRepo('src/oauth-loopback.js').includes(LIT) && /LARK_CALLBACK_URL/.test(readRepo('src/oauth-loopback.js')), 'src/oauth-loopback.js IMPORTS the URL and does not spell it');
  const fakeCb = R.rowById('fake').setup.callbackUrl;
  ok(new URL(fakeCb).origin === new URL(LIT).origin && fakeCb !== LIT, 'the fake row\'s callback shares the ONE VibeSpace loopback origin under its own path');
}

// (e) ONE ENV NAME, ONE RESOLVER
{
  const prefixes = R.ROWS.filter((r) => r.clusterEnv).map((r) => r.clusterEnv.prefix);
  ok(new Set(prefixes).size === prefixes.length, 'every own-env row has a UNIQUE prefix');
  ok(R.ROWS.every((r) => !r.clusterEnv || r.clusterEnv.json === 'VIBESPACE_INTEGRATIONS'), 'every own-env row shares the ONE JSON name, resolved by the ONE store');
  ok(!R.ROWS.some((r) => JSON.stringify(r).includes('VIBESPACE_GDRIVE_CLIENTS')), 'no row re-declares VIBESPACE_GDRIVE_CLIENTS — the gmail row DELEGATES to its existing reader');
  ok(R.ROWS.filter((r) => r.delegate).every((r) => !r.clusterEnv), 'a delegating row declares no env of its own');
  const twin = [{ ...R.rowById('lark'), id: 'lark2' }];
  const dupPrefix = [...R.ROWS, ...twin].map((r) => r.clusterEnv && r.clusterEnv.prefix).filter(Boolean);
  ok(new Set(dupPrefix).size !== dupPrefix.length, 'CONTROL: a second row claiming lark\'s prefix would collide (the uniqueness assert above would go red)');
}

// (f) EVERY testable row has a runner, or names its phase — through the real wiring
{
  for (const row of R.ROWS) {
    if (row.wiredIn) continue;
    ok(store.hasTestRunner(row.id), `${row.id}: declares a test and its consumer registered the runner`);
  }
}

// (g) THE ROUTES NEVER TOUCH PLAINTEXT
{
  const routeSrc = readRepo('src/routes/integrations.js');
  ok(!/resolveIntegration/.test(routeSrc) && !/\.values\b/.test(routeSrc.replace(/body\.values/g, '')), 'src/routes/integrations.js never calls resolveIntegration and never reads a resolved `values` — publicView is the ONE view it serves');
  const winSrc = readRepo('src/lib/integrations-window.js');
  ok(!/innerHTML\s*=/.test(winSrc), 'the window sets no innerHTML on any path (every vendor/user string goes through textContent)');
  ok(/registerWindowType\(\{[\s\S]*type: 'integrations'[\s\S]*singleton: true/.test(winSrc) && /registerMenuItem\(\{[\s\S]*menu: 'gear'/.test(winSrc), 'the window is a registered singleton type with a gear-menu contribution');
}

server.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
