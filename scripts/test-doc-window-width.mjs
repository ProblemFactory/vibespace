#!/usr/bin/env node
// THE DOC WINDOW'S WIDTH + LEAVING RULES (lane doc-window-width-export, 2.369.239 — owner 2026-10-08 "为啥左右这么多空白，
// 缺少下载和导出功能": a 1872 px window showed a centred 76ch column, ≈ 390 px empty each side, a 4-column table clipped at
// its right edge, and no Download / Export / Print). PURE legs over src/lib/doc-window-model.js + source pins on the
// window (src/lib/doc-window-ui.js, src/lib/doc-window.js):
//   §1 the width model: Fit is the default (column = pane − 2×32 px), Comfortable = the 76ch measure, a phone is always Fit
//      with a 12 px gutter; the device's remembered choice; RED CONTROL: a patched copy that keeps the fixed measure for Fit.
//   §2 the table rule: the wrapper scrolls (overflow-x auto), the first column stays (sticky) — and the window wears it.
//   §3 leaving: Download .md = the existing /api/download route (test-raw-filename's census lists it); Export HTML / Print =
//      ONE self-contained document (no script; tokens + styles inlined; the print sheet) built from the ONE sanitizer's
//      output; a fragment that still carries a script / handler / javascript: link is refused (belt); local images inline.
//   §4 the window's pins: the ⋯ always shown at the bar's right with the doc's own rows; the print frame sandbox has no
//      allow-scripts; sanitizeHtml rides in from the main bundle (deps), no second DOMPurify; no .docx row.
// Run: node scripts/test-doc-window-width.mjs   (in-process, ~0.06 s; the chrome half = scripts/test-doc-window.mjs §10)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 400) : '')); } };
const section = (t) => console.log('\n' + t);
const MODEL = path.join(REPO, 'src/lib/doc-window-model.js');
const M = await import(pathToFileURL(MODEL).href);

/** The width rules as one verdict list (empty = the rules hold) — run on the model and on a patched copy. */
function widthVerdicts(m) {
  const bad = [];
  const col = (winWidth, choice, phone, measurePx = 652) => { const r = m.columnRule({ choice, phone }); const avail = winWidth - 2 * r.gutter; return r.maxWidth === 'none' ? avail : Math.min(avail, measurePx); };
  if (m.widthChoice(null) !== 'fit' || m.widthChoice('') !== 'fit' || m.widthChoice('bogus') !== 'fit') bad.push('the default is not fit');
  if (m.widthChoice('comfortable') !== 'comfortable' || m.nextWidth('fit') !== 'comfortable' || m.nextWidth('comfortable') !== 'fit') bad.push('the choice does not flip');
  const fit = m.columnRule({ choice: 'fit' });
  if (fit.maxWidth !== 'none' || fit.gutter !== 32) bad.push('fit is not the pane minus 32 px each side: ' + JSON.stringify(fit));
  if (col(1811, 'fit', false) !== 1747) bad.push('fit at a 1811 px pane is not 1747: ' + col(1811, 'fit', false));
  if (col(1811, 'fit', false) < 1700) bad.push('fit at 1872 leaves < 1700 px');
  const c = m.columnRule({ choice: 'comfortable' });
  if (c.maxWidth !== 'calc(76ch + 64px)' || col(1811, 'comfortable', false) !== 652) bad.push('comfortable is not the 76ch measure: ' + JSON.stringify(c));
  const ph = m.columnRule({ choice: 'comfortable', phone: true });
  if (ph.choice !== 'fit' || ph.maxWidth !== 'none' || ph.gutter !== 12 || col(390, 'comfortable', true) !== 366) bad.push('a phone is not always fit with 12 px: ' + JSON.stringify(ph));
  return bad;
}

