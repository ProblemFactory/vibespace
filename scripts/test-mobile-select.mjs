#!/usr/bin/env node
// A LONG PRESS ON CHAT TEXT SELECTS IT — the real browser (lane mobile-select, 2026-10-02; the owner, from a tester's
// phone: "手机模式下想要复制一段chatview里的内容会触发右键菜单导致选择了右键菜单的内容，无法正确选择要复制的内容").
// A THROWAWAY server in a git worktree (own data/, a scratch HOME with one view-only fixture transcript) + headless
// chrome over raw CDP. The phone: 390×844, DPR 3, an Android UA, touch emulation, hover:none / pointer:coarse.
// TWO touch paths, both measured:
//   ANDROID-SHAPED — Emulation.setEmitTouchEventsForMouse('mobile'): Chrome's OWN gesture provider runs, so the native
//     long press happens (selectstart → the word selected → a TRUSTED contextmenu, pointerType touch, ~680 ms) beside
//     our 500 ms timer — the incident's exact order. (Input.dispatchTouchEvent never produces the native long press in
//     headless — measured.)
//   iOS-SHAPED — Input.dispatchTouchEvent held 700 ms: no native long press, our timer is the only menu source.
// Legs:
//   ① the … button on every user / assistant text message, ≥ 36 px wide, drawn over none of its message's words, the
//      element under its own centre (verify r1 F1: a code-first message's toolbar painted over it), no code block /
//      table narrowed beside it (F1: a BFC beside the float was 38 px narrower to its end); ①b the same in BUBBLE mode
//      (F2: the shrink-to-fit bubble put a short message's words UNDER the button)
//   ② ANDROID: a long press on an assistant paragraph ⇒ the platform's selection (non-empty, in that paragraph), the
//      trusted contextmenu NOT cancelled, no synthetic one, NO menu in the DOM, nothing drawn over the selected word
//   ③ iOS: a long press on the words ⇒ no synthetic contextmenu, no menu
//   ④ a long press on the message's chrome — the gutter, the Thinking toggle, the role label (label mode) ⇒ the menu;
//      ANDROID in the gutter: ONE menu build (the trusted one after ours is swallowed)
//   ⑤ the … tap ⇒ the menu; Copy text ⇒ the WHOLE message on the clipboard, the toast naming its lines (M3)
//   ⑥ M2: the menu open, a long press on another message's words ⇒ the menu closes, the selection stands
//   ⑦ M2 census on live surfaces: the message menu, Message details, a toast — every element computed user-select none;
//      each chrome selector built INSIDE the selectable chat list still none, a plain div there 'text' (the control)
//   ⑧ DESKTOP unchanged (1280×800, mouse): no … buttons; a right-click on the words is not cancelled and opens no app
//      menu; a right-click on the strip opens Message details
//   ⑨ a touch TABLET (1024×768, hover none / pointer coarse, not ≤ 768 px): the hover buttons are hidden, the … is the
//      element under its centre and a tap on it opens the menu (verify r1 F3: an invisible "Open in editor" sat over it)
// Requires google-chrome (SKIP without). Run: node scripts/test-mobile-select.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratchDir, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const ROOT = scratchDir('msel'); // ONE scratch root: the worktree, HOME, chrome profile and shots live under it
const wt = path.join(ROOT, 'wt'), fakeHome = path.join(ROOT, 'home'), SHOTS = path.join(ROOT, 'shots');
for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
const SID = 'f01d0000-0000-4000-8000-00000000c0de'; // view-only fixture (the mobile-gaps precedent: a non-guarded id under a scratch HOME)
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the fixture: four turns, each answer a wrapped paragraph + a code block, one Thinking card ──────────────────────
fs.mkdirSync(CWD, { recursive: true });
const ANSWER = (k) => `Answer ${k}: the quick brown fox jumps over the lazy dog, a line of prose long enough to wrap on a phone screen twice over.\n\n\`\`\`js\nconst x = ${k};\n\`\`\``;
// verify r1: a message whose FIRST block is a code block (its toolbar sat over the …) and one whose first block is a table
const CODE_FIRST = '```js\nconst x = 0; // a code block as the FIRST block of the message\n```\nthen a closing line.';
const TABLE_FIRST = '| col a | col b |\n|---|---|\n| 1 | 2 |\n\na line after the table.';
const textOf = (k) => (k === 0 ? CODE_FIRST : k === 1 ? TABLE_FIRST : ANSWER(k));
{
  const lines = []; let ts0 = Date.now() - 3600e3, n = 0;
  const ts = () => new Date((ts0 += 5e3)).toISOString();
  for (let k = 0; k < 6; k++) {
    // k = 0 is a two-letter question: in bubble mode a message shorter than the button is the one whose words fell
    // UNDER it (verify r1 F2 — the longer questions still wrapped beside the float, so only this row catches a revert)
    lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: k === 0 ? 'hi' : `question ${k} about the deployment plan` }, uuid: `u-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID }));
    if (k === 1) lines.push(JSON.stringify({ type: 'assistant', message: { id: `msg_t${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'thinking', thinking: 'Let me check the plan before answering.', signature: 'sig' }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `t-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID }));
    lines.push(JSON.stringify({ type: 'assistant', message: { id: `msg_${n}`, role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: textOf(k) }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: `a-${n++}`, timestamp: ts(), cwd: CWD, sessionId: SID }));
  }
  const proj = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.join('\n') + '\n');
}

// ── throwaway server in a worktree (no rebuild: overlays the built public/) ──
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [path.join(ROOT, 'chrome'), fakeHome, wt]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  if (!failed) { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} } // a red run keeps its shots for the human look
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP, one client per page ────────────────────────────────────────────
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const connectPage = async (wsUrl) => {
  const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  let seq = 0; const pend = new Map(); const pageErrors = [];
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
  });
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
    sock.send(JSON.stringify({ id, method, params }));
  });
  /** a command whose ack may never come (the touch emulator holds a pressed mouse's ack) — sent, never awaited */
  const send = (method, params = {}) => { const id = ++seq; sock.send(JSON.stringify({ id, method, params })); };
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(150); } return evalJs(expr); };
  const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  const front = () => cdp('Page.bringToFront');
  const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch {} };
  return { cdp, send, evalJs, waitFor, waitApp, front, shot, pageErrors };
};
// the page's event log (window CAPTURE — before the door can stop anything) + every menu build, from the first script
const INSTRUMENT = `(() => { window.__log = []; window.__menus = 0;
  const desc = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return el ? el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '') : null; };
  for (const type of ['touchstart', 'touchend', 'contextmenu', 'selectstart']) addEventListener(type, (e) => { const row = { type, trusted: e.isTrusted, ptype: e.pointerType ?? null, target: desc(e.target) }; window.__log.push(row); setTimeout(() => { row.prevented = e.defaultPrevented; }, 0); }, true);
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('context-menu')) window.__menus++; }).observe(document, { childList: true, subtree: true }); // the Document itself: documentElement does not exist yet when this runs
})();`;

const phone = await connectPage(target.webSocketDebuggerUrl);
const { cdp, evalJs, waitFor } = phone;
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';
// (a toast too: ⑤'s "Copied…" toast outlived its leg and sat over the bottom row of ⑦'s menu — the tap hit the toast)
const resetLog = () => evalJs(`window.__log = []; window.__menus = 0; getSelection().removeAllRanges(); document.querySelectorAll('.context-menu, .msg-meta-pop, .global-toast').forEach((p) => p.remove()); true`);
/** the point over word `word` of the n-th visible element matching sel (CSS px of the emulated viewport) */
const wordPoint = (sel, word, nth = -1) => evalJs(`(() => { const all = [...document.querySelectorAll(${JSON.stringify(sel)})]; const el = all.at(${nth}); if (!el) return null; el.scrollIntoView({ block: 'center' });
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const i = n.data.indexOf(${JSON.stringify(word)}); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + ${word.length}); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; } } return null; })()`);
/** ANDROID-SHAPED long press: Chrome's own touch emulator turns a held mouse into a touch + its gestures */
const androidPress = async (pt, holdMs = 900) => {
  await phone.front();
  await cdp('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  phone.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(holdMs);
  phone.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(350);
  await cdp('Emulation.setEmitTouchEventsForMouse', { enabled: false });
};
/** iOS-SHAPED long press / a tap: raw touch events (no native gesture in headless — our timer is the only menu) */
const touchPress = async (pt, holdMs = 700) => {
  await phone.front();
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
  await sleep(holdMs);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250);
};
const tapAt = (pt) => touchPress(pt, 60);
const centerOf = (sel, nth = -1) => evalJs(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].at(${nth}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const menuItems = () => evalJs(`[...document.querySelectorAll('.context-menu.chat-msg-menu .context-menu-item')].map((el) => el.textContent.trim())`);
const escape = async () => { await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); true`); await sleep(150); };

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await cdp('Emulation.setUserAgentOverride', { userAgent: ANDROID_UA, platform: 'Linux armv8l' });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  await cdp('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: `http://127.0.0.1:${PORT}` });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await phone.waitApp();
  await sleep(1000);
  const env = await evalJs(`({ mobile: app.isMobile, touch: app.isTouch, iw: innerWidth, dpr: devicePixelRatio })`);
  check(`the phone: app.isMobile + app.isTouch at ${env.iw} px, DPR ${env.dpr}`, env.mobile && env.touch && env.iw === 390 && env.dpr === 3, env);
  await evalJs(`app.viewSession(${JSON.stringify(SID)}, ${JSON.stringify(CWD)}, 'mobile select'); true`);
  check('the view-only fixture chat renders (6 answers + 1 Thinking card)', await waitFor(`document.querySelectorAll('.chat-view .chat-msg-assistant .chat-text p').length >= 6 && !!document.querySelector('.chat-view .chat-thinking summary')`, 20000));
  await sleep(600);

  // ── ① the … button ──
  console.log('① the … button');
  // THE CENSUS over every text message: the button, glyph hits, the element under its centre, BFC blocks narrowed
  // beside it, the first text line beside (not under) it — run in compact mode (the default) and in bubble mode (①b)
  const CENSUS = `(() => { const msgs = [...document.querySelectorAll('.chat-view .chat-msg')].filter((m) => m.querySelector('.chat-text'));
    const rows = msgs.map((m) => { const b = m.querySelector('.chat-msg-more'); if (!b) return { has: false };
      m.scrollIntoView({ block: 'center' });
      const br = b.getBoundingClientRect(); const hits = []; let firstTop = null;
      const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (!n.data.trim() || b.contains(n)) continue; const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) { if (q.right > br.left + 0.5 && q.left < br.right - 0.5 && q.bottom > br.top + 0.5 && q.top < br.bottom - 0.5) hits.push(n.data.slice(0, 20)); if (firstTop == null || q.top < firstTop) firstTop = q.top; } }
      const at = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2); const covered = !(at && (at === b || b.contains(at)));
      const text = m.querySelector('.chat-text'); const tw = text ? text.getBoundingClientRect().width : 0;
      const narrowed = [...m.querySelectorAll('.chat-text pre, .chat-code-block, .chat-table-wrap')].filter((x) => tw - x.getBoundingClientRect().width > 2).map((x) => x.className || x.tagName);
      const tb = m.querySelector('.chat-code-toolbar'); const toolbarBelow = tb ? tb.getBoundingClientRect().top >= br.bottom - 1 : null;
      const firstBlock = text && [...text.children].find((c) => c !== b); const clearedFirst = !!firstBlock && firstBlock.matches('.chat-pre-wrap, .chat-table-wrap'); // F1: a code block / table first starts BELOW the button by design (bubble mode hosts the button in .chat-text itself)
      return { has: true, w: Math.round(br.width), h: Math.round(br.height), hits, covered, at: covered && at ? at.tagName.toLowerCase() + '.' + String(at.className).split(' ')[0] : null, narrowed, toolbarBelow, clearedFirst, textBeside: firstTop != null && firstTop < br.bottom - 2, firstKind: (b.parentElement && [...b.parentElement.children].find((c) => c !== b)?.tagName.toLowerCase()) || null, us: getComputedStyle(b).userSelect, label: b.getAttribute('aria-label') }; });
    return { n: msgs.length, compact: !!document.querySelector('.chat-compact'), rows, thinking: !!document.querySelector('.chat-view .chat-msg:has(.chat-thinking) .chat-msg-more') }; })()`;
  const more = await evalJs(CENSUS);
  check(`every user / assistant text message carries a … button (${more.rows.filter((r) => r.has).length}/${more.n}, compact mode)`, more.compact && more.n === 12 && more.rows.every((r) => r.has), more);
  check(`…≥ 36 px wide, labelled, user-select none (${more.rows[0]?.w}×${more.rows[0]?.h}, "${more.rows[0]?.label}")`, more.rows.every((r) => r.w >= 36 && r.label === 'Message actions' && r.us === 'none'), more.rows[0]);
  check('…and drawn over NONE of its message\'s words (the 21×16 hover buttons overlapped 18 of 18 — design-mobile-gaps)', more.rows.every((r) => r.hits.length === 0), more.rows.filter((r) => r.hits.length));
  check('…the element under its own centre on every message (verify r1 F1: a code-first message\'s toolbar "Wrap" sat over it)', more.rows.every((r) => !r.covered), more.rows.filter((r) => r.covered));
  check('…no code block / table narrowed beside it; the code-first message\'s toolbar sits BELOW the button (F1: a BFC beside the float was 38 px narrower to its last line)', more.rows.every((r) => r.narrowed.length === 0) && more.rows.some((r) => r.toolbarBelow === true) && more.rows.every((r) => r.toolbarBelow !== false), more.rows.filter((r) => r.narrowed.length || r.toolbarBelow === false));
  check('…the first line of every paragraph-first message beside the button, never under it; a code-first / table-first message starts below it (F1, the clear)', more.rows.every((r) => (r.clearedFirst ? !r.textBeside : r.textBeside)) && more.rows.filter((r) => r.clearedFirst).length === 2, more.rows.filter((r) => (r.clearedFirst ? r.textBeside : !r.textBeside)));
  check('the Thinking card (no text to copy beyond its toggle) has none — its toggle is the menu press', !more.thinking);
  // ①b BUBBLE MODE (verify r1 F2): the bubble is a shrink-to-fit flex item — with the float in the bubble every short
  // message's words went UNDER the button ("hi" 41 → 68 px wide, +28 px); inside the first paragraph they share the line
  await evalJs(`app.settings.set('chat.compactMode', false); true`); await sleep(600);
  const bub = await evalJs(CENSUS);
  check(`BUBBLE mode: every text message carries the … (${bub.rows.filter((r) => r.has).length}/${bub.n}), over none of its words, the element under its centre`, !bub.compact && bub.n === 12 && bub.rows.every((r) => r.has && r.hits.length === 0 && !r.covered), bub.rows.filter((r) => !r.has || r.hits.length || r.covered));
  check('BUBBLE mode: the first line of EVERY paragraph-first message beside the button (the short user questions included) — never under it; the two block-first ones below it', bub.rows.every((r) => (r.clearedFirst ? !r.textBeside : r.textBeside)) && bub.rows.filter((r) => r.clearedFirst).length === 2, bub.rows.filter((r) => (r.clearedFirst ? r.textBeside : !r.textBeside)));
  check('BUBBLE mode: no code block / table narrowed beside the button', bub.rows.every((r) => r.narrowed.length === 0 && r.toolbarBelow !== false), bub.rows.filter((r) => r.narrowed.length || r.toolbarBelow === false));
  await phone.shot('01b-bubble.png');
  await evalJs(`app.settings.set('chat.compactMode', true); true`); await sleep(600);
  await phone.shot('01-more-buttons.png');

  // ── ② ANDROID: a long press on the words ──
  console.log('② Android-shaped long press on an assistant paragraph');
  await resetLog();
  const pt = await wordPoint('.chat-view .chat-msg-assistant .chat-text p', 'quick');
  await androidPress(pt);
  const a = await evalJs(`(() => { const s = getSelection(); const r = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null; const at = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    return { sel: s.toString(), inPara: !!s.anchorNode && !!s.anchorNode.parentElement?.closest('.chat-msg-assistant .chat-text p'), menus: document.querySelectorAll('.context-menu').length, built: window.__menus, log: window.__log, over: at ? (at.closest('.context-menu, [data-popover]') ? 'menu' : at.tagName.toLowerCase()) : null }; })()`);
  const trustedCm = a.log.filter((r) => r.type === 'contextmenu' && r.trusted);
  const synthCm = a.log.filter((r) => r.type === 'contextmenu' && !r.trusted);
  console.log('    measured order: ' + a.log.map((r) => `${r.type}${r.type === 'contextmenu' ? (r.trusted ? '(trusted ' + r.ptype + ')' : '(synthetic)') : ''}${r.prevented ? '[prevented]' : ''}`).join(' → '));
  check(`the platform's selection holds a word of that paragraph ("${a.sel}")`, a.sel.trim().length > 0 && a.inPara, a);
  check('the native long press happened (selectstart, then a TRUSTED touch contextmenu) and the page did NOT cancel it', a.log.some((r) => r.type === 'selectstart') && trustedCm.length === 1 && trustedCm[0].ptype === 'touch' && trustedCm[0].prevented === false, a.log);
  check('no synthetic contextmenu was dispatched (the door never armed its timer on text)', synthCm.length === 0, synthCm);
  check(`NO menu in the DOM, none built (${a.menus} / ${a.built}), nothing drawn over the selected word (${a.over})`, a.menus === 0 && a.built === 0 && a.over !== 'menu', a);
  await phone.shot('02-android-selection.png');

  // ── ③ iOS: our timer is the only menu source ──
  console.log('③ iOS-shaped long press on the words');
  await resetLog();
  await touchPress(await wordPoint('.chat-view .chat-msg-assistant .chat-text p', 'lazy', -2));
  const i3 = await evalJs(`({ cm: window.__log.filter((r) => r.type === 'contextmenu').length, built: window.__menus, end: window.__log.find((r) => r.type === 'touchend') })`);
  check(`no synthetic contextmenu, no menu (${i3.cm} / ${i3.built}), the touchend not cancelled (the platform's selection would stand)`, i3.cm === 0 && i3.built === 0 && i3.end && i3.end.prevented === false, i3);

  // ── ④ the message's chrome keeps the menu ──
  console.log('④ a long press on the message\'s chrome');
  await resetLog();
  const gutter = await evalJs(`(() => { const m = [...document.querySelectorAll('.chat-view .chat-msg-assistant')].filter((x) => x.querySelector('.chat-text p')).at(-1); m.scrollIntoView({ block: 'center' }); const r = m.getBoundingClientRect(); const p = m.querySelector('.chat-text p').getBoundingClientRect(); return { x: r.left + 1.5, y: p.top + 8 }; })()`); // the role strip: the phone's gutter is ~11 px (3 px strip + 8 px padding), its middle is within the text slop
  const gutterIs = await evalJs(`(() => { const el = document.elementFromPoint(${gutter.x}, ${gutter.y}); return el ? el.className : null; })()`);
  await touchPress(gutter);
  let items = await menuItems();
  check(`a long press in the message GUTTER (left of the words, on ${gutterIs}) opens the message menu: ${items.join(' / ')}`, items.includes('Copy text') && items.includes('Open in editor') && items.includes('Message details'), items);
  await escape();
  await resetLog();
  await androidPress(gutter);
  const g2 = await evalJs(`({ built: window.__menus, open: document.querySelectorAll('.context-menu.chat-msg-menu').length, cms: window.__log.filter((r) => r.type === 'contextmenu').map((r) => (r.trusted ? 'trusted' : 'synthetic') + (r.prevented ? '/prevented' : '')), sel: getSelection().toString(), log: window.__log.map((r) => r.type + (r.trusted ? '' : '(synthetic)') + ':' + r.target) })`);
  check(`ANDROID on the strip: our menu at 500 ms, the trusted contextmenu after it swallowed — ONE menu built and still open (${g2.built}; ${g2.cms.join(', ')})`, g2.built === 1 && g2.open === 1 && g2.cms.includes('synthetic/prevented') && g2.cms.includes('trusted/prevented'), g2);
  check(`…and the platform's long press selected nothing under it ("${g2.sel}" — before the hold-off it selected "Answer" and that selection closed the menu)`, g2.sel === '', g2);
  await escape();
  await resetLog();
  await touchPress(await centerOf('.chat-view .chat-thinking > summary'));
  items = await menuItems();
  check(`a long press on the Thinking toggle (a <summary>) opens the menu: ${items.join(' / ')}`, items.includes('Copy text') && items.includes('Message details'), items);
  await escape();
  await evalJs(`document.querySelector('.chat-view').dataset.roleIndicator = 'label'; true`); await sleep(200);
  await resetLog();
  await touchPress(await centerOf('.chat-view .chat-msg-user .chat-role'));
  items = await menuItems();
  const roleUS = await evalJs(`getComputedStyle(document.querySelector('.chat-view .chat-role')).userSelect`);
  check(`label mode: a long press on the role label (the message HEADER, user-select ${roleUS}) opens the menu: ${items.join(' / ')}`, roleUS === 'none' && items.includes('Copy text'), items);
  await escape();
  await evalJs(`document.querySelector('.chat-view').dataset.roleIndicator = 'border'; true`); await sleep(200);

  // ── ⑤ the … tap + Copy text (M3) ──
  console.log('⑤ the … button and Copy text');
  await resetLog();
  await tapAt(await centerOf('.chat-view .chat-msg-assistant .chat-msg-more'));
  items = await menuItems();
  check(`a tap on the … button opens the message menu: ${items.join(' / ')}`, items[0] === 'Copy text' && items.includes('Open in editor') && items.includes('Message details'), items);
  await phone.shot('05-more-menu.png');
  await tapAt(await evalJs(`(() => { const el = [...document.querySelectorAll('.chat-msg-menu .context-menu-item')].find((x) => x.textContent.trim() === 'Copy text'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
  await sleep(300);
  const want = textOf(5); // the last assistant message
  const wantLines = want.split('\n').length;
  const toast = await evalJs(`[...document.querySelectorAll('.global-toast')].map((t) => t.textContent.trim()).join(' | ')`);
  const clip = await evalJs(`navigator.clipboard.readText().catch((e) => 'ERR ' + e.message)`);
  check(`Copy text puts the WHOLE message on the clipboard (${clip.length} chars, the last answer verbatim)`, clip === want, { clip: clip.slice(0, 80), want: want.slice(0, 80) });
  check(`…and the toast names what was copied: "${toast}"`, toast.includes(`Copied the whole message (${wantLines} lines)`), toast);
  check('…and the menu closed', await evalJs(`!document.querySelector('.chat-msg-menu')`));

  // ── ⑥ M2: a selection that starts outside the open menu closes it ──
  console.log('⑥ the menu open, a long press on other words');
  await resetLog();
  await tapAt(await centerOf('.chat-view .chat-msg-user .chat-msg-more', -1));
  const open6 = await evalJs(`!!document.querySelector('.chat-msg-menu')`);
  await androidPress(await wordPoint('.chat-view .chat-msg-assistant .chat-text p', 'brown', -1));
  const s6 = await evalJs(`({ open: !!document.querySelector('.chat-msg-menu'), sel: getSelection().toString() })`);
  check(`the menu was open (${open6}); the long press on another message's words selects ("${s6.sel}") AND closes it (a long press is never an outside TAP — the selection closer did)`, open6 && !s6.open && s6.sel.trim().length > 0, s6);

  // ── ⑦ the user-select census on live surfaces ──
  console.log('⑦ chrome text is never selectable');
  await resetLog();
  await tapAt(await centerOf('.chat-view .chat-msg-assistant .chat-msg-more'));
  const usOf = (sel) => evalJs(`(() => { const root = document.querySelector(${JSON.stringify(sel)}); if (!root) return null; const els = [root, ...root.querySelectorAll('*')].filter((e) => !e.matches('input, textarea, select, [contenteditable]')); return { n: els.length, bad: els.filter((e) => getComputedStyle(e).userSelect !== 'none').map((e) => e.className || e.tagName) }; })()`);
  const menuUS = await usOf('.context-menu.chat-msg-menu');
  check(`the message menu: every element user-select none (${menuUS?.n} elements)`, menuUS && menuUS.n >= 4 && menuUS.bad.length === 0, menuUS);
  await tapAt(await evalJs(`(() => { const el = [...document.querySelectorAll('.chat-msg-menu .context-menu-item')].find((x) => x.textContent.trim() === 'Message details'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
  await sleep(250);
  await phone.shot('07-meta.png');
  const metaUS = await usOf('.msg-meta-pop');
  check(`Message details (a popover): every element user-select none (${metaUS?.n} elements)`, metaUS && metaUS.n >= 4 && metaUS.bad.length === 0, metaUS);
  await escape(); await evalJs(`document.querySelectorAll('.msg-meta-pop').forEach((p) => p.remove()); true`);
  const toastUS = await usOf('#global-toasts');
  check(`the toast stack: every element user-select none (${toastUS?.n} elements)`, toastUS && toastUS.n >= 1 && toastUS.bad.length === 0, toastUS);
  const built = await evalJs(`(() => { const list = document.querySelector('.chat-view .chat-message-list');
    const make = (attrs) => { const d = document.createElement('div'); for (const [k, v] of Object.entries(attrs)) d.setAttribute(k, v); const row = document.createElement('div'); row.className = 'context-menu-item'; row.textContent = 'words'; d.appendChild(row); list.appendChild(d); return d; };
    const cases = { '[data-popover]': { 'data-popover': '1' }, '.context-menu': { class: 'context-menu' }, '.global-toast': { class: 'global-toast' }, '.overlap-switcher': { class: 'overlap-switcher' }, '.tab-item': { class: 'tab-item' }, '.chat-msg-more': { class: 'chat-msg-more' }, 'plain div (control)': {} };
    const out = {}; for (const [k, attrs] of Object.entries(cases)) { const d = make(attrs); out[k] = getComputedStyle(d.firstChild).userSelect; d.remove(); } return out; })()`);
  const chromeOk = Object.entries(built).filter(([k]) => !k.startsWith('plain')).every(([, v]) => v === 'none');
  check(`each chrome surface built INSIDE the selectable chat list stays none (${Object.entries(built).map(([k, v]) => k + ':' + v).join(', ')}) — the plain div there is 'text' (the control: the list opts in, the rule is what differs)`, chromeOk && built['plain div (control)'] === 'text', built);

  // ── ⑧ DESKTOP unchanged ──
  console.log('⑧ desktop (mouse) unchanged');
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
  let dt = null;
  for (let i = 0; i < 40 && !dt; i++) { dt = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.id === targetId); if (!dt) await sleep(150); }
  const desk = await connectPage(dt.webSocketDebuggerUrl);
  await desk.cdp('Runtime.enable'); await desk.cdp('Page.enable');
  await desk.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await desk.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await desk.cdp('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
  await desk.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await desk.waitApp(); await sleep(800);
  await desk.front();
  const denv = await desk.evalJs(`({ touch: app.isTouch, mobile: app.isMobile })`);
  if (!(await desk.evalJs(`document.querySelectorAll('.chat-view .chat-text p').length >= 4`))) {
    await desk.evalJs(`app.viewSession(${JSON.stringify(SID)}, ${JSON.stringify(CWD)}, 'mobile select'); true`);
  }
  check('the desktop page renders the same chat (not touch, not mobile)', !denv.touch && !denv.mobile && await desk.waitFor(`document.querySelectorAll('.chat-view .chat-text p').length >= 4`, 20000), denv);
  await sleep(500);
  check('no … buttons on a mouse client (the hover buttons + the strip serve it)', await desk.evalJs(`document.querySelectorAll('.chat-msg-more').length === 0 && document.querySelectorAll('.chat-msg > .chat-open-editor-btn').length > 0`));
  const rclick = async (p) => { await desk.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await desk.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'right', clickCount: 1 }); await desk.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'right', clickCount: 1 }); await sleep(300); };
  await desk.evalJs(`window.__log = []; true`);
  const dp = await desk.evalJs(`(() => { const p = [...document.querySelectorAll('.chat-view .chat-msg-assistant .chat-text p')].at(-1); p.scrollIntoView({ block: 'center' }); const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); const n = w.nextNode(); const i = n.data.indexOf('quick'); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 5); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await rclick(dp);
  const d1 = await desk.evalJs(`({ cm: window.__log.filter((r) => r.type === 'contextmenu'), menu: !!document.querySelector('.chat-msg-menu'), meta: !!document.querySelector('.msg-meta-pop') })`);
  check('a right-click on the words: the browser\'s own menu (the contextmenu NOT cancelled), no app menu, no metadata popup — as before', d1.cm.length === 1 && d1.cm[0].ptype === 'mouse' && d1.cm[0].prevented === false && !d1.menu && !d1.meta, d1);
  const strip = await desk.evalJs(`(() => { const m = [...document.querySelectorAll('.chat-view .chat-msg-assistant')].filter((x) => x.querySelector('.chat-text p')).at(-1); const r = m.getBoundingClientRect(); return { x: r.left + 3, y: r.top + 12 }; })()`);
  await rclick(strip);
  check('a right-click on the message\'s left strip opens Message details — as before', await desk.evalJs(`!!document.querySelector('.msg-meta-pop')`));
  await desk.front().catch(() => {});

  // ── ⑨ a touch TABLET (verify r1 F3) ──
  console.log('⑨ a touch tablet (1024×768, hover none / coarse — isTouch, not isMobile)');
  const tabT = await cdp('Target.createTarget', { url: 'about:blank' });
  let tt = null;
  for (let i = 0; i < 40 && !tt; i++) { tt = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.id === tabT.targetId); if (!tt) await sleep(150); }
  const tab = await connectPage(tt.webSocketDebuggerUrl);
  await tab.cdp('Runtime.enable'); await tab.cdp('Page.enable');
  await tab.cdp('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 2, mobile: true });
  await tab.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await tab.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  await tab.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await tab.cdp('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
  await tab.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await tab.waitApp(); await sleep(800);
  await tab.front();
  if (!(await tab.evalJs(`document.querySelectorAll('.chat-view .chat-msg-more').length >= 12`))) await tab.evalJs(`app.viewSession(${JSON.stringify(SID)}, ${JSON.stringify(CWD)}, 'mobile select'); true`);
  check('the tablet page: isTouch, not isMobile, the … buttons present', await tab.waitFor(`app.isTouch && !app.isMobile && document.querySelectorAll('.chat-view .chat-msg-more').length >= 12`, 20000));
  await sleep(400);
  const tp = await tab.evalJs(`(() => { const b = [...document.querySelectorAll('.chat-view .chat-msg-assistant .chat-msg-more')].at(-1); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; const at = document.elementFromPoint(c.x, c.y); const hov = [...document.querySelectorAll('.chat-msg > .chat-open-editor-btn')]; return { c, atIsBtn: !!at && (at === b || b.contains(at)), at: at ? at.tagName.toLowerCase() + '.' + String(at.className).split(' ')[0] : null, hover: { n: hov.length, shown: hov.filter((h) => getComputedStyle(h).display !== 'none').length }, windows: document.querySelectorAll('.window').length }; })()`);
  check(`the hover buttons are hidden on the tablet (${tp.hover.n} buttons, ${tp.hover.shown} shown) and the … is the element under its own centre (${tp.at})`, tp.hover.n > 0 && tp.hover.shown === 0 && tp.atIsBtn, tp);
  await tab.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tp.c.x, y: tp.c.y }] }); await sleep(60);
  await tab.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300);
  const t9 = await tab.evalJs(`({ items: [...document.querySelectorAll('.context-menu.chat-msg-menu .context-menu-item')].map((el) => el.textContent.trim()), windows: document.querySelectorAll('.window').length })`);
  check(`a tap on the … opens the message menu on the tablet (${t9.items.join(' / ')}) and opens no editor window (before the fix: an invisible "Open in editor" took the tap)`, t9.items.includes('Copy text') && t9.windows === tp.windows, t9);
  await tab.shot('09-tablet.png');
  check('no page errors on any page', phone.pageErrors.length === 0 && desk.pageErrors.length === 0 && tab.pageErrors.length === 0, [...phone.pageErrors, ...desk.pageErrors, ...tab.pageErrors].slice(0, 3));
} catch (e) {
  failed++;
  console.error('  ✗ the battery threw: ' + (e?.stack || e));
  await phone.shot('zz-threw.png');
}

if (failed) console.error(`\n${failed} FAILED (${passed} passed) — screenshots in ${SHOTS}`);
else console.log(`\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
