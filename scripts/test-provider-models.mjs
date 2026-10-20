#!/usr/bin/env node
// test-provider-models — FAST (in-process: the store on a scratch data dir, THE listed-provider refresh against a LOOPBACK
// fake of a provider's /models, the routes on a loopback express app over a REAL AccountManager). Design q-053 r1 §3 + §6 row
// P0c (lane models-at-session; the owner 2026-10-20: 「新建 session 的时候也要考量这个新 provider 具有的模型有哪些」). No
// vendor call: the fake answers scripts/fixtures/provider-models/models-answers.json; the request primitive is the real one.
//   ① THE REFRESH'S GATES, each refusing BEFORE the fake is reached (its hit count is the witness): not a person; the vault
//      locked / not set up; a record its provider does not list; the key unreadable — then a press that asks ONCE, with
//      the vault's key as its credential, the rows + fetchedAt kept (data/providers.json, 0600); a second press inside the
//      minute refused (the fake unhit), past it asked again; one in flight
//   ② THE ANSWER'S BOUNDS: more than 1 MB (by its length, and streamed with none) / a 500 / a redirect / not a list /
//      nobody listening — each refused by name, NOTHING kept (the record's rows and fetchedAt unchanged)
//   ③ THE STORE'S WRITE (setListed): only on a provider-listed record; an alias whose row left the list is dropped by name,
//      a default that left it cleared
//   ④ THE ROUTES: a NEW conversation's menu per account (the machine's login, a subscription, a Console key, a third-party
//      configured / provider-listed / none account, a pv- row, an unknown one); a RUNNING one's per session (no account, its
//      own, a pooled one's member); the whole catalog when no query (next()); the answer never names where a key lives;
//      the refresh door: an agent's token / another site ⇒ 403 (the fake unhit), the vault ⇒ 423, the minute ⇒ 429 +
//      Retry-After, a person ⇒ 200
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = require(path.join(ROOT, 'src/model-providers.js'));
const PS = require(path.join(ROOT, 'src/server/provider-store.js'));
const PM = require(path.join(ROOT, 'src/server/provider-models.js'));
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/provider-models/catalogs.json'), 'utf-8'));
const ANS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/provider-models/models-answers.json'), 'utf-8'));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── the loopback fake of a provider's list: every request recorded; `mode` picks its answer ──
const hits = [];
let mode = 'openrouter';
const fake = http.createServer((req, res) => {
  hits.push({ url: req.url, auth: req.headers.authorization || null, xkey: req.headers['x-api-key'] || null, method: req.method });
  if (mode === 'hang') return; // never answers (the client's own deadline — not waited for here)
  if (mode === 'error') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"error":"boom"}'); }
  if (mode === 'redirect') { res.writeHead(302, { location: `http://127.0.0.1:${fake.address().port}/elsewhere` }); return res.end(); }
  if (mode === 'notalist') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"models":"nope"}'); }
  if (mode === 'big') { const body = JSON.stringify({ data: [{ id: 'x/y', name: 'z'.repeat(1100000) }] }); res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }); return res.end(body); }
  if (mode === 'bigstream') { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"data":[{"id":"x/y","name":"'); const chunk = 'z'.repeat(65536); let n = 0; const more = () => { while (n < 20) { n++; if (!res.write(chunk)) return res.once('drain', more); } res.end('"}]}'); }; return more(); }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(mode === 'openai' ? ANS.openai : ANS.openrouter));
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const FAKE = `http://127.0.0.1:${fake.address().port}`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-pvmodels-'));
const DATA = path.join(dir, 'data'); fs.mkdirSync(DATA);
const catalogOf = (h) => FIX.harness[h] || null;
const store = PS.create({ dataDir: DATA, catalogOf, log: () => { } });
const put = (r) => { const x = store.put(r); if (!x.ok) throw new Error('seed refused: ' + JSON.stringify(x.errors)); return x.provider; };
put({ id: 'pv-or', kind: 'openrouter', label: 'OpenRouter', baseUrl: `${FAKE}/api/v1`, keyRef: 'integrations:openrouter#apiKey', modelsSource: 'listed', listedBy: 'provider-api', aliases: {} });
put({ id: 'pv-local', kind: 'self-hosted', label: 'Local vLLM', baseUrl: `${FAKE}/v1`, auth: 'x-api-key', keyRef: null, modelsSource: 'listed', listedBy: 'provider-api' });
put({ id: 'pv-ds', kind: 'self-hosted', label: 'DeepSeek', baseUrl: `${FAKE}/v1`, modelsSource: 'configured', models: [{ id: 'deepseek-chat', label: 'DeepSeek Chat', context: '128k', caps: ['tools'] }, { id: 'deepseek-reasoner', caps: ['reasoning'] }], aliases: { fast: 'deepseek-chat' }, defaultModel: 'deepseek-reasoner' });
put({ id: 'pv-empty', kind: 'self-hosted', label: 'Empty', modelsSource: 'none' });
let vault = 'unlocked';
let clock = 1792494000000;
const keys = { 'integrations:openrouter#apiKey': 'sk-or-v1-lane' };
let keyReads = 0;
const keyOf = (ref) => { keyReads++; return keys[ref] ? { ok: true, value: keys[ref] } : { ok: false, code: 'key-unreadable' }; };
const refresher = PM.create({ providers: store, vaultState: () => vault, keyOf, now: () => clock, log: () => { } });
const press = (id, by = 'human') => refresher.refreshListedModels(id, { by });
const disk = () => JSON.parse(fs.readFileSync(store.file, 'utf-8')).providers.find((p) => p.id === 'pv-or');

