#!/usr/bin/env node
// AN AGENT'S NEW WINDOW NEVER TAKES THE PERSON'S FOCUS — WITH A REAL CHROME (lane agent-window-no-steal, owner 2026-10-11).
// HEAVY: a scratch worktree server (private HOME, fake claude: two live chats) + headless Chrome clients. No xpra: the
// placement leg feeds `desktop-app-opened {sessionId, appId, origin:'agent-browser'}` straight into the page's global ws
// handlers (the record GETs of the fake app ids are held, so the pane stays a pane). Desk 1100: the person's editor on desk 1
// holds the caret ⇒ an agent's browser for chat A, SHOWING on desk 1 behind the editor ⇒ NO pane (lane agent-window-no-pop,
// inc-mvhebl4n-rkvr: nothing moves on the desk the person is using) — chat A's box unchanged, its taskbar entry carries the
// badge; one for a chat on desk 2 ⇒ no desktop switch, the pane lives on desk 2; the person IN chat A (its window active) ⇒
// the pane is born beside it (its chain), chat A stays the active window; the person presses chat A's taskbar entry ⇒ front
// + focus; the setting ON ⇒ today's behaviour (front + focus).
// Phone 390: the shown window is unchanged, the title carries the badge. PNGs: $VIBESPACE_AWNS_PNG_DIR/{desk,phone}.png.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = require(path.join(repo, 'node_modules', 'ws'));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome for the client'); process.exit(0); }
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1200) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 250) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };
const PNG_DIR = process.env.VIBESPACE_AWNS_PNG_DIR || null;
const [PORT, CDP_PORT] = await freePorts(2);
const VNC_ENV = await vncEnv();
const wt = scratch('awns-chrome');
const fakeHome = scratchHome('awns-home', fs);
const RUNTIME = path.join(fakeHome, 'run'); fs.mkdirSync(RUNTIME, { recursive: true }); fs.chmodSync(RUNTIME, 0o700);
const { fixtureLitter } = require(path.join(repo, 'src/fixture-guard.js'));
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const FAKE_BIN = path.join(fakeHome, 'fake-bin'); fs.mkdirSync(FAKE_BIN, { recursive: true });
const FAKE_CLAUDE = path.join(FAKE_BIN, 'claude');
{
  const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: fixtureSid('a1'), cwd: fakeHome, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(FAKE_CLAUDE, `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n' '${init}';; esac\nexec sleep 600\n`, { mode: 0o755 });
}
const baseEnv = { ...process.env }; delete baseEnv.DISPLAY; delete baseEnv.WAYLAND_DISPLAY; delete baseEnv.DBUS_SESSION_BUS_ADDRESS;
const srvEnv = { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, XDG_RUNTIME_DIR: RUNTIME, VIBESPACE_SKIP_AGENT_HOOKS: '1', CLAUDE_CMD: FAKE_CLAUDE, PATH: FAKE_BIN + ':' + (process.env.PATH || '') };
const srvLog = [];
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d)));
const client = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1100,800', `--user-data-dir=${scratch('awns-client')}`, 'about:blank'], { stdio: 'ignore', detached: true });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { process.kill(-client.pid, 'SIGKILL'); } catch { }
  try { process.kill(-srv.pid, 'SIGKILL'); } catch { }
  for (const root of [wt, fakeHome]) { try { endRootedProcesses(root); } catch { } }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

