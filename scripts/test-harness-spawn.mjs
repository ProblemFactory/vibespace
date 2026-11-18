#!/usr/bin/env node
// THE SPAWN PROOF (lane dc-ws-create, the 2026-10-04 decoupling plan: "a harness
// is its descriptor + ONE registration line; the core gates on DECLARED rows").
// A fake harness `acme` is registered through src/harnesses/index.js register()
// — nothing else — and a create for it runs through the REAL ws-create handler
// with the PRODUCTION adapter registry (src/adapters/index.js) down to the pty
// spawn (a stub pty: nothing executes). Its declared spawn rows (authAtSpawn,
// resumeMayFork, statusline) and its caps.pool row are what the create
// consults; src/ws-create.js and server.js never name it. MUTATION CONTROLS: a
// patched copy of ws-create with ONE literal-id branch restored (the pre-lane
// spelling) loses the fake's row — each leg can go red.
// ⑤ A THIRD-PARTY PROVIDER through the SAME real create (lane lg-providers, B-d578 U2): a REAL AccountManager + provider
// store + vault on a scratch dir, the REAL claude / codex descriptors: the key reaches the CLI's env and nothing else (not
// argv, not a frame, not a file the create wrote), the child's secret store / home is the provider's own EMPTY one (no
// login can ride along), an ambient OAuth token or key never survives, codex gets its -c table ahead of app-server; every
// refusal by name with NO spawn (vault locked, a removed provider — also on a resume, never a fall back onto the machine's
// login —, a harness it does not fit, another machine). RED controls: a codex plan that puts the key in its -c table; a
// claude plan with no secret store of its own; the create without the argv line.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

const H = require(path.join(REPO, 'src/harnesses'));
const { BackendAdapter } = require(path.join(REPO, 'src/adapters/base.js'));
const { NULL_QUOTA } = require(path.join(REPO, 'src/harnesses/null-quota.js'));
const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));

// ── the fake member: ONE descriptor object (what a plugin's harness file would export)
class AcmeAdapter extends BackendAdapter {
  constructor(cfg) { super(); this.config = cfg; }
  buildSessionArgs(o = {}) {
    return { cmd: 'acme-cli', args: ['--acme', ...(o.resumeId ? ['--resume', o.resumeId] : [])], env: { ACME_HOME: '/acme-home' }, wrapper: this.config.ptyWrapper, mode: 'terminal' };
  }
}
const acme = (id, { pool, spawnForm }) => ({
  id, label: 'Acme', kind: 'terminal',
  caps: { pool },                                            // the DECLARED pool row the create's pool gate reads
  Adapter: AcmeAdapter, adapterConfig: (cfg) => ({ ptyWrapper: cfg.ptyWrapper }),
  wrapper: null, Normalizer: null, store: null, quota: NULL_QUOTA, resume: null,
  creds: { defaultIdField: 'defaultAcmeAccountId', ...(spawnForm ? { spawnForm } : {}) },
  spawn: {
    authAtSpawn: ({ hostId }) => (hostId ? 'acme-remote' : 'acme-global'),
    resumeMayFork: true,
    statusline: (args, command) => [...args, '--acme-status', command],
  },
});

console.log('— ① the ONE registration line');
H.register(acme('acme', { pool: true }));
H.register(acme('acme-nopool', { pool: false }));
H.register(acme('acme-perseat', { pool: false, spawnForm: 'isolated-home' })); // lane antigravity-harness: named accounts, no pool
ok(H.has('acme') && !H.isBuiltin('acme'), 'register() is the whole wiring: acme is a contributed harness');
ok(capsOf('acme').pool === true && capsOf('acme-nopool').pool === false && capsOf('acme').fork === false,
  'capsOf answers the DECLARED row of a contributed harness (missing keys read the all-false row)');
const prodRegistry = createAdapterRegistry({ ptyWrapper: '/stub/pty-wrapper.js' });
ok(prodRegistry.get('acme') instanceof AcmeAdapter && prodRegistry.get('acme') === prodRegistry.get('acme'),
  'the PRODUCTION adapter registry (built before the register) resolves acme from its descriptor, once');
let threw = null; try { H.register({ id: 'acme-typo', quota: NULL_QUOTA, spawn: { otelExprot: true } }); } catch (e) { threw = e.message; }
ok(/spawn\.otelExprot is not a declared spawn row/.test(String(threw)), 'a misspelt spawn row THROWS at registration (never a silent "no")', threw);
threw = null; try { H.register({ id: 'acme-type', quota: NULL_QUOTA, spawn: { localPipe: 'yes' } }); } catch (e) { threw = e.message; }
ok(/spawn\.localPipe must be a boolean/.test(String(threw)), '…and so does a row of the wrong type', threw);
ok(!/\bacme\b/i.test(read('src/ws-create.js')) && !/\bacme\b/i.test(read('server.js')), 'src/ws-create.js and server.js never name the fake (zero core edits)');

