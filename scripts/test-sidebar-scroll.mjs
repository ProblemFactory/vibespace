#!/usr/bin/env node
// Sidebar lazy-folder scroll preservation (2.228.3, recurring user report:
// "scroll down, click a card's expand arrow → the list jumps back to the
// top"). Mechanism under test: a re-render resets every lazy folder to an
// EMPTY pending div, the list's scrollHeight collapses, and _render()'s
// scrollTop restore clamps to ~0 before the IntersectionObserver can
// materialize anything. The fix reserves each folder's previous height
// (_lazyHeights in _render → minHeight in _observeFolder). This drives the
// REAL render/observer/clamp machinery in a throwaway worktree server +
// headless chrome (raw CDP), feeding _renderGrouped synthetic folders.
// + (lane backend-icons) the 后端 filter popover's backend marks seen PAINTED at 1×/2× DPR, every BACKEND_META
// iconSrc loading as an image — with RED controls (the section at the end).
// Run: node scripts/test-sidebar-scroll.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2); // per-process (scripts/scratch.mjs) — fixed ports collided across concurrent gates
const wt = scratch('scroll-smoke');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--disable-background-timer-throttling', `--user-data-dir=${scratch('scroll-smoke-chrome')}`, 'about:blank'], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(scratch('scroll-smoke-chrome'), { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { await sleep(250); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
};

await cdp('Runtime.enable');
ws.on('message', (d) => { const m = JSON.parse(d);
  if (m.method === 'Runtime.consoleAPICalled') { try { console.log('[page]', m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 500)); } catch {} }
  if (m.method === 'Runtime.exceptionThrown') { try { console.log('[pageEX]', m.params.exceptionDetails?.exception?.description?.slice(0, 300) || JSON.stringify(m.params.exceptionDetails).slice(0, 200)); } catch {} }
});
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
for (let i = 0; i < 60; i++) { if (await evaljs('!!(window.app && window.app.sidebar && window.app.sidebar.listEl)').catch(() => false)) break; await sleep(400); }

// Fresh profile starts rail-collapsed (44px strip, main panel width 0) — a
// zero-height scroller makes every scroll op a no-op. Expand like a user:
// click the active rail item (re-click while collapsed EXPANDS per 2.177.0).
await evaljs(`(() => { window.app.sidebar.toggle(true); return document.querySelector('.sidebar')?.className; })()`);
await sleep(400);
const h = await evaljs(`window.app.sidebar.listEl.closest('.sidebar-section').clientHeight`);
check('sidebar expanded (scroller has height)', h > 200, `clientHeight=${h}`);

