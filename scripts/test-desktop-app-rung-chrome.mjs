#!/usr/bin/env node
// THE DESKTOP-APP RUNG WITH A REAL CHROME (lane e2a r2, docs/design-agent-browser-v2 §E2, B-830d) — HEAVY: a scratch
// worktree server (private HOME + XDG_RUNTIME_DIR, its own dbus-run-session, the per-run singleton display — never the
// owner's), the REAL xpra rung, a stub agent (a fake claude under the real ws create) that runs the SHIPPED CLIs:
//   ① `vibespace-browser new … --backend desktop-app --url <our page>` ⇒ a REAL chromium-family browser on xpra fetches
//     our page; the record says origin agent-browser + the opener; the lease (origin agent-browser) and the opener grant
//     are in the API (the agent's targets list shows the window only because of the grant)
//   ② `vibespace-window snapshot <h>` reads the page through the accessibility tree; `vibespace-browser --profile <h>
//     get url` ⇒ no_cdp_on_this_backend; `vibespace-window open chromium` ⇒ browser_is_human naming the door
//   ③ the client SHOWING the chat (1400×900) opens the window BESIDE the chat; a 390 px phone showing it opens it as its
//   ④c lane e2c (§E2.3): the first browser launches --mode tree (the snapshot leg reads the page); the kept one --mode
//      pixels ⇒ pin 1920×1080 + a 1920×1080 screenshot; `vibespace-window mode <h> auto` ⇒ the probe's answer + why
//      lane e2-canvas: the window pinned from launch keeps its viewers — neither browser's xpra log names an invalid packet
//   ④b lane e2b (§E2.2): `vibespace-window size <h> 1600x900` ⇒ the record's pin, the X window 1600×900 (xwininfo), the
//      desktop client's ~700 px split pane scales the picture (chip "(pinned)"), screenshot = 1600×900, click --at 1500,800
//      lands at xdotool getmouselocation x:1500 y:800; `size <h> auto` unpins
//     own window — PNGs for the owner (beside.png, beside-phone.png in VIBESPACE_RUNG_PNG_DIR when set)
//   ④ D6: the session ends ⇒ both of its browsers stop (why opener-ended); the throwaway profile is removed, the
//     --keep-profile one is kept
import { execSync, execFileSync, spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = require(path.join(repo, 'node_modules', 'ws'));
const which = (b) => { try { return execFileSync('sh', ['-c', `command -v ${b}`], { encoding: 'utf8' }).trim() || null; } catch { return null; } };
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const XPRA = which('xpra'), XAUTH = which('xauth'), DBUS = which('dbus-run-session');
const BROWSER = ['chromium', 'chromium-browser', 'google-chrome'].map(which).find((p) => p && !p.startsWith('/snap/'));
const skipWhy = !CHROME ? 'no chrome for the client' : !XPRA ? 'xpra not on PATH' : !XAUTH ? 'xauth not on PATH' : !DBUS ? 'dbus-run-session not on PATH' : !BROWSER ? 'no chromium-family browser on PATH (a snap is refused by name)' : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1200) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 250) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };
const PNG_DIR = process.env.VIBESPACE_RUNG_PNG_DIR || null;
const [PORT, CDP_PORT, PAGE_PORT] = await freePorts(3);
const VNC_ENV = await vncEnv();
const wt = scratch('da-rung-chrome');
const fakeHome = scratchHome('da-rung-home', fs);
const RUNTIME = path.join(fakeHome, 'run'); fs.mkdirSync(RUNTIME, { recursive: true }); fs.chmodSync(RUNTIME, 0o700);
const D = require(path.join(repo, 'src/desktop-display.js'));
const { fixtureLitter } = require(path.join(repo, 'src/fixture-guard.js'));
// THE REAL HOME IS CENSUSED (test-fixture-isolation census (c)): this suite carries a synthetic session id into a server's
// home — the real ~/.claude/projects is snapshotted now and must gain no FIXTURE entry by the end
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();

