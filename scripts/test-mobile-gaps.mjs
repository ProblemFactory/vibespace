#!/usr/bin/env node
// Mobile gaps battery (docs/design-mobile-gaps.md, 2026-09-20 — the top-10
// gaps + the measured defects) at 390×844, DSF 2, an iPhone UA, touch
// emulation and hover:none/pointer:coarse, so app.isMobile AND app.isTouch
// are true exactly as on a phone. A THROWAWAY server in a git worktree (own
// data/, a scratch HOME carrying one seeded For-you item and a view-only
// fixture transcript) + headless chrome over raw CDP, test-sidebar-rail's
// harness. Long-presses are REAL touch sequences (Input.dispatchTouchEvent,
// held past installLongPressContextMenu's 500 ms) — never a synthesized
// contextmenu, which would skip the very path a phone takes.
//   #8  every lifted touch target is ≥ 36 px (nav, sidebar header/search/tabs,
//       status-bar chips, dropdown rows, terminal keys, explorer toolbar)
//   #1  the nav inbox button carries the badge and opens the For-you sheet
//   #3  "+" long-press → the create sheet (Agent / Terminal / Files / Web view
//       [/ Desktop when available]); its Files row opens the explorer
//   #6  explorer phone layout: one Name column, no horizontal overflow, the
//       bookmark strip above the list, long-press → Select… mode
//   #4  the status-bar magnifier opens the search bar
//   billing chip (lane billing-chip, 2026-09-30): a stub active-sessions frame
//       moves the live chat's pool member A → B ⇒ the status-bar chip names B,
//       on the same node (DOM text + a screenshot, the chip scrolled into view)
//   #5  the message menu from the … button (a long press on the words selects them — lane mobile-select); the
//       hover buttons are display:none
//   #7  switcher: the "+" desktop tab, tab long-press → Rename/Delete, window
//       row long-press → the 'window' menu incl. Move to Desktop
//   #10 the terminal key row shows every key inside the viewport and carries
//       Copy screen
//   TWO CLIENTS (r2, the verifier's A/B harness): a 1280×800 desktop page joins
//       the same server; a phone's saves reach it live and vice versa —
//   #9  ⚙ System… / Ports… / Channels… rows land in windows on the phone AND
//       replay as WINDOWS on the rail-bearing desktop (its rail tab untouched);
//       the desktop's next save leaves the phone's windows alone
//   #10 a desktop minimize is TRUTH on the phone (isMinimized, hidden locally,
//       another window shown, listed under Minimized); the phone's next save
//       does NOT restore it; the phone's own restore tap does
//   defect: the settings nav strip wraps (no horizontal scroller)
//   FIRST SCREEN (lane phone-first-screen, design q-044 decision 5): the phone OPENS on the attention page (the seeded
//       ask its row, under the nav, the nav naming it, its ✕ hidden); ☰ reaches the conversation list in one tap; at
//       the end the server restarts on the PRODUCTION SHAPE: at 375×812 and 390×844 the 6 rows + every band / fold head
//       + the notices' line fit without scrolling (a CONTROL with whole words does not); a row's tap opens its
//       conversation, the back gesture returns to the list; every ask answered ⇒ the next back lands on the
//       conversation list and a boot draws no page; the 1280×800 desktop draws none
//   THE FILES DOOR (lane phone-files-door, the owner 2026-10-23: 「手机上好像不是很容易找到文件管理器」; lane phone-titlebar-title,
//       2026-11-06: a folder icon beside ☰ read as the window's own — the compact bar shows none, its press is the «+» sheet's 文件
//       row): from the cold first screen ONE tap — the For-you page's 文件 card, its Home chip — lists the home (CONTROL = the
//       base's screen: without the lane's two doors nothing on it says Files — the only road was a long-press on «+»); the
//       explorer IS the screen; the «+» sheet's Files row (the nav door's press) reveals the same explorer, never a second one;
//       ‹ returns to the For-you page, whose 文件 card sits AFTER the bands (chips ≥ 36 px, home first) and opens
//       the explorer THERE; on the explorer: rows ≥ 44 px, the path bar at 16 px, a RELATIVE name resolves against the
//       folder on show (B-d027), the breadcrumbs scroll sideways (the folder in view, a crumb navigates), a long-press on a
//       row's name is its menu with nothing selected, «New session here» opens New Session with the folder
// Requires google-chrome (SKIP without). Run: node scripts/test-mobile-gaps.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchDir, scratchHome, ONBOARDED_SOURCE, vncEnv, readRunRecord, runOwnerState, RUN_RECORD } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('mobile-gaps-wt');
const fakeHome = scratchHome('mobile-gaps-home', fs);
const CWD = path.join(fakeHome, 'proj');
const SID = 'f01d0000-0000-4000-8000-0000000ab11e'; // view-only fixture (the fold-ux precedent: a non-guarded id under a scratch HOME)
const VW = 390, VH = 844;
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
// screenshots for the mandatory human look (test-gear-menu's habit): their own
// scratch dir, NOT removed by cleanup. B-3f5d ② (2026-09-24 verifier: ~76 left in /tmp): the gate's reaper judges
// PROCESSES, never a directory, so nothing swept them. The dir is now STAMPED with this run's record (scratchDir) and
// every run removes the shots of runs whose owner is gone — the newest look survives until the next run, a live
// parallel run's is never touched (an unstamped dir from before this fix: its pid, by name, must be gone too).
const SHOTS = scratchDir('mobile-gaps-shots');
function sweepDeadShots() {
  const root = path.dirname(SHOTS), stem = path.basename(SHOTS).replace(/-\d+$/, '-');
  const gone = [];
  for (const n of fs.readdirSync(root)) {
    const m = n.startsWith(stem) ? /^(\d+)$/.exec(n.slice(stem.length)) : null;
    const dir = path.join(root, n);
    if (!m || dir === SHOTS) continue;
    const rec = readRunRecord(dir);
    const dead = rec ? !runOwnerState(rec).alive : !fs.existsSync(`/proc/${m[1]}`);
    if (dead) { try { fs.rmSync(dir, { recursive: true, force: true }); gone.push(n); } catch { } }
  }
  return gone;
}
{
  // the leg: one dead run's stamped dir, one unstamped dir of a gone pid, one LIVE run's (this process's parent) — the control
  const root = path.dirname(SHOTS), stem = path.basename(SHOTS).replace(/-\d+$/, '-');
  const deadPid = Number(fs.readFileSync('/proc/sys/kernel/pid_max', 'utf-8')) + 10 + (process.pid % 1000);   // above pid_max — never a live process
  const dead = path.join(root, stem + deadPid), legacy = path.join(root, stem + (deadPid + 1)), live = path.join(root, stem + process.ppid);
  for (const d of [dead, legacy]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(dead, RUN_RECORD), JSON.stringify({ v: 1, run: 'gone', pid: deadPid, starttime: 12345, bootId: '' }) + '\n');
  const livePlanted = !fs.existsSync(live);
  if (livePlanted) { fs.mkdirSync(live, { recursive: true }); fs.writeFileSync(path.join(live, 'keep.png'), ''); }
  const gone = sweepDeadShots();
  check('B-3f5d ②: a gone run\'s shots dir (stamped, and an unstamped one of a dead pid) is removed at the next run; this run\'s own dir is stamped', !fs.existsSync(dead) && !fs.existsSync(legacy) && !!readRunRecord(SHOTS), { gone });
  check('B-3f5d ② CONTROL: a dir whose pid is ALIVE (another run in flight) is never touched', fs.existsSync(path.join(live, 'keep.png')));
  if (livePlanted) fs.rmSync(live, { recursive: true, force: true });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── fixtures: a seeded For-you item (the store's own persisted shape) + a
// short view-only transcript + two plain files for the explorer ────────────
fs.mkdirSync(CWD, { recursive: true });
fs.writeFileSync(path.join(fakeHome, 'notes.txt'), 'hello\n');
fs.writeFileSync(path.join(fakeHome, 'todo.md'), '- one\n');
// lane phone-files-door: ~/work/payments (the relative name B-d027 types at ~/work) and a deep folder for the breadcrumbs
const DEEP = path.join(fakeHome, 'work', 'payments', 'src', 'a-rather-long-folder-name', 'another-long-folder-name', 'and-one-more-level');
fs.mkdirSync(DEEP, { recursive: true });
fs.writeFileSync(path.join(fakeHome, 'work', 'payments', 'ledger.md'), '# ledger\n');
{
  const lines = [];
  let ts0 = Date.now() - 3600e3; let n = 0;
  const ts = () => new Date((ts0 += 5e3)).toISOString();
  const push = (o) => lines.push(JSON.stringify(o));
  for (let k = 0; k < 6; k++) {
    push({ type: 'user', message: { role: 'user', content: `question ${k}` }, uuid: `u-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID });
    push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `answer ${k}: a line of prose long enough to reach the right edge of a phone screen and wrap once or twice` }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `a-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID });
  }
  const proj = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.join('\n') + '\n');
}

// ── throwaway server in a worktree (no rebuild: overlays the built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const TODO_TEXT = 'Approve the migration plan before I continue';
fs.writeFileSync(path.join(wt, 'data', 'user-todos.json'), JSON.stringify({ items: [{
  // lane foryou-folds: the badge counts bands 1–4 — a high ask WITH its answers (option chips) is a decision, band 4
  id: 'ut-mobilegap01', sessionKey: 'claude:' + SID, text: TODO_TEXT, detail: null, urgency: 'high', kind: 'action', options: ['Approve', 'Wait'],
  status: 'open', by: 'agent', sessionName: 'mobile gaps', jobId: null, createdAt: Date.now() - 60e3, resolvedAt: null, resolvedBy: null,
}] }, null, 2));

// A stub `claude` (the CODEX_CMD precedent of test-collab-live-counter): the
// REAL chat-wrapper spawns it through the REAL create path; it answers the
// boot probes, announces a stream-json init frame and then idles on stdin
// exactly where the real CLI waits for its first user turn. This is the ONLY
// way to put a LIVE (non-read-only) chat window on the phone without a vendor
// CLI — and the magnifier is gated to live windows like Ctrl+F itself.
const LIVE_SID = 'f01d0000-0000-4000-8000-0000000ab1fe';
const stubPath = `${wt}-claude-stub`;
// lane fable-52-cli-321 r4 (the 5-1 scene): a create asked for `fable[1m]` gets the SCENE conversation instead — the CLI's own
// stream-json shape, an init + an assistant record per turn: `PRE n` = n turns of the pre-update CLI (init + served
// claude-fable-5-1), `POST n` = n turns of 2.1.321 (claude-fable-5-2), anything else one turn at 5-2. Every other spawn: as before.
const SCENE_SID = '5c5e0051-0000-4000-8000-0000000f5251';
fs.writeFileSync(stubPath, `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const mi = args.indexOf('--model'), scene = mi >= 0 && args[mi + 1] === 'fable[1m]';
const SID = scene ? ${JSON.stringify(SCENE_SID)} : ${JSON.stringify(LIVE_SID)};
const init = (model) => out({ type: 'system', subtype: 'init', session_id: SID, model, cwd: ${JSON.stringify(CWD)}, tools: [], permissionMode: 'default', claude_code_version: scene ? (model === 'claude-fable-5-1' ? '2.1.319' : '2.1.321') : '2.1.274' });
init(scene ? 'claude-fable-5-2' : 'claude-fable-5');
let n = 0, buf = '', cur = 'claude-fable-5-2';
const RES = { opus: 'claude-opus-5-5', 'opus[1m]': 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', fable: 'claude-fable-5-2', 'fable[1m]': 'claude-fable-5-2' };
const LABEL = { opus: 'Opus 5.5', 'opus[1m]': 'Opus 5.5 (1M context)', sonnet: 'Sonnet 5.5', fable: 'Fable 5.2', 'fable[1m]': 'Fable 5.2 (1M context)' };
const done = (model) => out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 50, num_turns: 1, result: 'ok', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 5, output_tokens: 3 }, modelUsage: { [model]: { inputTokens: 5, outputTokens: 3, contextWindow: 1000000 } } });
const said = (model, k, text) => out({ type: 'assistant', session_id: SID, uuid: 'scene-a-' + k, message: { id: 'msg_scene_' + k, type: 'message', role: 'assistant', model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 } } });
const turn = (model, what) => { const k = ++n; init(model);
  out({ type: 'assistant', session_id: SID, uuid: 'scene-a-' + k, message: { id: 'msg_scene_' + k, type: 'message', role: 'assistant', model, content: [{ type: 'text', text: what + ' turn ' + k + ' served by ' + model }], stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 } } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 50, num_turns: 1, result: 'ok', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 5, output_tokens: 3 }, modelUsage: { [model]: { inputTokens: 5, outputTokens: 3, contextWindow: 1000000 } } }); };
process.stdin.on('data', (d) => {
  if (!scene) return;
  buf += d; let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch { continue; }
    // a set_model is ECHOED as 2.1.321 echoes it (measured, probe/typed-model-v321.jsonl): «Set model to <alias (id)>», the user record the
    // hub reads live as the CLI's report (lane fable-52-cli-321 rounds 14–15), then its control_response
    if (m && m.type === 'control_request') { if (m.request && m.request.subtype === 'set_model' && m.request.model) { const asked = m.request.model, id = RES[asked], BQ = String.fromCharCode(96); cur = id || asked; out({ type: 'user', isReplay: true, parent_tool_use_id: null, session_id: SID, message: { role: 'user', content: '<local-command-stdout>Set ' + 'model to ' + BQ + (id && id !== asked ? asked + ' (' + id + ')' : asked) + BQ + '</local-command-stdout>' } }); } out({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: {} } }); continue; }
    if (!m || m.type !== 'user') continue;
    const c = m.message && m.message.content; const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => b.text || '').join('') : '';
    const pre = /^PRE (\\d+)/.exec(text), post = /^POST (\\d+)/.exec(text);
    if (pre) { for (let j = 0; j < +pre[1]; j++) turn('claude-fable-5-1', 'old'); continue; }
    if (post) { for (let j = 0; j < +post[1]; j++) turn('claude-fable-5-2', 'new'); continue; }
    // a typed /model (the wrapper hands it over between turns), in the shape 2.1.321 writes — MEASURED (lane fable-52-cli-321
    // round 8, probe/typed-model-v321*.jsonl: the real CLI on a loopback mock): an init naming the OLD model, an assistant record
    // of model <synthetic> with the answer, a result with num_turns 0. A model this CLI knows: «Set model to <its name> for this
    // session only», and it becomes the model; one its check refuses: «Model '<id>' not found», and the CLI keeps its model.
    // The hub judges none of it (round 15: a typed /model writes nothing) — the chip learns the model from the CLI's next init.
    const typed = /^\\/model\\s+(\\S+)\\s*$/.exec(text.trim());
    if (typed) { const k = ++n, BT = String.fromCharCode(96); init(cur);
      const ans = RES[typed[1]] ? 'Set ' + 'model to ' + BT + (LABEL[typed[1]] || typed[1]) + BT + ' for this session only' : "Model '" + typed[1] + "' not found";
      if (RES[typed[1]]) cur = RES[typed[1]];
      out({ type: 'assistant', session_id: SID, uuid: 'scene-ack-' + k, message: { id: 'msg_scene_ack_' + k, type: 'message', role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: ans }], stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } } });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1, num_turns: 0, result: ans, session_id: SID, uuid: 'scene-ack-result-' + k, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } });
      continue; }
    // SLOW: a turn still running for 3 s — one record now, one more (the same model) and its result at the end
    if (text.trim() === 'SLOW') { const k = ++n, m = cur; init(m); said(m, k, 'slow turn ' + k + ' (1/2) served by ' + m); setTimeout(() => { said(m, k + 'b', 'slow turn ' + k + ' (2/2) served by ' + m); done(m); }, 3000); continue; }
    turn(cur, 'live');
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const startServer = () => spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
let srv = startServer(); // `let`: the first-screen legs restart it on another For-you store (lane phone-first-screen)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [`${wt}-chrome`, fakeHome, stubPath]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// lane phone-first-screen: restart the throwaway server on another For-you store (the store reads data/user-todos.json at boot)
const restartWith = async (items) => {
  const was = srv; was.kill('SIGKILL');
  await new Promise((r) => { if (was.exitCode !== null || was.signalCode) r(); else { was.once('exit', r); setTimeout(r, 3000); } });
  fs.writeFileSync(path.join(wt, 'data', 'user-todos.json'), JSON.stringify({ items }, null, 2));
  srv = startServer();
  for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
};
// THE PRODUCTION SHAPE by shape (lane foryou-folds' counts over the .314 store: the first screen's bands {2: 1, 3: 4, 4: 7,
// 5: 6, 搁置 13} + 5 notices; ask text p50 ~150 / p90 ~300 characters, ~40 % CJK, a detail on every ask) — the WORDS are
// invented. Every ask is the LIVE stub conversation's (the stub always announces LIVE_SID — a tap attaches its window).
const prodShape = () => {
  const now = Date.now();
  const EN = 'Should the nightly export run against the staging bucket or the archive bucket? The staging one is faster but keeps only thirty days of history, ';
  const ZH = '要不要把夜间导出改到归档桶？暂存桶更快但只保留三十天，归档桶慢一些但不会丢历史记录，你决定后我就改配置并重跑一次。';
  const words = (n, k) => { let out = ''; let i = 0; while (out.length < n) out += (i++ + k) % 5 < 2 ? ZH : EN; return out.slice(0, n); };
  const LENS = [97, 147, 239, 120, 304, 180, 90, 260, 150, 110, 200, 140];
  let n = 0;
  const item = (o) => ({ id: 'ut-shape' + String(++n).padStart(3, '0'), sessionKey: 'claude:' + LIVE_SID, sessionName: 'live stub', status: 'open', kind: 'action', origin: 'agent', urgency: 'normal', by: 'agent', createdAt: now - n * 37 * 60e3, resolvedAt: null, resolvedBy: null, jobId: null, detail: null, ...o });
  const ask = (k, o = {}) => item({ text: words(LENS[k % 12], k), detail: words(LENS[(k + 3) % 12] + 50, k + 1), ...o });
  return [
    ask(0, { judged: { group: 'now', p: 0.8, facts: { state: 'blocked', askedAt: now - 3 * 3600e3 } } }), // band 2: a blocked board
    ...[1, 2, 3, 4].map((k) => ask(k, { due: now + (6 + k * 8) * 3600e3 })),                            // band 3: a date inside 48 h
    ...[5, 6, 7, 8, 9, 10, 11].map((k) => ask(k, { options: ['Run now', 'Wait for backup'] })),         // band 4: option chips
    ...[12, 13, 14, 15, 16, 17].map((k) => ask(k)),                                                      // band 5
    ...Array.from({ length: 13 }, (_, k) => ask(k + 3, { createdAt: now - (8 + k) * 864e5 })),           // 搁置 (7 days unanswered)
    ...Array.from({ length: 5 }, (_, k) => item({ text: words(80, k), kind: 'notice', origin: 'browser', sessionKey: 'browser' })),
  ];
};
// the page's first screen by getBoundingClientRect: its rows, every band bar / fold head, the notices' line
const MEASURE_PAGE = `(() => {
  const p = document.getElementById('phone-home'); const pr = p.getBoundingClientRect();
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
  const rows = [...p.querySelectorAll('.ut-bands .ut-item')].map((el) => ({ band: el.closest('.ut-band').dataset.band, ...box(el) }));
  const heads = [...p.querySelectorAll('.ut-band-bar, .ut-bands .ut-fold')].map((el) => ({ band: el.closest('.ut-band').dataset.band, fold: el.classList.contains('ut-fold'), ...box(el) }));
  const nh = p.querySelector('.ut-notice-head'); const notices = nh && nh.offsetParent ? box(nh) : null;
  const all = [...rows, ...heads, ...(notices ? [notices] : [])];
  return { rows, heads, folds: heads.filter((x) => x.fold).length, notices, top: Math.round(pr.top), scrollTop: p.scrollTop, last: Math.max(...all.map((x) => x.bottom)), allInside: all.every((x) => x.top >= pr.top - 0.5 && x.bottom <= innerHeight + 0.5) };
})()`;

// ── raw CDP ─────────────────────────────────────────────────────────────────
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
// ONE page client per CDP target (r2: the battery drives TWO pages — the phone
// and a desktop — on the same server, so the helpers are a factory)
const connectPage = async (wsUrl) => {
  const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  let seq = 0; const pend = new Map(); const pageErrors = [];
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
  });
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
    sock.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(200); } return evalJs(expr); };
  // A REAL user input (layout.js marks the client user-dirty on a capture
  // pointerdown — a client that never had one never SENDS a layout save, the
  // 2.90.1 anti-echo gate): a mouse click on the inert toolbar title span.
  // (A modifier-only Shift key never produced a document keydown in headless
  // — measured: the desktop stayed clean and never sent.) VERIFIED against the
  // gate itself, so a silent no-input can never pass as "the other client's
  // save changed nothing".
  const userInput = async () => {
    const pt = await evalJs(`(() => { const el = document.querySelector('#toolbar .toolbar-title'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!pt) throw new Error('userInput: no toolbar title on this page');
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(40);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(100);
    if (!(await evalJs('app.layoutManager._userDirty === true'))) throw new Error('userInput: the click did not mark the client user-dirty');
  };
  const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  // Two tabs in one headless window: only the FOREGROUND tab acks input
  // (Chrome never acks a touch/key dispatched to a hidden renderer — the
  // Puppeteer bringToFront class; measured: the first tap after the desktop
  // tab was created hung the battery). Every input helper fronts its page.
  const front = () => cdp('Page.bringToFront');
  return { cdp, evalJs, waitFor, userInput: async () => { await front(); await userInput(); }, front, waitApp, pageErrors, sock };
};
const phone = await connectPage(target.webSocketDebuggerUrl);
const { cdp, evalJs, waitFor, pageErrors } = phone;
const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch {} };
// Let a RECEIVER settle before it acts as a sender: _applyRemoteState holds
// `_restoring` for 1 s and _doAutoSave inside that window returns WITHOUT
// rescheduling (the anti-ping-pong cooldown) — measured: a user-dirty desktop
// that opened a window 300 ms after applying a phone save never sent.
const settle = async (client) => { await client.waitFor('!app.layoutManager._restoring', 15000); await sleep(1500); };
// A REAL long-press: touch down, hold past the 500 ms timer, release. The
// coordinates are CSS px (the emulated viewport), taken from the element's
// rect at press time.
const longPress = async (selector, holdMs = 700) => {
  await phone.front();
  const pt = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 20) }; })()`);
  if (!pt) throw new Error('longPress: no element for ' + selector);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
  await sleep(holdMs);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
  return pt;
};
const tap = async (selector) => {
  await phone.front();
  // a row below a scroller's fold is scrolled into view first (the finger does the same); 'nearest' is a no-op for a visible target
  const pt = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!pt) throw new Error('tap: no element for ' + selector);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
  await sleep(60);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
};
// two quick taps (the verifier's 150–170 ms) → Chrome synthesizes a dblclick
const tapTwice = async (selector, gapMs = 150) => {
  await phone.front();
  const pt = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!pt) throw new Error('tapTwice: no element for ' + selector);
  for (let i = 0; i < 2; i++) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
    await sleep(40);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (i === 0) await sleep(gapMs);
  }
  await sleep(300);
};
// cancelable like a real key (a handler's preventDefault must be observable by the next layer)
const escape = async () => { await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true`); await sleep(150); };
const rectsOf = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed').map((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), txt: (el.textContent || '').trim().slice(0, 40) }; })`;
const allAtLeast = (rects, min = 36, axis = 'both') => rects.length > 0 && rects.every((r) => (axis === 'h' ? r.h >= min : axis === 'w' ? r.w >= min : (r.h >= min && r.w >= min)));

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  // the phone BEFORE navigation: viewport, UA, touch, the media features App reads at construction
  await cdp('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  // A RETURNING user: on a fresh instance with no sessions the first-run
  // wizard (#welcome.onboarding, position:fixed inset:0 z 9600) covers the nav
  // bar by design — every touch below would land on it (measured: the hit-test
  // at the inbox button's centre answered #welcome). app._maybeShowOnboarding
  // reads this flag before showing it.
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await phone.waitApp();
  // a reload that never evaluates on the outgoing page (a marker the new document does not carry)
  const reloadPhone = async () => {
    await phone.evalJs('window.__fsOld = 1; true');
    await phone.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 150; i++) { try { if (await phone.evalJs('!window.__fsOld && !!window.app')) break; } catch { } await sleep(200); }
    await phone.waitApp();
  };
  await sleep(1200);

  console.log('phone emulation');
  const env = await evalJs(`({ mobile: app.isMobile, touch: app.isTouch, nav: !!app._mobileNav, toolbar: getComputedStyle(document.getElementById('toolbar')).display, taskbar: getComputedStyle(document.getElementById('taskbar')).display, iw: innerWidth, ih: innerHeight })`);
  check(`app.isMobile + app.isTouch + MobileNav present, #toolbar/#taskbar display:none at ${env.iw}×${env.ih}`, env.mobile && env.touch && env.nav && env.toolbar === 'none' && env.taskbar === 'none', env);

  // ── THE FIRST SCREEN (lane phone-first-screen, design q-044 decision 5): the phone opens on the attention list ──
  console.log('first screen: the attention page (lane phone-first-screen)');
  await waitFor(`!document.getElementById('phone-home').classList.contains('hidden')`, 8000);
  const fs0 = await evalJs(`(() => { const h = document.getElementById('phone-home'); const r = h.getBoundingClientRect(); const nb = document.getElementById('mobile-nav').getBoundingClientRect(); const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return { shown: !h.classList.contains('hidden') && getComputedStyle(h).display !== 'none', top: Math.round(r.top), navBottom: Math.round(nb.bottom), bottom: Math.round(r.bottom), w: Math.round(r.width), rows: [...h.querySelectorAll('.ut-bands .ut-item')].map((x) => x.dataset.id), onPage: !!hit && h.contains(hit), sb: app.sidebar.isOpen, title: document.getElementById('mobile-nav-title').textContent, close: getComputedStyle(document.getElementById('mobile-nav-close')).display }; })()`);
  check(`the phone opens on the attention page: under the nav (top ${fs0.top} = the nav's bottom ${fs0.navBottom}), the whole window area (${fs0.w}×${fs0.bottom - fs0.top}), the seeded ask its row, the sidebar shut`, fs0.shown && fs0.top === fs0.navBottom && fs0.bottom === VH && fs0.w === VW && fs0.rows.join() === 'ut-mobilegap01' && fs0.onPage && !fs0.sb, fs0);
  check(`the nav names the page ("${fs0.title}") and hides the ✕ that would close a window under it (display ${fs0.close})`, fs0.title === 'For you' && fs0.close === 'none', fs0);
  await shot('first-screen-boot.png');
  await tap('#mobile-nav-menu'); await sleep(250);
  const fs1 = await evalJs(`(() => { const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return { sb: app.sidebar.isOpen, inSidebar: !!hit && !!hit.closest('#sidebar'), page: !document.getElementById('phone-home').classList.contains('hidden') }; })()`);
  check('☰ reaches the conversation list in one tap: the sidebar opens over the page (the page stays beneath)', fs1.sb && fs1.inSidebar && fs1.page, fs1);
  await tap('#sidebar-close'); await sleep(250);
  check('…its ✕ closes it — back on the page', await evalJs(`!app.sidebar.isOpen && !document.getElementById('phone-home').classList.contains('hidden') && document.getElementById('phone-home').contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2))`));

  // ── THE FILES DOOR (lane phone-files-door): taps from a cold open to a listing of ~/ ──
  console.log('the files door (lane phone-files-door): taps from a cold open to a listing of ~/');
  // a DOOR = a button ON TOP at its centre whose label or own words say Files (the word a person looks for). CONTROL = the
  // base's first screen: the same finder without the lane's two doors (the nav's 文件, the page's card) finds none — the
  // only road there was a 500 ms press on «+», whose tap opens New Session (a press is not a tap; nothing said Files)
  const filesDoors = (without) => evalJs(`(() => {
    const skip = ${JSON.stringify(without)};
    const says = (el) => /^Files$/.test((el.getAttribute('aria-label') || el.title || [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('') || '').trim());
    const onTop = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) return false; const h = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + r.height / 2)); return !!h && (h === el || el.contains(h)); };
    return [...document.querySelectorAll('button, [role=button], a')].filter((el) => !skip.some((s) => el.closest(s)) && says(el) && onTop(el)).map((el) => el.id ? '#' + el.id : String(el.className));
  })()`);
  // lane phone-titlebar-title (the owner 2026-11-06: «最左边那个文件浏览器的图标也很容易误认为是当前窗口的图标…应该放进 + 菜单里»): the compact
  // bar shows NO folder icon — the cold first screen's one-tap door is the page's 文件 card (a section headed Files: its Home chip is
  // the door), the «+» sheet's 文件 row the nav door's press (the explorer this phone showed last)
  const cardDoors = (without) => evalJs(`(() => {
    const skip = ${JSON.stringify(without)};
    const onTop = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) return false; const h = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + r.height / 2)); return !!h && (h === el || el.contains(h)); };
    return [...document.querySelectorAll('section')].filter((c) => !skip.some((s) => c.closest(s)) && /^Files$/.test(c.firstElementChild?.textContent.trim() || '')).map((c) => c.querySelector('button')).filter((b) => b && onTop(b)).map((b) => String(b.className));
  })()`);
  await waitFor(`!!document.querySelector('#phone-home .ph-files-chip[data-kind="home"]')`, 8000);
  const doorsNow = await filesDoors([]), cardNow = await cardDoors([]), doorsBase = (await filesDoors(['#mobile-nav-files', '.ph-files'])).concat(await cardDoors(['.ph-files']));
  check(`the compact bar draws no folder icon (LAW 3 — no «Files» button on the bar: ${doorsNow.join(', ') || 'none'})`, !doorsNow.includes('#mobile-nav-files') && await evalJs(`document.getElementById('mobile-nav-files').getClientRects().length === 0`), doorsNow);
  check(`the cold first screen holds a door that says Files — the page's 文件 card, its first chip on top (${cardNow.join(', ')}) — CONTROL (the base's screen, without the lane's two doors): none (${doorsBase.length})`, cardNow.length > 0 && /\bhome\b/.test(cardNow[0]) && doorsBase.length === 0, { cardNow, doorsBase });
  const homeDir = await evalJs('app._localHome');
  await tap('#phone-home .ph-files-chip[data-kind="home"]');
  const oneTap = await waitFor(`(() => { const w = app.wm.windows.get(app.wm.activeWindowId); return w?.type === 'files' && w._explorer?.currentPath === ${JSON.stringify(homeDir)} && w.element.querySelectorAll('.file-item').length >= 3 && document.getElementById('phone-home').classList.contains('hidden'); })()`, 8000);
  check('ONE tap on its Home chip lists the home (taps from a cold open: 1 ≤ 2 — the base: a long-press on «+» and a tap, behind no word)', oneTap, await evalJs(`({ active: app.wm.windows.get(app.wm.activeWindowId)?.type, path: app.wm.windows.get(app.wm.activeWindowId)?._explorer?.currentPath, rows: document.querySelectorAll('.file-explorer .file-item').length })`));
  // the «+» sheet's Files row by a real tap (its row marked for the finger — the sheet's rows carry no id); found by its word — with
  // an explorer open a hint line under it names the folder it brings back (lane phone-titlebar-title r3; r4: the folder's name), returned here
  const plusFiles = async () => {
    await longPress('#mobile-nav-new');
    const hint = await evalJs(`(() => { const r = [...document.querySelectorAll('.mobile-sheet .context-menu-item')].find((el) => [...el.querySelectorAll('span')].some((s) => !s.children.length && s.textContent.trim() === 'Files')); if (r) r.dataset.plusFiles = '1'; return r ? (r.querySelector('.mnav-sheet-hint')?.textContent || '') : null; })()`);
    await tap('.mobile-sheet .context-menu-item[data-plus-files]');
    return hint;
  };
  const sheetGeo = await evalJs(`(() => { const w = app.wm.windows.get(app.wm.activeWindowId); const r = w.element.getBoundingClientRect(); const nb = document.getElementById('mobile-nav').getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), b: Math.round(r.bottom), nav: Math.round(nb.bottom), titlebar: getComputedStyle(w.titleBar).display }; })()`);
  check(`the explorer IS the screen: under the nav (top ${sheetGeo.t} = ${sheetGeo.nav}), the whole width (${sheetGeo.w}) and height (bottom ${sheetGeo.b}), no title bar`, sheetGeo.l === 0 && sheetGeo.t === sheetGeo.nav && sheetGeo.w === VW && sheetGeo.b === VH && sheetGeo.titlebar === 'none', sheetGeo);
  const plusHint = await plusFiles();
  check(`the «+» sheet's Files row says what it does with the home's explorer open — «${plusHint}» (r3: ONE act per row, said; r4: the FOLDER's name — the home is «~», as the explorer's breadcrumbs say it — never its path)`, plusHint === 'Back to ~', plusHint);
  check('the «+» sheet\'s Files row (the nav door\'s press, moved) reveals the same explorer at the home — never a second one', await waitFor(`[...app.wm.windows.values()].filter((w) => w.type === 'files').length === 1 && app.wm.windows.get(app.wm.activeWindowId)?._explorer?.currentPath === ${JSON.stringify(homeDir)}`, 5000),
    await evalJs(`[...app.wm.windows.values()].map((w) => w.type + ':' + (w._explorer?.currentPath || '')).join(', ')`));
  await tap('.window.window-active .file-phone-back');
  const backHome = await waitFor(`!document.getElementById('phone-home').classList.contains('hidden') && document.getElementById('mobile-nav-title').textContent === 'For you'`, 5000);
  check('‹ in the explorer returns to the phone\'s home (the For-you page while it has rows — the back gesture\'s rule)', backHome);
  await waitFor(`document.querySelectorAll('#phone-home .ph-files-chip').length >= 3`, 8000);
  const card = await evalJs(`(() => { const p = document.getElementById('phone-home'); const c = p.querySelector(':scope > .ph-files'); if (!c) return null; const list = p.querySelector(':scope > .ut-inbox').getBoundingClientRect(); const r = c.getBoundingClientRect();
    return { top: Math.round(r.top), listBottom: Math.round(list.bottom), after: c.previousElementSibling?.classList.contains('ut-inbox'), head: c.querySelector('.ph-files-head').textContent.trim(), chips: [...c.querySelectorAll('.ph-files-chip')].map((b) => { const q = b.getBoundingClientRect(); return { kind: b.dataset.kind, path: b.dataset.path, text: b.textContent, h: Math.round(q.height), r: Math.round(q.right) }; }) }; })()`);
  check(`the For-you page carries a 文件 card AFTER its list (card top ${card?.top} ≥ list bottom ${card?.listBottom}) headed «${card?.head}», home first, every chip ≥ 36 px and inside the screen (${card?.chips.map((x) => x.kind + ':' + x.text).join(' · ')})`,
    card && card.after && card.top >= card.listBottom && card.head === 'Files' && card.chips[0].kind === 'home' && card.chips[0].path === homeDir && card.chips.some((x) => x.kind === 'files' && /\/work$/.test(x.path)) && card.chips.every((x) => x.h >= 36 && x.r <= VW), card);
  await tap('#phone-home .ph-files-chip[data-kind="files"]');
  const chipPath = card?.chips.find((x) => x.kind === 'files')?.path;
  check(`one tap on a chip opens the explorer THERE (${chipPath})`, await waitFor(`(() => { const w = app.wm.windows.get(app.wm.activeWindowId); return w?.type === 'files' && w._explorer?.currentPath === ${JSON.stringify(chipPath)} && document.getElementById('phone-home').classList.contains('hidden'); })()`, 8000));
  for (const id of await evalJs(`[...app.wm.windows.keys()]`)) await evalJs(`app.wm.requestClose(${JSON.stringify(id)}); true`);
  await waitFor('app.wm.windows.size === 0', 5000);
  await evalJs('app.phoneHome.show(); true'); await sleep(200); // where the legs below start (the page, no window)

  // ── #8 touch targets: the nav bar ──
  console.log('#8 touch targets');
  const navRects = await evalJs(rectsOf('#mobile-nav-menu, #mobile-nav-new, #mobile-nav-gear, #mobile-nav-todos'));
  check(`nav buttons (menu / new / gear / inbox) are ≥ 36×36 px (${navRects.map((r) => r.w + '×' + r.h).join(', ')})`, navRects.length === 4 && allAtLeast(navRects), navRects);
  // sidebar header + search row + tabs
  await evalJs(`app.sidebar.toggle(true); true`); await sleep(400);
  const sbRects = await evalJs(rectsOf('#sidebar-close, #backend-filter, #manage-toggle, #sort-toggle'));
  check(`sidebar header buttons (close / filter / manage / sort) are ≥ 36×36 px (${sbRects.map((r) => r.w + '×' + r.h).join(', ')})`, sbRects.length === 4 && allAtLeast(sbRects), sbRects);
  const search = await evalJs(rectsOf('#session-filter'));
  check(`sidebar search input is ≥ 36 px tall (${search[0]?.h})`, search.length === 1 && search[0].h >= 36, search);
  const tabRects = await evalJs(rectsOf('.sidebar-tab'));
  check(`sidebar tabs are ≥ 36 px tall (${tabRects.map((r) => r.h).join('/')})`, allAtLeast(tabRects, 36, 'h'), tabRects);
  await evalJs(`app.sidebar.toggle(false); true`); await sleep(300);

  // ── #1 For-you inbox on the nav bar ──
  console.log('#1 For-you inbox');
  const badge = await evalJs(`(() => { const b = document.getElementById('mobile-nav-todos'); return { has: b.classList.contains('ut-has-items'), urg: b.dataset.urgency, pills: [...b.querySelectorAll('.ut-count')].map((p) => p.className.replace('ut-count ', '') + ':' + p.textContent) }; })()`);
  check('the nav inbox button carries the seeded item as a high-urgency badge pill', badge.has && badge.urg === 'high' && badge.pills.length === 1 && badge.pills[0] === 'ut-seg-high:1', badge);
  // lane foryou-honest: on the phone the badge is the door to its first-screen PAGE (one surface) — it toggles the page, never
  // the sheet beside it; the sheet is reached through its own door (the page with no row to show falls back to it)
  const pg = () => evalJs(`({ page: !document.getElementById('phone-home').classList.contains('hidden'), sheet: !document.getElementById('user-todos-popup').classList.contains('hidden'), item: document.getElementById('phone-home').textContent.includes(${JSON.stringify(TODO_TEXT)}), sb: app.sidebar.isOpen, win: !!app.wm.activeWindowId })`);
  const pg0 = await pg(); await tap('#mobile-nav-todos'); await sleep(300);
  const pg1 = await pg();
  await tap(pg1.sb ? '#drawer-foryou' : '#mobile-nav-todos'); await sleep(300); // nothing under the page ⇒ the conversation list — its first row «For you · N» is the way back
  const pg2 = await pg();
  check('tapping it toggles the first-screen page listing the item — never the sheet (lane foryou-honest; nothing under the page ⇒ the conversation list, its first row brings the page back)', pg1.page !== pg0.page && pg2.page === pg0.page && !pg1.sheet && !pg2.sheet && (pg0.page ? pg0.item : pg1.item) && (pg0.page && !pg1.win ? pg1.sb : true) && !pg2.sb, { pg0, pg1, pg2 });
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  const sheet = await evalJs(`(() => { const p = document.getElementById('user-todos-popup'); const r = p.getBoundingClientRect(); return { hidden: p.classList.contains('hidden'), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), t: Math.round(r.top), text: p.textContent.includes(${JSON.stringify(TODO_TEXT)}) }; })()`);
  await evalJs(`document.querySelector('#user-todos-popup .ut-bands .ut-item > .ut-body > .ut-text')?.click(); true`); await sleep(200); // a touch screen's row is FOLDED — the tap opens it (its ✓ ✕ ⤢)
  check(`the sheet's own door opens #user-todos-popup as a full-width sheet under the nav (left ${sheet.l}, right ${sheet.r}, top ${sheet.t}) listing the item`, !sheet.hidden && sheet.l >= 0 && sheet.r <= VW && sheet.w >= VW - 40 && sheet.t >= 40 && sheet.text, sheet);
  // r2: the sheet's OWN controls (tabs 17 px, ✓/✕/⤢ 20 px, the session header 18 px before)
  const sheetCtl = await evalJs(rectsOf('#user-todos-popup .ut-tab, #user-todos-popup .ut-act, #user-todos-popup .ut-band-bar'));
  check(`the sheet's tabs / ✓ ✕ ⤢ / band head (lane foryou-folds: the band bar replaced the session header) are ≥ 36 px tall, the buttons ≥ 36 wide (${sheetCtl.map((r) => r.w + '×' + r.h).join(', ')})`, sheetCtl.length >= 6 && sheetCtl.every((r) => r.h >= 36) && sheetCtl.filter((r) => r.txt.length <= 1).every((r) => r.w >= 36), sheetCtl);
  // r2: Escape closes it (a persistent element cannot carry [data-popover] — its own keydown handler)
  await escape();
  check('Escape closes the sheet (its own handler; the popup cannot carry the [data-popover] protocol)', await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`));
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  // layering: a [data-popover] node above the sheet takes the Escape first (the global handler removes it), the sheet stays
  await evalJs(`(() => { const m = document.createElement('div'); m.className = 'context-menu'; m.setAttribute('data-popover', ''); m.id = 'r2-pop'; document.body.appendChild(m); return true; })()`);
  await escape();
  check('…and a popover above it takes the Escape first: the popover closes, the sheet stays open', await evalJs(`!document.getElementById('r2-pop') && !document.getElementById('user-todos-popup').classList.contains('hidden')`));
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  check('its door again closes the sheet', await evalJs(`document.getElementById('user-todos-popup').classList.contains('hidden')`));

  // ── #3 "+" long-press sheet ──
  console.log('#3 "+" long-press sheet');
  await longPress('#mobile-nav-new');
  const createSheet = await evalJs(`(() => { const m = document.querySelector('.context-menu.mobile-sheet'); if (!m) return null; const r = m.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), rows: [...m.querySelectorAll('.context-menu-item')].map((el) => ({ txt: el.textContent.trim(), h: Math.round(el.getBoundingClientRect().height), svg: !!el.querySelector('svg') })), vnc: !!app._vncAvailable, apps: !!app._desktopAppsAvailable, prof: !!app._browserProfiles }; })()`);
  // the three browser faces (design-browser-faces direction B, D5): Web view always; Apps… (design 009 §B6: one word) when /api/desktop/apps has a backend; Agent browser when the profile digest is held
  const wantRows = ['Agent session', 'Terminal', 'Files', 'Web view', ...(createSheet?.vnc ? ['Desktop'] : []), ...(createSheet?.apps ? ['Apps…'] : []), ...(createSheet?.prof ? ['Agent browser'] : [])];
  check(`a real 700 ms press on "+" opens the create sheet with ${wantRows.join(' / ')} (Desktop only when /api/vnc/status says available; Apps… / Agent browser gated like their ⚙ rows)`, createSheet && JSON.stringify(createSheet.rows.map((r) => r.txt)) === JSON.stringify(wantRows), createSheet);
  check('the sheet is full-width under the nav and every row is ≥ 44 px with an SVG icon', createSheet && createSheet.l <= 12 && createSheet.r >= VW - 12 && createSheet.t >= 40 && createSheet.rows.length >= 4 && createSheet.rows.every((r) => r.h >= 44 && r.svg), createSheet);
  check('no window opened yet (the press did not also fire the tap)', await evalJs('app.wm.windows.size') === 0);
  await evalJs(`[...document.querySelectorAll('.mobile-sheet .context-menu-item')].find((el) => [...el.querySelectorAll('span')].some((x) => !x.children.length && x.textContent.trim() === 'Files')).click(); true`); // by its word (r3: a hint line may ride under it)
  check('its Files row opens the file explorer', await waitFor(`!!document.querySelector('.file-explorer') && app.wm.windows.size === 1`));

  // ── #6 explorer phone layout ──
  console.log('#6 explorer phone layout');
  await waitFor(`document.querySelectorAll('.file-explorer .file-item').length >= 2`);
  const fe = await evalJs(`(() => {
    const ex = document.querySelector('.file-explorer'); const list = ex.querySelector('.file-list'); const bk = ex.querySelector('.file-bookmark-panel');
    const cols = [...ex.querySelectorAll('.file-sort-header .file-sort-col')].map((c) => ({ txt: c.textContent.trim(), r: Math.round(c.getBoundingClientRect().right) }));
    const tools = [...ex.querySelectorAll('.file-toolbar .file-tool-btn')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    const pathIn = ex.querySelector('.file-path-input').getBoundingClientRect();
    const rows = [...ex.querySelectorAll('.file-item')].map((r) => Math.round(r.getBoundingClientRect().right));
    const toggle = ex.querySelector('.file-bookmark-toggle');
    return { cols, exScroll: ex.scrollWidth, exClient: ex.clientWidth, listScroll: list.scrollWidth, listClient: list.clientWidth, tools, pathH: Math.round(pathIn.height), pathW: Math.round(pathIn.width),
      bkBottom: Math.round(bk.getBoundingClientRect().bottom), listTop: Math.round(list.getBoundingClientRect().top), bkCollapsed: bk.classList.contains('bk-collapsed'), toggleShown: toggle && getComputedStyle(toggle).display !== 'none', rowsRight: rows, cwd: ex.querySelector('.file-path-input').value };
  })()`);
  check(`ONE column (Name) on the phone; header cell ends inside the viewport (${fe.cols.map((c) => c.txt + '@' + c.r).join(', ')})`, fe.cols.length === 1 && /^Name/.test(fe.cols[0].txt) && fe.cols[0].r <= VW, fe.cols);
  check(`no horizontal overflow: explorer ${fe.exScroll}/${fe.exClient}, list ${fe.listScroll}/${fe.listClient}, every row's right edge ≤ ${VW}`, fe.exScroll <= fe.exClient + 1 && fe.listScroll <= fe.listClient + 1 && fe.rowsRight.every((r) => r <= VW + 1), fe);
  check(`toolbar buttons are ≥ 36×36 (${fe.tools.map((t) => t.join('×')).join(', ')}) and the path input has its own ≥ 36 px line`, fe.tools.length >= 6 && fe.tools.every(([w, h]) => w >= 36 && h >= 36) && fe.pathH >= 36 && fe.pathW >= VW - 60, fe);
  check('bookmarks are a folded STRIP above the list (chevron shown, panel collapsed, its bottom ≤ the list top)', fe.toggleShown && fe.bkCollapsed && fe.bkBottom <= fe.listTop + 1, fe);
  await evalJs(`document.querySelector('.file-bookmark-toggle').click(); true`); await sleep(150);
  check('the chevron unfolds the strip', await evalJs(`!document.querySelector('.file-bookmark-panel').classList.contains('bk-collapsed') && getComputedStyle(document.querySelector('.file-bookmark-list')).display !== 'none'`));
  await evalJs(`document.querySelector('.file-bookmark-toggle').click(); true`);
  // long-press → Select… mode
  await longPress('.file-explorer .file-item');
  const feMenu = await evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((el) => el.textContent.trim())`);
  check(`a long-press on a row opens its menu with a Select… row first (${feMenu.slice(0, 3).join(' / ')}…)`, feMenu[0] === 'Select…', feMenu);
  await evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].find((el) => el.textContent.trim() === 'Select…').click(); true`); await sleep(150);
  const sel1 = await evalJs(`(() => { const b = document.querySelector('.file-select-bar'); return { shown: getComputedStyle(b).display !== 'none', count: b.querySelector('.file-select-count')?.textContent, n: document.querySelectorAll('.file-item.selected').length, btns: [...b.querySelectorAll('.file-select-btn')].map((x) => Math.round(x.getBoundingClientRect().height)) }; })()`);
  check('Select… enters the mode: the bar shows "1 selected", the pressed row is selected, its buttons are ≥ 36 px', sel1.shown && sel1.count === '1 selected' && sel1.n === 1 && sel1.btns.length === 6 && sel1.btns.every((h) => h >= 36), sel1);
  await tap('.file-explorer .file-item:nth-of-type(2)');
  const sel2 = await evalJs(`({ count: document.querySelector('.file-select-count')?.textContent, n: document.querySelectorAll('.file-item.selected').length })`);
  check('a tap on a second row TOGGLES it into the selection (2 selected)', sel2.count === '2 selected' && sel2.n === 2, sel2);
  // r2: a quick double-tap (Chrome synthesizes dblclick) on a FOLDER row must
  // toggle twice — never navigate, never drop the mode (the verifier's repro)
  const dirSel = '.file-explorer .file-item[data-is-dir="true"]';
  const dbl0 = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(dirSel)}); return { path: document.querySelector('.file-path-input').value, sel: r?.classList.contains('selected'), name: r?.dataset.name, count: document.querySelector('.file-select-count')?.textContent }; })()`);
  await tapTwice(dirSel, 150);
  const dbl1 = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(dirSel)}); return { path: document.querySelector('.file-path-input').value, sel: r?.classList.contains('selected'), bar: getComputedStyle(document.querySelector('.file-select-bar')).display !== 'none', count: document.querySelector('.file-select-count')?.textContent, editors: [...app.wm.windows.values()].filter((w) => w.type === 'editor' || w.type === 'viewer').length }; })()`);
  check(`a double-tap on the "${dbl0.name}" folder row in Select mode keeps the path (${dbl1.path}), keeps the mode (${dbl1.count}) and toggles it twice (selected ${dbl0.sel} → ${dbl1.sel})`, dbl0.name && dbl1.path === dbl0.path && dbl1.bar && dbl1.sel === dbl0.sel && dbl1.count === dbl0.count && dbl1.editors === 0, { dbl0, dbl1 });
  await evalJs(`document.querySelector('.file-select-btn.file-select-done').click(); true`); await sleep(100);
  check('Done leaves the mode and clears the selection', await evalJs(`getComputedStyle(document.querySelector('.file-select-bar')).display === 'none' && document.querySelectorAll('.file-item.selected').length === 0`));
  // negative control: OUTSIDE Select mode the same double-tap still navigates into the folder
  await tapTwice(dirSel, 150);
  const dbl2 = await waitFor(`document.querySelector('.file-path-input').value === ${JSON.stringify(dbl0.path.replace(/\/$/, '') + '/' + dbl0.name)}`, 8000);
  check(`negative control: outside Select mode a double-tap on the folder row navigates into it (${dbl0.path}/${dbl0.name})`, dbl2, await evalJs(`document.querySelector('.file-path-input').value`));

  // ── THE EXPLORER ON A PHONE (lane phone-files-door) ──
  console.log('the explorer on a phone (lane phone-files-door)');
  const EXP = `app.wm.windows.get(app.wm.activeWindowId)._explorer`;
  const home2 = await evalJs('app._localHome');
  await evalJs(`(async () => { await ${EXP}.navigate(${JSON.stringify(home2 + '/work')}); return true; })()`);
  await waitFor(`document.querySelectorAll('.file-explorer .file-item').length >= 1`);
  const fp = await evalJs(`(() => { const ex = document.querySelector('.file-explorer'); const rows = [...ex.querySelectorAll('.file-item')].map((r) => Math.round(r.getBoundingClientRect().height)); const inp = ex.querySelector('.file-path-input'); const back = ex.querySelector('.file-toolbar > .file-phone-back'); const b = back.getBoundingClientRect();
    return { rows, font: getComputedStyle(inp).fontSize, backFirst: ex.querySelector('.file-toolbar').firstElementChild === back, back: [Math.round(b.width), Math.round(b.height)] }; })()`);
  check(`the file rows are ≥ 44 px (${fp.rows.join('/')}), the path bar is 16 px (no focus zoom on iOS), ‹ is the toolbar's first button (${fp.back.join('×')})`, fp.rows.length >= 1 && fp.rows.every((h) => h >= 44) && fp.font === '16px' && fp.backFirst && fp.back[0] >= 36 && fp.back[1] >= 36, fp);
  // B-d027: `payments` typed in the bar at ~/work goes to ~/work/payments (the field's base 1 = the folder on show)
  await evalJs(`(() => { const i = document.querySelector('.file-explorer .file-path-input'); i.focus(); i.select(); return true; })()`);
  await cdp('Input.insertText', { text: 'payments' }); await sleep(900);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const rel = await waitFor(`${EXP}.currentPath === ${JSON.stringify(home2 + '/work/payments')}`, 6000);
  check('B-d027: a RELATIVE name typed in the path bar resolves against the folder on show (`payments` at ~/work ⇒ ~/work/payments)', rel, await evalJs(`({ path: ${EXP}.currentPath, line: document.querySelector('.file-explorer .pf-under')?.textContent })`));
  // the breadcrumbs: a deep folder scrolls them sideways — the folder itself in view, a crumb navigates
  await evalJs(`(async () => { await ${EXP}.navigate(${JSON.stringify(DEEP)}); return true; })()`); await sleep(400);
  const cb = await evalJs(`(() => { const c = document.querySelector('.file-explorer .file-crumbs'); const items = [...c.querySelectorAll('.file-crumb')]; const last = items[items.length - 1].getBoundingClientRect(); const cr = c.getBoundingClientRect();
    return { items: items.map((b) => b.textContent), ox: getComputedStyle(c).overflowX, sw: c.scrollWidth, cw: c.clientWidth, sl: Math.round(c.scrollLeft), lastIn: last.right <= cr.right + 1 && last.left >= cr.left - 1, here: items[items.length - 1].classList.contains('here'), h: Math.min(...items.map((b) => Math.round(b.getBoundingClientRect().height))), exScroll: document.querySelector('.file-explorer').scrollWidth }; })()`);
  check(`the breadcrumbs (${cb.items.join(' › ')}) scroll sideways (${cb.sw} > ${cb.cw}, overflow-x ${cb.ox}) with the folder itself in view (scrollLeft ${cb.sl}), crumbs ≥ 36 px, the explorer itself never wider than the screen`,
    cb.items[0] === '~' && cb.items[cb.items.length - 1] === 'and-one-more-level' && cb.ox === 'auto' && cb.sw > cb.cw && cb.lastIn && cb.here && cb.sl > 0 && cb.h >= 36 && cb.exScroll <= VW + 1, cb);
  await tap('.file-explorer .file-crumb[data-path="' + home2 + '/work"]');
  check('a tap on the «work» crumb (scrolled into view) opens ~/work', await waitFor(`${EXP}.currentPath === ${JSON.stringify(home2 + '/work')}`, 6000), await evalJs(`${EXP}.currentPath`));
  // a long-press on a row's NAME is the row's menu — never a text selection
  await evalJs(`getSelection().removeAllRanges(); true`);
  await longPress('.file-explorer .file-item .file-name');
  const lp = await evalJs(`({ menu: [...document.querySelectorAll('.context-menu .context-menu-item')].map((el) => el.textContent.trim()).slice(0, 3), sel: String(getSelection()) })`);
  check(`a long-press on a row's name opens the row's menu (${lp.menu.join(' / ')}…) and selects no text`, lp.menu[0] === 'Select…' && lp.sel === '', lp);
  await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); true`);
  // «New session here» at the top of the listing → the New Session dialog with this folder
  const nh = await evalJs(`(() => { const b = document.querySelector('.file-explorer .file-new-here'); const r = b.getBoundingClientRect(); const first = document.querySelector('.file-explorer .file-item').getBoundingClientRect(); return { text: b.textContent.trim(), h: Math.round(r.height), above: r.bottom <= first.top + 1 }; })()`);
  check(`«${nh.text}» heads the listing (above the first row, ${nh.h} px)`, nh.text === 'New session here' && nh.above && nh.h >= 44, nh);
  await tap('.file-explorer .file-new-here');
  const ns = await waitFor(`!!document.getElementById('input-cwd')?.offsetParent && document.getElementById('input-cwd').value === ${JSON.stringify(home2 + '/work')}`, 5000);
  check('…a tap opens New Session with the folder filled in', ns, await evalJs(`({ cwd: document.getElementById('input-cwd')?.value, shown: !!document.getElementById('input-cwd')?.offsetParent })`));
  await evalJs('app.hideDialogs(); true'); await sleep(200);

  // ── #4 / #5 chat: search chip, chips ≥ 36, hover buttons gone, message long-press ──
  console.log('#4/#5 chat');
  await evalJs(`app.viewSession(${JSON.stringify(SID)}, ${JSON.stringify(CWD)}, 'mobile gaps'); true`);
  check('the view-only fixture chat renders', await waitFor(`document.querySelectorAll('.chat-view .chat-msg').length >= 6`, 20000));
  await sleep(600);
  const chips = await evalJs(`(() => { const bar = document.querySelector('.window-active .chat-view .chat-status-bar');
    return { barH: Math.round(bar.getBoundingClientRect().height), search: !!bar.querySelector('.chat-status-search'), searchBar: !!document.querySelector('.window-active .chat-search-bar'),
      chips: [...bar.querySelectorAll('.chat-status-clickable')].filter((c) => c.offsetWidth > 0).map((c) => ({ cls: c.className.split(' ')[0], h: Math.round(c.getBoundingClientRect().height) })) }; })()`);
  check(`every status-bar chip is ≥ 36 px tall (${chips.chips.map((c) => c.h).join('/')})`, chips.chips.length >= 3 && chips.chips.every((c) => c.h >= 36), chips);
  // 2.369.221 (lane global-search-chrome): every chat view mounts ChatSearch — Search everything lands a hit on a read-only viewer
  // too — so the chip, which follows Ctrl+F's own gate, shows on a VIEW-ONLY window as well (before: neither)
  check('a VIEW-ONLY window builds ChatSearch (Search everything lands there), so it shows the magnifier too (the chip follows Ctrl+F\'s own gate)', chips.search && chips.searchBar, chips);
  await evalJs(`document.querySelector('.window-active .chat-view .chat-status-search')?.click(); true`); await sleep(250);
  check('…and tapping it opens the view-only window\'s search bar', await evalJs(`(() => { const b = document.querySelector('.window-active .chat-view .chat-search-bar'); return !!b && !b.classList.contains('hidden') && getComputedStyle(b).display !== 'none'; })()`));
  await evalJs(`document.querySelector('.window-active .chat-view .chat-search-close')?.click(); true`); await sleep(150);
  await evalJs(`document.querySelector('.window-active .chat-view .chat-status-model').click(); true`); await sleep(250);
  const ddRows = await evalJs(`[...document.querySelectorAll('.chat-view .chat-status-dropdown-item')].map((el) => Math.round(el.getBoundingClientRect().height))`);
  check(`the model dropdown rows are ≥ 36 px (${ddRows.join('/')})`, ddRows.length > 0 && ddRows.every((h) => h >= 36), ddRows);
  await escape();
  const hover = await evalJs(`(() => { const btns = [...document.querySelectorAll('.chat-view .chat-msg > .chat-open-editor-btn')]; return { n: btns.length, shown: btns.filter((b) => getComputedStyle(b).display !== 'none').length }; })()`);
  check(`the ${hover.n} per-message hover buttons are display:none ≤768px (the overlap defect)`, hover.n > 0 && hover.shown === 0, hover);
  // the message menu opens from the message's … button (lane mobile-select: a long press on the WORDS is the
  // platform's selection — scripts/test-mobile-select.mjs drives that and the chrome presses)
  await evalJs(`document.querySelector('.chat-message-list').scrollTop = document.querySelector('.chat-message-list').scrollHeight; true`); await sleep(200);
  await tap('.chat-view .chat-msg.chat-msg-assistant .chat-msg-more');
  const msgMenu = await evalJs(`[...document.querySelectorAll('.context-menu.chat-msg-menu .context-menu-item')].map((el) => el.textContent.trim())`);
  check(`a tap on a message's … button opens the message menu: ${msgMenu.join(' / ')}`, msgMenu.includes('Copy text') && msgMenu.includes('Open in editor') && msgMenu.includes('Message details'), msgMenu);
  check('…without a Fork row in a VIEW-ONLY window (the fork gate holds)', !msgMenu.includes('Fork from here'), msgMenu);
  await evalJs(`[...document.querySelectorAll('.chat-msg-menu .context-menu-item')].find((el) => el.textContent.trim() === 'Message details').click(); true`); await sleep(200);
  check('Message details opens the per-message metadata popup', await evalJs(`!!document.querySelector('.msg-meta-pop')`));
  await escape(); await evalJs(`document.querySelectorAll('.msg-meta-pop').forEach((p) => p.remove()); true`);

  // a LIVE chat window (stub CLI behind the real wrapper) carries the magnifier
  console.log('#4 chat search on a LIVE window');
  {
    const liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((r) => liveWs.on('open', r));
    const frames = [];
    liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    liveWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'live1' }));
    let sid = null;
    for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(500); }
    check('a live claude chat session is created through the real spawn path (stub CLI behind the real wrapper)', !!sid, frames.slice(-3).map((f) => JSON.stringify(f).slice(0, 200)).join('\n'));
    if (sid) {
      await evalJs(`app.attachSession(${JSON.stringify(sid)}, 'live stub', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
      check('the live window attaches on the phone (composer present)', await waitFor(`!!document.querySelector('.window-active .chat-view .chat-input') && !!document.querySelector('.window-active .chat-view .chat-status-search')`, 20000));
      const mag = await evalJs(`(() => { const s = document.querySelector('.window-active .chat-view .chat-status-search'); if (!s) return null; const r = s.getBoundingClientRect(); return { display: getComputedStyle(s).display, w: Math.round(r.width), h: Math.round(r.height), svg: !!s.querySelector('svg') }; })()`);
      check(`the live status bar carries the search magnifier as a ≥ 36×36 SVG chip (${mag?.display}, ${mag?.w}×${mag?.h})`, mag && mag.display !== 'none' && mag.w >= 36 && mag.h >= 36 && mag.svg, mag);
      await evalJs(`document.querySelector('.window-active .chat-view .chat-status-search').click(); true`); await sleep(250);
      check('tapping the magnifier opens the search bar (Ctrl+F\'s touch face, the same open())', await evalJs(`(() => { const b = document.querySelector('.window-active .chat-view .chat-search-bar'); return !!b && !b.classList.contains('hidden') && getComputedStyle(b).display !== 'none'; })()`));
      // r2: the bar's own prev / next / close were 24×17 / 24×17 / 20×20
      const sbBtns = await evalJs(rectsOf('.window-active .chat-view .chat-search-bar button'));
      check(`the search bar's prev / next / close buttons are ≥ 36×36 (${sbBtns.map((r) => r.w + '×' + r.h).join(', ')})`, sbBtns.length === 3 && allAtLeast(sbBtns), sbBtns);

      // ── the billing chip follows the member (lane billing-chip, 2026-09-30) ──
      // The owner's phone kept the member a conversation STARTED on after the pool moved it to another one: the
      // phone has no title bars, its billing chip is the status bar's, and its re-render key named the pool only.
      // The broadcast is a stub of the server's own frame — THIS page's last `active-sessions` list with the live
      // row's `auth` in server.js poolAuth's shape (a fresh server holds no pool) — fed through the page's real
      // socket entry point (ws.onmessage ⇒ the sidebar merge ⇒ app.syncSessionIdentity ⇒ the chip), two frames in
      // ONE evaluation so no real broadcast can land between them; the real list is put back after the look.
      console.log('billing chip on the phone follows the member');
      const poolAuth = (member, id, extra = {}) => ({ source: 'pooled', name: '全部', poolTarget: member, poolTargetId: id, placement: 'automatic', priorityRank: null, pinned: null, pinnedId: null, poolDefault: 'Alpha Max', ...extra });
      const feed = (auth) => `(() => { const base = app.sidebar._webuiSessions || []; if (!base.some((r) => r.id === ${JSON.stringify(sid)})) return false; app.ws.ws.onmessage({ data: JSON.stringify({ type: 'active-sessions', sessions: base.map((r) => (r.id === ${JSON.stringify(sid)} ? { ...r, auth: ${JSON.stringify(auth)} } : r)) }) }); return true; })()`;
      const chipNow = `(() => { const el = document.querySelector('.window-active .chat-view .chat-status-bar .chat-status-billing'); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { text: ([...el.querySelectorAll(':scope > span')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent).join('') || el.textContent), title: el.getAttribute('title') || '', pooled: el.classList.contains('pooled'), w: Math.round(r.width), l: Math.round(r.left), r: Math.round(r.right), display: cs.display, clipped: el.scrollWidth > el.clientWidth + 1 }; })()`;
      const realRows = await evalJs(`JSON.stringify(app.sidebar._webuiSessions || [])`);
      const walk = await evalJs(`(() => {
        const fed0 = ${feed(poolAuth('Alpha Max', 'acct-a'))};
        const el0 = document.querySelector('.window-active .chat-view .chat-status-bar .chat-status-billing');
        const a = ${chipNow};
        const fed1 = ${feed(poolAuth('Beta Max', 'acct-b'))};
        const el1 = document.querySelector('.window-active .chat-view .chat-status-bar .chat-status-billing');
        const b = ${chipNow};
        return { fed: fed0 && fed1, a, b, same: !!el0 && el0 === el1 };
      })()`);
      check(`a stub active-sessions frame through the page's own socket puts the pooled identity on the phone chip (${JSON.stringify(walk.a?.text)})`, walk.fed && walk.a && walk.a.pooled && walk.a.text === '⣿ 全部 → Alpha Max', walk);
      check(`after a per-session switch (the SAME pool, member B) the chip names B (${JSON.stringify(walk.b?.text)}) — the owner's phone kept A`, walk.b && walk.b.text === '⣿ 全部 → Beta Max' && /currently billing Beta Max/.test(walk.b.title), walk);
      check('…patched IN PLACE: the same chip node (the keyed-chip law)', walk.same && walk.b.display !== 'none', walk);
      // the phone's status bar scrolls sideways (chat.css ≤768px): bring the chip into view as a finger would
      await evalJs(`document.querySelector('.window-active .chat-view .chat-status-bar .chat-status-billing').scrollIntoView({ block: 'nearest', inline: 'nearest' }); true`);
      await sleep(400); // a frame for the look
      await shot('billing-chip-member-b.png');
      const after = await evalJs(chipNow);
      check(`the screenshot's chip still reads B, inside the ${VW} px viewport (${JSON.stringify(after?.text)} at ${after?.l}–${after?.r}; ${SHOTS}/billing-chip-member-b.png)`, after && after.text === '⣿ 全部 → Beta Max' && after.l >= 0 && after.r <= VW, after);
      await evalJs(`(() => { const sessions = JSON.parse(${JSON.stringify(realRows)}); app.ws.ws.onmessage({ data: JSON.stringify({ type: 'active-sessions', sessions }) }); return true; })()`);
      check('the real list put back: the chip no longer claims a pool', await waitFor(`!document.querySelector('.window-active .chat-view .chat-status-billing')?.classList.contains('pooled')`, 3000));
    }
    try { liveWs.close(); } catch {}
  }

  // ── THE MODEL CHIP NAMES WHAT THE SERVER SAYS (lane fable-52-cli-321 r4, law A; 主开发's scene, 2026-11-10) ──
  // The owner's phone read «🔒 claude-fable-5-1» on the coordinator conversation: locked on fable[1m], its newest turns served by
  // claude-fable-5-2, its OLDER ones (before the CLI update) by claude-fable-5-1 — no 5-1 in the server's facts. The base drew it
  // from an OLD init record (each turn's init names the model it ran; a drawn init set the bar's model) once the virtual scroll
  // loaded the older history AFTER the newest. Here: the same conversation live (the stub above, the real wrapper), 40 turns of
  // the old CLI then 40 of 2.1.321, locked fable[1m], one turn after the lock; the phone attaches (the tail first), then the older
  // history loads (the view's own jumpToIndex(0) — what the minimap / a scroll up runs) and the reader comes back down.
  console.log('the model chip on a long conversation whose older records were served by 5-1 (law A)');
  {
    const sWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((r) => sWs.on('open', r));
    const frames = [];
    sWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    sWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, model: 'fable[1m]', reqId: 'scene51' }));
    let sid = null;
    for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created' && m.reqId === 'scene51'); if (f) sid = f.sessionId; else await sleep(250); }
    check('the scene conversation is created live through the real spawn path (stub CLI, model fable[1m])', !!sid, frames.slice(-3).map((f) => JSON.stringify(f).slice(0, 200)).join('\n'));
    if (sid) {
      const say = async (text, ms) => { sWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text })); await sleep(ms); };
      await say('PRE 40', 4000); await say('POST 40', 4000);
      sWs.send(JSON.stringify({ type: 'set-model', sessionId: sid, lock: true, lockModel: 'fable[1m]' })); await sleep(1000);
      await say('after the lock', 2500);
      await evalJs(`app.attachSession(${JSON.stringify(sid)}, 'scene 5-1', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
      const VIEW = `[...(app.sessions?.values?.() || [])].find((v) => v && v._statusBar && v._statusBar._sessionId === ${JSON.stringify(sid)})`;
      check('the scene window attaches on the phone', await waitFor(`!!(${VIEW}) && !!(${VIEW})._statusBar.element.querySelector('[data-chip="model"]') && /served by claude-fable-5-2/.test((${VIEW})._messageList.textContent)`, 20000));
      const look = `(() => { const v = ${VIEW}; const el = v._statusBar.element.querySelector('[data-chip="model"]'); const txt = v._messageList.textContent;
        return { text: el.textContent.trim(), amber: /chat-status-model-fallback/.test(el.className), locked: !!v._statusBar._modelLocked,
          old: (txt.match(/old turn \\d+ served by claude-fable-5-1/g) || []).length, neu: (txt.match(/new turn \\d+ served by claude-fable-5-2/g) || []).length }; })()`;
      const tail = await evalJs(look);
      // (round 14: WHILE A LOCK STANDS the chip is master's code — a page that attached after the served change names the lock's target)
      check(`at the tail (the newest records drawn first): the locked chip is master's — the lock's target for a page that never saw a served change, «${tail.text}» — plain, never an older record's 5-1`, tail.locked && !tail.amber && (tail.text.includes('fable[1m]') || /claude-fable-5-2/.test(tail.text)) && !/5-1/.test(tail.text), tail);
      await evalJs(`(async () => { await (${VIEW}).jumpToIndex(0); return true; })()`);
      const drewOld = await waitFor(`/old turn 1 served by claude-fable-5-1/.test((${VIEW})._messageList.textContent)`, 15000);
      await sleep(600);
      const older = await evalJs(look);
      await shot('model-chip-older-history.png');
      check(`…the older history loaded AFTER the newest (the pre-update turns drawn: ${older.old} served by claude-fable-5-1, their inits with them)`, drewOld && older.old > 0, older);
      check(`…and the chip still names what the server says, «${older.text}» — never an older record's model (the base read «🔒 claude-fable-5-1»)`, older.text === tail.text && !older.amber && !/5-1/.test(older.text), { tail, older });
      await evalJs(`(async () => { await (${VIEW}).jumpToBottom({ user: true }); return true; })()`); await sleep(800);
      const down = await evalJs(look);
      check(`…and back down at the tail: «${down.text}», unchanged`, down.text === tail.text && !down.amber, down);

      // ── THE LOCK PRESS AND THE TYPED /model, by real taps on this phone (lane fable-52-cli-321 r5, MUST 1 + 2) ──
      // client A = this test's own socket (what another device's bar sends: a pick frame, the person's chat-input); client B =
      // the phone page, its Lock row tapped for real. The frames the phone's bar sends are recorded at its socket.
      const B = `(${VIEW})._statusBar`;
      await evalJs(`(() => { const b = ${B}; const send = b._ws.send.bind(b._ws); window.__f52sent = []; b._ws.send = (f) => { window.__f52sent.push(JSON.parse(JSON.stringify(f))); return send(f); }; return true; })()`);
      const facts = () => evalJs(`(() => { const b = ${B}; const el = b.element.querySelector('[data-chip="model"]'); return { text: el.textContent.trim(), amber: /chat-status-model-fallback/.test(el.className), ask: b._statusModel, locked: !!b._modelLocked, lockedModel: b._lockedModel, askSeq: b._askSeq, servedSeq: b._servedSeq, served: b._servedModel }; })()`);
      const tapLock = async () => {
        await evalJs(`(() => { document.querySelectorAll('.chat-status-dropdown').forEach((d) => d.remove()); return true; })()`);
        await tap('.window-active .chat-view .chat-status-model'); await sleep(300);
        await tap('.chat-status-dropdown .chat-status-dropdown-lock'); await sleep(900);
      };
      const lockFrames = async () => (await evalJs('window.__f52sent')).filter((f) => f && f.type === 'set-model');
      let mi = 0;
      const typeIn = async (text, ms = 2500) => { sWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text, msgId: 'f52-' + (++mi) })); await sleep(ms); };
      await tapLock();                                                     // unlock (the scene was locked on fable[1m])
      const u0 = await facts();
      await typeIn('/model opus', 1500); await typeIn('a turn after /model opus');
      const t1 = await facts();
      check(`MUST 2 (between turns — round 15: the server writes nothing): /model opus typed, then a turn served by opus ⇒ the chip names what the CLI reported (its next init), plain «${t1.text}»`, !u0.locked && t1.ask === 'claude-opus-5-5' && !t1.amber && t1.text === 'claude-opus-5-5', { u0, t1 });
      await tapLock(); const l1 = await facts(); const f1 = (await lockFrames()).slice(-1)[0];
      await typeIn('a turn after the lock'); const l1t = await facts();
      check(`MUST 1 (round 13, master's Lock): the Lock tapped on the phone sends master's frame — no model to switch to, its lockModel what the chip shows (${JSON.stringify(f1)}) — and the hub locks THAT: claude-opus-5-5, the model the CLI reported; the next turn stays plain «${l1t.text}»`, !!f1 && f1.lock === true && !('model' in f1) && f1.lockModel === 'claude-opus-5-5' && l1.locked && l1.lockedModel === 'claude-opus-5-5' && l1t.lockedModel === 'claude-opus-5-5' && !l1t.amber && l1t.text.includes('claude-opus-5-5'), { f1, l1, l1t });
      await tapLock();                                                     // unlock
      sWs.send(JSON.stringify({ type: 'set-model', sessionId: sid, model: 'sonnet' })); await sleep(1200);   // a pick on client A
      await tapLock(); const l2 = await facts(); const f2 = (await lockFrames()).slice(-1)[0];               // the Lock on client B
      await typeIn('a turn after the pick and the lock'); const l2t = await facts();
      check(`MUST 1 across two clients: a pick of sonnet on A, its LIVE echo, then Lock tapped on B (master's frame: what B's chip shows — the CLI's report of A's pick, as master's echo road showed it) ⇒ locked claude-sonnet-5-5, the chip plain «${l2t.text}»`, !!f2 && !('model' in f2) && f2.lockModel === 'claude-sonnet-5-5' && l2.lockedModel === 'claude-sonnet-5-5' && l2t.lockedModel === 'claude-sonnet-5-5' && !l2t.amber && l2t.text.includes('claude-sonnet-5-5'), { f2, l2, l2t });
      // MUST 2 mid-turn: /model typed while a turn runs is held by the REAL wrapper until the turn ends; the running turn's own
      // old-model record does not drop it
      await tapLock();                                                     // unlock
      await typeIn('SLOW', 600); await typeIn('/model opus', 4500); await typeIn('a turn after the mid-turn /model opus');
      const m1 = await facts();
      check(`MUST 2 (mid-turn, unlocked — round 15): /model opus typed while a turn runs — the CLI takes it after that turn, its next init reports it, plain «${m1.text}» (r4: amber «Auto-fallback» for ever)`, m1.ask === 'claude-opus-5-5' && !m1.amber && m1.text === 'claude-opus-5-5' && !m1.locked, m1);
      await tapLock();                                                     // lock (on opus)
      await typeIn('SLOW', 600); await typeIn('/model sonnet', 4500); await typeIn('a turn after the mid-turn /model sonnet');
      const m2 = await facts();
      check(`MUST 2 (mid-turn, locked — round 14, master's way): /model sonnet is taken but the LOCK STANDS on claude-opus-5-5 (r5's «the lock follows the person» retracted: master's repin re-asks it) — «${m2.text}»`, m2.locked && m2.lockedModel === 'claude-opus-5-5', m2);
      await typeIn('SLOW', 600); await typeIn('/model nope-model', 4500); await typeIn('a turn after the refused /model');
      const m3 = await facts();
      check(`MUST 2 (mid-turn, a model the CLI refuses): dropped — the lock still claude-opus-5-5, the refused id never named «${m3.text}»`, m3.locked && m3.lockedModel === 'claude-opus-5-5' && !/nope/.test(m3.text + m3.ask), m3);
      await shot('model-chip-lock-and-typed.png');
    }
    try { sWs.close(); } catch {}
  }

  // ── #7 switcher: "+" desktop tab, tab long-press, window-row long-press ──
  console.log('#7 desktop management in the switcher');
  await evalJs(`document.getElementById('mobile-nav-title').click(); true`); await sleep(300);
  const sw0 = await evalJs(`(() => { const p = document.querySelector('.mobile-win-switcher'); return { open: !!p, add: !!p?.querySelector('.mobile-desk-add'), tabs: [...(p?.querySelectorAll('.mobile-desk-tab:not(.mobile-desk-add)') || [])].map((t) => t.textContent.trim()), desks: app.desktopManager.desktops.length, rows: p?.querySelectorAll('.mobile-win-row').length, wins: [...app.wm.windows.values()].filter((w) => !w.isMinimized && !w._hiddenByDesktop).length, tabH: Math.round(p?.querySelector('.mobile-desk-add')?.getBoundingClientRect().height || 0), closeBtns: [...(p?.querySelectorAll('.mobile-win-row button:not(.mobile-win-more)') || [])].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) }; })()`);
  check(`the switcher lists ${sw0.desks} desktop tab(s) + a "+" tab (≥ 36 px) and one row per window on this desktop (${sw0.rows} of ${sw0.wins})`, sw0.open && sw0.add && sw0.tabs.length === sw0.desks && sw0.tabH >= 36 && sw0.rows === sw0.wins && sw0.rows >= 3, sw0);
  check(`every window row's ✕ is ≥ 36×36 (r2; was 32×32: ${sw0.closeBtns.map((b) => b.join('×')).join(', ')})`, sw0.closeBtns.length === sw0.rows && sw0.closeBtns.every(([w, h]) => w >= 36 && h >= 36), sw0.closeBtns);
  await evalJs(`document.querySelector('.mobile-win-switcher .mobile-desk-add').click(); true`); await sleep(1200);
  const sw1 = await evalJs(`(() => { const p = document.querySelector('.mobile-win-switcher'); return { open: !!p, tabs: [...(p?.querySelectorAll('.mobile-desk-tab:not(.mobile-desk-add)') || [])].map((t) => t.textContent.trim()), desks: app.desktopManager.desktops.length, active: app.desktopManager.activeDesktopId, lastId: app.desktopManager.desktops[app.desktopManager.desktops.length - 1].id }; })()`);
  check(`"+" creates a desktop and switches to it (${sw1.desks} desktops, tabs: ${sw1.tabs.join(' | ')})`, sw1.open && sw1.desks === sw0.desks + 1 && sw1.tabs.length === sw1.desks && sw1.active === sw1.lastId, sw1);
  await longPress('.mobile-win-switcher .mobile-desk-tab:not(.mobile-desk-add)');
  const deskMenu = await evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].map((el) => ({ label: (el.querySelector('.door-label') || el).textContent.trim(), why: el.querySelector('.door-why')?.textContent.trim() || '', off: el.classList.contains('disabled') }))`);
  // lane desktop-doors-table: the desktop's doors are THE table's (src/desktop-switch.js) — the first desktop's Move up greyed WITH its why
  check(`a long-press on a desktop tab offers the desktop's doors — Rename… / Delete / Move up / Move down, the first one's Move up greyed with its why (${deskMenu.map((x) => x.label + (x.off ? ' [' + x.why + ']' : '')).join(' / ')})`,
    JSON.stringify(deskMenu.map((x) => x.label)) === JSON.stringify(['Rename…', 'Delete', 'Move up', 'Move down']) && deskMenu[2].off && deskMenu[2].why === 'Already the first desktop' && !deskMenu[0].off && !deskMenu[1].off && !deskMenu[3].off, deskMenu);
  check('…and the switcher stays open underneath (a child popover is not a dismissal)', await evalJs(`!!document.querySelector('.mobile-win-switcher')`));
  await evalJs(`[...document.querySelectorAll('.context-menu .context-menu-item')].find((el) => el.textContent.trim() === 'Delete').click(); true`); await sleep(1200);
  check('Delete removes the new desktop and the tabs re-render', await evalJs(`app.desktopManager.desktops.length === ${sw0.desks} && document.querySelectorAll('.mobile-win-switcher .mobile-desk-tab:not(.mobile-desk-add)').length === ${sw0.desks}`));
  // a second desktop so Move to Desktop has a target, then the window-row menu
  await evalJs(`app.desktopManager.createDesktop('Second'); true`); await sleep(300);
  await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); document.getElementById('mobile-nav-title').click(); true`); await sleep(300);
  await longPress('.mobile-win-switcher .mobile-win-row');
  const winMenu = await evalJs(`[...document.querySelectorAll('.taskbar-context-menu > .taskbar-context-menu-item')].map((el) => el.textContent.trim())`);
  check(`a long-press on a window row opens the 'window' menu incl. Move to Desktop and Close (${winMenu.join(' / ')})`, winMenu.some((x) => /Move to Desktop/.test(x)) && winMenu.some((x) => /Close/.test(x)), winMenu);
  await escape(); await evalJs(`document.querySelectorAll('.taskbar-context-menu').forEach((m) => m.remove()); document.querySelector('.mobile-win-switcher')?.remove(); true`);

  // ── #W THE WAITING DOORS (lane phone-take-photo; the owner 2026-11-10 17:10Z, phone: «在手机上那个闪烁功能不能 reflect 到 desktop 跟对话的
  // 那个下拉选单里，所以我并不能看出来现在有消息在等我。»): a conversation that WAITS for the person is said at every door that lists it — the
  // closed Desktops door (and ⋯ when it folds), the title switcher's desktop tab + conversation row, the Desktops sheet's desktop row
  // (rolled up) — LIVE, patched in place; the conversation on show is never shouted. r2 (主开发 00:43Z): a turn's start ends it with no
  // focus; reaching it through a door that said «it waits» is seeing it; the tap lands where the row says (live); ⋯ says the words;
  // under reduced motion a row / tab keeps a standing mark. PNGs: WAITING_PNG_DIR (default: the shots dir), <WAITING_TAG|after>-*.png
  console.log('#W the waiting doors (a conversation waits on ANOTHER desktop, one on this one)');
  {
    const PNG = process.env.WAITING_PNG_DIR || SHOTS, TAG = process.env.WAITING_TAG || 'after';
    // the Desktops sheet by the finger's route as the bar stands: the door on the bar, or ⋯ → Desktops when it is folded
    const openDesks = async () => { const onBar = await evalJs(`(() => { const r = document.getElementById('mobile-nav-desktops')?.getBoundingClientRect(); return !!(r && r.width > 0 && r.height > 0); })()`);
      if (onBar) return tap('#mobile-nav-desktops');
      await tap('#mobile-nav-overflow'); await sleep(300); return tap('.mnav-more-menu .context-menu-item[data-key="desktops"]'); };
    const snap = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(PNG, `${TAG}-${name}.png`), Buffer.from(r.data, 'base64')); console.log('    (PNG ' + path.join(PNG, `${TAG}-${name}.png`) + ')'); } catch { } };
    const errs0 = pageErrors.length;
    const WAITW = /\b2 waiting for input\b|2 个等待输入|2 件が入力待ち/, WAIT1 = /\b1 waiting for input\b|1 个等待输入|1 件が入力待ち/;
    await evalJs(`document.querySelectorAll('.mobile-win-switcher, .mdesk-menu, .context-menu').forEach((m) => m.remove()); true`);
    const S = await evalJs(`(async () => {
      const dm = app.desktopManager, wm = app.wm, here = dm.activeDesktopId, other = dm.desktops.find((d) => d.id !== here)?.id;
      const shown = wm.activeWindowId, cand = [...wm.windows.values()].filter((w) => w._desktopId === here && w.id !== shown && !w._tabChain && typeof w._notifyChanged === 'function');
      const a = cand.find((w) => w.type === 'chat' && app.sessions && app.sessions.get(w.id)) || cand[0], b = cand.find((w) => w !== a && app.sessions && app.sessions.get(w.id)) || cand.find((w) => w !== a);
      if (!other || !a || !b) return { other, a: !!a, b: !!b };
      dm.moveWindowToDesktop(a.id, other);
      await new Promise((r) => setTimeout(r, 500));
      // a window ON SHOW on this desktop, neither of the two (the #7 leg can leave none active); the legs land on B and come back to
      // it — its short title keeps the Desktops door on the bar (the folded door is ⋯'s own leg below)
      const keep = (shown && wm.windows.get(shown)?._desktopId === here ? shown : null) || [...wm.windows.values()].find((w) => w._desktopId === here && !w._tabChain && w.id !== a.id && w.id !== b.id)?.id || null;
      const title0 = keep ? wm.windows.get(keep).title : null;
      if (keep) { wm.setTitle(keep, 'Here'); if (wm.activeWindowId !== keep) wm.revealWindow(keep); await new Promise((r) => setTimeout(r, 400)); }
      return { here, other, a: a.id, aTitle: a.title, aView: !!(app.sessions && app.sessions.get(a.id) && app.sessions.get(a.id)._turnStarted), b: b.id, bView: !!(app.sessions && app.sessions.get(b.id)), shown: wm.activeWindowId, keep, title0 };
    })()`);
    // a turn ENDS by the conversation's own road (the same marks chat-view's turn_complete makes)
    const waitOn = (id) => evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(id)}); w.element.classList.remove('window-active'); w.element.classList.add('window-waiting'); (w._waitWhy ||= new Set()).add('turn'); w._notifyChanged(); return true; })()`);
    const waitOff = (id) => evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(id)}); w.element.classList.remove('window-waiting'); w._waitWhy?.clear(); w._notifyChanged(); return true; })()`);
    const waits = (id) => evalJs(`app.wm.windows.get(${JSON.stringify(id)}).element.classList.contains('window-waiting')`);
    check('setup: two desktops, a conversation moved to the other one and one more on this one (real conversations, their views live); a third window on show', !!(S.other && S.a && S.b && S.aView && S.keep && S.shown === S.keep), S);
    await waitOn(S.a); await waitOn(S.b); await sleep(400);
    const DOOR = `(() => { const b = document.getElementById('mobile-nav-desktops'), d = b && b.querySelector(':scope > .mnav-wait-dot'), r = d && d.getBoundingClientRect(); return { on: !!b && b.classList.contains('mnav-waiting'), dot: !!(r && r.width > 0), label: b ? b.getAttribute('aria-label') || '' : '' }; })()`;
    const d0 = await evalJs(DOOR);
    check(`THE CLOSED DOOR: the Desktops button wears the yellow dot and says it («${d0.label}»)`, d0.on && d0.dot && WAITW.test(d0.label), d0);
    await snap('waiting-door');
    // the title switcher: the tabs roll it up, the waiting row says it (a blink + a standing dot); the row on show does not
    await evalJs(`document.getElementById('mobile-nav-title').click(); true`); await sleep(400);
    const SW = `(() => { const p = document.querySelector('.mobile-win-switcher'); if (!p) return null; const tab = (id) => p.querySelector('.mobile-desk-tab[data-desktop-id="' + id + '"]'), row = (id) => p.querySelector('.mobile-win-row[data-win-id="' + id + '"]'), dot = (e) => !!e && !!e.querySelector(':scope > .mnav-wait-dot');
      return { tabOther: !!tab(${JSON.stringify(S.other)})?.classList.contains('waiting'), tabHere: !!tab(${JSON.stringify(S.here)})?.classList.contains('waiting'), rowB: !!row(${JSON.stringify(S.b)})?.classList.contains('waiting'), rowShown: !!row(${JSON.stringify(S.shown)})?.classList.contains('waiting'), dots: [dot(tab(${JSON.stringify(S.other)})), dot(row(${JSON.stringify(S.b)}))] }; })()`;
    const sw0 = await evalJs(SW);
    check('THE TITLE SWITCHER: both tabs roll it up; the waiting conversation\'s row says it (blink + standing dot); the row on show does not', sw0 && sw0.tabOther && sw0.tabHere && sw0.rowB && !sw0.rowShown && sw0.dots.every(Boolean), sw0);
    await snap('waiting-switcher');
    // r2 smaller: REDUCED MOTION — the overlay's one cycle ends at opacity 0; the standing dot stays
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }, { name: 'prefers-reduced-motion', value: 'reduce' }] }); await sleep(500);
    const rm = await evalJs(`(() => { const r = document.querySelector('.mobile-win-row[data-win-id="${S.b}"]'), d = r && r.querySelector(':scope > .mnav-wait-dot'), t = document.querySelector('.mobile-desk-tab[data-desktop-id="${S.other}"] > .mnav-wait-dot'); const op = (e) => e ? Number(getComputedStyle(e).opacity) : -1, w = (e) => e ? Math.round(e.getBoundingClientRect().width) : 0; return { row: op(d), tab: op(t), rw: w(d), tw: w(t), rm: matchMedia('(prefers-reduced-motion: reduce)').matches }; })()`);
    check(`REDUCED MOTION keeps a standing mark on the waiting row and tab (dot opacity ${rm.row} / ${rm.tab})`, rm.rm && rm.row >= 0.99 && rm.tab >= 0.99 && rm.rw > 0 && rm.tw > 0, rm);
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }); await sleep(200);
    // LIVE in place: B's waiting ends while the list is open
    await evalJs(`window.__wdRow = document.querySelector('.mobile-win-row[data-win-id="${S.b}"]'); true`); await waitOff(S.b); await sleep(400);
    const sw1 = await evalJs(`(() => { const r = document.querySelector('.mobile-win-row[data-win-id="${S.b}"]'); return { same: r === window.__wdRow, waiting: !!r?.classList.contains('waiting'), dot: !!r?.querySelector(':scope > .mnav-wait-dot'), tabHere: !!document.querySelector('.mobile-desk-tab[data-desktop-id="${S.here}"]')?.classList.contains('waiting') }; })()`);
    check('…LIVE: its waiting ends while the list is open ⇒ the SAME row node drops the mark and its dot; this desktop\'s tab too', sw1.same && !sw1.waiting && !sw1.dot && !sw1.tabHere, sw1);
    // r2 ②: a tap on a waiting ROW is seeing it — B waits again, its row is tapped: B on show, its waiting gone on this device
    await waitOn(S.b); await sleep(400);
    await tap(`.mobile-win-switcher .mobile-win-row[data-win-id="${S.b}"]`); await sleep(700);
    const rowTap = await evalJs(`({ shown: app.wm.activeWindowId, waits: app.wm.windows.get(${JSON.stringify(S.b)}).element.classList.contains('window-waiting') })`);
    check('…a tap on the waiting row lands on it and IS seeing it: on show, its waiting gone on this device (no press inside needed)', rowTap.shown === S.b && !rowTap.waits, rowTap);
    await evalJs(`app.wm.revealWindow(${JSON.stringify(S.shown)}); true`); await sleep(500);
    const away = await evalJs(`({ shown: app.wm.activeWindowId, waits: app.wm.windows.get(${JSON.stringify(S.b)}).element.classList.contains('window-waiting'), label: document.getElementById('mobile-nav-desktops').getAttribute('aria-label') || '' })`);
    check(`…and switching away brings no dot back for it (it was seen): it waits no more; the door counts only the other desktop's («${away.label}»)`, away.shown === S.shown && !away.waits && WAIT1.test(away.label), away);
    await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); true`);
    // the Desktops sheet: A waits on the other desktop — the row rolls it up, names it first; live in place
    const SH = `(() => { const m = document.querySelector('.mdesk-menu'); if (!m) return null; const row = (id) => m.querySelector(':scope > .context-menu-item[data-desktop-id="' + id + '"]'), o = row(${JSON.stringify(S.other)}), h = row(${JSON.stringify(S.here)});
      return { other: !!o?.classList.contains('mdesk-waiting'), words: o?.querySelector('.mdesk-wait')?.textContent || '', titles: o?.querySelector('.mdesk-titles')?.textContent || '', here: !!h?.classList.contains('mdesk-waiting'), h: o ? Math.round(o.getBoundingClientRect().height) : 0 }; })()`;
    await openDesks(); await sleep(400);
    const sh0 = await evalJs(SH);
    check(`THE DESKTOPS SHEET: the other desktop's row rolls it up — the mark, «${sh0 && sh0.words}», the waiting conversation named first; this desktop's row (nothing waits there now) says nothing`, !!sh0 && sh0.other && WAIT1.test(sh0.words) && sh0.titles.startsWith(S.aTitle || '\u0000') && !sh0.here && sh0.h >= 44, sh0);
    await snap('waiting-sheet');
    await evalJs(`window.__wdMenu = document.querySelector('.mdesk-menu'); window.__wdSheetRow = window.__wdMenu.querySelector(':scope > .context-menu-item[data-desktop-id="${S.other}"]'); true`); await waitOff(S.a); await sleep(400);
    const sh1 = await evalJs(`(() => { const m = document.querySelector('.mdesk-menu'), r = m && m.querySelector(':scope > .context-menu-item[data-desktop-id="${S.other}"]'); return { sameMenu: m === window.__wdMenu, sameRow: r === window.__wdSheetRow, waiting: !!r?.classList.contains('mdesk-waiting'), words: !!r?.querySelector('.mdesk-wait'), door: document.getElementById('mobile-nav-desktops').classList.contains('mnav-waiting') }; })()`);
    check('…LIVE: its waiting ends while the sheet is open ⇒ the SAME sheet and row drop the mark and the words; the closed door drops its dot', sh1.sameMenu && sh1.sameRow && !sh1.waiting && !sh1.words && !sh1.door, sh1);
    // r2 ③a: it STARTS waiting while the sheet is open ⇒ patched to say so, and its tap lands on IT (the live facts, not the open's)
    await waitOn(S.a); await sleep(400);
    const sh2 = await evalJs(SH);
    check('…and it starts again while the sheet is open ⇒ the mark and the words come back in place', !!sh2 && sh2.other && WAIT1.test(sh2.words), sh2);
    await tap(`.mdesk-menu .context-menu-item[data-desktop-id="${S.other}"]`); await sleep(1200);
    const land = await evalJs(`({ desk: app.desktopManager.activeDesktopId, shown: app.wm.activeWindowId, door: document.getElementById('mobile-nav-desktops').classList.contains('mnav-waiting'), title: document.getElementById('mobile-nav-title').textContent, waits: app.wm.windows.get(${JSON.stringify(S.a)}).element.classList.contains('window-waiting') })`);
    check(`a tap on the row that STARTED waiting after the open LANDS on that conversation («${land.title}») — read from the live facts`, land.desk === S.other && land.shown === S.a, land);
    check('…and the landing IS seeing it: its waiting is gone on this device (no press inside), no door shouts', !land.waits && !land.door, land);
    await evalJs(`app._mobileNav.switchDesktop(${JSON.stringify(S.here)}); true`); await sleep(1200);
    check('…switching away brings no dot back (it was seen)', !(await evalJs(DOOR)).on);
    // r3 ① THE GAP: the turn completes (the real op) — a re-attach restates «streaming» (+ «thinking...»: the label every attach path
    // applies), a background tail's label, the idle — it STILL waits; the next turn's record (a turn past the completed one) ends it
    const STATE = `({ waits: app.wm.windows.get(${JSON.stringify(S.a)}).element.classList.contains('window-waiting'), door: document.getElementById('mobile-nav-desktops').classList.contains('mnav-waiting'), shown: app.wm.activeWindowId })`;
    const onA = async (js) => { await evalJs(`(() => { const v = app.sessions.get(${JSON.stringify(S.a)}); ${js}; return true; })()`); await sleep(350); return evalJs(STATE); };
    const g0 = await onA(`v._onOp({ op: 'meta', subtype: 'turn_complete', data: { cost: 0, modelUsage: null } })`);
    const g1 = await onA(`v._onServerStreamLabel('thinking...', null)`);
    const g2 = await onA(`v._onServerStreamLabel('Running a background agent…', null)`);
    const g3 = await onA(`v._onServerStreamLabel('', null)`);
    check('THE GAP: the turn completes, a re-attach restates «streaming» + «thinking...», a background tail, the idle ⇒ it STILL waits here and the closed door still says it', g0.waits && g1.waits && g2.waits && g3.waits && g3.door, { g0, g1, g2, g3 });
    const g4 = await onA(`v._onOp({ op: 'create', message: { id: 'wd-next-' + Date.now(), role: 'user', status: 'complete', turnIndex: Math.max(v._turnSeqState?.max || 0, ...v._messages.map((m) => m.turnIndex || 0)) + 1, content: [{ type: 'text', text: 'the answer' }], ts: Date.now() } })`);
    check('THE NEXT TURN STARTS (the person answered elsewhere: its record — a turn past the completed one — reaches this client) ⇒ the finished-turn mark ends HERE with no focus, and the door goes quiet', !g4.waits && g4.shown !== S.a && !g4.door, g4);
    // r3 ②: THE SWITCHER'S DESKTOP TAB said it waits — its landing on the waiting conversation IS seeing it
    await waitOn(S.a); await sleep(400);
    await evalJs(`document.getElementById('mobile-nav-title').click(); true`); await sleep(400);
    const tb0 = await evalJs(`(() => { const t = document.querySelector('.mobile-win-switcher .mobile-desk-tab[data-desktop-id="${S.other}"]'); return { waiting: !!t?.classList.contains('waiting'), dot: !!t?.querySelector(':scope > .mnav-wait-dot'), remembered: app._mobileNav._shown?.[${JSON.stringify(S.other)}] || null }; })()`);
    await tap(`.mobile-win-switcher .mobile-desk-tab[data-desktop-id="${S.other}"]`); await sleep(1200);
    const tb1 = await evalJs(`({ desk: app.desktopManager.activeDesktopId, shown: app.wm.activeWindowId, waits: app.wm.windows.get(${JSON.stringify(S.a)}).element.classList.contains('window-waiting') })`);
    check('THE SWITCHER\'S TAB that wears the dot lands on its desktop\'s remembered window — the waiting conversation — and that landing IS seeing it', tb0.waiting && tb0.dot && tb0.remembered === S.a && tb1.desk === S.other && tb1.shown === S.a && !tb1.waits, { tb0, tb1 });
    await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); app._mobileNav.switchDesktop(${JSON.stringify(S.here)}); true`); await sleep(1200);
    check('…and switching away from it brings no dot back (it was seen)', !(await evalJs(DOOR)).on);
    // ⋯ standing in for a folded Desktops door: the dot AND the words (its name; its menu's Desktops row)
    await waitOn(S.a); await sleep(300);
    const shownNow = await evalJs('app.wm.activeWindowId'), tTitle = await evalJs(`(() => { const w = app.wm.windows.get(app.wm.activeWindowId); return w ? w.title : ''; })()`);
    await evalJs(`app.wm.setTitle(app.wm.activeWindowId, 'A title long enough to fold every chip of this phone bar into the overflow — the waiting doors'); true`); await sleep(800);
    const more = await evalJs(`(() => { const m = document.getElementById('mobile-nav-overflow'), d = m && m.querySelector(':scope > .mnav-wait-dot'), r = d && d.getBoundingClientRect(); return { folded: [...(app._mobileNav._folded || [])], on: !!m?.classList.contains('mnav-waiting'), dot: !!(r && r.width > 0), label: m ? m.getAttribute('aria-label') || '' : '' }; })()`);
    check(`⋯ standing in for a FOLDED Desktops door wears the dot and SAYS it in its name («${more.label}»)`, more.folded.includes('desktops') && more.on && more.dot && WAIT1.test(more.label), more);
    await tap('#mobile-nav-overflow'); await sleep(500);
    const mrow = await evalJs(`(() => { const r = document.querySelector('.mnav-more-menu .context-menu-item[data-key="desktops"]'); return r ? { cls: r.className, text: r.textContent.replace(/\\s+/g, ' ').trim(), dot: !!r.querySelector(':scope > .mnav-wait-dot') } : null; })()`);
    check(`…and inside ⋯ the Desktops row says what its door says («${mrow && mrow.text}»), marked`, !!mrow && /mnav-more-waiting/.test(mrow.cls) && WAIT1.test(mrow.text) && mrow.dot, mrow);
    await snap('waiting-more');
    await escape(); await evalJs(`document.querySelectorAll('.mnav-more-menu').forEach((m) => m.remove()); true`);
    await evalJs(`app.wm.setTitle(${JSON.stringify(shownNow)}, ${JSON.stringify(tTitle)}); true`); await sleep(500);
    // back as it was for the legs below: the conversation home again, nothing waiting
    await evalJs(`(async () => { const wm = app.wm; for (const id of [${JSON.stringify(S.a)}, ${JSON.stringify(S.b)}]) { const w = wm.windows.get(id); if (w) { w.element.classList.remove('window-waiting'); w._waitWhy?.clear(); } } app.desktopManager.moveWindowToDesktop(${JSON.stringify(S.a)}, ${JSON.stringify(S.here)}); app.updateTaskbar(); return true; })()`); await sleep(600);
    if (S.keep && S.title0 != null) { await evalJs(`app.wm.windows.get(${JSON.stringify(S.keep)}) && app.wm.setTitle(${JSON.stringify(S.keep)}, ${JSON.stringify(S.title0)}); true`); await sleep(300); }
    check('#W drew no uncaught page exception', pageErrors.length === errs0, pageErrors.slice(errs0, errs0 + 3));
  }

  // ── #10 terminal key row: every key inside the viewport, Copy screen present ──
  console.log('#10 terminal key row');
  await evalJs(`app.openShellTerminal(); true`);
  const termUp = await waitFor(`document.querySelectorAll('.window-active .mobile-term-keys .mobile-term-key').length >= 16`, 25000);
  check('a plain shell terminal opens on the phone (real dtach session)', termUp);
  if (termUp) {
    const keys = await evalJs(`(() => { const ks = [...document.querySelectorAll('.window-active .mobile-term-keys .mobile-term-key')]; const row = document.querySelector('.window-active .mobile-term-keys');
      return { n: ks.length, rects: ks.map((k) => { const r = k.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }; }), copy: !!row.querySelector('.mobile-term-copy'), emoji: /[\\u{1F300}-\\u{1FAFF}]/u.test(row.textContent), rowScroll: row.scrollWidth, rowClient: row.clientWidth }; })()`);
    check(`all ${keys.n} keys sit inside the viewport (max right ${Math.max(...keys.rects.map((r) => r.r))} ≤ ${VW}; row ${keys.rowScroll}/${keys.rowClient})`, keys.rects.every((r) => r.l >= 0 && r.r <= VW + 1) && keys.rowScroll <= keys.rowClient + 1, keys);
    check(`every key is ≥ 36×36 px (min ${Math.min(...keys.rects.map((r) => r.h))} tall / ${Math.min(...keys.rects.map((r) => r.w))} wide)`, keys.rects.every((r) => r.h >= 36 && r.w >= 36), keys.rects);
    check('the row carries a Copy-screen key and no emoji glyph (SVG icons only)', keys.copy && !keys.emoji, keys);
    // Copy screen reads the buffer: with nothing rendered yet it must SAY so rather than copy '' silently
    await sleep(1200); // let the shell paint its first lines
    await evalJs(`navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }; document.querySelector('.window-active .mobile-term-copy').click(); true`);
    await sleep(300);
    const copied = await evalJs(`({ toasts: [...document.querySelectorAll('.global-toast')].map((t) => t.textContent.trim()), text: window.__copied == null ? null : String(window.__copied) })`);
    const m = copied.toasts.map((t) => t.match(/Copied (\d+) lines/)).find(Boolean);
    const lines = copied.text == null ? null : copied.text.split('\n');
    check(`tapping Copy screen copies the visible rows and SAYS so (toast "${m ? m[0] : copied.toasts.join('|')}", ${lines ? lines.length : 'no'} lines reached the clipboard, trailing blank lines dropped)`, !!m && lines && lines.length === Number(m[1]) && lines[lines.length - 1].trim() !== '' && copied.text.trim().length > 0, { toasts: copied.toasts, head: (copied.text || '').slice(0, 80) });
  }

  // ── a SECOND client: a 1280×800 desktop page on the same server (r2, the
  // verifier's A/B harness). A phone's layout saves reach it live and its
  // saves reach the phone; every cross-client leg below asserts on BOTH ends. ──
  console.log('a desktop client joins');
  const dTarget = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const desk = await connectPage(dTarget.webSocketDebuggerUrl);
  await desk.cdp('Runtime.enable'); await desk.cdp('Page.enable');
  await desk.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await desk.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await desk.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await desk.waitApp();
  // layout.js keeps `_restoring` for 5 s after a boot restore and DROPS every
  // inbound layout-sync meanwhile (measured: the phone's first save after the
  // join was never applied) — wait it out before the phone sends anything
  await desk.waitFor('!app.layoutManager._restoring && !(app.desktopManager && app.desktopManager._restoring)', 15000);
  await sleep(300);
  const denv = await desk.evalJs(`({ mobile: app.isMobile, rail: !!app.sidebar._railEl, tab: app.sidebar._activeTab, iw: innerWidth, wins: app.wm.windows.size, seq: app.layoutManager._lastRemoteSeq })`);
  check(`a desktop client (${denv.iw} px, activity rail ${denv.rail ? 'on' : 'OFF'}, tab '${denv.tab}') joins the same instance (${denv.wins} windows restored from the shared record)`, !denv.mobile && denv.rail && denv.iw === 1280, denv);
  check('lane phone-first-screen: the 1280×800 desktop draws no attention page (its first screen is the desktop\'s own; the seeded ask stays in its tray)', await desk.evalJs(`!app.phoneHome?.shown?.() && !app.phoneHome?.show?.() && getComputedStyle(document.getElementById('phone-home')).display === 'none' && document.getElementById('phone-home').childElementCount === 0`)); // lane duo-build-1: the page is wired on every page (a fold to the phone reaches it) — a desktop never shows it, even asked

  // ── #9 ⚙ System… / Ports… / Channels… land in windows (no rail on a phone) ──
  console.log('#9 gear rows → windows on the phone, WINDOWS on the desktop');
  // a REAL tap on the gear (user-dirty on the phone, so its saves go out)
  // lane phone-titlebar-title: the bar folds ⚙ into its «⋯» while a long title is on show — then the REAL tap is the ⋯'s Settings row (the ⚙'s own press)
  const pressGear = async () => {
    if (await evalJs(`document.getElementById('mobile-nav-gear').getClientRects().length > 0`)) return tap('#mobile-nav-gear');
    await tap('#mobile-nav-overflow'); await sleep(250); return tap('.mnav-more-menu .context-menu-item[data-key="gear"]');
  };
  const gearRows = async () => { await evalJs(`document.querySelector('.global-settings-popover')?.remove(); true`); await pressGear(); await sleep(300); return evalJs(`[...document.querySelectorAll('.global-settings-popover .gs-menu-item')].map((el) => el.textContent.trim())`); };
  const rows = await gearRows();
  check(`the ⚙ menu lists System monitor… / Ports… / Channels… on the phone (${rows.filter((r) => /System monitor…|Ports…|Channels…/.test(r)).join(' / ')})`, ['System monitor…', 'Ports…', 'Channels…'].every((l) => rows.some((r) => r.startsWith(l))), rows);
  const openGear = async (label, sel, type) => {
    const dBefore = await desk.evalJs(`({ tab: app.sidebar._activeTab, open: app.sidebar.isOpen })`);
    // 2.369.129: System monitor… / Ports… are CHILDREN of the System head (accordion: a collapsed .gs-sub) — expand the head first when the row sits in one; a missing row is a named failure, never a page exception
    const found = await evalJs(`(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 20 && !document.querySelector('.global-settings-popover'); i++) await sleep(100); const rows = () => [...document.querySelectorAll('.global-settings-popover .gs-menu-item')]; let el = rows().find((e) => e.textContent.trim().startsWith(${JSON.stringify(label)})); if (!el) return { found: false, rows: rows().map((e) => e.textContent.trim().slice(0, 24)) }; const sub = el.closest('.gs-sub'); if (sub && !sub.classList.contains('open')) { const head = sub.previousElementSibling; if (head && head.classList.contains('gs-menu-item')) { head.click(); await sleep(150); } } el = rows().find((e) => e.textContent.trim().startsWith(${JSON.stringify(label)})); if (!el) return { found: false, rows: rows().map((e) => e.textContent.trim().slice(0, 24)) }; el.click(); return { found: true }; })()`);
    check(`⚙ row ${label} is present on the phone menu (expanded under its head when nested)`, !!found?.found, JSON.stringify(found));
    const ok = await waitFor(`!!document.querySelector('.window-active ${sel}') && [...app.wm.windows.values()].some((w) => w.type === ${JSON.stringify(type)})`, 15000);
    check(`⚙ ${label} opens a '${type}' window hosting the rail panel renderer (${sel})`, ok);
    // r2: the phone's layout save replays it on the rail-bearing desktop as a WINDOW with the same id
    const id = await evalJs(`[...app.wm.windows.values()].find((w) => w.type === ${JSON.stringify(type)})?.id`);
    const mirrored = await desk.waitFor(`[...app.wm.windows.values()].some((w) => w.type === ${JSON.stringify(type)} && w.id === ${JSON.stringify(id)})`, 15000);
    const dAfter = await desk.evalJs(`({ tab: app.sidebar._activeTab, open: app.sidebar.isOpen, railPanel: !!app.sidebar.listEl?.querySelector('.rail-panel-' + ${JSON.stringify(type)}), wins: [...app.wm.windows.values()].filter((w) => w.type === ${JSON.stringify(type)}).map((w) => w.id) })`);
    check(`…and the desktop client (rail on) replays it as a '${type}' WINDOW ${id} — its rail tab stays '${dBefore.tab}', no rail panel, its sidebar does not open by itself`, mirrored && dAfter.tab === dBefore.tab && !dAfter.railPanel && !(dAfter.open && !dBefore.open) && dAfter.wins.length === 1, { dBefore, dAfter, mirrored, id });
    await gearRows();
  };
  await openGear('System monitor…', '.rail-panel-system', 'system');
  await openGear('Ports…', '.rail-panel-ports', 'ports');
  await openGear('Channels…', '.rail-panel-channels .chan-bar', 'channels');   // a4: the panel's bar (chan-head retired)
  await evalJs(`document.querySelector('.global-settings-popover')?.remove(); true`);
  check('opening System monitor… again focuses the existing window (singleton)', await evalJs(`(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const before = app.wm.windows.size; app._showGlobalSettings(document.getElementById('mobile-nav-gear')); for (let i = 0; i < 20 && !document.querySelector('.global-settings-popover'); i++) await sleep(100); const rows = () => [...document.querySelectorAll('.global-settings-popover .gs-menu-item')]; let el = rows().find((e) => e.textContent.trim().startsWith('System monitor…')); const sub = el && el.closest('.gs-sub'); if (sub && !sub.classList.contains('open')) { const head = sub.previousElementSibling; if (head && head.classList.contains('gs-menu-item')) { head.click(); await sleep(150); } el = rows().find((e) => e.textContent.trim().startsWith('System monitor…')); } if (!el) return false; el.click(); await sleep(200); document.querySelector('.global-settings-popover')?.remove(); return app.wm.windows.size === before && app.wm.windows.get(app.wm.activeWindowId)?.type === 'system'; })()`));
  // the desktop's OWN next save must leave the phone's three windows alone
  {
    const phoneBefore = await evalJs(`[...app.wm.windows.values()].filter((w) => ['system', 'ports', 'channels'].includes(w.type)).map((w) => w.type + ':' + w.id).sort()`);
    const pseq = await evalJs(`app.layoutManager._lastRemoteSeq`);
    await settle(desk);
    await desk.userInput();
    await desk.evalJs(`app.openFileExplorer(); true`);
    const arrived = await waitFor(`app.layoutManager._lastRemoteSeq > ${pseq}`, 15000);
    await sleep(800);
    const phoneAfter = await evalJs(`({ three: [...app.wm.windows.values()].filter((w) => ['system', 'ports', 'channels'].includes(w.type)).map((w) => w.type + ':' + w.id).sort(), files: [...app.wm.windows.values()].filter((w) => w.type === 'files').length })`);
    check(`the desktop's next layout save (it opened an explorer; seq ${pseq} → later) reaches the phone and leaves the phone's System / Ports / Channels windows in place (${phoneAfter.three.length} of ${phoneBefore.length}; explorers now ${phoneAfter.files})`, arrived && JSON.stringify(phoneAfter.three) === JSON.stringify(phoneBefore) && phoneAfter.files === 2, { phoneBefore, phoneAfter, arrived });
  }

  // ── #10 minimize: the TRUTH is shared, only the display is local (r2) ──
  console.log('#10 minimize across two clients');
  {
    const filesId = await evalJs(`[...app.wm.windows.values()].find((w) => w.type === 'files')?.id`);
    check('the desktop client mirrors the phone\'s explorer', await desk.waitFor(`app.wm.windows.has(${JSON.stringify(filesId)})`, 15000));
    // the phone shows ANOTHER window (§6b guard 10: a record never takes the phone's window on show off its screen —
    // scripts/test-phone-desktop-sync ④ is that leg); the explorer is minimized by the desktop behind it
    const otherId = await evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w.type !== 'files' && !w.isMinimized && !(w._tabChain && w._tabChain.tabs[0] !== w.id)); if (w) app.wm.focusWindow(w.id); return w?.id || null; })()`); await sleep(300);
    await settle(desk);
    await desk.userInput();
    const dmin = await desk.evalJs(`(() => { app.wm.minimize(${JSON.stringify(filesId)}); const w = app.wm.windows.get(${JSON.stringify(filesId)}); return { min: w.isMinimized, display: w.element.style.display }; })()`);
    check('desktop A/B: minimize on the desktop client hides the window and marks it minimized (unchanged)', dmin.min === true && dmin.display === 'none', dmin);
    const pm = await waitFor(`app.wm.windows.get(${JSON.stringify(filesId)})?.isMinimized === true`, 15000);
    const ps = await evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(filesId)}); const a = app.wm.windows.get(app.wm.activeWindowId); return { min: w?.isMinimized, display: w ? getComputedStyle(w.element).display : null, activeIsIt: app.wm.activeWindowId === ${JSON.stringify(filesId)}, activeType: a?.type, activeShown: a ? getComputedStyle(a.element).display : 'none' }; })()`);
    const activeNow = await evalJs('app.wm.activeWindowId');
    check(`the phone applies the synced minimize as TRUTH (isMinimized true), hides it locally (computed ${ps.display}) and keeps ITS window on show (${ps.activeType}: ${ps.activeShown})`, pm && ps.min === true && ps.display === 'none' && !ps.activeIsIt && ps.activeShown !== 'none' && !!otherId && activeNow === otherId, { ps, otherId, activeNow });
    await tap('#mobile-nav-title'); await sleep(300);
    const swm = await evalJs(`(() => { const p = document.querySelector('.mobile-win-switcher'); return { head: !!p?.querySelector('.mobile-win-minimized-head'), minRows: [...(p?.querySelectorAll('.mobile-win-row.mobile-win-minimized') || [])].map((r) => r.textContent.trim().slice(0, 30)), plain: p?.querySelectorAll('.mobile-win-row:not(.mobile-win-minimized)').length }; })()`);
    check(`the switcher lists it under Minimized (${swm.minRows.join(' | ')}) beside ${swm.plain} plain rows`, swm.head && swm.minRows.length === 1 && swm.plain >= 1, swm);
    // the phone's next save (a real tap focuses another row → z changes → a send) must NOT restore it on the desktop
    const dseq = await desk.evalJs(`app.layoutManager._lastRemoteSeq`);
    await tap('.mobile-win-switcher .mobile-win-row:not(.mobile-win-minimized)');
    const arrived = await desk.waitFor(`app.layoutManager._lastRemoteSeq > ${dseq}`, 15000);
    await sleep(800);
    const dAfter = await desk.evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(filesId)}); return { min: w?.isMinimized, display: w?.element.style.display }; })()`);
    check(`the phone's save arrives on the desktop (seq ${dseq} → later) and the desktop's window STAYS minimized (r1 restored it: min:false rode the phone's save)`, arrived && dAfter.min === true && dAfter.display === 'none', { arrived, dAfter });
    // the phone's restore is ITS view (§6b guard 10, lane phone-arrangement-local): shown here, never written into the desktop's record
    await tap('#mobile-nav-title'); await sleep(300);
    const rowGeo = await evalJs(`(() => { const p = document.querySelector('.mobile-win-switcher'); const r = p?.querySelector('.mobile-win-row.mobile-win-minimized'); if (!p || !r) return null; const pr = p.getBoundingClientRect(), rr = r.getBoundingClientRect(); return { popBottom: Math.round(pr.bottom), rowTop: Math.round(rr.top), rowBottom: Math.round(rr.bottom), ih: innerHeight }; })()`);
    await tap('.mobile-win-switcher .mobile-win-row.mobile-win-minimized');
    const pr = await evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(filesId)}); return { min: w.isMinimized, display: getComputedStyle(w.element).display, active: app.wm.activeWindowId === ${JSON.stringify(filesId)} }; })()`);
    check(`a tap on the Minimized row (scrolled into the sheet's view first: row ${rowGeo?.rowTop}–${rowGeo?.rowBottom}, sheet bottom ${rowGeo?.popBottom}) restores it on the phone (shown, active)`, pr.min === false && pr.display !== 'none' && pr.active, { pr, rowGeo });
    await sleep(2500); // the restore tap's save (if its record differs at all) has landed by now
    check('…and the desktop keeps it MINIMIZED (guard 10: a phone writes membership, never arrangement — 2.369.125 r2 sent the phone\'s restore to every desktop)', await desk.evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(filesId)}); return !!w && w.isMinimized === true && w.element.style.display === 'none'; })()`));
  }

  // ── measured defect: the settings nav strip wraps ──
  console.log('settings nav strip');
  await evalJs(`app._settingsUI?.open(); true`);
  check('the Settings window opens', await waitFor(`!!document.querySelector('.settings-window .settings-nav')`));
  const nav = await evalJs(`(() => { const n = document.querySelector('.settings-window .settings-nav'); const items = [...n.querySelectorAll('.settings-nav-item')]; return { scroll: n.scrollWidth, client: n.clientWidth, wrap: getComputedStyle(n).flexWrap, n: items.length, inside: items.every((i) => i.getBoundingClientRect().right <= innerWidth + 1), minH: Math.min(...items.map((i) => Math.round(i.getBoundingClientRect().height))) }; })()`);
  check(`the settings nav wraps (${nav.n} categories, scrollWidth ${nav.scroll} ≤ ${nav.client}, every item inside the viewport, rows ≥ 36 px)`, nav.wrap === 'wrap' && nav.scroll <= nav.client + 1 && nav.inside && nav.minH >= 36, nav);
  await shot('settings-nav-phone.png');
  // B-df40 part 2: the header's ONE "Show advanced settings" switch at phone width — inside the window, clear of
  // Reset All; off, categories end with "N advanced settings hidden · Show"; on, advanced rows draw with their chip
  const advQ = `(() => { const w = document.querySelector('.settings-window'); const sw = w && w.querySelector('.settings-adv-switch'); const rb = w && w.querySelector('.settings-header-btn'); if (!sw || !rb) return null; const a = sw.getBoundingClientRect(), b = rb.getBoundingClientRect(), win = w.getBoundingClientRect(); return { inside: a.width > 0 && a.left >= win.left - 1 && a.right <= win.right + 1, overlap: !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top), on: sw.querySelector('input').checked, lines: w.querySelectorAll('.settings-adv-hidden').length, chips: w.querySelectorAll('.settings-chip-advanced').length, vw: innerWidth }; })()`;
  const adv0 = await evalJs(advQ);
  check(`the "Show advanced settings" switch sits inside the ${adv0 && adv0.vw} px window, clear of Reset All; off, categories end with a hidden-count line (${adv0 && adv0.lines})`, !!adv0 && adv0.inside && !adv0.overlap && !adv0.on && adv0.lines >= 5 && adv0.chips === 0, adv0);
  await evalJs(`(() => { document.querySelector('.settings-window .settings-adv-switch input').click(); return true; })()`);
  const adv1 = await evalJs(advQ);
  check(`…switched on: no hidden-count line, the advanced rows draw with their chip (${adv1 && adv1.chips})`, !!adv1 && adv1.on && adv1.lines === 0 && adv1.chips >= 40, adv1);
  await evalJs(`(() => { document.querySelector('.settings-window .settings-adv-switch input').click(); return localStorage.getItem('vibespace.settingsAdvanced'); })()`);
  // 2.369.133 (owner "手机上这个配置层级渲染有点问题"): .132 flattened the groups with
  // display:contents, so the heads sat INLINE among the categories and folded on a tap.
  // The phone strip is SECTIONED: every group head is a full-width label on a line of its
  // own (no chevron, no pointer), and its categories start BELOW it.
  const sections = await evalJs(`(() => { const n = document.querySelector('.settings-window .settings-nav'); const navW = n.clientWidth; return [...n.querySelectorAll('.settings-nav-group')].map((g) => { const h = g.querySelector('.settings-nav-group-head'); const hr = h.getBoundingClientRect(); const items = [...g.querySelectorAll('.settings-nav-item')].map((i) => i.getBoundingClientRect()); const svg = h.querySelector('svg'); return { id: g.dataset.group, label: h.textContent.trim(), headW: Math.round(hr.width), navW, ownRow: items.every((r) => r.top >= hr.bottom - 1), sameRowAsHead: items.filter((r) => r.top < hr.bottom - 1 && r.left > hr.left).length, chevron: svg ? getComputedStyle(svg).display : 'none', pointer: getComputedStyle(h).pointerEvents, display: getComputedStyle(g).display, itemsVisible: items.filter((r) => r.width > 0).length, items: items.length }; }); })()`);
  check(`every group head is a full-width label on its own row (${sections.map((s) => s.label + ':' + s.headW + '/' + s.navW).join(', ')})`, sections.length >= 4 && sections.every((s) => s.headW >= s.navW - 24 && s.ownRow && s.sameRowAsHead === 0), sections);
  check('the phone head shows no chevron and takes no pointer (a tap folds nothing, nothing sticks in :hover)', sections.every((s) => s.chevron === 'none' && s.pointer === 'none' && s.display !== 'contents'), sections);
  // negative control: a fold saved on this device (the desktop's persisted key) is IGNORED on the phone
  await evalJs(`localStorage.setItem('vibespace.settingsNavFolds', JSON.stringify(['services', 'harness'])); app._settingsUI._navFolds = null; const sw = [...app.wm.windows.values()].find((w) => w.type === 'settings'); if (sw) app.wm.closeWindow(sw.id); true`);
  await sleep(200);
  await evalJs(`app._settingsUI.open(); true`);
  check('the Settings window reopens', await waitFor(`!!document.querySelector('.settings-window .settings-nav-group[data-group="services"]')`));
  const foldedPhone = await evalJs(`(() => { const g = document.querySelector('.settings-window .settings-nav-group[data-group="services"]'); const items = [...g.querySelectorAll('.settings-nav-item')]; return { folded: g.classList.contains('is-folded'), visible: items.filter((i) => i.getBoundingClientRect().width > 0).length, items: items.length }; })()`);
  check(`a fold saved for this device still shows every category on the phone (services folded=${foldedPhone.folded}, ${foldedPhone.visible}/${foldedPhone.items} visible)`, foldedPhone.folded === true && foldedPhone.items > 0 && foldedPhone.visible === foldedPhone.items, foldedPhone);
  await evalJs(`localStorage.removeItem('vibespace.settingsNavFolds'); true`);

  // ── #H THE HARNESS MARK IN THE PICK LISTS (lane phone-take-photo commit 2; the owner 2026-11-09, phone: «手机上对话列表的图标也
  // match一下harness»). The phone's window list: a claude / codex / opencode / antigravity conversation, an unknown harness, a
  // plain shell and a Design window, each row's mark by class; a harness known LATE follows in the open list; a theme flip keeps
  // the marks legible; the rows keep their press target and words. Then the desk's ⧉ list by the same call. PNGs: MARKS_PNG_DIR.
  console.log('#H the harness mark in the pick lists (the phone window list, the desk ⧉ list)');
  {
    const PNG = process.env.MARKS_PNG_DIR || SHOTS, TAG = process.env.MARKS_TAG || 'after';
    const toRows = () => evalJs(`([...document.querySelectorAll('.mobile-win-switcher .mobile-win-row')].find((r) => (r.children[1]?.textContent || '').startsWith('Mark · '))?.scrollIntoView({ block: 'start' }), true)`); // the shot shows the rows judged
    const snap = async (client, name) => { try { await client.front(); if (client === phone) await toRows(); const r = await client.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(PNG, `${TAG}-${name}.png`), Buffer.from(r.data, 'base64')); console.log(`    (PNG ${path.join(PNG, TAG + '-' + name + '.png')})`); } catch (e) { console.log('    (no PNG: ' + e.message + ')'); } };
    const ROWS = [['claude', 'chat', 'claude'], ['codex', 'chat', 'codex'], ['opencode', 'chat', 'opencode'], ['antigravity', 'chat', 'antigravity'], ['mystery-cli', 'chat', 'an unknown harness'], ['shell', 'terminal', 'a plain shell'], [null, 'design', 'Design'], [null, 'chat', 'late']];
    // every harness row of the table above (the registry's ids — test-harness-add-census: a list keyed by harness carries them all)
    const HARNESS = ROWS.filter(([id]) => id && id !== 'mystery-cli');
    const make = (prefix) => `(() => { const ids = {}; for (const [b, type, name] of ${JSON.stringify(ROWS)}) { const w = app.wm.createWindow({ title: ${JSON.stringify(prefix)} + name, type, width: 480, height: 360 }); if (b) app.wm.setTitleMeta(w.id, { backend: b }); ids[name] = w.id; } return ids; })()`;
    const errs0 = pageErrors.length, deskErrs0 = desk.pageErrors.length;
    const ids = await evalJs(make('Mark · '));
    await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); document.getElementById('mobile-nav-title').click(); true`); await sleep(400);
    const READ = `[...document.querySelectorAll('.mobile-win-switcher .mobile-win-row')].map((r) => { const icon = r.children[0], lab = r.children[1], m = icon && icon.firstElementChild; return { t: (lab && lab.textContent) || '', cls: m ? String(m.getAttribute('class') || '') : '', text: m ? m.textContent.trim() : '', svg: !!(icon && icon.querySelector('svg')), h: Math.round(r.getBoundingClientRect().height), fs: lab ? getComputedStyle(lab).fontSize : '', iw: icon ? Math.round(icon.getBoundingClientRect().width) : 0, gw: icon && icon.querySelector('svg') ? Math.round(icon.querySelector('svg').getBoundingClientRect().width) : 0 }; }).filter((x) => x.t.startsWith('Mark · '))`;
    const rows = await evalJs(READ), by = Object.fromEntries(rows.map((r) => [r.t.slice('Mark · '.length), r]));
    for (const [b, type, name] of HARNESS) {
      const r = by[name] || {};
      check(`phone list: the ${b} ${type === 'chat' ? 'conversation' : 'terminal'} wears the ${b} mark (backend-icon-${b}, the ${type} mode mark)`, /\bbackend-icon\b/.test(r.cls || '') && new RegExp('\\bbackend-icon-' + b + '\\b').test(r.cls || '') && /\bmode-backend-icon\b/.test(r.cls || ''), r);
    }
    check('phone list: an unknown harness wears the generic mark — never an empty box', /\bbackend-icon-generic\b/.test(by['an unknown harness']?.cls || '') && !!by['an unknown harness']?.text, by['an unknown harness']);
    check('phone list: a plain shell terminal wears the shell mark', /\bbackend-icon-shell\b/.test(by['a plain shell']?.cls || ''), by['a plain shell']);
    check(`phone list: a Design window keeps its type glyph at its size (${by['Design']?.gw} px)`, !/backend-icon/.test(by['Design']?.cls || '') && !!by['Design']?.svg && by['Design']?.gw >= 15, by['Design']);
    check('phone list: a conversation whose harness is not known yet shows the chat glyph', !/backend-icon/.test(by['late']?.cls || '') && !!by['late']?.svg, by['late']);
    const dz = by['Design'] || {};
    check(`phone list: every row keeps its press target and words (${rows.map((r) => r.h + 'px/' + r.fs).join(' ')})`, rows.length === ROWS.length && rows.every((r) => r.h >= 44 && Math.abs(r.h - dz.h) <= 1 && r.fs === '13px'), rows);
    await snap(phone, 'phone-list-dark');
    // a harness known LATE (a restored row): the open list follows, no re-open
    await evalJs(`app.wm.setTitleMeta(${JSON.stringify(ids['late'])}, { backend: 'codex' }); true`); await sleep(400);
    const late = (await evalJs(READ)).find((r) => r.t === 'Mark · late') || {};
    check('phone list: the harness known late — the OPEN list\'s row now wears the codex mark', /\bbackend-icon-codex\b/.test(late.cls || ''), late);
    // a theme flip keeps the marks legible (the contrast helper, theme-colors-changed)
    const LEGIBLE = `(() => { const lum = (c) => { const v = (c.match(/[\\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }; const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor, a = c.match(/[\\d.]+/g); if (a && (a.length < 4 || Number(a[3]) > 0.5)) return c; } return 'rgb(0, 0, 0)'; }; return [...document.querySelectorAll('.mobile-win-switcher .mobile-win-row')].filter((r) => /^Mark · (claude|codex|opencode|antigravity|late)$/.test(r.children[1]?.textContent || '')).map((r) => { const m = r.querySelector('.backend-icon'); if (!m) return { t: r.children[1].textContent, ratio: 0 }; const a = lum(getComputedStyle(m).color), b = lum(bgOf(r)); return { t: r.children[1].textContent, ratio: +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2), color: getComputedStyle(m).color, bg: bgOf(r) }; }); })()`;
    const theme0 = await evalJs(`app.themeManager.current || 'dark'`);
    const legDark = await evalJs(LEGIBLE);
    await evalJs(`app.themeManager.apply('light'); true`); await sleep(500);
    const legLight = await evalJs(LEGIBLE);
    await snap(phone, 'phone-list-light');
    await evalJs(`app.themeManager.apply('dark'); true`); await sleep(500);
    const legBack = await evalJs(LEGIBLE);
    await evalJs(`app.themeManager.apply(${JSON.stringify(theme0)}); true`); await sleep(300);
    const fmt = (l) => l.map((x) => x.t.slice(7) + ' ' + x.ratio).join(', ');
    check(`phone list: the brand marks stay legible on the dark theme (≥ 3:1 — ${fmt(legDark)})`, legDark.length === 5 && legDark.every((x) => x.ratio >= 3), legDark);
    check(`phone list: …and after a flip to the light theme (${fmt(legLight)})`, legLight.length === 5 && legLight.every((x) => x.ratio >= 3), legLight);
    check(`phone list: …and back to dark (${fmt(legBack)})`, legBack.length === 5 && legBack.every((x) => x.ratio >= 3), legBack);
    await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); for (const id of ${JSON.stringify(Object.values(ids))}) { try { app.wm.closeWindow(id); } catch {} } true`); await sleep(300);
    // the desk's ⧉ list (the taskbar's window-count chip): the same call, the title bar's 14-px size — the rows keep their height
    const dIds = await desk.evalJs(make('Desk mark · '));
    await sleep(300);
    await desk.evalJs(`document.querySelectorAll('.overlap-switcher').forEach((p) => p.remove()); document.getElementById('taskbar-status').click(); true`); await sleep(400);
    const dRows = await desk.evalJs(`[...document.querySelectorAll('.overlap-switcher .overlap-switcher-item')].map((r) => { const icon = r.children[0], m = icon && icon.firstElementChild, lab = r.children[1]; return { t: (lab && lab.textContent) || '', cls: m ? String(m.getAttribute('class') || '') : '', svg: !!(icon && icon.querySelector('svg')), h: Math.round(r.getBoundingClientRect().height), mw: m ? Math.round(m.getBoundingClientRect().width) : 0, gw: icon && icon.querySelector('svg') ? Math.round(icon.querySelector('svg').getBoundingClientRect().width) : 0 }; }).filter((x) => x.t.startsWith('Desk mark · '))`);
    const dBy = Object.fromEntries(dRows.map((r) => [r.t.slice('Desk mark · '.length), r]));
    check(`desk ⧉ list: every harness wears its mark (${HARNESS.map(([b, , name]) => b + ':' + (dBy[name]?.cls || '-')).join(' | ')})`,
      HARNESS.every(([b, , name]) => new RegExp('\\bbackend-icon-' + b + '\\b').test(dBy[name]?.cls || '') && /\bwindow-backend-icon\b/.test(dBy[name]?.cls || '')), dRows);
    check(`desk ⧉ list: an unknown harness = the generic mark; a plain shell = the shell mark; Design keeps its glyph at the list's 11 px (${dBy['Design']?.gw} px)`,
      /\bbackend-icon-generic\b/.test(dBy['an unknown harness']?.cls || '') && /\bbackend-icon-shell\b/.test(dBy['a plain shell']?.cls || '') && !/backend-icon/.test(dBy['Design']?.cls || '') && !!dBy['Design']?.svg && dBy['Design']?.gw >= 10, dRows);
    check(`desk ⧉ list: the rows keep their height — a mark row is the Design row's (${dRows.map((r) => r.h).join('/')} px), the mark the title bar's 14 px`,
      dRows.length === ROWS.length && dRows.every((r) => Math.abs(r.h - (dBy['Design']?.h || 0)) <= 1) && dRows.filter((r) => /backend-icon/.test(r.cls)).every((r) => r.mw === 14), dRows);
    await snap(desk, 'desk-list');
    await desk.evalJs(`document.querySelectorAll('.overlap-switcher').forEach((p) => p.remove()); for (const id of ${JSON.stringify(Object.values(dIds))}) { try { app.wm.closeWindow(id); } catch {} } true`); await sleep(300);
    await phone.front();
    check('#H drew no uncaught page exception on either client', pageErrors.length === errs0 && desk.pageErrors.length === deskErrs0, [...pageErrors.slice(errs0), ...desk.pageErrors.slice(deskErrs0)].slice(0, 3));
  }

  check('no uncaught page exceptions during the battery', pageErrors.length === 0, pageErrors.slice(0, 3));
  check('no uncaught page exceptions on the desktop client either', desk.pageErrors.length === 0, desk.pageErrors.slice(0, 3));
  try { desk.sock.close(); } catch {}

  // ── THE FIRST SCREEN, MEASURED (lane phone-first-screen, design q-044 decision 5 + brief step 2) ──
  console.log('first screen, measured: the production shape at 375×812 and 390×844; a row → its conversation; back; the empty list');
  const fsErrors0 = pageErrors.length;
  await restartWith(prodShape());
  for (const [w, h] of [[375, 812], [390, 844]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await evalJs('sessionStorage.clear(); true'); // a COLD open (lane foryou-honest: a RELOAD of a tab with a window on show keeps that window)
    await reloadPhone();
    await waitFor(`!document.getElementById('phone-home').classList.contains('hidden') && document.querySelectorAll('#phone-home .ut-bands .ut-item').length > 0`, 15000);
    await sleep(500);
    const m = await evalJs(MEASURE_PAGE);
    check(`${w}×${h}: the first screen = ${m.rows.length} rows [${m.rows.map((r) => r.band + ':' + r.h).join(' ')} px] + every band / fold head (${m.heads.map((x) => (x.fold ? 'fold ' : '') + x.band + '@' + x.top).join(' ')}) + the notices' line, all inside the viewport at scrollTop 0 (last bottom ${m.last} ≤ ${h})`,
      m.rows.length === 6 && m.folds === 3 && !!m.notices && m.allInside && m.scrollTop === 0, m);
    await shot(`first-screen-${w}x${h}.png`);
    if (w === 375) { // CONTROL: whole words (the page's two-line preview switched off) — measured 1161 px: the same screen does NOT fit
      await evalJs(`(() => { const st = document.createElement('style'); st.id = 'fs-control'; st.textContent = '#phone-home .ut-bands .ut-item > .ut-body > .ut-text { display: block !important; -webkit-line-clamp: none !important; line-clamp: none !important; overflow: visible !important; }'; document.head.append(st); return true; })()`);
      await sleep(200);
      const c = await evalJs(MEASURE_PAGE);
      await evalJs(`document.getElementById('fs-control').remove(); true`);
      check(`CONTROL: the same first screen with whole words does not fit (last bottom ${c.last} > ${h}) — the measure can see an overflow`, !c.allInside && c.last > h, { last: c.last, rows: c.rows.map((r) => r.h) });
    }
  }
  // a row's tap opens its conversation: a LIVE chat (the stub behind the real wrapper, the #4 leg's path) is the asks' conversation
  {
    const liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((r) => liveWs.on('open', r));
    const frames = [];
    liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    liveWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'live-fs' }));
    let created = false;
    for (let i = 0; i < 80 && !created; i++) { if (frames.some((m) => m?.type === 'created')) created = true; else await sleep(500); }
    try { liveWs.close(); } catch {}
    const listed = await waitFor(`(app.sidebar._allSessions || []).some((s) => app.sidebar._getSessionStateKey(s) === ${JSON.stringify('claude:' + LIVE_SID)} && s.webuiId)`, 20000);
    check('the asks\' conversation is live and listed on the phone (created through the real spawn path after the restart)', created && listed, frames.slice(-2).map((f) => JSON.stringify(f).slice(0, 160)));
  }
  const firstRow = await evalJs(`document.querySelector('#phone-home .ut-bands .ut-item')?.dataset.id || null`);
  // lane foryou-honest (ONE row shape on a phone): a tap on the words opens the row IN PLACE; its trailing door is the jump
  await tap(`#phone-home .ut-item[data-id="${firstRow}"] .ut-text`);
  check('a tap on a row\'s words opens it in place (the page stays, one row open)', await waitFor(`!document.getElementById('phone-home').classList.contains('hidden') && document.querySelectorAll('#phone-home .ut-item.ut-open').length === 1 && !!document.querySelector('#phone-home .ut-item.ut-open[data-id="${firstRow}"]')`, 3000));
  await tap(`#phone-home .ut-item[data-id="${firstRow}"] .ut-go`);
  check('a row\'s trailing door opens its conversation: a chat window on show, the page stepped aside, the nav names the window and its ✕ is back',
    await waitFor(`document.getElementById('phone-home').classList.contains('hidden') && app.wm.windows.get(app.wm.activeWindowId)?.type === 'chat' && document.getElementById('mobile-nav-title').textContent !== 'For you' && getComputedStyle(document.getElementById('mobile-nav-close')).display !== 'none'`, 15000),
    await evalJs(`({ hidden: document.getElementById('phone-home').classList.contains('hidden'), active: app.wm.activeWindowId, type: app.wm.windows.get(app.wm.activeWindowId)?.type, title: document.getElementById('mobile-nav-title').textContent, row: ${JSON.stringify(firstRow)}, toasts: [...document.querySelectorAll('#global-toasts .global-toast-body')].map((e) => e.textContent) })`));
  const wins = await evalJs('app.wm.windows.size');
  await evalJs('history.back(); true'); await sleep(900);
  check('the back gesture returns to the attention list (a fresh first screen of 6 rows; the conversation\'s window kept)', await waitFor(`!document.getElementById('phone-home').classList.contains('hidden') && document.querySelectorAll('#phone-home .ut-bands .ut-item').length === 6 && app.wm.windows.size === ${wins} && !app.sidebar.isOpen`, 6000));
  // every ask answered elsewhere: the rows keep their slots while the page is read (the slot law), then the list is empty
  const openIds = ((await (await fetch(`http://127.0.0.1:${PORT}/api/user-todos`)).json()).todos.open || []).map((i) => i.id);
  await fetch(`http://127.0.0.1:${PORT}/api/user-todos/resolve-many`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: openIds, status: 'dismissed' }) });
  check(`${openIds.length} asks answered elsewhere: the page keeps its 6 rows in their slots, struck — nothing jumps while it is read`, await waitFor(`!document.getElementById('phone-home').classList.contains('hidden') && document.querySelectorAll('#phone-home .ut-bands .ut-item').length === 6 && !app.phoneHome.hasRows()`, 6000));
  await evalJs('app.wm.focusWindow(app.wm.activeWindowId); true'); await sleep(300);
  check('…a window navigation hides it (the central yield)', await evalJs(`document.getElementById('phone-home').classList.contains('hidden')`));
  await evalJs('history.back(); true'); await sleep(900);
  check('empty list ⇒ the conversation list: the next back lands on the sidebar (home), no empty page', await waitFor(`app.sidebar.isOpen && document.getElementById('phone-home').classList.contains('hidden')`, 5000));
  await reloadPhone(); await sleep(1500);
  check('a boot with nothing on the first screen draws no page — the phone opens where its restore put it', await evalJs(`document.getElementById('phone-home').classList.contains('hidden') && document.getElementById('phone-home').childElementCount === 0`));
  check('no uncaught page exceptions in the first-screen legs', pageErrors.length === fsErrors0, pageErrors.slice(fsErrors0, fsErrors0 + 3));
} catch (e) {
  failed++;
  console.error('  ✗ battery crashed: ' + (e.stack || e.message));
}

console.log(`screenshots: ${SHOTS}`);
console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
