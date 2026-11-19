#!/usr/bin/env node
// A FORK THAT RESUMED ITS PARENT IS ENDED BEFORE ITS FIRST TURN — the server-level leg (B-280a, lane bl-tests-e, 2026-11-17;
// left by lane fork-flag-server-side 2026-10-08). test-fork-flag pins the ws-create wiring as TEXT and drives the proof chain
// in-process; test-exit-forensics pins the kill site. Nothing drove the whole road: a ws create {fork: true} whose CLI writes its
// PARENT's lock (a resume in disguise — a second writer on the parent's transcript, the B-4058 class) must be SIGKILLed before
// it writes a turn, the creator told {code: 'fork-resumed-parent'} by name, and the parent's JSONL left byte-identical.
//
// DRIVEN, END TO END: a scratch copy of THIS tree (never the checkout's data/), a scratch HOME, a fake `claude` on PATH (a node
// script: it writes the CLI's lock shape {pid, sessionId, cwd, startedAt, procStart}). Parent A (terminal) announces its own id.
// The fork F (terminal, of A) is a BETRAYING CLI: it writes a lock naming A's id, and 20 s later appends its "first turn" to A's
// JSONL — unless it is dead by then. The proof runs on the capture chain (2 s, then every 1 s), so a fixed tree kills it first
// with a wide margin (a loaded box's stall of a few seconds stays a pass, never a flake).
//   · the creator gets an error {code: 'fork-resumed-parent', reqId: <its create>} naming the parent;
//   · the fork's CLI pid is gone; A's CLI is alive with its own id;
//   · A's JSONL is byte-identical after the betrayal's write time has passed.
// NEGATIVE CONTROL: the same run on a second scratch copy whose ws-create never kills the CLI (the proof's verdict answered,
// the SIGKILL and the pty kill removed): the fork's CLI lives and appends to the parent's JSONL — the defect, reproduced.
// A heavy suite (server + dtach + a fake CLI): the lane that wrote it ran none; its first run is the integrator's.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { vncEnv } from './scratch.mjs';
import { mintRoot, startHub } from './hub-boot.mjs';   // THE SUITES' ONE HUB BOOT (test-architecture §57c)
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { WebSocket } = require('ws');
const { freePort, withoutVendorKeys } = await import(path.join(REPO, 'scripts/scratch.mjs'));
const { checker } = await import(path.join(REPO, 'scripts/lib/check.mjs'));   // THE assertion helper (B-1747): a swap throws
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the root is minted by scripts/hub-boot.mjs (§57c): it ARMS the exit and SIGTERM / SIGINT / SIGHUP once and, at the end, ends
// each hub and everything rooted in it — the dtach masters, the wrappers, the fake CLIs (their HOME is in the root) and each
// hub's device daemon (its VIBESPACE_AGENTD_ROOT is) — BY IDENTITY, never by a name or a pattern; then it removes the root
const ROOT = mintRoot('fork-resumed-parent');

// ── the fake CLI: a parent announces its own id; a fork whose cwd holds `.betray` writes its PARENT's lock (the resume in
// disguise) and, 20 s later, appends its first turn to the JSONL path `.betray` names ──
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN, { recursive: true });
fs.writeFileSync(path.join(BIN, 'claude'), `#!/usr/bin/env node
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const a = process.argv.slice(2);
if (a.includes('--version')) { console.log('2.1.281 (Claude Code)'); process.exit(0); }
const fork = a.includes('--fork-session');
const ri = a.indexOf('--resume'); const resume = ri >= 0 ? a[ri + 1] : null;
const cwd = process.cwd();
const betray = fork && fs.existsSync(path.join(cwd, '.betray')) ? fs.readFileSync(path.join(cwd, '.betray'), 'utf8').trim() : null;
const sid = betray && resume ? resume : (resume && !fork ? resume : crypto.randomUUID());
process.stdin.on('data', () => {}); process.stdin.on('error', () => {});
const lockDir = fs.readFileSync(path.join(__dirname, 'lock-dir-' + path.basename(process.env.HOME || '')), 'utf8').trim();
const lockFile = path.join(lockDir, process.pid + '.json');
setTimeout(() => {
  const st = fs.readFileSync('/proc/self/stat', 'utf8'); const procStart = st.slice(st.lastIndexOf(')') + 2).split(' ')[19];
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, sessionId: sid, cwd, startedAt: Date.now(), procStart }));
  process.stdout.write('FAKE-CLAUDE ' + sid + '\\r\\n');
  if (betray) setTimeout(() => { fs.appendFileSync(betray, JSON.stringify({ type: 'user', sessionId: sid, uuid: crypto.randomUUID(), message: { role: 'user', content: 'the fork wrote into its parent' } }) + '\\n'); fs.writeFileSync(path.join(cwd, '.wrote'), ''); }, 20000);
}, 200);
const bye = () => { try { fs.unlinkSync(lockFile); } catch {} process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGHUP', bye);
setInterval(() => {}, 60000);
`);
fs.chmodSync(path.join(BIN, 'claude'), 0o755);

