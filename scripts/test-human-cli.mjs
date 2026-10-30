#!/usr/bin/env node
// THE PERSON'S CLI ON A REAL HUB (heavy — lane human-cli, 2026-10-28; the owner after the 89-minute hub freeze: «hub
// 挂掉的时候我可以从机器上快速用指令列出来有哪些 session，attach 进一个 session 和 session 交互»). A scratch hub (its own
// worktree, data/, port — never the production checkout) runs a REAL dtach terminal session (a login shell) and a REAL
// chat session (data/bin/chat-wrapper.js over the stand-in claude, scripts/fixtures/claude-stand-in-cli.cjs).
//   §0 THE THROWAWAY HUB (round 2): booted with this suite's REAL HOME env from a /tmp worktree — the root verdict calls it a
//      throwaway: its index lands under ITS OWN root (read by that root's data/bin/vibespace), the HOME's
//      ~/.vibespace/local is untouched, no CLI installed there
//   §1 the same worktree as an INSTALLED hub (the root verdict forced over a scratch HOME): one file per hub root, both
//      rows, no token, 0600 in a 0700 folder; the CLI installed beside it
//   §2 `vibespace ls` / `status` with the hub UP; `attach` on a live hub is refused without --take (a second reader would
//      cost the hub's own view); a line from `chat` while the hub is up — the hub's own view still gets every reply
//   §3 SIGTERM the scratch hub (only it): its file says it STOPPED; `ls` still lists both, alive — judged by the kernel
//   §4 `vibespace attach` = the live screen of the terminal (a command typed there runs; Ctrl-\ detaches; it keeps running)
//   §5 `vibespace chat` = the last messages, a line the wrapper RECEIVES (acknowledged by its receipt in the buffer), the
//      reply read from the buffer, Esc = Stop (said only after its receipt), Ctrl-C leaves; a piped line by id or name; a
//      piped NUMBER refused; a number at a terminal confirmed by name first
//   §6 the refusals: an agent (a bare `vibespace` too), a chat has no screen, a dead session names its buffer, no hub ever ran
//   §7 round 4: the follower keys on RECORD IDENTITY (a line edited in place — claude-steer's copy line — while replies
//      stream: each reply once, a shown record's edit said «(updated)»); the baseline BEFORE the history (a FROZEN hub's 2 s:
//      the record persisted meanwhile shown once); the REAL agy-wrapper's receipts (a hub that answers: sent + acked, a torn
//      line nacked, its receipts file gone with it); the 250 ms persist window only on a receipt asked for
//   §8 round 5: ONE clock (a buffer that does not answer is said in 2 s, not two clocks in a row); THE GAP RULE on every
//      record the follower reports (a reply the transcript history showed, persisted after it, shown once — until a newer
//      one); its edges (gapFilter); a placeholder uuid is never a record's id (a new reply is never «(updated)»)
//   §9 round 6: ONE DEADLINE — the history is never read before the follower's baseline (a slow FIFO buffer that answers:
//      the reply that lands between is shown once; THE MUTANT reading at half the clock shows it 0 times); the history's
//      sources each judged on its own answer (a stalled transcript leaves a slow-but-healthy buffer its time); the
//      horizon: a subagent's record and an edit in place never move it
//   §10 round 7: THE TRANSCRIPT READ EARLY, HELD, CHECKED AGAINST THE BASELINE — a buffer that does not answer never starves
//      a slow-but-healthy transcript (300 / 800 / 1500 ms: its history inside the deadline); a reply landing between the
//      early read and the baseline is shown once (the buffer read at the baseline) or SAID when neither file answers again
//      in time; a baseline later than the deadline is checked against what was printed (said, never silent); §9a's
//      second mutant — the held read printed without the check — shows case B's reply 0 times
//   §11 round 8: THE EARLY READ IS A HEAD START — the transcript is read AGAIN at the print moment (a stalled buffer, a reply
//      landing in the transcript inside the 2 s: shown once; a read again not in time: the held one, SAID as how old); a
//      failed check is the UNION of the transcript's read and the buffer as the follower read it (a transcript lagging the
//      buffer: the reply shown once, from the buffer); a newest message with no real uuid never satisfies the check (a
//      placeholder'd copy, its transcript record late: shown once); a baseline LATER than the deadline shows what it holds
//      beyond the history, and a line sent meanwhile gets its ack from the late receipts baseline. Each with its mutant RED.
//      §10 as round 8 prints it: §10b/§10c's reply SHOWN once (round 7 said it was not)
//   §12 round 9: THE BUFFER'S TEXT DECODED ACROSS PIPE CHUNKS — the follower's `ready` carries the whole buffer: a CJK buffer
//      as the history's ONLY source (no transcript — every codex / acp / agy chat) is printed with no U+FFFD and every
//      message exact; a CJK prompt matched by the union's person's-words key is shown once; WHAT THIS CLI SENT IS NEVER
//      PRINTED AGAIN by a late baseline with no history (by the frame's id; an older line with the same words kept). §12a and
//      §12c each with its mutant RED (round 8: U+FFFD, the sent line twice). Round 10: AN ID DECIDES — with this CLI's copy
//      not in that baseline, the same words from another sender (its own id), a peer, a codex-shaped line or the person's
//      own older line are each shown; another sender's line right after ours is shown in its own place. With its mutant RED.
//      Round 11: A RECORD WITH NO ID IS NEVER OURS — no words road: every id-less record with the same words is shown (round
//      9's id-less copy of ours too: the echo + that record), another sender's id-less line shown with ours not in the
//      baseline; codex's `payload.webui_queue_id` is an id — another's shown, ours dropped. With its two mutants RED.
// RED on the base (6428c67e): no data/bin/vibespace, no index; RED on round 1 (5a0b2463): §0, the live-hub attach, the
// receipt, the piped number, the bare refusal; RED on round 3 (ea0cecce): §7 and the killed session's .receipts (§2);
// RED on round 4 (ad114fd78): §8. RED on round 5 (bd110027f): §9. RED on round 6 (74cf819d2): §10a, §10b's second half, §10c. RED on round 7 (cd2239445): §10b's
// second half, §10c, §11a–§11d. RED on round 8 (eb2ecc5df): §12a–§12c. RED on round 9 (c4a3ffa4c): §12c's round 10 legs.
// RED on round 10 (cb5328988): §12c's round 11 legs (queue, noid) and round 9's id-less leg.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
const REAL_HOME = process.env.HOME;   // the suite's own HOME — on a person's machine, theirs
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
const OWN_NAME = `sessions.${crypto.createHash('sha256').update(fs.realpathSync(wt)).digest('hex').slice(0, 12)}.json`;
const bootHub = async (env) => {
  srvOut = '';
  srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), CLAUDE_CMD: SHIM, SHELL: '/bin/bash', VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', (d) => { srvOut += d; }); srv.stderr.on('data', (d) => { srvOut += d; });
  return until(async () => { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { return false; } }, 60000, 250);
};
const stopHub = async () => { const p = srv; p.kill('SIGTERM'); return until(() => p.exitCode != null || p.signalCode != null, 20000); };
const snapshot = (dir) => { try { return fs.readdirSync(dir).sort().map((n) => { const st = fs.statSync(path.join(dir, n)); return `${n}:${st.size}:${st.mtimeMs}`; }).join('|'); } catch (e) { return `absent (${e.code})`; } };

console.log('§0 a THROWAWAY hub (a /tmp worktree) booted with this suite\'s REAL HOME env — the HOME\'s index is untouched');
const realPlace = path.join(REAL_HOME, '.vibespace', 'local');
const realBefore = snapshot(realPlace);
const up0 = await bootHub({ HOME: REAL_HOME });
ok('setup: the throwaway hub is up (its own worktree, data/, port — the real HOME env)', !!up0, srvOut.slice(-800));
const TW = path.join(wt, 'data', 'local-index', OWN_NAME);
const tw = await until(() => { try { return JSON.parse(fs.readFileSync(TW, 'utf8')); } catch { return null; } }, 15000);
ok('its index is under ITS OWN root (<root>/data/local-index/sessions.<rootDigest>.json), marked throwaway by the root verdict, said in its log',
  !!tw && tw.hub && tw.hub.throwaway && tw.hub.root === fs.realpathSync(wt) && /\[local-index\] a throwaway hub \(\w+\): its sessions index is /.test(srvOut), (tw ? JSON.stringify(tw.hub) : 'no own-root index') + ' | ' + srvOut.split('\n').filter((l) => /local-index/.test(l)).join(' | '));
ok('…and the REAL HOME\'s ~/.vibespace/local is untouched — no file of this hub, no CLI installed (37 server-booting suites set no HOME of their own)',
  snapshot(realPlace) === realBefore && !fs.existsSync(path.join(realPlace, OWN_NAME)), `${realBefore} → ${snapshot(realPlace)}`);
