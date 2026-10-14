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
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SETTINGS_ROW_LAYOUT_PNG_DIR || '';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const express = require(path.join(repo, 'node_modules/express'));
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const WebSocket = require(path.join(repo, 'node_modules/ws'));

// ── the pre-fix page: the lane's style.css block and the renderer's stack line taken out (each must exist: a vacuous control proves nothing) ──
const CSS = fs.readFileSync(path.join(repo, 'public/style.css'), 'utf8');
const LANE_CSS = /\/\* SETTINGS ROWS NEVER SQUEEZE THEIR WORDS[\s\S]*?\/\* end: settings rows never squeeze their words \*\/\n?/;
ok(LANE_CSS.test(CSS), 'style.css carries the lane\'s block (the stack + the rail) between its two markers');
const CSS_PRE = CSS.replace(LANE_CSS, '');
const UI = path.join(repo, 'src/lib/settings-ui.js');
const UI_SRC = fs.readFileSync(UI, 'utf8');
const STACK_LINE = "if (control.tagName === 'TEXTAREA' || control.querySelector('textarea')) row.classList.add('settings-row-stack');";
ok(UI_SRC.includes(STACK_LINE), 'the renderer stamps settings-row-stack from the CONTROL it drew (a textarea, or one inside it)');

const root = scratch('settings-row-layout');
const dir = path.join(root, 'web');
fs.mkdirSync(dir, { recursive: true });
const entry = `import { SettingsUI } from ${JSON.stringify(UI)};
import { SETTINGS_SCHEMA, registerPluginSettings } from ${JSON.stringify(path.join(repo, 'src/lib/settings-schema.js'))};
// THE RAIL's fixture (a shape, no real plugin): a select whose one long option makes the control wider than 60 % of a 600 px row
if (new URLSearchParams(location.search).get('fixture')) registerPluginSettings('layout-fixture', 'Layout fixture', [{ key: 'pick', type: 'select', default: 'a',
  options: [{ value: 'a', label: 'Keep each window of this kind on the screen it was last on, across restarts' }, { value: 'b', label: 'Short' }],
  label: 'Where windows open', description: 'A fixture row whose select is wide.' }]);
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
web.get('/:b.js', (req, res) => res.type('js').send(fs.readFileSync(path.join(dir, req.params.b + '.js'))));
web.all(/^\/api\//, (req, res) => res.json({}));
web.get('/', (req, res) => {
  const pre = req.query.pre === '1';
  res.type('html').send(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/${pre ? 'style-pre' : 'style'}.css"><style>body{margin:0;background:var(--bg-root)} #win{background:var(--bg-window);width:${Number(req.query.w)}px;height:${Number(req.query.h)}px;overflow:hidden}</style><script>try{localStorage.setItem('vibespace.lang','zh');localStorage.setItem('vibespace.settingsAdvanced','1')}catch{}</script></head><body><div id="win"></div><script src="/${pre ? 'pre' : 'ui'}.js"></script></body></html>`);
});
const PORT = await freePort();
const srv = await new Promise((r) => { const s = web.listen(PORT, '127.0.0.1', () => r(s)); });

