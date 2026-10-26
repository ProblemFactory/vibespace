#!/usr/bin/env node
// test-tray-voice-phone — lane phone-tray-voice-done (the owner's incident inc-mvhzgiq8-bs3j, 2026-10-21, Android Chrome
// 448×850: 「我刚才在手机上点开 Inbox，点回复、语音输入，然后点完成，Inbox 就被收起来了，我尝试了两次都这样」). THE MEASURED CLOSER:
// the recording microphone redraws its capsule 「● 0:02 ▮▮▮ ✕」 four times a second (voice-input.js paint(): btn.innerHTML),
// and the ONE outside-press closer (utils.js onOutsidePress) decides a touch at its pointerup — by the element it went
// down on. A finger held on the time across one redraw went down on a span that was GONE at the lift: inside nothing, it
// read as an OUTSIDE press, hidePopup dropped the rows, the click fell through to the page behind, and the recording's
// tick found its microphone off the page and CANCELLED it — no request ever reached the hub (the bundle's server log has
// no dictation for either reply). Fixed at the root: the facts are measured where AND when the press went down.
// A throwaway server in a git worktree (test-mobile-back-chrome's harness: the built public/ overlaid, two For-you asks
// seeded) and headless Chrome over raw CDP at the owner's 448×850, DPR 3, an Android UA, touch, hover:none / pointer:coarse.
// The microphone, MediaRecorder and /api/voice/* are stubbed IN THE PAGE (never a vendor call; the request that leaves the
// page is counted — what the hub would have logged).
//   ① THE OWNER'S SEQUENCE: the sheet (the phone's badge now opens its page — the same rows; lane foryou-honest) → its row → Reply → the microphone → 2.4 s → the stop HELD on 「0:02」 until the capsule
//      has redrawn under the finger (asserted: the span it went down on left the page before the lift — the field's shape)
//      ⇒ the tray stays open, ONE request left the page, the words are in the reply box (the same node, still focused),
//      and the op ring holds no popup-hide
//   ② THE CHIP: a tap on the floating 「Inserted · Undo」 chip (document.body — outside the tray) is the dictation's own:
//      Undo takes the words back, the tray stays open
//   ③ THE KEYBOARD: the viewport shrinks mid-recording and grows back after the stop (the keyboard up / folding) — the
//      tray stays open, the words land
//   ④ THE CLOSERS STILL CLOSE, each naming its cause in the incident recorder's op ring ({op:'popup-hide', panel:
//      'for-you', why}): Escape in the box folds it (the tray stays; the draft kept), Escape on the tray closes it
//      ('escape'), a real outside tap closes it ('outside') and the typed draft is back on the next Reply, the browser's
//      back closes it ('back') and VibeSpace stays
//   ⑤ RED CONTROL = the base's closer, rebuilt from a PATCHED COPY of today's utils.js in the throwaway worktree (the
//      down target judged at the LIFT, no voice fact; one esbuild — never the repository's history): ① the tray CLOSES at
//      the held stop with why 'outside', no request leaves the page; ② the chip tap closes it; the real bundle back ⇒ ①
//      passes again (the fix, not the reload)
// PNG: VIBESPACE_TRAY_VOICE_PNG_DIR (default: the scratch dir) → tray-voice-phone.png (the reply with its dictated words).
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-tray-voice-phone.mjs
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('tray-voice-wt');
const fakeHome = scratchHome('tray-voice-home', fs);
const chromeDir = scratch('tray-voice-chrome'); // its own registered scratch root (test-mobile-back-chrome's lesson)
const SHOTS = process.env.VIBESPACE_TRAY_VOICE_PNG_DIR || scratch('tray-voice-png');
fs.mkdirSync(SHOTS, { recursive: true });
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PREV = 'data:text/html,<title>prev</title><h1>the page before VibeSpace</h1>';
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── throwaway server in a worktree (no rebuild: overlays the built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const T0 = Date.now();
fs.writeFileSync(path.join(wt, 'data', 'user-todos.json'), JSON.stringify({ items: [1, 2].map((k) => ({ id: 'ut-trayvoice' + k, sessionKey: 'claude:tray-voice-' + k, sessionName: 'tray voice', text: `Which bucket should the nightly export use? (${k})`, detail: null, urgency: 'normal', kind: 'action', origin: 'agent', status: 'open', by: 'agent', createdAt: T0 - k * 60e3, resolvedAt: null, resolvedBy: null, jobId: null })) }, null, 2));
const stubPath = `${wt}-claude-stub`; // never a vendor CLI: the boot probes get a version and nothing else
fs.writeFileSync(stubPath, '#!/bin/sh\nfor a in "$@"; do case "$a" in --version) echo "2.1.288 (Claude Code) stub"; exit 0;; esac; done\nexit 0\n', { mode: 0o755 });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, chromeDir]) { try { endRootedProcesses(root); } catch { } } // whatever the server / Chrome started under its roots (§57b)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome, stubPath]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
// a leg that throws is a RED with Chrome torn down — never an orphaned browser (lane voice-follows-focus)
for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, (e) => { fail++; console.log(`  ✗ the suite threw — ${String((e && e.stack) || e).slice(0, 900)}`); console.log(`\n${fail} FAILED (${pass} passed)`); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 240e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
for (let i = 0; i < 80; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(100); } try { return await evalJs(expr); } catch { return false; } };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard over the nav bar
// THE VOICE, STUBBED IN THE PAGE: a microphone (an oscillator's stream), a MediaRecorder that hands over a small blob at
// stop, /api/voice/status = on and connected, /api/voice/dictate answers after 600 ms (the requests that LEFT the page are
// counted); the element every pointerdown went down on is kept (the held stop's precondition reads it)
const VOICE_STUB = `(() => {
  window.__dictates = 0; window.__answers = [];
  const desc = (n) => { if (!n || n.nodeType !== 1) return String(n && n.nodeName); const c = typeof n.className === 'string' ? n.className.trim().split(/\\s+/).filter(Boolean)[0] : ''; return n.tagName.toLowerCase() + (c ? '.' + c : ''); };
  document.addEventListener('pointerdown', (e) => { window.__down = e.target; window.__downTag = desc(e.target); }, true);
  try { navigator.mediaDevices.getUserMedia = async () => { const ac = new AudioContext(); const o = ac.createOscillator(); const d = ac.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream; }; } catch { }
  class FakeRecorder {
    constructor(stream) { this.stream = stream; this.mimeType = 'audio/webm;codecs=opus'; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; setTimeout(() => { if (this.ondataavailable) this.ondataavailable({ data: new Blob([new Uint8Array(1500)], { type: this.mimeType }) }); if (this.onstop) this.onstop(); }, 40); }
    static isTypeSupported() { return true; }
  }
  window.MediaRecorder = FakeRecorder;
  const real = window.fetch;
  const json = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
  window.fetch = (u, o) => {
    const s = String((u && u.url) || u);
    if (s.includes('/api/voice/status')) return Promise.resolve(json({ on: true, enabled: true, connected: true }));
    if (s.includes('/api/voice/dictate')) { window.__dictates++; const text = window.__answers.shift() || 'Use the cold bucket'; return new Promise((r) => setTimeout(() => r(json({ text, rewrite: { status: 'used' }, request_id: 'dct_tray' + window.__dictates })), 600)); }
    if (s.includes('/api/voice/teach')) return Promise.resolve(json({}));
    return real(u, o);
  };
})();`;
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: VOICE_STUB });
await cdp('Emulation.setDeviceMetricsOverride', { width: 448, height: 850, deviceScaleFactor: 3, mobile: true });
await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });

