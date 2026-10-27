#!/usr/bin/env node
// WHO MAY USE A STORED SECRET, AND THE WINDOW THAT FINDS IT — IN A REAL PAGE (heavy, chrome — lane vault-use-grants; the owner
// 2026-10-27: 「我现在完全无法在 vault 里看到刚才建立的密码」 — measured: an OPEN Vault window learnt nothing until reopened — and
// 「每个密码请求都要我同意太麻烦了！」). A worktree hub WITH a sign-in password, a stub CLI behind the REAL chat wrapper (a live
// conversation «Home network» with its own session token — the suite plays its agent), a fake `curl` in a read-only folder on
// the hub's PATH, a real headless Chrome with TWO pages of one sign-in (the WATCHING one and the STORING one):
//   ① sign in, set the second password from the page, the live conversation and its token
//   ② THE LIVE LIST (the owner's symptom): the watching page holds the Vault window open with «Unifi» typed — «no match»
//      NAMES what it searched; the agent asks (`vibespace-vault request … --name "UniFi UCG-Fiber admin (192.168.1.1)"
//      --host 192.168.1.1`); the STORING page answers it through the request route ⇒ the row appears in the watching window
//      WITHOUT a reopen (the search box kept, the «N stored values» line follows), its origin «Filled by you · asked for by
//      Home network»; the request box SAID the default before the paste
//   ③ NO CARD: the agent's `vibespace-vault run --env T=<ref> -- curl https://192.168.1.1/…` runs at once (the default grant) —
//      its output scrubbed; the row's chip «Home network · 192.168.1.1 · used 1×» arrives by itself
//   ④ THE CARD THAT NAMES THE GRANT: a run to 10.0.0.9 files its card — «a standing approval exists … this run is outside it:
//      10.0.0.9» — denied
//   ⑤ 「Who may use it…」: THE principal picker (All agents + the live conversation), the hosts, the end; All agents added ⇒
//      验证是你 first (a widening), then the chip; ✕ takes it back with a click
//   ⑥ «no match» under a picked purpose («Kept by agents») names it + 「Search all」 ⇒ the row
//   --shots <dir> keeps vug-*.png (the search before / after, the picker, the card naming the grant).
//   RED CONTROL: this suite over the base tree (6428c67e) — ② the row never appears without a reopen; ③–⑥ do not exist.
// Run: node scripts/test-vault-use-grants-chrome.mjs [--shots <dir>]   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('vug-wt'), PROFILE = scratch('vug-chrome'), fakeHome = scratch('vug-home'), stubDir = scratch('vug-stub'), fakeBin = scratch('vug-bin');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : null;
for (const d of [fakeHome, stubDir, fakeBin, ...(SHOTS ? [SHOTS] : [])]) fs.mkdirSync(d, { recursive: true });
const CWD = path.join(fakeHome, 'project'); fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIGN_IN = 'vug-leg-sign-in-7';
const SECOND = 'vug leg second password';
const SID = crypto.randomUUID();
const VALUE = ['unifi', 'admin', 'value', crypto.randomBytes(8).toString('hex')].join('-');
const LABEL = 'UniFi UCG-Fiber admin (192.168.1.1)';

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'docs/agent']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
// the stub CLI: a live conversation (its init names SID); it answers nothing — the suite plays its agent
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify(process.env));
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', session_id: ${JSON.stringify(SID)}, uuid: 'u-' + process.pid }) + '\\n');
process.stdin.on('data', () => {});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
// a fake `curl` in a READ-ONLY folder on the hub's PATH (the door's «an agent could have written it» is false)
fs.writeFileSync(path.join(fakeBin, 'curl'), `#!${process.execPath}\nprocess.stdout.write('curl got ' + process.env.T + ' for ' + process.argv.slice(2).join(' ') + '\\n');\n`, { mode: 0o555 });
fs.chmodSync(fakeBin, 0o555);

