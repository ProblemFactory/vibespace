#!/usr/bin/env node
// Toast pass-through (B-a42d, lane toast-pass-through, 2026-10-09): a toast never takes a tap meant for what is under
// it. Found by lane xpra-suite-evidence: on a 320 px phone the 3 s "Copied to your clipboard" toast sat over keys
// 5/6/2/3 of the app picture and took the taps — the WHOLE toast was a hit target while only its ✕ and its actions
// have handlers. Now the body passes the pointer through; the ✕, the actions and a toast's own tap target
// (.global-toast-tap — the For-you arrival toast's words, which open the item) keep it.
// A THROWAWAY server in a git worktree + headless chrome (scratch profile, private HOME and XDG_RUNTIME_DIR, no DISPLAY)
// over raw CDP. The page is the real app with the real style.css; the toast is the real showToast (src/lib/utils.js,
// bundled by esbuild into the page — the app keeps no global handle on it); a fixed pointer-counting pane stands in for
// the app picture under the toast. Profiles: 320×640 DSF 1 (mouse), 320×640 phone (DSF 2, touch, hover:none,
// pointer:coarse), 1280×800 desktop (mouse). Legs per profile:
//   (a) a 4 s toast SHOWS (in the viewport, opaque, user-select none) and a tap on its body lands on the pane
//       (elementFromPoint = the pane, its listener fires once, the toast stays)
//   (b) a tap on ✕ closes the toast — the pane hears nothing
//   (c) a toast with an action: a tap on the button runs it ONCE and closes the toast; the same point afterwards is the pane
//   (d) a toast whose body is its own tap target (.global-toast-tap, the For-you shape): the body runs the toast's
//       handler, its padding passes through to the pane
//   (e) desktop: the ✕ still matches :hover under the mouse
// CONTROL: a patched copy of style.css with `.global-toast { pointer-events: auto }` restored ⇒ the body tap is
// swallowed (elementFromPoint = the toast, the pane hears nothing). `--shots <dir>` writes phone-before.png (the
// control) and phone-after.png (the fix) at 320 px. Requires google-chrome (SKIP without).
// Run: node scripts/test-toast-pass-through.mjs [--shots <dir>]
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? path.resolve(process.argv[i + 1]) : null; })();

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('toast-pass-wt');
const fakeHome = scratchHome('toast-pass-home', fs);
const RUNTIME = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-toast-pass-rt-'));
fs.chmodSync(RUNTIME, 0o700);
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chromeEnv = { ...process.env, HOME: fakeHome, XDG_RUNTIME_DIR: RUNTIME };
delete chromeEnv.DISPLAY; delete chromeEnv.WAYLAND_DISPLAY; delete chromeEnv.DBUS_SESSION_BUS_ADDRESS;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore', env: chromeEnv });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { endRootedProcesses(wt); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [`${wt}-chrome`, fakeHome, RUNTIME]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
let up = false;
for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${PORT}/api/home`)).status > 0; } catch { await sleep(250); } }
if (!up) { console.error('✗ the worktree server never answered'); process.exit(1); }

// the real showToast, bundled from the copy's src (the page's own bundle keeps no handle on it)
const PROBE = (await require('esbuild').build({ stdin: { contents: "export { showToast } from './src/lib/utils.js';", resolveDir: wt, loader: 'js' },
  bundle: true, format: 'iife', globalName: '__toastProbe', write: false, logLevel: 'silent' })).outputFiles[0].text;

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map();
sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(200); } return evalJs(expr); };
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'en'); } catch {}" });

// the pane under the toast: counts pointer downs + clicks, says its count, marks the last tap point
const PANE = `(() => {
  const p = document.createElement('div'); p.id = 'tp-pane';
  Object.assign(p.style, { position: 'fixed', inset: '0', zIndex: '99999', background: '#203040', color: '#cfe', font: '18px sans-serif', padding: '24px 12px', boxSizing: 'border-box' });
  window.__pane = { down: 0, click: 0 };
  const say = () => { p.textContent = 'app pane — taps heard: ' + window.__pane.click; };
  p.addEventListener('pointerdown', () => { window.__pane.down++; });
  p.addEventListener('click', (e) => { window.__pane.click++; say(); const d = document.createElement('div'); Object.assign(d.style, { position: 'fixed', left: (e.clientX - 6) + 'px', top: (e.clientY - 6) + 'px', width: '12px', height: '12px', borderRadius: '6px', background: '#f50', zIndex: '99999' }); p.appendChild(d); });
  say(); document.body.appendChild(p); return true;
})()`;
const atPoint = (sel) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
const hitIs = (pt) => `(() => { const h = document.elementFromPoint(${pt.x}, ${pt.y}); return !h ? 'none' : h.closest('#tp-pane') ? 'pane' : h.closest('.global-toast-x') ? 'x' : h.closest('.global-toast-action') ? 'action' : h.closest('.global-toast-tap') ? 'tap' : h.closest('.global-toast') ? 'toast' : [h, h.parentElement, h.parentElement?.parentElement].filter(Boolean).map((e) => e.tagName + '#' + e.id + '.' + String(e.className).slice(0, 40) + '@z' + getComputedStyle(e).zIndex).join(' < '); })()`;
let touch = false;
const tap = async (pt) => {
  if (touch) {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y, radiusX: 1, radiusY: 1 }] });
    await sleep(40);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(40);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  }
  await sleep(150);
};
const pane = () => evalJs('window.__pane.click');
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64')); };

const STYLE_LINK = JSON.stringify('link[rel="stylesheet"][href^="/style.css"]');   // the server stamps a ?v= on it
const boot = async (p, { patchCss = false } = {}) => {
  touch = !!p.touch;
  await cdp('Emulation.setDeviceMetricsOverride', { width: p.w, height: p.h, deviceScaleFactor: p.dsf, mobile: !!p.touch });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: !!p.touch, maxTouchPoints: p.touch ? 5 : 1 });
  await cdp('Emulation.setEmulatedMedia', { features: p.touch ? [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] : [] });
  await cdp('Emulation.setUserAgentOverride', { userAgent: p.touch ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : '' });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(500);
  check(`[${p.name}] the app boots (its splash gone — it covers everything until app.ready)`, await waitFor(`!!window.app && document.readyState === 'complete' && !document.getElementById('loading-screen') && !!document.querySelector(${STYLE_LINK})`));
  if (patchCss) {
    // the PATCHED COPY: style.css with the pre-fix rule — the whole toast a hit target again
    const n = await evalJs(`(async () => {
      const l = document.querySelector(${STYLE_LINK}), css = await (await fetch(l.href)).text();
      const parts = css.split('font-size: 12px; line-height: 1.4; pointer-events: none;');
      if (parts.length !== 2) return parts.length - 1;
      const s = document.createElement('style'); s.textContent = parts.join('font-size: 12px; line-height: 1.4; pointer-events: auto;');
      l.replaceWith(s); return 1;
    })()`);
    check(`[${p.name}] CONTROL setup: the patched copy restores exactly ONE rule (.global-toast { pointer-events: auto })`, n === 1, n);
  }
  await evalJs(PROBE + '; true');
  await evalJs(PANE);
  return evalJs(`typeof window.__toastProbe?.showToast === 'function'`);
};

const legs = async (p) => {
  check(`[${p.name}] the real showToast is in the page`, await boot(p));
  // (a) body tap ⇒ the pane
  await evalJs(`window.__t = window.__toastProbe.showToast('Copied to your clipboard', { duration: 4000 }); true`);
  await sleep(300);
  const shown = await evalJs(`(() => { const el = window.__t, r = el.getBoundingClientRect(), cs = getComputedStyle(el), b = el.querySelector('.global-toast-body');
    return { inView: r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, opacity: +cs.opacity, vis: cs.visibility, sel: getComputedStyle(b).userSelect, pe: cs.pointerEvents, x: getComputedStyle(el.querySelector('.global-toast-x')).pointerEvents }; })()`);
  check(`[${p.name}] (a) the toast SHOWS as before: in the viewport, opaque, visible, its words unselectable; the box passes the pointer, the ✕ keeps it`, shown.inView && shown.opacity === 1 && shown.vis === 'visible' && shown.sel === 'none' && shown.pe === 'none' && shown.x === 'auto', shown);
  const body = await evalJs(atPoint('#global-toasts .global-toast-body'));
  const before = await pane();
  check(`[${p.name}] (a) under the toast's body the hit target is the pane`, (await evalJs(hitIs(body))) === 'pane', await evalJs(hitIs(body)));
  await tap(body);
  const a = { click: (await pane()) - before, down: await evalJs('window.__pane.down'), alive: await evalJs('window.__t.isConnected') };
  check(`[${p.name}] (a) a tap on the toast's body reaches the pane once; the toast stays`, a.click === 1 && a.down >= 1 && a.alive, a);
  if (p.name === 'phone') await shot('phone-after.png');
  // (e) desktop hover on ✕
  const x = await evalJs(atPoint('#global-toasts .global-toast-x'));
  if (!touch) {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x.x, y: x.y });
    await sleep(100);
    check(`[${p.name}] (e) the ✕ still takes the hover`, await evalJs(`document.querySelector('#global-toasts .global-toast-x').matches(':hover')`));
  }
  // (b) ✕ closes, the pane hears nothing
  const b0 = await pane();
  check(`[${p.name}] (b) the ✕ is the hit target at its point`, (await evalJs(hitIs(x))) === 'x', await evalJs(hitIs(x)));
  await tap(x);
  check(`[${p.name}] (b) a tap on ✕ closes the toast; the pane hears nothing`, !(await evalJs('window.__t.isConnected')) && (await pane()) === b0, { pane: (await pane()) - b0 });
  // (c) an action runs once and closes
  await evalJs(`window.__ran = 0; window.__t = window.__toastProbe.showToast('Grouped as tabs', { duration: 4000, action: { label: 'Show side by side', run: () => { window.__ran++; } } }); true`);
  await sleep(300);
  const act = await evalJs(atPoint('#global-toasts .global-toast-action'));
  const c0 = await pane();
  check(`[${p.name}] (c) the action button is the hit target at its point`, (await evalJs(hitIs(act))) === 'action', await evalJs(hitIs(act)));
  await tap(act);
  const c = { ran: await evalJs('window.__ran'), alive: await evalJs('window.__t.isConnected'), pane: (await pane()) - c0 };
  check(`[${p.name}] (c) a tap on the action runs it once and closes the toast; the pane hears nothing`, c.ran === 1 && !c.alive && c.pane === 0, c);
  await tap(act);
  check(`[${p.name}] (c) the same point with the toast gone is the pane (the action never runs twice)`, (await pane()) - c0 === 1 && (await evalJs('window.__ran')) === 1);
  // (d) the For-you shape: the body is the toast's own tap target, its padding passes through
  await evalJs(`window.__jumped = 0; window.__t = window.__toastProbe.showToast('Added to For you · lane: Approve the plan', { duration: 4000 });
    window.__t.querySelector('.global-toast-body').classList.add('global-toast-tap'); window.__t.style.cursor = 'pointer'; window.__t.onclick = () => { window.__jumped++; }; true`);
  await sleep(300);
  const tb = await evalJs(atPoint('#global-toasts .global-toast-tap'));
  const pad = await evalJs(`(() => { const r = window.__t.getBoundingClientRect(); return { x: r.left + 7, y: r.top + r.height / 2 }; })()`);
  const d0 = await pane();
  check(`[${p.name}] (d) a toast's own tap target (.global-toast-tap) is the hit target; its padding is the pane`, (await evalJs(hitIs(tb))) === 'tap' && (await evalJs(hitIs(pad))) === 'pane', { body: await evalJs(hitIs(tb)), pad: await evalJs(hitIs(pad)) });
  await tap(tb);
  check(`[${p.name}] (d) a tap on its words runs the toast's handler; the pane hears nothing`, (await evalJs('window.__jumped')) === 1 && (await pane()) === d0, { jumped: await evalJs('window.__jumped'), pane: (await pane()) - d0 });
  await tap(pad);
  check(`[${p.name}] (d) a tap on its padding reaches the pane`, (await pane()) - d0 === 1 && (await evalJs('window.__jumped')) === 1);
  await evalJs(`document.getElementById('global-toasts')?.remove(); true`);
};

const PROFILES = [
  { name: 'phone-dsf1', w: 320, h: 640, dsf: 1 },
  { name: 'phone', w: 320, h: 640, dsf: 2, touch: true },
  { name: 'desktop', w: 1280, h: 800, dsf: 1 },
];
try {
  for (const p of PROFILES) await legs(p);
  // CONTROL: the pre-fix rule restored ⇒ the body tap is swallowed
  const p = PROFILES[1];
  check(`[${p.name}] CONTROL: the real showToast is in the page`, await boot(p, { patchCss: true }));
  await evalJs(`window.__t = window.__toastProbe.showToast('Copied to your clipboard', { duration: 4000 }); true`);
  await sleep(300);
  const body = await evalJs(atPoint('#global-toasts .global-toast-body'));
  const hit = await evalJs(hitIs(body));
  await tap(body);
  const heard = await pane();
  await shot('phone-before.png');
  check(`[${p.name}] CONTROL: with .global-toast { pointer-events: auto } the toast takes the tap — the pane hears nothing (the pre-fix red)`, hit === 'toast' && heard === 0, { hit, heard });
} catch (e) { failed++; console.error('✗ threw:', e && e.stack || e); }
try { sock.close(); } catch {}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
