#!/usr/bin/env node
// test-masked-note-chrome — lane mask-value-shape (the owner 2026-11-07): THE MASKED ROADS' COST (r4 M4 + r5 M1's full-width pairs + r7 M8's dash storms + r8's trailing runs before a stop + r9's chat path / file-URL passes, by the count) + r6 (m7) THE WINDOW'S VERBATIM COMMAND (the note after its <pre>) + A MASKED LINK'S NOTE IS SEEN WHOLE on the surfaces that draw an
// agent's words as text — the session properties «Now» row (r4 m6: an owner-length URL is one unbreakable word; r3's `overflow: visible`
// let the flex value take its width — the note 55–85 % visible and «Change…» pushed out of the pane at 360 / 440 px), the progress note
// (task-log), the stash line, the IM group message — at 360 / 440 / 900 px.
//
// Scene: the REAL src/lib/session-props.js `statusNowHtml`, src/lib/foryou-links.js `maskedNoteOf` + the i18n `t`, the REAL
// src/lib/stash-strip.js `createStashStrip`, bundled by esbuild into a static page with the REAL public/style.css + chat.css; the task-log
// and IM rows are built as their modules build them (task-log: the note INSIDE `.task-log-note`; IM: a block under the words). The census
// reads the RENDERED note: its rect inside the pane and inside every clipping ancestor (the visible share), on a line of its own; the
// session row's «Change…» button inside the pane. No server.
// CONTROL: this tree's markup under r3's session-props rules (this stylesheet, the r4 m6 rules patched back) ⇒ the session-props note cut / the button outside (RED); a
// checkout without that commit says so and runs the rest.
// SKIPs with evidence without chrome. Scratch: /tmp/vs-mnote-<pid>/ only; Chrome's whole process group is killed before the folder goes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = path.join(os.tmpdir(), `vs-mnote-${process.pid}`);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(e).slice(0, 700) : '')); } return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));

