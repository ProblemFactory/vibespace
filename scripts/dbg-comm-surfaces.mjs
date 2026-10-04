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
//   VS_UI_IM          '' (default) = the classic passes only; '1' = the classic
//                     passes AND the IM pass; 'only' = the IM pass alone. THE IM
//                     PASS (channel-polish, 2026-09-27 — the owner: "当作 IM 用还是
//                     有必要把界面好好优化下至少保证人能看清楚必要的信息") seeds a
//                     scratch store through the worktree's own modules with real-
//                     shape Lark + Gmail records (the REAL adapters' toRecord over
//                     invented items: 3 authors + you, a mention, links, a picture
//                     from the attachment cache, a card, a system line, a run of 4
//                     within 2 min, a day boundary; a mail thread with a folded
//                     quote and an attachment) on DISABLED accounts (no pass, zero
//                     vendor calls), and shoots the attention list at every rail
//                     width, an account card, the Lark / Gmail windows (a
//                     continuation hovered, the quote opened) and the phone.
//                     Each IM shot's JSON carries `im` = the rect census input
//                     (scripts/test-channels-i18n.mjs imCensus).
//   VS_UI_FACE        force a font face on the page (e.g. 'DejaVu Sans', the
//                     runner's system-ui — the .185 lesson)
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
// r4: Gmail's OAuth client is an ACCOUNT's choice among the Google presets (the storage
// reader's env); one preset here, dropped in boot B so the account it minted says so BY NAME
const GOOGLE_PRESETS = JSON.stringify([{ key: 'team', label: 'Team Google client', clientId: 'team.apps.googleusercontent.com', clientSecret: 'team-google-secret-0000' }]);
const bootServer = (extraEnv = {}) => spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', VIBESPACE_INTEGRATIONS: CLUSTER, VIBESPACE_GDRIVE_CLIENTS: GOOGLE_PRESETS, ...extraEnv },
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
  // r4: the account dialogs START consents — the page's window.open records the URL and opens nothing,
  // so no vendor consent page is ever loaded by this driver (§ban-safety)
  let noPopups = false;
  const load = async () => {
    if (!noPopups) { noPopups = true; await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return {}; };" }); }
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
    for (const a of ['title', 'placeholder']) { const v = el.getAttribute(a); if (v) attrs.push({ attr: a, text: v.slice(0, 600), latin: /[A-Za-z]{3,}/.test(v), cjk: /[\\u3040-\\u30ff\\u3400-\\u9fff]/.test(v), tag: el.tagName.toLowerCase(), cls: typeof el.className === 'string' ? el.className : '' }); }
  }
  return { rect: R(root), scroll: { w: root.scrollWidth, h: root.scrollHeight, cw: root.clientWidth, ch: root.clientHeight }, els, texts, attrs, viewport: { w: innerWidth, h: innerHeight }, theme: document.documentElement.getAttribute('data-theme'), lang: localStorage.getItem('vibespace.lang') };
})`;
const PROBES = JSON.stringify([
  '.chan-head', '.chan-summary', '.chan-outbox-btn', '.chan-sec', '.chan-sec-head', '.chan-sec-head b', '.chan-sec-state', '.chan-adapter-ctl', '.chan-auth', '.chan-eta', '.chan-auth-err', '.chan-push', '.chan-actions', '.chan-btn', '.chan-row', '.chan-row-title', '.chan-row-sub', '.chan-row-assign', '.chan-chip', '.chan-unread', '.chan-awaiting', '.chan-empty', '.chan-connect', '.chan-connect-row', '.chan-connect-row b', '.chan-connect-note', '.chan-identity-observed', '.chan-bar', '.chan-outbox-count', '.chan-sec-name', '.chan-sec-count', '.chan-sec-more', '.chan-dot', '.chan-sec-note', '.chan-sec-verb', '.chan-rows', '.chan-row-who', '.chan-row-needs', '.chan-connect-btn', '.chan-connect-label', '.chan-sec-chev', '.chan-sec-kind',
  '.chanwin-bar', '.chanwin-bar b', '.chanwin-meta', '.chanwin-assign', '.chanwin-title-row', '.chanwin-title-row .icon-btn', '.chan-assign-chip', '.chanmsg-day', '.chanmsg-cont', '.chanwin-list', '.chanmsg', '.chanmsg-head', '.chanmsg-head b', '.chanmsg-at', '.chanmsg-syn', '.chanmsg-body', '.chanwin-foot', '.chanwin-composer', '.chanwin-composer textarea', '.chanwin-composer-row', '.chanwin-note', '.chanwin-warn', '.chanwin-readonly', '.chanwin-empty', '.chanwin-outbox', '.chanwin-outbox-head',
  '.chan-prop', '.chan-prop-head', '.chan-prop-state', '.chan-prop-who', '.chan-prop-when', '.chan-prop-where', '.chan-prop-why', '.chan-prop-text', '.chan-prop-policy', '.chan-prop-identity', '.chan-prop-idwarn', '.chan-prop-reason', '.chan-prop-actions', '.chan-prop-reconcile', '.chan-prop-ttl', '.chan-prop-receipt', '.chan-prop-rejectbox', '.chan-prop-edit', '.chan-outbox-list', '.chan-prop-meta', '.chan-prop-foot', '.chan-seg', '.chan-seg .jobs-btn', '.chan-outbox-sec',
  '.dialog', '.dialog-header', '.dialog-header h3', '.dialog-close', '.dialog-body', '.chan-flow-intro', '.chan-flow-note', '.chan-flow-refusal', '.chan-flow-label', '.chan-flow-input', '.chan-flow-actions', '.chan-flow-status', '.chan-opt', '.chan-opt-label', '.chan-opt-input', '.chan-opt-help', '.chan-af-rules', '.chan-af-row', '.chan-af-rule', '.chan-af-kind', '.chan-af-inline', '.chan-search-row', '.chan-search-results', '.chan-search-hit', '.chan-search-head', '.chan-search-text', '.chan-reach-row', '.chan-reach-who', '.chan-reach-origin', '.chan-reach-add', '.chan-opt-check', '.chan-steps', '.chan-step', '.chan-flow-primary', '.chan-flow-primary .mounts-btn', '.chan-flow-wait', '.chan-flow-paste', '.chan-af-grid', '.chan-af-field', '.chan-af-stat', '.chan-af-stat-hint', '.chan-af-add', '.chan-af-rm', '.chan-reach-list', '.chan-reach-level', '.chan-reach-rm', '.dialog-check-row', '.mounts-btn', '.mounts-btn-primary', '.icon-btn', '.chan-ic',
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
const tagSections = (page) => page.evaljs(`(() => { const secs = [...document.querySelectorAll('.rail-panel-channels .chan-sec[data-adapter]')]; for (const s of secs) s.dataset.chanSec = s.dataset.adapter; return secs.length; })()`);
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
// a user-drafted PROPOSAL through the /propose route (g3: the composer on a
// send-as-user conversation now SENDS the owner's own words directly, so the
// cards this driver shoots come from the route; they arrive in the open window
// through `channel-outbox-updated` exactly as before)
const PROPOSE = (convId, text) => `(async () => {
  const w = ${WIN(convId)};
  const r = await fetch('/api/channels/' + encodeURIComponent(w._openSpec.adapterId) + '/' + encodeURIComponent(${JSON.stringify(convId)}) + '/propose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: ${JSON.stringify(text)} }) }).then((x) => x.json());
  if (!r || r.error) return { fail: 'propose refused' };
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
  // a principal for the Grant access / Notify / Reach editors (a Task Group — no live agent session in this fixture)
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
    // ── PANEL: fresh (the first discovery pass; Connect block = lark cluster / gmail none) ──
    await capture(page, tag, 'panel-01-fresh', '#sidebar');
    await capture(page, tag, 'panel-01b-connect-block', '.rail-panel-channels .chan-connect', { pad: 4 });
  }
  // 2026-09-26 (aggregated IM): every conversation of a linked account is
  // listed AND fetched — there is no track step. Wait for the discovery pass
  // to list them all (the mobile pass has no panel), then give ONE row a
  // refresh override so its chip shows the user's own cadence.
  for (let i = 0; i < 80; i++) { const d = (await api('GET', '/api/channels')).json; if (d && (d.conversations || []).length >= 6) break; await sleep(250); }
  { const r = await api('PUT', '/api/channels/fake-poll/fake-poll-announce/refresh', { every: 60 });
    if (r.status !== 200) log('refresh override', 'HTTP', r.status, r.text.slice(0, 120)); }
  await sleep(3000);
  if (hasPanel) {
    await tagSections(page);
    await capture(page, tag, 'panel-02-rows', '#sidebar');
    await capture(page, tag, 'panel-02b-section-poll', SEC('fake-poll'), { pad: 4 });
    await capture(page, tag, 'panel-02c-section-push', SEC('fake-push'), { pad: 4 });
    await capture(page, tag, 'panel-02d-section-scan', SEC('fake-scan'), { pad: 4 });
    await capture(page, tag, 'panel-02e-section-agents', SEC('agents'), { pad: 4 });
    // the row menu (a contribution) on a row — Mark read / Refresh now / Refresh every ▸
    await page.evaljs(`(() => { const r = document.querySelector('.rail-panel-channels .chan-row[data-conv="fake-poll/fake-poll-ops"]'); if (!r) return 0; const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.x + 40, clientY: b.y + 10 })); return 1; })()`);
    await sleep(250);
    await capture(page, tag, 'panel-02f-row-menu', '.context-menu', { pad: 4 });
    await closeDialogs(page);
    // the adapter's ⋯ menu (a4: every section verb lives here)
    await page.evaljs(`(() => { const b = document.querySelector('${SEC('fake-poll')} .chan-sec-more'); if (b) b.click(); return !!b; })()`);
    await sleep(250);
    await capture(page, tag, 'panel-02g-adapter-menu', '.context-menu', { pad: 4 });
    await closeDialogs(page);
    // R3 (2026-09-26, design §23): THE FIRST SCREEN IS THE ATTENTION LIST — one conversation handed to an
    // agent wears its tag ("→ Scout", the name a data path) in the default view; "All" is the whole list
    { const r = await api('PUT', '/api/channels/fake-poll/fake-poll-ops/assignment', { assignment: { principal: { kind: 'agent', id: 'cid-scout', name: 'Scout' }, mode: 'all', notify: 'digest', digestMinutes: 60 } });
      if (r.status !== 200) log('assignment', 'HTTP', r.status, r.text.slice(0, 120)); }
    await waitFor(page, `!!document.querySelector('.rail-panel-channels .chan-grow-tag')`, 40);
    await page.evaljs(`(() => { for (let n = document.querySelector('.rail-panel-channels .chan-bar'); n; n = n.parentElement) n.scrollTop = 0; return 1; })()`);
    await capture(page, tag, 'panel-02h-first-screen', '#sidebar');
    await page.evaljs(`(() => { const b = document.querySelector('.rail-panel-channels .chan-view-btn[data-view="all"]'); if (b) b.click(); return !!b; })()`);
    await sleep(200);
    await page.evaljs(`(() => { for (let n = document.querySelector('.rail-panel-channels .chan-bar'); n; n = n.parentElement) n.scrollTop = 0; return 1; })()`);
    await capture(page, tag, 'panel-02i-first-screen-all', '#sidebar');
    await page.evaljs(`(() => { const b = document.querySelector('.rail-panel-channels .chan-view-btn[data-view="focus"]'); if (b) b.click(); return !!b; })()`);
    await api('PUT', '/api/channels/fake-poll/fake-poll-ops/assignment', { assignment: null });
    await sleep(300);
    // DISABLED adapter
    await api('PUT', '/api/channels/adapters/fake-scan', { enabled: false });
    await sleep(800); await tagSections(page);
    await capture(page, tag, 'panel-03-disabled-scan', SEC('fake-scan'), { pad: 4 });
    await api('PUT', '/api/channels/adapters/fake-scan', { enabled: true });
    await sleep(800);
  }
  // r4 (docs/design-integrations-per-account.zh.md, chunk 3): THE ACCOUNT
  // DIALOGS — the storage dialog component. One `Connect an account` entry,
  // type-first; a Lark and a Gmail ACCOUNT are then minted through the pre-r4
  // connect route (its consent begins and is cancelled — no vendor is ever
  // reached) so the card, Re-authorize (port busy), Edit, Duplicate and the
  // Options dialogs have a record to draw.
  const DLG = (kind) => `.dialog-body[data-chan-dialog="${kind}"]`;
  const mkAccount = async (kind) => {
    const r = await api('POST', `/api/channels/adapters/${kind}/connect`, {});
    if (r.status !== 200) { log('connect', kind, 'HTTP', r.status, r.text.slice(0, 160)); return null; }
    const id = r.json && r.json.adapter && r.json.adapter.id;
    if (id) await api('POST', `/api/channels/adapters/${encodeURIComponent(id)}/auth/cancel`, {});
    return id;
  };
  if (hasPanel) {
    await tagSections(page);
    const r0 = await page.evaljs(`(() => { const b = document.querySelector('.rail-panel-channels [data-connect-account]'); if (!b) return 'no entry'; b.click(); return 'ok'; })()`);
    log('connect an account:', r0);
    await waitFor(page, `!!document.querySelector('${DLG('connect')}')`, 40);
    await sleep(300);
    await capture(page, tag, 'wizard-01-connect', '#mounts-dialog-overlay .dialog', { pad: 8 });
    // Lark + Custom: the custom fields, the callback row, the three prerequisites
    await page.evaljs(`(() => { const d = document.querySelector('${DLG('connect')}'); const t = d.querySelector(':scope > select'); t.value = 'lark'; t.dispatchEvent(new Event('change')); const c = [...d.querySelectorAll(':scope > select')].find((s) => s.style.display !== 'none' && [...s.options].some((o) => o.value === 'custom')); c.value = 'custom'; c.dispatchEvent(new Event('change')); return 1; })()`);
    await sleep(200);
    await capture(page, tag, 'wizard-02-connect-lark-custom', '#mounts-dialog-overlay .dialog', { pad: 8, fullPage: true });
    await page.evaljs(`(() => { const d = document.querySelector('${DLG('connect')}'); const t = d.querySelector(':scope > select'); t.value = 'gmail'; t.dispatchEvent(new Event('change')); return 1; })()`);
    await sleep(200);
    await capture(page, tag, 'wizard-03-connect-gmail', '#mounts-dialog-overlay .dialog', { pad: 8 });
    await closeDialogs(page);
  }
  const larkId = await mkAccount('lark');
  const gmailId = await mkAccount('gmail');
  log('accounts:', larkId, gmailId);
  await sleep(1200);
  if (hasPanel) {
    await tagSections(page);
    await capture(page, tag, 'panel-05-lark-not-connected', SEC('lark'), { pad: 4 });
    // PORT-BUSY: hold the fixed callback port, Re-authorize from the card's Connect
    const held = await holdPort(LARK_PORT).catch((e) => { log('could not hold port', LARK_PORT, e.message); return null; });
    const r2 = await clickBtn(page, lang, SEC('lark'), 'Connect');
    log('connect lark (port busy):', r2);
    await waitFor(page, `!!document.querySelector('${DLG('reauth')}')`, 40);
    await page.evaljs(`(() => { const b = document.querySelector('${DLG('reauth')} > .mounts-btn-primary'); if (b) b.click(); return !!b; })()`);
    await waitFor(page, `!!document.querySelector('#chan-reauth-dialog .mounts-oauth-link')`, 40);
    await sleep(400);
    await capture(page, tag, 'wizard-04-reauth-port-busy', '#chan-reauth-dialog .dialog', { pad: 8 });
    await closeDialogs(page);
    await api('POST', `/api/channels/adapters/${encodeURIComponent(larkId || 'lark')}/auth/cancel`, {});
    if (held) await new Promise((r) => held.close(r));
    await sleep(600); await tagSections(page);
    // EDIT (the storage edit grammar) and DUPLICATE (its own consent — never started here)
    await page.evaljs(`(() => { const b = document.querySelector('${SEC('lark')} .chan-sec-head .mounts-icon-btn'); if (b) b.click(); return !!b; })()`);
    await waitFor(page, `!!document.querySelector('${DLG('edit')}')`, 40);
    await sleep(300);
    await capture(page, tag, 'wizard-05-edit', '#mounts-dialog-overlay .dialog', { pad: 8, fullPage: true });
    await closeDialogs(page);
    await tagSections(page);
    await clickMenu(page, lang, SEC('gmail'), 'Duplicate…');
    await waitFor(page, `!!document.querySelector('${DLG('duplicate')}')`, 40);
    await sleep(300);
    await capture(page, tag, 'wizard-06-duplicate', '#mounts-dialog-overlay .dialog', { pad: 8, fullPage: true });
    await closeDialogs(page);
    // REMOVE REFUSED: the dialog's words (the references are staged on the page's fetch — the
    // engine's refusal is the chunk-2 suites'; this driver only needs the dialog on screen)
    await page.evaljs(`(() => { const of = window.fetch; window.fetch = function (u, init, ...r) { if (init && init.method === 'DELETE' && /\\/api\\/channels\\/adapters\\//.test(String(u))) return Promise.resolve(new Response(JSON.stringify({ error: 'referenced', code: 'account-referenced', detail: { refs: [{ kind: 'access', convId: 'fake-poll-ops', title: 'Ops room', scope: 'conversation', principal: { kind: 'group', id: 'g1', name: 'Ops triage' } }, { kind: 'reach', principal: { kind: 'agent', id: 'a1', name: 'Scout' } }, { kind: 'outbox', id: 'p1' }] } }), { status: 409, headers: { 'Content-Type': 'application/json' } })); return of.call(this, u, init, ...r); }; return 1; })()`);
    await tagSections(page);
    await clickMenu(page, lang, SEC('gmail'), 'Remove…');
    await sleep(250);
    await page.evaljs(`(() => { const b = [...document.querySelectorAll('.dialog-overlay .dialog-footer .btn-create')].pop(); if (b) b.click(); return !!b; })()`);
    await waitFor(page, `!!document.querySelector('#chan-remove-refused')`, 40);
    await sleep(300);
    await capture(page, tag, 'wizard-07-remove-refused', '#chan-remove-refused .dialog', { pad: 8 });
    await closeDialogs(page);
    // SEARCH / RULE GRAIN / OPTIONS / PUSH dialogs (2026-09-26: the Track… picker is gone)
    await clickMenu(page, lang, SEC('fake-poll'), 'Search messages…');
    await waitFor(page, `!!document.querySelector('#chan-search-dialog .chan-opt-input')`, 20);
    await page.evaljs(`(() => { const d = document.querySelector('#chan-search-dialog'); const i = d.querySelector('.chan-opt-input'); i.value = 'staging'; const b = d.querySelector('.mounts-btn-primary'); if (b) b.click(); return 1; })()`);
    await waitFor(page, `!!document.querySelector('#chan-search-dialog .chan-search-hit') || /\d/.test((document.querySelector('#chan-search-dialog .chan-flow-status') || {}).textContent || '')`, 40);
    await sleep(300);
    await capture(page, tag, 'dialog-search', '#chan-search-dialog .dialog', { pad: 8 });
    await closeDialogs(page);
    // R4: a new rule starts with its ACCESS (the first operation)
    await clickMenu(page, lang, SEC('fake-poll'), 'Conversations matching a rule…');
    await waitFor(page, `!!document.querySelector('#chan-access-dialog .chan-af-rule')`, 20);
    await sleep(600);
    await capture(page, tag, 'dialog-rule-access', '#chan-access-dialog .dialog', { pad: 8 });
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
  }

  // ── WINDOWS: sendable / read-only adapter / read-only mailbox / a scanned room ──
  await openWin(page, 'fake-poll', 'fake-poll-ops', { composer: true });
  await capture(page, tag, 'win-01-sendable', '[data-shot="win"]');
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
  await waitFor(page, `(() => { const w = ${WIN('fake-scan-announce')}; return !!(w && w.content.querySelector('.chanwin-empty, .chanmsg')); })()`, 40);
  await sleep(300);
  await capture(page, tag, 'win-03-scan', '[data-shot="win"]');
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
  // B-f467: the Outbox lists one ROW per proposal; the first row is opened so its full card is on screen too
  await waitFor(page, `document.querySelectorAll('.chan-outbox-list .chan-orow').length >= 4`, 40);
  await page.evaljs(`(() => { const r = document.querySelector('[data-shot="win"] .chan-outbox-list > .chan-orow'); if (r) r.click(); return !!r; })()`);
  await sleep(300);
  await capture(page, tag, 'outbox-window', '[data-shot="win"]');
  await page.evaljs(`(() => { const b = document.querySelector('[data-shot="win"] .chan-seg [data-view="all"]'); if (b) b.click(); return !!b; })()`);
  await sleep(300);
  await capture(page, tag, 'outbox-window-all', '[data-shot="win"]');
  await page.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter((x) => x.type === 'channel-outbox')) window.app.wm.closeWindow(w.id); return 1; })()`);

  // ── R4: GRANT ACCESS… (the first operation) → NOTIFY… (the second, live estimate) → REACH & POLICY ──
  await page.evaljs(`(() => { const w = ${WIN('fake-poll-ops')}; for (const e of document.querySelectorAll('[data-shot="win"]')) delete e.dataset.shot; w.element.dataset.shot = 'win'; window.app.wm.focusWindow(w.id); return 1; })()`);
  await waitFor(page, `(() => { const w = ${WIN('fake-poll-ops')}; return !!(w && w.content.querySelector('[data-channel-assign]')); })()`, 20);
  await page.evaljs(`(() => { const w = ${WIN('fake-poll-ops')}; w.content.querySelector('[data-channel-assign]').click(); return 1; })()`);
  // channel-polish: who = the ONE principal picker (the box focused on open) — type the group's name, Enter picks it
  await waitFor(page, `!!document.querySelector('#chan-access-dialog .chan-access-pick .pp-input')`, 20);
  await page.evaljs(`(() => { const b = document.querySelector('#chan-access-dialog .chan-access-pick .pp-input'); b.focus(); b.value = 'Ops'; b.dispatchEvent(new Event('input')); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return 1; })()`);
  await waitFor(page, `!!document.querySelector('#chan-access-dialog .chan-access-row')`, 20);
  await sleep(300);
  await capture(page, tag, 'dialog-access', '#chan-access-dialog .dialog', { pad: 8 });
  const granted = await clickBtn(page, lang, '#chan-access-dialog', 'Save');
  log('access save:', granted);
  await waitFor(page, `!document.querySelector('#chan-access-dialog')`, 30);
  await sleep(800);
  await page.evaljs(`(() => { const w = ${WIN('fake-poll-ops')}; w.content.querySelector('[data-channel-assign]').click(); return 1; })()`);
  await waitFor(page, `!!document.querySelector('#chan-notify-dialog .chan-watch-row .pp-trigger')`, 20);
  await sleep(300);
  await capture(page, tag, 'dialog-notify-default', '#chan-notify-dialog .dialog', { pad: 8 });
  await page.evaljs(`(() => { const d = document.querySelector('#chan-notify-dialog'); d.querySelector('.chan-watch-row input[type=radio][value=rule]').click(); return 1; })()`);
  await sleep(150);
  await clickBtn(page, lang, '#chan-notify-dialog', 'Add rule');
  // the fresh rule has an EMPTY value: the stat line words the validator's refusal (a3 r4 — it used
  // to print the PURE module's English `keyword: value is required` under zh/ja)
  await waitFor(page, `!!document.querySelector('#chan-notify-dialog .chan-flow-status.chan-warn')`, 20);
  await sleep(200);
  await capture(page, tag, 'dialog-notify-filter-incomplete', '#chan-notify-dialog .dialog', { pad: 8 });
  await page.evaljs(`(() => { const d = document.querySelector('#chan-notify-dialog'); const inp = d.querySelector('.chan-af-rule input'); if (inp) { inp.value = 'deploy'; inp.dispatchEvent(new Event('input')); } return 1; })()`);
  await waitFor(page, `(() => { const e = document.querySelector('#chan-notify-dialog .chan-flow-status'); return !!(e && /\\d/.test(e.textContent)); })()`, 30);
  await sleep(300);
  await capture(page, tag, 'dialog-notify-filter', '#chan-notify-dialog .dialog', { pad: 8 });
  const saved = await clickBtn(page, lang, '#chan-notify-dialog', 'Save');
  log('notify save:', saved);
  await waitFor(page, `!document.querySelector('#chan-notify-dialog')`, 30);
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
    await waitFor(page, `!!document.querySelector('#chan-notify-dialog select')`, 20);
    await sleep(300);
    await capture(page, tag, 'narrow-dialog-notify', '#chan-notify-dialog .dialog', { fullPage: true });
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
      await page.evaljs(`(() => { const b = document.querySelector('.rail-panel-channels [data-connect-account]'); if (b) b.click(); return !!b; })()`);
      await waitFor(page, `!!document.querySelector('.dialog-body[data-chan-dialog="connect"]')`, 20);
      await sleep(300);
      await capture(page, tag, 'narrow-dialog-connect', '#mounts-dialog-overlay .dialog', { fullPage: true });
      await closeDialogs(page);
      await sleep(300); await tagSections(page);
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
  await api('PUT', '/api/integrations/cloak', { values: { licenseKey: 'cb_1234567890abcd' } });
  await sleep(1500);   // the adapters store's debounced write
  srv.kill('SIGKILL'); await waitDown();
  try { log('expire lark:', expireLarkToken()); } catch (e) { log('expire lark failed:', e.message); }
  const keyFile = path.join(wt, 'data/.integrations-key');
  try { fs.writeFileSync(keyFile, 'f'.repeat(64)); } catch (e) { log('key rotate failed:', e.message); }
  // boot B drops the Gmail preset: the Gmail ACCOUNT minted under it says so BY NAME (r4 §3.7)
  srv = bootServer({ VIBESPACE_GDRIVE_CLIENTS: '' }); if (!(await waitServer())) throw new Error('server B did not boot');
  await page.prime({ lang, theme, sidebarWidth: 260 });
  if (!(await page.load())) throw new Error('app did not reload');
  await sleep(600);
  if (!mobile && (await openPanel(page))) {
    await waitFor(page, `!!document.querySelector('.rail-panel-channels .chan-account[data-adapter="lark"] .mounts-errline')`, 40);
    await tagSections(page);
    await capture(page, tag, 'panel-10-B-expired', SEC('lark'), { pad: 4 });
    await waitFor(page, `!!document.querySelector('.rail-panel-channels .chan-account[data-adapter="gmail"] .mounts-errline')`, 60);
    await tagSections(page);
    await capture(page, tag, 'panel-10b-B-preset-gone', SEC('gmail'), { pad: 4 });
    await capture(page, tag, 'panel-11-B-full', '#sidebar');
  }
  // INTEGRATIONS (r4: the six agent-browser key rows only): the window, two cards, Test passed /
  // failed (zero-network Tests only — cloak's shape check, a keyless cloud row's refusal), the
  // undecryptable row, a secret being replaced
  await page.evaljs(`(() => { const w = window.app.openIntegration('cloak'); for (const e of document.querySelectorAll('[data-shot="win"]')) delete e.dataset.shot; w.element.dataset.shot = 'win'; return w.id; })()`);
  await waitFor(page, `document.querySelectorAll('.integ-card').length >= 6`, 40);
  await sleep(400);
  await capture(page, tag, 'integ-01-window', '[data-shot="win"]');
  for (const id of ['cloak', 'cloud:browserless']) {
    await page.evaljs(`(() => { const c = document.querySelector('.integ-card[data-integ="${id}"]'); if (c) c.scrollIntoView({ block: 'start' }); return 1; })()`);
    await sleep(200);
    await capture(page, tag, `integ-02-card-${id.replace(':', '-')}`, `.integ-card[data-integ="${id}"]`, { pad: 4 });
  }
  const BU = '.integ-card[data-integ="cloud:browseruse"]';
  await page.evaljs(`(() => { document.querySelector('${BU}').scrollIntoView({ block: 'start' }); document.querySelector('${BU} .integ-test').click(); return 1; })()`);
  await waitFor(page, `!!document.querySelector('${BU} .integ-test-error')`, 30);
  await sleep(300);
  await capture(page, tag, 'integ-04-test-failed-no-key', BU, { pad: 4 });
  const BB = '.integ-card[data-integ="cloud:browserbase"]';
  await page.evaljs(`(() => { const r = document.querySelector('${BB} .integ-field[data-field="apiKey"] .integ-replace'); document.querySelector('${BB}').scrollIntoView({ block: 'start' }); if (r) r.click(); return 1; })()`);
  await sleep(300);
  await capture(page, tag, 'integ-06-editing-secret', BB, { pad: 4 });
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

// ════════════════════════════════════════════════════════════════════════
// THE IM PASS (VS_UI_IM, channel-polish 2026-09-27): a seeded store, the
// attention list at every rail width, an account card, the Lark / Gmail
// windows and the phone — each shot's JSON carries `im`, the RECT CENSUS
// input (scripts/test-channels-i18n.mjs `imCensus`): per row / bar / message
// the rect of every part and whether a part that must be WHOLE is cut, plus
// the phone's interactive targets.
// ════════════════════════════════════════════════════════════════════════
const IM = String(process.env.VS_UI_IM || '').trim();
const FACE = String(process.env.VS_UI_FACE || '').trim();
const MIN = 60e3;

/** Seed the scratch store (before boot) through the WORKTREE's own modules:
 *  disabled Lark + Gmail accounts (no pass, zero vendor calls) whose records
 *  are the REAL adapters' `toRecord` over invented items in the real shapes. */
async function seedIm() {
  const W = (rel) => require(path.join(wt, rel));
  const { createChannelStore } = W('src/channel-store.js');
  const lark = W('src/channels/lark.js');
  const gmail = W('src/channels/gmail.js');
  const store = createChannelStore({ dir: path.join(wt, 'data/channels'), log: { log() {}, warn() {}, error() {} } });
  const NOW = Date.now();
  const acct = (id, kind, label, scopes) => ({ id, kind, label, enabled: false, auth: { tokenEnc: null, expiresAt: null, scopes, user: 'Member A' }, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null });
  await store.adapters.update((ad) => {
    ad.adapters.push(acct('lark', 'lark', 'Lark / 飞书', ['im:message', 'im:message.send_as_user', 'im:chat:readonly']));
    ad.adapters.push(acct('lark:2', 'lark', 'Lark ops', ['im:message', 'im:chat:readonly']));
    ad.adapters.push(acct('gmail', 'gmail', 'Gmail', ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose']));
    // the fake POLL adapter (enabled — a local fixture, no vendor): its room carries an agent's draft
    // awaiting approval, so the attention list shows that tag too (the engine seeds fakes only into an
    // EMPTY store, so the record is written here, in the engine's own shape)
    ad.adapters.push({ id: 'fake-poll', kind: 'fake-poll', label: 'fake-poll', enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] }, scan: null });
  });
  const names = new Map([['ou_ada', 'Ada'], ['ou_brook', 'Brook'], ['ou_cass', 'Cass'], ['ou_me', 'Member A']]);
  const item = (id, at, from, msg_type, content, extra = {}) => ({ message_id: id, msg_type, create_time: String(Math.round(at)), chat_id: 'oc_x', sender: { id: from, sender_type: 'user' }, body: { content: JSON.stringify(content) }, ...extra });
  const L = (conv, it) => lark.toRecord('lark', conv, it, { names, selfId: 'ou_me' });
  // THE LAUNCH ROOM: a day boundary (26 h back), a system line, Ada's run of four within 2 min
  // (a link, a mention, a picture), Brook's rich-text post, Cass's card, a file, your own reply
  const T = NOW - 40 * MIN;
  const launch = [
    L('oc_launch', item('om_y1', T - 26 * 60 * MIN, 'ou_cass', 'text', { text: 'Build 412 is on staging — shipping tonight if the checks stay green.' })),
    L('oc_launch', item('om_y2', T - 26 * 60 * MIN + 3 * MIN, 'ou_me', 'text', { text: 'Sounds good — I will watch the dashboard.' })),
    L('oc_launch', item('om_s1', T - 6 * MIN, 'ou_cass', 'system', { template: '{from_user} added {to_chatters} to the group', from_user: 'Cass', to_chatters: ['Brook'] })),
    L('oc_launch', item('om_a1', T, 'ou_ada', 'text', { text: 'Morning! Quick update on the launch:' })),
    L('oc_launch', item('om_a2', T + 35e3, 'ou_ada', 'text', { text: '@_user_1 the demo is up: [demo-7f3a](https://demo-7f3a.example/) — notes at https://docs.example/launch?v=2.' }, { mentions: [{ key: '@_user_1', id: 'ou_brook', name: 'Brook' }] })),
    L('oc_launch', item('om_a3', T + 70e3, 'ou_ada', 'image', { image_key: 'img_launch' })),
    L('oc_launch', item('om_a4', T + 110e3, 'ou_ada', 'text', { text: 'Can you run the checklist before 3pm?' })),
    L('oc_launch', item('om_b1', T + 6 * MIN, 'ou_brook', 'post', { title: '', content: [[{ tag: 'at', user_id: 'ou_ada', user_name: 'Ada' }, { tag: 'text', text: ' on it — see ' }, { tag: 'a', text: 'the checklist', href: 'https://wiki.example/checklist' }]] })),
    L('oc_launch', item('om_c1', T + 9 * MIN, 'ou_cass', 'interactive', { header: { title: { content: 'Deploy #412 finished' } }, elements: [{ tag: 'div', text: { content: 'Environment: staging' } }, { tag: 'div', text: { content: 'Duration: 4 min 12 s · all checks green' } }] })),
    L('oc_launch', item('om_b2', T + 12 * MIN, 'ou_brook', 'file', { file_key: 'file_notes', file_name: 'release-notes-412.pdf' })),
    L('oc_launch', item('om_m1', T + 15 * MIN, 'ou_me', 'text', { text: 'Thanks all — I will look after lunch.' })),
  ];
  store.appendRecords('lark', 'oc_launch', launch);
  await store.attachmentPut('lark', 'oc_launch', 'img_launch', { data: picturePng(), mime: 'image/png', name: 'image' });
  store.appendRecords('lark', 'oc_brook', [L('oc_brook', item('om_d1', T - 3 * 60 * MIN, 'ou_brook', 'text', { text: 'Do you have 10 minutes for the release notes?' }))]);
  store.appendRecords('lark', 'oc_design', [L('oc_design', item('om_g1', T - 30 * 60 * MIN, 'ou_ada', 'text', { text: 'Mockups for the settings page are in the shared folder.' }))]);
  store.appendRecords('lark:2', 'oc_ro', [lark.toRecord('lark:2', 'oc_ro', item('om_ro1', T - 20 * MIN, 'ou_cass', 'text', { text: 'status: all green' }), { names })]);
  // THE MAIL THREAD: Ada's question, Brook's reply over the quoted history (folded) with a PDF
  const b64u = (x) => Buffer.from(x, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const reply = 'Hi Ada,\n\nThe numbers look right to us — the summary is attached.\nWe will confirm the forecast by Friday.\n\nBrook\n\nOn Mon, Sep 21, 2026 at 9:14 AM Ada Example <ada@example.com> wrote:\n> Hello Brook,\n> the Q3 numbers are in https://sheets.example/q3.\n> Revenue is up 4%.\n> Costs are flat.\n> Please confirm.\n> Ada\n';
  const mail = (conv, id, at, from, subject, parts) => gmail.toRecord('gmail', conv, { id, threadId: conv, internalDate: String(at), labelIds: ['INBOX'], payload: { mimeType: 'multipart/mixed', headers: [{ name: 'From', value: from }, { name: 'Subject', value: subject }], parts } }, { selfEmail: 'member.a@example.com' });
  store.appendRecords('gmail', 't_q', [
    mail('t_q', 'm_q1', T - 90 * MIN, 'Ada Example <ada@example.com>', 'Quarterly numbers', [{ partId: '0', mimeType: 'text/plain', body: { data: b64u('Hello Brook,\nthe Q3 numbers are in https://sheets.example/q3.\nRevenue is up 4%.\nCosts are flat.\nPlease confirm.\nAda\n') } }]),
    mail('t_q', 'm_q2', T + 5 * MIN, 'Brook Example <brook@example.com>', 'Re: Quarterly numbers', [{ partId: '0', mimeType: 'text/plain', body: { data: b64u(reply) } }, { partId: '1', mimeType: 'application/pdf', filename: 'Q3-summary.pdf', body: { attachmentId: 'ANGjdJ_q3', size: 248320 } }]),
  ]);
  store.appendRecords('gmail', 't_budget', [mail('t_budget', 'm_b1', T - 5 * 60 * MIN, 'Cass Example <cass@example.com>', 'Budget follow-up', [{ partId: '0', mimeType: 'text/plain', body: { data: b64u('Can we close the budget this week?\n') } }])]);
  const caps = (sendAs, why) => ({ read: 'yes', sendAs, why, at: NOW });
  const conv = (a, c, title, kind, cc, { participants = '', unread = 0, lastText = '', lastAt = NOW } = {}) => { const en = store.index.entry(a, c); en.title = title; en.kind = kind; en.convCaps = cc; en.lastAt = lastAt; en.listedAt = NOW; en.participants = participants; en.unread = unread; en.lastText = lastText; };
  await store.index.update(() => {
    conv('lark', 'oc_launch', 'Launch room', 'group', caps(['user'], null), { participants: 'Ada, Brook, Cass, Member A', unread: 4, lastText: 'Thanks all — I will look after lunch.', lastAt: T + 15 * MIN });
    conv('lark', 'oc_brook', 'Brook', 'dm', caps(['user'], null), { participants: 'Brook', unread: 1, lastText: 'Do you have 10 minutes for the release notes?', lastAt: T - 3 * 60 * MIN });
    conv('lark', 'oc_design', 'Design review', 'group', caps(['user'], null), { participants: 'Ada, Member A', lastText: 'Mockups for the settings page are in the shared folder.', lastAt: T - 30 * 60 * MIN });
    conv('lark:2', 'oc_ro', 'Ops room', 'group', caps([], 'send-scope-not-granted'), { participants: 'Cass', lastText: 'status: all green', lastAt: T - 20 * MIN });
    conv('gmail', 't_q', 'Re: Quarterly numbers', 'thread', caps([], 'send-scope-not-granted'), { participants: 'Ada Example, Brook Example', unread: 2, lastText: 'Hi Ada, The numbers look right to us — the summary is attached.', lastAt: T + 5 * MIN });
    conv('gmail', 't_budget', 'Budget follow-up', 'thread', caps([], 'send-scope-not-granted'), { participants: 'Cass Example', lastText: 'Can we close the budget this week?', lastAt: T - 5 * 60 * MIN });
  });
  store.index.flush && store.index.flush();
  store.close && store.close();
}
/** A 240×150 two-tone gradient PNG (big enough to SEE the picture card). */
function picturePng(w = 240, h = 150) {
  const zlib = require('node:zlib');
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 40 + Math.round(150 * x / w); raw[o + 1] = 90 + Math.round(100 * y / h); raw[o + 2] = 160; } }
  const table = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** The DISABLED Lark / Gmail accounts drawn as CONNECTED (a page-side view of
 *  the digest — the card's health line is what is shot; no pass ever runs).
 *  Wraps `fetch('/api/channels')` and the ws `channels-updated` digests. */
const IM_DOCTOR = `(() => {
  const doctor = (d) => {
    if (!d || !Array.isArray(d.adapters)) return d;
    for (const a of d.adapters) {
      if (!a || !a.connectable || a.id === 'lark:2') continue;
      a.enabled = true;
      a.auth = Object.assign({}, a.auth || {}, { state: 'connected', expiresAt: null, renews: a.kind === 'lark', why: null });
      a.lane = { via: 'poll', why: null, live: false, carryContent: false };
      a.lastPass = { ok: true, at: Date.now() - 95e3 }; a.lastOkAt = Date.now() - 95e3; a.consecutiveFailures = 0;
      a.scheduler = Object.assign({ conversations: a.kind === 'lark' ? 3 : 2, unread: a.kind === 'lark' ? 5 : 2 }, a.scheduler || {}, { firstIngest: null });
    }
    return d;
  };
  window.__imDoctor = doctor;
  const of = window.fetch;
  window.fetch = async function (u, init, ...rest) {
    const r = await of.call(this, u, init, ...rest);
    try { const url = new URL(String(u && u.url ? u.url : u), location.href); if (url.pathname === '/api/channels' && (!init || !init.method || init.method === 'GET')) { const j = doctor(await r.clone().json()); return new Response(JSON.stringify(j), { status: r.status, headers: { 'Content-Type': 'application/json' } }); } } catch {}
    return r;
  };
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return desc.get.call(this); }, set(fn) {
    desc.set.call(this, typeof fn !== 'function' ? fn : function (e) {
      try { if (typeof e.data === 'string' && e.data.indexOf('channels-updated') >= 0) { const m = JSON.parse(e.data); if (m && m.type === 'channels-updated' && m.digest) { doctor(m.digest); return fn.call(this, { data: JSON.stringify(m) }); } } } catch {}
      return fn.call(this, e);
    });
  } });
})();`;

/** THE IM MEASURER: `groups` = {name: {sel, parts: {part: sel}, whole: [part…], wholeAll: [sel…]}}.
 *  Per matched container: its rect, each part's rect (first match inside it)
 *  and — for the parts that must be WHOLE — whether the text is cut
 *  (scrollWidth past clientWidth, or the part past the container's right edge);
 *  `wholeAll` = every match of a selector inside the container must be whole.
 *  Plus the interactive TARGETS (the phone's ≥ 36 px law) and the avatars'
 *  computed colours. */
const IM_MEASURE = `(function (rootSel, groups) {
  const root = document.querySelector(rootSel);
  if (!root) return { missing: rootSel };
  const R = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
  const vis = (el) => { if (!el) return false; const c = getComputedStyle(el); if (c.display === 'none' || c.visibility === 'hidden') return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  // CUT = its own text overflows, OR it runs past its container, OR past any CLIPPING ancestor inside it
  // (a tag's words clipped by the tag's overflow: hidden)
  const cutOf = (el, box, stop) => {
    const b = el.getBoundingClientRect();
    if (el.scrollWidth > el.clientWidth + 0.5 || (box && b.right > box.right + 0.5)) return true;
    for (let a = el.parentElement; a && a !== stop; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== 'visible' || cs.overflow !== 'visible') { const ab = a.getBoundingClientRect(); if (b.right > ab.right + 0.5 || b.left < ab.left - 0.5) return true; } }
    return false;
  };
  const out = { groups: [], targets: [], avatars: [], hscroll: [] };
  const rootBox = root.getBoundingClientRect();
  for (const [name, g] of Object.entries(groups)) {
    const list = [...root.querySelectorAll(g.sel)].filter(vis).filter((el) => { const b = el.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; });
    list.slice(0, 40).forEach((el, idx) => {
      const box = el.getBoundingClientRect();
      const parts = {};
      for (const [pn, ps] of Object.entries(g.parts || {})) {
        const p = el.querySelector(ps);
        if (!vis(p)) continue;
        parts[pn] = { r: R(p), cut: (g.whole || []).includes(pn) ? cutOf(p, box, el) : false, text: (p.textContent || '').trim().slice(0, 60) };
      }
      const whole = [];
      for (const ws of g.wholeAll || []) for (const w of el.querySelectorAll(ws)) if (vis(w)) whole.push({ sel: ws, text: (w.textContent || '').trim().slice(0, 60), cut: cutOf(w, box, el), r: R(w), sw: w.scrollWidth, cw: w.clientWidth, pr: R(w.parentElement) });
      out.groups.push({ name, idx, r: R(el), key: el.dataset.grow || el.dataset.vid || el.dataset.conv || el.dataset.adapter || '', cls: String(el.className || ''), parts, whole });
    });
  }
  const T = 'button, a[href]:not(.chanblk-a), [role="button"], [role="option"], [tabindex="0"], select, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), label.chan-radio-row';
  for (const el of root.querySelectorAll(T)) {
    if (!vis(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth) continue;
    const text = (el.textContent || '').trim();
    out.targets.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 80), text: text.slice(0, 40), iconOnly: !text, r: R(el) });
  }
  for (const el of root.querySelectorAll('.chan-av')) {
    if (!vis(el)) continue;
    const c = getComputedStyle(el);
    out.avatars.push({ text: el.textContent, hue: el.dataset.hue || null, self: el.classList.contains('chan-av-self'), color: c.color, background: c.backgroundColor, r: R(el), ariaHidden: el.getAttribute('aria-hidden') });
  }
  for (const el of root.querySelectorAll('.chanwin-list, .chan-groups, .chan-list')) if (vis(el)) out.hscroll.push({ cls: String(el.className), over: el.scrollWidth > el.clientWidth + 1 });
  out.root = R(root); out.viewport = [innerWidth, innerHeight];
  out.face = getComputedStyle(document.body).fontFamily;
  return out;
})`;
const IM_PANEL_GROUPS = {
  grow: { sel: '.chan-groups > .chan-grow', parts: { av: '.chan-av', icon: '.chan-grow-ic', title: '.chan-grow-title', at: '.chan-grow-at', tag: '.chan-grow-tag', src: '.chan-src-chip', last: '.chan-grow-last', unread: '.chan-grow-unread' }, whole: ['at', 'unread'], wholeAll: ['.chan-tag-words'] },
  bar: { sel: '.chan-find', parts: { input: '.chan-find-input', newgroup: '.chan-newgroup-btn', outbox: '.chan-outbox-btn' } },
  seg: { sel: '.chan-bar', parts: { focus: '.chan-view-btn[data-view="focus"]', all: '.chan-view-btn[data-view="all"]' } },
  head: { sel: '.chan-account > .chan-sec-head', parts: { chev: '.chan-sec-chev', kind: '.chan-sec-kind', name: '.chan-sec-name', chip: '.chan-cred-chip', dot: '.chan-dot', count: '.chan-sec-count', edit: '.chan-sec-edit', more: '.chan-sec-more' }, whole: ['count'] },
  health: { sel: '.chan-account > .chan-sec-health', parts: { tag: '.mounts-typetag', text: '.chan-sec-health-text' }, whole: ['tag'] },
  row: { sel: '.chan-account .chan-row', parts: { arrow: '.mounts-child-arrow', title: '.chan-row-title', chip: '.chan-row-line .chan-chip', who: '.chan-row-who', unread: '.chan-unread', awaiting: '.chan-awaiting' }, whole: ['chip', 'unread'] },
};
const IM_WIN_GROUPS = {
  titlerow: { sel: '.chanwin-title-row', parts: { av: '.chan-av', title: ':scope > b, .chanwin-title', chip: '.chan-assign-chip', more: '.icon-btn' } },
  bar: { sel: '.chanwin-bar', parts: { titlerow: '.chanwin-title-row', meta: '.chanwin-meta', chip: ':scope > .chan-assign-chip' } },
  msg: { sel: '.chanwin-list > .chanmsg', parts: { av: '.chan-av', name: '.chanmsg-head b', at: '.chanmsg-head .chanmsg-at', hover: '.chanmsg-at-hover', body: '.chanmsg-body', atts: '.chanmsg-atts' }, whole: ['at', 'hover'] },
  day: { sel: '.chanwin-list > .chanmsg-day', parts: { label: '.chanmsg-day-label' }, whole: ['label'] },
  fold: { sel: '.chanblk-fold-row', parts: { toggle: '.chanblk-fold', attribution: '.chanblk-attribution' }, whole: ['toggle'] },
  file: { sel: 'a.chanmsg-att', parts: { icon: '.chan-ic', name: '.chanmsg-att-name', size: '.chanmsg-att-size' }, whole: ['size'] },
  card: { sel: '.chanblk-card', parts: { title: '.chanblk-card-title', line: '.chanblk-card-line' } },
  composer: { sel: '.chanwin-composer-row', parts: { note: '.chanwin-note-text', info: '.chanwin-note-info', send: '.mounts-btn' }, whole: ['send'] },
  readonly: { sel: '.chanwin-readonly', parts: { text: ':scope > span', btn: '.mounts-btn' }, whole: ['btn'] },
};

// B-f467: the Outbox window — its rows (the channel list's grammar), the state heads, the toolbar, an opened card's head + actions
const IM_OUTBOX_GROUPS = {
  orow: { sel: '.chan-outbox-list > .chan-orow', parts: { av: ':scope > .chan-av', title: '.chan-orow-title', acct: '.chan-orow-acct', at: '.chan-orow-at', chev: '.chan-orow-chev', pill: '.chan-prop-state', text: '.chan-orow-text', act: '.chan-orow-act .mounts-btn' }, whole: ['at', 'pill', 'act'] },
  sec: { sel: '.chan-outbox-list > .chan-outbox-sec', parts: { dot: '.chan-dot', words: ':scope > span:last-child' }, whole: ['words'] },
  bar: { sel: '.chan-outbox > .jobs-toolbar', parts: { summary: '.jobs-summary', seg: '.chan-seg' } },
  cardhead: { sel: '.chan-outbox-list > .chan-prop > .chan-prop-head', parts: { state: '.chan-prop-state', who: '.chan-prop-who', when: '.chan-prop-when' }, whole: ['state', 'when'] },
  cardact: { sel: '.chan-outbox-list > .chan-prop > .chan-prop-actions', parts: { a: ':scope > :nth-child(1)', b: ':scope > :nth-child(2)', c: ':scope > :nth-child(3)' }, whole: ['a', 'b', 'c'] },
};

// the two plain-words dialogs (channel-polish): Grant access… and Notify… — their rows, radios, chips, picker rows
const IM_DLG_GROUPS = {
  header: { sel: '.dialog-header', parts: { title: 'h3', close: '.dialog-close, button' } },
  access: { sel: '.chan-access-row', parts: { who: '.chan-access-who', auth: '.chan-access-auth', rm: '.chan-af-rm' } },
  // `input[type=radio]` (verify round 2): the cap's own line is a `.chan-radio-row` WITHOUT a radio — a bare `input` read its number field as the radio, overlapping itself
  radio: { sel: 'label.chan-radio-row', parts: { input: 'input[type=radio]', words: '.chan-radio-words', field: '.chan-radio-field' } },
  chip: { sel: '.pp-chip', parts: { av: '.chan-av', name: '.pp-chip-name', x: '.pp-chip-x' }, whole: ['x'] },
  option: { sel: '.pp-row', parts: { check: '.pp-check', av: '.pp-av, .pp-backend', name: '.pp-name', folder: '.pp-folder', live: '.pp-live', tg: '.pp-tg', hint: '.pp-hint' } },
  watch: { sel: '.chan-watch-head', parts: { who: '.pp-trigger', rm: '.chan-af-rm' } },
  preview: { sel: '.chan-watch-row', parts: { preview: '.chan-notify-preview', est: '.chan-af-stat' } },
  actions: { sel: '.chan-flow-actions', parts: { a: 'button:nth-of-type(1)', b: 'button:nth-of-type(2)', c: 'button:nth-of-type(3)', d: 'button:nth-of-type(4)' }, whole: ['a', 'b', 'c', 'd'] },
};

async function imCapture(page, tag, name, rootSel, groups, { pad = 0, clipSel = rootSel } = {}) {
  if (ONLY && !name.includes(ONLY)) return null;
  await page.evaljs(`(() => { const s = document.getElementById('global-toasts'); if (s) s.textContent = ''; return 1; })()`);
  await sleep(150);
  const c = await page.evaljs(`(() => { const el = document.querySelector(${JSON.stringify(clipSel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: Math.min(b.width, innerWidth - Math.max(0, b.x)), height: Math.min(b.height, innerHeight - Math.max(0, b.y)) }; })()`);
  const clip = c ? { x: c.x - pad, y: c.y - pad, width: c.width + pad * 2, height: c.height + pad * 2 } : null;
  const file = path.join(OUT, `${tag}-${name}`);
  await page.shot(file + '.png', clip);
  const m = await page.evaljs(`${MEASURE}(${JSON.stringify(rootSel)}, ${PROBES})`);
  const im = await page.evaljs(`${IM_MEASURE}(${JSON.stringify(rootSel)}, ${JSON.stringify(groups)})`);
  fs.writeFileSync(file + '.json', JSON.stringify({ name, tag, rootSel, clip, ...(m || {}), im }, null, 1));
  manifest.push({ tag, name, file: path.basename(file) + '.png', missing: m && m.missing, rect: m && m.rect, im: true });
  log(tag, name, m && m.missing ? 'MISSING ' + m.missing : `${m.rect.w}×${m.rect.h} · ${im && im.groups ? im.groups.length : 0} groups · ${im && im.targets ? im.targets.length : 0} targets`);
  return im;
}

async function imPass({ lang, viewport, theme }) {
  const mobile = viewport === 'mobile';
  const tag = `im-${lang}-${viewport}-${theme}`;
  log(`=== IM PASS ${tag}${FACE ? ` [${FACE}]` : ''} ===`);
  if (srv) { srv.kill('SIGKILL'); await waitDown(); srv = null; }
  resetData();
  await seedIm();
  srv = bootServer(); if (!(await waitServer())) throw new Error('server did not boot (IM)');
  const page = await newPage(mobile ? { width: 375, height: 667, mobile: true } : { width: 1200, height: 800, mobile: false });
  await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: IM_DOCTOR });
  if (FACE) await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = "html, body { font-family: '${FACE}', sans-serif !important; }"; document.head.appendChild(st); });` });
  await page.prime({ lang, theme, sidebarWidth: 260 });
  if (!(await page.load())) throw new Error('app did not load (IM)');
  await waitFor(page, `(() => { const s = document.getElementById('loading-screen'); return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; })()`, 40);
  // THE ATTENTION LIST's rows: one conversation handed to an agent, one mail thread to another,
  // an agent's draft awaiting approval (the fake poll adapter)
  for (let i = 0; i < 80; i++) { const d = (await api('GET', '/api/channels')).json; if (d && (d.conversations || []).some((x) => x.id === 'oc_launch') && (d.conversations || []).some((x) => x.id === 'fake-poll-ops')) break; await sleep(250); }
  for (const [a, c, who] of [['lark', 'oc_launch', { kind: 'agent', id: 'cid-scout', name: 'Scout' }], ['gmail', 't_q', { kind: 'agent', id: 'cid-relay', name: 'Relay' }]]) {
    const r = await api('PUT', `/api/channels/${encodeURIComponent(a)}/${encodeURIComponent(c)}/assignment`, { assignment: { principal: who, mode: 'all', notify: 'digest', digestMinutes: 60 } });
    if (r.status !== 200) log('IM assignment', a, c, 'HTTP', r.status, r.text.slice(0, 160));
  }
  // (from the PAGE, as the classic pass's PROPOSE does — the owner's own request)
  { const r = await page.evaljs(`fetch('/api/channels/fake-poll/fake-poll-ops/propose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Could someone look at the staging box before 3pm?' }) }).then((x) => x.status)`);
    if (r !== 200) log('IM propose', 'HTTP', r); }
  // B-f467: a second draft whose first line is long (the Outbox row clips it with an ellipsis, never its time / pill / button)
  { const r = await page.evaljs(`fetch('/api/channels/fake-poll/fake-poll-ops/propose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Status for everyone following the launch: the staging box was rebuilt overnight, the checklist is green except the smoke test, and the release notes are drafted.\\nDetails below.' }) }).then((x) => x.status)`);
    if (r !== 200) log('IM propose 2', 'HTTP', r); }
  await sleep(1500);
  if (!mobile) {
    await openPanel(page);
    await waitFor(page, `document.querySelectorAll('.rail-panel-channels .chan-groups > .chan-grow').length >= 3`, 60);
    await sleep(500);
    for (const w of [260, 200, 340, 500]) {
      await page.evaljs(`(() => { const sb = window.app.sidebar; sb._resizer._setSize(${w}); sb._applySidebarLayoutWidth(${w}); return 1; })()`);
      await sleep(400);
      await page.evaljs(`(() => { for (let n = document.querySelector('.rail-panel-channels .chan-bar'); n; n = n.parentElement) n.scrollTop = 0; return 1; })()`);
      await imCapture(page, tag, `list-focus-${w}`, '#sidebar', IM_PANEL_GROUPS);
    }
    await page.evaljs(`(() => { const sb = window.app.sidebar; sb._resizer._setSize(260); sb._applySidebarLayoutWidth(260); return 1; })()`);
    await sleep(300);
    await page.evaljs(`(() => { const b = document.querySelector('.rail-panel-channels .chan-view-btn[data-view="all"]'); if (b) b.click(); return !!b; })()`);
    await sleep(300);
    await imCapture(page, tag, 'list-all-260', '#sidebar', IM_PANEL_GROUPS);
    await page.evaljs(`(() => { const b = document.querySelector('.rail-panel-channels .chan-view-btn[data-view="focus"]'); if (b) b.click(); return !!b; })()`);
    for (const w of [260, 340]) {
      await page.evaljs(`(() => { const sb = window.app.sidebar; sb._resizer._setSize(${w}); sb._applySidebarLayoutWidth(${w}); return 1; })()`);
      await sleep(400);
      await waitFor(page, `!!document.querySelector('.rail-panel-channels .chan-account[data-adapter="lark"] .chan-sec-health')`, 40);
      await page.evaljs(`(() => { const el = document.querySelector('.rail-panel-channels .chan-account[data-adapter="lark"]'); if (el) el.scrollIntoView({ block: 'start' }); return !!el; })()`);
      await sleep(300);
      await imCapture(page, tag, `accounts-${w}`, '#sidebar', IM_PANEL_GROUPS);
    }
    await page.evaljs(`(() => { const sb = window.app.sidebar; sb._resizer._setSize(260); sb._applySidebarLayoutWidth(260); return 1; })()`);
    await sleep(300);
  } else {
    await page.evaljs(`(() => { const w = window.app.openChannels({ forceWindow: true }); return !!w; })()`);
    await waitFor(page, `document.querySelectorAll('.chan-window .chan-groups > .chan-grow').length >= 3`, 60);
    await sleep(500);
    await imCapture(page, tag, 'm-list-focus', '.chan-window', IM_PANEL_GROUPS, { clipSel: 'body' });
    await page.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter((x) => x.type === 'channels')) window.app.wm.closeWindow(w.id); return 1; })()`);
  }
  // ── THE WINDOWS ──
  const winShot = async (adapterId, convId, name, ready, { size = null, before = null } = {}) => {
    await page.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()].filter((x) => x.type === 'channel')) window.app.wm.closeWindow(w.id); const w = window.app.openChannel(${JSON.stringify(adapterId)}, ${JSON.stringify(convId)}); for (const e of document.querySelectorAll('[data-shot="win"]')) delete e.dataset.shot; w.element.dataset.shot = 'win'; ${size && !mobile ? `window.app.wm.focusWindow(w.id); w.element.style.left = '300px'; w.element.style.top = '20px'; w.element.style.width = '${size[0]}px'; w.element.style.height = '${size[1]}px';` : ''} return w.id; })()`);
    const okReady = await waitFor(page, `(() => { const w = [...window.app.wm.windows.values()].find((x) => x.element && x.element.dataset.shot === 'win'); return !!(w && w.content.querySelector('.chanmsg') && (${ready})); })()`, 60);
    if (!okReady) log(tag, name, 'window not ready');
    await sleep(700);
    await page.evaljs(`(() => { const l = document.querySelector('[data-shot="win"] .chanwin-list'); if (l) l.scrollTop = l.scrollHeight; return 1; })()`);
    await sleep(200);
    if (before) await before();
    return imCapture(page, tag, name, '[data-shot="win"]', IM_WIN_GROUPS);
  };
  const hoverCont = async () => {
    await page.evaljs(`(() => { const r = [...document.querySelectorAll('[data-shot="win"] .chanmsg.chanmsg-cont')].pop(); if (r) r.scrollIntoView({ block: 'center' }); return !!r; })()`);
    await sleep(250);
    const pt = await page.evaljs(`(() => { const r = [...document.querySelectorAll('[data-shot="win"] .chanmsg.chanmsg-cont')].pop(); if (!r) return null; const b = r.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + Math.min(10, b.height / 2)) }; })()`);
    if (pt) { await page.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y }); await sleep(300); }
  };
  const toTop = async () => { await page.evaljs(`(() => { const l = document.querySelector('[data-shot="win"] .chanwin-list'); if (l) l.scrollTop = 0; return 1; })()`); await sleep(250); };
  const W1 = mobile ? null : [560, 700];
  await winShot('lark', 'oc_launch', `${mobile ? 'm-' : ''}win-lark`, "w.content.querySelector('img.chanmsg-thumb') && w.content.querySelector('img.chanmsg-thumb').complete && w.content.querySelector('.chanblk-card')", { size: W1 });
  await winShot('lark', 'oc_launch', `${mobile ? 'm-' : ''}win-lark-top`, "w.content.querySelector('.chanmsg-day')", { size: W1, before: toTop });
  await winShot('lark', 'oc_launch', `${mobile ? 'm-' : ''}win-lark-hover`, "w.content.querySelector('.chanmsg-cont')", { size: W1, before: hoverCont });
  await page.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
  await winShot('gmail', 't_q', `${mobile ? 'm-' : ''}win-gmail`, "w.content.querySelector('.chanblk-quote') && w.content.querySelector('.chanwin-readonly')", { size: W1 });
  await winShot('gmail', 't_q', `${mobile ? 'm-' : ''}win-gmail-open`, "w.content.querySelector('.chanblk-quote')", { size: W1, before: async () => { await page.evaljs(`(() => { const t = document.querySelector('[data-shot="win"] .chanblk-quote .chanblk-fold'); if (t) t.click(); return !!t; })()`); await sleep(250); } });
  await winShot('lark:2', 'oc_ro', `${mobile ? 'm-' : ''}win-readonly`, "w.content.querySelector('.chanwin-readonly')", { size: mobile ? null : [520, 420] });
  // ── THE TWO PLAIN-WORDS DIALOGS (channel-polish): Grant access… (the picker, the authority radios) and
  //    Notify… (three questions, the preview) on the poll room — a Task Group through the real store, six live
  //    sessions as a page-side roster (the picker's rows) ──
  { const r = await api('POST', '/api/tasks', { title: 'Ops triage', folders: ['/work/ops'] }); if (r.status !== 200) log('IM task group', 'HTTP', r.status, r.text.slice(0, 120)); }
  await waitFor(page, `(window.app.sidebar._tasks || []).some((g) => g.title === 'Ops triage')`, 40);
  await page.evaljs(`(() => { const s = []; for (const [n, cwd, b] of [['pager-01', '/work/ops/pager', 'claude'], ['pager-02', '/work/ops/pager', 'codex'], ['web-ui', '/work/web/app', 'claude'], ['invoice-sync', '/work/billing/inv', 'claude'], ['release notes', '/work/ops/rel', 'codex'], ['scratch', '/tmp/scratch', 'claude']]) s.push({ id: 'w-' + n, name: n, cwd, backend: b, backendSessionId: 'cid-' + n.replace(/\\s/g, '-'), claudeSessionId: 'cid-' + n.replace(/\\s/g, '-') }); Object.defineProperty(window.app.sidebar, '_webuiSessions', { configurable: true, get: () => s, set: () => {} }); return s.length; })()`);
  const dlgWin = async () => {
    await page.evaljs(`(() => { for (const o of document.querySelectorAll('.dialog-overlay')) o.remove(); for (const w of [...window.app.wm.windows.values()].filter((x) => x.type === 'channel')) window.app.wm.closeWindow(w.id); const w = window.app.openChannel('fake-poll', 'fake-poll-ops'); for (const e of document.querySelectorAll('[data-shot="win"]')) delete e.dataset.shot; w.element.dataset.shot = 'win'; return w.id; })()`);
    await waitFor(page, `(() => { const w = [...window.app.wm.windows.values()].find((x) => x.element && x.element.dataset.shot === 'win'); return !!(w && w.content.querySelector('[data-channel-assign]')); })()`, 60);
    await page.evaljs(`(() => { const w = [...window.app.wm.windows.values()].find((x) => x.element && x.element.dataset.shot === 'win'); w.content.querySelector('[data-channel-assign]').click(); return 1; })()`);
  };
  await dlgWin();
  if (await waitFor(page, `!!document.querySelector('#chan-access-dialog .pp-input')`, 40)) {
    await sleep(250);
    await page.evaljs(`(() => { const b = document.querySelector('#chan-access-dialog .pp-input'); b.focus(); b.value = 'Ops'; b.dispatchEvent(new Event('input')); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); b.value = 'pager'; b.dispatchEvent(new Event('input')); return 1; })()`);
    await waitFor(page, `!!document.querySelector('#chan-access-dialog .chan-access-row')`, 20);
    await sleep(250);
    await imCapture(page, tag, `${mobile ? 'm-' : ''}dlg-access`, '#chan-access-dialog .dialog', IM_DLG_GROUPS);
    await page.evaljs(`(() => { const b = document.querySelector('#chan-access-dialog .pp-input'); b.value = ''; b.dispatchEvent(new Event('input')); const d = document.getElementById('chan-access-dialog'); const save = d.querySelector('.chan-flow-actions .mounts-btn-primary'); if (save) save.click(); return !!save; })()`);
    await waitFor(page, `!document.querySelector('#chan-access-dialog')`, 30);
    await sleep(600);
    await dlgWin();
    if (await waitFor(page, `!!document.querySelector('#chan-notify-dialog .chan-watch-row .chan-notify-preview')`, 40)) {
      await sleep(500);
      await imCapture(page, tag, `${mobile ? 'm-' : ''}dlg-notify`, '#chan-notify-dialog .dialog', IM_DLG_GROUPS);
      await page.evaljs(`(() => { const d = document.getElementById('chan-notify-dialog'); d.querySelector('.chan-watch-row input[type=radio][value=rule]').click(); const add = d.querySelector('.chan-watch-row .chan-af-rules .chan-af-add'); if (add) add.click(); const i = d.querySelector('.chan-af-rule input'); if (i) { i.value = 'deploy'; i.dispatchEvent(new Event('input')); } d.querySelector('.chan-watch-row input[type=radio][value=digest]').click(); return 1; })()`);
      await sleep(600);
      await imCapture(page, tag, `${mobile ? 'm-' : ''}dlg-notify-rule`, '#chan-notify-dialog .dialog', IM_DLG_GROUPS);
    } else log(tag, 'the Notify dialog did not open');
  } else log(tag, 'the Grant access dialog did not open');
  await page.evaljs(`(() => { for (const o of document.querySelectorAll('.dialog-overlay')) o.remove(); return 1; })()`);
  // ── B-f467: THE OUTBOX — one row per proposal, then the All view with the first row opened (its full card under it) ──
  await page.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()]) window.app.wm.closeWindow(w.id); const w = window.app.openChannelOutbox(); for (const e of document.querySelectorAll('[data-shot="win"]')) delete e.dataset.shot; w.element.dataset.shot = 'win'; return w.id; })()`);
  if (!(await waitFor(page, `document.querySelectorAll('[data-shot="win"] .chan-outbox-list > .chan-orow').length >= 2`, 40))) log(tag, 'outbox rows not ready');
  await sleep(400);
  await imCapture(page, tag, `${mobile ? 'm-' : ''}outbox-rows`, '[data-shot="win"]', IM_OUTBOX_GROUPS);
  await page.evaljs(`(() => { const b = document.querySelector('[data-shot="win"] .chan-seg [data-view="all"]'); if (b) b.click(); const r = document.querySelector('[data-shot="win"] .chan-outbox-list > .chan-orow'); if (r) r.click(); return !!r; })()`);
  await sleep(500);
  await imCapture(page, tag, `${mobile ? 'm-' : ''}outbox-open`, '[data-shot="win"]', IM_OUTBOX_GROUPS);
  await page.evaljs(`(() => { for (const w of [...window.app.wm.windows.values()]) window.app.wm.closeWindow(w.id); return 1; })()`);
  page.close();
}

const runs = [];
for (const theme of THEMES) for (const lang of LANGS) for (const viewport of VIEWPORTS) {
  if (theme !== 'dark' && !LIGHT_LANGS.includes(lang)) continue;
  runs.push({ lang, viewport, theme });
}
if (IM !== 'only') for (const r of runs) {
  const tag = `${r.lang}-${r.viewport}-${r.theme}`;
  try { await pass(r); }
  catch (e) { log(`PASS ${tag} FAILED:`, e.message); manifest.push({ tag, name: 'PASS-FAILED', error: e.message }); }
  if (r.lang !== 'en') log(tag, 'latin-only strings on screen:', latinLeaks(tag));
}
if (IM) for (const r of runs) {
  const tag = `im-${r.lang}-${r.viewport}-${r.theme}`;
  try { await imPass(r); }
  catch (e) { log(`IM PASS ${tag} FAILED:`, e.message); manifest.push({ tag, name: 'PASS-FAILED', error: e.message }); }
  if (r.lang !== 'en') log(tag, 'latin-only strings on screen:', latinLeaks(tag));
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ at: new Date().toISOString(), runs, shots: manifest }, null, 1));
log(`${manifest.length} shots → ${OUT}`);
process.exit(0);
