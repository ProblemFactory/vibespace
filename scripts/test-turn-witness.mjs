#!/usr/bin/env node
// THE WITNESSES OF A TURN'S LIFE, READ FOR REAL (lane turn-never-silent, law L1 — pick 2). What the hub's turn watch (pick 3)
// will read, each through the real code:
//   ① src/server/proc-tree.js over a FAKE /proc: the reader's rules (children files only, a child checked against its
//      parent, zombies, the cut, an unreadable io file, no /proc, no children files, the root proven by its parent)
//   ② the same reader over THIS process's REAL tree: a child that sleeps reads «still», a child that spins «worked»
//   ③ the REAL agy wrapper over the stub: `cliWroteAt` = agy's own last line (a wrapper record never moves it), `turnOpenedAt`
//      = the turn's opening (0 after it); `hang-command` / `busy-command`: the command's REAL processes below agy, read by ①:
//      the hanging one still, the busy one working; ending the command ends its step and the turn goes on
//   ④ the REAL chat-wrapper over the claude stand-in: `cliWroteAt` moves on claude's lines, never on its control_response;
//      `TOOL-HANG-` / `TOOL-SPIN-`: still / working below claude
//   ⑤ the ACP and codex wrappers stamp only the CLI's own lines (a notification or its own request — their replies to a
//      request of ours return before the stamp)
// RED on pick 1: proc-tree.js absent, no stamp in any wrapper, no such stub shapes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const READER = path.join(REPO, 'src/server/proc-tree.js');
if (!fs.existsSync(READER)) { console.error('  ✗ src/server/proc-tree.js exists (the reader of the processes below a CLI)'); console.log('\n0 passed, 1 failed'); process.exit(1); }
const { createProcTree } = require(READER);
const TL = require(path.join(REPO, 'src/turn-liveness.js'));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-turn-witness-'));
const leftPids = new Set();
const killLeft = () => { for (const p of leftPids) { try { process.kill(p, 'SIGKILL'); } catch { } } };
process.on('exit', () => { killLeft(); try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });

