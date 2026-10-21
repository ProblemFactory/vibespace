#!/usr/bin/env node
// THE EFFORT MENU, OPENED IN A REAL DOCUMENT (lane effort-menu-per-harness; the owner 2026-10-21 13:4xZ, on an
// Antigravity conversation: 推理强度: ? — the menu offered 默认(重置) / low / medium / high / xhigh / max / ultracode,
// «antigravity 也是这几个档位吗？»). agy --effort takes low|medium|high|xhigh|max; ultracode is claude's own.
//
// The REAL ChatStatusBar (bundled from src/, the zh dictionary on, as the owner reads it) in headless Chrome; the
// page's /api/session-options is the hub route's own PURE answer (src/harness-efforts.js sessionOptionsAnswer over the
// REAL harness registry, the claude CLI's parsed five). Each leg clicks the «推理强度» chip and reads the rows:
//   ① antigravity: 默认（重置） + low … max — NO ultracode; the chip shows the COMMANDED effort «as asked at start»,
//      «推理强度：?» only when nothing was asked; picking max sends set-effort max.
//   ② claude: 默认（重置） + low … max + ultracode (claude's own extra — unchanged).
//   ③ opencode (no effort levels): NO effort chip at all.
//   ④ MUTANT — a bar copy whose menu asks WITHOUT its backend (2.369.336) ⇒ ① RED: antigravity is offered ultracode.
// RED CONTROL = the base tree (b21fafbc): run there, the page answers what that tree's route answered (claude's rows
// to every backend) and ① is red the same way. SKIPs without chrome.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ONBOARDED_SOURCE, scratchDir } from './scratch.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
const FIVE = ['low', 'medium', 'high', 'xhigh', 'max'];

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('  - SKIP: no chrome/chromium on this box'); console.log('\nALL PASS (0) — SKIPPED'); process.exit(0); }

// THE ROUTE'S ANSWER — the hub's own function where this tree has it; on an older tree (the RED CONTROL) what that
// tree's route answered: the claude CLI's levels + claude's gated extras, whatever the backend.
const H = require(path.join(REPO, 'src/harnesses'));
const answerOf = (() => {
  const f = path.join(REPO, 'src/harness-efforts.js');
  if (fs.existsSync(f)) { const { sessionOptionsAnswer } = require(f); return (q) => sessionOptionsAnswer(q, { harnessOf: (id) => H.get(id), cliLevels: FIVE, permissionModes: ['default'], catalog: {} }); }
  const { effortExtrasFor } = require(path.join(REPO, 'src/server/cli-env.js'));
  return () => ({ effortLevels: FIVE, effortExtras: effortExtrasFor(H.get('claude').ui.effortExtras, FIVE), permissionModes: ['default'] });
})();

const http = await import('node:http');
const net = await import('node:net');
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const WebSocket = require('ws');
const freePort = () => new Promise((res, rej) => { const sv = net.createServer(); sv.on('error', rej); sv.listen(0, '127.0.0.1', () => { const pt = sv.address().port; sv.close(() => res(pt)); }); });
const tmp = scratchDir('effort-menu-chrome');
const BAR = path.join(REPO, 'src/lib/chat-status-bar.js');
const BAR_SRC = fs.readFileSync(BAR, 'utf8');
const ASK = "fetch(`/api/session-options?backend=${encodeURIComponent(this._backend || 'claude')}`)";
/** one bundle of the REAL bar (+ agent-meta), the bar's source optionally swapped for a mutant */
async function bundle(name, barSrc) {
  const entry = path.join(tmp, `${name}.entry.js`);
  fs.writeFileSync(entry, `export { ChatStatusBar } from ${J(BAR)};\n`);
  const plugins = [{ name: 'stub-build-version', setup(b) {
    b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'bv' }));
    b.onLoad({ filter: /.*/, namespace: 'bv' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' }));
    if (barSrc) b.onLoad({ filter: /chat-status-bar\.js$/ }, () => ({ contents: barSrc, loader: 'js', resolveDir: path.dirname(BAR) }));
  } }];
  const out = path.join(tmp, `${name}.iife.js`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', globalName: 'VS', platform: 'browser', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins });
  return fs.readFileSync(out, 'utf8').replace(/<\/script/gi, '<\\/script');
}
const css = ['public/style.css', 'public/chat.css'].map((f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/<\/style/gi, '<\\/style'));
const page = (js) => `<!doctype html><meta charset="utf-8"><title>effort menu</title><style>${css[0]}</style><style>${css[1]}</style>`
  + '<style>html,body{margin:0;height:100%}#host{position:fixed;inset:0;display:flex;flex-direction:column;justify-content:flex-end}</style>'
  + `<body><div id="host" class="chat-view"><div id="bar"></div></div><script>${js}</script>`;
