#!/usr/bin/env node
// test-settings-row-layout — HEAVY (lane settings-multiline-row, owner 2026-10-14 「这个地方布局有点问题」: All Settings ›
// 插件 › LLM › 「我在乎什么」 — the multi-line box kept its own width and crushed the row's words to a
// ~80 px sliver, the label wrapped five lines). The REAL SettingsUI.open() (an esbuild iife of the tree) in headless chrome
// (zh, light, advanced rows shown) over a stub hub (every /api read answers {}), the REAL style.css, the Settings window's
// content at 600 / 760 (the owner's) / 1200 px on a desk viewport and at 390 px on a phone:
//   ① every row whose control holds a textarea STACKS (settings-row-stack): the words span the row (≥ 60 %), the label
//     ≤ 2 lines at 760, the box ≥ 95 % of the row and under the words, its buttons on one line under the box, right-aligned
//   ② no other row moves: every other row's own rects (row-relative: the words' x / width, the control's x / y / size, the
//     row's size) equal the pre-fix page's within 2 px at each width — except a row THE RAIL wraps, and the rail wraps
//     only a row whose words had < 40 % of it before
//   ③ THE RAIL (style.css: flex-wrap + the words' min-width 40 %): a fixture plugin row whose select carries one long
//     option wraps its control under the words, at the right, at 600 px — and stays beside them at 1200 px
//   ④ the phone (390 px): the textarea rows stacked the same; no row wider than the window
//   ④b A CONTROL NEVER OUTGROWS ITS ROW (B-0406 — a select is as wide as its longest option: one long option label pushed a
//     row 48 px past a 390 px phone): the phone with THE RAIL's fixture — every row, its control and every select inside
//     the window; the fixture's CLOSED select cut (narrower than its longest option), its options whole; CONTROL: the page
//     without style.css's B-0406 block — the fixture's control runs past the window; and (r1514 / r1693, the 390 census's one
//     real red) Claude's effort box with the hub's own list — its last row a sentence, written as app.js writes it — inside its
//     row in en, and its closed face cut — judged by a long entry the leg adds itself (r1906: never the hub's list and a font's
//     luck); CONTROL: the page without B-0406's combobox line, the box runs past its row (two pages)
//   ⑥ the same law swept: 280 / 360 / 390 / 600 / 1024 / 1440 px × the light and the dark face × en / zh / ja, the fixture on:
//     no row, no control, no select past its row or the window, the window's content never scrolls sideways
//   ⑤ CONTROL — the pre-fix page (style.css without the lane's block, the renderer without the stack class): the box
//     beside the words at one fixed width at 600 / 760 / 1200, the words < 40 % of the row at 600 px and on the phone
//     (the owner's shape), and the fixture's words < 40 % at 600 px (③)
// PNGs → SETTINGS_ROW_LAYOUT_PNG_DIR: decision-{600,760}-{before,after}.png (the LLM plugin section: the box + its
// switch rows), rail-600-{before,after}.png, phone-390-{before,after}.png (the 我在乎什么 row).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE, CHROME_STORE, CHROME_QUIET } from './scratch.mjs';
import { frontState, becameFront, frontShot, bringTab } from './cdp-front-shot.mjs';   // a picture is of the page in front (r1354)

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SETTINGS_ROW_LAYOUT_PNG_DIR || '';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const express = require(path.join(repo, 'node_modules/express'));
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const WebSocket = require(path.join(repo, 'node_modules/ws'));

