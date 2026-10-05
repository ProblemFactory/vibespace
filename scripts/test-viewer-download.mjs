// Lane viewer-download (2.369.212, the owner with a Word file open: "这个界面怎么无法下载文件") — every window that
// shows ONE file can download it, through ONE helper (src/lib/file-download.js).
//   ① census over the viewer dispatch: every viewer kind the file-types registry routes to (getViewerType over each
//     registered extension, + the editor for text and the hex viewer for other binaries) opens a window whose code
//     wires the helper — a kind this census does not list is RED (a new viewer kind declares its window here)
//   ② the URL builder, DOM-free: this machine / an ssh host / a paired or Windows device id — one spelling (Files'
//     _hp() IS hostParam; no other /api/download?path= in src/lib)
//   ③ the helper's behaviour with a stub fetch + document: a stat refusal toasts and starts nothing; a start is a
//     temporary <a download> click; a dirty editor's start says so once
//   ④ the title-bar menu's Download is the same helper, offered on windows that carry a file
//   controls: patched copies — the hex viewer unwired, the viewer's re-seat after ⟳ dropped, an unlisted kind — go RED
// Run: node scripts/test-viewer-download.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + JSON.stringify(extra) : '')); } return !!c; };

// ── ① census ──
const FT = await import(path.join(repo, 'src/lib/file-types.js'));
const ftSrc = read('src/lib/file-types.js');
const exts = [...ftSrc.slice(ftSrc.indexOf('const REGISTRY = {'), ftSrc.indexOf('const DEFAULT_ENTRY')).matchAll(/^\s+'?([\w-]+)'?:\s*\{/gm)].map((m) => m[1]);
const kinds = new Set(exts.map((e) => FT.getViewerType(e)).filter(Boolean));
// the window each kind opens in (file-viewer.js FileViewer.open): RENDERED_VIEWERS → the 'viewer' window; html → the editor
const WINDOW_OF = { archive: 'viewer', image: 'viewer', video: 'viewer', audio: 'viewer', pdf: 'viewer', eml: 'viewer', csv: 'viewer', xlsx: 'viewer', docx: 'viewer', pptx: 'viewer', 'html-editor': 'editor', '(text)': 'editor', '(binary)': 'hex' };

function openBody(fv) { const a = fv.indexOf('static async open('); return fv.slice(a, fv.indexOf('static async renderInto(', a)); }
function wiring(src) {
  const fv = openBody(src['src/lib/file-viewer.js']);
  const renders = (fv.match(/await FileViewer\.renderInto\(/g) || []).length, seats = (fv.match(/FileViewer\._seatDownload\(container, btnDownload, winInfo\.content\)/g) || []).length;
  const viewerWin = fv.indexOf("type: 'viewer'"), wire = fv.indexOf('wireFileDownload(winInfo, { path: filePath, host })');
  const ce = src['src/lib/code-editor.js'];
  return {
    viewer: viewerWin > 0 && wire > viewerWin && renders >= 2 && seats === renders,
    editor: /const btnDownload = wireFileDownload\(winInfo, /.test(ce) && /toolbarRight\.append\(.*\bbtnDownload\b/.test(ce),
    hex: /toolbar\.append\([^)]*wireFileDownload\(winInfo, \{ path: filePath, host: this\._host \}\)/.test(src['src/lib/hex-viewer.js']),
    // every window FileViewer.open makes is one of the three (hex / editor via their constructors, the viewer above)
    sites: (fv.match(/app\.wm\.createWindow\(/g) || []).length === (fv.match(/new HexViewer\(|new CodeEditor\(|wireFileDownload\(winInfo/g) || []).length,
  };
}
function census(src, kindSet) {
  const w = wiring(src), red = [];
  for (const k of [...kindSet, '(text)', '(binary)']) { const win = WINDOW_OF[k]; if (!win) red.push(`${k}: unlisted`); else if (!w[win]) red.push(`${k}: its ${win} window does not wire the helper`); }
  if (!w.sites) red.push('a window in FileViewer.open is born without a Download');
  return red;
}
const SRC = Object.fromEntries(['src/lib/file-viewer.js', 'src/lib/code-editor.js', 'src/lib/hex-viewer.js'].map((f) => [f, read(f)]));
const fvMod = SRC['src/lib/file-viewer.js'];
const rendered = JSON.parse(fvMod.match(/RENDERED_VIEWERS = new Set\((\[[^\]]*\])\)/)[1].replace(/'/g, '"'));
console.log(`— ① ${exts.length} registered extensions → ${kinds.size} viewer kinds: ${[...kinds].join(', ')}`);
ok(kinds.size >= 10 && rendered.every((k) => WINDOW_OF[k] === 'viewer'), 'every RENDERED_VIEWERS kind opens the viewer window in this census', rendered);
ok(census(SRC, kinds).length === 0, 'every kind the registry routes to (+ text → editor, binary → hex) opens a window that wires the shared Download', census(SRC, kinds));
const c1 = census({ ...SRC, 'src/lib/hex-viewer.js': SRC['src/lib/hex-viewer.js'].replace(', wireFileDownload(winInfo, { path: filePath, host: this._host })', '') }, kinds);
ok(c1.some((r) => r.startsWith('(binary)')), 'control: the hex viewer with its Download unwired ⇒ RED', c1);
const c0 = census({ ...SRC, 'src/lib/code-editor.js': SRC['src/lib/code-editor.js'].replace('const btnDownload = wireFileDownload(winInfo, ', 'const btnDownload = this._btn(') }, kinds);
ok(c0.some((r) => r.startsWith('html-editor:')) && c0.some((r) => r.startsWith('(text):')), 'control: the code editor with a Download button not from the helper ⇒ RED', c0);
const reseat = '      await FileViewer.renderInto(container, filePath, fileName, app, host);\n      FileViewer._seatDownload(container, btnDownload, winInfo.content);\n';
ok(fvMod.includes(reseat), '(the ⟳ handler re-seats the Download after its re-render)');
const c2 = census({ ...SRC, 'src/lib/file-viewer.js': fvMod.replace(reseat, '      await FileViewer.renderInto(container, filePath, fileName, app, host);\n') }, kinds);
ok(c2.some((r) => r.startsWith('docx:')) && c2.some((r) => r.startsWith('image:')), 'control: the viewer without its re-seat after ⟳ (the Download wiped with the old toolbar) ⇒ RED for every viewer kind', c2);
const c3 = census(SRC, new Set([...kinds, 'epub']));
ok(c3.length === 1 && c3[0] === 'epub: unlisted', 'control: a registry kind this census does not list ⇒ RED', c3);

// ── ② the URL builder (DOM-free) + one spelling ──
console.log('— ② the URL builder');
const dlSrc = read('src/lib/file-download.js');
const stubbed = (extra) => 'data:text/javascript,' + encodeURIComponent(extra + '\n' + dlSrc.replace(/^import .*$/gm, ''));
const STUBS = `const T = []; export const toasts = T; const showToast = (m, o = {}) => T.push({ m, type: o.type || 'info' });
const t = (s, v = {}) => s.replace(/\\{(\\w+)\\}/g, (_, k) => v[k]); const UI_ICONS = { download: '<svg></svg>' };
const fsErrorText = (d) => d && d.error ? 'refused: ' + d.error : '';`;
const M = await import(stubbed(STUBS));
const P = '/home/me/报告 (终稿).docx';
const enc = encodeURIComponent(P);
ok(M.fileDownloadUrl(P, '') === `/api/download?path=${enc}` && M.fileDownloadUrl(P) === `/api/download?path=${enc}`, 'this machine: /api/download?path=<the file>, no host', M.fileDownloadUrl(P));
ok(M.fileDownloadUrl(P, 'box') === `/api/download?path=${enc}&host=box`, 'an ssh host: …&host=box', M.fileDownloadUrl(P, 'box'));
ok(M.fileDownloadUrl('C:\\Users\\me\\a.png', 'dev:WIN-DESK1 #2') === `/api/download?path=${encodeURIComponent('C:\\Users\\me\\a.png')}&host=${encodeURIComponent('dev:WIN-DESK1 #2')}`, 'a paired / Windows device id: the id encoded as given (the route resolves it)', M.fileDownloadUrl('C:\\Users\\me\\a.png', 'dev:WIN-DESK1 #2'));
ok(/_hp\(\) \{ return hostParam\(this\._host\); \}/.test(read('src/lib/file-explorer.js')), "Files' _hp() IS the helper's hostParam (one host spelling)");
ok(/label: t\('Download'\), action: \(\) => startFileDownload\(\{ path: fullPath, host: this\._host \|\| '' \}\)/.test(read('src/lib/file-explorer-ops.js')), "Files' row Download starts through the same helper");
const spell = [];
const walk = (d) => { for (const e of fs.readdirSync(path.join(repo, d), { withFileTypes: true })) { const r = path.join(d, e.name); if (e.isDirectory()) walk(r); else if (r.endsWith('.js') && r !== 'src/lib/file-download.js' && /\/api\/download\?path=/.test(read(r))) spell.push(r); } };
walk('src/lib');
ok(spell.length === 0, 'no other /api/download?path= spelling in src/lib', spell);

// ── ③ the helper's behaviour ──
console.log("— ③ the helper's behaviour (stub fetch + document)");
const anchors = [];
globalThis.document = { body: { appendChild(a) { a.inBody = true; } }, createElement: (tag) => { const a = { tag, style: {}, clicked: 0, click() { this.clicked++; }, remove() { this.inBody = false; } }; anchors.push(a); return a; } };
let answer = null;
globalThis.fetch = async (u) => { answer.url = u; return { ok: answer.status === 200, status: answer.status, json: async () => answer.body }; };
answer = { status: 400, body: { error: 'ENOENT' } };
const r1 = await M.startFileDownload({ path: P, host: 'box' });
ok(r1 === false && anchors.length === 0 && M.toasts.length === 1 && M.toasts[0].type === 'error' && M.toasts[0].m === 'Download failed: refused: ENOENT' && answer.url === `/api/file/info?path=${enc}&host=box`, 'a refused stat (on the file\'s machine) is an error toast and no download starts', { r1, anchors, toasts: M.toasts, url: answer.url });
answer = { status: 200, body: { size: 5 } };
const r2 = await M.startFileDownload({ path: P, host: '' });
const a = anchors[0];
ok(r2 === true && a && a.tag === 'a' && a.href === `/api/download?path=${enc}` && a.download === '' && a.clicked === 1 && a.inBody === false && M.toasts.length === 1, 'a start: one temporary <a download> (the route names the file) clicked and removed, no toast', { r2, a, toasts: M.toasts });
await M.startFileDownload({ path: P, host: '', dirty: () => true });
ok(anchors.length === 2 && anchors[1].clicked === 1 && M.toasts.length === 2 && M.toasts[1].m === 'Downloaded the saved version — unsaved changes are not included', 'a dirty editor: the saved copy downloads and one toast says so', M.toasts);

// ── ④ the title-bar menu ──
console.log('— ④ the title-bar menu');
const tb = read('src/lib/taskbar.js');
ok(/registerCommand\(\{ id: 'window\.download', title: \(\) => t\('Download'\), run: \(c\) => startFileDownload\(c\.win\._fileDownload\) \}\)/.test(tb)
  && /command: 'window\.download', kind: 'download', when: \(c\) => !!\(c\.win && c\.win\._fileDownload\)/.test(tb)
  && /import \{ startFileDownload \} from '\.\/file-download\.js'/.test(tb), 'the window menu offers Download on a window carrying a file, through the same helper');
ok(/winInfo\._fileDownload = target;/.test(dlSrc), 'wireFileDownload puts the target on the window record the menu reads');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
