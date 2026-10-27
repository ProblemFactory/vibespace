#!/usr/bin/env node
// A MESSAGE SENT WHILE A CLAUDE TURN RUNS — HANDED TO THE TURN OR HELD FOR ITS END (lane claude-steer-inject, 2.369.361 —
// the owner, 2026-10-27: «现在 claude 也是默认排队了吗？？ … 我没法插入啊», then ruling «A»: «Enter 立即送入，Alt+Enter 排队»).
// HEAVY (a real binary, a server, a browser). The fast half (the PURE door table, the composer's stamp / hold, the adapter,
// the chips, Stop's kept count) is scripts/test-claude-steer.mjs.
//   §0 THE REAL WRAPPER over the stand-in CLI (scripts/fixtures/claude-stand-in-cli.cjs — the R0 turn shape), its legs in
//      parallel: ① Enter mid-tool ⇒ the CLI gets it at once, it lands at the tool result (RED: the 6428c67e wrapper holds
//      it to the turn's end) · ② the ⚡ on a held row (RED: refused) · ③ «inject all» · ④ a command is held · ⑤ no tool
//      result left ⇒ its own turn, and a held frame waits behind it · ⑥ Stop with a frame the CLI still holds ⇒ its
//      follow-up turn is interrupted on its init, nothing answers (CONTROL: without it the CLI answers) · ⑦ a stamped frame
//      with no turn running is a plain send · ⑧ the hello names the steer door
//   §A THE REAL CLI behind the REAL wrapper, talking only to a LOCAL MOCK of POST /v1/messages (a scratch HOME, a
//      loopback ANTHROPIC_BASE_URL, a fake key built by concatenation, nonessential traffic off: no vendor request,
//      nothing billed — the R0 recording as a regression). Evidence-SKIP without the binary ($VS_CLAUDE_BIN, `claude` on
//      PATH, $HOME/.local/bin/claude):
//      ① a stamped frame written while a Bash runs reaches the model INSIDE the turn — the request after the tool result
//        carries «The user sent a new message while you were working: <text>»; the wrapper says handed → landed; ONE turn
//      ② Stop while the CLI still holds it: the CLI starts a turn for it, the wrapper interrupts that turn on its init —
//        no request reaches the model after Stop; the next message's request carries it (it stayed in the conversation)
//   §B THE CHAT WINDOW in a REAL browser (the runner's shape: DejaVu fontconfig, the page's CPU throttled ×$VS_CPU_THROTTLE
//      (default 4), trusted input, realClicker): a worktree server (the working tree overlaid), claude chat sessions on the
//      stand-in CLI (scripts/fixtures/claude-stand-in-cli.cjs — the R0 turn shape):
//      ① mid-turn ENTER ⇒ the CLI gets it at once (before the tool result), the bubble reads «Handed to the turn», then
//        «Steered» where it landed — never a strip row (RED on 6428c67e: the strip row «Queued», it runs after the turn)
//      ② the ⚡ on a held row ⇒ the CLI gets it, the row leaves the strip, it lands at the tool result
//      ③ CONTROL: Alt+Enter still holds — the strip row with ✎ ✕ ⚡, the CLI never got it
//      ④ CONTROL: a session spawned on the OLD wrapper (its hello names no steer): «Enter queues» alone — no Alt+Enter
//        segment, no hold button, no ⚡ on its row
//      ⑤ Stop with a handed message ⇒ ONE toast «1 message(s) you sent into the turn stay with it», the bubble reads
//        «Stays with the stopped turn», nothing answers it, the box stays empty
//      ⑥ ≤ 768 px: the hold button beside Send (the hint hidden), and it holds
// Shots: $VS_STEER_SHOTS (a dir) — the hint, the ⚡, an injected row, the phone face.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, scratchDir, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, runnerFontEnv, realClicker, stopWrapper } from './scratch.mjs';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAND_IN = path.join(REPO, 'scripts/fixtures/claude-stand-in-cli.cjs');
const BASE = '6428c67e';
let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1400) : '')); } return !!c; };
const skip = (name, why) => { skipped++; console.log(`  ○ SKIP ${name} — ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 40) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { } await sleep(step); } try { return !!(await fn()); } catch { return false; } };
const S = JSON.stringify;
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const ad = new ClaudeCodeAdapter({ buffersDir: os.tmpdir() });
const SHOTS = process.env.VS_STEER_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// ── §0 THE REAL WRAPPER over the stand-in CLI (moved from the fast suite: the fast tier's 910 s sum had 0.77 s left) ──
console.log('§0 the REAL chat-wrapper over the stand-in CLI (the R0 turn shape)');
const NEW = ['remove', 'steer', 'steer-all', 'reorder', 'edit'];
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-claude-steer-'));
/** A wrapper copy in a scratch tree (its src/ = this repo's: it requires only PURE src modules). */
function wrapperCopy(name, src) {
  const dir = path.join(scratchRoot, 'copy-' + name);
  fs.mkdirSync(path.join(dir, 'data', 'bin'), { recursive: true });
  fs.symlinkSync(path.join(REPO, 'src'), path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'data', 'bin', 'chat-wrapper.js'), src);
  return path.join(dir, 'data', 'bin', 'chat-wrapper.js');
}
let baseSrc = null;
try { baseSrc = execFileSync('git', ['-C', REPO, 'show', `${BASE}:data/bin/chat-wrapper.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { baseSrc = null; }
const BASE_WRAPPER = baseSrc ? wrapperCopy('base', baseSrc) : null;
const LANE_WRAPPER = path.join(REPO, 'data/bin/chat-wrapper.js');
async function boot(wrapperPath, label, { toolMs = 1500 } = {}) {
  const dir = fs.mkdtempSync(path.join(scratchRoot, label + '-'));
  const cap = path.join(dir, 'cli-got.jsonl'), dlv = path.join(dir, 'delivered.jsonl');
  const w = spawn(process.execPath, [wrapperPath, path.join(dir, 's.buf'), path.join(dir, 's.json'), process.execPath, STAND_IN], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, STUB_CAPTURE: cap, STAND_IN_DELIVERED: dlv, STAND_IN_LONG_MS: String(toolMs), VIBESPACE_SKIP_AGENT_HOOKS: '1' } });
  const recs = []; let lb = '';
  w.stdout.setEncoding('utf8');
  w.stdout.on('data', (d) => { lb += d; let i; while ((i = lb.indexOf('\n')) >= 0) { const l = lb.slice(0, i); lb = lb.slice(i + 1); try { const r = JSON.parse(l); r.__at = Date.now(); recs.push(r); } catch { } } });
  const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : []);
  const h = {
    dir, recs,
    got: () => lines(cap), delivered: () => lines(dlv),
    write: (line) => w.stdin.write(line + '\n'),
    say: (text, msgId, opts) => w.stdin.write(ad.formatChatInput(text, msgId, opts).stdinPayload + '\n'),
    of: (type) => recs.filter((r) => r.type === type && r.type !== '_stdin_ack'),
    hand: (state) => recs.filter((r) => r.type === 'input_handover' && (!state || r.state === state)),
    results: () => recs.filter((r) => r.type === 'result').length,
    toolUse: () => recs.some((r) => r.type === 'assistant' && JSON.stringify(r.message?.content || []).includes('"tool_use"')),
    held: (msgId) => recs.some((r) => r.type === 'queue_changed' && (r.items || []).some((it) => it.msgId === msgId)),
    queueItems: () => { const q = recs.filter((r) => r.type === 'queue_changed'); return q.length ? q[q.length - 1].items || [] : []; },
    idx: (pred) => recs.findIndex(pred),
    meta: () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 's.json'), 'utf8')); } catch { return null; } },
    // the wrapper is stopped (SIGTERM, its exit awaited) before its dir goes — §55
    kill: () => stopWrapper(w, { dir }),
  };
  await until(() => fs.existsSync(path.join(dir, 's.json')));
  return h;
}
const isToolResult = (r) => r.type === 'user' && Array.isArray(r.message?.content) && r.message.content.some((b) => b.type === 'tool_result');
const said = (h, re) => h.recs.some((r) => r.type === 'assistant' && re.test(JSON.stringify(r.message?.content || [])));

