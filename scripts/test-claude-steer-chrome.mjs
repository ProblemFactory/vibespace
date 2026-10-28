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
//      with no turn running is a plain send · ⑧ the hello names the steer door — only from the CLI's first state word
//      ACCEPTANCE r2 (each RED on the eeece327 tree, the round it fixed): ⑨ a CLI that says NO state word: the door is never
//      advertised, a stamped frame is held, a dispatch at idle still runs, Stop answers nothing · ⑩ the STOP WINDOW: a
//      stamped frame right after Stop is HELD (its own turn once the stop settles), and with the split shape EVERY
//      follow-up turn is interrupted · ⑪ ONE record per Stop says each frame's fate: one that rode a tool result is
//      `landed` (never kept), a frame whose own turn Stop ended is in no count · ⑫ a row VibeSpace typed is never
//      steerable · ⑬ the Stop window is BOUNDED (2 s after the last result, one log line) · ⑭ the follow-up interrupt
//      leaves in the init line's own tick (the in-process CLI; CONTROL: a 25 ms-late copy is not)
//   §A THE REAL CLI behind the REAL wrapper, talking only to a LOCAL MOCK of POST /v1/messages (a scratch HOME, a
//      loopback ANTHROPIC_BASE_URL, a fake key built by concatenation, nonessential traffic off: no vendor request,
//      nothing billed — the R0 recording as a regression). Evidence-SKIP without the binary ($VS_CLAUDE_BIN, `claude` on
//      PATH, $HOME/.local/bin/claude):
//      ① a stamped frame written while a Bash runs reaches the model INSIDE the turn — the request after the tool result
//        carries «The user sent a new message while you were working: <text>»; the wrapper says handed → landed; ONE turn
//      ② Stop while the CLI still holds it: the CLI starts a turn for it, the wrapper interrupts that turn on its init —
//        no request reaches the model after Stop; the next message's request carries it (it stayed in the conversation)
//      ③ (r2) a message C typed δ = 0 / 20 / 45 ms after Stop is HELD and runs as the next turn once the stop settles: the
//        frame the CLI held is never answered on its own (eeece327 answered one billed request at δ = 20)
//      ④ (r2) Stop after the frame rode a tool result: the record says `landed`, never kept
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
//      ⑥ ≤ 768 px: the hold button beside Send (the hint hidden), and it holds — at idle too (the capability's, r2)
//      ⑦ (r2) a SECOND TAB whose streaming flag lags (pinned false): its Alt+Enter mid-tool still HOLDS (eeece327 stamped
//        it — the hold became a hand-over)
//      ⑧ (r2) the server RESTARTS and the page reloads: every mid-turn bubble comes back ONCE with its last chip
//        («Steered», «Stays with the stopped turn», a still-held «Queued»)
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
const INPROC = path.join(REPO, 'scripts/fixtures/claude-inproc-cli.cjs');
const RACE = path.join(REPO, 'scripts/fixtures/claude-race-cli.cjs');
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
// THIS SUITE'S TEARDOWN RUNS FIRST AT EXIT (r2 hygiene): registered before any scratch dir is minted — scratch.mjs removes
// those at exit too, in registration order, and a browser still alive then wrote its profile back (an 8 KB
// /tmp/vs-cst-chrome-<pid> left by every run that ended early). Each section pushes what ends its processes.
const atExit = [];
process.on('exit', () => { for (const f of atExit.splice(0)) { try { f(); } catch { } } });
// …and on a SIGNAL (acceptance r4): node's default for SIGTERM / SIGINT / SIGHUP ends the process WITHOUT its 'exit'
// handlers, so a run stopped in its first half (§0 / §A) left its wrappers, its CLIs and its scratch dirs behind. The
// teardown runs first; process.exit then lets scratch.mjs remove the dirs.
for (const [sig, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]]) process.on(sig, () => { for (const f of atExit.splice(0)) { try { f(); } catch { } } process.exit(code); });

// ── §0 THE REAL WRAPPER over the stand-in CLI (moved from the fast suite: the fast tier's 910 s sum had 0.77 s left) ──
console.log('§0 the REAL chat-wrapper over the stand-in CLI (the R0 turn shape)');
const NEW = ['remove', 'steer', 'steer-all', 'reorder', 'edit'];
const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-claude-steer-'));
atExit.push(() => fs.rmSync(scratchRoot, { recursive: true, force: true }));
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
async function boot(wrapperPath, label, { toolMs = 1500, env = {}, inproc = false, race = false } = {}) {
  const dir = fs.mkdtempSync(path.join(scratchRoot, label + '-'));
  const cap = path.join(dir, 'cli-got.jsonl'), dlv = path.join(dir, 'delivered.jsonl'), inOut = path.join(dir, 'inproc.jsonl'), raceOut = path.join(dir, 'race.jsonl');
  // ⑭ the in-process CLI (scripts/fixtures/claude-inproc-cli.cjs) is preloaded INTO the wrapper's own process — and ⑮ the
  // riding race's scripted CLI (scripts/fixtures/claude-race-cli.cjs) the same way
  const argv = inproc ? ['-r', INPROC, wrapperPath, path.join(dir, 's.buf'), path.join(dir, 's.json'), 'inproc-claude']
    : race ? ['-r', RACE, wrapperPath, path.join(dir, 's.buf'), path.join(dir, 's.json'), 'race-claude']
    : [wrapperPath, path.join(dir, 's.buf'), path.join(dir, 's.json'), process.execPath, STAND_IN];
  const w = spawn(process.execPath, argv, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, STUB_CAPTURE: cap, STAND_IN_DELIVERED: dlv, INPROC_OUT: inOut, RACE_OUT: raceOut, STAND_IN_LONG_MS: String(toolMs), VIBESPACE_SKIP_AGENT_HOOKS: '1', ...env } });
  atExit.push(() => { try { w.kill('SIGKILL'); } catch { } }); // a signal mid-run ends it too (its stand-in exits on stdin's end)
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
    inproc: () => lines(inOut),
    race: () => lines(raceOut),
    buf: () => { try { return fs.readFileSync(path.join(dir, 's.buf'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } }); } catch { return []; } },
    log: () => { try { return fs.readFileSync(path.join(dir, 'chat-wrapper.log'), 'utf8'); } catch { return ''; } },
    stop: () => w.stdin.write(ad.formatInterrupt() + '\n'),
    queued: (msgId) => recs.some((r) => r.type === 'queued_input' && r.msg_id === msgId),
    follows: () => lines(cap).filter((f) => f.type === 'control_request' && /^vs-stop-follow-/.test(f.request_id || '')).length,
    // Stop's ONE record, each frame's fate (r2): put back / kept by the CLI / already read
    drops: () => recs.filter((r) => r.type === 'queue_dropped').map((d) => ({ items: (d.items || []).map((it) => it.msgId), kept: d.kept || 0, keptIds: d.keptIds || [], landed: d.landed || 0, landedIds: d.landedIds || [] })),
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
  const out = {
    drop: h.drops().map((d) => ({ items: d.items, kept: d.kept })),
    followInterrupt: h.follows(),
    kept: h.drops().flatMap((d) => d.keptIds),
    answeredB: said(h, /reply: B handed, then Stop/),
    cReached: h.got().some((f) => f.type === 'user' && JSON.stringify(f).includes('C held, then Stop')),
    results: h.results(),
  };
  await h.kill();
  return out;
}

/** ⑨ (r2) a CLI that says NO state word (before 2.1.257, or the switch unset): nothing proves "the turn ended, it runs
 *  what it holds", so the wrapper never advertises the door and holds a stamped frame — the base's order holds. */
