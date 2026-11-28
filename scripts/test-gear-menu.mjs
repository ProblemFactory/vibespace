#!/usr/bin/env node
// ⚙ MENU HIERARCHY smoke (2.369.124, docs/design-gear-menu-hierarchy.md §2d):
// the ONE renderer in both of its modes, driven the way a person drives it.
//   DESKTOP (1280×800, a mouse): ⚙ opens the popover in FLYOUT mode with the
//   five heads + direct rows inside the top-level budget; hovering Tools
//   opens its flyout only after the 120 ms intent delay (measured on the
//   PAGE's clock — node polls until-style, never a fixed sleep against the
//   timer), to the LEFT of the head and fully on screen; hovering another
//   head swaps it (one at a time); ArrowDown ×5 (×6 with the top-level Apps… row) from the first row lands on
//   System, ArrowLeft opens it with focus on its first member, ArrowDown, Enter runs a STUBBED
//   _openDiagnostics and closes the popover; Esc closes ONE layer (the
//   flyout, focus back on its head) and the next Esc the popover; an outside
//   mousedown closes it; a click inside the Appearance panel changes
//   termFontSize, KEEPS the popover open and the head's LIVE caption follows
//   it at once; Language ▸ nests a second-level
//   flyout whose Esc leaves the Appearance panel open.
//   PHONE (390×844, CDP touch emulation ⇒ hover:none, no mouse move dispatched):
//   the mobile ⚙ opens the SAME menu in ACCORDION mode, a tap expands a
//   head's members inline, every visible row is ≥ 44 px tall, another tap
//   swaps / collapses, the Appearance panel renders inline, a tap on a
//   member runs a stubbed openUsage and closes the popover.
//   INTEGRATIONS… UNDER SYSTEM ▸ (lane integrations-menu-home, owner 2026-10-13): Communication no longer holds it;
//   System holds it between Backup & migrate… and the password; a click opens THE window with its cards grouped
//   by what uses the key (the registry's groupOf, read off the registry) — Communication holds the SETUP CARDS (lane
//   oauth-setup-instructions: one per account type whose row declares a `redirect` its user registers), every card in
//   a group (a CONTROL: a card moved outside every group is RED); the phone reaches it under System, grouped the same;
//   a zh pass takes the owner's PNGs (⚙ → 系统 ▸ 集成与密钥…, the 通讯 / 浏览器 / 插件 heads, the phone).
//   THE VAULT'S ONE ROW (lane vault-one-door, owner 2026-10-19 「这个没必要分成两个按钮吧」): the System rows read off the
//   SOURCE hold ONE vault row, 「Vault…」 (a MUTANT tree with the old second row Vault contents… is RED — runs before the
//   chrome, so no SKIP hides it); in the page System ▸ shows that one row (zh 「保险库…」) and a click opens the Vault WINDOW.
// Throwaway server in a git worktree (scripts/scratch.mjs paths + ports —
// never a fixed name, never the repo's data/) + headless chrome over raw CDP.
// Run: node scripts/test-gear-menu.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, CHROME_STORE, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';
import { waitPageTarget } from './cdp-page-target.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const REG = require('../src/integration-registry.js'); // the window's expected groups (lane integrations-menu-home) — read off the registry, not typed
// The Harnesses group's expected rows (lane mirror-330-reds — the .330 mirror red: a hand list of three missed the fourth
// harness, Antigravity CLI): every REGISTERED harness that declares a settings table, by its section title, in the nav's own
// order rule (orderedCategories — the declared group order, then any late-registered one). Read off the registry, not typed.
const HARNESSES = require('../src/harnesses');
const { orderedCategories } = await import('../src/lib/settings-schema.js');
// B-82b8: a built-in table's category is a person's word — it lives in src/harness-settings-words.js; read through the join (a
// contributed harness's table keeps its words inline and comes back as it is)
const { withWords } = require('../src/harness-settings-words.js');
const HARNESS_ROWS = orderedCategories(HARNESSES.list().filter((h) => h.settings).map((h) => withWords(h.settings).category));

// ── THE VAULT'S ONE ROW, read off the source (lane vault-one-door) ──
/** Every `registerMenuItem({ … })` STATEMENT's text in `src` (a call that starts its line — a comment that names the call is
 *  never one; balanced parens, strings and line comments skipped). */
function menuCalls(src) {
  const out = []; let at = 0; const re = /^[ \t]*registerMenuItem\(/gm;
  for (;;) {
    re.lastIndex = at; const hit = re.exec(src); if (!hit) return out;
    const i = src.indexOf('registerMenuItem(', hit.index);
    let j = i + 'registerMenuItem('.length, depth = 1, q = null;
    for (; j < src.length && depth; j++) {
      const c = src[j];
      if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '/' && src[j + 1] === '/') j = src.indexOf('\n', j);
      else if (c === '(') depth++; else if (c === ')') depth--;
    }
    out.push(src.slice(i, j)); at = j;
  }
}
/** The ⚙ System rows of a tree: [{file, label}] — the English key of each labelled row. */
function systemRows(files) {
  const rows = [];
  for (const { file, src } of files) for (const call of menuCalls(src)) {
    if (!/parent:\s*'system'/.test(call) || /separator:\s*true/.test(call)) continue;
    const m = call.match(/label:\s*\([^)]*\)\s*=>\s*(?:t|tr)\('([^']+)'\)/);
    rows.push({ file, label: m ? m[1] : '?' });
  }
  return rows;
}
/** null = ONE vault row, 「Vault…」; else the reason (the rows found). */
let censusFailed = 0;   // the source census's reds (the chrome legs count theirs in `failed`)
const vaultRowVerdict = (rows) => { const v = rows.filter((r) => /^Vault/.test(r.label)); return v.length === 1 && v[0].label === 'Vault…' ? null : `the vault rows: ${JSON.stringify(v)}`; };
{
  const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.js$/.test(e.name) && !/^i18n-/.test(e.name) ? [path.join(d, e.name)] : []));
  const files = walk(SRC).map((f) => ({ file: path.relative(SRC, f), src: fs.readFileSync(f, 'utf8') })).filter((x) => x.src.includes('registerMenuItem('));
  const rows = systemRows(files);
  const nOk = (c, n) => { if (c) console.log(`  ✓ ${n}`); else { console.error(`  ✗ ${n}`); censusFailed++; } };
  console.log('gear-menu — the vault\'s one row (source census, lane vault-one-door)');
  nOk(rows.length >= 8 && rows.some((r) => r.label === 'Integrations…') && rows.some((r) => r.label === 'Report a problem…'), `the census reads the System rows (${rows.length}: ${rows.map((r) => r.label).join(' / ')})`);
  const v = vaultRowVerdict(rows);
  nOk(!v && rows.find((r) => r.label === 'Vault…').file === 'lib/vault-window.js', `ONE vault row, 「Vault…」, registered by the Vault window's module${v ? ' — ' + v : ''}`);
  const OLD_ROW = "\nregisterMenuItem({\n  menu: 'gear', parent: 'system', order: 63, icon: UI_ICONS.lock,\n  label: () => t('Vault contents…'),\n  run: (c) => openVaultWindow(c.app),\n});\n";
  const mutant = files.map((x) => (x.file === 'lib/vault-window.js' ? { ...x, src: x.src + OLD_ROW } : x));
  nOk(!!vaultRowVerdict(systemRows(mutant)), `MUTANT (the old second row, Vault contents…, back beside Vault…) ⇒ RED: ${vaultRowVerdict(systemRows(mutant))}`);
}

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(censusFailed ? 1 : 0); }