// ── ② a create through the REAL handler, down to the (stub) pty spawn
const SOCK = scratchDir('hspawn-sock'), BUF = scratchDir('hspawn-buf'), CWD = scratchDir('hspawn-cwd');
async function drive(mod, data, extra = {}, agentEnv = () => ({})) {
  const sent = [], spawned = [], resolved = [], active = new Map();
  const accounts = {
    _state: {}, get: () => null, poolMembership: () => [],
    resolveForSpawn: (acctId, backend) => { resolved.push(backend); return null; },
    subscriptionStatus: () => ({ loggedIn: true }), cliPrimaryKey: () => ({ present: false }),
  };
  const noop = () => undefined;
  const ctx = new Proxy({
    activeSessions: active, WS_OPEN: 1, sessionCounterRef: { value: 0 },
    adapterRegistry: prodRegistry, hosts: null, accounts, os, fs, path,
    execFileSync: require('child_process').execFileSync,
    ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    SOCKETS_DIR: SOCK, BUFFERS_DIR: BUF, PTY_WRAPPER: '/stub/pty-wrapper.js', CHAT_WRAPPER: '/stub/chat-wrapper.js',
    NODE_CMD: process.execPath, DTACH_CMD: '/stub/dtach', CLAUDE_CMD: 'claude-must-not-run',
    EDITOR_CMD: '/stub/editor/code', AGENT_BIN_DIR: '/stub/bin', PORT: 1, X_ENV: {},
    cliCmds: { forSpawn: async (b, c) => c },
    USAGE_STATUSLINE_CMD: '/stub/vibespace-usage', userStatuslineCmd: () => '',
    otelEnv: () => ({ OTEL_STUB: '1' }),
    serverSetting: noop, harnessSetting: noop, harnessDeclares: () => false, harnessSpawnSettings: () => ({}),
    integrationEnabled: () => false, readSessionMeta: () => null, readLayouts: () => ({}), getSyncStore: () => null,
    pty: { spawn: (cmd, args, opts) => { spawned.push({ cmd, args, env: opts.env }); return { pid: 4242, onData() { }, onExit() { }, write() { }, resize() { }, kill() { } }; } },
    setupSessionPty: (s, id, p) => { s.pty = p; },
    ...extra,
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)) });
  const handler = mod.createWsCreateHandler({
    ctx, agentEnv, crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
    execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null,
    getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p,
  });
  await handler({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, { type: 'create', mode: 'terminal', cwd: CWD, reqId: 'r1', ...data }, new Set());
  const session = [...active.values()][0] || null;
  return { sent, spawned, resolved, session };
}

console.log('— ② a create for acme through the real ws-create handler');
const wsCreate = require(path.join(REPO, 'src/ws-create.js'));
const r = await drive(wsCreate, { backend: 'acme' });
const created = r.sent.find((m) => m.type === 'created');
ok(!!created && !r.sent.some((m) => m.type === 'error'), 'the create answers `created` — no refusal, no throw', r.sent.map((m) => m.type + (m.message ? ':' + m.message : '')));
const sp = r.spawned[0];
ok(r.spawned.length === 1 && sp.cmd === '/stub/dtach' && sp.args.includes('acme-cli') && sp.args.includes('--acme') && !sp.args.includes('claude-must-not-run'),
  'ONE pty spawn, under dtach, running the ADAPTER\'s command + args (never a claude fallthrough)', sp && sp.args.slice(-4));
ok(!!sp && sp.env && sp.env.ACME_HOME === '/acme-home' && !sp.args.some((a) => /^[A-Z_][A-Z0-9_]*=/.test(a)),
  'the adapter\'s spawn env rides the spawn\'s ENV — the line carries no NAME=value word (lane antigravity-spawn-argv)', sp && sp.args.filter((a) => /=/.test(a)).slice(-3));
