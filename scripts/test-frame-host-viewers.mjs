#!/usr/bin/env node
// FOREIGN HTML IN THE FRAME HOST, SEEN (lane frame-host-preview, B-5b2c, 2026-10-20) — HEAVY: a worktree server of THIS
// tree WITH A PASSWORD (the signed-in shape: the cookie is SameSite=Lax) + headless chrome. The PURE half — every
// kind's header, the folder door, the census — is scripts/test-csp-report.mjs ⑦/⑧. The finding: three frames the page
// made for agent-written or peer HTML were srcdoc frames (the APP page's policy) and the code editor's HTML preview had
// `allow-same-origin` — an agent-written page previewed there ran AS THE APP (its cookie, its storage, every API).
//
//   Ⓐ THE CODE EDITOR'S HTML PREVIEW over the repo's OWN pages (copied with their folders: docs/mockups/split-ux,
//     docs/mockups/integrations-per-account, docs/design-mockups/communication-panel — a MODULE script —,
//     docs/slack-relay): the frame is `sandbox="allow-scripts"` (never allow-same-origin) at the host's address, its
//     page runs at an opaque origin (origin 'null', no cookie, no storage, no parent document), and EVERY file it asks
//     of its folder answers 200 at the folder's own address (/frame-host/f/<token>/…) — the stylesheets applied, the
//     module and classic scripts ran (each page's own effect, read in the frame)
//   Ⓑ public/index.html previewed (the app's own page): its /style.css, /dist/… are the HUB's — blocked by the policy,
//     never fetched; the app does not boot inside the preview
//   Ⓒ a HOSTILE preview: fetch of the hub's /api (blocked), the folder's .env / key.pem / a symlink out of the folder /
//     a ../ path (404 — never the bytes), its own inline script + eval + sibling json (run), top navigation (refused)
//   Ⓓ an .eml's HTML body: nothing of the mail runs (an inline script, a handler, a byte-exact copy of the host's line,
//     a javascript: link), the frame is the host's `kind=eml`; a remote picture is not even requested until "Show
//     pictures", then it is (the host's `pictures=1`)
//   Ⓓ2 a Word document's embedded HTML (scripts/fixtures/docx/hostile.docx's altChunk): written at the host's `kind=docx`,
//     its text shown, its script and handler ran nowhere
//   Ⓔ CONTROL — the OLD preview shape (srcdoc + allow-same-origin) of the same hostile page on the same page: it runs at
//     the app's origin and reads the API with the cookie, and the app page's policy reports it (taken) — every leg
//     above could go red
//   and the suite ENDS WITH ZERO CSP REPORTS (scripts/scratch.mjs's teardown): the three frames run under their own
//   policies, never the app page's
//
// Run: node scripts/test-frame-host-viewers.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, takeCspReports } from './scratch.mjs';
const require = createRequire(import.meta.url);

