#!/usr/bin/env node
// THE SESSION SPAWN LINE (lane antigravity-spawn-argv, 2026-10-21) — src/spawn/line.js, the ONE builder of what a local
// session's dtach / the R6 daemon pipe runs: `node <wrapper> <buf> <meta> <ONE executable> …its args`, with the session's
// names in the spawn's ENV.
// The owner's 2.369.334 hub put `env K=V … <cli>` INSIDE every wrapper's argv. agy-wrapper puts agy's flags FIRST, so it
// ran `env --input-format …` ⇒ env's usage exit 125: every Antigravity conversation died at its start. The session
// token rode that line too (/proc/<pid>/cmdline is world-readable).
//   ① PURE: the builder table, one row per harness (each production adapter's own chat spawn spec). argv[4] = the
//     adapter's executable, argv[5…] = its args verbatim, no NAME=value word; env = the base + the pairs (a later pair
//     wins, as `env K=V` did); a launcher / an assignment / nothing at the executable's place throws BY NAME.
//   ② THE REAL ws-create (the production adapter registry, a stub pty: nothing executes): a chat create per harness —
//     claude, codex, opencode (ACP), antigravity — spawns dtach → the harness's wrapper → its ONE absolute executable.
//     No NAME=value word and no token on the line; the token, the session id, EDITOR, the cwd and the adapter's env in
//     the spawn's env.
//   ③ MUTANTS (ws-create copies): the pre-fix line (`env` + the pairs inside the wrapper's argv), and the pairs left
//     off the env ⇒ each leg goes RED.
// Run: node scripts/test-session-spawn-line.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''}`); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const L = require(path.join(REPO, 'src/spawn/line.js'));
const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
const W = (f) => '/w/' + f;
const EXE = { claude: '/opt/bin/claude', codex: '/opt/bin/codex', opencode: '/opt/bin/opencode', antigravity: '/opt/bin/agy' };
const registry = () => createAdapterRegistry({
  claudeCmd: EXE.claude, codexCmd: EXE.codex, chatWrapper: W('chat-wrapper.js'), codexChatWrapper: W('codex-chat-wrapper.js'),
  acpWrapper: W('acp-wrapper.js'), acpCommands: { opencode: EXE.opencode, antigravity: EXE.antigravity }, ptyWrapper: W('pty-wrapper.js'), buffersDir: '/b',
});
const WRAPPER = { claude: W('chat-wrapper.js'), codex: W('codex-chat-wrapper.js'), opencode: W('acp-wrapper.js'), antigravity: W('agy-wrapper.js') };

console.log('— ① PURE: the builder table, one row per harness (each production adapter\'s chat spawn spec)');
{
  const reg = registry();
  for (const id of Object.keys(EXE)) {
    const spec = reg.get(id).buildSessionArgs({ mode: 'chat', cwd: '/w x', model: 'm-1', extraArgs: ['--extra', 'two words'] });
    const line = L.sessionSpawnLine({ node: '/n/node', wrapper: spec.wrapper, bufFile: '/b/s.buf', metaFile: '/b/s.json', exe: spec.cmd, args: spec.args,
      env: { BASE: '1', TERM: 'dumb', ...spec.env }, pairs: ['EDITOR=/e/code', 'TERM=xterm-256color', 'VIBESPACE_SESSION_TOKEN=vsst_x', 'EQ=a=b'] });
    ok(line.argv[1] === WRAPPER[id] && line.argv[4] === EXE[id] && JSON.stringify(line.argv.slice(5)) === JSON.stringify(spec.args) && !line.argv.some((w) => ASSIGN.test(w)),
      `${id}: node <its wrapper> <buf> <meta> <${EXE[id]}> + the adapter's args verbatim — no NAME=value word`, line.argv);
    ok(line.env.BASE === '1' && line.env.TERM === 'xterm-256color' && line.env.EDITOR === '/e/code' && line.env.VIBESPACE_SESSION_TOKEN === 'vsst_x' && line.env.EQ === 'a=b'
      && Object.entries(spec.env).every(([k, v]) => line.env[k] === v),
      `${id}: env = the base + the adapter's env + the pairs (a later pair wins, a value keeps its own "=")`);
  }
  const throws = (exe) => { try { L.sessionSpawnLine({ node: 'n', wrapper: 'w', bufFile: 'b', metaFile: 'm', exe }); return ''; } catch (e) { return e.message; } };
  ok(/\/usr\/bin\/env is a launcher, not the agent's executable/.test(throws('/usr/bin/env')) && /env is a launcher/.test(throws('env'))
    && /an env assignment where the executable goes: EDITOR=…/.test(throws('EDITOR=/e/code')) && /no executable/.test(throws('')) && /no executable/.test(throws(null)),
    'the executable\'s place refuses a launcher (/usr/bin/env, env), an assignment and nothing — BY NAME, before anything spawns', [throws('/usr/bin/env'), throws('EDITOR=/e/code')]);
  let bad = ''; try { L.pairsEnv(['NOT A PAIR']); } catch (e) { bad = e.message; }
  ok(/not a NAME=value pair/.test(bad), 'a malformed pair throws (never a name silently dropped)', bad);
}