const mutantSrc = BAR_SRC.includes(ASK) ? BAR_SRC.replace(ASK, "fetch('/api/session-options')") : null;
const pages = { '/': page(await bundle('real', null)), ...(mutantSrc ? { '/mutant': page(await bundle('mutant', mutantSrc)) } : {}) };
const asked = [];
const port = await freePort(), cdpPort = await freePort();
const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/api/session-options') { asked.push(u.search); r.writeHead(200, { 'content-type': 'application/json' }); r.end(J(answerOf(Object.fromEntries(u.searchParams)))); return; }
  if (pages[u.pathname]) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(pages[u.pathname]); return; }
  r.writeHead(404); r.end('{}');
}).listen(port, '127.0.0.1');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, '--no-first-run', '--no-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${tmp}/chrome`, 'about:blank'], { stdio: 'ignore' });
let ws = null;
try {
  let target = null;
  for (let i = 0; i < 120 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((x) => x.type === 'page'); } catch { }
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('chrome never exposed a CDP page target');
  ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(J({ id, method, params })); });
  const evaljs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(J(r.result.exceptionDetails).slice(0, 500));
    return r.result?.result?.value;
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" }); // the owner reads the bar in zh
  const open = async (url) => {
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${port}${url}` });
    for (let i = 0; i < 80; i++) { if (await evaljs('!!(window.VS && window.VS.ChatStatusBar)').catch(() => false)) return true; await sleep(150); }
    return false;
  };
  /** mount a bar for <backend>, apply <status>, click the effort chip, read the chip + the rows (+ the pick's frame) */
  const probe = (backend, status, pick) => evaljs(`(async () => {
    document.querySelectorAll('.chat-status-dropdown').forEach((d) => d.remove());
    const host = document.getElementById('bar'); host.innerHTML = '';
    const sent = [];
    const bar = new VS.ChatStatusBar({ send(m){ sent.push(m); }, on(){}, onGlobal(){} }, 'sess-${backend}', { backend: ${J(backend)}, getToolMsg: () => null, openSubagentViewer(){}, openInTempEditor(){}, getWorkflowIds: () => ({}) });
    host.appendChild(bar.element);
    bar.applyStatus(${J(status)});
    const chip = bar.element.querySelector('.chat-status-effort');
    if (!chip) return { chip: null };
    const out = { chip: chip.textContent.trim(), title: chip.title };
    chip.click();
    let dd = null;
    for (let i = 0; i < 100; i++) { dd = document.querySelector('.chat-status-dropdown'); if (dd && !dd.querySelector('.chat-status-dim')) break; await new Promise((r) => setTimeout(r, 50)); }
    const items = dd ? [...dd.querySelectorAll('.chat-status-dropdown-item')] : [];
    out.rows = dd ? items.map((x) => x.textContent.trim()) : null;
    const want = ${J(pick || '')};
    if (want) { const it = items.find((x) => x.textContent.trim() === want); if (it) it.click(); out.sent = sent.filter((m) => m.type === 'set-effort').map((m) => m.effort); out.chipAfter = bar.element.querySelector('.chat-status-effort')?.textContent.trim(); }
    document.querySelectorAll('.chat-status-dropdown').forEach((d) => d.remove());
    return out;
  })()`);
  const words = (rows) => (rows || []).map((r) => r.split(' — ')[0]);

  ok(await open('/'), 'the page loads the REAL bundled bar');
  console.log('— ① antigravity (the owner\'s conversation: gemini-4-argon-high)');
  const n0 = asked.length;
  const a = await probe('antigravity', { model: 'gemini-4-argon-high', effort: 'high' }, 'max');
  ok(J(words(a.rows)) === J(['默认（重置）', ...FIVE]), 'the menu = 默认（重置） + low … max — agy\'s five, NO ultracode', a.rows);
  ok(asked.slice(n0).includes('?backend=antigravity'), 'the bar asked /api/session-options for ITS backend', asked.slice(n0));
  ok(a.chip === 'high' && a.title.startsWith('推理强度（启动时指定的值 — 该 CLI 不报告每轮的强度）'), 'the «推理强度» chip shows the COMMANDED effort, titled «as asked at start (the CLI reports no per-turn effort)»', [a.chip, a.title]);
  ok(J(a.sent) === '["max"]' && a.chipAfter === 'max', 'picking max sends set-effort max and the chip follows', [a.sent, a.chipAfter]);
  const q = await probe('antigravity', { model: 'gemini-4-argon-high' });
  ok(q.chip === '推理强度：?' && q.title.startsWith('启动时未指定推理强度，CLI 也不报告'), '«推理强度：?» only when nothing was asked — and the title says agy\'s own default applies', [q.chip, q.title]);
  console.log('— ② claude');
  const c = await probe('claude', { model: 'claude-fable-5-1', effort: 'xhigh' });
  ok(J(words(c.rows)) === J(['默认（重置）', ...FIVE, 'ultracode']), 'the menu = 默认（重置） + low … max + ultracode (claude\'s own extra)', c.rows);
  console.log('— ③ opencode');
  const o = await probe('opencode', { model: 'opencode/m' });
  ok(o.chip === null, 'no effort levels ⇒ NO effort chip (never a «?» opening another harness\'s ladder)', o);
  console.log('— ④ MUTANT: the bar asking without its backend (2.369.336)');
  if (!mutantSrc) ok(false, 'setup: the per-backend ask is ONE identifiable expression in the bar (this tree predates it — the base)', ASK);
  else {
    ok(await open('/mutant'), 'the mutant page loads');
    const m = await probe('antigravity', { model: 'gemini-4-argon-high' });
    ok(words(m.rows).includes('ultracode'), 'MUTANT ⇒ ① RED: antigravity is offered ultracode again', m.rows);
  }
} catch (e) {
  ok(false, 'the chrome leg ran', String(e.stack || e).slice(0, 900));
} finally {
  try { ws?.close(); } catch { }
  try { chrome.kill('SIGKILL'); } catch { }
  srv.close();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
