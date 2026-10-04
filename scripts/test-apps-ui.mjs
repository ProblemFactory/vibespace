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
//   ② the agent's proposal: `vibespace-app install hello --why …` → ONE For-you item (origin apps) carrying ONE CARD
//      (design 009: its title, who asks and why, two buttons, the rest behind ⋯) → ONE real click on Install in the card
//      (no second dialog) → installing… → Installed in the card; the item resolved; the agent's `vibespace-app wait` prints done
//   ⑥ zh at 390 px: the card in the For-you sheet reads in Chinese, one click installs, the words census holds on the page
//   ③ Not now: a second proposal declined from the For-you window; the agent's `wait` hears it
//   ④ an agent's token on the user's install route ⇒ 403 agent_forbidden
//   ⑤ the phone (390 px): the apps section fits — nothing wider than the screen
//   ⑦ design 009: the Apps dialog's rect census in zh at 390 px and en at 1440 px; a planted long name clamps at two
//      lines — its length is GROWN until it needs ≥ 3 lines in the card it lands in (the card's width is the machine's:
//      no xpra ⇒ no default-scale control beside it ⇒ a wider name box, as on the Actions runner)
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
  const planShown = await waitFor(`(() => { const d = document.querySelector('#desktop-install-dialog'); if (!d) return false; const f = d.querySelector('.desktop-install-facts'); const pre = d.querySelector('.desktop-install-pre'); return !!f && f.style.display !== 'none' && /packages? ·/.test(f.textContent) && /after the server starts/.test(f.textContent) && /install -y xterm/.test(pre.textContent); })()`, 10000);
  check('THE install dialog shows the plan: its facts (packages · download · on disk, how it comes back after a rebuild) and every command', planShown, await evalJs(`document.querySelector('#desktop-install-dialog')?.textContent?.slice(0, 600) || null`));
  check('…titled by what it installs', await evalJs(`/Install xterm on this machine/.test(document.querySelector('#desktop-install-dialog h3')?.textContent || '')`));
  check('design 009 B: the dialog LEADS with the card\'s summary; the root sentence and the commands fold under a closed Details', await evalJs(`(() => { const d = document.querySelector('#desktop-install-dialog'); const sum = d.querySelector('.app-card-summary'); const det = d.querySelector('.app-install-details'); const pre = d.querySelector('.desktop-install-pre'); return !!sum && sum.style.display !== 'none' && /Install xterm\\?/.test(sum.textContent) && /From this machine’s package sources/.test(sum.textContent) && !!det && !det.open && det.contains(pre) && /as root/.test(det.textContent) && sum.compareDocumentPosition(det) === Node.DOCUMENT_POSITION_FOLLOWING; })()`) === true);
  await shot('apps-plan');
  check('a real click on Install', await realClick('#desktop-install-dialog .desktop-install-actions .btn-create') === true);
  check('the log streams and the dialog says done (the app is in the Applications list)', await waitFor(`(() => { const d = document.querySelector('#desktop-install-dialog'); return !!d && /apt-get install -y xterm/.test(d.querySelector('.desktop-install-log')?.textContent || '') && /XTerm is installed on this machine/.test(d.querySelector('.desktop-install-note')?.textContent || ''); })()`, 15000));
  check('review I13: the log hides the slot\'s `= run …` / `= ok` markers', await evalJs(`!/^= (run|ok)/m.test(document.querySelector('#desktop-install-dialog .desktop-install-log')?.textContent || '')`) === true);
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
  await sleep(900); // a card's Install arms ARM_MS after its pane is shown (an Install that just appeared is not the one the user read)
  check('design 009: the For-you window shows ONE card — its title, who asks and why, TWO buttons (Install / Not now) and ⋯', await waitFor(`(() => { const p = document.querySelector('.iw-item'); if (!p) return false; const acts = [...p.querySelectorAll('.iw-actions [data-act]')].map((b) => b.dataset.act); return /Install hello\\?/.test(p.querySelector('.iw-title').textContent) && /Image work wants to install it: a friendly greeting program/.test(p.textContent) && acts.join() === 'app-install,app-reject,more'; })()`, 10000), await evalJs(`document.querySelector('.iw-item')?.textContent?.slice(0, 400) || null`));
  check('the card\'s face says no package-system word (Details may)', await evalJs(`(() => { const c = document.querySelector('.iw-item .ut-app-card').cloneNode(true); c.querySelector('.ut-app-details')?.remove(); const face = document.querySelector('.iw-item .iw-title').textContent + ' ' + c.textContent + ' ' + [...document.querySelectorAll('.iw-item .iw-actions .iw-act-label')].map((x) => x.textContent).join(' '); return !/\\bdebs?\\b|appimage|\\bapt(-get)?\\b|\\bdpkg\\b|\\broot\\b|\\bsudo\\b|\\bsha(256)?\\b/i.test(face) && /apt-get/.test(document.querySelector('.iw-item .ut-app-details').textContent); })()`) === true);
  await shot('apps-proposal');
  await evalJs(`(() => { if (!window.__vsF) { window.__vsF = []; const f0 = window.fetch; window.fetch = async (...a) => { const r = await f0(...a); try { r.clone().text().then((t) => window.__vsF.push([String(a[0]), r.status, t.slice(0, 300)])); } catch { } return r; }; } return true; })()`);
  check('ONE real click on Install, in the card', await realClick('[data-act="app-install"]') === true);
  await sleep(400);
  const diag2 = await evalJs(`JSON.stringify({ f: (window.__vsF || []).filter((x) => /apps/.test(x[0])), toasts: [...document.querySelectorAll('[class*=toast]')].map((e) => e.textContent).slice(-4) })`);
  check('…and no second dialog', await evalJs(`!document.querySelector('#desktop-install-dialog')`) === true);
  const carded = await (async () => { for (let i = 0; i < 60; i++) { const r = await api('GET', '/api/user-todos'); const it = [...(r.body?.todos?.open || []), ...(r.body?.todos?.resolved || [])].find((x) => x.id === item.id); if (it && it.card && it.card.state === 'done') return it; await sleep(250); } return null; })();
  check('installed: the item\'s card says done (the card followed the run; resolved by apps)', !!carded && carded.status === 'done' && carded.resolvedBy === 'apps', carded ? { status: carded.status, card: carded.card && carded.card.state } : diag2);
  check('the pane shows Installed in the card', await waitFor(`[...document.querySelectorAll('.ut-app-progress')].some((p) => /Installed/.test(p.textContent))`, 8000));
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

  console.log('⑥ zh at 390 px — the card in the For-you sheet: Chinese words, one click');
  await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); localStorage.setItem('vibespace.lang', 'zh'); true`);
  await cdp('Page.reload', {});
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  await sleep(600);
  const pr3 = await cli(['install', 'gimp', '--why', '你让我装个修图软件'], TOKEN); // gimp was declined in ③ — a new ask is a new proposal
  const pid3 = (/Proposed (ap-[0-9a-f]{6})/.exec(pr3.out) || [])[1];
  const item3 = await (async () => { for (let i = 0; i < 40; i++) { const r = await api('GET', '/api/user-todos'); const it = (r.body?.todos?.open || []).find((x) => x.action && x.action.id === pid3); if (it) return it; await sleep(250); } return null; })();
  check('a third proposal is its own card', !!item3 && !!item3.card, pr3);
  await evalJs(`document.getElementById('taskbar-user-todos')?.click(); true`);
  const row3 = `#user-todos-popup .ut-item[data-id=${JSON.stringify(item3 && item3.id)}]`;
  check('the For-you sheet shows the card in Chinese: 安装 …？ / 「Image work」想装它：… / 来自这台机器的软件源 / [安装] [暂不]', await waitFor(`(() => { const r = document.querySelector(${JSON.stringify(row3)}); if (!r) return false; const btns = [...r.querySelectorAll('.ut-app-answer button')].map((b) => b.textContent); return /^安装 .+？$/.test(r.querySelector('.ut-text').textContent) && /「Image work」想装它：你让我装/.test(r.textContent) && /来自这台机器的软件源/.test(r.textContent) && btns.join('|') === '安装|暂不' && !!r.querySelector('.ut-more') && !r.querySelector('.ut-done') && !r.querySelector('.ut-dismiss'); })()`, 10000), await evalJs(`document.querySelector(${JSON.stringify(row3)})?.textContent?.slice(0, 300) || null`));
  const fit3 = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(row3)}); const W = document.documentElement.clientWidth; const b = [...r.querySelectorAll('.ut-app-answer button')].map((x) => x.getBoundingClientRect()); return { wide: [...r.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > W + 1).length, minH: Math.min(...b.map((q) => q.height)) }; })()`);
  check('the card fits the 390 px sheet and its two buttons are phone-sized (≥ 36 px)', fit3 && fit3.wide === 0 && fit3.minH >= 36, fit3);
  await shot('apps-zh-390-card');
  await sleep(900);
  check('ONE real click on 安装', await realClick(`${row3} .ut-app-install`) === true);
  const done3 = await (async () => { for (let i = 0; i < 60; i++) { const r = await api('GET', '/api/user-todos'); const it = [...(r.body?.todos?.open || []), ...(r.body?.todos?.resolved || [])].find((x) => x.id === (item3 && item3.id)); if (it && it.card && it.card.state === 'done') return it; await sleep(250); } return null; })();
  check('installed from the card (no dialog)', !!done3 && await evalJs(`!document.querySelector('#desktop-install-dialog')`) === true);
  check('the sheet\'s card says 已安装', await waitFor(`/已安装/.test(document.querySelector(${JSON.stringify(row3)})?.textContent || '')`, 8000), await evalJs(`document.querySelector(${JSON.stringify(row3)})?.textContent?.slice(0, 300) || null`));
  await shot('apps-zh-390-done');

  // ⑦ design 009 §B3/§B4 (lane apps-interface): the Apps dialog SEEN in zh at 390 px and in en at 1440 px — apps first, the
  // head's "Install an app…" on the first screen, the setup lines in the footer, and the RECT CENSUS of the cards: every
  // name inside its card, at most two lines, shown whole (never "Li…"); a planted long name clamps at exactly two lines
  const appsCensus = `(() => {
    const d = document.querySelector('#desktop-launch-dialog'); if (!d) return null;
    const R = (e) => e.getBoundingClientRect();
    const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && R(e).height > 0;
    const top = (sel) => { const e = d.querySelector(sel); return vis(e) ? R(e).top + d.querySelector('.dialog-body').scrollTop : null; };
    const cards = [...d.querySelectorAll('.desktop-launch-card')].filter(vis);
    const bad = [];
    for (const c of cards) {
      const l = c.querySelector('.desktop-launch-card-label'), rc = R(c), rl = R(l);
      const lh = parseFloat(getComputedStyle(l).lineHeight) || 16;
      if (rl.left < rc.left - 1 || rl.right > rc.right + 1 || rl.top < rc.top - 1 || rl.bottom > rc.bottom + 1) bad.push({ id: c.dataset.appId, why: 'outside its card' });
      if (rl.height > 2 * lh + 1) bad.push({ id: c.dataset.appId, why: 'more than two lines', h: rl.height, lh });
      if (l.scrollHeight > l.clientHeight + 1 && !c.dataset.planted) bad.push({ id: c.dataset.appId, why: 'cut', text: l.textContent });
    }
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) { const a = R(cards[i].parentElement), b = R(cards[j].parentElement); if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push({ why: 'overlap', a: cards[i].dataset.appId, b: cards[j].dataset.appId }); }
    const ib = d.querySelector('.desktop-launch-install-app');
    return { title: document.querySelector('#desktop-launch-dialog .dialog-header h3, #desktop-launch-dialog h3')?.textContent || '', n: cards.length, bad,
      order: [top('.desktop-launch-head'), top('.desktop-launch-catalog-sec'), top('.desktop-launch-apps-sec'), top('.desktop-launch-foot')],
      install: ib && vis(ib) ? { bottom: R(ib).bottom, h: R(ib).height, vh: innerHeight, text: ib.textContent } : null,
      autoWord: [...d.querySelectorAll('.desktop-launch-card-scale')].some((e) => /^(Auto|自动)$/.test(e.textContent.trim())),
      status: d.querySelector('.app-sec-foot .app-sec-updates')?.textContent || '' };
  })()`;
  console.log('⑦ design 009: the Apps dialog in zh at 390 px and en at 1440 px — the rect census');
  await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); localStorage.setItem('vibespace.lang', 'zh'); true`);
  await cdp('Page.reload', {});
  await sleep(600);
  await waitFor(`!!window.app && !!app._desktopAppsAvailable && !!document.getElementById('btn-desktop-apps') && !document.getElementById('loading-screen')`, 20000); // the page is ready (the splash is gone)
  await evalJs(`document.getElementById('btn-desktop-apps').click(); true`);
  await waitFor(`document.querySelectorAll('#desktop-launch-dialog .desktop-launch-card').length > 2 && !!document.querySelector('#desktop-launch-dialog .app-sec-entry')`, 15000);
  await sleep(300);
  const zh390 = await evalJs(appsCensus);
  check('zh 390: the dialog is called 应用 and reads head · Apps · your installed apps · footer, top to bottom', !!zh390 && zh390.title.trim() === '应用' && zh390.order.every((v) => v != null) && zh390.order.every((v, i) => !i || v > zh390.order[i - 1]), zh390 && { title: zh390.title, order: zh390.order });
  check('zh 390: "安装应用…" sits on the first screen, a phone-sized target', !!zh390 && !!zh390.install && zh390.install.text === '安装应用…' && zh390.install.bottom <= zh390.install.vh && zh390.install.h >= 36, zh390 && zh390.install);
  check(`zh 390: rect census over ${zh390 ? zh390.n : 0} cards — every name inside its card, ≤ 2 lines, shown whole; no two cards overlap; no permanent 自动`, !!zh390 && zh390.n > 2 && zh390.bad.length === 0 && !zh390.autoWord, zh390 && zh390.bad.slice(0, 5));
  check('zh 390: the section\'s foot says how many apps in words (N 个应用 · …, never 条进展)', !!zh390 && /^\d+ 个应用/.test(zh390.status) && !/进展/.test(zh390.status), zh390 && zh390.status);
  // the planted name's PREMISE is constructed, never assumed (lane mirror-green-ui, 2.369.205): it must need ≥ 3 lines
  // in THIS card. A fixed 48-glyph name was "long" only beside the default-scale control — on the Actions runner (no
  // xpra ⇒ no scaling rung ⇒ no control; no xterm ⇒ the first card is dimmed) the name box is 288.5 px = exactly 24
  // glyphs a line, the name filled two lines, nothing was cut, and the leg went red for the machine alone. The name
  // grows until an unclamped copy of the label (same box width, same font) measures three lines or more.
  const planted = await evalJs(`(() => { const c = document.querySelector('#desktop-launch-dialog .desktop-launch-card'); const l = c.querySelector('.desktop-launch-card-label'); c.dataset.planted = '1';
    const base = '一个名字特别特别长的应用程序，用来确认名字最多显示两行而且不会跑出卡片之外，也不会盖住旁边的卡片';
    const lh = parseFloat(getComputedStyle(l).lineHeight);
    const free = () => { const k = l.cloneNode(true); k.style.cssText = 'display:block;-webkit-line-clamp:none;line-clamp:none;overflow:visible;position:absolute;visibility:hidden;width:' + l.getBoundingClientRect().width + 'px'; l.parentElement.appendChild(k); const h = k.getBoundingClientRect().height; k.remove(); return h; };
    let text = base; l.textContent = text;
    while (free() < 3 * lh - 1 && text.length < 1000) { text += base; l.textContent = text; }
    return { lines: Math.round(free() / lh), chars: text.length }; })()`);
  await sleep(150);
  const zhLong = await evalJs(appsCensus);
  const clamp = await evalJs(`(() => { const l = document.querySelector('#desktop-launch-dialog .desktop-launch-card[data-planted] .desktop-launch-card-label'); const lh = parseFloat(getComputedStyle(l).lineHeight); return { h: l.getBoundingClientRect().height, lh, cut: l.scrollHeight > l.clientHeight + 1 }; })()`);
  check('zh 390: a planted long name (≥ 3 lines unclamped in its own card — constructed) clamps at EXACTLY two lines, inside its card, overlapping nothing (the census sees it)', !!planted && planted.lines >= 3 && !!zhLong && zhLong.bad.length === 0 && clamp.cut && Math.abs(clamp.h - 2 * clamp.lh) <= 2, { planted, bad: zhLong && zhLong.bad.slice(0, 3), clamp });
  await shot('apps-zh-390');
  await evalJs(`document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); localStorage.setItem('vibespace.lang', 'en'); true`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.reload', {});
  await sleep(600);
  await waitFor(`!!window.app && !!app._desktopAppsAvailable && !!document.getElementById('btn-desktop-apps') && !document.getElementById('loading-screen')`, 20000); // the page is ready (the splash is gone)
  await evalJs(`document.getElementById('btn-desktop-apps').click(); true`);
  await waitFor(`document.querySelectorAll('#desktop-launch-dialog .desktop-launch-card').length > 2`, 15000);
  await sleep(300);
  const en1440 = await evalJs(appsCensus);
  check(`en 1440 (the review's "Li… / Calculator (…" case): rect census over ${en1440 ? en1440.n : 0} cards in the multi-column grid — every name whole, ≤ 2 lines, inside its card`, !!en1440 && en1440.n > 2 && en1440.bad.length === 0 && en1440.title.trim() === 'Apps', en1440 && { title: en1440.title, bad: en1440.bad.slice(0, 5) });
  await shot('apps-en-1440');
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) { check('the suite ran to its end', false, e.stack || String(e)); }
done();