// ── ① the gates ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('① the refresh\'s gates (the fake\'s hit count is the witness)');
ok((await press('pv-or', 'agent')).code === 'human_only' && (await press('pv-or', null)).code === 'human_only' && hits.length === 0, 'GATE a person: a call that does not say a person pressed (an agent, a timer — no `by`) ⇒ human_only; the provider never asked');
vault = 'locked';
const lk = await press('pv-or');
vault = 'not_set_up';
const ns = await press('pv-or');
vault = 'unlocked';
ok(lk.code === 'vault_locked' && ns.code === 'vault_not_set_up' && hits.length === 0 && keyReads === 0, 'GATE the vault: locked ⇒ vault_locked, not set up ⇒ vault_not_set_up — the key never read, the provider never asked');
ok((await press('pv-ds')).code === 'not-listed' && (await press('pv-anthropic-subscription')).code === 'not-listed' && (await press('pv-nope')).code === 'unknown' && hits.length === 0, 'a configured record, a harness-listed built-in ⇒ not-listed; an unknown id ⇒ unknown — never asked');
const before = fs.readFileSync(store.file, 'utf-8');
keys['integrations:openrouter#apiKey'] = '';
const ku = await press('pv-or');
keys['integrations:openrouter#apiKey'] = 'sk-or-v1-lane';
ok(ku.code === 'key-unreadable' && hits.length === 0 && fs.readFileSync(store.file, 'utf-8') === before, 'the vault entry unreadable ⇒ key-unreadable, never asked, nothing written');
clock += 61000; // that refused attempt counted toward the minute (an attempt is an attempt)
const r1 = await press('pv-or');
const d1 = disk();
const mode1 = (fs.statSync(store.file).mode & 0o777).toString(8);
ok(r1.ok && r1.listed === 3 && r1.skipped === 3 && hits.length === 1 && hits[0].url === '/api/v1/models' && hits[0].method === 'GET' && hits[0].auth === 'Bearer sk-or-v1-lane', 'a person\'s press, the vault open ⇒ ONE GET of <base>/models carrying the vault\'s key as its bearer; 3 rows listed, 3 refused rows skipped', { r1: { ...r1, provider: undefined }, hits });
ok(d1.modelsSource === 'listed' && d1.listedBy === 'provider-api' && d1.fetchedAt === clock && eq(d1.models.map((m) => m.id), ['deepseek/deepseek-chat-v3.1', 'anthropic/claude-sonnet-4.5', 'qwen/qwen3-coder:free']) && eq(d1.models[1].caps, ['tools', 'vision', 'reasoning', '1m']) && mode1 === '600', 'THE CACHE: the rows (with context + caps) and fetchedAt kept in data/providers.json (0600) before the answer', { d1, mode1 });
clock += 30000;
const r2 = await press('pv-or');
ok(r2.code === 'cooldown' && r2.retryAfterMs === 30000 && hits.length === 1, 'THE THROTTLE: a second press 30 s later ⇒ cooldown (30 s left) — the provider NOT asked again', r2);
clock += 30000;
mode = 'openai';
const p1 = press('pv-or'), p2 = press('pv-or');
const [a1, a2] = await Promise.all([p1, p2]);
ok(a1.ok && a2.code === 'in-flight' && hits.length === 2, 'past the minute ⇒ asked again; a second press while that one is out ⇒ in-flight (one request)', { a2 });
ok(eq(disk().models.map((m) => m.id), ['gpt-5.5', 'gpt-5.5-mini']), 'an OpenAI-compatible answer replaces the list (the cache is the last answer, whole)');
const rl = await press('pv-local');
ok(rl.ok && hits[2].url === '/v1/models' && hits[2].auth === null && hits[2].xkey === null, 'a keyless self-hosted record (keyRef none) asks with no credential at all');