const [PORT, CDP_PORT] = await freePorts(2);
const root = mintRoot('gear-menu-smoke'), wt = path.join(root, 't');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // rule nine (hub-boot.mjs): the suite's own browser carries a HOME in the root, so the helper ends it before the root goes
const PROFILE = scratch('gear-menu-chrome');
let failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// until-style polling (verifier r2): a fixed sleep from node raced the page's
// own 120 ms timer on a starved lane — poll the page (up to 2 s) and let the
// PAGE's clock carry every timing assertion
let untilJs = null; // set once the CDP evaluator exists
const until = async (expr, { timeout = 2000, step = 25 } = {}) => { const t0 = Date.now(); for (;;) { const v = await untilJs(expr); if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };

// ── throwaway server in a worktree (overlays the gate's ALREADY-BUILT public/) ──
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

fs.mkdirSync(path.join(root, 'home'), { recursive: true }); // the hub's HOME lies in its root (hub-boot.mjs)
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', HOME: path.join(root, 'home') } });
// A REAL MOUSE for the desktop leg (measured 2026-09-21): headless linux
// chrome has no pointing device and answers `(hover: none)` / `(pointer:
// none)` — exactly the switch the renderer reads, so without this the
// "desktop" leg rendered the accordion. Emulation.setEmulatedMedia cannot
// set hover/pointer (its `features` cover only the prefers-* family); the
// blink settings can, and CDP touch emulation on top of them flips the page
// back to hover:none + pointer:coarse for the phone leg (probed both ways).
const REAL_MOUSE = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, `--headless=new`, `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800', REAL_MOUSE,
  '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

await hub.ready();

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
target = await waitPageTarget(CDP_PORT, { polls: 40, everyMs: 250, child: chrome }); // B-fcae: the one waiter (a miss always waits)
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
untilJs = evalJs;
const URL = `http://127.0.0.1:${PORT}/`;
const POLL_APP = 'new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })';
const VK = { ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27, Home: 36, End: 35 };
const key = async (k) => {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: VK[k] });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: VK[k] });
  await sleep(80);
};
const center = async (sel) => {
  const r = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!r) throw new Error('no element ' + sel);
  return r;
};
const hover = async (sel) => { const c = await center(sel); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y }); };
const click = async (sel) => {
  const c = await center(sel);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(150);
};
const tap = async (sel) => {
  const c = await center(sel);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
};
const POP = '.global-settings-popover';
// the Integrations window's cards (a registry row's; lane oauth-setup-instructions: a setup card) and THE GROUPING JUDGE
// (the desktop leg, its CONTROLS and the zh phone): every card is a child of a group, and every group stands over a card
const CARD = '.integ-card, .integ-setup-card';
const GROUPED = `(() => { const b = document.querySelector('.integ-win .integ-body'); return !!b && [...b.querySelectorAll('${CARD}')].every((c) => c.parentElement.matches('.integ-group')) && [...b.querySelectorAll('.integ-group')].every((s) => [...s.children].some((c) => c.matches('${CARD}'))); })()`;
// screenshots for the mandatory human look (test-ui-scale's habit): kept in
// their own scratch dir, NOT removed by cleanup, swept by the gate's reaper
const SHOTS = process.env.VS_UI_SHOTS_DIR || scratch('gear-menu-shots'); // VS_UI_SHOTS_DIR keeps them (a scratch dir is removed at exit)
fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); };
const isOpen = (id) => `(() => { const h = document.querySelector('${POP} .gs-menu-item[data-id="${id}"]'); if (!h) return false; const s = h.querySelector(':scope > .gs-flyout') || h.nextElementSibling; return !!s && s.classList.contains('open') && h.getAttribute('aria-expanded') === 'true'; })()`;
const openGear = async () => {
  await evalJs(`document.querySelector('${POP}')?.remove(); document.getElementById('btn-global-settings').click(); true`);
  await sleep(250);
  return evalJs(`!!document.querySelector('${POP} .gs-menu')`);
};

