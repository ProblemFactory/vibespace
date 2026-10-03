#!/usr/bin/env node
// test-browser-propose-chrome — A REFUSED SIGN-IN BECOMES ONE PROPOSAL WITH ONE APPROVE, on a real page (lane
// browser-propose; the owner, 2026-09-30: the agent PROPOSES the switch, the user only presses Approve; D31 stands).
//
// A THROWAWAY server in a git worktree (own data/, a scratch HOME whose ~/.agent-browser/browsers links the real
// browsers dir, VIBESPACE_TEST_EGRESS_MAP — the reserved `.test` fixture host mapped to loopback for the cloak egress
// proxy) + headless chrome over raw CDP. A stub `claude` runs behind the REAL chat-wrapper through the REAL create path;
// on the user's turn it runs the SHIPPED data/bin/vibespace-browser: `open` of a LOCAL fixture page that reads like
// Google's refusal (its title + its /signin/rejected path — never the real site: the host is `signin.test`, mapped to
// 127.0.0.1 by the chromium config's host-resolver-rules), then `blocked --tier 2`.
//   ① the agent's own chromium browser opened the page with the AUTOMATION FLAG (step 1, production shape): the page's
//      beacon reads navigator.webdriver = false
//   ② ONE proposal card appears AT THE CLAIM'S POSITION (after the agent's Bash card, before its closing words) saying
//      what Approve runs (the download, a new CloakBrowser profile, ONLY signin.test added); ONE For-you item
//   ③ the phone (390 px): the card fits — nothing wider than the screen, every word wraps, Approve / Reject ≥ 44 px
//   ④ an agent's bearer on Approve ⇒ 403 agent_forbidden, nothing moved
//   ⑤ a REAL click on Approve ⇒ the product's own install over the measured CloakBrowser build (package + its cache
//      linked in: nothing downloaded), ONLY signin.test on the site list, a NEW CloakBrowser profile the conversation is
//      pinned to, the CloakBrowser Chrome launched on it under the egress proxy, the page REOPENED there (its beacon
//      arrives from the CloakBrowser build, through the proxy), the card says done in place, the For-you item answered
//   ⑥ the agent is TOLD: its next prompt-context injection carries "Approved: your browser is now CloakBrowser …
//      re-run the sign-in at <url>" and the chat draws that card
// SKIPs by name: no chrome / dtach (everything); no real agent-browser (① and the cloak legs); no measured CloakBrowser
// build (VIBESPACE_TEST_CLOAK_PREFIX + VIBESPACE_TEST_CLOAK_CACHE, the test-browser-share ⑧ pair — ⑤⑥ then run the
// REJECT path instead: nothing is ever downloaded). VS_SHOT_DIR=<dir> keeps the screenshots. ~90 s.
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const V = require('../src/browser-verbs.js');
const SW = require('../src/browser-switch.js');
const B = require('../src/browser-profiles.js');

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
try { execSync('command -v dtach', { stdio: 'ignore', shell: '/bin/bash' }); } catch { console.log('SKIP: dtach is not installed — a chat session cannot be created here'); process.exit(0); }
let failed = 0, passed = 0, skipped = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } return !!c; };
const skip = (n) => { skipped++; console.log(`  ⊘ SKIP ${n}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── what this machine has ──
const isShim = (p) => { try { return /vibespace-browser/.test(fs.readFileSync(p, 'utf8').slice(0, 4096)); } catch { return false; } };
const realAb = V.resolveRealBinary({ PATH: process.env.PATH || '', exists: (p) => fs.existsSync(p), isShim });
const P = B.CLOAK_EGRESS_PROOF;
const CP = process.env.VIBESPACE_TEST_CLOAK_PREFIX || '', CC = process.env.VIBESPACE_TEST_CLOAK_CACHE || '';
let cloakWhy = null;
if (!realAb.ok) cloakWhy = 'the real agent-browser is not on PATH (only the VibeSpace shim, or nothing)';
else if (!CP || !CC) cloakWhy = 'VIBESPACE_TEST_CLOAK_PREFIX / VIBESPACE_TEST_CLOAK_CACHE are not set (no measured CloakBrowser build named for this run)';
else {
  let pkgV = null; try { pkgV = JSON.parse(fs.readFileSync(path.join(CP, 'node_modules', 'cloakbrowser', 'package.json'), 'utf8')).version; } catch { pkgV = null; }
  const cbin = SW.cloakBinaryPath({ cacheDir: CC, chromium: P.chromium, platform: P.platform });
  if (pkgV !== P.version) cloakWhy = `the prefix holds cloakbrowser ${pkgV}, the record describes ${P.version}`;
  else if (!cbin || !fs.existsSync(cbin)) cloakWhy = `no CloakBrowser at ${cbin}`;
  else { const h = crypto.createHash('sha256').update(fs.readFileSync(cbin)).digest('hex'); if (h !== P.binary.sha256) cloakWhy = `the browser's SHA-256 ${h.slice(0, 12)}… is not the record's`; }
}
console.log(`machine: agent-browser ${realAb.ok ? realAb.path : 'absent'} · CloakBrowser ${cloakWhy ? 'unavailable — ' + cloakWhy : P.version + ' / Chromium ' + P.chromium}`);

// ── scratch roots ──
const [PORT, CDP_PORT, PAGE_PORT] = await freePorts(3);
const wt = scratch('bprop-chrome-wt');
const fakeHome = scratchHome('bprop-chrome-home', fs);
const stubDir = scratch('bprop-chrome-stub');
fs.rmSync(stubDir, { recursive: true, force: true });
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
const SID = 'b9a90000-0000-4000-8000-00000000b9a9';
const HOST = 'signin.test';
const REJECTED = `http://${HOST}:${PAGE_PORT}/v3/signin/rejected?TL=AInv3nt3d0x`;
const SIGNIN = `http://${HOST}:${PAGE_PORT}/v3/signin/identifier?TL=AInv3nt3d0y`;
// the agent-browser home: the real browsers dir linked (nothing downloaded), the fixture host mapped to loopback for chromium
fs.mkdirSync(path.join(fakeHome, '.agent-browser'), { recursive: true });
const realBrowsers = path.join(os.homedir(), '.agent-browser', 'browsers'); // the INSTALLED browser, read-only use (test-browser-live's rule): $HOME is the suite's home — never the passwd entry (verify r6: a pinned HOME must be the whole reach; test-architecture §68 census)
if (fs.existsSync(realBrowsers)) fs.symlinkSync(realBrowsers, path.join(fakeHome, '.agent-browser', 'browsers'));
fs.writeFileSync(path.join(fakeHome, '.agent-browser', 'config.json'), JSON.stringify({ args: `--no-sandbox,--host-resolver-rules=MAP ${HOST} 127.0.0.1` }));

// ── the LOCAL fixture page (never a vendor site): a title + a path that read like Google's refusal, and a beacon ──
const hits = [];
const pageSrv = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || HOST}`);
  hits.push({ at: Date.now(), path: u.pathname, host: String(req.headers.host || ''), wd: u.searchParams.get('wd'), ua: u.searchParams.get('ua') || '', via: String(req.headers['proxy-connection'] || req.headers.via || '') });
  if (u.pathname === '/beacon') { res.writeHead(204); res.end(); return; }
  const title = /\/signin\/rejected/.test(u.pathname) ? 'This browser or app may not be secure' : 'Sign in';
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><title>${title}</title><p>${title}</p><script>fetch('/beacon?wd=' + navigator.webdriver + '&p=' + encodeURIComponent(location.pathname) + '&ua=' + encodeURIComponent(navigator.userAgent))</script>`);
});
await new Promise((r) => pageSrv.listen(PAGE_PORT, '127.0.0.1', r));