// ── ② the answer's bounds ────────────────────────────────────────────────────────────────────────────────────
console.log('② the answer\'s bounds — each refused, NOTHING kept');
const kept = JSON.stringify(disk());
const bound = async (m) => { mode = m; clock += 61000; return press('pv-or'); };
const bBig = await bound('big'), bStream = await bound('bigstream'), bErr = await bound('error'), bRedir = await bound('redirect'), bBad = await bound('notalist');
ok(bBig.code === 'too-large' && bStream.code === 'too-large', 'more than 1 MB ⇒ too-large — said by its length, and cut off mid-stream when it names none', { bBig, bStream });
ok(bErr.code === 'http' && bErr.status === 500 && bRedir.code === 'unreachable' && bBad.code === 'bad-answer', 'a 500 ⇒ http 500; a redirect is never followed (the key stays on its host) ⇒ unreachable; not a list ⇒ bad-answer', { bErr, bRedir, bBad });
ok(!hits.some((h) => h.url === '/elsewhere'), 'the redirect\'s target was never asked');
const deadBase = `http://127.0.0.1:${await new Promise((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); })}`;
put({ ...store.get('pv-or'), baseUrl: `${deadBase}/api/v1` });
clock += 61000;
const bDead = await press('pv-or');
put({ ...store.get('pv-or'), baseUrl: `${FAKE}/api/v1` });
ok(bDead.code === 'unreachable' && JSON.stringify(disk()) === JSON.stringify({ ...JSON.parse(kept), baseUrl: `${FAKE}/api/v1` }), 'nobody listening ⇒ unreachable; after every refusal above the kept rows and fetchedAt are exactly as before', bDead);
ok(!fs.readFileSync(path.join(ROOT, 'src/server/provider-models.js'), 'utf-8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').match(/\bset(?:Timeout|Interval|Immediate)\s*\(/), 'the refresh module holds no timer (its deadline is the request\'s own AbortSignal.timeout)');

// ── ③ the store's write ──────────────────────────────────────────────────────────────────────────────────────
console.log('③ the store\'s write (setListed)');
put({ ...store.get('pv-or'), aliases: { mini: 'gpt-5.5-mini', big: 'gpt-5.5' }, defaultModel: 'gpt-5.5' });
const w1 = store.setListed('pv-or', [{ id: 'gpt-5.5-mini', label: 'mini', context: null, caps: [] }], clock);
ok(w1.ok && eq(w1.provider.aliases, { mini: 'gpt-5.5-mini' }) && eq(w1.droppedAliases, ['big']) && w1.provider.defaultModel === '', 'an alias whose row left the list is DROPPED by name (never left dangling); a default that left it is cleared', w1);
ok(store.setListed('pv-ds', [], clock).code === 'not-listed' && store.setListed('pv-anthropic-api', [], clock).code === 'not-listed' && store.setListed('pv-x', [], clock).code === 'unknown', 'only a provider-listed record takes a list (configured, a built-in ⇒ not-listed)');

// ── ④ the routes ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ the routes');
const express = require(path.join(ROOT, 'node_modules/express'));
const { AccountManager } = require(path.join(ROOT, 'src/accounts.js'));
const am = new AccountManager({ dataDir: DATA });
const sub = am.createSubscription({ name: 'Work Max' }).id;
const key = am.add({ name: 'Console', key: 'sk-ant-api03-' + 'q'.repeat(40) }).id;
const ds = am.add({ name: 'DeepSeek key', key: 'sk-ant-api03-' + 'd'.repeat(40) }).id;
const em = am.add({ name: 'Empty key', key: 'sk-ant-api03-' + 'e'.repeat(40) }).id;
const orAcct = am.add({ name: 'OpenRouter key', key: 'sk-ant-api03-' + 'o'.repeat(40) }).id;
// the third-party link the account record carries (`providerId` — Train 2's wizard writes it; the pool's member lookup reads it)
const accFile = path.join(DATA, 'accounts.json');
const accs = JSON.parse(fs.readFileSync(accFile, 'utf-8'));
for (const a of accs.accounts) a.providerId = { [ds]: 'pv-ds', [em]: 'pv-empty', [orAcct]: 'pv-or' }[a.id] || a.providerId;
fs.writeFileSync(accFile, JSON.stringify(accs));
const am2 = new AccountManager({ dataDir: DATA });
const pool = { id: 'pool-1', type: 'pooled', backend: 'claude', name: 'Pool' };
const accounts = { get: (id) => (id === 'pool-1' ? pool : am2.get(id)), poolMemberOfSession: (pid, s) => ({ id: pid === 'pool-1' && s._lane === 'held-ds' ? ds : null }) };
const sessions = new Map([['s-machine', { backend: 'claude' }], ['s-ds', { backend: 'claude', _accountId: ds }], ['s-empty', { backend: 'claude', _accountId: em }], ['s-pool', { backend: 'claude', _accountId: 'pool-1', _lane: 'held-ds' }], ['s-codex', { backend: 'codex' }], ['s-oc', { backend: 'opencode' }]]);
let refreshed = 0;
const routeFake = { n: 0 };
const app = express();
app.use(express.json());
require(path.join(ROOT, 'src/routes/provider-models.js')).registerProviderModelRoutes(app, { accounts, providers: store, activeSessions: sessions, catalogOf: (h) => FIX.harness[h] || (h === 'opencode' ? [{ id: '', label: 'Default' }, { id: 'oc/a', label: 'A' }] : null), refreshModels: () => { refreshed++; }, refresher: { refreshListedModels: (id, o) => { routeFake.n++; return refresher.refreshListedModels(id, o); } } });
app.get('/api/available-models', (req, res) => res.json({ whole: true })); // server.js's own answer stands behind next()
const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
const base = `http://127.0.0.1:${srv.address().port}`;
const get = async (q) => { const r = await fetch(`${base}/api/available-models${q}`); return [r.status, await r.json()]; };
const post = async (id, headers = {}) => { const r = await fetch(`${base}/api/providers/${encodeURIComponent(id)}/models/refresh`, { method: 'POST', headers }); return [r.status, await r.json(), r.headers.get('retry-after')]; };
try {
  const [s0, w0] = await get('');
  ok(s0 === 200 && w0.whole === true && refreshed === 0, 'no query ⇒ next(): server.js\'s whole-catalog answer, unchanged (Settings and the codex effort ladder read it)');
  const ids = (a) => a.models.map((m) => m.id);
  const [, n1] = await get('?backend=claude&account=');
  const [, n2] = await get(`?backend=claude&account=${sub}`);
  const [, n3] = await get(`?backend=claude&account=${key}`);
  ok(n1.provider.id === 'pv-anthropic-subscription' && n1.account === null && n2.provider.id === 'pv-anthropic-subscription' && n2.account.id === sub && n3.provider.id === 'pv-anthropic-api' && [n1, n2, n3].every((a) => a.open && !a.empty && eq(ids(a), FIX.harness.claude.map((m) => m.id))) && refreshed === 3, 'a NEW conversation: the machine\'s login, a subscription, a Console key ⇒ claude\'s own catalog (Default first, Custom… stays) under the provider each names');
  const [, n4] = await get(`?backend=claude&account=${ds}`);
  ok(n4.provider.id === 'pv-ds' && !n4.open && !n4.empty && eq(ids(n4), ['deepseek-chat', 'deepseek-reasoner']) && n4.defaultId === 'deepseek-reasoner' && n4.models[0].label === 'DeepSeek Chat' && n4.models[0].context === 128000, 'a third-party account (providerId → a configured record) ⇒ EXACTLY its entered rows (closed), its default named — the account switch\'s redraw', n4);
  const [, n5] = await get(`?backend=claude&account=${em}`);
  ok(n5.empty === true && n5.models.length === 0 && n5.provider.id === 'pv-empty' && n5.account.id === em && n5.account.name === 'Empty key', 'an account whose provider has none ⇒ empty, with the account the one line\'s door opens');
  const [, n6] = await get(`?backend=claude&account=${orAcct}`);
  const [, n7] = await get('?backend=claude&account=pv-ds');
  const [s8] = await get('?backend=claude&account=acct-nobody');
  ok(n6.refreshable === true && n6.provider.fetchedAt > 0 && eq(ids(n6), ['gpt-5.5-mini']) && n7.provider.id === 'pv-ds' && n7.account.type === 'provider' && s8 === 404, 'a provider-listed account ⇒ its CACHED rows (refreshable, fetchedAt); a projected pv- row ⇒ its record; an unknown account ⇒ 404');
  const leak = JSON.stringify([n1, n2, n3, n4, n5, n6, n7]);
  ok(!/keyRef|baseUrl|sk-or-v1|sk-ant-api03|integrations:/.test(leak), 'no menu answer names where a key lives, its value, or the provider\'s address');
  const [, r1m] = await get('?session=s-machine');
  const [, r2m] = await get('?session=s-ds');
  const [, r3m] = await get('?session=s-pool');
  const [, r4m] = await get('?session=s-empty');
  const [, r5m] = await get('?session=s-codex');
  const [, r6m] = await get('?session=s-oc');
  const [s7m] = await get('?session=s-gone');
  ok(r1m.session === 's-machine' && r1m.provider.id === 'pv-anthropic-subscription' && r1m.open && r2m.provider.id === 'pv-ds' && eq(ids(r2m), ['deepseek-chat', 'deepseek-reasoner']), 'a RUNNING conversation, per session: on the machine\'s login ⇒ claude\'s list; on the DeepSeek account ⇒ exactly its rows (the badge lists differ by session)');
  ok(r3m.provider.id === 'pv-ds' && r3m.account.id === ds && r4m.empty === true, 'a pooled conversation ⇒ the provider of the MEMBER it bills now (poolMemberOfSession); one on an empty provider ⇒ empty');
  ok(r5m.provider.id === 'pv-openai-chatgpt' && eq(ids(r5m), FIX.harness.codex.map((m) => m.id)) && r6m.provider === null && r6m.open && eq(ids(r6m), ['', 'oc/a']) && s7m === 404, 'a codex conversation ⇒ the ChatGPT login\'s (codex\'s catalog); opencode (no account table) ⇒ its harness\'s list as before; no such session ⇒ 404');
  // the refresh door
  clock += 61000; mode = 'openrouter';
  const n0 = hits.length, c0 = routeFake.n;
  const [d1s, d1] = await post('pv-or', { Authorization: 'Bearer vsst_planted', Origin: base });
  const [d2s, d2] = await post('pv-or', { Authorization: 'Bearer jbt_planted', Origin: base });
  const [d3s, d3] = await post('pv-or');
  const [d4s, d4] = await post('pv-or', { Origin: 'http://evil.test' });
  ok(d1s === 403 && d1.code === 'human_only' && d2s === 403 && d3s === 403 && d3.code === 'cross_site' && d4s === 403 && hits.length === n0 && routeFake.n === c0, 'THE DOOR: an agent\'s session token / a job token ⇒ 403 human_only; no browser page, another site ⇒ 403 cross_site — the refresher never called, the provider never asked', { d1, d3, d4 });
  vault = 'locked';
  const [d5s, d5] = await post('pv-or', { Origin: base });
  vault = 'unlocked';
  const [d6s, d6] = await post('pv-or', { Origin: base });
  const [d7s, d7, ra] = await post('pv-or', { 'Sec-Fetch-Site': 'same-origin' });
  const [d8s, d8] = await post('pv-ds', { Origin: base });
  ok(d5s === 423 && d5.code === 'vault_locked' && /Unlock the vault/.test(d5.error) && d6s === 200 && d6.ok && d6.listed === 3 && d7s === 429 && d7.code === 'cooldown' && ra === '60' && /try again in 60 s/.test(d7.error) && d8s === 409 && d8.code === 'not-listed' && hits.length === n0 + 1, 'a person on the page: the vault locked ⇒ 423; open ⇒ 200 (asked once); again at once ⇒ 429 Retry-After 60; a configured record ⇒ 409 not-listed', { d5, d6: { ...d6, provider: undefined }, d7, ra, d8 });
} finally { srv.close(); fake.close(); }

fs.rmSync(dir, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