const tapAt = async (x, y, hold = 60) => {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(hold);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(250);
};
const centerOf = (sel) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const tap = async (sel) => { const p = await centerOf(sel); if (!p) throw new Error('tap: nothing at ' + sel); await tapAt(p.x, p.y); };
const key = async (k) => { for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: k === 'Escape' ? 27 : 0 }); await sleep(200); };
const TRAY = '#user-todos-popup';
const BOX = `${TRAY} .ut-reply-input`, MIC = `${TRAY} .ut-reply .voice-btn`;
const trayOpen = () => evalJs(`!document.getElementById('user-todos-popup').classList.contains('hidden')`);
const hides = () => evalJs(`window.__ops.filter((o) => o.op === 'popup-hide')`);
/** The previous page, then VibeSpace; the op ring tapped (every op the incident recorder receives is also kept here). */
const boot = async () => {
  await cdp('Page.navigate', { url: PREV }); await sleep(300);
  await cdp('Page.navigate', { url: `${ORIGIN}/` });
  await waitFor('!!(window.app && app.ready)', 20000);
  await evalJs('app.ready.then(() => true)');
  await waitFor('!app.layoutManager._restoring', 15000);
  await sleep(1200);
  return evalJs(`(() => { const rec = typeof window.__vsOp === 'function'; window.__ops = []; const o = window.__vsOp; window.__vsOp = (n, d) => { window.__ops.push({ op: n, ...(d || {}) }); return o && o(n, d); }; return { rec, mobile: app.isMobile, touch: app.isTouch, absent: document.documentElement.classList.contains('voice-absent'), state: history.state }; })()`);
};
/** the tray open, Reply on its first ask: the box focused (the keyboard up on a phone) */
const openReply = async () => {
  // lane foryou-honest: the phone's badge opens its first-screen PAGE (one surface; the same rows, the same box) — the sheet,
  // whose closer this suite pins, is reached through its own door; a touch screen's row is FOLDED: a tap on its words opens it
  if (!(await trayOpen())) await evalJs(`document.getElementById('taskbar-user-todos').click(); true`);
  await waitFor(`!!document.querySelector(${JSON.stringify(`${TRAY} .ut-reply-btn`)})`, 5000);
  const ROW = `${TRAY} .ut-item:has(.ut-reply-btn) > .ut-body > .ut-text`;
  if (!(await evalJs(`!!document.querySelector(${JSON.stringify(BOX)})`)) && !(await evalJs(`!!document.querySelector(${JSON.stringify(`${TRAY} .ut-item.ut-open .ut-reply-btn`)})`))) { await tap(ROW); await sleep(200); }
  if (!(await evalJs(`!!document.querySelector(${JSON.stringify(BOX)})`))) await tap(`${TRAY} .ut-item.ut-open .ut-reply-btn`);
  await waitFor(`document.activeElement && document.activeElement.matches(${JSON.stringify(BOX)})`, 3000);
};
/** THE OWNER'S STOP: the finger down on 「0:02」 and held until the capsule has redrawn under it (four times a second), then
 *  lifted — a tap (< 500 ms, no move). Returns what it went down on and whether that left the page before the lift. */
