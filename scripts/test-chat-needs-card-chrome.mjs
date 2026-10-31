#!/usr/bin/env node
// WHAT A CONVERSATION ASKS OF YOU IS A CARD IN ITS CHAT, IN A REAL CHROME (lane chat-needs-you-card — the owner 2026-10-26:
// «这个界面里是不是应该有个地方能让我看到需要approve？», on a channel watch the agent set up whose approval sat only in the tray).
// A throwaway server in a git worktree (this tree's src/ + built public/, the fake channel adapters on), ONE stub `claude`
// conversation behind the real chat-wrapper whose turns RUN THE REAL CLIs as Bash tool calls (a tool card + its output):
// `vibespace-ask … --options` (an ask with chips), `vibespace-channels request` (an access request, filed under 'channels'
// + `about`) and `vibespace-channels watch … --mode wake` (THE owner's case: a watch request `wr-…`), and headless Chrome
// over raw CDP:
//   ⓪ RED CONTROL FIRST — a bundle built from this source without the needs cards (the base's chat): the ask is open and
//     its chat shows NO card and NO «waiting for you» chip; the tray alone holds it
//   ① TWO CLIENTS (1280 mouse) with the conversation's chat open, then the watch request filed: the card appears INSIDE
//     the tool card that ran `vibespace-channels watch` within 1 s on BOTH; its words, its Approve / Reject (the tray's own
//     verbs); the ask's card stands in ITS tool card with its option chips; the agent's tool output carries the ONE line
//     «Filed for you: an approval — answer it on the card in this conversation or in … (wr-…)»
//   ② THE CHIP «waiting for you · N» names the kinds; its click lists them (lane needs-card-tail: the chip is the index) and
//     the newest row lands the newest card (in view) and flashes it
//   ②b THE PRESS ARM AND A SCROLL (found here; the owner met it 2026-10-26) — RED CONTROL first: a bundle without the arm's
//     re-stamp on scroll — the transcript scrolls the Approve, it rests 1.5 s, the press is REFUSED «moved under the pointer»
//   ③ the same press on this tree ⇒ ACCEPTED: the watch request is approved on the hub, client B's card becomes the quiet record
//     «approved by you · HH:MM» in its tool card (lane wake-approve-card's stamp) and its tray item is resolved; the chip says the one left
//   ④ A RELOAD keeps the open card at its tool card and the chip
//   ④b an answer from ANOTHER client (a reply posted on A's road while B is in front) — B's card patched IN PLACE (the same
//     element, «you replied»; never the transcript re-rendered)
//   ⑤ THE PHONE (375×812 touch, compact): the card at the touch scale — its words 16 px, every target ≥ 44 × 44, the
//     detail fold a row; the phone page's row for the same item is the same item; a chip answers it and both resolve
//   ⑥ THE ACCORDION (acceptance round 2, P2 — six open items were six whole cards): one agent turn runs vibespace-ask six
//     times ⇒ ONE open card (the newest) + five folded rows — at 375 touch the sheet's row (question + age, ≥ 44 px, nothing
//     else), at 1280 ONE line (the question + « · age», a ≥ 24 px target); a tap / a click / Enter on a folded row opens it
//     IN PLACE (held under the pointer) and folds the open one. RED CONTROL first at both sizes: this source with the open
//     slot cut (the first commit's shape — six whole cards)
//   ⑦ THE CHIP'S HIT SIZE (acceptance round 2, P2 — it was 154×14): measured by hit-testing, ≥ 24 × 24 at 1280 and ≥ 44 × 44
//     at 375 touch; and every visible clickable in the cards ≥ 24 × 24 at 1280 (the .358 mouse-target law)
//   ⑧ THE COUNT IS ONE SOURCE (acceptance round 2, P3 — the chip read 5 beside 6 cards): a frame sampler (every animation
//     frame) while a 7th question is filed ⇒ the chip and the visible cards go 6/6 → 7/7 with no frame between; Mark done on
//     it ⇒ 6/6, likewise
//   ACCEPTANCE ROUND 4 (each RED on c6dd7a6e): ② a pass that changed no card reads NO layout (rects counted over the pass);
//     ④b Esc in a KEPT box ⇒ the card is its one quiet line within a frame (the one exit); ⑥b the tapped TEXT LINE held on a
//     pinned view, the answers inside the list; ⑥c THE BOTTOM EDGE at 1280 mouse + 375 touch — a folded row ON the list's
//     bottom edge opens with its line never dropping and its lowest verb brought inside by the minimum scroll, and a double
//     press there answers nothing (its RED CONTROL last: this source without the card's refusal of a moved verb — the second
//     press answers with the chip the reveal put under it); ⑨ a kept card whose item leaves the snapshot's resolved tail is
//     still patched
//   ACCEPTANCE ROUND 5 (each RED on 4d82ef07): ⑩ a transcript that fits its list — a double press on the second's folded row
//     answers nothing (the refusal keyed on the MEASURED landing), ⑩b the held line's right end (its RED CONTROL: this source
//     without the pressed-row clause); ⑪ a card taller than the list at 375×667 keeps its question inside; ⑫ the room a hold
//     borrowed goes back on every road that ends its need. ROUND 6 (RED on d5e373b8): ⑫ the borrowing card's OWN «detail»
//     opened, then closed, at the live tail — its line never moves (the card's own size neither returns nor needs the room)
//   LANE NEEDS-CARD-TAIL (each RED on 90c995a3 — the owner on 2.369.360: «这个应该同时堆叠在页面最下吗？» + R5 «…直接跳转到对应的
//     上下文»): ⑬ six asks, then ~300 records of history (the window at the tail, their records far above it) ⇒ ONE docked card
//     (the newest, its dock line) at 1280 and 390×844, the chip «· 6 questions»; the chip's click LISTS the six (newest first,
//     the age kept) and choosing the oldest loads the window up to it and opens its card in its tool card; the docked ask
//     answered elsewhere ⇒ the dock and the chip move in the same frame; the tray row's door lands on the record that filed
//     it; an ask with no record docks at the end saying why; a reader who scrolled is never moved by a broadcast, a press lands.
//     ROUND 2 (each RED on 9de5c902): ⑭ three asks over ~900 records — 4 wheels up (an older page loaded) the dock stays under
//     the LAST displayed record, and is there back at the bottom; the chip's walk (the oldest, then one filed BELOW that window)
//     lands at its record; a slow landing (2.5 s pages) never overrules the newer press; the DOCKED ask answered on another
//     client moves a scrolled reader 0 px; the door of an answered ask whose record is folded opens the run and lands on it.
//   LANE NEEDS-CARD-TAIL r10 (each RED on bd5c5fd98 — the owner 2026-10-30: «…不要停靠在聊天内容本身里了，而是体现出"这是专门停靠
//     等我操作的事情，不会随着 chatview 浮动"的一个 UI»): THE ATTENTION DOCK replaces the docked card AND the bar's chip — ⑬/⑭: no
//     card at the end, the strip «· N» shows the newest, a tap on its question lands it, an ask with no record lands at the
//     live end and is SAID; ⑰ the strip's stress shapes (1 / 3 / 30 items, a 400-char question, six options, an answer on
//     the phone, a 320 px window, a 6-line composer, a filing 5000 px up, the strip never moving with a scroll) + its shots;
//     ⑱ THE ANNOUNCE (the owner's addendum, 11:5x: «有权限申请的时候窗口应该触发闪烁和 inbox 附近的弹窗»): a new ask flashes its window
//     and stands as a card at the For-you button — ten in a minute, one expiring while up, two windows at once, seen, one press
//     opens it, the phone.
//   SHOTS (desktop 1280 + phone 375): the watch request card, the ask with its chips, a resolved card, the accordion; ⑬'s
//     desktop-1280-tail / phone-390-tail / desktop-1280-chip-list / -chip-landed / -door-landed / -no-record-docked; ⑭'s
//     desktop-1280-r2-after-4-wheels / -back-at-bottom / -below-window / -race / -folded-door.
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-chat-needs-card-chrome.mjs [--shots <dir>]
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.log('✗ no public/bundle.js — run `npm run build` first'); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('chat-needs-wt');
const fakeHome = scratchHome('chat-needs-home', fs);
const chromeDir = scratch('chat-needs-chrome');
const stubDir = scratch('chat-needs-stub');
const MUT = scratch('chat-needs-mut');
const MUT2 = scratch('chat-needs-mut2');
const MUT4 = scratch('chat-needs-mut4');
const MUT5 = scratch('chat-needs-mut5');
const WORK = path.join(stubDir, 'work', 'ops');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : scratch('chat-needs-shots');
for (const d of [stubDir, WORK, SHOTS]) fs.mkdirSync(d, { recursive: true });
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CONV = 'fake-poll/fake-poll-ops';

// ── the stub CLI: each user line = ONE turn; a line naming a verb RUNS the real CLI as a Bash tool call (tool_use → the CLI
//    through the hub → tool_result = its output), then one sentence; the CLIs are this tree's data/bin, run by node ──
fs.writeFileSync(path.join(stubDir, 'claude'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
const { spawnSync } = require('child_process');
const SID = 'cn-' + process.pid;
const BIN = ${JSON.stringify(path.join(wt, 'data', 'bin'))};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5-1', cwd: process.cwd(), tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.308' });
const VERBS = {
  ask: ['vibespace-ask', ['Which do we ship first?', '--detail', 'A: the payments fix — small, tested. B: the reports page — larger. I recommend A.', '--options', 'A — payments fix|B — reports page']],
  request: ['vibespace-channels', ['request', ${JSON.stringify(CONV)}, 'I watch the ops room for outages while you are away']],
  watch: ['vibespace-channels', ['watch', ${JSON.stringify(CONV)}, '--mode', 'wake', '--why', 'wake me on outages so I can open an incident']],
  tall: ['vibespace-ask', ['Before I merge the reports page tonight, which of the five rollout plans do we take, given that the payments fix already went out this morning, the team is away until Monday, the on-call rota has one person on it, and the last staged rollout took four hours to finish?', '--detail', 'Each plan is written up in the release notes. I recommend B.', '--options', 'Plan A — ship it all|Plan B — staged|Plan C — behind a flag|Plan D — wait a day|Plan E — ask the team']],
  // lane needs-card-tail r10 (⑰): a 400-character question, and one with six options
  big: ['vibespace-ask', ["Before we cut the release tonight, which of the rollout plans do we take for the reports page, given that the payments fix went out this morning, the team is away until Monday, the on-call rota has one person on it, the last staged rollout took four hours to finish, two customers asked for the export button by Friday, the database migration is still running on the replica, and the notes for support are not written yet?", '--detail', 'Plan A ships tonight; plan B waits for Monday. I recommend B.', '--options', 'A — tonight|B — Monday']],
  six: ['vibespace-ask', ['Which region do we open next?', '--detail', 'Six regions are ready; one at a time.', '--options', 'Frankfurt|Tokyo|São Paulo|Sydney|Toronto|Mumbai']],
};
let n = 0, buf = '', chain = Promise.resolve();
const turn = (line) => {
  const k = ++n;
  // lane needs-card-tail: «do:fill150» = 150 steps in this one turn, each a line of text + a tiny tool call (a text record and
  // a tool card — consecutive text alone merges into one record): the history that puts what came before far above the
  // window a chat loads at its tail (the window walks back to 24 text cards)
  const fill = /do:fill(\\d+)(t?)/.exec(line); // (lane needs-card-tail r10: «t» = a tall line — ⑰'s reader 5000 px up)
  if (fill) {
    for (let j = 0; j < Number(fill[1]); j++) {
      out({ type: 'assistant', session_id: SID, uuid: 'a-f' + k + '-' + j, message: { id: 'mf' + k + '_' + j, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: fill[2] ? ('Filler line ' + j + ' of a long history, written long enough to wrap. ').repeat(14) : 'Filler line ' + j + ' of a long history.' }] } });
      out({ type: 'assistant', session_id: SID, uuid: 'a-ft' + k + '-' + j, message: { id: 'mft' + k + '_' + j, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: 'toolu_f' + k + '_' + j, name: 'Bash', input: { command: 'echo ' + j } }] } });
      out({ type: 'user', session_id: SID, uuid: 'u-ft' + k + '-' + j, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_f' + k + '_' + j, content: String(j), is_error: false }] } });
    }
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 200, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 12 } });
    return;
  }
  const verb = Object.keys(VERBS).find((v) => line.includes('do:' + v));
  // the stress shape (acceptance round 2): «do:q3 do:q4 …» = one ask per number, each its own Bash call in this ONE turn
  // (lane needs-card-tail: «do:h73» = a stress question whose tool output keeps the item's id to itself — no record NAMES it)
  const calls = verb ? [[verb, ...VERBS[verb]]] : [...line.matchAll(/do:([qlhu])(\\d+)/g)].map((m) => [m[1] + m[2], 'vibespace-ask', [(m[1] === 'l' ? 'Longer question ' + m[2] + ': ship change ' + m[2] + ' today, once the reports page and the payments fix are both merged and the notes are written?' : 'Stress question ' + m[2] + ': ship change ' + m[2] + ' today?'), '--detail', 'Change ' + m[2] + ' is ready and tested. I recommend yes.', '--options', 'yes|no', ...(m[1] === 'u' ? ['--urgency', 'urgent'] : [])]]); // (r11: «do:u» = urgent — band 1, the announce's)
  // lane needs-card-tail r10 (⑰'s thirty): «do:par» files the turn's asks SIX at a time (one Bash card each, the same
  // records — the results land when their batch has run); a serial turn of 29 real CLI calls took ~90 s of the suite's clock
  if (/do:par/.test(line)) {
    const { spawn } = require('child_process');
    const one = ([vb, cli, argv], j) => new Promise((res) => {
      const tid = 'toolu_cn' + k + '_' + j;
      const command = cli + ' ' + argv.map((a) => (/^[\\w./:-]+$/.test(a) ? a : JSON.stringify(a))).join(' ');
      out({ type: 'assistant', session_id: SID, uuid: 'a-t' + k + '-' + j, message: { id: 'mt' + k + '_' + j, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command, description: 'file it for the user' } }] } });
      const ch = spawn(process.execPath, [BIN + '/' + cli, ...argv], { env: process.env }); let text = '';
      ch.stdout.on('data', (d) => { text += d; }); ch.stderr.on('data', (d) => { text += d; });
      ch.on('close', (code) => { require('fs').appendFileSync(${JSON.stringify(path.join(stubDir, 'cli.log'))}, '### ' + vb + ' rc=' + code + '\\n' + text + '\\n'); out({ type: 'user', session_id: SID, uuid: 'u-t' + k + '-' + j, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: text || '(no output)', is_error: code !== 0 }] } }); res(); });
    });
    return (async () => {
      for (let b = 0; b < calls.length; b += 6) await Promise.all(calls.slice(b, b + 6).map((c, i) => one(c, b + i)));
      out({ type: 'assistant', session_id: SID, uuid: 'a-' + k, message: { id: 'm' + k, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'Filed them for you — they wait on your answer.' }] } });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 200, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 12 } });
    })();
  }
  calls.forEach(([vb, cli, argv], j) => {
    const tid = 'toolu_cn' + k + '_' + j;
    const command = cli + ' ' + argv.map((a) => (/^[\\w./:-]+$/.test(a) ? a : JSON.stringify(a))).join(' ');
    out({ type: 'assistant', session_id: SID, uuid: 'a-t' + k + '-' + j, message: { id: 'mt' + k + '_' + j, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command, description: 'file it for the user' } }] } });
    const r = spawnSync(process.execPath, [BIN + '/' + cli, ...argv], { env: process.env, encoding: 'utf8', timeout: 60000 });
    const text = String(r.stdout || '') + (r.stderr ? String(r.stderr) : '');
    require('fs').appendFileSync(${JSON.stringify(path.join(stubDir, 'cli.log'))}, '### ' + vb + ' rc=' + r.status + '\\n' + text + '\\n');
    out({ type: 'user', session_id: SID, uuid: 'u-t' + k + '-' + j, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: vb[0] === 'h' ? 'filed.' : text || '(no output)', is_error: r.status !== 0 }] } });
  });
  out({ type: 'assistant', session_id: SID, uuid: 'a-' + k, message: { id: 'm' + k, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: calls.length ? 'Filed it for you — it waits on your answer.' : 'ok' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 200, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 12 } });
};
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch {} if (!m || m.type !== 'user') continue; const c = m.message && m.message.content; const txt = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x && x.text || '').join(' ') : ''; chain = chain.then(() => new Promise((res) => setTimeout(() => { Promise.resolve(turn(txt)).then(res, res); }, 120))); } });
process.stdin.on('end', () => setTimeout(() => process.exit(0), 300));
`, { mode: 0o755 });

// ── the RED CONTROL's bundle: THIS source without the needs cards (the base's chat — a missing anchor = a named red in ⓪) ──
let MUT_BUNDLE = null, MUT_ERR = '';
try {
  fs.mkdirSync(MUT, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT, 'node_modules'));
  const sub = (rel, from, to) => { const f = path.join(MUT, rel); const s = fs.readFileSync(f, 'utf8'); if (s.split(from).length !== 2) throw new Error(`mutant anchor ${rel}: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, to)); };
  sub('src/lib/chat-view.js', '    this._needsCards = new NeedsCards(this);\n    this._needsCards.start(winInfo?._listenerCtl?.signal);\n', '');
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT });
  MUT_BUNDLE = fs.readFileSync(path.join(MUT, 'bundle-mut.js'));
} catch (e) { MUT_ERR = String(e && e.message || e).split('\n')[0]; }
// ── ②b's RED CONTROL: THIS source without the press arm's re-stamp on scroll (the old stamp: a row pass only) ──
let ARM_BUNDLE = null, ARM_ERR = '';
try {
  fs.mkdirSync(MUT2, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT2}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT2, 'node_modules'));
  const f = path.join(MUT2, 'src/lib/user-todos-panel.js'), s = fs.readFileSync(f, 'utf8');
  const from = "    if (want) document.addEventListener('scroll', onArmScroll, { capture: true, passive: true });\n"; // round 3 (m4): armed only while a stamped button is on the page
  if (s.split(from).length !== 2) throw new Error('mutant anchor src/lib/user-todos-panel.js: the scroll re-stamp');
  fs.writeFileSync(f, s.replace(from, '    if (want) void 0; // RED: never listening\n'));
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT2 });
  ARM_BUNDLE = fs.readFileSync(path.join(MUT2, 'bundle-mut.js'));
} catch (e) { ARM_ERR = String(e && e.message || e).split('\n')[0]; }

// ── ⑥'s RED CONTROL: THIS source with the accordion's open slot cut — every waiting card whole (the first commit's shape) ──
const MUT3 = scratch('chat-needs-mut3');
let FOLD_BUNDLE = null, FOLD_ERR = '';
try {
  fs.mkdirSync(MUT3, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT3}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT3, 'node_modules'));
  const f = path.join(MUT3, 'src/lib/chat-needs-card.js'), s = fs.readFileSync(f, 'utf8');
  const from = 'fold: x.item.id !== openSlot';
  if (s.split(from).length !== 2) throw new Error('mutant anchor src/lib/chat-needs-card.js: the open slot');
  fs.writeFileSync(f, s.replace(from, 'fold: false'));
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT3 });
  FOLD_BUNDLE = fs.readFileSync(path.join(MUT3, 'bundle-mut.js'));
} catch (e) { FOLD_ERR = String(e && e.message || e).split('\n')[0]; }
// ── ⑥c's guard's RED CONTROL: THIS source without the card's refusal of a verb an open moved under the pointer (round 4) ──
let GUARD_BUNDLE = null, GUARD_ERR = '';
try {
  fs.mkdirSync(MUT4, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT4}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT4, 'node_modules'));
  const f = path.join(MUT4, 'src/lib/chat-needs-card.js'), s = fs.readFileSync(f, 'utf8');
  const from = 'if (unfold(ev) || card._openedAt == null';
  if (s.split(from).length !== 2) throw new Error('mutant anchor src/lib/chat-needs-card.js: the moved-verb refusal');
  fs.writeFileSync(f, s.replace(from, 'if (unfold(ev) || true'));
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT4 });
  GUARD_BUNDLE = fs.readFileSync(path.join(MUT4, 'bundle-mut.js'));
} catch (e) { GUARD_ERR = String(e && e.message || e).split('\n')[0]; }

// ── throwaway server in a worktree (the tree's src/ + built public/ + data/bin — the CLIs the stub runs) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srvLog = fs.openSync(path.join(SHOTS, 'server.log'), 'a');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: path.join(stubDir, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', NO_AUTO_OPEN: '1' }, stdio: ['ignore', srvLog, srvLog] });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  for (const root of [wt, fakeHome, stubDir, chromeDir]) { try { endRootedProcesses(root); } catch { } } // the server, dtach, the wrapper, the stub, Chrome (§57b)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [chromeDir, fakeHome, stubDir, MUT, MUT2, MUT3, MUT4, MUT5]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
// run bare (no gate) the suite assumes its ci.mjs row's budget (budgetFor: a chrome heavy row, 900 s) and says so — lane
// needs-card-tail r5: a run by hand took the 300 s default, and its own clock fired at 270 s, 23 s into ⑬, on a suite that
// runs ~430 s alone (int361's direct run of 497beb03; the gate's runs were green)
const BARE = !process.env.VIBESPACE_SUITE_BUDGET_MS;
// (lane needs-card-tail r10: ⑰ — the strip's stress shapes, two pages, ~40 real CLI filings — lifts the suite's own ceiling
// 600 → 840 s, inside its row's 900 s budget less the watchdog's 30 s)
const WD = armWatchdog({ capMs: 840e3, env: BARE ? { ...process.env, VIBESPACE_SUITE_BUDGET_MS: '900000' } : process.env, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
console.log(`watchdog: ${Math.round(WD.deadline.ms / 1000)} s (${WD.deadline.capped ? "the suite's own ceiling" : 'the budget − 30 s'}; the budget ${Math.round(WD.deadline.budgetMs / 1000)} s — ${BARE ? "a bare run: its ci.mjs row's" : "the gate's"})`);
for (let i = 0; i < 120; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP, one connection per page (+ the RED control's bundle through the Fetch domain) ──
const WebSocket = require('ws');
const FA = require(path.join(repo, 'src/foryou-actions.js')); // r11: newestFirst — the stack's and the dock's ONE order
let seq = 0; let mutant = null;
const pageErrors = [];
async function connect(target) {
  const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  const pend = new Map();
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
    if (m.method === 'Fetch.requestPaused') {
      const p = m.params, u = new URL(p.request.url);
      if (mutant?.bundle && u.pathname === '/bundle.js') sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.fulfillRequest', params: { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: mutant.bundle.toString('base64') } }));
      else sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.continueRequest', params: { requestId: p.requestId } }));
    }
  });
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
    sock.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(120); } try { return await evalJs(expr); } catch { return false; } };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
  // every card's FIRST sighting, stamped on the page's clock (= the hub's: one machine) — the «within 1 s» judge
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__cnSeen = {}; new MutationObserver(() => { for (const c of document.querySelectorAll('.cn-card[data-item]')) if (!window.__cnSeen[c.dataset.item]) window.__cnSeen[c.dataset.item] = Date.now(); }).observe(document, { childList: true, subtree: true });` });
  const device = async (w, h, { mouse = false } = {}) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mouse ? 1 : 2, mobile: !mouse });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: !mouse, maxTouchPoints: mouse ? 1 : 5 });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: mouse ? 'hover' : 'none' }, { name: 'pointer', value: mouse ? 'fine' : 'coarse' }] });
  };
  const load = async () => {
    await cdp('Page.navigate', { url: ORIGIN + '/' });
    await waitFor('!!(window.app && app.ready)', 30000); await evalJs('app.ready.then(() => true)');
    await waitFor(`!document.getElementById('loading-screen')`, 15000); await sleep(900);
  };
  const tapAt = async (x, y) => {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(60);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(350);
  };
  const clickAt = async (x, y) => {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(30);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(40);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(350);
  };
  const centre = (sel) => evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView?.({ block: 'nearest' }); const b = e.getBoundingClientRect(); return b.width && b.height ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`);
  const press = async (sel, { touch = true } = {}) => { const p = await centre(sel); if (!p) throw new Error('press: nothing at ' + sel); await (touch ? tapAt(p.x, p.y) : clickAt(p.x, p.y)); };
  const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
  return { cdp, evalJs, waitFor, device, load, tapAt, clickAt, press, shot, front: () => cdp('Page.bringToFront'), close: () => { try { sock.close(); } catch { } } };
}
// ── ⑩b's RED CONTROL: THIS source without the pressed-row clause of the moved-verb stamp (round 5 — the line alone) ──
let ROW_BUNDLE = null, ROW_ERR = '';
try {
  fs.mkdirSync(MUT5, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT5}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT5, 'node_modules'));
  const f = path.join(MUT5, 'src/lib/chat-needs-card.js'), s = fs.readFileSync(f, 'utf8');
  const from = 'Math.abs(landed - before) > 1 || under) el._openedAt';
  if (s.split(from).length !== 2) throw new Error('mutant anchor src/lib/chat-needs-card.js: the pressed-row clause');
  fs.writeFileSync(f, s.replace(from, 'Math.abs(landed - before) > 1) el._openedAt'));
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT5 });
  ROW_BUNDLE = fs.readFileSync(path.join(MUT5, 'bundle-mut.js'));
} catch (e) { ROW_ERR = String(e && e.message || e).split('\n')[0]; }

const targets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).filter((x) => x.type === 'page');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await targets())[0]; } catch { } if (!target) await sleep(250); }
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const A = await connect(target);

