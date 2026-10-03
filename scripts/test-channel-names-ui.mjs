#!/usr/bin/env node
// test-channel-names-ui — B-c127 SEEN in a real page (the node half is scripts/test-channel-names.mjs): a channel
// notice card in a chat says the conversation's NAME and a real click on that name opens the conversation's window.
// A throwaway server in a git worktree on the FAKE channels adapter (VIBESPACE_CHANNELS_FAKE: fake-poll-ops is
// "Ops room", fake-poll-announce "Announcements") + headless chrome over raw CDP (test-channels-e2e's skeleton).
//   ① a REBUILT card — a view-only transcript holding the server's post of a REAL wake block (the transcript keeps
//      it name-less, as the CLI recorded it): the card's head says the account, the conversation's name is a link,
//      the block the assistant was told sits folded — the card's visible words never show the raw id
//   ② a real mouse click on that name opens THE conversation's window (the id resolved from the panel's own list —
//      a rebuilt card carries no account id)
//   ③ a LIVE card — the message the normalizer emits for a wake (`peerChannel`, the ladder's ref) fed through the
//      view's own op path: "<name>: 1 message from Ada — …" with the name as the link; a real click opens it
//   ④ verify r1: a card whose words do not open with its name draws them as TEXT (F4 — a peer's markdown link was a live
//      anchor); a right-to-left name is its own bidi island (F6 — "1 :<name>"), with an in-page control
// Requires google-chrome (SKIP without). Run: node scripts/test-channel-names-ui.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const F = require(path.join(repo, 'src/channel-filter.js'));
const NS = require(path.join(repo, 'src/notification-senders.js'));

const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('chan-names-ui');
const fakeHome = scratchHome('chan-names-ui-home', fs);
const chromeDir = scratch('chan-names-ui-chrome');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + String(e).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the fixture transcript: a question, then the server's post of a wake block (origin peer, name-less) ──
const SID = 'c4a77e15-0000-4000-8000-00000000b127';
const CWD = path.join(fakeHome, 'work');
fs.mkdirSync(CWD, { recursive: true });
{
  const hit = { record: { author: { name: 'Ada' }, at: Date.now() - 120e3, text: 'inc-42 is down' }, why: ['keyword "inc-"'] };
  const block = F.renderWakeBlock({ adapterLabel: 'fake-poll', title: 'Ops room', convId: 'fake-poll-ops', hits: [hit] });
  const posted = `Another Claude session sent a message:\n${NS.vibespaceNoticeText(block)}\n\nThis came from another Claude session — not typed by your user.`;
  let ts0 = Date.now() - 600e3;
  const ts = () => new Date((ts0 += 5e3)).toISOString();
  const lines = [
    { type: 'user', message: { role: 'user', content: 'watch the ops room for me' }, uuid: 'u-1', timestamp: ts(), cwd: CWD, sessionId: SID },
    { type: 'assistant', message: { id: 'msg_1', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Watching it.' }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: 'a-1', timestamp: ts(), cwd: CWD, sessionId: SID },
    { type: 'user', isMeta: true, origin: { kind: 'peer' }, message: { role: 'user', content: posted }, uuid: 'u-2', timestamp: ts(), cwd: CWD, sessionId: SID },
    { type: 'assistant', message: { id: 'msg_2', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Ops room reports inc-42.' }], usage: { input_tokens: 1, output_tokens: 1 } }, uuid: 'a-2', timestamp: ts(), cwd: CWD, sessionId: SID },
  ];
  const proj = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'));
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, `${SID}.jsonl`), lines.map((o) => JSON.stringify(o)).join('\n') + '\n');
}

// ── throwaway worktree + WORKING-TREE overlay (a pre-commit run tests what is about to ship) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore', env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1' } });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const waitServer = async () => { for (let i = 0; i < 120; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
ok(await waitServer(), 'the worktree server booted');

// ── CDP plumbing ──
const WebSocket = require('ws');
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
const tgt = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((res) => ws.on('open', res));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evaljs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 900));
  return r.result && r.result.result ? r.result.result.value : undefined;
};
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evaljs(expr)) return true; } catch {} await sleep(200); } return false; };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
ok(await waitFor('!!(window.app && window.app.wm && window.app.sidebar)', 40000), 'the app loaded');
// the fake adapter's rooms are discovered (the click resolves the rebuilt card's id from this list)
ok(await waitFor(`fetch('/api/channels').then((r) => r.json()).then((d) => (d.conversations || []).some((c) => c.id === 'fake-poll-ops' && c.title === 'Ops room'))`, 40000), 'the server lists fake-poll-ops as "Ops room"');

