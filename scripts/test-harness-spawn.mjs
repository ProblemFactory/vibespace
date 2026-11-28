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
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
ok(gateOf(H.has('acme')) && !H.isBuiltin('acme'), 'register() is the whole wiring: acme is a contributed harness');
ok(capsOf('acme').pool === true && capsOf('acme-nopool').pool === false && capsOf('acme').fork === false,
  'capsOf answers the DECLARED row of a contributed harness (missing keys read the all-false row)');
const prodRegistry = createAdapterRegistry({ ptyWrapper: '/stub/pty-wrapper.js' });
ok(prodRegistry.get('acme') instanceof AcmeAdapter && prodRegistry.get('acme') === prodRegistry.get('acme'),
  'the PRODUCTION adapter registry (built before the register) resolves acme from its descriptor, once');
let threw = null; try { H.register({ id: 'acme-typo', quota: NULL_QUOTA, spawn: { otelExprot: true } }); } catch (e) { threw = e.message; }
ok(verdictOf(/spawn\.otelExprot is not a declared spawn row/.test(String(threw))), 'a misspelt spawn row THROWS at registration (never a silent "no")', threw);
threw = null; try { H.register({ id: 'acme-type', quota: NULL_QUOTA, spawn: { localPipe: 'yes' } }); } catch (e) { threw = e.message; }
ok(verdictOf(/spawn\.localPipe must be a boolean/.test(String(threw))), '…and so does a row of the wrong type', threw);
ok(!/\bacme\b/i.test(read('src/ws-create.js')) && !/\bacme\b/i.test(read('server.js')), 'src/ws-create.js and server.js never name the fake (zero core edits)');

// ── ② a create through the REAL handler, down to the (stub) pty spawn
const SOCK = scratchDir('hspawn-sock'), BUF = scratchDir('hspawn-buf'), CWD = scratchDir('hspawn-cwd');
const NO_MANAGED = scratchDir('hspawn-managed-none');   // the machine's managed Claude settings folder, stood in EMPTY for every drive (never the box's own /etc/claude-code)
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
    managedClaudeDir: typeof extra.managedClaudeDir === 'string' ? extra.managedClaudeDir : NO_MANAGED,   // the factory's seam (never a ctx key)
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
ok(r.spawned.length === 1 && sp.cmd === '/stub/dtach' && gateOf(sp.args.includes('acme-cli')) && gateOf(sp.args.includes('--acme')) && !sp.args.includes('claude-must-not-run'),
  'ONE pty spawn, under dtach, running the ADAPTER\'s command + args (never a claude fallthrough)', sp && sp.args.slice(-4));
ok(!!sp && gateOf(sp.env) && sp.env.ACME_HOME === '/acme-home' && !sp.args.some((a) => /^[A-Z_][A-Z0-9_]*=/.test(a)),
  'the adapter\'s spawn env rides the spawn\'s ENV — the line carries no NAME=value word (lane antigravity-spawn-argv)', sp && sp.args.filter((a) => /=/.test(a)).slice(-3));