const result = await evaljs(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sb = window.app.sidebar;
  let sc = sb.listEl.closest('.sidebar-section');
  const pickScroller = () => { sc = [sb.listEl, sb.listEl.closest('.sidebar-section')].find((el) => el && el.scrollHeight > el.clientHeight + 4) || sc; };
  // 50 folders x 3 stopped sessions — enough content to scroll deep
  const fakes = [];
  for (let g = 0; g < 50; g++) for (let i = 0; i < 3; i++) fakes.push({
    sessionId: 'fk-' + g + '-' + i, claudeSessionId: 'fk-' + g + '-' + i,
    status: 'stopped', backend: 'claude', cwd: '/tmp/proj-' + g, name: 'fake ' + g + '-' + i,
    startedAt: Date.now() - g * 3600e3 - i * 60e3, mtime: Date.now() - g * 3600e3,
  });
  // Drive the REAL lazy grouped renderer through the REAL _render preserve path
  sb._renderInner = () => { sb.listEl.innerHTML = ''; sb._renderGrouped(fakes); };
  sb._lastRenderView = null;
  sb._render();
  await sleep(500); // observer materializes viewport folders
  const pendingWithHeight = [...sb.listEl.querySelectorAll('.folder-sessions')]
    .filter((d) => d.dataset.lazy !== 'rendered' && parseInt(d.style.minHeight || '0') > 0).length;
  pickScroller(); // the real scroller only overflows once content exists
  const fullHeight = sc.scrollHeight;
  const target = Math.floor(sc.scrollHeight * 0.6);
  sc.scrollTop = target;
  const landed = sc.scrollTop; // may clamp if content short — record what we got
  await sleep(500); // observer renders folders at the new viewport
  const before = sc.scrollTop;
  // simulate the expand-toggle re-render (sidebar-render onExpandToggle)
  sb._expandedCardId = 'fk-30-0';
  sb._render();
  const immediatelyAfter = sc.scrollTop;
  await sleep(500);
  const after = sc.scrollTop;
  const rebuiltHeight = sc.scrollHeight;
  return { pendingWithHeight, fullHeight, landed, before, immediatelyAfter, after, rebuiltHeight };
})()`);

check('lazy machinery active (pending folders exist below the fold)', result.pendingWithHeight > 0, JSON.stringify(result));
check('deep scroll actually landed (content tall enough)', result.landed > 500, `landed=${result.landed} fullHeight=${result.fullHeight}`);
check('scrollTop survives the expand re-render (sync)', Math.abs(result.immediatelyAfter - result.before) < 80, `before=${result.before} after-sync=${result.immediatelyAfter}`);
check('scrollTop stays after observer settles', Math.abs(result.after - result.before) < 120, `before=${result.before} after=${result.after}`);
check('rebuilt scrollHeight holds (reserved heights)', result.rebuiltHeight > result.fullHeight * 0.8, `full=${result.fullHeight} rebuilt=${result.rebuiltHeight}`);

// ── THE 后端 FILTER'S MARKS, SEEN (lane backend-icons, the owner 2026-10-23: Claude and Codex with their marks,
// «Antigravity CLI» with none — 「图标补一下」). public/brand/{antigravity,opencode}.svg opened with an XML comment
// holding a double hyphen; Chrome refused the whole file, so the mask painted nothing. The browser is the oracle the
// owner saw fail: (a) every BACKEND_META iconSrc loads as an image (naturalWidth > 0), and a double-hyphen comment
// prepended to today's antigravity.svg is a load ERROR (the oracle sees the defect); (b) with one session per backend
// the popover opened by a real click holds a row per backend whose .backend-icon-mark PAINTS — pixels of the mark's
// box that change when the mark is hidden, at 1× and 2× DPR — and the same mark pointed at the defective file paints
// nothing (the measure sees the owner's symptom). The drift guard is test-brand-svg (fast). PNGs → $VS_BACKEND_FILTER_PNG_DIR.
const { BACKEND_META } = await import(pathToFileURL(path.join(repo, 'src/lib/agent-meta.js')).href);
const MARKED = Object.values(BACKEND_META).filter((m) => m.iconSrc);
const agSvg = fs.readFileSync(path.join(repo, 'public/brand/antigravity.svg'), 'utf8'), svgUrl = (t) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t);
const goodUrl = svgUrl(agSvg), brokenUrl = svgUrl('<!-- recolored by --backend-icon-color -->\n' + agSvg);   // the same bytes, one comment apart
const imgVerdict = (src) => evaljs(`new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r('error'); i.src = ${JSON.stringify(src)}; })`);
for (const m of MARKED) { const w = await imgVerdict(m.iconSrc); check(`${m.id}'s mark ${m.iconSrc} loads as an image in Chrome`, w > 0, `naturalWidth=${w}`); }
const [goodW, brokenW] = [await imgVerdict(goodUrl), await imgVerdict(brokenUrl)];
check('RED CONTROL: a double-hyphen comment prepended to antigravity.svg is a load error in Chrome; the same bytes without it load', brokenW === 'error' && goodW > 0, `broken=${brokenW} good=${goodW}`);
const PNG_DIR = process.env.VS_BACKEND_FILTER_PNG_DIR || null;
const clipShot = async (r) => (await cdp('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } })).result.data;
const markSel = (id) => `document.querySelector('.backend-filter-menu .backend-icon[data-backend="${id}"] .backend-icon-mark')`;
const painted = async (id) => {   // pixels of the mark's box (device px) that change when the mark is hidden
  const q = await evaljs(`(() => { const m = ${markSel(id)}; if (!m) return null; const r = m.getBoundingClientRect(); return { x: Math.floor(r.x) - 1, y: Math.floor(r.y) - 1, w: Math.ceil(r.width) + 2, h: Math.ceil(r.height) + 2 }; })()`);
  if (!q) return -1;
  const on = await clipShot(q);
  await evaljs(`${markSel(id)}.style.visibility = 'hidden'`); await sleep(60);
  const off = await clipShot(q);
  await evaljs(`${markSel(id)}.style.visibility = ''`);
  return evaljs(`(async () => { const load = (s) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(${JSON.stringify(on)}), load(${JSON.stringify(off)})]); const c = document.createElement('canvas'); c.width = A.width; c.height = A.height; const x = c.getContext('2d');
    x.drawImage(A, 0, 0); const a = x.getImageData(0, 0, c.width, c.height).data; x.clearRect(0, 0, c.width, c.height); x.drawImage(B, 0, 0); const b = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let k = 0; k < a.length; k += 4) if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 24) n++; return n; })()`);
};
const SESSIONS = JSON.stringify(MARKED.map((m, i) => ({ sessionId: 'bi-' + m.id, claudeSessionId: 'bi-' + m.id, status: 'stopped', backend: m.id, cwd: '/tmp/proj-icons', name: m.id, startedAt: Date.now() - i * 60e3, mtime: Date.now() - i * 60e3 })));
for (const dpr of [1, 2]) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: dpr, mobile: false });
  await evaljs(`document.querySelector('.backend-filter-menu')?.remove()`);
  let rows = [];
  for (let attempt = 0; attempt < 3 && rows.length < MARKED.length; attempt++) {   // an active-sessions frame may land between the seed and the press
    const b = await evaljs(`(() => { const sb = window.app.sidebar; sb._webuiSessions = ${SESSIONS}; sb._systemSessions = []; document.querySelector('.backend-filter-menu')?.remove();
      const r = document.getElementById('backend-filter').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(300);
    rows = await evaljs(`[...document.querySelectorAll('.backend-filter-menu .status-filter-item .backend-icon[data-backend]')].map((e) => ({ id: e.dataset.backend, mark: !!e.querySelector('.backend-icon-mark'), label: e.closest('.status-filter-item').textContent.trim() }))`);
  }
  check(`${dpr}×: the 后端 popover, opened by a real click, lists one row per marked backend`, MARKED.every((m) => rows.some((r) => r.id === m.id && r.mark)), JSON.stringify(rows));
  const px = {};
  for (let t = 0; t < 20; t++) {   // the masks fetch on first paint: settle on evidence, not a fixed sleep
    for (const m of MARKED) if (!(px[m.id] > 0)) px[m.id] = await painted(m.id);
    if (MARKED.every((m) => px[m.id] > 0)) break;
    await sleep(150);
  }
  for (const m of MARKED) check(`${dpr}×: «${m.label}» row's mark paints (${px[m.id]} px)`, px[m.id] > 0, `painted=${px[m.id]}`);
  if (PNG_DIR) { const r = await evaljs(`(() => { const r = document.querySelector('.backend-filter-menu').getBoundingClientRect(); return { x: r.x - 4, y: r.y - 4, w: r.width + 8, h: Math.min(r.height + 8, 480) }; })()`); fs.mkdirSync(PNG_DIR, { recursive: true }); fs.writeFileSync(path.join(PNG_DIR, `backend-filter-${dpr}x.png`), Buffer.from(await clipShot(r), 'base64')); }
  if (dpr === 1) {
    const ag = MARKED.find((m) => m.id === 'antigravity') || MARKED[MARKED.length - 1];
    await evaljs(`${markSel(ag.id)}.style.setProperty('--backend-icon-mask', ${JSON.stringify(`url("${brokenUrl}")`)})`); await sleep(300);
    const dead = await painted(ag.id);
    await evaljs(`${markSel(ag.id)}.style.setProperty('--backend-icon-mask', ${JSON.stringify(`url("${goodUrl}")`)})`); await sleep(300);
    const twin = await painted(ag.id);   // the same data: road with the good bytes paints — so a 0 above is the parse, not the road
    await evaljs(`${markSel(ag.id)}.style.setProperty('--backend-icon-mask', ${JSON.stringify(`url("${ag.iconSrc}")`)})`);
    check(`RED CONTROL: the «${ag.label}» mark pointed at the double-hyphen file paints nothing (the owner's symptom, measured the same way); the same bytes without the comment paint`, dead === 0 && twin > 0, `broken=${dead} good=${twin}`);
  }
  await evaljs(`document.querySelector('.backend-filter-menu')?.remove()`);
}
await cdp('Emulation.clearDeviceMetricsOverride');

ws.close();
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