section('§1 the width model — Fit by default, Comfortable by choice, the phone always Fit');
ok(widthVerdicts(M).length === 0, 'Fit = the pane − 2×32 px (1811 → 1747), Comfortable = calc(76ch + 64px) (652 px at 15 px), a phone = Fit with 12 px (390 → 366); the default is Fit', widthVerdicts(M));
ok(M.WIDTH_KEY === 'vs-doc-width' && JSON.stringify(M.WIDTHS) === '["fit","comfortable"]', 'the choice is a DEVICE\'s (localStorage `vs-doc-width`), two values only');
const UI = rd('src/lib/doc-window-ui.js');
ok(/widthChoice\(localStorage\.getItem\(WIDTH_KEY\)\)/.test(UI) && /localStorage\.setItem\(WIDTH_KEY, S\.width\)/.test(UI) && !/userState|writeUserState|\/api\/user-state/.test(UI), 'the window reads + writes the choice in localStorage only — never user-state');
ok(UI.includes('.doc-window[data-width="fit"] .doc-page{max-width:none}') && UI.includes('.doc-page{font-size:15px;max-width:calc(76ch + 64px)') && UI.includes('.doc-window.doc-phone .doc-page{padding:18px 12px 80px}'), 'the window wears the rule: fit lifts the measure, comfortable keeps design 020\'s 76ch, the phone gutter is 12 px');
// RED CONTROL: the owner's bug as a patched copy — Fit that keeps the fixed measure
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-docwidth-'));
try {
  const src = fs.readFileSync(MODEL, 'utf8');
  const mut = src.replace("maxWidth: c === 'fit' ? 'none' : MEASURE", 'maxWidth: MEASURE');
  fs.writeFileSync(path.join(TMP, 'm.mjs'), mut);
  const bad = widthVerdicts(await import(pathToFileURL(path.join(TMP, 'm.mjs')).href));
  ok(mut !== src && bad.length >= 2, 'RED CONTROL: a copy whose Fit keeps the fixed 76ch measure (the shot\'s 1080 device px) fails the width rules', bad);
} finally { fs.rmSync(TMP, { recursive: true, force: true }); }