console.log('— ① the reader over a FAKE /proc');
{
  const mk = (procs, { self = true, childrenFiles = true } = {}) => {
    const d = fs.mkdtempSync(path.join(ROOT, 'proc-'));
    if (self) { fs.mkdirSync(path.join(d, 'self')); fs.writeFileSync(path.join(d, 'self', 'stat'), '1 (init) S 0'); }
    for (const p of procs) {
      const pd = path.join(d, String(p.pid)); fs.mkdirSync(path.join(pd, 'task', String(p.pid)), { recursive: true });
      fs.writeFileSync(path.join(pd, 'stat'), `${p.pid} (${p.comm || 'x'}) ${p.state || 'S'} ${p.ppid} 1 1 0 -1 0 0 0 0 0 ${p.ticks || 0} 0 0 0 20 0 1 0 ${p.start || 100} 1000 10`);
      if (p.io !== false) fs.writeFileSync(path.join(pd, 'io'), `rchar: ${p.rchar || 0}\nwchar: ${p.wchar || 0}\n`);
      if (childrenFiles) fs.writeFileSync(path.join(pd, 'task', String(p.pid), 'children'), (p.kids || []).join(' ') + (p.kids && p.kids.length ? ' ' : ''));
    }
    return createProcTree({ procRoot: d });
  };
  let r = await mk([{ pid: 10, ppid: 9, comm: 'agy', kids: [11, 13] }, { pid: 11, ppid: 10, comm: 'bash', kids: [12], ticks: 5 }, { pid: 12, ppid: 11, comm: 'node driver', ticks: 7, rchar: 900 }, { pid: 13, ppid: 10, comm: 'sleep' }]).readBelow(10, { parent: 9 });
  ok(r.readable && r.alive && !r.cut && r.list.map((p) => p.pid).sort().join(',') === '11,12,13', 'the tree below the CLI, breadth first through the children files (the CLI itself never in it)', r);
  ok(r.list.find((p) => p.pid === 12).ticks === 7 && r.list.find((p) => p.pid === 12).io.rchar === 900 && r.list.find((p) => p.pid === 12).comm === 'node driver', 'each process: its ticks, its io bytes, its name');
  r = await mk([{ pid: 10, ppid: 9, kids: [11] }, { pid: 11, ppid: 77, comm: 'another tree' }]).readBelow(10, { parent: 9 });
  ok(r.list.length === 0, 'a child named by the children file whose stat names ANOTHER parent (a reused pid) is not ours', r.list);
  r = await mk([{ pid: 10, ppid: 9, kids: [11, 12] }, { pid: 11, ppid: 10, state: 'Z' }, { pid: 12, ppid: 10 }]).readBelow(10, { parent: 9 });
  ok(r.list.map((p) => p.pid).join(',') === '12', 'a zombie child is not counted (it holds and works nothing)');
  r = await mk([{ pid: 10, ppid: 9, kids: [11] }, { pid: 11, ppid: 10, io: false }]).readBelow(10, { parent: 9 });
  ok(r.list.length === 1 && r.list[0].io === null, 'an unreadable io file is null — never 0 bytes');
  const many = [{ pid: 10, ppid: 9, kids: Array.from({ length: 300 }, (_, i) => 1000 + i) }].concat(Array.from({ length: 300 }, (_, i) => ({ pid: 1000 + i, ppid: 10, start: 100 + i })));
  r = await mk(many).readBelow(10, { parent: 9 });
  ok(r.cut === true && r.list.length === TL.TREE_MAX, `over ${TL.TREE_MAX} processes: the reading is CUT and says so (never judged still)`, { cut: r.cut, n: r.list.length });
  r = await mk([{ pid: 10, ppid: 9, state: 'Z' }]).readBelow(10, { parent: 9 });
  ok(r.readable && r.alive === false && /gone/.test(r.why), 'a zombie CLI: gone', r);
  r = await mk([]).readBelow(10, { parent: 9 });
  ok(r.readable && r.alive === false && /gone/.test(r.why), 'no such CLI: gone', r);
  r = await mk([{ pid: 10, ppid: 4242, kids: [11] }, { pid: 11, ppid: 10 }]).readBelow(10, { parent: 9 });
  ok(r.alive === false && /reused/.test(r.why) && r.list.length === 0, 'the CLI pid under ANOTHER parent than the wrapper: not ours (a reused pid), nothing read below it', r);
  r = await mk([{ pid: 10, ppid: 9, kids: [11] }, { pid: 11, ppid: 10 }], { childrenFiles: false }).readBelow(10, { parent: 9 });
  ok(r.readable === false && /children files/.test(r.why) && r.alive === true, 'a kernel without children files: NOT readable, said — «unknown», never «stuck»', r);
  r = await mk([{ pid: 10, ppid: 9 }], { self: false }).readBelow(10, { parent: 9 });
  ok(r.readable === false && /no \/proc/.test(r.why), 'a machine without /proc: not readable, said', r);
  const src = fs.readFileSync(READER, 'utf8').replace(/\/\/.*$/gm, '');
  ok(!/Sync\s*\(/.test(src) && !/execSync|spawnSync|execFileSync/.test(src) && /fsp\.readFile/.test(src), 'the reader never makes a synchronous call (the hub\'s loop is never held) — fs.promises only');
}

// ②–④ run TOGETHER (each a job; their lines are printed in order once all are back) — the suite's wall time is the slowest
const jobs = [];
const job = (title, fn) => { const R = []; const own = new Set(); const ck = (c, n, e) => R.push([c, n, e]); jobs.push({ title, R, p: fn(ck, own).catch((e) => ck(false, `${title}: ${e.message}`)).finally(() => { for (const x of own) { try { process.kill(x, 'SIGKILL'); } catch { } } }) }); };
const metaOf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 's.json'), 'utf8')); } catch { return {}; } };
const until = async (fn, ms = 8000, what = 'condition') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timeout: ' + what); };
const PACE = { VIBESPACE_CLI_WROTE_PACE_MS: '100' };
const BASE_ENV = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', TMPDIR: process.env.TMPDIR || '/tmp', VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1' };
/** two readings of the tree below the session's CLI, `gap` ms apart, after `settle` — and whether it worked between them */
const twoReadings = async (dir, own, { settle = 500, gap = 700 } = {}) => {
  const m = await until(() => { const x = metaOf(dir); return x.childPid ? x : null; }, 4000, 'the sidecar naming the CLI (agy starts at the first message)');
  const T = createProcTree();
  await sleep(settle);
  const r1 = await T.readBelow(m.childPid, { parent: m.pid });
  for (const p of r1.list) own.add(p.pid);
  const s1 = metaOf(dir).cliWroteAt;
  await sleep(gap);
  const r2 = await T.readBelow(m.childPid, { parent: m.pid });
  for (const p of r2.list) own.add(p.pid);
  return { m, r1, r2, s1, s2: metaOf(dir).cliWroteAt, worked: TL.treeWorked(TL.readingOf(r1.at, r1.list, r1.cut), TL.readingOf(r2.at, r2.list, r2.cut)) };
};

