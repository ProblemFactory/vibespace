#!/usr/bin/env node
// test-relay-token — THE INSTANCE'S RELAY TOKEN, the PURE half (lane relay-token-per-instance, design q-051 §1/§6 — the owner's
// decision 2026-10-20: one token per instance, bound to its public names, NOT in the vault). Fast tier: src/relay-token.js
// only, crypto handed in, plus two text censuses over src/.
//   ① mint / rotate / revoke: the shapes (vi-<12 hex>, vsrt_ + 32 random bytes), the id kept, revoked ⇔ no token
//   ② parse: every bad shape ⇒ null (never half a record); serialize ∘ parse = identity
//   ③ the registration line carries the sha256 only — RED control: a line builder that leaks the token is caught
//   ④ the label is shell-safe (the line is pasted on the relay host): metacharacters never survive
//   ⑤ identityOf: the cluster's env > the record > none; revoked ⇒ no token; a pod name never takes an instance id's shape
//   ⑥ frpcLines name the identity with frp's env TEMPLATE — never the value
//   ⑥b relayEnv BUILDS frpc's env (lane frp-spawn-env-allowlist): the kept names + the two relay variables, none of the hub's
//      session tokens / cloud keys / the cluster's shared token / other proxies / HOME — MUTANTS (a spread, the pre-fix copy
//      minus two names) ⇒ RED
//   ⑦ the name rule (nameVerdict / strippedName) — the plugin answers the same table (test-frps-plugin's parity leg)
//   ⑧ refusalOf / loginOf read the relay's words out of frpc's (a proxy's start error, frpc.log); alertOf files ONE item per
//      name, never the token
//   ⑧b THE RUN'S LOG (lane frp-token-proof, 2026-10-30 — the hub dropped its own shared token after misreading a login):
//      runOf reads a run's logins / proxies started / the logins since the relay last answered a NewProxy (their times on the
//      hub's clock — the file's mtime) over THE INCIDENT'S TRANSCRIPT as frpc 0.70.0 logs it at info with tcpMux (try + login at
//      its backoff, nothing when the relay closes the control); r2: droppedOf is a RATE and an OUTCOME, never a count — no
//      shared token, a publish tried and never answered, 3 logins within 60 s, frpc still redialling. The LATCH (a healthy
//      proxy-less frpc's silent reconnects), logins days apart, a refused NewProxy (an answer), healthy reconnects: never
//      dropped; the owner's words (droppedAlertOf / retiredAlertOf) carry no token
//   ⑨ CENSUS: the env names VIBESPACE_RELAY_TOKEN / VIBESPACE_FRP_AUTH_TOKEN are spelled in src/relay-token.js only; the ONE
//      frpc spawn env is RT.relayEnv(process.env, …) in src/plugins/frp.js, which copies process.env nowhere; src/relay-token.js
//      requires nothing
// Run: node scripts/test-relay-token.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const RT = require(path.join(REPO, 'src/relay-token.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const NOW = Date.UTC(2026, 9, 20, 8, 0, 0);
const forms = (v) => { const b = Buffer.from(String(v)); return [String(v), b.toString('hex'), b.toString('base64'), b.toString('base64url'), String(v).slice(5, 25)]; };
const leaks = (text, tok) => forms(tok).some((f) => f && String(text).includes(f));

