#!/usr/bin/env node
// test-fit-390-chrome — HEAVY (B-16ab: lane ui-phone-and-fit's three fit finds at 390 px, from ui-plain-words' pictures of
// 2026-11-13). The REAL modules (an esbuild iife of the tree) and the REAL stylesheets in headless Chrome over a throwaway page
// server, a 390 × 844 phone (touch), zh — in BOTH faces (runFontLegs: the hosted runner's DejaVu Sans through a scratch
// fontconfig, and this box's own), each face read back from Chrome:
//   ① THE DELIVERABLE CARD'S KIND CHIP NEVER WRAPS (src/lib/artifact-card.js renderArtifactCard + public/chat.css): three cards in
//     a phone chat column — a short design, a design with a long title, a page — every kind chip («设计» / «页面») ONE line inside
//     its card; beside the long title the NAME yields (its ellipsis), the short names stay whole. CONTROL: chat.css with the old
//     chip rule (margin-left only) — the long card's chip stands two lines (one character a line)
//   ② THE AGENTS DIALOG'S BODY NEVER RUNS PAST THE DIALOG (public/style.css `.dialog.agents-dialog .agents-dialog-body`): the
//     dialog's own classes (the modal 95vw wide at 390 — the phone's width for every dialog: since ef10f5db9 the four edges' cap,
//     `.dialog-overlay > .dialog { max-width: 100% !important; }`, outranks this dialog's own 92vw; it was 359 px, it is 371 — its
//     head «本机账号与配额 · 全部刷新», its cards) — the body, «全部刷新» and every card inside the dialog's right edge, the head as far
//     off that edge as off the left one, nothing scrolls sideways. CONTROL: the old 380 px floor — the body runs past the dialog's
//     right edge, its right padding cut (in the 371 px dialog the head stands ~4 px off that edge, ~15 off the left; in the 359 px
//     one «全部刷新» itself ran past — the control states what the floor does to the dialog as it is)
//   ③ A POP-UP IS BOUNDED BY THE SCREEN WITH THE USUAL MARGIN (src/lib/utils.js showContextMenu over menu-place.js menuPlace,
//     MENU_PAD): the Agents dialog's «+ 添加账号…» rows opened from a button at x 205 (where the 11-13 picture had it) keep their
//     natural width, every row on one line, 4 px off the screen's right edge; a menu wider than the screen is capped at the
//     screen less its two pads. CONTROL: the helper as it measured before (at the point, squeezed by the edge) — flush on the edge
//   ④ A POPOVER'S WIDTH IS HELD TO THE SCREEN TOO (src/lib/utils.js createPopover — lane bl-phone-ui, the 390 census's first find,
//     主开发 r1198): a popover holding a row that never breaks (~2600 px of words), opened from an anchor at x 205, stands inside
//     the screen 4 px off each edge and its words scroll sideways INSIDE it (never past the screen); a narrow one keeps its
//     anchor's place and gets no style of the helper's; when the wide row is taken out the cap and the scroll are lifted and a
//     max-width the caller wrote is put back; a narrow RIGHT-anchored popover (the ⚙'s shape) gets no style (CONTROL: measured
//     by its fill, as unit 1 measured it, it is capped); at 1280 × 800 a narrow popover keeps the release's place with no
//     style and a wide one is held only past the screen. CONTROL: the helper without the hold — the wide box runs past the edge
// Requires google-chrome (SKIP without) and a built tree. Run: node scripts/test-fit-390-chrome.mjs [--font dejavu|box]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, CHROME_STORE, runFontLegs, runnerFontEnv, drawnFace, CHROME_QUIET } from './scratch.mjs';
import { bringTab, frontState, becameFront } from './cdp-front-shot.mjs';   // r2062: a page BEHIND paints no frame in headless Chrome — page()'s evaluate brings its own page to the front

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const fi = process.argv.indexOf('--font'), FONT = fi > 0 ? process.argv[fi + 1] : null; // one font leg; none = every leg, each a child
if (!FONT) process.exit(runFontLegs(fileURLToPath(import.meta.url)));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new Error('ok(cond, name, extra?)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '\n      ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const express = require(path.join(repo, 'node_modules/express'));
const esbuild = require(path.join(repo, 'node_modules/esbuild'));
const WebSocket = require(path.join(repo, 'node_modules/ws'));
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

// ── the sheets now and as they were (each control's anchor must exist: a vacuous control proves nothing) ──
const STYLE = read('public/style.css'), CHAT = read('public/chat.css'), UTILS_PATH = path.join(repo, 'src/lib/utils.js'), UTILS = fs.readFileSync(UTILS_PATH, 'utf8');
const KIND_NOW = '.chat-artifact-kind { margin-left: auto; font-size: 0.85em; flex: none; white-space: nowrap; }';
const BODY_NOW = '.dialog.agents-dialog .agents-dialog-body { min-width: min(380px, 100%); }';
const ROSTER_NOW = '.dialog.agents-dialog .ob-backend.acct-roster { align-items: stretch; }';
const MEASURE_NOW = "    pop.style.left = (MENU_PAD / Z) + 'px';\n";
const CAP_NOW = "    if (at.maxW != null) pop.style.maxWidth = (at.maxW / Z) + 'px';\n";
// ④'s anchor: createPopover's hold, from its first line to its last (the control takes the whole hold out)
const HOLD_FROM = "    if (pop._heldW) { pop.style.maxWidth = pop._ownMaxW || ''; pop.style.overflowX = pop._ownOverflowX || ''; pop._heldW = false; }", HOLD_TO = "    pop.style.left = at; pop.style.right = atR;\n";
const holdAt = UTILS.indexOf(HOLD_FROM), HOLD_NOW = holdAt >= 0 && UTILS.indexOf(HOLD_TO, holdAt) > holdAt ? UTILS.slice(holdAt, UTILS.indexOf(HOLD_TO, holdAt) + HOLD_TO.length) : null;
ok(CHAT.split(KIND_NOW).length === 2 && STYLE.split(BODY_NOW).length === 2 && STYLE.split(ROSTER_NOW).length === 2 && UTILS.split(MEASURE_NOW).length === 2 && UTILS.split(CAP_NOW).length === 2 && !!HOLD_NOW && UTILS.split(HOLD_NOW).length === 2,
  'the rules stand in the tree once each (chat.css\'s kind chip, style.css\'s dialog body and roster column, utils.js\'s measure + cap, createPopover\'s hold) — the controls take them out');
const CHAT_OLD = CHAT.replace(KIND_NOW, '.chat-artifact-kind { margin-left: auto; font-size: 0.85em; }');   // stale-pins: kept — the CONTROL plants the old rule back (its anchor, the rule now, is checked once above)
const STYLE_OLD = STYLE.replace(BODY_NOW, '.dialog.agents-dialog .agents-dialog-body { min-width: 380px; }');   // stale-pins: kept — the CONTROL plants the old rule back (its anchor, the rule now, is checked once above)
const UTILS_OLD = UTILS.replace(MEASURE_NOW, '').replace(CAP_NOW, '').replace(HOLD_NOW || '\u0000', '');   // ③'s measure + cap and ④'s hold taken out
const STYLE_NOROSTER = STYLE.replace(ROSTER_NOW, '');   // ②b's control: ONLY the roster's rule out (the body floor stays the cure's)

// ── the page bundles: the real modules (a built tree; an unbuilt one gets a stub build-version.js) ──
const root = scratch('fit-390-chrome'), dir = path.join(root, 'web'), fontsDir = path.join(root, 'fonts');
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(fontsDir, { recursive: true });
const FONT_ENV = FONT === 'dejavu' ? runnerFontEnv(fontsDir) : {};
const stubVersion = fs.existsSync(path.join(repo, 'src/lib/build-version.js')) ? [] : [{ name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'fit-390';", loader: 'js' })); } }];
const oldUtils = { name: 'old-utils', setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]utils\.js$/ }, () => ({ contents: UTILS_OLD, loader: 'js', resolveDir: path.dirname(UTILS_PATH) })); } };
const ENTRY = `import { renderArtifactCard } from ${JSON.stringify(path.join(repo, 'src/lib/artifact-card.js'))};
import { showContextMenu, createPopover } from ${JSON.stringify(UTILS_PATH)};
window.__card = renderArtifactCard; window.__menu = showContextMenu; window.__pop = createPopover; window.__ready = true;`;
const build = (name, plugins = []) => esbuild.build({ stdin: { contents: ENTRY, resolveDir: repo, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(dir, name), loader: { '.css': 'empty' }, logLevel: 'error', plugins: [...stubVersion, ...plugins] });
await build('now.js');
await build('old.js', [oldUtils]);
// ④'s right-anchored leg has its own control: the hold as unit 1 drew it (a right-anchored box measured by its fill)
const RIGHT_FIX = [" pop.style.right = 'auto';", ' pop.style.right = atR;'];
const UTILS_RIGHT = RIGHT_FIX.every((x) => UTILS.split(x).length === 2) ? RIGHT_FIX.reduce((s, x) => s.replace(x, ''), UTILS) : null;
if (UTILS_RIGHT) await build('right.js', [{ name: 'right-utils', setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]utils\.js$/ }, () => ({ contents: UTILS_RIGHT, loader: 'js', resolveDir: path.dirname(UTILS_PATH) })); } }]);
// ④'s edge-to-edge leg has its own control: the hold capping at the screen LESS ITS PADS (line 156's — r2082: the phone's link bar 8 px short)
const PADS_NOW = "    const bound = atR && atR !== 'auto' ? across : vw + 0.5;\n", PADS_OLD = '    const bound = across;\n';   // stale-pins: kept — line 156's bound for every box, the control's own text
const UTILS_PADS = UTILS.split(PADS_NOW).length === 2 ? UTILS.replace(PADS_NOW, PADS_OLD) : null;
if (UTILS_PADS) await build('pads.js', [{ name: 'pads-utils', setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]utils\.js$/ }, () => ({ contents: UTILS_PADS, loader: 'js', resolveDir: path.dirname(UTILS_PATH) })); } }]);
// …and the band leg's: the screen's bound for EVERY box, a right-anchored one too (r2082's first form — r2157: its row ran past the box)
const UTILS_VWALL = UTILS.split(PADS_NOW).length === 2 ? UTILS.replace(PADS_NOW, '    const bound = vw + 0.5;\n') : null;
if (UTILS_VWALL) await build('vwall.js', [{ name: 'vwall-utils', setup(b) { b.onLoad({ filter: /src[\\/]lib[\\/]utils\.js$/ }, () => ({ contents: UTILS_VWALL, loader: 'js', resolveDir: path.dirname(UTILS_PATH) })); } }]);