section('§2 a wide table scrolls in its own wrapper — never clipped');
ok(/\.tableWrapper\{overflow-x:auto;[^}]*max-width:100%/.test(M.TABLE_CSS) && /:is\(td,th\):first-child\{position:sticky;left:0/.test(M.TABLE_CSS), 'TABLE_CSS: the wrapper scrolls horizontally, the first column is held (sticky)');
ok(UI.includes('${TABLE_CSS}') && !/\.tableWrapper\{overflow:hidden/.test(UI), 'the window\'s stylesheet carries TABLE_CSS (one rule for both widths)');

section('§3 leaving — the file itself, ONE self-contained HTML, the print sheet');
ok(M.downloadHref('', '/p/docs/A b.md') === '/api/download?path=%2Fp%2Fdocs%2FA+b.md' && M.downloadHref('h1', '/x.md') === '/api/download?host=h1&path=%2Fx.md', 'Download .md = the existing attachment route /api/download (host-aware) — no new URL shape');
ok(/router\.get\('\/api\/download'/.test(rd('src/routes/files.js')) && /\/api\/download\b/.test(rd('scripts/test-raw-filename.mjs')), 'the route exists in src/routes/files.js and test-raw-filename\'s census already names it');
ok(M.exportName('report.md') === 'report.html' && M.exportName('a.markdown') === 'a.html' && M.exportName('../x/y') === '.._x_y.html' && M.exportName('') === 'document.html', 'the export is named by the document (<stem>.html)');
ok(M.localImagePath('img/a.png', '/p/docs/A.md') === '/p/docs/img/a.png' && M.localImagePath('../b.png?x=1', '/p/docs/A.md') === '/p/b.png' && M.localImagePath('/abs/c.png', '/p/A.md') === '/abs/c.png'
  && M.localImagePath('https://e.com/a.png', '/p/A.md') === '' && M.localImagePath('data:image/png;base64,AA', '/p/A.md') === '' && M.localImagePath('//cdn/x.png', '/p/A.md') === '', 'images beside the file are inlined (their /api/file/raw path); scheme / protocol-relative URLs are kept as written');
const body = '<h1>T</h1><div class="tableWrapper"><table><tbody><tr><th>a</th></tr></tbody></table></div><p><a href="https://e.com/k">k</a> one = two, onion=3</p><img src="data:image/png;base64,AA">';
const html = M.exportDocument({ title: 'A <b>.md', body, css: '.doc-page .ProseMirror h1{font-size:26px}', tokens: [['--text', '#ddd'], ['--bg-window', ' #111 '], ['--evil', 'red;}</style><script>'], ['nope', 'x']], font: 'Inter, sans-serif', wide: true });
ok(typeof html === 'string' && html.startsWith('<!doctype html>') && !/<script\b/i.test(html) && html.includes('<title>A &lt;b&gt;.md</title>') && html.includes(':root{--text:#ddd;--bg-window:#111}') && html.includes('.doc-page .ProseMirror h1{font-size:26px}') && html.includes(body) && html.includes('https://e.com/k'), 'Export HTML: ONE document — no script, the title escaped, the theme tokens inlined (a hostile token value dropped), the editor\'s styles inlined, links kept', html && html.slice(0, 300));
ok(html.includes('@page{margin:16mm}') && /@media print\{[^]*max-width:none!important[^]*tr,img,pre,blockquote,figure\{break-inside:avoid\}[^]*h1,h2,h3,h4,h5,h6\{break-after:avoid\}/.test(html) && html.includes(M.TABLE_CSS), 'the print sheet: 16 mm pages, full width, rows / figures not split, headings kept with the next; the table rule rides too');
ok(M.exportDocument({ body, wide: false }).includes('max-width:calc(76ch + 64px)') && M.exportDocument({ body, wide: true }).includes('max-width:none'), 'the export keeps the window\'s width (Fit = full, Comfortable = the measure)');
const hostile = ['<script>alert(1)</script>', '<img src=x onerror="alert(1)">', '<a href="javascript:alert(1)">x</a>', '<a href=\' javascript:x\'>y</a>', '<iframe src="data:text/html,<b>"></iframe>', '<form action="vbscript:x"></form>'];
ok(hostile.every((h) => M.exportDocument({ body: '<p>ok</p>' + h }) === null) && M.exportDocument({ body: '<p>javascript: is a word; onload = text &lt;script&gt;</p>' }) !== null, 'the belt: a fragment still carrying a script / an on* handler / a javascript:, vbscript: or data:text/html link is REFUSED (null); the words in text pass', hostile.map((h) => M.exportDocument({ body: h }) === null));

section('§4 the window — the ⋯ at the right, the one sanitizer, the print frame');
ok(/moreAlways: \(\) => true/.test(UI) && UI.indexOf("tool('width'") > UI.indexOf("bar.appendChild(btnStrip)") && UI.indexOf('bar.appendChild(more)') > UI.indexOf("tool('width'"), 'the bar\'s right end = comments · the width control · ⋯ (always shown: the doc\'s own rows live there)');
const rows = (UI.match(/row\('[a-z]+', t\('([^']+)'\)/g) || []).map((x) => x.replace(/^.*t\('/, '').replace(/'\)$/, ''));
ok(JSON.stringify(rows) === JSON.stringify(['Download .md', 'Export HTML', 'Print / Save as PDF', 'Copy as Markdown', 'Copy as HTML']) && !/docx/i.test(UI.slice(UI.indexOf('function leaveRows'), UI.indexOf('const dirtyNow'))), 'the ⋯ rows: Download .md · Export HTML · Print / Save as PDF · Copy as Markdown · Copy as HTML — no .docx row (a reader, no writer), no greyed row', rows);
ok(/sanitizeHtml\(S\.ed\.getHTML\(\)\)/.test(UI) && !/dompurify/i.test(UI) && /import \{ sanitizeHtml \} from '\.\/safe-html\.js';/.test(rd('src/lib/doc-window.js')) && /sanitizeHtml, copyText,/.test(rd('src/lib/doc-window.js')), 'the export fragment goes through THE one sanitizer (src/lib/safe-html.js), handed in from the main bundle — the lazy entry carries no second copy');
ok(/setAttribute\('sandbox', 'allow-same-origin allow-modals'\)/.test(UI) && !/doc-print-frame[^\n]*allow-scripts/.test(UI) && /contentWindow\.print\(\)/.test(UI), 'Print: a transient hidden frame, sandbox WITHOUT allow-scripts (nothing in the document runs), this window calls print()');
ok(/if \(dirtyNow\(\)\) \{[^]*t\('Save and download\?'\)[^]*if \(dirtyNow\(\)\) return;[^]*saveAs\(downloadHref\(host, path\), name\)/.test(UI), 'an unsaved edit is saved first (or nothing downloads) — never a stale file');
ok((UI.match(/labelHtml/g) || []).length === 1 && /labelHtml: '<span class="doc-menu-ico">' \+ \(I\[icon\] \|\| ''\) \+ '<\/span>' \+ escH\(label\)/.test(UI), 'the ONE labelHtml site = a trusted icons.js glyph + the ESCAPED words (the menu\'s SVG icons; every other word stays textContent)');
for (const lang of ['zh', 'ja']) {
  const D = rd(`src/lib/i18n-${lang}.js`);
  const miss = ['Download, export, print', 'Comfortable', 'Fit width', 'Download .md', 'Export HTML', 'Print / Save as PDF', 'Copy as Markdown', 'Copy as HTML', 'Save and download?', 'Save and download', 'Page width: Fit width — press for Comfortable', 'Page width: Comfortable — press for Fit width'].filter((k) => !D.includes(JSON.stringify(k) + ':'));
  ok(!miss.length, `the new words are in i18n-${lang}.js`, miss);
}
console.log(`\n[doc-window-width] ${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