/** ① Enter mid-tool. */
async function legEnter(wp, label) {
  const h = await boot(wp, label);
  h.say('TOOL-A run the slow command', 'm-a', { steer: true });   // ⑦ a stamped frame with no turn running = a plain send
  await until(h.toolUse);
  h.say('B handed while the tool runs', 'm-b', { steer: true });
  await until(() => h.results() >= (label.startsWith('base') ? 2 : 1), 12000);
  await sleep(300);
  const out = {
    aPlain: !h.hand().some((r) => (r.msg_ids || []).includes('m-a')),
    tookAtToolResult: h.delivered().some((d) => d.how === 'tool_result' && d.text === 'B handed while the tool runs'),
    ownTurns: h.delivered().filter((d) => d.how === 'turn').map((d) => d.text),
    held: h.held('m-b'),
    iHanded: h.idx((r) => r.type === 'input_handover' && r.state === 'handed' && (r.msg_ids || []).includes('m-b')),
    iTool: h.idx(isToolResult),
    iLanded: h.idx((r) => r.type === 'input_handover' && r.state === 'landed' && (r.msg_ids || []).includes('m-b')),
    iResult: h.idx((r) => r.type === 'result'),
    answered: said(h, /took in: B handed while the tool runs/),
    results: h.results(),
  };
  await h.kill();
  return out;
}
/** ② the ⚡ on a held row (and ③ «inject all»). */
async function legSteerHeld(wp, label, { all = false } = {}) {
  const h = await boot(wp, label, { toolMs: 2000 });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse);
  h.say('B held behind the turn', 'm-b');
  if (all) h.say('C held behind it', 'm-c');
  await until(() => h.held('m-b') && (!all || h.held('m-c')), 4000);
  const q = h.queueItems();
  // the WIRE frame the wrapper reads (the adapter's own spelling is §3's) — so an older wrapper's own answer is what is judged
  h.write(S(all ? { type: 'queue-op', op: 'steer-all', id: null } : { type: 'queue-op', op: 'steer', id: (q.find((it) => it.msgId === 'm-b') || {}).id }));
  await until(() => h.results() >= 1, 12000);
  await sleep(300);
  const out = {
    heldFirst: q.map((it) => it.msgId),
    opResults: h.of('queue_op_result').map((r) => `${r.op}:${r.ok}${r.reason ? ':' + r.reason : ''}`),
    handedVia: h.hand('handed').map((r) => `${(r.msg_ids || []).join(',')}@${r.via}`),
    landed: h.hand('landed').flatMap((r) => r.msg_ids || []),
    tookAtToolResult: h.delivered().filter((d) => d.how === 'tool_result').map((d) => d.text),
    emptied: h.queueItems().length === 0,
  };
  await h.kill();
  return out;
}
/** ④ a slash command stamped mid-turn is held (a command never joins a turn), and the ⚡ on it says why. */
async function legCommand(wp) {
  const h = await boot(wp, 'command', { toolMs: 1500 });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse);
  h.say('/cost', 'm-cmd', { steer: true });
  await until(() => h.held('m-cmd'), 4000);
  const id = (h.queueItems().find((it) => it.msgId === 'm-cmd') || {}).id;
  h.write(S({ type: 'queue-op', op: 'steer', id }));
  await until(() => h.of('queue_op_result').length >= 1, 4000);
  const out = { held: h.held('m-cmd'), handed: h.hand().length, refusal: h.of('queue_op_result').map((r) => `${r.ok}:${r.reason}:${r.detail}`), stillHeld: h.queueItems().some((it) => it.msgId === 'm-cmd') };
  await h.kill();
  return out;
}
/** ⑤ no tool result left: the CLI runs the handed frame as a turn of its own; a frame held behind it waits for that turn. */
async function legOwnTurn(wp) {
  const h = await boot(wp, 'ownturn', { toolMs: 1200 });
  h.say('LONG-A a long text answer, no tool', 'm-a');
  await until(() => h.recs.some((r) => r.type === 'system' && r.subtype === 'init'));
  await sleep(150);
  h.say('B handed with no tool result left', 'm-b', { steer: true });
  await sleep(100);
  h.say('C held behind the turn', 'm-c');
  await until(() => h.results() >= 3, 15000);
  await sleep(200);
  const turns = h.delivered().filter((d) => d.how === 'turn').map((d) => d.text);
  const out = {
    handed: h.hand('handed').flatMap((r) => r.msg_ids || []), own: h.hand('own-turn').flatMap((r) => r.msg_ids || []), landed: h.hand('landed').flatMap((r) => r.msg_ids || []),
    turns,
    // the held frame reached the CLI only AFTER the result of B's own turn (never inside it)
    cAfterB: (() => { const got = h.got().filter((f) => f.type === 'user').map((f) => JSON.stringify(f)); return got.findIndex((g) => g.includes('C held')) > got.findIndex((g) => g.includes('B handed')); })(),
    cRanOwn: turns[2] === 'C held behind the turn',
  };
  await h.kill();
  return out;
}
/** ⑥ Stop while the CLI still holds a handed frame (its tool is running): nothing may answer it after Stop. */
async function legStop(wp, label, { withHeld = false } = {}) {
  const h = await boot(wp, label, { toolMs: 4000 });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse);
  h.say('B handed, then Stop', 'm-b', { steer: true });
  if (withHeld) h.say('C held, then Stop', 'm-c');
  await until(() => h.hand('handed').length >= 1 && (!withHeld || h.held('m-c')), 4000);
  h.write(ad.formatInterrupt());
  await until(() => h.results() >= 2, 6000);
  await sleep(900);   // the stand-in's follow-up turn answers 300 ms in — anything that would answer B has by now
  const drop = h.of('queue_dropped');
  const out = {
    drop: drop.map((d) => ({ items: (d.items || []).map((it) => it.msgId), kept: d.kept || 0 })),
    followInterrupt: h.got().filter((f) => f.type === 'control_request' && /^vs-stop-follow-/.test(f.request_id || '')).length,
    kept: h.hand('kept').flatMap((r) => r.msg_ids || []),
    answeredB: said(h, /reply: B handed, then Stop/),
    cReached: h.got().some((f) => f.type === 'user' && JSON.stringify(f).includes('C held, then Stop')),
    results: h.results(),
  };
  await h.kill();
  return out;
}