job('— ② the reader over THIS process\'s REAL tree', async (ok, own) => {
  const a = spawn('sleep', ['60'], { stdio: 'ignore' }); own.add(a.pid);
  const b = spawn(process.execPath, ['-e', 'const e = Date.now() + 8000; const t = setInterval(() => { const s = Date.now(); while (Date.now() - s < 20) { } if (Date.now() > e) clearInterval(t); }, 100);'], { stdio: 'ignore' }); own.add(b.pid);
  const T = createProcTree();
  await sleep(500);
  const r1 = await T.readBelow(process.pid, { parent: process.ppid });
  await sleep(700);
  const r2 = await T.readBelow(process.pid, { parent: process.ppid });
  const one = (r, pid) => TL.readingOf(r.at, r.list.filter((p) => p.pid === pid), r.cut);
  ok(r1.readable && r1.alive && [a.pid, b.pid].every((p) => r1.list.some((x) => x.pid === p)), 'this suite\'s own children are read below it (the kernel\'s real children files)', r1.why);
  ok(TL.treeWorked(one(r1, a.pid), one(r2, a.pid)) === false, 'a child that SLEEPS: still between two readings (no tick, no byte)');
  ok(TL.treeWorked(one(r1, b.pid), one(r2, b.pid)) === true, 'a child that SPINS: worked');
});