const LOG = path.join(stubDir, 'server.log');
let srv = null;
const startServer = () => { const fd = fs.openSync(LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PATH: fakeBin + ':' + process.env.PATH, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: SIGN_IN }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); };
const stopServer = async () => { const p = srv; srv = null; if (!p) return; p.kill('SIGTERM'); await new Promise((r) => { const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { } r(); }, 8000); if (p.exitCode !== null || p.signalCode !== null) { clearTimeout(t); r(); return; } p.once('exit', () => { clearTimeout(t); r(); }); }); };
const ready = async (ms = 60000) => { const t0 = Date.now(); for (;;) { try { const r = await fetch(`http://127.0.0.1:${PORT}/login`); if (r.status === 200) return true; } catch { } if (Date.now() - t0 > ms) return false; await sleep(300); } };
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  for (const r of [wt, fakeHome, stubDir]) { try { endRootedProcesses(r); } catch { } }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  try { fs.chmodSync(fakeBin, 0o755); } catch { }
  for (const d of [wt, PROFILE, fakeHome, stubDir, fakeBin]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const WebSocket = require('ws');
/** ONE page of the browser (its own CDP socket): navigate / eval / wait / click / shot. */
async function pageOf(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
  const until = async (expr, { timeout = 15000, step = 120 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
  const centerOf = (sel) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, w: r.width, h: r.height, hits: !!hit && (hit === el || el.contains(hit)) }; })()`);
  const realClick = async (sel) => { const p = await centerOf(sel); if (!p || !p.hits) return p || false; await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await sleep(100); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 }); return true; };
  const api = (method, p, body) => evalJs(`fetch(${JSON.stringify(p)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }${body ? `, body: ${JSON.stringify(JSON.stringify(body))}` : ''} }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))`);
  const shot = async (name) => { if (!SHOTS) return; try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  return { cdp, evalJs, until, realClick, api, shot };
}
const visible = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;
const cli = (bin, args, token, { timeout = 20000 } = {}) => new Promise((resolve) => { const c = spawn(process.execPath, [path.join(wt, 'data', 'bin', bin), ...args], { cwd: CWD, env: { PATH: process.env.PATH, HOME: fakeHome, VIBESPACE_API: `http://127.0.0.1:${PORT}`, VIBESPACE_SESSION_TOKEN: token } }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); const k = setTimeout(() => c.kill('SIGKILL'), timeout); c.on('close', (code) => { clearTimeout(k); resolve({ code, out }); }); });
const ask = async (args, token) => { let r = null; for (let i = 0; i < 40; i++) { r = await cli('vibespace-vault', ['request', ...args], token); if (r.code === 0 || /unknown option/.test(r.out)) break; await sleep(300); } return { ...r, id: (/\((sr-[0-9a-f]{12})\)/.exec(r.out) || [])[1] || null }; };
const LIST_ROW = (label) => `[...document.querySelectorAll('.vw-list .vw-row')].find((r) => r.isConnected && r.querySelector('.vw-label') && r.querySelector('.vw-label').textContent === ${JSON.stringify(label)})`;