const T0 = Date.now();
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv(); // never the machine-global :7/5901 (test-architecture §57)
const [PORT, CDP_PORT] = await freePorts(2);
const BASE = `http://127.0.0.1:${PORT}`;
const PW = 'pw-fhv-' + Math.random().toString(36).slice(2, 10);
const wt = scratch('fhview-smoke');
const prof = scratch('fhview-chrome');
const FX = scratch('fhview-fx');
const OUT = scratch('fhview-out');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── fixtures: the repo's own pages WITH their folders, the app's page, a hostile page, a hostile mail ──
fs.mkdirSync(FX, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const f of fs.readdirSync(path.join(repo, from))) if (!/\.png$/.test(f)) fs.copyFileSync(path.join(repo, from, f), path.join(to, f)); };
copyDir('docs/mockups/split-ux', path.join(FX, 'split-ux'));
copyDir('docs/mockups/integrations-per-account', path.join(FX, 'integrations'));
copyDir('docs/design-mockups/communication-panel', path.join(FX, 'comm-panel'));
copyDir('docs/slack-relay', path.join(FX, 'slack-relay'));
fs.mkdirSync(path.join(FX, 'app'), { recursive: true }); fs.copyFileSync(path.join(repo, 'public/index.html'), path.join(FX, 'app/index.html'));
const H = path.join(FX, 'hostile'); fs.mkdirSync(path.join(H, 'sub'), { recursive: true });
fs.writeFileSync(path.join(H, '.env'), 'SECRET_ENV=fhv-env-secret\n');
fs.writeFileSync(path.join(H, 'key.pem'), '-----BEGIN fhv-pem-secret-----\n');
fs.writeFileSync(path.join(OUT, 'outside.css'), '/* fhv-outside-secret */\n');
fs.symlinkSync(path.join(OUT, 'outside.css'), path.join(H, 'link-out.css'));
fs.writeFileSync(path.join(H, 'sub', 'data.json'), '{"fhv":"sibling-json"}');
fs.writeFileSync(path.join(H, 'sub', 'ok.css'), '#ok{color:rgb(1,2,3)}');
fs.writeFileSync(path.join(H, 'hostile.html'), `<!doctype html><html><head><meta charset="utf-8"><title>FHV-HOSTILE</title><link rel="stylesheet" href="sub/ok.css"></head><body><p id="ok">ok</p>
<script>window.__inline = 1; window.__eval = eval('6*7');
window.__probe = (async () => {
  const get = async (u) => { try { const r = await fetch(u); return r.status + ':' + (await r.text()).slice(0, 60); } catch (e) { return 'ERR ' + e.name; } };
  return { json: await get('sub/data.json'), env: await get('.env'), pem: await get('key.pem'), link: await get('link-out.css'), up: await get('../hostile/sub/data.json'),
    api: await get('/api/home'), hubAbs: await get(location.origin + '/api/home'), api2: await get('/api/file/content?path=' + encodeURIComponent(${JSON.stringify(path.join(H, 'key.pem'))})) };
})();
try { top.location.href = 'about:blank#fhv-top'; window.__top = 'navigated'; } catch (e) { window.__top = 'THROW ' + e.name; }
</script></body></html>`);
const MAIL_HTML = `<html><head><title>FHV-MAIL</title></head><body><p id="m">FHV-MAIL-BODY</p>
<script>window.__emlPwned = 'inline'; document.title = 'PWNED';</script>
<img id="bad" src="x:nope" onerror="window.__emlPwned = 'handler'">
<script>(function(){var done=false;addEventListener('message',function(e){if(done||e.source!==parent||parent===window)return;var d=e.data;if(!d||d.vsFrameDoc!==1||typeof d.html!=='string')return;done=true;document.open();document.write(d.html);document.close();});})();window.__emlPwned='hostcopy';</script>
<a id="js" href="javascript:window.__emlPwned='jsurl'">link</a>
<img id="remote" src="https://pictures.example/fhv.gif"><img id="inline" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="></body></html>`;
fs.mkdirSync(path.join(FX, 'docx'), { recursive: true }); fs.copyFileSync(path.join(repo, 'scripts/fixtures/docx/hostile.docx'), path.join(FX, 'docx', 'hostile.docx'));
fs.mkdirSync(path.join(FX, 'mail'), { recursive: true });
fs.writeFileSync(path.join(FX, 'mail', 'hostile.eml'), ['From: Member A <a@example.com>', 'To: Member B <b@example.com>', 'Subject: FHV mail', 'Date: Tue, 20 Oct 2026 10:00:00 +0000', 'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="b1"', '', '--b1', 'Content-Type: text/plain; charset=utf-8', '', 'FHV plain body', '--b1', 'Content-Type: text/html; charset=utf-8', '', MAIL_HTML, '--b1--', ''].join('\r\n'));
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64').toString('base64');

