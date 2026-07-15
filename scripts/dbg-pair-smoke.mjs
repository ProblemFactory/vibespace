#!/usr/bin/env node
// DEBUG: the Remote-tab device pairing dialog end-to-end (open → name → pair
// → command rendered with both tokens). Arg 1 = prepared checkout dir.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const wt = process.argv[2] || '/tmp/vs-fixtest';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find((p) => fs.existsSync(p));
const PORT = 3989, CDP_PORT = 9339;
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--user-data-dir=/tmp/vs-pair-chrome', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { fs.rmSync('/tmp/vs-pair-chrome', { recursive: true, force: true }); } catch {}
});

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
  await evalJs('(app.sidebar._showDevicePairDialog(), true)');
  await sleep(300);
  check('dialog opens with name input + create button', await evalJs(`!!(document.querySelector('#device-pair-dialog input') && [...document.querySelectorAll('#device-pair-dialog button')].some((b) => b.textContent.includes('pairing')))`));
  await evalJs(`(() => { const i = document.querySelector('#device-pair-dialog input'); i.value = 'smoke-mac'; return true; })()`);
  await evalJs(`([...document.querySelectorAll('#device-pair-dialog button')].find((b) => b.textContent.includes('pairing')).click(), true)`);
  await sleep(1200);
  const cmd = await evalJs(`document.querySelector('#device-pair-dialog textarea')?.value || ''`);
  check('command rendered after pairing', cmd.length > 100, cmd.slice(0, 120));
  check('command carries the install script + bundle', /agentd-install\.sh/.test(cmd) && /--bundle-url/.test(cmd));
  check('command carries dial URL with the device id', cmd.includes('/api/agentd-dial?device=smoke-mac'));
  check('command carries BOTH tokens', /--dial-token vsdt_/.test(cmd) && /--host-token vsht_/.test(cmd), cmd);
  // server actually recorded the pairing
  const tokens = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'agentd', 'dial-tokens.json'), 'utf-8'));
  check('server persisted the dial token (sha256)', typeof tokens['smoke-mac'] === 'string' && tokens['smoke-mac'].length === 64);

  // ── the Paired-devices list (2.152.1) ──
  let devs = (await (await fetch(`http://127.0.0.1:${PORT}/api/agentd/devices`)).json()).devices;
  check('devices list shows the pairing (offline)', devs.some((d) => d.id === 'smoke-mac' && d.online === false), JSON.stringify(devs));
  // a REAL dial with the minted token flips it online
  const dialTok = /--dial-token (vsdt_\w+)/.exec(cmd)[1];
  const { connect } = require(path.join(wt, 'src/agentd/ws-min.js'));
  const dialWs = connect(`ws://127.0.0.1:${PORT}/api/agentd-dial?device=smoke-mac`, { headers: { 'x-vibespace-dial-token': dialTok } });
  dialWs.on('error', () => {});
  await sleep(900);
  devs = (await (await fetch(`http://127.0.0.1:${PORT}/api/agentd/devices`)).json()).devices;
  check('live dial flips the device ONLINE', devs.some((d) => d.id === 'smoke-mac' && d.online === true), JSON.stringify(devs));
  // the Remote tab renders the section with the green-dot row
  await evalJs(`(app.sidebar._activeTab = 'mounts', app.sidebar._renderMounts(), true)`);
  await sleep(900);
  check('Remote tab renders the Paired devices row', await evalJs(`(() => {
    const p = document.querySelector('.mounts-panel');
    return !!p && p.textContent.includes('smoke-mac') && p.textContent.includes('online'); })()`));
  // unpair via the endpoint
  const del = await fetch(`http://127.0.0.1:${PORT}/api/agentd/devices/smoke-mac`, { method: 'DELETE' });
  check('unpair succeeds', del.ok);
  devs = (await (await fetch(`http://127.0.0.1:${PORT}/api/agentd/devices`)).json()).devices;
  check('unpaired device gone from the list', !devs.some((d) => d.id === 'smoke-mac'), JSON.stringify(devs));
  try { dialWs.destroy(); } catch {}
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.message);
} finally { try { ws.close(); } catch {} }
console.log(failed ? `\n${failed} FAILED` : '\npair smoke passed');
process.exit(failed ? 1 : 0);