const followMutant = wrapperCopy('no-follow-interrupt', fs.readFileSync(LANE_WRAPPER, 'utf8').replace("sendChild(JSON.stringify({ type: 'control_request', request_id: `vs-stop-follow-", "void (JSON.stringify({ type: 'control_request', request_id: `vs-stop-follow-"));
const leg = (p) => p.catch((e) => ({ threw: String(e && e.message || e) }));
const [enter, enterBase, steer1, steer1Base, steerAll, cmd, own, stop, stopCtl, stopHeld, advert] = await Promise.all([
  leg(legEnter(LANE_WRAPPER, 'enter')),
  BASE_WRAPPER ? leg(legEnter(BASE_WRAPPER, 'base-enter')) : null,
  leg(legSteerHeld(LANE_WRAPPER, 'steer')),
  BASE_WRAPPER ? leg(legSteerHeld(BASE_WRAPPER, 'base-steer')) : null,
  leg(legSteerHeld(LANE_WRAPPER, 'steer-all', { all: true })),
  leg(legCommand(LANE_WRAPPER)),
  leg(legOwnTurn(LANE_WRAPPER)),
  leg(legStop(LANE_WRAPPER, 'stop')),
  leg(legStop(followMutant, 'stop-ctl')),
  leg(legStop(LANE_WRAPPER, 'stop-held', { withHeld: true })),
  leg((async () => { const h = await boot(LANE_WRAPPER, 'advert'); await until(() => h.of('queue_changed').length >= 1, 3000); const out = { sidecar: h.meta()?.caps?.queueVerbs, inBand: h.of('queue_changed')[0]?.verbs }; await h.kill(); return out; })()),

]);
ok(enter.aPlain, '⑦ a stamped frame with NO turn running is a plain send (no hand-over record — it opens the turn)', enter);
ok(enter.iHanded >= 0 && enter.iHanded < enter.iTool && !enter.held, '① Enter mid-tool: the wrapper writes the frame to the CLI AT ONCE (input_handover handed, before the tool result) — never held', enter);
ok(enter.tookAtToolResult && enter.answered && enter.results === 1 && S(enter.ownTurns) === S(['TOOL-A run the slow command']), '① …the CLI took it INTO THE RUNNING TURN at the tool result and answered it there — one turn, never a turn of its own', enter);
ok(enter.iLanded > enter.iTool && enter.iLanded < enter.iResult, '① …and the wrapper says it LANDED (after the tool result that carried it, before the turn\'s result)', enter);
if (enterBase) ok(enterBase.held && !enterBase.tookAtToolResult && S(enterBase.ownTurns) === S(['TOOL-A run the slow command', 'B handed while the tool runs']) && enterBase.iHanded < 0, `① RED on ${BASE}: the same Enter is HELD (queued) and runs as its own turn after the turn ends — the owner's «我没法插入»`, enterBase);
else console.log(`  ○ SKIP ①/② RED legs — ${BASE} is not in this checkout (a depth-1 clone: git show ${BASE}:data/bin/chat-wrapper.js failed); the lane legs above still ran`);
ok(S(steer1.heldFirst) === S(['m-b']) && S(steer1.opResults) === S(['steer:true']) && S(steer1.handedVia) === S(['m-b@steer']) && S(steer1.landed) === S(['m-b']) && S(steer1.tookAtToolResult) === S(['B held behind the turn']) && steer1.emptied, '② the ⚡ on a HELD row: steer ok → handed (via steer) → it leaves the strip → it lands at the tool result', steer1);
if (steer1Base) ok(S(steer1Base.opResults) === S(['steer:false:not-steerable']) && !steer1Base.tookAtToolResult.length, `② RED on ${BASE}: the wrapper refused the ⚡ («Claude Code takes no input into a running turn»)`, steer1Base);
ok(S(steerAll.heldFirst) === S(['m-b', 'm-c']) && S(steerAll.opResults) === S(['steer-all:true', 'steer-all:true']) && S(steerAll.tookAtToolResult) === S(['B held behind the turn', 'C held behind it']) && steerAll.emptied, '③ «inject all»: every held row, in queue order, each its own frame — both land at the tool result', steerAll);
ok(cmd.held && cmd.handed === 0 && /^false:not-steerable:a command runs between turns/.test(cmd.refusal[0] || '') && cmd.stillHeld, '④ a slash command is HELD even on Enter (the CLI runs a command between turns), and the ⚡ on it says so — it stays held', cmd);
ok(S(own.handed) === S(['m-b']) && S(own.own) === S(['m-b']) && !own.landed.length, '⑤ no tool result left: the turn ended first — the wrapper says own-turn (never «landed»)', own);
ok(S(own.turns) === S(['LONG-A a long text answer, no tool', 'B handed with no tool result left', 'C held behind the turn']) && own.cAfterB && own.cRanOwn, '⑤ …the CLI ran it as a turn of its own right after, and the HELD frame waited for THAT turn to end (never cut in)', own);
ok(S(stop.drop) === S([{ items: [], kept: 1 }]), '⑥ Stop with a handed frame: ONE queue_dropped that puts nothing back and counts it — «1 message you sent into the turn stays with it»', stop);
ok(stop.followInterrupt === 1 && S(stop.kept) === S(['m-b']) && !stop.answeredB, '⑥ the CLI started a turn for the frame it still held — the wrapper interrupted it on its init: NOTHING answers after Stop (the 2026-09-07 law), the frame stays in the conversation', stop);
ok(stopCtl.followInterrupt === 0 && stopCtl.answeredB, '⑥ CONTROL: a wrapper copy without that second interrupt — the CLI ANSWERS the frame after Stop (the measured 2.1.308 behaviour; the leg above can say no)', stopCtl);
ok(S(stopHeld.drop) === S([{ items: ['m-c'], kept: 1 }]) && !stopHeld.cReached && !stopHeld.answeredB, '⑥ Stop with BOTH: the held one comes back into the box (the .354 rule), the handed one stays with the turn — one record says both', stopHeld);
ok(S(advert.sidecar) === S(NEW) && S(advert.inBand) === S(NEW), '⑧ the hello names the steer door: the sidecar caps AND every queue_changed say [remove, steer, steer-all, reorder, edit] (a .354 wrapper names no steer — its sessions stay queue-only)', advert);

