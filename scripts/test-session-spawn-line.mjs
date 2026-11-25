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
//   ④ B-460d — WHAT A CONVERSATION STARTS NEVER OUTRANKS THE HUB (src/server/spawn-priority.js): the line's priority words
//     (PURE), the verdict (the setting, a remote conversation, a machine with no nice program — said once), BOTH local roads
//     of the real ws-create (dtach and the daemon pipe) and the real JobManager's wrapper spawn carry `nice -n 5`; the
//     setting off = the release's spawn byte for byte (the RED control: a copy with the priority cut); REAL processes —
//     the line started, its child and the child's child report min(19, base + 5) from the suite's own niceness, from 15 and
//     from 19 (a judged premise there; r598: never a red for the niceness the suite runs at); the fact rides the session and
//     its meta, and its words are Session Properties' row; the job wrapper's 'error' listener runs (a late exec failure is
//     ONE journal line, never a throw — RED: a copy without the listener throws).
//   ⑤ B-460d's remainder — A PAIRED MACHINE'S CONVERSATION STARTS BELOW ITS MACHINE'S AGENT: the nice look in ONE shared file
//     (src/nice-program.js — the hub's verdict and the device agent's hello); the device's verdict IS priorityFor with the
//     machine's own program (nicePathOf: its shape); the paired spec's builder (none ⇒ the release's spec byte for byte); both
//     dial branches wired; the spawn census RED for a spec without the builder and a hello without nicePath; the Windows shell
//     door still sees `sh`; the row's words; r705: the switch off said as off, the journal line once a machine, ONE real
//     dial create driven to its meta write (an adopted start keeps its meta's fact). The REAL agent's processes: test-sysinfo-op 4c.
// Run: node scripts/test-session-spawn-line.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''}`); } };
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
async function drive(mod, data, { setting = () => undefined, hosts = null, extra = {} } = {}) {
  const sent = [], spawned = [], metas = [], active = new Map(), noop = () => undefined;
  const ctx = new Proxy({
    activeSessions: active, WS_OPEN: 1, sessionCounterRef: { value: 0 }, adapterRegistry: registry(), hosts, accounts: null, os, fs, path, writeSessionMeta: (sock, m) => { metas.push(m); },
    execFileSync: require('child_process').execFileSync, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }),
    SOCKETS_DIR: SOCK, BUFFERS_DIR: BUF, PTY_WRAPPER: W('pty-wrapper.js'), CHAT_WRAPPER: W('chat-wrapper.js'),
    NODE_CMD: '/n/node', DTACH_CMD: '/stub/dtach', ENV_CMD: '/usr/bin/env', CLAUDE_CMD: EXE.claude, EDITOR_CMD: '/stub/editor/code', AGENT_BIN_DIR: '/stub/bin', PORT: 1, X_ENV: {},
    cliCmds: { forSpawn: async (b, c) => c }, USAGE_STATUSLINE_CMD: '/stub/vibespace-usage', userStatuslineCmd: () => '',
    serverSetting: setting, harnessSetting: noop, harnessDeclares: () => false, harnessSpawnSettings: () => ({}),
    integrationEnabled: () => true, readSessionMeta: () => null, readLayouts: () => ({}), getSyncStore: () => null,
    pty: { spawn: (cmd, args, opts) => { spawned.push({ cmd, args, env: opts.env }); return { pid: 4242, onData() { }, onExit() { }, write() { }, resize() { }, kill() { } }; } },
    setupSessionPty: (s, id, p) => { s.pty = p; },
    ...extra,   // a create's own stand-ins (r705 (5): the dial bridge, the agent root, a stored meta)
  }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined)) });
  const handler = mod.createWsCreateHandler({
    ctx, agentEnv: () => ({ PATH: '/usr/bin:/bin', HOME: '/home/u' }), crashLoopRef: { map: new Map() }, noConvoRef: { map: new Map() },
    execFileAsync: async () => ({ stdout: '', stderr: '' }), pickCodexThreadCandidate: () => null,
    getSessionKey: (s) => `${s.backend}:${s.backendSessionId}`, normalizeComparablePath: (p) => p,
  });
  await handler({ readyState: 1, send: (t) => sent.push(JSON.parse(t)) }, { type: 'create', mode: 'chat', cwd: CWD, reqId: 'r1', ...data }, new Set());
  const [id, session] = [...active.entries()][0] || [];
  return { sent, spawned, metas, id, session };
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
    const mod = M.load('src/ws-create.js', editAnchor(src, A, line, "src/ws-create.js"), name.replace(/\W+/g, '-').slice(0, 40));
    const verdicts = [];
    for (const backend of Object.keys(EXE)) verdicts.push(judge(await drive(mod, { backend, extraArgs: ['--extra'] }), backend));
    ok(verdicts.every((v) => want.test(v)), `MUTANT ${name} ⇒ RED on every harness`, verdicts);
  }
}
console.log('— ④ B-460d: what a conversation starts never outranks the hub — nice -n 5 on the spawn itself');
{
  const SPRI = require(path.join(REPO, 'src/server/spawn-priority.js'));
  const NICE = SPRI.niceProgram();
  ok(typeof NICE === 'string' && NICE.startsWith('/') && SPRI.NICE_DIRS.includes(path.dirname(NICE)), `setup: this machine's nice program is found in a fixed system directory (${NICE})`);
  // PURE: the words
  let bad = []; for (const p of [{ nice: 'nice', by: 5 }, { nice: '/usr/bin/nice', by: 0 }, { nice: '/usr/bin/nice', by: 20 }, { nice: '/usr/bin/ni ce', by: 5 }]) { try { L.priorityArgv(p); } catch (e) { bad.push(e.message); } }
  ok(JSON.stringify(L.priorityArgv({ nice: '/usr/bin/nice', by: 5 })) === '["/usr/bin/nice","-n","5"]' && L.priorityArgv(null).length === 0 && bad.length === 4 && L.PRIORITY_BY === 5,
    'the words of a start\'s priority: `<absolute nice> -n 5`, none for null; a bare name, a step of 0 or 20, a path with a space refused by name', bad);
  const base = { node: '/n/node', wrapper: '/w/chat-wrapper.js', bufFile: '/b/s.buf', metaFile: '/b/s.json', exe: '/opt/bin/claude', args: ['--x'], env: { A: '1' }, pairs: ['B=2'] };
  const plain = L.sessionSpawnLine(base), low = L.sessionSpawnLine({ ...base, priority: { nice: NICE, by: 5 } });
  ok(JSON.stringify(low.argv) === JSON.stringify([NICE, '-n', '5', ...plain.argv]) && JSON.stringify(plain.argv) === '["/n/node","/w/chat-wrapper.js","/b/s.buf","/b/s.json","/opt/bin/claude","--x"]' && JSON.stringify(low.env) === JSON.stringify(plain.env),
    'the line with a priority = `nice -n 5` + the line without it, word for word; with none it is the release\'s line (node first); the env never changes', low.argv);
  // the verdict
  const said = [], quiet = { warn: (l) => said.push(l) };
  const on = SPRI.priorityFor({ log: quiet }), off = SPRI.priorityFor({ serverSetting: (k) => (k === SPRI.SETTING ? false : undefined), log: quiet }), remote = SPRI.priorityFor({ local: false, log: quiet });
  const none1 = SPRI.priorityFor({ nice: () => null, log: quiet }), none2 = SPRI.priorityFor({ nice: () => null, log: quiet });
  ok(on.priority && on.priority.nice === NICE && on.priority.by === 5 && on.fact.by === 5 && off.priority === null && off.fact.why === 'off' && remote.priority === null && remote.fact.why === 'remote'
    && none1.priority === null && none1.fact.why === 'no-nice' && none2.fact.why === 'no-nice' && said.length === 1 && /no nice program/.test(said[0]) && SPRI.SETTING === 'agents.lowerCpuPriority',
    'the verdict: on (unset) ⇒ nice +5; the setting off ⇒ none; a remote conversation ⇒ none (its machine\'s own); a machine with NO nice program ⇒ it still starts, at the hub\'s priority, and the journal says so ONCE', { on, off, remote, none1, said });
  const throwing = SPRI.priorityFor({ serverSetting: () => { throw new Error('settings not ready'); }, log: quiet });
  ok(throwing.priority && throwing.priority.by === 5, 'a setting that cannot be read is the default (on) — never a start refused');
  ok(SPRI.factOf({ by: 5 }).by === 5 && SPRI.factOf({ by: 0, why: 'off' }).why === 'off' && SPRI.factOf({ by: 0, why: 'other' }) === null && SPRI.factOf({ by: 30 }) === null && SPRI.factOf('5') === null,
    'a stored fact reads back only in its own shapes');
  // THE REAL ws-create: BOTH local roads
  const X = await drive(wsCreate, { backend: 'claude' });
  const dt = X.spawned[0] ? X.spawned[0].args : [];
  // the dtach road's judgement, ONE function (the red control below re-runs it on the release's copy)
  const dtachNice = (x) => { const a = x && x.spawned[0] ? x.spawned[0].args : []; return a[0] === '-c' && a.indexOf('/n/node') === 8 && JSON.stringify(a.slice(5, 8)) === JSON.stringify([NICE, '-n', '5']); };
  ok(dtachNice(X) && X.session && X.session._cpuNice && X.session._cpuNice.by === 5 && X.metas.some((m) => m.cpuNice && m.cpuNice.by === 5),
    `the dtach road: dtach -c <sock> -E -r none ${NICE} -n 5 /n/node <wrapper> …; the session's fact {by: 5} and its meta's cpuNice (a restart keeps it)`, dt.slice(0, 10));
  const pipes = [];
  const hosts = { device: async () => ({ openPipeSession: async (o) => { pipes.push(o); return { pid: 77, ready: Promise.resolve({ pid: 77 }), write() { }, kill() { }, resize() { }, onData: null, onExit: null }; } }) };
  const P = await drive(wsCreate, { backend: 'claude' }, { hosts, setting: (k) => (k === 'agentd.localPipeSessions' ? true : undefined) });
  ok(pipes.length === 1 && pipes[0].cmd === NICE && JSON.stringify(pipes[0].args.slice(0, 3)) === '["-n","5","/n/node"]' && !P.spawned.length,
    'the daemon pipe road (agentd.localPipeSessions on): the pipe opens `nice -n 5 /n/node <wrapper> …` — the same line, nothing spawned by dtach', pipes[0] && [pipes[0].cmd, ...pipes[0].args.slice(0, 4)]);
  const OFF = (k) => (k === SPRI.SETTING ? false : undefined);
  const XO = await drive(wsCreate, { backend: 'claude' }, { setting: OFF });
  // THE RED CONTROL: the release's spawn = a ws-create copy with the priority cut out of the line
  const src = read('src/ws-create.js'), M = mutantCopies('session-spawn-line-nice', REPO);
  const CUTP = '              exe: spawnCmd, args: spawnArgs, priority: r6Pri.priority,\n';
  const rel = src.split(CUTP).length === 2 ? M.load('src/ws-create.js', editAnchor(src, CUTP, '              exe: spawnCmd, args: spawnArgs,\n', "src/ws-create.js"), 'no-priority') : null;   // stale-pins: kept (the red control rebuilds the release's line)
  const XR = rel ? await drive(rel, { backend: 'claude' }) : null;
  const scrub = (x) => JSON.stringify(x.spawned[0] && x.spawned[0].args.map((w) => String(w).replace(/sess-\d+-\d+|cw-\d+-\d+/g, 'ID')));
  ok(XO.spawned[0] && XR && XR.spawned[0] && scrub(XO) === scrub(XR) && !XO.spawned[0].args.includes(NICE) && XO.session._cpuNice.why === 'off',
    'the setting OFF = the release\'s spawn, word for word (a copy with the priority cut out of the line) — and the fact says why', { off: scrub(XO), release: XR && scrub(XR) });
  ok(XR && XR.spawned[0] && !XR.spawned[0].args.includes(NICE) && !dtachNice(XR), 'RED CONTROL: that copy (the release) starts the conversation at the hub\'s priority — the dtach-road judgement above, re-run on it, is red', XR && XR.spawned[0] && XR.spawned[0].args.slice(0, 8));
  SPRI._reset(); SPRI.niceProgram({ dirs: [path.join(os.tmpdir(), 'vs-no-nice-here')] });   // this process: a machine with no nice program
  const XN = await drive(wsCreate, { backend: 'claude' });
  ok(XN.spawned[0] && XN.spawned[0].args[5] === '/n/node' && XN.session._cpuNice.why === 'no-nice', 'a machine without the nice program still starts the conversation — at the hub\'s priority, the fact says why', XN.spawned[0] && XN.spawned[0].args.slice(0, 7));
  SPRI._reset();
  // THE REAL JobManager (a copy whose child_process.spawn records — nothing executes): the wrapper's spawn carries it
  const JSRC = read('src/jobs.js'), SP0 = "const { spawn, execFile } = require('child_process');";
  const jobsMod = JSRC.split(SP0).length === 2 ? M.load('src/jobs.js', editAnchor(JSRC, SP0, "const { execFile } = require('child_process'); const spawn = (...a) => globalThis.__vsJobSpawn(...a);", "src/jobs.js"), 'jobs-spawn-seam') : null;
  const jobArgv = async (setting) => {
    const got = [];
    globalThis.__vsJobSpawn = (cmd, args) => { got.push([cmd, ...args]); return { pid: 4343, unref() { }, on() { }, once() { }, stdio: [], kill() { } }; };
    const dir = scratchDir('sline-jobs');
    const jm = new jobsMod.JobManager({ dataDir: dir, broadcast() { }, notifyUser() { return { ok: true }; }, log() { }, spawnPriority: () => SPRI.priorityFor({ serverSetting: setting, log: quiet }) });
    jm.init(); for (const t of jm._timers || []) clearInterval(t); jm._timers = [];
    const r = jm.create({ kind: 'task', name: 'nice-check', cmd: { argv: ['sh', '-c', 'true'], cwd: dir }, owner: { conversation: null, sessionId: 's-N', sessionCreatedAt: 1, groupsSnapshot: [] } }, { isUser: true, groups: new Set() });
    try { for (const j of jm.jobs.values()) j.desiredUp = false; jm.shutdown(); } catch { }
    const sp = (got[0] || []).find((w) => /\/spec\.\d+\.json$/.test(String(w)));   // B-f494: the spec the wrapper would read (nothing ran: still on disk)
    let spec = null; try { spec = sp ? JSON.parse(fs.readFileSync(sp, 'utf8')) : null; } catch { spec = null; }
    return { argv: got[0] || null, err: r && r.error, spec };
  };
  const JON = jobsMod ? await jobArgv(() => undefined) : null, JOFF = jobsMod ? await jobArgv(OFF) : null;
  ok(JON && JON.argv && JSON.stringify(JON.argv.slice(0, 4)) === JSON.stringify([NICE, '-n', '5', process.execPath]) && /job-wrapper\.js$/.test(JON.argv[4])
    && JOFF && JOFF.argv && JOFF.argv[0] === process.execPath && JSON.stringify(JOFF.argv.slice(1).map((w) => w.replace(/\/[^ ]*sline-jobs[^/]*/, 'D').replace(/jb-[0-9a-f]+/g, 'J').replace(/\d{10,}/g, 'T'))) === JSON.stringify(JON.argv.slice(4).map((w) => w.replace(/\/[^ ]*sline-jobs[^/]*/, 'D').replace(/jb-[0-9a-f]+/g, 'J').replace(/\d{10,}/g, 'T'))),
    'the jobs road (the real JobManager): its wrapper starts as `nice -n 5 node job-wrapper.js …`; the setting off = `node job-wrapper.js …`, the same words after it', { on: JON && (JON.argv || JON.err), off: JOFF && (JOFF.argv || JOFF.err) });
  // B-f494: A LOWERED JOB'S SCOPE WEIGHS LESS — the spec carries cpuWeight 33 when the start is lowered, none when it is not; RED CONTROL
  // (in memory): the engine without that line writes no weight under the same priority
  const CW = '      if (pri && pri.priority) spec.cpuWeight = JOB_CPU_WEIGHT;\n';
  let jobsNoW = null, noW = null;   // both edits through scratch.mjs anchored() (test-suite-files-parse §3): a moved line fails by name
  try { jobsNoW = M.load('src/jobs.js', anchored(anchored(JSRC, SP0, "const { execFile } = require('child_process'); const spawn = (...a) => globalThis.__vsJobSpawn(...a);", 'B-f494 the jobs spawn seam'), CW, '', 'B-f494 the engine without the job\'s cpu weight'), 'jobs-no-cpu-weight'); } catch (e) { noW = String((e && e.message) || e).slice(0, 200); }
  if (!jobsNoW) ok(false, `the control «the engine without the job's cpu weight» built nothing — ${noW}`);
  else {
    const ctl = await (async () => { const got = []; globalThis.__vsJobSpawn = (cmd, args) => { got.push([cmd, ...args]); return { pid: 4345, unref() { }, on() { }, once() { }, stdio: [], kill() { } }; };
      const dir = scratchDir('sline-jobs-nw'); const jm = new jobsNoW.JobManager({ dataDir: dir, broadcast() { }, notifyUser() { return { ok: true }; }, log() { }, spawnPriority: () => SPRI.priorityFor({ serverSetting: () => undefined, log: quiet }) });
      jm.init(); for (const t of jm._timers || []) clearInterval(t); jm._timers = [];
      jm.create({ kind: 'task', name: 'nice-cw', cmd: { argv: ['sh', '-c', 'true'], cwd: dir }, owner: { conversation: null, sessionId: 's-W', sessionCreatedAt: 1, groupsSnapshot: [] } }, { isUser: true, groups: new Set() });
      try { for (const j of jm.jobs.values()) j.desiredUp = false; jm.shutdown(); } catch { }
      const sp = (got[0] || []).find((w) => /\/spec\.\d+\.json$/.test(String(w))); try { return sp ? JSON.parse(fs.readFileSync(sp, 'utf8')) : null; } catch { return null; } })();
    ok(!!JON && !!JON.spec && JON.spec.cpuWeight === 33 && !!JOFF && !!JOFF.spec && JOFF.spec.cpuWeight === undefined && !!ctl && ctl.cpuWeight === undefined,
      `B-f494: a lowered job's spec asks its scope for CPUWeight ${JON && JON.spec && JON.spec.cpuWeight} (nice +5's share of 100); the setting off asks none; RED CONTROL: the engine without that line asks none under the same priority`, { on: JON && JON.spec && JON.spec.cpuWeight, off: JOFF && JOFF.spec && JOFF.spec.cpuWeight, ctl: ctl && ctl.cpuWeight });
  }
  // (its verdict's LENS THREE should) THE WRAPPER'S 'error' LISTENER RUNS: the stub child is a real EventEmitter; an exec that
  // fails late (the nice program gone since the one look) is ONE journal line, never a throw out of the child's emitter
  const { EventEmitter } = require('events');
  const errRun = async (mod, tag) => {
    const logs = []; let kid = null;
    globalThis.__vsJobSpawn = () => { kid = Object.assign(new EventEmitter(), { pid: 4344, unref() { }, stdio: [], kill() { } }); return kid; };
    const dir = scratchDir(`sline-jobs-${tag}`);
    const jm = new mod.JobManager({ dataDir: dir, broadcast() { }, notifyUser() { return { ok: true }; }, log: (l) => logs.push(String(l)), spawnPriority: () => SPRI.priorityFor({ serverSetting: () => undefined, log: quiet }) });
    jm.init(); for (const t of jm._timers || []) clearInterval(t); jm._timers = [];
    jm.create({ kind: 'task', name: 'nice-err', cmd: { argv: ['sh', '-c', 'true'], cwd: dir }, owner: { conversation: null, sessionId: 's-E', sessionCreatedAt: 1, groupsSnapshot: [] } }, { isUser: true, groups: new Set() });
    let threw = null;
    try { if (kid) kid.emit('error', Object.assign(new Error(`spawn ${NICE} ENOENT`), { code: 'ENOENT' })); } catch (e) { threw = e; }
    try { for (const j of jm.jobs.values()) j.desiredUp = false; jm.shutdown(); } catch { }
    return { spawned: !!kid, threw: threw ? (threw.code || threw.message) : null, said: logs.filter((l) => l.includes(`its wrapper did not start (${NICE}): spawn ${NICE} ENOENT`)).length };
  };
  const ERR = jobsMod ? await errRun(jobsMod, 'err') : null;
  const LIS = "      child.once('error', (e) => {";
  const SEAM = JSRC.split(SP0).length === 2 ? JSRC.replace(SP0, "const { execFile } = require('child_process'); const spawn = (...a) => globalThis.__vsJobSpawn(...a);").split('\n') : [];
  const noLis = SEAM.filter((l) => !l.startsWith(LIS));
  const jobsNoLis = SEAM.length && noLis.length === SEAM.length - 1 ? M.load('src/jobs.js', noLis.join('\n'), 'jobs-no-error-listener') : null;
  const NOL = jobsNoLis ? await errRun(jobsNoLis, 'err-red') : null;
  ok(ERR && ERR.spawned && ERR.threw === null && ERR.said === 1 && NOL && NOL.spawned && NOL.threw === 'ENOENT' && NOL.said === 0,
    `a job wrapper whose exec fails late is ONE journal line («its wrapper did not start (${NICE}): …»), never a throw out of the child; RED CONTROL: without the listener the same 'error' throws (${NOL && NOL.threw})`, { ERR, NOL });
  delete globalThis.__vsJobSpawn;
  // REAL PROCESSES: the line started as the roads start it — the wrapper, its child and the child's child each report their niceness
  const { spawnSync } = require('child_process');
  const stand = path.join(scratchDir('sline-nice'), 'stand-in.cjs');
  fs.writeFileSync(stand, "const os = require('os'), { spawnSync } = require('child_process');\n"
    + "if (process.argv[2] === 'child') { const g = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(require(\"os\").getPriority()))'], { encoding: 'utf8' }); process.stdout.write(os.getPriority() + ' ' + g.stdout); }\n"
    + "else { const c = spawnSync(process.execPath, [__filename, 'child'], { encoding: 'utf8' }); process.stdout.write(os.getPriority() + ' ' + c.stdout); }\n");
  const mine = os.getPriority();
  // run(priority, from): THE line started as the roads start it, from a parent at niceness `from` — the suite's own, or raised to
  // it by the REAL nice program in front (its own name, never a copy: a multi-call program decides what it is by its file name)
  const run = (priority, from = mine) => {
    const l = L.sessionSpawnLine({ node: process.execPath, wrapper: stand, bufFile: 'b', metaFile: 'm', exe: '/bin/true', priority });
    const argv = from > mine ? [NICE, '-n', String(from - mine), ...l.argv] : l.argv;
    const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: 20000 }); return String(r.stdout || '').trim().split(/\s+/).map(Number);
  };
  // THE JUDGE, one for EVERY niceness it can meet (主开发 r598: the box's tier runs at 15 since the hub starts its jobs lowered):
  // lowered = min(19, base + 5) and ABOVE plain, plain = base. At 19 itself no step can be shown: a judged PREMISE (all six read
  // 19), said by name — never a silent pass and never a red for the place it runs in
  const judge = (base, low, plain) => (base >= 19
    ? { premise: true, ok: low.length === 3 && plain.length === 3 && [...low, ...plain].every((n) => n === 19) }
    : { premise: false, ok: low.length === 3 && plain.length === 3 && low.every((n) => n === Math.min(19, base + 5)) && plain.every((n) => n === base) && Math.min(19, base + 5) > base });
  const LOW = SPRI.priorityFor({ log: quiet }).priority, PLAIN = SPRI.priorityFor({ serverSetting: OFF, log: quiet }).priority;
  // from this suite's own niceness, from 15 (the box's tier today) and from 19 (the cap) — each one this suite can reach (a niceness
  // is never lowered without privilege, so a base under the suite's own is not made, and that is said)
  for (const base of [...new Set([mine, 15, 19])].sort((a, b) => a - b)) {
    if (base < mine) { console.log(`  · from niceness ${base}: not made — this suite already runs at ${mine}`); continue; }
    const low = run(LOW, base), plain = run(PLAIN, base), j = judge(base, low, plain);
    ok(j.ok, j.premise
      ? `PREMISE (judged) from niceness ${base}, the cap: no step below it can be shown — all three processes read 19, lowered and plain alike`
      : `REAL processes from niceness ${base}${base === mine ? ' (this suite\'s own)' : ''}: the line's first process, its child and the child's child run at ${Math.min(19, base + 5)} (${base} + 5, at most 19) — born with it, inherited; the setting off ⇒ all three at ${base}`, { low, plain });
    if (!j.premise) ok(!judge(base, plain, plain).ok, `CONTROL from niceness ${base}: the same judge on a start NOT lowered (the plain run in the lowered place) is RED`, { plain });
  }
  // THE SPAWN CENSUS reads each road's ONE place (scripts/spawn-env-census.mjs PRIORITY_ROADS — test-architecture §94b)
  const C = await import(path.join(REPO, 'scripts/spawn-env-census.mjs'));
  const FILES = C.filesOf(REPO), rd = (patch) => (f) => (f in patch ? patch[f] : (() => { try { return read(f); } catch { return ''; } })());
  const clean = C.priorityJudge(rd({}), FILES);
  const cutWs = C.priorityJudge(rd({ 'src/ws-create.js': src.replace(CUTP, '              exe: spawnCmd, args: spawnArgs,\n') }), FILES);   // stale-pins: kept (the red control rebuilds the release's line)
  const cutJob = C.priorityJudge(rd({ 'src/jobs.js': JSRC.replace('const argv = [...priorityArgv(pri && pri.priority), process.execPath,', 'const argv = [process.execPath,') }), FILES);
  const VRS = read('src/server/vault-run-door.js'), cutVault = C.priorityJudge(rd({ 'src/server/vault-run-door.js': VRS.replace('if (by && child && child.pid) { try { lowerImpl(child.pid, by); } catch { } }', '') }), FILES);   // B-7f18
  const BRS = read('src/server/boot-restore.js'), RA = "exe: 'ssh', args: sshArgs });";
  const twoInBr = C.priorityJudge(rd({ 'src/server/boot-restore.js': BRS.replace(RA, RA + "\n      sessionSpawnLine({ node: NODE_CMD, wrapper: CHAT_WRAPPER, bufFile, metaFile: metaFileW, exe: 'claude' });") }), FILES);
  const newRoad = C.priorityJudge(rd({ 'src/server/new-road.js': "const { sessionSpawnLine } = require('../spawn/line.js');\nsessionSpawnLine({ node: 'n', wrapper: 'w', bufFile: 'b', metaFile: 'm', exe: 'x' });\n" }), [...FILES, 'src/server/new-road.js']);
  ok(!clean.length && cutWs.some((r) => /PRIORITY ROAD src\/ws-create\.js/.test(r)) && cutJob.some((r) => /PRIORITY ROAD src\/jobs\.js/.test(r)) && newRoad.some((r) => /UNLISTED session line src\/server\/new-road\.js/.test(r))
    && twoInBr.some((r) => /PRIORITY EXCEPTION src\/server\/boot-restore\.js: 2 session line/.test(r)) && cutVault.some((r) => /PRIORITY ROAD src\/server\/vault-run-door\.js/.test(r)),
    `THE SPAWN CENSUS: the ${C.PRIORITY_ROADS.length} places read clean; RED for the ws-create line with its priority cut, the job spawn without it, the vault run door's command without it (B-7f18), a NEW caller of the session line with no row, and a SECOND (local) line in the excepted file`, { clean, cutWs, cutJob, cutVault, newRoad, twoInBr });
  ok(/session\._cpuNice = ocPty \? ocServeFact\(\) : \(session\.host && session\._cpuNice !== undefined \? \(session\._cpuNice \|\| SPRI\.factOf\(\(readSessionMeta\(sockName\) \|\| \{\}\)\.cpuNice\)\) : r6Pri\.fact\);/.test(src) && /child\.once\('error', /.test(JSRC),
    'an OpenCode serve terminal (its pty is the serve\'s, never this line) states the SERVE\'s fact (B-460d\'s remainder: ocServeFact — the serve starts below the hub); a job wrapper whose exec fails late is an error event the engine catches, never the hub\'s crash');
  // the words a person reads (Session Properties' row, src/lib/cpu-priority-words.js)
  const { cpuPriorityWords } = await import(path.join(REPO, 'src/lib/cpu-priority-words.js'));
  const tt = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, n) => (p && p[n] !== undefined ? p[n] : m));
  const words = [{ by: 5 }, { by: 0, why: 'off' }, { by: 0, why: 'no-nice' }, { by: 0, why: 'remote' }, null, { by: 0, why: 'x' }].map((f) => cpuPriorityWords(f, tt));
  ok(words[0] === 'Below the server (nice +5) — and everything it starts' && /off in Settings/.test(words[1]) && /no nice program/.test(words[2]) && /its own machine/.test(words[3]) && words[4] === null && words[5] === null,
    'Session Properties\' «CPU priority» row: below the server (nice +5), the server\'s own with its reason, a remote machine\'s own — no row for a start that predates the fact', words);
  const SPROPS = read('src/lib/session-props.js'), SV = read('server.js'), BR = read('src/server/boot-restore.js'), SB = read('src/lib/sidebar.js');
  ok(/const cpuWords = cpuPriorityWords\(s\.cpuNice, t, \{ remote: !!s\.host \}\);[^\n]*\n    if \(cpuWords\) row\(idSec, t\('CPU priority'\), escHtml\(cpuWords\)\);/.test(SPROPS) && /cpuNice: s\._cpuNice \|\| null/.test(SV) && /\n  cpuNice: \{ digest: null \},/.test(SB) && /\n    _cpuNice: meta\.cpuNice && /.test(BR),
    'the fact\'s road to the row: the session list carries `cpuNice` (a carried-only live fact), the restore reads the meta back, the identity section draws the row');
}
console.log('— ⑤ B-460d\'s remainder: a PAIRED machine\'s conversation starts below ITS machine\'s agent — the same verdict, that machine\'s own nice program');
{
  const SPRI = require(path.join(REPO, 'src/server/spawn-priority.js')), NP = require(path.join(REPO, 'src/nice-program.js'));
  const AG = read('src/agentd/agentd.js');
  NP._resetNice(); const winLook = NP.niceProgram({ platform: 'win32', access: () => { } }); NP._resetNice();
  ok(SPRI.niceProgram === NP.niceProgram && SPRI.NICE_DIRS === NP.NICE_DIRS && winLook === null && !/function niceProgram/.test(read('src/server/spawn-priority.js'))   // stale-pins: kept (the look moved OUT of spawn-priority.js on purpose: this pins its absence there)
    && AG.includes("const { niceProgram, serveStartOf } = require('../nice-program.js');") && AG.includes('nicePath: niceProgram(),'),
    'THE nice look lives in ONE shared file (src/nice-program.js): the hub\'s verdict uses it, the device agent\'s hello says its answer (nicePath); none on Windows', { winLook });
  const T = [[{ nicePath: '/usr/bin/nice', platform: 'linux' }, '/usr/bin/nice'], [{ nicePath: '/opt/homebrew/bin/nice', platform: 'darwin' }, '/opt/homebrew/bin/nice'],
    [{ nicePath: 'nice' }, null], [{ nicePath: '/usr/bin/ni ce' }, null], [{ nicePath: '/usr/bin/nice\u202e' }, null], [{ nicePath: '/usr/bin/nice\n' }, null],
    [{ nicePath: '/' + 'x'.repeat(1024) }, null], [{ nicePath: '/usr/bin/nice', platform: 'win32' }, null], [{ nicePath: 42 }, null], [{ nicePath: null }, null], [{}, null], [null, null]];
  const wrongP = T.filter(([h, want]) => SPRI.nicePathOf(h) !== want);
  ok(!wrongP.length, `PURE nicePathOf, ${T.length} rows: an absolute path with no space, control or direction-changing character, ≤ 1024, never from a Windows agent — else none`, wrongP);
  const H = { nicePath: '/usr/bin/nice', platform: 'linux' }, OFFS = (k) => (k === SPRI.SETTING ? false : undefined);
  const dOn = SPRI.devicePriorityFor({ hello: H }), dOff = SPRI.devicePriorityFor({ serverSetting: OFFS, hello: H }), dOld = SPRI.devicePriorityFor({ hello: { platform: 'linux' } });
  const dNone = SPRI.devicePriorityFor({ hello: { nicePath: null, platform: 'linux' } }), dWin = SPRI.devicePriorityFor({ hello: { nicePath: '/usr/bin/nice', platform: 'win32' } }), dNo = SPRI.devicePriorityFor({});
  const dThrow = SPRI.devicePriorityFor({ serverSetting: () => { throw new Error('settings not ready'); }, hello: H });
  const remoteFact = (x) => x.priority === null && x.fact.by === 0 && x.fact.why === 'remote';
  ok(JSON.stringify(dOn) === JSON.stringify({ priority: { nice: '/usr/bin/nice', by: 5 }, fact: { by: 5 } }) && dThrow.priority && dThrow.priority.by === 5 && [dOld, dNone, dWin, dNo].every(remoteFact)
    && dOff.priority === null && dOff.fact.by === 0 && dOff.fact.why === 'off' && SPRI.devicePriorityFor({ serverSetting: OFFS, hello: {} }).fact.why === 'off',
    'the device\'s verdict IS priorityFor with the machine\'s own nice program: on ⇒ ITS nice -n 5, the fact {by: 5}; a setting that cannot be read = on; the hub\'s switch OFF ⇒ none, the fact «off in Settings» (r705 (1): the reason a person can change, as a local start says it — an older agent too); an older agent (no nicePath), a machine with none, a Windows agent, no hello ⇒ today\'s answer (none, «set by its own machine»)', { dOn, dOff, dOld, dNone, dWin, dNo });
  SPRI._reset();
  { const jl = [], jlog = { warn: (l) => jl.push(l) }, m1 = { id: 'dial-m1', name: 'desk one' }, m2 = { id: 'dial-m2', name: 'desk two' };
    SPRI.devicePriorityFor({ hello: { platform: 'linux' }, machine: m1, log: jlog }); SPRI.devicePriorityFor({ hello: { nicePath: null, platform: 'linux' }, machine: m1, log: jlog });
    SPRI.devicePriorityFor({ hello: { platform: 'win32' }, machine: m2, log: jlog }); SPRI.devicePriorityFor({ hello: H, machine: { id: 'dial-m3', name: 'desk three' }, log: jlog });
    SPRI.devicePriorityFor({ serverSetting: OFFS, hello: {}, machine: { id: 'dial-m4', name: 'desk four' }, log: jlog });
    ok(jl.length === 2 && /desk one: its agent states no nice program/.test(jl[0]) && /desk two/.test(jl[1]) && !jl.some((l) => /desk three|desk four/.test(l)),
      'r705 (2): a paired machine whose agent states no nice program (an older agent, none there, Windows) is said in the journal ONCE a machine; a lowered one and the switch off say nothing', jl); }
  SPRI._reset(); const said = []; SPRI.devicePriorityFor({ hello: { nicePath: null } }); SPRI.devicePriorityFor({ hello: H });
  const hubNone = SPRI.priorityFor({ nice: () => null, log: { warn: (l) => said.push(l) } }); SPRI._reset();
  ok(hubNone.fact.why === 'no-nice' && said.length === 1, 'a paired machine\'s answer never says nor spends the hub\'s own once-said «no nice program» line', said);
  const plainSpec = L.withPriority({ cmd: 'sh', args: ['-lc', 'x'] }, null), lowSpec = L.withPriority({ cmd: 'sh', args: ['-lc', 'x'] }, dOn.priority);
  let badW = null; try { L.withPriority({ cmd: 'sh', args: [] }, { nice: 'nice', by: 5 }); } catch (e) { badW = e.message; }
  ok(JSON.stringify({ ...plainSpec, cwd: '/w' }) === JSON.stringify({ cmd: 'sh', args: ['-lc', 'x'], cwd: '/w' }) && JSON.stringify(lowSpec) === JSON.stringify({ cmd: '/usr/bin/nice', args: ['-n', '5', 'sh', '-lc', 'x'] }) && /absolute/.test(String(badW)),
    'the paired spec\'s builder: none ⇒ the release\'s spec byte for byte (its keys in their order); a priority ⇒ `<its nice> -n 5 sh -lc …` (priorityArgv\'s words); a bare name refused by name', { plainSpec, lowSpec, badW });
  const DIAL = read('src/spawn/dial.js'), WSC = read('src/ws-create.js'), cnt = (s, x) => s.split(x).length - 1;
  ok(cnt(DIAL, 'SPRI.devicePriorityFor({ serverSetting, hello: await deviceHello(), machine: h })') === 2 && cnt(DIAL, 'const devPri = dialKeeperSid ? null : SPRI.devicePriorityFor(') === 1
    && cnt(DIAL, "pty: { ...withPriority({ cmd: 'sh', args: ['-lc', shellCmd] }, devPri.priority), cwd,") === 1
    && cnt(DIAL, "spawn: { ...withPriority({ cmd: 'sh', args: ['-lc', shellCmd] }, devPri.priority), cwd } }") === 1
    && cnt(DIAL, "{ cmd: 'sh', args: ['-lc', shellCmd]") === 2 && cnt(DIAL, 'session._cpuNice = devPri.fact;') === 1 && cnt(DIAL, 'session._cpuNice = dialKeeperSid ? null : devPri.fact;') === 1 && DIAL.includes('hosts.connectedDevice(h.id)')
    && WSC.includes('session._cpuNice = ocPty ? ocServeFact() : (session.host && session._cpuNice !== undefined ? (session._cpuNice || SPRI.factOf((readSessionMeta(sockName) || {}).cpuNice)) : r6Pri.fact);'),
    'THE WIRING: both dial branches (the terminal\'s pty, the chat\'s pipe session) ask the device\'s verdict from a link already up and build their spec with the builder — no spec left without it; each fresh start keeps ITS machine\'s fact (ws-create keeps a paired start\'s own)');
  // THE LADDER ITSELF (the round's S2): src/spawn/dial.js's terminal and chat, driven with a stand-in device — Integration off, no
  // account, a bridge that answers a port — and the cfg file each writes read back (what the attach client hands the device)
  const DL = require(path.join(REPO, 'src/spawn/dial.js')), dlDir = scratchDir('sline-dial');
  const helloDm = { helloInfo: () => ({ nicePath: '/usr/bin/nice', platform: 'linux' }) };
  let dn = 0;
  const drive5 = async (mode, { hosts, data = {}, setting } = {}) => {
    const sent = [], session = {}, id = `d5-${mode}-${++dn}`;
    const ctx = { hosts, path, fs, os, AGENT_BIN_DIR: '/x/bin', EDITOR_CMD: '/x/code', PORT: 3999, ownerWriteRefusal: () => null, cliConfigPlanB64: () => '', serverSetting: setting || (() => undefined),
      ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), NODE_CMD: '/n/node', agentdRemote: { lockedWhy: () => null, agentdDir: dlDir, attachBundle: '/a/attach.js' }, dialBridge: { ensure: async () => 41234 } };
    const c = { ctx, execFileAsync: async () => ({ stdout: '' }), ws: { send: (m) => sent.push(m) }, data: { reqId: 1, ...data }, id, backend: 'claude', SP: {}, sessionMode: mode, session, cwd: '/home/u/p',
      spawnAccount: null, integrationOn: false, spawnBrowserPre: '', needsClaudeLoginHelper: false, sweepOpts: () => ({}), h: { id: 'dial-d5', name: 'd5', deviceId: 'd5', transport: 'dial' },
      shq: (x) => `'${String(x).split("'").join(`'\\''`)}'`, rcmd: 'claude', rargs: [], spawnCmd: 'claude', spawnArgs: [], spawnEnvPairs: [], spawnCwd: '/home/u/p' };
    const ans = await DL[mode](c);
    let cfg = null; try { cfg = JSON.parse(fs.readFileSync(path.join(dlDir, 'session-' + id + '.json'), 'utf8')); } catch { }
    return { ans, cfg, session, sent };
  };
  const upH = { connectedDevice: () => helloDm };
  const cT = await drive5('terminal', { hosts: upH }), cC = await drive5('chat', { hosts: upH });
  const lowCfg = (x) => !!x && x.cmd === '/usr/bin/nice' && JSON.stringify(x.args.slice(0, 4)) === '["-n","5","sh","-lc"]';
  const relCfg = (x, keys) => !!x && x.cmd === 'sh' && x.args[0] === '-lc' && JSON.stringify(Object.keys(x)) === JSON.stringify(keys);
  ok(lowCfg(cT.cfg && cT.cfg.pty) && JSON.stringify(Object.keys(cT.cfg.pty)) === '["cmd","args","cwd","env","cols","rows"]' && lowCfg(cC.cfg && cC.cfg.spawn) && cT.session._cpuNice?.by === 5 && cC.session._cpuNice?.by === 5 && !cT.sent.length && !cC.sent.length,
    'THE LADDER (src/spawn/dial.js, a stand-in device whose hello names its nice): the terminal\'s pty spec and the chat\'s pipe-session spec start with THAT nice -n 5 sh -lc …; each start\'s fact {by: 5}', { pty: cT.cfg && cT.cfg.pty, spawn: cC.cfg && cC.cfg.spawn, sent: [...cT.sent, ...cC.sent] });
  const reD = await drive5('chat', { hosts: { connectedDevice: () => null, device: async () => helloDm } });
  ok(lowCfg(reD.cfg && reD.cfg.spawn) && reD.session._cpuNice?.by === 5, 'a cached handle a re-dial left behind (connectedDevice: none): the create asks the dial road itself and still lowers');
  const noneC = await drive5('chat', { hosts: {} }), noneT = await drive5('terminal', { hosts: {} }), offC = await drive5('chat', { hosts: upH, setting: OFFS }), adopt = await drive5('chat', { hosts: upH, data: { keeperSid: 'k-live-1' } });
  ok(relCfg(noneC.cfg && noneC.cfg.spawn, ['cmd', 'args', 'cwd']) && relCfg(noneT.cfg && noneT.cfg.pty, ['cmd', 'args', 'cwd', 'env', 'cols', 'rows']) && noneC.session._cpuNice?.why === 'remote' && noneT.session._cpuNice?.why === 'remote'
    && relCfg(offC.cfg && offC.cfg.spawn, ['cmd', 'args', 'cwd']) && offC.session._cpuNice?.why === 'off' && !!adopt.cfg && !adopt.cfg.spawn && adopt.session._cpuNice === null
    && !lowCfg(noneC.cfg && noneC.cfg.spawn) && !lowCfg(offC.cfg && offC.cfg.spawn),
    'the release\'s spec, its keys in their order: no hello (an older agent, no handle) — both branches — with the fact «set by its own machine», and the setting off with «off in Settings»; an ADOPTED start sends no spec and states NO fact (no row: its child keeps the priority it started with); the judge reads each of them NOT lowered (the control)', { noneC: noneC.cfg, offC: offC.cfg, adopt: adopt.cfg, adoptFact: adopt.session._cpuNice });
  // THE CREATE TO ITS META WRITE (主开发 r705 (5)): the REAL ws-create with a dial host — the fact the ladder sets survives to
  // the meta write; an ADOPTED start keeps what its meta held and claims nothing when it held none (r705 (3)). RED CONTROL: a
  // ws-create copy whose line drops the ladder's fact (the release's form) writes «set by its own machine» for a lowered start
  const H5 = { id: 'dial-d5c', name: 'd5c', deviceId: 'd5c', transport: 'dial' };
  const hostsC = new Proxy({ get: (hid) => (hid === H5.id ? H5 : null), connectedDevice: () => helloDm }, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? () => undefined : undefined)) });
  const DCTX = { dialBridge: { ensure: async () => 41235 }, agentdRemote: { lockedWhy: () => null, agentdDir: dlDir, attachBundle: '/a/attach.js' } };
  const metaFact = (x) => { const m = x.metas.find((mm) => mm && 'cpuNice' in mm && 'host' in mm); return m ? m.cpuNice : 'no meta'; };
  const sentOf = (x) => x.sent.map((m) => m.type + (m.message ? ': ' + String(m.message).slice(0, 120) : ''));
  const xLow = await drive(wsCreate, { hostId: H5.id, backend: 'claude' }, { hosts: hostsC, extra: DCTX });
  const xKept = await drive(wsCreate, { hostId: H5.id, backend: 'claude', keeperSid: 'k-live-2' }, { hosts: hostsC, extra: { ...DCTX, readSessionMeta: () => ({ cpuNice: { by: 5 } }) } });
  const xNone = await drive(wsCreate, { hostId: H5.id, backend: 'claude', keeperSid: 'k-live-3' }, { hosts: hostsC, extra: DCTX });
  const MD = mutantCopies('session-spawn-line-dial', REPO), WSRC = read('src/ws-create.js');
  const KEEP = '(session.host && session._cpuNice !== undefined ? (session._cpuNice || SPRI.factOf((readSessionMeta(sockName) || {}).cpuNice)) : r6Pri.fact)';
  let xRel = null; try { xRel = await drive(MD.load('src/ws-create.js', anchored(WSRC, KEEP, 'r6Pri.fact', 'r705 the ladder fact dropped'), 'dial-fact-dropped'), { hostId: H5.id, backend: 'claude' }, { hosts: hostsC, extra: DCTX }); } catch (e) { xRel = { error: String(e && e.message).slice(0, 200) }; }
  ok(xLow.session && xLow.session._cpuNice?.by === 5 && metaFact(xLow)?.by === 5 && xKept.session && xKept.session._cpuNice?.by === 5 && metaFact(xKept)?.by === 5
    && xNone.session && xNone.session._cpuNice === null && metaFact(xNone) === undefined,
    'THE CREATE (the real ws-create, a dial host): the fact the ladder sets survives to the meta write ({by: 5}); an ADOPTED start keeps the fact its meta held ({by: 5}) and, holding none, claims nothing (no cpuNice)',
    { low: [xLow.session && xLow.session._cpuNice, metaFact(xLow), sentOf(xLow)], kept: [xKept.session && xKept.session._cpuNice, metaFact(xKept), sentOf(xKept)], none: [xNone.session && xNone.session._cpuNice, metaFact(xNone), sentOf(xNone)] });
  ok(!!xRel && !xRel.error && xRel.session && metaFact(xRel)?.why === 'remote', 'RED CONTROL: a ws-create whose line drops the ladder\'s fact writes «set by its own machine» for that lowered start — the leg above is red on it', xRel && (xRel.error || { fact: metaFact(xRel), sent: sentOf(xRel) }));
  const C = await import(path.join(REPO, 'scripts/spawn-env-census.mjs'));
  const FILES = C.filesOf(REPO), rdp = (patch) => (f) => (f in patch ? patch[f] : (() => { try { return read(f); } catch { return ''; } })());
  const cutPty = C.priorityJudge(rdp({ 'src/spawn/dial.js': DIAL.replace("pty: { ...withPriority({ cmd: 'sh', args: ['-lc', shellCmd] }, devPri.priority), cwd,", "pty: { cmd: 'sh', args: ['-lc', shellCmd], cwd,") }), FILES);   // stale-pins: kept (the red control rebuilds the release's pty spec on purpose)
  const cutHello = C.priorityJudge(rdp({ 'src/agentd/agentd.js': AG.replace('nicePath: niceProgram(),', '') }), FILES);
  ok(!C.priorityJudge(rdp({}), FILES).length && cutPty.some((r) => /PRIORITY ROAD src\/spawn\/dial\.js/.test(r)) && cutHello.some((r) => /PRIORITY ROAD src\/agentd\/agentd\.js/.test(r)),
    'THE SPAWN CENSUS holds the paired machine\'s places: RED for a dial spec built without the builder, and for an agent whose hello says no nice program', { cutPty, cutHello });
  const CL = require(path.join(REPO, 'src/agentd/client.js'));
  ok(!!CL.posixShellRefusal({ platform: 'win32', posixShells: [] }, 'sh') && SPRI.nicePathOf({ platform: 'win32', nicePath: '/usr/bin/nice' }) === null,
    'the Windows shell door still sees `sh`: a Windows agent is never handed the prefix, so its spec keeps the shell first (the door keys on it)');
  const { cpuPriorityWords } = await import(path.join(REPO, 'src/lib/cpu-priority-words.js'));
  const tt = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  const KEY = 'Below its machine’s agent (nice +{n}), and everything it starts';
  const wr5 = cpuPriorityWords({ by: 5 }, tt, { remote: true }), wl5 = cpuPriorityWords({ by: 5 }, tt), wrr = cpuPriorityWords({ by: 0, why: 'remote' }, tt, { remote: true });
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js'), SPROPS = read('src/lib/session-props.js');
  ok(wr5 === 'Below its machine’s agent (nice +5), and everything it starts' && wl5 === 'Below the server (nice +5) — and everything it starts' && /its own machine/.test(wrr)
    && ZH.includes(JSON.stringify(KEY) + ': ') && JA.includes(JSON.stringify(KEY) + ': ') && SPROPS.includes('cpuPriorityWords(s.cpuNice, t, { remote: !!s.host })'),
    'Session Properties\' row for a paired machine\'s conversation: «Below its machine’s agent (nice +5), and everything it starts» (en, zh, ja); a local one keeps «Below the server…»; every not-lowered case keeps today\'s sentence', { wr5, wl5, wrr });
}
// ── B-460d's REMAINDER, ITS ssh HALF (lane login-request-card, 主开发 r1362 (3)): an ssh-ONLY machine's fresh start asks the SAME
// verdict, fed by its agent's hello on a link ALREADY UP (memory only: never a dial, never a wait) and taken as a CHOICE among the
// hub's own fixed list (src/nice-program.js listedNicePath — the machine's bytes never reach the line); no answer ⇒ the release's
// start, at once. The REAL src/spawn/ssh.js terminal and chat (the device road and the keeper road), driven with stand-ins.
console.log('\n── B-460d\'s remainder (ssh half): an ssh-only machine starts below ITS agent only on an answer from the hub\'s own list ──');
{
  const SPRI = require(path.join(REPO, 'src/server/spawn-priority.js')), NP = require(path.join(REPO, 'src/nice-program.js'));
  const OFFS = (k) => (k === SPRI.SETTING ? false : undefined);
  // (b) THE CHOICE, PURE: exact matches of the hub's own list only — a crafted line, a near miss, Windows ⇒ none
  const crafted = ['/usr/bin/nice; touch /tmp/pwned', '/usr/bin/nice ', ' /usr/bin/nice', '/usr/bin/nice\n', '/usr/bin/../bin/nice', '/tmp/nice', '/usr/bin/nicer', 'nice', '', null, 42, { toString: () => '/usr/bin/nice' }];
  const wrongC = crafted.filter((x) => NP.listedNicePath(x) !== null);
  ok(NP.LISTED.every((p) => NP.listedNicePath(p) === p) && !wrongC.length && NP.listedNicePath('/usr/bin/nice', { platform: 'win32' }) === null,
    'PURE listedNicePath: each of the hub\'s own listed paths is accepted (the hub\'s constant handed back); every crafted or near-miss answer, a non-string and a Windows machine are refused', wrongC);
  NP._resetNice(); const here = NP.niceProgram(); NP._resetNice();
  ok(here === null || NP.listedNicePath(here) === here, 'THE PARITY (the device\'s look ⇄ the hub\'s list, one module): what this machine\'s own look answers is a path the hub\'s list holds — the two never drift', here);
  // (c) THE LOOK IS MEMORY ONLY: no link up ⇒ null at once, the dial road never asked
  let dialled = 0;
  const never = { connectedDevice: () => null, device: () => { dialled++; return new Promise(() => { }); } };
  const t0 = process.hrtime.bigint(), hNone = SPRI.linkedHello(never, 'ssh-1'), dt = Number(process.hrtime.bigint() - t0) / 1e6;
  const vNone = SPRI.sshPriorityFor({ hello: hNone }), vOff = SPRI.sshPriorityFor({ serverSetting: OFFS, hello: { nicePath: '/usr/bin/nice', platform: 'linux' } });
  ok(hNone === null && dialled === 0 && typeof dt === 'number' && vNone.priority === null && vNone.fact.why === 'remote' && vOff.priority === null && vOff.fact.why === 'off',
    'THE LOOK (no link up, a dial road that never answers): no hello, the dial road NEVER asked, the release\'s start with «set by its own machine»; the setting off ⇒ «off in Settings»', { hNone, dialled, vNone, vOff });
  // THE LADDER ITSELF: the real ssh terminal / chat, a stand-in machine
  const SL = require(path.join(REPO, 'src/spawn/ssh.js')), slDir = scratchDir('sline-ssh');
  let sn = 0;
  const driveS = async (mode, { hosts, data = {}, setting, agentd = true, agentdFails = false, SLm = SL } = {}) => {
    const sent = [], session = {}, id = `s6-${mode}-${++sn}`;
    const hostsAll = new Proxy(hosts || {}, { get: (t, k) => (k in t ? t[k] : (k === 'sshArgs' ? () => ['-o', 'BatchMode=yes', 'u@ssh-host'] : k === 'sshEnv' ? () => ({}) : (typeof k === 'string' ? async () => null : undefined))) });
    const ctx = { hosts: hostsAll, path, fs, os, AGENT_BIN_DIR: '/x/bin', EDITOR_CMD: '/x/code', PORT: 3999, ownerWriteRefusal: () => null, cliConfigPlanB64: () => '', serverSetting: setting || (() => undefined),
      ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), NODE_CMD: '/n/node',
      agentdRemote: agentd ? { lockedWhy: () => null, agentdDir: slDir, attachBundle: '/a/attach.js', ensureAgentdOnHost: async () => { if (agentdFails) throw new Error('provisioning refused (a stand-in)'); return true; } } : null };
    const c = { ctx, execFileAsync: async () => ({ stdout: '' }), ws: { send: (m) => sent.push(m) }, data: { reqId: 1, ...data }, id, backend: 'claude', SP: {}, sessionMode: mode, session, cwd: '/home/u/p',
      spawnAccount: null, integrationOn: false, spawnBrowserPre: '', needsClaudeLoginHelper: false, sweepOpts: () => ({}), h: { id: 'ssh-6', name: 's6' },
      shq: (x) => `'${String(x).split("'").join(`'\\''`)}'`, rcmd: 'claude', rargs: [], spawnCmd: 'claude', spawnArgs: [], spawnEnvPairs: [], spawnCwd: '/home/u/p' };
    const ans = await SLm[mode](c);
    let cfg = null; try { cfg = JSON.parse(fs.readFileSync(path.join(slDir, 'session-' + id + '.json'), 'utf8')); } catch { }
    return { ans, cfg, session, sent };
  };
  const upAs = (nicePath, platform = 'linux') => ({ connectedDevice: () => ({ helloInfo: () => ({ nicePath, platform }) }) });
  const LOW = '/usr/bin/nice';
  const tLow = await driveS('terminal', { hosts: upAs(LOW) }), cLow = await driveS('chat', { hosts: upAs(LOW) }), kLow = await driveS('chat', { hosts: upAs(LOW), agentd: false });
  const tLine = (x) => String((x.ans && x.ans.spawnArgs || []).slice(-1)[0] || '');
  ok(/dtach -A \/tmp\/vs-\S+ -r winch \/usr\/bin\/nice -n 5 sh -lc /.test(tLine(tLow)) && tLow.session._cpuNice?.by === 5
    && !!cLow.cfg && cLow.cfg.spawn && cLow.cfg.spawn.cmd === LOW && JSON.stringify(cLow.cfg.spawn.args.slice(0, 4)) === '["-n","5","sh","-lc"]' && cLow.session._cpuNice?.by === 5
    && / -- \/usr\/bin\/nice -n 5 claude\b/.test(tLine(kLow)) && kLow.session._cpuNice?.by === 5 && !tLow.sent.length && !cLow.sent.length && !kLow.sent.length,
    'THE LADDER (src/spawn/ssh.js, a machine whose agent names a LISTED nice on a link up): the terminal\'s dtach line, the device road\'s pipe-session spec and the keeper road\'s run each start with the hub\'s /usr/bin/nice -n 5; each start\'s fact {by: 5}', { t: tLine(tLow), c: cLow.cfg && cLow.cfg.spawn, k: tLine(kLow) });
  const tBad = await driveS('terminal', { hosts: upAs('/usr/bin/nice; touch /tmp/pwned') }), cBad = await driveS('chat', { hosts: upAs('/tmp/nice') }), kNone = await driveS('chat', { hosts: never, agentd: false });
  const tNone = await driveS('terminal', { hosts: never }), cWin = await driveS('chat', { hosts: upAs(LOW, 'win32') }), cOff = await driveS('chat', { hosts: upAs(LOW), setting: OFFS });
  ok(/ -r winch sh -lc /.test(tLine(tBad)) && !tLine(tBad).includes('pwned') && tBad.session._cpuNice?.why === 'remote'
    && !!cBad.cfg && cBad.cfg.spawn.cmd === 'sh' && JSON.stringify(Object.keys(cBad.cfg.spawn)) === '["cmd","args","cwd"]' && cBad.session._cpuNice?.why === 'remote'
    && / -- claude\b/.test(tLine(kNone)) && !/nice/.test(tLine(kNone)) && / -r winch sh -lc /.test(tLine(tNone)) && dialled === 0
    && cWin.cfg.spawn.cmd === 'sh' && cOff.cfg.spawn.cmd === 'sh' && cOff.session._cpuNice?.why === 'off',
    'NO ANSWER FROM THE LIST ⇒ THE RELEASE\'S START, AT ONCE: a crafted answer (its bytes nowhere in the line), another path, no link up (the dial road never asked — a look that never returns cannot hold a create), a Windows machine — each the release\'s argv with «set by its own machine»; the setting off ⇒ «off»', { tBad: tLine(tBad), cBad: cBad.cfg && cBad.cfg.spawn, kNone: tLine(kNone), dialled });
  // (d) A RESUME takes the same door: the same verdict, the same step, the same fact
  const rLow = await driveS('chat', { hosts: { ...upAs(LOW), findKeeperFor: async () => null }, data: { resume: true, resumeId: 'r6-abc' } });
  const attach = await driveS('chat', { hosts: upAs(LOW), data: { keeperSid: 'k-live-6', keeperKind: 'agentd' } });
  ok(!!rLow.cfg && rLow.cfg.spawn && rLow.cfg.spawn.cmd === LOW && rLow.session._cpuNice?.by === 5 && !!attach.cfg && !attach.cfg.spawn && attach.session._cpuNice === null,
    'A RESUME on that machine gets the same step (one door: the same verdict, the same fact {by: 5}); an ATTACH to a surviving process starts nothing and states no fact (B-460d (4): a running process is never re-prioritised)', { r: rLow.cfg && rLow.cfg.spawn, a: attach.cfg });
  // REDs: the census over copies whose road lost the step; the verdict fed the machine's bytes
  const C = await import(path.join(REPO, 'scripts/spawn-env-census.mjs'));
  const FILES = C.filesOf(REPO), rdp = (patch) => (f) => (f in patch ? patch[f] : (() => { try { return read(f); } catch { return ''; } })());
  const SSH = read('src/spawn/ssh.js'), OCS = read('src/opencode-serve.js');
  const cutT = C.priorityJudge(rdp({ 'src/spawn/ssh.js': anchored(SSH, "-r winch ${priorityArgv(tPri.priority).map((x) => x + ' ').join('')}sh -lc", '-r winch sh -lc', 'the ssh terminal without the words') }), FILES);   // stale-pins: kept (the red control puts the release's line back)
  const cutK = C.priorityJudge(rdp({ 'src/spawn/ssh.js': anchored(SSH, '[...priorityArgv(cPri && cPri.priority), rcmd, ...rargs.map(shq)]', '[rcmd, ...rargs.map(shq)]', 'the keeper run without the words') }), FILES);   // stale-pins: kept (the red control puts the release's line back)
  const cutO = C.priorityJudge(rdp({ 'src/opencode-serve.js': anchored(OCS, 'child = spawnImpl(preArgv.length ? preArgv[0] : cmd, preArgv.length ? [...preArgv.slice(1), cmd, ...serveArgs] : serveArgs, {', 'child = spawnImpl(cmd, serveArgs, {', 'the serve without its prefix') }), FILES);
  ok(!C.priorityJudge(rdp({}), FILES).length && cutT.some((r) => /PRIORITY ROAD src\/spawn\/ssh\.js/.test(r)) && cutK.some((r) => /PRIORITY ROAD src\/spawn\/ssh\.js/.test(r)) && cutO.some((r) => /PRIORITY ROAD src\/opencode-serve\.js/.test(r)),
    'THE SPAWN CENSUS holds the new places: RED for an ssh terminal or keeper run without the words, and for a serve spawned without its prefix', { cutT, cutK, cutO });
  const MS = mutantCopies('session-spawn-line-ssh', REPO), SPSRC = read('src/server/spawn-priority.js');
  const RAW = MS.load('src/server/spawn-priority.js', anchored(SPSRC, '  const p = NP.listedNicePath(hello && hello.nicePath, { platform: hello && hello.platform });', '  const p = hello && typeof hello.nicePath === \'string\' ? hello.nicePath : null;', 'ssh verdict fed the raw answer'), 'ssh-raw-answer');
  const rawV = RAW.sshPriorityFor({ hello: { nicePath: '/tmp/evil-nice', platform: 'linux' } });
  ok(!!rawV.priority && rawV.priority.nice === '/tmp/evil-nice', 'RED CONTROL: a verdict fed the machine\'s own bytes (no choice among the list, in a copy) puts THAT machine\'s string in front of the line — the legs above are red on it', rawV);
  // the round's should (wmm5vpkhl, lens 3): the control RE-RUNS the ladder's own check — the real ssh.js, its verdict swapped for the
  // copy's for the length of one drive (ssh.js asks SPRI.sshPriorityFor on the one module at each start), then put back
  const onlyListed = async () => {
    const t = await driveS('terminal', { hosts: upAs('/tmp/evil-nice') }), c = await driveS('chat', { hosts: upAs('/tmp/evil-nice') });
    return { ok: / -r winch sh -lc /.test(tLine(t)) && !tLine(t).includes('evil') && !!c.cfg && c.cfg.spawn.cmd === 'sh' && t.session._cpuNice?.why === 'remote', t: tLine(t), c: c.cfg && c.cfg.spawn };
  };
  const realOL = await onlyListed(), keepF = SPRI.sshPriorityFor;
  let rawOL = null; SPRI.sshPriorityFor = RAW.sshPriorityFor; try { rawOL = await onlyListed(); } finally { SPRI.sshPriorityFor = keepF; }
  ok(realOL.ok && !!rawOL && !rawOL.ok && SPRI.sshPriorityFor === keepF, 'RED CONTROL, RE-RUN: the ladder\'s own check (another path named ⇒ the release\'s line, «set by its own machine») is green on the tree and RED with the copy\'s verdict in its place', { realOL, rawOL });
}
// ── THE FOLLOW (lane login-request-card, round wmm5vpkhl's shoulds on line 208): an ssh road's fact says what its step is BELOW,
// the terminal's says it may have JOINED a running shell, an ssh-only machine with no answer is said once, the device road's
// fallback keeps the keeper road's fact, a stored fact keeps its base across a restart, the serve's start reads server.js's ONE
// serverSetting
console.log('\n── B-460d follow: the ssh roads\' facts say what they are below; a machine with no answer is said once ──');
{
  const SPRI = require(path.join(REPO, 'src/server/spawn-priority.js'));
  const SL = require(path.join(REPO, 'src/spawn/ssh.js')), slDir = scratchDir('sline-ssh-fu');
  let sn = 0;
  const driveF = async (mode, { hosts, data = {}, agentdFails = false, SLm = SL, log = null } = {}) => {
    const sent = [], session = {}, id = `s7-${mode}-${++sn}`;
    const hostsAll = new Proxy(hosts || {}, { get: (t, k) => (k in t ? t[k] : (k === 'sshArgs' ? () => ['-o', 'BatchMode=yes', 'u@ssh-host'] : k === 'sshEnv' ? () => ({}) : (typeof k === 'string' ? async () => null : undefined))) });
    const ctx = { hosts: hostsAll, path, fs, os, AGENT_BIN_DIR: '/x/bin', EDITOR_CMD: '/x/code', PORT: 3999, ownerWriteRefusal: () => null, cliConfigPlanB64: () => '', serverSetting: () => undefined,
      ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), NODE_CMD: '/n/node',
      agentdRemote: { lockedWhy: () => null, agentdDir: slDir, attachBundle: '/a/attach.js', ensureAgentdOnHost: async () => { if (agentdFails) throw new Error('provisioning refused (a stand-in)'); return true; } } };
    const c = { ctx, execFileAsync: async () => ({ stdout: '' }), ws: { send: (m) => sent.push(m) }, data: { reqId: 1, ...data }, id, backend: 'claude', SP: {}, sessionMode: mode, session, cwd: '/home/u/p',
      spawnAccount: null, integrationOn: false, spawnBrowserPre: '', needsClaudeLoginHelper: false, sweepOpts: () => ({}), h: { id: 'ssh-7', name: 's7' },
      shq: (x) => `'${String(x).split("'").join(`'\\''`)}'`, rcmd: 'claude', rargs: [], spawnCmd: 'claude', spawnArgs: [], spawnEnvPairs: [], spawnCwd: '/home/u/p' };
    const warn = console.warn, said = [];
    console.warn = (...a) => { said.push(a.join(' ')); };
    let ans; try { ans = await SLm[mode](c); } finally { console.warn = warn; }
    let cfg = null; try { cfg = JSON.parse(fs.readFileSync(path.join(slDir, 'session-' + id + '.json'), 'utf8')); } catch { }
    return { ans, cfg, session, sent, said };
  };
  const upAs = (nicePath) => ({ connectedDevice: () => ({ helloInfo: () => ({ nicePath, platform: 'linux' }) }) });
  const LOW = '/usr/bin/nice', J = (x) => JSON.stringify(x), lineOf = (x) => String((x.ans && x.ans.spawnArgs || []).slice(-1)[0] || '');
  // (1) THE BASE OF THE STEP, per road — the check the RED below re-runs
  const basesOf = async (SLm = SL) => {
    const t = await driveF('terminal', { hosts: upAs(LOW), SLm }), k = await driveF('chat', { hosts: upAs(LOW), agentdFails: true, SLm }), d = await driveF('chat', { hosts: upAs(LOW), SLm });
    return { t: t.session._cpuNice, k: k.session._cpuNice, d: d.session._cpuNice, kLine: lineOf(k), kCfg: k.cfg, kSaid: k.said, dCfg: d.cfg && d.cfg.spawn };
  };
  const B = await basesOf();
  const basesRight = (b) => J(b.t) === J({ by: 5, of: 'login', join: true }) && J(b.k) === J({ by: 5, of: 'login' }) && J(b.d) === J({ by: 5 });
  ok(basesRight(B), 'EACH ROAD SAYS WHAT ITS STEP IS BELOW: the ssh terminal {by: 5, of: login, join} (its dtach -A may join a running shell, which keeps its own), the keeper road {by: 5, of: login} (the keeper starts under the ssh session), the device road {by: 5} (its machine\'s agent spawns it)', B);
  // (4) THE DEVICE ROAD's FALLBACK (lens 3): a provisioning the machine refuses falls to the keeper road — its line lowered, its fact the keeper road's, said
  ok(/ -- \/usr\/bin\/nice -n 5 claude\b/.test(B.kLine) && B.kCfg === null && B.kSaid.some((l) => /keeper fallback/.test(l)) && !!B.dCfg && B.dCfg.cmd === LOW,
    'THE DEVICE ROAD\'S FALLBACK, DRIVEN: a refused provisioning starts the keeper road (`… -- /usr/bin/nice -n 5 claude`, no device config written, the fallback said) and its fact is the keeper road\'s', { kLine: B.kLine, kSaid: B.kSaid });
  // RED: a copy whose terminal states the bare verdict (the line as taken) claims a step for a joined shell
  const MF = mutantCopies('session-spawn-line-fu', REPO), SSHSRC = read('src/spawn/ssh.js');
  const SLX = MF.load('src/spawn/ssh.js', anchored(SSHSRC, '            session._cpuNice = SPRI.sshFactOf(tPri.fact, { join: true });', '            session._cpuNice = tPri.fact;', 'the terminal states the bare verdict'), 'ssh-bare-fact');   // stale-pins: kept (the red control puts the taken line back)
  const BX = SLX ? await basesOf(SLX) : null;
  ok(!!BX && !basesRight(BX) && J(BX.t) === J({ by: 5 }), 'RED CONTROL (the terminal stating the bare verdict, in a copy — the line as taken): a terminal that may have joined a running shell claims {by: 5} — the check above is red on it', BX && BX.t);
  // (2) THE WORDS a person reads, and a stored fact keeps its base across a restart (boot-restore reads it through factOf)
  const { cpuPriorityWords } = await import(path.join(REPO, 'src/lib/cpu-priority-words.js'));
  const tt = (k, p) => String(k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  const KL = 'Below its ssh login on that machine (nice +{n}), and everything it starts', KJ = 'Below its ssh login on that machine (nice +{n}) when this terminal started its shell — a terminal that joined a shell already running keeps that shell’s';
  const wL = cpuPriorityWords({ by: 5, of: 'login' }, tt, { remote: true }), wJ = cpuPriorityWords({ by: 5, of: 'login', join: true }, tt, { remote: true }), wA = cpuPriorityWords({ by: 5 }, tt, { remote: true });
  const ZH = read('src/lib/i18n-zh.js'), JA = read('src/lib/i18n-ja.js'), BR = read('src/server/boot-restore.js');
  ok(wL === tt(KL, { n: '5' }) && wJ === tt(KJ, { n: '5' }) && wA === 'Below its machine’s agent (nice +5), and everything it starts' && [KL, KJ].every((k) => ZH.includes(J(k) + ': ') && JA.includes(J(k) + ': ')),
    'Session Properties says it: «Below its ssh login on that machine (nice +5)…», and for the terminal «… when this terminal started its shell — a terminal that joined a shell already running keeps that shell’s» (en, zh, ja); the device road keeps «Below its machine’s agent»', { wL, wJ, wA });
  // the boot's restore: sessionFromMeta stands alone (its suites hand it os, poolPinFromMeta, restoreMarks, BUILD_VERSION, restoredForkSource only) — so its
  // rule is inline; held equal to factOf over every shape here
  const restoredSame = () => {
    const br = read('src/server/boot-restore.js'), body = (br.match(/\nfunction sessionFromMeta\(meta, transportFacts\) \{[\s\S]*?\n\}\n/) || [''])[0];
    if (!body) return false;
    const sfm = new Function('os', 'poolPinFromMeta', 'restoreMarks', 'BUILD_VERSION', 'restoredForkSource', `${body}\nreturn sessionFromMeta;`)(os, () => null, () => ({}), '', () => null);
    // r1911: the shapes are the PRODUCERS' own output (every fact a start can write), each held to a ROUND TRIP — a field a producer adds
    // and the restore drops is red here — beside hand-made junk the restore must read as factOf reads it
    const q = { warn() { } }, offS = (k) => (k === SPRI.SETTING ? false : undefined);
    const base = [SPRI.priorityFor({ log: q }).fact, SPRI.priorityFor({ serverSetting: offS, log: q }).fact, SPRI.priorityFor({ nice: () => null, log: q }).fact, SPRI.priorityFor({ local: false }).fact];
    const produced = [...base, ...base.flatMap((f) => [SPRI.sshFactOf(f), SPRI.sshFactOf(f, { join: true })])];
    const junk = [{ by: 5, of: 'agent' }, { by: 5, join: true }, { by: 0, why: 'remote', of: 'login' }, { by: 0, why: 'other' }, { by: 30 }, null, 'x', [5]];
    const restore = (c) => { try { const got = sfm({ id: 'x', cwd: '/w', cpuNice: c }, {})._cpuNice; return got === undefined ? null : got; } catch { return { threw: true }; } };
    return produced.length >= 12 && produced.every((p) => J(restore(p)) === J(p) && J(SPRI.factOf(p)) === J(p)) && junk.every((c) => J(restore(c)) === J(SPRI.factOf(c)));
  };
  const kept = [{ by: 5, of: 'login', join: true }, { by: 5, of: 'login' }, { by: 5 }, { by: 5, of: 'agent' }, { by: 5, join: true }, { by: 0, why: 'remote', of: 'login' }].map((x) => SPRI.factOf(x));
  ok(J(kept) === J([{ by: 5, of: 'login', join: true }, { by: 5, of: 'login' }, { by: 5 }, { by: 5 }, { by: 5 }, { by: 0, why: 'remote' }])
    && restoredSame(),
    'A STORED FACT keeps its base: factOf keeps `of: login` (and `join` only with it), drops any other base; the boot\'s restore (sessionFromMeta, evaluated ON ITS OWN as test-seen-marks and test-oat-identity evaluate it) rebuilds every fact exactly as factOf reads it — its inline copy dropped the base at a restart', kept);
  // (3) AN ssh-ONLY MACHINE WITH NO ANSWER IT CAN USE is said ONCE a machine — never its bytes; RED: a copy without the line
  const noAnswerLines = (SP) => {
    const got = [], log = { warn: (l) => got.push(l) };
    SP._reset?.();
    SP.sshPriorityFor({ hello: null, machine: { id: 'm1', name: 'desk one' }, log }); SP.sshPriorityFor({ hello: null, machine: { id: 'm1', name: 'desk one' }, log });
    SP.sshPriorityFor({ hello: { nicePath: '/tmp/evil-nice', platform: 'linux' }, machine: { id: 'm2', name: 'desk two' }, log });
    SP.sshPriorityFor({ hello: { nicePath: '/usr/bin/nice', platform: 'linux' }, machine: { id: 'm3', name: 'desk three' }, log });
    SP.sshPriorityFor({ serverSetting: (k) => (k === SP.SETTING ? false : undefined), hello: null, machine: { id: 'm4', name: 'desk four' }, log });
    return got;
  };
  const NL = noAnswerLines(SPRI);
  ok(NL.length === 2 && /desk one: no answer it can use from its agent at this start/.test(NL[0]) && /this start runs at that machine's own priority/.test(NL[0]) && !NL.some((l) => /its conversations start at/.test(l)) && /desk two/.test(NL[1]) && !NL.some((l) => /evil|desk three|desk four/.test(l)),
    'AN ssh-ONLY MACHINE WITH NO ANSWER IT CAN USE is said ONCE a machine in the journal (no link up, another path named), as a paired machine\'s is; never the path it named; a listed answer and the setting off say nothing', NL);
  const SPSRC = read('src/server/spawn-priority.js');
  const SPX = MF.load('src/server/spawn-priority.js', anchored(SPSRC, '  if (id && !saidNoSsh.has(id) && saidNoSsh.size < 256) {', '  if (false) {', 'the ssh no-answer line cut'), 'ssh-no-line');
  const NLX = SPX ? noAnswerLines(SPX) : null;
  ok(!!NLX && NLX.length === 0, 'RED CONTROL (the line cut, in a copy): a machine with no answer starts at its own priority and the journal never says why — the check above is red on it', NLX);
  // r1911 (3)(4): a terminal with NO usable reply may still have JOINED a shell another start lowered — its fact says `join` too; and a
  // conversation on another machine with the setting off is THAT machine's own priority, never «the server's own»
  const tNo = await driveF('terminal', { hosts: { connectedDevice: () => null } });
  const wNoJ = cpuPriorityWords(tNo.session._cpuNice, tt, { remote: true }), wOffR = cpuPriorityWords({ by: 0, why: 'off' }, tt, { remote: true }), wOffRJ = cpuPriorityWords({ by: 0, why: 'off', join: true }, tt, { remote: true }), wOffL = cpuPriorityWords({ by: 0, why: 'off' }, tt);
  const NEWK = ['Its machine’s own — lowering it is off in Settings', 'Its machine’s own when this terminal started its shell — lowering it is off in Settings; a terminal that joined a shell already running keeps that shell’s', 'Set by its own machine when this terminal started its shell — a terminal that joined a shell already running keeps that shell’s'];
  ok(J(tNo.session._cpuNice) === J({ by: 0, why: 'remote', join: true }) && wNoJ === NEWK[2] && wOffR === NEWK[0] && wOffRJ === NEWK[1] && /^The server’s own — lowering it is off in Settings$/.test(wOffL) && NEWK.every((k) => ZH.includes(J(k) + ': ') && JA.includes(J(k) + ': ')),
    'r1911: a terminal with no usable reply says it may have joined a running shell («Set by its own machine when this terminal started its shell — …»); the setting off on ANOTHER machine reads «Its machine’s own — lowering it is off in Settings» (a joined terminal says so too), never «the server’s own» (en, zh, ja)', { fact: tNo.session._cpuNice, wNoJ, wOffR, wOffRJ, wOffL });
  const SPX2 = MF.load('src/server/spawn-priority.js', anchored(SPSRC, '  if (!(fact.by > 0)) return join ? { ...fact, join: true } : fact;', '  if (!(fact.by > 0)) return fact;', 'unlowered-join-cut'), 'ssh-unlowered-join');
  ok(!!SPX2 && J(SPX2.sshFactOf({ by: 0, why: 'remote' }, { join: true })) === J({ by: 0, why: 'remote' }), 'CONTROL (the unlowered start without `join`, in a copy — the line as taken): a terminal that joined a lowered shell is told «set by its own machine» as if it started one — red');
  // (5) the serve's start reads server.js's ONE serverSetting (lens 1): handed in, no second reader in cli-env
  const CLI = read('src/server/cli-env.js'), SRV = read('server.js');
  ok(CLI.split("priorityFor({ serverSetting });").length === 2 && !CLI.includes('readSettings()[k]') && /getHeldPtyIds = \(\) => \[\], serverSetting = \(\) => undefined \}\) \{/.test(CLI)   // stale-pins: kept (a deliberate absence check: no second settings reader)
    && SRV.split('resolveCmd, serverSetting: (k) => serverSetting(k),').length === 2,
    'THE SERVE\'S START reads the setting through server.js\'s ONE serverSetting, handed to cli-env\'s create — no second reader of the settings in cli-env');
  SPRI._reset();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
