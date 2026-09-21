#!/usr/bin/env node
// COMMUNICATION PANEL — EVERY SURFACE, SCREENSHOTTED AND MEASURED
// (docs/design-communication-panel-polish-audit.md; owner 2026-09-17 "似乎没太
// 做好 i18n，而且界面也比较缺乏设计" / "界面很乱，没有层次，你需要用前端技能+实际渲染
// 截图好好设计优化一下").
//
// A DEBUG DRIVER, not a gate suite: it boots a worktree server with the fake
// adapters (VIBESPACE_CHANNELS_FAKE=1) and headless chrome, stages every state
// the panel / window / outbox / editors / wizard / Integrations window can be
// in — through the REAL routes, never a unit fixture — and writes one PNG +
// one JSON (element rects, computed styles, the visible-text scan) per
// surface, per language, per viewport, per theme. Every later polish chunk and
// the verifier reproduce the same shots from the same script, so "it looks
// better" is a diff of PNGs and numbers, not an opinion.
//
//   VS_UI_SHOTS_DIR   where the PNG/JSON go (default /tmp/vs-comm-shots-<pid>)
//   VS_UI_LANGS       comma list, default zh,ja,en (the order the owner asked)
//   VS_UI_VIEWPORTS   comma list of desktop|mobile, default desktop,mobile
//                     (desktop = 1200×800 with the rail panel at its default
//                     260px sidebar, then WIDENED to the resizer's max (500)
//                     and NARROWED to its min (200); mobile = 375×667 with
//                     isMobile true — no rail there, so only the windows and
//                     the dialogs reachable from a window are shot)
//   VS_UI_THEMES      comma list, default dark,light
//   VS_UI_LIGHT_LANGS the langs the light theme repeats (default en — light is a
//                     colour question, not a wording one)
//   VS_UI_ONLY        substring filter on shot names (skip everything else)
//
// Nothing here calls a vendor (§ban-safety): the Lark / Gmail consent flows are
// STARTED (a consent URL is built, a loopback port is bound) and CANCELLED —
// the exchange never runs, the link is never followed. The port-busy refusal
// is staged by binding the Lark callback port from this process for the one
// call that must see it busy. The EXPIRED-token state is staged through the
// engine's own encrypted token store (src/secret-box.js against the scratch
// data/.channels-key) so the adapter's real `auth.state()` answers
// `needs-reauth`; the UNDECRYPTABLE Integrations row by rotating the scratch
// data/.integrations-key between two boots. The only Test button clicked is
// the fake row's (shape-only, zero network).
//
// Everything is per-pid (scripts/scratch.mjs). Run:
//   node scripts/dbg-comm-surfaces.mjs
//   VS_UI_LANGS=zh VS_UI_VIEWPORTS=desktop VS_UI_THEMES=dark node scripts/dbg-comm-surfaces.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome } from './scratch.mjs';
import zhDict from '../src/lib/i18n-zh.js';
import jaDict from '../src/lib/i18n-ja.js';
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const OUT = process.env.VS_UI_SHOTS_DIR || scratch('comm-shots');
const LANGS = (process.env.VS_UI_LANGS || 'zh,ja,en').split(',').map((s) => s.trim()).filter(Boolean);
const VIEWPORTS = (process.env.VS_UI_VIEWPORTS || 'desktop,mobile').split(',').map((s) => s.trim()).filter(Boolean);
const THEMES = (process.env.VS_UI_THEMES || 'dark,light').split(',').map((s) => s.trim()).filter(Boolean);
const LIGHT_LANGS = (process.env.VS_UI_LIGHT_LANGS || 'en').split(',').map((s) => s.trim()).filter(Boolean);
const ONLY = process.env.VS_UI_ONLY || '';
fs.mkdirSync(OUT, { recursive: true });

// The Lark row's FIXED loopback port (src/integration-registry.js LARK_CALLBACK_URL)
// — read from the registry, never spelled here (the same rule oauth-loopback obeys).
const { LARK_CALLBACK_URL } = require(path.join(repo, 'src/integration-registry.js'));
const LARK_PORT = Number(new URL(LARK_CALLBACK_URL).port);
const { secretBox } = require(path.join(repo, 'src/secret-box.js'));

const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('comm-shots-wt');
const fakeHome = scratchHome('comm-shots-home', fs);
const chromeDir = scratch('comm-shots-chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[shots]', ...a);

// ── the device-side translator, so the driver can find a button by the words
//    the device actually shows (the panel's verbs carry no data attributes) ──
const DICTS = { zh: zhDict, ja: jaDict, en: {} };
const L = (lang, key, params) => {
  let s = (DICTS[lang] && DICTS[lang][key]) || key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
  return s;
};

// ── throwaway worktree + WORKING-TREE overlay (shoot what is about to ship) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

