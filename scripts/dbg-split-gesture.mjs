#!/usr/bin/env node
// THE OWNER'S SIDE-BY-SIDE GESTURES, replayed in headless Chrome against a
// scratch server (docs/design-split-ux.zh.md §1 — the numbers in that table
// come from this script). NOT a test-*.mjs on purpose: it records what the
// window manager DOES today for three drags and prints the facts; the gate
// that asserts the decided behaviour is scripts/test-split-ux.mjs (chunk 3).
//
// Scene: two chat windows on stub sessions (a fake `claude` on CLAUDE_CMD),
// A snapped to the LEFT edge (its title bar covers the 30 px snap band), B on
// the right. Gestures, each a real title-bar drag through Input.dispatchMouseEvent:
//   G1 "拖到左边" — B dragged LEFT, released on the RIGHT half of A's title bar
//   G2 "拖到左侧边缘" — B dragged to x = 12 (inside the workspace's left snap band), on A's title bar
//   G3 control — B dragged LEFT, released on empty workspace below A
// After G1 the strip / badge / divider facts (the owner's problems 2 + 3).
// Usage: node scripts/dbg-split-gesture.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('split-gesture');
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
if (!CHROME) { console.error('no chrome'); process.exit(2); }
const out = {};
await (async () => {
  fakeHome = scratchHome('split-gesture-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const SID = 'e2e00000-0000-4000-8000-00000000a001';
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hookLine}' '${initLine}';; esac\nexec sleep 600\n`, { mode: 0o755 });
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const env = { ...process.env, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!await until(() => journal.includes('Ready.'), 40000, 100)) { console.error('server did not boot\n' + journal.slice(-800)); return; }
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  const create = async (reqId, name) => { ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId, name })); await until(() => msgs.some((m) => m.type === 'created' && m.reqId === reqId), 15000); return msgs.find((m) => m.type === 'created' && m.reqId === reqId)?.sessionId; };
  const sidA = await create('a', 'Alpha'), sidB = await create('b', 'Bravo');
  await sleep(1200);
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  procs.add(chrome);
  let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 }); await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map(); cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
  const ev = async (js) => { const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm; const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; }; const chats = () => [...wm.windows.values()].filter((w) => w.type === 'chat'); ${js} })()`, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw'); return r.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  for (let i = 0; i < 120; i++) { try { if (await ev('if (!window.app || !window.app.ready) return false; await window.app.ready; return true;')) break; } catch { } await sleep(250); }
  await sleep(1500);
  const openTwo = async () => {
    await ev(`for (const w of [...wm.windows.values()]) wm.closeWindow(w.id); return true;`);
    await ev(`app.attachSession(${JSON.stringify(sidA)}, 'Alpha', ${JSON.stringify(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev('return chats().length === 1;'), 10000);
    await ev(`app.attachSession(${JSON.stringify(sidB)}, 'Bravo', ${JSON.stringify(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev('return chats().length === 2;'), 10000);
    // A snapped to the LEFT edge (the real snap, so its title bar covers the workspace's 30 px band); B free on the right
    return ev(`const [A, B] = chats().sort((x, y) => (app.sessions.get(x.id)?.sessionId === ${JSON.stringify(sidA)} ? -1 : 1)); wm._applySnap(A.id, 'left'); A._isSnapped = true; B.element.style.left = '700px'; B.element.style.top = '80px'; B.element.style.width = '480px'; B.element.style.height = '360px'; wm._captureGridBounds(B); return new Promise((res) => setTimeout(() => res({ A: A.id, B: B.id, a: rect(A.element), b: rect(B.element), aBar: rect(A.titleBar), bBar: rect(B.titleBar), bTitle: rect(B.titleSpan), ws: rect(wm.workspace) }), 400));`);
  };
  const drag = async (from, to, steps = 14) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
    let lastSnap = null, lastMark = null;
    for (let i = 1; i <= steps; i++) {
      const x = from.x + (to.x - from.x) * (i / steps), y = from.y + (to.y - from.y) * (i / steps);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' }); await sleep(35);
      lastSnap = await ev('return wm.snapIndicator.style.display;');
      lastMark = await ev(`return [...wm.windows.values()].map((w) => (w.element.classList.contains('tab-split-drop-left') ? 'L' : w.element.classList.contains('tab-split-drop-right') ? 'R' : '')).join('');`);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
    await sleep(500);
    return { snapIndicatorAtRelease: lastSnap, splitMarkAtRelease: lastMark };
  };
  const state = (ids) => ev(`const A = wm.windows.get(${JSON.stringify(ids.A)}), B = wm.windows.get(${JSON.stringify(ids.B)}); const ch = B._tabChain; const host = ch && wm.windows.get(ch.tabs[0]); return { layout: ch ? ch.layout : 'free', pair: ch && ch.split ? ch.split.pair.map((id) => (id === A.id ? 'A' : 'B')) : null, tabsOrder: ch ? ch.tabs.map((id) => (id === A.id ? 'A' : 'B')) : null, stripOrder: host ? [...host.titleBar.querySelectorAll('.tab-item')].map((t) => (t.dataset.winId === A.id ? 'A' : 'B')) : null, bRect: rect(B.element), bContent: rect(B.content), aContent: rect(A.content), bSnapped: !!B._isSnapped, bDisplay: getComputedStyle(B.element).display };`);

  // ── G1: B dragged LEFT, released on the RIGHT half of A's title bar ──
  let ids = await openTwo();
  const g1From = { x: ids.bTitle.left + ids.bTitle.width * 0.5, y: ids.bBar.top + ids.bBar.height / 2 };
  const g1To = { x: ids.aBar.left + ids.aBar.width * 0.8, y: ids.aBar.top + ids.aBar.height / 2 };
  const g1Drag = await drag(g1From, g1To);
  out.G1 = { from: g1From, to: g1To, aBar: ids.aBar, b0: ids.b, ...g1Drag, after: await state(ids) };
  // the strip / badge / divider facts after the split (problems 2 + 3)
  out.afterSplit = await ev(`const B = wm.windows.get(${JSON.stringify(ids.B)}); const ch = B._tabChain; if (!ch || ch.layout !== 'split') return null; const host = wm.windows.get(ch.tabs[0]); const tabs = [...host.titleBar.querySelectorAll('.tab-item')]; const div = host.element.querySelector(':scope > .tab-split-divider'); const cs = getComputedStyle(host.element); return { tabsInStrip: tabs.map((t) => ({ id: t.dataset.winId === ${JSON.stringify(ids.A)} ? 'A' : 'B', splitMember: t.classList.contains('split-member'), before: getComputedStyle(t.querySelector('.tab-label'), '::before').content, x: Math.round(rect(t).left) })), pairVisual: ch.split.pair.map((id) => (id === ${JSON.stringify(ids.A)} ? 'A' : 'B')), splitGlyphs: host.titleBar.querySelectorAll('.tab-split-glyph, .win-split-badge, .tab-split-btn').length, dividerBg: div && getComputedStyle(div).backgroundColor, dividerW: div && rect(div).width, windowBorder: cs.borderColor, hostTitle: host.titleBar.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80) };`);
  // ── G2: B dragged to the LEFT EDGE (x = 12, inside the snap band), over A's title bar ──
  ids = await openTwo();
  const g2From = { x: ids.bTitle.left + ids.bTitle.width * 0.5, y: ids.bBar.top + ids.bBar.height / 2 };
  const g2To = { x: ids.ws.left + 12, y: ids.aBar.top + ids.aBar.height / 2 };
  const g2Drag = await drag(g2From, g2To);
  out.G2 = { from: g2From, to: g2To, snapBand: 30, ...g2Drag, after: await state(ids) };
  // ── G3 control: B dragged LEFT, released on empty workspace BELOW A ──
  ids = await openTwo();
  const g3From = { x: ids.bTitle.left + ids.bTitle.width * 0.5, y: ids.bBar.top + ids.bBar.height / 2 };
  const g3To = { x: ids.a.left + ids.a.width * 0.6, y: ids.a.bottom + 40 };
  const g3Drag = await drag(g3From, g3To);
  out.G3 = { from: g3From, to: g3To, ...g3Drag, after: await state(ids) };
  // ── the drop-zone census: how much of A's title bar is a split zone? ──
  out.zone = await ev(`const A = wm.windows.get(${JSON.stringify(ids.A)}); const bar = rect(A.titleBar); const icon = rect(A.titleBar.querySelector('.window-icon-stack')); const ctl = rect(A.titleBar.querySelector('.window-controls')); return { barWidth: Math.round(bar.width), splitZoneWidth: Math.round(ctl.left - icon.right), pct: Math.round(100 * (ctl.left - icon.right) / bar.width) };`);
  try { cdp.close(); } catch { }
  try { chrome.kill('SIGKILL'); } catch { }
  for (const sid of [sidA, sidB]) ws.send(JSON.stringify({ type: 'kill', sessionId: sid }));
  await until(() => [sidA, sidB].every((sid) => msgs.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === sid)), 8000);
  try { ws.close(); } catch { }
  srv.kill('SIGKILL');
})().catch((e) => { console.error('threw', e && (e.stack || e.message)); });
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  const r = (n) => Math.round(n);
  for (const g of ['G1', 'G2', 'G3']) { const x = out[g]; if (!x) continue; console.log(`${g}: pointer ${r(x.from.x)},${r(x.from.y)} → ${r(x.to.x)},${r(x.to.y)} (Δx ${r(x.to.x - x.from.x)}) · at release: snap indicator ${x.snapIndicatorAtRelease === 'none' ? 'hidden' : 'SHOWN'}, split mark ${JSON.stringify(x.splitMarkAtRelease)} · result: layout=${x.after.layout} pair=${JSON.stringify(x.after.pair)} tabs=${JSON.stringify(x.after.tabsOrder)} strip=${JSON.stringify(x.after.stripOrder)} B content left=${r(x.after.bContent.left)} A content left=${r(x.after.aContent.left)} B snapped=${x.after.bSnapped} B element display=${x.after.bDisplay}`); }
  console.log('after G1 split:', JSON.stringify(out.afterSplit));
  console.log('split zone census:', JSON.stringify(out.zone));
}
