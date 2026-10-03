#!/usr/bin/env node
// B-f698 verify r1 — the unexpected-exit respawn END TO END: a REAL server over a stub claude CLI (heavy).
//   node scripts/test-unexpected-exit-e2e.mjs [treeDir] [legs]   (treeDir = a pre-fix copy for a control run)   legs: R (respawn races a Resume click) K (Processes-panel kill) — default "RK"
// Leg R: a chat conversation crashes mid-turn (stub exits 1 on CRASH) → the server asks client A to resume it once;
//        A (the respawn) and client B (the user's own Resume click) send the resume create in the same tick
//        → PASS = exactly ONE live CLI on the conversation (two = the B-4058 two-writer shape).
// Leg K: a working conversation's CLI is SIGTERMed through POST /api/sysinfo/signal (the System panel's kill —
//        a USER kill) → PASS = no respawn ask, and the exit line names the actor (asked=…).
// verify r2 — WRITERS ARE COUNTED BY /proc fd ON THE TRANSCRIPT (never by our own pidfiles or logs):
// Leg W: a working conversation's WRAPPER is SIGKILLed (no record ⇒ "unfinalized") while its CLI survives as an orphan
//        still holding the transcript (the stub ignores SIGHUP) → PASS = after the respawn, exactly ONE process has the
//        JSONL open (the pre-resume writer sweep ended the orphan), and only one respawn was asked.
// Leg L: the crash loop — the respawned CLI dies again while STARTING → PASS = no second ask, ONE For-you item worded
//        "again … was not restarted", no "was restarted" / "did not work" item beside it, no writer left.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TREE = path.resolve(process.argv[2] || REPO);
const LEGS = process.argv[3] || 'RKWL';
const LANE_WT = REPO;
const { scratch, scratchHome, freePort, vncEnv, endRootedProcesses } = await import(path.join(LANE_WT, 'scripts/scratch.mjs'));
const WebSocket = (await import(path.join(LANE_WT, 'node_modules/ws/index.js'))).default;
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const ROOT = scratch('uexv'); fs.mkdirSync(ROOT, { recursive: true });
const HOMEDIR = scratchHome('uexv-home', fs);
const wt = path.join(ROOT, 'wt'); fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
for (const f of ['src', 'public', 'server.js', 'package.json']) execFileSync('cp', ['-r', path.join(TREE, f), path.join(wt, f)]);
execFileSync('cp', ['-r', path.join(TREE, 'data', 'bin'), path.join(wt, 'data', 'bin')]);
fs.symlinkSync(path.join(LANE_WT, 'node_modules'), path.join(wt, 'node_modules'));
const BIN = path.join(ROOT, 'bin'), PROJ = path.join(ROOT, 'proj'), STUBS = path.join(ROOT, 'stubs');
for (const d of [BIN, PROJ, STUBS]) fs.mkdirSync(d, { recursive: true });
// THE STUB CLI: takes the conversation id the server names (--resume / --session-id), holds its transcript open and
// writes the CLI's own lock file (so the pre-resume writer sweep CAN find it), answers a user turn; CRASH = exit 1 mid-turn.
fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const args = process.argv.slice(2);
if (!args.includes('--output-format')) { if (args.includes('--version')) console.log('2.1.281 (Claude Code)'); process.exit(0); }
const at = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const sid = at('--resume') || at('--session-id') || crypto.randomUUID();
fs.writeFileSync(path.join(${JSON.stringify(STUBS)}, String(process.pid)), JSON.stringify({ sid, resume: !!at('--resume'), argv: args }));
if (fs.existsSync(${JSON.stringify(path.join(ROOT, 'hup-immune'))})) process.on('SIGHUP', () => { });
const pd = path.join(process.env.HOME, '.claude', 'projects', process.cwd().replace(/[\\/._]/g, '-'));
fs.mkdirSync(pd, { recursive: true });
const tfd = fs.openSync(path.join(pd, sid + '.jsonl'), 'a');
try { fs.writeFileSync(path.join(process.env.HOME, '.claude', 'sessions', process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: sid, cwd: process.cwd() })); } catch {}
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); try { fs.writeSync(tfd, JSON.stringify({ ...o, sessionId: sid }) + '\\n'); } catch {} };
out({ type: 'system', subtype: 'init', session_id: sid, cwd: process.cwd(), model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
if (at('--resume') && fs.existsSync(${JSON.stringify(path.join(ROOT, 'crash-next'))})) { try { fs.unlinkSync(${JSON.stringify(path.join(ROOT, 'crash-next'))}); } catch {} setTimeout(() => process.exit(1), 800); }
let buf = '', n = 0;
process.stdin.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch { continue; }
    if (!m || m.type !== 'user') continue;
    const text = JSON.stringify(m.message || m);
    n++;
    out({ type: 'assistant', session_id: sid, uuid: crypto.randomUUID(), message: { id: 'msg_stub_' + n, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'working ' + n }] } });
    if (text.includes('CRASH')) setTimeout(() => process.exit(1), 300);
    else if (!text.includes('WORK')) out({ type: 'result', subtype: 'success', session_id: sid, is_error: false, result: 'ok', usage: {} });
  }
});
setInterval(() => {}, 1000);
`, { mode: 0o755 });
const stubs = () => fs.readdirSync(STUBS).map((p) => { let alive = true; try { process.kill(Number(p), 0); } catch { alive = false; } return { pid: Number(p), alive, ...JSON.parse(fs.readFileSync(path.join(STUBS, p), 'utf8')) }; });
// the transcript's WRITERS, read from the kernel: every process with an fd open on the JSONL
const jsonlOf = (cid) => path.join(HOMEDIR, '.claude', 'projects', PROJ.replace(/[\/._]/g, '-'), cid + '.jsonl');
function writers(cid) {
  const want = jsonlOf(cid), out = [];
  for (const p of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(p)) continue;
    let fds = []; try { fds = fs.readdirSync(`/proc/${p}/fd`); } catch { continue; }
    for (const fd of fds) { let t = ''; try { t = fs.readlinkSync(`/proc/${p}/fd/${fd}`); } catch { continue; } if (t === want) { out.push(Number(p)); break; } }
  }
  return out;
}
const ppidOf = (pid) => { try { const st = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); } catch { return 0; } };
const cmdOf = (pid) => { try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ').trim(); } catch { return ''; } };
const PORT = await freePort();
const bootEnv = { ...process.env, ...(await vncEnv()), PORT: String(PORT), HOME: HOMEDIR, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '',
  CLAUDE_CMD: path.join(BIN, 'claude'), PATH: [BIN, path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'].join(':') };
for (const k of Object.keys(bootEnv)) if (/^(VIBESPACE_API|VIBESPACE_SESSION_TOKEN|VIBESPACE_JOB_TOKEN|CLAUDE_WEBUI_|AGENT_BROWSER_)/.test(k)) delete bootEnv[k];
let journal = '';
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: bootEnv, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
const finish = async () => {
  try { srv.kill('SIGTERM'); } catch { }
  await sleep(800);
  try { endRootedProcesses(ROOT); } catch { }
  for (const s of stubs()) if (s.alive) { try { process.kill(s.pid, 'SIGKILL'); } catch { } }
  fs.writeFileSync(path.join(ROOT, 'journal.txt'), journal);
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'} (${pass} passed, ${fail} failed) — tree ${TREE}; journal ${path.join(ROOT, 'journal.txt')}`);
  process.exit(fail ? 1 : 0);
};
if (!ok(await until(() => journal.includes('Ready.'), 60000), 'setup: the server is Ready', journal.slice(-800))) await finish();
async function connect() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const st = { ws, frames: [] };
  ws.on('message', (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { return; } if (m.type !== 'output') st.frames.push(m); });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  return st;
}
const A = await connect(), B = await connect();
async function newChat(tag) {
  const before = new Set(stubs().map((s) => s.pid));
  A.ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: PROJ, cols: 120, rows: 30, name: 'uexv-' + tag, reqId: 'new-' + tag }));
  await until(() => A.frames.find((f) => f.type === 'created' && f.reqId === 'new-' + tag), 20000);
  const c = A.frames.find((f) => f.type === 'created' && f.reqId === 'new-' + tag);
  if (!c) return null;
  A.ws.send(JSON.stringify({ type: 'attach', sessionId: c.sessionId, cols: 120, rows: 30 }));
  await until(() => stubs().some((s) => !before.has(s.pid)), 15000);
  const stub = stubs().find((s) => !before.has(s.pid));
  await sleep(1500);
  return { sid: c.sessionId, stub };
}
const resumeCreate = (cid, reqId) => JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: PROJ, cols: 120, rows: 30, name: 'uexv-r', resume: true, resumeId: cid, backendSessionId: cid, reqId });