try {
  let t0 = null;
  for (let i = 0; i < 80 && !t0; i++) { try { t0 = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
  if (!t0) throw new Error('no chrome page');
  const A = await pageOf(t0);   // THE WATCHING PAGE
  startServer();
  check('the hub boots (sign-in password on, a fake curl on its PATH)', await ready());
  const URL = `http://127.0.0.1:${PORT}/`;

  console.log('① sign in, the second password, a live conversation');
  await A.cdp('Page.navigate', { url: URL + 'login' });
  await A.until(`document.readyState === 'complete'`);
  check('signed in (the watching page)', (await A.evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`)) === 200);
  await A.cdp('Page.navigate', { url: URL });
  check('the app loads', !!(await A.until(`!!(window.app && app.wm && document.getElementById('taskbar-user-todos'))`, { timeout: 30000 })));
  await A.until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  const su = await A.api('POST', '/api/vault/setup', { password: SECOND });
  check('the second password is set from the page (unlocked)', su.status === 200 && su.json.state === 'unlocked', su);
  await A.api('POST', '/api/vault/secrets', { label: 'Router guest wifi', kind: 'password', note: '', value: 'guest-wifi-made-up-1234' });
  const lr = await fetch(`http://127.0.0.1:${PORT}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` }, body: JSON.stringify({ password: SIGN_IN }) });
  const cookie = String(lr.headers.get('set-cookie') || '').split(';')[0];
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie, Origin: `http://127.0.0.1:${PORT}` } });
  await new Promise((r, j) => { ws0.on('open', r); ws0.on('error', j); });
  ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'vug1', sessionName: 'Home network' }));
  let env = null;
  for (let i = 0; i < 100 && !env; i++) { for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) { try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.VIBESPACE_SESSION_TOKEN) env = e; } catch { } } if (!env) await sleep(250); }
  const TOKEN = env && env.VIBESPACE_SESSION_TOKEN;
  check('a live conversation «Home network» through the real spawn path with its own session token', !!TOKEN);

  console.log('② THE LIVE LIST — the watching window finds what the storing page stored, with no reopen');
  await A.evalJs(`app.replayOpenSpec({ action: 'openVault' })`);
  check('the watching page holds the Vault window open (one value listed)', !!(await A.until(`!!document.querySelector('.vw-list .vw-row')`, { timeout: 15000 })));
  await A.evalJs(`(() => { const i = document.querySelector('.vw-search'); i.focus(); i.value = 'Unifi'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const empty0 = await A.until(`(() => { const e = [...document.querySelectorAll('.vw-list .vw-empty')].find((x) => x.isConnected); return e ? e.textContent : null; })()`, { timeout: 5000 });
  check('«Unifi» typed: «no match» NAMES what it searched (names, kinds, purposes, hosts, where they came from, ids)', /No stored value matches “Unifi” — searched: names, kinds, purposes, hosts, where they came from, ids/.test(String(empty0)), empty0);
  const note0 = await A.evalJs(`(document.querySelector('.vw-note') || document.querySelector('.vault-window .vw-head-note') || {}).textContent || ''`);
  await A.shot('vug-1-search-before.png');
  const a1 = await ask(['the UniFi admin password', '--purpose', 'log in to the UniFi gateway to read the WAN status', '--kind', 'password', '--name', LABEL, '--host', '192.168.1.1'], TOKEN);
  const hostsHere = a1.code === 0;
  const a1b = hostsHere ? a1 : await ask(['the UniFi admin password', '--purpose', 'log in to the UniFi gateway to read the WAN status', '--kind', 'password', '--name', LABEL], TOKEN);
  check('the agent asks with the hosts it will use (`--host 192.168.1.1`) ⇒ exit 0, a request id, «for 192.168.1.1»', hostsHere && !!a1.id && /for 192\.168\.1\.1/.test(a1.out), a1.out);
  const reqId = a1b.id;
  const todo = async () => (await A.api('GET', '/api/user-todos')).json.todos;
  const item = ((await todo()).open || []).find((i) => i.action && i.action.requestId === reqId);
  check('THE REQUEST BOX SAYS THE DEFAULT before the paste: «The conversation that asked will be allowed to use it for 192.168.1.1 without asking each time; change it in the Vault window»', !!item && /The conversation that asked will be allowed to use it for 192\.168\.1\.1 without asking each time; change it in the Vault window/.test(item.detail), item && item.detail);
  // THE STORING PAGE: a second page of the same sign-in answers the request through the request route
  const tB = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const B = await pageOf(tB);
  await B.cdp('Page.navigate', { url: URL });
  await B.until(`!!(window.app && app.wm)`, { timeout: 30000 });
  const stored = await B.api('POST', `/api/vault/secret-requests/${reqId}/answer`, { answer: 'store', value: VALUE });
  check('the storing page pastes the value (the request route) ⇒ stored, a `secret:<id>` entry', stored.status === 200 && stored.json.outcome === 'stored' && /^vault:\/\/secrets\/secret:[0-9a-f]{10}\/secret$/.test(stored.json.ref), stored);
  const REF = stored.json.ref;
  const at = Date.now();
  const live = await A.until(`!!(${LIST_ROW(LABEL)})`, { timeout: 6000, step: 100 });
  const ms = Date.now() - at;
  check(`THE WATCHING WINDOW shows the stored row WITHOUT a reopen (${ms} ms after the store)`, !!live, { ms });
  const kept = await A.evalJs(`({ q: document.querySelector('.vw-search').value, note: (document.querySelector('.vw-note') || {}).textContent || '', rows: [...document.querySelectorAll('.vw-list .vw-row')].filter((r) => r.isConnected).length })`);
  check('… the search box keeps «Unifi», the «N stored values» line follows (1 → 2), only the match shows', kept.q === 'Unifi' && /\b2 stored values\b/.test(kept.note) && kept.rows === 1, { kept, note0 });
  const prov = await A.evalJs(`(() => { const r = ${LIST_ROW(LABEL)}; return r ? { prov: r.dataset.prov, chip: (r.querySelector('.vw-chip-prov .vw-chip-words') || {}).textContent || '', meta: (r.querySelector('.vw-meta') || {}).textContent || '' } : null; })()`);
  check('its origin: «Filled by you · asked for by Home network»; its meta names the host', !!prov && prov.prov === 'request' && prov.chip === 'Filled by you · asked for by Home network' && /for 192\.168\.1\.1/.test(prov.meta), prov);
  await A.shot('vug-2-search-after.png');

  console.log('③ NO CARD — the conversation that asked runs with it for the host it named');
  const r1 = await cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'curl', '-sk', 'https://192.168.1.1/api/auth/login'], TOKEN);
  const cards = async () => ((await todo()).open || []).filter((i) => i.action && i.action.type === 'vault-run-ask');
  check('`vibespace-vault run … curl https://192.168.1.1/…` ⇒ ran at once with NO card (the default grant), its output scrubbed', r1.code === 0 && /^curl got \[vault:secrets\//m.test(r1.out) && !r1.out.includes(VALUE) && !(await cards()).length, r1.out);
  const chip = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && r.querySelector('.vw-use-chip'); return c && /used 1×/.test(c.textContent) ? c.textContent : null; })()`, { timeout: 6000 });
  check('the row\'s chip arrives by itself: «Home network · 192.168.1.1 · used 1×» (+ ✕)', /^Home network · 192\.168\.1\.1 · used 1×✕$/.test(String(chip)), chip);

  console.log('④ THE CARD THAT NAMES THE GRANT — another host');
  const pend = cli('vibespace-vault', ['run', '--env', `T=${REF}`, '--', 'curl', 'https://10.0.0.9/collect'], TOKEN, { timeout: 70000 });
  let card = null;
  for (let i = 0; i < 60 && !card; i++) { card = (await cards())[0] || null; if (!card) await sleep(200); }
  check('a run to 10.0.0.9 files its card, naming the standing approval and what is outside it', !!card && /A standing approval exists for this conversation \(vg-[0-9a-f]{8}: 192\.168\.1\.1\) — this run is outside it: 10\.0\.0\.9\./.test(card.detail) && /«Always» widens it to 10\.0\.0\.9/.test(card.detail), card && card.detail);
  if (card) {
    await A.realClick('#taskbar-user-todos');
    await A.until(visible('#user-todos-popup .ut-item'), { timeout: 8000 });
    await A.evalJs(`(() => { for (const d of document.querySelectorAll('#user-todos-popup details.ut-detail-exp')) d.open = true; return true; })()`);
    await sleep(300);
    await A.shot('vug-4-card-names-grant.png');
    const label = await A.evalJs(`[...document.querySelectorAll('#user-todos-popup button')].map((b) => b.textContent).filter((t) => /Always/.test(t)).join('|')`);
    check('the card\'s «Always» says what it is: «Always let this conversation use it (these hosts)»', /Always let this conversation use it \(these hosts\)/.test(label), label);
    const dn = await A.api('POST', `/api/vault/run/asks/${card.action.askId}`, { answer: 'deny' });
    check('denied', dn.status === 200, dn);
    await A.evalJs(`document.getElementById('user-todos-popup')?.classList.add('hidden'); true`);
  }
  const r2 = await pend;
  check('… the agent is told ask_denied', r2.code !== 0 && /ask_denied/.test(r2.out), r2.out.slice(0, 300));

  console.log('⑤ 「Who may use it…」 — THE principal picker, the hosts, the end; a widening asks 验证是你 first');
  const opened = await A.evalJs(`(() => { const r = ${LIST_ROW(LABEL)}; const b = r && r.querySelector('.vw-use-grant'); if (!b) return false; b.click(); return true; })()`);
  check('the row has 「Who may use it…」 and it opens the dialog', opened && !!(await A.until(visible('#vault-use-grant .pp-root, #vault-use-grant .vw-use-hosts'), { timeout: 5000 })));
  const dlg = await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); if (!d) return null; return { title: (d.querySelector('.dialog-title, h3, .modal-title') || {}).textContent || '', chips: [...d.querySelectorAll('.pp-chip')].map((c) => c.textContent), own: !!d.querySelector('.vw-use-own'), hosts: (d.querySelector('.vw-use-hosts') || {}).value, end: (d.querySelector('.vw-use-end') || {}).value }; })()`);
  check('the dialog: the conversation that asked already picked, «The hosts it was stored for (192.168.1.1)», the end «as each has it now»', !!dlg && dlg.chips.some((c) => /Home network/.test(c)) && dlg.own === true && dlg.end === 'keep', dlg);
  await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const box = d.querySelector('.pp-input, input[type=search], .pp-box input'); if (box) { box.focus(); box.dispatchEvent(new Event('focus')); } return true; })()`);
  await sleep(300);
  await A.shot('vug-3-picker.png');
  const pickedAll = await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const row = [...document.querySelectorAll('.pp-row, .pp-item, [role=option]')].find((x) => /All agents/.test(x.textContent)); if (!row) return false; row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); row.click(); return true; })()`);
  check('All agents can be picked (the picker\'s first row)', !!pickedAll);
  await A.evalJs(`(() => { const d = document.getElementById('vault-use-grant'); const c = d.querySelector('.vw-use-own input'); if (c && c.checked) { c.checked = false; c.dispatchEvent(new Event('change')); } const h = d.querySelector('.vw-use-hosts'); h.value = '192.168.1.1'; h.dispatchEvent(new Event('input')); d.querySelector('.vw-use-save').click(); return true; })()`);
  const pw = await A.until(visible('#vault-reveal-dialog input[type=password], .vault-reveal-dialog input[type=password]'), { timeout: 6000 });
  check('a WIDENING (All agents) asks 验证是你 first — the second password', !!pw);
  if (pw) {
    await A.evalJs(`(() => { const i = document.querySelector('#vault-reveal-dialog input[type=password], .vault-reveal-dialog input[type=password]'); i.focus(); i.value = ${JSON.stringify(SECOND)}; i.dispatchEvent(new Event('input', { bubbles: true })); const go = [...document.querySelectorAll('#vault-reveal-dialog button, .vault-reveal-dialog button')].find((b) => /Confirm|Verify|OK|Show|继续|确认|验证/.test(b.textContent) && !/Cancel/.test(b.textContent)); (go || {}).click?.(); return !!go; })()`);
  }
  const allChip = await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => /^All agents/.test(x.textContent)); return c ? c.textContent : null; })()`, { timeout: 10000 });
  check('… saved: the row shows «All agents · 192.168.1.1» beside «Home network»', /^All agents · 192\.168\.1\.1/.test(String(allChip)), allChip);
  const x = await A.evalJs(`(() => { const r = ${LIST_ROW(LABEL)}; const c = r && [...r.querySelectorAll('.vw-use-chip')].find((x) => /^All agents/.test(x.textContent)); const b = c && c.querySelector('.vw-use-x'); if (!b) return false; b.click(); return true; })()`);
  const gone = x && await A.until(`(() => { const r = ${LIST_ROW(LABEL)}; return !!r && ![...r.querySelectorAll('.vw-use-chip')].some((x) => /^All agents/.test(x.textContent)) && [...r.querySelectorAll('.vw-use-chip')].some((x) => /^Home network/.test(x.textContent)); })()`, { timeout: 8000 });
  check('✕ takes All agents back with a click (no password — a narrowing); the asker stays', !!gone);

  console.log('⑥ «no match» under a picked purpose names it — 「Search all」');
  await A.evalJs(`(() => { const b = document.querySelector('.vw-rail [data-purpose="agents"]'); if (b) b.click(); return !!b; })()`);
  const e6 = await A.until(`(() => { const e = [...document.querySelectorAll('.vw-list .vw-empty')].find((x) => x.isConnected); return e ? e.textContent : null; })()`, { timeout: 5000 });
  check('«Kept by agents» picked + «Unifi»: «… in «Kept by agents» — searched: … · 1 match under other purposes» + 「Search all」', /No stored value matches “Unifi” in «Kept by agents» — searched: names, kinds, purposes, hosts, where they came from, ids · 1 match under other purposes/.test(String(e6)) && /Search all/.test(String(e6)), e6);
  await A.shot('vug-5-no-match-purpose.png');
  await A.evalJs(`(() => { const b = document.querySelector('.vw-nomatch-all'); if (b) b.click(); return !!b; })()`);
  check('「Search all」 ⇒ the row', !!(await A.until(`!!(${LIST_ROW(LABEL)})`, { timeout: 5000 })));
  check('no value in any page: the watching page\'s DOM and inputs', !(await A.evalJs(`document.documentElement.outerHTML + [...document.querySelectorAll('input')].map((i) => i.value).join('')`)).includes(VALUE));
} catch (e) {
  check('the run did not throw', false, e && e.stack);
} finally {
  await stopServer();
}
console.log(`\n${failed ? '✗' : '✓'} test-vault-use-grants-chrome: ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAIL'); process.exit(1); } else { console.log(`ALL PASS (${passed})`); process.exit(0); }