const CDP_PORT = await freePort();
const chromeDir = scratch('settings-row-layout-chrome');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { } try { srv.close(); } catch { } for (const d of [chromeDir, root]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

/** one tab: viewport vw × vh, the Settings window's content w × h, the page now or pre-fix */
async function page({ vw, vh, w, h, pre = false, fixture = false, mobile = false }) {
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
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?w=${w}&h=${h}${pre ? '&pre=1' : ''}${fixture ? '&fixture=1' : ''}` });
  for (let i = 0; i < 200 && !(await ev('window.__ready === true && document.querySelectorAll(".settings-content .settings-row").length > 20').catch(() => false)); i++) await sleep(50);
  await ev('document.fonts.ready.then(() => true)');
  await sleep(150);   // the facts' {} answers and the rows they redraw settle
  const shot = async (file, sel) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    // the section scrolled to the top of the window's content; the clip = the window's width × the section (≤ the viewport)
    const clip = await ev(`(() => { const s = ${sel}; const c = document.querySelector('.settings-content'); c.scrollTop += s.getBoundingClientRect().top - c.getBoundingClientRect().top - 8;
      const r = s.getBoundingClientRect(), wr = document.getElementById('win').getBoundingClientRect(); const y = Math.max(0, r.top - 8);
      return { x: 0, y, width: Math.ceil(wr.width), height: Math.ceil(Math.min(r.bottom + 8, innerHeight) - y), scale: 1 }; })()`);
    const r = await cdp('Page.captureScreenshot', { format: 'png', clip });
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
  ok(tas.length >= 2 && tas.some((r) => r.key === ATT), `${tag}: the page draws its textarea rows (${tas.length}: ${tas.map((r) => r.key).join(', ')}), 我在乎什么 among them`);
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
  ok(railed.every((r) => r.before < 0.4), `${tag}: the rail wrapped ${railed.length} row(s), each one whose words had < 40 % of it before${railed.length ? ' — ' + railed.map((r) => `${r.key} (${r.kind}) ${(100 * r.before).toFixed(1)} %`).join(', ') : ''}`, railed);
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
    ok(A && wrapped(A) && A.info.w >= 0.95 * A.row.w && Math.abs(A.ctl.x + A.ctl.w - (A.row.x + A.row.w)) <= 2, `600 px: the control wraps under the words, at the right; the words take the row — ${fmt(A)}`, A);
    ok(B && !wrapped(B) && B.info.w < 0.4 * B.row.w, `CONTROL 600 px: pre-fix the same row squeezes its words — ${fmt(B)}`, B);
    await pre.shot('rail-600-before.png', SECTION_OF('plugin.layout-fixture.pick'));
    await now.shot('rail-600-after.png', SECTION_OF('plugin.layout-fixture.pick'));
    RESULT.rail600 = { now: fmt(A), pre: fmt(B) };
  } else {
    ok(A && !wrapped(A) && A.info.w >= 0.4 * A.row.w && B && Math.abs(A.info.w - B.info.w) <= 2, `1200 px: with room the control stays beside the words, as before — ${fmt(A)}`, { A, B });
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

console.log('⑤ CONTROL — the pre-fix page (the owner\'s shape)');
{
  const pa = [600, 760, 1200].map((w) => RESULT[w].preAtt), ph = RESULT.phone.preAtt;
  const f = (r) => `${Math.round(r.info.w)} of ${Math.round(r.row.w)} px (${pct(r.info.w, r.row.w)} %), label ${r.lines} line(s)`;
  ok(pa.every((r) => r && !r.stack && r.ta.y < r.info.y + r.info.h - 1 && Math.abs(r.ctl.w - pa[0].ctl.w) <= 2), `CONTROL: pre-fix the box sits BESIDE the words at its own ${Math.round(pa[0] ? pa[0].ctl.w : 0)} px at 600 / 760 / 1200 — the words get only what it leaves: ${pa.map((r, i) => [600, 760, 1200][i] + ' px ' + (r ? f(r) : '?')).join(' · ')}`, pa);
  ok(pa[0] && pa[0].info.w < 0.4 * pa[0].row.w && ph && ph.info.w < 0.4 * ph.row.w && ph.lines > 2, `CONTROL: pre-fix the words are a sliver — 600 px ${pa[0] ? f(pa[0]) : '?'}; phone ${ph ? f(ph) : '?'} ⇒ leg ① is the lane's doing (RED without it)`, { p600: pa[0], phone: ph });
}

if (process.env.SETTINGS_ROW_LAYOUT_JSON) fs.writeFileSync(process.env.SETTINGS_ROW_LAYOUT_JSON, JSON.stringify(RESULT, null, 1));
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);
