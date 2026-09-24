#!/usr/bin/env node
// Chat virtual-scroll paging stability (2026-07-30 user report: "翻页过程中会
// 往上跳一大截，往回翻也会意外跳跃"). Drives a REAL view-only ChatView over a
// synthetic 700-record transcript (with foldable Bash runs, so run-collapse is
// active) in a throwaway worktree server + headless chrome, pages UP then DOWN
// in discrete steps, and measures viewport displacement a user would perceive
// as a jump: (a) the anchor element shifting inside the viewport between our
// scripted steps, (b) scrollTop moving away from where the script put it.
// Run: node scripts/test-chat-paging.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE } from './scratch.mjs';
import { writeHugeTranscript } from './huge-transcript-fixture.mjs';
import { judgeGesture, formatGesture, SNAP_SOURCE, RING_SINCE_SOURCE, WHEEL_POINT_SOURCE, JUMP_SLACK_VIEWPORTS, DELIVERY_MIN_FRACTION, PAGE_UP_BAND_PX } from './paging-gesture-rules.mjs';
const require = createRequire(import.meta.url);
const { fixtureLitter } = require('../src/fixture-guard.js');

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2); // per-process (scripts/scratch.mjs) — fixed ports collided across concurrent gates
const wt = scratch('chatpage-smoke');
const CWD = scratch('chatpage-test');
const SID = fixtureSid('1');
const SID2 = fixtureSid('2'); // the FOLD-DOMINATED transcript (inc-mub8xwrb-z57x)
const SID3 = fixtureSid('3'); // the HUGE COMPACT-MODE transcript (inc-mubvu3a4-x8sb) — §1c
// ISOLATED $HOME (2026-09-09). This suite used to write its 42 MB synthetic
// transcript into the developer's REAL ~/.claude/projects, because the server
// it spawns inherited HOME and can only discover what lives under its own
// home. The machine's PRODUCTION instance polls that directory every 5 s: the
// fixture was listed as a stopped "conversation" and its FABRICATED usage
// blocks were ingested into the permanent ledger (measured 2026-09-09: 70,533
// rows for THIS session id, of the instance's 79,533 fabricated rows, claiming
// Fable tokens nobody ever spent). The server
// gets its own home, the fixture goes there, and the census at the end proves
// the real one was untouched.
const fakeHome = scratchHome('chatpage-home', fs);
const PROJ = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. synthetic transcript: text turns + LONG texts + foldable Bash runs ──
{
  const lines = [];
  let t = Date.now() - 7 * 86400e3;
  const ts = () => new Date((t += 30e3)).toISOString();
  let n = 0;
  const push = (o) => { lines.push(JSON.stringify(o)); };
  // 900 turns with fat tool outputs → ~40MB file: crosses the 32MB
  // registered-tail threshold, so paging up exercises the GAP-SEEK path
  // (slab loads + _trimGapDom) exactly like the huge real-world sessions
  // the report came from.
  const FAT = 'a fat line of tool output that adds real rendered height 0123456789\n';
  for (let turn = 0; turn < 900; turn++) {
    push({ type: 'user', message: { role: 'user', content: `question ${turn}: please do the thing and explain` }, uuid: `u-${n++}`, timestamp: ts() });
    // assistant text of varying length (height variance is what stresses the
    // content-visibility estimates)
    const long = 'line of explanatory prose that wraps around and adds height\n'.repeat(3 + (turn % 9) * 4);
    push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `answer ${turn}:\n${long}` }], usage: { input_tokens: 10, output_tokens: 50 } }, uuid: `a-${n++}`, timestamp: ts() });
    // a run of 4 Bash tool calls (foldable by run-collapse)
    for (let b = 0; b < 4; b++) {
      const tid = `toolu_${turn}_${b}`;
      push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command: `echo step ${turn}.${b}` } }], usage: {} }, uuid: `tu-${n++}`, timestamp: ts() });
      // vary result size wildly (16 lines … 300 lines): estimate-vs-real
      // height skew under content-visibility is the stress being tested
      push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: `output ${turn}.${b}\n` + FAT.repeat(16 + ((turn + b) % 5) * 70) }] }, uuid: `tr-${n++}`, timestamp: ts() });
    }
    push({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `turn ${turn} done.` }], usage: { input_tokens: 10, output_tokens: 5 } }, uuid: `af-${n++}`, timestamp: ts() });
  }
  fs.mkdirSync(PROJ, { recursive: true });
  fs.mkdirSync(CWD, { recursive: true });
  fs.writeFileSync(path.join(PROJ, `${SID}.jsonl`), lines.join('\n') + '\n');
  console.log(`  transcript: ${lines.length} records`);
}

// ── 1b. FOLD-DOMINATED transcript (inc-mub8xwrb-z57x, 2.369.129): 1500 consecutive
// Bash pairs with no text between — the shape of a long agent session, which the
// semantic fold renders as a couple of run headers per hundreds of records.
{
  const lines = [];
  let t = Date.now() - 6 * 86400e3;
  const ts = () => new Date((t += 20e3)).toISOString();
  let n = 0;
  const push = (o) => { lines.push(JSON.stringify(o)); };
  push({ type: 'user', message: { role: 'user', content: 'run the whole migration and report' }, uuid: `f-u-${n++}`, timestamp: ts() });
  for (let i = 0; i < 1500; i++) {
    const tid = `toolu_fold_${i}`;
    push({ type: 'assistant', message: { id: `fmsg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command: `echo step ${i}` } }], usage: {} }, uuid: `f-a-${n++}`, timestamp: ts() });
    push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: `ok ${i}\n` }] }, uuid: `f-r-${n++}`, timestamp: ts() });
    // a one-line status between batches, as real agent sessions have — the fold
    // closes a run at it, so a slab of 40 pairs renders as ONE header + ONE line
    if (i % 40 === 39) push({ type: 'assistant', message: { id: `fmsg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: `batch ${(i + 1) / 40} done.` }], usage: { input_tokens: 10, output_tokens: 5 } }, uuid: `f-t-${n++}`, timestamp: ts() });
  }
  push({ type: 'assistant', message: { id: `fmsg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'migration done.' }], usage: { input_tokens: 10, output_tokens: 5 } }, uuid: `f-af-${n++}`, timestamp: ts() });
  fs.writeFileSync(path.join(PROJ, `${SID2}.jsonl`), lines.join('\n') + '\n');
  console.log(`  fold transcript: ${lines.length} records`);
}

// ── 1c. THE HUGE COMPACT-MODE SESSION (inc-mubvu3a4-x8sb, 2026-09-21): the synthetic
// transcript with the SHAPE of the owner's 976 MB / 266,270-line conversation. The
// generator and its shape essay live in scripts/huge-transcript-fixture.mjs — ONE
// implementation, shared with scripts/test-ax-budget.mjs (the accessibility-tree
// measurement leg counts nodes on EXACTLY the shape this suite pages).
const HUGE_TARGET_BYTES = Number(process.env.VS_HUGE_FIXTURE_MB || 48) * 1048576;
{
  const h = await writeHugeTranscript({ file: path.join(PROJ, `${SID3}.jsonl`), sid: SID3, cwd: CWD, targetBytes: HUGE_TARGET_BYTES });
  console.log(`  huge fixture: ${h.lines} lines, ${h.turns} turns, ${h.images} images, ${(h.bytes / 1048576).toFixed(1)} MB (${h.kbPerLine.toFixed(2)} KB/line) in ${h.ms} ms`);
}

// ── 2. throwaway server + chrome ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
// UNMINIFIED bundle for the worktree: scrollTop-write stacks must carry real
// function names so each jump can be attributed to its exact call site.
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1920,1000', // the owner's width (1920×963): a compact row's wrap width decides the px per card, which is what the §1c shape is about
  '--disable-background-timer-throttling', `--user-data-dir=${scratch('chatpage-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [scratch('chatpage-chrome'), fakeHome, CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
// SIGNALS TOO (2026-09-09): 'exit' does not fire for a default-terminated
// SIGINT/SIGTERM, which is how a Ctrl-C or a runner timeout ends this suite —
// the exact case that left a 42 MB fixture behind for the production instance
// to ingest. The fixture lives under an isolated home now, so a missed cleanup
// is only disk; the handlers keep it from being disk FOREVER.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
// THE BOOT WAITS (B-1192 — the heavy run's OTHER first-attempt red, `Cannot read
// properties of undefined (reading 'viewSession')`): a fixed 10 s server wait and
// a fixed 24 s page wait fell through under load, the page sat on Chrome's
// connection-refused page (the §4d control's freshly started server had not
// answered yet) and the next eval called window.app.viewSession on it. Both waits
// are deadlines now, the page is re-navigated until the app boots, and a page
// that never boots fails a NAMED check instead of throwing a TypeError.
const serverUp = async (port, ms = 90000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { await fetch(`http://127.0.0.1:${port}/api/home`); return true; } catch { await sleep(250); } }
  return false;
};
check('the scratch server answered', await serverUp(PORT));

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); }
  catch { await sleep(250); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { console.log('[pageEX]', m.params.exceptionDetails?.exception?.description?.slice(0, 250)); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};
await cdp('Runtime.enable');
await cdp('Page.enable');
// every navigation below (pageReady's included) runs with the wizard pre-dismissed (test-architecture §47)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
// VS_PAGING_UI_FONT=<family> (a debugging aid, never the gate): the UI's system font forced on every page —
// 'DejaVu Sans' is the Actions runner's fallback for `system-ui` (this box resolves Noto Sans), and with it
// the unfixed §4b reproduces the mirror's `481/1179 1087/629 1391/79 807/0` byte for byte
if (process.env.VS_PAGING_UI_FONT) await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(`body { font-family: ${JSON.stringify(process.env.VS_PAGING_UI_FONT)} !important; }`)}; document.head.appendChild(st); });` });
const pageReady = async (port, label, ms = 150000) => {
  const end = Date.now() + ms; let navs = 0;
  while (Date.now() < end) {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/` }); navs++;
    const until = Math.min(end, Date.now() + 30000);
    while (Date.now() < until) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm && window.app.viewSession)').catch(() => false)) return true; await sleep(400); }
  }
  check(`${label}: the app booted on the page (${navs} navigation(s) in ${Math.round(ms / 1000)} s)`, false, 'the page never exposed window.app — the legs on it are not run');
  return false;
};
await pageReady(PORT, 'boot');
await sleep(1500);