// ── the pre-fix page: the lane's style.css block and the renderer's stack line taken out (each must exist: a vacuous control proves nothing) ──
const CSS = fs.readFileSync(path.join(repo, 'public/style.css'), 'utf8');
const LANE_CSS = /\/\* SETTINGS ROWS NEVER SQUEEZE THEIR WORDS[\s\S]*?\/\* end: settings rows never squeeze their words \*\/\n?/;
ok(verdictOf(LANE_CSS.test(CSS)), 'style.css carries the lane\'s block (the stack + the rail) between its two markers');
const CSS_PRE = CSS.replace(LANE_CSS, '');
const CAP_CSS = /\/\* A CONTROL NEVER OUTGROWS ITS ROW \(B-0406[\s\S]*?\/\* end: a control never outgrows its row \*\/\n?/;
ok(verdictOf(CAP_CSS.test(CSS)), 'style.css carries B-0406\'s block (a control capped at its row, a select that shrinks with it) between its two markers');
const CSS_NOCAP = CSS.replace(CAP_CSS, '');
// r1514 / r1693: the COMBOBOX line inside B-0406's block (Settings › Claude's effort box at 390); the page without just that line is the
// control that proves the line is what holds the box
const COMBO_LINE = '.settings-row-control > .settings-combobox { min-width: 0; max-width: 100%; }\n';
ok(gateOf((CAP_CSS.exec(CSS) || [''])[0].includes(COMBO_LINE)) && CSS.indexOf(COMBO_LINE) === CSS.lastIndexOf(COMBO_LINE), 'B-0406\'s block holds the combobox line, once (a combobox shrinks with its control like a select)');
const CSS_NOCOMBO = CSS.replace(COMBO_LINE, '');
const UI = path.join(repo, 'src/lib/settings-ui.js');
const UI_SRC = fs.readFileSync(UI, 'utf8');
const STACK_LINE = "if (control.tagName === 'TEXTAREA' || control.querySelector('textarea')) row.classList.add('settings-row-stack');";
ok(verdictOf(UI_SRC.includes(STACK_LINE)), 'the renderer stamps settings-row-stack from the CONTROL it drew (a textarea, or one inside it)');

const root = scratch('settings-row-layout');
const dir = path.join(root, 'web');
fs.mkdirSync(dir, { recursive: true });
// r1906: the leg's OWN long effort entry — the «closed face cut» is judged by it, never by the hub's list and a font's luck (the box
// row 164 at 9c3a59b01: the hub's longest option measured 330 px of text against a 358 px row, its box 368 px without the line)
const EFFORT_OWN = 'A long effort entry this leg makes itself, wider than any phone row, so the closed box must cut its words';
const entry = `import { SettingsUI } from ${JSON.stringify(UI)};
import { SETTINGS_SCHEMA, registerPluginSettings } from ${JSON.stringify(path.join(repo, 'src/lib/settings-schema.js'))};
import { effortOptions, BACKEND_META } from ${JSON.stringify(path.join(repo, 'src/lib/agent-meta.js'))};
// THE RAIL's fixture (a shape, no real plugin): a select whose one long option makes the control wider than 60 % of a 600 px row
if (new URLSearchParams(location.search).get('fixture')) registerPluginSettings('layout-fixture', 'Layout fixture', [{ key: 'pick', type: 'select', default: 'a',
  options: [{ value: 'a', label: 'Keep each window of this kind on the screen it was last on, across restarts' }, { value: 'b', label: 'Short' }],
  label: 'Where windows open', description: 'A fixture row whose select is wide.' }]);
// THE HUB's OWN EFFORT LIST (r1514 / r1693): app.js writes claude.defaultEffort's options from /api/session-options — the levels the
// CLI's help lists, then the declared extras (ultracode, whose words are a sentence); this stub answers {} to every read, so
// the fixture writes the list as app.js does (agent-meta.js effortOptions over the levels a current CLI lists)
if (new URLSearchParams(location.search).get('fixture')) SETTINGS_SCHEMA['claude.defaultEffort'].options = effortOptions('claude', ['low', 'medium', 'high', 'xhigh', 'max'], BACKEND_META.claude.ui.effortExtras, { head: { value: '', label: 'Auto (model default)' } }).map((e) => ({ value: e.value, label: e.label })).concat([{ value: 'fit-own-long', label: ${JSON.stringify(EFFORT_OWN)} }]);
const vals = {}, ls = {};
const def = (k) => (SETTINGS_SCHEMA[k] ? SETTINGS_SCHEMA[k].default : undefined);
const settings = {
  get: (k) => (k in vals ? vals[k] : def(k)), set: (k, v) => { vals[k] = v; for (const f of [...(ls[k] || [])]) f(v); },
  isModified: (k) => k in vals && vals[k] !== def(k), reset: (k) => { delete vals[k]; }, resetAll: () => {},
  on: (k, f) => { (ls[k] = ls[k] || new Set()).add(f); }, off: (k, f) => { if (ls[k]) ls[k].delete(f); },
};
const win = document.getElementById('win');
const app = { settings, isMobile: innerWidth <= 768, ws: { onGlobal: () => () => {}, offGlobal() {}, onStateChange() {}, offStateChange() {} },
  wm: { windows: new Map(), createWindow: () => ({ id: 'settings-1', content: win }), revealWindow() {} } };
app._settingsUI = new SettingsUI(app);
app._settingsUI.open();
window.__ready = true;`;
const build = (name, plugins = []) => esbuild.build({ stdin: { contents: entry, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'error', plugins });
await build('ui.js');
const preRenderer = { name: 'no-stack', setup(b) { b.onLoad({ filter: /settings-ui\.js$/ }, () => ({ contents: UI_SRC.replace(STACK_LINE, ''), loader: 'js', resolveDir: path.dirname(UI) })); } };
await build('pre.js', [preRenderer]);

// ── the page server: the bundles + style.css (now / pre-fix); every /api read answers {} (an unknown fact hides nothing) ──
const web = express();
web.get('/style.css', (req, res) => res.type('css').send(CSS));
web.get('/style-pre.css', (req, res) => res.type('css').send(CSS_PRE));
web.get('/style-nocap.css', (req, res) => res.type('css').send(CSS_NOCAP));
web.get('/style-nocombo.css', (req, res) => res.type('css').send(CSS_NOCOMBO));
web.get('/:b.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(dir, req.params.b + '.js'))));
web.all(/^\/api\//, (req, res) => res.json({}));
web.get('/', (req, res) => {
  const pre = req.query.pre === '1', nocap = req.query.nocap === '1', nocombo = req.query.nocombo === '1';
  const lang = ['en', 'zh', 'ja'].includes(req.query.lang) ? req.query.lang : 'zh', theme = req.query.theme === 'dark' ? 'dark' : 'light';
  res.type('html').send(`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/${pre ? 'style-pre' : nocap ? 'style-nocap' : nocombo ? 'style-nocombo' : 'style'}.css"><style>body{margin:0;background:var(--bg-root)} #win{background:var(--bg-window);width:${Number(req.query.w)}px;height:${Number(req.query.h)}px;overflow:hidden}</style><script>try{localStorage.setItem('vibespace.lang','${lang}');localStorage.setItem('vibespace.settingsAdvanced','1')}catch{}</script></head><body><div id="win"></div><script src="/${pre ? 'pre' : 'ui'}.js"></script></body></html>`);
});
const PORT = await freePort();
const srv = await new Promise((r) => { const s = web.listen(PORT, '127.0.0.1', () => r(s)); });

const CDP_PORT = await freePort();
const chromeDir = scratch('settings-row-layout-chrome');
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { } try { srv.close(); } catch { } for (const d of [chromeDir, root]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

// A PICTURE IS OF THE PAGE IN FRONT (主开发 r1354; test-ci-gate §2o's page factory): page() opens each page with /json/new, which Chrome puts in FRONT
// (`now`, then `pre` beside it: now's pictures were of a page behind pre).
// ONE front state; every picture goes through frontShot (its page brought to the front only when it is not there, bounded,
// one retry said by name, the front handed back to the page that had it, so each other leg runs with the page in front it had)
const FS = frontState();
/** one tab: viewport vw × vh, the Settings window's content w × h, the page now or pre-fix */
async function page({ vw, vh, w, h, pre = false, fixture = false, mobile = false, nocap = false, nocombo = false, lang = 'zh', theme = 'light' }) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 2, mobile });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result?.result?.value; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?w=${w}&h=${h}${pre ? '&pre=1' : ''}${fixture ? '&fixture=1' : ''}${nocap ? '&nocap=1' : ''}${nocombo ? '&nocombo=1' : ''}&lang=${lang}&theme=${theme}` });
  for (let i = 0; i < 200 && !(await ev('window.__ready === true && document.querySelectorAll(".settings-content .settings-row").length > 20').catch(() => false)); i++) await sleep(50);
  await ev('document.fonts.ready.then(() => true)');
  await sleep(150);   // the facts' {} answers and the rows they redraw settle
  const bring = bringTab(CDP_PORT, tg.id);   // the browser's own door: close() below drops only the socket, the tab stays
  becameFront(FS, tg.id, bring);   // /json/new put this tab in front
  const shot = async (file, sel) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    // the section scrolled to the top of the window's content; the clip = the window's width × the section (≤ the viewport)
    const clip = await ev(`(() => { const s = ${sel}; const c = document.querySelector('.settings-content'); c.scrollTop += s.getBoundingClientRect().top - c.getBoundingClientRect().top - 8;
      const r = s.getBoundingClientRect(), wr = document.getElementById('win').getBoundingClientRect(); const y = Math.max(0, r.top - 8);
      return { x: 0, y, width: Math.ceil(wr.width), height: Math.ceil(Math.min(r.bottom + 8, innerHeight) - y), scale: 1 }; })()`);
    const r = await frontShot(FS, tg.id, bring, () => cdp('Page.captureScreenshot', { format: 'png', clip }), { name: `the picture ${file}` });
    fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.result.data, 'base64'));
  };
  return { ev, shot, close: () => { try { ws.close(); } catch { } } };
}

// every drawn row: its key (the settings path; a link row by its label), its control's kind, the rects, the label's lines
const MEASURE = `(() => {
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const seen = new Map();
  return [...document.querySelectorAll('.settings-content .settings-row')].filter((row) => row.getBoundingClientRect().width > 0).map((row) => {
    const info = row.querySelector(':scope > .settings-row-info'), ctl = row.querySelector(':scope > .settings-row-control');
    // the Spending section's producer row (a fact line + a door, no words / control pair): its children's own rects
    if (!info) { const spend = row.classList.contains('settings-spend-producer'); return { key: (spend ? 'spend:' + row.dataset.spendProducer : 'other:' + row.className), kind: spend ? 'spend' : 'other', spend, row: R(row), kids: [...row.children].map(R) }; }
    const label = row.querySelector('.settings-row-label');
    const base = row.querySelector('.settings-row-path')?.textContent || ('link:' + (label ? label.textContent : '?'));
    const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    const ta = row.querySelector('textarea');
    const kind = ta ? 'textarea' : row.classList.contains('settings-link-row') ? 'link' : row.querySelector('.settings-toggle') ? 'toggle'
      : row.querySelector('.settings-input-number') ? 'number' : row.querySelector('.settings-radio-group') ? 'radio' : row.querySelector('.settings-slider') ? 'slider'
      : row.querySelector('.settings-multi-select') ? 'multi' : row.querySelector('.settings-combobox') ? 'combobox' : row.querySelector('select') ? 'select'
      : row.querySelector('.settings-input-text') ? 'text' : 'other';
    const tn = label && [...label.childNodes].find((x) => x.nodeType === 3);
    let lines = 0;
    if (tn) { const rg = document.createRange(); rg.selectNodeContents(tn); lines = new Set([...rg.getClientRects()].map((r) => Math.round(r.top))).size; }
    const out = { key: n > 1 ? base + '#' + n : base, kind, stack: row.classList.contains('settings-row-stack'), spend: !!row.querySelector('.settings-spend-producer'), row: R(row), info: R(info), ctl: ctl ? R(ctl) : null, lines };
    if (ta) { out.ta = R(ta); out.btns = [...row.querySelectorAll('.settings-row-control button')].filter((b) => b.getClientRects().length).map((b) => ({ t: b.textContent, ...R(b) })); }
    return out;
  });
})()`;
// the section that draws the row ITSELF (a block's copy of it — the 需关注 block under Channels — sits inside .settings-block)
const SECTION_OF = (p) => `[...document.querySelectorAll('.settings-content .settings-row-path')].find((e) => e.textContent === ${JSON.stringify(p)} && !e.closest('.settings-block')).closest('.settings-section')`;
const ROW_OF = (p) => `[...document.querySelectorAll('.settings-content .settings-row-path')].find((e) => e.textContent === ${JSON.stringify(p)} && !e.closest('.settings-block')).closest('.settings-row')`;
const pct = (a, b) => Math.round((100 * a) / b);
const rel = (r) => (!r.info ? Object.assign({ rw: r.row.w, rh: r.row.h }, ...r.kids.map((k, i) => ({ ['k' + i + 'x']: k.x - r.row.x, ['k' + i + 'y']: k.y - r.row.y, ['k' + i + 'w']: k.w, ['k' + i + 'h']: k.h }))) : { ix: r.info.x - r.row.x, iw: r.info.w, cx: r.ctl ? r.ctl.x - r.row.x : 0, cy: r.ctl ? r.ctl.y - r.row.y : 0, cw: r.ctl ? r.ctl.w : 0, ch: r.ctl ? r.ctl.h : 0, rw: r.row.w, rh: r.row.h });
const wrapped = (r) => !!r.info && !!r.ctl && !r.stack && r.ctl.y >= r.info.y + r.info.h - 1;   // the control on its own line under the words
const ATT = 'decision.attentionBlock';

/** ① the textarea rows of one page, judged */
function judgeStacks(tag, rows, { w }) {
  const tas = rows.filter((r) => r.kind === 'textarea');
  ok(tas.length >= 2 && verdictOf(tas.some((r) => r.key === ATT)), `${tag}: the page draws its textarea rows (${tas.length}: ${tas.map((r) => r.key).join(', ')}), 我在乎什么 among them`);
  const bad = [];
  for (const r of tas) {
    const why = [];
    if (!r.stack) why.push('no settings-row-stack');
    if (r.info.w < 0.6 * r.row.w) why.push(`words ${pct(r.info.w, r.row.w)} %`);
    if (r.ta.w < 0.95 * r.row.w) why.push(`box ${pct(r.ta.w, r.row.w)} %`);
    if (r.ta.y < r.info.y + r.info.h - 1) why.push('box beside the words');
    if (w === 760 && r.lines > 2) why.push(`label ${r.lines} lines`);
    if (r.btns.length) {
      if (r.btns.some((b) => Math.abs(b.y - r.btns[0].y) > 2)) why.push('buttons on more than one line');
      if (r.btns.some((b) => b.y < r.ta.y + r.ta.h - 1)) why.push('a button beside the box');
      const right = Math.max(...r.btns.map((b) => b.x + b.w));
      if (Math.abs(right - (r.info.x + r.info.w)) > 2) why.push(`buttons end ${Math.round(r.info.x + r.info.w - right)} px short of the right edge`);
    }
    if (why.length) bad.push(`${r.key}: ${why.join(', ')}`);
  }
  ok(!bad.length, `${tag}: every textarea row stacks — words ≥ 60 % of the row, box ≥ 95 % under them, buttons one line right-aligned${w === 760 ? ', label ≤ 2 lines' : ''}`, bad);
  const att = tas.find((r) => r.key === ATT);
  if (att) console.log(`      ${ATT} @${w}: row ${Math.round(att.row.w)} px · words ${Math.round(att.info.w)} px (${pct(att.info.w, att.row.w)} %) · box ${Math.round(att.ta.w)} px (${pct(att.ta.w, att.row.w)} %) · label ${att.lines} line(s) · buttons ${att.btns.map((b) => b.t).join(' | ')}`);
  return att;
}

/** ② the other rows of one page vs the pre-fix page: each keeps its own rects, or the rail wrapped it — only one squeezed before */
function sameRows(tag, A, B) {
  const byKey = new Map(B.map((r) => [r.key, r]));
  const moved = [], railed = [], missing = [];
  let same = 0;
  for (const a of A) {
    if (a.kind === 'textarea') continue;
    const b = byKey.get(a.key);
    if (!b) { missing.push(a.key); continue; }
    if (wrapped(a) && !wrapped(b)) { railed.push({ key: a.key, kind: a.kind, before: b.info.w / b.row.w }); continue; }
    const ra = rel(a), rb = rel(b);
    const d = Object.keys(ra).filter((k) => Math.abs(ra[k] - rb[k]) > 2);
    if (d.length) moved.push(`${a.key} (${a.kind}): ${d.map((k) => `${k} ${Math.round(rb[k])}→${Math.round(ra[k])}`).join(' ')}`); else same++;
  }
  const kinds = [...new Set(A.filter((r) => r.kind !== 'textarea').map((r) => r.kind))].sort();
  ok(!missing.length && B.length === A.length, `${tag}: the same ${A.length} rows drawn before and after`, { missing, before: B.length, after: A.length });
  ok(same >= 40 && !moved.length, `${tag}: ${same} other rows (${kinds.join(' / ')}) keep their own rects within 2 px`, moved);
  ok(verdictOf(railed.every((r) => r.before < 0.4)), `${tag}: the rail wrapped ${railed.length} row(s), each one whose words had < 40 % of it before${railed.length ? ' — ' + railed.map((r) => `${r.key} (${r.kind}) ${(100 * r.before).toFixed(1)} %`).join(', ') : ''}`, railed);
  return railed.map((r) => ({ ...r, before: Math.round(1000 * r.before) / 10 }));
}

const RESULT = {};
const DESK = { vw: 1600, vh: 1400, h: 1360 };
console.log('①② the Settings window at 600 / 760 / 1200 px — the textarea rows stack; no other row moves (vs the pre-fix page)');
for (const w of [600, 760, 1200]) {
  const now = await page({ ...DESK, w });
  const pre = await page({ ...DESK, w, pre: true });
  const A = await now.ev(MEASURE), B = await pre.ev(MEASURE);
  const att = judgeStacks(`${w} px`, A, { w });
  const preAtt = B.find((r) => r.key === ATT);
  RESULT[w] = { att, preAtt, rows: A.length };
  if (w !== 1200) {
    await pre.shot(`decision-${w}-before.png`, SECTION_OF(ATT));
    await now.shot(`decision-${w}-after.png`, SECTION_OF(ATT));
  }
  RESULT[w].railed = sameRows(`${w} px`, A, B);
  now.close(); pre.close();
}

console.log('③ THE RAIL — a fixture select with one long option');
for (const w of [600, 1200]) {
  const now = await page({ ...DESK, w, fixture: true });
  const pre = await page({ ...DESK, w, fixture: true, pre: true });
  const A = (await now.ev(MEASURE)).find((r) => r.key === 'plugin.layout-fixture.pick');
  const B = (await pre.ev(MEASURE)).find((r) => r.key === 'plugin.layout-fixture.pick');
  const fmt = (r) => r && `words ${Math.round(r.info.w)} / ${Math.round(r.row.w)} px (${pct(r.info.w, r.row.w)} %), control ${Math.round(r.ctl.w)} px${wrapped(r) ? ' under the words' : ' beside them'}`;
  if (w === 600) {
    ok(gateOf(A) && gateOf(wrapped(A)) && A.info.w >= 0.95 * A.row.w && Math.abs(A.ctl.x + A.ctl.w - (A.row.x + A.row.w)) <= 2, `600 px: the control wraps under the words, at the right; the words take the row — ${fmt(A)}`, A);
    ok(gateOf(B) && !wrapped(B) && B.info.w < 0.4 * B.row.w, `CONTROL 600 px: pre-fix the same row squeezes its words — ${fmt(B)}`, B);
    await pre.shot('rail-600-before.png', SECTION_OF('plugin.layout-fixture.pick'));
    await now.shot('rail-600-after.png', SECTION_OF('plugin.layout-fixture.pick'));
    RESULT.rail600 = { now: fmt(A), pre: fmt(B) };
  } else {
    ok(gateOf(A) && !wrapped(A) && A.info.w >= 0.4 * A.row.w && gateOf(B) && Math.abs(A.info.w - B.info.w) <= 2, `1200 px: with room the control stays beside the words, as before — ${fmt(A)}`, { A, B });
    RESULT.rail1200 = fmt(A);
  }
  now.close(); pre.close();
}

console.log('④ the phone — 390 px');
{
  const now = await page({ vw: 390, vh: 844, w: 390, h: 844, mobile: true });
  const pre = await page({ vw: 390, vh: 844, w: 390, h: 844, mobile: true, pre: true });
  const A = await now.ev(MEASURE), B = await pre.ev(MEASURE);
  RESULT.phone = { att: judgeStacks('390 px', A, { w: 390 }), preAtt: B.find((r) => r.key === ATT && !r.stack) };
  RESULT.phone.railed = sameRows('390 px', A, B);
  const wide = A.filter((r) => r.row.x + r.row.w > 390.5 || (r.ctl && r.ctl.x + r.ctl.w > 390.5)).map((r) => r.key);
  ok(!wide.length, 'phone: no row (nor its control) wider than the window', wide);
  await pre.shot('phone-390-before.png', ROW_OF(ATT));
  await now.shot('phone-390-after.png', ROW_OF(ATT));
  now.close(); pre.close();
}

// B-0406: every row, its control and every select in it inside its row and the window; the fixture's select, closed and open
const FIT = (w) => `(() => {
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, w: r.width, r: r.right }; };
  const c = document.querySelector('.settings-content'), out = [];
  for (const row of document.querySelectorAll('.settings-content .settings-row')) {
    const rr = R(row); if (!rr.w) continue;
    const key = row.querySelector('.settings-row-path')?.textContent || row.className;
    if (rr.r > ${w} + 0.5) out.push(key + ': the row ends at ' + Math.round(rr.r));
    const ctl = row.querySelector(':scope > .settings-row-control');
    if (ctl && ctl.getClientRects().length && R(ctl).r > rr.r + 0.5) out.push(key + ': its control ends ' + Math.round(R(ctl).r - rr.r) + ' px past the row');
    for (const sel of row.querySelectorAll('select')) if (sel.getClientRects().length && R(sel).r > rr.r + 0.5) out.push(key + ': a select ends ' + Math.round(R(sel).r - rr.r) + ' px past the row');
  }
  const fx = [...document.querySelectorAll('.settings-content .settings-row-path')].find((e) => e.textContent === 'plugin.layout-fixture.pick')?.closest('.settings-row');
  const sel = fx && fx.querySelector('select'), cs = sel && getComputedStyle(sel);
  const cv = document.createElement('canvas').getContext('2d'); if (cs) cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
  const opts = sel ? [...sel.options].map((o) => ({ t: o.textContent, w: Math.round(cv.measureText(o.textContent).width) })) : [];
  // r1514 / r1693: Claude's effort box (a combobox) with the hub's own list — its row, box and closed select, its longest option
  const ef = [...document.querySelectorAll('.settings-content .settings-row-path')].find((e) => e.textContent === 'claude.defaultEffort')?.closest('.settings-row');
  const eb = ef && ef.querySelector('.settings-combobox'), es = eb && eb.querySelector('select'), ecs = es && getComputedStyle(es);
  const cv2 = document.createElement('canvas').getContext('2d'); if (ecs) cv2.font = ecs.fontWeight + ' ' + ecs.fontSize + ' ' + ecs.fontFamily;
  const eo = es ? [...es.options].map((o) => ({ t: o.textContent, w: Math.round(cv2.measureText(o.textContent).width) })) : [];
  return { bad: out, sideways: c ? c.scrollWidth - c.clientWidth : null, rows: document.querySelectorAll('.settings-content .settings-row').length,
    fixture: fx ? { row: Math.round(R(fx).w), ctl: Math.round(R(fx.querySelector(':scope > .settings-row-control')).w), sel: Math.round(R(sel).w), longest: Math.max(...opts.map((o) => o.w)), opts: opts.map((o) => o.t) } : null,
    effort: es ? { row: Math.round(R(ef).w), rowR: Math.round(R(ef).r), boxR: Math.round(R(eb).r), box: Math.round(R(eb).w), sel: Math.round(R(es).w), selR: Math.round(R(es).r), longest: Math.max(...eo.map((o) => o.w)), long: (eo.find((o) => o.t.startsWith('Ultracode')) || {}).t || null, ownW: (eo.find((o) => o.t === ${JSON.stringify(EFFORT_OWN)}) || {}).w || null } : null };
})()`;
const LONG_OPT = 'Keep each window of this kind on the screen it was last on, across restarts';

console.log('④b A CONTROL NEVER OUTGROWS ITS ROW (B-0406) — the phone, 390 px, with a select whose one option is long');
{
  const now = await page({ vw: 390, vh: 844, w: 390, h: 844, mobile: true, fixture: true });
  const raw = await page({ vw: 390, vh: 844, w: 390, h: 844, mobile: true, fixture: true, nocap: true });
  const A = await now.ev(FIT(390)), B = await raw.ev(FIT(390));
  const fx = (f) => f ? `row ${f.row} px, control ${f.ctl} px, the closed select ${f.sel} px of its longest option's ${f.longest}` : 'no fixture row';
  console.log(`      now: ${fx(A.fixture)} · sideways ${A.sideways} px · ${A.bad.length} past · without the cap: ${fx(B.fixture)} · sideways ${B.sideways} px · ${B.bad.length} past${B.bad.length ? ' (' + B.bad.slice(0, 3).join('; ') + ')' : ''}`);
  ok(A.rows > 20 && !A.bad.length && A.sideways <= 1, `phone: every row, its control and every select inside the row and the window (${A.rows} rows, sideways ${A.sideways} px)`, A.bad);
  ok(!!A.fixture && A.fixture.sel <= A.fixture.row + 0.5 && A.fixture.sel < A.fixture.longest && verdictOf(A.fixture.opts.includes(LONG_OPT)),
    `phone: the long option's CLOSED select is cut to its row (${fx(A.fixture)}); the list keeps the option whole («${LONG_OPT.slice(0, 24)}…»)`, A.fixture);
  ok(!!B.fixture && verdictOf(B.bad.some((x) => x.startsWith('plugin.layout-fixture.pick'))),
    `CONTROL: without style.css's B-0406 block the same control runs past the window (${B.bad.filter((x) => x.startsWith('plugin.layout-fixture.pick')).join('; ') || 'NOT — the control is vacuous'})`, B);
  // r1514 / r1693 — THE CENSUS's ONE REAL RED: Claude's effort box with the hub's own list (its last row a sentence) inside its
  // row — read in en, where the sentence is widest (the census: 144 px past a 390 phone in en, 27 in zh; the zh page above holds every
  // row inside too); CONTROL: B-0406's block without its combobox line — the box keeps the sentence's width and runs past
  const ne = await page({ vw: 390, vh: 844, w: 390, h: 844, mobile: true, fixture: true, lang: 'en' });
  const nc = await page({ vw: 390, vh: 844, w: 390, h: 844, mobile: true, fixture: true, nocombo: true, lang: 'en' });
  const E = await ne.ev(FIT(390)), D = await nc.ev(FIT(390));
  const efw = (f) => f ? `row ${f.row} px, the box ${f.box} px, its closed select ${f.sel} px of its longest option's ${f.longest}` : 'no effort row';
  console.log(`      the effort box (en) now: ${efw(E.effort)} · sideways ${E.sideways} px · without the combobox line: ${efw(D.effort)} · sideways ${D.sideways} px`);
  ok(!!E.effort && !!E.effort.long && !E.bad.length && E.sideways <= 1 && E.effort.boxR <= E.effort.rowR + 0.5 && E.effort.selR <= E.effort.rowR + 0.5,
    `phone (en): Claude's effort box with the hub's own list («${String(E.effort && E.effort.long).slice(0, 24)}…») and the leg's own long entry stays inside its row (${efw(E.effort)})`, { effort: E.effort, bad: E.bad });
  // r1906: THE CUT, judged where the longest option is really wider than the row — by the leg's own entry (its premise said by name)
  ok(!!E.effort && E.effort.ownW > E.effort.row && E.effort.sel < E.effort.ownW,
    E.effort && !(E.effort.ownW > E.effort.row) ? `phone (en): THE PREMISE — the leg's own long entry is not wider than the row (${E.effort && E.effort.ownW} of ${E.effort && E.effort.row} px): it cannot judge a cut`
      : `phone (en): the box's closed face is cut — its select ${E.effort && E.effort.sel} px against the leg's own entry's ${E.effort && E.effort.ownW} px of words (the open list shows them whole)`, E.effort);
  ok(!!D.effort && verdictOf(D.bad.some((x) => x.startsWith('claude.defaultEffort'))),
    `CONTROL: without the combobox line the effort box runs past its row (${D.bad.filter((x) => x.startsWith('claude.defaultEffort')).join('; ') || 'NOT — the control is vacuous'})`, D);
  ne.close(); nc.close();
  await now.shot('cap-390-after.png', ROW_OF('plugin.layout-fixture.pick'));
  await raw.shot('cap-390-before.png', ROW_OF('plugin.layout-fixture.pick'));
  RESULT.cap390 = { now: A.fixture, raw: B.fixture, rawPast: B.bad, effort: E.effort, effortNoCombo: D.effort };
  now.close(); raw.close();
}