// ── the worktree (the working src/ + a built public/ overlaid, the shipped data/bin) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
fs.writeFileSync(path.join(wt, 'data', 'settings.json'), JSON.stringify({ 'browser.cloak.egressAllowlist': '' }));
if (!cloakWhy) {
  // the measured build, LINKED in (the product's own install then finds the pinned package + its cache: nothing is downloaded)
  const TOOLS = path.join(wt, 'data', 'browser-tools');
  fs.mkdirSync(path.join(TOOLS, 'node_modules'), { recursive: true, mode: 0o700 });
  fs.symlinkSync(path.join(CP, 'node_modules', 'cloakbrowser'), path.join(TOOLS, 'node_modules', 'cloakbrowser'));
  fs.symlinkSync(CC, path.join(TOOLS, 'cloak-cache'));
}
const CLI = path.join(wt, 'data', 'bin', 'vibespace-browser');
// the shipped CLI reads the ACCOUNT's home off its passwd entry — the scratch HOME stands in for it through a preload
const PW = path.join(stubDir, 'passwd.cjs');
fs.writeFileSync(PW, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(fakeHome)} });\n`);

// ── the stub CLI ──
const CMD = `vibespace-browser open '${REJECTED}'; vibespace-browser blocked --url '${SIGNIN}' --why sign-in-refused --tier 2`;
const stubPath = path.join(stubDir, 'claude');
const TRANSCRIPT = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'), SID + '.jsonl');
fs.mkdirSync(path.dirname(TRANSCRIPT), { recursive: true });
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const { execFile } = require('child_process');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify(process.env));
const SID = ${JSON.stringify(SID)}, CWD = ${JSON.stringify(CWD)}, TR = ${JSON.stringify(TRANSCRIPT)}, CLI = ${JSON.stringify(CLI)}, PW = ${JSON.stringify(PW)};
let n = 0, parent = null; const U = () => 'bp-' + process.pid + '-' + (++n);
const usage = { input_tokens: 1, output_tokens: 1 };
const out = (o) => process.stdout.write(JSON.stringify({ ...o, session_id: SID }) + '\\n');
const both = (o) => { const uuid = U(); const rec = { ...o, uuid, parentUuid: parent, timestamp: new Date().toISOString(), sessionId: SID, cwd: CWD, isSidechain: false, userType: 'external', version: '2.1.281' }; parent = uuid; fs.appendFileSync(TR, JSON.stringify(rec) + '\\n'); out({ ...o, uuid }); };
const run = (argv) => new Promise((res) => execFile(process.execPath, ['--require', PW, CLI, ...argv], { env: process.env, cwd: CWD, timeout: 90000 }, (e, so, se) => res(String(so || '') + String(se || ''))));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
out({ type: 'system', subtype: 'init', model: 'claude-fable-5', cwd: CWD, tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', uuid: U() });
async function toolTurn(k, prompt, command, argvs, text) {
  both({ type: 'user', message: { role: 'user', content: prompt } });
  await wait(250);
  const tid = 'toolu_bp' + k;
  both({ type: 'assistant', message: { id: 'msg_bp' + k + 'a', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command, description: 'browser' } }], stop_reason: 'tool_use', usage } });
  await wait(300);
  let log = '';
  for (const a of argvs) log += await run(a);
  await wait(300);
  both({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: log.slice(0, 4000) || '(no output)', is_error: false }] } });
  await wait(250);
  both({ type: 'assistant', message: { id: 'msg_bp' + k + 'b', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 5, num_turns: 1, result: text, total_cost_usd: 0, usage, uuid: U() });
  fs.appendFileSync(${JSON.stringify(stubDir)} + '/turns.log', k + ' ' + log.replace(/\\n/g, ' | ') + '\\n');
}
let buf = '', chain = Promise.resolve();
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    if (/sign in to the portal/.test(JSON.stringify(m.message || ''))) chain = chain.then(() => toolTurn(1, 'sign in to the portal', ${JSON.stringify(CMD)},
      [['open', ${JSON.stringify(REJECTED)}], ['blocked', '--url', ${JSON.stringify(SIGNIN)}, '--why', 'sign-in-refused', '--evidence', 'the page says: This browser or app may not be secure', '--tier', '2']], 'The site refused this browser. A card in the chat waits for your Approve to switch it to CloakBrowser.'));
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

let srv = null;
const LOG = path.join(stubDir, 'server.log');
const startServer = () => { const fd = fs.openSync(LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_TEST_EGRESS_MAP: `${HOST}=127.0.0.1` }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); };
const waitServer = async () => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
startServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  try { pageSrv.close(); } catch {}
  // every process this suite caused carries one of these scratch paths (dtach, the wrapper, the stub, the daemons, both Chromes)
  for (const pat of [wt, fakeHome, stubDir]) { try { execSync(`pkill -9 -f ${JSON.stringify(pat)}`, { stdio: 'ignore' }); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
check('the worktree server answered', await waitServer());

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
let lastMiss = null;
const realClick = async (sel) => {
  const r = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, w: q.width, h: q.height, hit: hit ? hit.tagName + '.' + String(hit.className).slice(0, 60) : null, hits: !!hit && (hit === e || e.contains(hit)) }; })()`);
  if (!r || !r.hits) { lastMiss = r; return false; }
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await sleep(900); // an Approve that just appeared or moved counts only after it sat still ARM_MS (700 ms — verify r1: the card has the rule too, ④b)
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
};
const shot = async (name, sel, pad = 6) => {
  const dir = process.env.VS_SHOT_DIR;
  if (!dir) return;
  try {
    const r = sel ? await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const q = e.getBoundingClientRect(); return { x: Math.max(0, q.left - ${pad}), y: Math.max(0, q.top - ${pad}), width: q.width + ${2 * pad}, height: q.height + ${2 * pad}, scale: 1 }; })()`) : null;
    const img = await cdp('Page.captureScreenshot', { format: 'png', ...(r ? { clip: r } : {}), captureBeyondViewport: false });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(img.data, 'base64'));
    console.log(`    (screenshot ${name}.png)`);
  } catch (e) { console.log(`    (screenshot ${name} failed: ${e.message})`); }
};
const api = async (method, p, body, headers = {}) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const stubToken = () => { for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) { try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.VIBESPACE_SESSION_TOKEN) return e; } catch {} } return null; };
const VIEW = (sid) => `[...app.sessions.values()].find((v) => v && v.sessionId === ${JSON.stringify(sid)})`;
const CARD = '.chat-browser-proposal';
const cardState = () => evalJs(`(() => { const c = document.querySelector('${CARD}'); if (!c) return null; const txt = (s) => { const e = c.querySelector(s); return e && e.style.display !== 'none' ? e.textContent : ''; }; return { id: c.dataset.proposal, state: c.dataset.state, title: txt('.chat-browser-proposal-title'), claim: txt('.chat-browser-proposal-claim'), plan: [...c.querySelectorAll('.chat-browser-proposal-plan li')].map((l) => l.textContent), none: txt('.chat-browser-proposal-none'), line: txt('.chat-browser-proposal-state'), approve: (() => { const b = c.querySelector('.chat-browser-proposal-approve'); return b && b.offsetParent ? b.textContent : null; })(), reject: (() => { const b = c.querySelector('.chat-browser-proposal-reject'); return b && b.offsetParent ? b.textContent : null; })(), n: document.querySelectorAll('${CARD}').length }; })()`);
const attach = async (sid) => { await evalJs(`app.attachSession(${JSON.stringify(sid)}, 'Portal work', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`); return waitFor(`!!(${VIEW(sid)})?._messageList`, 20000); };

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp(); await sleep(600);

  console.log('setup: a live stub session (the real spawn path)');
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws0.on('open', r));
  const frames = []; ws0.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'bp1', name: 'Portal work' }));
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
  check('a live claude chat session through the real spawn path (stub CLI behind the real wrapper)', !!sid, frames.slice(-3));
  let env = null;
  for (let i = 0; i < 80 && !env; i++) { env = stubToken(); if (!env) await sleep(250); }
  check('the stub has its session token and its browser pairs', !!env && /^vsst_/.test(env.VIBESPACE_SESSION_TOKEN) && /^vs-bk-/.test(env.AGENT_BROWSER_SESSION || ''), env && { tok: !!env.VIBESPACE_SESSION_TOKEN, sess: env.AGENT_BROWSER_SESSION });
  const TOKEN = env && env.VIBESPACE_SESSION_TOKEN;
  for (let i = 0; i < 40; i++) { const r = await api('GET', '/api/active-sessions').catch(() => null); if (r?.body && JSON.stringify(r.body).includes(SID)) break; await sleep(250); }
  check('the chat window attaches', await attach(sid));
  await sleep(500);

  // ── ① + ② the turn: open the refusal page, file the claim ──
  console.log('① ② the agent opens a page that reads like a sign-in refusal and files `blocked --tier 2` ⇒ ONE card at the claim\'s position');
  await evalJs(`app.ws.send({ type: 'chat-input', sessionId: ${JSON.stringify(sid)}, text: 'sign in to the portal' }); true`);
  const gotCard = await waitFor(`!!document.querySelector('${CARD}') && [...document.querySelectorAll('.chat-msg')].some((m) => /A card in the chat waits for your Approve/.test(m.textContent))`, 90000);
  const turns = () => (fs.existsSync(path.join(stubDir, 'turns.log')) ? fs.readFileSync(path.join(stubDir, 'turns.log'), 'utf8').slice(0, 3000) : null);
  check('the turn ran: the CLI opened the page and filed the claim', gotCard && /proposal bl-[0-9a-f]{8}: open/.test(turns() || ''), turns());
  if (realAb.ok) {
    const b0 = hits.find((h) => h.path === '/beacon' && h.host.startsWith(HOST));
    check('① the agent\'s own chromium browser reached the fixture page by its name (host-resolver-rules) and its script read navigator.webdriver = false — the AUTOMATION FLAG, in the production shape (rung D\'s spawn config)', !!b0 && b0.wd === 'false', hits.slice(0, 6));
  } else skip('① the automation flag on a real browser: ' + realAb.error);
  const c0 = await cardState();
  const order = await evalJs(`(() => { const all = [...document.querySelectorAll('.chat-msg')]; const card = all.findIndex((m) => m.matches('${CARD}')); const bash = all.findIndex((m) => m.matches('[data-tool-id="toolu_bp1"]') || !!m.querySelector('[data-tool-id="toolu_bp1"]')); const words = all.findIndex((m) => /A card in the chat waits for your Approve/.test(m.textContent) && !m.matches('${CARD}')); return { card, bash, words, n: all.length }; })()`);
  check('② ONE card, AT THE CLAIM\'S POSITION: after the agent\'s Bash card, before its closing words', c0 && c0.n === 1 && order.bash >= 0 && order.card > order.bash && (order.words < 0 || order.card < order.words), { c0, order });
  const wantInstall = !cloakWhy;
  const prop0 = c0 ? ((await api('GET', `/api/browser/proposals/${c0.id}`)).body || {}).proposal : null;
  const LABEL = prop0 && prop0.plan && prop0.plan.label;
  check('② the proposal (GET, the user\'s route): a NEW CloakBrowser profile for this conversation (its browser is the temporary one), named after it', !!prop0 && prop0.plan.kind === 'new-profile' && prop0.plan.why === 'ephemeral' && / · CloakBrowser$|^CloakBrowser$/.test(LABEL || '') && prop0.site === HOST, prop0);
  check('② the card says what Approve runs: the claim (who says what), the new CloakBrowser profile, ONLY signin.test added, the agent told — and the download when CloakBrowser is not installed', c0 && c0.state === 'open' && /signin\.test refused to sign in this browser/.test(c0.claim) && c0.plan.some((l) => l.includes(`new CloakBrowser profile "${LABEL}"`)) && c0.plan.some((l) => /signin\.test is added \(only that host/.test(l)) && c0.plan.some((l) => /The agent is told when it is done/.test(l)) && (!wantInstall || c0.plan.some((l) => /about \d+ MB is downloaded once from its maker/.test(l))) && c0.approve === 'Approve' && c0.reject === 'Reject', c0);
  await shot('proposal-card-desktop', CARD);
  const items = ((await api('GET', '/api/user-todos')).body || {}).todos;
  const item = items && (items.open || []).find((i) => i.action && i.action.type === 'browser-proposal' && i.action.id === c0.id);
  check('② ONE For-you item (origin browser) carrying the same Approve (the proposal id + its digest)', !!item && item.origin === 'browser' && /^pd-[0-9a-f]{8}$/.test(item.action.shown) && (items.open || []).filter((i) => i.action && i.action.type === 'browser-proposal').length === 1, items && items.open);

  // ── ③ the phone ──
  console.log('③ the phone (390 px): the card fits, its buttons are thumb-sized');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.reload', {}); await waitApp(); await sleep(800);
  check('③ the chat attaches on the phone', await attach(sid));
  await waitFor(`!!document.querySelector('${CARD}')`, 20000);
  const phone = await evalJs(`(() => { const c = document.querySelector('${CARD}'); if (!c) return null; c.scrollIntoView({ block: 'center' }); const vw = window.innerWidth; const r = c.getBoundingClientRect(); const over = [...c.querySelectorAll('*')].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > vw + 0.5 || q.left < -0.5 || e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible'); }).map((e) => e.className || e.tagName); const btn = (s) => { const b = c.querySelector(s); if (!b) return null; const q = b.getBoundingClientRect(); return { h: q.height, w: q.width, visible: !!b.offsetParent }; }; return { vw, card: { left: r.left, right: r.right, width: r.width }, over, approve: btn('.chat-browser-proposal-approve'), reject: btn('.chat-browser-proposal-reject'), lines: [...c.querySelectorAll('.chat-browser-proposal-plan li')].map((l) => { const rg = document.createRange(); rg.selectNodeContents(l); return new Set([...rg.getClientRects()].filter((q) => q.width > 0.5).map((q) => Math.round(q.top))).size; }) }; })()`);
  check('③ nothing of the card is wider than the 390 px screen, and nothing inside it scrolls sideways', phone && phone.vw <= 390 && phone.card.right <= phone.vw + 0.5 && phone.card.left >= -0.5 && phone.over.length === 0, phone);
  check('③ Approve and Reject are ≥ 44 px tall (thumb-sized) and visible; the long plan lines wrap', phone && phone.approve && phone.approve.visible && phone.approve.h >= 44 && phone.reject && phone.reject.h >= 44 && phone.lines.some((n) => n > 1), phone);
  await shot('proposal-card-phone', CARD);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.reload', {}); await waitApp(); await sleep(800);
  check('back on the desktop, the chat re-attaches with the card', await attach(sid) && await waitFor(`!!document.querySelector('${CARD}')`, 20000));

  // ── ④ an agent never approves ──
  console.log('④ owner-only');
  const ag = await api('POST', `/api/browser/proposals/${c0.id}/approve`, { shown: item ? item.action.shown : 'pd-x' }, { Authorization: 'Bearer ' + TOKEN });
  check('④ the agent\'s own bearer on Approve ⇒ 403 agent_forbidden; the card still open', ag.status === 403 && ag.body && ag.body.code === 'agent_forbidden' && (await cardState()).state === 'open', ag);

  if (cloakWhy) {
    skip(`⑤ ⑥ Approve → CloakBrowser: ${cloakWhy} — the REJECT path runs instead (nothing is ever downloaded)`);
    check('the Reject button is a REAL click', await realClick(`${CARD} .chat-browser-proposal-reject`), lastMiss);
    check('Rejected: the card says so in place (no Approve)', await waitFor(`document.querySelector('${CARD}').dataset.state === 'rejected'`, 10000) && /Rejected — the agent is told the next time it opens signin\.test/.test((await cardState()).line) && !(await cardState()).approve, await cardState());
    const itemsR = ((await api('GET', '/api/user-todos')).body || {}).todos || {};
    check('…and the For-you item is answered', !(itemsR.open || []).some((i) => i.action && i.action.type === 'browser-proposal'), itemsR.open);
  } else {
    // ── ④b verify r1: an Approve that just APPEARED under the pointer does not count (the press-arm rule of every approval) ──
    // lane fleet-image-2 (the fleet e2e: ④b red 3 runs of 7 on a pod — after the reload the card moved ~22 px BETWEEN the
    // leg's position read and its press, so the press landed on an unclassed element and no toast came): the leg presses
    // THE ELEMENT IT CHECKED. A page-side recorder names every click's target; a press that missed (the card moved under
    // it) is pressed again at a FRESH rect of the same element handle (bounded); the verdict reads the press that landed.
    console.log('④b a press on Approve the instant the card appears under the pointer does not count — nothing runs, the card says why');
    await cdp('Page.reload', {}); await waitApp();
    await evalJs(`app.attachSession(${JSON.stringify(sid)}, 'Portal work', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
    await evalJs(`(() => { window.__apClicks = []; window.__apToasts = []; document.addEventListener('click', (e) => { const b = window.__apBtn; window.__apClicks.push({ on: !!b && (e.target === b || b.contains(e.target)), target: String((e.target && (e.target.className || e.target.tagName)) || '').slice(0, 60) }); }, true); new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList && n.classList.contains('global-toast')) window.__apToasts.push(n.textContent.slice(0, 160)); }).observe(document.body, { childList: true, subtree: true }); return true; })()`);
    // the Approve's own handle, its fresh centre, whether the point hits it, and how long ago it appeared or moved (the
    // rule's clock — read for the evidence, never to decide). Out of the window, or covered at its centre (the chat's own
    // scroller clips it): scrolled into view, and the NEXT read takes the rect it has then
    const freshPoint = () => evalJs(`(() => { const b = window.__apBtn || document.querySelector('${CARD} .chat-browser-proposal-approve'); if (!b || !b.isConnected || !b.offsetParent) return null; window.__apBtn = b; const q = b.getBoundingClientRect(); if (q.bottom > window.innerHeight || q.top < 0) { b.scrollIntoView({ block: 'center' }); return null; } const x = q.left + q.width / 2, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); if (!(hit === b || b.contains(hit))) { b.scrollIntoView({ block: 'center' }); return null; } return { x, y, top: q.top, armAge: b._armSince != null ? Math.round(performance.now() - b._armSince) : null }; })()`).catch(() => null);
    const pressTheApprove = async (first = null) => {
      const tries = [];
      for (let i = 0; i < 40 && tries.length < 8; i++) {
        const p = i === 0 && first ? first : await freshPoint();
        if (!p) { await sleep(50); continue; }
        const n0 = await evalJs('window.__apClicks.length');
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
        await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
        const clicks = await evalJs(`window.__apClicks.slice(${n0})`);
        tries.push({ x: Math.round(p.x), y: Math.round(p.y), armAge: p.armAge, clicks });
        if (clicks.some((c) => c.on)) return { landed: true, tries };
      }
      return { landed: false, tries };
    };
    const toastsSaid = () => evalJs(`window.__apToasts.filter((x) => /moved under the pointer just now/.test(x)).length`);
    let ap = null;
    for (let i = 0; i < 400 && !ap; i++) { ap = await freshPoint(); if (!ap) await sleep(20); }
    if (ap) {
      const r1 = await pressTheApprove(ap);
      await sleep(1500);
      const cm = await cardState();
      const said = await toastsSaid();
      check('④b the press the instant the card appeared under the pointer did NOT run it: the press landed on the Approve itself, the card still open, its Approve still there, and it says why', r1.landed && cm && cm.state === 'open' && cm.approve === 'Approve' && said >= 1, { tries: r1.tries, cm, said });
      // ④b' THE POD'S RACE, CONSTRUCTED (the dev box never shows it): the card moves 60 px between the leg's read and its
      // press. The press at the read point misses the Approve (the recorder names what it hit), the leg presses the same
      // element at a fresh rect — and an Approve that MOVED under the pointer does not count either. The card keeps its
      // 60 px for the rest of the run: taking it back would be one more move, and ⑤'s press would then wait out the rule.
      await sleep(900); // past ARM_MS: the Approve sat still and counts again — only the move below may refuse the press
      const stale = await freshPoint();
      await evalJs(`(() => { document.querySelector('${CARD}').style.transform = 'translateY(60px)'; return true; })()`);
      const r2 = stale ? await pressTheApprove(stale) : { landed: false, tries: [] };
      await sleep(1000);
      const cm2 = await cardState();
      const said2 = await toastsSaid();
      check('④b\' the race constructed: the press at the point read before the card moved 60 px missed the Approve, and the leg pressed THE Approve at a fresh rect', !!stale && r2.landed && r2.tries.length >= 2 && !r2.tries[0].clicks.some((c) => c.on), { stale, tries: r2.tries });
      check('④b\' …and a press on an Approve that moved under the pointer did NOT run it either: still open, said again', cm2 && cm2.state === 'open' && cm2.approve === 'Approve' && said2 > said, { cm2, said, said2 });
    } else skip('④b the card\'s Approve never became pressable after the reload');
    // ── ⑤ the REAL click on Approve ──
    console.log('⑤ a REAL click on Approve: the install (nothing downloaded), ONLY the host, a new CloakBrowser profile, the page reopened');
    const t0 = Date.now();
    check('the Approve button is a REAL click', await realClick(`${CARD} .chat-browser-proposal-approve`), lastMiss);
    const sawProgress = await waitFor(`/^Approved — /.test(document.querySelector('${CARD} .chat-browser-proposal-state').textContent)`, 15000);
    check('the card says what it is doing, in place (Approved — …)', sawProgress, await cardState());
    const done = await waitFor(`['done', 'failed'].includes(document.querySelector('${CARD}').dataset.state)`, 180000);
    const cd = await cardState();
    check('⑤ DONE: the card, in place, says the conversation now uses the new CloakBrowser profile and the agent hears it with the next message', done && cd.state === 'done' && cd.line.includes(`Done — this conversation now uses the new CloakBrowser profile "${LABEL}". The agent hears it with your next message.`) && !cd.approve && cd.n === 1, { cd, log: fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => /browser-propose|\[browser\] install|cloak/.test(l)).slice(-12) });
    await shot('proposal-card-done', CARD);
    const st = (await api('GET', '/api/settings')).body || {};
    check('⑤ ONLY signin.test was added to the sites CloakBrowser may open', st['browser.cloak.egressAllowlist'] === HOST, st['browser.cloak.egressAllowlist']);
    const inst = (await api('GET', '/api/browser/install')).body || {};
    check('⑤ the product\'s own install ran over the measured build (the stamp names it; nothing downloaded — the package and its cache were already there)', inst.code === 'already_installed' && inst.state && inst.state.step === 'done' && !inst.state.failed, inst.state);
    const prof = ((await api('GET', '/api/browser/profiles')).body || {}).profiles || [];
    const np = prof.find((p) => p.label === LABEL);
    const ses = (await api('GET', `/api/browser/session/${sid}`)).body || {};
    check('⑤ a NEW CloakBrowser profile, this conversation pinned to it and holding its lease', !!np && np.provider === 'cloak' && ses.pin && ses.pin.profileId === np.id && (ses.attachments || []).some((a) => a.profileId === np.id), { np, pin: ses.pin, att: ses.attachments });
    const cbin = fs.realpathSync(SW.cloakBinaryPath({ cacheDir: CC, chromium: P.chromium, platform: P.platform }));
    const mainCloak = fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x)).map((pid) => { try { const exe = fs.readlinkSync(`/proc/${pid}/exe`); const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '); return { pid, exe, cmd }; } catch { return null; } }).find((p) => p && p.exe === cbin && np && p.cmd.includes(np.dir) && !/ --type=/.test(p.cmd));
    check('⑤ the CloakBrowser Chrome runs on that profile\'s directory, under the egress proxy, with its seed', !!mainCloak && /--proxy-server=http:\/\/127\.0\.0\.1:\d+/.test(mainCloak.cmd) && /--fingerprint=\d+/.test(mainCloak.cmd), mainCloak && mainCloak.cmd.slice(0, 600));
    const reopened = await (async () => { for (let i = 0; i < 60; i++) { const b = hits.find((h) => h.at >= t0 && h.path === '/beacon' && /Chrome\/146\./.test(decodeURIComponent(h.ua))); if (b) return b; await sleep(250); } return null; })();
    check('⑤ the page REOPENED on CloakBrowser: its beacon arrived from the CloakBrowser build (Chrome 146) through the proxy to the fixture host', !!reopened && reopened.host.startsWith(HOST), { reopened, recent: hits.filter((h) => h.at >= t0).slice(-6) });
    const items2 = ((await api('GET', '/api/user-todos')).body || {}).todos || {};
    check('⑤ the For-you item is answered (the user\'s press)', !(items2.open || []).some((i) => i.action && i.action.type === 'browser-proposal') && (items2.resolved || []).some((i) => i.id === (item && item.id) && i.status === 'done'), { open: items2.open, resolved: (items2.resolved || []).slice(0, 3) });

    // ── ⑥ the agent is told ──
    console.log('⑥ the agent is TOLD: its next prompt-context carries the approved words, and the chat draws that card');
    const pc = await api('GET', '/api/agent/prompt-context', undefined, { Authorization: 'Bearer ' + TOKEN });
    const ctxText = JSON.stringify(pc.body || '');
    check('⑥ the agent\'s next injection (what its hook asks) carries "Approved: your browser is now CloakBrowser … Re-run the sign-in at <the page>" — free, never a wake', pc.status === 200 && /Approved: your browser is now CloakBrowser/.test(ctxText) && ctxText.includes('Re-run the sign-in at ' + SIGNIN), ctxText.slice(0, 600));
    check('⑥ …and the chat draws that notice card where the agent received it', await waitFor(`[...document.querySelectorAll('.chat-msg')].some((m) => !m.matches('${CARD}') && /your browser is now CloakBrowser/.test(m.textContent))`, 10000));

    // ── ⑦ verify r1 V7: the SAME Approve / Reject where the item appears in For you — the popup row and the window ──
    console.log('⑦ For you: the proposal\'s row (popup) answers Approve, the For-you window answers Reject — the same routes, the same card patched');
    const claimFor = async (h) => { const r = await api('POST', '/api/agent/browser/blocked', { url: `http://${h}:${PAGE_PORT}/x`, why: 'egress-refused', tier: 2 }, { Authorization: 'Bearer ' + TOKEN }); return r.body && r.body.claim && r.body.claim.id; };
    const pA = await claimFor('parts.test');
    const pvA = pA ? ((await api('GET', `/api/browser/proposals/${pA}`)).body || {}).proposal : null;
    check('⑦ the agent\'s claim for a site its CloakBrowser list lacks is a SITE card (its browser already is CloakBrowser)', !!pvA && pvA.plan.kind === 'site' && pvA.state === 'open', pvA);
    check('⑦ the For-you button opens the popup', await realClick('#taskbar-user-todos') && await waitFor(`!!document.querySelector('#user-todos-popup:not(.hidden) .ut-proposal-approve')`, 10000), lastMiss);
    const rowWords = await evalJs(`(() => { const b = document.querySelector('#user-todos-popup .ut-proposal-approve'); const row = b && b.closest('[data-id]'); return row ? row.textContent : null; })()`);
    check('⑦ the popup row shows what Approve runs ABOVE its Approve (the card\'s words: parts.test is added)', /parts\.test is added \(only that host\)/.test(rowWords || ''), rowWords && rowWords.slice(0, 400));
    // a person's press where the row already shows (no scrollIntoView: the popup's arm samples at its row passes and at the
    // press, so a scroll of the popup between them re-arms the press — the held LOW of verify r1)
    const rowAt = await evalJs(`(() => { const b = document.querySelector('#user-todos-popup .ut-proposal-approve'); if (!b) return null; const q = b.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hits: !!hit && (hit === b || b.contains(hit)), inView: q.top >= 0 && q.bottom <= window.innerHeight }; })()`);
    let pressedRow = false;
    if (rowAt && rowAt.hits && rowAt.inView) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rowAt.x, y: rowAt.y });
      await sleep(900);
      const armDiag = `(() => { const b = document.querySelector('#user-todos-popup .ut-proposal-approve'); return b ? { top: b.getBoundingClientRect().top, armTop: b._armTop ?? null, armSince: b._armSince ?? null, now: performance.now(), toasts: [...document.querySelectorAll('#global-toasts *')].map((e) => e.textContent).filter(Boolean).slice(-2) } : null; })()`;
      rowAt.before = await evalJs(armDiag);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: rowAt.x, y: rowAt.y, button: 'left', clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rowAt.x, y: rowAt.y, button: 'left', clickCount: 1 });
      await sleep(150);
      rowAt.after = await evalJs(armDiag);
      console.log('    · the row press: ' + JSON.stringify(rowAt));
      pressedRow = true;
    }
    check('⑦ a REAL click on the row\'s Approve (where it shows)', pressedRow, rowAt);
    let doneA = null; for (let i = 0; i < 80 && !doneA; i++) { const q = ((await api('GET', `/api/browser/proposals/${pA}`)).body || {}).proposal; if (q && ['done', 'failed'].includes(q.state)) doneA = q; else await sleep(250); }
    const stA = (await api('GET', '/api/settings')).body || {};
    const diagA = doneA ? null : await evalJs(`(() => ({ toasts: [...document.querySelectorAll('#global-toasts *')].map((e) => e.textContent).filter(Boolean).slice(-4), popupOpen: !document.getElementById('user-todos-popup').classList.contains('hidden'), btn: (() => { const b = document.querySelector('#user-todos-popup .ut-proposal-approve'); return b ? { disabled: b.disabled, since: b._armSince, now: performance.now(), row: b.closest('[data-id]') && b.closest('[data-id]').dataset.id } : null; })() }))()`).catch((e) => String(e));
    check('⑦ the row\'s Approve ran the SITE plan: done, parts.test on CloakBrowser\'s list (nothing else switched)', !!doneA && doneA.state === 'done' && doneA.outcome && doneA.outcome.code === 'site-added' && String(stA['browser.cloak.egressAllowlist']).split(',').includes('parts.test'), { doneA, list: stA['browser.cloak.egressAllowlist'], diagA, proposal: ((await api('GET', `/api/browser/proposals/${pA}`)).body || {}).proposal });
    check('⑦ …and the chat card of it says done, in place', await waitFor(`[...document.querySelectorAll('${CARD}')].some((c) => c.dataset.proposal === ${JSON.stringify(pA)} && c.dataset.state === 'done' && /CloakBrowser may now open parts\.test/.test(c.textContent))`, 10000));
    await evalJs(`document.getElementById('taskbar-user-todos').click(); true`); // close the popup
    const pB = await claimFor('parts2.test');
    const itB = ((((await api('GET', '/api/user-todos')).body || {}).todos || {}).open || []).find((i) => i.action && i.action.type === 'browser-proposal' && i.action.id === pB);
    check('⑦ a second site claim ⇒ its For-you item', !!itB, pB);
    if (itB) {
      await evalJs(`app.openInbox({ itemId: ${JSON.stringify(itB.id)} }); true`);
      check('⑦ the For-you window shows the item with Approve and Reject', await waitFor(`!!document.querySelector('.iw-act[data-act="proposal-approve"]') && !!document.querySelector('.iw-act[data-act="proposal-reject"]')`, 10000));
      check('⑦ a REAL click on the window\'s Reject', await realClick('.iw-act[data-act="proposal-reject"]'), lastMiss);
      let rjB = null; for (let i = 0; i < 40 && !rjB; i++) { const q = ((await api('GET', `/api/browser/proposals/${pB}`)).body || {}).proposal; if (q && q.state === 'rejected') rjB = q; else await sleep(250); }
      const stB = (await api('GET', '/api/settings')).body || {};
      check('⑦ the window\'s Reject rejected it: nothing added, the card says so in place', !!rjB && !String(stB['browser.cloak.egressAllowlist']).split(',').includes('parts2.test') && await waitFor(`[...document.querySelectorAll('${CARD}')].some((c) => c.dataset.proposal === ${JSON.stringify(pB)} && c.dataset.state === 'rejected')`, 10000), rjB);
    }
  }
  check('no page error in the client', pageErrors.length === 0, pageErrors.slice(0, 4));
} catch (e) {
  failed++; console.error('✗ threw: ' + (e && e.stack || e));
}
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'} (${passed} passed${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(failed ? 1 : 0);
