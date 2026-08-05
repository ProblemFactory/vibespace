// Agents machine-sectioned account+quota overview (2.245.0) — worktree +
// headless-chrome CDP smoke. Verifies: /api/usage `hostAccounts` (boot-loaded
// from usage-cache/host-<hid>-<aid>.json) + /api/accounts `verdicts` survive;
// the Agents rail panel renders STACKED machine sections (local + one per
// host, no host selector left); the ⟳ Refresh-all button exists, is
// clickable, and a failed target renders an INLINE per-row error (never
// silent); the usage popup lost its Remote-hosts section and gained the
// "Full overview →" door into the Agents panel.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/home/xingweil/workspace/AIWorkspace/vibespace/server.js');
const repo = process.cwd();
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const PORT = 3998, CDP_PORT = 9348;
const wt = '/tmp/vs-agentsov-test', fakeHome = '/tmp/vs-agentsov-home';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, c) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}`); } };
try { execSync(`git worktree remove --force ${wt}`, { stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
fs.rmSync(fakeHome, { recursive: true, force: true }); fs.mkdirSync(fakeHome, { recursive: true });
// Seed the usage caches: a machine-login snapshot (so the popup renders its
// claude section → the overview link appears) + a host-held account snapshot
// (exercises the boot loader's host-vs-host-account filename disambiguation).
const cacheDir = path.join(wt, 'data', 'usage-cache');
fs.mkdirSync(cacheDir, { recursive: true });
const snap = { fiveHour: { utilization: 0.42, status: 'allowed', resetsAt: Math.floor(Date.now() / 1000) + 3600 }, sevenDay: { utilization: 0.17, status: 'allowed', resetsAt: Math.floor(Date.now() / 1000) + 86400 }, scopedWeekly: [], overallStatus: 'allowed', fetchedAt: Date.now() };
fs.writeFileSync(path.join(cacheDir, '__global__.json'), JSON.stringify(snap));
fs.writeFileSync(path.join(cacheDir, 'host-host-deadbeef-sub-abcdefabcdef.json'), JSON.stringify({ ...snap, name: 'HeldAcct' }));
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1280,900', '--user-data-dir=/tmp/vs-agentsov-chrome', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch {}; try { srv.kill('SIGKILL'); } catch {}; try { execSync(`git worktree remove --force ${wt}`, { stdio: 'ignore' }); } catch {}; try { fs.rmSync('/tmp/vs-agentsov-chrome', { recursive: true, force: true }); } catch {}; try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch {} });
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── server-side asserts ──
const usage = await (await fetch(`http://127.0.0.1:${PORT}/api/usage`)).json();
check('/api/usage has hostAccounts', usage && typeof usage.hostAccounts === 'object');
check('boot loader keyed the held snapshot host:acct', !!usage.hostAccounts?.['host-deadbeef:sub-abcdefabcdef']);
check('held file NOT mis-loaded as a plain host', !usage.hosts?.['host-deadbeef-sub-abcdefabcdef']);
const acc = await (await fetch(`http://127.0.0.1:${PORT}/api/accounts`)).json();
check('/api/accounts still returns verdicts', acc && typeof acc.verdicts === 'object');
let r = await (await fetch(`http://127.0.0.1:${PORT}/api/usage/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'host-x', account: 'BAD id!' }) })).json();
check('refresh {host,account}: bad account id rejected', /bad account id/.test(r?.error || ''));
r = await (await fetch(`http://127.0.0.1:${PORT}/api/usage/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: 'host-x', account: 'sub-abcdefabcdef' }) })).json();
check('refresh {host,account}: unknown host rejected', /unknown host/.test(r?.error || ''));
// Dead host record → a second machine section that must render honestly.
r = await (await fetch(`http://127.0.0.1:${PORT}/api/hosts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'DeadHost', user: 'nobody', host: '127.0.0.1', port: 1 }) })).json();
check('dead host record added', !!r?.success);

// ── UI asserts (CDP) ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) { try { const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); target = l.find((t) => t.type === 'page'); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((res) => ws.on('open', res));
let seq = 0; const pend = new Map(); const jsErrors = [];
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') jsErrors.push(m.params?.exceptionDetails?.exception?.description || 'exception');
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') jsErrors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (e) => { const rr = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (rr.exceptionDetails) throw new Error(rr.exceptionDetails.exception?.description || 'threw'); return rr.result.value; };
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await evalJs('new Promise(r => { const t = setInterval(() => { if (window.app) { clearInterval(t); r(); } }, 100); })');
await evalJs('app.ready'); await sleep(1500);
await evalJs(`localStorage.setItem('vibespace.quotaRefreshAck', '1'); 1`);
// Open the Agents rail panel
await evalJs(`(() => { app.sidebar.toggle(true); const it = document.querySelector('.rail-item[data-rail="agents"]'); if (!it) throw new Error('no agents rail item'); it.click(); return 1; })()`);
// Local section fills fast; the dead host's ssh probes fail within seconds.
await sleep(6000);
const st1 = await evalJs(`(() => ({
  secs: document.querySelectorAll('.agents-machine-sec').length,
  localGlobalRow: !!document.querySelector('.agents-machine-sec[data-host=""] .acct-key-row[data-id="__global__"]'),
  refreshAll: !!document.querySelector('.agents-refresh-all'),
  oldSelector: !!document.querySelector('.agents-host-select'),
  hostSec: !!document.querySelector('.agents-machine-sec:not([data-host=""])'),
}))()`);
check('two machine sections render (local + DeadHost)', st1.secs === 2);
check('local section has the CLI-login row', st1.localGlobalRow);
check('⟳ Refresh-all button present', st1.refreshAll);
check('host selector is gone', !st1.oldSelector);
check('host section container present', st1.hostSec);
// Wait out the dead host's probe failures, then check honest state.
for (let i = 0; i < 20; i++) { if (await evalJs(`!document.querySelector('.agents-machine-sec:not([data-host=""]) .ob-loading')`)) break; await sleep(1000); }
const st2 = await evalJs(`(() => {
  const sec = document.querySelector('.agents-machine-sec:not([data-host=""])');
  return { filled: !sec.querySelector('.ob-loading'), globalRow: !!sec.querySelector('.acct-key-row[data-id="__global__"]'), text: sec.textContent.slice(0, 400) };
})()`);
check('dead host section filled (probe failure did not wedge it)', st2.filled);
check('dead host section has its CLI-login row', st2.globalRow);
// Refresh-all: clickable; its one target (the dead host) must FAIL INLINE.
await evalJs(`(() => { const b = document.querySelector('.agents-refresh-all'); b.click(); return 1; })()`);
for (let i = 0; i < 20; i++) { if (await evalJs(`!!document.querySelector('.acct-refresh-err')`)) break; await sleep(1000); }
check('failed refresh target rendered an inline per-row error', await evalJs(`!!document.querySelector('.agents-machine-sec:not([data-host=""]) .acct-refresh-err')`));
// Usage popup: Remote-hosts section gone, Full-overview door present.
await evalJs(`(() => { document.getElementById('taskbar-usage').click(); return 1; })()`);
await sleep(600);
const st3 = await evalJs(`(() => { const p = document.getElementById('usage-popup'); return {
  open: !p.classList.contains('hidden'),
  hostRefresh: !!p.querySelector('.usage-host-refresh'),
  overview: !!p.querySelector('.usage-overview-link'),
}; })()`);
check('usage popup opens', st3.open);
check('popup Remote-hosts section removed', !st3.hostRefresh);
check('popup has the Full-overview door', st3.overview);
await evalJs(`(() => { document.querySelector('#usage-popup .usage-overview-link').click(); return 1; })()`);
await sleep(800);
const st4 = await evalJs(`(() => ({
  popupHidden: document.getElementById('usage-popup').classList.contains('hidden'),
  agentsActive: !!document.querySelector('.rail-item[data-rail="agents"].active'),
}))()`);
check('overview door closes the popup', st4.popupHidden);
check('overview door lands on the Agents rail panel', st4.agentsActive);
const realErrors = jsErrors.filter((e) => !/favicon|net::|Failed to load resource/.test(e));
check('no JS errors', realErrors.length === 0);
if (realErrors.length) console.error('   errors:', realErrors.slice(0, 5));
const shot = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 420, height: 900, scale: 1.5 } });
fs.writeFileSync('/tmp/agents-overview.png', Buffer.from(shot.data, 'base64'));
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