ok(r.session && r.session.backend === 'acme' && r.session.mode === 'terminal', 'the live session is an acme terminal');
ok(r.session && r.session._authAtSpawn === 'acme-global', 'its global-login guess is the DECLARED spawn.authAtSpawn row', r.session && r.session._authAtSpawn);
ok(!!sp && sp.args.includes('--acme-status') && sp.args.includes('/stub/vibespace-usage'), 'the terminal statusline goes through the DECLARED spawn.statusline hook', sp && sp.args.slice(-4));
ok(r.resolved.join() === 'acme', 'caps.pool:true + managed creds ⇒ the pool/billing gate asks resolveForSpawn for acme', r.resolved);
const rn = await drive(wsCreate, { backend: 'acme-nopool' });
ok(rn.sent.some((m) => m.type === 'created') && rn.resolved.length === 0, '…and caps.pool:false skips it (the gate is the ROW, not the id)', rn.resolved);
const rps = await drive(wsCreate, { backend: 'acme-perseat' });
ok(rps.sent.some((m) => m.type === 'created') && rps.resolved.join() === 'acme-perseat', '…but caps.pool:false WITH a declared creds.spawnForm (per-session named accounts — antigravity) still asks resolveForSpawn', rps.resolved);
const rr = await drive(wsCreate, { backend: 'acme', resume: true, resumeId: 'acme-conv-1', ignoreNoConvo: true });
ok(rr.session && rr.session._resumeSpawn === true && rr.spawned[0]?.args.includes('acme-conv-1'), 'a resume carries the DECLARED spawn.resumeMayFork marker', rr.session && rr.session._resumeSpawn);

// ── ③ the controls: ONE literal-id branch restored in a patched copy ⇒ the row is lost
console.log('— ③ mutation controls (one id branch restored, from the product source)');
const src = read('src/ws-create.js');
const M = mutantCopies('harness-spawn', REPO);
const CONTROLS = [
  ['authAtSpawn', "              : typeof SP.authAtSpawn === 'function' ? SP.authAtSpawn({ hostId: data.hostId, accounts }) : null,",
    "              : backend !== 'claude' ? null : data.hostId ? 'remote-global' : 'subscription',",
    (x) => x.session && x.session._authAtSpawn === 'acme-global'],
  ['pool gate', "          if (harness && harness.creds && accounts && (capsOf(backend).pool || !!harness.creds.spawnForm)) {",
    "          if ((backend === 'claude' || backend === 'codex') && accounts) {",
    (x) => x.resolved.join() === 'acme'],
  ['statusline', "          if (typeof SP.statusline === 'function' && sessionMode === 'terminal' && !data.hostId && USAGE_STATUSLINE_CMD) {",
    "          if (backend === 'claude' && typeof SP.statusline === 'function' && sessionMode === 'terminal' && !data.hostId && USAGE_STATUSLINE_CMD) {",
    (x) => !!x.spawned[0] && x.spawned[0].args.includes('--acme-status'), 'src/spawn/local.js'],
];
// A gate that moved into a transport ladder (lane dc-seams-server: the local statusline lives in src/spawn/local.js)
// is patched in a CLOSED WORLD: the ladder copy, a registry copy requiring it, a ws-create copy requiring that registry.
const closedWorld = (file, patched, tag) => {
  const member = M.write(file, patched, tag + '-member');
  const reg = M.write('src/spawn/index.js', read('src/spawn/index.js').replace(`require('./${path.basename(file, '.js')}')`, `require(${JSON.stringify(member)})`), tag + '-registry');
  return M.load('src/ws-create.js', src.replace("require('./spawn')", `require(${JSON.stringify(reg)})`), tag);
};
for (const [name, line, old, judge, file = 'src/ws-create.js'] of CONTROLS) {
  const fsrc = read(file);
  ok(fsrc.split(line).length === 2, `control ${name}: the gate is one identifiable line in the product source (${file})`);
  ok(judge(r), `control ${name}: the shipped gate passes the fake's row`);
  const mut = file === 'src/ws-create.js' ? M.load(file, src.replace(line, old), name.replace(/\W+/g, '-')) : closedWorld(file, fsrc.replace(line, old), name.replace(/\W+/g, '-'));
  const x = await drive(mut, { backend: 'acme' });
  ok(x.sent.some((m) => m.type === 'created') && !judge(x), `control ${name}: with the id branch restored the fake's declared row is LOST (the leg above can go red)`);
}

