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
const acme = (id, { pool }) => ({
  id, label: 'Acme', kind: 'terminal',
  caps: { pool },                                            // the DECLARED pool row the create's pool gate reads
  Adapter: AcmeAdapter, adapterConfig: (cfg) => ({ ptyWrapper: cfg.ptyWrapper }),
  wrapper: null, Normalizer: null, store: null, quota: NULL_QUOTA, resume: null,
  creds: { defaultIdField: 'defaultAcmeAccountId' },
  spawn: {
    authAtSpawn: ({ hostId }) => (hostId ? 'acme-remote' : 'acme-global'),
    resumeMayFork: true,
    statusline: (args, command) => [...args, '--acme-status', command],
  },
});

console.log('— ① the ONE registration line');
H.register(acme('acme', { pool: true }));
H.register(acme('acme-nopool', { pool: false }));
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
async function drive(mod, data, extra = {}) {
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
    NODE_CMD: process.execPath, DTACH_CMD: '/stub/dtach', ENV_CMD: '/usr/bin/env', CLAUDE_CMD: 'claude-must-not-run',
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
    ctx, agentEnv: () => ({}), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
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
ok(!!sp && sp.args.includes('ACME_HOME=/acme-home'), 'the adapter\'s spawn env rides the argv env pairs', sp && sp.args.filter((a) => /=/.test(a)).slice(-3));
ok(r.session && r.session.backend === 'acme' && r.session.mode === 'terminal', 'the live session is an acme terminal');
ok(r.session && r.session._authAtSpawn === 'acme-global', 'its global-login guess is the DECLARED spawn.authAtSpawn row', r.session && r.session._authAtSpawn);
ok(!!sp && sp.args.includes('--acme-status') && sp.args.includes('/stub/vibespace-usage'), 'the terminal statusline goes through the DECLARED spawn.statusline hook', sp && sp.args.slice(-4));
ok(r.resolved.join() === 'acme', 'caps.pool:true + managed creds ⇒ the pool/billing gate asks resolveForSpawn for acme', r.resolved);
const rn = await drive(wsCreate, { backend: 'acme-nopool' });
ok(rn.sent.some((m) => m.type === 'created') && rn.resolved.length === 0, '…and caps.pool:false skips it (the gate is the ROW, not the id)', rn.resolved);
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
  ['pool gate', "          if (capsOf(backend).pool && harness && harness.creds && accounts) {",
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

H.unregister('acme'); H.unregister('acme-nopool');
for (const d of [SOCK, BUF, CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
ok(capsOf('acme').pool === false && !H.has('acme'), 'unregister() takes the contributed caps row with it');
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
