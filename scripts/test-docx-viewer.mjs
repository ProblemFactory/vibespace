#!/usr/bin/env node
// THE WORD VIEWER, SEEN (lane docx-viewer, 2026-09-27) — HEAVY: a worktree
// server + headless chrome over scripts/fixtures/docx/ (the PURE half is
// scripts/test-docx-viewer-model.mjs). The owner opened an APA paper: a grey
// band narrower than the page across the top, the page's left edge out of
// reach, no zoom. Measured on master at the owner's shape (817 CSS px window,
// DPR 1.75 = the ~1430 px screenshot): the page (816 px) overhung its 648 px
// grey wrapper by 84 px each side, its left 30 px clipped behind the pane.
//
//   ① paper, light AND dark: nothing but the surround (var(--bg-workspace))
//     paints above the first page — no band; every page inside the pane, never
//     left of it; page = var(--paper) white; a body run = the document's black,
//     the coloured run #1F3864, the heading the template's blue — not the theme's
//   ② the document: 4 pages (title page, body, References, the landscape
//     appendix); page width = pgSz at 100% (816 / 1056); the running head on
//     pages 2–4 and NOT on the title page (different first page + Word's
//     inheritance), the footer on all; the footnote; • bullets (Word's Symbol
//     U+F0B7 mapped) and list counters; table borders; the image; the running
//     head's page number at the right margin (the Header style's tab stop)
//   ③ the text ORDER equals mammoth's extraction of the same file (the oracle)
//   ④ zoom: Fit width fills the pane minus padding; 100% / − / + move the page
//     as the model says; horizontal scroll only when the page is wider than the
//     pane and then its left edge is reachable; Ctrl+wheel zooms the page, never
//     the browser; the choice survives a reload (vibespace.docx-zoom)
//   ⑤ hostile.docx: the tag is text, no dialog, no script; javascript:/data:
//     links have no href, the web link opens in a new tab, #bookmark scrolls;
//     the altChunk HTML sits in a sandbox="" iframe; the style's CSS injection
//     never reaches the workspace + an innerHTML negative control (the payload
//     IS live as HTML)
//   ⑥ legacy .doc / an OLE .docx / garbage: the NAMED refusal; the .doc is
//     refused before any /api/file/raw fetch
//   ⑦ the embedded font is used (document.fonts), and removed when the window closes
//   ⑧ 80 pages: "Rendering…" first, then "1 / 80"; the count follows the scroll
//     as pageIndexAt says, "80 / 80" at the end; render time and long tasks printed
//   ⑨ UI scale 125 %: page width, the tab stop, a mouse-drag selection and
//     wheel scrolling all still land
//   ⑩ the owner's shape (817 CSS px, DPR 1.75): fit shows the whole page, 100%
//     scrolls sideways with the left edge reachable
//   ⑪ CONTROLS with the untouched library (its UMD build, loaded into the page):
//     the master render executes the altChunk script, restyles <body>, shows no
//     running head on page 2, misplaces the tab stop under a transform, and
//     drops @font-face inside a shadow root — each leg above could go red
//   ⑫ "Open in LibreOffice" (§7.9 of docs/design-desktop-apps.zh.md — the office
//     lane's door): the button is on the toolbar (an SVG + its words, named by
//     title + aria-label, enabled); a trusted click reaches the DOOR with the
//     office-open verdict's app (libreoffice-writer) and the fixture's REAL path,
//     and the launch POST carries the same (the route is SPIED — CDP Fetch holds
//     it, nothing launches). Then the server is rebooted on a machine WITHOUT
//     LibreOffice Writer and the same click shows the explorer row's plain
//     sentence + "Install LibreOffice on this machine…" under the button (never
//     a greyed button), no door call, no launch; the offer opens the install
//     dialog. Both machines are CONSTRUCTED on every box (a scratch LibreOffice:
//     a `libreoffice` on a prepended PATH dir whose program dir has — or lacks —
//     Writer's libswlo.so, exactly what desktop-display.officeFacts reads), so the
//     leg never depends on what the runner has installed
//
// Screenshots: set DOCX_SHOTS=<dir>. Run: node scripts/test-docx-viewer.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);

const T0 = Date.now();
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv(); // never the machine-global :7/5901 (test-architecture §57)
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('docxview-smoke');
const prof = scratch('docxview-chrome');
const FX = scratch('docxview-fx');
const SHOTS = process.env.DOCX_SHOTS || '';
const Model = await import(pathToFileURL(path.join(repo, 'src/lib/docx-viewer-model.js')).href);
const mammoth = require('mammoth');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const TAB_SLACK = 16; // px: one em at 12 pt — see ②
let tabAt100 = null;

// ── fixtures ──
fs.mkdirSync(FX, { recursive: true });
for (const f of fs.readdirSync(path.join(repo, 'scripts/fixtures/docx')).filter((f) => f.endsWith('.docx'))) fs.copyFileSync(path.join(repo, 'scripts/fixtures/docx', f), path.join(FX, f));
const OLE = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(504)]);
fs.writeFileSync(path.join(FX, 'legacy.doc'), OLE);
fs.writeFileSync(path.join(FX, 'protected.docx'), OLE);
fs.writeFileSync(path.join(FX, 'garbage.docx'), 'this is not a zip, just text\n');
// ⑫'s two machines: a scratch LibreOffice whose program dir has Writer's library (present) or not (absent) —
// officeFacts resolves the FIRST `libreoffice` on PATH to its real program dir and reads the module libraries there
const LO = scratch('docxview-lo');
const loBin = (kind, writer) => {
  const prog = path.join(LO, kind, 'program'), bin = path.join(LO, kind, 'bin');
  fs.mkdirSync(prog, { recursive: true }); fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(prog, 'soffice'), '#!/bin/sh\n# test-docx-viewer ⑫: a scratch LibreOffice — never launched (the route is spied)\nexit 0\n', { mode: 0o755 });
  if (writer) fs.writeFileSync(path.join(prog, 'libswlo.so'), '');
  fs.symlinkSync(path.join(prog, 'soffice'), path.join(bin, 'libreoffice'));
  return bin;
};
const LO_PRESENT = loBin('present', true), LO_ABSENT = loBin('absent', false);

// ── a worktree server of THIS tree ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const bootSrv = (loBinDir) => spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PATH: `${loBinDir}${path.delimiter}${process.env.PATH || ''}`, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
let srv = bootSrv(LO_PRESENT); // ⑫ reboots it on LO_ABSENT
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1500,1000',
  '--disable-background-timer-throttling', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [prof, FX, LO]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map(); const dialogs = []; const requests = [];
let onPaused = null; // ⑫: the spied launch route (CDP Fetch)
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Fetch.requestPaused' && onPaused) { onPaused(m.params); return; }
  if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => { }); }
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', {}); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); };
const click = async (x, y, modifiers = 0) => {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, modifiers });
};

