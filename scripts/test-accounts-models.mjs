#!/usr/bin/env node
// test-accounts-models — THE ACCOUNT DIALOG'S MODEL SECTION IN CHROME (lane provider-record, design q-053 r1 §3 / §6 row
// P0a): the REAL dialog (esbuild of src/lib/account-models.js) against the REAL routes (src/routes/account-models.js) over
// the REAL store (data/providers.json on a scratch dir) and the REAL AccountManager; listed rows from the FIXTURE catalogs
// (no vendor call). Legs (zh unless said):
//   §1 a LISTED account (a claude subscription): the provider named, 由 Claude 列出, the catalog's rows read-only (1M + its
//      cap chip), no input / Save / Add, nothing greyed; 「测试」 hands THE ROW'S id to the roster's Test and closes
//   §2 a CONFIGURED provider (a projected pv- row): rows as inputs; 添加模型 focuses the new id; an EMPTY id ⇒ the refusal
//      under that row's id field (+ the kind's hint), aria-invalid, NO request; its 「测试」 says why instead of testing;
//      typing clears it; Save ⇒ ONE PUT, the file holds the row (128k ⇒ 128000, the cap); deleting the alias's target ⇒ the
//      alias named, no request; the alias removed ⇒ saved; 「测试」 on a saved row ⇒ its id
//   §3 `none`: 此提供方未配置模型 said (never a silent empty table) + the door to add
//   §4 en: Listed by Claude / Models — Work Max · §5 phone 375×812: one column per row, the header gone, every button
//      ≥ 36 px, nothing sideways · no page exceptions. PNGs → $AM_PNG_DIR or the scratch dir.
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
if (!CHROME) { console.log('SKIP: no chrome binary on this machine (looked in /usr/bin/google-chrome{,-stable}, /usr/bin/chromium{,-browser})'); process.exit(0); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-acctmodels-'));
const PNG = process.env.AM_PNG_DIR || dir;
const DATA = path.join(dir, 'data'); fs.mkdirSync(DATA);
const FIX = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/provider-models/catalogs.json'), 'utf-8'));
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const PS = require(path.join(REPO, 'src/server/provider-store.js'));
const express = require(path.join(REPO, 'node_modules/express'));
const WS = require(path.join(REPO, 'node_modules/ws'));
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const am = new AccountManager({ dataDir: DATA });
const sub = am.createSubscription({ name: 'Work Max' }).id;
const store = PS.create({ dataDir: DATA, catalogOf: (h) => FIX.harness[h] || null, log: () => { } });
store.put({ id: 'pv-deepseek', kind: 'openai-chat', label: 'DeepSeek', keyRef: 'providers:pv-deepseek#key', modelsSource: 'configured', models: [{ id: 'deepseek-chat', context: '64k', caps: ['tools'] }, { id: 'deepseek-reasoner', caps: ['reasoning'] }], aliases: { opus: 'deepseek-reasoner' }, defaultModel: 'deepseek-chat' });
store.put({ id: 'pv-homebox', kind: 'self-hosted', label: 'Home box', modelsSource: 'none' });
const disk = () => JSON.parse(fs.readFileSync(store.file, 'utf-8')).providers;
let chrome = null, srv = null;
try {
  const stubBuildVersion = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
  const entry = `import { openAccountModelsDialog } from './account-models.js';
window.__tests = [];
window.openModels = (accountId, name) => openAccountModelsDialog({ accountId, name, onTest: (m) => window.__tests.push(m) });`;
  await esbuild.build({ stdin: { contents: entry, resolveDir: path.join(REPO, 'src/lib'), sourcefile: 'am-entry.js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: path.join(dir, 'www/am.js'), logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stubBuildVersion] });
  fs.copyFileSync(path.join(REPO, 'public/style.css'), path.join(dir, 'www/style.css'));
  fs.writeFileSync(path.join(dir, 'www/index.html'), '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><script>localStorage.setItem("vibespace.lang", new URLSearchParams(location.search).get("lang") || "zh")</' + 'script><script src="/am.js"></' + 'script></body></html>');
  const app = express(); app.use(express.json());
  const puts = [];
  app.use((req, res, next) => { if (req.method === 'PUT') puts.push(req.path); next(); });
  require(path.join(REPO, 'src/routes/account-models.js')).registerAccountModelRoutes(app, { accounts: am, providers: store });
  app.use(express.static(path.join(dir, 'www')));
  srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ORIGIN = 'http://127.0.0.1:' + srv.address().port;
  const CDP_PORT = await freePort();
  const home = path.join(dir, 'home'), xdg = path.join(dir, 'xdg'); fs.mkdirSync(home); fs.mkdirSync(xdg, { mode: 0o700 });
  const env = { ...process.env, HOME: home, XDG_RUNTIME_DIR: xdg }; delete env.DISPLAY; delete env.WAYLAND_DISPLAY;
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP_PORT, '--no-first-run', '--disable-gpu', '--window-size=1100,820', '--user-data-dir=' + path.join(dir, 'chrome'), 'about:blank'], { stdio: 'ignore', env });
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
  const load = async (lang, w = 1100, h = 820, mobile = false) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await cdp('Page.navigate', { url: `${ORIGIN}/?lang=${lang}` });
    await waitFor('typeof window.openModels === "function"');
  };
  const open = async (id, name) => { await ev(`openModels(${JSON.stringify(id)}, ${JSON.stringify(name)})`); return waitFor('!!document.querySelector("#account-models-dialog .am-prov")'); };
  const Q = (sel) => `document.querySelector(${JSON.stringify('#account-models-dialog ' + sel)})`;
  const rowSel = (id) => `[...document.querySelectorAll('#account-models-dialog .am-row')].find((r) => (r.querySelector('.am-id')?.value ?? r.querySelector('.am-id')?.textContent) === ${JSON.stringify(id)})`;
  const type = (sel, v) => ev(`(() => { const i = ${sel}; i.focus(); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

  console.log('§1 a listed account (a claude subscription, zh, desk 1100)');
  await load('zh');
  ok(await open(sub, 'Work Max'), 'the dialog opens for the account');
  const l1 = await ev(`(() => { const d = document.querySelector('#account-models-dialog'); return { title: d.querySelector('.dialog-header h3').textContent, kind: d.querySelector('.am-kind').textContent, src: d.querySelector('.am-source').textContent, rows: d.querySelectorAll('.am-row').length, inputs: d.querySelectorAll('input').length, save: !!d.querySelector('.am-save'), add: !!d.querySelector('.am-add'), disabled: d.querySelectorAll('[disabled]').length, tests: d.querySelectorAll('.am-test').length, note: d.querySelector('.am-note')?.textContent || '' }; })()`);
  ok(l1.title === '模型 — Work Max' && l1.kind === 'Anthropic 订阅' && l1.src === '由 Claude 列出', 'the provider named (Anthropic 订阅) and its source (由 Claude 列出)', l1);
  ok(l1.rows === FIX.harness.claude.length - 1 && l1.inputs === 0 && !l1.save && !l1.add && l1.disabled === 0 && l1.tests === l1.rows && /提供方列出/.test(l1.note), 'the catalog\'s rows read-only (11: the Default row is the harness\'s own), no input / Save / Add, nothing greyed, one 「测试」 per row', l1);
  const opus1m = await ev(`(() => { const r = ${rowSel('opus[1m]')}; return r ? { ctx: r.querySelector('.am-ctx').textContent, caps: [...r.querySelectorAll('.am-cap')].map((c) => c.textContent) } : null; })()`);
  ok(opus1m && opus1m.ctx === '1M' && opus1m.caps.join() === '1M 上下文', 'opus[1m]: 1M and its cap chip', opus1m);
  await shot('listed.png');
  await ev(`${rowSel('sonnet')}.querySelector('.am-test').click()`);
  ok(await waitFor('!document.querySelector("#account-models-dialog")') && (await ev('window.__tests')).join() === 'sonnet', '「测试」 on sonnet: the roster\'s Test gets THAT id, the dialog closes', await ev('window.__tests'));

  console.log('§2 a configured provider (a projected pv- row)');
  ok(await open('pv-deepseek', 'DeepSeek'), 'the dialog opens for pv-deepseek');
  const c1 = await ev(`(() => { const d = document.querySelector('#account-models-dialog'); return { kind: d.querySelector('.am-kind').textContent, src: d.querySelector('.am-source').textContent, ids: [...d.querySelectorAll('.am-row .am-id')].map((i) => i.value), ctx: d.querySelector('.am-row .am-ctx').value, tools: d.querySelector('.am-row .am-cap[data-cap="tools"]').getAttribute('aria-pressed'), alias: d.querySelector('.am-alias')?.textContent || '', disabled: d.querySelectorAll('[disabled]').length }; })()`);
  ok(c1.kind === 'DeepSeek OpenAI 兼容 · Chat Completions 接口' && c1.src === '你填写的' && c1.ids.join() === 'deepseek-chat,deepseek-reasoner' && c1.ctx === '64k' && c1.tools === 'true' && /opus → deepseek-reasoner/.test(c1.alias) && c1.disabled === 0, 'the record\'s label + its kind, 你填写的, the rows as inputs (64k, the tools cap pressed), its alias, nothing greyed', c1);
  await ev(`${Q('.am-add')}.click()`);
  ok(await waitFor(`document.querySelectorAll('#account-models-dialog .am-row').length === 3 && document.activeElement === [...document.querySelectorAll('#account-models-dialog .am-row .am-id')].pop()`), '添加模型: a third row, its id field focused');
  const puts0 = puts.length;
  await ev(`${Q('.am-save')}.click()`);
  await sleep(150);
  const e1 = await ev(`(() => { const r = [...document.querySelectorAll('#account-models-dialog .am-row')][2]; return { err: r.querySelector('.am-err').textContent, invalid: r.querySelector('.am-id').getAttribute('aria-invalid') }; })()`);
  ok(e1.err === '这不是此提供方接受的模型 id — 小写字母、数字、点和连字符（例如 gpt-5.5）' && e1.invalid === 'true' && puts.length === puts0, 'Save with an EMPTY id: the refusal under THAT row\'s id (with the kind\'s hint), aria-invalid — and no request left the page', { e1, puts: puts.length - puts0 });
  await shot('refused.png');
  await ev(`[...document.querySelectorAll('#account-models-dialog .am-row')][2].querySelector('.am-test').click()`);
  ok(await ev('!!document.querySelector("#account-models-dialog")') && (await ev('window.__tests')).length === 1, 'its 「测试」 says why instead of testing (the dialog stays, nothing tested)');
  const last = `[...document.querySelectorAll('#account-models-dialog .am-row')][2]`;
  await type(`${last}.querySelector('.am-id')`, 'deepseek-v4');
  ok(await ev(`${last}.querySelector('.am-err').textContent === '' && !${last}.querySelector('.am-id').hasAttribute('aria-invalid')`), 'typing into the id clears its refusal');
  await type(`${last}.querySelector('.am-label')`, 'V4');
  await type(`${last}.querySelector('.am-ctx')`, '128k');
  await ev(`${last}.querySelector('.am-cap[data-cap="tools"]').click()`);
  // the redraw's mark: every row is drawn anew from the answer (new keys) — a save in flight is never raced
  const keysNow = () => ev(`[...document.querySelectorAll('#account-models-dialog .am-row')].map((r) => Number(r.dataset.key))`);
  const savedAfter = async (n) => { const max = Math.max(...(await keysNow())); await ev(`${Q('.am-save')}.click()`); const t0 = Date.now(); while (Date.now() - t0 < 8000) { const k = await keysNow(); if (puts.length >= n && k.length && Math.min(...k) > max) return true; await sleep(50); } return false; };
  const saved1 = await savedAfter(puts0 + 1);
  ok(saved1 && puts.length === puts0 + 1 && await ev(`document.querySelectorAll('#account-models-dialog .am-row').length === 3 && document.querySelector('#account-models-dialog .am-source').textContent === '你填写的'`), 'Save: ONE PUT, the dialog redrawn from the answer (three rows)', puts.length - puts0);
  const d1 = disk().find((p) => p.id === 'pv-deepseek');
  ok(d1 && JSON.stringify(d1.models[2]) === JSON.stringify({ id: 'deepseek-v4', label: 'V4', context: 128000, caps: ['tools'] }), 'data/providers.json holds the new row (128k ⇒ 128000, the cap)', d1 && d1.models);
  await ev(`${rowSel('deepseek-reasoner')}.querySelector('.am-del').click()`);
  const puts1 = puts.length;
  await ev(`${Q('.am-save')}.click()`);
  await sleep(150);
  const fe = await ev(`${Q('.am-form-err')}.textContent`);
  ok(fe === 'opus: 有别名指向不在列表里的模型' && puts.length === puts1, 'deleting the row an alias points at ⇒ the ALIAS is named, nothing sent', fe);
  await ev(`${Q('.am-alias-del')}.click()`);
  ok(await savedAfter(puts1 + 1) && await ev(`!document.querySelector('#account-models-dialog .am-alias') && document.querySelectorAll('#account-models-dialog .am-row').length === 2`), 'the alias removed ⇒ saved, redrawn with two rows and no alias');
  const d2 = disk().find((p) => p.id === 'pv-deepseek');
  ok(d2 && JSON.stringify(d2.aliases) === '{}' && d2.models.map((m) => m.id).join() === 'deepseek-chat,deepseek-v4' && puts.length === puts1 + 1, 'the file: two rows, no alias (one PUT)', d2);
  await ev(`${rowSel('deepseek-v4')}.querySelector('.am-test').click()`);
  ok(await waitFor('!document.querySelector("#account-models-dialog")') && (await ev('window.__tests')).pop() === 'deepseek-v4', '「测试」 on a saved row ⇒ its id (deepseek-v4)');

  console.log('§3 none: said, with the door to add');
  ok(await open('pv-homebox', 'Home box'), 'the dialog opens for a provider with no models');
  const n1 = await ev(`(() => { const d = document.querySelector('#account-models-dialog'); return { src: d.querySelector('.am-source').textContent, ds: d.querySelector('.am-source').dataset.source, empty: d.querySelector('.am-empty')?.textContent || '', table: !!d.querySelector('.am-table'), add: !!d.querySelector('.am-add') }; })()`);
  ok(n1.src === '此提供方未配置模型' && n1.ds === 'none' && n1.empty === '此提供方未配置模型 — 添加这个账号可用的模型' && !n1.table && n1.add, 'the source says 此提供方未配置模型, the body says so with the way to add — never a silent empty table', n1);
  await shot('none.png');
  await ev(`${Q('.dialog-close')}.click()`);

  console.log('§4 en');
  await load('en');
  await open(sub, 'Work Max');
  const en = await ev(`({ title: document.querySelector('#account-models-dialog .dialog-header h3').textContent, src: document.querySelector('#account-models-dialog .am-source').textContent, kind: document.querySelector('#account-models-dialog .am-kind').textContent })`);
  ok(en.title === 'Models — Work Max' && en.src === 'Listed by Claude' && en.kind === 'Anthropic subscription', 'en: Models — Work Max · Anthropic subscription · Listed by Claude', en);
  await ev(`${Q('.dialog-close')}.click()`);

  console.log('§5 phone 375×812 (zh)');
  await load('zh', 375, 812, true);
  await open('pv-deepseek', 'DeepSeek');
  const ph = await ev(`(() => { const d = document.querySelector('#account-models-dialog .dialog').getBoundingClientRect(); const head = document.querySelector('#account-models-dialog .am-head'); const r = document.querySelector('#account-models-dialog .am-row'); const rr = r.getBoundingClientRect(); const id = r.querySelector('.am-id').getBoundingClientRect(); const lab = r.querySelector('.am-label').getBoundingClientRect(); const btns = [...document.querySelectorAll('#account-models-dialog .am-row button, #account-models-dialog .dialog-buttons button')].map((b) => Math.round(b.getBoundingClientRect().height)); return { vw: innerWidth, sw: document.documentElement.scrollWidth, left: d.left, right: d.right, head: head ? getComputedStyle(head).display : 'gone', idW: Math.round(id.width), rowW: Math.round(rr.width), idBelowLabel: lab.top > id.bottom - 1, minBtn: Math.min(...btns) }; })()`);
  ok(ph.vw === 375 && ph.sw <= 375 && ph.left >= 0 && ph.right <= 375 && ph.head === 'none' && ph.idW >= ph.rowW - 24 && ph.idBelowLabel && ph.minBtn >= 36, 'the phone: the dialog fits 375 (nothing sideways), the column header gone, the id takes the row\'s width with the rest below it, every button ≥ 36 px', ph);
  await shot('phone.png');
  ok(errors.length === 0, 'no page exceptions', errors);
  sock.close();
} catch (e) { fail++; console.log('  ✗ ' + (e && e.stack || e)); }
finally {
  try { chrome && chrome.kill('SIGKILL'); } catch { }
  try { srv && srv.close(); } catch { }
  await sleep(200);
  console.log('PNGs: ' + PNG);
  if (!process.env.AM_PNG_DIR) fs.rmSync(dir, { recursive: true, force: true });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
