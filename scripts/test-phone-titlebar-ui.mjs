#!/usr/bin/env node
// THE TITLE OWNS THE PHONE'S BAR — the chrome gate (lane phone-titlebar-title, heavy). The owner 2026-11-06, a phone at ~360 CSS px (zh):
// 「手机端的标题栏被挤压得根本看不到聊天标题了」 — ☰ · 📁 · a desktops chip «2» · the usage ring «37» · the For-you chip's FIVE badges · ⚙ ·
// ✕ · + left the conversation's title «游…»; minutes after: 「最左边那个文件浏览器的图标也很容易误认为是当前窗口的图标…应该放进 + 菜单里」.
// Scene: a worktree server of the WORKING tree (esbuild bundle), its For-you store seeded through the real UserTodoManager — 1 urgent ·
// 2 high · 8 normal with option chips (bands 1–4) · 20 plain asks (the quiet count) · 37 notices = the owner's five badges; two
// desktops (the desktops chip's «2»); the usage ring drawn by its own markup at 37 (a scratch hub holds no quota reading — the poll's
// chip line is the stand-in, said here); a files window titled as the owner's conversation. Headless chrome over raw CDP (a dead
// proxy, no DNS), a touch phone (coarse pointer, dsf 2):
//   ① THE OWNER'S BAR — a 12-character zh title, five badges, at 360 and 320 px, zh and en: the title's box ≥ its readable minimum
//      (the first 6 CJK / 12 Latin characters + «…», measured in the title's own font — this suite's own rule, never the product's
//      helper), the badges ONE (the honest count in the worst urgency's colour), the desktops chip · the ring · ⚙ folded into ONE
//      «⋯»; ☰ · For you · ✕ · + standing; every control ≥ 44×44; no folder icon on the bar
//   ② THE ⋯ — its rows are the folded chips in the bar's order with their live values in the chip's own words («桌面 2/3 · 工作» with
//      THREE desktops, the second active (r3 — the chip's badge is the PLACE; r2's bare «2» read as a count), «用量 37 %», «设置»),
//      each ≥ 44 px tall in ≥ 16 px words; the ring moves to 52 while the menu is open ⇒ its row says 52 % AND its ring glyph draws 52
//      (r2); the Desktops row opens the desktops sheet; a For-you arrival re-decides the bar (the badge's number follows, still one)
//   ⑥ THE ⋯'S PRESSES (r2) — a finger and a MOUSE (the compact class under 769 px with a fine pointer): ⋯ opens, a second press
//      closes, a third opens; ⋯ → Settings → ⋯ → Settings ⇒ Settings open, on top, once (its popover keyed to ⚙, never to the ⋯)
//   ⑦ THE SLACK IS THE TITLE'S (r2) — titles found in THIS render whose natural width is 0…0.5 px over the room ⚙ leaves (the r1
//      acceptance cut «NotesDtek…» there): ⚙ folds and the title is WHOLE (its width ≤ its box, exactly); a title just under it: ⚙ stands
//   ⑧ THE COUNT'S GIVE-BACK (r2) — the vault LOCKED by the road another client's lock takes (a `vault-state` broadcast through the
//      page's own socket handler — the scratch hub has no vault: the real chip, ⚙'s mark and the strip are drawn) makes four foldable
//      chips: at 600 px with a 2-character title all four stand, no ⋯ (never ONE chip alone in it); the owner's title: two in the ⋯;
//      at 360 px the lock folds after the badges, its ⋯ row «Vault locked» 44 px / 16 px
//   ⑨ THE LOCK STAYS LOUD (r3 F1) — locked, 360 px, the owner's title (⚙ folded): the ⋯ wears ⚙'s red lock (its mark, the red, «More
//      — Vault locked»), its Settings row the mark and the red; ⚙ standing (a short title): the ⋯ plain, ⚙ wears it; an unlock's
//      broadcast while the menu is open ⇒ the mark leaves the ⋯ and the row, the «Vault locked» row leaves — CONTROL: r2's ⚙ row
//      (the chip's FIRST svg, the plain cog) judged by the same predicate is RED. r4 G2: the mark measured — the row's lock the bar's
//      size (11 × 13.3), on its glyph's corner on the ⋯, on ⚙ and in the row, inside the bar; the rows' labels at ONE x — CONTROLS:
//      r3's rules put back on the page (the host's em, the box's corner, no glyph column) RED, each
//   ⑨b ONE PLACE UNDER THE BAR (r4 G4) — the «+» sheet, the ⋯ menu, the Desktops sheet and the Usage popup (from the ⋯'s rows), the
//      Settings popover: each opened LOCKED at 360 px under the moved bar, then an unlock and a re-lock while open — it follows —
//      CONTROL: r3's rules (the Desktops sheet's .mobile-sheet and the Usage popup at 48 !important) put back: both over the bar, RED
//   ⑩ A PRESS ENDS ON ITS ROW (r3 F2) — CDP touch AND mouse: a press down on «Settings», another client's lock inserts «Vault locked»
//      above it / an unlock removes it / the ring's return inserts «Usage» above it, the lift ⇒ Settings ran (never the row that moved
//      under); the menu PATCHED by key: the same node, the staying rows the same nodes, its listeners flat over six changes (CDP
//      DOMDebugger) — CONTROL: r2's road put back on the page (the fit RE-OPENS the menu, no hold) ⇒ the same lift runs the «Usage» row
//      that moved under the finger. A phone sheet opens under the bar as it stands (⑨: the lock's strip moves the bar down). r4 G3:
//      a MOUSE pressed on «Settings» and released OFF the menu ends the hold at that lift (a lock after it: the row appears, the menu
//      follows) — CONTROL: r3's menu-only lift (the document never hears it) RED; a touchcancel ends it; a finger on the ⋯ while
//      another client's rename empties the fold (440 px): the lift is the ⋯'s — never ⚙ slid under it — CONTROL: r3's unheld fit RED
//   ③ THE SHAPES — a 2-character title (430 px: nothing folds; 360 px: the whole title, the doors standing), a 40-character Latin
//      title (≥ 12 characters read), one word (the whole word), no badges (no badge drawn)
//   ⑨c ONE ROOM UNDER THE BAR (r5 K1 / K2) — every surface (the «+» sheet, the ⋯ menu, the Desktops sheet, the Usage popup, the
//      Settings popover, the mini inbox's rule, the bar's own title switcher) with TALL content (40 rows of 44 px) at 360 px: its bottom
//      ≤ the screen − 12 px and its last row reached by its own scroll — locked → unlocked → re-locked AND unlocked → locked → unlocked,
//      in en and in ja (the lock strip on three lines); the switcher FLUSH under the bar, following; the Usage popup from the ⋯ row:
//      its inline room from the bar, never its folded chip's zero rect — CONTROLS: r4's rooms (the screen − 60 px) put back on the
//      page's rules RED by name; r4's switcher (no rule — placed once) RED
//   ④ THE + ROAD (LAW 3) — a real long-press on «+»: the sheet lists Files; its row opens the explorer; a second time its hint names
//      its FOLDER («Back to ~» — r4 G1: the explorer's breadcrumb, never its path) and the row reveals it (never a second one). G1: a
//      43-character path at 360 / 320 px in zh / en / ja — the folder WHOLE where the hint renders (each character inside its box), the
//      sentence's words whole; a 72-character name cut at its START — CONTROL: r3's hint (the front-cut window title, its end cut by the
//      line) on the same row RED; two explorers ⇒ the one shown last; the only one on another desktop / minimized / a tab group's
//      hidden guest ⇒ named, and a real tap brings it. r5 K3: a 63-character Arabic and a 57-character Hebrew folder at 320 ja and
//      360 en — cut where it BEGINS in reading order (its first character outside the box, its last 12 inside) — CONTROL: r4's box
//      (an rtl box over every name: the END cut) RED
//   ⑤ THE TIERS — a rotation to landscape (the regular class): no fold, no ⋯, the five badges back; portrait again: folded again; a
//      tablet in portrait (the regular class, 700 px): its column bar keeps 文件, no fold; a desktop page (1280, a mouse): no ⋯ built,
//      the nav hidden — the desktop chrome's markup hash is printed (the report compares it with the base's)
//   ⑪ «+» IS THE CREATE MENU (r6 L1) — 360 px compact, a web view open, the attention list EMPTY (no For-you page, so no 文件 card):
//      from EVERY drawn door of the bar (a real touch tap each, never a long press) the roads to Files in two taps — «+» → its Files
//      row; New session two taps (the sheet's first row, accented); a second tap on «+» closes the sheet, a long press opens the same
//      one — CONTROL: r5's tap (the New Session dialog; the sheet on a long press only) put back: no road from any door, RED by name
//   ⑪b «+» NAMES ITS MENU (r7 W1) — its drawn title and aria-label in zh / ja / en are the menu's words («新建或打开…» / «作成または開く…» /
//      «Create or open…»), aria-haspopup «menu» — r6's «New session» RED by name on its copy
//   ⑫ THE REGULAR CLASS UNDER ITS OWN RULES (r6 L2) — compact LOCKED (the variable under the strip), a rotation to a Duo's landscape
//      (951×585, the bar a column): the variable leaves <html>; the Settings popover, the Usage popup, the mini inbox's rule at the
//      stylesheet's 48, the For-you tray at its column's top, inside the screen; the Duo's portrait the same — CONTROL: _publishUnder
//      with its compact term dropped: those three at the screen + 4, off it, RED by name
// Screenshots go to $PTT_SHOTS_DIR when set; Chrome's profile under $PTT_PROFILE_DIR when set (else the scratch root); PTT_ONLY=r6 runs
// ⑪ ⑫ ⑪b alone (the attention list emptied first) — the RED-by-name run on an older tree. SKIPs without chrome. Free ports, scratch dirs only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('phone-titlebar-ui');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const SHOTS = process.env.PTT_SHOTS_DIR ? path.resolve(process.env.PTT_SHOTS_DIR) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const PROFILE = process.env.PTT_PROFILE_DIR ? path.resolve(process.env.PTT_PROFILE_DIR, 'chrome-' + process.pid) : path.join(ROOT, 'chrome');
const procs = new Set(); const worktrees = new Set(); let fakeHome = null, hintDir = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  if (fakeHome) { try { endRootedProcesses(fakeHome); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
  if (hintDir) { try { fs.rmSync(hintDir, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

// THE JUDGE'S OWN READABLE MINIMUM (the brief's words): the first 6 CJK / 12 Latin characters (a wide character counts two), then «…»
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60]/u;
const minText = (s) => { const c = Array.from(String(s).replace(/\s+/g, ' ').trim()); let u = 0, k = 0; for (; k < c.length; k++) { const w = WIDE.test(c[k]) ? 2 : 1; if (u + w > 12) break; u += w; } return k >= c.length ? c.join('') : c.slice(0, Math.max(1, k)).join('').trimEnd() + '…'; };
const OWNER = '游戏关卡与数值平衡讨论稿'; // 12 CJK characters — the owner's kind of conversation name
const LATIN40 = 'Quarterly planning notes for the fleet ops'; // 42 characters
const NAV = ['mobile-nav-menu', 'mobile-nav-files', 'mobile-nav-desktops', 'mobile-nav-usage', 'mobile-nav-vault', 'mobile-nav-todos', 'mobile-nav-gear', 'mobile-nav-overflow', 'mobile-nav-close', 'mobile-nav-new'];

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else await (async () => {
  fakeHome = scratchHome('phone-titlebar-ui-home', fs);
  const wt = path.join(ROOT, 'wt');
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  // the WORKING tree is what is judged (a pre-commit run tests what is about to ship)
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const esbuild = require(path.join(repo, 'node_modules', 'esbuild'));
  await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent' });
  // THE OWNER'S FIVE BADGES through the real store (its own item shape, its own caps)
  {
    const { UserTodoManager } = require(path.join(wt, 'src/user-todos.js'));
    const m = new UserTodoManager({ dataDir: path.join(wt, 'data'), expirySweepMs: 0 });
    let n = 0; const add = (o) => m.add('local:ptt-' + (n++ % 12), { by: 'agent', origin: 'agent', ...o });
    add({ text: 'Approve the release?', urgency: 'urgent' });
    for (let i = 0; i < 2; i++) add({ text: 'Pick a plan ' + i, urgency: 'high', options: ['A', 'B'] });
    for (let i = 0; i < 8; i++) add({ text: 'Choose a name ' + i, urgency: 'normal', options: ['Yes', 'No'] });
    for (let i = 0; i < 20; i++) add({ text: 'A plain question ' + i, urgency: 'normal' });
    for (let i = 0; i < 37; i++) add({ text: 'Spend notice ' + i, urgency: 'low', kind: 'notice', origin: 'spend' });
    m.flush(); m.stop();
  }
  const env = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
  if (!ok(await until(() => journal.includes('Ready.'), 40000), 'the worktree server booted', journal.slice(-800))) return;

  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--proxy-server=http://127.0.0.1:9', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', `--user-data-dir=${PROFILE}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  procs.add(chrome);
  let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target')) return;
  const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, e) => { sock.on('open', r); sock.on('error', e); });
  let seq = 0; const pend = new Map(); const pageErrors = [];
  sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text); });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); sock.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => {
    const r = (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result || {};
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result?.value;
  };
  const waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(120); } try { return !!(await evalJs(expr)); } catch { return false; } };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
  const device = async (w, h, { mouse = false } = {}) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mouse ? 1 : 2, mobile: !mouse, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: !mouse, maxTouchPoints: mouse ? 1 : 5 });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: mouse ? 'hover' : 'none' }, { name: 'pointer', value: mouse ? 'fine' : 'coarse' }] });
  };
  const load = async (lang) => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await waitFor('!!(window.app && app.ready)', 30000); await evalJs('app.ready.then(() => true)');
    if (lang !== undefined) {
      await evalJs(`(() => { ${lang ? `localStorage.setItem('vibespace.lang', '${lang}')` : `localStorage.removeItem('vibespace.lang')`}; return 1; })()`);
      await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      await waitFor('!!(window.app && app.ready)', 30000); await evalJs('app.ready.then(() => true)');
    }
    await waitFor(`!document.getElementById('loading-screen')`, 15000); await sleep(1200);
  };
  const tapAt = async (x, y) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(60); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(350); };
  const centre = (sel) => evalJs(`(() => { const e = ${sel.startsWith('(') ? sel : `document.querySelector(${JSON.stringify(sel)})`}; if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`);
  const tap = async (sel) => { const p = await centre(sel); if (!p) return false; await tapAt(p.x, p.y); return true; };
  const longPress = async (sel, holdMs = 700) => { const p = await centre(sel); if (!p) return false; await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); await sleep(holdMs); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300); return true; };
  const shot = async (name) => { if (!SHOTS) return; try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, 'base64')); } catch (e) { console.log(`    (shot ${name}: ${e.message})`); } };
  const settle = () => evalJs('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => r(true), 60))))');

  /** The scene on the page: THREE desktops, the second active and named «工作» (the chip's badge «2» — its PLACE, r3), the ring at
   *  `ring`, one files window titled `title`. */
  const dress = async ({ title, ring = 37 }) => {
    await evalJs(`(async () => {
      const dm = app.desktopManager;
      if (dm) { while (dm.desktops.length < 3) dm.createDesktop(); const d2 = dm.desktops[1]; if (d2.name !== '工作') dm.renameDesktop(d2.id, '工作'); if (dm.activeDesktopId !== d2.id) await app._mobileNav?.switchDesktop?.(d2.id); }
      for (const id of [...app.wm.windows.keys()]) app.wm.requestClose(id);
      return true; })()`);
    await sleep(500);
    await evalJs(`(() => { const w = app.openFileExplorer(); return !!w; })()`);
    // the explorer names its window after its folder once the listing lands — the conversation's name goes on after that
    await waitFor(`[...app.wm.windows.values()].some((w) => w.type === 'files' && w._explorer?.currentPath && w.element.querySelectorAll('.file-item').length > 0)`, 10000);
    await sleep(400);
    await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'files'); app.wm.setTitle(w.id, ${JSON.stringify(title)}); app.goToWinId?.(w.id); app._updateMobileNavTitle(); return true; })()`);
    await setRing(ring);
    await waitFor(`document.getElementById('mobile-nav-title').textContent.startsWith(${JSON.stringify(title)})`, 5000);
    await sleep(300); await settle();
  };
  /** the ring drawn by the poll's own chip markup (usage-meter.js — the scratch hub holds no quota reading) */
  const setRing = (pct) => evalJs(`(() => { const c = document.getElementById('mobile-nav-usage'); const deg = Math.round(${pct} * 3.6); c.innerHTML = '<div class="usage-pie usage-donut" style="background:conic-gradient(var(--yellow) ' + deg + 'deg, var(--bg-input) ' + deg + 'deg)"><span class="usage-donut-label">${pct}</span></div>'; c.classList.remove('hidden'); return true; })()`);
  const BAR = `(() => {
    const nav = document.getElementById('mobile-nav'), title = document.getElementById('mobile-nav-title');
    const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }; };
    const probe = document.createElement('span'); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit'; title.appendChild(probe);
    const text = title.firstChild && title.firstChild.nodeType === 3 ? title.firstChild.nodeValue : title.textContent;
    probe.textContent = MIN(text); const minW = probe.getBoundingClientRect().width; probe.textContent = text; const fullW = probe.getBoundingClientRect().width; probe.remove();
    const ts = getComputedStyle(title), box = title.getBoundingClientRect().width - parseFloat(ts.paddingLeft) - parseFloat(ts.paddingRight); // the title's content box, unrounded
    const todos = document.getElementById('mobile-nav-todos');
    const badges = todos ? [...todos.querySelectorAll('.ut-count, .mnav-one')].filter(shown).map((b) => ({ c: b.className.replace('ut-count ', ''), seg: b.dataset.seg || null, n: b.textContent, bg: getComputedStyle(b).backgroundColor })) : [];
    const ctl = ${JSON.stringify(NAV)}.map((id) => ({ id, el: document.getElementById(id) })).filter((x) => shown(x.el)).map((x) => ({ id: x.id.replace('mobile-nav-', ''), ...r(x.el) }));
    return { vw: innerWidth, vc: document.documentElement.dataset.vc, dir: getComputedStyle(nav).flexDirection, text, title: { ...r(title), minW: Math.round(minW * 10) / 10, fullW: Math.round(fullW * 10) / 10, min: MIN(text), whole: fullW <= box, readable: minW <= box, over: fullW - box }, ctl, badges,
      folded: [...nav.querySelectorAll('.bar-folded')].map((e) => e.id.replace('mobile-nav-', '')), overflowBuilt: !!document.getElementById('mobile-nav-overflow'), red: getComputedStyle(document.documentElement).getPropertyValue('--red').trim() };
  })()`.replace(/MIN\(/g, '(' + minText.toString().replace(/WIDE/g, WIDE.toString()) + ')(');
  const bar = () => evalJs(BAR);
  const ids = (b) => b.ctl.map((c) => c.id).join(' ');
  const say = (b) => `${b.vw} px ${b.vc}: [${b.ctl.map((c) => c.id + ' ' + c.w).join(' · ')}] title ${b.title.w} px (min ${b.title.minW} «${b.title.min}», whole ${b.title.fullW}) · badges ${b.badges.map((x) => x.n).join('/')} · folded ${b.folded.join(',') || '—'}`;
  /** THE OWNER'S PHONE RULES on the drawn bar: the title readable, the doors standing, every control a 44 px target, no folder icon */
  const judgeBar = (b, tag, { wantFolded = null, wantOne = true } = {}) => {
    console.log(`    ${tag}: ${say(b)}`);
    ok(b.title.readable || b.title.whole, `${tag}: the title's box (${b.title.w} px) holds its readable minimum «${b.title.min}» (${b.title.minW} px) — exactly, no slack`, say(b));
    ok(['menu', 'todos', 'close', 'new'].every((k) => b.ctl.some((c) => c.id === k)), `${tag}: ☰ · For you · ✕ · + stand (${ids(b)})`, ids(b));
    ok(b.ctl.every((c) => c.w >= 44 && c.h >= 43.5), `${tag}: every control is a ≥ 44 px target (${b.ctl.map((c) => c.id + ' ' + c.w + '×' + c.h).join(', ')})`, b.ctl);
    ok(!b.ctl.some((c) => c.id === 'files'), `${tag}: the bar shows no folder icon (LAW 3)`, ids(b));
    if (wantOne) ok(b.badges.length === 1 && b.badges[0].c.includes('mnav-one'), `${tag}: the For-you chip shows ONE badge (${b.badges.map((x) => x.n).join('/')})`, b.badges);
    if (wantFolded) ok(wantFolded.every((k) => b.folded.includes(k)) && b.ctl.some((c) => c.id === 'overflow'), `${tag}: ${wantFolded.join(' · ')} live in ONE «⋯» (folded: ${b.folded.join(', ')})`, b);
  };
  const MORE_ROWS = `[...document.querySelectorAll('.context-menu.mnav-more-menu .context-menu-item')].map((el) => { const r = el.getBoundingClientRect(); return { key: el.dataset.key, label: el.querySelector('.mnav-more-label')?.textContent, value: el.querySelector('.mnav-more-value')?.textContent || '', h: Math.round(r.height), fs: parseFloat(getComputedStyle(el).fontSize) }; })`;

  // ── ⑪ + ⑫ (r6 — the r5 acceptance's L1 / L2) on their own helpers: `PTT_ONLY=r6` runs them alone on any tree (the RED-by-name runs
  // on the r5 and base copies) ──
  const resolveAll = async () => {
    const open = await (await fetch(`http://127.0.0.1:${PORT}/api/user-todos`)).json().catch(() => null);
    const idsOpen = (open?.todos?.open || open?.open || []).map((i) => i.id);
    for (let i = 0; i < idsOpen.length; i += 100) await fetch(`http://127.0.0.1:${PORT}/api/user-todos/resolve-many`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: idsOpen.slice(i, i + 100), status: 'done' }) }).catch(() => null);
    await waitFor(`!document.querySelector('#mobile-nav-todos .ut-count')`, 8000);
    return idsOpen;
  };
  const r6Legs = async () => {
    const vaultR6 = (on) => evalJs(`fetch('/api/vault/state').then((r) => r.json()).then((st) => { const msg = { ...st, type: 'vault-state', state: '${on ? 'locked' : 'unlocked'}' }; for (const h of [...app.ws.globalHandlers]) { try { h(msg); } catch { } } return true; })`);
    const NEW_SESSION = `(!document.getElementById('dialog-new-session').classList.contains('hidden') && !document.getElementById('dialog-overlay').classList.contains('hidden'))`;
    const IS_FILES = `app.wm.windows.get(app.wm.activeWindowId)?.type === 'files'`;
    // every popover / sheet / dialog / drawer shut, every explorer closed, the web view on show
    const reset = () => evalJs(`(() => { document.querySelector('#vault-unlock-dialog .vault-later')?.click();
      document.querySelectorAll('.context-menu, .global-settings-popover, .mobile-win-switcher, .ut-mini-popover').forEach((x) => (x._close ? x._close() : x.remove())); document.querySelectorAll('.usage-popup').forEach((x) => x.classList.add('hidden'));
      const o = document.getElementById('dialog-overlay'); if (o) { o.classList.add('hidden'); o.querySelectorAll('.dialog').forEach((d) => d.classList.add('hidden')); }
      for (const w of [...app.wm.windows.values()]) if (w.type === 'files') app.wm.requestClose(w.id);
      if (app.sidebar?.isOpen) app.sidebar.toggle(false);
      const b = [...app.wm.windows.values()].find((w) => w.type === 'browser'); if (b && app.wm.activeWindowId !== b.id) app.wm.focusWindow(b.id); return true; })()`);
    // what SAYS Files on the screen (its words or its name for a screen reader), drawn and on top — the first one marked for the finger
    const MARK_FILES = `(() => { document.querySelectorAll('[data-ptt-files]').forEach((e) => delete e.dataset.pttFiles);
      const says = (el) => ['aria-label', 'title'].some((a) => (el.getAttribute(a) || '').trim() === 'Files') || [el, ...el.querySelectorAll('*')].some((s) => !s.children.length && s.textContent.trim() === 'Files');
      const onTop = (el) => { const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
        const h = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); return !!h && (h === el || el.contains(h)); };
      const hit = [...document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], .context-menu-item, .ph-files-chip')].filter((el) => says(el) && onTop(el));
      if (hit[0]) hit[0].dataset.pttFiles = '1'; return hit.map((e) => e.id || String(e.className).split(' ')[0]); })()`;
    // the bar's drawn doors — every one but ✕ (it closes the window on show)
    const DOORS_NOW = `[...document.querySelectorAll('#mobile-nav > button[id], #mobile-nav-title')].filter((e) => e.id !== 'mobile-nav-close' && e.getClientRects().length && !e.classList.contains('bar-folded') && getComputedStyle(e).visibility !== 'hidden').map((e) => '#' + e.id)`;
    /** EVERY ROAD TO FILES IN TWO TAPS: each drawn door tapped (a real touch tap — never a long press), then whatever on the screen
     *  says Files tapped — the explorer on show is the road's end */
    const roads = async (tag) => {
      const out = [];
      await reset(); await sleep(250); await settle();
      for (const d of await evalJs(DOORS_NOW)) {
        await reset(); await sleep(250); await settle();
        await tap(d); await sleep(250); await settle();
        if (d === '#mobile-nav-new' && tag) await shot(`${tag}-plus-tap1.png`);
        let taps = 1, reached = await evalJs(IS_FILES), says = [];
        const dialog = await evalJs(NEW_SESSION);
        if (!reached) { says = await evalJs(MARK_FILES); if (says.length) { await tap('[data-ptt-files]'); taps = 2; reached = await waitFor(IS_FILES, 6000); } }
        if (d === '#mobile-nav-new' && tag && reached) { await waitFor(`(${IS_FILES}) && app.wm.windows.get(app.wm.activeWindowId).element.querySelectorAll('.file-item').length > 0`, 6000); await sleep(300); await shot(`${tag}-plus-tap2.png`); }
        out.push({ door: d.replace('#mobile-nav-', ''), says, dialog, reached, taps });
      }
      await reset(); await sleep(250);
      return out;
    };
    const roadSay = (rs) => rs.map((r) => `${r.door} → ${r.reached ? `Files in ${r.taps}` : r.dialog ? 'the New Session dialog' : r.says.length ? 'Files said, not reached' : 'nothing says Files'}`).join(' · ');

    // ── ⑪ «+» IS THE CREATE MENU (r6 L1 — the r5 acceptance: the owner put Files INTO «+», 「应该放进 + 菜单里」, but its sheet opened only
    // on a 500 ms press, the tap opened New Session; with the attention list EMPTY there is no For-you page, so no 文件 card — a phone
    // with a window open and nothing waiting had NO door on the screen that said Files): 360 px compact, a web view open, nothing
    // waiting — from every drawn door of the bar, the roads to Files in two taps: «+» → Files; New session two taps (the sheet's
    // first row, accented); a second tap closes the sheet; a long press opens the same one. CONTROL: r5's tap (the New Session dialog;
    // the sheet on a long press only) put back on the page: no road from any door — RED by name ──
    console.log('⑪ «+» is the create menu — a tap, with nothing waiting (r6 L1)');
    await device(360, 740); await sleep(300); await settle();
    await evalJs(`(() => { for (const id of [...app.wm.windows.keys()]) app.wm.requestClose(id); return true; })()`); await sleep(500);
    await evalJs(`(app.openBrowser(), true)`);
    const opened = await waitFor(`app.wm.windows.get(app.wm.activeWindowId)?.type === 'browser'`, 8000);
    await reset(); await sleep(400); await settle();
    const scene = await evalJs(`(() => ({ vc: document.documentElement.dataset.vc, badges: document.querySelectorAll('#mobile-nav-todos .ut-count, #mobile-nav-todos .mnav-one').length, page: !!app.phoneHome?.show?.(),
      filesIcon: !!document.getElementById('mobile-nav-files')?.getClientRects().length, windows: [...app.wm.windows.values()].map((w) => w.type).join(',') }))()`);
    ok(opened && scene.vc === 'compact' && scene.badges === 0 && !scene.page, `⑪ the scene: 360 px compact, a web view open (${scene.windows}), the attention list EMPTY — no badge, no For-you page to show (so no 文件 card)`, scene);
    const now = await roads('after-en-360-empty');
    const plus = now.find((r) => r.door === 'new');
    ok(!scene.filesIcon && !!plus && plus.reached && plus.taps === 2 && !plus.dialog,
      `⑪ L1 Files is TWO taps away with nothing waiting — a TAP on «+» (no long press) opens the «+» sheet, its Files row the explorer; no folder icon on the bar (LAW 3) — every drawn door: ${roadSay(now)}`, now);
    await tap('#mobile-nav-new'); await sleep(250); await settle();
    const sh = await evalJs(`(() => { const m = document.querySelector('.context-menu.mobile-sheet'); if (!m) return null; const rows = [...m.querySelectorAll(':scope > .context-menu-item')], first = rows[0], btn = document.getElementById('mobile-nav-new');
      return { rows: rows.map((r) => r.textContent.trim()), lead: !!first && first.classList.contains('mnav-sheet-lead'), color: first ? getComputedStyle(first).color : '', weight: first ? getComputedStyle(first).fontWeight : '',
        accent: getComputedStyle(btn).color, plain: rows[1] ? getComputedStyle(rows[1]).color : '', popup: btn.getAttribute('aria-haspopup') }; })()`);
    ok(!!sh && sh.rows[0] === 'Agent session' && sh.rows.includes('Files') && sh.lead && sh.color === sh.accent && sh.plain !== sh.accent && Number(sh.weight) >= 600 && sh.popup === 'menu',
      `⑪ L1 the sheet a tap opens: New session FIRST, accented («${sh?.rows[0]}» in «+»'s ${sh?.accent}, weight ${sh?.weight}; the other rows ${sh?.plain}), Files in it (${sh?.rows.join(' · ')}); «+» names its menu for a screen reader (aria-haspopup «${sh?.popup}»)`, sh);
    const lead = await tap(`(document.querySelector('.context-menu.mobile-sheet > .context-menu-item.mnav-sheet-lead'))`);
    const ns = await waitFor(NEW_SESSION, 5000);
    await shot('after-en-360-empty-new-session-2taps.png');
    ok(ns, `⑪ L1 New session is ${lead ? 'TWO taps away: «+», then its first row' : 'ONE tap away: «+» itself'} — the New Session dialog${lead ? ' (the tap\'s old act, one row in)' : ''}`);
    await reset(); await sleep(250); await settle();
    await tap('#mobile-nav-new'); await sleep(150); const t1 = await evalJs(`!!document.querySelector('.context-menu.mobile-sheet')`);
    await tap('#mobile-nav-new'); await sleep(150); const t2 = await evalJs(`!!document.querySelector('.context-menu.mobile-sheet')`);
    await longPress('#mobile-nav-new'); await sleep(150); const t3 = await evalJs(`document.querySelectorAll('.context-menu.mobile-sheet').length === 1 && !${NEW_SESSION}`);
    ok(t1 && !t2 && t3, `⑪ L1 a second tap on «+» closes its sheet (open: ${t1} → ${t2}); a long press opens the same sheet, once, no dialog (${t3})`, { t1, t2, t3 });
    await reset(); await sleep(250);
    await evalJs(`(() => { const b = document.getElementById('mobile-nav-new'); window.__pttTap = b.onclick; b.onclick = () => app.showNewSessionDialog(); return true; })()`);
    const r5 = await roads('before-en-360-empty');
    await evalJs(`(() => { document.getElementById('mobile-nav-new').onclick = window.__pttTap; return true; })()`);
    ok(r5.length >= 3 && r5.every((r) => !r.reached) && !!r5.find((r) => r.door === 'new')?.dialog,
      `⑪ L1 CONTROL — r5's road (a tap on «+» = the New Session dialog; its sheet on a 500 ms press only) put back on the page: Files two taps from NO drawn door — ${roadSay(r5)} — RED by name`, r5);

    // ── ⑫ THE REGULAR CLASS UNDER ITS OWN RULES (r6 L2 — the r5 acceptance: only the `viewportClass() === 'compact'` term in
    // _publishUnder kept the regular class's trailing bar — a column to the screen's bottom — from writing the variable as the screen
    // + 4, and no gate measured a regular-class surface): 360 px compact LOCKED (the variable written: under the strip), a ROTATION to
    // a Duo's landscape (951×585, the regular class): the variable leaves <html>; the Settings popover (⚙ on the trailing bar), the
    // Usage popup, the mini inbox's rule (a stand-in .ut-mini-popover at an opener's inline top) open at the stylesheet's own 48 and
    // the For-you tray at its column's own top — inside the screen; the Duo's portrait (669×867) the same. CONTROL: _publishUnder with
    // the compact term dropped (r5's function less the term) — the variable the screen + 4, those three at ≈ innerHeight + 4, off the
    // screen — RED by name ──
    console.log('⑫ the regular class under its own rules, after a rotation (r6 L2)');
    const MINI_R6 = `(() => { document.querySelectorAll('.ut-mini-popover').forEach((x) => x.remove()); const p = document.createElement('div'); p.className = 'ut-mini-popover'; p.dataset.popover = '1'; p.style.position = 'fixed'; p.style.top = '0px'; p.style.left = '0px'; p.textContent = 'mini'; document.body.appendChild(p); return true; })()`;
    const GEO = (sel) => `(() => { const s = document.querySelector(${JSON.stringify(sel)}); if (!s || !s.getClientRects().length) return null; const b = s.getBoundingClientRect(); return { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10, vh: innerHeight }; })()`;
    const REG = [
      ['the Settings popover (⚙ on the trailing bar)', '.global-settings-popover', async () => { await tap('#mobile-nav-gear'); await sleep(350); }, 48],
      ['the Usage popup (its chip\'s own opener)', '#usage-popup:not(.hidden)', async () => { await evalJs(`(document.getElementById('mobile-nav-usage').click(), true)`); await sleep(350); }, 48],
      ['the mini inbox (its rule — a stand-in at an opener\'s inline top)', '.ut-mini-popover', async () => { await evalJs(MINI_R6); await sleep(150); }, 48],
      ['the For-you tray (the column\'s own rule)', '#user-todos-popup:not(.hidden)', async () => { await tap('#mobile-nav-todos'); await sleep(350); }, null],
    ];
    const regRun = async (trayTop, tag) => {
      const out = [];
      for (const [name, sel, open, w] of REG) {
        await reset(); await sleep(200); await settle(); await open(); await settle();
        out.push([name, await evalJs(GEO(sel)), w ?? trayTop]);
        if (tag && name.startsWith('the Settings')) await shot(`${tag}.png`);
      }
      await reset(); await sleep(200);
      return out;
    };
    const regSay = (rs) => rs.map(([n, g, w]) => `${n.split(' (')[0]} at ${g ? g.top : '—'} (its own top ${w}), its bottom ${g ? g.bottom : '—'} ≤ ${g ? g.vh : '?'}`).join('; ');
    const regOk = (rs) => rs.every(([, g, w]) => !!g && Math.abs(g.top - w) <= 0.5 && g.bottom <= g.vh + 0.5);
    const VAR = `document.documentElement.style.getPropertyValue('--phone-sheet-top')`;
    await vaultR6(true); await sleep(400); await settle();
    const locked = await evalJs(VAR);
    await device(951, 585); await sleep(800); await settle();
    const rot = await evalJs(`({ v: ${VAR}, vc: document.documentElement.dataset.vc, dir: getComputedStyle(document.getElementById('mobile-nav')).flexDirection, bottom: Math.round(document.getElementById('mobile-nav').getBoundingClientRect().bottom), vh: innerHeight })`);
    ok(parseFloat(locked) > 48 && rot.vc === 'regular' && rot.dir === 'column' && rot.v === '',
      `⑫ L2 a rotation from the compact class (locked: the variable ${locked}) to a Duo's landscape (951×585 — the regular class, its bar a column to ${rot.bottom} of ${rot.vh}): the variable leaves <html> (now «${rot.v}»)`, { locked, rot });
    await vaultR6(false); await sleep(400); await settle();
    const land = await regRun(8, 'after-en-951-regular-settings');
    ok(regOk(land) && (await evalJs(VAR)) === '', `⑫ L2 the Duo's landscape (the regular class): ${regSay(land)}`, land);
    await device(669, 867); await sleep(800); await settle();
    const port = await regRun(52, null);
    ok(regOk(port) && (await evalJs(VAR)) === '' && (await evalJs(`document.documentElement.dataset.vc`)) === 'regular', `⑫ L2 the Duo's portrait (669×867, the regular class): ${regSay(port)}`, port);
    await device(951, 585); await sleep(800); await settle();
    const dropped = await evalJs(`(() => { const nav = app._mobileNav; nav._publishUnder = function () {
        if (this._held) { this._heldMissed = true; return; }
        const el = document.getElementById('mobile-nav'), root = document.documentElement, z = parseFloat(getComputedStyle(root).getPropertyValue('--ui-scale')) || 1;
        const nb = el && el.getClientRects().length ? el.getBoundingClientRect().bottom : 0; // r5's line less its \`viewportClass() === 'compact'\` term
        const v = nb > 0 ? Math.round(nb / z) + 4 + 'px' : '';
        if (root.style.getPropertyValue('--phone-sheet-top') === v) return;
        if (v) root.style.setProperty('--phone-sheet-top', v); else root.style.removeProperty('--phone-sheet-top'); };
      nav._publishUnder(); return ${VAR}; })()`);
    const ctl = await regRun(8, 'before-en-951-regular-settings-term-dropped');
    await evalJs(`(() => { const nav = app._mobileNav; delete nav._publishUnder; if (nav._publishUnder) nav._publishUnder(); else document.documentElement.style.removeProperty('--phone-sheet-top'); return true; })()`);
    const off = ctl.filter(([, g]) => !!g && g.top >= g.vh);
    ok(['the Settings popover', 'the Usage popup', 'the mini inbox'].every((k) => off.some(([n]) => n.startsWith(k))),
      `⑫ L2 CONTROL — _publishUnder with the compact term dropped (the regular class's column writes ${dropped} = the screen + 4): ${off.map(([n, g]) => `${n.split(' (')[0]} at ${g.top} ≥ the screen's ${g.vh}`).join('; ') || 'none off the screen'} — off the screen, RED by name`, ctl);
    await device(360, 740); await sleep(600); await settle(); await reset();
    // ── ⑪b «+» NAMES ITS MENU in every language (r7 W1 — the r6 acceptance: «+» was still titled «New session» while a tap opens the
    // create menu — a mouse's tooltip and a screen reader named the one act the tap no longer does): its DRAWN title and aria-label
    // in zh / ja / en are the menu's words (data-i18n-attr through the dictionaries), aria-haspopup «menu» ──
    console.log('⑪b «+» names its menu — zh / ja / en (r7 W1)');
    const PLUS_WORDS = { zh: '新建或打开…', ja: '作成または開く…', en: 'Create or open…' };
    const said = {};
    for (const lang of Object.keys(PLUS_WORDS)) { await load(lang); said[lang] = await evalJs(`(() => { const b = document.getElementById('mobile-nav-new'); return { title: b.title, aria: b.getAttribute('aria-label'), popup: b.getAttribute('aria-haspopup'), shown: b.getClientRects().length > 0 }; })()`); }
    ok(Object.entries(PLUS_WORDS).every(([l, w]) => said[l]?.title === w && said[l]?.aria === w && said[l]?.popup === 'menu' && said[l]?.shown),
      `⑪b W1 «+» names its MENU in every language — title / aria-label: ${Object.entries(said).map(([l, x]) => `${l} «${x?.title}» / «${x?.aria}»`).join(' · ')}; aria-haspopup «${said.en?.popup}» (r6: «New session», the one act a tap no longer does)`, said);
  };
  if (process.env.PTT_ONLY === 'r6') {
    console.log('PTT_ONLY=r6 — the r6 legs alone (⑪ ⑫) on this tree, its attention list emptied first');
    await device(360, 740); await load('en');
    console.log(`    ${(await resolveAll()).length} open items resolved`);
    await r6Legs();
    ok(pageErrors.length === 0, `the page threw nothing (${pageErrors.length})`, pageErrors.slice(0, 3));
    try { sock.close(); } catch { }
    return;
  }

  // ── ① + ② THE OWNER'S BAR ──
  for (const lang of ['zh', 'en']) {
    await device(360, 780); await load(lang);
    await dress({ title: OWNER });
    console.log(`① the owner's bar (${lang})`);
    for (const vw of [360, 320]) {
      await device(vw, 780); await sleep(400); await settle();
      const b = await bar();
      judgeBar(b, `${lang} ${vw} px`, { wantFolded: ['desktops', 'usage', 'gear'] });
      ok(b.badges.length === 1 && b.badges[0].n === '31' && b.badges[0].seg === 'urgent', `${lang} ${vw} px: the one badge is the honest count 31 in the urgent colour (${b.badges[0]?.n} ${b.badges[0]?.seg} ${b.badges[0]?.bg})`, b.badges);
      ok(b.text === OWNER, `${lang} ${vw} px: the title is the window's own, as typed («${b.text}»)`, b.text);
      await shot(`after-${lang}-${vw}.png`);
      if (!(await tap('#mobile-nav-overflow'))) { ok(false, `${lang} ${vw} px: a «⋯» to open`); continue; }
      await sleep(300);
      const rows = await evalJs(MORE_ROWS);
      const desk = await evalJs(`document.querySelector('#mobile-nav-desktops .mnav-badge:not(.hidden)')?.textContent || ''`); // the active desktop's PLACE (three desktops, the second)
      const want = lang === 'zh' ? [['desktops', '桌面', '2/3 · 工作'], ['usage', '用量', '37 %'], ['gear', '设置', '']] : [['desktops', 'Desktops', '2/3 · 工作'], ['usage', 'Usage', '37 %'], ['gear', 'Settings', '']];
      ok(desk === '2', `${lang} ${vw} px: the desktops chip (folded) still carries the active desktop's PLACE «${desk}» (three desktops, the second active)`);
      // r3 F3: the row says what the chip says — the place OF the total and the name; CONTROL: r2's value (the chip's bare badge) is RED
      const placeOfTotal = (v) => /^2\/3 · \S/.test(v || '');
      const dRow = rows.find((r) => r.key === 'desktops');
      ok(placeOfTotal(dRow?.value) && !placeOfTotal(desk), `${lang} ${vw} px: ② F3 — the Desktops row reads «${dRow?.label} ${dRow?.value}»: the place of the total and the name, never a bare number — CONTROL: r2's «${desk}» judged the same is RED`, dRow);
      ok(JSON.stringify(rows.map((r) => [r.key, r.label, r.value])) === JSON.stringify(want), `${lang} ${vw} px: ② the ⋯ lists the folded chips in order with their live values (${rows.map((r) => r.label + (r.value ? ' ' + r.value : '')).join(' · ')})`, rows);
      ok(rows.length && rows.every((r) => r.h >= 44 && r.fs >= 16), `${lang} ${vw} px: ② every ⋯ row is ≥ 44 px tall in ≥ 16 px words (${rows.map((r) => r.h + '/' + r.fs).join(', ')})`, rows);
      await shot(`after-${lang}-${vw}-more.png`);
      if (vw === 360 && lang === 'zh') {
        await setRing(52); await sleep(200);
        const live = await evalJs(MORE_ROWS), glyph = () => evalJs(`(() => { const g = document.querySelector('.mnav-more-menu .context-menu-item[data-key="usage"] .mnav-more-icon'); return { n: g?.querySelector('.usage-donut-label')?.textContent || '', arc: (g?.querySelector('.usage-donut')?.getAttribute('style') || '').match(/\\d+deg/)?.[0] || '' }; })()`);
        const g52 = await glyph();
        ok(live.find((r) => r.key === 'usage')?.value === '52 %' && g52.n === '52' && g52.arc === '187deg', `② the ring moved to 52 while the ⋯ was open — its row says «${live.find((r) => r.key === 'usage')?.value}» AND its glyph draws ${g52.n} (arc ${g52.arc}): one source (r2)`, { live, g52 });
        await shot('after-zh-360-more-ring52.png');
        await setRing(37); await sleep(200);
        const g37 = await glyph();
        ok(g37.n === '37' && g37.arc === '133deg' && (await evalJs(MORE_ROWS)).find((r) => r.key === 'usage')?.value === '37 %', `② …back to 37: the glyph and the value together (${g37.n}, ${g37.arc})`, g37);
        await tap(`(document.querySelector('.mnav-more-menu .context-menu-item[data-key="desktops"]'))`);
        ok(await waitFor(`!!document.querySelector('.mdesk-menu')`, 3000), '② the Desktops row opens the desktops sheet (the chip\'s own door)');
        await evalJs(`document.querySelector('.mdesk-menu')?.remove(); true`);
        await sleep(200);
      } else { await evalJs(`document.querySelector('.mnav-more-menu')?.remove(); true`); await sleep(150); }
    }
    if (lang === 'zh') {
      // a For-you change re-decides the bar through the product's own road (the owner's status route → the hub's broadcast → the
      // chip's repaint → the bar's watcher): the urgent ask resolved ⇒ ONE badge, 30, the high colour; reopened ⇒ 31, urgent again
      await device(360, 780); await sleep(300); await settle();
      const post = (id, status) => evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${JSON.stringify(id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ status }))} }).then((r) => r.status)`);
      const urgentId = await evalJs(`fetch('/api/user-todos').then((r) => r.json()).then((d) => ((d.todos || d).open || []).find((i) => i.urgency === 'urgent')?.id || null)`);
      await post(urgentId, 'done');
      const gone = await waitFor(`document.querySelector('#mobile-nav-todos .mnav-one')?.textContent === '30'`, 8000); await settle();
      const b1 = await bar();
      ok(gone && b1.badges.length === 1 && b1.badges[0].n === '30' && b1.badges[0].seg === 'high' && b1.title.readable, `② the urgent ask resolved (a broadcast): still ONE badge, now 30 in the high colour, the title readable (${say(b1)})`, b1.badges);
      await post(urgentId, 'open');
      const back = await waitFor(`document.querySelector('#mobile-nav-todos .mnav-one')?.textContent === '31'`, 8000); await settle();
      const b2 = await bar();
      ok(back && b2.badges.length === 1 && b2.badges[0].seg === 'urgent', `② …reopened (an arrival): ONE badge, 31, urgent again (${b2.badges.map((x) => x.n + ' ' + x.seg).join('/')})`, b2.badges);
    }
  }

  // ── ⑥ THE ⋯'S PRESSES (r2): a second press closes it — a finger's AND a mouse's; Settings from the ⋯ is keyed to ⚙ ──
  console.log('⑥ the ⋯\'s presses');
  const clickAt = async (x, y) => { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(50); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(350); };
  const press = async (sel, mouse) => { const p = await centre(sel); if (!p) return false; if (mouse) await clickAt(p.x, p.y); else await tapAt(p.x, p.y); return true; };
  const MENUS = `(() => { const top = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60)); return !!h && el.contains(h); };
    const gs = [...document.querySelectorAll('.global-settings-popover')], m = document.querySelector('.context-menu.mnav-more-menu');
    return { more: !!m, moreTop: top(m), settings: gs.length, settingsTop: top(gs[0]), keyedTo: gs[0]?._anchor?.id || null }; })()`;
  const clear = () => evalJs(`document.querySelectorAll('.global-settings-popover, .context-menu').forEach((x) => x.remove()); true`);
  for (const mouse of [false, true]) {
    const how = mouse ? 'a mouse' : 'a finger';
    await device(360, 780, { mouse }); await sleep(600); await settle(); await clear();
    const b = await bar();
    if (!ok(b.vc === 'compact' && b.folded.includes('gear') && b.ctl.some((c) => c.id === 'overflow'), `${how}: the compact bar at 360 px with ⚙ in the ⋯ (${b.vc}; folded ${b.folded})`, say(b))) continue;
    const seq = [];
    for (let i = 0; i < 3; i++) { await press('#mobile-nav-overflow', mouse); seq.push((await evalJs(MENUS)).more); }
    ok(JSON.stringify(seq) === '[true,false,true]', `${how}: ⋯ opens, a second press CLOSES it, a third opens it (${seq.map((x) => (x ? 'open' : 'closed')).join(' / ')})`, seq);
    await clear();
    await press('#mobile-nav-overflow', mouse); await press('.mnav-more-menu .context-menu-item[data-key="gear"]', mouse);
    const s1 = await evalJs(MENUS);
    await press('#mobile-nav-overflow', mouse);
    const s2 = await evalJs(MENUS);
    await press('.mnav-more-menu .context-menu-item[data-key="gear"]', mouse);
    const s3 = await evalJs(MENUS);
    ok(s1.settings === 1 && s1.settingsTop && s1.keyedTo === 'mobile-nav-gear' && !s1.more, `${how}: ⋯ → Settings opens Settings on top, keyed to ⚙ — never to the ⋯ (${JSON.stringify(s1)})`, s1);
    ok(s2.settings === 0 && s2.more && s2.moreTop, `${how}: …⋯ again closes Settings and opens the ⋯ on top — nothing stacked (${JSON.stringify(s2)})`, s2);
    ok(s3.settings === 1 && s3.settingsTop && !s3.more, `${how}: …Settings again: Settings open, on top, ONCE (${JSON.stringify(s3)})`, s3);
    if (!mouse) await shot('after-en-360-more-settings.png');
    await clear();
  }

  // ── ⑦ THE SLACK IS THE TITLE'S (r2): titles 0…0.5 px over the room ⚙ leaves ⇒ ⚙ folds, the title whole ──
  console.log('⑦ the slack is the title\'s');
  await device(360, 780); await sleep(500); await settle();
  await dress({ title: 'Notes' });
  {
    const b0 = await bar();
    ok(b0.folded.join() === 'desktops,usage' && !b0.folded.includes('gear') && b0.badges.length === 1, `the owner's bar with a short title: ⚙ stands, desktops + ring in the ⋯ (${say(b0)})`, say(b0));
    const band = await evalJs(`(() => {
      const title = document.getElementById('mobile-nav-title'), ts = getComputedStyle(title);
      const R = title.getBoundingClientRect().width - parseFloat(ts.paddingLeft) - parseFloat(ts.paddingRight);
      const probe = document.createElement('span'); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit'; title.appendChild(probe);
      const w = (s) => { probe.textContent = s; return probe.getBoundingClientRect().width; };
      let seed = 20261106; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const A = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.';
      const over = [], under = [], acc = ['NotesDtekEH', 'NotescvHJ.vu'].map((s) => [s, w(s) - R]);
      for (let i = 0; i < 20000 && (over.length < 2 || under.length < 1); i++) {
        let s = 'Notes'; const n = 3 + Math.floor(rnd() * 12); for (let j = 0; j < n; j++) s += A[Math.floor(rnd() * A.length)];
        const d = w(s) - R;
        if (d > 0 && d <= 0.5 && over.length < 2 && !over.some((x) => x[0] === s)) over.push([s, d]);
        else if (d <= -0.05 && d >= -0.5 && !under.length) under.push([s, d]);
      }
      probe.remove();
      return { R, over, under, acc };
    })()`);
    console.log(`    the room ⚙ leaves the title: ${band.R.toFixed(4)} px; over it: ${band.over.map(([s, d]) => `«${s}» +${d.toFixed(4)}`).join(', ')}; under: ${band.under.map(([s, d]) => `«${s}» ${d.toFixed(4)}`).join(', ')}; the r1 acceptance's titles here: ${band.acc.map(([s, d]) => `«${s}» ${d >= 0 ? '+' : ''}${d.toFixed(4)}`).join(', ')}`);
    ok(band.over.length === 2 && band.under.length === 1, `found two titles 0…0.5 px over that room and one just under it (${band.over.length} / ${band.under.length})`, band);
    let k = 0;
    for (const [s, d] of band.over.concat(band.under, band.acc)) {
      await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'files'); app.wm.setTitle(w.id, ${JSON.stringify(s)}); app._updateMobileNavTitle(); return true; })()`);
      await waitFor(`document.getElementById('mobile-nav-title').textContent === ${JSON.stringify(s)}`, 3000); await sleep(150); await settle();
      const b = await bar();
      const gearFolds = b.folded.includes('gear');
      ok(b.title.whole && gearFolds === d > -1 / 64, `«${s}» (${d >= 0 ? '+' : ''}${d.toFixed(4)} px against the room ⚙ leaves): ⚙ ${gearFolds ? 'folds' : 'stands'}, the title WHOLE (${b.title.fullW} in ${b.title.w}, over by ${b.title.over.toFixed(4)})`, say(b));
      if (d > 0 && d <= 0.5 && k < 2) await shot(`after-en-360-slack-${++k}.png`);
    }
  }

  // ── ⑧ THE COUNT'S GIVE-BACK (r2): the vault-lock chip makes four foldable chips — never ONE alone in the ⋯ ──
  console.log('⑧ the count\'s give-back');
  // THE VAULT LOCKED BY THE ROAD ANOTHER CLIENT'S LOCK TAKES (r3 — r2 drew a replica chip): a `vault-state` broadcast handed to the
  // page's own socket handlers (vault-unlock.js initVault's onGlobal) with this hub's own facts and startedAt — a lock ACT, so no
  // dialog: the real chip beside For you, ⚙'s red mark, the strip. The scratch hub has no vault to lock; the state is the one a lock
  // broadcasts. `on` false = an unlock from another client.
  const vault = (on) => evalJs(`fetch('/api/vault/state').then((r) => r.json()).then((st) => { const msg = { ...st, type: 'vault-state', state: '${on ? 'locked' : 'unlocked'}' };
    for (const h of [...app.ws.globalHandlers]) { try { h(msg); } catch { } } return !!document.getElementById('mobile-nav-vault') === ${on ? 'true' : 'false'}; })`);
  await device(600, 900); await sleep(500); await settle();
  await dress({ title: '游戏' });
  ok(await vault(true) && await evalJs(`!!document.querySelector('#mobile-nav-gear.vault-locked > .vault-gear-mark')`), '⑧ the lock\'s broadcast (the road another client\'s lock takes) draws the real lock chip beside For you and ⚙\'s red mark');
  await sleep(200); await settle();
  {
    const b = await bar();
    const four = ['desktops', 'usage', 'vault', 'gear'].every((k) => b.ctl.some((c) => c.id === k));
    ok(b.vc === 'compact' && four && !b.folded.length && !b.ctl.some((c) => c.id === 'overflow') && b.title.whole, `600 px, a 2-character title, the vault locked: the count would put the desktops door ALONE in a ⋯ — it stands: four foldable chips inline, no ⋯ (${say(b)})`, say(b));
    await shot('after-en-600-vault-giveback.png');
  }
  await dress({ title: OWNER }); await vault(true); await sleep(200); await settle();
  {
    const b = await bar();
    ok(b.folded.join() === 'desktops,usage' && b.title.whole, `…the owner's title: the count folds the desktops door, the width the ring — TWO in the ⋯, the title whole (${say(b)})`, say(b));
  }
  await device(360, 780); await sleep(500); await settle();
  {
    const b = await bar();
    judgeBar(b, '360 px, the vault locked', { wantFolded: ['desktops', 'usage', 'vault', 'gear'] });
    await tap('#mobile-nav-overflow'); await sleep(300);
    const rows = await evalJs(MORE_ROWS), lock = rows.find((r) => r.key === 'vault');
    ok(rows.map((r) => r.key).join() === 'desktops,usage,vault,gear' && lock?.label === 'Vault locked' && lock.h >= 44 && lock.fs >= 16, `…its ⋯ lists the lock after the ring, before ⚙ — «${lock?.label}» ${lock?.h}/${lock?.fs} (${rows.map((r) => r.key).join(' · ')})`, rows);
    await clear();
  }

  // ── ⑨ THE LOCK STAYS LOUD (r3 F1): ⚙ folded while the vault is locked ⇒ the ⋯ and its Settings row wear ⚙'s lock ──
  console.log('⑨ the lock stays loud');
  const RED = `(() => { const p = document.createElement('span'); p.style.color = 'var(--red)'; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; })()`;
  const LOUD = `(() => { const more = document.getElementById('mobile-nav-overflow'), gear = document.getElementById('mobile-nav-gear');
    const mark = (el) => { const m = el && el.querySelector('.vault-gear-mark'); if (!m) return null; const r = m.getBoundingClientRect(); return { w: Math.round(r.width), svg: !!m.querySelector('svg'), color: getComputedStyle(m).color }; };
    const row = document.querySelector('.mnav-more-menu .context-menu-item[data-key="gear"]'), icon = row && row.querySelector('.mnav-more-icon');
    const marked = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return !!d.querySelector('.vault-gear-mark svg'); }; // the row's predicate, on any glyph
    return { more: { shown: !!more && more.getClientRects().length > 0, cls: !!more && more.classList.contains('vault-locked'), color: more && getComputedStyle(more).color, mark: mark(more), title: more && more.title },
      gear: { folded: !!gear && gear.classList.contains('bar-folded'), locked: !!gear && gear.classList.contains('vault-locked'), mark: mark(gear) },
      row: row ? { marked: marked(icon.innerHTML), mark: mark(icon), color: getComputedStyle(icon).color, label: row.querySelector('.mnav-more-label').textContent } : null,
      r2Row: gear ? marked(gear.querySelector('svg')?.outerHTML) : null, vaultRow: !!document.querySelector('.mnav-more-menu .context-menu-item[data-key="vault"]') }; })()`;
  const MARKGEO = `(() => { const nav = document.getElementById('mobile-nav').getBoundingClientRect(), f = (n) => Math.round(n * 100) / 100;
    const at = (chip) => { const m = chip && chip.getClientRects().length ? chip.querySelector(':scope > .vault-gear-mark') : null, g = chip && chip.querySelector(':scope > svg'); if (!m || !g) return null;
      const mr = m.getBoundingClientRect(), gr = g.getBoundingClientRect(), s = m.querySelector('svg')?.getBoundingClientRect();
      return { dx: f(mr.right - (gr.left + gr.width / 2)), dy: f(gr.top + gr.height / 2 - mr.top), svg: s ? [f(s.width), f(s.height)] : null, top: f(mr.top) }; };
    const icons = [...document.querySelectorAll('.mnav-more-menu .context-menu-item .mnav-more-icon')];
    return { navTop: f(nav.top), more: at(document.getElementById('mobile-nav-overflow')), gear: at(document.getElementById('mobile-nav-gear')), row: at(document.querySelector('.mnav-more-menu .context-menu-item[data-key="gear"] .mnav-more-icon')),
      labels: [...document.querySelectorAll('.mnav-more-menu .context-menu-item .mnav-more-label')].map((l) => f(l.getBoundingClientRect().left)), glyphs: icons.map((i) => f(i.firstElementChild ? i.firstElementChild.getBoundingClientRect().width : 0)), col: icons[0] ? f(icons[0].getBoundingClientRect().width) : 0 }; })()`;
  await device(360, 780); await sleep(300); await settle(); await clear();
  {
    const red = await evalJs(RED), b = await bar(), l0 = await evalJs(LOUD);
    ok(b.folded.includes('gear') && l0.gear.locked && l0.more.shown && l0.more.cls && l0.more.color === red && l0.more.mark?.svg && l0.more.mark.w > 0 && l0.more.mark.color === red && l0.more.title === 'More — Vault locked',
      `⑨ locked, 360 px, the owner's title, ⚙ folded: the ⋯ wears ⚙'s lock — the red (${l0.more.color}), the mark (${JSON.stringify(l0.more.mark)}), «${l0.more.title}»`, { l0, folded: b.folded });
    await shot('after-en-360-locked.png');
    await tap('#mobile-nav-overflow'); await sleep(300);
    const l1 = await evalJs(LOUD);
    ok(!!l1.row && l1.row.marked && l1.row.mark?.w > 0 && l1.row.color === red && l1.vaultRow, `⑨ …its Settings row «${l1.row?.label}» wears the mark and the red (${l1.row?.color}); the «Vault locked» row stays`, l1);
    ok(l1.r2Row === false, '⑨ CONTROL: r2\'s ⚙ row (the chip\'s FIRST svg — the plain cog) judged by the same predicate carries no mark — RED', l1.r2Row);
    await shot('after-en-360-locked-more.png');
    // G2 (r4): ⚙'s lock mark drawn ONE way — the row's svg the bar's size (the r3 acceptance: 16×16 in the 16 px row, over the cog), on
    // its glyph's corner on the ⋯ as on ⚙ (r3: the ⋯'s floated at its 44 px box's corner over the strip's border), the labels in ONE column
    const g2a = await evalJs(MARKGEO);
    const sz = (m) => (m && m.svg ? m.svg.join('×') : '—'), near = (a, b) => Math.abs(a - b) <= 0.6;
    ok(!!g2a.more && !!g2a.row && sz(g2a.row) === sz(g2a.more) && near(g2a.more.svg[0], 11) && near(g2a.more.svg[1], 13.33), `⑨ G2 the 设置 row's lock is drawn at the bar's size — row ${sz(g2a.row)}, the ⋯'s ${sz(g2a.more)} (11 × 13.3: the mark's own em)`, g2a);
    ok(!!g2a.more && near(g2a.more.dx, 18) && near(g2a.more.dy, 18) && g2a.more.top >= g2a.navTop - 0.5 && !!g2a.row && near(g2a.row.dx, 18) && near(g2a.row.dy, 18), `⑨ G2 the mark sits on its GLYPH's corner — the ⋯'s ${g2a.more?.dx}/${g2a.more?.dy} px from its dots' middle, inside the bar (top ${g2a.more?.top} ≥ ${g2a.navTop}); the row's ${g2a.row?.dx}/${g2a.row?.dy} from the cog's`, g2a);
    ok(g2a.labels.length === 4 && Math.max(...g2a.labels) - Math.min(...g2a.labels) <= 0.5 && g2a.glyphs.every((w) => w <= g2a.col + 0.5), `⑨ G2 the ⋯ rows' labels start at ONE x (${[...new Set(g2a.labels)].join(' / ')}) — every glyph inside the ${g2a.col} px column (${g2a.glyphs.join(', ')})`, g2a);
    // CONTROL — r3's rules on the page (the mark in its host's em with the sheet's no-shrink, at its box's corner; no glyph column)
    await evalJs(`(() => { const st = document.createElement('style'); st.id = 'ptt-r3-mark'; st.textContent = '.vault-gear-mark{font-size:inherit} .mobile-sheet .context-menu-item .vault-gear-mark svg{flex-shrink:0} html[data-vc="compact"] #mobile-nav > :is(#mobile-nav-gear, #mobile-nav-overflow).vault-locked > .vault-gear-mark, .mnav-more-menu .context-menu-item.vault-locked .mnav-more-icon > .vault-gear-mark{top:0;right:0} .mnav-more-menu .mnav-more-icon{width:auto}'; document.head.appendChild(st); return true; })()`);
    await settle();
    const g2r = await evalJs(MARKGEO);
    await evalJs(`(document.getElementById('ptt-r3-mark')?.remove(), true)`); await settle();
    ok(sz(g2r.row) !== sz(g2r.more), `⑨ G2 CONTROL — r3's rule (the mark in its host's em): the row's lock ${sz(g2r.row)} against the bar's ${sz(g2r.more)} — RED`, g2r);
    ok(!!g2r.more && !near(g2r.more.dx, 18), `⑨ G2 CONTROL — r3's place (the 44 px box's corner): the ⋯'s mark ${g2r.more?.dx}/${g2r.more?.dy} px from its dots' middle — RED`, g2r);
    ok(Math.max(...g2r.labels) - Math.min(...g2r.labels) > 0.5, `⑨ G2 CONTROL — r3's rows (no glyph column): the labels at ${[...new Set(g2r.labels)].join(' / ')} — RED`, g2r);
    // the lock's strip moves the bar down: a sheet at the stylesheet's 48 px would cover it (the ⋯, its second press, its lock)
    const GEO = `(() => { const nav = document.getElementById('mobile-nav').getBoundingClientRect(), m = document.querySelector('.mnav-more-menu'), more = document.getElementById('mobile-nav-overflow').getBoundingClientRect();
      const h = document.elementFromPoint(more.left + more.width / 2, more.top + more.height / 2), st = document.getElementById('vault-lock-strip');
      return { navTop: Math.round(nav.top), navBottom: Math.round(nav.bottom), menuTop: m ? Math.round(m.getBoundingClientRect().top) : null, moreOnTop: !!h && !!h.closest('#mobile-nav-overflow'), strip: !!st && st.getClientRects().length > 0 }; })()`;
    const g1 = await evalJs(GEO);
    ok(g1.strip && g1.navTop > 48 && g1.menuTop >= g1.navBottom && g1.moreOnTop && 48 < g1.navBottom, `⑨ the lock's strip moves the bar down (its top ${g1.navTop}): the ⋯ menu opens UNDER it (menu top ${g1.menuTop} ≥ bar bottom ${g1.navBottom}), the ⋯ on top — CONTROL: r2's sheet at the stylesheet's 48 px covered the bar (48 < ${g1.navBottom})`, g1);
    await tap('#mobile-nav-overflow'); await sleep(200);
    ok(!(await evalJs(`!!document.querySelector('.mnav-more-menu')`)), '⑨ …so the ⋯\'s second press reaches it and closes the menu (under the strip too)');
    await tap('#mobile-nav-overflow'); await sleep(300);
    const menu0 = await evalJs(`(window.__ptMenu = document.querySelector('.mnav-more-menu'), !!window.__ptMenu)`);
    await vault(false); await sleep(250); await settle();
    const l2 = await evalJs(LOUD), same = await evalJs(`document.querySelector('.mnav-more-menu') === window.__ptMenu`), g2 = await evalJs(GEO);
    ok(!g2.strip && g2.menuTop >= g2.navBottom && g2.menuTop <= g2.navBottom + 8, `⑨ …the strip gone, the open menu follows the bar back up (menu top ${g2.menuTop}, bar bottom ${g2.navBottom})`, g2);
    ok(menu0 && same && !l2.more.cls && !l2.more.mark && l2.more.title === 'More' && !!l2.row && !l2.row.marked && l2.row.color !== red && !l2.vaultRow,
      `⑨ an unlock (another client's broadcast) with the menu open: the mark leaves the ⋯ and the Settings row, the «Vault locked» row leaves — the same menu, patched (${JSON.stringify({ more: l2.more.cls, row: l2.row?.color, vaultRow: l2.vaultRow, same })})`, l2);
    await clear();
    // ⚙ standing (a short title), the vault locked: the ⋯ plain — ⚙ wears the lock itself
    await dress({ title: 'Notes' }); await vault(true); await sleep(200); await settle();
    const b3 = await bar(), l3 = await evalJs(LOUD);
    ok(!b3.folded.includes('gear') && l3.gear.locked && l3.gear.mark?.svg && !l3.more.cls && !l3.more.mark, `⑨ ⚙ standing (a short title), locked: ⚙ wears the lock (${JSON.stringify(l3.gear.mark)}), the ⋯ plain (folded ${b3.folded.join(',') || '—'})`, { b3: say(b3), l3 });
    const g2g = await evalJs(MARKGEO);
    ok(!!g2g.gear && near(g2g.gear.dx, 18) && near(g2g.gear.dy, 18) && sz(g2g.gear) === '11×13.33' && g2g.gear.top >= g2g.navTop - 0.5, `⑨ G2 …⚙'s mark sits where the ⋯'s does — ${g2g.gear?.dx}/${g2g.gear?.dy} px from its cog's middle, ${sz(g2g.gear)}, inside the bar`, g2g);
    await shot('after-en-360-locked-gear.png');
    await longPress('#mobile-nav-new');
    const plus = await evalJs(`(() => { const m = document.querySelector('.context-menu.mobile-sheet'), nav = document.getElementById('mobile-nav').getBoundingClientRect(); return m ? { top: Math.round(m.getBoundingClientRect().top), navBottom: Math.round(nav.bottom) } : null; })()`);
    ok(!!plus && plus.navBottom > 48 && plus.top >= plus.navBottom, `⑨ the «+» sheet opens under the moved bar too (top ${plus?.top} ≥ ${plus?.navBottom})`, plus);
    await clear();
    await vault(false); await sleep(200); await settle();
  }

  // ── ⑨b ONE PLACE UNDER THE BAR (r4 G4 — the r3 acceptance: r3 placed _sheet's sheets only; the Desktops sheet and the Usage popup — the
  // ⋯ rows' own doors, the only road on a locked phone — and the Settings popover opened at the stylesheet's 48 px OVER the bar the
  // lock's strip had moved, and an open «+» sheet never followed): each surface opened from the bar or its ⋯ rows at 360 px, LOCKED
  // (the bar moved down), then an unlock and a re-lock while it stays open — its top under the bar's measured bottom every time.
  // CONTROL: r3's rules (the Desktops sheet's .mobile-sheet and the Usage popup at 48 !important) put back on the page are RED ──
  console.log('⑨b one place under the bar for every phone surface');
  const shut = () => evalJs(`(() => { document.querySelector('#vault-unlock-dialog .vault-later')?.click(); document.querySelectorAll('.global-settings-popover, .context-menu').forEach((x) => x.remove()); document.querySelectorAll('.usage-popup').forEach((x) => x.classList.add('hidden')); return true; })()`);
  const SURF = (sel) => `(() => { const s = document.querySelector(${JSON.stringify(sel)}), nav = document.getElementById('mobile-nav').getBoundingClientRect(); if (!s || !s.getClientRects().length) return null; return { top: Math.round(s.getBoundingClientRect().top), navBottom: Math.round(nav.bottom) }; })()`;
  const under = (g) => !!g && g.top >= g.navBottom && g.top <= g.navBottom + 8;
  const fromMore = (key) => async () => { await tap('#mobile-nav-overflow'); await sleep(300); await tap(`(document.querySelector('.mnav-more-menu .context-menu-item[data-key="${key}"]'))`); await sleep(400); };
  const SURFACES = [
    ['the «+» sheet', '.context-menu.mobile-sheet:not(.mnav-more-menu):not(.mdesk-menu)', async () => { await longPress('#mobile-nav-new'); await sleep(400); }], // a long press brings no click: its hold ends 600 ms after the lift
    ['the ⋯ menu', '.context-menu.mnav-more-menu', async () => { await tap('#mobile-nav-overflow'); await sleep(300); }],
    ['the Desktops sheet (⋯ → Desktops)', '.context-menu.mdesk-menu', fromMore('desktops')],
    ['the Usage popup (⋯ → Usage)', '#usage-popup:not(.hidden)', fromMore('usage')],
    // a locked ⚙ press opens the unlock dialog first (lane vault-locked-loud) — the popover itself, opened by its own function
    ['the Settings popover', '.global-settings-popover', async () => { await evalJs(`(app._showGlobalSettings(document.getElementById('mobile-nav-gear')), true)`); await sleep(300); }],
  ];
  await device(360, 780); await sleep(300); await dress({ title: OWNER }); await shut();
  await vault(true); await sleep(300); await settle();
  for (const [name, sel, open] of SURFACES) {
    await shut(); await settle();
    await open();
    const g1 = await evalJs(SURF(sel));
    await vault(false); await sleep(300); await settle();
    const g2 = await evalJs(SURF(sel));
    await vault(true); await sleep(300); await settle();
    const g3 = await evalJs(SURF(sel));
    ok(under(g1) && g1.navBottom > 48 && under(g2) && g2.navBottom < g1.navBottom && under(g3) && g3.navBottom === g1.navBottom,
      `⑨b ${name}: opened LOCKED under the moved bar (top ${g1?.top} / bar ${g1?.navBottom}); an unlock while open — it follows up (${g2?.top} / ${g2?.navBottom}); a re-lock — down again (${g3?.top} / ${g3?.navBottom})`, { g1, g2, g3 });
    if (name.startsWith('the Desktops') || name.startsWith('the Usage') || name.startsWith('the Settings')) await shot(`after-en-360-locked-${name.split(' ')[1].toLowerCase()}.png`);
  }
  await shut();
  await evalJs(`(() => { const st = document.createElement('style'); st.id = 'ptt-r3-top'; st.textContent = '.context-menu.mobile-sheet{top:48px !important} .usage-popup{top:48px !important}'; document.head.appendChild(st); return true; })()`);
  {
    const red = [];
    for (const [name, sel, open] of SURFACES.filter(([n]) => /Desktops|Usage/.test(n))) { await shut(); await open(); const g = await evalJs(SURF(sel)); red.push([name, g]); }
    ok(red.length === 2 && red.every(([, g]) => !!g && g.top < g.navBottom), `⑨b CONTROL — r3's rules on the page: ${red.map(([n, g]) => `${n} at ${g?.top} over the bar (bottom ${g?.navBottom})`).join('; ')} — RED`, red);
  }
  await evalJs(`(document.getElementById('ptt-r3-top')?.remove(), true)`);
  await shut(); await vault(false); await sleep(250); await settle();

  // ── ⑨c ONE ROOM UNDER THE BAR (r5 K1 — the r4 acceptance: every top followed the variable, every max-height still assumed 48 — under
  // the lock strip a TALL sheet ran ~102 px past the screen, html/body overflow:hidden, its tail unreachable; the Usage popup from the
  // ⋯ row took its inline room from its folded chip's ZERO rect) and the bar's own title switcher (r5 K2: placed once, at open — after
  // an unlock a 114 px gap): every surface with 40 rows — its bottom ≤ the screen − 12 px (the base's margin), its last row reached by
  // its own scroll, under the bar (the switcher flush) — in BOTH open orders, en and ja (the strip on three lines). CONTROLS: r4's
  // rooms put back on the page's own rules (the screen − 60 px, plain; the context menus none) RED by name; r4's switcher RED ──
  console.log('⑨c one room under the bar — every surface with tall content (r5 K1 / K2)');
  const ROOMGEO = (sel) => `(() => { const s = document.querySelector(${JSON.stringify(sel)}), nav = document.getElementById('mobile-nav').getBoundingClientRect();
    if (!s || !s.getClientRects().length) return null;
    let f = s.querySelector(':scope > .ptt-tall');
    if (!f) { f = document.createElement('div'); f.className = 'ptt-tall'; for (let i = 1; i <= 40; i++) { const r = document.createElement('div'); r.style.cssText = 'height:44px;line-height:44px;padding:0 12px'; r.textContent = 'row ' + i; f.appendChild(r); } s.appendChild(f); }
    s.scrollTop = s.scrollHeight;
    const b = s.getBoundingClientRect(), last = f.lastElementChild.getBoundingClientRect(), q = (n) => Math.round(n * 10) / 10;
    const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    return { top: q(b.top), bottom: q(b.bottom), vh: innerHeight, navBottom: q(nav.bottom), last: q(last.bottom), scrolls: s.scrollHeight > s.clientHeight + 1, inline: s.style.maxHeight || '', z }; })()`;
  const roomOk = (g, flush) => !!g && g.bottom <= g.vh - 12 + 0.5 && g.last <= g.bottom + 0.5 && g.scrolls && (flush ? Math.abs(g.top - g.navBottom) <= 1 : g.top >= g.navBottom - 0.5 && g.top <= g.navBottom + 8);
  const MINI = `(() => { document.querySelectorAll('.ut-mini-popover').forEach((x) => x.remove()); const p = document.createElement('div'); p.className = 'ut-mini-popover'; p.dataset.popover = '1'; p.style.position = 'fixed'; p.style.top = '0px'; p.style.left = '0px'; document.body.appendChild(p); return true; })()`;
  const MINI_NAME = 'the mini inbox (its rule — a stand-in .ut-mini-popover at an opener\'s inline top: a session window\'s chip opens it, this scene has none)';
  const ROOMS = [...SURFACES, [MINI_NAME, '.ut-mini-popover', () => evalJs(MINI)], ['the title switcher', '.mobile-win-switcher', async () => { await tap('#mobile-nav-title'); await sleep(400); }]];
  const SLUG = { 'the «+» sheet': 'plus', 'the ⋯ menu': 'more', 'the Desktops sheet (⋯ → Desktops)': 'desktops', 'the Usage popup (⋯ → Usage)': 'usage', 'the Settings popover': 'settings', [MINI_NAME]: 'mini', 'the title switcher': 'switcher' };
  const shutAll = async () => { await shut(); await evalJs(`(() => { document.querySelectorAll('.ut-mini-popover, .mobile-win-switcher').forEach((x) => (x._close ? x._close() : x.remove())); return true; })()`); };
  const lockedAt = {};
  const roomRun = async (lang) => {
    for (const [name, sel, open] of ROOMS) for (const lockedFirst of [true, false]) {
      await shutAll(); await vault(lockedFirst); await sleep(300); await settle();
      await open(); await sleep(150); await settle();
      const a = await evalJs(ROOMGEO(sel));
      if (lockedFirst && ['settings', 'plus', 'usage', 'switcher', 'more'].includes(SLUG[name]) && (lang === 'en' || SLUG[name] === 'plus' || SLUG[name] === 'settings')) await shot(`after-${lang}-360-locked-${SLUG[name]}-tall.png`);
      await vault(!lockedFirst); await sleep(300); await settle();
      const b = await evalJs(ROOMGEO(sel));
      if (lockedFirst && SLUG[name] === 'switcher' && lang === 'en') await shot('after-en-360-unlocked-switcher-follows.png');
      await vault(lockedFirst); await sleep(300); await settle();
      const c = await evalJs(ROOMGEO(sel));
      const flush = sel === '.mobile-win-switcher', L = lockedFirst ? [a, c] : [b], U = lockedFirst ? [b] : [a, c];
      if (lockedFirst && a) lockedAt[lang] = a.navBottom;
      ok([a, b, c].every((g) => roomOk(g, flush)) && L.every((g) => g.navBottom > 48) && U.every((g) => g.navBottom < 48),
        `⑨c ${lang} ${name}, opened ${lockedFirst ? 'LOCKED' : 'unlocked'}, 40 rows: ${lockedFirst ? 'locked → unlocked → re-locked' : 'unlocked → locked → unlocked'} — ${flush ? 'flush under' : 'under'} the bar (${[a, b, c].map((g) => g ? `${g.top}/${g.navBottom}` : '—').join(' · ')}), its bottom ${[a, b, c].map((g) => g?.bottom).join(' / ')} ≤ ${a?.vh} − 12, its last row reached by its own scroll`, { a, b, c });
    }
    await shutAll(); await vault(false); await sleep(250); await settle();
  };
  await device(360, 780); await sleep(300); await dress({ title: OWNER }); await shutAll();
  await roomRun('en');
  {
    // K1 — the Usage popup through the ⋯ row (its chip FOLDED): its inline room from the bar that holds the chip, never a zero rect
    await shutAll(); await vault(true); await sleep(300); await settle();
    await SURFACES.find(([n]) => n.startsWith('the Usage'))[2]();
    const u = await evalJs(ROOMGEO('#usage-popup:not(.hidden)'));
    ok(!!u && Math.abs(parseFloat(u.inline) * u.z - (u.vh - u.navBottom - 22)) <= 1.5, `⑨c K1 the Usage popup from the ⋯ row (its chip folded): its inline room ${u?.inline} = the screen − the bar's bottom − 22 (${u ? Math.round(u.vh - u.navBottom - 22) : '?'} px) — never the folded chip's zero rect (${u ? u.vh - 22 : '?'} px: r4)`, u);
    // CONTROL — r4's rooms on the page's own rules: the screen − 60 px, plain (the «+» / ⋯ / Desktops sheets: none, menuPlace's own)
    const R4ROOM = `(() => { const saved = window.__pttRoom = []; const walk = (rules) => { for (const r of rules) { if (r instanceof CSSStyleRule) { const v = r.style.getPropertyValue('max-height');
        if (v.includes('var(--phone-sheet-top) - 12px') && r.style.getPropertyPriority('max-height') === 'important' && !/mobile-win-switcher/.test(r.selectorText)) { saved.push([r, v]); if (/^\.context-menu\.mobile-sheet$/.test(r.selectorText)) r.style.removeProperty('max-height'); else r.style.setProperty('max-height', 'calc(calc(100dvh / var(--ui-scale, 1)) - 60px)'); } }
        if (r.cssRules) walk(r.cssRules); } }; for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } } return saved.map(([r]) => r.selectorText); })()`;
    const back = await evalJs(R4ROOM), over = [];
    for (const [name, sel, open] of ROOMS.filter(([, x]) => x !== '.mobile-win-switcher')) {
      await shutAll(); await vault(true); await sleep(250); await settle(); await open(); await sleep(150); await settle();
      const g = await evalJs(ROOMGEO(sel)); if (g && g.bottom > g.vh - 12 + 0.5) over.push([name, g]);
      if (SLUG[name] === 'settings') await shot('before-en-360-locked-settings-tall-r4.png');
    }
    await evalJs(`(() => { for (const [r, v] of window.__pttRoom || []) r.style.setProperty('max-height', v, 'important'); return true; })()`);
    // (the mini inbox is not among them on this screen: in r4 its phone room was dead — the base rule's 420 px, later in the sheet,
    // won — so it fit any screen taller than ~600 px; the Usage popup keeps r5's inline room from the bar: its control is
    // test-phone-titlebar's run of r4's anchorFixedPopup)
    const want = ['the «+» sheet', 'the ⋯ menu', 'the Desktops sheet (⋯ → Desktops)', 'the Settings popover'];
    ok(back.length >= 4 && want.every((k) => over.some(([n]) => n === k)), `⑨c CONTROL — r4's rooms put back on the page (${back.join(' · ')}): ${over.map(([n, g]) => `${n.split(' (')[0]} ends at ${g.bottom} > ${g.vh - 12}`).join('; ')} — RED by name`, over);
    // CONTROL — r4's switcher: no rule (placed once, at open, from the bar's bottom then)
    await shutAll(); await vault(true); await sleep(250); await settle();
    await evalJs(`(() => { const saved = window.__pttSw = []; const walk = (rules) => { for (const r of rules) { if (r instanceof CSSStyleRule && /mobile-win-switcher/.test(r.selectorText)) { saved.push([r, r.style.cssText]); r.style.cssText = ''; } if (r.cssRules) walk(r.cssRules); } }; for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { } } return saved.length; })()`);
    await tap('#mobile-nav-title'); await sleep(400);
    const s1 = await evalJs(ROOMGEO('.mobile-win-switcher'));
    await vault(false); await sleep(300); await settle();
    const s2 = await evalJs(ROOMGEO('.mobile-win-switcher'));
    await shot('before-en-360-unlocked-switcher-r4.png');
    await evalJs(`(() => { for (const [r, t] of window.__pttSw || []) r.style.cssText = t; return true; })()`);
    ok(!!s1 && !!s2 && Math.abs(s1.top - s1.navBottom) <= 1 && s2.top - s2.navBottom > 50, `⑨c K2 CONTROL — r4's switcher (no rule: placed once, at open): opened locked at ${s1?.top} (the bar's bottom ${s1?.navBottom}), after an unlock it stays at ${s2?.top} over the bar's ${s2?.navBottom} — a ${s2 ? Math.round(s2.top - s2.navBottom) : '?'} px gap — RED`, { s1, s2 });
    await shutAll(); await vault(false); await sleep(250); await settle();
  }
  // ja: the lock's strip on THREE lines (the bar lower still) — the same rule
  await device(360, 780); await load('ja'); await dress({ title: OWNER }); await shutAll();
  await roomRun('ja');
  ok(lockedAt.ja > lockedAt.en, `⑨c ja: the lock strip's three lines put the bar lower (its bottom ${lockedAt.ja} against en's ${lockedAt.en}) — every surface's room followed it`, lockedAt);
  await load('en');

  // ── ⑩ A PRESS ENDS ON ITS ROW (r3 F2): the ⋯ PATCHED by key, its rows held still under a press ──
  console.log('⑩ a press ends on the row it began on');
  await device(360, 780); await sleep(300); await dress({ title: OWNER }); await clear();
  // what a row's press RAN: ⚙'s door recorded (not opened), a chip's own click (the lock's unlock) by its id
  await evalJs(`(() => { window.__ran = []; window.__ranOn = true; app.__pgs = app._pressGlobalSettings; app._pressGlobalSettings = () => { window.__ran.push('settings'); };
    document.addEventListener('click', (e) => { const c = window.__ranOn && e.target && e.target.closest && e.target.closest('#mobile-nav > *'); if (c && c.id !== 'mobile-nav-overflow') window.__ran.push(c.id.replace('mobile-nav-', '')); }, true); return true; })()`);
  const KEYS = `[...document.querySelectorAll('.mnav-more-menu .context-menu-item')].map((e) => e.dataset.key).join(',')`;
  const rowAt = (key) => centre(`(document.querySelector('.mnav-more-menu .context-menu-item[data-key="${key}"]'))`);
  /** a press down at `p`, the fold changed by `mid` while it is down, then the lift — the row keys as they stood mid-press */
  const pressThrough = async (p, mouse, mid) => {
    if (mouse) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 }); }
    else await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    await sleep(30); await mid(); await sleep(150);
    const during = await evalJs(KEYS);
    if (mouse) await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    else await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(400);
    return during;
  };
  const closeAll = () => evalJs(`(() => { document.querySelector('#vault-unlock-dialog .vault-later')?.click(); document.querySelectorAll('.global-settings-popover, .context-menu').forEach((x) => x.remove()); document.querySelector('.usage-popup')?.classList.add('hidden'); return true; })()`); // the unlock dialog by its own 「稍后」
  for (const mouse of [false, true]) {
    const how = mouse ? 'a mouse' : 'a finger';
    await device(360, 780, { mouse }); await sleep(500); await settle(); await closeAll();
    // a row INSERTED above: [desktops, usage, gear] — another client's lock lands mid-press
    await press('#mobile-nav-overflow', mouse); await sleep(200);
    const k0 = await evalJs(KEYS), p0 = await rowAt('gear');
    await evalJs('window.__ran = []; true');
    const mid0 = await pressThrough(p0, mouse, () => vault(true));
    const ran0 = await evalJs('window.__ran.slice()');
    ok(k0 === 'desktops,usage,gear' && mid0 === k0 && ran0.join() === 'settings', `⑩ ${how}: a press down on «Settings», another client's lock lands mid-press (the rows held: ${mid0}), the lift ⇒ ${ran0.join(',') || 'nothing'} ran — Settings, never the «Vault locked» row inserted above it`, { k0, mid0, ran0 });
    await closeAll(); await sleep(200); await settle();
    // a row REMOVED above: [desktops, usage, vault, gear] — an unlock lands mid-press
    await press('#mobile-nav-overflow', mouse); await sleep(200);
    const k1 = await evalJs(KEYS), p1 = await rowAt('gear');
    await evalJs('window.__ran = []; true');
    const mid1 = await pressThrough(p1, mouse, () => vault(false));
    const ran1 = await evalJs('window.__ran.slice()');
    ok(k1 === 'desktops,usage,vault,gear' && mid1 === k1 && ran1.join() === 'settings', `⑩ ${how}: …an unlock removes «Vault locked» above it mid-press (held: ${mid1}), the lift ⇒ ${ran1.join(',') || 'nothing'} ran — Settings`, { k1, mid1, ran1 });
    await closeAll(); await sleep(200); await settle();
  }
  // THE MENU IS PATCHED, NOT REBUILT: six fold changes with it open — the same node, the staying rows the same nodes, listeners flat
  await device(360, 780); await sleep(500); await settle(); await closeAll();
  await tap('#mobile-nav-overflow'); await sleep(250);
  const keys0 = await evalJs(`(() => { window.__m0 = document.querySelector('.mnav-more-menu'); window.__r0 = Object.fromEntries([...window.__m0.children].map((e) => [e.dataset.key, e])); return Object.keys(window.__r0).join(','); })()`);
  const listeners = async (expr, depth) => { const o = (await cdp('Runtime.evaluate', { expression: expr })).result?.result; if (!o?.objectId) return -1; const r = await cdp('DOMDebugger.getEventListeners', { objectId: o.objectId, depth }); return r.result?.listeners ? r.result.listeners.length : -1; };
  // the menu's whole subtree (its own + every row's), and the window's and the document's OWN listeners (a press guard would sit there)
  const count = async () => ({ menu: await listeners(`document.querySelector('.mnav-more-menu')`, -1), page: (await listeners('window', 0)) + (await listeners('document', 0)) });
  const c0 = await count(), cs = [];
  for (let i = 0; i < 6; i++) { await vault(i % 2 === 0); await sleep(200); await settle(); cs.push(await count()); }
  const after = await evalJs(`(() => { const m = document.querySelector('.mnav-more-menu'); return { same: m === window.__m0, keys: m ? [...m.children].map((e) => e.dataset.key).join(',') : '', rows: !!m && Object.entries(window.__r0).every(([k, e]) => m.querySelector(':scope > [data-key="' + k + '"]') === e) }; })()`);
  ok(after.same && after.rows && after.keys === keys0 && [1, 3, 5].every((i) => cs[i].menu === c0.menu) && cs[0].menu === cs[2].menu && cs[2].menu === cs[4].menu && c0.menu > 0 && c0.page > 0 && cs[5].page === c0.page,
    `⑩ six fold changes (lock / unlock ×3) with the ⋯ open: the SAME menu node, the staying rows the same nodes (${after.keys}), its listeners flat (menu ${c0.menu} → ${cs.map((c) => c.menu).join(' / ')}; page ${c0.page} → ${cs[5].page})`, { after, c0, cs });
  await closeAll(); await sleep(200); await settle();
  // a fold change that leaves the bar where it stands (the ring coming back — no strip): it inserts «Usage» above «Settings» mid-press,
  // first on this tree, then with r2's road put back on the page — the CONTROL (a lock's strip now moves a rebuilt menu down with
  // the bar, so the lock no longer lands a row under the finger on r2's road)
  const ringBack = async () => {
    await evalJs(`(() => { const c = document.getElementById('mobile-nav-usage'); c.classList.add('hidden'); c.innerHTML = ''; return true; })()`);
    await sleep(200); await settle(); await closeAll();
    await tap('#mobile-nav-overflow'); await sleep(250);
    const k = await evalJs(KEYS), p = await rowAt('gear');
    await evalJs('window.__ran = []; true');
    const mid = await pressThrough(p, false, () => setRing(37));
    return { k, mid, ran: await evalJs('window.__ran.slice()') };
  };
  const rA = await ringBack();
  ok(rA.k === 'desktops,gear' && rA.mid === rA.k && rA.ran.join() === 'settings', `⑩ a finger: …the ring coming back mid-press inserts «Usage» above «Settings» (the rows held: ${rA.mid}) ⇒ ${rA.ran.join(',') || 'nothing'} ran — Settings`, rA);
  await closeAll(); await sleep(200); await settle();
  // CONTROL — r2's road put back on the page: the fit RE-OPENS the menu on a fold change (showContextMenu: a new menu, new rows), no hold
  await evalJs(`(() => { const nav = app._mobileNav, P = Object.getPrototypeOf(nav); nav._syncMore = function () { if (this.__r2) return P._syncMore.call(this); this.__r2 = true; try { this._moreMenu?.remove(); this._moreMenu = null; P._openMore.call(this); } finally { this.__r2 = false; } };
    nav._fitBar = function () { const h = this._held; this._held = false; try { return P._fitBar.call(this); } finally { this._held = h; } }; return true; })()`); // r4: the hold lives at the fit — r2 held nothing there
  {
    const rC = await ringBack();
    ok(rC.k === 'desktops,gear' && rC.ran.includes('usage') && !rC.ran.includes('settings'), `⑩ CONTROL: r2's road (the menu re-opened under the finger) ⇒ the same lift ran ${rC.ran.join(',') || 'nothing'} — the «Usage» row that moved under it (RED, as the acceptance drove it with a lock)`, rC);
  }
  await evalJs(`(() => { delete app._mobileNav._syncMore; delete app._mobileNav._fitBar; return true; })()`);
  await closeAll(); await vault(false); await sleep(200); await settle();

  // ── ⑩ G3 (r4 — the r3 acceptance: only the menu's own lift / click / cancel ended r3's hold; a MOUSE released off the menu — no implicit
  // capture — left it on for the menu's life: rows stale, the menu never following the bar; and a press on the ⋯ itself was not held:
  // another client's rename slid ⚙ under a finger on ⋯ and the lift ran Settings). A hold never outlives its press ──
  console.log('⑩ G3 a hold never outlives its press');
  const MENU_AT = `(() => { const m = document.querySelector('.mnav-more-menu'), nav = document.getElementById('mobile-nav').getBoundingClientRect(); return { keys: ${KEYS}, top: m ? Math.round(m.getBoundingClientRect().top) : null, navBottom: Math.round(nav.bottom), held: !!app._mobileNav._held }; })()`;
  /** a MOUSE pressed on «Settings», dragged off the menu and released there; then another client's lock */
  const dragOff = async () => {
    await device(360, 780, { mouse: true }); await sleep(500); await settle(); await closeAll();
    await press('#mobile-nav-overflow', true); await sleep(250);
    const k = await evalJs(KEYS), p = await rowAt('gear'); await evalJs('window.__ran = []; true');
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 5; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y + i * 90, button: 'left', buttons: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y + 450, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(200);
    const lifted = await evalJs(MENU_AT);
    await vault(true); await sleep(400); await settle();
    return { k, lifted, after: await evalJs(MENU_AT), ran: await evalJs('window.__ran.slice()') };
  };
  {
    const d = await dragOff();
    ok(d.k === 'desktops,usage,gear' && !d.lifted.held && d.after.keys === 'desktops,usage,vault,gear' && d.after.navBottom > 48 && d.after.top >= d.after.navBottom && !d.ran.length,
      `⑩ G3 a mouse pressed on «Settings», released OFF the menu: the hold ends at that lift (held ${d.lifted.held}); a lock after it ⇒ the «Vault locked» row appears (${d.after.keys}) and the menu follows the bar (top ${d.after.top} / bar ${d.after.navBottom}); nothing ran`, d);
    await closeAll(); await vault(false); await sleep(250); await settle();
    // CONTROL — r3's menu-only lift: the document never hears a lift off the menu (a window capture listener swallows it)
    await evalJs(`(() => { window.__r3lift = (e) => { if (!e.target?.closest?.('.mnav-more-menu')) e.stopImmediatePropagation(); }; window.addEventListener('pointerup', window.__r3lift, true); return true; })()`);
    const r = await dragOff();
    await evalJs(`(() => { window.removeEventListener('pointerup', window.__r3lift, true); window.dispatchEvent(new Event('blur')); return true; })()`); // the stuck hold's own end: the page's blur
    ok(r.lifted.held && r.after.keys === 'desktops,usage,gear' && !(r.after.top >= r.after.navBottom), `⑩ G3 CONTROL — r3's menu-only lift: the hold outlives the press (held ${r.lifted.held}), the rows stale after the lock (${r.after.keys}), the menu over the moved bar (top ${r.after.top} / bar ${r.after.navBottom}) — RED`, r);
    await closeAll(); await vault(false); await sleep(250); await settle();
  }
  {
    // a finger's press CANCELLED (touchcancel) mid-change: the rows catch up at the cancel, the menu follows, nothing runs
    await device(360, 780); await sleep(500); await settle(); await closeAll();
    await tap('#mobile-nav-overflow'); await sleep(250);
    const k = await evalJs(KEYS), p = await rowAt('gear'); await evalJs('window.__ran = []; true');
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] }); await sleep(40);
    await vault(true); await sleep(250);
    const mid = await evalJs(MENU_AT);
    await cdp('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await sleep(300); await settle();
    const after = await evalJs(MENU_AT), ran = await evalJs('window.__ran.slice()');
    ok(k === 'desktops,usage,gear' && mid.held && mid.keys === k && !after.held && after.keys === 'desktops,usage,vault,gear' && after.top >= after.navBottom && after.navBottom > 48 && !ran.length,
      `⑩ G3 a finger's press cancelled (touchcancel) after a lock landed: held until then (${mid.keys}), then the rows catch up (${after.keys}) and the menu follows (top ${after.top} / bar ${after.navBottom}); nothing ran`, { k, mid, after, ran });
    await closeAll(); await vault(false); await sleep(250); await settle();
  }
  {
    // a press on the ⋯ ITSELF while another client renames the title (440 px: the fold empties — ⚙ would slide under the finger)
    const onMore = async () => {
      await device(440, 900); await sleep(400); await dress({ title: OWNER }); await closeAll();
      const b = await bar(), p = await centre('#mobile-nav-overflow');
      await evalJs(`(() => { window.__ran = []; window.__opened = 0; const nav = app._mobileNav, P = Object.getPrototypeOf(nav); nav._openMore = function () { window.__opened++; return P._openMore.call(this); }; return true; })()`);
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] }); await sleep(40);
      await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'files'); app.wm.setTitle(w.id, '游'); app._updateMobileNavTitle(); return true; })()`);
      await sleep(250);
      const under = await evalJs(`(() => { const h = document.elementFromPoint(${p.x}, ${p.y}); return h ? (h.closest('#mobile-nav > *')?.id || h.tagName) : null; })()`);
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(800); await settle();
      const after = await bar();
      await evalJs(`(() => { delete app._mobileNav._openMore; return true; })()`);
      return { before: b.folded.join(','), under, ran: await evalJs('window.__ran.slice()'), opened: await evalJs('window.__opened'), after: after.folded.join(',') || '—', menu: await evalJs(`!!document.querySelector('.mnav-more-menu')`), whole: after.title.whole };
    };
    const m = await onMore();
    ok(m.before.length > 0 && m.under === 'mobile-nav-overflow' && m.opened === 1 && !m.ran.includes('settings') && !m.ran.includes('gear') && m.after === '—' && !m.menu && m.whole,
      `⑩ G3 a finger on the ⋯ while another client's rename empties the fold (folded ${m.before} → ${m.after}): the ⋯ stays under it until the lift (${m.under}), the lift is the ⋯'s press (its menu opened ${m.opened}×, then closed by the catch-up: nothing left to list) — never ⚙ (ran ${m.ran.join(',') || 'nothing'})`, m);
    // CONTROL — r3's bar (no hold at the fit): the rename refits mid-press, ⚙ slides under the finger, the lift runs Settings
    await evalJs(`(() => { const nav = app._mobileNav, P = Object.getPrototypeOf(nav); nav._fitBar = function () { const h = this._held; this._held = false; try { return P._fitBar.call(this); } finally { this._held = h; } }; return true; })()`);
    const r = await onMore();
    await evalJs(`(() => { delete app._mobileNav._fitBar; return true; })()`);
    ok(r.ran.includes('settings') && r.under !== 'mobile-nav-overflow', `⑩ G3 CONTROL — r3's bar (the fit not held): ${r.under} slid under the finger and the lift ran ${r.ran.join(',') || 'nothing'} — RED`, r);
    await closeAll();
  }
  await evalJs(`(() => { app._pressGlobalSettings = app.__pgs; window.__ranOn = false; return true; })()`);
  await closeAll(); await vault(false); await sleep(200); await settle();

  // ── ③ THE SHAPES (en) ──
  console.log('③ the shapes');
  await device(430, 900); await sleep(300);
  await dress({ title: '游戏' });
  {
    const b = await bar(); console.log(`    430 px, a 2-character title: ${say(b)}`);
    ok(!b.folded.length && b.badges.length === 5 && !b.ctl.some((c) => c.id === 'overflow'), `a 2-character title at 430 px: everything fits, nothing folds (${ids(b)}; badges ${b.badges.map((x) => x.n).join('/')})`, say(b));
    ok(b.title.whole, `…the whole title shows (${b.title.w} ≥ ${b.title.fullW}, exactly)`, say(b));
    await shot('after-en-430-two-chars.png');
  }
  await device(360, 780); await sleep(400); await settle();
  {
    const b = await bar();
    judgeBar(b, '360 px, a 2-character title', { wantOne: false });
    ok(b.title.whole, `…the whole 2-character title shows (${b.title.w} ≥ ${b.title.fullW}, exactly)`, say(b));
  }
  await dress({ title: LATIN40 });
  { const b = await bar(); judgeBar(b, '360 px, a 42-character Latin title', { wantFolded: ['desktops', 'usage', 'gear'] }); await shot('after-en-360-latin.png'); }
  await dress({ title: 'Notes' });
  { const b = await bar(); judgeBar(b, '360 px, a one-word title', { wantOne: false }); ok(b.title.whole, `…the whole word shows (${b.title.w} ≥ ${b.title.fullW}, exactly)`, say(b)); }
  // ── ⑤ THE TIERS ──
  console.log('⑤ the tiers');
  await dress({ title: OWNER });
  await device(780, 360); await sleep(600); await settle();
  {
    const b = await bar(); console.log(`    landscape: ${say(b)}`);
    ok(b.vc === 'regular' && !b.folded.length && !b.ctl.some((c) => c.id === 'overflow') && b.badges.length === 5 && b.badges.every((x) => !x.c.includes('mnav-one')), `a rotation to landscape (the regular class): no fold, no ⋯, the five badges (${b.vc}; ${ids(b)}; ${b.badges.map((x) => x.n).join('/')})`, say(b));
    await shot('after-en-landscape.png');
  }
  await device(360, 780); await sleep(600); await settle();
  { const b = await bar(); judgeBar(b, 'back to portrait', { wantFolded: ['desktops', 'usage', 'gear'] }); }
  await device(700, 1000); await sleep(600); await settle();
  {
    const b = await bar(); console.log(`    tablet portrait: ${say(b)}`);
    ok(b.vc === 'regular' && !b.folded.length && !b.ctl.some((c) => c.id === 'overflow') && b.badges.every((x) => !x.c.includes('mnav-one')), `a tablet in portrait (the regular class): its own bar — no fold, no ⋯, no one-badge form (${b.dir}; ${ids(b)})`, say(b));
    await shot('after-en-tablet.png');
  }
  // ── ④ THE + ROAD ──
  console.log('④ the + road (LAW 3)');
  await device(360, 780); await sleep(600); await settle();
  await evalJs(`(() => { for (const id of [...app.wm.windows.keys()]) app.wm.requestClose(id); return true; })()`); await sleep(500);
  ok(await evalJs(`!document.getElementById('mobile-nav-files') || document.getElementById('mobile-nav-files').getClientRects().length === 0`), 'the compact bar draws no #mobile-nav-files');
  // the sheet's 文件 row by its word (r3: with an explorer open a hint line rides under it)
  const FILES_ROW = `([...document.querySelectorAll('.context-menu.mobile-sheet .context-menu-item')].find((el) => [...el.querySelectorAll('span')].some((s) => !s.children.length && s.textContent.trim() === 'Files')))`;
  const filesHint = () => evalJs(`(() => { const r = ${FILES_ROW}; return r ? (r.querySelector('.mnav-sheet-hint')?.textContent || '') : null; })()`);
  await longPress('#mobile-nav-new');
  const sheet = await evalJs(`[...document.querySelectorAll('.context-menu.mobile-sheet .context-menu-item')].map((el) => el.textContent.trim())`);
  ok(sheet.includes('Files'), `a real long-press on «+» opens the sheet listing Files (${sheet.join(' · ')})`, sheet);
  const hint0 = await filesHint();
  ok(hint0 === '', `F4 — no explorer open: the 文件 row is the word alone — its one act opens one at home (hint «${hint0}»)`, hint0);
  await shot('after-en-360-plus-menu.png');
  await tap(FILES_ROW);
  ok(await waitFor(`app.wm.windows.get(app.wm.activeWindowId)?.type === 'files'`, 8000), 'its Files row opens the explorer');
  await waitFor(`[...app.wm.windows.values()].some((w) => w.type === 'files' && w.element.querySelectorAll('.file-item').length > 0)`, 8000); await sleep(400);
  await evalJs(`app.phoneHome?.show?.(); true`); await sleep(300);
  await longPress('#mobile-nav-new');
  const hint1 = await filesHint();
  ok(hint1 === 'Back to ~', `G1 — with the home's explorer open the 文件 row SAYS its one act by the FOLDER's name: «${hint1}» (the explorer's own breadcrumb for the home, never its path — a second explorer is that explorer's «Open in new window»)`, hint1);
  await tap(FILES_ROW);
  ok(await waitFor(`app.wm.windows.get(app.wm.activeWindowId)?.type === 'files'`, 8000) && await evalJs(`[...app.wm.windows.values()].filter((w) => w.type === 'files').length === 1`),
    'a second time reveals the same explorer — the files door\'s press (never a second explorer)', await evalJs(`[...app.wm.windows.values()].map((w) => w.type).join(',')`));

  // ── ④ G1 (r4 — the r3 acceptance: the hint was the window's title, a path front-cut to 40 whose END the line then cut — «Back to
  // …e/userW/workspace/AIWorkspace/vib…»): the hint NAMES THE FOLDER, measured where it renders — every character of the name inside the
  // hint's box at 360 / 320 px in zh / en / ja for a 43-character path; a name too long for any line loses its START (its end shown);
  // the sentence's own words never cut (ja's «に戻る» after the name). CONTROL: r3's hint on the same row is RED ──
  console.log('④ G1 the hint names the folder');
  const H = hintDir = scratch('ptt-hint'); fs.mkdirSync(H, { recursive: true });
  const pad = 43 - (H.length + '/'.length + '/vibespace'.length);
  const deep = pad >= 1 ? path.join(H, 'workspace-and-projects'.slice(0, pad), 'vibespace') : path.join(H, 'vibespace');
  const longLeaf = path.join(H, 'a-folder-whose-name-alone-is-longer-than-any-phone-line-can-hold-at-all');
  const notes = path.join(H, 'notes');
  for (const d of [deep, longLeaf, notes]) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'a.txt'), 'a\n'); }
  console.log(`    the folder: ${deep} (${deep.length} characters)`);
  const explorerAt = async (dir, { close = true } = {}) => {
    if (close) { await evalJs(`(() => { for (const id of [...app.wm.windows.keys()]) app.wm.requestClose(id); return true; })()`); await sleep(400); }
    await evalJs(`(() => !!app.openFileExplorer(${JSON.stringify(dir)}))()`);
    await waitFor(`[...app.wm.windows.values()].some((w) => w.type === 'files' && w._explorer?.currentPath === ${JSON.stringify(dir)} && w.element.querySelectorAll('.file-item').length > 0)`, 10000); await sleep(300);
    return evalJs(`[...app.wm.windows.values()].find((w) => w.type === 'files' && w._explorer?.currentPath === ${JSON.stringify(dir)})?.id || null`);
  };
  // the hint as it RENDERS: each character of the name (or, for r3's markup, of the whole line) against the box that clips it
  const HINTGEO = `(() => { const h = document.querySelector('.context-menu.mobile-sheet .mnav-sheet-hint'); if (!h) return null; // the 文件 row's own line (its word is the language's)
    const name = h.querySelector('.mnav-sheet-name'), clip = (name || h).getBoundingClientRect();
    const walk = document.createTreeWalker(name || h, NodeFilter.SHOW_TEXT); const t = walk.nextNode();
    const chars = []; if (t) for (let i = 0; i < t.length; i++) { const rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + 1); const b = rg.getBoundingClientRect(); chars.push([b.left - clip.left, b.right - clip.left]); }
    const hb = h.getBoundingClientRect();
    const said = [...h.querySelectorAll('.mnav-sheet-said')].map((s) => { const b = s.getBoundingClientRect(); return { text: s.textContent, whole: s.scrollWidth <= s.clientWidth + 0.5 && b.left >= hb.left - 0.5 && b.right <= hb.right + 0.5 }; });
    return { text: h.textContent, node: t ? t.textContent : '', chars, clipW: clip.width, cut: (name || h).scrollWidth > (name || h).clientWidth + 0.5, said }; })()`;
  const tailIn = (g, n) => !!g && g.chars.length >= n && g.chars.slice(-n).every(([l, r]) => l >= -0.5 && r <= g.clipW + 0.5);
  const headIn = (g) => !!g && g.chars.length > 0 && g.chars[0][0] >= -0.5;
  const WORDS = { en: (n) => `Back to ${n}`, zh: (n) => `回到 ${n}`, ja: (n) => `${n} に戻る` };
  for (const lang of ['zh', 'en', 'ja']) {
    await device(360, 780); await load(lang); await explorerAt(deep);
    await evalJs(`app.phoneHome?.show?.(); true`); await sleep(300);
    for (const vw of [360, 320]) {
      await device(vw, 780); await sleep(300); await settle(); await clear();
      await longPress('#mobile-nav-new');
      const g = await evalJs(HINTGEO);
      ok(!!g && g.text === WORDS[lang]('vibespace') && g.node === 'vibespace' && tailIn(g, 9) && headIn(g) && !g.cut && g.said.every((x) => x.whole),
        `G1 ${lang} ${vw} px, a ${deep.length}-character path: the hint reads «${g?.text}» — the folder WHOLE where it renders (${g ? g.chars.length : 0} characters inside its ${g ? Math.round(g.clipW) : 0} px box), the sentence's words whole`, g);
      if (vw === 360 && lang !== 'zh') await shot(`after-${lang}-360-plus-files-hint.png`);
      if (lang === 'en' && vw === 360) {
        // CONTROL — r3's hint on this very row: the window's title (a front-cut path) under r3's end-ellipsis rule
        const r3 = await evalJs(`(() => { const h = document.querySelector('.context-menu.mobile-sheet .mnav-sheet-hint'); const w = [...app.wm.windows.values()].find((x) => x.type === 'files'); h.textContent = 'Back to ' + w.title; h.style.cssText = 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0'; return w.title; })()`);
        const g3 = await evalJs(HINTGEO);
        ok(!!g3 && !tailIn(g3, 9) && g3.cut, `G1 CONTROL — r3's hint on the same row, «Back to ${r3}»: the folder's name is CUT where it renders (its last 9 characters outside the ${g3 ? Math.round(g3.clipW) : 0} px box) — RED`, g3);
      }
      await clear();
    }
    if (lang !== 'zh') {
      // a name too long for any line: its START goes («…»), its end — the part a person knows — stays; the sentence's words whole
      await device(360, 780); await sleep(300); await explorerAt(longLeaf);
      await evalJs(`app.phoneHome?.show?.(); true`); await sleep(300); await clear();
      await longPress('#mobile-nav-new');
      const g = await evalJs(HINTGEO), leaf = path.basename(longLeaf);
      ok(!!g && g.node === leaf && g.cut && tailIn(g, 12) && !headIn(g) && g.said.every((x) => x.whole), `G1 ${lang} 360 px, a ${leaf.length}-character folder name: cut at its START — its last characters inside the box, its first outside — the sentence's words whole (${g?.said.map((x) => '«' + x.text.trim() + '»').join(' ')})`, g);
      await shot(`after-${lang}-360-plus-files-long.png`);
      await clear();
    }
  }
  // ── ④ K3 (r5 — the r4 acceptance: a long Hebrew / Arabic name lost its END; r4's rtl box cut an LTR name's start only): the START
  // in READING order, whichever way the name runs — the part read LAST stays, as the explorer's own title keeps a path's end. A
  // 63-character Arabic and a 57-character Hebrew folder at 320 ja and 360 en: the FIRST character (in reading order) outside the box,
  // the last 12 inside, the sentence's words whole. CONTROL: r4's box on the same row (the name's direction off its box) RED ──
  console.log('④ K3 a long right-to-left name loses its START in reading order');
  const rtlAr = path.join(H, '\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0631\u0628\u0639 \u0627\u0644\u062B\u0627\u0644\u062B \u0644\u0641\u0631\u064A\u0642 \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A \u0648\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A \u0644\u0644\u0645\u0634\u0631\u0648\u0639'), rtlHe = path.join(H, '\u05D3\u05D5\u05D7\u05D5\u05EA \u05D4\u05E8\u05D1\u05E2\u05D5\u05DF \u05D4\u05E9\u05DC\u05D9\u05E9\u05D9 \u05E9\u05DC \u05E6\u05D5\u05D5\u05EA \u05D4\u05EA\u05E4\u05E2\u05D5\u05DC \u05D5\u05D4\u05EA\u05DB\u05E0\u05D5\u05DF \u05D4\u05D0\u05E1\u05D8\u05E8\u05D8\u05D2\u05D9 \u05DC\u05E4\u05E8\u05D5\u05D9');
  for (const d of [rtlAr, rtlHe]) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'a.txt'), 'a\n'); }
  const firstIn = (g) => !!g && g.chars.length > 0 && g.chars[0][0] >= -0.5 && g.chars[0][1] <= g.clipW + 0.5;
  const inside = (g) => (g ? g.chars.filter(([l, r]) => l >= -0.5 && r <= g.clipW + 0.5).length : 0);
  for (const [lang, vw] of [['ja', 320], ['en', 360]]) {
    await device(360, 780); await load(lang);
    for (const [what, dir] of [['Arabic', rtlAr], ['Hebrew', rtlHe]]) {
      await explorerAt(dir); await evalJs(`app.phoneHome?.show?.(); true`); await sleep(300);
      await device(vw, 780); await sleep(300); await settle(); await clear();
      await longPress('#mobile-nav-new');
      const g = await evalJs(HINTGEO), leaf = path.basename(dir);
      ok(!!g && g.node === leaf && g.cut && tailIn(g, 12) && !firstIn(g) && g.said.every((x) => x.whole), `K3 ${lang} ${vw} px, a ${leaf.length}-character ${what} folder: cut where it BEGINS in reading order — its first character outside the box, its last 12 inside (${inside(g)}/${leaf.length} inside), the sentence's words whole`, g && { ...g, chars: g.chars.length });
      if (what === 'Arabic' && lang === 'ja') {
        await shot('after-ja-320-plus-files-rtl.png');
        // CONTROL — r4's box on the same row: the name's direction taken off its box (r4's one rtl box over every name)
        await evalJs(`(document.querySelector('.context-menu.mobile-sheet .mnav-sheet-name')?.removeAttribute('data-dir'), true)`); await settle();
        const g4 = await evalJs(HINTGEO);
        ok(!!g4 && firstIn(g4) && !tailIn(g4, 12), `K3 CONTROL — r4's box on the same row: the Arabic name's FIRST character inside, its last outside (${inside(g4)}/${leaf.length} inside — its END cut) — RED`, g4 && { ...g4, chars: g4.chars.length });
        await shot('before-ja-320-plus-files-rtl-r4.png');
      }
      await clear(); await device(360, 780); await sleep(200);
    }
  }
  // WHICH explorer it names (en, 360): two open ⇒ the one shown LAST; the only one on another desktop / minimized / a tab group's guest
  // ⇒ still named, and the row's press BRINGS it (driven by a real tap)
  await device(360, 780); await load('en');
  const hintNow = async () => { await clear(); await evalJs(`app.phoneHome?.show?.(); true`); await sleep(250); await longPress('#mobile-nav-new'); return filesHint(); };
  const pressRow = async () => { await tap(FILES_ROW); await sleep(600); };
  {
    const a = await explorerAt(deep), b = await explorerAt(notes, { close: false });
    const h1 = await hintNow(); await clear();
    await evalJs(`app.goToWinId(${JSON.stringify(a)}); true`); await sleep(400);
    const h2 = await hintNow();
    await pressRow();
    const shownA = await evalJs(`app.wm.activeWindowId === ${JSON.stringify(a)}`);
    ok(!!a && !!b && h1 === 'Back to notes' && h2 === 'Back to vibespace' && shownA, `G1 two explorers: the hint names the one shown LAST («${h1}», then after showing the other «${h2}») and the row brings THAT one`, { h1, h2, shownA });
  }
  {
    // the explorer on the desktop on show, then a FRESH desktop to stand on (a desktop with a record replays its own windows when
    // switched to — the home explorer this suite opened there — and one on the desktop on show is named first, rightly)
    const a = await explorerAt(deep), home = await evalJs(`app.desktopManager.activeDesktopId`);
    const fresh = await evalJs(`app.desktopManager.createDesktop()`);
    await evalJs(`app._mobileNav.switchDesktop(${JSON.stringify(fresh)}).then(() => true)`); await sleep(800);
    const away = await evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(a)}); return !!w && !!w._hiddenByDesktop && app.desktopManager.activeDesktopId === ${JSON.stringify(fresh)} && [...app.wm.windows.values()].filter((x) => x.type === 'files').length === 1; })()`);
    const h = await hintNow();
    await pressRow();
    const back = await waitFor(`app.desktopManager.activeDesktopId === ${JSON.stringify(home)} && app.wm.activeWindowId === ${JSON.stringify(a)}`, 5000);
    ok(away && h === 'Back to vibespace' && back, `G1 the ONLY explorer is on another desktop: still named («${h}»), and the press switches to its desktop and shows it (r3: none named — the row opened a second explorer at home)`, { away, h, back });
  }
  {
    const a = await explorerAt(deep);
    await evalJs(`(app.wm.minimize(${JSON.stringify(a)}), true)`); await sleep(400);
    const min = await evalJs(`!!app.wm.windows.get(${JSON.stringify(a)})?.isMinimized`);
    const h = await hintNow();
    await pressRow();
    const back = await waitFor(`!app.wm.windows.get(${JSON.stringify(a)})?.isMinimized && app.wm.activeWindowId === ${JSON.stringify(a)}`, 5000);
    ok(min && h === 'Back to vibespace' && back, `G1 the only explorer MINIMIZED: still named («${h}»), and the press restores it`, { min, h, back });
  }
  {
    const a = await explorerAt(deep);
    await evalJs(`(() => !!app.openFile(${JSON.stringify(path.join(deep, 'a.txt'))}, 'a.txt'))()`);
    await waitFor(`[...app.wm.windows.values()].some((w) => w.type !== 'files')`, 8000); await sleep(400);
    const grouped = await evalJs(`(() => { const host = [...app.wm.windows.values()].find((w) => w.type !== 'files'), ex = app.wm.windows.get(${JSON.stringify(a)}); app.wm.createTabChain(host, ex, { show: false }); return !!ex._tabChain && ex._tabChain.tabs[0] === host.id && ex._tabChain.tabs[ex._tabChain.active] === host.id && ex.content.classList.contains('tab-hidden'); })()`);
    await sleep(300);
    const h = await hintNow();
    await pressRow();
    const back = await waitFor(`(() => { const ex = app.wm.windows.get(${JSON.stringify(a)}); return !!ex && !!ex._tabChain && ex._tabChain.tabs[ex._tabChain.active] === ex.id && !ex.content.classList.contains('tab-hidden'); })()`, 5000);
    ok(grouped && h === 'Back to vibespace' && back, `G1 the only explorer a tab group's hidden GUEST: still named («${h}»), and the press shows its tab`, { grouped, h, back });
  }
  await clear();

  // ── the last shape: no badges (every open item resolved through the owner's batch route) ──
  {
    const idsOpen = await resolveAll();
    await dress({ title: OWNER });
    const b = await bar();
    judgeBar(b, '360 px, no badges', { wantOne: false });
    ok(b.badges.length === 0, `no badges: none drawn (${b.badges.length}; ${idsOpen.length} items resolved)`, b.badges);
  }

  await r6Legs(); // ⑪ ⑫ — the attention list is empty from here on

  await device(1280, 900, { mouse: true }); await load(null);
  {
    const d = await evalJs(`(() => { const nav = document.getElementById('mobile-nav'); const tb = document.getElementById('toolbar'), task = document.getElementById('taskbar');
      return { navShown: nav.getClientRects().length > 0, overflow: !!document.getElementById('mobile-nav-overflow'), folded: document.querySelectorAll('#mobile-nav .bar-folded').length, mobileNav: !!app._mobileNav,
        tb: tb ? tb.outerHTML.length : 0, task: task ? task.outerHTML.length : 0, toolbarHtml: tb ? tb.outerHTML : '', taskClasses: task ? [...task.querySelectorAll('[id]')].map((e) => e.id).join(',') : '' }; })()`);
    const h = crypto.createHash('sha256').update(d.toolbarHtml).digest('hex').slice(0, 16);
    console.log(`    the desktop chrome: #toolbar ${d.tb} B (sha256 ${h}), #taskbar ${d.task} B, ids ${d.taskClasses.slice(0, 200)}`);
    ok(!d.navShown && !d.overflow && !d.folded && !d.mobileNav, `a desktop page (1280, a mouse): no phone nav built, no ⋯, nothing folded (nav shown ${d.navShown}, ⋯ ${d.overflow})`, d);
    await shot('after-desktop.png');
  }
  ok(pageErrors.length === 0, `the page threw nothing (${pageErrors.length})`, pageErrors.slice(0, 3));
  try { sock.close(); } catch { }
})().catch((e) => { fail++; console.error('  ✗ the suite threw: ' + (e && e.stack || e)); });

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass} passed, ${fail} failed, ${skipped} skipped)`);
cleanup();
process.exit(fail ? 1 : 0);