const heldStop = async () => {
  const q = await centerOf(`${MIC} .voice-time`);
  if (!q) return { q: null };
  await evalJs('window.__down = null; true');
  const t0 = Date.now();
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: q.x, y: q.y }] });
  let gone = false;
  while (Date.now() - t0 < 420) { gone = await evalJs('!!(window.__down && !window.__down.isConnected)'); if (gone) break; await sleep(20); }
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const heldMs = Date.now() - t0;
  await sleep(250);
  return { q, downTag: await evalJs('window.__downTag'), gone, heldMs };
};
/** one dictation into the open reply box: the microphone, `ms` of speech, the held stop; then up to 5 s for the words */
const dictate = async (words, { ms = 2400, during = null, after = null } = {}) => {
  await evalJs(`window.__answers.push(${JSON.stringify(words)}); true`);
  const before = await evalJs('window.__dictates');
  const boxEl = await evalJs(`(window.__box = document.querySelector(${JSON.stringify(BOX)}), !!window.__box)`);
  await tap(MIC);
  const recording = await waitFor(`!!document.querySelector(${JSON.stringify(`${MIC}.recording`)})`, 3000);
  await sleep(ms / 2); if (during) await during(); await sleep(ms / 2);
  const stop = await heldStop();
  if (after) await after();
  const landed = await waitFor(`!!window.__box && window.__box.value.includes(${JSON.stringify(words)})`, 5000);
  await sleep(300);
  const st = await evalJs(`({ open: !document.getElementById('user-todos-popup').classList.contains('hidden'), same: !!window.__box && window.__box.isConnected && document.querySelector(${JSON.stringify(BOX)}) === window.__box, focused: document.activeElement === window.__box, value: window.__box ? window.__box.value : null, idle: !document.querySelector(${JSON.stringify(`${MIC}.recording, ${MIC}.waiting`)}) })`);
  return { boxEl, recording, stop, landed, requests: (await evalJs('window.__dictates')) - before, ...st };
};