try {
  const up = await until(async () => { if (srv.exitCode !== null) return 'dead'; await fetch(`http://127.0.0.1:${PORT}/api/home`); return 'up'; }, 120000, 250);
  check('the scratch server answers (private HOME + runtime dir)', up === 'up', srvLog.join('').slice(-600));
  if (up !== 'up') throw new Error('no server');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  const mk = async (tag) => { ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: fakeHome, cols: 80, rows: 24, reqId: tag, name: tag })); const c = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === tag), 20000, 100); return c && c.sessionId; };
  const SA = await mk('chat-a'), SB = await mk('chat-b');
  check('two live agent chats', !!SA && !!SB, { SA, SB });

  const ver = await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(), 30000);
  const cdp = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map();
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  // the record GETs of the fake app ids never answer (the pane stays; nothing else of the page is touched)
  const HOLD = "(() => { const of = window.fetch; window.fetch = (u, o) => (String(u && u.url || u).includes('da-awns') ? new Promise(() => {}) : of(u, o)); })();";
  async function newPage(w, h, mobile, sids) {
    const t = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const a = await send('Target.attachToTarget', { targetId: t.result.targetId, flatten: true });
    const s = a.result.sessionId; const S = (m, p) => send(m, p, s);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    if (mobile) await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: HOLD });
    await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 400) }; return r.result && r.result.result ? r.result.result.value : undefined; };
    const ready = await until(() => ev("!!(window.app && window.app.wm) && !document.getElementById('loading-screen')"), 60000, 300);
    for (const [sid, name] of sids) {
      await ev(`(app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(name)}, ${JSON.stringify(fakeHome)}, { mode: 'chat' }), true)`);
      await until(() => ev(`[...app.sessions.values()].some((v) => v && v.sessionId === ${JSON.stringify(sid)})`), 20000, 250);
    }
    return { S, ev, ready };
  }
  const winOf = (sid) => `[...app.sessions.entries()].find(([, v]) => v && v.sessionId === ${JSON.stringify(sid)})[0]`;
  const fire = (sid, appId) => `(app.ws.globalHandlers.forEach((h) => { try { h({ type: 'desktop-app-opened', sessionId: ${JSON.stringify(sid)}, appId: ${JSON.stringify(appId)}, origin: 'agent-browser' }); } catch (e) { console.error(e); } }), true)`;
  const shot = async (S, f) => { if (!PNG_DIR) return null; const r = await S('Page.captureScreenshot', { format: 'png' }); if (!r.result) return null; fs.mkdirSync(PNG_DIR, { recursive: true }); const out = path.join(PNG_DIR, f); fs.writeFileSync(out, Buffer.from(r.result.data, 'base64')); return out; };
  // the person's facts after an agent open: who is active, who holds the caret, what is drawn at the pane's centre, the taskbar
  const facts = (appId) => `(() => {
    const ed = app.wm.windows.get(window.__ed); const w = [...app.wm.windows.values()].find((x) => x._desktopAppId === ${JSON.stringify(appId)});
    const frame = w && w._tabChain ? app.wm.windows.get(w._tabChain.tabs[0]) : w;
    const r = w ? (w._tabChain ? w.content.getBoundingClientRect() : w.element.getBoundingClientRect()) : null;
    const at = r && r.width > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    const item = frame ? document.querySelector('.taskbar-item[data-win-id="' + frame.id + '"]') : null;
    return { exists: !!w, active: app.wm.activeWindowId, ed: window.__ed, caret: document.activeElement === window.__ta, inChain: !!(w && w._tabChain), chainHost: frame && frame.id,
      rect: r && { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, coveredByEditor: !!(at && ed && ed.element.contains(at)),
      zEd: ed && +ed.element.style.zIndex, zFrame: frame && +frame.element.style.zIndex, desk: app.desktopManager.activeDesktopId, winDesk: frame && frame._desktopId, hiddenByDesk: !!(frame && frame._hiddenByDesktop),
      arrived: !!(w && w.element.classList.contains('window-arrived')), itemArrived: !!(item && item.classList.contains('arrived')), item: !!item };
  })()`;

  console.log('desk 1100 — the person\'s editor holds the caret');
  const D = await newPage(1100, 800, false, [[SA, 'chat-a'], [SB, 'chat-b']]);
  check('the desktop page booted with both chats', !!D.ready && await D.ev(`[...app.sessions.values()].filter((v) => v && (v.sessionId === ${JSON.stringify(SA)} || v.sessionId === ${JSON.stringify(SB)})).length`) === 2);
  const setup = await D.ev(`(() => {
    const dm = app.desktopManager; window.__d1 = dm.activeDesktopId; window.__d2 = dm.createDesktop('Desk 2');
    const a = app.wm.windows.get(${winOf(SA)}), b = app.wm.windows.get(${winOf(SB)});
    dm.moveWindowToDesktop(b.id, window.__d2);
    Object.assign(a.element.style, { left: '120px', top: '60px', width: '760px', height: '520px' });
    const ed = app.wm.createWindow({ title: 'Editor', type: 'files', x: 20, y: 10, width: 1040, height: 660 });
    const ta = document.createElement('textarea'); ta.style.cssText = 'width:100%;height:100%;box-sizing:border-box'; ta.value = 'the person is typing here'; ed.content.appendChild(ta);
    app.wm.focusWindow(ed.id); ta.focus(); ta.setSelectionRange(10, 10);
    window.__ed = ed.id; window.__ta = ta; window.__a = a.id;
    return { d1: window.__d1, d2: window.__d2, aDesk: a._desktopId, bDesk: b._desktopId, bHidden: !!b._hiddenByDesktop, active: app.wm.activeWindowId === ed.id, caret: document.activeElement === ta };
  })()`);
  check('desk 1: chat A behind the editor, which is active and holds the caret; chat B on desk 2', setup && setup.active && setup.caret && setup.aDesk === setup.d1 && setup.bDesk === setup.d2 && setup.bHidden, setup);
  const aBox = () => D.ev(`(() => { const r = app.wm.windows.get(window.__a).content.getBoundingClientRect(); /* the chat's PANE: a split keeps the frame, halves the pane */ return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); })()`);
  const box0 = await aBox();
  await D.ev(fire(SA, 'da-awns1'));
  await sleep(3600); // past the pane's 3 s pending (unseen) grace — a pane, if any, would be painted by now
  const f1 = await D.ev(facts('da-awns1'));
  const a1 = await D.ev(`(() => { const a = app.wm.windows.get(window.__a); const item = document.querySelector('.taskbar-item[data-win-id="' + a.id + '"]'); return { arrived: a.element.classList.contains('window-arrived'), itemArrived: !!(item && item.classList.contains('arrived')) }; })()`);
  check('an agent browser for chat A — SHOWING on desk 1, the person in the editor ⇒ NO pane opens (the base placed one beside chat A)', f1 && !f1.exists, f1);
  check('… chat A\'s pane keeps its exact box (nothing re-arranged under the person\'s hand; the base split it) and the editor still holds the active window and the caret', f1 && f1.active === f1.ed && f1.caret && (await aBox()) === box0, { f1, box0 });
  check('… chat A\'s taskbar entry carries the badge (window-arrived ⇒ .taskbar-item.arrived) — its window chip opens the browser', a1 && a1.arrived && a1.itemArrived, a1);
  await D.ev(fire(SB, 'da-awns2'));
  await sleep(800);
  const f2 = await D.ev(facts('da-awns2'));
  const d2 = await D.ev('window.__d2'), d1 = await D.ev('window.__d1');
  check('an agent browser for chat B (desk 2) ⇒ NO desktop switch (desk 1 still shown), the pane lives on desk 2, hidden', f2 && f2.exists && f2.desk === d1 && f2.winDesk === d2 && f2.hiddenByDesk, f2);
  check('… the editor still active with the caret', f2 && f2.active === f2.ed && f2.caret, f2);
  // the person IN chat A (its window the active one) ⇒ the agent's browser is born beside it, never focused
  await D.ev('(app.wm.focusWindow(window.__a), true)');
  await D.ev(fire(SA, 'da-awns5'));
  await sleep(3600);
  const f5 = await D.ev(facts('da-awns5'));
  check('the person IN chat A ⇒ the agent browser\'s pane is born BESIDE chat A (in its chain), chat A stays the active window', f5 && f5.exists && f5.inChain && f5.chainHost === (await D.ev('window.__a')) && f5.active === f5.chainHost, f5);
  check('… its taskbar entry pulses (window-arrived ⇒ .taskbar-item.arrived)', f5 && f5.arrived && f5.itemArrived, f5);
  const deskPng = await shot(D.S, 'desk.png');
  if (deskPng) console.log(`  · ${deskPng}`);
  // the person goes back to the editor, then presses chat A's taskbar entry ⇒ front + focus, as any window
  await D.ev('(app.wm.focusWindow(window.__ed), window.__ta.focus(), true)');
  const box = await D.ev(`(() => { const host = app.wm.windows.get(window.__a); const el = document.querySelector('.taskbar-item[data-win-id="' + host.id + '"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (box) { for (const type of ['mousePressed', 'mouseReleased']) await D.S('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 }); }
  await sleep(500);
  const f3 = await D.ev(facts('da-awns5'));
  check('the person presses the taskbar entry ⇒ that group comes to the front and takes the focus; the pulse is spent', !!box && f3 && f3.active !== f3.ed && f3.zFrame > f3.zEd && !f3.arrived && !f3.itemArrived, { box, f3 });

  console.log('phone 390 — the shown window stays');
  const P = await newPage(390, 844, true, [[SA, 'chat-a']]);
  const p0 = await P.ev(`({ active: app.wm.activeWindowId, chat: ${winOf(SA)} })`);
  await P.ev(fire(SA, 'da-awns4'));
  await sleep(3600);
  const p1 = await P.ev(`(() => { const w = [...app.wm.windows.values()].find((x) => x._desktopAppId === 'da-awns4'); const r = w && w.element.getBoundingClientRect(); const cs = w && getComputedStyle(w.element); return { exists: !!w, active: app.wm.activeWindowId, shown: !!(w && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0), titleArrived: document.getElementById('mobile-nav-title')?.classList.contains('arrived') }; })()`);
  check('phone: the chat was the shown window', !!P.ready && p0 && p0.active === p0.chat, p0);
  check('phone: an agent browser ⇒ the window exists, the shown window is UNCHANGED, the new one is not shown', p1 && p1.exists && p1.active === p0.active && !p1.shown, p1);
  check('phone: the title carries the badge (it is there)', p1 && p1.titleArrived, p1);
  const phonePng = await shot(P.S, 'phone.png');
  if (phonePng) console.log(`  · ${phonePng}`);

  console.log('the setting ON ⇒ today\'s behaviour');
  await D.ev(`(app.settings.set('desktop.agentWindowsFront', true), app.wm.focusWindow(window.__ed), window.__ta.focus(), true)`);
  const pre = await D.ev(`({ active: app.wm.activeWindowId === window.__ed, caret: document.activeElement === window.__ta, on: app.settings.get('desktop.agentWindowsFront') })`);
  await D.ev(fire(SA, 'da-awns3'));
  await sleep(800);
  const f4 = await D.ev(facts('da-awns3'));
  check('setting ON: the editor had the focus, then the agent\'s browser came to the front and took it (D3\'s old answer)', pre && pre.active && pre.caret && pre.on === true && f4 && f4.exists && f4.active !== f4.ed && f4.zFrame > f4.zEd, { pre, f4 });
  await D.ev(`(app.settings.set('desktop.agentWindowsFront', false), true)`);
  ws.close(); cdp.close();
} catch (e) { failed++; console.error(`  ✗ the suite threw: ${e && e.stack}`); console.error(srvLog.join('').slice(-1500)); }
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name)).map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
}
console.log(failed ? `\nFAIL (${failed} failed)` : '\nALL PASS');
process.exit(failed ? 1 : 0);
