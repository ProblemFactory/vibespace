// Lane viewer-download (2.369.212, the owner with a Word file open: "这个界面怎么无法下载文件") — the heavy leg, in a
// zh page on a scratch worktree server of THIS tree, Chrome downloading into a scratch dir (CDP Browser.setDownloadBehavior):
//   ① a .docx (scripts/fixtures/docx, under a CJK name): the Word toolbar carries Download (right after "Open in
//     LibreOffice" when that door exists, else before the page count); clicking it saves the file under its own name with
//     identical bytes — the after-docx-zh.png shot (VD_SHOT_DIR) is that toolbar
//   ② the same window's title-bar right-click menu: its 下载 row saves the file once more, same name, same bytes
//   ③ a .png: the image toolbar's Download, same checks
//   ④ a .md in the code editor: clean ⇒ the file, no toast; dirty (typed into, unsaved) ⇒ still the SAVED bytes and ONE
//     toast says the unsaved changes are not included
//   ⑤ a phone (390 px): the Word and editor Download buttons are on screen and hit-testable
// Run: node scripts/test-viewer-download-chrome.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);

const T0 = Date.now();
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv(); // never the machine-global :7/5901 (test-architecture §57)
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('vdl-smoke');
const prof = scratch('vdl-chrome');
const FX = scratch('vdl-fx');
const DL = scratch('vdl-dl');
const CH_HOME = scratch('vdl-home'), CH_RUN = scratch('vdl-run'); // chrome's own HOME + a PRIVATE XDG_RUNTIME_DIR (never the owner's /run/user)

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── fixtures: a real PNG and a real (xref-complete) PDF, each under an ASCII and a CJK name ──
const zlib = require('node:zlib');
function png(w, h) {
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = x * 4; raw[o + 1] = y * 4; raw[o + 2] = 160; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// ── a worktree server of THIS tree ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1400,950',
  '--disable-background-timer-throttling', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: CH_HOME, XDG_RUNTIME_DIR: CH_RUN, DBUS_SESSION_BUS_ADDRESS: '' } });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [prof, FX, DL, CH_HOME, CH_RUN]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

