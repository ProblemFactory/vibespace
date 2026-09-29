#!/usr/bin/env node
// THE BROWSER-SWITCH DIALOG, SEEN (the rebuilt dialog, 2026-09-27). The owner's zh screenshot of the old one: "tier 1",
// "chromium 151", a disabled Install under a paragraph about "§7.2.1 egress" and "binary_absent", and "打开集成" /
// "安装 CloakBrowser…" / "取消" / "切换" / "记住" stacked one glyph per line — a dialog that was gated for BEHAVIOUR in
// English and never LOOKED at in zh at a real width. This suite looks, from rendered rects:
//
//   ① every VIEW × en / zh / ja × 1280×800 (the dialog 420 px) and 360×740 (the phone rule: 95vw, ≤ 360) under
//      'DejaVu Sans' (the Actions runner's face — proven drawn on the dialog's h3 by CSS.getPlatformFontsForNode):
//      the REAL view of a real profile (since lane-cloak: the "not installed" card of this build), W1 (a refused
//      record, with and without `preselect: 'cloak'`) and every card state as a FIXTURE
//      view the REAL src/browser-switch.js builds (scripts/fixtures/browser-switcher-views.mjs — the one producer the
//      fast suite shares), served to the page by a fetch wrapper so a broadcast's refresh re-serves the same view;
//      per leg: every button / target name / chip on ONE text line; no leaf text box narrower than its longest word
//      (a CJK character is its own word); no two text boxes intersecting; nothing clipped (every button and every
//      .brsw-* element); no one-glyph column; no undefined / null / NaN / [object; no developer word (§, src/, a
//      backtick, tier, cloud:, binary_absent, provider, egress, lease, seeded, backend, npm, the bare id cloak, a
//      three-digit run); zh / ja: no Latin left beyond the product and browser names and the fixture's own data; ja
//      never “ ”; the dialog 420 ± 1 px on the desktop, ≤ 360 and no sideways page scroll on the phone;
//   ② the ACTS: Details opens the agent's evidence and a forced refresh keeps it open, Hide details closes it, Dismiss's
//      answer is worded; "Switch to CloakBrowser" shows the switching line and NO card before the POST answers, and the
//      answer is judged by its rollback facts (restored ⇒ "is back on"; not restored ⇒ "didn't start again either") —
//      never by its code; the downgrade and the download each open the house confirm and NOTHING is requested before
//      the confirm; "Set location in Settings…" opens Settings searched for CloakBrowser with the program-file row on
//      screen; "Open Agent browser…" opens the panel; the driven card has no button on a server that lists no driver, and
//      (2026-09-28) with the driver's session listed its "Hand it back to your agent" POSTs the handback from the dialog,
//      says so, keeps the dialog open and re-reads it (a refusal worded); nothing configured = one sentence, no "saved key";
//   ③ CONTROLS: (1) the old 24 px icon class swapped onto the zh buttons ⇒ the measurement reports a clipped / one-glyph
//      button (it can see the owner's picture); (2) a bundle built with a patched copy of the model (the card echoes the
//      server's own sentence) ⇒ the developer-word census goes red on the needs-key leg; (3) the copies census.
// The server is a scratch COPY of the working tree (src, public, server.js, package.json, the tracked data/bin) with its
// own data/ and HOME, never the checkout's. Artifacts: a PNG + a JSON per leg under <tmpdir>/vibespace-brsw-shots/
// run-<pid>-<time>/ (the newest three kept; VIBESPACE_BRSW_SHOTS names another root). SKIPs without chrome or without
// DejaVu Sans. Run: node scripts/test-browser-switcher-ui.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import * as FX from './fixtures/browser-switcher-views.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop names for the server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1800) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 80) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await pred(); if (v) return v; } catch { } await sleep(every); } try { return await pred(); } catch { return null; } };
const J = (x) => JSON.stringify(x);
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const zhDict = (await import('../src/lib/i18n-zh.js')).default;
const jaDict = (await import('../src/lib/i18n-ja.js')).default;
/** The device's t(): the dictionary's words (English = the key), `{param}` filled. */
const tr = (lang, k, p) => { let s = (lang === 'zh' ? zhDict[k] : lang === 'ja' ? jaDict[k] : null) || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? String(p[x]) : m)); return s; };

const ROOT = scratch('brsw');
fs.mkdirSync(ROOT, { recursive: true });
const MUT = mutantCopies('brsw', repo);
const SHOTS_ROOT = process.env.VIBESPACE_BRSW_SHOTS ? path.resolve(process.env.VIBESPACE_BRSW_SHOTS) : path.join(os.tmpdir(), 'vibespace-brsw-shots');
const SHOTS = path.join(SHOTS_ROOT, `run-${process.pid}-${Date.now()}`);
fs.mkdirSync(SHOTS, { recursive: true });
try { const runs = fs.readdirSync(SHOTS_ROOT).filter((d) => /^run-\d+-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[2]) - Number(a.split('-')[2])); for (const d of runs.slice(3)) fs.rmSync(path.join(SHOTS_ROOT, d), { recursive: true, force: true }); } catch { }
console.log(`artifacts: ${SHOTS}`);

