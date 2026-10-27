#!/usr/bin/env node
// CLAUDE'S MID-TURN QUEUE IS THE WRAPPER'S (lane claude-wrapper-queue, 2.369.354 — the owner, 2026-10-25: «可以 按照你推荐来»).
// The 2026-09-07 law «Stop means stop» did not hold on Claude: MEASURED on 2.1.308 the CLI RUNS a frame it had queued
// itself right after `control_request {subtype:'interrupt'}` (+27 ms). Since .354 data/bin/chat-wrapper.js HOLDS a frame
// that arrives while a turn runs, publishes it (queue_changed), forwards ONE per turn end, and on Stop drops it with ONE
// queue_dropped (the words go back into the composer) BEFORE the interrupt reaches the CLI. HEAVY (a real binary, a
// server, a browser):
//   §A THE REAL CLI behind the REAL wrapper, talking only to a LOCAL MOCK of POST /v1/messages — a scratch HOME, a
//      loopback ANTHROPIC_BASE_URL, a fake key, nonessential traffic off: no vendor request, nothing billed. Evidence-SKIP
//      without the binary ($VS_CLAUDE_BIN, `claude` on PATH, $HOME/.local/bin/claude):
//      ① Stop: the mid-turn frame never reaches the CLI (no request at the mock, nothing of it in the transcript), the
//        wrapper says queue_dropped with its words, and nothing runs after the interrupt
//      ② CONTROL: a copy of the wrapper with the hold switched off — the SAME frame RUNS right after the interrupt (the
//        vendor behaviour the hold exists for; red here means the CLI changed: measure again)
//      ③ the drain: held until the turn's `idle`, then ONE frame, run as a turn of its own (a plain user record in the
//        transcript, never the CLI's queue-operation enqueue at send time)
//      ④ a frame written in the SAME tick as the one that starts the turn (before the CLI has said a word) is held
//      ⑤ the VibeSpace keys on a frame (webui_msg_id) never reach the transcript — the CLI strips unknown keys
//      ⑥ a BACKGROUND AGENT: the turn that launched it ends in `result`, the session stays 'running' (no idle) until the
//        agent ends — a message typed meanwhile is NOT held behind it (the CLI takes it at once); CONTROL: a gate that
//        waited for idle holds it until the agent is done
//   §B THE CHAT WINDOW in a REAL browser: a worktree server (the working tree overlaid), a claude chat session whose CLI
//      is the stand-in (scripts/fixtures/claude-stand-in-cli.cjs — the measured turn shape), headless chrome: a message
//      HELD mid-turn (Alt+Enter since 2.369.361 — plain Enter hands it to the turn, scripts/test-claude-steer-chrome.mjs) ⇒
//      the queue strip's row with ✎, ✕ and ⚡ and the bubble's queued chip; Stop ⇒ the strip empties, the
//      words are back in the composer, ONE toast says so, the chip says removed — and the CLI never got them
// real-cli-env: the CLI's env is built from nothing — {HOME (a scratch dir), PATH, LANG, TERM, a LOOPBACK ANTHROPIC_BASE_URL, a fake key built by concatenation, the nonessential-traffic switches}; no ambient key can reach it
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, scratchDir, scratchHome, ONBOARDED_SOURCE, vncEnv, stopWrapper, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAND_IN = path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs');
let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1200) : '')); } return !!c; };
const skip = (name, why) => { skipped++; console.log(`  ○ SKIP ${name} — ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 40) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { } await sleep(step); } try { return !!(await fn()); } catch { return false; } };
const S = JSON.stringify;

// ── §A THE REAL CLI, A LOCAL MOCK ──
console.log('§A the real claude CLI behind the real wrapper, a local mock of the messages API (no vendor traffic)');
const claudeBin = (() => {
  const cands = [process.env.VS_CLAUDE_BIN, ...String(process.env.PATH || '').split(':').filter(Boolean).map((d) => path.join(d, 'claude')), path.join(process.env.HOME || '/nonexistent', '.local/bin/claude')].filter(Boolean);
  for (const c of cands) { try { const real = fs.realpathSync(c); if (fs.statSync(real).isFile() && fs.statSync(real).size > 10 * 1048576) return real; } catch { } }
  return null;
})();
/** The mock: a prompt whose LAST user message holds `LONG-` streams for `longMs`; `BG-START` answers with ONE background
 *  Agent tool call, whose own requests (`SUBAGENT-WORK`) stream for `longMs`; anything else answers at once. */
async function startMock(longMs) {
  const reqs = [];
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', (d) => { raw += d; });
    req.on('end', async () => {
      let body = null; try { body = JSON.parse(raw); } catch { }
      const msgs = Array.isArray(body?.messages) ? body.messages : [];
      const last = [...msgs].reverse().find((m) => m.role === 'user');
      const texts = !last ? [] : (typeof last.content === 'string' ? [last.content] : (last.content || []).filter((b) => b.type === 'text').map((b) => b.text));
      const marks = texts.join(' | ').match(/\b(?:LONG|MARK)-[A-Z0-9]+\b/g) || [];
      const isSub = /SUBAGENT-WORK/.test(S(msgs[0] || {})) && !/BG-START/.test(S(msgs[0] || {}));
      const lastHasToolResult = !!last && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result');
      reqs.push({ t: Date.now(), stream: !!body?.stream, marks, isSub });
      if (!/\/v1\/messages(\?|$)/.test(req.url) || req.method !== 'POST' || !body?.stream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(S({ id: 'msg_mock', type: 'message', role: 'assistant', model: body?.model || 'mock', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const ev = (type, data) => { try { res.write(`event: ${type}\ndata: ${S({ type, ...data })}\n\n`); } catch { } };
      ev('message_start', { message: { id: 'msg_mock_' + reqs.length, type: 'message', role: 'assistant', model: body.model || 'mock', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
      if (!isSub && texts.some((t) => /\bBG-START\b/.test(t)) && !lastHasToolResult) {
        ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_cwq_bg', name: 'Agent', input: {} } });
        ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: S({ description: 'background work', prompt: 'SUBAGENT-WORK do the long thing', subagent_type: 'general-purpose', run_in_background: true }) } });
        ev('content_block_stop', { index: 0 });
        ev('message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } });
        ev('message_stop', {});
        res.end();
        return;
      }
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      const long = isSub || texts.some((t) => /\bLONG-/.test(t));
      const chunks = long ? Math.max(1, Math.round(longMs / 300)) : 1;
      let closed = false; res.on('close', () => { closed = true; });
      for (let i = 0; i < chunks && !closed; i++) { ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'part-' + i + ' ' } }); if (long) await sleep(300); }
      if (closed) return;
      ev('content_block_stop', { index: 0 });
      ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: chunks } });
      ev('message_stop', {});
      res.end();
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, reqs, close: () => srv.close() };
}
const frame = (text, msgId) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, webui_msg_id: msgId });
/** One run: the wrapper at `wrapperPath` over the real CLI against a fresh mock; `script(ctl)` drives it. */
async function realRun(name, wrapperPath, longMs, script, extraArgs = []) {
  const dir = scratchDir(`cwq-${name}`);
  const home = path.join(dir, 'home'), work = path.join(dir, 'work');
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(work, { recursive: true });
  const mock = await startMock(longMs);
  const env = {
    HOME: home, PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', TERM: 'dumb',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${mock.port}`, ANTHROPIC_API_KEY: ['sk-ant-api03', 'MOCK', 'not-a-real-key-measurement-only'].join('-'),
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1', DISABLE_ERROR_REPORTING: '1', DISABLE_BUG_COMMAND: '1', CLAUDE_CODE_ENABLE_TELEMETRY: '0',
    CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1', // the product's chat spawn sets it (src/adapters/claude-code.js)
    VIBESPACE_SKIP_AGENT_HOOKS: '1',
  };
  const w = spawn(process.execPath, [wrapperPath, path.join(dir, 's.buf'), path.join(dir, 's.json'), claudeBin, '--model', 'claude-sonnet-4-5', ...extraArgs], { cwd: work, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const T0 = Date.now();
  const recs = []; let lb = '';
  w.stdout.setEncoding('utf8');
  w.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i); lb = lb.slice(i + 1); try { const r = JSON.parse(l); r.__t = Date.now(); recs.push(r); } catch { } } });
  const transcript = () => {
    const rows = [];
    const proj = path.join(home, '.claude', 'projects');
    try { for (const d of fs.readdirSync(proj)) for (const f of fs.readdirSync(path.join(proj, d))) if (f.endsWith('.jsonl')) rows.push(...fs.readFileSync(path.join(proj, d, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)); } catch { }
    return rows;
  };
  const reqFor = (mark) => mock.reqs.filter((r) => r.stream && r.marks.includes(mark));
  const idleAt = (after) => (recs.find((r) => r.type === 'system' && r.subtype === 'session_state_changed' && r.state === 'idle' && r.__t >= after) || {}).__t || null;
  const send = (o) => { w.stdin.write((typeof o === 'string' ? o : S(o)) + '\n'); return Date.now(); };
  try {
    await sleep(300);
    return await script({ send, recs, reqFor, idleAt, transcript, T0 });
  } finally {
    mock.close();
    await stopWrapper(w, { dir });
  }
}
if (!claudeBin) {
  skip('§A ①–⑤ the real CLI', 'no claude binary ($VS_CLAUDE_BIN, `claude` on PATH, $HOME/.local/bin/claude) — the stand-in legs in test-queue-putback §6 / test-queue-steer ⑯ still ran');
} else {
  const LANE = path.join(REPO, 'data/bin/chat-wrapper.js');
  // a copy of the wrapper with the HOLD switched off (every user frame forwarded at once — the pre-.354 behaviour)
  const ctlDir = scratchDir('cwq-ctl-tree');
  const cwSrc = fs.readFileSync(LANE, 'utf8');
  const HOLD = 'if (!(turnBusy || cliOwesTurn) || !opensTurn(o)) { forwardUser(line, o, buffered); return; }';   // the gate line (2.369.361 adds the CLI-owes-a-turn clause, lane claude-steer-inject)
  const ctlSrc = cwSrc.replace(HOLD, '{ forwardUser(line, o, buffered); return; }');
  fs.mkdirSync(path.join(ctlDir, 'data', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'src'), path.join(ctlDir, 'src'));
  fs.writeFileSync(path.join(ctlDir, 'data', 'bin', 'chat-wrapper.js'), ctlSrc);
  ok(cwSrc.split(HOLD).length === 2 && ctlSrc !== cwSrc, `the hold is ONE line in data/bin/chat-wrapper.js (the control switches exactly it off) — the CLI is ${path.basename(claudeBin)}`);
  const stopScript = async ({ send, recs, reqFor, transcript }) => {
    send(frame('LONG-A a long running turn', 'm-a'));
    await until(() => reqFor('LONG-A').length > 0, 30000);
    await sleep(1200);
    send(frame('MARK-B typed while A runs', 'm-b'));
    await sleep(1200);
    const stopAt = send({ type: 'control_request', request_id: 'cwq-stop-1', request: { subtype: 'interrupt' } });
    await sleep(3000); // the CLI's own queue ran the frame +27 ms after the interrupt (2.1.308) — 3 s is a hundredfold margin
    const b = reqFor('MARK-B')[0] || null;
    const tr = transcript();
    return { bRan: !!b, bAfterStopMs: b ? b.t - stopAt : null, bInTranscript: tr.some((r) => S(r).includes('MARK-B')), drop: recs.find((r) => r.type === 'queue_dropped') || null, kinds: recs.filter((r) => r.__t >= stopAt && r.type !== '_stdin_ack' && r.type !== 'stream_event').map((r) => r.type + (r.subtype ? '/' + r.subtype : '') + (r.state ? ':' + r.state : '')) };
  };
  const s1 = await realRun('stop', LANE, 15000, stopScript);
  ok(!s1.bRan && !s1.bInTranscript, '① Stop: the frame typed mid-turn NEVER reached the CLI — no request at the mock, nothing of it in the transcript', s1);
  ok(s1.drop && s1.drop.items.length === 1 && s1.drop.items[0].text === 'MARK-B typed while A runs' && s1.drop.items[0].msgId === 'm-b', '① …the wrapper said queue_dropped with its words and its bubble (they go back into the composer)', s1.drop);
  ok(!s1.kinds.some((k) => k === 'system/init'), '① …and NOTHING ran after the interrupt: no new turn started — no init (a frame the CLI queued itself starts with an init and NO state change)', s1.kinds);
  const s2 = await realRun('stop-ctl', path.join(ctlDir, 'data', 'bin', 'chat-wrapper.js'), 15000, stopScript);
  ok(s2.bRan && s2.bAfterStopMs !== null && s2.bAfterStopMs < 3000 && !s2.drop, `② CONTROL (the hold off): the CLI RUNS the frame it queued itself ${s2.bAfterStopMs} ms after the interrupt — what the hold exists for (if this goes red the CLI changed: measure again)`, s2);
  const s3 = await realRun('drain', LANE, 4000, async ({ send, recs, reqFor, idleAt, transcript }) => {
    const aAt = send(frame('LONG-A a long running turn', 'm-a'));
    await until(() => reqFor('LONG-A').length > 0, 30000);
    await sleep(800);
    send(frame('MARK-B the held second message', 'm-b'));
    await sleep(300);
    const heldDuringA = !reqFor('MARK-B').length && !transcript().some((r) => S(r).includes('MARK-B'));
    await until(() => reqFor('MARK-B').length > 0, 30000);
    await sleep(1500);
    const aIdle = idleAt(aAt);
    const b = reqFor('MARK-B')[0] || null;
    const tr = transcript();
    const enq = tr.filter((r) => r.type === 'queue-operation' && r.operation === 'enqueue').map((r) => Date.parse(r.timestamp));
    return { heldDuringA, aIdle, bAfterIdleMs: b && aIdle ? b.t - aIdle : null, bUserRecord: tr.some((r) => r.type === 'user' && S(r.message || {}).includes('MARK-B')), lastEnqueueAfterIdle: aIdle ? enq.some((t) => t >= aIdle - 50) : false, keyInTranscript: tr.some((r) => S(r).includes('webui_msg_id') || S(r).includes('m-b')) , qc: recs.filter((r) => r.type === 'queue_changed').map((r) => r.items.length) };
  });
  ok(s3.heldDuringA, '③ while A runs the held frame is nowhere in the CLI — no request, no transcript row (the CLI\'s own enqueue never happened)', s3);
  ok(s3.bAfterIdleMs !== null && s3.bAfterIdleMs >= 0 && s3.bAfterIdleMs < 5000 && s3.bUserRecord && s3.lastEnqueueAfterIdle, `③ …A's turn end releases it: ONE frame, at the mock ${s3.bAfterIdleMs} ms after A's idle, run as a turn of its own (a plain user record, enqueued only at the drain)`, s3);
  ok(S(s3.qc) === S([0, 1, 0]), '③ …and the strip saw it come and go: the baseline [], one row, [] at the drain', s3.qc);
  ok(!s3.keyInTranscript, '⑤ the frame\'s VibeSpace keys (webui_msg_id) never reach the transcript — the CLI strips unknown keys', s3);
  const s4 = await realRun('burst', LANE, 3000, async ({ send, recs, reqFor }) => {
    const at = send(frame('LONG-A the turn starter', 'm-a'));
    send(frame('MARK-B written in the same tick', 'm-b'));
    await until(() => reqFor('MARK-B').length > 0, 30000);
    const firstCli = recs.find((r) => r.type === 'system' && r.subtype === 'session_state_changed' && r.__t >= at);
    const held = recs.find((r) => r.type === 'queue_changed' && r.items.length === 1);
    return { heldAt: held ? held.__t - at : null, firstCliAt: firstCli ? firstCli.__t - at : null, order: reqFor('LONG-A').length && reqFor('MARK-B').length ? reqFor('MARK-B')[0].t > reqFor('LONG-A')[0].t : false };
  });
  // ⑥ a background agent — the lane wrapper, then a copy whose gate waits for idle (the CONTROL)
  const IDLE_ONLY = "else if (msg.type === 'result' || (idle && !awaitingStart)) {";
  const idleSrc = cwSrc.replace(IDLE_ONLY, "else if (idle && !awaitingStart) {");
  const idleDir = scratchDir('cwq-idle-tree');
  fs.mkdirSync(path.join(idleDir, 'data', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'src'), path.join(idleDir, 'src'));
  fs.writeFileSync(path.join(idleDir, 'data', 'bin', 'chat-wrapper.js'), idleSrc);
  const bgScript = async ({ send, recs, reqFor }) => {
    const at = send(frame('BG-START launch the background helper', 'm-a'));
    await until(() => recs.some((r) => r.type === 'result' && !r.parent_tool_use_id && r.__t >= at), 30000);
    await sleep(1200);
    const idleBefore = recs.some((r) => r.type === 'system' && r.subtype === 'session_state_changed' && r.state === 'idle' && r.__t >= at);
    const tB = send(frame('MARK-B typed while the background agent works', 'm-b'));
    await until(() => reqFor('MARK-B').length > 0, 30000);
    const b = reqFor('MARK-B')[0] || null;
    const idleAfter = recs.find((r) => r.type === 'system' && r.subtype === 'session_state_changed' && r.state === 'idle' && r.__t >= at) || null;
    return { idleBefore, bAfterSendMs: b ? b.t - tB : null, bBeforeIdle: !!(b && (!idleAfter || b.t < idleAfter.__t)), held: recs.some((r) => r.type === 'queued_input' && r.__t >= tB) };
  };
  const s5 = await realRun('bg-agent', LANE, 9000, bgScript, ['--permission-mode', 'bypassPermissions']);
  ok(idleSrc.split("else if (idle && !awaitingStart) {").length === 2 && !s5.idleBefore && s5.bAfterSendMs !== null && s5.bAfterSendMs < 3000 && s5.bBeforeIdle && !s5.held, `⑥ a background agent keeps the session running past the turn's result (no idle), and a message typed then reaches the CLI ${s5.bAfterSendMs} ms later, while the agent still works — never held behind it`, s5);
  const s6 = await realRun('bg-agent-ctl', path.join(idleDir, 'data', 'bin', 'chat-wrapper.js'), 9000, bgScript, ['--permission-mode', 'bypassPermissions']);
  ok(s6.held && s6.bAfterSendMs !== null && s6.bAfterSendMs > 4000, `⑥ CONTROL: a gate that waits for idle HOLDS that message until the background agent is done (${s6.bAfterSendMs} ms) — the leg above can say no`, s6);
  ok(s4.heldAt !== null && s4.firstCliAt !== null && s4.heldAt <= s4.firstCliAt && s4.order, `④ a frame written in the same tick as the turn's first one is HELD (published at +${s4.heldAt} ms, before the CLI's first record at +${s4.firstCliAt} ms) and runs after it — the wrapper opens the gate itself, there is no echo to race`, s4);
}

