#!/usr/bin/env node
// THE ENTER THAT COMMITS A WORD MUST NOT SEND — THE REAL TEXTAREA (lanes chat-enter-ime r1 + r2, inc-muukd9oq-qyc3).
// The fast suite (test-chat-enter-ime) decides over the PURE guard; this one replays the owner's sequence on a REAL
// ChatInput in headless Chrome with CDP's own input-method path (r2, the owner's correction: the Enter that commits an
// English word in a Chinese IME is what sent): Input.imeSetComposition opens a composition, the IME's Enter keydown
// (keyCode 229), Input.insertText commits it (compositionend), and a PLAIN Enter keydown 20 ms later (Chrome/macOS
// delivering the commit's Enter in the same burst) ⇒ NO send, no newline, the "Input method just ended" line visible; it
// hides after 2 s; Enter ⇒ sent. Then: the same with a 150 ms gap (a human's second press) ⇒ sent; chat.enterSends off ⇒ Enter is a newline and Ctrl+Enter
// sends; and PATCHED COPIES bundled from mutated sources — r1's "an Enter ended it" exemption restored, or the window
// check removed ⇒ the owner's sequence SENDS — the leg can see red.
// Scratch profile, private HOME + XDG_RUNTIME_DIR, headless (no DISPLAY). SKIPs without chrome.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('  SKIP: no chrome/chromium on this box'); process.exit(0); }
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const WebSocket = require('ws');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `vs-cei-chrome-${process.pid}-`));
for (const d of ['home', 'xdg']) fs.mkdirSync(path.join(tmp, d), { mode: 0o700 });

