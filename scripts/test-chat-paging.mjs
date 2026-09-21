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
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1400,1000',
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
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

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
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 60; i++) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(400); }
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
console.log('§4b fold-dominated: one wheel notch = one landing on a full viewport; the bottom is never trimmed while short; the reader never lands on the top of a slab they did not ask for');
const fold = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.app.viewSession('${SID2}', '${CWD}', 'fold test');
  let v = null;
  for (let i = 0; i < 60; i++) {
    const w = [...window.app.wm.windows.values()].find((w) => String(w.title || '').includes('fold test'));
    v = (w && window.app.sessions.get(w.id)) || null;
    if (v && v._messageList && v._messageList.querySelectorAll('.chat-msg').length > 10) break;
    await sleep(300);
  }
  if (!v) return { ok: false };
  await sleep(1500); // initial render + fold settle
  const list = v._messageList;
  const ch = list.clientHeight;
  const out = { ok: true, ws0: v._windowStart, ch, rendered0: list.querySelectorAll('.chat-msg').length, sh0: list.scrollHeight, notches: [] };
  for (let k = 0; k < 6; k++) {
    if (v._windowStart <= 0) break;
    const mark = (v._traceRing || []).length;
    list.scrollTop = 0;
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
    await sleep(2600);
    const tail = (v._traceRing || []).slice(mark);
    out.notches.push({ extends: tail.filter((e) => e.tag === 'extendTop:done').length, grown: tail.some((e) => e.tag === 'extendTop:grown'), trimBottom: tail.filter((e) => e.tag === 'trimBottom').length, foldCeiling: tail.filter((e) => e.tag === 'foldCeiling').length, st: Math.round(list.scrollTop), sh: list.scrollHeight, ws: v._windowStart, rendered: list.querySelectorAll('.chat-msg').length });
  }
  return out;
})()`);
console.log('  fold:', JSON.stringify(fold).slice(0, 900));
check('the fold-dominated view-only chat opened and paged at least twice', !!fold?.ok && fold.notches.length >= 2, JSON.stringify(fold));
if (fold?.ok) {
  const N = fold.notches, ch = fold.ch;
  check(`every notch that still has history above leaves the window ≥ 2 viewports tall (grow by HEIGHT) — (${N.map((n) => n.sh + '/' + n.ws).join(' ')})`, N.every((n) => n.ws === 0 || n.sh >= 2 * ch), N);
  check('the first notch needed more than one slab (the fold makes 50 records a few hundred px) and fired ONE grown landing', N[0].extends > 1 && N[0].grown === true && N[0].extends <= 8, N[0]);
  check('the bottom is never trimmed while the window is short (a trim there removes the content on screen)', N.every((n) => n.trimBottom === 0 || n.sh >= 2 * ch), N);
  check(`the reader never lands on the very top with history still above (the incident\'s "跳到最顶部") — st per notch: ${N.map((n) => n.st).join(' ')}`, N.every((n) => n.ws === 0 || n.st > 0), N);
  check('no fold ceiling was hit in six notches (the ceiling is the bound, not the routine)', N.every((n) => n.foldCeiling === 0), N);
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