const STUB = path.join(REPO, 'scripts/fixtures/antigravity-agy');
const startAgy = (env = {}) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'agy-')); const log = path.join(dir, 'stub.log');
  const child = spawn(process.execPath, [path.join(REPO, 'data/bin/agy-wrapper.js'), path.join(dir, 's.buf'), path.join(dir, 's.json'), STUB], { env: { ...BASE_ENV, AGY_WEBUI_CWD: dir, AGY_WEBUI_BACKEND: 'antigravity', AGY_STUB_LOG: log, AGY_WEBUI_AUTH_GRACE_MS: '400', ...PACE, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const h = { child, dir, records: [] }; let lb = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) !== -1) { const l = lb.slice(0, i).trim(); lb = lb.slice(i + 1); try { h.records.push(JSON.parse(l)); } catch { } } });
  child.stderr.on('data', () => { });
  h.send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
  h.has = (kind, pred = () => true) => h.records.some((r) => r.type === 'acp' && r.kind === kind && pred(r));
  h.count = (kind) => h.records.filter((r) => r.type === 'acp' && r.kind === kind).length;
  h.stub = () => { try { return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  h.stop = async () => { try { child.kill('SIGTERM'); } catch { } await sleep(150); try { child.kill('SIGKILL'); } catch { } };
  return h;
};
job('— ③a agy, a plain turn: the REAL wrapper over the stub', async (ok) => {
  const w = startAgy();
  try {
    await until(() => w.has('session'), 8000, 'session');
    const t0 = Date.now();
    w.send({ type: 'chat-input', text: 'hello there', msgId: 'm1' });
    await until(() => w.has('prompt_end'), 8000, 'the turn');
    await sleep(700);   // the stamp's write is paced (100 ms here), then the sidecar's own 200 ms
    const m = metaOf(w.dir);
    ok(m.cliWroteAt >= t0 && m.cliWroteAt <= Date.now(), 'agy\'s own lines stamp cliWroteAt in the sidecar', { cliWroteAt: m.cliWroteAt, t0 });
    ok(m.turnOpenedAt === 0, 'turnOpenedAt is 0 once the turn has ended', m.turnOpenedAt);
  } finally { await w.stop(); }
});
job('— ③b agy, a stuck turn: a wrapper record never moves the stamp', async (ok) => {
  const w = startAgy();
  try {
    await until(() => w.has('session'), 8000, 'session');
    const t0 = Date.now();
    w.send({ type: 'chat-input', text: 'stuck please', msgId: 'm1' });
    await until(() => w.has('update', (r) => r.update?.sessionUpdate === 'tool_call'), 8000, 'the open tool step');
    await sleep(700);
    const m1 = metaOf(w.dir);
    ok(m1.turnOpenedAt >= t0 && m1.streaming === true, 'turnOpenedAt = the moment the turn\'s text went to agy (the wrapper\'s own fact)', { turnOpenedAt: m1.turnOpenedAt, t0 });
    const n0 = w.records.length;
    w.send({ type: 'chat-input', text: 'a second message, queued behind it', msgId: 'm2' });
    await until(() => w.records.length > n0, 4000, 'the wrapper\'s queue record');
    await sleep(700);
    const m2 = metaOf(w.dir);
    ok(m1.cliWroteAt > 0 && m2.cliWroteAt === m1.cliWroteAt && w.records.slice(n0).some((r) => /queue/.test(r.kind || r.type || '')), 'the wrapper\'s OWN record (the queue) never moves cliWroteAt — only agy\'s lines do', { before: m1.cliWroteAt, after: m2.cliWroteAt, kinds: w.records.slice(n0).map((r) => r.kind || r.type) });
  } finally { await w.stop(); }
});
for (const shape of ['hang', 'busy']) job(`— ③${shape === 'hang' ? 'c' : 'd'} agy, ${shape}-command: the command's REAL processes below agy`, async (ok, own) => {
  const w = startAgy({ AGY_STUB_BUSY_MS: '6000' });
  try {
    await until(() => w.has('session'), 8000, 'session');
    w.send({ type: 'chat-input', text: `run the ${shape}-command now`, msgId: 'm1' });
    const pid = (await until(() => w.stub().find((x) => x.commandPid), 8000, 'the command pid')).commandPid;
    own.add(pid);
    const { r1, r2, worked } = await twoReadings(w.dir, own);
    if (shape === 'hang') {
      ok(r1.readable && r1.alive && r1.list.some((p) => p.pid === pid) && r1.list.some((p) => p.ppid === pid && p.comm === 'sleep'), 'hang-command: the command and its grandchild are read BELOW agy (through the sidecar\'s childPid, proven by its parent = the wrapper)', r1.list.map((p) => `${p.pid}<${p.ppid} ${p.comm}`));
      ok(r2.list.length >= 2 && worked === false, 'hang-command: nothing below agy works — still between two readings (the six silences\' shape)', r2.list.map((p) => `${p.comm}:${p.ticks}`));
      const ends = w.count('prompt_end');
      process.kill(pid, 'SIGTERM');
      await until(() => w.has('update', (r) => r.update?.sessionUpdate === 'tool_call_update' && /ended/.test(JSON.stringify(r.update))), 8000, 'the step DONE');
      await until(() => w.count('prompt_end') > ends, 8000, 'the turn going on to its end');
      ok(true, 'ending the command ends its step (DONE, its exit status) and the turn goes on to its end — the same turn');
    } else {
      ok(r1.alive && r1.list.some((p) => p.pid === pid), 'busy-command: the command is read below agy', r1.why);
      ok(worked === true, 'busy-command: it WORKS between two readings (CPU ticks move) — «busy», never stuck', r2.list.map((p) => `${p.comm}:${p.ticks}`));
    }
  } finally { await w.stop(); }
});

const STAND_IN = path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs');
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const ad = new ClaudeCodeAdapter({ buffersDir: os.tmpdir() });
const startClaude = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'claude-')); const pids = path.join(dir, 'tool.pids');
  const w = spawn(process.execPath, [path.join(REPO, 'data/bin/chat-wrapper.js'), path.join(dir, 's.buf'), path.join(dir, 's.json'), process.execPath, STAND_IN], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...BASE_ENV, STAND_IN_TOOL_PIDS: pids, STAND_IN_SPIN_MS: '6000', CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1', ...PACE } });
  const h = { w, dir, pids, recs: [] }; let lb = '';
  w.stdout.setEncoding('utf8');
  w.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i); lb = lb.slice(i + 1); try { h.recs.push(JSON.parse(l)); } catch { } } });
  w.stderr.on('data', () => { });
  h.stop = () => { try { w.kill('SIGKILL'); } catch { } };
  return h;
};
job('— ④a claude: the stamp moves on claude\'s lines, never on its control_response', async (ok) => {
  const h = startClaude();
  try {
    await until(() => fs.existsSync(path.join(h.dir, 's.json')), 8000, 'the sidecar');
    h.w.stdin.write(ad.formatChatInput('a short one', 'm-1').stdinPayload + '\n');
    await until(() => h.recs.some((r) => r.type === 'result'), 8000, 'the turn');
    await sleep(1000);   // paced 100 ms here, then the chat-wrapper sidecar's own 500 ms
    const m1 = metaOf(h.dir);
    ok(m1.cliWroteAt > 0, 'claude\'s own lines stamp cliWroteAt in the sidecar', m1.cliWroteAt);
    h.w.stdin.write(ad.formatInterrupt() + '\n');
    await until(() => h.recs.some((r) => r.type === 'control_response'), 8000, 'the control_response');
    await sleep(1000);
    ok(m1.cliWroteAt > 0 && metaOf(h.dir).cliWroteAt === m1.cliWroteAt, 'a control_response (claude answering a request of OURS) never moves cliWroteAt', { before: m1.cliWroteAt, after: metaOf(h.dir).cliWroteAt });
  } finally { h.stop(); }
});
for (const shape of ['HANG', 'SPIN']) job(`— ④${shape === 'HANG' ? 'b' : 'c'} claude, TOOL-${shape}-: the Bash command's REAL processes below claude`, async (ok, own) => {
  const h = startClaude();
  try {
    await until(() => fs.existsSync(path.join(h.dir, 's.json')), 8000, 'the sidecar');
    h.w.stdin.write(ad.formatChatInput(`TOOL-${shape}- the command`, 'm-1').stdinPayload + '\n');
    const pid = Number((await until(() => fs.existsSync(h.pids) && fs.readFileSync(h.pids, 'utf8').trim(), 8000, 'the tool pid')).split('\n')[0]);
    own.add(pid);
    const { r1, r2, worked, s1, s2 } = await twoReadings(h.dir, own, { settle: 700 });
    if (shape === 'HANG') {
      ok(r1.readable && r1.alive && r1.list.some((p) => p.pid === pid), 'TOOL-HANG-: claude\'s Bash command is read below claude', r1.list.map((p) => `${p.pid}<${p.ppid} ${p.comm}`));
      ok(r2.list.length >= 2 && worked === false && s1 > 0 && s2 === s1, 'TOOL-HANG-: nothing written and nothing below claude working — still', { worked, s1, s2 });
    } else ok(worked === true, 'TOOL-SPIN-: the command works below claude — «busy»');
  } finally { h.stop(); }
});