// ── the tree + the server (private HOME, runtime dir, bus; the per-run display) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const FAKE_BIN = path.join(fakeHome, 'fake-bin'); fs.mkdirSync(FAKE_BIN, { recursive: true });
const FAKE_CLAUDE = path.join(FAKE_BIN, 'claude');
{
  const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: fixtureSid('e2'), cwd: fakeHome, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(FAKE_CLAUDE, `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n' '${init}';; esac\nexec sleep 600\n`, { mode: 0o755 });
}
// the agent's CLIs run page verbs only past the browser-CLI presence check: a fake that never runs (it says so if it does)
fs.writeFileSync(path.join(FAKE_BIN, 'agent-browser'), '#!/bin/sh\ncase "$1" in --version) echo "agent-browser 0.38.1";; *) echo "the fake browser CLI was run: $*" >&2; exit 9;; esac\n', { mode: 0o755 });
const baseEnv = { ...process.env }; delete baseEnv.DISPLAY; delete baseEnv.WAYLAND_DISPLAY; delete baseEnv.DBUS_SESSION_BUS_ADDRESS;
const srvEnv = { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, XDG_RUNTIME_DIR: RUNTIME, VIBESPACE_SKIP_AGENT_HOOKS: '1', CLAUDE_CMD: FAKE_CLAUDE, PATH: FAKE_BIN + ':' + (process.env.PATH || '') };
const srvLog = [];
const srv = spawn(DBUS, ['--', process.execPath, 'server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d)));
const client = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1400,900', `--user-data-dir=${scratch('da-rung-client')}`, 'about:blank'], { stdio: 'ignore', detached: true });
const hits = [];
const page = http.createServer((req, res) => { hits.push({ url: req.url, ua: req.headers['user-agent'] || '' }); res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>E2A rung page</title><h1>Hello rung</h1><button>Press me</button>'); });
await new Promise((r) => page.listen(PAGE_PORT, '127.0.0.1', r));
const appsOf = () => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(wt, 'data/desktop-apps.json'), 'utf8')).apps); } catch { return []; } };
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { process.kill(-client.pid, 'SIGKILL'); } catch { }
  try { process.kill(-srv.pid, 'SIGKILL'); } catch { }
  const apps = appsOf();
  for (const a of apps) for (const p of Object.values(a.pids || {})) if (p) { try { process.kill(p, 'SIGKILL'); } catch { } }
  // by EVIDENCE only: a process carrying one of this tree's app markers (xpra's Xvfb outlives the recorded pids)
  const needles = apps.map((a) => `VIBESPACE_DESKTOP_APP=${a.id}`);
  if (needles.length) for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d) || Number(d) === process.pid) continue; if (needles.some((n) => D.environHas(Number(d), n))) { try { process.kill(Number(d), 'SIGKILL'); } catch { } } }
  for (const root of [wt, fakeHome]) { try { endRootedProcesses(root); } catch { } } // every process this suite caused carries one of its roots
  try { page.close(); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const mp of [path.join(RUNTIME, 'gvfs'), path.join(RUNTIME, 'doc')]) { try { execFileSync('fusermount3', ['-u', '-z', mp], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

try {
  const up = await until(async () => { if (srv.exitCode !== null) return 'dead'; await fetch(`http://127.0.0.1:${PORT}/api/home`); return 'up'; }, 120000, 250);
  check('the scratch server answers (private HOME + runtime dir, its own dbus-run-session)', up === 'up', srvLog.join('').slice(-600));
  if (up !== 'up') throw new Error('no server');
  // ── the stub agent: a live chat session (fake claude) with its vsst_ token ──
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: fakeHome, cols: 80, rows: 24, reqId: 'e2a', name: 'rung-agent' }));
  const created = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === 'e2a'), 20000, 100);
  const SID = created && created.sessionId;
  const token = created && await until(() => { for (const f of fs.readdirSync(path.join(wt, 'data', 'session-meta'))) { try { const j = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'session-meta', f), 'utf8')); if (j.agentToken && j.webuiSessionId === SID) return j.agentToken; } catch { } } return null; }, 15000, 200);
  check('a live agent session with its vsst_ token', !!SID && /^vsst_/.test(String(token)), created);
  const cliEnv = { PATH: `${FAKE_BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: fakeHome, VIBESPACE_API: `http://127.0.0.1:${PORT}`, VIBESPACE_SESSION_TOKEN: token, VIBESPACE_SESSION_CWD: fakeHome, LANG: 'C.UTF-8' };
  const cli = (bin, args) => new Promise((resolve) => execFile(process.execPath, [path.join(repo, 'data/bin', bin), ...args], { env: cliEnv, cwd: fakeHome, timeout: 90000 }, (e, out, err) => resolve({ code: e ? (e.code ?? 1) : 0, out: String(out), err: String(err) })));

  // ── two clients SHOWING the chat: a desktop page and a 390 px phone ──
  const ver = await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(), 30000);
  const cdp = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map();
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  async function newPage(w, h, mobile) {
    const t = await send('Target.createTarget', { url: 'about:blank', newWindow: true }); // each client its OWN window: a background tab is hidden (placement opens nothing there, by design)
    const a = await send('Target.attachToTarget', { targetId: t.result.targetId, flatten: true });
    const s = a.result.sessionId; const S = (m, p) => send(m, p, s);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    if (mobile) await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
    const ready = await until(() => ev("!!(window.app && window.app.wm) && !document.getElementById('loading-screen')"), 60000, 300);
    if (ready) await ev(`(app.attachSession(${JSON.stringify(SID)}, 'rung-agent', ${JSON.stringify(fakeHome)}, { mode: 'chat' }), true)`);
    const showing = ready && await until(() => ev(`[...app.sessions.values()].some((v) => v && v.sessionId === ${JSON.stringify(SID)})`), 20000, 250);
    return { S, ev, ready, showing };
  }
  const desk = await newPage(1400, 900, false);
  const phone = await newPage(390, 844, true);
  const vis = [await desk.ev('document.visibilityState'), await phone.ev('document.visibilityState')];
  check(`the desktop client (1400×900) and the phone (390 px) both SHOW the chat window, both pages visible (${vis.join(', ')})`, !!desk.showing && !!phone.showing && (await phone.ev('!!app.isMobile')) === true && vis.every((v) => v === 'visible'), { desk: desk.ready, phone: phone.ready, vis });

  // ① the door, a REAL browser on the xpra rung
  const url = `http://127.0.0.1:${PAGE_PORT}/rung`;
  const n1 = await cli('vibespace-browser', ['new', 'Rung page', '--backend', 'desktop-app', '--url', url, '--mode', 'tree']);
  const H = (/handle (\S+)/.exec(n1.out) || [])[1];
  check('e2c: --mode tree at launch ⇒ the CLI prints the verdict "mode: tree — tree mode as asked…" (the snapshot leg below reads the page)', /mode: tree — tree mode as asked/.test(n1.out), n1);
  check(`vibespace-browser new --backend desktop-app answers a handle (${H})`, n1.code === 0 && !!H && /beside your chat/.test(n1.out) && /no_cdp_on_this_backend/.test(n1.out), n1);
  const got = await until(() => hits.find((x) => x.url === '/rung'), 90000, 300);
  check(`a REAL browser fetched our page (${got ? got.ua.slice(0, 60) : 'no request'})`, !!got && /Chrome|Chromium/.test(got.ua), hits);
  const rec = await until(async () => { const j = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps`)).json(); const a = (j.apps || []).find((x) => x.id === H); return a && a.state === 'ready' ? a : null; }, 90000, 500);
  check(`the record: origin agent-browser, by the opener (${rec && rec.by && rec.by.name}), the agent's label (${rec && rec.label}), on the xpra rung, ready`, !!rec && rec.origin === 'agent-browser' && rec.by && rec.by.sessionId === SID && typeof rec.by.name === 'string' && !!rec.by.name && rec.label === 'Rung page' && /xpra/.test(String(rec.backend)), rec && { origin: rec.origin, by: rec.by, label: rec.label, backend: rec.backend, state: rec.state });
  const ENG = require(path.join(wt, 'src/server/window-targets-engine.js'));
  const leases = JSON.parse(fs.readFileSync(path.join(wt, 'data', ENG.LEASE_FILE), 'utf8')).leases || {};
  check('the lease: the opener\'s, origin agent-browser (persisted)', leases[H] && leases[H].origin === 'agent-browser' && leases[H].sessionId === SID, leases[H]);
  const tg = await (await fetch(`http://127.0.0.1:${PORT}/api/agent/window/targets`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const row = (tg.targets || []).find((t) => t.handle === H);
  check('the opener grant: the agent\'s own targets list shows the window (hidden from every agent unless shared)', !!row, (tg.targets || []).map((t) => t.handle));
  const reachFile = path.join(wt, 'data', ENG.REACH_FILE);
  const reach = fs.existsSync(reachFile) ? JSON.parse(fs.readFileSync(reachFile, 'utf8')) : {};
  check('the reach record: ONE row by self-open', ((reach.windows || {})[H] || { rows: [] }).rows.length === 1 && reach.windows[H].rows[0].by === 'self-open', reach.windows && reach.windows[H]);

  // ② the window verbs read it; the CDP verb is refused by name; the human row stays the user's
  const snap = await until(async () => { const r = await cli('vibespace-window', ['snapshot', H]); return r.code === 0 && /Press me|Hello rung/.test(r.out) ? r : null; }, 120000, 2000);
  check('vibespace-window snapshot <h> reads the page through the accessibility tree (the a11y env on the agent\'s Chrome)', !!snap, snap || (await cli('vibespace-window', ['snapshot', H])));
  const gu = await cli('vibespace-browser', ['--profile', H, 'get', 'url']);
  check('vibespace-browser --profile <h> get url ⇒ no_cdp_on_this_backend with the window recipe (nothing ran)', gu.code === 1 && /no_cdp_on_this_backend/.test(gu.err) && /vibespace-window snapshot/.test(gu.err) && !/fake browser CLI was run/.test(gu.err), gu);
  const oc = await cli('vibespace-window', ['open', 'chromium']);
  check('vibespace-window open chromium stays browser_is_human — and names the door', oc.code !== 0 && /browser_is_human/.test(oc.err + oc.out) && /--backend desktop-app/.test(oc.err + oc.out), oc);

  // ③ placement: beside the chat on the desktop client, its own window on the phone
  const WHERE = (h) => `(() => { const c = [...app.sessions.entries()].find(([, v]) => v && v.sessionId === ${JSON.stringify(SID)}); const w = [...app.wm.windows.values()].find((x) => x._desktopAppId === ${JSON.stringify(h)} && !x._desktopSatelliteWid); if (!c || !w) return null; const cw = app.wm.windows.get(c[0]); const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; }; return { chat: r(cw.element), app: r(w.element), canvas: !!w.element.querySelector('canvas'), pending: w.element.classList.contains('desktop-app-pending'), chain: !!(w._tabChain && w._tabChain.tabs && w._tabChain.tabs.includes(c[0])), split: !!(w._tabChain && w._tabChain.layout === 'split' && w._tabChain.split && w._tabChain.split.pair.includes(w.id) && w._tabChain.split.pair.includes(c[0])) }; })()`;
  let lastDesk = null; // the evidence when the leg fails: the last placement read, not null
  // lane F's split door: the app joins the chat's OWN chain as the split pair's other pane (a chained tab draws inside the
  // host window, so its own element measures 0×0 — the pair IS the evidence; the PNG shows the two panes side by side)
  const dw = await until(async () => { const v = await desk.ev(WHERE(H)); lastDesk = v; return v && !v.pending && v.chain && v.split ? v : null; }, 60000, 500);
  check(`the desktop client opened it BESIDE the chat — the split pair of the chat's own chain (${dw ? `chain ${dw.chain}, split ${dw.split}, host ${dw.chat.w}×${dw.chat.h}` : 'no split'})`, !!dw, dw || lastDesk);
  const pw = await until(async () => { const v = await phone.ev(WHERE(H)); return v && !v.pending && v.app.w >= 300 ? v : null; }, 60000, 500);
  check(`the phone opened it as its OWN window (${pw ? `${pw.app.w}×${pw.app.h}` : 'none'})`, !!pw && !pw.chain, pw);
  const chip = await until(() => desk.ev(`(() => { const w = [...app.wm.windows.values()].find((x) => x._desktopAppId === ${JSON.stringify(H)}); const host = w && (w._tabChain ? app.wm.windows.get(w._tabChain.tabs[0]) : w); const el = host && host.element.querySelector('.desktop-app-chip-agent-browser'); return el ? el.textContent : null; })()`), 30000, 500);
  check(`r3 #11: the window says whose browser it is ("${chip}" — the opener's live name)`, !!rec && chip === `Agent browser (${rec.by.name})`, chip);
  await sleep(4000); // the xpra picture paints
  for (const [p, f] of [[desk, 'beside.png'], [phone, 'beside-phone.png']]) {
    const shot = await p.S('Page.captureScreenshot', { format: 'png' });
    const out = path.join(PNG_DIR || scratch('da-rung-png'), f);
    if (shot.result && shot.result.data) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64')); }
    check(`PNG ${out}`, fs.existsSync(out) && fs.statSync(out).size > 5000);
  }

  // ④b LANE e2b (design-agent-browser-v2 §E2.2): the agent PINS its Chrome at 1600×900 while the desktop client shows it in
  // the split pane (~700 px) — the X window IS 1600×900 (xwininfo), the picture is scaled to the pane, screenshot = the pin,
  // and `click --at 1500,800` lands on X's own pixel (xdotool getmouselocation)
  const sz = await cli('vibespace-window', ['size', H, '1600x900']);
  check('e2b: vibespace-window size <h> 1600x900 ⇒ pinned (the opener on its own browser)', sz.code === 0 && /pinned \S+ to 1600×900/.test(sz.out), sz);
  const pinRec = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${H}`)).json();
  check('e2b: the record\'s fact pin {w:1600, h:900} (saved + broadcast by the keeper)', pinRec && pinRec.pin && pinRec.pin.w === 1600 && pinRec.pin.h === 900, pinRec && pinRec.pin);
  const xenv = { ...baseEnv, DISPLAY: rec.display, XAUTHORITY: path.join(wt, 'data', 'desktop-apps', H, 'Xauthority') }; // the keeper's per-app auth file (desktop-serve needlesOf)
  const xsh = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { env: xenv, timeout: 10000 }, (e, out, err) => resolve({ code: e ? (e.code ?? 1) : 0, out: String(out), err: String(err) })));
  let lastTree = '';
  // r2 (the ruling): the agent HOLDS the lease (every viewer Watch) and nobody detaches — the KEEPER fits X to the pin
  const xw = await until(async () => { const t = await xsh('xwininfo', ['-root', '-children']); lastTree = t.out; const m = /^\s*(0x[0-9a-f]+) .*\s(\d+)x(\d+)\+0\+0\s/m.exec(t.out.split('\n').filter((l) => /\s1600x900\+0\+0\s/.test(l)).join('\n') + '\n'); return m ? { wid: m[1], w: +m[2], h: +m[3] } : null; }, 30000, 500);
  const xi = xw ? await xsh('xwininfo', ['-id', xw.wid]) : null;
  // r3 MEASURE: the root sampled for 8 s after the fit (r2 flapped back to a viewer's 390×769 — xpra's configure_best_screen_size)
  const firstRoot = await until(async () => { const r = await xsh('xwininfo', ['-root']); return /Width: 1600\b/.test(r.out) && /Height: 900\b/.test(r.out) ? true : null; }, 20000, 250);
  const roots = []; for (let i = 0; i < 32; i++) { const r = await xsh('xwininfo', ['-root']); const v = `${(/Width: (\d+)/.exec(r.out) || [])[1]}x${(/Height: (\d+)/.exec(r.out) || [])[1]}`; if (roots[roots.length - 1] !== v) roots.push(v); await sleep(250); }
  const mons = await xsh('xrandr', ['--listmonitors']);
  const appLog = (() => { try { return fs.readFileSync(path.join(wt, 'data', 'desktop-apps', H, 'app.log'), 'utf8').split('\n').filter((l) => /display size|screen used by|resolution|desktop size|screen size/i.test(l)).slice(-6); } catch (e) { return [`no app.log: ${e.code}`]; } })();
  console.log(`  · r3 measure: roots over 8 s ${roots.join(' → ')} · xrandr --listmonitors ${mons.out.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
  for (const l of appLog) console.log(`  · xpra: ${l.trim().slice(0, 200)}`);
  for (const l of srvLog.join('').split('\n').filter((x) => x.includes(H) && /pinned|fitted|cannot fit/.test(x)).slice(-5)) console.log(`  · server: ${l.trim().slice(0, 220)}`);
  check(`e2b r3: xpra took the pin (root 1600x900) and it HOLDS for 8 s — no flap (${roots.join(' → ')})`, !!firstRoot && roots.length === 1 && roots[0] === '1600x900', roots);
  check(`e2b r2: the agent HOLDS the lease (Watch-only viewers, no detach) and the KEEPER made the X window the pin — xwininfo ${xw ? `${xw.wid} ${(/Width: (\d+)/.exec(xi.out) || [])[1]}×${(/Height: (\d+)/.exec(xi.out) || [])[1]}` : 'none at 1600×900'}`, !!xw && /Width: 1600\b/.test(xi.out) && /Height: 900\b/.test(xi.out), lastTree.split('\n').filter((l) => /\+0\+0/.test(l)).slice(0, 6));
  const PV = `(() => { const w = [...app.wm.windows.values()].find((x) => x._desktopAppId === ${JSON.stringify(H)}); const host = w && (w._tabChain ? app.wm.windows.get(w._tabChain.tabs[0]) : w); const chip = host && host.element.querySelector('.desktop-app-chip-pin'); const st = host && host.element.querySelector('.xpra-stage'); if (!chip || !st) return null; const pr = st.parentElement.getBoundingClientRect(), sr = st.getBoundingClientRect(); return { chip: chip.textContent, transform: st.style.transform, paneW: Math.round(pr.width), paneH: Math.round(pr.height), picW: Math.round(sr.width), picH: Math.round(sr.height) }; })()`;
  let lastPv = null;
  const pv = await until(async () => { const v = await desk.ev(PV); lastPv = v; return v && v.chip && /scale\(/.test(v.transform) ? v : null; }, 30000, 500);
  check(`e2b: the desktop client's pane (${pv ? `${pv.paneW}×${pv.paneH}` : '?'}) shows the chip "${pv && pv.chip}" and SCALES the picture (${pv && pv.transform})`, !!pv && pv.chip === '1600×900 (pinned)' && pv.paneW < 1600, pv || lastPv);
  const shotFile = path.join(PNG_DIR || scratch('da-rung-png'), 'pinned-screenshot.png');
  let ss = null, dims = null;
  await until(async () => { ss = await cli('vibespace-window', ['screenshot', H, '--out', shotFile]); const png = fs.existsSync(shotFile) ? fs.readFileSync(shotFile) : null; dims = png && png.length > 24 ? [png.readUInt32BE(16), png.readUInt32BE(20)] : null; return dims && dims[0] === 1600 && dims[1] === 900 ? true : null; }, 20000, 1000);
  check(`e2b: vibespace-window screenshot = the pin (${dims ? dims.join('×') : 'no PNG'})`, ss.code === 0 && !!dims && dims[0] === 1600 && dims[1] === 900, { ss, dims });
  { const tr = await xsh('xwininfo', ['-root', '-tree']); console.log(`  · r3 measure (the screenshot): ${tr.out.split('\n').filter((l) => /\d{4}x\d{3,4}\+/.test(l)).map((l) => l.trim().replace(/\s+/g, ' ').slice(0, 110)).slice(0, 5).join(' | ')}`); }
  let lastClient = null;
  const cw = await until(async () => { const tr = await xsh('xwininfo', ['-root', '-tree']); const l = tr.out.split('\n').find((x) => /- Google Chrome"/.test(x)); const m = l && /(\d+)x(\d+)\+-?\d+\+-?\d+/.exec(l); lastClient = l ? l.trim().replace(/\s+/g, ' ').slice(0, 160) : null; return m && m[1] === '1600' && m[2] === '900' ? lastClient : null; }, 20000, 500);
  check(`e2b r3: the Chrome CLIENT inside xpra's corral is the pin too (${lastClient})`, !!cw, lastClient);
  const ck = await cli('vibespace-window', ['click', H, '--at', '1500,800']);
  const ml = await xsh('xdotool', ['getmouselocation']);
  check(`e2b: click --at 1500,800 lands on X's pixel — xdotool getmouselocation "${ml.out.trim()}"`, ck.code === 0 && /^x:1500 y:800 /.test(ml.out.trim()), { ck, ml });
  if (pv) { const shot = await desk.S('Page.captureScreenshot', { format: 'png' }); const out = path.join(PNG_DIR || scratch('da-rung-png'), 'pinned-pane.png'); if (shot.result && shot.result.data) fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64')); }
  const rootOf = async () => { const r = await xsh('xwininfo', ['-root']); return `${(/Width: (\d+)/.exec(r.out) || [])[1]}x${(/Height: (\d+)/.exec(r.out) || [])[1]}`; };
  const mainOf = async () => { const t = await xsh('xwininfo', ['-root', '-children']); return t.out.split('\n').filter((l) => /"/.test(l) && /\d+x\d+\+-?\d+\+-?\d+\s/.test(l)).map((l) => (/(\d+x\d+)\+-?\d+\+-?\d+\s/.exec(l) || [])[1]).sort((a, b) => (+b.split('x')[0] * +b.split('x')[1]) - (+a.split('x')[0] * +a.split('x')[1]))[0] || null; };
  // r2: an ACTIVE viewer's pane resize while pinned ⇒ X unchanged (the relay drops every viewer's geometry while pinned)
  const dt = await cli('vibespace-window', ['detach', H]);
  await sleep(1500);
  await desk.S('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
  await phone.S('Emulation.setDeviceMetricsOverride', { width: 360, height: 700, deviceScaleFactor: 1, mobile: true });
  await sleep(5000);
  const afterResize = { root: await rootOf(), main: await mainOf() };
  check(`e2b r2: detached (a viewer ACTIVE), both panes resized while pinned ⇒ X unchanged (root ${afterResize.root}, main ${afterResize.main})`, dt.code === 0 && afterResize.root === '1600x900' && afterResize.main === '1600x900', { dt, afterResize });
  const un = await cli('vibespace-window', ['size', H, 'auto']);
  check('e2b: size <h> auto ⇒ unpinned (the record fact removed)', un.code === 0 && /unpinned/.test(un.out) && !(await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${H}`)).json()).pin, un);
  // r2: auto ⇒ the ACTIVE viewer's geometry applies again (today's one-owner rule)
  let lastBack = null;
  const back = await until(async () => { const v = { root: await rootOf(), main: await mainOf() }; lastBack = v; return v.root !== '1600x900' && v.main && v.main !== '1600x900' ? v : null; }, 20000, 500);
  check(`e2b r2: auto ⇒ the active viewer's pane drives X again (root ${back ? back.root : '?'}, main ${back ? back.main : '?'})`, !!back, lastBack);
  await desk.S('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await phone.S('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const at2 = await cli('vibespace-window', ['attach', H]);
  check('e2b: the agent re-attaches (the e2a legs below run as before)', at2.code === 0, at2);

  // ④ D6: a second browser kept (--keep-profile), then the session ends ⇒ both stop; only the kept profile survives
  // int243 (THE E2 CHROME RACE, measured 4 of 11 runs at 1 lane): the window a `desktop-app-opened` broadcast opens asks its
  // record over HTTP while the ws carries the keeper's ready broadcast — an answer that said `launching` landing AFTER ready
  // put the window's record back to launching, and the view's ready gate (it re-read only a MISSING record) refused every
  // retry: "Starting application…" for good, no canvas on either client ⇒ every X window unmapped ⇒ window_not_visible.
  // Made deterministic: both clients hold each `launching` answer of a record GET for 4 s, so the ready broadcast lands first.
  const HOLD = `(() => { if (window.__vsF0) return 'on'; const f0 = window.__vsF0 = window.fetch.bind(window); window.__vsHeld = 0; window.fetch = async (u, o) => { const res = await f0(u, o); try { const url = String(typeof u === 'string' ? u : (u && u.url) || '').split('?')[0]; if ((!o || !o.method || o.method === 'GET') && /\\/api\\/desktop\\/apps\\/[^/]+$/.test(url)) { const j = await res.clone().json(); if (j && j.state === 'launching') { window.__vsHeld++; await new Promise((r) => setTimeout(r, 4000)); } } } catch {} return res; }; return 'on'; })()`;
  for (const pg of [desk, phone]) await pg.ev(HOLD);
  const n2 = await cli('vibespace-browser', ['new', 'Kept', '--backend', 'desktop-app', '--keep-profile', '--mode', 'pixels']);
  const H2 = (/handle (\S+)/.exec(n2.out) || [])[1];
  const rec2 = await until(async () => { const j = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps`)).json(); const a = (j.apps || []).find((x) => x.id === H2); return a && a.state === 'ready' ? a : null; }, 90000, 500);
  check(`a second desktop browser with --keep-profile (${H2})`, n2.code === 0 && !!rec2 && rec2.keepProfile === true, n2);
  // lane e2c (§E2.3): `--mode pixels` at launch ⇒ E2b's default pin 1920×1080 on the record and a screenshot of exactly
  // that size; `mode <h> auto` ⇒ the probe runs now and its answer comes back with its why
  const pngDims = (f) => { const b = fs.existsSync(f) ? fs.readFileSync(f) : null; return b && b.length > 24 && b.readUInt32BE(12) === 0x49484452 ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
  check(`e2c: --mode pixels at launch ⇒ the record's pin is 1920×1080 and the CLI prints why (${rec2 && JSON.stringify(rec2.pin)})`, !!rec2 && !!rec2.pin && rec2.pin.w === 1920 && rec2.pin.h === 1080 && /mode: pixels — pixel mode as asked, pinned to 1920x1080/.test(n2.out), { out: n2.out, pin: rec2 && rec2.pin });
  const shot2 = path.join(PNG_DIR || scratch('da-rung-png'), 'e2c-pixels-screenshot.png'); let ss2 = null, dims2 = null;
  await until(async () => { ss2 = await cli('vibespace-window', ['screenshot', H2, '--out', shot2]); dims2 = pngDims(shot2); return dims2 && dims2[0] === 1920 && dims2[1] === 1080 ? true : null; }, 90000, 3000);
  check(`e2c: vibespace-window screenshot of the --mode pixels browser is exactly 1920×1080 (${dims2 ? dims2.join('×') : 'no PNG'})`, !!dims2 && dims2[0] === 1920 && dims2[1] === 1080, { ss2, dims2 });
  // lane e2-canvas (THE SECOND E2 CHROME PATH, 4/6 at 1 and 2 lanes after the first race's fix): xpra 6.5.4 closes a connection
  // whose packet beats its threaded hello answer (server/base.py handle_invalid_packet ⇒ proto.close(), no disconnect packet ⇒
  // the viewer's 1005, every retry racing again) — the bridge's pin ask right behind the hello was that packet. On the REAL xpra:
  // neither browser's log names an invalid packet (red on f1e317418 whenever one viewer connection lost the race, even when a
  // retry won it) — every viewer of the window pinned from launch kept the connection it opened
  const invalidOf = (h) => { try { return fs.readFileSync(path.join(wt, 'data', 'desktop-apps', h, 'app.log'), 'utf8').split('\n').filter((l) => /unknown or invalid packet type/i.test(l)).map((l) => l.trim().slice(0, 160)); } catch (e) { return [`no app.log: ${e.code}`]; } };
  const inv = { [H]: invalidOf(H), [H2]: invalidOf(H2) };
  check(`e2-canvas: xpra accepted every viewer connection of both browsers — no packet beat a hello answer (${inv[H].length + inv[H2].length} invalid-packet line(s) in their xpra logs)`, !inv[H].length && !inv[H2].length, { inv, closes: srvLog.join('').split('\n').filter((x) => x.includes(H2) && /closed \(/.test(x)).map((x) => x.trim().slice(0, 200)).slice(-6) });
  // …and the state rule itself: the window that is SHOWN (desk: the split pair's active tab; phone: front) has a live view on BOTH
  const viewsOf = (pg) => pg.ev(`(() => [...app.wm.windows.values()].filter((w) => w._desktopAppId === ${JSON.stringify(H2)}).map((w) => { const v = w._desktopAppView; return { state: v ? v.state : null, canvas: !!(w.element && w.element.querySelector('canvas')) }; }))()`);
  let lastViews = null;
  const live2 = await until(async () => { const v = { desk: await viewsOf(desk), phone: await viewsOf(phone) }; lastViews = v; return v.desk.some((x) => x.state === 'connected') && v.phone.some((x) => x.state === 'connected') ? v : null; }, 20000, 500);
  check(`e2-canvas: the window pinned from launch is connected on BOTH clients — desk ${JSON.stringify(lastViews && lastViews.desk)}, phone ${JSON.stringify(lastViews && lastViews.phone)}`, !!live2, lastViews);
  if (PNG_DIR) { await sleep(2000); for (const [p, f] of [[desk, 'second-desk.png'], [phone, 'second-phone.png']]) { const shot = await p.S('Page.captureScreenshot', { format: 'png' }); if (shot.result && shot.result.data) fs.writeFileSync(path.join(PNG_DIR, f), Buffer.from(shot.result.data, 'base64')); } }
  const held = (await desk.ev('window.__vsHeld || 0')) + (await phone.ev('window.__vsHeld || 0'));
  for (const pg of [desk, phone]) await pg.ev('(() => { if (window.__vsF0) { window.fetch = window.__vsF0; delete window.__vsF0; } return true; })()');
  check(`int243: the race ran — ${held} record answer(s) saying launching were held 4 s past the keeper's ready broadcast, and the picture came up anyway (the screenshot above)`, held >= 1 && !!dims2 && dims2[0] === 1920, { held, dims2 });
  const ma = await cli('vibespace-window', ['mode', H2, 'auto']);
  check(`e2c: vibespace-window mode <h> auto ⇒ the probe's answer + why (${(ma.out || '').trim().slice(0, 160)})`, ma.code === 0 && /auto → (tree|pixels) — \S/.test(ma.out), ma);
  const n3 = await cli('vibespace-browser', ['new', 'Third', '--backend', 'desktop-app']);
  check('r3 #5/#9: a THIRD desktop browser of this conversation is refused desktop_app_cap naming its two handles', n3.code === 1 && /\[desktop_app_cap\]/.test(n3.err) && n3.err.includes(H) && n3.err.includes(H2), n3);
  // r3 #2/#6 + #0 on the REAL keeper: the agent detaches, the USER relaunches it at another scale (Scale ▸ — refused while a
  // lease exists), the successor stays the agent's; the opener re-attaches; D6 below stops the successor though it was detached
  const det = await cli('vibespace-window', ['detach', H]);
  const rl = det.code === 0 ? await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${H}/relaunch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scale: 2, dpr: 1 }) })).json() : null;
  const S1 = rl && rl.app && rl.app.id;
  const srec = S1 && await until(async () => { const j = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps`)).json(); const a = (j.apps || []).find((x) => x.id === S1); return a && a.state === 'ready' ? a : null; }, 90000, 500);
  check(`r3 #2/#6: the user's Scale ▸ relaunch keeps the agent's rung — successor ${S1}: origin agent-browser, the opener, the label`, !!srec && srec.origin === 'agent-browser' && srec.by && srec.by.sessionId === SID && srec.label === 'Rung page', srec && { origin: srec.origin, by: srec.by, label: srec.label });
  const ra = S1 ? await cli('vibespace-window', ['attach', S1]) : null;
  const gu2 = S1 ? await cli('vibespace-browser', ['--profile', S1, 'get', 'url']) : null;
  check('r3 #2/#6: the opener re-attaches to the successor and `get url` on it is still no_cdp_on_this_backend', !!ra && ra.code === 0 && !!gu2 && /no_cdp_on_this_backend/.test(gu2.err), { ra, gu2 });
  const prof1 = srec && srec.profileDir, prof2 = rec2 && rec2.profileDir;
  ws.send(JSON.stringify({ type: 'kill', sessionId: SID }));
  // r3 #3/#10: the clients have it open (viewers) ⇒ the stop waits one grace more and the showing client is told once
  const told = await until(() => desk.ev("document.body.innerText.includes('The conversation that opened this browser ended')"), 150000, 1000);
  check('r3 #3/#10: a viewer has it open ⇒ the stop waits and the showing client says so ("…ended — it closes when you leave")', !!told);
  const ended = await until(() => { const a = appsOf(); const r1 = a.find((x) => x.id === S1), r2 = a.find((x) => x.id === H2); return r1 && r2 && r1.state === 'exited' && r2.state === 'exited' ? { r1, r2 } : null; }, 240000, 1000);
  check('the session ended ⇒ BOTH of its desktop browsers stopped (why opener-ended — the detached+relaunched successor included), in words (#12)', !!ended && ended.r1.stoppedBy === 'opener-ended' && ended.r2.stoppedBy === 'opener-ended' && ended.r1.lastError === 'closed with the conversation that opened it', ended && { s1: ended.r1.stoppedBy, s2: ended.r2.stoppedBy, why: ended.r1.lastError });
  const gone = await until(() => (prof1 && !fs.existsSync(prof1) ? true : null), 30000, 500);
  check(`D6: the throwaway profile is removed (${prof1})`, !!gone && !!prof2 && fs.existsSync(prof2), { prof1: prof1 && fs.existsSync(prof1), prof2: prof2 && fs.existsSync(prof2) });
  const alive = ended ? [ended.r1, ended.r2].flatMap((r) => Object.values(r.pids || {})).filter((p) => p && fs.existsSync(`/proc/${p}`)) : ['?'];
  check('nothing of either browser is left running', !alive.length, alive);
  // ⑦ LANE e2b r2: a USER's xterm (no viewer at all) pinned 1600×900 through the user route ⇒ the KEEPER fits X; X knocked
  // off-size while VibeSpace is down; a restart's adopt restores the pin to X (the record's fact, the keeper's fit)
  const xl = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exec: 'xterm', label: 'Pinned xterm' }) })).json();
  const XT = xl && (xl.id || (xl.app && xl.app.id));
  const xtRec = XT ? await until(async () => { const a = appsOf().find((x) => x.id === XT); return a && a.state === 'ready' ? a : null; }, 90000, 500) : null;
  const pinR = XT ? await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${XT}/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ size: '1600x900' }) })).json() : null;
  check(`e2b r2: a user's xterm (${XT}) pinned 1600x900 through the user route (who: user)`, !!xtRec && !!pinR && pinR.pin && pinR.pin.w === 1600, { xl, pinR });
  const xtEnv = xtRec ? { ...baseEnv, DISPLAY: xtRec.display, XAUTHORITY: path.join(wt, 'data', 'desktop-apps', XT, 'Xauthority') } : baseEnv;
  const xx = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { env: xtEnv, timeout: 10000 }, (e, out) => resolve({ code: e ? (e.code ?? 1) : 0, out: String(out) })));
  const xtGeom = async () => { const r = await xx('xwininfo', ['-root']); const t = await xx('xwininfo', ['-root', '-children']); const big = t.out.split('\n').filter((l) => /"/.test(l)).map((l) => /^\s*(0x[0-9a-f]+) .*?(\d+)x(\d+)\+(-?\d+)\+(-?\d+)\s/.exec(l)).filter(Boolean).sort((a, b) => b[2] * b[3] - a[2] * a[3])[0]; return { root: `${(/Width: (\d+)/.exec(r.out) || [])[1]}x${(/Height: (\d+)/.exec(r.out) || [])[1]}`, wid: big ? big[1] : null, main: big ? `${big[2]}x${big[3]}+${big[4]}+${big[5]}` : null }; };
  let lastXt = null;
  const xtFit = await until(async () => { const g = await xtGeom(); lastXt = g; return g.main && /^1600x900\+0\+0$/.test(g.main) ? g : null; }, 30000, 500);
  check(`e2b r3: NO viewer — the keeper fitted the xterm to the pin (xwininfo: root ${lastXt && lastXt.root}, xterm ${lastXt && lastXt.main})`, !!xtFit, lastXt);
  try { process.kill(-srv.pid, 'SIGTERM'); } catch { }
  await until(() => (srv.exitCode !== null || srv.signalCode ? true : null), 20000, 200);
  for (const l of srvLog.join('').split('\n').filter((x) => XT && x.includes(XT) && /pinned|fitted|cannot fit/.test(x)).slice(-5)) console.log(`  · server (xterm): ${l.trim().slice(0, 220)}`);
  if (xtFit) await xx('xdotool', ['windowsize', xtFit.wid, '700', '500']); // r3: the window knocked off-size while VibeSpace is down (the root is xpra's)
  const knocked = await xtGeom();
  const srv2 = spawn(DBUS, ['--', process.execPath, 'server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  srv2.stdout.on('data', (d) => srvLog.push(String(d))); srv2.stderr.on('data', (d) => srvLog.push(String(d)));
  process.on('exit', () => { try { process.kill(-srv2.pid, 'SIGKILL'); } catch { } });
  await until(async () => { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { return null; } }, 120000, 250);
  let lastRe = null;
  const restored = await until(async () => { const g = await xtGeom(); lastRe = g; return g.main && /^1600x900\+0\+0$/.test(g.main) ? g : null; }, 60000, 500);
  check(`e2b r3: a RESTART restores the pin to X (xterm knocked to ${knocked.main} while down ⇒ xwininfo after the restart: xterm ${lastRe && lastRe.main}, root ${lastRe && lastRe.root})`, !!restored && knocked.main && !/^1600x900/.test(knocked.main), { knocked, lastRe });
  try { await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${XT}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch { }
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
