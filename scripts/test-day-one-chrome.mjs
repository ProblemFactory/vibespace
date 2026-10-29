#!/usr/bin/env node
// onboarding-under-test — DAY ONE IN A REAL PAGE (heavy, chrome — lane door-day-one-landing; two naive-user studies on
// fleet pods, 2.369.342). A worktree hub shaped like a provisioned pod — a sign-in password, a HOME whose work/ holds the
// person's 23 files — a fresh browser profile (no presets: this suite IS the first visit), the built bundle:
//   ① the tour's first screen says what it is for in plain words + three asks — no theme / language chips, no coding-agent
//     pitch; its dots count THREE steps (the pod is protected: no «Protect this workspace»)
//   ② day one asks NO second password (nothing is stored): no setup dialog after the load, nor after the tour ends
//   ③ Get started → connect → Continue lands on the start step: the protect step and its SSO sentence never show — on a
//     password pod and on an SSO one (the page's fact set); CONTROL: an unprotected workspace still shows the step
//   ④ the start step: the home's folders as chips, «work (23 files)» FIRST and CHOSEN, the field filled with it; Start the
//     chat creates a chat IN work/ (createSession recorded in the page)
//   ⑤ the vault's second password is asked at the MOMENT the first secret is stored (an integration key — no reload), with
//     its why; 「稍后」 = 3 days on this device (a reload asks no more); a cleared snooze asks at the load (a returning person)
//   ⑥ the New Session dialog: the field EMPTY (never the folder the last dialog held), «work (23 files)» first, then
//     «Last used: …»; a chip fills the field
//   ⑦ the rail carries its doors' words the first week (68 px, «Agents», «Remote»); the last unused door's press takes
//     them away (44 px); a week-old record shows none
//   ⑧ a sign-in terminal is no session row (a plain terminal, the control, is one); the tour in Chinese: 「开始第一个对话」,
//     「work（23 个文件）」
//   ⑨ RED CONTROL: a bundle rebuilt from THIS source with the base's two rules back (the vault asks while not set up; the
//     dialog keeps the last folder) — the page asks the second password on day one and the field keeps the other area's path
// Run: node scripts/test-day-one-chrome.mjs [--shots <dir>]   (SKIPs without chrome / dtach)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let DTACH = true; try { execSync('command -v dtach', { stdio: 'ignore' }); } catch { DTACH = false; }
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('day-one-chrome-wt'), PROFILE = scratch('day-one-chrome-chrome'), HOME = scratch('day-one-chrome-home'), MUT = scratch('day-one-chrome-mut');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : scratch('day-one-chrome-shots');
for (const d of [HOME, MUT]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIGN_IN = 'day-one-pod-sign-in-7';

// THE POD'S HOME: work/ holds the person's files (23, two of them one level down), an empty Desktop, a hidden cache
const mkFiles = (rel, n) => { const d = path.join(HOME, rel); fs.mkdirSync(d, { recursive: true }); for (let i = 0; i < n; i++) fs.writeFileSync(path.join(d, `doc-${i}.txt`), 'x'); };
mkFiles('work', 21); mkFiles('work/deal', 2); mkFiles('Desktop', 0); mkFiles('.cache', 40);
const WORK = path.join(HOME, 'work');

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

// ⑨'s mutant bundle — THIS source with the base's two rules put back, built before the hub starts
{
  fs.mkdirSync(MUT, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT, 'node_modules'));
  const sub = (rel, from, to) => { const f = path.join(MUT, rel); const s = fs.readFileSync(f, 'utf8'); if (s.split(from).length !== 2) throw new Error(`mutant anchor ${rel}: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, to)); };
  sub('src/lib/vault-unlock.js', "if (!vaultSetupAsk({ facts, snoozedUntil, now: Date.now() })) return;", "if (!facts || facts.state !== 'not_set_up' || snoozedUntil > Date.now()) return;");
  sub('src/lib/app.js', "this._nsFolderOpen(cwd || '');", "if (cwd) this._nsFolderOpen(cwd);"); // lane new-session-group-folder-link: every open goes through folderOnOpen now — the base set the field only when a cwd came
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT });
}
const MUT_BUNDLE = fs.readFileSync(path.join(MUT, 'bundle-mut.js'));

let srv = null;
const srvLog = fs.openSync(path.join(SHOTS, 'server.log'), 'a');
const startServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, HOME, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: SIGN_IN }, stdio: ['ignore', srvLog, srvLog] }); };
const ready = async (ms = 60000) => { const t0 = Date.now(); for (;;) { try { const r = await fetch(`http://127.0.0.1:${PORT}/login`); if (r.status === 200) return true; } catch { } if (Date.now() - t0 > ms) return false; await sleep(200); } };
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--password-store=basic',
  '--window-size=1280,860', '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  for (const root of [wt, HOME]) { try { endRootedProcesses(root); } catch { } }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [PROFILE, HOME, MUT]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
if (!target) { console.error('  ✗ boot: no chrome page'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
let mutantOn = false;
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Fetch.requestPaused') {   // ⑨: the page's /bundle.js answered with the mutant while the control runs
    const p = m.params;
    if (mutantOn && /\/bundle\.js(\?|$)/.test(new URL(p.request.url).pathname + new URL(p.request.url).search)) {
      ws.send(JSON.stringify({ id: ++seq, method: 'Fetch.fulfillRequest', params: { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: MUT_BUNDLE.toString('base64') } }));
    } else ws.send(JSON.stringify({ id: ++seq, method: 'Fetch.continueRequest', params: { requestId: p.requestId } }));
  }
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }); /* lane dialog-yield: a scripted open here stands for the person's (a form opened by no act of the person stands BEHIND) */ if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, { timeout = 15000, step = 100 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
const api = (method, p, body) => evalJs(`fetch(${JSON.stringify(p)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }${body ? `, body: ${JSON.stringify(JSON.stringify(body))}` : ''} }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }))`);
const click = (sel) => evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`);
const text = (sel) => evalJs(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').trim()`);
const URL_ = `http://127.0.0.1:${PORT}/`;
const loaded = async () => { await until(`!!(window.app && document.getElementById('taskbar-tray'))`, { timeout: 30000 }); return until(`!document.getElementById('loading-screen')`, { timeout: 30000 }); };
const setupDialog = `!!document.getElementById('vault-setup-dialog')`;
const h1 = `(document.querySelector('#welcome .welcome-content h1')?.textContent || '').trim()`;

try {
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }] });
  startServer();
  check('the pod-shaped hub is up (a sign-in password, HOME = the person’s home)', await ready());
  await cdp('Page.navigate', { url: URL_ + 'login' });
  await until(`document.readyState === 'complete'`);
  const login = await evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`);
  check('signed in (the pod’s password)', login === 200, login);

  console.log('① the tour’s first screen');
  await cdp('Page.navigate', { url: URL_ });
  await loaded();
  check('a first visit opens the tour', !!(await until(`document.getElementById('welcome')?.classList.contains('onboarding') && !!document.getElementById('ob-next')`, { timeout: 15000 })));
  const w = await evalJs(`(() => { const c = document.querySelector('#welcome .welcome-content'); return { h1: c.querySelector('h1')?.textContent, sub: c.querySelector('.ob-sub')?.textContent, asks: [...c.querySelectorAll('.ob-ask')].map((a) => a.textContent), chips: c.querySelectorAll('.ob-lang, .ob-theme').length, points: c.querySelectorAll('.ob-point').length, dots: c.querySelectorAll('.ob-dot').length, text: c.textContent }; })()`);
  check('it says what it is for in plain words', w.sub === 'An assistant that works on your files — ask it in plain words.', w.sub);
  check('… with three things a person could ask', w.asks.length === 3 && w.asks[0] === 'Read the contracts in my folder and list when each one renews.', w.asks);
  check('THE FINDING (D5): no theme or language chips, no feature pitch, no «coding agents» on screen one', w.chips === 0 && w.points === 0 && !/coding agents|terminal TUI|never die/i.test(w.text), { chips: w.chips, points: w.points });
  check('the dots count THREE steps — a protected pod has no «Protect this workspace»', w.dots === 3, w.dots);
  await shot('day-one-1-welcome.png');

  console.log('② day one asks no second password');
  await sleep(2500);
  const st0 = (await api('GET', '/api/vault/state')).json || {};
  check('the hub: not set up, nothing stored (secretWaiting false)', st0.state === 'not_set_up' && st0.secretWaiting === false, st0);
  check('THE FINDING (D7): no setup dialog over the tour', !(await evalJs(setupDialog)));

  console.log('③ the protect step and its SSO sentence are gone on a pod');
  await click('#ob-next');
  check('Get started → the connect step', (await until(`${h1} === 'Connect your agents'`, { timeout: 5000 })) === true);
  const seen = [];
  await click('#ob-next');
  // the 2.369.344 integration (int344): door-signin-card's connect step is never skipped SILENTLY — with nothing signed
  // in, the first Continue shows its one warning and relabels itself «Continue anyway»; the second press moves on
  const warned = await until(`!document.getElementById('ob-signin-warn')?.hidden && document.getElementById('ob-next')?.textContent === 'Continue anyway'`, { timeout: 3000 });
  check('… nothing signed in: the first Continue warns once and stays on the connect step (door-signin-card)', warned === true && (await evalJs(h1)) === 'Connect your agents', warned);
  await click('#ob-next');
  seen.push(await until(`${h1} || ''`, { timeout: 3000 }));
  check('THE FINDING (D6): Continue lands on the START step — never «Protect this workspace»', seen[0] === 'Start your first chat', seen);
  check('… and no SSO sentence anywhere', !(await evalJs(`document.body.textContent.includes('Single sign-on')`)));
  // the SSO pod (the page's fact set as /api/home would): step 2 asked for directly still lands on the start step
  const sso = await evalJs(`(() => { app._ssoEnabled = true; app._authEnabled = false; app._showOnboarding(true, 2); return document.querySelector('#welcome .welcome-content h1')?.textContent; })()`);
  check('an SSO pod: the tour asked for step 2 lands on the start step (the SSO sentence never shows)', sso === 'Start your first chat' && !(await evalJs(`document.body.textContent.includes('Single sign-on')`)), sso);
  const open = await evalJs(`(() => { app._ssoEnabled = false; app._authEnabled = false; app._showOnboarding(true, 2); return document.querySelector('#welcome .welcome-content h1')?.textContent; })()`);
  check('CONTROL: an UNPROTECTED workspace still shows «Protect this workspace» (the leg can say no)', open === 'Protect this workspace', open);
  await evalJs(`(() => { app._authEnabled = true; app._showOnboarding(true, 3); return true; })()`);

  console.log('④ the start step: a chat on the folder that holds the files');
  const chip0 = await until(`(() => { const c = document.querySelector('#ob-chips .cwd-recent-chip'); return c ? { text: c.textContent, kind: c.dataset.kind, sel: c.classList.contains('selected'), path: c.dataset.path } : null; })()`, { timeout: 8000 });
  check('THE FINDING (D8 / M3): the first chip is «work (23 files)», CHOSEN', !!chip0 && chip0.text === 'work (23 files)' && chip0.kind === 'files' && chip0.sel && chip0.path === WORK, chip0);
  check('… the field holds work/ (nothing to type)', (await evalJs(`document.getElementById('ob-cwd').value`)) === WORK);
  check('… the hidden cache is no chip; the empty Desktop comes after', !(await evalJs(`[...document.querySelectorAll('#ob-chips .cwd-recent-chip')].some((c) => c.dataset.path.endsWith('/.cache'))`)) && (await evalJs(`[...document.querySelectorAll('#ob-chips .cwd-recent-chip')].map((c) => c.textContent).indexOf('Desktop')`)) > 0);
  check('ONE primary button (the terminal is a link)', (await evalJs(`document.querySelectorAll('#welcome .welcome-actions .welcome-btn').length`)) === 1 && (await text('#ob-term')) === 'or a terminal');
  await shot('day-one-2-start.png');
  await evalJs(`window.__dd1Created = []; app.__dd1Create = app.createSession; app.createSession = (o) => { window.__dd1Created.push(o); }; true`);
  await click('#ob-chat');
  const created = await until(`window.__dd1Created[0] || null`, { timeout: 3000 });
  check('Start the chat ⇒ a CHAT created in work/', !!created && created.cwd === WORK && created.mode === 'chat', created);
  await evalJs(`app.createSession = app.__dd1Create; true`);
  check('the tour is done (vs-onboarded)', (await evalJs(`localStorage.getItem('vs-onboarded')`)) === '1');
  check('the empty desktop\u2019s welcome says the same plain sentence (was «Multi-session terminal manager…»)', (await until(`(() => { const w = document.getElementById('welcome'); const p = w && !w.classList.contains('hidden') && w.querySelector('.welcome-content p'); return p ? p.textContent : null; })()`, { timeout: 3000 })) === 'An assistant that works on your files — ask it in plain words.');
  await sleep(2000);
  check('… and the tour’s end asks NO second password either (nothing stored)', !(await evalJs(setupDialog)));

  console.log('⑨ RED CONTROL: the base’s two rules in a bundle built from this source');
  {
    mutantOn = true;
    await cdp('Page.reload', { ignoreCache: true });
    await loaded(); await sleep(2500);
    check('RED CONTROL: the base’s vault rule asks the second password on day one (nothing stored)', await evalJs(setupDialog));
    await evalJs(`document.querySelector('#vault-setup-dialog .vault-later')?.click(); localStorage.removeItem('vs-vault-later'); sessionStorage.clear(); true`);
    await evalJs(`app.showNewSessionDialog(); document.getElementById('input-cwd').value = '/somewhere/another-area'; app.hideDialogs(); app.showNewSessionDialog(); true`);
    check('RED CONTROL: the base’s dialog keeps the other area’s folder', (await evalJs(`document.getElementById('input-cwd').value`)) === '/somewhere/another-area');
    await evalJs(`app.hideDialogs(); true`);
    mutantOn = false;
    await cdp('Page.reload', { ignoreCache: true });
    await loaded(); await sleep(2000);
    check('the real bundle again: no setup dialog', !(await evalJs(setupDialog)));
  }

  console.log('⑤ the second password is asked when the first secret is stored');
  const put = await api('PUT', '/api/integrations/cloud:browserless', { values: { apiKey: 'day-one-leg-key', apiUrl: 'https://day-one.example.net' } });
  check('an integration key is stored', put.status === 200, put);
  check('THE FIX: the setup dialog opens at THAT moment (no reload)', !!(await until(setupDialog, { timeout: 8000 })));
  check('… saying why now', (await text('#vault-setup-dialog .vault-why')) === 'A credential was just stored here — a second password keeps it sealed.');
  await shot('day-one-3-vault.png');
  await click('#vault-setup-dialog .vault-later');
  const later = await evalJs(`Number(localStorage.getItem('vs-vault-later') || 0) - Date.now()`);
  check('「稍后」 snoozes it for 3 days on this device', later > 3 * 24 * 3600e3 - 120e3 && later <= 3 * 24 * 3600e3, later);
  await cdp('Page.reload', { ignoreCache: true }); await loaded(); await sleep(2500);
  check('a reload asks no more (snoozed)', !(await evalJs(setupDialog)));
  await evalJs(`localStorage.removeItem('vs-vault-later'); true`);
  await cdp('Page.reload', { ignoreCache: true }); await loaded();
  check('a cleared snooze asks at the load (a returning person, a secret stored)', !!(await until(setupDialog, { timeout: 10000 })));
  await click('#vault-setup-dialog .vault-later');

  console.log('⑥ the New Session dialog');
  await evalJs(`app.showNewSessionDialog(); true`);
  const d1 = await until(`(() => { const c = document.querySelector('#cwd-recent .cwd-recent-chip[data-kind="files"]'); return c ? { first: document.querySelector('#cwd-recent .cwd-recent-chip')?.textContent, field: document.getElementById('input-cwd').value, ph: document.getElementById('input-cwd').placeholder } : null; })()`, { timeout: 8000 });
  check('the first chip is «work (23 files)»; the field is EMPTY with words for a hint', !!d1 && d1.first === 'work (23 files)' && d1.field === '' && d1.ph === 'Type a folder, or pick one below', d1);
  await evalJs(`document.getElementById('input-cwd').value = '/somewhere/another-area'; app.hideDialogs(); true`);
  await evalJs(`app.sidebar._allSessions = [{ cwd: ${JSON.stringify(path.join(WORK, 'deal'))}, startedAt: Date.now(), sessionId: 'x', backend: 'claude' }]; app.showNewSessionDialog(); true`);
  const d2 = await until(`(() => { const cs = [...document.querySelectorAll('#cwd-recent .cwd-recent-chip')]; return cs.length >= 2 && cs[0].dataset.kind === 'files' ? { field: document.getElementById('input-cwd').value, kinds: cs.map((c) => c.dataset.kind), texts: cs.map((c) => c.textContent) } : null; })()`, { timeout: 8000 });
  check('THE FINDING (D8, lane 3): reopened, the field is EMPTY — never the last dialog’s folder', !!d2 && d2.field === '', d2);
  check('… «work (23 files)», then «Last used: …»', !!d2 && d2.kinds[0] === 'files' && d2.kinds[1] === 'last' && d2.texts[1] === `Last used: ${path.join(WORK, 'deal')}`, d2);
  await shot('day-one-4-dialog.png');
  await click('#cwd-recent .cwd-recent-chip[data-kind="files"]');
  check('a chip fills the field', (await evalJs(`document.getElementById('input-cwd').value`)) === WORK);
  await evalJs(`app.hideDialogs(); true`);

  console.log('⑦ the rail’s words, the first week');
  const rail = await until(`(() => { const r = document.getElementById('sidebar-rail'); if (!r) return null; const lab = (id) => { const e = r.querySelector('.rail-item[data-rail="' + id + '"] .rail-label'); return e && e.getBoundingClientRect().height > 0 ? e.textContent : null; }; return { on: r.classList.contains('rail-labelled'), w: Math.round(r.getBoundingClientRect().width), agents: lab('agents'), mounts: lab('mounts'), rec: localStorage.getItem('vs-rail-labels') }; })()`, { timeout: 8000 });
  check('THE FINDING (D11): the rail carries words — «Agents», «Remote» — at 68 px', !!rail && rail.on && rail.w === 68 && rail.agents === 'Agents' && rail.mounts === 'Remote', rail);
  check('… the week’s record is kept on this device', !!rail && /"since":\d+/.test(rail.rec || ''), rail && rail.rec);
  await shot('day-one-5-rail.png');
  await evalJs(`(() => { const ids = [...document.querySelectorAll('#sidebar-rail .rail-item')].map((b) => b.dataset.rail).filter((d) => d !== 'tasks'); localStorage.setItem('vs-rail-labels', JSON.stringify({ since: Date.now(), used: ids })); return true; })()`);
  await click('#sidebar-rail .rail-item[data-rail="tasks"]');
  const after = await until(`(() => { const r = document.getElementById('sidebar-rail'); return r && !r.classList.contains('rail-labelled') ? Math.round(r.getBoundingClientRect().width) : null; })()`, { timeout: 3000 });
  check('the last unused door pressed ⇒ the words go (44 px), «done»', after === 44 && (await evalJs(`localStorage.getItem('vs-rail-labels')`)) === 'done', after);
  await evalJs(`localStorage.setItem('vs-rail-labels', JSON.stringify({ since: Date.now() - 8 * 24 * 3600e3, used: [] })); true`);
  await cdp('Page.reload', { ignoreCache: true }); await loaded(); await sleep(800);
  check('a week-old record ⇒ no words at the load', (await evalJs(`!document.getElementById('sidebar-rail')?.classList.contains('rail-labelled')`)) === true);

  console.log('⑧ a sign-in terminal is no session row');
  if (!DTACH) check('SKIP-leg: no dtach (the shell sessions cannot spawn)', true);
  else {
    await evalJs(`app.openSignInTerminal(undefined, { initialCommand: 'echo signin-leg' }); true`);
    await evalJs(`app.openShellTerminal(undefined, { initialCommand: 'echo plain-leg' }); true`);
    const live = await until(`(() => { const all = app.sidebar._allSessions || []; const plain = all.some((s) => s.webuiName === 'echo' && s.status === 'live'); return plain ? { n: all.filter((s) => s.webuiName === 'echo').length } : null; })()`, { timeout: 15000 });
    check('CONTROL: a plain terminal IS a session row', !!live, live);
    const rows = await evalJs(`(app.sidebar._allSessions || []).filter((s) => s.webuiName === 'echo').length`);
    check('THE FINDING (D10): the sign-in terminal is no row (two terminals open, one row)', rows === 1, rows);
    const wins = await evalJs(`[...app.wm.windows.values()].filter((w) => /echo/.test(w.title || '')).length`);
    check('… both are windows the person sees', wins === 2, wins);
  }

  // ⑩ lane signin-card-real-screen — the DEAD guided modal (naive41 R2 + naive42 R3, 2.369.344): the tester opened the sign-in
  //    link, sat on the claude.ai tab, came back to «Browser suspended this page for 68s — caught up now» and typed: NO echo,
  //    while a terminal WINDOW survived the same suspension. app.js re-attaches every terminal in app.sessions on a socket's
  //    reconnect; the guided modal's terminal is not one of them. Freeze the page 60 s (CDP Page.setWebLifecycleState — the
  //    browser's own suspension), drop its socket as the suspension did, resume, type → the echo comes back.
  console.log('⑩ the guided modal\'s terminal answers after the page was suspended');
  if (!DTACH) check('SKIP-leg: no dtach (the guided shell cannot spawn)', true);
  else {
    await evalJs(`(() => { try { app.settings.set('terminal.webgl', false); } catch { } app.runGuidedCli({ title: 'Guided leg', cmd: 'echo GUIDED-READY', checkDone: async () => false }); return true; })()`);
    const rows = `(document.querySelector('.guided-cli-term .xterm-rows')?.textContent || '')`;
    const ready = await until(`${rows}.includes('GUIDED-READY')`, { timeout: 20000 });
    check('(setup) the guided modal\'s terminal runs its command', !!ready, await evalJs(rows));
    // the suspension as the page lived it: its socket lost and no way back for 60 s (the network cut, so every
    // reconnect attempt fails meanwhile), then the network back — the page reconnects by itself
    await cdp('Network.enable');
    await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evalJs(`(() => { try { app.ws.ws.close(); } catch { } return true; })()`);
    await sleep(Number(process.env.GUIDED_FREEZE_MS) || 60000); // (an override only to iterate on the leg; the gate runs 60 s)
    check('(setup) the page lost its socket for the whole suspension', (await evalJs('app.ws.connected')) === false);
    await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const back = await until(`app.ws.connected === true`, { timeout: 20000 });
    check('(setup) the page is back and its socket reconnected after the suspension', !!back);
    await sleep(800);
    await evalJs(`(() => { const ta = document.querySelector('.guided-cli-term textarea'); if (ta) ta.focus(); return !!ta; })()`);
    await cdp('Input.insertText', { text: 'echo AFTER-RESUME-$((40+2))' });
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    const echoed = await until(`${rows}.includes('AFTER-RESUME-42')`, { timeout: 15000 });
    check('THE FINDING (naive41/42): after the suspension the modal\'s terminal still answers — typed keys echo, the command\'s output arrives', !!echoed, (await evalJs(rows)).slice(-200));
    await evalJs(`(() => { document.querySelector('#guided-cli-dialog .modal-close, #guided-cli-dialog [data-close], #guided-cli-dialog .dialog-close')?.click(); document.getElementById('guided-cli-dialog')?.remove(); return true; })()`);
  }
  await evalJs(`localStorage.setItem('vibespace.lang', 'zh'); localStorage.removeItem('vs-onboarded'); true`);
  await cdp('Page.reload', { ignoreCache: true }); await loaded();
  await until(`!!document.getElementById('ob-next')`, { timeout: 15000 });
  await evalJs(`app._showOnboarding(true, 3); true`);
  const zh = await until(`(() => { const c = document.querySelector('#ob-chips .cwd-recent-chip'); return c ? { h1: document.querySelector('#welcome .welcome-content h1')?.textContent, chip: c.textContent } : null; })()`, { timeout: 8000 });
  check('中文: 「开始第一个对话」 · 「work（23 个文件）」', !!zh && zh.h1 === '开始第一个对话' && zh.chip === 'work（23 个文件）', zh);
  await shot('day-one-6-zh.png');
} catch (e) {
  failed++; console.error('  ✗ the suite threw: ' + (e && e.stack || e));
}
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
