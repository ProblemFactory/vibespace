#!/usr/bin/env node
// A TAB DRAGGED OUT OF THE BAR ON THE STAGE, SEEN (userW inc-muly2izg-cks3, 2026-09-28 — "在 Dynamic Desktop 里面用这个
// Browser，Browser 拖不出来": he pulled the browser tab out of its group INSIDE the Stage to make it its own window; heavy —
// a scratch server + headless chrome at the reporter's page (1571×854, DPR 2.2, UI scale 90 %) + real CDP mouse drags).
//
// Scene = the incident's: the Stage on, its slot on the right, a chat hero "Alpha" (a fake claude), its agent-browser
// live view BORN beside it in one split tab group (the auto-bind's path: openBrowserLive intoChain split), bound to the
// hero's workspace as an aux window.
// ROOT CAUSE (reproduced RED on b970f16d): split tabs v2 decided a tab drag ONCE on its first 8 px — mostly horizontal ⇒
// a strip REORDER for the whole drag — and the reporter's pull from the ring (the live tab (1246, 104) → the empty
// workspace (795, 455), Δ −451/+351) is more horizontal than vertical, so the tab never left the group. The fix (PURE
// chain-layout tabDragMode): a reorder whose pointer leaves the strip's band by > 30 px TEARS OFF.
//   0  THE INCIDENT, REPLAYED (owner correction #2: the tab DID leave the bar and then the window was GONE): the live view
//      auto-opened into the chat's group while the Stage was off screen, then Stage round trips (the ring has ten) —
//      2.369.196 left the Stage's leave-time `visibility:hidden; pointer-events:none` on the guest's own element (the
//      enter re-showed the hero + its bound aux only). The ring verbatim — the tab pressed at (1246, 104), released at
//      (795, 455): 0a the straight line, 0b a hand's pull that starts DOWN (on 2.369.196 it detached into an INVISIBLE
//      window: its taskbar button there, nothing on screen, the ring's next press at (795, 455) on the empty workspace),
//      0c the belt (any hider's mark left on a guest). Asserted: the window VISIBLE (computed display / visibility /
//      pointer-events, no hidden flag, not minimized, in view, on top, content shown), the taskbar lists it, the ring's
//      press lands IN it, still visible after the next leave / enter. STAGEDRAG_TREE=<a built 2.369.196 tree> shows it RED.
//   1  the reporter's gesture on the Stage ⇒ its own window where the pointer left it, still the hero's aux on the Stage,
//      and it STAYS apart past the workspace record (500 ms), a remote reconcile of the hero's record and a leave →
//      re-enter round trip (nothing the stage does puts the pair back)
//   2  the same gesture on a NORMAL desktop (two file explorers) ⇒ torn off too (the cause is the tab drag, not the Stage)
//   3  a sideways reorder that wobbles 18 px below the bar stays a REORDER (the split-tabs v2 promise kept)
//   4  the other shapes on the Stage: a plain TABS group, the HERO's own tab, a 2×2 stage grid, a pull UP onto a preview
//   5  (secondary) THE REFUSED DESKTOP DRAG SPEAKS — the owner's 2.112.4 rule stays: a Stage window dragged by its title
//      bar onto a desktop preview marks the preview and puts the refusal's words beside the pointer; the drop puts it
//      back where it began and a toast says why + what to do (the live view; the hero); the window menu's "Move to
//      Desktop ▸" holds ONE reason row; a desktop window over the Stage preview says it the other way round
// SKIPs with evidence without chrome / dtach / a built bundle. Free ports, scratch dirs only (/tmp/vs-stagedrag-<pid>).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// BEFORE / AFTER (a diagnostic knob, never set by the gate): STAGEDRAG_TREE = another built tree whose src / public /
// server.js the scratch server runs instead of this checkout's — e.g. the 2.369.196 tree, to see the incident RED
const TREE = process.env.STAGEDRAG_TREE ? path.resolve(process.env.STAGEDRAG_TREE) : repo;
const ROOT = scratch('stagedrag');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  if (fakeHome) { try { endRootedProcesses(fakeHome); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else if (!fs.existsSync(path.join(TREE, 'public', 'bundle.js'))) skip('public/bundle.js is not built in this checkout (npm run build) — the page would be the last build, not this tree');
else await (async () => {
  fakeHome = scratchHome('stagedrag-home', fs);
  // the server root: the committed tree (git archive — no worktree registered anywhere) + this checkout's src / public / server.js
  const wt = path.join(ROOT, 'srv'); const BIN = path.join(ROOT, 'bin');
  fs.mkdirSync(wt, { recursive: true }); fs.mkdirSync(BIN, { recursive: true });
  execSync(`git -C ${JSON.stringify(repo)} archive HEAD | tar -x -C ${JSON.stringify(wt)}`, { stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json']) { fs.rmSync(path.join(wt, f), { recursive: true, force: true }); execFileSync('cp', ['-r', path.join(TREE, f), path.join(wt, f)]); }
  if (TREE !== repo) console.log('  (the server runs the tree at ' + TREE + ')');
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  // a fake claude: names its own conversation (the fixture family + the shell's pid), then idles
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: '%s', hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: '%s', cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\nSID="e2e00000-0000-4000-8000-$(printf '%012d' $$)"\ncase " $* " in *" --output-format "*) sleep 1; printf '${hookLine}\\n${initLine}\\n' "$SID" "$SID";; esac\nexec sleep 600\n`, { mode: 0o755 });
  const PORT = await freePort(), CDP = await freePort();
  const env = { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 40000, 100), 'the scratch server booted', journal.slice(-800))) return;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  const create = async (reqId, name) => { ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId, name })); await until(() => msgs.some((m) => m.type === 'created' && m.reqId === reqId), 15000); return msgs.find((m) => m.type === 'created' && m.reqId === reqId)?.sessionId; };
  const sidM = await create('m', 'Alpha');
  let chrome = null, P1 = null;
  try {
    if (!ok(!!sidM, 'a chat session "Alpha" was created on the fake claude', journal.slice(-600))) return;
    await sleep(1200);
    chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1571,854', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    procs.add(chrome);
    let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!ok(!!target, 'chrome exposed a CDP page target')) return;
    const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
    let seq = 0; const pend = new Map();
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
    const ev = async (js) => {
      const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm, st = app.stage, dm = app.desktopManager; const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; }; const disp = (el) => getComputedStyle(el).display; ${js} })()`, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
      return r.result?.result?.value;
    };
    P1 = { close: () => { try { cdp.close(); } catch { } } };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard would cover the chrome on an empty runner
    // the reporter's page: 1571×854 CSS px at DPR 2.2, UI scale 90 % (the incident snapshot) — the body zoom every drag converts through
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.uiScale', '90'); } catch {}" });
    await send('Emulation.setDeviceMetricsOverride', { width: 1571, height: 854, deviceScaleFactor: 2.2, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    let booted = false; for (let i = 0; i < 120 && !booted; i++) { try { booted = await ev('if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);'); } catch { } if (!booted) await sleep(250); }
    if (!ok(booted, 'the app booted in headless chrome (1571×854, DPR 2.2, UI scale 90 %)')) return;
    await sleep(1200);
    const S = JSON.stringify;
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    /** A real mouse drag: press at `from`, `steps` moves, release at `to`. `probe` runs (in page) just before the release. */
    const SHOTS = process.env.STAGEDRAG_SHOTS || ''; // a directory ⇒ a PNG of the page just before each named release (a person looks at it)
    const snap = async (name) => { if (!SHOTS) return; try { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); } catch { } };
    const drag = async (from, to, { steps = 16, probe = null, shot = null } = {}) => {
      await mouse('mouseMoved', from.x, from.y);
      await mouse('mousePressed', from.x, from.y, { button: 'left', clickCount: 1 });
      for (let i = 1; i <= steps; i++) { const x = from.x + (to.x - from.x) * (i / steps), y = from.y + (to.y - from.y) * (i / steps); await mouse('mouseMoved', x, y, { button: 'left', buttons: 1 }); await sleep(35); }
      await sleep(80);
      const seen = probe ? await ev(probe) : null;
      if (SHOTS && shot) { try { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) fs.writeFileSync(path.join(SHOTS, shot + '.png'), Buffer.from(r.result.data, 'base64')); } catch { } }
      await mouse('mouseReleased', to.x, to.y, { button: 'left', clickCount: 1 });
      await sleep(700); // past the 220 ms snap animation + the 250 ms bounds capture
      return seen;
    };

    // ── the scene: a second desktop to aim at, the Stage on with its slot on the RIGHT (the reporter's hero sat there: his
    //    tab was pressed at x 1246 of 1571), the hero, its live view born beside it ──
    await ev(`const id = dm.createDesktop(); dm.renameDesktop(id, 'Work'); return id;`);
    await ev(`app.settings.set('desktop.dynamicEnabled', true); return true;`);
    await sleep(600);
    ok(await ev('return !!(st && st.enabled);'), 'the Stage is enabled');
    await ev('st.saveSlot({ left: 0.4, top: 0, width: 0.6, height: 0.62 }); await st.enter(); return true;');
    await sleep(500);
    await ev(`app.attachSession(${S(sidM)}, 'Alpha', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    const heroOk = await until(() => ev(`const h = st._heroWinId && wm.windows.get(st._heroWinId); return !!(h && h.type === 'chat' && (app.sessions.get(h.id) || {}).sessionId === ${S(sidM)});`), 12000);
    if (!ok(heroOk, 'Alpha materialized as the Stage hero')) return;
    await until(() => ev('return !!st._heroKey || !!st._sessionKeyFor(wm.windows.get(st._heroWinId));'), 8000);
    const heroId = await ev('return st._heroWinId;');
    // THE LIVE VIEW'S BIRTH, as the incident's ring allows it: the Stage was left and entered again and again (ten
    // round trips in the ring), and the agent's browser started while the Stage was NOT on screen — the auto-bind
    // (browser-live-window autoBindLiveViews, the `browser-profiles-updated` digest's new lease) opens the live view
    // INTO the chat's group even though that group is hidden by the Stage; the stage binds nothing while it is off
    await ev('await st.leave(); return true;'); await sleep(900);
    const opened = await ev(`return app.onBrowserDigestChanged({ leases: [] }, { leases: [{ profileId: 'p-work', sessionId: ${S(sidM)} }] });`);
    const liveId = 'win-blive-' + sidM;
    await sleep(700);
    const born = await ev(`const h = wm.windows.get(${S(heroId)}), l = wm.windows.get(${S(liveId)}); if (!l) return { none: true }; const ch = h._tabChain; return { chain: !!ch, same: !!(ch && l._tabChain === ch), layout: ch && ch.layout, tabs: ch && ch.tabs, bound: st._boundAux.get(${S(liveId)}) || null, desk: l._desktopId, staged: st.isActive };`);
    if (!ok(Array.isArray(opened) && opened.includes(liveId) && born.chain && born.same && born.tabs.length === 2 && born.desk === '__stage__' && !born.staged, 'the agent\'s browser starts while the Stage is off screen: the auto-bind opens the live view INTO the chat\'s (Stage-hidden) group, tagged to the Stage, unbound', S({ opened, born }))) return;
    // …and the ring's round trips: enter, leave, enter
    await ev('await st.enter(); return true;'); await sleep(1400);
    await ev('await st.leave(); return true;'); await sleep(900);
    await ev('await st.enter(); return true;'); await sleep(1400);
    const marks = await ev(`const h = wm.windows.get(${S(heroId)}), l = wm.windows.get(${S(liveId)}); return { heroShown: getComputedStyle(h.element).visibility === 'visible' && !h._hiddenByStage, guestHiddenByStage: !!l._hiddenByStage, guestVisibility: l.element.style.visibility || '', guestPE: l.element.style.pointerEvents || '', bound: st._boundAux.get(${S(liveId)}) || null };`);
    console.log('    the guest after the round trips: ' + S(marks));
    ok(marks.heroShown, 'the hero and its group are on the Stage again after the round trips', S(marks));

    const regroup = async (layout) => {
      await ev(`const h = wm.windows.get(${S(heroId)}), l = wm.windows.get(${S(liveId)}); if (l._tabChain) wm._detachFromChain(l._tabChain, l.id); if (h._tabChain) wm._detachFromChain(h._tabChain, h.id); if (${S(layout)} === 'split') wm.bindSplit(h, l, { side: 'right' }); else wm.createTabChain(h, l); return true;`);
      await sleep(700);
      return ev(`const h = wm.windows.get(${S(heroId)}), l = wm.windows.get(${S(liveId)}); const ch = h._tabChain; return { same: !!(ch && l._tabChain === ch), layout: ch && ch.layout, active: ch && ch.tabs[ch.active], order: ch && [...(ch.order || ch.tabs)] };`);
    };
    const tabOf = (id) => ev(`const w = wm.windows.get(${S(id)}); const ch = w && w._tabChain; if (!ch) return null; const host = wm.windows.get(ch.tabs[0]); const el = host.titleBar.querySelector('.tab-item[data-win-id="' + ${S(id)} + '"] .tab-label'); return el ? rect(el) : null;`);
    const barOf = (id) => ev(`const w = wm.windows.get(${S(id)}); const ch = w && w._tabChain; const host = ch ? wm.windows.get(ch.tabs[0]) : w; return rect(host.titleBar);`);
    const apart = () => ev(`const h = wm.windows.get(${S(heroId)}), l = wm.windows.get(${S(liveId)}); return { heroChain: !!h._tabChain, liveChain: !!l._tabChain, liveDisp: disp(l.element), heroDisp: disp(h.element), liveVis: l.element.style.visibility, liveTitle: rect(l.titleBar), hero: st._heroWinId, staged: st.isActive, bound: st._boundAux.get(${S(liveId)}) || null, desk: l._desktopId, lives: [...wm.windows.values()].filter((w) => w.type === 'browser-live').length };`);
    const apartOk = (a) => !a.heroChain && !a.liveChain && a.liveDisp !== 'none' && a.heroDisp !== 'none' && a.liveVis !== 'hidden' && a.hero === heroId && a.bound != null && a.desk === '__stage__' && a.lives === 1;
    const clickAt = async (pt) => { await mouse('mouseMoved', pt.x, pt.y); await mouse('mousePressed', pt.x, pt.y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', pt.x, pt.y, { button: 'left', clickCount: 1 }); await sleep(300); };
    // THE REPORTER'S GESTURE, from the incident ring: the live view's tab pressed at (1246, 104), pressed again once it
    // was the shown tab, and his next press 3.4 s later on the empty workspace at (795, 455) — a straight pull down-LEFT,
    // Δ (−451, +351): MORE HORIZONTAL than vertical from its first pixel
    const REPORTED_PULL = { dx: -451, dy: 351 };
    const gesture = (tab) => { const from = { x: tab.left + tab.width / 2, y: tab.top + tab.height / 2 }; return { from, to: { x: Math.max(40, from.x + REPORTED_PULL.dx), y: from.y + REPORTED_PULL.dy } }; };

    // ── 0 · THE INCIDENT, REPLAYED FROM THE RING (owner correction #2: "他那个拖动出标签栏了，然后窗口就消失了" — the tab
    //    DID leave the bar and then the window was GONE). The ring, verbatim: −74.0 s a press on the live view's tab (not
    //    shown) at (1245, 106) · −73.3 s a press on it, now the shown tab, at (1246, 104) — the drag · −69.9 s a press at
    //    (795, 455) that landed on `main#workspace`: EMPTY workspace where he let go (the naive reading: he was looking
    //    for his window) · −66…−64 s his taskbar button toggled five times (nothing to see either way) · −63 s a window
    //    menu row · −61 s a tab in a `.tab-bar-split` strip (the live view back beside the chat). The −74 s bar is a plain
    //    TABS group. Two pulls: the ring's straight line (sideways first — the 2.369.196 build keeps it a reorder), and a
    //    hand's pull that starts DOWN (the 2.369.196 build detaches it — into an invisible window). What is asserted is
    //    what he saw: after the drop the live view is VISIBLE (computed, on top, inside the viewport, its content shown),
    //    the taskbar lists it, and the ring's empty-workspace press lands IN it.
    const placeTab = async () => {
      // a group ~570 px wide (his fitted the 1571 px page with its second tab at x 1246)
      await ev(`const h = wm.windows.get(${S(heroId)}); const host = h._tabChain ? wm.windows.get(h._tabChain.tabs[0]) : h; const z = parseFloat(getComputedStyle(document.body).zoom) || 1; host.element.style.width = (570 / z) + 'px'; host.element.style.height = (420 / z) + 'px'; wm._captureGridBounds(host); return true;`);
      await sleep(300);
      for (let i = 0; i < 4; i++) {
        const t0 = await tabOf(liveId);
        if (!t0) return null;
        const dx = 1245.5 - (t0.left + t0.width / 2), dy = 105 - (t0.top + t0.height / 2);
        if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) break;
        await ev(`const h = wm.windows.get(${S(heroId)}); const host = h._tabChain ? wm.windows.get(h._tabChain.tabs[0]) : h; const z = parseFloat(getComputedStyle(document.body).zoom) || 1; host.element.style.left = (parseFloat(host.element.style.left) + ${dx} / z) + 'px'; host.element.style.top = (parseFloat(host.element.style.top) + ${dy} / z) + 'px'; wm._captureGridBounds(host); return true;`);
        await sleep(400);
      }
      return tabOf(liveId);
    };
    const afterDrop = () => ev(`const l = wm.windows.get(${S(liveId)}), h = wm.windows.get(${S(heroId)}); const ch = l._tabChain; const host = ch ? wm.windows.get(ch.tabs[0]) : null;
      const shownBy = host || l; const cs = getComputedStyle(shownBy.element); const r = rect(shownBy.element);
      const tb = shownBy.titleBar.getBoundingClientRect();
      const ix = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)), iy = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      const inView = r.width > 40 && r.height > 40 && ix * iy >= 0.4 * r.width * r.height && tb.top >= 0 && tb.bottom <= innerHeight && tb.left + 40 < innerWidth && tb.right > 40; /* its title bar on screen and most of it in view */ const hitEl = document.elementFromPoint(Math.min(Math.max(tb.left + 40, 1), innerWidth - 1), Math.min(Math.max(tb.top + tb.height / 2, 1), innerHeight - 1));
      const onTop = !!(hitEl && shownBy.element.contains(hitEl));
      const contentShown = !l.content.classList.contains('tab-hidden') && getComputedStyle(l.content).display !== 'none' && l.content.getBoundingClientRect().width > 40;
      const tabEl = host ? host.titleBar.querySelector('.tab-item[data-win-id="' + l.id + '"]') : null;
      const half = tabEl && tabEl.closest('.tab-strip-half') ? tabEl.closest('.tab-strip-half').dataset.side : null;
      const tbItems = [...document.querySelectorAll('#taskbar-items .taskbar-item')].map((el) => ({ id: el.dataset.winId, group: el.dataset.groupTabs || null }));
      const inTaskbar = tbItems.some((x) => x.id === l.id || (x.group && x.group.split(',').includes(l.id)));
      const w = document.elementFromPoint(795, 455); const at795 = w ? (l.element.contains(w) ? 'live' : (h.element.contains(w) ? 'hero' : (w.id ? '#' + w.id : w.tagName.toLowerCase() + '.' + String(w.className).split(' ')[0]))) : null;
      return { inChain: !!ch, layout: ch && ch.layout, half, tabShown: !!(tabEl && tabEl.getBoundingClientRect().width > 0 && getComputedStyle(tabEl).display !== 'none'),
        display: cs.display, visibility: cs.visibility, pointerEvents: shownBy.element.style.pointerEvents || '', hiddenByStage: !!shownBy._hiddenByStage, hiddenByDesktop: !!shownBy._hiddenByDesktop, minimized: !!shownBy.isMinimized,
        rect: r, inView, onTop, contentShown, inTaskbar, at795, desk: l._desktopId, bound: st._boundAux.get(l.id) || null };`);
    const visibleOk = (x) => x.display !== 'none' && x.visibility === 'visible' && x.pointerEvents !== 'none' && !x.hiddenByStage && !x.hiddenByDesktop && !x.minimized && x.inView && x.onTop && x.contentShown;
    console.log('— 0 · the ring replayed on the Stage: the live tab of a TABS group, pressed at (1246, 104), released at (795, 455)');
    {
      await ev(`const h = wm.windows.get(${S(heroId)}); if (h._tabChain && h._tabChain.layout === 'split') wm.unbindSplit(h._tabChain); const ch = h._tabChain; if (ch) wm.switchTab(ch, ch.tabs.indexOf(h.id)); return true;`); await sleep(400);
      const g0 = await ev(`const h = wm.windows.get(${S(heroId)}), l = wm.windows.get(${S(liveId)}); const ch = h._tabChain; return { same: !!(ch && l._tabChain === ch), layout: ch && ch.layout, shown: ch && ch.tabs[ch.active] };`);
      ok(g0.same && g0.layout === 'tabs' && g0.shown === heroId, '0a the hero and its live view are ONE plain tabs group, the hero\'s tab shown (the −74 s bar)', S(g0));
      const t1 = await placeTab();
      ok(t1 && Math.abs(t1.left + t1.width / 2 - 1245.5) < 3 && Math.abs(t1.top + t1.height / 2 - 105) < 3, '0a the live view\'s tab stands where his did (±3 px of (1245, 106))', S(t1));
      await clickAt({ x: 1245, y: 106 }); // −74.0 s: the tab shown
      await snap('0a-before');
      await drag({ x: 1246, y: 104 }, { x: 795, y: 455 }, { steps: 24, shot: '0a-mid' }); // −73.3 s → the drop, the ring's straight line
      await sleep(900);
      await snap('0a-after-drop');
      const x = await afterDrop();
      console.log('    after the ring\'s straight pull: ' + S(x));
      ok(visibleOk(x), '0a (a) the live view is VISIBLE after the drop — frame displayed, visibility visible, pointer-events on, no Stage / desktop hidden mark, not minimized, inside the viewport, on top, its content shown', S(x));
      ok(!x.inChain || x.tabShown, '0a (b) if it is still a tab, its tab is rendered', S(x));
      ok(x.inTaskbar, '0a (c) the taskbar lists it', S(x));
      ok(x.at795 === 'live', '0a the ring\'s next press at (795, 455) — the EMPTY workspace in the incident — lands IN the live view: it is where he let it go (2.369.196: a strip reorder, the tab never left)', S(x.at795));
    }
    console.log('— 0b · the same history, a hand\'s pull that starts DOWN (the tab leaves the bar), released at (795, 455)');
    {
      // back into one tabs group — as he did at −63 s (the window menu's row put the live view beside the chat again)
      await ev(`const h = wm.windows.get(${S(heroId)}), l = wm.windows.get(${S(liveId)}); if (!l._tabChain) wm.bindSplit(h, l, { side: 'right' }); return true;`); await sleep(400);
      await ev(`const h = wm.windows.get(${S(heroId)}); if (h._tabChain && h._tabChain.layout === 'split') wm.unbindSplit(h._tabChain); return true;`); await sleep(300);
      // …and a Stage round trip, as his session had them
      await ev('await st.leave(); return true;'); await sleep(900);
      await ev('await st.enter(); return true;'); await sleep(1400);
      await ev(`const h = wm.windows.get(${S(heroId)}); const ch = h._tabChain; if (ch) wm.switchTab(ch, ch.tabs.indexOf(h.id)); return true;`); await sleep(300);
      const marks2 = await ev(`const l = wm.windows.get(${S(liveId)}); return { inChain: !!l._tabChain, hiddenByStage: !!l._hiddenByStage, visibility: l.element.style.visibility || '', pe: l.element.style.pointerEvents || '' };`);
      console.log('    the guest before the pull: ' + S(marks2));
      const t2 = await placeTab();
      ok(!!t2, '0b the live view is a tab of the hero\'s group again', S(marks2));
      await clickAt({ x: 1245, y: 106 });
      // the hand: straight down out of the bar first, then toward the empty workspace
      await mouse('mouseMoved', 1246, 104);
      await mouse('mousePressed', 1246, 104, { button: 'left', clickCount: 1 });
      for (const [px, py] of [[1246, 112], [1245, 124], [1243, 140], [1238, 160]]) { await mouse('mouseMoved', px, py, { button: 'left', buttons: 1 }); await sleep(35); }
      for (let i = 1; i <= 20; i++) { await mouse('mouseMoved', 1238 + (795 - 1238) * i / 20, 160 + (455 - 160) * i / 20, { button: 'left', buttons: 1 }); await sleep(35); }
      await snap('0b-mid');
      await mouse('mouseReleased', 795, 455, { button: 'left', clickCount: 1 });
      await sleep(1200);
      await snap('0b-after-drop');
      const y = await afterDrop();
      console.log('    after the hand\'s pull: ' + S(y));
      ok(!y.inChain, '0b the tab left the bar (as the owner says it did)', S(y));
      ok(visibleOk(y), '0b (a) …and the window is VISIBLE — 2.369.196: display back, but the Stage\'s leave-time `visibility:hidden; pointer-events:none` was still on the guest\'s own element (the enter re-showed the hero only): an INVISIBLE window, "然后窗口就消失了"', S(y));
      ok(y.inTaskbar, '0b (c) the taskbar lists it', S(y));
      ok(y.at795 === 'live', '0b the ring\'s next press at (795, 455) lands IN it (the incident\'s press found the empty workspace)', S(y.at795));
      ok(y.desk === '__stage__' && y.bound != null, '0b …on the Stage, now the hero\'s aux (the frame it left)', S(y));
      // the next round trip: it comes back with the hero (an unbound Stage window was hidden by the leave and never re-shown)
      await ev('await st.leave(); return true;'); await sleep(900);
      await ev('await st.enter(); return true;'); await sleep(1400);
      const z = await afterDrop();
      ok(!z.inChain && visibleOk(z) && z.inTaskbar, '0b a leave → re-enter later it is still VISIBLE on the Stage', S(z));
    }
    console.log('— 0c · the belt: a guest still carrying ANY hider\'s mark (the exact state 2.369.196 left on his) is pulled out ⇒ visible');
    {
      await ev(`const h = wm.windows.get(${S(heroId)}), l = wm.windows.get(${S(liveId)}); if (!l._tabChain) wm.bindSplit(h, l, { side: 'right' }); if (h._tabChain && h._tabChain.layout === 'split') wm.unbindSplit(h._tabChain); const ch = h._tabChain; if (ch) wm.switchTab(ch, ch.tabs.indexOf(h.id)); return true;`); await sleep(400);
      // the marks the Stage's leave writes (stage-manager _hideStage), left on the guest's own element while its host shows
      await ev(`const l = wm.windows.get(${S(liveId)}); l.element.style.visibility = 'hidden'; l.element.style.pointerEvents = 'none'; l._hiddenByStage = true; return true;`);
      const pre = await ev(`const h = wm.windows.get(${S(heroId)}), l = wm.windows.get(${S(liveId)}); return { inChain: !!(l._tabChain && l._tabChain === h._tabChain), heroShown: getComputedStyle(h.element).visibility === 'visible', guestHidden: l.element.style.visibility === 'hidden' && l._hiddenByStage };`);
      ok(pre.inChain && pre.heroShown && pre.guestHidden, '0c the precondition: a tab of the shown group whose own element carries the Stage\'s hide', S(pre));
      await placeTab();
      await clickAt({ x: 1245, y: 106 });
      await mouse('mouseMoved', 1246, 104);
      await mouse('mousePressed', 1246, 104, { button: 'left', clickCount: 1 });
      for (const [px, py] of [[1246, 112], [1245, 124], [1243, 140], [1238, 160]]) { await mouse('mouseMoved', px, py, { button: 'left', buttons: 1 }); await sleep(35); }
      for (let i = 1; i <= 20; i++) { await mouse('mouseMoved', 1238 + (795 - 1238) * i / 20, 160 + (455 - 160) * i / 20, { button: 'left', buttons: 1 }); await sleep(35); }
      await mouse('mouseReleased', 795, 455, { button: 'left', clickCount: 1 });
      await sleep(1200);
      const c = await afterDrop();
      ok(!c.inChain && visibleOk(c) && c.at795 === 'live', '0c torn out, it takes its frame\'s visibility: VISIBLE where it was let go (tab-group _matchFrameVisibility — the belt under any hider)', S(c));
    }
    await regroup('split'); // the legs below start from the born shape

    // ── 1 · THE INCIDENT: the reporter's gesture on the Stage ──
    console.log('— 1 · the reporter\'s gesture: the live view\'s tab clicked, then pulled down-LEFT out of the bar (Δ −451, +351), on the Stage');
    {
      const tab0 = await tabOf(liveId);
      if (!ok(!!tab0, 'the live view\'s tab is in the hero\'s strip', S(tab0))) return;
      await clickAt({ x: tab0.left + tab0.width / 2, y: tab0.top + tab0.height / 2 }); // his first press: the tab shown
      const tab = await tabOf(liveId);
      const { from, to } = gesture(tab);
      await snap('1-before');
      await drag(from, to, { steps: 24, shot: '1-mid-pull' });
      await snap('1-after-drop');
      const after = await apart();
      ok(!after.heroChain && !after.liveChain, 'the tab left the group — neither window is in a chain (b970f16d: the first 8 px were horizontal ⇒ a strip REORDER for the whole drag, never a detach)', S(after));
      ok(after.liveDisp !== 'none' && after.liveVis !== 'hidden', 'the live view is its own window, displayed', S(after));
      ok(Math.abs(after.liveTitle.top + after.liveTitle.height / 2 - to.y) < 40, `it sits where the pointer left it (title bar at y≈${Math.round(to.y)})`, S({ to, title: after.liveTitle }));
      ok(apartOk(after) && after.staged, 'it is still the hero\'s aux on the Stage and the hero is still the hero', S(after));
      await sleep(1500); // past the stage's 500 ms workspace record
      ok(apartOk(await apart()), 'it STAYS its own window past the workspace record', S(await apart()));
      await ev(`st._reconcileWorkspace(st._heroKey); return true;`);
      await sleep(1200);
      ok(apartOk(await apart()), 'a remote reconcile of the hero\'s record keeps it apart (and replays no second copy)', S(await apart()));
      await ev(`await st.leave(); return true;`); await sleep(900);
      await ev(`await st.enter(); return true;`); await sleep(1400);
      const trip = await apart();
      ok(apartOk(trip) && trip.staged, 'a leave → re-enter round trip keeps it apart and shows it again', S(trip));
    }

    // ── 2 · the same gesture on a NORMAL desktop: the cause is the tab drag, not the Stage ──
    console.log('— 2 · the same gesture on a normal desktop (Stage left): a tab pulled out of the bar tears off wherever it started');
    {
      await ev(`await st.leave(); return true;`); await sleep(900);
      const opened = await ev(`const a = app.openFileExplorer ? app.openFileExplorer(${S(ROOT)}) : null; const b = app.openFileExplorer ? app.openFileExplorer(${S(ROOT)}) : null; return [a && a.id, b && b.id];`);
      await sleep(900);
      const [fa, fb] = opened;
      if (ok(!!fa && !!fb && fa !== fb, 'two file explorers on the normal desktop', S(opened))) {
        await ev(`const a = wm.windows.get(${S(fa)}), b = wm.windows.get(${S(fb)}); a.element.style.left = '560px'; a.element.style.top = '20px'; a.element.style.width = '900px'; a.element.style.height = '520px'; wm._captureGridBounds(a); wm.createTabChain(a, b); return true;`);
        await sleep(500);
        const tab = await tabOf(fb);
        const { from, to } = gesture(tab);
        await drag(from, to, { steps: 24 });
        const d = await ev(`const a = wm.windows.get(${S(fa)}), b = wm.windows.get(${S(fb)}); return { aChain: !!a._tabChain, bChain: !!b._tabChain, bDisp: disp(b.element), desk: b._desktopId, active: dm.activeDesktopId };`);
        ok(!d.aChain && !d.bChain && d.bDisp !== 'none' && d.desk === d.active, 'the explorer tab tore off as its own window on the desktop (b970f16d: the same reorder lock)', S(d));
        await ev(`for (const id of [${S(fa)}, ${S(fb)}]) { if (wm.windows.get(id)) wm.closeWindow(id); } return true;`);
        await sleep(300);
      }
      await ev(`await st.enter(); return true;`); await sleep(1400);
    }

    // ── 3 · the reorder the strip promises stays a reorder: a horizontal drag with a wobble near the bar never tears off ──
    console.log('— 3 · a sideways reorder that wobbles near the bar stays a reorder (the split-tabs v2 promise)');
    {
      const g = await regroup('tabs');
      ok(g.same && g.layout === 'tabs', 'the pair is a tabs group on the Stage', S(g));
      const bar = await barOf(heroId);
      const hTab = await tabOf(heroId), lTab = await tabOf(liveId);
      const from = { x: hTab.left + hTab.width / 2, y: hTab.top + hTab.height / 2 };
      await mouse('mouseMoved', from.x, from.y); await mouse('mousePressed', from.x, from.y, { button: 'left', clickCount: 1 });
      for (let i = 1; i <= 4; i++) { await mouse('mouseMoved', from.x + 5 * i, from.y, { button: 'left', buttons: 1 }); await sleep(30); }
      const wobbleY = bar.bottom + 18; // below the bar, inside the tear-off margin
      for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', from.x + 20 + ((lTab.right + 12 - from.x - 20) * i) / 6, wobbleY, { button: 'left', buttons: 1 }); await sleep(35); }
      await mouse('mouseReleased', lTab.right + 12, wobbleY, { button: 'left', clickCount: 1 }); await sleep(700);
      const r = await ev(`const h = wm.windows.get(${S(heroId)}), l = wm.windows.get(${S(liveId)}); const ch = h._tabChain; return { same: !!(ch && l._tabChain === ch), order: ch && [...(ch.order || ch.tabs)] };`);
      ok(r.same && r.order && r.order[r.order.length - 1] === heroId, 'the hero tab was REORDERED to the end of the strip and nothing tore off', S({ r, before: g.order, wobbleY, bar }));
    }

    // ── 4 · the incident's other shapes on the Stage ──
    console.log('— 4 · the other shapes on the Stage: a plain TABS group, the HERO\'s own tab, a stage GRID, a pull UP toward the desktop previews');
    {
      let g = await regroup('tabs');
      ok(g.same && g.layout === 'tabs', '4a the pair is a tabs group', S(g));
      let tab = await tabOf(liveId); let gg = gesture(tab);
      await drag(gg.from, gg.to, { steps: 24 }); await sleep(900);
      ok(apartOk(await apart()), '4a the reporter\'s gesture tears the live view out of a TABS group too', S(await apart()));
      g = await regroup('split');
      tab = await tabOf(heroId); gg = gesture(tab);
      await drag(gg.from, gg.to, { steps: 24 }); await sleep(900);
      ok(apartOk(await apart()), '4b the HERO\'s own tab pulled out of the split: both their own windows, the hero still the hero', S(await apart()));
      await ev('wm.setGrid(2, 2); return true;'); await sleep(400);
      g = await regroup('split');
      tab = await tabOf(liveId); gg = gesture(tab);
      await drag(gg.from, gg.to, { steps: 24 }); await sleep(900);
      ok(apartOk(await apart()), '4c on a 2×2 Stage grid: torn off, snapped to a cell, apart', S(await apart()));
      await ev('wm.setGrid(null); return true;'); await sleep(300);
      g = await regroup('split');
      tab = await tabOf(liveId);
      const prev = await ev(`const p = [...document.querySelectorAll('.desktop-preview')].find((x) => !x.classList.contains('stage-preview')); return p ? rect(p) : null;`);
      if (ok(!!prev, '4d a normal desktop preview is on screen', S(prev))) {
        const from = { x: tab.left + tab.width / 2, y: tab.top + tab.height / 2 };
        await drag(from, { x: prev.left + prev.width / 2, y: prev.top + prev.height / 2 }, { steps: 24 });
        await sleep(900);
        const a = await apart();
        ok(!a.liveChain && a.liveDisp !== 'none' && a.bound != null && a.desk === '__stage__', '4d pulled UP onto a desktop preview: torn off, still on the Stage', S(a));
      }
    }

    // ── 5 · THE REFUSED DESKTOP DRAG SPEAKS (secondary): the owner's 2.112.4 rule stays, its silence goes ──
    console.log('— 5 · a Stage window dragged by its title bar onto a desktop preview: the preview says no, the drop puts it back and says why');
    {
      const toastWith = (text) => ev(`const t = [...document.querySelectorAll('.global-toast')].find((x) => (x.querySelector('.global-toast-body')?.textContent || '').includes(${S(text)})); return t ? t.querySelector('.global-toast-body').textContent : null;`);
      const clearToasts = () => ev(`document.getElementById('global-toasts')?.remove(); document.querySelectorAll('.taskbar-context-menu').forEach((m) => m.remove()); return true;`);
      const workPrev = () => ev(`const d = dm.desktops.find((x) => x.name === 'Work'); const p = d && document.querySelector('.desktop-preview[data-desktop-id="' + d.id + '"]'); return p ? rect(p) : null;`);
      const probe = `const p = document.querySelector('.desktop-preview.stage-refuse'); const l = document.querySelector('.stage-refuse-label'); const lr = l ? l.getBoundingClientRect() : null; return { refused: p ? (p.dataset.desktopId || (p.classList.contains('stage-preview') ? 'stage' : '?')) : null, label: l ? l.textContent : null, labelShown: !!(lr && lr.width > 0 && lr.left >= 0 && lr.top >= 0 && lr.right <= innerWidth && lr.bottom <= innerHeight), labelRect: lr && { left: lr.left, top: lr.top, right: lr.right, bottom: lr.bottom }, snapShown: !!(wm.snapIndicator.style.display && wm.snapIndicator.style.display !== 'none'), cellLit: !!document.querySelector('.grid-cell.highlight, .grid-cell.active') };`;
      await clearToasts();
      await ev(`const l = wm.windows.get(${S(liveId)}); if (l._tabChain) wm._detachFromChain(l._tabChain, l.id); l.element.style.left = '420px'; l.element.style.top = '300px'; l.element.style.width = '520px'; l.element.style.height = '360px'; wm._captureGridBounds(l); wm.focusWindow(l.id); return true;`);
      await sleep(500);
      const before = await ev(`const l = wm.windows.get(${S(liveId)}); return { r: rect(l.element), title: rect(l.titleSpan) };`);
      const wp = await workPrev();
      if (ok(!!wp, '5 the "Work" desktop preview is on screen', S(wp))) {
        const seen = await drag({ x: before.title.left + before.title.width / 2, y: before.title.top + before.title.height / 2 }, { x: wp.left + wp.width / 2, y: wp.top + wp.height / 2 }, { steps: 20, probe, shot: '5a-live-over-preview' });
        const workId = await ev(`return dm.desktops.find((x) => x.name === 'Work').id;`);
        ok(seen && seen.refused === workId && seen.label === 'Windows on the Stage stay on the Stage' && seen.labelShown, '5a over the preview: it is marked refused and the words ride beside the pointer, inside the viewport ("Windows on the Stage stay on the Stage") — b970f16d: no mark, no words', S(seen));
        ok(seen && !seen.snapShown && !seen.cellLit, '5a …and no snap zone is promised under a refusal (the drop will not snap)', S(seen));
        const after = await ev(`const l = wm.windows.get(${S(liveId)}); return { r: rect(l.element), desk: l._desktopId, bound: st._boundAux.get(${S(liveId)}) || null, vis: l.element.style.visibility, marks: document.querySelectorAll('.stage-refuse').length, labels: document.querySelectorAll('.stage-refuse-label').length };`);
        ok(after.desk === '__stage__' && after.bound != null && after.vis !== 'hidden' && Math.abs(after.r.left - before.r.left) <= 2 && Math.abs(after.r.top - before.r.top) <= 2, '5a the drop puts the live view back where the drag began, still on the Stage (±2 px)', S({ before: before.r, after }));
        ok(after.marks === 0 && after.labels === 0, '5a the mark and the words are gone after the drop', S(after));
        const said = await toastWith('Windows on the Stage stay on the Stage');
        ok(said && /Open it again on the desktop where you want it\./.test(said), '5a …and a toast says why and what to do instead', S(said));
        await clearToasts();
        // the HERO (a session window) by its title bar
        const hb = await ev(`const h = wm.windows.get(${S(heroId)}); if (h._tabChain) wm._detachFromChain(h._tabChain, h.id); wm.focusWindow(h.id); const t = h.titleSpan.getBoundingClientRect(); const hit = document.elementFromPoint(t.left + Math.min(t.width / 2, 60), t.top + t.height / 2); return { r: rect(h.element), title: rect(h.titleSpan), hitsHero: !!(hit && h.element.contains(hit)) };`);
        ok(hb.hitsHero, '5b the hero\'s title bar is on top where it will be pressed', S(hb));
        const seenH = await drag({ x: hb.title.left + Math.min(hb.title.width / 2, 60), y: hb.title.top + hb.title.height / 2 }, { x: wp.left + wp.width / 2, y: wp.top + wp.height / 2 }, { steps: 20, probe, shot: '5b-hero-over-preview' });
        ok(seenH && seenH.label === 'The conversation stays on the Stage', '5b the hero over the preview: "The conversation stays on the Stage"', S(seenH));
        const hAfter = await ev(`const h = wm.windows.get(${S(heroId)}); return { r: rect(h.element), hero: st._heroWinId, onStage: !!h._onStage || h._desktopId === '__stage__' };`);
        ok(hAfter.hero === heroId && hAfter.onStage && Math.abs(hAfter.r.left - hb.r.left) <= 2 && Math.abs(hAfter.r.top - hb.r.top) <= 2, '5b the hero is back on its slot, still the hero', S({ before: hb.r, hAfter }));
        ok(/open the session again on that desktop/.test((await toastWith('The conversation stays on the Stage')) || ''), '5b …and the toast names the way: open the session again on that desktop');
        await clearToasts();
      }
      // the window menu: "Move to Desktop ▸" holds the reason row, never the desktop names
      const title = await ev(`const l = wm.windows.get(${S(liveId)}); return rect(l.titleSpan);`);
      await mouse('mouseMoved', title.left + 20, title.top + title.height / 2);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: title.left + 20, y: title.top + title.height / 2, button: 'right', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: title.left + 20, y: title.top + title.height / 2, button: 'right', clickCount: 1 });
      await sleep(300);
      const menu = await ev(`const m = document.querySelector('.taskbar-context-menu'); if (!m) return null; const row = [...m.querySelectorAll(':scope > .taskbar-context-menu-item')].find((el) => /Move to Desktop/.test(el.textContent)); if (!row) return { rows: [...m.querySelectorAll(':scope > .taskbar-context-menu-item')].map((x) => x.textContent) }; const sub = [...row.querySelectorAll('.taskbar-context-menu-item')].map((x) => ({ text: x.textContent, disabled: x.classList.contains('disabled') })); return { sub };`);
      ok(menu && menu.sub && menu.sub.length === 1 && /^Windows on the Stage stay on the Stage — /.test(menu.sub[0].text) && !menu.sub[0].disabled && !menu.sub.some((r) => /Work|Desktop 1/.test(r.text)), '5c the window menu\'s "Move to Desktop ▸" holds ONE row that says why (no desktop names that do nothing, never greyed)', S(menu));
      await clearToasts();
      // the other direction, on a normal desktop: a file explorer onto the STAGE preview
      await ev(`await st.leave(); return true;`); await sleep(900);
      const fx = await ev(`const w = app.openFileExplorer(${S(ROOT)}); w.element.style.left = '500px'; w.element.style.top = '260px'; w.element.style.width = '520px'; w.element.style.height = '360px'; wm._captureGridBounds(w); return w.id;`);
      await sleep(700);
      const fb = await ev(`const w = wm.windows.get(${S(fx)}); return { r: rect(w.element), title: rect(w.titleSpan), desk: w._desktopId };`);
      const sp = await ev(`const p = document.querySelector('.desktop-preview.stage-preview'); return p ? rect(p) : null;`);
      if (ok(!!sp, '5d the Stage preview is on screen while on a normal desktop', S(sp))) {
        const seenS = await drag({ x: fb.title.left + fb.title.width / 2, y: fb.title.top + fb.title.height / 2 }, { x: sp.left + sp.width / 2, y: sp.top + sp.height / 2 }, { steps: 20, probe, shot: '5d-onto-stage' });
        ok(seenS && seenS.refused === 'stage' && seenS.label === 'Windows can’t be moved onto the Stage', '5d a desktop window over the Stage preview: marked, "Windows can’t be moved onto the Stage"', S(seenS));
        const fa = await ev(`const w = wm.windows.get(${S(fx)}); return { r: rect(w.element), desk: w._desktopId };`);
        ok(fa.desk === fb.desk && Math.abs(fa.r.left - fb.r.left) <= 2 && Math.abs(fa.r.top - fb.r.top) <= 2, '5d the drop puts it back on its desktop, where it began', S({ fb, fa }));
        ok(/click a session/.test((await toastWith('Windows can’t be moved onto the Stage')) || ''), '5d …and the toast says what to do instead');
      }
      await ev(`if (wm.windows.get(${S(fx)})) wm.closeWindow(${S(fx)}); return true;`);
      await clearToasts();
    }
  } finally {
    try { P1?.close(); } catch { }
    ws.send(JSON.stringify({ type: 'kill', sessionId: sidM }));
    await until(() => msgs.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === sidM), 6000);
    try { ws.close(); } catch { }
  }
})();

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} pass, ${fail} fail${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