try {
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: URL });
  await sleep(1500);
  await evalJs(POLL_APP);
  await sleep(600);

  // ══ DESKTOP ══
  console.log('gear-menu — desktop 1280×800 (flyout mode)');
  const opened = await openGear();
  const facts = await evalJs(`({ isMobile: app.isMobile, hoverNone: matchMedia('(hover: none)').matches, w: innerWidth, cls: document.querySelector('${POP} .gs-menu')?.className })`);
  check(`⚙ opens the popover in FLYOUT mode (${JSON.stringify(facts)})`, gateOf(opened) && verdictOf(/\bgs-fly\b/.test(facts.cls || '')));
  const top = await evalJs(`[...document.querySelectorAll('${POP} .gs-menu > .gs-menu-item')].map((r) => r.dataset.id || r.textContent.trim())`);
  check(`top level stays inside the budget (${top.length} rows ≤ 9: ${top.join(' / ')})`, top.length >= 6 && top.length <= 9);
  check('the five heads are present, in order, marked as menu heads', verdictOf(await evalJs(`(() => { const ids = [...document.querySelectorAll('${POP} .gs-menu > .gs-menu-item.has-sub')].map((r) => r.dataset.id); return JSON.stringify(ids) === JSON.stringify(['appearance','tools','comm','system','help']) && ids.every((id) => { const el = document.querySelector('${POP} .gs-menu-item[data-id="' + id + '"]'); return el.getAttribute('role') === 'menuitem' && el.getAttribute('aria-haspopup') === 'true' && el.getAttribute('aria-expanded') === 'false'; }); })()`)));
  check('Manage agents is a direct row right under Appearance', verdictOf(await evalJs(`(() => { const rows = [...document.querySelectorAll('${POP} .gs-menu > .gs-menu-item')]; return rows[0].dataset.id === 'appearance' && /Manage agents/.test(rows[1].textContent) && !rows[1].classList.contains('has-sub'); })()`)));
  check('no quick-pref control sits at the top level any more (they are the Appearance panel)', verdictOf(await evalJs(`!document.querySelector('${POP} > label, ${POP} > select, ${POP} > .settings-all-link')`)));
  check('roving tabindex: exactly one row is tabbable and it holds focus', verdictOf(await evalJs(`[...document.querySelectorAll('${POP} .gs-menu-item')].filter((r) => r.tabIndex === 0).length === 1 && document.activeElement?.classList.contains('gs-menu-item')`)));
  check('every flyout is closed until asked', verdictOf(await evalJs(`!document.querySelector('${POP} .gs-flyout.open')`)));

  // hover intent — measured on the PAGE's clock: a test-installed mouseenter
  // listener stamps the entry, a MutationObserver stamps the aria-expanded
  // flip; node only polls for the flip (up to 2 s) and never sleeps a fixed
  // interval against the 120 ms timer (verifier r2)
  await evalJs(`(() => { const h = document.querySelector('${POP} .gs-menu > .gs-menu-item[data-id="tools"]'); window.__hi = { enter: 0, open: 0 }; h.addEventListener('mouseenter', () => { if (!window.__hi.enter) window.__hi.enter = performance.now(); }); new MutationObserver(() => { if (h.getAttribute('aria-expanded') === 'true' && !window.__hi.open) window.__hi.open = performance.now(); }).observe(h, { attributes: true, attributeFilter: ['aria-expanded'] }); return true; })()`);
  await hover(`${POP} .gs-menu > .gs-menu-item[data-id="tools"]`);
  check('the Tools flyout opens within 2 s of the pointer landing on it (polled, not slept)', !!(await until(isOpen('tools'))));
  const hi = await evalJs('window.__hi');
  check(`…and no earlier than the hover intent, on the page's own clock (mouseenter → aria-expanded ${Math.round(hi.open - hi.enter)} ms, expected ≥ 100)`, hi.enter > 0 && hi.open > 0 && hi.open - hi.enter >= 100 && hi.open - hi.enter <= 2000);
  const fly = await evalJs(`(() => { const h = document.querySelector('${POP} [data-id="tools"]'); const s = h.querySelector('.gs-flyout'); const r = s.getBoundingClientRect(); const hr = h.getBoundingClientRect(); return { open: s.classList.contains('open'), l: r.left, t: r.top, rgt: r.right, b: r.bottom, w: r.width, vw: innerWidth, vh: innerHeight, headLeft: hr.left, popover: s.dataset.popover, role: s.getAttribute('role'), rows: [...s.querySelectorAll('.gs-menu-item')].map((x) => x.textContent.trim()) }; })()`);
  check('…and open after it', verdictOf(fly.open));
  check(`the flyout is fully on screen (l ${Math.round(fly.l)} t ${Math.round(fly.t)} r ${Math.round(fly.rgt)}/${fly.vw} b ${Math.round(fly.b)}/${fly.vh})`, fly.w > 0 && fly.l >= 0 && fly.t >= 0 && fly.rgt <= fly.vw && fly.b <= fly.vh);
  check('…opens to the LEFT of its head (the popover is right-anchored)', fly.rgt <= fly.headLeft + 2);
  check('…carries data-popover + role=menu (a child popover for the outside-click rule)', fly.popover === '1' && fly.role === 'menu');
  await shot('desktop-tools-flyout.png');
  check(`Tools holds Usage / Background Work / Plugins (${fly.rows.join(' / ')})`, gateOf(fly.rows.some((r) => /Usage/.test(r))) && gateOf(fly.rows.some((r) => /Background Work/.test(r))) && verdictOf(fly.rows.some((r) => /Plugins/.test(r))));
  await hover(`${POP} .gs-menu > .gs-menu-item[data-id="comm"]`);
  const commOpen = !!(await until(isOpen('comm')));
  check('hovering Communication swaps the open flyout (one per level at a time)', gateOf(commOpen) && !(await evalJs(isOpen('tools'))));
  const commRows = await evalJs(`[...document.querySelectorAll('${POP} [data-id="comm"] .gs-flyout .gs-menu-item')].map((x) => x.textContent.trim())`);
  // lane integrations-menu-home (owner 2026-10-13): Integrations… left Communication for System ▸ — the window holds browser and plugin keys too
  check(`Communication holds For you / Channels / Outbox and no Integrations… (${commRows.join(' / ')})`, gateOf(commRows.some((r) => /For you/.test(r))) && gateOf(commRows.some((r) => /Channels/.test(r))) && gateOf(commRows.some((r) => /Outbox/.test(r))) && !commRows.some((r) => /Integrations/.test(r)));

  // keyboard
  await evalJs(`document.querySelector('${POP} .gs-menu > .gs-menu-item[data-id="appearance"]').focus(); true`);
  // design 009 §B6: "Apps…" is a TOP-LEVEL row between All Settings and Tools whenever the desktop-apps probe found a backend
  const downs = 5 + (await evalJs(`!!app._desktopAppsAvailable`) ? 1 : 0);
  for (let i = 0; i < downs; i++) await key('ArrowDown'); // Manage agents → All Settings (2.369.131) → [Apps…] → Tools → Communication → System
  check(`ArrowDown ×${downs} from Appearance lands on System (Manage agents → All Settings → ${downs === 6 ? 'Apps… → ' : ''}Tools → Communication → System)`, verdictOf(await evalJs(`document.activeElement?.dataset?.id === 'system'`)));
  await key('ArrowLeft');
  check('ArrowLeft opens the System flyout, swaps out the hover-opened one, focus on its first member (Report a problem…)', gateOf(await evalJs(isOpen('system'))) && !(await evalJs(isOpen('comm'))) && verdictOf(await evalJs(`/Report a problem/.test(document.activeElement?.textContent || '')`)));
  await key('ArrowDown');
  check('ArrowDown inside the flyout moves to Diagnostics report…', verdictOf(await evalJs(`/Diagnostics report/.test(document.activeElement?.textContent || '') && document.activeElement.closest('.gs-flyout') !== null`)));
  await evalJs(`window.__diag = 0; app._openDiagnostics = () => { window.__diag++; }; true`);
  await key('Enter');
  await sleep(150);
  check('Enter runs the row action (stubbed _openDiagnostics once) and closes the popover', verdictOf(await evalJs(`window.__diag === 1 && !document.querySelector('${POP}')`)));

  // Esc layers. The pointer is PARKED off the menu first: the hover legs left
  // the real mouse over the Communication head, and a stationary pointer over
  // a re-rendered head can re-arm hover intent on a slower machine (the
  // Actions mirror failed exactly these two legs on 2.369.125 while the local
  // heavy tier passed them) — the leg is about KEYS, so no pointer may sit on
  // a head. Every assert also prints the live state so a mirror red explains
  // itself (what is open, where focus is, whether the popover survived).
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 450 });
  await sleep(250);
  const escState = () => evalJs(`(() => { const a = document.activeElement; return JSON.stringify({ pop: !!document.querySelector('${POP}'), open: [...document.querySelectorAll('${POP} .gs-flyout.open, ${POP} .gs-sub.open')].map((s) => s.parentElement?.classList?.contains('gs-menu-item') ? s.parentElement.dataset.id : (s.previousElementSibling?.dataset?.id || '?')), active: a ? (a.tagName + (a.dataset?.id ? '#' + a.dataset.id : '') + '.' + (a.className || '').toString().split(' ')[0]) : null, body: a === document.body, floats: document.querySelectorAll('[data-popover]').length }); })()`);
  await openGear();
  await evalJs(`document.querySelector('${POP} .gs-menu > .gs-menu-item[data-id="appearance"]').focus(); true`);
  for (let i = 0; i < downs; i++) await key('ArrowDown'); // Manage agents → All Settings (2.369.131) → [Apps…] → Tools → Communication → System
  await key('ArrowLeft');
  check(`(setup) System flyout open by keyboard (${await escState()})`, verdictOf(await evalJs(isOpen('system'))));
  await shot('esc-0-before.png');
  await key('Escape');
  const esc1 = await escState();
  await shot('esc-1-after-first.png');
  check(`Esc closes ONLY the flyout — the popover stays and focus returns to the System head (${esc1})`, gateOf(await evalJs(`!!document.querySelector('${POP}')`)) && !(await evalJs(isOpen('system'))) && verdictOf(await evalJs(`document.activeElement?.dataset?.id === 'system'`)), esc1);
  await key('Escape');
  const esc2 = await escState();
  await shot('esc-2-after-second.png');
  check(`the next Esc closes the popover (app.js\'s global [data-popover] handler) (${esc2})`, !(await evalJs(`!!document.querySelector('${POP}')`)), esc2);

  // outside mousedown
  await openGear();
  await hover(`${POP} .gs-menu > .gs-menu-item[data-id="tools"]`);
  check('(setup) popover + Tools flyout open', !!(await until(isOpen('tools'))));
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500, y: 450 });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 450, button: 'left', buttons: 1, clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 450, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(200);
  check('an outside mousedown closes the popover (flyout included)', !(await evalJs(`!!document.querySelector('${POP}')`)));

  // Appearance panel keeps the popover open
  await openGear();
  await click(`${POP} .gs-menu > .gs-menu-item[data-id="appearance"]`);
  const ap = await evalJs(`(() => { const s = document.querySelector('${POP} [data-id="appearance"] .gs-flyout'); const r = s.getBoundingClientRect(); return { open: s.classList.contains('open'), labels: [...s.querySelectorAll('label')].map((l) => l.textContent), hasLang: !!s.querySelector('.gs-menu-item[data-id="language"]'), hasAll: !!s.querySelector('.settings-all-link'), caption: document.querySelector('${POP} [data-id="appearance"] .gs-head-caption')?.textContent, onScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
  check(`click opens the Appearance PANEL flyout: five quick-pref controls (${ap.labels.join(' / ')}) + Language ▸ — and NO All Settings link (2.369.131: it is a direct ⚙ row)`, gateOf(ap.open) && ap.labels.length === 5 && gateOf(ap.hasLang) && !ap.hasAll);
  check('All Settings… is a direct top-level row right after Manage agents…', verdictOf(await evalJs(`(() => { const rows = [...document.querySelectorAll('${POP} .gs-menu > .gs-menu-item')]; const i = rows.findIndex((r) => /Manage agents/.test(r.textContent)); return i >= 0 && rows[i + 1] && rows[i + 1].dataset.id === 'all-settings'; })()`)));
  check(`the Appearance head shows a live caption "${ap.caption}"`, gateOf(/px/.test(ap.caption || '')) && verdictOf(/%/.test(ap.caption || '')));
  check('the panel flyout is fully on screen', verdictOf(ap.onScreen));
  await click(`${POP} .gs-menu > .gs-menu-item[data-id="appearance"]`);
  check('a second click on the head does NOT toggle it closed (open only, the tap-emulation lesson)', verdictOf(await evalJs(isOpen('appearance'))));
  const before = await evalJs(`app._fontSize`);
  // THE TERMINAL FONT SIZE'S STEPS, FOUND BY THEIR ROLE (checkpoint 61's hosted red: the plain-words chain drew the three size rows'
  // steps as the same − / + — src/lib/appearance-panel.js — and the glyph find 'A+' came back empty and THREW): the row is the one
  // whose OWN label (its previous sibling) names the terminal font size and whose value IS app._fontSize; its decrease is the button
  // before the value, its increase the one after. A find that comes back empty is a NAMED red, never a throw.
  const SIZE_STEPS = (labelText) => `(() => { const panel = document.querySelector('${POP} [data-id="appearance"] .gs-flyout'); if (!panel) return { why: 'no Appearance panel' };
    const rows = [...panel.querySelectorAll('.font-size-ctrl')];
    const row = rows.find((r) => r.previousElementSibling && r.previousElementSibling.tagName === 'LABEL' && r.previousElementSibling.textContent.trim() === ${JSON.stringify(labelText)});
    if (!row) return { why: 'no size row under the label ' + ${JSON.stringify(JSON.stringify(labelText))}, labels: rows.map((r) => r.previousElementSibling && r.previousElementSibling.textContent) };
    const val = row.querySelector(':scope > span'), down = val && val.previousElementSibling, up = val && val.nextElementSibling;
    if (!val || !down || !up || down.tagName !== 'BUTTON' || up.tagName !== 'BUTTON') return { why: 'the row is not [decrease, value, increase]' };
    if (String(val.textContent).trim() !== String(app._fontSize)) return { why: 'its value «' + val.textContent.trim() + '» is not the terminal font size ' + app._fontSize };
    for (const b of document.querySelectorAll('#gs-smoke-size-down, #gs-smoke-size-up')) b.removeAttribute('id');
    down.id = 'gs-smoke-size-down'; up.id = 'gs-smoke-size-up'; return { ok: true, rows: rows.length }; })()`;
  const steps = await evalJs(SIZE_STEPS('Terminal font size'));
  check(`the terminal font size's steps found by their ROLE — the row its own label names, its value the live size ${before} (${steps.ok ? steps.rows + ' size rows on the panel' : steps.why})`, !!steps.ok, JSON.stringify(steps));
  // the live caption (verifier r2): the head's caption follows a change made inside its own panel at once — before, it kept its
  // build-time string
  const capSel = `document.querySelector('${POP} [data-id="appearance"] .gs-head-caption')?.textContent`;
  if (steps.ok) {
    await click('#gs-smoke-size-up');
    check(`a click on the terminal font size's increase changes termFontSize by exactly one (${before} → ${before + 1}) and KEEPS the popover + panel open`, gateOf(await evalJs(`app._fontSize === ${before + 1} && localStorage.getItem('termFontSize') === '${before + 1}' && !!document.querySelector('${POP}')`)) && verdictOf(await evalJs(isOpen('appearance'))));
    const capAfter = await evalJs(capSel);
    check(`the Appearance head's caption follows the change made in its own panel ("${ap.caption}" → "${capAfter}")`, gateOf(new RegExp('(^|\\D)' + (before + 1) + 'px(\\D|$)').test(capAfter || '')) && capAfter !== ap.caption);
    await click('#gs-smoke-size-down');
    check('(restore) the terminal font size\'s decrease puts the size back', verdictOf(await evalJs(`app._fontSize === ${before}`)));
    check(`…and the caption back to "${ap.caption}"`, (await evalJs(capSel)) === ap.caption);
  }
  // CONTROLS — the finder can fail: pointed at ANOTHER size row (the UI font size: the same − / + glyphs) the role check refuses it;
  // the base's glyph find ('A+') on this page comes back EMPTY — said by name here (on the hosted runner it threw)
  const other = await evalJs(SIZE_STEPS('UI font size'));
  check(`CONTROL: the finder pointed at another size row (UI font size, the same glyphs) is refused by the role check (${other.why})`, !other.ok && verdictOf(/is not the terminal font size/.test(other.why || '')), JSON.stringify(other));
  const glyph = await evalJs(`[...document.querySelectorAll('${POP} [data-id="appearance"] .gs-flyout .font-size-ctrl button')].some((b) => b.textContent === 'A+') ? 'found' : 'empty'`);
  check(`CONTROL: the base's glyph find ('A+') on this page comes back ${glyph} — the row's role, not a glyph, is what finds the step`, glyph === 'empty', glyph);
  // Language ▸ — the nested head
  await click(`${POP} [data-id="language"]`);
  const lang = await evalJs(`(() => { const s = document.querySelector('${POP} [data-id="language"] .gs-flyout'); const rows = [...s.querySelectorAll('.gs-menu-item')]; const r = s.getBoundingClientRect(); return { open: s.classList.contains('open'), n: rows.length, checked: rows.filter((x) => x.getAttribute('aria-checked') === 'true').map((x) => x.textContent.trim()), parentOpen: document.querySelector('${POP} [data-id="appearance"] .gs-flyout').classList.contains('open'), onScreen: r.left >= 0 && r.right <= innerWidth }; })()`);
  check(`Language ▸ (a nested head) opens a second-level flyout with four choices, exactly one checked (${lang.checked.join(',')}), the Appearance panel still open`, gateOf(lang.open) && lang.n === 4 && lang.checked.length === 1 && gateOf(lang.parentOpen) && verdictOf(lang.onScreen));
  await shot('desktop-appearance-language.png');
  await evalJs(`document.querySelector('${POP} [data-id="language"]').focus(); true`);
  await key('Escape');
  check('Esc closes the nested flyout first; the Appearance panel and the popover stay', !(await evalJs(isOpen('language'))) && gateOf(await evalJs(isOpen('appearance'))) && verdictOf(await evalJs(`!!document.querySelector('${POP}')`)));
  await evalJs(`document.querySelector('${POP}')?.remove(); true`);

  // ── lane integrations-menu-home: Integrations… sits under System ▸ between Backup & migrate… and the password (keys
  //    beside the password), and the row opens THE window with its cards grouped by what uses the key ──
  await openGear();
  await hover(`${POP} .gs-menu > .gs-menu-item[data-id="system"]`);
  check('(setup) the System flyout opens on hover', !!(await until(isOpen('system'))));
  const sysRows = await evalJs(`[...document.querySelectorAll('${POP} [data-id="system"] .gs-flyout .gs-menu-item')].map((x) => x.textContent.trim())`);
  const iInteg = sysRows.indexOf('Integrations…');
  check(`System holds Integrations… right after Backup & migrate… and right before the password row (${sysRows.join(' / ')})`, iInteg > 0 && sysRows[iInteg - 1] === 'Backup & migrate…' && verdictOf(/password/.test(sysRows[iInteg + 1] || '')));
  check('…wearing the key icon (an SVG, like its neighbours)', verdictOf(await evalJs(`(() => { const r = [...document.querySelectorAll('${POP} [data-id="system"] .gs-flyout .gs-menu-item')].find((x) => x.textContent.trim() === 'Integrations…'); return !!(r && r.querySelector('svg')); })()`)));
  await shot('desktop-system-integrations.png');
  await evalJs(`[...document.querySelectorAll('${POP} [data-id="system"] .gs-flyout .gs-menu-item')].find((x) => x.textContent.trim() === 'Integrations…').id = 'gs-smoke-integ'; true`);
  await click('#gs-smoke-integ');
  check('a click on System ▸ Integrations… closes the popover', !(await evalJs(`!!document.querySelector('${POP}')`)));
  // lane oauth-setup-instructions (the owner 2026-10-23: a self-hoster sees which app to create and the exact redirect
  // URIs): a group holds first the SETUP CARD of each row in it that declares a `redirect` its user registers (registry
  // order; never a self-registering row's — Dropline's own card says so), then its rows' cards. Today no communication
  // row is a card (an account picks its own client) — Communication holds the Lark / Gmail / Slack setup cards.
  const setupOf = (g) => REG.ROWS.filter((r) => r.redirect && !r.redirect.selfRegisters && REG.groupOf(r) === g).map((r) => 'setup:' + r.id);
  const groupsWant = (() => { const by = []; for (const g of [...REG.GROUPS]) { const ids = [...setupOf(g), ...REG.ROWS.filter((r) => !r.bindsPerAccount && REG.groupOf(r) === g).map((r) => r.id)]; if (ids.length) by.push({ g, head: REG.GROUP_WORDS[g], ids }); } return by; })();
  const nCards = groupsWant.reduce((n, x) => n + x.ids.length, 0);
  await until(`document.querySelectorAll('.integ-win .integ-card, .integ-win .integ-setup-card').length >= ${nCards}`, { timeout: 10000, step: 100 });
  const groupsGot = await evalJs(`[...document.querySelectorAll('.integ-win .integ-body > .integ-group')].map((s) => ({ g: s.dataset.group, head: s.querySelector(':scope > .integ-group-head')?.textContent, ids: [...s.children].filter((c) => c.matches('${CARD}')).map((c) => c.dataset.integ || 'setup:' + c.dataset.integSetup) }))`);
  check(`…and opens THE window with its cards in groups, in order, by what uses the key (${groupsGot.map((x) => x.head + ': ' + x.ids.join(',')).join(' | ')})`, JSON.stringify(groupsGot) === JSON.stringify(groupsWant), JSON.stringify(groupsWant));
  check(`no card sits outside a group, and no head stands over nothing — Communication holds the ${setupOf('communication').length} setup cards (${setupOf('communication').join(', ')})`, setupOf('communication').length > 0 && verdictOf(await evalJs(GROUPED)), groupsGot);
  const ctlOut = await evalJs(`(() => { const c = document.querySelector('.integ-win .integ-setup-card'); if (!c) return null; const home = c.parentElement, next = c.nextSibling; c.closest('.integ-body').appendChild(c); const v = ${GROUPED}; home.insertBefore(c, next); return v; })()`);
  const ctlBare = await evalJs(`(() => { const s = document.createElement('div'); s.className = 'integ-group'; document.querySelector('.integ-win .integ-body').appendChild(s); const v = ${GROUPED}; s.remove(); return v; })()`);
  check('CONTROL: a setup card moved outside every group is RED on the same judge, and so is a head over nothing — both put back, green again', ctlOut === false && ctlBare === false && verdictOf(await evalJs(GROUPED)), { ctlOut, ctlBare });
  check('the window is still the one singleton', verdictOf(await evalJs(`[...app.wm.windows.values()].filter((w) => w.type === 'integrations').length === 1`)));
  await shot('desktop-integrations-window.png');
  await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'integrations') app.wm.closeWindow(w.id); true`);

  // ── lane vault-one-door: System ▸ holds ONE vault row, 「Vault…」, and it opens the Vault WINDOW (no dialog) ──
  await openGear();
  await hover(`${POP} .gs-menu > .gs-menu-item[data-id="system"]`);
  check('(setup) the System flyout opens on hover again', !!(await until(isOpen('system'))));
  const vRows = (await evalJs(`[...document.querySelectorAll('${POP} [data-id="system"] .gs-flyout .gs-menu-item')].map((x) => x.textContent.trim())`)).filter((r) => /^Vault/.test(r));
  check(`System ▸ holds ONE vault row, 「Vault…」 (${vRows.join(' / ')})`, vRows.length === 1 && vRows[0] === 'Vault…');
  await shot('desktop-system-vault.png');
  await evalJs(`[...document.querySelectorAll('${POP} [data-id="system"] .gs-flyout .gs-menu-item')].find((x) => x.textContent.trim() === 'Vault…').id = 'gs-smoke-vault'; true`);
  await click('#gs-smoke-vault');
  check('a click on System ▸ Vault… closes the popover', !(await evalJs(`!!document.querySelector('${POP}')`)));
  check('…and opens the Vault WINDOW with its header (the state + its doors), not a dialog', !!(await until(`[...app.wm.windows.values()].some((w) => w.type === 'vault') && !!document.querySelector('.vw .vw-head .vault-state-line') && !document.getElementById('vault-dialog')`, { timeout: 8000, step: 100 })));
  await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'vault') app.wm.closeWindow(w.id); true`);

  // ══ PHONE ══
  console.log('gear-menu — phone 390×844, touch + hover:none (accordion mode)');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); // → hover:none + pointer:coarse (see REAL_MOUSE)
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: URL });
  await sleep(1500);
  await evalJs(POLL_APP);
  await sleep(600);
  check('phone viewport: app.isMobile + hover:none', verdictOf(await evalJs(`app.isMobile === true && matchMedia('(hover: none)').matches`)));
  await tap('#mobile-nav-gear');
  check('the phone ⚙ opens the SAME menu in ACCORDION mode', verdictOf(await evalJs(`!!document.querySelector('${POP} .gs-menu.gs-acc')`)));
  check('no flyout element exists in accordion mode', verdictOf(await evalJs(`!document.querySelector('${POP} .gs-flyout')`)));
  check('every head is collapsed until tapped', verdictOf(await evalJs(`!document.querySelector('${POP} .gs-sub.open')`)));
  check('the popover fits the phone width', verdictOf(await evalJs(`(() => { const r = document.querySelector('${POP}').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`)));
  await tap(`${POP} .gs-menu > .gs-menu-item[data-id="tools"]`);
  check('tapping Tools expands its members INLINE (.gs-sub.open as the next sibling, aria-expanded)', gateOf(await evalJs(isOpen('tools'))) && verdictOf(await evalJs(`(() => { const h = document.querySelector('${POP} [data-id="tools"]'); return h.nextElementSibling.classList.contains('gs-sub') && h.nextElementSibling.querySelectorAll('.gs-menu-item').length >= 3 && h.nextElementSibling.querySelector('.gs-menu-item').getBoundingClientRect().left > h.getBoundingClientRect().left; })()`)));
  await shot('phone-accordion-tools.png');
  const heights = await evalJs(`[...document.querySelectorAll('${POP} .gs-menu-item')].filter((r) => r.getClientRects().length).map((r) => Math.round(r.getBoundingClientRect().height))`);
  check(`every visible row is ≥ 44 px tall on touch (min ${Math.min(...heights)} px over ${heights.length} rows, members included)`, heights.length > 8 && verdictOf(heights.every((h) => h >= 44)));
  await tap(`${POP} .gs-menu > .gs-menu-item[data-id="system"]`);
  check('tapping another head swaps (one open per level)', !(await evalJs(isOpen('tools'))) && verdictOf(await evalJs(isOpen('system'))));
  const phoneSys = await evalJs(`[...document.querySelectorAll('${POP} [data-id="system"] + .gs-sub .gs-menu-item')].filter((r) => r.getClientRects().length).map((r) => ({ t: r.textContent.trim(), h: Math.round(r.getBoundingClientRect().height), in: r.getBoundingClientRect().bottom <= innerHeight }))`);
  const pInteg = phoneSys.find((r) => r.t === 'Integrations…');
  check(`the phone reaches Integrations… under System, a ≥ 44 px row on screen (${phoneSys.map((r) => r.t).join(' / ')})`, !!pInteg && pInteg.h >= 44 && verdictOf(pInteg.in));
  await shot('phone-accordion-system.png');
  await tap(`${POP} .gs-menu > .gs-menu-item[data-id="system"]`);
  check('tapping the open head again collapses it', !(await evalJs(isOpen('system'))));
  await tap(`${POP} .gs-menu > .gs-menu-item[data-id="appearance"]`);
  check('the Appearance panel renders INLINE in the accordion (labels + steppers under the head)', gateOf(await evalJs(isOpen('appearance'))) && verdictOf(await evalJs(`(() => { const s = document.querySelector('${POP} [data-id="appearance"]').nextElementSibling; return !!s.querySelector('.gs-appearance label') && s.querySelectorAll('.font-size-ctrl button').length >= 6 && !!s.querySelector('.gs-menu-item[data-id="language"]'); })()`)));
  await shot('phone-accordion-appearance.png');
  check('the touch steppers grew to 32 px', verdictOf(await evalJs(`Math.round(document.querySelector('${POP} .gs-appearance .font-size-ctrl button').getBoundingClientRect().height) >= 32`)));
  await tap(`${POP} .gs-menu > .gs-menu-item[data-id="tools"]`);
  const usageRow = await evalJs(`(() => { window.__usage = 0; app.openUsage = () => { window.__usage++; }; const r = [...document.querySelectorAll('${POP} [data-id="tools"] + .gs-sub .gs-menu-item')].find((x) => /Usage/.test(x.textContent)); if (!r) return false; r.id = 'gs-smoke-usage'; return true; })()`);
  check('the Tools group shows its Usage row (an empty find is a named red, never a throw)', usageRow === true);
  if (usageRow) await tap('#gs-smoke-usage');
  check('a tap on a member row runs the action (stubbed openUsage once) and closes the popover — no hover was dispatched in this leg', verdictOf(await evalJs(`window.__usage === 1 && !document.querySelector('${POP}')`)));
} catch (e) {
  failed++;
  console.error('  ✗ smoke crashed: ' + e.message);
}

