#!/usr/bin/env node
// THE GUIDED DOOR, IN CHROME (lane oat-add-door, 2.369.399 — the owner, 2026-11-13): the REAL guide (esbuild of
// src/lib/oat-shape-dialog.js) and the REAL row chip (src/lib/manage-agents.js loginExpiryChipHtml) against the REAL routes
// (src/server/oat-shape-routes.js) and the REAL AccountManager on a scratch data dir; the plan values the 2.1.321 binary states
// (read by the catalog reader — handed in here), the mint's scopes from the shipped fixture. zh throughout. Legs:
//   §1 a pasted token with no type: the row says 「还差订阅类型：登录一次，或自己选」 and its chip opens the guide
//   §2 the guide: way ① 「登录一次（推荐）」 FIRST, way ② 「我自己选」 below it with the stake line and the choices in order
//   §3 «先不选»: saved as the person's, the file written with no type, the row 「未选订阅类型 · 默认 Sonnet」
//   §4 the row's door again: the choice shown, changed to Ultra — the file follows
//   §5 way ①: the row's own sign-in is what it calls
//   §6 a SIGN-IN states the type: shown, not re-chosen; the replaced choice said
//   §7 a CLI whose values were not read: way ① alone, and why
//   §8 phone 390 fits · no page exception
// PNGs (zh) → $OAT_PNG_DIR or the scratch dir: guide / typeless-row / changed / from-login / not-offered / phone.
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
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!CHROME) { console.log('SKIP: no chrome binary on this machine (looked in /usr/bin/google-chrome{,-stable}, /usr/bin/chromium{,-browser})'); process.exit(0); }
const OAT = ['sk', '-ant-oat01-'].join('') + 'DOORfake_' + 'm4N8'.repeat(12) + '-zz';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oatdoor-'));
const PNG = process.env.OAT_PNG_DIR || dir;
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { registerOatShapeRoutes } = require(path.join(REPO, 'src/server/oat-shape-routes.js'));
const express = require(path.join(REPO, 'node_modules/express'));
const WS = require(path.join(REPO, 'node_modules/ws'));
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const am = new AccountManager({ dataDir: path.join(dir, 'data'), platform: 'linux' });
const acct = am.createSubscription({ name: 'Token Max' }).id;
const acct2 = am.createSubscription({ name: 'Token Two' }).id;
am.noteCliVersion('2.1.321 (Claude Code)');
const CAT = { cli: '2.1.321', anchor: true, types: ['max', 'pro', 'enterprise', 'team'], orgTypes: {}, tiers: ['default_claude_max_20x', 'default_claude_max_5x'], withheld: ['default_claude_zero'] };
let PL = CAT;
const cred = (id) => { try { return JSON.parse(fs.readFileSync(path.join(am.subDir(id), '.credentials.json'), 'utf8')).claudeAiOauth; } catch { return null; } };
let chrome = null, srv = null;
try {
  await am.oatFileSettled();
  am.setOat(acct, OAT); am.setOat(acct2, OAT.replace('DOORfake_', 'DOORfak2_')); await am.oatFileSettled();
  const stub = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
  const entry = `import { openOatShapeDialog } from './oat-shape-dialog.js';
import { loginExpiryChipHtml } from './manage-agents.js';
window.__signins = 0; window.__refreshes = 0;
window.rowOf = async (id) => (await (await fetch('/api/accounts')).json()).accounts.find((a) => a.id === id);
window.chip = async (id) => { const r = await window.rowOf(id); const box = document.querySelector('#chip'); box.innerHTML = loginExpiryChipHtml(r, { local: true }); const c = box.querySelector('.acct-login-chip'); if (c) c.onclick = () => { if (c.dataset.oatShape) window.openShape(c.dataset.oatShape); }; return box.textContent; };
window.openShape = async (id, fresh = false) => { const r = await window.rowOf(id); openOatShapeDialog({ id: r.id, name: r.name, fresh, onSignIn: () => { window.__signins++; }, refresh: () => { window.__refreshes++; } }); };
window.ready = true;`;
  await esbuild.build({ stdin: { contents: entry, resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'door-entry.js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: path.join(dir, 'www/door.js'), logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stub] });
  fs.copyFileSync(path.join(REPO, 'public/style.css'), path.join(dir, 'www/style.css'));
  fs.writeFileSync(path.join(dir, 'www/index.html'), '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="chip" style="padding:12px"></div><script>localStorage.setItem("vibespace.lang","zh")</' + 'script><script src="/door.js"></' + 'script></body></html>');
  const app = express(); app.use(express.json());
  app.get('/api/accounts', (req, res) => res.json(am.list()));
  registerOatShapeRoutes(app, { accounts: am, isAgentBearer: (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String(req.headers.authorization || '')), plans: () => PL });
  app.use(express.static(path.join(dir, 'www')));
  srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const CDP_PORT = await freePort();
  const home = path.join(dir, 'home'), xdg = path.join(dir, 'xdg'); fs.mkdirSync(home); fs.mkdirSync(xdg, { mode: 0o700 });
  const env = { ...process.env, HOME: home, XDG_RUNTIME_DIR: xdg }; delete env.DISPLAY; delete env.WAYLAND_DISPLAY; delete env.DBUS_SESSION_BUS_ADDRESS;
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP_PORT, '--no-first-run', '--disable-gpu', '--password-store=basic', '--window-size=1100,820', '--user-data-dir=' + path.join(dir, 'chrome'), 'about:blank'], { stdio: 'ignore', env });
  const race = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + ' timed out after ' + ms + 'ms')), ms); if (t.unref) t.unref(); })]);
  let list = null;
  for (let i = 0; i < 80 && !list; i++) { try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json')).json(); if (l.some((t) => t.type === 'page')) list = l; } catch { await sleep(200); } }
  if (!list) throw new Error('chrome never came up on the devtools port');
  const target = list.find((t) => t.type === 'page');
  const sock = new WS(target.webSocketDebuggerUrl);
  await race(new Promise((res, rej) => { sock.on('open', res); sock.on('error', rej); }), 15000, 'devtools socket');
  let seq = 0; const pend = new Map(); const errors = [];
  sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params?.exceptionDetails?.exception?.description || 'exception'); });
  const cdp = (method, params = {}) => race(new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(JSON.stringify({ id, method, params })); }), 30000, 'CDP ' + method);
  const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'threw'); return r.result.value; };
  const waitFor = async (e, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(e)) return true; await sleep(60); } return false; };
  const shot = async (file) => { const s = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(PNG, file), Buffer.from(s.data, 'base64')); };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1100, height: 820, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: ORIGIN + '/' });
  await waitFor('window.ready === true');
  const J = (x) => JSON.stringify(x);
  const dlg = '#oat-shape-dialog';
  const labels = `[...document.querySelectorAll("${dlg} .oat-shape-choice")].map((l) => l.textContent.replace(/\\s+/g, " ").trim())`;
  const closed = () => waitFor(`!document.querySelector("${dlg}")`, 5000);

  console.log('§1 a pasted token with no type');
  const t1 = await ev(`chip(${J(acct)})`);
  ok(/还差订阅类型：登录一次，或自己选/.test(t1) && await ev('!!document.querySelector("#chip [data-oat-shape]")'), 'the row: 「还差订阅类型：登录一次，或自己选」 — and its chip carries the guided door', t1);
  await ev('document.querySelector("#chip [data-oat-shape]").click()');
  ok(await waitFor(`!!document.querySelector("${dlg} #oat-shape-pick")`), 'the chip opens the guide with way ② offered');
  await ev(`document.querySelector("${dlg} .dialog-close")?.click()`); await closed();

  console.log('§2 the guide');
  await ev(`openShape(${J(acct)}, true)`); await waitFor(`!!document.querySelector("${dlg} #oat-shape-pick")`);
  const g = await ev(`(() => { const d = document.querySelector("${dlg}"); const sign = d.querySelector("#oat-shape-signin"), pick = d.querySelector(".oat-shape-head"); return { lead: d.querySelector(".usage-note").textContent, sign: sign.textContent, signTop: sign.getBoundingClientRect().top, pick: pick.textContent, pickTop: pick.getBoundingClientRect().top, stake: d.querySelector("#oat-shape-pick > .usage-note").textContent, save: d.querySelector("#oat-shape-save").textContent }; })()`);
  ok(g.sign === '登录一次（推荐）' && g.pick === '我自己选' && g.signTop < g.pickTop, 'way ① 「登录一次（推荐）」 FIRST, way ② 「我自己选」 below it', g);
  ok(g.lead === 'token 已保存。它没有说明属于哪种订阅，而 Claude Code 要先知道这一点才能用它。', 'right after the paste: the lead says why the guide came up (never «now usable»)', g.lead);
  ok(g.stake === '订阅类型决定没选模型时用哪个默认模型，以及 Claude Code 为该订阅开放的功能；选错了可以在这一行改。', 'the stake line, the owner\'s words', g.stake);
  const L = await ev(labels);
  ok(J(L) === J(['Ultra（原 Max 20x）', 'Max（原 Max 5x）', 'Pro', 'enterprise', 'team', '不确定 — 先不选 选了类型或登录说明之前，默认用 Sonnet']), 'the choices in order: Ultra（原 Max 20x）, Max（原 Max 5x）, Pro, enterprise, team, 「不确定 — 先不选」 last with its default', L);
  await shot('guide.png');

  console.log('§3 «先不选»');
  await ev(`document.querySelector('${dlg} input[value="unsure"]').click()`);
  await ev(`document.querySelector("${dlg} #oat-shape-save").click()`);
  ok(await closed(), 'saved ⇒ the guide closes');
  await waitFor('window.__refreshes >= 1');
  const r3 = await ev(`rowOf(${J(acct)})`), c3 = cred(acct);
  ok(r3.oatShape?.source === 'person' && r3.oatShape?.typeless === true && !!c3 && c3.accessToken === OAT && !('subscriptionType' in c3) && J(c3.scopes) === '["user:inference"]', 'stored as the person\'s typeless choice; the file carries the mint\'s scope and NO type', { shape: r3.oatShape, keys: c3 && Object.keys(c3) });
  const t3 = await ev(`chip(${J(acct)})`);
  ok(/未选订阅类型 · 默认 Sonnet/.test(t3) && await ev('!!document.querySelector("#chip [data-oat-shape]")'), 'the row: 「未选订阅类型 · 默认 Sonnet」, its chip the door to choose', t3);
  await shot('typeless-row.png');

  console.log('§4 changed at the row');
  await ev('document.querySelector("#chip [data-oat-shape]").click()'); await waitFor(`!!document.querySelector("${dlg} #oat-shape-pick")`);
  const lead4 = await ev(`document.querySelector("${dlg} .usage-note").textContent`);
  ok(lead4 === '当前订阅类型：未选订阅类型 · 默认 Sonnet（在这里选的）。' && await ev(`document.querySelector('${dlg} input[value="unsure"]').checked`), 'reopened: the current choice said and checked', lead4);
  await ev(`document.querySelector('${dlg} input[value="ultra"]').click()`); await ev(`document.querySelector("${dlg} #oat-shape-save").click()`); await closed();
  const c4 = cred(acct);
  ok(c4 && c4.subscriptionType === 'max' && c4.rateLimitTier === 'default_claude_max_20x' && c4.accessToken === OAT, 'Ultra ⇒ the file rewritten: max + default_claude_max_20x', c4 && { t: c4.subscriptionType, r: c4.rateLimitTier });
  await shot('changed.png');

  console.log('§5 way ①');
  await ev(`openShape(${J(acct)})`); await waitFor(`!!document.querySelector("${dlg} #oat-shape-signin")`);
  await ev(`document.querySelector("${dlg} #oat-shape-signin").click()`);
  ok(await closed() && await ev('window.__signins') === 1, '「登录一次（推荐）」 closes the guide and calls the row\'s own sign-in');

  console.log('§6 a sign-in states the type');
  const H = 3600e3;
  fs.writeFileSync(path.join(am.subDir(acct), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'acc-x', refreshToken: 'ref-x', expiresAt: Date.now() + H, refreshTokenExpiresAt: Date.now() + 20 * 24 * H, scopes: ['user:inference', 'user:profile'], subscriptionType: 'pro' } }), { mode: 0o600 });
  await am.syncOatFile(acct);
  await ev(`openShape(${J(acct)})`); await waitFor(`!!document.querySelector("${dlg} #oat-shape-signin")`);
  const g6 = await ev(`(() => { const d = document.querySelector("${dlg}"); return { lead: d.querySelector(".usage-note").textContent, rep: d.querySelector(".oat-shape-replaced")?.textContent || null, pick: !!d.querySelector("#oat-shape-pick") }; })()`);
  ok(g6.lead === '这个账号的订阅类型由登录说明：Pro。再登录一次会更新它。' && g6.rep === '登录说明了订阅类型，替代了在这里选的（Ultra（原 Max 20x））。' && !g6.pick, 'a sign-in\'s type is shown (not re-chosen here), and the choice it replaced is said', g6);
  await shot('from-login.png');
  await ev(`document.querySelector("${dlg} .dialog-close")?.click()`); await closed();

  console.log('§7 a CLI whose values were not read');
  PL = { cli: '2.1.321', anchor: false, types: [], tiers: [], withheld: [], orgTypes: {} };
  await ev(`openShape(${J(acct2)})`); await waitFor(`!!document.querySelector("${dlg} #oat-shape-signin")`);
  const g7 = await ev(`(() => { const d = document.querySelector("${dlg}"); return { none: d.querySelector(".oat-shape-none")?.textContent || null, radios: d.querySelectorAll("input[type=radio]").length }; })()`);
  ok(g7.radios === 0 && g7.none === 'VibeSpace 没能从这个 Claude Code 读出订阅类型，所以只能由登录说明。', 'no plan values ⇒ way ① alone, and why', g7);
  await shot('not-offered.png');
  await ev(`document.querySelector("${dlg} .dialog-close")?.click()`); await closed();

  console.log('§8 phone 390');
  PL = CAT;
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  await ev(`openShape(${J(acct2)}, true)`); await waitFor(`!!document.querySelector("${dlg} #oat-shape-save")`);
  const fit = await ev(`(() => { const d = document.querySelector("${dlg}").getBoundingClientRect(); const s = document.querySelector("${dlg} #oat-shape-save"); s.scrollIntoView({ block: "nearest" }); const sr = s.getBoundingClientRect(); return { vw: innerWidth, left: d.left, right: d.right, sw: document.documentElement.scrollWidth, saveRight: sr.right }; })()`);
  ok(fit.vw === 390 && fit.left >= 0 && fit.right <= 390 && fit.sw <= 390 && fit.saveRight <= 390, 'the guide fits 390 (no sideways scroll; Save on screen)', fit);
  await shot('phone.png');
  ok(errors.length === 0, 'no page exceptions', errors);
  sock.close();
} catch (e) { fail++; console.log('  ✗ ' + (e && e.stack || e)); }
finally {
  try { chrome && chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.close(); } catch { }
  await sleep(200);
  console.log('PNGs: ' + PNG);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\ntest-oat-add-door-chrome: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