const procs = new Set();
let HOME_DIR = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const r of [ROOT, HOME_DIR]) if (r) { try { endRootedProcesses(r); } catch { } }
  for (const r of [ROOT, HOME_DIR]) if (r) { try { fs.rmSync(r, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

// ── THE MEASURER (runs in the page) — every judgement taken from rendered rects ──
function MEASURE(sel, o) {
  const root = document.querySelector(sel);
  if (!root) return { missing: true, problems: ['the dialog is missing'], texts: [] };
  const probs = [];
  const R = (b) => ({ x: Math.round(b.left * 10) / 10, y: Math.round(b.top * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, r: Math.round(b.right * 10) / 10, b: Math.round(b.bottom * 10) / 10 });
  const gone = (el) => { for (let e = el; e; e = e.parentElement) { if (e.hidden) return true; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return true; if (e === root) break; } return false; };
  const shown = (el) => { if (gone(el)) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const nm = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
  const els = [root, ...root.querySelectorAll('*')].filter((el) => !(el instanceof SVGElement) && shown(el));
  const leaves = els.filter((el) => own(el));
  const cv = document.createElement('canvas').getContext('2d');
  const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;
  const runsOf = (s) => { const out = []; for (const tok of s.split(/\s+/)) { let cur = ''; for (const ch of tok) { if (CJK.test(ch)) { if (cur) out.push(cur); cur = ''; out.push(ch); } else cur += ch; } if (cur) out.push(cur); } return out.filter(Boolean); };
  const items = leaves.map((el) => {
    const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize) || 12, b = el.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((x) => x.width > 0.5 && x.height > 0.5);
    const mids = rects.map((x) => (x.top + x.bottom) / 2).sort((p, q) => p - q);
    let lines = 0, last = -1e9; for (const m of mids) { if (m - last > fs * 0.5) { lines++; last = m; } }
    cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    let maxRun = 0, maxRunText = '';
    for (const r of runsOf(own(el))) { const w = cv.measureText(r).width; if (w > maxRun) { maxRun = w; maxRunText = r; } }
    const contentW = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const box = R(b);
    const paint = rects.length ? { x: Math.min(box.x, ...rects.map((x) => x.left)), y: Math.min(box.y, ...rects.map((x) => x.top)), r: Math.max(box.r, ...rects.map((x) => x.right)), b: Math.max(box.b, ...rects.map((x) => x.bottom)) } : box;
    return { el, name: nm(el), text: text.slice(0, 160), box, paint, lines, fs, maxRun: Math.round(maxRun * 10) / 10, maxRunText, contentW, inline: cs.display === 'inline' };
  });
  // (a) ONE text line: every button, the target's name, a chip (+ the now line where the caller says it is a name)
  for (const it of items) if (it.el.matches(o.oneLine) && it.lines !== 1) probs.push(`${it.lines} lines: ${it.name} "${it.text}"`);
  // (b) no box narrower than its longest word (a CJK character is its own word)
  for (const it of items) if (!it.inline && it.maxRun > it.contentW + 1) probs.push(`narrower than its word: ${it.name} "${it.maxRunText}" (${it.maxRun} > ${it.contentW})`);
  // (c) no two text boxes intersect (paint = the box ∪ its text's rects; an element and its own descendant are one)
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], c = items[j];
    if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
    const w = Math.min(a.paint.r, c.paint.r) - Math.max(a.paint.x, c.paint.x), h = Math.min(a.paint.b, c.paint.b) - Math.max(a.paint.y, c.paint.y);
    if (w > 0.5 && h > 0.5) probs.push(`overlap: ${a.name} "${a.text.slice(0, 30)}" × ${c.name} "${c.text.slice(0, 30)}" (${Math.round(w)}×${Math.round(h)})`);
  }
  // (d) nothing clipped: every button and every .brsw-* element (the body is the ONE designated scroller — sideways never)
  for (const el of els) {
    if (!(el.tagName === 'BUTTON' || /(^|\s)brsw-/.test(typeof el.className === 'string' ? el.className : ''))) continue;
    if (el.scrollWidth > el.clientWidth + 1) probs.push(`clipped sideways: ${nm(el)} (${el.scrollWidth} > ${el.clientWidth})`);
    if (!el.classList.contains('brsw-body') && el.scrollHeight > el.clientHeight + 1) probs.push(`clipped: ${nm(el)} "${(el.textContent || '').trim().slice(0, 40)}" (${el.scrollHeight} > ${el.clientHeight})`);
  }
  // (e) no one-glyph column
  for (const it of items) if (it.text.length > 2 && it.box.w < 2 * it.fs) probs.push(`one-glyph column: ${it.name} "${it.text.slice(0, 30)}" (${it.box.w} px at ${it.fs} px)`);
  // the texts a person reads (the nodes, and every title / placeholder) — judged node-side
  const texts = [];
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const s = n.textContent.replace(/\s+/g, ' ').trim(); if (s && n.parentElement && shown(n.parentElement)) texts.push({ text: s, where: nm(n.parentElement), data: !!n.parentElement.closest('.brsw-claim-detail') }); }
  for (const el of els) for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && a !== 'aria-label') texts.push({ text: v, where: nm(el) + '@' + a, data: false }); }
  return { problems: probs, texts, dialog: R(root.getBoundingClientRect()), docW: document.documentElement.scrollWidth, vw: innerWidth, items: items.map(({ el, ...x }) => x) };
}

/** THE FETCH WRAPPER (installed before the app boots): fixture views by name (`profile=fx-<name>`), the switch / install /
 *  dismiss answers scripted per leg — the install POST is ALWAYS answered here (a leg never reaches a real download). */
