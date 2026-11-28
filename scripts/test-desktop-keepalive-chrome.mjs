#!/usr/bin/env node
// lane desktop-keepalive K4 — THE REAL LEG (heavy: chrome + a worktree server + the REAL Xvnc singleton Desktop).
// userW inc-muoshmqn-dect: the Desktop stream cut "no pong for 40000 ms" over and over, and two Paste presses said
// nothing. ① the Desktop window's tab goes to the BACKGROUND for 90 s (another tab activated; Chrome's own timer
// throttling ON — no --disable-background-timer-throttling) ⇒ the stream is still connected and the bridge logged no
// "no pong" close: the keepalive is a protocol ping the browser answers by itself. ② the VNC server is killed (the
// stream drops, the ladder reconnects through the start gate) and Paste is pressed WHILE it reconnects ⇒ the press is
// said ("reconnecting — your text is pasted when it is back") and the queued text reaches the desktop's clipboard
// (read back from the X server with xclip) once the stream is back. ③ (B-2a93's follow-up) a SECOND drop with a text
// PLANTED in the clipboard: the press pastes THAT text (no box), queued, and it lands once the stream is back.
// Per-run singleton display + port (scratch.mjs vncEnv — never the machine-global :7/5901, test-architecture §57).
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, CHROME_STORE, CHROME_QUIET } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const has = (b) => (process.env.PATH || '').split(':').some((p) => { try { return fs.statSync(path.join(p, b)).isFile(); } catch { return false; } });
const skipWhy = !CHROME ? 'no chrome/chromium' : !has('Xvnc') ? 'Xvnc not on PATH' : !has('xclip') ? 'xclip not on PATH (the paste read-back)' : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
const HIDDEN_MS = Number(process.env.DKP_HIDDEN_MS || 90000);

const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('dkp-wt');
const home = scratchHome('dkp-home', fs);
let failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'scripts']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
try { execSync('npm run build:bundles', { cwd: wt, stdio: 'pipe' }); } catch (e) { console.error(String(e.stdout || '').split('\n').filter((l) => /✗|FAIL|rror/.test(l)).slice(0, 8).join('\n')); throw e; }
const logFile = path.join(wt, 'server.log');
const srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1', NO_AUTO_UPDATE: '1' };
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', fs.openSync(logFile, 'w'), fs.openSync(logFile, 'a')] });
// chrome WITH its own background throttling (the point of ①)
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1400,900', `--user-data-dir=${scratch('dkp-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const VNC_DISPLAY = VNC_ENV.VIBESPACE_VNC_DISPLAY, VNC_PORT = VNC_ENV.VIBESPACE_VNC_PORT;
const ourXvnc = () => fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number).filter((pid) => {
  try { const a = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); return /^X(tiger)?vnc$/.test(path.basename(a[0])) && a.includes(VNC_DISPLAY) && a[a.indexOf('-rfbport') + 1] === VNC_PORT; } catch { return false; }
});
const cleanup = () => {
  try { srv.kill('SIGTERM'); } catch { } try { chrome.kill('SIGKILL'); } catch { }
  for (const pid of ourXvnc()) { try { process.kill(pid, 'SIGKILL'); } catch { } }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  try { fs.rmSync(wt, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(scratch('dkp-chrome'), { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup); process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));

const WebSocket = require('ws');
const ok = await until(async () => { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { return null; } }, 30000, 250);
check('the worktree server boots', !!ok);
const targets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
async function page(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
  await cdp('Page.enable');
  return { cdp, evalJs, close: () => { try { ws.close(); } catch { } } };
}
const t0 = await until(async () => (await targets()).find((t) => t.type === 'page'), 20000, 250);
const A = await page(t0);
await A.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await A.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await until(() => A.evalJs('!!(window.app && app.wm)'), 20000, 300);
await sleep(5500); // layout.js's 5 s restore hold
await A.evalJs('app.openDesktop(); true');
const state = () => A.evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x._isDesktop); const st = w && w.content.querySelector('.desktop-status'); return { status: st ? st.textContent : null, hidden: document.visibilityState }; })()`);
const connected = await until(async () => { const s = await state(); return s && s.status === 'Connected' ? s : null; }, 40000, 500);
check('the Desktop window connects to the real Xvnc singleton', !!connected, await state());

// ① the tab in the BACKGROUND for HIDDEN_MS
const B = await (async () => { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }); return r.json(); })();
await fetch(`http://127.0.0.1:${CDP_PORT}/json/activate/${B.id}`);
const hiddenNow = await until(async () => { const s = await state(); return s && s.hidden === 'hidden' ? s : null; }, 10000, 250);
check('the Desktop tab really is in the background (document.visibilityState = hidden)', !!hiddenNow, await state());
const logBefore = fs.readFileSync(logFile, 'utf8').length;
await sleep(HIDDEN_MS);
const afterHidden = await state();
const cutLines = fs.readFileSync(logFile, 'utf8').slice(logBefore).split('\n').filter((l) => /desktop-singleton: closed/.test(l));
check(`after ${Math.round(HIDDEN_MS / 1000)} s in the background the stream is still connected and the bridge closed nothing (protocol pings are answered by the browser itself)`, afterHidden.status === 'Connected' && cutLines.length === 0, { afterHidden, cutLines });
await fetch(`http://127.0.0.1:${CDP_PORT}/json/activate/${t0.id}`);
await until(async () => { const s = await state(); return s && s.hidden === 'visible' ? s : null; }, 10000, 250);

