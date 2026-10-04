#!/usr/bin/env node
// THE SLACK RELAY PAGE IN A REAL BROWSER (lane slack-workspace-app, design 018). docs/slack-relay/ is served as it ships
// (index.html + relay.js, its own CSP) by a static server standing in for the https host; a second server stands in
// for a VibeSpace instance on 127.0.0.1. Headless Chrome opens the page the way Slack redirects to it:
//   ① the rule: relay.js's relayTargetVerdict equals src/channels/slack-manifest.js's over one table (private networks,
//      public hosts, look-alikes, the allow suffix) — the page and the server never disagree
//   ② a state naming the instance (127.0.0.1): the browser lands on <instance>/api/channels/oauth/cb/slack with the
//      query VERBATIM (the instance sees code + state + nothing else)
//   ③ a state naming a public host, a forged / missing state, a look-alike under a data-allow page: the code is SHOWN
//      (Copy), no navigation; an `error=access_denied` with no way back says "declined"
//   ④ CDP no-network census: across every load the page asks for index.html and relay.js only — no fetch, beacon,
//      font, image or third-party script; nothing in localStorage / sessionStorage / cookies
// Run: node scripts/test-slack-relay.mjs   (SKIPs without chrome)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = require(path.join(repo, 'src/channels/slack-manifest.js'));
const DIR = path.join(repo, 'docs/slack-relay');
const prof = scratch('slack-relay-chrome');
const [PAGE_PORT, INST_PORT, CDP_PORT] = await freePorts(3);

// ① the rule, both functions, one table
const rctx = { URL, URLSearchParams, atob }; rctx.globalThis = rctx; vm.createContext(rctx);
vm.runInContext(fs.readFileSync(path.join(DIR, 'relay.js'), 'utf-8'), rctx);
const RV = rctx.VibeSpaceRelay;
const TABLE = [
  ['http://127.0.0.1:3000', []], ['http://10.1.2.3', []], ['http://172.20.0.5:8080', []], ['http://192.168.1.9:3000', []], ['http://[::1]:3000', []], ['http://[fd00::1]', []],
  ['http://localhost:3000', []], ['http://box.local', []], ['http://box.lan', []], ['http://nas.home:8080', []], ['https://example.com', []], ['http://8.8.8.8', []], ['http://172.32.0.1', []],
  ['http://evil.com/.lan', []], ['javascript:alert(1)', []], ['http://u:p@10.0.0.1', []], ['https://a.pods.example.test', ['pods.example.test']], ['http://a.pods.example.test', ['pods.example.test']],
  ['https://pods.example.test.evil.net', ['pods.example.test']], ['https://evilpods.example.test', ['pods.example.test']], ['https://a.pods.example.test', ['test']],
];
const diff = TABLE.filter(([o, allow]) => RV.relayTargetVerdict(o, { allow }) !== M.relayTargetVerdict(o, { allow }));
ok(!diff.length && TABLE.some(([o, a]) => M.relayTargetVerdict(o, { allow: a }) === 'redirect') && TABLE.some(([o, a]) => M.relayTargetVerdict(o, { allow: a }) === 'show-code') && RV.CALLBACK_PATH === M.CALLBACK_PATH && RV.PRIVATE_SUFFIXES.join() === M.PRIVATE_SUFFIXES.join(), `① relay.js and slack-manifest.js answer one table alike (${TABLE.length} rows), with the same callback path and private suffixes`, JSON.stringify(diff));
const mut = fs.readFileSync(path.join(DIR, 'relay.js'), 'utf-8').replace("(o[0] === 192 && o[1] === 168)", "(o[0] === 192)");
const mctx = { URL, URLSearchParams, atob }; mctx.globalThis = mctx; vm.createContext(mctx); vm.runInContext(mut, mctx);
ok(TABLE.some(([o, allow]) => mctx.VibeSpaceRelay.relayTargetVerdict(o, { allow }) !== M.relayTargetVerdict(o, { allow })) || mctx.VibeSpaceRelay.relayTargetVerdict('http://192.169.1.1', {}) !== M.relayTargetVerdict('http://192.169.1.1', {}), '① CONTROL: a relay copy whose 192.168/16 rule widened to 192/8 disagrees with the server');

