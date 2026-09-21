#!/usr/bin/env node
// ⚙ MENU HIERARCHY smoke (2.369.124, docs/design-gear-menu-hierarchy.md §2d):
// the ONE renderer in both of its modes, driven the way a person drives it.
//   DESKTOP (1280×800, a mouse): ⚙ opens the popover in FLYOUT mode with the
//   five heads + direct rows inside the top-level budget; hovering Tools
//   opens its flyout only after the 120 ms intent delay (measured on the
//   PAGE's clock — node polls until-style, never a fixed sleep against the
//   timer), to the LEFT of the head and fully on screen; hovering another
//   head swaps it (one at a time); ArrowDown ×4 from the first row lands on
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
// Throwaway server in a git worktree (scripts/scratch.mjs paths + ports —
// never a fixed name, never the repo's data/) + headless chrome over raw CDP.
// Run: node scripts/test-gear-menu.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('gear-menu-smoke');
const PROFILE = scratch('gear-menu-chrome');
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// until-style polling (verifier r2): a fixed sleep from node raced the page's
// own 120 ms timer on a starved lane — poll the page (up to 2 s) and let the
// PAGE's clock carry every timing assertion
let untilJs = null; // set once the CDP evaluator exists
const until = async (expr, { timeout = 2000, step = 25 } = {}) => { const t0 = Date.now(); for (;;) { const v = await untilJs(expr); if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };

// ── throwaway server in a worktree (overlays the gate's ALREADY-BUILT public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
// A REAL MOUSE for the desktop leg (measured 2026-09-21): headless linux
// chrome has no pointing device and answers `(hover: none)` / `(pointer:
// none)` — exactly the switch the renderer reads, so without this the
// "desktop" leg rendered the accordion. Emulation.setEmulatedMedia cannot
// set hover/pointer (its `features` cover only the prefers-* family); the
// blink settings can, and CDP touch emulation on top of them flips the page
// back to hover:none + pointer:coarse for the phone leg (probed both ways).
const REAL_MOUSE = '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';
const chrome = spawn(CHROME, [`--headless=new`, `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800', REAL_MOUSE,
  '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ──
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
// screenshots for the mandatory human look (test-ui-scale's habit): kept in
// their own scratch dir, NOT removed by cleanup, swept by the gate's reaper
const SHOTS = scratch('gear-menu-shots');
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
  await cdp('Page.navigate', { url: URL });
  await sleep(1500);
  await evalJs(POLL_APP);
  await sleep(600);

  // ══ DESKTOP ══
  console.log('gear-menu — desktop 1280×800 (flyout mode)');
  const opened = await openGear();
  const facts = await evalJs(`({ isMobile: app.isMobile, hoverNone: matchMedia('(hover: none)').matches, w: innerWidth, cls: document.querySelector('${POP} .gs-menu')?.className })`);
  check(`⚙ opens the popover in FLYOUT mode (${JSON.stringify(facts)})`, opened && /\bgs-fly\b/.test(facts.cls || ''));
  const top = await evalJs(`[...document.querySelectorAll('${POP} .gs-menu > .gs-menu-item')].map((r) => r.dataset.id || r.textContent.trim())`);
  check(`top level stays inside the budget (${top.length} rows ≤ 9: ${top.join(' / ')})`, top.length >= 6 && top.length <= 9);
  check('the five heads are present, in order, marked as menu heads', await evalJs(`(() => { const ids = [...document.querySelectorAll('${POP} .gs-menu > .gs-menu-item.has-sub')].map((r) => r.dataset.id); return JSON.stringify(ids) === JSON.stringify(['appearance','tools','comm','system','help']) && ids.every((id) => { const el = document.querySelector('${POP} .gs-menu-item[data-id="' + id + '"]'); return el.getAttribute('role') === 'menuitem' && el.getAttribute('aria-haspopup') === 'true' && el.getAttribute('aria-expanded') === 'false'; }); })()`));
  check('Manage agents is a direct row right under Appearance', await evalJs(`(() => { const rows = [...document.querySelectorAll('${POP} .gs-menu > .gs-menu-item')]; return rows[0].dataset.id === 'appearance' && /Manage agents/.test(rows[1].textContent) && !rows[1].classList.contains('has-sub'); })()`));
  check('no quick-pref control sits at the top level any more (they are the Appearance panel)', await evalJs(`!document.querySelector('${POP} > label, ${POP} > select, ${POP} > .settings-all-link')`));
  check('roving tabindex: exactly one row is tabbable and it holds focus', await evalJs(`[...document.querySelectorAll('${POP} .gs-menu-item')].filter((r) => r.tabIndex === 0).length === 1 && document.activeElement?.classList.contains('gs-menu-item')`));
  check('every flyout is closed until asked', await evalJs(`!document.querySelector('${POP} .gs-flyout.open')`));

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
  check('…and open after it', fly.open);
  check(`the flyout is fully on screen (l ${Math.round(fly.l)} t ${Math.round(fly.t)} r ${Math.round(fly.rgt)}/${fly.vw} b ${Math.round(fly.b)}/${fly.vh})`, fly.w > 0 && fly.l >= 0 && fly.t >= 0 && fly.rgt <= fly.vw && fly.b <= fly.vh);
  check('…opens to the LEFT of its head (the popover is right-anchored)', fly.rgt <= fly.headLeft + 2);
  check('…carries data-popover + role=menu (a child popover for the outside-click rule)', fly.popover === '1' && fly.role === 'menu');
  await shot('desktop-tools-flyout.png');
  check(`Tools holds Usage / Background Work / Plugins (${fly.rows.join(' / ')})`, fly.rows.some((r) => /Usage/.test(r)) && fly.rows.some((r) => /Background Work/.test(r)) && fly.rows.some((r) => /Plugins/.test(r)));
  await hover(`${POP} .gs-menu > .gs-menu-item[data-id="comm"]`);
  const commOpen = !!(await until(isOpen('comm')));
  check('hovering Communication swaps the open flyout (one per level at a time)', commOpen && !(await evalJs(isOpen('tools'))));
  check(`Communication holds Channels / Outbox / Integrations`, await evalJs(`(() => { const rows = [...document.querySelectorAll('${POP} [data-id="comm"] .gs-flyout .gs-menu-item')].map((x) => x.textContent); return rows.some((r) => /Channels/.test(r)) && rows.some((r) => /Outbox/.test(r)) && rows.some((r) => /Integrations/.test(r)); })()`));

  // keyboard
  await evalJs(`document.querySelector('${POP} .gs-menu > .gs-menu-item[data-id="appearance"]').focus(); true`);
  for (let i = 0; i < 4; i++) await key('ArrowDown');
  check('ArrowDown ×4 from Appearance lands on System (Manage agents → Tools → Communication → System)', await evalJs(`document.activeElement?.dataset?.id === 'system'`));
  await key('ArrowLeft');
  check('ArrowLeft opens the System flyout, swaps out the hover-opened one, focus on its first member (Report a problem…)', await evalJs(isOpen('system')) && !(await evalJs(isOpen('comm'))) && await evalJs(`/Report a problem/.test(document.activeElement?.textContent || '')`));
  await key('ArrowDown');
  check('ArrowDown inside the flyout moves to Diagnostics report…', await evalJs(`/Diagnostics report/.test(document.activeElement?.textContent || '') && document.activeElement.closest('.gs-flyout') !== null`));
  await evalJs(`window.__diag = 0; app._openDiagnostics = () => { window.__diag++; }; true`);
  await key('Enter');
  await sleep(150);
  check('Enter runs the row action (stubbed _openDiagnostics once) and closes the popover', await evalJs(`window.__diag === 1 && !document.querySelector('${POP}')`));

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
  for (let i = 0; i < 4; i++) await key('ArrowDown');
  await key('ArrowLeft');
  check(`(setup) System flyout open by keyboard (${await escState()})`, await evalJs(isOpen('system')));
  await shot('esc-0-before.png');
  await key('Escape');
  const esc1 = await escState();
  await shot('esc-1-after-first.png');
  check(`Esc closes ONLY the flyout — the popover stays and focus returns to the System head (${esc1})`, await evalJs(`!!document.querySelector('${POP}')`) && !(await evalJs(isOpen('system'))) && await evalJs(`document.activeElement?.dataset?.id === 'system'`), esc1);
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
  check(`click opens the Appearance PANEL flyout: five quick-pref controls (${ap.labels.join(' / ')}) + Language ▸ + All Settings`, ap.open && ap.labels.length === 5 && ap.hasLang && ap.hasAll);
  check(`the Appearance head shows a live caption "${ap.caption}"`, /px/.test(ap.caption || '') && /%/.test(ap.caption || ''));
  check('the panel flyout is fully on screen', ap.onScreen);
  await click(`${POP} .gs-menu > .gs-menu-item[data-id="appearance"]`);
  check('a second click on the head does NOT toggle it closed (open only, the tap-emulation lesson)', await evalJs(isOpen('appearance')));
  const before = await evalJs(`app._fontSize`);
  await evalJs(`window.__aplus = [...document.querySelectorAll('${POP} [data-id="appearance"] .gs-flyout .font-size-ctrl button')].find((b) => b.textContent === 'A+'); window.__aplus.id = 'gs-smoke-aplus'; true`);
  await click('#gs-smoke-aplus');
  check(`a click inside the panel changes termFontSize (${before} → ${before + 1}) and KEEPS the popover + panel open`, await evalJs(`app._fontSize === ${before + 1} && localStorage.getItem('termFontSize') === '${before + 1}' && !!document.querySelector('${POP}')`) && await evalJs(isOpen('appearance')));
  // the LIVE caption (verifier r2): the head's caption follows a change made
  // inside its own panel at once — before, it kept its build-time string
  const capSel = `document.querySelector('${POP} [data-id="appearance"] .gs-head-caption')?.textContent`;
  const capAfter = await evalJs(capSel);
  check(`the Appearance head's caption follows the change made in its own panel ("${ap.caption}" → "${capAfter}")`, new RegExp('(^|\\D)' + (before + 1) + 'px(\\D|$)').test(capAfter || '') && capAfter !== ap.caption);
  await evalJs(`[...document.querySelectorAll('${POP} [data-id="appearance"] .gs-flyout .font-size-ctrl button')].find((b) => b.textContent === 'A-').click(); true`);
  check('(restore) A- puts the size back', await evalJs(`app._fontSize === ${before}`));
  check(`…and the caption back to "${ap.caption}"`, (await evalJs(capSel)) === ap.caption);
  // Language ▸ — the nested head
  await click(`${POP} [data-id="language"]`);
  const lang = await evalJs(`(() => { const s = document.querySelector('${POP} [data-id="language"] .gs-flyout'); const rows = [...s.querySelectorAll('.gs-menu-item')]; const r = s.getBoundingClientRect(); return { open: s.classList.contains('open'), n: rows.length, checked: rows.filter((x) => x.getAttribute('aria-checked') === 'true').map((x) => x.textContent.trim()), parentOpen: document.querySelector('${POP} [data-id="appearance"] .gs-flyout').classList.contains('open'), onScreen: r.left >= 0 && r.right <= innerWidth }; })()`);
  check(`Language ▸ (a nested head) opens a second-level flyout with four choices, exactly one checked (${lang.checked.join(',')}), the Appearance panel still open`, lang.open && lang.n === 4 && lang.checked.length === 1 && lang.parentOpen && lang.onScreen);
  await shot('desktop-appearance-language.png');
  await evalJs(`document.querySelector('${POP} [data-id="language"]').focus(); true`);
  await key('Escape');
  check('Esc closes the nested flyout first; the Appearance panel and the popover stay', !(await evalJs(isOpen('language'))) && await evalJs(isOpen('appearance')) && await evalJs(`!!document.querySelector('${POP}')`));
  await evalJs(`document.querySelector('${POP}')?.remove(); true`);

  // ══ PHONE ══
  console.log('gear-menu — phone 390×844, touch + hover:none (accordion mode)');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); // → hover:none + pointer:coarse (see REAL_MOUSE)
  await cdp('Page.navigate', { url: URL });
  await sleep(1500);
  await evalJs(POLL_APP);
  await sleep(600);
  check('phone viewport: app.isMobile + hover:none', await evalJs(`app.isMobile === true && matchMedia('(hover: none)').matches`));
  await tap('#mobile-nav-gear');
  check('the phone ⚙ opens the SAME menu in ACCORDION mode', await evalJs(`!!document.querySelector('${POP} .gs-menu.gs-acc')`));
  check('no flyout element exists in accordion mode', await evalJs(`!document.querySelector('${POP} .gs-flyout')`));
  check('every head is collapsed until tapped', await evalJs(`!document.querySelector('${POP} .gs-sub.open')`));
  check('the popover fits the phone width', await evalJs(`(() => { const r = document.querySelector('${POP}').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`));
  await tap(`${POP} .gs-menu > .gs-menu-item[data-id="tools"]`);
  check('tapping Tools expands its members INLINE (.gs-sub.open as the next sibling, aria-expanded)', await evalJs(isOpen('tools')) && await evalJs(`(() => { const h = document.querySelector('${POP} [data-id="tools"]'); return h.nextElementSibling.classList.contains('gs-sub') && h.nextElementSibling.querySelectorAll('.gs-menu-item').length >= 3 && h.nextElementSibling.querySelector('.gs-menu-item').getBoundingClientRect().left > h.getBoundingClientRect().left; })()`));
  await shot('phone-accordion-tools.png');
  const heights = await evalJs(`[...document.querySelectorAll('${POP} .gs-menu-item')].filter((r) => r.getClientRects().length).map((r) => Math.round(r.getBoundingClientRect().height))`);
  check(`every visible row is ≥ 44 px tall on touch (min ${Math.min(...heights)} px over ${heights.length} rows, members included)`, heights.length > 8 && heights.every((h) => h >= 44));
  await tap(`${POP} .gs-menu > .gs-menu-item[data-id="system"]`);
  check('tapping another head swaps (one open per level)', !(await evalJs(isOpen('tools'))) && await evalJs(isOpen('system')));
  await tap(`${POP} .gs-menu > .gs-menu-item[data-id="system"]`);
  check('tapping the open head again collapses it', !(await evalJs(isOpen('system'))));
  await tap(`${POP} .gs-menu > .gs-menu-item[data-id="appearance"]`);
  check('the Appearance panel renders INLINE in the accordion (labels + steppers under the head)', await evalJs(isOpen('appearance')) && await evalJs(`(() => { const s = document.querySelector('${POP} [data-id="appearance"]').nextElementSibling; return !!s.querySelector('.gs-appearance label') && s.querySelectorAll('.font-size-ctrl button').length >= 6 && !!s.querySelector('.gs-menu-item[data-id="language"]'); })()`));
  await shot('phone-accordion-appearance.png');
  check('the touch steppers grew to 32 px', await evalJs(`Math.round(document.querySelector('${POP} .gs-appearance .font-size-ctrl button').getBoundingClientRect().height) >= 32`));
  await tap(`${POP} .gs-menu > .gs-menu-item[data-id="tools"]`);
  await evalJs(`window.__usage = 0; app.openUsage = () => { window.__usage++; }; [...document.querySelectorAll('${POP} [data-id="tools"] + .gs-sub .gs-menu-item')].find((r) => /Usage/.test(r.textContent)).id = 'gs-smoke-usage'; true`);
  await tap('#gs-smoke-usage');
  check('a tap on a member row runs the action (stubbed openUsage once) and closes the popover — no hover was dispatched in this leg', await evalJs(`window.__usage === 1 && !document.querySelector('${POP}')`));
} catch (e) {
  failed++;
  console.error('  ✗ smoke crashed: ' + e.message);
}

console.log(`screenshots: ${SHOTS}`);
console.log(failed ? `FAILED (${failed})` : 'ALL PASS');
process.exit(failed ? 1 : 0);