async function bundle(mutate) {
  const out = path.join(tmp, `ci-${mutate || 'real'}.js`);
  const plugins = [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'bv' }));
    b.onLoad({ filter: /.*/, namespace: 'bv' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' }));
    const patch = (filter, re, to) => b.onLoad({ filter }, (a) => {
      const src = fs.readFileSync(a.path, 'utf8');
      if (!re.test(src)) throw new Error('mutation site gone: ' + re);
      return { contents: src.replace(re, to), loader: 'js' };
    });
    if (mutate === 'window') patch(/chat-enter-keys\.js$/, / && \(ctx\.now - ctx\.imeEndedAt\) < windowMs\) return 'ime-swallow';/, " && false) return 'ime-swallow';");
    if (mutate === 'r1') {   // r1's guard: the keydown that ended a composition decides; an Enter-ended one arms nothing
      patch(/chat-enter-keys\.js$/, /compositionend\(\) \{ this\._imeEndedAt = this\._now\(\); \}/, "keydown(e) { this._lastKeyEnter = e.key === 'Enter' || e.code === 'Enter'; if (this._lastKeyEnter && imeOwnsKey(e)) this._imeEndedAt = 0; }\n  compositionend() { this._imeEndedAt = this._lastKeyEnter ? 0 : this._now(); }");
      patch(/chat-input\.js$/, /this\._textarea\.addEventListener\('keydown', \(e\) => \{/, "$&\n      this._enterGuard.keydown(e);");
    }
  } }];
  await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/chat-input.js')], bundle: true, format: 'iife', globalName: 'VS', platform: 'browser', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins });
  return fs.readFileSync(out, 'utf8').replace(/<\/script/gi, '<\\/script');
}
const css = fs.readFileSync(path.join(REPO, 'public/chat.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
const page = (js) => `<!doctype html><meta charset="utf-8"><title>ime</title><style>${css}</style><body style="width:900px"></body><script>${js}</script>`;
const PAGES = { '/real': page(await bundle(false)), '/mut-r1': page(await bundle('r1')), '/mut-window': page(await bundle('window')) };
const port = await freePort(), cdpPort = await freePort();
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(PAGES[q.url] || ''); }).listen(port, '127.0.0.1');
const env = { ...process.env, HOME: path.join(tmp, 'home'), XDG_RUNTIME_DIR: path.join(tmp, 'xdg') };
delete env.DISPLAY; delete env.WAYLAND_DISPLAY;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${cdpPort}`, '--no-first-run', '--no-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${tmp}/chrome`, 'about:blank'], { stdio: 'ignore', env });
let ws = null;
try {
  let target = null;
  for (let i = 0; i < 120 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((x) => x.type === 'page'); } catch {}
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('chrome never exposed a CDP page target');
  ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evaljs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result?.result?.value;
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
  const key = async (k, { modifiers = 0, up = true } = {}) => {
    const d = { Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: modifiers & (MOD.ctrl | MOD.meta) ? undefined : '\r' }, Shift: { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 } }[k];
    await cdp('Input.dispatchKeyEvent', { type: d.text ? 'keyDown' : 'rawKeyDown', modifiers, ...d });
    if (up) await cdp('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...d, text: undefined });
  };
  const mount = async (url, { enterSends = true } = {}) => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${port}${url}` });
    for (let i = 0; i < 80; i++) { if (await evaljs('!!(window.VS && window.VS.ChatInput)').catch(() => false)) break; await sleep(150); }
    return evaljs(`(() => {
      window.__sent = []; window.__ev = [];
      const ci = new VS.ChatInput({ send: (m) => window.__sent.push(typeof m.text === 'string' ? m.text : typeof m.data === 'string' ? m.data : JSON.stringify(m).slice(0, 160)) }, 'sess-ime', { onSend(){}, getEnterSends: () => ${enterSends} });
      document.body.appendChild(ci.element); window.__ci = ci;
      const ta = ci.element.querySelector('textarea');
      for (const ty of ['keydown', 'compositionstart', 'compositionend']) ta.addEventListener(ty, (e) => { window.__ev.push(ty + (e.key ? ':' + e.key : '') + (e.isComposing ? ':c' : '')); if (ty === 'compositionend') window.__ce = performance.now(); if (ty === 'keydown' && e.keyCode === 13) window.__gap = Math.round(performance.now() - window.__ce); }, true);
      ta.focus(); return document.activeElement === ta;
    })()`);
  };
  const state = () => evaljs(`(() => { const h = document.querySelector('.chat-ime-hint'); return { sent: window.__sent.slice(), value: document.querySelector('textarea').value, hint: !!h && !h.hidden && h.getBoundingClientRect().height > 0, hintText: h ? h.textContent : null, ev: window.__ev.slice(), gap: window.__gap }; })()`);
  // THE OWNER'S SEQUENCE, in the IME's own path: a composition, the IME's Enter (229), the commit (insertText), then the
  // commit's Enter arriving PLAIN gapMs later
  const commit = async (gapMs) => {
    await cdp('Input.imeSetComposition', { text: 'hello', selectionStart: 5, selectionEnd: 5 });
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229 });
    await cdp('Input.insertText', { text: 'hello' });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229 });
    await sleep(gapMs);
    await key('Enter');
    await sleep(60);
    return state();
  };

  ok('a real ChatInput mounts and its textarea holds the focus', await mount('/real') === true);
  let s = await commit(20);
  ok('the replay went through the IME path: compositionstart → the IME\'s Enter keydown → compositionend → a plain Enter keydown', /compositionstart.*keydown:Enter.*compositionend.*keydown:Enter$/.test(s.ev.join(' ')), s.ev);
  ok(`the plain Enter reached the page inside the 50 ms burst (compositionend → keydown measured ${s.gap} ms)`, s.gap < 50, s.gap);
  ok('THE OWNER\'S SEQUENCE: a plain Enter 20 ms after an Enter-committed word does NOT send', s.sent.length === 0, s);
  ok('…and adds no newline (the committing Enter does nothing visible)', s.value === 'hello', s.value);
  ok('…and the line under the composer says so', s.hint && /Input method just ended/.test(s.hintText), s);
  await sleep(2150);
  s = await state();
  ok('the line hides after 2 s', !s.hint, s);
  await key('Enter'); await sleep(60);
  s = await state();
  ok('the next Enter SENDS', s.sent.length === 1 && s.sent[0] === 'hello', s.sent);

  await mount('/real');
  s = await commit(150);
  ok('the same sequence with a 150 ms gap (a human\'s second press, past the 50 ms burst) sends, no line', s.sent.length === 1 && !s.hint, s);

  await mount('/real', { enterSends: false });
  await cdp('Input.insertText', { text: 'draft' });
  await key('Enter'); await sleep(60);
  s = await state();
  ok('chat.enterSends off: Enter inserts a newline, nothing sent', s.sent.length === 0 && s.value === 'draft\n', s);
  await key('Enter', { modifiers: MOD.ctrl }); await sleep(60);
  s = await state();
  ok('…and Ctrl+Enter sends', s.sent.length === 1 && s.sent[0] === 'draft', s.sent);
  const hint = await evaljs(`(() => { window.__ci.showTyping('thinking...'); const h = document.querySelector('.chat-send-hint'); return { shown: !h.classList.contains('hidden'), text: h.textContent }; })()`);
  ok('…mid-turn the send-mode line names the send key ("Ctrl+Enter sends")', hint.shown && /Ctrl\+Enter sends/.test(hint.text), hint);

  await mount('/mut-r1');
  s = await commit(20);
  ok('control: the PATCHED COPY with r1\'s exemption restored — the owner\'s sequence SENDS', s.sent.length === 1 && !s.hint, s);
  await mount('/mut-window');
  s = await commit(20);
  ok('control: the PATCHED COPY (window check removed) — the owner\'s sequence SENDS', s.sent.length === 1 && !s.hint, s);
} catch (e) {
  ok('the browser leg ran', false, String(e.message || e).slice(0, 300));
} finally {
  try { ws?.close(); } catch {}
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.close(); } catch {}
}
await sleep(300);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
