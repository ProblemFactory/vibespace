#!/usr/bin/env node
// A DRAFT ANOTHER DEVICE SAVED NEVER REPLACES WHAT YOU ARE TYPING (lane draft-focus-guard, B-b0fa, heavy). The naive-user
// walk 2026-10-25: two clients on ONE conversation; while A typed «好，退款那条也改成同样的策略», B's 300 ms draft autosave
// landed in A's FOCUSED box and «oko好，退款那条也改成同样的策略\nk» was what got SENT; a×8 / b×8 typed interleaved left ONE
// «a» in both boxes. A THROWAWAY server in a git worktree (own data/, a scratch HOME; the working tree's src/ public/
// server.js data/bin/ — the BUILT bundle is the code under test) + headless chrome with TWO pages, each in its own window,
// both focus-emulated (two devices, both with a person at the box), on one Antigravity conversation (the fake agy behind
// the REAL agy-wrapper logs every line it reads = what was SENT). Every drafts `state-set` frame each page sends is read
// off the wire (Network.webSocketFrameSent).
//   ① A focused and typing while B saves «oko», then «k» ⇒ A's box keeps exactly A's text and Enter SENDS exactly it
//   ② A focused with an EMPTY box while B saves a draft ⇒ it waits; A blurs ⇒ it lands (and A sends nothing for it)
//   ③ a REAL mouse press on A's Send while a held draft CONTINUES A's words ⇒ what A typed is sent (the judge waits for
//      the press to end: the press blurs the box BEFORE its click sends)
//   ④ a×8 / b×8 interleaved (120 ms, then 200 ms) ⇒ each box holds exactly its own typing, each page saved only what it typed
// RED CONTROLS: ①/④ the 2.369.354 landing (the box OVERWRITTEN — its own autosave then saves what landed) patched into the
// live composers of a second conversation; ③ a judge AT the blur (no press wait) added to a third one.
// Run: node scripts/test-draft-focus-chrome.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VNC_ENV = await vncEnv();
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('draft-focus-wt');
const fakeHome = scratchHome('draft-focus-home', fs);
const stubDir = scratch('draft-focus-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
// THE STUB agy = the fake, its stdin log named by the session (CLAUDE_WEBUI_SESSION_ID rides every session's env)
const stubPath = path.join(stubDir, 'agy');
fs.writeFileSync(stubPath, `#!${process.execPath}
process.env.AGY_STUB_LOG = ${JSON.stringify(stubDir)} + '/stdin-' + (process.env.CLAUDE_WEBUI_SESSION_ID || 'none') + '.jsonl';
require(${JSON.stringify(path.join(repo, 'scripts/fixtures/antigravity-agy'))});
`, { mode: 0o755 });
const stubLog = (sid) => { try { return fs.readFileSync(path.join(stubDir, `stdin-${sid}.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
// what agy READ as the user's text (the <vibespace-context> / <vibespace-reminder> blocks the hub puts in front of a turn
// are not the user's text)
const agyRead = (sid) => stubLog(sid).filter((x) => x.stdin).map((x) => { try { return String(JSON.parse(x.stdin).message.content).replace(/^(?:<(vibespace-[a-z-]+)>[\s\S]*?<\/\1>\n*)+/, ''); } catch { return null; } });
const agyStarted = (sid) => stubLog(sid).some((x) => Array.isArray(x.argv) && x.argv.includes('--input-format'));

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, ANTIGRAVITY_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} } // dtach, the wrapper, the fake agy carry one of these roots
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
const pageErrors = [];
// ONE CDP page: its socket, evaluate, the drafts frames it SENT (off the wire)
async function connect(wsUrl, name) {
  const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, j) => { sock.on('open', r); sock.on('error', j); });
  let seq = 0; const pend = new Map(); const sent = [];
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(name + ': ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown')); } catch {} }
    if (m.method === 'Network.webSocketFrameSent') { try { const f = JSON.parse(m.params.response.payloadData); if (f && f.type === 'state-set' && f.store === 'drafts') sent.push({ key: f.key, value: f.value }); } catch {} }
  });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)); sock.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(name + ' page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(150); } return evalJs(expr); };
  return { name, sock, cdp, evalJs, waitFor, sent };
}
let firstTarget = null;
for (let i = 0; i < 120 && !firstTarget; i++) {
  try { firstTarget = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!firstTarget) await sleep(250);
}
if (!firstTarget) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
// the second device = a page in its OWN window (both visible, both focus-emulated)
const browserWs = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl;
const browser = await connect(browserWs, 'browser');
const { targetId } = await browser.cdp('Target.createTarget', { url: 'about:blank', newWindow: true });
let secondTarget = null;
for (let i = 0; i < 40 && !secondTarget; i++) { secondTarget = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.id === targetId); if (!secondTarget) await sleep(150); }
const A = await connect(firstTarget.webSocketDebuggerUrl, 'A');
const B = await connect(secondTarget.webSocketDebuggerUrl, 'B');
const V = (sid) => `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === ${JSON.stringify(sid)}))`;
const CI = (sid) => `(${V(sid)})._chatInput`;
const box = (P, sid) => P.evalJs(`${CI(sid)}._textarea.value`);
const held = (P, sid) => P.evalJs(`${CI(sid)}._heldDraft`);
const activeIsBox = (P, sid) => P.evalJs(`document.activeElement === ${CI(sid)}._textarea && document.hasFocus()`);
const focusBox = (P, sid) => P.evalJs(`${CI(sid)}._textarea.focus(); true`);
const blurBox = (P, sid) => P.evalJs(`${CI(sid)}._textarea.blur(); true`);
const typeChar = (P, ch) => P.cdp('Input.insertText', { text: ch });
const replaceBox = async (P, sid, text) => { await P.evalJs(`${CI(sid)}._textarea.select(); true`); await P.cdp('Input.insertText', { text }); };
const sentFor = (P, sid, from = 0) => P.sent.slice(from).filter((f) => f.key === 'chat:' + sid).map((f) => f.value);
const enter = async (P) => {
  for (const type of ['keyDown', 'keyUp']) await P.cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
};
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(150); } return fn(); };
// the person's words the agent read after line `from` (a turn's reminder-only line strips to nothing — not the person's)
const readSince = (sid, from) => agyRead(sid).slice(from).filter((t) => typeof t === 'string' && t.trim() !== '')[0];
// the 2.369.354 landing (CONTROL): a put-back prepends — not exercised here — everything else OVERWRITES the box
const BASE_LAND = `function (value) { this._textarea.value = value || ''; this._autoSize?.(); }`;

async function setup(P) {
  await P.cdp('Runtime.enable'); await P.cdp('Page.enable'); await P.cdp('Network.enable');
  await P.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  await P.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await P.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await P.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await P.evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
}
// a chat both pages show: A makes it the way a user does (createSession), B attaches; a layout sync between the two pages
// may move windows, so each page re-attaches until both show it
async function openChat(name, not = []) {
  await A.evalJs(`app.createSession({ cwd: ${JSON.stringify(CWD)}, name: ${JSON.stringify(name)}, mode: 'chat', backend: 'antigravity' }); true`);
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { sid = await A.evalJs(`([...app.sessions.values()].find((v) => v && v._messageList && !${JSON.stringify(not)}.includes(v.sessionId))?.sessionId) || null`); if (!sid) await sleep(250); }
  await until(() => sid && agyStarted(sid), 15000);
  for (let round = 0; round < 3; round++) {
    for (const P of [A, B]) if (!(await P.evalJs(`!!(${V(sid)})?._chatInput?._textarea`))) await P.evalJs(`app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(name)}, ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'antigravity' }); true`);
    for (const P of [A, B]) await P.waitFor(`!!(${V(sid)})?._chatInput?._textarea`, 15000);
    await sleep(1200);
    if ((await A.evalJs(`!!(${V(sid)})?._chatInput?._textarea`)) && (await B.evalJs(`!!(${V(sid)})?._chatInput?._textarea`))) break;
  }
  return sid;
}
// a layout sync between the pages can rebuild a page's windows: each leg starts with the chat on both
async function ensureChat(sid, name) {
  for (const P of [A, B]) {
    if (!(await P.waitFor(`!!(${V(sid)})?._chatInput?._textarea`, 3000))) await P.evalJs(`app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(name)}, ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'antigravity' }); true`);
    await P.waitFor(`!!(${V(sid)})?._chatInput?._textarea`, 15000);
  }
  await sleep(300);
}
const replied = (P, sid, n) => P.waitFor(`(((${V(sid)})?._messageList?.textContent || '').split('Antigravity (').length - 1) >= ${n}`, 15000);

// ① A typing, B saving: A keeps A's text and sends it
const A_TEXT = '好，退款那条也改成同样的策略';
// the CONTROL patch goes on AFTER ensureChat (a rebuilt window is a new composer)
const patchBase = async (pages, sid) => { for (const P of pages) await P.evalJs(`${CI(sid)}._landDraft = ${BASE_LAND}; true`); };
async function legTyping(sid, name, { base = [] } = {}) {
  await ensureChat(sid, name);
  await patchBase(base, sid);
  await focusBox(A, sid); await focusBox(B, sid);
  const focusedBoth = (await activeIsBox(A, sid)) && (await activeIsBox(B, sid));
  const sentB0 = B.sent.length;
  // A types one character every 90 ms (its autosave never fires mid-typing); B types «oko», pauses — its autosave goes out
  // while A is still typing — then «k» (a second save, still mid-typing for A)
  await Promise.all([
    (async () => { for (const ch of A_TEXT) { await typeChar(A, ch); await sleep(90); } })(),
    (async () => { await sleep(150); for (const ch of 'oko') { await typeChar(B, ch); await sleep(60); } await sleep(450); await typeChar(B, 'k'); })(),
  ]);
  await sleep(700);
  const out = { focusedBoth, a: await box(A, sid), b: await box(B, sid), bSaves: sentFor(B, sid).length && B.sent.slice(sentB0).filter((f) => f.key === 'chat:' + sid).map((f) => f.value), aSent: sentFor(A, sid) };
  const reads0 = agyRead(sid).length;
  await enter(A);
  out.read = await until(() => readSince(sid, reads0), 15000);
  out.cleared = await A.waitFor(`${CI(sid)}._textarea.value === ''`, 5000);
  return out;
}

try {
  await setup(A); await setup(B);
  await sleep(600);

  console.log('① A focused and typing while B saves a draft: A\'s box keeps A\'s text, and A\'s text is what is sent');
  const sid = await openChat('draft-focus');
  check('one Antigravity chat open on BOTH pages (two windows, both focus-emulated), the fake agy started behind the real wrapper', !!sid && agyStarted(sid) && !!(await B.evalJs(`!!(${V(sid)})?._chatInput`)), { sid });
  const r1 = await legTyping(sid, 'draft-focus');
  check(`A's box holds exactly what A typed (B's «oko» then «k» both saved while A typed: B sent ${JSON.stringify(r1.bSaves)})`, r1.focusedBoth && r1.a === A_TEXT && r1.b === 'okok' && Array.isArray(r1.bSaves) && r1.bSaves.includes('oko') && r1.bSaves.includes('okok'), r1);
  check('…and every drafts set A sent is a prefix of what A typed (A never saved B\'s characters)', r1.aSent.length > 0 && r1.aSent.every((v) => v === '' || A_TEXT.startsWith(v)), r1.aSent);
  check(`Enter on A ⇒ the agent READ exactly «${A_TEXT}»`, r1.read === A_TEXT && r1.cleared, { read: r1.read, cleared: r1.cleared, reads: agyRead(sid) });
  await replied(A, sid, 1);

  console.log('② A focused with an EMPTY box while B saves a draft: it waits; A blurs ⇒ it lands');
  await ensureChat(sid, 'draft-focus');
  await focusBox(A, sid); await focusBox(B, sid);
  await replaceBox(B, sid, 'draft typed on B');
  await sleep(800);
  const aSent0 = A.sent.length;
  const r2 = { aFocused: await activeIsBox(A, sid), aBox: await box(A, sid), aHeld: await held(A, sid) };
  await blurBox(A, sid);
  await sleep(400);
  r2.afterBlur = await box(A, sid); r2.heldAfter = await held(A, sid); r2.aSent = sentFor(A, sid, aSent0);
  check('A focused, empty box: B\'s draft is HELD (the box stays empty)', r2.aFocused && r2.aBox === '' && r2.aHeld === 'draft typed on B', r2);
  check('A blurs ⇒ B\'s draft lands in A\'s box, and A sends nothing for it (the store already has it)', r2.afterBlur === 'draft typed on B' && r2.heldAfter === null && r2.aSent.length === 0, r2);

  console.log('③ a REAL mouse press on A\'s Send while a held draft continues A\'s words: what A typed is sent');
  async function legPress(s, name, { judgeAtBlur = false } = {}) {
    await ensureChat(s, name);
    if (judgeAtBlur) await A.evalJs(`(() => { const ci = ${CI(s)}; ci._textarea.addEventListener('blur', () => ci._judgeHeldDraft()); return true; })()`);
    await blurBox(B, s);
    await focusBox(A, s); await replaceBox(A, s, 'hello'); await sleep(700);                  // saved: A is clean, still focused
    const bTook = await box(B, s);                                                             // B, unfocused and clean, took it
    await focusBox(B, s); await B.evalJs(`(() => { const ta = ${CI(s)}._textarea; ta.setSelectionRange(ta.value.length, ta.value.length); return true; })()`);
    await typeChar(B, ' world'); await sleep(700);                                             // B CONTINUED A's words and saved
    const before = { a: await box(A, s), held: await held(A, s), focused: await activeIsBox(A, s), bTook };
    const rect = await A.evalJs(`(() => { const b = ${CI(s)}.element.querySelector('.chat-send-btn').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    const reads0 = agyRead(s).length;
    await A.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await A.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(250);                                                                          // a person's press lasts
    const duringPress = await box(A, s);
    await A.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', buttons: 0, clickCount: 1 });
    const read = await until(() => readSince(s, reads0), 15000);
    await sleep(400);
    return { before, duringPress, read, after: await box(A, s), heldAfter: await held(A, s) };
  }
  const r3 = await legPress(sid, 'draft-focus');
  check('A typed «hello» (saved, still focused); B continued it to «hello world» ⇒ HELD in A\'s box', r3.before.a === 'hello' && r3.before.held === 'hello world' && r3.before.focused && r3.before.bTook === 'hello', r3.before);
  check('a real press on Send blurs A\'s box, the held draft does NOT land during the press, and the click SENDS «hello» — what A typed', r3.duringPress === 'hello' && r3.read === 'hello', r3);
  check('…the send\'s own save superseded the held draft (nothing lands in the emptied box afterwards)', r3.heldAfter === null && r3.after === '', r3);
  await replied(A, sid, 3);

  console.log('④ a×8 / b×8 interleaved, both boxes focused: no character of either\'s typing is lost');
  async function legInterleave(s, name, gap, { base = [] } = {}) {
    await ensureChat(s, name);
    await patchBase(base, s);
    await focusBox(A, s); await focusBox(B, s);
    await replaceBox(A, s, ''); await sleep(50); await A.evalJs(`(() => { const ta = ${CI(s)}._textarea; ta.value = ''; ta.dispatchEvent(new Event('input')); return true; })()`);
    await B.evalJs(`(() => { const ta = ${CI(s)}._textarea; ta.value = ''; ta.dispatchEvent(new Event('input')); return true; })()`);
    await sleep(900);
    const a0 = A.sent.length, b0 = B.sent.length;
    for (let i = 0; i < 8; i++) { await typeChar(A, 'a'); await sleep(gap); await typeChar(B, 'b'); await sleep(gap); }
    await sleep(900);
    const a = await box(A, s), b = await box(B, s);
    const aSent = sentFor(A, s, a0), bSent = sentFor(B, s, b0);
    const kept = (a.match(/a/g) || []).length + (b.match(/b/g) || []).length;
    return { a, b, lost: 16 - kept, aSent, bSent, ownOnly: aSent.every((v) => /^a*$/.test(v)) && bSent.every((v) => /^b*$/.test(v)) };
  }
  for (const gap of [120, 200]) {
    const r4 = await legInterleave(sid, 'draft-focus', gap);
    check(`interleaved every ${gap} ms: 0 of 16 characters lost — A «${r4.a}», B «${r4.b}»; each page saved only its own characters (A ${JSON.stringify(r4.aSent)}, B ${JSON.stringify(r4.bSent)})`, r4.a === 'aaaaaaaa' && r4.b === 'bbbbbbbb' && r4.ownOnly, r4);
  }

  console.log('RED CONTROLS — the 2.369.354 landing (the box overwritten) in a second conversation; a judge at the blur in a third');
  const sid2 = await openChat('draft-focus-base', [sid]);
  const c1 = await legTyping(sid2, 'draft-focus-base', { base: [A] });
  check(`RED CONTROL ①: the overwriting composer — A's focused box became «${c1.a}» and the agent READ «${c1.read}», not «${A_TEXT}»`, c1.a !== A_TEXT && c1.read !== A_TEXT && /o/.test(c1.read || ''), c1);
  await replied(A, sid2, 1);
  for (const gap of [120, 200]) {
    const c4 = await legInterleave(sid2, 'draft-focus-base', gap, { base: [A, B] });
    check(`RED CONTROL ④ at ${gap} ms: ${c4.lost} of 16 characters lost (A «${c4.a}», B «${c4.b}»)${c4.ownOnly ? '' : ', a page saved the other\'s characters'}`, c4.lost > 0, c4);
  }
  const sid3 = await openChat('draft-focus-blur', [sid, sid2]);
  const c3 = await legPress(sid3, 'draft-focus-blur', { judgeAtBlur: true });
  check(`RED CONTROL ③: judged AT the blur, the held «hello world» lands during the press («${c3.duringPress}») and the click sends «${c3.read}» — not what A typed`, c3.before.held === 'hello world' && c3.read === 'hello world', c3);
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++; console.error('✗ threw: ' + (e && e.stack || e));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
