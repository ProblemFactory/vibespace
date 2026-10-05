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
async function drive(mod, data) {
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
    (x) => !!x.spawned[0] && x.spawned[0].args.includes('--acme-status')],
];
for (const [name, line, old, judge] of CONTROLS) {
  ok(src.split(line).length === 2, `control ${name}: the gate is one identifiable line in the product source`);
  ok(judge(r), `control ${name}: the shipped gate passes the fake's row`);
  const mut = M.load('src/ws-create.js', src.replace(line, old), name.replace(/\W+/g, '-'));
  const x = await drive(mut, { backend: 'acme' });
  ok(x.sent.some((m) => m.type === 'created') && !judge(x), `control ${name}: with the id branch restored the fake's declared row is LOST (the leg above can go red)`);
}

H.unregister('acme'); H.unregister('acme-nopool');
for (const d of [SOCK, BUF, CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
ok(capsOf('acme').pool === false && !H.has('acme'), 'unregister() takes the contributed caps row with it');
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