for (const j of jobs) {
  await j.p;
  console.log(j.title);
  for (const [c, n, e] of j.R) ok(c, n, e);
}

console.log('— ⑤ the ACP and codex wrappers stamp only the CLI\'s own lines');
{
  for (const [f, cli] of [['data/bin/acp-wrapper.js', 'the ACP agent'], ['data/bin/codex-chat-wrapper.js', 'the codex app-server']]) {
    const s = fs.readFileSync(path.join(REPO, f), 'utf8');
    const h = s.slice(s.indexOf('function handleStdoutLine('), s.indexOf('function handleStdoutLine(') + 4000);
    const iReply = h.search(/&& !msg\.method\) \{/), iStamp = h.indexOf('if (msg.method) noteCliWrote();');
    ok(iStamp > 0 && iReply > 0 && iReply < iStamp && h.slice(iReply, iStamp).includes('return;'), `${f}: ${cli}'s replies to our requests return BEFORE the stamp; a notification or its own request stamps cliWroteAt`, { iReply, iStamp });
    ok(/function noteCliWrote\(\)/.test(s) && /VIBESPACE_CLI_WROTE_PACE_MS/.test(s), `${f}: the same paced stamp as every wrapper`);
  }
  for (const f of ['data/bin/agy-wrapper.js', 'data/bin/chat-wrapper.js', 'data/bin/acp-wrapper.js', 'data/bin/codex-chat-wrapper.js']) {
    const n = fs.readFileSync(path.join(REPO, f), 'utf8').split('noteCliWrote()').length - 1;
    ok(n === 2, `${f}: ONE stamp site (and its definition)`, n);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
