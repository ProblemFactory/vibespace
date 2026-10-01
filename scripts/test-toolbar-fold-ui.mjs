#!/usr/bin/env node
// THE TOP TOOLBAR, SEEN — a rect census over real pages (lane toolbar-fold, 2026-09-30; the owner: "the top-right
// cluster of green buttons takes too much width on a low-resolution screen and overlaps other chrome"). Measured before
// the fix: `.toolbar-right { min-width: 160px; justify-content: flex-end }` let its buttons overflow LEFTWARD over the
// layout presets, the title and — sidebar open — under the sidebar; 21 of 60 states (23 under DejaVu Sans). Every
// judgement here is taken from rendered rects (a PNG + a JSON per state kept as the artifact):
//
//   ① THE CENSUS — zh / ja / en × 1024×768 / 1280×720 / 1366×768 / 1920×1080 × UI scale 1 / 1.25 × sidebar open /
//      closed (+ toolbar scale 0.9 / 1.1 at 1280×720, 1.25 at 1024×768 × UI 1.25), every button a machine with a desktop
//      would show forced on: no two toolbar items' rects intersect; nothing passes the toolbar's box; nothing lies under
//      the sidebar; a full button's words fit on one line; a compact button (the icon step) is a glyph whose words are
//      its accessible name and its tooltip; the page's verdict = barLadder re-run on the page's own inputs; the ⋯ shown
//      iff something folded, never more than one; a glyph or a fold only when the full bar really overflows (the
//      classes lifted for one synchronous measurement);
//   ② THE ⋯ at folded states: its menu lists exactly the folded items in the bar's order, in the page's language; a
//      click on a folded row does what the button did (the same window / dialog / layout the button produced on a wide
//      page), the layout presets as a submenu of their own buttons;
//   ③ CUSTOMIZE MODE at a folded state: every element full and shown (nothing folded or compact, no ⋯, no two items
//      intersect — the bar may wrap), Done folds again to the same verdict;
//   ④ THE ARRANGED ORDER: the tray widgets moved into the right zone, Web view moved first, Terminal hidden — the fold
//      reads the arranged order (the verdict's items = the DOM order), a hidden button never counts, the widgets never
//      fold, the ⋯ rows follow the arrangement;
//   ⑤ CONTROLS: (a) the stylesheet swapped for an identical copy stays green (the swap is neutral); (b) the PRE-FIX
//      toolbar — a bundle whose installToolbarFold is a no-op (scripts/mutant-copy.mjs, bundled with esbuild) under a
//      patched copy of style.css with the old `.toolbar-right` rule — goes RED at the audit's worst state (ja 1024×768,
//      UI 125 %, sidebar open): overlaps and buttons under the sidebar, exactly the owner's picture.
//   The whole of ①–④ runs TWICE: this box's fonts, then THE RUNNER'S (fontconfig limited to DejaVu + Liberation + Noto
//   CJK — ci.yml's set — and 'DejaVu Sans' forced on the chrome, proven drawn by CSS.getPlatformFontsForNode); the
//   second pass SKIPs with a reason where DejaVu Sans is not installed.
// Artifacts: /tmp/vibespace-toolbar-fold-shots/run-<pid>-<time>/ (the newest three runs kept). SKIPs without chrome / dtach.
// Run: node scripts/test-toolbar-fold-ui.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const L = await import('../src/lib/live-bar-layout.js');
const TM = await import('../src/lib/toolbar-fold-model.js');
const zhDict = (await import('../src/lib/i18n-zh.js')).default;
const jaDict = (await import('../src/lib/i18n-ja.js')).default;
const tr = (lang, k) => (lang === 'zh' ? zhDict[k] : lang === 'ja' ? jaDict[k] : null) || k;

let pass = 0, fail = 0, skipped = 0;
let FACE = '';
const ok = (c, n, extra) => { const name = (FACE ? `[${FACE}] ` : '') + n; if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name + (extra ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await pred(); if (v) return v; } catch { } await sleep(every); } try { return await pred(); } catch { return null; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('tbfold-ui');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const MUT = mutantCopies('tbfold-ui', repo);
const SHOTS_ROOT = path.join(os.tmpdir(), 'vibespace-toolbar-fold-shots');
const SHOTS = path.join(SHOTS_ROOT, `run-${process.pid}-${Date.now()}`);
fs.mkdirSync(SHOTS, { recursive: true });
try { const runs = fs.readdirSync(SHOTS_ROOT).filter((d) => /^run-\d+-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[2]) - Number(a.split('-')[2])); for (const d of runs.slice(3)) fs.rmSync(path.join(SHOTS_ROOT, d), { recursive: true, force: true }); } catch { }
console.log(`artifacts: ${SHOTS}`);