// ── 3. open the view-only chat + install the drift recorder ──
const opened = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.app.viewSession('${SID}', '${CWD}', 'paging test');
  for (let i = 0; i < 50; i++) {
    const list = document.querySelector('.chat-message-list');
    if (list && list.querySelectorAll('.chat-msg').length > 10) break;
    await sleep(300);
  }
  const list = document.querySelector('.chat-message-list');
  if (!list) return { ok: false };
  await sleep(1200); // initial render + fold settle
  // drift recorder: per-frame topmost-visible element + its viewport offset
  window.__rec = []; window.__marks = []; window.__stWrites = [];
  // forensic interceptor: EVERY programmatic scrollTop write with its caller
  {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(list, 'scrollTop', {
      get() { return desc.get.call(this); },
      set(v) {
        const from = desc.get.call(this);
        const stack = (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 5).map((l) => l.trim()).join(' | ');
        window.__stWrites.push({ t: performance.now(), from: Math.round(from), to: Math.round(v), by: window.__scripted ? 'SCRIPT' : stack.slice(0, 160) });
        desc.set.call(this, v);
      },
    });
  }
  const tick = () => {
    const st = list.scrollTop;
    let el = null;
    for (const c of list.children) { if (c.offsetHeight > 0 && c.offsetTop + c.offsetHeight > st) { el = c; break; } }
    window.__rec.push({ t: performance.now(), id: el ? (el.dataset.msgId || el.className.slice(0, 20)) : null, top: el ? el.offsetTop - st : 0, st, sh: list.scrollHeight });
    window.__rafId = requestAnimationFrame(tick);
  };
  tick();
  window.__list = list;
  return { ok: true, n: list.querySelectorAll('.chat-msg').length, sh: list.scrollHeight, st: list.scrollTop };
})()`);
check('view-only chat opened with messages', opened?.ok && opened.n > 10, JSON.stringify(opened));

// one paging step: mark, set scrollTop, wait for loads/folds to settle
const step = async (dir, px, waitMs) => await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const list = window.__list;
  const before = list.scrollTop;
  const target = ${dir === 'up' ? `Math.max(0, before - ${px})` : `Math.min(list.scrollHeight, before + ${px})`};
  window.__marks.push({ t: performance.now(), set: target, before });
  window.__scripted = true; list.scrollTop = target; window.__scripted = false;
  list.dispatchEvent(new Event('scroll'));
  await sleep(${waitMs});
  return { set: target, settled: list.scrollTop, sh: list.scrollHeight };
})()`);

// wheel-like cadence (small fast ticks) interleaved with big flicks, both ways
const stepsUp = [];
for (let i = 0; i < 90; i++) stepsUp.push(await step('up', i % 9 === 8 ? 1400 : 260, i % 9 === 8 ? 700 : 130));
await sleep(1200);
const stepsDown = [];
for (let i = 0; i < 90; i++) stepsDown.push(await step('down', i % 9 === 8 ? 1400 : 260, i % 9 === 8 ? 700 : 130));

// ── 4. analyze: per-frame anchor displacement between scripted marks ──
const analysis = await evaljs(`(() => {
  cancelAnimationFrame(window.__rafId);
  const rec = window.__rec, marks = window.__marks.map((m) => m.t);
  const jumps = [];
  for (let i = 1; i < rec.length; i++) {
    const a = rec[i - 1], b = rec[i];
    // exclude ONLY the frame pair spanning our own scrollTop write — the
    // earlier ±120ms window swallowed the async load mutations we must watch
    const spansMark = marks.some((mt) => mt >= a.t && mt <= b.t);
    if (spansMark) continue;
    if (a.id && b.id && a.id === b.id && Math.abs(b.top - a.top) > 60) {
      jumps.push({ kind: 'anchor-shift', id: b.id, from: Math.round(a.top), to: Math.round(b.top), st: Math.round(b.st), t: Math.round(b.t) });
    } else if (a.id && b.id && a.id !== b.id && Math.abs(b.st - a.st) > 400) {
      jumps.push({ kind: 'scroll-teleport', dst: Math.round(b.st - a.st), st: Math.round(b.st), t: Math.round(b.t) });
    }
  }
  // attribute: for each jump, the non-script scrollTop writes within ±400ms
  const writes = window.__stWrites;
  for (const j of jumps) {
    j.writes = writes.filter((w) => w.by !== 'SCRIPT' && Math.abs(w.t - j.t) < 400)
      .map((w) => ({ d: Math.round(w.to - w.from), by: w.by, t: Math.round(w.t) })).slice(0, 6);
  }
  return { frames: rec.length, jumps: jumps.slice(0, 14), jumpCount: jumps.length };
})()`);

console.log(`  frames=${analysis.frames} scripted steps=${stepsUp.length + stepsDown.length}`);
if (analysis.jumps.length) console.log('  jumps:', JSON.stringify(analysis.jumps, null, 1).slice(0, 6000));
// settled-vs-set drift on each step (loads may legitimately grow scrollHeight;
// what must NOT happen is the viewport landing far from where the user was)
check('no anchor-shift/teleport jumps while paging', analysis.jumpCount === 0, `${analysis.jumpCount} jumps`);

