#!/usr/bin/env node
// A SEND ALWAYS LANDS ON THE SENT MESSAGE (B-172e, inc-mt1zrvj3-wsr4, owner on
// 2.361.6: "上翻状态发消息后不显示刚发的消息" — after scrolling UP in a chat,
// sending a message did not show it: the transcript had it, the view did not).
//
// Three mechanisms, each reproduced on the real path before its fix:
//   ① THE TAIL FETCH LOST THE ECHO: a paged-up window (windowEnd < total) sends
//      through jumpToBottom(), which fetched [start, total) with the total read
//      BEFORE the await. The server feeds the user's message live in the same
//      breath (src/server/user-input.js → feedLive), so its `create` op arrives
//      DURING the fetch — on a view still unpinned in history, i.e. deferred
//      (`_total++`, no card) — and the slab that then replaced the DOM ended one
//      record short of it. The view landed on the live tail WITHOUT the message
//      it was sent for. Fix: the live ops are HELD for the tail fetch and replayed
//      in order once the slab is the view (an op the slab already holds dedups by
//      id; an edit is a field assign, so a replay is idempotent).
//   ② A SLAB IS NOT THE TAIL: a teleported (seek-slab) view keeps its window
//      accounting from before the jump, so with nothing new since, onSend took
//      the "already at the live tail" branch — pinned the SLAB and scrolled to its
//      bottom — while every live op is deferred in teleport mode. The view stayed
//      in the slab with the sent message nowhere. Fix: a teleported view sends
//      through jumpToBottom() like any window that does not end at the tail
//      (the resume re-tail already reads `_teleported || windowEnd < total`).
//   ③ A STALE PAGE LANDED ON THE NEW TAIL: an extend (either edge) still in
//      flight when the send rebuilt the window wrote its old slab into the new
//      one — older history appended BELOW the sent message (extendBottom) or a
//      hole prepended above the tail (extendTop) — and its window bounds over the
//      tail's. Fix: a full-window rebuild bumps `_windowGen`; an extend whose
//      fetch returns into a newer generation drops its slab.
//   ④ A HUNG TAIL FETCH HELD THE VIEW (verify r1): ①'s hold was released by the
//      LAST overlapping jumpToBottom to finish, so one tail fetch that never
//      answered kept every live op held — the reader's ↓ (and the next send)
//      landed a slab sized before the echo, pinned, with nothing rendering until
//      the hung fetch resolved; then ITS older slab replaced the view. Fix: only
//      the NEWEST tail call lands or fails for the view (`_tailCall`); an older
//      call answered later drops its slab.
//
// THE HARNESS: a scratch worktree server (fake HOME, free ports) with ONE live
// chat session under the REAL data/bin/chat-wrapper.js driving a stub `claude`
// (init frame for the resumed id; every stdin line carrying a nonce answered by
// one assistant text `ack <nonce>` and a result) over a §1c-shaped transcript
// (scripts/huge-transcript-fixture.mjs); headless chrome; REAL wheel gestures
// (CDP Input.dispatchMouseEvent) to leave the tail; the message TYPED into the
// composer and sent with a real Enter (Input.insertText + Input.dispatchKeyEvent).
// ③ holds the extend's own /api/session-messages request with CDP Fetch until
// the send has landed — a constructed race, every other request passes; ④ holds
// the send's own tail fetch (the hung request) while the reader clicks ↓ and
// sends again, then releases it.
//
// THE VERDICT per row, on a settled snapshot: the sent card is in the DOM and on
// screen, the view is pinned at the live tail (not teleported, windowEnd = total),
// the stub's answer rendered below it, nothing older than the send below it, and
// the window's bounds describe what it holds (|(we − ws) − messages| ≤ 2).
//
// CONTROLS (a leg that cannot go red proves nothing): three scratch copies, each
// with ONE fix reverted at source level by a string-exact marker (asserted, and
// asserted again in the built bundle) — ctl-hold runs ①, ctl-send ②, ctl-gen ③,
// ctl-newest ④ (its revert is four replacements: the head's last-to-finish
// release) — and each must fail its own row.
// Run: node scripts/test-chat-send-landing.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
import { writeHugeTranscript } from './huge-transcript-fixture.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const FIXTURE_MB = Number(process.env.VS_SEND_FIXTURE_MB || 40); // > 34 MB: the server reports a GAP — a teleport (the seek slab) exists only then
const SID = fixtureSid('5e0d');
// THE THREE FIXES, each revertible by ONE string-exact replacement (the control copies)
const FIXES = {
  send: { file: 'src/lib/chat-view.js', fixed: 'if (this._teleported || this._windowEnd < this._total) { // B-172e ②', pre: "if ((window.__sendCtl = 'send reverted') && this._windowEnd < this._total) {" },
  hold: { file: 'src/lib/chat-view.js', fixed: 'if (this._tailHold) { this._tailHold.ops.push(op); return; } // B-172e ①', pre: "if ((window.__holdCtl = 'hold reverted') && false) { this._tailHold.ops.push(op); return; }" },
  gen: { file: 'src/lib/chat-view.js', fixed: 'const stale = gen !== this._windowGen; // B-172e ③', pre: "const stale = !!(window.__genCtl = 'gen reverted') && false;" },
  newest: { file: 'src/lib/chat-view.js', pairs: [
    ['const call = this._tailCall = (this._tailCall || 0) + 1;', "const call = this._tailCall = (this._tailCall || 0) + 1; hold.n = (hold.n || 0) + 1; window.__newestCtl = 'newest reverted';"],
    ['if (!hold || this._tailHold !== hold) return;', 'if (!hold || this._tailHold !== hold || --hold.n > 0) return;'],
    ["if (call !== this._tailCall) { this._trace('tailStale', { call, newest: this._tailCall }); return; } // verify r1: superseded", ''],
    ['if (call !== this._tailCall) return;   // a newer tail call answers for the view', ''],
  ] },
};
const VARIANTS = [
  { name: 'fix', revert: null, rows: ['tail', 'slab', 'inflight-down', 'inflight-up', 'hang-return'] },
  { name: 'ctl-hold', revert: 'hold', rows: ['tail'] },
  { name: 'ctl-send', revert: 'send', rows: ['slab'] },
  { name: 'ctl-gen', revert: 'gen', rows: ['inflight-down', 'inflight-up'] },
  { name: 'ctl-newest', revert: 'newest', rows: ['hang-return'] },
];
let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 200) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { } await sleep(step); } return false; };