async function legNoState(wp) {
  const h = await boot(wp, 'nostate', { toolMs: 800, env: { STAND_IN_NO_STATE: '1' } });
  h.say('LONG-A a text turn', 'm-a', { steer: true });
  await sleep(200);
  h.say('B stamped mid text turn', 'm-b', { steer: true });
  await until(() => h.results() >= 2, 6000);
  await sleep(200);
  h.say('H typed by VibeSpace at idle', 'm-h', { origin: 'dispatch' });
  await until(() => h.results() >= 3, 3000);
  const verbs = { sidecar: h.meta()?.caps?.queueVerbs, inBand: (h.of('queue_changed').pop() || {}).verbs };
  h.say('TOOL-C run the slow command', 'm-c');
  await until(h.toolUse, 4000);
  await sleep(100);
  h.say('D stamped mid tool, then Stop', 'm-d', { steer: true });
  await sleep(150);
  h.stop();
  await sleep(1500);
  const out = { verbs, bHeld: h.queued('m-b'), handed: h.hand().flatMap((r) => r.msg_ids || []), ranH: h.delivered().some((d) => /H typed/.test(d.text)), drops: h.drops(), answeredD: said(h, /D stamped mid tool/), dReached: h.got().some((f) => f.type === 'user' && S(f).includes('D stamped')) };
  await h.kill();
  return out;
}
/** ⑩ (r2) THE STOP WINDOW: C, stamped, reaches the wrapper `delay` ms after Stop — it is HELD, then runs as a turn of its
 *  own once the stop settles; the frame the CLI held at Stop is never answered. */
async function legLateC(wp, label, { delay = 0 } = {}) {
  const h = await boot(wp, label, { toolMs: 3000 });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse, 4000);
  h.say('B handed, then Stop', 'm-b', { steer: true });
  await until(() => h.hand('handed').some((r) => (r.msg_ids || []).includes('m-b')), 3000);
  h.stop();
  if (delay) await sleep(delay);
  h.say('C typed right after Stop', 'm-c', { steer: true });
  await until(() => h.delivered().some((d) => d.how === 'turn' && d.text === 'C typed right after Stop'), 4000);
  await sleep(400);
  const out = { cHeld: h.queued('m-c'), cHanded: h.hand('handed').some((r) => (r.msg_ids || []).includes('m-c')), follows: h.follows(), answeredB: said(h, /reply:[^"]*B handed, then Stop/), cOwnTurn: h.delivered().some((d) => d.how === 'turn' && d.text === 'C typed right after Stop'), drops: h.drops() };
  await h.kill();
  return out;
}
/** ⑩ (r2) the SPLIT shape ($STAND_IN_SPLIT_FOLLOW — the real CLI's for a frame that reached it 15–22 ms after Stop): the CLI
 *  starts one follow-up turn per frame it held — EVERY one is interrupted on its init, nothing is answered. */
async function legSplit(wp) {
  const h = await boot(wp, 'split', { toolMs: 3000, env: { STAND_IN_SPLIT_FOLLOW: '1' } });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse, 4000);
  h.say('B1 handed', 'm-b1', { steer: true });
  h.say('B2 handed', 'm-b2', { steer: true });
  await until(() => h.hand('handed').length >= 2, 3000);
  h.stop();
  await sleep(1500);
  const out = { follows: h.follows(), answered: said(h, /reply: B/), drops: h.drops(), settled: /stop settled \(idle\): 2 frame\(s\) the CLI held at Stop, 2 follow-up/.test(h.log()) };
  await h.kill();
  return out;
}
/** ⑪ (r2) the record's truth: Stop after B RODE a tool result (the model reads it in the request Stop cut) ⇒ `landed`. */
async function legRide(wp) {
  const h = await boot(wp, 'ride', { toolMs: 600, env: { STAND_IN_POST_MS: '1500' } });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse, 4000);
  h.say('B handed mid tool', 'm-b', { steer: true });
  await until(() => h.recs.some(isToolResult), 4000);
  await sleep(200);
  h.stop();
  await sleep(800);
  const out = { tookIn: h.delivered().filter((d) => d.how === 'tool_result').map((d) => d.text), drops: h.drops(), follows: h.follows(), landedAfter: h.hand('landed').flatMap((r) => r.msg_ids || []) };
  await h.kill();
  return out;
}
/** ⑪ (r2) …and Stop while B's OWN turn runs a tool: that is a stopped turn, no message is kept. */
async function legOwnStop(wp) {
  const h = await boot(wp, 'ownstop', { toolMs: 1500 });
  h.say('LONG-A a text turn', 'm-a');
  await sleep(200);
  h.say('TOOL-B handed with no tool result left', 'm-b', { steer: true });
  await until(h.toolUse, 6000);
  await sleep(200);
  h.stop();
  await sleep(800);
  const out = { own: h.hand('own-turn').flatMap((r) => r.msg_ids || []), drops: h.drops(), follows: h.follows() };
  await h.kill();
  return out;
}
/** ⑫ (r2) a row VibeSpace typed (a dispatch) is never the person's to push into the turn. */
async function legOrigin(wp) {
  const h = await boot(wp, 'origin', { toolMs: 2000 });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse, 4000);
  h.say('a dispatch frame', 'm-o', { origin: 'dispatch' });
  await until(() => h.held('m-o'), 3000);
  const row = h.queueItems().find((it) => it.msgId === 'm-o') || {};
  h.write(S({ type: 'queue-op', op: 'steer', id: row.id }));
  await until(() => h.of('queue_op_result').length >= 1, 3000);
  const out = { steerable: row.steerable, res: h.of('queue_op_result').map((r) => `${r.ok}:${r.reason}:${r.why || ''}`), reached: h.got().some((f) => f.type === 'user' && S(f).includes('a dispatch frame')) && !h.queueItems().some((it) => it.msgId === 'm-o') };
  await h.kill();
  return out;
}
/** ⑬ (r2) the Stop window is BOUNDED: a background helper keeps the CLI 'running' past the interrupted result (no idle) —
 *  2 s after that result the window closes with ONE log line and the frame held in it runs. */
async function legBound(wp) {
  const h = await boot(wp, 'bound', { toolMs: 600, env: { STAND_IN_POST_MS: '1500', STAND_IN_HELPER_MS: '8000' } });
  h.say('TOOL-A BGAGENT-x run the slow command', 'm-a');
  await until(h.toolUse, 4000);
  await until(() => h.recs.some(isToolResult), 4000);
  await sleep(100);
  h.stop();
  await sleep(50);
  h.say('C typed after Stop', 'm-c', { steer: true });
  const t0 = Date.now();
  await until(() => h.got().some((f) => f.type === 'user' && S(f).includes('C typed after Stop')), 5000);
  const out = { cHeld: h.queued('m-c'), reachedMs: Date.now() - t0, boundLines: h.log().split('\n').filter((l) => /bound: the CLI owes nothing and said no idle 2000 ms after its last result \(a background task keeps it running\) — closed the Stop window/.test(l)).length };
  await h.kill();
  return out;
}
/** ⑮ (r4) RIDING IS NOT LANDED: B handed mid-tool reached the CLI just before its tool_result line but MISSED that request
 *  (scripts/fixtures/claude-race-cli.cjs) — a Stop before the model spoke counts B as HELD: kept, its follow-up interrupted
 *  in the same tick, nothing answered (7df30f96: `landed`, no interrupt, the follow-up answered after Stop). */
async function legRace(wp, label) {
  const h = await boot(wp, label, { race: true });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse, 3000);
  h.say('MARK-B handed mid tool', 'm-b', { steer: true });
  await until(() => h.race().some((x) => x.toolResultAfterB), 3000);
  h.stop();
  await sleep(600);
  const out = { drops: h.drops(), race: h.race(), landedAfter: h.hand('landed').flatMap((r) => r.msg_ids || []) };
  await h.kill();
  return out;
}
/** ⑯ (r4) THE WINDOW CLOSES ON THE CLI'S WORDS: a Stop that found B held by the CLI, and a 2.5 s prompt hook before the
 *  follow-up's init (the product's own hook waits on the hub up to 3 s) — the window waits through the hook and the init
 *  is interrupted. `emit` = the CLI says the hook's phase (the adapter's switch); without it the 30 s backstop alone. */