// the static host (serves the page as it ships; `/allow/` = the same page with data-allow="pods.example.test")
const served = [];
const pageSrv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  served.push(u.pathname);
  const allow = u.pathname.startsWith('/allow/');
  const name = u.pathname.replace(/^\/allow/, '') === '/relay.js' ? 'relay.js' : 'index.html';
  let body = fs.readFileSync(path.join(DIR, name), 'utf-8');
  if (allow && name === 'index.html') body = body.replace('data-allow=""', 'data-allow="pods.example.test"');
  res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }).end(body);
}).listen(PAGE_PORT, '127.0.0.1');
const landed = [];   // the instance's hits (the browser's own tab-icon request is not the page's)
const instSrv = http.createServer((req, res) => { if (req.url !== '/favicon.ico') landed.push(req.url); res.writeHead(200, { 'Content-Type': 'text/html' }).end('<p id="landed">instance</p>'); }).listen(INST_PORT, '127.0.0.1');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(143));
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 60 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0; const pend = new Map(); const requests = [];
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url); });
await new Promise((r) => ws.on('open', r));
const cmd = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await cmd('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
await cmd('Network.enable'); await cmd('Page.enable');
await cmd('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });   // the suites' common preset (the page itself writes nothing)
const sign = (c) => crypto.createHmac('sha256', 'k').update(c).digest('base64url');
const state = (u) => M.stateOf({ origin: u, flowId: '0123456789abcdef', issuedAt: Date.now() }, sign);
const open = async (url) => { await cmd('Page.navigate', { url }); for (let i = 0; i < 40; i++) { await sleep(100); const s = await ev('document.readyState + "|" + location.href'); if (s && s.startsWith('complete')) { await sleep(250); return ev('location.href'); } } return ev('location.href'); };
const PAGE = `http://127.0.0.1:${PAGE_PORT}/`, INST = `http://127.0.0.1:${INST_PORT}`;

// ② back to the instance, the query verbatim
const s1 = state(INST);
const q1 = `?code=1111.2222.abcdef&state=${encodeURIComponent(s1)}`;
const at1 = await open(PAGE + q1);
ok(at1 === `${INST}/api/channels/oauth/cb/slack${q1}` && landed.length === 1 && landed[0] === `/api/channels/oauth/cb/slack${q1}`, '② a state naming the instance on 127.0.0.1: the browser lands on its /api/channels/oauth/cb/slack with the query verbatim', JSON.stringify({ at1, landed }));
// ③ the code shown — public host, forged, missing, look-alike under data-allow; declined
const shown = async (url) => { const at = await open(url); return { at, code: await ev("(document.getElementById('code')||{}).textContent || ''"), vis: await ev("['paste','denied','nothing'].filter(function(i){var e=document.getElementById(i);return e&&!e.hidden}).join()") }; };
const r3 = [await shown(PAGE + `?code=3333.4444.abcdef&state=${encodeURIComponent(state('https://example.com'))}`), await shown(PAGE + '?code=5555.6666.abcdef&state=v1.bm90LWpzb24.xxxxxxxxxxxxxxxxxxxxxx'), await shown(PAGE + '?code=7777.8888.abcdef'), await shown(`http://127.0.0.1:${PAGE_PORT}/allow/?code=9999.0000.abcdef&state=${encodeURIComponent(state('https://pods.example.test.evil.net'))}`)];
ok(r3.every((r) => r.at.startsWith(`http://127.0.0.1:${PAGE_PORT}/`) && r.vis === 'paste') && r3.map((r) => r.code).join() === '3333.4444.abcdef,5555.6666.abcdef,7777.8888.abcdef,9999.0000.abcdef' && landed.length === 1, '③ a public host, a forged state, no state, a look-alike of the allow suffix: the page stays, shows the code to paste back, the instance is not visited', JSON.stringify(r3));
const dn = await shown(PAGE + `?error=access_denied&state=${encodeURIComponent(state('https://example.com'))}`);
ok(dn.vis === 'denied' && !dn.code, '③ access_denied with no way back: the page says it was declined');
// ④ the census: only the page's own two files; no storage
const foreign = requests.filter((u) => !/\/favicon\.ico$/.test(u)).filter((u) => !(u.startsWith(PAGE) || u.startsWith(`http://127.0.0.1:${PAGE_PORT}/allow/`) || u.startsWith(`${INST}/api/channels/oauth/cb/slack`)));
const own = [...new Set(served.map((p) => p.replace(/^\/allow/, '')))].sort().join();
const stor = await ev("JSON.stringify([Object.keys(localStorage).filter(function (k) { return k !== 'vs-onboarded'; }).length, sessionStorage.length, document.cookie])");
ok(!foreign.length && own === '/,/relay.js' && stor === '[0,0,""]', `④ CDP census over ${requests.length} requests: the page asks only for itself and relay.js (and the one navigation back); nothing stored`, JSON.stringify({ foreign, own, stor }));
pageSrv.close(); instSrv.close(); ws.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
