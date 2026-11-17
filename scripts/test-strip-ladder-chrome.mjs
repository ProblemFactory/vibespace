#!/usr/bin/env node
// THE STRIP'S LADDER (lane mask-value-shape, the chat status strip step two — P4; the owner's arrangement of 2026-11-14, page
// /var/tmp/vibespace-lanes/chat-status-strip/page.md §4 and the artboard N.html; the laws of the build brief): the REAL
// src/lib/chat-status-bar.js bundled by esbuild into a static page with the REAL public/style.css + chat.css, in a real Chrome,
// at the chat window's own widths 280 / 320 / 360 / 420 / 500 / 720 / 960 / 1200 / 1440, in zh / ja / en, two faces (dark /
// light), two fixtures — FULL: every mark at once with the long real values (a locked model with a long name, its thinking
// level, the permission mode that asks nothing, a context at 99 %, waiting for you, a lost link, an armed auto-continue, three
// things on row 2: a browser and a channel with long titles, background work); BARE: nothing transient:
//   ① ONE row at 960 and above; the SAME two rows below it — every mark on the row the table gives it (src/lib/strip-table.js)
//   ② nothing cut: every mark inside the bar's box; nothing behind «⋯» (no ⋯ chip, nothing folded); a long title is cut INSIDE
//      its own chip (its words ellipsized, the chip inside the bar)
//   ③ the short forms at 360 and below (the doors' words hidden: «38%», «⟳ 1», «⚙ 设置»), the full ones above
//   ④ the height: one row ≤ 30 px, two rows ≤ 60 px
//   RED CONTROL: the base's ONE row put back (nowrap) at 500 px ⇒ ① and ② go red; taken back, the same case is green.
// The faces: the laws are judged on the dark face; the light face is pictured (the geometry is the stylesheet's, not the colours).
// The widths are WINDOW widths (page §4): the bar judges them on its .window (_layout); this page has no window, so its host —
// the bar's own box — stands for the window, the same number in the page and the ladder.
// PNGs: STRIP_LADDER_PNG_DIR (default: the scratch dir) <lang>-<face>-<fixture>-<width>.png — the pictures for the owner.
// SKIPs with evidence without chrome. Scratch: the suite's own scratch root only. No server, no network, no sign-in.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome on this machine'); process.exit(0); }
const ROOT = scratch('strip-ladder'); fs.mkdirSync(ROOT, { recursive: true });
const PNG_DIR = process.env.STRIP_LADDER_PNG_DIR || path.join(ROOT, 'png'); fs.mkdirSync(PNG_DIR, { recursive: true });
const { STRIP_ROWS, ONE_ROW_PX, SHORT_FORM_PX } = await import(path.join(REPO, 'src/lib/strip-table.js'));
const PLACE = Object.fromEntries(STRIP_ROWS.map((r) => [r.key, r.place]));
const WIDTHS = [280, 320, 360, 420, 500, 720, 960, 1200, 1440];
const LANGS = ['zh', 'ja', 'en'];
const FACES = ['dark', 'light'];