// The cluster provides the fake row and the Lark app (the CLUSTER copy path);
// Gmail stays user-provided / none (the other two paths). Fake ids only.
const CLUSTER = JSON.stringify([
  { id: 'fake', label: 'Cluster fake', values: { apiKey: 'cluster-fake-key-1234', region: 'cluster' } },
  { id: 'lark', label: 'Cluster Lark app', values: { appId: 'cli_a1b2c3d4e5f6', appSecret: 'cluster-lark-secret-000000' } },
]);
let srv = null;
const base = `http://127.0.0.1:${PORT}`;
const bootServer = () => spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', VIBESPACE_INTEGRATIONS: CLUSTER },
});
const waitServer = async () => { for (let i = 0; i < 160; i++) { try { await fetch(`${base}/api/home`); return true; } catch { await sleep(250); } } return false; };
const waitDown = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`${base}/api/home`); await sleep(100); } catch { return true; } } return false; };
const api = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
};
/** A FRESH data dir per pass: every pass stages the same states from nothing. */
const resetData = () => { fs.rmSync(path.join(wt, 'data'), { recursive: true, force: true }); };
const restart = async () => { if (srv) { srv.kill('SIGKILL'); await waitDown(); } srv = bootServer(); if (!(await waitServer())) throw new Error('server did not boot'); };

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--force-device-scale-factor=1',
  '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1200,800', '--disable-background-timer-throttling',
  `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });

// ── CDP ──
const WebSocket = require('ws');
async function newPage({ width, height, mobile }) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const metrics = async (w, h, m) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!m });
  await metrics(width, height, mobile);
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r2.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r2.result.exceptionDetails).slice(0, 900));
    if (r2.error) throw new Error('cdp error: ' + JSON.stringify(r2.error).slice(0, 400));
    if (!r2.result || !r2.result.result || !('value' in r2.result.result)) return undefined;
    return r2.result.result.value;
  };
  const load = async () => {
    await cdp('Page.navigate', { url: `${base}/` });
    for (let i = 0; i < 160; i++) { try { if (await evaljs('!!(window.app && window.app.wm && window.app.sidebar)')) return true; } catch {} await sleep(250); }
    return false;
  };
  /** Set the per-DEVICE choices (localStorage) on the origin BEFORE the app boots. */
  const prime = async ({ lang, theme, sidebarWidth }) => {
    await cdp('Page.navigate', { url: `${base}/api/home` });   // same origin, no app
    await sleep(300);
    await evaljs(`(() => { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); localStorage.setItem('theme', ${JSON.stringify(theme)}); localStorage.setItem('sidebarWidth', ${JSON.stringify(String(sidebarWidth))}); localStorage.setItem('vs-onboarded', '1'); return 1; })()`);
  };
  const shot = async (file, clip) => {
    const params = { format: 'png' };
    if (clip) params.clip = { x: Math.max(0, clip.x), y: Math.max(0, clip.y), width: Math.max(1, clip.width), height: Math.max(1, clip.height), scale: 1 };
    const r2 = await cdp('Page.captureScreenshot', params);
    if (!r2.result || !r2.result.data) throw new Error('no screenshot: ' + JSON.stringify(r2).slice(0, 300));
    fs.writeFileSync(file, Buffer.from(r2.result.data, 'base64'));
  };
  return { cdp, evaljs, load, prime, shot, metrics, close: () => { try { ws.close(); } catch {} } };
}
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

// ── the in-page MEASURER (one string, evaluated per surface) ──
// Returns the root rect, one entry per matched element of the probe list
// (rect + the computed tokens the §17 laws speak about + a truncation flag),
// the visible-text scan (every leaf text inside the root with a flag for Latin
// words ≥3 letters — what an i18n reader at zh/ja would see as English) and
// the title/placeholder attributes (tooltips are visible text too).
const MEASURE = `(function (rootSel, probes) {
  const root = typeof rootSel === 'string' ? document.querySelector(rootSel) : rootSel;
  if (!root) return { missing: rootSel };
  const R = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const cs = (el) => { const c = getComputedStyle(el); return { fontSize: c.fontSize, fontWeight: c.fontWeight, lineHeight: c.lineHeight, color: c.color, background: c.backgroundColor, padding: c.padding, margin: c.margin, borderRadius: c.borderRadius, border: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor, textTransform: c.textTransform, letterSpacing: c.letterSpacing, display: c.display, gap: c.gap, opacity: c.opacity }; };
  const els = [];
  for (const sel of probes) {
    const list = root.matches(sel) ? [root, ...root.querySelectorAll(sel)] : [...root.querySelectorAll(sel)];
    list.slice(0, 40).forEach((el, i) => {
      const b = el.getBoundingClientRect();
      if (!b.width && !b.height) return;
      els.push({ sel, i, tag: el.tagName.toLowerCase(), cls: el.className && el.className.baseVal === undefined ? String(el.className) : '', text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 100), rect: R(el), style: cs(el), truncated: el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === 'ellipsis' });
    });
  }
  const texts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const s = n.nodeValue.replace(/\\s+/g, ' ').trim();
    if (!s) continue;
    const p = n.parentElement;
    if (!p) continue;
    const st = getComputedStyle(p);
    if (st.display === 'none' || st.visibility === 'hidden') continue;
    const b = p.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    let path = [];
    for (let e = p, k = 0; e && e !== root && k < 4; e = e.parentElement, k++) path.push(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : ''));
    texts.push({ text: s.slice(0, 160), latin: /[A-Za-z]{3,}/.test(s), cjk: /[\\u3040-\\u30ff\\u3400-\\u9fff]/.test(s), path: path.join(' < '), fontSize: st.fontSize, color: st.color });
  }
  const attrs = [];
  for (const el of root.querySelectorAll('[title],[placeholder]')) {
    // a tooltip on a hidden control is not visible text (the sidebar's dormant
    // live-filter button carried its static title into every panel shot)
    const est = getComputedStyle(el);
    if (est.display === 'none' || est.visibility === 'hidden') continue;
    const eb = el.getBoundingClientRect();
    if (!eb.width && !eb.height) continue;
    for (const a of ['title', 'placeholder']) { const v = el.getAttribute(a); if (v) attrs.push({ attr: a, text: v.slice(0, 160), latin: /[A-Za-z]{3,}/.test(v), cjk: /[\\u3040-\\u30ff\\u3400-\\u9fff]/.test(v), tag: el.tagName.toLowerCase(), cls: typeof el.className === 'string' ? el.className : '' }); }
  }
  return { rect: R(root), scroll: { w: root.scrollWidth, h: root.scrollHeight, cw: root.clientWidth, ch: root.clientHeight }, els, texts, attrs, viewport: { w: innerWidth, h: innerHeight }, theme: document.documentElement.getAttribute('data-theme'), lang: localStorage.getItem('vibespace.lang') };
})`;
const PROBES = JSON.stringify([
  '.chan-head', '.chan-summary', '.chan-outbox-btn', '.chan-sec', '.chan-sec-head', '.chan-sec-head b', '.chan-sec-state', '.chan-adapter-ctl', '.chan-auth', '.chan-eta', '.chan-auth-err', '.chan-push', '.chan-actions', '.chan-btn', '.chan-row', '.chan-row-title', '.chan-row-sub', '.chan-row-assign', '.chan-chip', '.chan-unread', '.chan-untracked', '.chan-awaiting', '.chan-empty', '.chan-connect', '.chan-connect-row', '.chan-connect-row b', '.chan-connect-note', '.chan-identity-observed', '.chan-bar', '.chan-outbox-count', '.chan-sec-name', '.chan-sec-count', '.chan-sec-more', '.chan-dot', '.chan-sec-note', '.chan-sec-verb', '.chan-rows', '.chan-row-who', '.chan-row-needs', '.chan-connect-btn', '.chan-connect-label', '.chan-sec-chev', '.chan-sec-kind',
  '.chanwin-bar', '.chanwin-bar b', '.chanwin-meta', '.chanwin-assign', '.chanwin-title-row', '.chanwin-title-row .icon-btn', '.chan-assign-chip', '.chanmsg-day', '.chanmsg-cont', '.chanwin-list', '.chanmsg', '.chanmsg-head', '.chanmsg-head b', '.chanmsg-at', '.chanmsg-syn', '.chanmsg-body', '.chanwin-foot', '.chanwin-composer', '.chanwin-composer textarea', '.chanwin-composer-row', '.chanwin-note', '.chanwin-warn', '.chanwin-readonly', '.chanwin-empty', '.chanwin-outbox', '.chanwin-outbox-head',
  '.chan-prop', '.chan-prop-head', '.chan-prop-state', '.chan-prop-who', '.chan-prop-when', '.chan-prop-where', '.chan-prop-why', '.chan-prop-text', '.chan-prop-policy', '.chan-prop-identity', '.chan-prop-idwarn', '.chan-prop-reason', '.chan-prop-actions', '.chan-prop-reconcile', '.chan-prop-ttl', '.chan-prop-receipt', '.chan-prop-rejectbox', '.chan-prop-edit', '.chan-outbox-list', '.chan-prop-meta', '.chan-prop-foot', '.chan-seg', '.chan-seg .jobs-btn', '.chan-outbox-sec',
  '.dialog', '.dialog-header', '.dialog-header h3', '.dialog-close', '.dialog-body', '.chan-flow-intro', '.chan-flow-note', '.chan-flow-refusal', '.chan-flow-label', '.chan-flow-input', '.chan-flow-actions', '.chan-flow-status', '.chan-opt', '.chan-opt-label', '.chan-opt-input', '.chan-opt-help', '.chan-af-rules', '.chan-af-row', '.chan-af-rule', '.chan-af-kind', '.chan-af-inline', '.chan-track-list', '.chan-track-item', '.chan-track-title', '.chan-track-sub', '.chan-reach-row', '.chan-reach-who', '.chan-reach-origin', '.chan-reach-add', '.chan-opt-check', '.chan-steps', '.chan-step', '.chan-flow-primary', '.chan-flow-primary .mounts-btn', '.chan-flow-wait', '.chan-flow-paste', '.chan-af-grid', '.chan-af-field', '.chan-af-stat', '.chan-af-stat-hint', '.chan-af-add', '.chan-af-rm', '.chan-reach-list', '.chan-reach-level', '.chan-reach-rm', '.dialog-check-row', '.mounts-btn', '.mounts-btn-primary', '.icon-btn', '.chan-ic',
  '.integ-win', '.jobs-toolbar', '.jobs-summary', '.integ-body', '.integ-card', '.plugin-head', '.plugin-name', '.plugin-name > span', '.integ-chip', '.integ-why', '.integ-setup', '.integ-setup-title', '.integ-cb-row', '.integ-cb-url', '.integ-copy', '.integ-prereq', '.integ-choice', '.integ-radio', '.integ-fields', '.integ-field', '.plugin-cfg-label', '.integ-mask', '.integ-plain', '.integ-replace', '.integ-missing', '.integ-help', '.integ-actions', '.integ-test', '.integ-clear', '.integ-test-result', '.integ-verdict', '.integ-test-error', '.integ-caveat', '.integ-used', '.plugin-cfg-warn', '.plugin-detail',
  '#sidebar', '#sidebar-rail', '.rail-panel', '#sidebar-header', '.sidebar-title', '.rail-item[data-rail="channels"]', '.rail-badge',
  '.jobs-rail-bar', '.jobs-sec-head', '.jobs-card', '.mounts-panel', '.context-menu', '.context-menu-item', '.global-toast', '.global-toast-body',
]);

const manifest = [];
/** One shot + one measurement. `clipSel` defaults to the root; `pad` grows the
 *  clip; `fullPage` shoots the viewport; `keepToasts` leaves the toast stack
 *  alone (the default clears it so a stale toast never lands in a shot). */
async function capture(page, tag, name, rootSel, { clipSel = rootSel, pad = 0, fullPage = false, keepToasts = false } = {}) {
  if (ONLY && !name.includes(ONLY)) return null;
  if (!keepToasts) await page.evaljs(`(() => { const s = document.getElementById('global-toasts'); if (s) s.textContent = ''; return 1; })()`);
  await sleep(120);
  // the panel repaints its sections in place on every `channels-updated` (a4 r4 closed D12), which
  // still drops the section tags — re-tag right before measuring a section-scoped selector
  if (/data-chan-sec/.test(rootSel) || /data-chan-sec/.test(clipSel)) await tagSections(page);
  const file = path.join(OUT, `${tag}-${name}`);
  let clip = null;
  if (!fullPage) {
    // the rail panel and a window's list SCROLL: a section below the fold has a rect outside the viewport
    // and captures as a blank strip — bring the target into view first, settle, then read the rect
    const SCROLL = `(() => { const el = document.querySelector(${JSON.stringify(clipSel)}); if (!el) return null; if (!el.matches('#sidebar, body, [data-shot="win"], #global-toasts, .context-menu')) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {} } const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()`;
    let c = await page.evaljs(SCROLL);
    if (c) { await sleep(150); c = await page.evaljs(SCROLL); }   // the rect AFTER the scroll settled
    if (c) clip = { x: c.x - pad, y: c.y - pad, width: c.width + pad * 2, height: c.height + pad * 2 };
  }
  // the PNG first, as close to the rect read as possible (a `channels-updated`
  // rebuild between the two would move the target out of its own clip).
  // THE BLANK FRAME (kept as a belt): until a4 r4 sidebar-rail.js removed and
  // re-rendered the whole panel on every `channels-updated`, and the fresh
  // panel FETCHED before it drew — so for a few dozen ms after each engine
  // pass the panel was empty (audit §2.1 D12; test-channels-e2e ⑬ pins the
  // in-place repaint now). A uniform PNG compresses to a few hundred bytes; a
  // real clip of this size does not — a tiny file is a blank frame, retaken.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.shot(file + '.png', clip);
    const bytes = fs.statSync(file + '.png').size;
    if (!clip || clip.width * clip.height < 4000 || bytes > 1500) break;
    log(tag, name, `blank frame (${bytes} B) — retrying`);
    await sleep(500);
  }
  const m = await page.evaljs(`${MEASURE}(${JSON.stringify(rootSel)}, ${PROBES})`);
  fs.writeFileSync(file + '.json', JSON.stringify({ name, tag, rootSel, clip, ...(m || {}) }, null, 1));
  manifest.push({ tag, name, file: path.basename(file) + '.png', missing: m && m.missing, rect: m && m.rect });
  log(tag, name, m && m.missing ? 'MISSING ' + m.missing : `${m.rect.w}×${m.rect.h}`);
  return m;
}
const closeDialogs = (page) => page.evaljs(`(() => { for (const o of document.querySelectorAll('.dialog-overlay')) o.remove(); for (const m of document.querySelectorAll('.context-menu')) m.remove(); return 1; })()`);
const closeAllWindows = (page) => page.evaljs(`(() => { for (const id of [...window.app.wm.windows.keys()]) window.app.wm.closeWindow(id); return 1; })()`);
/** Click the panel button whose text is the device's words for `key` inside `scope`. */
const SEC = (adapterId) => `[data-chan-sec="${adapterId}"]`;
/** Sections carry no data attribute; tag them from the digest's order so the driver can scope clicks.
 *  Every `channels-updated` broadcast repaints the sections in place (fresh elements) and drops the
 *  tags, so a section-scoped click or capture re-tags right before it looks. */
const tagSections = (page) => page.evaljs(`(async () => { const d = await fetch('/api/channels').then((r) => r.json()); const secs = [...document.querySelectorAll('.rail-panel-channels .chan-sec')]; (d.adapters || []).forEach((a, i) => { if (secs[i]) secs[i].dataset.chanSec = a.id; }); return secs.length; })()`);
const clickBtn = async (page, lang, scopeSel, key, params) => {
  if (/data-chan-sec/.test(scopeSel)) await tagSections(page);
  return page.evaljs(`(() => { const s = document.querySelector(${JSON.stringify(scopeSel)}); if (!s) return 'no scope'; const want = ${JSON.stringify(L(lang, key, params))}; const b = [...s.querySelectorAll('button, a.chan-btn')].find((x) => x.textContent.trim() === want || x.textContent.trim().startsWith(want)); if (!b) return 'no button ' + want + ' among ' + [...s.querySelectorAll('button')].map((x) => x.textContent.trim()).join('|'); b.click(); return 'ok'; })()`);
};
/** Open a section's ⋯ menu (the `channel-adapter` contribution menu, a4) and click the item whose text is the device's words for `key`. */
const clickMenu = async (page, lang, scopeSel, key, params) => {
  if (/data-chan-sec/.test(scopeSel)) await tagSections(page);
  const opened = await page.evaljs(`(() => { const s = document.querySelector(${JSON.stringify(scopeSel)}); if (!s) return 'no scope'; const b = s.querySelector('.chan-sec-more, .chanwin-title-row .icon-btn'); if (!b) return 'no ⋯'; b.click(); return 'ok'; })()`);
  if (opened !== 'ok') return opened;
  await sleep(150);
  return page.evaljs(`(() => { const m = document.querySelector('.context-menu'); if (!m) return 'no menu'; const want = ${JSON.stringify(L(lang, key, params))}; const it = [...m.querySelectorAll('.context-menu-item')].find((x) => x.textContent.trim() === want || x.textContent.trim().startsWith(want)); if (!it) { const names = [...m.querySelectorAll('.context-menu-item')].map((x) => x.textContent.trim()).join('|'); m.remove(); return 'no item ' + want + ' among ' + names; } it.click(); return 'ok'; })()`);
};
const waitFor = async (page, expr, tries = 60) => { for (let i = 0; i < tries; i++) { try { if (await page.evaljs(expr)) return true; } catch {} await sleep(250); } return false; };
const openPanel = async (page, id = 'channels') => {
  // the layout autosave persists `sidebarOpen` — a 375px sub-step closes it, so every entry re-opens it
  const ok = await page.evaljs(`(() => { const sb = window.app.sidebar; if (!sb._railEl) return false; if (!sb.isOpen) sb.toggle(true); if (sb._activeTab !== ${JSON.stringify(id)}) sb._railGo(${JSON.stringify(id)}); return true; })()`);
  if (!ok) return false;
  if (id === 'channels') { await waitFor(page, `document.querySelectorAll('.rail-panel-channels .chan-row').length > 0`); await sleep(300); await tagSections(page); }
  else { await waitFor(page, `!!document.querySelector('.rail-panel-${id}')`, 20); await sleep(500); }
  return true;
};
const WIN = (convId) => `[...window.app.wm.windows.values()].find((x) => x._openSpec && x._openSpec.convId === ${JSON.stringify(convId)})`;
const openWin = async (page, adapterId, convId, { composer = false } = {}) => {
  await page.evaljs(`(() => { const w = window.app.openChannel(${JSON.stringify(adapterId)}, ${JSON.stringify(convId)}); w.element.dataset.shot = 'win'; return w.id; })()`);
  await waitFor(page, `(() => { const w = ${WIN(convId)}; return !!(w && w.content.querySelector('.chanwin-bar b') && w.content.querySelector('.chanwin-bar b').textContent${composer ? " && w.content.querySelector('[data-channel-send]') && w.content.querySelectorAll('.chanmsg').length" : ''}); })()`);
  await page.evaljs(`(() => { const w = ${WIN(convId)}; for (const e of document.querySelectorAll('[data-shot="win"]')) delete e.dataset.shot; w.element.dataset.shot = 'win'; window.app.wm.focusWindow(w.id); return 1; })()`);
  await sleep(350);
};
const closeWin = (page, convId) => page.evaljs(`(() => { const w = ${WIN(convId)}; if (w) window.app.wm.closeWindow(w.id); return 1; })()`);
const PROPOSE = (convId, text) => `(async () => {
  const w = ${WIN(convId)};
  const ta = w.content.querySelector('.chanwin-composer textarea');
  const btn = w.content.querySelector('[data-channel-propose]');
  if (!ta || !btn) return { fail: 'no composer' };
  ta.value = ${JSON.stringify(text)};
  btn.click();
  for (let i = 0; i < 80; i++) {
    const cards = [...w.content.querySelectorAll('.chanwin-outbox .chan-prop')];
    const card = cards.find((c) => (c.querySelector('.chan-prop-text') || {}).textContent === ${JSON.stringify(text)});
    if (card) return { id: card.dataset.proposal, cls: card.className };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { fail: 'no card' };
})()`;
const cardAction = (page, convId, pid, sel, wantCls) => page.evaljs(`(async () => {
  const w = ${WIN(convId)};
  const b = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid}"] ${sel}');
  if (!b) return { fail: 'no ' + ${JSON.stringify(sel)} };
  b.click();
  for (let i = 0; i < 80; i++) {
    const card = w.content.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid}"]');
    if (card && card.classList.contains(${JSON.stringify(wantCls)})) return { ok: true };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { fail: 'never ' + ${JSON.stringify(wantCls)} };
})()`);
const CARD = (pid) => `[data-proposal="${pid}"]`;
const scrollCardIntoView = (page, convId, pid) => page.evaljs(`(() => { const w = ${WIN(convId)}; const c = w.content.querySelector('.chan-prop[data-proposal="${pid}"]'); if (c) c.scrollIntoView({ block: 'center' }); return 1; })()`);

/** Bind the Lark callback port from THIS process for the one call that must see it busy. */
const holdPort = (port) => new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(port, '127.0.0.1', () => res(s)); });

/** Stage an EXPIRED Lark login through the engine's own encrypted token store:
 *  the adapter's real `auth.state()` reads it and answers `needs-reauth`
 *  (refresh-token-expired), which the shared `authState` maps to `expired`.
 *  Runs between two boots, against the scratch data dir only. */
function expireLarkToken() {
  const adFile = path.join(wt, 'data/channels/adapters.json');
  const ad = JSON.parse(fs.readFileSync(adFile, 'utf-8'));
  const lark = (ad.adapters || []).find((a) => a.kind === 'lark');
  if (!lark) return 'no lark record to expire';
  const box = secretBox(path.join(wt, 'data/.channels-key'));
  const past = Date.now() - 3600e3;
  const token = { access_token: 'expired-access-token', refresh_token: 'expired-refresh-token', expiresAt: past, refreshExpiresAt: past, scopes: ['im:message'], name: 'Member A' };
  lark.auth = { ...(lark.auth || {}), tokenEnc: box.enc(JSON.stringify(token)), expiresAt: past, scopes: ['im:message'], user: 'Member A', updatedAt: Date.now() };
  fs.writeFileSync(adFile, JSON.stringify(ad));
  return 'ok';
}

// ── ONE PASS = one (lang, viewport, theme): a fresh data dir, boot A, the
//    surfaces in the order a user meets them, boot B for the states that need
//    a restart (an expired token record, a rotated secret key) ──
async function pass({ lang, viewport, theme }) {
  const mobile = viewport === 'mobile';
  const tag = `${lang}-${viewport}-${theme}`;
  log(`=== PASS ${tag} ===`);
  resetData();
  await restart();
  // a principal for the Assign / Reach editors (a Task Group — no live agent session in this fixture)
  await api('POST', '/api/tasks', { name: 'Ops triage', title: 'Ops triage' });
  const page = await newPage(mobile ? { width: 375, height: 667, mobile: true } : { width: 1200, height: 800, mobile: false });
  await page.prime({ lang, theme, sidebarWidth: 260 });
  if (!(await page.load())) throw new Error('app did not load');
  await sleep(600);
  const facts = { lang, viewport, theme, rail: await page.evaljs(`!!(window.app.sidebar && window.app.sidebar._railEl)`), isMobile: await page.evaljs(`!!window.app.isMobile`) };
  fs.writeFileSync(path.join(OUT, `${tag}-facts.json`), JSON.stringify(facts, null, 1));
  // the inline splash fades on `app.ready`; a shot before that is a picture of the logo
  await waitFor(page, `(() => { const s = document.getElementById('loading-screen'); return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; })()`, 40);
  await sleep(300);
  await capture(page, tag, 'page-00-full', 'body', { fullPage: true });

  // ── HOUSE STYLE: the sibling rail panels the Channels panel must match ──
  const hasPanel = !mobile && (await openPanel(page));
  if (hasPanel) {
    if (await openPanel(page, 'jobs')) await capture(page, tag, 'house-01-jobs-panel', '#sidebar');
    if (await openPanel(page, 'mounts')) await capture(page, tag, 'house-02-remote-panel', '#sidebar');
    await openPanel(page);
    // ── PANEL: fresh (nothing tracked; Connect block = lark cluster / gmail none) ──
    await capture(page, tag, 'panel-01-fresh', '#sidebar');
    await capture(page, tag, 'panel-01b-connect-block', '.rail-panel-channels .chan-connect', { pad: 4 });
  }
  // TRACK four conversations (the three lanes + the read-only mailbox) → chips.
  // The track route answers 404 for a conversation the engine's first
  // discovery pass has not listed yet, so wait for the listing first (the
  // desktop pass waited on the panel rows; the mobile pass has no panel).
  for (let i = 0; i < 80; i++) { const d = (await api('GET', '/api/channels')).json; if (d && (d.conversations || []).length >= 6) break; await sleep(250); }
  for (const [a, c] of [['fake-poll', 'fake-poll-ops'], ['fake-poll', 'fake-poll-announce'], ['fake-push', 'fake-push-ops'], ['fake-scan', 'fake-scan-ops']]) {
    const r = await api('POST', `/api/channels/${a}/${c}/track`, { tracked: true });
    if (r.status !== 200) log('track', a, c, 'HTTP', r.status, r.text.slice(0, 120));
  }
  await sleep(3000);
  if (hasPanel) {
    await tagSections(page);
    await capture(page, tag, 'panel-02-tracked', '#sidebar');
    await capture(page, tag, 'panel-02b-section-poll', SEC('fake-poll'), { pad: 4 });
    await capture(page, tag, 'panel-02c-section-push', SEC('fake-push'), { pad: 4 });
    await capture(page, tag, 'panel-02d-section-scan', SEC('fake-scan'), { pad: 4 });
    await capture(page, tag, 'panel-02e-section-agents', SEC('agents'), { pad: 4 });
    // the row menu (a contribution) on a tracked row
    await page.evaljs(`(() => { const r = document.querySelector('.rail-panel-channels .chan-row[data-conv="fake-poll/fake-poll-ops"]'); if (!r) return 0; const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.x + 40, clientY: b.y + 10 })); return 1; })()`);
    await sleep(250);
    await capture(page, tag, 'panel-02f-row-menu', '.context-menu', { pad: 4 });
    await closeDialogs(page);
    // the adapter's ⋯ menu (a4: every section verb lives here)
    await page.evaljs(`(() => { const b = document.querySelector('${SEC('fake-poll')} .chan-sec-more'); if (b) b.click(); return !!b; })()`);
    await sleep(250);
    await capture(page, tag, 'panel-02g-adapter-menu', '.context-menu', { pad: 4 });
    await closeDialogs(page);
    // DISABLED adapter
    await api('PUT', '/api/channels/adapters/fake-scan', { enabled: false });
    await sleep(800); await tagSections(page);
    await capture(page, tag, 'panel-03-disabled-scan', SEC('fake-scan'), { pad: 4 });
    await api('PUT', '/api/channels/adapters/fake-scan', { enabled: true });
    await sleep(800);
  }
  // CONNECT COPY PATHS: gmail none → user (lark is the cluster path from the env)
  await api('PUT', '/api/integrations/gmail', { values: { clientId: 'example.apps.googleusercontent.com', clientSecret: 'GOCSPX-example-secret-0000' } });
  await sleep(800);
  if (hasPanel) {
    await tagSections(page);
    await capture(page, tag, 'panel-04-connect-user-cluster', '.rail-panel-channels .chan-connect', { pad: 4 });
    // WIZARD: Connect Lark (cluster credential) → the flow dialog (consent URL, listening)
    const r1 = await clickBtn(page, lang, '.rail-panel-channels .chan-connect', 'Connect {label}', { label: 'Lark / 飞书' });
    log('connect lark:', r1);
    await waitFor(page, `!!document.querySelector('#chan-flow-dialog .chan-flow-input')`);
    await sleep(400);
    await capture(page, tag, 'wizard-01-flow', '#chan-flow-dialog .dialog', { pad: 8 });
    await clickBtn(page, lang, '#chan-flow-dialog', 'Cancel');
    await sleep(800); await tagSections(page);
    await capture(page, tag, 'panel-05-lark-not-connected', SEC('lark'), { pad: 4 });
    // PORT-BUSY: hold the fixed callback port, connect again from the section
    const held = await holdPort(LARK_PORT).catch((e) => { log('could not hold port', LARK_PORT, e.message); return null; });
    const r2 = await clickBtn(page, lang, SEC('lark'), 'Connect');
    log('connect lark (port busy):', r2);
    await waitFor(page, `!!document.querySelector('#chan-flow-dialog .chan-flow-refusal')`, 40);
    await sleep(400);
    await capture(page, tag, 'wizard-02-port-busy', '#chan-flow-dialog .dialog', { pad: 8 });
    await clickBtn(page, lang, '#chan-flow-dialog', 'Cancel');
    if (held) await new Promise((r) => held.close(r));
    await sleep(600);
    // GMAIL: connect (user credential, ephemeral port) → cancel → withdraw the credential → needs-credentials
    await clickBtn(page, lang, '.rail-panel-channels .chan-connect', 'Connect {label}', { label: 'Gmail' });
    await waitFor(page, `!!document.querySelector('#chan-flow-dialog .chan-flow-input')`, 40);
    await sleep(300);
    await capture(page, tag, 'wizard-03-flow-gmail', '#chan-flow-dialog .dialog', { pad: 8 });
    await clickBtn(page, lang, '#chan-flow-dialog', 'Cancel');
    await sleep(600);
    await api('DELETE', '/api/integrations/gmail');
    await sleep(1200); await tagSections(page);
    await capture(page, tag, 'panel-06-needs-credentials', SEC('gmail'), { pad: 4 });
    // TRACK PICKER / OPTIONS / PUSH dialogs
    await clickMenu(page, lang, SEC('fake-poll'), 'Track…');
    await waitFor(page, `!!document.querySelector('#chan-track-dialog .chan-track-item')`, 20);
    await sleep(300);
    await capture(page, tag, 'dialog-track', '#chan-track-dialog .dialog', { pad: 8 });
    await closeDialogs(page);
    await clickMenu(page, lang, SEC('lark'), 'Options');
    await waitFor(page, `!!document.querySelector('#chan-options-dialog .chan-opt-input')`, 20);
    await sleep(300);
    await capture(page, tag, 'dialog-options-lark', '#chan-options-dialog .dialog', { pad: 8 });
    await closeDialogs(page);
    await clickMenu(page, lang, SEC('gmail'), 'Options');
    await waitFor(page, `!!document.querySelector('#chan-options-dialog .chan-opt-input')`, 20);
    await sleep(300);
    await capture(page, tag, 'dialog-options-gmail', '#chan-options-dialog .dialog', { pad: 8 });
    await closeDialogs(page);
    await clickMenu(page, lang, SEC('fake-push'), 'Push…');
    await waitFor(page, `!!document.querySelector('#chan-push-dialog .chan-opt-input')`, 20);
    await sleep(300);
    await capture(page, tag, 'dialog-push', '#chan-push-dialog .dialog', { pad: 8 });
    await closeDialogs(page);
  } else {
    // mobile / rail-off: the same server-side states, no panel to click — the
    // consent flows are started through the route so the adapter records exist
    await api('POST', '/api/channels/adapters/lark/connect', {});
    await sleep(300);
    const lk = (await api('GET', '/api/channels')).json;
    const larkRec = (lk.adapters || []).find((a) => a.kind === 'lark');
    if (larkRec) await api('POST', `/api/channels/adapters/${larkRec.id}/auth/cancel`, {});
    await api('DELETE', '/api/integrations/gmail');
  }

  // ── WINDOWS: tracked+sendable / read-only adapter / read-only mailbox / untracked ──
  await openWin(page, 'fake-poll', 'fake-poll-ops', { composer: true });
  await capture(page, tag, 'win-01-tracked-sendable', '[data-shot="win"]');
  await openWin(page, 'fake-push', 'fake-push-ops');
  await waitFor(page, `(() => { const w = ${WIN('fake-push-ops')}; return !!(w && w.content.querySelector('.chanwin-readonly')); })()`, 40);
  await sleep(300);
  await capture(page, tag, 'win-02-readonly-adapter', '[data-shot="win"]');
  await closeWin(page, 'fake-push-ops');
  await openWin(page, 'fake-poll', 'fake-poll-announce');
  await waitFor(page, `(() => { const w = ${WIN('fake-poll-announce')}; return !!(w && w.content.querySelector('.chanwin-readonly')); })()`, 40);
  await sleep(300);
  await capture(page, tag, 'win-02b-readonly-mailbox', '[data-shot="win"]');
  await closeWin(page, 'fake-poll-announce');
  await openWin(page, 'fake-scan', 'fake-scan-announce');
  await waitFor(page, `(() => { const w = ${WIN('fake-scan-announce')}; return !!(w && w.content.querySelector('.chanwin-empty')); })()`, 40);
  await sleep(300);
  await capture(page, tag, 'win-03-untracked', '[data-shot="win"]');
  await closeWin(page, 'fake-scan-announce');

  // ── CARDS: awaiting → sent · failed · unknown · rejected · a second awaiting ──
  await openWin(page, 'fake-poll', 'fake-poll-ops', { composer: true });
  const p1 = await page.evaljs(PROPOSE('fake-poll-ops', 'Could someone look at the staging box before 3pm? The nightly job was slow again.'));
  log('propose 1:', JSON.stringify(p1));
  // the toast the composer shows for a held proposal (its `why` is the policy's reason set)
  await capture(page, tag, 'toast-01-held', '#global-toasts', { pad: 4, keepToasts: true });
  // the "For you" toast the engine's pointer raises on the next pass (a3 r4: the item is filed as
  // STRUCTURE and worded by the device — it used to read "Channels: Proposals awaiting approval in …")
  const forYou = await waitFor(page, `[...document.querySelectorAll('#global-toasts .global-toast-body')].some((b) => b.textContent.startsWith(${JSON.stringify(L(lang, 'For you'))}))`, 60);
  log('for-you toast:', forYou);
  await capture(page, tag, 'toast-02-for-you', '#global-toasts', { pad: 4, keepToasts: true });
  if (p1.id) {
    await scrollCardIntoView(page, 'fake-poll-ops', p1.id); await sleep(200);
    await capture(page, tag, 'card-01-awaiting', `.chan-prop${CARD(p1.id)}`, { pad: 6 });
    await cardAction(page, 'fake-poll-ops', p1.id, 'button[data-approve]', 'chan-prop-sent');
    await sleep(300); await scrollCardIntoView(page, 'fake-poll-ops', p1.id);
    await capture(page, tag, 'card-02-sent', `.chan-prop${CARD(p1.id)}`, { pad: 6 });
  }
  const p2 = await page.evaljs(PROPOSE('fake-poll-ops', 'Merged — thanks. [[fake:refuse]]'));
  if (p2.id) { await cardAction(page, 'fake-poll-ops', p2.id, 'button[data-approve]', 'chan-prop-failed'); await sleep(300); await scrollCardIntoView(page, 'fake-poll-ops', p2.id); await capture(page, tag, 'card-03-failed', `.chan-prop${CARD(p2.id)}`, { pad: 6 }); }
  const p3 = await page.evaljs(PROPOSE('fake-poll-ops', 'Moving the meeting to 3pm. [[fake:lost]]'));
  if (p3.id) { await cardAction(page, 'fake-poll-ops', p3.id, 'button[data-approve]', 'chan-prop-unknown'); await sleep(300); await scrollCardIntoView(page, 'fake-poll-ops', p3.id); await capture(page, tag, 'card-04-unknown', `.chan-prop${CARD(p3.id)}`, { pad: 6 }); }
  const p4 = await page.evaljs(PROPOSE('fake-poll-ops', 'That ticket is ready for review.'));
  if (p4.id) {
    await page.evaljs(`(() => { const w = ${WIN('fake-poll-ops')}; const card = w.content.querySelector('.chan-prop[data-proposal="${p4.id}"]'); card.querySelector('button[data-reject]').click(); const box = card.querySelector('.chan-prop-rejectbox'); if (!box) return 'no box'; box.querySelector('input').value = 'Wrong tone for that room'; return 'ok'; })()`);
    await sleep(200); await scrollCardIntoView(page, 'fake-poll-ops', p4.id);
    await capture(page, tag, 'card-05-reject-box', `.chan-prop${CARD(p4.id)}`, { pad: 6 });
    await cardAction(page, 'fake-poll-ops', p4.id, '.chan-prop-rejectbox button', 'chan-prop-rejected');
    await sleep(300); await scrollCardIntoView(page, 'fake-poll-ops', p4.id);
    await capture(page, tag, 'card-06-rejected', `.chan-prop${CARD(p4.id)}`, { pad: 6 });
  }
  const p5 = await page.evaljs(PROPOSE('fake-poll-ops', 'Heads up: the deploy finished, logs look clean.'));
  if (p5.id) { await page.evaljs(`(() => { const w = ${WIN('fake-poll-ops')}; const card = w.content.querySelector('.chan-prop[data-proposal="${p5.id}"]'); card.querySelector('button[data-edit]').click(); return 1; })()`); await sleep(200); await scrollCardIntoView(page, 'fake-poll-ops', p5.id); await capture(page, tag, 'card-07-awaiting-editing', `.chan-prop${CARD(p5.id)}`, { pad: 6 }); }
  await page.evaljs(`(() => { const w = ${WIN('fake-poll-ops')}; const s = w.content.querySelector('.chanwin-outbox'); if (s) s.scrollIntoView({ block: 'start' }); return 1; })()`);
  await sleep(200);
  await capture(page, tag, 'win-04-outbox-inline', '[data-shot="win"] .chanwin-outbox', { pad: 4 });
  await capture(page, tag, 'win-05-with-cards', '[data-shot="win"]');
  if (hasPanel) { await tagSections(page); await capture(page, tag, 'panel-07-awaiting-badge', '#sidebar'); }

  // ── OUTBOX WINDOW ──
  await page.evaljs(`(() => { const w = window.app.openChannelOutbox(); for (const e of document.querySelectorAll('[data-shot="win"]')) delete e.dataset.shot; w.element.dataset.shot = 'win'; return w.id; })()`);
  await waitFor(page, `document.querySelectorAll('.chan-outbox-list .chan-prop').length >= 4`, 40);
  await sleep(300);
  await capture(page, tag, 'outbox-window', '[data-shot="win"]');
  await page.evaljs(`(() => { const b = document.querySelector('[data-shot="win"] .chan-seg [data-view="all"]'); if (b) b.click(); return !!b; })()`);
  await sleep(300);
  await capture(page, tag, 'outbox-window-all', '[data-shot="win"]');
  await page.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter((x) => x.type === 'channel-outbox')) window.app.wm.closeWindow(w.id); return 1; })()`);

  // ── ASSIGN & FILTER editor (live estimate) → assignment → REACH & POLICY ──
  await page.evaljs(`(() => { const w = ${WIN('fake-poll-ops')}; for (const e of document.querySelectorAll('[data-shot="win"]')) delete e.dataset.shot; w.element.dataset.shot = 'win'; window.app.wm.focusWindow(w.id); return 1; })()`);
  await waitFor(page, `(() => { const w = ${WIN('fake-poll-ops')}; return !!(w && w.content.querySelector('[data-channel-assign]')); })()`, 20);
  await page.evaljs(`(() => { const w = ${WIN('fake-poll-ops')}; w.content.querySelector('[data-channel-assign]').click(); return 1; })()`);
  await waitFor(page, `!!document.querySelector('#chan-assign-dialog select')`, 20);
  await sleep(300);
  await capture(page, tag, 'dialog-assign-default', '#chan-assign-dialog .dialog', { pad: 8 });
  await page.evaljs(`(() => { const d = document.querySelector('#chan-assign-dialog'); const sels = d.querySelectorAll('select.chan-opt-input'); sels[1].value = 'filtered'; sels[1].dispatchEvent(new Event('change')); return 1; })()`);
  await sleep(150);
  await clickBtn(page, lang, '#chan-assign-dialog', 'Add rule');
  // the fresh rule has an EMPTY value: the stat line words the validator's refusal (a3 r4 — it used
  // to print the PURE module's English `keyword: value is required` under zh/ja)
  await waitFor(page, `!!document.querySelector('#chan-assign-dialog .chan-flow-status.chan-warn')`, 20);
  await sleep(200);
  await capture(page, tag, 'dialog-assign-filter-incomplete', '#chan-assign-dialog .dialog', { pad: 8 });
  await page.evaljs(`(() => { const d = document.querySelector('#chan-assign-dialog'); const inp = d.querySelector('.chan-af-rule input'); if (inp) { inp.value = 'deploy'; inp.dispatchEvent(new Event('input')); } return 1; })()`);
  await waitFor(page, `(() => { const e = document.querySelector('#chan-assign-dialog .chan-flow-status'); return !!(e && /\\d/.test(e.textContent)); })()`, 30);
  await sleep(300);
  await capture(page, tag, 'dialog-assign-filter', '#chan-assign-dialog .dialog', { pad: 8 });
  const saved = await clickBtn(page, lang, '#chan-assign-dialog', 'Save');
  log('assign save:', saved);
  await waitFor(page, `!document.querySelector('#chan-assign-dialog')`, 30);
  await sleep(1200);
  await capture(page, tag, 'win-06-assigned-bar', '[data-shot="win"] .chanwin-bar', { pad: 4 });
  if (hasPanel) { await tagSections(page); await capture(page, tag, 'panel-08-assigned-row', '.rail-panel-channels .chan-row[data-conv="fake-poll/fake-poll-ops"]', { pad: 4 }); }
  await clickMenu(page, lang, '[data-shot="win"]', 'Reach & policy…');
  await waitFor(page, `!!document.querySelector('#chan-reach-dialog select')`, 20);
  await sleep(300);
  await capture(page, tag, 'dialog-reach', '#chan-reach-dialog .dialog', { pad: 8 });
  await closeDialogs(page);

  // ── the same dialogs at 375px wide (isMobile false — the CSS question) ──
  if (!mobile) {
    await page.metrics(375, 667, false);
    await sleep(300);
    await page.evaljs(`(() => { const w = ${WIN('fake-poll-ops')}; w.content.querySelector('[data-channel-assign]').click(); return 1; })()`);
    await waitFor(page, `!!document.querySelector('#chan-assign-dialog select')`, 20);
    await sleep(300);
    await capture(page, tag, 'narrow-dialog-assign', '#chan-assign-dialog .dialog', { fullPage: true });
    await closeDialogs(page);
    await clickMenu(page, lang, '[data-shot="win"]', 'Reach & policy…');
    await waitFor(page, `!!document.querySelector('#chan-reach-dialog select')`, 20);
    await sleep(300);
    await capture(page, tag, 'narrow-dialog-reach', '#chan-reach-dialog .dialog', { fullPage: true });
    await closeDialogs(page);
    if (hasPanel) {
      await openPanel(page);
      await tagSections(page);
      await capture(page, tag, 'narrow-panel-375', '#sidebar', { fullPage: true });
      await clickBtn(page, lang, SEC('lark'), 'Connect');
      await waitFor(page, `!!document.querySelector('#chan-flow-dialog .chan-flow-input')`, 20);
      await sleep(300);
      await capture(page, tag, 'narrow-dialog-flow', '#chan-flow-dialog .dialog', { fullPage: true });
      await clickBtn(page, lang, '#chan-flow-dialog', 'Cancel');
      await sleep(600); await tagSections(page);
      await clickMenu(page, lang, SEC('lark'), 'Options');
      await waitFor(page, `!!document.querySelector('#chan-options-dialog .chan-opt-input')`, 20);
      await sleep(300);
      await capture(page, tag, 'narrow-dialog-options', '#chan-options-dialog .dialog', { fullPage: true });
      await closeDialogs(page);
    }
    await page.metrics(1200, 800, false);
    await sleep(300);
    if (hasPanel) await openPanel(page);
  }

  // ── PANEL WIDTHS: widened to the resizer's max, narrowed to its min ──
  if (hasPanel) {
    for (const [w, nm] of [[500, 'wide'], [340, 'mid'], [200, 'narrow']]) {
      await page.evaljs(`(() => { const sb = window.app.sidebar; sb._resizer._setSize(${w}); sb._applySidebarLayoutWidth(${w}); return sb.el.offsetWidth; })()`);
      await sleep(400); await tagSections(page);
      await capture(page, tag, `panel-09-${nm}-${w}`, '#sidebar');
      await capture(page, tag, `panel-09-${nm}-${w}-section-poll`, SEC('fake-poll'), { pad: 4 });
    }
    await page.evaljs(`(() => { const sb = window.app.sidebar; sb._resizer._setSize(260); sb._applySidebarLayoutWidth(260); return 1; })()`);
    await sleep(300);
  }

  // ── BOOT B: an EXPIRED token record (through the encrypted store) + a
  //    ROTATED secret key (the undecryptable Integrations rows) + user keys ──
  await closeAllWindows(page);
  await api('PUT', '/api/integrations/gmail', { values: { clientId: 'example.apps.googleusercontent.com', clientSecret: 'GOCSPX-example-secret-0000' } });
  await api('PUT', '/api/integrations/cloak', { values: { licenseKey: 'cb_1234567890abcd' } });
  await sleep(1500);   // the adapters store's debounced write
  srv.kill('SIGKILL'); await waitDown();
  try { log('expire lark:', expireLarkToken()); } catch (e) { log('expire lark failed:', e.message); }
  const keyFile = path.join(wt, 'data/.integrations-key');
  try { fs.writeFileSync(keyFile, 'f'.repeat(64)); } catch (e) { log('key rotate failed:', e.message); }
  srv = bootServer(); if (!(await waitServer())) throw new Error('server B did not boot');
  await page.prime({ lang, theme, sidebarWidth: 260 });
  if (!(await page.load())) throw new Error('app did not reload');
  await sleep(600);
  if (!mobile && (await openPanel(page))) {
    await waitFor(page, `[...document.querySelectorAll('.rail-panel-channels .chan-sec-note, .rail-panel-channels .chan-auth')].some((e) => /re-auth|需要重新授权|再認証|再認可|重新授权/i.test(e.textContent))`, 20);
    await tagSections(page);
    await capture(page, tag, 'panel-10-B-expired', SEC('lark'), { pad: 4 });
    await capture(page, tag, 'panel-11-B-full', '#sidebar');
  }
  // INTEGRATIONS: the window, each card, Test passed / failed, the undecryptable rows
  await page.evaljs(`(() => { const w = window.app.openIntegration('fake'); for (const e of document.querySelectorAll('[data-shot="win"]')) delete e.dataset.shot; w.element.dataset.shot = 'win'; return w.id; })()`);
  await waitFor(page, `document.querySelectorAll('.integ-card').length >= 4`, 40);
  await sleep(400);
  await capture(page, tag, 'integ-01-window', '[data-shot="win"]');
  for (const id of ['fake', 'lark', 'gmail', 'cloak']) {
    await page.evaljs(`(() => { const c = document.querySelector('.integ-card[data-integ="${id}"]'); if (c) c.scrollIntoView({ block: 'start' }); return 1; })()`);
    await sleep(200);
    await capture(page, tag, `integ-02-card-${id}`, `.integ-card[data-integ="${id}"]`, { pad: 4 });
  }
  await page.evaljs(`(() => { document.querySelector('.integ-card[data-integ="fake"]').scrollIntoView({ block: 'start' }); document.querySelector('.integ-card[data-integ="fake"] .integ-test').click(); return 1; })()`);
  await waitFor(page, `!!document.querySelector('.integ-card[data-integ="fake"] .integ-verdict')`, 30);
  await sleep(300);
  await capture(page, tag, 'integ-03-test-passed', '.integ-card[data-integ="fake"]', { pad: 4 });
  await api('PUT', '/api/integrations/fake', { values: { apiKey: 'fail-switch-0000' } });
  await waitFor(page, `/••••/.test((document.querySelector('.integ-card[data-integ="fake"] .integ-mask') || {}).textContent || '')`, 30);
  await page.evaljs(`(() => { document.querySelector('.integ-card[data-integ="fake"]').scrollIntoView({ block: 'start' }); document.querySelector('.integ-card[data-integ="fake"] .integ-test').click(); return 1; })()`);
  await waitFor(page, `!!document.querySelector('.integ-card[data-integ="fake"] .integ-test-error')`, 30);
  await sleep(300);
  await capture(page, tag, 'integ-04-test-failed-own-key', '.integ-card[data-integ="fake"]', { pad: 4 });
  // (lark's Test is a credential-exchange runner — with the cluster credential
  //  present it would call the vendor, so it is never clicked here; §ban-safety)
  await page.evaljs(`(() => { const r = document.querySelector('.integ-card[data-integ="fake"] .integ-field[data-field="apiKey"] .integ-replace'); document.querySelector('.integ-card[data-integ="fake"]').scrollIntoView({ block: 'start' }); if (r) r.click(); return 1; })()`);
  await sleep(300);
  await capture(page, tag, 'integ-06-editing-secret', '.integ-card[data-integ="fake"]', { pad: 4 });
  await closeAllWindows(page);

  page.close();
}

