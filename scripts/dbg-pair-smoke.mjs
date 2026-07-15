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
  check('command carries the install script + bundle', /vibespace-device-install\.sh/.test(cmd) && /--bundle-url/.test(cmd));
  check('command carries dial URL with the device id', cmd.includes('/api/device-dial?device=smoke-mac'));
  check('command carries BOTH tokens', /--dial-token vsdt_/.test(cmd) && /--host-token vsht_/.test(cmd), cmd);
  // server actually recorded the pairing — the credential lives ON the dial
  // host record since B-f3e8 (dial-tokens.json is gone)
  const hostsJson = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'hosts.json'), 'utf-8'));
  const dialRec = (hostsJson.hosts || []).find((h) => h.transport === 'dial' && h.deviceId === 'smoke-mac');
  check('server persisted the dial token hash ON the host record', !!dialRec && typeof dialRec.dialTokenHash === 'string' && dialRec.dialTokenHash.length === 64, JSON.stringify(dialRec));
  check('the hash is NOT exposed over /api/hosts', await (async () => {
    const hl = (await (await fetch(`http://127.0.0.1:${PORT}/api/hosts`)).json()).hosts || [];
    const h = hl.find((x) => x.deviceId === 'smoke-mac');
    return h && !('dialTokenHash' in h) && h.online === false;
  })());

  // ── the machine rows (B-f3e8: ONE list — /api/hosts) — REAL daemon dial ──
  const dialHosts = async () => ((await (await fetch(`http://127.0.0.1:${PORT}/api/hosts`)).json()).hosts || []).filter((h) => h.transport === 'dial');
  let devs = await dialHosts();
  check('machine list shows the pairing (offline)', devs.some((d) => d.deviceId === 'smoke-mac' && d.online === false), JSON.stringify(devs));
  // offline-device operations FAIL FAST (2.161.3): deviceForDial used to
  // back off and retry forever, hanging create/mount/test on a dead device
  const tOff = Date.now();
  const off = await (await fetch(`http://127.0.0.1:${PORT}/api/machine-mounts/host-dial-smoke-mac`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir: 'pull', remotePath: '/tmp' }) })).json();
  check('offline pull-mount fails FAST with a clear error', (Date.now() - tOff) < 5000 && /offline|not dialed/i.test(off.error || ''), JSON.stringify(off).slice(0, 150));
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
    devs = await dialHosts();
    if (devs.some((d) => d.deviceId === 'smoke-mac' && d.online)) break;
    await sleep(400);
  }
  check('REAL daemon dial flips the machine ONLINE', devs.some((d) => d.deviceId === 'smoke-mac' && d.online === true), JSON.stringify(devs));
  // ⚡ test action — the UNIFIED endpoint (dial branch of hosts.test)
  const t = await (await fetch(`http://127.0.0.1:${PORT}/api/hosts/host-dial-smoke-mac/test`, { method: 'POST' })).json();
  check('machine test returns daemon identity over the dial link', t.ok === true && t.dial === true && !!t.info, JSON.stringify(t));
  // 📁 mount a folder FROM the device (full chain: serve-folder → tunnel → rclone)
  const share = path.join(droot, 'share'); fs.mkdirSync(share, { recursive: true });
  fs.writeFileSync(path.join(share, 'hello.txt'), 'FROM-THE-DEVICE');
  const mres = await (await fetch(`http://127.0.0.1:${PORT}/api/machine-mounts/host-dial-smoke-mac`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    // TRAILING SLASH on purpose (walter regression): the serve-folder confines
    // subpaths with `root + path.sep`, so a trailing-slash root double-slashed
    // the prefix → every FILE 403'd ("couldn't list files: 403"). The
    // hello.txt read below is the guard — it 403s without the normalization fix.
    body: JSON.stringify({ dir: 'pull', remotePath: share + '/', mountpoint: path.join(droot, 'mnt') }) })).json();
  check('machine pull-mount API succeeds', !mres.error && mres.mountpoint, JSON.stringify(mres));
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
  check('mount child row rendered (indented child + folder basename)', await evalJs(`(() => {
    const rows = [...document.querySelectorAll('.mounts-panel .mounts-row-child')];
    return rows.some((r) => r.textContent.includes('share') && (r.querySelector('.mounts-name')?.title || '').includes('/mnt')); })()`));
  // OS chips: Windows flips the command to PowerShell (re-open the dialog)
  await evalJs('(app.sidebar._showDevicePairDialog(), true)');
  await sleep(200);
  await evalJs(`(() => { const i = document.querySelector('#device-pair-dialog input'); i.value = 'os-check'; return true; })()`);
  await evalJs(`([...document.querySelectorAll('#device-pair-dialog button')].find((b) => b.textContent.includes('pairing')).click(), true)`);
  await sleep(900);
  await evalJs(`([...document.querySelectorAll('#device-pair-dialog button')].find((b) => b.textContent === 'Windows').click(), true)`);
  const winCmd = await evalJs(`document.querySelector('#device-pair-dialog textarea')?.value || ''`);
  check('Windows chip flips to the PowerShell installer', /vibespace-device-install\.ps1/.test(winCmd) && /-DialToken vsdt_/.test(winCmd) && /-HostToken vsht_/.test(winCmd), winCmd.slice(0, 120));
  // ── slice B: the pairing IS a machine (hosts model) ──
  const hostsList = (await (await fetch(`http://127.0.0.1:${PORT}/api/hosts`)).json()).hosts || [];
  const dialHost = hostsList.find((h) => h.transport === 'dial' && h.deviceId === 'smoke-mac');
  check('pairing created a dial HOST record', !!dialHost, JSON.stringify(hostsList.map((h) => h.id)));
  if (dialHost) {
    // files on the device through the ?host= dispatch (RemoteFs → device fs ops)
    const fl = await (await fetch(`http://127.0.0.1:${PORT}/api/files?path=${encodeURIComponent(share)}&host=${encodeURIComponent(dialHost.id)}`)).json();
    check('device files listable via ?host= (device fs path)', Array.isArray(fl.items) && fl.items.some((f) => f.name === 'hello.txt'), JSON.stringify(fl).slice(0, 200));
    // discovery answers (empty session list is fine — the path must not throw)
    const ds = await (await fetch(`http://127.0.0.1:${PORT}/api/hosts/${encodeURIComponent(dialHost.id)}/sessions?fresh=1`)).json();
    check('device discovery answers via the dial link', Array.isArray(ds.sessions), JSON.stringify(ds).slice(0, 200));
  }
  // unmount + unpair cleanup path
  const um = await fetch(`http://127.0.0.1:${PORT}/api/machine-mounts/${mres.id}`, { method: 'DELETE' });
  check('machine mount unmounts', um.ok);
  const del = await fetch(`http://127.0.0.1:${PORT}/api/hosts/host-dial-smoke-mac`, { method: 'DELETE' });
  check('unpair (DELETE /api/hosts/:id) succeeds', del.ok);
  devs = await dialHosts();
  check('unpaired machine gone from the list', !devs.some((d) => d.deviceId === 'smoke-mac'), JSON.stringify(devs));
  const hostsAfter = (await (await fetch(`http://127.0.0.1:${PORT}/api/hosts`)).json()).hosts || [];
  check('unpair removed the dial host record', !hostsAfter.some((h) => h.deviceId === 'smoke-mac'), JSON.stringify(hostsAfter.map((h) => h.id)));
  killDaemon();
  fs.rmSync(droot, { recursive: true, force: true });
} catch (e) {
  failed++; console.error('  ✗ harness threw:', e.message);
} finally { try { ws.close(); } catch {} }
console.log(failed ? `\n${failed} FAILED` : '\npair smoke passed');
process.exit(failed ? 1 : 0);
