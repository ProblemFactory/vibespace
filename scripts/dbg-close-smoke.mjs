#!/usr/bin/env node
// DEBUG: can windows be closed? Runs a throwaway server from a given checkout
// (arg 1, default /tmp/vs-cleanbuild) + headless chrome, opens windows, closes
// them through the REAL title-bar close button, asserts they are gone.
// Covers: plain desktop, stage enabled, on-stage, after stage leave.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const wt = process.argv[2] || '/tmp/vs-cleanbuild';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find((p) => fs.existsSync(p));
const PORT = 3988, CDP_PORT = 9338;
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--disable-background-timer-throttling', '--user-data-dir=/tmp/vs-close-smoke-chrome', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try {
    for (const s of fs.readdirSync(path.join(wt, 'data', 'sockets'))) { try { execSync(`pkill -f ${JSON.stringify(path.join(wt, 'data', 'sockets', s))}`); } catch {} }
  } catch {}
  try { fs.rmSync('/tmp/vs-close-smoke-chrome', { recursive: true, force: true }); } catch {}
  try { fs.rmSync(path.join(wt, 'data'), { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(1500);
  await evalJs('window.app ? app.ready : Promise.reject(new Error("no app"))');

  const openExplorer = async () => {
    const before = await evalJs('app.wm.windows.size');
    await evalJs('(app.openFileExplorer(), true)');
    for (let i = 0; i < 20; i++) { if (await evalJs('app.wm.windows.size') > before) break; await sleep(200); }
    return evalJs(`[...app.wm.windows.keys()].pop()`);
  };
  const closeViaButton = async (id) => evalJs(`(() => {
    const w = app.wm.windows.get(${JSON.stringify(id)});
    if (!w) return 'no-window';
    const btn = w.element.querySelector('.window-close, .win-btn-close, [data-act="close"], .window-controls button:last-child, .title-btn-close');
    if (!btn) return 'no-close-button:' + (w.element.querySelector('.window-titlebar, .title-bar')?.innerHTML || '').slice(0, 200);
    btn.click(); return 'clicked';
  })()`);
  const winGone = async (id) => {
    for (let i = 0; i < 15; i++) {
      const gone = await evalJs(`!app.wm.windows.has(${JSON.stringify(id)}) && !document.querySelector('[data-win-id=${JSON.stringify(id)}]')`);
      const inMap = await evalJs(`!app.wm.windows.has(${JSON.stringify(id)})`);
      if (inMap) return true;
      await sleep(200);
    }
    return false;
  };

  // 1. plain close, stage DISABLED
  let id = await openExplorer();
  let r = await closeViaButton(id);
  check('plain: close button found+clicked', r === 'clicked', r);
  check('plain: window actually closes', await winGone(id));

  // 2. stage ENABLED (not active)
  await evalJs(`(app.settings.set('desktop.dynamicEnabled', true), true)`);
  await sleep(500);
  id = await openExplorer();
  r = await closeViaButton(id);
  check('stage-enabled: close clicked', r === 'clicked', r);
  check('stage-enabled: window closes', await winGone(id));

  // 3. ON the stage
  await evalJs('(app.stage.enter(), true)');
  await sleep(500);
  id = await openExplorer();  // aux window on stage
  r = await closeViaButton(id);
  check('on-stage: close clicked', r === 'clicked', r);
  check('on-stage: window closes', await winGone(id));

  // 4. after leaving the stage
  const deskId = await evalJs('app.desktopManager.desktops[0].id');
  await evalJs(`(app.stage.leave(${JSON.stringify(deskId)}), true)`);
  await sleep(800);
  id = await openExplorer();
  r = await closeViaButton(id);
  check('post-leave: close clicked', r === 'clicked', r);
  check('post-leave: window closes', await winGone(id));

  // 5. THE 2.151.1 resurrect repro: window recorded in _savedStates via a
  // desktop round-trip, THEN closed, then another round-trip — merge-preserve
  // must NOT bring it back (it can't tell "closed" from "not materialized";
  // the purgeClosedWindow hook is what keeps this dead).
  const dA = await evalJs('app.desktopManager.activeDesktopId');
  const dB = await evalJs('app.desktopManager.createDesktop("B")');
  id = await openExplorer(); // on A
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(dB)})`); await sleep(1400);
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(dA)})`); await sleep(1400);
  check('round-trip: window still present while open', await evalJs(`app.wm.windows.has(${JSON.stringify(id)})`));
  r = await closeViaButton(id);
  check('resurrect repro: closed on home desktop', r === 'clicked' && await winGone(id), r);
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(dB)})`); await sleep(1400);
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(dA)})`); await sleep(1800);
  const resurrected = await evalJs(`app.wm.windows.has(${JSON.stringify(id)}) || !![...app.wm.windows.values()].find(w => w.type === 'files')`);
  check('CLOSED window does NOT resurrect after desktop round-trip', !resurrected);
  const inSaved = await evalJs(`(() => { const st = app.desktopManager._savedStates.get(${JSON.stringify(dA)}); return !!(st && st.windows || []).length && st.windows.some((w) => (w.winId || w.id) === ${JSON.stringify(id)}); })()`);
  check('closed window purged from _savedStates', !inSaved);

  // 6. page errors collected?
  const errs = await evalJs('(window.__errs || []).slice(0, 5)');
  check('no page errors during closes', !errs || !errs.length, JSON.stringify(errs));
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.message);
} finally { try { ws.close(); } catch {} }

console.log(failed ? `\n${failed} FAILED` : '\nclose smoke passed');
process.exit(failed ? 1 : 0);