if (LEGS.includes('R')) {
  console.log('\nLeg R — a mid-turn crash → the respawn ask; client A runs it while client B clicks Resume in the same tick');
  leg: {
    const s = await newChat('r');
    if (!ok(s && s.stub, 'setup R: a chat conversation with a stub CLI', JSON.stringify(A.frames.slice(-6)))) break leg;
    const cid = s.stub.sid;
    A.ws.send(JSON.stringify({ type: 'chat-input', sessionId: s.sid, text: 'please CRASH now' }));
    const asked = await until(() => A.frames.find((f) => f.type === 'unexpected-exit-respawn'), 20000);
    const ask = A.frames.find((f) => f.type === 'unexpected-exit-respawn');
    if (!ok(asked && ask.session && ask.session.backendSessionId === cid, `setup R: the crash was judged unexpected and client A was asked to resume ${cid}`, journal.split('\n').filter((l) => /exited|unexpected/.test(l)).join(' | '))) break leg;
    A.ws.send(resumeCreate(cid, 'respawn')); B.ws.send(resumeCreate(cid, 'user-click'));
    await sleep(9000);
    const live = stubs().filter((x) => x.alive && x.sid === cid);
    const ans = (st, id) => { const f = st.frames.find((x) => x.reqId === id && (x.type === 'created' || x.type === 'error')); return f ? f.type + (f.code ? ':' + f.code : '') : 'none'; };
    console.log(`    answers: respawn → ${ans(A, 'respawn')} · user click → ${ans(B, 'user-click')} · live CLIs on ${cid}: ${live.map((x) => x.pid).join(',') || 'none'}`);
    ok(live.length === 1, `exactly ONE live CLI on the conversation after the respawn raced the user's Resume (saw ${live.length})`);
    const w = writers(cid);
    ok(w.length === 1, `exactly ONE process holds the transcript open (/proc fd: ${w.join(',') || 'none'})`);
  }
}
if (LEGS.includes('K')) {
  console.log('\nLeg K — the System panel\'s kill (POST /api/sysinfo/signal) of a WORKING conversation\'s CLI');
  leg: {
    const s = await newChat('k');
    if (!ok(s && s.stub, 'setup K: a chat conversation with a stub CLI', JSON.stringify(A.frames.slice(-6)))) break leg;
    A.ws.send(JSON.stringify({ type: 'chat-input', sessionId: s.sid, text: 'WORK on it' }));
    await sleep(1500);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/sysinfo/signal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid: s.stub.pid, sig: 'TERM' }) });
    const body = await r.json().catch(() => ({}));
    ok(r.ok && body.ok, `setup K: the panel's kill landed (${JSON.stringify(body)})`);
    await until(() => A.frames.find((f) => f.type === 'exited' && f.sessionId === s.sid), 20000);
    await sleep(2500);
    const line = journal.split('\n').find((l) => l.includes('[session] exited ' + s.sid)) || '(no exit line)';
    console.log('    exit line: ' + line.trim().slice(0, 240));
    ok(!A.frames.find((f) => f.type === 'unexpected-exit-respawn' && f.session && f.session.backendSessionId === s.stub.sid), 'a USER kill from the System panel is never respawned');
    ok(/ asked=/.test(line), 'the exit line names the actor (asked=…)');
  }
}
const asksFor = (cid) => [A, B].flatMap((st) => st.frames.filter((f) => f.type === 'unexpected-exit-respawn' && f.session && f.session.backendSessionId === cid)).length;
async function todoTexts() {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/user-todos`).then((x) => x.json()).catch(() => ({}));
  const out = []; const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (typeof o.text === 'string') out.push(o.text); Object.values(o).forEach(walk); } };
  walk(r); return [...new Set(out)];
}
if (LEGS.includes('W')) {
  console.log('\nLeg W — the WRAPPER is SIGKILLed mid-turn; its CLI survives as an orphan holding the transcript');
  leg: {
    fs.writeFileSync(path.join(ROOT, 'hup-immune'), '1');
    const s = await newChat('w');
    if (!ok(s && s.stub, 'setup W: a chat conversation with a stub CLI', JSON.stringify(A.frames.slice(-6)))) break leg;
    const cid = s.stub.sid;
    A.ws.send(JSON.stringify({ type: 'chat-input', sessionId: s.sid, text: 'WORK on it' }));
    await sleep(1500);
    const wrapper = ppidOf(s.stub.pid);
    if (!ok(/wrapper/.test(cmdOf(wrapper)), `setup W: the stub's parent is the chat wrapper (pid ${wrapper}: ${cmdOf(wrapper).slice(0, 90)})`)) break leg;
    try { process.kill(wrapper, 'SIGKILL'); } catch { }
    const asked = await until(() => asksFor(cid) > 0, 25000);
    const line = journal.split('\n').find((l) => l.includes('[session] exited ' + s.sid)) || '(no exit line)';
    const orphanAlive = (() => { try { process.kill(s.stub.pid, 0); return true; } catch { return false; } })();
    console.log(`    exit line: ${line.trim().slice(0, 220)}\n    respawn asked: ${asked} · orphan ${s.stub.pid} alive: ${orphanAlive} · writers before the respawn: ${writers(cid).join(',') || 'none'}`);
    if (!asked) { ok(true, 'no respawn was asked (nothing to race — the reach is printed above)'); break leg; }
    A.ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: PROJ, cols: 120, rows: 30, name: 'uexv-w2', resume: true, resumeId: cid, backendSessionId: cid, reqId: 'respawn-w' }));
    await until(() => A.frames.find((f) => f.reqId === 'respawn-w' && (f.type === 'created' || f.type === 'error')), 30000);
    await sleep(3000);
    const w = writers(cid);
    const sweptLine = journal.split('\n').filter((l) => /sweep/i.test(l)).slice(-2).map((l) => l.trim().slice(0, 160)).join(' | ');
    console.log(`    respawn → ${(A.frames.find((f) => f.reqId === 'respawn-w') || {}).type} · writers after: ${w.map((p) => p + (p === s.stub.pid ? '(orphan)' : '')).join(',') || 'none'} · sweep: ${sweptLine || '(no sweep line)'}`);
    ok(w.length === 1 && !w.includes(s.stub.pid), `after the respawn exactly ONE process holds the transcript, and it is not the orphan (/proc fd: ${w.join(',') || 'none'})`);
    ok(asksFor(cid) === 1, `one respawn ask for the conversation (saw ${asksFor(cid)})`);
  }
  try { fs.unlinkSync(path.join(ROOT, 'hup-immune')); } catch { }
}
if (LEGS.includes('L')) {
  console.log('\nLeg L — the crash loop: the respawned CLI dies again while it is starting');
  leg: {
    const s = await newChat('l');
    if (!ok(s && s.stub, 'setup L: a chat conversation with a stub CLI', JSON.stringify(A.frames.slice(-6)))) break leg;
    const cid = s.stub.sid;
    A.ws.send(JSON.stringify({ type: 'chat-input', sessionId: s.sid, text: 'please CRASH now' }));
    if (!ok(await until(() => asksFor(cid) > 0, 20000), 'setup L: the first crash asked for the respawn')) break leg;
    fs.writeFileSync(path.join(ROOT, 'crash-next'), '1');
    const before = new Set(await todoTexts()), agains = () => (journal.match(/notify only \(again\)/g) || []).length, a0 = agains();
    A.ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: PROJ, cols: 120, rows: 30, name: 'uexv-l2', resume: true, resumeId: cid, backendSessionId: cid, reqId: 'respawn-l' }));
    await until(() => agains() > a0, 20000);
    await sleep(6000);
    const items = (await todoTexts()).filter((t) => !before.has(t) && /exited unexpectedly/.test(t));   // the item names the server's session name
    console.log(`    asks: ${asksFor(cid)} · items: ${JSON.stringify(items).slice(0, 400)} · writers: ${writers(cid).join(',') || 'none'}`);
    ok(asksFor(cid) === 1, `no second respawn — one ask in all (saw ${asksFor(cid)})`);
    // ONE "again" item; a "was restarted" item may precede it only when a 5 s tick saw the respawn alive (true then) — never "did not work"
    ok(items.filter((t) => /exited unexpectedly again at \d\d:\d\d and was not restarted/.test(t)).length === 1 && !items.some((t) => /did not work|no VibeSpace window/.test(t)) && items.length <= 2,
      'ONE For-you item worded "again … was not restarted" (no "did not work" beside it)');
    ok(writers(cid).length === 0, 'no process holds the transcript after the crash loop');
  }
}
await finish();
