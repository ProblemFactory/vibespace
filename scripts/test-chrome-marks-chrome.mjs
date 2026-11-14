#!/usr/bin/env node
// A MARK IN THE CHROME IS ONE LINE AND NEVER NARROWER THAN ITS WORDS AND ITS ICON (hotfix 2.369.401 — the owner's screen right
// after the update to 2.369.400, zh, the vault locked: the lock chip «保险库已锁定» in the toolbar's second row drawn ONE
// CHARACTER PER LINE, six lines, its lock icon squeezed to a dot). HEAVY (a worktree hub + headless Chrome, the built bundle).
// The REAL page: a scratch hub with a sign-in password, the vault set up and LOCKED by a restart, the owner's shape of the chrome
// (chrome.arrangement + chrome.springs: For-you, the usage rings and the desktops in the toolbar's second row between two FIXED
// springs, 222 px and 366 px), four desktops with CJK names, a usage reading whose model cap carries the 47 h age badge.
//   A  THE OWNER'S ROW — en, zh, ja × every width from 769 px (at 768 and below the phone layout hides the row) to 1600 px:
//      the chip is ONE line, its icon whole, and it is as wide as its words and its icon (its own max-content box); the row is
//      one row high. Pictures: zh at 1000 and 769, en and ja at 1000.
//   B  EVERY ZONE the chrome can seat it (For-you moved there — the chip follows it), crowded by a fixed spring wider than the
//      window: the row's own rule gives first (the springs), the chip keeps its words and its icon.
//   C  THE CENSUS — every element the chrome can place (customize-mode's CHROME_ELEMENTS) and every mark seated beside one
//      (the lock chip; the warmth summary when drawn), all in ONE over-full row, in zh: each is measured against its own box
//      with room (flex none, max-content) — one line high, not narrower. A mark that must give (no spring left) gives its
//      WORDS and keeps its icon and its title; what else gives is printed by name.
// Faces: this box's and the hosted runner's (DejaVu first — the FONTCONFIG_FILE of SharedContext/vibespace-actions-runner-repro.md).
// Env: CHROME_MARKS_PNG=<dir> (pictures kept), CHROME_MARKS_FACES=box,runner. SKIPs without chrome.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv();
const FACES = (process.env.CHROME_MARKS_FACES || 'box,runner').split(',').filter(Boolean);
const [PORT, ...CDP_PORTS] = await freePorts(1 + FACES.length);
const wt = scratch('chrome-marks-wt'), FIXTURE = scratch('chrome-marks-canonical');
const PNG = process.env.CHROME_MARKS_PNG ? path.resolve(process.env.CHROME_MARKS_PNG) : scratch('chrome-marks-shots');
fs.mkdirSync(FIXTURE, { recursive: true }); fs.mkdirSync(PNG, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIGN_IN = 'chrome-marks-sign-in-7', SECOND = 'chrome marks second password';
// the owner's shape of the chrome (the arrangement and the two fixed springs), as the setting holds it
const OWNER_ARRANGEMENT = { 'toolbar-center': ['taskbar-status', 'spring-2', 'layout-presets', 'spring-6'], 'toolbar-right': ['btn-presets', 'btn-new-session', 'btn-terminal', 'btn-file-explorer', 'btn-browser', 'btn-desktop'], 'toolbar-row2': ['spring-3', 'spring-1', 'taskbar-user-todos', 'taskbar-usage', 'desktop-previews', 'spring-5', 'spring-4'], 'taskbar-tray': [], 'taskbar-row2': [] };
const OWNER_SPRINGS = { 'spring-3': { mode: 'fixed', px: 222 }, 'spring-4': { mode: 'fixed', px: 366 } };
const WIDTHS = [769, 800, 900, 1000, 1100, 1200, 1400, 1600];
const LANGS = ['zh', 'en', 'ja'];

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const DATA = path.join(wt, 'data'); fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(path.join(DATA, 'settings.json'), JSON.stringify({ 'chrome.arrangement': OWNER_ARRANGEMENT, 'chrome.springs': OWNER_SPRINGS, 'desktop.dynamicEnabled': true }, null, 2));
let srv = null;
const srvLog = fs.openSync(path.join(PNG, 'server.log'), 'a');
const startServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: SIGN_IN, VIBESPACE_CHANGELOG_FIXTURE_DIR: FIXTURE }, stdio: ['ignore', srvLog, srvLog] }); };
const stopServer = async () => { const p = srv; srv = null; if (!p) return; p.kill('SIGTERM'); await new Promise((r) => { const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { } r(); }, 8000); if (p.exitCode != null) { clearTimeout(t); r(); } else p.once('exit', () => { clearTimeout(t); r(); }); }); };
const ready = async (ms = 60000) => { const t0 = Date.now(); for (;;) { try { const r = await fetch(`http://127.0.0.1:${PORT}/login`); if (r.status === 200) return true; } catch { } if (Date.now() - t0 > ms) return false; await sleep(300); } };
const chromes = [];
const cleanup = () => {
  for (const c of chromes) { try { c.kill('SIGKILL'); } catch { } }
  try { srv && srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  try { fs.rmSync(FIXTURE, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const WebSocket = require('ws');
const URL = `http://127.0.0.1:${PORT}/`;

async function launch(face, cdpPort) {
  const prof = scratch('chrome-marks-' + face);
  const env = { ...process.env }; delete env.DBUS_SESSION_BUS_ADDRESS;
  if (face === 'runner') {   // the hosted runner's face: dejavu + liberation + opentype/noto (+ emoji) — runner-repro's FONTCONFIG_FILE
    const emoji = path.join(prof, 'emoji'); fs.mkdirSync(emoji, { recursive: true }); try { fs.symlinkSync('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', path.join(emoji, 'NotoColorEmoji.ttf')); } catch { }
    const fc = path.join(prof, 'fonts.conf'); fs.writeFileSync(fc, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/usr/share/fonts/truetype/dejavu</dir><dir>/usr/share/fonts/truetype/liberation</dir><dir>/usr/share/fonts/opentype/noto</dir><dir>${emoji}</dir><cachedir>${path.join(prof, 'fc')}</cachedir><include ignore_missing="yes">/etc/fonts/conf.d</include></fontconfig>`);
    env.FONTCONFIG_FILE = fc;
  }
  const c = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--password-store=basic',
    '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${path.join(prof, 'p')}`, 'about:blank'], { stdio: 'ignore', env });
  chromes.push(c);
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
  if (!target) throw new Error(`chrome (${face}) never exposed a page`);
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map(), pageErrors = [];
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').split('\n')[0]); });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
  const until = async (expr, { timeout = 15000, step = 100 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await ev(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vs-vault-later', String(Date.now() + 864e5)); } catch {}" });   // the load-time ask set aside: the chip, the strip and the row as the person sees them after «稍后»
  const view = (width, height = 720) => cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false });
  await view(1280);
  const shot = async (name, clip) => { const r = await cdp('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 2 } } : {}) }); fs.writeFileSync(path.join(PNG, name), Buffer.from(r.data, 'base64')); };
  return { face, cdp, ev, until, view, shot, pageErrors, close: () => ws.close() };
}

// ── in-page measures: an element's box as drawn, against its own box WITH ROOM (flex none, max-content — measured in place)
const MEASURE_LIB = `window.__marks = (() => {
  const R = (e) => e.getBoundingClientRect();
  // its LINES: the text's own boxes (each text node's client rects), grouped by vertical overlap — a wrapped word starts a new group
  const lines = (e) => { if (!e) return 0; const rs = []; const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (r.width > 0.5 && r.height > 0.5) rs.push([r.top, r.bottom]); }
    rs.sort((a, b) => a[0] - b[0]); const groups = []; for (const [t, b] of rs) { const g = groups.find((x) => (t + b) / 2 >= x[0] && (t + b) / 2 <= x[1]); if (g) { g[0] = Math.min(g[0], t); g[1] = Math.max(g[1], b); } else groups.push([t, b]); } return groups.length; };
  const natural = (e) => { const s = e.getAttribute('style'); e.style.flex = 'none'; e.style.width = 'max-content'; e.style.maxWidth = 'none'; e.style.minWidth = 'max-content';
    const r = R(e), svg = e.querySelector('svg'), sr = svg ? R(svg) : null, out = { w: r.width, h: r.height, lines: lines(e), svgW: sr ? sr.width : null, svgH: sr ? sr.height : null };
    if (s == null) e.removeAttribute('style'); else e.setAttribute('style', s); return out; };
  const box = (e) => { const r = R(e), svg = e.querySelector('svg'), sr = svg ? R(svg) : null; return { w: r.width, h: r.height, lines: lines(e), svgW: sr ? sr.width : null, svgH: sr ? sr.height : null, x: r.left, right: r.right, top: r.top }; };
  const one = (e) => { if (!e || !e.isConnected) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return { id: e.id, hidden: true };
    const b = box(e), n = natural(e), lab = e.querySelector('.vault-chip-label');
    const labCs = lab ? getComputedStyle(lab) : null;
    return { id: e.id, zone: e.parentElement && e.parentElement.dataset.zone, text: (e.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 40), ...b, nat: n,
      narrower: Math.round((n.w - b.w) * 10) / 10, taller: Math.round((b.h - n.h) * 10) / 10, iconSquashed: n.svgW ? Math.round((n.svgW - b.svgW) * 10) / 10 : 0,
      title: e.title || '', label: lab ? { lines: lines(lab), shown: labCs.display !== 'none' && R(lab).width > 1, clipped: lab.scrollWidth > lab.clientWidth + 0.5 } : null };
  };
  const springs = (zone) => [...document.querySelectorAll('[data-zone="' + zone + '"] > .chrome-spring')].map((s) => Math.round(R(s).width * 10) / 10);
  const row = (zone) => { const z = document.querySelector('[data-zone="' + zone + '"]'); if (!z) return null; const r = R(z); return { h: Math.round(r.height * 10) / 10, w: Math.round(r.width * 10) / 10, over: Math.round((z.scrollWidth - z.clientWidth) * 10) / 10 }; };
  return { one, springs, row };
})(); true`;
const CHIP = `(() => { const c = document.getElementById('taskbar-vault'); return c ? window.__marks.one(c) : null; })()`;
// the K3 age badge in the owner's row (the usage rings sit there): one line, off its ring's label, inside the row's box
const BADGE = `(() => { const b = document.querySelector('#toolbar-row2 .usage-age-badge'); if (!b) return null; const R = (e) => e.getBoundingClientRect(); const rb = R(b), lab = b.parentElement.querySelector('.usage-donut-label'), rl = lab ? R(lab) : null, row = R(document.getElementById('toolbar-row2'));
  const cs = getComputedStyle(b), lh = parseFloat(cs.lineHeight) || 10, bt = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const over = rl ? Math.max(0, Math.min(rb.right, rl.right) - Math.max(rb.left, rl.left)) * Math.max(0, Math.min(rb.bottom, rl.bottom) - Math.max(rb.top, rl.top)) : -1;
  return { text: b.textContent, lines: Math.round((rb.height - bt) / lh), overLabel: Math.round(over), inRow: rb.top >= row.top - 0.5 && rb.bottom <= row.bottom + 0.5 }; })()`;
const badgeFine = (b) => !b || (b.lines === 1 && b.overLabel === 0);
// a chip is FINE: one line, its icon whole, its own width (or — no spring left in its row — its words given, icon and title kept)
const chipFine = (c, springsLeft = 1) => !!c && !c.hidden && c.lines <= 1 && c.nat.lines <= 1 && c.taller <= 0.5 && c.iconSquashed <= 0.5 && (c.narrower <= 0.5 || (springsLeft === 0 && !!c.title && c.label && c.label.lines <= 1));
const chipSays = (c) => (c ? `«${c.text}» ${c.lines} line(s), ${Math.round(c.w)}/${Math.round(c.nat.w)} px wide, ${Math.round(c.h)}/${Math.round(c.nat.h)} px high, icon ${c.svgW == null ? '-' : Math.round(c.svgW * 10) / 10}/${c.nat.svgW == null ? '-' : Math.round(c.nat.svgW * 10) / 10} px` : 'no chip');

// the usage reading the owner's row carries (the model cap read 47 h before its siblings — the K3 badge) + four desktops
const SEED_JS = `(async () => { const app = window.app; if (!app) return 'no app';
  const now = Date.now(), H = 3600e3, D = 24 * H, nowS = Math.floor(now / 1000);
  const u = { fetchedAt: now - 60e3, fiveHourAbsent: now - 6 * D, sevenDay: { utilization: 0.37, resetsAt: nowS + 3 * 86400 }, scopedWeekly: [{ name: 'Fable', utilization: 0.42, resetsAt: nowS + 2 * 86400 }], scopedFetchedAt: now - 47 * H - 5 * 60e3 };
  app._accounts = { accounts: [{ id: 'sub-a', backend: 'claude', type: 'subscription', name: 'Work Max' }], defaultAccountId: 'sub-a' };
  app._accountUsage = { 'sub-a': u }; app._codexAccountUsage = app._codexAccountUsage || {}; app._usageEstimates = app._usageEstimates || {};
  try { app._renderUsage(); } catch (e) { return 'usage: ' + e.message; }
  const dm = app.desktopManager; if (dm && typeof dm.createDesktop === 'function') { const want = ['桌面一·长名字', '三', '第四个']; const have = (dm.desktops || dm._desktops || []).length || 1; for (let i = have; i < 4; i++) { try { dm.createDesktop(want[i - 1] || ('桌面' + i)); } catch { } } }
  return 'ok'; })()`;

async function arrange(P, arr, springs) {
  await P.ev(`(async () => { const s = window.app.settings; await s.set('chrome.springs', ${JSON.stringify(springs)}); await s.set('chrome.arrangement', ${JSON.stringify(arr)}); return true; })()`);
  await sleep(400);
}

try {
  startServer();
  check('the hub boots (sign-in password on)', await ready());
  const P0 = await launch(FACES[0], CDP_PORTS[0]);
  await P0.cdp('Page.navigate', { url: URL + 'login' });
  await P0.until(`document.readyState === 'complete'`);
  const login = await P0.ev(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SIGN_IN)} }) }).then((r) => r.status)`);
  check('signed in through /api/login', login === 200, login);
  await P0.cdp('Page.navigate', { url: URL });
  check('the app loads', !!(await P0.until(`!!(window.app && document.getElementById('toolbar-row2'))`, { timeout: 30000 })));
  const setup = await P0.ev(`fetch('/api/vault/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(SECOND)} }) }).then((r) => r.status)`);
  check('the vault is set up (a second password)', setup === 200, setup);
  await stopServer(); startServer();
  check('the hub is back — the vault LOCKED (no auto-unlock)', await ready());
  const cookies = (await P0.cdp('Network.getAllCookies').catch(() => ({ cookies: [] }))).cookies || [];

  const pages = [P0];
  for (let i = 1; i < FACES.length; i++) {
    const P = await launch(FACES[i], CDP_PORTS[i]);
    await P.cdp('Network.enable'); if (cookies.length) await P.cdp('Network.setCookies', { cookies: cookies.map(({ name, value, domain, path: p, httpOnly, secure, sameSite, expires }) => ({ name, value, domain, path: p, httpOnly, secure, sameSite, expires })) });
    pages.push(P);
  }
  const results = { A: {}, B: {}, C: {} };
  for (const P of pages) {
    for (const lang of LANGS) {
      await P.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
      await P.view(1280);
      await P.cdp('Page.navigate', { url: URL });
      const up = await P.until(`!!(window.app && document.getElementById('taskbar-vault') && !document.getElementById('loading-screen'))`, { timeout: 40000 });
      if (!up) { check(`${P.face} ${lang}: the page shows the lock chip`, false, await P.ev(`({ app: !!window.app, chip: !!document.getElementById('taskbar-vault'), lang: localStorage.getItem('vibespace.lang') })`).catch((e) => e.message)); continue; }
      await P.ev(`document.getElementById('vault-unlock-dialog')?.querySelector('.vault-later')?.click(); true`);
      await P.ev(MEASURE_LIB);
      const seeded = await P.ev(SEED_JS);
      await arrange(P, OWNER_ARRANGEMENT, OWNER_SPRINGS);
      // ── A: the owner's row, every width
      const A = [];
      for (const w of WIDTHS) {
        await P.view(w); await sleep(250);
        const c = await P.ev(CHIP), row = await P.ev(`window.__marks.row('toolbar-row2')`), sp = await P.ev(`window.__marks.springs('toolbar-row2')`), badge = await P.ev(BADGE);
        A.push({ w, chip: c, row, springs: sp, badge });
        if ((lang === 'zh' && (w === 1000 || w === 769)) || (lang !== 'zh' && w === 1000)) {
          const clip = await P.ev(`(() => { const t = document.getElementById('toolbar').getBoundingClientRect(), r = document.getElementById('toolbar-row2').getBoundingClientRect(); return { x: 0, y: Math.max(0, t.top), width: ${w}, height: Math.min(400, r.bottom - Math.max(0, t.top) + 6) }; })()`);
          await P.shot(`${P.face}-A-${lang}-${w}.png`, clip);
        }
      }
      results.A[`${P.face}/${lang}`] = A;
      const bad = A.filter((x) => !chipFine(x.chip, x.springs.some((s) => s > 0.5) ? 1 : 0) || (x.row && x.row.h > 40) || !badgeFine(x.badge));
      check(`A ${P.face} ${lang} (seed ${seeded}): the owner's row at ${WIDTHS.join(' / ')} px — the lock chip one line, its icon whole, as wide as its words; the row one row high (≤ 40 px); the usage ring's age badge one line, off its label`,
        bad.length === 0, bad.map((x) => `${x.w} px: ${chipSays(x.chip)}; row ${x.row && x.row.h} px high; springs ${x.springs.join(' ')}; badge ${x.badge ? `«${x.badge.text}» ${x.badge.lines} line(s), ${x.badge.overLabel} px² over its label, in the row ${x.badge.inRow}` : 'none'}`).join(' · '));
      // ── B: every zone — For-you (the chip beside it) crowded by a fixed spring wider than the window
      if (lang === 'zh' || P.face === 'box') {
        const B = [];
        for (const zone of ['toolbar-center', 'toolbar-right', 'toolbar-row2', 'taskbar-tray', 'taskbar-row2']) {
          const arr = JSON.parse(JSON.stringify(OWNER_ARRANGEMENT)); for (const z of Object.keys(arr)) arr[z] = arr[z].filter((id) => id !== 'taskbar-user-todos' && id !== 'spring-90');
          arr[zone] = ['spring-90', ...(arr[zone] || []), 'taskbar-user-todos'];
          await arrange(P, arr, { ...OWNER_SPRINGS, 'spring-90': { mode: 'fixed', px: 3000 } });
          for (const w of [769, 1000]) { await P.view(w); await sleep(250); const c = await P.ev(CHIP), sp = await P.ev(`window.__marks.springs(${JSON.stringify(zone)})`); B.push({ zone, w, chip: c, springs: sp }); }
        }
        await arrange(P, OWNER_ARRANGEMENT, OWNER_SPRINGS);
        results.B[`${P.face}/${lang}`] = B;
        const badB = B.filter((x) => !chipFine(x.chip, x.springs.some((s) => s > 0.5) ? 1 : 0));
        check(`B ${P.face} ${lang}: in every zone (toolbar-center / -right / -row2, taskbar-tray / -row2) crowded by a 3000 px fixed spring at 769 and 1000 px, the chip keeps one line, its icon and its words — the spring gives`,
          badB.length === 0, badB.map((x) => `${x.zone} @${x.w}: ${chipSays(x.chip)}; springs ${x.springs.join(' ')}`).join(' · '));
      }
      // ── C: the census — every placeable element + the marks beside For-you in ONE over-full row (zh)
      if (lang === 'zh') {
        const all = ['spring-91', 'layout-presets', 'btn-presets', 'btn-new-session', 'btn-terminal', 'btn-file-explorer', 'btn-browser', 'btn-desktop-apps', 'btn-desktop', 'desktop-previews', 'taskbar-user-todos', 'taskbar-usage', 'taskbar-status', 'spring-92'];
        const arr = { 'toolbar-center': [], 'toolbar-right': [], 'toolbar-row2': all, 'taskbar-tray': [], 'taskbar-row2': [] };
        await arrange(P, arr, { 'spring-91': { mode: 'fixed', px: 600 }, 'spring-92': { mode: 'fixed', px: 600 } });
        const C = [];
        for (const w of [769, 1000]) {
          await P.view(w); await sleep(300);
          const els = await P.ev(`[...document.querySelectorAll('[data-zone="toolbar-row2"] > :not(.chrome-spring)')].map((e) => window.__marks.one(e))`);
          const sp = await P.ev(`window.__marks.springs('toolbar-row2')`), row = await P.ev(`window.__marks.row('toolbar-row2')`);
          C.push({ w, els, springs: sp, row });
          await P.shot(`${P.face}-C-census-${w}.png`, await P.ev(`(() => { const r = document.getElementById('toolbar-row2').getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 4), width: ${w}, height: Math.min(300, r.height + 8) }; })()`));
        }
        await arrange(P, OWNER_ARRANGEMENT, OWNER_SPRINGS);
        results.C[P.face] = C;
        for (const x of C) {
          const left = x.springs.some((s) => s > 0.5) ? 1 : 0;
          const gave = x.els.filter((e) => e && !e.hidden && (e.taller > 0.5 || e.lines > e.nat.lines || e.iconSquashed > 0.5 || e.narrower > 0.5));
          const wrong = gave.filter((e) => !(e.id === 'taskbar-vault' && chipFine(e, left)));
          check(`C ${P.face} zh @${x.w} px: the census — ${x.els.filter((e) => e && !e.hidden).length} elements in one over-full row (springs ${x.springs.join(' / ')}; row ${x.row.h} px high, ${x.row.over} px past its end): none taller than its own one-line box, none narrower than its content, no icon squashed${gave.length ? ' (gave: ' + gave.map((e) => e.id).join(', ') + ')' : ''}`,
            wrong.length === 0 && x.row.h <= 40, wrong.map((e) => `${e.id} «${e.text}» ${Math.round(e.w)}/${Math.round(e.nat.w)} w, ${Math.round(e.h)}/${Math.round(e.nat.h)} h, ${e.lines} line(s), icon −${e.iconSquashed}`).join(' · '));
        }
      }
    }
    check(`${P.face}: no page exception`, P.pageErrors.length === 0, P.pageErrors.slice(0, 5));
  }
  fs.writeFileSync(path.join(PNG, 'marks.json'), JSON.stringify(results, null, 1));
} catch (e) { failed++; console.error('  ✗ ' + ((e && e.stack) || e)); }
finally { for (const c of chromes) { try { c.kill('SIGKILL'); } catch { } } await stopServer().catch(() => {}); }
console.log(`PNGs + marks.json: ${PNG}`);
console.log(`\ntest-chrome-marks-chrome: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
