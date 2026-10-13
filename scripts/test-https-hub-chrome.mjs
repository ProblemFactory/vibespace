#!/usr/bin/env node
// lane https-tailscale HEAVY (owner 2026-10-12 "tailscale cert可以做"): the hub answers https on the SAME port as http,
// end to end on this box. A THROWAWAY server.js (a scratch worktree of HEAD + the working src/public/server.js) and
// headless Chrome over raw CDP, on the box's NON-LOOPBACK address (a loopback page is a secure context already and
// proves nothing). Chrome trusts exactly the test leaf (--ignore-certificate-errors-spki-list=<its SPKI>, never the
// global --ignore-certificate-errors):
//   ① files (VIBESPACE_TLS_CERT/KEY = a leaf for <ip>): https://<ip>:<port> → sign in → the app with
//     window.isSecureContext === true and its WebSocket connected (the sidebar drawn); a reload keeps the session
//   ② CONTROL: http://<ip>:<port> — the SAME port — still serves the page, NOT a secure context; sign-in + reload hold
//   ③ the Settings row: "Secure address: https://<ip>:<port> — …" + Copy (desk) — settings.png; at 390 px it wraps
//   ④ a stubbed `tailscale` (VIBESPACE_TAILSCALE_BIN — a throwaway root never runs the real one): status JSON with
//     DNSName + CertDomains, `cert` writes the fixture files ⇒ the server acquires at boot and logs the https line;
//     the next boot's banner says "running at http://localhost:<port> and https://<domain>:<port>"
//   ⑤ the stub answering "not enabled" (CertDomains null) ⇒ the For-you item ONCE across two boots; then "cert access
//     denied" ⇒ ONE operator-needed item naming `sudo tailscale set --operator=`
// PNGs (when `--shots <dir>`): settings.png (desk), settings-phone.png (390).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { spawn, execSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, scratchHome, endRootedProcesses, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const IP = (() => { const all = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')); return (all.find((a) => /^(192\.168|10|100)\./.test(a.address)) || all[0] || {}).address || null; })();
if (!IP) { console.log('SKIP: this box has no non-loopback IPv4 address (an insecure origin needs one)'); process.exit(0); }
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DOMAIN = 'hub-test.tail0000.ts.net';
const PW = 'https-lane-pw-7';

const [PORT, CDP_PORT] = await freePorts(2);
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop names (test-architecture §57)
const wt = scratch('https-hub-wt');
const fakeHome = scratchHome('https-hub-home', fs);
const fx = scratch('https-hub-fx');
fs.mkdirSync(fx, { recursive: true });
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