const web = express();
web.get('/style.css', (q, s) => s.type('css').send(q.query.old === '1' ? STYLE_OLD : q.query.old === 'roster' ? STYLE_NOROSTER : STYLE));
web.get('/chat.css', (q, s) => s.type('css').send(q.query.old === '1' ? CHAT_OLD : CHAT));
web.get('/:b.js', (q, s) => s.type('js').send(fs.readFileSync(path.join(dir, q.params.b + '.js'))));
web.get('/', (q, s) => {
  const old = q.query.old === '1' ? '1' : q.query.old === 'roster' ? 'roster' : q.query.old === 'right' ? 'right' : q.query.old === 'pads' ? 'pads' : q.query.old === 'vwall' ? 'vwall' : '0';
  s.type('html').send(`<!doctype html><html data-theme="dark" lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css?old=${old}"><link rel="stylesheet" href="/chat.css?old=${old}"><script>try{localStorage.setItem('vibespace.lang','zh')}catch{}</script></head><body><div id="stage"></div><script src="/${old === '1' ? 'old' : old === 'right' ? 'right' : old === 'pads' ? 'pads' : old === 'vwall' ? 'vwall' : 'now'}.js"></script></body></html>`);
});
const [PORT, CDP_PORT] = await freePorts(2);
const srv = await new Promise((r) => { const x = web.listen(PORT, '127.0.0.1', () => r(x)); });
const chromeDir = path.join(root, 'chrome');
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, ...FONT_ENV } });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch { } try { srv.close(); } catch { } try { fs.rmSync(root, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }

// ONE front state for the suite's tabs (cdp-front-shot.mjs): headless Chrome paints only the tab in front of its window, and a page
// behind makes no frame — POP's waits and createPopover's own clamp (a requestAnimationFrame) never run in it. Every evaluate brings
// its page to the front first when another tab is there (box row 224: close() drops only the socket, a control's tab stayed in front)
const FS = frontState();
/** one tab at 390 × 844 (touch), the page now or as it was */
async function page({ old = false } = {}) {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const bring = bringTab(CDP_PORT, tg.id); becameFront(FS, tg.id, bring);   // a new tab opens IN FRONT of its window
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } });
  const cdp = (method, params = {}, ms = 15000) => new Promise((r, j) => { const id = ++seq; const tm = setTimeout(() => { pend.delete(id); j(new Error(`CDP ${method}: no answer in ${ms / 1000} s`)); }, ms); pend.set(id, (m) => { clearTimeout(tm); r(m); }); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const ev = async (expr) => { if (!FS.front || FS.front.key !== tg.id) { await bring(); becameFront(FS, tg.id, bring); } const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result?.value; };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/?old=${old === 'roster' ? 'roster' : old === 'right' ? 'right' : old === 'pads' ? 'pads' : old === 'vwall' ? 'vwall' : old ? 1 : 0}` });
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { ready = await ev('window.__ready === true').catch(() => false); if (!ready) await sleep(50); }
  await ev('document.fonts.ready.then(() => true)');
  return { ev, cdp, ready, close: () => { try { ws.close(); } catch { } } };
}

// ① the cards: three deliverables in a phone chat column (the column's own padding, the chat's own sheet)
const CARDS = [
  { key: 'k-a', kind: 'design', name: 'Acme 落地页', path: '/w/demo/designs/landing' },
  { key: 'k-b', kind: 'design', name: '移动端新用户引导流程（第二版，含注册、验证手机号与首次设置）', path: '/w/demo/designs/mobile-onboarding-flow-with-a-very-long-folder-name' },
  { key: 'k-c', kind: 'page', name: 'report.html', path: '/w/demo/report.html' },
];
const CARD_LEG = `(() => {
  const col = document.createElement('div'); col.className = 'chat-view'; col.style.cssText = 'position:absolute;left:0;top:0;width:390px;padding:0 12px;box-sizing:border-box';
  document.getElementById('stage').appendChild(col);
  const probe = document.createElement('span'); probe.id = 'face-probe'; probe.className = 'chat-artifact-name'; probe.textContent = 'report.html'; col.appendChild(probe);
  for (const b of ${JSON.stringify(CARDS)}) col.appendChild(window.__card({ type: 'system', noticeKind: 'artifact', content: [{ type: 'artifact', at: Date.now() - 60000, ...b }] }));
  const lines = (e) => { const rg = document.createRange(); rg.selectNodeContents(e); return new Set([...rg.getClientRects()].map((x) => Math.round(x.top))).size; };
  return [...col.querySelectorAll('.chat-artifact-card')].map((c) => { const k = c.querySelector('.chat-artifact-kind'), n = c.querySelector('.chat-artifact-name'), cr = c.getBoundingClientRect(), kr = k.getBoundingClientRect();
    return { name: n.textContent, kind: k.textContent, kindLines: lines(k), kindW: Math.round(kr.width), kindIn: kr.right <= cr.right + 0.5 && kr.left >= cr.left - 0.5, nameCut: n.scrollWidth > n.clientWidth + 1, cardRight: Math.round(cr.right) }; });
})()`;
console.log(`① the deliverable card's kind chip at 390 (zh, ${FONT === 'dejavu' ? "the hosted runner's DejaVu Sans" : "this box's own face"})`);
{
  const now = await page(), was = await page({ old: true });
  ok(now.ready && was.ready, 'the pages load the real modules (renderArtifactCard, showContextMenu)');
  const A = await now.ev(CARD_LEG), B = await was.ev(CARD_LEG);
  // the face, read back from a probe in the name's own class OUTSIDE the cards (a card is content-visibility: auto — its words may
  // never be drawn in a background tab, so its font list stays empty): until it reads, 100 ms at a time, 30 tries (red by name then)
  let face = null, tries = 0;
  for (; tries < 30 && !face; tries++) { face = await drawnFace(now.cdp, '#face-probe'); if (!face) await sleep(100); }
  ok(FONT === 'dejavu' ? face === 'DejaVu Sans' : !!face, `the leg's face, read back from Chrome (the name's own class, ${tries} read(s)): ${face}`, face);
  const say = (r) => r.map((c) => `«${c.name.slice(0, 8)}» ${c.kind} ${c.kindLines} line(s) ${c.kindW} px${c.nameCut ? ', name cut' : ''}`).join(' · ');
  console.log(`      now: ${say(A)}\n      the old chip rule: ${say(B)}`);
  ok(A.length === 3 && A.every((c) => c.kindLines === 1 && c.kindIn && c.cardRight <= 390), `every kind chip ONE line inside its card (${A.map((c) => c.kind + ' ' + c.kindLines).join(', ')})`, A);
  ok(A[1].nameCut && !A[0].nameCut && !A[2].nameCut, 'beside the long title the NAME yields — its ellipsis; the short names stay whole', A);
  ok(B.length === 3 && B[1].kindLines >= 2 && B[1].kindW < A[1].kindW, `CONTROL: the old chip rule (margin-left only) — the long card's «${B[1] ? B[1].kind : '?'}» stands ${B[1] ? B[1].kindLines : '?'} lines (${B[1] ? B[1].kindW : '?'} px)`, B);
  now.close(); was.close();
}

// ② the Agents dialog's body: the modal with its own classes, its head and two cards
const AGENTS = `(() => {
  const ov = document.createElement('div'); ov.className = 'dialog-overlay';
  ov.innerHTML = '<div class="dialog agents-dialog"><div class="dialog-header"><h3>Agents</h3><button class="dialog-close">×</button></div>'
    + '<div class="dialog-body agents-dialog-body"><div class="agents-tabs btn-bar"><button class="agents-tab active">账号</button><button class="agents-tab">机器</button><button class="agents-tab">指令</button></div>'
    + '<div class="agents-overview-head btn-bar"><span class="agents-note btn-bar-text">本机账号与配额</span><button class="agent-btn agents-refresh-all"><svg viewBox="0 0 16 16"></svg><span>全部刷新</span></button></div>'
    + '<div class="agents-machine-sec"><div class="ob-backend"><b>Claude Code</b> 2.1.321 未登录<div class="btn-bar"><button class="agent-btn">重新检查</button><button class="agent-btn">更新</button></div></div>'
    + '<div class="ob-backend acct-section acct-roster"><div class="acct-roster-head btn-bar"><b class="btn-bar-text">Anthropic 账号</b><button class="agent-btn acct-add">+ 添加账号…</button></div>'
    + '<div class="acct-list"><div class="acct-row"><span class="acct-name">Work Max</span></div></div></div></div></div></div>';
  document.body.appendChild(ov);
  const R = (e) => e.getBoundingClientRect(), d = R(ov.querySelector('.dialog')), body = ov.querySelector('.agents-dialog-body'), b = R(body), ra = R(ov.querySelector('.agents-refresh-all'));
  const past = [...ov.querySelectorAll('.dialog *')].filter((e) => e.getClientRects().length && R(e).right > d.right + 0.5).map((e) => String(e.className || e.tagName).slice(0, 40));
  const oh = R(ov.querySelector('.agents-overview-head')), gapL = Math.round((oh.left - d.left) * 10) / 10, gapR = Math.round((d.right - oh.right) * 10) / 10;
  const ro = ov.querySelector('.acct-roster'), rc = getComputedStyle(ro), rr = R(ro), cl = rr.left + parseFloat(rc.borderLeftWidth) + parseFloat(rc.paddingLeft), cr = rr.right - parseFloat(rc.borderRightWidth) - parseFloat(rc.paddingRight);
  const hd = R(ro.querySelector('.acct-roster-head')), ti = R(ro.querySelector('.acct-roster-head b')), li = R(ro.querySelector('.acct-list'));
  const roster = { contentLeft: Math.round(cl), contentRight: Math.round(cr), headLeft: Math.round(hd.left), headRight: Math.round(hd.right), titleLeft: Math.round(ti.left), listLeft: Math.round(li.left), listRight: Math.round(li.right), alignItems: rc.alignItems };
  return { dialog: Math.round(d.width), dialogRight: Math.round(d.right), body: Math.round(b.width), bodyRight: Math.round(b.right), refreshRight: Math.round(ra.right), gapL, gapR, sideways: body.scrollWidth - body.clientWidth, past, roster };
})()`;
console.log('② the Agents dialog at 390 — its body never runs past it');
{
  const now = await page(), was = await page({ old: true });
  const A = await now.ev(AGENTS), B = await was.ev(AGENTS);
  console.log(`      now: dialog ${A.dialog} px (right ${A.dialogRight}), body ${A.body} px (right ${A.bodyRight}), «全部刷新» right ${A.refreshRight}, the head ${A.gapL} / ${A.gapR} px off the dialog's left / right edge, ${A.past.length} past · the old floor: body ${B.body} px (right ${B.bodyRight}), «全部刷新» right ${B.refreshRight}, the head ${B.gapL} / ${B.gapR} px off, ${B.past.length} past`);
  ok(A.dialog < 380 && A.bodyRight <= A.dialogRight + 0.5 && A.refreshRight <= A.dialogRight + 0.5 && !A.past.length && A.sideways <= 1 && Math.abs(A.gapL - A.gapR) <= 1, `the body (${A.body} px), «全部刷新» and every card inside the ${A.dialog} px dialog — nothing past its right edge, the head as far off it as off the left one (${A.gapR} / ${A.gapL} px)`, A);
  // the CONTROL states what the floor does to the dialog AS IT IS (ef10f5db9 made it 371 px at 390, it was 359 — there «全部刷新» itself ran
  // past): the 380 px body runs past the dialog's right edge and the edge cuts its right padding, the head pressed toward that edge
  ok(B.dialog === A.dialog && B.bodyRight > B.dialogRight + 0.5 && B.past.length > 0 && B.gapL - B.gapR > 5, `CONTROL: the old 380 px floor — the body ends at ${B.bodyRight}, past the dialog's ${B.dialogRight}: its right padding cut, the head ${B.gapR} px off that edge, ${B.gapL} off the left («全部刷新» at ${B.refreshRight})`, B);
  // ②b the roster's head spans the roster (主开发 r531: «Anthropic 账号» and its button stood ~50 px in — the column centred them)
  const nr = await page({ old: 'roster' }), C = (await nr.ev(AGENTS)).roster, H = A.roster;
  console.log(`      the roster now: content ${H.contentLeft}–${H.contentRight}, head ${H.headLeft}–${H.headRight}, title at ${H.titleLeft}, list ${H.listLeft}–${H.listRight} (align-items ${H.alignItems}) · without its rule: head ${C.headLeft}–${C.headRight}, title at ${C.titleLeft}, list ${C.listLeft}–${C.listRight} (align-items ${C.alignItems})`);
  ok(Math.abs(H.headLeft - H.contentLeft) <= 1 && Math.abs(H.headRight - H.contentRight) <= 1 && Math.abs(H.titleLeft - H.contentLeft) <= 1 && Math.abs(H.listLeft - H.contentLeft) <= 1 && Math.abs(H.listRight - H.contentRight) <= 1,
    `②b the roster's head and list span the roster: the title at its left edge (${H.titleLeft} vs ${H.contentLeft}), the head and the list to its right edge (${H.headRight} / ${H.listRight} vs ${H.contentRight})`, H);
  ok(C.headLeft - C.contentLeft > 10 && C.listLeft - C.contentLeft > 10, `CONTROL: without the roster's rule the column CENTRES its head (${C.headLeft - C.contentLeft} px in) and its short list (${C.listLeft - C.contentLeft} px in) — .ob-backend's later centre wins`, C);
  now.close(); was.close(); nr.close();
}

// ③ the popover helper: the add-account menu's own rows opened from x 205; a menu wider than the screen
const ROWS = ['使用 Claude 登录（推荐）…', '在终端里登录另一个订阅…', '用长期 token 添加（登录生成或粘贴）…', '添加 Console 账号…', '添加 API key…', '添加第三方模型…'];
const MENU = (rows, x) => `(() => {
  document.querySelectorAll('.context-menu').forEach((m) => m.remove());
  const m = window.__menu(${x}, 120, ${JSON.stringify(rows)}.map((label) => ({ label, action() {} })));
  const r = m.getBoundingClientRect(), lines = (e) => { const rg = document.createRange(); rg.selectNodeContents(e); return new Set([...rg.getClientRects()].map((q) => Math.round(q.top))).size; };
  return { left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, w: Math.round(r.width * 10) / 10, gap: Math.round((innerWidth - r.right) * 10) / 10, multi: [...m.querySelectorAll('.context-menu-item')].filter((e) => lines(e) > 1).map((e) => e.textContent.trim()) };
})()`;
const WIDE = ['一个比屏幕还宽的菜单行：' + '这一行的文字很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长'];
console.log('③ a pop-up at 390 — the screen bounds it with the usual margin (MENU_PAD 4 px)');
{
  const now = await page(), was = await page({ old: true });
  const A = await now.ev(MENU(ROWS, 205)), W = await now.ev(MENU(WIDE, 205)), B = await was.ev(MENU(ROWS, 205));
  console.log(`      now: the add-account rows from x 205 → left ${A.left}, ${A.w} px, ${A.gap} px off the edge, ${A.multi.length} row(s) on two lines · a menu wider than the screen → left ${W.left}, ${W.w} px, ${W.gap} px off · the old measure: left ${B.left}, ${B.w} px, ${B.gap} px off`);
  ok(A.gap >= 3.5 && A.left >= 3.5 && !A.multi.length, `the add-account menu keeps the usual margin: ${A.gap} px off the screen's right edge, its ${A.w} px natural width, every row on one line`, A);
  ok(W.left >= 3.5 && W.gap >= 3.5 && W.w <= 390 - 8 + 0.5, `a menu wider than the screen is capped at the screen less its two pads (${W.w} px, ${W.left} / ${W.gap} px off the edges)`, W);
  ok(B.gap < 1, `CONTROL: the helper as it measured before (at the point, squeezed by the edge) — the same menu ${B.gap} px off the edge, ${B.w} px wide (flush)`, B);
  now.close(); was.close();
}

// ④ createPopover: a popover's width held to the screen (the 390 census's first find)
// r2082: `edge` = a popover whose OWN rule spans the screen (left 0 / right 0 — the phone's link bar, doc-window-ui.js), its words wrapping
const EDGE_WORDS = 'Open this link in a new window, edit its address, copy it or remove it — words that wrap on a phone screen';
// r2157: `band` = the row's FILL a fixed width (px, no words — no font decides it): a box in the 8 px band between the screen less its pads and the screen
const POP = (wide, own = '', right = false, edge = false, band = 0) => `(async () => {
  document.querySelectorAll('.fit-pop, #fit-pop-anchor').forEach((e) => e.remove());
  const a = document.createElement('button'); a.id = 'fit-pop-anchor'; a.style.cssText = 'position:fixed;left:205px;top:100px;width:24px;height:24px'; document.body.appendChild(a);
  const p = window.__pop(a, 'fit-pop');${right ? " p.style.left = ''; p.style.right = '2px';" : ''}
  p.style.padding = '6px 8px'; p.style.border = '1px solid #888'; p.style.background = '#222'; p.style.color = '#eee'; p.style.fontSize = '14px';${own ? ` p.style.maxWidth = '${own}';` : ''}
  const row = document.createElement('div'); row.className = 'fit-pop-row'; row.style.whiteSpace = 'nowrap';
  row.textContent = ${wide ? JSON.stringify('一行永远不会断开的很长很长的文字：' + 'a-path-that-never-breaks/'.repeat(14)) : JSON.stringify('短的一行')}; p.appendChild(row);${edge ? " if (!document.getElementById('fit-edge-css')) { const st = document.createElement('style'); st.id = 'fit-edge-css'; st.textContent = '.fit-pop.fit-pop-edge{left:0!important;right:0;max-width:none}'; document.head.appendChild(st); } p.classList.add('fit-pop-edge'); row.style.whiteSpace = 'normal'; row.textContent = " + JSON.stringify(EDGE_WORDS) + ';' : ''}${band ? " row.textContent = ''; const blk = document.createElement('span'); blk.style.cssText = 'display:inline-block;width:" + band + "px;height:10px'; row.appendChild(blk);" : ''}
  const frames = () => new Promise((r, j) => { const t = setTimeout(() => j(new Error('no frame in 5 s: the page is ' + document.visibilityState + ' (a page behind another tab paints none)')), 5000); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); setTimeout(r, 120); })); });
  await frames();
  const read = () => { const r = p.getBoundingClientRect(); return { left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, w: Math.round(r.width * 10) / 10, maxW: p.style.maxWidth, ox: getComputedStyle(p).overflowX, scrolls: p.scrollWidth > p.clientWidth + 1, rowW: Math.round(row.scrollWidth) }; };   // rowW: the row's WORDS (its box is the popover's width)
  const first = read();
  row.textContent = '短的一行'; await frames();
  return { first, shrunk: read(), vw: innerWidth };
})()`;
console.log('④ a popover at 390 — its width held to the screen too (createPopover)');
{
  // POP awaits two frames, and headless Chrome paints only the tab IN FRONT of its window (cdp-front-shot.mjs's head): the
  // hosted runner's newer browser never painted «now», opened behind «was» (r2062), and the box's never painted «now» behind
  // the pads control's tab (row 224) — page()'s evaluate brings its own page to the front (the browser's /json/activate door)
  const now = await page(), was = await page({ old: true });
  const A = await now.ev(POP(true)), N = await now.ev(POP(false)), O = await now.ev(POP(true, '500px')), RA = await now.ev(POP(false, '', true));
  const E = await now.ev(POP(false, '', false, true));
  ok(!!E.first && E.first.left <= 0.5 && E.first.right >= E.vw - 0.5 && !E.first.maxW, `an EDGE-TO-EDGE popover (its own rule left 0 / right 0, as the phone's link bar) keeps the screen's whole width — no cap of the helper's (${E.first.left}–${E.first.right} of ${E.vw}, max-width ${E.first.maxW || 'none'})`, E);
  if (UTILS_PADS) {
    const pp = await page({ old: 'pads' }), RE = await pp.ev(POP(false, '', false, true)); pp.close();
    ok(!!RE.first.maxW && RE.first.right <= RE.vw - 7.5, `CONTROL: the hold capping at the screen less its pads (line 156's) cuts the same edge-to-edge popover 8 px short (${RE.first.left}–${RE.first.right} of ${RE.vw}, max-width ${RE.first.maxW || 'none'})`, RE);
  } else ok(false, 'CONTROL: the hold\'s bound stands in utils.js once («    const bound = atR && atR !== \'auto\' ? across : vw + 0.5;») — the control puts the pads back');
  // r2157: a RIGHT-ANCHORED box (the ⚙'s shape: left '', right 2 px) in the 8 px band — its box 390 px (a 372 px fill + 16 px padding
  // + 2 px border): held at the screen less its pads, its fill scrolling INSIDE the box, the box inside the screen
  const BD = await now.ev(POP(false, '', true, false, 372));
  ok(!!BD.first.maxW && BD.first.ox === 'auto' && BD.first.left >= -0.5 && BD.first.right <= BD.vw + 0.5, `a right-anchored box in the band between the screen less its pads and the screen is held at that bound (max-width ${BD.first.maxW || 'none'}, overflow-x ${BD.first.ox}, ${BD.first.left}–${BD.first.right} of ${BD.vw}): its fill scrolls inside it`, BD);
  if (UTILS_VWALL) {
    const vp = await page({ old: 'vwall' }), RB = await vp.ev(POP(false, '', true, false, 372)); vp.close();
    ok(!RB.first.maxW && RB.first.ox !== 'auto' && RB.first.w < 389.5, `CONTROL: the screen's bound for every box (r2082's first form) leaves the same box unheld — squeezed by its right anchor to ${RB.first.w} px of its 390, its fill past it with no scroll in it (max-width ${RB.first.maxW || 'none'}, overflow-x ${RB.first.ox})`, RB);
  } else ok(false, 'CONTROL: the band leg\'s bound stands in utils.js once — the control writes the screen\'s bound for every box');
  const B = await was.ev(POP(true));
  console.log(`      now: the wide popover ${A.first.left}–${A.first.right} (${A.first.w} px, its row ${A.first.rowW} px, max-width ${A.first.maxW || 'none'}) · shrunk: ${A.shrunk.w} px, max-width ${A.shrunk.maxW || 'none'} · the narrow one ${N.first.left}–${N.first.right} · without the hold: ${B.first.left}–${B.first.right}`);
  ok(A.first.left >= 3.5 && A.first.right <= A.vw - 3.5 && A.first.rowW > A.vw, `a popover holding ${A.first.rowW} px of words that never break stands inside the screen, 4 px off each edge (${A.first.left}–${A.first.right} of ${A.vw})`, A);
  ok(A.first.ox === 'auto' && A.first.scrolls, `its words scroll sideways INSIDE it (overflow-x ${A.first.ox}), never past the screen`, A.first);
  ok(N.first.left === 205 && !N.first.maxW && N.first.ox === 'visible', `a narrow popover keeps its anchor's place (left ${N.first.left}) and gets no style of the helper's`, N);
  ok(!A.shrunk.maxW && A.shrunk.ox === 'visible' && A.shrunk.w < 200, `its row shrunk, the cap and the scroll are lifted (max-width ${A.shrunk.maxW || 'none'}, overflow-x ${A.shrunk.ox}, ${A.shrunk.w} px)`, A.shrunk);
  ok(O.first.right <= O.vw - 3.5 && O.shrunk.maxW === '500px', `a max-width the caller wrote (500px) is capped while the box is wider than the screen, then put back (${O.first.maxW} → ${O.shrunk.maxW})`, O);
  ok(!RA.first.maxW && RA.first.ox === 'visible' && RA.first.right >= RA.vw - 2.5, `a narrow RIGHT-anchored popover (the ⚙'s shape: left '', right 2 px) is measured by its width, not its fill — no style of the helper's, at its right edge (${RA.first.left}–${RA.first.right})`, RA);
  if (UTILS_RIGHT) {
    const rp = await page({ old: 'right' }), RO = await rp.ev(POP(false, '', true)); rp.close();
    ok(!!RO.first.maxW && RO.first.ox === 'auto', `CONTROL: the hold measuring a right-anchored box by its fill (unit 1's) caps the same narrow popover (max-width ${RO.first.maxW || 'none'}, overflow-x ${RO.first.ox})`, RO);
  } else ok(false, 'CONTROL: the right anchor\'s fix stands in utils.js once each (" pop.style.right = \'auto\';", " pop.style.right = atR;") — the control takes them out');
  // the desk: nothing moves — a 1280 × 800 page: a narrow popover keeps the release's place and gets no style; the ~2600 px row is held only because it is wider than the screen
  await now.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await was.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const DN = await now.ev(POP(false)), DW = await now.ev(POP(true));
  const WN = await was.ev(POP(false));
  ok(!DN.first.maxW && DN.first.ox === 'visible' && DN.first.left === WN.first.left && DN.first.w === WN.first.w, `the DESK at 1280: a narrow popover stands where the release stood it (left ${DN.first.left}, ${DN.first.w} px) with no style of the helper's`, { DN, WN });
  ok(DW.vw === 1280 && (DW.first.rowW + 18 <= 1280.5 ? !DW.first.maxW : DW.first.right <= 1276.5), `the DESK at 1280: a wide popover is held only if its BOX (its row + 16 px padding + 2 px border, r2157) is wider than the screen (its words ${DW.first.rowW} px; max-width ${DW.first.maxW || 'none'})`, DW);
  ok(B.first.right > B.vw + 0.5, `CONTROL: the helper without the hold — the same popover runs past the screen's right edge (${B.first.left}–${B.first.right} of ${B.vw})`, B);
  now.close(); was.close();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed, 0 failed)`);
process.exit(fail ? 1 : 0);
