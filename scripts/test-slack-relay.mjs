#!/usr/bin/env node
// THE SLACK RELAY PAGE IN A REAL BROWSER (lane slack-workspace-app, design 018). docs/slack-relay/ is served as it ships
// (index.html + relay.js, its own CSP) by a static server standing in for the https host; a second server stands in
// for a VibeSpace instance on 127.0.0.1. Headless Chrome opens the page the way Slack redirects to it:
//   ① the rule: relay.js's relayTargetVerdict equals src/channels/slack-manifest.js's over one table (private networks,
//      public hosts, look-alikes, the allow suffix; backlog B-be43: Tailscale's 100.64/10 and *.ts.net are private, a
//      public 100.x outside the /10 and ts.net look-alikes are not) — the page and the server never disagree
//   ② a state naming the instance (127.0.0.1): the browser lands on <instance>/api/channels/oauth/cb/slack with the
//      query VERBATIM (the instance sees code + state + nothing else)
//   ③ a state naming a public host, a forged / missing state, a look-alike under a data-allow page: the code is SHOWN
//      (Copy), no navigation; an `error=access_denied` with no way back says "declined"
//   ④ CDP no-network census: across every load the page asks for index.html and relay.js only — no fetch, beacon,
//      font, image or third-party script; nothing in localStorage / sessionStorage / cookies
//   ⑥ lane oauth-relay-road (one registered address per app — the page serves EVERY kind): the ONE table × every kind a
//      landing serves (slack, dropline, lark, gmail — each passes KIND_RE): the page redirects exactly when
//      slack-manifest's verdict does, to /api/channels/oauth/cb/<kind>; in Chrome a Lark state (code + state) and a Gmail
//      state (Google's code + scope + authuser + prompt) land on /cb/lark and /cb/gmail with the query VERBATIM, through
//      the public copy (a private instance) and the admin copy (data-allow = the fleet's domain: an https pod)
// Run: node scripts/test-slack-relay.mjs   (SKIPs without chrome)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, PRESET_KEYS } from './scratch.mjs';
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
  // backlog B-be43: Tailscale — the tailnet's CGNAT range 100.64.0.0/10 (both edges) and MagicDNS *.ts.net; CONTROLS: a
  // public 100.x just outside the /10, a bare ts.net, look-alikes (evilts.net, a ts.net label under another domain)
  ['http://100.64.0.1:3456', []], ['http://100.101.102.103:3456', []], ['http://100.127.255.254', []], ['https://hub.tail1234.ts.net', []], ['http://hub.tail1234.ts.net:3456', []],
  ['http://100.63.255.255', []], ['http://100.128.0.1', []], ['http://100.1.2.3', []], ['https://ts.net', []], ['https://hub.evilts.net', []], ['https://hub.ts.net.evil.com', []],
];
// backlog B-be43: the Tailscale rows say what they mean (the table above only proves the two functions agree)
{
  const v = (o) => M.relayTargetVerdict(o, { allow: [] });
  const ts = ['http://100.64.0.1:3456', 'http://100.101.102.103:3456', 'http://100.127.255.254', 'https://hub.tail1234.ts.net', 'http://hub.tail1234.ts.net:3456'];
  const ctl = ['http://100.63.255.255', 'http://100.128.0.1', 'http://100.1.2.3', 'https://ts.net', 'https://hub.evilts.net', 'https://hub.ts.net.evil.com'];
  ok(ts.every((o) => v(o) === 'redirect') && ctl.every((o) => v(o) === 'show-code'), `① a hub reached over Tailscale is private — 100.64.0.0/10 (both edges) and *.ts.net redirect; CONTROLS: a public 100.x outside the /10 (100.63.255.255, 100.128.0.1, 100.1.2.3), a bare ts.net and look-alikes stay show-code`, JSON.stringify([...ts, ...ctl].map((o) => [o, v(o)])));
}
const diff = TABLE.filter(([o, allow]) => RV.relayTargetVerdict(o, { allow }) !== M.relayTargetVerdict(o, { allow }));
ok(!diff.length && TABLE.some(([o, a]) => M.relayTargetVerdict(o, { allow: a }) === 'redirect') && TABLE.some(([o, a]) => M.relayTargetVerdict(o, { allow: a }) === 'show-code') && RV.CALLBACK_PATH === M.CALLBACK_PATH && RV.PRIVATE_SUFFIXES.join() === M.PRIVATE_SUFFIXES.join(), `① relay.js and slack-manifest.js answer one table alike (${TABLE.length} rows), with the same callback path and private suffixes`, JSON.stringify(diff));
// lane voice-p1-oauth-teach: the state's `k` (account kind) — absent = slack; dropline lands on its own door; a malformed
// kind never builds a path (the code is shown instead)
{
  const sg = (c) => crypto.createHmac('sha256', 'k').update(c).digest('base64url');
  const DO = require(path.join(repo, 'src/server/dropline-oauth.js'));
  const sd = DO.stateOf({ origin: 'http://192.168.1.20:3456', flowId: '0123456789abcdef', issuedAt: Date.now() }, sg);
  const ss = M.stateOf({ origin: 'http://192.168.1.20:3456', flowId: '0123456789abcdef', issuedAt: Date.now() }, sg);
  const clear = (o) => `v1.${Buffer.from(JSON.stringify(o)).toString('base64url')}.${'A'.repeat(43)}`;
  const d1 = RV.decide(`?code=abcd.efgh.1234&state=${encodeURIComponent(sd)}`, []);
  const d2 = RV.decide(`?code=abcd.efgh.1234&state=${encodeURIComponent(ss)}`, []);
  const d3 = RV.decide(`?code=abcd.efgh.1234&state=${encodeURIComponent(clear({ u: 'http://192.168.1.20:3456', f: '0123456789abcdef', t: 1, k: '../../api/x' }))}`, []);
  ok(d1.act === 'redirect' && d1.to.startsWith('http://192.168.1.20:3456/api/channels/oauth/cb/dropline?code=') && d2.to.startsWith('http://192.168.1.20:3456/api/channels/oauth/cb/slack?') && d3.act === 'show-code' && RV.stateKind(ss) === 'slack' && RV.stateKind(sd) === 'dropline', 'k: a dropline state goes back to /cb/dropline, a Slack state (no k) to /cb/slack, a malformed k shows the code (never a built path)', JSON.stringify({ d1, d2, d3 }));
}
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
const stor = await ev(`JSON.stringify([Object.keys(localStorage).filter(function (k) { return ${JSON.stringify(Object.keys(PRESET_KEYS))}.indexOf(k) < 0; }).length, sessionStorage.length, document.cookie])`);
ok(!foreign.length && own === '/,/relay.js' && stor === '[0,0,""]', `④ CDP census over ${requests.length} requests: the page asks only for itself and relay.js (and the one navigation back); nothing stored`, JSON.stringify({ foreign, own, stor }));
// ⑤ lane voice-p1-oauth-teach: a dropline state (k) in a real browser lands on the instance's /cb/dropline
{
  const DO = require(path.join(repo, 'src/server/dropline-oauth.js'));
  const qd = `?code=2222.3333.abcdef&state=${encodeURIComponent(DO.stateOf({ origin: INST, flowId: '0123456789abcdef', issuedAt: Date.now() }, sign))}`;
  const atd = await open(PAGE + qd);
  ok(atd === `${INST}/api/channels/oauth/cb/dropline${qd}` && landed[landed.length - 1] === `/api/channels/oauth/cb/dropline${qd}`, '⑤ a dropline state (k=dropline) in Chrome: the page sends the browser to the instance\'s /api/channels/oauth/cb/dropline, the query verbatim', atd);
}
// ⑥ lane oauth-relay-road: every kind through the ONE table, then Lark and Google's own queries in Chrome
{
  const CR = require(path.join(repo, 'src/consent-road.js'));
  const DO = require(path.join(repo, 'src/server/dropline-oauth.js'));
  const LANDED_KINDS = ['slack', 'dropline', 'lark', 'gmail'];
  const stateFor = (k, u) => (k === 'slack' ? M.stateOf({ origin: u, flowId: '0123456789abcdef', issuedAt: Date.now() }, sign)
    : k === 'dropline' ? DO.stateOf({ origin: u, flowId: '0123456789abcdef', issuedAt: Date.now() }, sign)
      : CR.stateOf({ origin: u, flowId: '0123456789abcdef', issuedAt: Date.now(), kind: k }, sign));
  const wrong = [];
  for (const k of LANDED_KINDS) for (const [o, allow] of TABLE) {
    if (!M.originOf(o)) continue;   // the state carries only a canonical origin (stateOf's own rule)
    const d = RV.decide(`?code=abcd.efgh.1234&state=${encodeURIComponent(stateFor(k, o))}`, allow);
    const want = M.relayTargetVerdict(o, { allow }) === 'redirect';
    if (want !== (d.act === 'redirect') || (want && !d.to.startsWith(`${M.originOf(o)}/api/channels/oauth/cb/${k}?code=`))) wrong.push({ k, o, allow, d });
  }
  ok(!wrong.length && LANDED_KINDS.every((k) => /^[a-z][a-z0-9-]{1,19}$/.test(k) && RV.stateKind(stateFor(k, INST)) === k), `⑥ the ONE table × every landed kind (${LANDED_KINDS.join(', ')}): the page redirects exactly when the server's verdict does, to /api/channels/oauth/cb/<kind>`, JSON.stringify(wrong).slice(0, 600));
  const ql = `?code=lark-relay-code-01&state=${encodeURIComponent(stateFor('lark', INST))}`;
  const atl = await open(PAGE + ql);
  const qg = `?code=4%2F0Ab-relay-google-01&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.modify+openid&authuser=0&prompt=consent&state=${encodeURIComponent(stateFor('gmail', INST))}`;
  const atg = await open(PAGE + qg);
  ok(atl === `${INST}/api/channels/oauth/cb/lark${ql}` && atg === `${INST}/api/channels/oauth/cb/gmail${qg}` && landed.includes(`/api/channels/oauth/cb/gmail${qg}`),
    '⑥ in Chrome, the public copy: a Lark state lands on <instance>/cb/lark, a Gmail state on /cb/gmail — Google\'s code, scope, authuser and prompt VERBATIM', JSON.stringify({ atl, atg }));
  const pod = 'https://alice.pods.example.test';
  const qp = `?code=lark-relay-code-02&state=${encodeURIComponent(stateFor('lark', pod))}`;
  const allowed = RV.decide(qp, ['pods.example.test']);
  const pub = await shown(PAGE + qp);
  ok(allowed.act === 'redirect' && allowed.to === `${pod}/api/channels/oauth/cb/lark${qp}` && pub.vis === 'paste' && pub.code === 'lark-relay-code-02',
    '⑥ an https pod: the admin copy (data-allow = the fleet\'s domain) sends it on; the public copy shows the code instead (it sends back private addresses only)', JSON.stringify({ allowed, pub }));
}
pageSrv.close(); instSrv.close(); ws.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
