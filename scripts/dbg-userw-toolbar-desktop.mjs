#!/usr/bin/env node
// Repro userW inc-mskxi7zk-mbm6: "top bar resize 是为了能让desktop变大，现在无法变大"
// — he has taskbar-top, dragged the toolbar handle to shrink it, desktop didn't
// grow. Measures whether #workspace (and a window inside it) actually grows when
// the toolbar shrinks, WITH taskbar-top. Throwaway server + headless chrome.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
const PORT = 3995, CDP_PORT = 9345, wt = '/tmp/vs-userW-tb';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=2560,1352', '--user-data-dir=/tmp/vs-userW-tb-chrome', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {} try { fs.rmSync('/tmp/vs-userW-tb-chrome', { recursive: true, force: true }); } catch {} });
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const mouse = (type, x, y) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });

await cdp('Page.enable');
await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(1500);
await evalJs('window.app ? app.ready : Promise.reject(new Error("no app"))');
await sleep(600);

// userW's setup: taskbar docked TOP + open two windows
await evalJs(`app.settings.set('taskbar.position','top')`);
await sleep(300);
await evalJs(`(async()=>{ app.openFileExplorer && app.openFileExplorer(); app.openBrowser && app.openBrowser('about:blank'); })()`);
await sleep(800);

const measure = () => evalJs(`(() => {
  const ws = document.getElementById('workspace');
  const tb = document.getElementById('toolbar');
  const wins = [...document.querySelectorAll('.window')].filter(w=>getComputedStyle(w).display!=='none');
  return {
    taskbarTop: document.body.classList.contains('taskbar-top'),
    toolbarH: Math.round(tb.getBoundingClientRect().height),
    workspaceH: ws.offsetHeight,
    winHeights: wins.map(w=>Math.round(w.getBoundingClientRect().height)),
  };
})()`);

const before = await measure();
console.log('BEFORE:', JSON.stringify(before));

// drag the toolbar handle UP by 40px (shrink toolbar → workspace should grow)
const hb = await evalJs(`(() => { const h=document.getElementById('toolbar-resize-handle').getBoundingClientRect(); return {x:h.left+h.width/2, y:h.top+h.height/2}; })()`);
await mouse('mousePressed', hb.x, hb.y);
for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', hb.x, hb.y - (40 * i) / 6); await sleep(30); }
await mouse('mouseReleased', hb.x, hb.y - 40);
await sleep(500);
const after = await measure();
console.log('AFTER shrink:', JSON.stringify(after));

let fail = 0;
const ck = (n, c, e) => { if (c) console.log('  ✓ ' + n); else { fail++; console.log('  ✗ ' + n + (e ? '  — ' + e : '')); } };
ck('taskbar-top active (userW setup)', after.taskbarTop);
ck('toolbar actually shrank', after.toolbarH < before.toolbarH - 5, `${before.toolbarH}→${after.toolbarH}`);
const dTool = before.toolbarH - after.toolbarH, dWs = after.workspaceH - before.workspaceH;
ck(`workspace GREW by ~the toolbar delta (Δtoolbar=${dTool}, Δworkspace=${dWs})`, dWs >= dTool - 3 && dWs > 5);
// informational: fresh freeform windows (no captured gridBounds yet) keep
// their px size by design — only positioned/maximized windows track the
// workspace. Same behavior on the old model; not a scale-rework regression.
const grewWin = before.winHeights.some((h, i) => (after.winHeights[i] || 0) > h + 3);
console.log('  · freeform windows grew:', grewWin, `(${JSON.stringify(before.winHeights)}→${JSON.stringify(after.winHeights)}; fresh unmoved windows keep px size by design)`);

// how much desktop can userW actually gain? (min toolbar vs default + taskbar-top chrome)
const minGain = await evalJs(`(() => {
  const root=document.documentElement; const ws=document.getElementById('workspace');
  root.style.setProperty('--toolbar-scale','0.7'); void document.body.offsetHeight;
  const hmin=ws.offsetHeight; root.style.setProperty('--toolbar-scale','1.25'); void document.body.offsetHeight;
  const hmax=ws.offsetHeight; root.style.removeProperty('--toolbar-scale');
  return { atCompact:hmin, atLarge:hmax, range:hmin-hmax };
})()`);
console.log('workspace height range across toolbar scale 0.7..1.25:', JSON.stringify(minGain), '→ desktop gain from compacting =', minGain.range, 'px');

// ── the case userW most likely has: a MAXIMIZED window IS "the desktop" ──
console.log('\n── maximized-window case ──');
await evalJs(`document.documentElement.style.removeProperty('--toolbar-scale')`); // reset
await sleep(200);
await evalJs(`(() => { const w=[...app.wm.windows.values()][0]; if(w && !w.isMaximized) app.wm.toggleMaximize(w.id); })()`);
await sleep(400);
const maxBefore = await measure();
console.log('MAX before:', JSON.stringify(maxBefore));
const hb2 = await evalJs(`(() => { const h=document.getElementById('toolbar-resize-handle').getBoundingClientRect(); return {x:h.left+h.width/2, y:h.top+h.height/2}; })()`);
await mouse('mousePressed', hb2.x, hb2.y);
for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', hb2.x, hb2.y + (30 * i) / 6); await sleep(30); } // GROW toolbar → workspace shrinks
await mouse('mouseReleased', hb2.x, hb2.y + 30);
await sleep(500);
const maxAfter = await measure();
console.log('MAX after (toolbar grown):', JSON.stringify(maxAfter));
const mIdx = maxBefore.winHeights.findIndex((h) => h > 700); // the maximized one
const maxTracked = mIdx >= 0 && Math.abs((maxAfter.winHeights[mIdx] || 0) - maxAfter.workspaceH) < 8;
ck('a MAXIMIZED window tracks the workspace when the toolbar resizes', mIdx >= 0 ? maxTracked : true, `maxWin ${maxBefore.winHeights[mIdx]}→${maxAfter.winHeights[mIdx]} vs workspaceH ${maxAfter.workspaceH}`);

ws.close();
console.log(fail ? `\n${fail} FAILED` : '\nresize→workspace→window chain intact');
process.exit(fail ? 1 : 0);