console.log('— ② the REAL ws-create: a chat create per harness, down to the (stub) pty spawn');
const SOCK = scratchDir('sline-sock'), BUF = scratchDir('sline-buf'), CWD = scratchDir('sline-cwd');
async function drive(mod, data) {
  const sent = [], spawned = [], active = new Map(), noop = () => undefined;
  const ctx = new Proxy({
    activeSessions: active, WS_OPEN: 1, sessionCounterRef: { value: 0 }, adapterRegistry: registry(), hosts: null, accounts: null, os, fs, path,
    execFileSync: require('child_process').execFileSync, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    SOCKETS_DIR: SOCK, BUFFERS_DIR: BUF, PTY_WRAPPER: W('pty-wrapper.js'), CHAT_WRAPPER: W('chat-wrapper.js'),
    NODE_CMD: '/n/node', DTACH_CMD: '/stub/dtach', ENV_CMD: '/usr/bin/env', CLAUDE_CMD: EXE.claude, EDITOR_CMD: '/stub/editor/code', AGENT_BIN_DIR: '/stub/bin', PORT: 1, X_ENV: {},
    cliCmds: { forSpawn: async (b, c) => c }, USAGE_STATUSLINE_CMD: '/stub/vibespace-usage', userStatuslineCmd: () => '',
    serverSetting: noop, harnessSetting: noop, harnessDeclares: () => false, harnessSpawnSettings: () => ({}),
    integrationEnabled: () => true, readSessionMeta: () => null, readLayouts: () => ({}), getSyncStore: () => null,
    pty: { spawn: (cmd, args, opts) => { spawned.push({ cmd, args, env: opts.env }); return { pid: 4242, onData() { }, onExit() { }, write() { }, resize() { }, kill() { } }; } },
    setupSessionPty: (s, id, p) => { s.pty = p; },
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)) });
  const handler = mod.createWsCreateHandler({
    ctx, agentEnv: () => ({ PATH: '/usr/bin:/bin', HOME: '/home/u' }), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
    execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null,
    getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p,
  });
  await handler({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, { type: 'create', mode: 'chat', cwd: CWD, reqId: 'r1', ...data }, new Set());
  const [id, session] = [...active.entries()][0] || [];
  return { sent, spawned, id, session };
}
/** the judge of ONE chat create: dtach → <wrapper> <buf> <meta> <the absolute executable> …, names in the env */
function judge(x, backend) {
  const sp = x.spawned[0];
  if (!sp || !x.session) return `no spawn (${x.sent.map((m) => m.type + (m.message ? ': ' + m.message : '')).join(' | ')})`;
  const a = sp.args, i = a.indexOf('/n/node');
  if (sp.cmd !== '/stub/dtach' || a[0] !== '-c' || i < 0) return `not dtach → node: ${sp.cmd} ${a.slice(0, 7).join(' ')}`;
  const line = a.slice(i);
  if (line[1] !== WRAPPER[backend]) return `wrapper ${line[1]}`;
  if (line[4] !== EXE[backend]) return `the wrapper's executable is ${line[4]}, not ${EXE[backend]}`;
  const named = a.filter((w) => ASSIGN.test(w)).map((w) => w.split('=')[0]);
  if (named.length) return `NAME=value words on the line: ${named.join(' ')}`;
  if (a.join(' ').includes(x.session.agentToken)) return 'the session token is on the line';
  const e = sp.env || {};
  const want = { CLAUDE_WEBUI_SESSION_ID: x.id, VIBESPACE_SESSION_TOKEN: x.session.agentToken, EDITOR: '/stub/editor/code', VIBESPACE_SESSION_CWD: CWD, TERM: 'xterm-256color' };
  const miss = Object.entries(want).filter(([k, v]) => e[k] !== v).map(([k]) => k);
  if (!String(e.PATH || '').startsWith('/stub/bin:')) miss.push('PATH (the tools first)');
  if (miss.length) return `the spawn's env misses ${miss.join(', ')}`;
  return '';
}
const wsCreate = require(path.join(REPO, 'src/ws-create.js'));
const runs = {};
for (const backend of Object.keys(EXE)) {
  const x = await drive(wsCreate, { backend, model: backend === 'antigravity' ? 'gemini-4-argon-high' : undefined, extraArgs: ['--extra'] });
  runs[backend] = x;
  const why = judge(x, backend);
  ok(!why, `${backend}: dtach → ${path.basename(WRAPPER[backend])} → ${EXE[backend]} …; no NAME=value word, no token on the line; the session's names in the spawn's env`, why);
}
{
  const x = runs.antigravity, sp = x.spawned[0], line = sp ? sp.args.slice(sp.args.indexOf('/n/node')) : [];
  ok(JSON.stringify(line.slice(5)) === '["--extra"]' && sp && sp.env.AGY_WEBUI_MODEL === 'gemini-4-argon-high' && sp.env.AGY_WEBUI_BACKEND === 'antigravity',
    'antigravity: after agy only the settings row\'s extra args (the wrapper adds its own flags FIRST); model and mode ride AGY_WEBUI_*', line.slice(4));
}