// ── everything this suite starts, so every exit path ends it ──
const procs = new Set(), dirs = new Set(), worktrees = new Set();
const cleanup = () => {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  // the stub sessions live under dtach and would outlive their server: each carries its worktree path
  for (const wt of worktrees) { try { execSync(`pkill -9 -f ${JSON.stringify(wt)}`, { stdio: 'ignore' }); } catch { } }
  for (const wt of worktrees) { try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { } try { fs.rmSync(wt, { recursive: true, force: true }); } catch { } }
  for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const REAL_PROJECTS = path.join(process.env.HOME || '', '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const { fixtureLitter } = require('../src/fixture-guard.js');

async function prepareVariant(v) {
  const tag = `sendland-${v.name}`;
  const wt = scratch(tag);
  const fakeHome = scratchHome(`${tag}-home`, fs); dirs.add(fakeHome);
  const cwd = scratch(`${tag}-cwd`); dirs.add(cwd); fs.mkdirSync(cwd, { recursive: true });
  const stub = scratch(`${tag}-claude`); dirs.add(stub);
  const proj = path.join(fakeHome, '.claude', 'projects', cwd.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  const fx = await writeHugeTranscript({ file: path.join(proj, `${SID}.jsonl`), sid: SID, cwd, targetBytes: FIXTURE_MB * 1048576 });
  // the stub CLI: the boot probes, a stream-json init for the RESUMED id, then one
  // answer per stdin line that carries a nonce (`SLN…`) — anything else is ignored
  fs.writeFileSync(stub, `#!/bin/sh
SID=""; prev=""
for a in "$@"; do
  case "$a" in --version) echo "2.1.274 (Claude Code) stub"; exit 0;; --help) echo "Usage: claude [options]"; exit 0;; esac
  if [ "$prev" = "--resume" ]; then SID="$a"; fi
  prev="$a"
done
[ -n "$SID" ] || SID="${SID}"
printf '%s\\n' "{\\"type\\":\\"system\\",\\"subtype\\":\\"init\\",\\"session_id\\":\\"$SID\\",\\"model\\":\\"claude-fable-5\\",\\"cwd\\":\\"$PWD\\",\\"tools\\":[],\\"permissionMode\\":\\"default\\",\\"claude_code_version\\":\\"2.1.274\\"}"
R=0
while IFS= read -r line; do
  case "$line" in *SLN*) ;; *) continue ;; esac
  N=$(printf '%s' "$line" | sed -n 's/.*\\(SLN[0-9a-z]*\\).*/\\1/p')
  R=$((R+1))
  sleep 0.3
  printf '{"type":"assistant","parent_tool_use_id":null,"session_id":"%s","message":{"id":"msg_sl_%s","role":"assistant","model":"claude-fable-5","content":[{"type":"text","text":"ack %s"}]}}\\n' "$SID" "$R" "$N"
  printf '{"type":"result","subtype":"success","session_id":"%s","duration_ms":1,"total_cost_usd":0,"is_error":false}\\n' "$SID"
done
`, { mode: 0o755 });
  // a throwaway worktree with the WORKING TREE overlaid (a pre-commit run tests what is about to ship)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  for (const [k, fx2] of Object.entries(FIXES)) {
    let src = fs.readFileSync(path.join(wt, fx2.file), 'utf8');
    for (const [fixed, pre] of fx2.pairs || [[fx2.fixed, fx2.pre]]) {
      if (src.split(fixed).length !== 2) throw new Error(`${v.name}: the ${k} fix marker is not exactly once in ${fx2.file} — update FIXES.${k}`);
      if (v.revert === k) src = src.replace(fixed, pre);
    }
    if (v.revert === k) fs.writeFileSync(path.join(wt, fx2.file), src);
  }
  // the bundle's version = /api/version (a 'test' stamp would make the stale-bundle check reload the tab)
  const bv = path.join(wt, 'src/lib/build-version.js');
  if (!fs.existsSync(bv)) fs.writeFileSync(bv, `export const BUILD_VERSION = ${JSON.stringify(JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version)};\n`);
  execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
  const bundle = fs.readFileSync(path.join(wt, 'public/bundle.js'), 'utf8');
  for (const k of Object.keys(FIXES)) {
    const reverted = bundle.includes(`${k} reverted`);
    if (reverted !== (v.revert === k)) throw new Error(`${v.name}: the bundle's ${k} fix is ${reverted ? 'REVERTED' : 'in place'}`);
  }
  return { wt, fakeHome, cwd, stub, fx };
}

// the settled verdict, read in the page (numbers and ids only — never content beyond the nonce match)
const SNAP = (nonce, sentAt) => `(() => {
  const v = window.__v, list = v._messageList, lr = list.getBoundingClientRect();
  const cards = [...list.querySelectorAll(':scope > .chat-msg')];
  const sent = cards.find((el) => el.classList.contains('chat-msg-user') && el.textContent.includes(${JSON.stringify(nonce)})) || cards.find((el) => el.textContent.includes(${JSON.stringify(nonce)}) && !el.textContent.includes('ack ' + ${JSON.stringify(nonce)}));
  const reply = cards.find((el) => el.textContent.includes('ack ' + ${JSON.stringify(nonce)}));
  const rc = sent ? sent.getBoundingClientRect() : null;
  const tsOf = (el) => { const id = el.dataset.msgId; const m = id && v._messages.find((x) => x.id === id); return Number(el.dataset.ts) || (m && Date.parse(m.ts || '')) || (m && m.ts) || 0; };
  let staleBelow = 0, below = 0;
  if (sent) for (let i = cards.indexOf(sent) + 1; i < cards.length; i++) { below++; const t = tsOf(cards[i]); if (t && t < ${Number(sentAt)} - 60000) staleBelow++; }
  return { found: !!sent, visible: !!(rc && rc.height > 0 && rc.bottom > lr.top && rc.top < lr.bottom), reply: !!reply, replyAfter: !!(sent && reply && (sent.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING)),
    staleBelow, below, pin: v._pinned ? 1 : 0, tp: v._teleported ? 1 : 0, ws: v._windowStart, we: v._windowEnd, total: v._total, msgs: v._messages.length,
    st: Math.round(list.scrollTop), sh: list.scrollHeight, ch: list.clientHeight, loading: v._loading ? 1 : 0, cards: cards.length };
})()`;
const judge = (s) => {
  const r = [];
  if (!s.found) r.push('the sent message is not in the view');
  else if (!s.visible) r.push(`the sent message is off screen (st ${s.st} of sh ${s.sh}, ch ${s.ch})`);
  if (s.tp) r.push('the view is still the teleported slab');
  if (!s.pin) r.push('the view is not pinned');
  if (s.we < s.total) r.push(`the window ends at ${s.we} of ${s.total} (not the live tail)`);
  if (!s.reply || !s.replyAfter) r.push("the stub's answer is not rendered below the sent message");
  if (s.staleBelow) r.push(`${s.staleBelow} card(s) older than the send sit below it`);
  if (Math.abs((s.we - s.ws) - s.msgs) > 2) r.push(`the window bounds ${s.ws}..${s.we} (${s.we - s.ws}) do not describe the ${s.msgs} messages it holds`);
  return r;
};

async function runVariant(v) {
  console.log(`— ${v.name}${v.revert ? ` (the ${v.revert} fix reverted)` : ''}: preparing (${FIXTURE_MB} MB §1c transcript, worktree, bundle)`);
  const { wt, fakeHome, cwd, stub, fx } = await prepareVariant(v);
  const [PORT, CDP_PORT] = await freePorts(2);
  let journal = '';
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stub, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal = (journal + d).slice(-8000); }); srv.stderr.on('data', (d) => { journal = (journal + d).slice(-8000); });
  const chromeDir = scratch(`sendland-${v.name}-chrome`); dirs.add(chromeDir);
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox',
    '--disable-dev-shm-usage', '--window-size=1500,1000', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  if (!await until(async () => (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok, 60000)) throw new Error(`${v.name}: the scratch server never answered\n${journal.slice(-1500)}`);

  // ── ONE live chat session through the real create path (stub CLI behind the real wrapper) ──
  const ctl = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const frames = []; ctl.on('message', (d) => { if (d.length > 65536) return; try { frames.push(JSON.parse(String(d))); } catch { } });
  await new Promise((r, e) => { ctl.on('open', r); ctl.on('error', e); });
  ctl.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd, resume: true, resumeId: SID, reqId: 'c0', name: 'send landing', cols: 80, rows: 24 }));
  await until(() => frames.some((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'c0'), 20000, 100);
  const created = frames.find((m) => m.type === 'created' && m.reqId === 'c0');
  if (!created) throw new Error(`${v.name}: create failed: ${JSON.stringify(frames.find((m) => m.reqId === 'c0') || frames.slice(-2)).slice(0, 400)}`);

  // ── CDP ──
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!target) throw new Error('chrome never exposed a CDP page target');
  const cdpWs = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => cdpWs.on('open', r));
  let seq = 0; const pend = new Map(); const pageErrors = [];
  // CDP Fetch (③): the FIRST paused /api/session-messages request after `holdNext` is armed is held;
  // every other one is continued at once
  const fetchHold = { armed: false, held: null, passed: 0 };
  cdpWs.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '?');
    if (m.method === 'Fetch.requestPaused') {
      if (fetchHold.armed && !fetchHold.held) { fetchHold.held = m.params; return; }
      fetchHold.passed++;
      cdp('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); cdpWs.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?cb=${Date.now()}` });
  if (!await until(() => ev('!!(window.app && window.app.ready)'), 30000)) throw new Error('the app never booted');
  await ev('window.app.ready.then(() => true)');
  const opened = await ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const app = window.app;
    const winId = app.attachSession(${JSON.stringify(created.sessionId)}, 'send landing', ${JSON.stringify(cwd)}, { mode: 'chat', backend: 'claude' }).id;
    let v = null;
    for (let i = 0; i < 300; i++) { v = app.sessions.get(winId); if (v && v._messages && v._messages.length > 10 && v._total > 0 && v._chatInput) break; await sleep(300); }
    if (!v || !v._chatInput) return { ok: false, why: 'no live view with a composer', n: v && v._messages ? v._messages.length : null };
    const w = app.wm.windows.get(winId);
    const ws = document.getElementById('workspace') || document.querySelector('.workspace');
    const wr = ws.getBoundingClientRect();
    const el = w.element; el.style.left = '0px'; el.style.top = '0px'; el.style.width = wr.width + 'px'; el.style.height = wr.height + 'px';
    if (w.onResize) try { w.onResize(); } catch {}
    try { await document.fonts.ready; } catch {}
    await sleep(2500); // initial render + fold + attach fill settle
    window.__v = v;
    const r = v._messageList.getBoundingClientRect();
    return { ok: true, n: v._messages.length, ws: v._windowStart, we: v._windowEnd, total: v._total, pin: v._pinned ? 1 : 0, ro: v._readOnly ? 1 : 0, ch: v._messageList.clientHeight, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  })()`);
  check(`${v.name}: the live chat opened with a composer at the live tail (${opened?.n} messages, window ${opened?.ws}..${opened?.we} of ${opened?.total}, fixture ${fx.lines} lines)`, opened?.ok && !opened.ro && opened.pin === 1 && opened.we === opened.total, JSON.stringify(opened) + '\n' + journal.slice(-600));
  if (!opened?.ok) { chrome.kill('SIGKILL'); srv.kill('SIGKILL'); return {}; }
  const cx = Math.round(opened.rect.x + opened.rect.w / 2), cy = Math.round(opened.rect.y + opened.rect.h / 2);
  const wheelUp = async (notches, deltaY = 300, gap = 100) => { for (let i = 0; i < notches; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: -deltaY }); await sleep(gap); } };
  const state = () => ev('(() => { const v = window.__v; return { ws: v._windowStart, we: v._windowEnd, total: v._total, pin: v._pinned ? 1 : 0, tp: v._teleported ? 1 : 0, loading: v._loading ? 1 : 0, st: Math.round(v._messageList.scrollTop) }; })()');
  // LEAVE THE TAIL with the product's own paging: real upward notches, a few at a time, until the trim dropped
  // the tail (we < total) — and no further, so history remains above the window (ws > 0) for ③'s extendTop
  // (`minBelow`: ③'s extendBottom needs its stale page to be OLDER than the tail slab the send lands on — a page
  // that overlaps it dedups by id and proves nothing)
  const pageUpOutOfTail = async (minBelow = 1) => {
    let s = await state();
    for (let k = 0; k < 80 && !(s.total - s.we >= minBelow && !s.pin && !s.loading); k++) { await wheelUp(3); await sleep(700); s = await state(); }
    await sleep(1700); // past the paging gates' 1.5 s input horizon: the view is at rest when the send comes
    return state();
  };
  // every row starts at the live tail, the window coherent (the product's own jump)
  const toTail = () => ev('(async () => { await window.__v.jumpToBottom(); await new Promise((r) => setTimeout(r, 2000)); return true; })()');
  const ringMark = () => ev('window.__v._traceSeq || 0');
  const ringSince = (mark) => ev(`(() => (window.__v._traceRing || []).filter((e) => (e.seq || 0) > ${mark}).map((e) => e.tag + (e.from != null ? ' ' + e.from + '→' + e.to : '') + (e.we != null ? ' we:' + e.we : '') + (e.ws != null ? ' ws:' + e.ws : '')).slice(-40))()`);
  // TYPE + ENTER into the composer, exactly as a user sends
  const typeAndSend = async (text) => {
    await ev('(() => { const t = window.__v._chatInput._textarea; t.focus(); return document.activeElement === t; })()');
    await cdp('Input.insertText', { text });
    const sentAt = Date.now();
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    return sentAt;
  };
  const settleAndJudge = async (name, nonce, sentAt, pre, mark, extra = '') => {
    await until(() => ev(`(${SNAP(nonce, sentAt)}).reply`), 5000);
    await sleep(1500);
    const s = await ev(SNAP(nonce, sentAt));
    const reasons = judge(s);
    const ring = reasons.length ? await ringSince(mark) : [];
    console.log(`    ${name.padEnd(13)} before: window ${pre.ws}..${pre.we} of ${pre.total} pin ${pre.pin} tp ${pre.tp}${extra} → after: window ${s.ws}..${s.we} of ${s.total} pin ${s.pin} tp ${s.tp} sent ${s.found ? (s.visible ? 'ON SCREEN' : 'off screen') : 'MISSING'} reply ${s.reply ? 'yes' : 'no'} below ${s.below} (stale ${s.staleBelow}) msgs ${s.msgs} ${reasons.length ? 'VIOLATION: ' + reasons.join('; ') : 'OK'}`);
    if (reasons.length) console.log(`      [ring] ${ring.join(' | ')}`);
    return { s, reasons, pre };
  };
  const out = {};
  let k = 0;
  const nonce = () => `SLN${v.name.replace(/[^a-z]/g, '')}${++k}x${Date.now().toString(36)}`;
  await ev('window.app.ws && true');
  for (const row of v.rows) {
    await toTail();
    if (row === 'tail') {
      const pre = await pageUpOutOfTail();
      const mark = await ringMark();
      const n = nonce(); const sentAt = await typeAndSend(`please continue ${n}`);
      out.tail = await settleAndJudge('tail', n, sentAt, pre, mark);
      out.tail.ok = pre.we < pre.total && !pre.pin;   // the precondition: the window was paged out of the tail
    } else if (row === 'slab') {
      // THE TELEPORT: the search's own jump (jumpToFileMatch) to a line far above the tail — the slab
      const line = Math.max(1, Math.floor(fx.lines * 0.1)); // inside the gap: past the 2 MB head, before the 32 MB registered tail
      const rec = (() => { const all = fs.readFileSync(path.join(fakeHome, '.claude', 'projects', cwd.replace(/[/._]/g, '-'), `${SID}.jsonl`), 'utf8').split('\n'); for (let i = line; i < all.length; i++) { try { const o = JSON.parse(all[i]); if (o.timestamp) return { line: i, ts: Date.parse(o.timestamp) }; } catch { } } return { line, ts: 0 }; })();
      await ev(`(async () => { await window.__v.jumpToFileMatch({ line: ${rec.line}, ts: ${rec.ts} }); return true; })()`);
      await sleep(2500);
      const pre = await state();
      const mark = await ringMark();
      const n = nonce(); const sentAt = await typeAndSend(`one more thing ${n}`);
      out.slab = await settleAndJudge('slab', n, sentAt, pre, mark, ` (teleported to line ${rec.line})`);
      out.slab.ok = pre.tp === 1;
    } else if (row === 'inflight-down' || row === 'inflight-up') {
      // ③ THE STALE PAGE: a partial window, the extend's request HELD, the send, then the release
      const down = row === 'inflight-down';
      const pre0 = await pageUpOutOfTail(down ? 200 : 1);
      await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/session-messages*', requestStage: 'Request' }] });
      fetchHold.armed = true; fetchHold.held = null; fetchHold.passed = 0;
      await ev(`(() => { window.__v.${down ? '_extendBottom' : '_extendTop'}(); return true; })()`);
      const gotHeld = await until(() => !!fetchHold.held, 5000, 50);
      fetchHold.armed = false;
      const pre = { ...(await state()), held: gotHeld ? 1 : 0 };
      const mark = await ringMark();
      const n = nonce(); const sentAt = await typeAndSend(`and also ${n}`);
      // the send's own tail fetch passes; wait for its landing (or the time it would take), then release the stale page
      await until(() => ev(`(${SNAP(n, sentAt)}).reply`), 5000);
      if (fetchHold.held) await cdp('Fetch.continueRequest', { requestId: fetchHold.held.requestId });
      await sleep(800);
      await cdp('Fetch.disable');
      out[row] = await settleAndJudge(row, n, sentAt, pre, mark, ` (${down ? 'extendBottom' : 'extendTop'} held: ${pre.held ? 'yes' : 'NO'}, loading ${pre.loading}, ${fetchHold.passed} request(s) passed meanwhile)`);
      out[row].ok = gotHeld && pre0.we < pre0.total && !pre0.pin && pre.loading === 1 && (down ? pre0.total - pre0.we >= 200 : pre0.ws > 0);
    } else if (row === 'hang-return') {
      // ④ THE HUNG TAIL FETCH: the send's own tail request is HELD (never answered while the reader acts);
      // the reader clicks ↓ (a real click), then sends again; only then is the hung request released
      const pre = await pageUpOutOfTail();
      await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/session-messages*', requestStage: 'Request' }] });
      fetchHold.armed = true; fetchHold.held = null; fetchHold.passed = 0;
      const mark = await ringMark();
      const n1 = nonce(); const t1 = await typeAndSend(`hung tail ${n1}`);
      const gotHeld = await until(() => !!fetchHold.held, 5000, 50);
      fetchHold.armed = false;
      await sleep(2500);   // the stub answered meanwhile
      const btn = await ev('(() => { const q = window.__v._scrollBtn.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2, w: q.width }; })()');
      if (btn.w > 0) for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
      await until(() => ev(`(${SNAP(n1, t1)}).reply`), 4000);
      await sleep(800);
      const afterReturn = await ev(SNAP(n1, t1));
      const n2 = nonce(); const t2 = await typeAndSend(`and again ${n2}`);
      await until(() => ev(`(${SNAP(n2, t2)}).reply`), 4000);
      const second = await ev(SNAP(n2, t2));
      if (fetchHold.held) await cdp('Fetch.continueRequest', { requestId: fetchHold.held.requestId });   // the hung request answers at last
      await sleep(800);
      await cdp('Fetch.disable');
      const r = await settleAndJudge('hang-return', n2, t2, pre, mark, ` (tail fetch held: ${gotHeld ? 'yes' : 'NO'}; after ↓: sent ${afterReturn.found ? 'shown' : 'MISSING'} reply ${afterReturn.reply ? 'yes' : 'no'}; 2nd send before the release: ${second.found ? 'shown' : 'MISSING'})`);
      const n1After = await ev(SNAP(n1, t1));
      const rs = [...judge(afterReturn).map((x) => 'after ↓: ' + x), ...judge(second).map((x) => '2nd send: ' + x), ...r.reasons, ...(n1After.found ? [] : ['after the release: the first sent message is not in the view'])];
      if (rs.length > r.reasons.length) console.log(`      [④] ${rs.join('; ')}`);
      out[row] = { ...r, reasons: rs, ok: gotHeld && btn.w > 0 && pre.we < pre.total && !pre.pin };
    }
  }
  if (pageErrors.length) console.log(`    page errors: ${pageErrors.slice(0, 3).join(' | ').slice(0, 600)}`);
  out.pageErrors = pageErrors.length;
  try { ctl.send(JSON.stringify({ type: 'kill', sessionId: created.sessionId })); } catch { }
  await sleep(500);
  try { cdpWs.close(); } catch { } try { ctl.close(); } catch { }
  chrome.kill('SIGKILL'); srv.kill('SIGKILL');
  try { execSync(`pkill -9 -f ${JSON.stringify(wt)}`, { stdio: 'ignore' }); } catch { }
  return out;
}

const R = {};
for (const v of VARIANTS) R[v.name] = await runVariant(v);
const F = R.fix || {};
console.log('§ the fix: every send lands on the sent message');
for (const [row, what] of [['tail', '① a window paged out of the tail (windowEnd < total): the tail fetch keeps the echo that arrived during it'],
  ['slab', '② a teleported seek slab: the send leaves the slab for the live tail'],
  ['inflight-down', '③ an extendBottom in flight across the send: its stale page is dropped'],
  ['inflight-up', '③ an extendTop in flight across the send: its stale page is dropped'],
  ['hang-return', '④ the send\'s tail fetch hangs: ↓ and the next send land on the sent messages at the live tail, and the hung fetch answering later changes nothing']]) {
  const r = F[row];
  check(`${what} — precondition held, sent message on screen at the pinned live tail, the answer below it`, !!(r && r.ok && r.reasons.length === 0), r ? (r.ok ? r.reasons.join('; ') : `precondition not met: ${JSON.stringify(r.pre)}`) : 'row did not run');
}
console.log('§ the controls: each reverted fix fails its own row (a leg that cannot go red proves nothing)');
const ctl = (variant, row, sig, what) => {
  const r = (R[variant] || {})[row];
  check(`${variant}: ${what}`, !!(r && r.ok && r.reasons.some((x) => sig.test(x))), r ? (r.ok ? (r.reasons.join('; ') || 'GREEN — the control did not reproduce') : `precondition not met: ${JSON.stringify(r.pre)}`) : 'row did not run');
};
ctl('ctl-hold', 'tail', /not in the view/, '① without the hold the echo is lost — the view lands on the tail WITHOUT the sent message');
ctl('ctl-send', 'slab', /not in the view|teleported slab/, '② without the slab branch the send pins the SLAB — the sent message is nowhere');
ctl('ctl-gen', 'inflight-down', /older than the send|do not describe|not the live tail/, '③ without the generation an in-flight extendBottom writes its stale page below the sent message');
ctl('ctl-gen', 'inflight-up', /do not describe|not the live tail/, '③ without the generation an in-flight extendTop writes its stale page into the new window');
ctl('ctl-newest', 'hang-return', /after ↓: the sent message is not in the view|2nd send: the sent message is not in the view/, '④ with the last-to-finish release a hung tail fetch keeps every live op held — ↓ and the next send land without the sent messages');
check('no page exceptions on the fix', (F.pageErrors || 0) === 0, String(F.pageErrors));
const after = (() => { try { return fs.readdirSync(REAL_PROJECTS); } catch { return []; } })();
const added = after.filter((d) => !realBefore.has(d));
const lit = fixtureLitter(added.map((d) => path.join(REAL_PROJECTS, d)), { sids: [SID] });
check(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.length === 0, lit.offenders.slice(0, 3));
console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