async function legHookStop(wp, label, { emit = true, hookMs = 2500 } = {}) {
  const h = await boot(wp, label, { toolMs: 1500, env: { STAND_IN_PROMPT_HOOK_MS: String(hookMs), ...(emit ? { CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS: '1' } : {}) } });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse, hookMs + 4000);
  h.say('MARK-B handed mid tool', 'm-b', { steer: true });
  await sleep(300);
  h.stop();
  await until(() => /stop settled|bound:|backstop:/.test(h.log()), hookMs + 6000);
  // a clock that closed the window early lets the follow-up run once the hook ends: wait for its answer or the settle
  await until(() => said(h, /reply: MARK-B/) || /stop settled/.test(h.log()), hookMs + 4000);
  await sleep(500);
  const lg = h.log();
  const out = { answeredB: said(h, /reply: MARK-B/), follows: h.follows(), hookWordsTeed: h.recs.filter((r) => r.type === 'system' && r.hook_event === 'UserPromptSubmit').length, settled: /stop settled \(idle\)/.test(lg), clockLines: lg.split('\n').filter((l) => /bound:|backstop:/.test(l)).map((l) => l.replace(/^\[[^\]]+\] /, '')), waited: /the window waits for its init/.test(lg) };
  await h.kill();
  return out;
}
/** ⑰ (r4) …and an OWED turn waits for its words too: A a text turn, B handed (the CLI owes it its own turn, which runs a
 *  tool, after a 2.5 s prompt hook), C held with Alt+Enter — C stays held until B's own turn ENDS (7df30f96: the 2 s bound
 *  drained C into the turn the CLI was starting, and C rode B's tool result — the hold became a hand-over). */
async function legHookOwed(wp, label) {
  const h = await boot(wp, label, { toolMs: 1200, env: { STAND_IN_PROMPT_HOOK_MS: '2500', CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS: '1', STAND_IN_LONG_MS: '1200' } });
  h.say('LONG-A a text turn', 'm-a');
  await until(() => h.recs.some((r) => r.type === 'system' && r.subtype === 'init'), 6000);
  await sleep(200);
  h.say('TOOL-B handed, owed its own turn', 'm-b', { steer: true });
  await sleep(100);
  h.say('C held until the turn ends', 'm-c');
  await until(() => h.results() >= 3, 15000);
  await sleep(300);
  const out = { rodeB: h.delivered().filter((d) => d.how === 'tool_result').map((d) => d.text), turns: h.delivered().filter((d) => d.how === 'turn').map((d) => d.text), cHeld: h.queued('m-c') };
  await h.kill();
  return out;
}
/** ⑱ (r4) THE COPY IS THE MESSAGE'S ONE RECORD — an edit rewrites it, and it names its witness: the uuid the wrapper
 *  stamped on the frame the CLI got (the CLI keeps it as its user record's uuid). */
async function legEditCopy(wp) {
  const h = await boot(wp, 'editcopy', { toolMs: 1500 });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse, 4000);
  h.say('E please run the tests on staging', 'm-e');
  await until(() => h.held('m-e'), 3000);
  const row = h.queueItems().find((it) => it.msgId === 'm-e') || {};
  h.write(S({ type: 'queue-op', op: 'edit', id: row.id, text: 'E please run the tests locally, NOT on staging' }));
  await until(() => h.got().some((f) => f.type === 'user' && S(f).includes('locally, NOT on staging')), 6000);
  await sleep(2300); // the wrapper persists its buffer on a 2 s timer (the leg's dir goes with the kill)
  const copies = h.buf().filter((r) => r.webui_copy && r.msgId === 'm-e');
  const sent = h.got().find((f) => f.type === 'user' && S(f).includes('locally, NOT on staging')) || {};
  await h.kill();
  return { copies: copies.map((c) => ({ text: (c.message?.content || []).map((b) => b.text).join(''), cliUuid: c.cliUuid || null })), sentUuid: sent.uuid || null };
}
/** ⑭ (r2) the follow-up interrupt leaves IN THE SAME TICK as the init line's parse (the in-process CLI looks at once). */
async function legSameTick(wp, label) {
  const h = await boot(wp, label, { inproc: true });
  h.say('TOOL-A run the slow command', 'm-a');
  await until(h.toolUse, 4000);
  h.say('B handed, then Stop', 'm-b', { steer: true });
  await until(() => h.hand('handed').length >= 1, 3000);
  h.stop();
  await until(() => h.inproc().length >= 1, 3000);
  await sleep(200);
  const out = { inproc: h.inproc(), answered: said(h, /reply: B handed/) };
  await h.kill();
  return out;
}
/** ⑧ the hello: the .354 three at boot, the steer pair from the CLI's first state word on (r2). */
async function legAdvert(wp) {
  const h = await boot(wp, 'advert');
  await until(() => h.of('queue_changed').length >= 1, 3000);
  const atBoot = { sidecar: h.meta()?.caps?.queueVerbs, inBand: h.of('queue_changed')[0]?.verbs };
  h.say('first turn', 'm-1');
  await until(() => h.results() >= 1, 4000);
  const proven = { sidecar: h.meta()?.caps?.queueVerbs, inBand: (h.of('queue_changed').pop() || {}).verbs };
  await h.kill();
  return { atBoot, proven };
}

const followMutant = wrapperCopy('no-follow-interrupt', fs.readFileSync(LANE_WRAPPER, 'utf8').replace("sendChild(JSON.stringify({ type: 'control_request', request_id: `vs-stop-follow-", "void (JSON.stringify({ type: 'control_request', request_id: `vs-stop-follow-"));
// ⑭'s CONTROL: the same interrupt, 25 ms late (what a timer between the init line and the write would do)
const lateMutant = wrapperCopy('late-follow-interrupt', fs.readFileSync(LANE_WRAPPER, 'utf8').replace("sendChild(JSON.stringify({ type: 'control_request', request_id: `vs-stop-follow-", "setTimeout(sendChild, 25, JSON.stringify({ type: 'control_request', request_id: `vs-stop-follow-"));
// r4: the r2 rule, replayed — a 2 s clock from the result that never hears the prompt hook (the RED control for ⑯ / ⑰)
const LANE_SRC = fs.readFileSync(LANE_WRAPPER, 'utf8');
const r2Clock = LANE_SRC.includes('const OWED_BACKSTOP_MS = 30000;') && LANE_SRC.includes("if (msg.type === 'system' && msg.hook_event === 'UserPromptSubmit' && !msg.parent_tool_use_id")
  ? wrapperCopy('r2-clock', LANE_SRC.replace('const OWED_BACKSTOP_MS = 30000;', 'const OWED_BACKSTOP_MS = 2000;').replace("if (msg.type === 'system' && msg.hook_event === 'UserPromptSubmit' && !msg.parent_tool_use_id", "if (false && msg.type === 'system' && msg.hook_event === 'UserPromptSubmit' && !msg.parent_tool_use_id"))
  : null;