// the leaves: one for <ip> (files), one for the tailnet name (the stub's `cert`)
function mint(name, sans) {
  const c = path.join(fx, name + '.crt'), k = path.join(fx, name + '.key');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', k, '-out', c, '-days', '30', '-subj', '/CN=' + name, '-addext', 'subjectAltName=' + sans], { stdio: 'ignore' });
  return { c, k, spki: crypto.createHash('sha256').update(crypto.createPublicKey(fs.readFileSync(c)).export({ type: 'spki', format: 'der' })).digest('base64') };
}
const LEAF = mint('ip', `IP:${IP}`);
const TS = mint('ts', `DNS:${DOMAIN},IP:${IP}`);
// the stubbed CLI: its mode is a file (ok | not-enabled | denied); every call is journaled
const STUB = path.join(fx, 'tailscale');
fs.writeFileSync(STUB, `#!${process.execPath}
const fs = require('fs');
const a = process.argv.slice(2);
const mode = fs.readFileSync(${JSON.stringify(path.join(fx, 'mode'))}, 'utf8').trim();
fs.appendFileSync(${JSON.stringify(path.join(fx, 'calls'))}, a.join(' ') + '\\n');
if (a[0] === 'status') { process.stdout.write(JSON.stringify({ BackendState: 'Running', Self: { DNSName: ${JSON.stringify(DOMAIN + '.')} }, MagicDNSSuffix: 'tail0000.ts.net', CertDomains: mode === 'not-enabled' ? null : [${JSON.stringify(DOMAIN)}] })); process.exit(0); }
if (a[0] === 'cert') {
  if (mode === 'denied') { process.stderr.write("Access denied: cert access denied.\\nUse 'sudo tailscale cert ${DOMAIN}'.\\n"); process.exit(1); }
  if (mode === 'not-enabled') { process.stderr.write('HTTPS cert support is not enabled/configured for your tailnet.\\n'); process.exit(1); }
  fs.copyFileSync(${JSON.stringify(TS.c)}, a[a.indexOf('--cert-file') + 1]); fs.copyFileSync(${JSON.stringify(TS.k)}, a[a.indexOf('--key-file') + 1]); process.exit(0);
}
process.exit(2);
`, { mode: 0o755 });
const setMode = (m) => fs.writeFileSync(path.join(fx, 'mode'), m);
const calls = () => { try { return fs.readFileSync(path.join(fx, 'calls'), 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };

let srv = null, srvLog = null;
async function boot(tag, env, dataDir) {
  if (srv) { srv.kill('SIGTERM'); await new Promise((r) => { const t = setTimeout(r, 4000); srv.once('exit', () => { clearTimeout(t); r(); }); }); try { srv.kill('SIGKILL'); } catch {} }
  try { fs.rmSync(path.join(wt, 'data'), { recursive: true, force: true }); } catch {}
  fs.mkdirSync(dataDir, { recursive: true });
  fs.symlinkSync(dataDir, path.join(wt, 'data'));
  srvLog = path.join(fx, `server-${tag}.log`);
  const fd = fs.openSync(srvLog, 'a');
  srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', NO_AUTO_UPDATE: '1', VIBESPACE_PASSWORD: PW, ...env }, stdio: ['ignore', fd, fd] });
  for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/login`); break; } catch { await sleep(250); } }
}
const log = () => { try { return fs.readFileSync(srvLog, 'utf8'); } catch { return ''; } };
const waitLog = async (re, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(log())) return true; await sleep(200); } return re.test(log()); };
// the API as the owner (the cookie of a password sign-in, plain http on loopback)
async function api(p) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PW }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return (await fetch(`http://127.0.0.1:${PORT}${p}`, { headers: { cookie } })).json();
}

const chromeDir = scratch('https-hub-chrome');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, `--ignore-certificate-errors-spki-list=${LEAF.spki},${TS.spki}`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  for (const r of [wt, fakeHome, fx]) { try { endRootedProcesses(r); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, chromeDir, fakeHome, fx]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!target) await sleep(250); }
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map();
sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(200); } try { return await evalJs(expr); } catch { return false; } };
const go = async (url) => {
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url }); await sleep(600);
};
const signIn = () => evalJs(`fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(PW)} }) }).then((r) => r.status)`);
const APP_UP = `!!(window.app && window.app.ws && window.app.ws.connected && document.getElementById('sidebar'))`;
const SPLASH_GONE = `(() => { const l = document.getElementById('loading-screen'); if (!l || !l.isConnected) return true; const cs = getComputedStyle(l); return cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0; })()`;

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  console.log(`① files: https://${IP}:${PORT}`);
  await boot('files', { VIBESPACE_TLS_CERT: LEAF.c, VIBESPACE_TLS_KEY: LEAF.k }, path.join(fx, 'data-files'));
  check('the boot banner names both addresses', await waitLog(new RegExp(`running at http://localhost:${PORT} and https://${IP.replace(/\./g, '\\.')}:${PORT}`)), log().split('\n').find((l) => /running at/.test(l)));
  const HTTPS = `https://${IP}:${PORT}`, HTTP = `http://${IP}:${PORT}`;
  await go(HTTPS + '/login');
  check('the https page loads (Chrome trusts exactly the test leaf)', await waitFor(`location.protocol === 'https:' && document.readyState === 'complete'`, 15000), await evalJs('location.href').catch(() => null));
  check('sign-in over https', (await signIn()) === 200);
  await go(HTTPS + '/');
  check('the app on https: WebSocket connected, the sidebar drawn', await waitFor(APP_UP, 30000));
  check('window.isSecureContext === true on https://<ip>', await evalJs('window.isSecureContext') === true && await evalJs('!!(window.crypto && window.crypto.subtle)') === true);
  await cdp('Page.reload'); await sleep(800);
  check('a reload keeps the session on https (no sign-in page)', await waitFor(APP_UP, 30000) && await evalJs(`!/\\/login/.test(location.pathname)`));

  console.log(`② CONTROL: http://${IP}:${PORT} — the same port`);
  await go(HTTP + '/login');
  if (/\/login/.test(await evalJs('location.pathname'))) check('sign-in over http (same port)', (await signIn()) === 200); else check('the https cookie (no Secure flag) also signs the http origin in', true);
  await go(HTTP + '/');
  const PAGE = `({ href: location.href, app: !!window.app, ws: !!(window.app && window.app.ws && window.app.ws.connected), sidebar: !!document.getElementById('sidebar'), ready: document.readyState, title: document.title })`;
  check('http on the SAME port still serves the app (WebSocket connected)', await waitFor(APP_UP, 30000), await evalJs(PAGE).catch((e) => e.message));
  check('CONTROL: http://<ip> is NOT a secure context (no crypto.subtle) — the bug the https address fixes', await evalJs('window.isSecureContext') === false && await evalJs('!!(window.crypto && window.crypto.subtle)') === false);
  await cdp('Page.reload'); await sleep(800);
  check('a reload keeps the session on http', await waitFor(APP_UP, 30000) && await evalJs(`!/\\/login/.test(location.pathname)`), await evalJs(PAGE).catch((e) => e.message));

  console.log('③ the Settings row');
  await go(HTTPS + '/'); await waitFor(APP_UP, 30000);
  await evalJs(`app._settingsUI.open({ search: 'server.https' })`);
  const ROW = `(() => { const f = document.querySelector('.settings-https-fact'); return f ? { text: f.querySelector('.settings-https-text').textContent, copy: !!f.querySelector('.settings-https-copy'), live: f.classList.contains('is-live') } : null; })()`;
  check('the row says the secure address + a Copy button', await waitFor(`(${ROW}) && (${ROW}).copy`, 15000) && (await evalJs(ROW)).text === `Secure address: ${HTTPS} — microphone, a Mac's sign-in and other secure-only features need it`, await evalJs(ROW));
  const shot = async (file) => {
    if (!SHOTS) return;
    await waitFor(SPLASH_GONE, 20000); // the boot splash covers the page until app.ready
    const r = await evalJs(`(() => { const row = document.querySelector('.settings-https-fact').closest('.settings-row'); row.scrollIntoView({ block: 'center' }); const b = row.getBoundingClientRect(); return { x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), width: b.width + 16, height: b.height + 16 }; })()`);
    await sleep(300);
    const { data } = await cdp('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } });
    fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(data, 'base64'));
  };
  await shot('settings.png');
  // the phone layout is chosen at boot: a 390 px mobile viewport, then a reload, then the row again
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.reload'); await sleep(800); await waitFor(APP_UP, 30000);
  await evalJs(`app._settingsUI.open({ search: 'server.https' })`);
  await waitFor(`!!document.querySelector('.settings-https-copy')`, 15000);
  await sleep(400);
  const phone = await evalJs(`(() => { const f = document.querySelector('.settings-https-fact'); const t = f.querySelector('.settings-https-text'), b = f.querySelector('.settings-https-copy'); const fr = f.getBoundingClientRect(); return { over: f.scrollWidth - f.clientWidth, inView: fr.right <= innerWidth + 1, lines: Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)), btnIn: b.getBoundingClientRect().right <= fr.right + 1 }; })()`);
  check('390 px: the row wraps — nothing overflows sideways, the Copy button inside', phone.over <= 0 && phone.inView && phone.btnIn && phone.lines >= 2, phone);
  await shot('settings-phone.png');
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  console.log('④ a stubbed tailscale: acquire at boot');
  setMode('ok');
  const dTs = path.join(fx, 'data-ts');
  await boot('ts1', { VIBESPACE_TAILSCALE_BIN: STUB }, dTs);
  check('the server acquires at boot and logs the https line', await waitLog(new RegExp(`\\[tls\\] https on :${PORT} — https://${DOMAIN.replace(/\./g, '\\.')}:${PORT} \\(tailscale certificate, until `)), log().split('\n').filter((l) => /\[tls\]/.test(l)));
  check('status --json, then ONE cert run with --cert-file/--key-file into data/tls', calls().filter((c) => c.startsWith('cert ')).length === 1 && calls().some((c) => c === `cert --cert-file ${path.join(wt, 'data', 'tls', DOMAIN + '.crt')} --key-file ${path.join(wt, 'data', 'tls', DOMAIN + '.key')} ${DOMAIN}`), calls());
  const st = await api('/api/tls');
  check('/api/tls: tailscale, serving, the https url', st.mode === 'tailscale' && st.serving === true && st.url === `https://${DOMAIN}:${PORT}`, st);
  const inst = await api('/api/instance-url');
  check('instanceUrl prefers the https address (source https) while the certificate is live', inst.effectiveUrl === `https://${DOMAIN}:${PORT}` && inst.source === 'https', inst);
  const peer = await new Promise((res) => { const q = https.get({ host: '127.0.0.1', port: PORT, path: '/login', servername: DOMAIN, rejectUnauthorized: false }, (r) => { res(r.socket.getPeerCertificate().fingerprint256); r.resume(); }); q.on('error', (e) => res(e.message)); });
  check('TLS on the port presents the acquired certificate', peer === new crypto.X509Certificate(fs.readFileSync(TS.c)).fingerprint256, peer);
  await boot('ts2', { VIBESPACE_TAILSCALE_BIN: STUB }, dTs);
  check('the next boot serves it at once: "running at http://localhost:<port> and https://<domain>:<port>"', await waitLog(new RegExp(`running at http://localhost:${PORT} and https://${DOMAIN.replace(/\./g, '\\.')}:${PORT}`)), log().split('\n').find((l) => /running at/.test(l)));

  console.log('⑤ the owner\'s step: ONE For-you item per state, across boots');
  setMode('not-enabled');
  const dNo = path.join(fx, 'data-no');
  const items = async () => { const t = (await api('/api/user-todos')).todos || {}; return [...(t.open || []), ...(t.resolved || [])].filter((x) => x.sessionName === 'HTTPS'); };
  for (const n of [1, 2]) {
    await boot('no' + n, { VIBESPACE_TAILSCALE_BIN: STUB }, dNo);
    await waitLog(/\[tls\] https off — https-not-enabled/);
    await sleep(500);
    const it = await items();
    check(`boot ${n}: the "not enabled" For-you item — exactly ONE`, it.length === 1 && /HTTPS Certificates in the Tailscale admin console/.test(it[0].text), it.map((t) => t.text));
  }
  setMode('denied');
  await boot('denied', { VIBESPACE_TAILSCALE_BIN: STUB }, dNo);
  await waitLog(/\[tls\] https off — operator-needed/);
  await sleep(500);
  const it2 = await items();
  check('"cert access denied" ⇒ ONE operator-needed item (sudo tailscale set --operator=…), the old one resolved', it2.filter((t) => /sudo tailscale set --operator=/.test(t.text)).length === 1 && it2.filter((t) => t.status === 'open').length === 1, it2.map((t) => [t.status, t.text.slice(0, 60)]));
} catch (e) { check('the suite ran without throwing', false, e && e.stack); }
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