const twLs = spawnSync(process.execPath, [path.join(wt, 'data', 'bin', 'vibespace'), 'ls', '--json'], { env: { HOME: EMPTY_HOME, PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8' }, encoding: 'utf8', timeout: 20000 });
let twDoc = null; try { twDoc = JSON.parse(twLs.stdout); } catch { }
ok('that root\'s own data/bin/vibespace reads it (a fake HOME, no index there): the throwaway hub, up', twLs.status === 0 && twDoc && twDoc.hubs && twDoc.hubs.length === 1 && twDoc.hubs[0].hub.throwaway && twDoc.hubs[0].hub.state === 'up', twLs.stdout.slice(0, 400) + twLs.stderr);
ok('setup: the throwaway hub stopped on SIGTERM', !!(await stopHub()));

console.log('§1 the same worktree as an INSTALLED hub (the root verdict forced over a scratch HOME): one file per hub root');
const up = await bootHub({ HOME, VIBESPACE_FORCE_AGENT_HOOKS: '1' });
ok('setup: the installed hub is up (its own data/, a scratch HOME, port, a stand-in claude)', !!up, srvOut.slice(-800));
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

const INDEX = path.join(HOME, '.vibespace', 'local', OWN_NAME);
const readIndex = () => { try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return null; } };
const both = await until(() => { const d = readIndex(); return d && d.sessions.some((r) => r.id === TID) && d.sessions.some((r) => r.id === CID && r.conversationId) ? d : null; }, 15000);
ok('the index lists BOTH sessions, in <HOME>/.vibespace/local/sessions.<rootDigest>.json (the machine\'s own disk, ONE file per hub root)', !!both && both.hub.throwaway === false, fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8').slice(0, 900) : `no index file ${INDEX}`);
const rowT = both && both.sessions.find((r) => r.id === TID), rowC = both && both.sessions.find((r) => r.id === CID);
ok('a chat row carries the hub\'s own input frames (its adapter\'s Enter line + Stop templates) and its transcript by the harness\'s path rule; a terminal none',
  rowC && rowC.input && rowC.input.line && rowC.input.line.type === 'user' && rowC.input.stop && rowC.input.stop.request && rowC.input.stop.request.subtype === 'interrupt' && rowT && rowT.input === null && /\.claude\/projects\/.*\.jsonl$/.test(rowC.transcript || ''), JSON.stringify(rowC && { input: rowC.input, transcript: rowC.transcript }));
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
  !!(await until(() => fs.existsSync(CLI) && fs.existsSync(path.join(path.dirname(CLI), 'vibespace-local-index.js')), 10000)) && (fs.statSync(CLI).mode & 0o111) && fs.readFileSync(CLI).equals(fs.readFileSync(path.join(REPO, 'data/bin/vibespace'))));
ok('the boot log says where the index is', /\[local-index\] sessions index for the person's CLI: .*sessions\.[0-9a-f]{12}\.json/.test(srvOut), srvOut.split('\n').filter((l) => /local-index/.test(l)).join(' | '));

// the CLI exactly as a person runs it: the installed copy, their HOME, a plain PATH — no hub env, no token
const CLI_ENV = { HOME, PATH: '/usr/local/bin:/usr/bin:/bin', TERM: 'xterm-256color', LANG: 'C.UTF-8' };
const runCli = (args, { home = HOME, input = null, timeout = 30000, env = {} } = {}) => spawnSync(process.execPath, [CLI, ...args], { env: { ...CLI_ENV, HOME: home, ...env }, encoding: 'utf8', timeout, input: input == null ? undefined : input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
const lsJson = () => { const r = runCli(['ls', '--json']); try { return { ...JSON.parse(r.stdout), rc: r.status }; } catch { return { rc: r.status, raw: r.stdout + r.stderr }; } };

console.log('§2 `vibespace ls` / `status` / `attach` / `chat` with the hub up');
let L = lsJson();
const stateOf = (d, id) => d.sessions && (d.sessions.find((s) => s.id === id) || {}).state;
ok('ls --json: both sessions alive (their sockets answer), the hub up', L.rc === 0 && stateOf(L, TID) === 'alive' && stateOf(L, CID) === 'alive' && L.hub && L.hub.state === 'up', JSON.stringify(L).slice(0, 700));
const lsText = runCli(['ls']);
ok('ls prints the table: both names, their kinds, a number to pick them by', lsText.status === 0 && /hc-term/.test(lsText.stdout) && /hc-chat/.test(lsText.stdout) && /terminal/.test(lsText.stdout) && /\bchat\b/.test(lsText.stdout) && /^#\s+STATE/m.test(lsText.stdout), lsText.stdout + lsText.stderr);
let S = (() => { const r = runCli(['status', '--json']); try { return JSON.parse(r.stdout); } catch { return { raw: r.stdout + r.stderr }; } })();
ok('status --json: the hub answers its ONE bounded HTTP ask, data/ answers', S.hub && S.hub.state === 'up' && S.hub.http && S.hub.http.word === 'answers' && S.data && S.data.state === 'answers', JSON.stringify(S).slice(0, 700));
const liveAttach = runCli(['attach', 'hc-term']);
ok('attach on a LIVE hub: refused without --take — a second reader on the session\'s socket would cost the hub\'s own view (said), the recipe named',
  liveAttach.status === 2 && /hub is up and answering/.test(liveAttach.stderr) && /hub's own view may miss output while you are attached/.test(liveAttach.stderr) && /vibespace attach hc-term --take/.test(liveAttach.stderr), liveAttach.stderr);
const nFrames = frames.length;
const liveChat = runCli(['chat', CID, '--wait', '2'], { input: 'while the hub is up HCLIVE\n' });
ok('a line from `chat` while the hub is up: acknowledged by the wrapper\'s receipt (no «not acknowledged»), the reply read from the buffer',
  liveChat.status === 0 && /reply: while the hub is up HCLIVE/.test(liveChat.stdout) && !/not acknowledged|read-only/.test(liveChat.stdout + liveChat.stderr), liveChat.stdout.slice(-500) + liveChat.stderr);
ok('…and the HUB\'s own view got that reply too (the CLI pushed and let go — never a second reader)', !!(await until(() => frames.slice(nFrames).some((f) => JSON.stringify(f).includes('reply: while the hub is up HCLIVE')), 10000)));
// round 4: a wrapper killed past its exit handler leaves <id>.receipts — the hub's kill-path teardown takes it with the
// buffer (planted: this session's wrapper wrote none of its own, so its own exit would leave it)
const gone = await create({ backend: 'claude', mode: 'chat', cwd: cwdC, sessionName: 'hc-gone', reqId: 'c2' });
const GID = gone && gone.type === 'created' ? gone.sessionId : null;
const GR = GID ? BUF(GID).replace(/\.buf$/, '.receipts') : null;
if (GR) { await until(() => fs.existsSync(BUF(GID)), 10000); fs.writeFileSync(GR, JSON.stringify({ type: '_stdin_ack', timestamp: Date.now(), msg_id: 'vs-cli-planted' }) + '\n'); }
if (GID) ws.send(JSON.stringify({ type: 'kill', sessionId: GID }));
const tornDown = GID ? await until(() => !fs.existsSync(BUF(GID)), 20000) : null;
ok('a session ENDED through the hub: its <id>.receipts goes with its buffer — the kill-path teardown removes it (round 4; a wrapper killed past its own exit handler leaves one)',
  !!tornDown && !!(await until(() => !fs.existsSync(GR), 3000)), JSON.stringify({ created: gone && gone.type, buf: !!GID && fs.existsSync(BUF(GID)), receipts: !!GR && fs.existsSync(GR) }));

console.log('§3 the hub is killed (SIGTERM — this scratch hub only): the index survives it');
const hubPid = srv.pid;
ok('the scratch hub exited on SIGTERM', !!(await stopHub()));
const stopped = readIndex();
ok('its file says the hub STOPPED (a clean stop is told apart from a crash)', stopped && stopped.hub && stopped.hub.pid === hubPid && Number(stopped.hub.stoppedAt) > 0, JSON.stringify(stopped && stopped.hub));
L = lsJson();
ok('with NO hub, ls still lists both — alive, judged by the kernel (the socket answers), the hub «stopped»',
  L.rc === 0 && stateOf(L, TID) === 'alive' && stateOf(L, CID) === 'alive' && L.hub && L.hub.state === 'stopped', JSON.stringify(L).slice(0, 700));
const t0 = Date.now();
S = (() => { const r = runCli(['status', '--json']); try { return JSON.parse(r.stdout); } catch { return { raw: r.stdout + r.stderr }; } })();
ok('status with no hub: its HTTP ask is REFUSED (nothing listens), said in < 4 s — never a wait', S.hub && S.hub.state === 'stopped' && S.hub.http && S.hub.http.word === 'refused' && Date.now() - t0 < 4000, JSON.stringify(S).slice(0, 600));

for (const v of ['ls', 'status']) { const r = runCli([v]); console.log(`    $ vibespace ${v}   (the hub down)\n` + (r.stdout + r.stderr).trimEnd().split('\n').map((l) => '    | ' + l).join('\n')); }
console.log('§4 `vibespace attach` — the terminal\'s live screen (the hub down: no --take needed)');
const pty = require('node-pty');
const drive = (args, { cols = 100, rows = 30 } = {}) => {
  const p = pty.spawn(process.execPath, [CLI, ...args], { name: 'xterm-256color', cols, rows, cwd: ROOT, env: CLI_ENV });
  const o = { out: '', exit: null };
  p.onData((d) => { o.out += d; });
  p.onExit((e) => { o.exit = e; });
  return { p, o, see: (re, ms = 15000) => until(() => re.test(o.out), ms), exited: (ms = 10000) => until(() => o.exit, ms) };
};
const a = drive(['attach', 'hc-term']);
ok('attach says how to leave before the screen (Ctrl-\\, the session keeps running) and that the hub is down', !!(await a.see(/detach with Ctrl-\\/)) && /the hub is stopped/.test(a.o.out), a.o.out.slice(-400));
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
ok('chat prints the last messages first (the web\'s exchange)', !!(await c.see(/reply: hello from the web HCWEB/)), JSON.stringify(c.o.out.slice(-700)));
ok('…then says how to send, Stop and leave', !!(await c.see(/type a line \+ Enter to send it/)), JSON.stringify(c.o.out.slice(-400)));
await sleep(300);
c.p.write('ping from the person HCCLI\r');
const got = await until(() => { const s = fs.existsSync(CAPTURE) ? fs.readFileSync(CAPTURE, 'utf8') : ''; return s.slice(before.length).includes('HCCLI') ? s.slice(before.length) : null; }, 15000);
ok('the line the person typed REACHED the wrapper and its CLI (the stand-in\'s own capture holds it) — without the receipt key (the wrapper strips it)', !!got && /"type":"user"/.test(got) && !/webui_receipt/.test(got), got || 'nothing captured');
ok('the reply streams back into the terminal (read from the wrapper\'s buffer)', !!(await c.see(/reply: ping from the person HCCLI/)), JSON.stringify(c.o.out.slice(-500)));
ok('the turn\'s end is said', !!(await c.see(/turn ended/)));
ok('no line went unacknowledged (each got the wrapper\'s receipt)', !/not acknowledged/.test(c.o.out), JSON.stringify(c.o.out.slice(-300)));
c.p.write('start LONG- a long turn HCLONG\r');
await until(() => (fs.existsSync(CAPTURE) && fs.readFileSync(CAPTURE, 'utf8').includes('HCLONG')), 10000);
await sleep(400);
c.p.write('\x1b');   // Esc = Stop
const stopGot = await until(() => { const s = fs.existsSync(CAPTURE) ? fs.readFileSync(CAPTURE, 'utf8') : ''; return /"subtype":"interrupt"/.test(s.slice(s.indexOf('HCLONG'))) ? s : null; }, 10000);
ok('Esc = Stop: the interrupt frame reaches the CLI (the same control_request the web sends)', !!stopGot, fs.existsSync(CAPTURE) ? fs.readFileSync(CAPTURE, 'utf8').slice(-400) : 'no capture');
ok('…Stop is said only AFTER its receipt («Stop taken»), and the long turn ends stopped', !!(await c.see(/Stop taken/)) && !!(await c.see(/turn ended \(error_during_execution\)/)), JSON.stringify(c.o.out.slice(-400)));
c.p.write('\x03');   // Ctrl-C
const cExit = await c.exited();
ok('Ctrl-C leaves the chat (exit 0) and says the session keeps running', !!cExit && cExit.exitCode === 0 && /left «hc-chat»/.test(c.o.out), JSON.stringify(cExit) + JSON.stringify(c.o.out.slice(-300)));
L = lsJson();
ok('…and it does: the chat session is still alive', stateOf(L, CID) === 'alive');
const piped = runCli(['chat', 'hc-chat', '--wait', '1'], { input: 'a piped line HCPIPE\n' });
ok('a PIPED line by NAME is sent (scripts: `echo … | vibespace chat <id|name>`), its reply printed', piped.status === 0 && fs.existsSync(CAPTURE) && fs.readFileSync(CAPTURE, 'utf8').includes('HCPIPE') && /reply: a piped line HCPIPE/.test(piped.stdout), piped.stdout.slice(-400) + piped.stderr);
const nChat = (lsJson().sessions || []).find((s) => s.id === CID);
const pipedNum = runCli(['chat', String(nChat && nChat.n), '--wait', '1'], { input: 'a numbered piped line HCNUM\n' });
ok('a PIPED NUMBER is refused by name (numbers move when an older session ends — a script\'s line could reach another conversation); nothing sent',
  pipedNum.status === 2 && /a number names a session only at a terminal/.test(pipedNum.stderr) && !fs.readFileSync(CAPTURE, 'utf8').includes('HCNUM'), pipedNum.stderr);
const cn = drive(['chat', String(nChat && nChat.n)]);
ok('a number AT A TERMINAL is confirmed by NAME first', !!(await cn.see(/is «hc-chat» \(sess-[^)]+\) · chat · claude · .* — chat with it\? \[y\/N\]/)), JSON.stringify(cn.o.out.slice(-300)));
cn.p.write('n\r');
ok('…a «no» sends nothing and leaves', !!(await cn.exited()) && /nothing sent/.test(cn.o.out), JSON.stringify(cn.o.out.slice(-200)));

console.log('§6 the refusals say what to do');
const onChat = runCli(['attach', 'hc-chat']);
ok('attach on a CHAT session: refused — it has no screen; the chat verb named', onChat.status === 2 && /is a CHAT session/.test(onChat.stderr) && /vibespace chat sess-/.test(onChat.stderr), onChat.stderr);
const noTty = runCli(['attach', 'hc-term']);
ok('attach without a terminal: refused with the ssh -t door', noTty.status === 2 && /needs a terminal/.test(noTty.stderr) && /ssh -t/.test(noTty.stderr), noTty.stderr);
const tok = ['vsst', 'x'.repeat(24)].join('_');
const agentTry = runCli(['chat', 'hc-chat'], { env: { VIBESPACE_SESSION_TOKEN: tok }, input: 'an agent typing\n' });
const agentLs = runCli(['ls'], { env: { VIBESPACE_JOB_TOKEN: ['jbt', 'y'.repeat(24)].join('_') } });
const agentBare = runCli([], { env: { VIBESPACE_SESSION_TOKEN: tok } });
ok('inside an AGENT session (or a job) EVERY verb is refused FIRST — a bare `vibespace` too (it lists sessions): nothing printed, nothing sent; the agent\'s road is vibespace-msg',
  agentLs.status === 2 && !/hc-term/.test(agentLs.stdout) && agentTry.status === 2 && /vibespace-msg send/.test(agentTry.stderr) && agentBare.status === 2 && agentBare.stdout === '' && !(fs.existsSync(CAPTURE) && fs.readFileSync(CAPTURE, 'utf8').includes('an agent typing')), JSON.stringify({ bare: [agentBare.status, agentBare.stdout.slice(0, 120)], chat: agentTry.stderr.slice(0, 120) }));
const amb = runCli(['attach', 'hc-']);
ok('a name part that matches two sessions: refused (a script takes an id or an exact name), nothing done', amb.status === 2 && /no session «hc-»/.test(amb.stderr), amb.stderr);
// the terminal session dies: its login shell is told `exit` through the session's own socket (a MSG_PUSH — what a person's
// typed `exit` is) and the session ends with its shell — round 6, the kill law: never a pid found by a scan of /proc
const told = !!(rowT && rowT.socket) && spawnSync(process.execPath, ['-e', `const LI = require(${JSON.stringify(path.join(REPO, 'src/local-index.js'))}); const s = require('net').createConnection(${JSON.stringify(rowT.socket)}); s.on('connect', () => s.end(LI.dtachPush('exit\\n'), () => process.exit(0))); s.on('error', () => process.exit(1));`], { timeout: 5000 }).status === 0;
ok('setup: the terminal\'s login shell is told `exit` through its own socket', told);
if (told) await until(() => { try { fs.statSync(rowT.socket); const r = spawnSync(process.execPath, ['-e', `require('net').createConnection(${JSON.stringify(rowT.socket)}).on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))`], { timeout: 3000 }); return r.status === 1; } catch { return true; } }, 10000);
L = lsJson();
ok('a session that died while the hub was down reads DEAD (its socket no longer answers)', stateOf(L, TID) === 'dead' && stateOf(L, CID) === 'alive', JSON.stringify(L.sessions && L.sessions.map((s) => [s.name, s.state, s.why])));
const dead = runCli(['attach', 'hc-term']);
ok('attach on a dead session: refused with words + the buffer file that holds its last screen', dead.status === 1 && /cannot attach to «hc-term»/.test(dead.stderr) && dead.stderr.includes('.buf'), dead.stderr);
const none = runCli(['ls'], { home: EMPTY_HOME });
ok('a machine where no hub ever ran: «no VibeSpace hub has run here» + the door', none.status === 1 && /no VibeSpace hub has run here/.test(none.stderr) && /ssh <hub> vibespace ls/.test(none.stderr), none.stderr);

console.log('§7 round 4 — the follower keys on identity, the baseline before the history, the fourth wrapper\'s receipts, the persist window');
{
  const net = require('net');
  const LI = require(path.join(REPO, 'src/local-index.js'));
  const R4 = path.join(ROOT, 'r4'), BUFS7 = path.join(R4, 'bufs'), H7 = path.join(R4, 'home'), PLACE7 = path.join(H7, '.vibespace', 'local');
  fs.mkdirSync(BUFS7, { recursive: true }); fs.mkdirSync(PLACE7, { recursive: true }); fs.chmodSync(path.dirname(PLACE7), 0o700); fs.chmodSync(PLACE7, 0o700);
  const kids = [], servers = [];
  const listen7 = (srv, ...a) => new Promise((r) => { servers.push(srv); srv.listen(...a, () => r(srv)); });
  // a hub that answers — or FROZEN: it accepts and never answers (the CLI's one ask waits its 2 s)
  const fakeHub = (frozen) => listen7(net.createServer((c) => { c.on('error', () => { }); if (!frozen) c.end('HTTP/1.1 200 OK\r\ncontent-length: 0\r\n\r\n'); }), 0, '127.0.0.1');
  // a dtach master's stand-in: the CLI's MSG_PUSH packets (10 bytes: type 0, len, 8 payload bytes) back into lines
  const master = (sock, onLine = () => { }) => listen7(net.createServer((c) => {
    let b = Buffer.alloc(0), line = Buffer.alloc(0);
    c.on('error', () => { });
    c.on('data', (d) => {
      b = Buffer.concat([b, d]);
      while (b.length >= 10) {
        const pk = b.subarray(0, 10); b = b.subarray(10);
        if (pk[0] !== 0) continue;
        line = Buffer.concat([line, pk.subarray(2, 2 + pk[1])]);
        let i; while ((i = line.indexOf(10)) >= 0) { onLine(line.subarray(0, i).toString('utf8')); line = line.subarray(i + 1); }
      }
    });
  }), sock);
  const ST7 = LI.procStat(fs.readFileSync('/proc/self/stat', 'utf8'));
  const index7 = (rows, port) => fs.writeFileSync(path.join(PLACE7, LI.indexFileOf('a4a4a4a4a4a4')), JSON.stringify(LI.docOf({ hub: { pid: process.pid, starttime: ST7.starttime, root: R4, port, host: '127.0.0.1', seenAt: Date.now() }, rows, now: Date.now() })), { mode: 0o600 });
  const row7 = (id, o, extra = {}) => LI.rowOf(id, { mode: 'chat', backend: 'claude', name: id, createdAt: Date.now() - 60000, ...o }, { buffersDir: BUFS7, ...extra });
  // the person's CLI, async (this process serves its socket and its hub)
  const cli7 = (args, input = '') => new Promise((resolve) => {
    const ch = spawn(process.execPath, [CLI, ...args], { env: { ...CLI_ENV, HOME: H7 }, stdio: ['pipe', 'pipe', 'pipe'] });
    kids.push(ch);
    let out = ''; ch.stdout.on('data', (d) => { out += d; }); ch.stderr.on('data', (d) => { out += d; });
    ch.stdin.end(input);
    const t = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 30000);
    ch.on('exit', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
  const rec = (o) => JSON.stringify(o);
  const said = (text, extra = {}) => rec({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, ...extra });
  const copyLine = (handNo) => rec({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'a held line HCHELD' }] }, msgId: 'vs-cli-held', handNo, _fromWebui: true, webui_copy: true });
  const count = (s, needle) => s.split(needle).length - 1;
  const readOr = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

  { // §7a THE FOLLOWER ON IDENTITY — the buffer's middle line EDITED IN PLACE while replies stream
    const id = 'sess-r4-follow', buf = path.join(BUFS7, id + '.buf'), sock = path.join(R4, 'f.sock');
    await master(sock); const hub = await fakeHub(false);
    index7([row7(id, { socketPath: sock })], hub.address().port);
    const L1 = said('EARLIER HCEARLY', { uuid: 'u-early' }), L2 = rec({ type: 'system', subtype: 'informational', content: 'queued' });
    fs.writeFileSync(buf, [L1, copyLine(0), L2].join('\n') + '\n');
    const run = cli7(['chat', id, '--wait', '4']);
    await sleep(1200);
    const R = (i) => said(`REPLY-${i} HCR4`);
    for (const lines of [
      [L1, copyLine(1), L2, R(1)],                                                            // the held copy drains: its line edited IN PLACE
      [said('EARLIER HCEARLY, edited', { uuid: 'u-early' }), copyLine(1), L2, R(1), R(2)],   // a record already shown, edited in place
      [copyLine(1), L2, R(1), R(2), R(3)],                                                    // the head cut
      [copyLine(1), L2, R(1), R(2), R(3), R(4)],
    ]) { fs.writeFileSync(buf, lines.join('\n') + '\n'); await sleep(300); }
    const r = await run;
    const replies = [1, 2, 3, 4].map((i) => count(r.out, `REPLY-${i} HCR4`));
    ok('THE FOLLOWER ON RECORD IDENTITY (round 4): the buffer\'s middle line EDITED IN PLACE (a held copy draining — claude-steer\'s copy line) while replies stream — every reply shown exactly once (round 3\'s prefix rule: the first two never)',
      replies.every((n) => n === 1), JSON.stringify(replies) + ' | ' + r.out.slice(-700));
    ok('…a record already shown, edited in place: said once more, marked «(updated)»; the head cut repeats nothing; the held copy (the person\'s own line) only in the history',
      count(r.out, '(updated)') === 1 && /\(updated\) claude: EARLIER HCEARLY, edited/.test(r.out) && count(r.out, 'EARLIER HCEARLY') === 2 && count(r.out, 'HCHELD') === 1, r.out.slice(-700));
  }
  { // §7b THE BASELINE BEFORE THE HISTORY — a FROZEN hub: the CLI's one ask waits 2 s while the wrapper persists
    const id = 'sess-r4-gap', buf = path.join(BUFS7, id + '.buf'), sock = path.join(R4, 'g.sock');
    await master(sock); const hub = await fakeHub(true);
    index7([row7(id, { socketPath: sock })], hub.address().port);
    fs.writeFileSync(buf, said('HISTORY-0 HCGAP') + '\n');
    const run = cli7(['chat', id, '--wait', '3']);
    await sleep(1000); fs.appendFileSync(buf, said('REPLY-AT-1s HCGAP') + '\n');   // persisted while the CLI waits on the frozen hub
    await sleep(2000); fs.appendFileSync(buf, said('REPLY-AT-3s HCGAP') + '\n');
    const r = await run;
    ok('THE BASELINE BEFORE THE HISTORY (round 4): on a FROZEN hub the record the wrapper persisted while the CLI waited its 2 s is shown — the history, the gap and the live tail each exactly once',
      /the hub is frozen/.test(r.out) && count(r.out, 'HISTORY-0 HCGAP') === 1 && count(r.out, 'REPLY-AT-1s HCGAP') === 1 && count(r.out, 'REPLY-AT-3s HCGAP') === 1, r.out.slice(-700));
  }
  { // §7c THE FOURTH CHAT WRAPPER — the REAL agy-wrapper over the stub agy, behind a dtach master's stand-in
    const id = 'sess-r4-agy', buf = path.join(BUFS7, id + '.buf'), meta = path.join(BUFS7, id + '.json'), rcpt = LI.receiptsFileOf(buf), sock = path.join(R4, 'a.sock'), stubLog = path.join(R4, 'agy-stub.log');
    const env = { ...process.env }; for (const k of Object.keys(env)) if (/^VIBESPACE_|^ACP_WEBUI_|^AGY_|^CLAUDE_CODE_/.test(k)) delete env[k];
    const w = spawn(process.execPath, [path.join(REPO, 'data/bin/agy-wrapper.js'), buf, meta, path.join(REPO, 'scripts/fixtures/antigravity-agy')], { cwd: R4, env: { ...env, VIBESPACE_SKIP_AGENT_HOOKS: '1', AGY_WEBUI_CWD: R4, AGY_WEBUI_BACKEND: 'antigravity', AGY_STUB_LOG: stubLog, AGY_WEBUI_AUTH_GRACE_MS: '400' }, stdio: ['pipe', 'ignore', 'ignore'] });
    kids.push(w);
    const caps = await until(() => { try { return JSON.parse(fs.readFileSync(meta, 'utf8')).caps || null; } catch { return null; } }, 10000);
    await master(sock, (line) => { try { w.stdin.write(line + '\n'); } catch { } });
    const hub = await fakeHub(false);   // the hub UP and answering — where round 3 refused this session «started before 2.369.361»
    const input = LI.frameTemplatesOf(JSON.stringify({ type: 'chat-input', text: LI.FRAME_TEXT, msgId: LI.FRAME_ID }), JSON.stringify({ type: 'interrupt' }));   // AgyAdapter's own Enter + Stop frames
    index7([row7(id, { backend: 'antigravity', socketPath: sock }, { input })], hub.address().port);
    const r = await cli7(['chat', id, '--wait', '1'], 'hello agy HCAGY\n');
    const reached = await until(() => readOr(stubLog).includes('hello agy HCAGY'), 8000);
    ok('THE FOURTH CHAT WRAPPER (round 4): agy-wrapper advertises receipts, and on a hub that answers `vibespace chat` SENDS to an Antigravity session — acknowledged by its receipt (round 3: read-only, «started before 2.369.361»)',
      !!caps && caps.receipts === true && r.code === 0 && !/read-only|not acknowledged/.test(r.out) && /"type":"_stdin_ack"[^\n]*"msg_id":"vs-cli-/.test(readOr(rcpt)), JSON.stringify({ caps, code: r.code, rcpt: readOr(rcpt) }) + ' | ' + r.out.slice(-500));
    ok('…the line reached agy without the receipt key; the replay buffer holds no ack', !!reached && !readOr(stubLog).includes('webui_receipt') && !/_stdin_ack|_stdin_nack/.test(readOr(buf)), readOr(stubLog).slice(-400));
    w.stdin.write('{"type":"chat-input","text":"torn HCTORN\n');   // a line torn in transit: it does not parse
    const nacked = await until(() => /"type":"_stdin_nack"[^\n]*"reason":"torn"/.test(readOr(rcpt)), 5000);
    const said2 = await until(() => /lost-input/.test(readOr(buf)), 5000);
    ok('…a TORN line: its _stdin_nack in the receipts file (one grammar with claude / codex / acp) and the «did not reach Antigravity» notice in the buffer — never a prompt', !!nacked && !!said2 && !readOr(stubLog).includes('HCTORN'), readOr(rcpt));
    w.kill('SIGTERM');
    await until(() => w.exitCode != null || w.signalCode != null, 5000);
    ok('…its receipts file goes with the wrapper; the buffer it leaves holds neither ack nor nack', !fs.existsSync(rcpt) && !/_stdin_ack|_stdin_nack/.test(readOr(buf)), readOr(rcpt));
  }
  { // §7d THE PERSIST WINDOW — the real chat-wrapper over the stand-in claude, no person's CLI following
    const id = 'sess-r4-pw', buf = path.join(BUFS7, id + '.buf'), meta = path.join(BUFS7, id + '.json');
    const w = spawn(process.execPath, [path.join(REPO, 'data/bin/chat-wrapper.js'), buf, meta, process.execPath, path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs')], { cwd: R4, env: { PATH: process.env.PATH, HOME: R4, VIBESPACE_SKIP_AGENT_HOOKS: '1', STAND_IN_LONG_MS: '2500' }, stdio: ['pipe', 'ignore', 'ignore'] });
    kids.push(w);
    await until(() => fs.existsSync(meta), 10000);
    await sleep(2500);   // whatever the boot wrote is persisted (its 2 s cadence)
    const size = () => { try { return fs.statSync(buf).size; } catch { return 0; } };
    const s0 = size(), t0 = Date.now();
    w.stdin.write('{"type":"user","message":{"role":"user","content":[{"type":"text","text":"torn HCPW\n');   // torn — and no person's CLI follows
    await until(() => size() > s0, 6000, 20);
    const tornMs = Date.now() - t0;
    ok('THE 250 ms WINDOW OPENS ONLY ON A RECEIPT ASKED FOR (round 4): a torn line with no CLI following is persisted at the wrapper\'s 2 s cadence (round 3: 250 ms for 2 min — a sync whole-buffer rewrite 8× as often, for nobody)', tornMs >= 1500, `${tornMs} ms`);
    const t1 = Date.now();
    w.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'followed HCPW' }] }, webui_msg_id: 'vs-cli-pw', webui_receipt: true }) + '\n');
    await until(() => readOr(buf).includes('reply: followed HCPW'), 6000, 20);
    const followedMs = Date.now() - t1;
    ok('…a frame that ASKS for a receipt (a person\'s CLI follows) opens it: its reply is in the buffer well inside the 2 s cadence', followedMs < 1500, `${followedMs} ms`);
    w.kill('SIGTERM');
    await until(() => w.exitCode != null || w.signalCode != null, 5000);
  }
  console.log('§8 round 5 — one clock, the gap rule on every record, a placeholder uuid is never a record\'s id');
  { // §8a ONE CLOCK — the buffer does not answer (a FIFO: stat answers, open waits — a file on a mount that stopped)
    const id = 'sess-r5-stall', buf = path.join(BUFS7, id + '.buf'), sock = path.join(R4, 's5.sock');
    await master(sock); const hub = await fakeHub(false);
    index7([row7(id, { socketPath: sock })], hub.address().port);
    execFileSync('mkfifo', [buf]);
    const t0 = Date.now(); let first = null, o = '';
    const ch = spawn(process.execPath, [CLI, 'chat', id, '--wait', '0'], { env: { ...CLI_ENV, HOME: H7 }, stdio: ['pipe', 'pipe', 'pipe'] });
    kids.push(ch);
    ch.stdout.on('data', (d) => { if (first == null) first = Date.now() - t0; o += d; }); ch.stderr.on('data', (d) => { o += d; });
    ch.stdin.end();
    await new Promise((r) => { const t = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } r(); }, 15000); ch.on('exit', () => { clearTimeout(t); r(); }); });
    fs.rmSync(buf, { force: true });
    ok('ONE CLOCK (round 5): chat on a session whose buffer does not answer (a FIFO — a file on a mount that stopped) says so inside ONE 2 s clock — its first line ≤ 2.3 s, «no answer in 2 s» (round 4: the history read waited out the follower\'s own 2 s first, ~4 s)',
      first != null && first <= 2300 && /no answer in 2 s/.test(o), `${first} ms | ${o.slice(-400)}`);
  }
  { // §8b THE GAP RULE ON EVERY RECORD — the history from the TRANSCRIPT (claude writes it at once); the wrapper persists the
    // same reply 1 s later (its cadence while no receipt is asked), after the history is printed
    const id = 'sess-r5-gap', buf = path.join(BUFS7, id + '.buf'), tr = path.join(R4, 'r5-transcript.jsonl'), sock = path.join(R4, 'g5.sock');
    await master(sock); const hub = await fakeHub(false);
    index7([row7(id, { socketPath: sock }, { transcript: tr })], hub.address().port);
    fs.writeFileSync(tr, [said('HISTORY-0 HCR5', { uuid: 'u5-0' }), said('REPLY-R1 HCR5', { uuid: 'u5-1' })].join('\n') + '\n');
    fs.writeFileSync(buf, said('HISTORY-0 HCR5', { uuid: 'u5-0' }) + '\n');
    const run = cli7(['chat', id, '--wait', '3']);
    await sleep(1000); fs.appendFileSync(buf, said('REPLY-R1 HCR5', { uuid: 'u5-1' }) + '\n');
    await sleep(1000); fs.appendFileSync(buf, said('REPLY-R2 HCR5', { uuid: 'u5-2' }) + '\n' + said('REPLY-R1 HCR5', { uuid: 'u5-3' }) + '\n');   // a newer reply, then the same words as a NEW record
    const r = await run;
    ok('THE GAP RULE ON EVERY RECORD (round 5): a reply the history already showed (the transcript) that the wrapper persists AFTER the history is printed is not shown again — until the follower is past it: a newer reply once, the same words written as a new record once more (round 4: the first printed twice)',
      count(r.out, 'HISTORY-0 HCR5') === 1 && count(r.out, 'REPLY-R2 HCR5') === 1 && count(r.out, 'REPLY-R1 HCR5') === 2, r.out.slice(-700));
  }
  { // §8c THE GAP RULE, its edges — data/bin/vibespace gapFilter, the rule cmdChat applies to every record the follower reports
    const V = require(CLI);
    const P = 'aaaaaaaa-bbbb-cccc-dddd-000000000001';
    const A = said('A', { uuid: 'b-1' }), B = said('B', { uuid: 'b-2' }), Cc = rec({ type: 'queue_changed', items: [] }), D = said('D', { uuid: 'b-4' });
    const fb = V.gapFilter({ kind: 'buffer', seen: V.seenOf([A, B, Cc].join('\n') + '\n') });
    const seqB = [[B], [Cc], [D], [Cc]].map(([l]) => fb(JSON.parse(l), { raw: l }));
    const T1 = said('T1', { uuid: 't-1' }), T1buf = said('T1', { uuid: 't-1', parent_tool_use_id: null }), T2 = rec({ type: 'user', uuid: 't-2', message: { role: 'user', content: 'hi' } });
    const ft = V.gapFilter({ kind: 'transcript', seen: V.seenOf([T1, T2].join('\n') + '\n') });
    const seqT = [rec({ type: 'stream_event', uuid: 's-1', event: {} }), T1buf, rec({ type: 'result', uuid: 'r-1', subtype: 'success' }), said('T1', { uuid: P }), said('T3', { uuid: 't-3' }), T1buf].map((l) => ft(JSON.parse(l), { raw: l }));
    ok('THE GAP RULE\'s edges (round 5): a buffer history — the lines it held are not shown, the first it did not hold is past it, after which a line written again is shown; a transcript history — a message it held is not shown (by uuid), the stream\'s and the wrapper\'s records (no transcript holds them) never say the follower is past it, a placeholder uuid never matches, the first newer message does',
      seqB.join() === 'false,false,true,true' && seqT.join() === 'true,false,true,true,true,true' && V.realUuid(P) === null && V.realUuid('t-1') === 't-1' && !V.seenOf(said('X', { uuid: P })).has('uuid|' + P),
      JSON.stringify({ seqB, seqT }));
  }
  { // §8d A PLACEHOLDER UUID IS NEVER A RECORD'S ID — across reads as within one
    const id = 'sess-r5-ph', buf = path.join(BUFS7, id + '.buf'), sock = path.join(R4, 'p5.sock');
    await master(sock); const hub = await fakeHub(false);
    index7([row7(id, { socketPath: sock })], hub.address().port);
    const P = 'aaaaaaaa-bbbb-cccc-dddd-000000000001';
    const tool = (n) => rec({ type: 'user', uuid: 'tr5-' + n, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't' + n, content: 'x'.repeat(200) }] } });
    fs.writeFileSync(buf, [said('FIRST-REPLY HCPH', { uuid: P }), tool(1)].join('\n') + '\n');
    const run = cli7(['chat', id, '--wait', '2']);
    await sleep(1200);
    fs.writeFileSync(buf, [tool(1), tool(2), said('SECOND-REPLY HCPH', { uuid: P })].join('\n') + '\n');   // the head cut takes the first reply in the rewrite that appends the next — the same placeholder
    const r = await run;
    ok('A PLACEHOLDER UUID IS NEVER A RECORD\'S ID (round 5): a NEW reply carrying the placeholder a cut one carried is shown as new, never «(updated)» (round 4\'s guard spanned one read)',
      count(r.out, 'FIRST-REPLY HCPH') === 1 && count(r.out, 'SECOND-REPLY HCPH') === 1 && !/\(updated\)/.test(r.out), r.out.slice(-500));
  }
  console.log('§9 round 6 — one deadline, the history never before the baseline; each history source its own answer; the horizon');
  // a buffer on a slow mount that still answers: a FIFO this suite feeds — the follower's first read answered at 1.0 s, its
  // second at 1.4 s, the reply landing in the transcript the instant before that second read (the r5 verdict's case B)
  const slowBaseline = async (cli, id) => {
    const buf = path.join(BUFS7, id + '.buf'), tr = path.join(R4, id + '.jsonl'), sock = path.join(R4, id + '.sock');
    await master(sock); const hub = await fakeHub(false);
    index7([row7(id, { socketPath: sock }, { transcript: tr })], hub.address().port);
    const H0 = said('HISTORY-0 HCR6', { uuid: 'u6-0' }), R1 = said('REPLY-R1 HCR6', { uuid: 'u6-1' });
    fs.writeFileSync(tr, H0 + '\n'); execFileSync('mkfifo', [buf]);
    const t0 = Date.now(); let answers = 0;
    const feeder = setInterval(() => {   // answers a reader waiting on the FIFO (an O_NONBLOCK writer opens only then)
      const at = Date.now() - t0;
      if ((answers === 0 && at < 1000) || (answers === 1 && at < 1400)) return;
      let fd; try { fd = fs.openSync(buf, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); } catch { return; }
      if (answers === 1) fs.appendFileSync(tr, R1 + '\n');
      try { fs.writeSync(fd, H0 + '\n' + (answers ? R1 + '\n' : '')); } catch { }
      fs.closeSync(fd); answers++;
    }, 10);
    const r = await new Promise((resolve) => {
      const ch = spawn(process.execPath, [cli, 'chat', id, '--wait', '3'], { env: { ...CLI_ENV, HOME: H7 }, stdio: ['pipe', 'pipe', 'pipe'] });
      kids.push(ch);
      let out = ''; ch.stdout.on('data', (d) => { out += d; }); ch.stderr.on('data', (d) => { out += d; });
      ch.stdin.end();
      const tk = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 30000);
      ch.on('exit', () => { clearTimeout(tk); resolve(out); });
    });
    clearInterval(feeder); fs.rmSync(buf, { force: true });
    return { n: count(r, 'REPLY-R1 HCR6'), out: r };
  };
  // a MUTANT of this CLI beside it (its PURE half is there): each [from, to] once, run by `run(file, id)`, removed after
  const CLI_SRC = fs.readFileSync(CLI, 'utf8');
  const HOLDS_SRC = "const holds = (h) => !base || (!base.blind && (!base.last || h.seen.has('uuid|' + base.last)));";
  const AGAIN_SRC = 'const again = mute ? null : await readTail(T, CHUNK, left());';
  const mutantRun = async (name, pairs, run) => {
    let s = CLI_SRC;
    for (const [A, B] of pairs) { if (s.split(A).length !== 2) return { n: -1, r1: -1, out: 'the anchor moved: ' + A }; s = s.split(A).join(B); }
    const MUT = path.join(path.dirname(CLI), 'vibespace-mutant-' + name);
    fs.writeFileSync(MUT, s);
    try { return await run(MUT, 'sess-mut-' + name); } finally { fs.rmSync(MUT, { force: true }); }
  };
  { // §9a THE HISTORY NEVER BEFORE THE BASELINE — the mutant that prints it at half the clock (round 5's race) and the one
    // that prints the early transcript read at the baseline as the answer, WITHOUT the baseline's check (round 7's
    // «read early + print after» alone — round 8 reads it again and keeps the check: either one alone shows case B's reply)
    const r = await slowBaseline(CLI, 'sess-r6-slow');
    const half = await mutantRun('half', [['tail.ready.then((base) => historyOf(', 'Promise.race([tail.ready, new Promise((r) => setTimeout(() => r({ last: null }), PROBE_MS / 2))]).then((base) => historyOf(']], (m, id) => slowBaseline(m, id));
    const nocheck = await mutantRun('r7literal', [[AGAIN_SRC, 'const again = null;'], [HOLDS_SRC, 'const holds = () => true;']], (m, id) => slowBaseline(m, id));
    ok('ONE DEADLINE, THE HISTORY NEVER BEFORE THE BASELINE (rounds 6–8): a buffer on a slow mount that still answers (its follower\'s reads answered at 1.0 s and 1.4 s) — the reply that lands in the transcript between is shown ONCE (round 5 read the history at half the clock: 0 times); the same CLI printing at half the clock shows it 0 times, and printing the early transcript read as the answer and unchecked (round 7\'s «read early + print after» alone) 0 times',
      r.n === 1 && half.n === 0 && nocheck.n === 0, `this CLI ${r.n}× · half ${half.n}× · nocheck ${nocheck.n}× | ${r.out.slice(-300)} | ${half.out.slice(-160)} | ${nocheck.out.slice(-160)}`);
  }
  { // §9b EACH HISTORY SOURCE ITS OWN ANSWER — the transcript does not answer (a FIFO), the buffer answers in 0.4 s (a slow
    // but healthy mount: a preload in the CLI process holds its tail read): the buffer's history is shown inside the deadline
    const id = 'sess-r6-src', buf = path.join(BUFS7, id + '.buf'), tr = path.join(R4, id + '.jsonl'), sock = path.join(R4, id + '.sock');
    await master(sock); const hub = await fakeHub(false);
    index7([row7(id, { socketPath: sock }, { transcript: tr })], hub.address().port);
    fs.writeFileSync(buf, said('BUFFER-HISTORY HCR6', { uuid: 'u6-9' }) + '\n'); execFileSync('mkfifo', [tr]);
    const PRE = path.join(R4, 'slow-tail.cjs');
    fs.writeFileSync(PRE, `const cp = require('child_process'), o = cp.spawn;\ncp.spawn = function (cmd, args, opts) { if (Array.isArray(args) && args[0] === '-e' && !/_follow/.test(String(args[1])) && String(args[2] || '').includes(${JSON.stringify(buf)})) args = ['-e', 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);' + args[1], ...args.slice(2)]; return o.call(this, cmd, args, opts); };\n`);
    const t0 = Date.now(); let first = null;
    const out = await new Promise((resolve) => {
      const ch = spawn(process.execPath, ['-r', PRE, CLI, 'chat', id, '--wait', '0'], { env: { ...CLI_ENV, HOME: H7 }, stdio: ['pipe', 'pipe', 'pipe'] });
      kids.push(ch);
      let o = ''; ch.stdout.on('data', (d) => { if (first == null) first = Date.now() - t0; o += d; }); ch.stderr.on('data', (d) => { o += d; });
      ch.stdin.end();
      const tk = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 15000);
      ch.on('exit', () => { clearTimeout(tk); resolve(o); });
    });
    fs.rmSync(tr, { force: true });
    ok('EACH HISTORY SOURCE ITS OWN ANSWER (round 6): a transcript that does not answer no longer eats a slow-but-healthy buffer\'s time — the buffer\'s history (its read 0.4 s) is shown, first line ≤ 2.3 s (round 5 read them in turn: the buffer got a 250 ms floor and was said as «no answer in 2 s»)',
      /from its buffer/.test(out) && count(out, 'BUFFER-HISTORY HCR6') === 1 && first != null && first <= 2300, `${first} ms | ${out.slice(0, 400)}`);
  }
  { // §9c THE HORIZON — data/bin/vibespace gapFilter: what can say the follower is past the history's last
    const V = require(CLI);
    const T = said('T main', { uuid: 'h-1' }), U = rec({ type: 'assistant', uuid: 'h-2', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } });
    const S = said('S subagent', { uuid: 'h-9', parent_tool_use_id: 'toolu_x' }), Sc = said('S sidechain', { uuid: 'h-8', isSidechain: true });
    const ft = V.gapFilter({ kind: 'transcript', seen: V.seenOf([T, U].join('\n') + '\n') });
    const seqS = [T, S, Sc, U].map((l) => ft(JSON.parse(l), { raw: l }));
    const A = said('A', { uuid: 'b-1' }), Cc = said('C', { uuid: 'b-3' }), Ed = copyLine(1);
    const fb = V.gapFilter({ kind: 'buffer', seen: V.seenOf([A, copyLine(0), Cc].join('\n') + '\n') });
    const seqU = [[Ed, { updated: true }], [Cc, {}], [said('D', { uuid: 'b-4' }), {}], [Cc, {}]].map(([l, h]) => fb(JSON.parse(l), { raw: l, ...h }));
    ok('THE HORIZON (round 6): a subagent\'s record (parent_tool_use_id / isSidechain — never in the main transcript) and an edit in place (an OLDER record) never say the follower is past the history: the held record after them is not shown again; a newer one is',
      seqS.join() === 'false,true,true,false' && seqU.join() === 'true,false,true,true', JSON.stringify({ seqS, seqU }));
  }
  console.log('§10 round 7 — the transcript read early and held, checked against the baseline');
  // a preload in the CLI process holds chosen children: the transcript's tail read (TR ms), the buffer's tail read (BUF ms)
  // and the buffer's FOLLOWER (FOL ms) — which, told to, appends REPLY-R1 to both files the instant before its first read
  // (the reply lands after the early transcript read and inside the follower's baseline: case B, made deterministic)
  const held7 = async (id, { TR = 0, BUF = 0, FOL = 0, plant = false, stalled = false, wait = 0 }) => {
    const buf = path.join(BUFS7, id + '.buf'), tr = path.join(R4, id + '.jsonl'), sock = path.join(R4, id + '.sock');
    await master(sock); const hub = await fakeHub(false);
    index7([row7(id, { socketPath: sock }, { transcript: tr })], hub.address().port);
    const H0 = said('HISTORY-0 HCR7', { uuid: 'u7-0' }), R1 = said('REPLY-R1 HCR7', { uuid: 'u7-1' });
    fs.writeFileSync(tr, H0 + '\n');
    if (stalled) execFileSync('mkfifo', [buf]); else fs.writeFileSync(buf, H0 + '\n');
    const W = (ms) => (ms ? `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${ms});` : '');
    const P = plant ? `require('fs').appendFileSync(${JSON.stringify(tr)}, ${JSON.stringify(R1 + '\n')}); require('fs').appendFileSync(${JSON.stringify(buf)}, ${JSON.stringify(R1 + '\n')});` : '';
    const PRE = path.join(R4, id + '-hold.cjs');
    fs.writeFileSync(PRE, `const cp = require('child_process'), o = cp.spawn, TR = ${JSON.stringify(tr)}, BUF = ${JSON.stringify(buf)};\ncp.spawn = function (cmd, args, opts) {\n  if (Array.isArray(args) && args[0] === '-e') {\n    const a = String(args[2] || ''), fol = /_follow/.test(String(args[1]));\n    const pre = fol && a.includes(BUF) ? ${JSON.stringify(W(FOL) + P)} : !fol && a.includes(TR) ? ${JSON.stringify(W(TR))} : !fol && a.includes(BUF) ? ${JSON.stringify(W(BUF))} : '';\n    if (pre) args = ['-e', pre + args[1], ...args.slice(2)];\n  }\n  return o.call(this, cmd, args, opts);\n};\n`);
    const t0 = Date.now(); let first = null;
    const out = await new Promise((resolve) => {
      const ch = spawn(process.execPath, ['-r', PRE, CLI, 'chat', id, '--wait', String(wait)], { env: { ...CLI_ENV, HOME: H7 }, stdio: ['pipe', 'pipe', 'pipe'] });
      kids.push(ch);
      let o = ''; ch.stdout.on('data', (d) => { if (first == null) first = Date.now() - t0; o += d; }); ch.stderr.on('data', (d) => { o += d; });
      ch.stdin.end();
      const tk = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 20000);
      ch.on('exit', () => { clearTimeout(tk); resolve(o); });
    });
    fs.rmSync(buf, { force: true });
    return { first, out, src: (/from its (transcript|buffer)/.exec(out) || [])[1] || 'none', r1: count(out, 'REPLY-R1 HCR7') };
  };
  { // §10a THE HELD READ — the buffer does not answer (a FIFO nobody writes: no baseline), the transcript answers in 300 /
    // 800 / 1500 ms (the hub down because data/ sits on a stalled mount, the transcript on a slow but healthy disk)
    const runs = [];
    for (const ms of [300, 800, 1500]) runs.push({ ms, ...(await held7('sess-r7-held-' + ms, { TR: ms, stalled: true })) });
    ok('THE TRANSCRIPT READ EARLY AND HELD (rounds 7–8): a buffer that does not answer never starves a slow-but-healthy transcript — at 300 / 800 / 1500 ms its history is shown (round 6 began that read at the deadline: 250 ms, no history); the read again at the deadline gets its 250 ms floor and is not in in time, so the held read is shown and SAID as how old it is — first line ≤ 2.6 s',
      runs.every((r) => r.src === 'transcript' && count(r.out, 'HISTORY-0 HCR7') === 1 && r.first != null && r.first <= 2600 && /did not answer again in time — the history above is as it read [\d.]+ s ago/.test(r.out)), runs.map((r) => `${r.ms}: ${r.src} ${r.first} ms`).join(' · ') + ' | ' + runs.map((r) => r.out.slice(0, 220)).join(' | '));
  }
  { // §10b THE BASELINE'S CHECK — the follower's baseline (~1.6 s) holds a reply the early transcript read (0.9 s) does not;
    // the transcript read again gets the ~0.4 s left (< its 0.9 s): the buffer, read at the baseline beside it, holds it. With
    // the buffer's read held 0.9 s too, neither answers again in time: the held read is shown and SAYS what it lacks
    const g = await held7('sess-r7-gap', { TR: 900, FOL: 1300, plant: true });
    const b = await held7('sess-r7-behind', { TR: 900, BUF: 900, FOL: 1300, plant: true });
    ok('THE BASELINE\'S CHECK (rounds 7–8): a reply that landed between the early transcript read and the baseline is shown ONCE — the transcript read again had ~0.4 s for its 0.9 s, the held read lacks the baseline\'s last message: the UNION with the buffer as the follower read it at its baseline (round 8 — no buffer read of its own: one held 0.9 s too changes nothing; round 7 then said the reply was not shown)',
      [g, b].every((x) => x.src === 'transcript' && x.r1 === 1 && /only the buffer holds yet/.test(x.out) && /did not answer again in time/.test(x.out)) && !/not shown here/.test(g.out + b.out), `gap: ${g.src} R1 ${g.r1}× ${g.first} ms · behind: ${b.src} R1 ${b.r1}× | ${g.out.slice(0, 300)} | ${b.out.slice(0, 420)}`);
  }
  { // §10c A BASELINE LATER THAN THE DEADLINE — the follower held 2.3 s (its baseline ~2.6 s, holding a reply that landed
    // after the early read): the history is printed at the deadline, and the late baseline's message it lacks is SAID
    const l = await held7('sess-r7-late', { FOL: 2300, plant: true, wait: 2 });
    ok('A BASELINE LATER THAN THE DEADLINE (rounds 7–8): the history is printed inside the deadline (≤ 2.3 s), and what the late baseline holds beyond it — which no follower will report — is SHOWN, once (round 7 said it was not shown; round 6: neither shown nor said)',
      l.src === 'transcript' && l.first != null && l.first <= 2300 && l.r1 === 1 && /answered after the 2 s — what it holds beyond the history above/.test(l.out) && !/not shown here/.test(l.out), `${l.src} ${l.first} ms R1 ${l.r1}× | ${l.out.slice(0, 520)}`);
  }
  console.log('§11 round 8 — the early read a head start, the union, a blind baseline, a late baseline shown');
  // held7 grown: the follower plants into one file (`buf` / `tr`), the transcript gets `later` LAG ms after that (a transcript
  // behind its buffer), this process appends `trAt` to the transcript at a time, the receipts follower held RFOL ms, and a
  // piped line the stand-in master `answer`s (an ack into the receipts file + a reply into the buffer, as a wrapper does)
  const held8 = async (cli, id, { FOL = 0, RFOL = 0, stalled = false, buf: pb = [], tr: pt = [], later = [], LAG = 0, trAt = null, line = null, answer = null, wait = 0, trInit, bufInit, n = null }) => {
    const bf = path.join(BUFS7, id + '.buf'), tr = path.join(R4, id + '.jsonl'), sock = path.join(R4, id + '.sock'), rc = LI.receiptsFileOf(bf);
    await master(sock, (l) => { if (answer) answer(l, { bf, rc }); }); const hub = await fakeHub(false);
    const input = { line: { type: 'user', message: { role: 'user', content: [{ type: 'text', text: LI.FRAME_TEXT }] } }, stop: { type: 'control_request', request_id: LI.FRAME_ID, request: { subtype: 'interrupt' } } };
    index7([row7(id, { socketPath: sock }, { transcript: tr, input })], answer ? null : hub.address().port);
    const H0 = said('HISTORY-0 HCR8', { uuid: 'u8-0' });
    if (trInit === 'fifo') execFileSync('mkfifo', [tr]); else if (trInit !== null) fs.writeFileSync(tr, (trInit || [H0]).map((x) => x + '\n').join(''));   // null = no transcript at all (round 9)
    if (stalled) execFileSync('mkfifo', [bf]); else fs.writeFileSync(bf, (bufInit || [H0]).map((x) => x + '\n').join(''));
    if (answer) { fs.writeFileSync(bf.replace(/\.buf$/, '.json'), JSON.stringify({ caps: { receipts: true } })); fs.writeFileSync(rc, ''); }
    const W = (ms) => (ms ? `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${ms});` : '');
    const L = (a) => JSON.stringify(a.map((x) => x + '\n').join(''));
    const P = `{const f=require('fs');` + (pt.length ? `f.appendFileSync(${JSON.stringify(tr)}, ${L(pt)});` : '') + (pb.length ? `f.appendFileSync(${JSON.stringify(bf)}, ${L(pb)});` : '')
      + (later.length ? `setTimeout(()=>f.appendFileSync(${JSON.stringify(tr)}, ${L(later)}), ${LAG});` : '') + `}`;
    const PRE = path.join(R4, id + '-hold8.cjs');
    fs.writeFileSync(PRE, `const cp = require('child_process'), o = cp.spawn, BUF = ${JSON.stringify(bf)}, RC = ${JSON.stringify(rc)};\ncp.spawn = function (cmd, args, opts) {\n  if (Array.isArray(args) && args[0] === '-e' && /_follow/.test(String(args[1]))) {\n    const a = String(args[2] || ''), pre = a.includes(BUF) ? ${JSON.stringify(W(FOL) + P)} : a.includes(RC) ? ${JSON.stringify(W(RFOL))} : '';\n    if (pre) args = ['-e', pre + args[1], ...args.slice(2)];\n  }\n  return o.call(this, cmd, args, opts);\n};\n`);
    const t0 = Date.now(); let first = null;
    const tk2 = trAt ? setTimeout(() => fs.appendFileSync(tr, trAt.recs.map((x) => x + '\n').join('')), trAt.at) : null;
    const out = await new Promise((resolve) => {
      const ch = spawn(process.execPath, ['-r', PRE, cli, 'chat', id, '--wait', String(wait), ...(n ? ['-n', String(n)] : [])], { env: { ...CLI_ENV, HOME: H7 }, stdio: ['pipe', 'pipe', 'pipe'] });
      kids.push(ch);
      let o = ''; ch.stdout.setEncoding('utf8'); ch.stderr.setEncoding('utf8'); ch.stdout.on('data', (d) => { if (first == null) first = Date.now() - t0; o += d; }); ch.stderr.on('data', (d) => { o += d; });
      ch.stdin.end(line || '');
      const tk = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 20000);
      ch.on('exit', (code) => { clearTimeout(tk); resolve(o + `\n[exit ${code}]`); });
    });
    if (tk2) clearTimeout(tk2);
    fs.rmSync(bf, { force: true });
    return { first, out, src: (/from its (transcript|buffer)/.exec(out) || [])[1] || 'none', r1: count(out, 'REPLY-R1 HCR8'), code: Number((/\[exit (\d+)\]$/.exec(out) || [])[1]) };
  };
  const R8 = said('REPLY-R1 HCR8', { uuid: 'u8-1' });
  { // §11a THE EARLY READ IS A HEAD START — the buffer does not answer (no baseline), a reply lands in the transcript at 1.2 s:
    // the transcript read AGAIN at the deadline holds it (round 7 printed its t0 read: 0 times, nothing said)
    const shape = { stalled: true, trAt: { at: 1200, recs: [R8] } };
    const a = await held8(CLI, 'sess-r8-again', shape), m = await mutantRun('noreread', [[AGAIN_SRC, 'const again = null;']], (f, id) => held8(f, id, shape));
    ok('THE EARLY READ IS A HEAD START (round 8): with a buffer that does not answer, a reply landing in the transcript inside the 2 s is shown ONCE — the transcript is read again at the deadline (first line ≤ 2.6 s, nothing said stale); the mutant printing the held read as the answer shows it 0 times (round 7: 0, against rounds 4 and 6\'s 1)',
      a.src === 'transcript' && a.r1 === 1 && a.first != null && a.first <= 2600 && !/did not answer again in time/.test(a.out) && m.r1 === 0, `${a.src} R1 ${a.r1}× ${a.first} ms · mutant ${m.r1}× | ${a.out.slice(0, 400)}`);
  }
  { // §11b NO SOURCE IS DISCARDED — the reply lands in the buffer just before the follower's baseline, the transcript gets it
    // 1.5 s later (its write behind the stdout frame): the check fails on the read again too ⇒ the UNION — shown once, from the
    // buffer (round 7 returned the read again unchecked: 0 times, nothing said)
    const shape = { FOL: 300, buf: [R8], later: [R8], LAG: 1500 };
    const u = await held8(CLI, 'sess-r8-union', shape), m = await mutantRun('nocheck8', [[HOLDS_SRC, 'const holds = () => true;']], (f, id) => held8(f, id, shape));
    ok('NO SOURCE IS DISCARDED (round 8): a transcript behind its buffer — the history is the UNION of the transcript\'s read and the buffer as the follower read it at its baseline: the reply shown ONCE and said as the buffer\'s; the read again printed unchecked (a mutant) shows it 0 times',
      u.r1 === 1 && /from its transcript .* and its buffer .*\(1 newer record\(s\) only the buffer holds yet\)/.test(u.out) && m.r1 === 0, `R1 ${u.r1}× · mutant ${m.r1}× | ${u.out.slice(0, 420)}`);
  }
  { // §11c A BLIND BASELINE — the buffer's newest message carries claude's stdout PLACEHOLDER uuid (a CLI that writes it), its
    // transcript record (the real uuid, the same message.id) 1.5 s behind: never «held» by an OLDER message's uuid
    const P8 = rec({ type: 'assistant', uuid: 'aaaaaaaa-bbbb-cccc-dddd-000000000001', message: { id: 'msg_hcr8', role: 'assistant', content: [{ type: 'text', text: 'REPLY-R1 HCR8' }] } });
    const T8 = rec({ type: 'assistant', uuid: 'u8-1t', message: { id: 'msg_hcr8', role: 'assistant', content: [{ type: 'text', text: 'REPLY-R1 HCR8' }] } });
    const shape = { FOL: 300, buf: [P8], later: [T8], LAG: 1500 }, both = { FOL: 300, buf: [P8], tr: [T8] };
    const b = await held8(CLI, 'sess-r8-blind', shape), b2 = await held8(CLI, 'sess-r8-blind2', both);
    const m = await mutantRun('noblind', [["return { u: id.startsWith('uuid|') ? o.uuid : null };", "return id.startsWith('uuid|') ? { u: o.uuid } : null;"]], (f, id) => held8(f, id, shape));
    ok('A PLACEHOLDER NEVER SATISFIES THE CHECK (round 8): a newest message with no real uuid makes the baseline BLIND — the union shows the reply ONCE (transcript behind: from the buffer; both in time: the placeholder\'d copy and its record ONE by the message key); the mutant judging by the older message\'s uuid shows it 0 times',
      b.r1 === 1 && b2.r1 === 1 && m.r1 === 0, `behind ${b.r1}× · both ${b2.r1}× · mutant ${m.r1}× | ${b.out.slice(0, 300)} | ${b2.out.slice(0, 300)}`);
  }
  { // §11d A BASELINE LATER THAN THE DEADLINE, WITH A LINE SENT — both followers held 2.3 s; a piped line goes at the deadline
    // and the stand-in wrapper acks it into the receipts file and writes the reply into the buffer at once (both inside the
    // late baselines): the reply SHOWN once beyond the history, the line ACKNOWLEDGED (round 7: «not acknowledged», exit 1)
    const R2 = said('REPLY-R2 HCR8', { uuid: 'u8-2' });
    const answer = (l, { bf, rc }) => { let mid = null; try { mid = JSON.parse(l).msgId; } catch { } if (!mid) return; fs.appendFileSync(rc, rec({ type: '_stdin_ack', timestamp: Date.now(), msg_id: mid }) + '\n'); fs.appendFileSync(bf, R2 + '\n'); };
    const shape = { FOL: 2300, RFOL: 2300, line: 'a line sent at the deadline HCR8\n', answer, wait: 4 };
    const s = await held8(CLI, 'sess-r8-late', shape);
    const m1 = await mutantRun('nolate', [['const lateBase = (b) => {\n', 'const lateBase = (b) => { return;\n']], (f, id) => held8(f, id, shape));
    const m2 = await mutantRun('nolateacks', [['const lateAcks = (b) => {', 'const lateAcks = (b) => { return;']], (f, id) => held8(f, id, shape));
    const r2 = (x) => count(x.out, 'REPLY-R2 HCR8');
    ok('A LATE BASELINE IS SHOWN, A LATE RECEIPT HEARD (round 8 — the residual round 7 left: a send waits on a `ready` the deadline resolves): the reply in the late buffer baseline is shown ONCE beyond the history and the ack in the late receipts baseline names the line (exit 0); without the late baseline 0 replies, without the late acks «not acknowledged»',
      r2(s) === 1 && !/not acknowledged/.test(s.out) && s.code === 0 && r2(m1) === 0 && /not acknowledged/.test(m2.out), `R2 ${r2(s)}× exit ${s.code} · nolate ${r2(m1)}× · nolateacks acked=${!/not acknowledged/.test(m2.out)} | ${s.out.slice(-420)}`);
  }
  console.log('§12 round 9 — the buffer decoded across pipe chunks; what this CLI sent never printed again');
  const FOLLOW_DECODE = "ch.stdout.setEncoding('utf8');   // decoded ACROSS chunks";
  const fffd = (x) => count(x, '�');
  const cjk = (N, W) => Array.from({ length: N }, (_, i) => said(`M${i}-HCR9 ` + '中文消息内容测试'.repeat(Math.ceil(W / 8)).slice(0, W), { uuid: 'u9-' + i }));
  const exact = (o, recs) => recs.filter((x) => o.includes(JSON.parse(x).message.content[0].text)).length;
  { // §12a THE BUFFER THE ONLY SOURCE — no transcript (as for every codex / acp / agy chat), 100 CJK messages (~610 KB): the
    // follower's `ready` line carries it through a pipe, many chunk edges inside a character (round 8: U+FFFD — r4 / r7 0)
    const shape = { trInit: null, bufInit: cjk(100, 2000), n: 100 };
    const a = await held8(CLI, 'sess-r9-utf8', shape), m = await mutantRun('nodecode', [[FOLLOW_DECODE, '//']], (f, id) => held8(f, id, shape));
    ok('THE BUFFER\'S TEXT DECODED ACROSS PIPE CHUNKS (round 9): a CJK buffer as the history\'s only source is printed with NO U+FFFD and all 100 messages exact; the follower decoding each chunk on its own (a mutant — round 8) prints U+FFFD',
      a.src === 'buffer' && fffd(a.out) === 0 && exact(a.out, shape.bufInit) === 100 && fffd(m.out) >= 1, `${a.src} U+FFFD ${fffd(a.out)} exact ${exact(a.out, shape.bufInit)}/100 · mutant U+FFFD ${fffd(m.out)} exact ${exact(m.out, shape.bufInit)}/100 | ${a.out.slice(0, 200)}`);
  }
  { // §12b THE UNION'S WEAK KEY ON CJK — a blind baseline (the newest buffer record a frame the wrapper copied, no uuid), the
    // transcript holding the same prompt (70 000 CJK characters) with its uuid: matched by the person's words — shown once
    const text = 'PROMPT-HCR9 ' + '中文消息内容测试'.repeat(8750) + ' END-HCR9', H0 = said('HISTORY-0 HCR8', { uuid: 'u8-0' });
    const shape = { trInit: [H0, rec({ type: 'user', uuid: 'p9-1', message: { role: 'user', content: text } })], bufInit: [H0, rec({ type: 'user', _fromWebui: true, msgId: 'm9-1', message: { role: 'user', content: [{ type: 'text', text }] } })] };
    const u = await held8(CLI, 'sess-r9-weak', shape), m = await mutantRun('nodecodeweak', [[FOLLOW_DECODE, '//']], (f, id) => held8(f, id, shape));
    ok('THE UNION\'S PERSON\'S-WORDS KEY ON CJK (round 9): a blind baseline whose newest record is a copied frame of a 70 000-character CJK prompt — the transcript\'s record and the copy are ONE (shown once, from the transcript, no U+FFFD)',
      count(u.out, 'PROMPT-HCR9') === 1 && fffd(u.out) === 0 && u.src === 'transcript' && !/only the buffer holds yet/.test(u.out), `PROMPT ${count(u.out, 'PROMPT-HCR9')}× U+FFFD ${fffd(u.out)} ${u.src} · mutant PROMPT ${count(m.out, 'PROMPT-HCR9')}× U+FFFD ${fffd(m.out)} | ${u.out.slice(0, 300)}`);
  }
  { // §12c WHAT THIS CLI SENT IS NEVER PRINTED AGAIN — no history at the deadline (the transcript a FIFO nobody writes), both
    // followers held 2.3 s, a line piped at the deadline: the stand-in wrapper acks it and records it into its buffer as the
    // person's message (acp-wrapper's record('user'), chat-wrapper's webui_copy: the frame's msgId — or none) + the reply,
    // all inside the late baseline, whose own last messages are printed: the sent line ONCE (round 8: twice); the person's
    // OLDER line with the same words is the history's — kept; a copy with NO id is never ours (round 11 — round 9 / 10
    // matched it by the person's words): shown, the echo + that record
    const R2 = said('REPLY-R2 HCR8', { uuid: 'u8-2' }), LINE = '一行中文 A SENT LINE HCR9';
    const answer = (noid) => (l, { bf, rc }) => { let o = null; try { o = JSON.parse(l); } catch { } if (!o || !o.msgId) return; fs.appendFileSync(rc, rec({ type: '_stdin_ack', timestamp: Date.now(), msg_id: o.msgId }) + '\n'); fs.appendFileSync(bf, rec({ type: 'user', _fromWebui: true, ...(noid ? {} : { msgId: o.msgId }), message: { role: 'user', content: [{ type: 'text', text: o.message.content[0].text }] } }) + '\n' + R2 + '\n'); };
    const late = (o) => ({ trInit: 'fifo', FOL: 2300, RFOL: 2300, line: LINE + '\n', wait: 4, ...o });
    const byId = late({ answer: answer(false) }), noId = late({ answer: answer(true) });
    const older = late({ answer: answer(false), bufInit: [said('HISTORY-0 HCR8', { uuid: 'u8-0' }), rec({ type: 'user', uuid: 'p9-old', message: { role: 'user', content: LINE } }), said('OLDER-REPLY HCR9', { uuid: 'u9-or' })] });
    const i = await held8(CLI, 'sess-r9-echo', byId), w = await held8(CLI, 'sess-r9-echow', noId), o = await held8(CLI, 'sess-r9-echoo', older);
    const m = await mutantRun('rawlate', [['LI.historyOf(notSent(b.text), { max: opts.n })', 'LI.historyOf(b.text, { max: opts.n })']], (f, id) => held8(f, id, byId));
    const L = (x) => count(x.out, LINE), R = (x) => count(x.out, 'REPLY-R2 HCR8'), lateW = (x) => /answered after the 2 s — its last \d+ message/.test(x.out);
    const keptOlder = (x) => { const k = x.out.indexOf('answered after the 2 s'); return k >= 0 && count(x.out.slice(k), LINE) === 1 && x.out.indexOf(LINE, k) < x.out.indexOf('OLDER-REPLY HCR9'); };
    ok('WHAT THIS CLI SENT IS NEVER PRINTED AGAIN (round 9): a line piped into a late baseline with no history — shown ONCE (its echo) by the frame\'s id, the reply once, acknowledged; a copy with no id is never ours (round 11: shown — the echo + that record); the person\'s OLDER line with the same words is the history\'s and is shown; the late print as round 8 had it (a mutant) shows the line twice',
      L(i) === 1 && R(i) === 1 && lateW(i) && i.code === 0 && L(w) === 2 && R(w) === 1 && L(o) === 2 && keptOlder(o) && L(m) === 2,
      `id ${L(i)}×/${R(i)}× exit ${i.code} · no id ${L(w)}×/${R(w)}× · older ${L(o)}× kept ${keptOlder(o)} · mutant ${L(m)}× | ${i.out.slice(-360)}`);
    // §12c round 10 — AN ID DECIDES: this CLI's own copy NOT in the late baseline (claude's idle frame is never copied:
    // the stand-in acks the line and writes only the reply), the baseline holding the same words from someone else — another
    // sender's line (its own msgId), a peer's message (acp `peer`), a codex-shaped line (`payload.webui_msg_id`), the
    // person's own older line (a uuid): each shown, before its reply; our copy (our id) with another sender's line right after
    // it: ours dropped, the other's shown in ITS place (after our reply); two records with NO id at all for one line sent
    // (another's and ours — round 10's «doubt»): neither is ours, every one shown, no count (round 9: the first four once
    // each, the fifth ours in the other's place, the sixth once)
    const RO = said('OTHER-REPLY HCR10', { uuid: 'u10-or' }), H = said('HISTORY-0 HCR8', { uuid: 'u8-0' });
    const ackOnly = (l, { bf, rc }) => { let x = null; try { x = JSON.parse(l); } catch { } if (!x || !x.msgId) return; fs.appendFileSync(rc, rec({ type: '_stdin_ack', timestamp: Date.now(), msg_id: x.msgId }) + '\n'); fs.appendFileSync(bf, R2 + '\n'); };
    const copyThen = (after, noid = false) => (l, x) => { answer(noid)(l, x); fs.appendFileSync(x.bf, after.map((y) => y + '\n').join('')); };
    const typedLine = (extra) => rec({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: LINE }] }, ...extra });
    const other = typedLine({ _fromWebui: true, msgId: 'web-o10' });
    const legs10 = {
      other: late({ answer: ackOnly, bufInit: [H, other, RO], wait: 2 }),
      peer: late({ answer: ackOnly, bufInit: [H, rec({ ts: Date.now(), type: 'acp', kind: 'user', msgId: '', content: [{ type: 'text', text: LINE }], peer: { name: 'agent-b', body: null, kind: 'agent' } }), RO], wait: 2 }),
      codex: late({ answer: ackOnly, bufInit: [H, rec({ timestamp: new Date().toISOString(), type: 'response_item', payload: { type: 'message', role: 'user', webui_msg_id: 'web-c10', content: [{ type: 'input_text', text: LINE }] } }), RO], wait: 2 }),
      older: late({ answer: ackOnly, bufInit: [H, rec({ type: 'user', uuid: 'p10-old', message: { role: 'user', content: LINE } }), RO], wait: 2 }),
      newer: late({ answer: copyThen([other, RO]), wait: 2 }),
      doubt: late({ answer: copyThen([], true), bufInit: [H, typedLine({ _fromWebui: true }), RO], wait: 2 }),
    };
    const g = {}; for (const [k, sh] of Object.entries(legs10)) g[k] = await held8(CLI, 'sess-r10-' + k, sh);
    const ID_RULE = 'return !sent.has(idOfCopy(rec));';
    const mw = await mutantRun('anyid', [[ID_RULE, 'return !idOfCopy(rec);']], (f, id) => held8(f, id, legs10.other));
    const tailOf = (x) => { const k = x.out.indexOf('answered after the 2 s'); return k < 0 ? '' : x.out.slice(k); };
    const inPlace = (x) => { const t = tailOf(x); return count(t, LINE) === 1 && t.indexOf(LINE) < t.indexOf('OTHER-REPLY HCR10'); };
    const order = (x) => { const t = tailOf(x), r = t.indexOf('REPLY-R2 HCR8'), l = t.indexOf(LINE); return count(t, LINE) === 1 && r >= 0 && r < l && l < t.indexOf('OTHER-REPLY HCR10'); };
    const shown4 = ['other', 'peer', 'codex', 'older'];
    ok('AN ID DECIDES (round 10): this CLI\'s copy not in the late baseline — the same words from another sender (its own id), a peer, a codex-shaped line (its payload id) and the person\'s own older line (a uuid) are each SHOWN (the echo + that line, before its reply); another sender\'s line right after our copy is shown in ITS place (after our reply); two records with no id at all for one line sent are never ours — every one shown; every line acknowledged; a record with ANOTHER\'s id taken as ours (a mutant) drops the other sender\'s line',
      shown4.every((k) => L(g[k]) === 2 && inPlace(g[k])) && L(g.newer) === 2 && order(g.newer) && L(g.doubt) === 3 && Object.values(g).every((x) => x.code === 0) && L(mw) === 1,
      Object.entries(g).map(([k, x]) => `${k} ${L(x)}×${shown4.includes(k) ? ' in place ' + inPlace(x) : k === 'newer' ? ' order ' + order(x) : ''} exit ${x.code}`).join(' · ') + ` · mutant ${L(mw)}× | ${tailOf(g.newer).slice(0, 300)}`);
    // §12c round 11 — A RECORD WITH NO ID IS NEVER OURS, CODEX'S QUEUE ID AN ID: this CLI's copy not in the late baseline, the
    // baseline holding another sender's line as codex records a submission it never typed (an inherited queue item, one a
    // second client steered: `payload.webui_queue_id`, no webui_msg_id) — shown; our copy recorded that way (an inherited
    // item whose id is our frame's) — dropped, the echo alone; another sender's line with no id at all — shown (round 10:
    // the first and the third matched by the person's words, dropped)
    const queued = (qid) => rec({ timestamp: new Date().toISOString(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: LINE }], webui_queue_id: qid, webui_queue_via: 'steered' } });
    const queueOwn = (l, { bf, rc }) => { let x = null; try { x = JSON.parse(l); } catch { } if (!x || !x.msgId) return; fs.appendFileSync(rc, rec({ type: '_stdin_ack', timestamp: Date.now(), msg_id: x.msgId }) + '\n'); fs.appendFileSync(bf, queued(x.msgId) + '\n' + R2 + '\n'); };
    const legs11 = {
      queue: late({ answer: ackOnly, bufInit: [H, queued('q11-other'), RO], wait: 2 }),
      queueOwn: late({ answer: queueOwn, wait: 2 }),
      noid: late({ answer: ackOnly, bufInit: [H, typedLine({ _fromWebui: true }), RO], wait: 2 }),
    };
    const q = {}; for (const [k, sh] of Object.entries(legs11)) q[k] = await held8(CLI, 'sess-r11-' + k, sh);
    const mq = await mutantRun('noqueue', [['p.webui_msg_id, p.webui_queue_id]', 'p.webui_msg_id]']], (f, id) => held8(f, id, legs11.queueOwn));
    const mn = await mutantRun('noidours', [[ID_RULE, 'return !sent.has(idOfCopy(rec)) && !!idOfCopy(rec);']], (f, id) => held8(f, id, legs11.noid));
    ok('A RECORD WITH NO ID IS NEVER OURS (round 11): this CLI\'s copy not in the late baseline — another sender\'s line as codex records a submission it never typed (its queue id) and another sender\'s line with no id at all are each SHOWN (the echo + that line, before its reply); our copy under that queue id (our frame\'s) is dropped (the echo alone, the reply once); every line acknowledged; the queue id unread (a mutant) shows our line twice, an id-less record taken as ours (a mutant) drops the other sender\'s line',
      L(q.queue) === 2 && inPlace(q.queue) && L(q.noid) === 2 && inPlace(q.noid) && L(q.queueOwn) === 1 && R(q.queueOwn) === 1 && Object.values(q).every((x) => x.code === 0) && L(mq) === 2 && L(mn) === 1,
      Object.entries(q).map(([k, x]) => `${k} ${L(x)}×${k === 'queueOwn' ? ' reply ' + R(x) + '×' : ' in place ' + inPlace(x)} exit ${x.code}`).join(' · ') + ` · noqueue ${L(mq)}× · noidours ${L(mn)}× | ${tailOf(q.queue).slice(0, 300)}`);
  }
  for (const k of kids) { try { if (k.exitCode == null && k.signalCode == null) k.kill('SIGKILL'); } catch { } }   // only this section's own children
  for (const s of servers) { try { s.close(); } catch { } }
}

try { ws.close(); } catch { }
console.log(`\ntest-human-cli: ${pass} passed, ${fail} failed`);
console.log(fail ? `${fail} FAILED` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