console.log('⑥ the same law, swept — 280 … 1440 px × light / dark × en / zh / ja, the fixture on');
{
  const bad = [], seen = [];
  for (const lang of ['en', 'zh', 'ja']) for (const theme of ['light', 'dark']) for (const w of [280, 360, 390, 600, 1024, 1440]) {
    const phone = w <= 768;
    const pg = await page(phone ? { vw: w, vh: 844, w, h: 844, mobile: true, fixture: true, lang, theme } : { vw: Math.max(w + 160, 1600), vh: 1400, w, h: 1360, fixture: true, lang, theme });
    const m = await pg.ev(FIT(w));
    seen.push(`${lang}/${theme}/${w}: ${m.rows} rows, fixture control ${m.fixture ? m.fixture.ctl : '—'} px of ${m.fixture ? m.fixture.row : '—'}, sideways ${m.sideways}`);
    if (m.rows < 20 || !m.fixture) bad.push(`${lang}/${theme}/${w}: the page drew ${m.rows} rows${m.fixture ? '' : ', no fixture row'}`);
    for (const x of m.bad) bad.push(`${lang}/${theme}/${w}: ${x}`);
    if (m.sideways > 1) bad.push(`${lang}/${theme}/${w}: the window's content scrolls ${m.sideways} px sideways`);
    if (lang === 'zh' && theme === 'light' && w === 390) await pg.shot('cap-sweep-zh-390.png', SECTION_OF('plugin.layout-fixture.pick'));
    pg.close();
  }
  for (const line of seen) console.log('      ' + line);
  ok(seen.length === 36 && !bad.length, `36 pages (6 widths × 2 faces × 3 languages): no row, control or select past its row or the window, nothing scrolls sideways`, bad.slice(0, 12));
}