// ── a worktree server of THIS tree, signed in ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
execSync('npm run build', { cwd: wt, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: PW }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1400,950',
  '--disable-background-timer-throttling', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [prof, FX, OUT]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

for (let i = 0; i < 120; i++) { try { await fetch(`${BASE}/login`); break; } catch { await sleep(250); } }
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
const sessions = new Map();   // sessionId → { url, alive }
const net = [];               // { sid, url, status?, failed?, blocked? } — every request a FRAME session made
const paused = [];            // remote pictures held by Fetch (Ⓓ)
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)); ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })); });
ws.on('message', async (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Target.attachedToTarget') {
    const sid = m.params.sessionId, ti = m.params.targetInfo;
    sessions.set(sid, { url: ti.url, type: ti.type, alive: true });
    try {
      await send('Runtime.enable', {}, sid); await send('Network.enable', {}, sid);
      await send('Fetch.enable', { patterns: [{ urlPattern: 'https://pictures.example/*', requestStage: 'Request' }] }, sid);
      await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid);
    } catch { }
    if (m.params.waitingForDebugger) send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => { });
    return;
  }
  if (m.method === 'Target.detachedFromTarget') { const s = sessions.get(m.params.sessionId); if (s) s.alive = false; return; }
  if (m.method === 'Target.targetInfoChanged') { for (const s of sessions.values()) if (s.targetId === m.params.targetInfo.targetId) s.url = m.params.targetInfo.url; return; }
  if (!m.sessionId) return;
  if (m.method === 'Network.requestWillBeSent') net.push({ sid: m.sessionId, id: m.params.requestId, url: m.params.request.url });
  if (m.method === 'Network.responseReceived') { const r = net.find((x) => x.sid === m.sessionId && x.id === m.params.requestId); if (r) r.status = m.params.response.status; }
  if (m.method === 'Network.loadingFailed') { const r = net.find((x) => x.sid === m.sessionId && x.id === m.params.requestId); if (r) { r.failed = m.params.errorText; r.blocked = m.params.blockedReason || ''; } }
  if (m.method === 'Fetch.requestPaused') { paused.push(m.params.request.url); send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/gif' }], body: GIF }, m.sessionId).catch(() => { }); }
});
const cdp = (method, params) => send(method, params);
const evalJs = async (expr, sid) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sid);
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
/** The live frame session whose document passes `test` (a JS expression → bool), waiting ≤ ms. */
async function frameWhere(test, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const [sid, s] of sessions) {
      if (!s.alive || s.type === 'page') continue;
      try { if (await evalJs(`(() => { try { return !!(${test}); } catch { return false; } })()`, sid)) return sid; } catch { }
    }
    await sleep(150);
  }
  return null;
}

const HELPERS = `window.__fh = {
  win() { const w = [...app.wm.windows.values()]; return w.length ? w[w.length - 1] : null; },
  el() { return this.win()?.element || null; },
  closeAll() { for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); },
  async openFile(p, name, ready) {
    this.closeAll(); await new Promise((r) => setTimeout(r, 200));
    app.openFile(p, name);
    const t0 = Date.now();
    while (Date.now() - t0 < 30000 && !(this.el() && ready(this.el()))) await new Promise((r) => setTimeout(r, 50));
    if (!(this.el() && ready(this.el()))) throw new Error('never ready: ' + name);
    return true;
  },
  async preview(p, name) {
    await this.openFile(p, name, (el) => [...el.querySelectorAll('button')].some((b) => b.textContent === 'Preview' && b.style.display !== 'none') && !!el.querySelector('.cm-content'));
    [...this.el().querySelectorAll('button')].find((b) => b.textContent === 'Preview').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 10000 && !this.el().querySelector('.markdown-preview iframe')) await new Promise((r) => setTimeout(r, 50));
    const f = this.el().querySelector('.markdown-preview iframe');
    return f ? { sandbox: f.getAttribute('sandbox'), src: f.getAttribute('src'), srcdoc: f.hasAttribute('srcdoc'), kept: typeof f.__frameDoc === 'string' && f.__frameDoc.length } : null;
  },
}; true`;