// ── the page: the bar module, the real stylesheets, a fixture builder and the measure ──
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const entry = path.join(ROOT, 'entry.js');
fs.writeFileSync(entry, `import { ChatStatusBar } from ${JSON.stringify(path.join(REPO, 'src/lib/chat-status-bar.js'))};
const PLACE = ${JSON.stringify(PLACE)};
window.mkStrip = (fixture, width) => {
  const host = document.getElementById('host'); host.innerHTML = ''; host.style.width = width + 'px';
  document.querySelectorAll('.chat-status-dropdown').forEach((d) => d.remove());
  const ws = { send() {}, onGlobal() {}, offGlobal() {}, on() {}, off() {} };
  const sb = new ChatStatusBar(ws, 'sid-ladder', { backend: 'claude', getToolMsg: () => null, openSubagentViewer() {}, openInTempEditor() {}, onDesignRequest: () => {}, onJumpToAsk: () => {} });
  host.appendChild(sb.element); sb.popupContainer = host;
  if (fixture === 'full') {
    const now = Date.now();
    sb.applyStatus({ model: 'claude-fable-5-1[1m]', modelLocked: true, lockedModel: 'fable[1m]', contextWindow: 1000000, lastUsage: { input_tokens: 980000, cache_read_input_tokens: 9000 }, total_cost_usd: 63854.44, permissionMode: 'bypassPermissions', effort: 'ultracode' });
    sb.setPendingAsks([{ kind: 'main', requestId: 'r-ladder', label: 'Approve the deploy' }]);
    sb.setTurnState('requires_action');
    sb.setRemoteState({ state: 'reconnecting', attempts: 2 });
    sb.setAutoResume({ enabled: true, armed: true, watch: false, resetsAt: now + 3600e3 });
    sb.setArtifacts({ ok: true, count: 56, codeCount: 0, rows: [] });
    sb.setOutbox({ total: 51, waiting: 2 });
    sb.setBrowserProfile({ key: 'k-ladder', fact: { input: 'agent' }, words: { show: true, line: 'Agent browser · the research profile with a long name', amber: false } });
    const row = { key: 'lark:c-ladder', title: '产品发布协调群（周报 / 版本节奏 / 值班表）', convId: 'c-ladder', account: 'Lark', icon: 'chat', op: 'read', at: now };
    sb.setChannelTouches({ rows: [row], latest: row });
    sb.setTasks({ t1: { status: 'running', description: '盯着构建，失败的集成测试重跑直到全部通过' } });
  } else {
    sb.applyStatus({ model: 'claude-fable-5-1', contextWindow: 200000, lastUsage: { input_tokens: 76000 }, permissionMode: 'default', effort: 'high' });
  }
  sb.render();
  window.sb = sb; return true;
};
window.measure = () => {
  const bar = window.sb.element, br = bar.getBoundingClientRect();
  const kids = [...bar.children].filter((c) => !c.classList.contains('chat-status-rowbreak') && !c.classList.contains('chat-status-classline') && c.getBoundingClientRect().width > 0);
  const mid = (c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2; };
  const rowsAt = []; for (const m of kids.map(mid).sort((a, b) => a - b)) if (!rowsAt.length || m - rowsAt[rowsAt.length - 1] > 6) rowsAt.push(m);
  const rowOf = (c) => { const m = mid(c); let k = 0; rowsAt.forEach((x, i) => { if (Math.abs(x - m) < Math.abs(rowsAt[k] - m)) k = i; }); return k; };
  const marks = kids.map((c) => ({ key: c.getAttribute('data-chip'), row: rowOf(c), r: c.getBoundingClientRect() }));
  const wrongRow = rowsAt.length > 1 ? marks.filter((m) => (m.row === 0) !== (PLACE[m.key] === 'row1')).map((m) => m.key + '@' + (m.row + 1)) : [];
  const cut = marks.filter((m) => m.r.left < br.left - 0.5 || m.r.right > br.right + 0.5 || m.r.bottom > br.bottom + 0.5 || m.r.top < br.top - 0.5).map((m) => m.key);
  const unknown = marks.filter((m) => !PLACE[m.key]).map((m) => m.key);
  const words = [...bar.querySelectorAll('.chat-status-door-word')].filter((e) => getComputedStyle(e).display !== 'none').length;
  const titles = [...bar.querySelectorAll('.chat-status-browser-text, .chat-status-channels-text, .chat-status-door-title')].map((e) => ({ cls: e.className, cutInside: e.scrollWidth > e.clientWidth + 1, ellipsis: getComputedStyle(e).textOverflow }));
  return { w: Math.round(br.width), h: Math.round(br.height), rows: rowsAt.length, row1: marks.filter((m) => m.row === 0).map((m) => m.key).join(' '), row2: marks.filter((m) => m.row === 1).map((m) => m.key).join(' '),
    wrongRow, cut, unknown, more: !!bar.querySelector('.chat-status-more'), folded: bar.querySelectorAll('.chat-status-folded').length,
    short: bar.classList.contains('chat-status-short'), oneRowClass: bar.classList.contains('chat-status-one-row'), words, titles, marks: marks.length };
};`);
await esbuild.build({ entryPoints: [entry], bundle: true, outfile: path.join(ROOT, 'bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent' });
fs.writeFileSync(path.join(ROOT, 's0.css'), fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8'));
fs.writeFileSync(path.join(ROOT, 's1.css'), fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8'));
fs.writeFileSync(path.join(ROOT, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>try { const q = new URLSearchParams(location.search); localStorage.setItem('vibespace.lang', q.get('lang') || 'en'); document.documentElement.dataset.theme = q.get('face') || 'dark'; } catch {}</script>
<link rel="stylesheet" href="s0.css"><link rel="stylesheet" href="s1.css">
</head><body style="margin:0;padding:12px;background:var(--bg-app, #111)"><div class="chat-view" style="display:block;position:relative;height:auto"><div id="host" style="position:relative"></div></div><script src="bundle.js"></script></body></html>`);
const pageUrl = (lang, face) => 'file://' + path.join(ROOT, 'index.html') + `?lang=${lang}&face=${face}`;

// ── Chrome: its own scratch profile, no keyring, no bus, no display ──
const CDP = await freePort();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--allow-file-access-from-files',
  '--password-store=basic', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'],
{ stdio: ['ignore', 'ignore', 'pipe'], detached: true, env: { ...process.env, HOME: ROOT, XDG_RUNTIME_DIR: ROOT, DISPLAY: '', DBUS_SESSION_BUS_ADDRESS: '' } });
const done = async () => {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { }
  if (chrome.exitCode === null && chrome.signalCode === null) await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 5000); });
  for (let i = 0; i < 200; i++) { try { process.kill(-chrome.pid, 0); } catch { break; } await sleep(25); }
};
let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('SKIP: chrome exposed no CDP page target'); await done(); process.exit(0); }
const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
let seq = 0; const pend = new Map(); const pageErrors = [];
cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '?'); });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
const ev = async (js) => { const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: every chrome suite pre-sets vs-onboarded (this page is not the app, but the rule is a census)
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 400, deviceScaleFactor: 1, mobile: false });
const open = async (lang, face) => {
  await send('Page.navigate', { url: pageUrl(lang, face) });
  for (let i = 0; i < 80; i++) { if (await ev('typeof window.mkStrip === "function" && document.readyState === "complete"')) return true; await sleep(100); }
  return false;
};
const at = async (fixture, width) => { await ev(`window.mkStrip(${JSON.stringify(fixture)}, ${width})`); await sleep(120); await ev('window.sb.render(), true'); await sleep(60); return ev('window.measure()'); };
const shot = async (name) => {
  const r = await ev(`(() => { const b = document.getElementById('host').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: r.w + 12, height: r.h + 12, scale: 1 } });
  if (s.result && s.result.data) fs.writeFileSync(path.join(PNG_DIR, name), Buffer.from(s.result.data, 'base64'));
};
/** the four laws over one measure; `want` = 1 or 2 rows */
const lawsOf = (m, width) => {
  const want = width >= ONE_ROW_PX ? 1 : 2;
  const rowsOk = m.rows === want && m.wrongRow.length === 0;
  const whole = m.cut.length === 0 && !m.more && m.folded === 0 && m.unknown.length === 0 && m.titles.every((t) => !t.cutInside || t.ellipsis === 'ellipsis');
  const forms = width <= SHORT_FORM_PX ? m.short && m.words === 0 : !m.short;
  const height = want === 1 ? m.h <= 30 : m.h <= 60;
  return { rowsOk, whole, forms, height, all: rowsOk && whole && forms && height };
};

try {
  for (const lang of LANGS) {
    for (const face of FACES) {
      if (!ok(await open(lang, face), `${lang}/${face}: the static page booted (the real bar + the real stylesheets)`)) continue;
      for (const fixture of ['full', 'bare']) {
        for (const width of WIDTHS) {
          const m = await at(fixture, width);
          await shot(`${lang}-${face}-${fixture}-${width}.png`);
          if (face !== 'dark') continue; // the laws on one face; the other is pictured
          const L = lawsOf(m, width);
          ok(L.all, `${lang} ${fixture} ${width} px: ${m.rows} row(s) (want ${width >= ONE_ROW_PX ? 1 : 2}) — row 1 «${m.row1}»${m.rows > 1 ? `, row 2 «${m.row2}»` : ''}; nothing cut, nothing behind ⋯; ${width <= SHORT_FORM_PX ? 'the short forms' : 'the full forms'}; ${m.h} px`,
            { L, m });
        }
      }
    }
  }
  // RED CONTROL — the base's ONE row put back (nowrap, overflow hidden) at 500 px: the arrangement's laws go red; taken back, green
  await open('zh', 'dark');
  await ev(`(() => { const st = document.createElement('style'); st.id = 'ladder-red'; st.textContent = '.chat-status-bar { flex-wrap: nowrap !important; overflow: hidden !important; }'; document.head.appendChild(st); return true; })()`);
  const red = lawsOf(await at('full', 500), 500);
  await ev(`(() => { document.getElementById('ladder-red').remove(); return true; })()`);
  const back = lawsOf(await at('full', 500), 500);
  ok(!red.rowsOk && !red.whole && back.all, `RED CONTROL: the base's ONE row put back at 500 px breaks ① (rows ${red.rowsOk}) and ② (whole ${red.whole}); taken back, the same case holds (${back.all})`, { red, back });
  ok(pageErrors.length === 0, `no page error on the way (${pageErrors.length})`, pageErrors.slice(0, 3));
  console.log(`  pictures: ${PNG_DIR} (${fs.readdirSync(PNG_DIR).filter((f) => f.endsWith('.png')).length} PNGs)`);
} finally { try { cdp.close(); } catch { } await done(); }
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
