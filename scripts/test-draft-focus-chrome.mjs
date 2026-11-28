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
//   ⑤ B-1d87 (the hosted print of run 44903979657, made deterministic): A makes a conversation, B's person opens it BEFORE A's record
//      reaches B (B's gate holds the record); B types, an IME composition in progress, and keeps typing THROUGH the record's apply ⇒
//      B's window STANDS (the same element) and takes A's id: one window of it on B, every character in the box, focus and caret
//      kept. RED CONTROL: B's page with the release's apply (nothing taken) ⇒ its window of the conversation is closed
// RED CONTROLS: ①/④ the 2.369.354 landing (the box OVERWRITTEN — its own autosave then saves what landed) patched into the
// live composers of a second conversation; ③ a judge AT the blur (no press wait) added to a third one.
// Run: node scripts/test-draft-focus-chrome.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, ONBOARDED_SOURCE, vncEnv, CHROME_STORE, CHROME_QUIET } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VNC_ENV = await vncEnv();
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
const [PORT, CDP_PORT] = await freePorts(2);
const root = mintRoot('draft-focus-wt'), wt = path.join(root, 't');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // rule nine (hub-boot.mjs): the suite's own browser carries a HOME in the root, so the helper ends it before the root goes
const fakeHome = path.join(root, 'home'); for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const stubDir = path.join(root, 'stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, ANTIGRAVITY_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
};
process.on('exit', cleanup);
await hub.ready();