// ── 4b. THE FOLD-DOMINATED WINDOW (inc-mub8xwrb-z57x, 2.369.129) ─────────────
// The owner paged up through a session of thousands of consecutive tool calls:
// each 50-record extend added a few hundred px, the 600 bound trimmed the bottom
// (the only content on screen), the height collapsed to one viewport and
// scrollTop clamped to 0 — "跳到上面一页的最顶部，跳过了中间内容", 15 extend/trim
// cycles in 25 s and a frozen browser. Now: NO trim while the window is shorter
// than two viewports, and one wheel notch GROWS the window until it is.
// THE PIN BAND, CONSTRUCTED (2.369.167 r1 — the Actions mirror's red on 3207e03b,
// both attempts: `481/1179 1087/629 1391/79 807/0`, the first notch ONE slab and no
// grown landing). The fold window opens at the WM's default 700×500, and its attach
// slab rendered 67 px taller than the list on this box (`system-ui` = Noto Sans) but
// 48 px taller under the runner's DejaVu Sans (measured by forcing it here with
// VS_PAGING_UI_FONT) — inside the pin band, where a window is "at the live tail" at
// EVERY scrollTop. The scroll the
// wheel-up itself produced re-pinned the view the wheel handler had just unpinned,
// and the grow loop, reading the pin, stopped after one 50-record slab and
// re-tailed (`wheelTop repin(we 1539/1539) trimSkipPinned pinnedRetail`,
// reproduced here with the list sized 25 px short of its content: ws 1179 → 629
// → 79 → 0, exactly the runner's sequence). THE PRODUCT FIX: the scroll handler
// never re-pins while an upward page is in flight (`_extendingTop`,
// `repinSkipPageUp`). THE LEG no longer inherits the geometry from the fonts: the
// window is resized so its list is FOLD_BAND px shorter than the rendered content
// (asserted and printed) — the hardest shape, identical on every machine — the
// ORDER is constructed too (each fetch held three frames, so the wheel's own
// scroll is decided while the first slab is in flight), and each notch waits for
// its own landing (the loading span ends), never a fixed sleep. THE CONTROL: a second view in the same band with the new rule neutered
// on the INSTANCE (`_extendingTop` an own accessor that reads false) must re-pin
// and stop after one slab, or the leg proves nothing.
const FOLD_BAND = 25;
console.log(`§4b fold-dominated: one wheel notch = one landing on a full viewport; the bottom is never trimmed while short; the reader never lands on the top of a slab they did not ask for — in the PIN BAND (the list ${FOLD_BAND} px shorter than the rendered attach slab)`);
const FOLD_RUN = (title, { neuter = false, maxNotches = 6, tall = 0, stripKeep = false } = {}) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.app.viewSession('${SID2}', '${CWD}', ${JSON.stringify(title)});
  let v = null, w = null;
  for (let i = 0; i < 60; i++) {
    w = [...window.app.wm.windows.values()].find((x) => String(x.title || '').includes(${JSON.stringify(title)}));
    v = (w && window.app.sessions.get(w.id)) || null;
    if (v && v._messageList && v._messageList.querySelectorAll('.chat-msg').length > 10) break;
    await sleep(300);
  }
  if (!v) return { ok: false };
  try { await document.fonts.ready; } catch {}
  await sleep(1500); // initial render + fold settle
  const list = v._messageList;
  const open = { ch: list.clientHeight, sh: list.scrollHeight, rendered: list.querySelectorAll(':scope > .chat-msg').length };
  // THE BAND: resize the window until the list is FOLD_BAND px shorter than the content (heights settle after a resize).
  // BAND 0 (tall > 0, r1b): the list TALL px TALLER than the rendered slab — no scroll range at all. The slab is
  // measured with the list first sized well under it (200 px: its scrollHeight is then the content), then the
  // list is opened to content + TALL.
  let resizes = 0, content = 0;
  if (${tall} > 0) {
    w.element.style.height = (w.element.offsetHeight - list.clientHeight + 200) + 'px'; if (w.onResize) try { w.onResize(); } catch {}
    await sleep(500);
    content = list.scrollHeight;
  }
  for (; resizes < 8; resizes++) {
    const d = (${tall} > 0 ? content + ${tall} : list.scrollHeight - ${FOLD_BAND}) - list.clientHeight;
    if (Math.abs(d) <= 3) break;
    w.element.style.height = (w.element.offsetHeight + d) + 'px'; if (w.onResize) try { w.onResize(); } catch {}
    await sleep(500);
  }
  await sleep(1800); // past the paging gates' 1.5 s structural horizon — a resize is no input
  if (${neuter ? 'true' : 'false'}) Object.defineProperty(v, '_extendingTop', { configurable: true, get: () => false, set: () => {} });
  // the band-0 CONTROL: the pre-r1b accounting on the instance — the loop's keepRest stripped, so a pass consumes the whole carry
  if (${stripKeep ? 'true' : 'false'}) { const a0 = Object.getPrototypeOf(v)._applyWheelCarry; v._applyWheelCarry = function (dir, by) { return a0.call(this, dir, by); }; }
  // THE ORDER, CONSTRUCTED: the wheel's own scroll is decided (next frame, the handler's rAF) while the
  // first slab is still in flight — each fetch is held three frames on the instance. A real server's round
  // trip is longer than a frame (the mirror's was); a loopback one on an idle box can land FIRST, the
  // landing's carried notch moves the reader out of the band, and no scroll ever reaches it (measured: the
  // neutered control stayed unpinned under DejaVu Sans + taskset -c 0,1 without this hold)
  { const f0 = v._fetchMessages; const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    v._fetchMessages = async function (...a) { await frame(); await frame(); await frame(); return f0.apply(this, a); }; }
  const ch = list.clientHeight;
  const out = { ok: true, open, resizes, ws0: v._windowStart, ch, sh0: list.scrollHeight, band: list.scrollHeight - ch, content, tall: content ? ch - content : 0, pin0: !!v._pinned, rendered0: list.querySelectorAll(':scope > .chat-msg').length, notches: [] };
  for (let k = 0; k < ${maxNotches}; k++) {
    if (v._windowStart <= 0) break;
    const mark = (v._traceRing || []).length, t0 = Date.now();
    list.scrollTop = 0;
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
    // THE NOTCH'S OWN LANDING: the loading span (+ its 300 ms lock) has ended, twice in a row, after a landing
    let quiet = 0;
    while (Date.now() - t0 < 20000) {
      await sleep(250);
      const landed = (v._traceRing || []).slice(mark).some((e) => e.tag === 'extendTop:done');
      quiet = landed && !v._loading ? quiet + 1 : 0;
      if (quiet >= 2) break;
    }
    await sleep(400); // late layout (the fold's debounced pass, the slab reservation's release)
    const tail = (v._traceRing || []).slice(mark);
    const pass1 = tail.find((e) => e.tag === 'extendTop:done') || {};
    out.notches.push({ ms: Date.now() - t0, extends: tail.filter((e) => e.tag === 'extendTop:done').length,
      pass1: { st: pass1.st, sh: pass1.sh, ch: pass1.ch }, carryPx: tail.filter((e) => e.tag === 'wheelCarry' && e.dir === 'up').reduce((a, e) => a + (e.px || 0), 0), carryDrops: tail.filter((e) => e.tag === 'wheelCarry:drop').length, grown: tail.some((e) => e.tag === 'extendTop:grown'), trimBottom: tail.filter((e) => e.tag === 'trimBottom').length, foldCeiling: tail.filter((e) => e.tag === 'foldCeiling').length,
      repins: tail.filter((e) => e.tag === 'repin').length, repinSkips: tail.filter((e) => e.tag === 'repinSkipPageUp').length, pinnedRetail: tail.filter((e) => e.tag === 'pinnedRetail').length,
      st: Math.round(list.scrollTop), sh: list.scrollHeight, ws: v._windowStart, pin: !!v._pinned, rendered: list.querySelectorAll('.chat-msg').length });
  }
  window.app.wm.closeWindow(w.id);
  return out;
})()`;
const fold = await evaljs(FOLD_RUN('fold test'));
console.log('  fold:', JSON.stringify({ ...fold, notches: undefined }));
for (const n of fold?.notches || []) console.log('    notch:', JSON.stringify(n));
check('the fold-dominated view-only chat opened and paged at least twice', !!fold?.ok && fold.notches.length >= 2, JSON.stringify(fold));
if (fold?.ok) {
  const N = fold.notches, ch = fold.ch;
  check(`the PIN BAND was constructed: the list is ${fold.band} px shorter than the rendered attach slab (${FOLD_BAND} ± 3 — inside the 50 px band where every scrollTop is "at the live tail"), the view pinned at the tail with history above (ws ${fold.ws0}); ${fold.open.rendered} cards opened ${fold.open.sh} px tall in a ${fold.open.ch} px list (${(fold.open.sh / Math.max(1, fold.open.rendered)).toFixed(2)} px per card — the fonts' share of the geometry, printed)`, Math.abs(fold.band - FOLD_BAND) <= 3 && fold.pin0 && fold.ws0 > 0, JSON.stringify(fold));
  check(`every notch that still has history above leaves the window ≥ 2 viewports tall (grow by HEIGHT) — (${N.map((n) => n.sh + '/' + n.ws).join(' ')})`, N.every((n) => n.ws === 0 || n.sh >= 2 * ch), JSON.stringify(N));
  check('the first notch needed more than one slab (the fold makes 50 records a few hundred px) and fired ONE grown landing', N[0].extends > 1 && N[0].grown === true && N[0].extends <= 8, JSON.stringify(N[0]));
  check(`the wheel-up is never overruled by the pin: the band's scroll reached the handler during the first notch's fetch and was SKIPPED (repinSkipPageUp ×${N[0].repinSkips}); no re-pin, no pinned re-tail during any notch`, N[0].repinSkips >= 1 && N.every((n) => n.repins === 0 && n.pinnedRetail === 0 && !n.pin), JSON.stringify(N));
  check('the bottom is never trimmed while the window is short (a trim there removes the content on screen)', N.every((n) => n.trimBottom === 0 || n.sh >= 2 * ch), JSON.stringify(N));
  check(`the reader never lands on the very top with history still above (the incident\'s "跳到最顶部") — st per notch: ${N.map((n) => n.st).join(' ')}`, N.every((n) => n.ws === 0 || n.st > 0), JSON.stringify(N));
  check('no fold ceiling was hit in six notches (the ceiling is the bound, not the routine)', N.every((n) => n.foldCeiling === 0), JSON.stringify(N));
}
// NEGATIVE CONTROL §4b: the same band, the new rule neutered on the view instance — the notch re-pins
{
  const c = await evaljs(FOLD_RUN('fold control', { neuter: true, maxNotches: 1 }));
  const n = c?.notches?.[0];
  console.log('  fold control:', JSON.stringify({ ...c, notches: undefined }), n ? 'notch: ' + JSON.stringify(n) : '');
  check(`NEGATIVE CONTROL §4b: in the same band (${c?.band} px) with the re-pin gate neutered, the notch's own scroll RE-PINS the view and the grow loop stops after one slab (repins ${n?.repins}, extends ${n?.extends}, grown ${n?.grown}, sh ${n?.sh} vs 2 × ${c?.ch}) — the legs can go red`,
    !!n && Math.abs(c.band - FOLD_BAND) <= 3 && n.repins >= 1 && n.extends === 1 && !n.grown && n.sh < 2 * c.ch, JSON.stringify(c));
}
// §4b BAND 0 (2.369.167 r1b — the verifier's reproduction on r1, identical on 3207e03b): a list TALLER than its
// rendered window has no scroll range, so the grow loop's first passes add history with NO room above the reader
// (their landing clamps at scrollTop 0). The carried notch was consumed at that room-less pass, the loop landed at
// the very bottom, and the landing's own scroll re-pinned the view (`wheelTop{carry:120} extendTop:done{st:0,sh:565}
// … extendTop:grown repin`, no wheelCarry anywhere): the reader's first wheel-up on a tall window over a
// fold-dominated session went nowhere. The height law cannot see it (1327/565 ≥ 2) — the loss is in scrollTop, so
// the leg is asserted on scrollTop. THE CONTROL: the same band-0 view with the loop's keepRest stripped on the
// instance (the pre-r1b accounting — a pass consumes the whole carry) must land at the bottom and re-pin.
const FOLD_TALL = 120, NOTCH_PX = 120;
{
  const b0 = await evaljs(FOLD_RUN('fold band0', { tall: FOLD_TALL, maxNotches: 2 }));
  const n1 = b0?.notches?.[0];
  console.log('  fold band0:', JSON.stringify({ ...b0, notches: undefined }));
  for (const n of b0?.notches || []) console.log('    notch:', JSON.stringify(n));
  const built = (r, n) => !!r?.ok && !!n && Math.abs(r.tall - FOLD_TALL) <= 3 && r.sh0 === r.ch && r.pin0 && r.ws0 > 0 && n.pass1.st === 0 && n.pass1.sh === n.pass1.ch;
  check(`BAND 0 was constructed: the list is ${b0?.tall} px TALLER than the rendered slab (${b0?.content} px; ${FOLD_TALL} ± 3 — no scroll range, sh ${b0?.sh0} = ch ${b0?.ch}), pinned with history above (ws ${b0?.ws0}), and the notch's first pass landed with NO room above the reader (st ${n1?.pass1?.st}, sh ${n1?.pass1?.sh} = ch ${n1?.pass1?.ch})`,
    built(b0, n1), JSON.stringify(b0));
  if (built(b0, n1)) {
    check(`BAND 0: the whole notch reached the reader across the passes — the room-less first pass kept it (Σ wheelCarry ${n1.carryPx} px = the ${NOTCH_PX} px notch)`, Math.abs(n1.carryPx - NOTCH_PX) <= 1, JSON.stringify(n1));
    check(`BAND 0: the first notch lands ONE NOTCH into history, never at the bottom: st ${n1.st} ≤ (sh ${n1.sh} − ch ${b0.ch}) − ${NOTCH_PX} (+2), no re-pin, not pinned at the notch's end`,
      n1.st <= n1.sh - b0.ch - NOTCH_PX + 2 && n1.repins === 0 && !n1.pin, JSON.stringify(n1));
    check('BAND 0: every notch after it keeps the whole notch too, or ran out of history — no re-pin, never pinned', b0.notches.every((n) => (n.ws === 0 || Math.abs(n.carryPx - NOTCH_PX) <= 1) && n.repins === 0 && !n.pin), JSON.stringify(b0.notches));
  }
  const c0 = await evaljs(FOLD_RUN('fold band0 control', { tall: FOLD_TALL, maxNotches: 1, stripKeep: true }));
  const cn = c0?.notches?.[0];
  console.log('  fold band0 control:', JSON.stringify({ ...c0, notches: undefined }), cn ? 'notch: ' + JSON.stringify(cn) : '');
  check(`NEGATIVE CONTROL §4b band 0: the same shape (tall ${c0?.tall}, first pass st ${cn?.pass1?.st} / sh ${cn?.pass1?.sh} = ch ${cn?.pass1?.ch}) with keepRest stripped on the instance loses the notch at the room-less pass (Σ wheelCarry ${cn?.carryPx}), lands at the bottom (st ${cn?.st} vs sh − ch ${cn ? cn.sh - c0.ch : '?'}) and RE-PINS (repins ${cn?.repins}, pinned ${cn?.pin}) — the verifier's shape, and the legs can go red`,
    built(c0, cn) && cn.carryPx === 0 && cn.st >= cn.sh - c0.ch - 2 && cn.repins >= 1 && cn.pin, JSON.stringify(c0));
}