// ── THE SETTINGS WINDOW (2.369.132, owner "设置分级" + "harness 全局/会话级"): the nav is a
//    tree of six groups (插件 last — int263 seam i); a harness section is three sub-blocks by apply kind.
console.log('settings window — the grouped nav + the harness sub-blocks (desktop 1280×800)');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
await cdp('Page.navigate', { url: URL });
await sleep(1500);
await evalJs(`localStorage.removeItem('vibespace.settingsNavFolds'); localStorage.setItem('vibespace.settingsAdvanced', '1'); app._harnessesHere = null; app._settingsUI.open(); true`); // settings-tiers: the whole tree (advanced on, harness facts unknown ⇒ shown)
await sleep(400);
const sw = await evalJs(`(() => { const nav = document.querySelector('.settings-window .settings-nav'); if (!nav) return null; const groups = [...nav.querySelectorAll('.settings-nav-group')].map((g) => ({ id: g.dataset.group, head: g.querySelector('.settings-nav-group-head span')?.textContent, items: [...g.querySelectorAll('.settings-nav-item')].map((i) => i.textContent), folded: g.classList.contains('is-folded') })); const blocksOf = (cat) => { const sec = document.querySelector('.settings-window .settings-section[data-category="' + cat + '"]'); return sec ? [...sec.querySelectorAll('.settings-subsection-title')].map((b) => ({ kind: b.dataset.applyKind, text: b.textContent.slice(0, 60), rows: (() => { let n = 0; for (let e = b.nextElementSibling; e && !e.classList.contains('settings-subsection-title'); e = e.nextElementSibling) if (e.classList.contains('settings-row')) n++; return n; })() })) : null; }; const blocks = blocksOf('Claude'); const perHarness = Object.fromEntries(${JSON.stringify(HARNESS_ROWS)}.map((c) => [c, blocksOf(c)])); const sections = [...document.querySelectorAll('.settings-window .settings-section')].map((x) => x.dataset.category); return { groups, blocks, perHarness, sections }; })()`);
// int263 seam (i): plugin-settings-p0 derives each plugin's table into All Settings 「插件 › <名>」 — the nav's sixth group, last
check(`the nav is six groups in order (${sw && sw.groups.map((g) => g.id + ':' + g.items.length).join(' ')})`, !!sw && sw.groups.map((g) => g.id).join(',') === 'appearance,sessions,harness,services,spending,plugins' && verdictOf(sw.groups.every((g) => g.items.length >= 1 && g.head)), sw && sw.groups);
check(`the Harnesses group holds every registered harness with a settings table, in the nav's order (${HARNESS_ROWS.join(' / ')} — read off the registry); Appearance & layout holds Toolbar & Layout / Window / Sidebar / Session Card / Mobile (lane mobile-back-guard)`, !!sw && HARNESS_ROWS.length >= 1 && sw.groups.find((g) => g.id === 'harness').items.join('|') === HARNESS_ROWS.join('|') && sw.groups.find((g) => g.id === 'appearance').items.join('|') === 'Toolbar & Layout|Window|Sidebar|Session Card|Mobile', sw && sw.groups);
check('the sections follow the same order as the nav (groups, then categories)', !!sw && sw.sections.join('|') === sw.groups.flatMap((g) => g.items).join('|'), sw && sw.sections);
check(`the Claude section is sub-blocks by apply kind — global cli-config first, then per-session spawn (${sw && sw.blocks && sw.blocks.map((b) => b.kind + ':' + b.rows).join(' ')})`, !!sw && !!sw.blocks && sw.blocks.map((b) => b.kind).join(',') === 'cli-config,spawn' && gateOf(sw.blocks.every((b) => b.rows >= 1)) && gateOf(/Global/.test(sw.blocks[0].text)) && verdictOf(/Per session/.test(sw.blocks[1].text)), sw && sw.blocks);
const ORDER = ['cli-config', 'spawn', 'server'];
check(`every harness section's blocks follow global → per-session → server, only the kinds it has, ≥ 1 row each; at least one section carries a VibeSpace server block (${sw && Object.entries(sw.perHarness).map(([k, v]) => k + '=' + (v || []).map((b) => b.kind).join('+')).join(' ')})`, !!sw && gateOf(Object.values(sw.perHarness).every((v) => v && v.length && v.every((b) => b.rows >= 1) && v.map((b) => ORDER.indexOf(b.kind)).every((x, i, arr) => x >= 0 && (i === 0 || x > arr[i - 1])))) && verdictOf(Object.values(sw.perHarness).some((v) => v.some((b) => b.kind === 'server'))), sw && sw.perHarness);
// fold a group: its items hide, the fold persists per device, a search shows everything again
await evalJs(`document.querySelector('.settings-window .settings-nav-group[data-group="services"] .settings-nav-group-head').click(); true`);
await sleep(150);
const folded = await evalJs(`(() => { const g = document.querySelector('.settings-window .settings-nav-group[data-group="services"]'); const it = g.querySelector('.settings-nav-item'); return { folded: g.classList.contains('is-folded'), itemHidden: getComputedStyle(it).display === 'none', saved: localStorage.getItem('vibespace.settingsNavFolds') }; })()`);
check(`folding Services hides its categories and persists the fold (${folded && folded.saved})`, !!folded && gateOf(folded.folded) && gateOf(folded.itemHidden) && verdictOf(/services/.test(folded.saved || '')), folded);
await evalJs(`(() => { const i = document.querySelector('.settings-window .settings-search'); i.value = 'channel'; i.dispatchEvent(new Event('input')); return true; })()`);
await sleep(300);
const searched = await evalJs(`(() => { const g = document.querySelector('.settings-window .settings-nav-group[data-group="services"]'); return { present: !!g, folded: g ? g.classList.contains('is-folded') : null, items: g ? [...g.querySelectorAll('.settings-nav-item')].map((i) => i.textContent) : [] }; })()`);
check('a search shows every matching category even inside a folded group (the fold is not a filter)', !!searched && gateOf(searched.present) && searched.folded === false && verdictOf(searched.items.includes('Channels')), searched);
await evalJs(`localStorage.removeItem('vibespace.settingsNavFolds'); localStorage.removeItem('vibespace.settingsAdvanced'); document.querySelector('.settings-window')?.remove(); true`);