console.log('— ③ MUTANTS: each restores a pre-fix shape in a ws-create copy ⇒ the leg goes RED');
{
  const src = read('src/ws-create.js');
  const M = mutantCopies('session-spawn-line', REPO);
  const A = '            const r6Argv = r6Line.argv, r6Env = r6Line.env;\n';
  ok(src.split(A).length === 2, 'setup: the line is ONE identifiable statement in src/ws-create.js');
  const MUT = [
    ['the env prefix inside the wrapper\'s argv (2.369.336: `env K=V … <cli>` at the executable\'s place)',
      '            const r6Argv = [NODE_CMD, wrapper, bufFile, metaFileW, \'/usr/bin/env\', ...r6Pairs, `VIBESPACE_SESSION_TOKEN=${session.agentToken}`, spawnCmd, ...spawnArgs], r6Env = r6Line.env;\n',
      /the wrapper's executable is \/usr\/bin\/env/],
    ['the names off the env (the line built, its pairs dropped)', '            const r6Argv = r6Line.argv, r6Env = r6Base;\n', /the spawn's env misses/],
  ];
  for (const [name, line, want] of MUT) {
    const mod = M.load('src/ws-create.js', src.replace(A, line), name.replace(/\W+/g, '-').slice(0, 40));
    const verdicts = [];
    for (const backend of Object.keys(EXE)) verdicts.push(judge(await drive(mod, { backend, extraArgs: ['--extra'] }), backend));
    ok(verdicts.every((v) => want.test(v)), `MUTANT ${name} ⇒ RED on every harness`, verdicts);
  }
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