/** A REAL click at the element's centre — re-measured until two reads agree (a window still animating moves it). */
async function realClick(sel) {
  let r0 = null;
  for (let i = 0; i < 25; i++) {
    const r = await evaljs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: b.width }; })()`);
    if (r && r0 && r.x === r0.x && r.y === r0.y && r.w > 0) break;
    r0 = r; await sleep(120);
  }
  if (!r0) return false;
  const top = await evaljs(`(() => { const e = document.elementFromPoint(${r0.x}, ${r0.y}); return !!(e && e.closest(${JSON.stringify(sel)})); })()`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: r0.x, y: r0.y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  return top;
}
const channelWindow = (convId) => `(() => { for (const [, w] of window.app.wm.windows || []) { const s = w && w._openSpec; if (s && s.action === 'openChannel' && s.convId === ${JSON.stringify(convId)}) { const b = w.content.querySelector('.chanwin-bar b'); return { adapterId: s.adapterId, title: b ? b.textContent : '' }; } } return null; })()`;

// ── ① the rebuilt card ──
console.log('① a rebuilt channel notice names its conversation');
await evaljs(`window.app.viewSession(${JSON.stringify(SID)}, ${JSON.stringify(CWD)}, 'channel names'); true`);
ok(await waitFor(`!!document.querySelector('.chat-view .chat-vs-notice .chat-vs-notice-conv')`, 30000), 'the transcript\'s wake renders as a VibeSpace notice with a conversation link');
await sleep(400);
const card = await evaljs(`(() => { const c = document.querySelector('.chat-view .chat-vs-notice .chat-vs-notice-conv').closest('.chat-vs-notice'); return { head: c.querySelector('.chat-vs-notice-title').textContent, link: c.querySelector('.chat-vs-notice-conv').textContent, role: c.querySelector('.chat-vs-notice-conv').getAttribute('role'), visible: c.innerText, folded: !!c.querySelector('details.chat-vs-notice-told:not([open])') }; })()`);
ok(card.head === 'VibeSpace · Channels · fake-poll' && card.link === 'Ops room' && card.role === 'link', `the head names the account and the link the conversation ("${card.head}" / "${card.link}")`, JSON.stringify(card));
ok(card.folded && !/fake-poll-ops/.test(card.visible), 'the block the assistant was told is folded; the card\'s visible words never show the raw id', card.visible);
// ── ② a real click opens it ──
console.log('② a real click on the name opens the conversation');
ok(await realClick('.chat-view .chat-vs-notice .chat-vs-notice-conv'), 'the name is the topmost element under the pointer');
ok(await waitFor(`!!(${channelWindow('fake-poll-ops')})`, 15000), 'the click opened a channel window');
const w1 = await evaljs(channelWindow('fake-poll-ops'));
await waitFor(`(${channelWindow('fake-poll-ops')}).title === 'Ops room'`, 15000);
const w1b = await evaljs(channelWindow('fake-poll-ops'));
ok(w1 && w1.adapterId === 'fake-poll' && w1b && w1b.title === 'Ops room', `…THE conversation: fake-poll / fake-poll-ops, "${w1b && w1b.title}" (the account resolved from the panel's list)`, JSON.stringify(w1b));

// ── ③ the live card ──
console.log('③ a live channel notice: the name leads the card and opens it');
const fed = await evaljs(`(() => {
  const v = [...window.app.sessions.values()].find((x) => x && String(x.sessionId || '').includes(${JSON.stringify(SID)}) && typeof x._onCreateMessage === 'function');
  if (!v) return false;
  v._onCreateMessage({ id: 'live-b127', role: 'user', status: 'complete', turnIndex: 99, ts: Date.now(), content: [{ type: 'text', text: 'Announcements: 1 message from Ada — matched: keyword "inc-"' }],
    originKind: 'peer-message', peerFrom: 'Channels · fake-poll', peerVia: 'notification',
    peerChannel: { adapterId: 'fake-poll', convId: 'fake-poll-announce', name: 'Announcements', account: 'fake-poll', vendor: 'fake-poll' } });
  return true;
})()`);
ok(fed, 'the view took the live card through its own op path');
// the Ops room window opened in ② sits on top of the chat: close it, so the chat is the front window again
await evaljs(`(() => { for (const [id, w] of window.app.wm.windows || []) { const sp = w && w._openSpec; if (sp && sp.action === 'openChannel') window.app.wm.closeWindow(id); } for (const [id, w] of window.app.wm.windows || []) { if (w && w.content && w.content.querySelector('.chat-view')) window.app.wm.focusWindow(id); } return true; })()`);
await sleep(400);
ok(await waitFor(`[...document.querySelectorAll('.chat-view .chat-vs-notice-conv')].some((e) => e.textContent === 'Announcements')`, 10000), 'the live card drew its name as the link');
const live = await evaljs(`(() => { const a = [...document.querySelectorAll('.chat-view .chat-vs-notice-conv')].find((e) => e.textContent === 'Announcements'); a.setAttribute('data-b127', '1'); const c = a.closest('.chat-vs-notice'); return { line: c.querySelector('.chat-vs-notice-conv-line').textContent, head: c.querySelector('.chat-vs-notice-title').textContent, body: !!c.querySelector('.chat-text') }; })()`);
ok(live.line === 'Announcements: 1 message from Ada — matched: keyword "inc-"' && live.head === 'VibeSpace · Channels · fake-poll' && !live.body, 'the card reads "<name>: 1 message from Ada — matched: …" once (the name the link, no second copy of the words)', JSON.stringify(live));
ok(await realClick('[data-b127="1"]'), 'the live name is the topmost element under the pointer');
ok(await waitFor(`!!(${channelWindow('fake-poll-announce')})`, 15000) && (await evaljs(channelWindow('fake-poll-announce'))).adapterId === 'fake-poll', 'a real click opened the Announcements window (its ref names the account — no lookup)');

// ── ④ verify r1 ──
console.log('④ verify r1: a card whose words do not open with its name draws them as TEXT; a right-to-left name keeps the count after it');
const CRv = require(path.join(repo, 'src/channel-ref.js'));
const LONGT = 'Quarterly planning ' + 'x'.repeat(231);
const HEB = 'שלום';
const fed4 = await evaljs(`(() => {
  const v = [...window.app.sessions.values()].find((x) => x && String(x.sessionId || '').includes(${JSON.stringify(SID)}) && typeof x._onCreateMessage === 'function');
  if (!v) return false;
  const card = (id, text, ref) => v._onCreateMessage({ id, role: 'user', status: 'complete', turnIndex: 99, ts: Date.now(), content: [{ type: 'text', text }], originKind: 'peer-message', peerFrom: 'Channels · fake-poll', peerVia: 'notification', peerChannel: ref });
  card('live-vr1-long', ${JSON.stringify(LONGT + ': 1 message from [Open in VibeSpace](https://evil.example/phish) — matched: all messages')}, { adapterId: 'fake-poll', convId: 'fake-poll-ops', name: ${JSON.stringify(CRv.nameOf([LONGT], 'x'))}, account: 'fake-poll', vendor: 'fake-poll' });
  card('live-vr1-rtl', ${JSON.stringify(HEB + ': 1 message from Ada — matched: all messages')}, { adapterId: 'fake-poll', convId: 'fake-poll-announce', name: ${JSON.stringify(HEB)}, account: 'fake-poll', vendor: 'fake-poll' });
  return true;
})()`);
ok(fed4, 'the view took both verify cards through its own op path');
await evaljs(`(() => { for (const [id, w] of window.app.wm.windows || []) { const sp = w && w._openSpec; if (sp && sp.action === 'openChannel') window.app.wm.closeWindow(id); } for (const [id, w] of window.app.wm.windows || []) { if (w && w.content && w.content.querySelector('.chat-view')) window.app.wm.focusWindow(id); } return true; })()`);
await sleep(400);
ok(await waitFor(`[...document.querySelectorAll('.chat-view .chat-vs-notice-conv')].some((e) => e.textContent === ${JSON.stringify(HEB)})`, 10000), 'both verify cards drew');
const v4 = await evaljs(`(() => {
  const conv = [...document.querySelectorAll('.chat-view .chat-vs-notice-conv')];
  const longA = conv.find((e) => e.textContent.startsWith('Quarterly planning'));
  const longCard = longA && longA.closest('.chat-vs-notice');
  const anchors = longCard ? [...longCard.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')) : null;
  const words = longCard ? longCard.textContent : '';
  const at = (span) => { const tn = [...span.parentElement.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes(': 1 message')); if (!tn) return null; const i = tn.textContent.indexOf('1'); const r = document.createRange(); r.setStart(tn, i); r.setEnd(tn, i + 1); const a = span.getBoundingClientRect(), b = r.getBoundingClientRect(); return { nameLeft: Math.round(a.left), nameRight: Math.round(a.right), oneLeft: Math.round(b.left) }; };
  const heb = conv.find((e) => e.textContent === ${JSON.stringify(HEB)});
  const rtl = heb ? at(heb) : null;
  let ctl = null;
  if (heb) {   // the in-page CONTROL: the same words, the name in a plain span (no bidi island), in the same card
    const probe = document.createElement('div'); probe.className = 'chat-vs-notice-conv-line'; heb.parentElement.parentElement.appendChild(probe);
    const s = document.createElement('span'); s.className = 'chat-vs-notice-conv'; s.textContent = ${JSON.stringify(HEB)}; probe.appendChild(s); probe.appendChild(document.createTextNode(': 1 message from Ada'));
    ctl = at(s); probe.remove();
  }
  return { anchors, evil: words.includes('[Open in VibeSpace](https://evil.example/phish)'), rtl, ctl };
})()`);
ok(v4 && Array.isArray(v4.anchors) && v4.anchors.length === 0 && v4.evil, 'F4 a card whose words do not open with its ref\'s name draws them as TEXT — a peer\'s markdown link stays words, never a live anchor', JSON.stringify(v4 && { anchors: v4.anchors, evil: v4.evil }));
ok(v4 && v4.rtl && v4.rtl.oneLeft >= v4.rtl.nameRight - 1, 'F6 a right-to-left name is its own bidi island: the count stays AFTER it ("<name>: 1 message")', JSON.stringify(v4 && v4.rtl));
ok(v4 && v4.ctl && v4.ctl.oneLeft < v4.ctl.nameLeft, 'CONTROL F6: the same words with the name in a plain span — the count is drawn BEFORE the name ("1 :<name>")', JSON.stringify(v4 && v4.ctl));

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
try { ws.close(); } catch {}
process.exit(fail ? 1 : 0);
