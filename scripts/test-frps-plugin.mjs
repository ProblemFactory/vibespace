#!/usr/bin/env node
// test-frps-plugin — THE RELAY LOGIN PLUGIN (tools/frps-login-plugin — lane relay-token-per-instance, design q-051 §2/§6; the
// owner's decision 2026-10-20). Fast tier: the plugin as a REAL HTTP server on loopback, a fake frps that POSTs the ops frps
// sends ({ version, op, content } — Login / NewProxy / CloseProxy), relay-admin as a real child process, a scratch table.
// No frps binary, no network beyond 127.0.0.1.
//   ① Login: a registered token ⇒ accept; another ⇒ bad_token; revoked ⇒ revoked; no metas in the grace ⇒ accept + ONE
//      `legacy` audit line per use (its client address); after the grace ⇒ legacy_token_retired; an unregistered id ⇒ the
//      knock in the grace, unknown_instance after; the cluster row (a pod by its own name; an id-shaped user refused)
//   ② NewProxy: the prefix rule (with and without frps's `<user>.` prefix) ⇒ name_not_yours; a subdomain's first claim is
//      the owner's (persisted); ANOTHER instance ⇒ name_in_use:<its label> + a `conflict` audit line; the same instance
//      after a restart (a new run id) keeps it; a legacy login never takes a held name; custom domains alike; a revoke
//      refuses the next proxy of a LIVE login; release frees a name
//   ③ CloseProxy, /healthz (live, legacyLive, grace), the table re-read on change (relay-admin edits, no plugin restart)
//   ④ FAIL CLOSED: an unreadable / malformed table, a malformed body, an op it was not built for — refused by name
//   ⑤ the audit's shape: one JSON line per call, never the token nor its hash
//   ⑥ relay-admin (a real child): add / rotate / revoke / grace / release / list / hash (stdin) / new-token; bad shapes
//      refused (the label a shell would run, a non-hex hash); the spawned plugin answers frps over HTTP
//   ⑦ PARITY: the plugin's name rule ≡ src/relay-token.js nameVerdict; DEFAULT_PREFIXES ≡ RT.PREFIXES
//   ⑦b VOUCH (opt-in --knock-file): an identity login comes back with frp's privilege key for frps's own token (every other
//      field as frps sent it); a legacy login is handed back unchanged; no flag ⇒ unchange. q-052: the knock file is
//      re-read on change — the grace's end with the plugin running (emptied file, frps on auth.token = "") still lets a
//      registered instance in (a fake frps verifies the key); RED control = the pre-fix read-once
//   ⑦c THE CONTROL AFTER THE LOGIN (lane frp-token-proof, 2026-10-30 — the vouch REFUTED by a production incident): a stub
//      frps modelled on frp v0.70.0 (server/service.go: the plugin, then its own privilege-key check, then the control
//      connection KEYED with its auth.token — frpc keys it with its own; different keys ⇒ the first frame is unreadable, the
//      connection dropped, no NewProxy reaches the plugin). A frpc WITHOUT the shared token, vouched, frps on the shared
//      token: Login accept + "vouched":true, NO NewProxy — the old canary criterion («vouched»:true) passes on that very
//      transcript, the new one (a NewProxy accept after the locked restart) fails it; with the token: a NewProxy accept;
//      without the flag: the login REFUSED by name; frps on auth.token = "": accepted with or without the vouch. The
//      README marks the vouch REFUTED and names the new check (RED on the base README)
//   ⑧ MUTANTS (compiled in memory at the real path) ⇒ RED: no revoke check · no name ownership · the grace for ever
// Run: node scripts/test-frps-plugin.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import Module from 'node:module';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const DIR = path.join(REPO, 'tools/frps-login-plugin');
const PLUGIN = path.join(DIR, 'plugin.js');
const ADMIN = path.join(DIR, 'relay-admin.js');
const T = require(path.join(DIR, 'table.js'));
const RT = require(path.join(REPO, 'src/relay-token.js'));
const ROOT = scratch('frps-plugin');
fs.mkdirSync(ROOT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const tok = () => RT.mint({ randomBytes: crypto.randomBytes, now: Date.now(), label: 'x' }).token;
let seq = 0;
const dirOf = (tag) => { const d = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };

/** a table file with instances A (my-hub) + B (other-hub, revoked later) + cluster `fleet`, grace open unless said */
function world({ graceOpen = true } = {}) {
  const d = dirOf('w');
  const file = path.join(d, 'relay-instances.json'), audit = path.join(d, 'audit.jsonl');
  const A = { id: 'vi-aaaaaaaaaaaa', token: tok(), label: 'my-hub' }, B = { id: 'vi-bbbbbbbbbbbb', token: tok(), label: 'other-hub' }, C = { token: tok() };
  T.update(file, (t) => {
    t.grace.legacyUntil = new Date(Date.now() + (graceOpen ? 7 : -1) * 86400e3).toISOString();
    for (const x of [A, B]) t.instances[x.id] = { tokenHash: sha(x.token), label: x.label, prefixes: [...T.DEFAULT_PREFIXES], addedAt: new Date().toISOString(), rotatedAt: null, revokedAt: null };
    t.clusters.fleet = { tokenHash: sha(C.token), userRe: '^[a-z0-9][a-z0-9-]{0,39}$', prefixes: [...T.DEFAULT_PREFIXES], addedAt: new Date().toISOString(), revokedAt: null };
  });
  return { d, file, audit, A, B, C };
}
/** the plugin module — the shipped one, or a MUTANT compiled in memory at the real path (its ./table.js resolves alike) */
function pluginModule(mutate = null) {
  if (!mutate) return require(PLUGIN);
  const src = mutate(fs.readFileSync(PLUGIN, 'utf8'));
  const m = new Module(PLUGIN, null); m.filename = PLUGIN; m.paths = Module._nodeModulePaths(DIR);
  m._compile(src.replace(/^#!.*\n/, ''), PLUGIN);
  return m.exports;
}
async function serve(w, mod = require(PLUGIN), extra = {}) {
  const p = mod.createPlugin({ table: w.file, audit: w.audit, ...extra });
  const srv = http.createServer(p.listener('/handler'));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  /** THE FAKE FRPS: what frps POSTs for one op */
  const op = async (name, content) => { const r = await fetch(`${base}/handler?version=0.1.0&op=${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: '0.1.0', op: name, content }) }); return r.json(); };
  const raw = async (body) => (await fetch(`${base}/handler`, { method: 'POST', body })).json();
  const health = async () => (await fetch(`${base}/healthz`)).json();
  return { p, srv, base, op, raw, health, close: () => new Promise((r) => srv.close(r)) };
}
const login = (user, token, addr = '203.0.113.7:51000', run = 'run1') => ({ version: '0.70.0', hostname: '', os: 'linux', arch: 'amd64', user, timestamp: 1, privilege_key: 'k', run_id: run, pool_count: 1, metas: token ? { token } : {}, client_address: addr });
const proxy = (user, token, proxyName, extra = {}, run = 'run1') => ({ user: { user, metas: token ? { token } : {}, run_id: run }, proxy_name: proxyName, proxy_type: extra.subdomain ? 'http' : 'tcp', ...extra });
const ACCEPT = JSON.stringify({ reject: false, unchange: true });
const isAccept = (r) => JSON.stringify(r) === ACCEPT;
const reason = (r) => (r && r.reject ? r.reject_reason : null);
const auditOf = (w) => { try { return fs.readFileSync(w.audit, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

/** the legs a mutant must fail — returns the names of the legs that held (all of them = the shipped plugin) */
async function coreLegs(mod) {
  const held = [];
  const w = world();
  const s = await serve(w, mod);
  try {
    T.update(w.file, (t) => { t.instances[w.B.id].revokedAt = new Date().toISOString(); });
    if (reason(await s.op('Login', login(w.B.id, w.B.token))) === 'revoked') held.push('revoked');
    if (isAccept(await s.op('NewProxy', proxy(w.A.id, w.A.token, `${w.A.id}.vibespace-instance`, { subdomain: 'vsowned00001' })))
      && reason(await s.op('NewProxy', proxy('alice', w.C.token, 'alice.vibespace-instance', { subdomain: 'vsowned00001' }))) === 'name_in_use:my-hub') held.push('ownership');
  } finally { await s.close(); }
  const w2 = world({ graceOpen: false });
  const s2 = await serve(w2, mod);
  try { if (reason(await s2.op('Login', login('', ''))) === 'legacy_token_retired') held.push('grace'); } finally { await s2.close(); }
  return held;
}

console.log('① Login');
{
  const w = world();
  const s = await serve(w);
  try {
    ok(isAccept(await s.op('Login', login(w.A.id, w.A.token))), 'a registered instance\'s own token ⇒ accept');
    ok(reason(await s.op('Login', login(w.A.id, w.B.token))) === 'bad_token' && reason(await s.op('Login', login(w.A.id, 'vsrt_' + 'x'.repeat(43)))) === 'bad_token', 'another instance\'s token / a made-up one under this id ⇒ bad_token');
    T.update(w.file, (t) => { t.instances[w.B.id].revokedAt = new Date().toISOString(); });
    ok(reason(await s.op('Login', login(w.B.id, w.B.token))) === 'revoked', 'a revoked id ⇒ revoked (the table re-read: relay-admin\'s edit took effect without a restart)');
    const before = auditOf(w).filter((x) => x.verdict === 'legacy').length;
    ok(isAccept(await s.op('Login', login('', '', '198.51.100.9:4000'))) && isAccept(await s.op('Login', login('', '', '198.51.100.9:4001'))), 'no metas.token during the grace ⇒ accept (an older build: the shared token is its knock — frps checks that one)');
    const leg = auditOf(w).filter((x) => x.verdict === 'legacy');
    ok(leg.length === before + 2 && leg[leg.length - 1].addr === '198.51.100.9:4001' && leg[leg.length - 1].reason === 'shared-token', 'every legacy use writes ONE audit line, with its client address', leg.slice(-2));
    ok(isAccept(await s.op('Login', login('vi-cccccccccccc', tok()))) && auditOf(w).slice(-1)[0].reason === 'unregistered', 'an id the table does not know yet ⇒ the knock during the grace (an instance upgraded before its registration keeps its relay), audited `unregistered`');
    ok(isAccept(await s.op('Login', login('alice', w.C.token))), 'the cluster row: a pod by its own name with the cluster\'s token ⇒ accept');
    ok(reason(await s.op('Login', login('Not A Pod!', w.C.token))) === 'unknown_instance' && isAccept(await s.op('Login', login('vi-dddddddddddd', w.C.token))) && auditOf(w).slice(-1)[0].verdict === 'legacy',
      'a user outside the row\'s userRe ⇒ unknown_instance; an instance-id-shaped user never matches a cluster row (it is an unregistered instance)');
  } finally { await s.close(); }
  const w2 = world({ graceOpen: false });
  const s2 = await serve(w2);
  try {
    ok(reason(await s2.op('Login', login('', ''))) === 'legacy_token_retired', 'after the grace: no metas.token ⇒ legacy_token_retired');
    ok(reason(await s2.op('Login', login('vi-cccccccccccc', tok()))) === 'unknown_instance', 'after the grace: an unregistered id ⇒ unknown_instance (fail closed)');
    ok(isAccept(await s2.op('Login', login(w2.A.id, w2.A.token))), 'after the grace: a registered instance still logs in');
    T.update(w2.file, (t) => { t.grace.legacyUntil = null; });
    ok(reason(await s2.op('Login', login('', ''))) === 'legacy_token_retired', 'no grace at all (legacyUntil null) ⇒ closed');
  } finally { await s2.close(); }
}

console.log('② NewProxy');
{
  const w = world();
  const s = await serve(w);
  try {
    ok(isAccept(await s.op('NewProxy', proxy(w.A.id, w.A.token, `${w.A.id}.pf-local-3000`, { remote_port: 21000 }))) && isAccept(await s.op('NewProxy', proxy(w.A.id, w.A.token, 'pf-local-3001'))), 'a name with one of the prefixes ⇒ accept (with and without frps\'s `<user>.` prefix)');
    ok(reason(await s.op('NewProxy', proxy(w.A.id, w.A.token, `${w.A.id}.ssh-anything`))) === 'name_not_yours' && reason(await s.op('NewProxy', proxy(w.A.id, w.A.token, `${w.B.id}.pf-x`))) === 'name_not_yours', 'a name outside the prefixes — or another user\'s prefixed name — ⇒ name_not_yours');
    ok(reason(await s.op('NewProxy', proxy(w.A.id, w.B.token, 'pf-x'))) === 'bad_token', 'NewProxy re-checks the identity (frps hands user + metas with every proxy)');
    ok(isAccept(await s.op('NewProxy', proxy(w.A.id, w.A.token, `${w.A.id}.vibespace-instance`, { subdomain: 'vsa1b2c3d4e5' }))), 'a free subdomain ⇒ accept');
    ok(T.load(w.file).table.names.vsa1b2c3d4e5.owner === w.A.id && auditOf(w).slice(-1)[0].claimed[0] === 'vsa1b2c3d4e5', 'the first claim is this instance\'s from now on (persisted in the table, audited `claimed`)');
    const r = await s.op('NewProxy', proxy(w.B.id, w.B.token, `${w.B.id}.vibespace-instance`, { subdomain: 'vsa1b2c3d4e5' }));
    const conf = auditOf(w).slice(-1)[0];
    ok(reason(r) === 'name_in_use:my-hub' && conf.verdict === 'conflict' && conf.reason === 'name_in_use:my-hub' && conf.user === w.B.id, 'ANOTHER instance claiming it ⇒ name_in_use:<the holder\'s label> + a `conflict` audit line', { r, conf });
    ok(JSON.stringify(RT.refusalOf('new proxy [x] error: ' + reason(r))) === JSON.stringify({ code: 'name_in_use', owner: 'my-hub' }), 'the hub reads that reason back (RT.refusalOf) — the For-you item names the holder');
    ok(isAccept(await s.op('NewProxy', proxy(w.A.id, w.A.token, `${w.A.id}.vibespace-instance`, { subdomain: 'vsa1b2c3d4e5' }, 'run2'))), 'the same instance after a restart (a new run id) still holds it');
    ok(reason(await s.op('NewProxy', proxy('', '', 'vibespace-instance', { subdomain: 'vsa1b2c3d4e5' }))) === 'name_in_use:my-hub', 'a legacy login (the shared token) never takes a held name — the blast radius shrinks during the grace already');
    ok(isAccept(await s.op('NewProxy', proxy('', '', 'canary-anything', { subdomain: 'vsfree0000001' }))) && !T.load(w.file).table.names.vsfree0000001, 'a legacy login may use a FREE name (no prefix rule — the old world), never owning it');
    ok(isAccept(await s.op('NewProxy', proxy('alice', w.C.token, 'alice.pf-alice-8080', { subdomain: 'vspod0000001' }))) && T.load(w.file).table.names.vspod0000001.owner === 'fleet/alice'
      && reason(await s.op('NewProxy', proxy('bob', w.C.token, 'bob.pf-bob-8080', { subdomain: 'vspod0000001' }))) === 'name_in_use:alice', 'cluster pods own names by pod name (fleet/<pod>): another pod ⇒ name_in_use:alice');
    ok(isAccept(await s.op('NewProxy', proxy(w.A.id, w.A.token, 'pf-dom', { custom_domains: ['app.example.com'] }))) && reason(await s.op('NewProxy', proxy(w.B.id, w.B.token, 'pf-dom', { custom_domains: ['app.example.com'] }))) === 'name_in_use:my-hub', 'custom domains are held alike');
    ok(reason(await s.op('NewProxy', proxy(w.A.id, w.A.token, 'pf-x', { subdomain: 'Bad_Name' }))) === 'name_not_yours', 'a name outside the relay\'s shape ⇒ name_not_yours');
    T.update(w.file, (t) => { t.instances[w.A.id].revokedAt = new Date().toISOString(); });
    ok(reason(await s.op('NewProxy', proxy(w.A.id, w.A.token, `${w.A.id}.pf-local-3002`))) === 'revoked', 'a revoke refuses the next proxy of a login that is already LIVE');
    T.update(w.file, (t) => { t.instances[w.A.id].revokedAt = null; });
    execFileSync(process.execPath, [ADMIN, 'release', 'vsa1b2c3d4e5', '--table', w.file]);
    ok(isAccept(await s.op('NewProxy', proxy(w.B.id, w.B.token, `${w.B.id}.vibespace-instance`, { subdomain: 'vsa1b2c3d4e5' }))) && T.load(w.file).table.names.vsa1b2c3d4e5.owner === w.B.id, 'relay-admin release frees a name — the next claim owns it');
  } finally { await s.close(); }
}

console.log('③ CloseProxy · /healthz · the table re-read');
{
  const w = world();
  const s = await serve(w);
  try {
    await s.op('NewProxy', proxy(w.A.id, w.A.token, `${w.A.id}.pf-a`));
    await s.op('NewProxy', proxy('', '', 'legacy-proxy'));
    let h = await s.health();
    ok(h.ok && h.instances === 2 && h.clusters === 1 && h.live === 2 && h.legacyLive === 1 && h.grace.open === true && typeof h.lastLegacyAt === 'string', '/healthz: instances, clusters, live, legacyLive, grace, lastLegacyAt', h);
    ok(isAccept(await s.op('CloseProxy', { user: { user: '', metas: {}, run_id: 'r' }, proxy_name: 'legacy-proxy' })), 'CloseProxy ⇒ accept');
    h = await s.health();
    ok(h.live === 1 && h.legacyLive === 0, 'CloseProxy: the live list forgets it (legacyLive 0 — the grace\'s end check)', h);
    const E = { id: 'vi-eeeeeeeeeeee', token: tok() };
    ok(reason(await s.op('Login', login(E.id, E.token))) === null, 'before its registration a new id is the knock (grace)');
    execFileSync(process.execPath, [ADMIN, 'add', E.id, sha(E.token), 'late-hub', '--table', w.file]);
    ok(isAccept(await s.op('Login', login(E.id, E.token))) && auditOf(w).slice(-1)[0].kind === 'instance', 'relay-admin add ⇒ the next Login is that instance\'s (the table re-read on change, no plugin restart)');
  } finally { await s.close(); }
}

console.log('④ FAIL CLOSED');
{
  const w = world();
  const s = await serve(w);
  try {
    ok(reason(await s.raw('{not json')) === 'bad_request' && reason(await s.raw(JSON.stringify({ op: 'Login' }))) === 'bad_request', 'a malformed body ⇒ refused bad_request');
    ok(reason(await s.op('NewUserConn', { user: {} })) === 'unknown_op' && reason(await s.op('Ping', { user: {} })) === 'unknown_op', 'an op it was not built for ⇒ refused unknown_op (subscribe the three ops only)');
    fs.writeFileSync(w.file, '{"v":1,');
    ok(reason(await s.op('Login', login(w.A.id, w.A.token))) === 'table_unreadable' && reason(await s.op('NewProxy', proxy(w.A.id, w.A.token, 'pf-x'))) === 'table_unreadable', 'an unparseable table ⇒ EVERY op refused table_unreadable');
    fs.writeFileSync(w.file, JSON.stringify({ v: 1, grace: { legacyUntil: null }, instances: { 'not-an-id': {} }, clusters: {}, names: {} }));
    ok(reason(await s.op('Login', login('', ''))) === 'table_unreadable' && (await s.health()).ok === false, 'a malformed row ⇒ refused too; /healthz says ok:false');
    fs.rmSync(w.file);
    ok(reason(await s.op('Login', login(w.A.id, w.A.token))) === 'table_unreadable', 'no table ⇒ refused');
    const r404 = await fetch(`${s.base}/other`, { method: 'POST', body: '{}' });
    ok(r404.status === 404, 'any other path ⇒ 404');
  } finally { await s.close(); }
}

console.log('⑤ the audit');
{
  const w = world();
  const s = await serve(w);
  try {
    await s.op('Login', login(w.A.id, w.A.token)); await s.op('Login', login(w.A.id, w.B.token)); await s.op('NewProxy', proxy(w.A.id, w.A.token, `${w.A.id}.pf-a`, { subdomain: 'vsaudit00001' }));
    const rows = auditOf(w);
    const text = fs.readFileSync(w.audit, 'utf8');
    const secrets = [w.A.token, w.B.token, w.C.token, sha(w.A.token), sha(w.B.token), sha(w.C.token), sha(w.A.token).slice(0, 16)];
    ok(rows.length === 3 && rows.every((x) => typeof x.at === 'string' && x.op && x.verdict && 'user' in x), 'one JSON line per call: at · op · user · verdict (+ label, proxy, subdomain, reason, addr)', rows);
    ok(secrets.every((x) => !text.includes(x)), 'the audit never holds a token nor a hash (not even 16 hex of one)');
    ok((fs.statSync(w.audit).mode & 0o777) === 0o600, 'the audit file is 0600');
    await s.op('Login', login('u'.repeat(5000), ''));
    const last = auditOf(w).slice(-1)[0];
    ok(last.user.length === 160, 'a caller\'s words are clipped in the audit (a 5000-char user ⇒ 160)', last.user.length);
  } finally { await s.close(); }
}

console.log('⑥ relay-admin (a real child) + the spawned plugin');
{
  const d = dirOf('admin');
  const file = path.join(d, 't.json');
  const run = (args, input) => { try { return { code: 0, out: execFileSync(process.execPath, [ADMIN, ...args, '--table', file], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status, out: String(e.stdout || ''), err: String(e.stderr || '') }; } };
  const t0 = Date.now();
  ok(run(['init', '--grace', '7d']).code === 0 && Math.abs(Date.parse(T.load(file).table.grace.legacyUntil) - (t0 + 7 * 86400e3)) < 60e3 && (fs.statSync(file).mode & 0o777) === 0o600, 'init --grace 7d: a 0600 table, the shared token open for 7 days (owner Q1)');
  ok(run(['init']).code === 1, 'init over an existing table is refused (nothing changed)');
  const tk = tok();
  const h = run(['hash'], tk + '\n');
  ok(h.code === 0 && h.out.trim() === sha(tk), 'hash: the sha256 of a token read from STDIN (never argv)');
  ok(run(['add', 'vi-0123456789ab', sha(tk), 'my-hub']).code === 0 && T.load(file).table.instances['vi-0123456789ab'].tokenHash === sha(tk), 'add <id> <sha256> <label> (the Relay card\'s line, verbatim)');
  ok(run(['add', 'vi-0123456789ab', sha(tk), 'my-hub']).code === 1, 'add of a registered id is refused (rotate is the door)');
  for (const [args, what] of [[['add', 'vi-0123456789ac', sha(tk), 'x;reboot'], 'a label a shell would run'], [['add', 'vi-0123456789ac', 'nothex', 'x'], 'a non-hex hash'], [['add', 'host-1', sha(tk), 'x'], 'an id that is not vi-<12 hex>'], [['rotate', 'vi-0123456789ab', 'zz'], 'a rotate without a hash']]) {
    ok(run(args).code === 2, `refused (usage): ${what}`);
  }
  ok(run(['revoke', 'vi-0123456789ab']).code === 0 && T.load(file).table.instances['vi-0123456789ab'].revokedAt, 'revoke');
  const tk2 = tok();
  ok(run(['rotate', 'vi-0123456789ab', sha(tk2)]).code === 0 && T.load(file).table.instances['vi-0123456789ab'].revokedAt === null && T.load(file).table.instances['vi-0123456789ab'].tokenHash === sha(tk2), 'rotate: a new hash for the same id — a revoked id comes back this way (owner Q3)');
  const nt = run(['new-token']);
  const [ntTok, ntHash] = nt.out.trim().split('\n');
  ok(nt.code === 0 && RT.TOKEN_RE.test(ntTok) && ntHash === sha(ntTok), 'new-token: a vsrt_ token + its sha256 (the cluster\'s — into the chart\'s secret)');
  ok(run(['add-cluster', 'fleet', ntHash, '^[a-z0-9][a-z0-9-]{0,39}$']).code === 0 && run(['add-cluster', 'fleet2', ntHash, 'unanchored']).code === 1, 'add-cluster (an unanchored userRe is refused — the table\'s shape check)');
  ok(run(['grace', 'off']).code === 0 && Date.parse(T.load(file).table.grace.legacyUntil) <= Date.now(), 'grace off: the shared token ends now');
  const ls = run(['list']).out;
  ok(ls.includes('vi-0123456789ab') && ls.includes(sha(tk2).slice(0, 8) + '…') && !ls.includes(sha(tk2)), 'list shows 8 hex of a hash, never the whole');
  ok(run(['frobnicate']).code === 2, 'an unknown command prints the usage (exit 2)');
  // the plugin as its own process (the systemd unit's ExecStart shape)
  const audit = path.join(d, 'audit.jsonl');
  const child = spawn(process.execPath, [PLUGIN, '--table', file, '--listen', '127.0.0.1:0', '--audit', audit], { stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((res) => { let b = ''; child.stdout.on('data', (x) => { b += x; const m = b.match(/listening [\d.]+:(\d+)/); if (m) res(Number(m[1])); }); setTimeout(() => res(0), 5000); });
  ok(port > 0, 'the spawned plugin says where it listens', port);
  const r = await (await fetch(`http://127.0.0.1:${port}/handler`, { method: 'POST', body: JSON.stringify({ version: '0.1.0', op: 'Login', content: login('vi-0123456789ab', tk2) }) })).json();
  const r2 = await (await fetch(`http://127.0.0.1:${port}/handler`, { method: 'POST', body: JSON.stringify({ version: '0.1.0', op: 'Login', content: login('', '') }) })).json();
  ok(isAccept(r) && reason(r2) === 'legacy_token_retired', 'over HTTP: the rotated token logs in; after `grace off` the shared token is refused', { r, r2 });
  child.kill('SIGTERM');
  const code = await new Promise((res) => { child.on('exit', (c) => res(c)); setTimeout(() => res('hung'), 3000); });
  ok(code === 0, 'SIGTERM ⇒ exits 0', code);
}

console.log('⑦ PARITY with the hub\'s rule');
{
  ok(JSON.stringify(T.DEFAULT_PREFIXES) === JSON.stringify(RT.PREFIXES), 'DEFAULT_PREFIXES ≡ src/relay-token.js PREFIXES', [T.DEFAULT_PREFIXES, RT.PREFIXES]);
  const w = world();
  const s = await serve(w);
  const names = ['pf-local-3000', 'vibespace-instance', `${w.A.id}.pf-x`, `${w.A.id}.vibespace-instance`, 'canary-fwd', `${w.B.id}.pf-x`, 'pfx', 'vibespace', ''];
  const diff = [];
  try {
    for (const n of names) {
      const hub = RT.nameVerdict({ prefixes: RT.PREFIXES, user: w.A.id }, { proxyName: n }).ok;
      const relay = isAccept(await s.op('NewProxy', proxy(w.A.id, w.A.token, n)));
      if (hub !== relay) diff.push({ n, hub, relay });
    }
  } finally { await s.close(); }
  ok(diff.length === 0, `the plugin answers ${names.length} names exactly as RT.nameVerdict does`, diff);
  const lines = fs.readFileSync(PLUGIN, 'utf8').split('\n').length;
  const reqs = [...fs.readFileSync(PLUGIN, 'utf8').matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
  ok(lines <= 300 && JSON.stringify(reqs) === JSON.stringify(['http', 'fs', 'crypto', './table.js']), `plugin.js ≤ 300 lines (${lines}), node builtins + ./table.js only`, reqs);
}

console.log('⑦b VOUCH (opt-in --knock-file)');
{
  const w = world();
  const KNOCK = 'shared-knock-' + crypto.randomBytes(6).toString('hex');
  const s = await serve(w, require(PLUGIN), { knock: KNOCK });
  try {
    const c = { ...login(w.A.id, w.A.token), timestamp: 1792483200 };
    const r = await s.op('Login', c);
    const want = crypto.createHash('md5').update(KNOCK + '1792483200').digest('hex');
    ok(r.reject === false && r.unchange === false && r.content.privilege_key === want, 'an instance login by its OWN token comes back with frp\'s privilege key for frps\'s token (md5(token + timestamp))', r);
    const { privilege_key: _a, ...restIn } = c, { privilege_key: _b, ...restOut } = r.content;
    ok(JSON.stringify(restIn) === JSON.stringify(restOut), 'every other field as frps sent it (frps decodes the whole login from the answer)');
    ok(r.content.privilege_key === want && !JSON.stringify(r).includes(KNOCK), 'the answer carries the key, never the shared token');
    const rc = await s.op('Login', { ...login('alice', w.C.token), timestamp: 5 });
    ok(rc.content && rc.content.privilege_key === crypto.createHash('md5').update(KNOCK + '5').digest('hex'), 'a cluster pod is vouched alike');
    ok(isAccept(await s.op('Login', login('', ''))) && isAccept(await s.op('Login', login('vi-cccccccccccc', tok()))), 'a legacy / unregistered login is handed back UNCHANGED (frps judges its own knock)');
    ok(reason(await s.op('Login', login(w.A.id, w.B.token))) === 'bad_token', 'a bad token is still refused (never vouched)');
    ok(auditOf(w).filter((x) => x.vouched).length === 2 && !fs.readFileSync(w.audit, 'utf8').includes(KNOCK), 'the audit marks a vouched login, never the token');
  } finally { await s.close(); }
  const w2 = world();
  const s2 = await serve(w2);
  try { ok(isAccept(await s2.op('Login', login(w2.A.id, w2.A.token))), 'no --knock-file ⇒ an instance login is `unchange` (frps keeps asking the shared token until the grace ends)'); } finally { await s2.close(); }
  // q-052 (verify r1, medium): THE GRACE'S END WITH THE PLUGIN RUNNING. A fake frps verifies the answer the way frp's token
  // auth does (md5(its auth.token + timestamp) === privilege_key) — before (the shared token) and after `auth.token = ""`.
  const frpsTakes = (token, c, r) => { const m = r.reject ? null : (r.unchange ? c : r.content); return !!m && crypto.createHash('md5').update(token + String(m.timestamp)).digest('hex') === m.privilege_key; };
  async function graceEnd(mod) {
    const w3 = world();
    const kf = path.join(w3.d, 'knock'); fs.writeFileSync(kf, KNOCK + '\n', { mode: 0o600 });
    const s3 = await serve(w3, mod, { knockFile: kf });
    try {
      const c = { ...login(w3.A.id, w3.A.token), timestamp: 1792490000, privilege_key: crypto.createHash('md5').update('1792490000').digest('hex') };   // frpc without a knock: md5('' + ts)
      const before = frpsTakes(KNOCK, c, await s3.op('Login', c));
      fs.writeFileSync(kf, '');   // README «Ending the grace» step 1: `: > /etc/frp/knock`
      execFileSync(process.execPath, [ADMIN, 'grace', 'off', '--table', w3.file]);
      const c2 = { ...c, timestamp: 1792490100, privilege_key: crypto.createHash('md5').update('1792490100').digest('hex') };
      const after = frpsTakes('', c2, await s3.op('Login', c2));
      const legacy = reason(await s3.op('Login', login('', '')));
      fs.rmSync(kf);
      const gone = await s3.op('Login', { ...c2, timestamp: 1792490200 });
      return { before, after, legacy, goneUnchanged: isAccept(gone) };
    } finally { await s3.close(); }
  }
  const ge = await graceEnd(require(PLUGIN));
  ok(ge.before && ge.after, 'THE GRACE\'S END with the plugin running: a registered login frps takes against the shared token, then — the knock file emptied, frps on auth.token = "" — against the empty token (no plugin restart)', ge);
  ok(ge.legacy === 'legacy_token_retired' && ge.goneUnchanged, '…the shared token is refused after the grace; a removed knock file = no vouch (unchange)', ge);
  const readOnce = pluginModule((src) => src.replace('if (key !== knockCache.key) {', 'if (knockCache.key === null) {'));
  const geM = await graceEnd(readOnce);
  ok(geM.before && !geM.after, 'RED control: the pre-fix read-once knock still vouches md5(<old token> + ts) — frps on auth.token = "" refuses the registered instance', geM);
  const bad = spawnSync(process.execPath, [PLUGIN, '--table', w2.file, '--listen', '127.0.0.1:0', '--knock-file', path.join(w2.d, 'no-such-knock')], { encoding: 'utf8', timeout: 5000 });
  ok(bad.status === 1 && /--knock-file .*ENOENT/.test(bad.stderr), 'a --knock-file that cannot be read at start fails the start by name (exit 1)', { status: bad.status, err: bad.stderr });
}

console.log('⑦c THE CONTROL AFTER THE LOGIN — a stub frps 0.70.0 (the vouch REFUTED)');
{
  const md5 = (t) => crypto.createHash('md5').update(String(t)).digest('hex');
  /** THE STUB frps 0.70.0 — one frpc connection: Login (the plugin, then frps's own privilege-key check against ITS auth.token),
   *  then the control connection keyed with frps's auth.token on its side and frpc's auth.token (`knock`) on the client's:
   *  different keys ⇒ frps cannot read the client's first frame (its NewProxy) and closes ("client exit success") */
  async function frps070(s, { frpsToken, user, token, knock, ts, sub }) {
    const c = { ...login(user, token), timestamp: ts, privilege_key: md5(knock + ts) };
    const r = await s.op('Login', c);
    if (r.reject) return { login: 'rejected', reason: r.reject_reason };
    const m = r.unchange ? c : r.content;
    if (md5(frpsToken + m.timestamp) !== m.privilege_key) return { login: 'refused', reason: 'token in login doesn\'t match token from configuration' };
    if (knock !== frpsToken) return { login: 'ok', control: 'dropped' };   // the stream key: frps's auth.token vs frpc's — never the plugin's
    const np = await s.op('NewProxy', proxy(user, token, `${user}.vibespace-instance`, { subdomain: sub }));
    return { login: 'ok', control: 'held', proxy: np.reject ? np.reject_reason : 'accept' };
  }
  const KNOCK = 'shared-knock-' + crypto.randomBytes(6).toString('hex');
  const w = world();
  const kf = path.join(w.d, 'knock'); fs.writeFileSync(kf, KNOCK + '\n', { mode: 0o600 });
  const sv = await serve(w, require(PLUGIN), { knockFile: kf });
  const w2 = world();
  const sn = await serve(w2);
  try {
    // the hub restarted with its vault LOCKED: frpc logs in with its own token, no shared token (frpc's auth.token = '')
    const t0 = auditOf(w).length;
    const locked = await frps070(sv, { frpsToken: KNOCK, user: w.A.id, token: w.A.token, knock: '', ts: 1793300000, sub: 'vsowned00002' });
    const tr = auditOf(w).slice(t0);
    ok(locked.login === 'ok' && locked.control === 'dropped', 'a frpc WITHOUT the shared token, vouched, frps still on the shared token: the login passes frps\'s check — then the keyed control is dropped (the incident: 2459 logins, 0 proxies)', locked);
    ok(tr.some((x) => x.op === 'Login' && x.verdict === 'accept' && x.vouched === true) && !tr.some((x) => x.op === 'NewProxy'), '…the audit: `Login accept "vouched":true` and NO NewProxy — the plugin never hears one', tr.map((x) => `${x.op}:${x.verdict}${x.vouched ? ':vouched' : ''}`));
    const oldCheck = (rows, id) => rows.some((x) => x.op === 'Login' && x.user === id && x.vouched === true);   // the README's old canary («"vouched":true»)
    const newCheck = (rows, id) => rows.some((x) => x.op === 'NewProxy' && x.user === id && x.verdict === 'accept');   // THE CHECK: a NewProxy accept after the locked restart
    ok(oldCheck(tr, w.A.id) === true && newCheck(tr, w.A.id) === false, 'THE CANARY: the old criterion («"vouched":true») PASSES on this transcript while nothing published — the new one (a NewProxy accept after the locked restart) fails it', { old: oldCheck(tr, w.A.id), new: newCheck(tr, w.A.id) });
    const t1 = auditOf(w).length;
    const knocked = await frps070(sv, { frpsToken: KNOCK, user: w.A.id, token: w.A.token, knock: KNOCK, ts: 1793300100, sub: 'vsowned00002' });
    ok(knocked.control === 'held' && knocked.proxy === 'accept' && newCheck(auditOf(w).slice(t1), w.A.id), 'the same frpc WITH the shared token: the control holds, its NewProxy is accepted (the check passes)', knocked);
    const plain = await frps070(sn, { frpsToken: KNOCK, user: w2.A.id, token: w2.A.token, knock: '', ts: 1793300200, sub: 'vsowned00003' });
    ok(plain.login === 'refused' && /token in login doesn't match/.test(plain.reason), 'WITHOUT --knock-file the token-less frpc is REFUSED at the login, by name (frpc logs it; the hub reads it) — the vouch turned that refusal into a silent drop', plain);
    fs.writeFileSync(kf, '');
    const ended = await frps070(sv, { frpsToken: '', user: w.A.id, token: w.A.token, knock: '', ts: 1793300300, sub: 'vsowned00002' });
    const endedPlain = await frps070(sn, { frpsToken: '', user: w2.A.id, token: w2.A.token, knock: '', ts: 1793300400, sub: 'vsowned00003' });
    ok(ended.proxy === 'accept' && endedPlain.proxy === 'accept', 'frps on auth.token = "" (the grace over): the token-less frpc publishes — with the vouch AND without it (the vouch is never what makes it work)', { ended, endedPlain });
  } finally { await sv.close(); await sn.close(); }
  // the README by its WHOLE repo-relative path (lane frp-token-proof r3): the push gate derives a suite's doc inputs from
  // such literals (test-ci-gate-push) — a bare 'README.md' is the ROOT README to it, which this suite never reads
  const RD = fs.readFileSync(path.join(REPO, 'tools/frps-login-plugin/README.md'), 'utf8');
  const sec = (RD.split(/^## /m).find((x) => /^Vouching/.test(x)) || '');
  ok(/REFUTED against frps 0\.70\.0/.test(sec.split('\n')[0]) && /keys the control connection AFTER the login/.test(sec), 'the README: the vouch section is headed REFUTED against frps 0.70.0 and says why (the control keyed with auth.token)', sec.split('\n')[0]);
  ok(/a `NewProxy` `accept` line for that instance in the audit AFTER the restart/.test(sec) && /`"vouched":true`[^.]*proves\s+nothing/.test(sec) && !/UNCONFIRMED/.test(RD), 'the README\'s check is a NewProxy accept after a restart with the vault locked — «vouched»:true proves nothing; no «UNCONFIRMED» left', sec.slice(0, 200));
  ok(/REFUTED against frps 0\.70\.0/.test(fs.readFileSync(PLUGIN, 'utf8').split('\nconst http')[0]), 'the plugin\'s header says REFUTED too');
}

console.log('⑧ MUTANTS ⇒ RED');
{
  ok(JSON.stringify(await coreLegs(require(PLUGIN))) === JSON.stringify(['revoked', 'ownership', 'grace']), 'the shipped plugin holds the three core legs');
  const MUT = [
    ['no revoke check', 'revoked', (s) => s.replace("if (inst.revokedAt) return { ok: false, reason: 'revoked' };", '')],
    ['no name ownership', 'ownership', (s) => s.replace("const held = names.find((n) => t.names[n] && t.names[n].owner !== w.owner);", 'const held = null;')],
    ['the grace for ever', 'grace', (s) => s.replace('const graceOpen = (t) => { const u = t.grace && t.grace.legacyUntil; return !!u && Date.parse(u) > now(); };', 'const graceOpen = () => true;')],
  ];
  for (const [what, leg, mutate] of MUT) {
    const src = fs.readFileSync(PLUGIN, 'utf8');
    const applied = mutate(src) !== src;
    const held = applied ? await coreLegs(pluginModule(mutate)) : ['(the mutant did not apply)'];
    ok(applied && !held.includes(leg), `MUTANT ${what} ⇒ the ${leg} leg goes RED`, { applied, held });
  }
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