const leg = (p) => p.catch((e) => ({ threw: String(e && e.message || e) }));
const [race, hookStop, hookStopNoEmit, hookStopCtl, hookOwed, hookOwedCtl, editCopy] = await Promise.all([
  leg(legRace(LANE_WRAPPER, 'race')),
  leg(legHookStop(LANE_WRAPPER, 'hookstop')),
  leg(legHookStop(LANE_WRAPPER, 'hookstop-noemit', { emit: false })),
  r2Clock ? leg(legHookStop(r2Clock, 'hookstop-ctl')) : null,
  leg(legHookOwed(LANE_WRAPPER, 'hookowed')),
  r2Clock ? leg(legHookOwed(r2Clock, 'hookowed-ctl')) : null,
  leg(legEditCopy(LANE_WRAPPER)),
]);
const [noState, late0, lateAfter, split, ride, ownStop, origin, bound, sameTick, sameTickCtl] = await Promise.all([
  leg(legNoState(LANE_WRAPPER)),
  leg(legLateC(LANE_WRAPPER, 'late0', { delay: 0 })),
  leg(legLateC(LANE_WRAPPER, 'late-after', { delay: 400 })),
  leg(legSplit(LANE_WRAPPER)),
  leg(legRide(LANE_WRAPPER)),
  leg(legOwnStop(LANE_WRAPPER)),
  leg(legOrigin(LANE_WRAPPER)),
  leg(legBound(LANE_WRAPPER)),
  leg(legSameTick(LANE_WRAPPER, 'sametick')),
  leg(legSameTick(lateMutant, 'sametick-ctl')),
]);
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
  leg(legAdvert(LANE_WRAPPER)),

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
const HOLD3 = ['remove', 'reorder', 'edit'];
ok(S(advert.atBoot?.sidecar) === S(HOLD3) && S(advert.atBoot?.inBand) === S(HOLD3), '⑧ at boot the hello names NO steer — the sidecar caps and the first queue_changed say the .354 three (nothing has proven the CLI says its turn state yet)', advert);
ok(S(advert.proven?.sidecar) === S(NEW) && S(advert.proven?.inBand) === S(NEW), '⑧ …from the CLI\'s first state word on, both say [remove, steer, steer-all, reorder, edit] — the door the composer draws', advert);
// ── ACCEPTANCE r2 ──
ok(S(noState.verbs?.sidecar) === S(HOLD3) && S(noState.verbs?.inBand) === S(HOLD3) && noState.bHeld && !noState.handed?.length, '⑨ a CLI with NO state words: the door is never advertised and a STAMPED frame mid-turn is HELD (never written to a turn whose end nothing can prove)', noState);
ok(noState.ranH, '⑨ …a frame VibeSpace types at idle still RUNS (eeece327: held for the life of the wrapper)', noState);
ok(!noState.answeredD && !noState.dReached && noState.drops?.some((d) => d.items.includes('m-d')), '⑨ …and Stop there answers nothing after it: the held frame comes back into the box', noState);
// (the stand-in settles a Stop in a few ms — the real CLI's 40–80 ms window, δ = 0 / 20 / 45, is §A ③)
ok(late0.cHeld && !late0.cHanded && late0.cOwnTurn, '⑩ the Stop window: C stamped right after Stop is HELD as a plain queued send, never handed — it ran as a turn of its own once the stop settled (eeece327: handed into the stopping turn)', late0);
ok(late0.follows === 1 && !late0.answeredB && S(late0.drops?.map((x) => x.keptIds)) === S([['m-b']]), '⑩ …the frame the CLI held at Stop is never answered (its follow-up interrupted), and the ONE record keeps it', late0);
ok(!lateAfter.cHeld && !lateAfter.cHanded && lateAfter.cOwnTurn && lateAfter.follows === 1 && !lateAfter.answeredB, '⑩ CONTROL: C typed once the stop has SETTLED is a plain send at idle (the window closed — it holds nothing for ever)', lateAfter);
ok(split.follows === 2 && !split.answered && S(split.drops?.map((x) => x.keptIds)) === S([['m-b1', 'm-b2']]) && split.settled, '⑩ the split shape: the CLI started a follow-up turn PER held frame — EVERY one interrupted on its init (eeece327: the second was answered); one record, kept 2', split);
ok(S(ride.tookIn) === S(['B handed mid tool']) && S(ride.drops) === S([{ items: [], kept: 1, keptIds: ['m-b'], landed: 0, landedIds: [] }]) && ride.follows === 0 && S(ride.landedAfter) === S(['m-b']), '⑪ (r4) Stop after B RODE the tool result, before the model spoke: not proven read, so the record KEEPS it (its follow-up would be interrupted) — no follow-up came, so the settle says `landed` afterwards (chip «Steered»)', ride);
ok(S(ownStop.own) === S(['m-b']) && !ownStop.drops?.length && ownStop.follows === 0, '⑪ Stop while B\'s OWN turn runs a tool: a stopped turn — no record counts B as kept (eeece327: kept 1)', ownStop);
ok(origin.steerable === false && S(origin.res) === S(['false:not-steerable:origin']), '⑫ a row VibeSpace typed: `steerable: false` on the row (no ⚡) and the wrapper refuses «VibeSpace\'s own message runs between turns» (eeece327: handed it)', origin);
ok(bound.cHeld && bound.reachedMs >= 1500 && bound.reachedMs < 4000 && bound.boundLines === 1, '⑬ the Stop window is BOUNDED where the CLI owes nothing: no idle came (a helper kept the CLI running) — 2 s after the last result ONE log line says why it closed, and the frame held in it runs', bound);
// ── ACCEPTANCE r4 ──
ok(S(race.drops) === S([{ items: [], kept: 1, keptIds: ['m-b'], landed: 0, landedIds: [] }]) && race.race?.some((x) => x.followInit && x.interruptedSameTick === true) && !race.race?.some((x) => x.answeredAfterStop) && !race.landedAfter?.length, '⑮ RIDING IS NOT LANDED: B reached the CLI just before its tool_result line but missed that request — Stop counts it HELD (kept 1), the follow-up is interrupted in the same tick, nothing is answered (7df30f96: landed 1 and the follow-up answered)', race);
ok(!hookStop.answeredB && hookStop.follows === 1 && hookStop.settled && hookStop.waited && hookStop.hookWordsTeed === 0 && !hookStop.clockLines?.length, '⑯ a 2.5 s prompt hook before the follow-up\'s init: the window WAITS through it (the CLI said the hook\'s phase) and the init is interrupted — nothing answered; the hook words never reach the chat; no clock closed anything', hookStop);
ok(!hookStopNoEmit.answeredB && hookStopNoEmit.follows === 1 && hookStopNoEmit.settled && !hookStopNoEmit.clockLines?.length, '⑯ …and where the CLI says no hook phase, the 30 s backstop (above the product\'s 10 s hook timeout) still outlasts it: the init is interrupted, nothing answered', hookStopNoEmit);
if (hookStopCtl) ok(hookStopCtl.answeredB && hookStopCtl.follows === 0 && hookStopCtl.clockLines?.length === 1, '⑯ RED CONTROL: the r2 rule (a 2 s clock from the result, deaf to the hook) — the clock closed the window inside the hook and the follow-up was ANSWERED after Stop', hookStopCtl);
ok(!hookOwed.rodeB?.length && S(hookOwed.turns) === S(['LONG-A a text turn', 'TOOL-B handed, owed its own turn', 'C held until the turn ends']) && hookOwed.cHeld, '⑰ an OWED turn under a 2.5 s prompt hook: C (Alt+Enter) stays held until B\'s own turn ENDS — it never rides B\'s tool result, it runs as a turn of its own', hookOwed);
if (hookOwedCtl) ok(S(hookOwedCtl.rodeB) === S(['C held until the turn ends']), '⑰ RED CONTROL: the r2 rule drained C inside B\'s hook — it rode B\'s tool result (the hold became a hand-over)', hookOwedCtl);
ok(editCopy.copies?.length === 1 && editCopy.copies[0].text === 'E please run the tests locally, NOT on staging' && !!editCopy.sentUuid && editCopy.copies[0].cliUuid === editCopy.sentUuid, '⑱ an EDITED held frame: its ONE buffer copy says the latest words (7df30f96 kept the never-sent original) and names the uuid the wrapper stamped on the frame the CLI got — its witness', editCopy);
ok(sameTick.inproc?.length === 1 && sameTick.inproc[0].sameTick === true && !sameTick.answered, '⑭ the follow-up interrupt is written IN THE SAME TICK as the init line\'s parse (the in-process CLI saw it before init() returned)', sameTick);
ok(sameTickCtl.inproc?.length === 1 && sameTickCtl.inproc[0].sameTick === false, '⑭ CONTROL: a copy that writes it 25 ms late (a timer between) is caught — the pin can say no', sameTickCtl);

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
async function startMock({ postMs = 0 } = {}) {
  const reqs = [];
  const flat = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b.type === 'text' ? b.text : b.type === 'tool_result' ? flat(b.content) : '')).join(' | ') : '');
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', (d) => { raw += d; });
    req.on('end', async () => {
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
      // ④ the model takes `postMs` to answer after a tool result — the window a person presses Stop in after the frame rode it
      if (main && hasTool && postMs > 0) { let closed = false; res.on('close', () => { closed = true; }); await sleep(postMs); if (closed) return; }
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
  // the product's chat spawn sets both (src/adapters/claude-code.js): the turn state, and the prompt hook's phase (r4)
  CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1', CLAUDE_CODE_EMIT_USER_PROMPT_SUBMIT_HOOK_EVENTS: '1', VIBESPACE_SKIP_AGENT_HOOKS: '1',
});
/** r4: the product's OWN hooks — registered the product's way (data/bin/vibespace-hook-register.mjs into the leg's HOME:
 *  SessionStart / UserPromptSubmit / Stop → node data/bin/vibespace-hook.mjs, `timeout: 10`) — against a loopback stand-in
 *  for the hub's /api/agent/* whose prompt-context answers after `ctxMs` (the hook aborts its fetch at 3 s). */
