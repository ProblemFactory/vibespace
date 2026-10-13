#!/usr/bin/env node
// THE MINT IN THE DIALOG, IN CHROME (lane oat-mint-flow, owner 2026-10-13):
// the REAL Manage Agents `_oatDialog` (esbuild of src/lib/manage-agents.js)
// against the REAL mint routes + ORCH (src/server/oat-mint.js) over the FAKE
// claude (scripts/fixtures/oat-mint/fake-claude) and the REAL AccountManager,
// the WS `oat-mint` broadcast to two pages. Legs: press → the link + the code
// field, the dialog STAYS OPEN; a second page shows the same phase live;
// paste a code → 已保存 on both pages → closes itself → reopened: the Active
// line; the zero-copy button (a hub browser profile exists) points the
// profile's tab at the localhost-callback URL; Esc on a running sign-in asks,
// then cancels (the CLI gone); oat-verify F1: nothing proves whose token it is
// ⇒ the pick (the ruling's zh sentence + the rows + 保存 / 不保存), another
// account's sign-in ⇒ 这把 token 属于 …；没有保存; phone 390 fits. PNGs (zh):
// link / code / saved / confirm / mismatch at desk 1100, phone at 390 →
// $OAT_PNG_DIR or the scratch dir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePort, ONBOARDED_SOURCE } from './scratch.mjs';
import { fakeClaudeCmd } from './fixtures/oat-mint/fake-wrap.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!CHROME) { console.log('SKIP: no chrome binary on this machine (looked in /usr/bin/google-chrome{,-stable}, /usr/bin/chromium{,-browser})'); process.exit(0); }
const TOKEN = ['sk', '-ant-oat01-UIdummy_'].join('') + 'Zx9Yw8Vu7Ts6'.repeat(7) + '-q';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oatui-'));
const PNG = process.env.OAT_PNG_DIR || dir;
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const O = require(path.join(REPO, 'src/server/oat-mint.js'));
const express = require(path.join(REPO, 'node_modules/express'));
const { WebSocketServer } = require(path.join(REPO, 'node_modules/ws'));
const WS = require(path.join(REPO, 'node_modules/ws'));
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const am = new AccountManager({ dataDir: path.join(dir, 'data') });
const acct = am.createSubscription({ name: 'Work Max' }).id;
am.createSubscription({ name: 'Home Pro' });
am.setEmail(acct, 'work@example.com');
// what the fake CLI writes into its scratch config at sign-in (the ORCH's F1 proof) — rewritten per leg
const identFile = path.join(dir, 'identity.json');
fs.writeFileSync(identFile, JSON.stringify({ emailAddress: 'work@example.com' }));
const rec = path.join(dir, 'fake.jsonl');
const scratch = path.join(dir, 'mints'); fs.mkdirSync(scratch);
let chrome = null, srv = null, mint = null;
try {
  // ── the page: the real dialog, a WS shim, stubbed hub-browser door ──────
  const stubBuildVersion = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
  const entry = `import { installManageAgents } from './manage-agents.js';
class App {}
installManageAgents(App, {});
const app = new App();
const hs = [];
app.ws = { onGlobal(h) { hs.push(h); return () => { const i = hs.indexOf(h); if (i >= 0) hs.splice(i, 1); }; } };
const sock = new WebSocket(location.origin.replace('http', 'ws') + '/ws');
sock.onmessage = (e) => { const m = JSON.parse(e.data); window.__casts.push(m); for (const h of [...hs]) h(m); };
window.__casts = []; window.__browsed = []; window.__refreshes = 0;
app.browseYourself = (pid, o) => { window.__browsed.push({ pid, label: o && o.label }); return null; };
window.openOat = async () => { const a = await (await fetch('/api/test/account')).json(); app._oatDialog(a.id, a, () => { window.__refreshes++; }); };
window.wsReady = () => sock.readyState === 1;`;
  await esbuild.build({ stdin: { contents: entry, resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'oat-entry.js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: path.join(dir, 'www/oat.js'), logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stubBuildVersion] });
  fs.copyFileSync(path.join(REPO, 'public/style.css'), path.join(dir, 'www/style.css'));
  fs.writeFileSync(path.join(dir, 'www/index.html'), '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><script>localStorage.setItem("vibespace.lang","zh")</' + 'script><script src="/oat.js"></' + 'script></body></html>');
  // ── the hub: real routes + ORCH over the fake CLI; browser door stubbed ──
  const app = express(); app.use(express.json());
  const navs = [];
  srv = http.createServer(app);
  const wss = new WebSocketServer({ server: srv, path: '/ws' });
  const broadcastAll = (m) => { const j = JSON.stringify(m); for (const c of wss.clients) { try { c.send(j); } catch { } } };
  mint = O.create({ accounts: am, claudeCmd: fakeClaudeCmd(dir, { TOKEN, RECORD: rec, IDENTITY_FILE: identFile }), env: process.env, tmpRoot: scratch, broadcastAll, log: () => { } });
  O.registerMintRoutes(app, { mint, isAgentBearer: (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String(req.headers.authorization || '')) });
  app.get('/api/test/account', (req, res) => { const a = am.get(acct); res.json({ id: acct, name: a.name, oat: !!a.oatEnc, oatDaysLeft: a.oatEnc ? 365 : null }); });
  app.get('/api/browser/profiles', (req, res) => res.json([{ id: 'bp-ab12', label: 'Personal' }]));
  app.post('/api/browser/profiles/:id/browse', (req, res) => res.json({ ok: true, profileId: req.params.id, key: 'hu-ab12', how: 'open', fresh: 'f1' }));
  app.post('/api/browser/browse/:key/navigate', (req, res) => { navs.push({ key: req.params.key, url: req.body && req.body.url }); res.json({ ok: true }); });
  app.use(express.static(path.join(dir, 'www')));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  // ── chrome: scratch profile, private HOME + XDG_RUNTIME_DIR, headless ────
  const CDP_PORT = await freePort();
  const home = path.join(dir, 'home'), xdg = path.join(dir, 'xdg'); fs.mkdirSync(home); fs.mkdirSync(xdg, { mode: 0o700 });
  const env = { ...process.env, HOME: home, XDG_RUNTIME_DIR: xdg }; delete env.DISPLAY; delete env.WAYLAND_DISPLAY;
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP_PORT, '--no-first-run', '--disable-gpu', '--window-size=1100,820', '--user-data-dir=' + path.join(dir, 'chrome'), 'about:blank'], { stdio: 'ignore', env });
  const race = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + ' timed out after ' + ms + 'ms')), ms); if (t.unref) t.unref(); })]);
  let list = null;
  for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json')).json(); if (l.some((t) => t.type === 'page')) list = l; } catch { await sleep(200); } }
  if (!list) throw new Error('chrome never came up on the devtools port');
  const connect = async (target) => {
    const sock = new WS(target.webSocketDebuggerUrl);
    await race(new Promise((res, rej) => { sock.on('open', res); sock.on('error', rej); }), 15000, 'devtools socket');
    let seq = 0; const pend = new Map(); const errors = [];
    sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.exception?.description || 'exception'); });
    const cdp = (method, params = {}) => race(new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); }), 30000, 'CDP ' + method);
    const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'threw'); return r.result.value; };
    const waitFor = async (e, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(e)) return true; await sleep(60); } return false; };
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1100, height: 820, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: ORIGIN + '/' });
    await waitFor('typeof window.openOat === "function" && window.wsReady()');
    const shot = async (file) => { const s = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(PNG, file), Buffer.from(s.data, 'base64')); };
    return { cdp, ev, waitFor, shot, errors, close: () => sock.close() };
  };
  const tB = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/new?about:blank', { method: 'PUT' })).json();
  const A = await connect(list.find((t) => t.type === 'page'));
  const B = await connect(tB);
  const phase = (P) => P.ev('document.querySelector("#oat-mint")?.dataset.phase || null');
  const fakeFacts = () => (fs.existsSync(rec) ? fs.readFileSync(rec, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

  console.log('§1 press → the link, the dialog stays open (zh, desk 1100)');
  await A.ev('openOat()');
  ok(await A.waitFor('document.querySelector("#oat-run")?.textContent === "开始：在浏览器里登录"'), 'the start button reads 开始：在浏览器里登录');
  await A.ev('document.querySelector("#oat-run").click()');
  ok(await A.waitFor('document.querySelector("#oat-mint")?.dataset.phase === "waiting-code"'), 'phase waiting-code reached', await phase(A));
  ok(await A.ev('!!document.querySelector("#oat-dialog")'), 'the dialog is STILL OPEN (no terminal, no close)');
  const href = await A.ev('document.querySelector("#oat-open")?.href');
  ok(/^https:\/\/claude\.example\/cai\/oauth\/authorize\?/.test(href || '') && await A.ev('document.querySelector("#oat-open").target === "_blank"'), 'the sign-in link opens the CLI\'s URL in a new tab', href);
  ok(await A.ev('document.querySelector(".oat-who")?.textContent') === '请以“Work Max”身份登录', 'the bold who-line: 请以“Work Max”身份登录');
  ok(await A.ev('document.querySelector("label.oat-code-label")?.textContent') === '如果页面给了你一串登录码，粘到这里', 'the code field: 如果页面给了你一串登录码，粘到这里');
  ok(await A.waitFor('!document.querySelector("#oat-hub-row")?.hidden && /Personal/.test(document.querySelector("#oat-hub-row").textContent)'), 'a hub browser profile exists ⇒ 在 VibeSpace 的浏览器里登录, naming the profile');
  ok(await A.ev('!document.querySelector(".oat-manual").open'), 'the manual paste is collapsed (另一种方式)');
  await A.shot('link.png');

  console.log('§2 a second page follows the same mint');
  await B.ev('openOat()');
  ok(await B.waitFor('document.querySelector("#oat-mint")?.dataset.phase === "waiting-code"'), 'a dialog opened on another page shows the LIVE phase (waiting-code)', await phase(B));

  console.log('§3 paste the code → 已保存 → the Active line');
  await A.ev('(() => { const i = document.querySelector("#oat-code"); i.value = "fakecode123#FAKESTATE"; i.dispatchEvent(new Event("input")); })()');
  await A.shot('code.png');
  await A.ev('document.querySelector("#oat-send").click()');
  ok(await A.waitFor('document.querySelector("#oat-mint")?.dataset.phase === "saved"'), 'phase saved', await phase(A));
  ok(await A.ev('document.querySelector(".oat-saved")?.textContent') === '✓ 已保存 · 有效 1 年', 'the words: ✓ 已保存 · 有效 1 年');
  await A.shot('saved.png');
  ok(await B.waitFor('document.querySelector("#oat-mint")?.dataset.phase === "saved"'), 'the second page shows 已保存 too (WS oat-mint)');
  ok(am.getOat(acct) === TOKEN, 'the token is in the store');
  ok(fakeFacts().some((f) => f.code === 'fakecode123#FAKESTATE'), 'the code reached the CLI');
  ok(await A.ev('window.__refreshes') >= 1, 'the roster refresh ran');
  ok(await A.waitFor('!document.querySelector("#oat-dialog")', 4000), 'the dialog closed itself (2 s)');
  const casts = JSON.stringify(await A.ev('window.__casts'));
  ok(!casts.includes(TOKEN.slice(13, 40)) && !(await A.ev('document.documentElement.outerHTML')).includes(TOKEN.slice(13, 40)), 'the token never reached the page (WS frames + DOM)');
  await A.ev('openOat()');
  ok(await A.waitFor('/365/.test(document.querySelector("#oat-active")?.textContent || "")'), 'reopened: the Active line (365 days)', await A.ev('document.querySelector("#oat-active")?.textContent'));
  await A.ev('document.querySelector("#oat-dialog .dialog-close")?.click()');

  console.log('§4 zero-copy: the hub browser profile');
  await A.ev('openOat()'); await A.waitFor('!!document.querySelector("#oat-run")');
  await A.ev('document.querySelector("#oat-run").click()');
  await A.waitFor('document.querySelector("#oat-mint")?.dataset.phase === "waiting-code" && !document.querySelector("#oat-hub-row").hidden');
  await A.ev('document.querySelector("#oat-hub").click()');
  await A.waitFor('window.__browsed.length > 0');
  const live = mint.forAccount(acct);
  ok(navs.length === 1 && navs[0].key === 'hu-ab12' && navs[0].url === live.localUrl && /redirect_uri=http%3A%2F%2Flocalhost/.test(live.localUrl), 'the profile\'s tab is pointed at the $BROWSER URL (localhost callback on the hub)', navs);
  ok((await A.ev('window.__browsed'))[0]?.pid === 'bp-ab12', 'the live view of that profile opens');

  console.log('§5 Esc on a running sign-in asks, then cancels');
  const pid = fakeFacts().filter((f) => !f.code).pop().pid;
  await A.ev('document.querySelector("#oat-dialog").closest(".modal-overlay, .dialog-overlay")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })) ?? document.querySelector("#oat-dialog").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
  ok(await A.waitFor('[...document.querySelectorAll(".btn-create.danger")].some((b) => !b.closest("#oat-dialog"))'), 'Esc asks first (取消登录？)');
  ok(mint.forAccount(acct).phase === 'waiting-code', '… nothing cancelled before the answer');
  await A.ev('[...document.querySelectorAll(".btn-create.danger")].filter((b) => !b.closest("#oat-dialog")).pop().click()');
  ok(await A.waitFor('!document.querySelector("#oat-dialog")'), 'confirmed → the dialog closes');
  await sleep(300);
  let alive = true; try { process.kill(pid, 0); } catch { alive = false; }
  ok(mint.forAccount(acct).phase === 'cancelled' && !alive, 'the mint is cancelled and the CLI is gone', { phase: mint.forAccount(acct).phase, alive });

  console.log('§5b whose token: the pick, then another account\'s sign-in refused (oat-verify F1)');
  const mintTo = async (codeVal) => {
    await A.ev('openOat()'); await A.waitFor('!!document.querySelector("#oat-run")');
    await A.ev('document.querySelector("#oat-run").click()');
    await A.waitFor('document.querySelector("#oat-mint")?.dataset.phase === "waiting-code"');
    await A.ev(`(() => { const i = document.querySelector("#oat-code"); i.value = ${JSON.stringify(codeVal)}; i.dispatchEvent(new Event("input")); })()`);
    await A.ev('document.querySelector("#oat-send").click()');
  };
  am.clearOat(acct);
  fs.writeFileSync(identFile, ''); // CLI 2.1.296: setup-token leaves no identity
  await mintTo('pickcode#S1');
  ok(await A.waitFor('document.querySelector("#oat-mint")?.dataset.phase === "confirm"'), 'no proof ⇒ phase confirm (nothing saved)', await phase(A));
  ok(await A.ev('document.querySelector(".oat-confirm-q")?.textContent') === 'CLI 的 setup-token 不记录登录的是哪个账号，无法自动核对。你刚在浏览器里登录的是哪个账号？', 'the ruling\'s sentence: CLI 的 setup-token 不记录登录的是哪个账号…');
  const opts = await A.ev('[...document.querySelectorAll("#oat-pick option")].map((o) => [o.textContent, o.selected])');
  ok(JSON.stringify(opts) === JSON.stringify([['Work Max', true], ['Home Pro', false]]), 'the picker lists the subscription rows, the dialog\'s row preselected', opts);
  ok(await A.ev('document.querySelector("#oat-keep")?.textContent') === '保存' && await A.ev('document.querySelector("#oat-drop")?.textContent') === '不保存' && !am.getOat(acct), '保存 / 不保存; nothing stored before the answer');
  ok(!(await A.ev('document.documentElement.outerHTML')).includes(TOKEN.slice(13, 40)), 'the held token is not on the page');
  await A.cdp('Page.bringToFront'); await sleep(150);
  await A.shot('confirm.png');
  await A.ev('document.querySelector("#oat-keep").click()');
  ok(await A.waitFor('document.querySelector("#oat-mint")?.dataset.phase === "saved"') && am.getOat(acct) === TOKEN, '保存 ⇒ saved under the picked row');
  await A.waitFor('!document.querySelector("#oat-dialog")', 4000);
  am.clearOat(acct);
  fs.writeFileSync(identFile, JSON.stringify({ emailAddress: 'someone-else@example.com' }));
  await mintTo('othercode#S2');
  ok(await A.waitFor('document.querySelector("#oat-mint")?.dataset.phase === "failed"'), "another account's sign-in ⇒ failed", await phase(A));
  ok(await A.ev('document.querySelector(".oat-failed")?.textContent') === '这把 token 属于 someone-else@example.com，不是 Work Max；没有保存' && !am.getOat(acct), 'the words: 这把 token 属于 someone-else@example.com，不是 Work Max；没有保存 — nothing stored', await A.ev('document.querySelector(".oat-failed")?.textContent'));
  await A.shot('mismatch.png');
  await A.ev('document.querySelector("#oat-dialog .dialog-close")?.click()');
  fs.writeFileSync(identFile, JSON.stringify({ emailAddress: 'work@example.com' }));

  console.log('§6 phone 390');
  await A.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  await A.ev('openOat()'); await A.waitFor('!!document.querySelector("#oat-run")');
  await A.ev('document.querySelector("#oat-run").click()');
  await A.waitFor('document.querySelector("#oat-mint")?.dataset.phase === "waiting-code"');
  const fit = await A.ev('(() => { const d = document.querySelector("#oat-dialog").getBoundingClientRect(); const s = document.querySelector("#oat-send").getBoundingClientRect(); return { vw: innerWidth, left: d.left, right: d.right, sw: document.documentElement.scrollWidth, sendRight: s.right }; })()');
  ok(fit.vw === 390 && fit.left >= 0 && fit.right <= 390 && fit.sw <= 390 && fit.sendRight <= 390, 'the dialog fits 390 (no sideways scroll; Send on screen)', fit);
  await A.shot('phone.png');
  ok(A.errors.length === 0 && B.errors.length === 0, 'no page exceptions', [...A.errors, ...B.errors]);
  A.close(); B.close();
} catch (e) { fail++; console.log('  ✗ ' + (e && e.stack || e)); }
finally {
  try { mint && mint.stopAll(); } catch { }
  try { chrome && chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.close(); } catch { }
  await sleep(200);
  ok(fs.readdirSync(scratch).length === 0, 'every mint\'s scratch dir is gone');
  console.log('PNGs: ' + PNG);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\ntest-oat-mint-ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