// ── 4c. THE HUGE COMPACT-MODE SESSION (inc-mubvu3a4-x8sb, 2026-09-21, owner on
// 2.369.136: "没有办法正确翻页，每次都往回跳转很多，往下又直接跳到底部，还有大量空白").
// The §1c fixture, opened view-only with the live window's content-visibility
// emulated, the list asked to the owner's 790 px (the 1000 px headless workspace yields ~714 — the run prints it), driven by REAL CDP wheel
// gestures at the owner's cadences (one notch / six notches / a 4×700 px
// trackpad fling / a 4 s hold), up then down, the scroll-to-bottom button, up
// again — the same rows scripts/dbg-huge-paging.mjs prints on a copy of the real
// transcript. The per-gesture rules live in scripts/paging-gesture-rules.mjs.
// The reproduction (g1, on the real copy): one 120 px notch walked the window
// 750 messages back and landed on the top of the slab (`trimBottom n:400
// removed:250 sh:2851 sh2:972`, `anchorLost {why:removed}`, `extendTop:done
// anchored:false st:0`, eight grow passes); the first down-fling re-pinned at
// `we 1851 of 3201` and the pinned chain walked to the tail. THE CONTROL below
// re-derives those numbers from a scratch copy with the fix's two rules
// patched out — a leg that cannot go red proves nothing.
console.log('§4c huge compact-mode session: no jump back > 1.5 viewports, no pin / bottom landing before the window reaches the tail, no blank > 25 %, the ring never empty after a page');
const LIST_H = 790;
const CADENCE = { slow: { notches: 1, deltaY: 120, gap: 0, settle: 1500 }, mid: { notches: 6, deltaY: 120, gap: 70, settle: 1500 }, fast: { notches: 4, deltaY: 700, gap: 30, settle: 2000 }, hold: { notches: 40, deltaY: 300, gap: 100, settle: 2400 } };
const OPEN_HUGE = (sid, cwd, title) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.app || typeof window.app.viewSession !== 'function') return { ok: false, why: 'no app on this page (see the boot check)' };
  window.app.viewSession(${JSON.stringify(sid)}, ${JSON.stringify(cwd)}, ${JSON.stringify(title)});
  let v = null, w = null, n = 0, armed = false;
  for (let i = 0; i < 300; i++) {
    // by the view's OWN id — the sidebar renames the window by the first-user-message rule
    const hit = [...window.app.sessions.entries()].find(([, cv]) => cv && cv.sessionId === 'view-' + ${JSON.stringify(sid)});
    v = hit ? hit[1] : null; w = hit ? window.app.wm.windows.get(hit[0]) : null;
    n = v && v._messageList ? v._messageList.querySelectorAll('.chat-msg').length : 0;
    armed = !!(v && v._gapMinimapActive);
    if (n > 10 && armed) break;
    if (n > 10 && i > 100) break;
    await sleep(400);
  }
  if (!v || n <= 10) return { ok: false, n, armed, total: v ? v._total : null };
  const ws = document.getElementById('workspace') || document.querySelector('.workspace');
  const wr = ws.getBoundingClientRect();
  const el = w.element; el.style.left = '0px'; el.style.top = '0px'; el.style.width = wr.width + 'px'; el.style.height = wr.height + 'px';
  if (w.onResize) try { w.onResize(); } catch {}
  await sleep(300);
  const list = v._messageList;
  const d = list.clientHeight - ${LIST_H};
  if (d > 0) { el.style.height = (wr.height - d) + 'px'; if (w.onResize) try { w.onResize(); } catch {} }
  await sleep(300);
  // the LIVE window's content-visibility (a read-only viewer runs with it off)
  v._readOnly = false; v._container.classList.remove('chat-no-content-visibility');
  try { await document.fonts.ready; } catch {} // the self-hosted mono faces (fonts.css, font-display: swap) are in before anything is measured
  await sleep(2500); // initial render + fold + attach fill settle
  window.__v = v; window.__list = list;
  const r = list.getBoundingClientRect();
  return { ok: true, armed, n: list.querySelectorAll('.chat-msg').length, ch: list.clientHeight, sh: list.scrollHeight, st: list.scrollTop, ws: v._windowStart, we: v._windowEnd, total: v._total, gap: v._gapBounds, cv: !v._container.classList.contains('chat-no-content-visibility'), compact: v._container.classList.contains('chat-compact'), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
})()`;
const TRIM_WITNESS_SOURCE = `(() => {
  const v = window.__v; if (!v || v.__trimWitnessed) return 0;
  const orig = v._trimEdge;
  v._trimEdge = function (side) {
    try {
      const list = this._messageList, id = window.__pgReader;
      const el = id ? list.querySelector(':scope > [data-msg-id="' + CSS.escape(id) + '"]') : null;
      const rec = { side, st: Math.round(list.scrollTop), sh: list.scrollHeight, ch: list.clientHeight, zone: (() => { const z = this._keepZone(); return [Math.round(z.top), Math.round(z.bottom)]; })(), reader: !!el };
      if (el) {
        const els = [...list.querySelectorAll(':scope > .chat-msg:not(.chat-gap-msg)')];
        const i = els.indexOf(el), pos = this._cardPositions(els)[i];
        let zeros = 0; for (let j = Math.max(0, i - 40); j <= i; j++) if (els[j].offsetHeight === 0 && getComputedStyle(els[j]).display !== 'none') zeros++;
        Object.assign(rec, { idx: i, of: els.length, top: el.offsetTop, h: el.offsetHeight, read: pos && [Math.round(pos.top), Math.round(pos.bottom)], cv: el.style.contentVisibility || '-', cis: el.style.containIntrinsicSize || '-', zeroAbove: zeros });
      }
      window.__trimWitness && window.__trimWitness.push(rec);
    } catch (e) { window.__trimWitness && window.__trimWitness.push({ err: String(e).slice(0, 120) }); }
    const n = orig.call(this, side);
    if (window.__trimWitness?.length) window.__trimWitness[window.__trimWitness.length - 1].removed = n;
    return n;
  };
  v.__trimWitnessed = true;
  return 1;
})()`;
const runGestures = async (plan, label) => {
  const opened = await evaljs(OPEN_HUGE(SID3, CWD, 'huge test ' + label));
  console.log(`  [${label}] opened:`, JSON.stringify(opened));
  if (!opened?.ok) return { opened, rows: [] };
  const rect = opened.rect;
  const cx = Math.round(rect.x + rect.w / 2), cy = Math.round(rect.y + rect.h / 2);
  const snap = (topIdBefore = null, topOffBefore = 0) => evaljs(`(${SNAP_SOURCE})(${JSON.stringify(topIdBefore)}, ${topOffBefore})`);
  // by SEQ, never by index: the ring splices 600→400 mid-run and an index mark taken before the splice reads nothing after it (verifier r1)
  const ringSince = (mark) => evaljs(RING_SINCE_SOURCE(mark));
  const rows = [];
  // THE TRIM WITNESS (B-1192): a downward gesture that lost the reader's card
  // failed once per heavy run with nothing but the ring's tag counts to go on.
  // Every trim now records, BEFORE it decides, where the reader's card (the
  // gesture's top card) is and how the trim's own position read places it —
  // printed only on a "gone from the DOM" violation, so the next red carries
  // its geometry. Suite-side, read-only: it never changes a decision.
  await evaljs(TRIM_WITNESS_SOURCE);
  for (const [name, dir, speed] of plan) {
    if (dir === 'jump') {
      // a SETUP step, not a judged gesture: the minimap's own jump (jumpToIndex) to a
      // message index — used to reach the start of the registered tail cheaply
      const before = await snap(); const mark = before.ringSeq;
      await evaljs(`(async () => { await window.__v.jumpToIndex(${Number(speed) || 0}); return true; })()`);
      await sleep(2500);
      const after = await snap(); const ring = await ringSince(mark);
      console.log(`    ${name.padEnd(14)} jump → idx ${speed}: st ${before.st}→${after.st} ws ${before.ws}→${after.ws} we ${before.we}→${after.we} pin ${before.pin}→${after.pin} gapAbove=${after.gapAbove} gapCursor=${after.gapCursor} ring=${ring.length}`);
      continue;
    }
    if (dir === 'btn') {
      const before = await snap(); const mark = before.ringSeq;
      await evaljs(`(() => { const b = window.__v._scrollBtn; if (b) b.click(); return !!b; })()`);
      await sleep(2500);
      const after = await snap(before.topId, before.topOff); const ring = await ringSince(mark);
      const row = { name, dir, wheelPx: 0, before, after, ring }; row.verdict = judgeGesture(row); rows.push(row);
      console.log('    ' + formatGesture(row, row.verdict));
      continue;
    }
    const c = CADENCE[speed];
    const before = await snap(); const mark = before.ringSeq;
    await evaljs(`(() => { window.__pgReader = ${JSON.stringify(before.topId)}; window.__trimWitness = []; return 1; })()`);
    // over a PLAIN point of the viewport (never a card's own scroll box — that box would take the notches)
    const pt = (await evaljs(WHEEL_POINT_SOURCE(dir, c.notches * c.deltaY))) || { x: cx, y: cy, moved: 0 };
    for (let i = 0; i < c.notches; i++) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY: dir === 'up' ? -c.deltaY : c.deltaY });
      if (c.gap) await sleep(c.gap);
    }
    await sleep(c.settle);
    const after = await snap(before.topId, before.topOff); const ring = await ringSince(mark);
    const row = { name, dir, speed, wheelPx: c.notches * c.deltaY * (dir === 'up' ? -1 : 1), before, after, ring, pointerMoved: pt.moved ? 1 : 0, wheelFallback: pt.fallback ? 1 : 0, pt };
    row.verdict = judgeGesture(row); rows.push(row);
    const tags = {}; for (const e of ring) tags[e.tag] = (tags[e.tag] || 0) + 1;
    if (row.verdict.reasons.some((x) => /gone from the DOM/.test(x))) {
      const w = await evaljs('window.__trimWitness || []');
      console.log(`      [evidence] reader ${before.topId} at ${before.topOff}px before the gesture; trims (reader as the trim read it): ${JSON.stringify(w)}`);
      console.log(`      [evidence] ring: ${JSON.stringify(ring.filter((e) => /^(trim|pageDown|pageUp|extend|anchorLost|wheelCarry|gapDrop|scroll$)/.test(e.tag))).slice(0, 3000)}`);
    }
    console.log('    ' + formatGesture(row, row.verdict) + (row.pointerMoved ? '  [pointer moved off a nested scroller]' : '') + (row.wheelFallback ? `  [NO plain point: wheel at the centre over ${pt.under || '?'} — ⑤ not judged; ${pt.boxes} scroll boxes in the list]` : '') + (row.verdict.ok || row.wheelFallback ? '' : `  [wheel at ${pt.x},${pt.y} over ${pt.under || '?'}; scroll boxes in the list: ${pt.boxes ?? '?'}]`) + '  ring: ' + Object.entries(tags).map(([k, v]) => k + (v > 1 ? '×' + v : '')).join(' '));
  }
  return { opened, rows };
};
const PLAN = [['up-slow-1', 'up', 'slow'], ['up-slow-2', 'up', 'slow'], ['up-slow-3', 'up', 'slow'], ['up-mid-1', 'up', 'mid'], ['up-mid-2', 'up', 'mid'], ['up-fast-1', 'up', 'fast'], ['up-fast-2', 'up', 'fast'], ['up-fast-3', 'up', 'fast'], ['up-hold', 'up', 'hold'],
  ['down-slow-1', 'down', 'slow'], ['down-slow-2', 'down', 'slow'], ['down-mid-1', 'down', 'mid'], ['down-mid-2', 'down', 'mid'], ['down-fast-1', 'down', 'fast'], ['down-fast-2', 'down', 'fast'], ['down-fast-3', 'down', 'fast'], ['down-hold', 'down', 'hold'],
  ['scroll-btn', 'btn', '-'], ['up2-slow-1', 'up', 'slow'], ['up2-slow-2', 'up', 'slow'], ['up2-mid-1', 'up', 'mid'],
  // THE GAP SLAB (verifier r1: the first plan never left the registered tail, so a wheel absorbed inside a
  // loaded gap slab — both directions, a 2,800 px fling moving the card < 110 px — was invisible): a minimap
  // jump to message 0 of the tail, holds up into the seek gap (2,000-line slabs), mid-list gestures INSIDE
  // the slab both ways, then holds back down through the tail (the slab must be dropped when the window
  // leaves message 0, never left above newer cards), and one notch up from there.
  ['gap-jump', 'jump', 0], ['gap-up-hold-1', 'up', 'hold'], ['gap-up-hold-2', 'up', 'hold'],
  ['gap-down-mid-1', 'down', 'mid'], ['gap-down-mid-2', 'down', 'mid'], ['gap-down-fast-1', 'down', 'fast'],
  ['gap-up-mid-1', 'up', 'mid'], ['gap-up-mid-2', 'up', 'mid'], ['gap-up-fast-1', 'up', 'fast'],
  ['gap-down-hold-1', 'down', 'hold'], ['gap-down-hold-2', 'down', 'hold'], ['gap-down-hold-3', 'down', 'hold'], ['gap-tail-up-slow-1', 'up', 'slow']];
// THE ② PROBE — CONSTRUCTED, NOT HOPED FOR (2.369.155; the mirror's red on 0c7f6af0, 3a1b77ca and 89c33c29,
// both attempts each: the combined control's down rows never caught the pin). The rule ② can only go red if a
// SNAPSHOT at settle sees the pin (or the walk to the tail on a short wheel). On the pre-fix copy a mid-history
// repin happened on every mirror run (3-4 `repin we < total` in the ring) but inside a 4×700 px fling whose
// later notches — and the count trim's st-0 landing — unpinned it before the settle, and a ≥ 2-viewport wheel is
// excused from the teleport rule by design; locally the same fling happened to settle pinned. What the rule
// needs is exactly this geometry: a PARTIAL window (we < total), the viewport parked `PROBE_D` px above the DOM's
// bottom — ≥ 50 so the park itself is outside the pin band, < one 120 px notch so the notch MUST cross into it —
// no input inside the paging gates' 1.5 s horizon (so nothing but the notch moves the view), then ONE notch and
// nothing after it. On the pre-fix copy that notch pins in the middle of history and nothing ever unpins it
// (measured: pinned at 1.5 s, 2.5 s, 4 s; 4/4 runs, 3/3 at CPU ×6); on the fix the same notch pages (the
// overshoot carry) and never pins (3/3). The probe runs on BOTH builds — a control whose construction the fix
// fails proves nothing — and its precondition is ASSERTED and printed, never assumed.
const ringSince = (mark) => evaljs(RING_SINCE_SOURCE(mark));
const snap = (topIdBefore = null, topOffBefore = 0) => evaljs(`(${SNAP_SOURCE})(${JSON.stringify(topIdBefore)}, ${topOffBefore})`);
const TELEPORT = (x) => /pinned with the window|re-pinned mid-history|DOM's bottom|teleported to the tail/.test(x);
const PROBE_D = 80;
const PROBE_UPS = [['probe-up-mid', 'mid'], ['probe-up-fast-1', 'fast'], ['probe-up-fast-2', 'fast']];
const pinProbe = async (port, label) => {
  await pageReady(port, 'probe ' + label);
  await sleep(1500);
  const opened = await evaljs(OPEN_HUGE(SID3, CWD, 'huge probe ' + label));
  if (!opened?.ok) return { opened };
  // leave the live tail with the product's OWN paging (three real upward gestures)
  for (const [, speed] of PROBE_UPS) {
    const c = CADENCE[speed];
    const pt = (await evaljs(WHEEL_POINT_SOURCE('up', c.notches * c.deltaY))) || { x: Math.round(opened.rect.x + opened.rect.w / 2), y: Math.round(opened.rect.y + opened.rect.h / 2) };
    for (let i = 0; i < c.notches; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY: -c.deltaY }); if (c.gap) await sleep(c.gap); }
    await sleep(c.settle);
  }
  // PARK: the viewport PROBE_D px above the DOM's bottom, re-parked until the geometry holds (content-visibility
  // resolves heights after a write, so one write can drift); a scripted scrollTop is no user input, so it pages nothing
  let park = null, parks = 0;
  for (; parks < 15; parks++) {
    park = await evaljs(`(async () => { const l = window.__list; l.scrollTop = l.scrollHeight - l.clientHeight - ${PROBE_D}; await new Promise((r) => setTimeout(r, 400)); const a = Math.round(l.scrollHeight - l.scrollTop - l.clientHeight); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const b = Math.round(l.scrollHeight - l.scrollTop - l.clientHeight); return { a, b }; })()`);
    if (Math.abs(park.a - PROBE_D) <= 4 && park.a === park.b) break;
  }
  await sleep(1600);   // past the gates' 1.5 s user-input horizon, measured from the LAST wheel (the parks are not input)
  const before = await snap(); const mark = before.ringSeq;
  const room = before.sh - before.st - before.ch;
  const pre = { we: before.we, total: before.total, ws: before.ws, room, pin: before.pin, loading: before.loading, tp: before.tp, parks: parks + 1 };
  pre.ok = before.we < before.total && room >= 50 && room < CADENCE.slow.deltaY && !before.pin && !before.loading && !before.tp;
  if (!pre.ok) return { opened, pre };
  const pt = (await evaljs(WHEEL_POINT_SOURCE('down', CADENCE.slow.deltaY))) || { x: Math.round(opened.rect.x + opened.rect.w / 2), y: Math.round(opened.rect.y + opened.rect.h / 2) };
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY: CADENCE.slow.deltaY });
  await sleep(CADENCE.slow.settle);
  const after = await snap(before.topId, before.topOff); const ring = await ringSince(mark);
  const row = { name: 'pin-probe', dir: 'down', speed: 'slow', wheelPx: CADENCE.slow.deltaY, before, after, ring, pt };
  row.verdict = judgeGesture(row);
  const midRepins = ring.filter((e) => e.tag === 'repin' && e.we < e.total).length;
  const tags = {}; for (const e of ring) tags[e.tag] = (tags[e.tag] || 0) + 1;
  console.log(`  [${label}] ② probe precondition: window ${pre.ws}..${pre.we} of ${pre.total} (${pre.total - pre.we} messages below it), viewport parked ${room} px above the DOM's bottom in ${pre.parks} write(s), pin ${pre.pin}, loading ${pre.loading}`);
  console.log('    ' + formatGesture(row, row.verdict) + '  ring: ' + Object.entries(tags).map(([k, v]) => k + (v > 1 ? '×' + v : '')).join(' '));
  return { opened, pre, row, midRepins };
};
const huge = await runGestures(PLAN, 'fix');
check('the huge fixture opened view-only with the whole-file turn map armed (the seek sentinel installed = the owner\'s tail-mode paging), content-visibility on, compact mode', huge.opened?.ok && huge.opened.armed && huge.opened.cv && huge.opened.compact, JSON.stringify(huge.opened));
if (huge.opened?.ok) {
  const R = huge.rows, ch = huge.opened.ch;
  const paged = R.filter((r) => r.verdict.paged).length;
  const cal = R.map((r) => r.after).filter((a) => a.rendered >= 100).map((a) => (a.sh / a.rendered).toFixed(1));
  console.log(`  list ${ch} px, tail ${huge.opened.total} messages over ${huge.opened.gap?.tailStartLine}..${huge.opened.gap?.totalLines} lines; ${paged} of ${R.length} gestures paged; px per rendered card at ≥100 cards: ${cal.join(' ')} (the owner's window: 150 cards ≈ 972 px = 6.5)`);
  check(`the legs are non-vacuous: at least 10 gestures paged the window (${paged})`, paged >= 10);
  check('the trace ring is non-empty after the first gesture (the seek/extend path leaves evidence)', R[0].ring.length > 0, JSON.stringify(R[0].ring.slice(0, 3)));
  const bad = (pred) => R.filter((r) => r.verdict.reasons.some(pred));
  const jumps = bad((x) => /further|gone from the DOM|pageUp band/.test(x));
  check(`① no jump back > ${JUMP_SLACK_VIEWPORTS} viewports on any gesture (the reader's card stays where the wheel put it; a notch never lands inside the ${PAGE_UP_BAND_PX} px pageUp band with history — window OR gap — above)`, jumps.length === 0, jumps.map((r) => r.name + ': ' + r.verdict.reasons.join('; ')).join('\n    '));
  const teleports = bad((x) => /pinned with the window|re-pinned mid-history|DOM's bottom|teleported to the tail/.test(x));
  check('② no pin and no bottom landing before the window reaches the live tail (the DOM edge is a paging boundary, not a pin)', teleports.length === 0, teleports.map((r) => r.name + ': ' + r.verdict.reasons.join('; ')).join('\n    '));
  const blanks = bad((x) => /blank|empty below/.test(x));
  check('③ no blank over 25 % of the viewport after any gesture', blanks.length === 0, blanks.map((r) => r.name + ': ' + r.verdict.reasons.join('; ')).join('\n    '));
  const evidence = bad((x) => /recorded nothing/.test(x));
  check('④ every gesture that paged left evidence in the ring', evidence.length === 0, evidence.map((r) => r.name).join(' '));
  const dead = bad((x) => /moved the reader's card only/.test(x));
  check(`⑤ no dead wheel: every mid-list gesture (no edge, no page) moved the reader's card by ≥ ${Math.round(DELIVERY_MIN_FRACTION * 100)} % of the wheel — inside the gap slab too`, dead.length === 0, dead.map((r) => r.name + ': ' + r.verdict.reasons.join('; ')).join('\n    '));
  // the gap legs are NON-VACUOUS: a slab loaded, and gestures ran INSIDE it without paging
  const gapRows = R.filter((r) => r.name.startsWith('gap-'));
  const slabLoaded = gapRows.some((r) => r.ring.some((e) => e.tag === 'gapUp:done'));
  const inSlab = gapRows.filter((r) => r.before.gapCards > 0 && r.after.gapCards > 0 && !r.verdict.paged && (r.dir === 'up' || r.dir === 'down'));
  check(`the gap legs reached the seek slab (gapUp:done in the ring) and ${inSlab.length} gestures ran INSIDE it without paging (≥ 3: ${inSlab.map((r) => r.name).join(' ')})`, slabLoaded && inSlab.length >= 3, JSON.stringify(gapRows.map((r) => [r.name, r.before.gapCards, r.after.gapCards, r.verdict.paged])));
  // a gap slab lives only directly above message 0: never beside a window that left it, never below a tail card
  const stale = R.filter((r) => !r.after.tp && r.after.ws > 0 && r.after.gapCards > 0);
  check('a gap slab never survives the window leaving message 0 (dropped by the top trim; the walk back to the tail leaves no ancient cards above the fresh slab)', stale.length === 0, stale.map((r) => `${r.name}: ws ${r.after.ws} gapCards ${r.after.gapCards}`).join('; '));
  const misordered = R.filter((r) => r.after.gapBelowTail === 1);
  check('a gap card is never BELOW the first tail card (the fresh tail slab lands below the gap history, never above it)', misordered.length === 0, misordered.map((r) => r.name).join(' '));
  check('the top trim dropped the slab when the window left message 0 (gapDrop traced on the way back to the tail)', R.some((r) => r.ring.some((e) => e.tag === 'gapDrop')), JSON.stringify(R.filter((r) => r.name.startsWith('gap-down-hold')).map((r) => [r.name, r.after.ws, r.after.gapCards])));
  // heights keep settling after a landing (images, fonts, late layout): the anchor hides it from the reader — print the drift so a regression in the ANCHOR is visible
  const drift = R.filter((r) => !r.verdict.paged && (r.dir === 'up' || r.dir === 'down')).map((r) => ({ name: r.name, dsh: r.after.sh - r.before.sh }));
  const maxDrift = drift.reduce((m, d) => Math.max(m, Math.abs(d.dsh)), 0);
  console.log(`  wheel dispatched off the centre line (a card's own scroll box was under it): ${R.filter((r) => r.pointerMoved).length} of ${R.length} gestures; no plain point at all (⑤ not judged): ${R.filter((r) => r.wheelFallback).length}`);
  check('the gap legs found a plain point to wheel over for at least 4 of the mid-slab gestures (⑤ was judged there, not skipped)', inSlab.filter((r) => !r.wheelFallback).length >= 4, JSON.stringify(inSlab.map((r) => [r.name, r.wheelFallback])));
  console.log(`  max |Δsh| on a NON-paging gesture: ${maxDrift} px (${drift.filter((d) => Math.abs(d.dsh) === maxDrift).map((d) => d.name).join(' ') || '-'}; the reserve resolves placeholders once at insert, later drift is absorbed by the anchor)`);
  const allTags = R.flatMap((r) => r.ring);
  check('the count trim never ran: no anchorLost {why:removed}, no extendTop landing anchored:false at scrollTop 0', !allTags.some((e) => e.tag === 'anchorLost' && e.why === 'removed') && !allTags.some((e) => e.tag === 'extendTop:done' && !e.anchored && e.st === 0), JSON.stringify(allTags.filter((e) => e.tag === 'anchorLost').slice(0, 3)));
  check('the pinned auto-follow never ran mid-history: no repin with we < total, no pageDown with pin:1 while the window was partial', !allTags.some((e) => e.tag === 'repin' && e.we < e.total) && !allTags.some((e) => e.tag === 'pageDown' && e.pin === 1 && e.we < e.total), JSON.stringify(allTags.filter((e) => e.tag === 'repin').slice(0, 3)));
  check('the scroll-to-bottom button returns to the live tail and pins there', (() => { const b = R.find((r) => r.dir === 'btn'); return b && b.after.we >= b.after.total && b.after.pin === 1; })(), JSON.stringify(R.find((r) => r.dir === 'btn')?.after));
  const grown = allTags.filter((e) => e.tag === 'extendTop:grown').map((e) => e.passes);
  console.log(`  grow passes per landing: ${grown.join(' ') || '(single-pass landings only)'}; trims: ${allTags.filter((e) => e.tag === 'trimBottom').length} bottom / ${allTags.filter((e) => e.tag === 'trimTop').length} top / ${allTags.filter((e) => e.tag === 'trimSkipZone').length} zone-skips; carried notches: ${allTags.filter((e) => e.tag === 'wheelCarry').length}`);
}

// ── 4c'. THE ② PROBE ON THE FIX (the positive half of the constructed control below) ──
{
  const p = await pinProbe(PORT, 'fix');
  check(`② probe on the fix — precondition held: a partial window with the viewport parked ${PROBE_D} px above the DOM's bottom, unpinned, idle (${JSON.stringify(p.pre || p.opened)})`, !!p.pre?.ok, JSON.stringify(p.pre || p.opened));
  if (p.row) check('② probe on the fix: the notch that crosses into the pin band pages instead — no pin, no bottom landing, no walk to the tail, no repin with we < total', !p.row.verdict.reasons.some(TELEPORT) && p.midRepins === 0, p.row.verdict.reasons.join('; ') + ` (repins with we < total: ${p.midRepins})`);
}

// ── 4e. THE RELEASE FRAME (B-1192): a paging slab's fresh-height reservation
// (_reserveFreshHeights) used to come off two frames after the landing wherever
// the card was. A fresh slab card never rendered under content-visibility:auto,
// so it has no remembered size, and the frame its override came off laid it out
// at its lock size — measured on this fixture: a 407 px slab read 10 px and
// scrollTop swung 562 → 168 → 562 inside one page-up landing. Any layout read in
// that frame (the keep zone's _cardPositions, the scroll handler, the pin) saw a
// geometry the reader never did; the heavy tier caught it as a downward gesture
// whose trim took the reader's top card (red on the first attempt of both .160
// integration runs, green on every retry). The leg: page-up landings driven by
// the view's own _extendTop under a synthetic 3-frame main-thread stall starting
// in the landing's frame, a per-rAF logger reading every fresh card's height
// after EVERY rAF callback (the release callback included), judged against the
// settled heights for cards inside the TRIM KEEP ZONE (viewport ± one viewport);
// the reader's card must survive every landing. The control swaps the pre-fix
// two-frame release onto the same view (an own property over the prototype).
// On a red, the first offending frame's geometry is printed — the evidence.
const RELEASE_LEG = (control) => `(async () => {
  const v = window.__v, list = v._messageList, ch = list.clientHeight;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf0 = window.requestAnimationFrame;
  const proto = Object.getPrototypeOf(v)._reserveFreshHeights;
  const PRE_FIX = function (els) {
    if (!els?.length || this._readOnly || this._container?.classList.contains('chat-no-content-visibility')) return;
    for (const el of els) el.style.contentVisibility = 'visible';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (this._disposed) return;
      for (const el of els) if (el.style.contentVisibility === 'visible') el.style.contentVisibility = '';
    }));
  };
  const base = ${control} ? PRE_FIX : proto;
  let stalled = 0;
  v._reserveFreshHeights = function (els, o) {
    const r = base.call(this, els, o);
    let n = 3; const spin = () => { const e = performance.now() + 45; while (performance.now() < e); stalled++; if (--n > 0) raf0.call(window, spin); };
    raf0.call(window, spin);
    return r;
  };
  const topCard = () => { const st = list.scrollTop; for (const c of list.children) { if (c.classList.contains('chat-msg') && c.offsetHeight > 0 && c.offsetTop + c.offsetHeight > st) return c; } return null; };
  const out = [];
  // 6 page-up landings (then the product's bottom trim leaves the window short of the tail), then 5
  // page-DOWN landings parked at the DOM's bottom — where the fresh slab lands ON
  // SCREEN, the case the two-frame release re-locked in view
  const plan = ['up', 'up', 'up', 'up', 'up', 'up', 'down', 'down', 'down', 'down', 'down'];
  try {
    for (const dir of plan) {
      if (dir === 'up' && v._windowStart <= 0) continue;
      if (dir === 'down' && v._windowEnd >= v._total) {
        // leave the live tail the way an upward reader does: park at the top, the product's own bottom trim
        list.scrollTop = 0; await sleep(400); v._trimBottom(); await sleep(300);
        if (v._windowEnd >= v._total) continue;
      }
      if (dir === 'down') { list.scrollTop = list.scrollHeight - list.clientHeight; await sleep(700); }
      const old = new Set(list.children);
      const reader = topCard();
      const log = [];
      const snap = () => {
        const st = list.scrollTop;
        const fresh = [];
        for (const c of list.children) if (!old.has(c) && c.classList.contains('chat-msg')) fresh.push({ c, h: c.offsetHeight, top: c.offsetTop - st, cv: c.style.contentVisibility ? 'V' : '.' });
        log.push({ t: Math.round(performance.now()), st: Math.round(st), sh: list.scrollHeight, fresh, readerIn: reader ? reader.isConnected : true, readerAt: reader && reader.isConnected ? Math.round(reader.offsetTop - st) : null });
      };
      window.requestAnimationFrame = (cb) => raf0.call(window, (ts) => { cb(ts); snap(); });
      const ws0 = v._windowStart, we0 = v._windowEnd;
      try { if (dir === 'up') await v._extendTop(); else await v._extendBottom(); await sleep(900); }
      finally { window.requestAnimationFrame = raf0; }
      snap();
      const fin = log[log.length - 1];
      const settled = new Map(fin.fresh.map((f) => [f.c, f.h]));
      let first = null, nBad = 0, nScreen = 0;
      for (const l of log) {
        const off = l.fresh.filter((f) => settled.has(f.c) && Math.abs(f.h - settled.get(f.c)) > 2 && f.top + f.h > -ch && f.top < 2 * ch);
        if (!off.length) continue;
        nBad++;
        const vis = (f) => f.top + Math.max(f.h, 1) > 0 && f.top < ch; // in THAT frame's geometry: a card whose box (or 0 px line) lies in the viewport
        const onScreen = off.some(vis);
        off.sort((a, b) => vis(b) - vis(a));
        if (onScreen) nScreen++;
        if (!first || (onScreen && !first.onScreen)) first = { t: l.t, st: l.st, sh: l.sh, settledSt: fin.st, settledSh: fin.sh, readerAt: l.readerAt, cv: l.fresh.map((f) => f.cv).join(''), onScreen, cards: off.slice(0, 6).map((f) => ({ top: f.top, h: f.h, settled: settled.get(f.c), cv: f.cv, cls: f.c.className.replace('chat-msg ', '').slice(0, 32) })) };
      }
      out.push({ dir, ws: [ws0, v._windowStart], we: [we0, v._windowEnd], frames: log.length, fresh: fin.fresh.length, nBad, nScreen, first, readerLost: log.some((l) => !l.readerIn), readerAt: [log[0]?.readerAt, fin.readerAt] });
    }
  } finally { delete v._reserveFreshHeights; window.requestAnimationFrame = raf0; }
  return { ch, stalled, landings: out };
})()`;
const releaseLeg = async (control) => {
  await pageReady(PORT, 'release ' + (control ? 'control' : 'fix'));
  await sleep(1500);
  const opened = await evaljs(OPEN_HUGE(SID3, CWD, 'huge release ' + (control ? 'control' : 'fix')));
  if (!opened?.ok) return { opened };
  return { opened, ...(await evaljs(RELEASE_LEG(control))) };
};
console.log('§4e the release frame (B-1192): a paging landing under a 3-frame stall never lays a fresh slab card out ON SCREEN at a height the reader does not see');
{
  const fix = await releaseLeg(false);
  const L = fix.landings || [];
  const line = (tag, l) => `    [${tag}] ${l.dir.padEnd(4)} landing ws ${l.ws[0]}→${l.ws[1]} we ${l.we[0]}→${l.we[1]}: ${l.fresh} fresh cards, ${l.frames} rAF reads, ${l.nScreen} read(s) with a fresh card ON SCREEN off its settled height, ${l.nBad} in the keep zone (informational — off screen, absorbed by scroll anchoring), reader ${l.readerLost ? 'LOST' : 'kept'}${l.first ? ` — first: st ${l.first.st} (settles at ${l.first.settledSt}), sh ${l.first.sh} (settles at ${l.first.settledSh}), ${JSON.stringify(l.first.cards.slice(0, 2))}` : ''}`;
  for (const l of L) console.log(line('fix', l));
  const up = L.filter((l) => l.dir === 'up'), down = L.filter((l) => l.dir === 'down');
  check(`§4e the leg ran: ≥ 3 page-up and ≥ 2 page-down landings with fresh cards under the stall (${up.length} up, ${down.length} down, ${fix.stalled} stalled frames)`, up.length >= 3 && down.length >= 2 && L.every((l) => l.fresh > 0) && fix.stalled >= 3 * L.length, JSON.stringify(fix.opened || fix).slice(0, 400));
  const bad = L.filter((l) => l.nScreen);
  check('§4e no fresh slab card ON SCREEN is ever laid out at a height other than its settled one — in its release frame or any other (the override comes off only once the card has left the viewport)', L.length && !bad.length, 'first offending frame (evidence): ' + JSON.stringify(bad[0]?.first));
  check('§4e the reader\'s card survives every landing', L.length && !L.some((l) => l.readerLost), JSON.stringify(L.map((l) => l.readerAt)));
  const ctl = await releaseLeg(true);
  const C = ctl.landings || [];
  for (const l of C) console.log(line('control', l));
  check(`§4e NEGATIVE CONTROL: the pre-fix two-frame release on the same view lays a fresh card out ON SCREEN off its height (${C.filter((l) => l.nScreen).length} of ${C.length} landings) — the leg sees the defect`, C.length >= 5 && C.some((l) => l.nScreen), JSON.stringify(ctl.opened || C).slice(0, 400));
}

// ── 4d. THE PRE-FIX CONTROL: the same fixture and gestures on a scratch copy of
// the client whose two rules are patched out — the trim's keep zone (back to
// BY COUNT) and the pin predicate's `windowEnd ≥ total` term. The control must
// REPRODUCE the incident's numbers (a jump back on an upward gesture, a pin or
// bottom landing mid-history on a downward one); a control that passes the
// legs means the legs test nothing. The patch is by exact strings, so a
// refactor of the fix fails here loudly instead of silently unpatching.
// ① is judged on the plan's up rows; ② on the CONSTRUCTED probe (pinProbe,
// 2.369.155) — the plan's down rows settled pinned locally and unpinned on the
// Actions runner, so a ② judged on them was a coin toss, not a control.
console.log('§4d pre-fix control: the same legs on a copy with the keep zone and the pin predicate patched out must reproduce the incident');
{
  const CONTROL_PATCHES = [
    // the trims back to BY COUNT (the zone break removed on both edges)
    ["if (n >= must && pos[i].top < zone.bottom) break;", "/* control: by count */"],
    ["if (n >= must && pos[i].bottom > zone.top) break;", "/* control: by count */"],
    // the grow rule back to the WHOLE window's height (2.369.129) — what let a count trim's collapsed remainder refill and trim again
    ["const short = above < this._messageList.clientHeight;", "const short = this._messageList.scrollHeight < this._messageList.clientHeight * 2;"],
    // the anchor back to the list's first child at the top edge (the seek sentinel in a huge session)
    ["const skip = (c) => runChrome(c) || c._isSeekSentinel;", "const skip = (c) => runChrome(c);"],
    // the pin predicate without windowEnd ≥ total
    ["return !this._teleported && this._windowEnd >= this._total && scrollHeight - scrollTop - clientHeight < 50;", "return !this._teleported && scrollHeight - scrollTop - clientHeight < 50;"],
    // r1's overshoot carry off (the layered-guard rule: a new layer is stripped from the older layer's control —
    // a crossing wheel-down now pages the DOM edge from the wheel handler before the mid-history pin can stick,
    // which masked ② on the control), back to the edge-only carry the g2 control went red with
    ["if (e.deltaY < 0 && (roomUp < 10 || px > roomUp)) {", "if (e.deltaY < 0 && roomUp < 10) {"],
    ["&& (roomDown < 10 || px > roomDown)) {", "&& roomDown < 10) {"],
    ["  _addWheelCarry(dir, px) {", "  _addWheelCarry(dir, px) { px = Math.abs(px) + this._messageList.scrollTop; /* control: the whole notch, edge-only */"],
  ];
  const [CPORT] = await freePorts(1);
  const cwt = scratch('chatpage-control');
  try { execSync(`git worktree remove --force ${cwt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  execSync(`git worktree add --detach ${cwt} HEAD`, { cwd: repo, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${cwt}/${f} && cp -r ${repo}/${f} ${cwt}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(cwt, 'node_modules'));
  const cvPath = path.join(cwt, 'src/lib/chat-view.js');
  let src = fs.readFileSync(cvPath, 'utf8');
  let patched = 0;
  for (const [from, to] of CONTROL_PATCHES) { const k = src.split(from).length - 1; if (k === 1) { src = src.replace(from, to); patched++; } }
  check(`control setup: all ${CONTROL_PATCHES.length} patch anchors found exactly once in the fix (a control that cannot be built proves nothing)`, patched === CONTROL_PATCHES.length, `${patched} patched`);
  fs.writeFileSync(cvPath, src);
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: cwt, stdio: 'ignore' });
  const csrv = spawn(process.execPath, ['server.js'], { cwd: cwt, env: { ...process.env, PORT: String(CPORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
  const prevCleanup = cleanup;
  const cleanupControl = () => { try { csrv.kill('SIGKILL'); } catch {} try { execSync(`git worktree remove --force ${cwt}`, { cwd: repo, stdio: 'ignore' }); } catch {} };
  process.on('exit', cleanupControl);
  check('control: the patched copy\'s server answered', await serverUp(CPORT));
  await pageReady(CPORT, 'control');
  await sleep(1500);
  const CONTROL_PLAN = [['up-slow-1', 'up', 'slow'], ['up-slow-2', 'up', 'slow'], ['up-mid-1', 'up', 'mid'], ['up-mid-2', 'up', 'mid'], ['up-fast-1', 'up', 'fast'], ['up-fast-2', 'up', 'fast'],
    ['down-mid-1', 'down', 'mid'], ['down-mid-2', 'down', 'mid'], ['down-fast-1', 'down', 'fast'], ['down-fast-2', 'down', 'fast'], ['down-fast-3', 'down', 'fast'], ['down-fast-4', 'down', 'fast']];
  const ctl = await runGestures(CONTROL_PLAN, 'control');
  check('control: the fixture opened on the patched copy', ctl.opened?.ok && ctl.opened.armed, JSON.stringify(ctl.opened));
  if (ctl.opened?.ok) {
    const R = ctl.rows, allTags = R.flatMap((r) => r.ring);
    const jumps = R.filter((r) => r.dir === 'up' && r.verdict.reasons.some((x) => /further|gone from the DOM|pageUp band/.test(x)));
    const countTrims = allTags.filter((e) => e.tag === 'anchorLost' && e.why === 'removed').length + allTags.filter((e) => e.tag === 'extendTop:done' && !e.anchored && e.st === 0).length;
    check(`NEGATIVE CONTROL ①: with the trim back to BY COUNT an upward gesture JUMPS by the rules themselves (${jumps.length} of ${R.filter((r) => r.dir === 'up').length} up gestures violate; anchor-lost / st-0 landings in the ring: ${countTrims}) — the rule can go red`, jumps.length >= 1 && countTrims >= 1, R.filter((r) => r.dir === 'up').map((r) => r.name + ' dev=' + (r.after.topDev == null ? 'gone' : r.after.topDev - (-r.wheelPx)) + ' ws ' + r.before.ws + '→' + r.after.ws).join('\n    '));
    // the plan's own down rows are TIMING-DEPENDENT evidence for ② (the mirror: repins every run, rows that settle
    // unpinned) — printed, never judged; the constructed probe below is the control
    const teleports = R.filter((r) => r.dir === 'down' && r.verdict.reasons.some(TELEPORT));
    console.log(`  (informational) the plan's down rows: ${teleports.length} violate ②; repins with we < total in the plan's ring: ${allTags.filter((e) => e.tag === 'repin' && e.we < e.total).length}`);
  }
  // NEGATIVE CONTROL ② — the constructed probe on the patched copy (see pinProbe)
  const p = await pinProbe(CPORT, 'control');
  check(`NEGATIVE CONTROL ② precondition held: a partial window with the viewport parked ${PROBE_D} px above the DOM's bottom, unpinned, idle (${JSON.stringify(p.pre || p.opened)})`, !!p.pre?.ok, JSON.stringify(p.pre || p.opened));
  if (p.row) check(`NEGATIVE CONTROL ②: without the windowEnd ≥ total term ONE notch across the pin band PINS the view in the middle of history by the rules themselves (${p.row.verdict.reasons.filter(TELEPORT).join('; ') || 'no ② reason'}; repins with we < total in the probe's ring: ${p.midRepins}) — the rule can go red`, p.row.verdict.reasons.some(TELEPORT) && p.midRepins >= 1, formatGesture(p.row, p.row.verdict));
  cleanupControl();
  process.off('exit', cleanupControl);
  void prevCleanup;
}

// ── 4f. FIRST PAINT BY TEXT COUNT (perf lane A, 2.369.167): the attach slab is a
// TEXT window (src/text-window.js), not tail(50). On the §1c fixture, opened
// exactly as §4c opens it, the view must — after attach and BEFORE any gesture —
// hold ≥ minText text cards (or, stopped by the growth budget, more than
// tail(50)), render at least as tall as tail(50) does (it is a superset of it),
// and obey THE RESCUE LAW: a first paint that fills its viewport pages nothing
// before the first gesture; one that does not gets exactly one rescue (autoFill,
// traced at sh ≤ ch). 2.369.167 r1: the lane's "≥ 2 viewports, no rescue" was a
// reading of THIS box's fonts on THIS box's fixture — the mirror measured 1.58
// (its system font sets the one-line cards shorter, and the fixture's tail
// differed: see huge-transcript-fixture.mjs, the stopping point) — a geometry
// the product never promised; the slab is chosen by TEXT, never by px.
// THE CONTROL is a scratch copy whose server keeps tail(50) (the client is the
// fix's): it must fail the text leg, or the legs test nothing.
// First paint (history-render-ms, kept on the view) and the attach frame's
// length (ws.js `__vsAttachFrames`) are printed; the frame is bounded.
console.log('§4f first paint by text count: the §1c attach slab holds ≥ minText text cards, renders at least as tall as tail(50) and obeys the rescue law; the control (server tail(50)) must fail the text leg');
{
  const TW_SRC = fs.readFileSync(path.join(repo, 'src/text-window.js'), 'utf8');
  const { TEXT_WINDOW } = require('../src/text-window.js');
  const FIRST = `(() => {
    const tw = (function () { const module = { exports: {} }; ${TW_SRC}; return module.exports; })();
    const v = window.__v, list = window.__list;
    const byId = new Map((v._messages || []).map((m) => [m.id, m]));
    const cards = [...list.querySelectorAll(':scope > .chat-msg:not(.chat-gap-msg)')];
    const ring = v._traceRing || [];
    const frames = (window.__vsAttachFrames || []).filter((f) => f.sid === v.sessionId);
    return { renderMs: v._lastHistoryRenderMs == null ? null : Math.round(v._lastHistoryRenderMs), n: cards.length, textCards: cards.filter((c) => tw.isTextCard(byId.get(c.dataset.msgId))).length,
      sh: list.scrollHeight, ch: list.clientHeight, autoFill: ring.filter((e) => e.tag === 'autoFill').length, fill: ring.filter((e) => e.tag === 'autoFill').map((e) => ({ sh: e.sh, ch: e.ch })), grown: ring.filter((e) => e.tag === 'extendTop:grown').length,
      extends: ring.filter((e) => e.tag === 'extendTop:done').length, ws: v._windowStart, total: v._total, frame: frames[frames.length - 1] || null, frames: frames.length };
  })()`;
  const firstPaint = async (port, label) => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    for (let i = 0; i < 60; i++) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(400); }
    await sleep(1500);
    const opened = await evaljs(OPEN_HUGE(SID3, CWD, 'huge first ' + label));
    if (!opened?.ok) return { opened };
    const m = await evaljs(FIRST);
    console.log(`  [${label}] first paint ${m.renderMs} ms; ${m.n} cards (${m.textCards} text) = window ${m.ws}..${m.total}; sh/ch ${m.sh}/${m.ch} = ${(m.sh / m.ch).toFixed(2)}; autoFill ${m.autoFill}, grown ${m.grown}, extends ${m.extends}; attached frame ${m.frame ? (m.frame.len / 1024).toFixed(0) + ' KB / ' + m.frame.n + ' records' : 'NOT SEEN'}`);
    return { opened, m };
  };
  // THE RESCUE LAW (_shortViewNeedsFill / _scheduleAttachFill): no rescue ⇔ the first paint filled its viewport
  const rescueLaw = (m) => m.autoFill === 0 ? (m.sh > m.ch && m.extends === 0 && m.grown === 0) : (m.autoFill === 1 && m.fill[0].sh <= m.fill[0].ch && m.extends >= 1);
  const fix = await firstPaint(PORT, 'fix');
  check('§4f the fix opened the §1c fixture and saw its attached frame', !!fix.m && !!fix.m.frame, JSON.stringify(fix.opened));
  if (fix.m) {
    const m = fix.m;
    check(`§4f …and obeys the rescue law (sh/ch ${m.sh}/${m.ch} = ${(m.sh / m.ch).toFixed(2)}; autoFill ${m.autoFill}${m.fill.length ? ' at ' + m.fill.map((f) => f.sh + '/' + f.ch).join(' ') : ''}; extends ${m.extends}) — a first paint that fills its viewport pages nothing before the first gesture, one that does not gets exactly one rescue`, rescueLaw(m), JSON.stringify(m));
    check(`§4f the attached frame is bounded: ${(m.frame.len / 1048576).toFixed(2)} MB ≤ 1.9 MB and the slab ≤ maxRecords (${m.frame.n}) (the tight bound — ≤ 128 KiB over tail(50) — is asserted against the control below)`, m.frame.len <= 1.9 * 1048576 && m.frame.n <= TEXT_WINDOW.maxRecords, JSON.stringify(m.frame));
    // the reconnect no-op (2.369.2) with the bigger slab: a SECOND attach of the same conversation (the reconnect
    // re-attach's round trip, sent by hand — the reconnect ladder skips read-only windows, and this view-only
    // window has no live session to re-attach) must ship the SAME slab, and loadHistory must skip the rebuild
    const re = await evaljs(`(async () => {
      const v = window.__v, mark = v._traceSeq || 0;
      const d = await new Promise((resolve) => {
        const h = (m) => { if (m.type === 'attached' && m.sessionId === v.sessionId) { window.app.ws.offGlobal(h); resolve(m); } };
        window.app.ws.onGlobal(h);
        window.app.ws.send({ type: 'attach', sessionId: v.sessionId, viewOnly: true, backend: 'claude', backendSessionId: ${JSON.stringify(SID3)}, claudeSessionId: ${JSON.stringify(SID3)}, cwd: ${JSON.stringify(CWD)} });
        setTimeout(() => { window.app.ws.offGlobal(h); resolve(null); }, 30000);
      });
      if (!d) return { ok: false };
      const cur = v._messages || [];
      const same = d.messages.length === cur.length && d.messages[0]?.id === cur[0]?.id && d.messages[d.messages.length - 1]?.id === cur[cur.length - 1]?.id;
      v.loadHistory(d.messages, d.totalCount, false, { chatStatus: d.chatStatus });
      const ring = (v._traceRing || []).filter((e) => e.seq > mark);
      return { ok: true, n: d.messages.length, same, skip: ring.some((e) => e.tag === 'loadHistory:identical-skip') };
    })()`);
    console.log(`  [fix] second attach: ${re.n} records, same slab ${re.same}; identical-skip ${re.skip}`);
    check('§4f a second attach of the same conversation ships the SAME slab (the window is a pure function of the list) and loadHistory skips the rebuild (2.369.2 stays reachable)', re.ok && re.same && re.n === m.frame.n && re.skip, JSON.stringify(re));
  }
  // THE CONTROL: the fix's client, a server whose attach paths keep tail(50)
  const [TPORT] = await freePorts(1);
  const twt = scratch('chatpage-tail50');
  try { execSync(`git worktree remove --force ${twt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  execSync(`git worktree add --detach ${twt} HEAD`, { cwd: repo, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${twt}/${f} && cp -r ${repo}/${f} ${twt}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(twt, 'node_modules'));
  const TAIL50 = [['src/ws-handler.js', 'session._normalizer.tailWindow(attachWindowOpts(data.slab))', 'session._normalizer.tail(50)'], ['src/ws-handler.js', 'messages: mm.tailWindow(attachWindowOpts(data.slab)), totalCount', 'messages: mm.tail(50), totalCount'], ['src/transcript-service.js', 'messages: mm.tailWindow(), total', 'messages: mm.tail(50), total']];
  let tp = 0;
  for (const [f, from, to] of TAIL50) { const fp = path.join(twt, f); const src = fs.readFileSync(fp, 'utf8'); if (src.split(from).length === 2) { fs.writeFileSync(fp, src.replace(from, to)); tp++; } }
  check(`§4f control setup: all ${TAIL50.length} tail(50) anchors found exactly once (a control that cannot be built proves nothing)`, tp === TAIL50.length, `${tp} patched`);
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: twt, stdio: 'ignore' });
  const tsrv = spawn(process.execPath, ['server.js'], { cwd: twt, env: { ...process.env, PORT: String(TPORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
  const cleanupTail = () => { try { tsrv.kill('SIGKILL'); } catch {} try { execSync(`git worktree remove --force ${twt}`, { cwd: repo, stdio: 'ignore' }); } catch {} };
  process.on('exit', cleanupTail);
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${TPORT}/api/home`); break; } catch { await sleep(250); } }
  const ctl = await firstPaint(TPORT, 'control tail(50)');
  check('§4f control: the fixture opened on the tail(50) copy', !!ctl.m && !!ctl.m.frame, JSON.stringify(ctl.opened));
  if (ctl.m) {
    const m = ctl.m;
    check(`NEGATIVE CONTROL §4f: tail(50) ships 50 records holding fewer than minText text cards (${m.textCards}) — the text leg can go red`, m.frame.n === 50 && m.textCards < TEXT_WINDOW.minText, JSON.stringify(m));
    check(`§4f control: tail(50) obeys the same rescue law (sh/ch ${(m.sh / m.ch).toFixed(2)}; autoFill ${m.autoFill}) — the law is the client's, whatever the slab`, rescueLaw(m), JSON.stringify(m));
    if (fix.m) check(`§4f the text window renders at least as tall as tail(50) — it is a superset of it (${fix.m.sh} px vs ${m.sh} px in the same ${m.ch} px list)`, fix.m.sh >= m.sh - 2 && Math.abs(fix.m.ch - m.ch) <= 2, JSON.stringify({ fix: [fix.m.sh, fix.m.ch], ctl: [m.sh, m.ch] }));
    // perf r1: the window is bounded by GROWTH (≤ maxGrowthBytes past the floor), so on a cut whose next
    // records past the budget are heavy it may stop short of minText — it must then still hold MORE text than
    // tail(50) and have paid at most the growth budget over the control's frame (same turnMap, same live facts)
    if (fix.m && fix.m.frame && m.frame) {
      const extra = fix.m.frame.len - m.frame.len;
      check(`§4f the attach slab holds ≥ minText (${TEXT_WINDOW.minText}) text cards, or — stopped by the growth budget — more than tail(50) (${fix.m.textCards} vs ${m.textCards}) for ≤ maxGrowthBytes over the control's frame (+${(extra / 1024).toFixed(0)} KB ≤ ${TEXT_WINDOW.maxGrowthBytes / 1024} KB)`,
        (fix.m.textCards >= TEXT_WINDOW.minText || fix.m.textCards > m.textCards) && extra <= TEXT_WINDOW.maxGrowthBytes * 1.02, JSON.stringify({ fix: fix.m.frame, ctl: m.frame }));
    }
    if (fix.m) console.log(`  first paint fix ${fix.m.renderMs} ms vs control ${m.renderMs} ms; attached frame fix ${(fix.m.frame.len / 1024).toFixed(0)} KB vs control ${(m.frame.len / 1024).toFixed(0)} KB (×${(fix.m.frame.len / m.frame.len).toFixed(1)}); text cards ${fix.m.textCards} vs ${m.textCards}; sh/ch ${(fix.m.sh / fix.m.ch).toFixed(2)} vs ${(m.sh / m.ch).toFixed(2)}; rescue ${fix.m.autoFill}/${m.autoFill}`);
  }
  cleanupTail();
  process.off('exit', cleanupTail);
}

// ── 5. THE REAL HOME IS UNTOUCHED. Not "no new entry at all": this box runs
// many real sessions concurrently and a genuine project dir may appear
// mid-run. What must be impossible is a FIXTURE entry — anything this suite
// (or any suite sharing the convention) could have written. src/fixture-guard.js
// owns the predicate; the sweep suite runs the same one over the whole dir.
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new entr${added.length === 1 ? 'y' : 'ies'} from concurrent real sessions, 0 of them fixtures)`,
    lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
  check('…and this suite\'s OWN project dir is not among them (it lives under the isolated home)',
    !after.some((d) => d.name === path.basename(PROJ)), path.basename(PROJ));
  check('the fixture really was written (the isolation did not just skip the work)',
    fs.existsSync(path.join(PROJ, `${SID}.jsonl`)) && fs.statSync(path.join(PROJ, `${SID}.jsonl`)).size > 30e6,
    path.join(PROJ, `${SID}.jsonl`));
}

ws.close();
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