// ── ④ THE SPAWN-LADDER SEAM (lane dc-seams-server, decoupling wave 2b): a machine transport = src/spawn/<id>.js +
// ONE line in src/spawn/index.js. A FAKE transport `acme-link` added by one line in a scratch copy of the registry
// gets a remote create through the real ws-create code (the copy differs only in where `./spawn` resolves); the
// pre-lane dispatch (`h.transport === 'dial' ? dial : ssh`) restored in a copy never reaches it.
console.log('— ④ the spawn-ladder seam: a fake transport through ONE registration line');
{
  const SPW = require(path.join(REPO, 'src/spawn/index.js'));
  ok(SPW.spawnFor(null).hostless === true && SPW.spawnFor({ name: 'old ssh record' }).hostDefault === true
    && SPW.spawnFor({ transport: 'no-such-transport' }).hostDefault === true && SPW.spawnFor({ transport: 'dial' }).id === 'dial',
    'spawnFor: no host ⇒ the hostless member; a record naming no (or an unknown) transport ⇒ the hostDefault member (the old else-branch); a declared one ⇒ itself');
  const throws = (list) => { try { SPW.check(list); return false; } catch { return true; } };
  const stub = { terminal() { }, chat() { } };
  ok(throws([...SPW.TRANSPORTS, { id: 'x2', hostless: true, ...stub }]) && throws([...SPW.TRANSPORTS, { id: 'x3', terminal() { } }])
    && throws([...SPW.TRANSPORTS, { ...SPW.TRANSPORTS[1] }]) && !throws(SPW.TRANSPORTS),
    'NEGATIVE CONTROL: the registry refuses a second hostless member, a member without chat(c), a duplicate id');
  const wsc = read('src/ws-create.js');
  ok(!/\.transport\s*[!=]==?/.test(wsc) && /spawnFor\(h\)\.terminal\(/.test(wsc) && /spawnFor\(h\)\.chat\(/.test(wsc) && /spawnFor\(null\)\[sessionMode\]\(/.test(wsc),
    'ws-create names no transport: every ladder is asked through spawnFor (terminal, chat, this machine; the pool facts\' transport = the member id)');
  globalThis.__acmeLinkCalls = [];
  const ACME_LINK = `module.exports = {
  id: 'acme-link',
  terminal: async (c) => { globalThis.__acmeLinkCalls.push({ mode: 'terminal', host: c.h.id, cwd: c.cwd });
    c.session.host = c.h.id; c.session.hostName = c.h.name;
    return { spawnCmd: 'acme-link-cli', spawnArgs: ['--to', c.h.id, ...c.spawnArgs], spawnEnvPairs: [], spawnCwd: c.cwd }; },
  chat: async (c) => { globalThis.__acmeLinkCalls.push({ mode: 'chat', host: c.h.id }); return null; },
};
`;
  const member = M.write('src/spawn/acme-link.js', ACME_LINK, 'acme-link');
  const regSrc = read('src/spawn/index.js');
  const anchor = "  require('./dial'),\n";
  const regMut = regSrc.replace(anchor, anchor + `  require(${JSON.stringify(member)}),\n`);
  const added = regMut.split('\n').filter((l) => !regSrc.split('\n').includes(l));
  ok(regSrc.split(anchor).length === 2 && added.length === 1 && regMut.split('\n').length === regSrc.split('\n').length + 1,
    'the registration is ONE added line in the registry copy', added);
  const reg = M.write('src/spawn/index.js', regMut, 'acme-registry');
  const viaReg = (code) => code.replace("require('./spawn')", `require(${JSON.stringify(reg)})`);
  const hostsStub = new Proxy({ get: (id) => ({ id, name: 'Acme box', transport: 'acme-link' }) }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? () => undefined : undefined)) });
  const mod = M.load('src/ws-create.js', viaReg(src), 'acme-link-create');
  const x = await drive(mod, { backend: 'acme', hostId: 'host-acme-1' }, { hosts: hostsStub });
  const sp0 = x.spawned[0];
  ok(globalThis.__acmeLinkCalls.length === 1 && globalThis.__acmeLinkCalls[0].mode === 'terminal' && globalThis.__acmeLinkCalls[0].host === 'host-acme-1',
    'a terminal create on an acme-link host runs the acme-link ladder (once, with the host record)', globalThis.__acmeLinkCalls);
  ok(x.sent.some((m) => m.type === 'created') && !!sp0 && sp0.cmd === '/stub/dtach' && sp0.args.includes('acme-link-cli') && sp0.args.includes('host-acme-1'),
    'its spawn line is what the SHARED tail spawns (dtach → the wrapper → acme-link-cli --to <host>), and the create answers created', sp0 && sp0.args.slice(-6));
  ok(x.session && x.session.host === 'host-acme-1', 'the live session is on the acme-link host');
  const y = await drive(mod, { backend: 'claude', hostId: 'host-acme-1', mode: 'chat' }, { hosts: hostsStub }); // a chat needs a normalizer: the real claude one
  ok(globalThis.__acmeLinkCalls.length === 2 && globalThis.__acmeLinkCalls[1].mode === 'chat' && y.spawned.length === 0 && !y.session,
    'a chat create asks the same member\'s chat(c); its "answered the socket" (nothing) ends the create with NO spawn', { calls: globalThis.__acmeLinkCalls.length, spawned: y.spawned.length });
  globalThis.__acmeLinkCalls = [];
  const pre = "const sp = await spawnFor(h).terminal(ladderCtx({ h, shq }));";
  ok(src.split(pre).length === 2, 'control: the terminal dispatch is one identifiable line');
  const old = viaReg(src).replace(pre, "const sp = await (h.transport === 'dial' ? require('./spawn/dial') : require('./spawn/ssh')).terminal(ladderCtx({ h, shq }));");
  let z; try { z = await drive(M.load('src/ws-create.js', old, 'acme-link-preseam'), { backend: 'acme', hostId: 'host-acme-1' }, { hosts: hostsStub }); } catch (e) { z = { threw: e.message, spawned: [] }; }
  ok(globalThis.__acmeLinkCalls.length === 0 && !(z.spawned[0] && z.spawned[0].args.includes('acme-link-cli')),
    'CONTROL: the pre-lane dispatch restored (dial-or-ssh) never reaches the registered member — the leg above can go red', z.threw || (z.sent || []).map((m) => m.type));
  delete globalThis.__acmeLinkCalls;
}