const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  if (fakeHome) { try { endRootedProcesses(fakeHome); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

// ── THE MEASURER (runs in the page) ──
function MEASURE() {
  const R = (b) => ({ x: Math.round(b.left * 10) / 10, y: Math.round(b.top * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, r: Math.round(b.right * 10) / 10, b: Math.round(b.bottom * 10) / 10 });
  const tb = document.getElementById('toolbar');
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const leaves = [];
  for (const top of tb.children) {
    if (top.classList.contains('bar-ruler-host')) continue;
    const kids = top.tagName === 'BUTTON' ? [top] : [...top.children];
    for (const el of kids) {
      if (!vis(el)) continue;
      const name = el.id || (el.classList.contains('toolbar-title') ? 'toolbar-title' : String(el.className?.baseVal ?? el.className));
      const span = el.classList.contains('toolbar-action') ? el.querySelector('span') : null;
      let lines = 0;
      if (span && vis(span)) { const rg = document.createRange(); rg.selectNodeContents(span); lines = new Set([...rg.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round((r.top + r.bottom) / 2 / 4))).size; }
      leaves.push({
        id: name, rect: R(el.getBoundingClientRect()), compact: el.classList.contains('tb-compact'),
        words: span ? span.textContent.trim() : '', wordsShown: !!(span && vis(span)), lines,
        cut: el.tagName === 'BUTTON' && (el.scrollWidth > el.clientWidth + 1),
        aria: el.getAttribute('aria-label') || '', title: el.getAttribute('title') || '', local: el.offsetWidth,
      });
    }
  }
  const overlaps = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i].rect, c = leaves[j].rect;
    const w = Math.min(a.r, c.r) - Math.max(a.x, c.x), h = Math.min(a.b, c.b) - Math.max(a.y, c.y);
    if (w > 0.5 && h > 0.5) overlaps.push({ a: leaves[i].id, b: leaves[j].id, w: Math.round(w * 10) / 10 });
  }
  const tbr = R(tb.getBoundingClientRect());
  const outside = leaves.filter((l) => l.rect.x < tbr.x - 0.5 || l.rect.r > tbr.r + 0.5 || l.rect.y < tbr.y - 0.5 || l.rect.b > tbr.b + 0.5).map((l) => l.id);
  const sb = document.getElementById('sidebar');
  const sbr = sb && vis(sb) ? R(sb.getBoundingClientRect()) : null;
  const underSidebar = sbr ? leaves.filter((l) => { const a = l.rect; return Math.min(a.r, sbr.r) - Math.max(a.x, sbr.x) > 0.5 && Math.min(a.b, sbr.b) - Math.max(a.y, sbr.y) > 0.5; }).map((l) => l.id) : [];
  const mores = [...document.querySelectorAll('#toolbar-more, .toolbar-more')].filter(vis).length;
  // INDEPENDENT: lift the fold's classes for ONE synchronous measurement — the FULL bar's natural width (the title at
  // its 1 px minimum, the bar at max-content) against the bar's real width: `free` < 0 ⇔ the full bar overflows
  const realW = tb.clientWidth;
  const lifted = [...tb.querySelectorAll('.bar-folded, .tb-compact')].filter((el) => !el.closest('.bar-ruler-host') && el.id !== 'toolbar-more').map((el) => [el, el.className]);
  for (const [el] of lifted) el.classList.remove('bar-folded', 'tb-compact');
  const more = document.getElementById('toolbar-more'); const moreCls = more ? more.className : '';
  if (more) more.classList.add('bar-folded');
  const title = tb.querySelector('.toolbar-title'); const titleStyle = title ? title.getAttribute('style') : null;
  if (title) title.style.maxWidth = '1px';
  const tbStyle = tb.getAttribute('style');
  tb.style.width = 'max-content';
  const naturalW = tb.offsetWidth;
  if (tbStyle === null) tb.removeAttribute('style'); else tb.setAttribute('style', tbStyle);
  if (title) { if (titleStyle === null) title.removeAttribute('style'); else title.setAttribute('style', titleStyle); }
  for (const [el, cls] of lifted) el.className = cls;
  if (more) more.className = moreCls;
  const free = realW - naturalW;
  const nMeasured = [...tb.querySelectorAll('.toolbar-left > *, [data-zone] > *')].filter((el) => el.getClientRects().length || lifted.some(([x]) => x === el)).length;
  const fold = window.app && window.app._toolbarFold ? window.app._toolbarFold.last() : null;
  const tt = tb.querySelector('.toolbar-title');
  const titleInfo = tt ? { visible: getComputedStyle(tt).visibility !== 'hidden' && tt.getClientRects().length > 0, cw: tt.clientWidth, sw: tt.scrollWidth } : null;
  return { vw: innerWidth, toolbar: tbr, sidebar: sbr, leaves, overlaps, outside, underSidebar, mores, free, nMeasured, title: titleInfo, fold };
}
function problemsOf(m) {
  const out = [];
  for (const o of m.overlaps) out.push(`overlap ${o.a} × ${o.b} (${o.w}px)`);
  for (const id of m.outside) out.push(`outside the toolbar: ${id}`);
  for (const id of m.underSidebar) out.push(`under the sidebar: ${id}`);
  if (m.mores > 1) out.push(`${m.mores} ⋯ buttons`);
  if (m.title && m.title.visible && m.title.sw > m.title.cw + 1 && m.title.cw < TM.TITLE_MIN_PX) out.push(`a sliver of the title (${m.title.cw} of ${m.title.sw} px)`);
  for (const l of m.leaves) {
    if (l.cut) out.push(`cut ${l.id} "${l.words}"`);
    if (l.wordsShown && l.lines > 1) out.push(`wrapped ${l.id} "${l.words}" (${l.lines} lines)`);
    if (l.compact && (l.wordsShown || !l.words || l.aria !== l.words || !l.title)) out.push(`compact ${l.id}: words shown ${l.wordsShown}, aria "${l.aria}" vs "${l.words}", title "${l.title}"`);
    if (l.compact && l.local > 32) out.push(`compact ${l.id} is ${l.local}px wide`);
  }
  return out;
}
function foldProblems(m) {
  const v = m.fold;
  if (!v) return ['no fold verdict published'];
  if (v.suspended) return ['the fold is suspended'];
  const out = [];
  const re = L.barLadder({ widthPx: v.widthPx, gapPx: v.gapPx, overflowPx: v.overflowPx, groups: v.groups, items: v.items });
  if (!same([re.shown, re.overflow, re.compact], [v.shown, v.overflow, v.compact])) out.push(`the page's verdict ≠ barLadder(its inputs): ${JSON.stringify({ page: [v.overflow, v.compact], pure: [re.overflow, re.compact] })}`);
  if (!v.fits) out.push(`the verdict does not fit (need ${v.need} > ${v.widthPx})`);
  if (!!v.overflow.length !== (m.mores === 1)) out.push(`the ⋯ is ${m.mores ? 'shown' : 'hidden'} with ${v.overflow.length} folded`);
  // the rule charges each measured item its rounded width + 1 (conservative): a glyph / a fold is gratuitous only when the
  // full bar leaves more room than that rounding (1.5 px per item + 2)
  const slack = 1.5 * m.nMeasured + 2;
  if ((v.overflow.length || v.compact.length) && m.free > slack) out.push(`a glyph / a fold although the full bar fits with ${m.free} px to spare (> ${slack}; compact ${v.compact.join(',')}; folded ${v.overflow.join(',')})`);
  if (!v.overflow.length && !v.compact.length && m.free < -1) out.push(`nothing compact or folded although the full bar overflows by ${-m.free} px`);
  return out;
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
const hasDejaVu = (() => { try { return /DejaVu Sans/.test(execSync('fc-list : family', { encoding: 'utf8' })); } catch { return false; } })();
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  fakeHome = scratchHome('tbfold-ui-home', fs);
  const wt = path.join(ROOT, 'wt');
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  // the WORKING tree is what is judged (a pre-commit run tests what is about to ship)
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const esbuild = require(path.join(repo, 'node_modules', 'esbuild'));
  /** The page bundle from the scratch worktree's sources (the build's own flags); `foldModule` = the file every
   *  `./toolbar-fold.js` import resolves to (the real module, or the control's no-op copy). */
  const bundle = async (foldModule) => esbuild.build({
    entryPoints: [path.join(wt, 'src/client.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent',
    plugins: foldModule ? [{ name: 'toolbar-fold', setup(b) { b.onResolve({ filter: /(^|\/)toolbar-fold\.js$/ }, () => ({ path: foldModule })); } }] : [],
  });
  if (!fs.existsSync(path.join(wt, 'src/lib/build-version.js'))) fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version)};\n`);
  await bundle(null);
  const PORT = await freePort();
  // no agent CLI on the server's PATH (a dir holding claude / codex is dropped; node rides a private dir of its own)
  const NODE_BIN = path.join(ROOT, 'node-bin'); fs.mkdirSync(NODE_BIN, { recursive: true }); fs.symlinkSync(process.execPath, path.join(NODE_BIN, 'node'));
  const PATH = [NODE_BIN, ...(process.env.PATH || '').split(':').filter((d) => d && !fs.existsSync(path.join(d, 'claude')) && !fs.existsSync(path.join(d, 'codex')))].join(':');
  const env = { ...process.env, ...VNC_ENV, PATH, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  let journal = '';
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 60000, 200), 'the worktree server booted', journal.slice(-800))) return;
  { // three shell sessions (the sidebar has rows, the taskbar has items)
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
    await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
    for (const [i, name] of ['build', 'docs', 'review the long-named session'].entries()) ws.send(JSON.stringify({ type: 'create', backend: 'shell', mode: 'terminal', cwd: ROOT, cols: 80, rows: 24, reqId: 'r' + i, sessionName: name }));
    ok(!!await until(() => msgs.filter((m) => m.type === 'created').length >= 3, 15000), 'three shell sessions were created', journal.slice(-400));
    ws.close();
  }
  /** a settings write reached the server (the page's store saves on a 500 ms debounce — a reload before it lands loses it) */
  const settingsLanded = (pred) => until(async () => { const r = await fetch(`http://127.0.0.1:${PORT}/api/settings`); const js = await r.json(); return pred(js); }, 8000, 150);
  const j = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };

  /** One chrome (a font set) and its page helpers. */
  async function openChrome(dejavu) {
    const CDP = await freePort();
    const cenv = { ...process.env };
    if (dejavu) {
      const fc = path.join(ROOT, 'fonts.conf');
      fs.writeFileSync(fc, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/usr/share/fonts/truetype/dejavu</dir><dir>/usr/share/fonts/truetype/liberation</dir><dir>/usr/share/fonts/opentype/noto</dir><dir>/usr/share/fonts/opentype/noto-cjk</dir><dir>/usr/share/fonts/truetype/noto</dir><cachedir>${ROOT}/fc-cache</cachedir><include ignore_missing="yes">/etc/fonts/conf.d</include></fontconfig>`);
      cenv.FONTCONFIG_FILE = fc;
    }
    const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome-' + (dejavu ? 'dv' : 'box'))}`, '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore', env: cenv });
    procs.add(chrome);
    let target = null;
    for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!target) return null;
    const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((r) => cdp.on('open', r));
    procs.add({ kill: () => { try { cdp.close(); } catch { } } });
    let seq = 0; const pend = new Map();
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || 'eval threw').slice(0, 600)); return r.result?.result?.value; };
    await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable'); await send('CSS.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    if (dejavu) await send('Page.addScriptToEvaluateOnNewDocument', { source: "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.id = 'vs-tbfold-face'; st.textContent = \"html, body, button, input, select, textarea { font-family: 'DejaVu Sans', sans-serif !important; }\"; document.head.appendChild(st); });" });
    let VW = 1920, VH = 1080;
    const viewport = async (w, h) => { VW = w; VH = h; await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); };
    const frames = () => evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 80))))');
    async function load(lang, ui) {
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/api/home` }); await sleep(200);
      await evaluate(`(() => { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); localStorage.setItem('vs-onboarded', '1'); localStorage.setItem('vibespace.uiScale', ${JSON.stringify(String(Math.round(ui * 100)))}); localStorage.removeItem('toolbarScale'); return 1; })()`);
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      const up = await until(() => evaluate('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 150))]); })()'), 40000, 250);
      if (!up) throw new Error('the app did not boot');
      await until(() => evaluate(`(() => { const s = document.getElementById('loading-screen'); return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; })()`), 10000);
      // every button a machine with a desktop and desktop apps shows (the widest toolbar a user sees)
      await evaluate(`(() => { const a = window.app; a._vncAvailable = true; a._desktopAppsAvailable = true; a._applyChromeSettings(); for (const id of [...a.wm.windows.keys()]) { try { a.wm.closeWindow(id); } catch {} } return 1; })()`);
      await evaluate('document.fonts.ready.then(() => 1)');
      await frames();
    }
    const setSidebar = async (open) => { await evaluate(`(() => { const sb = window.app.sidebar; if (!!sb.isOpen !== ${open}) sb.toggle(); return 1; })()`); await sleep(380); await frames(); };
    const setTb = async (k) => { await evaluate(`(() => { const r = document.documentElement; ${k === 1 ? "r.style.removeProperty('--toolbar-scale');" : `r.style.setProperty('--toolbar-scale', '${k}');`} return 1; })()`); await frames(); };
    const settle = async () => { await frames(); await evaluate('(() => { const f = window.app._toolbarFold; if (f) f.layoutNow(); return 1; })()'); await frames(); };
    async function shot(file, clip) {
      const params = { format: 'png', captureBeyondViewport: false };
      if (clip) params.clip = { x: 0, y: 0, width: VW, height: Math.min(VH, clip), scale: 1 };
      const r = await send('Page.captureScreenshot', params);
      if (r.result && r.result.data) fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    }
    const fontsOf = async (sel) => { const doc = await send('DOM.getDocument'); const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: sel }); if (!q.result?.nodeId) return []; const f = await send('CSS.getPlatformFontsForNode', { nodeId: q.result.nodeId }); return (f.result?.fonts || []).map((x) => x.familyName); };
    return { chrome, send, evaluate, viewport, load, setSidebar, setTb, settle, shot, frames, fontsOf };
  }

  const VIEWS = [[1024, 768], [1280, 720], [1366, 768], [1920, 1080]];
  const LANGS = ['zh', 'ja', 'en'];
  const real = fs.readFileSync(path.join(repo, 'public/style.css'), 'utf8');
  const writeCss = (tag, text) => { const f = path.join(MUT.dir, `style-${tag}-${process.pid}.css`); fs.writeFileSync(f, text); MUT.files.push(f); return f; };
  const swap = (P, file) => P.evaluate(`(() => { const old = document.getElementById('vs-tbfold-css') || document.querySelector('link[rel=stylesheet][href*="/style.css"]'); if (!old) return false; const st = document.createElement('style'); st.id = 'vs-tbfold-css'; st.textContent = ${JSON.stringify(fs.readFileSync(file, 'utf8'))}; old.replaceWith(st); return true; })()`);

  for (const dejavu of [false, true]) {
    FACE = dejavu ? 'DejaVu Sans' : '';
    if (dejavu && !hasDejaVu) { skip('the runner\'s-font pass: DejaVu Sans is not installed here (fc-list : family)'); continue; }
    console.log(dejavu ? '— the same legs under THE RUNNER\'S fonts (DejaVu + Liberation + Noto CJK, DejaVu Sans forced)' : '— this box\'s fonts');
    const P = await openChrome(dejavu);
    if (!ok(!!P, 'chrome exposed a CDP page target')) continue;
    const tag = dejavu ? '-dejavu' : '';
    const tally = { n: 0, bad: [], folded: 0, compact: 0, full: 0 };
    async function record(name) {
      await P.settle();
      const m = await P.evaluate(`(${MEASURE.toString()})()`);
      await P.shot(path.join(SHOTS, name + tag + '.png'), 150);
      fs.writeFileSync(path.join(SHOTS, name + tag + '.json'), JSON.stringify(m, null, 1));
      const probs = [...problemsOf(m), ...foldProblems(m)];
      tally.n++;
      if (probs.length) tally.bad.push(`${name}: ${probs.slice(0, 4).join('; ')}`);
      if (m.fold && m.fold.overflow && m.fold.overflow.length) tally.folded++; else if (m.fold && m.fold.compact && m.fold.compact.length) tally.compact++; else tally.full++;
      return m;
    }
    try {
      // ═══ ① the census ═══
      console.log('① the census: zh / ja / en × 4 viewports × UI 1 / 1.25 × sidebar open / closed (+ toolbar scales)');
      for (const lang of LANGS) for (const ui of [1, 1.25]) {
        await P.viewport(1920, 1080);
        await P.load(lang, ui);
        for (const [W, H] of VIEWS) {
          await P.viewport(W, H);
          for (const open of [true, false]) {
            await P.setSidebar(open);
            const tbs = [1, ...(W === 1280 && ui === 1 ? [0.9, 1.1] : []), ...(W === 1024 && ui === 1.25 ? [1.25] : [])];
            for (const k of tbs) {
              await P.setTb(k);
              await record(`${lang}-${W}x${H}-ui${ui}-${open ? 'sbopen' : 'sbclosed'}-tb${k}`);
            }
            await P.setTb(1);
          }
        }
        if (dejavu && lang === 'en' && ui === 1) { const f = await P.fontsOf('#btn-new-session span'); ok(f.includes('DejaVu Sans'), `the English words are drawn in DejaVu Sans (${f.join(', ')})`); }
      }
      ok(tally.bad.length === 0, `${tally.n} states: no two toolbar items intersect, nothing passes the toolbar or lies under the sidebar, words whole on one line, glyphs named, the page's verdict = barLadder(its inputs), the ⋯ iff folded, a glyph / a fold only when the full bar overflows (${tally.full} full, ${tally.compact} with glyphs, ${tally.folded} folded)`, tally.bad.slice(0, 6).join('\n    '));
      ok(tally.folded >= 3 && tally.compact >= 10 && tally.full >= 10, `the census saw all three rungs (full ${tally.full} / glyphs ${tally.compact} / folded ${tally.folded})`);

      // ═══ ② the ⋯ at folded states ═══
      console.log('② the ⋯: its rows = the folded items, a row does what the button did');
      const snap = () => P.evaluate(`(() => { const a = window.app; const types = {}; for (const w of a.wm.windows.values()) types[w.type] = (types[w.type] || 0) + 1; const dialogs = [...document.querySelectorAll('.dialog')].filter((d) => !d.classList.contains('hidden') && getComputedStyle(d).display !== 'none').map((d) => d.id); return { types, dialogs, grid: a.wm.grid ? a.wm.grid.rows + 'x' + a.wm.grid.cols : 'free' }; })()`);
      const reset = () => P.evaluate(`(() => { const a = window.app; try { a.hideDialogs(); } catch {} for (const id of [...a.wm.windows.keys()]) { try { a.wm.closeWindow(id); } catch {} } a.wm.setGrid(null); document.querySelectorAll('.context-menu').forEach((m) => m.remove()); return 1; })()`);
      const delta = (a, b) => { const d = {}; for (const k of new Set([...Object.keys(a.types), ...Object.keys(b.types)])) { const n = (b.types[k] || 0) - (a.types[k] || 0); if (n) d[k] = n; } return { types: d, dialogs: b.dialogs.filter((x) => !a.dialogs.includes(x)), grid: a.grid === b.grid ? null : b.grid }; };
      /** what a click on `id`'s button does on a WIDE page (the reference) */
      const reference = {};
      await P.viewport(1920, 1080); await P.load('en', 1); await P.setSidebar(false);
      const ACTS = { 'btn-file-explorer': 'files', 'btn-browser': 'browser', 'btn-presets': 'dialog', 'btn-new-session': 'dialog', 'btn-terminal': 'terminal', 'layout-presets': 'grid' };
      for (const id of Object.keys(ACTS)) {
        await reset(); await sleep(150);
        const a = await snap();
        if (id === 'layout-presets') await P.evaluate(`document.querySelector('#layout-presets .layout-btn[data-layout="maximize"]').click()`);
        else await P.evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
        await until(async () => { const d = delta(a, await snap()); return Object.keys(d.types).length || d.dialogs.length || d.grid; }, 6000, 150);
        reference[id] = delta(a, await snap());
      }
      await reset();
      ok(reference['btn-file-explorer'].types.files === 1 && reference['btn-browser'].types.browser === 1 && reference['btn-presets'].dialogs.includes('dialog-presets') && reference['btn-new-session'].dialogs.includes('dialog-new-session') && reference['layout-presets'].grid === '1x1' && Object.values(reference['btn-terminal'].types).reduce((s, x) => s + x, 0) === 1, 'the references: each button on a wide page does its thing (a file explorer, a web view, the presets dialog, the new-session dialog, a terminal, the maximize grid)', reference);
      // a page folded HARD, as a user can make it: 1024×768 at UI 125 %, toolbar scale 1.25, the sidebar dragged to its
      // 500 px maximum, the tray widgets (usage, For you, desktop previews) moved into the right zone
      const hard = async (on) => P.evaluate(`(() => { const a = window.app, s = a.settings, sb = a.sidebar; const w = ${on ? 500 : 260}; sb._resizer._setSize(w); sb._applySidebarLayoutWidth(w); ${on ? "s.set('chrome.arrangement', { 'toolbar-center': ['layout-presets'], 'toolbar-right': ['btn-presets', 'btn-new-session', 'btn-terminal', 'btn-file-explorer', 'btn-browser', 'btn-desktop-apps', 'btn-desktop', 'taskbar-user-todos', 'taskbar-usage', 'desktop-previews'], 'toolbar-row2': [], 'taskbar-tray': ['taskbar-status'], 'taskbar-row2': [] });" : "s.reset('chrome.arrangement');"} return 1; })()`);
      for (const lang of ['en', 'zh']) {
        await P.viewport(1024, 768); await P.load(lang, 1.25); await P.setSidebar(true); await P.setTb(1.25); await hard(true);
        ok(!!await settingsLanded((js) => (js['chrome.arrangement'] || {})['toolbar-right']?.includes('desktop-previews')), `${lang}: the widgets arrangement reached the server`);
        await P.settle();
        let m = await record(`menu-${lang}-1024x768-ui1.25-sb500-tb1.25-widgets`);
        const folded = m.fold && m.fold.overflow || [];
        ok(['layout-presets', 'btn-presets', 'btn-browser', 'btn-file-explorer'].every((k) => folded.includes(k)), `${lang}: the hard-folded page folds the layout presets, Presets, Web view and Files at least (${folded.join(', ')})`);
        await P.evaluate(`document.getElementById('toolbar-more').click()`); await sleep(200);
        const rows = await P.evaluate(`[...document.querySelectorAll('.toolbar-more-menu > .context-menu-item')].map((e) => (e.childNodes[0] && e.childNodes[0].nodeType === 3 ? e.childNodes[0].nodeValue : e.textContent).replace(' \\u25B8', '').trim())`);
        await P.shot(path.join(SHOTS, `menu-${lang}-open${tag}.png`), 420);
        const want = TM.overflowRows(folded).map((r) => tr(lang, r.submenu || r.label));
        ok(same(rows, want), `${lang}: the ⋯ lists exactly the ${want.length} folded item(s), in the bar's order, in ${lang} (${rows.join(' · ')})`, { rows, want });
        await P.evaluate(`document.querySelectorAll('.context-menu').forEach((x) => x.remove())`);
        // every testable folded row, clicked, does what its button did
        for (const key of folded.filter((k) => ACTS[k])) {
          await reset(); await sleep(150);
          m = await P.evaluate(`(() => window.app._toolbarFold.last())()`);
          if (!m.overflow.includes(key)) { ok(false, `${lang}: ${key} is still folded after the reset`); continue; }
          const a = await snap();
          await P.evaluate(`document.getElementById('toolbar-more').click()`); await sleep(150);
          const label = tr(lang, TM.overflowRows([key])[0].submenu || TM.overflowRows([key])[0].label);
          const clicked = await P.evaluate(`(() => { const rows = [...document.querySelectorAll('.toolbar-more-menu > .context-menu-item')]; const row = rows.find((e) => (e.childNodes[0] && e.childNodes[0].nodeValue || e.textContent).replace(' \\u25B8', '').trim() === ${JSON.stringify(label)}); if (!row) return 'no row'; if (${key === 'layout-presets'}) { row.dispatchEvent(new MouseEvent('mouseenter')); const kid = [...row.querySelectorAll('.context-menu-item')].find((c) => c.textContent === document.querySelector('#layout-presets .layout-btn[data-layout="maximize"]').title); if (!kid) return 'no child'; kid.click(); return 'ok'; } row.click(); return 'ok'; })()`);
          await until(async () => { const d = delta(a, await snap()); return Object.keys(d.types).length || d.dialogs.length || d.grid; }, 6000, 150);
          const d = delta(a, await snap());
          ok(clicked === 'ok' && same(d, reference[key]), `${lang}: the folded row "${label}" does what the ${key} button did (${JSON.stringify(d)})`, { clicked, d, ref: reference[key] });
        }
        await reset(); await hard(false);
        ok(!!await settingsLanded((js) => !js['chrome.arrangement']), `${lang}: the arrangement reset reached the server`);
      }

      // ═══ ③ Customize mode ═══
      console.log('③ Customize mode suspends the fold');
      {
        await P.viewport(1024, 768); await P.load('ja', 1.25); await P.setSidebar(true); await P.setTb(1.25);
        const before = await record('customize-before-ja-1024-ui1.25-tb1.25');
        await P.evaluate('window.app._customize.enter()'); await sleep(400); await P.settle();
        const inCz = await P.evaluate(`(${MEASURE.toString()})()`);
        await P.shot(path.join(SHOTS, `customize-open${tag}.png`), 260);
        const hidden = await P.evaluate(`(() => { const ids = ['btn-presets','btn-new-session','btn-terminal','btn-file-explorer','btn-browser','btn-desktop-apps','btn-desktop','layout-presets']; return ids.filter((id) => { const el = document.getElementById(id); return !el || getComputedStyle(el).display === 'none' || el.classList.contains('bar-folded') || el.classList.contains('tb-compact'); }); })()`);
        ok(before.fold.overflow.length > 0 && inCz.fold && inCz.fold.suspended && hidden.length === 0 && inCz.mores === 0 && inCz.overlaps.length === 0, `while editing every element is full and shown (none folded or compact: ${hidden.join(',') || 'ok'}), no ⋯, no two items intersect (${inCz.overlaps.length}) — the bar wraps`, { hidden, overlaps: inCz.overlaps, fold: inCz.fold && inCz.fold.suspended });
        await P.evaluate('window.app._customize.exit()'); await sleep(300);
        const after = await record('customize-after-ja-1024-ui1.25-tb1.25');
        ok(after.fold && same([after.fold.overflow, after.fold.compact], [before.fold.overflow, before.fold.compact]), `Done folds again to the same verdict (${after.fold && after.fold.overflow.join(',')})`);
      }

      // ═══ ④ the arranged order ═══
      console.log('④ the arranged order: widgets moved in, Web view first, Terminal hidden');
      {
        await P.viewport(1024, 768); await P.load('en', 1.25); await P.setSidebar(true);
        await P.evaluate(`(() => { const s = window.app.settings; s.set('chrome.arrangement', { 'toolbar-center': ['layout-presets'], 'toolbar-right': ['taskbar-usage', 'taskbar-user-todos', 'btn-browser', 'btn-presets', 'btn-new-session', 'btn-terminal', 'btn-file-explorer', 'btn-desktop-apps', 'btn-desktop', 'desktop-previews'], 'toolbar-row2': [], 'taskbar-tray': ['taskbar-status'], 'taskbar-row2': [] }); s.set('toolbar.showTerminalButton', false); return 1; })()`);
        ok(!!await settingsLanded((js) => (js['chrome.arrangement'] || {})['toolbar-right']?.[0] === 'taskbar-usage' && js['toolbar.showTerminalButton'] === false), 'the arranged order + Terminal hidden reached the server');
        await P.settle();
        for (const tb of [1, 1.25]) {
          await P.setTb(tb);
          const m = await record(`arranged-en-1024-ui1.25-sbopen-tb${tb}`);
          const dom = await P.evaluate(`[...document.querySelectorAll('#toolbar .toolbar-left > *, #toolbar > [data-zone] > *')].map((el) => el.id || (el.classList.contains('toolbar-title') ? 'toolbar-title' : '')).filter(Boolean)`);
          const keys = m.fold.items.map((x) => x.key);
          const present = m.fold.items.filter((x) => x.px > 0).map((x) => x.key);
          const widgets = ['taskbar-usage', 'taskbar-user-todos', 'desktop-previews'].filter((id) => present.includes(id));
          ok(same(keys, dom) && !present.includes('btn-terminal') && !m.fold.overflow.includes('btn-terminal') && widgets.every((w) => !m.fold.overflow.includes(w) && !m.fold.compact.includes(w)) && keys.indexOf('btn-browser') < keys.indexOf('btn-new-session'), `toolbar scale ${tb}: the fold reads the ARRANGED order (${keys.filter((k) => k.startsWith('btn') || k.startsWith('task')).join(' → ')}), hidden Terminal never counts, the widgets (${widgets.join(', ')}) never fold (folded: ${m.fold.overflow.join(', ') || 'none'})`, { keys, dom, overflow: m.fold.overflow });
          if (m.fold.overflow.length) {
            await P.evaluate(`document.getElementById('toolbar-more').click()`); await sleep(150);
            const rows = await P.evaluate(`[...document.querySelectorAll('.toolbar-more-menu > .context-menu-item')].map((e) => (e.childNodes[0] && e.childNodes[0].nodeType === 3 ? e.childNodes[0].nodeValue : e.textContent).replace(' \\u25B8', '').trim())`);
            await P.evaluate(`document.querySelectorAll('.context-menu').forEach((x) => x.remove())`);
            const want = TM.overflowRows(m.fold.overflow).map((r) => r.submenu || r.label);
            ok(same(rows, want) && (!rows.includes('Web view') || !rows.includes('Presets') || rows.indexOf('Web view') < rows.indexOf('Presets')), `…the ⋯ rows follow the arrangement — Web view before Presets (${rows.join(' · ')})`, { rows, want });
          }
        }
        await P.setTb(1);
        await P.evaluate(`(() => { const s = window.app.settings; s.reset('chrome.arrangement'); s.set('toolbar.showTerminalButton', true); return 1; })()`);
        ok(!!await settingsLanded((js) => !js['chrome.arrangement'] && js['toolbar.showTerminalButton'] !== false), 'the arrangement + Terminal reset reached the server');
      }

      // ═══ ⑤ controls (box fonts only — the premise is the geometry, not the face) ═══
      if (!dejavu) {
        console.log('⑤ controls');
        await P.viewport(1024, 768); await P.load('ja', 1.25); await P.setSidebar(true);
        const neutral = writeCss('neutral', real);
        ok(await swap(P, neutral), 'the stylesheet swapped for an identical copy');
        const mN = await record('control-neutral-ja-1024-ui1.25-sbopen');
        ok(problemsOf(mN).length === 0 && foldProblems(mN).length === 0, 'CONTROL (a): the neutral swap stays green', [...problemsOf(mN), ...foldProblems(mN)]);
        // (b) THE PRE-FIX TOOLBAR: no fold + the old `.toolbar-right` rule, the lane's toolbar rules gone
        const tfSrc = fs.readFileSync(path.join(repo, 'src/lib/toolbar-fold.js'), 'utf8');
        const noop = tfSrc.replace('export function installToolbarFold(app) {', 'export function installToolbarFold(app) { return null;');
        ok(noop !== tfSrc, 'the control\'s anchor exists (installToolbarFold)');
        // the no-op copy in this run's scratch dir, its imports pointed at the WORKTREE's modules by plain path (esbuild
        // resolves paths, not file: URLs) — one registry, one app
        const noopFile = path.join(MUT.dir, `toolbar-fold-noop-${process.pid}.js`);
        fs.writeFileSync(noopFile, noop.replace(/(\bfrom\s*)(['"])\.\/([^'"]+)\2/g, (_, a, q, f) => a + JSON.stringify(path.join(wt, 'src/lib', f))));
        MUT.files.push(noopFile);
        await bundle(noopFile);
        const LANE_START = real.indexOf('/* lane toolbar-fold (2026-09-30');
        const LANE_END = real.indexOf('body.customize-mode #toolbar > .toolbar-center { flex-wrap: wrap; row-gap: 4px; }');
        ok(LANE_START > 0 && LANE_END > LANE_START, 'the lane\'s toolbar rules are one block in style.css (the control removes it)');
        const PRE_RULES = `.toolbar-left { display: flex; align-items: center; gap: 6px; min-width: 160px; }\n.toolbar-center { flex: 1; display: flex; justify-content: center; }\n.toolbar-right { display: flex; align-items: center; gap: 4px; min-width: 160px; justify-content: flex-end; }\n.toolbar-title {\n  font-weight: 600; font-size: 13px;\n  background: linear-gradient(135deg, var(--accent), var(--accent-hover));\n  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;\n}\n`;
        const pre = writeCss('prefix', real.slice(0, LANE_START) + PRE_RULES + real.slice(LANE_END + 'body.customize-mode #toolbar > .toolbar-center { flex-wrap: wrap; row-gap: 4px; }'.length));
        await P.load('ja', 1.25); await P.setSidebar(true);
        ok(await swap(P, pre), 'the pre-fix stylesheet swapped in');
        await P.frames();
        const mP = await P.evaluate(`(${MEASURE.toString()})()`);
        await P.shot(path.join(SHOTS, 'control-prefix-ja-1024-ui1.25-sbopen.png'), 150);
        const pp = problemsOf(mP);
        ok(!mP.fold && mP.overlaps.length >= 2 && mP.underSidebar.length >= 1, `CONTROL (b): the PRE-FIX toolbar at the audit's worst state goes RED — ${mP.overlaps.length} overlapping pairs, under the sidebar: ${mP.underSidebar.join(', ')} (the owner's picture)`, pp.slice(0, 6));
        await bundle(null); // back to the real bundle (legs after this reload it)
      }
    } finally {
      try { P.chrome.kill('SIGKILL'); } catch { }
    }
  }
  FACE = '';
  for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 1 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
})();

FACE = '';
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
process.exit(fail ? 1 : 0);