/** Every Latin-only visible string a zh/ja pass showed, deduped, with the
 *  surfaces it appeared on — the raw material of the audit's i18n table. */
function latinLeaks(tag) {
  const seen = new Map();
  for (const f of fs.readdirSync(OUT)) {
    if (!f.startsWith(tag + '-') || !f.endsWith('.json') || f.endsWith('-facts.json') || f.endsWith('-latin-leaks.json')) continue;
    let m; try { m = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf-8')); } catch { continue; }
    const surface = f.slice(tag.length + 1, -5);
    for (const x of [...(m.texts || []), ...(m.attrs || []).map((a) => ({ ...a, path: `${a.tag}[${a.attr}]` }))]) {
      if (!x.latin || x.cjk) continue;
      if (/^[\d\s:.\-–—·×%/()\[\]|+]*$/.test(x.text)) continue;
      const k = x.text;
      if (!seen.has(k)) seen.set(k, { text: k, paths: new Set(), surfaces: new Set() });
      seen.get(k).paths.add(x.path); seen.get(k).surfaces.add(surface);
    }
  }
  const out = [...seen.values()].map((v) => ({ text: v.text, paths: [...v.paths].slice(0, 3), surfaces: [...v.surfaces] })).sort((a, b) => b.surfaces.length - a.surfaces.length || a.text.localeCompare(b.text));
  fs.writeFileSync(path.join(OUT, `${tag}-latin-leaks.json`), JSON.stringify(out, null, 1));
  return out.length;
}

const runs = [];
for (const theme of THEMES) for (const lang of LANGS) for (const viewport of VIEWPORTS) {
  if (theme !== 'dark' && !LIGHT_LANGS.includes(lang)) continue;
  runs.push({ lang, viewport, theme });
}
for (const r of runs) {
  const tag = `${r.lang}-${r.viewport}-${r.theme}`;
  try { await pass(r); }
  catch (e) { log(`PASS ${tag} FAILED:`, e.message); manifest.push({ tag, name: 'PASS-FAILED', error: e.message }); }
  if (r.lang !== 'en') log(tag, 'latin-only strings on screen:', latinLeaks(tag));
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ at: new Date().toISOString(), runs, shots: manifest }, null, 1));
log(`${manifest.length} shots → ${OUT}`);
process.exit(0);