const WebSocket = require('ws');
const pageErrors = [];
// ONE CDP page: its socket, evaluate, the drafts frames it SENT (off the wire)
async function connect(wsUrl, name) {
  const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, j) => { sock.on('open', r); sock.on('error', j); });
  let seq = 0; const pend = new Map(); const sent = [];
  // r350 (the hosted red-then-green 44774335413): the layout frames this page SENT, the ones it RECEIVED, and the server's acks of
  // its own (an ack carries the seq the server gave this page's save — so a received frame's seq names the page that sent it)
  const layoutOut = [], layoutIn = [], acks = [];
  const ring = (a, x) => { a.push(x); if (a.length > 30) a.shift(); };
  const sidsOf = (st) => (st && Array.isArray(st.windows) ? st.windows : []).map((w) => (w && w.openSpec && (w.openSpec.serverId || w.openSpec.sessionId)) || (w && w.type) || '?');
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(name + ': ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown')); } catch {} }
    if (m.method === 'Network.webSocketFrameSent') { try { const f = JSON.parse(m.params.response.payloadData); if (f && f.type === 'state-set' && f.store === 'drafts') sent.push({ key: f.key, value: f.value }); if (f && f.type === 'layout-sync') ring(layoutOut, { at: Date.now(), desktopId: f.desktopId || null, sentAt: f.sentAt ?? null, windows: sidsOf(f.state) }); } catch {} }
    if (m.method === 'Network.webSocketFrameReceived') { try { const f = JSON.parse(m.params.response.payloadData); if (f && f.type === 'layout-sync') ring(layoutIn, { at: Date.now(), seq: f.seq ?? null, desktopId: f.desktopId || null, windows: sidsOf(f.state) }); else if (f && f.type === 'layout-sync-ack') ring(acks, { at: Date.now(), seq: f.seq ?? null, sentAt: f.sentAt ?? null, desktopId: f.desktopId || null }); } catch {} }
  });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)); sock.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(name + ' page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(150); } return evalJs(expr); };
  return { name, sock, cdp, evalJs, waitFor, sent, layoutOut, layoutIn, acks };
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
// THE VIEW FIRST (the hosted run 44141280569, heavy 2/7: «B page threw … reading '_chatInput'» 16.8 s in — page B's session view was
// replaced for a moment by a re-render, so V(sid) was undefined): every read through CI(sid) first polls — bounded, on a named effect —
// for THAT page's view carrying its chat input, instead of dereferencing a view that is not there yet
// r350: AT THE BOUND the leg PRINTS what the pages can read of the cause (never a re-attach inside the wait: a second device's open chat
// window that vanishes after the other device acts is a person's lost composer and draft — a test that opened it again would hide it)
const viewReady = async (P, sid) => {
  if (await P.waitFor(`!!(${V(sid)})?._chatInput?._textarea`, 15000)) return;
  try { console.error(`  [viewReady] ${P.name} page: the chat view of ${sid} is not there at the bound — the cause, as the two pages read it:\n    ` + JSON.stringify(await causeOf(sid))); } catch (e) { console.error(`  [viewReady] the cause could not be read: ${e && e.message}`); }
  throw new Error(`${P.name || 'a'} page: the chat view of ${sid} never carried its chat input`);
};
// installed once a page's app is ready: the window closes, the views leaving, the layout records applied — each with its caller's frames
const CAUSE_WATCH = `(() => { if (window.__dfCause) return true; const W = window.__dfCause = { closes: [], gone: [], applied: [] };
  const ring = (a, x) => { a.push(x); if (a.length > 30) a.shift(); }, by = () => String(new Error().stack || '').split('\\n').slice(3, 8).map((l) => l.trim());
  const wm = app.wm, close = wm.closeWindow.bind(wm);
  wm.closeWindow = function (id) { const w = wm.windows.get(id); ring(W.closes, { at: Date.now(), id, type: w && w.type, srv: (w && w._openSpec && (w._openSpec.serverId || w._openSpec.sessionId)) || null, by: by() }); return close(id); };
  const S = app.sessions, del = S.delete.bind(S), set = S.set.bind(S);
  S.delete = (k) => { const v = S.get(k); ring(W.gone, { at: Date.now(), win: k, sid: (v && v.sessionId) || null, how: 'deleted', by: by() }); return del(k); };
  S.set = (k, v) => { const was = S.get(k); if (was && was !== v) ring(W.gone, { at: Date.now(), win: k, sid: was.sessionId || null, how: 'replaced', by: by() }); return set(k, v); };
  const lm = app.layoutManager, apply = lm._handleRemoteSync.bind(lm);
  lm._handleRemoteSync = function (msg) { const ws = (msg && msg.state && Array.isArray(msg.state.windows)) ? msg.state.windows : []; ring(W.applied, { at: Date.now(), seq: (msg && msg.seq) || null, desktopId: (msg && msg.desktopId) || null, resync: !!(msg && msg.resync), windows: ws.map((x) => (x && x.openSpec && (x.openSpec.serverId || x.openSpec.sessionId)) || (x && x.type) || '?') }); return apply(msg); };
  return true; })()`;
// the cause, read off both pages at the bound: each page's windows and view, its closes / views gone / records applied (with the SENDER
// of each record named by the seq the server acked to that page), and the layout guards' state (seq, user-dirty, the gates)
async function causeOf(sid) {
  const pageFacts = (P) => P.evalJs(`(() => { const W = window.__dfCause || {}, lm = app.layoutManager || {};
    return { windows: [...app.wm.windows.values()].map((w) => ({ id: w.id, type: w.type, srv: (w._openSpec && (w._openSpec.serverId || w._openSpec.sessionId)) || null, desktop: w._desktopId || null, hidden: !!w._hiddenByDesktop })),
      view: !!(${V(sid)}), closes: W.closes || [], gone: W.gone || [], applied: W.applied || [],
      guards: { lastRemoteSeq: lm._lastRemoteSeq ?? null, userDirty: lm._userDirty ?? null, lastUserInputAt: lm._lastUserInputAt ?? null, restoring: lm._restoring ?? null, pointerDown: lm._pointerDown ?? null, pendingRemote: lm._pendingRemote ? lm._pendingRemote.size : null } }; })()`);
  const senderOf = (seq) => seq == null ? null : (A.acks.some((a) => a.seq === seq) ? 'A' : B.acks.some((a) => a.seq === seq) ? 'B' : 'another client');
  const out = { now: Date.now(), sid };
  for (const P of [A, B]) {
    out[P.name] = { ...(await pageFacts(P)), received: P.layoutIn.map((f) => ({ ...f, from: senderOf(f.seq), carriesSid: f.windows.includes(sid) })), sentSaves: P.layoutOut.slice(-8).map((f) => ({ ...f, carriesSid: f.windows.includes(sid) })) };
    out[P.name].applied = out[P.name].applied.map((f) => ({ ...f, from: senderOf(f.seq), carriesSid: f.windows.includes(sid) }));
  }
  return out;
}
const box = async (P, sid) => { await viewReady(P, sid); return P.evalJs(`${CI(sid)}._textarea.value`); };
const held = async (P, sid) => { await viewReady(P, sid); return P.evalJs(`${CI(sid)}._heldDraft`); };
const activeIsBox = async (P, sid) => { await viewReady(P, sid); return P.evalJs(`document.activeElement === ${CI(sid)}._textarea && document.hasFocus()`); };
const focusBox = async (P, sid) => { await viewReady(P, sid); return P.evalJs(`${CI(sid)}._textarea.focus(); true`); };
const blurBox = async (P, sid) => { await viewReady(P, sid); return P.evalJs(`${CI(sid)}._textarea.blur(); true`); };
const typeChar = (P, ch) => P.cdp('Input.insertText', { text: ch });
const replaceBox = async (P, sid, text) => { await viewReady(P, sid); await P.evalJs(`${CI(sid)}._textarea.select(); true`); await P.cdp('Input.insertText', { text }); };
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
// THE NEW CONVERSATION BY SNAPSHOT (r1759, box row 131: «the first one not in a list» picked ⑤'s conversation and an older one for the
// red controls — their lists never named ⑤'s): the session ids on A BEFORE the create; the new one is the one not among them
const sessionIdsOn = (P) => P.evalJs('[...app.sessions.values()].map((v) => v && v.sessionId).filter(Boolean)');
async function newSessionAfter(before) {
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { sid = await A.evalJs(`([...app.sessions.values()].find((v) => v && v._messageList && v.sessionId && !${JSON.stringify(before)}.includes(v.sessionId))?.sessionId) || null`); if (!sid) await sleep(250); }
  return sid;
}
async function openChat(name, not = []) {
  const before = [...new Set([...(await sessionIdsOn(A)), ...not])];
  await A.evalJs(`app.createSession({ cwd: ${JSON.stringify(CWD)}, name: ${JSON.stringify(name)}, mode: 'chat', backend: 'antigravity' }); true`);
  const sid = await newSessionAfter(before);
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
const patchBase = async (pages, sid) => { for (const P of pages) { await viewReady(P, sid); await P.evalJs(`${CI(sid)}._landDraft = ${BASE_LAND}; true`); } };
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
  for (const P of [A, B]) await P.evalJs(CAUSE_WATCH);   // r350: what closes a window or takes a view away is kept, for the bound to print
  await sleep(600);

  console.log('① A focused and typing while B saves a draft: A\'s box keeps A\'s text, and A\'s text is what is sent');
  const sid = await openChat('draft-focus');
  check('one Antigravity chat open on BOTH pages (two windows, both focus-emulated), the fake agy started behind the real wrapper', !!sid && gateOf(agyStarted(sid)) && !!(await B.evalJs(`!!(${V(sid)})?._chatInput`)), { sid });
  // r350: the bound's cause print is READ here once, in a healthy moment — it must come back from BOTH pages with their windows, the
  // conversation's view, the layout guards and the wire (a print that cannot read is no placement when the red comes)
  { const c0 = await causeOf(sid).catch((e) => ({ error: String(e && e.message) }));
    check('r350: the cause the bound prints reads both pages — each page\'s windows and the conversation\'s view, its closes / views gone / records applied, the layout guards, the frames off the wire',
      !!c0.A && !!c0.B && c0.A.view === true && c0.B.view === true && gateOf(Array.isArray(c0.A.windows)) && gateOf(c0.A.windows.some((w) => w.srv === sid)) && !!c0.B.guards && 'lastRemoteSeq' in c0.B.guards && gateOf(Array.isArray(c0.B.received)) && verdictOf(Array.isArray(c0.A.gone)),
      c0.error ? c0 : { A: { windows: c0.A.windows.length, guards: c0.A.guards }, B: { windows: c0.B.windows.length, guards: c0.B.guards, received: c0.B.received.length } }); }
  const r1 = await legTyping(sid, 'draft-focus');
  check(`A's box holds exactly what A typed (B's «oko» then «k» both saved while A typed: B sent ${JSON.stringify(r1.bSaves)})`, gateOf(r1.focusedBoth) && r1.a === A_TEXT && r1.b === 'okok' && gateOf(Array.isArray(r1.bSaves)) && gateOf(r1.bSaves.includes('oko')) && verdictOf(r1.bSaves.includes('okok')), r1);
  check('…and every drafts set A sent is a prefix of what A typed (A never saved B\'s characters)', r1.aSent.length > 0 && verdictOf(r1.aSent.every((v) => v === '' || A_TEXT.startsWith(v))), r1.aSent);
  check(`Enter on A ⇒ the agent READ exactly «${A_TEXT}»`, r1.read === A_TEXT && verdictOf(r1.cleared), { read: r1.read, cleared: r1.cleared, reads: agyRead(sid) });
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
  check('A focused, empty box: B\'s draft is HELD (the box stays empty)', gateOf(r2.aFocused) && r2.aBox === '' && r2.aHeld === 'draft typed on B', r2);
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
    // r1534 (box row 98: the control's click sent NOTHING — the box still full 15 s later): what the press and the release hit, and
    // whether Send took the click — printed, and the press ON Send asserted as the premise of both runs
    await A.evalJs(`(() => { const btn = ${CI(s)}.element.querySelector('.chat-send-btn'); window.__dfPress = { clicked: false }; window.__dfHit = (x, y) => { const el = document.elementFromPoint(x, y); if (!el) return null; if (el === btn || btn.contains(el)) return 'SEND'; const w = el.closest && el.closest('[id^="win-"]'); return el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '') + (w ? ' in ' + w.id : ''); }; btn.addEventListener('click', () => { window.__dfPress.clicked = true; }, { once: true, capture: true }); return true; })()`);
    const hitAt = () => A.evalJs(`window.__dfHit(${rect.x}, ${rect.y})`);
    const press = { down: await hitAt() };
    await A.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await A.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(250);                                                                          // a person's press lasts
    const duringPress = await box(A, s);
    press.up = await hitAt();
    await A.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', buttons: 0, clickCount: 1 });
    press.clicked = await A.evalJs('window.__dfPress.clicked === true');
    const read = await until(() => readSince(s, reads0), 15000);
    await sleep(400);
    press.reads = agyRead(s).slice(reads0);
    return { before, duringPress, press, read, after: await box(A, s), heldAfter: await held(A, s) };
  }
  const r3 = await legPress(sid, 'draft-focus');
  check('A typed «hello» (saved, still focused); B continued it to «hello world» ⇒ HELD in A\'s box', r3.before.a === 'hello' && r3.before.held === 'hello world' && gateOf(r3.before.focused) && r3.before.bTook === 'hello', r3.before);
  check(`a real press on Send (the press ON Send: ${r3.press.down}) blurs A's box, the held draft does NOT land during the press, and the click SENDS «hello» — what A typed`, r3.press.down === 'SEND' && r3.duringPress === 'hello' && r3.read === 'hello', r3);
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
    check(`interleaved every ${gap} ms: 0 of 16 characters lost — A «${r4.a}», B «${r4.b}»; each page saved only its own characters (A ${JSON.stringify(r4.aSent)}, B ${JSON.stringify(r4.bSent)})`, r4.a === 'aaaaaaaa' && r4.b === 'bbbbbbbb' && verdictOf(r4.ownOnly), r4);
  }

  console.log('⑤ B-1d87: one conversation opened on both devices in the same seconds — B\'s window stands and takes A\'s id while B types');
  // the window(s) of conversation `s` on page P: the first one's id and its mark (the element this leg marked), and how many there are
  const winsOf = (P, s) => P.evalJs(`(() => { const ws = [...app.wm.windows.values()].filter((x) => x._openSpec && x._openSpec.serverId === ${JSON.stringify(s)}); return { n: ws.length, id: ws[0] ? ws[0].id : null, mark: ws[0] ? (ws[0].element.dataset.df1d87 || null) : null }; })()`);
  async function legStands(name, not, { release = false } = {}) {
    // B's GATE (the print: B's apply waited 2.8 s): A's record and B's own save wait under it — the release's apply patched in for the control.
    // HELD BY THE LEG ALONE (r1534, box row 98: a plain `_restoring = true` was opened by the apply-before's 1 s cooldown timer — A's first
    // record then BUILT B's window before B opened the conversation, the control's premise never formed): the timer's write is kept, never read
    await B.evalJs(`(() => { const lm = app.layoutManager; let v = true; window.__df1d87Gate = true; Object.defineProperty(lm, '_restoring', { configurable: true, enumerable: true, get: () => window.__df1d87Gate === true || v, set: (x) => { v = x; } }); ${release ? 'app.desktopManager.takeRowsShown = () => ({ rekeyed: [], stands: [] });' : ''} return true; })()`);
    const before = [...new Set([...(await sessionIdsOn(A)), ...not])];
    await A.evalJs(`app.createSession({ cwd: ${JSON.stringify(CWD)}, name: ${JSON.stringify(name)}, mode: 'chat', backend: 'antigravity' }); true`);
    const s = await newSessionAfter(before);
    await until(() => s && agyStarted(s), 15000);
    await B.evalJs(`app.attachSession(${JSON.stringify(s)}, ${JSON.stringify(name)}, ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'antigravity' }); true`); // B's person opens it (its sidebar row)
    await viewReady(B, s);
    const a1 = (await winsOf(A, s)).id;
    const carried = await B.waitFor(`[...app.layoutManager._pendingRemote.values()].some((m) => (m.state?.windows || []).some((w) => (w.winId || w.id) === ${JSON.stringify(a1)}))`, 15000); // A's record naming its window waits on B
    const b0 = await winsOf(B, s);
    // THE PREMISE, asserted by both runs before the law is judged: B shows the conversation in ITS OWN window (one, an id that is not A's)
    // while A's record waits — the record has built nothing on B
    const premise = b0.n === 1 && !!b0.id && b0.id !== a1 && carried === true;
    await B.evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(b0.id)}); w.element.dataset.df1d87 = '1'; return true; })()`);
    await focusBox(B, s);
    for (const ch of 'ab') { await typeChar(B, ch); await sleep(80); }
    const boxNow = () => B.evalJs(`(() => { const v = ${V(s)}, ta = v && v._chatInput && v._chatInput._textarea; return ta ? ta.value : null; })()`);
    await B.cdp('Input.imeSetComposition', { text: '退', selectionStart: 1, selectionEnd: 1 });   // a composition in progress…
    const preApply = await boxNow();
    await B.evalJs('window.__df1d87Gate = false; app.layoutManager._restoring = false; true');      // …when the gate opens: the record applies now
    const applied = await B.waitFor('app.layoutManager._pendingRemote.size === 0', 10000);          // (a CONDITION — r1377 (5): the record applied, never a fixed sleep)
    const midApply = await boxNow();                                                                  // the composition still in the box after the apply
    await B.cdp('Input.imeSetComposition', { text: '退款', selectionStart: 2, selectionEnd: 2 });
    await sleep(150);
    await B.cdp('Input.insertText', { text: '退款' });                                               // the composition committed
    for (const ch of 'cd') { await typeChar(B, ch); await sleep(80); }
    // the end, on a CONDITION: the box holds every character — or the window of the conversation is gone (the control's harm)
    await B.waitFor(`(() => { const ws = [...app.wm.windows.values()].filter((x) => x._openSpec && x._openSpec.serverId === ${JSON.stringify(s)}); if (!ws.length) return true; const v = ${V(s)}, ta = v && v._chatInput && v._chatInput._textarea; return !!ta && ta.value === 'ab退款cd'; })()`, 8000);
    const b1 = await winsOf(B, s);
    const out = { s, a1, carried, premise, applied, preApply, midApply, before: b0, after: b1 };
    if (b1.n) Object.assign(out, await B.evalJs(`(() => { const ci = ${CI(s)}, ta = ci && ci._textarea; return { value: ta ? ta.value : null, focused: !!ta && document.activeElement === ta && document.hasFocus(), caret: ta ? ta.selectionStart : null }; })()`));
    await B.evalJs('(() => { delete app.desktopManager.takeRowsShown; window.__df1d87Gate = false; const lm = app.layoutManager; delete lm._restoring; lm._restoring = false; return true; })()');
    return out;
  }
  const r5 = await legStands('draft-focus-stands', [sid]);
  check(`B opened the conversation before A's record reached it; the record applied WHILE B typed: B's window STANDS — the same element, now under A's id (${r5.before.id} → ${r5.after.id}), one window of it on B`,
    gateOf(r5.premise) && gateOf(r5.carried) && r5.before.id !== r5.a1 && r5.after.n === 1 && r5.after.id === r5.a1 && r5.after.mark === '1', r5);
  check(`…nothing was lost under B's hands: the composition «退» was in the box when the record applied (${JSON.stringify(r5.preApply)} → ${JSON.stringify(r5.midApply)}); the box holds «${r5.value}» (every character, the composition committed), focused, the caret at its end`,
    r5.applied === true && r5.preApply === 'ab退' && r5.midApply === 'ab退' && r5.value === 'ab退款cd' && r5.focused === true && r5.caret === 'ab退款cd'.length, r5);

  console.log('RED CONTROLS — the 2.369.354 landing (the box overwritten) in a second conversation; a judge at the blur in a third');
  const sid2 = await openChat('draft-focus-base', [sid]);
  const c1 = await legTyping(sid2, 'draft-focus-base', { base: [A] });
  check(`RED CONTROL ①: the overwriting composer — A's focused box became «${c1.a}» and the agent READ «${c1.read}», not «${A_TEXT}»`, c1.a !== A_TEXT && c1.read !== A_TEXT && verdictOf(/o/.test(c1.read || '')), c1);
  await replied(A, sid2, 1);
  for (const gap of [120, 200]) {
    const c4 = await legInterleave(sid2, 'draft-focus-base', gap, { base: [A, B] });
    check(`RED CONTROL ④ at ${gap} ms: ${c4.lost} of 16 characters lost (A «${c4.a}», B «${c4.b}»)${c4.ownOnly ? '' : ', a page saved the other\'s characters'}`, c4.lost > 0, c4);
  }
  const sid3 = await openChat('draft-focus-blur', [sid, sid2]);
  const c3 = await legPress(sid3, 'draft-focus-blur', { judgeAtBlur: true });
  check(`RED CONTROL ③: judged AT the blur (the press ON Send: ${c3.press.down}; released on ${c3.press.up}; Send took the click: ${c3.press.clicked}), the held «hello world» lands during the press («${c3.duringPress}») and the click sends «${c3.read}» — not what A typed`, c3.press.down === 'SEND' && c3.before.held === 'hello world' && c3.read === 'hello world', c3);
  const c5 = await legStands('draft-focus-stands-base', [sid, sid2, sid3, r5.s], { release: true });
  check(`RED CONTROL ⑤ (B-1d87): B's page with the release's apply (nothing taken) — its premise formed (B's own window ${c5.before.id}, not A's ${c5.a1}: ${c5.premise}), and the record CLOSED B's window of the conversation and nothing opened it (${c5.after.n} window of it on B)`, gateOf(c5.premise) && gateOf(c5.carried) && c5.applied === true && c5.after.n === 0, c5);
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++; console.error('✗ threw: ' + (e && e.stack || e));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
