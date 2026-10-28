#!/usr/bin/env node
// THE PERSON'S CLI ON A REAL HUB (heavy — lane human-cli, 2026-10-28; the owner after the 89-minute hub freeze: «hub
// 挂掉的时候我可以从机器上快速用指令列出来有哪些 session，attach 进一个 session 和 session 交互»). A scratch hub (its own
// worktree, data/, HOME, port — never the production checkout) runs a REAL dtach terminal session (a login shell) and
// a REAL chat session (data/bin/chat-wrapper.js over the stand-in claude, scripts/fixtures/claude-stand-in-cli.cjs).
//   §1 the hub keeps the index on its own disk: both rows, no token, 0600 in a 0700 folder; the CLI installed beside it
//   §2 `vibespace ls` / `status` with the hub UP
//   §3 SIGTERM the scratch hub (only it): the index says it STOPPED; `ls` still lists both, alive — judged by the kernel
//   §4 `vibespace attach` = the live screen of the terminal (a command typed there runs; Ctrl-\ detaches; it keeps running)
//   §5 `vibespace chat` = the last messages, a line the wrapper RECEIVES (the stand-in's own capture), the reply
//      streamed, Esc = Stop (the interrupt reaches the CLI), Ctrl-C leaves; a piped line too
//   §6 the refusals: a chat has no screen, a screen needs a terminal, a dead session names its buffer, no hub ever ran
// RED on the base (6428c67e): no data/bin/vibespace, no index.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, vncEnv, endRootedProcesses } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

armWatchdog();
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + String(extra).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 100) => { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };

const VNC_ENV = await vncEnv();
const GIT_ENV = gitEnvFrom(process.env);
const ROOT = scratch('hcli');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const wt = path.join(ROOT, 'wt');
const HOME = scratchHome('hcli-home');
const EMPTY_HOME = scratchHome('hcli-nohub');
const cwdT = path.join(ROOT, 'cwd-term'), cwdC = path.join(ROOT, 'cwd-chat');
for (const d of [cwdT, cwdC]) fs.mkdirSync(d, { recursive: true });
const CAPTURE = path.join(ROOT, 'stand-in-stdin.jsonl');
const PORT = await freePort();

// the stand-in claude: `--version` answers (the boot asks), anything else runs the measured stream-json turn shape;
// its capture + the long-turn clock are set HERE (the hub hands a session a sanitized env, never this suite's)
const SHIM = path.join(ROOT, 'bin', 'claude');
fs.mkdirSync(path.dirname(SHIM), { recursive: true });
fs.writeFileSync(SHIM, `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('2.1.308 (Claude Code) stand-in'); process.exit(0); }
process.env.STUB_CAPTURE = ${JSON.stringify(CAPTURE)}; process.env.STAND_IN_LONG_MS = '6000';
require(${JSON.stringify(path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs'))});
`, { mode: 0o755 });

let srv = null, srvOut = '', cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { srv?.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(ROOT); endRootedProcesses(HOME); } catch { }   // every dtach / wrapper / daemon this suite started (they outlive the hub BY DESIGN)
  try { execFileSync('git', ['-C', REPO, 'worktree', 'remove', '--force', wt], { stdio: 'ignore', env: GIT_ENV }); } catch { }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

// the worktree: HEAD, then the WORKING TREE's code overlaid (a pre-commit run tests this change, not the last release)
execFileSync('git', ['-C', REPO, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore', env: GIT_ENV });
for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(REPO, f), path.join(wt, f)]); }
execFileSync('rm', ['-rf', path.join(wt, 'data')]);
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
execFileSync('cp', ['-r', path.join(REPO, 'data/bin'), path.join(wt, 'data/bin')]);
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));

console.log('§1 the hub keeps the index on its own disk');
srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME, CLAUDE_CMD: SHIM, SHELL: '/bin/bash', VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { srvOut += d; }); srv.stderr.on('data', (d) => { srvOut += d; });
const up = await until(async () => { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { return false; } }, 60000, 250);
ok('setup: an isolated worktree hub is up (its own data/, HOME, port, a stand-in claude)', !!up, srvOut.slice(-800));
if (!up) process.exit(1);

