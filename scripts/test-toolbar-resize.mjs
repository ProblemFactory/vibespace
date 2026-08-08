#!/usr/bin/env node
// Toolbar-resize persistence smoke (2.252.1 — the 2.250.1 snap-back rootfix).
// The bug: cssDefault()/def read the COMPUTED --toolbar-height, which the drag
// (and any saved override) itself sets — so the "within 2px of default ⇒
// reset" check compared the dragged height against ITSELF and reset on every
// mouseup / restore-apply. This smoke drives a REAL drag via CDP mouse events
// and asserts the height survives mouseup, reload, and a same-value re-apply.
// Throwaway server in a git worktree + headless chrome (test-sidebar-rail
// harness pattern). Run: node scripts/test-toolbar-resize.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const PORT = 3989, CDP_PORT = 9339;
const wt = '/tmp/vs-tbresize-smoke';
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--disable-background-timer-throttling', '--user-data-dir=/tmp/vs-tbresize-chrome', 'about:blank'], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync('/tmp/vs-tbresize-chrome', { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { await sleep(250); }
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
const mouse = (type, x, y) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
const toolbarH = () => evalJs(`document.getElementById('toolbar').offsetHeight`);
// A REAL drag on the handle: press, move in steps (rAF-coalesced handlers need
// real successive events), release.
const dragHandle = async (dy) => {
  const r = await evalJs(`(() => { const h = document.getElementById('toolbar-resize-handle').getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2 }; })()`);
  await mouse('mousePressed', r.x, r.y);
  for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', r.x, r.y + (dy * i) / 6); await sleep(30); }
  await mouse('mouseReleased', r.x, r.y + dy);
  await sleep(200);
};

try {
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(1500);
  await evalJs('window.app ? app.ready : Promise.reject(new Error("no app"))');
  await sleep(500);

  const h0 = await toolbarH();
  check('handle exists', await evalJs(`!!document.getElementById('toolbar-resize-handle')`));

  // THE reported bug: drag down 24px → height must STAY after mouseup
  await dragHandle(24);
  const h1 = await toolbarH();
  check(`drag +24px sticks after mouseup (${h0} → ${h1})`, Math.abs(h1 - (h0 + 24)) <= 2 && h1 > h0 + 15);
  check('override persisted to localStorage', await evalJs(`parseInt(localStorage.getItem('toolbarHeight')) > ${h0 + 15}`));
  check('CSS var carries the override', await evalJs(`document.documentElement.style.getPropertyValue('--toolbar-height') !== ''`));

  // second flaw site: re-applying the SAME height with the override active
  // (restore / layout-sync echo) must be a no-op, not a reset
  await evalJs(`app.layoutManager._applyToolbarHeight(${h1})`);
  await sleep(100);
  check('re-applying the same height does not reset (restore/sync path)', (await toolbarH()) === h1);

  // survives a reload. Wait out the layout autosave debounce (2s) first —
  // reloading INSIDE it replays the stale pre-drag state (default height),
  // which is the normal loss window every layout property has, not this bug.
  await sleep(2800);
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(1500);
  await evalJs('app.ready');
  await sleep(500);
  const hR = await toolbarH();
  check('height survives reload', Math.abs(hR - h1) <= 2);

  // theme switch must NOT wipe the override (the 2.252.1 third leg:
  // ThemeManager.apply's _clearInlineOverrides swept every inline --* var,
  // killing the height at boot and on every theme change)
  await evalJs(`app.themeManager.apply('nord')`);
  await sleep(200);
  check('theme switch keeps the resized height', (await toolbarH()) === h1);
  await evalJs(`app.themeManager.apply('dark')`);

  // the intended reset semantics still work: dblclick → default
  await evalJs(`document.getElementById('toolbar-resize-handle').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await sleep(200);
  check(`dblclick resets to default (${h0})`, (await toolbarH()) === h0);
  check('reset cleared localStorage', await evalJs(`localStorage.getItem('toolbarHeight') === null`));

  // dragging back to ~default also resets (the within-2px rule, now against
  // the TRUE stylesheet default)
  await dragHandle(30);
  await dragHandle(-30);
  check('drag back to default clears the override', await evalJs(`localStorage.getItem('toolbarHeight') === null && document.documentElement.style.getPropertyValue('--toolbar-height') === ''`));
} catch (e) {
  failed++;
  console.error('  ✗ harness error: ' + e.message);
}

ws.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS (10)');
process.exit(failed ? 1 : 0);