async function hubStandIn(ctxMs) {
  const calls = [];
  const srv = http.createServer((req, res) => {
    const at = Date.now();
    const answer = (o) => { try { res.writeHead(200, { 'content-type': 'application/json' }); res.end(S(o)); } catch { } calls.push({ url: req.url, at }); };
    if (req.url.startsWith('/api/agent/prompt-context')) setTimeout(() => answer({ context: '' }), ctxMs);
    else if (req.url.startsWith('/api/agent/stop-check')) answer({ block: false });
    else answer({ context: '' });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, calls, close: () => srv.close() };
}
async function realWrapper(label, { postMs = 0, hookCtxMs = null } = {}) {
  const mock = await startMock({ postMs });
  const dir = scratchDir('cst-real-' + label);
  const home = path.join(dir, 'home'), work = path.join(dir, 'work');
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(work, { recursive: true });
  const env = cliEnv(home, mock.port);
  let hub = null;
  if (hookCtxMs !== null) {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-hook-register.mjs')], { env: { HOME: home, PATH: process.env.PATH }, encoding: 'utf8' });
    hub = await hubStandIn(hookCtxMs);
    Object.assign(env, { VIBESPACE_API: 'http://127.0.0.1:' + hub.port, VIBESPACE_SESSION_TOKEN: ['vsst', 'suite', 'not-a-token'].join('_'), HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NO_PROXY: '127.0.0.1,localhost' });
    delete env.VIBESPACE_SKIP_AGENT_HOOKS;
  }
  const w = spawn(process.execPath, [path.join(REPO, 'data/bin/chat-wrapper.js'), path.join(dir, 's.buf'), path.join(dir, 's.json'), claudeBin, '--model', 'claude-sonnet-4-5'], { cwd: work, env, stdio: ['pipe', 'pipe', 'pipe'] });
  atExit.push(() => { try { w.kill('SIGKILL'); } catch { } try { endRootedProcesses(dir); } catch { } });
  const recs = []; let lb = '';
  w.stdout.setEncoding('utf8');
  w.stdout.on('data', (d) => {
    lb += d; let i;
    while ((i = lb.indexOf('\n')) >= 0) {
      const l = lb.slice(0, i); lb = lb.slice(i + 1); let r; try { r = JSON.parse(l); } catch { continue; }
      r.__at = Date.now(); recs.push(r);
      // the product answers a permission ask over stdio: allow the one Bash the mock asked for
      if (r.type === 'control_request' && r.request?.subtype === 'can_use_tool') w.stdin.write(S({ type: 'control_response', response: { subtype: 'success', request_id: r.request_id, response: { behavior: 'allow', updatedInput: r.request.input } } }) + '\n');
    }
  });
  await sleep(500);
  return {
    recs, mock, w, dir, home, work, hub,
    log: () => { try { return fs.readFileSync(path.join(dir, 'chat-wrapper.log'), 'utf8'); } catch { return ''; } },
    sayBig: (o) => { const fp = path.join(dir, 'frame-' + Date.now() + '.json'); fs.writeFileSync(fp, S(o)); w.stdin.write(S({ type: '_frame_file', path: fp }) + '\n'); },
    write: (o) => w.stdin.write(S(o) + '\n'),
    say: (text, msgId, opts) => w.stdin.write(ad.formatChatInput(text, msgId, opts).stdinPayload + '\n'),
    stop: () => w.stdin.write(ad.formatInterrupt() + '\n'),
    hand: (state) => recs.filter((r) => r.type === 'input_handover' && r.state === state).flatMap((r) => r.msg_ids || []),
    results: () => recs.filter((r) => r.type === 'result').length,
    toolUse: () => recs.some((r) => r.type === 'assistant' && S(r.message?.content || []).includes('"tool_use"')),
    queued: (msgId) => recs.some((r) => r.type === 'queued_input' && r.msg_id === msgId),
    drops: () => recs.filter((x) => x.type === 'queue_dropped').map((d) => ({ items: (d.items || []).length, kept: d.kept || 0, keptIds: d.keptIds || [], landed: d.landed || 0, landedIds: d.landedIds || [] })),
    follows: () => recs.filter((x) => x.type === 'control_response' && /^vs-stop-follow-/.test(x.response?.request_id || '')).length,
    // the wrapper ends its CLI with it (SIGTERM, its exit awaited), then whatever is still rooted in the leg's dir
    end: async () => { await stopWrapper(w); try { endRootedProcesses(dir); } catch { } mock.close(); if (hub) hub.close(); },
  };
}
/** THE RESTART, replayed (r4): the wrapper's history buffer (what boot-restore loads as session.buffer) merged with the CLI's
 *  JSONL by src/session-store.js, then rebuilt by the claude normalizer — in a child whose HOME is the leg's (the JSONL is
 *  found under it). Returns the user bubbles: words, images, chip, msgId. */
function restartReplay(r) {
  const js = `const path=require('path'),fs=require('fs');const SS=require(${S(path.join(REPO, 'src/session-store.js'))});const {createMessageManager}=require(${S(path.join(REPO, 'src/normalizers.js'))});
const buffer=fs.readFileSync(${S(path.join(r.dir, 's.buf'))},'utf8');let sid=null;for(const l of buffer.split('\\n')){try{const x=JSON.parse(l);if(x.type==='system'&&x.subtype==='init'&&x.session_id){sid=x.session_id;break;}}catch{}}
const recs=new SS.SessionMessages({buffer,cwd:${S(r.work)},claudeSessionId:sid,backend:'claude'},'replay',{buffersDir:${S(r.dir)}}).raw();
const mm=createMessageManager('claude','replay');mm.convertHistory(recs);
process.stdout.write(JSON.stringify(mm.messages.filter(m=>m.role==='user').map(m=>({text:(m.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ').slice(0,80),images:(m.content||[]).filter(b=>b.type==='image').length,chip:m.queueState||null,msgId:m.webuiMsgId||null}))));`;
  try { return JSON.parse(execFileSync(process.execPath, ['-e', js], { env: { HOME: r.home, PATH: process.env.PATH }, encoding: 'utf8', maxBuffer: 64 * 1048576, timeout: 60000 })); } catch (e) { return { threw: String(e.message || e).slice(0, 300) }; }
}
/** §A ③ (r2, re-derived r4): C, stamped, after a Stop that found B still held by the CLI — sent on the CLI's SIGNALS, never
 *  a fixed δ (the settle lands 38–70 ms after Stop on this box, so a fixed 45 ms was a coin flip): 'stop' (at once — always
 *  inside the window), 'result' (the moment the wrapper tees the CLI's interrupted result: B's follow-up is still to come —
 *  inside), 'settled' (once the wrapper logged the settle — outside: a plain send), or a number = a fixed δ the leg
 *  CLASSIFIES by what the wrapper did (held ⇒ it came inside, a plain send ⇒ after the settle) and prints. */
async function realLateC(at) {
  const r = await realWrapper('late-' + at);
  r.say('TOOL-5S run a slow command', 'm-a');
  await until(r.toolUse, 30000);
  await sleep(1200);
  r.say('MARK-B handed while the Bash runs', 'm-b', { steer: true });
  await sleep(1200);
  const reqsAtStop = r.mock.reqs.length;
  const tStop = Date.now();
  r.stop();
  if (at === 'result') await until(() => r.recs.some((x) => x.type === 'result' && x.__at >= tStop), 5000, 1);
  else if (at === 'settled') await until(() => /stop settled/.test(r.log()), 8000, 2);
  else if (typeof at === 'number' && at > 0) { const tgt = tStop + at; while (Date.now() < tgt) await sleep(1); }
  const tC = Date.now() - tStop;
  r.say('MARK-C sent after Stop', 'm-c', { steer: true });
  await sleep(3500);
  // C left the held queue (the drain) at…
  const iq = r.recs.findIndex((y) => y.type === 'queued_input' && y.msg_id === 'm-c');
  const drained = iq < 0 ? null : r.recs.slice(iq + 1).find((x) => x.type === 'queue_changed' && !(x.items || []).some((it) => it.msgId === 'm-c'));
  const drainAt = drained ? drained.__at : null;
  const after = r.mock.reqs.slice(reqsAtStop);
  const out = {
    at, tC, delta: at, cHeld: r.queued('m-c'), cHanded: r.hand('handed').includes('m-c'), follows: r.follows(), drops: r.drops(),
    // the wrapper's own order of events: its settle line before C's «held» line (or C never held) = C came after the settle
    settledBeforeC: (() => { const lg = r.log(); const iS = lg.indexOf('stop settled'), iC = lg.indexOf('held a mid-turn frame'); return iS >= 0 && (iC < 0 || iS < iC); })(),
    reqsAfterStop: after.map((q) => ({ beforeDrain: drainAt === null || q.t < drainAt, carries: q.all })),
    answeredC: r.recs.some((x) => x.type === 'assistant' && /MARK-C/.test(S(x.message?.content || []))),
  };
  await r.end(); return out;
}
if (!claudeBin) skip('§A', 'no claude binary ($VS_CLAUDE_BIN, PATH, ~/.local/bin/claude) — the stand-in legs below still run');
else {
  console.log(`  (claude ${(() => { try { return execFileSync(claudeBin, ['--version'], { encoding: 'utf8', timeout: 20000, env: { HOME: os.tmpdir(), PATH: '/usr/bin:/bin' } }).trim(); } catch { return '?'; } })()})`);
  const [lands, stops, rl0, rlRes, rlSet, rl20, rl45, rride] = await Promise.all([
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
      await r.end(); return out;
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
      const follow = r.follows();
      const kept = r.drops().flatMap((d) => d.keptIds);
      const drop = r.drops().map((d) => ({ items: d.items, kept: d.kept }));
      r.say('MARK-D the next message after Stop', 'm-d');
      await until(() => r.mock.reqs.length > reqsAtStop + reqsAfterStop, 20000);
      await sleep(500);
      const next = r.mock.reqs[r.mock.reqs.length - 1];
      const out = { reqsAfterStop, follow, kept, drop, nextCarries: next ? next.all : null };
      await r.end(); return out;
    })(),
    realLateC('stop'), realLateC('result'), realLateC('settled'), realLateC(20), realLateC(45),
    (async () => {
      // ④ B rides the tool result, the model takes 1.5 s to answer it — Stop in that window
      const r = await realWrapper('ride', { postMs: 1500 });
      r.say('TOOL-3S run a slow command', 'm-a');
      await until(r.toolUse, 30000);
      await sleep(800);
      r.say('MARK-B handed while the Bash runs', 'm-b', { steer: true });
      await until(() => r.mock.reqs.some((q) => q.hasTool), 20000);
      await sleep(300);
      r.stop();
      await sleep(2000);
      const out = { rodeWith: (r.mock.reqs.find((q) => q.hasTool) || {}).lastText?.includes('MARK-B') || false, drops: r.drops(), follows: r.follows(), landedAfter: r.hand('landed') };
      await r.end(); return out;
    })(),
  ]);
  ok(lands.afterTool.length === 1 && /The user sent a new message while you were working:\s*MARK-B handed while the Bash runs/.test(lands.afterTool[0]) && lands.results === 1, '§A ① the REAL CLI took the stamped frame INTO THE RUNNING TURN: the request after the tool result carries «The user sent a new message while you were working: …» — one turn', lands);
  ok(S(lands.handed) === S(['m-b']) && S(lands.landed) === S(['m-b']), '§A ① …and the wrapper said handed → landed', lands);
  ok(stops.follow === 1 && S(stops.kept) === S(['m-b']) && stops.reqsAfterStop === 0, '§A ② Stop while the CLI held it: the CLI started a turn for it, the wrapper interrupted it on its init — NO request reached the model after Stop', stops);
  ok(S(stops.drop) === S([{ items: 0, kept: 1 }]), '§A ② …ONE queue_dropped that puts nothing back and counts the handed frame (the toast\'s «stays with the turn»)', stops);
  ok(Array.isArray(stops.nextCarries) && stops.nextCarries.includes('MARK-B') && stops.nextCarries.includes('MARK-D'), '§A ② …and it stayed in the conversation: the next message\'s request carries it too', stops);
  for (const l of [rl0, rlRes]) {
    ok(l.cHeld && !l.cHanded && S(l.drops?.map((d) => d.keptIds)) === S([['m-b']]), `§A ③ the REAL CLI, C stamped at «${l.at}» (inside the Stop window by its signal, +${l.tC} ms): HELD as a plain queued send, never handed — ONE record keeps B`, l);
    ok(l.reqsAfterStop?.length === 1 && l.reqsAfterStop.every((q) => !q.beforeDrain) && l.answeredC, `§A ③ …«${l.at}»: NO request reached the model before the stop settled; the one after it is C's own turn (eeece327 at δ=20: a billed follow-up answered B and C)`, l);
  }
  ok(!rlSet.cHeld && !rlSet.cHanded && rlSet.answeredC && rlSet.reqsAfterStop?.length === 1 && rlSet.follows === 1, `§A ③ C stamped once the stop SETTLED (+${rlSet.tC} ms, the wrapper's own settle line): a plain send — it runs as its own turn, and B's follow-up was still interrupted`, rlSet);
  for (const l of [rl20, rl45]) {
    const inside = l.cHeld;
    console.log(`    §A ③ δ=${l.at} ms: C came ${inside ? 'INSIDE the window (held)' : 'AFTER the settle (a plain send)'} — the settle ${l.settledBeforeC ? 'preceded' : 'followed'} it`);
    ok(!l.cHanded && l.answeredC && l.reqsAfterStop?.length === 1 && l.reqsAfterStop.every((q) => !inside || !q.beforeDrain) && S(l.drops?.map((d) => d.keptIds)) === S([['m-b']]) && (inside || l.settledBeforeC), `§A ③ δ=${l.at} ms, judged by its signal: never handed, nothing answered B, C ran as its own turn — ${inside ? 'held until the settle' : 'a plain send after it'}`, l);
  }
  ok(rride.rodeWith && S(rride.drops) === S([{ items: 0, kept: 1, keptIds: ['m-b'], landed: 0, landedIds: [] }]) && rride.follows === 0 && S(rride.landedAfter) === S(['m-b']), '§A ④ (r4) the REAL CLI, Stop after B rode the tool result but before the model spoke: not proven read, so the record KEEPS it — the CLI started no follow-up (it had taken it in), so the settle says `landed` afterwards', rride);
  // ── §A, ACCEPTANCE r4: the product's own prompt hook, and the restart ──
  const [hookStopReal, copyReal, editReal] = await Promise.all([
    (async () => {
      // ⑤ the product's hook taking ~2.9 s (prompt-context answers after 2.8 s) before the follow-up's init
      const r = await realWrapper('hookstop', { hookCtxMs: 2800 });
      r.say('TOOL-8S run a slow command', 'm-a');
      await until(r.toolUse, 30000);
      await sleep(1500);
      r.say('MARK-B handed then Stop', 'm-b', { steer: true });
      await sleep(1500);
      const reqsAtStop = r.mock.reqs.length, tStop = Date.now();
      r.stop();
      await until(() => /stop settled/.test(r.log()), 15000);
      await sleep(800);
      const lg = r.log();
      const out = { reqsAfterStop: r.mock.reqs.length - reqsAtStop, follows: r.follows(), waited: /the window waits for its init/.test(lg), clockLines: lg.split('\n').filter((l) => /bound:|backstop:/.test(l)).length, hookAfterStop: r.hub.calls.filter((c) => c.at > tStop && /prompt-context/.test(c.url)).length };
      await r.end(); return out;
    })(),
    (async () => {
      // ⑥ a 400 KB screenshot frame held mid-tool (the server's _frame_file road), drained, run — then THE RESTART
      const r = await realWrapper('copy');
      r.say('TOOL-4S run a slow command', 'm-a');
      await until(r.toolUse, 30000);
      await sleep(800);
      r.sayBig({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'IMG-1 what is wrong in this screenshot?' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo' + 'A'.repeat(400 * 1024) } }] }, webui_msg_id: 'm-i' });
      await until(() => r.results() >= 2, 30000);
      await sleep(500);
      await r.end();
      return { bubbles: restartReplay(r) };
    })(),
    (async () => {
      // ⑦ a held frame EDITED on the strip, drained, run — then THE RESTART
      const r = await realWrapper('edit');
      r.say('TOOL-4S run a slow command', 'm-a');
      await until(r.toolUse, 30000);
      await sleep(800);
      r.say('MARK-E please run the tests on staging', 'm-e');
      await until(() => r.recs.some((x) => x.type === 'queue_changed' && (x.items || []).some((it) => it.msgId === 'm-e')), 5000);
      const row = (r.recs.filter((x) => x.type === 'queue_changed').pop().items || []).find((it) => it.msgId === 'm-e') || {};
      r.write({ type: 'queue-op', op: 'edit', id: row.id, text: 'MARK-E please run the tests locally, NOT on staging' });
      await until(() => r.results() >= 2, 30000);
      await sleep(500);
      await r.end();
      return { bubbles: restartReplay(r) };
    })(),
  ]);
  ok(hookStopReal.reqsAfterStop === 0 && hookStopReal.follows === 1 && hookStopReal.waited && hookStopReal.clockLines === 0, '§A ⑤ the REAL CLI with the product\'s OWN prompt hook (~2.9 s before the follow-up\'s init): the window waited through it, the init was interrupted — NO request after Stop (7df30f96: its 2 s clock closed the window inside the hook and the follow-up was answered)', hookStopReal);
  const img = Array.isArray(copyReal.bubbles) ? copyReal.bubbles.filter((b) => /IMG-1/.test(b.text)) : [];
  ok(img.length === 1 && img[0].images === 1 && img[0].msgId === 'm-i', '§A ⑥ a 400 KB screenshot held mid-turn, after THE RESTART (the buffer merged with the CLI\'s JSONL, rebuilt): ONE bubble, WITH the image (7df30f96: one bubble, 0 images — its text-only copy hid the record)', copyReal);
  const ed = Array.isArray(editReal.bubbles) ? editReal.bubbles.filter((b) => /MARK-E/.test(b.text)) : [];
  ok(ed.length === 1 && /locally, NOT on staging/.test(ed[0].text), '§A ⑦ a held frame EDITED then run, after THE RESTART: ONE bubble with the latest words (7df30f96: the never-sent original beside it)', editReal);
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
  const home = scratchHome('cst-home', fs);
  const cwd = scratchDir('cst-cwd');
  const capDir = scratchDir('cst-cap');
  const chromeDir = scratchDir('cst-chrome');
  // HYGIENE (r2): every process this leg started — the browser (its profile dir names it), the server and what it
  // spawned (HOME: the device daemon, the dtach masters, the wrappers), the CLIs (their cwd) — ends BEFORE the scratch
  // dirs go: scratch.mjs removes them at exit, and a browser still running then wrote its profile back (8 KB left each run)
  const cleanup = () => {
    for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
    for (const root of [chromeDir, home, wt, cwd, capDir]) { try { endRootedProcesses(root); } catch { } }
    try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch { }
    try { fs.rmSync(wt, { recursive: true, force: true }); } catch { }
  };
  atExit.push(cleanup);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
  const cap = path.join(capDir, 'cli-got.jsonl'), dlv = path.join(capDir, 'delivered.jsonl');
  // the CLI the server spawns: answers the boot probes, else the stand-in (a TOOL- turn's Bash works 6 s)
  const launcher = path.join(scratchDir('cst-bin'), 'claude');
  fs.writeFileSync(launcher, `#!/bin/sh\ncase "$1" in --version) echo "2.1.308 (Claude Code) stand-in"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac\nSTUB_CAPTURE=${S(cap)} STAND_IN_DELIVERED=${S(dlv)} STAND_IN_LONG_MS=6000 exec ${S(process.execPath)} ${S(STAND_IN)} "$@"\n`, { mode: 0o755 });
  try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch { }
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: REPO, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${REPO}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
  // ALWAYS this tree's own version (the copied src/ may carry a stale generated one — the page then reloads itself mid-leg)
  fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${S(JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version)};\n`);
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
  const laneWrapperSrc = fs.readFileSync(path.join(wt, 'data/bin/chat-wrapper.js'), 'utf8');
  const [PORT, CDP_PORT] = await freePorts(2);
  let journal = '';
  const { DBUS_SESSION_BUS_ADDRESS: _bus, ...envNoBus } = process.env;   // a scratch server never reaches the desktop bus
  let srv = null;
  const startServer = () => {
    srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: ['ignore', 'pipe', 'pipe'], env: { ...envNoBus, ...VNC_ENV, PORT: String(PORT), HOME: home, CLAUDE_CMD: launcher, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
    procs.add(srv);
    srv.stdout.on('data', (d) => { journal = (journal + d).slice(-8000); }); srv.stderr.on('data', (d) => { journal = (journal + d).slice(-8000); });
  };
  // ⑧ a server restart: SIGTERM (its sessions live on in their own processes — the product's promise), its exit awaited
  const restartServer = async () => {
    const s = srv; const exited = new Promise((r) => s.once('exit', r));
    try { s.kill('SIGTERM'); } catch { }
    const t = setTimeout(() => { try { s.kill('SIGKILL'); } catch { } }, 8000);
    await exited; clearTimeout(t); procs.delete(s);
    startServer();
    return until(async () => (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok, 60000, 200);
  };
  startServer();
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
  // a wrapper process that has loaded its code has written its sidecar (both start with the .354 three: this one gains the
  // steer pair at its CLI's first state word, r2) — so the swap waits on the COUNT of sidecars carrying caps
  const sidecars = () => { const d = path.join(wt, 'data', 'session-buffers'); try { return fs.readdirSync(d).filter((f) => f.endsWith('.json')).filter((f) => { try { return Array.isArray(JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')).caps?.queueVerbs); } catch { return false; } }).length; } catch { return 0; } };
  if (baseWrapperSrc) {
    await until(() => sidecars() >= 1, 15000, 100);   // s1's wrapper is up
    fs.writeFileSync(path.join(wt, 'data/bin/chat-wrapper.js'), baseWrapperSrc);
    s2 = await create('c2', 'steer old wrapper');
    // the old process has loaded its code once its sidecar exists — only then does the new file go back
    await until(() => sidecars() >= 2, 15000, 100);
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
  const waitTurnEnd = (k, ms = 20000) => until(async () => !(await streaming(k)), ms, 150);
  /** Every user bubble holding `text` in window `k`: how many, and each one's chip (⑧ — the same message is drawn once). */
  const bubbles = (k, text) => ev(`(window.__${k}._messages || []).filter((x) => x.role === 'user' && JSON.stringify(x.content).includes(${S(text)})).map((m) => { const el = document.querySelector('[data-steer-leg="${k}"] [data-msg-id="' + m.id + '"]'); const chip = el && el.querySelector('[data-queue-state]'); return { state: m.queueState || null, chip: chip ? chip.dataset.queueState : null }; })`);
  /** The window of `created` in this page — the one the restored layout drew, else a fresh attach — once its history is in. */
  const reopen = (created, key, name) => ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let v = null;
    for (let i = 0; i < 40 && !v; i++) { v = [...window.app.sessions.values()].find((x) => x && x._chatInput && !x._disposed && x.sessionId === ${S(created.sessionId)}) || null; if (!v) await sleep(250); }
    if (!v) { const winId = window.app.attachSession(${S(created.sessionId)}, ${S(name)}, ${S(cwd)}, { mode: 'chat', backend: 'claude' }).id; for (let i = 0; i < 150; i++) { v = window.app.sessions.get(winId); if (v && v._chatInput && !v._readOnly) break; await sleep(200); } }
    for (let i = 0; i < 150 && v && !(v._messages || []).length; i++) await sleep(200);
    if (v) { window[${S('__' + key)}] = v; v._container.dataset.steerLeg = ${S(key)}; }
    return { ok: !!(v && v._chatInput), ro: v ? !!v._readOnly : null, n: v ? (v._messages || []).length : 0 };
  })()`);
  /** ⑦ A SECOND TAB on the same conversation (its own CDP socket). Its layout never travels — a second tab saving its
   *  layout closes the first one's window (the acceptance probe's isolation, kept): only the conversation is shared. */
  const openTab = async (created, name) => {
    const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const sock = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r) => sock.on('open', r));
    let sq = 0; const pd = new Map();
    sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pd.has(m.id)) { pd.get(m.id)(m); pd.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') pageErrors.push('tab 2: ' + (m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '?')); });
    const c2 = (method, params = {}) => new Promise((res) => { const id = ++sq; pd.set(id, res); sock.send(S({ id, method, params })); });
    const e2 = async (expr) => { const r = await c2('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(S(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
    await c2('Runtime.enable'); await c2('Page.enable');
    await c2('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await c2('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await c2('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}-tab2` });
    await until(() => e2('!!(window.app && window.app.ready)'), 45000, 250);
    await e2('window.app.ready.then(() => true)');
    await e2('(() => { const lm = window.app.layoutManager; lm._handleRemoteSync = () => {}; lm.scheduleAutoSave = () => {}; return true; })()');
    const o = await e2(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let v = [...window.app.sessions.values()].find((x) => x && x._chatInput && !x._disposed && x.sessionId === ${S(created.sessionId)}) || null;
      if (!v) { const winId = window.app.attachSession(${S(created.sessionId)}, ${S(name)}, ${S(cwd)}, { mode: 'chat', backend: 'claude' }).id; for (let i = 0; i < 150; i++) { v = window.app.sessions.get(winId); if (v && v._chatInput && !v._readOnly) break; await sleep(200); } }
      window.__vt = v; return { ok: !!(v && v._chatInput && !v._readOnly) };
    })()`);
    const altEnter = async (text) => {
      await c2('Page.bringToFront');
      await e2('(() => { const t = window.__vt._chatInput._textarea; t.focus(); return document.activeElement === t; })()');
      await c2('Input.insertText', { text });
      for (const type of ['keyDown', 'keyUp']) await c2('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 1 });
    };
    // THE LAG: this composer believes no turn runs — a pinned getter (every event that would flip it is kept aside)
    const lag = (on) => e2(on
      ? '(() => { const ci = window.__vt._chatInput; ci.__real = ci._isStreaming; Object.defineProperty(ci, "_isStreaming", { get() { return false; }, set(v) { ci.__real = v; }, configurable: true }); return ci._isStreaming; })()'
      : '(() => { const ci = window.__vt._chatInput; const r = ci.__real; delete ci._isStreaming; ci._isStreaming = r; delete ci.__real; return ci._isStreaming; })()');
    const sent = () => e2('(window.__vtSent || [])');
    await e2('(() => { const ws = window.__vt._chatInput._ws; const orig = ws.send.bind(ws); window.__vtSent = []; ws.send = (m) => { try { if (m && m.type === "chat-input") window.__vtSent.push({ steer: m.steer === true, text: String(m.text || "").slice(0, 60) }); } catch { } return orig(m); }; return true; })()');
    return { o, altEnter, lag, sent, ev: e2, close: async () => { try { sock.close(); } catch { } try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`); } catch { } await cdp('Page.bringToFront'); } };
  };
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

    // ⑦ (r2) A SECOND TAB whose streaming flag LAGS: its Alt+Enter mid-tool is still the person's HOLD
    const tab2 = await openTab(s1, 'steer new');
    ok(tab2.o && tab2.o.ok, '§B ⑦ a second tab opened the same conversation live', tab2.o);
    await typeSend('v1', 'TOOL-5 a turn two tabs watch');
    await until(() => streaming('v1'), 10000, 100);
    await until(async () => (await toolCards('v1')) >= 4, 10000, 100);
    await until(() => tab2.ev('!!window.__vt._chatInput._isStreaming'), 5000, 100);
    const lagged = await tab2.lag(true);
    await tab2.altEnter('LAG-G held from the lagging tab');
    const reachedMidTurn = await until(() => cliGot('LAG-G held'), 1500, 50);
    await cdp('Page.bringToFront');
    await until(async () => (await ev(STRIP('v1'))).visible, 4000, 100);
    const strip7 = await ev(STRIP('v1'));
    const gChip = await until(async () => (await bubble('v1', 'LAG-G')).chip === 'queued', 3000, 80) ? await bubble('v1', 'LAG-G') : await bubble('v1', 'LAG-G');
    const sent7 = await tab2.sent();
    await tab2.lag(false);
    await waitTurnEnd('v1');
    await until(() => delivered().some((d) => d.how === 'turn' && d.text === 'LAG-G held from the lagging tab'), 8000, 100);
    const gOwn = delivered().some((d) => d.how === 'turn' && d.text === 'LAG-G held from the lagging tab');
    await tab2.close();
    ok(lagged === false && S(sent7) === S([{ steer: false, text: 'LAG-G held from the lagging tab' }]) && !reachedMidTurn, '⑦ the lagging tab\'s Alt+Enter went out UNSTAMPED and the CLI never got it mid-turn (eeece327: stamped — the hold became a hand-over)', { lagged, sent7, reachedMidTurn });
    ok(strip7.visible && /LAG-G held from the lagging tab/.test(strip7.text) && gChip.chip === 'queued' && gOwn, '⑦ …a strip row and «Queued» on the bubble, and it ran as its own turn after this one', { strip7, gChip, gOwn });
    await waitTurnEnd('v1');

    // ⑥ ≤ 768 px: the hold button beside Send (Send itself hands the message over). ⑤'s toast sits over the composer's
    // controls on a phone for its 6 s — a person taps after it is gone, so the leg starts after it too
    await until(async () => !(await ev(`document.querySelectorAll('#global-toasts .global-toast').length`)), 12000, 200);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(800);
    // the phone face sends with its Send button (a touch keyboard's Enter is a newline there)
    const phoneIdle = await ev(HINT('v1'));
    // ⑧ needs this turn alive across a server restart: its tool runs three times as long (LONGER-)
    await focus('v1'); await cdp('Input.insertText', { text: 'TOOL-4 LONGER- a phone turn' });
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
    ok(phoneIdle.hold && !phoneIdle.bolt, '⑥ …and at IDLE too: the hold door is the capability\'s, never the streaming flag\'s (r2 — a lagging client still has it; at idle it is a plain send)', phoneIdle);
    ok(held6 && strip6.visible && /PHONE-E held with the button/.test(strip6.text) && !cliGot('PHONE-E held'), '⑥ …a tap on it HOLDS the message (a strip row; the CLI never got it)', { held6, miss: realClick.lastMiss, strip6 });
    await cdp('Emulation.clearDeviceMetricsOverride');

    // ⑧ (r2) THE SERVER RESTARTS while PHONE-E is still held, and the page reloads: every message the person sent mid-turn
    // is a record of the conversation — its bubble comes back ONCE, with its last chip
    const restarted = await restartServer();
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}-restarted` });
    await until(() => ev('!!(window.app && window.app.ready)'), 45000, 250);
    await ev('window.app.ready.then(() => true)');
    const o1r = await reopen(s1, 'v1', 'steer new');
    await until(async () => (await bubbles('v1', 'PHONE-E')).some((b) => b.chip === 'queued'), 8000, 150);
    const after8 = {};
    for (const t of ['ENTER-B', 'ALT-C', 'STOP-D', 'LAG-G', 'PHONE-E']) after8[t] = await bubbles('v1', t);
    const strip8 = await ev(STRIP('v1'));
    await shot('8-after-restart');
    ok(restarted && o1r && o1r.ok, '§B ⑧ the server restarted mid-turn and the reloaded page reopened the conversation live', { restarted, o1r, journal: journal.slice(-600) });
    ok(S(after8['ENTER-B'].map((b) => b.chip)) === S(['steered']) && S(after8['ALT-C'].map((b) => b.chip)) === S(['steered']) && S(after8['STOP-D'].map((b) => b.chip)) === S(['kept']) && S(after8['LAG-G'].map((b) => b.chip)) === S([null]), '⑧ after the restart each handed message is back ONCE with its last chip — «Steered», «Steered», «Stays with the stopped turn» — and the one that was held and ran, once with none (eeece327: gone)', after8);
    ok(S(after8['PHONE-E'].map((b) => b.chip)) === S(['queued']) && strip8.visible && /PHONE-E held with the button/.test(strip8.text), '⑧ …the message STILL HELD across it: its bubble «Queued» and its strip row (the base lost a held bubble the same way)', { phoneE: after8['PHONE-E'], strip8 });
    await waitTurnEnd('v1', 40000);
    await until(() => delivered().some((d) => d.how === 'turn' && d.text === 'PHONE-E held with the button'), 8000, 100);
    await sleep(600);
    const eAfter = await bubbles('v1', 'PHONE-E');
    ok(S(eAfter.map((b) => b.chip)) === S([null]) && delivered().some((d) => d.how === 'turn' && d.text === 'PHONE-E held with the button'), '⑧ …and when the turn ended it ran — still one bubble', eAfter);
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
  // the browser, the server, its daemon and every session process end NOW — before the exit hook removes their dirs
  cleanup();
  await sleep(500);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skipped} skipped)` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