const WebSocket = require('ws');
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
const frames = [];
ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
const create = async (o) => { ws.send(JSON.stringify({ type: 'create', cols: 100, rows: 30, ...o })); return until(() => frames.find((f) => (f.type === 'created' || f.type === 'error') && f.reqId === o.reqId), 60000); };
const term = await create({ backend: 'shell', mode: 'terminal', cwd: cwdT, sessionName: 'hc-term', reqId: 't1' });
ok('a TERMINAL session runs under a real dtach (a login shell)', term && term.type === 'created', JSON.stringify(term));
const chat = await create({ backend: 'claude', mode: 'chat', cwd: cwdC, sessionName: 'hc-chat', reqId: 'c1' });
ok('a CHAT session runs (data/bin/chat-wrapper.js over the stand-in claude)', chat && chat.type === 'created', JSON.stringify(chat) + srvOut.slice(-600));
const TID = term && term.sessionId, CID = chat && chat.sessionId;
ws.send(JSON.stringify({ type: 'attach', sessionId: CID }));
await until(() => frames.find((f) => f.type === 'attached' && f.sessionId === CID), 30000);
ws.send(JSON.stringify({ type: 'chat-input', sessionId: CID, text: 'hello from the web HCWEB', msgId: 'web-1' }));
const BUF = (id) => path.join(wt, 'data', 'session-buffers', id + '.buf');
ok('the web\'s message got its reply (the buffer holds it)', !!(await until(() => { try { return fs.readFileSync(BUF(CID), 'utf8').includes('reply: hello from the web HCWEB'); } catch { return false; } }, 20000)));

const INDEX = path.join(HOME, '.vibespace', 'local', 'sessions.json');
const readIndex = () => { try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return null; } };
const both = await until(() => { const d = readIndex(); return d && d.sessions.some((r) => r.id === TID) && d.sessions.some((r) => r.id === CID && r.conversationId) ? d : null; }, 15000);
ok('the index lists BOTH sessions, in <HOME>/.vibespace/local/sessions.json (the machine\'s own disk)', !!both, fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8').slice(0, 900) : 'no index file');
const rowT = both && both.sessions.find((r) => r.id === TID), rowC = both && both.sessions.find((r) => r.id === CID);
ok('a chat row carries the hub\'s own input frames (its adapter\'s line + Stop templates); a terminal none', rowC && rowC.input && rowC.input.line && rowC.input.line.type === 'user' && rowC.input.stop && rowC.input.stop.request && rowC.input.stop.request.subtype === 'interrupt' && rowT && rowT.input === null, JSON.stringify(rowC && rowC.input));
ok('each row names what reaches the session: kind, backend, name, folder, the dtach socket, the buffer',
  rowT && rowT.kind === 'terminal' && rowT.backend === 'shell' && rowT.name === 'hc-term' && rowT.cwd === cwdT && /data\/sockets\/cw-/.test(rowT.socket || '') && /\.buf$/.test(rowT.buffer || '')
  && rowC && rowC.kind === 'chat' && rowC.backend === 'claude' && rowC.name === 'hc-chat', JSON.stringify([rowT, rowC]));
const rawIndex = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';
const metaTok = (() => { try { for (const f of fs.readdirSync(path.join(wt, 'data', 'session-meta'))) { const m = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'session-meta', f), 'utf8')); if (m.agentToken) return m.agentToken; } } catch { } return null; })();
ok('NO secret in the index: no session token (the meta holds one — the index does not), no vsst_ / jbt_ at all', !!metaTok && !rawIndex.includes(metaTok) && !/vsst_|jbt_/.test(rawIndex), metaTok ? 'token present' : 'no meta token to compare');
const st = fs.existsSync(INDEX) ? fs.statSync(INDEX) : null, dst = fs.existsSync(path.dirname(INDEX)) ? fs.statSync(path.dirname(INDEX)) : null;
ok('the file is 0600 in a 0700 folder', st && (st.mode & 0o777) === 0o600 && dst && (dst.mode & 0o777) === 0o700, st && `${(st.mode & 0o777).toString(8)} / ${(dst.mode & 0o777).toString(8)}`);
const CLI = path.join(HOME, '.vibespace', 'local', 'bin', 'vibespace');
ok('the hub installed the person\'s CLI + its PURE half beside the index (a CLI under data/ hangs with data/)',
  fs.existsSync(CLI) && (fs.statSync(CLI).mode & 0o111) && fs.existsSync(path.join(path.dirname(CLI), 'vibespace-local-index.js'))
  && fs.readFileSync(CLI).equals(fs.readFileSync(path.join(REPO, 'data/bin/vibespace'))));