console.log('① mint / rotate / revoke');
const a = RT.mint({ randomBytes: crypto.randomBytes, now: NOW, label: 'my-hub' });
const b = RT.mint({ randomBytes: crypto.randomBytes, now: NOW, label: 'my-hub' });
ok(RT.ID_RE.test(a.instanceId) && RT.TOKEN_RE.test(a.token) && a.token.startsWith('vsrt_') && a.token.length === 48, 'a minted record: vi-<12 hex> + vsrt_<43 base64url> (32 random bytes)', a);
ok(a.instanceId !== b.instanceId && a.token !== b.token, 'two mints share nothing (the id is random — a hostname is neither unique nor stable)');
ok(a.mintedAt === NOW && a.rotatedAt === null && a.revokedAt === null && JSON.stringify(a.prefixes) === JSON.stringify(['pf-', 'vibespace-instance']) && Array.isArray(a.subdomains) && !a.subdomains.length, 'its fields: mintedAt, no rotation, not revoked, the hub\'s proxy-name prefixes, no subdomain yet');
let seen = 0;
const counted = (n) => { seen = n; return crypto.randomBytes(n); };
RT.mint({ randomBytes: counted, now: NOW, label: 'x' });
ok(seen === 32, 'the token is 32 random bytes (the LAST draw of a mint; the id is 6)', seen);
const r = RT.rotate(a, { randomBytes: crypto.randomBytes, now: NOW + 1 });
ok(r.instanceId === a.instanceId && r.token !== a.token && r.rotatedAt === NOW + 1 && r.label === a.label, 'rotate: a new token, the SAME id (owner Q3: the names follow the id)');
const v = RT.revoke(r, { now: NOW + 2 });
ok(v.instanceId === a.instanceId && v.token === null && v.revokedAt === NOW + 2, 'revoke: the token forgotten, the id and its names kept');
const back = RT.rotate(v, { randomBytes: crypto.randomBytes, now: NOW + 3 });
ok(back.instanceId === a.instanceId && RT.TOKEN_RE.test(back.token) && back.revokedAt === null, 'a revoked record comes back by a rotation (same id, new token)');
ok(RT.withSub(a, 'vs12345abcde').subdomains[0] === 'vs12345abcde' && RT.withSub(RT.withSub(a, 'vs12345abcde'), 'vs12345abcde').subdomains.length === 1 && RT.withSub(a, 'Bad Name!').subdomains.length === 0, 'withSub keeps a relay-shaped subdomain once (a bad shape is ignored)');
let many = a; for (let i = 0; i < 80; i++) many = RT.withSub(many, 'vs' + String(i).padStart(4, '0'));
ok(many.subdomains.length === RT.SUBS_MAX && many.subdomains[RT.SUBS_MAX - 1] === 'vs0079', 'the kept subdomains are bounded (the newest SUBS_MAX)');

console.log('② parse: every bad shape ⇒ null');
ok(JSON.stringify(RT.parse(RT.serialize(a))) === JSON.stringify(a) && JSON.stringify(RT.parse(RT.serialize(v))) === JSON.stringify(v), 'serialize ∘ parse = identity (a live and a revoked record)');
const bad = [
  ['not json', '{x'], ['an array', '[]'], ['another version', { ...a, v: 2 }], ['a bad id', { ...a, instanceId: 'vi-XYZ' }], ['a hostname id', { ...a, instanceId: 'my-host' }],
  ['a short token', { ...a, token: 'vsrt_abc' }], ['a token without the prefix', { ...a, token: 'x'.repeat(48) }], ['a label with a space', { ...a, label: 'my hub' }],
  ['a label with a quote', { ...a, label: 'a"b' }], ['revoked yet holding a token', { ...a, revokedAt: NOW }], ['no token yet not revoked', { ...a, token: null }],
  ['no mintedAt', { ...a, mintedAt: null }], ['empty prefixes', { ...a, prefixes: [] }], ['a prefix with a dot', { ...a, prefixes: ['a.b'] }], ['a bad subdomain', { ...a, subdomains: ['UP'] }],
  ['too many subdomains', { ...a, subdomains: Array.from({ length: 65 }, (_, i) => 'vs' + String(i).padStart(4, '0')) }], ['null', null],
];
for (const [what, x] of bad) ok(RT.parse(typeof x === 'string' ? x : JSON.stringify(x)) === null, `${what} ⇒ null`);
ok(!('extra' in (RT.parse({ ...a, extra: 'x' }) || {})), 'unknown fields are not carried (the named fields only)');

console.log('③ the registration line — the token\'s sha256 only');
const line = RT.registrationLine(a, sha256);
ok(line === `relay-admin add ${a.instanceId} ${sha256(a.token)} my-hub` && !leaks(line, a.token), 'add: `relay-admin add <id> <sha256(token)> <label>` — no form of the token', line);
ok(RT.registrationLine(r, sha256, 'rotate') === `relay-admin rotate ${r.instanceId} ${sha256(r.token)}` && RT.registrationLine(v, sha256, 'revoke') === `relay-admin revoke ${v.instanceId}`, 'rotate / revoke lines (the revoke names the id only)');
ok(RT.registrationLine(v, sha256, 'add') === '' && RT.registrationLine(a, () => 'not-a-hash') === '' && RT.registrationLine(null, sha256) === '', 'no line without a token, a real digest, or a record');
// RED control: the same judge over a builder that leaks (the mutant a careless edit would write) — caught
const mutantLine = (rec) => `relay-admin add ${rec.instanceId} ${rec.token} ${rec.label}`;
const mutantPrefix = (rec) => `relay-admin add ${rec.instanceId} ${sha256(rec.token)} ${rec.label} # ${rec.token.slice(5, 25)}`;
ok(leaks(mutantLine(a), a.token) && leaks(mutantPrefix(a), a.token), 'RED control: a line carrying the token (whole, or a 20-char piece) is caught by the same judge');