// ② Paste while the stream reconnects
const origin = `http://127.0.0.1:${PORT}`;
await A.cdp('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => { });
await A.cdp('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => { }); // headless: the clipboard API needs a focused document (a user's own press has one)
const TEXT = 'vs-dkp-paste-' + process.pid;
await A.evalJs(`navigator.clipboard.writeText(${JSON.stringify(TEXT)}).then(() => true)`);
const readBack = await A.evalJs('navigator.clipboard.readText().then((t) => t, (e) => "ERR " + e.name)');
console.log('  (headless clipboard read-back right after the write: ' + JSON.stringify(readBack) + ')');
await A.evalJs(`window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; const el = /toast/.test(String(n.className || '')) ? n : n.querySelector && n.querySelector('[class*=toast]'); const t = el && el.textContent; if (t && !window.__toasts.includes(t)) window.__toasts.push(t); } }).observe(document.body, { childList: true, subtree: true }); true`);
// B-2a93: THE EMPTY CLIPBOARD IS MADE, NEVER ASSUMED. This suite read «headless Chrome holds no system clipboard» from a read-back
// that answered "" (the line above prints it). Since 11-17 every kept run reads the text straight back («vs-dkp-paste-<pid>»), so
// the press pasted from the clipboard, drew no box, and the two box legs below went red. The leg is named for the no-text road:
// the clipboard is emptied here and the empty read-back is asserted BEFORE the press (rule (b): the plant proves itself first)
const wroteEmpty = await A.evalJs('navigator.clipboard.writeText("").then(() => true, (e) => "ERR " + e.name)');
const emptied = await A.evalJs('navigator.clipboard.readText().then((t) => t, (e) => "ERR " + e.name)');
check(`the clipboard is EMPTY before the press (write ${JSON.stringify(wroteEmpty)}, read back ${JSON.stringify(emptied)}) — the no-text road by construction, not by the browser`, wroteEmpty === true && emptied === '', { wroteEmpty, emptied });
for (const pid of ourXvnc()) { try { process.kill(pid, 'SIGKILL'); } catch { } }
const down = await until(async () => { const s = await state(); return s && s.status !== 'Connected' ? s : null; }, 15000, 100);
check('killing the VNC server drops the stream (the window leaves "Connected")', !!down, await state());
await A.evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x._isDesktop); w.content.querySelector('.desktop-paste').click(); return true; })()`);
const said = await until(() => A.evalJs(`window.__toasts.find((t) => /reconnecting — your text is pasted when it is back/.test(t)) || null`), 8000, 100);
check('the press is SAID while the stream reconnects', !!said, await A.evalJs('window.__toasts'));
// the clipboard was emptied above (B-2a93; asserted before the press) — so the press opened the paste box and SAID so (K2); the text goes in through the box's Send, still while the stream is down ⇒ queued
// waited for (the product awaits readText first, up to its bound) and matched to the EMPTY road's own words — a denied or timed-out
// read opens the box too, with other words (src/lib/picture-shell.js pasteBoxToastKey)
const boxSaid = !!(await until(() => A.evalJs(`window.__toasts.some((t) => /Your clipboard holds no text/.test(t)) || null`), 8000, 100));
check('with no clipboard text the press opened the paste box and said so', verdictOf(boxSaid), await A.evalJs('window.__toasts'));
const sentWhileDown = await A.evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x._isDesktop); const ta = w.content.querySelector('.vnc-paste-input'); if (!ta) return 'no box'; ta.value = ${JSON.stringify(TEXT)}; w.content.querySelector('.vnc-paste-send').click(); const st = w.content.querySelector('.desktop-status'); return st ? st.textContent : '?'; })()`);
check(`the box's Send went in while the stream was still down (status "${sentWhileDown}")`, typeof sentWhileDown === 'string' && sentWhileDown !== 'Connected' && sentWhileDown !== 'no box');
const back = await until(async () => { const s = await state(); return s && s.status === 'Connected' ? s : null; }, 60000, 500);
check('the stream comes back (the ladder through the start gate respawns the VNC server)', !!back, await state());
const landed = await until(() => { try { return execFileSync('xclip', ['-o', '-selection', 'clipboard', '-t', 'UTF8_STRING'], { env: { ...process.env, DISPLAY: VNC_DISPLAY }, timeout: 3000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).includes(TEXT) || null; } catch { return null; } }, 15000, 500);
check('the QUEUED text reached the desktop\'s clipboard once the stream was back (read back from the X server)', !!landed, { toasts: await A.evalJs('window.__toasts') });
// B-2a93's follow-up (its readers, 03:40Z): THE CLIPBOARD-WITH-TEXT ROAD HAS ITS OWN LEG (③). The leg above empties the clipboard,
// so the press that pastes the clipboard's text while the stream reconnects lost the cover it had by accident since 11-17. A text
// is PLANTED and proven (rule (b)), a second drop is made (a connect resets the ladder, vnc-view's 'connect'), and the planted text
// is read AGAIN inside the very evaluation that presses (no stream ⇒ no server clipboard update can reach the page between). The
// press must SAY the reconnect, draw NO box (the DOM: .vnc-paste-box), and land THAT text once the stream is back, within the
// product's own paste wait (PASTE_WAIT_MS, 30 s). SKIP by name only when this browser keeps no clipboard text at all (the write
// took, the read-back is ""): any other plant failure is a red that carries both values. Each clipboard call has a 5 s bound.
const clip = (expr) => `Promise.race([${expr}, new Promise((r) => setTimeout(() => r('ERR timeout'), 5000))])`;
const TEXT2 = 'vs-dkp-clip-' + process.pid;
const wrote2 = await A.evalJs(clip(`navigator.clipboard.writeText(${JSON.stringify(TEXT2)}).then(() => true, (e) => 'ERR ' + e.name)`));
const held2 = await A.evalJs(clip(`navigator.clipboard.readText().then((t) => t, (e) => 'ERR ' + e.name)`));
const boxNow = () => A.evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x._isDesktop); return !!(w && w.content.querySelector('.vnc-paste-box')); })()`);
if (wrote2 === true && held2 === '') console.log(`  ⚠ SKIP ③ the clipboard-WITH-text press: this browser keeps no clipboard text (the write took, the read-back is "")`);
else {
  check(`③ the planted text is in the clipboard before the second drop (write ${JSON.stringify(wrote2)}, read back ${JSON.stringify(held2)})`, wrote2 === true && held2 === TEXT2, { wrote2, held2 });
  const pids2 = ourXvnc();
  check(`③ the stream was back after ② and a VNC server of this run is there to drop (${pids2.length})`, !!back && pids2.length >= 1, { back: !!back, pids2 });
  const box0 = await boxNow();
  check('③ no paste box is open before the second press (② closed its box with its Send)', box0 === false, box0);
  await A.evalJs('window.__toasts = []; true');
  for (const pid of pids2) { try { process.kill(pid, 'SIGKILL'); } catch { } }
  const down2 = await until(async () => { const s = await state(); return s && s.status !== 'Connected' ? s : null; }, 15000, 100);
  check('③ a second drop of the stream (the with-text press is made while it reconnects)', !!down2, await state());
  const pressed2 = await A.evalJs(clip(`navigator.clipboard.readText().then((t) => { if (t !== ${JSON.stringify(TEXT2)}) return 'moved: ' + t; const w = [...app.wm.windows.values()].find((x) => x._isDesktop); w.content.querySelector('.desktop-paste').click(); return true; }, (e) => 'ERR ' + e.name)`));
  check(`③ the clipboard still held the planted text at the press, and the press was made (${JSON.stringify(pressed2)})`, pressed2 === true, pressed2);
  const said2 = await until(() => A.evalJs(`window.__toasts.find((t) => /reconnecting — your text is pasted when it is back/.test(t)) || null`), 8000, 100);
  check('③ the clipboard-WITH-text press while reconnecting is SAID («reconnecting — your text is pasted when it is back»)', !!said2, await A.evalJs('window.__toasts'));
  const box1 = await boxNow();
  check('③ …and it drew NO paste box (the DOM, not the toast words)', box1 === false, { box1, toasts: await A.evalJs('window.__toasts') });
  const back2 = await until(async () => { const s = await state(); return s && s.status === 'Connected' ? s : null; }, 30000, 500);
  check('③ the stream comes back a second time within the product\'s paste wait (PASTE_WAIT_MS, 30 s)', !!back2, await state());
  let lastX = null;
  const landed2 = await until(() => { try { lastX = execFileSync('xclip', ['-o', '-selection', 'clipboard', '-t', 'UTF8_STRING'], { env: { ...process.env, DISPLAY: VNC_DISPLAY }, timeout: 3000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); return lastX.includes(TEXT2) || null; } catch { return null; } }, 15000, 500);
  check('③ …and THE CLIPBOARD\'s text (never typed in a box) reached the desktop\'s clipboard once the stream was back', !!landed2, landed2 ? undefined : { lastX: lastX && lastX.slice(0, 80), browserClipboard: await A.evalJs(clip(`navigator.clipboard.readText().then((t) => t, (e) => 'ERR ' + e.name)`)), toasts: await A.evalJs('window.__toasts') });
  const box2 = await boxNow();
  check('③ …and no paste box at the end either', box2 === false, box2);
}
const consoleNoise = await A.evalJs('true');
void consoleNoise;
A.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0); import { verdictOf } from './lib/check.mjs';
