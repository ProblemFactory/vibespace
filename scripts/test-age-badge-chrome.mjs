#!/usr/bin/env node
// A RING'S AGE BADGE IS ONE LINE AND NEVER OVER ITS RING'S LABEL (K3 badge cure, .401 — 主开发 21:57Z after the K3 look: in zh / ja
// the roster donut's badge read «47小 / 时» on two lines over the ring's «Fa», and the taskbar pie's stacked «47 / 小 / 时» over its ring).
// HEAVY (a browser). The REAL renderers, bundled by esbuild: the taskbar row by usage-meter `_renderUsage` (the cap ring of a reading
// with no 5h window — the 7d ring and the model cap, test-usage-two-rings' shape) and the roster cell by manage-agents
// `_acctUsageHtml`, over a reading whose model cap was read 47 h before its siblings (the widest value staleLaneAge draws in hours:
// 48 h is «2d»), in en, zh AND ja, at each row's narrowest: the taskbar at a 769 px page (at 768 and below the phone layout hides
// it — the phone's chip is one donut with no badge), the roster in a 341 px list (at 340 and below its container query draws ONE
// pill, no donut) at a 769 px page and at a 390 px phone page; in this box's face AND in the hosted runner's (DejaVu Sans first,
// by the FONTCONFIG_FILE of SharedContext/vibespace-actions-runner-repro.md).
// MEASURED, never a rule's presence: each badge's box is ONE line high (its height against its own line-height + border), and it
// crosses neither its own ring's label box nor the neighbouring ring's.
// RED CONTROL (self-contained — no repository history read): the same page with the shipped rule (`top: -5px`, no nowrap) and the
// full words in the taskbar badge, as 4d63ec1b4 drew it — it must be RED in zh / ja.
// PNGs → $K3_PNG_DIR or the scratch dir: {box,runner}/{after,before}-{lang}-{roster,taskbar}.png
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!CHROME) { console.log('SKIP: no chrome binary on this machine'); process.exit(0); }
const WS = require(path.join(REPO, 'node_modules/ws'));
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-agebadge-'));
const PNG = process.env.K3_PNG_DIR || dir;
const CSS = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
// the cure as the tree has it, and the shipped rule it replaced (the control's text — written here, never read from history)
const CURE = /\.usage-age-badge, \.acct-donut-age \{ position: absolute; right: -7px;([^}]*)white-space: nowrap; \}\n(?:\/\*[\s\S]*?\*\/\n)?\.acct-donut-age \{ top: -7px; \}\n\.usage-age-badge \{ top: -9px; \}/;
const SHIPPED = '.usage-age-badge, .acct-donut-age { position: absolute; top: -5px; right: -7px; font-size: 8px; line-height: 10px; padding: 0 2px; border-radius: var(--radius-sm); background: var(--bg-input); color: var(--yellow); border: 1px solid currentColor; pointer-events: none; }';
const MARK = '${escHtml(c.staleMark || c.staleAge)}';
let chromes = [], srv = null;
try {
  ok(CURE.test(CSS), 'the tree carries the cure: one line (nowrap), each badge placed clear of its ring\'s label');
  const UM_SRC = fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8');
  ok(UM_SRC.includes(MARK), 'the taskbar badge draws the compact mark (its words stay in the tooltip)');
  const stub = { name: 'stub', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'bv', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
  const fullWords = { name: 'full-words', setup(b) { b.onLoad({ filter: /usage-meter\.js$/ }, (a) => ({ contents: fs.readFileSync(a.path, 'utf8').replace(MARK, '${escHtml(c.staleAge)}'), loader: 'js' })); } };
  const entry = `import { installUsageMeter } from './usage-meter.js';
import { installManageAgents } from './manage-agents.js';
const now = Date.now(), H = 3600e3, D = 24 * H, nowS = Math.floor(now / 1000);
// the K3 reading: no 5h window (the taskbar's cap ring), its model cap read 47 h before its siblings
const u = { fetchedAt: now - 60e3, fiveHourAbsent: now - 6 * D, sevenDay: { utilization: 0.37, resetsAt: nowS + 3 * 86400 }, scopedWeekly: [{ name: 'Fable', utilization: 0.42, resetsAt: nowS + 2 * 86400 }], scopedFetchedAt: now - 47 * H - 5 * 60e3 };
class AppU { } installUsageMeter(AppU, {}); const um = new AppU();
um.settings = { get: () => undefined };
um._accounts = { accounts: [{ id: 'sub-a', backend: 'claude', type: 'subscription', name: 'Work Max' }], defaultAccountId: 'sub-a' };
um._accountUsage = { 'sub-a': u }; um._codexAccountUsage = {}; um._usageEstimates = {};
class AppM { } installManageAgents(AppM, {}); const ma = new AppM(); ma.settings = { get: () => undefined };
window.draw = () => { um._renderUsage(); document.querySelector('#rcell').innerHTML = ma._acctUsageHtml(u, null); return true; };
window.ready = true;`;
  const bundle = async (out, plugins) => esbuild.build({ stdin: { contents: entry, resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'badge-entry.js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: path.join(dir, 'www', out), logLevel: 'silent', loader: { '.css': 'text' }, plugins });
  await bundle('after.js', [stub]);
  await bundle('before.js', [stub, fullWords]);
  const html = (js, css, lang) => `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="/${css}"><style>body{background:var(--bg-window);padding:16px;margin:0}</style></head><body>
<footer id="taskbar"><div id="taskbar-items"></div><div id="taskbar-tray"><div id="taskbar-usage" class="taskbar-usage"></div></div></footer><div id="usage-popup" class="usage-popup hidden"></div>
<div style="height:24px"></div><div class="acct-list" style="width:341px;background:var(--bg-dialog)"><div class="acct-key-row" id="rrow"><div class="acct-key-line"><span class="acct-key-name">Work Max</span></div><span class="acct-usage-cell" id="rcell"></span></div></div>
<script>localStorage.setItem("vibespace.lang", ${JSON.stringify(lang)})</` + `script><script src="/${js}"></` + `script></body></html>`;
  fs.writeFileSync(path.join(dir, 'www/after.css'), CSS);
  fs.writeFileSync(path.join(dir, 'www/before.css'), CSS.replace(CURE, SHIPPED));
  ok(fs.readFileSync(path.join(dir, 'www/before.css'), 'utf8').includes(SHIPPED) && !CURE.test(fs.readFileSync(path.join(dir, 'www/before.css'), 'utf8')), 'the control serves the shipped rule (top −5 px, no nowrap) in the cure\'s place');
  srv = http.createServer((q, r) => { const u = new URL(q.url, 'http://x'); const m = /^\/page\/(after|before)\/(en|zh|ja)$/.exec(u.pathname);
    if (m) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html(m[1] + '.js', m[1] + '.css', m[2])); return; }
    const f = path.join(dir, 'www', path.basename(u.pathname)); if (fs.existsSync(f)) { r.writeHead(200, { 'content-type': f.endsWith('.css') ? 'text/css' : 'text/javascript' }); r.end(fs.readFileSync(f)); return; }
    r.writeHead(404); r.end(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const launch = async (face) => {
    const home = path.join(dir, 'home-' + face); fs.mkdirSync(home, { recursive: true });
    const env = { ...process.env, HOME: home }; delete env.DISPLAY; delete env.WAYLAND_DISPLAY; delete env.DBUS_SESSION_BUS_ADDRESS;
    if (face === 'runner') { // the hosted runner's face: dejavu + liberation + opentype/noto (+ emoji) — runner-repro's FONTCONFIG_FILE
      const emoji = path.join(home, 'emoji'); fs.mkdirSync(emoji); try { fs.symlinkSync('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', path.join(emoji, 'NotoColorEmoji.ttf')); } catch { }
      const fc = path.join(home, 'fonts.conf'); fs.writeFileSync(fc, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/usr/share/fonts/truetype/dejavu</dir><dir>/usr/share/fonts/truetype/liberation</dir><dir>/usr/share/fonts/opentype/noto</dir><dir>${emoji}</dir><cachedir>${path.join(home, 'fc')}</cachedir><include ignore_missing="yes">/etc/fonts/conf.d</include></fontconfig>`);
      env.FONTCONFIG_FILE = fc;
    }
    const port = await freePort();
    const c = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--no-first-run', '--disable-gpu', '--password-store=basic', '--user-data-dir=' + path.join(home, 'p'), 'about:blank'], { stdio: 'ignore', env });
    chromes.push(c);
    let tgt = null; for (let i = 0; i < 80 && !tgt; i++) { try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch { await sleep(200); } }
    if (!tgt) throw new Error('chrome (' + face + ') never came up');
    const sock = new WS(tgt.webSocketDebuggerUrl); await new Promise((r, j) => { sock.on('open', r); sock.on('error', j); });
    let seq = 0; const pend = new Map(), errors = [];
    sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.exception?.description || 'exception'); });
    const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); });
    const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'threw'); return r.result.value; };
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });   // §47 (a bare page here — no wizard — but the shared idiom)
    const view = (width) => cdp('Emulation.setDeviceMetricsOverride', { width, height: 400, deviceScaleFactor: 2, mobile: false });
    await view(769);
    return { cdp, ev, view, errors, close: () => sock.close() };
  };
  // one look: each badge on the page — its lines, and whether it crosses its own ring's label or the neighbouring ring's
  const MEASURE = `(() => { const R = (e) => e.getBoundingClientRect(); const cross = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const out = [];
    for (const [where, scope, badgeSel, ringSel, labelSel] of [['taskbar', '#taskbar-usage', '.usage-age-badge', '.usage-pie', '.usage-donut-label'], ['roster', '#rcell', '.acct-donut-age', '.acct-usage-donut', '.acct-usage-donut > span']]) {
      const root = document.querySelector(scope), rings = [...root.querySelectorAll(ringSel)];
      for (const b of root.querySelectorAll(badgeSel)) {
        const ring = b.parentElement.querySelector(ringSel), own = b.parentElement.querySelector(labelSel);
        const cs = getComputedStyle(b), lh = parseFloat(cs.lineHeight) || 10, bt = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
        const rb = R(b);
        out.push({ where, text: b.textContent, title: b.title || '', lines: Math.round((rb.height - bt) / lh), overOwn: own ? Math.round(cross(rb, R(own))) : -1, overOther: Math.round(rings.filter((x) => x !== ring).reduce((s, x) => s + cross(rb, R(x)), 0)) });
      } }
    return out; })()`;
  const looks = {};
  for (const face of ['box', 'runner']) {
    const P = await launch(face);
    for (const v of ['after', 'before']) for (const lang of ['en', 'zh', 'ja']) {
      await P.cdp('Page.navigate', { url: `${ORIGIN}/page/${v}/${lang}` });
      for (let i = 0; i < 50; i++) { if (await P.ev('window.ready === true').catch(() => false)) break; await sleep(100); }
      const shoot = async (sel, name) => {
        const r = await P.ev(`(() => { const b = document.querySelector('${sel}').getBoundingClientRect(); return { x: Math.max(0, b.left - 40), y: Math.max(0, b.top - 16), width: b.width + 56, height: b.height + 24 }; })()`);
        const s = await P.cdp('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 3 } }); fs.writeFileSync(path.join(PNG, face, name), Buffer.from(s.data, 'base64'));
      };
      fs.mkdirSync(path.join(PNG, face), { recursive: true });
      await P.view(769); await P.ev('window.draw()'); await sleep(250);
      const wide = await P.ev(MEASURE);
      await shoot('#taskbar-usage', `${v}-${lang}-taskbar.png`);
      await P.view(390); await sleep(250);
      const phone = (await P.ev(MEASURE)).filter((x) => x.where === 'roster').map((x) => ({ ...x, where: 'roster@390' }));
      await shoot('#rrow', `${v}-${lang}-roster.png`);
      await P.view(769);
      looks[`${face}/${v}/${lang}`] = [...wide, ...phone];
    }
    ok(P.errors.length === 0, `${face}: no page exception`, P.errors);
    P.close();
  }
  const fine = (m) => m.length === 3 && ['taskbar', 'roster', 'roster@390'].every((w) => m.some((x) => x.where === w)) && m.every((x) => x.lines === 1 && x.overOwn === 0 && x.overOther === 0);
  for (const face of ['box', 'runner']) for (const lang of ['en', 'zh', 'ja']) {
    const m = looks[`${face}/after/${lang}`];
    ok(fine(m), `${face} face, ${lang}: every badge ONE line, over neither its own ring's label nor a neighbouring ring — ${m.map((x) => `${x.where} «${x.text}» ${x.lines} line(s), own ${x.overOwn} px², other ${x.overOther} px²`).join(' · ')}`, m);
  }
  for (const lang of ['zh', 'ja']) {
    const m = looks[`box/after/${lang}`], tb = m.find((x) => x.where === 'taskbar'), ro = m.find((x) => x.where === 'roster');
    ok(tb && /^47h$/.test(tb.text) && /47(小时|時間)/.test(tb.title) && ro && /^47(小时|時間)$/.test(ro.text), `${lang}: the taskbar's 14 px ring carries the compact mark «${tb && tb.text}» (its tooltip the words «${tb && tb.title}»); the roster's donut keeps «${ro && ro.text}»`, { tb, ro });
  }
  const red = ['zh', 'ja'].filter((lang) => !fine(looks[`box/before/${lang}`]));
  ok(red.length === 2, `RED CONTROL: the shipped rule and full words (4d63ec1b4's drawing) fail the same measure in zh AND ja — ${['zh', 'ja'].map((l) => looks[`box/before/${l}`].map((x) => `${l} ${x.where} «${x.text}» ${x.lines} line(s), own ${x.overOwn} px²`).join(' · ')).join(' · ')}`, red);
} catch (e) { fail++; console.log('  ✗ ' + ((e && e.stack) || e)); }
finally {
  for (const c of chromes) { try { c.kill('SIGKILL'); } catch { } }
  try { srv && srv.close(); } catch { }
  await sleep(200);
  console.log('PNGs: ' + PNG);
  if (!process.env.K3_PNG_DIR) fs.rmSync(dir, { recursive: true, force: true }); else fs.rmSync(path.join(dir, 'www'), { recursive: true, force: true });
}
console.log(`\ntest-age-badge-chrome: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