// ── ⑤ A THIRD-PARTY PROVIDER through the real create (lane lg-providers, B-d578 U2) ──
console.log('— ⑤ a third-party provider account through the real ws-create handler');
{
  const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
  const PS = require(path.join(REPO, 'src/server/provider-store.js'));
  const PSP = require(path.join(REPO, 'src/server/provider-spawn.js'));
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const MP = require(path.join(REPO, 'src/model-providers.js'));
  const DATA = scratchDir('hspawn-pv');
  const vault = VE.create({ dataDir: DATA, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
  const PW = 'correct horse battery staple';
  await vault.setup(PW, {});
  const store = PS.create({ dataDir: DATA, vault: () => vault, log: () => {} });
  const KEY = ['sk-', 'prov', 'ider-', 'spawn-', 'e4c1d2'].join('');   // built at runtime (never a token-shaped literal)
  const ds = (await store.add({ preset: 'deepseek', key: KEY })).provider;   // the store's acts await the store writer (lane lg-providers U1 cure (C))
  const lab = (await store.add({ preset: 'other', key: KEY, baseUrl: 'http://127.0.0.1:9/v1', model: 'qwen3-coder', label: 'Lab', wire: 'openai-responses' })).provider;   // the person said it speaks Responses (a self-hosted one fits by that)
  const am = new AccountManager({ dataDir: DATA });
  am.setProviderLookup((a) => store.forAccount(a));
  const wire = (harnessOf) => am.setProviderSpawn(PSP.create({ providers: store, dataDir: DATA, ...(harnessOf ? { harnessOf } : {}) }), (id, be, model) => PSP.modelFor(store, id, model));
  wire();
  // the ambient values are BUILT AT RUNTIME by joining pieces (the tree's law for a value standing where a credential would — never a
  // literal, never an allow row; the push hook's scan read the literals as assigned tokens)
  const AMBIENT = () => ({ CLAUDE_CODE_OAUTH_TOKEN: ['ambient', 'oat', 'must', 'not', 'ride'].join('-'), ANTHROPIC_API_KEY: ['ambient', 'key', 'must', 'not', 'ride'].join('-'), CLAUDE_SECURESTORAGE_CONFIG_DIR: '/machine/login', VIBESPACE_PROVIDER_KEY: ['ambient', 'provider', 'key'].join('-') });
  const filesHold = (needle) => { const hits = []; const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.isFile()) { try { if (fs.readFileSync(f, 'utf8').includes(needle)) hits.push(f); } catch { } } } }; for (const d of [SOCK, BUF]) walk(d); return hits; };
  const homeC = PSP.homeOf(DATA, ds.id, 'claude');

  const c1 = await drive(wsCreate, { backend: 'claude', accountId: ds.id }, { accounts: am }, AMBIENT);
  const e1 = (c1.spawned[0] || {}).env || {};
  ok(c1.sent.some((m) => m.type === 'created') && c1.spawned.length === 1 && c1.session && c1.session._accountId === ds.id, 'claude + DeepSeek: the create answers created, ONE spawn, the session bills the provider row', c1.sent.map((m) => m.type + (m.message ? ':' + m.message : '')));
  ok(e1.ANTHROPIC_BASE_URL === 'https://api.deepseek.com/anthropic' && e1.ANTHROPIC_AUTH_TOKEN === KEY && e1.ANTHROPIC_MODEL === 'deepseek-chat' && e1.ANTHROPIC_DEFAULT_OPUS_MODEL === 'deepseek-chat' && e1.ANTHROPIC_SMALL_FAST_MODEL === 'deepseek-chat', 'the CLI\'s env: the provider\'s address, its key under the variable its auth names, every alias the CLI resolves itself on the provider\'s model (D7)', { base: e1.ANTHROPIC_BASE_URL, model: e1.ANTHROPIC_MODEL });
  ok(!('CLAUDE_CODE_OAUTH_TOKEN' in e1) && !e1.ANTHROPIC_API_KEY && e1.CLAUDE_SECURESTORAGE_CONFIG_DIR === homeC && fs.statSync(homeC).isDirectory() && fs.readdirSync(homeC).length === 0 && (fs.statSync(homeC).mode & 0o777) === 0o700, 'NO OTHER LOGIN rides along: the ambient OAuth token and Console key are gone, the secret store is the provider\'s OWN EMPTY dir (0700) — the machine\'s subscription is not reachable from this child', { store: e1.CLAUDE_SECURESTORAGE_CONFIG_DIR });
  ok(!c1.spawned[0].args.some((a) => String(a).includes(KEY)) && !JSON.stringify(c1.sent).includes(KEY) && filesHold(KEY).length === 0, 'the key is in NO argv word, NO frame the create sent, NO file it wrote (sockets / buffers / meta)', filesHold(KEY));

  const c2 = await drive(wsCreate, { backend: 'codex', mode: 'chat', accountId: lab.id }, { accounts: am }, AMBIENT);
  const s2 = c2.spawned[0] || { args: [], env: {} };
  const ai = s2.args.indexOf('app-server');
  const cItems = s2.args.slice(0, ai).filter((a, i, all) => all[i - 1] === '-c');
  const homeX = PSP.homeOf(DATA, lab.id, 'codex');
  ok(c2.sent.some((m) => m.type === 'created') && c2.spawned.length === 1 && ai > 0 && cItems.includes(`model_providers.pv_${lab.id.slice(3)}.base_url="http://127.0.0.1:9/v1"`) && cItems.includes(`model_providers.pv_${lab.id.slice(3)}.env_key="VIBESPACE_PROVIDER_KEY"`) && cItems.includes(`model_providers.pv_${lab.id.slice(3)}.wire_api="responses"`) && cItems.includes(`model_provider="pv_${lab.id.slice(3)}"`) && cItems.includes('model="qwen3-coder"'), 'codex + a self-hosted provider (chat): its -c table rides AHEAD of app-server (the provider, its address, the VARIABLE its key is in, Responses, the default model)', s2.args.slice(Math.max(0, ai - 6), ai + 1));
  ok(s2.env.VIBESPACE_PROVIDER_KEY === KEY && s2.env.CODEX_HOME === homeX && fs.lstatSync(path.join(homeX, 'sessions')).isSymbolicLink() && !fs.existsSync(path.join(homeX, 'auth.json')) && !s2.args.some((a) => String(a).includes(KEY)) && filesHold(KEY).length === 0, 'its key rides the env only (VIBESPACE_PROVIDER_KEY — the ambient copy replaced), CODEX_HOME = the provider\'s own home (sessions shared, NO auth.json: the ChatGPT login cannot ride along), nothing in argv or a file', { home: s2.env.CODEX_HOME });

  const plain = await drive(wsCreate, { backend: 'claude' }, { accounts: am }, () => ({}));
  ok(plain.spawned.length === 1 && !('ANTHROPIC_BASE_URL' in plain.spawned[0].env) && !('ANTHROPIC_AUTH_TOKEN' in plain.spawned[0].env), 'the other direction: a conversation on the machine\'s own login carries no provider address and no provider key');

  const refused = async (what, data, re, code) => { const x = await drive(wsCreate, data, { accounts: am }); const err = x.sent.find((m) => m.type === 'error'); ok(x.spawned.length === 0 && !!err && re.test(err.message) && (!code || err.code === code), `REFUSED BY NAME, nothing spawned — ${what}`, err && { message: err.message, code: err.code }); };
  vault.lock('door');
  await refused('the vault locked (the key cannot be read: it never runs without it) — the frame carries its code (the page\'s unlock door)', { backend: 'claude', accountId: ds.id }, /^the vault is locked — unlock it to start a conversation on DeepSeek/, 'vault_locked');
  await vault.unlock(PW, {});
  await refused('a harness the provider does not serve (DeepSeek under Codex)', { backend: 'codex', accountId: ds.id }, /DeepSeek does not offer what Codex needs/);
  const gone = (await store.add({ preset: 'glm', key: KEY })).provider;
  await store.remove(gone.id);
  await refused('a removed provider', { backend: 'claude', accountId: gone.id }, /unknown model provider/);
  await refused('a removed provider on a RESUME (never moved onto the machine\'s own login)', { backend: 'claude', accountId: gone.id, resume: true, resumeId: 'conv-gone-1', ignoreNoConvo: true }, /unknown model provider/);
  await refused('another machine (this train runs a provider here only)', { backend: 'claude', accountId: ds.id, hostId: 'host-box-1' }, /runs on this machine only/);

  // adversarial read r1 (MAJOR 2): THE MODEL is the provider's — another vendor's id refused, nothing ⇒ its default
  await refused('a model the provider does not serve (a ChatGPT id a resume carried)', { backend: 'claude', accountId: ds.id, model: 'gpt-5.5' }, /DeepSeek does not serve the model “gpt-5.5”/, 'model-not-served');
  const bare = (await store.add({ preset: 'other', key: KEY, baseUrl: 'http://127.0.0.1:9/v1', wire: 'anthropic-messages', label: 'Bare' })).provider;
  await refused('a provider with no model at all (never the CLI\'s own default at a third party)', { backend: 'claude', accountId: bare.id }, /Bare has no model yet/, 'model-none');
  const cm = await drive(wsCreate, { backend: 'claude', accountId: ds.id, model: 'deepseek-reasoner' }, { accounts: am });
  const cd = await drive(wsCreate, { backend: 'claude', accountId: ds.id }, { accounts: am });
  const argsOf = (x) => (x.spawned[0] || { args: [] }).args;
  const modelOf = (x) => { const a = argsOf(x); const i = a.indexOf('--model'); return i >= 0 ? a[i + 1] : null; };
  ok(modelOf(cm) === 'deepseek-reasoner' && modelOf(cd) === 'deepseek-chat' && argsOf(cd).some((a) => String(a).includes('"apiKeyHelper":""')), 'a served pick is spawned as asked; NO pick ⇒ the provider\'s default (never the instance\'s claude-* default); a machine-wide apiKeyHelper is neutralized (--settings apiKeyHelper:"") — it would outrank the provider\'s key', { picked: modelOf(cm), none: modelOf(cd) });
  // (MAJOR 3) the badge names the provider, billed by use — never «API key» / «ChatGPT»
  const badgeC = H.get('claude').billingIdentity({ _accountId: ds.id }, { accounts: am, withHost: (x) => x, poolAuth: (x) => x });
  const badgeX = H.get('codex').billingIdentity({ _accountId: lab.id }, { accounts: am, withHost: (x) => x, poolAuth: (x) => x });
  ok(badgeC.source === 'api-other' && badgeC.name === 'DeepSeek' && badgeC.tail === KEY.slice(-4) && badgeX.source === 'api-other' && badgeX.name === 'Lab', 'the badge of a provider session: its name and tail, pay-per-use (api-other) — on Claude Code AND on Codex (the first cut said «API key» / «ChatGPT»)', { badgeC, badgeX });
  // (MAJOR 4) codex's home is seeded ONCE: a real sessions folder found there (a link that once failed) keeps its transcripts
  fs.rmSync(path.join(homeX, 'sessions'), { force: true });
  fs.mkdirSync(path.join(homeX, 'sessions')); fs.writeFileSync(path.join(homeX, 'sessions', 'rollout-kept.jsonl'), '{}');
  fs.writeFileSync(path.join(homeX, 'auth.json'), '{"planted":true}');
  const c3 = await drive(wsCreate, { backend: 'codex', mode: 'chat', accountId: lab.id }, { accounts: am });
  ok(c3.spawned.length === 1 && fs.existsSync(path.join(homeX, 'sessions', 'rollout-kept.jsonl')) && !fs.existsSync(path.join(homeX, 'auth.json')), 'a later spawn never re-seeds the home: a real sessions folder keeps its transcripts; a login file found there IS removed before the spawn');
  const xk = H.get('claude').creds.providerSpawn({ provider: { auth: 'x-api-key', baseUrl: 'https://llm.example.test', models: [{ id: 'm' }], defaultModel: 'm' }, key: KEY, home: '/h' });
  ok(xk.localEnv.ANTHROPIC_API_KEY === KEY && xk.localEnv.ANTHROPIC_AUTH_TOKEN === '' && xk.localEnv.CLAUDE_CODE_USE_BEDROCK === '' && xk.localEnv.CLAUDE_CODE_USE_VERTEX === '', 'an x-api-key provider: the key in ANTHROPIC_API_KEY and the OTHER variable emptied (an ambient ANTHROPIC_AUTH_TOKEN would outrank it), the cloud switches off');
  console.log('— ⑤ RED controls');
  const CX = path.join(REPO, 'src/harnesses/codex.js'), CLD = path.join(REPO, 'src/harnesses/claude.js');
  const patched = (file, from, to) => { const t = fs.readFileSync(file, 'utf8'); if (!t.includes(from)) throw new Error('anchor missing: ' + from.slice(0, 60)); return M.load(path.relative(REPO, file), t.replace(from, to), 'pv-' + path.basename(file, '.js')); };
  const cxBad = patched(CX, '`model_providers.${t}.env_key=${q(PROVIDER_KEY_VAR)}`', '`model_providers.${t}.experimental_bearer_token=${q(key)}`');
  wire((b) => (b === 'codex' ? cxBad : H.get(b)));
  const k1 = await drive(wsCreate, { backend: 'codex', mode: 'chat', accountId: lab.id }, { accounts: am });
  ok(k1.spawned.length === 1 && k1.spawned[0].args.some((a) => String(a).includes(KEY)), 'CONTROL: a codex plan that puts the key in its -c table (experimental_bearer_token) puts it on the COMMAND LINE ⇒ the argv leg above goes RED');
  const clBad = patched(CLD, '  if (home) env.CLAUDE_SECURESTORAGE_CONFIG_DIR = home;\n', '');
  wire((b) => (b === 'claude' ? clBad : H.get(b)));
  const k2 = await drive(wsCreate, { backend: 'claude', accountId: ds.id }, { accounts: am }, AMBIENT);
  ok(k2.spawned.length === 1 && k2.spawned[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR !== homeC, 'CONTROL: a claude plan with no secret store of its own leaves the child on the MACHINE\'S store (its subscription login reachable) ⇒ the no-other-login leg goes RED', k2.spawned[0] && k2.spawned[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR);
  wire();
  const argvLine = '          if (spawnAccount && Array.isArray(spawnAccount.argv) && spawnAccount.argv.length) spawnArgs = [...spawnAccount.argv, ...spawnArgs];\n';
  ok(src.split(argvLine).length === 2, 'control: the argv line is one identifiable line of ws-create');
  const k3 = await drive(M.load('src/ws-create.js', src.replace(argvLine, ''), 'pv-noargv'), { backend: 'codex', mode: 'chat', accountId: lab.id }, { accounts: am });
  ok(k3.spawned.length === 1 && !k3.spawned[0].args.some((a) => /^model_provider=/.test(String(a))), 'CONTROL: the create without the argv line spawns codex with NO provider table (it would talk to its own vendor with the key in a variable it never reads) ⇒ the -c leg goes RED');
  const fenceLine = "          if (pvModel && !pvModel.ok) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, scope: 'action', code: pvModel.code, message: pvModel.message })); break; }\n          if (pvModel) data.model = pvModel.model;\n";
  ok(src.split(fenceLine).length === 2, 'control: the model fence is two identifiable lines of ws-create');
  const k4 = await drive(M.load('src/ws-create.js', src.replace(fenceLine, ''), 'pv-nofence'), { backend: 'claude', accountId: ds.id, model: 'gpt-5.5' }, { accounts: am });
  ok(k4.spawned.length === 1 && modelOf(k4) === 'gpt-5.5', 'CONTROL: the create without the model fence sends gpt-5.5 to DeepSeek ⇒ the not-served leg goes RED');
  const PSRC = fs.readFileSync(path.join(REPO, 'src/server/provider-spawn.js'), 'utf8');
  const seedGuard = "{ let fresh = true; try { fs.lstatSync(path.join(home, 'sessions')); fresh = false; } catch { } if (fresh) h.creds.seedDir(home); }";
  const PSPm = M.load('src/server/provider-spawn.js', PSRC.replace(seedGuard, 'h.creds.seedDir(home);'), 'pv-seed-always');
  am.setProviderSpawn(PSPm.create({ providers: store, dataDir: DATA }), (id, be, model) => PSPm.modelFor(store, id, model));
  fs.rmSync(path.join(homeX, 'sessions'), { recursive: true, force: true }); fs.mkdirSync(path.join(homeX, 'sessions')); fs.writeFileSync(path.join(homeX, 'sessions', 'rollout-kept.jsonl'), '{}');
  await drive(wsCreate, { backend: 'codex', mode: 'chat', accountId: lab.id }, { accounts: am });
  ok(!fs.existsSync(path.join(homeX, 'sessions', 'rollout-kept.jsonl')), 'CONTROL: a road that seeds the home on EVERY spawn deletes the transcripts a real sessions folder held ⇒ the seed-once leg goes RED');
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { }
}

H.unregister('acme'); H.unregister('acme-nopool'); H.unregister('acme-perseat');
for (const d of [SOCK, BUF, CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
ok(capsOf('acme').pool === false && !H.has('acme'), 'unregister() takes the contributed caps row with it');
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