try { fs.rmSync(scratchRoot, { recursive: true, force: true }); } catch { }

// ── §A THE REAL CLI, A LOCAL MOCK ──
console.log('§A the real claude CLI behind the real wrapper, a local mock of the messages API (no vendor traffic)');
const claudeBin = (() => {
  const cands = [process.env.VS_CLAUDE_BIN, ...String(process.env.PATH || '').split(':').filter(Boolean).map((d) => path.join(d, 'claude')), path.join(process.env.HOME || '/nonexistent', '.local/bin/claude')].filter(Boolean);
  for (const c of cands) { try { const real = fs.realpathSync(c); if (fs.statSync(real).isFile() && fs.statSync(real).size > 10 * 1048576) return real; } catch { } }
  return null;
})();
/** The mock (R0's): a main-loop request (its tools name Bash) whose last user message holds `TOOL-<n>S` answers ONE Bash
 *  `sleep <n>`; one that carries a tool_result answers text; anything else answers text at once. Every main request is
 *  logged with the FLAT text of its last user message (tool_result content included) and every mark in the request. */
async function startMock() {
  const reqs = [];
  const flat = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b.type === 'text' ? b.text : b.type === 'tool_result' ? flat(b.content) : '')).join(' | ') : '');
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      let body = null; try { body = JSON.parse(raw); } catch { }
      const msgs = Array.isArray(body?.messages) ? body.messages : [];
      const last = [...msgs].reverse().find((m) => m.role === 'user');
      const lastText = last ? flat(last.content) : '';
      const main = Array.isArray(body?.tools) && body.tools.some((t) => t && t.name === 'Bash');
      const hasTool = !!last && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result');
      if (main) reqs.push({ t: Date.now(), lastText, hasTool, all: S(msgs).match(/\bMARK-[A-Z0-9]+\b/g) || [] });
      if (!/\/v1\/messages(\?|$)/.test(req.url) || req.method !== 'POST' || !body?.stream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(S({ id: 'msg_mock', type: 'message', role: 'assistant', model: body?.model || 'mock', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const ev = (type, data) => { try { res.write(`event: ${type}\ndata: ${S({ type, ...data })}\n\n`); } catch { } };
      ev('message_start', { message: { id: 'msg_mock_' + reqs.length, type: 'message', role: 'assistant', model: body.model || 'mock', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
      const tool = main && !hasTool && lastText.match(/\bTOOL-(\d+)S\b/);
      if (tool) {
        ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_steer_' + reqs.length, name: 'Bash', input: {} } });
        ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: S({ command: `sleep ${tool[1]}`, description: `Sleep ${tool[1]} seconds` }) } });
        ev('content_block_stop', { index: 0 });
        ev('message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } });
      } else {
        ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: (hasTool ? 'done after the tool ' : 'reply ') + (lastText.match(/\bMARK-[A-Z0-9]+\b/g) || []).join(',') } });
        ev('content_block_stop', { index: 0 });
        ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } });
      }
      ev('message_stop', {});
      res.end();
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, reqs, close: () => srv.close() };
}
const cliEnv = (home, port) => ({
  HOME: home, PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', TERM: 'dumb',
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`, ANTHROPIC_API_KEY: ['sk-ant-api03', 'MOCK', 'not-a-real-key-measurement-only'].join('-'),
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1', DISABLE_ERROR_REPORTING: '1', DISABLE_BUG_COMMAND: '1', CLAUDE_CODE_ENABLE_TELEMETRY: '0',
  CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1', VIBESPACE_SKIP_AGENT_HOOKS: '1',
});
async function realWrapper(label) {
  const mock = await startMock();
  const dir = scratchDir('cst-real-' + label);
  const home = path.join(dir, 'home'), work = path.join(dir, 'work');
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(work, { recursive: true });
  const w = spawn(process.execPath, [path.join(REPO, 'data/bin/chat-wrapper.js'), path.join(dir, 's.buf'), path.join(dir, 's.json'), claudeBin, '--model', 'claude-sonnet-4-5'], { cwd: work, env: cliEnv(home, mock.port), stdio: ['pipe', 'pipe', 'pipe'] });
  const recs = []; let lb = '';
  w.stdout.setEncoding('utf8');
  w.stdout.on('data', (d) => {
    lb += d; let i;
    while ((i = lb.indexOf('\n')) >= 0) {
      const l = lb.slice(0, i); lb = lb.slice(i + 1); let r; try { r = JSON.parse(l); } catch { continue; }
      recs.push(r);
      // the product answers a permission ask over stdio: allow the one Bash the mock asked for
      if (r.type === 'control_request' && r.request?.subtype === 'can_use_tool') w.stdin.write(S({ type: 'control_response', response: { subtype: 'success', request_id: r.request_id, response: { behavior: 'allow', updatedInput: r.request.input } } }) + '\n');
    }
  });
  await sleep(500);
  return {
    recs, mock, w,
    say: (text, msgId, opts) => w.stdin.write(ad.formatChatInput(text, msgId, opts).stdinPayload + '\n'),
    stop: () => w.stdin.write(ad.formatInterrupt() + '\n'),
    hand: (state) => recs.filter((r) => r.type === 'input_handover' && r.state === state).flatMap((r) => r.msg_ids || []),
    results: () => recs.filter((r) => r.type === 'result').length,
    toolUse: () => recs.some((r) => r.type === 'assistant' && S(r.message?.content || []).includes('"tool_use"')),
    end: () => { try { w.kill('SIGKILL'); } catch { } mock.close(); },
  };
}
if (!claudeBin) skip('§A', 'no claude binary ($VS_CLAUDE_BIN, PATH, ~/.local/bin/claude) — the stand-in legs below still run');
else {
  console.log(`  (claude ${(() => { try { return execFileSync(claudeBin, ['--version'], { encoding: 'utf8', timeout: 20000, env: { HOME: os.tmpdir(), PATH: '/usr/bin:/bin' } }).trim(); } catch { return '?'; } })()})`);
  const [lands, stops] = await Promise.all([
    (async () => {
      const r = await realWrapper('lands');
      r.say('TOOL-6S run a slow command', 'm-a');
      await until(r.toolUse, 30000);
      await sleep(1500);
      r.say('MARK-B handed while the Bash runs', 'm-b', { steer: true });
      await until(() => r.results() >= 1, 30000);
      await sleep(800);
      const after = r.mock.reqs.filter((q) => q.hasTool);
      const out = { handed: r.hand('handed'), landed: r.hand('landed'), results: r.results(), afterTool: after.map((q) => q.lastText.slice(0, 400)), reqs: r.mock.reqs.length };
      r.end(); return out;
    })(),
    (async () => {
      const r = await realWrapper('stop');
      r.say('TOOL-8S run a slow command', 'm-a');
      await until(r.toolUse, 30000);
      await sleep(1500);
      r.say('MARK-B handed then Stop', 'm-b', { steer: true });
      await sleep(1500);
      const reqsAtStop = r.mock.reqs.length;
      r.stop();
      await until(() => r.results() >= 2, 15000);
      await sleep(2500);
      const reqsAfterStop = r.mock.reqs.length - reqsAtStop;
      const follow = r.recs.filter((x) => x.type === 'control_response' && /^vs-stop-follow-/.test(x.response?.request_id || '')).length;
      const kept = r.hand('kept');
      const drop = r.recs.filter((x) => x.type === 'queue_dropped').map((d) => ({ items: (d.items || []).length, kept: d.kept || 0 }));
      r.say('MARK-D the next message after Stop', 'm-d');
      await until(() => r.mock.reqs.length > reqsAtStop + reqsAfterStop, 20000);
      await sleep(500);
      const next = r.mock.reqs[r.mock.reqs.length - 1];
      const out = { reqsAfterStop, follow, kept, drop, nextCarries: next ? next.all : null };
      r.end(); return out;
    })(),
  ]);
  ok(lands.afterTool.length === 1 && /The user sent a new message while you were working:\s*MARK-B handed while the Bash runs/.test(lands.afterTool[0]) && lands.results === 1, '§A ① the REAL CLI took the stamped frame INTO THE RUNNING TURN: the request after the tool result carries «The user sent a new message while you were working: …» — one turn', lands);
  ok(S(lands.handed) === S(['m-b']) && S(lands.landed) === S(['m-b']), '§A ① …and the wrapper said handed → landed', lands);
  ok(stops.follow === 1 && S(stops.kept) === S(['m-b']) && stops.reqsAfterStop === 0, '§A ② Stop while the CLI held it: the CLI started a turn for it, the wrapper interrupted it on its init — NO request reached the model after Stop', stops);
  ok(S(stops.drop) === S([{ items: 0, kept: 1 }]), '§A ② …ONE queue_dropped that puts nothing back and counts the handed frame (the toast\'s «stays with the turn»)', stops);
  ok(Array.isArray(stops.nextCarries) && stops.nextCarries.includes('MARK-B') && stops.nextCarries.includes('MARK-D'), '§A ② …and it stayed in the conversation: the next message\'s request carries it too', stops);
}

// ── §B THE CHAT WINDOW IN A REAL BROWSER ──
console.log('§B the chat window: a worktree server, claude sessions on the stand-in CLI, headless chrome (the runner\'s shape)');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let baseWrapperSrc = null;
try { baseWrapperSrc = execFileSync('git', ['-C', REPO, 'show', `${BASE}:data/bin/chat-wrapper.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { }
if (!CHROME) skip('§B', 'no chrome/chromium');
else {
  const VNC_ENV = await vncEnv();
  const procs = new Set();
  const wt = scratch('cst-wt');
  const cleanup = () => {
    for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
    try { endRootedProcesses(wt); } catch { }
    try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch { }
    try { fs.rmSync(wt, { recursive: true, force: true }); } catch { }
  };
  process.on('exit', cleanup);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
  const home = scratchHome('cst-home', fs);
  const cwd = scratchDir('cst-cwd');
  const capDir = scratchDir('cst-cap');
  const cap = path.join(capDir, 'cli-got.jsonl'), dlv = path.join(capDir, 'delivered.jsonl');
  // the CLI the server spawns: answers the boot probes, else the stand-in (a TOOL- turn's Bash works 6 s)
  const launcher = path.join(scratchDir('cst-bin'), 'claude');
  fs.writeFileSync(launcher, `#!/bin/sh\ncase "$1" in --version) echo "2.1.308 (Claude Code) stand-in"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac\nSTUB_CAPTURE=${S(cap)} STAND_IN_DELIVERED=${S(dlv)} STAND_IN_LONG_MS=6000 exec ${S(process.execPath)} ${S(STAND_IN)} "$@"\n`, { mode: 0o755 });
  try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch { }
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: REPO, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${REPO}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
  const bv = path.join(wt, 'src/lib/build-version.js');
  if (!fs.existsSync(bv)) fs.writeFileSync(bv, `export const BUILD_VERSION = ${S(JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version)};\n`);
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
  const laneWrapperSrc = fs.readFileSync(path.join(wt, 'data/bin/chat-wrapper.js'), 'utf8');
  const [PORT, CDP_PORT] = await freePorts(2);
  let journal = '';
  const { DBUS_SESSION_BUS_ADDRESS: _bus, ...envNoBus } = process.env;   // a scratch server never reaches the desktop bus
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: ['ignore', 'pipe', 'pipe'], env: { ...envNoBus, ...VNC_ENV, PORT: String(PORT), HOME: home, CLAUDE_CMD: launcher, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal = (journal + d).slice(-8000); }); srv.stderr.on('data', (d) => { journal = (journal + d).slice(-8000); });
  const chromeDir = scratchDir('cst-chrome');
  const fontEnv = runnerFontEnv(scratchDir('cst-fonts'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,950', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: { ...envNoBus, ...fontEnv } });
  procs.add(chrome);
  const up = await until(async () => (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok, 60000, 250);
  ok(up, '§B the scratch server answered', journal.slice(-1200));
  const ctl = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const frames = []; ctl.on('message', (d) => { if (d.length > 65536) return; try { frames.push(JSON.parse(String(d))); } catch { } });
  await new Promise((r, e) => { ctl.on('open', r); ctl.on('error', e); });
  const create = async (reqId, name) => {
    ctl.send(S({ type: 'create', backend: 'claude', mode: 'chat', cwd, reqId, name, cols: 80, rows: 24 }));
    await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === reqId), 20000, 100);
    return frames.find((m) => m.type === 'created' && m.reqId === reqId) || null;
  };
  const s1 = await create('c1', 'steer new');
  // ④'s session: spawned while the tree still had the OLD wrapper (a session that predates the update) — then the new one
  // goes back in place; a wrapper process runs the code it started with for the rest of its life
  let s2 = null;
  const sidecarVerbs = () => { const d = path.join(wt, 'data', 'session-buffers'); try { return fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => { try { return S(JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')).caps?.queueVerbs || null); } catch { return null; } }); } catch { return []; } };
  if (baseWrapperSrc) {
    await until(() => sidecarVerbs().includes(S(['remove', 'steer', 'steer-all', 'reorder', 'edit'])), 15000, 100);   // s1's wrapper is up
    fs.writeFileSync(path.join(wt, 'data/bin/chat-wrapper.js'), baseWrapperSrc);
    s2 = await create('c2', 'steer old wrapper');
    // the old process has loaded its code once its sidecar says so — only then does the new file go back
    await until(() => sidecarVerbs().includes(S(['remove', 'reorder', 'edit'])), 15000, 100);
    fs.writeFileSync(path.join(wt, 'data/bin/chat-wrapper.js'), laneWrapperSrc);
  }
  ok(!!s1 && (!baseWrapperSrc || !!s2), '§B two claude chat sessions: one on this wrapper, one on the 6428c67e wrapper (④)', S(frames.filter((m) => m.reqId === 'c1' || m.reqId === 'c2')).slice(0, 400));
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
  const cdpWs = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => cdpWs.on('open', r));
  let seq = 0; const pend = new Map(); const pageErrors = [];
  cdpWs.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '?'); });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); cdpWs.send(S({ id, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(S(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  const realClick = realClicker({ evalJs: ev, cdp });
  const shot = async (name) => { if (!SHOTS) return; const r = await cdp('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const THROTTLE = Number(process.env.VS_CPU_THROTTLE) || 4;
  await cdp('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  console.log(`  (the page's CPU throttled ×${THROTTLE} — VS_CPU_THROTTLE; Chrome under the runner's DejaVu fontconfig)`);
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}` });
  await until(() => ev('!!(window.app && window.app.ready)'), 45000, 250);
  await ev('window.app.ready.then(() => true)');
  const open = async (created, key, name) => created && ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const winId = window.app.attachSession(${S(created.sessionId)}, ${S(name)}, ${S(cwd)}, { mode: 'chat', backend: 'claude' }).id;
    let v = null;
    for (let i = 0; i < 150; i++) { v = window.app.sessions.get(winId); if (v && v._chatInput && !v._readOnly) break; await sleep(200); }
    if (v) { window[${S('__' + key)}] = v; v._container.dataset.steerLeg = ${S(key)}; }
    return { ok: !!(v && v._chatInput), ro: v ? !!v._readOnly : null };
  })()`);
  const capFrames = () => (fs.existsSync(cap) ? fs.readFileSync(cap, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : []);
  const cliGot = (t) => capFrames().some((f) => f.type === 'user' && S(f).includes(t));
  const delivered = () => (fs.existsSync(dlv) ? fs.readFileSync(dlv, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : []);
  const focus = (key) => ev(`(() => { const t = window.__${key}._chatInput._textarea; t.focus(); return document.activeElement === t; })()`);
  const key = async (k, modifiers = 0) => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers, ...(modifiers ? {} : { text: '\r' }) });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers });
  };
  const typeSend = async (k, text, { alt = false } = {}) => { await focus(k); await cdp('Input.insertText', { text }); await key('Enter', alt ? 1 : 0); };
  const streaming = (k) => ev(`!!document.querySelector('[data-steer-leg="${k}"] .chat-interrupt-btn')`);
  // a tool_use becomes a `role: 'tool'` card (id `<session>:t:<tool_use_id>`) — how many this window drew
  const toolCards = (k) => ev(`(window.__${k}._messages || []).filter((m) => m.role === 'tool').length`);
  const toolCardUp = async (k) => (await toolCards(k)) >= 1;
  const bubble = (k, text) => ev(`(() => { const m = (window.__${k}._messages || []).filter((x) => x.role === 'user' && JSON.stringify(x.content).includes(${S(text)})).pop(); const el = m && document.querySelector('[data-steer-leg="${k}"] [data-msg-id="' + m.id + '"]'); const chip = el && el.querySelector('[data-queue-state]'); return { state: m ? m.queueState || null : null, chip: chip ? chip.dataset.queueState : null, label: chip ? chip.textContent : null }; })()`);
  const STRIP = (k) => `(() => { const s = document.querySelector('[data-steer-leg="${k}"] .chat-queue-strip'); return { visible: !!(s && !s.classList.contains('hidden') && s.getBoundingClientRect().height > 0), text: s ? s.textContent : '', edits: s ? s.querySelectorAll('[data-queue-op="edit"]').length : 0, removes: s ? s.querySelectorAll('[data-queue-op="remove"]').length : 0, steers: s ? s.querySelectorAll('[data-queue-op="steer"]').length : 0 }; })()`;
  const HINT = (k) => `(() => { const root = document.querySelector('[data-steer-leg="${k}"]'); const h = root && root.querySelector('.chat-send-hint'); const hb = root && root.querySelector('.chat-hold-btn'); const sb = root && root.querySelector('.chat-steer-btn'); const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; return { hint: h && vis(h) ? h.textContent : '', hold: vis(hb), bolt: vis(sb) }; })()`;
  const waitTurnEnd = (k) => until(async () => !(await streaming(k)), 20000, 150);
  /** What the CLI got, where the stand-in took it, and the wrapper's own log — printed beside a red assert. */
  const dump = () => {
    let wlog = ''; try { wlog = fs.readFileSync(path.join(wt, 'data', 'session-buffers', 'chat-wrapper.log'), 'utf8').split('\n').slice(-25).join('\n'); } catch { }
    return { cli: capFrames().map((f) => f.type === 'user' ? 'user:' + S(f.message?.content).slice(0, 60) + (f.webui_steer ? ' [steer]' : '') : f.type + (f.request ? ':' + S(f.request).slice(0, 200) : '')), delivered: delivered(), wlog };
  };

  const o1 = await open(s1, 'v1', 'steer new');
  ok(o1 && o1.ok && !o1.ro, '§B the new-wrapper chat window opened live with a composer', o1);
  if (o1 && o1.ok) {
    // ① ENTER mid-turn — hands it to the running turn
    await typeSend('v1', 'TOOL-1 run a slow command');
    await until(() => streaming('v1'), 10000, 100);
    await until(() => toolCardUp('v1'), 10000, 100);
    const hint1 = await ev(HINT('v1'));
    await shot('1-hint-desktop');
    await typeSend('v1', 'ENTER-B sent with Enter while the tool runs');
    const gotFast = await until(() => cliGot('ENTER-B sent with Enter'), 3000, 50);
    const toolDoneAtGot = delivered().some((d) => d.how === 'tool_result');
    const handedChip = await until(async () => (await bubble('v1', 'ENTER-B')).chip === 'handed', 4000, 80) ? await bubble('v1', 'ENTER-B') : await bubble('v1', 'ENTER-B');
    await shot('2-handed-row');
    const strip1 = await ev(STRIP('v1'));
    await waitTurnEnd('v1');
    await sleep(500);
    const landedChip = await bubble('v1', 'ENTER-B');
    await shot('3-injected-row');
    if (!ok(/Enter sends now/.test(hint1.hint) && /Alt\+Enter queues until the turn ends/.test(hint1.hint) && !hint1.hold && !hint1.bolt, '§B ① the hint under the box while the turn runs: «Enter sends now · Alt+Enter queues until the turn ends» (desktop: no buttons)', hint1)) console.log(dump());
    ok(gotFast && !toolDoneAtGot && !strip1.visible, '① mid-turn ENTER ⇒ the CLI got it AT ONCE (before the tool result), never a strip row', { gotFast, toolDoneAtGot, strip1 });
    ok(handedChip.chip === 'handed' && /Handed to the turn/.test(handedChip.label || ''), '① …the bubble reads «Handed to the turn» while the tool runs', handedChip);
    ok(delivered().some((d) => d.how === 'tool_result' && d.text === 'ENTER-B sent with Enter while the tool runs') && landedChip.chip === 'steered' && /Steered/.test(landedChip.label || ''), '① …it LANDED at the tool result (the stand-in took it into the turn) and the bubble now reads «Steered» where it sits — never a turn of its own', { landedChip, delivered: delivered() });

    // ③ CONTROL: Alt+Enter still holds — then ② the ⚡ on that held row
    await typeSend('v1', 'TOOL-2 run another slow command');
    await until(() => streaming('v1'), 10000, 100);
    await until(async () => (await toolCards('v1')) >= 2, 10000, 100);
    await typeSend('v1', 'ALT-C held with Alt+Enter', { alt: true });
    await until(async () => (await ev(STRIP('v1'))).visible, 6000, 100);
    const strip3 = await ev(STRIP('v1'));
    const heldChip = await bubble('v1', 'ALT-C');
    await shot('4-held-row-bolt');
    ok(strip3.visible && /ALT-C held with Alt\+Enter/.test(strip3.text) && strip3.edits === 1 && strip3.removes === 1 && strip3.steers === 1 && heldChip.chip === 'queued' && !cliGot('ALT-C held'), '③ CONTROL: Alt+Enter HOLDS it — the strip row with ✎ ✕ ⚡, the bubble «Queued», the CLI never got it', { strip3, heldChip });
    const clicked = await realClick('[data-steer-leg="v1"] .chat-queue-strip [data-queue-op="steer"]');
    const gotC = await until(() => cliGot('ALT-C held'), 4000, 50);
    await until(async () => !(await ev(STRIP('v1'))).visible, 4000, 100);
    const strip2 = await ev(STRIP('v1'));
    await waitTurnEnd('v1');
    await sleep(500);
    const cChip = await bubble('v1', 'ALT-C');
    ok(clicked && gotC && !strip2.visible, '② a trusted click on the ⚡ of the held row ⇒ the CLI got it at once and the row left the strip', { clicked, miss: realClick.lastMiss, gotC, strip2 });
    ok(delivered().some((d) => d.how === 'tool_result' && d.text === 'ALT-C held with Alt+Enter') && cChip.chip === 'steered', '② …it landed at the tool result, «Steered»', { cChip });

    // ⑤ Stop with a handed message
    await typeSend('v1', 'TOOL-3 a third slow command');
    await until(() => streaming('v1'), 10000, 100);
    await until(async () => (await toolCards('v1')) >= 3, 10000, 100);
    await typeSend('v1', 'STOP-D handed, then Stop');
    await until(() => cliGot('STOP-D handed'), 3000, 50);
    const stopped = await realClick('[data-steer-leg="v1"] .chat-interrupt-btn');
    await until(async () => (await ev(`[...document.querySelectorAll('#global-toasts .global-toast')].some((t) => /stay with it/.test(t.textContent))`)), 6000, 100);
    await waitTurnEnd('v1');
    await sleep(1500);   // the stand-in's follow-up turn answers 300 ms in — anything that would answer D has by now
    const toasts = await ev(`[...document.querySelectorAll('#global-toasts .global-toast')].map((t) => t.textContent)`);
    const dChip = await bubble('v1', 'STOP-D');
    const box = await ev('window.__v1._chatInput._textarea.value');
    const answeredD = await ev(`(window.__v1._messages || []).some((m) => m.role === 'assistant' && /reply: STOP-D/.test(JSON.stringify(m.content || [])))`);
    await shot('5-stop-kept');
    ok(stopped && toasts.filter((t) => /1 message\(s\) you sent into the turn stay with it/.test(t)).length === 1, '⑤ Stop with a handed message ⇒ ONE toast «1 message(s) you sent into the turn stay with it»', { stopped, toasts });
    ok(dChip.chip === 'kept' && /Stays with the stopped turn/.test(dChip.label || '') && !answeredD && box === '', '⑤ …the bubble reads «Stays with the stopped turn», NOTHING answered it after Stop, and the box stays empty (it is the turn\'s, never put back)', { dChip, answeredD, box });

    // ⑥ ≤ 768 px: the hold button beside Send (Send itself hands the message over). ⑤'s toast sits over the composer's
    // controls on a phone for its 6 s — a person taps after it is gone, so the leg starts after it too
    await until(async () => !(await ev(`document.querySelectorAll('#global-toasts .global-toast').length`)), 12000, 200);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(800);
    // the phone face sends with its Send button (a touch keyboard's Enter is a newline there)
    await focus('v1'); await cdp('Input.insertText', { text: 'TOOL-4 a phone turn' });
    await realClick('[data-steer-leg="v1"] .chat-send-btn');
    await until(() => streaming('v1'), 10000, 100);
    await sleep(400);
    const phone = await ev(HINT('v1'));
    await focus('v1'); await cdp('Input.insertText', { text: 'PHONE-E held with the button' });
    const held6 = await realClick('[data-steer-leg="v1"] .chat-hold-btn');
    await until(async () => (await ev(STRIP('v1'))).visible, 6000, 100);
    const strip6 = await ev(STRIP('v1'));
    await shot('6-phone-hold-button');
    ok(phone.hold && !phone.bolt && phone.hint === '', '⑥ ≤ 768 px mid-turn: the hold button shows beside Send (no bolt — Send itself hands it over), the hint line is hidden', phone);
    ok(held6 && strip6.visible && /PHONE-E held with the button/.test(strip6.text) && !cliGot('PHONE-E held'), '⑥ …a tap on it HOLDS the message (a strip row; the CLI never got it)', { held6, miss: realClick.lastMiss, strip6 });
    await cdp('Emulation.clearDeviceMetricsOverride');
    await waitTurnEnd('v1');
  }

  // ④ the OLD wrapper's session: its hello names no steer
  if (s2) {
    const o2 = await open(s2, 'v2', 'steer old wrapper');
    ok(o2 && o2.ok, '§B the old-wrapper chat window opened live', o2);
    if (o2 && o2.ok) {
      await typeSend('v2', 'TOOL-9 a turn on the old wrapper');
      await until(() => streaming('v2'), 10000, 100);
      await until(() => toolCardUp('v2'), 10000, 100);
      const hint2 = await ev(HINT('v2'));
      await typeSend('v2', 'OLD-F typed on the old wrapper');
      await until(async () => (await ev(STRIP('v2'))).visible, 6000, 100);
      const strip4 = await ev(STRIP('v2'));
      await shot('7-old-wrapper');
      ok(/Enter queues/.test(hint2.hint) && !/Alt\+Enter/.test(hint2.hint) && !/sends now/.test(hint2.hint) && !hint2.hold, '④ CONTROL — the 6428c67e wrapper (hello without steer): «Enter queues» alone, no Alt+Enter segment, no hold button', hint2);
      ok(strip4.visible && strip4.steers === 0 && !cliGot('OLD-F typed'), '④ …Enter there HOLDS (it is what that wrapper does) and its row has no ⚡', strip4);
    }
  } else skip('§B ④', `git show ${BASE}:data/bin/chat-wrapper.js failed — the base is not reachable from this checkout`);
  ok(pageErrors.length === 0, '§B no page exceptions', pageErrors.slice(0, 3));
  try { cdpWs.close(); } catch { }
  try { ctl.close(); } catch { }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skipped} skipped)` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
