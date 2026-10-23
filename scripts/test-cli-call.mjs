#!/usr/bin/env node
// test-cli-call — THE ONE CALL every agent CLI makes to its hub (lane cli-call-timeouts, hub feedback fb-8ae9289552,
// 2026-10-23: «vibespace-task progress hung for 30+ min … the same line re-issued 3 min later landed in 2 s»).
// src/cli-call.js — ① the PURE budgets / the --timeout flag / the words; ② the transport against real loopback hubs
// (silent, step-naming, answering, streaming, piped, aborted) — each expiry names its wait (connect / answer / step /
// body); ③ the REAL CLIs (vibespace-task, -msg, -feedback) exit 124 with ONE line, never hang, and a bad --timeout is
// refused — CONTROL: the helper with its timer cut is still waiting at twice the budget; ④ the progress route answers
// after the STORE write while the shared-folder write is slowed by a fake slow fs (the CLI exits 0 well inside its
// budget, a later answer says the copy is behind) — CONTROL: the base (c8aa8820) task store, whose save wrote TASK.md on
// the caller's turn, with that write slowed, expires the same CLI with exit 124. Run: node scripts/test-cli-call.mjs
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mutantCopies } from './mutant-copy.mjs';
import { gitEnvFrom } from './git-env.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CC = require(path.join(REPO, 'src/cli-call.js'));
let failed = 0, passed = 0;
const ok = (c, name, extra) => { if (c) { passed++; console.log('  ✓ ' + name); } else { failed++; console.error('  ✗ ' + name + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-clicall-'));

// ── ① PURE ──
console.log('① the budgets, the flag, the words (PURE)');
ok(CC.BUDGETS.read === 15000 && CC.BUDGETS.write === 30000 && CC.BUDGETS.wake === 60000 && CC.EXPIRED_EXIT === 124, '① a read 15 s, a write 30 s, a wake / dispatch 60 s; an expired call exits 124', CC.BUDGETS);
ok(CC.classOf('GET') === 'read' && CC.classOf('POST') === 'write' && CC.classOf('DELETE') === 'write' && CC.classOf('POST', 'wake') === 'wake' && CC.classOf('GET', 'nope') === 'read', '① the class by method when the call site names none (a GET reads, the rest write)');
ok(CC.budgetOf({ cls: 'read' }) === 15000 && CC.budgetOf({ cls: 'wake' }) === 60000 && CC.budgetOf({ cls: 'write', ms: 240000 }) === 240000 && CC.budgetOf({ cls: 'read', extraMs: 100000 }) === 115000
  && CC.budgetOf({ cls: 'wake', ms: 240000, override: 5000 }) === 5000 && CC.budgetOf({ cls: 'read', extraMs: 20000, override: 5000 }) === 25000, '① budgetOf: --timeout beats the class AND a site base; a long-poll\'s own wait is always added');
ok(CC.parseDuration('30') === 30000 && CC.parseDuration('90s') === 90000 && CC.parseDuration('2m') === 120000 && CC.parseDuration('1500ms') === 1500 && CC.parseDuration('0.5') === 500
  && CC.parseDuration('0') === null && CC.parseDuration('-3') === null && CC.parseDuration('soon') === null && CC.parseDuration(undefined) === null, '① a duration: seconds by default, s / m / h / ms; zero, negative and words are refused');
{
  const a = CC.takeTimeout(['progress', 'note', '--timeout', '45', '--detail', 'd']);
  const b = CC.takeTimeout(['show', '--call-timeout=7'], ['--timeout', '--call-timeout']);
  const c = CC.takeTimeout(['run', '--timeout', '6h'], ['--call-timeout']);
  const d = CC.takeTimeout(['run', 'mac', '--', 'curl', '--timeout', '2']);
  const e = CC.takeTimeout(['show', '--timeout', 'abc']);
  const f = CC.takeTimeout(['show', '--timeout']);
  ok(a.ms === 45000 && a.argv.join(' ') === 'progress note --detail d' && b.ms === 7000 && b.argv.join(' ') === 'show', '① --timeout <s> / --call-timeout=<s> leave argv without them');
  ok(c.ms === null && c.argv.join(' ') === 'run --timeout 6h' && c.flag === '--call-timeout', '① a CLI whose --timeout means something else (a job\'s run time) keeps it: only --call-timeout is taken');
  ok(d.ms === null && d.argv.join(' ') === 'run mac -- curl --timeout 2', '① nothing after `--` is taken (a command\'s own argv)');
  ok(/--timeout wants a duration in seconds/.test(e.error || '') && /got nothing/.test(f.error || ''), '① a bad or missing value is an error by name', [e.error, f.error]);
}
ok(CC.phaseOf({}) === 'connect' && CC.phaseOf({ connected: true }) === 'answer' && CC.phaseOf({ connected: true, step: 'folder-write' }) === 'step' && CC.phaseOf({ connected: true, answered: true }) === 'body', '① the phase: connect → answer (→ step, when the hub named one) → body');
{
  const L = (o) => CC.expiryLine({ tool: 'vibespace-task', ms: 30000, cls: 'write', ...o });
  ok(L({ phase: 'step', step: 'folder-write' }).startsWith('vibespace-task: the hub answered the request but the shared folder write did not return in 30 s'), '① THE STEP WORDS: «the hub answered the request but the shared folder write did not return in 30 s»', L({ phase: 'step', step: 'folder-write' }));
  ok(CC.expiryLine({ tool: 'vibespace-task', phase: 'answer', ms: 15000, cls: 'read' }) === 'vibespace-task: the hub did not answer in 15 s (--timeout <seconds> waits longer)', '① THE ANSWER WORDS: «the hub did not answer in 15 s» (a read: nothing more)');
  ok(/^vibespace-task: the hub at hub\.test:3456 did not take the connection in 30 s — nothing was sent/.test(L({ phase: 'connect', origin: 'hub.test:3456' })), '① THE CONNECT WORDS: the hub never took the connection — nothing was sent');
  ok(/the hub answered \(HTTP 200\) but the rest of its answer did not arrive in 30 s/.test(L({ phase: 'body', status: 200 })) && / — it may still take effect: look before you repeat it/.test(L({ phase: 'answer' })), '① the body words; a write / wake says it may still take effect');
  ok(/the hub answered the request but its "brand-new" step did not return/.test(L({ phase: 'step', step: 'Brand-New!' })) && /\(--call-timeout <seconds> waits longer\)$/.test(L({ phase: 'answer', flag: '--call-timeout' })), '① a step key this copy does not know is still named; the line teaches the CLI\'s own flag');
  ok(!/\n/.test(L({ phase: 'step', step: 'a\nb' })), '① ONE line, always');
}

// ── ② the transport ──
console.log('② the transport against real loopback hubs');
const servers = [];
const hub = (handler) => new Promise((r) => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => { servers.push(s); r('http://127.0.0.1:' + s.address().port); }); });
const SILENT = await hub(() => { /* takes the request, never answers */ });
const STEP = await hub((req, res) => { req.resume(); CC.stepAhead(res, 'folder-write'); /* …and never finishes it */ });
const PARTIAL = await hub((req, res) => { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"part'); });
const ANSWER = await hub((req, res) => {
  let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
    if (req.url === '/late') { CC.stepAhead(res, 'compact'); setTimeout(() => { res.writeHead(403, { 'content-type': 'application/json' }); res.end('{"error":"refused late"}'); }, 80); return; }
    if (req.url === '/stream') { res.writeHead(200, { 'content-length': '6' }); res.write('abc'); setTimeout(() => res.end('def'), 50); return; }
    res.writeHead(req.url === '/404' ? 404 : 200, { 'content-type': 'application/json', 'x-echo': req.headers['content-type'] || '' });
    res.end(JSON.stringify({ method: req.method, body: b, len: req.headers['content-length'] || null }));
  });
});
const T = (url, o = {}) => CC.call(url, { tool: 'vibespace-test', onExpiry: 'throw', ...o });
CC.configure({ override: 300 });
{
  const t0 = Date.now();
  const e = await T(SILENT + '/x', { method: 'POST', body: '{}' }).then(() => null, (x) => x);
  ok(e && e.code === 'CLI_CALL_EXPIRED' && e.phase === 'answer' && /vibespace-test: the hub did not answer in 0\.3 s — it may still take effect/.test(e.line), `② a hub that takes the request and never answers: ended BY ITS BUDGET (CLI_CALL_EXPIRED) in the ANSWER words (${Date.now() - t0} ms)`, e && e.line);
  const s = await T(STEP + '/x', { method: 'POST', body: '{}' }).then(() => null, (x) => x);
  ok(s && s.phase === 'step' && s.step === 'folder-write' && /the hub answered the request but the shared folder write did not return in 0\.3 s/.test(s.line), '② a hub whose 103 named its step: the line names THAT step', s && s.line);
  const p = await T(PARTIAL + '/x').then(() => null, (x) => x);
  ok(p && p.phase === 'body' && /the hub answered \(HTTP 200\) but the rest of its answer did not arrive in 0\.3 s/.test(p.line) && !/may still take effect/.test(p.line), '② a hub that answered half: the BODY words (a read says no more)', p && p.line);
  const c0 = Date.now();
  const k = await T('http://10.255.255.1:9/x').then(() => null, (x) => x);
  ok(k && ((k.code === 'CLI_CALL_EXPIRED' && k.phase === 'connect' && /did not take the connection in 0\.3 s — nothing was sent/.test(k.line)) || /ENETUNREACH|EHOSTUNREACH|ECONNREFUSED/.test(String(k.code))), `② an address that never takes the connection: the CONNECT words, by the budget (${k && (k.phase || k.code)}, ${Date.now() - c0} ms)`, k && (k.line || k.message));
}
CC.configure({ override: null });
{
  const r = await T(ANSWER + '/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1 }) });
  const j = await r.json();
  ok(r.ok && r.status === 200 && j.method === 'POST' && j.body === '{"a":1}' && j.len === '7' && r.headers.get('x-echo') === 'application/json', '② an answering hub: a real Response (ok / status / headers / json), the body sent with its length');
  const n = await T(ANSWER + '/404');
  ok(!n.ok && n.status === 404 && (await n.json()).method === 'GET', '② a 4xx passes through as an answer (the call sites word it), never an expiry');
  const late = await T(ANSWER + '/late', { method: 'POST', body: '{}' });
  ok(late.status === 403 && (await late.json()).error === 'refused late', '② a 103 step beacon leaves the final status free (a refusal after it is still a 403)');
  const fd = new FormData(); fd.append('f', new Blob(['hello']), 'a.txt');
  const m = await (await T(ANSWER + '/fd', { method: 'POST', body: fd })).json();
  const echoed = await T(ANSWER + '/fd', { method: 'POST', body: fd });
  ok(/hello/.test(m.body) && /multipart\/form-data; boundary=/.test(echoed.headers.get('x-echo')), '② a FormData body goes through the platform\'s own encoder (the boundary named)');
  const file = path.join(tmp, 'up.bin'); fs.writeFileSync(file, 'piped-bytes');
  const up = await (await T(ANSWER + '/up', { method: 'POST', body: fs.createReadStream(file) })).json();
  ok(up.body === 'piped-bytes', '② a node stream body (a file upload) is piped, never buffered whole');
  const st = await T(ANSWER + '/stream', { stream: true });
  const rd = st.body.getReader(); let got = ''; for (;;) { const { done, value } = await rd.read(); if (done) break; got += Buffer.from(value).toString(); }
  ok(got === 'abcdef', '② stream: resolved at the headers, the body read as it arrives');
  const ac = new AbortController(); setTimeout(() => ac.abort(), 50);
  const ab = await T(SILENT + '/poll', { signal: ac.signal, extraMs: 20000 }).then(() => null, (x) => x);
  ok(ab && ab.name === 'AbortError', '② an AbortSignal ends a long-poll at once (AbortError), never the process', ab && ab.message);
  const gone = await T('http://127.0.0.1:1/x').then(() => null, (x) => x);
  ok(gone && gone.code === 'ECONNREFUSED' && /ECONNREFUSED/.test(gone.message), '② a refused connection REJECTS by its code (the call sites word «unreachable»)', gone && gone.message);
}

// ── ③ the real CLIs ──
console.log('③ the real CLIs: ONE line, exit 124, never a hang');
const run = (bin, args, env = {}, ms = 8000) => new Promise((resolve) => {
  const t0 = Date.now();
  const c = spawn(process.execPath, [path.join(REPO, bin), ...args], { env: { PATH: process.env.PATH, HOME: tmp, VIBESPACE_SESSION_TOKEN: 'vsst_test', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
  const kill = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, ms);
  c.on('close', (code, sig) => { clearTimeout(kill); resolve({ code, sig, out, err, ms: Date.now() - t0 }); });
});
{
  // the five expiry legs run side by side (each its own process, each its own hub wait)
  const [a, s, m, f, j, b] = await Promise.all([
    run('data/bin/vibespace-task', ['progress', 'a summary', '--timeout', '0.6'], { VIBESPACE_API: SILENT }),
    run('data/bin/vibespace-task', ['progress', 'a summary', '--timeout=0.6'], { VIBESPACE_API: STEP }),
    run('data/bin/vibespace-msg', ['list', '--timeout', '0.6'], { VIBESPACE_API: SILENT }),
    run('data/bin/vibespace-feedback', ['the call hung', '--about', 'vibespace-task', '--timeout', '0.6'], { VIBESPACE_API: SILENT }),
    run('data/bin/vibespace-job', ['list', '--call-timeout', '0.6'], { VIBESPACE_API: SILENT }),
    run('data/bin/vibespace-task', ['show', '--timeout', 'soon'], { VIBESPACE_API: SILENT }),
  ]);
  ok(a.code === 124 && a.err.trim() === 'vibespace-task: the hub did not answer in 0.6 s — it may still take effect: look before you repeat it (--timeout <seconds> waits longer)', `③ vibespace-task progress against a hub that never answers: ONE line, exit 124 (${a.ms} ms)`, a);
  ok(s.code === 124 && /^vibespace-task: the hub answered the request but the shared folder write did not return in 0\.6 s/.test(s.err) && s.err.trim().split('\n').length === 1, '③ …against a hub that named its step: «the shared folder write did not return»', s);
  ok(m.code === 124 && m.err.trim() === 'vibespace-msg: the hub did not answer in 0.6 s (--timeout <seconds> waits longer)', '③ vibespace-msg list (a read): the read words, exit 124', m);
  ok(f.code === 124 && /^vibespace-feedback: the hub did not answer in 0\.6 s/.test(f.err), '③ vibespace-feedback: the same one line', f);
  ok(j.code === 124 && /^vibespace-job: the hub did not answer in 0\.6 s \(--call-timeout <seconds> waits longer\)/.test(j.err), '③ vibespace-job (its --timeout is the job\'s): --call-timeout overrides and the line teaches it', j);
  ok(b.code === 2 && /refused — --timeout wants a duration in seconds .* nothing was sent/.test(b.err), '③ a bad --timeout is refused by name, exit 2, nothing sent', b);
  // CONTROL: the same helper with its timer cut (the pre-lane shape: an unbounded wait) is still waiting at twice the budget
  const mutDir = path.join(tmp, 'mut'); fs.mkdirSync(path.join(mutDir, 'data', 'bin'), { recursive: true });
  const src = fs.readFileSync(path.join(REPO, 'src/cli-call.js'), 'utf8');
  const mut = src.replace('const timer = setTimeout(() => {\n      const phase', 'const timer = setTimeout(() => { return;\n      const phase');
  ok(mut !== src, '③ CONTROL setup: the mutant cuts the expiry');
  fs.writeFileSync(path.join(mutDir, 'data', 'bin', 'cli-call.js'), mut);
  fs.copyFileSync(path.join(REPO, 'data/bin/vibespace-task'), path.join(mutDir, 'data', 'bin', 'vibespace-task'));
  fs.copyFileSync(path.join(REPO, 'src/agent-cli-text.js'), path.join(mutDir, 'data', 'bin', 'agent-cli-text.js'));
  const h = await run(path.relative(REPO, path.join(mutDir, 'data', 'bin', 'vibespace-task')), ['progress', 'a summary', '--timeout', '0.4'], { VIBESPACE_API: SILENT }, 1200);
  ok(h.sig === 'SIGKILL' && h.code === null, `③ CONTROL: with the expiry cut the same call is still waiting at 3× its budget (the harness killed it at ${h.ms} ms) — the RED this suite exists for`, h);
}

// ── ④ the progress route: the answer never waits on the shared folder ──
console.log('④ the progress route answers after the store write; the folder copy follows, bounded');
const express = require('express');
const { setupAgentRoutes } = require(path.join(REPO, 'src/agent-routes.js'));
const routeHub = async (TaskStore, mirrorOpts) => {
  const dir = fs.mkdtempSync(path.join(tmp, 'hub-'));
  const ctx = path.join(dir, 'ctx'); fs.mkdirSync(ctx);
  const tasks = new TaskStore({ dataDir: dir, onChange: () => {}, ...mirrorOpts });
  const session = { agentToken: 'vsst_test', backend: 'claude', cwd: path.join(dir, 'work'), name: 't' };
  const activeSessions = new Map([['sess1', session]]);
  const app = express(); app.use(express.json());
  setupAgentRoutes({
    app, activeSessions, tasks,
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => null, setByAgent: () => ({ state: 'working' }) },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({ id: 'x', text: 'q' }) },
    sessionStatusKey: (s, id) => `claude:${id}`, serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null,
  });
  const g = tasks.create({ title: 'G', folders: [session.cwd], contextDir: ctx });
  const url = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => { servers.push(s); r('http://127.0.0.1:' + s.address().port); }); });
  return { tasks, g, ctx, url };
};
{
  const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
  let release = null; const asked = [];
  const slowFs = { call: (op) => { asked.push(op); return new Promise((r) => { const t = setTimeout(() => r(op === 'readText' ? null : { success: true }), 60000); t.unref(); release = () => { clearTimeout(t); r({ success: true }); }; }); } };
  const H = await routeHub(TaskGroupManager, { mirrorFs: () => slowFs, mirrorBoundMs: 400 });
  await H.tasks.mirrorIdle(50);
  const a = await run('data/bin/vibespace-task', ['progress', 'logged while the folder is slow', '--timeout', '5'], { VIBESPACE_API: H.url });
  const kept = (H.tasks.get(H.g.id).progress || []).map((p) => p.note);
  ok(a.code === 0 && /^progress recorded as \[P-[0-9a-f]+\]/.test(a.out) && kept.includes('logged while the folder is slow'), `④ the answer came after the STORE write while the folder write hangs — exit 0 INSIDE the CLI's own 5 s budget (else 124; ${a.ms} ms), the entry kept`, a);
  ok(asked.includes('mkdir') && !fs.existsSync(path.join(H.ctx, '.vibespace', 'TASK.md')), '④ the folder copy was asked for through the mirror fs, and has not landed (the fake holds it)', asked);
  await sleep(500);
  const st = H.tasks.mirrorStateOf(H.g.id);
  ok(st && st.behind === true && st.why === 'timeout', '④ past its own bound the mirror is BEHIND by name (a timeout), kept for a retry', st);
  const b = await run('data/bin/vibespace-task', ['progress', 'a second entry', '--timeout', '5'], { VIBESPACE_API: H.url });
  ok(b.code === 0 && /the shared folder copy \(\.vibespace\/TASK\.md\) is behind — its write has not returned yet; the entry above is recorded/.test(b.out), '④ the next answer SAYS the copy is behind (the CLI prints it under the receipt)', b.out);
  // the slow fs now answers: a later mirror pass lands the copy and the state clears
  const fast = { call: (op, p) => { if (op === 'mkdir') { fs.mkdirSync(p.path, { recursive: true }); return Promise.resolve({ success: true }); } if (op === 'readText') return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })); if (op === 'writeFile') { fs.writeFileSync(p.path, p.content); return Promise.resolve({ success: true }); } if (op === 'rename') { fs.renameSync(p.oldPath, p.newPath); return Promise.resolve({ success: true }); } return Promise.resolve(null); } };
  H.tasks._mirrorFs = () => fast;
  if (release) release();
  H.tasks.syncAllContextMd();
  await H.tasks.mirrorIdle(3000);
  const md = fs.existsSync(path.join(H.ctx, '.vibespace', 'TASK.md')) ? fs.readFileSync(path.join(H.ctx, '.vibespace', 'TASK.md'), 'utf8') : '';
  ok(/a second entry/.test(md) && /logged while the folder is slow/.test(md) && !(H.tasks.mirrorStateOf(H.g.id) || {}).behind, '④ once the folder answers, the copy lands with every entry and the state clears');
}
{
  // CONTROL: the BASE store (c8aa8820 — its _save wrote TASK.md on the caller's turn) with that write slowed by 1.2 s
  // (a stalled NFS write) holds the answer: the same CLI expires at its 0.6 s budget, exit 124
  // (the copy lives in a scratch dir, its requires bound to the real src/ — scripts/mutant-copy.mjs, never a file in src/)
  const shown = spawnSync('git', ['-C', REPO, 'show', 'c8aa8820:src/task-groups.js'], { encoding: 'utf8', env: gitEnvFrom(process.env), maxBuffer: 16 << 20 });
  if (shown.status !== 0 || !shown.stdout) console.log(`  SKIP ④ CONTROL: the base store c8aa8820 is not in this checkout (a depth-1 clone: ${String(shown.stderr || shown.error || '').trim().slice(0, 120)})`);
  else {
    const { TaskGroupManager: BaseStore } = mutantCopies('cli-call', REPO).load('src/task-groups.js', shown.stdout, 'base');
    const H = await routeHub(BaseStore, {});
    const realWrite = fs.writeFileSync;
    fs.writeFileSync = function (p, ...rest) { if (String(p).startsWith(H.ctx) && /TASK\.md/.test(String(p))) { const until = Date.now() + 1200; while (Date.now() < until) { /* the stalled mount */ } } return realWrite.call(this, p, ...rest); };
    try {
      const c = await run('data/bin/vibespace-task', ['progress', 'logged on the base store', '--timeout', '0.6'], { VIBESPACE_API: H.url });
      ok(c.code === 124 && /^vibespace-task: the hub did not answer in 0\.6 s/.test(c.err), '④ CONTROL: the base store held the answer on the folder write — the CLI expired, exit 124 (and before this lane: it waited)', c);
    } finally { fs.writeFileSync = realWrite; }
  }
}

for (const s of servers) { try { s.closeAllConnections?.(); s.close(); } catch { } }
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