// The in-page helpers (re-installed after every navigation).
const HELPERS = `window.__dx = {
  win() { const w = [...app.wm.windows.values()]; return w.length ? w[w.length - 1] : null; },
  el() { return this.win()?.element || null; },
  sr() { return this.el()?.querySelector('.docx-host')?.shadowRoot || null; },
  scroll() { return this.el()?.querySelector('.docx-scroll') || null; },
  pages() { return [...(this.sr()?.querySelectorAll('.docx-wrapper > section.docx') || [])]; },
  z() { return parseFloat(document.body.style.zoom || '1') || 1; },
  scale() { const m = /scale\\(([\\d.e-]+)\\)/.exec(this.el()?.querySelector('.docx-host')?.style.transform || ''); return m ? parseFloat(m[1]) : 1; },
  rect(e) { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; },
  txt(sel) { const e = this.el()?.querySelector(sel); return e ? e.textContent : null; },
  ready() { const e = this.el(); if (!e) return false; return !!(e.querySelector('.docx-refusal') || (e.querySelector('.empty-hint') && !e.querySelector('.docx-status')) || (e.querySelector('.docx-host') && !e.querySelector('.docx-pending'))); },
  closeAll() { for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); },
  async open(p, name, { maximize = true } = {}) {
    this.closeAll(); await new Promise((r) => setTimeout(r, 150));
    app.openFile(p, name);
    const t0 = Date.now();
    while (Date.now() - t0 < 60000 && !this.ready()) await new Promise((r) => setTimeout(r, 40));
    if (!this.ready()) throw new Error('viewer never ready for ' + name);
    if (maximize && !this.win().isMaximized) app.wm.toggleMaximize(this.win().id);
    await new Promise((r) => setTimeout(r, 450));
    return true;
  },
  bodyText(sec) { const c = sec.cloneNode(true); for (const x of c.querySelectorAll(':scope > header, :scope > footer, :scope > ol, sup')) x.remove(); return c.textContent; },
  numberRect(sec) {
    const h = sec.querySelector(':scope > header'); if (!h) return null;
    const tw = document.createTreeWalker(h, NodeFilter.SHOW_TEXT); let n, last = null;
    while ((n = tw.nextNode())) if (/^\\d+$/.test(n.textContent.trim())) last = n;
    if (!last) return null;
    const r = document.createRange(); r.selectNodeContents(last); const b = r.getBoundingClientRect(); return { r: b.right, x: b.left, y: b.top };
  },
  btn(id) { return this.el()?.querySelector('.docx-tool-' + id); },
  center(e) { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; },
  resolveVar(v) { const d = document.createElement('div'); d.style.color = 'var(' + v + ')'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; },
  resolveBg(v) { const d = document.createElement('div'); d.style.backgroundColor = 'var(' + v + ')'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; },
}; true`;
const boot = async () => {
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 30000) return rej(new Error("no app after 30s")); setTimeout(w, 200); })(); })');
  await sleep(500);
  await evalJs(HELPERS);
};
const P = (f) => JSON.stringify(path.join(FX, f));