let up = false;
for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${PORT}/api/home`)).ok; } catch { await sleep(250); } }
if (!up) { console.error('✗ the worktree server never answered'); process.exit(1); }
const WebSocket = require('ws');
let target = null, version = null;
for (let i = 0; i < 40 && !(target && version); i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(); } catch { await sleep(250); }
}
function session(url) {
  const ws = new WebSocket(url, { maxPayload: 64 * 1024 * 1024 });
  let seq = 0; const pend = new Map(); const handlers = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    for (const h of handlers) h(m);
  });
  const opened = new Promise((r) => ws.on('open', r));
  const cmd = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
  return { ws, opened, cmd, on: (h) => handlers.push(h) };
}
const page = session(target.webSocketDebuggerUrl), browser = session(version.webSocketDebuggerUrl);
await Promise.all([page.opened, browser.opened]);
const evalJs = async (expr) => {
  const r = await page.cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};


const downloads = []; // {guid, suggestedFilename, state}
browser.on((m) => {
  if (m.method === 'Browser.downloadWillBegin') downloads.push({ guid: m.params.guid, suggestedFilename: m.params.suggestedFilename, state: 'begun' });
  if (m.method === 'Browser.downloadProgress') { const d = downloads.find((x) => x.guid === m.params.guid); if (d) d.state = m.params.state; }
});
async function saved(n0) {
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(downloads.length > n0 && ['completed', 'canceled'].includes(downloads[downloads.length - 1].state))) await sleep(50);
  const d = downloads.length > n0 ? downloads[downloads.length - 1] : null;
  const f = d && path.join(DL, d.guid);
  return { d, count: downloads.length - n0, bytes: f && fs.existsSync(f) ? fs.readFileSync(f) : null };
}
const same = (r, name, bytes) => !!(r.d && r.count === 1 && r.d.state === 'completed' && r.d.suggestedFilename === name && r.bytes && r.bytes.equals(bytes));
const show = (r) => ({ d: r.d, count: r.count, size: r.bytes && r.bytes.length });

const DOCX = { name: '季度报告 终稿.docx', bytes: fs.readFileSync(path.join(repo, 'scripts/fixtures/docx/apa-title-page.docx')) };
const PNG = { name: '截图 1.png', bytes: png(64, 48) };
const MD = { name: '笔记.md', bytes: Buffer.from('# 标题\n\nthe saved text\n') };
fs.mkdirSync(FX, { recursive: true }); fs.mkdirSync(DL, { recursive: true });
for (const f of [DOCX, PNG, MD]) { f.path = path.join(FX, f.name); fs.writeFileSync(f.path, f.bytes); }

const HELPERS = `window.__vd = {
  win() { const w = [...app.wm.windows.values()]; return w.length ? w[w.length - 1] : null; },
  closeAll() { for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); },
  async until(fn, ms = 30000) { const t0 = Date.now(); let v; while (!(v = fn()) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50)); return v; },
  btn(sel) { return this.win()?.element?.querySelector(sel + ' .file-download-btn') || null; },
  toasts() { return document.getElementById('global-toasts')?.textContent || ''; },
};
true`;
const docxReady = `__vd.until(() => { const b = __vd.btn('.docx-toolbar'); const p = __vd.win()?.element?.querySelector('.docx-pages'); return b && p && p.textContent.trim() ? b : null; }, 45000)`;
const edReady = `__vd.until(() => __vd.btn('.editor-toolbar') && __vd.win()?.element?.querySelector('.cm-content') && __vd.win()?.element?.querySelector('.cm-content').textContent.includes('saved text'))`;
const onScreen = (sel) => `(() => { const b = __vd.btn(${JSON.stringify(sel)}); if (!b) return { why: 'no button' }; const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { w: r.width, h: r.height, l: r.left, r: r.right, iw: innerWidth, hit: !!hit && (hit === b || b.contains(hit)) }; })()`;
const reachable = (v) => v.w > 0 && v.h > 0 && v.l >= 0 && v.r <= v.iw && v.hit;

try {
  await page.cmd('Page.enable'); await page.cmd('Runtime.enable');
  await browser.cmd('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: DL, eventsEnabled: true }); // saved as <guid>: two saves of one name never collide
  await page.cmd('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await page.cmd('Page.addScriptToEvaluateOnNewDocument', { source: 'try { localStorage.setItem("vibespace.lang", "zh"); } catch {}' }); // a zh page (the owner's)
  const boot = async () => {
    await page.cmd('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 45000) return rej(new Error("no app after 45s")); setTimeout(w, 200); })(); })');
    await sleep(600); await evalJs(HELPERS);
  };
  await boot();
  console.log(`  (chrome ${version.Browser}; server + chrome up in ${((Date.now() - T0) / 1000).toFixed(1)} s)`);

  console.log('— ① a Word file: the toolbar Download');
  await evalJs(`(async () => { __vd.closeAll(); await new Promise((r) => setTimeout(r, 150)); app.openFile(${JSON.stringify(DOCX.path)}, ${JSON.stringify(DOCX.name)}); return true; })()`);
  const seat = await evalJs(`(async () => { const b = await ${docxReady}; if (!b) return null; const prev = b.previousElementSibling, next = b.nextElementSibling;
    return { title: b.title, aria: b.getAttribute('aria-label'), svg: !!b.querySelector('svg'), prev: prev && prev.className, next: next && next.className, office: !!b.parentElement.querySelector('.docx-tool-office') }; })()`);
  ok(seat && seat.title === '下载' && seat.aria === '下载' && seat.svg && (seat.office ? /docx-tool-office/.test(seat.prev || '') : /docx-pages/.test(seat.next || '')),
    `① the Word toolbar carries 下载 (an SVG icon, named) ${seat && seat.office ? 'right after "Open in LibreOffice"' : 'before the page count (no LibreOffice door on this scratch server)'}`, seat);
  if (process.env.VD_SHOT_DIR) {
    const box = await evalJs(`(async () => { const w = __vd.win(); app.wm.toggleMaximize(w.id); await new Promise((r) => setTimeout(r, 900)); const r = w.element.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 520) }; })()`);
    const shot = await page.cmd('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 } });
    fs.writeFileSync(path.join(process.env.VD_SHOT_DIR, 'after-docx-zh.png'), Buffer.from(shot.data, 'base64'));
    console.log('    (shot: ' + path.join(process.env.VD_SHOT_DIR, 'after-docx-zh.png') + ')');
  }
  let n0 = downloads.length;
  await evalJs(`(__vd.btn('.docx-toolbar').click(), true)`);
  let r = await saved(n0);
  ok(same(r, DOCX.name, DOCX.bytes), `① clicking it: Chrome saves ${JSON.stringify(DOCX.name)} — the file's own name, identical bytes (${DOCX.bytes.length} B)`, show(r));

  console.log('— ② the title-bar menu');
  n0 = downloads.length;
  const row = await evalJs(`(async () => { const w = __vd.win(); const tb = w.element.querySelector('.window-titlebar'); const r = tb.getBoundingClientRect();
    tb.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 80, clientY: r.top + r.height / 2 }));
    const it = await __vd.until(() => [...document.querySelectorAll('.taskbar-context-menu *')].find((e) => e.children.length === 0 && e.textContent.trim() === '下载'), 3000);
    if (!it) return null; it.click(); return true; })()`);
  r = await saved(n0);
  ok(row && same(r, DOCX.name, DOCX.bytes), '② its title-bar right-click menu has 下载 — one click, one save, same name and bytes', { row, ...show(r) });

  console.log('— ③ an image: the media toolbar Download');
  await evalJs(`(async () => { __vd.closeAll(); await new Promise((r) => setTimeout(r, 150)); app.openFile(${JSON.stringify(PNG.path)}, ${JSON.stringify(PNG.name)}); return true; })()`);
  const ib = await evalJs(`(async () => !!(await __vd.until(() => { const i = __vd.win()?.element?.querySelector('img.media-image'); return i && i.complete && i.naturalWidth > 0 && __vd.btn('.media-toolbar'); })))()`);
  n0 = downloads.length;
  if (ib) await evalJs(`(__vd.btn('.media-toolbar').click(), true)`);
  r = await saved(n0);
  ok(ib && same(r, PNG.name, PNG.bytes), `③ the image toolbar's Download saves ${JSON.stringify(PNG.name)} with identical bytes`, { ib, ...show(r) });

  console.log('— ④ the code editor: clean, then with unsaved edits');
  await evalJs(`(async () => { __vd.closeAll(); await new Promise((r) => setTimeout(r, 150)); app.openEditor(${JSON.stringify(MD.path)}, ${JSON.stringify(MD.name)}); return true; })()`);
  const eb = await evalJs(`(async () => !!(await ${edReady}))()`);
  n0 = downloads.length;
  if (eb) await evalJs(`(__vd.btn('.editor-toolbar').click(), true)`);
  r = await saved(n0);
  await sleep(300);
  const t1 = await evalJs('__vd.toasts()');
  ok(eb && same(r, MD.name, MD.bytes) && !t1.includes('未保存的修改'), `④ a clean editor's Download saves ${JSON.stringify(MD.name)} with the file's bytes, no toast`, { eb, ...show(r), t1 });
  await evalJs(`(() => { const c = __vd.win().element.querySelector('.cm-content'); c.focus(); return true; })()`);
  await page.cmd('Input.insertText', { text: 'UNSAVED ' });
  const dirty = await evalJs(`(async () => !!(await __vd.until(() => __vd.win()._editorDirty?.(), 3000)))()`);
  n0 = downloads.length;
  await evalJs(`(__vd.btn('.editor-toolbar').click(), true)`);
  r = await saved(n0);
  const t2 = await evalJs(`__vd.until(() => __vd.toasts().includes('已下载保存过的版本') && __vd.toasts(), 3000)`);
  const nToast = (String(t2 || '').match(/已下载保存过的版本/g) || []).length;
  ok(dirty && same(r, MD.name, MD.bytes) && nToast === 1, '④ with unsaved edits: the SAVED bytes download, and ONE toast says the unsaved changes are not included', { dirty, ...show(r), t2 });

  console.log('— ⑤ a phone (390 px)');
  await evalJs('(__vd.closeAll(), true)');
  await page.cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.cmd('Emulation.setTouchEmulationEnabled', { enabled: true });
  await boot();
  await evalJs(`(async () => { app.openFile(${JSON.stringify(DOCX.path)}, ${JSON.stringify(DOCX.name)}); return true; })()`);
  await evalJs(`(async () => !!(await ${docxReady}))()`); await sleep(400);
  const pd = await evalJs(onScreen('.docx-toolbar'));
  await evalJs(`(async () => { __vd.closeAll(); await new Promise((r) => setTimeout(r, 200)); app.openEditor(${JSON.stringify(MD.path)}, ${JSON.stringify(MD.name)}); return !!(await ${edReady}); })()`); await sleep(400);
  const pe = await evalJs(onScreen('.editor-toolbar'));
  ok(reachable(pd) && reachable(pe), '⑤ on a 390 px phone the Word and the editor Download buttons are on screen and take the tap', { pd, pe });
} catch (e) {
  fail++; console.error('  ✗ the suite threw: ' + (e && e.stack || e));
}

console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