// ── 2.369.137 the freeze probe: an automatic capture carries the GPU/canvas inventory ──
{
  const id = await evalJs(`app.autoCaptureIncident('probe', 'suite')`);
  check(`autoCaptureIncident answers an incident id (${id})`, typeof id === 'string' && verdictOf(/^inc-/.test(id)), id);
  const second = await evalJs(`app.autoCaptureIncident('probe', 'again')`);
  check('a second auto capture inside 10 minutes is refused (rate limit)', second === null, second);
  let bundle = null;
  try { bundle = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'incidents', String(id), 'bundle.json'), 'utf8')); } catch (e) { bundle = { error: String(e.message) }; }
  const inv = bundle && bundle.client && bundle.client.snapshot && bundle.client.snapshot.inventory;
  check('the bundle note names the freeze and the snapshot carries the inventory (canvases, webgl, domNodes, screen, memory, visibility)', !!inv && typeof inv.canvases === 'number' && 'webgl' in inv && typeof inv.domNodes === 'number' && gateOf(inv.screen) && typeof inv.screen.dpr === 'number' && 'memory' in inv && typeof inv.visibility === 'string' && verdictOf(/^auto: probe — suite/.test(bundle.note || '')), JSON.stringify({ note: bundle && bundle.note, inv }).slice(0, 400));
  const toast = await evalJs(`[...document.querySelectorAll('#global-toasts *')].map((e) => e.textContent).join(' | ')`);
  check('the capture is not silent: a toast names the incident id', verdictOf(new RegExp(String(id)).test(toast)), toast);
}
// ── lane integrations-menu-home: the owner's words (zh) — ⚙ → 系统 ▸ 集成与密钥…, the window's heads, the phone ──
{
  console.log('zh — ⚙ → 系统 ▸ 集成与密钥… (desktop + phone) and the window\'s group heads');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
  await cdp('Page.navigate', { url: URL });
  await sleep(1500);
  await evalJs(POLL_APP);
  await sleep(600);
  try {
    await openGear();
    await hover(`${POP} .gs-menu > .gs-menu-item[data-id="system"]`);
    await until(isOpen('system'));
    const zSys = await evalJs(`[...document.querySelectorAll('${POP} [data-id="system"] .gs-flyout .gs-menu-item')].map((x) => x.textContent.trim())`);
    const zHead = await evalJs(`document.querySelector('${POP} .gs-menu > .gs-menu-item[data-id="system"]').textContent.trim()`);
    const zComm = await evalJs(`(() => { const h = document.querySelector('${POP} .gs-menu > .gs-menu-item[data-id="comm"]'); return h ? h.textContent.trim() : ''; })()`);
    check(`zh: 系统 holds 集成与密钥… after 备份与迁移… (${zHead} ▸ ${zSys.join(' / ')}; 通讯 = ${zComm})`, gateOf(/系统/.test(zHead)) && zSys.indexOf('集成与密钥…') > 0 && zSys[zSys.indexOf('集成与密钥…') - 1] === '备份与迁移…');
    const zVault = zSys.filter((r) => /^保险库/.test(r));
    check(`zh: 系统 holds ONE vault row, 「保险库…」 (${zVault.join(' / ')})`, zVault.length === 1 && zVault[0] === '保险库…');
    await shot('zh-desktop-system-integrations.png');
    await evalJs(`[...document.querySelectorAll('${POP} [data-id="system"] .gs-flyout .gs-menu-item')].find((x) => x.textContent.trim() === '集成与密钥…').id = 'gs-smoke-integ-zh'; true`);
    await click('#gs-smoke-integ-zh');
    await until(`document.querySelectorAll('.integ-win .integ-card').length >= 8`, { timeout: 10000, step: 100 });
    const zHeads = await evalJs(`[...document.querySelectorAll('.integ-win .integ-group-head')].map((h) => h.textContent)`);
    check(`zh: the window's heads are the plain nouns (${zHeads.join(' / ')})`, JSON.stringify(zHeads) === JSON.stringify(['通讯', '浏览器', '插件']));
    await shot('zh-desktop-integrations-window.png');
    await evalJs(`document.querySelector('.integ-group[data-group="plugins"]').scrollIntoView({ block: 'start' }); true`);
    await sleep(150);
    await shot('zh-desktop-integrations-plugins.png');
    await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'integrations') app.wm.closeWindow(w.id); true`);
    // the phone: a tap on 系统 shows the row; a tap on the row opens the window
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Page.navigate', { url: URL });
    await sleep(1500);
    await evalJs(POLL_APP);
    await sleep(600);
    await tap('#mobile-nav-gear');
    await tap(`${POP} .gs-menu > .gs-menu-item[data-id="system"]`);
    await evalJs(`(() => { const r = [...document.querySelectorAll('${POP} [data-id="system"] + .gs-sub .gs-menu-item')].find((x) => x.textContent.trim() === '集成与密钥…'); if (r) r.id = 'gs-smoke-integ-phone'; return !!r; })()`);
    check('zh phone: 系统 expands with 集成与密钥… among its rows', verdictOf(await evalJs(`!!document.getElementById('gs-smoke-integ-phone')`)));
    await shot('zh-phone-system-integrations.png');
    await tap('#gs-smoke-integ-phone');
    await until(`document.querySelectorAll('.integ-win .integ-card').length >= 8`, { timeout: 10000, step: 100 });
    check('zh phone: the tap opens the window, grouped as on the desktop (通讯 / 浏览器 / 插件, every card in a group)', verdictOf(await evalJs(`!document.querySelector('${POP}') && [...document.querySelectorAll('.integ-win .integ-group-head')].map((h) => h.textContent).join('/') === '通讯/浏览器/插件' && ${GROUPED}`)));
    await shot('zh-phone-integrations-window.png');
    await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'integrations') app.wm.closeWindow(w.id); true`);
  } catch (e) {
    failed++;
    console.error('  ✗ zh leg crashed: ' + e.message);
  }
}
console.log(`screenshots: ${SHOTS}`);
failed += censusFailed;
console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
