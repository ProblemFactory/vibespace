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
//   6  A CONVERSATION BROUGHT ONTO THE STAGE IS DRAWN (userW inc-munl8jkl-gaih + inc-munbksgs-k3yz, 2026-09-30, "dynamic
//      desktop crashed" / "卡死"): read-only chats on two more desktops (Fin, Scra — the incident's names), then C0 the
//      control (a plain desktop switch draws everything), A on Fin a real click on the Stage preview + go to a window
//      that lives on Scra, B a real click on Fin's preview (leave) and on the Stage preview again (re-enter), C resume a
//      stopped conversation whose window lives on Scra while on the Stage, C2 a NEW session on the Stage — each: the
//      hero's computed content-visibility is `visible`, no aria-hidden, its in-view messages are all RENDERED, a real
//      click on its title row lands IN the title bar (2.369.196/.198: on the bare div.window), and its screenshot is
//      not a blank box (distinct colours over a floor). STAGEDRAG_TREE=<a built 2.369.198 tree> shows A and B RED.
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
  // (§ 6 C: a `--resume <id>` names THAT conversation, as the real CLI does)
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\nSID="e2e00000-0000-4000-8000-$(printf '%012d' $$)"\nprev=""; for a in "$@"; do [ "$prev" = "--resume" ] && SID="$a"; prev="$a"; done\ncase " $* " in *" --output-format "*) sleep 1; printf '${hookLine}\\n${initLine}\\n' "$SID" "$SID";; esac\nexec sleep 600\n`, { mode: 0o755 });
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

    // ── 6 · A CONVERSATION BROUGHT ONTO THE STAGE IS DRAWN (userW inc-munl8jkl-gaih + inc-munbksgs-k3yz). The forensics'
    //    reproduction (repro-stage.mjs, 2.369.196 and .198 identical): the Stage's borrow cleared the desktop FLAG and
    //    ran its own show (visibility + pointer-events only) while the desktop's content-visibility:hidden stayed on the
    //    element — the renderer skipped the whole window, title bar included: a blank box, every click on the bare
    //    div.window, no long task. What is asserted is what he saw. ──
    console.log('— 6 · a conversation brought onto the Stage from another desktop is DRAWN (inc-munl8jkl-gaih)');
    {
      const CWD6 = path.join(ROOT, 'workb'); fs.mkdirSync(CWD6, { recursive: true });
      const pdir = path.join(fakeHome, '.claude', 'projects', CWD6.replace(/[/._]/g, '-')); fs.mkdirSync(pdir, { recursive: true });
      const SIDS = { fin1: 'e2e00000-0000-4000-8000-0000000f6001', scra1: 'e2e00000-0000-4000-8000-0000000c6001', maj: 'e2e00000-0000-4000-8000-0000000c6002', res: 'e2e00000-0000-4000-8000-0000000c6003' };
      let k = 0;
      for (const sid of Object.values(SIDS)) {
        const lines = []; let t = Date.parse('2026-09-29T20:00:00Z'); let u = 0; k++;
        const uu = () => `e2e00000-0000-4000-8000-${(k * 10000 + (++u)).toString(16).padStart(12, '0')}`;
        const base = () => ({ parentUuid: null, isSidechain: false, userType: 'external', cwd: CWD6, sessionId: sid, version: '2.1.274', gitBranch: 'master' });
        for (let turn = 0; turn < 24; turn++) {
          const ts = () => new Date(t += 1500).toISOString();
          lines.push({ ...base(), type: 'user', message: { role: 'user', content: `Turn ${turn}: please check the vendor agreement section ${turn} and summarise what changed since the last draft.` }, uuid: uu(), timestamp: ts() });
          const tid = `toolu_${sid.slice(-6)}_${turn}`;
          lines.push({ ...base(), type: 'assistant', message: { model: 'claude-fable-5-1', id: `msg_${sid.slice(-6)}_${turn}a`, type: 'message', role: 'assistant', content: [{ type: 'text', text: `Looking at section ${turn}.` }, { type: 'tool_use', id: tid, name: 'Bash', input: { command: `grep -n "clause ${turn}" contract.md` } }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 20 } }, requestId: `req_${turn}`, uuid: uu(), timestamp: ts() });
          lines.push({ ...base(), type: 'user', message: { role: 'user', content: [{ tool_use_id: tid, type: 'tool_result', content: Array.from({ length: 6 }, (_, j) => `${j + 1}: clause ${turn}.${j} — payment terms net 30, liability cap, renewal`).join('\n') }] }, uuid: uu(), timestamp: ts() });
          lines.push({ ...base(), type: 'assistant', message: { model: 'claude-fable-5-1', id: `msg_${sid.slice(-6)}_${turn}b`, type: 'message', role: 'assistant', content: [{ type: 'text', text: `**Section ${turn}** changed:\n\n- payment terms moved from net 45 to **net 30**\n- the liability cap is now 12 months of fees\n- renewal is automatic unless either side gives 60 days notice\n\nNothing else differs from the previous draft.` }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 80 } }, requestId: `req_${turn}b`, uuid: uu(), timestamp: ts() });
        }
        fs.writeFileSync(path.join(pdir, sid + '.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      }
      if (await ev('return st.isActive;')) { await ev('await st.leave(); return true;'); await sleep(900); }
      // the slot wholly inside the workspace (the legs above resized the hero, which edits the slot) — a screenshot of the
      // hero then holds only the hero's own pixels, never the taskbar's text below it
      await ev('st.saveSlot({ left: 0.3, top: 0.04, width: 0.62, height: 0.8 }); return true;');
      const desks = await ev(`const f = dm.createDesktop(); dm.renameDesktop(f, 'Fin'); const s = dm.createDesktop(); dm.renameDesktop(s, 'Scra'); return { fin: f, scra: s };`);
      await sleep(400);
      const open = async (key, name) => {
        const before = await ev('return [...wm.windows.keys()];');
        await ev(`app.viewSession(${S(SIDS[key])}, ${S(CWD6)}, ${S(name)}); return true;`);
        let id = null;
        await until(async () => { id = await ev(`return [...wm.windows.keys()].find((k) => !${S(before)}.includes(k)) || null;`); return !!id; }, 8000, 150);
        await until(() => ev(`const v = app.sessions.get(${S(id)}); return !!(v && v._messageList && v._messageList.querySelectorAll('.chat-msg').length >= 8);`), 15000, 200);
        return id;
      };
      await ev(`await dm.switchTo(${S(desks.scra)}); return true;`); await sleep(1100);
      const W = { scra1: await open('scra1', 'Scra-1'), maj: await open('maj', 'Majordomo'), res: await open('res', 'Resumable') };
      await ev(`await dm.switchTo(${S(desks.fin)}); return true;`); await sleep(1100);
      W.fin1 = await open('fin1', 'Fin-1');
      await sleep(1200);
      ok(Object.values(W).every(Boolean), '6 four read-only chats open: three on Scra (Majordomo among them), one on Fin', S(W));
      await ev(`window.__pd6 = []; if (!window.__pd6On) { window.__pd6On = true; document.addEventListener('pointerdown', (e) => { const t = e.target; window.__pd6.push({ inTitlebar: !!(t.closest && t.closest('.window-titlebar')), bareWindow: !!(t.classList && t.classList.contains('window')), win: t.closest && t.closest('.window') ? (t.closest('.window').dataset.winId || t.closest('.window').id || '?') : null, tag: t.tagName + '.' + String(t.className || '').split(' ').slice(0, 2).join('.') }); }, { capture: true }); } return true;`);
      /** what is on screen for a window: computed marks, what a click would hit, how many in-view messages the browser draws */
      const probe6 = (winId) => ev(`const w = wm.windows.get(${S(winId)}); if (!w) return { missing: true };
        const el = w.element, b = el.getBoundingClientRect(), tbEl = el.querySelector(':scope > .window-titlebar'), tb = tbEl && tbEl.getBoundingClientRect();
        const hit = (x, y) => { const h = document.elementFromPoint(x, y); return h ? { inTitlebar: !!h.closest('.window-titlebar'), inWin: el.contains(h), bareWindow: h === el } : null; };
        const v = app.sessions.get(w.id), list = v && v._messageList, lr = list && list.getBoundingClientRect();
        let inView = 0, rendered = 0;
        if (list) for (const c of list.children) { if (!c.classList.contains('chat-msg')) continue; const r = c.getBoundingClientRect(); if (!r.height || r.bottom <= lr.top || r.top >= lr.bottom) continue; inView++; if (c.checkVisibility({ contentVisibilityAuto: true })) rendered++; }
        const cs = getComputedStyle(el);
        return { hero: st._heroWinId === w.id, staged: st.isActive, onStage: !!w._onStage, desk: w._desktopId, cv: cs.contentVisibility, cvStyle: el.style.contentVisibility || '', aria: el.getAttribute('aria-hidden'), visibility: cs.visibility, pe: cs.pointerEvents, hiddenByDesktop: !!w._hiddenByDesktop, hiddenByStage: !!w._hiddenByStage,
          suspended: v ? !!v._suspended : null, reasons: v && v._hiddenReasons ? [...v._hiddenReasons] : null, readOnly: v ? !!v._readOnly : null,
          rect: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }, title: tb ? { x: tb.left + Math.min(40, tb.width / 3), y: tb.top + tb.height / 2 } : null,
          titleHit: tb ? hit(tb.left + Math.min(40, tb.width / 3), tb.top + tb.height / 2) : null, middleHit: hit(b.left + b.width / 2, b.top + b.height / 2),
          titleRendered: tbEl ? tbEl.checkVisibility() : null, inView, rendered };`);
      /** distinct colours of the window's own pixels (a real compositor screenshot, decoded in the page) — a blank box is its border + background */
      const colours = async (r, name) => {
        // the window's rect ∩ the workspace (never a neighbour's pixels: the taskbar's text under a hero that overhangs it)
        const wsr = await ev(`const w = document.getElementById('workspace'); return w ? rect(w) : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };`);
        const x0 = Math.max(r.x, wsr.left, 0), y0 = Math.max(r.y, wsr.top, 0), x1 = Math.min(r.x + r.w, wsr.right), y1 = Math.min(r.y + r.h, wsr.bottom);
        if (x1 - x0 < 20 || y1 - y0 < 20) return -1;
        const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0, scale: 0.5 } });
        const data = shot.result?.data; if (!data) return -1;
        if (SHOTS) { try { fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(data, 'base64')); } catch { } }
        return ev(`const img = new Image(); img.src = 'data:image/png;base64,' + ${S(data)}; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4) s.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); return s.size;`);
      };
      const COLOUR_FLOOR = 300; // the forensics: a drawn chat 2230, the blank hero 64 (its border + background)
      const drawnOk = (p, c) => p && !p.missing && p.cv === 'visible' && p.aria === null && p.visibility === 'visible' && p.pe !== 'none' && p.titleRendered === true && p.titleHit && p.titleHit.inTitlebar && p.middleHit && p.middleHit.inWin && !p.middleHit.bareWindow && p.inView > 0 && p.rendered === p.inView && c >= COLOUR_FLOOR;
      const realClickTitle = async (p) => { await clickAt({ x: p.title.x, y: p.title.y }); return ev('return window.__pd6[window.__pd6.length - 1] || null;'); };
      const stagePreview = () => ev(`const p = document.querySelector('.stage-preview-wrapper'); return p ? rect(p) : null;`);
      const deskPreview = (id) => ev(`const p = document.querySelector('.desktop-preview[data-desktop-id="' + ${S(id)} + '"]'); return p ? rect(p) : null;`);
      const clickRect = async (r) => { await clickAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); };

      // C0 — the control: a plain desktop switch shows a drawn window
      {
        const p = await probe6(W.fin1); const c = await colours(p.rect, '6-C0-control');
        console.log('    C0 ' + S({ ...p, colours: c }));
        ok(drawnOk(p, c), `6 C0 control — a plain desktop switch to Fin: its window is drawn (content-visibility visible, the title bar hit, ${p.rendered}/${p.inView} in-view messages rendered, ${c} colours)`, S({ ...p, colours: c }));
      }
      // A — on Fin, a real click on the Stage preview, then go to Majordomo (a Scra window) — the reporter at 04:10:21
      {
        const sp = await stagePreview();
        if (ok(!!sp, '6 A the Stage preview is on screen', S(sp))) await clickRect(sp);
        await sleep(1200);
        ok(await ev('return st.isActive && dm.activeDesktopId === "__stage__";'), '6 A the click entered the Stage');
        await ev(`app.goToWinId(${S(W.maj)}); return true;`);
        await sleep(1800);
        const p = await probe6(W.maj); const c = await colours(p.rect, '6-A-hero-after-goto');
        console.log('    A ' + S({ ...p, colours: c }));
        ok(p.hero && p.onStage, '6 A Majordomo is the Stage\'s hero', S(p));
        ok(drawnOk(p, c), `6 A THE HERO IS DRAWN — content-visibility ${p.cv}, aria-hidden ${p.aria}, the title bar rendered and hit, ${p.rendered}/${p.inView} in-view messages rendered, ${c} colours (2.369.196/.198: hidden, true, the bare div.window, 0/9, 64)`, S({ ...p, colours: c }));
        ok(p.suspended === false && p.reasons && p.reasons.length === 0, '6 A …its ChatView runs (no hider reason, not suspended — paging and pinning live)', S(p));
        const pd = await realClickTitle(p);
        ok(pd && pd.inTitlebar && !pd.bareWindow, '6 A a REAL click on its title row lands IN the title bar (the incident: the bare div.window)', S(pd));
      }
      // B — leave by a real click on Fin's preview, then a real click on the Stage preview — the reporter at 23:40
      {
        const fp = await deskPreview(desks.fin);
        if (ok(!!fp, '6 B Fin\'s preview is on screen', S(fp))) await clickRect(fp);
        await sleep(1200);
        const left = await ev(`return { staged: st.isActive, active: dm.activeDesktopId };`);
        ok(!left.staged && left.active === desks.fin, '6 B the click left the Stage for Fin', S(left));
        const hb = await probe6(W.maj);
        ok(hb.hiddenByDesktop && hb.cv === 'hidden' && hb.aria === 'true' && hb.suspended === true, '6 B …where Majordomo is its desktop\'s again: hidden, unrendered, out of the AX tree, suspended (the desktop\'s hiding, derived)', S(hb));
        const sp = await stagePreview(); if (sp) await clickRect(sp);
        await sleep(1800);
        const p = await probe6(W.maj); const c = await colours(p.rect, '6-B-hero-after-reenter');
        console.log('    B ' + S({ ...p, colours: c }));
        ok(p.hero && p.staged, '6 B the Stage entered again: Majordomo is the hero again', S(p));
        ok(drawnOk(p, c), `6 B THE RE-BORROWED HERO IS DRAWN — content-visibility ${p.cv}, ${p.rendered}/${p.inView} rendered, ${c} colours (2.369.196/.198: blank)`, S({ ...p, colours: c }));
        await clickAt({ x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.h / 2 });
        const pd = await ev('return window.__pd6[window.__pd6.length - 1] || null;');
        ok(pd && !pd.bareWindow && pd.win != null, '6 B a real click in its middle lands in its content (the incident: the bare div.window)', S(pd));
      }
      // C — while on the Stage, resume the stopped conversation whose window lives on Scra (the resume bar's path:
      //     the read-only window closes, the resumed one is placed back on its home desktop — session-lifecycle's
      //     resume placement — unless the Stage holds it)
      let resHome = null;
      {
        const before = await ev('return [...wm.windows.keys()];');
        resHome = await ev(`const w = wm.windows.get(${S(W.res)}); return w && w.gridBounds ? { ...w.gridBounds } : null;`);
        await ev(`app.resumeSession(${S(SIDS.res)}, ${S(CWD6)}, 'Resumable', { mode: 'chat', backend: 'claude', backendSessionId: ${S(SIDS.res)} }); return true;`);
        let rid = null;
        await until(async () => { rid = await ev(`return [...wm.windows.values()].find((w) => !${S(before)}.includes(w.id) && w.type === 'chat' && w._openSpec && w._openSpec.backendSessionId === ${S(SIDS.res)})?.id || null;`); return !!rid; }, 10000, 200);
        const live = rid && await until(() => ev(`const v = app.sessions.get(${S(rid)}); return !!(v && v.sessionId && !v._readOnly && v._messageList && v._messageList.querySelectorAll('.chat-msg').length >= 8);`), 20000, 250);
        await sleep(1500);
        const p = rid ? await probe6(rid) : { missing: true }; const c = p.missing ? -1 : await colours(p.rect, '6-C-resumed-on-stage');
        const place = await ev(`const w = wm.windows.get(${S(rid)}); const slot = st.slotBounds(); const gb = w && w.gridBounds; return { oldGone: !wm.windows.has(${S(W.res)}), desk: w && w._desktopId, onStage: !!(w && w._onStage), hero: st._heroWinId === ${S(rid)}, atSlot: !!(gb && ['left', 'top', 'width', 'height'].every((k) => Math.abs((gb[k] ?? 0) - (slot[k] ?? 0)) < 0.01)), gb, slot, ops: (window.__vsOps ? window.__vsOps().filter((o) => o.op === 'resume-place').slice(-1) : null) };`);
        console.log('    C ' + S({ ...p, colours: c, place }));
        ok(!!rid && live, '6 C the resume created a LIVE window for the conversation (the read-only one replaced)', S({ rid, live, place }));
        ok(place.hero && place.onStage && place.desk === desks.scra, '6 C …it is the Stage\'s hero, BORROWED from its home desktop Scra (the Stage is a view, not an owner — 2.369.198: stage-born, its home lost)', S(place));
        ok(place.atSlot, '6 C …IN THE SLOT like every hero (2.369.198: the resume re-applied its old desktop box over the slot — now that box is its HOME, kept for the hand-back)', S(place));
        ok(drawnOk(p, c), `6 C THE RESUMED HERO IS DRAWN — content-visibility ${p.cv}, ${p.rendered}/${p.inView} rendered, ${c} colours`, S({ ...p, colours: c }));
        if (p.title) { const pd = await realClickTitle(p); ok(pd && pd.inTitlebar, '6 C a real click on its title row lands in the title bar', S(pd)); }
        W.resLive = rid;
      }
      // C2 — a NEW session started on the Stage (the reporter: "开新的 session")
      {
        const before = await ev('return [...wm.windows.keys()];');
        await ev(`app.createSession({ cwd: ${S(CWD6)}, mode: 'chat', backend: 'claude', name: 'Fresh' }); return true;`);
        let nid = null;
        await until(async () => { nid = await ev(`return [...wm.windows.values()].find((w) => !${S(before)}.includes(w.id) && w.type === 'chat')?.id || null;`); return !!nid; }, 10000, 200);
        await until(() => ev(`const v = app.sessions.get(${S(nid)}); return !!(v && v.sessionId);`), 15000, 250);
        await sleep(1500);
        const p = nid ? await probe6(nid) : { missing: true };
        console.log('    C2 ' + S(p));
        ok(!!nid && p.hero && p.cv === 'visible' && p.aria === null && p.titleRendered && p.titleHit && p.titleHit.inTitlebar && p.suspended === false, '6 C2 a NEW session on the Stage is its hero, drawn, its title bar hit, its view running', S(p));
        W.fresh = nid;
      }
      // C3 — leave for Scra (a real click on its preview): the resumed conversation goes HOME — its old desktop, its old
      //      box, drawn — and the new session stays with the Stage
      {
        const scp = await deskPreview(desks.scra);
        if (ok(!!scp, '6 C3 Scra\'s preview is on screen', S(scp))) await clickRect(scp);
        await sleep(1500);
        const back = await ev(`const w = [...wm.windows.values()].find((x) => x.type === 'chat' && x._openSpec && x._openSpec.backendSessionId === ${S(SIDS.res)}); const f = wm.windows.get(${S(W.fresh)}); return { id: w && w.id, desk: w && w._desktopId, gb: w && w.gridBounds, staged: st.isActive, active: dm.activeDesktopId, freshDesk: f && f._desktopId, freshHidden: !!(f && (f._hiddenByStage || f._hiddenByDesktop)) };`);
        const p = back.id ? await probe6(back.id) : { missing: true }; const c = p.missing ? -1 : await colours(p.rect, '6-C3-resumed-home');
        console.log('    C3 ' + S({ back, ...p, colours: c }));
        const near = (a, b) => !!(a && b) && ['left', 'top', 'width', 'height'].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.01);
        ok(!back.staged && back.active === desks.scra && back.desk === desks.scra, '6 C3 the resumed conversation is on Scra again (handed back to its home, like every borrowed hero)', S(back));
        ok(near(back.gb, resHome), '6 C3 …at its old box (the geometry the resume carried is its HOME)', S({ gb: back.gb, resHome }));
        ok(drawnOk(p, c), `6 C3 …and drawn there (${p.rendered}/${p.inView} rendered, ${c} colours)`, S({ ...p, colours: c }));
        ok(back.freshDesk === '__stage__' && back.freshHidden, '6 C3 the session born on the Stage stays the Stage\'s (parked while the Stage is off screen)', S(back));
        W.resLive = back.id || W.resLive;
      }
      // C4 — THE HERO'S OWN RESUME (verify r1 V4): Scra-1 (read-only) is the hero; its bar's Resume replaces it. The home it
      //      carries is its OLD box, never the slot its element sat at; leaving to Scra lands it there (c4f17e39: the slot
      //      became its home, the hand-back left it at slot size on Scra, and the other client's record of Scra took it)
      {
        const near6 = (a, b) => !!(a && b) && ['left', 'top', 'width', 'height'].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.01);
        await clickRect(await stagePreview()); await sleep(1200);
        await ev(`app.goToWinId(${S(W.scra1)}); return true;`); await sleep(1500);
        const h = await ev(`const w = wm.windows.get(${S(W.scra1)}); return { hero: st._heroWinId === w.id, home: w._stageHomeBounds || null, gb: w.gridBounds, slot: st.slotBounds() };`);
        ok(h.hero && h.home && !near6(h.home, h.slot) && near6(h.gb, h.slot), '6 C4 Scra-1 is the hero at the slot, its home box remembered', S(h));
        const before = await ev('return [...wm.windows.keys()];');
        await ev(`app.resumeSession(${S(SIDS.scra1)}, ${S(CWD6)}, 'Scra-1', { mode: 'chat', backend: 'claude', backendSessionId: ${S(SIDS.scra1)} }); return true;`);
        let rid = null;
        await until(async () => { rid = await ev(`return [...wm.windows.values()].find((w) => !${S(before)}.includes(w.id) && w.type === 'chat' && w._openSpec && w._openSpec.backendSessionId === ${S(SIDS.scra1)})?.id || null;`); return !!rid; }, 10000, 200);
        const live = rid && await until(() => ev(`const v = app.sessions.get(${S(rid)}); return !!(v && v.sessionId && !v._readOnly);`), 20000, 250);
        await sleep(1200);
        const r = await ev(`const w = wm.windows.get(${S(rid)}); return w ? { hero: st._heroWinId === w.id, desk: w._desktopId, home: w._stageHomeBounds || null, gb: w.gridBounds } : null;`);
        console.log('    C4 ' + S({ live, r, old: h.home, slot: h.slot }));
        ok(live && r && r.hero && r.desk === desks.scra, '6 C4 the resumed conversation is the hero, home Scra', S(r));
        ok(r && near6(r.home, h.home), `6 C4 …the home it carries is the OLD box ${S(r && r.home)} (the slot ${S(h.slot)} is the Stage's, never the window's)`, S({ r, old: h.home, slot: h.slot }));
        await clickRect(await deskPreview(desks.scra)); await sleep(1500);
        const a = await ev(`const w = wm.windows.get(${S(rid)}); return w ? { desk: w._desktopId, gb: w.gridBounds, staged: st.isActive } : null;`);
        ok(a && !a.staged && a.desk === desks.scra && near6(a.gb, h.home), `6 C4 leaving to Scra lands it at its old box ${S(a && a.gb)}, not the slot`, S({ a, old: h.home, slot: h.slot }));
        W.scra1Live = rid;
      }
      // T1 — THE HERO TEARS ITS OWN TAB OFF ITS GROUP (verify r1 V2): on Scra Majordomo joins the resumed Scra-1 as a tab; on
      //      the Stage the group is the hero's frame; a REAL drag of the hero's tab out of the strip splits it — the promoted
      //      Majordomo is a session that is not the hero: hidden its way, and it does NOT follow the user to Fin (c4f17e39:
      //      drawn, unowned, and on Fin after the leave; 2.369.198: invisible)
      {
        await ev(`const h = wm.windows.get(${S(W.scra1Live)}), g = wm.windows.get(${S(W.maj)}); if (g._tabChain) wm._detachFromChain(g._tabChain, g.id); if (h._tabChain) wm._detachFromChain(h._tabChain, h.id); wm.createTabChain(h, g); wm.switchTab(h._tabChain, 0); return true;`); await sleep(600);
        await clickRect(await deskPreview(desks.fin)); await sleep(1200);
        await clickRect(await stagePreview()); await sleep(1200);
        await ev(`app.goToWinId(${S(W.scra1Live)}); return true;`); await sleep(1500);
        const tab = await ev(`const h = wm.windows.get(${S(W.scra1Live)}); const t = h.titleBar.querySelector('.tab-item[data-win-id="' + h.id + '"]'); return t ? rect(t) : null;`);
        const pre = await probe6(W.scra1Live);
        if (ok(!!tab && pre.hero && pre.cv === 'visible', '6 T1 the group is the hero\'s frame on the Stage, the hero\'s tab on the strip', S({ tab, pre }))) {
          await drag({ x: tab.left + tab.width / 2, y: tab.top + tab.height / 2 }, { x: tab.left + tab.width / 2 - 200, y: tab.top + tab.height / 2 + 350 });
          await sleep(600);
          const hh = await probe6(W.scra1Live), gg = await probe6(W.maj);
          const chains = await ev(`return { h: !!wm.windows.get(${S(W.scra1Live)})._tabChain, g: !!wm.windows.get(${S(W.maj)})._tabChain, stageVisible: st._isStageVisible(wm.windows.get(${S(W.maj)})) };`);
          console.log('    T1 ' + S({ chains, hero: hh.hero, heroCv: hh.cv, maj: { cv: gg.cv, aria: gg.aria, hbd: gg.hiddenByDesktop, hbs: gg.hiddenByStage, susp: gg.suspended } }));
          ok(!chains.h && !chains.g && hh.hero && hh.cv === 'visible', '6 T1 the drag split the group; the hero stays the hero, drawn', S({ chains, hh }));
          ok(gg.hiddenByDesktop && gg.cv === 'hidden' && gg.aria === 'true' && gg.suspended === true && !chains.stageVisible, '6 T1 the promoted Majordomo — a session that is not the hero — is hidden its way (its desktop\'s), not a free window on the Stage', S(gg));
          await clickRect(await deskPreview(desks.fin)); await sleep(1400);
          const onFin = await probe6(W.maj);
          ok(!onFin.staged && onFin.desk === desks.scra && onFin.cv === 'hidden' && onFin.hiddenByDesktop, '6 T1 leaving to Fin: Majordomo (home Scra) is NOT on Fin', S(onFin));
          await clickRect(await deskPreview(desks.scra)); await sleep(1400);
          const onScra = await probe6(W.maj); const c = await colours(onScra.rect, '6-T1-maj-home');
          // verify r2: the torn-off hero lands BESIDE the group's home (PURE tornOffBox — an off-Stage tear-off drops the torn
          // window beside its frame), so the survivor is reachable by its title (the standard cascade), its middle under the hero
          const reachableOk = (p, cc) => p && !p.missing && p.cv === 'visible' && p.aria === null && p.visibility === 'visible' && p.pe !== 'none' && p.titleRendered === true && p.titleHit && p.titleHit.inTitlebar && p.titleHit.inWin && !p.titleHit.bareWindow && p.inView > 0 && p.rendered === p.inView && cc >= COLOUR_FLOOR;
          ok(reachableOk(onScra, c), `6 T1 …and on Scra it is drawn where the group stood, its title reachable (the torn-off hero sits one cascade step beside it — never exactly on top, never at the slot; ${onScra.rendered}/${onScra.inView} rendered, ${c} colours)`, S({ ...onScra, colours: c }));
          const heroScra = await probe6(W.scra1Live);
          ok(heroScra && !heroScra.missing && heroScra.rect && onScra.rect && (Math.abs(heroScra.rect.x - onScra.rect.x) > 8 || Math.abs(heroScra.rect.y - onScra.rect.y) > 8), `6 T1 …and the torn-off hero is NOT exactly on top of it (hero at ${S(heroScra && heroScra.rect)}, survivor at ${S(onScra.rect)})`, S({ hero: heroScra && heroScra.rect, maj: onScra.rect }));
        }
      }
      // M1 — A MAXIMIZE ON THE STAGE IS A SLOT EDIT (verify r3): the hero maximized ON the Stage (the real toggleMaximize);
      //      leave to Scra; un-maximize there ⇒ at its HOME (f5635f9d: at the SLOT — the hand-back kept the slot px as prevBounds)
      {
        const near6 = (a, b) => !!(a && b) && ['left', 'top', 'width', 'height'].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.01);
        const SLOT6 = { left: 0.3, top: 0.04, width: 0.62, height: 0.8 };
        await ev(`st.saveSlot(${S(SLOT6)}); return true;`);
        await clickRect(await stagePreview()); await sleep(1200);
        await ev(`app.goToWinId(${S(W.maj)}); return true;`); await sleep(1500);
        const h = await ev(`const w = wm.windows.get(${S(W.maj)}); return { hero: st._heroWinId === w.id, home: w._stageHomeBounds || null, max: !!w.isMaximized };`);
        if (ok(h.hero && h.home && !h.max, '6 M1 Majordomo is the hero, un-maximized, its home remembered', S(h))) {
          await ev(`wm.toggleMaximize(${S(W.maj)}); return true;`); await sleep(400);
          const m = await ev(`const w = wm.windows.get(${S(W.maj)}); const r = w.element.getBoundingClientRect(); const ws = document.getElementById('workspace').getBoundingClientRect(); return { max: !!w.isMaximized, fills: Math.abs(r.width - ws.width) < 4 && Math.abs(r.height - ws.height) < 4 };`);
          ok(m.max && m.fills, '6 M1 maximized on the Stage: it fills the workspace', S(m));
          await clickRect(await deskPreview(desks.scra)); await sleep(1500);
          const a0 = await ev(`const w = wm.windows.get(${S(W.maj)}); return { max: !!w.isMaximized, gb: w.gridBounds, prev: w.prevBounds || null, staged: st.isActive };`);
          if (a0.max) { await ev(`wm.toggleMaximize(${S(W.maj)}); return true;`); await sleep(400); }
          const a = await ev(`const w = wm.windows.get(${S(W.maj)}); const ws = document.getElementById('workspace').getBoundingClientRect(); const r = w.element.getBoundingClientRect(); return { max: !!w.isMaximized, gb: w.gridBounds, fr: { left: (r.left - ws.left) / ws.width, top: (r.top - ws.top) / ws.height, width: r.width / ws.width, height: r.height / ws.height } };`);
          console.log('    M1 ' + S({ afterLeave: a0, now: a, home: h.home }));
          ok(!a.max && near6(a.gb, h.home) && near6(a.fr, h.home) && !near6(a.gb, SLOT6), `6 M1 on Scra, un-maximized, Majordomo is at its HOME ${S(h.home)} — never the slot (f5635f9d: ${S(a.gb)})`, S({ a, home: h.home }));
          await ev(`st.saveSlot(${S(SLOT6)}); return true;`);
        }
      }
      // C1 — THE CORNER (verify r3): group [Scra-1 host, Majordomo] snapped to the bottom-right quadrant; Majordomo's tab
      //      dragged out on the Stage (a real drag); leave to Scra ⇒ Majordomo NOT exactly on Scra-1, Scra-1's title reachable
      //      (f5635f9d: tornOffBox clamped both axes onto the home — Scra-1 hidden behind Majordomo, its title clicks landing in it)
      {
        await ev(`const h = wm.windows.get(${S(W.scra1Live)}), g = wm.windows.get(${S(W.maj)}); for (const w of [h, g]) { if (w._tabChain) wm._detachFromChain(w._tabChain, w.id); if (w.isMaximized) wm.toggleMaximize(w.id); } h.gridBounds = { left: 0.5, top: 0.5, width: 0.5, height: 0.5 }; wm._applyGridBounds(h); wm._captureGridBounds(h); wm.createTabChain(h, g); wm.switchTab(h._tabChain, 0); return true;`); await sleep(600);
        const corner = await ev(`return wm.windows.get(${S(W.scra1Live)}).gridBounds;`);
        await clickRect(await deskPreview(desks.fin)); await sleep(1200);
        await clickRect(await stagePreview()); await sleep(1200);
        await ev(`app.goToWinId(${S(W.scra1Live)}); return true;`); await sleep(1500);
        const tab = await ev(`const h = wm.windows.get(${S(W.scra1Live)}); const t = h.titleBar.querySelector('.tab-item[data-win-id="' + ${S(W.maj)} + '"]'); return t ? rect(t) : null;`);
        if (ok(!!tab, '6 C1 the corner group is the hero\'s frame, Majordomo\'s tab on the strip', S({ tab, corner }))) {
          await drag({ x: tab.left + tab.width / 2, y: tab.top + tab.height / 2 }, { x: tab.left + tab.width / 2 - 200, y: tab.top + tab.height / 2 + 350 });
          await sleep(800);
          const torn = await ev(`return { hero: st._heroWinId, chains: { h: !!wm.windows.get(${S(W.scra1Live)})._tabChain, g: !!wm.windows.get(${S(W.maj)})._tabChain } };`);
          ok(torn.hero === W.maj && !torn.chains.h && !torn.chains.g, '6 C1 the drag split the group; the torn-off Majordomo is the hero', S(torn));
          await clickRect(await deskPreview(desks.scra)); await sleep(1500);
          const hh = await probe6(W.scra1Live), gg = await probe6(W.maj);
          const boxes = await ev(`return { h: wm.windows.get(${S(W.scra1Live)}).gridBounds, g: wm.windows.get(${S(W.maj)}).gridBounds };`);
          console.log('    C1 ' + S({ boxes, h: { rect: hh.rect, title: hh.titleHit }, g: { rect: gg.rect } }));
          ok(hh.rect && gg.rect && (Math.abs(hh.rect.x - gg.rect.x) > 8 || Math.abs(hh.rect.y - gg.rect.y) > 8), `6 C1 on Scra the torn-off Majordomo is NOT exactly on Scra-1 (${S(gg.rect)} vs ${S(hh.rect)}) — a corner home steps the other way (f5635f9d: the same box)`, S({ boxes, h: hh.rect, g: gg.rect }));
          // a bottom-edge home has room only UP: the torn-off half (on top — the active window) covers the frame's title bar except
          // its far-right strip, which is what a title-bar probe from the right finds (an interior home's frame peeks out above it)
          const reach = await ev(`const w = wm.windows.get(${S(W.scra1Live)}); const tb = w.element.querySelector(':scope > .window-titlebar').getBoundingClientRect(); const hits = []; for (let x = tb.right - 8; x > tb.left; x -= 10) { const h = document.elementFromPoint(x, tb.top + tb.height / 2); if (h && w.element.contains(h)) hits.push(Math.round(x - tb.left)); } return { hits: hits.length, probes: Math.ceil(tb.width / 10), width: Math.round(tb.width) };`);
          ok(reach.hits > 0, `6 C1 …and Scra-1's title bar is reachable beside the hero (${reach.hits} of ${reach.probes} probe points along it hit Scra-1 — the right strip a corner home leaves; f5635f9d: none, the same box)`, S(reach));
        }
      }
      // ═══ 7 A REMOTE TEAR-OFF LANDS WHERE THE RECORD SAYS (stage-blank verify r4, found under the mixed-version leg — no Stage
      //     involved): this page holds [Scra-1 host, Majordomo]; the real _applyRemoteState is handed the record another device
      //     sends after tearing Majordomo off and dropping it at X (the same window ids, no tabChain) ⇒ the chain breaks AND
      //     Majordomo stands at X (before: at its old host's box — the detach copied the host's box over the record's; this
      //     page's next save then wrote it back there for every client)
      {
        await clickRect(await deskPreview(desks.scra)); await sleep(1200);
        const X = { left: 0.55, top: 0.45, width: 0.4, height: 0.5 }, homeH = { left: 0.05, top: 0.1, width: 0.4, height: 0.5 };
        await ev(`const h = wm.windows.get(${S(W.scra1Live)}), g = wm.windows.get(${S(W.maj)}); for (const w of [h, g]) { if (w._tabChain) wm._detachFromChain(w._tabChain, w.id); if (w.isMaximized) wm.toggleMaximize(w.id); } h.gridBounds = ${S(homeH)}; wm._applyGridBounds(h); wm._captureGridBounds(h); wm.createTabChain(h, g); wm.switchTab(h._tabChain, 0); wm._captureGridBounds(h); if (app.layoutManager._heldChainActs) app.layoutManager._heldChainActs.clear(); return true;`); await sleep(500); // a group made LONG AGO (a fresh scene): § 6 C1's real tear-off of these two windows is a user act held for a minute (verify r5), and a record that disagrees with the page's chain for them would be refused while it stands
        const b0 = await ev(`const g = wm.windows.get(${S(W.maj)}); return { chain: g._tabChain ? g._tabChain.tabs : null, gb: g.gridBounds };`);
        ok(b0.chain && b0.chain.length === 2, '7 this page holds the group [Scra-1 host, Majordomo]', S(b0));
        const state = await ev(`const s = app.layoutManager.captureState(); for (const rw of s.windows) { const id = rw.winId || rw.id; if (id === ${S(W.maj)}) { rw.gridBounds = ${S(X)}; delete rw.tabChain; delete rw.isTabGuest; } if (id === ${S(W.scra1Live)}) delete rw.tabChain; } return s;`);
        await ev(`app.layoutManager._applyRemoteState(${S(state)}); return true;`); await sleep(1200);
        const b1 = await ev(`const g = wm.windows.get(${S(W.maj)}), h = wm.windows.get(${S(W.scra1Live)}); const ws = document.getElementById('workspace').getBoundingClientRect(); const r = g.element.getBoundingClientRect(); return { chain: g._tabChain ? g._tabChain.tabs : null, gb: g.gridBounds, fr: { left: (r.left - ws.left) / ws.width, top: (r.top - ws.top) / ws.height, width: r.width / ws.width, height: r.height / ws.height }, host: h.gridBounds };`);
        const nearB = (a, b, eps) => !!(a && b) && ['left', 'top', 'width', 'height'].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < eps);
        ok(!b1.chain, '7 the record broke the group here', S(b1));
        ok(nearB(b1.gb, X, 0.02) && nearB(b1.fr, X, 0.03), `7 Majordomo stands at X ${S(X)} as the record says (got ${S(b1.gb)}, drawn at ${S(b1.fr)}${nearB(b1.gb, b1.host, 0.02) ? ' — ON ITS OLD HOST' : ''})`, S(b1));
        ok(nearB(b1.host, homeH, 0.02), '7 …and the host keeps its own box', S(b1));
      }
      // ═══ 8 THE HELD CHAIN ACT (stage-blank verify r5, found on the merged tree with lane desktop-move — no Stage involved): this
      //     page holds [Scra-1 host, Majordomo]; the user TEARS Majordomo off with a real tab drag while a record that still names
      //     the group lands — (a) DEFERRED under the very drag (§6b guard 3: the suite's own socket sends it while the button is
      //     held; applied at the pointerup), (b) right after the drop, before the tear's save leaves (the 500 ms debounce). Both
      //     re-formed the group at the drop (the torn tab back on its old host, the drop point lost, the next save carrying the
      //     re-formed group to every client; measured on two pages). Now: the tear is held until a record AGREES with it — the
      //     tab stays torn off where it was dropped, and the page's next save carries the tear.
      {
        await clickRect(await deskPreview(desks.scra)); await sleep(1500);
        const homeH8 = { left: 0.05, top: 0.1, width: 0.4, height: 0.5 };
        const group8 = async () => {
          await ev(`const h = wm.windows.get(${S(W.scra1Live)}), g = wm.windows.get(${S(W.maj)}); for (const w of [h, g]) { if (w._tabChain) wm._detachFromChain(w._tabChain, w.id); if (w.isMaximized) wm.toggleMaximize(w.id); } h.gridBounds = ${S(homeH8)}; wm._applyGridBounds(h); wm._captureGridBounds(h); return true;`); await sleep(300);
          const t = await ev(`return rect(wm.windows.get(${S(W.scra1Live)}).titleBar);`); await clickAt({ x: t.left + Math.min(40, t.width / 4), y: t.top + t.height / 2 }); // a real press: the group is the user's
          await ev(`const h = wm.windows.get(${S(W.scra1Live)}), g = wm.windows.get(${S(W.maj)}); wm.createTabChain(h, g); wm.switchTab(h._tabChain, 0); wm._captureGridBounds(h); if (app.layoutManager._heldChainActs) app.layoutManager._heldChainActs.clear(); return true;`); await sleep(2500); // the group's save leaves (its own act released: a fresh scene)
          const stale = await ev(`return app.layoutManager.captureState();`); // the record another device still holds
          const tab = await ev(`const h = wm.windows.get(${S(W.scra1Live)}); const t = h.titleBar.querySelector('.tab-item[data-win-id="' + ${S(W.maj)} + '"]'); return t ? rect(t) : null;`);
          return { stale, tab };
        };
        const staleOf = (stale) => JSON.stringify({ type: 'layout-sync', state: stale, desktopId: desks.scra });
        const sendsTap = () => ev(`window.__ls8 = []; if (!window.__ls8tap) { window.__ls8tap = true; const os = app.ws.send.bind(app.ws); app.ws.send = (m) => { try { if (m && m.type === 'layout-sync') window.__ls8.push({ t: Date.now(), chains: (m.state.windows || []).filter((w) => w.tabChain && !w.isTabGuest).map((w) => w.tabChain.tabs), bGb: ((m.state.windows || []).find((w) => (w.winId || w.id) === ${S(W.maj)}) || {}).gridBounds || null }); } catch {} return os(m); }; } return true;`);
        const after8 = () => ev(`const g = wm.windows.get(${S(W.maj)}), h = wm.windows.get(${S(W.scra1Live)}); const ws = document.getElementById('workspace').getBoundingClientRect(); const r = g.element.getBoundingClientRect(); return { chain: g._tabChain ? g._tabChain.tabs : null, hostChain: h._tabChain ? h._tabChain.tabs : null, gb: g.gridBounds, fr: { left: (r.left - ws.left) / ws.width, top: (r.top - ws.top) / ws.height, width: r.width / ws.width, height: r.height / ws.height }, host: h.gridBounds, held: [...((app.layoutManager._heldChainActs || new Map()).keys())], sends: window.__ls8 };`);
        const nearB8 = (a, b, eps) => !!(a && b) && ['left', 'top', 'width', 'height'].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < eps);
        // (a) the record deferred under the drag
        {
          const { stale, tab } = await group8();
          if (ok(!!tab && stale.windows.some((w) => w.tabChain && !w.isTabGuest), '8 (a) this page holds the group [Scra-1 host, Majordomo]; the stale record names it', S({ tab, chains: stale.windows.filter((w) => w.tabChain && !w.isTabGuest).length }))) {
            await sendsTap();
            const from = { x: tab.left + tab.width / 2, y: tab.top + tab.height / 2 }, to = { x: Math.min(tab.left + tab.width / 2 + 420, 1500), y: tab.top + tab.height / 2 + 300 };
            await mouse('mouseMoved', from.x, from.y); await mouse('mousePressed', from.x, from.y, { button: 'left', clickCount: 1 });
            for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', from.x + (to.x - from.x) * (i / 12), from.y + (to.y - from.y) * (i / 12), { button: 'left', buttons: 1 }); await sleep(35); }
            const mid = await ev(`const g = wm.windows.get(${S(W.maj)}); const ws = document.getElementById('workspace').getBoundingClientRect(); const r = g.element.getBoundingClientRect(); return { chain: !!g._tabChain, down: !!app.layoutManager._pointerDown, fr: { left: (r.left - ws.left) / ws.width, top: (r.top - ws.top) / ws.height, width: r.width / ws.width, height: r.height / ws.height } };`);
            ok(!mid.chain && mid.down, '8 (a) mid-drag: the tab is out under the held button', S(mid));
            ws.send(staleOf(stale)); await sleep(1000); // the other device's record lands under the pointer
            const pend = await ev(`const p = app.layoutManager._pendingRemote; return p ? (p.size !== undefined ? p.size : 1) : 0;`);
            ok(pend >= 1, '8 (a) the record is deferred under the drag (§6b guard 3)', S({ pend }));
            const midSends = await ev('return (window.__ls8 || []).length;');
            ok(midSends === 0, `8 (a) no save left while the button was held (verify r5 ⑤: the tear's save used to leave at ~690 ms with the torn tab still on its old host's box — ${midSends} left)`);
            await mouse('mouseReleased', to.x, to.y, { button: 'left', clickCount: 1 }); await sleep(2000); // the pointerup drains it 300 ms later
            const a = await after8();
            console.log('    8 (a) ' + S({ chain: a.chain, gb: a.gb, fr: a.fr, held: a.held }));
            ok(!a.chain && !a.hostChain, '8 (a) Majordomo stays TORN OFF — the deferred record never re-forms the group (the tear is held until a record agrees)', S(a));
            ok(nearB8(a.gb, mid.fr, 0.04) && nearB8(a.fr, mid.fr, 0.04) && !nearB8(a.gb, a.host, 0.02), `8 (a) …and stands where it was dropped (${S(mid.fr)}; got ${S(a.gb)}${nearB8(a.gb, a.host, 0.02) ? ' — ON ITS OLD HOST' : ''})`, S(a));
            await until(() => ev(`return (window.__ls8 || []).some((s) => s.chains.length === 0);`), 5000, 200);
            const b = await after8();
            ok(b.sends.some((x) => x.chains.length === 0) && !b.sends.some((x, i) => i > 0 && x.chains.length > 0 && b.sends[i - 1].chains.length === 0), `8 (a) …the page's next save carries the tear (${b.sends.length} save(s): ${S(b.sends.map((x) => x.chains))}) and never the re-formed group after it`, S(b.sends));
            ok(b.sends.length > 0 && nearB8(b.sends[0].bGb, mid.fr, 0.04), `8 (a) …and the FIRST save after the drop carries Majordomo at the drop (${S(b.sends[0] && b.sends[0].bGb)}), never its old host's box (verify r5 ⑤)`, S(b.sends));
          }
        }
        // (b) the record right after the drop, before the tear's save leaves
        {
          const { stale, tab } = await group8();
          if (ok(!!tab, '8 (b) the group again, Majordomo\'s tab on the strip')) {
            await sendsTap();
            await drag({ x: tab.left + tab.width / 2, y: tab.top + tab.height / 2 }, { x: Math.min(tab.left + tab.width / 2 + 420, 1500), y: tab.top + tab.height / 2 + 300 }, { steps: 12 });
            const dropped = await after8();
            ok(!dropped.chain, '8 (b) the drag tore Majordomo off', S({ chain: dropped.chain }));
            ws.send(staleOf(stale)); await sleep(2000); // lands before the tear's save (the debounce) — the measured T2
            const a = await after8();
            console.log('    8 (b) ' + S({ chain: a.chain, gb: a.gb, fr: a.fr, held: a.held, sends: a.sends.map((x) => x.chains) }));
            ok(!a.chain && !a.hostChain && nearB8(a.fr, dropped.fr, 0.04), `8 (b) a record landing between the drop and its save does not re-form the group; Majordomo stays at the drop (${S(dropped.fr)}; got ${S(a.fr)})`, S(a));
            await until(() => ev(`return (window.__ls8 || []).length > 0;`), 4000, 150);
            const b2 = await after8();
            ok(b2.sends.length > 0 && nearB8(b2.sends[0].bGb, dropped.fr, 0.04), `8 (b) …a QUICK tear (released before the debounce fired) — its first save still carries the drop (${S(b2.sends[0] && b2.sends[0].bGb)}), never the old host's box (verify r5 ⑤: the drop tells the save to wait for its capture)`, S(b2.sends));
            // the agreeing record: another device received the tear (Majordomo alone) — applied whole, the hold released
            const agreeing = await ev(`const s = app.layoutManager.captureState(); for (const rw of s.windows) { if ((rw.winId || rw.id) === ${S(W.maj)}) rw.gridBounds = { left: 0.55, top: 0.45, width: 0.4, height: 0.5 }; } return s;`);
            ws.send(staleOf(agreeing)); await sleep(1500);
            const c = await after8();
            ok(!c.chain && nearB8(c.gb, { left: 0.55, top: 0.45, width: 0.4, height: 0.5 }, 0.02) && c.held.length === 0, '8 (b) a record that AGREES with the tear (Majordomo alone, moved there) is applied whole and releases the hold', S({ chain: c.chain, gb: c.gb, held: c.held }));
          }
        }
      }
      // the census of the whole scene: every chat window's marks agree with its reasons (nothing hand-written survived)
      {
        const agree = await ev(`const bad = []; for (const w of wm.windows.values()) { if (w.type !== 'chat') continue; const box = !!(((w._tabChain && wm.windows.get(w._tabChain.tabs[0])) || w)._hiddenByDesktop || ((w._tabChain && wm.windows.get(w._tabChain.tabs[0])) || w)._hiddenByStage); const cv = w.element.style.contentVisibility || ''; const aria = w.element.getAttribute('aria-hidden') === 'true'; if ((cv === 'hidden') !== box || aria !== box) bad.push({ id: w.id, box, cv, aria }); } return bad;`);
        ok(agree.length === 0, '6 every chat window\'s marks are exactly its reasons (content-visibility / aria-hidden iff a desktop or the Stage hides it)', S(agree));
      }
      for (const id of [W.resLive, W.fresh, W.scra1Live]) { const sid = id && await ev(`return app.sessions.get(${S(id)})?.sessionId || null;`); if (sid) ws.send(JSON.stringify({ type: 'kill', sessionId: sid })); }
      await sleep(600);
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
