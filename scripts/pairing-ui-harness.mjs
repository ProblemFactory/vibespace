// The lane-pairing chrome suites' shared world (test-pair-dialog-ui, test-exit-access-ui) — NOT a test-*.mjs on
// purpose (the tier census would demand a tier), like scratch.mjs. One per suite run:
//   · a THROWAWAY server in a git worktree (its own data/, a scratch HOME, per-run ports / names — scratch.mjs;
//     never :7 / 5901 — vncEnv), overlaying this checkout's src/ + built public/ + server.js + the agentd bundle
//   · a stub `claude` (node, absolute shebang) behind the REAL chat-wrapper through the REAL create path: it dumps
//     its env (the session's vsst_ token) and answers every user turn — zero vendor calls
//   · headless chrome over raw CDP: pages with a request log (Network), real mouse clicks proven to hit their
//     target, real key events
//   · a REAL device daemon (the bundle built from this tree) paired through the REAL route and dialing the server
// Cleanup is by /proc EVIDENCE (a process under one of this run's scratch roots), never by a name.
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
export const REPO = path.resolve(new URL('..', import.meta.url).pathname);
export const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function bootWorld(name, { chrome: withChrome = true, env: extraEnv = {} } = {}) {
  const VNC_ENV = await vncEnv();
  const [PORT, CDP_PORT] = await freePorts(2);
  const wt = scratch(name + '-wt');
  const home = scratchHome(name + '-home', fs);
  const stubDir = scratch(name + '-stub');
  const devDir = scratch(name + '-dev');
  fs.mkdirSync(stubDir, { recursive: true }); fs.mkdirSync(devDir, { recursive: true });
  try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch {}
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: REPO, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json', 'scripts']) execSync(`rm -rf ${wt}/${f} && cp -r ${REPO}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
  fs.mkdirSync(path.join(wt, 'data', 'bin'), { recursive: true });
  // the device bundle, built from THIS tree (the server serves it at /vibespace-device.js; our device runs it)
  const bundle = path.join(wt, 'data', 'bin', 'vibespace-agentd.js');
  const version = require(path.join(REPO, 'package.json')).version;
  fs.writeFileSync(path.join(wt, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
  execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', '--external:node-pty', `--outfile=${bundle}`, '--log-level=warning'], { cwd: wt });
  const stubPath = path.join(stubDir, 'claude');
  fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = 'f01d0000-0000-4000-8000-' + String(process.pid).padStart(12, '0');
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify({ sid: SID, env: process.env }));
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: '2.1.274' });
let n = 0, buf = '';
process.stdin.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    const k = ++n;
    out({ type: 'assistant', message: { id: 'msg_stub_' + process.pid + '_' + k, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'ack ' + k }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID, uuid: 'stub-a-' + process.pid + '-' + k });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 10, num_turns: 1, result: 'ack ' + k, session_id: SID, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: home, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_AGENTD_ROOT: '', VIBESPACE_DEVICE_ROOT: '', ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  const serverLog = [];
  srv.stdout.on('data', (d) => serverLog.push(String(d))); srv.stderr.on('data', (d) => serverLog.push(String(d)));
  const chromeDir = `${wt}-chrome`;
  const chrome = !withChrome ? null : spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-background-timer-throttling', '--font-render-hinting=none', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
  const devPids = [];
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return; cleaned = true;
    for (const p of devPids) { try { process.kill(p, 'SIGTERM'); } catch {} }
    try { chrome?.kill('SIGKILL'); } catch {}
    try { srv.kill('SIGKILL'); } catch {}
    for (const root of [wt, chromeDir, home, stubDir, devDir]) { try { endRootedProcesses(root); } catch {} }
    try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch {}
    for (const d of [wt, chromeDir, home, stubDir, devDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  };
  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
  const BASE = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 80; i++) { try { await fetch(`${BASE}/api/home`); break; } catch { await sleep(250); } }

  // ── raw CDP ──
  const WebSocket = require(path.join(REPO, 'node_modules/ws'));
  async function connect(wsUrl) {
    const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r) => sock.on('open', r));
    let seq = 0; const pend = new Map(); const errors = []; const requests = []; const listeners = [];
    sock.on('message', (d) => {
      const m = JSON.parse(d);
      for (const l of listeners) { try { l(m); } catch { } }
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') { try { errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
      if (m.method === 'Network.requestWillBeSent') { const q = m.params.request; requests.push({ method: q.method, url: q.url, body: q.postData || null, at: Date.now() }); }
    });
    const cdp = (method, params = {}) => new Promise((res, rej) => {
      const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
      sock.send(JSON.stringify({ id, method, params }));
    });
    const evalJs = async (expr) => {
      const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(150); } return evalJs(expr); };
    const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 25000) return rej(new Error("no app after 25s")); setTimeout(w, 200); })(); })');
    const key = async (k, { code = k, vk = 0, text } = {}) => {
      await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      if (text) await cdp('Input.dispatchKeyEvent', { type: 'char', key: k, code, text, unmodifiedText: text, windowsVirtualKeyCode: vk });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await sleep(60);
    };
    const type = async (s) => { await cdp('Input.insertText', { text: s }); await sleep(120); };
    /** A REAL click on `sel`: scrolled into view, the point PROVEN to hit it (a toast over it is cleared once). */
    const realClick = async (sel) => {
      for (let k = 0; k < 2; k++) {
        const r = await evalJs(`(() => { const e = (${sel.startsWith('(') ? sel : `document.querySelector(${JSON.stringify(sel)})`}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(); const x = q.left + Math.min(q.width / 2, 40), y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hits: !!hit && (hit === e || e.contains(hit)) }; })()`);
        if (!r) return false;
        if (!r.hits) { await evalJs(`document.querySelectorAll('#global-toasts > .global-toast').forEach((el) => el.remove()); true`); continue; }
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
        await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
        await sleep(150);
        return true;
      }
      return false;
    };
    return { sock, cdp, evalJs, waitFor, waitApp, key, type, realClick, errors, requests, on: (fn) => listeners.push(fn) };
  }
  let firstTarget = null;
  for (let i = 0; withChrome && i < 120 && !firstTarget; i++) {
    try { firstTarget = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
    if (!firstTarget) await sleep(250);
  }
  if (withChrome && !firstTarget) throw new Error('chrome never exposed a CDP page target');
  /** A page on the app at `width` × `height` in `lang` (en / zh), the wizard skipped, the Network log on. */
  /** `bundleText` (a control): the page is served THAT client bundle instead of /bundle.js (CDP Fetch interception) —
   *  a patched copy of one client module built by buildPatchedBundle. */
  async function openPage({ width = 1280, height = 820, lang = 'en', mobile = false, first = false, bundleText = null } = {}) {
    let t = first ? firstTarget : null;
    if (!t) { t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); }
    const P = await connect(t.webSocketDebuggerUrl);
    await P.cdp('Runtime.enable'); await P.cdp('Page.enable'); await P.cdp('Network.enable');
    if (bundleText) {
      const body = Buffer.from(bundleText).toString('base64');
      P.on((m) => {
        if (m.method !== 'Fetch.requestPaused') return;
        const id = m.params.requestId;
        if (/\/bundle\.js(\?|$)/.test(m.params.request.url)) P.cdp('Fetch.fulfillRequest', { requestId: id, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }], body }).catch(() => {});
        else P.cdp('Fetch.continueRequest', { requestId: id }).catch(() => {});
      });
      await P.cdp('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }] });
    }
    await P.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    if (mobile) await P.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await P.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `${ONBOARDED_SOURCE}; try { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); } catch {}` });
    await P.cdp('Page.navigate', { url: `${BASE}/` });
    await P.waitApp();
    await sleep(700);
    return P;
  }
  /** A live claude chat session through the REAL create path (the stub). → {sid (webui id), token, cid} */
  async function createStubSession(cwd, { name = null } = {}) {
    fs.mkdirSync(cwd, { recursive: true });
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((r) => ws.on('open', r));
    const frames = [];
    ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
    const before = new Set(fs.readdirSync(stubDir).filter((f) => f.startsWith('env-')));
    const reqId = 'c' + Math.random().toString(36).slice(2, 8);
    ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd, reqId, ...(name ? { name } : {}) }));
    let sid = null;
    for (let i = 0; i < 120 && !sid; i++) { const f = frames.find((m) => m?.type === 'created' && (!m.reqId || m.reqId === reqId)); if (f) sid = f.sessionId; else await sleep(250); }
    let token = null, cid = null;
    for (let i = 0; i < 120 && !token; i++) {
      for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-') && !before.has(x))) {
        try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.env.VIBESPACE_SESSION_TOKEN) { token = e.env.VIBESPACE_SESSION_TOKEN; cid = e.sid; } } catch {}
      }
      if (!token) await sleep(250);
    }
    ws.close();
    return { sid, token, cid };
  }
  /** Pair a dial device through the REAL route and start a REAL daemon from this tree's bundle dialing it. */
  async function pairDevice(deviceId, { base = BASE, start = true } = {}) {
    const r = await (await fetch(`${BASE}/api/device/dial-pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId, base }) })).json();
    const root = path.join(devDir, deviceId);
    fs.mkdirSync(path.join(root, 'state'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(root, 'state', 'token'), r.hostToken, { mode: 0o600 });
    if (start) startDaemon(root, r.dialUrl, r.dialToken);
    return { ...r, root };
  }
  function startDaemon(root, dialUrl, dialToken) {
    const d = spawn(process.execPath, [bundle, '--dial', dialUrl, '--dial-token', dialToken], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: home, VIBESPACE_AGENTD_ROOT: root, VIBESPACE_DEVICE_ROOT: root } });
    d.unref(); devPids.push(d.pid);
    return d.pid;
  }
  const lockPid = (root) => { try { return Number(String(fs.readFileSync(path.join(root, 'state', 'agentd.lock'), 'utf8')).trim()); } catch { return 0; } };
  const api = async (method, p, body, headers = {}) => { const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const hostRow = async (deviceId) => (await api('GET', '/api/hosts')).j.hosts.find((h) => h.deviceId === deviceId);
  return { PORT, BASE, wt, home, stubDir, devDir, bundle, serverLog, srvPid: srv.pid, openPage, createStubSession, pairDevice, startDaemon, lockPid, api, hostRow, cleanup };
}

/** The RECT CENSUS of a dialog: inside the viewport, no horizontal overflow, every radio row ≥ `minRow` px. */
export const rectCensusJs = (dialogSel, rowSel, minRow) => `(() => {
  const d = document.querySelector(${JSON.stringify(dialogSel)}); if (!d) return { ok: false, why: 'no dialog' };
  const r = d.getBoundingClientRect(); const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const body = d.querySelector('.dialog-body') || d;
  const overflowX = body.scrollWidth - body.clientWidth;
  const rows = [...d.querySelectorAll(${JSON.stringify(rowSel)})].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height));
  const small = rows.filter((h) => h < ${Number(minRow)});
  const outside = r.left < -1 || r.right > vw + 1 || r.top < -1;
  return { ok: !outside && overflowX <= 1 && rows.length > 0 && small.length === 0, rect: { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }, vw, vh, overflowX, rows, small };
})()`;

/** THE LABEL CENSUS of a dialog (naive-user N-radio): every VISIBLE label wrapping a radio or a checkbox shows the
 *  control BESIDE its words — the control's right edge left of the words' first character and its vertical centre
 *  inside that character's line box (±2 px). `.dialog-body label` (0,1,1) is a COLUMN flex: a label class that does
 *  not out-rank it stacks the control on its own line above the words (the 7th instance of the class). */
export const labelRowCensusJs = (dialogSel) => `(() => {
  const d = document.querySelector(${JSON.stringify(dialogSel)}); if (!d) return { ok: false, why: 'no dialog', n: 0, bad: [] };
  const bad = []; let n = 0;
  for (const lab of d.querySelectorAll('label')) {
    const c = lab.querySelector('input[type="radio"], input[type="checkbox"]');
    if (!c || !lab.offsetParent || !c.offsetParent) continue;
    const w = document.createTreeWalker(lab, NodeFilter.SHOW_TEXT, { acceptNode: (x) => (x.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    const tn = w.nextNode(); if (!tn) continue;
    const i = tn.textContent.search(/\\S/);
    const rg = document.createRange(); rg.setStart(tn, i); rg.setEnd(tn, i + 1);
    const tr = rg.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const cy = cr.top + cr.height / 2;
    n++;
    if (!(cr.right <= tr.left + 1 && cy >= tr.top - 2 && cy <= tr.bottom + 2)) bad.push({ words: tn.textContent.trim().slice(0, 24), control: [Math.round(cr.left), Math.round(cr.top), Math.round(cr.right)], firstChar: [Math.round(tr.left), Math.round(tr.top), Math.round(tr.bottom)] });
  }
  return { ok: n > 0 && bad.length === 0, n, bad };
})()`;
/** The N-radio fix's selectors and their pre-fix spelling — a control's patched copy of public/style.css reverts them. */
export const LABEL_FIX_REVERT = [
  ['.dialog-body label.device-pair-keep, .device-pair-keep {', '.device-pair-keep {'],
  ['.dialog-body label.dap-row, .dap-row { display', '.dap-row { display'],
  ['.dialog-body label.exit-access-mode, .dialog-body label.exit-access-ask, .exit-access-mode, .exit-access-ask { display', '.exit-access-mode, .exit-access-ask { display'],
];
/** JS that loads `cssText` IN PLACE of /style.css (the same cascade position) — a control's patched copy, then back. */
export const swapStyleJs = (cssText) => `(() => { const old = document.getElementById('vs-pairing-css') || document.querySelector('link[rel=stylesheet][href*="/style.css"]'); if (!old) return false; const st = document.createElement('style'); st.id = 'vs-pairing-css'; st.textContent = ${JSON.stringify(cssText)}; old.replaceWith(st); return true; })()`;
/** THE MACHINE ROW CENSUS (naive-user N-row) at the page's sidebar width: the machine's NAME is shown (≥ 30 px, or its
 *  whole text), every action icon inside the row, no exit line cut (scrollWidth ≤ clientWidth), no sideways scroll
 *  on the panel. Pre-fix at the default width: the name 0 px, four icons past the edge, "命令 …" cut. */
export const machineRowCensusJs = (hostId) => `(() => {
  const r = [...document.querySelectorAll('.mounts-row')].find((x) => x._hostId === ${JSON.stringify(hostId)}); if (!r) return { ok: false, why: 'no row' };
  const rr = r.getBoundingClientRect();
  const name = r.querySelector('.mounts-name'); const nr = name.getBoundingClientRect();
  const nameShown = nr.width > 0 && nr.width >= Math.min(name.scrollWidth, 30) - 1;
  const btns = [...r.querySelectorAll('.mounts-row-actions button')].map((b) => b.getBoundingClientRect());
  const btnsInside = btns.length > 0 && btns.every((q) => q.left >= rr.left - 1 && q.right <= rr.right + 1);
  const lines = [...r.querySelectorAll('.mounts-exit-line')].map((e) => ({ text: e.textContent, cut: e.scrollWidth > e.clientWidth + 1 }));
  const p = document.querySelector('.mounts-panel');
  const panelX = p ? p.scrollWidth - p.clientWidth : 0;
  return { ok: nameShown && btnsInside && lines.length > 0 && lines.every((l) => !l.cut) && panelX <= 1, rowW: Math.round(rr.width), name: name.textContent, nameW: Math.round(nr.width), btns: btns.length, btnsInside, lines, panelX };
})()`;
/** The N-row fix and its pre-fix spelling — a control's patched copy of public/style.css reverts it. */
export const ROW_FIX_REVERT = [
  ['.mounts-row-top.mounts-host-top { flex-wrap: wrap; row-gap: 2px; }\n', ''],
  ['.mounts-host-top > .mounts-name { flex: 1 1 auto; min-width: 3em; }\n', ''],
  ['.mounts-host-top > .mounts-row-actions { flex: 0 1 auto; flex-wrap: wrap; margin-left: auto; min-width: 0; }\n', ''],
  ['.mounts-exit-line { white-space: normal; overflow-wrap: anywhere; display: block; }\n', '.mounts-exit-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }\n'],
];

/** A CONTROL's client bundle: src/client.js built with ONE module (`rel`, e.g. 'src/lib/exit-access-dialog.js')
 *  replaced by `patchedSrc`, the copy written into scripts/mutant-copy.mjs's scratch dir (`M` = mutantCopies(…)) —
 *  the copy's relative imports resolve against the ORIGINAL file's directory. → the bundle's text (openPage's
 *  `bundleText`). Never writes the checkout. */
export async function buildPatchedBundle(M, rel, patchedSrc, tag = 'ctl') {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const orig = path.join(REPO, rel);
  const copy = path.join(M.dir, `${path.basename(rel, '.js')}-${tag}-${process.pid}.js`);
  fs.writeFileSync(copy, patchedSrc); M.files.push(copy);
  const r = await esbuild.build({
    entryPoints: [path.join(REPO, 'src/client.js')], bundle: true, write: false, minify: true, format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, logLevel: 'silent',
    plugins: [{ name: 'vs-control', setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => {
        if (a.importer === copy && a.path.startsWith('.')) return { path: path.resolve(path.dirname(orig), a.path) };
        // a package the copy imports (marked, dompurify…) resolves from the ORIGINAL's directory — the copy lives in a
        // scratch dir with no node_modules above it (verify-r4 F4's inbox-window control)
        if (a.importer === copy && !a.path.startsWith('/') && a.pluginData !== 'vs-control') return b.resolve(a.path, { resolveDir: path.dirname(orig), kind: a.kind, pluginData: 'vs-control' });
        if (a.path.startsWith('.') && path.resolve(a.resolveDir, a.path) === orig) return { path: copy };
        return undefined;
      });
    } }],
  });
  return r.outputFiles[0].text;
}