try {
  console.log('the owner\'s phone: 448×850, DPR 3, Android Chrome UA, touch');
  const env = await boot();
  check('the phone: app.isMobile + isTouch, a microphone on the page (voice on), the incident recorder\'s op ring armed, the back sentinel standing', env.mobile && env.touch && !env.absent && env.rec && env.state?.vs === 1, env);
  await tapAt(224, 820); // a first touch (the page's activation)

  // ── ① THE OWNER'S SEQUENCE ──
  console.log('① the sheet → its row → Reply → the microphone → the stop held on 「0:02」 across a redraw');
  await openReply();
  const d1 = await dictate('Use the cold bucket');
  check('①a the stop went down on the capsule\'s time and that span LEFT the page before the lift (a redraw under the finger — the field\'s shape), a tap still (< 500 ms)', d1.boxEl && d1.recording && d1.stop.downTag === 'span.voice-time' && d1.stop.gone && d1.stop.heldMs < 500, d1.stop);
  check('①b the tray STAYS OPEN through the stop and the words landing', d1.open, d1);
  check('①c ONE request left the page (the stop was a stop — not the cancel of a microphone gone from the page)', d1.requests === 1, d1);
  check('①d the words are in the reply box — the same box, still on the page and still focused (the keyboard stays up)', d1.landed && d1.same && d1.focused && d1.value === 'Use the cold bucket' && d1.idle, d1);
  check('①e the incident recorder\'s op ring holds no popup-hide', (await hides()).length === 0, await hides());
  await cdp('Page.captureScreenshot', { format: 'png' }).then((s) => fs.writeFileSync(path.join(SHOTS, 'tray-voice-phone.png'), Buffer.from(s.data, 'base64')));

  // ── ② THE CHIP ──
  console.log('② the floating 「Inserted · Undo」 chip — on document.body, outside the tray');
  const chip = await evalJs(`(() => { const c = [...document.querySelectorAll('.voice-chip-float')].find((x) => !x.classList.contains('hidden')); if (!c) return null; const u = c.querySelector('.voice-chip-btn'); return { inTray: !!c.closest('#user-todos-popup'), undo: u ? u.textContent : null }; })()`);
  await tap('.voice-chip-float:not(.hidden) .voice-chip-btn');
  await sleep(300);
  const c2 = await evalJs(`({ open: !document.getElementById('user-todos-popup').classList.contains('hidden'), value: document.querySelector(${JSON.stringify(BOX)})?.value ?? null })`);
  check('②a the chip floats outside the tray (document.body); a tap on its Undo takes the words back and the tray STAYS OPEN', !!chip && !chip.inTray && c2.open && c2.value === '', { chip, c2 });
  check('②b …no popup-hide in the op ring', (await hides()).length === 0, await hides());

  // ── ③ THE KEYBOARD ──
  console.log('③ the keyboard: the viewport shrinks mid-recording and grows back after the stop');
  const kb = (h) => cdp('Emulation.setDeviceMetricsOverride', { width: 448, height: h, deviceScaleFactor: 3, mobile: true });
  const d3 = await dictate('Ship it on Friday', { during: () => kb(500), after: async () => { await kb(850); } });
  check('③ the keyboard up (850 → 500) while recording and folding (→ 850) after the stop: the tray stays open, ONE request, the words land in the same focused box', d3.open && d3.requests === 1 && d3.landed && d3.same && d3.value.includes('Ship it on Friday') && (await hides()).length === 0, d3);

  // ── ④ THE CLOSERS STILL CLOSE — each says why ──
  console.log('④ Escape, a real outside tap and the back still close — and name their cause');
  await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(BOX)}); b.focus(); b.select(); return true; })()`);
  await cdp('Input.insertText', { text: 'draft words' });
  await key('Escape');
  const e1 = await evalJs(`({ open: !document.getElementById('user-todos-popup').classList.contains('hidden'), box: !!document.querySelector(${JSON.stringify(BOX)}) })`);
  check('④a Escape in the reply box FOLDS it (the box gone) and the tray stays open — no popup-hide', e1.open && !e1.box && (await hides()).length === 0, e1);
  const out = await evalJs(`(() => { const p = document.getElementById('user-todos-popup').getBoundingClientRect(); const y = Math.min(innerHeight - 12, Math.max(p.bottom + 40, innerHeight - 40)); const el = document.elementFromPoint(224, y); return { y, below: y > p.bottom, el: el ? (el.id || el.className || el.tagName) : null, inTray: !!(el && el.closest('#user-todos-popup')), control: !!(el && el.closest('button, a[href], input, textarea, .ut-item')) }; })()`);
  await tapAt(224, out.y);
  check('④b a real tap OUTSIDE the tray (the page behind, no control under it) closes it — why \'outside\' in the op ring', out.below && !out.inTray && !out.control && !(await trayOpen()) && JSON.stringify(await hides()) === JSON.stringify([{ op: 'popup-hide', panel: 'for-you', why: 'outside' }]), { out, hides: await hides() });
  await openReply();
  const draft = await evalJs(`document.querySelector(${JSON.stringify(BOX)})?.value ?? null`);
  check('④c …and the folded box\'s draft is back on the next Reply (a closed tray keeps nothing but the drafts)', draft === 'draft words', draft);
  await evalJs('document.activeElement && document.activeElement.blur(); true');
  await key('Escape');
  check('④d Escape on the tray (not in a box) closes it — why \'escape\'', !(await trayOpen()) && (await hides()).at(-1)?.why === 'escape', await hides());
  await evalJs(`document.getElementById('taskbar-user-todos').click(); true`); await sleep(300); // the sheet's own door (lane foryou-honest: the badge opens the page)
  const opened = await trayOpen();
  for (const type of ['rawKeyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, modifiers: 1, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 }); // the browser's own back (Alt+Left = NavigationController::GoBack)
  await sleep(800);
  const h = await cdp('Page.getNavigationHistory');
  check('④e the browser\'s back closes the tray — why \'back\' — and VibeSpace stays', opened && !(await trayOpen()) && (await hides()).at(-1)?.why === 'back' && h.entries[h.currentIndex].url.startsWith(ORIGIN), { opened, hides: await hides(), url: h.entries[h.currentIndex].url });
  check('no page errors (the real bundle)', pageErrors.length === 0, pageErrors.slice(0, 5));

  // ── ⑤ RED CONTROL: the base's closer, from a patched copy of today's utils.js ──
  console.log('⑤ RED CONTROL — the base\'s closer (a patched copy of today\'s utils.js in the throwaway worktree; one esbuild)');
  const U = path.join(wt, 'src/lib/utils.js');
  const src = fs.readFileSync(U, 'utf8');
  const EDITS = [
    ['    voice: !!target?.closest?.(VOICE_UI),\n', ''], // the base had no voice fact
    ['seen: where(e.target, e) };', 'target: e.target };'], // the base kept the down TARGET…
    ['judge(p.seen, e);', 'judge(where(p.target, e), e);'], // …and measured it at the LIFT
  ];
  check('the three edits the control makes are each spelled exactly once in utils.js', EDITS.every(([a]) => src.split(a).length === 2));
  fs.writeFileSync(U, EDITS.reduce((s, [a, b]) => s.replace(a, b), src));
  const esbuild = path.join(repo, 'node_modules', '.bin', 'esbuild');
  execFileSync(esbuild, ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify', '--log-level=error'], { cwd: wt, stdio: 'ignore' });
  await boot(); await tapAt(224, 820);
  await openReply();
  const r1 = await dictate('Use the cold bucket');
  await sleep(600); // the recording's tick (four times a second) finds its microphone gone
  check('CONTROL ① the base closer: the same held stop CLOSES the tray (why \'outside\' — the op ring names the closer the incident could not), NO request leaves the page, the words never land', r1.stop.gone && !r1.open && !r1.landed && r1.requests === 0 && (await hides()).some((x) => x.why === 'outside'), { r1, hides: await hides() });
  await openReply();
  const before2 = await evalJs('window.__dictates');
  await tap(MIC); await waitFor(`!!document.querySelector(${JSON.stringify(`${MIC}.recording`)})`, 3000); await sleep(600);
  const onBtn = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(MIC)}); const r = b.getBoundingClientRect(); for (let y = r.top + 2; y < r.bottom - 1; y += 2) for (let x = r.left + 2; x < r.right - 1; x += 2) if (document.elementFromPoint(x, y) === b) return { x, y }; return null; })()`);
  await tapAt(onBtn.x, onBtn.y); // a tap on the BUTTON itself (between its spans — the redraw never detaches it): the base closer lets the stop through
  await waitFor('!!document.querySelector(".voice-chip-float:not(.hidden) .voice-chip-btn")', 5000);
  await evalJs('window.__ops.length = 0; true');
  await tap('.voice-chip-float:not(.hidden) .voice-chip-btn');
  check('CONTROL ② the base closer: a tap on the floating chip CLOSES the tray (why \'outside\')', (await evalJs('window.__dictates')) === before2 + 1 && !(await trayOpen()) && (await hides()).some((x) => x.why === 'outside'), await hides());
  fs.writeFileSync(U, src);
  fs.copyFileSync(path.join(repo, 'public', 'bundle.js'), path.join(wt, 'public', 'bundle.js'));
  await boot(); await tapAt(224, 820);
  await openReply();
  const r3 = await dictate('Use the cold bucket');
  check('the real bundle back: the same held stop keeps the tray open and the words land (the fix, not the reload)', r3.stop.gone && r3.open && r3.requests === 1 && r3.landed && (await hides()).length === 0, r3);
} catch (err) {
  fail++; console.log('  ✗ the suite threw: ' + (err?.stack || err));
}
console.log(`PNG: ${path.join(SHOTS, 'tray-voice-phone.png')}`);
console.log(`${fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`}`);
// Chrome first, and wait for it: a profile dir removed while its processes still write comes back
try { sock.close(); } catch { }
if (chrome.exitCode === null) { const gone = new Promise((r) => chrome.once('exit', r)); chrome.kill('SIGKILL'); await Promise.race([gone, sleep(3000)]); }
try { endRootedProcesses(chromeDir); } catch { }
await sleep(300);
process.exit(fail ? 1 : 0);
