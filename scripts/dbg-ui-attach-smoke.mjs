#!/usr/bin/env node
// Full UI chain smoke (born in the 2.160.0 stale-tab incident): real Chrome
// opens the app, creates a shell terminal session via the UI path, asserts
// the xterm actually RENDERS content — the layer no WS-protocol smoke covers.
// Arg 1 = prepared checkout dir (built bundle + node_modules).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const wt = process.argv[2] || '/tmp/vs-fixtest';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find((p) => fs.existsSync(p));
const PORT = 3995, CDP_PORT = 9341;
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--user-data-dir=/tmp/vs-ui-chrome', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} try { fs.rmSync('/tmp/vs-ui-chrome', { recursive: true, force: true }); } catch {} });
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map(); const consoleErrs = [];
ws.on('message', (d) => { const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') consoleErrs.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 300)); return r.result.value; };
try {
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(1800);
  await evalJs('window.app ? app.ready : Promise.reject(new Error("no app"))');
  check('app boots', true);
  await evalJs('(app.openShellTerminal(undefined), true)');
  await sleep(4000);
  const st = await evalJs(`(() => {
    const wins = [...app.wm.windows.values()];
    const t = wins.find((w) => w.type === 'terminal');
    if (!t) return { err: 'no terminal window', n: wins.length };
    const xt = t.content.querySelector('.xterm');
    const rows = t.content.querySelectorAll('.xterm-rows > div').length;
    const text = (t.content.innerText || '').trim().slice(0, 120);
    return { hasXterm: !!xt, rows, text };
  })()`);
  check('terminal window has xterm mounted', st.hasXterm, JSON.stringify(st));
  check('terminal rendered rows', (st.rows || 0) > 0, JSON.stringify(st));
  check('shell produced visible output (prompt)', (st.text || '').length > 0, JSON.stringify(st));
  check('no page exceptions', consoleErrs.length === 0, consoleErrs.slice(0, 3).join(' | '));
} catch (e) { failed++; console.error('  ✗ harness threw:', e.message); }
finally { try { ws.close(); } catch {} }
console.log(failed ? `\n${failed} FAILED` : '\nui attach smoke passed');
process.exit(failed ? 1 : 0);