// ── r4 (M4): THE SHIPPED CLIENT PASSES ARE LINEAR, BY THE COUNT (scripts/work-meter.mjs judgeInChild — every step and every regex
// backtrack, in a child; no clock): CJS bundles of the REAL chat renderer (linkifyText / renderMarkdown), the REAL For-you segmenter
// (segmentText) and the REAL row (user-todos-row renderRow), each on the acceptance's adversarial inputs — ×4 input reads ≤ ×4.4 and the
// steps a character stay under the leg's bound (≈ 3–4× this tree's measure; r3's `_maskedToken` / `maskedRun` ran cleanPath over the
// whole run: ×15.8, 4 300–15 500 steps a character)
{
  const { judgeInChild } = await import('./work-meter.mjs');
  const M4 = path.join(ROOT, 'm4'); fs.mkdirSync(M4, { recursive: true });
  fs.writeFileSync(path.join(M4, 'shim.js'), `const noop = () => {}; const mkEl = () => ({ className: '', dataset: {}, style: {}, innerHTML: '', textContent: '', children: [], classList: { add: noop, remove: noop, contains: () => false, toggle: noop }, appendChild: noop, append: noop, prepend: noop, setAttribute: noop, removeAttribute: noop, getAttribute: () => null, addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], closest: () => null });
globalThis.window = globalThis; globalThis.addEventListener = noop; globalThis.removeEventListener = noop; globalThis.matchMedia = () => ({ matches: false, addEventListener: noop, addListener: noop });
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0); globalThis.cancelAnimationFrame = noop; globalThis.getComputedStyle = () => ({});
globalThis.document = { createElement: mkEl, getElementById: () => null, body: mkEl(), documentElement: { style: {}, lang: 'en' }, head: mkEl(), addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], createTextNode: (t) => ({ data: t }) };
for (const k of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) globalThis[k] = class { observe() {} unobserve() {} disconnect() {} };
try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true }); } catch {}
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
export const mkEl2 = mkEl;`);
  // the sanitizer needs a DOM (and runs before every linkifier, never makes a link span): a pass-through here; build-version is generated
  const stub = { name: 'stub', setup(b) { b.onResolve({ filter: /(build-version|safe-html)\.js$/ }, (a) => ({ path: path.basename(a.path), namespace: 'st' })); b.onLoad({ filter: /.*/, namespace: 'st' }, (a) => ({ contents: a.path === 'safe-html.js' ? 'export const sanitizeHtml = (h) => h; export const sanitizeDiagramSvg = () => "";' : "export const BUILD_VERSION = 't';", loader: 'js' })); } };
  const bundle = async (name, src) => { fs.writeFileSync(path.join(M4, name + '.entry.js'), src); const out = path.join(M4, name + '.cjs'); await esbuild.build({ entryPoints: [path.join(M4, name + '.entry.js')], bundle: true, format: 'cjs', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stub] }); return out; };
  const chat = await bundle('chat', `import { mkEl2 } from './shim.js';\nimport { ChatRenderers } from ${JSON.stringify(path.join(REPO, 'src/lib/chat-renderers.js'))};\nconst r = new ChatRenderers({ ws: null, sessionId: 's', app: {}, backend: 'claude', compact: false, messageList: mkEl2(), getSessionCtx: null });\nexport const text = (x) => r.linkifyText(x); export const md = (x) => r.renderMarkdown(x);`);
  const fy = await bundle('fy', `export { segmentText } from ${JSON.stringify(path.join(REPO, 'src/lib/foryou-links.js'))};`);
  const row = await bundle('row', `import './shim.js';\nimport { renderRow } from ${JSON.stringify(path.join(REPO, 'src/lib/user-todos-row.js'))};\nconst ctx = { t: (x) => x, wordsOf: (i) => i.text, detailOf: (i) => i.detail, nameFor: () => 'S', replyState: () => ({ show: false }) };\nexport const row = (x) => renderRow({ item: { id: 'ut-m4', status: 'open', origin: 'agent', sessionKey: 'c', text: x, detail: '', createdAt: 0 } }, ctx).innerHTML;`);
  const R = '«redacted»';
  const LEGS = [
    ['chat text — a masked path, then `?`×n', chat, '(M, x) => M.text(x)', `(n) => 'see /home/u/${R}/b' + '?'.repeat(n) + 'x end'`, 300],
    ['chat text — a vault-masked path, then `)`×n', chat, '(M, x) => M.text(x)', `(n) => '/home/u/[vault:k]/b' + ')'.repeat(n) + 'a'`, 300],
    ['chat markdown — a masked path, then `?`×n', chat, '(M, x) => M.md(x)', `(n) => 'see /home/u/${R}/b' + '?'.repeat(n) + 'x end'`, 1100],
    ['chat markdown — a masked URL, then `)`×n', chat, '(M, x) => M.md(x)', `(n) => 'https://x.example/cb?token=${R}' + ')'.repeat(n) + 'a'`, 1100],
    ['For-you segmentText — `(/a/b`×n then a mark', fy, '(M, x) => M.segmentText(x)', `(n) => '(/a/b'.repeat(n / 5) + '${R}'`, 420],
    ['For-you segmentText — a masked URL, then `.`×n', fy, '(M, x) => M.segmentText(x)', `(n) => 'https://x.example/cb?token=${R}' + '.'.repeat(n) + 'x'`, 420],
    ['the For-you row (renderRow) — `/` + `[vault:`×n', row, '(M, x) => M.row(x)', `(n) => '/' + '[vault:'.repeat(n / 7)`, 400],
    // r5 (M1): a balanced full-width pair rides inside a URL token — its run and its tail walk stay linear on unpaired openers, pair storms and
    // URL-per-pair storms (the base's For-you sheds `.`×n after a pair storm by cleanPath: ×15.4)
    ['chat text — `https://a.example/` + `（b`×n (unpaired openers)', chat, '(M, x) => M.text(x)', `(n) => 'https://a.example/' + '（b'.repeat(n / 2)`, 300, 'r5 (M1)'],
    ['chat text — `（https://a/`×n (a URL in each pair)', chat, '(M, x) => M.text(x)', `(n) => '（https://a/'.repeat(n / 11)`, 300, 'r5 (M1)'],
    ['chat markdown — `https://a.example/` + `（b）`×n + `，`', chat, '(M, x) => M.md(x)', `(n) => 'https://a.example/' + '（b）'.repeat(n / 3) + '，'`, 1100, 'r5 (M1)'],
    ['For-you segmentText — `https://a.example/` + `（b）`×n + `.`×n', fy, '(M, x) => M.segmentText(x)', `(n) => 'https://a.example/' + '（b）'.repeat(n / 6) + '.'.repeat(n / 2) + 'x'`, 420, 'r5 (M1)'],
    ['the For-you row (renderRow) — `https://a.example/` + `（b`×n', row, '(M, x) => M.row(x)', `(n) => 'https://a.example/' + '（b'.repeat(n / 2)`, 400, 'r5 (M1)'],
    // r7 (M8): the stop split — a dash / curly quote rides INSIDE a URL token and is SHED from its end; each road stays linear on a dash storm
    ['chat markdown — `https://a.example/` + `x–`×n + `”，` (dashes inside, a quote shed, a comma stop)', chat, '(M, x) => M.md(x)', `(n) => 'https://a.example/' + 'x–'.repeat(n / 2) + '”，'`, 1100, 'r7 (M8)'],
    ['chat text — `https://a.example/` + `–x`×n (dashes inside)', chat, '(M, x) => M.text(x)', `(n) => 'https://a.example/' + '–x'.repeat(n / 2)`, 300, 'r7 (M8)'],
    ['For-you segmentText — `https://a.example/x` + `–`×n + ` ok` (a dash run shed from the end)', fy, '(M, x) => M.segmentText(x)', `(n) => 'https://a.example/x' + '–'.repeat(n) + ' ok'`, 420, 'r7 (M8)'],
    ['the For-you row (renderRow) — `https://a.example/` + `x–`×n', row, '(M, x) => M.row(x)', `(n) => 'https://a.example/' + 'x–'.repeat(n / 2)`, 400, 'r7 (M8)'],
    // r8 (b): EXACTLY the verifier's shape — a blank-free run of trailing-set characters directly before a stop (cleanPath's `[…]+$` over the
    // token: ×15.7, 4 380 steps a character on the base and on 5c56b367e), and a path whose dots a letter ends
    ['For-you segmentText — `see ` + `–`×n + `，然后` (a dash run directly before a stop)', fy, '(M, x) => M.segmentText(x)', `(n) => 'see ' + '–'.repeat(n) + '，然后'`, 420, 'r8 (b)'],
    ['the For-you row (renderRow) — `see ` + `–`×n + `，然后`', row, '(M, x) => M.row(x)', `(n) => 'see ' + '–'.repeat(n) + '，然后'`, 400, 'r8 (b)'],
    ['For-you segmentText — `see /a` + `.`×n + `b` (a path\'s dots, a letter after)', fy, '(M, x) => M.segmentText(x)', `(n) => 'see /a' + '.'.repeat(n) + 'b'`, 420, 'r8 (b)'],
    // r9: EXACTLY the r8 verifier's three shapes, on every road — the chat's path pass and file-URL pass ran cleanPath's `[…]+$` (×15.3–15.9 on the
    // base and on 7c9b4e7a5); cleanPath is the backward walk now (one implementation, path-linkify)
    ["chat text — `see /a/b` + `.`×n + `c` (a path's dots, a letter after)", chat, '(M, x) => M.text(x)', `(n) => 'see /a/b' + '.'.repeat(n) + 'c'`, 300, 'r9'],
    ['chat text — `see /a/b` + `,`×n + `c`', chat, '(M, x) => M.text(x)', `(n) => 'see /a/b' + ','.repeat(n) + 'c'`, 300, 'r9'],
    ['chat text — `see file:///a` + `–`×n + `x` (a file URL)', chat, '(M, x) => M.text(x)', `(n) => 'see file:///a' + '–'.repeat(n) + 'x'`, 300, 'r9'],
    ["chat markdown — `see /a/b` + `.`×n + `c` (a path's dots, a letter after)", chat, '(M, x) => M.md(x)', `(n) => 'see /a/b' + '.'.repeat(n) + 'c'`, 1100, 'r9'],
    ['chat markdown — `see /a/b` + `,`×n + `c`', chat, '(M, x) => M.md(x)', `(n) => 'see /a/b' + ','.repeat(n) + 'c'`, 1100, 'r9'],
    ['chat markdown — `see file:///a` + `–`×n + `x` (a file URL)', chat, '(M, x) => M.md(x)', `(n) => 'see file:///a' + '–'.repeat(n) + 'x'`, 1100, 'r9'],
    ["For-you segmentText — `see /a/b` + `.`×n + `c` (a path's dots, a letter after)", fy, '(M, x) => M.segmentText(x)', `(n) => 'see /a/b' + '.'.repeat(n) + 'c'`, 420, 'r9'],
    ['For-you segmentText — `see /a/b` + `,`×n + `c`', fy, '(M, x) => M.segmentText(x)', `(n) => 'see /a/b' + ','.repeat(n) + 'c'`, 420, 'r9'],
    ['For-you segmentText — `see file:///a` + `–`×n + `x` (a file URL)', fy, '(M, x) => M.segmentText(x)', `(n) => 'see file:///a' + '–'.repeat(n) + 'x'`, 420, 'r9'],
  ];
  for (const [k, mod, run, mk, bound, tag = 'r4 (M4)'] of LEGS) {
    const v = judgeInChild({ module: mod, run, mk: `(n) => n === 0 ? '' : (${mk})(n)`, n: 4096, kind: 'linear', backtracks: true, opts: { factor: 4 } }, { timeout: 300000 });
    const per = v.w1 / 4096;
    ok(v.ok && per <= bound, `${tag} ${k}: ${v.err ? 'the child failed: ' + v.err.slice(0, 200) : `${v.w1} → ${v.w2} steps, ×${v.r && v.r.toFixed(2)} (bound ×${v.bound}), ${per.toFixed(1)} steps a character (≤ ${bound})`} at ×4 input`);
  }
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP (the render legs): no chrome on this machine'); fs.rmSync(ROOT, { recursive: true, force: true }); console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`); process.exit(fail ? 1 : 0); }

