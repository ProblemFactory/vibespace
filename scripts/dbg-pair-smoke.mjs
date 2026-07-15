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

  // ── the Paired-devices machine rows (2.153.0) — REAL daemon dial ──
  let devs = (await (await fetch(`http://127.0.0.1:${PORT}/api/agentd/devices`)).json()).devices;
  check('devices list shows the pairing (offline)', devs.some((d) => d.id === 'smoke-mac' && d.online === false), JSON.stringify(devs));
  // start a REAL agentd with --dial (the actual daemon, not a fake ws client)
  const dialTok = /--dial-token (vsdt_\w+)/.exec(cmd)[1];
  const hostTok = /--host-token (vsht_\w+)/.exec(cmd)[1];
  const droot = path.join('/tmp', 'vs-pair-smoke-dev');
  fs.rmSync(droot, { recursive: true, force: true });
  fs.mkdirSync(path.join(droot, 'state'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(droot, 'standalone'), { recursive: true });
  fs.copyFileSync(path.join(wt, 'data', 'bin', 'vibespace-agentd.js'), path.join(droot, 'standalone', 'agentd.js'));
  fs.symlinkSync(path.join(droot, 'standalone'), path.join(droot, 'current'));
  fs.writeFileSync(path.join(droot, 'state', 'token'), hostTok, { mode: 0o600 });
  const daemon = spawn(process.execPath, [path.join(droot, 'current', 'agentd.js'),
    '--dial', `ws://127.0.0.1:${PORT}/api/agentd-dial?device=smoke-mac`, '--dial-token', dialTok],
    { env: { ...process.env, VIBESPACE_AGENTD_ROOT: droot }, stdio: 'ignore' });
  const killDaemon = () => { try { daemon.kill('SIGKILL'); } catch {} };
  process.on('exit', killDaemon);
  for (let i = 0; i < 30; i++) {
    devs = (await (await fetch(`http://127.0.0.1:${PORT}/api/agentd/devices`)).json()).devices;
    if (devs.some((d) => d.id === 'smoke-mac' && d.online)) break;
    await sleep(400);
  }
  check('REAL daemon dial flips the device ONLINE', devs.some((d) => d.id === 'smoke-mac' && d.online === true), JSON.stringify(devs));
  // ⚡ test action
  const t = await (await fetch(`http://127.0.0.1:${PORT}/api/agentd/devices/smoke-mac/test`, { method: 'POST' })).json();
  check('device test returns daemon identity', t.ok === true && !!t.info, JSON.stringify(t));
  // 📁 mount a folder FROM the device (full chain: serve-folder → tunnel → rclone)
  const share = path.join(droot, 'share'); fs.mkdirSync(share, { recursive: true });
  fs.writeFileSync(path.join(share, 'hello.txt'), 'FROM-THE-DEVICE');
  const mres = await (await fetch(`http://127.0.0.1:${PORT}/api/device-mounts/smoke-mac`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remotePath: share, mountpoint: path.join(droot, 'mnt') }) })).json();
  check('device mount API succeeds', !mres.error && mres.mountpoint, JSON.stringify(mres));
  if (mres.mountpoint) {
    let content = '';
    for (let i = 0; i < 20; i++) {
      try { content = fs.readFileSync(path.join(mres.mountpoint, 'hello.txt'), 'utf8'); break; } catch { await sleep(400); }
    }
    check('device file readable at the mountpoint', content === 'FROM-THE-DEVICE', JSON.stringify(content));
  }
  // the Remote tab renders the device as a MACHINE row + the mount child row
  await evalJs(`(app.sidebar._activeTab = 'mounts', app.sidebar._renderMounts(), true)`);
  await sleep(900);
  check('Remote tab renders device as a machine row (mounts-row + name)', await evalJs(`(() => {
    const rows = [...document.querySelectorAll('.mounts-panel .mounts-row')];
    return rows.some((r) => r.textContent.includes('smoke-mac') && r.querySelector('.mounts-dot')); })()`));
  check('mount child row rendered', await evalJs(`(() => {
    const p = document.querySelector('.mounts-panel');
    return !!p && p.textContent.includes(${JSON.stringify(path.join('/tmp', 'vs-pair-smoke-dev', 'mnt'))}); })()`));
  // OS chips: Windows flips the command to PowerShell (re-open the dialog)
  await evalJs('(app.sidebar._showDevicePairDialog(), true)');
  await sleep(200);
  await evalJs(`(() => { const i = document.querySelector('#device-pair-dialog input'); i.value = 'os-check'; return true; })()`);
  await evalJs(`([...document.querySelectorAll('#device-pair-dialog button')].find((b) => b.textContent.includes('pairing')).click(), true)`);
  await sleep(900);
  await evalJs(`([...document.querySelectorAll('#device-pair-dialog button')].find((b) => b.textContent === 'Windows').click(), true)`);
  const winCmd = await evalJs(`document.querySelector('#device-pair-dialog textarea')?.value || ''`);
  check('Windows chip flips to the PowerShell installer', /agentd-install\.ps1/.test(winCmd) && /-DialToken vsdt_/.test(winCmd) && /-HostToken vsht_/.test(winCmd), winCmd.slice(0, 120));
  // unmount + unpair cleanup path
  const um = await fetch(`http://127.0.0.1:${PORT}/api/device-mounts/${mres.id}`, { method: 'DELETE' });
  check('device mount unmounts', um.ok);
  const del = await fetch(`http://127.0.0.1:${PORT}/api/agentd/devices/smoke-mac`, { method: 'DELETE' });
  check('unpair succeeds', del.ok);
  devs = (await (await fetch(`http://127.0.0.1:${PORT}/api/agentd/devices`)).json()).devices;
  check('unpaired device gone from the list', !devs.some((d) => d.id === 'smoke-mac'), JSON.stringify(devs));
  killDaemon();
  fs.rmSync(droot, { recursive: true, force: true });
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.message);
} finally { try { ws.close(); } catch {} }
console.log(failed ? `\n${failed} FAILED` : '\npair smoke passed');
process.exit(failed ? 1 : 0);
