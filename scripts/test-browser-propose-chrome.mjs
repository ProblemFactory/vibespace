#!/usr/bin/env node
// test-browser-propose-chrome — A REFUSED SIGN-IN BECOMES ONE PROPOSAL, on a real page (lane browser-propose; the owner,
// 2026-09-30: the agent PROPOSES, the user decides; D31 stands). lane engine-spi-egress L3 (主开发's D1 / D5): the
// anti-bot backend left the core with every plan that switched a browser — the proposal now offers nothing, and its card
// says the one sentence that is true with or without a browser plugin.
//
// A THROWAWAY server in a git worktree (own data/, a scratch HOME whose ~/.agent-browser/browsers links the real
// browsers dir) + headless chrome over raw CDP. A stub `claude` runs behind the REAL chat-wrapper through the REAL create
// path; on the user's turn it runs the SHIPPED data/bin/vibespace-browser: `open` of a LOCAL fixture page that reads like
// Google's refusal (its title + its /signin/rejected path — never the real site: the host is `signin.test`, mapped to
// 127.0.0.1 by the chromium config's host-resolver-rules), then `blocked --tier 2`.
//   ① the agent's own chromium browser opened the page with the AUTOMATION FLAG (step 1, production shape): the page's
//      beacon reads navigator.webdriver = false
//   ② ONE proposal card appears AT THE CLAIM'S POSITION (after the agent's Bash card, before its closing words): the
//      claim, then D5's sentence — no plan, no Approve, no Reject; ONE For-you NOTICE carrying the same words
//   ③ the phone (390 px): the card fits — nothing wider than the screen, its sentence wraps
//   ④ an agent's bearer on Approve ⇒ 403 agent_forbidden; the user's Approve ⇒ 409 proposal_unavailable; nothing moved
//   ⑤ a reload draws the same card from the keeper's record (unavailable, still no buttons); the For-you popup row shows
//      the sentence and offers no Approve
// SKIPs by name: no chrome / dtach (everything); no real agent-browser (①). VS_SHOT_DIR=<dir> keeps the screenshots. ~40 s.
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const V = require('../src/browser-verbs.js');
const SW = require('../src/browser-switch.js');
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
console.log(`machine: agent-browser ${realAb.ok ? realAb.path : 'absent'}`);

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
      [['open', ${JSON.stringify(REJECTED)}], ['blocked', '--url', ${JSON.stringify(SIGNIN)}, '--why', 'sign-in-refused', '--evidence', 'the page says: This browser or app may not be secure', '--tier', '2']], 'The site refused this browser — I told you on the card in the chat.'));
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