// the owner's URL (Google's PUBLIC gcloud client id; the per-flow nonces joined at runtime) + one holder the belt masked: owner-length
const OWNER = ['https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=32555940559.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fsdk.cloud.google.com%2Fauthcode.html',
  '&scope=openid+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fappengine.admin',
  '+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fsqlservice.login+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcompute+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Faccounts.reauth&state=', 'G42wCKQftAKJ8', 'hXM23vRQmZRemWgo1',
  '&prompt=consent&token_usage=remote&access_type=offline&code_challenge=', '84YRSvbJxBuQKBxdqc59', 'MbopMncKgHbHST40pDWDBU4', '&code_challenge_method=S256&access_token=«redacted»'].join('');

async function buildPage(name, css) {
  const dir = path.join(ROOT, name); fs.mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, `import * as SP from ${JSON.stringify(path.join(REPO, 'src/lib/session-props.js'))}; // a namespace: a tree without the export reds BY NAME, never a build crash
const statusNowHtml = SP.statusNowHtml;
import { maskedNoteOf } from ${JSON.stringify(path.join(REPO, 'src/lib/foryou-links.js'))};
import { createStashStrip } from ${JSON.stringify(path.join(REPO, 'src/lib/stash-strip.js'))};
import { t } from ${JSON.stringify(path.join(REPO, 'src/lib/i18n.js'))};
window.__mn = { statusNowHtml, maskedNoteOf, createStashStrip, t };`);
  await esbuild.build({ entryPoints: [entry], bundle: true, outfile: path.join(dir, 'bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent' });
  for (const [i, c] of css.entries()) fs.writeFileSync(path.join(dir, `s${i}.css`), c);
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html data-theme="dark"><head><meta charset="utf-8">${css.map((_, i) => `<link rel="stylesheet" href="s${i}.css">`).join('')}<style>body{margin:0;padding:8px;background:var(--bg-window);color:var(--text);font:13px sans-serif}.pane{overflow:hidden;border:1px dashed var(--border);margin:6px 0;box-sizing:border-box}</style></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`);
  return 'file://' + path.join(dir, 'index.html');
}
const cssNow = [fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8'), fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8')];
const pageNow = await buildPage('now', cssNow);
// the CONTROL = this tree's stylesheet with the r4 (m6) rules taken back to r3's (`overflow: visible` without `min-width: 0`, the spans
// unbreakable) — a patched copy, every patch asserted to apply once (no sha read: test-ci-gate's ancestor census)
const R4_ROW = '.sp-now-value:has(.masked-link-note) { flex-wrap: wrap; white-space: normal; overflow: visible; min-width: 0; }';
const R4_SPANS = '.sp-now-value:has(.masked-link-note) > span, .sp-now-value:has(.masked-link-note) .sp-status-detail > div { min-width: 0; overflow-wrap: anywhere; }';
const once = (src, a) => src.split(a).length === 2;
ok(once(cssNow[0], R4_ROW) && once(cssNow[0], R4_SPANS), 'the control\'s two stylesheet patches each find their rule once');
const pagePre = once(cssNow[0], R4_ROW) && once(cssNow[0], R4_SPANS)
  ? await buildPage('pre', [cssNow[0].replace(R4_ROW, R4_ROW.replace(' min-width: 0;', '')).replace(R4_SPANS, ''), cssNow[1]]) : null;

const CDP = await freePort();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore', detached: true });
const done = async () => {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch { }
  if (chrome.exitCode === null && chrome.signalCode === null) await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 5000); });
  for (let i = 0; i < 200; i++) { try { process.kill(-chrome.pid, 0); } catch { break; } await sleep(25); }
  fs.rmSync(ROOT, { recursive: true, force: true });
};
let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
if (!target) { console.log('SKIP: chrome exposed no CDP page target'); await done(); process.exit(0); }
const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
let seq = 0; const pend = new Map();
cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: every chrome suite pre-sets vs-onboarded (this page is not the app, but the rule is a census)
const ev = async (js) => { const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
const load = async (url, lang) => {
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { if (await ev('!!window.__mn && document.readyState === "complete"')) break; await sleep(100); }
  await ev(`localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); true`);
  await send('Page.reload', {}); for (let i = 0; i < 60; i++) { if (await ev('!!window.__mn && document.readyState === "complete"')) break; await sleep(100); }
};
// one scene per width: the four surfaces, measured (the note's visible share = its area inside the pane and every clipping ancestor)
const SCENE = (w) => `(() => {
  const M = window.__mn, R = '\\u00abredacted\\u00bb', URL = ${JSON.stringify(OWNER)};
  const root = document.getElementById('root'); root.innerHTML = '';
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pane = (cls) => { const p = mk('div', 'pane ' + (cls || '')); p.style.width = '${w}px'; root.appendChild(p); return p; };
  const visible = (el, stop) => { let r = el.getBoundingClientRect(); const area = r.width * r.height; if (!area) return 0; let a = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let p = el.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || p === stop) { const q = p.getBoundingClientRect(); a = { l: Math.max(a.l, q.left), t: Math.max(a.t, q.top), r: Math.min(a.r, q.right), b: Math.min(a.b, q.bottom) }; } if (p === stop) break; }
    return Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t) / area; };
  const out = {};
  // session properties «Now» (session-props.js: the row = label + the value span (flex:1) + the Change… button)
  const sp = pane('session-props'); const row = mk('div', 'session-detail-row');
  if (typeof M.statusNowHtml !== 'function') { out.session = { notes: [], button: false, missing: 'session-props exports no statusNowHtml (a tree before r4)' }; }
  else {
  row.innerHTML = '<span class="session-detail-label">Now</span><span class="session-detail-value sp-now-value" style="flex:1">' + M.statusNowHtml({ state: 'blocked', urgency: 'high', setBy: 'agent', reason: 'waiting on the sign-in ' + URL, detail: 'opened ' + URL + ' for the owner' }) + '</span>';
  row.querySelector('details') && row.querySelector('details').setAttribute('open', '');
  const chg = mk('button', 'task-detail-btn', 'Change…'); row.appendChild(chg); sp.appendChild(row);
  const notes = [...row.querySelectorAll('.masked-link-note')], pr = sp.getBoundingClientRect(), br = chg.getBoundingClientRect();
  out.session = { notes: notes.map((n) => +visible(n, sp).toFixed(3)), button: br.left >= pr.left - 1 && br.right <= pr.right + 1 && br.width > 0 };
  }
  // the progress note (task-log.js: the note INSIDE .task-log-note)
  const tl = pane(); const tr = mk('div', 'task-log-row task-log-act'); tr.appendChild(mk('span', 'task-log-time', '14:05'));
  const note = mk('span', 'task-log-note', 'checked ' + URL); const tn = M.maskedNoteOf(note.textContent, M.t); if (tn) note.appendChild(mk('span', 'masked-link-note', tn)); tr.appendChild(note); tl.appendChild(tr);
  // the stash line (the REAL strip, its Details open)
  const st = pane(); const strip = M.createStashStrip({ sessionId: 's${w}' }); st.appendChild(strip.el);
  const sum = { count: 1, items: [{ kind: 'peer', label: null, n: 1 }], previewsHeld: 0, previews: [{ kind: 'peer', label: 'build agent', at: Date.now(), head: 'sign in at ' + URL }] };
  strip.set(sum, { turn: 'idle' }); strip.el.querySelector('.chat-stash-more').click(); strip.set({ ...sum }, { turn: 'idle' });
  // the IM group message (channel-window.js groupBody: words as text, THE note a block under them)
  const im = pane(); im.style.padding = '0 6px'; const msg = mk('div', 'chanmsg'); const body = mk('div', 'chanmsg-body chan-group-body'); body.appendChild(document.createTextNode('the link is ' + URL));
  const gn = M.maskedNoteOf(body.textContent, M.t); if (gn) body.appendChild(mk('div', 'masked-link-note', gn)); msg.appendChild(body); im.appendChild(msg);
  for (const [k, p] of [['task-log', tl], ['stash', st], ['IM', im]]) { const n = p.querySelector('.masked-link-note'); out[k] = n ? +visible(n, p).toFixed(3) : -1; }
  return out; })()`;

for (const [label, url, want] of [['THIS TREE', pageNow, true], ['CONTROL (r3\'s session-props rules)', pagePre, false]]) {
  if (!url) continue;
  console.log(label);
  for (const lang of ['en', 'zh', 'ja']) {
    await load(url, lang);
    for (const w of [360, 440, 900]) {
      const o = await ev(SCENE(w));
      if (process.env.MASKED_NOTE_SHOTS) {   // opt-in: the scene as a PNG (the report's shots come from the render these legs measure)
        const r = await ev('(() => { const b = document.getElementById("root").getBoundingClientRect(); return { x: 0, y: 0, width: Math.ceil(b.right + 8), height: Math.ceil(b.bottom + 8) }; })()');
        await send('Emulation.setDeviceMetricsOverride', { width: 960, height: Math.max(1400, r.height), deviceScaleFactor: 1, mobile: false });   // the whole scene painted (the panes' widths are their own)
        const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 }, captureBeyondViewport: true });
        if (shot.result && shot.result.data) { fs.mkdirSync(process.env.MASKED_NOTE_SHOTS, { recursive: true }); fs.writeFileSync(path.join(process.env.MASKED_NOTE_SHOTS, `${want ? 'tree' : 'r3-control'}-${lang}-${w}.png`), Buffer.from(shot.result.data, 'base64')); }
      }
      const sessOk = !!o && o.session.notes.length === 2 && o.session.notes.every((v) => v >= 0.999) && o.session.button;
      const restOk = !!o && ['task-log', 'stash', 'IM'].every((k) => o[k] >= 0.999);
      if (want) {
        ok(sessOk, `${lang} @${w}px: session properties «Now» — both notes 100 % visible, «Change…» inside the pane (${o && JSON.stringify(o.session)})`);
        ok(restOk, `${lang} @${w}px: the progress note, the stash line, the IM message — each note 100 % visible (${o && ['task-log', 'stash', 'IM'].map((k) => k + ' ' + o[k]).join(', ')})`);
      } else if (w !== 900) ok(!sessOk, `CONTROL ${lang} @${w}px: r3's rules cut the session-props note or push «Change…» out (${o && JSON.stringify(o.session)})`);
    }
  }
}
// ── r6 (m7): THE For-you window's verbatim command. inbox-window draws a plain ask's detail as `<pre class="iw-exit-cmd">` (textContent), then
// runs linkifyInto over the pane. The REAL linkifyInto (src/lib/user-todos-row.js) in Chrome: the pre's text = the detail exactly (a copy of
// it copies the command), the masked run its words, THE note the pre's NEXT sibling; in prose (main-ask's words, no block) the note stays inline
{
  const IW = fs.readFileSync(path.join(REPO, 'src/lib/inbox-window.js'), 'utf8');
  ok(IW.includes("else if (plain) { const pre = mk('pre', 'iw-exit-cmd'); pre.textContent = v.detail; c.detail.replaceChildren(pre); }") && /if \(plain\) linkifyInto\(c\.detail\);/.test(IW), 'r6 (m7): the For-you window draws a plain ask\'s detail as <pre class=iw-exit-cmd> by textContent, then linkifyInto over its pane (inbox-window.js, read)');
  const dir = path.join(ROOT, 'm7'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'entry.js'), `import * as ROW from ${JSON.stringify(path.join(REPO, 'src/lib/user-todos-row.js'))};\nwindow.__m7 = { linkifyInto: ROW.linkifyInto };`);
  await esbuild.build({ entryPoints: [path.join(dir, 'entry.js')], bundle: true, outfile: path.join(dir, 'bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent' });
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>');
  await send('Page.navigate', { url: 'file://' + path.join(dir, 'index.html') });
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__m7 && document.readyState === "complete"')) break; await sleep(100); }
  await ev(`localStorage.setItem('vibespace.lang', 'en'); true`);   // the scenes above left ja in this origin's storage: the note's words in English
  await send('Page.reload', {}); for (let i = 0; i < 100; i++) { if (await ev('!!window.__m7 && document.readyState === "complete"')) break; await sleep(100); }
  const CMD = 'git clone https://x-access-token:[vault:gh/tok]@github.com/o/r.git';
  const NOTE = 'Part of this link was masked, so it will not open — it holds the vault entry gh/tok: reveal it in Vault, or ask the agent to send the link without the secret.';
  const m7 = await ev(`(() => {
    const D = ${JSON.stringify(CMD)}, root = document.getElementById('root'); root.innerHTML = '';
    const pane = document.createElement('div'), pre = document.createElement('pre'); pre.className = 'iw-exit-cmd'; pre.textContent = D; pane.replaceChildren(pre); root.appendChild(pane);
    window.__m7.linkifyInto(pane);
    const nx = pre.nextElementSibling;
    const prose = document.createElement('div'); prose.textContent = 'Please open ' + D.slice(10) + ' and reply'; root.appendChild(prose); window.__m7.linkifyInto(prose);
    const pn = prose.querySelector('.masked-link-note');
    return { pre: pre.textContent, noteInPre: !!pre.querySelector('.masked-link-note'), masked: !!pre.querySelector('.fy-masked'), next: nx ? { cls: nx.className, tag: nx.tagName, text: nx.textContent } : null, prose: pn ? { inline: pn.parentElement === prose, text: pn.textContent } : null };
  })()`);
  ok(!!m7 && m7.pre === CMD && !m7.noteInPre && m7.masked && !!m7.next && m7.next.cls === 'masked-link-note' && m7.next.text === NOTE, 'r6 (m7) the For-you window (the REAL linkifyInto, Chrome): pre.textContent === the command exactly, the masked run its words, THE note the pre\'s next sibling', JSON.stringify(m7));
  ok(!!m7 && !!m7.prose && m7.prose.inline && m7.prose.text === NOTE, 'r6 (m7) the For-you window: a masked run in PROSE (main-ask\'s words outside a pre) keeps its note INLINE (r5)', JSON.stringify(m7 && m7.prose));
}
cdp.close(); await done();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