ok(gateOf(r.session) && r.session.backend === 'acme' && r.session.mode === 'terminal', 'the live session is an acme terminal');
ok(gateOf(r.session) && r.session._authAtSpawn === 'acme-global', 'its global-login guess is the DECLARED spawn.authAtSpawn row', r.session && r.session._authAtSpawn);
ok(!!sp && gateOf(sp.args.includes('--acme-status')) && verdictOf(sp.args.includes('/stub/vibespace-usage')), 'the terminal statusline goes through the DECLARED spawn.statusline hook', sp && sp.args.slice(-4));
ok(r.resolved.join() === 'acme', 'caps.pool:true + managed creds ⇒ the pool/billing gate asks resolveForSpawn for acme', r.resolved);
const rn = await drive(wsCreate, { backend: 'acme-nopool' });
ok(gateOf(rn.sent.some((m) => m.type === 'created')) && rn.resolved.length === 0, '…and caps.pool:false skips it (the gate is the ROW, not the id)', rn.resolved);
const rps = await drive(wsCreate, { backend: 'acme-perseat' });
ok(gateOf(rps.sent.some((m) => m.type === 'created')) && rps.resolved.join() === 'acme-perseat', '…but caps.pool:false WITH a declared creds.spawnForm (per-session named accounts — antigravity) still asks resolveForSpawn', rps.resolved);
const rr = await drive(wsCreate, { backend: 'acme', resume: true, resumeId: 'acme-conv-1', ignoreNoConvo: true });
ok(gateOf(rr.session) && rr.session._resumeSpawn === true && verdictOf(rr.spawned[0]?.args.includes('acme-conv-1')), 'a resume carries the DECLARED spawn.resumeMayFork marker', rr.session && rr.session._resumeSpawn);

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
  return M.load('src/ws-create.js', editAnchor(src, "require('./spawn')", `require(${JSON.stringify(reg)})`, "src/ws-create.js"), tag);
};
for (const [name, line, old, judge, file = 'src/ws-create.js'] of CONTROLS) {
  const fsrc = read(file);
  ok(fsrc.split(line).length === 2, `control ${name}: the gate is one identifiable line in the product source (${file})`);
  ok(verdictOf(judge(r)), `control ${name}: the shipped gate passes the fake's row`);
  const mut = file === 'src/ws-create.js' ? M.load(file, editAnchor(src, line, old, "src/ws-create.js"), name.replace(/\W+/g, '-')) : closedWorld(file, fsrc.replace(line, old), name.replace(/\W+/g, '-'));
  const x = await drive(mut, { backend: 'acme' });
  ok(gateOf(x.sent.some((m) => m.type === 'created')) && !judge(x), `control ${name}: with the id branch restored the fake's declared row is LOST (the leg above can go red)`);
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
  ok(gateOf(throws([...SPW.TRANSPORTS, { id: 'x2', hostless: true, ...stub }])) && gateOf(throws([...SPW.TRANSPORTS, { id: 'x3', terminal() { } }]))
    && gateOf(throws([...SPW.TRANSPORTS, { ...SPW.TRANSPORTS[1] }])) && !throws(SPW.TRANSPORTS),
    'NEGATIVE CONTROL: the registry refuses a second hostless member, a member without chat(c), a duplicate id');
  const wsc = read('src/ws-create.js');
  ok(!/\.transport\s*[!=]==?/.test(wsc) && gateOf(/spawnFor\(h\)\.terminal\(/.test(wsc)) && gateOf(/spawnFor\(h\)\.chat\(/.test(wsc)) && verdictOf(/spawnFor\(null\)\[sessionMode\]\(/.test(wsc)),
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
  const regMut = editAnchor(regSrc, anchor, anchor + `  require(${JSON.stringify(member)}),\n`, "src/spawn/index.js");
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
  ok(gateOf(x.sent.some((m) => m.type === 'created')) && !!sp0 && sp0.cmd === '/stub/dtach' && gateOf(sp0.args.includes('acme-link-cli')) && verdictOf(sp0.args.includes('host-acme-1')),
    'its spawn line is what the SHARED tail spawns (dtach → the wrapper → acme-link-cli --to <host>), and the create answers created', sp0 && sp0.args.slice(-6));
  ok(gateOf(x.session) && x.session.host === 'host-acme-1', 'the live session is on the acme-link host');
  const y = await drive(mod, { backend: 'claude', hostId: 'host-acme-1', mode: 'chat' }, { hosts: hostsStub }); // a chat needs a normalizer: the real claude one
  ok(globalThis.__acmeLinkCalls.length === 2 && globalThis.__acmeLinkCalls[1].mode === 'chat' && y.spawned.length === 0 && !y.session,
    'a chat create asks the same member\'s chat(c); its "answered the socket" (nothing) ends the create with NO spawn', { calls: globalThis.__acmeLinkCalls.length, spawned: y.spawned.length });
  globalThis.__acmeLinkCalls = [];
  const pre = "const sp = await spawnFor(h).terminal(ladderCtx({ h, shq, ...(rcmdT ? { rcmd: rcmdT } : {}) }));"; // B-69ec: the remote CLI's program rides the ladder
  ok(src.split(pre).length === 2, 'control: the terminal dispatch is one identifiable line');
  const old = viaReg(src).replace(pre, "const sp = await (h.transport === 'dial' ? require('./spawn/dial') : require('./spawn/ssh')).terminal(ladderCtx({ h, shq, ...(rcmdT ? { rcmd: rcmdT } : {}) }));");
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
  const wire = (harnessOf) => am.setProviderSpawn(PSP.create({ providers: store, dataDir: DATA, ...(harnessOf ? { harnessOf } : {}) }), (id, be, model) => PSP.modelFor(store, id, model, be));
  wire();
  // the ambient values are BUILT AT RUNTIME by joining pieces (the tree's law for a value standing where a credential would — never a
  // literal, never an allow row; the push hook's scan read the literals as assigned tokens)
  const AMBIENT = () => ({ CLAUDE_CODE_OAUTH_TOKEN: ['ambient', 'oat', 'must', 'not', 'ride'].join('-'), ANTHROPIC_API_KEY: ['ambient', 'key', 'must', 'not', 'ride'].join('-'), CLAUDE_SECURESTORAGE_CONFIG_DIR: '/machine/login', VIBESPACE_PROVIDER_KEY: ['ambient', 'provider', 'key'].join('-') });
  const filesHold = (needle) => { const hits = []; const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.isFile()) { try { if (fs.readFileSync(f, 'utf8').includes(needle)) hits.push(f); } catch { } } } }; for (const d of [SOCK, BUF]) walk(d); return hits; };
  const homeC = PSP.homeOf(DATA, ds.id, 'claude');

  const c1 = await drive(wsCreate, { backend: 'claude', accountId: ds.id }, { accounts: am }, AMBIENT);
  const e1 = (c1.spawned[0] || {}).env || {};
  ok(gateOf(c1.sent.some((m) => m.type === 'created')) && c1.spawned.length === 1 && gateOf(c1.session) && c1.session._accountId === ds.id, 'claude + DeepSeek: the create answers created, ONE spawn, the session bills the provider row', c1.sent.map((m) => m.type + (m.message ? ':' + m.message : '')));
  ok(e1.ANTHROPIC_BASE_URL === 'https://api.deepseek.com/anthropic' && e1.ANTHROPIC_AUTH_TOKEN === KEY && e1.ANTHROPIC_MODEL === 'deepseek-chat' && e1.ANTHROPIC_DEFAULT_OPUS_MODEL === 'deepseek-chat' && e1.ANTHROPIC_SMALL_FAST_MODEL === 'deepseek-chat', 'the CLI\'s env: the provider\'s address, its key under the variable its auth names, every alias the CLI resolves itself on the provider\'s model (D7)', { base: e1.ANTHROPIC_BASE_URL, model: e1.ANTHROPIC_MODEL });
  ok(!('CLAUDE_CODE_OAUTH_TOKEN' in e1) && !e1.ANTHROPIC_API_KEY && e1.CLAUDE_SECURESTORAGE_CONFIG_DIR === homeC && gateOf(fs.statSync(homeC).isDirectory()) && fs.readdirSync(homeC).length === 0 && (fs.statSync(homeC).mode & 0o777) === 0o700, 'NO OTHER LOGIN rides along: the ambient OAuth token and Console key are gone, the secret store is the provider\'s OWN EMPTY dir (0700) — the machine\'s subscription is not reachable from this child', { store: e1.CLAUDE_SECURESTORAGE_CONFIG_DIR });
  ok(!c1.spawned[0].args.some((a) => String(a).includes(KEY)) && !JSON.stringify(c1.sent).includes(KEY) && filesHold(KEY).length === 0, 'the key is in NO argv word, NO frame the create sent, NO file it wrote (sockets / buffers / meta)', filesHold(KEY));

  const c2 = await drive(wsCreate, { backend: 'codex', mode: 'chat', accountId: lab.id }, { accounts: am }, AMBIENT);
  const s2 = c2.spawned[0] || { args: [], env: {} };
  const ai = s2.args.indexOf('app-server');
  const cItems = s2.args.slice(0, ai).filter((a, i, all) => all[i - 1] === '-c');
  const homeX = PSP.homeOf(DATA, lab.id, 'codex');
  ok(gateOf(c2.sent.some((m) => m.type === 'created')) && c2.spawned.length === 1 && ai > 0 && gateOf(cItems.includes(`model_providers.pv_${lab.id.slice(3)}.base_url="http://127.0.0.1:9/v1"`)) && gateOf(cItems.includes(`model_providers.pv_${lab.id.slice(3)}.env_key="VIBESPACE_PROVIDER_KEY"`)) && gateOf(cItems.includes(`model_providers.pv_${lab.id.slice(3)}.wire_api="responses"`)) && gateOf(cItems.includes(`model_provider="pv_${lab.id.slice(3)}"`)) && verdictOf(cItems.includes('model="qwen3-coder"')), 'codex + a self-hosted provider (chat): its -c table rides AHEAD of app-server (the provider, its address, the VARIABLE its key is in, Responses, the default model)', s2.args.slice(Math.max(0, ai - 6), ai + 1));
  ok(s2.env.VIBESPACE_PROVIDER_KEY === KEY && s2.env.CODEX_HOME === homeX && gateOf(fs.lstatSync(path.join(homeX, 'sessions')).isSymbolicLink()) && !fs.existsSync(path.join(homeX, 'auth.json')) && !s2.args.some((a) => String(a).includes(KEY)) && filesHold(KEY).length === 0, 'its key rides the env only (VIBESPACE_PROVIDER_KEY — the ambient copy replaced), CODEX_HOME = the provider\'s own home (sessions shared, NO auth.json: the ChatGPT login cannot ride along), nothing in argv or a file', { home: s2.env.CODEX_HOME });

  const plain = await drive(wsCreate, { backend: 'claude' }, { accounts: am }, () => ({}));
  ok(plain.spawned.length === 1 && !('ANTHROPIC_BASE_URL' in plain.spawned[0].env) && !('ANTHROPIC_AUTH_TOKEN' in plain.spawned[0].env), 'the other direction: a conversation on the machine\'s own login carries no provider address and no provider key');

  // THE COORDINATOR'S MUST (U2 cure): A HUB STARTED FROM INSIDE A PROVIDER CONVERSATION never carries that provider into a later
  // start. The hub's environment SEEDED with a real plan (claude on DeepSeek; codex on Lab) — what a hub restarted from that
  // conversation's own shell inherits — and starts that did not pick the provider: none of the plan's names reach them.
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const PLAN_C = H.get('claude').creds.providerSpawn({ provider: store.get(ds.id), key: KEY, home: homeC }).localEnv;
  const PLAN_X = H.get('codex').creds.providerSpawn({ provider: store.get(lab.id), key: KEY, home: PSP.homeOf(DATA, lab.id, 'codex') }).localEnv;
  const SEEDED = () => ({ ...PLAN_C, ...PLAN_X, PATH: '/usr/bin', LANG: 'C.UTF-8' });
  const carried = (x, plan) => { const e = (x.spawned[0] || {}).env || {}; return Object.keys(plan).filter((n) => plan[n] !== '' && e[n] === plan[n]); };
  const m1 = await drive(wsCreate, { backend: 'claude' }, { accounts: am }, SEEDED);
  const m2 = await drive(wsCreate, { backend: 'codex', mode: 'chat' }, { accounts: am }, SEEDED);
  const m3 = await drive(wsCreate, { backend: 'claude', accountId: ds.id }, { accounts: am }, () => ({ ...PLAN_X, ANTHROPIC_BASE_URL: 'https://elsewhere.example.test/anthropic', ANTHROPIC_MODEL: 'other-model' }));
  const e3 = (m3.spawned[0] || {}).env || {};
  ok(m1.spawned.length === 1 && carried(m1, PLAN_C).length === 0 && !('ANTHROPIC_BASE_URL' in m1.spawned[0].env) && !('ANTHROPIC_AUTH_TOKEN' in m1.spawned[0].env) && !('ANTHROPIC_MODEL' in m1.spawned[0].env),
    'THE MUST — a claude start on the machine\'s own login, in a hub whose environment holds a provider conversation\'s plan: NONE of the plan\'s names (address, key, model names, its secret store) reach it', carried(m1, PLAN_C));
  ok(m2.spawned.length === 1 && carried(m2, PLAN_X).length === 0 && m2.spawned[0].env.CODEX_HOME !== PLAN_X.CODEX_HOME, 'THE MUST — a codex start the same: no provider key, not the provider\'s home', carried(m2, PLAN_X));
  ok(m3.spawned.length === 1 && e3.ANTHROPIC_BASE_URL === 'https://api.deepseek.com/anthropic' && e3.ANTHROPIC_MODEL === 'deepseek-chat' && e3.ANTHROPIC_AUTH_TOKEN === KEY, 'a provider start in such a hub: ITS OWN plan, laid after — never another\'s address or model names', { base: e3.ANTHROPIC_BASE_URL, model: e3.ANTHROPIC_MODEL });
  // …and ONLY a plan's own fingerprint moves it (the coordinator, 10:28Z): a variable the person set on the hub ITSELF — their own
  // gateway, a model name — carries no provider home and keeps reaching a start, as in the release
  const HAND = () => ({ ANTHROPIC_BASE_URL: 'https://gateway.example.test', ANTHROPIC_MODEL: 'person-model', PATH: '/usr/bin' });
  const hubClean = async (fn) => { const keep = {}; for (const n of ['CLAUDE_SECURESTORAGE_CONFIG_DIR', 'CODEX_HOME']) { keep[n] = process.env[n]; delete process.env[n]; } try { return await fn(); } finally { for (const [n, v] of Object.entries(keep)) if (v !== undefined) process.env[n] = v; } };   // the suite's own env is no hub's (a runner started from a provider shell would hold a plan's home — the delta read, D4)
  const mh = await hubClean(() => drive(wsCreate, { backend: 'claude' }, { accounts: am }, HAND));
  const eh = (mh.spawned[0] || {}).env || {};
  ok(mh.spawned.length === 1 && eh.ANTHROPIC_BASE_URL === 'https://gateway.example.test' && eh.ANTHROPIC_MODEL === 'person-model', 'a hub-wide ANTHROPIC_BASE_URL / ANTHROPIC_MODEL the person set by hand (no provider\'s home beside it) still reaches a claude start — only a plan is stripped', { base: eh.ANTHROPIC_BASE_URL, model: eh.ANTHROPIC_MODEL });
  const PSS = fs.readFileSync(path.join(REPO, 'src/server/provider-spawn.js'), 'utf8');
  const GATE = '  if (!homes.some((n) => inProviderHome(e[n]) || (hubEnv && inProviderHome(hubEnv[n])))) return [];\n';
  if (PSS.split(GATE).length !== 2) throw new Error('the anchor of the control «the plan\'s fingerprint gate» is not in the source once');
  const psNoGate = M.write('src/server/provider-spawn.js', anchored(PSS, GATE, '', 'the plan\'s fingerprint gate'), 'pv-nogate');
  const CALL = "require('./server/provider-spawn.js').ambientPlanNames(";
  if (src.split(CALL).length !== 2) throw new Error('the anchor of the control «the spawn line\'s strip call» is not in the source once');
  const wcNoGate = M.load('src/ws-create.js', anchored(src, CALL, `require(${JSON.stringify(psNoGate)}).ambientPlanNames(`, 'the spawn line\'s strip call'), 'pv-nogate-create');
  const mh0 = await hubClean(() => drive(wcNoGate, { backend: 'claude' }, { accounts: am }, HAND));
  ok(mh0.spawned.length === 1 && !('ANTHROPIC_BASE_URL' in mh0.spawned[0].env), 'CONTROL: a strip with no fingerprint test drops the person\'s own gateway from every claude start ⇒ the hand-set leg goes RED');
  // THROUGH THE REAL AGENT DOOR (the chain cure's read, R1): it drops claude's secret-store variable (claude's declared
  // spawnEnvVar), so the start's env no longer shows the plan's home — the fingerprint is read from the HUB's own env too
  const AGENT_ENV = require(path.join(REPO, 'src/agent-env.js')), HARNESS_ENV = require(path.join(REPO, 'src/harness-env.js'));
  const DOOR = () => AGENT_ENV.agentEnv(SEEDED(), { drop: HARNESS_ENV.agentCredentialEnvNames(H.list()) });
  const viaHub = async (mod) => { const was = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR; process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = homeC; try { return await drive(mod, { backend: 'claude' }, { accounts: am }, DOOR); } finally { if (was === undefined) delete process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR; else process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = was; } };
  const md = await viaHub(wsCreate);
  ok(!('CLAUDE_SECURESTORAGE_CONFIG_DIR' in DOOR()) && 'ANTHROPIC_BASE_URL' in DOOR() && md.spawned.length === 1 && carried(md, PLAN_C).length === 0, 'THROUGH THE REAL AGENT DOOR (it drops the secret-store variable, keeps ANTHROPIC_*): the fingerprint is read from the hub\'s own env — the plan\'s address and key never reach a machine-login start', carried(md, PLAN_C));
  const HUBARG = ", undefined, process.env)) delete env[n];";
  if (src.split(HUBARG).length !== 2) throw new Error('the anchor of the control «the hub env\'s fingerprint» is not in the source once');
  const md0 = await viaHub(M.load('src/ws-create.js', anchored(src, HUBARG, ')) delete env[n];', 'the hub env\'s fingerprint'), 'pv-nohubfp'));
  ok(md0.spawned.length === 1 && gateOf(carried(md0, PLAN_C).includes('ANTHROPIC_BASE_URL')) && verdictOf(carried(md0, PLAN_C).includes('ANTHROPIC_AUTH_TOKEN')), 'CONTROL (R1): the strip reading the start\'s env alone never sees the fingerprint on the real road ⇒ the third party\'s address and key reach the start ⇒ the leg goes RED', carried(md0, PLAN_C));
  const stripLine = src.split('\n').find((l) => l.includes("require('./server/provider-spawn.js').ambientPlanNames(backend, env"));
  if (!stripLine) throw new Error('the anchor of the control «the spawn line\'s plan strip» is not in the source');
  const kM = await drive(M.load('src/ws-create.js', anchored(src, stripLine + '\n', '', 'the spawn line\'s plan strip'), 'pv-nostrip'), { backend: 'claude' }, { accounts: am }, SEEDED);
  const kMx = await drive(M.load('src/ws-create.js', anchored(src, stripLine + '\n', '', 'the spawn line\'s plan strip'), 'pv-nostrip-codex'), { backend: 'codex', mode: 'chat' }, { accounts: am }, SEEDED);
  ok(kMx.spawned.length === 1 && gateOf(carried(kMx, PLAN_X).includes('VIBESPACE_PROVIDER_KEY')) && verdictOf(carried(kMx, PLAN_X).includes('CODEX_HOME')), 'CONTROL (the must, codex): without the strip a machine-login codex start gets the provider\'s key and home ⇒ the codex leg goes RED', carried(kMx, PLAN_X));
  ok(kM.spawned.length === 1 && gateOf(carried(kM, PLAN_C).includes('ANTHROPIC_BASE_URL')) && verdictOf(carried(kM, PLAN_C).includes('ANTHROPIC_AUTH_TOKEN')), 'CONTROL (the must): the spawn line without its plan strip hands the machine-login conversation the THIRD PARTY\'S ADDRESS AND KEY ⇒ the must\'s leg goes RED', carried(kM, PLAN_C));
  // …and the hub's own start sanitiser (server.js — inside a Claude Code conversation): run ITS OWN lines over that environment
  const SJ = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const SAN = 'if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_CHILD_SESSION';
  const at = SJ.indexOf(SAN);
  if (at < 0 || SJ.indexOf(SAN, at + 1) >= 0) throw new Error('the anchor of the sanitiser leg (server.js\'s start sanitiser) is not in the source once');
  const block = SJ.slice(at, SJ.indexOf('\n}\n', at) + 2);
  const sreq = createRequire(path.join(REPO, 'server.js'));
  const sanitise = (code, env) => { const proc = { env: { ...env } }; new Function('process', 'require', 'console', 'path', code)(proc, sreq, { warn() { } }, path); return proc.env; };
  const INSIDE = { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', ...PLAN_C, CODEX_HOME: path.join(DATA, 'machine-codex-home'), PATH: '/usr/bin' };
  const after = sanitise(block, INSIDE);
  const left = Object.keys(PLAN_C).filter((n) => PLAN_C[n] !== '' && n in after);
  ok(left.length === 0 && !('CLAUDECODE' in after) && after.CODEX_HOME === INSIDE.CODEX_HOME && after.PATH === '/usr/bin', 'THE MUST — server.js\'s start sanitiser (its own lines, run): a hub started inside a provider conversation drops every name the plan wrote (its secret store too — it points into a provider\'s home); the machine\'s own CODEX_HOME and the rest stay', left);
  const PLANCALL = ' || plan.includes(k)) {';
  if (!block.includes(PLANCALL)) throw new Error('the anchor of the control «the sanitiser\'s plan names» is not in the source');
  const after0 = sanitise(block.replace(PLANCALL, ') {'), INSIDE);
  ok(after0.ANTHROPIC_BASE_URL === PLAN_C.ANTHROPIC_BASE_URL && after0.ANTHROPIC_AUTH_TOKEN === KEY, 'CONTROL (the must): the sanitiser that drops the CLI\'s own names only (the release) keeps the third party\'s address and key in the hub ⇒ the sanitiser leg goes RED');
  // …ONLY a plan's own fingerprint (its home inside a provider's home) moves it: a plain conversation's shell keeps a person's
  // own gateway; a CODEX provider conversation's shell (no CLAUDECODE) drops codex's plan — and keeps an OpenCode agent's login
  const GATEWAY = { ANTHROPIC_BASE_URL: 'https://gateway.example.test', ANTHROPIC_AUTH_TOKEN: 'person-own-token' };
  const plainAfter = sanitise(block, { CLAUDECODE: '1', ...GATEWAY, PATH: '/usr/bin' });
  const CODEX_SHELL = { ...PLAN_X, ...GATEWAY, PATH: '/usr/bin' };
  const codexAfter = sanitise(block, CODEX_SHELL);
  ok(plainAfter.ANTHROPIC_BASE_URL === GATEWAY.ANTHROPIC_BASE_URL && plainAfter.ANTHROPIC_AUTH_TOKEN === GATEWAY.ANTHROPIC_AUTH_TOKEN && !('CLAUDECODE' in plainAfter), 'a hub started inside a PLAIN conversation (no plan\'s fingerprint) keeps a person\'s own gateway and token — only the CLI\'s own names go, as on the release', plainAfter);
  ok(!('VIBESPACE_PROVIDER_KEY' in codexAfter) && !('CODEX_HOME' in codexAfter) && codexAfter.ANTHROPIC_AUTH_TOKEN === GATEWAY.ANTHROPIC_AUTH_TOKEN && codexAfter.PATH === '/usr/bin', 'a hub started inside a CODEX provider conversation (its shell has no CLAUDECODE) drops codex\'s plan — the provider\'s key and home (the machine\'s ChatGPT login stays readable) — and only that plan', codexAfter);
  const bed = sanitise(block, { ...CODEX_SHELL, CLAUDE_CODE_USE_BEDROCK: '1' });
  const stray = sanitise(block, { OLDPWD: path.join(DATA, 'provider-homes', 'pv-x', 'claude'), CLAUDE_CODE_USE_BEDROCK: '1', ...GATEWAY, PATH: '/usr/bin' });
  ok(bed.CLAUDE_CODE_USE_BEDROCK === '1' && !('VIBESPACE_PROVIDER_KEY' in bed) && stray.CLAUDE_CODE_USE_BEDROCK === '1' && stray.ANTHROPIC_BASE_URL === GATEWAY.ANTHROPIC_BASE_URL && Object.keys(stray).length === 5, 'outside Claude Code the sanitiser strips ONLY a plan (a codex provider shell keeps the person\'s own CLAUDE_CODE_USE_BEDROCK); a path that merely contains «provider-homes» (an OLDPWD) is no plan — nothing stripped (the read, R4)', { bed: bed.CLAUDE_CODE_USE_BEDROCK, stray: Object.keys(stray) });
  const INSIDE_TEST = "(inside && (k === 'CLAUDECODE'";
  if (block.split(INSIDE_TEST).length !== 2) throw new Error('the anchor of the control «the sanitiser\'s inside test» is not in the source once');
  const bed0 = sanitise(block.replace(INSIDE_TEST, "((k === 'CLAUDECODE'"), { ...CODEX_SHELL, CLAUDE_CODE_USE_BEDROCK: '1' });
  ok(!('CLAUDE_CODE_USE_BEDROCK' in bed0), 'CONTROL (R4): a sanitiser that strips the CLI\'s own names outside Claude Code too drops the person\'s CLAUDE_CODE_USE_BEDROCK after a codex shell\'s restart ⇒ the codex-shell leg goes RED');
  const GATE_EXTRA = " || Object.values(process.env).some((v) => String(v).split(path.sep).includes('provider-homes'))) {";
  if (!block.includes(GATE_EXTRA)) throw new Error('the anchor of the control «the sanitiser\'s plan test» is not in the source');
  const codex0 = sanitise(block.replace(GATE_EXTRA, ') {'), CODEX_SHELL);
  ok(codex0.CODEX_HOME === PLAN_X.CODEX_HOME && codex0.VIBESPACE_PROVIDER_KEY === KEY, 'CONTROL: a sanitiser that runs only inside Claude Code keeps a codex provider conversation\'s key and home in the hub ⇒ the codex leg goes RED');
  // THE LIVE PAYLOAD'S ACCOUNT NAME AND TAIL (the restack's meeting with int411's checkpoint, resolved as LOGIC — the coordinator,
  // 20:45Z): server.js's OWN two lines run with stand-in accounts — the account's name first, then the provider's record, then
  // the fallback word; a session with no account says nothing
  const SJ2 = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const ACCT_LINES = SJ2.split('\n').filter((l) => /^\s*account(Name: s\._accountId \?|Tail: )/.test(l));   // (B-ba7d: accountTail is null — no key tail in the live payload)
  if (ACCT_LINES.length !== 2) throw new Error('the anchor of the account-name leg (server.js\'s live payload: accountName / accountTail) is not in the source as two lines');
  const acctOf = (lines) => new Function('s', 'accounts', 'return {\n' + lines.map((l) => l.replace(/,\s*\/\/.*$/, ',')).join('\n') + '\n};');
  const ACCTS = { get: (id) => (id === 'acct-w1' ? { name: 'Work', tail: 'ab12' } : null), nameShownOf: (id) => (id === 'acct-w1' ? 'Work' : null), providerRecordOf: (id) => (id === 'pv-ds1' ? { label: 'DeepSeek', tail: '7c2e' } : null) };
  const live = acctOf(ACCT_LINES);
  const rows = ['pv-ds1', 'acct-w1', 'acct-gone', null].map((id) => live({ _accountId: id }, ACCTS));
  ok(verdictOf(eq(rows, [{ accountName: 'DeepSeek', accountTail: null }, { accountName: 'Work', accountTail: null }, { accountName: 'API key', accountTail: null }, { accountName: null, accountTail: null }])), 'the live payload names a provider conversation by its record (DeepSeek — and NO key tail, B-ba7d: the page lays the person\'s read on), an account by its own name, an id that is gone by the fallback word — both meanings of the meeting kept, in that order', rows);
  // …and its SECOND copy (GET /api/active — src/routes/sessions.js, read by any credential): its own two lines, run as they stand
  // (B-ee0a smalls — the B-ba7d fix had no leg): the same names, NO key tail
  const ACCT_LINES2 = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8').split('\n').filter((l) => /^\s*account(Name: s\._accountId \?|Tail: )/.test(l));
  if (ACCT_LINES2.length !== 2) throw new Error('the anchor of the second account-name leg (GET /api/active: accountName / accountTail) is not in the source as two lines');
  const live2 = new Function('s', 'ctx', 'return {\n' + ACCT_LINES2.join('\n') + '\n};');   // each line's own comment ends at its newline
  const rows2 = ['pv-ds1', 'acct-w1', 'acct-gone', null].map((id) => live2({ _accountId: id }, { accounts: ACCTS }));
  ok(verdictOf(eq(rows2, rows)), 'GET /api/active\'s copy says the same: a provider by its record, an account by its shown name, the fallback word, nothing for none — and NO key tail', rows2);
  const OLD_NAME = "accounts.nameShownOf(s._accountId) || accounts.providerRecordOf?.(s._accountId)?.label || 'API key'";
  if (ACCT_LINES[0].split(OLD_NAME).length !== 2) throw new Error('the anchor of the account-name control is not in the source once');
  const rows0 = acctOf([ACCT_LINES[0].replace(OLD_NAME, "accounts.nameShownOf(s._accountId) || 'API key'"), ACCT_LINES[1]])({ _accountId: 'pv-ds1' }, ACCTS);   // stale-pins: kept — the control's REPLACEMENT is the checkpoint's line, gone from the product on purpose
  ok(rows0.accountName === 'API key', 'CONTROL: the line with the fallback word alone (the checkpoint\'s) calls a provider conversation «API key» ⇒ the leg goes RED', rows0);
  // the probe record covers every real plan: for every shipped preset on every harness it fits, the plan's names ⊆ the probed
  const probed = Object.fromEntries(MP.SPAWN_HARNESSES.map((h) => { const q = PSP.planNamesOf(H.get(h)); return [h, new Set([...q.names, ...q.homes])]; }));
  const missed = [];
  for (const sp of MP.SHIPPED) {
    const d = MP.draftOf(sp.id, { baseUrl: sp.baseRequired ? 'https://llm.example.test/v1' : null, model: 'm-1', wire: 'openai-responses' });
    for (const w of [null, 'anthropic-messages']) {
      const rec = { ...d, ...(sp.baseRequired && w ? { wire: w } : {}), id: 'pv-probe-x', keyRef: MP.keyRefOf('pv-probe-x') };
      for (const h of MP.SPAWN_HARNESSES) {
        if (!MP.fitsHarness(rec, h)) continue;
        const env = H.get(h).creds.providerSpawn({ provider: rec, key: 'k', home: '/h' }).localEnv;
        for (const [n, v] of Object.entries(env)) if (v !== '' && !probed[h].has(n)) missed.push(`${sp.id}/${h}: ${n}`);
      }
    }
  }
  ok(missed.length === 0, 'the probe covers every real plan: for every shipped preset (and a self-hosted one under each interface) on every harness it fits, each name the plan sets is one the strip knows', missed);
  // the wiring the legs above drive through the test's own seams, pinned at the hub's: the fit refusal's harness, the oracle,
  // the two session lists' names
  const AUR = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8'), PRR = fs.readFileSync(path.join(REPO, 'src/server/permission-rules.js'), 'utf8');
  const SESR = fs.readFileSync(path.join(REPO, 'src/routes/sessions.js'), 'utf8');
  ok(gateOf(AUR.includes("(id, be, model) => require('./provider-spawn.js').modelFor(providers, id, model, be));")) && gateOf(PRR.includes("if (typeof accounts?.get === 'function' && !accounts.get(accountId)) return Promise.resolve({ ok: false, reason: 'account', detail: 'unknown account' });")) && gateOf(SESR.includes("ctx.accounts?.providerRecordOf?.(s._accountId)?.label || 'API key'")) && verdictOf(SJ.includes("accounts.providerRecordOf?.(s._accountId)?.label || 'API key'")), 'the hub\'s own wiring: its fence asks with the harness (the fit refusal is on), the permission oracle reads an account\'s login only, and BOTH session lists (REST and the live payload) name a provider conversation by its record');
  ok(verdictOf(eq([...MP.SPAWN_HARNESSES].sort(), H.list().filter((d) => d && d.creds && typeof d.creds.providerSpawn === 'function').map((d) => d.id).sort())), 'THE CAPABILITY ROW: the harnesses a third party may fit (model-providers SPAWN_HARNESSES — a PURE module, it cannot ask the registry) are EXACTLY the descriptors that declare a plan (creds.providerSpawn) — a harness that gains or loses one without the list is red here', MP.SPAWN_HARNESSES);
  ok(gateOf(eq(PSP.planNamesOf(H.get('claude')).homes, ['CLAUDE_SECURESTORAGE_CONFIG_DIR'])) && gateOf(PSP.planNamesOf(H.get('claude')).names.includes('ANTHROPIC_SMALL_FAST_MODEL')) && gateOf(eq(PSP.planNamesOf(H.get('codex')), { names: ['VIBESPACE_PROVIDER_KEY'], homes: ['CODEX_HOME'] })) && verdictOf(eq(PSP.planNamesOf(H.get('opencode')), { names: [], homes: [] })), 'the names are ASKED OF EACH PLAN (a name the plan learns joins by construction); a harness with no plan strips nothing (an OpenCode agent keeps its own ANTHROPIC_* login)', PSP.planNamesOf(H.get('claude')));

  const refused = async (what, data, re, code) => { const x = await drive(wsCreate, data, { accounts: am }); const err = x.sent.find((m) => m.type === 'error'); ok(x.spawned.length === 0 && !!err && gateOf(re.test(err.message)) && (!code || err.code === code), `REFUSED BY NAME, nothing spawned — ${what}`, err && { message: err.message, code: err.code }); };
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
  // …but an instance default the provider DOES serve through its own aliases keeps that road (the reader of the U2 cure): opus ⇒
  // the record's alias row, not the default
  const dsWas = store.get(ds.id);
  const dsRows = dsWas.models.map((m) => ({ id: m.id, label: m.label, context: m.context, caps: m.caps }));
  const setA = store.setModels(ds.id, { models: dsRows, aliases: { opus: 'deepseek-reasoner' }, defaultModel: dsWas.defaultModel });
  await store.durable();
  const ca = await drive(wsCreate, { backend: 'claude', accountId: ds.id, model: 'opus', spawnOriginHint: { model: 'instance' } }, { accounts: am });
  const caModel = (() => { const a = (ca.spawned[0] || { args: [] }).args; const i = a.indexOf('--model'); return i >= 0 ? a[i + 1] : null; })();
  store.setModels(ds.id, { models: dsRows, aliases: dsWas.aliases || {}, defaultModel: dsWas.defaultModel }); await store.durable();   // what it found, put back (the read, R13)
  ok(gateOf(setA.ok) && ca.spawned.length === 1 && caModel === 'deepseek-reasoner', 'an instance default the provider serves through ITS aliases (opus ⇒ deepseek-reasoner) is resolved as before; only an id it does not serve falls to its own default', { caModel, setA: setA.ok });
  const ci = await drive(wsCreate, { backend: 'claude', accountId: ds.id, model: 'opus', spawnOriginHint: { model: 'instance' } }, { accounts: am });
  ok(ci.spawned.length === 1 && verdictOf((() => { const a = ci.spawned[0].args; const i = a.indexOf('--model'); return i >= 0 && a[i + 1] === 'deepseek-chat'; })()), 'the INSTANCE\'S default (claude.defaultModel = opus, the client says it is no pick) at a third party is no pick: the provider\'s own default, never a refusal of «opus» (U2 cure)', ci.sent.map((m) => m.type + (m.code ? ':' + m.code : '')));
  // «opus[1m]» as the INSTANCE DEFAULT meets the provider's «opus» alias (the coordinator's accepted note); an «opus[1m]» the
  // PERSON picked is still refused by name — a third party's row has no long context to give it, never silently a short one
  const dsA = store.get(ds.id);
  const dsRowsA = dsA.models.map((m) => ({ id: m.id, label: m.label, context: m.context, caps: m.caps }));
  store.setModels(ds.id, { models: dsRowsA, aliases: { opus: 'deepseek-reasoner' }, defaultModel: dsA.defaultModel }); await store.durable();
  const argModel = (x) => { const a = (x.spawned[0] || { args: [] }).args; const i = a.indexOf('--model'); return i >= 0 ? a[i + 1] : null; };
  const d1m = await drive(wsCreate, { backend: 'claude', accountId: ds.id, model: 'opus[1m]', spawnOriginHint: { model: 'instance' } }, { accounts: am });
  const c1m = await drive(wsCreate, { backend: 'claude', accountId: ds.id, model: 'opus[1m]' }, { accounts: am });
  const e1m = c1m.sent.find((m) => m.type === 'error');
  const BARE = "const bare = String(data.model || '').replace(/\\[1m\\]$/i, '');";
  if (src.split(BARE).length !== 2) throw new Error('the anchor of the control «the instance default\'s [1m] retry» is not in the source once');
  const d1m0 = await drive(M.load('src/ws-create.js', anchored(src, BARE, "const bare = String(data.model || '');", 'the instance default\'s [1m] retry'), 'pv-no1m'), { backend: 'claude', accountId: ds.id, model: 'opus[1m]', spawnOriginHint: { model: 'instance' } }, { accounts: am });
  store.setModels(ds.id, { models: dsRowsA, aliases: dsA.aliases || {}, defaultModel: dsA.defaultModel }); await store.durable();
  ok(argModel(d1m) === 'deepseek-reasoner' && c1m.spawned.length === 0 && !!e1m && e1m.code === 'model-not-served' && verdictOf(/opus\[1m\]/.test(e1m.message)), 'an instance default «opus[1m]» meets the provider\'s «opus» alias (deepseek-reasoner); the SAME pick made by the person is refused by name (never a silent short context)', { d1m: argModel(d1m), c1m: e1m && e1m.code });
  ok(argModel(d1m0) === 'deepseek-chat', 'CONTROL: without the instance default\'s [1m] retry «opus[1m]» falls to the provider\'s default ⇒ the leg goes RED', argModel(d1m0));
  ok(PSP.modelFor(store, ds.id, '', 'opencode').code === 'provider-unfit' && gateOf(/DeepSeek does not offer what OpenCode needs/.test(PSP.modelFor(store, ds.id, '', 'opencode').message)) && gateOf(PSP.modelFor(store, ds.id, '', 'claude').ok) && verdictOf(PSP.modelFor(store, ds.id, '').ok), 'the fence refuses a harness the provider does not serve (a hand-made create on OpenCode: no spawn road — never its row id on the machine\'s own login)', PSP.modelFor(store, ds.id, '', 'opencode'));
  const cm = await drive(wsCreate, { backend: 'claude', accountId: ds.id, model: 'deepseek-reasoner' }, { accounts: am });
  const cd = await drive(wsCreate, { backend: 'claude', accountId: ds.id }, { accounts: am });
  const argsOf = (x) => (x.spawned[0] || { args: [] }).args;
  const modelOf = (x) => { const a = argsOf(x); const i = a.indexOf('--model'); return i >= 0 ? a[i + 1] : null; };
  ok(modelOf(cm) === 'deepseek-reasoner' && modelOf(cd) === 'deepseek-chat' && verdictOf(argsOf(cd).some((a) => String(a).includes('"apiKeyHelper":""'))), 'a served pick is spawned as asked; NO pick ⇒ the provider\'s default (never the instance\'s claude-* default); a machine-wide apiKeyHelper is neutralized (--settings apiKeyHelper:"") — it would outrank the provider\'s key', { picked: modelOf(cm), none: modelOf(cd) });
  // THE MEETING OF LOGIC (主开发 22:14Z, with lane bl-chat-b's billing half): ONE variable sets the machine's key helper aside —
  // the billing pick's verdict OR a conversation on a third-party provider. The provider side: its spawn carries the emptied helper
  // setting (a helper named in the machine's Claude settings would outrank the provider's own key); that half reverted is RED
  ok(cd.spawned.length === 1 && verdictOf(argsOf(cd).some((a) => String(a).includes('"apiKeyHelper":""'))), 'the ONE helper variable, its provider side: a provider conversation\'s spawn carries the emptied key helper setting', argsOf(cd));
  // the rule answers both halves (src/billing-pick.js: the resolved account's kind 'provider', behind the harness's keyHelper row
  // — a harness whose login no helper outranks sets nothing aside, a Codex provider neither); CONTROL: the rule without its
  // provider line, swapped into the real create, starts a provider conversation with the machine's helper in force
  const BP = require(path.join(REPO, 'src/billing-pick.js')), SFW = require(path.join(REPO, 'src/settings-file-words.js'));
  ok(gateOf(BP.setsHelperAside({ creds: H.get('claude').creds, account: { id: ds.id, kind: 'provider' } })) && !BP.setsHelperAside({ creds: H.get('codex').creds || null, account: { id: lab.id, kind: 'provider' } }),
    'the rule: a Claude Code conversation on a provider sets the helper aside; a Codex one has no helper to set aside (nothing flagged)');
  const BPSRC = fs.readFileSync(path.join(REPO, 'src/billing-pick.js'), 'utf8');
  const PVLINE = "  if (!!account && typeof account === 'object' && account.kind === 'provider') return true;   // a third-party provider (the meeting, 22:14Z)\n";
  const BPREQ = "require('./billing-pick.js')";
  if (BPSRC.split(PVLINE).length !== 2 || src.split(BPREQ).length !== 2) throw new Error('the anchors of the control «the rule without its provider half» are not in the sources once');
  const bpNo = M.write('src/billing-pick.js', anchored(BPSRC, PVLINE, '', 'the rule without its provider half'), 'bp-noprovider');
  const hk0 = await drive(M.load('src/ws-create.js', anchored(src, BPREQ, 'require(' + JSON.stringify(bpNo) + ')', 'the rule without its provider half (its require)'), 'pv-nohelper'), { backend: 'claude', accountId: ds.id }, { accounts: am });
  ok(hk0.spawned.length === 1 && !argsOf(hk0).some((a) => String(a).includes('"apiKeyHelper":""')), 'CONTROL: the rule without its provider half spawns a provider conversation with the machine\'s helper in force ⇒ the leg above goes RED', argsOf(hk0));
  // EVERY READER FOLLOWS IT, IN A PROVIDER'S OWN WORDS (the cure's read: the notice called DeepSeek «the subscription you picked»
  // and offered «CLI login»): the machine's Claude settings NAME a helper (a scratch config dir) ⇒ ONE notice, the provider's
  // words, the provider named by its record; with the person's own --settings file the file is set aside and the provider's
  // file words are said; a machine that names no helper ⇒ the file applies whole, nothing said
  const CFG = scratchDir('hspawn-helper-cfg'), PFILE = path.join(CFG, 'mine.json');
  fs.writeFileSync(PFILE, JSON.stringify({ permissions: { deny: ['Bash(rm:*)'] } }));
  const helperNamed = (on) => fs.writeFileSync(path.join(CFG, 'settings.json'), on === 'garbled' ? '{ "apiKeyHelper": ' : JSON.stringify(on ? { apiKeyHelper: '/usr/local/bin/key-helper' } : { theme: 'dark' }));
  const noticed = async (mod, data, want = true) => {
    const notes = [];
    const x = await drive(mod, { backend: 'claude', accountId: ds.id, name: 'Fix the build', ...data }, { accounts: am, serverNotice: (key, text, o) => { notes.push({ key, text, ...(o || {}) }); return 1; } }, () => ({ CLAUDE_CONFIG_DIR: CFG }));
    if (want) { for (let i = 0; i < 150 && !notes.some((n) => n.key.startsWith('billing-pick-helper-')); i++) await new Promise((r) => setTimeout(r, 20)); }   // the fact is read after the spawn (bounded, local)
    else await new Promise((r) => setTimeout(r, 300));   // room for a notice that must not come
    return { x, notes };
  };
  const settingsArg = (x) => { const a = argsOf(x); const i = a.indexOf('--settings'); return i >= 0 ? String(a[i + 1]) : null; };
  helperNamed(true);
  const nh = await noticed(wsCreate, {});
  const hn = nh.notes.filter((n) => n.key.startsWith('billing-pick-helper-'));
  ok(hn.length === 1 && hn[0].key === `billing-pick-helper-${ds.id}-local` && gateOf(hn[0].i18n) && hn[0].i18n.key === BP.HELPER_SET_ASIDE.provider && hn[0].i18n.params.account === 'DeepSeek'
    && gateOf(/ runs on DeepSeek, a third-party provider paid by use with your own key/.test(hn[0].text)) && !/subscription|CLI login/.test(hn[0].text),
    'the machine names a helper: a provider conversation is told ONCE, in a provider\'s words (paid by use, never «the subscription you picked», no «CLI login» door), the provider by its name', hn);
  const nf = await noticed(wsCreate, { extraArgs: ['--settings', PFILE] });
  const fileNote = nf.notes.find((n) => n.key.startsWith('settings-file-'));
  ok(settingsArg(nf.x) !== PFILE && gateOf(/"apiKeyHelper":""/.test(settingsArg(nf.x) || '')) && gateOf(fileNote) && fileNote.i18n.key === SFW.PROVIDER_BILLING_WORDS.billing && !/subscription|CLI login/.test(fileNote.text),
    'with the person\'s own --settings file: the file is set aside (the helper must not outrank the key) and the provider\'s file words are said — never «bills the subscription chosen for it»', { arg: settingsArg(nf.x), fileNote });
  helperNamed(false);
  const nn = await noticed(wsCreate, { extraArgs: ['--settings', PFILE] }, false);
  ok(settingsArg(nn.x) === PFILE && !nn.notes.some((n) => n.key.startsWith('settings-file-billing') || n.key.startsWith('billing-pick-helper-')), 'a machine that names no helper: the person\'s file applies whole and nothing is said', { arg: settingsArg(nn.x), notes: nn.notes.map((n) => n.key) });
  // the fact cannot be read (the machine's settings do not parse) ⇒ the file is set aside all the same, said in the provider's
  // UNREAD words; a helper named ONLY in the person's own file ⇒ set aside, the words naming that place too
  helperNamed('garbled');
  const nu = await noticed(wsCreate, { extraArgs: ['--settings', PFILE] }, false);
  const unreadNote = nu.notes.find((n) => n.key.startsWith('settings-file-'));
  ok(settingsArg(nu.x) !== PFILE && gateOf(unreadNote) && gateOf(unreadNote.key.startsWith('settings-file-billingUnread-')) && unreadNote.i18n.key === SFW.PROVIDER_BILLING_WORDS.billingUnread && !/subscription|CLI login/.test(unreadNote.text),
    'the fact cannot be read: the file is set aside (billing wins) and the provider\'s UNREAD words are said', { arg: settingsArg(nu.x), unreadNote });
  helperNamed(false);
  const OWNF = path.join(CFG, 'mine-helper.json');
  fs.writeFileSync(OWNF, JSON.stringify({ apiKeyHelper: '/usr/local/bin/own-helper', permissions: { deny: ['Bash(rm:*)'] } }));
  const no = await noticed(wsCreate, { extraArgs: ['--settings', OWNF] });
  const ownNote = no.notes.find((n) => n.key.startsWith('settings-file-'));
  ok(settingsArg(no.x) !== OWNF && gateOf(ownNote) && ownNote.i18n.key === SFW.PROVIDER_BILLING_WORDS.billing && verdictOf(/or your file itself/.test(ownNote.text)),
    'a helper named ONLY in the person\'s own file: the file is set aside and the words name that place (never only «this machine\'s settings»)', { arg: settingsArg(no.x), ownNote });
  helperNamed(true);
  const LABEL = ' || accounts?.providerRecordOf?.(acctId)?.label';
  if (src.split(LABEL).length !== 2) throw new Error('the anchor of the control «the notice names the provider by its record» is not in the source once');
  const nl = await noticed(M.load('src/ws-create.js', anchored(src, LABEL, '', 'the notice names the provider by its record'), 'pv-nolabel'), {});
  const hl = nl.notes.filter((n) => n.key.startsWith('billing-pick-helper-'));
  ok(hl.length === 1 && hl[0].i18n.params.account === ds.id, 'CONTROL: the notice without the record\'s name names the conversation\'s provider by its pv- id ⇒ the leg above goes RED', hl.map((n) => n.i18n && n.i18n.params));
  // RED CONTROLS FOR THE PROVIDER'S WORDS (主开发 23:45Z): the create without the provider's form says the SUBSCRIPTION words —
  // the notice's (helperNotice without `provider`) and the settings file's (the loop without PROVIDER_BILLING_WORDS)
  const NWORDS = 'hostId: data.hostId || null, provider: onProvider,', FWORDS = 'const w = (onProvider && SFW.PROVIDER_BILLING_WORDS[k]) || SFW.SETTINGS_FILE_WORDS[k], name';
  helperNamed(true);
  const wn = await noticed(M.load('src/ws-create.js', anchored(src, NWORDS, 'hostId: data.hostId || null,', 'the notice without the provider\'s form'), 'pv-subwords'), { extraArgs: ['--settings', PFILE] });
  const wh = wn.notes.find((n) => n.key.startsWith('billing-pick-helper-'));
  ok(!!wh && wh.i18n.key === BP.HELPER_SET_ASIDE.local && verdictOf(/the subscription you picked/.test(wh.text)), 'CONTROL: the notice without the provider\'s form tells a DeepSeek conversation «the subscription you picked» ⇒ the provider-words leg goes RED', wh && wh.text);
  const wf = await noticed(M.load('src/ws-create.js', anchored(src, FWORDS, 'const w = SFW.SETTINGS_FILE_WORDS[k], name', 'the file words without the provider\'s form'), 'pv-subfilewords'), { extraArgs: ['--settings', PFILE] });
  const wfn = wf.notes.find((n) => n.key.startsWith('settings-file-'));
  ok(!!wfn && wfn.i18n.key === SFW.SETTINGS_FILE_WORDS.billing && verdictOf(/bills the subscription chosen for it/.test(wfn.text)), 'CONTROL: the settings-file loop without the provider\'s words says «bills the subscription chosen for it» ⇒ the file-words leg goes RED', wfn && wfn.text);
  // A MACHINE WHOSE MANAGED CLAUDE SETTINGS NAME A KEY HELPER (主开发 23:45Z, as if a must; the fact read from the CLI 2.1.322's own
  // bundle: the managed source merges after --settings and the credential helpers come from the highest source only — the inline
  // override cannot set it aside, and the provider's start would send the organisation's credential to the provider's address).
  // A stand-in managed folder (src/managed-claude-settings.js reads exactly managed-settings.json + managed-settings.d/*.json there)
  const MANAGED = require(path.join(REPO, 'src/managed-claude-settings.js'));
  const mdir = (files) => { const d = fs.mkdtempSync(path.join(scratchDir('hspawn-managed'), 'm-'));   /* a FRESH folder per case (scratchDir answers one folder per name) */ for (const [rel, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), body); } return d; };
  const HELPER = JSON.stringify({ apiKeyHelper: '/opt/org/key-helper' });
  const mstart = async (dir, data = { backend: 'claude', accountId: ds.id }, mod = wsCreate) => { const x = await drive(mod, data, { accounts: am, managedClaudeDir: dir }); return { x, err: x.sent.find((m) => m.type === 'error') || null }; };
  const mNamed = await mstart(mdir({ 'managed-settings.json': HELPER }));
  ok(mNamed.x.spawned.length === 0 && gateOf(mNamed.err) && mNamed.err.code === 'provider-managed-helper' && gateOf(mNamed.err.i18n) && mNamed.err.i18n.key === MANAGED.MANAGED_HELPER_WORDS.named && mNamed.err.i18n.params.provider === 'DeepSeek' && verdictOf(/Ask the administrator/.test(mNamed.err.message)),
    'the managed settings name a key helper: a DeepSeek start is REFUSED BY NAME (provider-managed-helper) with its door, and NOTHING spawns', mNamed.err);
  const mDrop = await mstart(mdir({ 'managed-settings.d/20-org.json': HELPER }));
  const mGarb = await mstart(mdir({ 'managed-settings.json': '{ "apiKeyHelper": ' }));
  const mPol = await mstart(mdir({ 'managed-settings.json': JSON.stringify({ policyHelper: { path: '/opt/org/policy' } }) }));
  ok(mDrop.x.spawned.length === 0 && gateOf(mDrop.err) && mDrop.err.i18n.key === MANAGED.MANAGED_HELPER_WORDS.named
    && mGarb.x.spawned.length === 0 && gateOf(mGarb.err) && mGarb.err.i18n.key === MANAGED.MANAGED_HELPER_WORDS.unread
    && mPol.x.spawned.length === 0 && gateOf(mPol.err) && mPol.err.i18n.key === MANAGED.MANAGED_HELPER_WORDS.unread,
    'a helper named in a drop-in (managed-settings.d) refuses the same; a managed file that cannot be read, or one that names a policy helper (it computes settings at startup), refuses as «could not be read» — the credential wins', [mDrop.err && mDrop.err.code, mGarb.err && mGarb.err.code, mPol.err && mPol.err.code]);
  const mNone = await mstart(mdir({ 'managed-settings.json': JSON.stringify({ permissions: { deny: ['Bash(rm:*)'] } }) }));
  const mAbsent = await mstart(path.join(scratchDir('hspawn-managed-gone'), 'no-such-folder'));
  const mCodex = await mstart(mdir({ 'managed-settings.json': HELPER }), { backend: 'codex', mode: 'chat', accountId: lab.id });
  const mOwn = await mstart(mdir({ 'managed-settings.json': HELPER }), { backend: 'claude' });
  ok(mNone.x.spawned.length === 1 && mAbsent.x.spawned.length === 1 && mCodex.x.spawned.length === 1 && mOwn.x.spawned.length === 1,
    'managed settings that name no helper, or no managed folder at all: the provider start runs; a Codex provider (no Claude helper reaches it) and a start on the machine\'s own login are not this refusal\'s', [mNone.x.spawned.length, mAbsent.x.spawned.length, mCodex.x.spawned.length, mOwn.x.spawned.length]);
  const MCHECK = 'if (!data.hostId && pvModel && harness && harness.creds && harness.creds.keyHelper) {\n            const mh = await MANAGED.managedHelperFact(';
  const mCtl = await mstart(mdir({ 'managed-settings.json': HELPER }), { backend: 'claude', accountId: ds.id }, M.load('src/ws-create.js', anchored(src, MCHECK, MCHECK.replace('if (!data.hostId && pvModel', 'if (false && pvModel'), 'the create without the managed check'), 'pv-nomanaged'));
  ok(mCtl.x.spawned.length === 1 && !mCtl.err, 'CONTROL: the create without the managed-settings check spawns the DeepSeek conversation under the managed helper ⇒ the refusal leg goes RED', mCtl.err);
  // POOL UNIT (d) (row B-d578, ruling r1516): a POOLED create the store places on a third-party PROVIDER member is judged against
  // THAT provider — the create named the pool (no provider), so before (d) both checks met nothing: its model is re-resolved against
  // the provider's own rows and the managed settings' helper refuses it by name, nothing spawned. The store's pooled road onto a
  // provider member is the fallback member itself (after this unit): here a stand-in store answers the pool with that placement (the
  // store's own answer — B-d578's fallback F1 — follows below the control: THE REAL ROAD).
  const POOLID = 'pool-' + 'd'.repeat(12);
  const amPool = new Proxy(am, { get(t, k) {
    if (k === 'resolveForSpawn') return (id, be, opts) => (id === POOLID ? { ...t.resolveForSpawn(ds.id, be, opts), id: POOLID, pooled: true, kind: 'provider', poolTarget: ds.id } : t.resolveForSpawn(id, be, opts));
    if (k === 'get') return (id) => (id === POOLID ? { id: POOLID, type: 'pooled', name: 'Pool D', backend: 'claude' } : t.get(id));
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
  const INST = { backend: 'claude', accountId: POOLID, model: 'opus', spawnOriginHint: { model: 'instance' } };   // the instance's default, no pick (the provider's own default stands in)
  const pstart = async (dir, mod = wsCreate, data = INST) => { const x = await drive(mod, data, { accounts: amPool, managedClaudeDir: dir }); return { x, err: x.sent.find((m) => m.type === 'error') || null }; };
  const pModel = (x) => { const a = (x.spawned[0] || { args: [] }).args; const i = a.indexOf('--model'); return i >= 0 ? a[i + 1] : null; };
  const pOk = await pstart(path.join(scratchDir('hspawn-pool-d'), 'no-managed'));
  ok(pOk.x.spawned.length === 1 && !pOk.err && pModel(pOk.x) === 'deepseek-chat', 'POOL UNIT (d): a POOLED create the store placed on the DeepSeek member re-resolves the instance\'s default (opus, no pick) against THE MEMBER: DeepSeek\'s own default (deepseek-chat), never the pool\'s «opus»', { err: pOk.err, model: pModel(pOk.x) });
  const pPick = await pstart(path.join(scratchDir('hspawn-pool-d2'), 'no-managed'), wsCreate, { backend: 'claude', accountId: POOLID, model: 'sonnet' });
  ok(pPick.x.spawned.length === 0 && gateOf(pPick.err) && pPick.err.code === 'model-not-served' && verdictOf(/DeepSeek/.test(pPick.err.message)), 'POOL UNIT (d): …a model the PERSON picked that the member does not serve (sonnet) is REFUSED BY NAME against the member (model-not-served, DeepSeek), nothing spawns', pPick.err);
  const pRef = await pstart(mdir({ 'managed-settings.json': HELPER }));
  ok(pRef.x.spawned.length === 0 && gateOf(pRef.err) && pRef.err.code === 'provider-managed-helper' && gateOf(pRef.err.i18n) && pRef.err.i18n.params.provider === 'DeepSeek', 'POOL UNIT (d): …and when the managed settings name a key helper that pooled start is REFUSED BY NAME (provider-managed-helper, DeepSeek), nothing spawns', pRef.err);
  const pCut = await pstart(mdir({ 'managed-settings.json': HELPER }), M.load('src/ws-create.js', anchored(src, '            if (pooledPv) {', '            if (false) {', 'the create before pool unit (d)'), 'pool-d-cut'));
  ok(pCut.x.spawned.length === 1 && !pCut.err, 'CONTROL: the create before pool unit (d) spawns that pooled DeepSeek start under the managed helper (the organisation\'s credential toward the provider\'s address): the refusal leg goes RED', pCut.err);
  // THE REAL ROAD (B-d578, the fallback member F1 + F2 — 主开发 r2858: bl-keys-misc's not-kept legs as the acceptance): the stand-in
  // store above is now the store's OWN answer — a real pool that lists DeepSeek as its FALLBACK, the conversation's chooser naming it
  // (the engine names it through the carry of a conversation it moved — the chooser below answers as the engine does): the start LANDS on DeepSeek (its address in the env),
  // is STAMPED as it (the held member — billed to the provider, unit (c)) and the provider's model rule ran first (unit (d)).
  const realSub = am.createSubscription({ name: 'Real member' }).id;
  fs.writeFileSync(path.join(am.subDir(realSub), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'x', refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, subscriptionType: 'max' } }), { mode: 0o600 });
  const realPool = am.createPool({ name: 'Real pool', members: [realSub] }).id;
  am.updatePool(realPool, { fallbackProviders: [ds.id] });
  const pReal = await drive(wsCreate, { ...INST, accountId: realPool }, { accounts: am, managedClaudeDir: path.join(scratchDir('hspawn-pool-real'), 'no-managed'), poolChooser: () => ds.id });
  const pRealEnv = (pReal.spawned[0] || {}).env || {};
  ok(pReal.spawned.length === 1 && pModel(pReal) === 'deepseek-chat' && !!pReal.session && pReal.session._accountId === realPool && pReal.session._heldPoolMember === ds.id && pRealEnv.ANTHROPIC_BASE_URL === 'https://api.deepseek.com/anthropic',
    'THE REAL ROAD (r2858\'s acceptance): a real pool listing DeepSeek as its FALLBACK, the chooser naming it ⇒ the pooled start LANDS on DeepSeek, is STAMPED as it (the held member: billed to the provider) and ran the provider\'s model rule (deepseek-chat, never «opus»)',
    { spawned: pReal.spawned.length, model: pModel(pReal), held: pReal.session && pReal.session._heldPoolMember, acct: pReal.session && pReal.session._accountId, base: pRealEnv.ANTHROPIC_BASE_URL, err: (pReal.sent || []).filter((m) => m.type === 'error').map((m) => m.message) });
  // …and THE RESUME of a conversation the pool moved, the chooser answering as the ENGINE does (F2 cure, round wuq1b1trm): the store's
  // PEEK (`fallbackOnly`) names the fallback, the create's question (`carryRecord`) hands the move's record — which rides the create's
  // FIRST meta write (r2939 (1): a hub restart after the create finds it there); no ordinary ask is made
  const REC = { poolId: realPool, provider: ds.id, fromMember: realSub, fromModel: 'sonnet', toModel: 'deepseek-chat', at: Date.now(), by: 'pool' };
  const asked = [], metaWrites = [];
  const chooserReal = (pid, o = {}) => { asked.push(o.carryRecord ? 'record' : o.fallbackOnly ? 'peek' : 'ordinary'); return o.carryRecord ? REC : o.fallbackOnly ? ds.id : null; };
  const pRes = await drive(wsCreate, { backend: 'claude', accountId: realPool, resume: true, resumeId: 'conv-moved-1', ignoreNoConvo: true }, { accounts: am, managedClaudeDir: path.join(scratchDir('hspawn-pool-real-r'), 'no-managed'), poolChooser: chooserReal, writeSessionMeta: (k, m) => { metaWrites.push(m); return Promise.resolve(true); } });
  const firstMeta = metaWrites[0] || {};
  ok(pRes.spawned.length === 1 && !!pRes.session && pRes.session._heldPoolMember === ds.id && gateOf(asked.includes('peek')) && gateOf(asked.includes('record')) && !asked.includes('ordinary') && !!firstMeta.poolFallback && firstMeta.poolFallback.fromModel === 'sonnet' && firstMeta.poolFallback.provider === ds.id && firstMeta.heldPoolMember === ds.id,
    'THE RESUME the pool moved (r2939 (1)): the PEEK names DeepSeek, the resume lands there, and the move\'s record is in the create\'s FIRST meta write beside the held member — never only in a carry held in memory',
    { spawned: pRes.spawned.length, held: pRes.session && pRes.session._heldPoolMember, asked, first: firstMeta.poolFallback || null, writes: metaWrites.length, err: (pRes.sent || []).filter((m) => m.type === 'error').map((m) => m.message) });
  // THE MANAGED ENV BLOCK (its reader's MUST): the CLI copies a managed `env` over the spawn's own — an Anthropic credential there
  // goes to the provider, an address there sends the provider's key to the organisation: both refuse like a helper
  const ORG_TOKEN = ['org', 'bearer', 'from', 'policy'].join('-');
  const mEnvTok = await mstart(mdir({ 'managed-settings.json': JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: ORG_TOKEN } }) }));
  const mEnvUrl = await mstart(mdir({ 'managed-settings.json': JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://gateway.example.test' } }) }));
  const mEnvOther = await mstart(mdir({ 'managed-settings.json': JSON.stringify({ env: { DISABLE_TELEMETRY: '1' } }) }));
  ok(mEnvTok.x.spawned.length === 0 && gateOf(mEnvTok.err) && mEnvTok.err.i18n.key === MANAGED.MANAGED_HELPER_WORDS.named && gateOf(/managed-settings\.json/.test(mEnvTok.err.i18n.params.where))
    && mEnvUrl.x.spawned.length === 0 && gateOf(mEnvUrl.err) && mEnvUrl.err.code === 'provider-managed-helper' && mEnvOther.x.spawned.length === 1,
    'a managed env that sets an Anthropic credential (or an address) refuses the provider start by name, the file named; an env of other names does not', [mEnvTok.err && mEnvTok.err.i18n.params, mEnvUrl.err && mEnvUrl.err.code, mEnvOther.x.spawned.length]);
  const ENVLINE = "  if (env && envHit(env)) return { named: true, cause: 'env' };\n";
  const MSRC = fs.readFileSync(path.join(REPO, 'src/managed-claude-settings.js'), 'utf8');
  const MANAGED_NOENV = M.load('src/managed-claude-settings.js', anchored(MSRC, ENVLINE, '', 'the reader without its env check'), 'managed-noenv');
  const envCtl = await MANAGED_NOENV.managedHelperFact({ dir: mdir({ 'managed-settings.json': JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: ORG_TOKEN } }) }), wsl: false });
  ok(envCtl.named === false, 'CONTROL: the reader without its env check finds nothing in a managed file whose env carries the organisation\'s token ⇒ the env leg goes RED', envCtl);
  // THE ENV RULE NAMES ONLY CREDENTIALS AND ROUTES (主开发 00:42Z): a managed model name or a cloud switch set off is neither — the
  // start runs; a cloud switch ON is a route
  const mModel = await mstart(mdir({ 'managed-settings.json': JSON.stringify({ env: { ANTHROPIC_MODEL: 'claude-org-pinned', ANTHROPIC_LOG: 'debug', CLAUDE_CODE_USE_BEDROCK: '0' } }) }));
  const mSwitch = await mstart(mdir({ 'managed-settings.json': JSON.stringify({ env: { CLAUDE_CODE_USE_VERTEX: '1' } }) }));
  ok(mModel.x.spawned.length === 1 && !mModel.err && mSwitch.x.spawned.length === 0 && gateOf(mSwitch.err) && mSwitch.err.code === 'provider-managed-helper' && MANAGED.envHit({ ANTHROPIC_MODEL: 'x' }) === null && MANAGED.envHit({ CLAUDE_CODE_USE_BEDROCK: 'false' }) === null && MANAGED.envHit({ ANTHROPIC_CUSTOM_HEADERS: 'x' }) === 'ANTHROPIC_CUSTOM_HEADERS' && MANAGED.envHit({ CLAUDE_CODE_USE_MANTLE: '1' }) === 'CLAUDE_CODE_USE_MANTLE' && MANAGED.envHit({ ANTHROPIC_UNIX_SOCKET: '/run/x.sock' }) === 'ANTHROPIC_UNIX_SOCKET',
    'the env rule names only credentials and routes: a managed model name, a log switch or a cloud switch set to 0 does not refuse; a cloud switch ON does', [mModel.x.spawned.length, mSwitch.err && mSwitch.err.code]);
  // A PROVIDER START AIMED AT A PAIRED MACHINE answers «this machine only for now» — never the hub's own managed check (主开发 00:42Z)
  const mRemote = await mstart(mdir({ 'managed-settings.json': HELPER }), { backend: 'claude', accountId: ds.id, hostId: 'host-box-1' });
  ok(mRemote.x.spawned.length === 0 && gateOf(mRemote.err) && mRemote.err.code !== 'provider-managed-helper' && verdictOf(/runs on this machine only/.test(mRemote.err.message)), 'a provider start aimed at a paired machine is refused by ITS reason (this machine only for now), not by the hub\'s managed settings', mRemote.err);
  // THE WINDOWS POLICY (主开发 00:42Z, WSL — a native Windows hub judged the same): ONE read-only query per key through the Windows
  // helper by the CLI's own ABSOLUTE path — a STAND-IN reg.exe handed by its full path here (never the real one): no policy ⇒ runs; a
  // policy setting a helper ⇒ refused naming the Windows policy; the helper absent, failing or over its bound ⇒ refused in ITS OWN words
  const regDir = (body) => { const d = fs.mkdtempSync(path.join(scratchDir('hspawn-reg'), 'r-')); fs.writeFileSync(path.join(d, 'reg.exe'), '#!/bin/sh\n' + body + '\n', { mode: 0o755 }); return d; };
  const NOKEY = "echo 'ERROR: The system was unable to find the specified registry key or value.' >&2; exit 1";
  const row = (hive, json, name = 'Settings') => `printf '\\r\\nHKEY_${hive}\\\\SOFTWARE\\\\Policies\\\\ClaudeCode\\r\\n    ${name}    REG_SZ    %s\\r\\n\\r\\n' '${json}'`;
  const policy = (lm, cu) => regDir(`case "$2" in HKLM*) ${lm ? row('LOCAL_MACHINE', lm) : NOKEY};; *) ${cu ? row('CURRENT_USER', cu) : NOKEY};; esac`);
  const OPT_HELPER = JSON.stringify({ wslInheritsWindowsSettings: true, apiKeyHelper: '/opt/org/key-helper' }), HELPER_ONLY = JSON.stringify({ apiKeyHelper: '/opt/org/key-helper' });
  const regSet = policy(OPT_HELPER), regNoOpt = policy(HELPER_ONLY), regNone = policy(null, null);
  const regCuOwn = policy(null, JSON.stringify({ wslInheritsWindowsSettings: true, env: { ANTHROPIC_AUTH_TOKEN: ['org', 'cu', 'token'].join('-') } })), regCuNoOpt = policy(null, HELPER_ONLY);
  const regLower = regDir(`case "$2" in HKLM*) ${row('LOCAL_MACHINE', OPT_HELPER, 'settings')};; *) ${NOKEY};; esac`);
  const regFail = regDir('exit 5'), regSlow = regDir('exec /bin/sleep 5');   // exec: the bound's SIGKILL ends the sleep itself (no orphan)
  const EMPTY = mdir({}), DRV = mdir({});
  // the CLI asks reg.exe by its own ABSOLUTE path (never PATH): the stand-in is handed by its full path (never the real one)
  const winFact = (platform, d, extra = {}) => MANAGED.managedHelperFact({ platform, wsl: platform === 'linux', dir: EMPTY, drvfsDir: DRV, reg: { regExe: path.join(d, 'reg.exe'), env: {}, boundMs: 400, ...extra } });
  const wSet = await winFact('linux', regSet), wNoOpt = await winFact('linux', regNoOpt), wNone = await winFact('linux', regNone), wFail = await winFact('linux', regFail), wSlow = await winFact('linux', regSlow);
  const wAbsent = await winFact('linux', mdir({})), wNative = await winFact('win32', regNoOpt), wLower = await winFact('linux', regLower);
  const wCuOwn = await winFact('linux', regCuOwn), wCuNoOpt = await winFact('linux', regCuNoOpt);
  // HKCU on WSL: the CLI's DOUBLE opt-in — the admin chain armed (HKLM's own opt-in, nothing else set there) AND HKCU's own true
  const wCuBoth = await winFact('linux', policy(JSON.stringify({ wslInheritsWindowsSettings: true }), JSON.stringify({ wslInheritsWindowsSettings: true, env: { ANTHROPIC_AUTH_TOKEN: ['org', 'cu', 'token'].join('-') } })));
  const wDrv = await MANAGED.managedHelperFact({ platform: 'linux', wsl: true, dir: EMPTY, drvfsDir: mdir({ 'managed-settings.json': OPT_HELPER }), reg: { regExe: path.join(regNone, 'reg.exe'), env: {}, boundMs: 400 } });
  ok(wSet.named === true && gateOf(/HKLM/.test(wSet.where)) && wNoOpt.named === false && wNative.named === true && wNone.named === false && wLower.named === true
    && wCuOwn.named === false && wCuBoth.named === true && gateOf(/HKCU/.test(wCuBoth.where)) && wCuNoOpt.named === false
    && wFail.named === null && wFail.cause === 'windows-unread' && wFail.why === 'error' && wSlow.named === null && wSlow.why === 'timeout' && wAbsent.named === null && wAbsent.why === 'absent'
    && wDrv.named === true && verdictOf(/managed-settings\.json$/.test(wDrv.where)),
    'the Windows policy as the CLI applies it: on WSL HKLM / the DrvFs folder only when one opts in (wslInheritsWindowsSettings), HKCU only with that admin opt-in AND its own (its own alone ⇒ runs), the value name in any case; a native Windows hub applies them all; failing / over its bound / absent ⇒ «cannot read the Windows policy»',
    { wSet: wSet.named, wNoOpt: wNoOpt.named, wNative: wNative.named, wLower: wLower.named, wCuOwn: wCuOwn.named, wCuBoth: wCuBoth.named, wCuNoOpt: wCuNoOpt.named, wFail: wFail.why, wSlow: wSlow.why, wAbsent: wAbsent.why, wDrv: wDrv.named });
  const wWords = MANAGED.refusalOf(wFail, 'DeepSeek');
  const dicts = ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf8'));
  ok(wWords.i18n.key === MANAGED.MANAGED_HELPER_WORDS.windowsUnread && gateOf(/could not read the Windows policy/.test(wWords.message)) && !/administrator/i.test(wWords.message) && gateOf(/HKLM/.test(wWords.i18n.params.where))
    && verdictOf(dicts.every((d) => d.includes(JSON.stringify(MANAGED.MANAGED_HELPER_WORDS.windowsUnread) + ':'))),
    'the Windows helper failing is said in ITS OWN words — VibeSpace could not read the Windows policy (named), no administrator door — in en, zh and ja', wWords.message);
  // (主开发 01:46Z) THE OPT-IN AS THE CLI ARMS IT (gGs + ix, read from the bundle): an admin value that is neither absent nor false —
  // «yes», a number — is «unreadable» and ARMS the chain (the CLI fails closed); "false" disarms; HKCU needs its own true (and the admin's)
  const armYes = await winFact('linux', policy(JSON.stringify({ wslInheritsWindowsSettings: 'yes', apiKeyHelper: '/opt/org/key-helper' })));
  const armFalse = await winFact('linux', policy(JSON.stringify({ wslInheritsWindowsSettings: 'false', apiKeyHelper: '/opt/org/key-helper' })));
  const cuYes = await winFact('linux', policy(null, JSON.stringify({ wslInheritsWindowsSettings: 'yes', apiKeyHelper: '/opt/org/key-helper' })));
  ok(armYes.named === true && armFalse.named === false && cuYes.named === false && MANAGED.armsWsl({ wslInheritsWindowsSettings: 1 }) === true && MANAGED.armsWsl({}) === false,
    'the WSL opt-in as the CLI arms it: an unreadable admin value («yes») arms the chain (refused), «false» disarms it (runs), HKCU applies only with its own true', { armYes: armYes.named, armFalse: armFalse.named, cuYes: cuYes.named });
  // CANNOT TELL, never «no policy»: the helper exits 0 with a value of another type, or with a reply the parser cannot read
  const regDword = regDir(`case "$2" in HKLM*) printf '\\r\\nHKEY_LOCAL_MACHINE\\\\SOFTWARE\\\\Policies\\\\ClaudeCode\\r\\n    Settings    REG_DWORD    0x1\\r\\n\\r\\n';; *) ${NOKEY};; esac`);
  const regGarble = regDir(`case "$2" in HKLM*) printf '\\377\\376garbled';; *) ${NOKEY};; esac`);
  const wDword = await winFact('linux', regDword), wGarble = await winFact('linux', regGarble);
  ok(wDword.named === null && wDword.cause === 'windows-unread' && wGarble.named === null && wGarble.cause === 'windows-unread',
    'the helper answering a value of another type or a reply it cannot read ⇒ «could not read the Windows policy» (refused), never no policy', { wDword: wDword.cause, wGarble: wGarble.cause });
  // a STRING value whose JSON does not parse is the ADMINISTRATOR's to fix (the cure2 read, S1): the cannot-tell words, as a managed
  // file that does not parse — never «try again» (retrying never mends it)
  const regBad = policy(JSON.stringify({ apiKeyHelper: '/opt/org/key-helper' }).slice(0, -1) + ',}');
  const wBad = await winFact('linux', regBad), wBadWords = MANAGED.refusalOf(wBad, 'DeepSeek');
  ok(wBad.named === null && wBad.cause === 'unreadable' && gateOf(/HKLM/.test(wBad.where)) && wBadWords.i18n.key === MANAGED.MANAGED_HELPER_WORDS.unread && !/try again/i.test(wBadWords.message),
    'a policy value whose JSON does not parse ⇒ the administrator\'s words (cannot tell, HKLM named), never a retry', { cause: wBad.cause, where: wBad.where });
  // the helper ABSENT: its own words — no retry promised (it does not appear by waiting)
  const wAbsentWords = MANAGED.refusalOf(wAbsent, 'DeepSeek');
  // UNABLE TO START (WSL interop off, /mnt/c noexec ⇒ EACCES / ENOEXEC) is as lasting as absent: the same words, no retry
  const regNoExec = regDir('exit 0'); fs.chmodSync(path.join(regNoExec, 'reg.exe'), 0o644);
  const wNoExec = await winFact('linux', regNoExec);
  ok(wNoExec.named === null && wNoExec.cause === 'windows-absent' && wNoExec.why === 'cannot-start', 'the Windows helper unable to start (not executable) ⇒ the absent words (no retry), never «try again»', wNoExec);
  // …BY PLATFORM (主开发 03:35Z): on WSL the advice is WSL's (let it run Windows programs); a native Windows hub's is reg.exe's own
  const wAbsentNative = await winFact('win32', mdir({})), wAbsentNativeWords = MANAGED.refusalOf(wAbsentNative, 'DeepSeek');
  ok(wAbsent.cause === 'windows-absent' && wAbsent.onWsl === true && wAbsentWords.i18n.key === MANAGED.MANAGED_HELPER_WORDS.windowsAbsent && !/try again/i.test(wAbsentWords.message) && !/administrator/i.test(wAbsentWords.message) && gateOf(/in WSL \(interop\)/.test(wAbsentWords.message))
    && wAbsentNative.cause === 'windows-absent' && wAbsentNative.onWsl === false && wAbsentNativeWords.i18n.key === MANAGED.MANAGED_HELPER_WORDS.windowsAbsentNative && !/WSL/.test(wAbsentNativeWords.message) && gateOf(/reg\.exe \(in System32\)/.test(wAbsentNativeWords.message))
    && verdictOf(dicts.every((d) => d.includes(JSON.stringify(MANAGED.MANAGED_HELPER_WORDS.windowsAbsent) + ':') && d.includes(JSON.stringify(MANAGED.MANAGED_HELPER_WORDS.windowsAbsentNative) + ':'))),
    'the Windows helper ABSENT is said in its own words — what a person can do BY PLATFORM (on WSL: turn on running Windows programs; on Windows: reg.exe itself, no word of WSL), no bare retry, no administrator (en, zh, ja)', { wsl: wAbsentWords.message.slice(-120), native: wAbsentNativeWords.message.slice(-120) });
  // THE OUTER BOUND ending while the Windows read is pending is THAT read's verdict — never the administrator's words for the Linux folder.
  // The clock is PLACED (lane bl-release, 主开发 r1154 — the row read ~5.8 s against its 184 ms, 3.0 s of it these two waits on a real
  // 1.5 s bound behind real reg.exe stand-ins): the reg reads go through the fact's own `exec` seam and answer from no process at all —
  // the outer read never answers, the hang's two keys answer «no such value» at once — and the Linux managed folder answers from memory
  // too (an empty local folder, as the reader's own fsOf below), so NOTHING real runs before the outer bound and it ends inside the
  // Windows phase on any load (the real-process roads, the reg read's own SIGKILL bound included, are the legs above: wSlow, wFail,
  // wAbsent, wNoExec; the real Linux folder, wNone and wDrv). And the run is KEPT ALIVE across these legs: with no real child left, a
  // never-answering read holds no handle and the fact's timer is unref'd — a busy machine would otherwise drain the loop with this
  // module's await still pending (node exits 13, the suite cut short) — the lane's read of this cure
  const OUTER_MS = 250;
  const alive = setInterval(() => {}, 1 << 30);   // cleared after the reader's legs below
  const emptyLocal = (hangAt = null) => ({ stat: (p) => (p === hangAt ? new Promise(() => {}) : Promise.resolve({ isDirectory: () => true })), statfs: async () => ({ type: 0xef53 }), readdir: async () => [], open: async () => { const e = new Error('none'); e.code = 'ENOENT'; throw e; } });
  const neverAnswers = () => {};   // a reg read that is still pending when the outer bound ends
  const answersNone = (file, args, opts, cb) => setImmediate(() => cb(Object.assign(new Error('reg exited 1'), { code: 1 }), '', 'ERROR: The system was unable to find the specified registry key or value.'));
  const wOuter = await MANAGED.managedHelperFact({ platform: 'linux', wsl: true, dir: '/stand-in/outer/managed', drvfsDir: '/stand-in/outer/drvfs', fsp: emptyLocal(), boundMs: OUTER_MS, reg: { exec: neverAnswers, regExe: '/stand-in/outer/reg.exe', env: {}, boundMs: 4000 } });
  // …and NAMES what it waited on: the DrvFs folder hanging (its stat never answers) after both keys answered
  const DRV_HANG = '/stand-in/hang-drvfs/managed';
  const wHang = await MANAGED.managedHelperFact({ platform: 'linux', wsl: true, dir: '/stand-in/hang/managed', drvfsDir: DRV_HANG, fsp: emptyLocal(DRV_HANG), boundMs: OUTER_MS, reg: { exec: answersNone, regExe: '/stand-in/hang/reg.exe', env: {}, boundMs: 4000 } });
  ok(wOuter.named === null && wOuter.cause === 'windows-unread' && wOuter.why === 'timeout' && gateOf(/HKLM/.test(wOuter.where)) && wHang.named === null && wHang.cause === 'windows-unread' && wHang.where === DRV_HANG,
    'the outer bound ending inside the Windows read answers «could not read the Windows policy» (its own verdict), naming what it waited on — a key, or the DrvFs folder', { wOuter, wHang });
  // (C) THE ENV RULE IS THE CLI'S OWN LIST, WHOLE (the cure2 read, S2/S3): its connection names (`lu` — 138 once its spreads are
  // written out) count but the four named with a reason, plus its other lists' four; the seven switches only when ON. npm's three
  // proxy names COUNT (主开发 02:49Z: the CLI's axios client falls back to its own env resolution, which reads them). A proxy, a CA
  // (whoever holds it reads the request), TLS checks off, the client certificate, the first-party switch, the federation profile, a
  // login folder — each refuses; in ANY case; WHATEVER the value (an empty one blanks the spawn's own)
  const CL = MANAGED.CLI_CONNECTION_NAMES, NC = Object.keys(MANAGED.ENV_NOT_COUNTED);
  const hits = ['HTTPS_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'CLAUDE_CODE_CERT_STORE', 'CLAUDE_CODE_CLIENT_CERT', '_CLAUDE_CODE_ASSUME_FIRST_PARTY_BASE_URL', 'ANTHROPIC_PROFILE', 'ANTHROPIC_CONFIG_DIR',
    'ANTHROPIC_FEDERATION_RULE_ID', 'ANTHROPIC_ORGANIZATION_ID', 'CLAUDE_CONFIG_DIR', 'HOME', 'CLAUDE_CODE_SESSION_ACCESS_TOKEN', 'CLAUDE_CODE_HTTPS_PROXY'].filter((n) => MANAGED.envHit({ [n]: 'x' }) !== n);
  ok(CL.length === 138 && new Set(CL).size === 138 && MANAGED.ENV_NAMES.size === 131 && NC.length === 4 && !NC.some((n) => /^NPM_CONFIG_/.test(n)) && gateOf(NC.every((n) => CL.includes(n))) && gateOf([...MANAGED.ENV_SWITCHES].every((n) => CL.includes(n)))
    && gateOf(CL.every((n) => MANAGED.ENV_NAMES.has(n) || NC.includes(n) || MANAGED.ENV_SWITCHES.has(n))) && hits.length === 0
    && MANAGED.envHit({ NODE_TLS_REJECT_UNAUTHORIZED: '0' }) === 'NODE_TLS_REJECT_UNAUTHORIZED' && MANAGED.envHit({ https_proxy: 'http://p.example.test' }) === 'https_proxy'
    && MANAGED.envHit({ anthropic_base_url: 'https://gw.example.test' }) === 'anthropic_base_url' && MANAGED.envHit({ Https_Proxy: 'http://p.example.test' }) === 'Https_Proxy'
    && MANAGED.envHit({ ANTHROPIC_AUTH_TOKEN: '' }) === 'ANTHROPIC_AUTH_TOKEN' && MANAGED.envHit({ ANTHROPIC_BASE_URL: '' }) === 'ANTHROPIC_BASE_URL' && MANAGED.envHit({ CLAUDE_CODE_USE_VERTEX: '' }) === null
    && gateOf(['NPM_CONFIG_HTTPS_PROXY', 'NPM_CONFIG_HTTP_PROXY', 'NPM_CONFIG_PROXY', 'npm_config_https_proxy'].every((n) => MANAGED.envHit({ [n]: 'http://npm.example.test' }) === n))
    && MANAGED.envHit({ NO_PROXY: 'localhost', API_FORCE_IDLE_TIMEOUT: '30000', ANTHROPIC_MODEL: 'x', DISABLE_TELEMETRY: '1' }) === null,
    'the env rule is the CLI\'s own list of connection names, whole: 138 names, every one counted but the four named with their reasons and the switches (ON only); a proxy (npm\'s three too), a CA, TLS checks off, the client certificate, the first-party switch, the federation profile, a login folder refuse — in any case, an EMPTY value too; NO_PROXY, a timing, a model name do not',
    { hits, len: CL.length, nc: NC.length });
  // NAMED CONTROL FOR THE OPT-IN GATE: the reader without it (every Windows policy applied on WSL) refuses a native-only policy
  const OPTIN = '  const adminOptIn = !wsl || armsWsl(hklm.set) || drvDocs.some((d) => armsWsl(d.doc));';
  const MANAGED_NOGATE = M.load('src/managed-claude-settings.js', anchored(MSRC, OPTIN, '  const adminOptIn = true;   // CONTROL: no opt-in gate', 'the reader without its WSL opt-in gate'), 'managed-nogate');
  const gateCtl = await MANAGED_NOGATE.managedHelperFact({ platform: 'linux', wsl: true, dir: EMPTY, drvfsDir: DRV, reg: { regExe: path.join(regNoOpt, 'reg.exe'), env: {}, boundMs: 400 } });
  ok(gateCtl.named === true, 'CONTROL: the reader without its WSL opt-in gate refuses a native-only Windows policy on WSL ⇒ the «no opt-in ⇒ runs» leg goes RED', gateCtl);
  // ONE OF EACH READ IN FLIGHT (主开发 00:42Z): two starts at once share the folder's stat, statfs and listing — never one per start
  const calls = { stat: 0, statfs: 0, readdir: 0 };
  const slowFsp = { stat: async () => { calls.stat++; await new Promise((r) => setTimeout(r, 40)); return { isDirectory: () => true }; }, statfs: async () => { calls.statfs++; return { type: 0xef53 }; }, readdir: async () => { calls.readdir++; return []; }, open: async () => { const e = new Error('none'); e.code = 'ENOENT'; throw e; } };
  const both = await Promise.all([MANAGED.managedHelperFact({ platform: 'linux', wsl: false, dir: '/stand-in/managed', fsp: slowFsp }), MANAGED.managedHelperFact({ platform: 'linux', wsl: false, dir: '/stand-in/managed', fsp: slowFsp })]);
  ok(gateOf(both.every((f) => f.named === false)) && calls.stat === 1 && calls.statfs === 1 && calls.readdir === 1, 'two starts at once: the managed folder\'s stat, statfs and listing run ONCE (one in flight each)', calls);
  // CONTROL ON THE NON-BLOCKING OPEN: the reader opening a FIFO drop-in WITHOUT O_NONBLOCK hangs until its bound (then the pipe is
  // released by a writer here, so no thread is left holding it)
  const BLOCKING = anchored(MSRC, 'fh = await fsp.open(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);', 'fh = await fsp.open(file, fs.constants.O_RDONLY);', 'the reader without its non-blocking open');
  const MANAGED_BLOCKING = M.load('src/managed-claude-settings.js', BLOCKING, 'managed-blocking');
  const pipeDir = mdir({ 'managed-settings.json': JSON.stringify({}) }); fs.mkdirSync(path.join(pipeDir, 'managed-settings.d'));
  const pipe = path.join(pipeDir, 'managed-settings.d', '10-pipe.json');
  require('child_process').execFileSync('mkfifo', [pipe]);
  const blocked = await MANAGED_BLOCKING.managedHelperFact({ dir: pipeDir, wsl: false, boundMs: 300 });
  let released = false;   // release the hung open: a writer opens once the blocked reader is there (ENXIO until then) — no thread left holding the pipe
  for (let i = 0; i < 100 && !released; i++) { try { fs.closeSync(fs.openSync(pipe, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK)); released = true; } catch { await new Promise((r) => setTimeout(r, 20)); } }
  ok(gateOf(released) && blocked.named === null && blocked.cause === 'timeout', 'CONTROL: the reader without its non-blocking open hangs on a FIFO drop-in until its bound ⇒ the FIFO leg (an answer at once) goes RED', blocked);
  // THE READER IS BOUNDED (its reader's S1): a FIFO drop-in never holds a start (opened non-blocking, not a regular file), a file over
  // 1 MiB is not read, the whole answer within its bound; a NETWORK or FUSE filesystem is never read — a local mount is
  const fifoDir = mdir({ 'managed-settings.json': JSON.stringify({ permissions: {} }) });
  fs.mkdirSync(path.join(fifoDir, 'managed-settings.d'));
  require('child_process').execFileSync('mkfifo', [path.join(fifoDir, 'managed-settings.d', '10-pipe.json')]);
  const fifo = await MANAGED.managedHelperFact({ dir: fifoDir, wsl: false });   // the FACT, never a wall clock: a hung open would answer its bound's code («timeout»), the non-blocking one answers «unreadable» (not a regular file)
  const big = await MANAGED.managedHelperFact({ dir: mdir({ 'managed-settings.json': JSON.stringify({ pad: 'x'.repeat((1 << 20) + 16) }) }), wsl: false });
  const hang = await MANAGED.managedHelperFact({ dir: '/stand-in/hang', platform: 'linux', wsl: false, boundMs: 60, fsp: { stat: () => new Promise(() => { }) } });   // its own path: a hung stat holds ITS key (one in flight)
  const fsOf = (type) => ({ stat: async () => ({ isDirectory: () => true }), statfs: async () => ({ type }), readdir: async () => [], open: async () => { const e = new Error('none'); e.code = 'ENOENT'; throw e; } });
  const nfs = await MANAGED.managedHelperFact({ dir: '/stand-in/nfs', platform: 'linux', wsl: false, fsp: fsOf(0x6969) });
  const local = await MANAGED.managedHelperFact({ dir: '/stand-in/local', platform: 'linux', wsl: false, fsp: fsOf(0x794c7630 /* overlay */) });
  clearInterval(alive);   // the never-answering reads above held nothing; from here every leg holds its own handle
  ok(fifo.named === null && fifo.cause === 'unreadable' && gateOf(/10-pipe\.json$/.test(String(fifo.where))) && big.named === null && hang.named === null && hang.cause === 'timeout' && nfs.named === null && nfs.cause === 'network-mount' && local.named === false,
    'the reader: a FIFO drop-in answers «cannot tell» as NOT A REGULAR FILE (the open never blocked — its code is never the bound\'s «timeout»), a file over 1 MiB too, a stuck read at its bound; a network filesystem is not read, a local mount is', { fifo: fifo.cause, fifoWhere: fifo.where, big: big.cause, hang: hang.cause, nfs: nfs.cause, local: local.named });
  // macOS: the CLI's own managed-preferences file cannot be told (not parsed here) — Claude Desktop's is not the CLI's; WSL: the
  // Windows policy keys the CLI reads through reg.exe cannot be told either
  const prefs = fs.mkdtempSync(path.join(scratchDir('hspawn-macprefs'), 'p-')); fs.mkdirSync(path.join(prefs, 'someone'), { recursive: true }); fs.writeFileSync(path.join(prefs, 'someone', 'com.anthropic.claudecode.plist'), 'x');
  const desk = fs.mkdtempSync(path.join(scratchDir('hspawn-macprefs-desktop'), 'd-')); fs.writeFileSync(path.join(desk, 'com.anthropic.claudefordesktop.plist'), 'x');
  const macHit = await MANAGED.managedHelperFact({ platform: 'darwin', dir: path.join(prefs, 'no-managed-dir'), macPrefs: prefs });
  const macDesk = await MANAGED.managedHelperFact({ platform: 'darwin', dir: path.join(prefs, 'no-managed-dir'), macPrefs: desk });
  ok(macHit.named === null && gateOf(/com\.anthropic\.claudecode\.plist$/.test(macHit.where)) && macDesk.named === false
    && MANAGED.DIRS.linux === '/etc/claude-code' && MANAGED.DIRS.darwin === '/Library/Application Support/ClaudeCode' && MANAGED.DIRS.win32 === 'C:\\Program Files\\ClaudeCode',
    'macOS: the CLI\'s managed-preferences file cannot be told, Claude Desktop\'s is not the CLI\'s; the CLI\'s own folders (WSL: the Windows policy legs above)', { macHit: macHit.named, macDesk: macDesk.named });
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) { const d = fs.readFileSync(path.join(REPO, f), 'utf8'); ok(verdictOf([BP.HELPER_SET_ASIDE.provider, ...Object.values(SFW.PROVIDER_BILLING_WORDS)].every((w) => d.includes(JSON.stringify(w) + ':'))), `${path.basename(f)}: a provider's three helper sentences have their rows`); }
  // THE POOL QUESTION (the coordinator's 21:50Z, for the remove confirm that names the conversations on a provider): can a
  // provider be a MEMBER of a pool — would a conversation billed through a pool run on it and go unnamed? NO, and this leg keeps
  // it so: a pool's members are the ACCOUNTS store's same-harness subscriptions (poolMembership / poolMembers / poolRoster /
  // setPoolTarget / a priority list); a provider record lives in the provider store, never in the accounts store, and no door
  // writes a provider onto an account (accountProviderId reads an account's `providerId`; nothing writes one). Even a member
  // list that NAMES the provider (written here by hand: updatePool refuses one by name since B-d578's fallback unit F1 — a pool LISTS
  // providers apart, `fallbackProviders`, test-pool-fallback) never routes to it. Should this ever go red, the
  // remove confirm must name the pool-billed conversations too
  const poolOf = (AM, tag) => {
    const a = new AM({ dataDir: scratchDir('hspawn-pool-' + tag) });
    a.setProviderLookup((x) => store.forAccount(x));
    const sub = a.createSubscription({ name: 'Team Max' }).id;
    a._state.accounts.push({ id: 'pool-t1', name: 'Team', type: 'pooled', backend: 'claude', members: [sub, ds.id], auto: true, priority: [], hot: false });
    return { a, sub };
  };
  const tried = (fn) => { try { fn(); return 'taken'; } catch (e) { return String(e && e.message); } };
  const pq = poolOf(AccountManager, 'real');
  const pqTarget = tried(() => pq.a.setPoolTarget('pool-t1', ds.id)), pqPri = tried(() => pq.a.updatePool('pool-t1', { priority: [ds.id] })), pqLink = tried(() => pq.a.ensureSessionPoolLink('pool-t1', 'claude:sess-1', ds.id));
  ok(gateOf(eq(pq.a.poolMembership('pool-t1'), [pq.sub])) && !pq.a.poolRoster('pool-t1').some((r) => r.id === ds.id)
    && gateOf(/not a claude subscription/.test(pqTarget)) && gateOf(/not a member of this pool/.test(pqPri)) && gateOf(/not a subscription/.test(pqLink)) && pq.a.get(ds.id) == null,
    'a third-party provider is never a pool member: a pool whose member list NAMES it lists, offers, targets and links a conversation to only its subscriptions (the provider is no account of the accounts store) — no conversation billed through a pool runs on a provider',
    { membership: pq.a.poolMembership('pool-t1'), pqTarget, pqPri, pqLink });
  const ACC = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const TRUST = '    const wanted = Array.isArray(a.members) && a.members.length ? all.filter((x) => a.members.includes(x.id)) : all;\n    return wanted.map((x) => x.id);';
  if (ACC.split(TRUST).length !== 2) throw new Error('the anchor of the control «a pool trusts its member list» is not in the source once');
  const px = poolOf(M.load('src/accounts.js', anchored(ACC, TRUST, '    return Array.isArray(a.members) && a.members.length ? a.members.slice() : all.map((x) => x.id);', 'a pool trusts its member list'), 'pool-trusts-list').AccountManager, 'mut');
  ok(verdictOf(px.a.poolMembership('pool-t1').includes(ds.id)), 'CONTROL: a pool that trusts its member list as given counts the provider a member ⇒ the leg above goes RED', px.a.poolMembership('pool-t1'));
  // (MAJOR 3) the badge names the provider, billed by use — never «API key» / «ChatGPT»
  const badgeC = H.get('claude').billingIdentity({ _accountId: ds.id }, { accounts: am, withHost: (x) => x, poolAuth: (x) => x });
  const badgeX = H.get('codex').billingIdentity({ _accountId: lab.id }, { accounts: am, withHost: (x) => x, poolAuth: (x) => x });
  ok(badgeC.source === 'api-other' && badgeC.name === 'DeepSeek' && !('tail' in badgeC) && badgeC.accountId === ds.id && badgeX.source === 'api-other' && !('tail' in badgeX) && badgeX.name === 'Lab', 'the badge of a provider session: its name and its account id (NO key tail — B-ba7d: the page lays the person\'s read on), pay-per-use (api-other) — on Claude Code AND on Codex (the first cut said «API key» / «ChatGPT»)', { badgeC, badgeX });
  // the PLAIN API key's badge (B-ee0a smalls — the B-ba7d fix had no leg): its shown name and account id, NO key tail; a key added
  // without a name reads «API key»
  // (a stand-in store over the REAL name function — this suite's store keeps its keys behind a locked vault)
  const { publicNameOf } = require(path.join(REPO, 'src/key-names.js'));
  const apiT = ['Rb', '5d', 'Wq7n'].join(''), anonT = ['Mt', '2k', 'Yh4s'].join('');
  const PLAIN = { 'acct-plain1': { id: 'acct-plain1', type: 'api', name: 'Console', tail: apiT }, 'acct-anon1': { id: 'acct-anon1', type: 'api', name: 'API key …' + anonT, tail: anonT } };
  const stAcc = { get: (id) => PLAIN[id] || null, nameShownOf: (id) => (PLAIN[id] ? publicNameOf(PLAIN[id]) : null), providerRecordOf: () => null };
  const badgeA = H.get('claude').billingIdentity({ _accountId: 'acct-plain1' }, { accounts: stAcc, withHost: (x) => x, poolAuth: (x) => x });
  const badgeN = H.get('claude').billingIdentity({ _accountId: 'acct-anon1' }, { accounts: stAcc, withHost: (x) => x, poolAuth: (x) => x });
  ok(badgeA.source === 'api-key' && badgeA.name === 'Console' && badgeA.accountId === 'acct-plain1' && !('tail' in badgeA) && !JSON.stringify(badgeA).includes(apiT) && badgeN.name === 'API key' && !('tail' in badgeN) && !JSON.stringify(badgeN).includes(anonT),
    'the badge of a plain API-key conversation: its shown name and account id, NO key tail; a record under the old default name «API key …<tail>» reads «API key»', { badgeA, badgeN });
  // (MAJOR 4) codex's home is seeded ONCE: a real sessions folder found there (a link that once failed) keeps its transcripts
  fs.rmSync(path.join(homeX, 'sessions'), { force: true });
  fs.mkdirSync(path.join(homeX, 'sessions')); fs.writeFileSync(path.join(homeX, 'sessions', 'rollout-kept.jsonl'), '{}');
  fs.writeFileSync(path.join(homeX, 'auth.json'), '{"planted":true}');
  const c3 = await drive(wsCreate, { backend: 'codex', mode: 'chat', accountId: lab.id }, { accounts: am });
  ok(c3.spawned.length === 1 && gateOf(fs.existsSync(path.join(homeX, 'sessions', 'rollout-kept.jsonl'))) && !fs.existsSync(path.join(homeX, 'auth.json')), 'a later spawn never re-seeds the home: a real sessions folder keeps its transcripts; a login file found there IS removed before the spawn');
  const xk = H.get('claude').creds.providerSpawn({ provider: { auth: 'x-api-key', baseUrl: 'https://llm.example.test', models: [{ id: 'm' }], defaultModel: 'm' }, key: KEY, home: '/h' });
  ok(xk.localEnv.ANTHROPIC_API_KEY === KEY && xk.localEnv.ANTHROPIC_AUTH_TOKEN === '' && xk.localEnv.CLAUDE_CODE_USE_BEDROCK === '' && xk.localEnv.CLAUDE_CODE_USE_VERTEX === '', 'an x-api-key provider: the key in ANTHROPIC_API_KEY and the OTHER variable emptied (an ambient ANTHROPIC_AUTH_TOKEN would outrank it), the cloud switches off');
  console.log('— ⑤ RED controls');
  const CX = path.join(REPO, 'src/harnesses/codex.js'), CLD = path.join(REPO, 'src/harnesses/claude.js');
  const patched = (file, from, to) => { const t = fs.readFileSync(file, 'utf8'); if (!t.includes(from)) throw new Error('anchor missing: ' + from.slice(0, 60)); return M.load(path.relative(REPO, file), t.replace(from, to), 'pv-' + path.basename(file, '.js')); };
  const cxBad = patched(CX, '`model_providers.${t}.env_key=${q(PROVIDER_KEY_VAR)}`', '`model_providers.${t}.experimental_bearer_token=${q(key)}`');
  wire((b) => (b === 'codex' ? cxBad : H.get(b)));
  const k1 = await drive(wsCreate, { backend: 'codex', mode: 'chat', accountId: lab.id }, { accounts: am });
  ok(k1.spawned.length === 1 && verdictOf(k1.spawned[0].args.some((a) => String(a).includes(KEY))), 'CONTROL: a codex plan that puts the key in its -c table (experimental_bearer_token) puts it on the COMMAND LINE ⇒ the argv leg above goes RED');
  const clBad = patched(CLD, '  if (home) env.CLAUDE_SECURESTORAGE_CONFIG_DIR = home;\n', '');
  wire((b) => (b === 'claude' ? clBad : H.get(b)));
  const k2 = await drive(wsCreate, { backend: 'claude', accountId: ds.id }, { accounts: am }, AMBIENT);
  ok(k2.spawned.length === 1 && k2.spawned[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR !== homeC, 'CONTROL: a claude plan with no secret store of its own leaves the child on the MACHINE\'S store (its subscription login reachable) ⇒ the no-other-login leg goes RED', k2.spawned[0] && k2.spawned[0].env.CLAUDE_SECURESTORAGE_CONFIG_DIR);
  wire();
  const argvLine = '          if (spawnAccount && Array.isArray(spawnAccount.argv) && spawnAccount.argv.length) spawnArgs = [...spawnAccount.argv, ...spawnArgs];\n';
  ok(src.split(argvLine).length === 2, 'control: the argv line is one identifiable line of ws-create');
  const k3 = await drive(M.load('src/ws-create.js', anchored(src, argvLine, '', 'the create without the argv line'), 'pv-noargv'), { backend: 'codex', mode: 'chat', accountId: lab.id }, { accounts: am });
  ok(k3.spawned.length === 1 && !k3.spawned[0].args.some((a) => /^model_provider=/.test(String(a))), 'CONTROL: the create without the argv line spawns codex with NO provider table (it would talk to its own vendor with the key in a variable it never reads) ⇒ the -c leg goes RED');
  const fenceLine = "          if (pvModel && !pvModel.ok) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, scope: 'action', code: pvModel.code, message: pvModel.message })); break; }\n          if (pvModel) data.model = pvModel.model;\n";
  ok(src.split(fenceLine).length === 2, 'control: the model fence is two identifiable lines of ws-create');
  const k4 = await drive(M.load('src/ws-create.js', anchored(src, fenceLine, '', 'the create without the model fence'), 'pv-nofence'), { backend: 'claude', accountId: ds.id, model: 'gpt-5.5' }, { accounts: am });
  ok(k4.spawned.length === 1 && modelOf(k4) === 'gpt-5.5', 'CONTROL: the create without the model fence sends gpt-5.5 to DeepSeek ⇒ the not-served leg goes RED');
  const k5 = await drive(M.load('src/ws-create.js', anchored(src, fenceLine, '', 'the create without the model fence'), 'pv-nofence-resume'), { backend: 'claude', accountId: gone.id, resume: true, resumeId: 'conv-gone-2', ignoreNoConvo: true }, { accounts: am });
  const e5 = k5.sent.find((m) => m.type === 'error');
  ok(k5.spawned.length === 0 && !!e5 && e5.code === 'provider-unknown' && verdictOf(/unknown model provider/.test(e5.message)), 'past the fence (taken out), a removed provider on a RESUME is refused BY resolveForSpawn itself — provider-unknown with its code, nothing spawned, never rescued onto the machine\'s own login', e5);
  const PSF = PSP.create({ providers: store, dataDir: DATA });
  store.put({ id: 'pv-noaddr2', kind: 'self-hosted', label: 'NoAddr', preset: 'other', baseUrl: null, keyRef: MP.keyRefOf('pv-noaddr2'), wire: 'anthropic-messages', modelsSource: 'configured', models: [{ id: 'm-1' }] });
  vault.secretPut(MP.keyEntryOf('pv-noaddr2'), KEY);
  const threw = (fn) => { try { fn(); return null; } catch (e) { return e.code || e.message; } };
  const nvDir = scratchDir('hspawn-pv-unset');
  const nvault = VE.create({ dataDir: nvDir, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
  const nstore = PS.create({ dataDir: nvDir, vault: () => nvault, log: () => {} });
  nstore.put({ id: 'pv-unset1', kind: 'self-hosted', label: 'Unset', preset: 'other', baseUrl: 'https://llm.example.test/v1', keyRef: MP.keyRefOf('pv-unset1'), wire: 'anthropic-messages', modelsSource: 'configured', models: [{ id: 'm-1' }] });
  const bstore = PS.create({ dataDir: scratchDir('hspawn-pv-bad'), vault: () => ({ state: () => 'unlocked', secretGet: () => ({ ok: false, code: 'key-malformed' }), secretNames: () => [] }), log: () => {} });
  bstore.put({ id: 'pv-bad1', kind: 'self-hosted', label: 'Bad', preset: 'other', baseUrl: 'https://llm.example.test/v1', keyRef: MP.keyRefOf('pv-bad1'), wire: 'anthropic-messages', modelsSource: 'configured', models: [{ id: 'm-1' }] });
  const r3 = [threw(() => PSF('pv-noaddr2', 'claude')), threw(() => PSP.create({ providers: nstore, dataDir: nvDir })('pv-unset1', 'claude')), threw(() => PSP.create({ providers: bstore, dataDir: DATA })('pv-bad1', 'claude'))];
  ok(verdictOf(eq(r3, ['provider-no-address', 'vault_not_set_up', 'key-unreadable'])), 'the three refusals that had no leg, BY NAME before anything spawns: no address · the vault not set up · the key unreadable (a vault answer that is neither locked nor unset)', r3);
  // the session's META never holds the key (the premise the key-nowhere leg could not see: drive()'s writeSessionMeta was a noop)
  const metas = [];
  const cmeta = await drive(wsCreate, { backend: 'claude', accountId: ds.id }, { accounts: am, writeSessionMeta: (...a) => { metas.push(JSON.stringify(a)); } });
  const sess = cmeta.session ? Object.fromEntries(Object.entries(cmeta.session).filter(([k]) => k !== 'pty')) : null;
  let sessText = null; try { sessText = JSON.stringify(sess); } catch { sessText = null; }   // a session that cannot be written out proves nothing: the leg fails
  ok(cmeta.spawned.length === 1 && metas.length >= 1 && !metas.some((m) => m.includes(KEY)) && !!sess && typeof sessText === 'string' && !sessText.includes(KEY), 'the key is in NO session meta written (every writeSessionMeta call recorded) and NOT on the live session record (the pty aside) — only the provider\'s id', { metas: metas.length });
  // codex TERMINAL mode: the -c table ahead of the terminal's own words too
  const ct = await drive(wsCreate, { backend: 'codex', accountId: lab.id }, { accounts: am });
  const ta = (ct.spawned[0] || { args: [] }).args;
  const tIdx = ta.findIndex((a) => String(a).startsWith(`model_providers.pv_${lab.id.slice(3)}.base_url=`));
  ok(ct.spawned.length === 1 && tIdx > 0 && ta[tIdx - 1] === '-c' && gateOf(ta.includes(`model_provider="pv_${lab.id.slice(3)}"`)) && !ta.some((a) => String(a).includes(KEY)), 'codex in a TERMINAL: the provider\'s -c table rides its command line too (each item after its -c), the key never', ta.slice(-14));
  const PSRC = fs.readFileSync(path.join(REPO, 'src/server/provider-spawn.js'), 'utf8');
  const seedGuard = "{ let fresh = true; try { fs.lstatSync(path.join(home, 'sessions')); fresh = false; } catch { } if (fresh) h.creds.seedDir(home); }";
  const PSPm = M.load('src/server/provider-spawn.js', anchored(PSRC, seedGuard, 'h.creds.seedDir(home);', 'the provider home seeded every start'), 'pv-seed-always');
  am.setProviderSpawn(PSPm.create({ providers: store, dataDir: DATA }), (id, be, model) => PSPm.modelFor(store, id, model));
  fs.rmSync(path.join(homeX, 'sessions'), { recursive: true, force: true }); fs.mkdirSync(path.join(homeX, 'sessions')); fs.writeFileSync(path.join(homeX, 'sessions', 'rollout-kept.jsonl'), '{}');
  await drive(wsCreate, { backend: 'codex', mode: 'chat', accountId: lab.id }, { accounts: am });
  ok(!fs.existsSync(path.join(homeX, 'sessions', 'rollout-kept.jsonl')), 'CONTROL: a road that seeds the home on EVERY spawn deletes the transcripts a real sessions folder held ⇒ the seed-once leg goes RED');
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { }
}

// ── B-d578 P1-a (the coordinator's ruling r1126): OPENCODE'S ROAD — only what OpenCode's PUBLISHED pages carry (the one file's
// documented fields, the key's NAME never its value, the model per conversation), against a STAND-IN program that records
// what it was given; the road stays NOT OFFERED (no picker row) until the probe — one switch, the probe fixture's alone ──
console.log('P1-a OpenCode: the one file from the published pages, the key\'s name only, the road not offered (one switch: the probe\'s fixture)');
{
  const OC = require(path.join(REPO, 'src/opencode-provider-config.js'));
  const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
  const PS = require(path.join(REPO, 'src/server/provider-store.js'));
  const PSP = require(path.join(REPO, 'src/server/provider-spawn.js'));
  const MP = require(path.join(REPO, 'src/model-providers.js'));
  const crypto = require('node:crypto');
  const { spawnSync } = require('node:child_process');
  const DATA = scratchDir('hspawn-oc');
  const vault = VE.create({ dataDir: DATA, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {}, error() {} }, idleTimer: false, register: false });
  await vault.setup('correct horse battery staple', {});
  const store = PS.create({ dataDir: DATA, vault: () => vault, log: () => {} });
  const KEY = ['sk-', 'open', 'code-', 'probe-', '7c2e91'].join('');   // built at runtime (never a token-shaped literal)
  const lab = (await store.add({ preset: 'other', key: KEY, baseUrl: 'http://127.0.0.1:9/v1', model: 'qwen3-coder', label: 'Lab', wire: 'openai-chat' })).provider;
  const ant = (await store.add({ preset: 'other', key: KEY, baseUrl: 'http://127.0.0.1:9/anthropic', model: 'glm-4.6', label: 'Anth', wire: 'anthropic-messages' })).provider;
  const resp = (await store.add({ preset: 'other', key: KEY, baseUrl: 'http://127.0.0.1:9/v1', model: 'm1', label: 'Resp', wire: 'openai-responses' })).provider;
  // THE FILE — every key a documented one (the pages quoted in src/opencode-provider-config.js)
  const DOC_FIELDS = { top: ['$schema', 'providers', 'model'], provider: ['name', 'env', 'package', 'settings', 'models'], settings: ['baseURL'], model: ['name', 'limit'], limit: ['context', 'output'] };
  const c = OC.configOf(lab), e = c.ok ? c.doc.providers[lab.id] : null;
  const undocumented = [];
  if (c.ok) {
    for (const k of Object.keys(c.doc)) if (!DOC_FIELDS.top.includes(k)) undocumented.push(k);
    for (const k of Object.keys(e)) if (!DOC_FIELDS.provider.includes(k)) undocumented.push('providers.*.' + k);
    for (const k of Object.keys(e.settings)) if (!DOC_FIELDS.settings.includes(k)) undocumented.push('settings.' + k);
    for (const m of Object.values(e.models)) { for (const k of Object.keys(m)) if (!DOC_FIELDS.model.includes(k)) undocumented.push('models.*.' + k); for (const k of Object.keys(m.limit || {})) if (!DOC_FIELDS.limit.includes(k)) undocumented.push('limit.' + k); }
  }
  console.log('    judged file: ' + JSON.stringify(c.doc));
  ok(gateOf(c.ok) && c.doc.$schema === 'https://opencode.ai/config.json' && c.doc.model === `${lab.id}/qwen3-coder` && e.package === '@opencode/ai/providers/openai-compatible' && e.settings.baseURL === 'http://127.0.0.1:9/v1' && JSON.stringify(e.env) === '["VIBESPACE_PROVIDER_KEY"]' && gateOf(e.models['qwen3-coder']) && !undocumented.length,
    'the one file (providers page + config page): providers.<pv id> {name, env: [the key\'s VARIABLE], package openai-compatible, settings.baseURL, models} and model «<pv id>/<model>» — every key a documented one', undocumented);
  const ca = OC.configOf(ant), cr = OC.configOf(resp);
  ok(gateOf(ca.ok) && ca.doc.providers[ant.id].package === '@opencode/ai/providers/anthropic-compatible' && !cr.ok && cr.code === 'wire-undocumented' && verdictOf(/published pages name a runtime for Anthropic-compatible and OpenAI-compatible/.test(cr.message)),
    '…an Anthropic-compatible record takes the anthropic-compatible runtime; a Responses-API record is REFUSED by name (no runtime for it on the pages)', cr);
  // THE ROAD IS NOT OFFERED — no picker row: fitsHarness says no (code «later»), the product's spawn road refuses it
  const fit = MP.fits(lab).opencode;
  const plain = PSP.create({ providers: store, dataDir: DATA });
  let refused = null; try { plain(lab.id, 'opencode'); } catch (x) { refused = x.code; }
  const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'), wiring = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8');
  const createCalls = wiring.split('\n').filter((l) => l.includes("require('./provider-spawn.js').create("));
  ok(gateOf(fit) && fit.code === 'later' && !MP.fitsHarness(lab, 'opencode') && !MP.SPAWN_HARNESSES.includes('opencode') && refused === 'provider-unfit' && createCalls.length === 1 && verdictOf(createCalls.every((l) => !l.includes('probeRoads'))),
    'NOT OFFERED: opencode is no spawn harness (fits «later» — no picker row), the product\'s road refuses it (provider-unfit), and the product\'s ONE create (src/server/account-usage-routes.js) hands no probeRoads', { fit, refused, createCalls: createCalls.length });
  const PSRC = fs.readFileSync(path.join(REPO, 'src/server/provider-spawn.js'), 'utf8');
  // every file that builds or hands the spawn road (the server tree, the account manager, the create) — read, not walked
  const roadFiles = [...fs.readdirSync(path.join(REPO, 'src/server')).filter((f) => /\.js$/.test(f)).map((f) => 'server/' + f), 'accounts.js', 'ws-create.js'];
  const switchUsers = roadFiles.filter((f) => fs.readFileSync(path.join(REPO, 'src', f), 'utf8').includes('probeRoads'));
  ok(JSON.stringify(switchUsers) === JSON.stringify(['server/provider-spawn.js']) && !srv.includes('probeRoads') && gateOf(PSRC.includes("const probe = probeRoads && PROBE_ROADS.includes(backend) && typeof probeRoads[backend] === 'function' && (MP.fits(p)[backend] || {}).code === 'later' ? probeRoads[backend] : null;")) && verdictOf(PSRC.includes("const PROBE_ROADS = Object.freeze(['opencode']);")),
    'ONE switch: `probeRoads` is read in src/server/provider-spawn.js only (src/server, accounts.js, ws-create.js and server.js read), opens OpenCode BY NAME (PROBE_ROADS) and only while model-providers marks it «later», and no product file hands it', switchUsers);
  // THE SWITCH TURNED (the probe's fixture): the plan runs, the file is written under the provider's own home, 0600, no value in it
  const probe = PSP.create({ providers: store, dataDir: DATA, probeRoads: { opencode: OC.opencodeProviderSpawn } });
  const sp = probe(lab.id, 'opencode');
  const home = path.join(DATA, 'provider-homes', lab.id, 'opencode'), file = path.join(home, OC.CONFIG_REL);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const mode = fs.existsSync(file) ? (fs.statSync(file).mode & 0o777) : null;
  ok(gateOf(text) && JSON.parse(text).model === `${lab.id}/qwen3-coder` && mode === 0o600 && !text.includes(KEY) && gateOf(text.includes('VIBESPACE_PROVIDER_KEY')) && sp.argv.length === 0 && !JSON.stringify(sp.argv).includes(KEY) && sp.localEnv.VIBESPACE_PROVIDER_KEY === KEY && sp.localEnv.HOME === home && sp.secret.var === 'VIBESPACE_PROVIDER_KEY'
    && gateOf(Object.entries(OC.XDG).every(([k, rel]) => sp.localEnv[k] === `${home}/${rel}` && sp.plainEnv[k] === `${home}/${rel}`)) && !Object.values(sp.plainEnv).includes(KEY),
    'the switch turned: the file lands under the provider\'s own home (0600) naming the key\'s VARIABLE only; the value rides the env (the secret channel), no argv; HOME and the XDG config / data / state / cache folders all under that home (r1159 item 2)', { mode: mode && mode.toString(8), argv: sp.argv });
  let outside = null; const bad = PSP.create({ providers: store, dataDir: DATA, probeRoads: { opencode: () => ({ localEnv: {}, argv: [], secret: null, plainEnv: {}, files: [{ rel: '../../escape.json', text: '{}' }] }) } });
  try { bad(lab.id, 'opencode'); } catch (x) { outside = x.code; }
  const escaped = path.resolve(home, '../../escape.json');   // WHERE the bad name resolves (r1159 item 3: look there)
  const codexOpen = PSP.create({ providers: store, dataDir: DATA, probeRoads: { codex: OC.opencodeProviderSpawn } });
  let codexRef = null; try { codexOpen(lab.id, 'codex'); } catch (x) { codexRef = x.code; }
  // another harness marked «later» (gemini on a Google API record) is NOT opened by the switch: OpenCode by name only
  const gRec = { id: 'pv-g-probe', kind: 'google-api', label: 'G', baseUrl: 'https://x.example/v1', models: [{ id: 'g1' }], defaultModel: 'g1' };
  const gOpen = PSP.create({ providers: { thirdParty: () => [gRec], keyOf: () => ({ ok: true, value: KEY }) }, dataDir: DATA, harnessOf: () => ({ label: 'Gemini', creds: null }), probeRoads: { gemini: OC.opencodeProviderSpawn } });
  let gRef = null; try { gOpen(gRec.id, 'gemini'); } catch (x) { gRef = x.code; }
  ok(outside === 'plan-file-outside' && escaped === path.join(DATA, 'provider-homes', 'escape.json') && !fs.existsSync(escaped) && codexRef === 'provider-unfit' && (MP.fits(gRec).gemini || {}).code === 'later' && gRef === 'provider-unfit',
    'CONTROLS: a plan naming a file outside its home is refused by name and nothing lands where that name RESOLVES (data/provider-homes/escape.json); the switch opens no road that is not «later» (codex on a Chat Completions record), and no «later» road but OpenCode\'s (gemini on a Google API record stays unfit)', { outside, escaped: path.relative(DATA, escaped), codexRef, gRef });
  // THE WRITE IS A TEMP AND A RENAME, and a failed one leaves no temp (r1159 item 3) — watched at the fs calls the road makes
  const watch = (fn) => { const calls = [], w0 = fs.writeFileSync, r0 = fs.renameSync; fs.writeFileSync = (p2, ...a) => { calls.push(['write', String(p2)]); return w0.call(fs, p2, ...a); }; fs.renameSync = (a1, b1) => { calls.push(['rename', String(a1), String(b1)]); return r0.call(fs, a1, b1); }; let err = null; try { fn(); } catch (x) { err = x; } finally { fs.writeFileSync = w0; fs.renameSync = r0; } return { calls, err }; };
  const tmpOk = (calls) => { const wi = calls.findIndex(([k, p2]) => k === 'write' && p2.startsWith(file + '.tmp-')); return wi >= 0 && !calls.some(([k, p2]) => k === 'write' && p2 === file) && calls.some(([k, a1, b1], i) => k === 'rename' && i > wi && a1 === calls[wi][1] && b1 === file); };
  const w1 = watch(() => probe(lab.id, 'opencode'));
  const PSRC2 = fs.readFileSync(path.join(REPO, 'src/server/provider-spawn.js'), 'utf8');
  const MPS = mutantCopies('hspawn-oc', REPO);
  const direct = MPS.load('src/server/provider-spawn.js', anchored(PSRC2, "  try { fs.writeFileSync(tmp, String((f && f.text) || ''), { mode: 0o600 }); fs.renameSync(tmp, abs); }\n", "  try { fs.writeFileSync(abs, String((f && f.text) || ''), { mode: 0o600 }); }\n", 'the plan file written directly'), 'oc-direct');
  const w2 = watch(() => direct.create({ providers: store, dataDir: DATA, probeRoads: { opencode: OC.opencodeProviderSpawn } })(lab.id, 'opencode'));
  ok(!w1.err && gateOf(tmpOk(w1.calls)) && !w2.err && !tmpOk(w2.calls), 'the plan\'s file is written to a temp name and RENAMED onto its place (never written in place) — CONTROL: a copy writing it directly fails this check', { real: w1.calls.slice(-2).map((c) => c.map((x) => path.relative(DATA, x) || x)), direct: w2.calls.slice(-1).map((c) => c.map((x) => path.relative(DATA, x) || x)) });
  fs.rmSync(file, { force: true }); fs.mkdirSync(file, { recursive: true });   // a folder where the file goes ⇒ the rename fails
  let wf = null; try { probe(lab.id, 'opencode'); } catch (x) { wf = x.code; }
  const tmpsLeft = fs.readdirSync(path.dirname(file)).filter((n) => n.includes('.tmp-'));
  const keepTmp = MPS.load('src/server/provider-spawn.js', anchored(PSRC2, "  catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { } throw named('plan-file-unwritten',", "  catch (e) { throw named('plan-file-unwritten',", 'the failed write leaves its temp'), 'oc-keeptmp');
  let wf2 = null; try { keepTmp.create({ providers: store, dataDir: DATA, probeRoads: { opencode: OC.opencodeProviderSpawn } })(lab.id, 'opencode'); } catch (x) { wf2 = x.code; }
  const tmpsLeft2 = fs.readdirSync(path.dirname(file)).filter((n) => n.includes('.tmp-'));
  fs.rmSync(file, { recursive: true, force: true }); for (const n of tmpsLeft2) fs.rmSync(path.join(path.dirname(file), n), { force: true });
  probe(lab.id, 'opencode');   // the file back in its place for the stand-in below
  ok(wf === 'plan-file-unwritten' && tmpsLeft.length === 0 && wf2 === 'plan-file-unwritten' && tmpsLeft2.length === 1, 'a write that fails is refused by name («plan-file-unwritten», nothing started) and leaves NO temp behind — CONTROL: a copy without the clean-up leaves one', { wf, tmpsLeft, tmpsLeft2 });
  // THE STAND-IN PROGRAM — records what it was given (argv, cwd, HOME, the file it finds at ~/.config/opencode, the env value its
  // `env` names resolve to — as a digest, never the value). It is NOT OpenCode: what the real program does is UNPROVEN (below).
  const BIN = scratchDir('hspawn-oc-bin'), REC = path.join(BIN, 'record.json'), STAND = path.join(BIN, 'opencode-standin.cjs'), CWDO = scratchDir('hspawn-oc-cwd');
  fs.writeFileSync(STAND, [
    "const fs = require('fs'), path = require('path'), crypto = require('crypto');",
    "const f = path.join(process.env.HOME || '/nonexistent', '.config', 'opencode', 'opencode.json');",
    "let doc = null; try { doc = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { }",
    "const pid = doc && doc.model ? String(doc.model).split('/')[0] : null, ent = doc && doc.providers ? doc.providers[pid] : null;",
    "const name = ent && Array.isArray(ent.env) ? ent.env.find((n) => process.env[n]) : null;",
    "fs.writeFileSync(process.env.STANDIN_RECORD, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), home: process.env.HOME, found: !!doc, model: doc && doc.model, baseURL: ent && ent.settings && ent.settings.baseURL, keyVar: name, keyDigest: name ? crypto.createHash('sha256').update(process.env[name]).digest('hex') : null }));",
  ].join('\n'));
  const run = spawnSync(process.execPath, [STAND, 'acp'], { cwd: CWDO, env: { PATH: process.env.PATH, ...sp.localEnv, STANDIN_RECORD: REC }, timeout: 15000 });
  const rec = fs.existsSync(REC) ? JSON.parse(fs.readFileSync(REC, 'utf8')) : null;
  console.log('    judged stand-in record: ' + JSON.stringify(rec));
  ok(run.status === 0 && gateOf(rec) && gateOf(rec.found) && rec.home === home && JSON.stringify(rec.argv) === '["acp"]' && rec.cwd === CWDO && rec.model === `${lab.id}/qwen3-coder` && rec.baseURL === 'http://127.0.0.1:9/v1' && rec.keyVar === 'VIBESPACE_PROVIDER_KEY' && rec.keyDigest === crypto.createHash('sha256').update(KEY).digest('hex'),
    'the stand-in, run with what the PLAN gives (its env, the argv «acp», a cwd this leg picks — not the ACP road\'s own spawn, which the road being unoffered does not build): what the plan hands a program is enough to find the one file at ~/.config/opencode under the provider\'s HOME, its provider at the loopback address, the key through the named variable', rec);
  // THE MODEL PER CONVERSATION — ACP's documented option (configId «model», «provider/model»): the wrapper's own initial-model road
  const ACPW = fs.readFileSync(path.join(REPO, 'data/bin/acp-wrapper.js'), 'utf8');
  const planOf = OC.opencodeProviderSpawn({ provider: lab, key: KEY, home });   // the plan itself (the spawn account carries no function)
  ok(planOf.modelRef() === `${lab.id}/qwen3-coder` && planOf.modelRef('qwen3-coder-plus') === `${lab.id}/qwen3-coder-plus` && OC.modelRefOf(ant, 'glm-4.6') === `${ant.id}/glm-4.6` && verdictOf(ACPW.includes("request('session/set_config_option', { sessionId: meta.sessionId, configId, value }")),
    'the model per conversation is «<pv id>/<model>» — what ACP\'s session/set_config_option `model` takes (acp page) and the ACP wrapper already sends for ACP_WEBUI_MODEL');
  console.log('    UNPROVEN until the probe (the owner\'s word — no OpenCode on this box): ' + OC.UNPROVEN.map((u, i) => `(${i + 1}) ${u}`).join(' · '));
  ok(OC.UNPROVEN.length === 7 && gateOf(/INSTALLED OpenCode build accepts this shape/.test(OC.UNPROVEN[0])) && gateOf(/XDG/.test(OC.UNPROVEN[6])) && verdictOf(Object.values(OC.PAGES).every((u) => /^https:\/\/opencode\.ai\/docs\//.test(u))), 'what the real program does is SAID UNPROVEN by name (7 facts — first, that the INSTALLED build accepts this shape; last, its use of HOME or XDG unread), and every page the file is built from is named');
  try { fs.rmSync(DATA, { recursive: true, force: true }); fs.rmSync(BIN, { recursive: true, force: true }); fs.rmSync(CWDO, { recursive: true, force: true }); } catch { }
}

H.unregister('acme'); H.unregister('acme-nopool'); H.unregister('acme-perseat');
for (const d of [SOCK, BUF, CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
ok(capsOf('acme').pool === false && !H.has('acme'), 'unregister() takes the contributed caps row with it');
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