const P = (...x) => JSON.stringify(path.join(FX, ...x));
const folderReqs = (sid) => net.filter((r) => r.sid === sid && r.url.startsWith(BASE + '/'));
try {
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  // sign in through the login page (the cookie: HttpOnly, SameSite=Lax)
  await cdp('Page.navigate', { url: `${BASE}/login` }); await sleep(800);
  const li = await evalJs(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: ${JSON.stringify(PW)} }) }).then((r) => r.status)`);
  ok(li === 200, 'signed in on the scratch hub (a password instance: the frame host is behind the cookie)', li);
  await cdp('Page.navigate', { url: `${BASE}/` });
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 30000) return rej(new Error("no app after 30s")); setTimeout(w, 200); })(); })');
  await sleep(500);
  await evalJs(HELPERS);

  // ── Ⓐ the repo's own pages ──
  console.log('Ⓐ the code editor previews the repo\'s own pages — an opaque frame, its folder through the host');
  const PAGES = [
    ['split-ux', 'A.html', "getComputedStyle(document.documentElement).getPropertyValue('--bg-workspace').trim() === '#111122'", 'its _base.css (the tokens on :root)'],
    ['integrations', 'account-card.html', "getComputedStyle(document.documentElement).getPropertyValue('--bg-workspace').trim() === '#111122'", 'its mockup.css'],
    ['comm-panel', 'direction-a.html', "document.documentElement.getAttribute('data-theme') === 'dark' && document.body.querySelectorAll('*').length > 40", 'its MODULE script (directions.js built the frame) + frame.css'],
    ['slack-relay', 'index.html', "document.getElementById('nothing') && document.getElementById('nothing').hidden === false", 'its relay.js (no state ⇒ the "start from VibeSpace" note)'],
  ];
  for (const [dir, file, effect, what] of PAGES) {
    const el = await evalJs(`__fh.preview(${P(dir, file)}, ${JSON.stringify(file)})`);
    const sid = await frameWhere(`location.pathname.startsWith('/frame-host/f/') && (${effect})`);
    ok(el && el.sandbox === 'allow-scripts' && !el.srcdoc && el.src === `/frame-host?kind=preview&base=${encodeURIComponent(path.join(FX, dir))}` && el.kept > 0, `${dir}/${file}: the frame is sandbox="allow-scripts" (no allow-same-origin), no srcdoc, at the host's preview address with its folder`, el);
    if (!ok(!!sid, `${dir}/${file}: the page RAN at its folder's address — ${what}`)) continue;
    const inside = await evalJs(`({ origin: self.origin, url: location.href, cookie: (() => { try { return document.cookie; } catch (e) { return 'THROW ' + e.name; } })(), ls: (() => { try { localStorage.setItem('x', '1'); return 'ok'; } catch (e) { return 'THROW ' + e.name; } })(), parentDoc: (() => { try { return String(!!parent.document); } catch (e) { return 'THROW ' + e.name; } })() })`, sid);
    ok(inside.origin === 'null' && /^THROW/.test(inside.cookie) && /^THROW/.test(inside.ls) && /^THROW/.test(inside.parentDoc) && /^http:\/\/127\.0\.0\.1:\d+\/frame-host\/f\/[A-Za-z0-9_-]{24}\/$/.test(inside.url), `${dir}/${file}: an opaque origin — no cookie, no storage, no parent document; its URL is the folder's (/frame-host/f/<token>/)`, inside);
    await sleep(400);
    const reqs = folderReqs(sid);
    const files = reqs.filter((r) => r.url.startsWith(inside.url) && r.url !== inside.url), hub = reqs.filter((r) => !r.url.startsWith(inside.url) && !r.url.startsWith(BASE + '/frame-host?'));
    ok(files.length > 0 && files.every((r) => r.status === 200), `${dir}/${file}: every file it asked of its folder (${[...new Set(files.map((r) => r.url.slice(inside.url.length)))].join(', ')}) answered 200 at the folder's address`, files.filter((r) => r.status !== 200));
    ok(hub.every((r) => r.status === undefined && r.blocked === 'csp'), `${dir}/${file}: what it asked of the HUB itself (${hub.length ? [...new Set(hub.map((r) => r.url.slice(BASE.length)))].join(', ') : 'nothing'}) was blocked by the preview policy, never fetched`, hub.filter((r) => r.blocked !== 'csp'));
  }

  // ── Ⓑ the app's own page ──
  console.log('Ⓑ public/index.html previewed — the hub\'s own files are not the preview\'s');
  {
    await evalJs(`__fh.preview(${P('app', 'index.html')}, 'index.html')`);
    const sid = await frameWhere(`location.pathname.startsWith('/frame-host/f/') && document.title === 'VibeSpace'`);
    ok(!!sid, 'the app\'s page is shown in the preview frame (its title)');
    if (sid) {
      await sleep(1200);
      const inside = await evalJs(`({ app: typeof window.app, sheets: document.styleSheets.length, url: location.href })`, sid);
      const hub = net.filter((r) => r.sid === sid && r.url.startsWith(BASE + '/') && !r.url.startsWith(inside.url) && !r.url.startsWith(BASE + '/frame-host?'));
      ok(inside.app === 'undefined' && hub.length >= 7 && hub.every((r) => r.status === undefined && r.blocked === 'csp'), `its /style.css, /dist/… are the HUB's: ${hub.length} request(s), every one blocked by the preview policy before it left (never fetched); the app did not boot inside`, { app: inside.app, hub: hub.map((r) => [r.url.slice(BASE.length), r.status, r.blocked]) });
    }
  }

  // ── Ⓒ a hostile preview ──
  console.log('Ⓒ a hostile page in the preview');
  {
    await evalJs(`__fh.preview(${P('hostile', 'hostile.html')}, 'hostile.html')`);
    const sid = await frameWhere(`document.title === 'FHV-HOSTILE' && window.__probe`);
    if (ok(!!sid, 'the hostile page runs in the preview frame')) {
      const r = await evalJs(`window.__probe.then((p) => ({ ...p, inline: window.__inline, ev: window.__eval, top: window.__top, ok: getComputedStyle(document.getElementById('ok')).color }))`, sid);
      ok(r.inline === 1 && r.ev === 42 && r.ok === 'rgb(1, 2, 3)' && r.json === '200:{"fhv":"sibling-json"}', 'its own inline script and eval run; its sibling stylesheet applies; fetch() of a sibling json answers (CORS from the opaque frame)', r);
      ok(/^404:/.test(r.env) && /^404:/.test(r.pem) && /^404:/.test(r.link) && !/secret/.test(JSON.stringify(r)), 'the folder\'s .env, key.pem (not a web file) and a symlink OUT of the folder ⇒ 404 — never their bytes', { env: r.env, pem: r.pem, link: r.link });
      ok(/^(404:|ERR)/.test(r.up) && !/sibling-json/.test(r.up), 'a ../ path out of the folder never answers', r.up);
      ok(r.api === 'ERR TypeError' && r.hubAbs === 'ERR TypeError' && r.api2 === 'ERR TypeError', 'the hub\'s /api (relative, absolute, the file-content route on the key) ⇒ refused by the policy before it leaves', { api: r.api, hubAbs: r.hubAbs, api2: r.api2 });
      const top = await evalJs('location.href');
      ok(!/fhv-top/.test(top), 'the top page was not navigated by the preview', { top, inFrame: r.top });
    }
  }

  // ── Ⓓ the .eml body ──
  console.log('Ⓓ an .eml\'s HTML body — nothing of the mail runs; remote pictures after the press');
  {
    await evalJs(`__fh.openFile(${P('mail', 'hostile.eml')}, 'hostile.eml', (el) => !!el.querySelector('.eml-html-frame'))`);
    const el = await evalJs(`(() => { const f = __fh.el().querySelector('.eml-html-frame'); return { sandbox: f.getAttribute('sandbox'), src: f.getAttribute('src'), srcdoc: f.hasAttribute('srcdoc'), kept: (f.__frameDoc || '').includes('FHV-MAIL-BODY'), pics: !!__fh.el().querySelector('.eml-pictures') }; })()`);
    ok(el.sandbox === 'allow-scripts' && el.src === '/frame-host?kind=eml' && !el.srcdoc && el.kept && el.pics, 'the mail frame is at the host\'s eml address, no srcdoc (the host\'s line is its only script); "Show pictures" is offered', el);
    const sid = await frameWhere(`document.getElementById('m') && document.getElementById('m').textContent === 'FHV-MAIL-BODY'`);
    if (ok(!!sid, 'the mail body is shown')) {
      await evalJs(`document.getElementById('js').click(); true`, sid);
      await sleep(600);
      const r = await evalJs(`({ pwned: window.__emlPwned === undefined ? null : window.__emlPwned, title: document.title, remote: document.getElementById('remote').naturalWidth, inline: document.getElementById('inline').naturalWidth, origin: self.origin })`, sid);
      ok(r.pwned === null && r.title === 'FHV-MAIL', 'nothing ran: the inline script, the onerror handler, a byte-exact copy of the host\'s own line, a javascript: link (clicked)', r);
      ok(r.inline === 1 && r.remote === 0 && paused.length === 0 && r.origin === 'null', 'the data: picture shows; the remote one is not even requested (no request left the frame)', { r, paused });
      await evalJs(`__fh.el().querySelector('.eml-pictures').click(); true`);
      const sid2 = await frameWhere(`document.getElementById('remote') && document.getElementById('remote').naturalWidth === 1`, 10000);
      const src2 = await evalJs(`__fh.el().querySelector('.eml-html-frame').getAttribute('src')`);
      ok(!!sid2 && src2 === '/frame-host?kind=eml&pictures=1' && paused.some((u) => u === 'https://pictures.example/fhv.gif'), 'after "Show pictures" the frame is the host\'s eml address WITH pictures and the remote picture loads', { src2, paused });
      if (sid2) { const p2 = await evalJs(`window.__emlPwned === undefined ? null : window.__emlPwned`, sid2); ok(p2 === null, '…and still nothing of the mail ran', p2); }
    }
  }

  // ── Ⓓ2 a Word document's embedded HTML ──
  console.log('Ⓓ2 a Word document\'s embedded HTML (altChunk) — the host\'s docx kind');
  {
    await evalJs(`__fh.openFile(${P('docx', 'hostile.docx')}, 'hostile.docx', (el) => { const sr = el.querySelector('.docx-host')?.shadowRoot; return !!(sr && sr.querySelector('iframe.docx-altchunk')); })`);
    const el = await evalJs(`(() => { const f = __fh.el().querySelector('.docx-host').shadowRoot.querySelector('iframe.docx-altchunk'); return { sandbox: f.getAttribute('sandbox'), src: f.getAttribute('src'), srcdoc: f.hasAttribute('srcdoc') }; })()`);
    const sid = await frameWhere(`document.body && document.body.textContent.includes('ALTCHUNK-TEXT')`);
    ok(el.sandbox === 'allow-scripts' && el.src === '/frame-host?kind=docx' && !el.srcdoc && !!sid, 'the altChunk is written in a frame at the host\'s docx address (no srcdoc) and its text is shown', el);
    if (sid) { const r = await evalJs(`({ origin: self.origin, scripts: document.scripts.length })`, sid); const top = await evalJs('window.__docxPwned ?? null'); ok(r.origin === 'null' && top === null, 'its script and handler ran nowhere (the page\'s __docxPwned untouched; an opaque origin)', { ...r, top }); }
  }

  // ── Ⓔ CONTROL: the old preview shape ──
  console.log('Ⓔ CONTROL — the OLD preview (srcdoc + allow-same-origin) of the same hostile page');
  {
    const html = fs.readFileSync(path.join(H, 'hostile.html'), 'utf8').replace('FHV-HOSTILE', 'FHV-CONTROL');
    await evalJs(`(() => { const f = document.createElement('iframe'); f.id = 'fhv-control'; f.setAttribute('sandbox', 'allow-scripts allow-same-origin'); f.style.cssText = 'position:fixed;left:-3000px;width:300px;height:200px'; f.srcdoc = ${JSON.stringify(html)}; document.body.appendChild(f); return true; })()`);
    await sleep(1500);
    const c = await evalJs(`(async () => { const w = document.getElementById('fhv-control').contentWindow; const p = w.__probe ? await w.__probe : null; return { origin: w.origin, p }; })()`);
    ok(c.origin === new URL(BASE).origin && c.p && /^200:/.test(c.p.api), 'CONTROL: the old shape runs AS THE APP — the app\'s origin, and the hub\'s /api answers it with the owner\'s cookie', { origin: c.origin, api: c.p && c.p.api });
    const taken = await takeCspReports((r) => r.document === 'about', { ms: 3000, want: Infinity });
    ok(taken.length > 0, `CONTROL: the app page's policy reports the old shape's page (${taken.length} report(s), taken — the teardown judges the rest)`, taken.slice(0, 3));
    await evalJs(`document.getElementById('fhv-control').remove(); true`);
  }
} catch (e) {
  fail++; console.error('  ✗ the suite threw: ' + (e && e.stack || e));
}
console.log(`\n  (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exitCode = fail ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 300);