// ── §B THE CHAT WINDOW IN A REAL BROWSER ──
console.log('§B the chat window: a worktree server, a claude session on the stand-in CLI, headless chrome');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) skip('§B', 'no chrome/chromium');
else {
  const VNC_ENV = await vncEnv();
  const procs = new Set();
  const wt = scratch('cwq-wt');
  const cleanup = () => {
    for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
    try { endRootedProcesses(wt); } catch { }
    try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch { }
    try { fs.rmSync(wt, { recursive: true, force: true }); } catch { }
  };
  process.on('exit', cleanup);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
  const home = scratchHome('cwq-home', fs);
  const cwd = scratchDir('cwq-cwd');
  const cap = path.join(scratchDir('cwq-cap'), 'cli-got.jsonl');
  // the CLI the server spawns: answers the boot probes, else the stand-in (a 6 s turn for LONG- text)
  const launcher = path.join(scratchDir('cwq-bin'), 'claude');
  fs.writeFileSync(launcher, `#!/bin/sh\ncase "$1" in --version) echo "2.1.308 (Claude Code) stand-in"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac\nSTUB_CAPTURE=${JSON.stringify(cap)} STAND_IN_LONG_MS=6000 exec ${JSON.stringify(process.execPath)} ${JSON.stringify(STAND_IN)} "$@"\n`, { mode: 0o755 });
  // a throwaway worktree with the WORKING TREE overlaid (a pre-commit run tests what is about to ship) + its own bundle
  try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch { }
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: REPO, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${REPO}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
  const bv = path.join(wt, 'src/lib/build-version.js');
  if (!fs.existsSync(bv)) fs.writeFileSync(bv, `export const BUILD_VERSION = ${S(JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version)};\n`);
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
  const [PORT, CDP_PORT] = await freePorts(2);
  let journal = '';
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: home, CLAUDE_CMD: launcher, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal = (journal + d).slice(-8000); }); srv.stderr.on('data', (d) => { journal = (journal + d).slice(-8000); });
  const chromeDir = scratchDir('cwq-chrome');
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,950', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  const up = await until(async () => (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok, 60000, 250);
  ok(up, '§B the scratch server answered', journal.slice(-1200));
  // ONE live claude chat session through the real create path (the stand-in behind the real wrapper)
  const ctl = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const frames = []; ctl.on('message', (d) => { if (d.length > 65536) return; try { frames.push(JSON.parse(String(d))); } catch { } });
  await new Promise((r, e) => { ctl.on('open', r); ctl.on('error', e); });
  ctl.send(S({ type: 'create', backend: 'claude', mode: 'chat', cwd, reqId: 'c0', name: 'held queue', cols: 80, rows: 24 }));
  await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'c0'), 20000, 100);
  const created = frames.find((m) => m.type === 'created' && m.reqId === 'c0');
  ok(!!created, '§B a claude chat session was created (the stand-in CLI behind the real chat-wrapper)', S(frames.find((m) => m.reqId === 'c0') || frames.slice(-2)).slice(0, 400));
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
  const cdpWs = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => cdpWs.on('open', r));
  let seq = 0; const pend = new Map(); const pageErrors = [];
  cdpWs.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '?'); });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); cdpWs.send(S({ id, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(S(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}` });
  await until(() => ev('!!(window.app && window.app.ready)'), 30000, 250);
  await ev('window.app.ready.then(() => true)');
  const opened = created && await ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const app = window.app;
    const winId = app.attachSession(${S(created.sessionId)}, 'held queue', ${S(cwd)}, { mode: 'chat', backend: 'claude' }).id;
    let v = null;
    for (let i = 0; i < 100; i++) { v = app.sessions.get(winId); if (v && v._chatInput && !v._readOnly) break; await sleep(200); }
    window.__v = v;
    return { ok: !!(v && v._chatInput), ro: v ? !!v._readOnly : null };
  })()`);
  ok(opened && opened.ok && !opened.ro, '§B the chat window opened live with a composer', opened);
  // `alt` = Alt+Enter — since 2.369.361 (lane claude-steer-inject) plain Enter HANDS a mid-turn message to the running
  // turn and Alt+Enter is the door that HOLDS it (this section's subject: the held queue and Stop's put-back)
  const typeAndSend = async (text, { alt = false } = {}) => {
    await ev('(() => { const t = window.__v._chatInput._textarea; t.focus(); return document.activeElement === t; })()');
    await cdp('Input.insertText', { text });
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: alt ? 1 : 0, ...(alt ? {} : { text: '\r' }) });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: alt ? 1 : 0 });
  };
  const capTexts = () => (fs.existsSync(cap) ? fs.readFileSync(cap, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { const f = JSON.parse(l); return f.type === 'user' ? S(f.message.content) : f.type; } catch { return '?'; } }) : []);
  if (opened && opened.ok) {
    await typeAndSend('LONG-1 a turn that runs for a while');
    const streaming = await until(() => ev("!!document.querySelector('.chat-interrupt-btn')"), 10000, 100);
    ok(streaming && capTexts().some((t) => t.includes('LONG-1')), '§B the first message started a turn (the Stop button is up, the CLI got it)', capTexts());
    await typeAndSend('these words are held mid-turn', { alt: true });
    const STRIP = `(() => { const s = document.querySelector('.chat-queue-strip'); const rows = s ? [...s.querySelectorAll('[data-queue-id]')].map((b) => b.dataset.queueId) : []; return { visible: !!(s && !s.classList.contains('hidden') && s.getBoundingClientRect().height > 0), text: s ? s.textContent : '', edits: s ? s.querySelectorAll('[data-queue-op="edit"]').length : 0, removes: s ? s.querySelectorAll('[data-queue-op="remove"]').length : 0, steers: s ? s.querySelectorAll('[data-queue-op="steer"],[data-queue-op="steer-all"],[data-queue-op="run-now"],[data-queue-op="run-all"]').length : 0, ids: [...new Set(rows)] }; })()`;
    await until(async () => (await ev(STRIP)).visible, 8000, 100);
    const strip = await ev(STRIP);
    const chip = () => ev(`(() => { const m = (window.__v._messages || []).filter((x) => x.role === 'user').pop(); const el = m && document.querySelector('[data-msg-id="' + m.id + '"]'); return { state: m ? m.queueState || null : null, chipShown: !!(el && el.querySelector('[data-queue-state]')), text: m ? JSON.stringify(m.content).slice(0, 80) : '' }; })()`);
    const c1 = await chip();
    ok(strip.visible && /these words are held mid-turn/.test(strip.text) && strip.edits === 1 && strip.removes === 1 && strip.steers === 1, '§B HELD mid-turn (Alt+Enter, the hold door since 2.369.361) ⇒ the queue strip shows the row with ✎ edit, ✕ remove and ⚡ (steer — hand it to the running turn, lane claude-steer-inject; no run-now)', strip);
    ok(c1.state === 'queued' && c1.chipShown, '§B …and the bubble wears the queued chip', c1);
    ok(!capTexts().some((t) => t.includes('these words are held')), '§B …and the CLI never got it (the wrapper holds it)', capTexts());
    // STOP — a trusted click on the composer's Stop button
    const r = await ev(`(() => { const b = document.querySelector('.chat-interrupt-btn'); const x = b.getBoundingClientRect(); return { x: x.x + x.width / 2, y: x.y + x.height / 2 }; })()`);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await until(async () => /these words are held mid-turn/.test(await ev('window.__v._chatInput._textarea.value')), 8000, 100);
    await sleep(800);
    const after = await ev(`(() => ({ value: window.__v._chatInput._textarea.value, toasts: [...document.querySelectorAll('#global-toasts .global-toast')].map((t) => t.textContent) }))()`);
    const strip2 = await ev(STRIP);
    const c2 = await chip();
    ok(!strip2.visible && strip2.ids.length === 0, '§B Stop ⇒ the strip empties', strip2);
    ok(after.value.startsWith('these words are held mid-turn'), '§B …the words are back in the composer (the .353 put-back, now real on claude)', after.value);
    ok(after.toasts.filter((t) => /back into the input box/.test(t)).length === 1, '§B …ONE toast says so', after.toasts);
    ok(c2.state === 'removed', '§B …and the bubble\'s chip says removed (it never ran)', c2);
    await sleep(1500);
    ok(!capTexts().some((t) => t.includes('these words are held')) && capTexts().filter((t) => /^\[|^"/.test(t)).length === 1, '§B …and NOTHING ran after Stop: the CLI only ever got the first message (and the interrupt)', capTexts());
    ok(pageErrors.length === 0, '§B no page exceptions', pageErrors.slice(0, 3));
  }
  try { cdpWs.close(); } catch { }
  try { ctl.close(); } catch { }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skipped} skipped)` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
