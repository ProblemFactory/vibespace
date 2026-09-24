#!/usr/bin/env node
// THE OWNER'S SIDE-BY-SIDE GESTURES — the chrome gate (docs/design-split-ux.zh.md
// §6 chunk 3; heavy). The owner (2026-09-23): "我本来是想拖动窗口到左侧，结果莫名其妙进入了
// side by side模式 … 标签位置不符合直觉 … 和普通tabbed模式不太好区分 … 往左拖却让窗口出现在了右侧".
// Second directive: no drag-time split logic; the tab merge stays the ONE exception to
// ordinary drag + snap; side by side is an explicit second step after the merge.
//
// Scene = scripts/dbg-split-gesture.mjs (the §1 numbers): a worktree server on a free
// port, a fake `claude` on CLAUDE_CMD, two chat sessions Alpha / Bravo, A SNAPPED LEFT
// (its title bar covers the 30 px snap band), B free on the right; a desktop page
// 1280×900, later a SECOND desktop page and a phone page (390×844, iPhone UA).
// Every gesture is a real title-bar drag through Input.dispatchMouseEvent.
//   1  G1 — B dragged LEFT, released on the RIGHT half of A's title bar (below the snap
//      band) ⇒ no chain, B moved left > 300 px to the pointer-centred position ±8 px, A
//      unmoved; 1a the §1 path exactly (released at the bar's centre row, INSIDE the top
//      band — the snap indicator showing) ⇒ no chain, B takes the snap the indicator promised
//   2  G2 — released at workspace.left + 12 over A's title bar ⇒ no chain, B = the left
//      snap zone (±2 px), B._isSnapped
//   3  body NEGATIVE — B dragged into A's content area and HELD 1.5 s ⇒ no chain, B moved
//   4  the merge is the only exception — B onto A's icon stack ⇒ a tabs chain, the ⫿
//      button pulsing, the "Grouped as tabs" toast with "Show side by side"; clicking it ⇒
//      split, pair [B,A] (the active B LEFT), strip order == pair order, ONE glyph between
//      the pane tabs, each pane tab's underline = ownerColor(its session) (computed colours)
//   5  the badge — .on + aria-pressed; its menu = Unsplit / Swap left and right; swap ⇒ pair
//      and strip [A,B]; unsplit ⇒ tabs, the host rect unchanged (±1 px), the button back
//   6  undo — an announced bindSplit(A, free B) names both + Undo ⇒ B free at its pre-split
//      rect (±2 px), A unmoved; from a tabs chain via the button + Undo ⇒ tabs, host ±1 px;
//      a STALE undo (the pair changed first) ⇒ the "Nothing to undo" toast, never silence
//   7  the divider — hover lights it (≠ the window border), right-click = the same two items
//   8  two clients — a second desktop page shows the same layout / pair / strip order after
//      the split and after a swap (the chainSyncKey structural rebuild); no echo reverts it
//   9  phone — one pane, no button / glyph shown, the model still split, its save never flattens
//  10  command mode — Ctrl+\ v splits a tabs chain, v again unsplits, V swaps
//  11  r1 (the verifier's three) — ① a plain tab switch on a 3-tab chain re-labels the
//      button with the partner the click WILL use (splitPartner of the new recent) and the
//      click uses it; ② a split taken through the strip button withdraws the "Grouped as
//      tabs" toast, and its action SAYS why when the split already happened elsewhere or the
//      group is gone (never a silent no-op); ③ the window menu's "Beside {name}" keeps the
//      focus on the tab that was right-clicked (the strip button's rule)
// RED on 2.369.160 (the title-bar half zone): 1 / 1a / 2 split, 4 has no button / toast.
// SKIPs with evidence without chrome / dtach. Free ports, scratch dirs only.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const C = require('../src/lib/chain-layout.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('split-ux');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  fakeHome = scratchHome('split-ux-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  // each fake session names its OWN conversation (the fixture family + the shell's pid): two sessions sharing one
  // conversation id are one conversation to a restoring client — the second client would attach both windows to it
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: '%s', hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: '%s', cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\nSID="e2e00000-0000-4000-8000-$(printf '%012d' $$)"\ncase " $* " in *" --output-format "*) sleep 1; printf '${hookLine}\\n${initLine}\\n' "$SID" "$SID";; esac\nexec sleep 600\n`, { mode: 0o755 });
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const env = { ...process.env, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 40000, 100), 'the worktree server booted', journal.slice(-800))) return;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  const create = async (reqId, name) => { ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId, name })); await until(() => msgs.some((m) => m.type === 'created' && m.reqId === reqId), 15000); return msgs.find((m) => m.type === 'created' && m.reqId === reqId)?.sessionId; };
  const sidA = await create('a', 'Alpha'), sidB = await create('b', 'Bravo'), sidC = await create('c', 'Charlie');
  const killSessions = async () => {
    for (const sid of [sidA, sidB, sidC].filter(Boolean)) ws.send(JSON.stringify({ type: 'kill', sessionId: sid }));
    await until(() => [sidA, sidB, sidC].filter(Boolean).every((sid) => msgs.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === sid)), 8000);
  };
  let chrome = null, P1 = null;
  // the suite ends what it started, on every path: the two fake-claude sessions live under dtach and would outlive the server
  try {
  if (!ok(sidA && sidB && sidC, 'three chat sessions (Alpha, Bravo, Charlie) were created on the fake claude', journal.slice(-600))) return;
  await sleep(1200);

  // ── headless chrome, the desktop page ──
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  procs.add(chrome);
  let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target')) return;
  const client = async (wsUrl) => {
    const cdp = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
    let seq = 0; const pend = new Map();
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
    const ev = async (js) => {
      const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm; const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; }; const chats = () => [...wm.windows.values()].filter((w) => w.type === 'chat'); const sidOf = (id) => (app.sessions.get(id) || {}).sessionId || null; const bySid = (sid) => chats().find((w) => sidOf(w.id) === sid) || null; const disp = (el) => getComputedStyle(el).display; ${js} })()`, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
      return r.result?.result?.value;
    };
    await send('Page.enable'); await send('Runtime.enable');
    return { send, ev, close: () => { try { cdp.close(); } catch { } } };
  };
  const bootOk = async (X) => { for (let i = 0; i < 120; i++) { try { if (await X.ev('if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);')) return true; } catch { } await sleep(250); } return false; };
  P1 = await client(target.webSocketDebuggerUrl);
  await P1.send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard would cover the chrome on an empty runner
  await P1.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await P1.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  if (!ok(await bootOk(P1), 'the app booted in headless chrome (desktop, 1280×900)')) return;
  await sleep(1500);
  const ev = P1.ev;
  const S = JSON.stringify;
  const mouse = (type, x, y, extra = {}) => P1.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
  const click = async (pt) => { await mouse('mouseMoved', pt.x, pt.y); await mouse('mousePressed', pt.x, pt.y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', pt.x, pt.y, { button: 'left', clickCount: 1 }); await sleep(250); };
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const clearToasts = () => ev(`document.getElementById('global-toasts')?.remove(); document.querySelectorAll('.taskbar-context-menu').forEach((m) => m.remove()); return true;`);
  /** The toast whose body contains `text` (its body, its action button's label and rect), or null. */
  const toastWith = (text) => ev(`const t = [...document.querySelectorAll('.global-toast')].find((x) => (x.querySelector('.global-toast-body')?.textContent || '').includes(${S(text)})); if (!t) return null; const a = t.querySelector('.global-toast-action'); return { body: t.querySelector('.global-toast-body').textContent, action: a ? a.textContent : null, actionRect: a ? rect(a) : null };`);
  const menuItems = () => ev(`const m = document.querySelector('.taskbar-context-menu'); if (!m) return null; return [...m.querySelectorAll(':scope > .taskbar-context-menu-item')].map((el) => ({ label: el.textContent.trim(), rect: rect(el) }));`);

  /** Both windows closed and reopened: A SNAPPED LEFT (the real snap), B free on the right (the dbg scene). */
  const scene = async () => {
    await clearToasts();
    await ev(`for (const w of [...wm.windows.values()]) wm.closeWindow(w.id); return true;`);
    await until(() => ev('return wm.windows.size === 0;'), 5000);
    await ev(`app.attachSession(${S(sidA)}, 'Alpha', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev(`return !!bySid(${S(sidA)});`), 10000);
    await ev(`app.attachSession(${S(sidB)}, 'Bravo', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev(`return !!bySid(${S(sidB)});`), 10000);
    return ev(`const A = bySid(${S(sidA)}), B = bySid(${S(sidB)}); wm._applySnap(A.id, 'left'); A._isSnapped = true; B.element.style.left = '700px'; B.element.style.top = '80px'; B.element.style.width = '480px'; B.element.style.height = '360px'; B._isSnapped = false; B._preSnapBounds = null; wm._captureGridBounds(B); wm.activeWindowId = B.id; return new Promise((res) => setTimeout(() => res({ A: A.id, B: B.id, a: rect(A.element), b: rect(B.element), aBar: rect(A.titleBar), bBar: rect(B.titleBar), bTitle: rect(B.titleSpan), aIcon: rect(A.titleBar.querySelector('.window-icon-stack')), aContent: rect(A.content), ws: rect(wm.workspace) }), 450));`);
  };
  /** A real title-bar drag: press B's title span, `steps` moves, optionally hold, release. */
  const drag = async (from, to, { steps = 14, holdMs = 0 } = {}) => {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, { button: 'left', clickCount: 1 });
    let snapShown = null;
    for (let i = 1; i <= steps; i++) {
      const x = from.x + (to.x - from.x) * (i / steps), y = from.y + (to.y - from.y) * (i / steps);
      await mouse('mouseMoved', x, y, { button: 'left', buttons: 1 }); await sleep(35);
    }
    if (holdMs) { const t0 = Date.now(); while (Date.now() - t0 < holdMs) { await mouse('mouseMoved', to.x, to.y, { button: 'left', buttons: 1 }); await sleep(150); } }
    snapShown = await ev('return wm.snapIndicator.style.display !== \'none\' && wm.snapIndicator.style.display !== \'\';');
    await mouse('mouseReleased', to.x, to.y, { button: 'left', clickCount: 1 });
    await sleep(650); // past the 220 ms snap animation + the bounds capture
    return { snapShown };
  };
  const state = (ids) => ev(`const A = wm.windows.get(${S(ids.A)}), B = wm.windows.get(${S(ids.B)}); const ch = B._tabChain || A._tabChain; const host = ch && wm.windows.get(ch.tabs[0]); return { chain: !!(B._tabChain || A._tabChain), layout: ch ? ch.layout : 'free', a: rect(A.element), b: rect(B.element), bOff: { left: B.element.offsetLeft, top: B.element.offsetTop, width: B.element.offsetWidth, height: B.element.offsetHeight }, bSnapped: !!B._isSnapped, bDisplay: disp(B.element), zones: wm._getSnapZones(4) };`);
  const sameRect = (x, y, tol) => near(x.left, y.left, tol) && near(x.top, y.top, tol) && near(x.width, y.width, tol) && near(x.height, y.height, tol);
  const zoneRect = (z) => ({ left: z.left, top: z.top, width: z.width, height: z.height });
  const layoutPx = (o) => ({ left: o.left, top: o.top, width: o.width, height: o.height });

  // ── 1 · G1 ──
  console.log('— 1 · G1: B dragged LEFT, released on the RIGHT half of A\'s title bar ⇒ a move, never a split');
  {
    const ids = await scene();
    const from = { x: ids.bTitle.left + ids.bTitle.width / 2, y: ids.bBar.top + ids.bBar.height / 2 };
    // below the 30 px top snap band, still on A's title bar: an ordinary free drop
    const yLow = Math.min(ids.aBar.bottom - 2, ids.ws.top + 33);
    ok(yLow - ids.ws.top >= 30 && yLow < ids.aBar.bottom && yLow > ids.aBar.top, `the release row (${Math.round(yLow - ids.ws.top)} px into the workspace) is on A's title bar and outside the snap band`, S({ aBar: ids.aBar, ws: ids.ws }));
    const to = { x: ids.aBar.left + ids.aBar.width * 0.8, y: yLow };
    const d = await drag(from, to);
    const st = await state(ids);
    const dx = to.x - from.x, dy = to.y - from.y;
    ok(!st.chain && st.layout === 'free', 'no chain — the drop on the right half of A\'s bar did not split (2.369.160: layout=split, B on the RIGHT)', S(st));
    ok(st.bDisplay === 'flex', 'B is still its own window (display flex)', st.bDisplay);
    ok(st.b.width > 0 && ids.b.left - st.b.left > 300, `B moved LEFT by ${Math.round(ids.b.left - st.b.left)} px (> 300)`, S({ before: ids.b, after: st.b }));
    ok(near(st.b.left, ids.b.left + dx, 8) && near(st.b.top, ids.b.top + dy, 8), `B sits where the pointer carried it (Δ ${Math.round(dx)}, ${Math.round(dy)}; ±8 px)`, S({ want: { left: ids.b.left + dx, top: ids.b.top + dy }, got: st.b, snapShown: d.snapShown }));
    ok(!st.bSnapped && !d.snapShown, 'no snap indicator at release, B not snapped (a free drop)', S(d));
    ok(sameRect(st.a, ids.a, 1), 'A did not move', S({ before: ids.a, after: st.a }));
  }
  console.log('— 1a · the §1 path exactly: released at the centre row of A\'s bar, INSIDE the top snap band');
  {
    const ids = await scene();
    const from = { x: ids.bTitle.left + ids.bTitle.width / 2, y: ids.bBar.top + ids.bBar.height / 2 };
    const to = { x: ids.aBar.left + ids.aBar.width * 0.8, y: ids.aBar.top + ids.aBar.height / 2 };
    const zone = await ev(`return wm._getSnapZone(${to.x}, ${to.y});`);
    const d = await drag(from, to);
    const st = await state(ids);
    ok(!st.chain, 'no chain (2.369.160 split here with the snap indicator showing)', S(st));
    ok(st.bDisplay === 'flex' && ids.b.left - st.b.left > 300, `B moved left ${Math.round(ids.b.left - st.b.left)} px, still its own window`, S(st.b));
    ok(zone && d.snapShown && st.bSnapped && sameRect(layoutPx(st.bOff), zoneRect(st.zones[zone]), 2), `B took the '${zone}' snap the indicator promised (±2 px)`, S({ zone, snapShown: d.snapShown, got: st.bOff, want: zone && st.zones[zone] }));
    ok(sameRect(st.a, ids.a, 1), 'A did not move', S({ before: ids.a, after: st.a }));
  }

  // ── 2 · G2 ──
  console.log('— 2 · G2: released at workspace.left + 12 over A\'s title bar ⇒ the LEFT snap, never a split');
  {
    const ids = await scene();
    const from = { x: ids.bTitle.left + ids.bTitle.width / 2, y: ids.bBar.top + ids.bBar.height / 2 };
    const to = { x: ids.ws.left + 12, y: Math.min(ids.aBar.bottom - 2, ids.ws.top + 33) };
    const onA = await ev(`const el = document.elementFromPoint(${to.x}, ${to.y}); const A = wm.windows.get(${S(ids.A)}); return !!(el && A.titleBar.contains(el));`);
    ok(onA, 'the release point is on A\'s title bar (elementFromPoint before the drag)');
    const d = await drag(from, to);
    const st = await state(ids);
    ok(!st.chain, 'no chain — the edge drop did not split (2.369.160: pair [B,A] shadowing the snap)', S(st));
    ok(d.snapShown && st.bSnapped && sameRect(layoutPx(st.bOff), zoneRect(st.zones.left), 2), 'B = wm._getSnapZones(4).left (±2 px), B._isSnapped', S({ got: st.bOff, want: st.zones.left, snapShown: d.snapShown, bSnapped: st.bSnapped }));
    ok(sameRect(st.a, ids.a, 1), 'A did not move', S({ before: ids.a, after: st.a }));
  }

  // ── 3 · the body NEGATIVE ──
  console.log('— 3 · no body zone: B dragged into A\'s content and held 1.5 s ⇒ still no split');
  {
    const ids = await scene();
    const from = { x: ids.bTitle.left + ids.bTitle.width / 2, y: ids.bBar.top + ids.bBar.height / 2 };
    const to = { x: ids.aContent.left + ids.aContent.width / 2, y: ids.aContent.top + ids.aContent.height / 2 };
    const d = await drag(from, to, { holdMs: 1500 });
    const st = await state(ids);
    ok(!st.chain, 'no chain after a 1.5 s hold over A\'s body (R1: no drag-time split of any kind)', S(st));
    ok(st.bDisplay === 'flex' && near(st.b.left, ids.b.left + (to.x - from.x), 8) && near(st.b.top, ids.b.top + (to.y - from.y), 8), 'B moved with the pointer (±8 px)', S({ b: st.b, dx: to.x - from.x, dy: to.y - from.y, snapShown: d.snapShown }));
    ok(sameRect(st.a, ids.a, 1), 'A did not move');
  }

  // ── 4 · the merge, then the explicit second step ──
  console.log('— 4 · the merge is the only drag exception; side by side is the second, explicit step');
  let ids4 = null;
  {
    const ids = ids4 = await scene();
    const from = { x: ids.bTitle.left + ids.bTitle.width / 2, y: ids.bBar.top + ids.bBar.height / 2 };
    const to = centre(ids.aIcon);
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, { button: 'left', clickCount: 1 });
    for (let i = 1; i <= 14; i++) { await mouse('mouseMoved', from.x + (to.x - from.x) * i / 14, from.y + (to.y - from.y) * i / 14, { button: 'left', buttons: 1 }); await sleep(35); }
    await mouse('mouseReleased', to.x, to.y, { button: 'left', clickCount: 1 });
    await sleep(200);
    const m = await ev(`const A = wm.windows.get(${S(ids.A)}), B = wm.windows.get(${S(ids.B)}); const ch = A._tabChain; const host = ch && wm.windows.get(ch.tabs[0]); const btn = host && host.titleBar.querySelector(':scope > .tab-split-btn'); return { same: !!ch && ch === B._tabChain, layout: ch && ch.layout, tabs: ch && ch.tabs, btn: !!btn, pulse: !!(btn && btn.classList.contains('pulse')), btnDisp: btn ? disp(btn) : null, pressed: btn ? btn.getAttribute('aria-pressed') : null };`);
    ok(m.same && m.layout === 'tabs' && m.tabs.length === 2, 'B dropped on A\'s icon stack ⇒ ONE tabs chain (the merge is untouched)', S(m));
    ok(m.btn && m.btnDisp !== 'none' && m.pulse && m.pressed === 'false', 'the strip carries the .tab-split-btn, pulsing once (.pulse), aria-pressed=false', S(m));
    const tt = await toastWith('Grouped as tabs');
    ok(tt && tt.action === 'Show side by side', 'a toast "Grouped as tabs" with a "Show side by side" button', S(tt));
    if (!tt || !tt.actionRect) return;
    await click(centre(tt.actionRect));
    await sleep(300);
    const s = await ev(`const A = wm.windows.get(${S(ids.A)}), B = wm.windows.get(${S(ids.B)}); const ch = A._tabChain; const host = wm.windows.get(ch.tabs[0]); const strip = [...host.titleBar.querySelectorAll('.tab-item')]; const glyphs = [...host.titleBar.querySelectorAll('.tab-split-glyph')]; const g = glyphs[0]; const probe = (c) => { const p = document.createElement('div'); p.style.background = c; document.body.appendChild(p); const v = getComputedStyle(p).backgroundColor; p.remove(); return v; }; return { layout: ch.layout, pair: ch.split && ch.split.pair, active: ch.tabs[ch.active], strip: strip.map((t) => t.dataset.winId), glyphs: glyphs.length, glyphBetween: !!(g && g.previousElementSibling && g.nextElementSibling && g.previousElementSibling.dataset.winId === ch.split.pair[0] && g.nextElementSibling.dataset.winId === ch.split.pair[1]), glyphHidden: g ? g.getAttribute('aria-hidden') : null, panes: strip.filter((t) => t.classList.contains('tab-pane')).map((t) => ({ id: t.dataset.winId, sid: sidOf(t.dataset.winId), got: getComputedStyle(t, '::before').backgroundColor })), probe: { A: probe(${S(C.ownerColor(sidA))}), B: probe(${S(C.ownerColor(sidB))}) }, aLeft: rect(A.content).left, bLeft: rect(B.content).left };`);
    ok(s.layout === 'split' && S(s.pair) === S([ids.B, ids.A]) && s.active === ids.B, 'one click ⇒ split, pair [B, A]: the active B on the LEFT', S(s));
    ok(s.bLeft < s.aLeft, `B's pane is drawn left of A's (${Math.round(s.bLeft)} < ${Math.round(s.aLeft)})`, S(s));
    ok(S(s.strip) === S(s.pair), 'the strip\'s tab order == the pane order (tab-item data-win-id sequence)', S({ strip: s.strip, pair: s.pair }));
    ok(s.glyphs === 1 && s.glyphBetween && s.glyphHidden === 'true', 'exactly ONE .tab-split-glyph, between the two pane tabs, aria-hidden', S(s));
    const pa = s.panes.find((p) => p.sid === sidA), pb = s.panes.find((p) => p.sid === sidB);
    ok(s.panes.length === 2 && pa && pb && pa.got === s.probe.A && pb.got === s.probe.B && s.probe.A !== s.probe.B, `each pane tab's underline = ownerColor(its session) as computed colours (Alpha ${s.probe.A}, Bravo ${s.probe.B})`, S(s.panes));
  }

  // ── 5 · the badge: Unsplit / Swap ──
  console.log('— 5 · the same button is the badge: Swap left and right / Unsplit');
  {
    const ids = ids4;
    await clearToasts();
    const b = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; const host = wm.windows.get(ch.tabs[0]); const btn = host.titleBar.querySelector(':scope > .tab-split-btn'); return { on: btn.classList.contains('on'), pressed: btn.getAttribute('aria-pressed'), r: rect(btn), title: btn.title };`);
    ok(b.on && b.pressed === 'true', 'in the split the button is .on + aria-pressed=true (the badge)', S(b));
    await click(centre(b.r));
    let items = await menuItems();
    ok(items && S(items.map((i) => i.label)) === S(['Unsplit', 'Swap left and right']), 'clicking it opens a menu: Unsplit / Swap left and right', S(items));
    if (items) await click(centre(items.find((i) => i.label === 'Swap left and right').rect));
    const sw = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; const host = wm.windows.get(ch.tabs[0]); return { pair: ch.split && ch.split.pair, strip: [...host.titleBar.querySelectorAll('.tab-item')].map((t) => t.dataset.winId) };`);
    ok(S(sw.pair) === S([ids.A, ids.B]) && S(sw.strip) === S([ids.A, ids.B]), 'Swap ⇒ pair [A, B] and the strip follows [A, B]', S(sw));
    const before = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; const host = wm.windows.get(ch.tabs[0]); return { host: rect(host.element), btn: rect(host.titleBar.querySelector(':scope > .tab-split-btn')) };`);
    await click(centre(before.btn));
    items = await menuItems();
    if (items) await click(centre(items.find((i) => i.label === 'Unsplit').rect));
    const un = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; const host = wm.windows.get(ch.tabs[0]); const btn = host.titleBar.querySelector(':scope > .tab-split-btn'); return { layout: ch.layout, tabs: ch.tabs.length, host: rect(host.element), on: btn && btn.classList.contains('on'), pressed: btn && btn.getAttribute('aria-pressed'), glyphs: host.titleBar.querySelectorAll('.tab-split-glyph').length };`);
    ok(un.layout === 'tabs' && un.tabs === 2 && un.glyphs === 0, 'Unsplit ⇒ back to tabs (both still in the group, no glyph)', S(un));
    ok(sameRect(un.host, before.host, 1), 'the host rect is unchanged (±1 px)', S({ before: before.host, after: un.host }));
    ok(un.on === false && un.pressed === 'false', 'the button is back in its entry state (no .on, aria-pressed=false)', S(un));
  }

  // ── 6 · Undo ──
  console.log('— 6 · every announced split is undoable; a stale undo SAYS so');
  {
    const ids = await scene();
    await ev(`const A = wm.windows.get(${S(ids.A)}), B = wm.windows.get(${S(ids.B)}); wm.bindSplit(A, B, { announce: true }); return true;`);
    await sleep(250);
    const names = await ev(`return [wm.windows.get(${S(ids.A)}).title, wm.windows.get(${S(ids.B)}).title];`);
    const tt = await toastWith('Side by side');
    ok(await ev(`return wm.windows.get(${S(ids.A)})._tabChain?.layout === 'split';`), 'bindSplit(A, free B, {announce}) split them');
    ok(tt && tt.body.includes(names[0]) && tt.body.includes(names[1]) && tt.action === 'Undo', 'the toast names both windows and carries an Undo button', S({ tt, names }));
    if (tt && tt.actionRect) await click(centre(tt.actionRect));
    await sleep(300);
    let st = await state(ids);
    ok(!st.chain && st.bDisplay === 'flex', 'Undo ⇒ B is a free window again', S(st));
    ok(sameRect(st.b, ids.b, 2), 'B is back at its pre-split rect (±2 px)', S({ before: ids.b, after: st.b }));
    ok(sameRect(st.a, ids.a, 2), 'A did not move', S({ before: ids.a, after: st.a }));
    // from a tabs chain, through the button
    await clearToasts();
    await ev(`wm.createTabChain(wm.windows.get(${S(ids.A)}), wm.windows.get(${S(ids.B)})); return true;`);
    await sleep(300);
    const t0 = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; const host = wm.windows.get(ch.tabs[0]); return { layout: ch.layout, host: rect(host.element), btn: rect(host.titleBar.querySelector(':scope > .tab-split-btn')) };`);
    await click(centre(t0.btn));
    const tt2 = await toastWith('Side by side');
    ok(t0.layout === 'tabs' && await ev(`return wm.windows.get(${S(ids.A)})._tabChain.layout === 'split';`) && tt2 && tt2.action === 'Undo', 'the button split the tabs chain and offered Undo', S(tt2));
    if (tt2 && tt2.actionRect) await click(centre(tt2.actionRect));
    const u2 = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; const host = ch && wm.windows.get(ch.tabs[0]); return { layout: ch && ch.layout, tabs: ch && ch.tabs.length, host: host && rect(host.element) };`);
    ok(u2.layout === 'tabs' && u2.tabs === 2 && sameRect(u2.host, t0.host, 1), 'Undo ⇒ tabs again, nothing moved (host ±1 px)', S({ before: t0.host, after: u2 }));
    // a STALE undo: the pair changed before the click
    await clearToasts();
    await click(centre(t0.btn));
    const tt3 = await toastWith('Side by side');
    await ev(`wm.swapSplit(wm.windows.get(${S(ids.A)})._tabChain); return true;`);
    if (tt3 && tt3.actionRect) await click(centre(tt3.actionRect));
    const stale = await toastWith('Nothing to undo');
    const lay = await ev(`return wm.windows.get(${S(ids.A)})._tabChain.layout;`);
    ok(stale && lay === 'split', 'a stale Undo (the pair was swapped first) ⇒ the "Nothing to undo any more" toast, the split left alone — never silent', S({ stale, lay }));
  }

  // ── 7 · the divider ──
  console.log('— 7 · the divider: brighter than a border, lit on hover, right-click = the two verbs');
  {
    await clearToasts();
    const d0 = await ev(`const ch = chats()[0]._tabChain; const host = wm.windows.get(ch.tabs[0]); const d = host.element.querySelector(':scope > .tab-split-divider'); return { layout: ch.layout, r: rect(d), rest: getComputedStyle(d).backgroundColor, border: getComputedStyle(host.element).borderTopColor };`);
    await mouse('mouseMoved', d0.r.left + d0.r.width / 2, d0.r.top + d0.r.height / 2);
    await sleep(400);
    const hov = await ev(`const ch = chats()[0]._tabChain; const d = wm.windows.get(ch.tabs[0]).element.querySelector(':scope > .tab-split-divider'); return { hover: getComputedStyle(d).backgroundColor, matches: d.matches(':hover') };`);
    ok(d0.layout === 'split' && d0.rest !== d0.border, `at rest the divider (${d0.rest}) differs from the window border (${d0.border})`, S(d0));
    ok(hov.matches && hov.hover !== d0.border && hov.hover !== d0.rest, `hovered it lights up (${hov.hover})`, S(hov));
    const cx = d0.r.left + d0.r.width / 2, cy = d0.r.top + d0.r.height / 2;
    await mouse('mousePressed', cx, cy, { button: 'right', clickCount: 1 });
    await mouse('mouseReleased', cx, cy, { button: 'right', clickCount: 1 });
    await sleep(250);
    const items = await menuItems();
    ok(items && S(items.map((i) => i.label)) === S(['Unsplit', 'Swap left and right']), 'right-click on the divider ⇒ Unsplit / Swap left and right', S(items));
    const still = await ev(`return chats()[0]._tabChain.layout;`);
    ok(still === 'split', 'the right press did not start a divider drag or change the layout', still);
    await clearToasts();
    await mouse('mouseMoved', 640, 880);
  }

  // ── 8 · two clients ──
  console.log('— 8 · a second desktop client sees the same split and follows a swap');
  const deskId = await ev('return app.desktopManager ? app.desktopManager.activeDesktopId : null;');
  const layoutsPath = path.join(wt, 'data', 'layouts.json');
  const chainFromDisk = () => { try { const d = JSON.parse(fs.readFileSync(layoutsPath, 'utf8')); const st = (deskId && d.desktops && d.desktops[deskId] && d.desktops[deskId].autoSave) || d.autoSave; const w = ((st && st.windows) || []).find((x) => x.tabChain && !x.isTabGuest); return w ? w.tabChain : null; } catch { } return null; };
  const view = (X) => X.ev(`const c = chats().find((w) => w._tabChain); if (!c) return null; const ch = c._tabChain; const host = wm.windows.get(ch.tabs[0]); return { layout: ch.layout, pair: ch.split ? ch.split.pair.map(sidOf) : null, strip: [...host.titleBar.querySelectorAll('.tab-item')].map((t) => sidOf(t.dataset.winId)), grid: host.element.classList.contains('tab-split') };`);
  const newPage = async () => {
    const created = await P1.send('Target.createTarget', { url: 'about:blank', newWindow: true }); // its OWN window: a background tab is hidden (no rAF) — two visible desktops are two windows
    let pt = null; for (let i = 0; i < 40 && !pt; i++) { try { pt = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page' && t.id === created.result.targetId); } catch { } if (!pt) await sleep(150); }
    return pt ? { X: await client(pt.webSocketDebuggerUrl), targetId: created.result.targetId } : null;
  };
  const saveNow = async () => {
    const want = await view(P1);
    await ev(`const lm = app.layoutManager; lm._userDirty = true; lm._lastUserInputAt = Date.now(); lm._lastSentJson = null; return lm._doAutoSave();`);
    return until(() => { const c = chainFromDisk(); return !!(c && c.layout === want.layout && (!want.pair || (c.split && c.split.pair.length === 2))); }, 8000);
  };
  {
    ok(await saveNow(), 'the desktop client\'s split reached data/layouts.json');
    const p2 = await newPage();
    if (!ok(!!p2, 'a second page target (desktop client 2)')) return;
    const Q = p2.X;
    await Q.send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await Q.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await Q.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    if (!ok(await bootOk(Q), 'the second desktop client booted')) return;
    if (deskId) await Q.ev(`const dm = app.desktopManager; if (dm && dm.activeDesktopId !== ${S(deskId)}) await dm.switchTo(${S(deskId)}); return true;`);
    const vis = [await ev('return document.visibilityState;'), await Q.ev('return document.visibilityState;')];
    ok(vis[0] === 'visible' && vis[1] === 'visible', 'both desktop clients are VISIBLE (two windows, not two tabs)', S(vis));
    const v1 = await view(P1);
    const got = await until(async () => S(await view(Q)) === S(v1), 15000, 200);
    const v2 = await view(Q);
    ok(got && v1.layout === 'split' && v2.grid, 'client 2 shows the same split: layout, pair and strip order (as sessions)', S({ v1, v2 }));
    ok(S(v2.strip) === S(v2.pair), 'client 2\'s strip is in visual order too', S(v2));
    // client 2 applies nothing while its own boot restore settles (layout.js: _restoring + a 5 s cooldown after
    // restoreLayout — a broadcast landing inside it is DROPPED, never deferred: a pre-existing gate, reported, not
    // this lane's) — the swap is made once client 2 is past it, the way a person reaches for a second window
    ok(await until(() => Q.ev('return app.layoutManager._restoring === false;'), 15000, 100), 'client 2 finished its boot restore (its layout-sync gate is open)');
    // swap on client 1 through its badge (a real click ⇒ a user-caused save)
    const br = await ev(`const ch = chats().find((w) => w._tabChain)._tabChain; return rect(wm.windows.get(ch.tabs[0]).titleBar.querySelector(':scope > .tab-split-btn'));`);
    await click(centre(br));
    const items = await menuItems();
    if (items) await click(centre(items.find((i) => i.label === 'Swap left and right').rect));
    const v1s = await view(P1);
    ok(S(v1s.pair) === S([...v1.pair].reverse()), 'client 1 swapped (its own view)', S({ v1, v1s }));
    const followed = await until(async () => S(await view(Q)) === S(v1s), 15000, 200);
    const v2s = await view(Q);
    ok(followed && v2s.grid && S(v2s.strip) === S(v2s.pair), 'client 2 followed the swap — pair AND strip reversed (the chainSyncKey carries the pair order ⇒ a structural rebuild)', S({ v1s, v2s }));
    await sleep(4000);
    const late1 = await view(P1), late2 = await view(Q);
    ok(S(late1) === S(v1s) && S(late2) === S(v1s), 'four seconds later neither client reverted (no echo ping-pong — the §6b guards)', S({ late1, late2 }));
    ok(await Q.ev('return app.layoutManager._userDirty !== true;'), 'client 2 never became a user-dirty writer (it only applied)');
    Q.close(); await P1.send('Target.closeTarget', { targetId: p2.targetId });
  }

  // ── 9 · the phone ──
  console.log('— 9 · the phone shows one pane, no button / glyph, and never flattens the split');
  {
    await P1.send('Page.bringToFront');
    ok(await saveNow(), 'the swapped split is on disk before the phone boots');
    const want = await view(P1);
    const pp = await newPage();
    if (!ok(!!pp, 'a phone page target')) return;
    const P = pp.X;
    await P.send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await P.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await P.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
    await P.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await P.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    if (!ok(await bootOk(P), 'the app booted on the phone page (390×844)')) return;
    if (deskId) await P.ev(`const dm = app.desktopManager; if (dm && dm.activeDesktopId !== ${S(deskId)}) await dm.switchTo(${S(deskId)}); return true;`);
    const has = await until(() => P.ev("const c = chats().find((w) => w._tabChain); return !!(c && c._tabChain.layout === 'split');"), 15000);
    ok(has, 'the phone restored the chain WITH the split in its model');
    const ph = await P.ev(`const c = chats().find((w) => w._tabChain); const ch = c._tabChain; const host = wm.windows.get(ch.tabs[0]); const members = ch.tabs.map((id) => wm.windows.get(id)); const shown = members.filter((w) => w && disp(w.content) !== 'none').map((w) => w.id); const vis = (sel) => [...document.querySelectorAll(sel)].filter((el) => disp(el) !== 'none' && el.getBoundingClientRect().width > 0).length; return { layout: ch.layout, pair: ch.split && ch.split.pair.map(sidOf), shown: shown.length, narrow: wm._mobileLayout(), isMobile: app.isMobile, btnVisible: vis('.tab-split-btn'), glyphVisible: vis('.tab-split-glyph') };`);
    ok(ph.layout === 'split' && S(ph.pair) === S(want.pair) && ph.narrow && ph.isMobile, 'the phone\'s model says split with the same pair (narrow, isMobile)', S({ ph, want }));
    ok(ph.shown === 1, 'the phone DISPLAYS one pane', S(ph));
    ok(ph.btnVisible === 0 && ph.glyphVisible === 0, 'no .tab-split-btn / .tab-split-glyph visible on the phone', S(ph));
    await P.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 400 }] });
    await P.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(100);
    ok(await P.ev('return app.layoutManager._userDirty === true;'), 'a real tap made the phone user-dirty (its save is a user-caused save)');
    const saved = await P.ev(`const lm = app.layoutManager; lm._lastSentJson = null; const st = lm.captureState(); const w = st.windows.find((x) => x.tabChain && !x.isTabGuest); await lm._doAutoSave(); return w && w.tabChain;`);
    ok(saved && saved.layout === 'split' && saved.split && saved.split.pair.length === 2, 'the phone\'s captureState carries the split verbatim', S(saved));
    await sleep(1200);
    const disk = chainFromDisk();
    ok(disk && disk.layout === 'split' && disk.split && disk.split.pair.length === 2, 'after the phone\'s save, data/layouts.json still says split (never flattened)', S(disk));
    const desk = await view(P1);
    ok(desk.layout === 'split' && desk.grid && S(desk.pair) === S(want.pair), 'the desktop client still shows the same split after the phone\'s broadcast', S(desk));
    P.close(); await P1.send('Target.closeTarget', { targetId: pp.targetId });
  }

  // ── 10 · command mode ──
  console.log('— 10 · command mode: Ctrl+\\ v toggles side by side, V swaps');
  {
    await P1.send('Page.bringToFront');
    await clearToasts();
    await ev(`const c = chats().find((w) => w._tabChain); const ch = c._tabChain; wm.unbindSplit(ch); wm.activeWindowId = ch.tabs[ch.active]; return true;`);
    const key = async (k) => {
      await P1.send('Input.dispatchKeyEvent', { type: 'keyDown', key: '\\', code: 'Backslash', windowsVirtualKeyCode: 220, modifiers: 2 });
      await P1.send('Input.dispatchKeyEvent', { type: 'keyUp', key: '\\', code: 'Backslash', windowsVirtualKeyCode: 220, modifiers: 2 });
      await sleep(80);
      const shift = k === k.toUpperCase();
      await P1.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: 'Key' + k.toUpperCase(), text: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: shift ? 8 : 0 });
      await P1.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: 'Key' + k.toUpperCase(), windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: shift ? 8 : 0 });
      await sleep(300);
    };
    const cm = () => ev(`const ch = chats().find((w) => w._tabChain)._tabChain; return { layout: ch.layout, pair: ch.split ? [...ch.split.pair] : null, active: ch.tabs[ch.active] };`);
    const c0 = await cm();
    await key('v');
    const c1 = await cm();
    ok(c0.layout === 'tabs' && c1.layout === 'split' && c1.pair[0] === c0.active, 'Ctrl+\\ v on a tabs chain ⇒ side by side, the active tab on the left', S({ c0, c1 }));
    await key('v');
    const c2 = await cm();
    ok(c2.layout === 'tabs', 'Ctrl+\\ v again ⇒ back to tabs', S(c2));
    await key('v');
    const c3 = await cm();
    await key('V');
    const c4 = await cm();
    ok(c3.layout === 'split' && c4.layout === 'split' && S(c4.pair) === S([...c3.pair].reverse()), 'Ctrl+\\ V ⇒ left and right swapped', S({ c3, c4 }));
  }

  // ── 11 · r1: the verifier's three ──
  console.log('— 11 · r1: the strip button names the partner it will use; the merge toast never lies; the menu keeps the focus');
  {
    // ② the merge toast is withdrawn when the split is taken through the strip button
    const ids = await scene();
    const from = { x: ids.bTitle.left + ids.bTitle.width / 2, y: ids.bBar.top + ids.bBar.height / 2 };
    const to = centre(ids.aIcon);
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, { button: 'left', clickCount: 1 });
    for (let i = 1; i <= 14; i++) { await mouse('mouseMoved', from.x + (to.x - from.x) * i / 14, from.y + (to.y - from.y) * i / 14, { button: 'left', buttons: 1 }); await sleep(35); }
    await mouse('mouseReleased', to.x, to.y, { button: 'left', clickCount: 1 });
    await sleep(250);
    const mt = await toastWith('Grouped as tabs');
    ok(mt && mt.action === 'Show side by side', '11② the merge raised "Grouped as tabs" [Show side by side]', S(mt));
    const br = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; return rect(wm.windows.get(ch.tabs[0]).titleBar.querySelector(':scope > .tab-split-btn'));`);
    await click(centre(br));
    const after = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; return ch && ch.layout;`);
    const stale = await toastWith('Grouped as tabs');
    ok(after === 'split' && stale === null, '11② the strip button split the group AND withdrew the "Grouped as tabs" toast (r0: it stayed up, its action a silent no-op)', S({ after, stale }));
    ok(!!(await toastWith('Side by side')), '11② the split\'s own Undo toast is the one left');
    // its action, if it ever runs after the split happened elsewhere (a remote apply), SAYS so
    await clearToasts();
    await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; wm.unbindSplit(ch); wm._afterUserMerge(ch); ch.layout = 'split'; ch.split = { pair: [ch.tabs[0], ch.tabs[1]], ratio: 0.5, dir: 'row' }; wm._normalizeChain(ch); wm._applyChainLayout(ch); wm._renderTabBar(ch); return true;`);
    const mt2 = await toastWith('Grouped as tabs');
    if (mt2 && mt2.actionRect) await click(centre(mt2.actionRect));
    const said = await toastWith('Already shown side by side');
    ok(mt2 && said, '11② the stale merge toast\'s action ⇒ "Already shown side by side" (never silence)', S({ mt2, said }));
    // … and when the group is gone
    await clearToasts();
    await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; wm.unbindSplit(ch); wm._afterUserMerge(ch); wm._detachFromChain(ch, ${S(ids.B)}); return true;`);
    const mt3 = await toastWith('Grouped as tabs');
    if (mt3 && mt3.actionRect) await click(centre(mt3.actionRect));
    const gone = await toastWith('The tab group changed');
    ok(mt3 && gone && await ev(`return !wm.windows.get(${S(ids.A)})._tabChain;`), '11② the group dissolved before the click ⇒ its action says "The tab group changed…"', S({ mt3, gone }));

    // ① three tabs [Alpha, Bravo, Charlie]; a split then an unsplit; a plain tab click must re-label the button
    await clearToasts();
    await ev(`app.attachSession(${S(sidC)}, 'Charlie', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev(`return !!bySid(${S(sidC)});`), 10000);
    const idC = await ev(`return bySid(${S(sidC)}).id;`);
    await ev(`const A = wm.windows.get(${S(ids.A)}), B = wm.windows.get(${S(ids.B)}), Cw = wm.windows.get(${S(idC)}); if (A._tabChain) wm._detachFromChain(A._tabChain, B.id); wm.createTabChain(A, B); wm.addToTabChain(A._tabChain, Cw); const ch = A._tabChain; wm.switchTab(ch, ch.tabs.indexOf(A.id)); wm.splitActive(ch); wm.unbindSplit(ch); return true;`);
    await sleep(300);
    const tabRect = (id) => ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; const host = wm.windows.get(ch.tabs[0]); const t = [...host.titleBar.querySelectorAll('.tab-item')].find((x) => x.dataset.winId === ${S(id)}); return t ? rect(t) : null;`);
    const b0 = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; const btn = wm.windows.get(ch.tabs[0]).titleBar.querySelector(':scope > .tab-split-btn'); return { tabs: ch.tabs.length, layout: ch.layout, title: btn && btn.title };`);
    ok(b0.tabs === 3 && b0.layout === 'tabs', '11① a 3-tab chain in tabs after split + unsplit', S(b0));
    const tb = await tabRect(ids.B);
    if (tb) await click(centre(tb));
    const b1 = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; const btn = wm.windows.get(ch.tabs[0]).titleBar.querySelector(':scope > .tab-split-btn'); const partner = wm.windows.get((${C.splitPartner.toString()})(ch, ch.recent)); return { active: ch.tabs[ch.active], recent: ch.recent, partnerId: partner && partner.id, partnerTitle: partner && String(partner.title || ''), title: btn && btn.title, aria: btn && btn.getAttribute('aria-label'), btn: btn && rect(btn), others: ch.tabs.filter((x) => partner && x !== partner.id && x !== ch.tabs[ch.active]).map((x) => String(wm.windows.get(x).title || '')) };`);
    ok(b1.active === ids.B && b1.partnerId && b1.partnerId !== ids.B, '11① the Bravo tab click made Bravo active; splitPartner names another tab', S(b1));
    ok(b1.title && b1.partnerTitle && b1.title.includes(b1.partnerTitle) && !b1.others.some((o) => o && b1.title.includes(o + ' on the right')) && b1.aria === b1.title, `11① the button's title/aria-label names splitPartner's window "${b1.partnerTitle}" (r0: the stale name from before the switch)`, S(b1));
    if (b1.btn) await click(centre(b1.btn));
    const p1 = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; return { layout: ch.layout, pair: ch.split && ch.split.pair };`);
    ok(p1.layout === 'split' && S(p1.pair) === S([ids.B, b1.partnerId]), '11① the click used the partner the tooltip named: pair [Bravo, that window]', S({ p1, b1 }));

    // ③ right-click the Alpha tab ⇒ Show side by side ▸ Beside Charlie ⇒ pair [A, C], the focus stays on A
    await clearToasts();
    await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; wm.unbindSplit(ch); return true;`);
    await sleep(200);
    const ta = await tabRect(ids.A);
    const nameC = await ev(`return String(wm.windows.get(${S(idC)}).title || '').split(' — ')[0];`);
    if (ta) { const pt = centre(ta); await mouse('mouseMoved', pt.x, pt.y); await mouse('mousePressed', pt.x, pt.y, { button: 'right', clickCount: 1 }); await mouse('mouseReleased', pt.x, pt.y, { button: 'right', clickCount: 1 }); await sleep(250); }
    const row = await ev(`const m = document.querySelector('.taskbar-context-menu'); if (!m) return null; const r = [...m.querySelectorAll(':scope > .taskbar-context-menu-item')].find((el) => el.firstChild && String(el.firstChild.textContent).startsWith('Show side by side')); return r ? rect(r) : null;`);
    ok(!!row, '11③ the Alpha tab\'s menu has "Show side by side ▸"', S(row));
    if (row) { await mouse('mouseMoved', row.left + 10, row.top + row.height / 2); await sleep(250); }
    const item = await ev(`const m = document.querySelector('.taskbar-context-menu'); const it = m && [...m.querySelectorAll('.taskbar-context-menu .taskbar-context-menu .taskbar-context-menu-item')].find((el) => el.textContent.includes(${S(nameC)})); return it ? rect(it) : null;`);
    if (item) { const pt = centre(item); await mouse('mouseMoved', pt.x - 20, pt.y); await mouse('mouseMoved', pt.x, pt.y); await click(pt); }
    const f = await ev(`const ch = wm.windows.get(${S(ids.A)})._tabChain; return { layout: ch.layout, pair: ch.split && ch.split.pair, active: ch.tabs[ch.active], wmActive: wm.activeWindowId };`);
    ok(item && f.layout === 'split' && S(f.pair) === S([ids.A, idC]), '11③ "Beside Charlie" ⇒ pair [Alpha, Charlie]', S({ item, f }));
    ok(f.active === ids.A && f.wmActive === ids.A, '11③ the focus stays on the right-clicked Alpha (r0: it moved to Charlie)', S(f));
    await clearToasts();
  }

  } finally {
    if (P1) P1.close();
    try { if (chrome) chrome.kill('SIGKILL'); } catch { }
    await killSessions();
    try { ws.close(); } catch { }
    srv.kill('SIGKILL');
  }
})().catch((e) => ok(false, 'the chrome leg threw', e && (e.stack || e.message)));

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