ok('the boot log says where the index is', /\[local-index\] sessions index for the person's CLI: .*sessions\.json/.test(srvOut), srvOut.split('\n').filter((l) => /local-index/.test(l)).join(' | '));

// the CLI exactly as a person runs it: the installed copy, their HOME, a plain PATH — no hub env, no token
const CLI_ENV = { HOME, PATH: '/usr/local/bin:/usr/bin:/bin', TERM: 'xterm-256color', LANG: 'C.UTF-8' };
const runCli = (args, { home = HOME, input = null, timeout = 20000 } = {}) => spawnSync(process.execPath, [CLI, ...args], { env: { ...CLI_ENV, HOME: home }, encoding: 'utf8', timeout, input: input == null ? undefined : input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
const lsJson = () => { const r = runCli(['ls', '--json']); try { return { ...JSON.parse(r.stdout), rc: r.status }; } catch { return { rc: r.status, raw: r.stdout + r.stderr }; } };

console.log('§2 `vibespace ls` / `status` with the hub up');
let L = lsJson();
const stateOf = (d, id) => d.sessions && (d.sessions.find((s) => s.id === id) || {}).state;
ok('ls --json: both sessions alive (their sockets answer), the hub up', L.rc === 0 && stateOf(L, TID) === 'alive' && stateOf(L, CID) === 'alive' && L.hub && L.hub.state === 'up', JSON.stringify(L).slice(0, 700));
const lsText = runCli(['ls']);
ok('ls prints the table: both names, their kinds, a number to pick them by', lsText.status === 0 && /hc-term/.test(lsText.stdout) && /hc-chat/.test(lsText.stdout) && /terminal/.test(lsText.stdout) && /\bchat\b/.test(lsText.stdout) && /^#\s+STATE/m.test(lsText.stdout), lsText.stdout + lsText.stderr);
let S = (() => { const r = runCli(['status', '--json']); try { return JSON.parse(r.stdout); } catch { return { raw: r.stdout + r.stderr }; } })();
ok('status --json: the hub answers its ONE bounded HTTP ask, data/ answers', S.hub && S.hub.state === 'up' && S.hub.http && S.hub.http.word === 'answers' && S.data && S.data.state === 'answers', JSON.stringify(S).slice(0, 700));

console.log('§3 the hub is killed (SIGTERM — this scratch hub only): the index survives it');
const hubPid = srv.pid;
srv.kill('SIGTERM');
const gone = await until(() => srv.exitCode != null || srv.signalCode != null, 20000);
ok('the scratch hub exited on SIGTERM', !!gone);
const stopped = readIndex();
ok('the index says the hub STOPPED (a clean stop is told apart from a crash)', stopped && stopped.hub && stopped.hub.pid === hubPid && Number(stopped.hub.stoppedAt) > 0, JSON.stringify(stopped && stopped.hub));
L = lsJson();
ok('with NO hub, ls still lists both — alive, judged by the kernel (the socket answers), the hub «stopped»',
  L.rc === 0 && stateOf(L, TID) === 'alive' && stateOf(L, CID) === 'alive' && L.hub && L.hub.state === 'stopped', JSON.stringify(L).slice(0, 700));
const t0 = Date.now();
S = (() => { const r = runCli(['status', '--json']); try { return JSON.parse(r.stdout); } catch { return { raw: r.stdout + r.stderr }; } })();
ok('status with no hub: its HTTP ask is REFUSED (nothing listens), said in < 4 s — never a wait', S.hub && S.hub.state === 'stopped' && S.hub.http && S.hub.http.word === 'refused' && Date.now() - t0 < 4000, JSON.stringify(S).slice(0, 600));

for (const v of ['ls', 'status']) { const r = runCli([v]); console.log(`    $ vibespace ${v}   (the hub down)\n` + (r.stdout + r.stderr).trimEnd().split('\n').map((l) => '    | ' + l).join('\n')); }
console.log('§4 `vibespace attach` — the terminal\'s live screen');
const pty = require('node-pty');
const drive = (args, { cols = 100, rows = 30 } = {}) => {
  const p = pty.spawn(process.execPath, [CLI, ...args], { name: 'xterm-256color', cols, rows, cwd: ROOT, env: CLI_ENV });
  const o = { out: '', exit: null };
  p.onData((d) => { o.out += d; });
  p.onExit((e) => { o.exit = e; });
  return { p, o, see: (re, ms = 15000) => until(() => re.test(o.out), ms), exited: (ms = 10000) => until(() => o.exit, ms) };
};
const a = drive(['attach', 'hc-term']);
ok('attach says how to leave before the screen (Ctrl-\\, the session keeps running)', !!(await a.see(/detach with Ctrl-\\/)), a.o.out.slice(-400));
await sleep(600);
a.p.write('echo HC-$((6*7))\r');
ok('a command typed into the attached screen RUNS in the session (HC-42 printed back)', !!(await a.see(/HC-42/)), JSON.stringify(a.o.out.slice(-600)));
a.p.write('\x1c');   // Ctrl-\ — dtach's detach key
const aExit = await a.exited();
ok('Ctrl-\\ detaches: the CLI ends and says the session keeps running', !!aExit && /detached from «hc-term»/.test(a.o.out), JSON.stringify(aExit) + JSON.stringify(a.o.out.slice(-300)));
L = lsJson();
ok('…and it does: after the detach the terminal session is still alive', stateOf(L, TID) === 'alive', JSON.stringify(L.sessions));

console.log('§5 `vibespace chat` — the chat session, with no hub');
if (!fs.existsSync(CLI)) console.log(`    (no person's CLI at ${CLI} — every leg below is red, not skipped)`);
const before = fs.existsSync(CAPTURE) ? fs.readFileSync(CAPTURE, 'utf8') : '';
const c = drive(['chat', 'hc-chat']);
ok('chat prints the last messages first (the web\'s exchange, from the buffer)', !!(await c.see(/reply: hello from the web HCWEB/)), JSON.stringify(c.o.out.slice(-700)));
ok('…then says how to send, Stop and leave', !!(await c.see(/type a line \+ Enter to send it/)), JSON.stringify(c.o.out.slice(-400)));
await sleep(300);
c.p.write('ping from the person HCCLI\r');
const got = await until(() => { const s = fs.existsSync(CAPTURE) ? fs.readFileSync(CAPTURE, 'utf8') : ''; return s.slice(before.length).includes('HCCLI') ? s.slice(before.length) : null; }, 15000);
ok('the line the person typed REACHED the wrapper and its CLI (the stand-in\'s own capture holds it)', !!got && /"type":"user"/.test(got), got || 'nothing captured');
ok('the reply streams back into the terminal', !!(await c.see(/reply: ping from the person HCCLI/)), JSON.stringify(c.o.out.slice(-500)));
ok('the turn\'s end is said', !!(await c.see(/turn ended/)));
c.p.write('start LONG- a long turn HCLONG\r');
await until(() => (fs.existsSync(CAPTURE) && fs.readFileSync(CAPTURE, 'utf8').includes('HCLONG')), 10000);
await sleep(400);
c.p.write('\x1b');   // Esc = Stop
const stopGot = await until(() => { const s = fs.existsSync(CAPTURE) ? fs.readFileSync(CAPTURE, 'utf8') : ''; return /"subtype":"interrupt"/.test(s.slice(s.indexOf('HCLONG'))) ? s : null; }, 10000);
ok('Esc = Stop: the interrupt frame reaches the CLI (the same control_request the web sends)', !!stopGot, fs.existsSync(CAPTURE) ? fs.readFileSync(CAPTURE, 'utf8').slice(-400) : 'no capture');
ok('…and the long turn ends stopped', !!(await c.see(/turn ended \(error_during_execution\)/)), JSON.stringify(c.o.out.slice(-400)));
c.p.write('\x03');   // Ctrl-C
const cExit = await c.exited();
ok('Ctrl-C leaves the chat (exit 0) and says the session keeps running', !!cExit && cExit.exitCode === 0 && /left «hc-chat»/.test(c.o.out), JSON.stringify(cExit) + JSON.stringify(c.o.out.slice(-300)));
L = lsJson();
ok('…and it does: the chat session is still alive', stateOf(L, CID) === 'alive');
const piped = runCli(['chat', 'hc-chat', '--wait', '1'], { input: 'a piped line HCPIPE\n' });
ok('a PIPED line is sent too (scripts: `echo … | vibespace chat <n>`), its reply printed', piped.status === 0 && fs.existsSync(CAPTURE) && fs.readFileSync(CAPTURE, 'utf8').includes('HCPIPE') && /reply: a piped line HCPIPE/.test(piped.stdout), piped.stdout.slice(-400) + piped.stderr);

console.log('§6 the refusals say what to do');
const onChat = runCli(['attach', 'hc-chat']);
ok('attach on a CHAT session: refused — it has no screen; the chat verb named', onChat.status === 2 && /is a CHAT session/.test(onChat.stderr) && /vibespace chat \d/.test(onChat.stderr), onChat.stderr);
const noTty = runCli(['attach', 'hc-term']);
ok('attach without a terminal: refused with the ssh -t door', noTty.status === 2 && /needs a terminal/.test(noTty.stderr) && /ssh -t/.test(noTty.stderr), noTty.stderr);
const agentTry = spawnSync(process.execPath, [CLI, 'chat', 'hc-chat'], { env: { ...CLI_ENV, VIBESPACE_SESSION_TOKEN: ['vsst', 'x'.repeat(24)].join('_') }, encoding: 'utf8', timeout: 10000, input: 'an agent typing\n' });
const agentLs = spawnSync(process.execPath, [CLI, 'ls'], { env: { ...CLI_ENV, VIBESPACE_JOB_TOKEN: ['jbt', 'y'.repeat(24)].join('_') }, encoding: 'utf8', timeout: 10000 });
ok('inside an AGENT session (or a job) every verb is refused — `ls` would hand an agent other sessions\' names; `chat` sends nothing to the wrapper', agentLs.status === 2 && !/hc-term/.test(agentLs.stdout) && agentTry.status === 2 && /vibespace-msg send/.test(agentTry.stderr) && !(fs.existsSync(CAPTURE) && fs.readFileSync(CAPTURE, 'utf8').includes('an agent typing')), agentTry.stderr);
const amb = runCli(['attach', 'hc-']);
ok('a name that matches two sessions: both listed, nothing done', amb.status === 2 && /names 2 sessions/.test(amb.stderr), amb.stderr);
// the terminal session dies (its dtach master, found by its own socket — this suite's)
const masterPid = (() => { if (!rowT || !rowT.socket) return null; for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) { try { const a2 = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0'); if (a2[0].endsWith('dtach') && a2.includes('-c') && a2.includes(rowT.socket)) return Number(d); } catch { } } return null; })();
ok('setup: the terminal\'s dtach master is found by its socket', !!masterPid);
try { process.kill(masterPid, 'SIGTERM'); } catch { }
if (masterPid) await until(() => { try { fs.statSync(rowT.socket); const r = spawnSync(process.execPath, ['-e', `require('net').createConnection(${JSON.stringify(rowT.socket)}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))`], { timeout: 3000 }); return r.status === 1; } catch { return true; } }, 10000);
L = lsJson();
ok('a session that died while the hub was down reads DEAD (its socket no longer answers)', stateOf(L, TID) === 'dead' && stateOf(L, CID) === 'alive', JSON.stringify(L.sessions && L.sessions.map((s) => [s.name, s.state, s.why])));
const dead = runCli(['attach', 'hc-term']);
ok('attach on a dead session: refused with words + the buffer file that holds its last screen', dead.status === 1 && /cannot attach to «hc-term»/.test(dead.stderr) && dead.stderr.includes('.buf'), dead.stderr);
const none = runCli(['ls'], { home: EMPTY_HOME });
ok('a machine where no hub ever ran: «no VibeSpace hub has run here» + the door', none.status === 1 && /no VibeSpace hub has run here/.test(none.stderr) && /ssh <hub> vibespace ls/.test(none.stderr), none.stderr);

try { ws.close(); } catch { }
console.log(`\ntest-human-cli: ${pass} passed, ${fail} failed`);
console.log(fail ? `${fail} FAILED` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