let srv = null;
const LOG = path.join(stubDir, 'server.log');
const startServer = () => { const fd = fs.openSync(LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); };
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
  const gotCard = await waitFor(`!!document.querySelector('${CARD}') && [...document.querySelectorAll('.chat-msg')].some((m) => /I told you on the card in the chat/.test(m.textContent))`, 90000);
  const turns = () => (fs.existsSync(path.join(stubDir, 'turns.log')) ? fs.readFileSync(path.join(stubDir, 'turns.log'), 'utf8').slice(0, 3000) : null);
  check('the turn ran: the CLI opened the page and filed the claim (its proposal offers nothing)', gotCard && /proposal bl-[0-9a-f]{8}: nothing can be offered here/.test(turns() || ''), turns());
  if (realAb.ok) {
    const b0 = hits.find((h) => h.path === '/beacon' && h.host.startsWith(HOST));
    check('① the agent\'s own chromium browser reached the fixture page by its name (host-resolver-rules) and its script read navigator.webdriver = false — the AUTOMATION FLAG, in the production shape (rung D\'s spawn config)', !!b0 && b0.wd === 'false', hits.slice(0, 6));
  } else skip('① the automation flag on a real browser: ' + realAb.error);
  const c0 = await cardState();
  const order = await evalJs(`(() => { const all = [...document.querySelectorAll('.chat-msg')]; const card = all.findIndex((m) => m.matches('${CARD}')); const bash = all.findIndex((m) => m.matches('[data-tool-id="toolu_bp1"]') || !!m.querySelector('[data-tool-id="toolu_bp1"]')); const words = all.findIndex((m) => /I told you on the card in the chat/.test(m.textContent) && !m.matches('${CARD}')); return { card, bash, words, n: all.length }; })()`);
  check('② ONE card, AT THE CLAIM\'S POSITION: after the agent\'s Bash card, before its closing words', c0 && c0.n === 1 && order.bash >= 0 && order.card > order.bash && (order.words < 0 || order.card < order.words), { c0, order });
  const prop0 = c0 ? ((await api('GET', `/api/browser/proposals/${c0.id}`)).body || {}).proposal : null;
  check('② the proposal (GET, the user\'s route): unavailable from birth — plan none, the site = signin.test', !!prop0 && prop0.state === 'unavailable' && prop0.plan.kind === 'none' && prop0.plan.why === 'unavailable' && prop0.site === HOST, prop0);
  const D5 = SW.NO_SWITCH_WORDS.unavailable;
  check('② the card says who claims what, then D5\'s sentence (⚙ → Plugins → Install plugin…, Change build…) — no plan list, no Approve, no Reject', c0 && c0.state === 'unavailable' && /The agent says a site refused its browser/.test(c0.title) && /signin\.test refused to sign in this browser/.test(c0.claim) && c0.plan.length === 0 && c0.none === D5 && !c0.approve && !c0.reject, c0);
  await shot('proposal-card-desktop', CARD);
  const items = ((await api('GET', '/api/user-todos')).body || {}).todos;
  const mine = (items && items.open || []).filter((i) => i.origin === 'browser' && /signin\.test refused its browser/.test(i.text || ''));
  check('② ONE For-you NOTICE (origin browser, no Approve) carrying the card\'s words', mine.length === 1 && mine[0].kind === 'notice' && !mine[0].action && String(mine[0].detail || '').includes(D5), items && items.open);

  // ── ③ the phone ──
  console.log('③ the phone (390 px): the card fits, its sentence wraps');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.reload', {}); await waitApp(); await sleep(800);
  check('③ the chat attaches on the phone', await attach(sid));
  await waitFor(`!!document.querySelector('${CARD}')`, 20000);
  const phone = await evalJs(`(() => { const c = document.querySelector('${CARD}'); if (!c) return null; c.scrollIntoView({ block: 'center' }); const vw = window.innerWidth; const r = c.getBoundingClientRect(); const over = [...c.querySelectorAll('*')].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > vw + 0.5 || q.left < -0.5 || e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible'); }).map((e) => e.className || e.tagName); const none = c.querySelector('.chat-browser-proposal-none'); const rows = (() => { if (!none) return 0; const rg = document.createRange(); rg.selectNodeContents(none); return new Set([...rg.getClientRects()].filter((q) => q.width > 0.5).map((q) => Math.round(q.top))).size; })(); return { vw, card: { left: r.left, right: r.right, width: r.width }, over, rows, buttons: [...c.querySelectorAll('button')].filter((b) => b.offsetParent).length }; })()`);
  check('③ nothing of the card is wider than the 390 px screen, and nothing inside it scrolls sideways', phone && phone.vw <= 390 && phone.card.right <= phone.vw + 0.5 && phone.card.left >= -0.5 && phone.over.length === 0, phone);
  check('③ its sentence wraps, and no button shows', phone && phone.rows > 1 && phone.buttons === 0, phone);
  await shot('proposal-card-phone', CARD);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.reload', {}); await waitApp(); await sleep(800);
  check('back on the desktop, the chat re-attaches with the card', await attach(sid) && await waitFor(`!!document.querySelector('${CARD}')`, 20000));

  // ── ④ nobody approves what offers nothing ──
  console.log('④ owner-only, and nothing to approve');
  const ag = await api('POST', `/api/browser/proposals/${c0.id}/approve`, { shown: prop0 ? prop0.digest : 'pd-x' }, { Authorization: 'Bearer ' + TOKEN });
  check('④ the agent\'s own bearer on Approve ⇒ 403 agent_forbidden', ag.status === 403 && ag.body && ag.body.code === 'agent_forbidden', ag);
  const us = await api('POST', `/api/browser/proposals/${c0.id}/approve`, { shown: prop0 ? prop0.digest : 'pd-x' });
  check('④ the user\'s Approve of it ⇒ 409 proposal_unavailable (the card offers none; nothing ran)', us.status === 409 && us.body && us.body.code === 'proposal_unavailable', us);
  const profs = ((await api('GET', '/api/browser/profiles')).body || {}).profiles || [];
  check('④ …and nothing moved: the card still unavailable, no profile made', (await cardState()).state === 'unavailable' && profs.length === 0, { card: await cardState(), profs: profs.map((p) => p.label) });

  // ── ⑤ the same words everywhere it shows ──
  console.log('⑤ a reload draws the same card; the For-you popup row says the sentence and offers no Approve');
  await cdp('Page.reload', {}); await waitApp(); await sleep(800);
  check('⑤ the chat re-attaches', await attach(sid));
  check('⑤ the reloaded card is the keeper\'s record: the same id, unavailable, still no buttons', await waitFor(`!!document.querySelector('${CARD}')`, 20000) && await (async () => { const c = await cardState(); return c && c.id === c0.id && c.state === 'unavailable' && c.none === D5 && !c.approve && !c.reject; })(), await cardState());
  check('⑤ the For-you button opens the popup', await realClick('#taskbar-user-todos') && await waitFor(`[...document.querySelectorAll('#user-todos-popup:not(.hidden) [data-id]')].some((r) => /signin\\.test refused its browser/.test(r.textContent))`, 10000), lastMiss);
  const row = await evalJs(`(() => { const r = [...document.querySelectorAll('#user-todos-popup [data-id]')].find((x) => /signin\\.test refused its browser/.test(x.textContent)); return r ? { text: r.textContent.slice(0, 600), approve: !!r.querySelector('.ut-proposal-approve') } : null; })()`);
  check('⑤ the popup row: the notice\'s words, no Approve', !!row && !row.approve, row);
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`); // close the popup
  check('no page error in the client', pageErrors.length === 0, pageErrors.slice(0, 4));
} catch (e) {
  failed++; console.error('✗ threw: ' + (e && e.stack || e));
}
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'} (${passed} passed${failed ? `, ${failed} failed` : ''}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(failed ? 1 : 0);