try {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { if (!sessionStorage.getItem('__dxKeep')) { localStorage.removeItem('vibespace.docx-zoom'); localStorage.removeItem('vibespace.uiScale'); } } catch {}" });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await boot();
  await evalJs("sessionStorage.setItem('__dxKeep', '1'); true");

  // ── ① + ② + ③ light, then ① dark ──
  const apaParas = (await mammoth.extractRawText({ path: path.join(FX, 'apa-title-page.docx') })).value.split(/\n\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // the document's own colours, read from its styles.xml (the oracle for "not the theme's")
  const stylesXml = await (await require('jszip').loadAsync(fs.readFileSync(path.join(FX, 'apa-title-page.docx')))).file('word/styles.xml').async('string');
  const styleColor = (id) => { const m = new RegExp('<w:style [^>]*w:styleId="' + id + '"[\\s\\S]*?<w:color w:val="([0-9A-F]{6})"').exec(stylesXml); const h = m[1]; return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`; };
  const H1 = styleColor('Heading1'), H2 = styleColor('Heading2');
  for (const theme of ['light', 'dark']) {
    console.log(`① paper — ${theme}`);
    await evalJs(`app.themeManager.apply('${theme}'); true`);
    await evalJs(`__dx.open(${P('apa-title-page.docx')}, 'apa-title-page.docx')`);
    const g = await evalJs(`(() => {
      const d = __dx, sc = d.scroll(), pg = d.pages(), z = d.z(), s0 = d.rect(pg[0]), sr = d.rect(sc);
      const probes = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => { const e = document.elementFromPoint(s0.x + s0.w * f, s0.y - 6); return e ? e.className : null; });
      const cs = (e) => getComputedStyle(e);
      const runs = [...d.sr().querySelectorAll('section.docx span')];
      const plain = runs.find((s) => s.textContent.startsWith('COLOURED-RUN-MARKER'));
      const blue = runs.find((s) => /own dark blue/.test(s.textContent));
      const heading = runs.find((s) => s.textContent === 'Hypotheses');
      const title2 = [...pg[1].querySelectorAll('article span')].find((s) => s.textContent.startsWith('Examining Relationships'));
      return {
        probes, surround: cs(sc).backgroundColor, workspace: d.resolveBg('--bg-workspace'), wrapperBg: cs(d.sr().querySelector('.docx-wrapper')).backgroundColor,
        pagesLeft: pg.map((p) => d.rect(p).x - sr.x), pagesRightOver: pg.map((p) => d.rect(p).r - (sr.x + sc.clientWidth * z)),
        paper: pg.map((p) => cs(p).backgroundColor), plain: plain && cs(plain).color, blue: blue && cs(blue).color, heading: heading && cs(heading).color, title2: title2 && cs(title2).color,
        theme: document.documentElement.dataset.theme, text: d.resolveVar('--text'),
      };
    })()`);
    ok(g.probes.every((c) => c === 'docx-scroll'), 'no band: every probe 6 px above the first page (5 across its width) hits the surround itself', g.probes);
    ok(g.surround === g.workspace, `the surround is var(--bg-workspace) (${g.surround})`);
    ok(g.wrapperBg === 'rgba(0, 0, 0, 0)', `the library's grey wrapper paints nothing (${g.wrapperBg})`);
    ok(g.pagesLeft.every((x) => x >= -0.5) && g.pagesRightOver.every((x) => x <= 0.5), 'every page lies inside the pane at fit width (none overhangs left or right)', { left: g.pagesLeft, rightOver: g.pagesRightOver });
    ok(g.paper.every((c) => c === 'rgb(255, 255, 255)'), 'every page is white paper', g.paper);
    ok(g.plain === 'rgb(0, 0, 0)' && g.blue === 'rgb(31, 56, 100)' && g.title2 === H1 && g.heading === H2, `a plain run is the document's black (auto), the coloured run #1F3864, Heading 1 ${H1} and Heading 2 ${H2} as styles.xml says — never the theme's text colour (${g.text})`, g);
    await shot(`after-${theme}-apa.png`);

    if (theme !== 'light') continue;
    console.log('② the document');
    const doc = await evalJs(`(() => {
      const d = __dx, pg = d.pages(), z = d.z(), T = d.scale();
      const hdr = (p) => p.querySelector(':scope > header')?.textContent.replace(/\\s+/g, ' ').trim() ?? null;
      const ftr = (p) => p.querySelector(':scope > footer')?.textContent.trim() ?? null;
      const td = d.sr().querySelector('section.docx td');
      const img = d.sr().querySelector('section.docx img');
      const num = d.numberRect(pg[1]); const pr = d.rect(pg[1]);
      return {
        n: pg.length, widths: pg.map((p) => p.offsetWidth), styleW: pg.map((p) => p.style.width),
        t1: d.bodyText(pg[0]).includes('Jordan A. Example'), t2: d.bodyText(pg[1]).includes('Hypotheses'), t3: d.bodyText(pg[2]).includes('References'), t4: d.bodyText(pg[3]).includes('LANDSCAPE-MARKER'),
        headers: pg.map(hdr), footers: pg.map(ftr),
        footnote: pg[1].querySelector(':scope > ol')?.textContent.trim() ?? null, sup: !!pg[1].querySelector('article sup'),
        td: td && { style: getComputedStyle(td).borderTopStyle, w: parseFloat(getComputedStyle(td).borderTopWidth) },
        img: img && { nw: img.naturalWidth, complete: img.complete, w: img.offsetWidth },
        num: num && { rightFromMargin: (pr.r - 96 * T * z - num.r) / (T * z) },
        bullets: [...pg[1].querySelectorAll('article p')].filter((p) => /^(Survey of|Maslach|Demographics)/.test(p.textContent)).map((p) => getComputedStyle(p, '::before').content),
        numbers: [...pg[1].querySelectorAll('article p')].filter((p) => /^(Perceived|Professional efficacy)/.test(p.textContent)).map((p) => getComputedStyle(p, '::before').content),
      };
    })()`);
    ok(doc.n === 4, `4 pages: title, body, References (manual break), landscape appendix (${doc.n})`);
    ok(doc.t1 && doc.t2 && doc.t3 && doc.t4, 'the title page and the next page are two pages; References and the appendix are pages 3 and 4', doc);
    ok(doc.widths[0] === 816 && doc.widths[1] === 816 && doc.widths[3] === 1056 && doc.styleW[0] === '612pt' && doc.styleW[3] === '792pt', 'page width = the section\'s w:pgSz (12240 twips = 612 pt = 816 px; landscape 792 pt = 1056 px)', { w: doc.widths, s: doc.styleW });
    ok(!/RUNNING-HEAD/.test(doc.headers[0] || '') && /^1$/.test(doc.headers[0] || ''), `the title page shows its FIRST-page header only (${JSON.stringify(doc.headers[0])})`);
    ok(doc.headers.slice(1).every((h) => /RUNNING-HEAD SUPERVISOR SUPPORT AND BURNOUT/.test(h || '')), 'pages 2–4 show the running head (section 2+ inherit it — Word\'s Link to Previous)', doc.headers);
    ok(doc.footers.every((f) => f === 'FOOTER-TEXT Example University'), 'the footer on every page', doc.footers);
    ok(/^FOOTNOTE-ONE/.test(doc.footnote || '') && doc.sup, 'the footnote is rendered on its page, with its reference mark', { fn: doc.footnote, sup: doc.sup });
    ok(doc.td && doc.td.style === 'solid' && doc.td.w >= 1, 'the table has borders (Table Grid)', doc.td);
    ok(doc.bullets.length === 3 && doc.bullets.every((c) => c.includes('\u2022') && !/[\uf000-\uf0ff]/.test(c)), `the bulleted list shows • markers (Word's Symbol U+F0B7 mapped): ${JSON.stringify(doc.bullets)}`);
    ok(doc.numbers.length === 3 && doc.numbers.every((c) => /counter\(/.test(c)), 'the numbered list keeps its counters', doc.numbers);
    ok(doc.img && doc.img.nw === 160 && doc.img.complete && near(doc.img.w, 240, 2), 'the embedded PNG is shown (160×100 at 2.5 in = 240 px)', doc.img);
    // TAB_SLACK: docx-preview measures a stop with the em-space still in the tab span, then swaps it for a
    // nbsp + word-spacing, so a right-aligned stop lands (em − nbsp) short — 13.1 px at 12 pt, measured the
    // same at UI scale 100 % and 125 %. Pre-fix the number sat 181 px short (the style's stops ignored).
    tabAt100 = doc.num && doc.num.rightFromMargin;
    await evalJs(`(() => { const d = __dx, sc = d.scroll(), p = d.pages()[1]; sc.scrollTop += (d.rect(p).y - d.rect(sc).y) / d.z() - 8; return true; })()`);
    await sleep(200);
    await shot('after-light-apa-page2.png');
    await evalJs('__dx.scroll().scrollTop = 0; true');
    ok(doc.num && doc.num.rightFromMargin >= -1 && doc.num.rightFromMargin <= TAB_SLACK, `the running head's page number sits at the right margin — the Header style's right-aligned stop (${doc.num && doc.num.rightFromMargin.toFixed(1)} px short; the library's own em/nbsp residual ≤ ${TAB_SLACK})`, doc.num);

    console.log('③ the text order = mammoth\'s extraction (the oracle)');
    const rendered = await evalJs(`__dx.pages().map((p) => __dx.bodyText(p)).join(' ').replace(/\\s+/g, ' ')`);
    let at = 0, lost = [];
    for (const para of apaParas) { const i = rendered.indexOf(para, at); if (i < 0) lost.push(para); else at = i + para.length; }
    ok(apaParas.length >= 40 && lost.length === 0, `all ${apaParas.length} of mammoth's paragraphs appear, in mammoth's order`, lost.slice(0, 3));
  }

  // ── ④ zoom ──
  console.log('④ zoom');
  await evalJs(`app.themeManager.apply('light'); true`);
  await evalJs(`__dx.open(${P('apa-title-page.docx')}, 'apa-title-page.docx')`);
  const zstate = () => evalJs(`(() => { const d = __dx, pg = d.pages(), z = d.z(), sc = d.scroll();
    return { T: d.scale(), label: d.txt('.docx-zoom'), fitPressed: d.btn('fit').getAttribute('aria-pressed'), actualPressed: d.btn('actual').getAttribute('aria-pressed'),
      w0: d.rect(pg[0]).w / z, wMax: Math.max(...pg.map((p) => d.rect(p).w / z)), paneInner: sc.clientWidth - 48,
      sw: sc.scrollWidth, cw: sc.clientWidth, left: d.rect(pg[3]).x - d.rect(sc).x, pref: localStorage.getItem('vibespace.docx-zoom'), dpr: devicePixelRatio, vv: visualViewport.scale }; })()`);
  const press = async (id) => { const c = await evalJs(`__dx.center(__dx.btn('${id}'))`); await click(c.x, c.y); await sleep(250); };
  let s = await zstate();
  ok(s.fitPressed === 'true' && near(s.wMax, s.paneInner, 1.5), `default = Fit width: the widest page fills the pane minus 2×24 px (${s.wMax.toFixed(1)} vs ${s.paneInner})`, s);
  ok(s.label === Model.zoomLabel(Model.fitWidthScale(s.paneInner + 48, 1056)) && s.sw <= s.cw, `the label is the model's fit scale (${s.label}); no horizontal scroll at fit`, s);
  await press('actual'); s = await zstate();
  ok(s.T === 1 && near(s.w0, 816, 1) && s.label === '100%' && s.actualPressed === 'true' && s.fitPressed === 'false', `100%: a Letter page is 816 px (${s.w0.toFixed(1)})`, s);
  await press('in'); s = await zstate();
  ok(near(s.T, Model.zoomStep(1, 1), 1e-6) && near(s.w0, 816 * 1.1, 1) && s.label === '110%', `+ → the model's next rung 110% (${s.w0.toFixed(1)} px)`, s);
  await press('out'); await press('out'); s = await zstate();
  ok(near(s.T, 0.9, 1e-6) && near(s.w0, 816 * 0.9, 1) && s.label === '90%', `− − → 90% (${s.w0.toFixed(1)} px)`, s);
  for (let i = 0; i < 16; i++) await press('in');
  s = await zstate();
  ok(s.T === Model.ZOOM_MAX && s.sw > s.cw && s.label === '400%', `+ to the ceiling (400%): the page is wider than the pane ⇒ horizontal scroll (${s.sw} > ${s.cw})`, s);
  await evalJs(`__dx.scroll().scrollLeft = 0; true`); await sleep(100); s = await zstate();
  ok(s.left >= 0 && s.left <= 24 * 1 + 1, `…and its LEFT edge is reachable (scrollLeft 0 ⇒ the widest page starts ${s.left.toFixed(1)} px inside the pane)`, s);
  ok(await evalJs(`__dx.btn('in').disabled`), '+ is disabled at the ceiling');
  await press('fit'); s = await zstate();
  ok(s.fitPressed === 'true' && near(s.wMax, s.paneInner, 1.5) && s.pref === 'fit', 'Fit width returns the widest page to the pane width and is remembered as fit', s);
  // Ctrl + wheel
  await press('actual');
  const before = await zstate();
  const mid = await evalJs(`__dx.center(__dx.scroll())`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY: -100, modifiers: 2 });
  await sleep(300); s = await zstate();
  ok(near(s.T, Model.wheelScale(1, -100), 1e-3) && s.label === Model.zoomLabel(Model.wheelScale(1, -100)) && near(s.w0, 816 * Model.wheelScale(1, -100), 1.5), `Ctrl+wheel (one notch in) = the model's wheelScale (${s.label})`, s);
  ok(s.dpr === before.dpr && s.vv === 1, 'the browser itself did not zoom (devicePixelRatio and the visual viewport unchanged)', { before: before.dpr, after: s.dpr, vv: s.vv });
  ok(s.pref === Model.serializeZoomPref('scale', Model.wheelScale(1, -100)), `the zoom is remembered per device (vibespace.docx-zoom = ${s.pref})`);
  await cdp('Page.reload'); await boot();
  await evalJs(`__dx.open(${P('apa-title-page.docx')}, 'apa-title-page.docx')`);
  s = await zstate();
  ok(s.label === Model.zoomLabel(Model.wheelScale(1, -100)) && s.fitPressed === 'false' && near(s.w0, 816 * Model.parseZoomPref(s.pref).scale, 1.5), `after a reload the page opens at the remembered ${s.label}`, s);
  await press('fit');
  await cdp('Page.reload'); await boot();
  await evalJs(`__dx.open(${P('apa-title-page.docx')}, 'apa-title-page.docx')`);
  s = await zstate();
  ok(s.fitPressed === 'true' && s.pref === 'fit', 'Fit width is remembered across a reload too', s);

  // ── ⑤ hostile ──
  console.log('⑤ hostile.docx');
  dialogs.length = 0;
  await evalJs(`__dx.open(${P('hostile.docx')}, 'hostile.docx')`);
  await sleep(1200);
  const h = await evalJs(`(() => { const d = __dx, sr = d.sr(), links = [...sr.querySelectorAll('a')];
    const by = (t) => links.find((a) => a.textContent.includes(t));
    const f = sr.querySelector('iframe');
    return { tagText: sr.textContent.includes('<img src=x onerror=alert(1)>'), imgs: sr.querySelectorAll('img').length + document.querySelectorAll('img[src="x"]').length,
      pwned: window.__docxPwned ?? null,
      js: by('JS-LINK') && { href: by('JS-LINK').getAttribute('href'), title: by('JS-LINK').title }, data: by('DATA-LINK') && by('DATA-LINK').getAttribute('href'),
      web: by('WEB-LINK') && { href: by('WEB-LINK').getAttribute('href'), target: by('WEB-LINK').target, rel: by('WEB-LINK').rel },
      frame: f && { sandbox: f.getAttribute('sandbox'), csp: /Content-Security-Policy/.test(f.srcdoc), text: /ALTCHUNK-TEXT/.test(f.srcdoc) }, frames: sr.querySelectorAll('iframe').length,
      outline: getComputedStyle(document.body).outlineStyle, bodyOutlineColor: getComputedStyle(document.body).outlineColor,
      href: location.href }; })()`);
  ok(h.tagText && h.imgs === 0, 'the <img onerror> paragraph is TEXT — no <img> element was made from it', h);
  ok(h.pwned === null && dialogs.length === 0, 'no script ran: no dialog, window.__docxPwned untouched (the altChunk script, its onerror, the text payload)', { pwned: h.pwned, dialogs });
  ok(h.js && h.js.href === null && /javascript/.test(h.js.title) && h.data === null, 'the javascript: and data: links lost their href (the text stays, the title says why)', { js: h.js, data: h.data });
  ok(h.web && h.web.href === 'https://example.com/paper' && h.web.target === '_blank' && /noopener/.test(h.web.rel) && /noreferrer/.test(h.web.rel), 'the web link opens in a NEW tab, noopener noreferrer (it never navigates VibeSpace away)', h.web);
  ok(h.frames === 1 && h.frame && h.frame.sandbox === '' && h.frame.csp && h.frame.text, 'the altChunk HTML is shown in a sandbox="" iframe with a no-network CSP', h.frame);
  ok(h.outline === 'none', `the style's CSS injection never reaches the workspace (body outline ${h.outline})`);
  const jsAt = await evalJs(`(() => { const a = [...__dx.sr().querySelectorAll('a')].find((x) => x.textContent.includes('JS-LINK')); a.scrollIntoView({ block: 'center' }); return null; })()`);
  await sleep(200);
  const jsC = await evalJs(`__dx.center([...__dx.sr().querySelectorAll('a')].find((x) => x.textContent.includes('JS-LINK')))`);
  await click(jsC.x, jsC.y); await sleep(500);
  ok(dialogs.length === 0 && (await evalJs('location.href')) === h.href, 'a real click on the javascript: link does nothing (no dialog, VibeSpace stays)', { dialogs });
  await evalJs(`__dx.scroll().scrollTop = 0; true`); await sleep(150);
  const anC = await evalJs(`__dx.center([...__dx.sr().querySelectorAll('a')].find((x) => x.textContent.includes('ANCHOR-LINK')))`);
  await click(anC.x, anC.y); await sleep(300);
  const anchor = await evalJs(`(() => { const e = __dx.sr().getElementById('endmark'), sc = __dx.scroll(); const r = e.getBoundingClientRect(), s = sc.getBoundingClientRect(); return { inView: r.top >= s.top && r.bottom <= s.bottom, top: sc.scrollTop, hash: location.hash }; })()`);
  ok(anchor.inView && anchor.top > 0 && anchor.hash === '', 'the #bookmark link scrolls the document to its target (and leaves location.hash alone)', anchor);
  // innerHTML negative control: the SAME payload, parsed as HTML, runs
  const neg = await evalJs(`new Promise((res) => { const para = [...__dx.sr().querySelectorAll('p')].find((p) => p.textContent.includes('__docxPwned')); const d = document.createElement('div'); d.innerHTML = para.textContent; setTimeout(() => { const v = window.__docxPwned ?? null; delete window.__docxPwned; res(v); }, 600); })`);
  ok(neg === 1, `NEGATIVE CONTROL: the same paragraph text through innerHTML DOES run its onerror (window.__docxPwned = ${neg}) — the payload is live, the viewer made it text`);

  // ── ⑥ refusals ──
  console.log('⑥ refusals');
  requests.length = 0;
  await evalJs(`__dx.open(${P('legacy.doc')}, 'legacy.doc', { maximize: false })`);
  const legacy = await evalJs(`__dx.txt('.docx-refusal')`);
  ok(legacy === Model.refusalText('binary-word'), `legacy.doc: "${legacy}"`);
  ok(!requests.some((u) => u.includes('/api/file/raw') && u.includes('legacy.doc')), 'the .doc is refused BEFORE any /api/file/raw fetch', requests.filter((u) => u.includes('legacy.doc')));
  await evalJs(`__dx.open(${P('protected.docx')}, 'protected.docx', { maximize: false })`);
  ok((await evalJs(`__dx.txt('.docx-refusal')`)) === Model.refusalText('ole'), 'an OLE file named .docx (a password-protected .docx is one): the named refusal, not a zip error');
  await evalJs(`__dx.open(${P('garbage.docx')}, 'garbage.docx', { maximize: false })`);
  ok((await evalJs(`__dx.txt('.docx-refusal')`)) === Model.refusalText('other'), 'a text file named .docx: the named refusal');

  // ── ⑦ embedded font ──
  console.log('⑦ the embedded font');
  const EMBED_TEXT = 'EMBEDDED-FONT MONO 0123456789 iiiiiiiiii WWWWWWWWWW';
  const WANT = EMBED_TEXT.length * 16 * 1233 / 2048; // DejaVu Sans Mono: 1233/2048 em per glyph, 12 pt = 16 px
  await evalJs(`__dx.open(${P('embedded-font.docx')}, 'embedded-font.docx')`);
  const ef = await evalJs(`(() => { const d = __dx, span = [...d.sr().querySelectorAll('span')].find((s) => s.textContent === ${JSON.stringify(EMBED_TEXT)});
    const r = document.createRange(); r.selectNodeContents(span); return { w: r.getBoundingClientRect().width / (d.scale() * d.z()), faces: [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'VS Embedded Fixture').map((f) => f.status) }; })()`);
  ok(near(ef.w, WANT, 2), `the run is set in the embedded font: ${ef.w.toFixed(1)} px = ${EMBED_TEXT.length} monospace advances (${WANT.toFixed(1)})`, ef);
  ok(ef.faces.length === 1 && ef.faces[0] === 'loaded', 'the face is registered on document.fonts while the document is open', ef.faces);
  await evalJs('__dx.closeAll(); true'); await sleep(300);
  ok((await evalJs(`[...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'VS Embedded Fixture').length`)) === 0, 'closing the window removes the face');

  // ── ⑧ 80 pages ──
  console.log('⑧ 80 pages');
  await evalJs(`(() => { window.__dxLong = { tasks: [], seen: [], t0: 0 };
    try { const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) __dxLong.tasks.push({ s: Math.round(e.startTime - __dxLong.t0), d: Math.round(e.duration) }); }); po.observe({ type: 'longtask' }); __dxLong.po = po; } catch {}
    const mo = new MutationObserver(() => { const w = document.querySelector('.docx-viewer'); if (!w) return;
      const st = w.querySelector('.docx-status')?.textContent || null, pg = w.querySelector('.docx-pages')?.textContent || null, key = st + '|' + pg;
      if (__dxLong.seen[__dxLong.seen.length - 1]?.key !== key) { const at = Math.round(performance.now() - __dxLong.t0); __dxLong.seen.push({ key, st, pg, at });
        if (st && !__dxLong.statusAt) { __dxLong.statusAt = at; requestAnimationFrame(() => requestAnimationFrame(() => { __dxLong.statusPaint = Math.round(performance.now() - __dxLong.t0); })); } } });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true }); __dxLong.mo = mo; return true; })()`);
  const long = await evalJs(`(async () => { __dx.closeAll(); await new Promise((r) => setTimeout(r, 150)); __dxLong.t0 = performance.now(); app.openFile(${P('long-80-pages.docx')}, 'long-80-pages.docx');
    const t0 = Date.now(); while (Date.now() - t0 < 60000 && !__dx.ready()) await new Promise((r) => setTimeout(r, 20));
    const readyAt = Math.round(performance.now() - __dxLong.t0); await new Promise((r) => setTimeout(r, 400)); __dxLong.mo.disconnect(); __dxLong.po?.disconnect();
    const m = (n) => { const e = performance.getEntriesByName(n).pop(); return e ? Math.round(e.duration) : null; };
    return { readyAt, statusAt: __dxLong.statusAt ?? null, statusPaint: __dxLong.statusPaint ?? null, seen: __dxLong.seen.map((x) => [x.st, x.pg, x.at]), tasks: __dxLong.tasks, parse: m('docx-parse'), render: m('docx-render'), pages: __dx.pages().length }; })()`);
  const maxTask = Math.max(0, ...long.tasks.map((t) => t.d));
  console.log(`    80 pages: open → ready ${long.readyAt} ms · parse ${long.parse} ms · renderDocument ${long.render} ms · "Rendering…" in the DOM at ${long.statusAt} ms, painted by ${long.statusPaint} ms · longest task ${maxTask} ms · ${long.tasks.length} long tasks ${JSON.stringify(long.tasks.slice(0, 8))}`);
  ok(long.pages === 80, `80 pages (${long.pages})`);
  const probe = await evalJs(`new Promise((res) => { const seen = []; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) seen.push(Math.round(e.duration)); }); po.observe({ type: 'longtask' });
    setTimeout(() => { const t = performance.now(); while (performance.now() - t < 90) { } setTimeout(() => { po.disconnect(); res(seen); }, 150); }, 20); })`);
  ok(probe.some((d) => d >= 85) && maxTask < 200, `the open held the main thread for no task ≥ 200 ms (longest ${maxTask} ms) — POSITIVE CONTROL: the same observer sees a planted 90 ms task (${JSON.stringify(probe)})`);
  const firstStatus = long.seen.findIndex((x) => x[0] === 'Rendering…');
  const lastCount = long.seen.at(-1);
  ok(firstStatus >= 0 && long.seen.findIndex((x) => x[1] === '1 / 80') > firstStatus, '"Rendering…" shows first, then the toolbar\'s "1 / 80"', long.seen);
  ok(lastCount && lastCount[1] === '1 / 80', 'the count reads 1 / 80 when done', lastCount);
  ok(long.statusPaint !== null && long.statusPaint - long.statusAt < 250, `the "Rendering…" line is painted before the parse holds the thread (${long.statusPaint - long.statusAt} ms after it entered the DOM)`, long);
  await evalJs(`app.wm.toggleMaximize(__dx.win().id); true`); await sleep(500);
  await shot('after-long-80.png');
  const tops = await evalJs(`(() => { const d = __dx, sc = d.scroll(), z = d.z(); const base = d.rect(sc).y - sc.scrollTop * z; return d.pages().map((p) => (d.rect(p).y - base) / z); })()`);
  for (const target of [40, 79]) {
    const st = Math.round(tops[target - 1] - (await evalJs('__dx.scroll().clientHeight')) / 3 + 5);
    await evalJs(`__dx.scroll().scrollTop = ${st}; true`); await sleep(250);
    const g = await evalJs(`({ st: __dx.scroll().scrollTop, vh: __dx.scroll().clientHeight, sh: __dx.scroll().scrollHeight, label: __dx.txt('.docx-pages') })`);
    const want = Model.pageIndexAt(g.st, tops, { viewportH: g.vh, scrollH: g.sh }) + 1;
    ok(want === target && g.label === `${target} / 80`, `scrolled so page ${target} crosses the probe line: the count reads "${g.label}" (pageIndexAt = ${want})`, g);
  }
  await evalJs(`__dx.scroll().scrollTop = 1e9; true`); await sleep(250);
  ok((await evalJs(`__dx.txt('.docx-pages')`)) === '80 / 80', 'at the end: "80 / 80"');

  // ── ⑨ UI scale 125 % ──
  console.log('⑨ UI scale 125 %');
  await evalJs(`localStorage.setItem('vibespace.uiScale', '125'); localStorage.setItem('vibespace.docx-zoom', '1'); true`);
  await cdp('Page.reload'); await boot();
  await evalJs(`__dx.open(${P('apa-title-page.docx')}, 'apa-title-page.docx')`);
  const u = await evalJs(`(() => { const d = __dx, pg = d.pages(), z = d.z(), T = d.scale(); const num = d.numberRect(pg[1]), pr = d.rect(pg[1]);
    return { z, T, w: d.rect(pg[0]).w, num: num && (pr.r - 96 * T * z - num.r) / (T * z) }; })()`);
  ok(u.z === 1.25 && u.T === 1 && near(u.w, 816 * 1.25, 1.5), `under body zoom 1.25 a 100% page is 816 layout px = ${u.w.toFixed(1)} visual px`, u);
  ok(u.num !== null && tabAt100 !== null && near(u.num, tabAt100, 0.5), `the tab stop lands in the same place under the UI scale (${u.num?.toFixed(2)} vs ${tabAt100?.toFixed(2)} px at 100 %) — the pass ran at net scale 1`, u);
  const sel = await evalJs(`(() => { const d = __dx, p = d.pages()[0]; const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) if (n.textContent === 'Jordan A. Example') break;
    n.parentElement.scrollIntoView({ block: 'center' }); const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); return { x0: b.left + 1, x1: b.right - 1, y: b.top + b.height / 2 }; })()`);
  await sleep(200);
  const sel2 = await evalJs(`(() => { const d = __dx, p = d.pages()[0]; const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) if (n.textContent === 'Jordan A. Example') break;
    const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect(); return { x0: b.left + 1, x1: b.right - 1, y: b.top + b.height / 2 }; })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sel2.x0, y: sel2.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: sel2.x0, y: sel2.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 8; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sel2.x0 + (sel2.x1 - sel2.x0) * i / 8, y: sel2.y, button: 'left', buttons: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sel2.x1, y: sel2.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(150);
  const selected = await evalJs(`(__dx.sr().getSelection ? __dx.sr().getSelection() : document.getSelection()).toString()`);
  ok(/Jordan A\. Exampl/.test(selected), `a mouse drag across "Jordan A. Example" selects exactly that text under zoom + transform ("${selected}")`);
  await evalJs(`__dx.scroll().scrollTop = 0; true`);
  const wc = await evalJs(`__dx.center(__dx.scroll())`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: wc.x, y: wc.y, deltaX: 0, deltaY: 600 });
  await sleep(400);
  const scrolled = await evalJs(`({ top: __dx.scroll().scrollTop, T: __dx.scale() })`);
  ok(scrolled.top > 100 && scrolled.T === 1, `a plain wheel scrolls the pages (scrollTop ${scrolled.top}) and does not zoom`, scrolled);
  await evalJs(`localStorage.setItem('vibespace.uiScale', '100'); localStorage.removeItem('vibespace.docx-zoom'); true`);

  // ── ⑩ the owner's shape ──
  console.log('⑩ the owner\'s shape: 817 CSS px at DPR 1.75');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 817, height: 507, deviceScaleFactor: 1.75, mobile: false });
  await cdp('Page.reload'); await boot();
  await evalJs(`__dx.open(${P('apa-title-page.docx')}, 'apa-title-page.docx')`);
  const o = await evalJs(`(() => { const d = __dx, sc = d.scroll(), pg = d.pages(), s0 = d.rect(pg[0]), sr = d.rect(sc);
    const probes = [0.05, 0.5, 0.95].map((f) => document.elementFromPoint(s0.x + s0.w * f, s0.y - 6)?.className || null);
    return { probes, left: s0.x - sr.x, over: Math.max(...pg.map((p) => d.rect(p).r)) - (sr.x + sc.clientWidth), sw: sc.scrollWidth, cw: sc.clientWidth, label: d.txt('.docx-zoom') }; })()`);
  ok(o.probes.every((c) => c === 'docx-scroll') && o.left >= 0 && o.over <= 0.5 && o.sw <= o.cw, `fit width: no band, the whole page inside the ${o.cw} px pane at ${o.label}`, o);
  await shot('after-owner-shape-fit.png');
  await press('actual');
  const oc = await evalJs(`(() => { const d = __dx, sc = d.scroll(), p = d.pages()[0], s0 = d.rect(p), sr = d.rect(sc); return { mid: (s0.x + s0.r) / 2 - (sr.x + sc.clientWidth / 2), sl: sc.scrollLeft }; })()`);
  ok(Math.abs(oc.mid) <= 2 && oc.sl > 0, `100% from fit keeps the page centred in the pane (centre off by ${oc.mid.toFixed(1)} px, scrollLeft ${oc.sl})`, oc);
  await shot('after-owner-shape-100.png');
  const o2 = await evalJs(`(() => { const d = __dx, sc = d.scroll(), p = d.pages()[0]; sc.scrollLeft = 0; const s0 = d.rect(p), sr = d.rect(sc);
    const probe = document.elementFromPoint(s0.x + 20, s0.y - 6)?.className || null;
    return { probe, left: s0.x - sr.x, sw: sc.scrollWidth, cw: sc.clientWidth }; })()`);
  ok(o2.sw > o2.cw && o2.left >= 0 && o2.probe === 'docx-scroll', `100%: the page is wider than the pane ⇒ it scrolls sideways, its left edge reachable (${o2.left.toFixed(1)} px in at scrollLeft 0), no band`, o2);
  await cdp('Emulation.clearDeviceMetricsOverride');
  await evalJs(`localStorage.removeItem('vibespace.docx-zoom'); true`);

  // ── ⑪ controls with the untouched library ──
  console.log('⑪ controls: the untouched library (its UMD build) in the same page');
  await cdp('Page.reload'); await boot();
  await evalJs(`__dx.closeAll(); true`);
  const nm = path.join(repo, 'node_modules');
  await evalJs(fs.readFileSync(path.join(nm, 'jszip/dist/jszip.min.js'), 'utf8') + '\n;true');
  await evalJs(fs.readFileSync(path.join(nm, 'docx-preview/dist/docx-preview.js'), 'utf8') + '\n;true');
  ok(await evalJs('typeof window.docx?.renderAsync === "function"'), 'the library\'s own build is loaded (window.docx)');
  const rawRender = (file, opts, { shadow = false, transform = '', inherit = false, styleTabs = false } = {}) => evalJs(`(async () => {
    const buf = await (await fetch('/api/file/raw?path=' + encodeURIComponent(${P(file)}))).arrayBuffer();
    const host = document.createElement('div'); host.className = '__dxraw'; host.style.cssText = 'position:absolute;left:0;top:0;width:1400px;' + ${JSON.stringify(transform ? 'transform:' + transform + ';transform-origin:0 0;' : '')};
    document.body.appendChild(host);
    const into = ${shadow ? "host.attachShadow({ mode: 'open' })" : 'host'};
    const box = document.createElement('div'); into.appendChild(box);
    const doc = await docx.parseAsync(buf, ${JSON.stringify(opts)});
    if (${inherit}) { // the header inheritance only, done by hand, so page 2 carries the running head to measure
      const body = doc.documentPart.body, secs = [...body.children.filter((c) => c.sectionProps).map((c) => c.sectionProps), body.props];
      for (const x of secs.slice(1)) { x.headerRefs = secs[0].headerRefs; x.footerRefs = secs[0].footerRefs; }
    }
    if (${styleTabs}) { // the style's stops copied by hand (one level — the fixture's Header style carries them itself)
      const st = new Map((doc.stylesPart?.styles || []).map((x) => [x.id, x]));
      for (const part of doc.parts) for (const root of [part.body, part.rootElement]) { const stack = root ? [root] : [];
        while (stack.length) { const n = stack.pop(); if (n.type === 'paragraph' && !n.tabs && st.get(n.styleName)?.paragraphProps?.tabs) n.tabs = st.get(n.styleName).paragraphProps.tabs; for (const c of n.children || []) stack.push(c); } }
    }
    await docx.renderDocument(doc, box, box, ${JSON.stringify(opts)});
    await new Promise((r) => setTimeout(r, 900));
    return true; })()`);
  const cleanRaw = () => evalJs(`document.querySelectorAll('.__dxraw').forEach((e) => e.remove()); delete window.__docxPwned; true`);
  const MASTER_OPTS = { inWrapper: true, ignoreWidth: false, ignoreHeight: false, renderHeaders: true, renderFooters: true, renderFootnotes: true };
  dialogs.length = 0;
  await rawRender('hostile.docx', MASTER_OPTS);
  const rc = await evalJs(`({ pwned: window.__docxPwned ?? null, outline: getComputedStyle(document.body).outlineStyle + ' ' + getComputedStyle(document.body).outlineColor, sandbox: document.querySelector('.__dxraw iframe')?.getAttribute('sandbox') ?? null, js: [...document.querySelectorAll('.__dxraw a')].find((a) => a.textContent.includes('JS-LINK'))?.getAttribute('href') })`);
  ok(rc.pwned >= 1 && rc.sandbox === null, `CONTROL: the master render runs the altChunk's script in an unsandboxed same-origin iframe (window.__docxPwned = ${rc.pwned})`, rc);
  ok(/solid rgb\(255, 0, 255\)/.test(rc.outline), `CONTROL: …and the style's CSS injection restyles the WORKSPACE's <body> (${rc.outline})`, rc);
  ok(rc.js === 'javascript:alert(1)', 'CONTROL: …and keeps href="javascript:alert(1)"', rc);
  await cleanRaw();
  await rawRender('apa-title-page.docx', { ...MASTER_OPTS });
  const rh = await evalJs(`(() => { const pg = [...document.querySelectorAll('.__dxraw section.docx')]; return pg.map((p) => p.querySelector(':scope > header')?.textContent.trim() ?? null); })()`);
  ok(rh.length === 4 && rh[0] === '1' && rh.slice(1).every((x) => x === null), 'CONTROL: the library alone shows NO running head on pages 2–4 (the inheritance is ours)', rh);
  const rb = await evalJs(`[...document.querySelectorAll('.__dxraw article p')].filter((p) => /^Survey of/.test(p.textContent)).map((p) => getComputedStyle(p, '::before').content)`);
  ok(rb.length === 1 && rb[0].includes('\uf0b7'), `CONTROL: the library alone writes the bullet as Symbol's private-use U+F0B7 (${JSON.stringify(rb)}) — nothing a browser without the Symbol font can draw`);
  await cleanRaw();
  const rawTab = async (scale, styleTabs = false) => {
    await rawRender('apa-title-page.docx', { ...MASTER_OPTS, experimental: true }, { inherit: true, styleTabs, transform: scale === 1 ? '' : `scale(${scale})` });
    const v = await evalJs(`(() => { const p = [...document.querySelectorAll('.__dxraw section.docx')][1]; const num = __dx.numberRect(p), pr = p.getBoundingClientRect(); return num ? (pr.right - 96 * ${scale} - num.r) / ${scale} : null; })()`);
    await cleanRaw();
    return v;
  };
  const rt1 = await rawTab(1), st1 = await rawTab(1, true), st05 = await rawTab(0.5, true);
  ok(rt1 !== null && rt1 > 100, `CONTROL: the library alone ignores the Header style's stops — its page number sits ${rt1?.toFixed(1)} px short of the margin (the style-tab fix is ours)`);
  ok(st1 !== null && near(st1, tabAt100, 0.5), `CONTROL: the library WITH the style's stops at net scale 1 lands where the viewer does (${st1?.toFixed(2)} vs ${tabAt100?.toFixed(2)} px — the residual is the library's own)`);
  ok(st05 === null || Math.abs(st05 - st1) > 20, `CONTROL: the same pass under a 0.5 transform lands elsewhere (${st05 === null ? 'no number line' : st05.toFixed(1) + ' px'} vs ${st1?.toFixed(1)} px) — the net-scale-1 hold is needed`);
  await rawRender('embedded-font.docx', { ...MASTER_OPTS, ignoreFonts: false }, { shadow: true });
  const rf = await evalJs(`(() => { const sr = document.querySelector('.__dxraw').shadowRoot; const span = [...sr.querySelectorAll('span')].find((s) => s.textContent === ${JSON.stringify(EMBED_TEXT)}); const r = document.createRange(); r.selectNodeContents(span); return r.getBoundingClientRect().width; })()`);
  ok(!near(rf, WANT, 10), `CONTROL: the library's own @font-face inside a shadow root is IGNORED by Chrome (${rf.toFixed(1)} px ≠ ${WANT.toFixed(1)}) — hence document.fonts`);
  await cleanRaw();
  await rawRender('embedded-font.docx', { ...MASTER_OPTS, ignoreFonts: false });
  const rl = await evalJs(`(() => { const span = [...document.querySelectorAll('.__dxraw span')].find((s) => s.textContent === ${JSON.stringify(EMBED_TEXT)}); const r = document.createRange(); r.selectNodeContents(span); return r.getBoundingClientRect().width; })()`);
  ok(near(rl, WANT, 2), `POSITIVE CONTROL: the same font via the library in the light DOM measures ${rl.toFixed(1)} px — the expected width is the font's, not a guess`);
  await cleanRaw();

  // ── ⑫ "Open in LibreOffice" ──
  console.log('⑫ "Open in LibreOffice": the button → the door → the (spied) launch route; then a machine without LibreOffice Writer');
  const DOCX12 = path.join(FX, 'apa-title-page.docx');
  const SPY_WORDS = 'test-docx-viewer held this launch at the route — nothing was started';
  const spied = [];
  const spyOn = async () => {
    spied.length = 0;
    onPaused = (p) => {
      if (p.request.method === 'POST') {
        spied.push({ url: p.request.url, body: p.request.postData || '' });
        cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 409, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: SPY_WORDS, code: 'gate-spy' })).toString('base64') }).catch(() => { });
      } else cdp('Fetch.continueRequest', { requestId: p.requestId }).catch(() => { }); // the launcher's catalog GET goes through
    };
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/desktop/apps', requestStage: 'Request' }] });
  };
  const spyOff = async () => { await cdp('Fetch.disable').catch(() => { }); onPaused = null; };
  const DOOR_SPY = `(() => { window.__doorCalls = []; const d = app.openWithDesktopApp; if (typeof d !== 'function') return false; app.openWithDesktopApp = (o) => { window.__doorCalls.push(JSON.parse(JSON.stringify(o || {}))); return d(o); }; return true; })()`;
  const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await evalJs(expr); if (v) return v; await sleep(100); } return null; };
  const verdictAt = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/open-with?path=${encodeURIComponent(DOCX12)}`)).json(); } catch (e) { return { threw: String(e.message || e) }; } };

  const v1 = await verdictAt();
  ok(v1.ok === true && v1.catalogId === 'libreoffice-writer', 'the constructed machine WITH LibreOffice Writer: the verdict route says ok / libreoffice-writer', v1);
  await cdp('Page.reload'); await boot();
  await evalJs(`__dx.open(${P('apa-title-page.docx')}, 'apa-title-page.docx')`);
  const b1 = await evalJs(`(() => { const b = __dx.btn('office'); if (!b) return null; const r = b.getBoundingClientRect(); return { aria: b.getAttribute('aria-label'), title: b.title, svg: !!b.querySelector('svg'), words: b.querySelector('.docx-tool-label')?.textContent || null, disabled: b.disabled, pressed: b.getAttribute('aria-pressed'), inBar: !!b.closest('.docx-toolbar'), w: r.width, h: r.height }; })()`);
  ok(!!b1 && b1.aria === 'Open in LibreOffice' && b1.svg && b1.words === 'Open in LibreOffice' && b1.title.includes('apa-title-page.docx') && !b1.disabled && b1.pressed === null && b1.inBar && b1.w > 0 && b1.h > 0, 'the toolbar carries "Open in LibreOffice": an SVG icon + its words, named by title + aria-label, enabled, not a toggle', b1);
  await shot('after-office-button.png');
  ok(await evalJs(DOOR_SPY), 'the door is on the App (the mediator) — spied, then called through');
  await spyOn();
  const bc = await evalJs(`__dx.center(__dx.btn('office'))`);
  await click(bc.x, bc.y);
  const got = await waitFor(`(window.__doorCalls || []).length ? window.__doorCalls : null`, 10000);
  { const t0 = Date.now(); while (Date.now() - t0 < 10000 && !spied.length) await sleep(100); }
  ok(!!got && got.length === 1 && got[0].catalogId === 'libreoffice-writer' && got[0].file === DOCX12 && got[0].host === null, 'a trusted click reaches THE DOOR once, with the office-open verdict\'s app (libreoffice-writer), the fixture\'s REAL path and the file\'s machine (this one)', got);
  let posted = null; try { posted = JSON.parse(spied[0]?.body || 'null'); } catch { posted = null; }
  ok(spied.length === 1 && /\/api\/desktop\/apps$/.test(spied[0].url) && !!posted && posted.appId === 'libreoffice-writer' && posted.file === DOCX12 && posted.fileHost === 'local' && !('host' in posted), 'the door\'s ONE launch POST carries the same app + path + the file\'s machine (the route spied — nothing launched)', { spied: spied.map((x) => x.url), posted });
  const said = await waitFor(`(document.getElementById('global-toasts')?.textContent || '').includes(${JSON.stringify(SPY_WORDS)})`, 5000);
  ok(!!said && !(await evalJs(`!!document.querySelector('.office-offer')`)), 'the door said the route\'s refusal as a toast (never silent); no absent-machine offer on a machine that has Writer');
  await spyOff();

  // the SAME button on a machine WITHOUT LibreOffice Writer: the server rebooted on the scratch LibreOffice that lacks libswlo.so
  try { srv.kill('SIGTERM'); } catch { }
  for (let i = 0; i < 100 && srv.exitCode === null && srv.signalCode === null; i++) await sleep(100);
  srv = bootSrv(LO_ABSENT);
  let up = false;
  for (let i = 0; i < 160 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); up = true; } catch { await sleep(250); } }
  ok(up, 'the server rebooted on the machine WITHOUT LibreOffice Writer');
  const v2 = await verdictAt();
  ok(v2.ok === false && v2.code === 'app-absent' && v2.remedy?.what === 'libreoffice-writer', 'that machine\'s verdict route says app-absent with the install remedy (what the viewer is about to be told)', v2);
  await cdp('Page.reload'); await boot();
  await evalJs(`__dx.open(${P('apa-title-page.docx')}, 'apa-title-page.docx')`);
  await evalJs(DOOR_SPY);
  await spyOn();
  const b2 = await evalJs(`(() => { const b = __dx.btn('office'); return b ? { disabled: b.disabled, opacity: getComputedStyle(b).opacity, words: b.querySelector('.docx-tool-label')?.textContent || null } : null; })()`);
  ok(!!b2 && !b2.disabled && Number(b2.opacity) === 1 && b2.words === 'Open in LibreOffice', 'on that machine it is the same button — not greyed, not disabled (the click answers)', b2);
  const bc2 = await evalJs(`__dx.center(__dx.btn('office'))`);
  await click(bc2.x, bc2.y);
  const offer = await waitFor(`(() => { const p = document.querySelector('.office-offer'); if (!p) return null; const n = p.querySelector('[data-key="office-note"]'), i = p.querySelector('[data-key="office-install"]'), br = __dx.btn('office').getBoundingClientRect(), pr = p.getBoundingClientRect();
    return { note: n?.textContent ?? null, noteCls: n?.className ?? null, noteRole: n?.getAttribute('role') ?? null, noteOpacity: n ? getComputedStyle(n).opacity : null, inst: i?.textContent ?? null, instCls: i?.className ?? null, instRole: i?.getAttribute('role') ?? null, open: !!p.querySelector('[data-key="office-open"]'), below: pr.top >= br.bottom - 1 }; })()`, 10000);
  ok(!!offer && offer.note === 'LibreOffice Writer is not installed on this machine' && /context-menu-note/.test(offer.noteCls) && offer.noteRole === 'note' && Number(offer.noteOpacity) === 1
    && offer.inst === 'Install LibreOffice on this machine…' && /context-menu-item/.test(offer.instCls) && offer.instRole === 'menuitem' && !offer.open && offer.below,
  'the click shows the explorer row\'s plain sentence + "Install LibreOffice on this machine…" under the button (a note and a real menu item — never a greyed button)', offer);
  await sleep(300);
  const doorCalls = await evalJs('window.__doorCalls.length');
  ok(doorCalls === 0 && spied.length === 0, 'no door call and no launch POST on the machine without LibreOffice', { door: doorCalls, posted: spied.length });
  await shot('after-office-absent-offer.png');
  const ic = await evalJs(`__dx.center(document.querySelector('.office-offer [data-key="office-install"]'))`);
  await click(ic.x, ic.y);
  const dlg = await waitFor(`(() => { const d = document.getElementById('desktop-install-dialog'); return d ? (d.querySelector('h3')?.textContent || d.textContent.slice(0, 160)) : null; })()`, 10000);
  ok(!!dlg && /Install LibreOffice on this machine/.test(dlg) && !(await evalJs(`!!document.querySelector('.office-offer')`)), 'the offer opens the install dialog (the plan first — the explorer row\'s dialog) and closes itself', dlg);
  await evalJs(`document.getElementById('desktop-install-dialog')?.remove(); true`);
  await spyOff();
} catch (e) {
  fail++; console.error('  ✗ threw: ' + (e.stack || e.message));
} finally {
  try { ws.close(); } catch { }
}
console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'} · ${Math.round((Date.now() - T0) / 1000)} s`);
process.exit(fail ? 1 : 0);