console.log('⑤ CONTROL — the pre-fix page (the owner\'s shape)');
{
  const pa = [600, 760, 1200].map((w) => RESULT[w].preAtt), ph = RESULT.phone.preAtt;
  const f = (r) => `${Math.round(r.info.w)} of ${Math.round(r.row.w)} px (${pct(r.info.w, r.row.w)} %), label ${r.lines} line(s)`;
  ok(verdictOf(pa.every((r) => r && !r.stack && r.ta.y < r.info.y + r.info.h - 1 && Math.abs(r.ctl.w - pa[0].ctl.w) <= 2)), `CONTROL: pre-fix the box sits BESIDE the words at its own ${Math.round(pa[0] ? pa[0].ctl.w : 0)} px at 600 / 760 / 1200 — the words get only what it leaves: ${pa.map((r, i) => [600, 760, 1200][i] + ' px ' + (r ? f(r) : '?')).join(' · ')}`, pa);
  ok(gateOf(pa[0]) && pa[0].info.w < 0.4 * pa[0].row.w && gateOf(ph) && ph.info.w < 0.4 * ph.row.w && ph.lines > 2, `CONTROL: pre-fix the words are a sliver — 600 px ${pa[0] ? f(pa[0]) : '?'}; phone ${ph ? f(ph) : '?'} ⇒ leg ① is the lane's doing (RED without it)`, { p600: pa[0], phone: ph });
}

if (process.env.SETTINGS_ROW_LAYOUT_JSON) fs.writeFileSync(process.env.SETTINGS_ROW_LAYOUT_JSON, JSON.stringify(RESULT, null, 1));
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