function makeTree(name, patch = null) {
  const wt = path.join(ROOT, name);
  fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
  for (const f of ['src', 'public', 'server.js', 'package.json']) execFileSync('cp', ['-r', path.join(REPO, f), path.join(wt, f)]);
  execFileSync('cp', ['-r', path.join(REPO, 'data', 'bin'), path.join(wt, 'data', 'bin')]);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
  if (patch) {
    const f = path.join(wt, patch.file);
    const src = fs.readFileSync(f, 'utf8');
    const out = patch.edits.reduce((t, [from, to]) => t.replace(from, to), src);
    for (const [from] of patch.edits) ok(src.includes(from), `the anchor of the control copy is in the source (${patch.file}): ${from.trim().slice(0, 100)}`);   // BY NAME (rule 06:25Z)
    ok(out !== src && patch.edits.every(([from]) => src.includes(from)), `control copy: every edit applied to ${patch.file}`);
    fs.writeFileSync(f, out);
  }
  return wt;
}

async function scenario(tag, wt) {
  const HOME = path.join(ROOT, 'home-' + tag);
  for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(HOME, d), { recursive: true });
  fs.writeFileSync(path.join(BIN, 'lock-dir-home-' + tag), path.join(HOME, '.claude', 'sessions'));
  const cwdOf = (n) => { const d = path.join(ROOT, `work-${tag}-${n}`); fs.mkdirSync(d, { recursive: true }); return d; };
  const PORT = await freePort();
  const env = { ...withoutVendorKeys(process.env), ...VNC_ENV, HOME, PATH: `${BIN}:${process.env.PATH}`, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '',
    VIBESPACE_AGENTD_ROOT: path.join(ROOT, 'agentd-' + tag), VIBESPACE_NODE_MODULES: path.join(REPO, 'node_modules') };
  delete env.CLAUDE_CODE_CHILD_SESSION; delete env.CLAUDECODE;
  const hub = startHub({ root: ROOT, tree: wt, port: PORT, env, log: 'hub-' + tag });
  if (!(await hub.waitForLog(/Ready\./, 90000))) throw new Error(`[${tag}] boot failed\n${hub.log().slice(-3000)}`);
  const c = await new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = [];
    ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
    ws.on('open', () => res({ ws, msgs })); ws.on('error', rej);
  });
  const rows = () => (c.msgs.filter((m) => m.type === 'active-sessions').pop()?.sessions || []);
  const rowOf = (id) => rows().find((s) => s.id === id);
  const cid = (r) => r?.claudeSessionId || r?.backendSessionId || null;
  const send = (extra) => { const reqId = 'r' + Math.random().toString(36).slice(2); c.ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'terminal', cols: 80, rows: 24, reqId, ...extra })); return reqId; };
  const createdOf = async (reqId) => {
    const t1 = Date.now();
    while (Date.now() - t1 < 20000) {
      const m = c.msgs.find((x) => x.type === 'created' && x.reqId === reqId); if (m) return m.sessionId;
      const e = c.msgs.find((x) => x.type === 'error' && x.reqId === reqId && x.code !== 'fork-resumed-parent'); if (e) throw new Error(`[${tag}] create refused: ${JSON.stringify(e)}`);
      await sleep(100);
    }
    throw new Error(`[${tag}] no created reply`);
  };
  const waitRow = async (id, pred, ms) => { const t1 = Date.now(); while (Date.now() - t1 < ms) { const r = rowOf(id); if (r && pred(r)) return r; await sleep(200); } return rowOf(id) || null; };
  const locks = () => { const d = path.join(HOME, '.claude/sessions'); return fs.readdirSync(d).map((n) => { try { return JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')); } catch { return null; } }).filter(Boolean); };
  // alive = the pid exists and is no zombie (a SIGKILLed CLI lingers as one until its wrapper reaps it)
  const alive = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return st.slice(st.lastIndexOf(')') + 2)[0] !== 'Z'; } catch { return false; } };

  const dA = cwdOf('A'), dF = cwdOf('F');
  const A = await createdOf(send({ cwd: dA, name: 'parent-A' }));
  const rA = await waitRow(A, (r) => !!cid(r), 20000), idA = cid(rA);
  const lockA = locks().find((l) => l.sessionId === idA);
  // the parent's transcript, as its CLI left it — the betrayal's target
  const jsonl = path.join(HOME, '.claude', 'projects', 'fork-proof-parent', idA + '.jsonl');
  fs.mkdirSync(path.dirname(jsonl), { recursive: true });
  fs.writeFileSync(jsonl, [1, 2, 3].map((n) => JSON.stringify({ type: 'user', sessionId: idA, uuid: crypto.randomUUID(), message: { role: 'user', content: `the parent's turn ${n}` } })).join('\n') + '\n');
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const before = sha(jsonl);
  fs.writeFileSync(path.join(dF, '.betray'), jsonl);
  const reqF = send({ cwd: dF, name: 'fork-F', mode: 'terminal', resume: true, resumeId: idA, backendSessionId: idA, fork: true }); // as the API sends it: the server derives --fork-session (B-8b7b)
  const F = await createdOf(reqF);
  // the verdict: the creator's error, by name, for ITS create
  const t2 = Date.now(); let err = null;
  while (!err && Date.now() - t2 < 20000) { err = c.msgs.find((x) => x.type === 'error' && x.reqId === reqF && x.code === 'fork-resumed-parent') || null; await sleep(150); }
  const forkLock = locks().find((l) => l.sessionId === idA && (!lockA || l.pid !== lockA.pid)) || null;
  // past the betrayal's write time (20 s after its lock), the fork's CLI is either dead or it wrote
  const tW = Date.now(); while (Date.now() - tW < 23000 && !fs.existsSync(path.join(dF, '.wrote'))) await sleep(250);
  await sleep(500);
  const res = {
    err, F, idA, forkPid: forkLock && forkLock.pid,
    forkAlive: !!forkLock && alive(forkLock.pid), parentAlive: !!lockA && alive(lockA.pid),
    wrote: fs.existsSync(path.join(dF, '.wrote')), jsonlSame: sha(jsonl) === before,
    parentRow: cid(rowOf(A)), log: hub.log(),
  };
  c.ws.close(); hub.stop();   // the hub and everything rooted in this scenario's HOME / daemon root, by identity (hub-boot's kill law)
  return res;
}

console.log('① the fixed tree: a ws create {fork: true} whose CLI writes its parent\'s lock');
{
  const r = await scenario('fixed', makeTree('wt-fixed'));
  ok(!!r.idA && !!r.F, 'the parent has its own id and the fork was created (a pending fork, seeded with the parent\'s id)', JSON.stringify({ idA: r.idA, F: r.F }));
  ok(!!r.forkPid, 'the fork\'s CLI wrote a lock naming its PARENT\'s id (the resume in disguise the proof judges)', JSON.stringify({ forkPid: r.forkPid }));
  ok(!!r.err && r.err.sessionId === r.F && r.err.message.includes(r.idA), 'the creator is told by name: {type: error, code: fork-resumed-parent, reqId: its create, sessionId: the fork}, the message naming the parent', JSON.stringify(r.err));
  ok(!r.forkAlive && !r.wrote, 'the fork\'s CLI is gone (SIGKILL — no turn, no flush) before it could write its first turn', JSON.stringify({ forkAlive: r.forkAlive, wrote: r.wrote }));
  ok(r.jsonlSame, 'the parent\'s JSONL is byte-identical after the betrayal\'s write time passed');
  ok(r.parentAlive && r.parentRow === r.idA, 'the parent\'s CLI is alive and its row keeps its own id', JSON.stringify({ parentAlive: r.parentAlive, parentRow: r.parentRow }));
  ok(/fork-resumed-parent — the fork's CLI \(pid \d+\) holds its parent/.test(r.log), 'the journal says it (one line: the fork, the pid, the parent)', r.log.split('\n').filter((l) => /fork-resumed-parent/.test(l)).slice(0, 2).join(' | '));
}

console.log('② NEGATIVE CONTROL: a ws-create that answers the verdict but never kills the CLI');
{
  const wt = makeTree('wt-control', { file: 'src/ws-create.js', edits: [
    ["                try { process.kill(Number(lock.pid), 'SIGKILL'); } catch { }\n", '                /* control: the CLI is not killed */\n'],
    ['                try { session.pty?.kill(); } catch { }\n', '                /* control: nor its pty */\n'],
  ] });
  const r = await scenario('control', wt);
  ok(!!r.forkPid && r.forkAlive && r.wrote && !r.jsonlSame, 'control: the fork\'s CLI lives and writes into its PARENT\'s JSONL — the second writer the kill stops (the reproduced defect)', JSON.stringify({ forkPid: r.forkPid, forkAlive: r.forkAlive, wrote: r.wrote, jsonlSame: r.jsonlSame }));
}

report();
