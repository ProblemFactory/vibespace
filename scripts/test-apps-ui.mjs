#!/usr/bin/env node
// test-apps-ui — THE USER'S DOOR AND THE AGENT'S PROPOSAL, on a real page (Layer 0 of docs/design-app-persistence.zh.md
// §3.1; owner D3: the door is the user's, an agent only proposes).
//
// A THROWAWAY server in a git worktree (own data/, a scratch HOME) running THE APPS STUB (scripts/fixtures/apps-stub.cjs
// through the VIBESPACE_APPS_STUB seam src/server/apps-wiring.js honours only for a /tmp checkout — no apt, no root; its
// plans are the PURE parse of real captured apt output) + headless chrome over raw CDP. A stub `claude` runs behind the
// REAL chat-wrapper through the REAL create path (a live conversation with its own session token); the suite plays its
// agent by running the SHIPPED data/bin/vibespace-app with that token.
//   ① the user's door: Desktop apps → Your installed apps → Install an app… → search → pick → THE install dialog (the
//      plan's facts: packages, sizes, how it comes back after a rebuild; every command) → Install (a real click) → the
//      log streams, the dialog says done, the entry is a row of "Your installed apps"
//   ② the agent's proposal: `vibespace-app install hello --why …` → ONE For-you item (origin apps) → the For-you window's
//      Install… (a real click) opens THE install dialog on the proposal (who proposed it, why) → Install → done; the
//      item resolved; the agent's `vibespace-app wait` prints done
//   ③ Not now: a second proposal declined from the For-you window; the agent's `wait` hears it
//   ④ an agent's token on the user's install route ⇒ 403 agent_forbidden
//   ⑤ the phone (390 px): the apps section fits — nothing wider than the screen
// SKIPs by name: no chrome / no dtach. VS_SHOT_DIR=<dir> keeps screenshots. ~40 s.
import { execSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
let passed = 0, failed = 0, skipped = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const done = () => { console.log(`\n${failed ? `${failed} FAILED` : 'ALL PASS'} (${passed}${skipped ? `, ${skipped} skipped` : ''}) in ${Math.round((Date.now() - T0) / 1000)} s`); process.exit(failed ? 1 : 0); };
if (!CHROME) { skipped++; console.log('  ⊘ SKIP no chrome on this machine'); done(); }
if (spawnSync('sh', ['-c', 'command -v dtach'], { encoding: 'utf8' }).status !== 0) { skipped++; console.log('  ⊘ SKIP no dtach on this machine'); done(); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.error('✗ public/bundle.js is not built (npm run build)'); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('apps-ui-wt');
const fakeHome = scratchHome('apps-ui-home', fs);
const stubDir = scratch('apps-ui-stub');
fs.rmSync(stubDir, { recursive: true, force: true }); fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj'); fs.mkdirSync(CWD, { recursive: true });
const SID = 'a9900000-0000-4000-8000-0000000a9900';

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'docs/agent', 'scripts/fixtures/apps-stub.cjs', 'scripts/fixtures/apt']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

// ── the stub CLI: a live conversation (its init names SID); it answers nothing — the suite plays its agent ──
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

let srv = null;
const LOG = path.join(stubDir, 'server.log');
const fd = fs.openSync(LOG, 'a');
srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_APPS_STUB: path.join(wt, 'scripts', 'fixtures', 'apps-stub.cjs') }, stdio: ['ignore', fd, fd] });
fs.closeSync(fd);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  for (const pat of [wt, fakeHome, stubDir]) { try { execSync(`pkill -9 -f ${JSON.stringify(pat)}`, { stdio: 'ignore' }); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
let up = false;
for (let i = 0; i < 160 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); up = true; } catch { await sleep(250); } }
check('the worktree server answered', up, fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').slice(-2000) : '');
check('…and it runs THE APPS STUB (a /tmp checkout — the seam is refused anywhere else)', /THE APPS STUB RUNS/.test(fs.readFileSync(LOG, 'utf8')));

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!target) await sleep(250); }
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} } });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const realClick = async (sel) => {
  const r = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hits: !!hit && (hit === e || e.contains(hit)), hit: hit ? hit.tagName + '.' + String(hit.className).slice(0, 60) : null }; })()`);
  if (!r || !r.hits) return r || false;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await sleep(120);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
};
const typeInto = async (sel, text) => { await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ''; return true; })()`); await cdp('Input.insertText', { text }); };
const shot = async (name) => { const dir = process.env.VS_SHOT_DIR; if (!dir) return; try { const img = await cdp('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(img.data, 'base64')); console.log(`    (screenshot ${name}.png)`); } catch (e) { console.log(`    (screenshot ${name} failed: ${e.message})`); } };
const api = async (method, p, body, headers = {}) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { j = text; } return { status: r.status, body: j }; };
const cli = (args, token) => new Promise((resolve) => { const c = spawn(process.execPath, [path.join(wt, 'data', 'bin', 'vibespace-app'), ...args], { env: { PATH: process.env.PATH, HOME: fakeHome, VIBESPACE_API: `http://127.0.0.1:${PORT}`, VIBESPACE_SESSION_TOKEN: token } }); let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; }); c.on('close', (code) => resolve({ code, out, err })); });

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  await sleep(500);

  console.log('① the user\'s door: Desktop apps → Install an app… → search → plan → Install');
  await evalJs(`document.getElementById('btn-desktop-apps').click(); true`);
  check('the Desktop apps dialog has the "Your installed apps" section with its doors', await waitFor(`!!document.querySelector('#desktop-launch-dialog .desktop-launch-apps .app-sec-install') && !!document.querySelector('#desktop-launch-dialog .app-sec-deb') && !!document.querySelector('#desktop-launch-dialog .app-sec-help')`, 15000));
  check('the empty section says what it is for', await waitFor(`/Nothing installed through VibeSpace yet/.test(document.querySelector('#desktop-launch-dialog .app-sec-list')?.textContent || '')`, 8000));
  check('a real click on Install an app…', await realClick('#desktop-launch-dialog .app-sec-install') === true);
  check('the search dialog opens with its input focused', await waitFor(`!!document.querySelector('#app-search-dialog .app-search-input') && document.activeElement === document.querySelector('#app-search-dialog .app-search-input')`, 5000));
  await typeInto('#app-search-dialog .app-search-input', 'xterm');
  check('a real click on Search', await realClick('#app-search-dialog .app-search-go') === true);
  check('the result lists xterm', await waitFor(`!!document.querySelector('#app-search-dialog .app-search-result[data-pkg="xterm"]')`, 10000));
  await realClick('#app-search-dialog .app-search-result[data-pkg="xterm"]');
  const planShown = await waitFor(`(() => { const d = document.querySelector('#desktop-install-dialog'); if (!d) return false; const f = d.querySelector('.desktop-install-facts'); const pre = d.querySelector('.desktop-install-pre'); return !!f && f.style.display !== 'none' && /packages ·/.test(f.textContent) && /after the server starts/.test(f.textContent) && /install -y xterm/.test(pre.textContent); })()`, 10000);
  check('THE install dialog shows the plan: its facts (packages · download · on disk, how it comes back after a rebuild) and every command', planShown, await evalJs(`document.querySelector('#desktop-install-dialog')?.textContent?.slice(0, 600) || null`));
  check('…titled by what it installs', await evalJs(`/Install xterm on this machine/.test(document.querySelector('#desktop-install-dialog h3')?.textContent || '')`));
  await shot('apps-plan');
  check('a real click on Install', await realClick('#desktop-install-dialog .desktop-install-actions .btn-create') === true);
  check('the log streams and the dialog says done (the app is in the Applications list)', await waitFor(`(() => { const d = document.querySelector('#desktop-install-dialog'); return !!d && /apt-get install -y xterm/.test(d.querySelector('.desktop-install-log')?.textContent || '') && /XTerm is installed on this machine/.test(d.querySelector('.desktop-install-note')?.textContent || ''); })()`, 15000));
  await evalJs(`document.querySelector('#desktop-install-dialog .dialog-close')?.click(); true`);
  check('"Your installed apps" lists it', await waitFor(`!!document.querySelector('#desktop-launch-dialog .app-sec-entry[data-entry="xterm"]') && /XTerm/.test(document.querySelector('#desktop-launch-dialog .app-sec-entry[data-entry="xterm"]').textContent)`, 10000));

  await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); true`); // the Desktop apps dialog is modal — the For-you window lives under it
  console.log('② the agent PROPOSES → For you → Install… → THE dialog → Install');
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws0.on('open', r));
  const frames = []; ws0.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'ap1', sessionName: 'Image work' }));
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
  let env = null;
  for (let i = 0; i < 80 && !env; i++) { for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) { try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.VIBESPACE_SESSION_TOKEN) env = e; } catch {} } if (!env) await sleep(250); }
  check('a live conversation through the real spawn path (stub CLI behind the real wrapper) with its own session token', !!sid && !!env, frames.slice(-3));
  const TOKEN = env && env.VIBESPACE_SESSION_TOKEN;
  // the conversation id arrives with the init (the wrapper's own capture) — the CLI refuses a proposal before it
  let pr = null;
  for (let i = 0; i < 40; i++) { pr = await cli(['install', 'hello', '--why', 'a friendly greeting program for the demo'], TOKEN); if (pr.code === 0) break; await sleep(300); }
  const pid = (/Proposed (ap-[0-9a-f]{6})/.exec(pr.out) || [])[1];
  check('the agent\'s `vibespace-app install hello --why …` PROPOSES (an id, nothing installed)', pr.code === 0 && !!pid && /Nothing is installed until the user approves it/.test(pr.out), pr);
  const item = await (async () => { for (let i = 0; i < 40; i++) { const r = await api('GET', '/api/user-todos'); const it = (r.body?.todos?.open || []).find((x) => x.action && x.action.type === 'app-install' && x.action.id === pid); if (it) return it; await sleep(250); } return null; })();
  check('ONE For-you item, origin apps, worded with the proposer and the size', !!item && item.origin === 'apps' && /Image work wants to install hello \(53 kB to download\)/.test(item.text), item);
  const waiter = cli(['wait', pid], TOKEN);
  await evalJs(`app.openInbox({ itemId: ${JSON.stringify(item && item.id)} }); true`);
  check('the For-you window shows the item with Install… and Not now', await waitFor(`!!document.querySelector('[data-act="app-install"]') && !!document.querySelector('[data-act="app-reject"]')`, 10000));
  check('a real click on Install…', await realClick('[data-act="app-install"]') === true);
  check('THE install dialog opens ON the proposal: who proposed it and why, its plan', await waitFor(`(() => { const d = document.querySelector('#desktop-install-dialog'); return !!d && /Image work proposed this/.test(d.textContent) && /Why: a friendly greeting program/.test(d.textContent) && /install -y hello/.test(d.querySelector('.desktop-install-pre')?.textContent || ''); })()`, 10000));
  await shot('apps-proposal');
  check('a real click on Install', await realClick('#desktop-install-dialog .desktop-install-actions .btn-create') === true);
  check('done', await waitFor(`/hello is installed on this machine/.test(document.querySelector('#desktop-install-dialog .desktop-install-note')?.textContent || '')`, 15000));
  const w = await waiter;
  check('the agent\'s `wait` prints the move and done', w.code === 0 && /done/.test(w.out) && /approved by the user and is done/.test(w.out), w);
  const after = await api('GET', '/api/user-todos');
  check('the For-you item is resolved', !(after.body?.todos?.open || []).some((x) => x.id === item.id));
  await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); document.getElementById('btn-desktop-apps').click(); true`);
  check('"Your installed apps" lists hello too (proposed by the agent)', await waitFor(`!!document.querySelector('#desktop-launch-dialog .app-sec-entry[data-entry="hello"]') && /proposed by Image work/.test(document.querySelector('#desktop-launch-dialog .app-sec-entry[data-entry="hello"]').textContent)`, 10000));

  await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); true`);
  console.log('③ Not now');
  const pr2 = await cli(['install', 'gimp', '--why', 'an image editor'], TOKEN);
  const pid2 = (/Proposed (ap-[0-9a-f]{6})/.exec(pr2.out) || [])[1];
  const item2 = await (async () => { for (let i = 0; i < 40; i++) { const r = await api('GET', '/api/user-todos'); const it = (r.body?.todos?.open || []).find((x) => x.action && x.action.id === pid2); if (it) return it; await sleep(250); } return null; })();
  check('a second proposal (gimp: 338 packages) is its own item', !!item2 && /338 packages/.test(item2.text), item2);
  const waiter2 = cli(['wait', pid2], TOKEN);
  await evalJs(`app.openInbox({ itemId: ${JSON.stringify(item2 && item2.id)} }); true`);
  await waitFor(`!!document.querySelector('[data-act="app-reject"]')`, 10000);
  check('a real click on Not now', await realClick('[data-act="app-reject"]') === true);
  const w2 = await waiter2;
  check('the agent hears it was declined, and not to ask again unprompted', w2.code === 0 && /declined by the user/.test(w2.out) && /Do not propose it again unless they ask/.test(w2.out), w2);

  console.log('④ an agent\'s token on the user\'s door');
  const r403 = await api('POST', '/api/apps/install', { request: { kind: 'apt', packages: ['hello'] } }, { Authorization: `Bearer ${TOKEN}` });
  check('POST /api/apps/install with the agent\'s token ⇒ 403 agent_forbidden', r403.status === 403 && r403.body && r403.body.code === 'agent_forbidden', r403);

  console.log('⑤ the phone');
  await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); true`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  await evalJs(`document.getElementById('btn-desktop-apps').click(); true`);
  await waitFor(`!!document.querySelector('#desktop-launch-dialog .app-sec-entry[data-entry="xterm"]')`, 10000);
  const wide = await evalJs(`(() => { const sec = document.querySelector('#desktop-launch-dialog .desktop-launch-apps-sec'); const W = document.documentElement.clientWidth; return [...sec.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > W + 1).map((e) => e.className).slice(0, 5); })()`);
  check('the apps section fits a 390 px phone (nothing wider than the screen)', Array.isArray(wide) && wide.length === 0, wide);
  await shot('apps-phone');
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) { check('the suite ran to its end', false, e.stack || String(e)); }
done();
