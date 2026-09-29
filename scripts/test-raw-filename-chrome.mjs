#!/usr/bin/env node
// A FILE SAVED FROM A PREVIEW CARRIES ITS OWN NAME — SEEN BY CHROME (lane
// raw-filename, userW 2026-09-28: "我从vibespace预览里下载文件，文件名都叫raw").
// HEAVY: a worktree server of THIS tree + headless chrome. The fast half is
// scripts/test-raw-filename.mjs (the header's two forms, the census).
//
// For an image and a PDF, each with an ASCII name and a CJK one:
//   ① the file opens in the viewer as a PREVIEW — the <img> draws, the PDF
//     <iframe> loads — and opening it starts NO download (`inline`, never
//     `attachment`: an attachment would turn the PDF preview into a download)
//   ② the preview element's own URL (img.src / iframe.src — /api/file/raw) read
//     through Chrome's fetch carries the name in filename*
//   ③ Chrome SAVES that URL (an <a download> of it: the download manager names
//     the file exactly as "Save image as…" / a drag-out does, from the
//     response's Content-Disposition first): Browser.downloadWillBegin's
//     suggestedFilename is the file's own name and the file lands on disk under
//     it with the same bytes
//   ④ CONTROL, same browser, same URL: the Content-Disposition stripped in
//     flight (CDP Fetch at the response stage) ⇒ Chrome names it `raw` — the
//     header is what names the file (what userW saw before this lane)
//   ⑤ (r2) the code editor's ⇩ Download — the REAL button pressed in an editor
//     opened on this machine and one opened on a remote host: what it opens
//     carries the host (`&host=box`) — before r2 a remote file's Download asked
//     THIS machine (the fast census ⑧ holds the control)
//   ④b CONTROL: the header rewritten to `attachment` in flight ⇒ opening the PDF
//     preview starts a download — ①'s "no download" can go red, and `inline`
//     is what keeps a preview a preview
//
// Run: node scripts/test-raw-filename-chrome.mjs   (SKIPs without chrome)
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
const wt = scratch('rawname-smoke');
const prof = scratch('rawname-chrome');
const FX = scratch('rawname-fx');
const DL = scratch('rawname-dl');

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
function pdf(text) {
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    null, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  const stream = `BT /F1 18 Tf 30 100 Td (${text}) Tj ET`;
  objs[3] = `<</Length ${stream.length}>>stream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const FIXTURES = [
  { name: 'photo.png', kind: 'image', bytes: png(64, 48) },
  { name: '截图 2026-09-28.png', kind: 'image', bytes: png(80, 60) },
  { name: 'report.pdf', kind: 'pdf', bytes: pdf('report') },
  { name: '季度报告 (终稿).pdf', kind: 'pdf', bytes: pdf('quarterly') },
];
for (const d of [FX, DL]) fs.mkdirSync(d, { recursive: true });
for (const f of FIXTURES) fs.writeFileSync(path.join(FX, f.name), f.bytes);
const NOTES = path.join(FX, '笔记 notes.txt');
fs.writeFileSync(NOTES, 'a text file for the code editor\n');

// ── a worktree server of THIS tree ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1400,950',
  '--disable-background-timer-throttling', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [prof, FX, DL]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
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

// downloads, as the browser reports them
const downloads = []; // {guid, url, suggestedFilename, state}
browser.on((m) => {
  if (m.method === 'Browser.downloadWillBegin') downloads.push({ guid: m.params.guid, url: m.params.url, suggestedFilename: m.params.suggestedFilename, state: 'begun' });
  if (m.method === 'Browser.downloadProgress') { const d = downloads.find((x) => x.guid === m.params.guid); if (d) d.state = m.params.state; }
});
// the controls' in-flight header edit (CDP Fetch, response stage): 'strip' = the pre-lane answer (no name),
// 'attach' = the header turned into an attachment (what ① must catch: a preview that becomes a download)
let mode = null; const stripped = [], attached = [];
page.on(async (m) => {
  if (m.method !== 'Fetch.requestPaused') return;
  const p = m.params;
  const isCd = (h) => h.name.toLowerCase() === 'content-disposition';
  let headers = p.responseHeaders || [];
  if (mode === 'strip' && headers.some(isCd)) { headers = headers.filter((h) => !isCd(h)); stripped.push(p.request.url); }
  if (mode === 'attach' && headers.some(isCd)) { headers = headers.map((h) => (isCd(h) ? { name: h.name, value: h.value.replace(/^inline/, 'attachment') } : h)); attached.push(p.request.url); }
  try { await page.cmd('Fetch.continueResponse', { requestId: p.requestId, responseCode: p.responseStatusCode, responseHeaders: headers }); }
  catch { try { await page.cmd('Fetch.continueRequest', { requestId: p.requestId }); } catch { } }
});
async function saveVia(url) {
  const before = downloads.length;
  await evalJs(`(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(url)}; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); return true; })()`);
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 && !(downloads.length > before && ['completed', 'canceled'].includes(downloads[downloads.length - 1].state))) await sleep(50);
  return downloads.length > before ? downloads[downloads.length - 1] : null;
}

const HELPERS = `window.__rn = {
  win() { const w = [...app.wm.windows.values()]; return w.length ? w[w.length - 1] : null; },
  closeAll() { for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); },
  async open(p, name, kind) {
    this.closeAll(); await new Promise((r) => setTimeout(r, 150));
    app.openFile(p, name);
    const t0 = Date.now();
    const sel = kind === 'image' ? 'img.media-image' : 'iframe.media-pdf';
    let el = null;
    while (Date.now() - t0 < 30000) {
      el = this.win()?.element?.querySelector(sel);
      if (el && (kind === 'image' ? (el.complete && el.naturalWidth > 0) : el.dataset.rnLoaded === '1')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!el) throw new Error('no ' + sel + ' for ' + name);
    return { src: el.src, drawn: kind === 'image' ? el.naturalWidth > 0 : el.dataset.rnLoaded === '1', w: el.naturalWidth || 0 };
  },
  async header(url) { const r = await fetch(url); await r.arrayBuffer(); return { status: r.status, cd: r.headers.get('content-disposition'), type: r.headers.get('content-type') }; },
};
// an iframe's load does not bubble, but it CAPTURES through the document — installed before any viewer exists
document.addEventListener('load', (e) => { const t = e.target; if (t && t.matches && t.matches('iframe.media-pdf')) t.dataset.rnLoaded = '1'; }, true);
true`;

try {
  await page.cmd('Page.enable'); await page.cmd('Runtime.enable');
  await browser.cmd('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
  await page.cmd('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await page.cmd('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 45000) return rej(new Error("no app after 45s")); setTimeout(w, 200); })(); })');
  await sleep(600);
  await evalJs(HELPERS);
  console.log(`  (chrome ${version.Browser}; server + chrome up in ${((Date.now() - T0) / 1000).toFixed(1)} s)`);

  const saved = [];
  for (const f of FIXTURES) {
    console.log(`— ${f.kind}: ${JSON.stringify(f.name)}`);
    const p = path.join(FX, f.name);
    const n0 = downloads.length;
    const v = await evalJs(`__rn.open(${JSON.stringify(p)}, ${JSON.stringify(f.name)}, ${JSON.stringify(f.kind)})`);
    await sleep(f.kind === 'pdf' ? 1500 : 300); // a PDF that became a download would show up here
    const url = new URL(v.src);
    ok(url.pathname === '/api/file/raw' && url.searchParams.get('path') === p, `① the preview element streams from /api/file/raw?path=<the file> (${f.kind === 'image' ? 'img' : 'iframe'}.src)`, v.src);
    ok(v.drawn && downloads.length === n0, `① it is a PREVIEW: ${f.kind === 'image' ? `the image draws (${v.w} px wide)` : 'the PDF frame loads'} and opening it started no download (inline, never attachment)`, { v, downloads: downloads.slice(n0) });
    const h = await evalJs(`__rn.header(${JSON.stringify(v.src)})`);
    const star = /filename\*=UTF-8''([^;]+)$/.exec(h.cd || '');
    ok(h.status === 200 && /^inline; /.test(h.cd || '') && star && decodeURIComponent(star[1]) === f.name, `② Chrome's fetch of that URL reads Content-Disposition inline with filename*= the name`, h);
    const d = await saveVia(v.src);
    const onDisk = path.join(DL, f.name);
    ok(d && d.suggestedFilename === f.name, `③ Chrome saves the preview's URL as ${JSON.stringify(f.name)} (Browser.downloadWillBegin.suggestedFilename)`, d);
    ok(d && d.state === 'completed' && fs.existsSync(onDisk) && fs.readFileSync(onDisk).equals(f.bytes), '③ …and the file lands on disk under that name with the same bytes', { d, exists: fs.existsSync(onDisk), files: fs.readdirSync(DL) });
    saved.push(f.name);
  }

  // ⑤ the code editor's ⇩ Download carries the file's machine
  console.log("— ⑤ the code editor's ⇩ Download");
  const ed = await evalJs(`(async () => {
    const opened = []; const orig = window.open; window.open = (u) => { opened.push(String(u)); return null; };
    const out = {};
    try {
      for (const host of ['', 'box']) {
        __rn.closeAll(); await new Promise((r) => setTimeout(r, 150));
        app.openEditor(${JSON.stringify(NOTES)}, '笔记 notes.txt', host ? { host } : {});
        let btn = null; const t0 = Date.now();
        while (Date.now() - t0 < 5000 && !(btn = [...(__rn.win()?.element?.querySelectorAll('.editor-toolbar button') || [])].find((b) => b.title === 'Download'))) await new Promise((r) => setTimeout(r, 50));
        if (!btn) { out[host || 'local'] = 'no Download button'; continue; }
        btn.click();
        out[host || 'local'] = opened[opened.length - 1] || null;
      }
    } finally { window.open = orig; __rn.closeAll(); }
    return out;
  })()`);
  const want = `/api/download?path=${encodeURIComponent(NOTES)}`;
  ok(ed.local === want, `⑤ the editor of a file on this machine: ⇩ opens ${want.slice(0, 40)}… with no host`, ed);
  ok(ed.box === want + '&host=box', '⑤ the editor of a file on the host "box": ⇩ opens the same path WITH &host=box (before r2: no host — this machine was asked)', ed);

  // ④ CONTROL — the same URL with the header stripped in flight
  console.log('— ④ control: the Content-Disposition stripped in flight');
  await page.cmd('Fetch.enable', { patterns: [{ urlPattern: '*/api/file/raw*', requestStage: 'Response' }] });
  mode = 'strip';
  for (const f of [FIXTURES[1], FIXTURES[3]]) {
    const url = `http://127.0.0.1:${PORT}/api/file/raw?path=${encodeURIComponent(path.join(FX, f.name))}`;
    const d = await saveVia(url);
    ok(stripped.some((u) => u.startsWith(url)) && d && /^raw(\.\w+)?$/.test(d.suggestedFilename || ''), `④ control: ${JSON.stringify(f.name)} without the header is saved as ${JSON.stringify(d && d.suggestedFilename)} — the name the header gives is the only thing between the file and "raw"`, { d, stripped });
  }
  // ④b the other way to get it wrong: `attachment` on the preview URL turns the PDF PREVIEW into a download — ① catches it
  mode = 'attach';
  {
    const f = FIXTURES[3], p = path.join(FX, f.name);
    const n0 = downloads.length;
    await evalJs(`(async () => { __rn.closeAll(); await new Promise((r) => setTimeout(r, 150)); app.openFile(${JSON.stringify(p)}, ${JSON.stringify(f.name)}); return true; })()`); // no load wait: the frame never loads a download
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && downloads.length === n0) await sleep(50);
    const d = downloads[n0];
    ok(attached.length > 0 && d && d.suggestedFilename === f.name, `④b control: the same header as \`attachment\` makes opening the PDF preview START A DOWNLOAD (${JSON.stringify(d && d.suggestedFilename)}) — so ①'s "no download" is a real check, and \`inline\` is what keeps a preview a preview`, { d, attached });
  }
  mode = null;
  await page.cmd('Fetch.disable');
} catch (e) {
  fail++; console.error('  ✗ the suite threw: ' + (e && e.stack || e));
}

console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