// ── the conversation (a stub claude behind the real chat-wrapper) and its turns ──
const hubWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const frames = [];
await new Promise((r) => hubWs.on('open', r)); hubWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
hubWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: WORK, reqId: 'cn-ops' }));
let SID = null; for (let i = 0; i < 100 && !SID; i++) { const f = frames.find((m) => m?.type === 'created' && m.reqId === 'cn-ops'); if (f) SID = f.sessionId; else await sleep(150); }
const say = (text) => hubWs.send(JSON.stringify({ type: 'chat-input', sessionId: SID, text }));
const api = async () => (await (await fetch(`${ORIGIN}/api/user-todos`)).json()).todos;
const findOpen = async (pred, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const it = (await api()).open.find(pred); if (it) return it; await sleep(150); } return null; };
const cliLog = () => { try { return fs.readFileSync(path.join(stubDir, 'cli.log'), 'utf8'); } catch { return ''; } };
/** the CLI's output lands in the log when the CLI EXITS — a moment after its item is on the hub */
const logHas = async (re, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(cliLog())) return true; await sleep(120); } return re.test(cliLog()); };
const CHAT = (sid) => `[...app.wm.windows.values()].find((w) => w.type === 'chat' && app.sessions.get(w.id)?.sessionId === ${JSON.stringify(sid)})`;
const openChat = (P) => P.evalJs(`(() => { if (!${CHAT(SID)}) app.attachSession(${JSON.stringify(SID)}, 'ops watch', ${JSON.stringify(WORK)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
/** The card of item `id` in page P: where it sits (the record's command), its kind, its verbs, its words, its rect. */
const CARD = (id) => `(() => { const c = document.querySelector('.cn-card[data-item="${id}"]'); if (!c) return null; const host = c.closest('.chat-msg'); const raw = host && host._rawMsg; const b = c.getBoundingClientRect(); const lr = c.closest('.chat-message-list')?.getBoundingClientRect();
  return { open: c.classList.contains('cn-open'), done: c.classList.contains('cn-done'), kind: c.dataset.kind, hostRole: raw && raw.role, hostCmd: raw && raw.content && raw.content[0] && raw.content[0].input ? String(raw.content[0].input.command || '') : '', head: c.querySelector('.cn-head')?.textContent || '', text: c.querySelector('.ut-text')?.textContent || '', verb: c.querySelector('.cn-line-verb')?.textContent || '', line: c.querySelector('.cn-line')?.textContent || '',
    verbs: [...c.querySelectorAll('button')].filter((x) => x.offsetParent).map((x) => (x.getAttribute('data-label') || x.textContent || '').trim()), chips: [...c.querySelectorAll('.ut-opt')].map((x) => x.textContent), approve: !!c.querySelector('.ut-action-proposal[data-answer="approve"]'),
    rect: { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }, list: lr ? { top: Math.round(lr.top), bottom: Math.round(lr.bottom) } : null, flash: c.classList.contains('chat-ask-flash'), el: !!c }; })()`;
/** the conversation's ChatView in the page (its needs cards, its list) */
const VIEW = `(() => { for (const v of app.sessions?.values?.() || []) if (v && v._needsCards && v._messageList?.isConnected) return v; return null; })()`;
/** lane needs-card-tail r10: THE ATTENTION DOCK's count (the strip above the message box — the bar's chip is gone) */
const CHIP = `(() => { const c = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'); if (!c || !c.offsetParent) return null; return { text: c.textContent.trim(), title: c.title, clickable: !!c.closest('.chat-attn-dock').querySelector('.cad-rows .ut-text[role="button"]') }; })()`;
/** THE PERSON'S PRESS AFTER A SCROLL: the transcript moves the card's Approve (the row pass stamped it before), rests 1.5 s
 *  (past ARM_MS), then a real click where it stands — → {moved, at, toast} */
const scrollThenPress = async (P, id) => {
  const sel = `.cn-card[data-item="${id}"] .ut-action-proposal[data-answer="approve"]`;
  const m = await P.evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; const l = b.closest('.chat-message-list'); const t0 = b.getBoundingClientRect().top; b.scrollIntoView({ block: 'center' }); if (Math.abs(b.getBoundingClientRect().top - t0) < 2) { l.scrollTop = Math.max(0, l.scrollTop - 60); if (Math.abs(b.getBoundingClientRect().top - t0) < 2) l.scrollTop += 120; } return { moved: Math.round(b.getBoundingClientRect().top - t0) }; })()`);
  await sleep(1500);
  const at = m && await P.evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (at) await P.clickAt(at.x, at.y);
  await sleep(700);
  const toast = await P.evalJs(`[...document.querySelectorAll('.global-toast')].map((x) => x.textContent).join(' | ')`);
  return { ...(m || {}), at, toast };
};
const T0 = Date.now();
const lap = (what) => console.log(`  (${what} at ${((Date.now() - T0) / 1000).toFixed(1)} s)`);

try {
  // setup: turn 1 files the ask (with its chips), turn 2 the access request; the owner approves the access (the reach route)
  await sleep(600); say('please do:ask');
  const ask = await findOpen((i) => i.text === 'Which do we ship first?');
  // the owner makes the ops room REQUESTABLE for this agent (the Reach dialog's own route) — its access request is then a real one
  await A.device(1280, 800, { mouse: true }); await A.load();
  const cid = ask ? ask.sessionKey.slice(ask.sessionKey.indexOf(':') + 1) : '';
  let reach = null; // the fake adapter lists its rooms a moment after boot — the write answers not-found until then
  for (let i = 0; i < 80 && !(reach && reach.status === 200); i++) { reach = await A.evalJs(`fetch('/api/channels/fake-poll/fake-poll-ops/reach', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principal: { kind: 'agent', id: ${JSON.stringify(cid)} }, level: 'requestable' }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`); if (!reach || reach.status !== 200) await sleep(250); }
  if (!reach || reach.status !== 200) console.log('  (setup: the reach write answered ' + JSON.stringify(reach).slice(0, 300) + ')');
  say('now do:request');
  const acc = await findOpen((i) => /requests access to/.test(i.text));
  check('setup: the stub ran the real CLIs — an ask with options (vibespace-ask) and an access request (vibespace-channels request, filed under \'channels\' + about)', !!ask && Array.isArray(ask.options) && ask.options.length === 2 && !!acc && acc.sessionKey === 'channels' && acc.about === ask.sessionKey, { ask, acc, cli: cliLog().slice(-1200) });
  await logHas(/\(rq-[^)]+\)/);
  check('setup: the agent\'s ONE line after each filing — «Filed for you: … — answer it on the card in this conversation or in …»', /Filed for you: a question — answer it on the card in this conversation or in the “For you” tray \(ut-[0-9a-f]{10}\)/.test(cliLog()) && /Filed for you: an approval — answer it on the card in this conversation or in the “For you” tray \(rq-/.test(cliLog()), cliLog().slice(-1500));

  if (!MUT_BUNDLE) check('⓪ the RED CONTROL bundle builds from this source (its anchor is this lane\'s line)', false, MUT_ERR);
  else try {
    console.log('⓪ RED CONTROL FIRST — the base\'s chat (no needs cards): the ask is open, its chat says nothing');
    mutant = { bundle: MUT_BUNDLE };
    await A.device(1280, 800, { mouse: true }); await A.load(); await openChat(A);
    await A.waitFor(`!!${CHAT(SID)} && document.querySelectorAll('.chat-msg-tool-result').length >= 2`, 15000); await sleep(1500);
    const r = await A.evalJs(`({ cards: document.querySelectorAll('.cn-card').length, chip: !!document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'), open: (app._inboxModel?.todos.open || []).length })`);
    await A.shot('red-desktop-1280-no-card.png');
    check('RED CONTROL: the base\'s chat shows NO card and NO «waiting for you» strip while its ask is open in the tray (the owner\'s gap)', r.cards === 0 && !r.chip && r.open >= 1, r);
  } catch (e) { fail++; console.log('  ✗ ⓪ threw: ' + (e?.message || e)); } finally { mutant = null; }
  lap('⓪ done');

  console.log('① TWO CLIENTS with the chat open, then THE OWNER\'S CASE filed live: the watch request\'s card in its tool card within 1 s on both');
  await A.device(1280, 800, { mouse: true }); await A.load(); await openChat(A);
  await A.cdp('Target.createTarget', { url: 'about:blank' }).catch(() => null);
  let tB = null; for (let i = 0; i < 40 && !tB; i++) { tB = (await targets()).find((x) => x.id !== target.id); if (!tB) await sleep(150); }
  const B = await connect(tB);
  await B.device(1280, 800, { mouse: true }); await B.load(); await openChat(B);
  for (const P of [A, B]) await P.waitFor(`!!${CHAT(SID)} && !!document.querySelector('.cn-card[data-item="${ask.id}"]')`, 15000);
  const askA = await A.evalJs(CARD(ask.id));
  check('the ask\'s card stands IN the tool card that ran vibespace-ask, with its two option chips and the tray\'s verbs', !!askA && askA.open && askA.hostRole === 'tool' && /vibespace-ask/.test(askA.hostCmd) && askA.chips.length === 2 && askA.chips.every((c) => /^Reply: [AB] — /.test(c)) && askA.kind === 'question' && /Waiting for you — a question/.test(askA.head), askA);
  const accA = await A.evalJs(CARD(acc.id));
  check('the access request (filed under \'channels\', addressing this conversation) is a card in ITS tool card — an approval', !!accA && accA.open && /vibespace-channels request/.test(accA.hostCmd) && accA.kind === 'approval', accA);
  await A.shot('desktop-1280-ask-chips.png');
  // the owner grants the access from its own door (the reach route — the Reach dialog's), then the agent asks to be woken
  const rqId = (/\((rq-[^)]+)\)/.exec(cliLog()) || [])[1] || '';
  const g = rqId ? await A.evalJs(`fetch('/api/channels/reach-requests/${rqId}/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json())`) : null;
  const accDone = await (async () => { for (let i = 0; i < 40; i++) { const r = (await api()).resolved.find((x) => x.id === acc.id); if (r) return r; await sleep(150); } return null; })();
  check('the owner approved the access request — its item resolves `allowed` (its card\'s record says «approved»)', !!accDone && accDone.resolvedBy === 'allowed', { rqId, g, accDone });
  await A.waitFor(`document.querySelector('.cn-card[data-item="${acc.id}"]')?.classList.contains('cn-done')`, 6000);
  const accRec = await A.evalJs(CARD(acc.id));
  check('…and on the page its card is the quiet one-line record «approved by you · HH:MM» in the same place (lane wake-approve-card: a person-only decision says who and when)', !!accRec && accRec.done && accRec.verb === 'approved by you' && /vibespace-channels request/.test(accRec.hostCmd), accRec);
  say('then do:watch');
  const wr = await findOpen((i) => i.action && i.action.type === 'channel-watch-request');
  const seen = {};
  for (const [nm, P] of [['A', A], ['B', B]]) { await P.waitFor(`!!document.querySelector('.cn-card[data-item="${wr && wr.id}"]')`, 8000); seen[nm] = await P.evalJs(`window.__cnSeen[${JSON.stringify(wr && wr.id)}] || null`); }
  const lagA = seen.A && wr ? seen.A - wr.createdAt : null, lagB = seen.B && wr ? seen.B - wr.createdAt : null;
  check(`THE OWNER'S CASE: the watch request (wr-…, filed under 'channels' + about) is a card on BOTH clients within 1 s of its filing (A ${lagA} ms, B ${lagB} ms)`, !!wr && wr.sessionKey === 'channels' && wr.about === ask.sessionKey && lagA != null && lagB != null && lagA <= 1000 && lagB <= 1000, { wr, seen });
  const wA = await A.evalJs(CARD(wr && wr.id));
  check('…inside the tool card that ran `vibespace-channels watch … --mode wake`, saying who asks and what Approve writes, with the tray\'s Approve / Reject', !!wA && wA.open && /vibespace-channels watch/.test(wA.hostCmd) && /asks to be woken by/.test(wA.text) && wA.approve && wA.kind === 'approval' && /Waiting for you — an approval/.test(wA.head), wA);
  await logHas(/### watch rc=/);
  check('…and the agent\'s tool output carries the ONE line to quote: «Filed for you: an approval — answer it on the card in this conversation or in … (wr-…)»', new RegExp('Filed for you: an approval — answer it on the card in this conversation or in the “For you” tray \\(' + (wr && wr.action.id) + '\\)').test(cliLog()), cliLog().slice(-900));
  await A.evalJs(`document.querySelector('.cn-card[data-item="${wr && wr.id}"]').scrollIntoView({ block: 'center' })`); await sleep(300);
  await A.shot('desktop-1280-watch-request.png');
  // …and the same card on a phone (client B at 375 touch for one look — then back to its desk)
  await B.front(); await B.device(375, 812); await B.load();
  await B.waitFor(`document.documentElement.dataset.vc === 'compact'`, 8000);
  await B.evalJs(`app.phoneHome?.hide?.(); true`).catch(() => null); await openChat(B);
  const onPhone = await B.waitFor(`!!document.querySelector('.cn-card[data-item="${wr && wr.id}"]') && document.querySelector('.cn-card[data-item="${wr && wr.id}"]').getClientRects().length > 0`, 12000);
  await B.evalJs(`document.querySelector('.cn-card[data-item="${wr && wr.id}"]')?.scrollIntoView({ block: 'center' }); true`); await sleep(500);
  await B.shot('phone-375-watch-request.png');
  check('the watch request\'s card on a phone (375 touch): in its tool card, Approve / Reject 44 px tall', onPhone && (await B.evalJs(`(() => { const b = document.querySelector('.cn-card[data-item="${wr && wr.id}"] .ut-action-proposal[data-answer="approve"]'); return !!b && b.getBoundingClientRect().height >= 43.5; })()`)));
  await B.device(1280, 800, { mouse: true }); await B.load(); await openChat(B);
  await B.waitFor(`!!document.querySelector('.cn-card[data-item="${wr && wr.id}"]')`, 12000);
  await A.front();
  lap('① done');

  console.log('② THE STRIP «waiting for you · N» (lane needs-card-tail r10 — the attention dock above the message box): the kinds named, a tap on its question lands the newest card and flashes it');
  const chip = await A.evalJs(CHIP);
  check('the strip above the message box: «waiting for you · 2» naming an approval and a question; its question a button', !!chip && chip.text === 'waiting for you · 2' && /an approval/.test(chip.title) && /a question/.test(chip.title) && chip.clickable, chip);
  await A.evalJs(`(() => { const l = ${CHAT(SID)} && app.sessions.get(${CHAT(SID)}.id)._messageList; l.scrollTop = 0; return true; })()`); await sleep(500);
  const shown = await A.evalJs(`(document.querySelector('.chat-attn-dock:not([hidden]) .cad-rows > .ut-item') || {}).dataset?.id || null`);
  await A.press('.chat-attn-dock .cad-rows .ut-item .ut-text', { touch: false }); await sleep(700);
  const land = await A.evalJs(CARD(wr && wr.id));
  check('…the strip shows the NEWEST (the watch request) and a tap on its question lands its card in view and flashes it (THE ONE LANDING)', shown === (wr && wr.id) && !!land && land.flash && land.list && land.rect.top >= land.list.top - 2 && land.rect.bottom <= land.list.bottom + 2, { shown, land });
  // acceptance round 4 (#3): A PASS THAT CHANGED NO CARD READS NO LAYOUT — the pass a broadcast runs, over cards already what
  // the store says (the watch request's Approve on screen): every rect read during it counted (the first three commits'
  // reconcile re-stamped every Allow of the page, a rect per hit, inside every card's patch)
  const reads = await A.evalJs(`(() => { const v = ${VIEW}; if (!v) return null; v._needsCards.render(); const P = Element.prototype, g = P.getBoundingClientRect, gc = P.getClientRects; let n = 0;
    const who = []; const note = (el) => { n++; if (who.length < 4) who.push(String(el.className || el.tagName).slice(0, 40) + ' ← ' + String(new Error().stack).split('\\n').slice(2, 5).map((s) => s.trim().replace(/^at /, '')).join(' ← ')); };
    P.getBoundingClientRect = function () { note(this); return g.call(this); }; P.getClientRects = function () { note(this); return gc.call(this); };
    try { v._needsCards.render(); } finally { P.getBoundingClientRect = g; P.getClientRects = gc; }
    return { n, who, approve: !!document.querySelector('.cn-card .ut-action-proposal.ut-proposal-approve'), cards: document.querySelectorAll('.cn-card').length }; })()`);
  check(`RED-able (round 4, #3): a pass that changed no card reads NO layout — ${reads && reads.n} rect reads over the pass (an Approve on screen, ${reads && reads.cards} cards)`, !!reads && reads.approve && reads.cards >= 2 && reads.n === 0, reads);
  lap('② done');

  if (!ARM_BUNDLE) check('②b the press arm\'s RED CONTROL bundle builds from this source (its anchor is this lane\'s line)', false, ARM_ERR);
  else try {
    console.log('②b THE PRESS ARM AND A SCROLL — RED first: the old stamp (a row pass only) refuses the first Approve after a scroll');
    mutant = { bundle: ARM_BUNDLE };
    await A.front(); await A.load(); await openChat(A);
    await A.waitFor(`!!document.querySelector('.cn-card[data-item="${wr && wr.id}"] .ut-action-proposal[data-answer="approve"]')`, 12000); await sleep(1200);
    const r = await scrollThenPress(A, wr && wr.id);
    const still = (await api()).open.some((i) => i.id === (wr && wr.id));
    check(`RED CONTROL: the old stamp — the transcript scrolled the Approve ${r.moved} px, it rested 1.5 s, the press is REFUSED («moved under the pointer») and the request stays open (the owner met it today)`, r.moved && /moved under the pointer/.test(r.toast) && still, { r, still });
  } catch (e) { fail++; console.log('  ✗ ②b threw: ' + (e?.message || e)); } finally { mutant = null; }
  console.log('③ Approve on client A after a scroll ⇒ accepted, approved on the hub; client B\'s card a quiet record, its tray item resolved');
  // the SAME person's press as ②b's RED: the transcript scrolls the Approve, it rests, a click where it stands — now ACCEPTED
  await A.front(); await A.load(); await openChat(A);
  await A.waitFor(`!!document.querySelector('.cn-card[data-item="${wr && wr.id}"] .ut-action-proposal[data-answer="approve"]')`, 12000); await sleep(1200);
  const apAt = await scrollThenPress(A, wr && wr.id);
  const wrDone = await (async () => { for (let i = 0; i < 40; i++) { const r = (await api()).resolved.find((x) => x.id === (wr && wr.id)); if (r) return r; await sleep(150); } return null; })();
  check(`THE PRESS ARM: scrolled ${apAt && apAt.moved} px, rested, pressed ⇒ ACCEPTED — the hub approved the watch request (its item resolved \`allowed\`), no «moved under the pointer»`, !!wrDone && wrDone.status === 'done' && wrDone.resolvedBy === 'allowed' && !!apAt && !!apAt.moved && !/moved under the pointer/.test(apAt.toast || ''), { wrDone, apAt });
  await B.front();
  await B.waitFor(`document.querySelector('.cn-card[data-item="${wr && wr.id}"]')?.classList.contains('cn-done')`, 8000);
  const wB = await B.evalJs(CARD(wr && wr.id));
  check('client B: the watch request\'s card is now the quiet record «approved by you · HH:MM», still in its tool card', !!wB && wB.done && wB.verb === 'approved by you' && /vibespace-channels watch/.test(wB.hostCmd), wB);
  const trayB = await B.evalJs(`(() => { const it = app._inboxModel?.byId(${JSON.stringify(wr && wr.id)}); return it ? it.status : null; })()`);
  check('client B\'s tray (the For-you store) holds it resolved; the chip says the one left', trayB === 'done' && (await B.evalJs(CHIP))?.text === 'waiting for you · a question', { trayB, chip: await B.evalJs(CHIP) });
  await B.evalJs(`document.querySelector('.cn-card[data-item="${wr && wr.id}"]').scrollIntoView({ block: 'center' })`); await sleep(300);
  await B.shot('desktop-1280-resolved.png');
  lap('③ done');

  console.log('④ A RELOAD keeps the open card at its tool card, and the chip');
  await A.front();
  await A.waitFor(`String(app.layoutManager._lastSentJson || '').includes(${CHAT(SID)}?.id || '§') && !app.layoutManager._unacked.length`, 12000);
  await A.load();
  await A.waitFor(`!!document.querySelector('.cn-card[data-item="${ask.id}"]')`, 15000);
  const ra = await A.evalJs(CARD(ask.id)), rw = await A.evalJs(CARD(wr && wr.id));
  check('after a reload: the ask\'s card is back OPEN in its tool card (its chips), the chip «waiting for you · a question» stands, the watch request\'s record «approved» in its own', !!ra && ra.open && /vibespace-ask/.test(ra.hostCmd) && ra.chips.length === 2 && (await A.evalJs(CHIP))?.text === 'waiting for you · a question' && !!rw && rw.done && rw.verb === 'approved by you', { ra, rw, chip: await A.evalJs(CHIP) });
  lap('④ done');

  console.log('④b ANSWERED ON ANOTHER CLIENT: the card patched in place');
  await B.front(); await B.waitFor(`!!document.querySelector('.cn-card[data-item="${ask.id}"].cn-open')`, 10000); await sleep(800);
  // ANSWERED ELSEWHERE, PATCHED IN PLACE: B in front (a page sent to the back may rebuild its views on its return — not
  // this card's doing); «another client» (page A's own road, evaluated in the back — no input) answers the ask with its label
  await B.evalJs(`(() => { for (const c of document.querySelectorAll('.cn-card[data-item="${ask.id}"]')) c.dataset.probe = 'before'; return true; })()`);
  // acceptance round 3 (#4): the person on B is TYPING three lines in the card's reply box when A answers — the box, its text
  // and its focus survive (THE row's keep rule; the first two commits replaced the card's words with the quiet line)
  const TYPED = 'B is typing a longer answer —\nline two of it\nline three, not sent yet';
  await B.press(`.cn-card[data-item="${ask.id}"] .ut-reply-btn`, { touch: false });
  await B.waitFor(`document.activeElement === document.querySelector('.cn-card[data-item="${ask.id}"] .ut-reply textarea')`, 4000);
  await B.cdp('Input.insertText', { text: TYPED }); await sleep(200);
  const typed = await B.evalJs(`document.querySelector('.cn-card[data-item="${ask.id}"] .ut-reply textarea')?.value || ''`);
  const rep = await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${JSON.stringify(ask.id)}) + '/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'B — reports page' }) }).then((r) => r.status)`);
  await B.waitFor(`document.querySelector('.cn-card[data-item="${ask.id}"]')?.classList.contains('cn-done')`, 6000); await sleep(300);
  const same = await B.evalJs(`(() => { const all = [...document.querySelectorAll('.cn-card[data-item="${ask.id}"]')]; const ta = all[0]?.querySelector('.ut-reply textarea'); return { n: all.length, marked: all.filter((c) => c.dataset.probe === 'before').length, verb: all[0]?.querySelector('.cn-line-verb')?.textContent || '', box: !!ta, text: ta ? ta.value : null, focus: !!ta && document.activeElement === ta }; })()`);
  check('an answer from ANOTHER client: B\'s ask card becomes «you replied» — the SAME element, patched in place (never the transcript re-rendered)', rep === 200 && same.n === 1 && same.marked === 1 && same.verb === 'you replied', { rep, same });
  check(`RED-able (round 3, #4): B was typing three lines in that card's box — the box, the ${typed.split('\n').length} lines and the focus SURVIVE the answer (the quiet line above it)`, typed === TYPED && same.box && same.text === TYPED && same.focus, { typed, same });
  // acceptance round 4 (#2): EVERY road out of a kept box is ONE exit — B presses Esc in it (the panel's fold of a reply box):
  // the card is its one quiet line by the next frame, the text a draft (the first three commits left the line, the resolved
  // row and .cn-kept up — the record out of the run — until an unrelated broadcast)
  for (const type of ['keyDown', 'keyUp']) await B.cdp('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const esc = await B.evalJs(`new Promise((res) => { let done = false; const read = (by) => { if (done) return; done = true; const c = document.querySelector('.cn-card[data-item="${ask.id}"]');
    res(c ? { by, line: !!c.querySelector(':scope > .cn-line'), rows: !!c.querySelector(':scope > .cn-rows'), kept: c.classList.contains('cn-kept'), box: !!c.querySelector('.ut-reply'), kids: c.children.length, draft: app._inboxModel.drafts?.get?.(${JSON.stringify(ask.id)}) || null } : null); };
    requestAnimationFrame(() => read('frame')); setTimeout(() => read('timer'), 400); })`);
  check(`RED-able (round 4, #2): Esc in the kept box — by the next ${esc && esc.by} the card is its ONE quiet line (no row, no box, not kept) and the three lines a draft`, !!esc && esc.by === 'frame' && esc.line && !esc.rows && !esc.kept && !esc.box && esc.kids === 1 && esc.draft === TYPED, esc);

  console.log('⑤ THE PHONE (375×812 touch): the card at the touch scale; the phone page\'s row is the same item; a chip answers both');
  await B.close();
  await A.cdp('Target.closeTarget', { targetId: tB.id }).catch(() => null); // one page left — a background page stalls CDP input
  await A.front();
  say('once more do:ask'); // the same words REOPEN the same item (the store's idempotent re-file) — its card moves to the new tool card
  await findOpen((i) => i.id === ask.id);
  await A.device(375, 812); await A.load();
  await A.waitFor(`document.documentElement.dataset.vc === 'compact'`, 8000);
  const homeRow = await A.waitFor(`!!document.querySelector('#phone-home .ut-item[data-id="${ask.id}"]')`, 6000);
  // the phone page's row IS the item: its «Chat» door goes to the conversation (and the page steps aside)
  const door = await A.evalJs(`(() => { const g = document.querySelector('#phone-home .ut-item[data-id="${ask.id}"] .ut-go'); if (!g) return null; const b = g.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (door) await A.tapAt(door.x, door.y);
  await A.waitFor(`!app.phoneHome?.shown?.()`, 6000);
  await openChat(A);
  await A.waitFor(`!!document.querySelector('.cn-card[data-item="${ask.id}"]') && document.querySelector('.cn-card[data-item="${ask.id}"]').getClientRects().length > 0`, 12000); await sleep(800);
  await A.evalJs(`document.querySelector('.cn-card[data-item="${ask.id}"]').scrollIntoView({ block: 'center' })`); await sleep(400);
  const sz = await A.evalJs(`(() => { const c = document.querySelector('.cn-card[data-item="${ask.id}"]'); const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const small = [...c.querySelectorAll('button, summary, textarea, .ut-opt')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { n: e.className || e.tagName, w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.w < 43.5 || x.h < 43.5);
    const tiny = []; const tw = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { if (!n.data.trim() || !vis(n.parentElement)) continue; const f = parseFloat(getComputedStyle(n.parentElement).fontSize); if (f < 13.95) tiny.push(n.parentElement.className + ' ' + f); }
    const sum = c.querySelector('.ut-detail-exp > summary'); const sr = sum && sum.getBoundingClientRect(), cr = c.querySelector('.ut-body').getBoundingClientRect();
    return { text: parseFloat(getComputedStyle(c.querySelector('.ut-text')).fontSize), small, tiny, foldRow: !!sr && sr.width >= cr.width - 2 && sr.height >= 43.5 }; })()`);
  await A.shot('phone-375-ask-chips.png');
  check(`the phone: the card's words 16 px, every target ≥ 44 × 44 (${sz.small.length} under), no text under 14 px (${sz.tiny.length}), the detail fold a full-width row`, sz.text >= 16 && !sz.small.length && !sz.tiny.length && sz.foldRow, sz);
  check('the phone page (its first screen) lists the SAME item the card shows; its «Chat» door lands on the conversation with the card', !!homeRow && !!door && !(await A.evalJs(`!!app.phoneHome?.shown?.()`)), { homeRow, door });
  const tapAim = await A.evalJs(`(() => { const e = document.querySelector('.cn-card[data-item="${ask.id}"] .ut-opt[data-idx="0"]'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hit: hit ? (hit.className || hit.tagName) : null, isChip: !!(hit && hit.closest('.ut-opt')), disabled: e.disabled }; })()`);
  if (tapAim) await A.tapAt(tapAim.x, tapAim.y);
  const askDone = await (async () => { for (let i = 0; i < 40; i++) { const r = (await api()).resolved.find((x) => x.id === ask.id && x.reply && x.reply.text === 'A — payments fix'); if (r) return r; await sleep(150); } return null; })();
  await A.waitFor(`document.querySelector('.cn-card[data-item="${ask.id}"]')?.classList.contains('cn-done')`, 5000);
  const homeResolved = await A.evalJs(`(() => { const it = app._inboxModel.byId(${JSON.stringify(ask.id)}); return it && it.status; })()`);
  check('a chip on the phone card ANSWERS it (the reply is its label) — the card turns «you replied», the store (the phone page\'s row) resolved', !!askDone && askDone.status === 'done' && askDone.reply && /^A — payments fix$/.test(askDone.reply.text) && homeResolved === 'done' && (await A.evalJs(CARD(ask.id)))?.verb === 'you replied', { askDone, homeResolved, tapAim, toasts: await A.evalJs(`[...document.querySelectorAll('.global-toast, .toast')].map((x) => x.textContent).slice(-3)`) });
  await A.evalJs(`document.querySelector('.cn-card[data-item="${ask.id}"]').scrollIntoView({ block: 'center' })`); await sleep(300);
  await A.shot('phone-375-resolved.png');
  lap('⑤ done');

  console.log('⑥ THE ACCORDION: six open items ⇒ ONE open card + five folded rows (375 touch, 1280 mouse); a tap opens one in place');
  say('six at once do:q1 do:q2 do:q3 do:q4 do:q5 do:q6');
  const STRESS = /^Stress question \d+:/;
  const stress = async (n) => { const t0 = Date.now(); let o = []; while (Date.now() - t0 < 30000) { o = (await api()).open.filter((i) => STRESS.test(i.text)); if (o.length >= n) break; await sleep(200); } return o.sort((a, b) => a.createdAt - b.createdAt); };
  const six = await stress(6);
  await logHas(/### q6 rc=/, 20000);
  check('setup: ONE agent turn ran vibespace-ask six times — six open questions of this conversation', six.length === 6 && six.every((i) => i.sessionKey === ask.sessionKey), six.map((i) => i.text));
  const q = (k) => (six[k - 1] && six[k - 1].id) || '§';
  /** every waiting card on the page, as the person sees it (a card in a hidden record is not seen) */
  const ACC = `(() => { const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    return [...document.querySelectorAll('.cn-card.cn-open')].filter(vis).map((c) => { const r = c.getBoundingClientRect(), row = c.querySelector('.ut-item'), tx = c.querySelector('.ut-text'), me = c.querySelector('.ut-meta');
      const cs = getComputedStyle(tx), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4, tr = tx.getBoundingClientRect(), mr = me.getBoundingClientRect();
      return { id: c.dataset.item, fold: c.classList.contains('cn-fold'), open: row.classList.contains('ut-open'), h: Math.round(r.height), top: Math.round(r.top), rowH: Math.round(row.getBoundingClientRect().height), textLines: Math.round(tr.height / lh), sameLine: Math.abs((tr.top + tr.bottom) / 2 - (mr.top + mr.bottom) / 2) < lh / 2, meta: (me.textContent || '').trim(), verbs: [...c.querySelectorAll('button, .ut-opt, summary, textarea')].filter(vis).length, head: vis(c.querySelector('.cn-head')), role: row.getAttribute('role') }; }); })()`;
  const sixUp = (P) => P.waitFor(`document.querySelectorAll('.cn-card.cn-open').length >= 6 && [...document.querySelectorAll('.cn-card.cn-open')].every((c) => c.getClientRects().length > 0)`, 15000);
  const toPhoneChat = async (P) => { // the phone's first screen stands over the chat after a load — its «Chat» door is the way in
    await P.waitFor(`document.documentElement.dataset.vc === 'compact' && !!document.querySelector('#phone-home .ut-item .ut-go')`, 10000);
    const d = await P.evalJs(`(() => { const ids = ${JSON.stringify(six.map((i) => i.id))}; const g = [...document.querySelectorAll('#phone-home .ut-item .ut-go')].find((x) => ids.includes(x.closest('.ut-item').dataset.id)); if (!g) return null; g.scrollIntoView({ block: 'center' }); const b = g.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (d) await P.tapAt(d.x, d.y);
    await P.waitFor(`!app.phoneHome?.shown?.()`, 6000); await openChat(P);
  };
  const HIT = `(() => { const c = document.querySelector('.chat-attn-dock:not([hidden]) .cad-rows .ut-text'); if (!c || !c.offsetParent) return null; const r = c.getBoundingClientRect(); const on = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === c || c.contains(h)); };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2; let up = 0, dn = 0, lf = 0, rt = 0; while (up < 60 && on(cx, cy - up - 1)) up++; while (dn < 60 && on(cx, cy + dn + 1)) dn++; while (lf < 400 && on(cx - lf - 1, cy)) lf++; while (rt < 400 && on(cx + rt + 1, cy)) rt++;
    return { text: (document.querySelector('.chat-attn-dock .cad-count') || {}).textContent || '', box: Math.round(r.width) + '×' + Math.round(r.height), hitW: lf + rt + 1, hitH: up + dn + 1, centre: on(cx, cy), bar: Math.round((document.querySelector('.chat-view .chat-status-bar') || c).getBoundingClientRect().height) }; })()`;
  /** the .358 mouse-target census (test-desktop-small-chrome ⑧), over the cards and the chip */
  const CARD_HITS = `(() => { const out = []; const clickable = (e) => { const cs = getComputedStyle(e); return cs.cursor === 'pointer' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none'; };
    for (const e of document.querySelectorAll('.cn-cards button, .cn-cards [role=button], .chat-attn-dock button, .chat-attn-dock [role=button]')) { if (!clickable(e) || e.disabled) continue; const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!hit || (hit !== e && !e.contains(hit) && !hit.contains(e))) continue; if (r.width >= 23.5 && r.height >= 23.5) continue;
      let a = e.parentElement, ok = false; while (a && a !== document.body) { const ar = a.getBoundingClientRect(); if ((a.tagName === 'BUTTON' || a.getAttribute('role') === 'button') && clickable(a) && ar.width >= 24 && ar.height >= 24) { ok = true; break; } a = a.parentElement; }
      if (!ok) out.push(String(e.className || e.tagName).split(' ').slice(0, 2).join('.') + ' ' + Math.round(r.width) + '×' + Math.round(r.height)); }
    return out; })()`;
  // the point a person taps on a folded row: its question's line (round 4, #1 — the open holds THAT line, not the card's box)
  const aimAt = (P, id) => P.evalJs(`(() => { const c = document.querySelector('.cn-card[data-item="${id}"]'); if (!c) return null; c.scrollIntoView({ block: 'center' }); const tx = c.querySelector('.cn-rows .ut-text') || c; const b = tx.getBoundingClientRect(); const x = b.left + Math.min(b.width / 2, 120), y = b.top + Math.min(b.height / 2, 9); const hit = document.elementFromPoint(x, y); return { x, y, top: b.top, onRow: !!(hit && hit.closest('.cn-card') === c) }; })()`);
  const topOf = (P, id) => P.evalJs(`(document.querySelector('.cn-card[data-item="${id}"] .cn-rows .ut-text') || document.querySelector('.cn-card[data-item="${id}"]'))?.getBoundingClientRect().top ?? null`);
  const openOnes = (cs) => cs.filter((c) => !c.fold);
  const at = (cs, id) => cs.find((c) => c.id === id) || {};

  // 375 touch — RED first (the open slot cut), then this tree
  if (!FOLD_BUNDLE) check('⑥ the accordion\'s RED CONTROL bundle builds from this source (its anchor is this lane\'s line)', false, FOLD_ERR);
  else try {
    mutant = { bundle: FOLD_BUNDLE };
    await A.device(375, 812); await A.load(); await toPhoneChat(A); await sixUp(A); await sleep(800);
    const r = await A.evalJs(ACC);
    check(`RED CONTROL (375): the first commit's shape — the six waiting cards all whole (${openOnes(r).length} open, ${r.reduce((s, c) => s + c.h, 0)} px of cards)`, r.length === 6 && openOnes(r).length === 6 && r.every((c) => c.verbs > 0), r);
  } catch (e) { fail++; console.log('  ✗ ⑥ RED (375) threw: ' + (e?.message || e)); } finally { mutant = null; }
  await A.device(375, 812); await A.load(); await toPhoneChat(A); await sixUp(A); await sleep(800);
  const p = await A.evalJs(ACC), pf = p.filter((c) => c.fold);
  check(`375 touch: ONE open card — the newest — and five folded rows, each the sheet's row: the question on one line + its age, nothing else (rows ${pf.map((c) => c.h).join('/')} px, targets ${pf.map((c) => c.rowH).join('/')} px)`, p.length === 6 && openOnes(p).length === 1 && openOnes(p)[0].id === q(6) && openOnes(p)[0].verbs > 0 && openOnes(p)[0].open && pf.length === 5 && pf.every((c) => c.h <= 60 && c.rowH >= 43.5 && c.textLines === 1 && c.verbs === 0 && !c.head && c.role === 'button' && !c.open && /ago|now/.test(c.meta)), p);
  const hp = await A.evalJs(HIT);
  check(`⑦ THE STRIP's question at 375 touch (r10 — the chip's place): a ≥ 44 × 44 target by hit-testing (${hp && hp.hitW}×${hp && hp.hitH}; box ${hp && hp.box}, the bar ${hp && hp.bar} px)`, !!hp && hp.centre && hp.hitW >= 44 && hp.hitH >= 44 && /waiting for you · 6 questions/.test(hp.text), hp);
  // acceptance round 3 (m3): the bar grew 40 → 44 the instant a filing landed (the composer 4 px under a finger) — it keeps its
  // 40 px (the one-line bar of test-turn-truth-ui) with the chip on show, the 44 px hit area reaching past its edges
  check(`m3 the phone's status bar stays ${hp && hp.bar} px (≤ 40 — r10: nothing that waits on the person rides it; the strip above the message box carries it), the strip's target 44 tall`, !!hp && hp.bar <= 40 && hp.hitH >= 44, hp);
  await A.evalJs(`document.querySelector('.cn-card[data-item="${q(1)}"]')?.scrollIntoView({ block: 'start' }); true`); await sleep(300);
  await A.shot('phone-375-accordion.png');
  const a3 = await aimAt(A, q(3)); await sleep(250);
  if (a3) await A.tapAt(a3.x, a3.y);
  await sleep(400);
  const p2 = await A.evalJs(ACC), t3 = await topOf(A, q(3));
  check(`375: a tap on a folded row (the third) opens it IN PLACE (its line held under the finger: ${a3 && t3 != null ? Math.round(t3 - a3.top) : '?'} px) and folds the newest — still ONE open, its verbs back`, !!a3 && a3.onRow && openOnes(p2).length === 1 && openOnes(p2)[0].id === q(3) && at(p2, q(3)).verbs > 0 && at(p2, q(6)).fold && Math.abs(t3 - a3.top) <= 2, { a3, t3, p2 });
  await A.shot('phone-375-accordion-opened.png');
  lap('⑥ 375 done');

  // 1280 mouse — RED first, then this tree
  if (FOLD_BUNDLE) try {
    mutant = { bundle: FOLD_BUNDLE };
    await A.device(1280, 800, { mouse: true }); await A.load(); await openChat(A); await sixUp(A); await sleep(800);
    const r = await A.evalJs(ACC);
    check(`RED CONTROL (1280): the first commit's shape — the six waiting cards all whole (${openOnes(r).length} open, ${r.reduce((s, c) => s + c.h, 0)} px of cards)`, r.length === 6 && openOnes(r).length === 6 && r.every((c) => c.verbs > 0), r);
  } catch (e) { fail++; console.log('  ✗ ⑥ RED (1280) threw: ' + (e?.message || e)); } finally { mutant = null; }
  await A.device(1280, 800, { mouse: true }); await A.load(); await openChat(A); await sixUp(A); await sleep(800);
  const d = await A.evalJs(ACC), df = d.filter((c) => c.fold);
  check(`1280: ONE open card — the newest — and five ONE-LINE rows: the question and « · age» on one line, no verb, no head, the row a ≥ 24 px target (rows ${df.map((c) => c.h).join('/')} px)`, d.length === 6 && openOnes(d).length === 1 && openOnes(d)[0].id === q(6) && openOnes(d)[0].verbs > 0 && df.length === 5 && df.every((c) => c.h <= 30 && c.rowH >= 23.5 && c.textLines === 1 && c.sameLine && c.verbs === 0 && !c.head && c.role === 'button' && /ago|now/.test(c.meta)), d);
  const hd = await A.evalJs(HIT), census = await A.evalJs(CARD_HITS);
  check(`⑦ THE STRIP's question at 1280: a ≥ 24 × 24 target by hit-testing (${hd && hd.hitW}×${hd && hd.hitH}; box ${hd && hd.box}) — and every visible clickable in the cards and the strip ≥ 24 × 24 (${census.length} under)`, !!hd && hd.centre && hd.hitW >= 24 && hd.hitH >= 24 && census.length === 0, { hd, census });
  const a2 = await aimAt(A, q(2)); await sleep(250);
  if (a2) await A.clickAt(a2.x, a2.y);
  await sleep(300);
  const d2 = await A.evalJs(ACC), t2 = await topOf(A, q(2));
  check(`1280: a click on a folded row (the second) opens it IN PLACE (its line held: ${a2 && t2 != null ? Math.round(t2 - a2.top) : '?'} px) and folds the newest — ONE open`, !!a2 && a2.onRow && openOnes(d2).length === 1 && openOnes(d2)[0].id === q(2) && at(d2, q(6)).fold && Math.abs(t2 - a2.top) <= 2, { a2, t2, d2 });
  await A.evalJs(`(() => { const r = document.querySelector('.cn-card[data-item="${q(4)}"] .ut-item'); r.scrollIntoView({ block: 'center' }); r.focus(); return document.activeElement === r; })()`);
  await A.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await A.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(300);
  const d3 = await A.evalJs(ACC), focus3 = await A.evalJs(`(() => { const a = document.activeElement; return a ? { card: a.closest('.cn-card')?.dataset.item || null, cls: String(a.className || a.tagName) } : null; })()`);
  check('1280: Enter on a focused folded row (the fourth) opens it and folds the one open before — ONE open; the focus moves to its first answer', openOnes(d3).length === 1 && openOnes(d3)[0].id === q(4) && at(d3, q(2)).fold && !!focus3 && focus3.card === q(4) && /ut-opt|ut-act/.test(focus3.cls), { d3, focus3 });
  await A.evalJs(`document.querySelector('.cn-card[data-item="${q(1)}"]')?.scrollIntoView({ block: 'start' }); true`); await sleep(300);
  await A.shot('desktop-1280-accordion.png');
  lap('⑥⑦ 1280 done');

  /** THE OPEN BY THE PERSON, MEASURED (round 4, #1): the folded row's question line — its point, the line's top every frame
   *  for ~0.9 s from the press (a bottom-follow chain lands a frame or ten after it), then where the opened card's lowest verb
   *  and the list's bottom are. `held`: the line never dropped, the answers are inside the list, and the line either stayed
   *  (the card fits) or rose by exactly what brought the lowest verb to the bottom edge (the minimum) */
  const LINE = (id) => `document.querySelector('.cn-card[data-item="${id}"] .cn-rows .ut-text')`;
  const spot = (P, id) => P.evalJs(`(() => { const v = ${VIEW}; const c = document.querySelector('.cn-card[data-item="${id}"]'), tx = ${LINE(id)}; if (!v || !c || !tx) return null; const r = tx.getBoundingClientRect(), lr = v._messageList.getBoundingClientRect(); const x = r.left + Math.min(r.width / 2, 120), y = r.top + Math.min(r.height / 2, 9); const hit = document.elementFromPoint(x, y); return { x, y, top: r.top, seen: r.top >= lr.top && y <= lr.bottom, onRow: !!(hit && hit.closest('.cn-card') === c), fold: c.classList.contains('cn-fold') }; })()`);
  const track = (P, id) => P.evalJs(`(() => { window.__cnTrack = []; const t0 = performance.now(); const f = () => { const tx = ${LINE(id)}; if (tx) window.__cnTrack.push(Math.round(tx.getBoundingClientRect().top * 10) / 10); if (performance.now() - t0 < 900) requestAnimationFrame(f); }; requestAnimationFrame(f); return true; })()`);
  const opened = async (P, id, s) => { await sleep(950); return P.evalJs(`(() => { const v = ${VIEW}, l = v._messageList, c = document.querySelector('.cn-card[data-item="${id}"]'), tx = ${LINE(id)}; const tr = window.__cnTrack || [], lr = l.getBoundingClientRect(), r1 = (x) => Math.round(x * 10) / 10;
    const verbs = [...c.querySelectorAll('.cn-rows button')].filter((b) => b.getClientRects().length); const low = verbs.length ? Math.max(...verbs.map((b) => b.getBoundingClientRect().bottom)) : null; const head = c.querySelector(':scope > .cn-head');
    return { drop: tr.length ? r1(Math.max(...tr) - ${s.top}) : null, end: r1(tx.getBoundingClientRect().top - ${s.top}), low: low == null ? null : r1(low), bottom: r1(lr.bottom), head: !!head && head.getClientRects().length > 0 && head.getBoundingClientRect().bottom <= tx.getBoundingClientRect().top + 1, open: !c.classList.contains('cn-fold'), pinned: v._pinned }; })()`); };
  const held = (o) => !!o && o.open && o.head && o.drop != null && o.drop <= 1 && o.low != null && o.low <= o.bottom + 1 && (Math.abs(o.end) <= 1 || (o.end < 0 && Math.abs(o.low - o.bottom) <= 2));
  const how = (o) => { if (!o) return '?'; const inside = Math.round((o.bottom - o.low) * 10) / 10, v = inside >= 0 ? `its lowest verb ${inside} px inside` : `its lowest verb ${-inside} px BELOW the list`;
    return Math.abs(o.end) <= 1 ? `held ${o.end} px, ${v}` : o.end > 0 ? `DROPPED ${o.end} px, ${v}` : `rose ${-o.end} px, ${v}`; };

  console.log('⑥b THE TAP HOLDS ITS ROW ON A PINNED VIEW (acceptance round 3, #2; round 4, #1: the TEXT LINE held, the answers inside)');
  {
    await A.load(); await openChat(A); await sixUp(A); await sleep(1500);
    const pinned0 = await A.evalJs(`${VIEW}?._pinned === true`);
    const s5 = await spot(A, q(5));
    if (s5) { await track(A, q(5)); await A.clickAt(s5.x, s5.y); }
    const o5 = s5 ? await opened(A, q(5), s5) : null;
    const s6 = await spot(A, q(6));
    if (s6) { await track(A, q(6)); await A.clickAt(s6.x, s6.y); }
    const o6 = s6 ? await opened(A, q(6), s6) : null;
    const after = await A.evalJs(ACC), pinned1 = await A.evalJs(`${VIEW}?._pinned`), tail1 = await A.evalJs(`(() => { const l = ${VIEW}._messageList; return l.scrollHeight - l.scrollTop - l.clientHeight < 50; })()`);
    // the pin follows the landing (the chat's own law, PINNED ⇔ AT THE LIVE TAIL < 50 px — round 4: a line held at the very
    // end leaves the view AT the tail, pinned; an open that grew the card past the edge leaves it a reader's position)
    check(`RED-able: on a PINNED view (the live tail, never scrolled) a click on the folded row above the newest holds its TEXT LINE under the pointer (${how(o5)}, every frame for 0.9 s; its card fits) — then the one below it: ${how(o6)} — never dropped, the answers inside; the pin follows the landing (${pinned1 ? 'pinned' : 'unpinned'}, ${tail1 ? 'at' : 'off'} the live tail)`, pinned0 && !!s5 && s5.seen && s5.onRow && s5.fold && held(o5) && Math.abs(o5.end) <= 1 && !!s6 && s6.seen && s6.onRow && s6.fold && held(o6) && pinned1 === tail1 && openOnes(after).length === 1 && openOnes(after)[0].id === q(6), { pinned0, s5, o5, s6, o6, pinned1, tail1, open: openOnes(after).map((c) => c.id) });
  }
  lap('⑥b done');

  console.log('⑥c THE BOTTOM EDGE (acceptance round 4, #1): a folded row ON the list\'s bottom edge — the line never drops, the answers come inside');
  /** the person's pick open (the fifth) ⇒ the one after it a folded row, the transcript moved so that row sits ON the bottom edge */
  const toEdge = async (P, pick = q(5), id = q(6)) => { const ok = await P.evalJs(`(() => { const v = ${VIEW}; if (!v) return false; v._needsCards.openCard(${JSON.stringify(pick)}); const l = v._messageList, c = document.querySelector('.cn-card[data-item="${id}"]'); if (!c || !c.classList.contains('cn-fold')) return false; l.scrollTop += c.getBoundingClientRect().bottom - (l.getBoundingClientRect().bottom - 2); return true; })()`); await sleep(900); return ok; };
  /** two presses at one point, as a double click / a double tap — then what the point holds now, and the toasts */
  const twice = async (P, s, touch, id) => {
    if (touch) { for (let k = 0; k < 2; k++) { await P.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.x, y: s.y }] }); await sleep(40); await P.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(110); } }
    else { await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.x, y: s.y }); for (let k = 1; k <= 2; k++) { await P.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: s.x, y: s.y, button: 'left', clickCount: k }); await sleep(30); await P.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: s.x, y: s.y, button: 'left', clickCount: k }); await sleep(90); } }
    await sleep(900);
    return P.evalJs(`(() => { const h = document.elementFromPoint(${s.x}, ${s.y}); const b = h && h.closest('button'); return { verb: b ? String(b.className).split(' ').slice(0, 3).join('.') : null, inCard: !!(h && h.closest('.cn-card[data-item="${id}"]')), toast: [...document.querySelectorAll('.global-toast')].map((x) => x.textContent).join(' | ') }; })()`);
  };
  const edge = async (P, touch, size) => {
    const ok = await toEdge(P);
    const s = ok ? await spot(P, q(6)) : null;
    if (s) { await track(P, q(6)); await (touch ? P.tapAt(s.x, s.y) : P.clickAt(s.x, s.y)); }
    const o = s ? await opened(P, q(6), s) : null;
    check(`RED-able (${size}): the folded row ON the bottom edge — a ${touch ? 'tap' : 'click'} opens it with its line never dropping (${o && o.drop} px at worst) and its lowest verb brought inside by the minimum scroll (${how(o)})`, ok && !!s && s.seen && s.onRow && s.fold && held(o) && o.end < -1, { ok, s, o });
    // …and a DOUBLE press there: the second lands on what the reveal moved under the pointer — and answers nothing (the card
    // refuses its verbs for ARM_MS, the press arm's law; this tree's own guard of the move it makes)
    const ok2 = await toEdge(P);
    const s2 = ok2 ? await spot(P, q(6)) : null;
    const under = s2 ? await twice(P, s2, touch, q(6)) : null;
    const it6 = (await api()).open.find((i) => i.id === q(6));
    check(`(${size}) a DOUBLE ${touch ? 'tap' : 'click'} there: the second press lands on ${under && under.verb ? 'its verb ' + under.verb : 'no verb'} — and answers nothing (the item still waiting, no reply${under && under.verb ? ', «moved under the pointer» said' : ''})`, ok2 && !!s2 && !!under && under.inCard && !!it6 && !it6.reply && (!under.verb || /moved under the pointer/.test(under.toast)), { s2, under, it6: it6 && { status: it6.status, reply: it6.reply || null } });
  };
  await A.device(375, 812); await A.load(); await toPhoneChat(A); await sixUp(A); await sleep(800);
  await edge(A, true, '375 touch');
  await A.device(1280, 800, { mouse: true }); await A.load(); await openChat(A); await sixUp(A); await sleep(800);
  await edge(A, false, '1280 mouse');
  lap('⑥c done');

  console.log('⑧ THE COUNT IS ONE SOURCE: a frame sampler while a 7th question is filed, then Mark done on it');
  const SAMPLE = `(() => { window.__cnFrames = []; let last = ''; window.__cnSampling = true; const gen = (window.__cnGen = (window.__cnGen || 0) + 1); // one sampler at a time
    const tick = () => { const c = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'); const s = c && c.offsetParent ? c.textContent.trim() : ''; const m = /· (\\d+)/.exec(s); const n = !s ? 0 : m ? Number(m[1]) : 1;
      const cards = [...document.querySelectorAll('.cn-card.cn-open')].filter((x) => x.getClientRects().length > 0).length; const k = n + '/' + cards;
      if (k !== last) { last = k; window.__cnFrames.push(k); } if (window.__cnSampling && window.__cnGen === gen) requestAnimationFrame(tick); };
    requestAnimationFrame(tick); return true; })()`;
  const frames = async () => { await sleep(600); return A.evalJs(`(() => { window.__cnSampling = false; return window.__cnFrames; })()`); };
  await A.evalJs(SAMPLE);
  say('one more do:q7');
  const seven = await stress(7);
  const q7 = seven.find((i) => /^Stress question 7:/.test(i.text));
  await A.waitFor(`document.querySelectorAll('.cn-card.cn-open').length >= 7 && /· 7 /.test(document.querySelector('.chat-attn-dock:not([hidden]) .cad-count')?.textContent || '')`, 10000);
  const f1 = await frames();
  const op7 = openOnes(await A.evalJs(ACC));
  check(`a filing ⇒ the chip and the cards move TOGETHER, frame by frame (${f1.join(' → ')}): 6/6 → 7/7, never one without the other — and the new one takes the open slot`, !!q7 && f1.length >= 2 && f1[0] === '6/6' && f1[f1.length - 1] === '7/7' && f1.every((k) => k.split('/')[0] === k.split('/')[1]) && op7.length === 1 && op7[0].id === q7.id, { f1, op7, q7: q7 && q7.id });
  await A.evalJs(SAMPLE);
  await A.press(`.cn-card[data-item="${q7 && q7.id}"] .ut-done`, { touch: false });
  const q7Done = await (async () => { for (let i = 0; i < 40; i++) { const r = (await api()).resolved.find((x) => x.id === (q7 && q7.id)); if (r) return r; await sleep(150); } return null; })();
  await A.waitFor(`document.querySelector('.cn-card[data-item="${q7 && q7.id}"]')?.classList.contains('cn-done') && /· 6 /.test(document.querySelector('.chat-attn-dock:not([hidden]) .cad-count')?.textContent || '')`, 8000);
  const f2 = await frames();
  check(`Mark done on it ⇒ both N again in the same frame (${f2.join(' → ')}): 7/7 → 6/6`, !!q7Done && f2.length >= 2 && f2[0] === '7/7' && f2[f2.length - 1] === '6/6' && f2.every((k) => k.split('/')[0] === k.split('/')[1]), { f2, q7Done: q7Done && q7Done.status });
  lap('⑧ done');

  console.log('⑧b THE OPEN SLOT MOVES ONLY ON A FILING (acceptance round 3, #3): the newest answered elsewhere, then the pick itself');
  {
    const a2b = await aimAt(A, q(2)); await sleep(250);
    if (a2b) await A.clickAt(a2b.x, a2b.y);
    await sleep(300);
    const picked = openOnes(await A.evalJs(ACC));
    const resolve = (id) => A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${JSON.stringify(id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    const st6 = await resolve(q(6)); // another client / the tray / the expiry / the agent — the route every one of them reaches
    await A.waitFor(`document.querySelector('.cn-card[data-item="${q(6)}"]')?.classList.contains('cn-done')`, 8000); await sleep(400);
    const r1 = await A.evalJs(ACC);
    check(`RED-able: the person opened the second; the NEWEST is answered elsewhere (POST ${st6}) — the second STAYS open, nothing else opens (${openOnes(r1).map((c) => c.id === q(2) ? 'q2' : c.id).join(', ') || 'none'} open)`, picked.length === 1 && picked[0].id === q(2) && st6 === 200 && openOnes(r1).length === 1 && openOnes(r1)[0].id === q(2) && r1.length === 5, { picked: picked.map((c) => c.id), r1 });
    const st2 = await resolve(q(2));
    await A.waitFor(`document.querySelector('.cn-card[data-item="${q(2)}"]')?.classList.contains('cn-done')`, 8000); await sleep(400);
    const r2 = await A.evalJs(ACC), line2 = await A.evalJs(`!!document.querySelector('.cn-card[data-item="${q(2)}"].cn-done > .cn-line')`);
    check(`RED-able: the pick ITSELF answered (POST ${st2}) — its quiet line stays where it was and the next card is NOT opened by itself (${openOnes(r2).length} open of ${r2.length} waiting)`, st2 === 200 && line2 && r2.length === 4 && openOnes(r2).length === 0 && r2.every((c) => c.fold), { line2, r2 });
  }
  console.log('⑨ A KEPT CARD STAYS IN THE PASS (acceptance round 4, #4): its item leaves the snapshot\'s resolved tail while the box is in use');
  {
    const id3 = q(3), TYPED3 = 'A is still typing this one';
    const a3b = await aimAt(A, id3); await sleep(250);
    if (a3b) await A.clickAt(a3b.x, a3b.y);
    await sleep(900);
    await A.press(`.cn-card[data-item="${id3}"] .ut-reply-btn`, { touch: false });
    await A.waitFor(`document.activeElement === document.querySelector('.cn-card[data-item="${id3}"] .ut-reply textarea')`, 4000);
    await A.cdp('Input.insertText', { text: TYPED3 }); await sleep(200);
    const st3 = await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${JSON.stringify(id3)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    await A.waitFor(`document.querySelector('.cn-card[data-item="${id3}"]')?.classList.contains('cn-kept')`, 8000); await sleep(400);
    // THE TAIL MOVES ON: the store's snapshot keeps the newest 15 resolved + the last hour (src/user-todos.js RESOLVED_TAIL /
    // RESOLVED_RECENT_MS) — an hour is not a suite's to wait, so page A's copy becomes the snapshot that no longer lists it
    // (what the next broadcast would carry), and the page's clock moves on three minutes; the next pass must patch the kept
    // card («3min ago») — the first three commits left it frozen («just now») for as long as the box was in use
    const aged = await A.evalJs(`new Promise((res) => { const m = app._inboxModel, v = ${VIEW}; m.todos.resolved = m.todos.resolved.filter((i) => i.id !== ${JSON.stringify(id3)});
      const real = Date.now; window.__cnRealNow = real; Date.now = () => real() + 3 * 60e3; v._needsCards.schedule();
      setTimeout(() => { const c = document.querySelector('.cn-card[data-item="${id3}"]'), ta = c && c.querySelector('.ut-reply textarea'); res({ listed: !!m.byId(${JSON.stringify(id3)}), ago: c ? (c.querySelector('.cn-line-ago')?.textContent || '') : null, kept: !!c && c.classList.contains('cn-kept'), text: ta ? ta.value : null, focus: !!ta && document.activeElement === ta }); }, 300); })`);
    check(`RED-able (round 4, #4): the kept card's item left the snapshot's tail while A types in its box — the card is STILL patched («${aged && aged.ago}» three minutes on), its box, text and focus kept`, st3 === 200 && !!aged && !aged.listed && /3\s?min ago/.test(aged.ago || '') && aged.kept && aged.text === TYPED3 && aged.focus, { st3, aged });
    // …and once A LEAVES the box (a blur — through the panel's one exit), the normal removal applies
    await A.evalJs(`document.activeElement?.blur?.(); true`);
    const gone = await A.waitFor(`!document.querySelector('.cn-card[data-item="${id3}"]')`, 4000);
    const draft = await A.evalJs(`app._inboxModel.drafts?.get?.(${JSON.stringify(id3)}) || null`);
    await A.evalJs(`(() => { if (window.__cnRealNow) Date.now = window.__cnRealNow; return true; })()`);
    check('…and once A leaves the box (a blur — the panel\'s one exit), the normal removal applies: the card goes (its item no longer listed), the typed text a draft', gone && draft === TYPED3, { gone, draft });
  }
  // ⑥c's guard's RED CONTROL, LAST (it answers an item): THIS source without the card's refusal of a moved verb — the reveal
  // at the bottom edge puts a verb under the pointer, and a double click's second press answers with it (the press arm alone
  // covers an Allow / an Approve — never a chip, a Mark done)
  if (!GUARD_BUNDLE) check('⑥c the guard\'s RED CONTROL bundle builds from this source (its anchor is this lane\'s line)', false, GUARD_ERR);
  else try {
    mutant = { bundle: GUARD_BUNDLE };
    await A.device(1280, 800, { mouse: true }); await A.load(); await openChat(A);
    await A.waitFor(`!!document.querySelector('.cn-card[data-item="${q(5)}"]') && !!document.querySelector('.cn-card[data-item="${q(4)}"]')`, 15000); await sleep(800);
    const ok = await toEdge(A, q(4), q(5));
    const s = ok ? await spot(A, q(5)) : null;
    const under = s ? await twice(A, s, false, q(5)) : null;
    const t5 = await api(), r5 = t5.resolved.find((i) => i.id === q(5)) || t5.open.find((i) => i.id === q(5));
    // (the card answered is a quiet line by then — what the point holds afterwards is no longer the verb it pressed)
    check(`RED CONTROL: without the card's refusal, a double click on the folded row at the bottom edge ANSWERS it with what the reveal moved under the pointer (the fifth ${r5 && r5.status}${r5 && r5.reply ? `, replied «${r5.reply.text}»` : ''} — the first press only opened it)`, ok && !!s && !!under && !!r5 && (r5.status !== 'open' || !!r5.reply), { ok, s, under, r5: r5 && { status: r5.status, reply: r5.reply || null } });
  } catch (e) { fail++; console.log('  ✗ ⑥c guard RED threw: ' + (e?.message || e)); } finally { mutant = null; }
  // ── ROUND 5: three short conversations of their own (a window each; the others closed — one list, its own geometry) ──
  const J = (x) => JSON.stringify(x);
  const newConv = (tag) => new Promise((res) => { // (⑧'s \`frames\` shadows the hub's frame list here — the hub's answer heard directly)
    const on = (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { } if (m && m.type === 'created' && m.reqId === 'cn-' + tag) { hubWs.off('message', on); res(m.sessionId); } };
    hubWs.on('message', on); hubWs.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: WORK, reqId: 'cn-' + tag })); setTimeout(() => { hubWs.off('message', on); res(null); }, 15000); });
  const sayTo = (sid, text) => hubWs.send(J({ type: 'chat-input', sessionId: sid, text }));
  const byText = async (re, n, ms = 20000) => { const t0 = Date.now(); let o = []; while (Date.now() - t0 < ms) { o = (await api()).open.filter((i) => re.test(i.text)); if (o.length >= n) break; await sleep(200); } return o.sort((a, b) => a.createdAt - b.createdAt); };
  const openOnly = (P, sid) => P.evalJs(`(() => { app.phoneHome?.hide?.(); for (const w of [...app.wm.windows.values()]) if (w.type === 'chat' && app.sessions.get(w.id)?.sessionId !== ${J(sid)}) app.wm.closeWindow(w.id); if (!${CHAT(sid)}) app.attachSession(${J(sid)}, 'round five', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  const toConv = async (P, sid, ids, w, h, touch, max = !touch) => {
    await P.device(w, h, touch ? undefined : { mouse: true }); await P.load(); await openOnly(P, sid);
    if (max) { await P.waitFor(`!!${CHAT(sid)}`, 8000); await P.evalJs(`(() => { const w = ${CHAT(sid)}; if (!w) return false; if (${J(max)} === true) { if (!w.isMaximized) app.wm.toggleMaximize(w.id); } else { if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.resizeWindowTo(w.id, ${J(max)}); } return true; })()`); }
    await P.waitFor(`${J(ids)}.every((id) => { const c = document.querySelector('.cn-card[data-item="' + id + '"]'); return !!c && c.getClientRects().length > 0; }) && !app.phoneHome?.shown?.()`, 15000); await sleep(900);
  };
  const lineTop = (P, id) => P.evalJs(`${LINE(id)}?.getBoundingClientRect().top ?? null`);
  const fits = (P) => P.evalJs(`(() => { const l = ${VIEW}?._messageList; return l ? { sh: l.scrollHeight, ch: l.clientHeight, fits: l.scrollHeight <= l.clientHeight + 1 } : null; })()`);

  console.log('⑩ A HOLD THE LIST CANNOT HONOUR (acceptance round 5, #1): a transcript that fits its list, two asks — the refusal keyed on the MEASURED landing');
  // the candidates: a desk window's width (the second's question wraps — its chips stand lower) / a phone's height
  const DESK = [560, 640, 480, 760, 900, 420].map((ww) => ({ w: 1280, h: 800, win: { w: ww, h: 720 }, says: `a ${ww} px window` }));
  const PHONE = [812, 900, 1000, 740, 1100].map((hh) => ({ w: 375, h: hh, win: false, says: `375×${hh}` }));
  for (const [size, touch, n1, n2, cands] of [['1280 mouse', false, 'q51', 'l52', DESK], ['375 touch', true, 'q53', 'q54', PHONE]]) {
    try {
      const sid = await newConv('fit-' + n1); await sleep(600);
      sayTo(sid, `two at once do:${n1} do:${n2}`);
      const two = await byText(new RegExp(`^(Stress|Longer) question (${n1.slice(1)}|${n2.slice(1)}):`), 2);
      const [Q1, Q2] = [two[0] && two[0].id, two[1] && two[1].id];
      // THE GEOMETRY THE FINDING IS ABOUT (the whole folded row is the tap target): a dry run — the first open, then the
      // second opened and read — chosen where (1) the transcript fits its list (nothing to scroll: the hold cannot land), (2)
      // the opened card would fit below its line had the hold landed (a PLANNED reveal of 0: a refusal keyed on the plan
      // stamps nothing), (3) an answering verb of it (a chip / Mark done / Dismiss) stands inside the row that was pressed —
      // the press goes there. A desk window's width / a phone's height is chosen so; the fonts decide the lines.
      const DRY = `(() => { const n = ${VIEW}._needsCards, l = ${VIEW}._messageList, sel = '.cn-card[data-item="${Q2}"]', lineOf = () => document.querySelector(sel + ' .cn-rows .ut-text').getBoundingClientRect().top;
        const fit = l.scrollHeight <= l.clientHeight + 1; n.openCard(${J(Q1)}); const row = document.querySelector(sel).getBoundingClientRect(), line = lineOf();
        n.openCard(${J(Q2)}); const landed = lineOf(), lr = l.getBoundingClientRect(); const all = [...document.querySelectorAll(sel + ' .cn-rows :is(button, textarea)')].filter((b) => b.getClientRects().length);
        const planLow = Math.max(...all.map((b) => b.getBoundingClientRect().bottom)) + (line - landed), noReveal = planLow <= lr.bottom;
        const vs = [...document.querySelectorAll(sel + ' .cn-rows :is(.ut-opt, .ut-done, .ut-dismiss)')].filter((b) => b.getClientRects().length).map((b) => ({ r: b.getBoundingClientRect(), c: String(b.className).split(' ').slice(0, 2).join('.') }));
        n.openCard(${J(Q1)}); const back = document.querySelector(sel).getBoundingClientRect(); n.openCard(${J(Q2)});
        const base = { fit, noReveal, moved: Math.round(landed - line), same: Math.abs(back.top - row.top) < 1, line };
        for (const { r, c } of vs) { const t = Math.max(r.top, row.top), b = Math.min(r.bottom, row.bottom), lf = Math.max(r.left, row.left), rt = Math.min(r.right, row.right); if (b - t >= 4 && rt - lf >= 6) return { ...base, x: (lf + rt) / 2, y: (t + b) / 2, verb: c }; }
        return { ...base, none: true, verbs: vs.map((v) => v.c + '@' + Math.round(v.r.top)), row: Math.round(row.top) + '–' + Math.round(row.bottom) }; })()`;
      let aim = null, at = null; const tried = [];
      for (const c of cands) {
        await toConv(A, sid, [Q1, Q2], c.w, c.h, touch, c.win);
        const r = await A.evalJs(DRY); tried.push({ at: c.says, ...r });
        if (r && !r.none && r.same && r.fit && r.noReveal) { aim = r; at = c; break; }
      }
      // a FRESH page for the person's presses (the dry run's opens leave nothing behind — a room a base never returns would
      // change the geometry the presses meet): the newest open, the first folded, the transcript fitting its list
      if (at) await toConv(A, sid, [Q1, Q2], at.w, at.h, touch, at.win);
      const room = await fits(A);
      // the person opens the first (the second folds) — then, past ARM_MS, a double press on the second's row: its first
      // press folds the first above it (the line moves UP) and opens it (its head above the line); the list cannot scroll
      // (it fits), so the line does not land where the pointer is — the second press lands on what stands there now
      const s1 = at ? await spot(A, Q1) : null;
      if (s1) await (touch ? A.tapAt(s1.x, s1.y) : A.clickAt(s1.x, s1.y));
      await sleep(1200);
      const s2 = s1 ? await spot(A, Q2) : null;
      const under = s2 ? await twice(A, { ...s2, x: aim.x, y: aim.y }, touch, Q2) : null;
      const t2 = await lineTop(A, Q2);
      const it2 = (await api()).open.find((i) => i.id === Q2), gone = (await api()).resolved.find((i) => i.id === Q2) || null;
      check(`RED-able (${size}${at ? ', ' + at.says : ', NO geometry found'}): the transcript fits its list (${room && room.sh} ≤ ${room && room.ch} px) and the opened card would fit below its held line (a planned reveal of 0) — a double ${touch ? 'tap' : 'click'} on the second's folded row: the line could not land (${s2 && t2 != null ? Math.round(t2 - s2.top) : aim ? aim.moved : '?'} px), the second press lands on ${under && under.verb ? 'its verb ' + under.verb : aim && aim.verb ? aim.verb : 'no verb'} — REFUSED («moved under the pointer»), nothing answered${gone ? ` (it ANSWERED: ${gone.status}${gone.reply ? ', replied «' + gone.reply.text + '»' : ''})` : ''}`,
        !!at && !!room && room.fits && !!s1 && s1.fold && !!s2 && s2.fold && s2.onRow && Math.abs(s2.top - aim.line) < 1 && t2 != null && Math.abs(t2 - s2.top) > 1 && !!under && under.inCard && !!under.verb && /moved under the pointer/.test(under.toast) && !!it2 && !it2.reply && !gone, { tried, room, s1, s2, aim, t2, under, it2: it2 ? { status: it2.status, reply: it2.reply || null } : null, gone: gone ? { status: gone.status, reply: gone.reply || null } : null });
      // ⑩b (a desk) THE LINE HELD, AND STILL A VERB UNDER THE POINTER: Mark done / Dismiss share the question's line at its
      // right end — a double click on the right end of a folded row (the first now folded above the open one) lands its second
      // press on them though the line landed exactly; what the pressed row now holds is measured too
      if (!touch) {
        await sleep(1200);
        const e1 = await A.evalJs(`(() => { const c = document.querySelector('.cn-card[data-item="${Q1}"]'), tx = ${LINE(Q1)}; if (!c || !tx || !c.classList.contains('cn-fold')) return null; const r = c.getBoundingClientRect(), t = tx.getBoundingClientRect(); return { x: r.right - 14, y: t.top + Math.min(t.height / 2, 9), top: t.top, fold: true }; })()`);
        const u1 = e1 ? await twice(A, e1, false, Q1) : null;
        const t1 = await lineTop(A, Q1);
        const it1 = (await api()).open.find((i) => i.id === Q1), gone1 = (await api()).resolved.find((i) => i.id === Q1) || null;
        check(`RED-able (${size}): the line HELD (${e1 && t1 != null ? Math.round(t1 - e1.top) : '?'} px) — a double click on the right end of the first's folded row lands its second press on ${u1 && u1.verb ? 'its verb ' + u1.verb : 'no verb'} (Mark done / Dismiss share the line) — REFUSED, nothing answered${gone1 ? ` (it ANSWERED: ${gone1.status})` : ''}`,
          !!e1 && t1 != null && Math.abs(t1 - e1.top) <= 1 && !!u1 && u1.inCard && /ut-done|ut-dismiss/.test(u1.verb || '') && /moved under the pointer/.test(u1.toast) && !!it1 && !gone1, { e1, t1, u1, gone1: gone1 ? { status: gone1.status } : null });
        // …its RED CONTROL: THIS source without the pressed-row clause (the measured line alone) — the same double click ANSWERS
        if (!ROW_BUNDLE) check('⑩b the pressed-row RED CONTROL bundle builds from this source (its anchor is this lane\'s line)', false, ROW_ERR);
        else try {
          mutant = { bundle: ROW_BUNDLE };
          await toConv(A, sid, [Q1, Q2], at.w, at.h, false, at.win); // a fresh page: the newest open, the first folded
          const m1 = await A.evalJs(`(() => { const c = document.querySelector('.cn-card[data-item="${Q1}"]'), tx = ${LINE(Q1)}; if (!c || !tx || !c.classList.contains('cn-fold')) return null; const r = c.getBoundingClientRect(), t = tx.getBoundingClientRect(); return { x: r.right - 14, y: t.top + Math.min(t.height / 2, 9), top: t.top, fold: true }; })()`);
          const mu = m1 ? await twice(A, m1, false, Q1) : null;
          const g1 = (await api()).resolved.find((i) => i.id === Q1) || null;
          check(`RED CONTROL: without the pressed-row clause (the line alone, which held), the same double click on the row's right end ANSWERS the first with its ${g1 ? (g1.status === 'dismissed' ? 'Dismiss' : 'Mark done') : '?'} (${g1 ? g1.status : 'still open'})`, !!m1 && !!g1 && g1.status !== 'open', { m1, mu, g1: g1 ? { status: g1.status } : null });
        } catch (e) { fail++; console.log('  ✗ ⑩b RED threw: ' + (e?.message || e)); } finally { mutant = null; }
      }
    } catch (e) { fail++; console.log(`  ✗ ⑩ (${size}) threw: ` + (e?.message || e)); }
  }
  lap('⑩ done');

  console.log('⑪ A CARD TALLER THAN THE LIST (acceptance round 5, #2): 375×667 — the reveal never takes the question past the list\'s top');
  try {
    const sid = await newConv('tall'); await sleep(600);
    sayTo(sid, 'please do:tall');
    const tall = (await byText(/^Before I merge the reports page tonight/, 1))[0];
    sayTo(sid, 'and do:q72');
    const q72 = (await byText(/^Stress question 72:/, 1))[0];
    await toConv(A, sid, [tall && tall.id, q72 && q72.id], 375, 667, true);
    // its folded row near the TOP of the list (where a person reaches it, scrolling up to it)
    await A.evalJs(`(() => { const v = ${VIEW}, l = v._messageList, c = document.querySelector('.cn-card[data-item="${tall && tall.id}"]'); v._noteUserNav?.('suite'); v._setPinned(false, 'suite'); l.scrollTop += c.getBoundingClientRect().top - (l.getBoundingClientRect().top + 24); return true; })()`); await sleep(600);
    const s = await spot(A, tall && tall.id);
    if (s) { await track(A, tall.id); await A.tapAt(s.x, s.y); }
    const o = s ? await opened(A, tall.id, s) : null;
    const g = await A.evalJs(`(() => { const v = ${VIEW}, l = v._messageList, c = document.querySelector('.cn-card[data-item="${tall && tall.id}"]'), tx = ${LINE(tall && tall.id)}; const lr = l.getBoundingClientRect(), r = tx.getBoundingClientRect(), cr = c.getBoundingClientRect(); const x = r.left + Math.min(r.width / 2, 60), y = r.top + 6; const hit = document.elementFromPoint(x, y);
      return { list: Math.round(lr.height), card: Math.round(cr.height), line: Math.round(r.top - lr.top), lineSeen: r.top >= lr.top - 1 && r.top < lr.bottom, onLine: !!(hit && (hit === tx || tx.contains(hit))), chips: c.querySelectorAll('.ut-opt').length }; })()`);
    check(`RED-able (375×667): a tap on the folded row of a card TALLER than the list (${g && g.card} px open, the list ${g && g.list} px, ${g && g.chips} chips) — its question line stays INSIDE the list (${g && g.line} px below its top, seen at the point: ${g && g.onLine}); ${how(o)} — the person scrolls to its verbs`,
      !!s && s.fold && s.onRow && !!o && o.open && o.drop != null && o.drop <= 1 && !!g && g.card > g.list && g.chips === 5 && g.lineSeen && g.onLine, { s, o, g });
    await A.shot('phone-375x667-tall-card.png');
  } catch (e) { fail++; console.log('  ✗ ⑪ threw: ' + (e?.message || e)); }
  lap('⑪ done');

  console.log('⑫ THE ROOM A HOLD BORROWED (acceptance round 5, #3): every road that ends its need returns it — one _giveBack');
  try {
    const sid = await newConv('room'); await sleep(600);
    for (const k of ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']) { sayTo(sid, 'a padding turn ' + k); await sleep(250); }
    sayTo(sid, 'two at once do:q61 do:q62');
    const two = await byText(/^Stress question (61|62):/, 2);
    const [R1, R2] = [two[0] && two[0].id, two[1] && two[1].id];
    await toConv(A, sid, [R1, R2], 1280, 800, false);
    await A.waitFor(`(() => { const l = ${VIEW}?._messageList; return !!l && l.scrollHeight > l.clientHeight + 200 && ${VIEW}._pinned; })()`, 8000); await sleep(600);
    const ROOM = `(() => { const v = ${VIEW}, l = v._messageList, n = v._needsCards; return { lent: Math.round(n._lent || 0), pad: l.style.paddingBottom || '', padPx: Math.round(parseFloat(getComputedStyle(l).paddingBottom)), pinned: v._pinned, below: Math.round(l.scrollHeight - l.scrollTop - l.clientHeight) }; })()`;
    const lastBottom = () => A.evalJs(`(() => { const l = ${VIEW}._messageList, m = [...l.querySelectorAll(':scope > .chat-msg')].pop(); return m ? Math.round(l.getBoundingClientRect().bottom - m.getBoundingClientRect().bottom) : null; })()`);
    // the hold at the live tail (the newest open below folds; the line held): the room is borrowed
    const s1 = await spot(A, R1);
    if (s1) await A.clickAt(s1.x, s1.y);
    await sleep(900);
    const r0 = await A.evalJs(ROOM);
    check(`setup: a click on the folded row above the newest at the live tail borrows room to hold its line (${r0.lent} px, padding «${r0.pad}»), the view pinned`, !!s1 && s1.fold && r0.lent > 0 && !!r0.pad && r0.pinned, { s1, r0 });
    // (a0) THE CARD'S OWN SIZE (acceptance round 6): the card that borrowed opens its «detail» fold (it grows below its line),
    //      then closes it (it shrinks back) — neither is the content the room was lent for (the tail, the list's edge): the
    //      room stays, and the line stays within 1 px every frame (d5e373b8 returned the room on the growth, so the shrink
    //      clamped the scroll and dropped the line by it)
    const SUM = `(() => { const c = document.querySelector('.cn-card[data-item="${R1}"]'), s = c && c.querySelector('.cn-rows .ut-detail-exp > summary'), tx = ${LINE(R1)}; if (!s || !tx) return null; const r = s.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 30), y: r.top + r.height / 2, top: tx.getBoundingClientRect().top, h: Math.round(c.getBoundingClientRect().height), open: !!c.querySelector('.cn-rows .ut-detail-exp[open]') }; })()`;
    const own0 = await A.evalJs(SUM);
    await A.evalJs(`(() => { window.__cnOwn = []; const t0 = performance.now(); const f = () => { const tx = ${LINE(R1)}; if (tx) window.__cnOwn.push(tx.getBoundingClientRect().top); if (performance.now() - t0 < 2600) requestAnimationFrame(f); }; requestAnimationFrame(f); return true; })()`);
    if (own0) await A.clickAt(own0.x, own0.y);
    await sleep(900);
    const own1 = await A.evalJs(SUM), room1 = await A.evalJs(ROOM);
    if (own1) await A.clickAt(own1.x, own1.y);
    await sleep(1100);
    const own2 = await A.evalJs(SUM), room2 = await A.evalJs(ROOM);
    await sleep(700);
    const ownTr = await A.evalJs(`window.__cnOwn || []`);
    const ownDev = own0 && ownTr.length ? Math.round(Math.max(...ownTr.map((y) => Math.abs(y - own0.top))) * 10) / 10 : null;
    check(`RED-able (round 6): the card that borrowed opens its «detail» (${own0 && own0.h} → ${own1 && own1.h} px) and closes it again (→ ${own2 && own2.h} px) at the live tail — its line moved at most ${ownDev} px over ${ownTr.length} frames (the room ${r0.lent} → ${room1.lent} → ${room2.lent} px: the card's own size neither returns nor needs it)`,
      !!own0 && !own0.open && !!own1 && own1.open && own1.h > own0.h + 4 && !!own2 && !own2.open && Math.abs(own2.h - own0.h) <= 1 && ownTr.length > 20 && ownDev != null && ownDev <= 1 && room2.lent === r0.lent, { own0, own1, own2, room1, room2, ownDev, frames: ownTr.length });
    // (a) A RECORD LANDS on the pinned view while the room stands: the follow is answered by the room first — the new records
    //     fill it (nothing moves for them), never a blank band followed below the last record
    sayTo(sid, 'a turn that lands while the room stands');
    await A.waitFor(`[...document.querySelectorAll('.chat-msg')].some((m) => /a turn that lands while the room stands/.test(m.textContent))`, 8000); await sleep(1200);
    const ra = await A.evalJs(ROOM), la = await lastBottom();
    check(`RED-able (round 5, #3): a record landing on the pinned view while ${r0.lent} px of room stand fills it — ${r0.lent} → ${ra.lent} px, the last record ${la} px above the list's bottom (its padding, ${ra.padPx} px: no blank band beyond the room left), the view at its bottom, pinned`, ra.lent < r0.lent && ra.pinned && ra.below <= 1 && la != null && Math.abs(la - ra.padPx) <= 2, { r0, ra, la });
    // a second hold at the live tail: two more asks at the end, the folded one above the newest
    sayTo(sid, 'two more do:q63 do:q64');
    const more = await byText(/^Stress question (63|64):/, 2);
    const [R3, R4] = [more[0] && more[0].id, more[1] && more[1].id];
    await A.waitFor(`!!document.querySelector('.cn-card[data-item="${R3}"].cn-fold') && !!document.querySelector('.cn-card[data-item="${R4}"].cn-open:not(.cn-fold)') && ${VIEW}._pinned`, 10000); await sleep(1200);
    const s3 = await spot(A, R3);
    if (s3) await A.clickAt(s3.x, s3.y);
    await sleep(900);
    const rb0 = await A.evalJs(ROOM);
    // (b) A SCROLL UP INSIDE THE ROOM: what left the view below goes back at once — the view stays at its very bottom and
    //     pinned (the content's end is in sight): the room never counts toward the view's unpin band
    const d = Math.max(2, Math.min(8, rb0.lent - 4));
    await A.evalJs(`(() => { ${VIEW}._messageList.scrollTop -= ${d}; return true; })()`); await sleep(500);
    const rb = await A.evalJs(ROOM);
    check(`RED-able (round 5, #3): a scroll up by ${d} px inside the room (${rb0.lent} px) returns what left the view (${rb0.lent} → ${rb.lent} px) — the view at its very bottom (${rb.below} px below), pinned (${rb.pinned})`, !!s3 && s3.fold && rb0.lent > d && rb.lent <= rb0.lent - d + 1 && rb.below <= 1 && rb.pinned, { s3, rb0, d, rb });
    // (c) THE CARD THAT BORROWED RESOLVES (another client): the room goes with it — the briefed RED control
    const st = await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(R3)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    await A.waitFor(`document.querySelector('.cn-card[data-item="${R3}"]')?.classList.contains('cn-done')`, 8000); await sleep(400);
    const rc = await A.evalJs(ROOM);
    check(`RED-able (round 5, #3): the card that borrowed RESOLVES (POST ${st}) — the room is returned (${rb.lent} → ${rc.lent} px, padding «${rc.pad}»)`, st === 200 && rb.lent > 0 && rc.lent === 0 && rc.pad === '', { rb, rc });
    // (d) THE VIEW DISPOSED (its window closed) with room borrowed: nothing borrowed outlives it
    const rd = await A.evalJs(`(() => { const v = ${VIEW}, l = v._messageList, n = v._needsCards; if (!n._lent) n._lend(l, 30, document.querySelector('.cn-card[data-item="${R4}"]')); const lent = Math.round(n._lent || 0); app.wm.closeWindow(${CHAT(sid)}.id); return { lent, pad: l.style.paddingBottom || '', disposed: !!v._disposed }; })()`);
    check(`the view disposed with ${rd.lent} px borrowed: returned (padding «${rd.pad}»)`, rd.lent > 0 && rd.disposed && rd.pad === '', rd);
  } catch (e) { fail++; console.log('  ✗ ⑫ threw: ' + (e?.message || e)); }
  lap('⑫ done');


  // ── lane needs-card-tail: THE TAIL + THE ONE LANDING — one conversation whose six asks stand ~300 records above the window ──
  console.log('⑬ THE STACKED TAIL + THE ONE LANDING (lane needs-card-tail — the owner on 2.369.360: «这个应该同时堆叠在页面最下吗？»; R5: «inbox点消息跳转会对话的时候…直接跳转到对应的上下文»)');
  try {
    // only this conversation's asks wait from here on (the earlier legs' items done) — the tray's bands show each of them
    for (const it of (await api()).open) await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(it.id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    const sid = await newConv('tail'); await sleep(600);
    sayTo(sid, 'six asks do:q71 do:q72 do:h73 do:q74 do:l75 do:l76'); // the third's tool output names no id (R5 (b)'s record-less ask); the last two long (R4's cut)
    const six = await byText(/^(Stress|Longer) question 7[1-6]:/, 6);
    const ids = six.map((i) => i.id); // oldest first
    await sleep(2600); // the history that follows is stamped past the filings (placementOf's SKEW_MS)
    sayTo(sid, 'a long history do:fill150');
    const bsid = six[0] ? six[0].sessionKey.slice(six[0].sessionKey.indexOf(':') + 1) : '';
    const page = async (offset, limit) => { try { return await (await fetch(`${ORIGIN}/api/session-messages?backend=claude&backendSessionId=${encodeURIComponent(bsid)}&cwd=${encodeURIComponent(WORK)}&offset=${offset}&limit=${limit}`)).json(); } catch { return {}; } };
    let total = 0;
    for (let i = 0; i < 150 && total < 300; i++) { total = (await page(0, 1)).total || 0; if (total < 300) await sleep(200); }
    const TAILQ = `(() => { const v = ${VIEW}; if (!v) return null; const l = v._messageList, cards = [...l.querySelectorAll(':scope > * > .cn-cards > .cn-card.cn-open')], last = [...l.querySelectorAll(':scope > .chat-msg')].pop(), chip = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'), d = v._attnDock, srow = d && !d.hidden ? d.querySelector('.cad-rows > .ut-item') : null;
      return { strip: srow ? srow.dataset.id : null, ws: v._windowStart, we: v._windowEnd, total: v._total, n: cards.length, ids: cards.map((c) => c.dataset.item), atLast: cards.filter((c) => c.closest('.chat-msg') === last).length, docked: cards.filter((c) => c.classList.contains('cn-docked')).map((c) => c.dataset.item), dock: d ? d.textContent : '', dockShown: !!d && d.getClientRects().length > 0, chip: chip && chip.offsetParent ? chip.textContent.trim() : '', open: cards.filter((c) => !c.classList.contains('cn-fold')).map((c) => c.dataset.item) }; })()`;
    const atTail = (P, n) => P.waitFor(`(() => { const v = ${VIEW}, c = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'); return !!v && v._total >= ${total} && v._windowEnd >= v._total && !!c && new RegExp('· ${n} ').test(c.textContent + ' '); })()`, 15000);
    // R1 at 1280 — THE OWNER'S SHAPE: the window at the tail, six asks whose records are far above it
    await toConv(A, sid, [], 1280, 800, false); await atTail(A, 6); await sleep(1200);
    const t0 = await A.evalJs(TAILQ);
    await A.shot('desktop-1280-tail.png');
    check(`setup: six asks, then ${total - 11} records of history — the window loaded at the tail (records ${t0 && t0.ws}–${t0 && t0.we} of ${t0 && t0.total}), the asks' records far above it`, ids.length === 6 && total >= 300 && !!t0 && t0.ws > 200 && t0.we === t0.total, { ids: ids.length, total, t0 });
    check(`r10 R1 (RED on 90c995a3: six cards stacked at the end; on bd5c5fd98: ONE docked card, «停靠在末尾 — 它是在对话更上面提出的 · 共 6 个在等你») the end holds NO card (${t0 && t0.n} open in the window, ${t0 && t0.atLast} under the last record); the strip «${t0 && t0.chip}» shows the NEWEST`, !!t0 && t0.n === 0 && t0.atLast === 0 && t0.strip === ids[5] && /· 6 questions/.test(t0.chip), t0);
    // R1 at 390×844 (the phone): the same
    await toConv(A, sid, [], 390, 844, true); await atTail(A, 6); await sleep(1200);
    const p0 = await A.evalJs(TAILQ);
    await A.shot('phone-390-tail.png');
    check(`r10 R1 at 390×844 touch: NO card at the end (${p0 && p0.n}); the strip «${p0 && p0.chip}» shows the newest`, !!p0 && p0.n === 0 && p0.atLast === 0 && p0.strip === ids[5] && /· 6 /.test(p0.chip + ' '), p0);
    // R2 (r10) — the strip's question lands the NEWEST ask (its record ~300 records above the window: the window loaded up to
    //      it); the OLDEST through its For-you door (the For-you window is the index of every ask now — «View all»)
    await toConv(A, sid, [], 1280, 800, false); await atTail(A, 6); await sleep(900);
    await A.evalJs(`(() => { window.__cnFlash = []; new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('chat-ask-flash') && m.target.dataset?.item) window.__cnFlash.push(m.target.dataset.item); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); return 1; })()`);
    await A.press('.chat-attn-dock .cad-rows .ut-item .ut-text', { touch: false });
    const INPLACE = (id) => `(() => { const v = ${VIEW}, c = document.querySelector('.cn-card[data-item="${id}"]'); if (!v || !c) return null; const raw = c.closest('.chat-msg')?._rawMsg, lr = v._messageList.getBoundingClientRect(), r = c.getBoundingClientRect();
      return { ws: v._windowStart, we: v._windowEnd, total: v._total, cmd: raw && raw.content && raw.content[0] && raw.content[0].input ? String(raw.content[0].input.command || '').slice(0, 60) : '', open: !c.classList.contains('cn-fold') && c.classList.contains('cn-open'), docked: c.classList.contains('cn-docked'), inView: r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1, docks: document.querySelectorAll('.cn-card.cn-docked').length, st: Math.round(v._messageList.scrollTop) }; })()`;
    const landed = (id, q) => A.waitFor(`(() => { const x = ${INPLACE(id)}; return !!x && x.open && x.inView && !x.docked && /(Stress|Longer) question ${q}/.test(x.cmd); })()`, 15000);
    await landed(ids[5], 76); await sleep(900);
    const l6 = await A.evalJs(INPLACE(ids[5])), fl6 = await A.evalJs('window.__cnFlash || []');
    await A.shot('desktop-1280-dock-landed.png');
    check(`r10 R2 (RED on bd5c5fd98: no strip — the chip listed them) a tap on the strip's question loads the window UP to the newest ask (records ${l6 && l6.ws}–${l6 && l6.we} of ${l6 && l6.total}) and opens its card IN ITS tool card («${l6 && l6.cmd}»), whole in view, flashed`, !!l6 && l6.ws < t0.ws && /Longer question 76/.test(l6.cmd) && l6.open && l6.inView && fl6.includes(ids[5]), { l6, fl6 });
    await A.evalJs(`(() => { const it = app._inboxModel.byId(${J(ids[0])}); window.__cnFlash = []; app._inboxModel.jump(it.sessionKey, it); return 1; })()`);
    await landed(ids[0], 71); await sleep(900);
    const l1 = await A.evalJs(INPLACE(ids[0])), fl1 = await A.evalJs('window.__cnFlash || []');
    await A.shot('desktop-1280-door-oldest-landed.png');
    check(`R2 the OLDEST ask's For-you door loads the window UP to it (records ${l1 && l1.ws}–${l1 && l1.we} of ${l1 && l1.total}) and opens its card IN ITS tool card («${l1 && l1.cmd}»), whole in view, flashed once; no dock in a window that ends mid-history`, !!l1 && l1.we < l1.total && l1.ws < t0.ws && /Stress question 71/.test(l1.cmd) && l1.open && l1.inView && l1.docks === 0 && fl1.includes(ids[0]), { l1, fl1 });
    // R4 — A FOLDED ROW KEEPS ITS AGE: the window narrowed to 380 px (the questions must give way) — each folded card in the
    //      landed window is ONE line, the question cut if it must, its age whole and the last thing on it
    await A.evalJs(`(() => { const w = ${CHAT(sid)}; if (!w) return false; if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.resizeWindowTo(w.id, { w: 380, h: 720 }); return true; })()`); await sleep(900);
    const folds = await A.evalJs(`[...document.querySelectorAll('.cn-card.cn-fold')].filter((c) => c.getClientRects().length).map((c) => { const row = c.querySelector('.cn-rows > .ut-item'), tx = row && row.querySelector('.ut-text'), m = row && row.querySelector('.ut-meta'); if (!row || !tx || !m) return { id: c.dataset.item, ok: false }; const r = row.getBoundingClientRect(), a = m.getBoundingClientRect(), q = tx.getBoundingClientRect(); return { id: c.dataset.item, ok: a.width > 8 && a.right <= r.right + 0.5 && a.left >= q.right - 0.5 && Math.abs(a.bottom - q.bottom) < 6, cut: tx.scrollWidth > tx.clientWidth + 1, age: m.textContent.trim(), w: Math.round(r.width) }; })`);
    await A.shot('desktop-380-folded-ages.png');
    check(`R4 a folded row keeps its age: ${folds.length} folded cards in a 380 px window, ${folds.filter((f) => f.cut).length} questions cut — every age whole, the last thing on its one line («${folds.map((f) => f.age).join('», «')}»)`, folds.length >= 2 && folds.some((f) => f.cut) && folds.every((f) => f.ok), folds);
    // R3 (r10) — the newest answered elsewhere: the strip's row goes to the next newest IN THE SAME FRAME its count says 5
    await toConv(A, sid, [], 1280, 800, false); await atTail(A, 6); await sleep(900);
    await A.evalJs(`(() => { window.__cnTail = []; const t0 = performance.now(); const f = () => { const c = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'), d = document.querySelector('.chat-attn-dock:not([hidden]) .cad-rows > .ut-item'); window.__cnTail.push(((c && c.offsetParent ? (/· (\\d+)/.exec(c.textContent) || [])[1] : '0') || '?') + '/' + (d ? d.dataset.id : '')); if (performance.now() - t0 < 3000) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
    const st = await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(ids[5])}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    await sleep(3300);
    const states = [...new Set(await A.evalJs('window.__cnTail || []'))];
    check(`r10 R3 the newest ask answered (another client, POST ${st}) ⇒ the strip's row goes to the next newest and its count says 5 in the SAME frame (frames: ${states.join(' → ')})`, st === 200 && states.length === 2 && states[0] === '6/' + ids[5] && states[1] === '5/' + ids[4], states);
    // R5 (a) — THE TRAY ROW'S DOOR (its conversation's name) for an ask ~300 records above the window: the view lands there
    const door = async (id) => {
      await A.press('#taskbar-user-todos', { touch: false });
      await A.waitFor(`!!document.querySelector('#user-todos-popup .ut-item[data-id="${id}"] .ut-sess')`, 6000);
      await A.press(`#user-todos-popup .ut-item[data-id="${id}"] .ut-sess`, { touch: false });
    };
    await door(ids[1]);
    await landed(ids[1], 72); await sleep(900);
    const d1 = await A.evalJs(INPLACE(ids[1]));
    await A.shot('desktop-1280-door-landed.png');
    check(`R5 (RED on 90c995a3: the window stays at the tail, the ask out of sight) the tray row's door lands on the record that filed it — the window loaded up to it (records ${d1 && d1.ws}–${d1 && d1.we}), its card open in its tool card («${d1 && d1.cmd}»), whole in view`, !!d1 && d1.we < d1.total && /Stress question 72/.test(d1.cmd) && d1.open && d1.inView, d1);
    // R5 (b) — an ask with NO record (filed before what the conversation's record holds — the asks filed before 2.369.360):
    //          no record names it (do:h73) and its createdAt is set before the first record (this page's copy — nothing at or
    //          before its filing, no CLI call before it) ⇒ the door docks it at the end and says why
    const first = ((await page(0, 1)).messages || [])[0];
    const firstTs = first ? Number(first.ts) || 0 : 0;
    // (this page's store copy — every snapshot read through it, so a refresh the tray's open fetches cannot undo the shift)
    const shifted = await A.evalJs(`(() => { const m = app._inboxModel, get = Object.getOwnPropertyDescriptor(m, 'todos').get, id = ${J(ids[2])}, at = ${firstTs} - 3600e3;
      Object.defineProperty(m, 'todos', { configurable: true, get() { const t = get.call(m); for (const i of t.open || []) if (i.id === id) i.createdAt = at; return t; } }); ${VIEW}._needsCards.schedule(); return !!m.todos.open.find((i) => i.id === id && i.createdAt === at); })()`);
    await A.evalJs(`(() => { window.__cnToast = []; new MutationObserver(() => { for (const x of document.querySelectorAll('.global-toast')) if (!window.__cnToast.includes(x.textContent)) window.__cnToast.push(x.textContent); }).observe(document.body, { subtree: true, childList: true, characterData: true }); return 1; })()`);
    await door(ids[2]);
    await A.waitFor(`(() => { const v = ${VIEW}; return !!v && v._windowEnd >= v._total && (window.__cnToast || []).some((x) => /record was kept/.test(x)); })()`, 15000); await sleep(900);
    const n1 = await A.evalJs(`(() => { const v = ${VIEW}, l = v._messageList; return { atEnd: v._windowEnd >= v._total, gap: Math.round(l.scrollHeight - l.clientHeight - l.scrollTop), card: !!document.querySelector('.cn-card[data-item="${ids[2]}"]'), toast: (window.__cnToast || []).join(' | '), strip: !!v._attnDock && !v._attnDock.hidden }; })()`);
    await A.shot('desktop-1280-no-record-said.png');
    check(`r10 R5 an ask with no record at all (RED on bd5c5fd98: the door DOCKED it at the end, «asked before this conversation's record was kept») ⇒ the door lands at the live END and SAYS it («${n1 && n1.toast}»); no card for it anywhere in the flow; the strip stands`, shifted && firstTs > 0 && !!n1 && n1.atEnd && n1.gap <= 2 && !n1.card && /Asked before this conversation's record was kept/.test(n1.toast) && n1.strip, n1);
    // R5 (c) — AN OPEN CONVERSATION THE PERSON SCROLLED: a broadcast (a new filing) never moves it; a press on a door lands
    const lc = await A.evalJs(`(() => { const r = ${VIEW}._messageList.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    for (let i = 0; i < 4; i++) { await A.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: lc.x, y: lc.y, deltaX: 0, deltaY: -240 }); await sleep(120); }
    await sleep(2500); // the wheel's landing settles (content-visibility's heights) before the reader's line is read
    // the reader's line: the first record reaching past the list's middle — read again after the broadcast, BY ITS ID
    const READ = (id) => `(() => { const v = ${VIEW}, l = v._messageList, lr = l.getBoundingClientRect(), mid = lr.top + lr.height / 2; const m = ${J(id)} ? [...l.querySelectorAll(':scope > .chat-msg')].find((x) => x.dataset.msgId === ${J(id)}) : [...l.querySelectorAll(':scope > .chat-msg')].find((x) => { const r = x.getBoundingClientRect(); return r.height > 0 && r.bottom > mid; }); return { st: Math.round(l.scrollTop), pinned: v._pinned, id: m ? m.dataset.msgId : null, top: m ? Math.round(m.getBoundingClientRect().top * 10) / 10 : null }; })()`;
    const s0 = await A.evalJs(READ(null));
    // the For-you store's broadcast — this conversation's ask answered on another client (the chip and the dock re-drawn, no
    // new turn: a new turn folds the turn before it, chat-view's own run fold, whatever the landing does)
    const st5 = await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(ids[4])}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    await A.waitFor(`/· 3 /.test((document.querySelector('.chat-attn-dock:not([hidden]) .cad-count') || {}).textContent + ' ')`, 8000); await sleep(1200);
    const s1 = await A.evalJs(READ(s0.id));
    check(`R5 a BROADCAST (this conversation's ask answered on another client — POST ${st5}, the chip «· 3») never moves a reader who scrolled — the record at the reader's line stays (${s0.id} at ${s0.top} → ${s1.top} px), unpinned`, st5 === 200 && !!s0.id && !s0.pinned && !s1.pinned && s1.id === s0.id && Math.abs(s0.top - s1.top) <= 1, { s0, s1 });
    await door(ids[3]);
    await landed(ids[3], 74); await sleep(900);
    const c1 = await A.evalJs(INPLACE(ids[3]));
    check(`R5 …a PRESS on its tray row's door does: the view lands on the record that filed it («${c1 && c1.cmd}»), its card open, whole in view`, !!c1 && /Stress question 74/.test(c1.cmd) && c1.open && c1.inView, c1);
  } catch (e) { fail++; console.log('  ✗ ⑬ threw: ' + (e?.message || e)); }
  lap('⑬ done');

  // ── ⑭ THE TAIL, ROUND 2 (lane needs-card-tail r2 — the r1 verdict on 9de5c902; its harnesses acc-r1-below-window /
  // acc-r1-race / make-fold-leg / the claim run's 4-wheels + back-at-bottom + the two-client swap, folded into ONE
  // conversation: three asks spread over ~900 records) ──
  console.log('⑭ THE TAIL r2 (r10: no card at the END — the strip above the message box holds the newest) — older history loaded, back at the bottom; a landing reads DOWN as well as up; a stale landing never moves the reader; the docked ask answered elsewhere moves no reader; a landing unfolds what it lands on');
  try {
    for (const it of (await api()).open) await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(it.id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    const sid = await newConv('r2'); await sleep(600);
    let bsid = '', total = 0;
    const page = async (offset, limit) => { try { return await (await fetch(`${ORIGIN}/api/session-messages?backend=claude&backendSessionId=${encodeURIComponent(bsid)}&cwd=${encodeURIComponent(WORK)}&offset=${offset}&limit=${limit}`)).json(); } catch { return {}; } };
    const grown = async (n) => { for (let i = 0; i < 200; i++) { total = (await page(0, 1)).total || 0; if (total >= n) return total; await sleep(200); } return total; };
    const q = [];
    for (const n of [81, 82, 83]) {
      sayTo(sid, `an ask do:q${n}`);
      const it = (await byText(new RegExp(`^Stress question ${n}:`), 1))[0];
      q.push(it);
      if (it && !bsid) bsid = it.sessionKey.slice(it.sessionKey.indexOf(':') + 1);
      await sleep(2600); // the history that follows is stamped past the filing (placementOf's SKEW_MS)
      const before = (await page(0, 1)).total || 0;
      sayTo(sid, 'a long history do:fill150');
      await grown(before + 300);
    }
    const all = (await page(0, total)).messages || [];
    const where = q.map((it) => (it ? all.findIndex((m) => m.role === 'tool' && JSON.stringify(m.content || '').includes(it.id)) : -1));
    check(`setup: three asks spread over ${total} records — their records at ${where.join(' · ')}`, q.every(Boolean) && total >= 900 && where.every((k) => k >= 0) && where[1] > 250 && where[2] > 550 && where[2] < total - 250, { total, where });
    const ids = q.map((it) => it && it.id);
    const DOMQ = `(() => { const v = ${VIEW}, l = v._messageList; const kids = [...l.querySelectorAll(':scope > .chat-msg:not(.chat-gap-msg)')], lastKid = kids[kids.length - 1]; const cards = [...l.querySelectorAll(':scope > * > .cn-cards > .cn-card.cn-open')]; const lr = l.getBoundingClientRect(), chip = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'), srow = v._attnDock && !v._attnDock.hidden ? v._attnDock.querySelector('.cad-rows > .ut-item') : null;
      return { strip: srow ? srow.dataset.id : null, ws: v._windowStart, we: v._windowEnd, total: v._total, pinned: v._pinned, gap: Math.round(l.scrollHeight - l.clientHeight - l.scrollTop), nDom: kids.length, chip: chip ? chip.textContent.trim() : '',
        cards: cards.map((c) => { const h = c.closest('.chat-msg'), r = c.getBoundingClientRect(); return { id: c.dataset.item, docked: c.classList.contains('cn-docked'), host: (h?.dataset.msgId || '').replace(/^.*:(m|t):/, '$1:'), hostDomIdx: kids.indexOf(h), atDomEnd: h === lastKid, dock: (c.querySelector('.cn-dock') || {}).textContent || '', shown: c.getClientRects().length > 0 && r.height > 0, inView: r.bottom > lr.top && r.top < lr.bottom }; }) }; })()`;
    const wheel = async (n, dy) => { const lc = await A.evalJs(`(() => { const r = ${VIEW}._messageList.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`); for (let i = 0; i < n; i++) { await A.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: lc.x, y: lc.y, deltaX: 0, deltaY: dy }); await sleep(120); } await sleep(2500); };
    const atTailN = (n) => A.waitFor(`(() => { const v = ${VIEW}, c = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'); return !!v && v._total >= ${total} && v._windowEnd >= v._total && !!c && new RegExp('· ${n} ').test(c.textContent + ' '); })()`, 20000);
    const docked = (w) => w.cards.filter((c) => c.docked);
    // #1 THE END IS THE DISPLAY ORDER'S: at the tail, then one older page loaded by the reader's own wheel, then back down
    await toConv(A, sid, [], 1280, 800, false); await atTailN(3); await sleep(1500);
    const w0 = await A.evalJs(DOMQ);
    check(`r10 #1 at the tail (records ${w0.ws}–${w0.we} of ${w0.total}) NO card at the end (RED on bd5c5fd98: ONE docked under the last record) — the strip shows the newest ask`, !w0.cards.some((c) => c.atDomEnd) && docked(w0).length === 0 && w0.strip === ids[2] && /· 3 /.test(w0.chip + ' '), w0);
    await wheel(4, -240);
    const w1 = await A.evalJs(DOMQ);
    await A.shot('desktop-1280-r2-after-4-wheels.png');
    check(`#1 (RED on 9de5c902: drawn under the older page's last record, mid-history, «· 3 waiting» with filler below it) the reader scrolled up 4 wheels — older history loaded (records ${w1.ws}–${w1.we}) — r10: still NO card at the end, the strip unchanged (the newest)`, w1.ws < w0.ws && !w1.cards.some((c) => c.atDomEnd) && docked(w1).length === 0 && w1.strip === ids[2], w1);
    for (let k = 0; k < 14; k++) { await wheel(1, 400); const g = await A.evalJs(DOMQ); if (g.gap <= 2) break; }
    await sleep(1500);
    const w2 = await A.evalJs(DOMQ);
    await A.shot('desktop-1280-r2-back-at-bottom.png');
    check(`#1 (RED on 9de5c902: no card at the end while the chip says «· 3 questions») back down at the bottom (r10): no card at the end, the strip «${w2.chip}» — the newest`, w2.gap <= 2 && !w2.cards.some((c) => c.atDomEnd) && w2.strip === ids[2] && /· 3 /.test(w2.chip + ' '), w2);
    // #2 A LANDING READS BOTH WAYS: the walk the chip invites — the oldest (the window loads at the top), then one filed BELOW
    const ST = (id) => `(() => { const v = ${VIEW}, c = document.querySelector('.cn-card[data-item="' + ${J(id)} + '"]'); const raw = c && c.closest('.chat-msg')?._rawMsg; const lr = v._messageList.getBoundingClientRect(), r = c ? c.getBoundingClientRect() : null; return { ws: v._windowStart, we: v._windowEnd, total: v._total, card: !!c, docked: !!c && c.classList.contains('cn-docked'), dock: c ? (c.querySelector('.cn-dock') || {}).textContent || '' : '', cmd: raw && raw.content && raw.content[0] && raw.content[0].input ? String(raw.content[0].input.command || '').slice(0, 40) : '', inView: !!r && r.height > 0 && r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1 }; })()`;
    // (r10: the chip's list is gone — an ask CHOSEN lands through its For-you door: model.jump → landOnFiling, THE ONE LANDING)
    const pick = async (id) => { await A.evalJs(`(() => { const it = app._inboxModel.byId(${J(id)}); app._inboxModel.jump(it.sessionKey, it); return 1; })()`); };
    const choose = async (id, n) => { await pick(id); await A.waitFor(`(() => { const x = ${ST(id)}; return x.card && x.inView && (/question ${n}/.test(x.cmd) || x.docked); })()`, 15000).catch(() => {}); await sleep(1200); return A.evalJs(ST(id)); };
    const s1 = await choose(ids[0], 81);
    check(`#2 the oldest (q81) lands at its record — the window loaded up to it (records ${s1.ws}–${s1.we})`, s1.card && !s1.docked && /question 81/.test(s1.cmd) && s1.ws === 0, s1);
    const s2 = await choose(ids[2], 83);
    await A.shot('desktop-1280-r2-below-window.png');
    check(`#2 (RED on 9de5c902: docked at the live end with «asked before this conversation's record was kept») from that window, q83 — its record BELOW it, at ${where[2]} — lands AT its record (records ${s2.ws}–${s2.we})`, s2.card && !s2.docked && /question 83/.test(s2.cmd) && s2.ws <= where[2] && s2.we > where[2], s2);
    const s3 = await choose(ids[1], 82);
    check(`#2 …and q82 (its record at ${where[1]}, ABOVE that window) lands at its record (records ${s3.ws}–${s3.we})`, s3.card && !s3.docked && /question 82/.test(s3.cmd) && s3.ws <= where[1] && s3.we > where[1], s3);
    // #3 THE DISPLACEMENT LAW: q82 on screen; a slow page read (2.5 s each — a remote transcript), q81 pressed (its read
    // upward in flight), then q82 — the person's latest choice
    await A.evalJs(`(() => { const v = ${VIEW}; v.__slowFetch = v._fetchMessages; v._fetchMessages = (o, l) => new Promise((r) => setTimeout(r, 2500)).then(() => v.__slowFetch.call(v, o, l)); return 1; })()`);
    await pick(ids[0]); await sleep(300);
    await pick(ids[1]); await sleep(1500);
    const r1 = await A.evalJs(ST(ids[1]));
    await sleep(9000);
    const r2 = await A.evalJs(ST(ids[1])), r81 = await A.evalJs(ST(ids[0]));
    await A.evalJs(`(() => { const v = ${VIEW}; if (v.__slowFetch) { v._fetchMessages = v.__slowFetch; delete v.__slowFetch; } return 1; })()`);
    await A.shot('desktop-1280-r2-race.png');
    check(`#3 (RED on 9de5c902: 9 s later the stale q81 landing dragged the view to records 0–50) the LATEST press stands — q82 in view (records ${r2.ws}–${r2.we}), the older landing's read finished and moved nothing`, r1.card && r1.inView && r2.card && r2.inView && /question 82/.test(r2.cmd) && r2.ws === r1.ws, { r1, r2, r81 });
    // minor THE DOCKED ASK ANSWERED ELSEWHERE MOVES NO READER: the tail, 4 wheels up, q83 (docked) answered by another client
    await toConv(A, sid, [], 1280, 800, false); await atTailN(3); await sleep(1500);
    await wheel(4, -240);
    const READ = (id) => `(() => { const v = ${VIEW}, l = v._messageList, lr = l.getBoundingClientRect(), mid = lr.top + lr.height / 2; const m = ${J(id)} ? [...l.querySelectorAll(':scope > .chat-msg')].find((x) => x.dataset.msgId === ${J(id)}) : [...l.querySelectorAll(':scope > .chat-msg')].find((x) => { const r = x.getBoundingClientRect(); return r.height > 0 && r.bottom > mid; }); return { st: Math.round(l.scrollTop), pinned: v._pinned, id: m ? m.dataset.msgId : null, top: m ? Math.round(m.getBoundingClientRect().top * 10) / 10 : null }; })()`;
    const b0 = await A.evalJs(READ(null)), d0 = await A.evalJs(DOMQ);
    const stc = await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(ids[2])}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    await A.waitFor(`/· 2 /.test((document.querySelector('.chat-attn-dock:not([hidden]) .cad-count') || {}).textContent + ' ')`, 8000); await sleep(1500);
    const b1 = await A.evalJs(READ(b0.id)), d1 = await A.evalJs(DOMQ);
    check(`minor (RED on 9de5c902: 87 px — the misplaced dock above the reader shrank) the DOCKED ask answered on another client (POST ${stc}, the chip «${d1.chip}») moves the scrolled reader 0 px (${b0.id} at ${b0.top} → ${b1.top}); the strip went to the next newest (r10 — no card at the end)`, stc === 200 && !!b0.id && !b0.pinned && b1.id === b0.id && Math.round(Math.abs(b0.top - b1.top)) === 0 && d1.strip === ids[1] && !d1.cards.some((c) => c.atDomEnd), { b0, b1, d0, d1 });
    // #4 A LANDING UNFOLDS WHAT IT LANDS ON: q83 answered — its quiet record sits in its Bash card, folded by default; the
    // For-you door (model.jump → landOnFiling → landOnItem) from the bottom
    for (let k = 0; k < 14; k++) { await wheel(1, 400); const g = await A.evalJs(DOMQ); if (g.gap <= 2) break; }
    const FOLD = `(() => { const v = ${VIEW}, c = document.querySelector('.cn-card[data-item="' + ${J(ids[2])} + '"]'); const host = c && c.closest('.chat-msg'); const l = v._messageList, lr = l.getBoundingClientRect(); const r = c ? c.getBoundingClientRect() : null;
      return { card: !!c, cls: c ? c.className : '', rects: c ? c.getClientRects().length : -1, hostFolded: !!host && host.classList.contains('chat-run-collapsed'), hostDisplay: host ? getComputedStyle(host).display : null, inView: !!r && r.height > 0 && r.bottom > lr.top && r.top < lr.bottom, st: Math.round(l.scrollTop), ws: v._windowStart, we: v._windowEnd }; })()`;
    await A.evalJs(`(() => { const it = app._inboxModel.byId(${J(ids[2])}); app._inboxModel.jump(it.sessionKey, it); return 1; })()`);
    await A.waitFor(`(() => { const x = ${FOLD}; return x.card && x.ws <= ${where[2]} && x.we > ${where[2]}; })()`, 15000).catch(() => {});
    await sleep(1600);
    const f1 = await A.evalJs(FOLD);
    await A.shot('desktop-1280-r2-folded-door.png');
    check(`#4 (RED on 9de5c902: «card» returned, the record display:none, the list run to scrollTop 0) the For-you door of the ANSWERED q83 (its record folded in a closed run) opens the run and lands on it — its quiet record visible, in view (records ${f1.ws}–${f1.we}, scrollTop ${f1.st})`, f1.card && /cn-done/.test(f1.cls) && f1.rects > 0 && !f1.hostFolded && f1.hostDisplay !== 'none' && f1.inView, f1);
    // ── ⑮ THE TAIL, ROUND 3 (lane needs-card-tail r3 — the r2 delta verdict on ed660f19: the tail road's jumpToBottom took no
    // `stale` — an older landing's tail fetch replaced the window a newer landing, or the reader's own wheel, had just made).
    // q84 is filed with no record (no record names it, its createdAt set before the first record — this page's copy, as R5
    // (b)) ⇒ its landing reads up to record 0 (−1) and takes the TAIL road; the tail page made slow (2.5 s)
    console.log('⑮ THE TAIL r3 — the tail road obeys the displacement law: an older landing\'s slow tail fetch never replaces the window a newer press (or the reader\'s wheel) made');
    sayTo(sid, 'an ask do:h84');
    const q84 = (await byText(/^Stress question 84:/, 1))[0];
    const firstTs15 = Number((((await page(0, 1)).messages || [])[0] || {}).ts) || 0;
    const shifted15 = !!q84 && await A.evalJs(`(() => { const m = app._inboxModel, d = Object.getOwnPropertyDescriptor(m, 'todos'); window.__todos15 = d; const get = d.get, id = ${J(q84 ? q84.id : '')}, at = ${firstTs15} - 3600e3;
      Object.defineProperty(m, 'todos', { configurable: true, get() { const t = get.call(m); for (const i of t.open || []) if (i.id === id) i.createdAt = at; return t; } }); ${VIEW}._needsCards.schedule(); return !!m.todos.open.find((i) => i.id === id && i.createdAt === at); })()`);
    const t0 = await choose(ids[1], 82); // q82 on screen: a window loaded mid-history
    // the TAIL page slowed (2.5 s — the read's pages go through the same fetch and stay quick); every landing's road and result written down (the precondition: press 1 TOOK the tail road)
    const SLOW = (on) => A.evalJs(`(() => { const v = ${VIEW}, nc = v._needsCards; if (${on}) { v.__slowPage = v._fetchMessagePage; v._fetchMessagePage = (o, l) => { if (o + l < v._total) return v.__slowPage.call(v, o, l); window.__roads15.push('tailPage(' + o + ')'); return new Promise((r) => setTimeout(r, 2500)).then(() => v.__slowPage.call(v, o, l)); }; window.__roads15 = []; nc.__land = nc.land; nc.land = (x, o) => { const id = typeof x === 'string' ? x : x && x.id; window.__roads15.push('land:' + id); return nc.__land.call(nc, x, o).then((r) => { window.__roads15.push('landed:' + id + '=' + r); return r; }); }; } else { if (v.__slowPage) { v._fetchMessagePage = v.__slowPage; delete v.__slowPage; } if (nc.__land) { nc.land = nc.__land; delete nc.__land; } } return 1; })()`);
    const roads15 = () => A.evalJs('(window.__roads15 || []).slice()');
    await SLOW(true);
    await pick(q84.id); await sleep(700);     // press 1: its read up to −1 is done, its tail page out (2.5 s)
    await pick(ids[1]); await sleep(4200);    // press 2, the person's latest choice: q82, on screen — then the tail page returns
    const t1 = await A.evalJs(ST(ids[1])), ro1 = await roads15();
    await A.shot('desktop-1280-r3-tail-race.png');
    check(`#1 precondition: press 1 (q84, no record) TOOK the tail road — its tail page was out when press 2 landed q82 (${ro1.join(' → ')})`, shifted15 && ro1[0] === 'land:' + q84.id && ro1.some((r) => /^tailPage\(/.test(r)) && ro1.indexOf('land:' + ids[1]) > ro1.findIndex((r) => /^tailPage\(/.test(r)), ro1);
    check(`#1 (RED on ed660f19: the slow tail page came back and rebuilt the window at the live end — q82 gone, pinned) the LATEST press stands: q82 in view in the window it was landed in (records ${t1.ws}–${t1.we} of ${t1.total}); the older landing's tail read finished and replaced nothing`, shifted15 && t0.card && t1.card && t1.inView && /question 82/.test(t1.cmd) && t1.ws === t0.ws && t1.we < t1.total, { t0, t1, roads: ro1 });
    // …the reader's own wheel while a landing's tail page is out (from a window mid-history again: q82 landed first)
    const t0b = await choose(ids[1], 82);
    await pick(q84.id); await sleep(700);
    await wheel(2, 240);                      // (wheel() waits 2.5 s after its notches: the tail page is back)
    await sleep(1500);
    const t2 = await A.evalJs(DOMQ), ro2 = (await roads15()).slice(ro1.length);
    await A.shot('desktop-1280-r3-tail-wheel.png');
    check(`#1 (RED on ed660f19: yanked to the live end, pinned) the reader's wheel while the tail page is out ⇒ the page's result is dropped: the window stays mid-history (records ${t2.ws}–${t2.we} of ${t2.total}), not pinned (${ro2.join(' → ')})`, t0b.card && t0b.we < t0b.total && ro2.some((r) => /^tailPage\(/.test(r)) && t2.we < t2.total && !t2.pinned, { t0b, t2, roads: ro2 });
    await SLOW(false);
    // ── ⑯ THE TAIL, ROUND 4 (lane needs-card-tail r4 — the r3 delta verdict on b3fef024; its accdisp probe's (d) (e) (f3) and
    // the index road's failed show): the law both ways (the ↓ pressed BEFORE a landing), a failed tail page moves nothing, a
    // stale landing's held live turn counted once, a show that fails after a jump puts back what the jump changed. The tail
    // page (flagged at its jumpToBottom call — the read's pages stay quick) made slow or failing on demand; every landing's
    // road and result written down
    {
      console.log('⑯ THE TAIL r4 — the law both ways (↓ before a landing); a failed tail page moves nothing; a stale landing counts its held turn once; a failed show after a jump puts back what it changed');
      const TAIL16 = (o) => A.evalJs(`(() => { const v = ${VIEW}, nc = v._needsCards, o = ${J(o)};
        if (o && !v.__page16) { v.__page16 = v._fetchMessagePage; window.__r16 = [];
          nc.__land16 = nc.land; nc.land = (x, op) => { const id = typeof x === 'string' ? x : x && x.id; window.__r16.push('land:' + id); return nc.__land16.call(nc, x, op).then((r) => { window.__r16.push('landed:' + id + '=' + r); return r; }); };
          v.__trace16 = v._trace; v._trace = function (k, d) { if (/^(jumpToBottom:stale|tailStale|jumpToIndex:stale|tailHold|tailRefetch)$/.test(k)) window.__r16.push('trace:' + k); return v.__trace16.call(v, k, d); };
          v.__jtb16 = v.jumpToBottom; v.jumpToBottom = function (a) { window.__inJtb16 = true; try { return v.__jtb16.call(v, a); } finally { window.__inJtb16 = false; } };
          v._fetchMessagePage = function (off, l, opt) { const w = window.__tail16 || {}, tail = !!window.__inJtb16; window.__inJtb16 = false;
            if (!tail || !(w.n > 0)) return v.__page16.call(v, off, l, opt);
            w.n--; window.__r16.push('tailPage(' + off + ')');
            return new Promise((res, rej) => setTimeout(() => { if (w.fail) { window.__r16.push('tailPageFAILED'); rej(new Error('the tail page failed (⑯)')); } else { window.__r16.push('tailPageBack'); res(v.__page16.call(v, off, l, opt)); } }, w.ms || 600)); }; }
        if (o) window.__tail16 = o;
        if (!o && v.__page16) { v._fetchMessagePage = v.__page16; delete v.__page16; nc.land = nc.__land16; delete nc.__land16; v._trace = v.__trace16; delete v.__trace16; v.jumpToBottom = v.__jtb16; delete v.__jtb16; window.__tail16 = null; }
        return 1; })()`);
      const r16 = () => A.evalJs('(window.__r16 || []).slice()');
      const wait16 = (re, ms = 15000) => A.waitFor(`(window.__r16 || []).some((r) => ${re.toString()}.test(r))`, ms).catch(() => { });
      const ST16 = (id) => `(() => { const x = ${ST(id)}, v = ${VIEW}, l = v._messageList; return { ...x, pinned: v._pinned, st: Math.round(l.scrollTop), gap: Math.round(l.scrollHeight - l.clientHeight - l.scrollTop), pick: v._needsCards._dockPick, badge: v._newMsgCount }; })()`;
      const STATUS16 = `(() => { const e = document.querySelector('.chat-history-status'); return e ? { text: e.textContent.trim(), shown: e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && Number(getComputedStyle(e).opacity) > 0 } : null; })()`;
      const pressDown16 = async () => { const b = await A.evalJs(`(() => { const b = ${VIEW}._scrollBtn; if (!b || b.classList.contains('hidden')) return null; const r = b.getBoundingClientRect(); return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`); if (b) { await A.clickAt(b.x, b.y); return 'clicked'; } await A.evalJs(`${VIEW}._scrollBtn.click()`); return 'click()'; };
      await TAIL16({ n: 0 });
      // (a) THE ↓ PRESSED BEFORE A LANDING (the probe's f3 — older than r3, on both trees: the ↓'s tail replaced the newer landing)
      const a0 = await choose(ids[1], 82);
      await TAIL16({ n: 1, ms: 3000 });
      const howDown = await pressDown16(); await sleep(400);
      await pick(ids[1]);
      await wait16(new RegExp('^landed:' + ids[1] + '='), 8000); const a1 = await A.evalJs(ST16(ids[1]));
      await wait16(/^tailPageBack$/, 8000); await sleep(2000);
      const a2 = await A.evalJs(ST16(ids[1])), ra = await r16();
      await A.shot('desktop-1280-r4-down-then-landing.png');
      check(`(a) (RED on b3fef024: the older ↓'s tail page came back and rebuilt the window at the live end — q82 gone, pinned) the ↓ (${howDown}) pressed BEFORE a landing: the newer landing stands — q82 in view in the window it was landed in (records ${a2.ws}–${a2.we} of ${a2.total}), not pinned; the ↓'s page dropped (${ra.join(' → ')})`, a0.card && a1.card && a2.card && a2.inView && /question 82/.test(a2.cmd) && a2.ws === a1.ws && a2.we < a2.total && !a2.pinned && ra.includes('trace:jumpToBottom:stale'), { a0, a1, a2, ra });
      // (b) A FAILED TAIL PAGE MOVES NOTHING (the probe's (e) — older than r3): q84 (no record ⇒ the tail road), its tail page fails
      await TAIL16({ n: 0 }); await choose(ids[1], 82); const b0 = await A.evalJs(ST16(ids[1]));
      await A.evalJs('(window.__r16 = [], 1)');
      await TAIL16({ n: 1, fail: true, ms: 600 });
      await pick(q84.id);
      await wait16(new RegExp('^landed:' + q84.id + '='), 12000); await sleep(1200);
      const b1 = await A.evalJs(ST16(ids[1])), rb = await r16(), sb = await A.evalJs(STATUS16);
      await A.shot('desktop-1280-r4-tail-failed.png');
      check(`(b) (RED on b3fef024: «end» — the mid-history window force-scrolled to its bottom, scrollTop 362 → 757, and q84 kept the dock pick) the tail page failed (${rb.join(' → ')}): said ONCE («${sb && sb.text}»), and nothing moved — scrollTop ${b0.st} → ${b1.st}, q82 in view ${b0.inView} → ${b1.inView}, the pin ${b0.pinned} → ${b1.pinned}, the pick ${b0.pick} → ${b1.pick}`, rb.includes('tailPageFAILED') && rb.includes('landed:' + q84.id + '=null') && !!sb && sb.shown && /Couldn.t load the latest messages/.test(sb.text) && Math.abs(b1.st - b0.st) <= 2 && b1.inView && b1.ws === b0.ws && b1.pinned === b0.pinned && b1.pick === b0.pick, { b0, b1, rb, sb });
      // (c) A STALE LANDING COUNTS ITS HELD TURN ONCE (the probe's (d) — new in r3: +14 for the server's +7): q84's tail page out
      //     6 s, q82 pressed (q84 is stale), a live turn (do:fill3) arrives while the page is out — held, replayed on the stale return
      await TAIL16({ n: 0 }); await choose(ids[1], 82);
      const T0 = (await page(0, 1)).total || 0, c0 = await A.evalJs(ST16(ids[1]));
      await A.evalJs('(window.__r16 = [], 1)');
      await TAIL16({ n: 1, ms: 6000 });
      await pick(q84.id);
      await wait16(/^tailPage\(/, 8000);
      await pick(ids[1]); await sleep(400);
      sayTo(sid, 'a live turn do:fill3');
      let T1 = T0; for (let i = 0; i < 40; i++) { T1 = (await page(0, 1)).total || 0; if (T1 >= T0 + 7) break; await sleep(200); }
      const held = await A.evalJs(`(() => { const v = ${VIEW}; return v._tailHold ? v._tailHold.ops.length : -1; })()`);
      await wait16(new RegExp('^landed:' + q84.id + '='), 15000); await sleep(2500);
      T1 = (await page(0, 1)).total || 0;
      const c1 = await A.evalJs(ST16(ids[1])), rc = await r16();
      await A.shot('desktop-1280-r4-stale-total.png');
      check(`(c) (RED on b3fef024: the stale tail page's total applied, then each replayed create counted again) the live turn arrived while q84's stale tail page was out (${held} ops held) — the window that stays counts it ONCE: its total ${c0.total} → ${c1.total} (+${c1.total - c0.total}) vs the server's ${T0} → ${T1} (+${T1 - T0}); q82 in view (records ${c1.ws}–${c1.we}) (${rc.join(' → ')})`, held > 0 && T1 >= T0 + 7 && rc.includes('trace:jumpToBottom:stale') && rc.includes('landed:' + q84.id + '=null') && c1.total - c0.total === T1 - T0 && c1.card && c1.inView && c1.ws === c0.ws, { c0, c1, T0, T1, held, rc });
      // (d) A SHOW THAT FAILS AFTER A JUMP PUTS BACK WHAT THE JUMP CHANGED: q81's record hidden by a CSS rule (B-2adb's shape —
      //     an element, no box); its landing reads up, jumpToIndex rebuilds the window there, the show fails
      await TAIL16(null);
      const rid81 = (all[where[0]] || {}).id || '';
      const toasts16 = () => A.evalJs(`[...document.querySelectorAll('.global-toast')].map((x) => x.textContent).join(' | ')`);
      // (d1) a PINNED reader at the live tail
      await toConv(A, sid, [], 1280, 800, false); await A.waitFor(`(() => { const v = ${VIEW}; return v._pinned && v._windowEnd >= v._total; })()`, 15000).catch(() => { }); await sleep(1500);
      await A.evalJs(`(() => { const s = document.createElement('style'); s.id = 'hide16'; s.textContent = '.chat-msg[data-msg-id="' + CSS.escape(${J(rid81)}) + '"] { display: none !important; }'; document.head.append(s); return 1; })()`); // (after the reload: toConv loads the page)
      await TAIL16({ n: 0 });
      const d0 = await A.evalJs(ST16(ids[1]));
      await pick(ids[0]);
      await wait16(new RegExp('^landed:' + ids[0] + '='), 15000);
      await A.waitFor(`(() => { const v = ${VIEW}; return v._pinned && v._windowEnd >= v._total; })()`, 10000).catch(() => { }); await sleep(1500);
      const d1 = await A.evalJs(ST16(ids[1])), t1 = await toasts16(), rd1 = await r16();
      await A.shot('desktop-1280-r4-failed-show-pinned.png');
      check(`(d1) (RED on b3fef024: left at records 0–50, unpinned, only a toast) a PINNED reader presses q81, whose record a CSS rule hides: the jump rebuilt the window there, the show failed — put back: pinned at the live tail again (records ${d1.ws}–${d1.we} of ${d1.total}, gap ${d1.gap}); the toast «${t1}» (${rd1.join(' → ')})`, !!rid81 && d0.pinned && rd1.includes('landed:' + ids[0] + '=null') && d1.pinned && d1.we >= d1.total && d1.gap <= 2 && /not drawn in this chat/.test(t1), { rid81, d0, d1, t1, rd1 });
      // (d2) a reader mid-history (q82 landed): put back at the record they were reading
      await choose(ids[1], 82); await sleep(3000);
      const READ16 = `(() => { const v = ${VIEW}, l = v._messageList, lr = l.getBoundingClientRect(); const m = [...l.querySelectorAll(':scope > .chat-msg')].find((x) => { const r = x.getBoundingClientRect(); return r.height > 0 && r.bottom > lr.top; }); return { id: m ? m.dataset.msgId : null, top: m ? Math.round(m.getBoundingClientRect().top) : null, ws: v._windowStart, we: v._windowEnd, pinned: v._pinned }; })()`;
      const e0 = await A.evalJs(READ16);
      await A.evalJs('(window.__r16 = [], 1)');
      await pick(ids[0]);
      await wait16(new RegExp('^landed:' + ids[0] + '='), 15000); await sleep(2500);
      const e1 = await A.evalJs(READ16), at1 = await A.evalJs(`(() => { const v = ${VIEW}, l = v._messageList, m = [...l.querySelectorAll(':scope > .chat-msg')].find((x) => x.dataset.msgId === ${J(e0.id)}); return m ? Math.round(m.getBoundingClientRect().top) : null; })()`), t2 = await toasts16(), rd2 = await r16();
      await A.shot('desktop-1280-r4-failed-show-reader.png');
      check(`(d2) (RED on b3fef024: left at records 0–50) a reader mid-history (records ${e0.ws}–${e0.we}, reading ${e0.id} at ${e0.top}) presses q81 (hidden): put back at the record they were reading — ${e0.id} at ${at1} (records ${e1.ws}–${e1.we}), not pinned (${rd2.join(' → ')})`, !!e0.id && rd2.includes('landed:' + ids[0] + '=null') && at1 != null && Math.abs(at1 - e0.top) <= 4 && e1.ws > 0 && !e1.pinned && /not drawn in this chat/.test(t2), { e0, e1, at1, t2, rd2 });
      await A.evalJs(`(() => { document.getElementById('hide16')?.remove(); return 1; })()`);
      await TAIL16(null);
    }
    await A.evalJs(`(() => { const m = app._inboxModel; if (window.__todos15) { Object.defineProperty(m, 'todos', window.__todos15); delete window.__todos15; } ${VIEW}._needsCards.schedule(); return 1; })()`);
  } catch (e) { fail++; console.log('  ✗ ⑭/⑮/⑯ threw: ' + (e?.message || e)); }
  lap('⑭ ⑮ ⑯ done');

  // ── ⑰ THE ATTENTION DOCK (lane needs-card-tail r10 — the owner 2026-10-30 on the ONE card r1–r9 docked at the end: «你没解决
  // 这个问题啊，只是加了一句话？如果历史对话里的内容就别停靠了呗，或者就不要停靠在聊天内容本身里了，而是体现出"这是专门停靠等我操作的
  // 事情，不会随着 chatview 浮动"的一个 UI»). THE RULE: a thing waiting for the owner is WINDOW CHROME, never a chat row. One
  // conversation of its own; the brief's stress shapes one after another, each read off the RENDERED page, each a shot ──
  console.log('⑰ THE ATTENTION DOCK — a fixed strip between the transcript and the message box: 1 / 3 / 30 items, a 400-char question, six options, an answer on the phone, 320 px, a 6-line composer, a filing 5000 px up');
  try {
    const done = (id) => A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    for (const it of (await api()).open) await done(it.id);
    const sid = await newConv('dock'); await sleep(600);
    // the phone page: its own (the suite's B is closed after ⑤ — one page left; a background page stalls CDP input)
    await A.cdp('Target.createTarget', { url: 'about:blank' }).catch(() => null);
    let tP2 = null; for (let i = 0; i < 40 && !tP2; i++) { tP2 = (await targets()).find((x) => x.id !== target.id); if (!tP2) await sleep(150); }
    const B = await connect(tP2);
    await A.front(); // (a page in the background gets no frames: the composer's rAF autosize, the cards' pass frame)
    /** the strip as rendered: where it stands (the list above it, the message box below), what it says, its targets */
    const DOCK = `(() => { const v = ${VIEW}; const d = v && v._attnDock; if (!d) return null;
      const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }; };
      const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const row = d.querySelector('.cad-rows > .ut-item'), q = row && row.querySelector(':scope > .ut-body > .ut-text'), all = d.querySelector('.cad-all'), comp = d.parentElement && d.parentElement.querySelector(':scope > .chat-input-area'), cs = q ? getComputedStyle(q) : null;
      const targets = [...d.querySelectorAll('button, [role="button"]')].filter(vis).map((b) => ({ k: (b.getAttribute('data-label') || b.textContent || '').trim().slice(0, 24), chip: b.classList.contains('ut-opt'), ...box(b) }));
      const opts = d.querySelector('.cad-rows .ut-opts');
      return { shown: !d.hidden && d.getClientRects().length > 0, inList: v._messageList.contains(d), count: ((d.querySelector('.cad-count') || {}).textContent || '').trim(), all: all && !all.hidden ? all.textContent : null,
        rows: d.querySelectorAll('.cad-rows > .ut-item').length, id: row ? row.dataset.id : null, q: q ? q.textContent.slice(0, 60) : null, qPx: cs ? parseFloat(cs.fontSize) : 0, qCut: !!q && q.scrollWidth > q.clientWidth + 1, qH: q ? Math.round(q.getBoundingClientRect().height) : 0,
        dock: box(d), list: box(v._messageList), comp: box(comp), over: d.scrollWidth - d.clientWidth, targets, optsScroll: !!opts && getComputedStyle(opts).overflowX === 'auto' && opts.scrollWidth > opts.clientWidth, chips: [...d.querySelectorAll('.ut-opt')].filter(vis).map((c) => box(c)), pinned: !!v._pinned, tag: d.__tag17 || 0 }; })()`;
    const between = (x) => !!x && x.shown && !x.inList && !!x.list && !!x.comp && x.dock.top >= x.list.bottom - 1 && x.dock.bottom <= x.comp.top + 1;
    const dockIs = (P, id, n, ms = 10000) => P.waitFor(`(() => { const x = ${DOCK}; return !!x && x.shown && x.id === ${J(id)} && new RegExp(${J(n)}).test(x.count); })()`, ms);
    const VERBS4 = (x) => ['Reply', 'Open', 'Mark done', 'Dismiss'].every((k) => x.targets.some((y) => y.k === k));
    // (1) ONE item ⇒ one row, no door
    sayTo(sid, 'one ask do:q201');
    const [a1] = await byText(/^Stress question 201:/, 1);
    await toConv(A, sid, a1 ? [a1.id] : [], 1280, 800, false);
    await dockIs(A, a1 && a1.id, 'a question'); await sleep(400);
    const d1 = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-one.png');
    check(`r10 (RED on bd5c5fd98: no strip — the count was a status-bar chip) ONE item ⇒ the strip stands BETWEEN the transcript and the message box (dock ${d1 && d1.dock.top}–${d1 && d1.dock.bottom}, list ends ${d1 && d1.list.bottom}, box starts ${d1 && d1.comp && d1.comp.top}; never inside the list): «${d1 && d1.count}» · «${d1 && d1.q}» on ONE line (${d1 && d1.qH} px), its verbs (${d1 && d1.targets.map((x) => x.k).join(' / ')}), no «View all»`,
      between(d1) && d1.rows === 1 && d1.id === a1.id && d1.all === null && /waiting for you · a question/.test(d1.count) && d1.qH <= 30 && VERBS4(d1), d1);
    const s1 = await A.evalJs(`document.querySelectorAll('.chat-status-foryou').length`);
    check('r10 …and the status bar carries no «waiting for you» chip any more (ONE place says it: the strip)', s1 === 0, s1);
    // (2) THREE ⇒ the count, the newest, the door
    sayTo(sid, 'two more do:q202 do:q203');
    const [, a2, a3] = await byText(/^Stress question 20[123]:/, 3);
    await dockIs(A, a3 && a3.id, '3 questions'); await sleep(400);
    await A.evalJs(`(() => { const d = ${VIEW}._attnDock; d.__tag17 = 3; return 1; })()`);
    const d3 = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-three.png');
    check(`r10 THREE ⇒ the count «${d3 && d3.count}», the NEWEST (${d3 && d3.q}), «${d3 && d3.all}» — one row, never a «show more» in the strip; the same height as one (${d1 && d1.dock.h} → ${d3 && d3.dock.h} px)`,
      between(d3) && d3.rows === 1 && d3.id === a3.id && /^View all · 3$/.test(d3.all || '') && Math.abs(d3.dock.h - d1.dock.h) <= 2, d3);
    // «View all» ⇒ the For-you window scoped to THIS conversation
    await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return 1; })()`);
    await A.press('.chat-attn-dock .cad-all', { touch: false });
    const iw = await A.waitFor(`[...app.wm.windows.values()].some((w) => w.type === 'inbox' && (w._openSpec || {}).sessionKey === ${J(a1 && a1.sessionKey)})`, 6000);
    await A.shot('desktop-1280-dock-view-all.png');
    check('r10 «View all» opens the For-you window scoped to THIS conversation (the cross-conversation list stays the tray\'s)', iw === true, iw);
    await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return 1; })()`);
    await openOnly(A, sid); await sleep(600);
    // a tap on the question lands the ORIGINAL card (THE ONE LANDING: a navigation the owner asked for)
    await A.evalJs(`(() => { window.__d17 = []; new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('chat-ask-flash') && m.target.dataset?.item) window.__d17.push(m.target.dataset.item); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); return 1; })()`);
    await A.press('.chat-attn-dock .cad-rows .ut-item .ut-text', { touch: false }); await sleep(900);
    const fl = await A.evalJs('window.__d17 || []'), c3 = await A.evalJs(CARD(a3 && a3.id));
    check(`r10 a tap on the strip's question lands the ORIGINAL card in the flow — its card open in its tool card, in view, flashed (${J(fl)})`, fl.includes(a3.id) && !!c3 && c3.open && c3.rect.top >= c3.list.top - 1 && c3.rect.bottom <= c3.list.bottom + 1, { fl, c3 });
    // ONE PRESS ANSWERS, the strip updates IN PLACE (the same element, the next newest)
    await A.press('.chat-attn-dock .cad-rows .ut-item .ut-done', { touch: false });
    await dockIs(A, a2 && a2.id, '2 questions'); await sleep(300);
    const d2 = await A.evalJs(DOCK), gone3 = !(await api()).open.some((i) => i.id === a3.id);
    check(`r10 ONE PRESS on the strip's ✓ answers it (resolved on the hub: ${gone3}) and the strip updates IN PLACE — the same element (tag ${d2 && d2.tag}), the next newest «${d2 && d2.q}», «${d2 && d2.count}»`, gone3 && !!d2 && d2.tag === 3 && d2.id === a2.id, d2);
    // (3) ANSWERED ON THE PHONE while the desktop shows it — B at 390×844 touch, the same conversation
    await B.front(); await toConv(B, sid, [], 390, 844, true);
    await dockIs(B, a2 && a2.id, '2 questions'); await sleep(500);
    const p2 = await B.evalJs(DOCK);
    await B.shot('phone-390-dock-two.png');
    const small = p2 ? p2.targets.filter((x) => x.h < 44 || x.w < 44) : [];
    check(`r10 THE PHONE (390×844 touch): the same strip above the message box — its question ${p2 && p2.qPx} px (≥ 16), every target ≥ 44 × 44 with its word (${p2 && p2.targets.map((x) => x.k + ' ' + x.w + '×' + x.h).join(', ')})`,
      between(p2) && p2.qPx >= 16 && small.length === 0 && VERBS4(p2), { p2, small });
    await A.evalJs(`(() => { window.__d17s = []; const f = () => { const d = ${VIEW}._attnDock, r = d.querySelector('.cad-rows > .ut-item'); window.__d17s.push((r ? r.dataset.id : '-') + '/' + ((d.querySelector('.cad-count') || {}).textContent || '')); if (window.__d17s.length < 400) setTimeout(f, 10); }; f(); return 1; })()`);
    await B.press('.chat-attn-dock .cad-rows .ut-item .ut-done', { touch: true });
    await A.front(); const moved = await dockIs(A, a1 && a1.id, 'a question');
    const seen = [...new Set(await A.evalJs('window.__d17s || []'))];
    check(`r10 the item answered ON THE PHONE leaves the desktop's strip live — the next one, the count in the same pass (${seen.join(' → ')})`, moved === true && seen.length === 2 && seen[0].startsWith(a2.id + '/') && seen[1].startsWith(a1.id + '/'), seen);
    // (4) MANY ⇒ still ONE row, the same height. THE STORE'S FLOOD GUARD caps a conversation's OWN open items at 20
    //     (src/user-todos.js MAX_OPEN_PER_SESSION — an agent looping on add); 29 more asked ⇒ 19 taken, 10 refused by the
    //     store (said to the agent, by name). Thirty in one strip needs items filed ABOUT it under another key — PURE ④'s
    //     dockOf leg holds 30; here the most one conversation can ask of its own
    sayTo(sid, 'twenty-nine more do:par ' + Array.from({ length: 29 }, (_, k) => 'do:q' + (204 + k)).join(' '));
    const t20 = await byText(/^Stress question 2(0[1-9]|[123]\d):/, 20, 120000);
    await logHas(/already has 20 open items/, 60000);
    const newest20 = t20.reduce((x, i) => (!x || i.createdAt >= x.createdAt ? i : x), null);
    await dockIs(A, newest20 && newest20.id, '20 questions', 20000); await sleep(600);
    const d30 = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-twenty.png');
    const refused = (cliLog().match(/already has 20 open items/g) || []).length;
    check(`r10 MANY (29 more asked: the store took ${t20.length - 1}, refused ${refused} — its flood guard, 20 open per conversation) ⇒ «${d30 && d30.count}» + the newest + «${d30 && d30.all}» — still ONE row, the same height (${d30 && d30.dock.h} px)`, t20.length === 20 && refused === 10 && between(d30) && d30.rows === 1 && d30.id === newest20.id && /^View all · 20$/.test(d30.all || '') && Math.abs(d30.dock.h - d1.dock.h) <= 2, { n: t20.length, refused, d30 });
    await B.front(); await toConv(B, sid, [], 390, 844, true); await dockIs(B, newest20 && newest20.id, '20 questions'); await sleep(400);
    await B.shot('phone-390-dock-twenty.png'); await A.front();
    for (const it of t20.slice(0, 5)) await done(it.id); // (room for the shapes below: 15 open)
    await dockIs(A, newest20 && newest20.id, '15 questions');
    // (5) A 400-CHARACTER QUESTION ⇒ one line, cut — the strip never grows with the words
    sayTo(sid, 'a long one do:big');
    const [big] = await byText(/^Before we cut the release/, 1, 60000);
    await dockIs(A, big && big.id, '16 questions'); await sleep(400);
    const dB = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-400-chars.png');
    check(`r10 a ${big ? big.text.length : 0}-character question ⇒ ONE line in the strip, cut (${dB && dB.qCut}), the strip's height unchanged (${dB && dB.dock.h} px)`, !!big && big.text.length >= 400 && between(dB) && dB.qCut && dB.qH <= 30 && Math.abs(dB.dock.h - d1.dock.h) <= 2, dB);
    // (6) SIX OPTIONS ⇒ the chips on ONE line beside the question's row (sideways if they must), never a wall
    sayTo(sid, 'six choices do:six');
    const [six] = await byText(/^Which region do we open next/, 1, 60000);
    await dockIs(A, six && six.id, '17 questions'); await sleep(400);
    const d6 = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-six-options.png');
    const oneLine = (x) => !!x && x.chips.length === 6 && x.chips.every((c) => Math.abs(c.top - x.chips[0].top) <= 1);
    check(`r10 SIX OPTIONS ⇒ six chips on ONE line (tops ${d6 && d6.chips.map((c) => c.top).join(',')}), the strip two lines at most (${d6 && d6.dock.h} px)`, between(d6) && oneLine(d6) && d6.dock.h <= 2 * d1.dock.h + 8, d6);
    await B.front(); await toConv(B, sid, [], 390, 844, true); await dockIs(B, six && six.id, '17 questions'); await sleep(400);
    const p6 = await B.evalJs(DOCK);
    await B.shot('phone-390-dock-six-options.png'); await A.front(); await sleep(300);
    check(`r10 …on the phone the six chips stay ONE line (sideways, ${p6 && p6.chips.length} chips, ${p6 && p6.chips.filter((c) => c.h >= 44).length} at ≥ 44 px), no giant chips; the strip ${p6 && p6.dock.h} px`, between(p6) && oneLine(p6) && p6.chips.every((c) => c.h >= 44 && c.h <= 52) && p6.dock.h <= 260, p6);
    // (7) A WINDOW 320 px WIDE ⇒ the row under the head, nothing past the strip's edge
    await A.evalJs(`(() => { const w = ${CHAT(sid)}; if (!w) return false; if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.resizeWindowTo(w.id, { w: 320, h: 700 }); return true; })()`); await sleep(900);
    const dN = await A.evalJs(DOCK);
    await A.shot('desktop-320-dock.png');
    const outside = dN ? dN.targets.filter((x) => !x.chip && (x.left < dN.dock.left - 1 || x.right > dN.dock.right + 1)) : [];
    check(`r10 a window 320 px wide: the strip fits (overflow ${dN && dN.over} px, ${outside.length} verbs past its edge — the six chips ride ONE line that scrolls sideways: ${dN && dN.optsScroll}), still between the transcript and the message box`, between(dN) && dN.over <= 1 && outside.length === 0 && dN.optsScroll && dN.dock.w <= 322, { dN, outside });
    await A.evalJs(`(() => { const w = ${CHAT(sid)}; if (w && !w.isMaximized) app.wm.toggleMaximize(w.id); return 1; })()`); await sleep(700);
    // (8) THE COMPOSER GROWN TO 6 LINES ⇒ the strip rides above it, whole
    await A.evalJs(`(() => { const ta = document.querySelector(${J('.chat-input-area textarea')}); ta.focus(); ta.value = 'one\\ntwo\\nthree\\nfour\\nfive\\nsix'; ta.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`); await sleep(700);
    const dC = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-composer-6-lines.png');
    check(`r10 the message box grown to 6 lines (${dC && dC.comp && dC.comp.h} px): the strip stands above it, whole (${dC && dC.dock.h} px)`, between(dC) && dC.comp.h > 120 && Math.abs(dC.dock.h - d6.dock.h) <= 2, dC);
    await A.evalJs(`(() => { const ta = document.querySelector(${J('.chat-input-area textarea')}); ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.blur(); return 1; })()`); await sleep(500);
    // (9) A FILING WHILE THE OWNER IS 5000 px UP ⇒ the strip shows it, the flow is untouched, no scroll jump; the strip never
    //     moves when the transcript scrolls
    sayTo(sid, 'a long history do:fill150t');
    await A.waitFor(`(() => { const v = ${VIEW}; return !!v && v._total >= 340 && v._pinned; })()`, 30000); await sleep(1500);
    const lc = await A.evalJs(`(() => { const r = ${VIEW}._messageList.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), st: Math.round(${VIEW}._messageList.scrollTop) }; })()`);
    const dS0 = await A.evalJs(DOCK);
    for (let i = 0; i < 90; i++) { await A.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: lc.x, y: lc.y, deltaX: 0, deltaY: -400 }); await sleep(90); if (i > 10 && (await A.evalJs(`(() => { const l = ${VIEW}._messageList; return l.scrollHeight - l.scrollTop - l.clientHeight; })()`)) >= 5200) break; }
    await sleep(2500);
    const READ17 = (id) => `(() => { const v = ${VIEW}, l = v._messageList, lr = l.getBoundingClientRect(); const els = [...l.querySelectorAll(':scope > .chat-msg')].filter((x) => x.getClientRects().length); const m = ${J(id)} ? els.find((x) => x.dataset.msgId === ${J(id)}) : els.find((x) => x.getBoundingClientRect().bottom > lr.top + 40); if (!m) return null; const seen = [...l.querySelectorAll('.cn-card')].filter((c) => { const r = c.getBoundingClientRect(); return r.height > 0 && r.bottom > lr.top && r.top < lr.bottom; }).length; return { id: m.dataset.msgId, top: Math.round(m.getBoundingClientRect().top), st: Math.round(l.scrollTop), fromBottom: Math.round(l.scrollHeight - l.scrollTop - l.clientHeight), pinned: !!v._pinned, cards: seen }; })()`;
    const r0 = await A.evalJs(READ17(null)), dS1 = await A.evalJs(DOCK);
    check(`r10 THE STRIP NEVER MOVES WHEN THE TRANSCRIPT SCROLLS — the reader ${r0 && r0.fromBottom} px above the live end, the strip at ${dS0 && dS0.dock.top}–${dS0 && dS0.dock.bottom} → ${dS1 && dS1.dock.top}–${dS1 && dS1.dock.bottom}`, !!r0 && r0.fromBottom >= 5000 && !r0.pinned && !!dS1 && dS1.dock.top === dS0.dock.top && dS1.dock.bottom === dS0.dock.bottom, { lc, r0, dS0: dS0 && dS0.dock, dS1: dS1 && dS1.dock });
    sayTo(sid, 'one more do:q240');
    const [a240] = await byText(/^Stress question 240:/, 1);
    await dockIs(A, a240 && a240.id, '18 questions'); await sleep(1500);
    const r1 = await A.evalJs(READ17(r0 && r0.id)), dS2 = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-5000-up.png');
    check(`r10 a needs card asked while the owner is ${r0 && r0.fromBottom} px up: the strip shows it («${dS2 && dS2.count}», ${dS2 && dS2.q}); the flow untouched — the record at the reader's line stays (${r0 && r0.id} at ${r0 && r0.top} → ${r1 && r1.top} px), unpinned, the cards on screen unchanged (${r0 && r0.cards} → ${r1 && r1.cards})`,
      !!a240 && !!r1 && !!r0 && r1.id === r0.id && Math.abs(r1.top - r0.top) <= 2 && !r1.pinned && r1.cards === r0.cards && dS2.id === a240.id && dS2.dock.bottom === dS0.dock.bottom, { r0, r1 });
    for (const it of (await api()).open) await done(it.id);
    const dE = await A.waitFor(`(() => { const x = ${DOCK}; return !!x && !x.shown; })()`, 8000);
    check('r10 nothing waiting ⇒ the strip is ABSENT (no empty chrome)', dE === true, dE);
    await B.close(); await A.cdp('Target.closeTarget', { targetId: tP2.id }).catch(() => null); // (one page left again)
  } catch (e) { fail++; console.log('  ✗ ⑰ threw: ' + (e?.message || e)); }
  lap('⑰ done');

  // ── ⑱ THE ANNOUNCE (lane needs-card-tail r10 addendum — the owner 2026-10-30 11:5x PDT: «有权限申请的时候窗口应该触发闪烁和 inbox
  // 附近的弹窗，有时候我都没发现有个后台任务才申请权限»): a NEW item that waits for the owner announces itself — the asking window
  // FLASHES (THE waiting blink: title bar + taskbar button), a CARD stands in one stack at the For-you button (who · what · its
  // clock; one press opens it), the window's strip count wears the attention fill until it is seen. Two conversations of their
  // own; the stress shapes: ten in a minute, one expiring while its card is up, two windows asking at once, the phone ──
  console.log('⑱ THE ANNOUNCE — an arrival that waits for the owner flashes its window and stands as a card at the For-you button');
  try {
    const done = (id) => A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    for (const it of (await api()).open) await done(it.id);
    const s1 = await newConv('ann1'), s2 = await newConv('ann2'); await sleep(600);
    sayTo(s1, 'hello'); sayTo(s2, 'hello'); await sleep(1500);
    await A.front(); await A.device(1280, 800, { mouse: true }); await A.load();
    const open2 = `(() => { app.phoneHome?.hide?.(); for (const w of [...app.wm.windows.values()]) if (w.type === 'chat' && ![${J(s1)}, ${J(s2)}].includes(app.sessions.get(w.id)?.sessionId)) app.wm.closeWindow(w.id);
      if (!${CHAT(s1)}) app.attachSession(${J(s1)}, 'ops one', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); if (!${CHAT(s2)}) app.attachSession(${J(s2)}, 'ops two', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); return true; })()`;
    await A.evalJs(open2); await A.waitFor(`!!${CHAT(s1)} && !!${CHAT(s2)}`, 8000); await sleep(1200);
    const VOF = (sid) => `(() => { const w = ${CHAT(sid)}; return w ? app.sessions.get(w.id) : null; })()`;
    /** the announce as rendered: the stack (its cards, «more», where it stands against the For-you button), each window's flash */
    const ANN = `(() => { const s = document.querySelector('.ut-announce'), b = document.getElementById('taskbar-user-todos'), br = b && b.getClientRects().length ? b.getBoundingClientRect() : null, sr = s ? s.getBoundingClientRect() : null;
      const cards = s ? [...s.querySelectorAll(':scope > .uta-card')].filter((c) => !c.hidden).map((c) => ({ id: c.dataset.id, who: c.querySelector('.uta-who').textContent, what: c.querySelector('.uta-what').textContent.slice(0, 50), clock: c.querySelector('.uta-clock').hidden ? '' : c.querySelector('.uta-clock').textContent, expired: c.classList.contains('uta-expired'), h: Math.round(c.getBoundingClientRect().height) })) : [];
      const more = s && s.querySelector(':scope > .uta-more'); const win = (sid) => { const w = [...app.wm.windows.values()].find((x) => x.type === 'chat' && app.sessions.get(x.id)?.sessionId === sid); if (!w) return null; const tb = document.querySelector('.taskbar-item[data-win-id="' + w.id + '"]') || [...document.querySelectorAll('.taskbar-item')].find((x) => x.dataset.winId === w.id || x.dataset.id === w.id); const c = w.element.querySelector('.chat-attn-dock:not([hidden]) .cad-count'); return { waiting: w.element.classList.contains('window-waiting'), announce: w.element.classList.contains('window-announce'), active: w.element.classList.contains('window-active'), tbWaiting: !!tb && tb.classList.contains('waiting'), fill: c ? getComputedStyle(c).backgroundColor : null }; };
      return { shown: !!s && s.isConnected, all: s ? s.querySelectorAll(':scope > .uta-card').length : 0, cards, more: more && !more.hidden ? more.textContent : null, popover: !!s && (s.dataset.popover === '1' || [...document.querySelectorAll('[data-popover]')].includes(s)), toasts: [...document.querySelectorAll('#global-toasts .global-toast')].map((t) => t.dataset.todoId || '').filter(Boolean), above: !!(sr && br) && sr.bottom <= br.top + 1, nearX: !!(sr && br) && Math.abs(sr.right - br.right) < 80, w1: win(${J(s1)}), w2: win(${J(s2)}), blink: !!b && b.classList.contains('ut-blink') }; })()`;
    // (a) A RELOAD ANNOUNCES NOTHING OLD — then ONE ask from window 1 while window 2 is in front
    const a0 = await A.evalJs(ANN);
    check('r10+ a reload announces nothing old (the arrival rule\'s knownIds seed it): no stack after the page loads', !a0.shown, a0);
    await A.evalJs(`(() => { const w = ${CHAT(s2)}; app.wm.focusWindow ? app.wm.focusWindow(w.id) : w.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return 1; })()`); await sleep(300);
    // r11 ONE ATTENTION POLICY (the r10 acceptance: bands 3–5 announced): a REAL plain question (band 5) moves a number only;
    // the acceptance's shapes — Dropline's band-5 dictionary reminder, a band-4 vault-rotate suggestion, a band-3 date — through
    // THE arrival path (a snapshot pushed through the page's own socket handlers, as a broadcast lands)
    const PUSH = (extra) => `(async () => { const d = await (await fetch('/api/user-todos')).json(); const todos = d.todos; todos.open = [...todos.open, ...${extra}]; for (const h of app.ws.globalHandlers) { try { h({ type: 'user-todos-updated', todos }); } catch { } } return todos.open.length; })()`;
    const blinkOff = `(() => { for (const b of [document.getElementById('taskbar-user-todos'), document.getElementById('mobile-nav-todos')]) b && b.classList.remove('ut-blink'); return 1; })()`;
    await A.evalJs(blinkOff);
    sayTo(s1, 'a plain one do:q400');
    const [q400] = await byText(/^Stress question 400:/, 1);
    const NOWB = Date.now(), quiet = [
      { id: 'ut-r11band5p', status: 'open', kind: 'action', origin: 'plugin', plugin: 'voice-input', urgency: 'low', text: 'Dropline suggests adding to your dictionary: CLAUDE.md', createdAt: NOWB, sessionKey: 'voice' },
      { id: 'ut-r11band4v', status: 'open', kind: 'action', origin: 'vault', text: 'Rotate the key you shared', action: { type: 'vault-rotate', entry: 'x' }, createdAt: NOWB, sessionKey: 'vault' },
      { id: 'ut-r11band3d', status: 'open', kind: 'action', origin: 'agent', text: 'Renew the certificate', due: NOWB + 3600e3, createdAt: NOWB, sessionKey: 'claude:r11-fixture' }];
    const cnt0 = await A.evalJs(`(document.getElementById('taskbar-user-todos') || {}).textContent || ''`);
    await A.evalJs(PUSH(J(quiet))); await sleep(1500);
    const b0 = await A.evalJs(ANN), cnt1 = await A.evalJs(`(document.getElementById('taskbar-user-todos') || {}).textContent || ''`);
    check(`RED-able (r11 — 7ec6c6dcf announced every one: a card, a flash, a pulse): ONE ATTENTION POLICY — a real plain question (band 5) and the acceptance's shapes (Dropline's band-5 dictionary reminder, a band-4 vault-rotate, a band-3 date) move a NUMBER only («${cnt0.trim()}» → «${cnt1.trim()}»): no card, no flash, no pulse, no toast`,
      !!q400 && !b0.shown && !b0.cards.length && !(b0.w1 && b0.w1.announce) && !b0.blink && !b0.toasts.length, { b0, cnt0, cnt1 });
    await A.evalJs(PUSH('[]')); await sleep(400);
    await A.evalJs(`(() => { localStorage.setItem('vibespace.toastHistory', '[]'); return 1; })()`);
    sayTo(s1, 'one ask do:u401');
    const [q401] = await byText(/^Stress question 401:/, 1);
    await A.waitFor(`(() => { const x = ${ANN}; return x.cards.length === 1 && x.w1 && x.w1.waiting; })()`, 8000); await sleep(500);
    const a1 = await A.evalJs(ANN);
    await A.shot('desktop-1280-announce-one.png');
    const hist = await A.evalJs(`JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]').filter((h) => h.ref && h.ref.id === ${J(q401 && q401.id)}).map((h) => ({ m: h.m, ref: h.ref }))`);
    check(`r10+ r11 (RED on bd5c5fd98: a generic toast, no flash, no clock; RED on 7ec6c6dcf: the toast REPLACED, no history entry) ONE band-1 ask from a window not in front ⇒ THE TOAST, GROWN: its toast stands (its history entry ${J(hist[0] || null)}), that window FLASHES (title bar + its taskbar button: the waiting blink), its strip's count wears the fill (${a1.w1 && a1.w1.fill}); ONE card at the For-you button — above it, NO popover — «${a1.cards[0] && a1.cards[0].who} · ${a1.cards[0] && a1.cards[0].what}»; the button pulsed`,
      !!q401 && hist.length === 1 && hist[0].ref.kind === 'todo' && !/Stress question/.test(hist[0].m) && a1.toasts.includes(q401.id) && a1.shown && !a1.popover && a1.above && a1.cards.length === 1 && a1.cards[0].id === q401.id && /Stress question 401/.test(a1.cards[0].what) && !!a1.w1 && a1.w1.waiting && a1.w1.announce && a1.w1.tbWaiting && a1.w1.fill && !/rgba\(0, 0, 0, 0\)|transparent/.test(a1.w1.fill) && !!a1.w2 && !a1.w2.announce && a1.blink, a1);
    // (b) TEN IN A MINUTE (the owner's loop) ⇒ one stack: the newest three + «N more», one card per item
    sayTo(s1, 'ten more do:par ' + Array.from({ length: 10 }, (_, k) => 'do:u' + (402 + k)).join(' '));
    const t11 = await byText(/^Stress question 4(0[1-9]|1[01]):/, 11, 60000);
    await A.waitFor(`(() => { const x = ${ANN}; return x.all === 11; })()`, 10000); await sleep(500);
    const a2 = await A.evalJs(ANN);
    await A.shot('desktop-1280-announce-ten.png');
    // the newest three BY FILING TIME, a same-ms tie by id — ONE order (PURE newestFirst: the stack's, the dock's, this oracle's;
    // r11 — the heavy on 7ec6c6dcf showed 408 where the leg's own sort had picked its same-ms twin: the stack broke a tie by
    // when its card was made)
    const want3 = [...t11].sort(FA.newestFirst).slice(0, 3).map((i) => i.id), ties = t11.length - new Set(t11.map((i) => i.createdAt)).size;
    check(`r10+ r11 TEN IN A MINUTE ⇒ ONE stack: ${a2.all} cards (one per item), EXACTLY the newest three in order (${ties} same-ms tie(s) in the batch, broken by id) + «${a2.more}» — never a wall`, a2.all === 11 && a2.cards.length === 3 && a2.cards.map((c) => c.id).join() === want3.join() && /^8 more waiting/.test(a2.more || ''), { got: a2.cards.map((c) => c.id), want3, filed: [...t11].sort(FA.newestFirst).slice(0, 5).map((i) => [i.id, i.createdAt]) });
    // (c) ANSWERED ELSEWHERE ⇒ its card goes (multi-client live)
    const gone = a2.cards[0] && a2.cards[0].id;
    await done(gone);
    await A.waitFor(`(() => { const x = ${ANN}; return x.all === 10 && !x.cards.some((c) => c.id === ${J(gone)}); })()`, 8000);
    const a3 = await A.evalJs(ANN);
    check('r10+ an item answered on another client ⇒ its card is gone from the stack (the next one shows)', a3.all === 10 && !a3.cards.some((c) => c.id === gone) && a3.cards.length === 3, a3);
    // (d) A CARD EXPIRING WHILE IT IS UP (this page's copy of the item given a deadline 4 s out — every snapshot read through it)
    const exp = a3.cards[0] && a3.cards[0].id;
    await A.evalJs(`(() => { const m = app._inboxModel, d = Object.getOwnPropertyDescriptor(m, 'todos'); window.__todos18 = d; const get = d.get, at = Date.now() + 4000;
      Object.defineProperty(m, 'todos', { configurable: true, get() { const t = get.call(m); for (const i of t.open || []) if (i.id === ${J(exp)}) i.expiresAt = at; return t; } }); return 1; })()`);
    await A.waitFor(`(() => { const x = ${ANN}; const c = x.cards.find((y) => y.id === ${J(exp)}); return !!c && / s left$/.test(c.clock); })()`, 4000);
    const e0 = (await A.evalJs(ANN)).cards.find((c) => c.id === exp);
    await A.waitFor(`(() => { const x = ${ANN}; const c = x.cards.find((y) => y.id === ${J(exp)}); return !!c && c.expired; })()`, 8000); await sleep(400);
    const a4 = await A.evalJs(ANN), e1 = a4.cards.find((c) => c.id === exp);
    await A.shot('desktop-1280-announce-expired.png');
    check(`r10+ a card whose item expires while it is up: «${e0 && e0.clock}» → «${e1 && e1.clock}» — it SAYS expired and stays (a late card), never vanishing like one answered`, !!e0 && /^\d s left$/.test(e0.clock) && !!e1 && e1.expired && e1.clock === 'expired', { e0, e1 });
    await A.evalJs(`(() => { const m = app._inboxModel; if (window.__todos18) { Object.defineProperty(m, 'todos', window.__todos18); delete window.__todos18; } return 1; })()`);
    // (e) TWO WINDOWS ASKING AT ONCE (the For-you window in front): both flash, a card each
    await A.evalJs(`(() => { app.openInbox(); return 1; })()`); await sleep(900);
    sayTo(s1, 'at once do:u412'); sayTo(s2, 'at once do:u413');
    const [q412] = await byText(/^Stress question 412:/, 1), [q413] = await byText(/^Stress question 413:/, 1);
    await A.waitFor(`(() => { const x = ${ANN}; return x.cards.some((c) => c.id === ${J(q412 && q412.id)}) && x.cards.some((c) => c.id === ${J(q413 && q413.id)}) && x.w2 && x.w2.waiting; })()`, 10000); await sleep(500);
    const a5 = await A.evalJs(ANN);
    await A.shot('desktop-1280-announce-two-windows.png');
    check(`r10+ TWO WINDOWS ASKING AT ONCE (another window in front) ⇒ both flash (their title bars + taskbar buttons), both strips filled, a card each at the top of the stack («${a5.cards.map((c) => c.who).join('», «')}»)`, !!a5.w1 && a5.w1.waiting && a5.w1.announce && !!a5.w2 && a5.w2.waiting && a5.w2.announce && a5.w2.tbWaiting && a5.cards.slice(0, 2).map((c) => c.id).sort().join() === [q412.id, q413.id].sort().join(), a5);
    await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return 1; })()`); await sleep(400);
    // (f) SEEN: a press on window 2 ⇒ its flash and its strip's fill end; window 1 still flashes
    const w2c = await A.evalJs(`(() => { const r = ${CHAT(s2)}.element.querySelector('.chat-message-list').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 40) }; })()`);
    await A.clickAt(w2c.x, w2c.y); await sleep(500);
    const a6 = await A.evalJs(ANN);
    check('r10+ SEEN: a press on window 2 ends ITS flash and its strip\'s fill (the waiting blink\'s own clear); window 1, unseen, still flashes', !!a6.w2 && !a6.w2.waiting && !a6.w2.announce && !!a6.w1 && a6.w1.waiting && a6.w1.announce, a6);
    // (g) ONE PRESS OPENS IT: the card of q412 ⇒ window 1 in front, the card landed; its stack card gone, its flash ends
    await A.evalJs(`(() => { window.__d18 = []; new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('chat-ask-flash') && m.target.dataset?.item) window.__d18.push(m.target.dataset.item); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); return 1; })()`);
    await A.press(`.ut-announce .uta-card[data-id="${q412 && q412.id}"] .uta-go`, { touch: false }); await sleep(1500);
    const a7 = await A.evalJs(ANN), fl = await A.evalJs('window.__d18 || []');
    check(`r10+ ONE PRESS on a card opens its item (THE For-you door): window 1 in front, its card landed (${J(fl)}), the stack card gone, window 1's flash ended (seen)`, !a7.cards.some((c) => c.id === q412.id) && !!a7.w1 && a7.w1.active && !a7.w1.waiting && !a7.w1.announce && fl.includes(q412.id), { a7, fl });
    // (g2) r11 THE BLINK HAS REASONS (the r10 acceptance): window 2 (not in front) files a band-1 ask and its turn ENDS — the
    // announce's flash first, then the turn's «finished»; the ask answered on another client ⇒ the announce's part goes, the
    // turn's blink STAYS (7ec6c6dcf decided once whose blink it was and cleared it)
    sayTo(s2, 'reasons do:u415');
    const [q415] = await byText(/^Stress question 415:/, 1);
    await A.waitFor(`(() => { const x = ${ANN}; return !!x.w2 && x.w2.announce && x.cards.some((c) => c.id === ${J(q415 && q415.id)}); })()`, 10000);
    await A.waitFor(`(() => { const w = ${CHAT(s2)}; return !!w && !!w._waitWhy && w._waitWhy.has('turn'); })()`, 10000).catch(() => null); await sleep(300); // its turn ended (turn_complete)
    const why0 = await A.evalJs(`(() => { const w = ${CHAT(s2)}; return w && w._waitWhy ? [...w._waitWhy].sort() : null; })()`);
    await done(q415 && q415.id);
    await A.waitFor(`(() => { const x = ${ANN}; return !x.cards.some((c) => c.id === ${J(q415 && q415.id)}); })()`, 8000); await sleep(600);
    const g2 = await A.evalJs(ANN);
    check(`RED-able (r11 — 7ec6c6dcf: the blink ended with the answer): THE BLINK HAS REASONS — window 2's band-1 ask flashed it, then its turn ended (reasons ${J(why0)}); the ask answered elsewhere ⇒ its card and the strip's fill go, the turn's blink STAYS (title bar + taskbar button) until the window is seen`,
      J(why0) === J(['ask', 'turn']) && !!g2.w2 && g2.w2.waiting && g2.w2.tbWaiting && !g2.w2.announce && !g2.w2.active, { why0, w2: g2.w2 });
    // (a point of window 2's own list that no other window covers — window 1, in front since (g), may overlap it)
    const w2d = await A.evalJs(`(() => { const w = ${CHAT(s2)}, r = w.element.querySelector('.chat-message-list').getBoundingClientRect(); for (let y = r.top + 12; y < r.bottom - 12; y += 16) for (let x = r.left + 12; x < r.right - 12; x += 16) { const h = document.elementFromPoint(x, y); if (h && w.element.contains(h) && h.closest('.chat-message-list')) return { x: Math.round(x), y: Math.round(y) }; } return null; })()`);
    if (w2d) await A.clickAt(w2d.x, w2d.y); await sleep(500);
    const g3 = await A.evalJs(ANN);
    check('…and SEEN acknowledges every reason: a press on window 2 ends its blink', !!g3.w2 && !g3.w2.waiting, g3.w2);
    // (g3) r11 NO POPOVER: a card up, then Esc (and the Esc protocol's own question — what [data-popover] stands) — the card stays
    sayTo(s1, 'esc do:u416');
    const [q416] = await byText(/^Stress question 416:/, 1);
    await A.waitFor(`(() => { const x = ${ANN}; return x.cards.some((c) => c.id === ${J(q416 && q416.id)}); })()`, 10000); await sleep(400);
    for (const type of ['keyDown', 'keyUp']) await A.cdp('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(400);
    const g4 = await A.evalJs(ANN);
    check('RED-able (r11 — 7ec6c6dcf\'s stack was a createPopover: the first Esc removed it): the stack is a transient toast, NO popover — Esc goes to the real popover / window and the card stays; no [data-popover] is it', g4.shown && !g4.popover && g4.cards.some((c) => c.id === q416.id), g4);
    // (g4) r11 A RESYNC'S BURST (an overnight sleep: one snapshot brings 20 band-1 asks and 20 plain questions filed meanwhile)
    for (const it of (await api()).open) await done(it.id);
    await A.waitFor(`(() => { const x = ${ANN}; return x.all === 0; })()`, 8000).catch(() => null);
    const NOWR = Date.now(), burst = [...Array.from({ length: 20 }, (_, k) => ({ id: 'ut-r11u' + String(k).padStart(3, '0'), status: 'open', kind: 'action', origin: 'machines', urgency: 'urgent', text: 'Resync ask ' + k, createdAt: NOWR - 60e3 + k * 1000, sessionKey: 'claude:r11-resync' })),
      ...Array.from({ length: 20 }, (_, k) => ({ id: 'ut-r11q' + String(k).padStart(3, '0'), status: 'open', kind: 'action', origin: 'agent', text: 'Resync question ' + k, createdAt: NOWR - 60e3 + k * 1000, sessionKey: 'claude:r11-resync' }))];
    await A.evalJs(PUSH(J(burst))); await sleep(1500);
    const g5 = await A.evalJs(ANN);
    await A.shot('desktop-1280-announce-resync.png');
    check(`r11 A RESYNC'S BURST (20 band-1 asks + 20 plain questions in one snapshot) ⇒ ONE stack: ${g5.all} cards (the 20 inside the policy, none of the 20 outside it), the newest three shown + ONE «${g5.more}»; the toasts their own cap (${g5.toasts.length} ≤ 4) — never a storm`,
      g5.all === 20 && g5.cards.length === 3 && g5.cards.map((c) => c.id).join() === 'ut-r11u019,ut-r11u018,ut-r11u017' && /^17 more waiting/.test(g5.more || '') && g5.toasts.length <= 4 && !g5.cards.some((c) => /^ut-r11q/.test(c.id)), g5);
    await A.evalJs(PUSH('[]'));
    await A.waitFor(`(() => { const x = ${ANN}; return x.all === 0; })()`, 8000).catch(() => null);
    // (h) THE PHONE (390×844 touch): a page of its own on conversation 1; window 2's ask ⇒ the card UNDER the top bar, 44 px targets, the button pulsed
    await A.cdp('Target.createTarget', { url: 'about:blank' }).catch(() => null);
    let tP3 = null; for (let i = 0; i < 40 && !tP3; i++) { tP3 = (await targets()).find((x) => x.id !== target.id); if (!tP3) await sleep(150); }
    const P3 = await connect(tP3);
    try {
      await P3.front(); await toConv(P3, s1, [], 390, 844, true); await sleep(800);
      sayTo(s2, 'phone do:u414');
      const [q414] = await byText(/^Stress question 414:/, 1);
      await P3.waitFor(`(() => { const s = document.querySelector('.ut-announce'); return !!s && !!s.querySelector('.uta-card[data-id="${q414 && q414.id}"]'); })()`, 10000); await sleep(600);
      const ph = await P3.evalJs(`(() => { const s = document.querySelector('.ut-announce'), b = document.getElementById('mobile-nav-todos'), br = b && b.getClientRects().length ? b.getBoundingClientRect() : null, sr = s.getBoundingClientRect();
        const t = [...s.querySelectorAll('button')].filter((x) => x.getClientRects().length).map((x) => { const r = x.getBoundingClientRect(); return { k: x.className, w: Math.round(r.width), h: Math.round(r.height) }; });
        return { under: !!br && sr.top >= br.bottom - 1, nav: !!br, t, what: getComputedStyle(s.querySelector('.uta-what')).fontSize, blink: !!b && b.classList.contains('ut-blink'), w: Math.round(sr.width), vw: innerWidth }; })()`);
      await P3.shot('phone-390-announce.png');
      const small = ph.t.filter((x) => x.h < 44 || x.w < 44);
      check(`r10+ THE PHONE: the card stands UNDER the top bar's For-you button, inside the screen (${ph.w} of ${ph.vw} px), its words ${ph.what}, every target ≥ 44 px (${ph.t.map((x) => x.k.split(' ')[0] + ' ' + x.w + '×' + x.h).join(', ')}), the button pulsed once`, ph.nav && ph.under && ph.w <= ph.vw && parseFloat(ph.what) >= 16 && !small.length && ph.blink, { ph, small });
    } finally { await P3.close(); await A.cdp('Target.closeTarget', { targetId: tP3.id }).catch(() => null); }
    for (const it of (await api()).open) await done(it.id);
  } catch (e) { fail++; console.log('  ✗ ⑱ threw: ' + (e?.message || e)); }
  lap('⑱ done');

  // ── ⑲ THE PICK IS THE ITEM'S (lane needs-card-tail r11 — the r10 acceptance's repro/accept-r10/radio-group.html, on the real
  // page): an automation card's REACH radios stood in the card AND, hidden, in the attention dock's copy of the row — radios of
  // ONE name with no form are ONE group, so the copy drawn last took the check: the card showed none checked and its Allow sent
  // no reach. Now a form control exists once per item: the dock draws no pick, every drawn copy's group is its own, the pick is
  // the item's (user-todos-row.js reachFor) — it survives a repaint, and every Allow carries it.
  // r12 (the r11 acceptance — r11 pinned the strip's Always carrying the card's pick while the strip SHOWED no reach: the owner
  // reads «The whole VibeSpace» in the tray, closes it unanswered, presses the strip's Always ⇒ an instance-wide grant):
  // A PRESS POINT NEVER SENDS A SCOPE IT DOES NOT SHOW — the strip SAYS the pick beside its answers and its Always names it; a
  // pick made on any copy the row module draws rewords it before any press; every press carries exactly the scope its press point shows ──
  console.log('⑲ THE PICK IS THE ITEM\'S; A PRESS POINT SAYS THE SCOPE IT SENDS — the reach in the card, none in the strip but its words; a pick made on any drawn copy rewords the strip before any press; every Allow carries what its press point shows');
  try {
    await A.front(); await A.device(1280, 800, { mouse: true });
    const s9 = await newConv('reach'); await sleep(600); sayTo(s9, 'hello'); await sleep(1500);
    await A.evalJs(`(() => { app.phoneHome?.hide?.(); if (!${CHAT(s9)}) app.attachSession(${J(s9)}, 'reach', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); return 1; })()`);
    await A.waitFor(`!!${CHAT(s9)}`, 8000); await sleep(1200);
    const KEY9 = await A.evalJs(`(() => { const w = ${CHAT(s9)}; return (app.foryouRows.keysForWin(w.id) || [])[0] || null; })()`);
    const T9 = Date.now() - 2000; // (a FIXED filing: the card stands at the conversation's last record — the 'turn' placement)
    const ak = (detail = 'first use') => [{ id: 'ut-r11reach01', sessionKey: KEY9, status: 'open', kind: 'action', origin: 'vault', urgency: 'urgent', createdAt: T9,
      text: 'reach wants to use the automation key K1 (conversations.open)', detail, action: { type: 'automation-ask', askId: 'r'.repeat(32), groups: 'grp-1 grp-2', keyId: 'k1', verb: 'conversations.open' } }];
    const PUSH9 = (extra) => `(async () => { const d = await (await fetch('/api/user-todos')).json(); const todos = d.todos; todos.open = [...todos.open, ...${extra}]; for (const h of app.ws.globalHandlers) { try { h({ type: 'user-todos-updated', todos }); } catch { } } return 1; })()`;
    const WORD = { opened: 'Only the conversations it opens', groups: 'The conversations of its Task Groups', instance: 'The whole VibeSpace' }; // (automation-reach.js reachWord — en)
    const R9 = `(() => { const w = ${CHAT(s9)}; const card = w.element.querySelector('.cn-card .ut-item[data-id="ut-r11reach01"]'), dock = w.element.querySelector('.chat-attn-dock .cad-rows .ut-item[data-id="ut-r11reach01"]');
      const pick = (el) => (el ? (el.querySelector('.ut-ak-reach input:checked') || {}).value || null : 'n/a'), names = card ? [...new Set([...card.querySelectorAll('.ut-ak-reach input')].map((r) => r.name))] : [];
      const sc = dock && dock.querySelector('.ut-ak-scope'), word = sc && sc.querySelector('.ut-ak-scope-word'), al = dock && dock.querySelector('.ut-hub-always');
      const bx = (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) }; };
      return { card: !!card, dock: !!dock, cardPick: pick(card), dockRadios: dock ? dock.querySelectorAll('.ut-ak-reach, input[type="radio"]').length : -1, names, shared: names.length ? document.querySelectorAll('input[name="' + names[0] + '"]').length : 0, cardRadios: card ? card.querySelectorAll('.ut-ak-reach input').length : 0,
        says: sc ? sc.dataset.reach : null, word: word ? word.textContent : null, red: !!word && word.classList.contains('ut-ak-reach-instance'), seen: !!sc && sc.getClientRects().length > 0 && getComputedStyle(sc).display !== 'none', px: word ? parseFloat(getComputedStyle(word).fontSize) : 0,
        always: al ? al.textContent : null, cardAlways: card ? (card.querySelector('.ut-hub-always') || {}).textContent || null : null, scope: sc ? bx(sc) : null,
        answers: dock ? [...dock.querySelectorAll('.ut-exit-answer > button')].map((b) => ({ k: b.textContent.trim(), ...bx(b) })) : [], over: dock ? w.element.querySelector('.chat-attn-dock').scrollWidth - w.element.querySelector('.chat-attn-dock').clientWidth : null, vw: innerWidth }; })()`;
    const saysAll = (x, k) => !!x && x.says === k && x.word === WORD[k] && x.seen && !!x.always && x.always.includes(WORD[k]);
    await A.evalJs(PUSH9(J(ak()))); await A.waitFor(`(() => { const x = ${R9}; return x.card && x.dock; })()`, 8000); await sleep(800);
    const r1 = await A.evalJs(R9);
    await A.shot('desktop-1280-reach-card.png');
    check(`RED-able (r11 — 7ec6c6dcf: card=null, the dock's hidden copy took the check): the automation card stands in the flow and in the strip; its REACH radios are the card's alone (the strip draws ${r1.dockRadios} of them), ONE group of its own (${r1.names.join()} — ${r1.shared} radios of that name in the page), «opened» checked by default`,
      r1.card && r1.dock && r1.dockRadios === 0 && r1.cardRadios === 3 && r1.names.length === 1 && r1.shared === 3 && r1.cardPick === 'opened', r1);
    check(`RED-able (r12 — 9f8b8d846: the strip said no reach): the strip SAYS the reach its answers carry — «${r1.word}» (${r1.px} px) beside them, its Always «${r1.always}»; the card keeps «${r1.cardAlways}» beside its radios`, saysAll(r1, 'opened') && r1.cardAlways === 'Always for this conversation', r1);
    await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-groups`, { touch: false }); await sleep(300);
    const r2 = await A.evalJs(R9); // (no broadcast between: the pick alone)
    check(`RED-able (r12 — 9f8b8d846): a pick made on the CARD rewords the strip BEFORE any press — «${r2.word}», «${r2.always}»`, r2.cardPick === 'groups' && saysAll(r2, 'groups'), r2);
    await A.evalJs(PUSH9(J(ak('first use — still waiting on you')))); await sleep(1200); // its words moved: both rows' signatures move ⇒ the card AND the strip repaint (the acceptance's PATH A, a minute's age, moves them the same way)
    const r3 = await A.evalJs(R9);
    await A.shot('desktop-1280-dock-reach.png');
    check(`RED-able (r11 — 7ec6c6dcf: the repaint left card=null): the owner picks «groups» on the card (${r2.cardPick}); a pass that repaints the card AND the strip keeps it — the card still reads «${r3.cardPick}», the strip «${r3.word}»`, r3.card && r3.cardPick === 'groups' && saysAll(r3, 'groups') && r3.over <= 0, { r2, r3 });
    await A.evalJs(`(() => { const m = app._inboxModel; window.__ra19 = m.runAction; window.__got19 = []; m.runAction = (rec, answer, extra) => { window.__got19.push({ id: rec && rec.id, answer, extra }); return Promise.resolve(true); }; return 1; })()`);
    await sleep(1100); await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-hub-always`, { touch: false }); await sleep(400); // r12b (the r12 review F2): the CARD's own Always under a non-default pick («groups»)
    const pressDock = async (cls) => { await sleep(1100); const shown = (await A.evalJs(R9)).says; await A.press(`.chat-attn-dock .cad-rows .ut-item[data-id="ut-r11reach01"] .${cls}`, { touch: false }); await sleep(400); return shown; }; // (the press arm: an Allow shown under 700 ms ago is not the one read)
    // THE OWNER'S SHAPE: «The whole VibeSpace» pressed in the TRAY to read it, the tray closed unanswered; then only the strip
    await A.press('#taskbar-user-todos', { touch: false });
    await A.waitFor(`!!document.querySelector('#user-todos-popup:not(.hidden) .ut-item[data-id="ut-r11reach01"]')`, 6000);
    if (!(await A.evalJs(`(() => { const l = document.querySelector('#user-todos-popup .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-instance'); return !!l && l.getClientRects().length > 0; })()`))) await A.press(`#user-todos-popup .ut-item[data-id="ut-r11reach01"] .ut-text`, { touch: false });
    await A.waitFor(`(() => { const l = document.querySelector('#user-todos-popup .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-instance'); return !!l && l.getClientRects().length > 0; })()`, 4000);
    await A.press(`#user-todos-popup .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-instance`, { touch: false }); await sleep(300);
    await A.press('#taskbar-user-todos', { touch: false }); await A.waitFor(`document.getElementById('user-todos-popup').classList.contains('hidden')`, 4000);
    const r4 = await A.evalJs(R9);
    await A.shot('desktop-1280-dock-reach-instance.png');
    const sawI = await pressDock('ut-hub-always');
    // the owner picks the narrowest again (on the card); the strip's Allow once then carries exactly that — never 'instance'
    await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-opened`, { touch: false }); await sleep(300);
    const r5 = await A.evalJs(R9);
    const sawO = await pressDock('ut-hub-once');
    await sleep(1100); await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-hub-always`, { touch: false }); await sleep(400);
    const got = await A.evalJs(`window.__got19 || []`);
    await A.evalJs(`(() => { const m = app._inboxModel; if (window.__ra19) m.runAction = window.__ra19; delete window.__ra19; return 1; })()`);
    check(`RED-able (r12 — 9f8b8d846: the strip said nothing, then sent 'instance'): THE OWNER'S SHAPE — «The whole VibeSpace» read in the tray and left: the strip says «${r4.word}» (red: ${r4.red}) and «${r4.always}» BEFORE the press, and its Always sends exactly that (${J(got[1] && got[1].extra)})`,
      r4.cardPick === 'instance' && saysAll(r4, 'instance') && r4.red && sawI === 'instance' && !!got[1] && got[1].answer === 'always' && got[1].extra && got[1].extra.reach === 'instance', { r4, sawI, got1: got[1] });
    check(`RED-able (r12): every press carries exactly the scope its press point shows — the strip said «${r5.word}» ⇒ its Allow once sent ${J(got[2] && got[2].extra)} (never 'instance'); the card's Always (its radio «opened») sent ${J(got[3] && got[3].extra)}, under «groups» ${J(got[0] && got[0].extra)}`,
      saysAll(r5, 'opened') && sawO === 'opened' && got.length === 4 && got[0].answer === 'always' && got[0].extra && got[0].extra.reach === 'groups' && got[2].answer === 'once' && got[2].extra && got[2].extra.reach === 'opened' && got[3].answer === 'always' && got[3].extra && got[3].extra.reach === 'opened' && got.every((g) => g.id === 'ut-r11reach01'), got);
    // r12b (the r12 review F1): A NARROW WINDOW — a chat window 380 px wide (desktop, a mouse) under the longest reach («The
    // conversations of its Task Groups»): the reach line on its own row, the answers on theirs (the Always wrapping its words) —
    // every answer inside the window and the strip (r12 kept them at max-content in one line: Deny past the window's edge)
    await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-groups`, { touch: false }); await sleep(300);
    await A.evalJs(`(() => { const w = ${CHAT(s9)}; if (!w) return false; if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.resizeWindowTo(w.id, { w: 380, h: 720 }); return true; })()`); await sleep(900);
    const n9 = await A.evalJs(R9);
    const edge9 = await A.evalJs(`(() => { const w = ${CHAT(s9)}, r = w.element.getBoundingClientRect(), d = w.element.querySelector('.chat-attn-dock').getBoundingClientRect(); return { win: Math.round(r.width), winRight: Math.floor(r.right), dockRight: Math.floor(d.right) }; })()`);
    await A.shot('desktop-380-dock-reach.png');
    const past380 = n9.answers.filter((b) => b.right > edge9.winRight || b.right > edge9.dockRight || b.left < 0);
    check(`RED-able (r12b — 45a9ca4b9: the answers never wrapped, Deny past the edge): a chat window ${edge9.win} px wide under the longest reach — the strip says «${n9.word}» on its own row, its answers (${n9.answers.map((b) => b.k + ' ' + b.left + '→' + b.right).join(', ')}) all inside the window (right edge ${edge9.winRight}) and the strip (${edge9.dockRight}), overflow ${n9.over} px`,
      saysAll(n9, 'groups') && edge9.win <= 382 && n9.answers.length === 3 && !past380.length && n9.over <= 0 && !!n9.scope && n9.scope.top < n9.answers[0].top, { n9, edge9, past380 });
    await A.evalJs(PUSH9('[]')); await sleep(600);
    // THE PHONE (390×844 touch): the strip's words at 16 px on their own line, every answer ≥ 44 px on ONE row, the longest reach
    // in the Always's words («Always · The conversations of its Task Groups») wrapping inside it — nothing past the screen's edge
    await toConv(A, s9, [], 390, 844, true);
    await A.evalJs(PUSH9(J(ak()))); await A.waitFor(`(() => { const x = ${R9}; return x.card && x.dock && x.seen; })()`, 8000); await sleep(900);
    await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-groups`, { touch: true }); await sleep(500);
    await A.evalJs(`(() => { for (const x of document.querySelectorAll('.global-toast .global-toast-x')) x.click(); return 1; })()`); await sleep(500); // (the arrival toast stands over the strip for its seconds — closed by its own ×, for the shot)
    const p9 = await A.evalJs(R9);
    const seen9 = await A.evalJs(`(() => { const d = ${CHAT(s9)}.element.querySelector('.chat-attn-dock .cad-rows .ut-item[data-id="ut-r11reach01"]'); const els = [d.querySelector('.ut-ak-scope-word'), ...d.querySelectorAll('.ut-exit-answer > button')]; return els.every((e) => { if (!e) return false; const r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === e || e.contains(h)); }); })()`);
    await A.shot('phone-390-dock-reach.png');
    const small9 = p9.answers.filter((b) => b.h < 44 || b.w < 44), past9 = p9.answers.filter((b) => b.right > p9.vw || b.left < 0);
    const row9 = p9.answers.length === 3 && p9.answers.every((b) => b.top === p9.answers[0].top) && p9.scope && p9.scope.top < p9.answers[0].top;
    check(`r12 THE PHONE (390×844 touch): the strip says «${p9.word}» at ${p9.px} px (≥ 16) on its own line, and its answers are ≥ 44 px on ONE row below it (${p9.answers.map((b) => b.k + ' ' + b.w + '×' + b.h).join(', ')}) — none past the edge, each the topmost thing at its centre`,
      saysAll(p9, 'groups') && p9.px >= 16 && row9 && !small9.length && !past9.length && p9.over <= 0 && seen9 === true, { p9, small9, past9, seen9 });
    await A.evalJs(PUSH9('[]')); await sleep(600);
  } catch (e) { fail++; console.log('  ✗ ⑲ threw: ' + (e?.message || e)); }
  lap('⑲ done');

  check('the shots are written (desktop 1280 + phone 375)', ['desktop-1280-watch-request.png', 'desktop-1280-ask-chips.png', 'desktop-1280-resolved.png', 'phone-375-watch-request.png', 'phone-375-ask-chips.png', 'phone-375-resolved.png', 'phone-375-accordion.png', 'phone-375-accordion-opened.png', 'desktop-1280-accordion.png', 'desktop-1280-tail.png', 'phone-390-tail.png', 'desktop-1280-dock-one.png', 'desktop-1280-dock-three.png', 'desktop-1280-dock-twenty.png', 'desktop-1280-dock-400-chars.png', 'desktop-1280-dock-six-options.png', 'desktop-320-dock.png', 'desktop-1280-dock-composer-6-lines.png', 'desktop-1280-dock-5000-up.png', 'phone-390-dock-two.png', 'phone-390-dock-twenty.png', 'phone-390-dock-six-options.png', 'desktop-1280-announce-one.png', 'desktop-1280-announce-ten.png', 'desktop-1280-announce-expired.png', 'desktop-1280-announce-two-windows.png', 'phone-390-announce.png', 'desktop-1280-reach-card.png', 'desktop-1280-dock-reach.png', 'desktop-1280-dock-reach-instance.png', 'phone-390-dock-reach.png', 'desktop-380-dock-reach.png'].every((f) => fs.existsSync(path.join(SHOTS, f)))); // (+ lane needs-card-tail r10: the strip's and the announce's shots — the UI verdict is visual)
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ threw: ' + (e?.stack || e)); }

console.log(`\nshots: ${SHOTS}`);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