function WRAPPER() {
  const real = window.fetch.bind(window);
  const S = (window.__brsw = { calls: [], answers: { switch: [], install: [], dismiss: [], handback: [] }, hold: false, releases: [] });
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = function (input, init) {
    const url = String((input && input.url) || input);
    const method = String((init && init.method) || 'GET').toUpperCase();
    let body = null; try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch { body = null; }
    const FXS = window.__brswFixtures || {};
    const v = /\/api\/browser\/switcher\?profile=fx-([\w-]+)/.exec(url);
    if (v && method === 'GET') { S.calls.push({ kind: 'view', name: v[1] }); return Promise.resolve(FXS[v[1]] ? reply(FXS[v[1]]) : reply({ error: 'no fixture ' + v[1], code: 'not-found' }, 404)); }
    if (/\/api\/browser\/switch$/.test(url) && method === 'POST' && body && /^fx-/.test(String(body.profile))) {
      S.calls.push({ kind: 'switch', body });
      const a = S.answers.switch.shift() || { status: 200, body: { ok: true, mode: 'switch', from: 'chromium', to: body.provider, reopened: [] } };
      if (!S.hold) return Promise.resolve(reply(a.body, a.status));
      return new Promise((res) => S.releases.push(() => res(reply(a.body, a.status))));
    }
    if (/\/api\/browser\/handback$/.test(url) && method === 'POST' && body && /^fx-/.test(String(body.profile))) { S.calls.push({ kind: 'handback', body }); const a = S.answers.handback.shift() || { status: 200, body: { ok: true, cause: 'explicit', profileId: body.profile } }; return Promise.resolve(reply(a.body, a.status)); }
    if (/\/api\/browser\/install$/.test(url) && method === 'POST') { S.calls.push({ kind: 'install' }); const a = S.answers.install.shift() || { status: 200, body: { ok: true, started: true } }; return Promise.resolve(reply(a.body, a.status)); }
    const d = /\/api\/browser\/blocked\/([^/?#]+)$/.exec(url);
    if (d && method === 'DELETE' && decodeURIComponent(d[1]) === 'bl-1a2b') { S.calls.push({ kind: 'dismiss' }); const a = S.answers.dismiss.shift() || { status: 200, body: { removed: false } }; return Promise.resolve(reply(a.body, a.status)); }
    return real(input, init);
  };
}
const FONT_SOURCE = "document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.id = 'vs-brsw-face'; st.textContent = \"html, body, button, input, select, textarea { font-family: 'DejaVu Sans', sans-serif !important; }\"; document.head.appendChild(st); });";

// ── the judges (node-side) ──
const DEV = /§|src\/|\.mjs|`|\btier\b|cloud:|binary_absent|\bprovider\b|\begress\b|\blease\b|\bseeded\b|\bbackend\b|\bnpm\b|\bcloak\b|\d{3}/i;
const BAD = /\bundefined\b|\bnull\b|\bNaN\b|\[object/;
const ALLOWED_LATIN = ['Amazon Bedrock AgentCore', 'Browser Use', 'CloakBrowser', 'Browserbase', 'Browserless', 'Chromium', 'Chrome', 'VibeSpace', 'Cookie', 'Kernel', 'Agent', 'agent', 'MB']; // product + browser names (the default browser's blurb names Chrome)
const DATA_LATIN = ['Vendor portal', 'shop.example', 'shopping', 'captcha', 'dev-1', 'cloakbrowser.dev']; // the fixtures' own data (a label, a host, the agent's words) + the §7.2.1 record's download host (lane-cloak)
function wordsProblems(lang, texts, { allowDigits = false } = {}) {
  const out = [];
  for (const x of texts) {
    if (BAD.test(x.text)) out.push(`bad text "${x.text}" (${x.where})`);
    if (!x.data && (allowDigits ? new RegExp(DEV.source.replace('|\\d{3}', ''), 'i') : DEV).test(x.text)) out.push(`developer word in "${x.text}" (${x.where})`);
    if (lang !== 'en' && !x.data) {
      let rest = x.text; for (const w of [...DATA_LATIN, ...ALLOWED_LATIN]) rest = rest.split(w).join(' ');
      if (/[A-Za-z]{2,}/.test(rest)) out.push(`Latin left in ${lang}: "${x.text}" (${x.where})`);
    }
    if (lang === 'ja' && /[“”]/.test(x.text)) out.push(`ja “ ” in "${x.text}" (${x.where})`);
  }
  return out;
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const hasDejaVu = (() => { try { return /DejaVu Sans/.test(execFileSync('fc-list', [':', 'family'], { encoding: 'utf8' })); } catch { return false; } })();
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!hasDejaVu) skip("no 'DejaVu Sans' on this box (fc-list : family) — the dialog is judged under the Actions runner's face");
else await (async () => {
  // ── the server: a scratch COPY of the working tree with its own data/ + HOME, and its own bundle ──
  const WT = path.join(ROOT, 'app');
  fs.mkdirSync(WT, { recursive: true });
  for (const f of ['src', 'public']) fs.cpSync(path.join(repo, f), path.join(WT, f), { recursive: true });
  for (const f of ['server.js', 'package.json']) fs.copyFileSync(path.join(repo, f), path.join(WT, f));
  for (const f of execFileSync('git', ['-C', repo, 'ls-files', 'data/bin'], { encoding: 'utf8' }).split('\n').filter(Boolean)) {
    const to = path.join(WT, f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(repo, f), to); fs.chmodSync(to, fs.statSync(path.join(repo, f)).mode);
  }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(WT, 'node_modules'));
  const version = JSON.parse(fs.readFileSync(path.join(WT, 'package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(WT, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(version)};\n`);
  const esbuild = require('esbuild');
  /** The bundle, built by esbuild's JS API (so control (2) can hand ONE module a patched copy). */
  const buildBundle = (modelOverride = null) => esbuild.build({
    entryPoints: [path.join(WT, 'src/client.js')], bundle: true, outfile: path.join(WT, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent',
    plugins: modelOverride ? [{ name: 'brsw-patched-model', setup(b) { b.onResolve({ filter: /browser-switcher-model\.js$/ }, () => ({ path: modelOverride })); } }] : [],
  });
  await buildBundle();
  ok(fs.statSync(path.join(WT, 'public/bundle.js')).size > 500000, 'the scratch copy built its own bundle (esbuild JS API)');
  HOME_DIR = scratchHome('brsw-home', fs);
  const PORT = await freePort(), CDP = await freePort();
  const baseEnv = { ...process.env };
  for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
  let journal = '';
  const srv = spawn(process.execPath, ['server.js'], { cwd: WT, env: { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: HOME_DIR, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 60000, 200), 'the scratch server booted', journal.slice(-800))) return;
  const api = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? J(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const made = await api('POST', '/api/browser/profiles', { label: 'shopping' });
  const REAL = made.json && made.json.profile && made.json.profile.id;
  if (!ok(!!REAL, 'a real profile “shopping” was created (the W1 legs read its REAL switcher view)', J(made).slice(0, 300))) return;
  const w1real = await api('GET', `/api/browser/switcher?profile=${encodeURIComponent(REAL)}`);
  const cloakReal = w1real.json && (w1real.json.rows || []).find((r) => r.id === 'cloak');
  // lane-cloak (2026-09-28): this build's §7.2.1 record is a MEASUREMENT, so cloak is wired — on a scratch server
  // (its own data/, nothing installed there) the REAL row says the program is not installed yet: one card, whose one
  // control is the install (with npm on PATH) or the Settings location (without); `w1*` = a refused record, a fixture
  const REAL_STATE = cloakReal ? cloakReal.state : null;
  ok(w1real.status === 200 && cloakReal && ['not-installed', 'not-installed-here'].includes(REAL_STATE) && cloakReal.switchKind === 'in-place' && typeof w1real.json.live === 'boolean' && w1real.json.install && w1real.json.install.ok === true, `the REAL view on this build: the CloakBrowser row is ${REAL_STATE} (wired since the measurement; nothing installed on a scratch server), the install verdict ok, live is a fact`, J(w1real.json).slice(0, 400));

  // ── the fixture views, from the ONE producer ──
  const V = FX.views();
  const FIXTURES = Object.fromEntries(Object.entries(V).map(([k, v]) => [k, v]));

  // ── headless chrome ──
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  let target = null;
  for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((x) => x.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target')) return;
  const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => cdp.on('open', r));
  procs.add({ kill: () => { try { cdp.close(); } catch { } } });
  let seq = 0; const pend = new Map();
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(J({ id, method, params })); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || 'eval threw').slice(0, 600)); return r.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard never covers the dialog
  await send('Page.addScriptToEvaluateOnNewDocument', { source: FONT_SOURCE });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${WRAPPER.toString()})();` });
  let langScript = null;
  const VPS = [{ tag: 'w1280', w: 1280, h: 800, mobile: false }, { tag: 'w360', w: 360, h: 740, mobile: true }];
  async function load(lang, vp) {
    if (langScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: langScript });
    langScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: lang === 'en' ? "try { localStorage.removeItem('vibespace.lang'); } catch {}" : `try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` })).result.identifier;
    await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const up = await until(() => evaluate('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 150))]); })()'), 40000, 250);
    if (!up) throw new Error('the app did not boot');
    await until(() => evaluate(`(() => { const s = document.getElementById('loading-screen'); return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; })()`), 10000);
    await evaluate(`(() => { window.__brswFixtures = ${J(FIXTURES)}; for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } return true; })()`);
    await until(() => evaluate('!!(window.app._browserProfiles && (window.app._browserProfiles.profiles || []).length)'), 10000);
  }
  const frames = () => evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40))))');
  const clearToasts = () => evaluate(`(() => { document.getElementById('global-toasts')?.remove(); return true; })()`);
  const toastText = (type) => until(() => evaluate(`(() => { const t = [...document.querySelectorAll('.global-toast${type ? '-' + type : ''} .global-toast-body')].pop(); return t ? t.textContent : null; })()`), 6000, 60);
  async function openDialog(profileId, preselect = null) {
    await evaluate(`(() => { try { window.__brswH && window.__brswH.close(); } catch {} document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); window.__brswH = window.app.openBrowserSwitcher({ profileId: ${J(profileId)}, preselect: ${J(preselect)} }); return true; })()`);
    return until(() => evaluate(`(() => { const d = document.getElementById('browser-switcher-dialog'); const s = window.__brswH && window.__brswH.state(); return !!(d && s && (s.view || s.error) && d.querySelector('.brsw-now, .brsw-error')); })()`), 8000, 50);
  }
  const closeDialog = () => evaluate(`(() => { try { window.__brswH && window.__brswH.close(); } catch {} document.querySelectorAll('.dialog-overlay').forEach((o) => o.remove()); return true; })()`);
  async function shot(file, sel) {
    const r = await evaluate(`(() => { const el = document.querySelector(${J(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
    if (!r) return;
    const img = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: r.width + 8, height: r.height + 8, scale: 1 } });
    if (img.result && img.result.data) fs.writeFileSync(file, Buffer.from(img.result.data, 'base64'));
  }
  const DSEL = '#browser-switcher-dialog .dialog';
  /** A NAME on one line: buttons, the target's name, a chip — and the now line where it names a browser (not the
   *  switching sentence, not a connected browser's clause: those are sentences, and a sentence wraps as a block). */
  const oneLineSel = (sentenceNow) => 'button, .brsw-target-name, .browser-chip' + (sentenceNow ? '' : ', .brsw-now-text');
  const tally = { legs: 0, bad: [] };
  async function record(name, lang, vp, { sel = DSEL, sentenceNow = false, allowDigits = false, dialogBox = true } = {}) {
    await frames();
    const m = await evaluate(`(${MEASURE.toString()})(${J(sel)}, ${J({ oneLine: oneLineSel(sentenceNow) })})`);
    await shot(path.join(SHOTS, name + '.png'), sel);
    fs.writeFileSync(path.join(SHOTS, name + '.json'), J({ name, measure: m }));
    const probs = [...(m.problems || []), ...wordsProblems(lang, m.texts || [], { allowDigits })];
    if (dialogBox && m.dialog) {
      if (vp.w >= 1000 && Math.abs(m.dialog.w - 420) > 1) probs.push(`the dialog is ${m.dialog.w} px wide, not 420`);
      if (vp.w <= 400 && (m.dialog.w > 360 || m.docW > 360)) probs.push(`the phone dialog is ${m.dialog.w} px, the page scrolls to ${m.docW}`);
    }
    tally.legs++;
    if (probs.length) tally.bad.push(`${name}: ${probs.slice(0, 5).join('; ')}`);
    return { m, probs };
  }
  const q = (sel) => evaluate(`(() => { const el = document.querySelector(${J(sel)}); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);
  const click = (sel) => evaluate(`(() => { const el = document.querySelector(${J(sel)}); if (!el) return false; el.click(); return true; })()`);
  const calls = (kind) => evaluate(`window.__brsw.calls.filter((c) => c.kind === ${J(kind)}).length`);

  // the views: the REAL one, W1 (a refused record) twice, then every card state as a fixture
  const VIEWS = [
    { name: 'real', pid: REAL },
    { name: 'w1', pid: 'fx-w1' }, { name: 'w1-pre', pid: 'fx-w1', preselect: 'cloak' },
    ...['w1-claim', 'ready', 'not-live', 'ready-confirm', 'needs-key', 'needs-key-no-preset', 'not-installed', 'not-installed-here', 'installing', 'install-failed', 'path-not-runnable', 'older-browser', 'all-in-use-own', 'all-in-use-shared', 'driven', 'switching', 'current-cdp', 'host-profile'].map((n) => ({ name: n, pid: 'fx-' + n })),
    // the driven card when THIS client lists the driver's session (2026-09-28): the button does the handback itself
    { name: 'driven-listed', pid: 'fx-driven', listDriver: true },
  ];
  const STATE_OF = { real: REAL_STATE, ready: 'ready', 'not-live': 'ready', 'ready-confirm': 'ready-confirm', 'needs-key': 'needs-key', 'needs-key-no-preset': 'needs-key', 'not-installed': 'not-installed', 'not-installed-here': 'not-installed-here', installing: 'installing', 'install-failed': 'install-failed', 'path-not-runnable': 'path-not-runnable', 'older-browser': 'older-browser', 'all-in-use-own': 'all-in-use-own', 'all-in-use-shared': 'all-in-use-shared', driven: 'in-use-by-hand', 'driven-listed': 'in-use-by-hand' };
  const ACTION_OF = { real: REAL_STATE === 'not-installed' ? ['Download and install…'] : ['Set location in Settings…'], ready: ['Switch to {name}', true], 'not-live': ['Switch to {name}', true], 'ready-confirm': ['Switch to {name}', true], 'needs-key': ['Enter license key…'], 'needs-key-no-preset': ['Enter license key…'], 'not-installed': ['Download and install…'], 'not-installed-here': ['Set location in Settings…'], 'install-failed': ['Install again…'], 'path-not-runnable': ['Set location in Settings…'], 'all-in-use-own': ['Open Agent browser…'], 'all-in-use-shared': ['Use my own license key…'], 'driven-listed': ['Hand it back to your agent'] };
  /** The driver's session listed in THIS client (a sidebar row carrying the fixture's driver key), held across the
   *  sidebar's own re-merges by an accessor pair — or taken away again. */
  const listDriver = (on) => evaluate(`(() => { const sb = window.app.sidebar; const stub = { webuiId: 'w-drv', id: 'w-drv', browserKey: 'bk-0000a001', name: 'Driver', status: 'live' };
    if (${J(!!on)}) { if (!sb.__drvHeld) { let v = sb._allSessions || []; Object.defineProperty(sb, '_allSessions', { configurable: true, get: () => [...v.filter((x) => x && x.webuiId !== 'w-drv'), stub], set: (x) => { v = x || []; } }); sb.__drvHeld = true; } }
    else if (sb.__drvHeld) { const v = sb._allSessions.filter((x) => x && x.webuiId !== 'w-drv'); delete sb._allSessions; sb._allSessions = v; sb.__drvHeld = false; }
    return true; })()`);
  let fontProof = null, control1 = null;
  try {
    for (const lang of ['en', 'zh', 'ja']) {
      for (const vp of VPS) {
        console.log(`— ${lang} ${vp.w}×${vp.h}`);
        await load(lang, vp);
        const P = { name: 'CloakBrowser', label: 'shopping' };
        for (const v of VIEWS) {
          const leg = `${v.name}-${lang}-${vp.tag}`;
          await listDriver(!!v.listDriver);
          if (!ok(await openDialog(v.pid, v.preselect || null), `${leg}: the dialog opened on its view`)) continue;
          // the face, proven once per run on the dialog's own h3
          if (!fontProof && lang === 'en') {
            await send('DOM.enable'); await send('CSS.enable');
            const doc = await send('DOM.getDocument', { depth: 0 });
            const n = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#browser-switcher-dialog .dialog-header h3' });
            const f = n.result && n.result.nodeId ? await send('CSS.getPlatformFontsForNode', { nodeId: n.result.nodeId }) : null;
            fontProof = ((f && f.result && f.result.fonts) || []).map((x) => x.familyName).join(' + ');
            ok(/DejaVu Sans/.test(fontProof), `the dialog is drawn in DejaVu Sans (the platform font of its h3: ${fontProof})`);
          }
          const title = await q('#browser-switcher-dialog .dialog-header h3');
          const want = tr(lang, 'Browser for “{label}”', P);
          const content = [];
          if (title !== want) content.push(`title "${title}" ≠ "${want}"`);
          const tgt = await evaluate(`[...document.querySelectorAll('#browser-switcher-dialog .brsw-target')].map((e) => ({ state: e.dataset.state, key: e.dataset.key, btn: [...e.querySelectorAll('.brsw-actions button')].map((b) => b.textContent) }))`);
          if (v.name === 'w1' || v.name === 'w1-pre' || v.name === 'w1-claim') {
            if (tgt.length) content.push(`a card on W1: ${J(tgt)}`);
            if ((await q('#browser-switcher-dialog .brsw-empty')) !== tr(lang, "There's no other browser for “{label}” yet. If a site blocks your agent, take over in the live view and get past the check yourself.", P)) content.push('the W1 empty line');
            const notice = await q('#browser-switcher-dialog .brsw-notice');
            if (v.name === 'w1-pre' ? notice !== tr(lang, "{name} isn't part of this version of VibeSpace.", P) : notice !== null) content.push(`notice "${notice}"`);
            if ((await q('#browser-switcher-dialog .brsw-now-text')) !== tr(lang, "Your agent's browser: {name}", { name: 'Chromium' })) content.push('the now line');
          } else if (STATE_OF[v.name]) {
            if (tgt.length !== 1 || tgt[0].state !== STATE_OF[v.name] || tgt[0].key !== 'target:cloak') content.push(`cards ${J(tgt)}, want one target:cloak in ${STATE_OF[v.name]}`);
            const a = ACTION_OF[v.name];
            const wantBtn = a ? [tr(lang, a[0], P)] : [];
            if (tgt[0] && J(tgt[0].btn) !== J(wantBtn)) content.push(`the card's control ${J(tgt[0].btn)} ≠ ${J(wantBtn)}`);
            if (a && a[1] && !(await evaluate(`!!document.querySelector('#browser-switcher-dialog .brsw-target .brsw-actions button.mounts-btn.mounts-btn-primary')`))) content.push('the switch control is not the primary house button');
          } else if (v.name === 'switching') {
            if (tgt.length) content.push('a card mid-switch');
            if ((await q('#browser-switcher-dialog .brsw-now-text')) !== tr(lang, 'Switching to {name}… You can close this window; the switch goes on.', P)) content.push('the switching line');
          } else if (v.name === 'current-cdp') {
            if (tgt.length || (await q('#browser-switcher-dialog .brsw-empty')) !== null) content.push('a card or an empty line under a connected browser');
            if ((await q('#browser-switcher-dialog .brsw-now .brsw-blurb')) !== tr(lang, "VibeSpace didn't start this browser, only connected to it, so it can't be switched from here.")) content.push('the connected-browser blurb');
          } else if (v.name === 'host-profile') {
            const e = await q('#browser-switcher-dialog .brsw-empty');
            if (tgt.length || e !== tr(lang, '“{label}” is saved on another computer ({host}); {name} only works on the computer VibeSpace runs on.', { ...P, host: 'dev-1' })) content.push(`the other-machine empty line "${e}"`);
          }
          if (await evaluate(`!!document.querySelector('#browser-switcher-dialog .file-tool-btn')`)) content.push('an icon-class button in the dialog');
          const footer = await evaluate(`(() => { const f = document.querySelector('#browser-switcher-dialog .dialog > .dialog-footer'); const b = f && f.querySelector('button.btn-cancel'); return b ? b.textContent : null; })()`);
          if (footer !== tr(lang, 'Close')) content.push(`the footer's Close "${footer}"`);
          ok(content.length === 0, `${leg}: the view reads as its state (title, now line, card, control, footer)`, content.join('; '));
          const r = await record(leg, lang, vp, { sentenceNow: v.name === 'switching' || v.name === 'current-cdp' });
          ok(r.probs.length === 0, `${leg}: the measurement is clean (${(r.m.texts || []).length} texts)`, r.probs.slice(0, 6).join('\n    '));

          // ── the ACTS ──
          if (v.name === 'w1-claim') {
            const det = '#browser-switcher-dialog .brsw-claim-detail';
            const first = await evaluate(`(() => { const b = document.querySelector('#browser-switcher-dialog .brsw-claim .brsw-actions button'); return b ? b.textContent : null; })()`);
            await evaluate(`document.querySelector('#browser-switcher-dialog .brsw-claim .brsw-actions button').click()`);
            const opened = await evaluate(`(() => { const d = document.querySelector(${J(det)}); const b = document.querySelector('#browser-switcher-dialog .brsw-claim .brsw-actions button'); return { hidden: !d || d.hidden, text: d ? d.textContent : null, label: b ? b.textContent : null }; })()`);
            const g0 = await evaluate('window.__brswH.state().gen');
            await evaluate('window.__brswH.refresh()');
            await until(() => evaluate(`window.__brswH.state().gen > ${g0}`), 3000);
            await frames();
            const kept = await evaluate(`(() => { const d = document.querySelector(${J(det)}); return !!d && !d.hidden; })()`);
            await record(`${leg}-details`, lang, vp);
            await evaluate(`document.querySelector('#browser-switcher-dialog .brsw-claim .brsw-actions button').click()`);
            const closed = await evaluate(`(() => { const d = document.querySelector(${J(det)}); const b = document.querySelector('#browser-switcher-dialog .brsw-claim .brsw-actions button'); return { hidden: !d || d.hidden, label: b ? b.textContent : null }; })()`);
            ok(first === tr(lang, 'Details') && !opened.hidden && opened.text === FX.CLAIM.evidence && opened.label === tr(lang, 'Hide details') && kept && closed.hidden && closed.label === tr(lang, 'Details'),
              `${leg}: Details opens the agent's evidence, a forced refresh keeps it open, Hide details closes it`, J({ first, opened, kept, closed }));
            await clearToasts();
            await evaluate(`window.__brsw.answers.dismiss.push({ status: 200, body: { removed: false } })`);
            await evaluate(`[...document.querySelectorAll('#browser-switcher-dialog .brsw-claim .brsw-actions button')].pop().click()`);
            const t1 = await toastText('warn');
            ok(t1 === tr(lang, 'That note was already gone.'), `${leg}: Dismiss answered {removed:false} ⇒ the worded warning ("${t1}")`);
          }
          if (v.name === 'ready') {
            await clearToasts();
            await evaluate(`(() => { window.__brsw.hold = true; window.__brsw.answers.switch.push({ status: 502, body: { error: 'provider "cloak": launch_failed — the browser did not start (a sentence for the agent)', code: 'launch_failed', restored: true, from: 'chromium', to: 'cloak' } }); return true; })()`);
            await click('#browser-switcher-dialog .brsw-target .brsw-actions button');
            const mid = await until(() => evaluate(`(() => { const s = document.querySelector('#browser-switcher-dialog .brsw-now-text'); return s && !document.querySelector('#browser-switcher-dialog .brsw-target') ? s.textContent : null; })()`), 3000, 40);
            const posted = await evaluate(`window.__brsw.calls.filter((c) => c.kind === 'switch').map((c) => c.body)`);
            await record(`${leg}-switching`, lang, vp, { sentenceNow: true });
            await evaluate(`(() => { window.__brsw.hold = false; window.__brsw.releases.splice(0).forEach((f) => f()); return true; })()`);
            const t1 = await toastText('error');
            const back = await until(() => evaluate(`(() => { const e = document.querySelector('#browser-switcher-dialog .brsw-target'); return e && e.dataset.state === 'ready'; })()`), 4000);
            ok(mid === tr(lang, 'Switching to {name}… You can close this window; the switch goes on.', P) && posted.length === 1 && posted[0].provider === 'cloak' && posted[0].profile === 'fx-ready' && !('makeDefault' in posted[0]),
              `${leg}: the click shows the switching line and NO card before the POST answers (one POST, no makeDefault)`, J({ mid, posted }));
            ok(t1 === tr(lang, "{to} didn't start. “{label}” is back on {from}.", { to: 'CloakBrowser', from: 'Chromium', label: 'shopping' }) && back, `${leg}: launch_failed + restored ⇒ "is back on" ("${t1}"), and the card is back in ready`);
            await clearToasts();
            await evaluate(`(() => { window.__brsw.answers.switch.push({ status: 409, body: { error: 'cloak needs a key and none is configured for cloak', code: 'backend_no_key', restored: false, from: 'chromium', to: 'cloak' } }); return true; })()`);
            await click('#browser-switcher-dialog .brsw-target .brsw-actions button');
            const t2 = await toastText('error');
            ok(t2 === tr(lang, "{to} didn't start, and {from} didn't start again either. “{label}” stays on {from}; its browser starts the next time your agent uses it.", { to: 'CloakBrowser', from: 'Chromium', label: 'shopping' }),
              `${leg}: backend_no_key + NOT restored ⇒ the facts win over the code ("${t2}")`);
          }
          if (v.name === 'ready-confirm') {
            const n0 = await calls('switch');
            await click('#browser-switcher-dialog .brsw-target .brsw-actions button');
            const cf = await until(() => evaluate(`(() => { const o = [...document.querySelectorAll('.dialog-overlay')].find((x) => x.id !== 'browser-switcher-dialog'); if (!o) return null; return { title: o.querySelector('h3').textContent, ok: o.querySelector('.dialog-footer button:last-child').textContent, danger: o.querySelector('.dialog-footer button:last-child').classList.contains('danger') }; })()`), 3000, 40);
            if (cf) { await evaluate(`(() => { const o = [...document.querySelectorAll('.dialog-overlay')].find((x) => x.id !== 'browser-switcher-dialog'); o.id = 'vs-brsw-confirm'; return true; })()`); await record(`${leg}-confirm`, lang, vp, { sel: '#vs-brsw-confirm .dialog', dialogBox: false }); await click('#vs-brsw-confirm .btn-cancel'); }
            ok(cf && cf.title === tr(lang, 'Switch to {name}?', P) && cf.ok === tr(lang, 'Switch anyway') && cf.danger && (await calls('switch')) === n0, `${leg}: the click asks ONE question in the house confirm ("${cf && cf.ok}"), nothing posted on Cancel`, J(cf));
          }
          if (v.name === 'not-installed') {
            const n0 = await calls('install');
            await click('#browser-switcher-dialog .brsw-target .brsw-actions button');
            const cf = await until(() => evaluate(`(() => { const o = [...document.querySelectorAll('.dialog-overlay')].find((x) => x.id !== 'browser-switcher-dialog'); if (!o) return null; o.id = 'vs-brsw-confirm'; return { title: o.querySelector('h3').textContent, msg: o.querySelector('.dialog-hint').textContent, ok: o.querySelector('.dialog-footer button:last-child').textContent }; })()`), 3000, 40);
            const before = await calls('install');
            if (cf) { await record(`${leg}-confirm`, lang, vp, { sel: '#vs-brsw-confirm .dialog', dialogBox: false, allowDigits: true }); await click('#vs-brsw-confirm .btn-cancel'); }
            ok(cf && cf.title === tr(lang, 'Install {name}?', P) && cf.msg === tr(lang, "About {down} MB is downloaded once from {host}, its maker, and unpacked to about {size} MB in VibeSpace's data folder. VibeSpace checks it is the exact copy it tested; in that test the browser itself connected to nothing on the internet. No account or key is needed.", { down: Math.round(FX.MEASURED_PROOF.download.bytes / 1e6), host: 'cloakbrowser.dev', size: Math.round(FX.MEASURED_PROOF.binary.dirBytes / 1e6) }) && cf.ok === tr(lang, 'Download and install') && before === n0 && (await calls('install')) === n0,
              `${leg}: the download is behind the house confirm and NOTHING is requested before it (install POSTs: ${before - n0})`, J(cf));
            await clearToasts();
            await click('#browser-switcher-dialog .brsw-target .brsw-actions button');
            await until(() => evaluate(`!!document.querySelector('.dialog-overlay:not(#browser-switcher-dialog) .dialog-footer button:last-child')`), 3000, 40);
            await evaluate(`document.querySelector('.dialog-overlay:not(#browser-switcher-dialog) .dialog-footer button:last-child').click()`);
            const t1 = await toastText('info');
            ok((await calls('install')) === n0 + 1 && t1 === tr(lang, 'Installing {name}; this can take a few minutes.', P), `${leg}: confirmed ⇒ ONE install POST and its worded answer ("${t1}")`);
          }
          if (v.name === 'not-installed-here') {
            await click('#browser-switcher-dialog .brsw-target .brsw-actions button');
            const st = await until(() => evaluate(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.type === 'settings'); if (!w) return null; const s = w.content.querySelector('.settings-search'); const row = [...w.content.querySelectorAll('.settings-row-label')].find((l) => l.textContent === ${J(tr(lang, 'CloakBrowser program file'))}); return { search: s && s.value, row: !!row && row.getBoundingClientRect().height > 0, dialog: !!document.getElementById('browser-switcher-dialog') }; })()`), 5000);
            ok(st && st.search === 'CloakBrowser' && st.row && !st.dialog, `${leg}: "Set location in Settings…" closes the dialog and opens Settings searched for CloakBrowser, the program-file row on screen`, J(st));
            await evaluate(`(() => { for (const w of [...window.app.wm.windows.values()]) if (w.type === 'settings') window.app.wm.closeWindow(w.id); return true; })()`);
          }
          if (v.name === 'all-in-use-own') {
            await click('#browser-switcher-dialog .brsw-target .brsw-actions button');
            const pn = await until(() => evaluate(`(() => ({ panel: !!document.querySelector('.bprof'), dialog: !!document.getElementById('browser-switcher-dialog') }))()`).then((x) => (x.panel ? x : null)), 5000);
            ok(pn && pn.panel && !pn.dialog, `${leg}: "Open Agent browser…" closes the dialog and opens the Agent browser panel`, J(pn));
            await evaluate(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } return true; })()`);
          }
          if (v.name === 'driven') ok((await evaluate(`document.querySelectorAll('#browser-switcher-dialog .brsw-target .brsw-actions button').length`)) === 0, `${leg}: driven by hand with no listed session holding the driver ⇒ the sentence and NO button`);
          if (v.name === 'needs-key-no-preset') {
            // the naive-user verifier (2026-09-28): what the REAL store answers with nothing configured — ONE sentence, never
            // "the saved key can't be used: the cluster provides no default"
            const lines = await evaluate(`[...document.querySelectorAll('#browser-switcher-dialog .brsw-target .brsw-state .brsw-line')].map((e) => e.textContent)`);
            ok(J(lines) === J([tr(lang, '{name} needs a license key from its maker.', P)]), `${leg}: nothing configured ⇒ one sentence, no "saved key" line (${J(lines)})`);
          }
          if (v.name === 'driven-listed') {
            // the button does what the sentence names — the handback, HERE: one POST naming the driver's session and this
            // profile, the worded answer, the dialog still open and re-read (the switch appears once the broadcast lands)
            const sentence = await q('#browser-switcher-dialog .brsw-target .brsw-state');
            const v0 = await calls('view');
            await clearToasts();
            await click('#browser-switcher-dialog .brsw-target .brsw-actions button');
            const t1 = await toastText('info');
            const hb = await evaluate(`window.__brsw.calls.filter((c) => c.kind === 'handback').map((c) => c.body)`);
            const still = await until(async () => ((await calls('view')) > v0 ? await evaluate(`!!document.getElementById('browser-switcher-dialog')`) : null), 3000, 40);
            ok(sentence === tr(lang, "You're driving this browser by hand in the live view. Once you hand it back to your agent, you can switch.") && hb.length >= 1 && hb[hb.length - 1].sessionId === 'w-drv' && hb[hb.length - 1].profile === 'fx-driven' && t1 === tr(lang, 'Control handed back to the agent') && still,
              `${leg}: "Hand it back to your agent" hands it back from the dialog (POST {sessionId, profile}), says so, and the dialog stays open and re-reads its view`, J({ sentence, hb, t1, still }));
            await clearToasts();
            await evaluate(`window.__brsw.answers.handback.push({ status: 409, body: { error: 'this session is not attached to "fx-driven"', code: 'not_attached' } })`);
            await click('#browser-switcher-dialog .brsw-target .brsw-actions button');
            const t2 = await toastText('error');
            ok(t2 === tr(lang, "Couldn't hand the browser back to your agent."), `${leg}: a refused handback is said in plain words, never the server's sentence ("${t2}")`);
          }
          // CONTROL (1): the old 24 px icon class on the zh phone buttons — the measurement must see the owner's picture
          if (!control1 && lang === 'zh' && vp.w === 360 && v.name === 'needs-key') {
            await evaluate(`(() => { document.querySelectorAll('#browser-switcher-dialog .brsw-actions button, #browser-switcher-dialog .dialog-footer button').forEach((b) => { b.className = 'file-tool-btn'; }); return true; })()`);
            const c1 = await record(`control-1-icon-class-${leg}`, lang, vp);
            tally.legs--; tally.bad.pop();
            control1 = c1.probs.filter((p) => /one-glyph|clipped|lines:|narrower/.test(p) && /button/.test(p));
            ok(control1.length >= 1, `CONTROL (1): the old icon class swapped onto the zh phone buttons ⇒ the measurement reports them (${control1.slice(0, 3).join('; ')})`, c1.probs.slice(0, 4).join('; '));
          }
          await closeDialog();
        }
      }
    }
    await listDriver(false);
    ok(tally.legs >= 3 * 2 * VIEWS.length, `${tally.legs} measured states (3 languages × 2 widths × ${VIEWS.length} views + the acts' own)`);
    ok(tally.bad.length === 0, `every measured state is clean (${tally.bad.length} bad of ${tally.legs})`, tally.bad.slice(0, 10).join('\n    '));

    // CONTROL (2): a bundle built with a patched model — the card echoes the server's own sentence — the census goes red
    console.log('— CONTROL (2): a patched model in the bundle');
    const msrc = fs.readFileSync(path.join(repo, 'src/lib/browser-switcher-model.js'), 'utf8');
    const anchor = "return { key: 'target:' + r.id, id: r.id, name, blurb: blurbOf(r.id, t), state, sentences: w.sentences,";
    const mutated = msrc.replace(anchor, "return { key: 'target:' + r.id, id: r.id, name, blurb: blurbOf(r.id, t), state, sentences: [{ text: String(r.reason || r.code || r.state), warn: false }],");
    if (ok(mutated !== msrc, 'CONTROL (2): the mutation applied to its copy (the anchor exists)')) {
      await buildBundle(MUT.write('src/lib/browser-switcher-model.js', mutated, 'echo', { esm: true }));
      await load('en', VPS[0]);
      if (ok(await openDialog('fx-needs-key'), 'CONTROL (2): the patched bundle opened the needs-key view')) {
        const c2 = await record('control-2-patched-model-needs-key-en-w1280', 'en', VPS[0]);
        tally.legs--;
        ok(c2.probs.some((p) => /developer word/.test(p)), `CONTROL (2): the server's own sentence on the card ⇒ the developer-word census goes red (${c2.probs.filter((p) => /developer word/.test(p)).slice(0, 1).join('')})`, c2.probs.slice(0, 3).join('; '));
      }
    }
  } catch (e) {
    ok(false, 'the suite ran to its end', (e && (e.stack || e.message)) + '\n' + journal.slice(-1200));
  }
  for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 1 })) ok(r.pass, 'tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
  console.log(`  artifacts: ${fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).length} PNG + JSON in ${SHOTS}`);
})();

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(fail ? 1 : 0);