console.log('④ the label is shell-safe');
for (const [raw, want] of [['my hub; rm -rf /', 'my-hub-rm-rf'], ['$(curl evil)', 'curl-evil'], ['`id`', 'id'], ['"quoted"', 'quoted'], ['', 'vibespace'], ['  ', 'vibespace'], ['ünïcødé', 'n-c-d'], ['a'.repeat(90), 'a'.repeat(60)]]) {
  const l = RT.labelOf(raw);
  ok(RT.LABEL_RE.test(l) && !/[\s;$`"'()|&<>\\]/.test(l), `labelOf(${JSON.stringify(raw).slice(0, 30)}) = ${l} (no space, no shell metacharacter)`, l);
}
ok(RT.mint({ randomBytes: crypto.randomBytes, now: NOW, label: 'x; reboot' }).label === 'x-reboot', 'mint sanitizes the label it is given');

console.log('⑤ identityOf: the cluster\'s env > the record > none');
const env0 = {};
ok(RT.identityOf({ rec: null, env: env0 }).kind === 'none' && RT.identityOf({ rec: null, env: env0 }).token === '', 'no record, no cluster token ⇒ none (the shared token is the only key — the old relay)');
const ia = RT.identityOf({ rec: a, env: env0 });
ok(ia.kind === 'instance' && ia.user === a.instanceId && ia.token === a.token && ia.prefixes.join() === a.prefixes.join(), 'a record ⇒ instance: user = its id, its token (memory only)');
ok(RT.identityOf({ rec: v, env: env0 }).kind === 'revoked' && RT.identityOf({ rec: v, env: env0 }).token === '', 'a revoked record ⇒ revoked, no token (the hub never falls back by itself)');
const CT = ['vsrt_', 'c'.repeat(43)].join('');
const ic = RT.identityOf({ rec: a, env: { [RT.CLUSTER_TOKEN_ENV]: CT, VIBESPACE_INSTANCE_NAME: 'Alice' } });
ok(ic.kind === 'cluster' && ic.user === 'alice' && ic.token === CT, 'a pod: the cluster\'s token + its own name (lowercased) — over any record (owner Q2: one cluster row)');
ok(RT.identityOf({ rec: null, env: { [RT.CLUSTER_TOKEN_ENV]: CT } }).kind === 'cluster-unnamed' && RT.identityOf({ rec: null, env: { [RT.CLUSTER_TOKEN_ENV]: CT, VIBESPACE_INSTANCE_NAME: 'vi-0123456789ab' } }).kind === 'cluster-unnamed', 'a pod without a name — or named like an instance id — has no identity (the two namespaces never meet)');
ok(RT.clusterUserOf('Bob_Smith.dev') === 'bob-smith-dev' && RT.clusterUserOf('') === null && RT.clusterUserOf('vi-0123456789ab') === null, 'clusterUserOf: a pod name → a relay user');

console.log('⑥ frpcLines — the env template, never the value');
const fl = RT.frpcLines(ia);
ok(fl[0] === `user = "${a.instanceId}"` && fl[1] === 'metadatas.token = "{{ .Envs.VIBESPACE_RELAY_TOKEN }}"' && !leaks(fl.join('\n'), a.token), 'user = <id> + metadatas.token = {{ .Envs.VIBESPACE_RELAY_TOKEN }}', fl);
ok(RT.frpcLines(RT.identityOf({ rec: null, env: env0 })).length === 0 && RT.frpcLines(RT.identityOf({ rec: v, env: env0 })).length === 0, 'none / revoked ⇒ no identity lines');

console.log('⑥b relayEnv — frpc\'s env is BUILT, never the hub\'s inherited');
{
  const rnd = () => crypto.randomBytes(8).toString('hex');
  // the hub's env as an agent conversation's shell leaves it (values built now): session tokens, the cluster's shared token,
  // cloud keys, proxies, a loader hook — and stale relay variables (never taken from it)
  const KEPT = { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', TMPDIR: '/tmp/x', http_proxy: 'http://proxy.example.invalid:3128' };
  const DROPPED = {
    HOME: '/home/someone', USER: 'someone', CLAUDE_CODE_MESSAGING_TOKEN: 'cc-msg-' + rnd(), CLAUDE_CODE_OAUTH_TOKEN: 'cc-oauth-' + rnd(), CLAUDE_CODE_ENTRYPOINT: 'cli',
    VIBESPACE_SESSION_TOKEN: 'vs-sess-' + rnd(), VIBESPACE_FRPS_TOKEN: 'frps-' + rnd(), [RT.CLUSTER_TOKEN_ENV]: 'cluster-' + rnd(), VIBESPACE_INSTANCE_NAME: 'pod-a',
    AWS_ACCESS_KEY_ID: 'AKIA' + rnd(), AWS_SECRET_ACCESS_KEY: 'aws-' + rnd(), AWS_SESSION_TOKEN: 'aws-sess-' + rnd(), ANTHROPIC_API_KEY: 'sk-ant-' + rnd(),
    HTTP_PROXY: 'http://u:' + rnd() + '@proxy.example.invalid:3128', HTTPS_PROXY: 'http://u:' + rnd() + '@proxy.example.invalid:3128', ALL_PROXY: 'socks5://proxy.example.invalid:1080', no_proxy: 'localhost',
    NODE_OPTIONS: '--require /tmp/hook.js', LD_PRELOAD: '/tmp/hook.so', SSH_AUTH_SOCK: '/tmp/agent.sock',
    [RT.TOKEN_ENV]: 'vsrt_stale-' + rnd(), [RT.KNOCK_ENV]: 'stale-knock-' + rnd(),
  };
  const base = { ...KEPT, ...DROPPED };
  const TOK = RT.mint({ randomBytes: crypto.randomBytes, now: NOW, label: 'x' }).token, KN = 'knock-' + rnd();
  const keys = (e) => Object.keys(e || {}).sort();
  /** the table every implementation is judged by → the rows it fails */
  const judge = (fn) => {
    const bad = [], row = (n, c) => { if (!c) bad.push(n); };
    let e1, e2, e3, e4;
    try { e1 = fn(base, { token: TOK, knock: KN }); e2 = fn(base, { token: TOK, knock: '' }); e3 = fn(base, {}); e4 = fn(null, { token: TOK }); } catch (e) { return ['threw: ' + e.message]; }
    row('the grace: exactly the kept names + the instance token + the knock', JSON.stringify(keys(e1)) === JSON.stringify([...Object.keys(KEPT), RT.TOKEN_ENV, RT.KNOCK_ENV].sort()));
    row('the kept values as the hub had them, the tokens as handed in (never the stale ones in its env)', Object.entries(KEPT).every(([k, v]) => e1[k] === v) && e1[RT.TOKEN_ENV] === TOK && e1[RT.KNOCK_ENV] === KN);
    row('no dropped name, no dropped value', !Object.keys(DROPPED).some((k) => k in e1 && k !== RT.TOKEN_ENV && k !== RT.KNOCK_ENV) && !Object.values(DROPPED).some((v) => Object.values(e1).includes(v)));
    row('past the grace (no knock): no knock name at all', JSON.stringify(keys(e2)) === JSON.stringify([...Object.keys(KEPT), RT.TOKEN_ENV].sort()));
    row('no token handed in ⇒ no relay variable (the stale ones stay behind)', JSON.stringify(keys(e3)) === JSON.stringify(Object.keys(KEPT).sort()));
    row('no base ⇒ the token alone (a kept name is never invented)', JSON.stringify(keys(e4)) === JSON.stringify([RT.TOKEN_ENV]));
    row('a NEW object (the hub\'s env untouched)', e1 !== base && base[RT.TOKEN_ENV] === DROPPED[RT.TOKEN_ENV] && keys(base).length === keys(KEPT).length + keys(DROPPED).length);
    return bad;
  };
  const real = judge(RT.relayEnv);
  ok(real.length === 0, 'relayEnv passes the table: the kept names (PATH LANG TMPDIR http_proxy) + the instance token + the knock — none of the hub\'s session tokens, cloud keys, the cluster\'s shared token, other proxies, HOME, a loader hook', real);
  ok(JSON.stringify(RT.RELAY_ENV_KEEP) === JSON.stringify(['PATH', 'LANG', 'TMPDIR', 'http_proxy']) && Object.isFrozen(RT.RELAY_ENV_KEEP), 'the kept list is pinned (measured on frpc 0.70.0: it runs on an empty env, never reads HOME, dials through `http_proxy` — the one proxy name it reads)', RT.RELAY_ENV_KEEP);
  const spread = judge((b, o) => ({ ...b, ...RT.relayEnv(b, o) }));
  ok(spread.includes('no dropped name, no dropped value'), 'MUTANT spreads process.env under the built names ⇒ RED', spread);
  const preFix = judge((b, { token = '', knock = '' } = {}) => { const e = { ...b, [RT.KNOCK_ENV]: knock, [RT.TOKEN_ENV]: token }; delete e.VIBESPACE_FRPS_TOKEN; delete e[RT.CLUSTER_TOKEN_ENV]; return e; });
  ok(preFix.includes('no dropped name, no dropped value'), 'MUTANT the pre-fix spawn env (a copy of process.env minus two names) ⇒ RED', preFix);
}

console.log('⑦ THE NAME RULE');
const pre = { prefixes: RT.PREFIXES, user: a.instanceId };
const NAME_TABLE = [
  ['pf-local-3000', '', true], ['vibespace-instance', 'vs1234567890', true], [`${a.instanceId}.pf-host-x-8080`, '', true], [`${a.instanceId}.vibespace-instance`, '', true],
  ['canary-fwd', '', false], ['other', '', false], [`vi-999999999999.pf-x`, '', false], ['pf-x', 'UPPER', false], ['pf-x', 'a', false], ['', '', false],
];
for (const [proxyName, subdomain, want] of NAME_TABLE) {
  const got = RT.nameVerdict(pre, { proxyName, subdomain });
  ok(got.ok === want && (want || got.reason === 'name_not_yours'), `nameVerdict(${proxyName || '∅'}${subdomain ? ' · ' + subdomain : ''}) ⇒ ${want ? 'ok' : 'name_not_yours'}`, got);
}
ok(RT.strippedName(`${a.instanceId}.pf-x`, a.instanceId) === 'pf-x' && RT.strippedName('pf-x', a.instanceId) === 'pf-x' && RT.strippedName('a.b', null) === 'a.b', 'strippedName: frps\'s `<user>.` prefix off (both forms judged alike)');

console.log('⑧ the relay\'s words in frpc\'s');
const REF = [
  ['reject proxy: name_in_use:other-hub', { code: 'name_in_use', owner: 'other-hub' }], ['new proxy [x] error: name_not_yours', { code: 'name_not_yours' }],
  ['register control error: revoked', { code: 'revoked' }], ['bad_token', { code: 'bad_token' }], ['legacy_token_retired', { code: 'legacy_token_retired' }],
  ['unknown_instance', { code: 'unknown_instance' }], ['table_unreadable', { code: 'table_unreadable' }],
  ["token in login doesn't match token from configuration", { code: 'knock_refused' }], ['proxy [vi-0123456789ab.vibespace-instance] already exists', { code: 'name_live' }],
  ['port unavailable', null], ['', null],
];
for (const [t, want] of REF) ok(JSON.stringify(RT.refusalOf(t)) === JSON.stringify(want), `refusalOf(${JSON.stringify(t).slice(0, 50)}) ⇒ ${want ? want.code : 'null'}`, RT.refusalOf(t));
ok(JSON.stringify(RT.refusalOf('name_in_use:$(rm -rf)')) === JSON.stringify({ code: 'name_in_use' }) && JSON.stringify(RT.refusalOf('name_in_use:ab$c')) === JSON.stringify({ code: 'name_in_use' }), 'an owner label outside the shell-safe shape is never taken (the conflict still is)', RT.refusalOf('name_in_use:ab$c'));
const LOG = [
  '2026-10-20 08:00:00.000 [I] [client/service.go:295] try to connect to server...',
  '2026-10-20 08:00:00.100 [E] [client/service.go:301] register control error: bad_token',
  '2026-10-20 08:00:00.101 [W] [client/service.go:302] connect to server error: bad_token',
].join('\n');
ok(JSON.stringify(RT.loginOf(LOG)) === JSON.stringify({ ok: false, code: 'bad_token' }), 'loginOf: the newest failed login names its reason', RT.loginOf(LOG));
ok(JSON.stringify(RT.loginOf(LOG + '\n2026-10-20 08:00:10.000 [I] [client/service.go:310] login to server success, get run id [abc]')) === JSON.stringify({ ok: true }), 'loginOf: a later success wins');
ok(RT.loginOf('[I] start proxy success') === null && RT.loginOf('') === null, 'loginOf: no login event ⇒ null');
ok(JSON.stringify(RT.loginOf("[W] connect to server error: token in login doesn't match token from configuration")) === JSON.stringify({ ok: false, code: 'knock_refused' }), 'loginOf: frps refusing the SHARED token is `knock_refused` (the relay emptied its auth.token)');
const al = RT.alertOf({ code: 'name_in_use', owner: 'other-hub' }, { name: 'vs1234567890' });
ok(al && al.text === 'The public name vs1234567890 is held by “other-hub” on the relay' && al.i18n.text.params.owner === 'other-hub' && Array.isArray(al.i18n.detail) && !leaks(JSON.stringify(al), a.token), 'alertOf name_in_use: the name + the owner, i18n lines, never a token', al && al.text);
ok(RT.alertOf({ code: 'name_not_yours' }, { name: 'pf-x' }).text.includes('pf-x') && RT.alertOf({ code: 'bad_token' }) === null && RT.alertOf(null) === null, 'alertOf: the two name refusals only (a login refusal is the card\'s, not the tray\'s)');

console.log('⑧b the run\'s log — a login is no proof; a drop is a RATE and an OUTCOME (lane frp-token-proof, r2)');
{
  // frpc 0.70.0 AT INFO LEVEL WITH tcpMux (its heartbeat off — the plugin's frpc.toml): a control the relay closes is logged at
  // Debug only («control message dispatcher exited»); the redial logs `try to connect to server...` + `login to server success`
  // at its backoff (3 fast retries ~200 ms apart in the first minute, then 1 s doubling to 20 s). frpc's clock is the machine's
  // local time (PDT on 10-30); the hub's is UTC here — the file's mtime ties them.
  const T0 = Date.UTC(2026, 9, 30, 12, 0, 5);   // 05:00:05 PDT: the boot replay starts frpc with the vault LOCKED
  const local = (ms) => new Date(ms - 7 * 3600e3).toISOString().replace('T', ' ').slice(0, 23);
  const login = (ms) => `${local(T0 + ms)} [I] [client/service.go:308] try to connect to server...\n${local(T0 + ms + 9)} [I] [client/service.go:328] [9f2146966359774] login to server success, get run id [9f2146966359774]`;
  const started = (ms, name = 'vibespace-instance') => `${local(T0 + ms)} [I] [client/control.go:165] [9f2146966359774] [vi-x.${name}] start proxy success`;
  // THE INCIDENT'S TRANSCRIPT (the forensic verdict: frps logged «client exit success» 16 ms after each login, every 1–20 s; frpc
  // logged the logins and nothing else — 2459 of them by the unlock, 0 «start proxy success»)
  const INC = [1010, 1240, 1450, 1710, 2800, 4900, 9000, 17100, 33300, 53500, 73600, 93800];
  const INCIDENT = INC.map(login).join('\n');
  const AT = T0 + 93800 + 9;   // the file's mtime: its newest line written
  const runOf = typeof RT.runOf === 'function' ? RT.runOf : () => null, droppedOf = typeof RT.droppedOf === 'function' ? RT.droppedOf : () => null;
  const r = runOf(INCIDENT, null, { at: AT }) || {};
  ok(r.logins === 12 && r.proxies === 0 && r.unanswered === 12 && Array.isArray(r.recent) && r.recent.length === Math.min(12, RT.RECENT_KEEP || 0), 'runOf over the incident\'s transcript: 12 logins, 0 proxies started, 12 since the relay last answered a NewProxy (their times kept, ≤ RECENT_KEEP)', r);
  ok(r.since === T0 + 1019 && r.recent[r.recent.length - 1] === AT, 'the log\'s own clock (PDT) maps onto the hub\'s by the file\'s mtime — whatever frpc\'s time zone', { since: r.since, want: T0 + 1019 });
  const tried = T0 + 2500;   // the boot replay's publish tried ONE NewProxy 2.5 s after the start — never answered
  ok(droppedOf(r, { knock: false, triedAt: tried, now: AT + 5e3 }) === true, 'THE DROPPED LOGIN: no shared token, a publish WANTED and never answered, 3 logins within 60 s since the relay last answered, frpc still redialling ⇒ dropped');
  ok(droppedOf(r, { knock: false, triedAt: null, now: AT + 5e3 }) === false, '…no publish wanted (nothing tried) ⇒ not judged — the OUTCOME is part of the verdict');
  ok(droppedOf(r, { knock: false, triedAt: tried, now: AT + RT.DROP_QUIET + 1 }) === false, '…frpc stopped redialling for DROP_QUIET (a dropped frpc redials ≤ 20 s apart; one that holds its control logs nothing) ⇒ over');
  ok(droppedOf(r, { knock: true, triedAt: tried, now: AT }) === false && droppedOf(runOf(`${login(1010)}\n${login(1240)}`, null, { at: T0 + 1249 }), { knock: false, triedAt: T0 + 1300, now: T0 + 2e3 }) === false, 'a frpc that SENDS the shared token is never judged here; two logins are not yet a pattern (DROP_LOGINS = 3)');
  ok(JSON.stringify(RT.loginOf(INCIDENT)) === JSON.stringify({ ok: true }), '…while loginOf — the newest login event — still reads «ok»: a login is no proof (the hub took this as «the relay no longer asks»)', RT.loginOf(INCIDENT));
  // THE LATCH (acceptance r1, finding 1): a HEALTHY relay, a proxy-less frpc without the token that reconnected twice SILENTLY
  const l = runOf([login(1000), login(400000), login(400300)].join('\n'), null, { at: T0 + 400309 }) || {};
  ok(l.unanswered === 3 && droppedOf(l, { knock: false, triedAt: null, now: T0 + 401e3 }) === false, 'THE LATCH: a healthy proxy-less frpc, 2 silent reconnects (3 logins in a row), nothing tried yet ⇒ NOT dropped (r1 refused every publish here, for the rest of the run)', l);
  const l2 = runOf(started(401000, 'pf-__local__-4000'), l, { at: T0 + 401000 }) || {};
  ok(l2.proxies === 1 && l2.unanswered === 0 && l2.answeredAt === T0 + 401000 && droppedOf(l2, { knock: false, triedAt: T0 + 400500, now: T0 + 402e3 }) === false, '…its publish TRIES one NewProxy and the relay answers (start proxy success) ⇒ no episode', l2);
  const e = runOf(`${local(T0 + 401000)} [W] [client/control.go:163] [9f2146966359774] [vi-x.pf-__local__-4000] start error: port already used`, l, { at: T0 + 401000 }) || {};
  ok(e.proxies === 0 && e.unanswered === 0 && droppedOf(e, { knock: false, triedAt: T0 + 400500, now: T0 + 402e3 }) === false, 'a REFUSED NewProxy is an answer too (the relay read the frame: its control is keyed right) ⇒ not dropped', e);
  // THE RATE: logins far apart are no flap
  const SLOW = ['2026-10-20', '2026-10-24', '2026-10-29'].map((d) => `${d} 08:00:00.000 [I] [client/service.go:328] [a] login to server success, get run id [a]`).join('\n');
  const sl = runOf(SLOW, null, { at: Date.UTC(2026, 9, 29, 15) }) || {};
  ok(sl.unanswered === 3 && droppedOf(sl, { knock: false, triedAt: Date.UTC(2026, 9, 29, 15), now: Date.UTC(2026, 9, 29, 15, 0, 5) }) === false, 'THE RATE: 3 logins over 9 days with a try unanswered ⇒ not dropped (r1 judged it so: a count with no time)', sl);
  const sp = runOf([login(1000), login(70000), login(140000)].join('\n'), null, { at: T0 + 140009 }) || {};
  ok(droppedOf(sp, { knock: false, triedAt: T0 + 2e3, now: T0 + 141e3 }) === false && droppedOf(runOf(login(141000), sp, { at: T0 + 141009 }), { knock: false, triedAt: T0 + 2e3, now: T0 + 142e3 }) === false, 'logins more than DROP_WINDOW (60 s) apart, three or four of them ⇒ not dropped');
  // HEALTHY RECONNECTS: two reconnects, a proxy that ran after each (frpc re-sends its proxies on every new control) ⇒ silent
  const hh = runOf([login(6000), started(6100), login(400000), started(400100), login(400300), started(400400)].join('\n'), null, { at: T0 + 400400 }) || {};
  ok(hh.logins === 3 && hh.proxies === 3 && hh.unanswered === 0 && droppedOf(hh, { knock: false, triedAt: T0 + 5e3, now: T0 + 401e3 }) === false, 'HEALTHY reconnects (two, a proxy that ran) ⇒ never dropped', hh);
  // an episode that ENDS: the incident, then the relay answers
  const end = runOf(started(94000), r, { at: T0 + 94000 }) || {};
  ok(end.unanswered === 0 && droppedOf(end, { knock: false, triedAt: tried, now: T0 + 95e3 }) === false, 'a proxy that runs ends the episode (the relay answered after the try)', end);
  const half = INCIDENT.split('\n');
  const h1 = runOf(half.slice(0, 10).join('\n'), null, { at: T0 + 2809 });
  const h2 = runOf(half.slice(10).join('\n'), h1, { at: AT });
  ok(!!h2 && JSON.stringify(h2) === JSON.stringify(r), 'runOf reads FORWARD: two halves (each dated by its own mtime) = the whole (the hub reads new bytes only)', h2);
  const a = typeof RT.droppedAlertOf === 'function' ? RT.droppedAlertOf({ logins: 2459, since: Date.parse('2026-10-30T12:00:05Z'), why: 'locked' }) : null;
  ok(!!a && a.text === 'The relay accepts this instance\'s login but closes the connection right after (2459 logins since 2026-10-30 12:00Z, no proxy started)', 'the owner\'s words: «the relay accepts this instance\'s login but closes the connection right after (N logins since <time>, no proxy started)»', a && a.text);
  ok(!!a && /still requires the shared relay token, and this frpc runs without it because the vault was locked when it started\. Unlock the vault with the second password, or set the relay token again in Plugins › Public URLs\./.test(a.detail) && !/DNS|domain|public port/.test(a.text + a.detail + a.message), '…why and what to do (unlock the vault with the second password, or set the relay token again) — never «DNS» nor «a public port»', a && a.detail);
  ok(!!a && a.i18n.text.key === RT.DROPPED_TEXT && a.i18n.text.params.n === 2459 && a.i18n.detail[0].key === RT.DROPPED_DETAIL.locked && /^the relay accepts/.test(a.message), 'the item\'s i18n carries the key + its params; the publish error is the same words in one sentence', a && a.i18n);
  const none = RT.droppedAlertOf ? RT.droppedAlertOf({ logins: 3, since: 0, why: 'none' }) : null, off = RT.droppedAlertOf ? RT.droppedAlertOf({ logins: 3, since: 0, why: 'off' }) : null;
  ok(!!none && /holds none/.test(none.detail) && !!off && /taken to no longer ask/.test(off.detail) && /since \?/.test(none.text), 'the other two causes say their own why (no token held · one held but not sent); an unknown start reads «?»', [none && none.detail, off && off.detail]);
  const ra = typeof RT.retiredAlertOf === 'function' ? RT.retiredAlertOf({ entry: 'frp:token', at: Date.parse('2026-10-30T12:00:11Z') }) : null;
  ok(!!ra && ra.text === 'The shared relay token (frp:token) left this instance' && /ran on a frpc started without it \(2026-10-30 12:00Z\)/.test(ra.detail) && /set the relay token again/.test(ra.detail), 'A DROP IS SAID: the retirement\'s words name the entry and why', ra);
}

console.log('⑨ CENSUS');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
const src = walk(path.join(REPO, 'src')).map((f) => [path.relative(REPO, f), fs.readFileSync(f, 'utf8')]);
src.push(['server.js', fs.readFileSync(path.join(REPO, 'server.js'), 'utf8')]);
const spelled = src.filter(([, t]) => t.includes('VIBESPACE_RELAY_TOKEN')).map(([f]) => f);
ok(JSON.stringify(spelled) === JSON.stringify(['src/relay-token.js']), 'the env name VIBESPACE_RELAY_TOKEN is spelled in src/relay-token.js only', spelled);
const spelledK = src.filter(([, t]) => t.includes('VIBESPACE_FRP_AUTH_TOKEN')).map(([f]) => f);
ok(JSON.stringify(spelledK) === JSON.stringify(['src/relay-token.js']), 'so is the knock\'s VIBESPACE_FRP_AUTH_TOKEN (RT.KNOCK_ENV)', spelledK);
const users = src.filter(([, t]) => /\bRT\.TOKEN_ENV\b|\.TOKEN_ENV\]/.test(t)).map(([f]) => f);
const frpSrc = fs.readFileSync(path.join(REPO, 'src/plugins/frp.js'), 'utf8');
const builders = src.filter(([, t]) => /\bRT\.relayEnv\(/.test(t)).map(([f]) => f);
ok(users.length === 0 && JSON.stringify(builders) === JSON.stringify(['src/plugins/frp.js']) && (frpSrc.match(/\bRT\.relayEnv\(/g) || []).length === 1 && /const env = RT\.relayEnv\(process\.env, \{ token: cfg\.ident\.token \|\| '', knock \}\);/.test(frpSrc), 'nobody outside src/relay-token.js puts the token under its name: the ONE frpc spawn env is RT.relayEnv(process.env, …) in src/plugins/frp.js (the toml names it through RT.frpcLines\' template)', { users, builders });
ok(!/\.\.\.process\.env\b/.test(frpSrc) && !/Object\.assign\(\s*\{\s*\}\s*,\s*process\.env/.test(frpSrc) && (frpSrc.match(/\bspawn\(/g) || []).length === 1 && /spawn\(bin, \['-c', frpConf\(\)\], \{[^}]*\benv \}\)/.test(frpSrc), 'src/plugins/frp.js copies process.env nowhere — its one long-lived child (frpc) is spawned with the built env', (frpSrc.match(/.*\bspawn\(.*/g) || []).join(' | '));
const rtSrc = fs.readFileSync(path.join(REPO, 'src/relay-token.js'), 'utf8');
ok(!/\brequire\s*\(/.test(rtSrc.replace(/\/\/.*$/gm, '')) && !/\bimport\b/.test(rtSrc.replace(/\/\/.*$/gm, '')), 'src/relay-token.js requires nothing (PURE — crypto handed in)');
ok(/'src\/relay-token\.js'/.test(fs.readFileSync(path.join(REPO, 'scripts/test-architecture.mjs'), 'utf8')), 'it is in test-architecture\'s PURE set');
ok(/name: 'test-relay-token', tier: 'fast'/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8')), 'this suite has its tier row');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
