// test-menu-bounds-chrome.mjs — A MENU IS BOUNDED BY THE SCREEN (lane ui-controls-and-bugs; 主开发's width-sweep rule 4,
// 2026-11-13). Every context menu is placed by ONE function, utils.js placeMenu (showContextMenu's and the file explorer's
// own builder): it never leaves the viewport — it moves up / clamps when there is no room below, it scrolls inside when it is
// taller than the screen, a menu whose rows change after it opened is placed again, and a capped menu keeps its closing rows
// (Properties / Terminate / Delete) in view without a scroll. The REAL drawers, bundled from the tree (esbuild), in a real
// headless Chrome at 1024×700 and 800×600, each menu opened near the bottom-right corner; every row's box is read.
//   ① a short menu: every row inside the viewport
//   ② a long menu (the session card's shape: a 7-row last group ending «Properties…» «Terminate»): the menu inside the
//      viewport, it scrolls inside, its last two rows visible without a scroll
//   ③ the file explorer's builder, then its office rows patched in after it opened (the sweep's 1024 defect): «Delete»
//      still inside the viewport
//   ④ a submenu opened at the bottom-right: inside the viewport
//   CONTROL: ③ with the re-placement switched off (no MutationObserver) — «Delete» falls below the screen: the judge bites
import fs from 'node:fs'; import path from 'node:path'; import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ONBOARDED_SOURCE } from './scratch.mjs';   // test-architecture: every chrome suite pre-sets 'vs-onboarded' before it navigates
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(ROOT, 'package.json'));
const CHROME = ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
const esb = require('esbuild'); const WebSocket = require('ws');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log('  ✓ ' + n); } else { failed++; console.error('  ✗ ' + n + (e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const tmp = fs.mkdtempSync('/tmp/vs-menu-bounds-');
const entry = `import { showContextMenu } from './src/lib/utils.js'; import { installExplorerOps } from './src/lib/file-explorer-ops.js';
class FE {} installExplorerOps(FE); const fe = new FE();
window.__menus = { showContextMenu, fe };`;
const js = (await esb.build({ stdin: { contents: entry, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent' })).outputFiles[0].text;
fs.writeFileSync(path.join(tmp, 'menus.html'), `<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="file://${ROOT}/public/style.css"><link rel="stylesheet" href="file://${ROOT}/public/viewers.css"></head><body style="background:#1e1e1e;margin:0"><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`);
const CDP = await freePort();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--allow-file-access-from-files', `--user-data-dir=${path.join(tmp, 'prof')}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
try {
  let target = null; for (let i = 0; i < 60 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'threw'); return r.result.value; };
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  // the boxes of the open menu (the last one) and of its rows, viewport px; `vis` = inside the menu's visible box
  const READ = `(() => { const ms = [...document.querySelectorAll('.context-menu:not(.context-submenu)')]; const m = ms[ms.length - 1]; if (!m) return null;
    const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }; const mb = R(m);
    const rows = [...m.children].filter((k) => /context-menu-(item|caption|note)/.test(k.className)).map((k) => { const b = R(k); return { text: k.textContent.trim(), ...b, vis: b.t >= mb.t - 0.5 && b.b <= mb.b + 0.5 }; });
    return { vw: innerWidth, vh: innerHeight, menu: mb, scrolls: m.scrollHeight > m.clientHeight + 1, overflowY: getComputedStyle(m).overflowY, rows }; })()`;
  const inside = (b, vw, vh) => b.l >= -0.5 && b.t >= -0.5 && b.r <= vw + 0.5 && b.b <= vh + 0.5;
  const ROWS = (n, pre) => Array.from({ length: n }, (_, i) => ({ label: `${pre} ${i + 1}`, action: () => {} }));
  for (const [vw, vh] of [[1024, 700], [800, 600]]) {
    const at = `${vw}x${vh}`;
    await cdp('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `file://${tmp}/menus.html` }); await sleep(600);
    await ev('new Promise((r) => { const t = setInterval(() => { if (window.__menus) { clearInterval(t); r(1); } }, 50); })');
    const X = vw - 12, Y = vh - 12;
    // ① a short menu
    await ev(`(() => { __menus.showContextMenu(${X}, ${Y}, ${JSON.stringify(ROWS(8, 'Row'))}.map((x) => ({ ...x, action() {} }))); return 1; })()`); await sleep(100);
    const s1 = await ev(READ);
    check(`${at} ① a short menu opened at the bottom-right corner: the menu and EVERY row inside the viewport`, !!s1 && inside(s1.menu, vw, vh) && s1.rows.every((r) => inside(r, vw, vh)), s1 && { menu: s1.menu, out: s1.rows.filter((r) => !inside(r, vw, vh)).map((r) => r.text) });
    // ② a long menu: the session card's shape (groups; the last one 7 rows ending Properties… / Terminate)
    const long = [...ROWS(12, 'Open'), { separator: true }, ...ROWS(8, 'Locate'), { separator: true }, ...ROWS(5, 'Admin'), { label: 'Properties…', action() {} }, { label: 'Terminate', action() {} }];
    await ev(`(() => { __menus.showContextMenu(${X}, ${Y}, ${JSON.stringify(long)}.map((x) => x.separator ? x : ({ ...x, action() {} }))); return 1; })()`); await sleep(150);
    const s2 = await ev(READ);
    const tail2 = s2 && s2.rows.slice(-2);
    check(`${at} ② a menu taller than the screen stays inside the viewport and scrolls INSIDE`, !!s2 && inside(s2.menu, vw, vh) && s2.scrolls && /auto|scroll/.test(s2.overflowY), s2 && { menu: s2.menu, scrolls: s2.scrolls, overflowY: s2.overflowY });
    check(`${at} ② its closing rows («Properties…», «Terminate») are in view without a scroll`, !!tail2 && tail2.map((r) => r.text).join('|') === 'Properties…|Terminate' && tail2.every((r) => r.vis && inside(r, vw, vh)), tail2);
    check(`${at} ② every visible row is inside the viewport (the rest are inside the menu's own scroll)`, !!s2 && s2.rows.filter((r) => r.vis).every((r) => inside(r, vw, vh)), s2 && s2.rows.filter((r) => r.vis && !inside(r, vw, vh)).map((r) => r.text));
    // ③ the file explorer's own builder: the file menu's shape, then its office rows patched in AFTER it opened
    const fileMenu = (noObserver) => `(async () => { ${noObserver ? 'const MO = window.MutationObserver; window.MutationObserver = undefined;' : ''}
      document.querySelectorAll('.context-menu').forEach((m) => m.remove());
      const items = [{ label: 'Open', action() {} }, { label: 'Edit', action() {} }, { label: 'Open as Hex', action() {} }, { key: 'office-1', note: true, label: 'Checking LibreOffice…' },
        { sep: true }, ...Array.from({ length: 6 }, (_, i) => ({ label: 'Copy ' + i, action() {} })), { sep: true }, { label: 'Rename', action() {} }, { label: 'Properties', action() {} }, { label: 'Delete', action() {} }];
      const menu = __menus.fe._buildMenu(${X}, ${Y}, items);
      const before = menu.getBoundingClientRect().bottom;
      __menus.fe._patchMenuRows(menu, 'office', [{ key: 'office-1', note: true, label: 'LibreOffice Calc is not installed on this machine' }, { key: 'office-2', label: 'Install LibreOffice on this machine…', action() {} },
        { key: 'office-3', label: 'Open with…', action() {} }, { key: 'office-4', label: 'Open with another app…', action() {} }, { key: 'office-5', label: 'Show in folder', action() {} }, { key: 'office-6', label: 'One more', action() {} }]);
      await new Promise((r) => setTimeout(r, 120));
      ${noObserver ? 'window.MutationObserver = MO;' : ''}
      const del = [...menu.children].find((k) => k.textContent.trim() === 'Delete').getBoundingClientRect();
      return { before, menu: (() => { const r = menu.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; })(), del: { t: del.top, b: del.bottom, l: del.left, r: del.right }, vh: innerHeight }; })()`;
    const s3 = await ev(fileMenu(false));
    check(`${at} ③ the file explorer's menu, its office rows patched in after it opened: still inside the viewport, «Delete» on screen`, !!s3 && s3.menu.t >= -0.5 && s3.menu.b <= vh + 0.5 && s3.del.b <= vh + 0.5 && s3.del.t >= -0.5, s3);
    const c3 = await ev(fileMenu(true));
    check(`${at} CONTROL ③ with the re-placement switched off, the grown menu runs past the screen (the judge bites)`, !!c3 && (c3.menu.b > vh + 0.5 || c3.del.b > vh + 0.5), c3);
    // ④ a submenu at the bottom-right
    await ev(`(() => { document.querySelectorAll('.context-menu').forEach((m) => m.remove()); __menus.showContextMenu(${X}, ${Y}, [{ label: 'One', action() {} }, { label: 'More', children: Array.from({ length: 9 }, (_, i) => ({ label: 'Sub ' + i, action() {} })) }]); const row = [...document.querySelectorAll('.context-menu > .context-menu-item')].find((e) => /^More/.test(e.textContent)); row.dispatchEvent(new MouseEvent('mouseenter')); return 1; })()`);
    await sleep(200);
    const s4 = await ev(`(() => { const sub = [...document.querySelectorAll('.context-menu .context-menu')].find((e) => e.style.display !== 'none'); if (!sub) return null; const r = sub.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; })()`);
    check(`${at} ④ a submenu opened at the bottom-right is inside the viewport`, !!s4 && inside(s4, vw, vh), s4);
  }
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/utils.js'), 'utf8'), ops = fs.readFileSync(path.join(ROOT, 'src/lib/file-explorer-ops.js'), 'utf8');
  check('ONE placement: showContextMenu and the file explorer\'s builder both end in placeMenu (no clamp of their own)', /\n  placeMenu\(pop, x, y, \{ up \}\);\n  return pop;\n\}/.test(src) && /\n    placeMenu\(menu, x, y\);\n/.test(ops) && !/if \(mr\.bottom > vh\) menu\.style\.top/.test(ops));
} finally { cleanup(); }
console.log(failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
